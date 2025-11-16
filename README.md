---
title: CreatorFlow Studio - AI Content Magic Wand ✨
colorFrom: blue
colorTo: gray
emoji: 🐳
sdk: static
pinned: false
tags:
- deepsite-v3
license: mit
thumbnail: >-
  https://cdn-uploads.huggingface.co/production/uploads/654f0239c67f60a3686a5fb9/yRWKpICs1vxZyEji14nMl.png
---

# Welcome to your new DeepSite project!
This project was created with [DeepSite](https://huggingface.co/deepsite).

## Social sign-in & AI configuration

CreatorFlow Studio now supports Google and Facebook OAuth for authentication, along with AI-powered content analysis. Configure the following environment variables before running the server:

```
SESSION_SECRET=replace-with-a-long-random-string
# OPEN_API_KEY takes precedence; OPEN_AI_KEY is provided as a repository secret fallback
OPEN_API_KEY=sk-...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback

# Optional comma-separated list of allowed origins for CORS
# CORS_ORIGIN=http://localhost:3000
```

The callback URLs must match the configuration in the respective provider consoles. After saving the variables (e.g. in a `.env` file), install dependencies and start the server:

```
npm install
npm run dev
```

Visit `http://localhost:3000/login.html` to test social sign-in, and `dashboard.html` for AI-powered content feedback once authenticated.

## GitHub Pages deployment

GitHub Pages expects either an `index.html` in the repository root or within a `docs/` directory. All static assets for CreatorFlow live under `public/`, so run the following helper before pushing to ensure Pages receives an up-to-date build:

```
npm run build:static
```

This script copies the `public/` directory into `docs/`, which GitHub Pages can serve directly without needing the Node.js server. Commit the generated `docs/` folder whenever you update any static files.

## Runtime API configuration for static hosts

Static deployments (e.g. GitHub Pages, Hugging Face Spaces) cannot handle `/api/*` POST requests themselves, so the front-end now reads a configurable API base before loading any AI modules. The resolver checks overrides in the following order:

1. `?apiBase=https://backend.example.com` (persists to `localStorage` once provided)
2. Previously stored override in the same browser
3. `<meta name="creatorflow:api-base" content="https://backend.example.com">`
4. `data-api-base` attributes on `<html>` or `<body>`
5. Existing `window.__API_BASE_URL`
6. The current origin (default for local development)

To host the UI on a static domain while using a remote backend, set the meta tag in `public/*.html` (and re-run `npm run build:static`) or append the query parameter once to persist the backend origin locally.