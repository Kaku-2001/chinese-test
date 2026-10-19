/*
 * アプリの画面（index.html など）を端末に保存して、すばやく開けるようにする仕組みです。
 * テストの問題・提出・結果の通信（Apps Scriptへの POST）には一切関わりません。
 * 画面は毎回ネットから最新を取りに行き、つながらないときだけ保存したものを使います。
 */
var CACHE = 'vocab-test-v3';
var SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                         // テストの通信（POST）はそのままネットへ
  if (new URL(req.url).origin !== self.location.origin) return; // フォントなど外部のものはブラウザに任せる
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('./index.html'); });
    })
  );
});
