// server.js
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient as createRedisClient } from 'redis';
import passport from 'passport';
import multer from 'multer';
import { z } from 'zod';
import csurf from 'csurf';
import helmet from 'helmet';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';

import multer from 'multer';

import {
  generateContentWithFallback,
  VOICE_PERSONAS,
  getAvailableVoices,
  generateWithVoice,
  validateContentForVoice,
} from './lib/openai.js';
import { createOpenAiModelService } from './lib/openai-model-service.js';
import { fetchWithRetry, readJsonResponse } from './lib/http-client.js';
import {
  createImageGeneration,
  createImageEdit,
  createImageVariation,
} from './lib/openai-media.js';

dotenv.config();

// Pre-compute the comma-separated list of voice IDs once to avoid rebuilding it
// on every request that returns a validation error for an invalid voice ID.
const AVAILABLE_VOICE_IDS = Object.keys(VOICE_PERSONAS).join(', ');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);
const publicDirectory = path.join(moduleDirectory, 'public');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB safety limit for upstream assets
  },
});

const SESSION_COOKIE_NAME = 'creatorflow.sid';
const sessionCookieConfig = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  maxAge: 1000 * 60 * 60 * 4, // 4 hours
};

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && isProduction) {
  throw new Error('SESSION_SECRET is required in production and must be a strong, unpredictable value.');
}

