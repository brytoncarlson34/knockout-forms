// Keeps the app working with no signal. Bump VERSION when files change.
// Hosted at /knockout-forms/ on a shared github.io address, so every path here is relative
// to this file, and we only ever touch our own 'kf-' caches (other apps on the same address keep theirs).
const VERSION = 'kf-v3';
const FILES = ['./', 'index.html', 'core.css','app.css', 'core.js','config.js', 'jspdf.umd.min.js', 'pdf.js', 'app.js', 'logo.png',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const SCOPE = new URL('./', self.location).pathname; // '/knockout-forms/' on GitHub Pages, '/' locally
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('kf-') && k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(SCOPE) ||
      u.pathname.endsWith('/exec') || u.pathname.startsWith('/_')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.open(VERSION).then(x => x.match(e.request, { ignoreSearch: true })
      .then(r => r || (e.request.mode === 'navigate' ? x.match('./').then(h => h || x.match('index.html')) : undefined))
      .then(r => r || Response.error()))));
});
