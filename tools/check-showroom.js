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
  const L = await p.evaluate(() => ({css: [...document.styleSheets].some(s => /showroom\.css/.test(s.href || '')), layers: ['shell', 'niche', 'ring', 'dais', 'plant'].filter(k => { const im = document.querySelector('.shw-world img.shw-ly[src*="layer-' + k + '"]'); return !im || !im.complete || !im.naturalWidth; }), pods: document.querySelectorAll('.shw-pd').length, h1: document.querySelector('.shw h1').textContent.trim(), grid: document.querySelectorAll('#cat-grid .pcard').length, bg: getComputedStyle(document.querySelector('.shw-room')).backgroundImage}));
  ok(L.css && L.layers.length === 0, 'слои сцены загружены: подложка (стена, пол, окно), ниша, арка, платформа со ступенями, растение — отдельные слои, не одна картинка', L.layers);
  ok(L.h1 === 'Каталог профессиональной косметики' && L.grid === EXP.all, 'заголовок страницы и полный список (' + L.grid + ' карточек) на месте', L);
  ok(L.bg === 'none', 'сцена не одна картинка-фон: у контейнера нет background-image', L.bg);
  const it0 = await items(p);
  ok(it0.length === Math.min(PAGE, EXP.all) && S0.pods === 10, 'на сцене ' + it0.length + ' товаров, все на переднем плане (по одному на подиуме), подиумов ' + S0.pods, {it0, pods: S0.pods});
  const IMG = await p.evaluate(() => [...document.querySelectorAll('.shw-it .shw-img')].map(i => ({ok: i.complete && i.naturalWidth > 0, src: i.getAttribute('src'), h: Math.round(i.getBoundingClientRect().height)})));
  ok(IMG.length === it0.length && IMG.every(i => i.ok && /assets\/showroom\/pack-[a-z-]+\.webp$/.test(i.src) && i.h > 40), '3D-макеты упаковки загружены у всех товаров сцены (' + IMG.length + ')', IMG.filter(i => !i.ok));
  const ST = await p.evaluate(() => { const r = e => e.getBoundingClientRect(); const pods = [...document.querySelectorAll('.shw-pd')].map(r); const its = [...document.querySelectorAll('.shw-it:not(.is-bg)')].map(r); return {pods: pods.length, standing: its.every((it, i) => { const pd = pods[i]; return pd && it.bottom > pd.top - 2 && it.bottom < pd.top + pd.height * .5 && it.left > pd.left - 30 && it.right < pd.right + 30; }), tops: Math.min(...its.map(i => i.top)), pills: r(document.querySelector('.shw-pills')).bottom}; });
  ok(ST.standing, 'каждый главный товар стоит на своём подиуме (контакт по нижней кромке)', ST);
  const OV = p => p.evaluate(() => { const r = e => e.getBoundingClientRect(), hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5; const pods = [...document.querySelectorAll('.shw-pd')].map(r), its = [...document.querySelectorAll('.shw-it:not(.is-bg):not(.is-gone)')].map(r), bad = [];
    its.forEach((it, i) => { if (it.left < pods[i].left - 1 || it.right > pods[i].right + 1) bad.push('товар ' + i + ' шире своего подиума'); its.forEach((o, j) => { if (j > i && hit(it, o)) bad.push('товары ' + i + ' и ' + j + ' перекрываются'); }); pods.forEach((pd, j) => { if (j !== i && hit(it, pd)) bad.push('товар ' + i + ' заходит на подиум ' + j); }); });
    pods.forEach((a, i) => pods.forEach((b2, j) => { if (j > i && hit(a, b2)) bad.push('подиумы ' + i + ' и ' + j + ' перекрываются'); })); return {n: its.length, bad}; });
  const OV0 = await OV(p); ok(OV0.n === 10 && OV0.bad.length === 0, 'на ПК каждый товар стоит строго на своём подиуме: не шире него, не перекрывает соседей и чужие подиумы, подиумы не перекрываются', OV0);
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
  ok(await vis(p) === EXP.sun && SS.pageIds.length === EXP.sun && SS.pods === Math.min(10, EXP.sun) && await p.evaluate(() => document.querySelector('.cat-tile[data-id="sun"]').getAttribute('aria-pressed')) === 'true', 'категория «Фотозащита»: ' + EXP.sun + ' товара, подиумов ' + SS.pods + ', пилюля нажата', SS);
  ok(await p.evaluate(() => document.querySelector('.shw-all').getAttribute('aria-pressed')) === 'false', 'пилюля «Все» снята');
  const hh1 = await p.evaluate(() => [...document.querySelectorAll('.shw-pd')].map(e => Math.round(parseFloat(getComputedStyle(e).getPropertyValue('--b')))).join());
  await p.click('.cat-tile[data-id="face"]'); await wait(1600);
  const hh2 = await p.evaluate(() => [...document.querySelectorAll('.shw-pd')].map(e => Math.round(parseFloat(getComputedStyle(e).getPropertyValue('--b')))).join());
  ok(hh1 !== hh2 && (await items(p)).length === Math.min(PAGE, EXP.face), 'при смене категории экспозиция перестраивается (высоты подиумов изменились), товары заменены', {hh1, hh2});
  const OV2 = await OV(p); ok(OV2.n >= 4 && OV2.bad.length === 0, 'в категории «Эстетика лица» (другая композиция высот) товары по-прежнему не заходят на чужие подиумы и друг на друга', OV2);
  await p.click('.cat-tile[data-id="sun"]'); await wait(1600); const OV3 = await OV(p); ok(OV3.n === EXP.sun && OV3.bad.length === 0, 'в «Фотозащите» (' + EXP.sun + ' товара, подиумы раздвинуты) наложений нет', OV3);
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
  await p.click('.shw-pager .next'); await wait(1300); const p3 = await st(p);
  ok(p3.page === 2 && p3.pageIds.length === EXP.all - 2 * PAGE && await p.evaluate(() => document.querySelector('.shw-pager .next').disabled), 'последняя страница: ' + p3.pageIds.length + ' товара, «вперёд» отключена', p3);
  const seen = new Set([...idsP1, ...p2.pageIds, ...p3.pageIds]); ok(seen.size === EXP.all, 'за три страницы показаны все ' + EXP.all + ' товаров', seen.size);
  await p.click('.shw-pager .prev'); await p.click('.shw-pager .prev'); await wait(1400);
  const hid = (await st(p)).pageIds[2], sel = '.shw-it[data-id="' + hid + '"]';
  await p.hover(sel); await wait(900);
  const H = await p.evaluate(s => { const e = document.querySelector(s), ph = e.querySelector('.shw-ph'), cs = getComputedStyle(ph), gl = getComputedStyle(e.querySelector('.shw-gl')), m = /matrix\(([-\d.]+)/.exec(cs.transform), others = [...document.querySelectorAll('.shw-it:not(.is-gone)')].filter(x => x !== e).map(x => +getComputedStyle(x).opacity); return {tr: cs.transform, zoom: m ? +m[1] : 1, gl: gl.opacity, dim: Math.max(...others), pods: document.querySelectorAll('.shw-pd.is-lit').length, label: !!e.querySelector('.shw-nm'), z: getComputedStyle(e).zIndex, card: document.querySelector('.shw-card .c-t') && document.querySelector('.shw-card .c-t').textContent}; }, sel);
  ok(H.zoom > 1.12 && +H.gl > .9 && H.pods === 1 && H.dim === 1 && H.z === '60' && !H.label, 'наведение: товар выходит вперёд (z-index 60), приподнимается и увеличивается (×' + H.zoom.toFixed(2) + '), под ним включается свет, подиум подсвечен; соседи не меняются и не просвечивают; всплывающей подписи нет', H);
  const pname = PR.find(x => x.id === hid).name; ok(H.card === pname, 'карточка справа показывает наведённый товар «' + pname + '»', H.card);
  await p.mouse.move(2, 2); await wait(1600);
  ok(await p.evaluate(() => document.querySelector('.shw-card').hidden && !document.querySelector('.shw').classList.contains('has-sel')), 'плашка товара появляется только при наведении на предмет и пропадает, когда курсор уходит; в покое при заходе её нет');
  await p.click(sel); await wait(1500);
  const SEL = await p.evaluate(s => { const dims = [...document.querySelectorAll('.shw-it')].filter(e => !e.matches(s)).map(e => +getComputedStyle(e).opacity), c = document.querySelector('.shw-card'), cr = c.getBoundingClientRect(), ir = document.querySelector(s).getBoundingClientRect(); return {has: document.querySelector('.shw').classList.contains('has-sel'), pressed: document.querySelector(s).getAttribute('aria-pressed'), maxDim: Math.max(...dims), open: c.classList.contains('is-open'), links: [...c.querySelectorAll('a[href]')].map(a => a.getAttribute('href')), btns: [...c.querySelectorAll('[data-act]')].map(b => b.getAttribute('data-act')), overlap: !(cr.right < ir.left || cr.left > ir.right || cr.bottom < ir.top || cr.top > ir.bottom), head: getComputedStyle(document.querySelector('.shw-head')).opacity, veil: +getComputedStyle(document.querySelector('.shw-veil')).opacity, z: getComputedStyle(document.querySelector(s)).zIndex, zoom: (/matrix\(([-\d.]+)/.exec(getComputedStyle(document.querySelector(s + ' .shw-ph')).transform) || [0, 1])[1], link: +getComputedStyle(document.querySelector('.shw-link')).opacity}; }, sel);
  ok(SEL.has && SEL.pressed === 'true' && SEL.veil > .9 && SEL.z === '70' && +SEL.zoom > 1.2, 'выбор: товар выходит вперёд над сценой (z-index 70, ×' + (+SEL.zoom).toFixed(2) + ', aria-pressed), сцена притемнена вуалью — соседи не прозрачные', SEL);
  const frozen = async () => p.evaluate(() => [...document.querySelectorAll('.shw-it')].map(e => getComputedStyle(e.querySelector('.shw-ph')).transform + getComputedStyle(e).zIndex).join('|'));
  const f0 = await frozen(), oid = (await st(p)).pageIds.find(x => x !== hid);
  await p.hover('.shw-it[data-id="' + oid + '"]'); await wait(900);
  ok(f0 === await frozen() && await p.evaluate(() => document.querySelectorAll('.shw-it.is-hov,.shw-pd.is-lit').length) === 0 && await p.evaluate(() => document.querySelector('.shw-card .c-t').textContent) === PR.find(x => x.id === hid).name, 'пока открыта карточка товара, наведение на другие предметы ничего не двигает и не меняет карточку', f0);
  await p.mouse.move(2, 2); await wait(400);
  ok(SEL.open && !SEL.overlap && SEL.link > .9 && +SEL.head < .1, 'карточка раскрыта у товара, не закрывает его, соединена линией; заголовок убран', SEL);
  const slug = PR.find(x => x.id === hid).slug; ok(SEL.links.some(h => h.endsWith('products/' + slug + '.html')) && ['form', 'qv-open', 'qv-stella', 'shw-close'].every(a => SEL.btns.indexOf(a) >= 0), 'в карточке «Подробнее» ведёт на страницу товара; есть «Запросить», «Быстрый просмотр», «Помочь с подбором», крестик', SEL);
  await p.keyboard.press('Escape'); await wait(1200);
  ok(await p.evaluate(() => !document.querySelector('.shw').classList.contains('has-sel') && document.querySelectorAll('.shw-it.is-sel').length === 0), 'Esc снимает выбор');
  await p.mouse.move(2, 2); await wait(500);
  const podXY = await p.evaluate(() => { const e = document.querySelectorAll('.shw-pd')[3].getBoundingClientRect(); return {x: e.x + e.width / 2, y: e.y + e.height * .3}; });
  await p.mouse.move(podXY.x, podXY.y, {steps: 5}); await wait(800);
  ok(await p.evaluate(() => document.querySelectorAll('.shw-it.is-hov').length) === 1, 'наведение на подиум работает как наведение на товар на нём');
  await p.mouse.click(podXY.x, podXY.y); await wait(1200);
  ok(await p.evaluate(() => document.querySelectorAll('.shw-it.is-sel').length) === 1, 'нажатие на подиум выбирает товар на нём');
  await p.keyboard.press('Escape'); await wait(900); await p.mouse.move(2, 2);
  await p.click(sel); await wait(900); await p.click('.shw-card .c-x'); await wait(900); ok(await p.evaluate(() => !document.querySelector('.shw').classList.contains('has-sel')), 'крестик в карточке снимает выбор');
  await p.click(sel); await wait(900); const EMPTY = await p.evaluate(() => { for (let y = 300; y < 640; y += 20) for (let x = 340; x < 1200; x += 20) { const e = document.elementFromPoint(x, y); if (e && e.closest('.shw-view') && !e.closest('.shw-it,.shw-card,.shw-pan,.shw-pager,.shw-link')) return [x, y]; } return null; }); await p.mouse.click(EMPTY[0], EMPTY[1]); await wait(900); ok(await p.evaluate(() => !document.querySelector('.shw').classList.contains('has-sel')), 'клик по пустому месту сцены снимает выбор');
  await p.click(sel); await wait(1000); await p.click('.shw-card [data-act="form"]'); await wait(900);
  const F = await p.evaluate(() => ({open: document.querySelector('#modal').classList.contains('open'), t: (document.querySelector('#modal') || {}).textContent.slice(0, 160)}));
  ok(F.open, '«Запросить» открывает форму заявки на товар', F); await p.keyboard.press('Escape'); await wait(700);
  await p.click(sel).catch(() => {}); await wait(900);
  if (!await p.evaluate(() => document.querySelector('.shw').classList.contains('has-sel'))) { await p.click(sel); await wait(900); }
  await p.click('.shw-card [data-act="qv-open"]'); await wait(1200);
  const Q = await p.evaluate(() => ({open: document.querySelector('#modal').classList.contains('open'), art: !!document.querySelector('.qv-art .art-render img'), ask: !!document.querySelector('[data-act="qv-ask"]'), help: !!document.querySelector('[data-act="qv-stella"]')}));
  ok(Q.open && Q.art && Q.ask && Q.help, 'быстрый просмотр открывается из карточки, упаковка — тот же 3D-макет', Q); await p.keyboard.press('Escape'); await wait(800);
  await p.click(sel); await wait(900); if (!await p.evaluate(() => document.querySelector('.shw-card').classList.contains('is-open'))) { await p.click(sel); await wait(900); }
  await p.click('.shw-card [data-act="qv-stella"]'); const rep = await stellaReply(p, 20000); const um = await userMsgs(p);
  ok(um.length > 0 && /Помоги с подбором/.test(um[um.length - 1]) && rep.length > 30, 'Стелла: передан товар «' + pname + '», получен ответ (' + rep.slice(0, 50) + '…)', {um: um.slice(-1), rep: rep.slice(0, 80)});
  await p.evaluate(() => window.Astreya.stella.close(true)); await wait(600);
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
    return {n: its.length, inside: its.every(r => r.left >= h.left - 1 && r.right <= h.right + 1 && r.top >= head.bottom - 4 && r.bottom <= card.top + 40), hero: [Math.round(h.width), Math.round(h.height)], rows2: !!document.querySelector('.shw-stage.is-rows2'), pan: [...document.querySelectorAll('.shw-pan')].every(b => b.hidden), pods: document.querySelectorAll('.shw-pd').length, vw: innerWidth, sw: document.documentElement.scrollWidth, blur: /rgba/.test(getComputedStyle(document.querySelector('.shw-panel')).backgroundImage), tog: getComputedStyle(document.querySelector('.filters-toggle')).display}; });
  p = await open(b, {viewport: {width: 820, height: 1180}});
  const T = await st(p), TF = await FIT(p), TO = await OV(p);
  ok(T.stack && T.pageIds.length === PAGE && TF.sw <= TF.vw + 1, 'планшет: те же 10 товаров, без горизонтальной прокрутки страницы', {T: T.pageIds.length, TF});
  ok(TF.inside && TF.pan && TF.pods === 10 && TO.bad.length === 0, 'планшет: вся экспозиция на одном экране — все подиумы внутри «героя», между заголовком и плашкой товара, наложений нет', {TF, TO});
  await p.close(); await p.ctx.close();
  p = await open(b, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const M = await st(p), MF = await FIT(p), MO = await OV(p);
  ok(M.stack && M.pageIds.length === PAGE && MF.sw <= MF.vw + 1, 'телефон: те же 10 товаров, без горизонтальной прокрутки страницы', {M: M.pageIds.length, MF});
  ok(MF.inside && MF.rows2 && MF.pan && MF.pods === 10 && MF.tog !== 'none', 'телефон: все 10 подиумов на одном экране без сдвига (две полки по пять), внутри «героя», кнопка «Фильтры» есть', MF);
  ok(MO.bad.length === 0, 'телефон: каждый товар на своём подиуме, соседей и чужих подиумов не закрывает', MO);
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
  ok(RM === 0, 'reduced-motion: перестройка сцены без пространственных анимаций (только прозрачность)', RM); await wait(800);
  ok((await items(p)).length === EXP.sun, 'reduced-motion: фильтр работает');
  await p.evaluate(() => { document.documentElement.classList.add('lite'); document.querySelector('.shw-dirs').scrollIntoView({block: 'start'}); }); await wait(500);
  const AN = await p.evaluate(() => ['.shw-dir', '.shw-task', '.shw-brand'].map(q => { const e = document.querySelector(q); return q + ':' + (e ? getComputedStyle(e).animationName : 'нет'); }));
  await p.evaluate(() => document.querySelector('.shw-tasks').scrollIntoView({block: 'start'})); await wait(500);
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
  const GR = []; for (let i = 0; i < 14; i++) { GR.push(await p.evaluate(() => { const ph = document.querySelector('.shw-it.is-hov .shw-ph'), c = document.querySelector('.shw-card'), m = ph && /matrix\(([-\d.]+)/.exec(getComputedStyle(ph).transform); return {z: m ? +m[1] : 1, o: c.hidden ? 0 : +getComputedStyle(c).opacity}; })); await wait(70); }
  const mid = a => new Set(a.filter(v => v > 1.02 && v < 1.14).map(v => v.toFixed(2))).size, midO = new Set(GR.map(g => g.o).filter(v => v > .05 && v < .95).map(v => v.toFixed(2))).size;
  ok(mid(GR.map(g => g.z)) >= 4 && GR[GR.length - 1].z > 1.14, 'в «лёгком режиме» и при «уменьшить движение» рост товара при наведении плавный: ' + mid(GR.map(g => g.z)) + ' промежуточных кадров, итог ×' + GR[GR.length - 1].z.toFixed(2), GR);
  ok(midO >= 3 && GR[GR.length - 1].o > .95, 'плашка товара появляется плавно (' + midO + ' промежуточных значений прозрачности)', GR.map(g => g.o));
  await p.ctx.close();

  await b.close(); srv.close();
  console.log('\nИтого: ✓ ' + pass + '  ✗ ' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
