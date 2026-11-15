#!/usr/bin/env node
/* Проверка страницы «Компания» («ASTREYA Grand Atrium», страница v2) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Девять сцен (вход, направления, выставка брендов, панели доверия, комната профессионалов, учебный центр, география, партнёрство, финал): содержимое из данных
   (направления, бренды и линии, преимущества, события, адреса офисов строго из data/site.json), кнопки и ссылки (куда ведут, data-track), оговорка об ориентировочном подборе,
   два ближайших события, города по наведению/фокусу, калькулятор скидки (считается здесь независимо от страницы), Стелла (только asst-open / asst-chip), навигатор по сценам,
   prefers-reduced-motion (нет движения), вариант без JS (всё раскрыто и читаемо), 1440 / 1024 / 390: без горизонтальной прокрутки и ошибок консоли, цели касания ≥ 44 px.
   Запуск: node tools/check-company.js (после node tools/build.js). Сервер на порту 0. Код возврата ≠ 0 при ошибках. */
'use strict';
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

  /* ================= 1440 ================= */
  let p = await open(1440, 900);
  t(await p.evaluate(() => document.body.dataset.page === 'company' && !!document.querySelector('.ca[data-ca].is-js')), 'компания: страница v2 включена (.ca), скрипт сцен подключён');
  t(await p.evaluate(() => document.querySelectorAll('h1').length === 1 && document.querySelector('h1').textContent.trim() === 'Астрея — пространство профессиональной косметологии'), 'компания: один заголовок первого уровня «Астрея — пространство профессиональной косметологии»');
  const sc = await p.evaluate(() => [...document.querySelectorAll('[data-scene]')].map(s => ({n: s.dataset.scene, id: s.id, h: Math.round(s.getBoundingClientRect().height), tag: s.tagName})));
  t(sc.length === 9 && sc.map(x => x.n).join('') === '123456789' && sc.every(x => x.h > 250 && x.tag === 'SECTION'), 'компания: девять сцен по порядку, каждая — раздел с высотой', sc);
  /* --- 1. вход --- */
  t(await p.evaluate(() => { const i = document.querySelector('.ca-entry img'); return !!i && i.complete && i.naturalWidth > 800; }), 'сцена 1: рендер атриума загружен');
  t(/О компании/i.test(await p.textContent('.ca-entry .ca-eyebrow')) && nbsp(await p.textContent('.ca-entry .ca-lead')) === nbsp(CP.lead) && nbsp(await p.textContent('.ca-entry .ca-dist')) === nbsp(CP.h1), 'сцена 1: «О компании», прежнее описание и прежний заголовок сохранены');
  const cta1 = await p.$('.ca-entry a.btn[data-act="scroll"][data-target="ca-niches"]');
  t(!!cta1 && /Познакомиться с компанией/.test(await cta1.textContent()) && await cta1.getAttribute('data-track') === 'company_intro', 'сцена 1: кнопка «Познакомиться с компанией» (data-track company_intro)');
  await cta1.click(); await p.waitForTimeout(1600);
  t(await p.evaluate(() => Math.abs(document.getElementById('ca-niches').getBoundingClientRect().top) < 120), 'сцена 1: кнопка ведёт к сцене «Направления»');
  /* --- 2. направления --- */
  t(await p.evaluate(() => [...document.querySelectorAll('.ca-nich h3')].map(h => h.textContent).join('|')) === CP.directions.map(d => d.title).join('|'), 'сцена 2: четыре ниши — направления из data/content.json в том же порядке');
  t(await p.evaluate(() => document.querySelectorAll('.ca-nich .ca-arch').length === 4 && !!document.querySelector('.about-grid .txt')) && (await p.$$eval('.about-grid .txt p', e => e.map(x => x.textContent.trim()))).join('|') === CP.who.join('|'), 'сцена 2: прежний текст «кто мы» (три абзаца) на месте, крючок .about-grid .txt для навигатора');
  t(await p.evaluate(() => document.querySelectorAll('.ca-why li').length === 3), 'сцена 2: три прежних тезиса «почему мы»');
  /* --- 3. бренды --- */
  const fr = await p.$$eval('.ca-frame', e => e.map(x => ({href: x.getAttribute('href'), grp: x.closest('.ca-grp').className.replace('ca-grp ', ''), logo: !!x.querySelector('.ca-blogo'), pack: !!x.querySelector('.ca-on-plinth')})));
  t(fr.length === BR.length && BR.every(x => fr.some(f => f.href === 'brands/' + x.id + '.html')), 'сцена 3: выставка — все бренды из data/brands.json, каждый ведёт на свою страницу', fr.map(f => f.href));
  t(['dermatime', 'keenwell'].every(id => fr.find(f => f.href.endsWith('/' + id + '.html')).grp === 'ca-g-spain') && ['endocare', 'neoretin', 'heliocare', 'biretix', 'iraltone', 'elancyl'].every(id => fr.find(f => f.href.endsWith('/' + id + '.html')).grp === 'ca-g-cl') && fr.find(f => f.href.endsWith('/eva.html')).grp === 'ca-g-dev', 'сцена 3: Dermatime и Keenwell, линии Cantabria Labs (6) и EVA — отдельными группами');
  t(await p.evaluate(() => !!document.querySelector('.ca-g-cl .ca-gt img[alt="Cantabria Labs"]')) && fr.every(f => f.logo && f.pack), 'сцена 3: производитель Cantabria Labs показан отдельно от линий; у каждого бренда логотип и упаковка на постаменте');
  t(await p.evaluate(() => { const a = [...document.querySelectorAll('.ca-expo .ca-cta a')]; return a.length === 2 && /Все бренды/.test(a[0].textContent) && a[0].getAttribute('href') === 'brands.html' && /Перейти в каталог/.test(a[1].textContent) && a[1].getAttribute('href') === 'catalog.html' && a[1].dataset.track === 'catalog_click'; }), 'сцена 3: кнопки «Все бренды» → brands.html и «Перейти в каталог» → catalog.html');
  t(await p.evaluate(() => [...document.querySelectorAll('.ca-niche-img > img:first-child')].every(i => { i.scrollIntoView({block: 'center'}); return true; })) && (await p.waitForTimeout(1200), await p.evaluate(() => [...document.querySelectorAll('.ca-niche-img > img:first-child')].every(i => i.complete && i.naturalWidth > 300))), 'сцена 3: изображения ниш загружены');
  /* --- 4. доверие --- */
  t(await p.evaluate(() => [...document.querySelectorAll('.ca-slab h3')].map(h => h.textContent).join('|')) === CONTENT.advantages.map(a => a.title).join('|') && CONTENT.advantages.length === 6, 'сцена 4: шесть панелей доверия — преимущества из data/content.json');
  t(await p.evaluate(() => [...document.querySelectorAll('.ca-slab')].every(s => !s.querySelector('use,.ico,i.ic,[class*="icon"]') && s.querySelectorAll('svg').length === 1 && s.querySelector('.ca-seal svg path'))), 'сцена 4: у панелей авторские знаки, без стандартных иконок сайта');
  /* --- 5. профессионалы --- */
  t(nbsp(await p.textContent('.ca-pro h2')) === nbsp(CP.professionals.title) && nbsp(await p.textContent('.ca-pro-copy > p')) === nbsp(CP.professionals.text[0]), 'сцена 5: заголовок и текст «Работа с профессионалами» прежние');
  t(/ориентировочн/i.test(await p.textContent('.ca-plate')) && nbsp(await p.textContent('.ca-plate p')) === nbsp(CP.professionals.text[1]), 'сцена 5: обязательная оговорка — подбор ориентировочный (текст из данных)');
  const chips = await p.$$eval('.ca-pro .ca-ask', e => e.map(x => ({act: x.dataset.act, q: x.dataset.q, tr: x.dataset.track})));
  t(chips.length === 3 && chips.every(c => c.act === 'asst-chip' && c.q && c.tr === 'asst_chip'), 'сцена 5: подсказки Стеллы — только asst-chip с вопросом', chips);
  t(await p.evaluate(() => { const a = document.querySelector('.ca-pro .ca-cta a'); return /Перейти в каталог/.test(a.textContent) && a.getAttribute('href') === 'catalog.html' && a.dataset.track === 'catalog_click'; }), 'сцена 5: кнопка «Перейти в каталог» → catalog.html (data-track сохранён)');
  /* --- 6. учебный центр --- */
  const today = new Date().toISOString().slice(0, 10), up = EV.filter(e => e.date >= today), want = (up.length >= 2 ? up : up.concat(EV.slice(-(2 - up.length)))).slice(0, 2);
  const evs = await p.$$eval('.ca-ev', e => e.map(x => ({date: x.dataset.date, city: x.dataset.city, href: x.querySelector('h3 a').getAttribute('href'), reg: !!x.querySelector('button[data-act="form"][data-type="seminar"]')})));
  t(evs.length === 2 && evs.every((e, i) => e.date === want[i].date && e.href.endsWith(want[i].slug + '.html') && e.city === want[i].city && e.reg), 'сцена 6: два реальных ближайших события из data/events.json (по дате), со ссылкой и «Записаться»', {evs, want: want.map(e => e.slug)});
  t(await p.evaluate(() => { const a = document.querySelector('.ca-edu .ca-cta a'); return /Посмотреть расписание/.test(a.textContent) && a.getAttribute('href') === 'training.html'; }) && /Семинары, мастер-классы и вебинары для специалистов: очно в четырёх городах и онлайн/.test(await p.textContent('.ca-edu-copy')), 'сцена 6: «Посмотреть расписание» → training.html, прежний текст об учебном центре');
  await scrollTo(p, '.ca-edu'); await p.click('.ca-ev button[data-act="form"]'); await p.waitForTimeout(700);
  t(await p.evaluate(() => { const m = document.getElementById('modal'); return !!m && m.classList.contains('open'); }), 'сцена 6: «Записаться» открывает форму записи'); await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  /* --- 7. география --- */
  await scrollTo(p, '.ca-geo');
  const geo = await p.$$eval('.ca-city', e => e.map(x => ({c: x.dataset.city, kind: x.classList.contains('is-office') ? 'office' : 'sem', txt: x.querySelector('.ca-cd').textContent.replace(/\s+/g, ' '), tag: x.querySelector('.ca-node small').textContent})));
  t(geo.map(g => g.c).join('|') === 'Москва|Санкт-Петербург|Ростов-на-Дону|Симферополь|Онлайн', 'сцена 7: пять точек — Москва, Санкт-Петербург, Ростов-на-Дону, Симферополь, Онлайн', geo.map(g => g.c));
  const [mo, sp, ro, si] = SITE.offices;
  t(geo[0].kind === 'office' && geo[0].txt.includes(mo.addr) && geo[0].txt.includes(mo.hours) && geo[0].txt.includes(mo.phones[0][0]) && geo[1].kind === 'office' && geo[1].txt.includes(sp.addr) && sp.phones.every(x => geo[1].txt.includes(x[0])), 'сцена 7: адреса, часы и телефоны офисов — строго из data/site.json');
  t(geo[2].tag === 'Город семинаров' && geo[3].tag === 'Город семинаров' && geo[2].kind === 'sem' && !geo[2].txt.includes('Мурлычева') && !geo[3].txt.includes('Симферополь, ул') && geo[4].c === 'Онлайн' && geo[4].kind === 'sem', 'сцена 7: Ростов-на-Дону и Симферополь — города семинаров, не офисы; Онлайн отдельно');
  t(await p.evaluate(() => { const a = document.querySelector('.ca-geo .ca-more'); return /Все контакты/.test(a.textContent) && a.getAttribute('href') === 'contacts.html'; }), 'сцена 7: «Все контакты» → contacts.html');
  t(await p.evaluate(() => document.querySelectorAll('.ca-city.on').length === 1 && document.querySelector('.ca-city.on').dataset.city === 'Москва'), 'сцена 7: по умолчанию раскрыта карточка Москвы');
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.visibility === 'visible' && +cs.opacity > .9 && r.height > 40; }, sel);
  await p.hover('.ca-city[data-city="Санкт-Петербург"] .ca-node'); await p.waitForTimeout(700);
  t(await vis('.ca-city[data-city="Санкт-Петербург"] .ca-cd') && !(await vis('.ca-city[data-city="Москва"] .ca-cd')) && await p.evaluate(() => !!document.querySelector('.ca-city.on[data-city="Санкт-Петербург"] a[href="tel:+79214204735"]')), 'сцена 7: по наведению раскрывается карточка Санкт-Петербурга (телефон — ссылка), Москва закрывается');
  await p.focus('.ca-city[data-city="Симферополь"] .ca-node'); await p.waitForTimeout(600);
  t(await p.evaluate(() => document.querySelector('.ca-city.on').dataset.city === 'Симферополь' && document.querySelector('.ca-city.on .ca-node').getAttribute('aria-expanded') === 'true'), 'сцена 7: то же по фокусу с клавиатуры (aria-expanded)');
  t(await p.evaluate(() => document.querySelectorAll('.sx-region').length === 1 && document.querySelectorAll('[data-sx-reg]').length >= 3 && !!document.querySelector('.ca-geo h2') && /Мы рядом/.test(document.querySelector('.ca-geo h2').textContent)), 'сцена 7: заголовок «Мы рядом» сохранён — к нему пристраивается «Ваш регион» продающего слоя');
  /* --- 8. партнёрство и калькулятор --- */
  await scrollTo(p, '.ca-partner');
  const pb = await p.$('.ca-partner .ca-cta a[data-track="partner_cta"]');
  t(!!pb && /Стать партнёром/.test(await pb.textContent()) && await pb.getAttribute('href') === 'partners.html', 'сцена 8: кнопка «Стать партнёром» → partners.html (data-track partner_cta)');
  t(await p.evaluate(() => { const a = document.querySelector('.ca-partner .ca-cta a[href^="tel:"]'); return !!a && a.getAttribute('href') === 'tel:+74959255162'; }), 'сцена 8: телефон компании — ссылкой');
  const setR = v => p.evaluate(v => { const r = document.getElementById('ca-range'); r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); }, v);
  const readC = () => p.evaluate(() => ({sum: document.getElementById('ca-sum').textContent, tier: document.getElementById('ca-tier').textContent, save: document.getElementById('ca-save').textContent, on: [...document.querySelectorAll('.ca-tiers li')].map(x => x.classList.contains('reached') ? 1 : 0).join('')}));
  let calcOk = true, calcInfo = [];
  for (const v of [0, 40000, 50000, 149999 - (149999 % 10000), 150000, 290000, 300000, 500000]) {
    await setR(v); const r = await readC(); let d = null; DS.forEach(x => { if (v >= x.from) d = x; });
    const expect = {sum: rub(v), tier: d ? 'Ваша скидка — ' + d.pct + '%' : 'До первой скидки — ' + rub(DS[0].from - v), save: d ? rub(Math.round(v * d.pct / 100)) : '—', on: DS.map(x => v >= x.from ? 1 : 0).join('')};
    if (nbsp(r.sum) !== nbsp(expect.sum) || nbsp(r.tier) !== nbsp(expect.tier) || nbsp(r.save) !== nbsp(expect.save) || r.on !== expect.on) { calcOk = false; calcInfo.push({v, r, expect}); }
  }
  t(calcOk, 'сцена 8: калькулятор — сумма, скидка, экономия и пороги совпадают с независимым расчётом на всех шагах', calcInfo.slice(0, 2));
  await p.focus('#ca-range'); await setR(0); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  t(+(await p.$eval('#ca-range', r => r.value)) === 20000, 'сцена 8: ползунок управляется стрелками клавиатуры (шаг 10 000 ₽)');
  t(/ориентировочн/i.test(await p.textContent('.ca-fine')) && await p.evaluate(() => !!document.getElementById('ca-range').getAttribute('aria-valuetext')), 'сцена 8: оговорка «расчёт ориентировочный», значение ползунка для скринридера');
  /* --- 9. финал --- */
  await scrollTo(p, '.ca-final');
  const pn = await p.$$eval('.ca-panel', e => e.map(x => ({href: x.getAttribute('href'), tr: x.dataset.track, h: x.querySelector('h3').textContent})));
  t(pn.length === 2 && pn[0].href === 'training.html' && pn[0].h === 'Учебный центр' && pn[1].href === 'start.html' && pn[1].h === 'Старт со Стеллой' && pn.every(x => x.tr === 'closing_cta') && /Познакомимся на практике/.test(await p.textContent('.ca-final h2')), 'сцена 9: «Познакомимся на практике» — две панели: «Учебный центр» → training.html, «Старт со Стеллой» → start.html', pn);
  const ao = await p.$('.ca-final [data-act="asst-open"]');
  t(!!ao && await ao.getAttribute('data-track') === 'asst_open', 'сцена 9: «Спросить Стеллу» — asst-open');
  await ao.click(); await p.waitForTimeout(900);
  t(await p.evaluate(() => document.body.classList.contains('asst-open')), 'сцена 9: Стелла открывается по кнопке (без второго чата)');
  const bad9 = await p.evaluate(() => [...document.querySelectorAll('.ca [data-act]')].filter(e => !e.closest('.sx-mod, .g-e-ch') && !['scroll', 'form', 'asst-open', 'asst-chip'].includes(e.dataset.act)).map(e => e.dataset.act).concat([...document.querySelectorAll('.ca [class*="chat"], .ca iframe')].map(e => e.className.baseVal === undefined ? e.className : 'svg:' + e.className.baseVal)));
  t(bad9.length === 0, 'Стелла: на странице только asst-open / asst-chip (и обычные scroll / form), своего чата нет', bad9);
  /* --- навигатор по сценам --- */
  await p.reload(); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(1500);
  t(await p.evaluate(() => document.querySelectorAll('.ca-rail a').length === 9 && getComputedStyle(document.querySelector('.ca-rail')).display !== 'none'), 'навигатор: девять точек по сценам видны на 1440');
  await p.click('.ca-rail a:nth-child(3)'); await p.waitForTimeout(1600);
  t(await p.evaluate(() => Math.abs(document.getElementById('ca-expo').getBoundingClientRect().top) < 140 && document.querySelector('.ca-rail a.on') === document.querySelector('.ca-rail a:nth-child(3)')), 'навигатор: точка ведёт к своей сцене и подсвечивается');
  /* --- движение --- */
  await p.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'})); await p.waitForTimeout(500); await p.evaluate(() => window.scrollTo({top: 420, behavior: 'instant'})); await p.waitForTimeout(700);
  const hp = await p.evaluate(() => +getComputedStyle(document.querySelector('.ca')).getPropertyValue('--hp') || 0);
  t(hp > 0.1 && hp < 1, 'движение: при прокрутке первый экран «шагает вглубь атриума» (--hp)', hp);
  t(await noOverflow(p), 'компания 1440: нет горизонтальной прокрутки');
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)); } });
  await p.waitForTimeout(900);
  t(await p.evaluate(() => [...document.querySelectorAll('.ca img')].every(i => i.complete && i.naturalWidth > 0)), 'компания 1440: все изображения загружены (после прокрутки)', await p.evaluate(() => [...document.querySelectorAll('.ca img')].filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src'))));
  t(await p.evaluate(() => [...document.querySelectorAll('.ca img')].every(i => i.hasAttribute('width') && i.hasAttribute('height') || i.closest('.ca-niche-img') || i.classList.contains('ca-blogo') || i.classList.contains('ca-mk') || i.closest('.ca-pk') || i.classList.contains('ca-on-plinth'))), 'компания: у крупных изображений заданы width/height (без сдвига вёрстки)');
  t(await p.evaluate(() => { const tg = [...document.querySelectorAll('.ca [data-track]')].map(e => e.dataset.track); return tg.length >= 25 && ['company_intro', 'brands_click', 'catalog_click', 'brand_click', 'training_click', 'closing_cta', 'asst_chip', 'asst_open', 'phone_click', 'contacts_click'].every(k => tg.includes(k)); }), 'компания: data-track на месте (вход, бренды, каталог, обучение, финал, Стелла, телефон, контакты)');
  t(p._errs.length === 0, 'компания 1440: ошибок в консоли нет', p._errs); await p._ctx.close();

  /* ================= 1440, prefers-reduced-motion ================= */
  p = await open(1440, 900, {reduced: true}); await p.evaluate(() => window.scrollTo({top: 420, behavior: 'instant'})); await p.waitForTimeout(800);
  const rm = await p.evaluate(() => ({hp: getComputedStyle(document.querySelector('.ca')).getPropertyValue('--hp').trim(), dust: getComputedStyle(document.querySelector('.ca-dust')).display, anim: getComputedStyle(document.querySelector('.ca-shaft')).animationName, tr: getComputedStyle(document.querySelector('.ca-bg img')).transform}));
  t((rm.hp === '' || +rm.hp === 0) && rm.dust === 'none' && rm.anim === 'none', 'reduced-motion: нет «шага вглубь», пылинок и мерцания лучей', rm);
  t(await p.evaluate(() => !document.querySelector('.ca-slab').style.getPropertyValue('--ry')) && await noOverflow(p) && p._errs.length === 0, 'reduced-motion: страница читаема, без ошибок'); await p._ctx.close();

  /* ================= без JS ================= */
  p = await open(1440, 900, {js: false});
  t(await p.evaluate(() => document.querySelectorAll('[data-scene]').length === 9 && !document.querySelector('.ca.is-js')), 'без JS: все девять сцен на месте');
  t(await p.evaluate(() => [...document.querySelectorAll('.ca-cd')].every(e => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.visibility === 'visible' && +cs.opacity === 1 && r.height > 30; })), 'без JS: карточки всех городов раскрыты (адреса читаются)');
  t(await p.evaluate(() => document.querySelector('.ca-entry h1').getBoundingClientRect().height > 50 && [...document.querySelectorAll('.ca-slab p')].every(e => e.getBoundingClientRect().height > 10)), 'без JS: заголовок и тексты читаются') ; t(await noOverflow(p), 'без JS: нет горизонтальной прокрутки'); await p._ctx.close();

  /* ================= 1024 ================= */
  p = await open(1024, 768);
  t(await noOverflow(p) && await p.evaluate(() => document.querySelectorAll('[data-scene]').length === 9 && [...document.querySelectorAll('[data-scene]')].every(s => s.getBoundingClientRect().width <= innerWidth + 1)), 'компания 1024: девять сцен, нет горизонтальной прокрутки');
  t(await p.evaluate(() => getComputedStyle(document.querySelector('.ca-rail')).display === 'none'), 'компания 1024: навигатор по сценам скрыт (узкий экран)');
  await scrollTo(p, '.ca-geo'); await p.hover('.ca-city[data-city="Онлайн"] .ca-node'); await p.waitForTimeout(700);
  t(await p.evaluate(() => { const c = document.querySelector('.ca-city.on .ca-cd').getBoundingClientRect(); return document.querySelector('.ca-city.on').dataset.city === 'Онлайн' && c.right <= innerWidth && c.left >= 0; }), 'компания 1024: карточка города не выходит за экран');
  t(p._errs.length === 0, 'компания 1024: ошибок в консоли нет', p._errs); await p._ctx.close();

  /* ================= 390 ================= */
  p = await open(390, 844);
  t(await noOverflow(p) && await p.evaluate(() => [...document.querySelectorAll('[data-scene]')].every(s => s.getBoundingClientRect().width <= innerWidth + 1)), 'компания 390: нет горизонтальной прокрутки');
  t(await p.evaluate(() => { const i = document.querySelector('.ca-entry img'); return i.currentSrc.includes('atrium-m.webp') && i.complete; }), 'компания 390: на телефоне — вертикальный кадр атриума (atrium-m)');
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(800);
  t(await noOverflow(p), 'компания 390: после прокрутки всей страницы нет горизонтальной прокрутки');
  await scrollTo(p, '.ca-geo'); await p.tap('.ca-city[data-city="Санкт-Петербург"] .ca-node'); await p.waitForTimeout(700);
  t(await p.evaluate(() => { const li = document.querySelector('.ca-city.on'); const r = li.querySelector('.ca-cdi').getBoundingClientRect(); return li.dataset.city === 'Санкт-Петербург' && r.height > 60 && r.right <= innerWidth + 1; }), 'компания 390: касание открывает карточку города (аккордеон)');
  const small = await p.evaluate(() => [...document.querySelectorAll('.ca .ca-pill, .ca .ca-ask, .ca .ca-node, .ca .ca-more, .ca .ca-panel, .ca .ca-ev .btn')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 43.5; }).map(e => e.className + ':' + Math.round(e.getBoundingClientRect().height)));
  t(small.length === 0, 'компания 390: цели касания (кнопки, подсказки, города, ссылки) не ниже 44 px', small);
  t(await p.evaluate(() => document.querySelectorAll('.ca-slab').length === 6 && document.querySelectorAll('.ca-ev').length === 2 && document.querySelectorAll('.ca-frame').length === 9), 'компания 390: содержимое сцен то же (6 панелей, 2 события, 9 брендов)');
  t(p._errs.length === 0, 'компания 390: ошибок в консоли нет', p._errs); await p._ctx.close();

  await b.close(); srv.close();
  console.log('Компания: проверено ' + (ok + bad.length) + ', успешно ' + ok + (bad.length ? ', ОШИБОК ' + bad.length : ''));
  bad.forEach(x => console.log('  ✗ ' + x)); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('Сбой проверки:', e); process.exit(2); });
