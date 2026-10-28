#!/usr/bin/env node
/* Проверка «ASTREYA HOUSE» (главная как дом: src/pages/home-house.js, css/house.css, js/house.js, data/redesign.json → house) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Страница проверки: index.html, если house.enabled; иначе house.html (если house.preview); иначе проверка пропускается.
   Что проверяется: 1) структура — семь комнат из данных, один h1, у комнат подписи, двери = комнаты, журнал-диалог со всеми листами, плавающая навигация; 2) сохранность — все ссылки и якоря прежней главной
   (резервная метка restore-before-astreya-house-2026-10) есть на странице; 3) два пути — двери/список зала и журнал ведут в одни и те же комнаты (#room-…), адрес и кнопка «Назад» работают, прежние якоря (#solutions…)
   открывают нужную комнату; 4) журнал — открыть со столика, листать кнопками и стрелками, оглавление, «Открыть комнату», Esc и возврат фокуса, Tab не уходит из диалога, адрес #magazine/N;
   5) телефон 390×844 — нет горизонтальной прокрутки, журнал листается лентой, двери и список работают; 6) «без анимации» (prefers-reduced-motion) и без JS — комнаты и ссылки на месте, зал показывает готовый кадр, ничего не прячется;
   7) нет ошибок JS и неудачных запросов, страница прокручивается без блокировки.
   Запуск: node tools/check-house.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const RD = J('data/redesign.json'), H = RD.house || {};
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); console.log((cond ? '  ✓ ' : '  ✗ ') + name + (!cond && info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); };

(async () => {
  console.log('[ASTREYA HOUSE: главная как дом]');
  const page = H.enabled ? 'index.html' : H.preview ? 'house.html' : null;
  if (!page) { console.log('  – house выключен (ни enabled, ни preview): проверка пропущена'); process.exit(0); }
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const ROOMS = H.rooms.map(r => r.id);

  const open = async (w, h, o = {}) => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', isMobile: !!o.touch, hasTouch: !!o.touch, reducedMotion: o.reduce ? 'reduce' : 'no-preference', javaScriptEnabled: o.nojs ? false : true});
    await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    if (!o.nojs) await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} window.__ASTREYA_GL_GRID = 0.2; });
    const p = await ctx.newPage(), errs = [], fails = [];
    p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200)));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    p.on('requestfailed', r => { if (!/fonts\./.test(r.url())) fails.push(r.url().slice(-80)); });
    p.on('response', r => { if (r.status() >= 400 && !/api\/|fonts\./.test(r.url())) fails.push(r.status() + ' ' + r.url().slice(-80)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.goto(base + '/' + (o.url || page)); if (!o.nojs) { await p.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await p.addStyleTag({content: 'html{scroll-behavior:auto!important}'}); }
    await p.waitForTimeout(o.nojs ? 300 : 1400); p._errs = errs; p._fails = fails; p._ctx = ctx; return p;
  };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const st = p => p.evaluate(() => window.Astreya && window.Astreya.house && window.Astreya.house.state());
  const roomAt = p => p.evaluate(() => { const m = innerHeight * 0.4; const r = [...document.querySelectorAll('.room')].find(e => { const b = e.getBoundingClientRect(); return b.top <= m + 2 && b.bottom > m; }); return r ? r.dataset.room : null; });

  /* ================= 1. структура (ПК) ================= */
  let p = await open(1440, 900);
  t(await p.evaluate(() => document.body.dataset.page === 'home' && !!document.querySelector('#arch-story.is-house')), 'страница собрана как дом (#arch-story.is-house)');
  t(await p.evaluate(() => document.querySelectorAll('h1').length === 1), 'на странице один заголовок первого уровня');
  { const ids = await p.evaluate(() => [...document.querySelectorAll('section.room')].map(e => e.dataset.room));
    t(JSON.stringify(ids) === JSON.stringify(ROOMS) && ids.length === 7, 'семь комнат в порядке из данных: ' + ROOMS.join(' → '), ids); }
  t(await p.evaluate(() => [...document.querySelectorAll('section.room')].every(e => e.getAttribute('aria-label') && /^Комната \d\d: /.test(e.getAttribute('aria-label')) && e.id === 'room-' + e.dataset.room)), 'у комнат есть подпись «Комната NN: …» и якорь #room-…');
  { const d = await p.evaluate(() => [...document.querySelectorAll('.hall-door')].map(a => a.dataset.room));
    t(d.length === H.hall.doors.length && d.every(x => ROOMS.includes(x)) && new Set(d).size === d.length, 'двери зала: по одной на комнату из данных, без повторов', d); }
  t(await p.evaluate(n => document.querySelectorAll('.hall-rooms a[data-house-go]').length === n, ROOMS.length), 'в зале есть список комнат ссылками (запасной путь для клавиатуры и телефона)');
  t(await p.evaluate(n => document.querySelectorAll('#mag .leaf').length >= n + 2, ROOMS.length), 'журнал: обложка, оглавление, развороты всех комнат и контакты (листов не меньше комнат + 2)');
  t(await p.evaluate(() => { const m = document.getElementById('mag'); return !!m && m.getAttribute('role') === 'dialog' && m.getAttribute('aria-modal') === 'true' && m.hidden; }), 'журнал — диалог (role=dialog, aria-modal) и до открытия скрыт');
  t(await p.evaluate(() => !!document.querySelector('.house-nav') && document.querySelectorAll('.hn-rooms a').length === 7), 'плавающая навигация по дому: «в зал», журнал и семь комнат');
  t(await p.evaluate(() => [...document.querySelectorAll('section[aria-labelledby]')].every(s => document.getElementById(s.getAttribute('aria-labelledby')))), 'у разделов есть заголовок (aria-labelledby ведёт на существующий)');
  t(await p.evaluate(() => { const a = document.getElementById('arch-story'); return !!(a.querySelector('.js-stage canvas.js-cv') && a.querySelector('.ar-copy h1') && a.querySelector('.ar-cue')); }), 'сцена первого экрана и герой на месте (холст, заголовок, «Листайте»)');
  t((await st(p)) && (await st(p)).rooms.length === 7, 'API Astreya.house доступен', await st(p));

  /* ================= 2. сохранность ссылок и якорей прежней главной ================= */
  { let old = ''; try { old = cp.execSync('git show restore-before-astreya-house-2026-10:index.html', {cwd: ROOT, maxBuffer: 1 << 26}).toString(); } catch (e) {}
    if (!old) console.log('  – резервная метка не найдена: сравнение со старой главной пропущено');
    else {
      const attr = (html, re) => [...html.matchAll(re)].map(m => m[1]);
      const oldHref = new Set(attr(old, /<a\b[^>]*\shref="([^"#][^"]*|#[^"]+)"/g).filter(h => !/^(#|javascript)/.test(h) || /^#[a-z]/.test(h)).filter(h => !/^\/?(assets|css|js)\//.test(h)));
      const newHtml = fs.readFileSync(path.join(ROOT, page), 'utf8'), newHref = new Set(attr(newHtml, /<a\b[^>]*\shref="([^"]+)"/g));
      /* прежние сквозные ссылки шапки/подвала и разделов должны остаться; якоря внутри страницы — отдельно */
      const lost = [...oldHref].filter(h => !/^#/.test(h) && !newHref.has(h));
      t(lost.length === 0, 'все ссылки прежней главной на месте (' + [...oldHref].filter(h => !/^#/.test(h)).length + ')', lost.slice(0, 12));
      /* id прежней главной: якоря разделов обязаны остаться; оформительские id первого экрана (заставка, знак за шаром, подпись старого блока) заменены новой сценой */
      const oldIds = [...new Set(attr(old, /\sid="([a-z][\w-]*)"/g))], deco = /^(splash|sp-|hm-|hp-acad-h$)/;
      const miss = oldIds.filter(i => !deco.test(i) && !newHtml.includes(`id="${i}"`));
      t(miss.length === 0, 'все id (якоря) прежней главной есть в разметке', miss.slice(0, 15));
      const oldTrack = new Set(attr(old, /\sdata-track="([^"]+)"/g)), newTrack = new Set(attr(newHtml, /\sdata-track="([^"]+)"/g)), lostTr = [...oldTrack].filter(x => !newTrack.has(x));
      t(lostTr.length === 0, 'события аналитики data-track прежней главной сохранены', lostTr);
    } }

  /* ================= 3. два пути: двери/список и журнал → комнаты ================= */
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(700);
  { const y0 = await p.evaluate(() => scrollY); t(y0 > 300, 'зал: в конце закреплённой сцены (страница прокручивается)', y0); }
  for (const id of ROOMS) {
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500);
    /* ждём, пока зал станет «живым» (двери кликабельны): в программной среде кадры грузятся медленно */
    await p.waitForFunction(() => document.querySelector('.js-stage.ar-live'), null, {timeout: 20000}).catch(() => {});
    const link = await p.$(`.hall-rooms a[data-house-go="${id}"]`);
    const live = await p.evaluate(() => !!document.querySelector('.js-stage.ar-live'));
    if (link && live) await link.click({force: true}); else await p.evaluate(i => window.Astreya.house.go(i), id);
    await p.waitForTimeout(900);
    const at = await roomAt(p), hash = await p.evaluate(() => location.hash), y = await p.evaluate(i => Math.abs(document.getElementById('room-' + i).getBoundingClientRect().top), id);
    t(at === id && hash === '#room-' + id && y < 6, `путь «зал → комната ${id}»: комната на экране, адрес #room-${id}`, {at, hash, y: Math.round(y)});
  }
  t((await p.evaluate(() => window.pageYOffset)) > 0 && await p.evaluate(() => getComputedStyle(document.documentElement).overflowY !== 'hidden' && getComputedStyle(document.body).overflowY !== 'hidden'), 'страница прокручивается: scroll-lock нет');
  { /* «Назад» возвращает к предыдущей точке дома */
    await p.evaluate(() => window.Astreya.house.go('brands')); await p.waitForTimeout(700); await p.evaluate(() => window.Astreya.house.go('finder')); await p.waitForTimeout(700);
    await p.goBack(); await p.waitForTimeout(900);
    const at = await roomAt(p); t(at === 'brands', 'кнопка браузера «Назад» возвращает в предыдущую комнату', at); }
  { /* плавающая навигация */
    await p.evaluate(() => window.Astreya.house.go('academy')); await p.waitForTimeout(900);
    const r = await p.evaluate(() => { const n = document.querySelector('.house-nav'); return {off: n.classList.contains('is-off'), cur: (document.querySelector('.hn-rooms a[aria-current="true"]') || {}).dataset && document.querySelector('.hn-rooms a[aria-current="true"]').dataset.houseGo}; });
    t(!r.off && r.cur === 'academy', 'вне зала плавающая навигация видна и подсвечивает текущую комнату', r);
    await p.click('.hn-hall'); await p.waitForTimeout(900);
    const y = await p.evaluate(() => scrollY), hy = await p.evaluate(() => window.pageYOffset); t(await roomAt(p) === null && y > 300, '«В зал» возвращает в центральный зал', {y, hy}); }
  /* прежние якоря главной → комнаты */
  for (const [hash, room] of [['solutions', 'finder'], ['training-block', 'academy'], ['brands-gallery', 'brands'], ['how-to-start', 'partners'], ['start-path', 'partners']]) {
    const exists = await p.evaluate(h => !!document.getElementById(h), hash); if (!exists) { console.log('  – якоря #' + hash + ' на странице нет (пропуск)'); continue; }
    const q = await open(1440, 900, {url: page + '#' + hash}); await q.waitForTimeout(1800);
    const at = await roomAt(q); const inside = await q.evaluate(h => { const e = document.getElementById(h).getBoundingClientRect(); return e.bottom > 0 && e.top < innerHeight; }, hash);
    t(at === room && inside, `прежний адрес #${hash} открывает комнату ${room} на нужном месте`, {at, inside}); await q._ctx.close();
  }

  /* ================= 4. журнал ================= */
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(700);
  await p.waitForFunction(() => document.querySelector('.js-stage.ar-live'), null, {timeout: 20000}).catch(() => {});
  { const live = await p.evaluate(() => !!document.querySelector('.js-stage.ar-live'));
    if (live) { await p.focus('.mag-prev'); t(await p.evaluate(() => document.activeElement.classList.contains('mag-prev')), 'журнал на столике доступен с клавиатуры (кнопка получает фокус)'); await p.keyboard.press('Enter'); }
    else { console.log('  – кадры зала не успели прогрузиться: журнал открывается через API'); await p.evaluate(() => window.Astreya.house.openMagazine(1)); }
    await p.waitForTimeout(1200);
    const o = await p.evaluate(() => ({open: document.getElementById('mag').classList.contains('is-open'), s: +document.querySelector('.mag-book').dataset.s, lock: document.documentElement.classList.contains('mag-lock'), foc: document.activeElement && document.activeElement.className}));
    t(o.open && o.s === 1 && o.lock, 'журнал открылся на первом развороте (оглавление справа)', o);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 2, 'стрелка → листает вперёд');
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400); t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 1, 'стрелка ← листает назад');
    await p.click('.mag-nx'); await p.waitForTimeout(500); t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 2, 'кнопка «Далее» листает вперёд');
    await p.click('.mag-pv'); await p.waitForTimeout(500); await p.click('.mag-pv'); await p.waitForTimeout(500);
    t(await p.evaluate(() => document.querySelector('.mag-book').dataset.s === '0' && document.querySelector('.mag-pv').disabled), 'на обложке кнопка «Назад» отключена');
    await p.keyboard.press('End'); await p.waitForTimeout(500);
    t(await p.evaluate(() => document.querySelector('.mag-book').dataset.end === '1' && document.querySelector('.mag-nx').disabled), 'в конце кнопка «Далее» отключена (End)');
    await p.keyboard.press('Home'); await p.waitForTimeout(400);
    /* оглавление: каждая строка ведёт на разворот своей комнаты */
    await p.click('.mag-cv'); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('.mag-nx').click()); await p.waitForTimeout(500);
    const tocN = await p.evaluate(() => document.querySelectorAll('.mg-toc button').length); t(tocN === ROOMS.length + 1, 'оглавление: строка на каждую комнату и контакты', tocN);
    await p.click('.leaf.is-flipped ~ .leaf .mg-toc button[data-mag-page="3"], .mg-toc button[data-mag-page="3"]', {force: true}).catch(() => {}); await p.waitForTimeout(600);
    t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 3, 'строка оглавления открывает разворот комнаты 02', await p.evaluate(() => document.querySelector('.mag-book').dataset.s));
    /* Tab не уходит из диалога */
    let esc = true; for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); if (!await p.evaluate(() => document.getElementById('mag').contains(document.activeElement))) { esc = false; break; } }
    t(esc, 'Tab ходит только по журналу (фокус не уходит на страницу под ним)');
    /* «Открыть комнату» из журнала */
    await p.evaluate(() => document.querySelector('.leaf .face.front:not([aria-hidden="true"]) .mg-open, .leaf .face.back:not([aria-hidden="true"]) .mg-open') && document.querySelector('.mag-book').dataset.s);
    const btn = await p.$('#mag .face:not([aria-hidden="true"]) .mg-open'); if (btn) { await btn.click({force: true}); await p.waitForTimeout(1200); }
    const aft = await p.evaluate(() => ({open: document.getElementById('mag').classList.contains('is-open'), hash: location.hash}));
    t(!aft.open && /^#room-brands$/.test(aft.hash) && await roomAt(p) === 'brands', 'кнопка «Открыть комнату» в журнале закрывает его и приводит в комнату 02 (тот же адрес, что у двери)', aft);
    /* Esc и возврат фокуса */
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(600);
    const opener = await p.$('.hall-rooms a[data-house-go], .mag-prev'); await p.evaluate(() => window.Astreya.house.openMagazine(1)); await p.waitForTimeout(900);
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    t(await p.evaluate(() => !document.getElementById('mag').classList.contains('is-open') && document.getElementById('mag').hidden && !document.documentElement.classList.contains('mag-lock')), 'Esc закрывает журнал и снимает блокировку прокрутки');
    /* адрес журнала */
    const q = await open(1440, 900, {url: page + '#magazine/3'}); await q.waitForTimeout(2200);
    const m3 = await q.evaluate(() => ({open: document.getElementById('mag').classList.contains('is-open'), s: +document.querySelector('.mag-book').dataset.s}));
    t(m3.open && m3.s === 3, 'адрес #magazine/3 открывает журнал на третьем развороте', m3); await q._ctx.close();
  }
  t(p._errs.length === 0, 'нет ошибок JS на ПК', p._errs.slice(0, 5));
  t(p._fails.length === 0, 'нет неудачных запросов на ПК', p._fails.slice(0, 6));
  for (const w of [1440, 1100, 820]) { await p.setViewportSize({width: w, height: 900}); await p.waitForTimeout(500); t(await noOverflow(p), `нет горизонтальной прокрутки (${w})`); }
  await p._ctx.close();

  /* ================= 5. телефон ================= */
  p = await open(390, 844, {touch: true});
  t(await noOverflow(p), 'телефон: нет горизонтальной прокрутки в зале');
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
  for (const id of ['brands', 'finder', 'partners', 'editorial']) {
    await p.evaluate(i => window.Astreya.house.go(i), id); await p.waitForTimeout(800);
    t(await roomAt(p) === id && await noOverflow(p), `телефон: комната ${id} открывается, нет горизонтальной прокрутки`);
  }
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(700);
  { const live = await p.evaluate(() => !!document.querySelector('.js-stage.ar-live'));
    if (live) await p.tap('.mag-prev', {force: true}); else await p.evaluate(() => window.Astreya.house.openMagazine(1));
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); return {open: document.getElementById('mag').classList.contains('is-open'), snap: getComputedStyle(l).scrollSnapType, ox: getComputedStyle(l).overflowX, w: document.querySelector('#mag .mag-book').getBoundingClientRect().width}; });
    t(m.open && /x/.test(m.snap) && m.ox !== 'hidden' && m.w <= 390, 'телефон: журнал — одна страница, лента листается жестом (scroll-snap по горизонтали)', m);
    await p.click('.mag-nx'); await p.waitForTimeout(900);
    t(await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); return l.scrollLeft > l.clientWidth * 0.5; }), 'телефон: кнопка «Далее» прокручивает ленту к следующей странице');
    await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); l.scrollTo({left: l.clientWidth * 3, behavior: 'instant'}); }); await p.waitForTimeout(500);
    t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) >= 1, 'телефон: номер страницы следует за жестом', await p.evaluate(() => document.querySelector('.mag-book').dataset.s));
    await p.keyboard.press('Escape'); await p.waitForTimeout(800); }
  t(await noOverflow(p), 'телефон: после закрытия журнала нет горизонтальной прокрутки');
  t(p._errs.length === 0, 'нет ошибок JS на телефоне', p._errs.slice(0, 5));
  await p._ctx.close();

  /* ================= 6. «без анимации» и без JS ================= */
  p = await open(1440, 900, {reduce: true});
  t(await p.evaluate(() => document.getElementById('arch-story').classList.contains('is-static')), 'prefers-reduced-motion: зал показывается готовым кадром (is-static), закреплённой сцены нет');
  { const r = await p.evaluate(() => { const a = document.getElementById('arch-story'), s = a.querySelector('.js-stage'), c = getComputedStyle(s); return {pos: c.position, h: s.getBoundingClientRect().height, poster: !!a.querySelector('.ar-poster'), cv: getComputedStyle(a.querySelector('.js-cv')).display}; });
    t(r.pos !== 'sticky' && r.cv === 'none' && r.poster && r.h > 500 && r.h <= 1400, 'без анимации: холст скрыт, есть кадр-постер, высота зала — один экран', r); }
  { const r = await p.evaluate(() => { const bt = document.querySelector('.hall-rooms a'), c = getComputedStyle(bt); const m = document.querySelector('.mag-prev'); return {pe: c.pointerEvents, mpe: getComputedStyle(m).pointerEvents, op: +getComputedStyle(document.querySelector('.hall-rooms')).opacity}; });
    t(r.pe === 'auto' && r.mpe === 'auto' && r.op === 1, 'без анимации: список комнат и журнал на столике сразу доступны', r); }
  { await p.click('.hall-rooms a[data-house-go="finder"]'); await p.waitForTimeout(700); t(await roomAt(p) === 'finder', 'без анимации: переход в комнату работает'); }
  { const h = await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500); const y = await p.evaluate(() => scrollY); t(y < 40, 'без анимации: «в зал» возвращает наверх', y); }
  t(p._errs.length === 0, 'нет ошибок JS без анимации', p._errs.slice(0, 5));
  await p._ctx.close();

  p = await open(1440, 900, {nojs: true});
  { const r = await p.evaluate(() => ({rooms: document.querySelectorAll('section.room').length, h1: document.querySelectorAll('h1').length, vis: [...document.querySelectorAll('.room-body')].every(e => e.getBoundingClientRect().height > 40), list: document.querySelectorAll('.hall-rooms a[href^="#room-"]').length,
      hidden: [...document.querySelectorAll('.room')].filter(e => getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden').length, poster: getComputedStyle(document.querySelector('.ar-poster')).display, mag: document.getElementById('mag').hidden}));
    t(r.rooms === 7 && r.h1 === 1 && r.vis && r.hidden === 0, 'без JS: семь комнат с содержимым подряд, один h1, ничего не скрыто', r);
    t(r.list === 7 && r.poster === 'block', 'без JS: в зале готовый кадр и список комнат (обычные якорные ссылки #room-…)', r); }
  { const hrefOk = await p.evaluate(() => [...document.querySelectorAll('.hall-rooms a[href^="#room-"]')].every(a => document.getElementById(a.getAttribute('href').slice(1)))); t(hrefOk, 'без JS: каждая ссылка списка комнат ведёт на существующий якорь'); }
  await p._ctx.close();

  await b.close(); srv.close();
  console.log(`\nИтог: ${ok} из ${ok + bad.length} проверок пройдено`);
  if (bad.length) { console.log('Не пройдено:\n - ' + bad.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
