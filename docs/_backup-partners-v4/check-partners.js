#!/usr/bin/env node
/* Проверка страницы «Партнёрам» (страница v2) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Партнёрам: первый экран (дверь), шесть ниш преимуществ, четыре ступени, калькулятор — сумма, текст скидки и экономия на шагах от нуля до максимума равны расчёту по порогам из data/site.json
   (считается здесь независимо от страницы), подсветка порога, кнопки «−/+», быстрый выбор суммы, клавиатура (стрелки), значение ползунка для скринридера, «ориентир» (js/sales-pages.js) на месте,
   заявка: пустая форма подсвечивает поля, правильная уходит (запрос на /api/lead перехватывается) и показывает «спасибо»; без горизонтальной прокрутки на 1440, 768 и 390.
   Запуск: node tools/check-partners.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8')), CONTENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8'));
const DS = SITE.discounts.slice().sort((a, b) => a.from - b.from), PT = CONTENT.partners;
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };
const rub = n => new Intl.NumberFormat('ru-RU').format(n).replace(/ | /g, ' ') + ' ₽';
const norm = s => String(s || '').replace(/[\s  ]+/g, ' ').trim();

(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('нет'); return; } r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const leads = [];
  const open = async (url, w, h, touch) => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', hasTouch: !!touch, isMobile: !!touch}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); sessionStorage.setItem('astreya:splash', '1'); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.route('**/api/lead', r => { try { leads.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); });
    await p.goto(base + '/' + url); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(1800); p._errs = errs; return p;
  };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const setRange = (p, v) => p.evaluate(v => { const r = document.getElementById('calc-range'); r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); }, v);
  const read = p => p.evaluate(() => ({sum: document.getElementById('calc-sum').textContent, tier: document.getElementById('calc-tier').textContent, save: document.getElementById('calc-save').textContent, on: [...document.querySelectorAll('.tier')].map(x => x.classList.contains('on') ? 1 : 0).join(''), reached: [...document.querySelectorAll('.tier')].map(x => x.classList.contains('reached') ? 1 : 0).join(''), val: +document.getElementById('calc-range').value, vt: document.getElementById('calc-range').getAttribute('aria-valuetext'), pressed: [...document.querySelectorAll('[data-pp-set]')].filter(x => x.getAttribute('aria-pressed') === 'true').map(x => +x.getAttribute('data-pp-set'))}));

  /* ================= ПАРТНЁРАМ ================= */
  let p = await open('partners.html', 1440, 900);
  t(await p.evaluate(() => document.body.dataset.page === 'partners' && !!document.querySelector('.pp[data-pp]')), 'партнёрам: страница v2 включена (.pp)');
  t(await p.evaluate(() => document.querySelectorAll('h1').length === 1), 'партнёрам: один заголовок первого уровня');
  t(/Станьте партнёром/.test(await p.textContent('.pp-hero h1')) && !!(await p.$('.pp-hero a[href="#form"][data-act="scroll"]')) && !!(await p.$('.pp-hero a[href^="tel:"]')), 'партнёрам: первый экран — заголовок, «Оставить заявку» и телефон');
  t(await p.evaluate(() => { const i = document.querySelector('.pp-scene img'); return !!i && i.complete && i.naturalWidth > 1000; }), 'партнёрам: дверь (рендер) загружена');
  const ben = await p.evaluate(() => ({n: document.querySelectorAll('.pp-niche').length, g3: !!document.querySelector('main .sec:not(.tint):not(#calc):not(#form) .grid.g3'), ids: ['calc', 'form', 'benefits', 'way'].every(i => !!document.getElementById(i)), packs: document.querySelectorAll('.pp-niche img').length}));
  t(ben.n === PT.benefits.length && ben.g3 && ben.ids && ben.packs >= ben.n, 'партнёрам: ниши преимуществ из данных (' + PT.benefits.length + '), якоря #benefits #way #calc #form, крючок .grid.g3 для Стеллы', ben);
  t(await p.evaluate(() => [...document.querySelectorAll('.pp-niche h3')].map(h => h.textContent).join('|')) === PT.benefits.map(x => x.title).join('|'), 'партнёрам: названия преимуществ те же, что в data/content.json');
  t(await p.evaluate(() => document.querySelectorAll('.pp-step').length) === PT.steps.length, 'партнёрам: шаги пути партнёра — как в данных (' + PT.steps.length + ')');
  await p.evaluate(() => document.querySelector('.pp-stairs').scrollIntoView({block: 'center'})); await p.waitForTimeout(2200);
  t(await p.evaluate(() => !document.querySelector('.pp-stairs').classList.contains('is-pre') && getComputedStyle(document.querySelector('.pp-tread')).clipPath !== 'inset(100% 0px 0px)'), 'партнёрам: ступени «достроились», когда дошли до экрана');

  /* калькулятор: независимый расчёт по порогам из данных */
  const want = v => { const d = DS.filter(x => v >= x.from).pop(); return {tier: d ? 'Ваша скидка — ' + d.pct + '%' : 'До первой скидки — ' + rub(DS[0].from - v), save: d ? rub(Math.round(v * d.pct / 100)) : '—', on: DS.map(x => d && x === d ? 1 : 0).join('')}; };
  const bad0 = [];
  for (const v of [0, 10000, 40000, 50000, 60000, 100000, 140000, 150000, 290000, 300000, 450000, 500000]) {
    await setRange(p, v); await p.waitForTimeout(650); const r = await read(p), w = want(v);
    if (norm(r.sum) !== rub(v) || norm(r.tier) !== w.tier || norm(r.save) !== w.save || r.on !== w.on) bad0.push({v, r, w});
  }
  t(bad0.length === 0, 'калькулятор: на 12 суммах (0 … 500 000) сумма, текст скидки, экономия и подсвеченный порог равны расчёту по data/site.json', bad0.slice(0, 2));
  await setRange(p, 100000); await p.waitForTimeout(600);
  await p.click('[data-pp-bump="1"]'); await p.waitForTimeout(700); let r = await read(p);
  t(r.val === 110000 && norm(r.sum) === rub(110000), 'калькулятор: «+» прибавляет шаг (10 000 ₽)', r);
  await p.click('[data-pp-bump="-1"]'); await p.click('[data-pp-bump="-1"]'); await p.waitForTimeout(700); r = await read(p);
  t(r.val === 90000, 'калькулятор: «−» убавляет шаг', r);
  await p.click('[data-pp-set="' + DS[1].from + '"]'); await p.waitForTimeout(800); r = await read(p);
  t(r.val === DS[1].from && r.on === '010' && r.reached === '110' && r.pressed.join() === String(DS[1].from) && /скидка 10%/.test(r.vt || ''), 'калькулятор: быстрый выбор порога — подсвечен текущий порог, достигнутые отмечены, кнопка нажата, значение для скринридера', r);
  await p.focus('#calc-range'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); r = await read(p);
  t(r.val === DS[1].from + 20000, 'калькулятор: стрелки на клавиатуре двигают ползунок по шагу', r);
  await p.keyboard.press('End'); await p.waitForTimeout(500); r = await read(p);
  t(r.val === 500000 && r.on === '001' && r.reached === '111', 'калькулятор: End — максимум, подсвечена верхняя ступень', r);
  const lad = await p.evaluate(() => ({msg: (document.querySelector('[data-lad-msg]') || {}).textContent, cta: (document.querySelector('[data-lad-cta]') || {}).textContent, bars: document.querySelectorAll('.sx-lad-bars li').length, inSlab: !!document.querySelector('.pp-slab .sx-lad')}));
  t(lad.inSlab && lad.bars === DS.length && /Верхняя ступень/.test(lad.msg || '') && /Запросить условия на 500 000/.test(norm(lad.cta)), 'партнёрам: «ориентир» из js/sales-pages.js на плите — фраза и кнопка «Запросить условия на …»', lad);
  await setRange(p, 150000); await p.waitForTimeout(500);
  await p.click('[data-lad-cta]'); await p.waitForSelector('#modal.open form[data-form="partner"]', {timeout: 5000}).catch(() => {});
  t(await p.evaluate(() => /150/.test((document.querySelector('#modal .ctx') || {}).textContent || '') && /Ориентир первой закупки/.test((document.querySelector('#modal form [name=msg]') || {}).value || '')), 'партнёрам: «Запросить условия» открывает заявку с суммой и скидкой в комментарии');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  /* заявка */
  await p.evaluate(() => document.getElementById('form').scrollIntoView({block: 'start'})); await p.waitForTimeout(900);
  await p.click('#form form[data-form="partner"] button[type=submit]'); await p.waitForTimeout(500);
  t(await p.evaluate(() => document.querySelectorAll('#form .fld.bad').length >= 4), 'заявка: пустая форма подсвечивает обязательные поля');
  const f = '#form form[data-form="partner"] ';
  await p.fill(f + '[name=name]', 'Анна Тестова'); await p.fill(f + '[name=phone]', '+7 916 123-45-67'); await p.fill(f + '[name=email]', 'test@example.com'); await p.fill(f + '[name=city]', 'Москва'); await p.fill(f + '[name=msg]', 'Проверка страницы');
  await p.check(f + '[name=agree]'); const n0 = leads.length; await p.click(f + 'button[type=submit]'); await p.waitForTimeout(1800);
  t(leads.length === n0 + 1 && leads[leads.length - 1].type === 'partner' && /Москва/.test(JSON.stringify(leads[leads.length - 1])), 'заявка: верная форма уходит на /api/lead с типом partner', leads[leads.length - 1] && Object.keys(leads[leads.length - 1]));
  t(await p.evaluate(() => !!document.querySelector('#form .ok .tick') && document.querySelector('#form form').hidden === true), 'заявка: после отправки на «бумаге» — подтверждение вместо формы');
  t(await noOverflow(p), 'партнёрам: нет горизонтальной прокрутки (1440)'); t(p._errs.length === 0, 'партнёрам: нет ошибок JS и консоли (1440)', p._errs.slice(0, 3));
  await p.context().close();
  for (const [w, h, touch] of [[768, 1024, true], [390, 844, true]]) {
    p = await open('partners.html', w, h, touch);
    t(await noOverflow(p), 'партнёрам: нет горизонтальной прокрутки (' + w + ')');
    t(await p.evaluate(() => { const r = document.getElementById('calc-range').getBoundingClientRect(), s = document.querySelector('.pp-slab').getBoundingClientRect(); return r.width > 200 && r.right <= s.right + 1 && [...document.querySelectorAll('.pp-bump,.pp-pre')].every(x => x.getBoundingClientRect().height >= 40); }), 'партнёрам (' + w + '): ползунок помещается в плиту, кнопки не меньше 40 px');
    t(p._errs.length === 0, 'партнёрам: нет ошибок (' + w + ')', p._errs.slice(0, 3)); await p.context().close();
  }

  await b.close(); srv.close();
  console.log('Партнёрам: проверено ' + (ok + bad.length) + ', успешно ' + ok + (bad.length ? ', ОШИБОК ' + bad.length : ''));
  bad.forEach(x => console.log('  ✗ ' + x)); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('Сбой проверки:', e); process.exit(2); });
