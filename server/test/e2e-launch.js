/* Запуск в РФ в настоящем браузере: страницы работают под политикой безопасности (CSP) без нарушений; уведомление о cookie и «Яндекс Метрика» (только после согласия, отказ, виртуальные просмотры, цели);
   форма сохраняет согласие с версией документов; невидимая SmartCaptcha (заглушка) даёт заявке токен; админка: чек-лист, интеграции, персональные данные, копии, безопасность, подключение и вход с 2FA.
   Запуск: node server/test/e2e-launch.js   (нужен Playwright и Chromium; без них проверка пропускается). Код возврата ≠ 0, если что-то не прошло. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const {boot, client} = require('./helpers');
const TOTP = require('../lib/totp');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const OUT = process.env.E2E_OUT || path.join(require('os').tmpdir(), 'astreya-e2e-launch'); fs.mkdirSync(OUT, {recursive: true});
let passed = 0; const fails = []; const ok = (c, m, x) => { if (c) passed++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (c || x === undefined ? '' : ' → ' + JSON.stringify(x))); if (!c) fails.push(m); };
(async () => {
  const S = await boot({}); const admin = await S.admin(); const base = 'http://127.0.0.1:' + S.port;
  // подключения и реквизиты
  const ic = (await admin.get('/api/collections/integrations')).json; ic.data.metrika.id = '12345678'; ic.data.metrika.webvisor = true; ic.data.verification.yandex = 'abcdef0123456789'; ic.data.messengers.max = 'https://max.ru/astreya'; ic.data.messengers.telegram = 'https://t.me/astreya';
  let r = await admin.put('/api/collections/integrations', {data: ic.data, version: ic.version}); console.log('integrations saved', r.status);
  const st = (await admin.get('/api/collections/site')).json; st.data.requisites = {legalName: 'ООО «Астрея»', inn: '7701234567', kpp: null, ogrn: '1157746123456', legalAddress: '125000, г. Москва, проезд Березовой рощи, д. 8', note: ''}; r = await admin.put('/api/collections/site', {data: st.data, version: st.version}); console.log('site saved', r.status);
  const st2 = await admin.get('/api/settings'); const s = st2.json; s.allowedOrigins = []; s.rateLimit = {per10min: 50, perDay: 500}; await admin.put('/api/settings', s);

  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  async function newPage(vp, label) {
    const ctx = await b.newContext({viewport: vp || {width: 1440, height: 900}, locale: 'ru-RU'}); const p = await ctx.newPage(); p.__log = {errors: [], csp: [], reqs: []};
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sample || '').slice(0, 60))); });
    p.on('console', m => { if (m.type() === 'error') p.__log.errors.push(m.text()); }); p.on('response', r => { if (r.status() >= 400) p.__log.bad = (p.__log.bad || []).concat(r.status() + ' ' + r.url()); }); p.on('pageerror', e => p.__log.errors.push('pageerror: ' + e.message));
    await ctx.route(/mc\.yandex\.(ru|com)|yastatic\.net/, rt => { p.__log.reqs.push(rt.request().url()); rt.fulfill({status: 200, contentType: 'text/javascript', body: ''}); });
    return p;
  }
  // --- 1. страницы без нарушений политики безопасности ---
  console.log('\n[страницы и политика безопасности]');
  const p = await newPage(); const pages = ['/', '/catalog.html', '/brands.html', '/brands/keenwell.html', '/training.html', '/news.html', '/company.html', '/contacts.html', '/partners.html', '/privacy.html', '/consent.html', '/terms.html', '/search.html?q=sun', '/404.html'];
  for (const u of pages) {
    await p.goto(base + u, {waitUntil: 'load'}); await p.waitForTimeout(u === '/' ? 3500 : 1200);
    const csp = await p.evaluate(() => window.__csp.slice()); ok(!csp.length, 'без нарушений CSP: ' + u, csp);
    // 404.html ссылается на ресурсы от корня опубликованного сайта (/astreya/…), которого нет в тестовой копии, — здесь проверяется только CSP
    if (u === '/404.html') { p.__log.errors.length = 0; if (p.__log.bad) p.__log.bad.length = 0; }
  }
  ok(!p.__log.errors.filter(e => !/Failed to load resource/.test(e)).length, 'без ошибок в консоли на страницах', p.__log.errors.slice(0, 4)); ok(!(p.__log.bad || []).filter(u => !/assets\/jar\//.test(u)).length, 'ни один ресурс сайта не отдаёт 4xx (кадры вступления в тестовой копии не копируются)', (p.__log.bad || []).filter(u => !/assets\/jar\//.test(u)));
  // --- 2. баннер и Метрика ---
  console.log('\n[согласие и Метрика]');
  const q = await newPage(); await q.goto(base + '/contacts.html', {waitUntil: 'load'}); await q.waitForTimeout(2600);
  ok(await q.locator('.cb.on').count() === 1, 'баннер показан при первом визите');
  ok(await q.evaluate(() => !document.querySelector('script[src*="mc.yandex"]') && typeof window.ym === 'undefined'), 'до согласия Метрика не загружена');
  const bb = await q.locator('.cb').boundingBox(); ok(bb && bb.y < 200 && bb.y > 40, 'баннер вверху под шапкой, не внизу', bb);
  await q.screenshot({path: OUT + '/banner-desktop.png'});
  await q.locator('.cb .btn-fill').click(); await q.waitForTimeout(500);
  ok(await q.evaluate(() => !!document.querySelector('script[src*="mc.yandex.ru/metrika/tag.js?id=12345678"]')), 'после «Принять» загружен tag.js счётчика');
  const init = await q.evaluate(() => (window.ym && window.ym.a || []).map(a => Array.from(a).slice(0, 2)).filter(a => a[1] === 'init')[0]); ok(init && init[0] === 12345678, 'ym(12345678, init)', init);
  const opts = await q.evaluate(() => Array.from((window.ym.a || []).find(a => a[1] === 'init'))[2]); ok(opts && opts.webvisor === true && opts.ssr === true && opts.clickmap === true, 'параметры init: webvisor после согласия', opts);
  await q.evaluate(() => window.Astreya.track('form_submit', {form_type: 'x'})); const goal = await q.evaluate(() => (window.ym.a || []).map(a => Array.from(a)).find(a => a[1] === 'reachGoal')); ok(goal && goal[2] === 'form_submit', 'цели уходят в Метрику (reachGoal)', goal);
  // виртуальный просмотр при переходе без перезагрузки
  await q.locator('a.nl[href*="catalog"]').first().click(); await q.waitForTimeout(2500);
  const hit = await q.evaluate(() => (window.ym.a || []).map(a => Array.from(a)).filter(a => a[1] === 'hit')); ok(hit.length >= 1 && /catalog/.test(hit[0][2]), 'переход без перезагрузки засчитан просмотром (hit)', hit);
  await q.reload({waitUntil: 'load'}); await q.waitForTimeout(1500); ok(await q.locator('.cb.on').count() === 0, 'повторно баннер не показывается'); ok(await q.evaluate(() => !!document.querySelector('script[src*="mc.yandex.ru"]')), 'после перезагрузки Метрика стартует сама');
  await q.locator('[data-act="cookie-settings"]').first().scrollIntoViewIfNeeded(); await q.locator('[data-act="cookie-settings"]').first().click(); await q.waitForTimeout(600); ok(await q.locator('.cb.on').count() === 1, '«Настройки cookie» открывает выбор снова');
  await q.locator('.cb .btn-ghost').click(); await q.waitForTimeout(1500); await q.waitForLoadState('load');
  ok(await q.evaluate(() => !document.querySelector('script[src*="mc.yandex"]') && typeof window.ym === 'undefined' && !document.cookie.includes('_ym_')), 'после отказа Метрика не запускается и cookie _ym_ нет');
  ok(await q.evaluate(() => JSON.parse(localStorage.getItem('astreya:consent')).a) === 0, 'отказ сохранён');
  // мобильный вид
  const m = await newPage({width: 390, height: 800}); await m.goto(base + '/', {waitUntil: 'load'}); await m.waitForTimeout(4500); const mb = await m.locator('.cb').boundingBox(); ok(mb && mb.x >= 8 && mb.x + mb.width <= 392 && mb.y < 200, 'на телефоне баннер вверху и помещается', mb); await m.screenshot({path: OUT + '/banner-mobile.png'});
  // --- 3. форма: согласие, версия документов ---
  console.log('\n[форма и согласие]');
  const f = await newPage(); await f.goto(base + '/contacts.html', {waitUntil: 'load'}); await f.waitForTimeout(1500);
  const form = f.locator('form.lead-form[data-form="contact"]').first(); await form.scrollIntoViewIfNeeded();
  const label = await form.locator('.agree').innerText(); ok(/согласие на обработку/.test(label) && /Политикой конфиденциальности/.test(label), 'подпись у согласия', label);
  ok((await form.locator('.agree a').first().getAttribute('href')) === 'consent.html', 'ссылка на отдельный документ согласия');
  await form.locator('input[name=name]').fill('Тест Браузер'); await form.locator('input[name=email]').fill('browser@example.com'); await form.locator('textarea[name=msg]').fill('Проверка формы из браузера'); await f.waitForTimeout(900);
  await form.locator('input[name=agree]').check(); await form.locator('button[type=submit]').click(); await f.waitForTimeout(1500);
  const leads = (await admin.get('/api/leads?status=all&q=browser@example.com')).json; ok(leads.total === 1, 'заявка дошла до сервера', leads.total);
  if (leads.total) { const L = (await admin.get('/api/leads/' + leads.items[0].id)).json; ok(L.consent === true && L.consent_version === '2026-10-19' && !!L.consent_at, 'согласие сохранено с датой и версией документов', {v: L.consent_version, at: L.consent_at}); }

  // --- 3b. SmartCaptcha (заглушка сервиса): токен уходит с заявкой ---
  console.log('\n[SmartCaptcha]');
  const capSrv = await new Promise(res => { const srv = http.createServer((rq, rs) => { let body = ''; rq.on('data', c => body += c); rq.on('end', () => { const p = new URLSearchParams(body); rs.writeHead(200, {'Content-Type': 'application/json'}); rs.end(JSON.stringify(p.get('secret') === 'srv-key-1234567' && p.get('token') === 'good-token' ? {status: 'ok'} : {status: 'failed'})); }); }); srv.listen(0, '127.0.0.1', () => res(srv)); });
  { const c = (await admin.get('/api/collections/integrations')).json; c.data.captcha.siteKey = 'ysc1_clientkey1234'; await admin.put('/api/collections/integrations', {data: c.data, version: c.version}); const s2 = (await admin.get('/api/settings')).json; s2.integrations.captcha = {enabled: true, serverKey: 'srv-key-1234567', url: 'http://127.0.0.1:' + capSrv.address().port + '/validate'}; await admin.put('/api/settings', s2); }
  const cp = await newPage(); let capLoads = 0;
  await cp.context().route(/smartcaptcha\.yandexcloud\.net/, rt => { capLoads++; rt.fulfill({status: 200, contentType: 'text/javascript', body: "window.smartCaptcha={render:function(el,o){window.__cap=o;return 7},execute:function(){setTimeout(function(){window.__cap.callback('good-token')},30)},reset:function(){}};if(window.__astreyaCaptcha)window.__astreyaCaptcha();"}); });
  await cp.goto(base + '/contacts.html', {waitUntil: 'load'}); await cp.waitForTimeout(1500);
  const cf = cp.locator('form.lead-form[data-form="contact"]').first(); await cf.scrollIntoViewIfNeeded(); await cf.locator('input[name=name]').fill('Капча Тест'); await cf.locator('input[name=email]').fill('captcha@example.com'); await cf.locator('textarea[name=msg]').fill('Проверка с капчей'); await cp.waitForTimeout(900);
  ok(await cf.locator('.cap-note').count() === 1, 'под формой — строка про Yandex SmartCaptcha (значок скрыт, внизу экрана ничего не плавает)');
  await cf.locator('input[name=agree]').check(); await cf.locator('button[type=submit]').click(); await cp.waitForTimeout(2000);
  ok(capLoads >= 1, 'скрипт капчи загружен при работе с формой');
  const cl = (await admin.get('/api/leads?status=all&q=captcha@example.com')).json; ok(cl.total === 1 && cl.items[0].status === 'new', 'заявка с токеном капчи принята как обычная', cl.items && cl.items[0] && cl.items[0].status);
  ok(!(await cp.evaluate(() => window.__csp.slice())).length, 'капча работает без нарушений CSP', await cp.evaluate(() => window.__csp.slice())); capSrv.close();
  // --- 4. скриншоты документов ---
  await p.goto(base + '/privacy.html', {waitUntil: 'load'}); await p.waitForTimeout(1500); await p.screenshot({path: OUT + '/privacy.png', fullPage: false});
  console.log('\n[кнопки и окна без нарушений политики]'); const csp2 = await f.evaluate(() => window.__csp.slice()); ok(!csp2.length, 'форма и сайт работают без нарушений CSP', csp2);
  const a = await newPage(); await a.goto(base + '/', {waitUntil: 'load'}); await a.waitForTimeout(4000); const fab = a.locator('#asst-fab'); if (await fab.count()) { await fab.click().catch(() => {}); await a.waitForTimeout(1500); } await a.locator('button.icon-btn[data-act=search]').click().catch(() => {}); await a.waitForTimeout(600);
  ok(!(await a.evaluate(() => window.__csp.slice())).length, 'чат и поиск без нарушений CSP', await a.evaluate(() => window.__csp.slice()));

  // --- 5. админка ---
  console.log('\n[админка]');
  const ad = await newPage({width: 1440, height: 900}); await ad.goto(base + '/admin/', {waitUntil: 'load'}); await ad.waitForTimeout(800);
  await ad.fill('#f-login', 'admin'); await ad.fill('#f-pass', 'Strong-pass-2026'); await ad.click('button[type=submit]'); await ad.waitForSelector('.shell', {timeout: 8000});
  for (const route of ['launch', 'integrations', 'privacy', 'backups', 'security', 'overview', 'users', 'audit', 'settings', 'content/integrations', 'content/legal']) {
    await ad.evaluate(r => { location.hash = '#/' + r; }, route); await ad.waitForTimeout(1300);
    const txt = await ad.locator('#view').innerText(); ok(txt.length > 80 && !/Ошибка/.test(txt.slice(0, 60)), 'раздел «' + route + '» открывается', txt.slice(0, 80));
    await ad.screenshot({path: OUT + '/admin-' + route.replace('/', '-') + '.png', fullPage: false});
  }
  ok(!(await ad.evaluate(() => window.__csp.slice())).length, 'админка без нарушений CSP', await ad.evaluate(() => window.__csp.slice()));
  ok(!ad.__log.errors.filter(e => !/Failed to load resource/.test(e)).length, 'админка без ошибок в консоли', ad.__log.errors.slice(0, 5));
  // 2FA через интерфейс
  await ad.evaluate(() => { location.hash = '#/security'; }); await ad.waitForTimeout(900);
  await ad.getByRole('button', {name: 'Начать подключение'}).click(); await ad.waitForSelector('svg[aria-label^="QR"]', {timeout: 5000}); ok(true, 'QR-код показан');
  const secret = (await ad.locator('code.mono').first().innerText()).replace(/\s/g, ''); ok(/^[A-Z2-7]{32}$/.test(secret), 'ключ для ручного ввода', secret);
  await ad.screenshot({path: OUT + '/admin-2fa-setup.png'});
  await ad.fill('input[aria-label="Шестизначный код"]', TOTP.hotp(secret, TOTP.stepNow())); await ad.getByRole('button', {name: 'Подтвердить и включить'}).click(); await ad.waitForTimeout(1200);
  ok(await ad.getByText('Двухфакторный вход включён').count() > 0, 'двухфакторный вход включён через интерфейс'); await ad.screenshot({path: OUT + '/admin-2fa-codes.png'});
  await ad.getByLabel('Я сохранил').check(); await ad.getByRole('button', {name: 'Готово'}).click(); await ad.waitForTimeout(800);
  await ad.click('#logout'); await ad.waitForSelector('#f-login'); await ad.fill('#f-login', 'admin'); await ad.fill('#f-pass', 'Strong-pass-2026'); await ad.click('button[type=submit]'); await ad.waitForSelector('#f-code', {timeout: 5000}); ok(true, 'после пароля запрашивается код'); await ad.screenshot({path: OUT + '/admin-2fa-login.png'});
  await ad.fill('#f-code', '000000'); await ad.click('button[type=submit]'); await ad.waitForTimeout(700); ok(await ad.getByText('Неверный код').count() > 0, 'неверный код отклонён');
  await ad.fill('#f-code', TOTP.hotp(secret, TOTP.stepNow() + 1)); await ad.click('button[type=submit]'); await ad.waitForSelector('.shell', {timeout: 6000}); ok(true, 'вход с кодом из приложения');
  await b.close(); await S.close();
  console.log('\nИтого: ✓ ' + passed + '  ✗ ' + fails.length + '   (скриншоты: ' + OUT + ')'); fails.forEach(f => console.log(' - ' + f)); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
