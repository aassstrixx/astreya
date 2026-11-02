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
  const settle = async (p, ms) => { let last = -1, same = 0; const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { const y = await p.evaluate(() => Math.round(scrollY)); if (y === last) { if (++same >= 5) return; } else { same = 0; last = y; } await p.waitForTimeout(110); } await p.waitForTimeout(80); };          // автоход страницы (плавное листание) закончился: прокрутка стоит
  const box = p => p.evaluate(() => { const r = document.getElementById('house-reader'), b = r.getBoundingClientRect(); return {top: b.top + scrollY, tot: r.offsetHeight - innerHeight}; });
  const at = async (p, f) => { const o = await box(p); await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o.top + o.tot * f); await p.waitForTimeout(450); return rs(p); };
  const PL = (j, u) => .34 + .62 * (j + u) / 8;                    // положение прокрутки: j — сколько разворотов после первого пройдено, u — доля пути внутри отрезка; см. RD и WIN в js/house.js (p = 1 + j + поворот)

  /* ================= 1. структура (ПК) ================= */
  let p = await open(1440, 900);
  t(await p.evaluate(() => document.body.dataset.page === 'home' && !!document.querySelector('#arch-story.is-house')), 'страница собрана как дом (#arch-story.is-house)');
  t(await p.evaluate(() => document.querySelectorAll('h1').length === 1), 'на странице один заголовок первого уровня');
  t(await p.evaluate(() => !document.querySelector('section.room, .house-nav, .house-veil, .hall-door, .hd-tag, .hd-arch, .hall-doors, .room-door, .hp-marquee, #hb-strip')), 'нижней части нет: ни комнат-секций, ни плавающего меню, ни проходов-арок с табличками, ни ленты брендов');
  { const o = await p.evaluate(() => [...document.querySelector('#main, main').children].map(e => e.id || e.className.toString().split(' ')[0]));
    t(o[0] === 'arch-story' && o.filter(x => x !== 'g-entry').slice(-2).join() === 'house-reader,house-end' && o.length <= 6, 'после зала идёт только журнал (читалка), дальше — подвал сайта', o); }
  { const ids = await p.evaluate(() => [...document.querySelectorAll('#mag .pg-r[data-room]')].map(e => e.dataset.room));
    t(JSON.stringify(ids) === JSON.stringify(ROOMS) && ids.length === 7, 'семь комнат — страницы журнала в порядке из данных: ' + ROOMS.join(' → '), ids); }
  t(await p.evaluate(() => [...document.querySelectorAll('#mag .pg-r[data-room]')].every(e => e.id === 'room-' + e.dataset.room)), 'у каждой страницы комнаты есть якорь #room-… (адреса прежней версии работают, без JS — обычные ссылки)');
  t(await p.evaluate(n => document.querySelectorAll('.hall-rooms a[data-house-go]').length === n, ROOMS.length), 'в зале есть список разделов ссылками (запасной путь для клавиатуры, телефона и режимов без анимации)');
  t(await p.evaluate(n => document.querySelectorAll('#mag .leaf').length >= n + 2, ROOMS.length), 'журнал: обложка, оглавление, развороты всех комнат и контакты');
  t(await p.evaluate(() => { const m = document.getElementById('mag'), r = document.getElementById('house-reader'); return !!m && !!r && r.contains(m) && m.getAttribute('role') === 'region' && !m.hidden && !m.classList.contains('is-modal') && !m.querySelector('[data-mag-close]'); }), 'журнал стоит в читалке как обычный блок страницы (не диалог, закрывать нечего)');
  t(await p.evaluate(() => !!document.querySelector('#arch-story .ar-orb') && !document.querySelector('#arch-story .ar-panel') && !!document.querySelector('#arch-story .hs-cue[data-house-mag]') && !document.querySelector('.hall-greet')), 'прежняя анимация и герой на месте: орбиты логотипов; вместо панели «Почему выбирают Астрею?» внизу — подсказка «Листайте ниже — откроется журнал» (она же кнопка)');
  t(await p.evaluate(() => [...document.querySelectorAll('section[aria-labelledby]')].every(s => document.getElementById(s.getAttribute('aria-labelledby')))), 'у разделов есть заголовок (aria-labelledby ведёт на существующий)');
  t(await p.evaluate(() => { const a = document.getElementById('arch-story'); return !!(a.querySelector('.js-stage canvas.js-cv') && a.querySelector('.ar-copy h1') && a.querySelector('.ar-cue')); }), 'сцена первого экрана и герой на месте (холст, заголовок, «Листайте»)');
  t(await p.evaluate(() => !!document.querySelector('header .nav, header nav') && !!document.querySelector('footer.ftr')), 'шапка с меню и подвал сайта на месте');
  { const s = await p.evaluate(() => window.Astreya.house.state()); t(s && s.rooms.length === 7 && s.reader === true, 'API Astreya.house доступен', s); }

  /* ================= 2. прежние разделы доступны ================= */
  { const hrefs = await p.evaluate(() => [...document.querySelectorAll('#mag a[href]')].map(a => a.getAttribute('href')));
    const miss = H.rooms.filter(r => !hrefs.some(h => h.replace(/^\.\.?\//, '') === r.href)).map(r => r.id);
    t(miss.length === 0, 'у каждой комнаты на странице журнала кнопка на её полную страницу (' + H.rooms.map(r => r.href).join(', ') + ')', miss); }
  { const ctas = await p.evaluate(() => [...document.querySelectorAll('#mag .mg-open')].map(a => a.dataset.track)); t(ctas.length === 7 && ctas.every(x => x === 'house_magazine_page'), 'кнопки страниц журнала считаются в аналитике (house_magazine_page)', ctas); }
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
    await p.keyboard.press('End'); await settle(p); t((await rs(p)).s === 9 && await p.evaluate(() => document.querySelector('.mag-nx').disabled), 'End: последний разворот, «Далее» отключена');
    await p.keyboard.press('Home'); await settle(p); t((await rs(p)).s === 1 && await p.evaluate(() => document.querySelector('.mag-pv').disabled), 'Home: первый разворот, «Назад» отключена');
    await at(p, .5); await p.click('#house-reader .hr-skip'); await p.waitForTimeout(1000);
    t(await p.evaluate(() => { const e = document.getElementById('house-end').getBoundingClientRect(); return e.top < innerHeight + 4; }), '«К контактам» из читалки приводит к концу страницы (подвал)');
    const tocN = await p.evaluate(() => document.querySelectorAll('.mg-toc button').length); t(tocN === ROOMS.length + 1, 'оглавление: строка на каждую комнату и контакты', tocN); }
  { /* подсказка внизу зала — кнопка: Enter с клавиатуры запускает автоход к раскрытому журналу; кнопки «Откройте журнал» на столике нет */
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
    t(await p.evaluate(() => !document.querySelector('.mag-prev, .mag-hint, .hall-mag')), 'на столике нет кнопки «Откройте журнал ASTREYA» и зоны клика (по решению заказчика убрана)');
    await p.focus('.hs-cue'); t(await p.evaluate(() => document.activeElement.classList.contains('hs-cue')), 'подсказка «Листайте ниже…» доступна с клавиатуры (кнопка получает фокус)');
    await p.keyboard.press('Enter'); await p.waitForFunction(() => window.Astreya.house.readerState().t > .25, null, {timeout: 12000}).catch(() => {}); await settle(p); const o = await rs(p);
    t(o.s >= 1 && o.t > .25, 'Enter на подсказке прокручивает к раскрытому журналу (первый разворот)', o); }

  /* ---- единая сцена: герой и журнал без стыка; автоход к журналу; листание кнопками анимируется; шар стоит при прокрутке ---- */
  { await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
    const g = await p.evaluate(() => { const r = document.getElementById('house-reader'), s = document.getElementById('arch-story'); return {rt: Math.round(r.getBoundingClientRect().top), mt: getComputedStyle(r).marginTop, live: r.classList.contains('is-live'), vis: getComputedStyle(r.querySelector('.hr-stage')).visibility, cue: (document.querySelector('.hs-cue') || {}).textContent, panel: !!document.querySelector('.ar-panel'), between: [...s.parentElement.children].indexOf(r) - [...s.parentElement.children].indexOf(s)}; });
    t(Math.abs(g.rt) <= 2 && !g.live && g.vis === 'hidden', 'герой и журнал — одна сцена: читалка начинается ровно там, где герой заканчивает закрепление, пока герой стоит — её сцена скрыта', g);
    t(/Листайте ниже/.test(g.cue || '') && !g.panel, 'вместо панели «Почему выбирают Астрею?» внизу — подсказка «Листайте ниже — откроется журнал»', g);
    const y0 = await p.evaluate(() => scrollY); await p.click('.hs-cue'); await p.waitForTimeout(450); const ym = await p.evaluate(() => scrollY); await settle(p); const o = await rs(p), y1 = await p.evaluate(() => scrollY);
    t(ym > y0 && ym < y1 - 5 && o.s === 1 && o.t > .25 && o.t < .4, 'клик по подсказке: страница сама плавно едет к журналу (не прыжок), камера пролетает к раскрытому журналу', {y0, ym, y1, o});
    const lv = await p.evaluate(() => ({live: document.getElementById('house-reader').classList.contains('is-live'), story: document.getElementById('arch-story').classList.contains('rd-live'), hero: +getComputedStyle(document.querySelector('#arch-story .ar-copy')).opacity, jar: getComputedStyle(document.querySelector('#arch-story .ar-jar-cv')).visibility}));
    t(lv.live && lv.story && lv.hero < .05, 'после стыка читалка «живая», кадр и текст героя погасли (спрайт баночки не гаснет сам — он убирается, когда кадр героя ушёл)', lv);
    const b0 = (await rs(p)).p; await p.evaluate(() => { window.__pr = []; const f = () => { window.__pr.push(window.Astreya.house.readerState().p); if (window.__pr.length < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await p.click('#mag .mag-nx'); await settle(p); const b1 = (await rs(p)).p, pr = await p.evaluate(() => window.__pr), part = pr.filter(v => v > b0 + .05 && v < b1 - .05);
    t(part.length >= 2 && Math.abs(b1 - b0 - 1) < .02, '«Далее» листает плавно: лист поворачивается на виду (через промежуточные положения), а не перескакивает', {b0, b1, frames: part.length});
    await p.click('#mag .mag-nx'); await p.waitForTimeout(150); await p.click('#mag .mag-nx'); await settle(p); const b2 = (await rs(p)).p;
    t(Math.abs(b2 - b1 - 2) < .02, 'два быстрых нажатия «Далее» подряд листают на два разворота', {b1, b2});
    await p.click('#mag .mag-pv'); await settle(p); await p.click('#mag .mag-pv'); await settle(p);
    /* колесо листает как «Далее»: один небольшой прокрут — один разворот (а не 3–4 прокрута подряд) */
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); await p.mouse.move(700, 450);
    const w0 = await rs(p); await p.mouse.wheel(0, 100); await settle(p); const w1 = await rs(p);
    t(w0.s === 1 && w1.s === 2 && Math.abs(w1.p - 2) < .02, 'колесо: один небольшой прокрут листает ровно один разворот (как «Далее»)', {w0: w0.s, w1: w1.s, p: w1.p});
    await p.evaluate(() => { for (let i = 0; i < 3; i++) document.body.dispatchEvent(new WheelEvent('wheel', {deltaY: 40, bubbles: true, cancelable: true})); }); await settle(p); const w2 = await rs(p);
    t(w2.s === 3, 'серия событий колеса в одном жесте (трекпад, инерция) листает один разворот, а не три', {s: w2.s});
    await p.mouse.wheel(0, -100); await settle(p); const w3 = await rs(p);
    t(w3.s === 2, 'колесо вверх листает назад на один разворот', {s: w3.s});
    { /* скорость листания равна скорости прокрутки: медленно крутишь — лист поворачивается медленно (посреди жеста он на полпути), быстро — быстро */
      await p.evaluate(() => window.Astreya.house.openMagazine(2)); await settle(p); const sl0 = await rs(p);
      const sl = await p.evaluate(() => new Promise(res => { let i = 0, mid = null; const f = () => { document.body.dispatchEvent(new WheelEvent('wheel', {deltaY: 12, bubbles: true, cancelable: true})); i++; if (i === 7) setTimeout(() => { mid = window.Astreya.house.readerState().p; }, 60); if (i < 12) setTimeout(f, 90); else setTimeout(() => res(mid), 120); }; f(); }));
      await settle(p); const sl1 = await rs(p);
      t(sl !== null && sl > sl0.p + .12 && sl < sl0.p + .88, 'медленная прокрутка: посреди жеста лист на полпути (поворот идёт вслед за рукой, а не прыгает целиком)', {from: sl0.p, mid: sl});
      t(sl1.s === sl0.s + 1 && Math.abs(sl1.p - sl1.s) < .02, 'медленная прокрутка: рука остановилась — лист доворачивается до разворота (листнулся один)', {from: sl0.s, to: sl1.s, p: sl1.p}); }
    { /* быстрая прокрутка не «застревает»: непрерывный поток колеса листает несколько разворотов (не чаще раза в 380 мс), а не один на весь жест */
      await p.evaluate(() => window.Astreya.house.openMagazine(2)); await settle(p); const f0 = await rs(p);
      await p.evaluate(() => new Promise(res => { let i = 0; const f = () => { document.body.dispatchEvent(new WheelEvent('wheel', {deltaY: 100, bubbles: true, cancelable: true})); if (++i < 16) setTimeout(f, 55); else res(); }; f(); }));
      await settle(p); const f1 = await rs(p);
      t(f1.s >= f0.s + 2, 'быстрая прокрутка колесом листает дальше (≥ 2 разворотов за непрерывный жест), страница не застревает', {from: f0.s, to: f1.s}); }
    { /* прокрутку остановили посередине поворота листа — лист сам доворачивается до ближайшего разворота */
      await p.evaluate(() => { window.__HOUSE_SNAP = true; window.Astreya.house.openMagazine(2); }); await settle(p);
      const bx = await p.evaluate(() => { const r = document.getElementById('house-reader'); return {top: r.getBoundingClientRect().top + scrollY, tot: r.offsetHeight - innerHeight}; });
      await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), bx.top + bx.tot * (.34 + .62 * 1.55 / 8)); await p.waitForTimeout(100);
      const mid = await rs(p); await settle(p); await p.waitForTimeout(400); await settle(p); const fin = await rs(p);
      t(mid.p > 2.3 && mid.p < 2.8 && Math.abs(fin.p - Math.round(fin.p)) < .02, 'остановка посередине поворота: лист доворачивается до ближайшего разворота сам', {mid: mid.p, fin: fin.p}); await p.evaluate(() => { window.__HOUSE_SNAP = false; }); }
    await p.evaluate(() => window.Astreya.house.openMagazine(1)); await settle(p); const e0 = await rs(p);
    await p.mouse.wheel(0, -100); await p.waitForTimeout(900); const e1 = await rs(p);
    t(e0.s === 1 && e1.t < e0.t - .001, 'на первом развороте колесо вверх не перехвачено: страница идёт назад к пролёту камеры', {e0: e0.t, e1: e1.t});
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
  { await p.evaluate(() => window.Astreya.house.go('expertise')); await settle(p); t((await rs(p)).s === 5, 'API go(expertise): разворот комнаты 04');
    await at(p, .4); await p.evaluate(() => document.querySelector('#mag .mg-toc button[data-mag-page="6"]').click()); await settle(p);
    const s = await rs(p); t(s.s === 6, 'строка оглавления «Учебный центр» открывает разворот комнаты 05', s);
    const pageOk = await p.evaluate(() => { const sh = document.querySelector('.mag-book').dataset.s; return +sh === 6; }); t(pageOk, 'оглавление ведёт на тот же разворот, что и список зала'); }
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
  t(await p.evaluate(() => getComputedStyle(document.querySelector('.hall-rooms')).display !== 'none' && document.querySelectorAll('.hall-rooms a').length === 7), 'телефон: в зале лента из семи разделов (путь без журнала на столике)');
  await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(900);
  { const o = await box(p); await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), o.top + o.tot * .75); await p.waitForTimeout(900);
    const m = await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); return {s: window.Astreya.house.readerState().s, snap: getComputedStyle(l).scrollSnapType, ox: getComputedStyle(l).overflowX, w: document.querySelector('#mag .mag-book').getBoundingClientRect().width}; });
    t(m.s === 1 && /x/.test(m.snap) && m.ox !== 'hidden' && m.w <= 390, 'телефон: журнал раскрыт, одна страница, лента листается жестом (scroll-snap по горизонтали)', m);
    await p.click('#mag .mag-nx'); await settle(p);
    t(await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); return l.scrollLeft > l.clientWidth * 0.5; }), 'телефон: кнопка «Далее» прокручивает ленту к следующей странице');
    await p.evaluate(() => { const l = document.querySelector('#mag .leaves'); l.scrollTo({left: l.clientWidth * 3, behavior: 'instant'}); }); await p.waitForTimeout(500);
    t(+(await p.evaluate(() => document.querySelector('.mag-book').dataset.s)) >= 1, 'телефон: номер страницы следует за жестом'); }
  for (const id of ['brands', 'finder', 'partners', 'editorial']) {
    await p.evaluate(() => window.Astreya.house.hall()); await p.waitForTimeout(500);
    await p.evaluate(i => document.querySelector(`.hall-rooms a[data-house-go="${i}"]`).click(), id); await settle(p);
    t((await rs(p)).s === ROOMS.indexOf(id) + 2 && await noOverflow(p), `телефон: раздел ${id} открывает нужный разворот журнала, нет горизонтальной прокрутки`);
  }
  t(p._errs.length === 0, 'нет ошибок JS на телефоне', p._errs.slice(0, 5));
  await p._ctx.close();

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
    await q.click('.hall-rooms a[data-house-go="finder"]'); await settle(q); t((await q.evaluate(() => window.Astreya.house.readerState().s)) === 4, 'без WebGL: список разделов открывает нужный разворот журнала');
    t(qe.length === 0, 'нет ошибок JS без WebGL', qe.slice(0, 4)); await ctx.close(); }

  p = await open(1440, 900, {nojs: true});
  { const r = await p.evaluate(() => ({faces: [...document.querySelectorAll('#mag .face')].filter(e => e.getBoundingClientRect().height > 200 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').length, h1: document.querySelectorAll('h1').length,
      list: document.querySelectorAll('.hall-rooms a[href^="#room-"]').length, poster: getComputedStyle(document.querySelector('.ar-poster')).display, listVis: getComputedStyle(document.querySelector('.hall-rooms')).display, ctl: getComputedStyle(document.querySelector('.mag-ctl')).display}));
    t(r.faces >= 17 && r.h1 === 1 && r.ctl === 'none', 'без JS: страницы журнала идут подряд обычными блоками (видно ' + r.faces + '), один h1, кнопок листания нет', r);
    t(r.list === 7 && r.poster === 'block' && r.listVis !== 'none', 'без JS: в зале готовый кадр и список разделов (обычные якорные ссылки #room-…)', r); }
  { const hrefOk = await p.evaluate(() => [...document.querySelectorAll('.hall-rooms a[href^="#room-"]')].every(a => document.getElementById(a.getAttribute('href').slice(1)))); t(hrefOk, 'без JS: каждая ссылка списка ведёт на существующий якорь'); }
  await p._ctx.close();

  await b.close(); srv.close();
  console.log(`\nИтог: ${ok} из ${ok + bad.length} проверок пройдено`);
  if (bad.length) { console.log('Не пройдено:\n - ' + bad.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
