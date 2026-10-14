#!/usr/bin/env node
/* Проверка продающего слоя «Путь к закупке» (data/redesign.json → extras.sales) в браузере и на настоящем сервере заявок:
   главная: вступление, герой и орбита прежние, добавлена развилка «Учиться / Закупать» (без кругов); стартовый подбор от первого вопроса до заявки (метка источника попадает в заявку);
   панель следующего шага (телефон и компьютер, проверка barDesktop); свой ход на каждой странице (подборки, маршрут бренда, календарь встреч, ориентир скидки, «Ваш регион», «Сейчас на связи», …); «что дальше» после заявки;
   отсутствие наложений на кнопки Стеллы и быстрой связи; мягкие переходы; ответы Стеллы про старт закупок, сомнения, заказ и «мой план»;
   честность текстов (никаких таймеров, выдуманного дефицита и «сейчас смотрят»).
   Запуск: node tools/check-sales.js  (после node tools/build.js). Нужны Playwright и Chromium. Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path'), cp = require('child_process');
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const H = require('../server/test/helpers');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

(async () => {
  const redesign = J('data/redesign.json').extras || {};
  if (!redesign.enabled || !redesign.sales) { console.log('Продающий слой выключен в data/redesign.json — проверка пропущена.'); process.exit(0); }
  const SALES = J('data/sales.json'), SITE = J('data/site.json');
  const dataJs = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
  const D = JSON.parse(dataJs.replace(/^[^=]*=\s*/, '').replace(/;\s*$/, ''));

  /* ================= A. Данные и сборка ================= */
  console.log('\n[A. Данные и сборка]');
  ok(D.sales && D.extras && D.extras.sales === true, 'в js/data.js есть блок sales и флаг extras.sales');
  ok(!D.sales.trust && !D.sales.next, 'общих блоков «Что дальше» и «Доверие» в настройках слоя больше нет (у каждой страницы свой ход)');
  ok(['home', 'catalog', 'brands', 'brand', 'product', 'training', 'event', 'partners', 'company', 'contacts', 'search'].every(k => D.sales.pages && D.sales.pages[k]), 'для каждой страницы есть свой модуль в data/sales.json → pages');
  ok(['product', 'training', 'company'].every(k => D.sales.closing && D.sales.closing[k]) && ['sale', 'novelty', 'edu', 'event'].every(k => D.sales.closing.article[k]), 'у товара, обучения, компании и статей по темам — свой завершающий призыв (closing)');
  ok(Array.isArray(D.sales.offices) && D.sales.offices.length >= 3 && D.sales.offices.every(o => !('emails' in o)), 'для блока «Ваш регион» в браузер уходят офисы и телефоны (без e-mail сотрудников)');
  ok(Array.isArray(D.guide && D.guide.pages) && D.guide.pages.some(p => p.id === 'start' && p.href === 'start.html'), 'Стелла знает страницу «Стартовый подбор»');
  ok(fs.existsSync(path.join(ROOT, 'start.html')) && /start\.html/.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')), 'страница start.html собрана и есть в sitemap.xml');
  ok(D.index.some(i => i.url === 'start.html'), 'страница есть в поиске по сайту');
  const shared = require('../js/shared.js');
  ok(shared.FORM_TYPES.plan && shared.FORM_TYPES.plan.fields.some(f => f[0] === 'phone' && f[1]), 'форма «plan» описана в js/shared.js (одна на сайт и сервер)');
  ok(!/pre-checked|checked/.test(shared.formHTML('plan', {}).replace(/name="agree"/, '')), 'согласие на обработку данных не отмечено заранее');
  for (const f of ['plan', 'src']) ok(fs.readFileSync(path.join(ROOT, 'server/lib/leads.js'), 'utf8').includes(f === 'plan' ? "plan: 'Стартовый подбор'" : "src: lead.src"), 'сервер знает ' + (f === 'plan' ? 'тип заявки «plan»' : 'поле источника src'));

  /* честность текстов: нет таймеров «акции», дефицита, «сейчас смотрят», отзывов и стыдящих отказов */
  const allText = [];
  (function walk(o) { if (typeof o === 'string') allText.push(o); else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (!/^_/.test(k)) walk(o[k]); }); })(SALES);
  const BAD = /осталось\s+\d|остал(?:ось|ись)\s+(?:всего|только)|последни[еий]\s+(?:мест|штук|упаков)|только\s+сегодня|успейте|не\s+упустите|пока\s+не\s+ушли|предложение\s+действует\s+до|сейчас\s+(?:смотрят|просматривают)|\d+\s+(?:человек|клиентов|специалистов)\s+(?:уже\s+)?(?:купил|заказал|смотр)|уже\s+выбрал[иа]|отзыв(?:ы|ов)?\s+клиентов|гарантир(?:уем|ует)\s+результат|100\s*%\s+результат|нет,\s+я\s+не\s+хочу|не\s+хочу\s+(?:экономить|зарабатывать)|таймер|обратный\s+отсчёт/i;
  ok(!allText.some(t => BAD.test(t)), 'в data/sales.json нет «тёмных паттернов»: дефицита, давления временем, выдуманных отзывов, стыдящих отказов', allText.filter(t => BAD.test(t)));
  const jsSrc = fs.readFileSync(path.join(ROOT, 'js/sales.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/setInterval|countdown|Math\.floor\(Math\.random\(\)\s*\*\s*\d+\)\s*\+\s*\d+/i.test(jsSrc), 'в js/sales.js нет таймеров «акции» и случайных счётчиков');
  const nums = (allText.join(' ').match(/\d[\d\s ]*(?:₽|%)/g) || []).map(s => s.replace(/[\s ]/g, ''));
  const real = new Set(); SITE.discounts.forEach(d => { real.add(d.pct + '%'); real.add(d.from + '₽'); });
  ok(nums.every(n => real.has(n)), 'все суммы и проценты в текстах продающего слоя берутся из data/site.json → discounts', nums.filter(n => !real.has(n)));

  /* главная: герой, орбита, вступление и всё до развилки — прежние; после развилки отличается только блок «Для кого» (адресные кнопки) */
  { let base = ''; for (const ref of ['origin/pre-sales-rollback', 'pre-sales-rollback']) { try { base = cp.execFileSync('git', ['show', ref + ':index.html'], {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); break; } catch (e) {} }
    if (!base) console.log('  – нет ссылки pre-sales-rollback в git: сравнение главной с прежней версией пропущено');
    else {
      const norm = h => h.replace(/\?v=[0-9a-f]{8}/g, '').replace(/ data-v="[0-9a-f]{8}"/g, '').split('\n').filter(l => !/sales(-pages)?\.(css|js)/.test(l)).join('\n');
      const old = norm(base), cur = norm(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
      const fi = cur.indexOf('<section class="rd-sec sx-fork"'), oi = old.indexOf('<section class="sec rd-about"'), ci = cur.indexOf('<section class="sec rd-about"');
      ok(fi > 0 && cur.slice(0, fi) === old.slice(0, oi), 'вступление, герой с орбитой брендов и бегущая строка — побайтно как до продающего слоя', {fi, oi});
      const au = h => h.slice(h.indexOf('<section class="rd-sec rd-clinical rd-aud"'), h.indexOf('<section class="rd-sec rd-news"'));
      const restOld = old.slice(oi).replace(au(old), ''), restNew = cur.slice(ci).replace(au(cur), '');
      ok(restOld === restNew, 'остальные разделы главной не изменились (кроме адресных кнопок в блоке «Для кого»)', {a: restOld.length, b: restNew.length});
    } }

  /* ================= браузер ================= */
  const S = await H.boot({}); const admin = await S.admin();
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const base = 'http://127.0.0.1:' + S.port + '/';
  const mk = async o => {
    o = o || {}; const ctx = await b.newContext({viewport: o.mobile ? {width: 390, height: 844} : {width: 1280, height: 860}, isMobile: !!o.mobile, hasTouch: !!o.mobile, locale: 'ru-RU', permissions: ['clipboard-read', 'clipboard-write']});
    await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await ctx.route('**/astreya/**', r => r.continue({url: r.request().url().replace('/astreya/', '/')}));          // 404.html ссылается на ресурсы от корня сайта (/astreya/…)
    await ctx.addInitScript(sp => { window.ASTREYA_MOTION_SPEED = sp; }, o.speed || 8);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.|status of (429|503)|404 \(Not Fo/.test(m.text())) p.errs.push(m.text()); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    p.open = async url => { await p.goto(base + url); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await p.waitForSelector('html.ready', {timeout: 20000}); await wait(500); };
    p.scrollPct = async f => { await p.evaluate(f => window.scrollTo(0, Math.max(1, (document.documentElement.scrollHeight - innerHeight) * f)), f); await wait(1000); };
    p.barText = () => p.evaluate(() => { const e = document.getElementById('sx-bar'); return e && !e.hidden && e.offsetParent !== null ? e.innerText.replace(/\s+/g, ' ').trim() : null; });
    p.sx = () => p.evaluate(() => document.querySelectorAll('[class*="sx-"], #sx-bar, [data-sx-sec], .plan, [data-plan-app] > *').length);
    p.idle = () => p.waitForFunction(() => { const f = document.getElementById('asst-form'); return f && !f.classList.contains('busy'); }, null, {timeout: 25000});
    p.ask = async q => { if (!(await p.evaluate(() => document.body.classList.contains('asst-open')))) { await p.click('#asst-fab'); await p.waitForSelector('#asst-in', {state: 'visible'}); await wait(600); await p.idle(); } await p.fill('#asst-in', q); await p.keyboard.press('Enter'); await p.idle(); await wait(200); };
    p.lastBot = () => p.evaluate(() => { const rows = [...document.querySelectorAll('#asst-log .asst-m.asst-b')].filter(r => !r.classList.contains('asst-typing')), r = rows[rows.length - 1]; if (!r) return null; return {text: r.querySelector('.asst-tx').textContent, links: [...r.querySelectorAll('.asst-tx a')].map(a => a.getAttribute('href')), html: r.innerHTML, btns: [...r.querySelectorAll('.asst-acts button, .asst-acts a')].map(x => ({t: x.textContent.trim(), act: x.getAttribute('data-act')}))}; });
    return p;
  };
  const submitForm = async (p, fields) => {
    await p.waitForSelector('#modal.open form', {timeout: 5000});
    for (const [k, v] of Object.entries(fields || {})) await p.fill('#modal form [name=' + k + ']', v);
    await p.check('#modal form input[name=agree]'); await p.click('#modal form button[type=submit]'); await p.waitForSelector('#modal .ok', {timeout: 8000});
  };
  const lastLead = async () => { const r = (await admin.get('/api/leads?status=all')).json; const id = (r.items || r.leads || r.list || [])[0]; return id ? (await admin.get('/api/leads/' + id.id)).json : null; };

  const today = new Date().toISOString().slice(0, 10);

  /* ================= B. Главная и страницы без продающего слоя ================= */
  console.log('\n[B. Главная: развилка; страницы без слоя: 404, документы]');
  for (const mobile of [false, true]) {
    const tag = mobile ? '(телефон)' : '(компьютер)';
    let p = await mk({mobile, speed: 8});
    await p.goto(base + 'index.html'); await wait(6000);
    await p.evaluate(() => window.scrollTo(0, 2500)); await wait(1500); await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(1500);
    ok(await p.evaluate(() => !!document.querySelector('.sx-fork') && document.querySelectorAll('.sx-door').length === 2), 'главная ' + tag + ': развилка «Учиться / Закупать» на месте, две двери');
    ok(!(await p.evaluate(() => !!document.getElementById('sx-bar'))), 'главная ' + tag + ': плавающей панели нет (у главной своя развилка)');
    ok(await p.evaluate(() => !document.querySelector('.sx-next, .sx-trust, .sx-sec')), 'главная ' + tag + ': общих блоков «Что дальше / Доверие» нет');
    ok(p.errs.length === 0, 'главная ' + tag + ': ошибок в консоли нет', p.errs);
    await p.context().close();
    p = await mk({mobile});
    for (const u of ['privacy.html', 'terms.html', '404.html']) {
      await p.open(u); await p.scrollPct(.6); await wait(1800);
      ok(await p.sx() === 0 && (await p.barText()) === null, u + ' ' + tag + ': продающего слоя нет');
    }
    await p.context().close();
  }
  { const p = await mk(); const ev0 = D.events.find(e => e.date >= today) || D.events[0];
    await p.goto(base + 'index.html'); await wait(5500);
    const fk = await p.evaluate(() => ({title: (document.querySelector('[data-sx-ev-title]') || {}).textContent, ref: (document.querySelector('.sx-door-learn [data-sx-cta]') || {}).getAttribute && document.querySelector('.sx-door-learn [data-sx-cta]').getAttribute('data-ref'), buy: (document.querySelector('.sx-door-buy [data-sx-cta]') || {}).getAttribute('href'), ladder: [...document.querySelectorAll('.sx-ladder li')].map(l => l.querySelector('b').textContent), pearl: document.querySelector('.sx-door-buy .sx-big b').textContent}));
    ok(await p.evaluate(sel => { const circles = sel => [...document.querySelectorAll(sel + ' *')].filter(e => { const r = e.getBoundingClientRect(), v = getComputedStyle(e).borderTopLeftRadius, br = /%$/.test(v) ? parseFloat(v) / 100 * r.width : parseFloat(v) || 0; return r.width > 24 && r.height > 24 && Math.abs(r.width - r.height) < 3 && br >= r.width / 2 - 1; }).length; return circles(sel); }, '.sx-fork') === 0, 'главная: в развилке нет кругов и жемчужин (по просьбе заказчика — прямоугольные карточки)');
    ok(fk.ref === ev0.id && fk.title === ev0.title, 'развилка показывает ближайший семинар из расписания', fk);
    ok(/start\.html/.test(fk.buy || ''), 'вторая дверь ведёт в стартовый подбор', fk.buy);
    ok(fk.ladder.join() === SITE.discounts.map(d => d.pct + '%').join() && fk.pearl === Math.max.apply(null, SITE.discounts.map(d => d.pct)) + '%', 'ступени скидок и «до N %» — из data/site.json', fk);
    await p.evaluate(() => document.querySelector('.sx-door-learn [data-sx-cta]').scrollIntoView({block: 'center'})); await wait(900);
    await p.click('.sx-door-learn [data-sx-cta]'); await p.waitForSelector('#modal.open form[data-form="seminar"]');
    ok(await p.evaluate(id => document.querySelector('#modal form').getAttribute('data-ref').length > 0, ev0.id), 'кнопка «Записаться» открывает запись на это мероприятие');
    await p.keyboard.press('Escape'); await wait(500);
    ok(await p.evaluate(() => [...document.querySelectorAll('.rd-aud-item a.lnk')].slice(0, 3).every(a => /start\.html\?r=/.test(a.getAttribute('href')))), 'в блоке «Для кого»: косметологам, клиникам и салонам — адресный подбор под роль');
    await p.context().close(); }

  /* ================= C. Стартовый подбор ================= */
  console.log('\n[C. Стартовый подбор: от первого вопроса до заявки]');
  let ctx1 = await mk(); let p = ctx1;
  await p.open('start.html?v=planFlow:four');          // полный путь из четырёх вопросов (с ролью); короткий — по умолчанию, проверяется ниже
  ok(await p.evaluate(() => document.querySelectorAll('h1').length === 1 && !!document.querySelector('[data-plan-app] .plan-card')), 'страница: один заголовок h1, первый вопрос показан');
  ok((await p.textContent('.plan-prog-t')).includes('Шаг 1 из 4'), 'прогресс «Шаг 1 из 4»');
  ok(await p.evaluate(() => [...document.querySelectorAll('.plan-opt')].every(o => o.getBoundingClientRect().height >= 44)), 'все варианты ответа выше 44 px (удобно нажимать)');
  ok(!(await p.evaluate(() => !!document.getElementById('sx-bar') && !document.getElementById('sx-bar').hidden)), 'на самой странице подбора панель следующего шага не показывается');
  await wait(6500); await p.mouse.move(200, 5); await wait(500);
  ok(!(await p.evaluate(() => { const n = document.getElementById('g-nudge'); return !!n && !n.hidden; })), 'на странице подбора подсказка Стеллы «Не знаете, что выбрать?» не появляется (человек уже выбирает)');
  await p.click('.plan-opt[data-v="salon"]'); await wait(700);
  ok((await p.textContent('.plan-prog-t')).includes('Шаг 2 из 4'), 'после выбора роли — автопереход ко второму шагу');
  const taskIds = await p.evaluate(() => [...document.querySelectorAll('.plan-opt')].map(o => o.getAttribute('data-v')));
  ok(await p.evaluate(() => document.querySelector('.plan-next').disabled), 'кнопка «Далее» неактивна, пока не выбрана ни одна задача');
  for (const id of taskIds.slice(0, 3)) await p.click('.plan-opt[data-v="' + id + '"]');
  ok((await p.evaluate(() => [...document.querySelectorAll('.plan-opt[aria-disabled="true"]')].length)) === taskIds.length - 3, 'можно выбрать не больше трёх задач (остальные недоступны)');
  await p.click('.plan-opt[data-v="' + taskIds[0] + '"]'); await p.click('.plan-opt[data-v="' + taskIds[3] + '"]');
  ok(await p.evaluate(ids => ids.every(i => document.querySelector('.plan-opt[data-v="' + i + '"]').getAttribute('aria-checked') === 'true'), [taskIds[1], taskIds[2], taskIds[3]]), 'снять выбор и выбрать другую задачу можно');
  ok(await p.evaluate(() => document.querySelectorAll('.plan-board .plan-btile').length >= 1 && /Подходящие линейки/.test(document.querySelector('.plan-board').textContent)), 'по мере выбора задач на «доске линеек» появляются подходящие линейки');
  ok(/осталось/.test(await p.textContent('.plan-prog-t')), 'в прогрессе — «осталось N вопроса» (градиент цели)');
  await p.click('.plan-back').catch(() => {}); // на втором шаге «Назад» ведёт к роли
  ok((await p.textContent('.plan-prog-t')).includes('Шаг 1 из 4'), 'кнопка «Назад» возвращает на предыдущий шаг');
  ok(await p.evaluate(() => document.querySelector('.plan-opt[data-v="salon"]').getAttribute('aria-checked') === 'true'), 'ответ при возврате сохранён');
  await p.click('.plan-opt[data-v="salon"]'); await wait(700);
  ok(await p.evaluate(() => document.querySelectorAll('.plan-opt[aria-checked="true"]').length === 3), 'выбранные задачи сохранились после возврата');
  await p.click('.plan-next'); await wait(500);
  await p.click('.plan-opt[data-v="both"]'); await wait(700);
  ok((await p.textContent('.plan-prog-t')).includes('Шаг 4 из 4'), 'четвёртый шаг — город');
  ok(await p.evaluate(() => !!document.querySelector('[data-pl="skip"]')), 'город можно пропустить');
  await p.click('.plan-opt[data-v="Москва"]'); await p.click('.plan-next'); await wait(800);
  ok(await p.evaluate(() => !!document.querySelector('.plan-res') && /Ваш стартовый план/.test(document.querySelector('.plan-res h2').textContent)), 'показан результат: «Ваш стартовый план»');
  const res = await p.evaluate(() => ({brands: document.querySelectorAll('.plan-brand').length, prods: document.querySelectorAll('.plan-prods li').length, evs: [...document.querySelectorAll('.plan-evs li')].map(li => li.querySelector('.plan-en').getAttribute('href')), sum: [...document.querySelectorAll('.plan-sum li')].map(l => l.textContent), tiers: [...document.querySelectorAll('.plan-tier')].map(t => t.textContent.replace(/\s+/g, ' ')), main: document.querySelector('.plan-main').textContent.trim(), fine: document.querySelector('.plan-fine').textContent}));
  ok(res.brands >= 1 && res.brands <= 3 && res.prods >= 1 && res.prods <= 6, 'в плане 1–3 линейки и 1–6 товаров', res);
  ok(res.tiers.length === SITE.discounts.length, 'условия закупки — пороги скидок из данных сайта', res.tiers);
  ok(/ориентировочный/i.test(res.fine) && /менеджер/i.test(await p.textContent('.plan-res')), 'под планом честная оговорка: подбор ориентировочный, условия подтверждает менеджер');
  ok(await p.evaluate(t => Astreya.sales.compute({role: '', tasks: ['acne', 'pigment', 'antiage'], goal: 'both', city: '', volume: '', brand: ''}).events.every(e => e.date >= t), today), 'в плане только будущие мероприятия (прошедшие не предлагаются)');
  ok(await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('astreya:plan') || 'null'); return !!(l && l.done && l.st.tasks.length === 3); }), 'план сохранён в браузере (localStorage) — можно вернуться позже');
  ok(await p.evaluate(() => { const s = Astreya.sales.plan(); return !!(s && s.summary.length >= 3 && s.products.length); }), 'Стелле доступна сводка плана (A.sales.plan)');
  /* добавить товары в список запроса — только по нажатию */
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:rl') || '[]')).length === 0), 'до нажатия «Добавить товары…» список запроса пуст (ничего не добавляется само)');
  await p.click('[data-pl="addall"]'); await wait(400);
  ok(await p.evaluate(n => (JSON.parse(localStorage.getItem('astreya:rl') || '[]')).length === n, res.prods), 'по нажатию все товары плана добавлены в список запроса', await p.evaluate(() => localStorage.getItem('astreya:rl')));
  /* ссылка на план */
  await p.click('[data-pl="copy"]'); await wait(500);
  const link = await p.evaluate(() => navigator.clipboard.readText());
  ok(/start\.html\?/.test(link) && /t=/.test(link), 'ссылка на план скопирована и содержит параметры', link);
  const pShare = await p.context().newPage(); pShare.errs = []; await pShare.route(/^https:\/\/fonts\./, r => r.abort());
  await pShare.addInitScript(() => { window.ASTREYA_MOTION_SPEED = 8; }); await pShare.goto(link); await pShare.waitForSelector('html.ready'); await wait(600);
  ok(await pShare.evaluate(() => !!document.querySelector('.plan-res')), 'открыв ссылку (с чистым хранилищем), получаем тот же план');
  await pShare.close();
  /* перезагрузка — план на месте; повторный заход — результат, а не вопросы заново */
  await p.reload(); await p.waitForSelector('html.ready'); await wait(600);
  ok(await p.evaluate(() => !!document.querySelector('.plan-res')), 'после перезагрузки показан сохранённый план');
  /* заявка с планом */
  await p.click('[data-pl="main"]'); await p.waitForSelector('#modal.open form[data-form="plan"]');
  const pre = await p.evaluate(() => ({msg: document.querySelector('#modal form [name=msg]').value, agree: document.querySelector('#modal form [name=agree]').checked, city: document.querySelector('#modal form [name=city]').value, ctx: document.querySelector('#modal .ctx') && document.querySelector('#modal .ctx').textContent}));
  ok(/Стартовый подбор/.test(pre.msg) && /Задачи:/.test(pre.msg) && /Линейки:/.test(pre.msg), 'в заявку подставлен готовый план (посетитель видит и может править текст)', pre.msg.slice(0, 160));
  ok(pre.agree === false, 'согласие на обработку данных не отмечено заранее');
  ok(pre.city === 'Москва' && /Стартовый подбор/.test(pre.ctx || ''), 'город и тема заявки подставлены', pre);
  await submitForm(p, {name: 'Тест Подбор', phone: '+7 916 111-22-33', email: 'plan@example.com'});
  ok(await p.evaluate(() => !!document.querySelector('#modal .ok .sx-after a')), 'после отправки показан блок «что дальше» со ссылкой');
  const lead = await lastLead();
  ok(lead && lead.type === 'plan', 'в базе заявок — заявка типа «plan»', lead && lead.type);
  ok(lead && /p=start/.test(lead.src || '') && /via=plan-main/.test(lead.src || ''), 'у заявки есть источник: страница и кнопка («p=start; via=plan-main»)', lead && lead.src);
  ok(lead && /Задачи:/.test(lead.msg || ''), 'менеджер получает план в тексте заявки');
  p.errs.length ? ok(false, 'ошибок в консоли нет', p.errs) : ok(true, 'ошибок в консоли нет');
  /* начать заново */
  await p.keyboard.press('Escape'); await wait(500);
  await p.click('[data-pl="again"]'); await wait(500);
  ok(await p.evaluate(() => !localStorage.getItem('astreya:plan') && !!document.querySelector('.plan-opt[data-v="salon"]')), '«Начать заново» стирает сохранённый план и возвращает к первому вопросу');
  await p.context().close();

  /* вариант по умолчанию (выбор арены) и телефон: короткий путь без вопроса о роли */
  p = await mk({mobile: true}); await p.open('start.html');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'телефон: нет горизонтальной прокрутки на первом шаге');
  const flowN = SALES.planner.flows[SALES.variants.planFlow].length;
  ok((await p.textContent('.plan-prog-t')).includes('Шаг 1 из ' + flowN), 'вариант по умолчанию (' + SALES.variants.planFlow + '): «Шаг 1 из ' + flowN + '»');
  const first = await p.evaluate(() => document.querySelector('.plan-card').getAttribute('data-step'));
  ok(first === SALES.planner.flows[SALES.variants.planFlow][0], 'первый вопрос соответствует выбранному потоку', first);
  const tid = await p.evaluate(() => document.querySelector('.plan-opt').getAttribute('data-v'));
  await p.click('.plan-opt[data-v="' + tid + '"]'); await p.click('.plan-next'); await wait(500);
  await p.reload(); await p.waitForSelector('html.ready'); await wait(700);
  ok(await p.evaluate(() => !!document.querySelector('.plan-resume') && /Шаг 2/.test(document.querySelector('.plan-prog-t').textContent)), 'незаконченный подбор: после перезагрузки — «Продолжаем с того места, где остановились», шаг 2');
  ok(await p.evaluate(() => document.querySelectorAll('.plan-opt[aria-checked="true"]').length === 0 && !!document.querySelector('.plan-board') && !document.querySelector('.plan-opt[data-v="range"]') === false), 'после возврата выбранные задачи не потерялись, доска линеек на месте');
  await p.click('.plan-opt[data-v="range"]'); await wait(800); await p.click('[data-pl="skip"]'); await wait(900);
  ok(await p.evaluate(() => !!document.querySelector('.plan-res') && document.documentElement.scrollWidth <= innerWidth + 1), 'телефон: результат построен (город пропущен), горизонтальной прокрутки нет');
  ok(await p.evaluate(() => { const m = document.querySelector('.plan-main'); const r = m.getBoundingClientRect(); return r.height >= 44 && r.width > 200; }), 'телефон: главная кнопка плана крупная (≥ 44 px)');
  ok(await p.evaluate(() => [...document.querySelectorAll('.plan-res button, .plan-res a.btn')].every(e => e.getBoundingClientRect().height >= 44 || e.classList.contains('btn-lnk'))), 'телефон: все кнопки результата не ниже 44 px');
  await p.context().close();

  /* ================= D. Свой ход у каждой страницы ================= */
  console.log('\n[D. Свой ход у каждой страницы]');
  const prod = D.products.find(x => x.brand === 'dermatime') || D.products[0], ev = D.events.find(e => e.date >= today) || D.events[0];
  p = await mk();

  /* --- каталог: подборки по задачам --- */
  await p.open('catalog.html');
  const kits = await p.evaluate(() => ({n: document.querySelectorAll('.sx-kit').length, packs: document.querySelectorAll('.sx-kit .pk').length, gen: document.querySelectorAll('.sx-next, .sx-trust, .sx-sec').length, empty: !!document.querySelector('#cat-empty .sx-rescue')}));
  ok(kits.n >= 4 && kits.packs >= kits.n * 2, 'каталог: подборки по задачам — карточки с «наборами» из упаковок', kits);
  ok(kits.gen === 0, 'каталог: общих блоков «Что дальше / Доверие» нет');
  ok(kits.empty, 'каталог: пустая выдача спасает человека (подбор и Стелла)');
  const kitIds = await p.evaluate(() => document.querySelector('.sx-kit').getAttribute('data-ids').split(','));
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('astreya:rl') || '[]')).length === 0), 'каталог: до нажатия список запроса пуст');
  await p.click('.sx-kit [data-kit-add]'); await wait(500);
  ok(await p.evaluate(ids => { const l = JSON.parse(localStorage.getItem('astreya:rl') || '[]'); return ids.every(i => l.includes(i)); }, kitIds), 'каталог: «В список запроса» добавляет весь набор (только по нажатию)');
  ok(await p.evaluate(() => document.querySelector('.sx-kit').classList.contains('on') && /Уже в списке/.test(document.querySelector('.sx-kit [data-kit-add]').textContent) && /Собрано в запросе/.test(document.querySelector('[data-kit-meta]').textContent)), 'каталог: карточка отмечается, внизу — «Собрано в запросе: N»');
  const task0 = await p.evaluate(() => document.querySelector('.sx-kit').getAttribute('data-task'));
  await p.click('.sx-kit [data-kit-show]'); await wait(800);
  ok(await p.evaluate(t => document.querySelector('#f-task').value === t && document.querySelectorAll('#cat-grid .pcard:not([hidden])').length > 0, task0), 'каталог: «Показать в каталоге» выставляет фильтр по задаче');
  await p.context().close();

  /* --- бренды и бренд --- */
  p = await mk(); await p.open('brands.html');
  const chips = await p.evaluate(() => ({n: [...document.querySelectorAll('.bl-card .sx-bchip')].length, t: (document.querySelector('.sx-bchip') || {}).textContent}));
  const brandsWithEv = new Set(D.events.filter(e => e.date >= today).map(e => e.b)).size;
  ok(chips.n === brandsWithEv && /Семинар/.test(chips.t || ''), 'бренды: ближайший семинар — на карточке каждого бренда, у которого он есть', {chips, brandsWithEv});
  const evb = D.events.find(e => e.date >= today).b;
  await p.open('brands/' + evb + '.html');
  const route = await p.evaluate(() => ({st: document.querySelectorAll('.sx-station').length, first: !!document.querySelector('.sx-station.first'), gen: document.querySelectorAll('.sx-next, .sx-trust, .sx-sec').length, badge: (document.querySelector('.sx-st-top em') || {}).textContent}));
  ok(route.st === 3 && route.first && /Проще начать/.test(route.badge || ''), 'бренд: «Путь с брендом» — три станции, первая (семинар) отмечена как проще всего начать', route);
  ok(route.gen === 0, 'бренд: общих блоков нет');
  ok(await p.evaluate(sel => { const circles = sel => [...document.querySelectorAll(sel + ' *')].filter(e => { const r = e.getBoundingClientRect(), v = getComputedStyle(e).borderTopLeftRadius, br = /%$/.test(v) ? parseFloat(v) / 100 * r.width : parseFloat(v) || 0; return r.width > 24 && r.height > 24 && Math.abs(r.width - r.height) < 3 && br >= r.width / 2 - 1; }).length; return circles(sel); }, '.sx-route-sec') === 0, 'бренд: в маршруте нет нумерованных кругов (по просьбе заказчика — прямоугольные карточки)');
  await p.click('.sx-station.first [data-sx-act="seminar"]'); await p.waitForSelector('#modal.open form[data-form="seminar"]');
  ok(await p.evaluate(() => document.querySelector('#modal form').getAttribute('data-ref').length > 0), 'бренд: «Записаться» открывает запись на ближайший семинар бренда');
  await p.keyboard.press('Escape'); await wait(500);
  await p.click('.sx-station [data-sx-act="scroll-products"]'); await wait(900);
  ok(await p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(x => /^Товары/.test(x.textContent)); const r = h && h.getBoundingClientRect(); return !!r && r.top < innerHeight && r.top > -200; }), 'бренд: «К товарам» прокручивает к списку товаров бренда');
  await p.context().close();

  /* --- товар --- */
  p = await mk({mobile: true}); await p.open('products/' + prod.slug + '.html');
  const pr = await p.evaluate(() => ({hook: !!document.querySelector('.sx-hook'), steps: document.querySelectorAll('.sx-after-steps li').length, gen: document.querySelectorAll('.sx-next, .sx-trust, .sx-sec').length, closing: (document.querySelector('.cta-band h2') || {}).textContent, side: !!document.querySelector('.p-side .sx-after-steps')}));
  ok(pr.hook && pr.steps === 3 && pr.side, 'товар: «Освоить в работе» рядом с кнопкой и «Что будет после запроса» (3 шага) рядом с формой запроса', pr);
  ok(pr.gen === 0 && /Нужны условия по «/.test(pr.closing || '') && /Elastense|[A-Za-zА-Яа-я]/.test(pr.closing), 'товар: завершающий призыв — про этот товар, а не общий «Станьте партнёром»', pr.closing);
  await p.click('.sx-hook [data-sx-act="seminar"]'); await p.waitForSelector('#modal.open form[data-form="seminar"]');
  ok(true, 'товар: «Записаться» из крючка открывает запись на семинар бренда');
  await p.keyboard.press('Escape'); await wait(500);
  await p.scrollPct(.25); await wait(700);              // между модулями страницы: пока на экране «Освоить в работе», «Что будет после запроса» или завершающий призыв, панель уступает им место
  const bt = await p.barText();
  ok(bt && bt.indexOf(prod.name) >= 0, 'товар: после прокрутки появляется панель с названием товара', bt);
  ok(/ни к чему не обязывает/.test(bt || ''), 'товар: у кнопки заявки — «ни к чему не обязывает»');
  const geo = await p.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width || b.height ? {l: b.left, t: b.top, r: b.right, b: b.bottom} : null; }; const hit = (a, c) => !!(a && c && a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t); const bar = r('#sx-bar'); return {fab: hit(bar, r('.asst-fab')), qc: hit(bar, r('.qc')), tip: hit(bar, r('.asst-tip')), h: bar && bar.b - bar.t, inView: bar && bar.b <= innerHeight + 1 && bar.l >= 0 && bar.r <= innerWidth + 1, btn: document.querySelector('#sx-bar .sx-bar-cta').getBoundingClientRect().height}; });
  ok(!geo.fab && !geo.qc && !geo.tip && geo.inView && geo.h < 150 && geo.btn >= 40, 'товар: панель не перекрывает Стеллу и быструю связь, целиком на экране', geo);
  await p.click('#sx-bar .sx-bar-x'); await wait(500);
  ok((await p.barText()) === null, 'панель закрывается крестиком');
  await p.goto(base + 'brands/dermatime.html'); await p.waitForSelector('html.ready'); await wait(500); await p.scrollPct(.6); await wait(800);
  ok((await p.barText()) === null, 'закрытая панель не появляется снова на других страницах сессии');
  await p.context().close();
  p = await mk({mobile: true}); await p.open('products/' + prod.slug + '.html'); await p.scrollPct(.25); await wait(700);
  await p.click('#sx-bar .sx-bar-cta'); await p.waitForSelector('#modal.open form[data-form="product"]');
  await submitForm(p, {name: 'Тест Панель', phone: '+7 916 222-33-44', email: 'bar@example.com', city: 'Москва'});
  const l2 = await lastLead();
  ok(l2 && /p=product/.test(l2.src || '') && /via=bar/.test(l2.src || ''), 'источник заявки с панели: «p=product; via=bar»', l2 && l2.src);
  ok(await p.evaluate(() => !!document.querySelector('#modal .ok .sx-after')), 'после заявки по товару показан блок «Хотите уточнить больше?»');
  await p.context().close();

  /* --- обучение: календарь встреч --- */
  p = await mk(); await p.open('training.html');
  const upc = D.events.filter(e => e.date >= today);
  const tl = await p.evaluate(() => ({cal: !!document.querySelector('.sx-cal .sx-cal-grid'), cols: getComputedStyle(document.querySelector('.sx-cal-grid')).gridTemplateColumns.split(' ').length, wd: document.querySelectorAll('.sx-cal-wd span').length, month: (document.querySelector('.sx-cal-m') || {}).textContent, near: !!document.querySelector('.sx-cd.ev.near'), in: (document.querySelector('.sx-tl-in') || {}).textContent, chips: [...document.querySelectorAll('[data-sx-city]')].map(b => b.getAttribute('data-sx-city')), gen: document.querySelectorAll('.sx-next, .sx-trust, .sx-sec, .sx-ruler, .sx-flag').length, closing: (document.querySelector('.cta-band h2') || {}).textContent}));
  ok(tl.cal && tl.cols === 7 && tl.wd === 7 && tl.near && /20\d\d/.test(tl.month || ''), 'обучение: «Календарь встреч» — настоящая сетка месяца (7 дней), ближайшее мероприятие подсвечено', tl);
  const walk = async () => { let rows = 0, evCells = 0, guard = 0; const months = []; for (;;) { const r = await p.evaluate(() => ({rows: document.querySelectorAll('.sx-cal-row').length, ev: document.querySelectorAll('.sx-cd.ev').length, m: document.querySelector('.sx-cal-m').textContent, days: document.querySelectorAll('.sx-cal-grid .sx-cd:not(.off)').length, end: document.querySelector('[data-cal-nav="1"]').disabled})); rows += r.rows; evCells += r.ev; months.push(r); if (r.end || ++guard > 12) break; await p.click('[data-cal-nav="1"]'); await wait(250); } return {rows, evCells, months}; };
  const w1 = await walk();
  ok(w1.rows === Math.min(12, upc.length) && w1.evCells >= 1 && w1.evCells <= w1.rows && w1.months.every(m => m.days >= 28 && m.days <= 31), 'обучение: листая месяцы, видны все ближайшие мероприятия (и в сетке, и списком), в месяце 28–31 день', w1);
  ok(await p.evaluate(() => document.querySelector('[data-cal-nav="-1"]').disabled === false), 'обучение: после листания вперёд доступна стрелка «назад»');
  while (await p.evaluate(() => !document.querySelector('[data-cal-nav="-1"]').disabled)) { await p.click('[data-cal-nav="-1"]'); await wait(200); }
  ok(await p.evaluate(() => { const t = document.querySelector('.sx-cd.today'); return !t || /^\d+$/.test(t.textContent); }), 'обучение: сегодняшний день в календаре отмечен');
  ok(/сегодня|завтра|через/.test(tl.in || ''), 'обучение: «через N дней» считается от сегодняшней даты', tl.in);
  ok(tl.gen === 0 && /Начните с семинара/.test(tl.closing || ''), 'обучение: общих блоков и «линейки» нет, завершающий призыв — «Начните с семинара»', tl.closing);
  await p.click('.sx-cd.ev'); await p.waitForFunction(() => document.body.getAttribute('data-page') === 'event', null, {timeout: 15000});
  ok(await p.evaluate(() => !!document.querySelector('.sx-ticket')), 'обучение: нажатие на отмеченный день открывает мероприятие (мягкий переход), там «Как проходит запись»');
  await p.goBack(); await p.waitForFunction(() => document.body.getAttribute('data-page') === 'training', null, {timeout: 15000}); await wait(1200);
  const cityNo = (D.sales.cities || []).filter(c => c !== 'Онлайн').find(c => !upc.some(e => e.city === c));
  const cityYes = upc.map(e => e.city).find(c => c !== 'Онлайн');
  await p.click('[data-sx-city="' + cityYes + '"]'); await wait(400);
  ok(await p.evaluate(c => { const r = [...document.querySelectorAll('.sx-cal-row .sx-cal-t b')]; return r.length > 0 && r.every(b => b.textContent.indexOf(c) === 0 || /^Онлайн/.test(b.textContent)); }, cityYes), 'обучение: выбор города оставляет его мероприятия и онлайн', cityYes);
  if (cityNo) {
    await p.click('[data-sx-city="' + cityNo + '"]'); await wait(400);
    ok(await p.evaluate(() => !!document.querySelector('[data-sx-tl-next] [data-sx-wait]')), 'обучение: в городе без дат предлагается лист ожидания', cityNo);
    await p.click('[data-sx-tl-next] [data-sx-wait]'); await p.waitForSelector('#modal.open form');
    ok(await p.evaluate(() => /Лист ожидания/.test(document.querySelector('#modal .ctx').textContent)), 'обучение: лист ожидания открывает вопрос с городом');
    await p.keyboard.press('Escape'); await wait(500);
  } else console.log('  – в данных у всех городов есть даты: проверка листа ожидания пропущена');
  await p.click('[data-sx-city="' + cityYes + '"]'); await wait(300);
  ok(await p.evaluate(c => localStorage.getItem('astreya:city') === JSON.stringify(c), cityYes), 'обучение: выбранный город запоминается (для «Вашего региона»)');
  await p.context().close();

  /* --- мероприятие --- */
  p = await mk(); await p.open('training/' + ev.slug + '.html');
  const et = await p.evaluate(() => ({steps: document.querySelectorAll('.sx-ticket .sx-steps3 li').length, col: !!document.querySelector('[data-sx-colleague]'), after: (document.querySelector('.sx-tk-after a') || {}).getAttribute && document.querySelector('.sx-tk-after a').getAttribute('href'), gen: document.querySelectorAll('.sx-next, .sx-trust, .sx-sec').length}));
  ok(et.steps === 3 && et.col && /start\.html\?b=/.test(et.after || '') && et.gen === 0, 'мероприятие: «Как проходит запись» (билет), «Позвать коллегу», «после семинара — подбор бренда»', et);
  await p.evaluate(() => { navigator.share = undefined; });
  await p.click('[data-sx-colleague]'); await wait(500);
  const invite = await p.evaluate(() => navigator.clipboard.readText());
  ok(invite.indexOf(ev.title) >= 0 && /training\//.test(invite), 'мероприятие: «Позвать коллегу» копирует приглашение со ссылкой', invite.slice(0, 120));
  await p.context().close();

  /* --- партнёры: «Ваш ориентир» --- */
  p = await mk(); await p.open('partners.html');
  const t1 = SITE.discounts[1], t2 = SITE.discounts[0];
  const setRange = v => p.evaluate(v => { const r = document.querySelector('#calc-range'); r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); }, v);
  await setRange(t2.from + 20000); await wait(300);
  let lad = await p.evaluate(() => ({msg: document.querySelector('[data-lad-msg]').textContent, cta: document.querySelector('[data-lad-cta]').textContent, on: document.querySelectorAll('.sx-lad-bars li.on').length}));
  ok(lad.on === 1 && new RegExp('До ' + t1.pct + '% не хватает').test(lad.msg), 'партнёры: на 70 000 ₽ показано «до 10 % не хватает …» (градиент цели)', lad);
  await setRange(SITE.discounts[2].from + 20000); await wait(300);
  lad = await p.evaluate(() => ({msg: document.querySelector('[data-lad-msg]').textContent, on: document.querySelectorAll('.sx-lad-bars li.on').length}));
  ok(lad.on === 3 && /Верхняя ступень/.test(lad.msg), 'партнёры: на верхней ступени — «верхняя ступень ориентира»', lad);
  await setRange(150000); await wait(300);
  await p.click('[data-lad-cta]'); await p.waitForSelector('#modal.open form[data-form="partner"]');
  const pf = await p.evaluate(() => ({ctx: document.querySelector('#modal .ctx').textContent, msg: document.querySelector('#modal form [name=msg]').value}));
  ok(/150/.test(pf.ctx) && /Ориентир первой закупки/.test(pf.msg), 'партнёры: «Запросить условия на 150 000 ₽» — сумма и скидка попадают в заявку', pf);
  await submitForm(p, {name: 'Тест Калькулятор', phone: '+7 916 333-44-55', email: 'calc@example.com', city: 'Москва'});
  const l3 = await lastLead();
  ok(l3 && /via=ladder/.test(l3.src || '') && /150/.test(l3.context || ''), 'партнёры: в заявке источник «via=ladder» и ориентир закупки', l3 && {src: l3.src, ctx: l3.context});
  await p.context().close();

  /* --- новости и статьи --- */
  p = await mk(); await p.open('news.html');
  ok(await p.evaluate(() => [...document.querySelectorAll('.newscard[data-cat="sale"] .sx-nact')].every(a => /Рассчитать скидку/.test(a.textContent)) && document.querySelectorAll('.sx-nact').length >= 4), 'новости: у акций — «Рассчитать скидку», у новинок и обучения — свои действия');
  for (const [slug, cat, rx] of [['skidki-po-obemu-zakupki', 'sale', /выгоду/], ['novinki-dermatime', 'novelty', /новинки/i], ['zapis-na-osennie-seminary', 'edu', /дату/]]) {
    await p.open('news/' + slug + '.html');
    const cl = await p.evaluate(() => (document.querySelector('.cta-band h2') || {}).textContent);
    ok(rx.test(cl || ''), 'статья «' + cat + '»: завершающий призыв по теме', cl);
  }
  await p.open('news/predstavitelstva-v-regionah.html'); ok(/Станьте партнёром/.test(await p.evaluate(() => document.querySelector('.cta-band h2').textContent)), 'статья-новость: прежний призыв партнёрам');
  await p.context().close();

  /* --- компания: «Ваш регион» --- */
  p = await mk(); await p.open('company.html');
  ok(await p.evaluate(() => document.querySelectorAll('[data-sx-reg]').length >= 3 && !!document.querySelector('.sx-reg-card h3')), 'компания: «Ваш регион» — выбор города и карточка офиса');
  await p.click('[data-sx-reg="Санкт-Петербург"]'); await wait(300);
  const rg = await p.evaluate(() => ({h: document.querySelector('.sx-reg-card h3').textContent, tel: document.querySelector('.sx-reg-card a[href^="tel:"]').getAttribute('href'), ev: (document.querySelector('.sx-reg-ev h3') || {}).textContent}));
  ok(rg.tel === 'tel:+79214204735', 'компания: у Санкт-Петербурга — свой телефон', rg);
  ok(!!rg.ev, 'компания: рядом — ближайший семинар в этом городе', rg);
  ok(/Познакомимся/.test(await p.evaluate(() => document.querySelector('.cta-band h2').textContent)), 'компания: завершающий призыв — «Познакомимся на практике»');
  await p.click('[data-sx-region-cb]'); await p.waitForSelector('#modal.open form');
  ok(await p.evaluate(() => document.querySelector('#modal form [name=city]') ? document.querySelector('#modal form [name=city]').value === 'Санкт-Петербург' : true), 'компания: «Перезвоните мне» подставляет выбранный город');
  await p.context().close();

  /* --- контакты и поиск --- */
  p = await mk(); await p.open('contacts.html');
  const cs = await p.evaluate(() => ({s: !!document.querySelector('.sx-status'), t: (document.querySelector('.sx-status b') || {}).textContent, tips: document.querySelectorAll('.sx-tips em').length, bar: !!document.getElementById('sx-bar')}));
  ok(cs.s && /Сейчас/.test(cs.t) && cs.tips === 3, 'контакты: честный статус «на связи / нерабочее время» и подсказка, что указать', cs);
  const ws = await p.evaluate(() => Astreya.salesPages.workStatus('Пн–Пт, 10:00–18:00'));
  ok(ws && typeof ws.on === 'boolean' && ws.start === '10:00' && ws.end === '18:00', 'контакты: часы работы разобраны из данных сайта', ws);
  await p.scrollPct(.6); await wait(1800); ok((await p.barText()) === null, 'контакты: плавающей панели нет (страница сама — конверсионная)');
  await p.open('search.html?q=абракадабраxyz'); await wait(1200);
  ok(await p.evaluate(() => !!document.querySelector('#s-out .empty .sx-rescue') && document.querySelectorAll('.sx-rescue-tasks .chip').length >= 3), 'поиск: пустой результат не тупик — подбор, Стелла и задачи');
  await p.context().close();

  /* --- эксперименты: панель на компьютере --- */
  p = await mk(); await p.open('products/' + prod.slug + '.html?x=barDesktop:off'); await p.scrollPct(.5); await wait(2500);
  ok((await p.barText()) === null, 'компьютер, вариант проверки «off»: панели нет (контрольная группа)');
  await p.context().close();
  p = await mk(); await p.open('products/' + prod.slug + '.html?x=barDesktop:pill');
  let dbt = null; for (const f of [.3, .2, .4, .5, .6, .15]) { await p.scrollPct(f); await wait(900); dbt = await p.barText(); if (dbt) break; }       // панель уступает место ходам страницы — ищем просвет между ними
  ok(dbt && /Запросить/.test(dbt) && await p.evaluate(() => /sx-bar--pill/.test(document.getElementById('sx-bar').className)), 'компьютер, вариант «pill»: компактная панель показана', dbt);
  await p.click('#sx-bar .sx-bar-cta'); await p.waitForSelector('#modal.open'); await wait(400);
  ok((await p.barText()) === null, 'пока открыто окно заявки, панель скрыта');
  await p.keyboard.press('Escape'); await wait(700);
  await p.click('#asst-fab'); await wait(900);
  ok((await p.barText()) === null, 'пока открыт чат Стеллы, панель скрыта');
  await p.context().close();
  p = await mk(); await p.open('products/' + prod.slug + '.html'); await wait(1800);
  let exps = {}; for (const f of [.3, .2, .4, .5, .6, .15]) { await p.scrollPct(f); await wait(700); exps = await p.evaluate(() => JSON.parse(localStorage.getItem('astreya:exp') || '{}')); if (exps.barDesktop) break; }       // вариант назначается, когда панель могла бы появиться (в просвете между ходами страницы)
  ok(['off', 'pill'].includes(exps.barDesktop), 'вариант проверки назначен случайно один раз и запомнен', exps);
  await p.context().close();

  /* ================= E. Мягкие переходы без дублей ================= */
  console.log('\n[E. Мягкие переходы без перезагрузки]');
  p = await mk(); await p.open('catalog.html');
  const nav = async key => { await p.evaluate(k => document.querySelector('a[data-nav="/' + k + '"]').click(), key); await p.waitForFunction(k => document.body.getAttribute('data-page') === k, key, {timeout: 15000}); await wait(1200); };
  await nav('training');
  ok(await p.evaluate(() => document.querySelectorAll('.sx-tl-sec').length === 1 && document.querySelectorAll('.sx-kits').length === 0), 'из каталога в «Обучение»: подборки ушли, лента дат одна');
  await nav('catalog');
  ok(await p.evaluate(() => document.querySelectorAll('.sx-kits').length === 1 && document.querySelectorAll('.sx-tl-sec').length === 0), 'обратно в каталог: подборки одни, без дублей');
  await nav('company');
  ok(await p.evaluate(() => document.querySelectorAll('.sx-region').length === 1), 'в «Компанию»: «Ваш регион» один');
  await p.evaluate(() => document.querySelector('a.logo').click()); await p.waitForFunction(() => document.body.getAttribute('data-page') === 'home', null, {timeout: 15000}); await wait(1500);
  ok(await p.evaluate(() => document.querySelectorAll('.sx-fork').length === 1 && !document.getElementById('sx-bar') || (document.getElementById('sx-bar') || {}).hidden), 'на главную: развилка одна, панели нет');
  ok(p.errs.length === 0, 'при переходах ошибок в консоли нет', p.errs);
  await p.context().close();

  /* ================= F. Стелла ================= */
  console.log('\n[F. Стелла помогает с первым шагом — честно и без давления]');
  p = await mk(); await p.open('catalog.html');
  await p.ask('с чего начать закупки?'); let r = await p.lastBot();
  ok(r && /Стартовый подбор/.test(r.text) && /бесплатн/.test(r.text) && !/(осталось|только сегодня|успейте)/i.test(r.text), 'на «с чего начать закупки?» Стелла предлагает стартовый подбор и бесплатные семинары', r && r.text.slice(0, 160));
  ok(r && /start\.html/.test(r.html), 'в ответе есть ссылка на страницу подбора', r && r.links);
  await p.ask('хочу купить'); r = await p.lastBot();
  ok(r && /корзин/.test(r.text) && /заявк/.test(r.text), 'на «хочу купить» объясняет: корзины нет, заказ начинается с заявки (без выдуманных способов оплаты)', r && r.text.slice(0, 160));
  await p.ask('мне надо подумать'); r = await p.lastBot();
  ok(r && /бесплатн|менеджер|подбор/i.test(r.text) && !/(осталось|только сегодня|успейте|последн)/i.test(r.text), 'на «мне надо подумать» не давит и предлагает малые шаги', r && r.text.slice(0, 160));
  await p.ask('мой план'); r = await p.lastBot();
  ok(r && /Сохранённого плана я пока не вижу|Плана ещё нет/.test(r.text), 'без плана на «мой план» предлагает его собрать', r && r.text.slice(0, 120));
  await p.context().close();
  p = await mk(); await p.open('start.html?v=planFlow:four');
  await p.click('.plan-opt[data-v="salon"]'); await wait(700); const tk1 = await p.evaluate(() => document.querySelector('.plan-opt').getAttribute('data-v')); await p.click('.plan-opt[data-v="' + tk1 + '"]'); await p.click('.plan-next'); await wait(500); await p.click('.plan-opt[data-v="both"]'); await wait(700); await p.click('[data-pl="skip"]'); await wait(900);
  await p.ask('покажи мой план'); r = await p.lastBot();
  ok(r && /Ваш стартовый план/.test(r.text) && /Салон красоты/.test(r.text), 'с сохранённым планом Стелла пересказывает именно его', r && r.text.slice(0, 200));
  ok(r && r.btns.some(x => /подбор от менеджера/i.test(x.t)), 'и предлагает кнопку «Получить подбор от менеджера»', r && r.btns);
  await p.click('[data-pl="ask"]').catch(() => {}); await wait(800);
  await p.context().close();

  /* ================= G. Админка: источник заявки ================= */
  console.log('\n[G. Админка: источник заявки]');
  { const r1 = await admin.get('/api/leads?status=all'); const items = r1.json.items || r1.json.leads || r1.json.list || []; ok(items.length >= 2 && items.every(x => 'src' in x), 'в списке заявок есть поле «src»', items[0]);
    const csv = await admin.get('/api/leads.csv'); ok(csv.status === 200 && /Источник/.test(csv.text), 'в выгрузке CSV есть столбец «Источник»', csv.status);
    const long = await H.request(S.port, 'POST', '/api/lead', {headers: {'X-Forwarded-For': '10.1.1.7', Origin: base.replace(/\/$/, '')}, body: {type: 'question', name: 'A', email: 'a@b.ru', msg: 'тест', consent: true, src: 'x'.repeat(500)}});
    ok(long.status === 200 || long.status === 201, 'сервер принял заявку с длинной меткой', long.status);
    const l3 = await lastLead(); ok(l3 && l3.src && l3.src.length <= 200, 'метка источника обрезается до 200 знаков', l3 && l3.src && l3.src.length); }

  await b.close(); await S.close();
  console.log('\nИтого: ✓ ' + pass + '  ✗ ' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
