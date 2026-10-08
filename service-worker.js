const CACHE_NAME = 'coffee-shell-v4';
const APP_SHELL = [
    './',
    './index.html',
    './analytics.html',
    './manifest.webmanifest',
    './css/style.css',
    './icons/coffee-192.svg',
    './icons/coffee-512.svg',
    './js/config.js',
    './js/auth.js',
    './js/db.js',
    './js/ui.js',
    './js/mobile-ui.js',
    './js/pwa.js',
    './js/app.js',
    './js/analytics.js'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            });
            if (cached) {
                event.waitUntil(network.catch(() => undefined));
                return cached;
            }
            return network;
        })
    );
});
