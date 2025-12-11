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
import csurf from 'csurf';
import { z } from 'zod';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';

import { generateContentWithFallback } from './lib/openai.js';
import { createOpenAiModelService } from './lib/openai-model-service.js';
import {
  createImageEdit,
  createImageGeneration,
  createImageVariation,
  createVideoJob,
  deleteVideoJob,
  downloadVideoContent,
  listVideoJobs,
  remixVideoJob,
  retrieveVideoJob,
} from './lib/openai-media.js';
import {
  performDeepResearch,
  buildResearchPrompt,
  analyzeCompetitiveContent,
  getAudienceInsights,
} from './lib/perplexity.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);
const publicDirectory = path.join(moduleDirectory, 'public');
const oauthStateSessionKey = 'oauthStates';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB safety limit for upstream assets
const SESSION_COOKIE_NAME = 'creatorflow.sid';
const sessionCookieConfig = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  maxAge: 1000 * 60 * 60 * 4, // 4 hours
};
const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
]);
const allowedVideoMimeTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
});

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

const resolvedOpenApiKey =
  process.env.OPEN_API_KEY ?? process.env.OPEN_AI_KEY ?? process.env.AI_API_KEY ?? null;

if (!process.env.OPEN_API_KEY && process.env.OPEN_AI_KEY) {
  process.env.OPEN_API_KEY = process.env.OPEN_AI_KEY;
}

const OPEN_API_KEY = resolvedOpenApiKey;
const PERPLEXITY_API_KEY = process.env.API_KEY; // Your Perplexity API key

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

