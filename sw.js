const VERSION = 'finanzas-v1';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'dom.js', 'iconos.js', 'resumen.js',
  'lib/api.js', 'lib/charts.js', 'lib/dates.js', 'lib/exportar.js', 'lib/money.js', 'lib/parser.js', 'lib/periodo.js',
  'lib/queue.js', 'lib/suggest.js', 'lib/summary.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS))));

self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))));

// Red primero (así llegan las versiones nuevas); si no hay red, lo guardado.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