if (SESSION_SECRET && SESSION_SECRET.length < 32 && isProduction) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production.');
} else if (!SESSION_SECRET) {
  console.warn(
    '[WARN] SESSION_SECRET not set. Falling back to an insecure default for local development. Configure SESSION_SECRET in production.'
  );
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_CALLBACK_URL =
  process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3000/auth/facebook/callback';

const configuredAuthProviders = [];

const OAUTH_STATE_SESSION_KEY = 'oauthState';

function ensureOAuthStateStore(req) {
  if (!req.session) {
    return null;
  }

  const existingStore = req.session[OAUTH_STATE_SESSION_KEY];
  if (!existingStore || typeof existingStore !== 'object') {
    req.session[OAUTH_STATE_SESSION_KEY] = {};
  }

  return req.session[OAUTH_STATE_SESSION_KEY];
}

function issueOAuthStateToken(req, provider) {
  const store = ensureOAuthStateStore(req);
  if (!store) {
    return null;
  }

  const token = crypto.randomUUID();
  req.session[OAUTH_STATE_SESSION_KEY] = { ...store, [provider]: token };
  return token;
}

function peekOAuthStateToken(req, provider) {
  const store = req.session?.[OAUTH_STATE_SESSION_KEY];
  if (!store || typeof store !== 'object') {
    return null;
  }
  return typeof store[provider] === 'string' ? store[provider] : null;
}

function consumeOAuthStateToken(req, provider) {
  const store = req.session?.[OAUTH_STATE_SESSION_KEY];
  if (!store || typeof store !== 'object') {
    return;
  }

  const remaining = Object.keys(store).filter((k) => k !== provider);
  if (remaining.length === 0) {
    delete req.session[OAUTH_STATE_SESSION_KEY];
  } else {
    req.session[OAUTH_STATE_SESSION_KEY] = Object.fromEntries(
      remaining.map((k) => [k, store[k]])
    );
  }
}

function persistSession(req) {
  if (!req?.session || typeof req.session.save !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function normaliseStateValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function createOAuthInitiationHandler(provider, options) {
  return async (req, res, next) => {
    if (!req.session) {
      console.error(
        `[ERROR] Session unavailable for ${provider} OAuth start; refusing to continue without CSRF protection.`
      );
      res.status(500).send('Session support is required to initiate OAuth.');
      return;
    }

    const token = issueOAuthStateToken(req, provider);
    if (!token) {
      res.status(500).send('Failed to create OAuth state token.');
      return;
    }

    try {
      await persistSession(req);
    } catch (err) {
      console.error(`[ERROR] Failed to persist session for ${provider} OAuth start:`, err);
      res.status(500).send('Failed to persist session for OAuth.');
      return;
    }

    return passport.authenticate(provider, { ...options, state: token })(req, res, next);
  };
}

function createOAuthStateGuard(provider, failureRedirect) {
  return async (req, res, next) => {
    if (!req.session) {
      return res.redirect(failureRedirect);
    }

    const expectedState = peekOAuthStateToken(req, provider);
    const incomingState = normaliseStateValue(req.query?.state);

    if (!expectedState || typeof incomingState !== 'string' || expectedState !== incomingState) {
      return res.redirect(failureRedirect);
    }

    consumeOAuthStateToken(req, provider);
    try {
      await persistSession(req);
    } catch (err) {
      console.error(`[ERROR] Failed to persist session cleanup for ${provider} OAuth:`, err);
    }

    return next();
  };
}

const resolvedOpenApiKey =
  process.env.OPEN_API_KEY ?? process.env.OPEN_AI_KEY ?? process.env.AI_API_KEY ?? null;

if (process.env.OPEN_AI_KEY && !process.env.OPEN_API_KEY) {
  process.env.OPEN_API_KEY = process.env.OPEN_AI_KEY;
}

const OPEN_API_KEY = resolvedOpenApiKey;
const PERPLEXITY_API_KEY = process.env.API_KEY;

const connectorsCatalog = [
  {
    id: 'openai-content-generator',
    provider: 'openai',
    name: 'OpenAI Content Generator',
    category: 'AI Automation',
    description:
      'Generate multi-channel social content with GPT-4o templates tuned for CreatorFlow prompts.',
    features: [
      'Post, script, and caption generation',
      'Tone-aware creativity controls',
      'Platform-aware formatting',
    ],
    documentationUrl: 'https://platform.openai.com/docs/guides/text-generation',
    actions: { testable: true, models: true, suggestions: true },
    requires: ['OPEN_API_KEY'],
  },
  {
    id: 'openai-performance-coach',
    provider: 'openai',
    name: 'OpenAI Performance Coach',
    category: 'AI Insights',
    description:
      'Review draft content and produce structured feedback for hooks, CTAs, and optimization tips.',
    features: [
      'Content critique and scoring',
      'Goal-aligned suggestions',
      'Actionable hook/CTA library',
    ],
    documentationUrl: 'https://platform.openai.com/docs/guides/assistant',
    actions: { testable: true, suggestions: true },
    requires: ['OPEN_API_KEY'],
  },
  {
    id: 'perplexity-research',
    provider: 'perplexity',
    name: 'Perplexity Deep Research',
    category: 'AI Insights',
    description:
      'Conduct real-time research on trends, audience insights, and competitive analysis with web access.',
    features: [
      'Real-time web research',
      'Competitive content analysis',
      'Audience insights and trends',
      'Cited sources',
    ],
    documentationUrl: 'https://docs.perplexity.ai',
    actions: { testable: true, suggestions: false },
    requires: ['API_KEY'],
  },
];

const openAiModelService = OPEN_API_KEY
  ? createOpenAiModelService({ apiKey: OPEN_API_KEY, logger: console })
  : null;

if (!OPEN_API_KEY) {
  console.warn(
    '[WARN] OPEN_API_KEY not set. /api/generate will return 500 until you configure it. Add OPEN_API_KEY (or the OPEN_AI_KEY repository secret) to resolve this.'
  );
} else if (!process.env.OPEN_API_KEY && process.env.OPEN_AI_KEY) {
  console.info('[INFO] Using OPEN_AI_KEY repository secret as OPEN_API_KEY.');
} else if (!process.env.OPEN_API_KEY && process.env.AI_API_KEY) {
  console.warn('[WARN] Falling back to legacy AI_API_KEY environment variable.');
}

if (PERPLEXITY_API_KEY) {
  console.info('[INFO] Perplexity API configured for deep research capabilities.');
} else {
  console.warn(
    '[WARN] API_KEY (Perplexity) not set. /api/research endpoints will return 503 until you configure it.'
  );
}

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

const defaultDevelopmentOrigins = ['http://localhost:3000'];
const effectiveCorsOrigins =
  corsOrigins && corsOrigins.length > 0
    ? corsOrigins
    : isProduction
      ? []
      : defaultDevelopmentOrigins;

if (effectiveCorsOrigins.length === 0) {
  throw new Error('CORS_ORIGIN is required in production to define the allowed origin allowlist.');
}

const allowedOrigins = new Set(effectiveCorsOrigins);

const redisUrl = process.env.REDIS_URL;
let sessionStore;

if (redisUrl) {
  const redisClient = createRedisClient({ url: redisUrl });
  redisClient.on('error', (err) => {
    console.error('[ERROR] Redis client error', err);
  });

  try {
    await redisClient.connect();
    sessionStore = new RedisStore({
      client: redisClient,
      prefix: 'creatorflow:sess:',
      disableTouch: true,
    });
  } catch (error) {
    if (isProduction) {
      throw new Error('Failed to connect to Redis session store.');
    }
    console.warn('[WARN] Redis connection failed. Falling back to in-memory session store for local development.', error);
  }
} else if (isProduction) {
  throw new Error('REDIS_URL is required in production for persistent session storage.');
} else {
  console.warn('[WARN] REDIS_URL not set. Falling back to in-memory session store for local development only.');
}

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const contentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://cdn.tailwindcss.com',
      'https://unpkg.com',
      'https://cdn.jsdelivr.net',
    ],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: [],
  },
};

app.use(
  helmet({
    contentSecurityPolicy,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    permissionsPolicy: {
      features: {
        camera: [],
        geolocation: [],
        microphone: [],
        payment: [],
      },
    },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      const error = new Error('CORS origin denied');
      error.status = 403;
      return callback(error);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: SESSION_SECRET || 'development-session-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: sessionCookieConfig,
    name: SESSION_COOKIE_NAME,
  })
);
const csrfProtection = csurf({ cookie: false });
app.use(passport.initialize());
app.use(passport.session());

// ============================================
// Voice Routes
// ============================================

// GET /api/voices - List available voice personas
app.get('/api/voices', (_req, res) => {
  const voices = getAvailableVoices();
  res.json({
    ok: true,
    voices,
    count: voices.length,
  });
});

