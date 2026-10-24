#!/usr/bin/env node
/* Витрина каталога (extras.gallery: css/gallery.css, js/gallery.js) — проверка в настоящем браузере.
   Компьютер 1440×900: загрузка и каскад появления; наведение (подъём, масштаб упаковки, свет, устойчивость на нижней кромке, кнопки доступны); «Подробнее» и «Запросить»;
   окно просмотра (перелёт упаковки туда и обратно, листание, связанные товары, «Помочь с подбором», Esc, фокус, ловушка Tab); смена категории/бренда/назначения/типа,
   поиск, сортировка, сброс, «Ничего не нашлось» (состояние меняется сразу, призраки уходящих карточек исчезают, быстрые подряд смены не накладываются);
   быстрые категории; «Помочь с подбором» → Стелла (встроенные ответы). Отдельно: prefers-reduced-motion, «лёгкий режим», телефон 390×844, медленное соединение (без горизонтальной
   прокрутки, сдвиг вёрстки), отказ загрузки файлов витрины (каталог остаётся рабочим).
   Нужны Playwright и Chromium. Запуск: node tools/check-gallery.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const rd = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redesign.json'), 'utf8')).extras || {};
if (!rd.enabled || !rd.gallery) { console.log('Витрина каталога выключена в data/redesign.json (extras.gallery) — проверка пропущена.'); process.exit(0); }
const PR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8')), CT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8')), BR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brands.json'), 'utf8'));
const MIME = {'.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('нет'); return; } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const GRID = '[data-catalog] #cat-grid', CARD = GRID + ' .pcard';

/* ожидаемые числа — из данных, а не из страницы */
const count = f => PR.filter(f).length;
const taskLabel = id => (CT.tasks.find(t => t.id === id) || {}).label;
const EXP = {all: PR.length, sun: count(p => p.cat === 'sun'), heliocare: count(p => p.brand === 'heliocare'), sunHel: count(p => p.cat === 'sun' && p.brand === 'heliocare'),
  acne: count(p => p.tasks.includes('acne')), cream: count(p => p.kind === 'cream'), spf: count(p => [p.name, p.desc, (BR.brands || BR).find(b => b.id === p.brand).name, (CT.cats.find(c => c.id === p.cat) || {}).name, (CT.kinds.find(k => k.id === p.kind) || {}).name, p.tasks.map(taskLabel).join(' ')].join(' ').toLowerCase().includes('spf'))};

