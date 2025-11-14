const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const DEFAULT_MODEL = 'gpt-4o-mini';
const SYSTEM_PROMPT = 'You are a helpful content generation assistant.';
const FALLBACK_ERROR_PATTERNS = [
  /use the responses api/i,
  /use the responses endpoint/i,
  /try the responses api/i,
];

class OpenAiRequestError extends Error {
  constructor(message, { status, body, shouldFallback = false } = {}) {
    super(message);
    this.name = 'OpenAiRequestError';
    this.status = status ?? null;
    this.body = body ?? null;
    this.shouldFallback = shouldFallback;
  }
}

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation must be provided.');
  }
}

function createTimeoutSignal(timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timeout),
  };
}

function shouldFallbackToResponses(status, body) {
  if (status === 404 || status === 405) {
    return true;
  }

  if (status === 400 && typeof body === 'string') {
    return FALLBACK_ERROR_PATTERNS.some((pattern) => pattern.test(body));
  }

  return false;
}

function normaliseResponseFormat(responseFormat) {
  if (!responseFormat) {
    return {};
  }

  return {
    response_format: { type: responseFormat },
  };
}

function extractTextFromResponsesPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const segments = [];

  if (Array.isArray(payload.output)) {
    for (const entry of payload.output) {
      const contentArray = entry?.content ?? entry?.items ?? [];
      if (Array.isArray(contentArray)) {
        for (const contentItem of contentArray) {
          if (typeof contentItem?.text === 'string') {
            segments.push(contentItem.text);
          }

          if (typeof contentItem?.value === 'string') {
            segments.push(contentItem.value);
          }
        }
      }
    }
  }

  if (segments.length === 0 && Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      const content = choice?.message?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part?.text === 'string') {
            segments.push(part.text);
          }
        }
      } else if (typeof content === 'string') {
        segments.push(content);
      }
    }
  }

  const joined = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return joined.length > 0 ? joined : null;
}

export function createOpenAiClient({ apiKey, fetch: fetchImpl = globalThis.fetch } = {}) {
  ensureFetch(fetchImpl);

  function ensureApiKey() {
    if (!apiKey) {
      throw new Error('OPEN_API_KEY not configured on server. Provide OPEN_API_KEY or OPEN_AI_KEY.');
    }
  }

  function buildAuthHeaders() {
    ensureApiKey();
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async function invokeChatCompletions({ prompt, temperature, maxTokens, responseFormat, timeoutMs }) {
    const { signal, dispose } = createTimeoutSignal(timeoutMs);

    try {
      const response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature,
          max_tokens: maxTokens,
          ...normaliseResponseFormat(responseFormat),
        }),
        signal,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        throw new OpenAiRequestError(
          `OpenAI chat completion failed: ${response.status}`,
          {
            status: response.status,
            body: responseBody,
            shouldFallback: shouldFallbackToResponses(response.status, responseBody),
          }
        );
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('AI API returned no content.');
      }

      return content;
    } finally {
      dispose();
    }
  }

  async function invokeResponses({ prompt, temperature, maxTokens, responseFormat, timeoutMs }) {
    const { signal, dispose } = createTimeoutSignal(timeoutMs);

    try {
      const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          input: [
            {
              role: 'system',
              content: [{ type: 'text', text: SYSTEM_PROMPT }],
            },
            {
              role: 'user',
              content: [{ type: 'text', text: prompt }],
            },
          ],
          temperature,
          ...(typeof maxTokens === 'number' ? { max_output_tokens: maxTokens } : {}),
          ...normaliseResponseFormat(responseFormat),
        }),
        signal,
      });

      const rawBody = await response.text().catch(() => '');

      if (!response.ok) {
        throw new OpenAiRequestError(`OpenAI responses call failed: ${response.status}`, {
          status: response.status,
          body: rawBody,
        });
      }

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch (error) {
        throw new Error('AI API returned malformed JSON payload.');
      }

      const content = extractTextFromResponsesPayload(payload);
      if (!content) {
        throw new Error('AI API returned no content.');
      }

      return content;
    } finally {
      dispose();
    }
  }

  async function generateContent(prompt, options = {}) {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Prompt must be a non-empty string.');
    }

    const { temperature = 0.7, maxTokens = 400, responseFormat = null, timeoutMs = 8000 } = options;

    try {
      return await invokeChatCompletions({
        prompt,
        temperature,
        maxTokens,
        responseFormat,
        timeoutMs,
      });
    } catch (error) {
      if (error instanceof OpenAiRequestError && error.shouldFallback) {
        console.warn(
          '[WARN] Falling back to OpenAI Responses API after chat completions failure.',
          {
            status: error.status,
          }
        );

        return await invokeResponses({
          prompt,
          temperature,
          maxTokens,
          responseFormat,
          timeoutMs,
        });
      }

      throw error;
    }
  }

  async function listModels({ limit = 50 } = {}) {
    const { signal, dispose } = createTimeoutSignal(6000);

    try {
      const response = await fetchImpl(`${OPENAI_MODELS_URL}?limit=${limit}`, {
        headers: buildAuthHeaders(),
        signal,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        throw new Error(`Failed to load models: ${response.status} - ${responseBody}`);
      }

      const payload = await response.json();
      return Array.isArray(payload?.data) ? payload.data : [];
    } finally {
      dispose();
    }
  }

  async function performHealthCheck() {
    await listModels({ limit: 1 });
  }

  return {
    generateContent,
    listModels,
    performHealthCheck,
  };
}

export { OpenAiRequestError };
