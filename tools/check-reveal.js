#!/usr/bin/env node
/* Проверка в браузере (нужны Playwright и Chromium; без них пропускается): у каждого элемента с классом .reveal должны переходить opacity и translate.
   Если у карточки есть своё свойство transition (.card.hov, .rd-task…) и оно перебивает правило .reveal, карточка появляется рывком, без проявления и подъёма.
   Запуск: node tools/check-reveal.js  (после node tools/build.js). Код возврата ≠ 0, если такие элементы найдены. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
const PAGES = ['index.html', 'catalog.html', 'brands.html', 'training.html', 'news.html', 'company.html', 'contacts.html', 'partners.html', 'brands/dermatime.html', 'products/dermatime-elastense.html', 'training/2026-10-14-moskva-dermatime.html', 'news/skidki-po-obemu-zakupki.html'];
(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {}), ctx = await b.newContext({viewport: {width: 1440, height: 900}}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
  const p = await ctx.newPage(), bad = [];
  for (const pg of PAGES) {
    await p.goto(base + '/' + pg); await p.waitForTimeout(600); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} } await p.waitForTimeout(700);
    const r = await p.evaluate(() => { const out = {}; document.querySelectorAll('.reveal:not(.b-title)').forEach(el => { const tp = getComputedStyle(el).transitionProperty; if (!(/opacity|all/.test(tp) && /translate|all/.test(tp))) { const k = el.tagName.toLowerCase() + '.' + [...el.classList].filter(c => c !== 'reveal' && c !== 'in').join('.'); out[k] = (out[k] || 0) + 1; } }); return out; });
    Object.entries(r).forEach(([k, n]) => bad.push(`${pg}: ${k} ×${n}`));
  }
  await b.close(); srv.close();
  console.log(bad.length ? 'Элементы .reveal без перехода opacity/translate (появляются рывком):\n  ✗ ' + bad.join('\n  ✗ ') : `Проверено страниц: ${PAGES.length}; у всех .reveal есть проявление.`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