// POST /api/generate/with-voice - Generate content with specific voice
app.post('/api/generate/with-voice', async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({
      ok: false,
      error:
        'OpenAI integration is not configured. Add OPEN_API_KEY (or set the OPEN_AI_KEY secret) on the server to enable content generation.',
    });
  }

  const { input, voiceId, template, platform, tone } = req.body || {};

  // Validate voice
  if (!voiceId || !VOICE_PERSONAS[voiceId]) {
    return res.status(400).json({
      ok: false,
      error: `Invalid voice ID. Available voices: ${AVAILABLE_VOICE_IDS}`,
    });
  }

  // Validate input
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'input is required and must be a non-empty string.',
    });
  }

  if (input.length > 5000) {
    return res.status(400).json({
      ok: false,
      error: 'input must be 5000 characters or less.',
    });
  }

  try {
    let prompt = input;

    // If template is provided, use it to structure the prompt
    if (template) {
      const allowedTemplates = ['post', 'script', 'caption', 'article', 'freeform'];
      if (!allowedTemplates.includes(template)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid template. Available: ${allowedTemplates.join(', ')}`,
        });
      }

      if (template !== 'freeform') {
        prompt = buildPrompt({ template, input, platform, tone });
      }
    }

    // Generate with voice persona
    const content = await generateWithVoice({
      apiKey: OPEN_API_KEY,
      prompt,
      voiceId,
      overrides: {
        temperature: tone === 'creative' ? 0.9 : 0.7,
      },
    });

    // Validate against prohibited words if applicable
    const persona = VOICE_PERSONAS[voiceId];
    const prohibitedWordsFound = validateContentForVoice(content, voiceId);

    return res.json({
      ok: true,
      voiceId,
      voice: persona.name,
      template: template || null,
      platform: platform || null,
      content,
      warnings: prohibitedWordsFound.length > 0 
        ? {
            message: 'Content contains prohibited words for this voice',
            words: prohibitedWordsFound,
          }
        : null,
    });
  } catch (err) {
    console.error('[ERROR] /api/generate/with-voice', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Failed to generate content with voice.',
    });
  }
});

// POST /api/voices/validate - Validate content against a voice's prohibited words
app.post('/api/voices/validate', (req, res) => {
  const { content, voiceId } = req.body || {};

  if (!voiceId || !VOICE_PERSONAS[voiceId]) {
    return res.status(400).json({
      ok: false,
      error: `Invalid voice ID. Available voices: ${AVAILABLE_VOICE_IDS}`,
    });
  }

  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'content is required and must be a string.',
    });
  }

  const prohibitedWords = validateContentForVoice(content, voiceId);
  const persona = VOICE_PERSONAS[voiceId];

  res.json({
    ok: true,
    voiceId,
    voice: persona.name,
    prohibitedWordsFound: prohibitedWords,
    isValid: prohibitedWords.length === 0,
    contentLength: content.length,
  });
});

// ============================================
// Passport Configuration
// ============================================

function mapPassportProfile(profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    provider: profile.provider,
    emails: Array.isArray(profile.emails)
      ? profile.emails.map((entry) => entry.value).filter(Boolean)
      : [],
    photos: Array.isArray(profile.photos)
      ? profile.photos.map((entry) => entry.value).filter(Boolean)
      : [],
  };
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      (_accessToken, _refreshToken, profile, done) => {
        done(null, mapPassportProfile(profile));
      }
    )
  );
  configuredAuthProviders.push('google');

  app.get(
    '/auth/google',
    createOAuthInitiationHandler('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account',
    })
  );

  app.get(
    '/auth/google/callback',
    createOAuthStateGuard('google', '/login.html?error=google_oauth_state'),
    passport.authenticate('google', {
      failureRedirect: '/login.html?error=google',
      failureMessage: true,
    }),
    (req, res) => {
      res.redirect('/dashboard.html');
    }
  );
} else {
  console.warn(
    '[WARN] Google OAuth credentials missing. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to enable Google login.'
  );
}

if (FACEBOOK_APP_ID && FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: FACEBOOK_APP_ID,
        clientSecret: FACEBOOK_APP_SECRET,
        callbackURL: FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'emails', 'photos'],
      },
      (_accessToken, _refreshToken, profile, done) => {
        done(null, mapPassportProfile(profile));
      }
    )
  );
  configuredAuthProviders.push('facebook');

  app.get(
    '/auth/facebook',
    createOAuthInitiationHandler('facebook', {
      scope: ['email'],
    })
  );

  app.get(
    '/auth/facebook/callback',
    createOAuthStateGuard('facebook', '/login.html?error=facebook_oauth_state'),
    passport.authenticate('facebook', {
      failureRedirect: '/login.html?error=facebook',
      failureMessage: true,
    }),
    (req, res) => {
      res.redirect('/dashboard.html');
    }
  );
} else {
  console.warn(
    '[WARN] Facebook OAuth credentials missing. FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are required to enable Facebook login.'
  );
}

app.get('/auth/providers', (req, res) => {
  res.json({ providers: configuredAuthProviders });
});

// ============================================
// Authentication & Session Routes
// ============================================

app.get('/api/auth/status', (req, res) => {
  const isAuthenticated = Boolean(req.isAuthenticated && req.isAuthenticated());
  res.json({
    authenticated: isAuthenticated,
    user: isAuthenticated ? req.user : null,
  });
});

app.get('/api/auth/csrf', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.post('/api/auth/logout', requireAuth, csrfProtection, (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('[ERROR] logout failed', err);
      return res.status(500).json({ ok: false, error: 'Failed to log out.' });
    }

    if (req.session) {
      req.session.destroy(() => {
        res.clearCookie(SESSION_COOKIE_NAME, {
          httpOnly: sessionCookieConfig.httpOnly,
          sameSite: sessionCookieConfig.sameSite,
          secure: sessionCookieConfig.secure,
        });
        res.json({ ok: true });
      });
    } else {
      res.json({ ok: true });
    }
  });
});

if (isTest) {
  app.post('/__test/login', (req, res) => {
    const { userId, displayName } = req.body || {};
    const user = {
      id: userId || 'test-user',
      displayName: displayName || 'Test User',
      provider: 'test',
      emails: [],
      photos: [],
    };

    req.login(user, (err) => {
      if (err) {
        console.error('[ERROR] test login failed', err);
        return res.status(500).json({ ok: false, error: 'Failed to establish session.' });
      }

      return res.json({ ok: true, user });
    });
  });
}

// ============================================
// Middleware & Helper Functions
// ============================================

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({ ok: false, error: 'Authentication required.' });
}

function buildIntegrationCatalogResponse() {
  const openAiConfigured = Boolean(OPEN_API_KEY);
  const perplexityConfigured = Boolean(PERPLEXITY_API_KEY);

  return connectorsCatalog.map((connector) => {
    let connected = false;
    let statusMessage = '';

    if (connector.provider === 'openai') {
      connected = openAiConfigured;
      statusMessage = connected
        ? 'Active via server-side OpenAI credential.'
        : 'Add OPEN_API_KEY (or set the OPEN_AI_KEY secret) to enable this connector.';
    } else if (connector.provider === 'perplexity') {
      connected = perplexityConfigured;
      statusMessage = connected
        ? 'Active via server-side Perplexity credential.'
        : 'Add API_KEY (Perplexity) to enable this connector.';
    }

    const status = connected ? 'connected' : 'requires_configuration';

    return {
      ...connector,
      connected,
      status,
      statusMessage,
    };
  });
}

function extractBalancedJsonFragment(source, startIndex) {
  if (startIndex < 0 || startIndex >= source.length) {
    return null;
  }

  const openingChar = source[startIndex];
  const closingChar = openingChar === '{' ? '}' : openingChar === '[' ? ']' : null;

  if (!closingChar) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openingChar) {
      depth += 1;
    } else if (char === closingChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return source.slice(startIndex);
}

function safeParseJsonPayload(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  // Build an ordered list of candidates (most likely first) without duplicates.
  // Using an array preserves insertion order and lets us skip the Set overhead.
  const seen = new Set();
  const candidates = [];

  const addCandidate = (s) => {
    if (s && !seen.has(s)) {
      seen.add(s);
      candidates.push(s);
    }
  };

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\S\s]*?)\s*```/i);
  if (fencedMatch && typeof fencedMatch[1] === 'string') {
    addCandidate(fencedMatch[1].trim());
  }

  addCandidate(trimmed);

  const startIndex = trimmed.search(/[[{]/);
  if (startIndex >= 0) {
    addCandidate(trimmed.slice(startIndex).trim());

    const balanced = extractBalancedJsonFragment(trimmed, startIndex);
    if (balanced) {
      addCandidate(balanced.trim());
    }
  }

  let lastError = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn('[WARN] Failed to parse JSON payload from AI response.', lastError);
  }

  return null;
}

// ============================================
// Validation Schemas
// ============================================

function validateGenerateBody(body) {
  const { template, input, platform, tone } = body || {};

  const allowedTemplates = ['post', 'script', 'caption'];
  const allowedTones = ['default', 'casual', 'professional', 'edgy'];

  if (typeof input !== 'string' || input.trim().length === 0) {
    return 'Input is required.';
  }
  if (input.length > 1200) {
    return 'Input is too long (max 1200 characters).';
  }
  if (!allowedTemplates.includes(template)) {
    return 'Invalid template.';
  }
  if (tone && !allowedTones.includes(tone)) {
    return 'Invalid tone.';
  }

  if (platform && platform.length > 40) {
    return 'Platform value is too long.';
  }

  return null;
}

function validateAnalysisBody(body) {
  const { content, platform, goals } = body || {};

  if (typeof content !== 'string' || content.trim().length === 0) {
    return 'Content to analyze is required.';
  }

  if (content.length > 2000) {
    return 'Content is too long (max 2000 characters).';
  }

  if (platform && typeof platform !== 'string') {
    return 'Platform must be a string.';
  }

  if (goals && typeof goals !== 'string') {
    return 'Goals must be a string.';
  }

  return null;
}

function buildPrompt({ template, input, platform, tone }) {
  const safePlatform = platform || 'social media';
  const safeTone = tone || 'default';

  switch (template) {
    case 'post':
      return `
You are an expert content writer for ${safePlatform}.
Tone: ${safeTone}.
Write a short, punchy post based on the user's notes.
Output format:
1) Post text (1–3 sentences)
2) A line starting with "Hashtags:" followed by 5-10 relevant hashtags.

User notes:
${input}
`.trim();

    case 'script':
      return `
You are a creator coach helping with a short video script for ${safePlatform}.
Tone: ${safeTone}.
Write a concise script with this structure:
- HOOK (1–2 lines)
- BODY (3–6 lines)
- CTA (1–2 lines)

User notes:
${input}
`.trim();

    case 'caption':
      return `
You are writing a caption for ${safePlatform}.
Tone: ${safeTone}.
Write:
1) A single, scroll-stopping caption (1–2 sentences)
2) A second line starting "CTA:" with a simple call to action.

User notes:
${input}
`.trim();

    default:
      return input;
  }
}

function buildAnalysisPrompt({ content, platform, goals, creatorName }) {
  const safePlatform = platform ? platform : 'social media';
  const goalText = goals ? `Creator goals: ${goals}` : 'Focus on clarity, engagement, and conversion.';
  const creatorText = creatorName
    ? `The content author is ${creatorName}.`
    : 'The creator is seeking actionable coaching.';

  return `You are an experienced strategist for ${safePlatform} content.
${creatorText}
${goalText}
Review the post below and provide a concise, structured critique with these sections:
- Summary: one paragraph describing the current content.
- Strengths: three bullet points that highlight what works well.
- Opportunities: three bullet points covering issues or risks.
- Suggested Hooks: three bullet points with alternative opening hooks.
- Call To Actions: two bullet points for compelling CTAs tailored to ${safePlatform}.
Keep feedback specific to the provided content and goals.

Content to analyze:
"""
${content.trim()}
"""`;
}

async function callAiProvider(prompt, options = {}) {
  if (!OPEN_API_KEY) {
    throw new Error('OPEN_API_KEY not configured on server. Provide OPEN_API_KEY or OPEN_AI_KEY.');
  }

  return generateContentWithFallback({
    apiKey: OPEN_API_KEY,
    prompt,
    ...options,
  });
}

function validateConnectorSuggestionBody(body) {
  const { useCase, audience, channels, tone } = body || {};

  if (typeof useCase !== 'string' || useCase.trim().length === 0) {
    return 'useCase is required.';
  }

  if (useCase.length > 600) {
    return 'useCase is too long (max 600 characters).';
  }

  if (audience && typeof audience !== 'string') {
    return 'audience must be a string if provided.';
  }

  if (audience && audience.length > 200) {
    return 'audience is too long (max 200 characters).';
  }

  if (channels && !Array.isArray(channels)) {
    return 'channels must be an array of strings if provided.';
  }

  if (Array.isArray(channels)) {
    const invalidChannel = channels.find(
      (channel) => typeof channel !== 'string' || channel.length > 40
    );
    if (invalidChannel) {
      return 'channels must contain short string values (<= 40 chars).';
    }
  }

  if (tone && typeof tone !== 'string') {
    return 'tone must be a string if provided.';
  }

  return null;
}

function buildConnectorSuggestionPrompt({ useCase, audience, channels, tone }) {
  const audienceText = audience
    ? `Target audience: ${audience}.`
    : 'Target audience: modern creator economy teams.';
  const channelsText =
    Array.isArray(channels) && channels.length > 0
      ? `Priority channels: ${channels.join(', ')}.`
      : 'Priority channels: Instagram, TikTok, YouTube, LinkedIn.';
  const toneText = tone
    ? `Preferred collaboration tone: ${tone}.`
    : 'Preferred collaboration tone: proactive and friendly.';

  return `You are an integration architect for a content operations platform.
${audienceText}
${channelsText}
${toneText}
Use case background: ${useCase}.

Design 3 purpose-built OpenAI connector workflows that help automate the use case.
Return a strict JSON object with the shape:
{
  "summary": string,
  "connectors": [
    {
      "name": string,
      "description": string,
      "setup": string[],
      "automations": string[]
    }
  ]
}
Use double quotes, no trailing comments, no markdown, and make descriptions focused on measurable impact.`;
}

async function sendOpenAiTestResponse(res) {
  try {
    await performOpenAiHealthCheck();
    res.json({ ok: true });
  } catch (err) {
    console.error('[ERROR] OpenAI integration test failed', err);
    res
      .status(500)
      .json({ ok: false, error: err.message || 'OpenAI integration test failed.' });
  }
}

async function performOpenAiHealthCheck() {
  if (!OPEN_API_KEY) {
    throw new Error('OPEN_API_KEY not configured. Provide OPEN_API_KEY or OPEN_AI_KEY.');
  }
  const response = await fetchWithRetry(
    'https://api.openai.com/v1/models?limit=1',
    {
      headers: {
        Authorization: `Bearer ${OPEN_API_KEY}`,
      },
    },
    {
      timeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? '8000'),
      retries: Number(process.env.HTTP_MAX_RETRIES ?? '3'),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI status check failed: ${response.status} - ${text}`);
  }

  await readJsonResponse(response);
}

// ============================================
// OpenAI Routes
// ============================================

app.post('/api/generate', async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({
      ok: false,
      error:
        'OpenAI integration is not configured. Add OPEN_API_KEY (or set the OPEN_AI_KEY secret) on the server to enable content generation.',
    });
  }

  const validationError = validateGenerateBody(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { template, input, platform, tone } = req.body;

  try {
    const prompt = buildPrompt({ template, input, platform, tone });
    const aiContent = await callAiProvider(prompt);

    return res.json({
      ok: true,
      template,
      platform: platform || null,
      tone: tone || 'default',
      content: aiContent,
    });
  } catch (err) {
    console.error('[ERROR] /api/generate', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to generate content. Please try again.',
    });
  }
});

app.post('/api/content/analysis', requireAuth, csrfProtection, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({
      ok: false,
      error:
        'OpenAI integration is not configured. Add OPEN_API_KEY (or set the OPEN_AI_KEY secret) on the server to enable content analysis.',
    });
  }

  const validationError = validateAnalysisBody(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const { content, platform, goals } = req.body;

  try {
    const prompt = buildAnalysisPrompt({
      content,
      platform,
      goals,
      creatorName: req.user?.displayName,
    });
    const analysis = await callAiProvider(prompt);

    return res.json({
      ok: true,
      platform: platform || null,
      analysis,
    });
  } catch (err) {
    console.error('[ERROR] /api/content/analysis', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to analyze content. Please try again.',
    });
  }
});

app.get('/api/integrations', (_req, res) => {
  const connectors = buildIntegrationCatalogResponse();

  const cacheInfo = openAiModelService?.getCacheInfo() ?? { size: 0, expiresAt: null };

  res.json({
    ok: true,
    connectors,
    meta: {
      openai: {
        configured: Boolean(OPEN_API_KEY),
        cachedModels: cacheInfo.size,
        cacheExpiresAt: cacheInfo.expiresAt,
      },
      perplexity: {
        configured: Boolean(PERPLEXITY_API_KEY),
      },
    },
  });
});

app.get('/api/integrations/openai/status', (_req, res) => {
  res.json({
    ok: true,
    provider: 'openai',
    configured: Boolean(OPEN_API_KEY),
  });
});

app.get('/api/integrations/openai/models', async (_req, res) => {
  if (!openAiModelService) {
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  try {
    const models = await openAiModelService.listModels();
    res.json({ ok: true, models });
  } catch (err) {
    console.error('[ERROR] /api/integrations/openai/models', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to load models.' });
  }
});

app.post('/api/integrations/openai/connectors', requireAuth, csrfProtection, async (req, res) => {
  const validationError = validateConnectorSuggestionBody(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  if (!OPEN_API_KEY) {
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  try {
    const prompt = buildConnectorSuggestionPrompt(req.body);
    const aiContent = await callAiProvider(prompt, {
      temperature: 0.4,
      maxTokens: 650,
      responseFormat: 'json_object',
    });

    const parsed = safeParseJsonPayload(aiContent);
    if (parsed && Array.isArray(parsed.connectors)) {
      return res.json({
        ok: true,
        summary: parsed.summary || null,
        connectors: parsed.connectors,
      });
    }

    return res.json({ ok: true, summary: null, connectors: [], raw: aiContent });
  } catch (err) {
    console.error('[ERROR] /api/integrations/openai/connectors', err);
    res
      .status(500)
      .json({ ok: false, error: err.message || 'Failed to generate connector plan.' });
  }
});

app.post('/api/integrations/:id/test', requireAuth, csrfProtection, async (req, res) => {
  if (req.params.id !== 'openai') {
    return res.status(404).json({ ok: false, error: 'Unknown integration id.' });
  }

  if (!OPEN_API_KEY) {
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  await sendOpenAiTestResponse(res);
});

app.post('/api/integrations/openai/test', requireAuth, csrfProtection, async (_req, res) => {
  if (!OPEN_API_KEY) {
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  await sendOpenAiTestResponse(res);
});

app.get('/api/integrations/openai/videos', requireAuth, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  const validation = listVideosSchema.safeParse({
    after: Array.isArray(req.query.after) ? req.query.after[0] : req.query.after,
    limit: Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit,
    order: Array.isArray(req.query.order) ? req.query.order[0] : req.query.order,
  });

  if (!validation.success) {
    const issue = validation.error.issues[0];
    return res.status(400).json({ ok: false, error: issue?.message || 'Invalid query parameters.' });
  }

  try {
    const videos = await listVideoJobs({
      apiKey: OPEN_API_KEY,
      ...validation.data,
    });
    return res.json({ ok: true, videos });
  } catch (error) {
    console.error('[ERROR] /api/integrations/openai/videos', error);
    const status = normaliseErrorStatus(error);
    return res.status(status).json({
      ok: false,
      error: extractOpenAiErrorMessage(error, 'Failed to list videos.'),
    });
  }
});

app.get('/api/integrations/openai/videos/:videoId', requireAuth, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  try {
    const video = await retrieveVideoJob({
      apiKey: OPEN_API_KEY,
      videoId: req.params.videoId,
    });
    return res.json({ ok: true, video });
  } catch (error) {
    console.error('[ERROR] /api/integrations/openai/videos/:videoId', error);
    const status = normaliseErrorStatus(error);
    return res.status(status).json({
      ok: false,
      error: extractOpenAiErrorMessage(error, 'Failed to retrieve video.'),
    });
  }
});

app.delete('/api/integrations/openai/videos/:videoId', requireAuth, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  try {
    const response = await deleteVideoJob({
      apiKey: OPEN_API_KEY,
      videoId: req.params.videoId,
    });
    return res.json({ ok: true, video: response });
  } catch (error) {
    console.error('[ERROR] DELETE /api/integrations/openai/videos/:videoId', error);
    const status = normaliseErrorStatus(error);
    return res.status(status).json({
      ok: false,
      error: extractOpenAiErrorMessage(error, 'Failed to delete video.'),
    });
  }
});

app.get('/api/integrations/openai/videos/:videoId/content', requireAuth, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  const validation = downloadVariantSchema.safeParse({
    variant: Array.isArray(req.query.variant) ? req.query.variant[0] : req.query.variant,
  });

  if (!validation.success) {
    const issue = validation.error.issues[0];
    return res.status(400).json({ ok: false, error: issue?.message || 'Invalid query parameters.' });
  }

  try {
    const result = await downloadVideoContent({
      apiKey: OPEN_API_KEY,
      videoId: req.params.videoId,
      variant: validation.data.variant,
    });

    if (result.headers['content-type']) {
      res.setHeader('Content-Type', result.headers['content-type']);
    }
    if (result.headers['content-disposition']) {
      res.setHeader('Content-Disposition', result.headers['content-disposition']);
    }
    res.setHeader('Content-Length', String(result.buffer.length));

    return res.status(result.status).send(result.buffer);
  } catch (error) {
    console.error('[ERROR] GET /api/integrations/openai/videos/:videoId/content', error);
    const status = normaliseErrorStatus(error);
    return res.status(status).json({
      ok: false,
      error: extractOpenAiErrorMessage(error, 'Failed to download video content.'),
    });
  }
});

app.post('/api/integrations/openai/images/generations', requireAuth, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  const validation = imageGenerationSchema.safeParse(req.body || {});
  if (!validation.success) {
    const issue = validation.error.issues[0];
    return res.status(400).json({ ok: false, error: issue?.message || 'Invalid payload.' });
  }

  try {
    const payload = toSnakeCasePayload(validation.data);
    const response = await createImageGeneration({
      apiKey: OPEN_API_KEY,
      payload,
    });

    return res.json({ ok: true, data: response });
  } catch (error) {
    console.error('[ERROR] /api/integrations/openai/images/generations', error);
    const status = normaliseErrorStatus(error);
    return res.status(status).json({
      ok: false,
      error: extractOpenAiErrorMessage(error, 'Failed to generate image.'),
    });
  }
});

app.post(
  '/api/integrations/openai/images/edits',
  requireAuth,
  upload.fields([
    { name: 'image', maxCount: 16 },
    { name: 'mask', maxCount: 1 },
  ]),
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
    }

    const validation = imageEditOptionsSchema.safeParse(req.body || {});
    if (!validation.success) {
      const issue = validation.error.issues[0];
      return res.status(400).json({ ok: false, error: issue?.message || 'Invalid payload.' });
    }

    const imageFiles = Array.isArray(req.files?.image) ? req.files.image.map(normaliseMulterFile) : [];
    if (!imageFiles || imageFiles.length === 0) {
      return res.status(400).json({ ok: false, error: 'At least one image file is required.' });
    }

    try {
      const response = await createImageEdit({
        apiKey: OPEN_API_KEY,
        images: imageFiles,
        mask: normaliseMulterFile(Array.isArray(req.files?.mask) ? req.files.mask[0] : null),
        options: toSnakeCasePayload(validation.data),
      });

      return res.json({ ok: true, data: response });
    } catch (error) {
      console.error('[ERROR] /api/integrations/openai/images/edits', error);
      const status = normaliseErrorStatus(error);
      return res.status(status).json({
        ok: false,
        error: extractOpenAiErrorMessage(error, 'Failed to edit image.'),
      });
    }
  }
);

app.post(
  '/api/integrations/openai/images/variations',
  requireAuth,
  upload.single('image'),
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
    }

    const validation = imageVariationOptionsSchema.safeParse(req.body || {});
    if (!validation.success) {
      const issue = validation.error.issues[0];
      return res.status(400).json({ ok: false, error: issue?.message || 'Invalid payload.' });
    }

    const imageFile = normaliseMulterFile(req.file);
    if (!imageFile) {
      return res.status(400).json({ ok: false, error: 'An image file is required.' });
    }

    try {
      const response = await createImageVariation({
        apiKey: OPEN_API_KEY,
        image: imageFile,
        options: toSnakeCasePayload(validation.data),
      });

      return res.json({ ok: true, data: response });
    } catch (error) {
      console.error('[ERROR] /api/integrations/openai/images/variations', error);
      const status = normaliseErrorStatus(error);
      return res.status(status).json({
        ok: false,
        error: extractOpenAiErrorMessage(error, 'Failed to create image variation.'),
      });
    }
  }
);

// ============================================
// Image Routes
// ============================================

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const IMAGE_UPLOAD_SIZE_LIMIT_BYTES = 4 * 1024 * 1024; // 4 MB — OpenAI API limit

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_SIZE_LIMIT_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Allowed types: ${[...ALLOWED_IMAGE_MIME_TYPES].join(', ')}`));
    }
  },
});

