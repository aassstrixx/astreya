#!/usr/bin/env node
/* Проверка в браузере (нужны Playwright и Chromium; без них пропускается): вступление с баночкой показывается только при первом заходе на сайт в сессии;
   лого/«Главная» ведут на основную страницу (героя), а не к началу вступления; ?intro возвращает вступление. Запуск: node tools/check-intro.js  (после node tools/build.js). */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const { chromium } = pw;
const http = require('http'), fs = require('fs'), pth = require('path');
const ROOT = pth.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x) : ''); } };
(async () => {
  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[pth.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const PORT = srv.address().port;
  const b = await chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const base = `http://127.0.0.1:${PORT}/`;
  const mk = async (w = 1440, h = 900, mobile = false) => { const ctx = await b.newContext({viewport: {width: w, height: h}, isMobile: mobile, hasTouch: mobile}); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return {ctx, p}; };
  const skipSplash = async p => { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await p.waitForTimeout(900); };
  const st = p => p.evaluate(() => { const j = document.getElementById('jar-story'), o = document.getElementById('jar-outro'), hero = document.querySelector('.hero'); const hr = hero && hero.getBoundingClientRect(); return {skip: document.documentElement.classList.contains('jar-skip'), jarH: j ? j.offsetHeight : -1, outroH: o ? o.offsetHeight : -1, heroTop: hr ? Math.round(hr.top) : null, y: Math.round(scrollY), docH: document.documentElement.scrollHeight, frames: j ? j.querySelectorAll('canvas').length : 0}; });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  console.log('1. первый заход на главную: вступление есть');
  let {ctx, p} = await mk(); await p.goto(base + 'index.html'); await skipSplash(p); let s = await st(p);
  ok(!s.skip && s.jarH > 3000 && s.outroH > 1000, 'вступление на месте', s);
  console.log('2. лого на главной во время вступления → к основной странице (герой), а не к началу вступления');
  await p.click('#hdr a.logo'); await wait(2600); s = await st(p);
  ok(s.heroTop >= 0 && s.heroTop <= 140 && s.y > 3000, 'герой у верха экрана после клика по лого', s);
  console.log('3. переход на другую страницу и возврат по лого — без вступления');
  await p.click('#nav .nl[href$="catalog.html"]'); await wait(2500);
  ok(/catalog\.html/.test(p.url()), 'открыт каталог'); ok(await p.evaluate(() => document.documentElement.classList.contains('jar-skip')), 'после перехода вступление «потрачено»');
  await p.click('#hdr a.logo'); await wait(2800); s = await st(p);
  ok(/\/(index\.html)?$/.test(p.url().split('?')[0]) && s.skip && s.jarH === 0 && s.outroH === 0, 'главная открыта без вступления', {url: p.url(), ...s});
  ok(s.y === 0 && s.heroTop >= 0 && s.heroTop < 200, 'герой сразу виден, прокрутка 0', s);
    ok(await p.evaluate(() => !document.querySelector('.jar-story canvas') || document.getElementById('jar-story').offsetHeight === 0), 'сцена баночки не показана');
  console.log('4. лого на главной без вступления → вверх (к герою)');
  await p.evaluate(() => window.scrollTo(0, 900)); await wait(800); await p.click('#hdr a.logo'); await wait(1800); s = await st(p); ok(s.y < 5, 'вернулись к началу главной', s);
  console.log('5. кнопка «назад» на главную — без вступления');
  await p.click('#nav .nl[href$="brands.html"]'); await wait(2300); await p.goBack(); await wait(2500); s = await st(p); ok(s.skip && s.jarH === 0, 'назад → главная без вступления', s);
  console.log('6. перезагрузка главной в той же сессии — без вступления');
  await p.reload(); await skipSplash(p); s = await st(p); ok(s.skip && s.jarH === 0 && s.heroTop >= 0 && s.heroTop < 200, 'после F5 открывается герой', s);
  console.log('7. ?intro возвращает вступление');
  await p.goto(base + 'index.html?intro'); await skipSplash(p); s = await st(p); ok(!s.skip && s.jarH > 3000, '?intro показывает вступление', s);
  ok(p.errs.length === 0, 'нет ошибок JS', p.errs); await ctx.close();

  console.log('8. новая сессия (новая вкладка) — вступление снова');
  ({ctx, p} = await mk()); await p.goto(base + 'index.html'); await skipSplash(p); s = await st(p); ok(!s.skip && s.jarH > 3000, 'в новой сессии вступление показывается', s); await ctx.close();
  console.log('9. заход сразу на внутреннюю страницу: лого ведёт на главную без вступления');
  ({ctx, p} = await mk()); await p.goto(base + 'catalog.html'); await wait(1200); await p.click('#hdr a.logo'); await wait(2800); s = await st(p); ok(s.skip && s.jarH === 0 && s.heroTop >= 0 && s.heroTop < 200, 'главная без вступления', s); await ctx.close();
  console.log('10. телефон: первый заход → вступление; лого → герой; потом без вступления');
  ({ctx, p} = await mk(390, 844, true)); await p.goto(base + 'index.html'); await skipSplash(p); s = await st(p); ok(!s.skip && s.jarH > 2000, 'телефон: вступление есть', s);
  await p.click('#hdr a.logo'); await wait(2800); s = await st(p); ok(s.heroTop >= 0 && s.heroTop < 160, 'телефон: лого → герой', s);
  await p.goto(base + 'catalog.html'); await wait(1000); await p.click('#hdr a.logo'); await wait(2800); s = await st(p); ok(s.skip && s.jarH === 0 && s.heroTop >= 0 && s.heroTop < 160, 'телефон: возврат по лого без вступления', s); await ctx.close();
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
