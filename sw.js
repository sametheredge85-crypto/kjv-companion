self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('harmony-cache').then(cache => 
      cache.addAll(['/', '/Kjv-companion/', '/Kjv-companion/index.html'])
    )
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