if (!PERPLEXITY_API_KEY) {
  console.warn(
    '[WARN] API_KEY (Perplexity) not set. /api/research endpoints will return 503 until you configure it.'
  );
} else {
  console.info('[INFO] Perplexity API configured for deep research capabilities.');
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
let sessionStore = undefined;

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

function issueOAuthStateAndAuthenticate(provider, options) {
  return (req, res, next) => {
    const state = crypto.randomBytes(32).toString('hex');
    if (!req.session[oauthStateSessionKey]) {
      req.session[oauthStateSessionKey] = {};
    }
    req.session[oauthStateSessionKey][provider] = state;
    req.session.save();

    const authenticateOptions = { ...options, state };
    passport.authenticate(provider, authenticateOptions)(req, res, next);
  };
}

function enforceValidOAuthState(provider) {
  return (req, res, next) => {
    const { state } = req.query || {};
    const savedState = req.session?.[oauthStateSessionKey]?.[provider];

    if (!state || !savedState || state !== savedState) {
      console.warn('[WARN] OAuth state validation failed', { provider, state, savedState });
      return res.status(403).json({ ok: false, error: 'Invalid OAuth state.' });
    }

    delete req.session[oauthStateSessionKey][provider];
    req.session.save();
    next();
  };
}

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
    issueOAuthStateAndAuthenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account',
    })
  );

  app.get(
    '/auth/google/callback',
    enforceValidOAuthState('google'),
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
    issueOAuthStateAndAuthenticate('facebook', {
      scope: ['email'],
    })
  );

  app.get(
    '/auth/facebook/callback',
    enforceValidOAuthState('facebook'),
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

  const candidates = new Set();

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\S\s]*?)\s*```/i);
  if (fencedMatch && typeof fencedMatch[1] === 'string') {
    candidates.add(fencedMatch[1].trim());
  }

  candidates.add(trimmed);

  const startIndex = trimmed.search(/[[{]/);
  if (startIndex >= 0) {
    const fromFirstBracket = trimmed.slice(startIndex).trim();
    if (fromFirstBracket) {
      candidates.add(fromFirstBracket);
    }

    const balanced = extractBalancedJsonFragment(trimmed, startIndex);
    if (balanced) {
      candidates.add(balanced.trim());
    }
  }

  let lastError = null;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

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

const createVideoSchema = z.object({
  prompt: z.string().min(1).max(2000),
  model: z.string().trim().min(1).max(100).optional(),
  seconds: z.coerce.number().int().min(1).max(60).optional(),
  size: z.string().trim().regex(/^\d+x\d+$/).optional(),
  quality: z.string().trim().max(20).optional(),
});

const remixVideoSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

const listVideosSchema = z.object({
  after: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const downloadVariantSchema = z.object({
  variant: z.string().trim().min(1).max(64).optional(),
});

const imageGenerationSchema = z.object({
  prompt: z.string().min(1).max(32_000),
  model: z.string().trim().min(1).max(100).optional(),
  n: z.coerce.number().int().min(1).max(10).optional(),
  size: z.string().trim().min(1).max(20).optional(),
  responseFormat: z.enum(['url', 'b64_json']).optional(),
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
  quality: z.string().trim().min(1).max(20).optional(),
  style: z.string().trim().min(1).max(20).optional(),
  user: z.string().trim().min(1).max(64).optional(),
  moderation: z.string().trim().min(1).max(20).optional(),
  outputFormat: z.string().trim().min(1).max(10).optional(),
  outputCompression: z.coerce.number().int().min(0).max(100).optional(),
  partialImages: z.coerce.number().int().min(0).max(3).optional(),
  stream: z.coerce.boolean().optional(),
});

const imageEditOptionsSchema = z.object({
  prompt: z.string().min(1).max(32_000),
  model: z.string().trim().min(1).max(100).optional(),
  n: z.coerce.number().int().min(1).max(10).optional(),
  size: z.string().trim().min(1).max(20).optional(),
  responseFormat: z.enum(['url', 'b64_json']).optional(),
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
  quality: z.string().trim().min(1).max(20).optional(),
  user: z.string().trim().min(1).max(64).optional(),
  outputFormat: z.string().trim().min(1).max(10).optional(),
  outputCompression: z.coerce.number().int().min(0).max(100).optional(),
});

const imageVariationOptionsSchema = z.object({
  model: z.string().trim().min(1).max(100).optional(),
  n: z.coerce.number().int().min(1).max(10).optional(),
  size: z.string().trim().min(1).max(20).optional(),
  responseFormat: z.enum(['url', 'b64_json']).optional(),
  user: z.string().trim().min(1).max(64).optional(),
});

// ============================================
// Utility Functions
// ============================================

function toSnakeCasePayload(data) {
  return Object.fromEntries(
    Object.entries(data)
      .map(([key, value]) => {
        if (value === undefined || value === null) {
          return [null, null];
        }

        const snakeKey = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
        return [snakeKey, value];
      })
      .filter(([key]) => Boolean(key))
  );
}

function normaliseMulterFile(file) {
  if (!file) {
    return null;
  }

  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    filename: file.originalname,
    size: typeof file.size === 'number' ? file.size : file.buffer?.length || null,
  };
}

function validateUploadedFile(file, allowedMimeTypes, fieldName) {
  if (!file) {
    return null;
  }

  if (!allowedMimeTypes.has(file.mimetype)) {
    return `${fieldName} must be one of the allowed types: ${Array.from(allowedMimeTypes).join(', ')}.`;
  }

  const fileSize = typeof file.size === 'number' ? file.size : file.buffer?.length;
  if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) {
    return `${fieldName} exceeds the maximum allowed size of ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`;
  }

  return null;
}

function validateUploadedFiles(files, allowedMimeTypes, fieldName) {
  for (const file of files) {
    const validationError = validateUploadedFile(file, allowedMimeTypes, fieldName);
    if (validationError) {
      return validationError;
    }
  }
  return null;
}

function normaliseErrorStatus(error, fallback = 500) {
  const status = typeof error?.status === 'number' ? error.status : fallback;
  if (status >= 400 && status <= 599) {
    return status;
  }
  return fallback;
}

function extractOpenAiErrorMessage(error, fallbackMessage) {
  if (error?.status && error.status >= 400 && error.status < 500) {
    if (typeof error?.body === 'string' && error.body.trim().length > 0) {
      return error.body.trim().slice(0, 500);
    }
    if (typeof error?.message === 'string' && error.message.trim().length > 0) {
      return error.message.trim();
    }
  }

  if (
    typeof error?.message === 'string' &&
    error.message.trim().length > 0 &&
    error.message.length < 140
  ) {
    return error.message.trim();
  }

  return fallbackMessage;
}

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

function createTimeoutSignal(timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timeout),
  };
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

  const { signal, dispose } = createTimeoutSignal();

  try {
    const response = await fetch('https://api.openai.com/v1/models?limit=1', {
      headers: {
        Authorization: `Bearer ${OPEN_API_KEY}`,
      },
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI status check failed: ${response.status} - ${text}`);
    }

    await response.json();
  } finally {
    dispose();
  }
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

