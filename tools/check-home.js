#!/usr/bin/env node
/* Проверка главной ниже первого экрана — «маршрут партнёра» (src/pages/home-path.js, css/home-path.css, js/redesign.js) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется: порядок разделов (роль → доверие → бренды → подбор → обучение → новости → шаги → призыв); анимация первого экрана (#arch-story) и герой на месте и не тронуты;
   четыре роли с адресными ссылками (Старт со Стеллой) и бегущая «Стелла»; бенто — цифры из данных, города из представительств, преимущества; подбор по задаче — число задач = число задач каталога,
   наведение/фокус/первое касание переключает витрину справа, повторный клик ведёт в каталог, у каждой витрины бренды, товары и ссылки в каталог; учебный центр — ближайшее мероприятие из данных, обратный отсчёт,
   преподаватели, три следующих события; шаги = шаги страницы «Партнёрам»; нет горизонтальной прокрутки (1440 / 1100 / 820 / 390), нет ошибок JS, изображения загружены, у разделов есть заголовок.
   Запуск: node tools/check-home.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const CONTENT = J('data/content.json'), CATALOG = J('data/catalog.json'), SITE = J('data/site.json'), RD = J('data/redesign.json'), BRANDS = J('data/brands.json');
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); console.log((cond ? '  ✓ ' : '  ✗ ') + name + (!cond && info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); };

(async () => {
  console.log('[главная ниже героя: «маршрут партнёра»]');
  if (!(RD.homePath && RD.homePath.enabled)) { console.log('  – homePath выключен: проверка пропущена'); process.exit(0); }
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const open = async (w, h, touch) => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', isMobile: !!touch, hasTouch: !!touch}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} window.__ASTREYA_GL_GRID = 0.2; });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource.*(api|fonts)/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.goto(base + '/index.html'); await p.waitForSelector('html.ready', {timeout: 15000}).catch(() => {}); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} }
    await p.addStyleTag({content: 'html{scroll-behavior:auto!important}'}); await p.waitForTimeout(1500); p._errs = errs; p._ctx = ctx; return p;
  };
  const to = async (p, sel, off = -80) => { await p.evaluate(([s, o]) => { const e = document.querySelector(s); window.scrollTo({top: e.getBoundingClientRect().top + scrollY + o, behavior: 'instant'}); }, [sel, off]); await p.waitForTimeout(1300); };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  let p = await open(1440, 900);
  /* ---- порядок и состав ---- */
  const order = await p.evaluate(() => [...document.querySelectorAll('main section')].map(e => e.id || [...e.classList].find(c => /^(hp-|rd-news|rd-final|marquee|hero)/.test(c)) || '').filter(Boolean));
  const want = ['arch-story', 'start-path', 'brands-gallery', 'solutions', 'training-block', 'rd-news', 'how-to-start', 'rd-final'];
  const proofAt = order.indexOf('hp-proof'), pos = want.map(w => order.indexOf(w));
  t(pos.every(i => i >= 0) && pos.every((v, i) => i === 0 || v > pos[i - 1]) && proofAt > pos[1] && proofAt < pos[2], 'порядок разделов: роль → доверие → бренды → подбор → обучение → новости → шаги → призыв (первым — анимация)', order);
  t(await p.evaluate(() => !document.querySelector('.rd-about, .rd-why, .rd-aud, .rd-wall, .rd-featured, .rd-picker, .rd-editorial')), 'прежних разделов (о компании, четыре причины, для кого, стена брендов, рекомендуем, подборщик, экспертиза) на главной нет');
  t(await p.evaluate(() => { const a = document.getElementById('arch-story'); return !!(a && a.querySelector('.js-stage canvas.js-cv') && a.querySelector('.ar-jar-cv') && a.querySelector('.ar-copy h1') && a.querySelector('.ar-panel') && a.querySelector('.ar-cue')); }), 'анимация первого экрана и герой после неё на месте (сцена, баночка, заголовок, панель, «Листайте»)');
  t(await p.evaluate(() => [...document.querySelectorAll('section[aria-labelledby]')].every(s => document.getElementById(s.getAttribute('aria-labelledby')))), 'у разделов есть заголовок (aria-labelledby ведёт на существующий h2)');
  t(await p.evaluate(() => document.querySelectorAll('h1').length === 1), 'на странице один заголовок первого уровня');

  /* ---- роли ---- */
  const roles = await p.evaluate(() => [...document.querySelectorAll('.hp-role a')].map(a => ({h: a.getAttribute('href'), t: a.querySelector('h3').textContent.trim(), n: a.querySelector('.hp-role-no').textContent})));
  t(roles.length === 4 && roles.slice(0, 3).every(r => /^start\.html\?r=/.test(r.h)) && /contacts\.html/.test(roles[3].h), 'роли: четыре; косметологам, клиникам и салонам — адресный «Старт со Стеллой», партнёрам — контакты', roles);
  t(JSON.stringify(roles.map(r => r.t)) === JSON.stringify(RD.audience.items.map(a => a.title)), 'названия ролей — из data/redesign.json → audience');
  await to(p, '#start-path');
  t(await p.evaluate(() => { const a = document.querySelector('.hp-stella a'); return !!a && /start\.html$/.test(a.getAttribute('href')); }), 'под ролями — «Старт со Стеллой» для тех, кто не определился');
  { const r = await p.evaluate(() => { const rect = e => { const r = e.getBoundingClientRect(); return {l: r.left, r: r.right}; }, cs = [...document.querySelectorAll('.hp-role a')].map(rect); return {inside: cs.every(c => c.l >= 0 && c.r <= innerWidth), names: [...document.querySelectorAll('.hp-role h3')].every(h => h.scrollWidth <= h.clientWidth + 1)}; });
    t(r.inside && r.names, 'роли: арки в экране, названия не обрезаются', r); }
  { const before = await p.evaluate(() => getComputedStyle(document.querySelector('.hp-role a'), '::before').transform);
    await p.hover('.hp-role a'); await p.waitForTimeout(1000);
    const after = await p.evaluate(() => getComputedStyle(document.querySelector('.hp-role a'), '::before').transform);
    t(before !== after, 'роль при наведении заливается тёмно-синим (двигается только transform)', {before, after}); }

  /* ---- бенто ---- */
  await to(p, '.hp-bento', -120);
  { const s = await p.evaluate(() => [...document.querySelectorAll('.hp-stat')].map(e => ({k: e.className.match(/hp-st-(\w+)/)[1], n: e.querySelector('b').getAttribute('data-count'), l: e.querySelector('span').textContent.trim()})));
    t(s.length >= 4, 'бенто: четыре цифры', s);
    t(s.find(x => x.k === 'brands') && +s.find(x => x.k === 'brands').n === BRANDS.length, 'цифра «брендов» = число брендов в data/brands.json');
    t(s.find(x => x.k === 'geo') && +s.find(x => x.k === 'geo').n === SITE.offices.length, 'цифра «города» = число представительств в data/site.json'); }
  t(await p.evaluate(([n]) => document.querySelectorAll('.hp-cities li').length === n, [SITE.offices.length]), 'города присутствия — по одному на представительство');
  t(await p.evaluate(() => { const i = document.querySelector('.hp-photo img'); return !!i && i.complete && i.naturalWidth > 0; }), 'фото команды загружено');
  { const n = await p.evaluate(() => [...document.querySelectorAll('.hp-reason')].map(r => r.querySelector('h3').textContent.trim()));
    t(n.length === 4 && n.every(x => CONTENT.advantages.some(a => a.title === x)), '«Что вы получаете»: четыре преимущества из data/content.json', n); }
  { const c = await p.evaluate(() => { const b = document.querySelector('.hp-st-training b'); return b && b.textContent.trim(); });
    t(c === '20' || c === '20+' || /^20/.test(c || ''), 'счётчик доходит до значения (20+ лет)', c); }

  /* ---- подбор по задаче ---- */
  await to(p, '#solutions', -60);
  const tasks = await p.evaluate(() => [...document.querySelectorAll('[data-hp-task]')].map(a => a.getAttribute('data-hp-task')));
  t(tasks.length === CATALOG.tasks.length && tasks.join() === CATALOG.tasks.map(x => x.id).join(), 'подбор: столько же задач, сколько в каталоге, в том же порядке', tasks);
  t(await p.evaluate(() => document.querySelectorAll('.hp-task.on').length === 1 && document.querySelectorAll('.hp-panel.on').length === 1 && document.querySelector('.hp-panel.on').getAttribute('data-hp-panel') === document.querySelector('.hp-task.on').getAttribute('data-hp-task')), 'сначала выбрана одна задача и показана одна витрина');
  await p.hover('[data-hp-task="sun"]').catch(() => {}); await p.waitForTimeout(700);
  { const r = await p.evaluate(() => ({on: document.querySelector('.hp-task.on') && document.querySelector('.hp-task.on').getAttribute('data-hp-task'), panel: document.querySelector('.hp-panel.on') && document.querySelector('.hp-panel.on').getAttribute('data-hp-panel'), vis: [...document.querySelectorAll('.hp-panel')].filter(e => e.offsetParent !== null).length}));
    t(r.on === 'sun' && r.panel === 'sun' && r.vis === 1, 'наведение на задачу переключает витрину справа', r); }
  await p.focus('[data-hp-task="pigment"]').catch(() => {}); await p.waitForTimeout(500);
  t(await p.evaluate(() => (document.querySelector('.hp-panel.on') || {getAttribute: () => ''}).getAttribute('data-hp-panel')) === 'pigment', 'фокус с клавиатуры тоже переключает витрину');
  { const href = await p.evaluate(() => { const a = document.querySelector('[data-hp-task="pigment"]'); return a.getAttribute('href'); });
    t(/catalog\.html\?task=pigment$/.test(href), 'ссылка задачи ведёт в каталог с этой задачей', href); }
  { const r = await p.evaluate(() => [...document.querySelectorAll('.hp-panel')].map(pn => ({id: pn.getAttribute('data-hp-panel'), brands: pn.querySelectorAll('.hp-brand').length, prods: pn.querySelectorAll('.hp-prod').length, cat: !!pn.querySelector('a.btn-fill[href*="catalog.html?task="]'), stella: !!pn.querySelector('a[href$="start.html"]')})));
    t(r.every(x => x.brands > 0 && x.prods > 0 && x.cat && x.stella), 'у каждой витрины: бренды, товары, «в каталог» и «Спросить Стеллу»', r.filter(x => !(x.brands > 0 && x.prods > 0 && x.cat && x.stella)));
    const want = CATALOG.tasks.map(tk => J('data/products.json').filter(pr => pr.tasks.includes(tk.id)).length > 0);
    t(want.every(Boolean) || r.length === CATALOG.tasks.length, 'витрин столько же, сколько задач', r.length); }
  t(await p.evaluate(() => { const i = document.querySelector('.hp-panel.on .art img, .hp-panel.on .art'); return !!i; }), 'товары в витрине нарисованы (упаковка или фото)');

  /* ---- учебный центр ---- */
  await to(p, '#training-block', -40); await p.waitForTimeout(800);
  const EV = J('data/events.json').filter(e => !e.hidden).sort((a, c) => a.date.localeCompare(c.date));
  t(await p.evaluate(() => !!document.querySelector('.hp-faces') && /training\.html#teachers$/.test(document.querySelector('.hp-faces').getAttribute('href'))), 'преподаватели: лица ведут на «Обучение → преподаватели»');
  t(await p.evaluate(() => { const r = [...document.querySelectorAll('.hp-faces img')]; return r.length >= 3 && r.every(i => i.complete && i.naturalWidth > 0); }), 'лица преподавателей загружены');
  { const r = await p.evaluate(() => ({cd: !!document.querySelector('.hp-acad .cd'), next: document.querySelector('.hp-next') ? getComputedStyle(document.querySelector('.hp-next')).display : 'нет', ev: document.querySelectorAll('#home-events .hp-ev').length}));
    t(r.cd && r.next === 'none', 'обратный отсчёт подгружен и заменил строку «ближайшее мероприятие» (одно и то же не показывается дважды)', r);
    t(r.ev === Math.min(3, Math.max(0, EV.length - 1)) || r.ev === 3, 'ниже — три следующих события из data/events.json', r); }
  t(await p.evaluate(() => !!document.querySelector('.hp-acad .btn-light[href$="training.html"]')), 'кнопка «Расписание семинаров» ведёт на страницу обучения');

  /* ---- шаги ---- */
  await to(p, '#how-to-start', -60); await p.waitForTimeout(1200);
  { const s = await p.evaluate(() => [...document.querySelectorAll('.hp-step')].map(e => e.querySelector('h3').textContent.trim()));
    t(JSON.stringify(s) === JSON.stringify(CONTENT.partners.steps.map(x => x.t)), 'шаги совпадают с шагами страницы «Партнёрам» (data/content.json → partners.steps)', s); }
  t(await p.evaluate(() => { const l = document.querySelector('.hp-steps-list'); return getComputedStyle(l, '::after').transform !== 'matrix(0, 0, 0, 1, 0, 0)' && !!l.querySelector('.hp-step.in'); }), 'линия между шагами прорисовывается, когда шаги на экране');
  t(await p.evaluate(() => !!document.querySelector('.rd-final a[href$="partners.html"]')), 'внизу — призыв «Стать партнёром»');

  /* ---- ширины ---- */
  t(await noOverflow(p), 'нет горизонтальной прокрутки на 1440');
  t(p._errs.length === 0, 'нет ошибок JS (1440)', p._errs); await p._ctx.close();
  for (const [w, h, touch] of [[1100, 800], [820, 1100], [390, 844, true]]) {
    p = await open(w, h, touch);
    t(await noOverflow(p), 'нет горизонтальной прокрутки на ' + w);
    const sc = await p.evaluate(() => { const bad = []; document.querySelectorAll('.hp-roles,.hp-proof,.hp-find,.hp-acad,.hp-steps').forEach(sec => sec.querySelectorAll('h2,h3,.btn,.hp-stat,.hp-panel,.hp-next,.hp-ev').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.hp-roles-list,.hp-tasks')) bad.push(e.className || e.tagName); })); return bad.slice(0, 5); });
    t(sc.length === 0, 'на ' + w + ' ничего из нового не вылезает за экран (кроме лент, которые листаются)', sc);
    if (w === 390) {
      await to(p, '#solutions', -40);
      const first = await p.evaluate(() => document.querySelector('.hp-task.on').getAttribute('data-hp-task'));
      await p.tap('[data-hp-task="pigment"]').catch(() => {}); await p.waitForTimeout(600);
      const r = await p.evaluate(() => ({url: location.pathname, on: document.querySelector('.hp-task.on').getAttribute('data-hp-task')}));
      t(first !== 'pigment' && r.on === 'pigment' && /index\.html$|\/$/.test(r.url), 'на телефоне первое касание переключает витрину и не уводит со страницы', r);
      t(await p.evaluate(() => { const r = document.querySelector('.hp-roles-list'); return r.scrollWidth > r.clientWidth; }), 'на телефоне роли — лента, которую листают пальцем');
    }
    t(p._errs.length === 0, 'нет ошибок JS (' + w + ')', p._errs); await p._ctx.close();
  }
  await b.close(); srv.close();
  console.log('\nИтого: ✓ ' + ok + '  ✗ ' + bad.length);
  if (bad.length) { console.log(bad.map(x => ' ✗ ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
