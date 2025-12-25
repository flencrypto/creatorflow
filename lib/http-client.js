const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.HTTP_TIMEOUT_MS ?? '8000', 10);
const DEFAULT_MAX_RETRIES = Number.parseInt(process.env.HTTP_MAX_RETRIES ?? '3', 10);
const DEFAULT_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 2_000;

function normalizeRetryCount(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_RETRIES;
  }

  const rounded = Math.max(0, Math.floor(value));
  return rounded;
}

function isRetryableStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildTimeoutSignal(timeoutMs, parentSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Request timed out'));
  }, timeoutMs);

  let parentAbortListener = null;

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason);
    } else {
      parentAbortListener = () => controller.abort(parentSignal.reason);
      parentSignal.addEventListener('abort', parentAbortListener, { once: true });
    }
  }

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeoutId);
      if (parentSignal && parentAbortListener) {
        parentSignal.removeEventListener('abort', parentAbortListener);
      }
    },
  };
}

function computeBackoffMs(attempt) {
  const exponential = Math.min(MAX_BACKOFF_MS, DEFAULT_BACKOFF_MS * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 120);
  return exponential + jitter;
}

async function cancelResponseBody(response) {
  if (!response?.body || typeof response.body.cancel !== 'function') {
    return;
  }

  try {
    await response.body.cancel();
  } catch (error) {
    // Best-effort cleanup to avoid leaking sockets on retry.
  }
}

export async function fetchWithRetry(
  url,
  options = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_MAX_RETRIES, fetch: fetchImpl } = {}
) {
  const maxRetries = normalizeRetryCount(retries);
  const fetchFn = typeof fetchImpl === 'function' ? fetchImpl : fetch;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const { signal, dispose } = buildTimeoutSignal(timeoutMs, options.signal);

    try {
      const response = await fetchFn(url, { ...options, signal });

      if (!isRetryableStatus(response.status) || attempt === maxRetries) {
        dispose();
        return response;
      }

      await cancelResponseBody(response);
    } catch (error) {
      const isAbort = error?.name === 'AbortError';
      if (isAbort || attempt === maxRetries) {
        dispose();
        throw error;
      }
    }

    dispose();
    await sleep(computeBackoffMs(attempt));
  }

  throw new Error('Exhausted retry attempts');
}

export async function readJsonResponse(response) {
  if (!response) {
    return null;
  }

  const text = await response.text().catch(() => '');
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}
