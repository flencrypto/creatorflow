// server.js
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import multer from 'multer';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(moduleFilename);
const publicDirectory = path.join(moduleDirectory, 'public');
const oauthStateSessionKey = 'oauthStates';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB safety limit for upstream assets
  },
});

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
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

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
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
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 4, // 4 hours
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

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

app.get('/api/auth/status', (req, res) => {
  const isAuthenticated = Boolean(req.isAuthenticated && req.isAuthenticated());
  res.json({
    authenticated: isAuthenticated,
    user: isAuthenticated ? req.user : null,
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('[ERROR] logout failed', err);
      return res.status(500).json({ ok: false, error: 'Failed to log out.' });
    }

    if (req.session) {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ ok: true });
      });
    } else {
      res.json({ ok: true });
    }
  });
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({ ok: false, error: 'Authentication required.' });
}

function buildIntegrationCatalogResponse() {
  const openAiConfigured = Boolean(OPEN_API_KEY);

  return connectorsCatalog.map((connector) => {
    const connected = connector.provider === 'openai' ? openAiConfigured : false;
    const status = connected ? 'connected' : 'requires_configuration';
    const statusMessage = connected
      ? 'Active via server-side OpenAI credential.'
      : 'Add OPEN_API_KEY (or set the OPEN_AI_KEY secret) to enable this connector.';

    return {
      ...connector,
      connected,
      status,
      statusMessage,
    };
  });
}

function safeParseJsonPayload(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const normalised = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(normalised);
  } catch (error) {
    console.warn('[WARN] Failed to parse JSON payload from AI response.', error);
    return null;
  }
}

const createVideoSchema = z.object({
  prompt: z.string().min(1).max(2000),
  model: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),
  seconds: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .optional(),
  size: z
    .string()
    .trim()
    .regex(/^\d+x\d+$/)
    .optional(),
  quality: z
    .string()
    .trim()
    .max(20)
    .optional(),
});

const remixVideoSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

const listVideosSchema = z.object({
  after: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .optional(),
  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const downloadVariantSchema = z.object({
  variant: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional(),
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

function toSnakeCasePayload(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (value === undefined || value === null) {
        return [null, null];
      }

      const snakeKey = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      return [snakeKey, value];
    }).filter(([key]) => Boolean(key))
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
  };
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

  if (typeof error?.message === 'string' && error.message.trim().length > 0 && error.message.length < 140) {
    return error.message.trim();
  }

  return fallbackMessage;
}

// Basic input validation helper
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

  // Platform is optional but if provided, must be short
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

// Map template to system-style instructions
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
      // Should never hit because of validation
      return input;
  }
}

function buildAnalysisPrompt({ content, platform, goals, creatorName }) {
  const safePlatform = platform ? platform : 'social media';
  const goalText = goals
    ? `Creator goals: ${goals}`
    : 'Focus on clarity, engagement, and conversion.';
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

// This is where you call your provider.
// Below is a skeleton for an OpenAI-style chat completion.
// Swap endpoint/model as needed.
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
    const invalidChannel = channels.find((channel) => typeof channel !== 'string' || channel.length > 40);
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
  const channelsText = Array.isArray(channels) && channels.length > 0
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
    res.status(500).json({ ok: false, error: err.message || 'OpenAI integration test failed.' });
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

    // Basic structured payload for future workflows
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

app.post('/api/content/analysis', requireAuth, async (req, res) => {
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
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  try {
    const models = await openAiModelService.listModels();
    res.json({ ok: true, models });
  } catch (err) {
    console.error('[ERROR] /api/integrations/openai/models', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to load models.' });
  }
});

app.post('/api/integrations/openai/connectors', async (req, res) => {
  const validationError = validateConnectorSuggestionBody(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
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
      return res.json({ ok: true, summary: parsed.summary || null, connectors: parsed.connectors });
    }

    return res.json({ ok: true, summary: null, connectors: [], raw: aiContent });
  } catch (err) {
    console.error('[ERROR] /api/integrations/openai/connectors', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to generate connector plan.' });
  }
});

app.post('/api/integrations/:id/test', async (req, res) => {
  if (req.params.id !== 'openai') {
    return res.status(404).json({ ok: false, error: 'Unknown integration id.' });
  }

  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  await sendOpenAiTestResponse(res);
});

app.post('/api/integrations/openai/test', async (_req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  await sendOpenAiTestResponse(res);
});

app.post(
  '/api/integrations/openai/videos',
  requireAuth,
  upload.single('input_reference'),
  async (req, res) => {
    if (!OPEN_API_KEY) {
      return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
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

app.post('/api/integrations/openai/videos/:videoId/remix', requireAuth, async (req, res) => {
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
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

// Serve static files (your HTML/CSS/JS)
// Keep this after API route definitions so POST/PUT/etc. requests reach handlers instead of
// returning 405 from the static middleware when assets are missing.
app.use(
  express.static(publicDirectory, {
    fallthrough: true,
    dotfiles: 'ignore',
    index: false,
  })
); // restrict static hosting to the dedicated public directory

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDirectory, 'index.html'));
});

if (NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

function ensureSession(req) {
  if (!req.session) {
    throw new Error('Session support is required but was not initialised.');
  }

  return req.session;
}

function issueOAuthState(req, provider) {
  const activeSession = ensureSession(req);
  const state = crypto.randomUUID();

  const stateStore = activeSession[oauthStateSessionKey] || {};
  stateStore[provider] = state;
  activeSession[oauthStateSessionKey] = stateStore;

  return state;
}

function consumeOAuthState(req, provider, providedState) {
  if (typeof providedState !== 'string' || providedState.length === 0) {
    return false;
  }

  const activeSession = ensureSession(req);
  const stateStore = activeSession[oauthStateSessionKey] || {};
  const expected = stateStore?.[provider];
  delete stateStore[provider];

  if (Object.keys(stateStore).length === 0) {
    delete activeSession[oauthStateSessionKey];
  } else {
    activeSession[oauthStateSessionKey] = stateStore;
  }

  if (typeof expected !== 'string' || expected.length === 0) {
    return false;
  }

  try {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(providedState, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (error) {
    console.error('[ERROR] Failed to compare OAuth state tokens securely.', error);
    return false;
  }
}

function issueOAuthStateAndAuthenticate(provider, options) {
  return (req, res, next) => {
    try {
      const state = issueOAuthState(req, provider);
      return passport.authenticate(provider, {
        ...options,
        state,
      })(req, res, next);
    } catch (error) {
      console.error(`[ERROR] Failed to initiate ${provider} OAuth flow`, error);
      return res.status(500).json({
        ok: false,
        error: 'Authentication temporarily unavailable. Please try again.',
      });
    }
  };
}

function enforceValidOAuthState(provider) {
  return (req, res, next) => {
    try {
      const providedState = typeof req.query.state === 'string' ? req.query.state : null;
      const isValidState = consumeOAuthState(req, provider, providedState);

      if (!isValidState) {
        console.warn(`[WARN] Rejected ${provider} OAuth callback due to invalid state.`);
        return res.redirect(302, `/login.html?error=${provider}_oauth_state`);
      }
    } catch (error) {
      console.error(`[ERROR] ${provider} OAuth state validation failed`, error);
      return res.status(500).json({ ok: false, error: 'OAuth state validation failed.' });
    }

    return next();
  };
}

export default app;
