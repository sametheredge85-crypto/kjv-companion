const CACHE = 'kjv-harmony-v1';
const BASE = new URL('./', self.location);

const SHELL = [
  'index.html',
  'app.css',
  'js/app.js',
  'js/books.js',
  'js/ref.js',
  'js/search.js',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

function abs(path) {
  return new URL(path, BASE).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(abs));
    const index = await cache.match(abs('index.html'));
    if (index) await cache.put(BASE.href, index.clone());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isData(url) {
  return url.pathname.includes('/data/');
}

function isShell(url) {
  const path = url.pathname;
  return SHELL.some((file) => path.endsWith('/' + file) || path.endsWith(file));
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    const url = new URL(request.url);
    if (response.ok && (isShell(url) || url.href === BASE.href)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const home = await cache.match(abs('index.html'));
      if (home) return home;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isData(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate' || isShell(url)) {
    event.respondWith(networkFirst(request));
  }
});
