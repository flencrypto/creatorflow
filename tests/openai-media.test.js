import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImageGeneration,
  createVideoJob,
  downloadVideoContent,
} from '../lib/openai-media.js';

test('createVideoJob posts JSON payload when no file is provided', async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url: url.toString(), options };
    return {
      ok: true,
      status: 200,
      headers: { forEach: () => {} },
      text: async () => JSON.stringify({ id: 'video_123' }),
    };
  };

  const result = await createVideoJob({
    apiKey: 'test-key',
    prompt: 'A prompt',
    fetchImpl: fakeFetch,
    timeoutMs: 10,
  });

  assert.equal(result.id, 'video_123');
  assert.equal(captured.url, 'https://api.openai.com/v1/videos');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.prompt, 'A prompt');
});

test('createVideoJob sends multipart payload when input reference is present', async () => {
  let captured;
  const fakeFetch = async (_url, options) => {
    captured = options;
    return {
      ok: true,
      status: 200,
      headers: { forEach: () => {} },
      text: async () => JSON.stringify({ id: 'video_456' }),
    };
  };

  const buffer = Buffer.from('hello');
  await createVideoJob({
    apiKey: 'test-key',
    prompt: 'With reference',
    inputReference: { buffer, mimetype: 'image/png', filename: 'ref.png' },
    fetchImpl: fakeFetch,
    timeoutMs: 10,
  });

  assert.ok(captured.body instanceof FormData);
  assert.equal(captured.headers['Content-Type'], undefined);
});

test('downloadVideoContent returns buffer and response metadata', async () => {
  const fakeFetch = async () => {
    return {
      ok: true,
      status: 200,
      headers: {
        forEach: (fn) => {
          fn('video/mp4', 'content-type');
          fn('attachment; filename="video.mp4"', 'content-disposition');
        },
      },
      arrayBuffer: async () => new TextEncoder().encode('data').buffer,
    };
  };

  const result = await downloadVideoContent({
    apiKey: 'test-key',
    videoId: 'video_123',
    fetchImpl: fakeFetch,
    timeoutMs: 10,
  });

  assert.equal(result.status, 200);
  assert.equal(result.headers['content-type'], 'video/mp4');
  assert.equal(result.headers['content-disposition'], 'attachment; filename="video.mp4"');
  assert.equal(result.buffer.toString(), 'data');
});

test('createImageGeneration propagates API errors', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 401,
    headers: { forEach: () => {} },
    text: async () => 'unauthorized',
  });

  await assert.rejects(
    () =>
      createImageGeneration({
        apiKey: 'test-key',
        payload: { prompt: 'Test' },
        fetchImpl: fakeFetch,
        timeoutMs: 10,
      }),
    /OpenAI request failed: 401/
  );
});
