#!/usr/bin/env node
/* Проверка в браузере (нужны Playwright и Chromium; без них пропускается): лого и ссылки на главную ведут к основной странице (герою), а не к началу вступления с баночкой;
   вступление остаётся выше героя — до него можно долистать вверх, кадры при этом перематываются. Первая загрузка главной по-прежнему открывается со вступления.
   Запуск: node tools/check-logo.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const http = require('http'), fs = require('fs'), pth = require('path');
const ROOT = pth.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p)), OUT = process.env.CHECK_OUT || '';
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[pth.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  for (const [name, W, H, mobile] of [['компьютер', 1440, 900, false], ['телефон', 390, 844, true]]) {
    console.log(`\n[${name}]`);
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: mobile, hasTouch: mobile}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    const skipSplash = async () => { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await wait(1200); };
    const st = () => p.evaluate(() => { const j = document.getElementById('jar-story'), hero = document.querySelector('.hero'), c = window.Astreya.jar && window.Astreya.jar.ctrl, s = c && c.state(); return {y: Math.round(scrollY), jarH: j ? j.offsetHeight : -1, heroTop: hero ? Math.round(hero.getBoundingClientRect().top) : null, url: location.pathname, ctrl: !!c, p: s ? +s.p.toFixed(3) : null, firstDrawn: s ? s.firstDrawn : null}; });
    const jarPos = () => p.evaluate(() => { const j = document.getElementById('jar-story'), st = j.firstElementChild; return {top: Math.round(j.getBoundingClientRect().top + scrollY), tot: j.offsetHeight - st.clientHeight}; });

    await p.goto(base + 'index.html'); await skipSplash(); let s = await st();
    ok(s.y === 0 && s.jarH > H * 3 && s.ctrl && s.p < 0.02, 'первая загрузка главной открывается со вступления (прокрутка 0)', s);
    const jp = await jarPos();
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), jp.top + jp.tot * 0.4); await wait(1500); s = await st(); ok(Math.abs(s.p - 0.4) < 0.03, 'на середине вступления кадры идут по прокрутке', s);
    await p.click('#hdr a.logo'); await wait(3000); s = await st();
    ok(s.heroTop >= 0 && s.heroTop <= 170 && s.y > jp.tot, 'лого на главной во время вступления → прокрутка к герою', s);

    await p.evaluate(() => document.querySelector('#nav .nl[href$="catalog.html"]').click()); await wait(2600); ok(/catalog\.html/.test(p.url()), 'открыт каталог');
    await p.click('#hdr a.logo'); await wait(3200); s = await st();
    ok(/\/(index\.html)?$/.test(s.url) && s.heroTop >= 0 && s.heroTop <= 170 && s.y > jp.tot * 0.9, 'лого с другой страницы → главная, открыт герой', s);
    ok(s.jarH > H * 3 && s.ctrl, 'вступление при этом на месте (выше героя), движок запущен', s);

    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), jp.top + jp.tot * 0.35); await wait(1800); s = await st();
    ok(Math.abs(s.p - 0.35) < 0.03 && s.firstDrawn, 'прокрутка вверх от героя возвращает вступление: кадры перематываются назад', s);
    if (OUT) await p.screenshot({path: pth.join(OUT, `logo-intro-${mobile ? 'phone' : 'desktop'}.png`)});
    if (!mobile) { await p.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'})); await wait(1200); s = await st(); ok(s.y === 0 && s.p < 0.02, 'до самого верха — начало вступления', s); }

    await p.goto(base + 'index.html'); await skipSplash(); s = await st(); ok(s.y === 0 && s.p < 0.02, 'новый заход на сайт (не обновление) снова открывает вступление', s);
    await p.reload(); await skipSplash(); s = await st();
    ok(s.heroTop >= 0 && s.heroTop <= 170 && s.y > jp.tot * 0.9, 'обновление страницы (F5) на главной открывает героя, а не вступление', s);
    ok(s.jarH > H * 3 && s.ctrl, 'вступление при этом на месте выше героя, движок запущен', s);
    await p.reload(); await skipSplash(); s = await st(); ok(s.heroTop >= 0 && s.heroTop <= 170, 'повторное обновление — снова герой', s);
    await p.goto(base + 'index.html'); await skipSplash(); s = await st(); ok(s.y === 0 && s.p < 0.02, 'после обновлений новый заход по ссылке — снова вступление', s);
    await p.goto(base + 'brands.html'); await wait(1500); await p.click('#hdr a.logo'); await wait(3200); s = await st();
    ok(s.heroTop >= 0 && s.heroTop <= 170 && s.y > jp.tot * 0.9, 'заход сразу на внутреннюю страницу, затем лого → герой', s);
    await p.evaluate(() => document.querySelector('#nav .nl[href$="news.html"]').click()); await wait(2600); await p.goBack(); await wait(3000); s = await st(); ok(s.heroTop >= 0 && s.heroTop <= 170, 'кнопка «назад» на главную → герой', s);
    ok(p.errs.length === 0, 'нет ошибок JS', p.errs); await ctx.close();
  }
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
