#!/usr/bin/env node
/* Проверка «Стеллы-навигатора» в браузере (data/redesign.json → extras.navigator): сравнение через Стеллу, команды «открой / покажи / отфильтруй / проведи», экскурсии,
   точки входа и проактивная подсказка на каждой странице, телефон, а также «рамки» ИИ-режима: внешние ссылки вырезаются, названия товаров ведут на наш сайт,
   под объяснениями о коже — плашка «не медицинская рекомендация», чужие маркеры действий отбрасываются. ИИ подменён поддельным клиентом (сеть и ключ не нужны).
   Запуск: node tools/check-navigator.js  (после node tools/build.js). Нужны Playwright и Chromium. Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path');
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const H = require('../server/test/helpers');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const redesign = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/redesign.json'), 'utf8')).extras || {};
  if (!redesign.enabled || !redesign.assistant || !redesign.navigator) { console.log('Навигатор выключен в data/redesign.json — проверка пропущена.'); process.exit(0); }
  process.env.ASSISTANT_MODEL = 'fake-model'; delete process.env.ANTHROPIC_API_KEY;
  const S = await H.boot({}); const A = require('../server/lib/assistant');
  const calls = []; let script = [], round = 0; const set = r => { script = r; round = 0; };
  A.setClientFactory(() => ({messages: {stream(params) {
    calls.push(JSON.parse(JSON.stringify(params))); const h = {}, r = script[Math.min(round++, script.length - 1)];
    return {on(ev, cb) { h[ev] = cb; return this; }, abort() {}, async finalMessage() {
      for (const c of r.chunks || []) { h.text && h.text(c); }
      const content = []; if ((r.chunks || []).length) content.push({type: 'text', text: r.chunks.join('')}); (r.tools || []).forEach((t, i) => content.push({type: 'tool_use', id: 'tu' + round + i, name: t.name, input: t.input}));
      return {content, stop_reason: (r.tools || []).length ? 'tool_use' : 'end_turn'};
    }};
  }}}));
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const base = 'http://127.0.0.1:' + S.port + '/';
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js/data.js'), 'utf8').replace(/^[^=]*=\s*/, '').replace(/;\s*$/, ''));
  const mk = async (o) => {
    o = o || {}; const ctx = await b.newContext({viewport: o.mobile ? {width: 390, height: 844} : {width: o.w || 1280, height: o.h || 860}, isMobile: !!o.mobile, hasTouch: !!o.mobile, locale: 'ru-RU'}); await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const d = document.querySelector('[data-shw-list]'); if (d) d.open = true; }); });
    await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await ctx.route('**/astreya/**', r => r.continue({url: r.request().url().replace('/astreya/', '/')})); /* страница 404 ссылается на ресурсы с префиксом /astreya/ (адрес сайта на GitHub Pages) */
    await ctx.addInitScript(sp => { window.ASTREYA_MOTION_SPEED = sp; }, o.speed || 8);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.|status of (429|503)|404 \(Not Found\)/.test(m.text())) p.errs.push(m.text()); }); p.on('response', r => { if (r.status() >= 400 && !/fonts\./.test(r.url()) && !/\/404\.html$|\/assets\/jar\//.test(r.url())) p.errs.push('HTTP ' + r.status() + ' ' + r.url()); });
    if (!o.ai) await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    p.open = async url => { await p.goto(base + url); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await p.waitForSelector('#asst-fab.in', {timeout: 20000}); await wait(300); };
    p.idle = () => p.waitForFunction(() => { const f = document.getElementById('asst-form'); return f && !f.classList.contains('busy'); }, null, {timeout: 25000});
    p.ask = async q => { if (!(await p.evaluate(() => document.body.classList.contains('asst-open')))) { await p.click('#asst-fab'); await p.waitForSelector('#asst-in', {state: 'visible'}); await wait(600); await p.idle(); } await p.fill('#asst-in', q); await p.keyboard.press('Enter'); await p.idle(); await wait(200); };
    p.spot = async () => { await wait(750); return p.spot0(); };
    p.spot0 = () => p.evaluate(() => { const s = document.querySelector('#g-spot'); if (!s || s.hidden) return null; const h = s.querySelector('.g-hole').getBoundingClientRect(); return {txt: s.querySelector('.g-tx').textContent.trim(), step: (s.querySelector('.g-st') || {}).textContent || '', hole: {x: h.x, y: h.y, w: h.width, h: h.height}, btns: [...s.querySelectorAll('.g-ctl button')].map(x => x.textContent.trim())}; });
    p.lastBot = () => p.evaluate(() => { const rows = [...document.querySelectorAll('#asst-log .asst-m.asst-b')].filter(r => !r.classList.contains('asst-typing')), r = rows[rows.length - 1]; if (!r) return null; return {text: r.querySelector('.asst-tx').textContent, cards: [...r.querySelectorAll('.asst-card-a')].map(a => a.getAttribute('href')), disc: !!r.querySelector('.asst-disc'), links: [...r.querySelectorAll('.asst-tx a')].map(a => a.getAttribute('href')), btns: [...r.querySelectorAll('.asst-acts button')].map(x => ({t: x.textContent.trim(), act: x.getAttribute('data-act')})), all: r.innerHTML}; });
    return p;
  };
  const dataPage = p => p.evaluate(() => document.body.getAttribute('data-page'));

  /* ================= A. без ИИ, компьютер ================= */
  console.log('\n[A. Навигатор без ИИ, компьютер]');
  let p = await mk(); await p.open('catalog.html');
  ok(await p.evaluate(() => { const e = document.querySelector('.g-entry'); return !!e && /Не знаете, что выбрать/.test(e.textContent) && e.querySelectorAll('.chip').length >= 2; }), 'в каталоге есть блок «Не знаете, что выбрать?» с готовыми вопросами');
  const adds = await p.$$('.pcard:not([hidden]) .cmp-add'); await adds[0].click(); await wait(250); await adds[1].click(); await wait(500);
  const bar = await p.evaluate(() => { const b = document.querySelector('#cmp-bar'); return {hidden: b.hidden, txt: b.textContent.replace(/\s+/g, ' '), names: [...b.querySelectorAll('.cmp-names li')].length, ask: !!b.querySelector('.cmp-ask'), oldBtn: !!b.querySelector('.cmp-open')}; });
  ok(!bar.hidden && /Попросить Стеллу рассказать/.test(bar.txt) && bar.names === 2 && bar.ask && !bar.oldBtn, 'после выбора двух товаров появляется плашка «Попросить Стеллу рассказать» со списком выбранного (без старой кнопки таблицы)', bar);
  await p.click('.cmp-ask'); await wait(900); await p.idle(); await wait(300);
  let r = await p.lastBot();
  ok(r && /Сравниваю|Давайте сравним|Смотрю на/.test(r.text) && /Что общего/.test(r.text) && /Чего на сайте нет/.test(r.text), 'Стелла рассказывает о выбранных товарах: общее, различия, кому что ближе, чего нет на сайте', r && r.text.slice(0, 120));
  ok(r && r.cards.length === 2 && r.cards.every(h => /^products\/.+\.html$/.test(h)), 'под рассказом — карточки обоих товаров со ссылками на страницы сайта', r && r.cards);
  ok(r && r.disc && /не медицинская рекомендация/.test(r.all), 'под рассказом — плашка «Справочная информация · не медицинская рекомендация»');
  ok(r && r.links.length >= 2 && r.links.every(h => !/^(https?:)?\/\//.test(h)), 'названия товаров в тексте — ссылки только на этот сайт', r && r.links);
  ok(await p.evaluate(() => !document.querySelector('.cmp-t, .cmp-dlg') && !document.querySelector('#modal.open')), 'таблицы сравнения нигде нет');
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:cmp') || '[]')).length) === 2, 'выбранные товары остаются в плашке');
  await p.evaluate(() => { window.Astreya.stella.close(true); window.Astreya.actions['cmp-clear'](); }); await wait(700);
  await p.evaluate(() => window.Astreya.actions['cmp-toggle'](null, window.ASTREYA_DATA.products[3].id)); await wait(300); await p.click('.cmp-ask'); await wait(900); await p.idle(); await wait(300);
  r = await p.lastBot(); ok(r && /Расскажу о|разберём/.test(r.text) && r.cards.length === 1, 'один отмеченный товар — Стелла рассказывает о нём', r && r.text.slice(0, 80));
  await p.evaluate(() => window.Astreya.actions['cmp-clear']());

  await p.ask('где фильтры?'); let sp = await p.spot();
  ok(sp && /сужаете выбор/.test(sp.txt) && (sp.hole.w > 300 || sp.hole.h > 400) && sp.btns.includes('Понятно') && await p.evaluate(() => !document.body.classList.contains('asst-open')), '«где фильтры?» — чат убирается, фильтры подсвечены с пояснением', sp);
  await p.keyboard.press('Escape'); await wait(200); ok(!(await p.spot()), 'Esc закрывает подсветку');
  ok(await p.evaluate(() => { const t = window.ASTREYA_DATA.guide.tours.find(x => x.id === 'site'); const pages = new Set(t.steps.map(x => x.page)); return !!t && !t.menu && t.steps.length >= 28 && t.groups.length === 9 && ['home', 'catalog', 'product', 'brands', 'training', 'news', 'start', 'partners', 'company', 'contacts'].every(k => pages.has(k)) && t.steps.every(x => [].concat(x.say).every(s => s.length <= 180)) && !t.steps.some(x => x.bridge) && !/Начнём с меню|телефон менеджера здесь|Шаг 1 из 4/.test(JSON.stringify(t)); }), 'экскурсия охватывает все разделы (главная, каталог, товар, бренды, обучение, новости, «Старт со Стеллой», партнёры, компания, контакты), 9 этапов, у каждого раздела по нескольку шагов, реплика не длиннее 180 знаков; прежнего ознакомления по меню и «мостиков» нет');
  ok(await p.evaluate(() => { const t = window.ASTREYA_DATA.guide.tours.find(x => x.id === 'site'), pg = window.ASTREYA_DATA.guide.pages, n = {}; t.steps.forEach(x => { const w = [].concat(x.say)[0].split(/[\s,—]+/)[0]; n[w] = (n[w] || 0) + 1; }); const first = t.steps.map(x => [].concat(x.say)[0].split(/[\s,—]+/)[0]); return Math.max(...Object.values(n)) <= 3 && first.every((w, k) => k === 0 || w !== first[k - 1]) && !t.steps.some(x => /^(Идём дальше|Дальше|Теперь сюда|Следующий шаг)/.test([].concat(x.say)[0])) && ['brands', 'training', 'news', 'company', 'partners', 'contacts'].every(id => { const q = pg.find(z => z.id === id); return q && q.nav && q.go; }); }), 'реплики не начинаются одинаково («Идём дальше», «Теперь сюда»…): ни одно первое слово не встречается больше трёх раз и два шага подряд не открываются одним словом; для каждого раздела задано, какой пункт меню нажать и что сказать по дороге');
  await p.ask('отфильтруй по пигментации'); await wait(1500);
  const fl = await p.evaluate(() => ({task: document.querySelector('#f-task').value, count: document.querySelector('#res-count').textContent, shown: [...document.querySelectorAll('.pcard')].filter(c => !c.hidden).length}));
  sp = await p.spot(); ok(fl.task === 'pigment' && fl.shown > 0 && fl.shown < 30 && sp && /Найдено/.test(sp.txt), '«отфильтруй по пигментации» — фильтр выставлен, показано ' + fl.shown + ' из 30, Стелла указывает на результат', {fl, sp});
  await p.keyboard.press('Escape');
  await p.ask('покажи бренды'); await wait(2800); ok(await dataPage(p) === 'brands' && await p.evaluate(() => document.body.classList.contains('asst-open')), '«покажи бренды» — открыта страница брендов, чат остался рядом');
  await p.ask('где поиск по брендам'); await wait(900); sp = await p.spot(); ok(sp && /искать бренд/.test(sp.txt), 'на странице брендов Стелла показывает поиск по брендам', sp);
  await p.keyboard.press('Escape');
  await p.ask('открой страницу для партнёров'); await wait(2800); ok(await dataPage(p) === 'partners', '«открой страницу для партнёров» → страница «Стать партнёром»');
  await p.ask('где калькулятор скидок?'); await wait(900); sp = await p.spot(); ok(sp && /ползунок/.test(sp.txt) && sp.hole.w > 200, 'калькулятор скидок подсвечен', sp);
  await p.keyboard.press('Escape');
  await p.ask('как сделать заказ? проведи по шагам'); await p.waitForFunction(() => { const s = document.querySelector('#g-spot'); return s && !s.hidden && /Шаг 1/.test(s.textContent); }, null, {timeout: 9000}).catch(() => {}); sp = await p.spot();
  ok(sp && /^1 из 2/i.test(sp.step), 'экскурсия «Как запросить информацию» начинается со страницы каталога (перешла сама)', sp);
  ok(await dataPage(p) === 'catalog', 'для неё Стелла сама открыла каталог');
  await p.click('.g-ctl [data-act="g-tour-next"]'); await wait(2800); sp = await p.spot();
  ok(await dataPage(p) === 'product' && sp && /Запросить информацию/.test(sp.txt), '«Открыть первый товар» → страница товара, экскурсия продолжилась сама: подсвечена кнопка «Запросить информацию»', {page: await dataPage(p), sp});
  await p.keyboard.press('Escape'); await wait(300);
  const prodUrl = p.url().replace(base, '');
  await p.ask('С чем сочетать этот товар?'); r = await p.lastBot(); ok(r && r.text.length > 20, 'на странице товара Стелла понимает «этот товар» и отвечает');
  const pr = await p.evaluate(() => document.querySelector('.p-page[data-product]').getAttribute('data-product'));
  ok(await p.evaluate(() => !!document.querySelector('.g-entry') && /об этом продукте/.test(document.querySelector('.g-entry').textContent)), 'на странице товара есть блок «Спросите Стеллу об этом продукте»');
  void pr; void prodUrl;
  ok(!p.errs.length, 'нет ошибок JS и консоли', p.errs);
  await p.context().close();

  /* ---------- экскурсия «Покажи сайт»: что Стелла говорит на каждом из 32 шагов (страница, окончательная реплика) ---------- */
  const STEP = [
    ['home', /Вверху всегда под рукой/], ['home', /Отсюда два пути/],
    ['catalog', /по слову «.+» из \d+ позиций осталась 1/], ['catalog', /Выбрала «Пигментация» — и в каталоге \d+ позиций из 30/], ['catalog', /вместо 30 позиций осталось \d+/], ['catalog', /Не можете выбрать между двумя/], ['catalog', /Загляните в карточку/],
    ['product', /Тут собраны факты/], ['product', /«В список запроса» копит/], ['product', /главная кнопка карточки/],
    ['brands', /осталось брендов — \d+/], ['brands', /У каждого бренда своя карточка/],
    ['training', /календарь встреч/], ['training', /Выбрала «.+» и «.+» — осталось встреч: \d+/], ['training', /Так выглядит встреча/], ['training', /преподаватели центра/], ['training', /материалы для специалистов/],
    ['news', /Нажала «.+» — и показаны только эти записи: \d+/], ['news', /Вот пример: «.+»/], ['news', /Почта введена/],
    ['company', /Тут мы рассказываем о себе/], ['company', /Вот, нажала «.+»/], ['company', /помогает решиться на первый заказ/],
    ['partners', /Что получает партнёр/], ['partners', /При закупке на 150 000 ₽ ваша скидка — 10%\..*ориентир/], ['partners', /Ступени такие: 5% от 50 000 ₽, 10% от 150 000 ₽, 15% от 300 000 ₽/], ['partners', /Готово: заявка заполнена/],
    ['start', /Здесь мы разговариваем/], ['start', /Можно написать всё одной фразой/],
    ['contacts', /Связаться можно как удобно/], ['contacts', /Вопрос написан/],
    ['contacts', /Вот и всё/]
  ];
  const GROUP = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 7, 7, 8, 8, 8];
  const GNAME = ['Главная', 'Каталог', 'Бренды', 'Обучение', 'Новости', 'Компания', 'Партнёрам', 'Старт со Стеллой', 'Контакты'];

  /* ---------- точки входа на всех типах страниц ---------- */
  console.log('\n[Экскурсия «Покажи сайт»: компьютер, курсор, все разделы от главной до финала]');
  p = await mk({speed: 14}); const leadPosts = []; p.on('request', r => { if (r.method() === 'POST' && /\/api\/lead/.test(r.url())) leadPosts.push(r.url()); }); await p.open('catalog.html');
  /* ждём, пока на экране нужная реплика, а подсветка и карточка перестанут двигаться (страница доехала, анимация кончилась) */
  const same = (a, b) => ['x', 'y', 'w', 'h'].every(k => Math.abs(a.hole[k] - b.hole[k]) < 1) && Math.abs(a.pop.y - b.pop.y) < 1 && Math.abs(a.pop.x - b.pop.x) < 1 && a.y === b.y;
  const stableAt = async (snap, pg, re, ms) => {
    let x = null; const t0 = Date.now();
    while (Date.now() - t0 < (ms || 40000)) {
      x = await snap();
      if (x && x.page === pg && re.test(x.tx.replace(/\u00a0/g, ' '))) { let prev = x, cur = x; for (let k = 0; k < 28; k++) { await wait(250); cur = await snap(); if (!cur) return x; if (cur.page === pg && re.test(cur.tx.replace(/\u00a0/g, ' ')) && same(prev, cur)) return cur; prev = cur; } return cur; }
      await wait(150);
    }
    return x;
  };
  const T = {
    snap: () => p.evaluate(() => { const s = document.getElementById('g-spot'); if (!s || s.hidden) return null; const h = document.querySelector('.g-hole').getBoundingClientRect(), pp = document.querySelector('.g-pop').getBoundingClientRect(), c = document.getElementById('g-cursor');
      return {page: document.body.getAttribute('data-page'), tx: s.querySelector('.g-tx p').textContent.replace(/ /g, ' '), st: (s.querySelector('.g-st') || {}).textContent || '', btns: [...s.querySelectorAll('.g-ctl button')].map(b => b.textContent.trim()), hole: {x: h.x, y: h.y, w: h.width, h: h.height}, pop: {x: pp.x, y: pp.y, w: pp.width, h: pp.height}, vw: innerWidth, vh: innerHeight, y: scrollY, cursor: !!c && !c.hidden && c.classList.contains('on')}; }),
    press: async label => { await p.evaluate(l => { const b = [...document.querySelectorAll('#g-spot .g-ctl button')].find(x => x.textContent.trim() === l); if (b) b.click(); }, label); },
    next: () => p.evaluate(() => { const b = document.querySelector('#g-spot .g-ctl .btn-fill'); if (b) b.click(); }),
    until: async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { const r = await p.evaluate(fn).catch(() => false); if (r) return true; await wait(150); } return false; },
    at: (pg, re, ms) => stableAt(T.snap, pg, re, ms),
    prod0: D.products[0].name.split(/\s+/)[0]
  };
  const inView = x => x && x.hole.w > 8 && x.hole.h > 8 && x.hole.x >= 0 && x.hole.y >= 0 && x.hole.x + x.hole.w <= x.vw + 1 && x.hole.y + x.hole.h <= x.vh + 1;
  /* рамка подсветки обходит блок целиком (не обрезает), лежит в пределах экрана, а карточка Стеллы не наезжает на блок */
  const fitOf = (pg, i, mob) => pg.evaluate(({i, mob}) => { const G = window.ASTREYA_DATA.guide, t = G.tours.find(x => x.id === 'site'), st = t.steps[i]; let s = mob && st.msel ? st.msel : st.sel; if (!s && st.target) { const tg = ((G.targets[st.page] || []).concat(G.targets['*'] || [])).find(x => x.id === st.target); s = tg && tg.sel; } const sp = document.getElementById('g-spot'); if (!sp || sp.hidden || !s) return null;
    const el = [...document.querySelectorAll(s)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (!el) return null; const r = el.getBoundingClientRect(), h = sp.querySelector('.g-hole').getBoundingClientRect(), pp = sp.querySelector('.g-pop').getBoundingClientRect();
    const ox = Math.max(0, Math.min(h.right, pp.right) - Math.max(h.left, pp.left)), oy = Math.max(0, Math.min(h.bottom, pp.bottom) - Math.max(h.top, pp.top));
    return {crop: h.bottom < r.bottom - 2 || (h.top > r.top + 1 && r.top > 0) || h.left > r.left + 1 || h.right < r.right - 2, ov: Math.round(ox * oy), out: h.bottom > innerHeight + 1, el: [r.x, r.y, r.width, r.height].map(Math.round), hole: [h.x, h.y, h.width, h.height].map(Math.round)}; }, {i, mob});
  const noOverlap = x => x && (x.pop.x + x.pop.w <= x.hole.x || x.pop.x >= x.hole.x + x.hole.w || x.pop.y + x.pop.h <= x.hole.y || x.pop.y >= x.hole.y + x.hole.h);
  ok(await p.evaluate(() => !document.getElementById('g-spot') || document.getElementById('g-spot').hidden) && !(await p.evaluate(() => sessionStorage.getItem('astreya:g-tour'))), 'экскурсия сама не запускается: после загрузки страницы подсветки и состояния экскурсии нет');
  await p.click('#asst-fab'); await p.waitForSelector('#asst-in', {state: 'visible'}); await wait(700); await p.idle();
  const ch0 = await p.evaluate(() => [...document.querySelectorAll('#asst-qr .chip')].map(c => c.textContent.trim()));
  ok(ch0[0] === 'Покажи сайт' && await p.evaluate(() => !!document.querySelector('.asst-ib-tour[data-act="asst-tour-site"]')), 'в панели Стеллы есть постоянная кнопка-компас «Показать сайт — экскурсия» и первый быстрый ответ «Покажи сайт»', ch0);
  ok(await T.snap() === null, 'открытие панели Стеллы экскурсию не запускает');
  await p.click('.asst-ib-tour'); await T.until(() => { const s = document.getElementById('g-spot'); return s && !s.hidden && document.body.getAttribute('data-page') === 'home'; }, 20000); await wait(900);
  const tb = await p.lastBot(); ok(tb && /девять остановок/.test(tb.text) && !tb.btns.length, 'Стелла отвечает «покажу сайт» без кнопки «Начать» — экскурсия идёт сама', tb && [tb.text.slice(0, 60), tb.btns]);
  let x = await T.at('home', STEP[0][1], 20000);
  ok(x && x.page === 'home' && /^1 из 9/.test(x.st) && /Главная/.test(x.st) && x.btns.join() === 'Далее,Пропустить', 'с каталога экскурсия сама перешла на главную и началась: «1 из 9 · Главная», кнопки «Далее» и «Пропустить»', x);
  ok(inView(x) && noOverlap(x) && /проведу/.test(x.tx) && x.hole.y < 120, 'шаг 1: коротко о том, что покажет Стелла, и подсвечена настоящая шапка (меню, поиск, «Стать партнёром»), карточка не перекрывает её', x);
  ok(await p.evaluate(() => { const A = document.querySelector('.arch-story:not(.jar-off)'), h = A ? A.querySelector('.ar-copy') : document.querySelector('.hero'), b = A ? A.querySelector('.ar-cta a') : document.querySelector('.hero-copy .row a'), r = h.getBoundingClientRect(), br = b.getBoundingClientRect(), hb = document.querySelector('#hdr').getBoundingClientRect().bottom; let o = 1; for (let n = b; n && n !== document.body; n = n.parentElement) o *= +getComputedStyle(n).opacity; return !document.getElementById('g-spot').classList.contains('g-nodim') && (A ? (r.top >= hb - 4 && r.top < innerHeight * .45) : Math.abs(r.top - 76) < 16) && o > .98 && br.top > 0 && br.bottom < innerHeight; }), 'первый шаг показан на первом кадре главной: герой стоит прямо под шапкой, кнопки видны целиком над комментарием, затемнение вокруг рамки шапки на месте');
  ok(await T.until(() => { const c = document.getElementById('g-cursor'); return !!c && !c.hidden && c.classList.contains('on'); }, 6000), 'у Стеллы есть курсор: он появился и «ходит» по шапке, о которой она говорит');
  /* страница закреплена: колесо, клавиши и прокрутка из кода не двигают ни подсветку, ни Стеллу */
  {
    const sn0 = await T.snap(); await p.mouse.move(640, 500); await p.mouse.wheel(0, 900); await wait(250); await p.keyboard.press('PageDown'); await wait(250); await p.evaluate(() => window.scrollTo(0, 0)); await wait(1500); const sn1 = await T.snap();          /* на главной у вступления свои обработчики прокрутки: после рывка к началу страница на мгновение «вздрагивает» и возвращается */
    ok(sn1 && Math.abs(sn1.y - sn0.y) < 3 && Math.abs(sn1.hole.y - sn0.hole.y) < 2 && Math.abs(sn1.pop.x - sn0.pop.x) < 2 && Math.abs(sn1.pop.y - sn0.pop.y) < 2, 'на время экскурсии страница закреплена: колесо мыши, PageDown и прокрутка из кода не сдвигают ни подсветку, ни карточку Стеллы', [sn0 && [sn0.y, sn0.hole.y, sn0.pop.y], sn1 && [sn1.y, sn1.hole.y, sn1.pop.y]]);
  }
  const badStep = [], badFit = [], seen = [], popBottoms = [];
  let x2 = null, firstHref = '';
  for (let i = 1; i < STEP.length; i++) {
    const [pg, re] = STEP[i];
    await T.next();
    x2 = await T.at(pg, re); seen.push(x2 && x2.page); if (x2 && i < STEP.length - 1) popBottoms.push([i, Math.round(x2.pop.y + x2.pop.h), await p.evaluate(() => document.querySelector('#g-spot .g-pop').classList.contains('dock-top'))]);
    if (i < STEP.length - 1 && i !== 26 && i !== 30) { const fe = await fitOf(p, i, false); if (fe && (fe.crop || fe.out || fe.ov > 60)) badFit.push([i, fe]); }
    if (i === 5) { /* «Показать на примере» — отметка двух товаров только по нажатию посетителя */
      ok(inView(x2) && /⇄/.test(x2.tx) && x2.btns.includes('Показать на примере') && await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:cmp') || '[]')).length === 0), 'шаг «Сравнение»: подсвечен значок ⇄ у карточек; без вашего нажатия ничего не отмечено', x2);
      await T.press('Показать на примере'); await T.until(() => (JSON.parse(localStorage.getItem('astreya:cmp') || '[]')).length === 2 && !document.querySelector('#cmp-bar').hidden, 25000); await wait(700); const xo = await T.snap();
      ok(xo && /два продукта отмечены/.test(xo.tx) && xo.btns.includes('Рассказать о товарах'), 'по явному нажатию «Показать на примере» курсор сам отметил два товара, видна плашка сравнения', xo && [xo.tx, xo.btns]);
    }
    const need = GNAME[GROUP[i]]; const good = x2 && x2.page === pg && re.test(x2.tx) && inView(x2) && x2.btns.includes('Назад') && new RegExp('^' + (GROUP[i] + 1) + ' из 9 · ' + need).test(x2.st);
    if (!good) badStep.push([i, x2 && [x2.page, x2.st, x2.tx.slice(0, 60), inView(x2)]]);
    if (i === 6) ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:cmp') || '[]')).length === 0), 'следующий шаг: товары, которые отметила экскурсия, сняты — сравнение пустое');
    if (i === 6) { firstHref = await p.evaluate(() => { const c = [...document.querySelectorAll('.pcard')].find(c => !c.hidden); return new URL(c.querySelector('a.stretch').href).pathname; }); }
    if (i === 7) ok(await p.evaluate(h => location.pathname === h, firstHref) && /^products\//.test(firstHref.replace(/^\//, '')), 'курсор нажал на карточку — открылась страница товара из отфильтрованного списка (' + firstHref + ')');
    if (i === 2) { const sq = await p.evaluate(() => ({q: document.getElementById('cat-q').value, c: document.getElementById('res-count').textContent, t: document.getElementById('cat-q').classList.contains('g-typing')})); ok(sq.q === T.prod0 && /Найдено: 1 из/.test(sq.c) && sq.t && x2.cursor, 'шаг «поиск»: в строке набрано «' + T.prod0 + '» (поле подсвечено синим), в каталоге реально осталась 1 карточка', [sq, x2 && x2.cursor]); }
    if (i === 3) { const sf = await p.evaluate(() => ({task: document.getElementById('f-task').value, q: document.getElementById('cat-q').value, c: document.getElementById('res-count').textContent, url: location.search, dd: !!document.getElementById('g-dd') && !document.getElementById('g-dd').classList.contains('on')})); ok(sf.task === 'pigment' && sf.q === '' && /Найдено: [2-9]\d* из/.test(sf.c) && /task=pigment/.test(sf.url) && sf.dd, 'шаг «назначение»: запрос очищен, меню закрылось, выбрана «Пигментация» — каталог отфильтрован: ' + sf.c, sf); }
    if (i === 4) { const sc = await p.evaluate(() => ({task: document.getElementById('f-task').value, c: document.getElementById('res-count').textContent})); ok(sc.task === 'all' && /Найдено: \d+ из 30/.test(sc.c) && new RegExp('осталось ' + sc.c.match(/Найдено: (\d+)/)[1] + '[^\\d]').test(x2.tx), 'шаг «категории»: фильтр назначения сброшен, курсор нажал на плитку категории — число в реплике совпадает со страницей: ' + sc.c, [sc, x2 && x2.tx]); }
    if (i === 10) ok(await p.evaluate(() => { const v = [...document.querySelectorAll('#br-grid .bl-card')].filter(c => !c.hidden).length; return v > 0 && v < document.querySelectorAll('#br-grid .bl-card').length; }), 'шаг «бренды по задаче»: курсор нажал на задачу — часть брендов скрылась, остальные видны');
    if (i === 13) ok(await p.evaluate(() => document.querySelector('#city-chips .chip.on').getAttribute('data-id') !== 'all' && document.querySelector('#fmt-chips .chip.on').getAttribute('data-id') !== 'all'), 'шаг «обучение: фильтры»: выбраны город и формат, расписание сузилось');
    if (i === 17) ok(await p.evaluate(() => { const on = document.querySelector('#news-tabs .chip.on, #news-tabs [aria-pressed="true"]'); return !!on && !/^Все/.test(on.textContent.trim()); }), 'шаг «новости»: курсор нажал на вкладку — показана не вся лента');
    if (i === 19) { const sb = await p.evaluate(() => { const e = document.querySelector('.ftr-sub input[type=email]'), c = document.querySelector('.ftr-sub input[type=checkbox]'); return {v: e.value, agree: c ? c.checked : null}; }); ok(/^demo\.[a-z]+\d\d@example\.com$/.test(sb.v) && sb.agree === false && /выдуманн|придума/.test(x2.tx) && /[Сс]огласи/.test(x2.tx) && !leadPosts.length, 'шаг «подписка»: Стелла ввела придуманную почту (' + sb.v + ') в поле подписки; согласие не отмечено, ничего не отправлено', [sb, x2.tx]); }
    if (i === 24) ok(await p.evaluate(() => document.getElementById('calc-range').value === '150000'), 'калькулятор: курсор взял ползунок и довёл его до порога 10% (150 000 ₽)');
    if (i === 26) ok(await p.evaluate(() => !document.querySelector('#modal.open')) && !(await p.evaluate(() => sessionStorage.getItem('astreya:rl') || localStorage.getItem('astreya:rl'))), 'экскурсия не отправляла форм и ничего не добавила в список запроса — заявка и «корзина» не затронуты');
    if (i === 26 || i === 30) {
      const fv = await p.evaluate(() => { const f = document.querySelector('.lead-form'), o = {}; [...f.elements].forEach(e => { if (e.name && e.type !== 'hidden' && e.name !== 'company_site') o[e.name] = e.type === 'checkbox' ? e.checked : e.value; }); return o; });
      const full = i === 26 ? ['name', 'phone', 'email', 'city', 'org', 'spec', 'msg'] : ['name', 'phone', 'email', 'msg'];
      ok(full.every(k2 => (fv[k2] || '').length > 1) && / /.test(fv.name) && /@example\.com$/.test(fv.email) && /^\+7 \(9\d\d\) 555-01-\d\d$/.test(fv.phone) && fv.msg.length >= 20 && fv.msg.length <= 110 && fv.agree === false, 'шаг «' + (i === 26 ? 'заявка партнёра' : 'вопрос в контактах') + '»: Стелла сама заполнила все поля придуманными данными (имя, телефон, почта на example.com' + (i === 26 ? ', город, организация, специализация' : '') + ') и коротким комментарием; галочку согласия не ставила', fv);
      ok(/выдуманн|придума/.test(x2.tx) && /согласия|согласие/.test(x2.tx) && !leadPosts.length, 'в реплике честно сказано, что данные придуманы, а согласие и отправка — за посетителем; ни одного запроса на сервер заявок не ушло', [x2.tx, leadPosts]);
    }
  }
  ok(!badStep.length, 'все ' + STEP.length + ' шагов экскурсии прошли по порядку: нужная страница, окончательная реплика, подсвеченный элемент на экране, «Назад», номер этапа (1–9) и его название', badStep.slice(0, 4));
  ok(!badFit.length, 'рамка подсветки на каждом шаге обходит блок целиком (не обрезает), помещается на экране, а карточка Стеллы не наезжает на подсвеченное', badFit.slice(0, 3));
  { const bs = popBottoms.filter(r => !r[2]).map(r => r[1]), tops = popBottoms.filter(r => r[2]).length;
    ok(bs.length > 24 && Math.max(...bs) - Math.min(...bs) <= 2 && tops <= 6, 'комментарий Стеллы стоит на одном месте: на компьютере у нижнего края по центру на всех ' + bs.length + ' шагах (низ ' + Math.min(...bs) + '–' + Math.max(...bs) + ' px), наверху — только ' + tops + ' шагов, где страница кончается и блок не поднять (подписка внизу, заявки, финал)', {bs: [...new Set(bs)], tops}); }
  const order = []; seen.forEach(pg => { if (order[order.length - 1] !== pg) order.push(pg); });
  ok(order.join() === 'home,catalog,product,brands,training,news,company,partners,start,contacts', 'разделы шли в логичном порядке: ' + order.join(' → '));
  x = await T.snap();
  ok(x && /Вот и всё/.test(x.tx) && ['Вернуться на главную', 'Старт со Стеллой', 'Спросить Стеллу', 'Закрыть'].every(b => x.btns.includes(b)) && !x.btns.includes('Открыть каталог') && !x.btns.includes('Подобрать по задаче') && /^9 из 9/.test(x.st) && inView(x), 'финал: вместо «Открыть каталог» — «Вернуться на главную», рядом «Старт со Стеллой», «Спросить Стеллу» и «Закрыть»', x);
  await T.press('Назад'); await wait(1500); x = await T.at('contacts', /Вопрос написан/); ok(x && /Вопрос написан/.test(x.tx), '«Назад» с последнего шага возвращает к форме «Контактов»');
  await T.next(); await T.at('contacts', /Вот и всё/);
  await T.press('Вернуться на главную'); await T.until(() => document.body.getAttribute('data-page') === 'home', 20000); await wait(900);
  ok(await p.evaluate(() => document.body.getAttribute('data-page') === 'home' && document.getElementById('g-spot').hidden && (!document.getElementById('g-cursor') || document.getElementById('g-cursor').hidden)) && !(await p.evaluate(() => sessionStorage.getItem('astreya:g-tour'))), 'финальная кнопка «Вернуться на главную» открывает главную страницу, показ закрыт, курсор убран');
  await p.evaluate(() => window.Astreya.guide.tour('site', 31)); await T.at('home', /Вот и всё/, 20000);
  await T.press('Старт со Стеллой'); await T.until(() => document.body.getAttribute('data-page') === 'start' && !!document.querySelector('.pchat'), 20000); await wait(900);
  ok(await p.evaluate(() => document.body.getAttribute('data-page') === 'start' && !!document.querySelector('.pchat') && document.getElementById('g-spot').hidden && (!document.getElementById('g-cursor') || document.getElementById('g-cursor').hidden)), 'финальная кнопка «Старт со Стеллой» открывает страницу подбора — окно диалога со Стеллой; курсор и подсветка убраны');
  await p.keyboard.press('Escape'); await wait(300);
  ok(!(await T.snap()) && !(await p.evaluate(() => sessionStorage.getItem('astreya:g-tour'))), 'после выхода пользователь работает с сайтом как обычно: подсветки и состояния экскурсии нет');
  await p.open('catalog.html'); await wait(1200);
  ok(await p.evaluate(n => [...document.querySelectorAll('#cat-grid .pcard')].filter(c => !c.hidden).length === n, D.products.length), 'после выхода в каталоге снова видны все ' + D.products.length + ' товаров (фильтры не залипли)');
  ok(await p.evaluate(() => { const s = [...document.querySelectorAll('select')].filter(e => e.classList.contains('g-open')); return !s.length && !document.querySelector('.g-typing'); }), 'после выхода нет следов показа: ни синей подсветки поля, ни раскрытого меню');
  ok(!p.errs.length, 'в ходе экскурсии нет ошибок JS и консоли', p.errs); await p.context().close();

  /* ---------- настоящий темп: набор по буквам, меню, переход нажатием на пункт меню ---------- */
  console.log('\n[Экскурсия в обычном темпе: неспешный набор, выпадающий список, переход нажатием на меню]');
  p = await mk({speed: 1}); await p.open('catalog.html');
  await p.evaluate(() => window.Astreya.guide.tour('site', 2));
  {
    const vals = [], t0 = Date.now(); let tFirst = 0, tFull = 0, typingOn = false, curOn = false, tPop = 0, tCur = 0;
    while (Date.now() - t0 < 25000) {
      const v = await p.evaluate(() => { const q = document.getElementById('cat-q'), c = document.getElementById('g-cursor'), pp = document.querySelector('#g-spot .g-pop'); return {v: q.value, t: q.classList.contains('g-typing'), c: !!c && !c.hidden && c.classList.contains('on'), po: pp && !document.getElementById('g-spot').hidden ? +getComputedStyle(pp).opacity : 0}; });
      if (v.po > .9 && !tPop) tPop = Date.now(); if (v.c && !tCur) tCur = Date.now();
      if (v.t) typingOn = true; if (v.c) curOn = true; if (v.v && !vals.includes(v.v)) { vals.push(v.v); if (!tFirst) tFirst = Date.now(); } if (v.v === T.prod0) { tFull = Date.now(); break; } await wait(70);
    }
    const per = tFull && tFirst ? (tFull - tFirst) / Math.max(1, T.prod0.length - 1) : 0;
    ok(vals.length >= Math.min(5, T.prod0.length - 1) && typingOn && curOn && per >= 180, 'в обычном темпе слово набирается по буквам неспешно (' + Math.round(per) + ' мс на букву), поле подсвечено синим, курсор виден', {vals: vals.slice(0, 6), per, typingOn, curOn});
  }
  await T.at('catalog', /по слову «.+»/, 20000);
  await T.next();
  {
    const t0 = Date.now(); let ddOn = false, selBefore = true, hovs = new Set(), open = false, picked = 0;
    while (Date.now() - t0 < 30000) {
      const v = await p.evaluate(() => { const d = document.getElementById('g-dd'), s = document.getElementById('f-task'); return {on: !!d && !d.hidden && d.classList.contains('on'), hov: ((d && d.querySelector('.g-dd-o.hov')) || {}).textContent || '', val: s.value, open: s.classList.contains('g-open')}; });
      if (v.on) { ddOn = true; if (v.val !== 'all') selBefore = false; if (v.hov) hovs.add(v.hov); } if (v.open) open = true;
      if (v.val === 'pigment') { picked = Date.now() - t0; break; } await wait(70);
    }
    ok(ddOn && open && selBefore && hovs.size >= 2 && picked > 2500, 'шаг «назначение» в обычном темпе: курсор нажимает на список, меню раскрывается, пункты по очереди подсвечиваются (' + [...hovs].slice(0, 3).join(' → ') + '), и только потом выбрана «Пигментация» (' + (picked / 1000).toFixed(1) + ' с)', {ddOn, open, selBefore, hovs: [...hovs], picked});
  }
  await T.at('catalog', /Выбрала «Пигментация»/, 15000);
  /* переход к следующему разделу: курсор нажимает пункт меню */
  await p.open('products/' + D.products[0].slug + '.html'); await wait(900);
  await p.evaluate(() => window.Astreya.guide.tour('site', 9)); await T.at('product', /главная кнопка карточки/, 20000);
  await T.next();
  {
    const t0 = Date.now(); let goTxt = false, onNav = false, curMoved = false, c0 = '', lastTip = null;
    while (Date.now() - t0 < 30000) {
      const v = await p.evaluate(() => { const s = document.getElementById('g-spot'), c = document.getElementById('g-cursor'), n = document.querySelector('#nav > a.nl[data-nav="/brands"]'), h = s && !s.hidden ? document.querySelector('.g-hole').getBoundingClientRect() : null; const r = n ? n.getBoundingClientRect() : null; const m = c && !c.hidden ? /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(c.style.transform) : null; return {page: document.body.getAttribute('data-page'), tx: s && !s.hidden ? s.querySelector('.g-tx p').textContent : '', ct: c && !c.hidden ? c.style.transform : '', tip: m ? [+m[1] + 4, +m[2] + 3] : null, hole: h ? [h.left, h.top, h.width, h.height] : null, near: !!(h && r && Math.abs(h.left + h.width / 2 - (r.left + r.width / 2)) < 40 && h.top < 120)}; });
      if (/Теперь загляну к брендам/.test(v.tx) && v.page === 'product') { goTxt = true; if (v.near) onNav = true; if (!c0) c0 = v.ct; else if (v.ct !== c0) curMoved = true; if (v.tip && v.hole) lastTip = v; }
      if (v.page === 'brands') break; await wait(70);
    }
    const tipIn = !!lastTip && lastTip.tip[0] >= lastTip.hole[0] && lastTip.tip[0] <= lastTip.hole[0] + lastTip.hole[2] && lastTip.tip[1] >= lastTip.hole[1] && lastTip.tip[1] <= lastTip.hole[1] + lastTip.hole[3];
    ok(tipIn, 'перед нажатием кончик курсора стоит точно на подсвеченном пункте меню «Бренды» (не мимо и не под ним)', lastTip);
    ok(goTxt && onNav && curMoved && await dataPage(p) === 'brands', 'переход в «Бренды»: Стелла говорит по дороге, подсвечивает пункт меню «Бренды», курсор плывёт к нему и нажимает — открылась страница брендов', {goTxt, onNav, curMoved, page: await dataPage(p)});
  }
  await T.at('brands', /осталось брендов/, 30000);
  /* между частями страницы Стелла прокручивает плавно, без рывков */
  await p.open('training.html'); await wait(900);
  await p.evaluate(() => window.Astreya.guide.tour('site', 14)); await T.at('training', /Так выглядит встреча/, 40000);
  await T.next();
  {
    const ys = [], ops = [], t0 = Date.now(); while (Date.now() - t0 < 5500) { const r = await p.evaluate(() => { const pp = document.querySelector('#g-spot .g-pop'), hh = document.querySelector('#g-spot .g-hole'), tg = document.querySelector('#teachers .rd-head'), hr = hh ? hh.getBoundingClientRect() : null, tr = tg ? tg.getBoundingClientRect() : null; return [Math.round(scrollY), pp ? +getComputedStyle(pp).opacity : 0, hh ? +getComputedStyle(hh).opacity : 0, hr && tr && /преподавател/.test((document.querySelector('#g-spot .g-tx p') || {}).textContent || '') ? [hr.top, hr.bottom, hr.width, tr.top, tr.bottom, innerHeight] : null]; }); ys.push([Date.now() - t0, r[0]]); ops.push([ys.length > 1 && r[0] !== ys[ys.length - 2][1], r[1], r[2], r[3]]); await wait(35); }
    const mv = ops.filter(o => o[0]), shownWhileMoving = mv.filter(o => o[1] > .9 && o[2] > .5).length, last = ops[ops.length - 1];
    const total = Math.abs(ys[ys.length - 1][1] - ys[0][1]); let maxStep = 0, dir = 0, back = 0; for (let k = 1; k < ys.length; k++) { const d = ys[k][1] - ys[k - 1][1]; maxStep = Math.max(maxStep, Math.abs(d)); if (d && dir && Math.sign(d) !== dir) back++; if (d) dir = Math.sign(d); }
    const moving = ys.filter((r, k) => k && r[1] !== ys[k - 1][1]).length;
    ok(mv.length >= 10 && shownWhileMoving >= mv.length * .85 && last[1] > .9 && last[2] > .5, 'пока страница прокручивается, рамка и слова Стеллы остаются на экране (' + shownWhileMoving + ' из ' + mv.length + ' кадров)', {mv: mv.length, shownWhileMoving, last});
    const misplaced = ops.filter(o => o[3] && o[3][2] > 0 && o[3][1] - o[3][0] > 2 && (o[3][0] < Math.max(4, o[3][3] - 8) - 4 || o[3][0] > Math.max(4, o[3][3] - 8) + 4 || o[3][1] > Math.min(o[3][5] - 4, o[3][4] + 8) + 4)).length, ghost = ops.filter(o => o[3] && o[3][2] > 0 && o[3][1] - o[3][0] > 2 && (o[3][4] + 8 < 0 || o[3][3] - 8 > o[3][5])).length;
    ok(misplaced === 0 && ghost === 0 && mv.length >= 10, 'рамка не «открывается заранее»: пока блока нет на экране, рамки нет; когда он въезжает — рамка приклеена к нему и обходит его (' + mv.length + ' кадров движения, лишних рамок: ' + (misplaced + ghost) + ')', {misplaced, ghost});
    ok(total > 300 && moving >= 12 && maxStep <= total * 0.2 && back === 0, 'переход к другой части страницы идёт плавной прокруткой: ' + moving + ' промежуточных положений, без рывков и возвратов (макс. шаг ' + maxStep + ' px из ' + total + ')', {total, moving, maxStep, back});
  }
  ok(!p.errs.length, 'в обычном темпе нет ошибок JS и консоли', p.errs); await p.context().close();

  /* ---------- выход, «Назад» между страницами, откат изменений, отсутствующие элементы ---------- */
  console.log('\n[Экскурсия: «Пропустить», «Назад» между страницами, откат изменений, отсутствующий элемент]');
  p = await mk({speed: 14}); await p.open('catalog.html');
  const startTour = async () => { await p.evaluate(() => window.Astreya.guide.tour('site')); await T.until(() => { const s = document.getElementById('g-spot'); return s && !s.hidden; }, 20000); await wait(800); };
  await startTour(); await T.until(() => document.body.getAttribute('data-page') === 'home', 15000);
  await T.next(); await wait(1100); await T.press('Пропустить'); await wait(500);
  ok(!(await T.snap()) && await p.evaluate(() => !sessionStorage.getItem('astreya:g-tour') && !document.body.classList.contains('g-on')), '«Пропустить» на главной: подсветка снята, состояние экскурсии очищено');
  await p.evaluate(() => window.Astreya.guide.tour('site', 2)); await T.at('catalog', /по слову «.+»/, 25000);
  await T.next(); x = await T.at('catalog', /Выбрала «Пигментация»/, 25000);
  ok(await p.evaluate(() => document.getElementById('f-task').value === 'pigment'), 'на шаге подбора фильтр «Пигментация» выставлен');
  await T.press('Пропустить'); await wait(900);
  const rs = await p.evaluate(() => ({task: document.getElementById('f-task').value, q: document.getElementById('cat-q').value, c: document.getElementById('res-count').textContent, url: location.search, spot: !document.getElementById('g-spot').hidden, cur: !!document.getElementById('g-cursor') && !document.getElementById('g-cursor').hidden && document.getElementById('g-cursor').classList.contains('on'), dd: !!document.querySelector('#g-dd.on'), ty: !!document.querySelector('.g-typing')}));
  ok(rs.task === 'all' && rs.q === '' && /Найдено: 30 из 30/.test(rs.c) && rs.url === '' && !rs.spot && !rs.cur && !rs.dd && !rs.ty, '«Пропустить» в каталоге: фильтр и запрос возвращены, адрес очищен, курсор убран — каталог как был', rs);
  /* «Пропустить» в разгар демонстрации: курсор и меню не остаются висеть */
  await p.evaluate(() => window.Astreya.guide.tour('site', 3)); await wait(650); await T.press('Пропустить'); await wait(1200);
  ok(await p.evaluate(() => !document.querySelector('#g-dd.on') && !document.querySelector('select.g-open') && document.getElementById('g-spot').hidden && document.getElementById('f-task').value === 'all'), '«Пропустить» посреди показа: меню закрыто, фильтр не применился, ничего не осталось на экране');
  /* «Назад» со страницы товара возвращает в каталог, экскурсия продолжается */
  await p.evaluate(() => window.Astreya.guide.tour('site', 6)); await T.until(() => !document.getElementById('g-spot').hidden && /Открыть карточку/.test(document.querySelector('#g-spot .g-ctl').textContent), 20000); await wait(700);
  await T.press('Открыть карточку'); await T.until(() => document.body.getAttribute('data-page') === 'product' && !document.getElementById('g-spot').hidden, 25000); await wait(900);
  await T.press('Назад'); await T.until(() => document.body.getAttribute('data-page') === 'catalog' && !document.getElementById('g-spot').hidden, 25000); await wait(900); x = await T.snap();
  ok(x && x.page === 'catalog' && x.btns.includes('Открыть карточку') && inView(x), '«Назад» со страницы товара вернул в каталог, шаг с карточкой снова подсвечен', x);
  await p.keyboard.press('Escape'); await wait(300);
  /* целевой элемент отсутствует — шаг безопасно пропускается */
  await p.evaluate(() => { const q = document.getElementById('cat-q'); q.closest('label').remove(); });
  await p.evaluate(() => window.Astreya.guide.tour('site', 2)); await wait(3500); x = await T.snap();
  ok(x && /под задачу|Пигментация/.test(x.tx), 'поля поиска нет на странице — шаг пропущен без ошибок, экскурсия продолжилась со следующего', x && x.tx);
  await p.keyboard.press('Escape'); await wait(300);
  /* нажатие на карточку не привело к переходу (ссылки нет) — Стелла просит открыть товар самостоятельно */
  await p.evaluate(() => { document.querySelectorAll('.pcard a.stretch').forEach(a => a.removeAttribute('href')); });
  await p.evaluate(() => window.Astreya.guide.tour('site', 6)); await wait(1500); await T.press('Открыть карточку'); await wait(6600); x = await T.snap();
  ok(x && /Откройте товар/.test(x.tx) && x.btns.includes('Пропустить'), 'если карточку нельзя открыть — Стелла предлагает открыть товар самому и продолжить, без ошибок', x && x.tx);
  await p.keyboard.press('Escape'); await wait(200);
  /* калькулятор скидки: Стелла двигает ползунок сама, но при выходе возвращает как было */
  await p.evaluate(() => window.Astreya.guide.tour('site', 24)); await T.until(() => document.body.getAttribute('data-page') === 'partners' && !document.getElementById('g-spot').hidden, 30000); await T.at('partners', /При закупке на 150 000/, 30000);
  ok(await p.evaluate(() => document.getElementById('calc-range').value === '150000'), 'калькулятор: Стелла передвинула ползунок на порог 10% (150 000 ₽)');
  await T.press('Пропустить'); await wait(800);
  ok(await p.evaluate(() => document.getElementById('calc-range').value === '100000' && document.getElementById('g-spot').hidden), '«Пропустить» на калькуляторе: ползунок вернулся на прежнее значение, подсветка снята');
  /* заявка «для примера»: при «Пропустить» придуманные данные стираются */
  await p.evaluate(() => window.Astreya.guide.tour('site', 26)); await T.until(() => document.body.getAttribute('data-page') === 'partners' && !document.getElementById('g-spot').hidden, 30000);
  await T.until(() => { const f = document.querySelector('.lead-form'); return !!f && f.elements.msg.value.length > 20; }, 40000);
  ok(await p.evaluate(() => { const f = document.querySelector('.lead-form'); return !!f.elements.name.value && !!f.elements.msg.value; }), 'заявка заполнена придуманными данными');
  await T.press('Пропустить'); await wait(900);
  ok(await p.evaluate(() => { const f = document.querySelector('.lead-form'); return ['name', 'phone', 'email', 'city', 'org', 'spec', 'msg'].every(k => !f.elements[k].value) && !f.elements.agree.checked && !document.querySelector('.g-typing') && document.getElementById('g-spot').hidden; }), '«Пропустить»: придуманные данные стёрты, поля пустые, подсветка снята');
  ok(!p.errs.length, 'в этих сценариях нет ошибок JS и консоли', p.errs); await p.context().close();

  /* ---------- экскурсия никогда не стартует сама ---------- */
  console.log('\n[Экскурсия не запускается сама]');
  p = await mk({speed: 14}); const bad = [];
  for (const u of ['index.html', 'catalog.html', 'training.html', 'partners.html', 'products/' + D.products[0].slug + '.html']) {
    await p.goto(base + u); const s0 = await p.$('#sp-in'); if (s0) { try { await s0.click({timeout: 1200}); } catch (e) {} } await wait(7000);
    if (await p.evaluate(() => { const s = document.getElementById('g-spot'); return (s && !s.hidden && !!document.querySelector('#g-spot .g-bar')) || !!sessionStorage.getItem('astreya:g-tour'); })) bad.push(u);
  }
  ok(!bad.length, 'на пяти разных страницах за 7 секунд без действий посетителя экскурсия не появилась и её состояния нет', bad); await p.context().close();

  console.log('\n[Точки входа Стеллы на каждой странице]');
  const pages = ['index.html', 'catalog.html', 'brands.html', 'brands/' + D.brands[0].id + '.html', 'products/' + D.products[0].slug + '.html', 'training.html', 'training/' + D.events[0].slug + '.html', 'partners.html', 'contacts.html', 'company.html', 'news.html', 'search.html', '404.html'];
  p = await mk({speed: 14}); const miss = [], anchors = [];
  for (const u of pages) {
    await p.goto(base + u); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} } await p.waitForFunction(() => document.documentElement.classList.contains('ready'), null, {timeout: 30000}).catch(() => {}); await wait(1400);
    const has = await p.evaluate(() => { const e = document.querySelector('.g-entry'); return e ? {t: e.querySelector('b').textContent, chips: e.querySelectorAll('.chip').length, vis: e.getBoundingClientRect().width > 100} : null; });
    if (!has || !has.vis || has.chips < 1) miss.push(u); else anchors.push(u);
  }
  ok(!miss.length, 'блок «Спросите Стеллу» есть на всех ' + pages.length + ' типах страниц: ' + anchors.join(', '), miss);
  ok(!p.errs.length, 'на этих страницах нет ошибок JS', p.errs); await p.context().close();

  /* ---------- всплывающее окно Стеллы: только приветствие на главной ---------- */
  console.log('\n[Всплывающее окно Стеллы: только на главной]');
  p = await mk({speed: 14}); const loud = [];
  for (const u of ['training.html', 'catalog.html', 'brands.html', 'news.html', 'partners.html', 'company.html', 'contacts.html', 'products/' + D.products[0].slug + '.html']) {
    await p.goto(base + u); const s0 = await p.$('#sp-in'); if (s0) { try { await s0.click({timeout: 1200}); } catch (e) {} } await wait(800);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(2600);          // и ждём, и листаем, и «пауза без действий»: раньше именно здесь появлялись подсказки
    await p.evaluate(() => window.scrollTo(0, 0)); await p.mouse.move(300, 0); await wait(1500);
    if (await p.evaluate(() => { const n = document.querySelector('#g-nudge'), t = document.querySelector('#asst-tip'); return !!((n && !n.hidden) || (t && !t.hidden)); })) loud.push(u);
  }
  ok(!loud.length, 'на 8 страницах (каталог, бренды, обучение, новости, партнёры, компания, контакты, товар) всплывающих окон Стеллы нет, сколько ни листай и ни жди', loud);
  ok(await p.evaluate(() => !JSON.parse(sessionStorage.getItem('astreya:g-nudge') || '{"n":0}').n), 'счётчик подсказок нулевой');
  ok(!p.errs.length, 'на этих страницах нет ошибок JS', p.errs); await p.context().close();
  const toStrip = () => { const e = document.querySelector('.g-entry'); if (e) window.scrollTo({top: e.getBoundingClientRect().top + scrollY - innerHeight * .55, behavior: 'instant'}); };
  const helloInfo = () => document.querySelector('.g-hello-w') && (() => { const w = document.querySelector('.g-hello-w'), h = w.querySelector('.g-hello'), r = h.getBoundingClientRect(), s = document.querySelector('.g-entry').getBoundingClientRect(), n = document.querySelector('#g-nudge'); return {side: w.dataset.side, inStrip: w.parentNode.classList.contains('g-entry'), on: w.classList.contains('on'), t: h.querySelector('b').textContent, x: h.querySelector('p').textContent, r: {l: r.left, t: r.top, r: r.right, b: r.bottom}, s: {l: s.left, t: s.top, r: s.right, b: s.bottom}, vw: innerWidth, vh: innerHeight, nudge: !!(n && !n.hidden), tail: getComputedStyle(h, '::after').content !== 'none'}; })();
  for (const [name, o] of [['широкий экран 1852', {w: 1852, h: 940}], ['ноутбук 1280', {}]]) {
    p = await mk(Object.assign({speed: 14}, o)); await p.open('index.html'); await wait(2800);
    ok(await p.evaluate(() => !document.querySelector('.g-hello-w')), name + ': пока идёт вступление с баночкой, приветствия нет');
    await p.evaluate(() => window.scrollTo({top: 700, behavior: 'instant'})); await wait(2500);
    ok(await p.evaluate(() => !document.querySelector('.g-hello-w')), name + ': пока листают вступление и плашка Стеллы не показалась на экране, приветствия нет (листание не вызывает слов Стеллы)');
    await p.evaluate(toStrip); await p.waitForSelector('.g-hello-w.on', {timeout: 15000}).catch(() => {}); await wait(900);
    const wn = await p.evaluate(helloInfo);
    ok(wn && /Добро пожаловать/.test(wn.t) && /Чем могу помочь/.test(wn.x), name + ': на плашке Стеллы появляется «Добро пожаловать… Чем могу помочь…»', wn);
    ok(wn && wn.inStrip && !wn.nudge && wn.tail, name + ': окно — на самой плашке «Не знаете, с чего начать?» (с хвостиком к маскоту), правого нижнего пузыря нет', wn);
    ok(wn && wn.r.l >= 0 && wn.r.r <= wn.vw && wn.r.t >= 0 && wn.r.b <= wn.vh, name + ': окно целиком на экране', wn && wn.r);
    ok(wn && (o.w ? wn.side === 'l' && wn.r.r <= wn.s.l + 1 && wn.r.r >= wn.s.l - 30 && wn.r.t <= wn.s.b && wn.r.b >= wn.s.t : wn.side === 't' && wn.r.b <= wn.s.t + 1 && wn.r.b >= wn.s.t - 30 && wn.r.l >= wn.s.l - 2), name + (o.w ? ': слева от маскота, на уровне плашки' : ': над плашкой, у маскота'), wn);
    const nst = await p.evaluate(() => JSON.parse(sessionStorage.getItem('astreya:g-nudge') || '{}')); ok(nst.seen && nst.seen.hello === 1, name + ': приветствие показано один раз и учтено в сессии', nst);
    await p.click('.g-hello-x'); await wait(700); ok(await p.evaluate(() => !document.querySelector('.g-hello-w')), name + ': крестик закрывает окно');
    await p.goto(base + 'catalog.html'); await wait(800); await p.goto(base + 'index.html'); await wait(900); await p.evaluate(toStrip); await wait(3500);
    ok(await p.evaluate(() => !document.querySelector('.g-hello-w')), name + ': после закрытия в этой сессии приветствие больше не появляется');
    ok(!p.errs.length, name + ': на главной нет ошибок JS', p.errs); await p.context().close();
  }
  p = await mk({speed: 14}); await p.open('index.html'); await wait(2800); await p.evaluate(toStrip); await p.waitForSelector('.g-hello-w.on', {timeout: 15000}).catch(() => {}); await wait(500);
  await p.evaluate(() => { window.Astreya.guide.tour('site', 0); }); await wait(900);
  ok(await p.evaluate(() => !document.querySelector('.g-hello-w')), 'при запуске экскурсии приветствие убирается и не мешает показу');
  await p.keyboard.press('Escape'); await p.context().close();

  /* ================= Б. телефон ================= */
  console.log('\n[Б. Телефон 390×844]');
  p = await mk({mobile: true}); await p.open('catalog.html');
  const mAdds = await p.$$('.pcard:not([hidden]) .cmp-add'); await mAdds[0].click(); await wait(250); await mAdds[1].click(); await wait(600);
  const mb = await p.evaluate(() => { const b = document.querySelector('#cmp-bar'), r = b.getBoundingClientRect(); return {ask: b.querySelector('.cmp-ask-t').textContent, w: r.width, right: r.right, over: document.documentElement.scrollWidth > innerWidth}; });
  ok(mb.ask === 'Спросить Стеллу' && mb.right <= 390 && !mb.over, 'на телефоне плашка короче («Спросить Стеллу») и не вылезает за экран', mb);
  await p.click('.cmp-ask'); await wait(900); await p.idle(); await wait(300); r = await p.lastBot(); ok(r && /Сравниваю|Давайте сравним|Смотрю на/.test(r.text) && r.disc, 'на телефоне сравнение через Стеллу работает, плашка есть');
  await p.ask('где фильтры?'); await wait(800); sp = await p.spot();
  ok(sp && await p.evaluate(() => { const pop = document.querySelector('.g-pop'); const r = pop.getBoundingClientRect(); return pop.classList.contains('sheet') && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }) && await p.evaluate(() => !document.body.classList.contains('asst-open')), 'на телефоне подсказка — нижняя «шторка» внутри экрана, чат свёрнут', sp);
  await p.keyboard.press('Escape'); await wait(1200);
  await p.evaluate(() => window.Astreya.actions['cmp-clear'] && window.Astreya.actions['cmp-clear']());
  const mt = {snap: () => p.evaluate(() => { const s = document.getElementById('g-spot'); if (!s || s.hidden) return null; const h = document.querySelector('.g-hole').getBoundingClientRect(), pp = document.querySelector('.g-pop').getBoundingClientRect(); return {page: document.body.getAttribute('data-page'), tx: s.querySelector('.g-tx p').textContent, st: (s.querySelector('.g-st') || {}).textContent || '', btns: [...s.querySelectorAll('.g-ctl button')].map(b => b.textContent.trim()), hole: {x: h.x, y: h.y, w: h.width, h: h.height}, pop: {x: pp.x, y: pp.y, w: pp.width, h: pp.height}, menu: document.body.classList.contains('menu-open'), y: scrollY, cursor: !!document.getElementById('g-cursor') && !document.getElementById('g-cursor').hidden && document.getElementById('g-cursor').classList.contains('on')}; }),
    press: label => p.evaluate(l => { const b = [...document.querySelectorAll('#g-spot .g-ctl button')].find(x => x.textContent.trim() === l); if (b) b.click(); }, label),
    until: async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(150); } return false; }};
  const mOk = x => x && x.hole.w > 8 && x.hole.x >= 0 && x.hole.x + x.hole.w <= 391 && x.pop.x >= 0 && x.pop.x + x.pop.w <= 391 && x.pop.y >= 0 && x.pop.y + x.pop.h <= 845 && (x.pop.y + x.pop.h <= x.hole.y + 1 || x.pop.y >= x.hole.y + x.hole.h - 1);
  if (!(await p.evaluate(() => document.body.classList.contains('asst-open')))) { await p.click('#asst-fab'); await p.waitForSelector('#asst-in', {state: 'visible'}); await wait(700); }
  await p.click('.asst-ib-tour'); await mt.until(() => document.body.getAttribute('data-page') === 'home' && !document.getElementById('g-spot').hidden, 25000); await wait(1000);
  let mx = await mt.snap(); ok(mx && /^1 из 9/.test(mx.st) && mOk(mx) && !mx.menu, 'на телефоне: экскурсия с каталога перешла на главную, шаг 1, карточка — нижняя «шторка», не перекрывает шапку', mx);
  const mBad = [], mFit = [], mPages = [], mCursor = [], mBottoms = []; let mFinal = null;
  for (let k = 1; k < STEP.length; k++) {
    const [pg, re] = STEP[k];
    await p.evaluate(() => { const b = document.querySelector('#g-spot .g-ctl .btn-fill'); if (b) b.click(); });
    mx = await stableAt(mt.snap, pg, re, 45000);
    if (!mx) { mBad.push(['пропал на шаге ' + k]); break; }
    if (mPages[mPages.length - 1] !== mx.page) mPages.push(mx.page); if (mx.cursor) mCursor.push(k); if (k < STEP.length - 1 && !(await p.evaluate(() => document.querySelector('#g-spot .g-pop').classList.contains('sheet-top')))) mBottoms.push(Math.round(mx.pop.y + mx.pop.h));
    if (k < STEP.length - 1 && k !== 26 && k !== 30) { const fe = await fitOf(p, k, true); if (fe && (fe.crop || fe.out || fe.ov > 60)) mFit.push([k, fe]); }
    if (!(mx.page === pg && re.test(mx.tx.replace(/\u00a0/g, ' ')))) mBad.push([k + ': нет нужной реплики', mx.page, mx.tx.slice(0, 50)]); else if (!mOk(mx)) mBad.push([k + ':' + mx.page, mx.tx.slice(0, 50), mx.hole, mx.pop]);
    if (k === 2) ok(await p.evaluate(q => document.getElementById('cat-q').value === q, T.prod0), 'на телефоне: каталог открыт нажатием на кнопку первого экрана, в поиске набран запрос', mx);
    if (k === 3) ok(await p.evaluate(() => document.getElementById('f-task').value === 'pigment' && !!document.querySelector('#results.filters-open')), 'на телефоне: панель фильтров раскрылась сама, выбрано назначение «Пигментация»');
    if (k === STEP.length - 1) mFinal = mx;
  }
  ok(mPages.join() === 'home,catalog,product,brands,training,news,company,partners,start,contacts', 'на телефоне экскурсия прошла все разделы по порядку: ' + mPages.join(' → '));
  ok(mFinal && /Вот и всё/.test(mFinal.tx) && mFinal.btns.includes('Старт со Стеллой') && !mFinal.menu && mOk(mFinal), 'на телефоне финал: три предложения видны, карточка внутри экрана', mFinal);
  ok(!mCursor.length, 'на телефоне курсора на экране нет ни на одном шаге (показываем сами действия: набор, выбор, нажатые элементы)', mCursor);
  ok(mBottoms.length > 24 && Math.max(...mBottoms) - Math.min(...mBottoms) <= 3, 'на телефоне комментарий Стеллы — нижняя «шторка» на одном и том же месте на всех шагах (низ ' + Math.min(...mBottoms) + '–' + Math.max(...mBottoms) + ' px)', [...new Set(mBottoms)]);
  ok(!mFit.length, 'на телефоне рамка подсветки на каждом шаге обходит блок целиком, а «шторка» Стеллы не наезжает на него', mFit.slice(0, 3));
  ok(!mBad.length, 'на телефоне на всех ' + STEP.length + ' шагах нужная реплика, подсвеченный элемент виден и не закрыт карточкой, карточка не выходит за экран', mBad.slice(0, 3));
  await mt.press('Закрыть'); await wait(400);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'горизонтальной прокрутки нет');
  ok(!p.errs.length, 'нет ошибок JS на телефоне', p.errs); await p.context().close();

  /* ================= В. ИИ включён: «рамки» ================= */
  console.log('\n[В. ИИ-режим: рамки Стеллы]');
  p = await mk({ai: true, speed: 8}); await p.open('catalog.html');
  const ev0 = D.events[0].id; void ev0;
  /* 1. внешняя ссылка + рассуждение о коже + название товара */
  set([{chunks: ['Для пятен на коже по данным сайта подойдёт Dermatime Acidcure, а ещё посмотрите на https://shop.example.com/cream и [тут](http://evil.example/x).\n\nОбщее правило: ежедневная фотозащита помогает не усиливать пигментацию.']}]);
  const before = calls.length; await p.ask('Что посоветуете от пигментных пятен?'); r = await p.lastBot();
  ok(calls.length === before + 1, 'вопрос про уход ушёл к ИИ (один запрос)');
  ok(r && !/https?:|shop\.example|evil/i.test(r.text) && !r.links.some(h => /^https?:/.test(h)), 'внешние ссылки из ответа ИИ вырезаны', r && r.text);
  ok(r && r.links.some(h => /products\/dermatime-acidcure\.html/.test(h)), 'название товара в тексте стало ссылкой на нашу карточку', r && r.links);
  ok(r && r.cards.some(h => /dermatime-acidcure/.test(h)), 'упомянутый товар показан карточкой с нашей ссылкой', r && r.cards);
  ok(r && r.disc, 'под объяснением о коже и уходе — плашка «не медицинская рекомендация»');
  /* 2. нейтральный ответ — без плашки; [[med]] — с плашкой */
  set([{chunks: ['Столица Франции — Париж.']}]); await p.ask('Какая столица у Франции?'); r = await p.lastBot(); ok(r && /Париж/.test(r.text) && !r.disc, 'ответ не про кожу и здоровье — без плашки');
  set([{chunks: ['Это общеизвестный совет.\n[[med]]']}]); await p.ask('Что-нибудь про самочувствие'); r = await p.lastBot(); ok(r && r.disc && !/\[\[/.test(r.text), 'метка [[med]] от модели включает плашку и не видна в тексте');
  /* 3. маркеры действий: настоящие → кнопки, чужие → отброшены */
  set([{chunks: ['Покажу и открою.\n[[show:task-filter]]\n[[go:partners.html]]\n[[tour:compare]]\n[[filter:task=pigment&brand=dermatime]]\n[[compare:dt-acidcure,dt-milk]]\n[[show:evil-id]]\n[[go:http://evil.example/a.html]]\n[[filter:task=hack]]\n[[tour:nope]]']}]);
  await p.ask('Покажи варианты'); r = await p.lastBot(); const acts = r ? r.btns.map(x => x.act) : [];
  ok(acts.length === 3 && acts.includes('asst-show') && acts.includes('asst-go') && acts.includes('asst-tour'), 'настоящие маркеры [[show]], [[go]], [[tour]] стали кнопками (не больше трёх за ответ)', r && r.btns);
  set([{chunks: ['Вот.\n[[filter:task=pigment&brand=dermatime]]\n[[compare:dt-acidcure,dt-milk]]\n[[filter:task=hack]]\n[[show:evil-id]]\n[[go:http://evil.example/a.html]]']}]);
  await p.ask('Покажи варианты получше'); r = await p.lastBot(); const lb = r ? r.btns.map(x => x.t).join(' | ') : '';
  ok(r && r.btns.length === 2 && /Показать в каталоге/.test(lb) && /Сравнить: /.test(lb) && !/evil|hack/i.test(r.all), 'маркеры [[filter]] и [[compare]] — кнопки; выдуманные цели, значения фильтров и внешние адреса отброшены', r && r.btns);
  /* кнопка «Показать в каталоге» */
  await p.click('#asst-log .asst-m.asst-b:nth-last-child(2) [data-act="asst-filter"]'); await wait(1600);
  ok(await p.evaluate(() => document.querySelector('#f-task').value === 'pigment' && document.querySelector('#f-brand').value === 'dermatime'), 'кнопка «Показать в каталоге» выставила фильтры (задача и бренд)');
  await p.keyboard.press('Escape'); await wait(200);
  /* кнопка «Сравнить» — сравнивает Стелла по данным сайта, к ИИ не обращаясь */
  await p.click('#asst-fab'); await wait(700);
  const c0 = calls.length; await p.click('#asst-log .asst-m.asst-b:nth-last-child(2) [data-act="asst-cmp"]'); await wait(1500); await p.idle(); r = await p.lastBot();
  ok(r && /Сравниваю|Давайте сравним|Смотрю на/.test(r.text) && r.cards.length === 2 && calls.length === c0, 'кнопка «Сравнить» из ответа ИИ: сравнение даёт Стелла по данным сайта, без обращения к ИИ', {calls: calls.length - c0});
  /* 4. плашка сравнения при включённом ИИ: тоже локально и мгновенно */
  await p.evaluate(() => window.Astreya.actions['cmp-clear']()); await p.keyboard.press('Escape'); await wait(300);
  await p.evaluate(() => window.Astreya.actions['cat-reset']()); await wait(300); const adds2 = await p.$$('.pcard:not([hidden]) .cmp-add'); await adds2[0].click(); await wait(250); await adds2[2].click(); await wait(500);
  const c1 = calls.length; await p.click('.cmp-ask'); await wait(1200); await p.idle(); await wait(300); r = await p.lastBot();
  ok(r && /Сравниваю|Давайте сравним|Смотрю на/.test(r.text) && calls.length === c1, 'плашка «Попросить Стеллу рассказать» при включённом ИИ: ответ по данным сайта, без затрат на ИИ', {calls: calls.length - c1});
  /* 5. контекст для ИИ: отмеченные товары и страница уходят в запрос */
  set([{chunks: ['Хорошо.']}]); await p.ask('Что лучше брать для кабинета, подумай вслух?');
  const last = calls[calls.length - 1].messages; const lm = last[last.length - 1].content;
  ok(/\[Посетитель сейчас на странице «Каталог»; отметил для сравнения: .+\]/.test(typeof lm === 'string' ? lm : JSON.stringify(lm)), 'в запрос к ИИ добавляется служебная строка: страница и отмеченные для сравнения товары', typeof lm === 'string' ? lm.slice(0, 200) : lm);
  ok(/Ты — Стелла/.test(calls[calls.length - 1].system[0].text) && /ОТВЕТ, МОСТ, ШАГ/.test(calls[calls.length - 1].system[0].text), 'в запросе — инструкция Стеллы с «рамками» (ответ → мост → шаг)');
  ok(!p.errs.length, 'нет ошибок JS и консоли', p.errs); await p.context().close();

  await b.close(); await S.close(); A.setClientFactory(null);
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
