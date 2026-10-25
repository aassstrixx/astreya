#!/usr/bin/env node
/* Проверка страницы «Бренды» (архитектурная галерея) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется: первый экран и заголовок; число витрин = число брендов из data/brands.json; у каждой — логотип, рендер ниши и товары, загруженные без ошибок; «О бренде» ведёт на страницу бренда;
   число позиций в каталоге равно числу товаров бренда в data/products.json; число колонок на разной ширине (6 / 4 / 3 / 2 / 1) и отсутствие горизонтальной прокрутки;
   поиск и фильтры по задачам действительно меняют набор витрин; прозрачная шапка над первым экраном; кнопка «Подобрать бренд» открывает Стеллу; ссылки на бренды и их логотипы существуют.
   Запуск: node tools/check-brands.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
const BRANDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brands.json'), 'utf8')), PRODUCTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };

(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const open = async (w, h, hash = '') => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU'}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource.*(api|fonts)/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.goto(base + '/brands.html' + hash); await p.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} }
    await p.waitForTimeout(1200); p._errs = errs; p._ctx = ctx; return p;
  };
  const cols = p => p.evaluate(() => { const c = [...document.querySelectorAll('#br-grid .br-card')].filter(x => !x.hidden); if (!c.length) return 0; const y0 = c[0].offsetTop; return c.filter(x => Math.abs(x.offsetTop - y0) < 4).length; });
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const visible = p => p.evaluate(() => [...document.querySelectorAll('#br-grid .br-card')].filter(x => !x.hidden).map(x => x.dataset.id));

  /* --- десктоп 1672: первый экран, витрины, данные --- */
  let p = await open(1672, 940);
  t(await p.evaluate(() => document.body.dataset.page === 'brands' && !!document.querySelector('[data-brands-gallery] .br-hero')), 'страница брендов: галерея включена');
  t((await p.textContent('.br-hero h1')).trim() === 'Косметические бренды', 'заголовок первого экрана');
  t(/МИР ПРОФЕССИОНАЛЬНОГО УХОДА/i.test(await p.textContent('.br-eyebrow')), 'надпись над заголовком');
  const heroOk = await p.evaluate(() => { const i = document.querySelector('.br-hero-pic img'); return i && i.complete && i.naturalWidth > 1000; });
  t(heroOk, 'рендер первого экрана загружен');
  t(await p.evaluate(() => document.documentElement.classList.contains('br-top')), 'шапка прозрачна над первым экраном (br-top)');
  const hdrBg = await p.evaluate(() => getComputedStyle(document.querySelector('.hdr')).backgroundColor); t(/rgba\(0, 0, 0, 0\)|transparent/.test(hdrBg), 'фон шапки прозрачный', hdrBg);
  t(await cols(p) === 6, 'на 1672 px — шесть витрин в ряд', await cols(p));
  t(await noOverflow(p), 'нет горизонтальной прокрутки (1672)');
  const cards = await p.evaluate(() => [...document.querySelectorAll('#br-grid .br-card')].map(c => ({id: c.dataset.id, href: (c.querySelector('a.stretch') || {}).getAttribute && c.querySelector('a.stretch').getAttribute('href'), n: (c.querySelector('.br-n') || {}).textContent, logo: (() => { const i = c.querySelector('.br-logo'); return i ? (i.tagName === 'IMG' ? i.complete && i.naturalWidth > 0 : true) : false; })(), bg: (() => { const i = c.querySelector('.br-bg'); return !!i && i.complete && i.naturalWidth > 0; })(), pk: c.querySelectorAll('.br-pk img').length, pkOk: [...c.querySelectorAll('.br-pk img')].every(i => i.complete && i.naturalWidth > 0), cn: (c.querySelector('.br-cn') || {}).textContent, tags: c.querySelectorAll('.tasks-line .tag').length})));
  await p.evaluate(() => document.querySelectorAll('#br-grid img[loading="lazy"]').forEach(i => i.loading = 'eager')); await p.waitForTimeout(900);
  const cards2 = await p.evaluate(() => [...document.querySelectorAll('#br-grid .br-card')].map(c => ({id: c.dataset.id, logo: (() => { const i = c.querySelector('.br-logo'); return i ? (i.tagName === 'IMG' ? i.complete && i.naturalWidth > 0 : true) : false; })(), bg: (() => { const i = c.querySelector('.br-bg'); return !!i && i.complete && i.naturalWidth > 0; })(), pkOk: [...c.querySelectorAll('.br-pk img')].every(i => i.complete && i.naturalWidth > 0)})));
  t(cards.length === BRANDS.length, 'число витрин = числу брендов в data/brands.json', [cards.length, BRANDS.length]);
  for (const br of BRANDS) {
    const c = cards.find(x => x.id === br.id), c2 = cards2.find(x => x.id === br.id); if (!c) { t(false, br.id + ': витрина есть'); continue; }
    const n = PRODUCTS.filter(x => x.brand === br.id).length;
    t(parseInt(c.n, 10) === n, br.id + ': число позиций совпадает с data/products.json', [c.n, n]);
    t(c.href && c.href.replace(/^\.\.?\//, '').endsWith('brands/' + br.id + '.html'), br.id + ': «О бренде» ведёт на страницу бренда', c.href);
    t(c2.logo, br.id + ': логотип загружен'); t(c2.bg, br.id + ': рендер ниши загружен'); t(c.pk >= 1 && c2.pkOk, br.id + ': товары на подиумах загружены', c.pk);
    t(br.country ? new RegExp(br.country, 'i').test(c.cn) : !/испан/i.test(c.cn), br.id + ': страна только из данных', c.cn);
    t(fs.existsSync(path.join(ROOT, 'brands', br.id + '.html')), br.id + ': страница бренда собрана');
  }
  const evChips = await p.evaluate(() => [...document.querySelectorAll('#br-grid .br-card')].filter(c => c.querySelector('.sx-bchip')).map(c => ({id: c.dataset.id, txt: c.querySelector('.sx-bchip').textContent.replace(/\s+/g, ' ').trim(), href: c.querySelector('.sx-bchip').getAttribute('href')})));
  const EVENTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8')), evs = Array.isArray(EVENTS) ? EVENTS : EVENTS.events || EVENTS.items || [];
  const today = new Date().toISOString().slice(0, 10);
  for (const ch of evChips) { const has = evs.some(e => e.brand === ch.id && e.date >= today); t(has, ch.id + ': ближайший семинар есть в данных (events.json)', ch.txt); t(/Семинар|Вебинар/i.test(ch.txt), ch.id + ': подпись семинара', ch.txt); }
  t(evs.filter(e => e.date >= today).map(e => e.brand).every(id => !BRANDS.some(x => x.id === id) || evChips.some(c => c.id === id)), 'у каждого бренда с будущим семинаром он показан', evChips.map(c => c.id));
  t(p._errs.length === 0, 'нет ошибок в консоли (1672)', p._errs);

  /* --- поиск и фильтры --- */
  await p.fill('#br-q', 'helio'); await p.waitForTimeout(500); let v = await visible(p); t(v.length === 1 && v[0] === 'heliocare', 'поиск «helio» → Heliocare', v);
  await p.fill('#br-q', 'пигмент'); await p.waitForTimeout(500); v = await visible(p); t(v.length >= 2 && v.length < BRANDS.length, 'поиск по задаче «пигмент» находит бренды по направлению', v);
  await p.fill('#br-q', 'ъъъъ'); await p.waitForTimeout(500); v = await visible(p); t(v.length === 0 && await p.evaluate(() => !document.getElementById('br-empty').hidden), 'пустой результат показывает сообщение', v);
  await p.fill('#br-q', ''); await p.waitForTimeout(500); v = await visible(p); t(v.length === BRANDS.length, 'сброс поиска возвращает все бренды', v.length);
  const taskIds = await p.evaluate(() => [...document.querySelectorAll('#br-tasks [data-act="br-task"]')].map(x => x.dataset.id).filter(x => x !== 'all'));
  t(taskIds.length >= 4, 'фильтры по задачам из данных каталога', taskIds);
  for (const id of taskIds) {
    await p.click('#br-tasks [data-act="br-task"][data-id="' + id + '"]'); await p.waitForTimeout(350);
    const r = await p.evaluate(id2 => [...document.querySelectorAll('#br-grid .br-card')].map(c => ({id: c.dataset.id, hidden: c.hidden, has: c.dataset.tasks.split(' ').includes(id2)})), id);
    t(r.every(x => x.hidden === !x.has) && r.some(x => !x.hidden), 'фильтр «' + id + '» показывает только подходящие бренды', r.filter(x => x.hidden === x.has).map(x => x.id));
  }
  await p.click('#br-tasks [data-act="br-task"][data-id="all"]'); await p.waitForTimeout(350); v = await visible(p); t(v.length === BRANDS.length, '«Все бренды» сбрасывает фильтр', v.length);

  /* --- Стелла и шапка --- */
  const help = await p.$('.br-help'); t(!!help, 'кнопка «Подобрать бренд со Стеллой»');
  if (help) { await help.click(); await p.waitForTimeout(1500); t(await p.evaluate(() => !!(window.ASTREYA && ASTREYA.stella && ASTREYA.stella.state().open) || !!document.querySelector('.asst.open, #asst.open, .asst[data-open="1"]')), 'Стелла открывается по кнопке'); }
  await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(500);
  t(await p.evaluate(() => !document.documentElement.classList.contains('br-top')), 'после прокрутки шапка снова обычная');
  t(await p.evaluate(() => !!document.querySelector('#hdr a.logo') && document.querySelectorAll('#nav a.nl').length >= 5), 'верхняя навигация на месте');
  await p._ctx.close();

  /* --- ширины: колонки и отсутствие горизонтальной прокрутки --- */
  for (const [w, h, want] of [[1920, 1000, 6], [1440, 900, 4], [1280, 800, 4], [1024, 768, 4], [900, 1000, 3], [768, 1024, 3], [600, 900, 2], [390, 844, 1], [360, 740, 1]]) {
    p = await open(w, h); const c = await cols(p); t(c === want, w + ' px: колонок ' + want, c); t(await noOverflow(p), w + ' px: нет горизонтальной прокрутки');
    if (w <= 600) { const r = await p.evaluate(() => { const c = document.querySelector('#br-grid .br-card'), q = c.getBoundingClientRect(), hh = document.querySelector('.br-hero h1').getBoundingClientRect(); return {w: q.width, h1: parseFloat(getComputedStyle(document.querySelector('.br-hero h1')).fontSize), left: hh.left}; }); t(r.w >= 160 && r.h1 >= 30 && r.left >= 12, w + ' px: карточка, заголовок и отступы читаемы', r); }
    t(p._errs.length === 0, w + ' px: нет ошибок в консоли', p._errs); await p._ctx.close();
  }
  /* --- одна колонка на очень узком экране --- */
  p = await open(320, 700); t(await cols(p) === 1, '320 px: одна колонка', await cols(p)); t(await noOverflow(p), '320 px: нет горизонтальной прокрутки'); await p._ctx.close();

  await b.close(); srv.close();
  console.log(bad.length ? `Страница «Бренды»: ✓ ${ok}, ✗ ${bad.length}\n  ✗ ` + bad.join('\n  ✗ ') : `Страница «Бренды»: ✓ ${ok}, ✗ 0`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
