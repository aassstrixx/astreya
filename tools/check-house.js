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
  t(await p.evaluate(() => { const m = document.getElementById('mag'), r = document.getElementById('house-reader'); return !!m && !!r && r.contains(m) && m.classList.contains('is-inline') && m.getAttribute('role') === 'region' && !m.hidden && m.querySelectorAll('.leaf').length > 0; }), 'журнал стоит в читалке после зала (#house-reader), как обычный блок региона; диалогом становится по кнопке «Журнал»');
  t(await p.evaluate(() => !!document.querySelector('#arch-story .ar-orb') && !!document.querySelector('#arch-story .ar-panel') && !document.querySelector('.hall-greet')), 'прежняя анимация и герой на месте: орбиты логотипов и панель «Почему выбирают Астрею?», приветствия поверх зала нет');
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

  /* ================= 3. два пути: проходы и журнал → одни и те же комнаты ================= */
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(700);
  { const y0 = await p.evaluate(() => scrollY); t(y0 > 300, 'зал: в конце закреплённой сцены (страница прокручивается)', y0); }
  await p.waitForFunction(() => document.querySelector('.js-stage.ar-live'), null, {timeout: 25000}).catch(() => {});
  const liveHall = await p.evaluate(() => !!document.querySelector('.js-stage.ar-live'));
  t(liveHall, 'кадры зала загрузились: сцена «живая» (проходы и журнал кликабельны)');
  /* путь А: проход (если у комнаты есть арка в зале) или ссылка списка комнат; путь Б: «Открыть комнату» на развороте журнала */
  const doorRooms = H.hall.doors.map(d => d.room);
  for (const id of ROOMS) {
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500);
    const door = doorRooms.includes(id) ? await p.$(`.hall-door[data-room="${id}"]`) : null;
    if (door && liveHall) await door.click({force: true}); else await p.evaluate(i => document.querySelector(`.hall-rooms a[data-house-go="${i}"]`).click(), id);
    await p.waitForTimeout(900);
    const at = await roomAt(p), hash = await p.evaluate(() => location.hash), y = await p.evaluate(i => Math.abs(document.getElementById('room-' + i).getBoundingClientRect().top), id);
    t(at === id && hash === '#room-' + id && y < 6, `путь А (${door ? 'проход' : 'список'}) «зал → комната ${id}»: комната на экране, адрес #room-${id}`, {at, hash, y: Math.round(y)});
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500);
    await p.evaluate(i => document.querySelector(`#mag .mg-open[data-house-go="${i}"]`).click(), id); await p.waitForTimeout(900);
    const at2 = await roomAt(p), hash2 = await p.evaluate(() => location.hash);
    t(at2 === id && hash2 === '#room-' + id, `путь Б (журнал) «зал → комната ${id}»: тот же адрес и то же место`, {at2, hash2});
  }
  t(await p.evaluate(() => getComputedStyle(document.documentElement).overflowY !== 'hidden' && getComputedStyle(document.body).overflowY !== 'hidden'), 'страница прокручивается: scroll-lock нет');
  { /* «Назад» возвращает к предыдущей точке дома */
    await p.evaluate(() => window.Astreya.house.go('brands')); await p.waitForTimeout(700); await p.evaluate(() => window.Astreya.house.go('finder')); await p.waitForTimeout(700);
    await p.goBack(); await p.waitForTimeout(900);
    const at = await roomAt(p); t(at === 'brands', 'кнопка браузера «Назад» возвращает в предыдущую комнату', at); }
  { /* плавающая навигация */
    await p.evaluate(() => window.Astreya.house.go('academy')); await p.waitForTimeout(900);
    const r = await p.evaluate(() => { const n = document.querySelector('.house-nav'); return {off: n.classList.contains('is-off'), cur: (document.querySelector('.hn-rooms a[aria-current="true"]') || {}).dataset && document.querySelector('.hn-rooms a[aria-current="true"]').dataset.houseGo}; });
    t(!r.off && r.cur === 'academy', 'вне зала плавающая навигация видна и подсвечивает текущую комнату', r);
    await p.click('.hn-hall'); await p.waitForTimeout(900);
    const y = await p.evaluate(() => scrollY); t(await roomAt(p) === null && y > 300, '«В зал» возвращает в центральный зал', {y}); }
  /* прежние якоря главной → комнаты */
  for (const [hash, room] of [['solutions', 'finder'], ['training-block', 'academy'], ['brands-gallery', 'brands'], ['how-to-start', 'partners'], ['start-path', 'partners']]) {
    const exists = await p.evaluate(h => !!document.getElementById(h), hash); if (!exists) { console.log('  – якоря #' + hash + ' на странице нет (пропуск)'); continue; }
    const q = await open(1440, 900, {url: page + '#' + hash}); await q.waitForTimeout(1800);
    const at = await roomAt(q); const inside = await q.evaluate(h => { const e = document.getElementById(h).getBoundingClientRect(); return e.bottom > 0 && e.top < innerHeight; }, hash);
    t(at === room && inside, `прежний адрес #${hash} открывает комнату ${room} на нужном месте`, {at, inside}); await q._ctx.close();
  }

  /* ================= 4. переход скролла к раскрытому журналу и журнал-диалог ================= */
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(700);
  const rd = () => p.evaluate(() => { const r = document.getElementById('house-reader'), b = r.getBoundingClientRect(), tot = r.offsetHeight - innerHeight; return {top: b.top + scrollY, tot, st: window.Astreya.house.readerState(), ra: parseFloat(r.style.getPropertyValue('--ra') || '0'), spread: document.querySelector('.mag-book').dataset.s}; });
  { const o = await rd(); t(o.tot > 300 && o.st.s === 0 && o.ra === 0, 'читалка: после зала закреплённая сцена; на входе журнал закрыт (--ra = 0)', o);
    const seq = [];
    for (const f of [.1, .2, .3, .45, .6, .8, .96]) { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o.top + o.tot * f); await p.waitForTimeout(450); const s = await rd(); seq.push([f, s.st.s, +s.ra.toFixed(2)]); }
    t(seq[0][2] > 0 && seq[1][2] > seq[0][2] && seq[2][1] === 1 && seq[2][2] === 1, 'читалка: журнал вырастает со столика (--ra растёт), к 30 % пути обложка раскрыта', seq);
    t(seq.slice(2).every((x, i, a) => i === 0 || x[1] >= a[i - 1][1]) && seq[6][1] >= 8, 'читалка: дальше прокрутка листает развороты вперёд (до контактов)', seq);
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o.top + o.tot * .5); await p.waitForTimeout(500);
    const mid = await p.evaluate(() => ({st: document.querySelector('.mag-st').textContent, vis: [...document.querySelectorAll('#mag .face:not([aria-hidden="true"]) h3')].length}));
    t(/Страницы \d+–\d+/.test(mid.st) && mid.vis >= 1, 'читалка: на экране два настоящих листа журнала (заголовки видны, остальные скрыты от скринридера)', mid);
    await p.click('#mag .mag-nx'); await p.waitForTimeout(1300); const nx = await rd();
    t(nx.st.s === o.st.s + 0 || nx.st.s > seq[4][1], 'читалка: «Далее» прокручивает сцену к следующему развороту', {s: nx.st.s});
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o.top + o.tot * .5); await p.waitForTimeout(400);
    await p.click('#house-reader .hr-skip'); await p.waitForTimeout(1000); t(await roomAt(p) === ROOMS[0], '«К комнатам» из читалки приводит в первую комнату', await roomAt(p)); }
  { /* журнал на столике: клик подъезжает сценой к раскрытому журналу */
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(800);
    await p.waitForFunction(() => document.querySelector('.js-stage.ar-live'), null, {timeout: 25000}).catch(() => {});
    if (await p.evaluate(() => !!document.querySelector('.js-stage.ar-live'))) {
      await p.focus('.mag-prev'); t(await p.evaluate(() => document.activeElement.classList.contains('mag-prev')), 'журнал на столике доступен с клавиатуры (кнопка получает фокус)');
      await p.keyboard.press('Enter'); await p.waitForTimeout(2200); const o = await rd();
      t(o.st.s >= 1 && o.st.t > .25, 'Enter на столике прокручивает к раскрытому журналу (первый разворот)', o.st); }
    else t(false, 'сцена зала не стала живой — журнал на столике не проверен'); }
  /* диалог: «Журнал» из комнаты и плавающей навигации */
  await p.evaluate(() => window.Astreya.house.go('brands')); await p.waitForTimeout(900);
  { await p.click('.room-brands .rn-mag'); await p.waitForTimeout(1200);
    const o = await p.evaluate(() => { const m = document.getElementById('mag'); return {open: m.classList.contains('is-open'), modal: m.classList.contains('is-modal') && m.getAttribute('role') === 'dialog' && m.getAttribute('aria-modal') === 'true', s: +document.querySelector('.mag-book').dataset.s, lock: document.documentElement.classList.contains('mag-lock'), pos: getComputedStyle(m).position}; });
    t(o.open && o.modal && o.s === 3 && o.lock && o.pos === 'fixed', 'журнал из комнаты открывается диалогом на развороте этой комнаты (комната 02 → разворот 3), прокрутка фона заперта на время диалога', o);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 4, 'стрелка → листает вперёд');
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400); t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 3, 'стрелка ← листает назад');
    await p.click('.mag-nx'); await p.waitForTimeout(500); t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 4, 'кнопка «Далее» листает вперёд');
    await p.click('.mag-cv'); await p.waitForTimeout(700);
    t(await p.evaluate(() => document.querySelector('.mag-book').dataset.s === '0' && document.querySelector('.mag-pv').disabled), 'на обложке кнопка «Назад» отключена (к обложке)');
    await p.keyboard.press('End'); await p.waitForTimeout(500);
    t(await p.evaluate(() => document.querySelector('.mag-book').dataset.end === '1' && document.querySelector('.mag-nx').disabled), 'в конце кнопка «Далее» отключена (End)');
    await p.keyboard.press('Home'); await p.waitForTimeout(400);
    const tocN = await p.evaluate(() => document.querySelectorAll('.mg-toc button').length); t(tocN === ROOMS.length + 1, 'оглавление: строка на каждую комнату и контакты', tocN);
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#mag .mg-toc button[data-mag-page="3"]').click()); await p.waitForTimeout(600);
    t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) === 3, 'строка оглавления открывает разворот комнаты 02', await p.evaluate(() => document.querySelector('.mag-book').dataset.s));
    let esc = true; for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); if (!await p.evaluate(() => document.getElementById('mag').contains(document.activeElement))) { esc = false; break; } }
    t(esc, 'Tab ходит только по журналу (фокус не уходит на страницу под ним)');
    const btn = await p.$('#mag .face:not([aria-hidden="true"]) .mg-open'); if (btn) { await btn.click({force: true}); await p.waitForTimeout(1200); }
    const aft = await p.evaluate(() => ({open: document.getElementById('mag').classList.contains('is-open'), hash: location.hash}));
    t(!aft.open && /^#room-brands$/.test(aft.hash) && await roomAt(p) === 'brands', 'кнопка «Открыть комнату» в журнале закрывает диалог и приводит в комнату 02 (тот же адрес, что у прохода)', aft);
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await p.waitForTimeout(900);
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    t(await p.evaluate(() => { const m = document.getElementById('mag'); return !m.classList.contains('is-open') && !m.classList.contains('is-modal') && m.getAttribute('role') === 'region' && !document.documentElement.classList.contains('mag-lock'); }), 'Esc закрывает диалог: журнал возвращается в читалку, блокировка прокрутки снята');
    const q = await open(1440, 900, {url: page + '#magazine/3'}); await q.waitForTimeout(2200);
    const m3 = await q.evaluate(() => ({open: document.getElementById('mag').classList.contains('is-open'), s: +document.querySelector('.mag-book').dataset.s}));
    t(m3.open && m3.s === 3, 'адрес #magazine/3 открывает журнал диалогом на третьем развороте', m3); await q._ctx.close();
  }
  t(p._errs.length === 0, 'нет ошибок JS на ПК', p._errs.slice(0, 5));
  t(p._fails.length === 0, 'нет неудачных запросов на ПК', p._fails.slice(0, 6));
  for (const w of [1440, 1100, 820]) { await p.setViewportSize({width: w, height: 900}); await p.waitForTimeout(500); t(await noOverflow(p), `нет горизонтальной прокрутки (${w})`); }
  await p._ctx.close();

  /* ================= 5. телефон ================= */
  p = await open(390, 844, {touch: true});
  t(await noOverflow(p), 'телефон: нет горизонтальной прокрутки в зале');
  t(await p.evaluate(() => getComputedStyle(document.querySelector('.hall-rooms')).display !== 'none' && document.querySelectorAll('.hall-rooms a').length === 7), 'телефон: в зале лента из семи комнат (путь без прохода и журнала)');
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
  for (const id of ['brands', 'finder', 'partners', 'editorial']) {
    await p.evaluate(i => window.Astreya.house.go(i), id); await p.waitForTimeout(800);
    t(await roomAt(p) === id && await noOverflow(p), `телефон: комната ${id} открывается, нет горизонтальной прокрутки`);
  }
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(700);
  { const o = await p.evaluate(() => { const r = document.getElementById('house-reader'), tot = r.offsetHeight - innerHeight; return {top: r.getBoundingClientRect().top + scrollY, tot}; });
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o.top + o.tot * .75); await p.waitForTimeout(900);
    const m = await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); return {s: window.Astreya.house.readerState().s, snap: getComputedStyle(l).scrollSnapType, ox: getComputedStyle(l).overflowX, w: document.querySelector('#mag .mag-book').getBoundingClientRect().width}; });
    t(m.s === 1 && /x/.test(m.snap) && m.ox !== 'hidden' && m.w <= 390, 'телефон: журнал в читалке раскрыт, одна страница, лента листается жестом (scroll-snap по горизонтали)', m);
    await p.click('#mag .mag-nx'); await p.waitForTimeout(900);
    t(await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); return l.scrollLeft > l.clientWidth * 0.5; }), 'телефон: кнопка «Далее» прокручивает ленту к следующей странице');
    await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); l.scrollTo({left: l.clientWidth * 3, behavior: 'instant'}); }); await p.waitForTimeout(500);
    t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) >= 1, 'телефон: номер страницы следует за жестом', await p.evaluate(() => document.querySelector('.mag-book').dataset.s));
    await p.evaluate(() => window.Astreya.house.go('about')); await p.waitForTimeout(800);
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await p.waitForTimeout(900); t(await p.evaluate(() => document.getElementById('mag').classList.contains('is-modal')), 'телефон: журнал из комнаты открывается диалогом');
    await p.keyboard.press('Escape'); await p.waitForTimeout(800); }
  t(await noOverflow(p), 'телефон: после закрытия журнала нет горизонтальной прокрутки');
  t(p._errs.length === 0, 'нет ошибок JS на телефоне', p._errs.slice(0, 5));
  await p._ctx.close();

  /* ================= 6. уменьшенное движение, без WebGL и без JS ================= */
  p = await open(1440, 900, {reduce: true});
  { const r = await p.evaluate(() => { const rd = document.getElementById('house-reader'), c = getComputedStyle(rd), s = document.getElementById('mag'); return {flat: rd.classList.contains('is-flat'), pos: getComputedStyle(rd.querySelector('.hr-stage')).position, h: rd.getBoundingClientRect().height, s: +document.querySelector('.mag-book').dataset.s, open: !s.hidden, orb: !!document.querySelector('.ar-orb')}; });
    t(r.flat && r.pos !== 'sticky' && r.h < 1500 && r.s === 1 && r.open && r.orb, 'prefers-reduced-motion: журнал — обычный экран, раскрытый на первом развороте (без закреплённой сцены); основная сцена зала и орбиты на месте', r); }
  { await p.evaluate(() => window.Astreya.house.go('finder')); await p.waitForTimeout(800); t(await roomAt(p) === 'finder', 'без анимации: переход в комнату работает');
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(600); t(await p.evaluate(() => scrollY) > 300, 'без анимации: «в зал» приводит в конец сцены зала'); }
  t(p._errs.length === 0, 'нет ошибок JS без анимации', p._errs.slice(0, 5));
  await p._ctx.close();

  /* без WebGL: сцена выключена (jar-off), вместо неё готовый кадр зала (постер) и те же проходы, журнал и список комнат */
  { const ctx = await b.newContext({viewport: {width: 1440, height: 900}, locale: 'ru-RU'}); await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return /webgl/.test(k) ? null : g.call(this, k, ...a); }; });
    await ctx.route(/^https:\/\/fonts\./, r => r.abort()); const q = await ctx.newPage(), qe = []; q.on('pageerror', e => qe.push(String(e.message || e).slice(0, 160)));
    await q.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await q.goto(base + '/' + page); await q.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(1800);
    const r = await q.evaluate(() => { const a = document.getElementById('arch-story'), s = a.querySelector('.js-stage'); return {off: a.classList.contains('jar-off'), pos: getComputedStyle(s).position, poster: getComputedStyle(a.querySelector('.ar-poster')).display, rooms: getComputedStyle(document.querySelector('.hall-rooms')).display, h: s.getBoundingClientRect().height}; });
    t(r.off && r.pos !== 'sticky' && r.poster === 'block' && r.rooms !== 'none' && r.h > 500 && r.h <= 1400, 'без WebGL: вместо сцены готовый кадр зала на один экран, список комнат на виду', r);
    await q.click('.hall-rooms a[data-house-go="finder"]'); await q.waitForTimeout(800); t(await q.evaluate(() => { const m = innerHeight * .4, r = [...document.querySelectorAll('.room')].find(e => { const b = e.getBoundingClientRect(); return b.top <= m + 2 && b.bottom > m; }); return r && r.dataset.room; }) === 'finder', 'без WebGL: переход в комнату работает');
    t(qe.length === 0, 'нет ошибок JS без WebGL', qe.slice(0, 4)); await ctx.close(); }

  p = await open(1440, 900, {nojs: true});
  { const r = await p.evaluate(() => ({rooms: document.querySelectorAll('section.room').length, h1: document.querySelectorAll('h1').length, vis: [...document.querySelectorAll('.room-body')].every(e => e.getBoundingClientRect().height > 40), list: document.querySelectorAll('.hall-rooms a[href^="#room-"]').length,
      hidden: [...document.querySelectorAll('.room')].filter(e => getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden').length, poster: getComputedStyle(document.querySelector('.ar-poster')).display, listVis: getComputedStyle(document.querySelector('.hall-rooms')).display}));
    t(r.rooms === 7 && r.h1 === 1 && r.vis && r.hidden === 0, 'без JS: семь комнат с содержимым подряд, один h1, ничего не скрыто', r);
    t(r.list === 7 && r.poster === 'block' && r.listVis !== 'none', 'без JS: в зале готовый кадр и список комнат (обычные якорные ссылки #room-…)', r); }
  { const hrefOk = await p.evaluate(() => [...document.querySelectorAll('.hall-rooms a[href^="#room-"]')].every(a => document.getElementById(a.getAttribute('href').slice(1)))); t(hrefOk, 'без JS: каждая ссылка списка комнат ведёт на существующий якорь'); }
  await p._ctx.close();

  await b.close(); srv.close();
  console.log(`\nИтог: ${ok} из ${ok + bad.length} проверок пройдено`);
  if (bad.length) { console.log('Не пройдено:\n - ' + bad.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
