import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

const originalNodeEnv = process.env.NODE_ENV;
const originalSessionSecret = process.env.SESSION_SECRET;
const originalOpenAiKey = process.env.OPEN_API_KEY;

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.OPEN_API_KEY = 'test-openai-key';

const originalFetch = global.fetch;

const aiResponse = {
  choices: [
    {
      message: {
        content:
          'Here is your connector plan:\n```json\n{"summary":"Plan","connectors":[{"name":"Connector A","description":"Do something","setup":["Step"],"automations":["Auto"]}]}\n```',
      },
    },
  ],
};

global.fetch = async (url) => {
  if (url.toString().includes('/chat/completions')) {
    return new Response(JSON.stringify(aiResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  throw new Error(`Unexpected fetch to ${url}`);
};

const app = (await import('../server.js')).default;

test('connector suggestions parse JSON code blocks with prefixes', async () => {
  const originalIsAuthenticated = app.request.isAuthenticated;
  const hadUser = Object.prototype.hasOwnProperty.call(app.request, 'user');
  const originalUser = app.request.user;

  app.request.isAuthenticated = () => true;
  app.request.user = { id: 'user-1', displayName: 'Test User' };

  const agent = request.agent(app);
  const response = await agent
    .post('/api/integrations/openai/connectors')
    .send({ useCase: 'Automate content calendar' })
    .set('Content-Type', 'application/json');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    summary: 'Plan',
    connectors: [
      {
        name: 'Connector A',
        description: 'Do something',
        setup: ['Step'],
        automations: ['Auto'],
      },
    ],
  });

  if (originalIsAuthenticated) {
    app.request.isAuthenticated = originalIsAuthenticated;
  } else {
    delete app.request.isAuthenticated;
  }

  if (hadUser) {
    app.request.user = originalUser;
  } else {
    delete app.request.user;
  }
});

test.after(() => {
  global.fetch = originalFetch;

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalSessionSecret === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = originalSessionSecret;
  }

  if (originalOpenAiKey === undefined) {
    delete process.env.OPEN_API_KEY;
  } else {
    process.env.OPEN_API_KEY = originalOpenAiKey;
  }
});