app.post(
  '/api/integrations/openai/videos',
  requireAuth,
  csrfProtection,
  upload.single('input_reference'),
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res
        .status(503)
        .json({ ok: false, error: 'OpenAI integration is not configured.' });
    }

    const validationError = validateUploadedFile(
      req.file,
      allowedVideoMimeTypes,
      'input_reference'
    );
    if (validationError) {
      return res.status(400).json({ ok: false, error: validationError });
    }

    const validation = createVideoSchema.safeParse({
      prompt: req.body?.prompt,
      model: req.body?.model,
      seconds: req.body?.seconds,
      size: req.body?.size,
      quality: req.body?.quality,
    });

    if (!validation.success) {
      const issue = validation.error.issues[0];
      return res.status(400).json({ ok: false, error: issue?.message || 'Invalid payload.' });
    }

    try {
      const video = await createVideoJob({
        apiKey: OPEN_API_KEY,
        ...validation.data,
        inputReference: normaliseMulterFile(req.file),
      });

      return res.json({ ok: true, video });
    } catch (error) {
      console.error('[ERROR] /api/integrations/openai/videos', error);
      const status = normaliseErrorStatus(error);
      return res.status(status).json({
        ok: false,
        error: extractOpenAiErrorMessage(error, 'Failed to create video job.'),
      });
    }
  }
);

app.post(
  '/api/integrations/openai/videos/:videoId/remix',
  requireAuth,
  csrfProtection,
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res
        .status(503)
        .json({ ok: false, error: 'OpenAI integration is not configured.' });
    }

    const validation = remixVideoSchema.safeParse({ prompt: req.body?.prompt });
    if (!validation.success) {
      const issue = validation.error.issues[0];
      return res.status(400).json({ ok: false, error: issue?.message || 'Invalid payload.' });
    }

    try {
      const video = await remixVideoJob({
        apiKey: OPEN_API_KEY,
        videoId: req.params.videoId,
        prompt: validation.data.prompt,
      });
      return res.json({ ok: true, video });
    } catch (error) {
      console.error('[ERROR] /api/integrations/openai/videos/:videoId/remix', error);
      const status = normaliseErrorStatus(error);
      return res.status(status).json({
        ok: false,
        error: extractOpenAiErrorMessage(error, 'Failed to remix video.'),
      });
    }
  }
);

