#!/usr/bin/env node
/* Проверка в браузере (нужны Playwright и Chromium; без них пропускается): между последней подписью баночки и первыми словами лозунга не должно быть длинного пустого экрана.
   Прокручиваем от последней подписи до полного проявления лозунга и меряем (в высотах экрана), сколько прокрутки на экране нет ни подписи, ни подписи-надписи, ни слов лозунга.
   Запуск: node tools/check-outro.js  (после node tools/build.js). Код возврата ≠ 0, если пустой отрезок длиннее 0.5 экрана на компьютере или телефоне. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p)), LIMIT = 0.5;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {}); let bad = 0;
  for (const [name, W, H, mobile] of [['компьютер 1440×900', 1440, 900, false], ['телефон 390×844', 390, 844, true]]) {
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: mobile, hasTouch: mobile}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    const p = await ctx.newPage(); await p.goto(base + '/index.html'); await p.waitForTimeout(3500);
    const g = await p.evaluate(() => { const s = document.querySelector('.jar-story'), o = document.getElementById('jar-outro'), st = s.firstElementChild, sy = scrollY; return {sTop: s.getBoundingClientRect().top + sy, sH: s.offsetHeight, stageH: st.clientHeight, oTop: o.getBoundingClientRect().top + sy, oH: o.offsetHeight, joH: o.querySelector('.jo-stage').clientHeight}; });
    const from = g.sTop + (g.sH - g.stageH) * 0.6, to = g.oTop + (g.oH - g.joH) * 0.5, step = H * 0.1; let blank = 0, seenText = false, afterCaps = false;
    for (let y = from; y < to; y += step) {
      await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(mobile ? 600 : 500);
      const r = await p.evaluate(() => { const v = (el, n) => parseFloat(el.style.getPropertyValue(n)) || 0; const caps = Math.max(0, ...[...document.querySelectorAll('.jar-story .js-cap')].map(c => v(c, '--o'))), words = Math.max(0, ...[...document.querySelectorAll('.jo-w')].map(w => v(w, '--o'))), eye = v(document.querySelector('.jo-stage'), '--e'); return Math.max(caps, words, eye); });
      if (r > 0.05) { if (afterCaps) seenText = true; } else { if (!seenText) { afterCaps = true; blank += 0.1; } }
    }
    const okRun = blank <= LIMIT; if (!okRun) bad++;
    console.log(`${okRun ? '✓' : '✗'} ${name}: пустой экран между подписью и лозунгом ≈ ${blank.toFixed(1)} высоты экрана (допустимо ≤ ${LIMIT})`);
    await ctx.close();
  }
  await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
