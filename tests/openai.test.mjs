import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { createOpenAiClient } from '../lib/openai.js';

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

  const client = createOpenAiClient({ apiKey: 'test-key', fetch: fetchMock });
  const result = await client.generateContent('example prompt');

  assert.equal(result, 'Fallback content from responses');
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

  const client = createOpenAiClient({ apiKey: 'test-key', fetch: fetchMock });

  await assert.rejects(client.generateContent('prompt'), {
    message: /responses call failed/i,
  });
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

  const client = createOpenAiClient({ apiKey: 'test-key', fetch: fetchMock });
  const result = await client.generateContent('prompt');

  assert.equal(result, 'Trimmed response text');
  assert.equal(fetchMock.mock.callCount(), 2);
});
