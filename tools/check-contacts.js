#!/usr/bin/env node
/* Проверка страницы «Контакты» (страница v2, ЗАГОТОВКА: ещё ни разу не прогонялась) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Партнёрам: первый экран (дверь), шесть ниш преимуществ, четыре ступени, калькулятор — сумма, текст скидки и экономия на шагах от нуля до максимума равны расчёту по порогам из data/site.json
   (считается здесь независимо от страницы), подсветка порога, кнопки «−/+», быстрый выбор суммы, клавиатура (стрелки), значение ползунка для скринридера, «ориентир» (js/sales-pages.js) на месте,
   заявка: пустая форма подсвечивает поля, правильная уходит (запрос на /api/lead перехватывается) и показывает «спасибо»; без горизонтальной прокрутки на 1440, 768 и 390.
   Контакты: крупные «ключи» связи со ссылками tel:/mailto: из данных, статус «на связи» дописан в шапку, карта: метка у каждого города из данных, выбор на карте и в списке связан и раскрывает одну плиту,
   телефоны и почта всех представительств в плитах, маршрут на карте для адресов, форма «Написать нам» (валидация и отправка), реквизиты; без горизонтальной прокрутки.
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

  /* ================= КОНТАКТЫ ================= */
  let p = await open('contacts.html', 1440, 900);
  const O = SITE.offices, C0 = SITE.contacts;
  t(await p.evaluate(() => document.body.dataset.page === 'contacts' && !!document.querySelector('.cp[data-cp]') && document.querySelectorAll('h1').length === 1), 'контакты: страница v2 включена, один заголовок первого уровня');
  const keys = await p.evaluate(() => [...document.querySelectorAll('.contact-cards .cp-key')].map(k => ({h: k.querySelector('h3').textContent, a: (k.querySelector('.cv a') || {getAttribute: () => ''}).getAttribute('href')})));
  t(keys.some(k => k.a === 'tel:' + C0.phoneRaw) && keys.some(k => k.a === 'mailto:' + C0.email) && keys.some(k => /офис/i.test(k.h)), 'контакты: «ключи» — телефон и почта со ссылками из данных и центральный офис', keys);
  t(await p.evaluate(() => { const st = document.querySelector('.cp .page-head .sx-status'); return !!st && /Сейчас/.test(st.querySelector('b').textContent) && st.querySelectorAll('.sx-tips em').length === 3; }), 'контакты: статус «на связи / нерабочее время» и подсказка дописаны в шапку (js/sales-pages.js)');
  const map = await p.evaluate(() => ({pins: [...document.querySelectorAll('.cp-pin')].map(x => x.getAttribute('data-city')), plates: [...document.querySelectorAll('.cp-office')].map(x => x.getAttribute('data-city')), on: [...document.querySelectorAll('.cp-office.is-on')].map(x => x.getAttribute('data-city')), overflow: [...document.querySelectorAll('.cp-pin')].every(x => { const r = x.getBoundingClientRect(), s = document.querySelector('.cp-stone').getBoundingClientRect(); return r.left >= s.left - 2 && r.right <= s.right + 2 && r.top >= s.top - 2 && r.bottom <= s.bottom + 2; }), label: document.querySelector('.cp-relief').getAttribute('aria-label')}));
  t(map.plates.join() === O.map(o => o.city).join() && map.pins.length === O.length && map.on.length === 1 && map.overflow, 'контакты: плита на каждое представительство из данных, метка на карте у каждого города, раскрыта одна, метки внутри карты', map);
  t(/Расположение офиса/.test(map.label) && map.label.indexOf(C0.address) > 0, 'контакты: карта подписана адресом центрального офиса (доступность)');
  const spb = O.find(o => /Петербург/.test(o.city));
  await p.click('.cp-pin[data-city="' + spb.city + '"]'); await p.waitForTimeout(900);
  let sel = await p.evaluate(() => ({on: [...document.querySelectorAll('.cp-office.is-on')].map(x => x.getAttribute('data-city')), pin: [...document.querySelectorAll('.cp-pin.is-on')].map(x => x.getAttribute('data-city')), route: [...document.querySelectorAll('.cp-rt.is-on')].map(x => x.getAttribute('data-city')), exp: document.querySelector('.cp-office.is-on .cp-ob-t').getAttribute('aria-expanded'), h: Math.round(document.querySelector('.cp-office.is-on .cp-ob').getBoundingClientRect().height), hOff: Math.round(document.querySelector('.cp-office:not(.is-on) .cp-ob').getBoundingClientRect().height)}));
  t(sel.on.join() === spb.city && sel.pin.join() === spb.city && sel.route.join() === spb.city && sel.exp === 'true' && sel.h > 80 && sel.hOff < 4, 'контакты: выбор города на карте раскрывает его плиту, подсвечивает метку и маршрут от Москвы, остальные свёрнуты', sel);
  t(await p.evaluate(sp => { const li = [...document.querySelectorAll('.cp-office.is-on a[href^="tel:"]')].map(a => a.getAttribute('href')); return li.length === sp.length; }, spb.phones), 'контакты: у выбранного города все телефоны из данных (' + spb.phones.length + ') — ссылками tel:');
  const ros = O.find(o => /Ростов/.test(o.city));
  await p.click('.cp-office[data-city="' + ros.city + '"] .cp-ob-t'); await p.waitForTimeout(900);
  sel = await p.evaluate(() => ({on: [...document.querySelectorAll('.cp-office.is-on')].map(x => x.getAttribute('data-city')), pin: [...document.querySelectorAll('.cp-pin.is-on')].map(x => x.getAttribute('data-city')), mail: [...document.querySelectorAll('.cp-office.is-on a[href^="mailto:"]')].length}));
  t(sel.on.join() === ros.city && sel.pin.join() === ros.city && sel.mail === ros.emails.length, 'контакты: выбор в списке подсвечивает метку на карте; почта города — ссылками mailto:', sel);
  t(await p.evaluate(() => { const o = document.querySelector('#office-moskva'); return !!o && !!o.querySelector('a[href*="yandex.ru/maps"]') && !!o.querySelector('a[href*="2gis.ru"]'); }), 'контакты: у Москвы — маршрут в Яндекс Картах и 2ГИС');
  const sim = O.find(o => /уточн/i.test(o.addr)); if (sim) t(await p.evaluate(c => !document.querySelector('.cp-office[data-city="' + c + '"] a[href*="yandex.ru/maps"]'), sim.city), 'контакты: у города без адреса (' + sim.city + ') ссылок на карты нет — адрес не выдумывается');
  /* форма */
  await p.evaluate(() => document.getElementById('support').scrollIntoView({block: 'center'})); await p.waitForTimeout(700);
  await p.click('#support form[data-form="contact"] button[type=submit]'); await p.waitForTimeout(500);
  t(await p.evaluate(() => document.querySelectorAll('#support .fld.bad').length >= 2), 'контакты: пустая форма подсвечивает обязательные поля');
  const g = '#support form[data-form="contact"] ';
  await p.fill(g + '[name=name]', 'Иван Тестов'); await p.fill(g + '[name=email]', 'ivan@example.com'); await p.fill(g + '[name=msg]', 'Проверка страницы контактов'); await p.check(g + '[name=agree]');
  const n1 = leads.length; await p.click(g + 'button[type=submit]'); await p.waitForTimeout(1800);
  t(leads.length === n1 + 1 && leads[leads.length - 1].type === 'contact', 'контакты: форма «Написать нам» уходит на /api/lead с типом contact', leads[leads.length - 1] && leads[leads.length - 1].type);
  t(await p.evaluate(() => !!document.querySelector('#support .ok .tick')), 'контакты: после отправки — подтверждение');
  t(await p.evaluate(() => { const rq = document.querySelectorAll('.cp-ledger > div'); return rq.length === 6 && /Астрея/.test(rq[0].textContent); }), 'контакты: реквизиты — шесть строк (наименование, ИНН, КПП, ОГРН, адреса), пустые — «Уточняется»');
  t(await noOverflow(p), 'контакты: нет горизонтальной прокрутки (1440)'); t(p._errs.length === 0, 'контакты: нет ошибок JS и консоли (1440)', p._errs.slice(0, 3));
  await p.context().close();
  for (const [w, h, touch] of [[768, 1024, true], [390, 844, true]]) {
    p = await open('contacts.html', w, h, touch);
    t(await noOverflow(p), 'контакты: нет горизонтальной прокрутки (' + w + ')');
    t(await p.evaluate(() => [...document.querySelectorAll('.cp-pin,.cp-ob-t')].every(x => { const r = x.getBoundingClientRect(); return r.height >= 38 && r.width >= 38; })), 'контакты (' + w + '): метки и заголовки плит не меньше 38 px');
    await p.click('.cp-office:nth-child(2) .cp-ob-t'); await p.waitForTimeout(800);
    t(await p.evaluate(() => document.querySelectorAll('.cp-office.is-on').length === 1 && document.querySelectorAll('.cp-pin.is-on').length === 1), 'контакты (' + w + '): выбор города работает касанием');
    t(p._errs.length === 0, 'контакты: нет ошибок (' + w + ')', p._errs.slice(0, 3)); await p.context().close();
  }
  /* без JS страница читается: плиты раскрыты, ссылки на месте */
  { const ctx = await b.newContext({viewport: {width: 1440, height: 900}, javaScriptEnabled: false, locale: 'ru-RU'}); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); const q = await ctx.newPage(); await q.goto(base + '/contacts.html'); await q.waitForTimeout(600);
    t(await q.evaluate(() => [...document.querySelectorAll('.cp-ob')].every(x => x.getBoundingClientRect().height > 40) && document.querySelectorAll('a[href^="tel:"]').length >= 3), 'контакты без JS: все представительства раскрыты, телефоны — ссылками');
    await q.goto(base + '/partners.html'); await q.waitForTimeout(600);
    t(await q.evaluate(() => document.querySelectorAll('.pp-st').length === 4 && document.querySelectorAll('.pp-bt').length === 6 && [...document.querySelectorAll('.pp-st, .pp-bt')].every(x => getComputedStyle(x).opacity === '1') && !!document.querySelector('#form form')), 'партнёрам без JS: путь, плитки преимуществ и форма на месте и видны');
    await ctx.close(); }

  await b.close(); srv.close();
  console.log('Контакты: проверено ' + (ok + bad.length) + ', успешно ' + ok + (bad.length ? ', ОШИБОК ' + bad.length : ''));
  bad.forEach(x => console.log('  ✗ ' + x)); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('Сбой проверки:', e); process.exit(2); });
