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
    o = o || {}; const ctx = await b.newContext({viewport: o.mobile ? {width: 390, height: 844} : {width: 1280, height: 860}, isMobile: !!o.mobile, hasTouch: !!o.mobile, locale: 'ru-RU'});
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
  ok(sp && /сужаете выбор/.test(sp.txt) && sp.hole.w > 300 && sp.btns.includes('Понятно') && await p.evaluate(() => !document.body.classList.contains('asst-open')), '«где фильтры?» — чат убирается, фильтры подсвечены с пояснением', sp);
  await p.keyboard.press('Escape'); await wait(200); ok(!(await p.spot()), 'Esc закрывает подсветку');
  ok(await p.evaluate(() => { const t = window.ASTREYA_DATA.guide.tours.find(x => x.id === 'site'); const pages = new Set(t.steps.map(x => x.page)), tg = new Set(t.steps.map(x => x.target)); return !!t && !t.menu && t.steps.length >= 14 && t.groups.length === 6 && ['home', 'catalog', 'product', 'brands', 'training', 'news', 'start', 'partners', 'company', 'contacts'].every(k => pages.has(k)) && t.steps.every(x => x.say.length <= 170) && !/Начнём с меню|телефон менеджера здесь|Шаг 1 из 4/.test(JSON.stringify(t)); }), 'экскурсия охватывает все разделы (главная, каталог, товар, бренды, обучение, новости, «Старт со Стеллой», партнёры, компания, контакты), 6 этапов, каждая реплика не длиннее 170 знаков; прежнего ознакомления по меню нет');
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

  /* ---------- точки входа на всех типах страниц ---------- */
  console.log('\n[Экскурсия «Покажи сайт»: компьютер, все разделы от главной до финала]');
  p = await mk({speed: 14}); await p.open('catalog.html');
  const T = {
    snap: () => p.evaluate(() => { const s = document.getElementById('g-spot'); if (!s || s.hidden) return null; const h = document.querySelector('.g-hole').getBoundingClientRect(), pp = document.querySelector('.g-pop').getBoundingClientRect();
      return {page: document.body.getAttribute('data-page'), tx: s.querySelector('.g-tx p').textContent, st: (s.querySelector('.g-st') || {}).textContent || '', btns: [...s.querySelectorAll('.g-ctl button')].map(b => b.textContent.trim()), hole: {x: h.x, y: h.y, w: h.width, h: h.height}, pop: {x: pp.x, y: pp.y, w: pp.width, h: pp.height}, vw: innerWidth, vh: innerHeight, y: scrollY}; }),
    press: async label => { await p.evaluate(l => { const b = [...document.querySelectorAll('#g-spot .g-ctl button')].find(x => x.textContent.trim() === l); if (b) b.click(); }, label); },
    until: async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { const r = await p.evaluate(fn).catch(() => false); if (r) return true; await wait(150); } return false; },
    prod0: D.products[0].name.split(/\s+/)[0]
  };
  const inView = x => x && x.hole.w > 8 && x.hole.h > 8 && x.hole.x >= 0 && x.hole.y >= 0 && x.hole.x + x.hole.w <= x.vw + 1 && x.hole.y + x.hole.h <= x.vh + 1;
  const noOverlap = x => x && (x.pop.x + x.pop.w <= x.hole.x || x.pop.x >= x.hole.x + x.hole.w || x.pop.y + x.pop.h <= x.hole.y || x.pop.y >= x.hole.y + x.hole.h);
  ok(await p.evaluate(() => !document.getElementById('g-spot') || document.getElementById('g-spot').hidden) && !(await p.evaluate(() => sessionStorage.getItem('astreya:g-tour'))), 'экскурсия сама не запускается: после загрузки страницы подсветки и состояния экскурсии нет');
  await p.click('#asst-fab'); await p.waitForSelector('#asst-in', {state: 'visible'}); await wait(700); await p.idle();
  const ch0 = await p.evaluate(() => [...document.querySelectorAll('#asst-qr .chip')].map(c => c.textContent.trim()));
  ok(ch0[0] === 'Покажи сайт' && await p.evaluate(() => !!document.querySelector('.asst-ib-tour[data-act="asst-tour-site"]')), 'в панели Стеллы есть постоянная кнопка-компас «Показать сайт — экскурсия» и первый быстрый ответ «Покажи сайт»', ch0);
  ok(await T.snap() === null, 'открытие панели Стеллы экскурсию не запускает');
  await p.click('.asst-ib-tour'); await T.until(() => { const s = document.getElementById('g-spot'); return s && !s.hidden && document.body.getAttribute('data-page') === 'home'; }, 20000); await wait(900);
  const tb = await p.lastBot(); ok(tb && /шесть коротких остановок/.test(tb.text) && !tb.btns.length, 'Стелла отвечает «покажу сайт» без кнопки «Начать» — экскурсия идёт сама', tb && [tb.text.slice(0, 60), tb.btns]);
  let x = await T.snap();
  ok(x && x.page === 'home' && /^1 из 6/.test(x.st) && /Главная/.test(x.st) && x.btns.join() === 'Далее,Пропустить', 'с каталога экскурсия сама перешла на главную и началась: «1 из 6 · Главная», кнопки «Далее» и «Пропустить»', x);
  ok(inView(x) && noOverlap(x) && /Вверху всегда под рукой/.test(x.tx) && /проведу вас по сайту/.test(x.tx) && x.hole.y < 120, 'шаг 1: коротко о компании и подсвечена настоящая шапка (меню, поиск, «Стать партнёром»), карточка не перекрывает её', x);
  await T.press('Далее'); await wait(1300); x = await T.snap();
  ok(inView(x) && noOverlap(x) && /Отсюда два пути/.test(x.tx) && x.btns.includes('Назад') && x.btns.includes('Открыть каталог') && await p.evaluate(() => { const r = document.querySelector('.hero-copy .row').getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; }), 'шаг 2: кнопки первого экрана подсвечены («в каталог» или «стать партнёром»), кнопка «Далее» называется «Открыть каталог»', x);
  await T.press('Открыть каталог'); const gotCat = await T.until(() => document.body.getAttribute('data-page') === 'catalog' && !document.getElementById('g-spot').hidden && !!document.querySelector('#cat-q').value, 20000); await wait(900); x = await T.snap();
  const sq = await p.evaluate(() => ({q: document.getElementById('cat-q').value, c: document.getElementById('res-count').textContent}));
  ok(gotCat && sq.q === T.prod0 && /Найдено: 1 из/.test(sq.c) && new RegExp('«' + T.prod0 + '».*1 из').test(x.tx) && /^2 из 6/.test(x.st), 'шаг 3 («2 из 6 · Каталог»): Стелла нажала «Перейти в каталог» на главной, в поиске набрано «' + T.prod0 + '», на странице реально осталась 1 карточка', [sq, x && x.tx]);
  await T.press('Далее'); await wait(1500); x = await T.snap();
  const sf = await p.evaluate(() => ({task: document.getElementById('f-task').value, q: document.getElementById('cat-q').value, c: document.getElementById('res-count').textContent, url: location.search}));
  ok(sf.task === 'pigment' && sf.q === '' && /Найдено: [2-9]\d* из/.test(sf.c) && /Пигментация/.test(x.tx) && /task=pigment/.test(sf.url), 'шаг 4: запрос очищен, в фильтре «Назначение» выбрана «Пигментация» — каталог реально отфильтрован: ' + sf.c, [sf, x && x.tx]);
  await T.press('Далее'); await wait(1300); x = await T.snap();
  ok(inView(x) && /⇄/.test(x.tx) && /Не можете выбрать между двумя/.test(x.tx) && x.btns.includes('Показать на примере') && await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:cmp') || '[]')).length === 0) && /Найдено: [2-9]\d* из/.test(await p.evaluate(() => document.getElementById('res-count').textContent)), 'шаг 5: подсвечен значок сравнения ⇄; без вашего нажатия ничего не отмечено, фильтр остаётся', x);
  await T.press('Показать на примере'); await wait(1500); x = await T.snap();
  const cd = await p.evaluate(() => ({l: JSON.parse(localStorage.getItem('astreya:cmp') || '[]'), bar: !!document.querySelector('#cmp-bar') && !document.querySelector('#cmp-bar').hidden}));
  ok(cd.l.length === 2 && cd.bar && /отмечены/.test(x.tx) && x.btns.includes('Рассказать о товарах'), 'по явному нажатию «Показать на примере» два товара отмечены для сравнения, видна плашка', [cd, x && x.btns]);
  await T.press('Далее'); await wait(1300); x = await T.snap();
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:cmp') || '[]')).length === 0) && x && x.btns.includes('Открыть карточку') && /заглянем в карточку/.test(x.tx), 'шаг 6: после шага отметки товаров, которые поставила экскурсия, сняты — сравнение пустое', x && x.btns);
  const firstHref = await p.evaluate(() => { const c = [...document.querySelectorAll('.pcard')].find(c => !c.hidden); return new URL(c.querySelector('a.stretch').href).pathname; });
  await T.press('Открыть карточку'); const gotProd = await T.until(() => document.body.getAttribute('data-page') === 'product' && !document.getElementById('g-spot').hidden, 20000); await wait(900); x = await T.snap();
  ok(gotProd && await p.evaluate(h => location.pathname === h, firstHref) && /менеджер вернётся/.test(x.tx) && inView(x) && /^2 из 6/.test(x.st), 'шаг 7: Стелла нажала на карточку — открылась страница товара из отфильтрованного списка (' + firstHref + '), подсвечена кнопка «Запросить информацию»', x);
  ok(await p.evaluate(() => !document.querySelector('#modal.open')) && !(await p.evaluate(() => sessionStorage.getItem('astreya:rl') || localStorage.getItem('astreya:rl'))), 'экскурсия не открыла форму запроса и ничего не добавила в список запроса — заявка и «корзина» не затронуты');
  /* остальные разделы: Стелла переводит на страницу сама, подсвечивает главное и коротко говорит, что это и как пользоваться */
  const sect = [
    ['brands', /^3 из 6 · Бренды и обучение/, /С брендами проще/, 'шаг 8: «Бренды» — выбор по задаче и у каждого бренда своя страница'],
    ['training', /^3 из 6/, /Здесь мы учим.*календар/, 'шаг 9: «Обучение» — календарь семинаров и вебинаров, ниже расписание, преподаватели и материалы'],
    ['news', /^4 из 6 · Новости и подбор/, /Тут держим вас в курсе/, 'шаг 10: «Новости» — новинки, обучение, мероприятия; про подписку внизу страницы'],
    ['start', /^4 из 6/, /моё любимое место.*план/, 'шаг 11: «Старт со Стеллой» — диалог, после которого готов план'],
    ['partners', /^5 из 6 · Партнёрам/, /При закупке на 150\s000 ₽ ваша скидка — 10%.*ориентир/, 'шаг 12: «Партнёрам» — Стелла сама двигает ползунок калькулятора на порог 10% и напоминает, что это ориентир'],
    ['partners', /^5 из 6/, /Оставьте контакты/, 'шаг 13: заявка на сотрудничество'],
    ['company', /^6 из 6 · О компании/, /на чём держится наша работа/, 'шаг 14: «Компания» — блок «Почему «Астрее» можно доверять»'],
    ['contacts', /^6 из 6/, /Остались вопросы/, 'шаг 15: «Контакты» — написать или заказать звонок']
  ];
  const secBad = [];
  for (const [pg, stRe, txRe, what] of sect) {
    await T.press('Далее'); await T.until(() => !!document.querySelector('#g-spot:not([hidden]) .g-tx p'), 20000); await wait(pg === 'partners' ? 2600 : 1700); x = await T.snap();
    const good = x && x.page === pg && stRe.test(x.st) && txRe.test(x.tx.replace(/ /g, ' ')) && inView(x) && x.btns.includes('Назад');
    ok(good, what, x); if (!good) secBad.push(pg);
    if (pg === 'partners' && /Скидка растёт/.test(x.tx)) ok(await p.evaluate(() => document.getElementById('calc-range').value === '150000'), 'ползунок калькулятора реально стоит на 150 000 ₽');
  }
  await T.press('Далее'); await wait(1500); x = await T.snap();
  ok(x && /Вот и всё/.test(x.tx) && ['Открыть каталог', 'Старт со Стеллой', 'Спросить Стеллу', 'Закрыть'].every(b => x.btns.includes(b)) && !x.btns.includes('Подобрать по задаче') && /^6 из 6/.test(x.st) && inView(x), 'финал: предложение — открыть каталог, «Старт со Стеллой» (вместо прежнего «Подобрать по задаче») или спросить Стеллу', x);
  await T.press('Назад'); await wait(1500); x = await T.snap(); ok(x && /Остались вопросы/.test(x.tx), '«Назад» с последнего шага возвращает к «Контактам»');
  await T.press('Далее'); await wait(1200);
  await T.press('Старт со Стеллой'); await T.until(() => document.body.getAttribute('data-page') === 'start' && !!document.querySelector('.pchat'), 20000); await wait(900);
  ok(await p.evaluate(() => document.body.getAttribute('data-page') === 'start' && !!document.querySelector('.pchat') && document.getElementById('g-spot').hidden), 'финальная кнопка «Старт со Стеллой» открывает страницу подбора — окно диалога со Стеллой');
  await p.keyboard.press('Escape'); await wait(300);
  ok(!(await T.snap()) && !(await p.evaluate(() => sessionStorage.getItem('astreya:g-tour'))), 'после выхода пользователь работает с сайтом как обычно: подсветки и состояния экскурсии нет');
  await p.open('catalog.html'); await wait(1200);
  ok(await p.evaluate(n => [...document.querySelectorAll('#cat-grid .pcard')].filter(c => !c.hidden).length === n, D.products.length), 'после выхода в каталоге снова видны все ' + D.products.length + ' товаров (фильтры не залипли)');
  ok(!p.errs.length, 'в ходе экскурсии нет ошибок JS и консоли', p.errs); await p.context().close();

  /* ---------- выход, «Назад» между страницами, откат изменений, отсутствующие элементы ---------- */
  console.log('\n[Экскурсия: «Пропустить», «Назад» между страницами, откат изменений, отсутствующий элемент]');
  p = await mk({speed: 14}); await p.open('catalog.html');
  const startTour = async () => { await p.evaluate(() => window.Astreya.guide.tour('site')); await T.until(() => { const s = document.getElementById('g-spot'); return s && !s.hidden; }, 20000); await wait(800); };
  await startTour(); await T.until(() => document.body.getAttribute('data-page') === 'home', 15000);
  await T.press('Далее'); await wait(1100); await T.press('Пропустить'); await wait(500);
  ok(!(await T.snap()) && await p.evaluate(() => !sessionStorage.getItem('astreya:g-tour') && !document.body.classList.contains('g-on')), '«Пропустить» на главной: подсветка снята, состояние экскурсии очищено');
  await p.evaluate(() => window.Astreya.guide.tour('site', 2)); await T.until(() => document.body.getAttribute('data-page') === 'catalog' && !document.getElementById('g-spot').hidden, 20000); await wait(1200);
  await T.press('Далее'); await wait(1500);
  ok(await p.evaluate(() => document.getElementById('f-task').value === 'pigment'), 'на шаге подбора фильтр «Пигментация» выставлен');
  await T.press('Пропустить'); await wait(600);
  const rs = await p.evaluate(() => ({task: document.getElementById('f-task').value, q: document.getElementById('cat-q').value, c: document.getElementById('res-count').textContent, url: location.search, spot: !document.getElementById('g-spot').hidden}));
  ok(rs.task === 'all' && rs.q === '' && /Найдено: 30 из 30/.test(rs.c) && rs.url === '' && !rs.spot, '«Пропустить» в каталоге: фильтр и запрос возвращены, адрес очищен — каталог как был', rs);
  /* «Назад» со страницы товара возвращает в каталог, экскурсия продолжается */
  await p.evaluate(() => window.Astreya.guide.tour('site', 5)); await T.until(() => !document.getElementById('g-spot').hidden && /Открыть карточку/.test(document.querySelector('#g-spot .g-ctl').textContent), 8000); await wait(700);
  await T.press('Открыть карточку'); await T.until(() => document.body.getAttribute('data-page') === 'product' && !document.getElementById('g-spot').hidden, 20000); await wait(900);
  await T.press('Назад'); await T.until(() => document.body.getAttribute('data-page') === 'catalog' && !document.getElementById('g-spot').hidden, 20000); await wait(900); x = await T.snap();
  ok(x && x.page === 'catalog' && x.btns.includes('Открыть карточку') && inView(x), '«Назад» со страницы товара вернул в каталог, шаг с карточкой снова подсвечен', x);
  await p.keyboard.press('Escape'); await wait(300);
  /* целевой элемент отсутствует — шаг безопасно пропускается */
  await p.evaluate(() => { const q = document.getElementById('cat-q'); q.closest('label').remove(); });
  await p.evaluate(() => window.Astreya.guide.tour('site', 2)); await wait(2500); x = await T.snap();
  ok(x && /от задачи|Пигментация/.test(x.tx), 'поля поиска нет на странице — шаг пропущен без ошибок, экскурсия продолжилась со следующего', x && x.tx);
  await p.keyboard.press('Escape'); await wait(300);
  /* нажатие на карточку не привело к переходу (ссылки нет) — Стелла просит открыть товар самостоятельно */
  await p.evaluate(() => { document.querySelectorAll('.pcard a.stretch').forEach(a => a.removeAttribute('href')); });
  await p.evaluate(() => window.Astreya.guide.tour('site', 5)); await wait(1300); await T.press('Открыть карточку'); await wait(4800); x = await T.snap();
  ok(x && /Откройте товар/.test(x.tx) && x.btns.includes('Пропустить'), 'если карточку нельзя открыть — Стелла предлагает открыть товар самому и продолжить, без ошибок', x && x.tx);
  await p.keyboard.press('Escape'); await wait(200);
  /* калькулятор скидки: Стелла двигает ползунок сама, но при выходе возвращает как было */
  await p.evaluate(() => window.Astreya.guide.tour('site', 11)); await T.until(() => document.body.getAttribute('data-page') === 'partners' && !document.getElementById('g-spot').hidden, 20000); await wait(2600);
  ok(await p.evaluate(() => document.getElementById('calc-range').value === '150000'), 'калькулятор: Стелла передвинула ползунок на порог 10% (150 000 ₽)');
  await T.press('Пропустить'); await wait(600);
  ok(await p.evaluate(() => document.getElementById('calc-range').value === '100000' && document.getElementById('g-spot').hidden), '«Пропустить» на калькуляторе: ползунок вернулся на прежнее значение, подсветка снята');
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
    await p.goto(base + u); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} } await wait(1400);
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
  p = await mk({speed: 14}); await p.open('index.html'); await wait(2800);
  ok(await p.evaluate(() => { const n = document.querySelector('#g-nudge'); return !n || n.hidden; }), 'на главной, пока идёт вступление с баночкой, окна нет');
  await p.evaluate(() => { const h = document.querySelector('.hero'); window.scrollTo({top: h.getBoundingClientRect().top + scrollY + 420, behavior: 'instant'}); });
  await p.waitForSelector('#g-nudge.on', {timeout: 15000}).catch(() => {}); await wait(700);
  const wn = await p.evaluate(() => { const n = document.querySelector('#g-nudge'); if (!n || n.hidden) return null; const r = n.getBoundingClientRect(); return {h: n.querySelector('.g-n-h').textContent, lead: n.querySelector('.g-n-lead').textContent, can: [...n.querySelectorAll('.g-n-rot i')].map(i => i.textContent), first: n.querySelector('.g-n-rot i.on').textContent, chips: [...n.querySelectorAll('.chip')].map(c => c.textContent.trim()), r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight}; });
  ok(wn && /Добро пожаловать на сайт/.test(wn.h) && /Я Стелла, могу/.test(wn.lead) && wn.can.length >= 4 && /помочь/.test(wn.can[0]) && wn.can.some(x => /подсказать/.test(x)) && wn.can.some(x => /рассказать/.test(x)), 'на главной, когда вступление позади, Стелла здоровается и говорит, что может помочь, подсказать, рассказать', wn);
  ok(wn && wn.chips.includes('Покажи сайт') && wn.chips.includes('Старт со Стеллой') && wn.r <= wn.vw && wn.b <= wn.vh, 'в окне — кнопки «Старт со Стеллой» и «Покажи сайт», окно целиком на экране', wn && [wn.chips, wn.r, wn.b]);
  await wait(3400); ok(await p.evaluate(a => document.querySelector('#g-nudge .g-n-rot i.on').textContent !== a, wn ? wn.first : ''), 'строка «могу…» сменилась на следующую фразу');
  const nst = await p.evaluate(() => JSON.parse(sessionStorage.getItem('astreya:g-nudge') || '{}')); ok(nst.n === 1 && nst.seen && nst.seen.welcome === 1, 'приветствие показано один раз и учтено в сессии', nst);
  await p.click('#g-nudge .g-n-x'); await wait(600); ok(await p.evaluate(() => document.querySelector('#g-nudge').hidden), 'крестик закрывает окно');
  await p.goto(base + 'catalog.html'); await wait(800); await p.goto(base + 'index.html'); await wait(900);
  await p.evaluate(() => { const h = document.querySelector('.hero'); if (h) window.scrollTo({top: h.getBoundingClientRect().top + scrollY + 420, behavior: 'instant'}); }); await wait(4000);
  ok(await p.evaluate(() => { const n = document.querySelector('#g-nudge'); return !n || n.hidden; }), 'после закрытия приветствие в этой сессии больше не появляется');
  ok(!p.errs.length, 'на главной нет ошибок JS', p.errs); await p.context().close();

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
  const mt = {snap: () => p.evaluate(() => { const s = document.getElementById('g-spot'); if (!s || s.hidden) return null; const h = document.querySelector('.g-hole').getBoundingClientRect(), pp = document.querySelector('.g-pop').getBoundingClientRect(); return {page: document.body.getAttribute('data-page'), tx: s.querySelector('.g-tx p').textContent, st: (s.querySelector('.g-st') || {}).textContent || '', btns: [...s.querySelectorAll('.g-ctl button')].map(b => b.textContent.trim()), hole: {x: h.x, y: h.y, w: h.width, h: h.height}, pop: {x: pp.x, y: pp.y, w: pp.width, h: pp.height}, menu: document.body.classList.contains('menu-open')}; }),
    press: label => p.evaluate(l => { const b = [...document.querySelectorAll('#g-spot .g-ctl button')].find(x => x.textContent.trim() === l); if (b) b.click(); }, label),
    until: async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { if (await p.evaluate(fn).catch(() => false)) return true; await wait(150); } return false; }};
  const mOk = x => x && x.hole.w > 8 && x.hole.x >= 0 && x.hole.x + x.hole.w <= 391 && x.pop.x >= 0 && x.pop.x + x.pop.w <= 391 && x.pop.y >= 0 && x.pop.y + x.pop.h <= 845 && (x.pop.y + x.pop.h <= x.hole.y + 1 || x.pop.y >= x.hole.y + x.hole.h - 1);
  if (!(await p.evaluate(() => document.body.classList.contains('asst-open')))) { await p.click('#asst-fab'); await p.waitForSelector('#asst-in', {state: 'visible'}); await wait(700); }
  await p.click('.asst-ib-tour'); await mt.until(() => document.body.getAttribute('data-page') === 'home' && !document.getElementById('g-spot').hidden, 25000); await wait(1000);
  let mx = await mt.snap(); ok(mx && /^1 из 6/.test(mx.st) && mOk(mx) && !mx.menu, 'на телефоне: экскурсия с каталога перешла на главную, шаг 1, карточка — нижняя «шторка», не перекрывает шапку', mx);
  const mBad = [], mPages = []; let mFinal = null;
  for (let k = 0; k < 20; k++) {
    await mt.press(mx.btns.includes('Открыть карточку') ? 'Открыть карточку' : mx.btns.includes('Открыть каталог') && !mx.btns.includes('Закрыть') ? 'Открыть каталог' : 'Далее');
    await mt.until(() => !!document.querySelector('#g-spot:not([hidden]) .g-tx p'), 25000); await wait(k === 1 || k === 10 ? 2800 : 1900); mx = await mt.snap();
    if (!mx) { mBad.push(['пропал на шаге ' + k]); break; }
    if (mPages[mPages.length - 1] !== mx.page) mPages.push(mx.page); if (!mOk(mx)) mBad.push([k + ':' + mx.page, mx.tx.slice(0, 50)]);
    if (k === 1) ok(/1 из/.test(mx.tx) && mx.page === 'catalog' && !mx.menu, 'на телефоне: каталог открыт нажатием на кнопку первого экрана, в поиске набран запрос', mx);
    if (k === 2) ok(await p.evaluate(() => document.getElementById('f-task').value === 'pigment' && !!document.querySelector('#results.filters-open')), 'на телефоне: панель фильтров раскрылась сама, выбрано назначение «Пигментация»');
    if (mx.btns.includes('Закрыть')) { mFinal = mx; break; }
  }
  ok(mPages.join() === 'home,catalog,product,brands,training,news,start,partners,company,contacts', 'на телефоне экскурсия прошла все разделы по порядку: ' + mPages.join(' → '));
  ok(mFinal && /Вот и всё/.test(mFinal.tx) && mFinal.btns.includes('Старт со Стеллой') && !mFinal.menu && mOk(mFinal), 'на телефоне финал: три предложения видны, карточка внутри экрана', mFinal);
  ok(!mBad.length, 'на телефоне на всех шагах подсвеченный элемент виден и не закрыт карточкой, карточка не выходит за экран', mBad.slice(0, 3));
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
