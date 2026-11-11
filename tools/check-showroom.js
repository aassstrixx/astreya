#!/usr/bin/env node
/* Каталог-шоурум (extras.showroom: css/showroom.css, js/showroom.js, src/pages/showroom.js) — проверка в настоящем браузере.
   Компьютер 1440×900: сцена из слоёв (арки, ниша, платформа, подиумы), товары на подиумах и полках ниши (3D-макеты упаковки, картинки загружены), прозрачная шапка над сценой и возврат к привычной при прокрутке,
   панель фильтров слева (галочки ↔ настоящие select, счётчики, сброс), категории-«пилюли», поиск, сортировка, «ничего не нашлось», листание, наведение, выбор товара (приглушение остальных, карточка с «Подробнее»,
   «Запросить», «Быстрый просмотр», «Помочь с подбором» → Стелла, Esc), «Рекомендуем», полоса преимуществ, полный список ниже (с тем же макетом), отсутствие горизонтальной прокрутки и ошибок JavaScript.
   Отдельно: планшет и телефон (та же витрина «героем» на весь первый экран: все 10 подиумов без сдвига, стеклянные поиск/фильтры, плашка товара внизу сцены), prefers-reduced-motion (без пространственных анимаций), «лёгкий режим».
   Нужны Playwright и Chromium. Запуск: node tools/check-showroom.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const rd = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redesign.json'), 'utf8')).extras || {};
if (!rd.enabled || !rd.gallery || !rd.showroom) { console.log('Шоурум выключен в data/redesign.json (extras.showroom) — проверка пропущена.'); process.exit(0); }
const PR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8')), CT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const MIME = {'.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 320) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const count = f => PR.filter(f).length;
const EXP = {all: PR.length, sun: count(p => p.cat === 'sun'), face: count(p => p.cat === 'face'), heliocare: count(p => p.brand === 'heliocare'), acne: count(p => p.tasks.includes('acne')), cream: count(p => p.kind === 'cream'), feat: count(p => p.featured), pigment: count(p => p.tasks.includes('pigment'))};
const PAGE = 10;
const SLOTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'showroom', 'layers.json'), 'utf8')).anchors.slots; } catch (e) { return []; } })();
let base = '';

async function open(b, o, hooks) {
  const ctx = await b.newContext(Object.assign({deviceScaleFactor: 1, locale: 'ru-RU'}, o)); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error') p.errs.push('console: ' + m.text().slice(0, 160)); });
  await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
  if (hooks && hooks.before) await hooks.before(p, ctx);
  await p.goto(base + 'catalog.html' + ((hooks && hooks.query) || '')); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} }
  await p.waitForSelector('html.ready', {timeout: 25000}).catch(() => {}); await p.mouse.move(2, 2); await wait(1900); p.ctx = ctx; return p;
}
const st = p => p.evaluate(() => window.Astreya.showroom && window.Astreya.showroom.state());
const items = p => p.evaluate(() => [...document.querySelectorAll('.shw-it:not(.is-gone)')].map(e => e.getAttribute('data-id')));
const vis = p => p.evaluate(() => [...document.querySelectorAll('#cat-grid .pcard')].filter(c => !c.hidden).length);
const setSel = (p, id, v) => p.evaluate(([i, val]) => { const s = document.getElementById(i); s.value = val; s.dispatchEvent(new Event('change', {bubbles: true})); }, [id, v]);
const hv = async (p, sel) => { await p.evaluate(() => { if (window.scrollY > 0) window.scrollTo({top: 0, behavior: 'instant'}); }); await wait(120); const r = await p.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height * .55}; }, sel); await p.mouse.move(r.x, r.y, {steps: 4}); };
const hvTip = async (p, id) => { for (let k = 0; k < 4; k++) { await p.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'})); await wait(250); await hv(p, '.shw-it[data-id="' + id + '"]'); await wait(800); if (await p.evaluate(i => { const t = document.querySelector('.shw-tip'); return t._id === i && !t.hidden && t.classList.contains('is-on'); }, id)) return true; await p.mouse.move(2, 2); await wait(900); } return false; };
const overflowX = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const stellaReply = async (p, ms) => { const t0 = Date.now(); let last = '', same = 0; while (Date.now() - t0 < (ms || 16000)) { await wait(500); const t = await p.evaluate(() => { const m = [...document.querySelectorAll('.asst-bub')].filter(x => !x.closest('.asst-u')); return m.length > 1 ? m[m.length - 1].textContent.replace(/\s+/g, ' ').trim() : ''; }); if (t && t === last) { if (++same >= 2) return t; } else { last = t; same = 0; } } return last; };
const userMsgs = p => p.evaluate(() => [...document.querySelectorAll('.asst-u .asst-bub')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));

(async () => {
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});

  console.log('\n[компьютер 1440×900: сцена]');
  let p = await open(b, {viewport: {width: 1440, height: 900}});
  const S0 = await st(p);
  ok(S0 && S0.rendered && !S0.stack && S0.W === 1440, 'шоурум подключён и отрисован (режим «холст 1536×1024», масштаб ' + (S0 && S0.s.toFixed(3)) + ')', S0);
  const L = await p.evaluate(() => ({css: [...document.styleSheets].some(s => /showroom\.css/.test(s.href || '')), layers: ['shell', 'niche', 'ring', 'dais', 'plant'].filter(k => { const im = document.querySelector('.shw-world img.shw-ly[src*="layer-' + k + '"]'); return !im || !im.complete || !im.naturalWidth; }), h1: document.querySelector('.shw h1').textContent.trim(), grid: document.querySelectorAll('#cat-grid .pcard').length, bg: getComputedStyle(document.querySelector('.shw-room')).backgroundImage}));
  ok(L.css && L.layers.length === 0, 'слои сцены загружены: подложка (стена, арки, пол), ниша, арка, широкий низкий стол из травертина, растение — отдельные слои, не одна картинка', L.layers);
  ok(L.h1 === 'Каталог профессиональной косметики' && L.grid === EXP.all, 'заголовок страницы и полный список (' + L.grid + ' карточек) на месте', L);
  ok(L.bg === 'none', 'сцена не одна картинка-фон: у контейнера нет background-image', L.bg);
  const it0 = await items(p);
  ok(it0.length === Math.min(PAGE, EXP.all) && SLOTS.length === PAGE, 'на сцене ' + it0.length + ' товаров на ступенчатых подиумах одной экспозиции (мест в сцене: ' + SLOTS.length + ')', {it0, slots: SLOTS.length});
  const IMG = await p.evaluate(() => [...document.querySelectorAll('.shw-it .shw-img')].map(i => ({ok: i.complete && i.naturalWidth > 0, src: i.getAttribute('src'), h: Math.round(i.getBoundingClientRect().height)})));
  ok(IMG.length === it0.length && IMG.every(i => i.ok && /assets\/showroom\/pack-[a-z-]+\.webp(\?v=[0-9a-f]{8})?$/.test(i.src) && i.h > 40), '3D-макеты упаковки загружены у всех товаров сцены (' + IMG.length + ')', IMG.filter(i => !i.ok));
  const ST = await p.evaluate(sl => { const r = e => e.getBoundingClientRect(); const its = [...document.querySelectorAll('.shw-it:not(.is-bg)')]; const bad = [], used = new Set(); its.forEach(e => { const cx = parseFloat(e.style.left) + parseFloat(e.style.width) / 2, cb = parseFloat(e.style.top) + parseFloat(e.style.height), k = sl.findIndex(q => Math.abs(q.x - cx) < 1.5 && Math.abs(q.y - cb) < 1.5); if (k < 0) bad.push(e.getAttribute('data-id') + ': основание не в точке подиума (' + Math.round(cx) + ',' + Math.round(cb) + ')'); else if (used.has(k)) bad.push('два товара на месте ' + k); else used.add(k); }); return {bad, tops: Math.min(...its.map(i => r(i).top)), pills: r(document.querySelector('.shw-pills')).bottom}; }, SLOTS);
  ok(ST.bad.length === 0, 'каждый главный товар стоит на своём месте на подиуме: основание совпадает с точкой на запечённом подиуме, мест не делят', ST);
  const OV = p => p.evaluate(() => { const r = e => e.getBoundingClientRect(), hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5; const itEls = [...document.querySelectorAll('.shw-it:not(.is-bg):not(.is-gone)')], its = itEls.map(r), bad = [];
    its.forEach((it, i) => its.forEach((o, j) => { if (j > i) { const w = Math.min(it.right, o.right) - Math.max(it.left, o.left), nw = Math.min(it.width, o.width); if (w > 1.5 && Math.min(it.bottom, o.bottom) - Math.max(it.top, o.top) > 1.5 && w > nw * .45) bad.push('товары ' + i + ' и ' + j + ' перекрываются более чем наполовину'); } })); return {n: its.length, bad}; });
  const OV0 = await OV(p); ok(OV0.n === PAGE && OV0.bad.length === 0, 'на ПК товары на подиумах не закрывают друг друга (допустим лёгкий заход малого предмета за соседний — как в экспозиции образца)', OV0);
  const CMP = await p.evaluate(sl => { const its = [...document.querySelectorAll('.shw-it:not(.is-bg):not(.is-gone)')]; const hs = its.map(e => parseFloat(e.style.height)), pk = its.map(e => { const cb = parseFloat(e.style.top) + parseFloat(e.style.height); const q = sl.find(s => Math.abs(s.y - cb) < 1.5); return q ? q.pxcm : 0; }); return {maxH: Math.max(...hs), minH: Math.min(...hs), top: Math.min(...its.map(e => parseFloat(e.style.top))), scaleMin: Math.min(...pk), scaleMax: Math.max(...pk)}; }, SLOTS);
  ok(CMP.maxH <= 275 && CMP.maxH >= 170 && CMP.minH >= 70 && CMP.top >= 322 && CMP.scaleMax / CMP.scaleMin > 1.08, 'пропорции как на образце: упаковка 10–25 см (' + Math.round(CMP.minH) + '–' + Math.round(CMP.maxH) + ' px), перспектива — дальние предметы мельче ближних (' + CMP.scaleMin.toFixed(1) + '–' + CMP.scaleMax.toFixed(1) + ' px/см), верх композиции y=' + Math.round(CMP.top) + ' под заголовком', CMP);
  ok(ST.tops > ST.pills, 'упаковки не заезжают под заголовок и категории (верх упаковки ' + Math.round(ST.tops) + ' > низ «пилюль» ' + Math.round(ST.pills) + ')', ST);
  const tx = await p.evaluate(() => { const hdr = document.querySelector('.hdr'), cs = getComputedStyle(hdr); return {top: document.documentElement.classList.contains('shw-top'), bg: cs.backgroundColor, room: document.querySelector('.shw-room').getBoundingClientRect().top}; });
  ok(tx.top && /rgba\(0, 0, 0, 0\)|transparent/.test(tx.bg) && tx.room < 5, 'шапка над сценой прозрачная (' + tx.bg + '), сцена начинается у верхнего края', tx);
  await p.evaluate(() => window.scrollTo(0, 700)); await wait(900);
  const tx2 = await p.evaluate(() => ({top: document.documentElement.classList.contains('shw-top'), bg: getComputedStyle(document.querySelector('.hdr')).backgroundColor}));
  ok(!tx2.top && !/rgba\(0, 0, 0, 0\)|transparent/.test(tx2.bg), 'при прокрутке шапка снова привычная молочная (' + tx2.bg + ')', tx2);
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(700);
  ok(await overflowX(p) <= 1, 'горизонтальной прокрутки нет');
  const flt = await p.evaluate(() => ({aside: !!document.querySelector('.shw-aside #cat-q'), sels: ['f-brand', 'f-cat', 'f-task', 'f-kind', 'f-sort'].every(i => document.getElementById(i)), pop: document.querySelectorAll('.shw-pc').length, adv: document.querySelectorAll('.shw-av').length, help: !!document.querySelector('.shw-help[data-act="gal-help"]')}));
  ok(flt.aside && flt.sels && flt.pop === EXP.feat && flt.adv === 3 && flt.help, 'панель слева (поиск, 5 списков), «Рекомендуем» (' + flt.pop + ' = «в подборке»), 3 преимущества, «Помочь с подбором»', flt);

  console.log('\n[фильтры слева, категории, поиск, сортировка]');
  await p.click('.shw-o[data-key="brand"][data-v="heliocare"]'); await wait(1500);
  ok(await p.evaluate(() => document.getElementById('f-brand').value) === 'heliocare' && await vis(p) === EXP.heliocare && (await items(p)).length === EXP.heliocare, 'галочка «Heliocare» ↔ select, найдено ' + EXP.heliocare + ', на сцене столько же', await items(p));
  const aria = await p.evaluate(() => document.querySelector('.shw-o[data-key="brand"][data-v="heliocare"]').getAttribute('aria-pressed'));
  ok(aria === 'true', 'галочка отмечена (aria-pressed)');
  await p.click('.shw-o[data-key="brand"][data-v="heliocare"]'); await wait(1300);
  ok(await vis(p) === EXP.all && (await items(p)).length === PAGE, 'повторный клик снимает фильтр: снова все товары, на сцене ' + PAGE);
  await p.click('.cat-tile[data-id="sun"]'); await wait(1600);
  const SS = await st(p);
  ok(await vis(p) === EXP.sun && SS.pageIds.length === EXP.sun && await p.evaluate(() => document.querySelector('.cat-tile[data-id="sun"]').getAttribute('aria-pressed')) === 'true', 'категория «Фотозащита»: ' + EXP.sun + ' товара, пилюля нажата', SS);
  ok(await p.evaluate(() => document.querySelector('.shw-all').getAttribute('aria-pressed')) === 'false', 'пилюля «Все» снята');
  const hh1 = (await st(p)).pageIds.join();
  await p.click('.cat-tile[data-id="face"]'); await wait(1600);
  const hh2 = (await st(p)).pageIds.join();
  ok(hh1 !== hh2 && (await items(p)).length === Math.min(PAGE, EXP.face), 'при смене категории экспозиция перестраивается: товары заменены, подиумы остаются', {hh1, hh2});
  const OV2 = await OV(p); ok(OV2.n >= 4 && OV2.bad.length === 0, 'в категории «Эстетика лица» товары по-прежнему не закрывают друг друга', OV2);
  await p.click('.cat-tile[data-id="sun"]'); await wait(1600); const OV3 = await OV(p); ok(OV3.n === EXP.sun && OV3.bad.length === 0, 'в «Фотозащите» (' + EXP.sun + ' товара) наложений нет', OV3);
  await p.click('.shw-all'); await wait(1400); ok(await vis(p) === EXP.all, 'пилюля «Все» возвращает весь каталог');
  const anim = await p.evaluate(() => document.querySelector('.shw-stage').getAnimations({subtree: true}).filter(a => a.playState === 'running').length); await wait(900);
  ok(await p.evaluate(() => document.querySelector('.shw-stage').getAnimations({subtree: true}).filter(a => a.playState === 'running').length) === 0, 'анимации перестройки закончились, ничего не «висит» (были: ' + anim + ')');
  await p.fill('#cat-q', 'spf'); await wait(1500);
  const sp = await items(p);
  ok(sp.length > 0 && sp.length === await vis(p), 'поиск «spf»: на сцене ' + sp.length + ' = в списке ' + await vis(p));
  await p.fill('#cat-q', 'zzzqqq'); await wait(1300);
  ok((await items(p)).length === 0 && await p.evaluate(() => !document.querySelector('[data-shw-empty]').hidden && !document.getElementById('cat-empty').hidden), 'ничего не найдено: сцена пуста, видно сообщение и «Сбросить фильтры»');
  await p.click('.shw-empty [data-act="cat-reset"]'); await wait(1500);
  ok(await vis(p) === EXP.all && (await items(p)).length === PAGE && await p.evaluate(() => document.getElementById('cat-q').value) === '', 'сброс возвращает каталог и пустое поле поиска');
  await setSel(p, 'f-sort', 'az'); await wait(1400);
  const az = await st(p), names = await p.evaluate(() => [...document.querySelectorAll('#cat-grid .pcard:not([hidden])')].slice(0, 10).map(c => c.getAttribute('data-id')));
  ok(JSON.stringify(az.pageIds) === JSON.stringify(names), 'сортировка «А–Я»: порядок на сцене совпадает с порядком в списке', az.pageIds);
  await setSel(p, 'f-sort', 'def'); await wait(900);

  console.log('\n[листание, наведение, выбор]');
  const pg = await p.evaluate(() => ({vis: !document.querySelector('[data-shw-pager]').hidden, txt: document.querySelector('[data-shw-pg]').textContent.trim(), prev: document.querySelector('.shw-pager .prev').disabled, next: document.querySelector('.shw-pager .next').disabled}));
  ok(pg.vis && pg.prev && !pg.next && /1 \/ 3/.test(pg.txt), 'листание: «' + pg.txt + '», «назад» отключена на первой странице', pg);
  const idsP1 = (await st(p)).pageIds; await p.click('.shw-pager .next'); await wait(1400);
  const p2 = await st(p);
  ok(p2.page === 1 && p2.pageIds.length === PAGE && p2.pageIds.every(id => idsP1.indexOf(id) < 0) && JSON.stringify((await items(p)).slice().sort()) === JSON.stringify(p2.pageIds.slice().sort()), 'страница 2: другие ' + PAGE + ' товаров, ни один не потерян', p2);
  await p.click('.shw-pager .next'); await wait(1300); const p3 = await st(p); ok(p3.page === 2 && p3.pageIds.length === EXP.all - 2 * PAGE && await p.evaluate(() => document.querySelector('.shw-pager .next').disabled), 'последняя страница: ' + p3.pageIds.length + ' товаров, «вперёд» отключена', p3);
  const seen = new Set([...idsP1, ...p2.pageIds, ...p3.pageIds]); ok(seen.size === EXP.all, 'за три страницы показаны все ' + EXP.all + ' товаров', seen.size);
  await p.click('.shw-pager .prev'); await p.click('.shw-pager .prev'); await wait(1400);
  const hid = (await st(p)).pageIds[2], sel = '.shw-it[data-id="' + hid + '"]';
  await p.hover(sel); await wait(900);
  const H = await p.evaluate(s => { const e = document.querySelector(s), ph = e.querySelector('.shw-ph'), cs = getComputedStyle(ph), gl = getComputedStyle(e.querySelector('.shw-gl')), m = /matrix\(([-\d.]+)/.exec(cs.transform), others = [...document.querySelectorAll('.shw-it:not(.is-gone)')].filter(x => x !== e).map(x => +getComputedStyle(x).opacity); return {tr: cs.transform, zoom: m ? +m[1] : 1, gl: gl.opacity, dim: Math.max(...others), pods: document.querySelectorAll('.shw-pd.is-lit').length, hasPod: document.querySelectorAll('.shw-pd[data-for="' + e.getAttribute('data-id') + '"]').length, label: !!e.querySelector('.shw-nm'), z: getComputedStyle(e).zIndex, card: document.querySelector('.shw-card .c-t') && document.querySelector('.shw-card .c-t').textContent}; }, sel);
  ok(H.zoom > 1.04 && H.zoom < 1.1 && +H.gl > .9 && H.dim < .85 && H.dim > .5 && H.z === '60' && !H.label, 'наведение: товар выходит вперёд (z-index 60), приподнимается и увеличивается мягко (×' + H.zoom.toFixed(2) + ', 5–8 %), под ним включается свет; остальные теряют акцент (' + H.dim + '); подписи на предмете нет', H);
  const pname = PR.find(x => x.id === hid).name, pbrand = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brands.json'), 'utf8')).find(b => b.id === PR.find(x => x.id === hid).brand) || {}).name;
  const TIP = await p.evaluate(s => { const t = document.querySelector('.shw-tip'), r = e => e.getBoundingClientRect(), tr = r(t), ir = r(document.querySelector(s)), pop = document.querySelector('.shw-pop'); return {on: t.classList.contains('is-on') && !t.hidden && +getComputedStyle(t).opacity > .9, name: (t.querySelector('.t-n') || {}).textContent, brand: (t.querySelector('.t-br') || {}).textContent, d: ((t.querySelector('.t-d') || {}).textContent || '').length, acts: [...t.querySelectorAll('.t-act [data-act]')].map(b => b.getAttribute('data-act')), overlap: !(tr.right < ir.left || tr.left > ir.right || tr.bottom < ir.top || tr.top > ir.bottom), fits: pop ? tr.bottom <= r(pop).top + 2 : true, price: /₽|руб|скидк|\d\s?%/i.test(t.textContent), card: !document.querySelector('.shw-card') || document.querySelector('.shw-card').hidden || document.querySelector('.shw-card').classList.contains('is-idle')}; }, sel);
  ok(TIP.on && TIP.name === pname && TIP.brand === pbrand && TIP.d > 10 && TIP.acts.length === 3 && ['fav-toggle', 'cmp-toggle', 'qv-open'].every(a => TIP.acts.indexOf(a) >= 0), 'наведение: рядом проявляется полупрозрачная панель — название «' + pname + '», бренд, краткое описание и три действия (избранное, сравнение, подробнее)', TIP);
  ok(!TIP.overlap && TIP.fits && !TIP.price && TIP.card, 'панель не закрывает товар, целиком над рядом «Рекомендуем», без цен и скидок; боковая карточка при наведении не показывается', TIP);
  await p.mouse.move(2, 2); await wait(1600);
  ok(await p.evaluate(() => document.querySelector('.shw-card').hidden && document.querySelector('.shw-tip').hidden && !document.querySelector('.shw').classList.contains('has-sel') && document.querySelectorAll('.shw-it.is-hov').length === 0 && getComputedStyle(document.querySelector('.shw-it')).opacity === '1'), 'панель появляется только при наведении на предмет и плавно пропадает, когда курсор уходит: подсветка снята, остальные товары возвращают яркость');
  await p.click(sel); await wait(1500);
  const SEL = await p.evaluate(s => { const dims = [...document.querySelectorAll('.shw-it')].filter(e => !e.matches(s)).map(e => +getComputedStyle(e).opacity), c = document.querySelector('.shw-card'), cr = c.getBoundingClientRect(), ir = document.querySelector(s).getBoundingClientRect(); return {has: document.querySelector('.shw').classList.contains('has-sel'), pressed: document.querySelector(s).getAttribute('aria-pressed'), maxDim: Math.max(...dims), open: c.classList.contains('is-open'), links: [...c.querySelectorAll('a[href]')].map(a => a.getAttribute('href')), btns: [...c.querySelectorAll('[data-act]')].map(b => b.getAttribute('data-act')), overlap: !(cr.right < ir.left || cr.left > ir.right || cr.bottom < ir.top || cr.top > ir.bottom), head: getComputedStyle(document.querySelector('.shw-head')).opacity, veil: +getComputedStyle(document.querySelector('.shw-veil')).opacity, vbg: (m => m ? (+m[1] + +m[2] + +m[3]) / 3 / 255 : 1)(/rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(document.querySelector('.shw-veil')).backgroundColor)), z: getComputedStyle(document.querySelector(s)).zIndex, zoom: (/matrix\(([-\d.]+)/.exec(getComputedStyle(document.querySelector(s + ' .shw-ph')).transform) || [0, 1])[1], line: !!document.querySelector('.shw-link')}; }, sel);
  ok(SEL.has && SEL.pressed === 'true' && SEL.veil > .9 && SEL.vbg < .5 && SEL.z === '70' && +SEL.zoom > 1.05, 'выбор: товар выходит вперёд над сценой (z-index 70, ×' + (+SEL.zoom).toFixed(2) + ' и приближение камеры, aria-pressed), сцена слегка затемнена тёплой вуалью (тёмная, не светлая) — соседи не прозрачные', SEL);
  const frozen = async () => p.evaluate(() => [...document.querySelectorAll('.shw-it')].map(e => getComputedStyle(e.querySelector('.shw-ph')).transform + getComputedStyle(e).zIndex).join('|'));
  const f0 = await frozen(), oid = (await st(p)).pageIds.find(x => x !== hid);
  await hv(p, '.shw-it[data-id="' + oid + '"]'); await wait(900);
  ok(f0 === await frozen() && await p.evaluate(() => document.querySelectorAll('.shw-it.is-hov').length) === 0 && await p.evaluate(() => document.querySelector('.shw-card .c-t').textContent) === PR.find(x => x.id === hid).name, 'пока открыта карточка товара, наведение на другие предметы ничего не двигает и не меняет карточку', f0);
  await p.mouse.move(2, 2); await wait(400);
  ok(SEL.open && !SEL.overlap && !SEL.line && +SEL.head < .1, 'карточка раскрыта у товара, не закрывает его, линии-указателя от товара к плашке нет; заголовок убран', SEL);
  const slug = PR.find(x => x.id === hid).slug; ok(SEL.links.some(h => h.endsWith('products/' + slug + '.html')) && ['form', 'qv-stella', 'shw-close', 'fav-toggle', 'cmp-toggle'].every(a => SEL.btns.indexOf(a) >= 0), 'в карточке «Подробнее» ведёт на страницу товара; есть «В избранное», «Сравнить», «Запросить», «Помочь с подбором», «Закрыть»', SEL);
  await p.keyboard.press('Escape'); await wait(1200);
  ok(await p.evaluate(() => !document.querySelector('.shw').classList.contains('has-sel') && document.querySelectorAll('.shw-it.is-sel').length === 0), 'Esc снимает выбор');
  await p.mouse.move(2, 2); await wait(500);
  await p.mouse.move(2, 2); await wait(300);
  await p.keyboard.press('Escape'); await wait(900); await p.mouse.move(2, 2);
  await p.click(sel); await wait(900); await p.click('.shw-card .c-x'); await wait(900); ok(await p.evaluate(() => !document.querySelector('.shw').classList.contains('has-sel')), 'крестик в карточке снимает выбор');
  await p.click(sel); await wait(900); let EMPTY = null; await p.evaluate(() => window.scrollTo(0, 0)); await wait(400); for (let tr = 0; tr < 6 && !EMPTY; tr++) { EMPTY = await p.evaluate(() => { for (let y = 380; y < 640; y += 20) for (let x = 340; x < 1240; x += 20) { const e = document.elementFromPoint(x, y); if (e && e.closest('.shw-view') && !e.closest('.shw-it,.shw-pd,.shw-card,.shw-pan,.shw-pager,.shw-link,.shw-tip,.shw-pills,button,a')) return [x, y]; } return null; }); if (!EMPTY) await wait(500); } /* камера и карточка ещё могут доезжать: пустую точку сцены ищем с повтором */ await p.mouse.click(EMPTY[0], EMPTY[1]); await wait(900); ok(await p.evaluate(() => !document.querySelector('.shw').classList.contains('has-sel')), 'клик по пустому месту сцены снимает выбор');
  await p.click(sel); await wait(1000); await p.click('.shw-card [data-act="form"]'); await wait(900);
  const F = await p.evaluate(() => ({open: document.querySelector('#modal').classList.contains('open'), t: (document.querySelector('#modal') || {}).textContent.slice(0, 160)}));
  ok(F.open, '«Запросить» открывает форму заявки на товар', F); await p.keyboard.press('Escape'); await wait(700);
  await p.click(sel).catch(() => {}); await wait(900);
  if (!await p.evaluate(() => document.querySelector('.shw').classList.contains('has-sel'))) { await p.click(sel); await wait(900); }
  await p.keyboard.press('Escape'); await wait(1200); await p.mouse.move(2, 2); await wait(900); await hv(p, sel); await wait(1100); await p.click('.shw-tip [data-act="qv-open"]'); await wait(1200);
  const Q = await p.evaluate(() => ({open: document.querySelector('#modal').classList.contains('open'), art: !!document.querySelector('.qv-art .art-render img'), ask: !!document.querySelector('[data-act="qv-ask"]'), help: !!document.querySelector('[data-act="qv-stella"]')}));
  ok(Q.open && Q.art && Q.ask && Q.help, 'быстрый просмотр открывается «глазом» панели при наведении, упаковка — тот же 3D-макет', Q); await p.keyboard.press('Escape'); await wait(800);
  await p.click(sel); await wait(900); if (!await p.evaluate(() => document.querySelector('.shw-card').classList.contains('is-open'))) { await p.click(sel); await wait(900); }
  await p.click('.shw-card [data-act="qv-stella"]'); const rep = await stellaReply(p, 20000); const um = await userMsgs(p);
  ok(um.length > 0 && /Помоги с подбором/.test(um[um.length - 1]) && rep.length > 30, 'Стелла: передан товар «' + pname + '», получен ответ (' + rep.slice(0, 50) + '…)', {um: um.slice(-1), rep: rep.slice(0, 80)});
  await p.evaluate(() => window.Astreya.stella.close(true)); await wait(600);
  ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  console.log('\n[галерея: планировка, ниши, камера, смена экспозиций, избранное, сравнение, полки]');
  p = await open(b, {viewport: {width: 1440, height: 900}});
  await p.evaluate(() => { window.__keep = 7; try { localStorage.removeItem('astreya:fav'); localStorage.removeItem('astreya:cmp'); } catch (e) {} });
  const WL0 = await p.evaluate(() => document.querySelectorAll('.shw-world img.shw-ly').length);
  ok(WL0 >= 4 && await p.evaluate(() => document.querySelectorAll('.shw-arc,.shw-rim,.shw-sun').length) === 0, 'фон — прежний слоёный 3D-зал (' + WL0 + ' слоёв), без «узоров»: нет колец-ниш вокруг товаров и лучей света поверх сцены');
  await p.mouse.move(1000, 300, {steps: 4}); await wait(500);
  const PXD = await p.evaluate(() => { const tx = k => parseFloat((getComputedStyle(document.querySelector('.shw-ly-' + k)).translate || '0').split(' ')[0]) || 0; return {px: +document.querySelector('.shw-view').style.getPropertyValue('--px'), shell: tx('shell'), dais: tx('dais'), plant: tx('plant'), stage: parseFloat((getComputedStyle(document.querySelector('.shw-stage')).translate || '0').split(' ')[0]) || 0}; });
  ok(Math.abs(PXD.px) > .05 && Math.abs(PXD.plant) > Math.abs(PXD.dais) * 1.5 && Math.abs(PXD.dais) > Math.abs(PXD.shell) * 2 && Math.abs(PXD.stage - PXD.dais) < .05, 'параллакс по глубине: дальний слой (стена) сдвигается меньше, ближний (ваза с веткой) — больше; подиумы и товары — на одну величину (товар не съезжает с подиума)', PXD);
  const hid2 = (await st(p)).pageIds[4], sel2 = '.shw-it[data-id="' + hid2 + '"]';
  const r0 = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width}; }, sel2);
  await p.mouse.move(2, 2); await wait(1200);
  const rA = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width}; }, sel2);
  const cam0 = await p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.shw-stage')).transform).a);
  await p.click(sel2); await wait(1950);
  const CAM = await p.evaluate(s => { const m = new DOMMatrix(getComputedStyle(document.querySelector('.shw-stage')).transform), w = new DOMMatrix(getComputedStyle(document.querySelector('.shw-ly-dais')).transform), sh = new DOMMatrix(getComputedStyle(document.querySelector('.shw-ly-shell')).transform), pl = new DOMMatrix(getComputedStyle(document.querySelector('.shw-ly-plant')).transform), it = document.querySelector(s).getBoundingClientRect(), vw = document.querySelector('.shw-view').getBoundingClientRect(), c = document.querySelector('.shw-card'); return {k: m.a, kw: w.a, ksh: sh.a, kpl: pl.a, cx: (it.left + it.width / 2 - vw.left) / vw.width, veil: +getComputedStyle(document.querySelector('.shw-veil')).opacity, card: c.classList.contains('is-open') && !c.hidden, noFav: !c.querySelector('.c-fav') ? 'нет' : 'есть', price: /₽|руб|скидк|\d\s?%/i.test(c.textContent), x: !!c.querySelector('.c-x'), more: c.textContent.length, photos: c.querySelectorAll('img').length}; }, sel2);
  ok(cam0 === 1 && CAM.k > 1.25 && CAM.k < 1.35 && Math.abs(CAM.kw - CAM.k) < .01 && CAM.ksh > 1.05 && CAM.ksh < CAM.k - .08 && CAM.kpl > CAM.k + .05 && CAM.cx > .3 && CAM.cx < .7 && CAM.veil > .9, 'выбор: «камера» подъезжает по глубине — подиумы и товары ×' + CAM.k.toFixed(2) + ', дальняя стена только ×' + CAM.ksh.toFixed(2) + ', ближняя ваза ×' + CAM.kpl.toFixed(2) + '; товар встаёт в центр, остальное затемнено', CAM);
  ok(CAM.card && CAM.noFav === 'есть' && CAM.x && !CAM.price && CAM.photos === 0, 'раскрывается стеклянная информационная область: избранное, сравнение, «Закрыть»; цен нет, переключения и зума фотографий нет (в карточке нет изображений)', CAM);
  await wait(3200);
  await p.click('.shw-card .c-x'); await wait(1900);
  const BACK = await p.evaluate(s => { const m = new DOMMatrix(getComputedStyle(document.querySelector('.shw-stage')).transform), r = document.querySelector(s).getBoundingClientRect(); return {k: m.a, x: r.x, y: r.y, w: r.width, cz: document.querySelector('.shw-view').style.getPropertyValue('--cz'), sel: document.querySelectorAll('.shw-it.is-sel,.shw-pd.is-sel').length, veil: +getComputedStyle(document.querySelector('.shw-veil')).opacity}; }, sel2);
  ok(Math.abs(BACK.k - 1) < .01 && BACK.cz === '' && BACK.sel === 0 && BACK.veil < .05 && Math.abs(BACK.x - rA.x) < 3 && Math.abs(BACK.y - rA.y) < 3 && Math.abs(BACK.w - rA.w) < 1.5, 'после закрытия камера и товар плавно возвращаются на место (смещение ' + Math.hypot(BACK.x - rA.x, BACK.y - rA.y).toFixed(1) + ' px), вуаль снята', {BACK, rA});

  /* выбранный товар неподвижен: вращения нет (убрано по просьбе заказчика) — ни слоя оборота, ни подсказки «потяните» */
  await p.mouse.move(2, 2); await wait(600); await p.click(sel2); await wait(1800);
  const NOSP = await p.evaluate(s => { const it = document.querySelector(s); return {sp: !!it.querySelector('.shw-spin'), cls: it.classList.contains('is-spin'), img: getComputedStyle(it.querySelector('.shw-img')).opacity, sel: it.classList.contains('is-sel')}; }, sel2);
  ok(NOSP.sel && !NOSP.sp && !NOSP.cls && NOSP.img === '1', 'выбранный товар не вращается: нет слоя оборота и подсказки «потяните», картинка упаковки на месте');
  await p.click('.shw-card .c-x'); await wait(1900);

  /* смена экспозиций: фон остаётся целым, страница не перезагружается, акцент света меняется */
  const catA = CT.cats[0].id, catB = CT.cats[1].id;
  const toneOf = () => p.evaluate(() => { const w = document.querySelector('.shw-world'), v = document.querySelector('.shw-view'); return {filter: getComputedStyle(w).filter, bg: getComputedStyle(v).backgroundColor, light: document.querySelector('.shw').getAttribute('data-light')}; });
  const t0 = await toneOf();
  await p.click('.cat-tile[data-id="' + catA + '"]'); await wait(1700); const t1 = await toneOf(); const w1 = await p.evaluate(() => ({keep: window.__keep, world: document.querySelectorAll('.shw-world img.shw-ly').length, ids: document.querySelectorAll('.shw-it:not(.is-gone)').length, gone: document.querySelectorAll('.shw-it.is-gone').length}));
  await p.click('.cat-tile[data-id="' + catB + '"]'); await wait(1700); const t2 = await toneOf();
  await p.click('.shw-all'); await wait(1700); const t3 = await toneOf();
  ok([t1, t2, t3].every(t => t.filter === 'none' && t.bg === t0.bg && t.light === null) && t0.filter === 'none', 'при выборе категории и фильтра цвет и свет фона не меняются: у сцены нет сдвига тона (filter none), цвет подложки прежний', [t0, t1, t2, t3]);
  ok(w1.keep === 7 && w1.world === WL0 && w1.gone === 0, 'экспозиции: страница не перезагружалась, архитектурный фон цел (' + w1.world + ' слоёв), ушедшие товары убраны', w1);

  /* избранное и сравнение: панель при наведении, раскрытая карточка, фильтр «Только избранное» */
  const favBtn0 = await p.evaluate(() => ({pressed: document.querySelector('.shw-favs').getAttribute('aria-pressed'), n: document.querySelector('[data-shw-favn]').textContent}));
  await p.click('.shw-favs'); await wait(500);
  ok(favBtn0.pressed === 'false' && favBtn0.n === '0' && await p.evaluate(() => document.querySelector('.shw-favs').getAttribute('aria-pressed')) === 'false', '«Только избранное» при пустом избранном ничего не прячет', favBtn0);
  const ids10 = (await st(p)).pageIds, fa = ids10[1], fb = ids10[5];
  await hvTip(p, fa); await p.click('.shw-tip [data-act="fav-toggle"]'); await wait(500);
  const FV1 = await p.evaluate(a => ({ls: JSON.parse(localStorage.getItem('astreya:fav') || '[]'), n: document.querySelector('[data-shw-favn]').textContent, tip: document.querySelector('.shw-tip [data-act="fav-toggle"]').getAttribute('aria-pressed'), has: document.querySelector('.shw-favs').classList.contains('has')}), fa);
  ok(FV1.ls.length === 1 && FV1.ls[0] === fa && FV1.n === '1' && FV1.tip === 'true' && FV1.has, 'избранное: сердечко в панели добавляет товар (хранится в браузере), счётчик в левой панели = 1', FV1);
  await p.mouse.move(2, 2); await wait(700); await p.click('.shw-it[data-id="' + fb + '"]'); await wait(1400);
  await p.evaluate(() => document.querySelector('.shw-card .c-fav').click()); await wait(500);
  const FV2 = await p.evaluate(() => ({ls: JSON.parse(localStorage.getItem('astreya:fav') || '[]'), n: document.querySelector('[data-shw-favn]').textContent}));
  ok(FV2.ls.length === 2 && FV2.n === '2', 'избранное: кнопка «В избранное» в раскрытой карточке тоже работает (счётчик = 2)', FV2);
  await p.keyboard.press('Escape'); await wait(1300); await p.mouse.move(2, 2); await wait(300);
  await p.click('.shw-favs'); await wait(2600);
  const FV3 = await p.evaluate(() => ({on: document.querySelector('.shw-favs').getAttribute('aria-pressed'), ids: [...document.querySelectorAll('.shw-it:not(.is-gone)')].map(e => e.getAttribute('data-id'))}));
  ok(FV3.on === 'true' && FV3.ids.length === 2 && FV3.ids.indexOf(fa) >= 0 && FV3.ids.indexOf(fb) >= 0, 'фильтр «Только избранное»: в экспозиции остаются только отмеченные товары (' + FV3.ids.length + ')', FV3);
  await p.click('.shw-favs'); await wait(2800);
  ok((await items(p)).length === PAGE, 'повторное нажатие возвращает всю экспозицию');
  await hvTip(p, fa); await p.click('.shw-tip [data-act="fav-toggle"]'); await wait(400);
  await p.mouse.move(2, 2); await wait(600); await hvTip(p, fb); await p.click('.shw-tip [data-act="fav-toggle"]'); await wait(400);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('astreya:fav') || '[]').length) === 0, 'повторное нажатие на сердечко убирает товар из избранного');
  await p.mouse.move(2, 2); await wait(600); await hvTip(p, fa); await p.click('.shw-tip [data-act="cmp-toggle"]'); await wait(500);
  const CM1 = await p.evaluate(a => ({ls: JSON.parse(localStorage.getItem('astreya:cmp') || '[]'), tip: document.querySelector('.shw-tip [data-act="cmp-toggle"]').getAttribute('aria-pressed'), bar: !document.querySelector('.cmp-bar, [data-cmp-bar]') || true}), fa);
  ok(CM1.ls.length === 1 && CM1.ls[0] === fa && CM1.tip === 'true', 'сравнение: кнопка в панели при наведении добавляет товар в общий список сравнения сайта', CM1);
  await p.click('.shw-tip [data-act="cmp-toggle"]'); await wait(400);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('astreya:cmp') || '[]').length) === 0, 'сравнение: повторное нажатие убирает товар');

  /* «Рекомендуем»: полки с нишами и цоколями разной высоты */
  await p.mouse.move(2, 2); await wait(500);
  const POP = await p.evaluate(() => { const cs = [...document.querySelectorAll('.shw-pop-t .shw-pc')]; return {n: cs.length, niches: cs.filter(c => c.querySelector('.pc-niche') && c.querySelector('.pc-pl')).length, kinds: new Set(cs.map(c => c.getAttribute('data-nk'))).size, heights: new Set(cs.map(c => Math.round(c.querySelector('.pc-pl').getBoundingClientRect().height))).size, flat: cs.every(c => { const s = getComputedStyle(c); return s.backgroundImage === 'none' && s.boxShadow === 'none' && parseFloat(s.borderTopWidth) === 0; }), acts: cs.every(c => c.querySelectorAll('.shw-pc-ac [data-act], .shw-pc-ac a[href]').length === 3), price: /₽|руб|скидк|\d\s?%/i.test(document.querySelector('.shw-pop').textContent)}; });
  ok(POP.n === EXP.feat && POP.niches === POP.n && POP.kinds >= 3 && POP.heights >= 3 && POP.flat && POP.acts && !POP.price, '«Рекомендуем»: не сетка прямоугольных карточек, а полки — малые ниши (видов ' + POP.kinds + ') на цоколях разной высоты (' + POP.heights + ' высот), у каждого три действия, цен нет', POP);
  await hv(p, '.shw-pop-t .shw-pc:nth-child(2) .shw-pc-art'); await wait(1100);
  const PH2 = await p.evaluate(() => { const c = document.querySelector('.shw-pop-t .shw-pc:nth-child(2)'), im = new DOMMatrix(getComputedStyle(c.querySelector('.shw-pc-img')).transform), ac = getComputedStyle(c.querySelector('.shw-pc-ac')), others = [...document.querySelectorAll('.shw-pop-t .shw-pc')].filter(x => x !== c).map(x => +getComputedStyle(x).opacity); return {zoom: im.a, ac: +ac.opacity, dim: Math.max(...others), glow: +getComputedStyle(c.querySelector('.pc-glow')).opacity}; });
  ok(PH2.zoom > 1.04 && PH2.zoom < 1.1 && PH2.ac > .9 && PH2.dim < .85 && PH2.glow > .9, 'полка при наведении: товар ×' + PH2.zoom.toFixed(2) + ', ниша светлеет, проявляются действия, соседние полки отступают', PH2);
  await p.click('.shw-pop-t .shw-pc:nth-child(2) .shw-pc-ac [data-act="fav-toggle"]'); await wait(500);
  const PF = await p.evaluate(() => JSON.parse(localStorage.getItem('astreya:fav') || '[]'));
  ok(PF.length === 1, 'полка: сердечко добавляет товар в избранное', PF);
  await p.click('.shw-pop-t .shw-pc:nth-child(2) .shw-pc-ac [data-act="fav-toggle"]'); await wait(300);
  await p.click('.shw-pop-t .shw-pc:nth-child(2) .shw-pc-ac [data-act="qv-open"]'); await wait(1200);
  ok(await p.evaluate(() => document.querySelector('#modal').classList.contains('open')), 'полка: «глаз» открывает быстрый просмотр'); await p.keyboard.press('Escape'); await wait(700);
  ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  /* «меньше движения» и «лёгкий» режим: без камеры и параллакса; всё остальное работает */
  p = await open(b, {viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const hr = (await st(p)).pageIds[3];
  await hv(p, '.shw-it[data-id="' + hr + '"]'); await wait(800); const tipOn = await p.evaluate(() => document.querySelector('.shw-tip').classList.contains('is-on'));
  await p.click('.shw-it[data-id="' + hr + '"]'); await wait(1200);
  const RMD = await p.evaluate(() => ({cz: document.querySelector('.shw-view').style.getPropertyValue('--cz'), k: new DOMMatrix(getComputedStyle(document.querySelector('.shw-stage')).transform).a, open: document.querySelector('.shw-card').classList.contains('is-open'), sel: document.querySelectorAll('.shw-it.is-sel').length}));
  ok(tipOn && RMD.cz === '' && RMD.k === 1 && RMD.open && RMD.sel === 1, 'при «меньше движения»: панель и карточка работают, но камеры нет — сцена стоит на месте', RMD);
  await p.keyboard.press('Escape'); await wait(500);
  await p.evaluate(() => document.documentElement.classList.add('lite')); await wait(200);
  await p.click('.shw-it[data-id="' + hr + '"]'); await wait(900);
  const LT = await p.evaluate(() => ({cz: document.querySelector('.shw-view').style.getPropertyValue('--cz'), open: document.querySelector('.shw-card').classList.contains('is-open')}));
  ok(LT.cz === '' && LT.open, 'в «лёгком» режиме: без камеры, карточка открывается', LT);
  ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  console.log('\n[«Рекомендуем» и полный список]');
  p = await open(b, {viewport: {width: 1440, height: 900}});
  const pops = await p.evaluate(() => { const t = document.querySelector('.shw-pop-t'); return {n: t.children.length, scroll: t.scrollWidth > t.clientWidth, imgs: [...t.querySelectorAll('img')].every(i => i.complete ? i.naturalWidth > 0 : true), links: [...t.querySelectorAll('h3 a')].every(a => /products\/.+\.html$/.test(a.getAttribute('href'))), ask: t.querySelectorAll('[data-act="form"]').length}; });
  ok(pops.n === EXP.feat && pops.links && pops.ask === EXP.feat, '«Рекомендуем»: ' + pops.n + ' карточек, ссылки на страницы товаров и «Запросить»', pops);
  if (pops.scroll) { await p.click('.shw-pop-w .next'); await wait(900); ok(await p.evaluate(() => document.querySelector('.shw-pop-t').scrollLeft > 50 && !document.querySelector('.shw-pop-w .prev').disabled), 'стрелка «вперёд» прокручивает ряд, «назад» оживает'); }
  const FOC = await p.evaluate(() => { const d = document.querySelector('[data-shw-list]'), r = e => e.getBoundingClientRect(); return {closed: !!d && !d.open, hid: r(document.querySelector('#cat-grid')).height === 0, glass: ['.shw-aside .shw-panel', '.shw-pop'].map(s => /glass\.webp/.test(getComputedStyle(document.querySelector(s)).backgroundImage)), bg: document.querySelectorAll('.shw-it.is-bg').length, adv: !!document.querySelector('.shw-rest .shw-adv'), tasks: document.querySelectorAll('.shw-task').length, dirs: document.querySelectorAll('.shw-dir').length, brands: document.querySelectorAll('.shw-brand').length}; });
  ok(FOC.closed, 'нижний каталог убран: «Весь ассортимент списком» свёрнут, фокус на витрине', FOC);
  ok(FOC.glass.every(Boolean) && FOC.bg === 0 && FOC.adv, 'левая панель и «Рекомендуем» — матовое стекло (размытая копия сцены), на заднем плане предметов нет, полоса преимуществ — под витриной', FOC);
  ok(FOC.tasks === CT.tasks.length && FOC.dirs === CT.cats.length && FOC.brands === JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brands.json'), 'utf8')).length, 'под витриной: «Подберите по задаче» (' + FOC.tasks + '), «Коллекции» (' + FOC.dirs + '), «Бренды» (' + FOC.brands + ') — из данных каталога', FOC);
  await p.click('.shw-task[data-id="pigment"]'); await wait(1700);
  const TK = await p.evaluate(() => ({sel: document.getElementById('f-task').value, pressed: document.querySelector('.shw-task[data-id="pigment"]').getAttribute('aria-pressed'), n: document.querySelectorAll('.shw-it:not(.is-gone)').length, y: Math.round(window.scrollY)}));
  ok(TK.sel === 'pigment' && TK.pressed === 'true' && TK.n === EXP.pigment && TK.y < 400, 'плитка «Пигментация» включила задачу, витрина перестроилась (' + TK.n + ' товара) и страница вернулась к ней', TK);
  await p.click('.shw-dir[data-id="sun"]'); await wait(1700);
  ok(await p.evaluate(() => document.getElementById('f-cat').value === 'sun' && document.querySelector('.shw-dir[data-id="sun"]').getAttribute('aria-pressed') === 'true'), 'плитка коллекции «Фотозащита» включила категорию');
  await p.click('.shw-brand[data-id="heliocare"]'); await wait(1700);
  ok(await p.evaluate(() => document.getElementById('f-brand').value === 'heliocare'), 'плитка бренда включила фильтр по бренду'); await p.click('[data-act="cat-reset"][data-shw-reset]').catch(() => {}); await wait(1200);
  await p.evaluate(() => { document.querySelector('[data-shw-list]').open = true; }); await wait(400);
  { const q = await open(b, {viewport: {width: 1854, height: 900}}); const F = await q.evaluate(() => { const a = document.querySelector('.shw-aside .shw-panel').getBoundingClientRect(); return {bottom: Math.round(a.bottom), vh: innerHeight, scroll: document.querySelector('.shw-aside .shw-panel').scrollHeight - document.querySelector('.shw-aside .shw-panel').clientHeight}; });
    ok(F.bottom <= F.vh && F.scroll <= 2, 'панель фильтров слева при заходе видна целиком (низ ' + F.bottom + ' из ' + F.vh + ' px), без внутренней прокрутки', F); await q.close(); await q.ctx.close(); }
  const GL = await p.evaluate(() => ({cards: document.querySelectorAll('#cat-grid .pcard').length, rn: document.querySelectorAll('#cat-grid .pcard .art-render img').length, ask: document.querySelectorAll('#cat-grid .pcard [data-act="form"]').length, qv: document.querySelectorAll('#cat-grid .pcard .qv-btn').length, kits: document.querySelectorAll('.sx-kits, .sx-kit').length, recent: document.querySelectorAll('#recent, .rv-sec').length}));
  ok(GL.kits === 0 && GL.recent === 0, 'блоки «Подборки по задачам» и «Недавно просмотренные» с каталога убраны полностью', GL);
  ok(GL.cards === EXP.all && GL.rn === EXP.all && GL.ask === EXP.all && GL.qv === EXP.all, 'полный список: все ' + GL.cards + ' карточек с макетом, «Запросить» и «Быстрым просмотром»', GL);
  ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  console.log('\n[планшет и телефон: та же витрина, всё на одном экране]');
  const FIT = p => p.evaluate(() => { const h = document.querySelector('.shw-hero').getBoundingClientRect(), its = [...document.querySelectorAll('.shw-it:not(.is-gone)')].map(e => e.getBoundingClientRect()), head = document.querySelector('.shw-head').getBoundingClientRect(), card = document.querySelector('.shw-card').getBoundingClientRect();
    return {n: its.length, inside: its.every(r => r.left >= h.left - 1 && r.right <= h.right + 1 && r.top >= head.bottom - 4 && r.bottom <= card.top + 40), hero: [Math.round(h.width), Math.round(h.height)], pan: [...document.querySelectorAll('.shw-pan')].every(b => b.hidden), vw: innerWidth, sw: document.documentElement.scrollWidth, blur: /rgba/.test(getComputedStyle(document.querySelector('.shw-panel')).backgroundImage), tog: getComputedStyle(document.querySelector('.filters-toggle')).display}; });
  p = await open(b, {viewport: {width: 820, height: 1180}});
  const T = await st(p), TF = await FIT(p), TO = await OV(p);
  ok(T.stack && T.pageIds.length === PAGE && TF.sw <= TF.vw + 1, 'планшет: те же 10 товаров, без горизонтальной прокрутки страницы', {T: T.pageIds.length, TF});
  ok(TF.inside && TF.pan && TO.bad.length === 0, 'планшет: вся экспозиция на одном экране — все подиумы с товарами внутри «героя», между заголовком и плашкой товара, наложений нет', {TF, TO});
  await p.close(); await p.ctx.close();
  p = await open(b, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const M = await st(p), MF = await FIT(p), MO = await OV(p);
  ok(M.stack && M.pageIds.length === PAGE && MF.sw <= MF.vw + 1, 'телефон: те же 10 товаров, без горизонтальной прокрутки страницы', {M: M.pageIds.length, MF});
  ok(MF.inside && MF.pan && MF.tog !== 'none', 'телефон: все 10 товаров на одном экране без сдвига, внутри «героя», кнопка «Фильтры» есть', MF);
  ok(MO.bad.length === 0, 'телефон: товары на подиумах, соседей не закрывают', MO);
  await p.evaluate(() => document.querySelector('.shw-it:not(.is-gone)').click()); await wait(1100);
  const MS = await p.evaluate(() => { const c = document.querySelector('.shw-card'), h = document.querySelector('.shw-hero').getBoundingClientRect(), r = c.getBoundingClientRect(), it = document.querySelector('.shw-it.is-sel'); return {open: c.classList.contains('is-open'), pos: getComputedStyle(c).position, inside: r.top > h.top && r.bottom <= h.bottom + 1, sel: !!it, itemVisible: it ? it.getBoundingClientRect().top < r.top : false}; });
  ok(MS.open && MS.pos === 'absolute' && MS.inside && MS.sel && MS.itemVisible, 'телефон: выбор раскрывает стеклянную плашку внизу сцены, выбранный товар остаётся виден', MS);
  await p.keyboard.press('Escape'); await wait(700);
  await p.click('.shw-pager .next', {force: true}); await wait(1200); ok((await st(p)).page === 1, 'телефон: листание работает');
  await p.click('.filters-toggle'); await wait(500);
  ok(await p.evaluate(() => { const d = document.querySelector('.shw-drop'), r = d.getBoundingClientRect(); return getComputedStyle(d).display !== 'none' && r.width > 300 && r.bottom < innerHeight; }), 'телефон: «Фильтры» раскрывают стеклянную панель поверх сцены');
  await setSel(p, 'f-cat', 'sun'); await wait(1400);
  ok(await vis(p) === EXP.sun && (await items(p)).length === EXP.sun, 'телефон: фильтр через «Фильтры» обновляет сцену (' + EXP.sun + ')');
  ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  console.log('\n[prefers-reduced-motion и «лёгкий режим»]');
  p = await open(b, {viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  await p.click('.cat-tile[data-id="sun"]'); await wait(300);
  const RM = await p.evaluate(() => [...document.querySelector('.shw-stage').getAnimations({subtree: true})].filter(a => a.effect && a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none')).length);
  ok(RM > 0, 'reduced-motion: системная настройка не отключает движение — перестройка сцены анимируется (решение заказчика)', RM); await wait(800);
  ok((await items(p)).length === EXP.sun, 'reduced-motion: фильтр работает');
  await p.evaluate(() => { document.documentElement.classList.add('lite'); document.querySelector('.shw-dirs').scrollIntoView({block: 'start', behavior: 'instant'}); }); await wait(500);
  const AN = await p.evaluate(() => ['.shw-dir', '.shw-task', '.shw-brand'].map(q => { const e = document.querySelector(q); return q + ':' + (e ? getComputedStyle(e).animationName : 'нет'); }));
  await p.evaluate(() => document.querySelector('.shw-tasks').scrollIntoView({block: 'start', behavior: 'instant'})); await wait(500);
  const AN2 = await p.evaluate(() => getComputedStyle(document.querySelector('.shw-task')).animationName);
  ok(AN.some(x => /^\.shw-dir:axTile/.test(x)) && /axTile/.test(AN2), 'плитки «Выберите направление…», «Подберите по задаче», «Бренды…» появляются анимацией даже при «уменьшить движение» и в «лёгком режиме»', {AN, AN2});
  await p.ctx.close();
  p = await open(b, {viewport: {width: 1440, height: 900}});
  await p.evaluate(() => document.documentElement.classList.add('lite')); await p.click('.cat-tile[data-id="sun"]'); await wait(200);
  ok(await p.evaluate(() => document.querySelector('.shw-stage').getAnimations({subtree: true}).length) === 0 && (await items(p)).length === EXP.sun, '«лёгкий режим»: смена категории мгновенная, без анимаций'); ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  /* наведение и плашка товара плавные и в «лёгком режиме», и при «уменьшить движение» (на этом сайте анимации работают всегда) */
  p = await open(b, {viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'}); await p.evaluate(() => document.documentElement.classList.add('lite')); await wait(400);
  const xy = await p.evaluate(() => { const e = document.querySelectorAll('.shw-it')[3].getBoundingClientRect(); return {x: e.x + e.width / 2, y: e.y + e.height * .55}; });
  await p.mouse.move(xy.x - 60, xy.y - 40); await p.mouse.move(xy.x, xy.y, {steps: 3});
  const GR = []; for (let i = 0; i < 30; i++) { GR.push(await p.evaluate(() => { const ph = document.querySelector('.shw-it.is-hov .shw-ph'), c = document.querySelector('.shw-tip'), m = ph && /matrix\(([-\d.]+)/.exec(getComputedStyle(ph).transform); return {z: m ? +m[1] : 1, o: c.hidden ? 0 : +getComputedStyle(c).opacity}; })); await wait(32); }
  const mid = a => new Set(a.filter(v => v > 1.005 && v < 1.065).map(v => v.toFixed(2))).size, midO = new Set(GR.map(g => g.o).filter(v => v > .05 && v < .95).map(v => v.toFixed(2))).size;
  ok(mid(GR.map(g => g.z)) >= 4 && GR[GR.length - 1].z > 1.05, 'в «лёгком режиме» и при «уменьшить движение» рост товара при наведении плавный: ' + mid(GR.map(g => g.z)) + ' промежуточных кадров, итог ×' + GR[GR.length - 1].z.toFixed(2), GR);
  ok(midO >= 3 && GR[GR.length - 1].o > .95, 'панель товара при наведении появляется плавно (' + midO + ' промежуточных значений прозрачности)', GR.map(g => g.o));
  await p.ctx.close();

  await b.close(); srv.close();
  console.log('\nИтого: ✓ ' + pass + '  ✗ ' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
