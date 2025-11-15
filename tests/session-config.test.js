import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SESSION_SECRET = process.env.SESSION_SECRET;

function restoreEnv() {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }

  if (ORIGINAL_SESSION_SECRET === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = ORIGINAL_SESSION_SECRET;
  }
}

afterEach(() => {
  restoreEnv();
});

function buildFreshServerImportUrl() {
  const moduleUrl = new URL('../server.js', import.meta.url);
  moduleUrl.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return moduleUrl.href;
}

describe('session secret configuration', () => {
  it('throws in production when SESSION_SECRET is not defined', async () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';

    await assert.rejects(async () => {
      await import(buildFreshServerImportUrl());
    }, /SESSION_SECRET environment variable must be set in production/);
  });

  it('falls back to the development secret when not in production', async () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'test';

    const module = await import(buildFreshServerImportUrl());

    assert.equal(module.sessionSecret, 'development-session-secret');
  });
});