app.get('/api/integrations/openai/videos', requireAuth, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  const validation = listVideosSchema.safeParse({
    after: Array.isArray(req.query.after) ? req.query.after[0] : req.query.after,
    limit: Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit,
    order: Array.isArray(req.query.order) ? req.query.order[0] : req.query.order,
  });

  if (!validation.success) {
    const issue = validation.error.issues[0];
    return res
      .status(400)
      .json({ ok: false, error: issue?.message || 'Invalid query parameters.' });
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
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
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
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
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
    return res
      .status(503)
      .json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  const validation = downloadVariantSchema.safeParse({
    variant: Array.isArray(req.query.variant) ? req.query.variant[0] : req.query.variant,
  });

  if (!validation.success) {
    const issue = validation.error.issues[0];
    return res
      .status(400)
      .json({ ok: false, error: issue?.message || 'Invalid query parameters.' });
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

app.post(
  '/api/integrations/openai/images/generations',
  requireAuth,
  csrfProtection,
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res
        .status(503)
        .json({ ok: false, error: 'OpenAI integration is not configured.' });
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
  }
);

app.post(
  '/api/integrations/openai/images/edits',
  requireAuth,
  csrfProtection,
  upload.fields([
    { name: 'image', maxCount: 16 },
    { name: 'mask', maxCount: 1 },
  ]),
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res
        .status(503)
        .json({ ok: false, error: 'OpenAI integration is not configured.' });
    }

    const validation = imageEditOptionsSchema.safeParse(req.body || {});
    if (!validation.success) {
      const issue = validation.error.issues[0];
      return res.status(400).json({ ok: false, error: issue?.message || 'Invalid payload.' });
    }

    const rawImageFiles = Array.isArray(req.files?.image) ? req.files.image : [];
    if (!rawImageFiles || rawImageFiles.length === 0) {
      return res.status(400).json({ ok: false, error: 'At least one image file is required.' });
    }

    const imageValidationError = validateUploadedFiles(
      rawImageFiles,
      allowedImageMimeTypes,
      'image'
    );
    if (imageValidationError) {
      return res.status(400).json({ ok: false, error: imageValidationError });
    }

    const rawMaskFile = Array.isArray(req.files?.mask) ? req.files.mask[0] : null;
    const maskValidationError = validateUploadedFile(rawMaskFile, allowedImageMimeTypes, 'mask');
    if (maskValidationError) {
      return res.status(400).json({ ok: false, error: maskValidationError });
    }

    const imageFiles = rawImageFiles.map(normaliseMulterFile);

    try {
      const response = await createImageEdit({
        apiKey: OPEN_API_KEY,
        images: imageFiles,
        mask: normaliseMulterFile(rawMaskFile),
        ...validation.data,
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
  csrfProtection,
  upload.single('image'),
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res
        .status(503)
        .json({ ok: false, error: 'OpenAI integration is not configured.' });
    }

    const validationError = validateUploadedFile(req.file, allowedImageMimeTypes, 'image');
    if (validationError) {
      return res.status(400).json({ ok: false, error: validationError });
    }

    const validation = imageVariationOptionsSchema.safeParse(req.body || {});
    if (!validation.success) {
      const issue = validation.error.issues[0];
      return res.status(400).json({ ok: false, error: issue?.message || 'Invalid payload.' });
    }

    try {
      const response = await createImageVariation({
        apiKey: OPEN_API_KEY,
        image: normaliseMulterFile(req.file),
        ...validation.data,
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
// Perplexity Deep Research Routes
// ============================================

app.post('/api/research', requireAuth, csrfProtection, async (req, res) => {
  if (!PERPLEXITY_API_KEY) {
    return res.status(503).json({
      ok: false,
      error:
        'Perplexity integration is not configured. Add API_KEY to enable deep research functionality.',
    });
  }

  const { query, topic, purpose, maxTokens } = req.body || {};

  const searchQuery = query || topic;
  if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'query or topic is required and must be a non-empty string.',
    });
  }

  if (searchQuery.length > 2000) {
    return res.status(400).json({
      ok: false,
      error: 'query/topic must be 2000 characters or less.',
    });
  }

  try {
    const research = await performDeepResearch({
      apiKey: PERPLEXITY_API_KEY,
      query: buildResearchPrompt(searchQuery, purpose),
      maxTokens: maxTokens || 2000,
    });

    return res.json({
      ok: true,
      topic: searchQuery,
      purpose: purpose || 'general research',
      research,
    });
  } catch (err) {
    console.error('[ERROR] /api/research', err);
    const status = err?.status || 500;
    const errorMsg = err.message || 'Failed to perform research.';
    return res.status(status).json({
      ok: false,
      error: errorMsg.slice(0, 500),
    });
  }
});

app.post('/api/research/competitive', requireAuth, csrfProtection, async (req, res) => {
  if (!PERPLEXITY_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'Perplexity integration is not configured.',
    });
  }

  const { contentTopic, competitor, platform } = req.body || {};

  if (!contentTopic || typeof contentTopic !== 'string' || contentTopic.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'contentTopic is required.',
    });
  }

  if (contentTopic.length > 500) {
    return res.status(400).json({
      ok: false,
      error: 'contentTopic must be 500 characters or less.',
    });
  }

  try {
    const analysis = await analyzeCompetitiveContent({
      apiKey: PERPLEXITY_API_KEY,
      contentTopic: contentTopic.trim(),
      competitor: competitor ? String(competitor).trim() : undefined,
      platform: platform ? String(platform).trim() : undefined,
    });

    return res.json({
      ok: true,
      contentTopic,
      competitor: competitor || null,
      platform: platform || null,
      analysis,
    });
  } catch (err) {
    console.error('[ERROR] /api/research/competitive', err);
    const status = err?.status || 500;
    const errorMsg = err.message || 'Failed to analyze competitive content.';
    return res.status(status).json({
      ok: false,
      error: errorMsg.slice(0, 500),
    });
  }
});

