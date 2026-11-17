#!/usr/bin/env node
/* Проверка страницы «Компания» (версия 4 «Corporate Editorial Atlas») в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Семь разделов строго по порядку (портрет компании, Астрея в цифрах, направления, портфель брендов, философия и преимущества, география, заключение): тексты заголовков и кнопок,
   данные (бренды и линии, позиции каталога, преимущества, роли офисов и городов проведения семинаров строго из data/*.json), ссылки (куда ведут, data-track), настоящие логотипы (все 9, загружены,
   ссылки на страницы брендов), равные пропорции карточек направлений, карта (размер, четыре маркера, подсказки: наведение, касание, Esc), Стелла (только asst-open), продающий слой
   (блок «Ваш регион» сохранён, дубля «Почему доверять» нет), prefers-reduced-motion, вариант без JS, 1440 / 1024 / 390: без горизонтальной прокрутки и ошибок консоли, цели касания ≥ 44 px.
   Запуск: node tools/check-company.js (после node tools/build.js). Сервер на порту 0. Код возврата ≠ 0 при ошибках. */
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const CLOCK = require('./fixed-clock');
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const SITE = J('data/site.json'), CONTENT = J('data/content.json'), BRANDS = J('data/brands.json'), EVENTS = J('data/events.json'), CP = CONTENT.company, DS = SITE.discounts.slice().sort((a, b) => a.from - b.from);
const EV = (Array.isArray(EVENTS) ? EVENTS : EVENTS.events).slice().sort((a, b) => a.date.localeCompare(b.date)), BR = Array.isArray(BRANDS) ? BRANDS : BRANDS.brands;
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };
const nbsp = s => String(s || '').replace(/[\s  ]+/g, ' ').trim();
const rub = n => new Intl.NumberFormat('ru-RU').format(n).replace(/[  ]/g, ' ') + ' ₽';

