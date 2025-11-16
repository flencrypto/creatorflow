import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import passport from 'passport';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/auth/google/callback';
process.env.FACEBOOK_APP_ID = 'test-facebook-app-id';
process.env.FACEBOOK_APP_SECRET = 'test-facebook-app-secret';
process.env.FACEBOOK_CALLBACK_URL = 'http://localhost:3000/auth/facebook/callback';

const app = (await import('./helpers/app-fixture.js')).default;

class StaticSuccessStrategy extends passport.Strategy {
  constructor(name) {
    super();
    this.name = name;
  }

  authenticate(req, options = {}) {
    const hasAuthCode = typeof req.query?.code === 'string' && req.query.code.length > 0;

    if (!hasAuthCode) {
      const redirectUrl = new URL(`https://example.test/${this.name}`);
      if (options.state) {
        redirectUrl.searchParams.set('state', options.state);
      }
      this.redirect(redirectUrl.toString());
      return;
    }

    const fakeUser = {
      id: `${this.name}-test-user`,
      provider: this.name,
      displayName: `Test ${this.name}`,
    };
    this.success(fakeUser);
  }
}

if (passport._strategies?.google) {
  passport.unuse('google');
}
passport.use(new StaticSuccessStrategy('google'));

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

test('google oauth flow replaces pending state when initiating twice', async () => {
  const agent = request.agent(app);

  const firstResponse = await agent.get('/auth/google');
  assert.equal(firstResponse.status, 302);
  const firstState = new URL(firstResponse.headers.location).searchParams.get('state');
  assert.ok(firstState);

  const secondResponse = await agent.get('/auth/google');
  assert.equal(secondResponse.status, 302);
  const secondState = new URL(secondResponse.headers.location).searchParams.get('state');
  assert.ok(secondState);
  assert.notEqual(firstState, secondState);

  const callbackResponse = await agent
    .get('/auth/google/callback')
    .query({ state: secondState, code: 'ignored-code' });
  assert.equal(callbackResponse.status, 302);
  assert.equal(callbackResponse.headers.location, '/dashboard.html');

  const replayResponse = await agent
    .get('/auth/google/callback')
    .query({ state: firstState, code: 'ignored-code' });
  assert.equal(replayResponse.status, 302);
  assert.match(replayResponse.headers.location, /error=google_oauth_state/);
});
