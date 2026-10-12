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
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1}); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await ctx.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));      // статический сервер проверки не знает про /api
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
      let s = await qc(); ok(s && !s.on && !s.vis, 'вверху страницы кнопка связи не показана');
      await p.evaluate(() => window.scrollTo({top: 900, behavior: 'instant'})); await wait(900); s = await qc(); ok(s && s.on && s.vis, 'после небольшой прокрутки кнопка появляется');
      await click('#qc .qc-btn'); const links = await p.$$eval('#qc a.qc-item', e => e.map(a => a.getAttribute('href'))); ok(links.length === 2 && /^tel:\+7/.test(links[0]) && /^https:\/\/wa\.me\//.test(links[1]), 'меню: звонок и WhatsApp из контактов сайта', links);
      await p.keyboard.press('Escape'); await wait(300); ok(await p.$eval('#qc-menu', e => e.hidden), 'Esc закрывает меню связи');
      await p.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})); await wait(900); s = await qc(); ok(s && !s.on, 'у подвала кнопка связи прячется');
      await p.goto(base + 'contacts.html'); await skipSplash(); await p.evaluate(() => window.scrollTo({top: 900, behavior: 'instant'})); await wait(700); s = await qc(); ok(!s || !s.vis, 'на странице «Контакты» кнопки связи нет (контакты и так на экране)');
      await p.goto(base + 'index.html'); await skipSplash(); await p.evaluate(() => { const j = document.getElementById('jar-story'); window.scrollTo({top: j.offsetTop + j.offsetHeight * 0.4, behavior: 'instant'}); }); await wait(1500); s = await qc(); ok(s && !s.on, 'во время вступления с баночкой кнопка связи не показывается');
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
    await p.goto(base + 'catalog.html'); await skipSplash(); ok(await p.$$eval('#recent .mini-p', e => e.length) === 3 && await p.$eval('#recent', e => e.compareDocumentPosition(document.getElementById('results')) & Node.DOCUMENT_POSITION_FOLLOWING), 'в каталоге — три просмотренных, над фильтрами');
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
    if (mobile) { await p.evaluate(() => window.scrollTo({top: 900, behavior: 'instant'})); await wait(800); await click('#qc .qc-btn'); ok(await p.$$eval('#qc .qc-item', e => e.length) === 3, 'в меню быстрой связи три пункта: звонок, WhatsApp, заказать звонок'); await click('#qc button.qc-item'); ok(await p.$eval('#modal', e => e.classList.contains('open')) && await p.$eval('#qc-menu', e => e.hidden), 'пункт открывает форму и закрывает меню связи'); await p.keyboard.press('Escape'); await wait(500); }

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
    const cmpN = () => p.evaluate(() => JSON.parse(localStorage.getItem('astreya:cmp') || '[]').length), cmpBarOn = () => p.evaluate(() => { const b = document.getElementById('cmp-bar'); return b && !b.hidden ? {n: +b.querySelector('.cmp-count').textContent, dis: b.querySelector('.cmp-open').disabled} : null; });
    ok(await p.$$eval('.pcard[data-id] > .cmp-add', e => e.length) === cardsN && await cmpBarOn() === null, 'на карточках есть кнопка сравнения, плашки пока нет');
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
    await p.goto(base + 'catalog.html'); await skipSplash(); await p.evaluate(() => { sessionStorage.removeItem('astreya:chat'); }); await p.reload(); await skipSplash();
    const fabOn = () => p.evaluate(() => { const f = document.getElementById('asst-fab'); if (!f) return null; const cs = getComputedStyle(f); return {vis: cs.opacity > 0.5 && cs.pointerEvents !== 'none', exp: f.getAttribute('aria-expanded')}; });
    let fo = await fabOn(); ok(fo && fo.vis && fo.exp === 'false' && await p.$eval('#asst', e => e.hidden), 'кнопка «Помощник» на месте, чат закрыт');
    await click('#asst-fab'); await wait(500);
    ok(await p.$eval('#asst', e => !e.hidden && e.classList.contains('open') && e.getAttribute('role') === 'dialog') && await p.evaluate(() => document.activeElement && document.activeElement.id === 'asst-in'), 'чат открывается, фокус в поле ввода');
    ok(/Помощник/.test(await p.$eval('.asst-h', e => e.textContent)) && await p.$$eval('#asst-log .asst-b', e => e.length) === 1 && await p.$$eval('#asst-chips .chip', e => e.length) >= 3, 'приветствие и подсказки');
    ok(await p.$eval('#asst-note', e => /программа/.test(e.textContent)), 'подпись: помощник — программа, не сотрудник');
    if (mobile) ok(await p.$eval('#asst', e => Math.round(e.getBoundingClientRect().width) === innerWidth), 'на телефоне чат — во весь экран');
    const ask = async q => { await p.fill('#asst-in', q); await p.keyboard.press('Enter'); await p.waitForFunction(() => !document.querySelector('.asst-typing') && !document.getElementById('asst-form').classList.contains('busy'), null, {timeout: 6000}); await wait(150); };
    const last = sel => p.$eval('#asst-log .asst-m:last-child', (e, s) => s ? [...e.querySelectorAll(s)].map(x => x.textContent.trim()) : e.textContent, sel);
    await ask('Какие у вас контакты и часы работы?'); const ans1 = await last(); ok(/925-51-62/.test(ans1) && /10:00/.test(ans1) && await p.$$eval('#asst-log .asst-m:last-child a[href^="tel:"]', e => e.length) === 1, 'контакты берутся из данных сайта');
    await ask('Сколько стоит Acidcure?'); const ans2 = await last(); ok(/Цен на сайте нет/.test(ans2) && !/\d\s?(₽|руб)/.test(ans2.replace(/от \d[\d\s]* ₽ — \d+%/g, '')) && await p.$$eval('#asst-log .asst-m:last-child .asst-card', e => e.length) === 1, 'о цене — честно «цен на сайте нет», без выдуманных сумм, с карточкой товара');
    await ask('Посоветуйте от пигментации'); ok(await p.$$eval('#asst-log .asst-m:last-child .asst-card', e => e.length) >= 2 && /не назначение/.test(await last()), 'подбор по задаче: карточки товаров и оговорка «не назначение»');
    await p.locator('#asst-log .asst-m:last-child .asst-card .rl-tog').first().click(); await wait(300); ok(await barN() === 1, 'кнопка «+» в чате кладёт товар в список запроса'); await p.evaluate(() => localStorage.removeItem('astreya:rl'));
    await ask('Мне можно при беременности?'); ok(/не даю медицинских рекомендаций/.test(await last()), 'медицинские вопросы — без рекомендаций, к специалисту');
    await ask('Ближайшие семинары'); ok(await p.$$eval('#asst-log .asst-m:last-child .asst-ev', e => e.length) >= 1, 'расписание: мероприятия с кнопкой «Записаться»');
    await p.locator('#asst-log .asst-m:last-child .asst-ev [data-act="form"]').first().click(); await wait(600); ok(await p.$eval('#modal', e => e.classList.contains('open') && !!e.querySelector('form[data-form="seminar"]')), 'запись открывает форму поверх чата');
    await p.keyboard.press('Escape'); await wait(500); ok(await p.$eval('#asst', e => e.classList.contains('open')), 'Esc закрывает только форму, чат остаётся');
    await ask('абракадабра квантовый'); ok(await p.$$eval('#asst-log .asst-m:last-child [data-act="asst-ask"]', e => e.length) === 1, 'непонятный вопрос — предложение передать менеджеру');
    await click('#asst-log .asst-m:last-child [data-act="asst-ask"]'); await wait(500); ok(await p.$eval('#modal', e => e.classList.contains('open') && /абракадабра/.test(e.querySelector('textarea').value)), 'вопрос переносится в форму «Вопрос менеджеру»'); await p.keyboard.press('Escape'); await wait(500);
    const hist = await p.evaluate(() => JSON.parse(sessionStorage.getItem('astreya:chat') || '[]').length); ok(hist >= 12, 'диалог сохраняется в sessionStorage вкладки', hist);
    if (mobile) { await p.keyboard.press('Escape'); } else await p.keyboard.press('Escape'); await wait(500); ok(await p.$eval('#asst', e => e.hidden || !e.classList.contains('open')), 'Esc закрывает чат');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'asst-fab'), 'фокус возвращается на кнопку «Помощник»');
    await p.reload(); await skipSplash(); await click('#asst-fab'); await wait(500); ok(await p.$$eval('#asst-log .asst-m', e => e.length) >= 12, 'после перезагрузки диалог на месте');
    await click('[data-act="asst-reset"]'); await wait(300); ok(await p.$$eval('#asst-log .asst-m', e => e.length) === 1, '«Начать заново» очищает диалог'); await p.keyboard.press('Escape'); await wait(400);
    /* автопроверка встроенных ответов на реальных данных */
    const sweep = await p.evaluate(() => { const A = Astreya, D = ASTREYA_DATA, bad = []; D.products.forEach(pr => { const r = A.assistant.answer('Расскажите про ' + pr.name); if (r.cards.indexOf(pr.id) < 0) bad.push('товар ' + pr.name); });
      D.brands.forEach(b => { const r = A.assistant.answer('Расскажите про ' + b.name); if (!r.links.some(l => l.h === 'brands/' + b.id + '.html') && !r.cards.some(id => (D.products.find(x => x.id === id) || {}).brand === b.id)) bad.push('бренд ' + b.name); });
      D.tasks.forEach(t => { const r = A.assistant.answer(t.label); if (!r.cards.length || !r.links.some(l => /task=/.test(l.h))) bad.push('задача ' + t.label); }); return bad; });
    ok(sweep.length === 0, 'на все товары, бренды и задачи каталога помощник отвечает по существу', sweep);
    if (mobile) { await p.goto(base + 'company.html'); await skipSplash(); await p.evaluate(() => window.scrollTo({top: 900, behavior: 'instant'})); await wait(900);
      const ov = await p.evaluate(() => { const a = document.getElementById('asst-fab').getBoundingClientRect(), q = document.getElementById('qc').getBoundingClientRect(); return {fab: [Math.round(a.top), Math.round(a.bottom)], qc: [Math.round(q.top), Math.round(q.bottom)], inter: !(a.right <= q.left || a.left >= q.right || a.bottom <= q.top || a.top >= q.bottom)}; });
      ok(!ov.inter, 'на телефоне «Помощник» и «Быстрая связь» не накладываются', ov); }

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
