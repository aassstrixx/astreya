#!/usr/bin/env node
/* Проверка страницы «Новости» (интерактивная газета на каменном столе) и страниц статей в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Газета: вход (камера опускается от прокрутки, прокрутка не блокируется, «Открыть газету»), содержание из data/news.json (все материалы, тексты, ссылки, «до 15%»),
   листание кнопками / клавишами / точками / перетаскиванием (мышь, касание), «живой» лист (изгиб, тень на нижнем листе, пружина без выхода за 0…1), отлип уголка,
   фильтры, оглавление, ссылки вида #s3 / #a-n4 / #read-n4 / ?cat=, статья поверх газеты и возврат на тот же разворот, подписка (форма уходит), Стелла (asst-chip / asst-open),
   телефон 390 (одна страница, свайп, без горизонтальной прокрутки), «меньше движения» (кроссфейд, без пружины), без JS (архив списком), страницы статей (бумага на камне, действия те же).
   Запуск: node tools/check-news.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml'};
const NEWS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/news.json'), 'utf8')).items, SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const CATS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/news.json'), 'utf8')).categories;
const MAXPCT = Math.max(...SITE.discounts.map(d => d.pct));
let FC = null; try { FC = require('./fixed-clock.js'); } catch (e) {}
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };
const norm = s => String(s || '').replace(/[\s  ]+/g, ' ').trim();

(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('нет'); return; } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(Object.assign({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']}, CHROME ? {executablePath: CHROME} : {}));
  const leads = [];
  const open = async (url, w, h, o = {}) => {
    const ctx = await b.newContext(Object.assign({viewport: {width: w, height: h}, locale: 'ru-RU'}, o.ctx || {})); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    if (FC) await FC.install(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); sessionStorage.setItem('astreya:splash', '1'); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.setDefaultTimeout(9000); p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.route('**/api/lead', r => { try { leads.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
    await p.goto(base + '/' + url); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(1500); p._errs = errs; return p;
  };
  const st = p => p.evaluate(() => window.Astreya && window.Astreya.news ? window.Astreya.news.state() : null);
  const settle = async p => { await p.waitForTimeout(60); await p.waitForFunction(() => !window.Astreya.news.state().moving, null, {timeout: 6000}).catch(() => {}); await p.waitForTimeout(120); };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const toOpen = async p => { await p.evaluate(() => document.querySelector('[data-np-skip]').click()); await p.waitForFunction(() => { const s = window.Astreya.news.state(); return s.p >= .999 && s.cur >= 1; }, null, {timeout: 9000}).catch(() => {}); await settle(p); };
  const scrollP = (p, k) => p.evaluate(k => { const r = document.querySelector('[data-np-stage]').getBoundingClientRect(), root = document.querySelector('[data-np]'), cs = getComputedStyle(root);
    window.scrollTo({top: Math.round(r.top + pageYOffset - (parseFloat(cs.getPropertyValue('--np-hh')) || 84) + (parseFloat(cs.getPropertyValue('--np-intro')) || 1) * k), behavior: 'instant'}); }, k);
  const geom = p => p.evaluate(() => { const k = document.querySelector('[data-np-book]').getBoundingClientRect(), s = window.Astreya.news.state(); return {l: k.left, t: k.top, w: k.width, h: k.height, pw: s.pw}; });
  const drag = async (p, from, to, steps = 8, hold = false) => { await p.mouse.move(from[0], from[1]); await p.mouse.down(); await p.mouse.move(from[0] + (to[0] > from[0] ? 12 : -12), from[1]); await p.mouse.move(to[0], to[1], {steps}); if (!hold) await p.mouse.up(); };
  const swipe = (p, dx) => p.evaluate(dx => { const bk = document.querySelector('[data-np-book]'), r = bk.getBoundingClientRect(), y = r.top + r.height * .45, x0 = r.left + r.width * (dx < 0 ? .8 : .2);
    const ev = (ty, x, tg) => tg.dispatchEvent(new PointerEvent(ty, {pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1}));
    ev('pointerdown', x0, bk); for (let i = 1; i <= 8; i++) ev('pointermove', x0 + dx * i / 8, window); ev('pointerup', x0 + dx, window); }, dx);

  /* ================= ДЕСКТОП 1440 ================= */
  let p = await open('news.html', 1440, 900);
  t(await p.evaluate(() => document.body.dataset.page === 'news' && !!document.querySelector('.np[data-np]') && document.querySelectorAll('h1').length === 1), 'новости: страница v2 (.np), один заголовок первого уровня');
  const data = await p.evaluate(() => JSON.parse(document.getElementById('np-data').textContent));
  t(Object.keys(data.arts).length === NEWS.length && NEWS.every(n => data.arts[n.id] && data.arts[n.id].title === n.title && data.arts[n.id].date === n.date), 'газета: все ' + NEWS.length + ' материалов из data/news.json (названия, даты)');
  t(NEWS.every(n => data.arts[n.id].body.length === n.body.length && n.body.every((x, i) => /\{\{/.test(x) ? data.arts[n.id].body[i].includes(MAXPCT + '%') : data.arts[n.id].body[i] === x)), 'газета: тексты материалов — как в данных (все абзацы; пороги скидки подставлены из site.json)');
  t(await p.evaluate(ids => ids.every(id => document.querySelector('[data-np-pages] .np-art[data-id="' + id + '"]') || document.querySelector('.np-toc [data-np-open="' + id + '"]')), NEWS.map(n => n.id)), 'газета: каждый материал есть в разметке газеты или в оглавлении');
  t(await p.evaluate(m => { const a = document.querySelector('.np-fig-pct'), c = document.querySelector('.np-poster a[href*="partners.html#calc"]'), s = [...document.querySelectorAll('.np-poster a')].some(x => /partners\.html/.test(x.getAttribute('href')) && /партн/i.test(x.textContent));
    return !!a && new RegExp('до ' + m).test(a.getAttribute('aria-label')) && a.textContent.replace(/\D/g, '') === String(m) && !!c && s; }, MAXPCT), 'акция: «до ' + MAXPCT + '%» из данных, ссылки на partners.html#calc и «Стать партнёром»');
  t(await p.evaluate(() => !document.querySelector('.np [data-act="asst-chip"], .np [data-act="asst-open"], .np-hint, .np-stella, .np-ov-st') && !document.querySelector('.np [id*="chat"], .np iframe')), 'Стелла убрана из газеты (по просьбе владельца): ни подсказки внизу, ни блоков на страницах; общий помощник сайта остаётся отдельно');
  /* вход */
  let s = await st(p);
  t(s && s.mode === 'spread' && s.p === 0 && s.cur === 0, 'вход: сверху камера высоко, газета закрыта (обложка)', s);
  t(await p.evaluate(() => { const c = document.querySelector('[data-np-cam]'); return c.classList.contains('is-moving') && /54/.test(c.style.getPropertyValue('--rx')) && getComputedStyle(document.querySelector('[data-np-skip]')).display !== 'none'; }), 'вход: наклон камеры 54° и кнопка «Открыть газету»');
  t(await p.evaluate(() => { const r = document.querySelector('.np-pg[data-pg="0"]').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width * .5, r.top + r.height * .45); return !!e && !!e.closest('.np-pg[data-pg="0"]'); }), 'обложка лежит сверху стопки (порядок листов)');
  const y0 = await p.evaluate(() => pageYOffset); await p.mouse.move(700, 500); await p.mouse.wheel(0, 260); await p.waitForTimeout(500);
  const s1 = await st(p), y1 = await p.evaluate(() => pageYOffset);
  t(y1 > y0 + 100 && s1.p > 0.05 && s1.p < .9, 'вход: прокрутка колесом не блокируется, камера опускается (p растёт)', {y0, y1, p: s1.p});
  const frames = []; for (const k of [.1, .3, .5, .7, .9]) { await scrollP(p, k); await p.waitForTimeout(260); frames.push(await p.evaluate(() => { const c = document.querySelector('[data-np-cam]'); return parseFloat(c.style.getPropertyValue('--rx') || '0'); })); }
  t(frames.every((v, i) => i === 0 || v < frames[i - 1]) && frames[0] > 35 && frames[4] < 12, 'вход: угол камеры плавно уменьшается по фазам входа', frames);
  await scrollP(p, 0); await p.waitForTimeout(600);
  await toOpen(p); s = await st(p);
  t(s.p >= .999 && s.cur === 1 && await p.evaluate(() => document.querySelector('[data-np]').classList.contains('is-open') && document.querySelector('[data-np-cam]').classList.contains('is-flat')), '«Открыть газету»: камера над газетой, обложка откинулась — разворот 2–3', s);
  t(await p.evaluate(() => { const bk = document.querySelector('[data-np-book]').getBoundingClientRect(), e = document.elementFromPoint(bk.left + bk.width * .75, bk.top + bk.height * .5); return !!e && !!e.closest('.np-pg[data-pg="2"]'); }), 'разворот 2–3: сверху нужные страницы (стопка не перепутана)');
  /* листание */
  await p.click('[data-np-step="1"]'); await settle(p); s = await st(p);
  t(s.cur === 2 && /4–5/.test(await p.textContent('[data-np-pgtxt]')), 'листание: «Далее» → разворот 4–5, индикатор обновился', s);
  await p.click('[data-np-step="-1"]'); await settle(p); t((await st(p)).cur === 1, 'листание: «Назад» возвращает разворот');
  await p.keyboard.press('ArrowRight'); await settle(p); const k1 = (await st(p)).cur; await p.keyboard.press('ArrowRight'); await settle(p); const k2 = (await st(p)).cur; await p.keyboard.press('ArrowLeft'); await settle(p);
  t(k1 === 2 && k2 === 3 && (await st(p)).cur === 2, 'листание: клавиши ← →', {k1, k2});
  await p.click('[data-np-dot="5"]'); await settle(p); s = await st(p);
  t(s.cur === 5 && s.f.slice(0, 5).every(x => x === 1) && s.f[5] === 0, 'листание: точки страниц — несколько листов подряд «веером», состояние точное', s);
  await p.click('[data-np-dot="1"]'); await settle(p);
  /* «живой» лист: перетаскивание */
  let g = await geom(p), sx = g.l + g.w / 2, yy = g.t + g.h * .55, x0 = sx + .85 * g.pw;
  await drag(p, [x0, yy], [sx + .85 * g.pw * Math.cos(Math.PI * .3), yy], 6, true); await p.waitForTimeout(250);
  const live = await p.evaluate(() => { const L = [...document.querySelectorAll('.np-leaf')].find(l => l.classList.contains('is-bend')); if (!L) return null;
    const m = /rotateY\(([-\d.]+)deg\)/.exec(L.style.transform), sh = [...document.querySelectorAll('.np-shade')].map(e => +getComputedStyle(e).opacity), segs = L.querySelectorAll('.np-st').length;
    const rel = [...L.querySelectorAll('.np-st')].slice(1).map(e => (/rotateY\(([-\d.]+)deg\)/.exec(e.style.transform) || [0, 0])[1]).map(Number);
    return {ang: m && +m[1], shade: Math.max(...sh), segs, bent: rel.some(x => Math.abs(x) > .3), z: /translateZ/.test(L.style.transform)}; });
  t(live && live.ang < -40 && live.ang > -70 && live.segs >= 8 && live.bent && live.shade > .1 && live.z, 'лист в руке: поворот ≈ 54°, изгиб из полос, тень на нижнем листе, смещение по Z', live);
  await p.mouse.up(); await settle(p); s = await st(p);
  t(s.cur === 1 && s.f[1] === 0, 'короткое «надкусывание» листа: отпустили — лист вернулся на место', s);
  await drag(p, [x0, yy], [sx - .6 * g.pw, yy], 8); await settle(p); s = await st(p);
  t(s.cur === 2 && s.f[1] === 1 && s.f[2] === 0, 'перетаскивание за корешок: страница перевернулась, стопки точные', s);
  await drag(p, [sx - .85 * g.pw, yy], [sx + .6 * g.pw, yy], 8); await settle(p); t((await st(p)).cur === 1, 'перетаскивание назад: страница вернулась');
  await p.evaluate(() => { window.__fmax = 0; window.__fmin = 0; const l = () => { const f = window.Astreya.news.state().f; f.forEach(x => { window.__fmax = Math.max(window.__fmax, x); window.__fmin = Math.min(window.__fmin, x); }); if (!window.__fdone) requestAnimationFrame(l); }; requestAnimationFrame(l); });
  await p.click('[data-np-step="1"]'); await settle(p); await p.click('[data-np-step="-1"]'); await settle(p);
  const fm = await p.evaluate(() => { window.__fdone = 1; return [window.__fmin, window.__fmax]; });
  t(fm[0] >= -1e-6 && fm[1] <= 1 + 1e-6, 'физика: лист не проходит сквозь стопку (угол остаётся в пределах 0…180°)', fm);
  /* отлип уголка */
  await p.mouse.move(g.l + g.w - 16, g.t + g.h - 30, {steps: 4}); await p.waitForTimeout(700);
  t(await p.evaluate(() => document.querySelectorAll('.np-leaf.is-bend').length >= 1 && document.querySelector('[data-np]').classList.contains('is-grab')), 'уголок: при наведении кромка листа отлипает, курсор «берёт»');
  await p.mouse.move(g.l + g.w * .5, g.t + 5); await p.waitForTimeout(700); await settle(p);
  t(await p.evaluate(() => document.querySelectorAll('.np-leaf.is-bend').length === 0), 'уголок: увели курсор — лист лёг обратно (без полос, текст резкий)');
  /* фильтры */
  const cnt = c => NEWS.filter(n => c === 'all' || n.category === c).length;
  for (const c of CATS.map(x => x.id)) {
    await p.click('.np-hud-top [data-np-cat="' + c + '"]'); await p.waitForTimeout(500);
    const r = await p.evaluate(c => ({on: document.querySelector('[data-np-cat="' + c + '"]').getAttribute('aria-pressed'), status: !document.querySelector('[data-np-status]').hidden, ai: [...document.querySelectorAll('.np-ai')].filter(e => e.offsetParent).length, dim: document.querySelectorAll('.np-pg .np-art:not([data-cat="' + c + '"])').length > 0}), c);
    t(r.on === 'true' && r.status && r.ai === cnt(c), 'фильтр «' + c + '»: кнопка нажата, статус, в архиве ' + cnt(c) + ' материал(ов)', r);
  }
  await p.click('.np-hud-top [data-np-cat="sale"]'); await settle(p); s = await st(p);
  t(Math.ceil(s.cur) >= 1 && data.arts.n1.sp === s.cur, 'фильтр «Акции»: газета сама открыла разворот с акцией', {cur: s.cur, sp: data.arts.n1.sp});
  await p.click('.np-hud-top [data-np-cat="all"]'); await p.waitForTimeout(300);
  t(await p.evaluate(() => [...document.querySelectorAll('.np-ai')].filter(e => e.offsetParent).length === 9 && document.querySelector('[data-np-status]').hidden), 'фильтр «Все»: сброс');
  /* оглавление */
  await p.evaluate(() => document.querySelector('.np-tocbtn').click()); await p.waitForTimeout(300);
  t(await p.evaluate(() => !document.querySelector('[data-np-toc]').hidden && document.querySelector('.np-tocbtn').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('[data-np-toc] li').length === 9), 'оглавление: открывается, 9 материалов');
  await p.click('[data-np-toc] [data-np-jump="n4"]'); await settle(p); s = await st(p);
  t(s.cur === data.arts.n4.sp && await p.evaluate(() => document.querySelector('[data-np-toc]').hidden), 'оглавление: пункт открывает нужный разворот (n4) и закрывается', s);
  await p.evaluate(() => document.querySelector('.np-tocbtn').click()); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  t(await p.evaluate(() => document.querySelector('[data-np-toc]').hidden), 'оглавление: Esc закрывает');
  /* статья поверх газеты */
  const cur0 = (await st(p)).cur; await p.evaluate(() => document.querySelector('.np-pg:not([hidden]) [data-np-open="n4"]') && 0);
  await p.evaluate(() => window.Astreya.news.openArticle('n4')); await p.waitForTimeout(700);
  const ov = await p.evaluate(() => { const o = document.querySelector('[data-np-ov]'), d = o.querySelector('[role="dialog"]'); return {vis: !o.hidden, h: (o.querySelector('h2') || {}).textContent, paras: o.querySelectorAll('.np-ov-body p').length, modal: d && d.getAttribute('aria-modal'), hash: location.hash, cta: !!o.querySelector('.np-ov-act .np-btn'), page: !!o.querySelector('a[href*="news/"]')}; });
  t(ov.vis && ov.h === data.arts.n4.title && ov.paras === data.arts.n4.body.length && ov.modal === 'true' && ov.hash === '#read-n4' && ov.cta && ov.page, 'статья поверх газеты: окно, заголовок и все абзацы из данных, #read-n4, действие и «Отдельной страницей»', ov);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  t(await p.evaluate(() => document.querySelector('[data-np-ov]').hidden) && (await st(p)).cur === cur0, 'статья: Esc — возврат на тот же разворот', {cur0, now: (await st(p)).cur});
  await p.evaluate(() => window.Astreya.news.go(5, {instant: true})); await settle(p);
  await p.evaluate(() => window.Astreya.news.openArticle('n9')); await p.waitForTimeout(600); await p.evaluate(() => document.querySelector('[data-np-ov] [data-np-back]').click()); await p.waitForTimeout(600); await settle(p);
  t(await p.evaluate(() => document.querySelector('[data-np-ov]').hidden) && (await st(p)).cur === data.arts.n9.sp, 'статья: «К газете» показывает разворот, где она напечатана', {cur: (await st(p)).cur, sp: data.arts.n9.sp});
  /* все материалы: действия окна = действия страницы статьи */
  const cmp = await p.evaluate(async arts => { const out = []; for (const id of Object.keys(arts)) { const a = arts[id], html = await (await fetch(a.url)).text(), d = new DOMParser().parseFromString(html, 'text/html'), b = d.querySelector('.na-cta a.btn-fill'), u = x => x && new URL(x, new URL(a.url, location.href)).href;
      out.push({id, same: a.cta ? !!b && new URL(a.cta.href, location.href).href === u(b.getAttribute('href')) : !b, h1: (d.querySelector('h1') || {}).textContent === a.title, sheet: !!d.querySelector('.na-sheet'), band: !!d.querySelector('.cta-band')}); } return out; }, data.arts);
  t(cmp.length === 9 && cmp.every(x => x.same && x.h1 && x.sheet && x.band), 'статьи: 9 отдельных страниц (бумага .na-sheet, прежний заголовок и призыв), главное действие = действию в газете', cmp.filter(x => !(x.same && x.h1 && x.sheet && x.band)));
  /* подписка */
  await p.evaluate(() => window.Astreya.news.go(6, {instant: true})); await settle(p);
  await p.fill('.np-coupon [name=email]', 'news-test@example.com'); await p.check('.np-coupon [name=agree]'); await p.click('.np-coupon button[type=submit]'); await p.waitForTimeout(900);
  t(leads.some(l => /news-test@example\.com/.test(JSON.stringify(l))) && await p.evaluate(() => !!document.querySelector('.np-coupon .ok')), 'подписка: форма уходит (запрос на /api/lead), на купоне — подтверждение', leads.slice(-1));
  /* Стелла убрана из газеты; шапка прозрачная над столом */
  await p.evaluate(() => window.Astreya.news.go(1, {instant: true})); await settle(p);
  t(await p.evaluate(() => !document.querySelector('.np-poster [data-act="asst-chip"]') && !document.querySelector('.np-hint')), 'Стелла: на странице акции нет блока «Спросите Стеллу», внизу нет подсказки');
  t(await p.evaluate(() => { const h = document.querySelector('.hdr'), cs = getComputedStyle(h); return cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent'; }), 'шапка над столом прозрачная (белой полосы нет)');
  t(await noOverflow(p), 'новости 1440: нет горизонтальной прокрутки');
  t(p._errs.length === 0, 'новости 1440: нет ошибок консоли', p._errs); await p.context().close();

  /* ----- ссылки на разворот ----- */
  for (const [url, want, name] of [['news.html#s3', s => s.cur === 3 && s.p >= .999, '#s3'], ['news.html#a-n4', s => s.cur === 3, '#a-n4'], ['news.html#a-n3', s => s.cur === 2, '#a-n3'], ['news.html#s6', s => s.cur === 6, '#s6 (оборот)']]) {
    p = await open(url, 1440, 900); await settle(p); s = await st(p); t(want(s), 'адрес ' + name + ': открывает нужный разворот', s); await p.context().close();
  }
  p = await open('news.html#read-n3', 1440, 900); await p.waitForTimeout(600);
  t(await p.evaluate(() => !document.querySelector('[data-np-ov]').hidden && /EVA/.test(document.querySelector('[data-np-ov] h2').textContent)) && (await st(p)).cur === data.arts.n3.sp, 'адрес #read-n3: статья открыта поверх своего разворота', await st(p)); await p.context().close();
  p = await open('news.html?cat=edu', 1440, 900); await settle(p); s = await st(p);
  t(s.filter === 'edu' && await p.evaluate(() => [...document.querySelectorAll('.np-ai')].filter(e => e.offsetParent).length === 2), 'адрес ?cat=edu: фильтр включён, в архиве 2 материала', s); await p.context().close();

  /* ================= ПЛАНШЕТ 1024 ================= */
  p = await open('news.html', 1024, 768); await toOpen(p); s = await st(p);
  t(await noOverflow(p) && s.cur >= 1, 'новости 1024: газета открывается, нет горизонтальной прокрутки', s); t(p._errs.length === 0, 'новости 1024: нет ошибок консоли', p._errs); await p.context().close();

  /* ================= ТЕЛЕФОН 390 ================= */
  p = await open('news.html', 390, 844, {ctx: {hasTouch: true, isMobile: true, deviceScaleFactor: 2}});
  s = await st(p); t(s.mode === 'single' && await noOverflow(p), 'телефон: одна страница на экран, без горизонтальной прокрутки', s);
  await p.evaluate(() => document.querySelector('[data-np-skip]').click()); await p.waitForFunction(() => window.Astreya.news.state().p >= .999, null, {timeout: 9000}).catch(() => {}); await settle(p); s = await st(p);
  t(s.p >= .999 && s.cur === 1, 'телефон: «Открыть газету» → первая страница обложки откинута', s);
  await swipe(p, -170); await settle(p); const m1 = (await st(p)).cur; await swipe(p, 170); await settle(p); const m2 = (await st(p)).cur;
  t(m1 === 2 && m2 === 1, 'телефон: свайп влево — следующая страница, вправо — предыдущая', {m1, m2});
  const nb = await p.evaluate(() => [...document.querySelectorAll('.np-nav .np-nb')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), r.right <= innerWidth]; }));
  t(nb.length === 2 && nb.every(x => x[0] >= 44 && x[1] >= 44 && x[2]), 'телефон: кнопки «Назад/Далее» ≥ 44 px и в пределах экрана', nb);
  await p.tap('[data-np-step="1"]'); await settle(p); t((await st(p)).cur === 2, 'телефон: «Далее» листает');
  await p.evaluate(() => window.Astreya.news.go(10, {instant: true})); await settle(p);
  t(await p.evaluate(() => { const c = document.querySelector('.np-coupon'), pg = c.closest('.np-pg'); return !!c && pg.scrollHeight >= 0 && c.getBoundingClientRect().width <= innerWidth; }), 'телефон: страница подписки помещается по ширине');
  await p.fill('.np-coupon [name=email]', 'mobile-news@example.com'); await p.check('.np-coupon [name=agree]'); await p.evaluate(() => document.querySelector('.np-coupon button[type=submit]').click()); await p.waitForTimeout(900);
  t(leads.some(l => /mobile-news@example\.com/.test(JSON.stringify(l))), 'телефон: подписка уходит');
  await p.evaluate(() => window.Astreya.news.openArticle('n1')); await p.waitForTimeout(600);
  t(await p.evaluate(() => { const sh = document.querySelector('.np-ov-sheet').getBoundingClientRect(); return sh.width <= innerWidth + 1 && sh.height <= innerHeight + 1 && sh.left >= -1; }), 'телефон: статья поверх газеты помещается в экран');
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.tap('.np-hud-top [data-np-cat="edu"]'); await p.waitForTimeout(500);
  t(await p.evaluate(() => document.querySelector('[data-np-cat="edu"]').getAttribute('aria-pressed') === 'true'), 'телефон: фильтр переключается касанием');
  t(await noOverflow(p), 'телефон: после работы нет горизонтальной прокрутки'); t(p._errs.length === 0, 'телефон: нет ошибок консоли', p._errs); await p.context().close();

  /* ================= «МЕНЬШЕ ДВИЖЕНИЯ» ================= */
  p = await open('news.html', 1440, 900, {ctx: {reducedMotion: 'reduce'}}); s = await st(p);
  t(s.p === 0 && s.cur === 0 && !(await p.evaluate(() => document.querySelector('[data-np]').hasAttribute('data-np-static'))) && await p.evaluate(() => getComputedStyle(document.querySelector('[data-np-skip]').closest('.np-intro')).opacity === '1'), 'системное «меньше движения» игнорируется (по просьбе владельца): газета встречает закрытой, вход с кнопкой «Открыть газету» работает как у всех', s);
  await p.evaluate(() => document.querySelector('[data-np-step="1"]').click()); await p.waitForTimeout(40); s = await st(p);
  const fade = await p.evaluate(() => document.querySelector('[data-np-book]').getAnimations().length);
  t(s.cur >= 1 && s.moving && s.bend >= 1, 'системное «меньше движения» игнорируется: листание идёт пружиной с изгибом, как обычно', {s, fade});
  t(!(await p.$('[data-np-nomotion], .np-nomotion, button:has-text("Без анимации")')), '«меньше движения»: кнопки «Без анимации» нет'); t(p._errs.length === 0, '«меньше движения»: нет ошибок консоли', p._errs); await p.context().close();

  /* ================= БЕЗ JS: архив списком ================= */
  p = await open('news.html', 1440, 900, {ctx: {javaScriptEnabled: false}});
  const nj = await p.evaluate(() => ({stage: getComputedStyle(document.querySelector('.np-stage')).display, items: [...document.querySelectorAll('.np-ai')].filter(e => e.offsetParent).length, links: [...document.querySelectorAll('.np-ai h3 a')].every(a => /^(\.\/)?news\/[\w-]+\.html$/.test(a.getAttribute('href'))), t: [...document.querySelectorAll('.np-ai h3')].map(h => h.textContent.trim())}));
  t(nj.stage === 'none' && nj.items === 9 && nj.links && NEWS.every(n => nj.t.includes(n.title)), 'без JS: газета скрыта, читаемый список всех 9 материалов со ссылками на страницы статей', nj);
  t(await noOverflow(p), 'без JS: нет горизонтальной прокрутки'); await p.context().close();

  /* ================= СТРАНИЦЫ СТАТЕЙ ================= */
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
    p = await open('news/' + NEWS.find(n => n.id === 'n1').slug + '.html', w, h, touch ? {ctx: {hasTouch: true, isMobile: true}} : {});
    const a = await p.evaluate(() => { const sh = document.querySelector('.na-sheet'), r = sh.getBoundingClientRect(), im = document.querySelector('.na-cover'); return {h1: document.querySelectorAll('h1').length, crumbs: !!document.querySelector('.crumbs'), fits: r.left >= 0 && r.right <= innerWidth + 1, stone: getComputedStyle(document.querySelector('.na-stone')).backgroundImage.includes('table-s'), paper: getComputedStyle(sh).backgroundImage.includes('paper'), cta: !!document.querySelector('.na-cta .btn-fill'), band: !!document.querySelector('.cta-band'), rel: document.querySelectorAll('.na-more .newscard, .na-more .card').length >= 3, sib: !!document.querySelector('.na-sib a'), imgOk: !im || im.getBoundingClientRect().height < innerHeight * 1.2}; });
    t(a.h1 === 1 && a.crumbs && a.fits && a.stone && a.paper && a.cta && a.band && a.rel && a.sib && a.imgOk, 'статья ' + w + ': бумага на камне, крошки, действие, «Читайте также», соседние, завершающий призыв', a);
    await p.evaluate(() => window.scrollTo(0, 500)); await p.waitForTimeout(500);
    t(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-na-prog]')).transform.split(',')[0].replace('matrix(', '')) > 0), 'статья ' + w + ': полоса прогресса чтения растёт');
    t(await noOverflow(p) && p._errs.length === 0, 'статья ' + w + ': нет горизонтальной прокрутки и ошибок консоли', p._errs); await p.context().close();
  }
  p = await open('news/' + NEWS.find(n => n.id === 'n3').slug + '.html', 1440, 900);
  t(await p.evaluate(() => !!document.querySelector('.na-pk .np-pk') && !!document.querySelector('.na-cta a[href*="product"], .na-cta a.btn-fill')), 'статья-новинка: упаковки в кадре и главное действие (товар)'); await p.context().close();

  await b.close(); srv.close();
  console.log('check-news: ' + ok + '/' + (ok + bad.length) + ' проверок пройдено');
  if (bad.length) { bad.forEach(x => console.log('  ✗ ' + x)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