const ALLOWED_IMAGE_SIZES = new Set([
  '256x256', '512x512', '1024x1024', '1792x1024', '1024x1792',
]);
const ALLOWED_IMAGE_QUALITIES = new Set(['standard', 'hd']);
const ALLOWED_IMAGE_STYLES = new Set(['vivid', 'natural']);
const ALLOWED_IMAGE_MODELS = new Set(['dall-e-2', 'dall-e-3']);
const ALLOWED_RESPONSE_FORMATS = new Set(['url', 'b64_json']);

function validateImageGenerateBody(body) {
  const { prompt, size, quality, style, model, n, response_format: responseFormat } = body || {};

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return 'prompt is required and must be a non-empty string.';
  }
  if (prompt.length > 4000) {
    return 'prompt must be 4000 characters or less.';
  }
  if (size && !ALLOWED_IMAGE_SIZES.has(size)) {
    return `Invalid size. Allowed: ${[...ALLOWED_IMAGE_SIZES].join(', ')}.`;
  }
  if (quality && !ALLOWED_IMAGE_QUALITIES.has(quality)) {
    return `Invalid quality. Allowed: ${[...ALLOWED_IMAGE_QUALITIES].join(', ')}.`;
  }
  if (style && !ALLOWED_IMAGE_STYLES.has(style)) {
    return `Invalid style. Allowed: ${[...ALLOWED_IMAGE_STYLES].join(', ')}.`;
  }
  if (model && !ALLOWED_IMAGE_MODELS.has(model)) {
    return `Invalid model. Allowed: ${[...ALLOWED_IMAGE_MODELS].join(', ')}.`;
  }
  if (n !== undefined) {
    const count = Number(n);
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      return 'n must be an integer between 1 and 10.';
    }
  }
  if (responseFormat && !ALLOWED_RESPONSE_FORMATS.has(responseFormat)) {
    return `Invalid response_format. Allowed: ${[...ALLOWED_RESPONSE_FORMATS].join(', ')}.`;
  }
  return null;
}

