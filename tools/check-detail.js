#!/usr/bin/env node
/* Проверка страниц «Товар», «Бренд» и «Мероприятие» (страницы v2) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Товар (4 позиции: новинка, не новинка, самое длинное название, бренд без ближайшего семинара): кадр и упаковка загружены, «путь» (5 ступеней, «назад к списку» с ?brand=&cat=),
   плашка «Новинка» только у новинок, кнопки «Запросить информацию» (hero/боковая/липкая) открывают форму с нужным data-ref, Escape закрывает, липкая панель появляется после прокрутки,
   соседи линейки, «с этим смотрят», пустые данные — «Уточняется», клавиатура (Tab → путь, Enter на кнопке), 1440 и 390 без горизонтальной прокрутки и без ошибок консоли.
   Бренд (2 бренда с логотипом + генератор без логотипа): логотип в нише, h1 с названием, паспорт, полки направлений (число позиций = данным), полка товаров, «Путь с брендом» за кадром,
   «Стать партнёром»/«Запросить условия», соседние бренды. Мероприятие (будущее очное и вебинар, прошедшее): билет, дата крупно, таймлайн, адрес из данных, форма записи уходит на /api/lead,
   «Как проходит запись» переехало под программу, у прошедшего запись скрыта. Часы — tools/fixed-clock.js. Запуск: node tools/check-detail.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const CLOCK = require('./fixed-clock.js');
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain'};
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const PRODUCTS = J('data/products.json'), BRANDS = J('data/brands.json'), EVENTS = J('data/events.json');
const prodArr = Array.isArray(PRODUCTS) ? PRODUCTS : PRODUCTS.products;
const todayIso = new Date(CLOCK.NOW).toISOString().slice(0, 10);
const future = EVENTS.filter(e => e.date >= todayIso), brandsWithEv = new Set(future.map(e => e.brand));
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };

(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('нет'); return; } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(Object.assign({args: ['--use-gl=swiftshader']}, CHROME ? {executablePath: CHROME} : {}));
  const leads = [];
  const open = async (url, w, h, now) => {
    const touch = w < 600, ctx = await b.newContext({viewport: {width: w, height: h || (touch ? 844 : 900)}, locale: 'ru-RU', hasTouch: touch, isMobile: touch}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    if (now) await ctx.addInitScript(t0 => { const D = Date, off = t0 - D.now(); class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } } window.Date = F; }, now);
    else await CLOCK.install(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); sessionStorage.setItem('astreya:splash', '1'); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.route('**/api/lead', r => { try { leads.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
    await p.goto(base + '/' + url); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(1600); p._errs = errs; return p;
  };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const modalOpen = async (p, sel, type) => { await p.click(sel); await p.waitForSelector('#modal.open form', {timeout: 4000}).catch(() => {}); const r = await p.evaluate(() => { const f = document.querySelector('#modal.open form'); return f ? {type: f.getAttribute('data-form'), ref: f.getAttribute('data-ref')} : null; }); await p.keyboard.press('Escape'); await p.waitForTimeout(500); return r; };
  const imgOk = (p, sel) => p.evaluate(s => { const i = document.querySelector(s); return !!i && i.complete && i.naturalWidth > 200; }, sel);

  /* ================= ТОВАРЫ ================= */
  const byLen = prodArr.slice().sort((x, y) => y.name.length - x.name.length)[0];
  const picks = [
    ['новинка', prodArr.find(p => p.isNew)], ['не новинка', prodArr.find(p => !p.isNew && brandsWithEv.has(p.brand))],
    ['длинное название', byLen], ['бренд без семинара', prodArr.find(p => !brandsWithEv.has(p.brand))]
  ].filter(x => x[1]);
  const seen = new Set(), list = picks.filter(([, p]) => !seen.has(p.id) && seen.add(p.id));
  t(list.length >= 3, 'товары: подобрано не меньше трёх разных позиций', list.map(x => x[0]));
  for (const [tag, pr] of list) {
    const url = 'products/' + (pr.slug || pr.id) + '.html';
    let p = await open(url, 1440);
    const d = await p.evaluate(() => ({stage: !!document.querySelector('.dt-stage .dt-view .dt-plate'), h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()), route: [...document.querySelectorAll('.dt-route li')].length, cur: (document.querySelector('.dt-route li[aria-current] b') || {}).textContent, back: (document.querySelector('.dt-back') || {}).getAttribute && document.querySelector('.dt-back').getAttribute('href'), chip: !!document.querySelector('.dt-newchip'), reqs: [...document.querySelectorAll('[data-act="form"][data-type="product"][data-place]')].map(x => x.getAttribute('data-ref') + '|' + x.getAttribute('data-place')), tbd: document.querySelectorAll('.dt-tile .tbd, .pdp .specs .tbd').length, sib: [...document.querySelectorAll('.dt-sib a')].map(a => a.getAttribute('href')), shelf: document.querySelectorAll('.pdp-shelf .grid > *').length, bar: !!document.querySelector('[data-dt-bar] [data-act="form"]'), root: !!document.querySelector('.p-page[data-product]'), hook: !!document.querySelector('.p-info > .row'), specs: !!document.querySelector('.specs'), side: !!document.querySelector('.p-side .p-req')}));
    t(d.stage && d.root && d.hook && d.specs && d.side, 'товар (' + tag + '): сцена, крючки .p-page/.p-info .row/.specs/.p-side на месте', d);
    t(d.h1.length === 1 && d.h1[0] === pr.name, 'товар (' + tag + '): один h1 с названием', d.h1);
    t(d.route === 5 && d.cur === pr.name && /catalog\.html\?brand=[a-z0-9-]+&cat=[a-z0-9-]+$/.test(d.back || ''), 'товар (' + tag + '): путь из пяти ступеней, «К списку» ведёт в каталог с ?brand=&cat=', {route: d.route, cur: d.cur, back: d.back});
    t(d.back && d.back.includes('brand=' + pr.brand) && d.back.includes('cat=' + pr.cat), 'товар (' + tag + '): фильтры в «назад» — бренд и категория товара', d.back);
    t(d.chip === !!pr.isNew, 'товар (' + tag + '): плашка «Новинка» ' + (pr.isNew ? 'есть' : 'нет'), d.chip);
    t(d.reqs.length >= 3 && d.reqs.every(x => x.startsWith(pr.id + '|') || /\|(product-cta)$/.test(x)) && ['product-hero', 'product-side', 'product-sticky'].every(pl => d.reqs.some(x => x.endsWith('|' + pl))), 'товар (' + tag + '): кнопки «Запросить информацию» (hero, боковая, липкая) с data-ref', d.reqs);
    t(d.sib.length === 2 && d.sib.every(h => /products\/[^/]+\.html$/.test(h)), 'товар (' + tag + '): соседи линейки — две ссылки на товары', d.sib);
    t(d.shelf >= 1, 'товар (' + tag + '): «с этим смотрят» — карточки на полке (' + d.shelf + ')');
    const expectTbd = [pr.volume, pr.sku, pr.kind, pr.indications && pr.indications.length, pr.actives && pr.actives.length, pr.usage, pr.docs && pr.docs.length].filter(x => !x).length;
    t(d.tbd >= Math.min(expectTbd, 1) && (d.tbd > 0) === (expectTbd > 0), 'товар (' + tag + '): пустые данные — «Уточняется — запросите у менеджера» (' + d.tbd + ' из ожидаемых ' + expectTbd + ')');
    t(await imgOk(p, '.dt-plate') && await p.evaluate(() => { const k = document.querySelector('.pdp-pk, .pdp-photo img'); return !!k && k.complete && k.naturalWidth > 20; }), 'товар (' + tag + '): кадр и упаковка загружены');
    const geo = await p.evaluate(() => { const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); }, a = r('.dt-route'), q = r('.dt-plaque'), st = r('.dt-stage'); return a && q && st ? {sep: a.bottom <= q.top + 1, inStage: q.bottom <= st.bottom + 1 && q.top >= st.top, h1: document.querySelector('.dt-plaque h1').scrollWidth <= document.querySelector('.dt-plaque').clientWidth + 1} : null; });
    t(!!geo && geo.sep && geo.inStage && geo.h1, 'товар (' + tag + '): табличка не налезает на «путь» и лежит в кадре, заголовок влезает', geo);
    t(await noOverflow(p), 'товар (' + tag + '): 1440 — без горизонтальной прокрутки');
    for (const sel of ['.dt-plaque .row [data-act="form"]', '.p-side [data-act="form"]']) { const r = await modalOpen(p, sel); t(!!r && r.type === 'product' && (r.ref || '').includes(pr.name), 'товар (' + tag + '): ' + sel.split(' ')[0] + ' открывает форму запроса по товару', r); }
    await p.evaluate(() => scrollTo(0, 1500)); await p.waitForTimeout(700);
    t(await p.evaluate(() => { const bar = document.querySelector('[data-dt-bar]'), r = bar.getBoundingClientRect(); return bar.classList.contains('is-on') && r.top >= -1 && r.bottom > 20 && bar.querySelector('b').textContent.trim().length > 0; }), 'товар (' + tag + '): липкая панель с названием появилась после прокрутки');
    { const r = await modalOpen(p, '[data-dt-bar] [data-act="form"]'); t(!!r && (r.ref || '').includes(pr.name), 'товар (' + tag + '): кнопка в липкой панели открывает форму', r); }
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
    t(await p.evaluate(() => !document.querySelector('[data-dt-bar]').classList.contains('is-on')), 'товар (' + tag + '): наверху липкая панель убрана');
    let reached = false; for (let i = 0; i < 60 && !reached; i++) { await p.keyboard.press('Tab'); reached = await p.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.dt-route')); }
    t(reached, 'товар (' + tag + '): клавиатура — Tab доходит до «пути»');
    await p.focus('.dt-plaque .row [data-act="form"]'); await p.keyboard.press('Enter'); await p.waitForSelector('#modal.open form', {timeout: 3000}).catch(() => {});
    t(await p.evaluate(() => !!document.querySelector('#modal.open form')), 'товар (' + tag + '): Enter на кнопке открывает форму'); await p.keyboard.press('Escape');
    t(p._errs.length === 0, 'товар (' + tag + '): 1440 — нет ошибок консоли', p._errs); await p.context().close();
    p = await open(url, 390);
    t(await noOverflow(p), 'товар (' + tag + '): 390 — без горизонтальной прокрутки');
    t(await p.evaluate(() => { const q = document.querySelector('.dt-plaque').getBoundingClientRect(), v = document.querySelector('.dt-view').getBoundingClientRect(); return q.width > 300 && q.left >= 0 && q.right <= innerWidth && v.height > 400; }), 'товар (' + tag + '): 390 — кадр и табличка в экране');
    t(await p.evaluate(() => [...document.querySelectorAll('.btn, .dt-back, .dt-route a')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 36).length === 0), 'товар (' + tag + '): 390 — цели касания не ниже 36 px');
    t(p._errs.length === 0, 'товар (' + tag + '): 390 — нет ошибок консоли', p._errs); await p.context().close();
  }

  /* ================= БРЕНДЫ ================= */
  const bpick = [BRANDS.find(x => brandsWithEv.has(x.id) && x.logo), BRANDS.find(x => !brandsWithEv.has(x.id) && x.logo)].filter(Boolean);
  for (const br of bpick) {
    const prods = prodArr.filter(x => x.brand === br.id), cats = new Set(prods.map(x => x.cat)).size, evs = EVENTS.filter(e => e.brand === br.id);
    let p = await open('brands/' + br.id + '.html', 1440);
    const d = await p.evaluate(() => ({root: document.querySelector('[data-brand-page]') && document.querySelector('[data-brand-page]').getAttribute('data-brand-page'), logo: (() => { const i = document.querySelector('.dtb-logo img'); return !!i && i.complete && i.naturalWidth > 0; })(), h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()), hero: !!document.querySelector('section.b-hero.dt-stage'), packs: document.querySelectorAll('.dtb-pk').length, arches: [...document.querySelectorAll('.vb-row')].map(a => ({n: parseInt(a.querySelector('.vb-rh p').textContent, 10), href: (a.querySelector('.vb-rh a.lnk') || {getAttribute: () => ''}).getAttribute('href')})), tiles: document.querySelectorAll('.dtb-passport .dt-tile').length, cards: document.querySelectorAll('.dtb-shelf .grid > *').length, h2: [...document.querySelectorAll('h2')].some(h => /^Товары/.test(h.textContent)), route: !!document.querySelector('.b-hero + .sx-route-sec, .b-hero ~ .sx-route-sec'), partner: [...document.querySelectorAll('a[data-track="partner_cta"]')].map(a => a.getAttribute('data-place')), ask: [...document.querySelectorAll('[data-act="form"][data-type="question"]')].map(x => x.getAttribute('data-ref')), sib: document.querySelectorAll('.dt-sib a').length, stats: [...document.querySelectorAll('.dtb-stats b')].map(x => +x.textContent), cta: !!document.querySelector('.cta-band.cta-brand')}));
    t(d.root === br.id && d.hero, 'бренд ' + br.id + ': [data-brand-page] и кадр .b-hero', d);
    t(d.logo && d.packs >= Math.min(2, prods.length) && d.packs <= 5, 'бренд ' + br.id + ': логотип в нише загружен, упаковки на подставках (' + d.packs + ')');
    t(d.h1.length === 1 && d.h1[0] === br.name, 'бренд ' + br.id + ': один h1 с названием', d.h1);
    t(d.arches.length === cats && d.arches.reduce((s, a) => s + a.n, 0) === prods.length && d.arches.every(a => /catalog\.html\?brand=/.test(a.href) && a.href.includes('cat=')), 'бренд ' + br.id + ': полки направлений — число направлений и позиций как в данных (' + cats + ' / ' + prods.length + '), ссылки с ?brand=&cat=', d.arches);
    t(d.stats[0] === prods.length && d.stats[1] === cats && d.stats[2] === evs.length, 'бренд ' + br.id + ': цифры на табличке — позиции, линейки, семинары', d.stats);
    t(d.tiles >= 4 && d.cards === prods.length && d.h2, 'бренд ' + br.id + ': паспорт плитками (' + d.tiles + '), полка товаров (' + d.cards + '), заголовок «Товары …»', d);
    t(d.route === (brandsWithEv.has(br.id) || true) && true, 'бренд ' + br.id + ': «Путь с брендом» вставлен за кадром', d.route);
    t(d.partner.includes('brand-hero') && d.partner.includes('brand-cta') && d.ask.length >= 2 && d.sib === 2 && d.cta, 'бренд ' + br.id + ': «Стать партнёром» (hero, CTA), «Запросить условия», соседние бренды, CTA-плита', {partner: d.partner, ask: d.ask.length, sib: d.sib});
    t(await noOverflow(p), 'бренд ' + br.id + ': 1440 — без горизонтальной прокрутки');
    t(await p.evaluate(() => { const lr = () => { const e = document.querySelector('.dtb-logo'), r = e.getBoundingClientRect(), i = e.querySelector('img'); if (!i || !i.naturalHeight) return r.right; const w = Math.min(r.width, r.height * i.naturalWidth / i.naturalHeight); return r.left + r.width / 2 + w / 2; }; const a = document.querySelector('.dt-route').getBoundingClientRect(), q = document.querySelector('.dt-plaque').getBoundingClientRect(); return a.bottom <= q.top + 1 && lr() <= q.left + 4; }), 'бренд ' + br.id + ': табличка не налезает на путь и логотип');
    { const r = await modalOpen(p, '.cta-band [data-act="form"][data-type="question"]'); t(!!r && r.type === 'question' && /^Бренд /.test(r.ref || ''), 'бренд ' + br.id + ': «Запросить условия» открывает форму', r); }
    await p.evaluate(() => scrollTo(0, 1600)); await p.waitForTimeout(700);
    t(await p.evaluate(() => document.querySelector('[data-dt-bar]').classList.contains('is-on')), 'бренд ' + br.id + ': липкая панель бренда появляется');
    { const r = await modalOpen(p, '[data-dt-bar] [data-act="form"]'); t(!!r && r.type === 'question', 'бренд ' + br.id + ': кнопка липкой панели открывает форму', r); }
    t(p._errs.length === 0, 'бренд ' + br.id + ': 1440 — нет ошибок консоли', p._errs); await p.context().close();
    p = await open('brands/' + br.id + '.html', 390);
    t(await noOverflow(p) && await p.evaluate(() => { const q = document.querySelector('.dt-plaque').getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth; }), 'бренд ' + br.id + ': 390 — без горизонтальной прокрутки, табличка в экране');
    t(p._errs.length === 0, 'бренд ' + br.id + ': 390 — нет ошибок консоли', p._errs); await p.context().close();
  }
  /* бренд без логотипа: генератор страницы (в данных у всех брендов логотип есть) */
  try {
    const {load} = require('../src/data.js'), components = require('../src/components.js'), brandPage = require('../src/pages/brand-page.js');
    const ctx = load(); ctx.assetVersion = 'check'; const C = components(ctx), P = {depth: 1, root: '../', key: 'brand', path: 'brands/x.html'};
    const nb = Object.assign({}, ctx.brands[0], {logo: null, logoW: null, logoH: null}), html = brandPage(ctx, C, P, nb);
    t(/class="dtb-logo is-text"/.test(html) && !/class="dtb-logo" /.test(html) && /<h1 class="b-title">/.test(html) && html.includes(nb.name), 'бренд без логотипа: в нише — название текстом, h1 на месте');
    const ne = ctx.sortedEvents[0], ev = require('../src/pages/event-page.js')(ctx, C, P, ne);
    t(/id="e-cta"/.test(ev) && /id="past-note"/.test(ev) && /id="register"/.test(ev) && ev.includes(ne.place), 'мероприятие (генератор): #e-cta, #past-note, #register и адрес из данных');
  } catch (e) { t(false, 'генератор без логотипа: ошибка', String(e.message || e).slice(0, 200)); }

  /* ================= МЕРОПРИЯТИЯ ================= */
  const evInPerson = future.find(e => e.fmt === 'Очно'), evWeb = future.find(e => e.fmt !== 'Очно');
  for (const [tag, ev] of [['очное', evInPerson], ['вебинар', evWeb]].filter(x => x[1])) {
    const url = 'training/' + ev.slug + '.html', dd = new Date(ev.date + 'T00:00:00Z');
    let p = await open(url, 1440);
    const d = await p.evaluate(() => ({root: document.querySelector('[data-event]') && document.querySelector('[data-event]').getAttribute('data-event'), date: document.querySelector('[data-event]').getAttribute('data-date'), h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()), day: (document.querySelector('.dt-stub time b') || {}).textContent, time: (document.querySelector('.dt-stub-t') || {}).textContent, tl: document.querySelectorAll('.dtev-line li').length, facts: [...document.querySelectorAll('.dtev-pass dd')].map(x => x.textContent.trim()), cd: !!document.querySelector('.dt-ticket .cd .cd-b span'), cta: !!document.querySelector('#e-cta [data-act="form"][data-type="seminar"][data-track="event_register"]'), pastHidden: document.querySelector('#past-note').hidden, slotTicket: document.querySelectorAll('[data-dt-ticket-slot] .sx-ticket .sx-steps3 li').length, col: !!document.querySelector('[data-dt-ticket-slot] [data-sx-colleague]'), reg: !!document.querySelector('#register form[data-form="seminar"]'), plate: (() => { const i = document.querySelector('.dt-plate'); return !!i && i.complete && i.naturalWidth > 200; })(), bar: !!document.querySelector('[data-dt-bar] [data-act="form"]'), others: document.querySelectorAll('.dtev-others .events-grid > *').length}));
    t(d.root === ev.id && d.date === ev.date && d.h1.length === 1 && d.h1[0] === ev.title && d.plate, 'событие (' + tag + '): [data-event][data-date], h1 с названием, кадр', d);
    t(+d.day === dd.getUTCDate() && d.time === ev.time, 'событие (' + tag + '): на корешке билета дата крупно и время как в данных', {day: d.day, time: d.time});
    t(d.tl === 4 && d.facts.includes(ev.place) && d.facts.includes(ev.city) && d.facts.includes(ev.time), 'событие (' + tag + '): таймлайн из четырёх узлов, адрес/подключение, город и время — из data/events.json', d.facts);
    t(d.cd && d.cta && d.reg && d.bar && d.others === 3, 'событие (' + tag + '): таймер, кнопка записи (data-track), форма регистрации, липкая кнопка, три других мероприятия', d);
    t(d.slotTicket === 3 && d.col, 'событие (' + tag + '): «Как проходит запись» (3 шага) и «Позвать коллегу» — под программой', {n: d.slotTicket, col: d.col});
    t(d.pastHidden === true, 'событие (' + tag + '): будущее — плашка «прошло» скрыта');
    t(await noOverflow(p), 'событие (' + tag + '): 1440 — без горизонтальной прокрутки');
    t(await p.evaluate(() => { const lr = () => { const e = document.querySelector('.dtb-logo'), r = e.getBoundingClientRect(), i = e.querySelector('img'); if (!i || !i.naturalHeight) return r.right; const w = Math.min(r.width, r.height * i.naturalWidth / i.naturalHeight); return r.left + r.width / 2 + w / 2; }; const a = document.querySelector('.dt-route').getBoundingClientRect(), q = document.querySelector('.dt-ticket').getBoundingClientRect(); return a.bottom <= q.top + 1 && lr() <= q.left + 6; }), 'событие (' + tag + '): билет не налезает на путь и логотип в нише', await p.evaluate(() => { const a = document.querySelector('.dt-route').getBoundingClientRect(), q = document.querySelector('.dt-ticket').getBoundingClientRect(), l = document.querySelector('.dtb-logo').getBoundingClientRect(); return {routeB: a.bottom, tkT: q.top, logoR: l.right, tkL: q.left}; }));
    { const r = await modalOpen(p, '#e-cta [data-act="form"]'); t(!!r && r.type === 'seminar' && (r.ref || '').includes(ev.title), 'событие (' + tag + '): «Записаться» открывает запись на это событие', r); }
    /* форма регистрации внизу: пустая подсвечивает поля, правильная уходит на /api/lead */
    await p.evaluate(() => document.querySelector('#register').scrollIntoView({block: 'center'})); await p.waitForTimeout(500);
    const before = leads.length; await p.click('#register form [type="submit"], #register form button.btn-fill'); await p.waitForTimeout(500);
    t(leads.length === before && await p.evaluate(() => !!document.querySelector('#register form .err, #register form [aria-invalid="true"], #register form .invalid')), 'событие (' + tag + '): пустая форма не уходит и подсвечивает поля');
    await p.evaluate(() => { const f = document.querySelector('#register form'); f.querySelectorAll('input:not(.hp):not([type=checkbox])').forEach(i => { i.value = i.type === 'tel' ? '+7 999 123-45-67' : i.type === 'email' ? 'test@example.com' : 'Проверка Проверкина'; i.dispatchEvent(new Event('input', {bubbles: true})); }); const c = f.querySelector('[type=checkbox]'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', {bubbles: true})); } });
    await p.click('#register form [type="submit"], #register form button.btn-fill'); await p.waitForTimeout(1200);
    t(leads.length === before + 1 && String(JSON.stringify(leads[leads.length - 1])).includes(ev.id), 'событие (' + tag + '): заполненная форма уходит на /api/lead с id события', leads.slice(-1));
    await p.evaluate(() => scrollTo(0, 1700)); await p.waitForTimeout(700);
    t(await p.evaluate(() => document.querySelector('[data-dt-bar]').classList.contains('is-on')), 'событие (' + tag + '): липкая панель записи появляется');
    t(p._errs.length === 0, 'событие (' + tag + '): 1440 — нет ошибок консоли', p._errs); await p.context().close();
    p = await open(url, 390);
    t(await noOverflow(p) && await p.evaluate(() => { const q = document.querySelector('.dt-ticket').getBoundingClientRect(); return q.width > 320 && q.left >= 0 && q.right <= innerWidth; }), 'событие (' + tag + '): 390 — без горизонтальной прокрутки, билет на всю ширину', await p.evaluate(() => { const q = document.querySelector('.dt-ticket').getBoundingClientRect(); return {w: q.width, l: q.left, r: q.right, iw: innerWidth, sw: document.documentElement.scrollWidth}; }));
    t(p._errs.length === 0, 'событие (' + tag + '): 390 — нет ошибок консоли', p._errs); await p.context().close();
  }
  /* прошедшее мероприятие: часы после даты — запись скрыта, липкой панели нет, страница читаема */
  { const ev = EVENTS.slice().sort((x, y) => x.date < y.date ? -1 : 1)[0], p = await open('training/' + ev.slug + '.html', 1440, 900, Date.parse(ev.date + 'T12:00:00Z') + 5 * 864e5);
    const d = await p.evaluate(() => ({note: !document.querySelector('#past-note').hidden, cta: document.querySelector('#e-cta').hidden || getComputedStyle(document.querySelector('#e-cta')).display === 'none', reg: document.querySelector('#register').hidden || getComputedStyle(document.querySelector('#register')).display === 'none', bar: !!document.querySelector('[data-dt-bar]'), h1: !!document.querySelector('h1'), tl: document.querySelectorAll('.dtev-line li').length}));
    t(d.note && d.cta && d.reg && !d.bar && d.h1 && d.tl === 4, 'событие (прошедшее): плашка «прошло», запись и липкая панель скрыты, программа на месте', d);
    t(await noOverflow(p) && p._errs.length === 0, 'событие (прошедшее): без горизонтальной прокрутки и ошибок консоли', p._errs); await p.context().close(); }

  await b.close(); srv.close();
  console.log(`check-detail: ${ok} из ${ok + bad.length} проверок пройдено`);
  if (bad.length) { console.log('НЕ ПРОЙДЕНО:\n - ' + bad.join('\n - ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
