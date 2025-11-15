import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/auth/google/callback';
process.env.FACEBOOK_APP_ID = 'test-facebook-app-id';
process.env.FACEBOOK_APP_SECRET = 'test-facebook-app-secret';
process.env.FACEBOOK_CALLBACK_URL = 'http://localhost:3000/auth/facebook/callback';

const app = (await import('../server.js')).default;

function assertAuthRequired(response) {
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { ok: false, error: 'Authentication required.' });
}

test('rejects unauthenticated connector suggestions', async () => {
  const response = await request(app)
    .post('/api/integrations/openai/connectors')
    .send({ useCase: 'Plan my automations' })
    .set('Content-Type', 'application/json');

  assertAuthRequired(response);
});

test('rejects unauthenticated integration health checks', async () => {
  const [openAiSpecific, generic] = await Promise.all([
    request(app).post('/api/integrations/openai/test'),
    request(app).post('/api/integrations/not-real/test'),
  ]);

  assertAuthRequired(openAiSpecific);
  assertAuthRequired(generic);
});
