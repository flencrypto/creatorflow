import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

const createElement = (tagName = 'div') => {
    const element = {
        tagName,
        value: '',
        textContent: '',
        disabled: false,
        innerHTML: '',
        children: [],
        _listeners: {},
        addEventListener(event, handler) {
            this._listeners[event] = handler;
        },
        async trigger(event) {
            const handler = this._listeners[event];
            if (typeof handler === 'function') {
                await handler();
            }
        },
        appendChild(child) {
            this.children.push(child);
            return child;
        },
    };

    return element;
};

describe('editor module', () => {
    const originalGlobals = {};
    const setNavigator = (value) => {
        Object.defineProperty(global, 'navigator', {
            value,
            configurable: true,
            writable: true,
        });
    };

    beforeEach(() => {
        originalGlobals.window = global.window;
        originalGlobals.document = global.document;
        originalGlobals.navigator = global.navigator;
        originalGlobals.alert = global.alert;
        originalGlobals.fetch = global.fetch;
    });

    afterEach(() => {
        global.window = originalGlobals.window;
        global.document = originalGlobals.document;
        setNavigator(originalGlobals.navigator);
        global.alert = originalGlobals.alert;
        global.fetch = originalGlobals.fetch;
    });

    it('respects hinted API base through the API client when generating content', async () => {
        const generateBtn = createElement('button');
        const exportBtn = createElement('button');
        const preview = createElement('pre');
        const input = createElement('textarea');
        const template = createElement('select');
        const platformSelect = createElement('select');
        const toneSelect = createElement('select');
        const historyList = createElement('ul');
        const logoutBtn = createElement('button');

        const elementsById = {
            'generate-btn': generateBtn,
            'export-btn': exportBtn,
            preview,
            input,
            template,
            platform: platformSelect,
            tone: toneSelect,
            'history-list': historyList,
            'logout-btn': logoutBtn,
        };

        const documentListeners = {};

        global.document = {
            addEventListener(event, handler) {
                documentListeners[event] = handler;
            },
            getElementById(id) {
                return elementsById[id] ?? null;
            },
            createElement(tagName) {
                return createElement(tagName);
            },
        };

        const alerts = [];
        global.alert = (message) => {
            alerts.push(message);
        };

        const requests = [];
        const fetchStub = async (url, init = {}) => {
            requests.push({ url, init });
            if (!url.startsWith('https://api.creatorflow.test')) {
                return new Response('Method Not Allowed', {
                    status: 405,
                    headers: { 'content-type': 'text/plain' },
                });
            }

            assert.strictEqual(
                preview.textContent,
                'Generating content...',
                'Preview should show loading state before fetch resolves.',
            );

            return new Response(
                JSON.stringify({ ok: true, content: 'Generated content example.' }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            );
        };

        global.fetch = fetchStub;

        global.window = {
            __API_BASE_URL: 'https://api.creatorflow.test/',
            location: {
                origin: 'https://app.creatorflow.test',
                href: 'https://app.creatorflow.test/editor.html',
            },
        };

        setNavigator({
            clipboard: {
                writeText: () => Promise.resolve(),
            },
        });

        const moduleUrl = new URL('../public/assets/js/editor.js', import.meta.url);
        await import(`${moduleUrl.href}?cacheBust=${Date.now()}`);

        assert.ok(documentListeners.DOMContentLoaded, 'DOMContentLoaded listener registered');
        await documentListeners.DOMContentLoaded();

        assert.strictEqual(
            typeof generateBtn._listeners.click,
            'function',
            'Generate button should register a click handler on DOMContentLoaded.',
        );

        input.value = 'Launch announcement';
        template.value = 'default-template';
        platformSelect.value = 'linkedin';
        toneSelect.value = 'professional';

        await generateBtn.trigger('click');

        assert.strictEqual(requests.length, 1);
        assert.strictEqual(
            requests[0].url,
            'https://api.creatorflow.test/api/generate',
            'Request should target hinted API base to avoid 405 responses.',
        );
        assert.strictEqual(requests[0].init.method, 'POST');
        assert.strictEqual(preview.textContent, 'Generated content example.');
        assert.deepStrictEqual(alerts, []);
    });
});
