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
  ok(r && /Сравниваю/.test(r.text) && /Что общего/.test(r.text) && /Чего на сайте нет/.test(r.text), 'Стелла рассказывает о выбранных товарах: общее, различия, кому что ближе, чего нет на сайте', r && r.text.slice(0, 120));
  ok(r && r.cards.length === 2 && r.cards.every(h => /^products\/.+\.html$/.test(h)), 'под рассказом — карточки обоих товаров со ссылками на страницы сайта', r && r.cards);
  ok(r && r.disc && /не медицинская рекомендация/.test(r.all), 'под рассказом — плашка «Справочная информация · не медицинская рекомендация»');
  ok(r && r.links.length >= 2 && r.links.every(h => !/^(https?:)?\/\//.test(h)), 'названия товаров в тексте — ссылки только на этот сайт', r && r.links);
  ok(await p.evaluate(() => !document.querySelector('.cmp-t, .cmp-dlg') && !document.querySelector('#modal.open')), 'таблицы сравнения нигде нет');
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:cmp') || '[]')).length) === 2, 'выбранные товары остаются в плашке');
  await p.evaluate(() => { window.Astreya.stella.close(true); window.Astreya.actions['cmp-clear'](); }); await wait(700);
  await p.evaluate(() => window.Astreya.actions['cmp-toggle'](null, window.ASTREYA_DATA.products[3].id)); await wait(300); await p.click('.cmp-ask'); await wait(900); await p.idle(); await wait(300);
  r = await p.lastBot(); ok(r && /Рассказываю о/.test(r.text) && r.cards.length === 1, 'один отмеченный товар — Стелла рассказывает о нём', r && r.text.slice(0, 80));
  await p.evaluate(() => window.Astreya.actions['cmp-clear']());

  await p.ask('где фильтры?'); let sp = await p.spot();
  ok(sp && /Фильтры/.test(sp.txt) && sp.hole.w > 300 && sp.btns.includes('Понятно') && await p.evaluate(() => !document.body.classList.contains('asst-open')), '«где фильтры?» — чат убирается, фильтры подсвечены с пояснением', sp);
  await p.keyboard.press('Escape'); await wait(200); ok(!(await p.spot()), 'Esc закрывает подсветку');
  await p.ask('проведи по сайту'); await wait(1500); sp = await p.spot(); ok(sp && /Шаг 1 из 4/i.test(sp.step) && /меню/i.test(sp.txt), 'команда «проведи по сайту» запускает экскурсию (шаг 1 из 4: меню)', sp);
  for (let i = 2; i <= 4; i++) { await p.click('.g-ctl [data-act="g-tour-next"]'); await wait(1300); sp = await p.spot(); ok(sp && new RegExp('Шаг ' + i + ' из 4', 'i').test(sp.step), 'экскурсия: шаг ' + i + ' из 4 — «' + (sp ? sp.txt.slice(0, 40) : '') + '…»'); }
  await p.click('.g-ctl [data-act="g-tour-next"]'); await wait(500); ok(!(await p.spot()) && !(await p.evaluate(() => sessionStorage.getItem('astreya:g-tour'))), 'после «Готово» экскурсия закрыта и состояние очищено');
  await p.ask('отфильтруй по пигментации'); await wait(1500);
  const fl = await p.evaluate(() => ({task: document.querySelector('#f-task').value, count: document.querySelector('#res-count').textContent, shown: [...document.querySelectorAll('.pcard')].filter(c => !c.hidden).length}));
  sp = await p.spot(); ok(fl.task === 'pigment' && fl.shown > 0 && fl.shown < 30 && sp && /Найдено/.test(sp.txt), '«отфильтруй по пигментации» — фильтр выставлен, показано ' + fl.shown + ' из 30, Стелла указывает на результат', {fl, sp});
  await p.keyboard.press('Escape');
  await p.ask('покажи бренды'); await wait(2800); ok(await dataPage(p) === 'brands' && await p.evaluate(() => document.body.classList.contains('asst-open')), '«покажи бренды» — открыта страница брендов, чат остался рядом');
  await p.ask('где поиск по брендам'); await wait(900); sp = await p.spot(); ok(sp && /Поиск по брендам/.test(sp.txt), 'на странице брендов Стелла показывает поиск по брендам', sp);
  await p.keyboard.press('Escape');
  await p.ask('открой страницу для партнёров'); await wait(2800); ok(await dataPage(p) === 'partners', '«открой страницу для партнёров» → страница «Стать партнёром»');
  await p.ask('где калькулятор скидок?'); await wait(900); sp = await p.spot(); ok(sp && /Калькулятор/.test(sp.txt) && sp.hole.w > 200, 'калькулятор скидок подсвечен', sp);
  await p.keyboard.press('Escape');
  await p.ask('как сделать заказ? проведи по шагам'); await p.waitForFunction(() => { const s = document.querySelector('#g-spot'); return s && !s.hidden && /Шаг 1/.test(s.textContent); }, null, {timeout: 9000}).catch(() => {}); sp = await p.spot();
  ok(sp && /Шаг 1 из 2/i.test(sp.step), 'экскурсия «Как запросить информацию» начинается со страницы каталога (перешла сама)', sp);
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

  /* ---------- проактивная подсказка ---------- */
  console.log('\n[Проактивная подсказка]');
  p = await mk({speed: 14}); await p.open('training.html');
  await wait(2500); ok(await p.evaluate(() => { const e = document.querySelector('.g-entry'), n = document.querySelector('#g-nudge'), r = e.getBoundingClientRect(), vis = r.bottom > 40 && r.top < innerHeight - 40; return !(vis && n && !n.hidden); }), 'пока блок «Спросите Стеллу» на экране, тот же вопрос пузырём не повторяется');
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(300);          // блок ушёл с экрана — теперь подсказка уместна
  await p.waitForSelector('#g-nudge.on', {timeout: 15000}).catch(() => {});
  let nd = await p.evaluate(() => { const n = document.querySelector('#g-nudge'); return n && !n.hidden ? {t: n.querySelector('.g-n-t').textContent, chips: [...n.querySelectorAll('.chip')].map(x => x.textContent)} : null; });
  ok(nd && /какой семинар/.test(nd.t) && nd.chips.length >= 1, 'на странице обучения Стелла сама спрашивает: «Не знаете, какой семинар выбрать?»', nd);
  await p.click('#g-nudge .chip'); await wait(1500); await p.idle(); r = await p.lastBot(); ok(r && r.text.length > 20 && await p.evaluate(() => document.body.classList.contains('asst-open')), 'клик по готовому вопросу открывает чат и сразу получает ответ');
  const nst = await p.evaluate(() => JSON.parse(sessionStorage.getItem('astreya:g-nudge') || '{}')); ok(nst.n === 1, 'подсказка показана один раз и учтена в лимите сессии', nst);
  await p.context().close();
  p = await mk({speed: 14}); await p.open('catalog.html'); await p.evaluate(() => window.scrollTo(0, 2500)); await p.waitForSelector('#g-nudge.on', {timeout: 15000}).catch(() => {}); await p.click('#g-nudge .g-n-x'); await wait(500);
  ok(await p.evaluate(() => JSON.parse(sessionStorage.getItem('astreya:g-nudge') || '{}').off === 1), 'закрыли крестиком — подсказки больше не появляются в этой сессии');
  await p.goto(base + 'brands.html'); await wait(3000); ok(await p.evaluate(() => { const n = document.querySelector('#g-nudge'); return !n || n.hidden; }), 'на другой странице после отказа подсказки нет');
  await p.context().close();

  /* ================= Б. телефон ================= */
  console.log('\n[Б. Телефон 390×844]');
  p = await mk({mobile: true}); await p.open('catalog.html');
  const mAdds = await p.$$('.pcard:not([hidden]) .cmp-add'); await mAdds[0].click(); await wait(250); await mAdds[1].click(); await wait(600);
  const mb = await p.evaluate(() => { const b = document.querySelector('#cmp-bar'), r = b.getBoundingClientRect(); return {ask: b.querySelector('.cmp-ask-t').textContent, w: r.width, right: r.right, over: document.documentElement.scrollWidth > innerWidth}; });
  ok(mb.ask === 'Спросить Стеллу' && mb.right <= 390 && !mb.over, 'на телефоне плашка короче («Спросить Стеллу») и не вылезает за экран', mb);
  await p.click('.cmp-ask'); await wait(900); await p.idle(); await wait(300); r = await p.lastBot(); ok(r && /Сравниваю/.test(r.text) && r.disc, 'на телефоне сравнение через Стеллу работает, плашка есть');
  await p.ask('где фильтры?'); await wait(800); sp = await p.spot();
  ok(sp && await p.evaluate(() => { const pop = document.querySelector('.g-pop'); const r = pop.getBoundingClientRect(); return pop.classList.contains('sheet') && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }) && await p.evaluate(() => !document.body.classList.contains('asst-open')), 'на телефоне подсказка — нижняя «шторка» внутри экрана, чат свёрнут', sp);
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
  ok(r && /Сравниваю/.test(r.text) && r.cards.length === 2 && calls.length === c0, 'кнопка «Сравнить» из ответа ИИ: сравнение даёт Стелла по данным сайта, без обращения к ИИ', {calls: calls.length - c0});
  /* 4. плашка сравнения при включённом ИИ: тоже локально и мгновенно */
  await p.evaluate(() => window.Astreya.actions['cmp-clear']()); await p.keyboard.press('Escape'); await wait(300);
  await p.evaluate(() => window.Astreya.actions['cat-reset']()); await wait(300); const adds2 = await p.$$('.pcard:not([hidden]) .cmp-add'); await adds2[0].click(); await wait(250); await adds2[2].click(); await wait(500);
  const c1 = calls.length; await p.click('.cmp-ask'); await wait(1200); await p.idle(); await wait(300); r = await p.lastBot();
  ok(r && /Сравниваю/.test(r.text) && calls.length === c1, 'плашка «Попросить Стеллу рассказать» при включённом ИИ: ответ по данным сайта, без затрат на ИИ', {calls: calls.length - c1});
  /* 5. контекст для ИИ: отмеченные товары и страница уходят в запрос */
  set([{chunks: ['Хорошо.']}]); await p.ask('Что лучше брать для кабинета, подумай вслух?');
  const last = calls[calls.length - 1].messages; const lm = last[last.length - 1].content;
  ok(/\[Посетитель сейчас на странице «Каталог»; отметил для сравнения: .+\]/.test(typeof lm === 'string' ? lm : JSON.stringify(lm)), 'в запрос к ИИ добавляется служебная строка: страница и отмеченные для сравнения товары', typeof lm === 'string' ? lm.slice(0, 200) : lm);
  ok(/Ты — Стелла/.test(calls[calls.length - 1].system[0].text) && /ОТВЕТ, МОСТ, ШАГ/.test(calls[calls.length - 1].system[0].text), 'в запросе — инструкция Стеллы с «рамками» (ответ → мост → шаг)');
  ok(!p.errs.length, 'нет ошибок JS и консоли', p.errs); await p.context().close();

  await b.close(); await S.close(); A.setClientFactory(null);
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
