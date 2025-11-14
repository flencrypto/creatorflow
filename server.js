// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

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

const OPEN_API_KEY = process.env.OPEN_API_KEY || process.env.AI_API_KEY || process.env.OPEN_AI_KEY;
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

const openAiModelCache = {
  expiresAt: 0,
  value: null,
};
if (!OPEN_API_KEY) {
  console.warn(
    '[WARN] OPEN_API_KEY not set. /api/generate will return 500 until you configure it.'
  );
} else if (!process.env.OPEN_API_KEY) {
  console.warn(
    '[WARN] Falling back to legacy AI_API_KEY or OPEN_AI_KEY environment variables. Please rename it to OPEN_API_KEY.'
  );
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

// Serve static files (your HTML/CSS/JS)
app.use(express.static('.')); // serves index.html, assets, etc. from project root

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
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account',
    })
  );

  app.get(
    '/auth/google/callback',
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
    passport.authenticate('facebook', {
      scope: ['email'],
    })
  );

  app.get(
    '/auth/facebook/callback',
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
      : 'Add OPEN_API_KEY to enable this connector.';

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
    throw new Error('OPEN_API_KEY not configured on server.');
  }

  const {
    temperature = 0.7,
    maxTokens = 400,
    responseFormat = null,
  } = options;

  const { signal, dispose } = createTimeoutSignal();

  try {
    // Example: OpenAI Chat Completions API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // or whatever model you use
        messages: [
          { role: 'system', content: 'You are a helpful content generation assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(responseFormat
          ? {
              response_format: { type: responseFormat },
            }
          : {}),
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('AI API returned no content.');
    }

    return content;
  } finally {
    dispose();
  }
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

async function fetchOpenAiModels() {
  if (!OPEN_API_KEY) {
    throw new Error('OPEN_API_KEY not configured on server.');
  }

  const now = Date.now();
  if (openAiModelCache.value && openAiModelCache.expiresAt > now) {
    return openAiModelCache.value;
  }

  const { signal, dispose } = createTimeoutSignal(6000);

  try {
    const response = await fetch('https://api.openai.com/v1/models?limit=50', {
      headers: {
        Authorization: `Bearer ${OPEN_API_KEY}`,
      },
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Failed to load models: ${response.status} - ${text}`);
    }

    const payload = await response.json();
    const models = Array.isArray(payload?.data)
      ? payload.data
          .filter((model) => typeof model?.id === 'string')
          .map((model) => ({
            id: model.id,
            created: model.created || null,
            ownedBy: model.owned_by || null,
          }))
      : [];

    openAiModelCache.value = models;
    openAiModelCache.expiresAt = Date.now() + 1000 * 60 * 5; // 5 minutes cache

    return models;
  } finally {
    dispose();
  }
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
    throw new Error('OPEN_API_KEY not configured.');
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

  res.json({
    ok: true,
    connectors,
    meta: {
      openai: {
        configured: Boolean(OPEN_API_KEY),
        cachedModels: Array.isArray(openAiModelCache.value) ? openAiModelCache.value.length : 0,
        cacheExpiresAt: openAiModelCache.expiresAt || null,
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
  if (!OPEN_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OpenAI integration is not configured.' });
  }

  try {
    const models = await fetchOpenAiModels();
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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
