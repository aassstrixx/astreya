#!/usr/bin/env node
/* Проверка в браузере (нужны Playwright и Chromium; без них пропускается): дополнения интерфейса (js/extras.js, css/extras.css).
   — «Список запроса»: кнопка «+» на карточках и странице товара, плашка, окно со списком, отправка одной заявкой (тема и текст), очистка после отправки,
     хранение между страницами и перезагрузками; — быстрая связь на телефоне (когда видна, а когда нет); — печатная версия.
   Запуск: node tools/check-extras.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const http = require('http'), fs = require('fs'), pth = require('path');
const ROOT = pth.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const cfg = JSON.parse(fs.readFileSync(pth.join(ROOT, 'data/redesign.json'), 'utf8')).extras || {};
(async () => {
  if (!cfg.enabled) { console.log('extras выключены в data/redesign.json — проверка пропущена.'); process.exit(0); }
  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('404'); } else { r.writeHead(200, {'Content-Type': MIME[pth.extname(f)] || 'application/octet-stream'}); r.end(d); } }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});

  for (const [name, W, H, mobile] of [['компьютер', 1440, 900, false], ['телефон', 390, 844, true]]) {
    console.log(`\n[${name}]`);
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1}); await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const d = document.querySelector('[data-shw-list]'); if (d) d.open = true; }); }); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await ctx.addInitScript(() => { window.__mcp = []; try { Object.defineProperty(navigator, 'modelContext', {value: {registerTool(t) { window.__mcp.push(t); }}, configurable: true}); } catch (e) {} });          // «браузер с WebMCP» для проверки
    await ctx.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));      // статический сервер проверки не знает про /api
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\./.test(m.text())) p.errs.push(m.text()); });
    const skipSplash = async () => { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await wait(900); };
    const barN = () => p.evaluate(() => { const bar = document.getElementById('rl-bar'); return bar && !bar.hidden ? +bar.querySelector('.rl-count').textContent : 0; });
    const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('astreya:rl') || '[]'));
    const click = async sel => { await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.locator(sel).first().click(); await wait(350); };

    /* ---- каталог: кнопки и плашка ---- */
    await p.goto(base + 'catalog.html'); await skipSplash();
    const cards = await p.$$eval('.pcard[data-id]', e => e.length), btns = await p.$$eval('.pcard[data-id] > .rl-add', e => e.length);
    ok(cards >= 20 && btns === cards, 'на каждой карточке каталога есть кнопка «+» (' + btns + ' из ' + cards + ')');
    ok(await barN() === 0 && await p.$eval('#rl-bar', e => e.hidden), 'пока список пуст, плашки нет');
    const first = await p.$eval('.pcard[data-id]', e => e.getAttribute('data-id')), url0 = p.url();
    await click('.pcard[data-id] .rl-add'); ok(await barN() === 1 && p.url() === url0, 'нажатие «+»: в списке 1, страница не уходит на карточку');
    ok(await p.$eval(`.pcard[data-id="${first}"] .rl-add`, e => e.getAttribute('aria-pressed') === 'true' && /Убрать/.test(e.getAttribute('aria-label'))), 'кнопка показывает «в списке» (aria-pressed, подпись)');
    const second = await p.locator('.pcard[data-id]').nth(1).getAttribute('data-id'); await p.locator('.pcard[data-id] .rl-add').nth(1).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .rl-add').nth(1).click(); await wait(300);
    ok(await barN() === 2, 'вторая позиция — в списке 2'); await p.locator('.pcard[data-id] .rl-add').nth(1).click(); await wait(300); ok(await barN() === 1, 'повторное нажатие убирает позицию'); await p.locator('.pcard[data-id] .rl-add').nth(1).click(); await wait(300);
    ok((await stored()).join() === [first, second].join(), 'список лежит в localStorage', await stored());
    await p.reload(); await skipSplash(); ok(await barN() === 2 && await p.$eval(`.pcard[data-id="${first}"] .rl-add`, e => e.getAttribute('aria-pressed') === 'true'), 'после перезагрузки список на месте');
    if (mobile) { const w = await p.$eval('#rl-bar', e => Math.round(e.getBoundingClientRect().width)); ok(w >= W - 40, 'на телефоне плашка во всю ширину', w); }

    /* ---- окно со списком ---- */
    await click('#rl-bar .rl-open'); ok(await p.$eval('#modal', e => e.classList.contains('open') && !!e.querySelector('.rl-dlg')) && await p.$$eval('#modal .rl-item', e => e.length) === 2, 'плашка открывает окно со списком (2 позиции)');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.closest('#modal') !== null), 'фокус внутри окна');
    await p.keyboard.press('Escape'); await wait(500); ok(await p.$eval('#modal', e => !e.classList.contains('open')), 'Esc закрывает окно'); ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('rl-open')), 'после закрытия фокус вернулся на плашку');
    await click('#rl-bar .rl-open'); await click('#modal .rl-del'); ok(await barN() === 1 && await p.$$eval('#modal .rl-item', e => e.length) === 1, 'удаление позиции в окне обновляет и список, и плашку');
    await click('#modal [data-act="rl-clear"]'); ok(await barN() === 0 && /Список пуст/.test(await p.$eval('#modal', e => e.textContent)), '«Очистить список» — пустое состояние с подсказкой');
    await p.keyboard.press('Escape'); await wait(500);

    /* ---- отправка одной заявкой ---- */
    await p.locator('.pcard[data-id] .rl-add').nth(0).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .rl-add').nth(0).click(); await p.locator('.pcard[data-id] .rl-add').nth(2).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .rl-add').nth(2).click(); await wait(300);
    const names = await p.$$eval('.pcard[data-id]', (e, ix) => ix.map(i => e[i].querySelector('h3').textContent.trim()), [0, 2]);
    let posted = null; await p.route('**/api/lead', async r => { posted = JSON.parse(r.request().postData() || '{}'); await r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
    await p.evaluate(() => { window.Astreya.config.formEndpoint = '/api/lead'; });
    await click('#rl-bar .rl-open'); await click('#modal [data-act="rl-send"]');
    const f = await p.evaluate(() => { const fm = document.querySelector('#modal form.lead-form'); return fm ? {type: fm.getAttribute('data-form'), ctx: (document.querySelector('#modal .ctx') || {}).textContent, msg: fm.elements.msg.value} : null; });
    ok(f && f.type === 'product' && /^Список запроса \(2\): /.test(f.ctx) && names.every(n => f.ctx.includes(n)), 'отправка открывает обычную форму: тема «Список запроса (2): …»', f && f.ctx);
    ok(f && /Интересуют позиции \(2\):/.test(f.msg) && names.every(n => f.msg.includes(n)) && f.ctx.length <= 300, 'полный список — в тексте сообщения; тема не длиннее 300 знаков', f && f.msg);
    await p.fill('#modal [name=name]', 'Тест Тестов'); await p.fill('#modal [name=phone]', '+7 916 555-44-33'); await p.fill('#modal [name=email]', 'test@example.ru'); await p.fill('#modal [name=city]', 'Москва'); await p.check('#modal [name=agree]');
    await p.click('#modal button[type=submit]'); await p.waitForSelector('#modal .ok h3', {timeout: 6000}); await wait(400);
    ok(posted && posted.type === 'product' && /^Список запроса \(2\)/.test(posted.context) && names.every(n => posted.msg.includes(n)), 'на сервер ушла одна заявка со списком', posted && {c: posted.context});
    ok(await barN() === 0 && (await stored()).length === 0 && await p.$$eval('.rl-add[aria-pressed="true"]', e => e.length) === 0, 'после отправленной заявки список очищен (плашка, кнопки, хранилище)');
    await p.keyboard.press('Escape'); await wait(500);

    /* ---- страница товара и переходы без перезагрузки ---- */
    await p.goto(base + 'products/biretix-gel-protiv-nesovershenstv.html'); await skipSplash();
    ok(await p.$$eval('.rl-tog', e => e.length) === 1, 'на странице товара — кнопка «В список запроса»');
    await click('.rl-tog'); ok(await barN() === 1 && /В списке запроса/.test(await p.$eval('.rl-tog', e => e.textContent)) && await p.$eval('.rl-tog', e => e.getAttribute('aria-pressed') === 'true'), 'кнопка на странице товара работает и показывает состояние');
    await p.goto(base + 'catalog.html'); await skipSplash(); ok(await p.$eval('.pcard[data-id="br-gel"] .rl-add', e => e.getAttribute('aria-pressed') === 'true'), 'на каталоге этот товар уже отмечен');
    if (!mobile) { await p.click('#hdr a.nl[data-nav="/brands"]'); await wait(2800); await p.click('#hdr a.nl[data-nav="/catalog"]'); await wait(2800); ok(await p.$$eval('.pcard > .rl-add', e => e.length) > 20 && await barN() === 1, 'после переходов по меню (без перезагрузки) кнопки и плашка на месте'); }
    await p.evaluate(() => localStorage.removeItem('astreya:rl'));

    /* ---- быстрая связь ---- */
    await p.goto(base + 'company.html'); await skipSplash(); await p.evaluate(() => localStorage.removeItem('astreya:rl'));
    const qc = () => p.evaluate(() => { const e = document.getElementById('qc'); if (!e) return null; const cs = getComputedStyle(e); return {on: e.classList.contains('on'), vis: cs.display !== 'none' && +cs.opacity > 0.5}; });
    if (mobile) {
      /* плавающая кнопка «Быстрая связь» (позвонить / мессенджеры / заказать звонок) в правом нижнем углу телефона убрана по просьбе: флаг extras.quickContact выключен */
      await p.evaluate(() => window.scrollTo({top: 900, behavior: 'instant'})); await wait(900); let s = await qc(); ok(!s, 'на телефоне нет круглой кнопки быстрой связи в правом нижнем углу (после прокрутки тоже)', s);
      await p.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})); await wait(700); ok(await p.evaluate(() => !document.querySelector('#qc, .qc-btn, .qc-menu')), 'ни кнопки, ни её меню в странице нет');
    } else { const s = await qc(); ok(!s || !s.vis, 'на компьютере кнопки быстрой связи нет'); }

    /* ---- печать ---- */
    await p.goto(base + 'products/biretix-gel-protiv-nesovershenstv.html'); await skipSplash(); await p.emulateMedia({media: 'print'}); await wait(300);
    const pr = await p.evaluate(() => { const d = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'нет'; }; const rv = [...document.querySelectorAll('.reveal')].filter(e => +getComputedStyle(e).opacity < 1).length; return {nav: d('.hdr .nav'), add: d('.rl-tog'), bar: d('#rl-bar'), rev: rv, bg: getComputedStyle(document.body).backgroundColor}; });
    ok(pr.nav === 'none' && pr.add === 'none' && pr.rev === 0 && /255, 255, 255/.test(pr.bg), 'печать: меню и кнопки скрыты, всё содержимое видно, фон белый', pr); await p.emulateMedia({media: 'screen'});


    /* ---- «Вы недавно смотрели» ---- */
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('__t')) { sessionStorage.setItem('__t', '1'); localStorage.removeItem('astreya:rv'); } });
    const rv = () => p.evaluate(() => JSON.parse(localStorage.getItem('astreya:rv') || '[]'));
    await p.goto(base + 'catalog.html'); await skipSplash(); ok(await p.$('#recent') === null, 'пока ничего не смотрели — блока «Недавно просмотренные» нет');
    for (const u of ['products/biretix-gel-protiv-nesovershenstv.html', 'products/biretix-ochischayuschiy-gel.html', 'products/biretix-uvlazhnyayuschiy-krem.html']) { await p.goto(base + u); await skipSplash(); }
    ok((await rv()).join() === 'br-cream,br-clean,br-gel', 'просмотренные товары запоминаются (новые первыми)', await rv());
    const rvc = await p.$$eval('#recent .mini-p', e => e.map(a => a.getAttribute('data-product'))); ok(rvc.join() === 'br-clean,br-gel' && !rvc.includes('br-cream'), 'на странице товара показаны предыдущие, текущий — нет', rvc);
    ok(await p.$eval('#recent', e => { const m = document.querySelector('.cta-band'); return !m || e.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING; }), 'блок стоит перед завершающим призывом');
    ok(await p.$$eval('#recent .mini-p .art', e => e.length) === 2 && await p.$$eval('#recent .mini-p .t', e => e.every(t => t.textContent.trim().length > 3)), 'карточки с иллюстрацией, брендом и названием');
    await p.goto(base + 'catalog.html'); await skipSplash(); ok(await p.$$eval('#recent .mini-p', e => e.length) === 3 && await p.$eval('#recent', e => document.querySelector('[data-shw]') ? !!(e.compareDocumentPosition(document.querySelector('[data-shw]')) & Node.DOCUMENT_POSITION_PRECEDING) : !!(e.compareDocumentPosition(document.getElementById('results')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'в каталоге — три просмотренных: над фильтрами (в шоуруме — сразу под сценой)');
    await click('#recent [data-act="rv-clear"]'); ok(await p.$('#recent') === null && (await rv()).length === 0, '«Очистить» убирает блок и стирает список');

    /* ---- «Заказать звонок» ---- */
    await p.goto(base + 'company.html'); await skipSplash();
    let posted2 = null; await p.route('**/api/lead', async r => { posted2 = JSON.parse(r.request().postData() || '{}'); await r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
    await p.evaluate(() => { window.Astreya.config.formEndpoint = '/api/lead'; });
    await click('.ftr .ftr-btn'); ok(await p.$eval('#modal', e => e.classList.contains('open') && /Заказать звонок/.test(e.querySelector('h2').textContent)), 'кнопка в подвале открывает форму «Заказать звонок»');
    ok(await p.$$eval('#modal form .fld', e => e.map(x => x.getAttribute('data-f')).join()) === 'name,phone,msg', 'в форме только имя, телефон и необязательный комментарий');
    await p.click('#modal button[type=submit]'); await wait(300); ok(await p.$$eval('#modal .fld.bad', e => e.length) === 2, 'без имени и телефона форма не уходит (подсвечены 2 поля)');
    await p.fill('#modal [name=name]', 'Тест Тестов'); await p.fill('#modal [name=phone]', '+7 916 555-44-33'); await p.check('#modal [name=agree]'); await p.click('#modal button[type=submit]'); await p.waitForSelector('#modal .ok h3', {timeout: 6000});
    ok(posted2 && posted2.type === 'callback' && posted2.phone && !posted2.email, 'на сервер ушла заявка типа «callback» (имя + телефон, без e-mail)', posted2 && posted2.type);
    await p.keyboard.press('Escape'); await wait(500); await p.unroute('**/api/lead');
    await p.goto(base + 'products/biretix-gel-protiv-nesovershenstv.html'); await skipSplash(); ok(await p.$$eval('.p-req button[data-type="callback"]', e => e.length) === 1, 'на странице товара в карточке запроса есть «Заказать звонок»');

    /* ---- быстрый просмотр ---- */
    await p.goto(base + 'catalog.html'); await skipSplash(); await p.evaluate(() => { localStorage.removeItem('astreya:cmp'); localStorage.removeItem('astreya:rl'); });
    await p.reload(); await skipSplash();
    const cardsN = await p.$$eval('.pcard[data-id]', e => e.length);
    ok(cardsN >= 20 && await p.$$eval('.pcard[data-id] > .qv-btn', e => e.length) === cardsN, 'на каждой карточке есть «Быстрый просмотр» (' + cardsN + ')');
    const urlQ = p.url(); await p.locator('.pcard[data-id]').nth(1).scrollIntoViewIfNeeded(); if (!mobile) await p.locator('.pcard[data-id]').nth(1).hover();
    await p.locator('.pcard[data-id] .qv-btn').nth(1).click(); await wait(500);
    ok(p.url() === urlQ && await p.$eval('#modal', e => e.classList.contains('open') && !!e.querySelector('.qv-dlg')), 'кнопка открывает окно, страница не уходит на карточку');
    const qv = await p.$eval('#modal', e => ({h: e.querySelector('h2').textContent, art: !!e.querySelector('.qv-art .art'), dt: [...e.querySelectorAll('.qv-spec dt')].map(x => x.textContent), dd: [...e.querySelectorAll('.qv-spec dd')].every(x => x.textContent.trim().length > 0), nav: (e.querySelector('.qv-nav span') || {}).textContent, foc: !!document.activeElement.closest('#modal')}));
    ok(qv.art && qv.h.length > 2 && qv.dt.includes('Бренд') && qv.dt.includes('Категория') && qv.dd, 'в окне: иллюстрация, название и только заполненные характеристики', qv);
    ok(/^2 из \d+$/.test(qv.nav) && qv.foc, 'счётчик «2 из N», фокус внутри окна', qv.nav);
    await click('#modal [data-act="qv-next"]'); ok(await p.$eval('#modal .qv-nav span', e => /^3 из/.test(e.textContent)) && await p.$eval('#modal h2', e => e.textContent) !== qv.h, 'стрелка «вперёд» листает товары');
    await p.keyboard.press('ArrowLeft'); await wait(300); ok(await p.$eval('#modal h2', e => e.textContent) === qv.h, 'клавиша ← возвращает к предыдущему');
    await click('#modal [data-act="qv-list"]'); ok(await barN() === 1 && await p.$eval('#modal [data-act="qv-list"]', e => e.getAttribute('aria-pressed') === 'true'), 'из окна можно добавить в список запроса');
    await click('#modal [data-act="qv-ask"]'); await wait(700); ok(await p.$eval('#modal', e => !!e.querySelector('form[data-form="product"]') && e.querySelector('.ctx').textContent.includes(document.querySelector('#modal h2') ? '' : '')), '«Запросить информацию» открывает форму запроса по товару');
    await p.keyboard.press('Escape'); await wait(500); await p.evaluate(() => localStorage.removeItem('astreya:rl'));

    /* ---- сравнение ---- */
    await p.goto(base + 'catalog.html'); await skipSplash();
    const cmpN = () => p.evaluate(() => JSON.parse(localStorage.getItem('astreya:cmp') || '[]').length), cmpBarOn = () => p.evaluate(() => { const b = document.getElementById('cmp-bar'); return b && !b.hidden ? {n: +b.querySelector('.cmp-count').textContent, dis: b.querySelector('.cmp-open') ? b.querySelector('.cmp-open').disabled : false} : null; });
    const navOn = await p.evaluate(() => !!(ASTREYA_DATA.extras.navigator && ASTREYA_DATA.guide));
    if (navOn) {
      /* с навигатором таблицы нет: выбранные товары собираются на плашке, а рассказывает о них Стелла (подробные проверки — tools/check-navigator.js) */
      ok(await p.$$eval('.pcard[data-id] > .cmp-add', e => e.length) === cardsN && await cmpBarOn() === null, 'на карточках есть кнопка сравнения, плашки пока нет');
      await p.locator('.pcard[data-id] .cmp-add').nth(0).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(0).click(); await wait(300);
      let one = await cmpBarOn(); ok(one && one.n === 1 && /Стелл/.test(await p.$eval('#cmp-bar .cmp-ask', e => e.textContent)) && !(await p.$('#cmp-bar .cmp-open')), 'уже с одним товаром плашка видна и предлагает попросить Стеллу рассказать (старой кнопки таблицы нет)', one);
      await p.locator('.pcard[data-id] .cmp-add').nth(1).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(1).click(); await wait(300);
      let cb = await cmpBarOn(); ok(cb && cb.n === 2 && await p.$eval('.pcard[data-id] .cmp-add', e => e.getAttribute('aria-pressed') === 'true') && await p.$$eval('#cmp-bar .cmp-names li', e => e.length) === 2, 'после двух товаров плашка показывает оба названия');
      await p.locator('.pcard[data-id] .cmp-add').nth(2).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(2).click(); await wait(300);
      await p.locator('.pcard[data-id] .cmp-add').nth(3).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(3).click(); await wait(400);
      ok(await cmpN() === 3 && /до 3 товаров/.test(await p.$eval('#toast', e => e.textContent)), 'больше трёх товаров не добавляется — подсказка', await cmpN());
      ok(await p.evaluate(() => { const d = document.getElementById('xdock'), r = document.querySelectorAll('#xdock > *:not([hidden])').length; return !!d && getComputedStyle(d).position === 'fixed' && r >= 1; }), 'плашки лежат в общем доке');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'страница не получила горизонтальной прокрутки');
      await p.reload(); await skipSplash(); cb = await cmpBarOn(); ok(cb && cb.n === 3, 'выбор сохраняется после перезагрузки');
      await click('#cmp-bar .cmp-ask'); await p.waitForSelector('#asst-log .asst-disc', {timeout: 25000}).catch(() => {}); await wait(400);
      const said = await p.evaluate(() => ({open: document.body.classList.contains('asst-open'), table: !!document.querySelector('.cmp-t, #modal.open'), txt: (() => { const rows = Array.from(document.querySelectorAll('#asst-log .asst-m.asst-b')), r = rows[rows.length - 1]; return r && r.querySelector('.asst-tx') ? r.querySelector('.asst-tx').textContent : ''; })(), plate: !!document.querySelector('#asst-log .asst-disc')}));
      ok(said.open && !said.table && /Сравниваю|Давайте сравним|Смотрю на/.test(said.txt) && said.plate, 'плашка открывает чат: Стелла сравнивает выбранные товары по данным сайта, с пометкой «не медицинская рекомендация», без таблицы', said);
      await p.keyboard.press('Escape'); await wait(500);
      await click('#cmp-bar .cmp-clr'); await wait(300); ok(await cmpN() === 0 && await cmpBarOn() === null, '«Очистить» на плашке убирает выбор и саму плашку');
    } else {
      ok(await p.$$eval('.pcard[data-id] > .cmp-add', e => e.length) === cardsN && await cmpBarOn() === null, 'на карточках есть кнопка сравнения, плашки пока нет');
      /* таблица открывается уже с одним товаром; остальные добавляются прямо в окне */
      await p.locator('.pcard[data-id] .cmp-add').nth(0).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(0).click(); await wait(300);
      let one = await cmpBarOn(); ok(one && one.n === 1 && !one.dis && /Открыть/.test(await p.$eval('#cmp-bar .cmp-go', e => e.textContent)), 'уже с одним товаром плашка «Сравнение» видна и открывается', one);
      await click('#cmp-bar .cmp-open'); await wait(300);
      const c1 = await p.$eval('#modal', e => ({cols: e.querySelectorAll('.cmp-t thead th[scope="col"]').length, pick: !!e.querySelector('select[data-act="cmp-pick"]'), only: !!e.querySelector('[data-act="cmp-only"]'), opts: e.querySelectorAll('select[data-act="cmp-pick"] option').length, hint: /одного товара/i.test(e.textContent)}));
      ok(c1.cols === 1 && c1.pick && !c1.only && c1.opts > 20 && c1.hint, 'окно с одним товаром: его данные, подсказка и список для добавления ещё одного', c1);
      await p.selectOption('#modal select[data-act="cmp-pick"]', {index: 1}); await wait(400);
      ok(await p.$$eval('#modal .cmp-t thead th[scope="col"]', e => e.length) === 2 && await cmpN() === 2 && await p.$eval('#modal', e => !!e.querySelector('[data-act="cmp-only"]')), 'выбор товара в окне добавляет колонку; появляется «Только различия»');
      await p.keyboard.press('Escape'); await wait(400); await p.evaluate(() => localStorage.removeItem('astreya:cmp')); await p.reload(); await skipSplash();
      for (const i of [0, 1]) { await p.locator('.pcard[data-id] .cmp-add').nth(i).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(i).click(); await wait(300); }
      let cb = await cmpBarOn(); ok(cb && cb.n === 2 && !cb.dis && await p.$eval('.pcard[data-id] .cmp-add', e => e.getAttribute('aria-pressed') === 'true'), 'после двух товаров плашка «Сравнение» активна');
      await p.locator('.pcard[data-id] .cmp-add').nth(2).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(2).click(); await wait(300);
      await p.locator('.pcard[data-id] .cmp-add').nth(3).scrollIntoViewIfNeeded(); await p.locator('.pcard[data-id] .cmp-add').nth(3).click(); await wait(400);
      ok(await cmpN() === 3 && /до 3 товаров/.test(await p.$eval('#toast', e => e.textContent)), 'больше трёх товаров не добавляется — подсказка', await cmpN());
      ok(await p.evaluate(() => { const d = document.getElementById('xdock'), r = document.querySelectorAll('#xdock > *:not([hidden])').length; return !!d && getComputedStyle(d).position === 'fixed' && r >= 1; }), 'плашки лежат в общем доке');
      await click('#cmp-bar .cmp-open'); await wait(300);
      const ct = await p.$eval('#modal', e => ({cols: e.querySelectorAll('.cmp-t thead th[scope="col"]').length, rows: e.querySelectorAll('.cmp-t tbody tr').length, hdr: [...e.querySelectorAll('.cmp-t tbody th')].map(x => x.textContent), over: e.querySelector('.cmp-wrap').scrollWidth > e.querySelector('.cmp-wrap').clientWidth + 1}));
      ok(ct.cols === 3 && ct.hdr.includes('Бренд') && ct.hdr.includes('Назначение') && ct.rows >= 5, 'таблица: три товара, строки «Бренд … Назначение»', ct);
      if (mobile) ok(ct.over || await p.$eval('#modal .cmp-wrap', e => e.scrollWidth <= e.clientWidth + 1), 'на телефоне таблица листается внутри окна, а не расширяет страницу'); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'страница не получила горизонтальной прокрутки');
      await p.check('#modal [data-act="cmp-only"]'); await wait(300); const rowsOnly = await p.$$eval('#modal .cmp-t tbody tr', e => e.length); ok(rowsOnly > 0 && rowsOnly <= ct.rows, '«Только различия» не добавляет строк', [rowsOnly, ct.rows]);
      await click('#modal .cmp-x'); ok(await p.$$eval('#modal .cmp-t thead th[scope="col"]', e => e.length) === 2 && await cmpN() === 2, 'крестик убирает товар из сравнения');
      await p.reload(); await skipSplash(); cb = await cmpBarOn(); ok(cb && cb.n === 2, 'выбор сохраняется после перезагрузки');
      await click('#cmp-bar .cmp-open'); await click('#modal [data-act="cmp-clear"]'); await wait(300); ok(await cmpN() === 0 && await cmpBarOn() === null, '«Очистить сравнение» убирает выбор и плашку');
      await p.keyboard.press('Escape'); await wait(400);
    }

    /* ---- обратный отсчёт ---- */
    await p.goto(base + 'training.html'); await skipSplash();
    const nextEv = await p.evaluate(() => { const E = (ASTREYA_DATA.events || []).filter(e => new Date(e.date + 'T23:59:59+03:00') > Date.now()).sort((a, b) => a.date.localeCompare(b.date)); return E[0] ? E[0].id : null; });
    const cdId = await p.$eval('.cd', e => e.getAttribute('data-ev')).catch(() => null);
    ok(nextEv ? cdId === nextEv : cdId === null, 'отсчёт идёт до ближайшего мероприятия (' + nextEv + ')', cdId);
    if (cdId) {
      const cdv = await p.$eval('.cd', e => ({cells: e.querySelectorAll('.cd-b span').length, live: !!e.querySelector('.cd-live'), role: e.getAttribute('role'), msk: /московск/.test(e.textContent), btn: !!e.querySelector('[data-act="form"][data-type="seminar"]')}));
      ok((cdv.cells === 3 || cdv.live) && cdv.role === 'timer' && cdv.msk && cdv.btn, 'таймер: дни/часы/минуты, подпись «время московское», кнопка «Записаться»', cdv);
      await click('.cd [data-act="form"]'); ok(await p.$eval('#modal', e => e.classList.contains('open') && !!e.querySelector('form[data-form="seminar"]')), 'кнопка открывает запись на это мероприятие'); await p.keyboard.press('Escape'); await wait(400);
      await p.goto(base + 'index.html'); await skipSplash(); await wait(300); ok(await p.$$eval('.cd', e => e.length) <= 1, 'на главной не больше одного отсчёта');
    }

    /* ---- подписка в подвале ---- */
    await p.goto(base + 'company.html'); await skipSplash();
    ok(await p.$$eval('.ftr-sub form[data-form="subscribe"] .fld', e => e.map(x => x.getAttribute('data-f')).join()) === 'email', 'в подвале форма подписки: одно поле — e-mail');
    let posted3 = null; await p.route('**/api/lead', async r => { posted3 = JSON.parse(r.request().postData() || '{}'); await r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
    await p.evaluate(() => { window.Astreya.config.formEndpoint = '/api/lead'; });
    await p.locator('.ftr-sub button[type=submit]').scrollIntoViewIfNeeded(); await p.click('.ftr-sub button[type=submit]'); await wait(300);
    ok(await p.$$eval('.ftr-sub .fld.bad', e => e.length) === 1 && await p.$eval('.ftr-sub .agree', e => e.classList.contains('bad')) && posted3 === null, 'без адреса и согласия подписка не уходит');
    await p.fill('.ftr-sub input[type=email]', 'нет-собаки'); await p.check('.ftr-sub [name=agree]'); await p.click('.ftr-sub button[type=submit]'); await wait(300); ok(posted3 === null && await p.$$eval('.ftr-sub .fld.bad', e => e.length) === 1, 'неверный адрес не принимается');
    await p.fill('.ftr-sub input[type=email]', 'test@example.ru'); await wait(800); await p.click('.ftr-sub button[type=submit]'); await p.waitForSelector('.ftr-sub .ok h3', {timeout: 6000});
    ok(posted3 && posted3.type === 'subscribe' && posted3.email === 'test@example.ru' && !posted3.name && posted3.consent === true, 'на сервер ушла заявка типа «subscribe» (только e-mail и согласие)', posted3);
    ok(/Спасибо/.test(await p.$eval('.ftr-sub .ok h3', e => e.textContent)), 'после отправки — короткая благодарность'); await p.unroute('**/api/lead');

    /* ---- помощник ---- */
    await p.goto(base + 'catalog.html'); await skipSplash(); await p.evaluate(() => { sessionStorage.removeItem('astreya:chat2'); sessionStorage.removeItem('astreya:asst-tip'); }); await p.reload(); await skipSplash();
    const fabOn = () => p.evaluate(() => { const f = document.getElementById('asst-fab'); if (!f) return null; const cs = getComputedStyle(f); return {vis: cs.opacity > 0.5 && cs.pointerEvents !== 'none', exp: f.getAttribute('aria-expanded')}; });
    const idle = () => p.waitForFunction(() => !document.getElementById('asst-form').classList.contains('busy') && !document.querySelector('.asst-typing'), null, {timeout: 14000});
    await p.waitForFunction(() => { const f = document.getElementById('asst-fab'); return f && getComputedStyle(f).opacity > 0.5; }, null, {timeout: 9000}).catch(() => {}); let fo = await fabOn(); ok(fo && fo.vis && fo.exp === 'false' && await p.$eval('#asst', e => e.hidden), 'кнопка «Помощник» на месте, чат закрыт');
    /* кнопка Стеллы: маскот, подпись, искры при появлении, «магнит» и ховер (только компьютер) */
    const fabI = await p.evaluate(() => { const f = document.getElementById('asst-fab'), t = f.querySelector('.asst-fab-t'); return {pe: f.querySelectorAll('svg.pe').length, mood: (f.querySelector('.pe') || {getAttribute: () => ''}).getAttribute('data-m'), label: t ? t.textContent.trim() : '', aria: f.getAttribute('aria-label'), sparks: f.querySelectorAll('.asst-fab-fx i').length, burst: !!f.querySelector('.asst-fab-fx.go'), defs: !!document.getElementById('pe-g')}; });
    ok(fabI.pe === 1 && fabI.label === 'Спросить Стеллу' && /Стелла/.test(fabI.aria) && fabI.sparks >= 6 && fabI.defs, 'кнопка: жемчужинка Стелла, подпись «Спросить Стеллу», доступное имя, искры и градиент на месте', fabI);
    if (!mobile) {
      ok(fabI.burst, 'при появлении кнопки запускается россыпь искр');
      await p.waitForFunction(() => { const f = document.getElementById('asst-fab'); return f.classList.contains('settled'); }, null, {timeout: 16000}).catch(() => {}); await wait(600);
      const w0 = await p.$eval('#asst-fab', e => ({long: e.classList.contains('long'), w: e.offsetWidth, sweep: !!e.querySelector('.asst-fab-sweep')})); ok(!w0.long && w0.w < 70 && !w0.sweep, 'сразу после появления кнопка — круг: подпись сама не раскрывается, блика нет', w0);
      await p.mouse.move(700, 300); for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 100); await wait(30); }       // человек пролистал страницу — после остановки подпись раскрывается на пару секунд
      await p.waitForFunction(() => { const f = document.getElementById('asst-fab'); return f.classList.contains('long') && f.offsetWidth > 150; }, null, {timeout: 6000}).catch(() => {}); const w1 = await p.$eval('#asst-fab', e => ({long: e.classList.contains('long'), w: e.offsetWidth})); ok(w1.long && w1.w > 150, 'после прокрутки подпись раскрыта (кнопка-«таблетка»), ширина ' + w1.w, w1);
      await wait(4200); const w2 = await p.$eval('#asst-fab', e => ({long: e.classList.contains('long'), w: e.offsetWidth})); ok(!w2.long && w2.w < 70, 'через пару секунд подпись снова свёрнута в круг', w2);
      await p.mouse.move(700, 300); await wait(150); const far = await p.$eval('#asst-fab', e => e.style.getPropertyValue('--ex'));
      const bx = await p.$eval('#asst-fab', e => { const r = e.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
      await p.mouse.move(bx.x - 90, bx.y - 20); await wait(200); const near = await p.$eval('#asst-fab', e => ({ex: e.style.getPropertyValue('--ex'), mx: e.style.getPropertyValue('--mx')}));
      ok(near.ex !== '' && parseFloat(near.ex) < -0.3 && parseFloat(near.mx) < 0, 'глаза Стеллы следят за курсором, а кнопка слегка тянется к нему', {far, near});
      await p.mouse.move(10, 10); await wait(100);
    } else ok(await p.$eval('#asst-fab .asst-fab-t', e => getComputedStyle(e).display === 'none') && await p.$eval('#asst-fab', e => e.offsetWidth === 56 && e.offsetHeight === 56), 'на телефоне кнопка — круглая, без подписи');
    await click('#asst-fab'); await wait(500);
    ok(await p.$eval('#asst', e => !e.hidden && e.classList.contains('open') && e.getAttribute('role') === 'dialog') && await p.evaluate(m => m ? true : (document.activeElement && document.activeElement.id === 'asst-in'), mobile), 'чат открывается; на компьютере фокус в поле ввода (на телефоне клавиатуру сами не открываем)');
    ok(await p.$eval('#asst-form', e => e.classList.contains('busy')) && await p.$('#asst-log .asst-m') !== null, 'первое сообщение приходит «живым»: чат занят, пока Стелла «печатает», а не показывает всё мгновенно');
    await idle(); await wait(200);
    ok(/Стелла/.test(await p.$eval('.asst-h', e => e.textContent)) && await p.$$eval('.asst-h svg.pe', e => e.length) === 1 && await p.$$eval('#asst-log .asst-b', e => e.length) === 1 && /Я Стелла/.test(await p.$eval('#asst-log .asst-b', e => e.textContent)) && await p.$$eval('#asst-log #asst-qr .chip', e => e.length) >= 3, 'Стелла представляется, маскот в шапке и у сообщения; приветствие и быстрые ответы внутри ленты (ничего не перекрывают)');
    await p.evaluate(() => { window.ASTREYA_MOTION_SPEED = 6; });          // дальше паузы и печать ускорены в 6 раз (ритм проверяется отдельно, на реальной скорости)
    ok(await p.$eval('#asst-note', e => /программа/.test(e.textContent)), 'подпись: помощник — программа, не сотрудник');
    if (mobile) ok(await p.$eval('#asst', e => Math.round(e.getBoundingClientRect().width) === innerWidth), 'на телефоне чат — во весь экран');
    const ask = async q => { await p.fill('#asst-in', q); await p.keyboard.press('Enter'); await p.waitForFunction(() => !document.querySelector('.asst-typing') && !document.getElementById('asst-form').classList.contains('busy'), null, {timeout: 14000}); await wait(150); };
    const last = sel => p.$eval('#asst-log .asst-m:nth-last-child(2)', (e, s) => s ? [...e.querySelectorAll(s)].map(x => x.textContent.trim()) : e.textContent, sel);
    await ask('Какие у вас контакты и часы работы?'); const ans1 = await last(); ok(/925-51-62/.test(ans1) && /10:00/.test(ans1) && await p.$$eval('#asst-log .asst-m:nth-last-child(2) a[href^="tel:"]', e => e.length) === 1, 'контакты берутся из данных сайта');
    await ask('Сколько стоит Acidcure?'); const ans2 = await last(); ok(/Цен на сайте нет/.test(ans2) && !/\d\s?(₽|руб)/.test(ans2.replace(/от \d[\d\s]* ₽ — \d+%/g, '')) && await p.$$eval('#asst-log .asst-m:nth-last-child(2) .asst-card', e => e.length) === 1, 'о цене — честно «цен на сайте нет», без выдуманных сумм, с карточкой товара');
    await ask('Посоветуйте от пигментации'); ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) .asst-card', e => e.length) >= 2 && /не назначение/.test(await last()), 'подбор по задаче: карточки товаров и оговорка «не назначение»');
    await p.locator('#asst-log .asst-m:nth-last-child(2) .asst-card .rl-tog').first().click(); await wait(300); ok(await barN() === 1, 'кнопка «+» в чате кладёт товар в список запроса'); await p.evaluate(() => localStorage.removeItem('astreya:rl'));
    await ask('Мне можно при беременности?'); ok(/не даю медицинских рекомендаций/.test(await last()), 'медицинские вопросы — без рекомендаций, к специалисту');
    await ask('Ближайшие семинары'); ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) .asst-ev', e => e.length) >= 1, 'расписание: мероприятия с кнопкой «Записаться»');
    await p.locator('#asst-log .asst-m:nth-last-child(2) .asst-ev [data-act="form"]').first().click(); await wait(600); ok(await p.$eval('#modal', e => e.classList.contains('open') && !!e.querySelector('form[data-form="seminar"]')), 'запись открывает форму поверх чата');
    await p.keyboard.press('Escape'); await wait(500); ok(await p.$eval('#asst', e => e.classList.contains('open')), 'Esc закрывает только форму, чат остаётся');
    await ask('абракадабра квантовый'); ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) [data-act="asst-ask"]', e => e.length) === 1, 'непонятный вопрос — предложение передать менеджеру');
    await click('#asst-log .asst-m:nth-last-child(2) [data-act="asst-ask"]'); await wait(500); ok(await p.$eval('#modal', e => e.classList.contains('open') && /абракадабра/.test(e.querySelector('textarea').value)), 'вопрос переносится в форму «Вопрос менеджеру»'); await p.keyboard.press('Escape'); await wait(500);
    const hist = await p.evaluate(() => ((JSON.parse(sessionStorage.getItem('astreya:chat2') || '{}').msgs) || []).length); ok(hist >= 12, 'диалог сохраняется в sessionStorage вкладки', hist);
    if (mobile) { await p.keyboard.press('Escape'); } else await p.keyboard.press('Escape'); await wait(500); ok(await p.$eval('#asst', e => e.hidden || !e.classList.contains('open')), 'Esc закрывает чат');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'asst-fab'), 'фокус возвращается на кнопку «Помощник»');
    await p.reload(); await skipSplash(); await p.evaluate(() => { window.ASTREYA_MOTION_SPEED = 6; }); await click('#asst-fab'); await wait(500); ok(await p.$$eval('#asst-log .asst-m', e => e.length) >= 12, 'после перезагрузки диалог на месте');
    await click('[data-act="asst-reset"]'); await wait(300); ok(await p.$$eval('#asst-log .asst-m', e => e.length) === 1, '«Начать заново» очищает диалог'); await idle(); await p.keyboard.press('Escape'); await wait(400);
    /* ---- живость интерфейса: печать, стоп, оценка, память диалога, расчёт, менеджер ---- */
    await click('#asst-fab'); await wait(700); await click('[data-act="asst-reset"]'); await wait(300); await idle();
    const geom = await p.evaluate(() => { const l = document.getElementById('asst-log').getBoundingClientRect(), f = document.getElementById('asst-form').getBoundingClientRect(), q = document.getElementById('asst-qr').getBoundingClientRect(), h = document.querySelector('.asst-h').getBoundingClientRect(); return {qrInside: q.top >= l.top - 1 && q.bottom <= l.bottom + 400, formBelow: f.top >= l.bottom - 1, headAbove: h.bottom <= l.top + 1}; });
    ok(geom.formBelow && geom.headAbove, 'шапка, лента и поле ввода идут друг за другом без наложений', geom);
    await p.evaluate(() => { window.ASTREYA_MOTION_SPEED = 1; });          // ритм «печати» — на реальной скорости
    await p.fill('#asst-in', 'Расскажите о компании'); await p.keyboard.press('Enter'); let caret = false, grow = [];
    for (let i = 0; i < 90 && !caret; i++) { await wait(100); caret = await p.$('#asst-log .asst-caret') !== null; if (caret) grow.push(await p.$eval('#asst-log .asst-m:nth-last-child(2) .asst-tx', e => e.textContent.length)); }
    ok(caret, 'ответ «печатается» (виден курсор), а не появляется целиком');
    { const cp = await p.evaluate(() => { const c = document.querySelector('#asst-log .asst-caret'); if (!c) return null; const par = c.parentElement, r = c.getBoundingClientRect(), pr = par.getBoundingClientRect(); return {tag: par.tagName, inBox: r.top >= pr.top - 2 && r.bottom <= pr.bottom + 2, h: Math.round(pr.height), lh: parseFloat(getComputedStyle(par).lineHeight) || 0}; });
      ok(cp && /^(P|LI|CODE)$/.test(cp.tag) && cp.inBox, 'курсор печати стоит в одной строке с текстом (внутри абзаца), а не отдельной строкой под ним', cp); }
    await wait(600); grow.push(await p.$eval('#asst-log .asst-m:nth-last-child(2) .asst-tx', e => e.textContent.length));
    ok(await p.$eval('#asst-send', e => e.classList.contains('stop') && /Остановить/.test(e.getAttribute('aria-label'))), 'во время ответа кнопка отправки превращается в «Остановить»');
    const t0 = Date.now(); await p.click('#asst-send'); await p.waitForFunction(() => !document.getElementById('asst-form').classList.contains('busy'), null, {timeout: 3000}); const stopMs = Date.now() - t0;
    await p.evaluate(() => { window.ASTREYA_MOTION_SPEED = 6; });
    ok(stopMs < 1500 && await p.$('#asst-log .asst-caret') === null && /дистрибьютор/i.test(await p.$eval('#asst-log .asst-m:nth-last-child(2) .asst-tx', e => e.textContent)), '«Стоп» мгновенно показывает ответ целиком', stopMs);
    ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) .asst-fb button', e => e.length) === 2, 'под ответом — оценка 👍/👎');
    await click('#asst-log .asst-m:nth-last-child(2) .asst-fb button[data-v="1"]'); ok(await p.$eval('#asst-log .asst-m:nth-last-child(2) .asst-fb button[data-v="1"]', e => e.getAttribute('aria-pressed') === 'true'), '«Помог» отмечается');
    await click('#asst-log .asst-m:nth-last-child(2) .asst-fb button[data-v="-1"]'); await wait(400); ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) [data-act="asst-ask"]', e => e.length) === 1 && /не помог/.test(await last()), '«Не помог» → предлагает передать вопрос менеджеру');
    await click('[data-act="asst-reset"]'); await wait(300); await idle();
    await ask('Посоветуйте от пигментации'); await ask('а у Dermatime?'); ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) .asst-card-t small', e => e.length > 0 && e.every(x => /dermatime/i.test(x.textContent))), 'помнит предыдущую задачу: «а у Dermatime?» → тот же подбор у бренда');
    await ask('почему именно эти?'); ok(/Порядок такой/.test(await last()), '«почему именно эти?» — объясняет, как подобрано');
    await ask('Какие скидки?'); await ask('а при 200 тысячах?'); ok(/10%/.test(await last()) && /20\s000/.test(await last()), 'считает скидку по названной сумме (200 000 → 10%, экономия 20 000)');
    await ask('Я косметолог из Ростова'); await ask('какие семинары?'); ok(/Ростов/.test(await last()) && await p.$$eval('#asst-log .asst-m:nth-last-child(2) .asst-ev', e => e.length) === 1, 'запомнил роль и город: семинары — сразу по городу');
    await click('[data-act="asst-human"]'); await p.waitForFunction(() => !document.getElementById('asst-form').classList.contains('busy'), null, {timeout: 6000}); ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) [data-type="callback"]', e => e.length) === 1, 'кнопка «Связаться с менеджером» в шапке всегда под рукой');
    await ask('пигментацыя'); ok(await p.$$eval('#asst-log .asst-m:nth-last-child(2) .asst-card', e => e.length) >= 2, 'опечатка в слове не мешает понять вопрос');
    await click('[data-act="asst-reset"]'); await wait(300); await idle();
    /* ---- WebMCP: инструменты только для чтения отдаются ИИ-агентам браузера ---- */
    const mcp = await p.evaluate(() => (window.__mcp || []).map(t => ({name: t.name, ro: !!(t.annotations && t.annotations.readOnlyHint), schema: !!(t.inputSchema && t.inputSchema.type === 'object'), desc: (t.description || '').length > 20})));
    ok(mcp.map(x => x.name).join() === 'search_products,list_events,discount_for_amount,get_contacts' && mcp.every(x => x.ro && x.schema && x.desc), 'WebMCP: четыре инструмента «только чтение» с описаниями и схемами', mcp);
    const mcpOut = await p.evaluate(async () => { const t = window.__mcp.find(x => x.name === 'discount_for_amount'), r = await t.execute({amount_rub: 200000}), e = await window.__mcp.find(x => x.name === 'list_events').execute({online: true}); return {d: JSON.parse(r.content[0].text), e: JSON.parse(e.content[0].text)}; });
    ok(mcpOut.d.pct === 10 && mcpOut.d.saving === 20000 && mcpOut.e.events.every(x => /Онлайн|Вебинар/i.test(x.city + x.format)), 'WebMCP: инструменты возвращают данные сайта (скидка 200 000 → 10%, онлайн-мероприятия)', mcpOut);
    /* автопроверка встроенных ответов на реальных данных */
    const sweep = await p.evaluate(() => { const A = Astreya, D = ASTREYA_DATA, bad = []; D.products.forEach(pr => { const r = A.assistant.answer('Расскажите про ' + pr.name); if (r.cards.indexOf(pr.id) < 0) bad.push('товар ' + pr.name); });
      D.brands.forEach(b => { const r = A.assistant.answer('Расскажите про ' + b.name); if (!r.links.some(l => l.h === 'brands/' + b.id + '.html') && !r.cards.some(id => (D.products.find(x => x.id === id) || {}).brand === b.id)) bad.push('бренд ' + b.name); });
      D.tasks.forEach(t => { const r = A.assistant.answer(t.label); if (!r.cards.length || !r.links.some(l => /task=/.test(l.h))) bad.push('задача ' + t.label); }); return bad; });
    ok(sweep.length === 0, 'на все товары, бренды и задачи каталога помощник отвечает по существу', sweep);

    /* ---- поле «Комментарий»: без растяжки, растёт по мере набора ---- */
    await p.goto(base + 'partners.html'); await skipSplash(); await p.locator('main textarea').first().scrollIntoViewIfNeeded();
    const ta = p.locator('main textarea').first(), g = () => ta.evaluate(e => ({h: Math.round(e.getBoundingClientRect().height), rz: getComputedStyle(e).resize}));
    const g0 = await g(); ok(g0.rz === 'none' && g0.h >= 130, 'поле комментария: ручной растяжки нет, высота ≥ 130 px', g0);
    await ta.fill(Array.from({length: 12}, (_, i) => 'Строка ' + (i + 1)).join('\n')); await wait(200); const g1 = await g(); ok(g1.h > g0.h + 100, 'при наборе текста поле растёт (было ' + g0.h + ' → стало ' + g1.h + ' px)', [g0, g1]);
    await ta.fill(''); await wait(200); const g2 = await g(); ok(g2.h === g0.h, 'после очистки возвращается к исходной высоте', [g0, g2]);
    await ta.fill(Array.from({length: 80}, (_, i) => 'Строка ' + (i + 1)).join('\n')); await wait(200); const g3 = await g(); ok(g3.h <= H * 0.56 && await ta.evaluate(e => e.scrollHeight > e.clientHeight), 'очень длинный текст: рост ограничен ≈55% экрана, дальше прокрутка внутри поля', g3);
    ok(p.errs.length === 0, 'нет ошибок JS и консоли', p.errs.slice(0, 3));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
