// CreatorFlow Studio — Service Worker
// Cache-First for static assets; Stale-While-Revalidate for API calls.

const CACHE_VERSION = 'cf-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/editor.html',
  '/templates.html',
  '/integrations.html',
  '/pricing.html',
  '/help.html',
  '/login.html',
  '/signup.html',
  '/admin.html',
  '/admin-dashboard.html',
  '/admin-login.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
];

// Install: pre-cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// Activate: purge old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('cf-') && key !== STATIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API calls — Stale-While-Revalidate (no caching of sensitive POST bodies)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    if (request.method !== 'GET') return;
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // Static assets — Cache-First
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a minimal offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached ?? new Response('Offline', { status: 503, statusText: 'Service Unavailable' }));
  return cached ?? fetchPromise;
}
