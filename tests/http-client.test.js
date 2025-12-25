import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchWithRetry } from '../lib/http-client.js';

describe('fetchWithRetry', () => {
    it('cancels retryable response bodies before retrying', async () => {
        const cancelCalls = [];
        const responses = [
            {
                status: 500,
                body: {
                    cancel: async () => {
                        cancelCalls.push('cancelled');
                    },
                },
            },
            { status: 200 },
        ];
        let index = 0;

        const fetchStub = async () => {
            const response = responses[Math.min(index, responses.length - 1)];
            index += 1;
            return response;
        };

        const response = await fetchWithRetry('https://example.test', {}, { fetch: fetchStub, retries: 1 });

        assert.strictEqual(response.status, 200);
        assert.deepEqual(cancelCalls, ['cancelled']);
    });
});
