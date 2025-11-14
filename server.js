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

const AI_API_KEY = process.env.AI_API_KEY;
if (!AI_API_KEY) {
  console.warn(
    '[WARN] AI_API_KEY not set. /api/generate will return 500 until you configure it.'
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
async function callAiProvider(prompt) {
  if (!AI_API_KEY) {
    throw new Error('AI_API_KEY not configured on server.');
  }

  // Example: OpenAI Chat Completions API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // or whatever model you use
      messages: [
        { role: 'system', content: 'You are a helpful content generation assistant.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 400,
    }),
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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});