async function open(b, o, hooks) {
  const ctx = await b.newContext(Object.assign({deviceScaleFactor: 1, locale: 'ru-RU'}, o)); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} }); await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const d = document.querySelector('[data-shw-list]'); if (d) d.open = true; }); });                // на странице-витрине полный список свёрнут: сетка нужна этим проверкам
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error') p.errs.push('console: ' + m.text().slice(0, 160)); });
  await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
  if (hooks && hooks.before) await hooks.before(p, ctx);
  await p.goto(base + 'catalog.html' + ((hooks && hooks.query) || '')); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} }
  await p.waitForSelector('html.ready', {timeout: 25000}).catch(() => {}); await wait(1200); p.ctx = ctx; return p;
}
const vis = p => p.evaluate(sel => [...document.querySelectorAll(sel)].filter(c => !c.hidden).length, CARD);
const names = p => p.evaluate(sel => [...document.querySelectorAll(sel)].filter(c => !c.hidden).map(c => c.getAttribute('data-name')), CARD);
const toResults = async p => { await p.evaluate(() => document.querySelector(document.querySelector('.shw') ? '#cat-grid' : '#results').scrollIntoView({block: 'start'})); await wait(1500); await p.evaluate(() => new Promise(r => { const t0 = performance.now(), g = document.querySelector('#cat-grid') || document.querySelector('#results'); (function chk() { if (!g || !g.getAnimations({subtree: true}).length || performance.now() - t0 > 4000) r(); else setTimeout(chk, 100); })(); })); };   // ждём, пока доиграет входная анимация карточек: проверки ниже — про состояние покоя
const setSel = (p, id, v) => p.evaluate(([i, val]) => { const s = document.getElementById(i); s.value = val; s.dispatchEvent(new Event('change', {bubbles: true})); }, [id, v]);
const overflowX = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const settled = p => p.evaluate(sel => [...document.querySelectorAll(sel)].filter(c => { if (c.hidden) return false; const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).every(c => { const cs = getComputedStyle(c); return c.classList.contains('in') && cs.opacity === '1' && (cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)'); }), CARD);   // карточки в зоне видимости; ниже экрана их проявит прокрутка
const stellaReply = async (p, ms) => { const t0 = Date.now(); let last = '', same = 0; while (Date.now() - t0 < (ms || 16000)) { await wait(500); const t = await p.evaluate(() => { const m = [...document.querySelectorAll('.asst-bub')].filter(x => !x.closest('.asst-u')); return m.length > 1 ? m[m.length - 1].textContent.replace(/\s+/g, ' ').trim() : ''; }); if (t && t === last) { if (++same >= 3) return t; } else same = 0; last = t; } return last; };
const userMsgs = p => p.evaluate(() => [...document.querySelectorAll('.asst-u .asst-bub')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
let base = '';

(async () => {
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});

  /* ================= компьютер ================= */
  console.log('\n[компьютер 1440×900: загрузка и каскад появления]');
  let p = await open(b, {viewport: {width: 1440, height: 900}});
  const L = await p.evaluate(sel => ({gal: !!(window.Astreya && window.Astreya.gallery), mode: window.Astreya.gallery && window.Astreya.gallery.mode(), n: document.querySelectorAll(sel).length, pos: getComputedStyle(document.querySelector('#cat-grid')).position, css: [...document.styleSheets].some(s => /gallery\.css/.test(s.href || '')), h1: !!document.querySelector('[data-catalog] h1')}), CARD);
  ok(L.gal && L.mode === 'full' && L.css && L.h1, 'витрина подключена на каталоге (css + js), режим «full»', L);
  ok(L.n === EXP.all, 'в каталоге ' + L.n + ' карточек — все товары из данных (' + EXP.all + ')', L.n);
  ok(L.pos === 'relative', 'сетка — точка отсчёта для перелётов и призраков (position:relative)');
  const other = await (async () => { const pp = await b.newPage(); await pp.route(/^https:\/\/fonts\./, r => r.abort()); await pp.goto(base + 'brands.html'); const r = await pp.evaluate(() => ({css: [...document.styleSheets].some(s => /gallery\.css/.test(s.href || '')), js: !!(window.Astreya && window.Astreya.gallery), scripts: [...document.scripts].some(s => /gallery\.js/.test(s.src))})); await pp.close(); return r; })();
  ok(!other.css && !other.js && !other.scripts, 'на других страницах (Бренды) файлы витрины не подключены', other);
  await p.evaluate(() => document.querySelector(document.querySelector('.shw') ? '#cat-grid' : '#results').scrollIntoView({block: 'start'}));
  for (let i = 0; i < 50 && !(await p.evaluate(sel => document.querySelectorAll(sel)[7].style.getPropertyValue('--rd') !== '', CARD)); i++) await wait(60);       // страница прокручивается плавно: задержки назначаются, когда карточки входят в экран
  const dl = await p.evaluate(sel => [...document.querySelectorAll(sel)].slice(0, 4).map(c => parseFloat(getComputedStyle(c).transitionDelay.split(',')[0]) || 0), CARD);
  ok(dl.every((d, i) => i === 0 || d >= dl[i - 1]) && dl[dl.length - 1] > dl[0] && dl[dl.length - 1] <= 0.5, 'каскад первой строки: задержки растут от карточки к карточке, но не дольше 0,5 с (' + dl.map(d => d.toFixed(2)).join(' · ') + ')', dl);
  const t0 = Date.now(); let doneAt = 0; while (Date.now() - t0 < 4000) { const f = await p.evaluate(sel => [...document.querySelectorAll(sel)].slice(0, 4).every(c => { const cs = getComputedStyle(c); return c.classList.contains('in') && cs.opacity === '1' && getComputedStyle(c).translate === 'none' || (c.classList.contains('in') && cs.opacity === '1' && /^0(px)?( 0(px)?)?$/.test(cs.translate)); }), CARD); if (f) { doneAt = Date.now() - t0; break; } await wait(60); }
  ok(doneAt > 0 && doneAt < 2300, 'первая строка карточек полностью проявилась за ' + doneAt + ' мс (короткий вход, < 2,3 с с задержками)', doneAt);
  ok(await settled(p), 'после входа карточки на месте: прозрачность 1, без смещения');
  ok(await overflowX(p) <= 1, 'горизонтальной прокрутки страницы нет');

  console.log('\n[компьютер: наведение]');
  await p.evaluate(sel => document.querySelectorAll(sel)[1].scrollIntoView({block: 'center'}), CARD); await wait(1400);
  const geo = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[1], g = document.querySelector('#cat-grid').getBoundingClientRect(); return {x: g.left + c.offsetLeft + c.offsetWidth / 2, y: g.top + c.offsetTop + 90, bottom: g.top + c.offsetTop + c.offsetHeight, w: c.offsetWidth, id: c.getAttribute('data-id')}; }, CARD);
  await p.mouse.move(geo.x - 60, geo.y - 20); await p.mouse.move(geo.x, geo.y, {steps: 8}); await wait(900);
  const H = await p.evaluate(sel => { const c = document.querySelector(sel + '.is-hov'); if (!c) return null; const cs = getComputedStyle(c), pk = getComputedStyle(c.querySelector('.pk, .art-render img')), glow = getComputedStyle(c.querySelector('.art'), '::after'); return {n: document.querySelectorAll(sel + '.is-hov').length, ty: new DOMMatrix(cs.transform).m42, pk: new DOMMatrix(pk.transform).a, sh: cs.boxShadow, glow: glow.opacity, qv: getComputedStyle(c.querySelector('.qv-btn')).opacity, mx: c.style.getPropertyValue('--mx')}; }, CARD);
  ok(H && H.n === 1, 'наведение: подсвечена ровно одна карточка', H);
  ok(H && H.ty < -4.5 && H.ty > -7, 'карточка приподнимается примерно на 6 px (' + (H && H.ty.toFixed(1)) + ')', H);
  ok(H && H.pk > 1.05 && H.pk < 1.1, 'упаковка плавно увеличивается (×' + (H && H.pk.toFixed(2)) + ')', H);
  ok(H && /rgba?\((11, 26, 51|86, 60, 30), 0\.(4|5)/.test(H.sh) && H.glow === '1' && H.qv === '1' && /%/.test(H.mx), 'тень глубже, на фоне упаковки появляется свет за курсором, «Быстрый просмотр» проявляется', H);
  ok(await overflowX(p) <= 1, 'при наведении горизонтальной прокрутки нет');
  await p.mouse.move(geo.x, geo.bottom - 2); await wait(300);                              // нижняя кромка: приподнятая карточка уходит из-под курсора — в обычном :hover это даёт «дребезг»
  const tops = []; let hovOn = 0; for (let i = 0; i < 24; i++) { const r = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[1]; return [c.classList.contains('is-hov'), c.getBoundingClientRect().top]; }, CARD); hovOn += r[0] ? 1 : 0; tops.push(r[1]); await wait(50); }
  ok(hovOn === 24, 'на нижней кромке карточки состояние наведения устойчиво (24 из 24 замеров)', hovOn);
  ok(Math.max(...tops.slice(8)) - Math.min(...tops.slice(8)) < 0.6, 'и положение карточки не «дребезжит» (разброс ' + (Math.max(...tops.slice(8)) - Math.min(...tops.slice(8))).toFixed(2) + ' px)', tops);
  const btn = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[1], b = c.querySelector('.pf .btn'), r = b.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }, CARD);
  await p.mouse.move(btn.x, btn.y, {steps: 5}); await wait(600);
  const onBtn = await p.evaluate(sel => ({hov: document.querySelectorAll(sel)[1].classList.contains('is-hov'), top: document.querySelectorAll(sel)[1].querySelector('.pf .btn').matches(':hover')}), CARD);
  ok(onBtn.hov && onBtn.top, 'наведение не мешает кнопке «Запросить»: она под курсором, карточка остаётся приподнятой', onBtn);
  await p.mouse.click(btn.x, btn.y); await wait(700);
  const form = await p.evaluate(() => ({open: document.querySelector('#modal').classList.contains('open'), ctx: (document.querySelector('#modal .ctx') || {}).textContent || '', f: !!document.querySelector('#modal form')}));
  ok(form.open && form.f && form.ctx.length > 3, '«Запросить» открывает форму с названием товара («' + form.ctx.slice(0, 40) + '»)', form);
  await p.keyboard.press('Escape'); await wait(700);
  ok(!(await p.evaluate(() => document.querySelector('#modal').classList.contains('open'))), 'форма закрывается по Esc');
  await p.mouse.move(20, 300); await wait(500);
  ok(await p.evaluate(sel => document.querySelectorAll(sel + '.is-hov').length, CARD) === 0, 'курсор ушёл с сетки — подсветки нет');
  const link = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[1], a = c.querySelector('h3 a.stretch'); return {href: a.getAttribute('href'), more: !!c.querySelector('.pf .lnk')}; }, CARD);
  ok(/^products\/[\w-]+\.html$/.test(link.href) && fs.existsSync(path.join(ROOT, link.href)) && link.more, '«Подробнее»: карточка ведёт на страницу товара (' + link.href + '), страница существует', link);
  await p.keyboard.press('Tab'); await p.evaluate(sel => document.querySelectorAll(sel)[2].querySelector('a.stretch').focus(), CARD); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); await wait(700);
  const kb = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[2]; return {ty: new DOMMatrix(getComputedStyle(c).transform).m42, f: document.activeElement.closest('.pcard') === c}; }, CARD);
  ok(kb.f && kb.ty < -4, 'с клавиатуры: фокус на карточке приподнимает её так же', kb);

  console.log('\n[компьютер: окно просмотра товара]');
  await p.evaluate(sel => document.querySelectorAll(sel)[1].scrollIntoView({block: 'center'}), CARD); await wait(900);
  const g2 = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[1], g = document.querySelector('#cat-grid').getBoundingClientRect(); return {x: g.left + c.offsetLeft + c.offsetWidth / 2, y: g.top + c.offsetTop + 90, id: c.getAttribute('data-id')}; }, CARD);
  await p.mouse.move(g2.x - 30, g2.y); await p.mouse.move(g2.x, g2.y, {steps: 5}); await wait(500);
  await p.evaluate(() => { window.__fly = []; const t0 = performance.now(), f = () => { const g = document.querySelector('.gal-fly'); if (g) { const r = g.getBoundingClientRect(); window.__fly.push({t: performance.now() - t0, w: r.width, h: r.height, l: r.left, vis: getComputedStyle(document.querySelector('.qv-art .art') || document.body).visibility}); } if (performance.now() - t0 < 1400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.click(CARD + '.is-hov .qv-btn'); await wait(1500);
  const fly = await p.evaluate(() => window.__fly);
  const Q = await p.evaluate(() => { const d = document.querySelector('.qv-dlg'), a = document.querySelector('.qv-art .art'), pk = a.querySelector('.pk, img'); return {big: pk.classList.contains('pk') ? parseFloat(getComputedStyle(pk).scale) >= 1.8 : pk.getBoundingClientRect().height >= a.getBoundingClientRect().height * .55, cls: d.className, ask: document.activeElement.getAttribute('data-act'), vis: getComputedStyle(a).visibility, pk: new DOMMatrix(getComputedStyle(pk).transform).a, sc: pk.classList.contains('pk') ? getComputedStyle(pk).scale : 'макет', art: Math.round(a.getBoundingClientRect().width) + '×' + Math.round(a.getBoundingClientRect().height), title: document.querySelector('.qv-dlg h2').textContent, locked: document.body.classList.contains('locked'), ghosts: document.querySelectorAll('.gal-fly').length, rel: [...document.querySelectorAll('.qv-rel .chip')].map(x => x.textContent), relT: (document.querySelector('.qv-rel-t') || {}).textContent, stella: (document.querySelector('[data-act="qv-stella"]') || {}).textContent, ask2: !!document.querySelector('[data-act="qv-ask"]'), dlgR: document.querySelector('.qv-dlg').getBoundingClientRect().right}; });
  ok(fly.length >= 8 && fly[0].w < fly[fly.length - 1].w && fly.every((f, i) => i === 0 || f.w >= fly[i - 1].w - 0.5), 'перелёт: упаковка растёт из карточки в окно за ' + Math.round(fly.length ? fly[fly.length - 1].t : 0) + ' мс (' + fly.length + ' кадров, ширина ' + Math.round(fly[0] ? fly[0].w : 0) + ' → ' + Math.round(fly.length ? fly[fly.length - 1].w : 0) + ' px)', fly.slice(0, 3));
  ok(fly.length && fly.every(f => f.vis === 'hidden'), 'пока она летит, настоящая упаковка в окне скрыта (нет двойника)');
  ok(Q.ghosts === 0 && Q.vis === 'visible', 'после перелёта копия убрана, настоящая упаковка видна', Q);
  ok(/gal gal-open/.test(Q.cls) && Q.ask === 'qv-ask' && Q.locked, 'окно: открыто, фокус на «Запросить информацию», прокрутка страницы под ним закреплена', Q);
  ok(Q.big, 'упаковка в окне крупная (масштаб ×' + Q.sc + ', рамка ' + Q.art + ')', Q);
  ok(Q.relT === 'Тот же бренд и назначение' && Q.rel.length >= 1 && Q.rel.length <= 3, 'связанные товары — «Тот же бренд и назначение»: ' + Q.rel.join(', '), Q);
  const relOk = await p.evaluate(([id, rel]) => { const P = window.ASTREYA_DATA.products, me = P.find(x => x.id === id); return rel.every(n => { const q = P.find(x => x.name === n && x.brand === me.brand); return q && q.id !== id && (q.ts || []).some(t => (me.ts || []).includes(t)); }); }, [g2.id, Q.rel]);
  ok(relOk, 'каждая связь подтверждена данными: тот же бренд и хотя бы одна общая задача');
  ok(Q.stella === 'Помочь с подбором' && Q.ask2, 'в окне есть «Запросить информацию» и «Помочь с подбором»', Q);
  ok(Q.dlgR <= 1440, 'окно целиком на экране', Q.dlgR);
  const first = Q.title;
  await p.keyboard.press('ArrowRight'); await wait(120);
  const sw = await p.evaluate(() => ({cls: document.querySelector('.qv-dlg').className, title: document.querySelector('.qv-dlg h2').textContent, an: getComputedStyle(document.querySelector('.qv-dlg .qv-art')).animationName}));
  ok(sw.title !== first && /gal-swap/.test(sw.cls) && /galSwap/.test(sw.an), '→ листает на следующий товар («' + first + '» → «' + sw.title + '») с мягкой сменой содержимого', sw);
  await wait(500);
  const rel1 = await p.$('.qv-rel .chip');
  if (rel1) { const rn = await rel1.textContent(); await rel1.click(); await wait(600); const t2 = await p.evaluate(() => document.querySelector('.qv-dlg h2').textContent); ok(t2 === rn, 'клик по связанному товару открывает его в том же окне («' + t2 + '»)', {rn, t2}); }
  await p.keyboard.press('Escape'); await wait(130);
  const out = await p.evaluate(() => ({g: document.querySelectorAll('.gal-fly').length, closing: document.querySelector('#modal').classList.contains('closing')}));
  ok(out.g === 1 && out.closing, 'Esc: упаковка возвращается в карточку (копия летит), окно закрывается', out);
  await wait(800);
  const after = await p.evaluate(() => ({open: document.querySelector('#modal').classList.contains('open'), g: document.querySelectorAll('.gal-fly').length, locked: document.body.classList.contains('locked'), foc: document.activeElement.className, html: document.querySelector('#modal').innerHTML.length}));
  ok(!after.open && after.g === 0 && !after.locked && after.html === 0, 'окно закрыто, копий нет, прокрутка страницы свободна', after);
  ok(/qv-btn/.test(after.foc), 'фокус вернулся на кнопку «Быстрый просмотр» карточки', after.foc);
  await p.evaluate(sel => document.querySelectorAll(sel)[1].querySelector('.qv-btn').click(), CARD); await wait(900);
  const trap = []; for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); trap.push(await p.evaluate(() => !!document.activeElement.closest('#modal'))); }
  ok(trap.every(Boolean), 'Tab не уходит из окна за 14 нажатий (ловушка фокуса)', trap);
  await p.click('#modal .x'); await wait(800);
  await p.evaluate(sel => document.querySelectorAll(sel)[1].querySelector('.qv-btn').click(), CARD); await wait(900);
  await p.evaluate(() => document.querySelector('#modal').click()); await wait(800);
  ok(!(await p.evaluate(() => document.querySelector('#modal').classList.contains('open'))), 'окно закрывается и по клику на затемнение; крестик тоже работает');
  await p.evaluate(sel => document.querySelectorAll(sel)[1].querySelector('.qv-btn').click(), CARD); await wait(900);
  await p.click('[data-act="qv-ask"]'); await wait(1000);
  const ask = await p.evaluate(() => ({open: document.querySelector('#modal').classList.contains('open'), form: !!document.querySelector('#modal form'), ctx: (document.querySelector('#modal .ctx') || {}).textContent || ''}));
  ok(ask.open && ask.form && ask.ctx.length > 3, '«Запросить информацию» в окне открывает форму заявки с товаром («' + ask.ctx.slice(0, 40) + '»)', ask);
  await p.keyboard.press('Escape'); await wait(800);

  console.log('\n[компьютер: смена категорий и фильтров]');
  await toResults(p); await p.mouse.move(20, 300);
  const sync = await p.evaluate(sel => { const s = document.getElementById('f-cat'); s.value = 'sun'; s.dispatchEvent(new Event('change', {bubbles: true})); return {n: [...document.querySelectorAll(sel)].filter(c => !c.hidden).length, txt: document.querySelector('#res-count').textContent, reset: !document.querySelector('#cat-reset').hidden, chips: document.querySelectorAll('#active-filters .chip').length}; }, CARD);
  ok(sync.n === EXP.sun && sync.txt === 'Найдено: ' + EXP.sun + ' из ' + EXP.all && sync.reset && sync.chips === 1, 'категория «Фотозащита»: состояние, счётчик и чипы обновились сразу, до конца анимации (' + sync.txt + ')', sync);
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const mid = await p.evaluate(() => ({ghosts: document.querySelectorAll('.pc-ghost').length, anim: document.getAnimations().filter(a => a.playState === 'running').length, ox: document.documentElement.scrollWidth - innerWidth, ids: [...document.querySelectorAll('.pc-ghost')].map(g => g.querySelectorAll('[id]').length + g.getAttribute('aria-hidden') + (g.hasAttribute('inert') ? 'i' : '-') + g.getAttributeNames().filter(n => n.indexOf('data-') === 0).length)}));
  ok(mid.ghosts > 0 && mid.ghosts <= 12 && mid.ids.every(x => x === '0true' + 'i0'), 'уходящие карточки: ' + mid.ghosts + ' призраков поверх сетки (без id и data-*, скрыты от скринридера, неактивны)', mid);
  ok(mid.anim > 0 && mid.ox <= 1, 'во время анимации идёт движение, а горизонтальной прокрутки нет', mid);
  await wait(1500);
  const end1 = await p.evaluate(() => ({ghosts: document.querySelectorAll('.pc-ghost').length, anim: document.querySelector('#cat-grid').getAnimations({subtree: true}).filter(a => a.playState === 'running' && !(a.transitionProperty === undefined && false)).length}));
  ok(end1.ghosts === 0 && await settled(p), 'через 1,5 с призраков нет, карточки на местах (прозрачность 1, без смещения)', end1);
  ok(/cat=sun/.test(await p.evaluate(() => location.search)), 'адрес страницы отражает фильтр (?cat=sun)');
  await setSel(p, 'f-brand', 'heliocare'); await wait(1400);
  ok(await vis(p) === EXP.sunHel, 'плюс бренд Heliocare: ' + EXP.sunHel + ' (категория ∩ бренд из данных)', await vis(p));
  await p.click('#cat-reset'); await wait(1400);
  ok(await vis(p) === EXP.all && await p.evaluate(() => document.querySelector('#cat-reset').hidden) && await settled(p), 'сброс фильтров возвращает все ' + EXP.all + ' товаров, кнопка «Сбросить» прячется');
  await setSel(p, 'f-task', 'acne'); await wait(1300); ok(await vis(p) === EXP.acne, 'назначение «Акне»: ' + EXP.acne, await vis(p));
  await setSel(p, 'f-task', 'all'); await setSel(p, 'f-kind', 'cream'); await wait(1300); ok(await vis(p) === EXP.cream, 'тип «Кремы»: ' + EXP.cream, await vis(p));
  await setSel(p, 'f-kind', 'all'); await setSel(p, 'f-sort', 'az'); await wait(1500);
  const az = await names(p), azExp = PR.map(x => x.name).sort((a, c) => a.toLocaleLowerCase('ru').localeCompare(c.toLocaleLowerCase('ru'), 'ru'));
  ok(az.length === EXP.all && JSON.stringify(az.slice(0, 5)) === JSON.stringify(PR.map(x => x.name.toLowerCase().replace(/ё/g, 'е')).sort((a, c) => a.localeCompare(c, 'ru')).slice(0, 5)), 'сортировка «А–Я» перестроила карточки с плавным переездом (первые: ' + az.slice(0, 3).join(', ') + ')', az.slice(0, 5));
  await setSel(p, 'f-sort', 'def'); await wait(1300);
  await p.fill('#cat-q', 'spf'); await wait(1500); ok(await vis(p) === EXP.spf, 'поиск «spf»: ' + EXP.spf + ' (по названию, описанию, бренду и задачам)', await vis(p));
  await p.fill('#cat-q', 'zzzqqq'); await wait(1300);
  const emp = await p.evaluate(() => ({empty: !document.querySelector('#cat-empty').hidden, txt: document.querySelector('#res-count').textContent, an: getComputedStyle(document.querySelector('#cat-empty')).animationName, ghosts: document.querySelectorAll('.pc-ghost').length}));
  ok(emp.empty && emp.txt === 'Найдено: 0 из ' + EXP.all && /galEmpty/.test(emp.an) && emp.ghosts === 0, '«Ничего не нашлось»: плашка появляется мягко, счётчик «0 из ' + EXP.all + '»', emp);
  await p.click('#cat-reset'); await wait(1400); ok(await vis(p) === EXP.all && !(await p.evaluate(() => !document.querySelector('#cat-empty').hidden)), 'после «Ничего не нашлось» сброс возвращает каталог');
  /* быстрые смены подряд: каждая отменяет незаконченную анимацию предыдущей */
  await p.evaluate(async () => { const set = (id, v) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', {bubbles: true})); }, z = ms => new Promise(r => setTimeout(r, ms));
    set('f-cat', 'face'); await z(60); set('f-brand', 'dermatime'); await z(60); set('f-cat', 'all'); await z(60); set('f-task', 'antiage'); await z(60); set('f-sort', 'az'); await z(60); set('f-sort', 'brand'); await z(60); set('f-brand', 'all'); await z(60); set('f-task', 'all'); await z(60); set('f-sort', 'def'); await z(60); set('f-cat', 'sun'); });
  const rapidNow = await vis(p); await wait(1800);
  const rap = await p.evaluate(sel => ({ghosts: document.querySelectorAll('.pc-ghost').length, run: document.querySelector('#cat-grid').getAnimations({subtree: true}).filter(a => a.playState === 'running').length, n: [...document.querySelectorAll(sel)].filter(c => !c.hidden).length, ox: document.documentElement.scrollWidth - innerWidth}), CARD);
  ok(rapidNow === EXP.sun && rap.n === EXP.sun && rap.ghosts === 0 && rap.run === 0 && await settled(p) && rap.ox <= 1, '10 смен фильтров за 0,6 с: итог верный (' + rap.n + '), призраков и незаконченных анимаций нет, карточки на местах', {rapidNow, rap});
  await p.click('#cat-reset'); await wait(1200);
  await p.click('.cat-tile[data-id="sun"]'); await wait(1500);
  ok(await vis(p) === EXP.sun && await p.evaluate(() => document.querySelector('.cat-tile[data-id="sun"]').getAttribute('aria-pressed')) === 'true', 'быстрая категория-плитка «Фотозащита» включает фильтр и подсвечивается (aria-pressed)');
  const tiles = await p.evaluate(() => [...document.querySelectorAll('.cat-tile b')].map(x => x.textContent));
  const want = ['Эстетика лица', 'Химические пилинги', 'Фотозащита', 'Домашний уход', 'Волосы и кожа головы', 'Эстетика тела'];
  ok(want.every(w => tiles.includes(w)), 'быстрые категории по задачам из ТЗ — из существующих данных (' + want.join(', ') + ')', tiles);
  await p.click('.cat-tile[data-id="sun"]'); await wait(1300); ok(await vis(p) === EXP.all, 'повторный клик по плитке снимает фильтр');

  console.log('\n[компьютер: «Помочь с подбором» → Стелла]');
  await setSel(p, 'f-cat', 'sun'); await wait(1300);
  await p.click('.gal-help'); const rep = await stellaReply(p, 20000); const um = await userMsgs(p);
  ok(um.length === 1 && /Фотозащита/.test(um[0]) && /4 из 30|Найдено/.test(um[0]), 'из каталога Стелле передана выбранная категория: «' + (um[0] || '').slice(0, 90) + '…»', um);
  ok(/Фотозащит/.test(rep) && /Heliocare|Neoretin/.test(rep), 'встроенный «мозг» ответил по данным сайта: фотозащита и реальные товары (Heliocare, Neoretin)', rep.slice(0, 160));
  await p.evaluate(() => window.Astreya.stella.close(true)); await wait(600); await p.reload(); await p.waitForSelector('html.ready'); await wait(1300);
  await toResults(p);
  const g3 = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[3], g = document.querySelector('#cat-grid').getBoundingClientRect(); return {x: g.left + c.offsetLeft + c.offsetWidth / 2, y: g.top + c.offsetTop + 90, id: c.getAttribute('data-id')}; }, CARD);
  await p.mouse.move(g3.x - 30, g3.y); await p.mouse.move(g3.x, g3.y, {steps: 4}); await wait(500); await p.click(CARD + '.is-hov .qv-btn'); await wait(1000);
  const pName = await p.evaluate(() => document.querySelector('.qv-dlg h2').textContent), pBrand = await p.evaluate(() => document.querySelector('.qv-dlg .eyebrow').textContent.trim());
  await p.click('.qv-dlg [data-act="qv-stella"]'); const rep2 = await stellaReply(p, 20000); const um2 = await userMsgs(p);
  const last2 = um2[um2.length - 1] || '';
  ok(last2.indexOf(pName) >= 0 && last2.toLowerCase().indexOf(pBrand.toLowerCase()) >= 0 && /категория|назначение/.test(last2), 'от товара Стелле переданы название, бренд и данные о нём («' + last2.slice(0, 120) + '…»)', um2);
  ok(rep2.indexOf(pName) >= 0 && !/^Сочетания зависят/.test(rep2), 'Стелла рассказала именно об этом товаре по данным сайта («' + rep2.slice(0, 80) + '…»)', rep2.slice(0, 200));
  ok(!(await p.evaluate(() => document.querySelector('#modal').classList.contains('open'))), 'окно просмотра при этом закрылось, заявки менеджеру не затронуты (форма открывается отдельно)');
  ok(p.errs.length === 0, 'на компьютере нет ошибок JavaScript и консоли', p.errs);
  await p.ctx.close();

  /* ================= спокойное движение ================= */
  console.log('\n[prefers-reduced-motion: reduce]');
  p = await open(b, {viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'}); await toResults(p);
  ok(await p.evaluate(() => window.Astreya.gallery.mode()) === 'soft', 'режим «soft»: только прозрачность, без пространственного движения');
  const rm0 = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[1], cs = getComputedStyle(c); return {t: cs.transitionProperty, tr: cs.translate}; }, CARD);
  ok(rm0.tr === 'none' || /^0(px)?( 0(px)?)?$/.test(rm0.tr), 'карточки в покое без смещения', rm0);
  await p.evaluate(sel => document.querySelectorAll(sel)[1].scrollIntoView({block: 'center'}), CARD); await wait(900);
  const rg = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[1], g = document.querySelector('#cat-grid').getBoundingClientRect(); return {x: g.left + c.offsetLeft + c.offsetWidth / 2, y: g.top + c.offsetTop + 90}; }, CARD);
  await p.mouse.move(rg.x - 30, rg.y); await p.mouse.move(rg.x, rg.y, {steps: 4}); await wait(800);
  const rh = await p.evaluate(sel => { const c = document.querySelector(sel + '.is-hov'); return c && {ty: new DOMMatrix(getComputedStyle(c).transform).m42, pk: new DOMMatrix(getComputedStyle(c.querySelector('.pk, .art-render img')).transform).a, qv: getComputedStyle(c.querySelector('.qv-btn')).opacity}; }, CARD);
  ok(rh && rh.ty === 0 && Math.abs(rh.pk - 1) < 0.01 && rh.qv === '1', 'наведение без подъёма и увеличения (кнопка просмотра и тень остаются)', rh);
  await p.evaluate(() => { window.__fl = 0; new MutationObserver(() => { if (document.querySelector('.gal-fly')) window.__fl++; }).observe(document.body, {childList: true}); });
  await p.click(CARD + '.is-hov .qv-btn'); await wait(300);
  const rq = await p.evaluate(() => ({fl: window.__fl, an: getComputedStyle(document.querySelector('.qv-dlg')).animationName, vis: getComputedStyle(document.querySelector('.qv-art .art')).visibility}));
  ok(rq.fl === 0 && /galFade/.test(rq.an) && rq.vis === 'visible', 'окно просмотра: перелёта нет, только мягкое появление', rq);
  await p.keyboard.press('Escape'); await wait(700); await p.mouse.move(20, 300);
  await toResults(p);
  const rf = await p.evaluate(sel => { const s = document.getElementById('f-cat'); s.value = 'sun'; s.dispatchEvent(new Event('change', {bubbles: true})); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ghosts: document.querySelectorAll('.pc-ghost').length, n: [...document.querySelectorAll(sel)].filter(c => !c.hidden).length, tr: document.querySelector('#cat-grid').getAnimations({subtree: true}).filter(a => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation) && a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none')).length, op: document.querySelector('#cat-grid').getAnimations({subtree: true}).filter(a => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation) && a.effect.getKeyframes().some(k => k.opacity !== undefined)).length})))); }, CARD);
  ok(rf.ghosts === 0 && rf.n === EXP.sun && rf.tr === 0, 'смена фильтра: итог верный, призраков и движения карточек нет (' + rf.op + ' плавных проявлений по прозрачности)', rf);
  ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  /* ================= лёгкий режим ================= */
  console.log('\n[«лёгкий режим» (медленные кадры)]');
  p = await open(b, {viewport: {width: 1440, height: 900}}); await toResults(p);
  await p.evaluate(() => document.documentElement.classList.add('lite')); await wait(200);
  ok(await p.evaluate(() => window.Astreya.gallery.mode()) === 'off', 'в «лёгком режиме» витрина отключает перелёты и призраки (режим «off»)');
  const lf = await p.evaluate(sel => { const s = document.getElementById('f-cat'); s.value = 'sun'; s.dispatchEvent(new Event('change', {bubbles: true})); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ghosts: document.querySelectorAll('.pc-ghost').length, n: [...document.querySelectorAll(sel)].filter(c => !c.hidden).length, run: document.querySelector('#cat-grid').getAnimations({subtree: true}).length})))); }, CARD);
  ok(lf.ghosts === 0 && lf.n === EXP.sun && lf.run === 0, 'фильтр работает мгновенно, без анимаций (' + lf.n + ' товаров)', lf);
  await p.evaluate(sel => document.querySelectorAll(sel)[0].querySelector('.qv-btn').click(), CARD); await wait(500);
  ok(await p.evaluate(() => document.querySelectorAll('.gal-fly').length) === 0 && await p.evaluate(() => document.querySelector('#modal').classList.contains('open')), 'окно просмотра открывается без перелёта');
  await p.keyboard.press('Escape'); await wait(500); ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();

  /* ================= телефон ================= */
  console.log('\n[телефон 390×844]');
  p = await open(b, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
  ok(await overflowX(p) <= 1, 'горизонтальной прокрутки нет сразу после загрузки', await overflowX(p));
  await toResults(p);
  const mv = await p.evaluate(sel => { const c = document.querySelectorAll(sel)[0], q = c.querySelector('.qv-btn'), r = q.getBoundingClientRect(); return {op: getComputedStyle(q).opacity, hov: document.querySelectorAll(sel + '.is-hov').length, w: Math.round(c.getBoundingClientRect().width), qr: Math.round(r.right), help: (() => { const h = document.querySelector('.gal-help'); const hr = h.getBoundingClientRect(); return hr.right <= 390 && hr.left >= 0; })()}; }, CARD);
  ok(mv.op === '1' && mv.hov === 0 && mv.help, 'на телефоне «Быстрый просмотр» виден без наведения, подсветки по наведению нет, «Помочь с подбором» помещается', mv);
  await p.locator(CARD).nth(0).scrollIntoViewIfNeeded(); await wait(500);
  await p.locator(CARD + ' .qv-btn').nth(0).tap(); await wait(1200);
  const mq = await p.evaluate(() => { const d = document.querySelector('.qv-dlg'), r = d.getBoundingClientRect(), a = document.querySelector('.qv-art .art').getBoundingClientRect(), pk = document.querySelector('.qv-art .pk, .qv-art img').getBoundingClientRect(); return {cls: d.className, l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom), artH: Math.round(a.height), pkIn: pk.top >= a.top - 1 && pk.bottom <= a.bottom + 1, fly: document.querySelectorAll('.gal-fly').length, ox: document.documentElement.scrollWidth - innerWidth}; });
  ok(/gal gal-open/.test(mq.cls) && mq.l >= 0 && mq.r <= 390 && mq.b <= 844 && mq.ox <= 1 && mq.fly === 0, 'окно просмотра по касанию: целиком на экране, перелёт завершён, горизонтальной прокрутки нет', mq);
  ok(mq.pkIn, 'увеличенная упаковка не вылезает за свою рамку (рамка ' + mq.artH + ' px)', mq);
  const xc = await p.evaluate(() => { const x = document.querySelector('#modal .x'), r = x.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return {onTop: !!(el && el.closest('.x')), w: r.width, h: r.height}; });
  ok(xc.onTop && xc.w >= 40 && xc.h >= 40, 'крестик закрытия не перекрыт рамкой упаковки и достаточно крупный для касания (' + xc.w + '×' + xc.h + ' px)', xc);
  await p.locator('#modal .x').tap(); await wait(900);
  ok(!(await p.evaluate(() => document.querySelector('#modal').classList.contains('open'))), 'касание по крестику закрывает окно на телефоне');
  await setSel(p, 'f-cat', 'sun'); await wait(150);
  const mf = await p.evaluate(() => ({ox: document.documentElement.scrollWidth - innerWidth, g: document.querySelectorAll('.pc-ghost').length})); await wait(1400);
  ok(mf.ox <= 1 && await vis(p) === EXP.sun && await overflowX(p) <= 1 && await p.evaluate(() => document.querySelectorAll('.pc-ghost').length) === 0, 'смена категории на телефоне: ' + EXP.sun + ' товара, во время анимации (призраков: ' + mf.g + ') и после горизонтальной прокрутки нет', mf);
  ok(await p.evaluate(() => document.querySelectorAll('.is-hov').length) === 0, 'касания не создают «залипшего» наведения');
  ok(p.errs.length === 0, 'на телефоне нет ошибок JavaScript', p.errs); await p.ctx.close();

  /* ================= медленное соединение и отказ файлов витрины ================= */
  console.log('\n[медленное соединение]');
  p = await open(b, {viewport: {width: 1440, height: 900}}, {before: async (pg, ctx) => {
    await pg.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type: 'layout-shift', buffered: true}); } catch (e) {} });
    const cdp = await ctx.newCDPSession(pg); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8});
  }});
  await wait(2500);
  const sl = await p.evaluate(sel => ({cls: window.__cls, n: document.querySelectorAll(sel).length, ready: document.documentElement.classList.contains('ready'), ox: document.documentElement.scrollWidth - innerWidth}), CARD);
  ok(sl.n === EXP.all && sl.ready, 'на медленной сети (1,6 Мбит/с, 150 мс) каталог загрузился и работает: ' + sl.n + ' карточек', sl);
  ok(sl.cls < 0.1 && sl.ox <= 1, 'сдвиг вёрстки при загрузке малый (CLS ' + sl.cls.toFixed(3) + ' < 0,1), горизонтальной прокрутки нет', sl);
  await toResults(p); await setSel(p, 'f-cat', 'sun'); await wait(1600); ok(await vis(p) === EXP.sun && await settled(p), 'фильтр на медленной сети работает: ' + EXP.sun, await vis(p));
  ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close();
  const sz = f => fs.statSync(path.join(ROOT, f)).size; const zlib = require('zlib'); const gz = f => zlib.gzipSync(fs.readFileSync(path.join(ROOT, f))).length;
  console.log('  ·  вес файлов витрины: gallery.js ' + (sz('js/gallery.js') / 1024).toFixed(1) + ' КБ (сжатый ' + (gz('js/gallery.js') / 1024).toFixed(1) + '), gallery.css ' + (sz('css/gallery.css') / 1024).toFixed(1) + ' КБ (сжатый ' + (gz('css/gallery.css') / 1024).toFixed(1) + ')');
  ok(gz('js/gallery.js') + gz('css/gallery.css') < 14000, 'витрина добавляет меньше 14 КБ в сжатом виде', gz('js/gallery.js') + gz('css/gallery.css'));

  console.log('\n[отказ загрузки файлов витрины: каталог остаётся рабочим]');
  p = await open(b, {viewport: {width: 1440, height: 900}}, {before: async pg => { await pg.route('**/js/gallery.js*', r => r.abort()); await pg.route('**/css/gallery.css*', r => r.abort()); }});
  await toResults(p); await wait(2800);
  const nf = await p.evaluate(sel => ({gal: !!window.Astreya.gallery, n: document.querySelectorAll(sel).length, op: [...document.querySelectorAll(sel)].slice(0, 4).every(c => getComputedStyle(c).opacity === '1')}), CARD);
  ok(!nf.gal && nf.n === EXP.all && nf.op, 'без файлов витрины карточки на месте и видны', nf);
  await setSel(p, 'f-cat', 'sun'); await wait(500); ok(await vis(p) === EXP.sun, 'фильтр работает по-прежнему (' + EXP.sun + ')');
  await p.evaluate(sel => document.querySelectorAll(sel + ':not([hidden])')[0].querySelector('.qv-btn').click(), CARD); await wait(700);
  ok(await p.evaluate(() => document.querySelector('#modal').classList.contains('open') && !!document.querySelector('.qv-dlg')), 'быстрый просмотр открывается штатно');
  ok(p.errs.filter(e => !/gallery|Failed to load resource|net::ERR/.test(e)).length === 0, 'ошибок JavaScript нет (кроме самого отказа загрузки)', p.errs); await p.ctx.close();

  await b.close(); srv.close();
  console.log('\nИтого: ✓ ' + pass + '  ✗ ' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
