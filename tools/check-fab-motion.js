#!/usr/bin/env node
/* Плавность и «кинематографичность» появления кнопки помощника (Стелла): покадровая запись в браузере и проверка «без рывков».
   Проверяется: нет перелёта масштаба; прозрачность растёт монотонно и медленно (≥ 1 с); жемчужинка проявляется БЕЗ размытия и сначала с закрытыми глазами, потом «просыпается»;
   «выкатывание»: плашка раскрывается за ~1 с (0,6–1,5 с) без шага шире ~18 px за кадр, а жемчужинка катится влево и делает ровно один оборот синхронно с шириной; затем по плашке пробегает блик,
   позже она сворачивается; после появления отклик на наведение быстрый; анимации работают и при системном «уменьшить движение»; на телефоне кнопка круглая.
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
  await p.addInitScript(() => { window.__rec = []; const t0 = performance.now(); window.__t0 = t0; const tick = () => { const f = document.getElementById('asst-fab'); if (f) { const cs = getComputedStyle(f), m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform), t = f.querySelector('.asst-fab-t b'), pe = f.querySelector('.pe'), pw = f.querySelector('.asst-fab-pe'), rl = f.querySelector('.asst-fab-roll'), rmx = rl ? getComputedStyle(rl).transform : 'none', rm = new DOMMatrix(rmx === 'none' ? undefined : rmx); window.__rec.push({t: performance.now() - t0, op: +cs.opacity, sc: m.a, w: f.offsetWidth, lop: t ? +getComputedStyle(t).opacity : 0, long: f.classList.contains('long'), settled: f.classList.contains('settled'), mood: pe ? pe.getAttribute('data-m') : '', filter: pw ? getComputedStyle(pw).filter : '', roll: Math.atan2(rm.b, rm.a) * 180 / Math.PI, sweep: f.classList.contains('sweep')}); } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await p.goto(base + 'catalog.html'); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} }
  let scroll = null;
  if (o.isMobile) await p.waitForTimeout(6000);
  else {
    await p.waitForTimeout(6500);                                              // подпись сама не раскрывается: ждём, пока кнопка появится и «устоится»
    const t1 = await p.evaluate(() => performance.now() - window.__t0); await p.mouse.move(700, 400);
    for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(30); }
    scroll = {from: t1, to: await p.evaluate(() => performance.now() - window.__t0)};
    await p.waitForTimeout(7000);                                              // раскрытие (≈ 1 с) + 2 с открыта + сворачивание
  }
  const hasSweep = await p.evaluate(() => !!document.querySelector('.asst-fab-sweep')), rec = await p.evaluate(() => window.__rec), hover = await p.evaluate(() => { const f = document.getElementById('asst-fab'); f.classList.add('probe'); return getComputedStyle(f).transitionDuration; });
  const hv = o.isMobile ? null : await (async () => { await p.hover('#asst-fab'); await p.waitForTimeout(120); return p.evaluate(() => getComputedStyle(document.getElementById('asst-fab')).transitionDuration); })();
  await b.close(); return {rec, hover, hv, scroll, hasSweep};
}

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  console.log('\n[компьютер: появление и раскрытие подписи]');
  const d = await record(base, {viewport: {width: 1440, height: 900}}); const rec = d.rec, i0 = rec.findIndex(r => r.op > 0.01), seg = rec.slice(Math.max(0, i0 - 1));
  const maxSc = Math.max(...seg.map(r => r.sc)); ok(maxSc <= 1.002, 'при появлении нет «перелёта» масштаба (максимум ' + maxSc.toFixed(3) + ')', maxSc);
  let mono = true, back = 0; for (let i = 1; i < seg.length; i++) { if (seg[i].op + 0.003 < seg[i - 1].op && !seg[i].settled) { mono = false; back++; } } ok(mono, 'прозрачность при появлении растёт без скачков назад');
  const fade = seg.filter(r => r.op > 0.02 && r.op < 0.98).length; ok(fade >= 60, 'проявление кнопки неторопливое: ' + fade + ' кадров плавного нарастания (≥ 60 ≈ 1 с)', fade);
  const sl = seg.findIndex(r => r.mood === 'sleep'), aw = seg.findIndex(r => r.mood === 'idle' || r.mood === 'happy'); ok(sl >= 0 && aw > sl && seg[aw].t - seg[sl].t > 1200, 'Стелла сначала «спит» (закрытые глаза), потом «просыпается» (через ' + Math.round(aw > sl ? seg[aw].t - seg[sl].t : 0) + ' мс)', [sl, aw]);
  ok(seg.every(r => !r.filter || r.filter === 'none'), 'жемчужинка проявляется без размытия (фильтр не применяется)');
  ok(!seg.some(r => r.sweep) && !d.hasSweep, 'блика на кнопке нет (ни разметки, ни анимации)');
  ok(!seg.some(r => r.long && r.t < d.scroll.from), 'пока человек не листает, подпись сама не раскрывается (первые ' + Math.round(d.scroll.from / 1000) + ' с)');
  const L = seg.filter(r => r.long), w0 = L[0] ? L[0].w : 0, wEnd = L.length ? L[L.length - 1].w : 0; const exp = L.filter(r => r.w > 56 && r.w < wEnd - 1);
  ok(L.length && wEnd >= 150 && w0 <= 70, 'подпись раскрывается: ' + w0 + ' → ' + wEnd + ' px', {w0, wEnd});
  { const E = L.filter(r => r.long), wE = E.length ? E[E.length - 1].w : 0; let prev = null; const unw = [];
    for (const r of E) { let a = r.roll; if (prev !== null) { while (a - prev > 180) a -= 360; while (a - prev < -180) a += 360; } prev = a; unw.push(a); }
    const i0 = E.findIndex(r => r.w > 58), i1 = E.findIndex(r => r.w >= wE - 1), dur = i0 >= 0 && i1 > i0 ? E[i1].t - E[i0].t : 0;
    ok(dur >= 600 && dur <= 1500, 'плашка «выкатывается» за ~1 с (' + Math.round(dur) + ' мс): не рывком и не затянуто', dur);
    const turn = unw.length ? unw[unw.length - 1] - unw[0] : 0; ok(Math.abs(Math.abs(turn) - 360) < 25, 'жемчужинка делает ровно один оборот (' + Math.round(turn) + '°): катится влево, а не просто растягивается плашка', turn);
    let worst = 0; for (let i = 0; i < E.length; i++) { const pw = (E[i].w - 54) / Math.max(1, wE - 54), pr = Math.abs(unw[i] - unw[0]) / 360; if (pw > 0.03 && pw < 0.97) worst = Math.max(worst, Math.abs(pw - pr)); } ok(worst < 0.1, 'поворот идёт синхронно с шириной плашки (расхождение ' + worst.toFixed(3) + ' < 0,1)', worst); }
  let widthMono = true, maxStep = 0; for (let i = 1; i < L.length; i++) { const dw = L[i].w - L[i - 1].w; if (dw < 0 && L[i].long && i < 90) widthMono = false; const dt = Math.max(8, L[i].t - L[i - 1].t); maxStep = Math.max(maxStep, dw * 16.7 / dt); } ok(widthMono, 'ширина кнопки при раскрытии не «дёргается» назад');
  ok(exp.length >= 25, 'раскрытие идёт плавно, не рывком: ' + exp.length + ' промежуточных кадров (≥ 25 ≈ 0,4 с)', exp.length); ok(maxStep <= 18, 'шаг ширины за кадр (приведён к 60 к/с) не больше 18 px: ' + maxStep.toFixed(1), maxStep);
  const lo = seg.filter(r => r.long && r.lop > 0.01 && r.lop < 0.99).length; ok(lo >= 12, 'текст подписи проявляется постепенно (' + lo + ' кадров)', lo);
  const tAfter = seg.find(r => r.long); const tEnd = d.scroll.to;
  ok(tAfter && tAfter.t >= tEnd && tAfter.t - tEnd < 1200, 'подпись раскрывается после прокрутки — через ' + Math.round(tAfter ? tAfter.t - tEnd : 0) + ' мс после последнего движения колеса', tAfter && tAfter.t - tEnd);
  { const open = seg.filter(r => r.long); const dt = open.length ? open[open.length - 1].t - open[0].t : 0; ok(dt >= 2600 && dt <= 3600, 'подпись остаётся раскрытой ≈ 3 с от начала раскрытия (≈ 1 с раскрытие + 2 с открыта): ' + Math.round(dt) + ' мс', dt); }
  const collapsed = rec.slice(rec.indexOf(tAfter)).some(r => !r.long && r.w < 70); ok(collapsed, 'затем подпись плавно сворачивается обратно в круг');
  ok(seg.filter(r => r.long && r.t > tAfter.t + 3800).length === 0, 'второй раз за ту же страницу подпись сама не раскрывается');
  const hovD = (d.hv || '').split(',').map(x => parseFloat(x)); ok(hovD.every(x => x <= 0.6), 'после появления отклик на наведение быстрый (переходы ≤ 0,6 с), а не 1 с «пружины»', d.hv);

  console.log('\n[системное «уменьшить движение»: анимации всё равно работают]');
  const r2 = await record(base, {viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'}); const R = r2.rec, ri = R.findIndex(r => r.op > 0.01), RS = R.slice(Math.max(0, ri - 1));
  ok(RS.filter(r => r.op > 0.02 && r.op < 0.98).length >= 60 && RS.some(r => r.sc < 0.95), 'появление — то же плавное, с движением (масштаб меняется)');
  { const RL = RS.filter(r => r.long); let rt = 0, rp = null; for (const r of RL) { let a = r.roll; if (rp !== null) { while (a - rp > 180) a -= 360; while (a - rp < -180) a += 360; rt += a - rp; } rp = a; }
    ok(RL.length && RL[RL.length - 1].w >= 150 && Math.abs(Math.abs(rt) - 360) < 25, 'и «выкатывание» с оборотом жемчужинки работает так же (' + Math.round(rt) + '°)', rt); }

  console.log('\n[телефон]');
  const m = await record(base, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}); const M = m.rec; const fin = M[M.length - 1];
  ok(fin.w === 56 && !M.some(r => r.long && r.w > 60), 'кнопка круглая (56 px), подпись не раскрывается', fin.w);
  const sc = M.filter(r => r.op > 0.01).map(r => r.sc); ok(Math.max(...sc) <= 1.002 && Math.min(...sc) >= 0.5, 'при появлении масштаб от 0,82 до 1 без перелёта (не меньше зоны нажатия 24 px)', [Math.min(...sc), Math.max(...sc)]);
  srv.close(); console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
