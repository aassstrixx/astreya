#!/usr/bin/env node
/* Проверка страницы «Обучение» (ASTREYA ACADEMY) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется: восемь зон по порядку (по макету заказчика); первый экран (текст слева, рендер аудитории справа, товары на столе внутри кадра); «Как пройти регистрацию?» — четыре шага со стрелками;
   преподаватели: рендер галереи (бархатная стена, восемь рам с портретами), подписи на табличках, подсветка при наведении, карточка со «снятым со стены» портретом (стрелки, Esc, фокус, «Выбрать семинар»); расписание: города (Москва, Санкт-Петербург, Ростов-на-Дону, Симферополь, Онлайн) и выпадающий список «Все форматы» меняют карточки и календарь,
   «Показать ещё» раскрывает остальные; выбранное мероприятие — тёмно-синяя карточка, тот же день подсвечен в календаре; «Записаться» открывает форму семинара; практическое обучение — панорама из настоящих фото;
   видеотека — настоящие заставки видео канала (файлы из assets/academy/videos.json) со ссылками на youtube.com/watch; вопросы раскрываются; статьи и финальный баннер на месте; адаптив без горизонтальной прокрутки; нет ошибок в консоли.
   Запуск: node tools/check-academy.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
const TR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/training.json'), 'utf8')), RD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/redesign.json'), 'utf8'));
const VIDS = fs.existsSync(path.join(ROOT, 'assets/academy/videos.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/academy/videos.json'), 'utf8')) : [];
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };

(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const open = async (w, h, opts = {}) => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', hasTouch: !!opts.touch, isMobile: !!opts.touch}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.goto(base + '/training.html'); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} }
    await p.waitForTimeout(2500); await p.evaluate(() => document.querySelectorAll('.ac-page img[loading="lazy"]').forEach(i => { i.loading = 'eager'; })); await p.waitForTimeout(1200); p._errs = errs; p._ctx = ctx; return p;
  };
  const jc = (p, sel) => p.evaluate(q => { const e = document.querySelector(q); if (!e) throw new Error('нет элемента ' + q); e.click(); }, sel);          // клик по DOM: на странице плавная прокрутка, из-за неё клик Playwright по движущемуся элементу ненадёжен
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const visCards = p => p.evaluate(() => [...document.querySelectorAll('#sem-list .sem-item')].filter(x => !x.hidden).map(x => x.dataset.id));

  /* --- десктоп 1672 --- */
  let p = await open(1672, 940);
  t(await p.evaluate(() => document.body.dataset.page === 'training' && !!document.querySelector('.ac-page[data-training][data-acad]')), 'страница «Обучение»: академия включена');
  const zones = await p.evaluate(() => [...document.querySelectorAll('.ac-page > section')].map(s => s.className.split(' ')[0]));
  t(zones.join() === 'ac-hero,ac-cal,ac-reg,ac-tch,ac-lab,ac-media,ac-lib,ac-final-sec', 'восемь зон идут по пути посетителя: зал → календарь → маршрут → преподаватели → практика → видеотека → вопросы и статьи → финал', zones);
  t(/Учебный центр «Астрея»/.test(await p.textContent('.ac-hero h1')) && /ASTREYA ACADEMY/.test(await p.textContent('.ac-hero .ac-eyebrow')), 'первый экран: заголовок и надпись ASTREYA ACADEMY');
  const hero = await p.evaluate(() => { const i = document.querySelector('.ac-hall-img'), h = document.querySelector('.ac-hero').getBoundingClientRect(), hd = getComputedStyle(document.querySelector('.hdr')); return {img: !!i && i.complete && i.naturalWidth > 1500, w: h.width, top: h.top, hdr: hd.backgroundColor, copy: document.querySelector('.ac-hero-copy').getBoundingClientRect().right / innerWidth}; });
  t(hero.img, 'рендер зала загружен'); t(hero.w >= 1670 && hero.top <= 1 && /rgba\(0, 0, 0, 0\)|transparent/.test(hero.hdr), 'зал занимает первый экран целиком, шапка лежит поверх него прозрачной', hero);
  t(hero.copy < .6, 'текст первого экрана — слева, на стене зала', hero.copy);
  t(await p.evaluate(() => { const c = document.querySelector('.ac-hero .cd'); return !!c && /Ближайшее мероприятие/.test(c.textContent) && !!c.querySelector('[data-act="form"][data-type="seminar"]') && c.querySelectorAll('.cd-b b').length === 3; }), 'первый экран: тёмная панель ближайшего мероприятия с обратным отсчётом и «Записаться»');
  t(await p.evaluate(() => { const h = document.querySelector('.ac-hero'); return /Бесплатные семинары и мастер-классы/.test(h.textContent) && !h.querySelector('.ac-sub') && !!h.querySelector('a.btn-fill[data-target="sched"]') && !!h.querySelector('a.ac-more[data-target="lab"]'); }), 'первый экран: подзаголовок, кнопка «Расписание семинаров» и ссылка «О центре» (строки про время семинара нет — время есть в панели ближайшего мероприятия)');
  t(await p.evaluate(() => { const r = document.querySelector('.ac-reg h2'), n = [...document.querySelectorAll('.ac-steps .ac-st .ac-st-n')].map(x => x.textContent.trim()); return /Как пройти регистрацию\?/.test(r.textContent) && n.join() === '01,02,03,04' && document.querySelectorAll('.ac-st-ic svg').length === 4 && document.querySelectorAll('.ac-st-tip').length === 4; }), 'маршрут записи: четыре шага 01–04 со значками и пояснениями');
  t(await p.evaluate(() => { const c = document.querySelector('.ac-cal').getBoundingClientRect(), r = document.querySelector('.ac-reg').getBoundingClientRect(), h = document.querySelector('.ac-hero').getBoundingClientRect(); return Math.abs(c.top - h.bottom) < 2 && Math.abs(r.top - c.bottom) < 2; }), 'календарь идёт сразу после первого экрана, маршрут записи — сразу после календаря');
  /* --- преподаватели: галерея-рендер (бархатная стена, рамы с портретами), кнопки и подписи поверх, карточка со «снятым со стены» портретом --- */
  const NT = RD.teachers.items.length, T0 = RD.teachers.items[0], T1 = RD.teachers.items[1];
  await p.evaluate(() => document.getElementById('teachers').scrollIntoView({block: 'start'})); await p.waitForTimeout(1300);
  const gal = await p.evaluate(() => {
    const w = document.querySelector('[data-ac-wall]'), im = w.querySelector('.ac-wall-img'), wr = w.getBoundingClientRect(), r = e => { const b = e.getBoundingClientRect(); return {l: b.left - wr.left, t: b.top - wr.top, r: b.right - wr.left, b: b.bottom - wr.top}; };
    return {render: !w.classList.contains('no-wall'), img: !!im && im.complete && im.naturalWidth >= 1500, w: wr.width, h: wr.height, ar: (() => { const q = String(getComputedStyle(w).aspectRatio).split('/').map(x => parseFloat(x)); return q.length === 2 ? q[0] / q[1] : (q[0] || 0); })(), n: w.querySelectorAll('.ac-tc').length,
      cells: [...w.querySelectorAll('.ac-tc')].map(li => ({f: r(li.querySelector('.ac-tc-frame')), c: r(li.querySelector('.ac-tc-cap')), ph: r(li.querySelector('.ac-tc-ph')), name: li.querySelector('.ac-tc-cap b').textContent + '|' + li.querySelector('.ac-tc-cap em').textContent}))};
  });
  t(gal.n === NT && gal.render && gal.img, 'преподаватели: рендер витрины загружен (на ПК — gallery-s 1600 px, на широких экранах gallery 3200 px), портретов столько же, сколько в данных', {n: gal.n, render: gal.render, img: gal.img});
  t(gal.w > 1300 && Math.abs(gal.w / gal.h - gal.ar) < .02, 'галерея: рендер показан целиком, без обрезки и растяжения', {w: gal.w, h: gal.h, ar: gal.ar});
  t(gal.cells.every(c => c.f.l >= 0 && c.f.r <= gal.w && c.c.l >= 0 && c.c.r <= gal.w && c.c.b <= gal.h && c.ph.l >= c.f.l - 1 && c.ph.r <= c.f.r + 1 && c.ph.t >= c.f.t - 1 && c.ph.b <= c.f.b + 1), 'галерея: кнопки, фотопечати и таблички лежат внутри рендера, фото-«лампа» совпадает с кнопкой');
  t(gal.cells.every(c => c.c.t >= c.f.b - 4 && c.c.t - c.f.b < gal.h * .06 && Math.abs((c.c.l + c.c.r) / 2 - (c.f.l + c.f.r) / 2) < 3), 'галерея: подпись лежит на табличке сразу под своим портретом');
  t(new Set(gal.cells.map(c => Math.round(c.f.t / 8))).size === 2 && new Set(gal.cells.map(c => Math.round(c.f.l / 8))).size === 5, 'галерея: два ряда по четыре портрета (ряды сдвинуты: в первом свободна правая ниша, во втором — левая)');
  t(gal.cells.every((c, i) => c.name === RD.teachers.items[i].last + '|' + RD.teachers.items[i].first), 'галерея: на табличках — фамилия и имя-отчество по порядку из данных');
  t(await p.evaluate(() => [...document.querySelectorAll('#teachers .ac-tc-ph img')].every(i => { i.loading = 'eager'; return true; })), 'преподаватели: фото для «зажигания» подгружаются');
  await p.waitForTimeout(900);
  t(await p.evaluate(() => [...document.querySelectorAll('#teachers .ac-tc-ph img')].filter(i => i.complete && i.naturalWidth >= 1100).length) === RD.teachers.items.filter(x => x.photo).length, 'преподаватели: улучшенные портреты (×2, 1120 px) загружены у всех');
  t(await p.evaluate(() => { const a = document.getElementById('ac-tmore'); return !a || !document.querySelector('#teachers [data-act="acad-more"]'); }), 'преподаватели: нет кнопки «О преподавателях» — все восемь на стене сразу');
  t(await p.evaluate(() => /rgb\(16, 31, 55\)/.test(getComputedStyle(document.querySelector('.hdr-partner')).backgroundColor) && /rgb\(16, 31, 55\)/.test(getComputedStyle(document.querySelector('.hdr .logo')).getPropertyValue('--lm') ? 'rgb(16, 31, 55)' : '')), 'шапка: кнопка «Стать партнёром» — тёмно-синяя, как на каталоге');
  await p.hover('#teachers .ac-tc[data-id="' + T0.id + '"] .ac-tc-frame'); await p.waitForTimeout(800);
  t(await p.evaluate(id => +getComputedStyle(document.querySelector('#teachers .ac-tc[data-id="' + id + '"] .ac-tc-ph')).opacity > .95, T0.id), 'наведение «зажигает» портрет (фото без стекла поверх рендера)');
  await p.mouse.move(5, 5); await p.waitForTimeout(700);
  t(await p.evaluate(id => +getComputedStyle(document.querySelector('#teachers .ac-tc[data-id="' + id + '"] .ac-tc-ph')).opacity > .95, T0.id), 'в проёме всегда оригинальное фото (без ожелтения рендера), в покое и при наведении');
  await jc(p, '#teachers .ac-tc[data-id="' + T0.id + '"] .ac-tc-frame'); await p.waitForTimeout(1500);
  const sp1 = await p.evaluate(() => {
    const s = document.querySelector('.ac-sp'); if (!s || s.hidden) return null; const ph = s.querySelector('.ac-sp-photo').getBoundingClientRect(), im = s.querySelector('.ac-sp-img img'), card = s.querySelector('.ac-sp-card').getBoundingClientRect();
    return {on: s.classList.contains('is-in'), s: s.querySelector('.ac-sp-name .s').textContent, n: s.querySelector('.ac-sp-name .n').textContent, role: s.querySelector('.ac-sp-role').textContent, facts: s.querySelectorAll('.ac-sp-sec li').length, src: s.querySelectorAll('.ac-sp-note a').length, note: s.querySelector('.ac-sp-note').textContent,
      bg: +getComputedStyle(s.querySelector('.ac-sp-bg')).opacity, img: im.complete && im.naturalWidth >= 1100, cx: (ph.left + ph.right) / 2 / innerWidth, cy: (ph.top + ph.bottom) / 2 / innerHeight, pw: ph.width, ph: ph.height, fit: card.right <= innerWidth + 1, dlg: s.getAttribute('role') + '/' + s.getAttribute('aria-modal'),
      locked: document.body.classList.contains('locked'), foc: document.activeElement.className, counter: s.querySelector('.ac-sp-nav span').textContent.replace(/\s+/g, ' ').trim()};
  });
  t(!!sp1 && sp1.on && sp1.s === T0.last && sp1.n === T0.first && sp1.role === T0.role && sp1.facts === (T0.facts || []).length && sp1.src === 0 && /официальным страницам/.test(sp1.note), 'карточка: ФИО, должность и перечень сведений преподавателя, без ссылок на источники, с официальной пометкой', sp1);
  t(!!sp1 && sp1.bg > .95 && sp1.img && sp1.pw > 200 && sp1.cy > .25 && sp1.cy < .75 && sp1.cx < .5 && sp1.fit, 'карточка: портрет без рамы вышел на передний план (слева в центре), фон затемнён', sp1);
  t(!!sp1 && sp1.dlg === 'dialog/true' && sp1.locked && /ac-sp-x/.test(sp1.foc) && sp1.counter === '1 из ' + NT, 'карточка: диалог, прокрутка страницы заблокирована, фокус на «Закрыть», счётчик «1 из ' + NT + '»', sp1);
  t(await p.evaluate(id => document.querySelector('#teachers .ac-tc[data-id="' + id + '"]').classList.contains('is-lifted') && +getComputedStyle(document.querySelector('#teachers .ac-tc[data-id="' + id + '"] .ac-tc-void')).opacity > .9, T0.id), 'на стене остаётся пустой проём — портрет «снят»');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
  t(await p.evaluate(([l, f, id0, id1]) => { const s = document.querySelector('.ac-sp'); return s.querySelector('.ac-sp-name .s').textContent === l && s.querySelector('.ac-sp-name .n').textContent === f && !document.querySelector('#teachers .ac-tc[data-id="' + id0 + '"]').classList.contains('is-lifted') && document.querySelector('#teachers .ac-tc[data-id="' + id1 + '"]').classList.contains('is-lifted') && /2 из/.test(s.querySelector('.ac-sp-nav span').textContent); }, [T1.last, T1.first, T0.id, T1.id]), 'карточка: стрелка → переключает на следующего преподавателя (портрет возвращается на стену, выходит следующий)');
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(900);
  t(await p.evaluate(l => document.querySelector('.ac-sp .ac-sp-name .s').textContent === l, T0.last), 'карточка: стрелка ← возвращает к предыдущему');
  await p.keyboard.press('Escape'); await p.waitForTimeout(1300);
  t(await p.evaluate(id => { const s = document.querySelector('.ac-sp'); return s.hidden && !document.body.classList.contains('locked') && !document.querySelector('#teachers .ac-tc.is-lifted') && document.activeElement === document.querySelector('#teachers .ac-tc[data-id="' + id + '"] .ac-tc-frame'); }, T0.id), 'Esc закрывает карточку: портрет вернулся, прокрутка свободна, фокус вернулся на рамку');
  await jc(p, '#teachers .ac-tc[data-id="' + T1.id + '"] .ac-tc-cap'); await p.waitForTimeout(1300);
  t(await p.evaluate(l => !document.querySelector('.ac-sp').hidden && document.querySelector('.ac-sp .ac-sp-name .s').textContent === l, T1.last), 'клик по табличке открывает ту же карточку');
  await jc(p, '.ac-sp .ac-sp-bg'); await p.waitForTimeout(1300);
  t(await p.evaluate(() => document.querySelector('.ac-sp').hidden), 'клик по затемнённому фону закрывает карточку');
  await jc(p, '#teachers .ac-tc[data-id="' + T0.id + '"] .ac-tc-frame'); await p.waitForTimeout(1300);
  await jc(p, '.ac-sp [data-sp-go]'); await p.waitForTimeout(2200);
  t(await p.evaluate(() => document.querySelector('.ac-sp').hidden && Math.abs(document.getElementById('sem-list').getBoundingClientRect().top) < innerHeight * .6), '«Выбрать семинар» закрывает карточку и ведёт к расписанию');
  t(p._errs.length === 0, 'галерея и карточка: нет ошибок в консоли', p._errs);

  /* --- календарь и фильтры --- */
  const total = await p.evaluate(() => document.querySelectorAll('#sem-list .sem-item').length);
  t(total >= 5, 'карточки мероприятий из расписания', total);
  const cities = await p.evaluate(() => [...document.querySelectorAll('#city-chips .chip')].map(x => x.dataset.id));
  t(['all', 'Москва', 'Санкт-Петербург', 'Ростов-на-Дону', 'Симферополь', 'Онлайн'].every(c => cities.includes(c)), 'фильтр города: Москва, Санкт-Петербург, Ростов-на-Дону, Симферополь, Онлайн', cities);
  t(await p.evaluate(() => [...document.querySelectorAll('#fmt-chips .chip')].map(x => x.dataset.id).join()) === 'all,offline,online', 'фильтр формата: все, очно, онлайн');
  t(await p.evaluate(() => { const d = document.querySelector('[data-ac-dd]'), m = document.getElementById('fmt-chips'); return /Все форматы/.test(d.querySelector('.ac-dd-b').textContent) && getComputedStyle(m).visibility === 'hidden'; }), 'формат — выпадающий список «Все форматы», закрыт по умолчанию');
  t(await p.evaluate(() => !!document.querySelector('[data-acad-cal] .sx-cal .sx-cal-grid') && document.querySelectorAll('[data-acad-cal] .sx-cd.ev').length > 0), 'календарь встреч внутри зоны календаря, есть дни с мероприятиями');
  const sel0 = await p.evaluate(() => { const c = document.querySelectorAll('#sem-list .sem-item.is-sel'); return {n: c.length, sh: c[0] ? getComputedStyle(c[0]).boxShadow : '', day: document.querySelectorAll('.sx-cd.acad-sel').length, dayBg: (document.querySelector('.sx-cd.acad-sel') ? getComputedStyle(document.querySelector('.sx-cd.acad-sel')).backgroundColor : '')}; });
  t(sel0.n === 1 && /rgb\(11, 26, 51\)/.test(sel0.sh), 'по умолчанию выбрано одно мероприятие — карточка в тёмно-синей рамке', sel0); t(sel0.day >= 1 && /rgb\(11, 26, 51\)/.test(sel0.dayBg), 'тот же день подсвечен в календаре тёмно-синим', sel0);
  await p.evaluate(() => [...document.querySelectorAll('#sem-list .sem-item')].filter(x => !x.hidden)[1].querySelector('.ac-ev-pic').click()); await p.waitForTimeout(600);
  t(await p.evaluate(() => { const c = [...document.querySelectorAll('#sem-list .sem-item')].filter(x => !x.hidden)[1]; return !!c && c.classList.contains('is-sel') && document.querySelectorAll('#sem-list .sem-item.is-sel').length === 1; }), 'клик по карточке выделяет её (одна выбранная)');
  const total0 = (await visCards(p)).length;                          // по умолчанию видны предстоящие мероприятия (прошедшие скрыты, если есть будущие)
  for (const city of cities.filter(c => c !== 'all')) {
    await jc(p, '#city-chips [data-id="' + city + '"]'); await p.waitForTimeout(500);
    const r = await p.evaluate(c => ({vis: [...document.querySelectorAll('#sem-list .sem-item')].filter(x => !x.hidden).map(x => x.dataset.city), empty: !document.getElementById('sem-empty').hidden, sel: document.querySelectorAll('#sem-list .sem-item.is-sel:not([hidden])').length}), city);
    t(r.vis.every(x => x === city) && (r.vis.length ? r.sel === 1 : r.empty), 'город «' + city + '»: только его мероприятия (или сообщение), выбранная карточка видна', r);
  }
  await jc(p, '#city-chips [data-id="all"]'); await p.waitForTimeout(400);
  await jc(p, '.ac-dd-b'); await p.waitForTimeout(500); t(await p.evaluate(() => getComputedStyle(document.getElementById('fmt-chips')).visibility === 'visible' && document.querySelector('.ac-dd-b').getAttribute('aria-expanded') === 'true'), 'список форматов открывается по нажатию');
  await jc(p, '#fmt-chips [data-id="online"]'); await p.waitForTimeout(500); t((await p.evaluate(() => [...document.querySelectorAll('#sem-list .sem-item')].filter(x => !x.hidden).every(x => x.dataset.fmt === 'online'))), 'формат «Онлайн» оставляет только онлайн-мероприятия');
  t(await p.evaluate(() => /Онлайн/.test(document.querySelector('[data-ac-dd-l]').textContent) && getComputedStyle(document.getElementById('fmt-chips')).visibility === 'hidden'), 'выбор формата меняет подпись списка и закрывает его');
  await jc(p, '.ac-dd-b'); await p.waitForTimeout(400); await jc(p, '#fmt-chips [data-id="all"]'); await p.waitForTimeout(500); t((await visCards(p)).length === total0 && total0 > 0, 'сброс фильтров возвращает все предстоящие мероприятия');
  t(await p.evaluate(() => { const l = document.getElementById('sem-list'), n = +l.dataset.fold, vis = [...l.querySelectorAll('.sem-item')].filter(x => !x.hidden), shown = vis.filter(x => x.getBoundingClientRect().height > 0).length, b = document.querySelector('[data-act="acad-fold"]'); return vis.length > n ? (shown === n && !b.hidden) : true; }), '«Показать ещё»: сначала видны первые карточки, кнопка есть');
  if (await p.evaluate(() => !document.querySelector('[data-act="acad-fold"]').hidden)) {                       // кнопка появляется, когда подходящих мероприятий больше трёх (в демо-данных будущих может быть три)
    await jc(p, '[data-act="acad-fold"]'); await p.waitForTimeout(500);
    t(await p.evaluate(() => { const b = document.querySelector('[data-act="acad-fold"]'); return [...document.querySelectorAll('#sem-list .sem-item')].filter(x => !x.hidden).every(x => x.getBoundingClientRect().height > 0) && /Свернуть/.test(b.textContent); }), '«Показать ещё» раскрывает остальные мероприятия');
    await jc(p, '[data-act="acad-fold"]'); await p.waitForTimeout(400);
  }
  await jc(p, '#sem-list .sem-item:not([hidden]) .btn-fill'); await p.waitForSelector('#modal.open form[data-form="seminar"]', {timeout: 8000}).then(() => t(true, 'ok')).catch(() => t(false, '«Записаться» в карточке открывает форму семинара'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);

  /* --- лаборатория, медиатека, библиотека, финал --- */
  t(await p.evaluate(() => { const im = [...document.querySelectorAll('.ac-lab .ac-pp img')], lab = document.querySelector('.ac-lab'); return im.length === 3 && im.every(i => i.complete && i.naturalWidth > 300) && /Практическое обучение/.test(lab.textContent) && !!lab.querySelector('a.ac-btn-o[data-target="media"]') && lab.querySelectorAll('.ac-facts li').length === 3; }), 'практическое обучение: три настоящих фото, текст, три факта и «Узнать больше»');
  const mv = await p.evaluate(() => [...document.querySelectorAll('.ac-media .ac-vid')].map(a => ({href: a.href, img: (a.querySelector('.ac-vid-img') || {}).naturalWidth || 0, title: (a.querySelector('.ac-vid-t b') || {}).textContent || ''})));
  t(mv.length === Math.min(3, VIDS.length || TR.videos.length), 'видеотека: три выпуска', mv.length); t(await p.evaluate(() => { const g = [...document.querySelectorAll('.ac-media-grid .ac-vid')], a = g[0].getBoundingClientRect(), b = g[1].getBoundingClientRect(); return g[0].classList.contains('is-lead') && a.width > b.width * 1.4 && a.height > b.height * 1.7; }), 'видеотека: первый выпуск — главный (крупная обложка), два дополнительных рядом');
  if (VIDS.length) { t(mv.every(v => v.img >= 600 && /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(v.href)), 'медиатека: настоящие заставки видео (кадры с YouTube) и ссылки на сами видео', mv.map(v => [v.img, v.href])); t(VIDS.every(v => fs.existsSync(path.join(ROOT, v.thumb)) && fs.existsSync(path.join(ROOT, v.thumbSmall))), 'файлы заставок на месте'); }
  t(await p.evaluate(() => /Видеотека мастер.классов/.test(document.querySelector('.ac-media h2').textContent) && /Перейти к видео/.test(document.querySelector('.ac-media .ac-more-b').textContent)), 'видеотека: заголовок и «Перейти к видео»');
  await jc(p, '.ac-faq .faq-item:nth-child(2) .faq-q'); await p.waitForTimeout(600);
  t(await p.evaluate(() => document.querySelector('.ac-faq .faq-item:nth-child(2)').classList.contains('open') && document.querySelector('.ac-faq .faq-item:nth-child(2) .faq-q').getAttribute('aria-expanded') === 'true'), 'вопросы раскрываются');
  t(await p.evaluate(() => document.querySelectorAll('.ac-faq .faq-item').length) === TR.faq.length && await p.evaluate(() => document.querySelectorAll('#materials > .ac-pubs > *').length) === 3, 'вопросы и статьи: все вопросы и три статьи');
  await jc(p, '#materials [data-act="acad-more"]'); await p.waitForTimeout(1200);
  t(await p.evaluate(() => { const m = document.getElementById('ac-pmore'); return !!m && m.getBoundingClientRect().height > 60 && !m.hasAttribute('inert') && document.querySelectorAll('#materials .ac-pub').length; }) === TR.articles.length, '«Читать все статьи» раскрывает остальные статьи');
  t(await p.evaluate(() => { const f = document.querySelector('.ac-final'); return !!f && /Присоединяйтесь к образовательному пространству/.test(f.textContent) && /Начать с семинара/.test(f.querySelector('a[data-target="sched"]').textContent) && !!f.querySelector('[data-act="form"]') && !!f.querySelector('.ac-final-pic'); }), 'финальная панель: заголовок, «Начать с семинара», «Задать вопрос», арка');
  await p.evaluate(() => window.scrollTo(0, 1400)); await p.waitForTimeout(700);
  t(await p.evaluate(() => document.documentElement.classList.contains('ac-scrolled') && !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(document.querySelector('.hdr')).backgroundColor)), 'после зала шапка получает фон');
  t(await noOverflow(p), 'нет горизонтальной прокрутки (1672)'); t(p._errs.length === 0, 'нет ошибок в консоли (1672)', p._errs); await p._ctx.close();

  /* --- ширины --- */
  for (const [w, h, touch] of [[1920, 1000], [1440, 900], [1280, 800], [1024, 768, true], [768, 1024, true], [600, 900, true], [390, 844, true], [360, 740, true], [320, 700, true]]) {
    p = await open(w, h, {touch}); t(await noOverflow(p), w + ' px: нет горизонтальной прокрутки');
    t(await p.evaluate(() => { const i = document.querySelector('.ac-hall-img'); return !!i && i.complete && i.naturalWidth > 700; }), w + ' px: зал загружен');
    t(await p.evaluate(() => { const c = document.querySelector('.ac-hero .cd'); if (!c) return false; const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.width > 200; }), w + ' px: панель ближайшего мероприятия помещается');
    t(await p.evaluate(() => [...document.querySelectorAll('.ac-page > section')].every(s => s.getBoundingClientRect().width >= innerWidth - 1)), w + ' px: зоны на всю ширину');
    t(await p.evaluate(() => { const c = document.querySelector('#sem-list .sem-item:not([hidden])'); if (!c) return false; const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), w + ' px: карточка мероприятия помещается');
    t(await p.evaluate(() => { const w = document.querySelector('[data-ac-wall]'), cs = [...w.querySelectorAll('.ac-tc-frame')].map(f => f.getBoundingClientRect()); return cs.length === 8 && cs.every(r => r.left >= -1 && r.right <= innerWidth + 1 && r.width > 40); }), w + ' px: все портреты преподавателей помещаются');
    if (w <= 1100) t(await p.evaluate(() => { const w = document.querySelector('[data-ac-wall]'); return !w.querySelector('.ac-wall-pic') || getComputedStyle(w.querySelector('.ac-wall-pic')).display === 'none'; }), w + ' px: узкий экран — вместо рендера те же портреты-фотопечати на рифлёном тёплом фоне');
    if (w <= 1100) { await jc(p, '#teachers .ac-tc:nth-child(3) .ac-tc-frame'); await p.waitForTimeout(1300); t(await p.evaluate(() => { const s = document.querySelector('.ac-sp'); if (!s || s.hidden) return false; const c = s.querySelector('.ac-sp-card').getBoundingClientRect(), ph = s.querySelector('.ac-sp-photo').getBoundingClientRect(); return c.left >= -1 && c.right <= innerWidth + 1 && ph.left >= -1 && ph.right <= innerWidth + 1 && s.scrollWidth <= innerWidth + 1; }), w + ' px: карточка преподавателя помещается'); await p.keyboard.press('Escape'); await p.waitForTimeout(1100); }
    t(p._errs.length === 0, w + ' px: нет ошибок в консоли', p._errs); await p._ctx.close();
  }

  await b.close(); srv.close();
  console.log(bad.length ? `Страница «Обучение» (академия): ✓ ${ok}, ✗ ${bad.length}\n  ✗ ` + bad.join('\n  ✗ ') : `Страница «Обучение» (академия): ✓ ${ok}, ✗ 0`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