// POST /api/images/generate — text-to-image generation
app.post('/api/images/generate', requireAuth, csrfProtection, async (req, res) => {
  const validationError = validateImageGenerateBody(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  if (!OPEN_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'OpenAI integration is not configured. Add OPEN_API_KEY to enable image generation.',
    });
  }

  const { prompt, size, quality, style, model, n, response_format: responseFormat } = req.body;

  try {
    const payload = { prompt };
    if (size) payload.size = size;
    if (quality) payload.quality = quality;
    if (style) payload.style = style;
    if (model) payload.model = model;
    if (n) payload.n = Number(n);
    if (responseFormat) payload.response_format = responseFormat;

    const result = await createImageGeneration({ apiKey: OPEN_API_KEY, payload });

    return res.json({ ok: true, data: result.data ?? result });
  } catch (err) {
    console.error('[ERROR] /api/images/generate', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Failed to generate image.',
    });
  }
});

// POST /api/images/edit — edit an uploaded image with a prompt and optional mask
app.post(
  '/api/images/edit',
  requireAuth,
  csrfProtection,
  imageUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mask', maxCount: 1 },
  ]),
  async (req, res) => {
    const { prompt, size, n, response_format: responseFormat } = req.body || {};

    if (!req.files?.image?.[0]) {
      return res.status(400).json({ ok: false, error: 'image file is required.' });
    }

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'prompt is required.' });
    }

    if (prompt.length > 1000) {
      return res.status(400).json({ ok: false, error: 'prompt must be 1000 characters or less.' });
    }

    if (!OPEN_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: 'OpenAI integration is not configured. Add OPEN_API_KEY to enable image editing.',
      });
    }

    const imageFile = req.files.image[0];
    const maskFile = req.files?.mask?.[0];

    const images = [
      {
        buffer: imageFile.buffer,
        mimetype: imageFile.mimetype,
        filename: imageFile.originalname,
      },
    ];

    const mask = maskFile
      ? { buffer: maskFile.buffer, mimetype: maskFile.mimetype, filename: maskFile.originalname }
      : undefined;

    const options = { prompt };
    if (size && ALLOWED_IMAGE_SIZES.has(size)) options.size = size;
    if (n !== undefined) {
      const count = Number(n);
      if (!Number.isInteger(count) || count < 1 || count > 10) {
        return res.status(400).json({ ok: false, error: 'n must be an integer between 1 and 10.' });
      }
      options.n = count;
    }
    if (responseFormat && ALLOWED_RESPONSE_FORMATS.has(responseFormat)) {
      options.response_format = responseFormat;
    }

    try {
      const result = await createImageEdit({ apiKey: OPEN_API_KEY, images, mask, options });

      return res.json({ ok: true, data: result.data ?? result });
    } catch (err) {
      console.error('[ERROR] /api/images/edit', err);
      return res.status(500).json({
        ok: false,
        error: err.message || 'Failed to edit image.',
      });
    }
  }
);

