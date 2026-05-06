import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createApiClient } from '../public/assets/js/api-client.js';

const jsonResponse = (body, { status = 200 } = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('createApiClient', () => {
    let originalWindow;
    let originalFetch;

    beforeEach(() => {
        originalWindow = global.window;
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.window = originalWindow;
        global.fetch = originalFetch;
    });

    it('resolves API paths against hinted bases without duplicating segments', async () => {
        const requests = [];
        const fetchStub = async (url) => {
            requests.push(url);
            return jsonResponse({ ok: true });
        };

        global.window = {
            __API_BASE_URL: '/api',
            location: {
                origin: 'https://app.creatorflow.test',
                href: 'https://app.creatorflow.test/app/integrations.html',
            },
        };

        const client = createApiClient({ fetchImpl: fetchStub, windowObject: global.window });
        const response = await client.fetch('/api/integrations/openai/models');

        assert.strictEqual(response.ok, true);
        assert.deepEqual(requests, ['https://app.creatorflow.test/api/integrations/openai/models']);
    });

    it('falls back to alternate candidates when the primary base responds with 404', async () => {
        const requests = [];
        const responses = [
            new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }),
            jsonResponse({ ok: true }),
        ];
        let callIndex = 0;

        const fetchStub = async (url) => {
            requests.push(url);
            const response = responses[Math.min(callIndex, responses.length - 1)];
            callIndex += 1;
            return response;
        };

        global.window = {
            location: {
                origin: 'https://app.creatorflow.test',
                href: 'https://app.creatorflow.test/workspaces/creatorflow/integrations.html',
            },
        };

        const client = createApiClient({ fetchImpl: fetchStub, windowObject: global.window });
        const response = await client.fetch('/api/integrations');

        assert.strictEqual(response.ok, true);
        assert.deepEqual(requests, [
            'https://app.creatorflow.test/api/integrations',
            'https://app.creatorflow.test/workspaces/creatorflow/api/integrations',
        ]);
    });
});
