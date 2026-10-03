#!/usr/bin/env node
/* Проверка в браузере (нужны Playwright и Chromium; без них пропускается): пауза между уходом последней подписи баночки и первой надписью лозунга должна быть такой,
   как задано в data/redesign.json → jar.outro.pauseVh (в высотах экрана; отдельно для компьютера и телефона). Допуск ±0.06.
   Меряем так: идём вниз мелкими шагами (0.02 экрана), находим, где подпись становится почти невидимой (непрозрачность < 0.05) и где проявляется первая надпись лозунга (> 0.05).
   Запуск: node tools/check-outro.js  (после node tools/build.js). Код возврата ≠ 0, если пауза выходит за допуск. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p)), TOL = 0.06;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {}); let bad = 0;
  const want = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'redesign.json'), 'utf8')).jar.outro.pauseVh;
  for (const [name, W, H, mobile, target] of [['компьютер 1440×900', 1440, 900, false, want.desktop], ['телефон 390×844', 390, 844, true, want.mobile]]) {
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: mobile, hasTouch: mobile}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    const p = await ctx.newPage(); await p.goto(base + '/index.html'); await p.waitForTimeout(3500);
    const g = await p.evaluate(() => { const s = document.querySelector('.jar-story'), o = document.getElementById('jar-outro'), sy = scrollY; return {sTop: s.getBoundingClientRect().top + sy, sTot: s.offsetHeight - s.firstElementChild.clientHeight, oTop: o.getBoundingClientRect().top + sy, oTot: o.offsetHeight - o.querySelector('.jo-stage').clientHeight}; });
    const read = () => p.evaluate(() => { const v = (el, n) => parseFloat(el.style.getPropertyValue(n)) || 0; return {cap: Math.max(0, ...[...document.querySelectorAll('.jar-story .js-cap')].map(c => v(c, '--o'))), txt: Math.max(v(document.querySelector('.jo-stage'), '--e'), ...[...document.querySelectorAll('.jo-w')].map(w => v(w, '--o')))}; });
    await p.evaluate(y => window.scrollTo(0, y), g.sTop + g.sTot * 0.74); await p.waitForTimeout(1500);       // первый переход далёкий: даём пружине и кадрам дойти, дальше идём малыми шагами
    let y1 = null, y2 = null, seenCap = false;
    for (let y = g.sTop + g.sTot * 0.74; y < g.oTop + g.oTot * 0.3 && y2 === null; y += H * 0.02) {
      await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(mobile ? 450 : 380); const r = await read();
      if (r.cap > 0.05) seenCap = true; else if (seenCap && y1 === null) y1 = y;
      if (y1 !== null && r.txt > 0.05) y2 = y;
    }
    const pause = y1 !== null && y2 !== null ? (y2 - y1) / H : NaN, okRun = Math.abs(pause - target) <= TOL; if (!okRun) bad++;
    console.log(`${okRun ? '✓' : '✗'} ${name}: пауза между последней подписью и лозунгом ≈ ${pause.toFixed(2)} экрана (задано ${target}, допуск ±${TOL})`);
    await ctx.close();
  }
  await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
