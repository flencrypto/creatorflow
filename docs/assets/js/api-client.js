const NULL_ORIGIN = 'null';

function normalisePath(path) {
    if (typeof path !== 'string') {
        throw new Error('API path must be a string.');
    }

    if (!path.startsWith('/')) {
        return `/${path}`;
    }

    return path;
}

function ensureDirectoryBase(baseUrl) {
    if (!baseUrl.pathname.endsWith('/')) {
        baseUrl.pathname = `${baseUrl.pathname}/`;
    }

    return baseUrl;
}

function buildApiBaseCandidates(windowObject) {
    const bases = new Set();
    const w = windowObject;

    if (w && typeof w.__API_BASE_URL === 'string') {
        const hintedBase = w.__API_BASE_URL.trim();
        if (hintedBase) {
            try {
                const origin = w.location && typeof w.location.origin === 'string' ? w.location.origin : undefined;
                const resolved = origin ? new URL(hintedBase, origin).toString() : hintedBase;
                bases.add(resolved);
            } catch (error) {
                console.warn('Invalid __API_BASE_URL hint detected. Falling back to derived origins.', error);
            }
        }
    }

    if (w && w.location) {
        const { origin, href } = w.location;
        if (origin && origin !== NULL_ORIGIN) {
            bases.add(origin);
        }
        if (href) {
            try {
                bases.add(new URL('.', href).toString());
            } catch (error) {
                console.warn('Failed to derive relative API base from current location.', error);
            }
        }
    }

    return Array.from(bases).filter(Boolean);
}

function cloneInit(init = {}) {
    const cloned = { ...init };
    if (init.headers instanceof Headers) {
        cloned.headers = new Headers(init.headers);
    } else if (init.headers && typeof init.headers === 'object') {
        cloned.headers = { ...init.headers };
    }

    return cloned;
}

async function readErrorMessage(response) {
    const contentType = response.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            const payload = await response.clone().json();
            if (payload && typeof payload.error === 'string') {
                return payload.error;
            }
        } catch (error) {
            console.warn('Failed to parse JSON error response.', error);
        }
    }

    try {
        const text = await response.clone().text();
        return text ? text.trim() : null;
    } catch (error) {
        console.warn('Failed to read error response body.', error);
        return null;
    }
}

function createApiError(message, status, url) {
    const error = new Error(message || 'API request failed.');
    if (typeof status === 'number') {
        error.status = status;
    }
    if (typeof url === 'string') {
        error.url = url;
    }
    return error;
}

function resolveTargetUrl(base, apiPath) {
    const targetPath = normalisePath(apiPath);
    let baseUrl;

    try {
        baseUrl = new URL(base);
    } catch (error) {
        throw new Error(`Invalid API base URL: ${base}`);
    }

    const originalPath = baseUrl.pathname || '/';
    ensureDirectoryBase(baseUrl);

    const useRelativePath = originalPath !== '/' && !targetPath.startsWith(originalPath);
    const relativePath = useRelativePath ? targetPath.replace(/^\/+/, '') : targetPath;

    return new URL(relativePath, baseUrl).toString();
}

export function createApiClient({ fetchImpl, windowObject } = {}) {
    const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (typeof fetchFn !== 'function') {
        throw new Error('A fetch implementation is required to create the API client.');
    }

    const windowRef = windowObject ?? (typeof window !== 'undefined' ? window : undefined);
    const apiBaseCandidates = buildApiBaseCandidates(windowRef);
    let resolvedBase = null;

    async function fetchWithFallback(path, init = {}) {
        const apiPath = normalisePath(path);
        const candidates = resolvedBase
            ? [resolvedBase, ...apiBaseCandidates.filter((base) => base !== resolvedBase)]
            : apiBaseCandidates;

        if (!candidates.length) {
            throw new Error('No API base candidates available.');
        }

        let last404Error = null;
        let lastError = null;

        for (const base of candidates) {
            let target;
            try {
                target = resolveTargetUrl(base, apiPath);
            } catch (error) {
                lastError = error;
                continue;
            }

            try {
                const response = await fetchFn(target, cloneInit(init));

                if (response.ok) {
                    resolvedBase = base;
                    return response;
                }

                if (response.status === 404) {
                    last404Error = createApiError('Request failed with status 404', 404, target);
                    continue;
                }

                const errorMessage = await readErrorMessage(response);
                throw createApiError(
                    errorMessage || `Request failed with status ${response.status}`,
                    response.status,
                    target,
                );
            } catch (error) {
                lastError = error;
                if (error?.status === 404) {
                    continue;
                }
                break;
            }
        }

        if (lastError && lastError.status !== 404) {
            throw lastError;
        }

        if (last404Error) {
            throw last404Error;
        }

        throw new Error('Unable to reach API host.');
    }

    return {
        fetch: fetchWithFallback,
    };
}

export const __internal = {
    buildApiBaseCandidates,
    cloneInit,
    readErrorMessage,
    createApiError,
    resolveTargetUrl,
};
