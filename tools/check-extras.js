#!/usr/bin/env node
/* Проверка в браузере (нужны Playwright и Chromium; без них пропускается): дополнения интерфейса (js/extras.js, css/extras.css).
   — «Список запроса»: кнопка «+» на карточках и странице товара, плашка, окно со списком, отправка одной заявкой (тема и текст), очистка после отправки,
     хранение между страницами и перезагрузками; — быстрая связь на телефоне (когда видна, а когда нет); — печатная версия; — «В календарь» (.ics).
   Запуск: node tools/check-extras.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const http = require('http'), fs = require('fs'), pth = require('path');
const ROOT = pth.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ics': 'text/calendar; charset=utf-8'};
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
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
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
      await click('#qc .qc-btn'); const links = await p.$$eval('#qc .qc-item', e => e.map(a => a.getAttribute('href'))); ok(links.length === 2 && /^tel:\+7/.test(links[0]) && /^https:\/\/wa\.me\//.test(links[1]), 'меню: звонок и WhatsApp из контактов сайта', links);
      await p.keyboard.press('Escape'); await wait(300); ok(await p.$eval('#qc-menu', e => e.hidden), 'Esc закрывает меню связи');
      await p.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})); await wait(900); s = await qc(); ok(s && !s.on, 'у подвала кнопка связи прячется');
      await p.goto(base + 'contacts.html'); await skipSplash(); await p.evaluate(() => window.scrollTo({top: 900, behavior: 'instant'})); await wait(700); s = await qc(); ok(!s || !s.vis, 'на странице «Контакты» кнопки связи нет (контакты и так на экране)');
      await p.goto(base + 'index.html'); await skipSplash(); await p.evaluate(() => { const j = document.getElementById('jar-story'); window.scrollTo({top: j.offsetTop + j.offsetHeight * 0.4, behavior: 'instant'}); }); await wait(1500); s = await qc(); ok(s && !s.on, 'во время вступления с баночкой кнопка связи не показывается');
    } else { const s = await qc(); ok(!s || !s.vis, 'на компьютере кнопки быстрой связи нет'); }

    /* ---- печать ---- */
    await p.goto(base + 'products/biretix-gel-protiv-nesovershenstv.html'); await skipSplash(); await p.emulateMedia({media: 'print'}); await wait(300);
    const pr = await p.evaluate(() => { const d = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'нет'; }; const rv = [...document.querySelectorAll('.reveal')].filter(e => +getComputedStyle(e).opacity < 1).length; return {nav: d('.hdr .nav'), add: d('.rl-tog'), bar: d('#rl-bar'), rev: rv, bg: getComputedStyle(document.body).backgroundColor}; });
    ok(pr.nav === 'none' && pr.add === 'none' && pr.rev === 0 && /255, 255, 255/.test(pr.bg), 'печать: меню и кнопки скрыты, всё содержимое видно, фон белый', pr); await p.emulateMedia({media: 'screen'});

    ok(p.errs.length === 0, 'нет ошибок JS и консоли', p.errs.slice(0, 3));
    await ctx.close();
  }

  /* ---- «В календарь» ---- */
  if (cfg.calendar) {
    console.log('\n[календарь]');
    const ev = JSON.parse(fs.readFileSync(pth.join(ROOT, 'data/events.json'), 'utf8')), e0 = (Array.isArray(ev) ? ev : ev.items)[0];
    const ctx = await b.newContext({viewport: {width: 1440, height: 900}}); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(base + `training/${e0.slug}.html`); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await wait(900);
    const href = await p.$eval('#e-cta a[download]', a => a.getAttribute('href')).catch(() => null); ok(href === `${e0.slug}.ics`, 'на странице мероприятия есть кнопка «В календарь»', href);
    const r = await ctx.request.get(base + `training/${e0.slug}.ics`); const t = await r.text();
    ok(r.status() === 200 && /^BEGIN:VCALENDAR\r\n/.test(t) && /END:VCALENDAR\r\n$/.test(t) && t.includes('BEGIN:VEVENT'), 'файл .ics есть и оформлен по RFC 5545 (строки CRLF)');
    const d = e0.date.replace(/-/g, ''), [t1, t2] = e0.time.split(/[–-]/).map(x => x.replace(':', '') + '00');
    ok(t.includes(`DTSTART:${d}T${t1}`) && t.includes(`DTEND:${d}T${t2}`), 'начало и конец — из даты и времени мероприятия', t.split('\r\n').filter(l => /^DT/.test(l)));
    const tu = t.replace(/\r\n /g, '');                           // развернуть сложенные строки
    ok(tu.includes('SUMMARY:' + e0.title.replace(/,/g, '\\,')) && /URL:https?:\/\//.test(tu) && !/В\.\./.test(tu), 'название и ссылка на страницу — в событии (строки разворачиваются без потерь)');
    ok(t.split('\r\n').every(l => Buffer.byteLength(l) <= 75 + 1 || /^ /.test(l)), 'длинные строки сложены по 75 байт');
    const before = p.url(); await p.click('#e-cta a[download]', {noWaitAfter: true}).catch(() => {}); await wait(800); ok(p.url() === before && p.errs.length === 0, 'нажатие не уводит со страницы (скачивание), ошибок нет');
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
