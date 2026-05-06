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

const app = (await import('./helpers/app-fixture.js')).default;

function findCookie(cookies = [], name) {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

test('logout clears the session cookie and invalidates the session', async () => {
  const agent = request.agent(app);

  const loginResponse = await agent.post('/__test/login').send({ userId: 'user-123' });
  assert.equal(loginResponse.status, 200);
  assert.ok(findCookie(loginResponse.headers['set-cookie'], 'creatorflow.sid'));

  const csrfResponse = await agent.get('/api/auth/csrf');
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = csrfResponse.body;
  assert.ok(csrfToken);

  const logoutResponse = await agent.post('/api/auth/logout').set('csrf-token', csrfToken);
  assert.equal(logoutResponse.status, 200);
  assert.deepEqual(logoutResponse.body, { ok: true });

  const clearedCookie = findCookie(logoutResponse.headers['set-cookie'], 'creatorflow.sid');
  assert.ok(clearedCookie, 'expected logout to clear the session cookie');
  assert.match(clearedCookie, /(Max-Age=0|Expires=)/);

  const statusResponse = await agent.get('/api/auth/status');
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(statusResponse.body, { authenticated: false, user: null });
});