// POST /api/images/variation — create variations of an uploaded image
app.post(
  '/api/images/variation',
  requireAuth,
  csrfProtection,
  imageUpload.single('image'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'image file is required.' });
    }

    const { size, n, response_format: responseFormat } = req.body || {};

    if (!OPEN_API_KEY) {
      return res.status(503).json({
        ok: false,
        error:
          'OpenAI integration is not configured. Add OPEN_API_KEY to enable image variations.',
      });
    }

    const image = {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
    };

    const options = {};
    if (size && ALLOWED_IMAGE_SIZES.has(size)) options.size = size;
    if (n !== undefined) {
      const count = Number(n);
      if (!Number.isInteger(count) || count < 1 || count > 10) {
        return res.status(400).json({ ok: false, error: 'n must be an integer between 1 and 10.' });
      }
      options.n = count;
    }
    if (responseFormat && ALLOWED_RESPONSE_FORMATS.has(responseFormat)) {
      options.response_format = responseFormat;
    }

    try {
      const result = await createImageVariation({ apiKey: OPEN_API_KEY, image, options });

      return res.json({ ok: true, data: result.data ?? result });
    } catch (err) {
      console.error('[ERROR] /api/images/variation', err);
      return res.status(500).json({
        ok: false,
        error: err.message || 'Failed to create image variation.',
      });
    }
  }
);

// ============================================
// Serve Static Files
// ============================================

app.use(express.static(publicDirectory));

// ============================================
// Start Server
// ============================================

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[INFO] Server running on http://localhost:${PORT}`);
  });
}

export { app };
export default app;