app.post('/api/research/audience', requireAuth, csrfProtection, async (req, res) => {
  if (!PERPLEXITY_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'Perplexity integration is not configured.',
    });
  }

  const { audience, platform, niche } = req.body || {};

  if (!audience || typeof audience !== 'string' || audience.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'audience is required.',
    });
  }

  if (audience.length > 500) {
    return res.status(400).json({
      ok: false,
      error: 'audience must be 500 characters or less.',
    });
  }

  try {
    const insights = await getAudienceInsights({
      apiKey: PERPLEXITY_API_KEY,
      audience: audience.trim(),
      platform: platform ? String(platform).trim() : undefined,
      niche: niche ? String(niche).trim() : undefined,
    });

    return res.json({
      ok: true,
      audience,
      platform: platform || null,
      niche: niche || null,
      insights,
    });
  } catch (err) {
    console.error('[ERROR] /api/research/audience', err);
    const status = err?.status || 500;
    const errorMsg = err.message || 'Failed to get audience insights.';
    return res.status(status).json({
      ok: false,
      error: errorMsg.slice(0, 500),
    });
  }
});

app.get('/api/integrations/perplexity/status', (_req, res) => {
  res.json({
    ok: true,
    provider: 'perplexity',
    configured: Boolean(PERPLEXITY_API_KEY),
    capabilities: ['deep_research', 'competitive_analysis', 'audience_insights', 'trend_research'],
  });
});

app.post('/api/integrations/perplexity/test', requireAuth, csrfProtection, async (req, res) => {
  if (!PERPLEXITY_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'Perplexity integration is not configured.',
    });
  }

  try {
    const testResult = await performDeepResearch({
      apiKey: PERPLEXITY_API_KEY,
      query: 'What are the latest trends in content creation? Provide 3 key insights.',
      maxTokens: 500,
    });

    if (!testResult || testResult.trim().length === 0) {
      throw new Error('Empty response from Perplexity API.');
    }

    return res.json({
      ok: true,
      message: 'Perplexity integration is working correctly.',
      sampleResult: testResult.slice(0, 300),
    });
  } catch (err) {
    console.error('[ERROR] Perplexity test failed', err);
    const status = err?.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || 'Perplexity integration test failed.',
    });
  }
});

// ============================================
// Static File Serving
// ============================================

app.use(express.static(publicDirectory));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDirectory, 'index.html'));
});

// ============================================
// Error Handling & Server Start
// ============================================

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error.';
  res.status(status).json({ ok: false, error: message });
});

app.listen(PORT, () => {
  console.log(`[INFO] Server running on http://localhost:${PORT}`);
  console.log(`[INFO] Node environment: ${NODE_ENV}`);
  console.log(
    `[INFO] Configured auth providers: ${configuredAuthProviders.length > 0 ? configuredAuthProviders.join(', ') : 'none'}`
  );
});
