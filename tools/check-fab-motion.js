#!/usr/bin/env node
/* Плавность появления кнопки помощника (Стелла): покадровая запись в браузере и проверка «без рывков».
   Проверяется: нет перелёта масштаба при появлении; прозрачность и ширина подписи растут монотонно (без скачков назад); подпись раскрывается за ≥0,6 с
   без шага шире ~18 px за кадр; после появления отклик на наведение быстрый; при «уменьшить движение» всё происходит без переходов; на телефоне кнопка круглая.
   Нужны Playwright и Chromium. Запуск: node tools/check-fab-motion.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const rd = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redesign.json'), 'utf8')).extras || {};
if (!rd.enabled || !rd.assistant) { console.log('Помощник выключен в data/redesign.json — проверка пропущена.'); process.exit(0); }
const MIME = {'.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };

async function record(base, o) {
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const ctx = await b.newContext(Object.assign({deviceScaleFactor: 1}, o)); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); const p = await ctx.newPage();
  await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
  await p.addInitScript(() => { window.__rec = []; const t0 = performance.now(); const tick = () => { const f = document.getElementById('asst-fab'); if (f) { const cs = getComputedStyle(f), m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform), t = f.querySelector('.asst-fab-t b'); window.__rec.push({t: performance.now() - t0, op: +cs.opacity, sc: m.a, w: f.offsetWidth, lop: t ? +getComputedStyle(t).opacity : 0, long: f.classList.contains('long'), settled: f.classList.contains('settled')}); } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await p.goto(base + 'catalog.html'); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} }
  await p.waitForTimeout(o.reducedMotion ? 3500 : o.isMobile ? 4500 : 11800);
  const rec = await p.evaluate(() => window.__rec), hover = await p.evaluate(() => { const f = document.getElementById('asst-fab'); f.classList.add('probe'); return getComputedStyle(f).transitionDuration; });
  const hv = o.isMobile ? null : await (async () => { await p.hover('#asst-fab'); await p.waitForTimeout(120); return p.evaluate(() => getComputedStyle(document.getElementById('asst-fab')).transitionDuration); })();
  await b.close(); return {rec, hover, hv};
}

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  console.log('\n[компьютер: появление и раскрытие подписи]');
  const d = await record(base, {viewport: {width: 1440, height: 900}}); const rec = d.rec, i0 = rec.findIndex(r => r.op > 0.01), seg = rec.slice(Math.max(0, i0 - 1));
  const maxSc = Math.max(...seg.map(r => r.sc)); ok(maxSc <= 1.002, 'при появлении нет «перелёта» масштаба (максимум ' + maxSc.toFixed(3) + ')', maxSc);
  let mono = true, back = 0; for (let i = 1; i < seg.length; i++) { if (seg[i].op + 0.003 < seg[i - 1].op && !seg[i].settled) { mono = false; back++; } } ok(mono, 'прозрачность при появлении растёт без скачков назад');
  const L = seg.filter(r => r.long), w0 = L[0] ? L[0].w : 0, wEnd = L.length ? L[L.length - 1].w : 0; const exp = L.filter(r => r.w > 56 && r.w < wEnd - 1);
  ok(L.length && wEnd >= 150 && w0 <= 70, 'подпись раскрывается: ' + w0 + ' → ' + wEnd + ' px', {w0, wEnd});
  let widthMono = true, maxStep = 0; for (let i = 1; i < L.length; i++) { const dw = L[i].w - L[i - 1].w; if (dw < 0 && L[i].long && i < 90) widthMono = false; const dt = Math.max(8, L[i].t - L[i - 1].t); maxStep = Math.max(maxStep, dw * 16.7 / dt); } ok(widthMono, 'ширина кнопки при раскрытии не «дёргается» назад');
  ok(exp.length >= 25, 'раскрытие идёт плавно, не рывком: ' + exp.length + ' промежуточных кадров (≥ 25 ≈ 0,4 с)', exp.length); ok(maxStep <= 18, 'шаг ширины за кадр (приведён к 60 к/с) не больше 18 px: ' + maxStep.toFixed(1), maxStep);
  const lo = seg.filter(r => r.long && r.lop > 0.01 && r.lop < 0.99).length; ok(lo >= 12, 'текст подписи проявляется постепенно (' + lo + ' кадров)', lo);
  const tAfter = seg.find(r => r.long); const tIn = seg[0].t; ok(tAfter && (tAfter.t - tIn) > 1200, 'подпись раскрывается не сразу, а после появления и взмаха (через ' + Math.round(tAfter ? tAfter.t - tIn : 0) + ' мс)', tAfter && tAfter.t - tIn);
  const collapsed = rec.slice(rec.indexOf(tAfter)).some(r => !r.long && r.w < 70); ok(collapsed, 'через несколько секунд подпись плавно сворачивается обратно в круг');
  const hovD = (d.hv || '').split(',').map(x => parseFloat(x)); ok(hovD.every(x => x <= 0.6), 'после появления отклик на наведение быстрый (переходы ≤ 0,6 с), а не 1 с «пружины»', d.hv);

  console.log('\n[«уменьшить движение»]');
  const r2 = await record(base, {viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'}); const R = r2.rec; const jump = R.findIndex(r => r.long);
  ok(jump >= 0 && R[jump].w >= 150 && R[jump].lop >= 0.99, 'подпись сразу показывается целиком, без плавного раскрытия (' + (jump >= 0 ? R[jump].w : '—') + ' px)', jump >= 0 && R[jump]);
  ok(R.every(r => r.sc <= 1.0001) && R.filter(r => r.op > 0.01 && r.op < 0.99).length <= 2, 'появление без анимации (≤ 2 промежуточных кадра)');

  console.log('\n[телефон]');
  const m = await record(base, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}); const M = m.rec; const fin = M[M.length - 1];
  ok(fin.w === 56 && !M.some(r => r.long && r.w > 60), 'кнопка круглая (56 px), подпись не раскрывается', fin.w);
  const sc = M.filter(r => r.op > 0.01).map(r => r.sc); ok(Math.max(...sc) <= 1.002 && Math.min(...sc) >= 0.5, 'при появлении масштаб от 0,72 до 1 без перелёта (не меньше зоны нажатия 24 px)', [Math.min(...sc), Math.max(...sc)]);
  srv.close(); console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
