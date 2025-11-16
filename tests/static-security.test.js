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

test('serves public index HTML while restricting server source files', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 200);
  assert.match(response.text, /CreatorFlow Studio/i);

  const serverResponse = await request(app).get('/server.js');
  assert.equal(serverResponse.status, 404);

  const envResponse = await request(app).get('/.env');
  assert.equal(envResponse.status, 404);
});
