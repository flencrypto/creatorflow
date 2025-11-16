(() => {
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : window;
  const windowObject = globalScope.window || globalScope;
  const documentObject = windowObject.document || globalScope.document || null;
  const runtimeKey = '__CREATORFLOW_RUNTIME_CONFIG__';
  const storageKey = 'creatorflow_api_base_url';
  const metaSelector = 'meta[name="creatorflow:api-base"]';
  const searchParamKeys = ['apiBase', 'api_base'];

  function normalise(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function safeSetStorage(value) {
    if (!windowObject.localStorage || typeof windowObject.localStorage.setItem !== 'function') {
      return;
    }
    try {
      windowObject.localStorage.setItem(storageKey, value);
    } catch (error) {
      console.warn('[creatorflow-config] Failed to persist API base override.', error);
    }
  }

  function safeGetStorage() {
    if (!windowObject.localStorage || typeof windowObject.localStorage.getItem !== 'function') {
      return null;
    }
    try {
      return normalise(windowObject.localStorage.getItem(storageKey));
    } catch (error) {
      console.warn('[creatorflow-config] Failed to read stored API base override.', error);
      return null;
    }
  }

  function readQueryOverride() {
    const search = windowObject.location?.search;
    if (!search || typeof URLSearchParams !== 'function') {
      return null;
    }

    try {
      const params = new URLSearchParams(search);
      for (const key of searchParamKeys) {
        const candidate = normalise(params.get(key));
        if (candidate) {
          safeSetStorage(candidate);
          return candidate;
        }
      }
    } catch (error) {
      console.warn('[creatorflow-config] Failed to parse API base from query params.', error);
    }

    return null;
  }

  function readMetaOverride() {
    if (!documentObject || typeof documentObject.querySelector !== 'function') {
      return null;
    }

    const meta = documentObject.querySelector(metaSelector);
    if (!meta || typeof meta.getAttribute !== 'function') {
      return null;
    }

    const content = meta.getAttribute('content');
    if (!content || content === 'auto') {
      return null;
    }

    return normalise(content);
  }

  function readDataAttributeOverride() {
    const candidates = [
      documentObject?.documentElement?.dataset?.apiBase,
      documentObject?.body?.dataset?.apiBase,
    ];

    for (const candidate of candidates) {
      const value = normalise(candidate);
      if (value) {
        return value;
      }
    }

    return null;
  }

  function readGlobalHint() {
    return normalise(windowObject.__API_BASE_URL);
  }

  function deriveOriginFallback() {
    const origin = normalise(windowObject.location?.origin);
    if (origin && origin !== 'null') {
      return origin;
    }
    return null;
  }

  const sources = [
    { name: 'query', reader: readQueryOverride },
    { name: 'storage', reader: safeGetStorage },
    { name: 'meta', reader: readMetaOverride },
    { name: 'data-attribute', reader: readDataAttributeOverride },
    { name: 'global', reader: readGlobalHint },
    { name: 'origin', reader: deriveOriginFallback },
  ];

  let resolvedBase = windowObject[runtimeKey]?.apiBaseUrl || null;
  let resolvedSource = windowObject[runtimeKey]?.source || null;

  for (const source of sources) {
    const value = source.reader();
    if (value) {
      resolvedBase = value;
      resolvedSource = source.name;
      break;
    }
  }

  if (resolvedBase) {
    windowObject.__API_BASE_URL = resolvedBase;
    windowObject[runtimeKey] = { apiBaseUrl: resolvedBase, source: resolvedSource };
  } else {
    windowObject[runtimeKey] = { apiBaseUrl: null, source: null };
  }
})();
