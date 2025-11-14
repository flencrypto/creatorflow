import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { generateContentWithFallback } from '../lib/openai.js';

function buildResponse(body, { status = 200, headers = {} } = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('falls back to Responses API when chat completions return 405', async () => {
  const fetchMock = mock.fn(async (url) => {
    if (url.includes('/chat/completions')) {
      return buildResponse({ error: { message: 'Method not allowed' } }, { status: 405 });
    }

    if (url.includes('/responses')) {
      return buildResponse({
        output: [
          {
            content: [
              { type: 'output_text', text: 'Fallback content from responses' },
            ],
          },
        ],
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  });
  const logger = { warn: mock.fn() };

  const result = await generateContentWithFallback({
    apiKey: 'test-key',
    prompt: 'example prompt',
    fetch: fetchMock,
    logger,
  });

  assert.equal(result, 'Fallback content from responses');
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(logger.warn.mock.callCount(), 1);
});

test('falls back to Responses API when chat completions hint to switch endpoints', async () => {
  const fetchMock = mock.fn(async (url) => {
    if (url.includes('/chat/completions')) {
      return buildResponse(
        { error: { message: 'Please use the Responses API instead.' } },
        { status: 400 }
      );
    }

    if (url.includes('/responses')) {
      return buildResponse({ output_text: 'Handled by responses API' });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  const result = await generateContentWithFallback({
    apiKey: 'test-key',
    prompt: 'prompt',
    fetch: fetchMock,
    logger: { warn: () => {} },
  });

  assert.equal(result, 'Handled by responses API');
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('throws when both chat completions and responses fail', async () => {
  const fetchMock = mock.fn(async (url) => {
    if (url.includes('/chat/completions')) {
      return buildResponse({ error: { message: 'Method not allowed' } }, { status: 405 });
    }

    if (url.includes('/responses')) {
      return buildResponse({ error: { message: 'Bad request' } }, { status: 400 });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  await assert.rejects(
    generateContentWithFallback({
      apiKey: 'test-key',
      prompt: 'prompt',
      fetch: fetchMock,
      logger: { warn: () => {} },
    }),
    { message: /responses call failed/i }
  );
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('parses output_text field from responses payload', async () => {
  const fetchMock = mock.fn(async (url) => {
    if (url.includes('/chat/completions')) {
      return buildResponse({ error: { message: 'Use the Responses API' } }, { status: 400 });
    }

    if (url.includes('/responses')) {
      return buildResponse({ output_text: '  Trimmed response text  ' });
    }

    throw new Error(`Unexpected URL ${url}`);
  });

  const result = await generateContentWithFallback({
    apiKey: 'test-key',
    prompt: 'prompt',
    fetch: fetchMock,
    logger: { warn: () => {} },
  });

  assert.equal(result, 'Trimmed response text');
  assert.equal(fetchMock.mock.callCount(), 2);
});
