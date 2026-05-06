import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const runtimeConfigSource = await readFile(new URL('../public/assets/js/runtime-config.js', import.meta.url));

function createBaseContext({ search = '', metaContent = null, storedValue = null } = {}) {
    const storage = new Map();
    if (storedValue) {
        storage.set('creatorflow_api_base_url', storedValue);
    }

    const documentStub = {
        documentElement: { dataset: {} },
        body: { dataset: {} },
        querySelector(selector) {
            if (selector === 'meta[name="creatorflow:api-base"]' && metaContent) {
                return {
                    getAttribute(name) {
                        if (name === 'content') {
                            return metaContent;
                        }
                        return null;
                    },
                };
            }
            return null;
        },
    };

    const windowStub = {
        location: {
            origin: 'https://app.creatorflow.test',
            search,
        },
        localStorage: {
            getItem(key) {
                return storage.get(key) ?? null;
            },
            setItem(key, value) {
                storage.set(key, value);
            },
        },
    };

    const context = {
        window: windowStub,
        document: documentStub,
        console: { warn() {}, log() {} },
        URLSearchParams,
    };
    context.globalThis = windowStub;
    windowStub.document = documentStub;

    return { context, storage };
}

function executeRuntimeConfig(context) {
    vm.runInNewContext(runtimeConfigSource.toString(), context, {
        filename: 'runtime-config.js',
        displayErrors: true,
    });
}

describe('runtime-config bootstrap', () => {
    it('prefers apiBase query parameter and persists it', () => {
        const { context, storage } = createBaseContext({ search: '?apiBase=https://api.example.test' });
        executeRuntimeConfig(context);
        assert.strictEqual(context.window.__API_BASE_URL, 'https://api.example.test');
        assert.strictEqual(storage.get('creatorflow_api_base_url'), 'https://api.example.test');
    });

    it('falls back to stored override when query is absent', () => {
        const { context } = createBaseContext({ storedValue: 'https://stored.example.test' });
        executeRuntimeConfig(context);
        assert.strictEqual(context.window.__API_BASE_URL, 'https://stored.example.test');
    });

    it('uses meta tag content when no overrides exist', () => {
        const { context } = createBaseContext({ metaContent: 'https://meta.example.test' });
        context.window.location.search = '';
        executeRuntimeConfig(context);
        assert.strictEqual(context.window.__API_BASE_URL, 'https://meta.example.test');
    });

    it('defaults to window origin as a final fallback', () => {
        const { context } = createBaseContext();
        context.window.location.search = '';
        executeRuntimeConfig(context);
        assert.strictEqual(context.window.__API_BASE_URL, 'https://app.creatorflow.test');
    });
});