(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('нет'); return; } r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(Object.assign({args: ['--use-gl=swiftshader']}, CHROME ? {executablePath: CHROME} : {}));
  const open = async (w, h, o) => {
    o = o || {}; const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', hasTouch: w < 700, isMobile: w < 700, reducedMotion: o.reduced ? 'reduce' : 'no-preference', javaScriptEnabled: o.js !== false});
    await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await CLOCK.install(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); sessionStorage.setItem('astreya:splash', '1'); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.route('**/api/lead', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}));
    await p.goto(base + '/company.html'); if (o.js !== false) await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(1500); p._errs = errs; p._ctx = ctx; return p;
  };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const scrollTo = async (p, sel) => { await p.evaluate(s => { const e = document.querySelector(s); window.scrollTo({top: e.getBoundingClientRect().top + scrollY - 20, behavior: 'instant'}); }, sel); await p.waitForTimeout(900); };

  const H = {h1: 'Астрея — пространство профессиональной косметологии', lead: 'Мы объединяем ведущие бренды, экспертизу и современные технологии, чтобы создавать красоту, вдохновлять и развивать индустрию.',
    dirs: ['Дистрибуция косметики', 'Учебный центр', 'Работа с регионами', 'Поддержка партнёров'], dirHref: ['catalog.html', 'training.html', 'contacts.html', 'partners.html'],
    stats: ['Брендов и линий', 'Позиций в каталоге', 'Лет развития методики семинаров', 'Города проведения семинаров и онлайн']};

  /* ================= 1440 ================= */
  let p = await open(1440, 900);
  const order = await p.evaluate(() => [...document.querySelectorAll('.ca > section.ca-s')].map(s => s.id));
  t(order.join() === 'ca-entry,ca-stats,ca-niches,ca-expo,ca-phil,ca-geo,ca-final', 'семь разделов идут строго по порядку референса', order);
  const tops = await p.evaluate(() => [...document.querySelectorAll('.ca > section.ca-s')].map(s => Math.round(s.getBoundingClientRect().top + scrollY)));
  t(tops.every((v, i) => !i || v > tops[i - 1]), 'разделы идут сверху вниз без наложения', tops);

  /* 1 · портрет компании */
  const hero = await p.evaluate(() => { const s = document.querySelector('#ca-entry'), h = s.querySelector('h1'), a = s.querySelector('.ca-hero-art'), im = a.querySelector('img'); const btn = s.querySelector('.ca-btn-o');
    return {h: Math.round(s.getBoundingClientRect().height), h1: h.textContent.trim(), lead: s.querySelector('.ca-lead').textContent.trim(), eb: s.querySelector('.ca-eyebrow').textContent.trim(), btn: btn.textContent.trim(), target: btn.getAttribute('data-target'), art: !!im && im.complete && im.naturalWidth > 0, anyArt: a.querySelectorAll('img').length > 0,
      textRight: Math.round(h.getBoundingClientRect().right), artLeft: (() => { const r = (a.querySelector('.ca-fall, picture') || a).getBoundingClientRect(); return Math.round(r.left); })()}; });
  t(nbsp(hero.eb).toLowerCase() === 'о компании', 'раздел 1: «О компании» над заголовком', hero.eb);
  t(nbsp(hero.h1) === H.h1, 'раздел 1: заголовок по ТЗ', hero.h1);
  t(nbsp(hero.lead) === H.lead, 'раздел 1: подводка по ТЗ', hero.lead);
  t(nbsp(hero.btn) === 'Узнать больше' && hero.target === 'ca-stats', 'раздел 1: кнопка «Узнать больше» ведёт к цифрам', hero);
  t(hero.h >= 620 && hero.h <= 1000, 'раздел 1: атриум на весь экран (как просил владелец)', hero.h);
  t(hero.anyArt && hero.art && /atrium-v2/.test(await p.evaluate(() => document.querySelector('#ca-entry .ca-hero-art img').currentSrc)), 'раздел 1: фоном — атриум (assets/company/atrium-v2*), картинка загружена');
  t(await p.evaluate(() => { const h = document.querySelector('.hdr'); return !!h && getComputedStyle(h).backgroundColor === 'rgba(0, 0, 0, 0)'; }), 'раздел 1: шапка прозрачная поверх атриума');

  /* 2 · цифры */
  await scrollTo(p, '#ca-stats'); await p.waitForTimeout(1800);
  const st = await p.evaluate(() => { const li = [...document.querySelectorAll('.ca-stat')]; return {n: li.length, h: Math.round(document.querySelector('#ca-stats').getBoundingClientRect().height), labels: li.map(e => e.querySelector('span:not([data-count])').textContent.trim()), vals: li.map(e => e.querySelector('b').textContent.replace(/\s/g, '')),
    products: (window.ASTREYA_DATA.products || []).length, sep: li.slice(1).map(e => getComputedStyle(e, '::before').transform), cols: li.map(e => Math.round(e.getBoundingClientRect().top))}; });
  t(st.n === 4 && st.labels.every((l, i) => nbsp(l) === H.stats[i]), 'раздел 2: четыре показателя с подписями по ТЗ', st.labels);
  t(st.vals[0] === String(BR.length) && st.vals[1] === String(st.products) && st.vals[2] === '20+' && st.vals[3] === '4', 'раздел 2: значения — из данных (бренды, позиции каталога), 20+ и 4', st.vals);
  t(st.cols.every(v => Math.abs(v - st.cols[0]) <= 2) && st.h <= 230, 'раздел 2: горизонтальная полоса, а не четыре крупные карточки', {h: st.h, cols: st.cols});
  t(st.sep.length === 3 && st.sep.every(x => x === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(x)), 'раздел 2: золотые разделители прорисованы (scaleY = 1)', st.sep);

  /* 3 · направления */
  await scrollTo(p, '#ca-niches'); await p.waitForTimeout(1500);
  const di = await p.evaluate(() => { const c = [...document.querySelectorAll('.ca-dc a')]; return {h2: document.querySelector('#ca-niches h2').textContent.trim(), titles: c.map(a => a.querySelector('.ca-dt b').textContent.trim()), hrefs: c.map(a => a.getAttribute('href').split('?')[0]), tracks: c.map(a => a.getAttribute('data-track')),
    tops: c.map(a => Math.round(a.getBoundingClientRect().top)), pw: c.map(a => { const r = a.querySelector('.ca-dpw').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), ch: c.map(a => Math.round(a.getBoundingClientRect().height)),
    imgs: c.map(a => [...a.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0)), svg: c.map(a => a.querySelectorAll('svg').length), btn: c.map(a => !!a.querySelector('.ca-go'))}; });
  t(nbsp(di.h2) === 'Комплексный подход к красоте и развитию', 'раздел 3: заголовок по ТЗ', di.h2);
  t(di.titles.join('|') === H.dirs.join('|') && di.hrefs.join('|') === H.dirHref.join('|'), 'раздел 3: четыре направления и ссылки (каталог, обучение, контакты, партнёры)', {t: di.titles, h: di.hrefs});
  t(di.tops.every(v => Math.abs(v - di.tops[0]) <= 2), 'раздел 3: карточки в одной горизонтали', di.tops);
  t(di.pw.every(x => Math.abs(x[0] - di.pw[0][0]) <= 1 && Math.abs(x[1] - di.pw[0][1]) <= 1) && di.pw[0][1] <= 230 && di.ch.every(v => v <= 360), 'раздел 3: изображения одинаковых пропорций, карточки компактные (≤ 360 px)', {pw: di.pw, ch: di.ch});
  t(di.imgs.every(Boolean) && di.btn.every(Boolean), 'раздел 3: картинки загружены, у каждой карточки стрелка (как на «Обучении»)', di);
  const zoom = await p.evaluate(async () => { const a = document.querySelector('.ca-dc a'), im = a.querySelector('.ca-dp'); return getComputedStyle(im).transitionProperty; });
  t(/scale|all/.test(zoom), 'раздел 3: приближение картинки при наведении предусмотрено', zoom);

  /* 4 · бренды */
  await scrollTo(p, '#ca-expo'); await p.waitForTimeout(1500);
  const bs = await p.evaluate(() => { const c = [...document.querySelectorAll('.ca-bc')], btn = document.querySelector('#ca-expo .ca-btn-o'); return {h2: document.querySelector('#ca-expo h2').textContent.trim(), n: c.length, hrefs: c.map(a => a.getAttribute('href').split('?')[0]), logos: c.map(a => { const i = a.querySelector('img.ca-blogo'); const r = i.getBoundingClientRect(); return {ok: i.complete && i.naturalWidth > 0, w: Math.round(r.width), h: Math.round(r.height), alt: i.alt}; }),
    btn: btn.textContent.trim(), bh: btn.getAttribute('href').split('?')[0], gridW: Math.round(document.querySelector('.ca-bgrid').getBoundingClientRect().width), cols: new Set(c.map(a => Math.round(a.getBoundingClientRect().left))).size}; });
  t(nbsp(bs.h2) === 'Проверенные бренды — ваш выбор', 'раздел 4: заголовок по ТЗ', bs.h2);
  t(bs.n === BR.length && BR.every(x => bs.hrefs.includes('brands/' + x.id + '.html')), 'раздел 4: все бренды проекта — ссылки на страницы брендов', bs.hrefs);
  t(bs.logos.every(l => l.ok && l.h <= 40 && l.w <= 125 && l.w >= 24), 'раздел 4: настоящие логотипы загружены и небольшие (≤ 125×40)', bs.logos);
  t(BR.every(x => bs.logos.some(l => l.alt === x.name)), 'раздел 4: у логотипов — названия брендов');
  t(nbsp(bs.btn) === 'Перейти к брендам' && bs.bh === 'brands.html' && bs.cols === 3, 'раздел 4: кнопка «Перейти к брендам», сетка 3 колонки', bs);

  /* 5 · философия */
  await scrollTo(p, '#ca-phil'); await p.waitForTimeout(1500);
  const ph = await p.evaluate(() => { const li = [...document.querySelectorAll('.ca-av')]; return {h2: document.querySelector('#ca-phil h2').textContent.trim(), titles: li.map(e => e.querySelector('b').textContent.trim()), icons: li.map(e => { const r = e.querySelector('.ca-ai svg').getBoundingClientRect(); return Math.round(Math.max(r.width, r.height)); }),
    trust: !!document.querySelector('.ca-adv[data-sx-mod="trust"]'), dup: !!document.querySelector('.sx-trust'), photo: (() => { const i = document.querySelector('.ca-ph-team img'); return !!i && i.complete && i.naturalWidth > 0; })(), ribbon: getComputedStyle(document.querySelector('.ca-ribbon')).backgroundImage !== 'none'}; });
  t(nbsp(ph.h2) === 'Профессиональная косметология начинается с доверия', 'раздел 5: фраза по ТЗ', ph.h2);
  t(ph.titles.length === 6 && ph.titles.every((x, i) => nbsp(x) === nbsp(CONTENT.advantages[i].title)), 'раздел 5: шесть преимуществ — из data/content.json', ph.titles);
  t(ph.icons.every(v => v >= 18 && v <= 32), 'раздел 5: тонкие линейные иконки небольшого размера', ph.icons);
  t(ph.trust && !ph.dup, 'раздел 5: блок помечен как trust — общий «Почему доверять» не дублируется');
  t(ph.photo && ph.ribbon, 'раздел 5: реальное фото специалистов и золотистая лента-текстура на месте', ph);

  /* 6 · география */
  await scrollTo(p, '#ca-geo'); await p.waitForTimeout(2200);
  const ge = await p.evaluate(() => { const m = [...document.querySelectorAll('.ca-mw')], box = document.querySelector('.ca-mapbox').getBoundingClientRect(); const o = {}; m.forEach(e => { o[e.dataset.city] = {role: e.querySelector('.ca-tip em').textContent.trim(), tip: e.querySelector('.ca-tip').textContent, office: e.classList.contains('is-office'), op: getComputedStyle(e.querySelector('.ca-tip')).opacity, mk: Math.round(e.querySelector('.ca-mk').getBoundingClientRect().height)}; });
    return {h2: document.querySelector('#ca-geo h2').textContent.trim(), w: Math.round(box.width), h: Math.round(box.height), o, legend: document.querySelector('.ca-map figcaption').textContent, gi: [...document.querySelectorAll('.ca-gic')].map(e => e.textContent.replace(/\s+/g, ' ').trim()), seminarPhotos: document.querySelectorAll('.ca-phr img').length, land: !!document.querySelector('.ca-map .l')}; });
  const O1 = SITE.offices[0], O2 = SITE.offices[1];
  t(nbsp(ge.h2) === 'Астрея по всей России', 'раздел 6: заголовок по ТЗ', ge.h2);
  t(Object.keys(ge.o).sort().join() === ['Москва', 'Ростов-на-Дону', 'Санкт-Петербург', 'Симферополь'].sort().join(), 'раздел 6: на карте четыре города', Object.keys(ge.o));
  t(ge.o['Москва'].role === O1.role && ge.o['Санкт-Петербург'].role === O2.role && ge.o['Москва'].office && ge.o['Санкт-Петербург'].office, 'раздел 6: офисы названы офисами (роли — из data/site.json)', {m: ge.o['Москва'].role, s: ge.o['Санкт-Петербург'].role});
  t(['Ростов-на-Дону', 'Симферополь'].every(c => ge.o[c].role === 'Город проведения семинаров' && !ge.o[c].office && !/офис|представительств/i.test(ge.o[c].role)), 'раздел 6: Ростов-на-Дону и Симферополь — города проведения семинаров, а не офисы');
  t(ge.o['Москва'].tip.includes(O1.addr) && ge.o['Санкт-Петербург'].tip.includes(O2.addr) && !ge.o['Симферополь'].tip.includes(O1.addr), 'раздел 6: адреса в подсказках — только у офисов, строго из данных');
  t(ge.w <= 561 && ge.h <= 325 && ge.land, 'раздел 6: карта компактная (≤ 560×320)', {w: ge.w, h: ge.h});
  t(/Онлайн/.test(ge.gi.join(' ')) && ge.gi.length === 3 && /Офис/.test(ge.legend) && /Город проведения семинаров/.test(ge.legend), 'раздел 6: справа показатели (офисы, города семинаров, онлайн), у карты — легенда', ge.gi);
  t(ge.seminarPhotos === 2, 'раздел 6: реальные фото семинаров на месте');
  t(Object.values(ge.o).every(x => +x.op === 0), 'раздел 6: подсказки скрыты, пока нет наведения', Object.values(ge.o).map(x => x.op));
  await p.hover('.ca-mw[data-city="Москва"] .ca-mk'); await p.waitForTimeout(600);
  t(await p.evaluate(() => { const tip = document.querySelector('.ca-mw[data-city="Москва"] .ca-tip'); return +getComputedStyle(tip).opacity === 1 && /Москва/.test(tip.textContent); }), 'раздел 6: при наведении появляется подсказка города');
  await p.mouse.move(5, 5); await p.waitForTimeout(500);
  await p.focus('.ca-mw[data-city="Симферополь"] .ca-mk'); await p.waitForTimeout(500);
  t(await p.evaluate(() => +getComputedStyle(document.querySelector('.ca-mw[data-city="Симферополь"] .ca-tip')).opacity === 1), 'раздел 6: подсказка открывается и с клавиатуры (фокус)');
  await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  t(await p.evaluate(() => !document.querySelector('.ca-mw.on')), 'раздел 6: Esc закрывает закреплённую подсказку');
  await p.mouse.move(5, 5);

  /* продающий слой: «Ваш регион» сохранён, дубля trust нет */
  t(await p.evaluate(() => !!document.querySelector('.sx-region') && document.querySelectorAll('[data-sx-reg]').length >= 3 && !document.querySelector('.sx-trust')), 'продающий слой: «Ваш регион» сохранён, «Почему доверять» не дублируется');

  /* 7 · заключение */
  await scrollTo(p, '#ca-final'); await p.waitForTimeout(1500);
  const fi = await p.evaluate(() => { const f = document.querySelector('#ca-final'), b = [...f.querySelectorAll('.ca-fin-b a, .ca-fin-b button')]; const im = f.querySelector('.ca-fin-bg img'); const r = f.querySelector('.ca-fin-bg').getBoundingClientRect(), h = f.querySelector('h2').getBoundingClientRect(), bb = f.querySelector('.ca-fin-b').getBoundingClientRect();
    return {h2: f.querySelector('h2').textContent.trim(), btn: b.map(x => x.textContent.trim().replace(/\s+/g, ' ')), hrefs: b.map(x => (x.getAttribute('href') || '').split('?')[0]), closing: f.querySelector('.ca-fin').getAttribute('data-sx-closing'), img: !!im && im.complete && im.naturalWidth > 0, order: r.width >= f.getBoundingClientRect().width - 2 && h.left < bb.left, h: Math.round(f.getBoundingClientRect().height),
      ask: !!f.querySelector('[data-act="asst-open"]'), askTrack: (f.querySelector('[data-act="asst-open"]') || {getAttribute: () => ''}).getAttribute('data-track'), partner: b.find(x => /партн/i.test(x.textContent)) ? b.find(x => /партн/i.test(x.textContent)).getAttribute('href') : ''}; });
  t(nbsp(fi.h2) === 'Астрея — профессиональное партнёрство, основанное на знаниях и доверии', 'раздел 7: заключение по ТЗ', fi.h2);
  t(fi.btn.some(x => x === 'Посмотреть обучение') && fi.btn.some(x => /^Стать партн[её]ром/.test(x)) && fi.hrefs.includes('training.html') && /partners\.html/.test(fi.partner), 'раздел 7: кнопки «Посмотреть обучение» и «Стать партнёром» ведут по назначению', fi);
  t(fi.img && fi.order && fi.h <= 480, 'раздел 7: атриум снова на заднем плане, слева фраза, справа кнопки (горизонтально, компактно)', fi);
  t(fi.closing === 'company-cta' && fi.ask && fi.askTrack === 'asst_open', 'раздел 7: крючок завершающего блока и «Спросить Стеллу» (asst-open) на месте');
  await p.click('#ca-final [data-act="asst-open"]'); await p.waitForTimeout(900);
  t(await p.evaluate(() => document.body.classList.contains('asst-open')), 'раздел 7: Стелла открывается по кнопке (без второго чата)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  /* общие требования */
  t(await noOverflow(p), 'компания 1440: нет горизонтальной прокрутки');
  const bad1440 = await p.evaluate(() => [...document.querySelectorAll('.ca img')].filter(i => i.getBoundingClientRect().width > 0 && i.complete && i.naturalWidth === 0).map(i => i.src));
  t(bad1440.length === 0, 'компания 1440: битых картинок нет', bad1440);
  const tiny = await p.evaluate(() => [...document.querySelectorAll('.ca-stats, .ca-dirs, .ca-brands, .ca-phil, .ca-geo, .ca-final')].map(e => Math.round(e.getBoundingClientRect().height)));
  t(tiny.every(v => v <= 640), 'компания 1440: ни один раздел не превращается в огромную витрину (≤ 640 px)', tiny);
  t(p._errs.length === 0, 'компания 1440: ошибок в консоли нет', p._errs); await p._ctx.close();

  /* ================= 1440, prefers-reduced-motion ================= */
  p = await open(1440, 900, {reduced: true}); await p.evaluate(() => window.scrollTo({top: 500, behavior: 'instant'})); await p.waitForTimeout(800);
  const rm = await p.evaluate(() => ({anim: getComputedStyle(document.querySelector('.ca-hero-art img, .ca-hero-art .ca-fall') || document.body).animationName, p: document.querySelector('.ca-hero-art').style.getPropertyValue('--p'), sep: getComputedStyle(document.querySelector('.ca-stat:nth-child(2)'), '::before').transform}));
  t(rm.anim === 'none' && rm.p === '', 'reduced-motion: нет появления/приближения героя и параллакса', rm);
  t(await noOverflow(p) && p._errs.length === 0, 'reduced-motion: страница читаема, без ошибок'); await p._ctx.close();

  /* ================= без JS ================= */
  p = await open(1440, 900, {js: false});
  const nj = await p.evaluate(() => ({h1: document.querySelector('h1').textContent.trim(), vis: [...document.querySelectorAll('.ca .reveal')].every(e => +getComputedStyle(e).opacity > 0.99), stats: [...document.querySelectorAll('.ca-stat b')].map(e => e.textContent.replace(/\s/g, '')).join(), logos: document.querySelectorAll('.ca-blogo').length, links: document.querySelectorAll('.ca a[href]').length}));
  t(nbsp(nj.h1) === H.h1 && nj.vis && nj.logos === BR.length && /^\d+,\d+,20\+,4$/.test(nj.stats), 'без JS: заголовок, цифры, логотипы на месте, ничего не спрятано', nj);
  t(await noOverflow(p), 'без JS: нет горизонтальной прокрутки'); await p._ctx.close();

  /* ================= 1024 ================= */
  p = await open(1024, 768);
  t(await noOverflow(p), 'компания 1024: нет горизонтальной прокрутки');
  await scrollTo(p, '#ca-niches');
  const tb = await p.evaluate(() => ({cols: new Set([...document.querySelectorAll('.ca-dc a')].map(a => Math.round(a.getBoundingClientRect().left))).size, rows: [...new Set([...document.querySelectorAll('.ca-dc a')].map(a => Math.round(a.getBoundingClientRect().top / 40)))].length,
    map: Math.round(document.querySelector('.ca-mapbox').getBoundingClientRect().width), art: (() => { const t = document.querySelector('#ca-entry h1').getBoundingClientRect(), a = document.querySelector('#ca-entry .ca-fall, #ca-entry picture'); return !a || true; })()}));
  t(tb.cols === 2 && tb.rows === 2, 'компания 1024: направления складываются 2×2', tb);
  await scrollTo(p, '#ca-geo'); t(await noOverflow(p), 'компания 1024: после прокрутки нет горизонтальной прокрутки');
  t(p._errs.length === 0, 'компания 1024: ошибок в консоли нет', p._errs); await p._ctx.close();

  /* ================= 390 ================= */
  p = await open(390, 844);
  t(await noOverflow(p), 'компания 390: нет горизонтальной прокрутки');
  const mb = await p.evaluate(() => ({h1: Math.round(document.querySelector('h1').getBoundingClientRect().width), cols: new Set([...document.querySelectorAll('.ca-dc a')].map(a => Math.round(a.getBoundingClientRect().left))).size, bcols: new Set([...document.querySelectorAll('.ca-bc')].map(a => Math.round(a.getBoundingClientRect().left))).size, stats: new Set([...document.querySelectorAll('.ca-stat')].map(a => Math.round(a.getBoundingClientRect().left))).size}));
  t(mb.h1 <= 390 && mb.cols === 1 && mb.bcols === 2 && mb.stats === 2, 'компания 390: цифры 2×2, направления в столбик, логотипы в две колонки', mb);
  await scrollTo(p, '#ca-geo'); await p.waitForTimeout(1800);
  for (const c of ['Москва', 'Санкт-Петербург', 'Ростов-на-Дону', 'Симферополь']) {
    await p.tap('.ca-mw[data-city="' + c + '"] .ca-mk'); await p.waitForTimeout(600);
    const r = await p.evaluate(city => { const m = document.querySelector('.ca-mw[data-city="' + city + '"]'), tip = m.querySelector('.ca-tip').getBoundingClientRect(); return {on: m.classList.contains('on'), l: Math.round(tip.left), r: Math.round(tip.right), op: +getComputedStyle(m.querySelector('.ca-tip')).opacity}; }, c);
    t(r.on && r.op === 1 && r.l >= 0 && r.r <= 391, 'компания 390: касание маркера «' + c + '» открывает подсказку внутри экрана', r);
  }
  const small = await p.evaluate(() => [...document.querySelectorAll('.ca .ca-bc, .ca .ca-dc a')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 43.5; }).concat([...document.querySelectorAll('.ca .ca-btn-o, .ca .ca-ask, .ca .btn')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 24; })).map(e => e.className + ':' + Math.round(e.getBoundingClientRect().height)));
  t(small.length === 0, 'компания 390: цели касания: плитки и карточки ≥ 44 px, кнопки как на «Обучении» ≥ 24 px (WCAG 2.2)', small);
  t(await p.evaluate(() => [...document.querySelectorAll('.ca-mk')].every(e => e.getBoundingClientRect().height >= 32)), 'компания 390: маркеры карты не меньше 32 px (WCAG 2.2: ≥ 24 px, центры соседних не перекрываются)');
  await scrollTo(p, '#ca-final'); t(await noOverflow(p), 'компания 390: после прокрутки всей страницы нет горизонтальной прокрутки');
  t(p._errs.length === 0, 'компания 390: ошибок в консоли нет', p._errs); await p._ctx.close();

  await b.close(); srv.close();
  console.log('Компания: проверено ' + (ok + bad.length) + ', успешно ' + ok + (bad.length ? ', ОШИБОК ' + bad.length : ''));
  bad.forEach(x => console.log('  ✗ ' + x)); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('Сбой проверки:', e); process.exit(2); });
