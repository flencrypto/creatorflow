import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { once } from 'node:events';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
};

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.FACEBOOK_APP_ID = 'test-facebook-app-id';
process.env.FACEBOOK_APP_SECRET = 'test-facebook-app-secret';

const { app } = await import('../server.js');

function restoreEnv() {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function extractSessionCookie(setCookies) {
  return (setCookies || [])
    .map((entry) => entry.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function initiateAuth(baseUrl, provider) {
  const response = await fetch(`${baseUrl}/auth/${provider}`, {
    redirect: 'manual',
  });

  assert.strictEqual(response.status, 302, `Expected ${provider} auth start to redirect.`);
  const location = response.headers.get('location');
  assert.ok(location, 'Expected redirect location header.');

  const state = (() => {
    try {
      const url = new URL(location);
      return url.searchParams.get('state');
    } catch (error) {
      throw new Error(`Failed to parse redirect location for ${provider}: ${location}`);
    }
  })();

  assert.ok(state, 'Expected generated state parameter.');

  const sessionCookie = extractSessionCookie(response.headers.getSetCookie?.());
  assert.ok(sessionCookie.includes('connect.sid'), 'Expected session cookie to be issued.');

  return { state, sessionCookie };
}

function buildCallbackUrl(baseUrl, provider, params) {
  const search = new URLSearchParams(params);
  return `${baseUrl}/auth/${provider}/callback?${search.toString()}`;
}

describe('OAuth state protection', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    server = app.listen(0);
    await once(server, 'listening');
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await closeServer(server);
  });

  after(() => {
    restoreEnv();
  });

  it('rejects Google callback requests that omit state', async () => {
    const { sessionCookie } = await initiateAuth(baseUrl, 'google');

    const response = await fetch(buildCallbackUrl(baseUrl, 'google', { code: 'test-code' }), {
      headers: { cookie: sessionCookie },
      redirect: 'manual',
    });

    assert.strictEqual(response.status, 302);
    assert.strictEqual(response.headers.get('location'), '/login.html?error=google');
  });

  it('rejects Google callback requests with mismatched state', async () => {
    const { state, sessionCookie } = await initiateAuth(baseUrl, 'google');

    const response = await fetch(
      buildCallbackUrl(baseUrl, 'google', {
        code: 'test-code',
        state: `${state}-tampered`,
      }),
      {
        headers: { cookie: sessionCookie },
        redirect: 'manual',
      }
    );

    assert.strictEqual(response.status, 302);
    assert.strictEqual(response.headers.get('location'), '/login.html?error=google');
  });

  it('rejects Facebook callback requests that omit state', async () => {
    const { sessionCookie } = await initiateAuth(baseUrl, 'facebook');

    const response = await fetch(buildCallbackUrl(baseUrl, 'facebook', { code: 'test-code' }), {
      headers: { cookie: sessionCookie },
      redirect: 'manual',
    });

    assert.strictEqual(response.status, 302);
    assert.strictEqual(response.headers.get('location'), '/login.html?error=facebook');
  });

  it('rejects Facebook callback requests with mismatched state', async () => {
    const { state, sessionCookie } = await initiateAuth(baseUrl, 'facebook');

    const response = await fetch(
      buildCallbackUrl(baseUrl, 'facebook', {
        code: 'test-code',
        state: `${state}-tampered`,
      }),
      {
        headers: { cookie: sessionCookie },
        redirect: 'manual',
      }
    );

    assert.strictEqual(response.status, 302);
    assert.strictEqual(response.headers.get('location'), '/login.html?error=facebook');
  });
});
