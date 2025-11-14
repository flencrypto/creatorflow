import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { createOpenAiModelService } from '../lib/openai-model-service.js';

function createAsyncIterable(items) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

test('listModels returns mapped models and caches the result', async () => {
  let now = 1_000;
  const nowFn = () => now;
  const responseItems = [
    { id: 'model-a', created: 123, owned_by: 'openai' },
    { id: 'model-b', created: null, owned_by: null },
  ];

  const listMock = mock.fn(async () => createAsyncIterable(responseItems));
  const clientFactory = mock.fn(() => ({ models: { list: listMock } }));

  const service = createOpenAiModelService({
    apiKey: 'test',
    clientFactory,
    cacheTtlMs: 5_000,
    now: nowFn,
    logger: { error: () => {} },
  });

  const firstCall = await service.listModels();
  assert.deepEqual(firstCall, [
    { id: 'model-a', created: 123, ownedBy: 'openai' },
    { id: 'model-b', created: null, ownedBy: null },
  ]);
  assert.equal(clientFactory.mock.callCount(), 1);
  assert.equal(listMock.mock.callCount(), 1);

  now += 2_000; // still within cache ttl
  const secondCall = await service.listModels();
  assert.deepEqual(secondCall, firstCall);
  assert.equal(listMock.mock.callCount(), 1);

  now += 5_000; // beyond ttl forces refresh
  await service.listModels();
  assert.equal(listMock.mock.callCount(), 2);
});

test('listModels propagates API errors with helpful context', async () => {
  const error = new Error('network down');
  const listMock = mock.fn(async () => {
    throw error;
  });
  const clientFactory = mock.fn(() => ({ models: { list: listMock } }));

  const service = createOpenAiModelService({
    apiKey: 'test',
    clientFactory,
    now: () => 0,
    logger: { error: () => {} },
  });

  await assert.rejects(service.listModels(), {
    message: /Failed to fetch OpenAI models: network down/,
  });
  assert.equal(listMock.mock.callCount(), 1);
});

test('getCacheInfo reflects cached size and expiry state', async () => {
  let now = 10_000;
  const listMock = mock.fn(async () =>
    createAsyncIterable([
      { id: 'cached-model', created: 321, owned_by: 'system' },
    ])
  );
  const clientFactory = mock.fn(() => ({ models: { list: listMock } }));

  const service = createOpenAiModelService({
    apiKey: 'test',
    clientFactory,
    cacheTtlMs: 1_000,
    now: () => now,
    logger: { error: () => {} },
  });

  let cacheInfo = service.getCacheInfo();
  assert.deepEqual(cacheInfo, { size: 0, expiresAt: null });

  await service.listModels();
  cacheInfo = service.getCacheInfo();
  assert.equal(cacheInfo.size, 1);
  assert.equal(cacheInfo.expiresAt, 11_000);

  service.clearCache();
  cacheInfo = service.getCacheInfo();
  assert.deepEqual(cacheInfo, { size: 0, expiresAt: null });
});
