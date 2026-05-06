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

function assertAuthRequired(response) {
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { ok: false, error: 'Authentication required.' });
}

test('POST /api/images/generate rejects unauthenticated requests', async () => {
  const response = await request(app)
    .post('/api/images/generate')
    .send({ prompt: 'A scenic mountain landscape' })
    .set('Content-Type', 'application/json');

  assertAuthRequired(response);
});

test('POST /api/images/edit rejects unauthenticated requests', async () => {
  const response = await request(app)
    .post('/api/images/edit')
    .field('prompt', 'Add a sunset')
    .attach('image', Buffer.from('PNG'), { filename: 'test.png', contentType: 'image/png' });

  assertAuthRequired(response);
});

test('POST /api/images/variation rejects unauthenticated requests', async () => {
  const response = await request(app)
    .post('/api/images/variation')
    .attach('image', Buffer.from('PNG'), { filename: 'test.png', contentType: 'image/png' });

  assertAuthRequired(response);
});

test('POST /api/images/generate returns 400 when prompt is missing', async () => {
  // Log in as test user first
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];

  // Obtain CSRF token
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  const response = await request(app)
    .post('/api/images/generate')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken)
    .send({})
    .set('Content-Type', 'application/json');

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(response.body.error.includes('prompt'));
});

test('POST /api/images/generate returns 400 for invalid size', async () => {
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  const response = await request(app)
    .post('/api/images/generate')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken)
    .send({ prompt: 'A sunset', size: 'invalid-size' })
    .set('Content-Type', 'application/json');

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(response.body.error.toLowerCase().includes('size'));
});

test('POST /api/images/generate returns 503 when OPEN_API_KEY is not set', async () => {
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  // OPEN_API_KEY is not set in test environment — expect 503
  const response = await request(app)
    .post('/api/images/generate')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken)
    .send({ prompt: 'A blue sky' })
    .set('Content-Type', 'application/json');

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
});

test('POST /api/images/edit returns 400 when image is missing', async () => {
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  const response = await request(app)
    .post('/api/images/edit')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken)
    .field('prompt', 'Add a rainbow');

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(response.body.error.includes('image'));
});

test('POST /api/images/edit returns 400 when prompt is missing', async () => {
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  const response = await request(app)
    .post('/api/images/edit')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken)
    .attach('image', Buffer.from('PNG'), { filename: 'test.png', contentType: 'image/png' });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(response.body.error.includes('prompt'));
});

test('POST /api/images/variation returns 400 when image is missing', async () => {
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  const response = await request(app)
    .post('/api/images/variation')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken);

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(response.body.error.includes('image'));
});

test('POST /api/images/variation returns 503 when OPEN_API_KEY is not set', async () => {
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  const response = await request(app)
    .post('/api/images/variation')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken)
    .attach('image', Buffer.from('PNG'), { filename: 'test.png', contentType: 'image/png' });

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
});

test('POST /api/images/edit rejects unsupported file type', async () => {
  const loginResponse = await request(app)
    .post('/__test/login')
    .send({ userId: 'test-user', displayName: 'Test User' })
    .set('Content-Type', 'application/json');

  const cookies = loginResponse.headers['set-cookie'];
  const csrfResponse = await request(app)
    .get('/api/auth/csrf')
    .set('Cookie', cookies);
  const { csrfToken } = csrfResponse.body;

  const response = await request(app)
    .post('/api/images/edit')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrfToken)
    .field('prompt', 'Make it better')
    .attach('image', Buffer.from('GIF89a'), { filename: 'test.gif', contentType: 'image/gif' });

  // multer fileFilter rejects the file, express returns 500 via error handler
  assert.ok(response.status === 400 || response.status === 500);
});
