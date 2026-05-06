const ensureEnv = (key, fallback) => {
  if (!process.env[key]) {
    process.env[key] = fallback;
  }
};

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
ensureEnv('SESSION_SECRET', 'test-session-secret');
ensureEnv('GOOGLE_CLIENT_ID', 'test-google-client-id');
ensureEnv('GOOGLE_CLIENT_SECRET', 'test-google-client-secret');
ensureEnv('GOOGLE_CALLBACK_URL', 'http://localhost:3000/auth/google/callback');
ensureEnv('FACEBOOK_APP_ID', 'test-facebook-app-id');
ensureEnv('FACEBOOK_APP_SECRET', 'test-facebook-app-secret');
ensureEnv('FACEBOOK_CALLBACK_URL', 'http://localhost:3000/auth/facebook/callback');

const app = (await import('../../server.js')).default;

export { app };
export default app;
