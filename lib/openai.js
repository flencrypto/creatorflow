const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o-mini';
const SYSTEM_PROMPT = 'You are a helpful content generation assistant.';
const FALLBACK_ERROR_PATTERNS = [
  /use the responses api/i,
  /use the responses endpoint/i,
  /try the responses api/i,
];

class OpenAiRequestError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'OpenAiRequestError';
    this.status = typeof status === 'number' ? status : null;
    this.body = typeof body === 'string' ? body : null;
  }
}

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation must be provided.');
  }
}

function ensurePrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt must be a non-empty string.');
  }
}

function ensureApiKey(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('OPEN_API_KEY not configured on server. Provide OPEN_API_KEY or OPEN_AI_KEY.');
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

function normaliseResponseFormat(responseFormat) {
  if (!responseFormat) {
    return {};
  }

  return { response_format: { type: responseFormat } };
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

function extractChatContent(payload) {
  const message = payload?.choices?.[0]?.message?.content;

  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  if (Array.isArray(message)) {
    const segments = message
      .map((entry) => (typeof entry?.text === 'string' ? entry.text.trim() : ''))
      .filter(Boolean);

    if (segments.length > 0) {
      return segments.join('\n').trim();
    }
  }

  return null;
}

function extractResponsesText(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const segments = [];

  if (Array.isArray(payload.output)) {
    for (const entry of payload.output) {
      const contentItems = entry?.content ?? entry?.items;
      if (!Array.isArray(contentItems)) {
        continue;
      }

      for (const item of contentItems) {
        if (typeof item?.text === 'string') {
          segments.push(item.text);
        }
        if (typeof item?.value === 'string') {
          segments.push(item.value);
        }
      }
    }
  }

  if (segments.length === 0 && Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      const content = choice?.message?.content;
      if (typeof content === 'string') {
        segments.push(content);
        continue;
      }

      if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part?.text === 'string') {
            segments.push(part.text);
          }
        }
      }
    }
  }

  const text = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return text.length > 0 ? text : null;
}

async function invokeChatCompletion({
  apiKey,
  prompt,
  temperature,
  maxTokens,
  responseFormat,
  timeoutMs,
  fetchImpl,
}) {
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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
      throw new OpenAiRequestError(`OpenAI chat completion failed: ${response.status}`, {
        status: response.status,
        body: responseBody,
      });
    }

    const payload = await response.json();
    const content = extractChatContent(payload);

    if (!content) {
      throw new Error('AI API returned no content.');
    }

    return content;
  } finally {
    dispose();
  }
}

async function invokeResponses({
  apiKey,
  prompt,
  temperature,
  maxTokens,
  responseFormat,
  timeoutMs,
  fetchImpl,
}) {
  const { signal, dispose } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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

    const content = extractResponsesText(payload);
    if (!content) {
      throw new Error('AI API returned no content.');
    }

    return content;
  } finally {
    dispose();
  }
}

export async function generateContentWithFallback({
  apiKey,
  prompt,
  temperature = 0.7,
  maxTokens = 400,
  responseFormat = null,
  timeoutMs = 8000,
  fetch: fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  ensureFetch(fetchImpl);
  ensureApiKey(apiKey);
  ensurePrompt(prompt);

  try {
    return await invokeChatCompletion({
      apiKey,
      prompt,
      temperature,
      maxTokens,
      responseFormat,
      timeoutMs,
      fetchImpl,
    });
  } catch (error) {
    if (error instanceof OpenAiRequestError && shouldFallbackToResponses(error.status, error.body)) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('[WARN] Falling back to OpenAI Responses API after chat completions failure.', {
          status: error.status,
        });
      }

      return await invokeResponses({
        apiKey,
        prompt,
        temperature,
        maxTokens,
        responseFormat,
        timeoutMs,
        fetchImpl,
      });
    }

    throw error;
  }
}

export { OpenAiRequestError };
