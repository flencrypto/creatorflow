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

test('google oauth flow issues state token and rejects mismatches', async () => {
  const agent = request.agent(app);
  const response = await agent.get('/auth/google');
  assert.equal(response.status, 302);
  const location = response.headers.location;
  assert.ok(location.includes('state='));

  const state = new URL(location).searchParams.get('state');
  assert.ok(state);

  const invalidResponse = await agent
    .get('/auth/google/callback')
    .query({ state: 'tampered', code: 'ignored-code' });
  assert.equal(invalidResponse.status, 302);
  assert.match(invalidResponse.headers.location, /error=google_oauth_state/);
});

test('facebook oauth flow rejects missing state parameter', async () => {
  const agent = request.agent(app);
  await agent.get('/auth/facebook');
  const response = await agent
    .get('/auth/facebook/callback')
    .query({ code: 'ignored-code' });
  assert.equal(response.status, 302);
  assert.match(response.headers.location, /error=facebook_oauth_state/);
});
