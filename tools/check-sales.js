#!/usr/bin/env node
/* Проверка продающего слоя «Путь к закупке» (data/redesign.json → extras.sales) в браузере и на настоящем сервере заявок:
   главная осталась прежней и без новых элементов; стартовый подбор от первого вопроса до заявки (метка источника попадает в заявку);
   панель следующего шага (телефон и компьютер, проверка barDesktop), блоки «Что дальше» и «Доверие», «что дальше» после заявки;
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
  ok(D.sales.trust.items.length >= 3 && D.sales.trust.items.every(i => i.title && i.text && i.ref), 'доверие собрано из разделов сайта (advantages.N), каждый пункт со ссылкой-источником', D.sales.trust.items.map(i => i.ref));
  const adv = J('data/content.json').advantages;
  ok(D.sales.trust.items.every(i => { const a = adv[+i.ref.split('.')[1]]; return a && a.title === i.title && a.text === i.text; }), 'тексты доверия дословно совпадают с data/content.json — выдумать утверждение здесь нельзя');
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

  /* главная осталась прежней: HTML совпадает с версией до продающего слоя (кроме подключения css/js слоя и версий ресурсов) */
  { let base = ''; for (const ref of ['origin/pre-sales-rollback', 'pre-sales-rollback']) { try { base = cp.execFileSync('git', ['show', ref + ':index.html'], {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); break; } catch (e) {} }
    if (!base) console.log('  – нет ссылки pre-sales-rollback в git: сравнение главной с прежней версией пропущено');
    else {
      const norm = h => h.replace(/\?v=[0-9a-f]{8}/g, '').replace(/ data-v="[0-9a-f]{8}"/g, '').split('\n').filter(l => !/sales\.(css|js)/.test(l)).join('\n').replace(/<link rel="stylesheet" href="css\/sales\.css">/g, '');
      const a = norm(base), b = norm(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
      ok(a === b, 'index.html (главная) побайтно совпадает с версией до продающего слоя (кроме подключения css/js слоя)', a === b ? undefined : {len: [a.length, b.length]});
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

  /* ================= B. Главная и страницы-исключения ================= */
  console.log('\n[B. Главная и страницы-исключения: никаких новых элементов]');
  for (const mobile of [false, true]) {
    const tag = mobile ? '(телефон)' : '(компьютер)';
    let p = await mk({mobile, speed: 8});
    await p.goto(base + 'index.html'); await wait(6000);
    await p.evaluate(() => window.scrollTo(0, 2500)); await wait(1500); await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(1500);
    ok(await p.sx() === 0, 'главная ' + tag + ': нет ни одного элемента продающего слоя (после прокрутки до конца)', await p.sx());
    ok(!(await p.evaluate(() => !!document.getElementById('sx-bar'))), 'главная ' + tag + ': панели следующего шага нет в разметке');
    ok(p.errs.length === 0, 'главная ' + tag + ': ошибок в консоли нет', p.errs);
    await p.context().close();
    p = await mk({mobile});
    for (const u of ['contacts.html', 'privacy.html', 'terms.html', 'search.html?q=гель', '404.html']) {
      await p.open(u); await p.scrollPct(.6); await wait(1800);
      ok(await p.sx() === 0 && (await p.barText()) === null, u + ' ' + tag + ': продающего слоя нет');
    }
    await p.context().close();
  }

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
  const today = new Date().toISOString().slice(0, 10);
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
  await p.click('.plan-opt[data-v="range"]'); await wait(800); await p.click('[data-pl="skip"]'); await wait(900);
  ok(await p.evaluate(() => !!document.querySelector('.plan-res') && document.documentElement.scrollWidth <= innerWidth + 1), 'телефон: результат построен (город пропущен), горизонтальной прокрутки нет');
  ok(await p.evaluate(() => { const m = document.querySelector('.plan-main'); const r = m.getBoundingClientRect(); return r.height >= 44 && r.width > 200; }), 'телефон: главная кнопка плана крупная (≥ 44 px)');
  ok(await p.evaluate(() => [...document.querySelectorAll('.plan-res button, .plan-res a.btn')].every(e => e.getBoundingClientRect().height >= 44 || e.classList.contains('btn-lnk'))), 'телефон: все кнопки результата не ниже 44 px');
  await p.context().close();

  /* ================= D. Контекстный слой: панель, блоки, источник ================= */
  console.log('\n[D. Контекст: панель следующего шага, «Что дальше», доверие]');
  const prod = D.products.find(x => x.brand === 'dermatime') || D.products[0], ev = D.events.find(e => e.date >= today) || D.events[0];
  p = await mk({mobile: true});
  await p.open('products/' + prod.slug + '.html');
  ok(await p.evaluate(() => !!document.querySelector('.sx-sec')), 'товар (телефон): блоки в конце страницы добавлены');
  ok((await p.evaluate(() => document.querySelectorAll('.sx-card').length)) === 3, 'товар: три шага «Что дальше» (семинар, Стелла, запрос условий)');
  ok(await p.evaluate(() => /доверять/.test(document.querySelector('.sx-trust h2').textContent) && document.querySelectorAll('.sx-tl li').length >= 3), 'товар: блок «Почему можно доверять» из данных сайта');
  ok((await p.barText()) === null, 'в самом начале страницы панель не показывается (нет навязчивости)');
  await p.scrollPct(.45); await wait(500);
  const bt = await p.barText();
  ok(bt && bt.indexOf(prod.name) >= 0, 'после прокрутки (≈45%) появилась панель с названием товара', bt);
  ok(/ни к чему не обязывает/.test(bt || ''), 'у кнопки заявки рядом честная микро-подпись «ни к чему не обязывает»');
  const geo = await p.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width || b.height ? {l: b.left, t: b.top, r: b.right, b: b.bottom} : null; }; const hit = (a, c) => !!(a && c && a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t); const bar = r('#sx-bar'); return {bar, fab: hit(bar, r('.asst-fab')), qc: hit(bar, r('.qc')), tip: hit(bar, r('.asst-tip')), h: bar && bar.b - bar.t, inView: bar && bar.b <= innerHeight + 1 && bar.l >= 0 && bar.r <= innerWidth + 1, btn: (() => { const e = document.querySelector('#sx-bar .sx-bar-cta').getBoundingClientRect(); return e.height; })()}; });
  ok(!geo.fab && !geo.qc && !geo.tip, 'панель не перекрывает кнопку Стеллы, быструю связь и подсказку', geo);
  ok(geo.inView && geo.h < 150 && geo.btn >= 40, 'панель целиком на экране, невысокая (<150 px), кнопка ≥ 40 px', geo);
  /* закрытие панели запоминается на сессию */
  await p.click('#sx-bar .sx-bar-x'); await wait(500);
  ok((await p.barText()) === null, 'панель закрывается крестиком');
  await p.goto(base + 'brands/dermatime.html'); await p.waitForSelector('html.ready'); await wait(500); await p.scrollPct(.6); await wait(800);
  ok((await p.barText()) === null, 'закрытая панель не появляется снова на других страницах этой сессии');
  await p.context().close();

  p = await mk({mobile: true});
  await p.open('products/' + prod.slug + '.html'); await p.scrollPct(.45);
  await p.click('#sx-bar .sx-bar-cta'); await p.waitForSelector('#modal.open form[data-form="product"]');
  ok(await p.evaluate(id => /Elastense|Dermatime|Acidcure/i.test(document.querySelector('#modal .ctx').textContent) || document.querySelector('#modal form').getAttribute('data-ref') !== '', prod.id), 'кнопка панели открывает форму запроса по этому товару');
  await submitForm(p, {name: 'Тест Панель', phone: '+7 916 222-33-44', email: 'bar@example.com', city: 'Москва'});
  const l2 = await lastLead();
  ok(l2 && /p=product/.test(l2.src || '') && /via=bar/.test(l2.src || ''), 'источник заявки с панели: «p=product; via=bar»', l2 && l2.src);
  ok(await p.evaluate(() => !!document.querySelector('#modal .ok .sx-after')), 'после заявки по товару показан блок «Хотите уточнить больше?»');
  await p.context().close();

  /* страницы по типам: что в панели и в блоках */
  p = await mk({mobile: true});
  const types = [
    ['brands/dermatime.html', 'brand', /Ближайшее обучение по Dermatime/, 3],
    ['training/' + ev.slug + '.html', 'event', /·/, 3],
    ['training.html', 'training', /Ближайший семинар/, 3],
    ['catalog.html', 'catalog', /Стартовый подбор|Подобрать|подобрано/i, 1],
    ['partners.html', 'partners', /условия сотрудничества/i, 3],
    ['news.html', 'default', /с чего начать|Подобрать/i, 3],
    ['company.html', 'default', /с чего начать|Подобрать/i, 3]
  ];
  for (const [u, type, rx, n] of types) {
    await p.open(u); const cards = await p.evaluate(() => document.querySelectorAll('.sx-card').length);
    ok(cards === n, u + ': блок «Что дальше» — ' + n + ' шаг(а)', cards);
    await p.scrollPct(type === 'partners' ? .25 : .5); await wait(700); const t = await p.barText();
    ok(t === null ? type === 'event' && false : rx.test(t), u + ': текст панели по смыслу страницы', t);
  }
  await p.open('partners.html');
  ok(await p.evaluate(() => { const s = document.querySelector('.sx-sec'), f = document.querySelector('#form'); return s && f && (s.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; }), 'партнёрам: «Что дальше» стоит ПЕРЕД формой заявки, а не после неё');
  ok(await p.evaluate(() => !document.querySelector('.sx-trust') === false), 'партнёрам: есть блок доверия');
  await p.open('news.html'); ok(await p.evaluate(() => !document.querySelector('.sx-trust')), 'новости: блока доверия нет (не везде нужен)');
  await p.open('training/' + ev.slug + '.html');
  await p.click('.sx-card[data-card="signup"] button'); await p.waitForSelector('#modal.open form[data-form="seminar"]');
  ok(await p.evaluate(e => document.querySelector('#modal form').getAttribute('data-ref').length > 0, ev.id), 'страница мероприятия: «Записаться» в блоке открывает запись именно на это мероприятие');
  await p.keyboard.press('Escape'); await wait(500);
  await p.open('products/' + prod.slug + '.html');
  const learn = await p.evaluate(() => document.querySelector('.sx-card[data-card="learn"] a').getAttribute('href'));
  ok(/training\//.test(learn), 'товар бренда с мероприятиями: карточка «семинар» ведёт на страницу мероприятия этого бренда', learn);
  await p.click('.sx-card[data-card="ask"] button'); await p.waitForSelector('#asst-in', {state: 'visible'}); await wait(1500); await p.idle();
  const ask1 = await p.lastBot();
  ok(ask1 && ask1.text.length > 20, 'карточка «Спросите Стеллу» открывает чат и отправляет вопрос по этому товару', ask1 && ask1.text.slice(0, 120));
  await p.context().close();

  /* компьютер: проверка barDesktop */
  p = await mk(); await p.open('products/' + prod.slug + '.html?x=barDesktop:off'); await p.scrollPct(.5); await wait(2500);
  ok((await p.barText()) === null, 'компьютер, вариант проверки «off»: панели нет (контрольная группа)');
  await p.context().close();
  p = await mk(); await p.open('products/' + prod.slug + '.html?x=barDesktop:pill'); await p.scrollPct(.5); await wait(900);
  const dbt = await p.barText();
  ok(dbt && /Запросить/.test(dbt), 'компьютер, вариант «pill»: компактная панель показана', dbt);
  ok(await p.evaluate(() => /sx-bar--pill/.test(document.getElementById('sx-bar').className)), 'на компьютере панель в виде «таблетки»');
  ok(await p.evaluate(() => { const a = document.getElementById('sx-bar').getBoundingClientRect(); const f = document.querySelector('.asst-fab'); if (!f) return true; const b = f.getBoundingClientRect(); return !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top); }), 'компьютер: панель не накладывается на кнопку Стеллы');
  /* панель не мешает другим слоям: меню, окна, чат */
  await p.click('#sx-bar .sx-bar-cta'); await p.waitForSelector('#modal.open');
  await wait(400); ok((await p.barText()) === null, 'пока открыто окно заявки, панель скрыта');
  await p.keyboard.press('Escape'); await wait(700);
  ok(await p.barText() !== null, 'после закрытия окна панель возвращается');
  await p.click('#asst-fab'); await wait(900);
  ok((await p.barText()) === null, 'пока открыт чат Стеллы, панель скрыта');
  await p.context().close();
  /* эксперимент запоминается и попадает в источник заявки */
  p = await mk(); await p.open('products/' + prod.slug + '.html'); await p.scrollPct(.5); await wait(1500);
  const exps = await p.evaluate(() => JSON.parse(localStorage.getItem('astreya:exp') || '{}'));
  ok(['off', 'pill'].includes(exps.barDesktop), 'вариант проверки назначен случайно один раз и запомнен', exps);
  await p.goto(base + 'catalog.html'); await p.waitForSelector('html.ready'); await wait(500);
  ok(await p.evaluate(e => JSON.parse(localStorage.getItem('astreya:exp')).barDesktop === e, exps.barDesktop), 'при следующем заходе вариант тот же (посетитель не «перескакивает» между вариантами)');
  await p.context().close();

  /* ================= E. Мягкие переходы ================= */
  console.log('\n[E. Мягкие переходы без перезагрузки]');
  p = await mk(); await p.open('products/' + prod.slug + '.html');
  await p.click('.sx-card[data-card="request"]').catch(() => {});
  await p.evaluate(() => document.querySelector('a[data-nav="/catalog"]').click()); await p.waitForFunction(() => document.body.getAttribute('data-page') === 'catalog', null, {timeout: 15000}); await wait(900);
  ok(await p.evaluate(() => document.querySelectorAll('.sx-sec').length === 1 && document.querySelectorAll('#sx-bar').length <= 1), 'после перехода в каталог: ровно один блок «Что дальше», панель одна');
  await p.evaluate(() => document.querySelector('.sx-card[data-card="plan"] a').click()); await p.waitForFunction(() => document.body.getAttribute('data-page') === 'start', null, {timeout: 15000}); await wait(900);
  ok(await p.evaluate(() => !!document.querySelector('[data-plan-app] .plan-card') && document.querySelectorAll('.sx-sec').length === 0), 'из каталога мягко открывается стартовый подбор; блоков продающего слоя на странице подбора нет');
  await p.evaluate(() => document.querySelector('a[data-nav="/training"]').click()); await p.waitForFunction(() => document.body.getAttribute('data-page') === 'training', null, {timeout: 15000}); await wait(900);
  ok(await p.evaluate(() => document.querySelectorAll('.sx-sec').length === 1), 'обратно в «Обучение»: блок снова один (без дублей)');
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
  await p.click('.plan-opt[data-v="salon"]'); await wait(700); const t1 = await p.evaluate(() => document.querySelector('.plan-opt').getAttribute('data-v')); await p.click('.plan-opt[data-v="' + t1 + '"]'); await p.click('.plan-next'); await wait(500); await p.click('.plan-opt[data-v="both"]'); await wait(700); await p.click('[data-pl="skip"]'); await wait(900);
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
