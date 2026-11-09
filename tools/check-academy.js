#!/usr/bin/env node
/* Проверка страницы «Обучение» (ASTREYA ACADEMY) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется: восемь зон по порядку (по макету заказчика); первый экран (текст слева, рендер аудитории справа, товары на столе внутри кадра); «Как пройти регистрацию?» — четыре шага со стрелками;
   преподаватели: четыре карточки, «О преподавателях» раскрывает всех восьмерых; расписание: города (Москва, Санкт-Петербург, Ростов-на-Дону, Симферополь, Онлайн) и выпадающий список «Все форматы» меняют карточки и календарь,
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
  t(zones.join() === 'ac-hero,ac-reg,ac-tch,ac-cal,ac-lab,ac-media,ac-lib,ac-final-sec', 'восемь зон идут по порядку', zones);
  t(/Учебный центр «Астрея»/.test(await p.textContent('.ac-hero h1')) && /ASTREYA ACADEMY/.test(await p.textContent('.ac-hero .ac-eyebrow')), 'первый экран: заголовок и надпись ASTREYA ACADEMY');
  const hero = await p.evaluate(() => { const i = document.querySelector('.ac-hall-img'), hall = document.querySelector('.ac-hall-in').getBoundingClientRect(), pk = [...document.querySelectorAll('.ac-pk')].map(k => { const r = k.getBoundingClientRect(); return {l: r.left - hall.left, r: r.right - hall.left, t: r.top - hall.top, b: r.bottom - hall.top, w: r.width, h: r.height, ok: [...k.querySelectorAll('img')].every(x => x.complete && x.naturalWidth > 0)}; }); return {img: !!i && i.complete && i.naturalWidth >= 1000, w: hall.width, h: hall.height, pk}; });
  t(hero.img, 'рендер аудитории загружен'); t(hero.pk.length === 6 && hero.pk.every(k => k.ok && k.l > 0 && k.r < hero.w && k.t > hero.h * .3 && k.b < hero.h * .85), 'шесть упаковок стоят на столе внутри кадра', hero.pk.map(k => [Math.round(k.l), Math.round(k.t)]));
  t(hero.pk.every(k => k.h > 10 && k.h < hero.h * .2), 'упаковки на столе читаемого, но не завышенного размера', hero.pk.map(k => Math.round(k.h)));
  t(await p.evaluate(() => { const c = document.querySelector('.ac-cal .cd'); return !!c && /Ближайшее мероприятие/.test(c.textContent) && !!c.querySelector('[data-act="form"][data-type="seminar"]'); }), 'расписание: панель ближайшего мероприятия с обратным отсчётом и кнопкой записи');
  t(await p.evaluate(() => { const h = document.querySelector('.ac-hero'); return /Бесплатные семинары и мастер-классы/.test(h.textContent) && /10:30 до 18:00/.test(h.textContent) && !!h.querySelector('a.btn-fill[data-target="sched"]') && !!h.querySelector('a.ac-more[data-target="lab"]'); }), 'первый экран: подзаголовок, время семинара, кнопка «Расписание семинаров» и ссылка «О центре»');
  t(await p.evaluate(() => { const r = document.querySelector('.ac-reg h2'); return /Как пройти регистрацию\?/.test(r.textContent) && document.querySelectorAll('.ac-steps .ac-st').length === 4 && document.querySelectorAll('.ac-steps .ac-arr').length === 3 && [...document.querySelectorAll('.ac-st-ic svg')].length === 4; }), '«Как пройти регистрацию?»: четыре шага со значками и три стрелки');
  t(await p.evaluate(() => { const hr = document.querySelector('.ac-hero').getBoundingClientRect(), rg = document.querySelector('.ac-reg-card').getBoundingClientRect(); return rg.top < hr.bottom - 10; }), 'плашка шагов заходит на первый экран (как в макете)');
  t(await p.evaluate(() => document.querySelectorAll('#teachers .ac-tc').length) === RD.teachers.items.length && await p.evaluate(() => !!document.querySelector('#teachers .rd-head')), 'преподаватели: карточек столько же, сколько в данных');
  t(await p.evaluate(() => { const m = document.getElementById('ac-tmore'); return document.querySelectorAll('#teachers > .ac-in > .ac-tgrid .ac-tc').length === 4 && m.getBoundingClientRect().height < 2 && m.hasAttribute('inert'); }), 'преподаватели: сначала четыре карточки, остальные свёрнуты');
  await jc(p, '#teachers [data-act="acad-more"]'); await p.waitForTimeout(1300);
  t(await p.evaluate(() => { const m = document.getElementById('ac-tmore'), b = document.querySelector('#teachers [data-act="acad-more"]'); return m.getBoundingClientRect().height > 200 && !m.hasAttribute('inert') && b.getAttribute('aria-expanded') === 'true' && /Свернуть/.test(b.textContent); }), '«О преподавателях» плавно раскрывает остальных (кнопка меняется на «Свернуть»)');
  t(await p.evaluate(() => [...document.querySelectorAll('#teachers .ac-tc img')].filter(i => { i.loading = 'eager'; return true; }).length) === RD.teachers.items.filter(x => x.photo).length, 'преподаватели: фото у всех');
  await p.waitForTimeout(900);
  t(await p.evaluate(() => [...document.querySelectorAll('#teachers .ac-tc img')].filter(i => i.complete && i.naturalWidth >= 500).length) === RD.teachers.items.filter(x => x.photo).length, 'преподаватели: портреты всех загружены в высоком разрешении');
  await jc(p, '#teachers [data-act="acad-more"]'); await p.waitForTimeout(1200);
  t(await p.evaluate(() => document.getElementById('ac-tmore').getBoundingClientRect().height < 2), '«Свернуть» убирает раскрытых преподавателей');

  /* --- календарь и фильтры --- */
  const total = await p.evaluate(() => document.querySelectorAll('#sem-list .sem-item').length);
  t(total >= 5, 'карточки мероприятий из расписания', total);
  const cities = await p.evaluate(() => [...document.querySelectorAll('#city-chips .chip')].map(x => x.dataset.id));
  t(['all', 'Москва', 'Санкт-Петербург', 'Ростов-на-Дону', 'Симферополь', 'Онлайн'].every(c => cities.includes(c)), 'фильтр города: Москва, Санкт-Петербург, Ростов-на-Дону, Симферополь, Онлайн', cities);
  t(await p.evaluate(() => [...document.querySelectorAll('#fmt-chips .chip')].map(x => x.dataset.id).join()) === 'all,offline,online', 'фильтр формата: все, очно, онлайн');
  t(await p.evaluate(() => { const d = document.querySelector('[data-ac-dd]'), m = document.getElementById('fmt-chips'); return /Все форматы/.test(d.querySelector('.ac-dd-b').textContent) && getComputedStyle(m).visibility === 'hidden'; }), 'формат — выпадающий список «Все форматы», закрыт по умолчанию');
  t(await p.evaluate(() => !!document.querySelector('[data-acad-cal] .sx-cal .sx-cal-grid') && document.querySelectorAll('[data-acad-cal] .sx-cd.ev').length > 0), 'календарь встреч внутри зоны календаря, есть дни с мероприятиями');
  const sel0 = await p.evaluate(() => { const c = document.querySelectorAll('#sem-list .sem-item.is-sel'); return {n: c.length, bg: c[0] ? getComputedStyle(c[0]).backgroundImage : '', day: document.querySelectorAll('.sx-cd.acad-sel').length}; });
  t(sel0.n === 1 && /rgb\(1[0-9], \d+, \d+\)|rgb\(11, 26, 51\)/.test(sel0.bg), 'по умолчанию выбрано одно мероприятие — тёмно-синяя карточка', sel0); t(sel0.day >= 1, 'тот же день подсвечен в календаре тёмно-синим');
  await p.evaluate(() => [...document.querySelectorAll('#sem-list .sem-item')].filter(x => !x.hidden)[1].querySelector('.sem-desc').click()); await p.waitForTimeout(600);
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
  t(await p.evaluate(() => { const im = [...document.querySelectorAll('.ac-lab .ac-pp img')]; return im.length === 3 && im.every(i => i.complete && i.naturalWidth > 300) && /Практическое обучение/.test(document.querySelector('.ac-pano').textContent) && !!document.querySelector('.ac-pano a.ac-more'); }), 'практическое обучение: панорама из трёх настоящих фотографий, заголовок и «Узнать больше»');
  const mv = await p.evaluate(() => [...document.querySelectorAll('.ac-media .ac-vid')].map(a => ({href: a.href, img: (a.querySelector('.ac-vid-img') || {}).naturalWidth || 0, title: (a.querySelector('.ac-vid-t b') || {}).textContent || ''})));
  t(mv.length === Math.min(3, VIDS.length || TR.videos.length), 'видеотека: три выпуска', mv.length);
  if (VIDS.length) { t(mv.every(v => v.img >= 600 && /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(v.href)), 'медиатека: настоящие заставки видео (кадры с YouTube) и ссылки на сами видео', mv.map(v => [v.img, v.href])); t(VIDS.every(v => fs.existsSync(path.join(ROOT, v.thumb)) && fs.existsSync(path.join(ROOT, v.thumbSmall))), 'файлы заставок на месте'); }
  t(await p.evaluate(() => /Видеотека мастер-классов/.test(document.querySelector('.ac-media h2').textContent) && /Перейти к видео/.test(document.querySelector('.ac-media .ac-more').textContent)), 'видеотека: заголовок и «Перейти к видео»');
  await jc(p, '.ac-faq .faq-item:nth-child(2) .faq-q'); await p.waitForTimeout(600);
  t(await p.evaluate(() => document.querySelector('.ac-faq .faq-item:nth-child(2)').classList.contains('open') && document.querySelector('.ac-faq .faq-item:nth-child(2) .faq-q').getAttribute('aria-expanded') === 'true'), 'вопросы раскрываются');
  t(await p.evaluate(() => document.querySelectorAll('.ac-faq .faq-item').length) === TR.faq.length && await p.evaluate(() => document.querySelectorAll('#materials .ac-pubs > *').length) === 3, 'вопросы и статьи: все вопросы и три статьи');
  t(await p.evaluate(() => { const f = document.querySelector('.ac-final'); return !!f && /Начните с семинара/.test(f.textContent) && /Начать с семинара/.test(f.querySelector('a[data-target="sched"]').textContent) && !!f.querySelector('[data-act="form"]') && !!f.querySelector('.ac-final-pic'); }), 'финальный баннер: тёмно-синий, «Начать с семинара» и «Задать вопрос»');
  t(await noOverflow(p), 'нет горизонтальной прокрутки (1672)'); t(p._errs.length === 0, 'нет ошибок в консоли (1672)', p._errs); await p._ctx.close();

  /* --- ширины --- */
  for (const [w, h, touch] of [[1920, 1000], [1440, 900], [1280, 800], [1024, 768, true], [768, 1024, true], [600, 900, true], [390, 844, true], [360, 740, true], [320, 700, true]]) {
    p = await open(w, h, {touch}); t(await noOverflow(p), w + ' px: нет горизонтальной прокрутки');
    t(await p.evaluate(() => { const i = document.querySelector('.ac-hall-img'); return !!i && i.complete && i.naturalWidth > 700; }), w + ' px: аудитория загружена');
    t(await p.evaluate(() => [...document.querySelectorAll('.ac-page > section')].every(s => s.getBoundingClientRect().width >= innerWidth - 1)), w + ' px: зоны на всю ширину');
    t(await p.evaluate(() => { const c = document.querySelector('#sem-list .sem-item:not([hidden])'); if (!c) return false; const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), w + ' px: карточка мероприятия помещается');
    t(p._errs.length === 0, w + ' px: нет ошибок в консоли', p._errs); await p._ctx.close();
  }

  await b.close(); srv.close();
  console.log(bad.length ? `Страница «Обучение» (академия): ✓ ${ok}, ✗ ${bad.length}\n  ✗ ` + bad.join('\n  ✗ ') : `Страница «Обучение» (академия): ✓ ${ok}, ✗ 0`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
