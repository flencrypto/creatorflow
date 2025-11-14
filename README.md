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
AI_API_KEY=sk-...

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