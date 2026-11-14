#!/usr/bin/env node
/* Проверка «ASTREYA HOUSE» (главная: зал и журнал; src/pages/home-house.js, css/house.css, js/house.js, data/redesign.json → house) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Страница проверки: index.html, если house.enabled; иначе house.html (если house.preview); иначе проверка пропускается.
   Что проверяется: 1) структура — после зала идёт только журнал (комнат-секций, ленты брендов, плавающего меню, проходов-арок и табличек нет), семь комнат — страницы журнала, один h1, прежняя сцена и герой на месте;
   2) прежние разделы доступны: у каждой комнаты в журнале ссылка на её полную страницу, шапка и подвал на месте, список изменений относительно прежней главной (резервная метка restore-before-astreya-house-2026-10);
   3) читалка — прокрутка раскрывает журнал и листает развороты вперёд; листы поворачиваются вслед за прокруткой (есть кадры «лист в движении»), на развороте страница стоит; «Назад/Далее», оглавление, клавиатура;
   4) переходы к комнатам — список зала, оглавление, адреса #room-…, #magazine/N, #hall и прежние якоря приводят на нужный разворот; журнал на столике доступен с клавиатуры;
   5) телефон 390×844 — нет горизонтальной прокрутки, журнал листается лентой, список разделов работает; 6) «уменьшить движение» (prefers-reduced-motion), без WebGL и без JS; 7) нет ошибок JS и неудачных запросов, прокрутка не блокируется.
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
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); console.log((cond ? '  ✓ ' : '  ✗ ') + name + (!cond && info !== undefined ? ' — ' + JSON.stringify(info) : '')); };

(async () => {
  console.log('[ASTREYA HOUSE: зал и журнал]');
  const page = H.enabled ? 'index.html' : H.preview ? 'house.html' : null;
  if (!page) { console.log('  – house выключен (ни enabled, ни preview): проверка пропущена'); process.exit(0); }
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const ROOMS = H.rooms.map(r => r.id);

  const open = async (w, h, o = {}) => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', isMobile: !!o.touch, hasTouch: !!o.touch, reducedMotion: o.reduce ? 'reduce' : 'no-preference', javaScriptEnabled: o.nojs ? false : true});
    await ctx.addInitScript(() => { window.__HOUSE_SNAP = false; });          // доворот листа после остановки отключён: проверки ставят точные промежуточные положения (его проверка — отдельная, включает на время)
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
  const rs = p => p.evaluate(() => window.Astreya.house.readerState());
  const settle = async (p, ms) => { let last = -1, same = 0; const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { const y = await p.evaluate(() => Math.round(scrollY)); if (y === last && !(await p.evaluate(() => window.Astreya.house.busy && window.Astreya.house.busy()))) { if (++same >= 5) return; } else { if (y !== last) same = 0; last = y; } await p.waitForTimeout(110); } await p.waitForTimeout(80); };          // автоход страницы (плавное листание) закончился: прокрутка стоит
  const box = p => p.evaluate(() => { const r = document.getElementById('house-reader'), b = r.getBoundingClientRect(); return {top: b.top + scrollY, tot: r.offsetHeight - innerHeight - (parseFloat(r.style.getPropertyValue('--hrx')) || 0) * innerHeight / 100}; });
  const at = async (p, f) => { const o = await box(p); await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o.top + o.tot * f); await p.waitForTimeout(450); return rs(p); };
  const PL = (j, u) => .34 + .62 * (j + u) / (ROOMS.length + 1);                    // положение прокрутки: j — сколько разворотов после первого пройдено, u — доля пути внутри отрезка; см. RD и WIN в js/house.js (p = 1 + j + поворот)

  /* ================= 1. структура (ПК) ================= */
  let p = await open(1440, 900);
  t(await p.evaluate(() => document.body.dataset.page === 'home' && !!document.querySelector('#arch-story.is-house')), 'страница собрана как дом (#arch-story.is-house)');
  t(await p.evaluate(() => document.querySelectorAll('h1').length === 1), 'на странице один заголовок первого уровня');
  t(await p.evaluate(() => !document.querySelector('section.room, .house-nav, .house-veil, .hall-door, .hd-tag, .hd-arch, .hall-doors, .room-door, .hp-marquee, #hb-strip')), 'нижней части нет: ни комнат-секций, ни плавающего меню, ни проходов-арок с табличками, ни ленты брендов');
  { const o = await p.evaluate(() => [...document.querySelector('#main, main').children].map(e => e.id || e.className.toString().split(' ')[0]));
    t(o[0] === 'arch-story' && o.filter(x => x !== 'g-entry').slice(-2).join() === 'house-reader,house-end' && o.length <= 6, 'после зала идёт только журнал (читалка), дальше — подвал сайта', o); }
  { const ids = await p.evaluate(() => [...document.querySelectorAll('#mag .pg-r[data-room]')].map(e => e.dataset.room));
    t(JSON.stringify(ids) === JSON.stringify(ROOMS) && ids.length === ROOMS.length && ROOMS.length === 9, 'девять комнат (с отдельными разворотами Каталога и Стеллы) — страницы журнала в порядке из данных: ' + ROOMS.join(' → '), ids); }
  t(await p.evaluate(() => [...document.querySelectorAll('#mag .pg-r[data-room]')].every(e => e.id === 'room-' + e.dataset.room)), 'у каждой страницы комнаты есть якорь #room-… (адреса прежней версии работают, без JS — обычные ссылки)');
  /* ---- логическая цепочка журнала и переход от страницы к разделу ---- */
  t(ROOMS.join() === 'about,brands,catalog,finder,stella,expertise,academy,editorial,partners', 'цепочка знакомства: компания → бренды → каталог → подбор → Стелла → экспертиза → учебный центр → новости → партнёрам (→ контакты)', ROOMS);
  { const r = await p.evaluate(() => { const rs = [...document.querySelectorAll('#mag .pg-r[data-room]')], out = [];
      rs.forEach((e, i) => { const nx = e.querySelector('.pg-f .pg-nx'); out.push(nx ? nx.getAttribute('data-mag-page') : null); });
      const c = [...document.querySelectorAll('#mag .pg-r')].pop(), cn = c && c.querySelector('.pg-f .pg-nx'); return {nx: out, last: cn && cn.getAttribute('data-mag-page'), lastToc: !!(cn && cn.classList.contains('pg-nx-toc'))}; });
    t(r.nx.every((v, i) => v === String(i + 3)) && r.last === '1' && r.lastToc, 'в колонтитуле каждой правой страницы кнопка «Дальше · …» ведёт на следующий разворот цепочки, на контактах — «К оглавлению»', r); }
  { const r = await p.evaluate(() => [...document.querySelectorAll('#mag .pg-l[data-room-l]')].map(e => ({room: e.getAttribute('data-room-l'), sec: e.getAttribute('data-sec'), chip: !!e.querySelector('.mg-sec')})));
    const want = Object.fromEntries(H.rooms.map(r => [r.id, r.href])); want.contacts = 'contacts.html';
    t(r.length === ROOMS.length + 1 && r.every(x => x.sec && x.sec.replace(/^\.\.?\//, '') === want[x.room] && !x.chip), 'левая страница каждой комнаты и контактов — вход в раздел: переход по нажатию на страницу ведёт на нужную страницу сайта; плашек «Открыть раздел» на страницах нет', r); }
  { const q = await open(1440, 900, {url: page + '?lite=1'}); await q.waitForFunction(() => window.Astreya && window.Astreya.house && window.Astreya.house.state, null, {timeout: 15000}).catch(() => {}); await q.waitForTimeout(800); await q.evaluate(() => document.documentElement.classList.add('lite'));
    const ok = await Promise.all([q.waitForURL(/brands\.html/, {timeout: 25000}).then(() => true).catch(() => false), q.evaluate(() => document.querySelector('#mag .pg-l[data-room-l="brands"] .mg-ph, #mag .pg-l[data-room-l="brands"]').click())]);
    t(ok[0], 'нажатие на левую страницу журнала (бренды) переводит на раздел «Бренды» (шторка перехода сайта)'); await q._ctx.close(); }
  { const q = await open(1440, 900, {url: page + '?lite=1'}); await q.waitForFunction(() => window.Astreya && window.Astreya.house && window.Astreya.house.state, null, {timeout: 15000}).catch(() => {}); await q.waitForTimeout(800); await q.evaluate(() => document.documentElement.classList.add('lite'));
    const ok = await Promise.all([q.waitForURL(/catalog\.html/, {timeout: 25000}).then(() => true).catch(() => false), q.evaluate(() => document.querySelector('#mag .pg-r[data-room="finder"] h3').click())]);
    t(ok[0], 'нажатие на заголовок правой страницы (подбор) переводит на раздел «Каталог»'); await q._ctx.close(); }
  t(await p.evaluate(n => document.querySelectorAll('.hall-rooms a[data-house-go]').length === n, ROOMS.length), 'в зале есть список разделов ссылками (запасной путь для клавиатуры, телефона и режимов без анимации)');
  t(await p.evaluate(n => document.querySelectorAll('#mag .leaf').length >= n + 2, ROOMS.length), 'журнал: обложка, оглавление, развороты всех комнат и контакты');
  t(await p.evaluate(() => { const m = document.getElementById('mag'), r = document.getElementById('house-reader'); return !!m && !!r && r.contains(m) && m.getAttribute('role') === 'region' && !m.hidden && !m.classList.contains('is-modal') && !m.querySelector('[data-mag-close]'); }), 'журнал стоит в читалке как обычный блок страницы (не диалог, закрывать нечего)');
  t(await p.evaluate(() => !!document.querySelector('#arch-story .ar-orb') && !document.querySelector('#arch-story .ar-panel') && !!document.querySelector('#arch-story .hs-cue') && !document.querySelector('.hall-greet')), 'прежняя анимация и герой на месте: орбиты логотипов; вместо панели «Почему выбирают Астрею?» внизу — подсказка «Листайте ниже — откроется журнал» (только текст)');
  { const bgs = []; for (const f of [0, .12, .3, .5, .7, .9, 1]) { await p.evaluate(fr => { const a = document.getElementById('arch-story'); window.scrollTo({top: Math.round((a.getBoundingClientRect().top + scrollY + a.offsetHeight - innerHeight) * fr), behavior: 'instant'}); }, f); await p.waitForTimeout(220); bgs.push(await p.evaluate(() => { const c = getComputedStyle(document.getElementById('hdr')); return c.backgroundColor + '|' + c.backdropFilter; })); }
    await p.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
    t(bgs.every(x => x.startsWith('rgba(0, 0, 0, 0)') && /none$/.test(x)), 'шапка на главной везде без белого фона и размытия: на заставке с баночкой, в середине анимации и на кадре зала', bgs); }
  t(await p.evaluate(() => { const c = document.querySelector('#arch-story .hs-cue'), cs = c && getComputedStyle(c); return !document.querySelector('#arch-story .ar-cta') && !!cs && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.boxShadow === 'none'; }), 'на сцене героя нет кнопок «Перейти в каталог» / «Стать партнёром», подсказка «Листайте ниже…» без фона и тени');
  t(await p.evaluate(() => [...document.querySelectorAll('section[aria-labelledby]')].every(s => document.getElementById(s.getAttribute('aria-labelledby')))), 'у разделов есть заголовок (aria-labelledby ведёт на существующий)');
  t(await p.evaluate(() => { const a = document.getElementById('arch-story'); return !!(a.querySelector('.js-stage canvas.js-cv') && a.querySelector('.ar-copy h1') && a.querySelector('.ar-cue')); }), 'сцена первого экрана и герой на месте (холст, заголовок, «Листайте»)');
  t(await p.evaluate(() => !!document.querySelector('header .nav, header nav') && !!document.querySelector('footer.ftr')), 'шапка с меню и подвал сайта на месте');
  { const s = await p.evaluate(() => window.Astreya.house.state()); t(s && s.rooms.length === ROOMS.length && s.reader === true, 'API Astreya.house доступен', s); }

  /* ================= 2. прежние разделы доступны ================= */
  { const hrefs = await p.evaluate(() => [...document.querySelectorAll('#mag a[href]')].map(a => a.getAttribute('href')));
    const miss = H.rooms.filter(r => !hrefs.some(h => h.replace(/^\.\.?\//, '') === r.href)).map(r => r.id);
    t(miss.length === 0, 'у каждой комнаты на странице журнала кнопка на её полную страницу (' + H.rooms.map(r => r.href).join(', ') + ')', miss); }
  { const tr = await p.evaluate(() => [...document.querySelectorAll('#mag a[href]')].filter(a => !/^(tel|mailto):/.test(a.getAttribute('href'))).map(a => a.dataset.track || ''));
    t(tr.length >= 40 && tr.every(x => x), 'все ссылки журнала считаются в аналитике (у каждой есть data-track)', {n: tr.length, noTrack: tr.filter(x => !x).length}); }
  { let old = ''; try { old = cp.execSync('git show restore-before-astreya-house-2026-10:index.html', {cwd: ROOT, maxBuffer: 1 << 26}).toString(); } catch (e) {}
    if (!old) console.log('  – резервная метка не найдена: сравнение со старой главной пропущено');
    else {
      const attr = (html, re) => [...html.matchAll(re)].map(m => m[1]);
      const oldHref = new Set(attr(old, /<a\b[^>]*\shref="([^"#][^"]*)"/g).filter(h => !/^(javascript|mailto|tel)/.test(h) && !/^\/?(assets|css|js)\//.test(h)));
      const newHtml = fs.readFileSync(path.join(ROOT, page), 'utf8'), newHref = new Set(attr(newHtml, /<a\b[^>]*\shref="([^"]+)"/g));
      const lost = [...oldHref].filter(h => !newHref.has(h));
      const pages = new Set(lost.map(h => h.split('#')[0]));
      /* информационно: чего больше нет на главной (по просьбе заказчика нижняя часть убрана); страницы остаются в меню, подвале и журнале */
      console.log('  i  с главной ушло ссылок: ' + lost.length + ' (внутренние страницы: ' + [...pages].filter(x => !/^https?:/.test(x)).length + '); они остаются на своих страницах, в меню и подвале');
      const core = ['catalog.html', 'brands.html', 'training.html', 'partners.html', 'company.html', 'contacts.html'], missing = core.filter(x => !newHref.has(x) && ![...newHref].some(h => h.split('#')[0] === x));
      t(missing.length === 0, 'основные страницы сайта по-прежнему достижимы с главной (каталог, бренды, обучение, партнёрам, о компании, контакты)', missing);
    } }

  /* ================= 3. читалка: прокрутка раскрывает журнал и листает ================= */
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(700);
  { const y0 = await p.evaluate(() => scrollY); t(y0 > 300, 'зал: в конце закреплённой сцены (страница прокручивается)', y0); }
  await p.waitForFunction(() => document.querySelector('.js-stage.ar-live'), null, {timeout: 25000}).catch(() => {});
  t(await p.evaluate(() => !!document.querySelector('.js-stage.ar-live')), 'кадры зала загрузились: сцена «живая» (журнал на столике кликабелен)');
  { const o = await box(p); t(o.tot > 1500, 'читалка: после зала закреплённая сцена достаточной длины для листания', o);
    const seq = []; for (const f of [.1, .2, .285, .36, .52, .7, .96]) { const s = await at(p, f); const ra = await p.evaluate(() => +document.getElementById('house-reader').style.getPropertyValue('--ra')); seq.push([f, s.s, +s.p.toFixed(2), +ra.toFixed(2)]); }
    t(seq[0][3] === 0 && seq[2][3] > 0 && seq[3][3] === 1 && seq.every(x => x[1] >= 1), 'читалка: пролёт камеры к журналу (0…30 % пути), в конце живой журнал проявляется на первом развороте (разворот 2–3), обложка не показывается', seq);
    t(seq.slice(3).every((x, i, a) => i === 0 || x[2] >= a[i - 1][2]) && seq[6][1] >= 8, 'читалка: дальше прокрутка листает развороты вперёд (до контактов)', seq);
    t(await p.evaluate(() => { const r = document.getElementById('house-reader'); return parseFloat(r.style.getPropertyValue('--ra')) === 1; }), 'читалка: к концу пролёта журнал на полном размере (--ra = 1)'); }
  if ((H.fly || {}).enabled) { /* пролёт камеры — второй экземпляр движка зала (js/jar.js, data-fly): ключи пролёта + глубина + дорожка камеры + спрайты баночки */
    const fl = H.fly;
    await p.evaluate(() => { const f = window.Astreya.jar.fly; if (f) { window.Astreya.flyWarm = true; f.warm(); } });
    await p.waitForFunction(n => { const f = window.Astreya.jar.fly; return f && f.state().loaded >= n && f.complete(); }, fl.n, {timeout: 60000}).catch(() => {});
    const fs0 = await p.evaluate(() => { const f = window.Astreya.jar.fly; return f ? f.state() : null; });
    t(!!fs0 && fs0.gl && fs0.loaded >= fl.n, 'пролёт камеры: движок зала (второй экземпляр) загрузил все ключи пролёта (' + fl.n + ' из ' + fl.n + ': цвет, глубина, спрайты баночки)', fs0 && {loaded: fs0.loaded, n: fs0.N});
    t(!(await p.evaluate(() => !!document.querySelector('.hr-seq'))), 'пролёт камеры: старого набора картинок (холст .hr-seq) нет — кадр строит движок перепроекцией по глубине');
    const fp = async f => { await at(p, f); await p.waitForFunction(() => { const s = window.Astreya.jar.fly.state(); return s.firstDrawn && Math.abs(s.p - s.pTarget) < 3e-4; }, null, {timeout: 12000}).catch(() => {}); return p.evaluate(() => { const s = window.Astreya.jar.fly.state(), h = document.querySelector('.hr-fly'); return {p: +s.p.toFixed(4), pT: +s.pTarget.toFixed(4), tr: h.style.transform, ok: s.jarOk, shown: s.jar.shown, ready: document.getElementById('house-reader').classList.contains('ready')}; }); };
    const a0 = await fp(.06), a1 = await fp(.15), a2 = await fp(.29), a3 = await fp(.31);
    t(a0.ready && a0.shown && a1.p > a0.p + .02 && a2.p > a1.p + .02, 'пролёт камеры: картинку строит движок, положение идёт вместе с прокруткой (в начале, посередине, в конце)', {a0, a1, a2});
    t(Math.abs(a3.p - fl.F) < 2e-3 && Math.abs(a3.pT - fl.F) < 1e-6, 'пролёт камеры: в конце камера стоит над журналом (конец дорожки пролёта)', a3);
    /* живой журнал подогнан под нарисованный (а не слой под живой): слой пролёта не двигается и не сжимается, по краям экрана полос нет; размер и центр совпадают на любом экране */
    const fit = async () => p.evaluate(() => { const r = JSON.parse(document.getElementById('house-reader').getAttribute('data-fly-rect')), st = document.querySelector('.hr-stage').getBoundingClientRect(), W = st.width, Hh = st.height, ww = Math.max(W, Hh * 16 / 9), wh = ww * 9 / 16, b = document.querySelector('#mag .mag-book').getBoundingClientRect(), cv = document.querySelector('.hr-fly .js-cv').getBoundingClientRect(), fly = document.querySelector('.hr-fly');
      return {dw: +(b.width - (r[2] - r[0]) * ww).toFixed(2), dx: +(b.left + b.width / 2 - (W / 2 + ((r[0] + r[2]) / 2 - .5) * ww)).toFixed(2), dy: +(b.top + b.height / 2 - (Hh / 2 + ((r[1] + r[3]) / 2 - .5) * wh)).toFixed(2), tr: fly.style.transform, cover: cv.left <= 0.5 && cv.top <= 0.5 && cv.right >= W - 0.5 && cv.bottom >= Hh - 0.5}; });
    await at(p, .31); const f0 = await fit();
    t(Math.abs(f0.dw) < 1.5 && Math.abs(f0.dx) < 1.5 && Math.abs(f0.dy) < 1.5 && !f0.tr && f0.cover, 'пролёт камеры: живой журнал ровно на месте нарисованного (размер и центр, ≤ 1,5 px), слой пролёта не сдвинут и не сжат, края экрана закрыты картинкой (1440×900)', f0);
    const vp0 = p.viewportSize();
    for (const [vw, vh] of [[1868, 960], [1280, 720], [1100, 900]]) {
      await p.setViewportSize({width: vw, height: vh}); await p.waitForTimeout(500); await at(p, .31); await p.waitForTimeout(300); const fw = await fit();
      t(Math.abs(fw.dw) < 1.5 && Math.abs(fw.dx) < 1.5 && Math.abs(fw.dy) < 1.5 && !fw.tr && fw.cover, 'пролёт камеры: то же на другом экране — журнал на месте нарисованного, по краям полос нет (' + vw + '×' + vh + ')', fw); }
    await p.setViewportSize(vp0); await p.waitForTimeout(500);
    const cmp = await p.evaluate(() => { const b = document.querySelector('#mag .mag-book').getBoundingClientRect(), w = document.querySelector('#mag .mag-wrap'); return {bw: Math.round(b.width), op: +getComputedStyle(w).opacity}; });
    t(cmp.bw > 300 && cmp.op === 1, 'пролёт камеры: живой журнал на месте, виден (' + cmp.bw + ' px)', cmp);
    /* двоения нет: пока живой журнал не начал проявляться (--ra = 0), нарисованный уже совмещён с ним; проявление короткое */
    const ghost = await p.evaluate(() => { const g = x => { const r = document.getElementById('house-reader'); return +r.style.getPropertyValue(x); }; return {ra: g('--ra')}; });
    await at(p, .05 + .25 * .8); const rA = await p.evaluate(() => +document.getElementById('house-reader').style.getPropertyValue('--ra'));
    t(rA === 0, 'пролёт камеры: на первых 90 % пролёта живой журнал ещё не виден — двоения картинки на входе нет', {rA, ghost});
  }
  { /* эффект перелистывания: лист поворачивается вслед за прокруткой, а не прыгает */
    const f1 = await at(p, PL(0, .375));
    const mid = await p.evaluate(() => { const l = [...document.querySelectorAll('#mag .leaf.is-turning')][0]; if (!l) return null; const cs = getComputedStyle(l); return {f: parseFloat(l.style.getPropertyValue('--f')), lt: parseFloat(l.style.getPropertyValue('--lt')), tr: cs.transform, k: +l.dataset.k}; });
    t(!!mid && mid.f > .05 && mid.f < .95 && mid.lt > .1 && mid.tr !== 'none' && mid.tr !== 'matrix(1, 0, 0, 1, 0, 0)', 'листание: на четверти пути лист повёрнут частично (--f между 0 и 1), приподнят и в 3D-трансформации', {mid, p: f1.p});
    const f2 = await at(p, PL(0, .625)); const mid2 = await p.evaluate(() => parseFloat(([...document.querySelectorAll('#mag .leaf.is-turning')][0] || {style: {getPropertyValue: () => 'NaN'}}).style.getPropertyValue('--f')));
    t(f2.p > f1.p && mid2 > mid.f, 'листание: чем дальше прокрутка, тем сильнее повёрнут лист (поворот привязан к прокрутке)', {p1: f1.p, p2: f2.p, a: mid.f, b: mid2});
    const calm = await at(p, PL(2, 0)); const turning = await p.evaluate(() => document.querySelectorAll('#mag .leaf.is-turning').length);
    t(Math.abs(calm.p - 3) < .02 && turning === 0, 'листание: на развороте страница стоит неподвижно и читается (нет листов в движении)', {p: calm.p, turning});
    const back = await at(p, PL(0, .375)); t(back.p < calm.p && back.p > 1 && back.p < 2, 'листание: обратная прокрутка переворачивает лист обратно', back); }
  { await at(p, .5); const mid = await p.evaluate(() => ({st: document.querySelector('.mag-st').textContent, vis: [...document.querySelectorAll('#mag .face:not([aria-hidden="true"]) h3')].length}));
    t(/Страницы \d+–\d+/.test(mid.st) && mid.vis >= 1, 'читалка: на экране два настоящих листа журнала (заголовки видны, остальные скрыты от скринридера)', mid);
    const before = (await rs(p)).s; await p.click('#mag .mag-nx'); await settle(p); const nx = await rs(p);
    t(nx.s === before + 1 && Math.abs(nx.p - nx.s) < .02, '«Далее» прокручивает сцену к следующему развороту (лист переворачивается плавно)', {before, nx});
    await p.click('#mag .mag-pv'); await settle(p); const pv = await rs(p); t(pv.s === before, '«Назад» возвращает к предыдущему развороту', {before, pv});
    await p.focus('#mag .mag-book'); await p.keyboard.press('ArrowRight'); await settle(p); t((await rs(p)).s === before + 1, 'стрелка → листает вперёд (когда журнал в фокусе)');
    await p.keyboard.press('ArrowLeft'); await settle(p); t((await rs(p)).s === before, 'стрелка ← листает назад');
    await p.keyboard.press('End'); await settle(p); t((await rs(p)).s === ROOMS.length + 2 && await p.evaluate(() => document.querySelector('.mag-nx').disabled), 'End: последний разворот, «Далее» отключена');
    await p.keyboard.press('Home'); await settle(p); t((await rs(p)).s === 1 && await p.evaluate(() => document.querySelector('.mag-pv').disabled), 'Home: первый разворот, «Назад» отключена');
    await at(p, .5); await p.click('#house-reader .hr-skip'); await p.waitForTimeout(1000);
    t(await p.evaluate(() => { const e = document.getElementById('house-end').getBoundingClientRect(); return e.top < innerHeight + 4; }), '«К контактам» из читалки приводит к концу страницы (подвал)');
    const tocN = await p.evaluate(() => document.querySelectorAll('.mg-toc button').length); t(tocN === ROOMS.length + 1, 'оглавление: строка на каждую комнату и контакты', tocN); }
  { /* с главного экрана журнал не открывается кликом (решение заказчика): подсказка «Листайте ниже…» — просто текст, зоны клика по журналу на столике нет; к журналу — только прокруткой */
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
    t(await p.evaluate(() => !document.querySelector('.mag-prev, .mag-hint, .hall-mag, .hs-book, #arch-story [data-house-mag]')), 'на главном экране нет кнопок и зон клика по журналу (ни «Откройте журнал», ни зоны на столике, ни кнопки в подсказке)');
    const cue = await p.evaluate(() => { const c = document.querySelector('#arch-story .hs-cue'), r = c.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return {tag: c.tagName, pe: getComputedStyle(c).pointerEvents, tab: c.tabIndex, text: /Листайте ниже/.test(c.textContent), hit: !!(e && e.closest('.hs-cue')), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2)}; });
    t(cue.tag !== 'BUTTON' && cue.tag !== 'A' && cue.pe === 'none' && cue.tab < 0 && cue.text && !cue.hit, 'подсказка «Листайте ниже — откроется журнал» — только текст: не кнопка, не берёт клики и фокус', cue);
    const yc0 = await p.evaluate(() => scrollY); await p.mouse.click(cue.cx, cue.cy); await p.waitForTimeout(700); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    t(Math.abs((await p.evaluate(() => scrollY)) - yc0) < 3, 'клик по подсказке и Enter страницу не двигают: к журналу ведёт только прокрутка', {yc0}); }

  /* ---- единая сцена: герой и журнал без стыка; автоход к журналу; листание кнопками анимируется; шар стоит при прокрутке ---- */
  { await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
    const g = await p.evaluate(() => { const r = document.getElementById('house-reader'), s = document.getElementById('arch-story'); return {rt: Math.round(r.getBoundingClientRect().top), mt: getComputedStyle(r).marginTop, live: r.classList.contains('is-live'), vis: getComputedStyle(r.querySelector('.hr-stage')).visibility, cue: (document.querySelector('.hs-cue') || {}).textContent, panel: !!document.querySelector('.ar-panel'), between: [...s.parentElement.children].indexOf(r) - [...s.parentElement.children].indexOf(s)}; });
    t(Math.abs(g.rt) <= 2 && !g.live && g.vis === 'hidden', 'герой и журнал — одна сцена: читалка начинается ровно там, где герой заканчивает закрепление, пока герой стоит — её сцена скрыта', g);
    { const bk = await p.evaluate(() => { const r = document.getElementById('house-reader'), a = document.querySelector('#arch-story .js-stage'); return {fly: [...r.querySelectorAll('.hr-fly canvas')].map(c => getComputedStyle(c).visibility), mag: getComputedStyle(r.querySelector('.mag')).visibility, rd: getComputedStyle(r).backgroundColor, hero: getComputedStyle(a).backgroundColor, want: getComputedStyle(document.body).getPropertyValue('--hs-backdrop').trim()}; });
      t(bk.fly.length >= 1 && bk.fly.every(v => v === 'hidden') && bk.mag === 'hidden', 'ПК: пока герой стоит, холсты пролёта и живой журнал скрыты (лишний слой 1920×1080 под героем — нагрузка на каждый кадр прокрутки; видимыми заранее они остаются только на телефоне)', bk);
      t(bk.rd === 'rgb(192, 181, 162)' && bk.hero === 'rgb(245, 242, 236)' && bk.want === '#c0b5a2', 'подложка цвета зала (#c0b5a2) — под читалкой и её сценой (страховка от светлого провала); подложка героя прежняя, молочная: вход и фон анимации не менялись', bk); }
    t(/Листайте ниже/.test(g.cue || '') && !g.panel, 'вместо панели «Почему выбирают Астрею?» внизу — подсказка «Листайте ниже — откроется журнал»', g);
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); const o = await rs(p);          // к журналу — прокруткой: тот же плавный ход (его запускает API, как и прокрутка колесом в разделе 3)
    t(o.s === 1 && o.t > .25 && o.t < .4, 'ход к журналу: камера пролетает к раскрытому журналу (первый разворот)', o);
    const lv = await p.evaluate(() => ({live: document.getElementById('house-reader').classList.contains('is-live'), story: document.getElementById('arch-story').classList.contains('rd-live'), hero: +getComputedStyle(document.querySelector('#arch-story .ar-copy')).opacity, jar: getComputedStyle(document.querySelector('#arch-story .ar-jar-cv')).visibility}));
    t(lv.live && lv.story && lv.hero < .05, 'после стыка читалка «живая», кадр и текст героя погасли (спрайт баночки не гаснет сам — он убирается, когда кадр героя ушёл)', lv);
    const b0 = (await rs(p)).p; await p.evaluate(() => { window.__pr = []; const f = () => { window.__pr.push(window.Astreya.house.readerState().p); if (window.__pr.length < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await p.click('#mag .mag-nx'); await settle(p); const b1 = (await rs(p)).p, pr = await p.evaluate(() => window.__pr), part = pr.filter(v => v > b0 + .05 && v < b1 - .05);
    t(part.length >= 2 && Math.abs(b1 - b0 - 1) < .02, '«Далее» листает плавно: лист поворачивается на виду (через промежуточные положения), а не перескакивает', {b0, b1, frames: part.length});
    await p.click('#mag .mag-nx'); await p.waitForTimeout(150); await p.click('#mag .mag-nx'); await settle(p); const b2 = (await rs(p)).p;
    t(Math.abs(b2 - b1 - 2) < .02, 'два быстрых нажатия «Далее» подряд листают на два разворота', {b1, b2});
    await p.click('#mag .mag-pv'); await settle(p); await p.click('#mag .mag-pv'); await settle(p);
    /* колесо: один жест — один разворот, тем же ходом, что кнопка «Далее» (не быстрее и не медленнее); пока лист идёт, колесо не мешает; назад лист не уходит */
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); await p.mouse.move(700, 450);
    const w0 = await rs(p);
    const sampler = p.evaluate(() => new Promise(res => { const a = []; const t0 = performance.now(); const f = () => { a.push([Math.round(performance.now() - t0), +window.Astreya.house.readerState().p.toFixed(3)]); if (performance.now() - t0 < 2600) setTimeout(f, 25); else res(a); }; f(); }));
    await p.mouse.wheel(0, 100); await p.waitForTimeout(60); await p.mouse.wheel(0, 100); await p.waitForTimeout(300); await p.mouse.wheel(0, 100);          // жест из щелчков + ещё щелчок посреди хода листа
    const trace = await sampler; await settle(p); const w1 = await rs(p);
    const back = trace.some((v, i) => i && v[1] < trace[i - 1][1] - .004), tEnd = (trace.find(v => v[1] >= w0.p + .98) || [0])[0];
    t(w0.s === 1 && w1.s === 2 && Math.abs(w1.p - 2) < .02, 'колесо: жест листает ровно один разворот (лишние щелчки посреди хода листа гасятся)', {w0: w0.s, w1: w1.s, p: w1.p});
    t(!back, 'колесо: лист идёт только вперёд — назад не уходит ни на кадр', trace.slice(0, 20));
    t(tEnd > 700 && tEnd < 2300, 'колесо: ход листа такой же, как у кнопки «Далее» (≈ 1,2–2 с), не быстрее и не медленнее', {ms: tEnd});
    await p.evaluate(() => window.Astreya.house.openMagazine(2)); await settle(p); await p.click('#mag .mag-nx'); const bt0 = Date.now(); await settle(p); const btnMs = Date.now() - bt0;
    await p.evaluate(() => window.Astreya.house.openMagazine(2)); await settle(p); await p.mouse.wheel(0, 100); const wt0 = Date.now(); await settle(p); const wheelMs = Date.now() - wt0;
    t(Math.abs(wheelMs - btnMs) < 450, 'колесо: время перелистывания равно времени кнопки «Далее»', {wheelMs, btnMs});
    await p.waitForTimeout(300); await p.mouse.wheel(0, -100); await settle(p); const w3 = await rs(p);
    t(w3.s === 2, 'колесо вверх листает назад на один разворот', {s: w3.s});
    { /* непрерывный поток колеса (быстрые щелчки подряд, пауз ≥ 130 мс нет) — один жест: листает один разворот, а не «пролетает» журнал */
      await p.evaluate(() => window.Astreya.house.openMagazine(2)); await settle(p); const f0 = await rs(p);
      await p.evaluate(() => new Promise(res => { let i = 0; const f = () => { document.body.dispatchEvent(new WheelEvent('wheel', {deltaY: 100, bubbles: true, cancelable: true})); if (++i < 16) setTimeout(f, 90); else res(); }; f(); }));
      await settle(p); const f1 = await rs(p);
      t(f1.s === f0.s + 1, 'непрерывный поток колеса — один жест: листнулся один разворот (журнал не пролетает)', {from: f0.s, to: f1.s}); }
    { /* «вниз», а сразу следом «вверх» (хвост инерции трекпада, второй щелчок): обратный жест не гасится как продолжение прежнего — лист возвращается на разворот, откуда ушёл (раньше крутишь вверх, а журнал не отвечает) */
      await p.evaluate(() => window.Astreya.house.openMagazine(3)); await settle(p); const r0 = await rs(p);
      await p.evaluate(() => new Promise(res => { const w = d => document.body.dispatchEvent(new WheelEvent('wheel', {deltaY: d, bubbles: true, cancelable: true})); w(100); setTimeout(() => { w(-100); res(); }, 220); }));
      await settle(p); const r1 = await rs(p);
      t(r1.s === r0.s, 'колесо вниз и через 0,2 с вверх: журнал отвечает на обратный жест (возвращается на прежний разворот)', {from: r0.s, to: r1.s}); }
    { /* прокрутку остановили посередине поворота листа — лист сам доворачивается до ближайшего разворота */
      await p.evaluate(() => { window.__HOUSE_SNAP = true; window.Astreya.house.openMagazine(2); }); await settle(p);
      const bx = await p.evaluate(() => { const r = document.getElementById('house-reader'); return {top: r.getBoundingClientRect().top + scrollY, tot: r.offsetHeight - innerHeight - (parseFloat(r.style.getPropertyValue('--hrx')) || 0) * innerHeight / 100}; });
      await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), bx.top + bx.tot * (.34 + .62 * 1.55 / (ROOMS.length + 1))); await p.waitForTimeout(100);
      const mid = await rs(p); await settle(p); await p.waitForTimeout(400); await settle(p); const fin = await rs(p);
      t(mid.p > 2.3 && mid.p < 2.8 && Math.abs(fin.p - Math.round(fin.p)) < .02, 'остановка посередине поворота: лист доворачивается до ближайшего разворота сам', {mid: mid.p, fin: fin.p}); await p.evaluate(() => { window.__HOUSE_SNAP = false; }); }
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); const e0 = await rs(p);
    await p.mouse.wheel(0, -100); await p.waitForTimeout(900); const e1 = await rs(p);
    t(e0.s === 1 && e1.t < e0.t - .001, 'на первом развороте колесо вверх не перехвачено: страница идёт назад к пролёту камеры', {e0: e0.t, e1: e1.t});
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p);
    { /* «На главную»: кнопка (а не прокрутка) ведёт к экрану героя с заголовком (последний экран сцены героя) без перелистывания страниц назад; обычный жест вверх по-прежнему листает назад на один разворот */
      const hy = () => p.evaluate(() => { const a = document.getElementById('arch-story'); return Math.round(a.getBoundingClientRect().top + scrollY + a.offsetHeight - innerHeight); });
      const home = async () => { await p.waitForFunction(h => Math.abs(scrollY - h) < 4 && !window.Astreya.house.busy(), await hy(), {timeout: 14000}).catch(() => {}); return p.evaluate(() => scrollY); };
      await p.evaluate(() => window.Astreya.house.openMagazine(5)); await settle(p);
      const hb = await p.evaluate(() => { const b = document.querySelector('#mag .mag-hm'); return b ? {txt: b.textContent.trim(), y: scrollY} : null; });
      t(!!hb && /На главную/.test(hb.txt) && hb.y > 1500, 'в журнале есть кнопка «На главную»', hb);
      const pTrace = p.evaluate(() => new Promise(res => { const a = []; const t0 = performance.now(); const f = () => { a.push(+window.Astreya.house.readerState().p.toFixed(2)); if (performance.now() - t0 < 4200) setTimeout(f, 40); else res(a); }; f(); }));
      const y0H = await p.evaluate(() => scrollY); const yTrP = p.evaluate(() => new Promise(res => { const a = []; const t0 = performance.now(); const f = () => { a.push(Math.round(scrollY)); if (performance.now() - t0 < 800) setTimeout(f, 80); else res(a); }; setTimeout(f, 0); }));
      const tH0 = Date.now(); await p.click('#mag .mag-hm'); const yTr = await yTrP; const y1 = await home(), H1 = await hy(); const tHome = Date.now() - tH0; const tr = await pTrace;
      t(tHome > 2700 && tHome < 8000, 'возврат «На главную» — 3 секунды (на медленном программном рендере кадр длится дольше, потому верхняя граница шире)', tHome);
      { const cv = await p.evaluate(() => { const e = window.Astreya.house.homeEase, ms = window.Astreya.house.homeMs, a = []; for (let i = 0; i <= 200; i++) a.push(e(i / 200)); return {ms, a}; });
        const mono = cv.a.every((v, i) => i === 0 || v >= cv.a[i - 1] - 1e-9), at = x => cv.a[Math.round(x * 200)];
        t(cv.ms === 3000 && cv.a[0] === 0 && Math.abs(cv.a[200] - 1) < 1e-9 && mono, 'кривая «На главную»: ровно 3000 мс, от 0 до 1, без возвратов', {ms: cv.ms});
        t(at(.33) > .4 && at(.1) < .08, 'выход из журнала быстрый, без долгого раскачивания: за треть времени пройдено больше 40 % пути, а первые 10 % времени — меньше 8 % (мягкий, но не вязкий старт)', {a33: at(.33), a10: at(.1)});
        t(1 - at(.7) < .04 && at(.9) > .998 && cv.a[200] - cv.a[196] < .0015, 'посадка на главную плавная: к 70 % времени пройдено больше 96 % пути, дальше — длинная мягкая остановка без рывка на конце', {a70: at(.7), a90: at(.9), tail: cv.a[200] - cv.a[196]}); }
      t(yTr.length >= 3 && yTr.every((v, i) => i === 0 || v <= yTr[i - 1] + 1), 'возврат «На главную»: прокрутка идёт только вверх, без рывков назад', {y0H, tr: yTr});
      { const sp0 = await p.evaluate(() => window.Astreya.jar.arch.state().sphere); await p.waitForTimeout(1400); const sp1 = await p.evaluate(() => window.Astreya.jar.arch.state().sphere);
        t(!sp1.running && Math.abs(sp1.yaw - sp0.yaw) < .002, 'после возврата из журнала шар на экране героя стоит и не крутится', {a: sp0.yaw, b: sp1.yaw, run: sp1.running}); }
      t(Math.abs(y1 - H1) < 4, 'кнопка «На главную» плавно ведёт к экрану героя с заголовком (последний экран сцены героя), а не на самый верх', {y: y1, hy: H1});
      t(tr.slice(0, 20).every(v => Math.abs(v - 5) < .02) && !tr.some(v => v > 1.3 && v < 4.7), 'переход на главную: журнал остаётся на развороте, где остановился читатель (не листается назад и не перекидывает на первый)', tr.filter((_, i) => i % 6 === 0));
      await p.evaluate(() => window.Astreya.house.openMagazine(5)); await settle(p); const s5 = await rs(p);
      await p.evaluate(() => new Promise(res => { let i = 0; const f = () => { document.body.dispatchEvent(new WheelEvent('wheel', {deltaY: -200, bubbles: true, cancelable: true})); if (++i < 14) setTimeout(f, 50); else res(); }; f(); }));
      await settle(p); await p.waitForTimeout(400); const y2 = await p.evaluate(() => scrollY), H2 = await hy(), s5b = await rs(p);
      t(s5.s === 5 && y2 > H2 + 800 && s5b.s >= 3, 'быстрая серия прокруток вверх (14 щелчков за 0,7 с) не возвращает на главную: журнал просто листается назад, на главную ведёт только кнопка', {from: s5.s, to: s5b.s, y: y2, hy: H2});
      await p.evaluate(() => window.Astreya.house.openMagazine(5)); await settle(p); const s6 = await rs(p); await p.mouse.move(700, 450); await p.mouse.wheel(0, -100); await settle(p); const s7 = await rs(p);
      t(s6.s === 5 && s7.s === 4, 'обычный жест вверх по-прежнему листает назад на один разворот (на главную не уносит)', {from: s6.s, to: s7.s}); }
    { /* ПК: страница по нажатию и протяжкой мыши не листается (раньше клик по внешним 60 % страницы запускал поворот листа — «складывание внутрь») */
      await p.evaluate(() => window.Astreya.house.openMagazine(5)); await settle(p); await p.waitForTimeout(500);
      const bb = await p.evaluate(() => { const r = document.querySelector('#mag .mag-book').getBoundingClientRect(); return {l: r.left, t: r.top, w: r.width, h: r.height}; });
      const s0 = (await rs(p)).s; const yy = bb.t + bb.h * .035;
      const c1 = (await rs(p)).s;                                      // левая страница с 2026-11 — «вход в раздел» (нажатие ведёт на раздел сайта, проверка ниже), поэтому листание проверяем по правому краю
      await p.mouse.click(bb.l + bb.w * .88, yy); await p.waitForTimeout(1300); const c2 = (await rs(p)).s;
      t(s0 === 5 && c1 === 5 && c2 === 5 && !(await p.evaluate(() => document.querySelector('#mag .mag-book').hasAttribute('data-hover'))), 'клик по странице (у правого края) её не листает и курсор-«рука» у краёв не включается', {s0, c1, c2});
      await p.mouse.move(bb.l + bb.w * .82, yy); await p.mouse.down(); await p.mouse.move(bb.l + bb.w * .82 - 170, yy + 3, {steps: 6}); await p.mouse.up(); await p.waitForTimeout(1300);
      const d1 = (await rs(p)).s; t(d1 === 5, 'протяжка мышью (по полю и по тексту) страницу не листает: мышью листают кнопки, колесо и клавиши', {d1});
      await p.mouse.click(bb.l + bb.w * .93, bb.t + bb.h * .035); await p.waitForTimeout(1300); await p.mouse.click(bb.l + bb.w * .8, bb.t + bb.h * .035); await p.waitForTimeout(1300);
      const d2 = (await rs(p)).s; t(d2 === 5, 'клик по телу правой страницы (текст, чат, карточки) разворот не листает (левая страница — вход в раздел, проверка выше)', {d2}); }
    { /* выход с последних страниц (ПК): после последнего разворота сцена не обрывается кромкой, а ≈ 70 vh растворяется в фон страницы и только потом уезжает; путь читалки (доли RD) от этого не меняется */
      await p.evaluate(() => window.Astreya.house.openMagazine(20)); await settle(p); await p.waitForTimeout(500);
      const gx = await p.evaluate(() => { const r = document.getElementById('house-reader'), st = r.querySelector('.hr-stage'), top = Math.round(r.getBoundingClientRect().top + scrollY); return {top, h: r.offsetHeight, st: st.offsetHeight, vh: innerHeight, hrx: r.style.getPropertyValue('--hrx')}; });
      const ext = Math.round(gx.vh * .7), pathEnd = gx.top + gx.h - gx.st - ext, pinEnd = gx.top + gx.h - gx.st;
      const xo = async y => { await p.evaluate(v => window.scrollTo({top: v, behavior: 'instant'}), y); await p.waitForTimeout(260); return p.evaluate(() => { const r = document.getElementById('house-reader'), x = r.querySelector('.hr-exit'), w = document.querySelector('#mag .mag-wrap'); return {o: x ? +x.style.opacity || 0 : -1, cls: r.classList.contains('rd-exit'), pe: getComputedStyle(w).pointerEvents, t: +window.Astreya.house.readerState().t.toFixed(3)}; }); };
      const a0 = await xo(pathEnd - 160), a1 = await xo(pathEnd), a2 = await xo(pathEnd + Math.round(ext * .5)), a3 = await xo(pinEnd);
      t(gx.hrx === '70vh' && Math.abs(gx.h - (5040 / 900 * gx.vh + ext)) < 3, 'выход (ПК): высота читалки больше прежней ровно на 70 vh', gx);
      t(a0.o === 0 && !a0.cls && a0.pe !== 'none' && a1.o === 0 && a1.t >= .999, 'выход (ПК): пока идут страницы и сразу за последним разворотом сцена не затемняется и кнопки работают', {a0, a1});
      t(a2.o > .35 && a2.o < .65 && a3.o >= .99 && a3.cls && a3.pe === 'none', 'выход (ПК): посередине участка сцена наполовину растворена, к концу — полностью (под ней кнопки не нажимаются), и только потом уезжает', {a2, a3});
      const seq = []; for (let k = 0; k <= 8; k++) seq.push((await xo(pathEnd + Math.round(ext * k / 8))).o);
      t(seq.every((v, i) => i === 0 || v >= seq[i - 1]) && seq.every((v, i) => i === 0 || v - seq[i - 1] < .3), 'выход (ПК): растворение идёт ровно — без скачков и возвратов', seq); }
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p);
    { /* журнал в сцене: верхней панели нет — ни на развороте, ни после прокрутки вверх (листаем назад), ни при прокрутке вниз */
      const hb = () => p.evaluate(() => document.getElementById('hdr').getBoundingClientRect().bottom);
      await p.evaluate(() => window.Astreya.house.openMagazine(5)); await settle(p); await p.waitForTimeout(800); const h1 = await hb();
      await p.mouse.move(700, 450); await p.mouse.wheel(0, -100); await settle(p); await p.waitForTimeout(800); const h2 = await hb();
      await p.mouse.wheel(0, 100); await settle(p); await p.waitForTimeout(800); const h3 = await hb();
      t(h1 <= 1 && h2 <= 1 && h3 <= 1, 'в просмотре журнала верхней панели нет: ни на развороте, ни при прокрутке вверх, ни вниз', {h1, h2, h3}); }
    { /* вход на разворот со Стеллой: переписка проигрывается по очереди и заканчивается полной перепиской; слои анимации после неё не остаются */
      await p.evaluate(() => window.Astreya.house.openMagazine(6)); await settle(p); await p.waitForTimeout(800);
      const early = await p.evaluate(() => ({hid: document.querySelectorAll('.mp-chat-log .mp-hid').length}));
      await p.waitForTimeout(7000);
      const late = await p.evaluate(() => ({hid: document.querySelectorAll('.mp-chat-log .mp-hid').length, n: document.querySelectorAll('.mp-chat-log .mp-m').length, busy: document.querySelector('.mp-chat-in').classList.contains('is-busy'), anim: document.getAnimations().filter(a => /^mpPop$/.test(a.animationName || '')).length}));
      t(early.hid > 0 && late.hid === 0 && late.n === 4 && !late.busy && late.anim === 0, 'Стелла: при входе на разворот переписка проигрывается (реплики по очереди) и завершается полной перепиской; анимации не остаются', {early, late}); }
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p);
    /* возврат из читалки к герою: вступительные анимации заставки (arBg — «наезд» фона с 1,05, arJar — проявление баночки) не перезапускаются */
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(250);
    const rt = await p.evaluate(() => ({an: document.getAnimations().filter(a => /^(arBg|arJar)$/.test(a.animationName || '')).length, jo: getComputedStyle(document.querySelector('#arch-story .ar-jar-cv')).opacity, live: document.getElementById('arch-story').classList.contains('rd-live')}));
    t(rt.an === 0 && +rt.jo === 1 && !rt.live, 'возврат из читалки к герою не перезапускает вступительные анимации: фон не «наезжает» с 1,05, баночка не проявляется заново (раньше она пропадала и возвращалась)', rt);
  }

  { /* шар: во время прокрутки не двигается совсем; когда прокрутка стоит — вращается сам; на курсор не реагирует (по решению заказчика) */
    await p.evaluate(() => window.Astreya.house.hall()); await p.evaluate(() => window.scrollBy({top: -8, behavior: 'instant'})); await p.waitForTimeout(2500);
    const sp = () => p.evaluate(() => { const s = window.Astreya.jar.arch.state().sphere; return {yaw: s.yaw, ready: s.ready, run: s.running, cur: s.cur}; });
    const a = await sp();
    if (!a.ready) t(true, 'шар: текстуры ещё не загрузились (проверка пропущена)');
    else {
      const seq = []; for (let i = 0; i < 5; i++) { await p.evaluate(() => window.scrollBy({top: -25, behavior: 'instant'})); await p.waitForTimeout(50); seq.push((await sp()).yaw); }
      t(Math.max(...seq) - Math.min(...seq) < .004, 'во время прокрутки шар не двигается (угол не меняется)', seq);
      await p.waitForTimeout(1500); const b = await sp(); t(!b.run && Math.abs(b.yaw - seq[4]) < .004, 'прокрутку остановили посередине скролл-анимации — шар по-прежнему стоит (вращается только в статике, на экране героя с текстом)', {a: seq[4], b: b.yaw, run: b.run});
      await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(400); const c0 = (await sp()).yaw;
      await p.waitForFunction(y => window.Astreya.jar.arch.state().sphere.yaw > y + .01, c0, {timeout: 25000}).catch(() => {}); const d = await sp(); t(d.run && d.yaw > c0 + .01, 'на экране героя с текстом (статика) шар вращается сам', {c0, d: d.yaw});
      await p.mouse.move(1060, 300); await p.mouse.move(1200, 330, {steps: 6}); await p.mouse.down(); await p.mouse.move(900, 330, {steps: 8}); await p.mouse.up(); await p.waitForTimeout(300);
      const c = await sp(); t(c.cur[0] === 0 && c.cur[1] === 0 && !(await p.evaluate(() => /sph-/.test(document.getElementById('arch-story').className))), 'курсор не вращает шар и не сдвигает свет: ни наведение, ни протяжка мышью не меняют шар (только собственное вращение)', c);
      await p.mouse.move(20, 20);
    } }

  /* ================= 4. переходы к комнатам: те же адреса #room-… ================= */
  for (const id of ROOMS) {
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500);
    await p.evaluate(i => document.querySelector(`.hall-rooms a[data-house-go="${i}"]`).click(), id); await settle(p);
    const a = await rs(p), hash = await p.evaluate(() => location.hash), want = ROOMS.indexOf(id) + 2;
    t(a.s === want && hash === '#room-' + id && Math.abs(a.p - want) < .02, `список зала «${id}»: журнал стоит на развороте комнаты (${want}), адрес #room-${id}`, {s: a.s, want, hash});
  }
  { const sE = ROOMS.indexOf('expertise') + 2, sA = ROOMS.indexOf('academy') + 2;
    await p.evaluate(() => window.Astreya.house.go('expertise')); await settle(p); t((await rs(p)).s === sE, 'API go(expertise): разворот комнаты «Экспертиза»');
    await at(p, .4); await p.evaluate(v => document.querySelector(`#mag .mg-toc button[data-mag-page="${v}"]`).click(), sA); await settle(p);
    const s = await rs(p); t(s.s === sA, 'строка оглавления «Учебный центр» открывает разворот этой комнаты', s);
    const pageOk = await p.evaluate(v => { const sh = document.querySelector('.mag-book').dataset.s; return +sh === v; }, sA); t(pageOk, 'оглавление ведёт на тот же разворот, что и список зала'); }
  t(await p.evaluate(() => getComputedStyle(document.documentElement).overflowY !== 'hidden' && getComputedStyle(document.body).overflowY !== 'hidden'), 'страница прокручивается: scroll-lock нет');
  for (const [hash, room] of [['solutions', 'finder'], ['training-block', 'academy'], ['brands-gallery', 'brands'], ['how-to-start', 'partners'], ['room-brands', 'brands']]) {
    const q = await open(1440, 900, {url: page + '#' + hash}); await q.waitForTimeout(2600);
    const s = await rs(q); t(s.s === ROOMS.indexOf(room) + 2, `прежний адрес #${hash} открывает журнал на развороте комнаты ${room}`, s); await q._ctx.close();
  }
  { const q = await open(1440, 900, {url: page + '#magazine/3'}); await q.waitForTimeout(2600); t((await rs(q)).s === 3, 'адрес #magazine/3 открывает журнал на третьем развороте', await rs(q)); await q._ctx.close(); }
  { const q = await open(1440, 900, {url: page + '#hall'}); await q.waitForTimeout(2400); t(await q.evaluate(() => scrollY) > 300 && (await rs(q)).t < .03, 'адрес #hall приводит в зал (читалка ещё не начата)', await rs(q)); await q._ctx.close(); }
  t(p._errs.length === 0, 'нет ошибок JS на ПК', p._errs.slice(0, 5));
  t(p._fails.length === 0, 'нет неудачных запросов на ПК', p._fails.slice(0, 6));
  for (const w of [1440, 1100, 820]) { await p.setViewportSize({width: w, height: 900}); await p.waitForTimeout(500); t(await noOverflow(p), `нет горизонтальной прокрутки (${w})`); }
  await p._ctx.close();

  /* ================= 5. телефон ================= */
  p = await open(390, 844, {touch: true});
  t(await noOverflow(p), 'телефон: нет горизонтальной прокрутки в зале');
  t(await p.evaluate(n => getComputedStyle(document.querySelector('.hall-rooms')).display === 'none' && document.querySelectorAll('.hall-rooms a').length === n, ROOMS.length), 'телефон: пилюль разделов под заголовком героя нет (убраны по просьбе заказчика), ссылки остаются в разметке; в запасных режимах лента показана (проверка ниже)');
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
  { /* телефон: тот же пролёт камеры и листание от прокрутки, что на ПК; в окне одна страница — книга-разворот сдвигается к левой/правой странице (--bx) */
    const st = () => p.evaluate(() => { const r = window.Astreya.house.readerState(), bk = document.querySelector('#mag .mag-book'), pr = document.querySelector('#mag .leaf.is-prev .face.back'), cu = document.querySelector('#mag .leaf.is-cur .face.front'), vis = e => { if (!e) return null; const b = e.getBoundingClientRect(), l = Math.max(0, b.left), rr = Math.min(innerWidth, b.right); return Math.round(Math.max(0, rr - l)); };
      return {pm: r.pm, stop: r.stop, s: r.s, q: +r.q.toFixed(2), bx: parseFloat(bk.style.getPropertyValue('--bx')), label: document.querySelector('#mag .mag-st').textContent, leftVis: vis(pr), rightVis: vis(cu), fly: r.fly.on, drawn: r.fly.drawn, ow: document.documentElement.scrollWidth}; });
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); await p.waitForTimeout(600);
    const m1 = await st();
    t(m1.pm && m1.fly && m1.stop === 1 && m1.s === 1 && m1.bx > .45 && m1.leftVis >= 330 && m1.ow <= 390 && new RegExp('Страница 2 из ' + (ROOMS.length * 2 + 5)).test(m1.label), 'телефон: после пролёта камеры журнал открыт на странице 2 — левая страница разворота целиком в окне, книга сдвинута к ней', m1);
    t(m1.drawn, 'телефон: пролёт камеры нарисован движком (портретные ключи, глубина, дорожка)', m1);
    await p.click('#mag .mag-nx'); await settle(p); await p.waitForTimeout(500);
    const m2 = await st();
    t(m2.stop === 2 && m2.s === 1 && m2.bx < -.45 && m2.rightVis >= 330 && new RegExp('Страница 3 из ' + (ROOMS.length * 2 + 5)).test(m2.label), 'телефон: «Далее» ведёт к правой странице того же разворота (книга едет влево, лист не поворачивается)', m2);
    await p.click('#mag .mag-nx'); await settle(p); await p.waitForTimeout(500);
    const m3 = await st();
    t(m3.stop === 3 && m3.s === 2 && m3.bx > .45 && m3.leftVis >= 330 && new RegExp('Страница 4 из ' + (ROOMS.length * 2 + 5)).test(m3.label), 'телефон: следующая «Далее» переворачивает лист и показывает левую страницу следующего разворота', m3);
    await p.click('#mag .mag-pv'); await settle(p); await p.waitForTimeout(500);
    t((await st()).stop === 2, 'телефон: «Назад» возвращает на страницу назад');
    /* страницы на телефоне прокруткой не листаются (просьба заказчика): прокрутка за пролётом страницу не меняет, листают свайп, «Далее/Назад», оглавление */
    const o2 = await box(p); const stBefore = (await st()).stop;
    const keep = [];
    for (const f of [.84, .92, .98]) { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o2.top + o2.tot * f); await p.waitForTimeout(700); const q2 = await st(); keep.push([q2.stop, q2.q, await p.evaluate(() => document.querySelectorAll('#mag .leaf.is-turning').length)]); }
    t(keep.every(k => k[0] === stBefore && k[1] === stBefore && k[2] === 0), 'телефон: прокрутка вниз за пролётом (у раскрытого журнала) страницы не листает', {stBefore, keep});
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o2.top + o2.tot * .84); await p.waitForTimeout(700);
    await p.evaluate(() => window.Astreya.house.openMagazine(2)); await p.waitForTimeout(260);          // «Далее» с поворотом листа: посередине хода лист в движении, книга едет вслед за ним
    const m4 = await p.evaluate(() => ({turning: document.querySelectorAll('#mag .leaf.is-turning').length, q: +window.Astreya.house.readerState().q.toFixed(2)}));
    await settle(p); const m5 = await st();
    t(m4.turning <= 1 && m5.stop === 3 && Number.isInteger(m5.q), 'телефон: оглавление / кнопка ведут к странице плавной анимацией и встают ровно на ней', {m4, m5});
  }
  for (const id of ['brands', 'finder', 'partners', 'editorial']) {
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500);
    await p.evaluate(i => document.querySelector(`.hall-rooms a[data-house-go="${i}"]`).click(), id); await settle(p);
    t((await rs(p)).s === ROOMS.indexOf(id) + 2 && await noOverflow(p), `телефон: раздел ${id} открывает нужный разворот журнала, нет горизонтальной прокрутки`);
  }
  { /* телефон (видео заказчика на iPhone): сцена журнала такой же высоты, как сцена героя (lvh: иначе при видимой панели браузера снизу оставалась полоса фона — «шторка»); дальние листы не рисуются (память: iOS убивала вкладку на 5-й странице) */
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500);
    const g = await p.evaluate(() => { let h = ''; for (const ss of document.styleSheets) { let rules; try { rules = ss.cssRules; } catch (e) { continue; } for (const r of rules) if (r.selectorText === '.hr-stage') h = r.style.height; } const a = document.querySelector('.hr-stage'), b = document.querySelector('.js-stage'); return {h, a: a.offsetHeight, b: b.offsetHeight}; });
    t(g.h === '100lvh' && g.a === g.b, 'телефон: сцена журнала той же высоты (100lvh), что и сцена героя — без полосы фона снизу при видимой панели браузера', g);
    await p.evaluate(() => window.Astreya.house.openMagazine(9)); await settle(p); await p.waitForTimeout(500);
    const fr = await p.evaluate(() => { const L = [...document.querySelectorAll('#mag .leaf')], d = e => e ? getComputedStyle(e).display : '-'; return {n: L.length, shown: L.filter(l => d(l) !== 'none').length, cur: d(document.querySelector('#mag .leaf.is-cur')), prev: d(document.querySelector('#mag .leaf.is-prev')), first: d(L[0]), last: d(L[L.length - 1])}; });
    t(fr.shown <= 5 && fr.cur !== 'none' && fr.prev !== 'none' && fr.first === 'none' && fr.last !== 'none', 'телефон: на 9-м развороте рисуются не больше пяти листов (читаемые и соседние), дальние выключены — память и слои', fr);
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); await p.waitForTimeout(500);
    const fr2 = await p.evaluate(() => { const L = [...document.querySelectorAll('#mag .leaf')]; return {shown: L.filter(l => getComputedStyle(l).display !== 'none').length, last: getComputedStyle(L[L.length - 1]).display, cur: getComputedStyle(document.querySelector('#mag .leaf.is-cur')).display}; });
    t(fr2.shown <= 5 && fr2.last === 'none' && fr2.cur !== 'none', 'телефон: вернулись к началу — листы у конца журнала снова выключены, читаемый на месте', fr2);
    await p.evaluate(() => window.Astreya.house.go('stella')); await settle(p); await p.waitForTimeout(900);
    const ch = await p.evaluate(() => { const r = document.querySelector('#mag .mp-chat-chips'); return {sw: r.scrollWidth, cw: r.clientWidth, n: r.children.length}; });
    t(ch.cw > 0 && ch.sw <= ch.cw + 1 && ch.n >= 1, 'телефон: лист с чатом Стеллы был выключен, пока был далеко, — когда его снова рисуют, подсказки подогнаны по ширине (лишняя не торчит)', ch);
    /* переход героя → пролёт без двойного изображения (видео заказчика на iPhone): сцена героя стоит на месте весь путь затухания (хвост), холсты не двигаются из JS; холст баночки пролёта крошечный */
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
    const o3 = await box(p), tl = await p.evaluate(() => window.Astreya.heroTail());
    const vh3 = await p.evaluate(() => innerHeight);
    t(Math.abs(tl - vh3 * .5) <= 3 && Math.abs(tl - o3.tot * 50 / 380) <= 3, 'телефон: «хвост» сцены героя равен пути затухания героя (50 vh = 50/380 пути читалки)', {tail: tl, want: Math.round(vh3 * .5), tot: o3.tot});
    const pin = [];
    for (const f of [.04, .11, .17]) { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o3.top + o3.tot * f); await p.waitForTimeout(450); pin.push(await p.evaluate(() => ({st: Math.round(document.querySelector('#arch-story .js-stage').getBoundingClientRect().top), hy: parseFloat(document.getElementById('arch-story').style.getPropertyValue('--hy')) || 0, hf: parseFloat(document.getElementById('arch-story').style.getPropertyValue('--hf'))}))); }
    t(pin[0].st === 0 && pin[1].st === 0 && pin[0].hy === 0 && pin[1].hy === 0 && pin[0].hf > 0 && pin[1].hf > pin[0].hf && pin[2].st < -50, 'телефон: пока герой гаснет над пролётом, его сцена закреплена (смещения холстов нет), после затухания уезжает', pin);
    const jc = await p.evaluate(() => { const c = document.querySelector('.hr-fly .ar-jar-cv'); return {w: c.width, h: c.height}; });
    t(jc.w * jc.h <= 16, 'телефон: холст баночки пролёта крошечный (баночка запечена в кадры; раньше 6,2 млн пикселей собирались композитором каждый кадр)', jc);
    /* память: когда журнал открыт, герой и пролёт отдают видеопамять; вернулись к герою — герой снова разворачивается */
    const lowsBefore = await p.evaluate(() => window.Astreya.jar.arch.state().lows);
    await p.evaluate(() => window.Astreya.house.openMagazine(9)); await settle(p); await p.waitForTimeout(2500);
    const tm = await p.evaluate(() => { const h = window.Astreya.jar.arch.state(), f = window.Astreya.jar.fly.state(); return {h: [h.trimmed, h.resident, h.lows, h.residentJar, h.lowSprites], f: [f.trimmed, f.resident, f.lows]}; });
    t(tm.h[0] && tm.h[1] === 0 && tm.h[3] === 0 && tm.h[2] <= Math.min(lowsBefore, 24) && tm.h[4] <= 24 && (lowsBefore === 0 || tm.h[2] >= 1) && tm.f[0] && tm.f[1] <= 1 && tm.f[2] <= 3, 'телефон: на 9-м развороте герой выгрузил полные кадры и спрайты, оставил лишь крошечные копии (каждый 3-й кадр и три последних — на быстрый возврат к герою), пролёт оставил последний кадр и три копии', {lowsBefore, tm});
    await p.evaluate(() => window.Astreya.house.hall());
    const back = await p.waitForFunction(() => { const a = window.Astreya.jar.arch; return a.ready() && !a.state().trimmed && a.state().lows >= 50; }, null, {timeout: 40000}).then(() => true).catch(() => false);
    t(back, 'телефон: вернулись к герою — кадры героя снова развёрнуты, он готов рисовать');
    /* свайп страниц: влево — дальше, вправо — назад (вертикальная прокрутка остаётся прокруткой) */
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); await p.waitForTimeout(700);
    const swipe = dx => p.evaluate(d => { const el = document.querySelector('#mag .mag-book'), mk = (type, x) => { const tt = new Touch({identifier: 1, target: el, clientX: x, clientY: 420}); el.dispatchEvent(new TouchEvent(type, {bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [tt], changedTouches: [tt], targetTouches: type === 'touchend' ? [] : [tt]})); }; mk('touchstart', 220); mk('touchend', 220 + d); }, dx);
    const sw0 = (await rs(p)).stop; await swipe(-130); await settle(p); await p.waitForTimeout(500);
    const sw1 = (await rs(p)).stop; await swipe(130); await settle(p); await p.waitForTimeout(500);
    const sw2 = (await rs(p)).stop;
    t(sw1 === sw0 + 1 && sw2 === sw0, 'телефон: свайп влево листает на страницу вперёд, вправо — назад', {sw0, sw1, sw2});
    { /* «На главную» на телефоне — тот же ход в 3 секунды, что и на ПК */
      await p.evaluate(() => window.Astreya.house.openMagazine(5)); await settle(p);
      const ph = await p.evaluate(() => new Promise(res => { const t0 = performance.now(), y0 = scrollY; window.Astreya.house.home(); const f = () => { if (window.Astreya.house.busy()) requestAnimationFrame(f); else res({ms: Math.round(performance.now() - t0), y0, y1: scrollY}); }; requestAnimationFrame(f); }));
      t(ph.ms >= 2700 && ph.ms < 8000 && ph.y1 < ph.y0 - 500, 'телефон: «На главную» — тот же ход в 3 секунды, что и на ПК', ph);
    }
  }
  t(p._errs.length === 0, 'нет ошибок JS на телефоне', p._errs.slice(0, 5));
  await p._ctx.close();
  { /* защита от цикла падений: прошлая загрузка оборвалась на экране (в sessionStorage «идёт») → облегчённый режим: пролёт камеры не создаётся, журнал листается по страницам; обычная перезагрузка его не включает */
    const q = await open(390, 844, {touch: true});
    const n0 = await q.evaluate(() => ({lite: window.Astreya.lite, fly: !!(window.Astreya.jar && window.Astreya.jar.fly)}));
    await q.reload(); await q.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(900);
    const n1 = await q.evaluate(() => window.Astreya.lite);
    t(n0.lite === false && n0.fly && n1 === false, 'телефон: обычная загрузка и перезагрузка — полный режим (пролёт камеры есть)', {n0, n1});
    await q._ctx.addInitScript(() => { try { sessionStorage.setItem('astreya-boot', JSON.stringify({run: true, t: Date.now()})); } catch (e) { /* — */ } });
    await q.reload(); await q.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(1400);
    const l1 = await q.evaluate(() => ({lite: window.Astreya.lite, fly: !!(window.Astreya.jar && window.Astreya.jar.fly), saved: sessionStorage.getItem('astreya-lite')}));
    t(l1.lite === true && l1.fly && l1.saved === '1', 'телефон: после оборванной загрузки включается режим экономии памяти (окно кадров вместо всех ключей; пролёт остаётся), он держится всю сессию', l1);
    await q.evaluate(() => window.Astreya.house.hall()); await q.waitForTimeout(500);
    await q.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(q); await q.waitForTimeout(600);
    const l2 = await q.evaluate(() => { const r = window.Astreya.house.readerState(), b = document.querySelector('#mag .mag-book').getBoundingClientRect(); return {stop: r.stop, pm: r.pm, w: Math.round(b.width), ow: document.documentElement.scrollWidth}; });
    t(l2.pm && l2.stop === 1 && l2.w > 100 && l2.ow <= 390, 'телефон, облегчённый режим: журнал открывается на странице 2 и листается по страницам, без горизонтальной прокрутки', l2);
    await q.click('#mag .mag-nx'); await settle(q); await q.waitForTimeout(500);
    t((await q.evaluate(() => window.Astreya.house.readerState().stop)) === 2, 'телефон, облегчённый режим: «Далее» работает');
    t(q._errs.length === 0, 'нет ошибок JS в облегчённом режиме', q._errs.slice(0, 5));
    await q._ctx.close();
  }
  { /* второй обрыв подряд → режим без анимации (статичный зал и лента страниц, WebGL-движки не создаются): цикл падений вкладки невозможен; плашка «Страница перезапустилась» с отчётом; журнал вылетов; ?nogl=0 снимает */
    const q = await open(390, 844, {touch: true});
    await q._ctx.addInitScript(() => { try { sessionStorage.setItem('astreya-boot', JSON.stringify({run: true, t: Date.now()})); sessionStorage.setItem('astreya-bc', JSON.stringify([[0, 'boot', 'x'], [3.2, 'swipe', '-200,4 110ms div.leaf'], [4.1, 'ctxlost', 'fly']])); } catch (e) { /* — */ } });
    await q.reload(); await q.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(900);
    const c1 = await q.evaluate(() => ({lite: window.Astreya.lite, nogl: !!window.Astreya.nogl, n: window.Astreya.crashN, fly: !!(window.Astreya.jar && window.Astreya.jar.fly && window.Astreya.jar.fly.state().gl)}));
    t(c1.lite === true && !c1.nogl && c1.n === 1, 'после первого обрыва — облегчённый режим (пролёт остаётся), без отключения анимации', c1);
    await q.reload(); await q.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(2600);
    const c2 = await q.evaluate(() => ({nogl: !!window.Astreya.nogl, n: window.Astreya.crashN, off: document.getElementById('arch-story').classList.contains('jar-off'), dm: document.querySelector('.house-reader').hasAttribute('data-m'), fly: !!(window.Astreya.jar && window.Astreya.jar.fly && window.Astreya.jar.fly.state && window.Astreya.jar.fly.state().gl), hero: !!(window.Astreya.jar && window.Astreya.jar.arch && window.Astreya.jar.arch.state && window.Astreya.jar.arch.state().gl),
      toast: !![...document.querySelectorAll('div[role=status]')].find(e => /перезапустилась/.test(e.textContent)), log: (JSON.parse(localStorage.getItem('astreya:crashlog') || '[]')).length, ow: document.documentElement.scrollWidth}));
    t(c2.nogl && c2.n === 2 && c2.off && !c2.dm && !c2.fly && !c2.hero, 'второй обрыв подряд — режим без анимации: зал статичный, читалка — лента страниц, WebGL-движки не создаются', c2);
    t(c2.toast && c2.log >= 1, 'после обрыва: плашка «Страница перезапустилась…» и журнал вылетов в localStorage (последние действия сохранены)', c2);
    await q.evaluate(() => window.Astreya.house.openMagazine(1)); await q.waitForTimeout(900);
    const c3 = await q.evaluate(() => { const l = [...document.querySelectorAll('#mag .face')].map(e => e.getBoundingClientRect()).filter(r => r.width > 100 && r.right > 0 && r.left < innerWidth); return {leaves: l.length, ow: document.documentElement.scrollWidth}; });          // в ленте страниц листы — display:contents, видны их лица (.face)
    t(c3.leaves >= 1 && c3.ow <= 390, 'режим без анимации: журнал открывается лентой страниц, без горизонтальной прокрутки страницы', c3);
    t(q._errs.length === 0, 'нет ошибок JS в режиме без анимации', q._errs.slice(0, 5));
    await q.goto(base + '/' + page + '?nogl=0'); await q.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(1200);
    const c4 = await q.evaluate(() => { const rd = document.querySelector('.house-reader'); return {nogl: !!window.Astreya.nogl, dm: rd.hasAttribute('data-m'), why: rd.getAttribute('data-fly-why') || '', crashN: window.Astreya.crashN}; });
    t(!c4.nogl && c4.dm && !/без анимации/.test(c4.why), '?nogl=0 снимает режим без анимации (читалка с пролётом, движки не отключены)', c4);
    await q._ctx.close();
    const q2 = await open(390, 844, {touch: true, url: page + '?nogl=1'});
    const d1 = await q2.evaluate(() => ({nogl: !!window.Astreya.nogl, off: document.getElementById('arch-story').classList.contains('jar-off'), dm: document.querySelector('.house-reader').hasAttribute('data-m')}));
    t(d1.nogl && d1.off && !d1.dm, '?nogl=1 включает режим без анимации сразу', d1);
    await q2._ctx.close();
  }
  { /* плитки «У каждой задачи»: текстуры — слабые полупрозрачные золотые разводы поверх бумаги (RGBA с малой непрозрачностью); уменьшенные копии (-t) обязаны сохранять прозрачность, иначе плитки превращаются в сплошные жёлтые плашки с чёрными областями («баг с текстурами») */
    const q = await open(1280, 800), names = ['water', 'cream', 'silk', 'pipette', 'swatch', 'film', 'molecules', 'smear'];
    const r = await q.evaluate(async names => {
      const out = [];
      for (const n of names) {
        const im = new Image(); im.src = 'assets/bg/' + n + '-t.webp'; await im.decode();
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let a = 0, lum = 0; const N = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { const al = d[i + 3] / 255; a += al; lum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * al + 243 * (1 - al); }          // поверх бумаги ≈ #f3ebd9
        out.push({n, w: im.naturalWidth, alpha: +(a / N).toFixed(3), lum: Math.round(lum / N)});
      }
      return out;
    }, names);
    const bad = r.filter(x => x.alpha > 0.6 || x.lum < 170 || x.w !== 560);
    t(!bad.length, 'плитки задач: уменьшенные текстуры (-t) 560 px сохраняют прозрачность (в среднем < 60 % непрозрачности, поверх бумаги светлые)', bad.length ? bad : r.map(x => x.n + ':' + x.alpha + '/' + x.lum).join(' '));
    await q._ctx.close();
  }
  { /* телефон, журнал раскрыт: вертикальный жест по книге прокручивает страницу (вверх — назад к пролёту камеры, вниз — дальше), страницу журнала не листает; горизонтальный — листает; видно окно одной страницы (соседняя и нарисованный журнал под ней не торчат), «Далее» не закрыта кнопкой Стеллы; вход и пролёт прежние: заплатка включается только когда камера приехала */
    for (const [W, Hh] of [[390, 844], [360, 640]]) {
      const q = await open(W, Hh, {touch: true}); const cdp = await q._ctx.newCDPSession(q);
      const tch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y}]});
      const drag = async (x0, y0, x1, y1) => { await tch('touchStart', x0, y0); for (let i = 1; i <= 8; i++) { await tch('touchMove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await q.waitForTimeout(16); } await tch('touchEnd'); await q.waitForTimeout(450); };
      const pre = await q.evaluate(() => { const w = document.querySelector('#mag .mag-wrap'); return {ta: getComputedStyle(w).touchAction, open: document.getElementById('house-reader').classList.contains('rd-open'), fly: [...document.querySelectorAll('.hr-fly canvas')].map(c => getComputedStyle(c).visibility), stage: getComputedStyle(document.querySelector('.hr-stage')).visibility}; });
      await q.evaluate(() => window.Astreya.house.hall()); await q.waitForTimeout(600);
      await q.evaluate(() => window.Astreya.house.openMagazine(2)); await settle(q); await q.waitForTimeout(1800);
      const g = await q.evaluate(() => { const r = el => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }; const nx = r(document.querySelector('#mag .mag-nx')), fab = document.querySelector('#asst-fab') ? r(document.querySelector('#asst-fab')) : [9999, 9999, 9999, 9999], wrap = r(document.querySelector('#mag .mag-wrap')), cl = document.querySelector('.hr-clean'), at = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest('.mag-book') ? 'book' : 'other'; };
        return {stop: window.Astreya.house.readerState().stop, sideL: at(4, (wrap[1] + wrap[3]) / 2), sideR: at(innerWidth - 4, (wrap[1] + wrap[3]) / 2), clip: getComputedStyle(document.querySelector('#mag .mag-book')).clipPath, open: document.getElementById('house-reader').classList.contains('rd-open'), ta: getComputedStyle(document.querySelector('#mag .mag-wrap')).touchAction, nx, fab, wrap, y: Math.round(scrollY), clean: !!cl && /read-m\.webp/.test(cl.src), cleanOp: cl ? +getComputedStyle(cl).opacity : -1}; });
      const cx = W / 2, cy = (g.wrap[1] + g.wrap[3]) / 2;
      await drag(cx, cy + 110, cx, cy - 110); const y1 = await q.evaluate(() => Math.round(scrollY)); await drag(cx, cy - 110, cx, cy + 110); const y2 = await q.evaluate(() => Math.round(scrollY));
      const stA = await q.evaluate(() => window.Astreya.house.readerState().stop); await drag(cx, 40, cx, 8); const y3 = await q.evaluate(() => Math.round(scrollY)); const stB = await q.evaluate(() => window.Astreya.house.readerState().stop);
      const st0 = await q.evaluate(() => window.Astreya.house.readerState().stop); await drag(cx + 100, cy, cx - 100, cy + 6); await q.waitForTimeout(1400); const st1 = await q.evaluate(() => window.Astreya.house.readerState().stop);
      const tag = W + '×' + Hh;
      t(pre.fly.length >= 1 && pre.fly.every(v => v === 'visible') && pre.stage === 'hidden', 'телефон ' + tag + ': кадр пролёта виден под героем заранее (холст не включается в момент стыка), а сцена читалки скрыта', pre);
      t(!pre.open && g.open && g.ta === 'pan-y', 'телефон ' + tag + ': пока камера летит, жесты по сцене прокручивают страницу; журнал раскрыт — по книге разрешён вертикальный жест (touch-action: pan-y), горизонтальный остаётся листанию', {pre, g: {open: g.open, ta: g.ta}});
      t(y1 > g.y + 10 && y2 < y1 - 10, 'телефон ' + tag + ': вертикальный жест по раскрытому журналу прокручивает страницу: вверх пальцем — дальше (к подвалу), вниз — назад к пролёту', {y0: g.y, y1, y2});
      t(stA === stB && stA === g.stop, 'телефон ' + tag + ': вертикальные жесты страницы журнала не листают', {stA, stB, g: g.stop});
      t(y3 > y2 + 10, 'телефон ' + tag + ': жест по полю над книгой тоже прокручивает страницу', {y2, y3});
      t(g.sideL !== 'book' && g.sideR !== 'book' && /inset/.test(g.clip), 'телефон ' + tag + ': видно окно одной страницы — по бокам (левый и правый край экрана) не торчат ни соседняя страница, ни нарисованный журнал', {sideL: g.sideL, sideR: g.sideR, clip: g.clip});
      t(st1 === st0 + 1, 'телефон ' + tag + ': горизонтальный свайп по книге листает страницу', {st0, st1});
      const inter = !(g.nx[2] <= g.fab[0] || g.fab[2] <= g.nx[0] || g.nx[3] <= g.fab[1] || g.fab[3] <= g.nx[1]);
      t(!inter && g.nx[2] <= g.fab[0] + 1, 'телефон ' + tag + ': кнопка «Далее» не закрыта кнопкой Стеллы (справа от «Далее» оставлено место)', {nx: g.nx, fab: g.fab});
      t(g.clean && g.cleanOp >= .99, 'телефон ' + tag + ': заплатка «стол без нарисованного журнала» включена, когда камера приехала и журнал раскрыт', {clean: g.clean, op: g.cleanOp});
      { await drag(cx, 120, cx, 120 + Math.round(Hh * .62)); await q.waitForTimeout(700); const back = await q.evaluate(() => { const c = document.querySelector('.hr-clean'); return {open: document.getElementById('house-reader').classList.contains('rd-open'), op: c ? +getComputedStyle(c).opacity : -1, t: window.Astreya.house.readerState().t}; });
        t(!back.open && back.op < .05, 'телефон ' + tag + ': стоит потянуть назад к пролёту — заплатка уходит, нарисованный журнал на столике снова виден (вход и пролёт прежние)', back); }
      { await q.evaluate(() => window.Astreya.house.openMagazine(20)); await settle(q); await q.waitForTimeout(900);
        const gp = await q.evaluate(() => { const r = document.getElementById('house-reader'), st = r.querySelector('.hr-stage'); return {top: Math.round(r.getBoundingClientRect().top + scrollY), h: r.offsetHeight, st: st.offsetHeight}; });
        const pinEnd = gp.top + gp.h - gp.st, L = Math.round(gp.st * .5);
        const xq = async y => { await q.evaluate(v => window.scrollTo({top: v, behavior: 'instant'}), y); await q.waitForTimeout(260); return q.evaluate(() => { const r = document.getElementById('house-reader'), x = r.querySelector('.hr-exit'); return {o: x ? +x.style.opacity || 0 : -1, cls: r.classList.contains('rd-exit')}; }); };
        const b0 = await xq(pinEnd - L - 20), seq = []; for (let k = 0; k <= 8; k++) seq.push((await xq(pinEnd - L + Math.round(L * k / 8))).o); const b1 = await xq(pinEnd);
        t(b0.o === 0 && !b0.cls && seq.every((v, i) => i === 0 || (v >= seq[i - 1] && v - seq[i - 1] < .3)) && b1.o >= .99 && b1.cls, 'телефон ' + tag + ': выход с последней страницы — последние 50 vh выдержки сцена ровно растворяется в фон страницы (до этого журнал стоит как был)', {b0, seq, b1}); }
      t(q._errs.length === 0, 'нет ошибок JS (жесты журнала, ' + tag + ')', q._errs.slice(0, 5));
      await q._ctx.close();
    }
  }
  { /* свежесть страницы: версия в build.json не совпадает с версией загруженной страницы (устаревший кеш) → страница открывается заново (не больше двух раз), параметр ?b= из адреса убирается; совпадает — ничего не происходит */
    const ctx = await b.newContext({viewport: {width: 800, height: 700}, locale: 'ru-RU'});
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) { /* — */ } });
    await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    let nav = 0; const pg = await ctx.newPage(); pg.on('framenavigated', f => { if (f === pg.mainFrame()) nav++; });
    await pg.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await pg.goto(base + '/' + page + '#hall'); await pg.waitForTimeout(1500);
    const fresh = {nav, n: await pg.evaluate(() => window.sessionStorage.getItem('astreya:fresh')), q: await pg.evaluate(() => location.search)};
    t(fresh.n === null && fresh.q === '', 'свежесть: версия в build.json совпадает со страницей — повторной загрузки нет', fresh);
    await pg.route('**/build.json', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"v":"zzzzzzzz"}'}));
    nav = 0; await pg.goto(base + '/' + page); await pg.waitForTimeout(4500);
    const stale = {nav, n: await pg.evaluate(() => window.sessionStorage.getItem('astreya:fresh')), q: await pg.evaluate(() => location.search)};
    t(stale.n === '2' && stale.nav >= 3 && stale.q === '', 'свежесть: версия устарела — страница заново открыта (ровно два раза, без цикла), ?b= из адреса убран', stale);
    await ctx.close();
  }

  /* ================= 6. уменьшенное движение, без WebGL и без JS ================= */
  p = await open(1440, 900, {reduce: true});
  { const r = await p.evaluate(() => { const rd = document.getElementById('house-reader'); return {flat: rd.classList.contains('is-flat'), lite: document.documentElement.classList.contains('lite'), pos: getComputedStyle(rd.querySelector('.hr-stage')).position, h: rd.getBoundingClientRect().height, vh: innerHeight, orb: !!document.querySelector('#arch-story .ar-orb')}; });
    t(!r.flat && !r.lite && r.pos === 'sticky' && r.h > r.vh * 4 && r.orb, 'prefers-reduced-motion: системная настройка не отключает анимации — журнал закреплён и листается прокруткой (решение заказчика), сцена и орбиты на месте', r); }
  { await p.evaluate(() => window.Astreya.house.go('finder')); await settle(p); t((await rs(p)).s >= 3, 'при «уменьшить движение» переход к комнате листает журнал, как обычно');
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900); t(await p.evaluate(() => scrollY) <= await p.evaluate(() => document.getElementById('house-reader').offsetTop + 2), '«в зал» возвращает к сцене зала'); }
  t(p._errs.length === 0, 'нет ошибок JS при «уменьшить движение»', p._errs.slice(0, 5));
  await p._ctx.close();

  /* без WebGL: сцена выключена (jar-off), вместо неё готовый кадр зала (постер), список разделов и тот же журнал */
  { const ctx = await b.newContext({viewport: {width: 1440, height: 900}, locale: 'ru-RU'}); await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k) { if (/webgl/i.test(k)) return null; return g.apply(this, arguments); }; });
    await ctx.route(/^https:\/\/fonts\./, r => r.abort()); const q = await ctx.newPage(), qe = []; q.on('pageerror', e => qe.push(String(e.message || e).slice(0, 160)));
    await q.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await q.goto(base + '/' + page); await q.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); await q.waitForTimeout(1800);
    const r = await q.evaluate(() => { const a = document.getElementById('arch-story'), s = a.querySelector('.js-stage'); return {off: a.classList.contains('jar-off'), pos: getComputedStyle(s).position, poster: getComputedStyle(a.querySelector('.ar-poster')).display, rooms: getComputedStyle(document.querySelector('.hall-rooms')).display, h: a.getBoundingClientRect().height}; });
    t(r.off && r.pos !== 'sticky' && r.poster === 'block' && r.rooms !== 'none' && r.h > 500 && r.h <= 1400, 'без WebGL: вместо сцены готовый кадр зала на один экран, список разделов на виду', r);
    await q.click('.hall-rooms a[data-house-go="finder"]'); await settle(q); t((await q.evaluate(() => window.Astreya.house.readerState().s)) === ROOMS.indexOf('finder') + 2, 'без WebGL: список разделов открывает нужный разворот журнала');
    t(qe.length === 0, 'нет ошибок JS без WebGL', qe.slice(0, 4)); await ctx.close(); }

  p = await open(1440, 900, {nojs: true});
  { const r = await p.evaluate(() => ({faces: [...document.querySelectorAll('#mag .face')].filter(e => e.getBoundingClientRect().height > 200 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').length, h1: document.querySelectorAll('h1').length,
      list: document.querySelectorAll('.hall-rooms a[href^="#room-"]').length, poster: getComputedStyle(document.querySelector('.ar-poster')).display, listVis: getComputedStyle(document.querySelector('.hall-rooms')).display, ctl: getComputedStyle(document.querySelector('.mag-ctl')).display}));
    t(r.faces >= 17 && r.h1 === 1 && r.ctl === 'none', 'без JS: страницы журнала идут подряд обычными блоками (видно ' + r.faces + '), один h1, кнопок листания нет', r);
    t(r.list === ROOMS.length && r.poster === 'block' && r.listVis !== 'none', 'без JS: в зале готовый кадр и список разделов (обычные якорные ссылки #room-…)', r); }
  { const hrefOk = await p.evaluate(() => [...document.querySelectorAll('.hall-rooms a[href^="#room-"]')].every(a => document.getElementById(a.getAttribute('href').slice(1)))); t(hrefOk, 'без JS: каждая ссылка списка ведёт на существующий якорь'); }
  await p._ctx.close();

  /* ================= 7. содержимое страниц журнала: настоящие данные, ссылки, логотипы, Стелла, всё помещается ================= */
  console.log('[страницы журнала 4–21]');
  {
    const SITE = J('data/site.json'), BR = J('data/brands.json'), EV = J('data/events.json'), NW = J('data/news.json').items, PG = H.mag.pages;
    const q = await open(1440, 900); await q.waitForTimeout(2200);
    // 7.1 все ссылки журнала ведут на существующие страницы собранного сайта; кнопки Стеллы — настоящие
    const hrefs = await q.evaluate(() => [...document.querySelectorAll('#mag a[href]')].map(a => a.getAttribute('href')));
    const missing = hrefs.filter(h => !/^(tel:|mailto:|#)/.test(h)).map(h => h.split('#')[0].split('?')[0]).filter(h => h && !fs.existsSync(path.join(ROOT, h.replace(/^(\.\.\/)+/, '').replace(/^\.\//, ''))));
    t(missing.length === 0 && hrefs.length >= 60, 'все ссылки журнала ведут на существующие страницы сайта (' + hrefs.length + ' ссылок)', missing.slice(0, 6));
    /* память: плитки задач показываются ≈ 150 px шириной — текстуры уменьшенные (-t, ≤ 600 px по ширине), а не 1600×1100 (восемь раскодированных больших текстур ≈ 56 МБ выбивали iPhone на 6–7-й странице) */
    const tx = await q.evaluate(() => [...document.querySelectorAll('#mag img.mp-tx')].map(i => i.getAttribute('src').split('?')[0]));
    const txBig = tx.filter(u => !/-t\.webp$/.test(u) || !fs.existsSync(path.join(ROOT, u.replace(/^(\.\.\/)+/, '')))).slice(0, 4);
    t(tx.length >= 8 && txBig.length === 0, 'плитки задач в журнале берут уменьшенные текстуры (-t.webp), файлы на месте', {n: tx.length, txBig});
    for (const pre of ['brands/', 'products/', 'catalog.html?task=', 'training/', 'news/', 'partners.html', 'start.html', 'training.html#teachers']) t(hrefs.some(h => h.replace(/^\.\.?\//, '').startsWith(pre)), 'в журнале есть ссылка «' + pre + '…»');
    t(hrefs.includes('tel:' + SITE.contacts.phoneRaw) && hrefs.includes('mailto:' + SITE.contacts.email), 'контакты на последнем развороте — из data/site.json (телефон и почта ссылками)');
    // 7.2 логотипы брендов: в галерее у каждого бренда его файл логотипа
    const logos = await q.evaluate(() => [...document.querySelectorAll('#mag .mp-bgal .mp-bl')].map(i => i.getAttribute('src')));
    t(BR.every(b => logos.some(l => l.replace(/^\.\.?\//, '').split('?')[0] === b.logo)) && logos.length === BR.length, 'галерея брендов: у каждого бренда его настоящий логотип (' + logos.length + ' из ' + BR.length + ')', logos);
    t(await q.evaluate(() => document.querySelectorAll('#mag .mp-tlg').length >= 12 && document.querySelectorAll('#mag .mp-logos-all .mp-lg').length >= 9), 'логотипы брендов — на страницах подбора и контактов');
    // 7.3 события и новости — только из данных
    const evT = await q.evaluate(() => [...document.querySelectorAll('#mag .mp-ev strong')].map(e => e.textContent)), nwT = await q.evaluate(() => [...document.querySelectorAll('#mag .mp-feat strong, #mag .mp-nws strong')].map(e => e.textContent));
    t(evT.length >= 3 && evT.every(x => EV.some(e => e.title === x)) && nwT.length === 3 && nwT.every(x => NW.some(n => n.title === x)), 'события и новости на страницах журнала взяты из data/events.json и data/news.json', {evT, nwT});
    // 7.4 Стелла: настоящая кнопка (открывает действующий чат), настоящий маскот, диалог — настоящие ответы помощника
    t(await q.evaluate(() => document.querySelectorAll('#mag [data-act="asst-open"]').length >= 2 && !document.querySelector('#mag #room-stella a[href="#"]')), 'Стелла: кнопки «Начать диалог» — настоящие (data-act="asst-open"), не картинка чата');
    t(await q.evaluate(() => document.querySelectorAll('#room-stella .mp-pe svg.pe, #mag .pg-stl .mp-pe svg.pe').length >= 3), 'Стелла: на страницах настоящий маскот (Astreya.pearl), а не нарисованная заглушка');
    await q.evaluate(() => document.querySelector('#room-stella [data-act="asst-open"]').click()); await q.waitForTimeout(900);
    t(await q.evaluate(() => !!(window.Astreya.stella && window.Astreya.stella.state().open) && !!document.querySelector('#asst.open')), 'Стелла: кнопка на странице журнала открывает действующий чат');
    const real = await q.evaluate(async dlg => { const out = []; for (const d of dlg) { const r = await window.Astreya.assistant.answer(d.q); out.push({text: r.text, cards: r.cards, links: r.links}); } return out; }, PG.stella.dialog);
    const norm = x => String(x).replace(/[*«»"“”]/g, '').replace(/\s+/g, ' ').trim();
    const same = PG.stella.dialog.every((d, i) => norm(real[i].text) === norm(d.a + ' ' + (d.note || '')) && (!d.product || (real[i].cards || []).includes(d.product)) && (!d.link || (real[i].links || []).some(l => l.h === d.link.h)));
    t(same, 'Стелла: пример диалога на странице — дословно те же ответы, что даёт настоящий помощник сайта сейчас (Astreya.assistant.answer)', real.map(r => norm(r.text).slice(0, 80)));
    // 7.4б интерактивный чат на странице: подсказки и поле ввода, ответы — настоящие (тот же помощник), с памятью разговора
    const live = await q.evaluate(() => ({vis: !!document.querySelector('.mp-chat-live') && !document.querySelector('.mp-chat-live').hidden, chips: [...document.querySelectorAll('.mp-chat-chips .mp-chip')].map(b => b.getAttribute('data-q')), inp: !!document.querySelector('.mp-chat-in input')}));
    t(live.vis && live.chips.length >= 2 && live.inp, 'Стелла: под перепиской подсказки-кнопки и поле ввода', live);
    const chatN = () => q.evaluate(() => { const m = [...document.querySelectorAll('.mp-chat-log .mp-m:not(.mp-typing)')]; return {n: m.length, u: m.length > 1 ? m[m.length - 2].textContent.trim() : '', a: m.length ? m[m.length - 1].textContent.replace(/\s+/g, ' ').trim() : '', chips: [...document.querySelectorAll('.mp-chat-chips .mp-chip')].map(b => b.textContent.trim())}; });
    const n0 = (await chatN()).n, r1 = await q.evaluate(x => { const r = window.Astreya.assistant.answer(x); return {text: r.text, cards: r.cards}; }, live.chips[0]);
    await q.evaluate(() => document.querySelector('.mp-chat-chips .mp-chip').click()); await q.waitForTimeout(650);
    const typingSeen = await q.evaluate(() => !!document.querySelector('.mp-chat-log .mp-typing')); await q.waitForTimeout(3400); const c1 = await chatN();
    const cardIds = await q.evaluate(() => [...document.querySelectorAll('.mp-chat-log .mp-m:not(.mp-typing):last-child .mp-pc')].map(a => a.getAttribute('data-product')));
    /* формулировку помощник варьирует (не повторяет прошлую), поэтому сверяем суть: тема, число позиций и карточки товаров — те же, что у настоящего ответа */
    t(c1.n === n0 + 2 && c1.u === live.chips[0] && typingSeen && /Фотозащит/i.test(c1.a) && cardIds.length >= 1 && cardIds.every((id, i) => id === r1.cards[i]), 'Стелла: клик по подсказке — вопрос в переписке, точки набора, затем настоящий ответ помощника (те же товары каталога)', {n0, c1: c1.n, u: c1.u, a: c1.a.slice(0, 60), typingSeen, cardIds, real: r1.cards});
    t(c1.chips.length >= 1 && c1.chips.every(x => x !== live.chips[0]) , 'Стелла: после ответа подсказки меняются на уточняющие вопросы помощника', c1.chips);
    const fu = c1.chips[0];
    await q.evaluate(f => [...document.querySelectorAll('.mp-chat-chips .mp-chip')].find(b => b.textContent.trim() === f).click(), fu); await q.waitForTimeout(3800); const c2 = await chatN();
    t(c2.n === c1.n + 2 && c2.u === fu && !/\(\)/.test(c2.a) && c2.a.length > 40, 'Стелла: уточняющий вопрос понят из контекста разговора, в ответе нет пустых скобок', {u: c2.u, a: c2.a.slice(0, 120)});
    const r3 = await q.evaluate(x => window.Astreya.assistant.answer(x).text, 'Как связаться с менеджером?');
    await q.evaluate(() => { const f = document.querySelector('.mp-chat-in'); f.querySelector('input').value = 'Как связаться с менеджером?'; f.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true})); }); await q.waitForTimeout(3800); const c3 = await chatN();
    t(c3.n === c2.n + 2 && c3.u === 'Как связаться с менеджером?' && /925-51-62/.test(r3) && /925-51-62/.test(c3.a), 'Стелла: вопрос из поля ввода — настоящий ответ (телефон менеджера из данных сайта)', {u: c3.u, a: c3.a.slice(0, 100)});
    await q._ctx.close();
    // 7.5 всё помещается: на каждой странице содержимое выше колонтитула и не выходит за страницу (ПК-окна и телефон)
    for (const [w, h] of [[1440, 900], [1868, 960], [1280, 720], [390, 844], [360, 640]]) {
      const f = await open(w, h); await f.waitForTimeout(1200);
      await f.addStyleTag({content: '#arch-story,.hero{display:none!important}.house-reader{margin-top:0!important}'});
      await f.evaluate(() => { document.getElementById('house-reader').classList.add('is-flat'); window.dispatchEvent(new Event('resize')); }); await f.waitForTimeout(700);
      const res = await f.evaluate(() => {
        const out = [];
        for (const pg of document.querySelectorAll('.mag-book .pg')) {
          if (pg.classList.contains('pg-cover') || pg.classList.contains('pg-back')) continue;
          const pr = pg.getBoundingClientRect(), ft = pg.querySelector('.pg-f'), lim = ft ? ft.getBoundingClientRect().top : pr.bottom; let worst = -1e9, right = -1e9;
          for (const el of pg.querySelectorAll('*')) {
            if (el.closest('.pg-f, .mg-run, .mg-ph') || el.classList.contains('mg-scrim')) continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            worst = Math.max(worst, r.bottom); right = Math.max(right, r.right);
          }
          out.push({pg: [...pg.classList].filter(c => /^pg-[a-z]{3}$/.test(c))[0] || 'welcome', over: Math.round(worst - lim), out: Math.round(right - pr.right)});
        }
        return out;
      });
      const bad2 = res.filter(r => r.over > 1 || r.out > 1);
      t(res.length >= 18 && bad2.length === 0, `все страницы журнала помещаются в кадр: ${w}×${h}${w < 701 ? ' (телефон)' : ''}`, bad2);
      await f._ctx.close();
    }
  }

  await b.close(); srv.close();
  console.log(`\nИтог: ${ok} из ${ok + bad.length} проверок пройдено`);
  if (bad.length) { console.log('Не пройдено:\n - ' + bad.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
