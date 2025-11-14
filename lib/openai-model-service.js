import OpenAI from 'openai';

const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 5;
const DEFAULT_LIMIT = 50;

function createDefaultClient({ apiKey, timeoutMs = 8000, maxRetries = 2 }) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('An OpenAI API key is required to create the client.');
  }

  return new OpenAI({
    apiKey,
    timeout: timeoutMs,
    maxRetries,
  });
}

function normaliseModel(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
    return null;
  }

  return {
    id: entry.id,
    created: typeof entry.created === 'number' ? entry.created : null,
    ownedBy: typeof entry.owned_by === 'string' ? entry.owned_by : entry.ownedBy ?? null,
  };
}

export function createOpenAiModelService({
  apiKey,
  clientFactory = createDefaultClient,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('An OpenAI API key must be provided to initialise the model service.');
  }

  let cachedModels = null;
  let cacheExpiresAt = 0;
  let clientInstance = null;

  async function getClient() {
    if (!clientInstance) {
      clientInstance = clientFactory({ apiKey });
    }

    return clientInstance;
  }

  async function listModels({ limit = DEFAULT_LIMIT, forceRefresh = false } = {}) {
    const currentTime = now();

    if (!forceRefresh && Array.isArray(cachedModels) && cacheExpiresAt > currentTime) {
      return cachedModels;
    }

    const client = await getClient();

    try {
      const page = await client.models.list({ limit });
      const models = [];

      if (page && typeof page[Symbol.asyncIterator] === 'function') {
        for await (const model of page) {
          const mapped = normaliseModel(model);
          if (mapped) {
            models.push(mapped);
          }
        }
      } else if (Array.isArray(page?.data)) {
        for (const model of page.data) {
          const mapped = normaliseModel(model);
          if (mapped) {
            models.push(mapped);
          }
        }
      }

      cachedModels = models;
      cacheExpiresAt = currentTime + cacheTtlMs;

      return models;
    } catch (error) {
      cachedModels = null;
      cacheExpiresAt = 0;

      const message = error?.message ? `Failed to fetch OpenAI models: ${error.message}` : 'Failed to fetch OpenAI models.';
      logger?.error?.('[ERROR] openai-model-service.listModels', error);
      throw new Error(message);
    }
  }

  function getCacheInfo() {
    return {
      size: Array.isArray(cachedModels) ? cachedModels.length : 0,
      expiresAt: cacheExpiresAt > 0 ? cacheExpiresAt : null,
    };
  }

  function clearCache() {
    cachedModels = null;
    cacheExpiresAt = 0;
  }

  return {
    listModels,
    getCacheInfo,
    clearCache,
  };
}

export { createDefaultClient };
