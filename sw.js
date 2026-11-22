/* Кэш сайта «Астрея» (service worker). Этот файл — шаблон: tools/build.js подставляет версию выкладки в константу V (метка-заглушка в шаблоне) и пишет готовый sw.js в корень сайта.
   Регистрирует его js/core.js (только https, не localhost и не автоматизация; ?sw=1 включает, ?sw=0 выключает и снимает).
   Зачем: при повторном заходе и при переходе между страницами кадры зала, картинки, стили и скрипты берутся из кэша браузера, а не из сети (у хостинга срок кэша — 10 минут,
   после него всё проверялось и качалось заново: 10–20 МБ на одну главную). Первый заход эта часть не ускоряет.
   • файлы с ?v=<версия> (стили, скрипты, данные, кадры, картинки) и шрифты — сначала кэш, потом сеть: адрес меняется с каждой выкладкой, поэтому устаревшего содержимого не бывает;
   • страницы (HTML) — сначала сеть; если она отвечает дольше 3,5 с — показываем прежнюю копию из кэша (всегда свежие, но открываются и на слабой связи или без неё);
   • всё остальное (чужие домены, запись, диапазоны, build.json, аналитика) браузер делает сам.
   Новая выкладка → новый sw.js (версия внутри меняется) → при активации старый кэш удаляется целиком. */
'use strict';
const V = '4359adc4', CACHE = 'astreya-' + V, SLOW = 3500;

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('astreya-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const stat = u => u.origin === self.location.origin && (/^[0-9a-f]{6,16}$/.test(u.searchParams.get('v') || '') || /\/assets\/fonts\//.test(u.pathname));

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (r.mode === 'navigate') { e.respondWith(netFirst(r)); return; }
  if (stat(u)) e.respondWith(cacheFirst(r));
});

async function cacheFirst(r) {
  const c = await caches.open(CACHE), hit = await c.match(r.url);
  if (hit) return hit;
  const res = await fetch(r);
  if (res.ok && res.status === 200 && res.type === 'basic') { try { await c.put(r.url, res.clone()); } catch (e) { /* не хватило места — работаем без кэша */ } }
  return res;
}

async function netFirst(r) {
  const c = await caches.open(CACHE), key = r.url.split('#')[0];
  const net = fetch(r).then(res => { if (res.ok && res.type === 'basic') c.put(key, res.clone()).catch(() => {}); return res; });
  const hit = await c.match(key);
  if (!hit) return net;
  return Promise.race([net, new Promise(res => setTimeout(() => res(hit), SLOW))]).catch(() => hit);
}
