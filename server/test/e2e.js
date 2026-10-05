/* Сквозная проверка в настоящем браузере: форма на сайте → сервер → админка → обработка заявки; редактирование содержимого, файлы, пользователи, права.
   Запуск: node server/test/e2e.js   (нужен Playwright и Chromium; без них проверка пропускается). Результаты: ✓ / ✗, код возврата ≠ 0 при ошибках. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const {boot, client, rd} = require('./helpers');

let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — сквозная проверка пропущена.'); process.exit(0); }
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const OUT = process.env.E2E_OUT || path.join(require('os').tmpdir(), 'astreya-e2e'); fs.mkdirSync(OUT, {recursive: true});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let pass = 0, fail = 0, shotN = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x) : ''); } return !!c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const S = await boot({}), base = 'http://127.0.0.1:' + S.port, adminApi = await S.admin();
  { const s = (await adminApi.get('/api/settings')).json; s.rateLimit = {per10min: 200, perDay: 1000}; await adminApi.put('/api/settings', s); }       // все посетители теста — с одного адреса
  const browser = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const ctxOpts = {viewport: {width: 1360, height: 900}, locale: 'ru-RU'};
  const newPage = async (ctx, name) => { const p = await ctx.newPage(); p.__errs = []; p.on('pageerror', e => p.__errs.push(e.message)); await p.route(/^https:\/\/(fonts|www\.google|www\.googletagmanager)/, r => r.abort()); p.__name = name; return p; };
  const shot = async (p, n) => { try { await p.screenshot({path: path.join(OUT, String(++shotN).padStart(2, '0') + '-' + n + '.png')}); } catch (e) {} };
  const closeAll = async () => { await browser.close(); await S.close(); };
  process.on('unhandledRejection', e => { console.error('unhandled:', e); });

  /* ---------- вход в админку ---------- */
  console.log('\n[1] Вход в админку');
  const actx = await browser.newContext(ctxOpts), admin = await newPage(actx, 'admin'); admin.on('dialog', d => d.accept());
  await admin.goto(base + '/admin/'); await admin.waitForSelector('#f-login');
  await admin.fill('#f-login', 'admin'); await admin.fill('#f-pass', 'неверный-пароль'); await admin.click('button[type=submit]');
  await admin.waitForSelector('.alert.err'); ok((await admin.textContent('.alert.err')).includes('Неверный логин или пароль'), 'неверный пароль: понятная ошибка');
  await admin.fill('#f-pass', 'Strong-pass-2026'); await admin.click('button[type=submit]');
  await admin.waitForSelector('.side a.nav'); ok(await admin.isVisible('.side a.nav[data-id=leads]'), 'после входа виден каркас админки');
  await admin.waitForSelector('.kpis'); ok(await admin.isVisible('.side a.nav.on[data-id=overview]') && await admin.isVisible('.kpi'), 'после входа администратор попадает в «Обзор»');
  await admin.click('.side a.nav[data-id=leads]'); await admin.waitForSelector('.empty');
  ok(await admin.locator('.empty').first().isVisible(), 'список заявок пуст до первых заявок');

  /* ---------- режим «письмо» (формы без сервера работают по-старому) ---------- */
  console.log('\n[2] По умолчанию формы шлют заявки в админку; пустой адрес — режим «письмо» (mailto) по-прежнему работает');
  ok(rd(S.root, 'data/site.json').formEndpoint === '/api/lead' && fs.readFileSync(path.join(S.root, 'js/data.js'), 'utf8').includes('"formEndpoint":"/api/lead"'), 'в поставке formEndpoint = /api/lead (заявки идут в админку)');
  { const cur = (await adminApi.get('/api/collections/site')).json; cur.data.formEndpoint = ''; ok((await adminApi.put('/api/collections/site', {data: cur.data, version: cur.version})).status === 200, 'для проверки режима «письмо» адрес временно очищен'); }
  const ctx = await browser.newContext(ctxOpts), pub = await newPage(ctx, 'public');
  let leadCalls = 0; pub.on('request', r => { if (r.url().includes('/api/lead')) leadCalls++; });
  await pub.goto(base + '/contacts.html'); await pub.waitForSelector('form[data-form=contact]');
  const fillContact = async (p, o) => { const f = p.locator('form[data-form=contact]').first(); await f.locator('[name=name]').fill(o.name); await f.locator('[name=email]').fill(o.email); if (o.phone) await f.locator('[name=phone]').fill(o.phone); await f.locator('[name=msg]').fill(o.msg); await f.locator('[name=agree]').check(); await p.waitForTimeout(o.wait || 900); return f; };
  let f = await fillContact(pub, {name: 'Тест Письмо', email: 'mail@example.com', msg: 'Режим письма'});
  await f.locator('button[type=submit]').click(); await pub.waitForSelector('.ok h3');
  ok((await pub.textContent('.ok h3')).includes('Заявка подготовлена'), 'без endpoint показывается «Заявка подготовлена» (письмо)'); ok(leadCalls === 0, 'запросов на /api/lead нет');

  /* ---------- подключаем формы к серверу из админки ---------- */
  console.log('\n[3] Админка → Настройки: подключение форм к серверу');
  await admin.click('a.nav[data-id=settings]'); await admin.waitForSelector('text=Подключение форм сайта');
  ok((await admin.textContent('.alert.warn')).includes('режиме «письмо»'), 'настройки предупреждают, что формы в режиме «письмо»');
  await admin.click('button:has-text("Тот же сервер (/api/lead)")'); await admin.click('button:has-text("Записать в настройки сайта")');
  await admin.waitForSelector('.alert.ok:has-text("Сайт пересобран")', {timeout: 20000});
  ok(/"formEndpoint":"\/api\/lead"/.test(fs.readFileSync(path.join(S.root, 'js/data.js'), 'utf8')), 'js/data.js пересобран с адресом /api/lead');
  { const bp = await newPage(await browser.newContext(ctxOpts), 'bundle'); await bp.addInitScript(() => { window.__ASTREYA_BUNDLE = true; }); let bc = 0; bp.on('request', r => { if (r.url().includes('/api/lead')) bc++; });
    await bp.goto(base + '/contacts.html'); await bp.waitForSelector('form[data-form=contact]'); const bf = await fillContact(bp, {name: 'Предпросмотр', email: 'p@example.com', msg: 'автономный файл'}); await bf.locator('button[type=submit]').click(); await bp.waitForSelector('.ok h3');
    ok((await bp.textContent('.ok h3')).includes('Заявка подготовлена') && bc === 0, 'автономный файл-предпросмотр (без сервера) остаётся в режиме «письмо» и не ходит на /api/lead'); }

  /* ---------- настоящие формы сайта ---------- */
  console.log('\n[4] Отправка форм на сайте (4 типа) → «Заявка отправлена»');
  const sent = async p => { await p.waitForSelector('.ok h3', {timeout: 8000}); return (await p.textContent('.ok h3')).includes('Заявка отправлена'); };
  const reqs = []; pub.on('request', r => { if (r.url().includes('/api/lead') && r.method() === 'POST') reqs.push(r.postDataJSON()); });
  await pub.goto(base + '/contacts.html'); f = await fillContact(pub, {name: 'Анна Контакт', email: 'anna@example.com', phone: '+7 916 111-22-33', msg: 'Вопрос по поставкам'});
  await f.locator('button[type=submit]').click(); ok(await sent(pub), 'вопрос (contacts): показано «Заявка отправлена»');
  ok(reqs.length === 1 && reqs[0].type === 'contact' && reqs[0].consent === true && reqs[0].fill_ms > 500 && /contacts\.html/.test(reqs[0].page), 'в запросе: тип, согласие, fill_ms, страница', reqs[0] && {type: reqs[0].type, fill: reqs[0].fill_ms});

  await pub.goto(base + '/partners.html'); await pub.waitForSelector('form[data-form=partner]'); f = pub.locator('form[data-form=partner]').first();
  await f.locator('[name=name]').fill('Ольга Партнёр'); await f.locator('[name=phone]').fill('+7 903 222-33-44'); await f.locator('[name=email]').fill('olga@clinic.ru'); await f.locator('[name=city]').fill('Казань'); await f.locator('[name=org]').fill('Клиника «Лотос»');
  await f.locator('[name=spec]').selectOption({index: 1}); await f.locator('[name=msg]').fill('Хотим стать дистрибьютором'); await f.locator('[name=agree]').check(); await pub.waitForTimeout(900);
  await f.locator('button[type=submit]').click(); ok(await sent(pub), 'партнёрство (partners): «Заявка отправлена»');

  await pub.goto(base + '/products/dermatime-elastense.html'); await pub.click('[data-act=form][data-type=product] >> nth=0'); await pub.waitForSelector('.dlg form[data-form=product]'); f = pub.locator('.dlg form[data-form=product]');
  await f.locator('[name=name]').fill('Марина Товар'); await f.locator('[name=phone]').fill('+7 925 333-44-55'); await f.locator('[name=email]').fill('marina@spa.ru'); await f.locator('[name=city]').fill('Самара'); await f.locator('[name=agree]').check(); await pub.waitForTimeout(900);
  await f.locator('button[type=submit]').click(); ok(await sent(pub), 'запрос по товару (модальное окно): «Заявка отправлена»');
  const prodCtx = reqs[reqs.length - 1].context; ok(/Elastense/i.test(prodCtx), 'в заявке указан товар', prodCtx);

  await pub.goto(base + '/training/2026-10-14-moskva-dermatime.html'); await pub.click('[data-act=form][data-type=seminar] >> nth=0'); await pub.waitForSelector('.dlg form[data-form=seminar]'); f = pub.locator('.dlg form[data-form=seminar]');
  await f.locator('[name=name]').fill('Игорь Семинар'); await f.locator('[name=phone]').fill('+7 999 444-55-66'); await f.locator('[name=email]').fill('igor@cosmo.ru'); await f.locator('[name=city]').fill('Москва'); await f.locator('[name=agree]').check(); await pub.waitForTimeout(900);
  await f.locator('button[type=submit]').click(); ok(await sent(pub), 'запись на мероприятие: «Заявка отправлена»');
  ok(reqs.length === 4, 'отправлено ровно 4 запроса', reqs.length); ok(pub.__errs.length === 0, 'на страницах сайта нет ошибок JS', pub.__errs);

  console.log('\n[5] Ловушка для ботов и защита');
  await pub.goto(base + '/contacts.html'); f = await fillContact(pub, {name: 'Бот', email: 'bot@spam.ru', msg: 'спам-сообщение'});
  await pub.evaluate(() => { document.querySelector('form[data-form=contact] [name=company_site]').value = 'http://spam.example'; }); const before = reqs.length;
  await f.locator('button[type=submit]').click(); ok(await sent(pub), 'бот видит «успех» (чтобы не менять тактику)'); ok(reqs.length === before, 'но запрос на сервер не уходит');
  const total = (await adminApi.get('/api/leads?status=all')).json; ok(total.total === 4, 'в базе ровно 4 настоящие заявки', total.total);

  /* ---------- заявки в админке ---------- */
  console.log('\n[6] Админка: заявки видны, обрабатываются, выгружаются');
  await admin.click('a.nav[data-id=leads]'); await admin.click('button:has-text("Обновить")'); await admin.waitForSelector('tr.click[data-id]');
  ok(await admin.locator('tr.click').count() === 4, 'в списке 4 заявки'); ok((await admin.textContent('.side .badge')).trim() === '4', 'бейдж «новых» = 4');
  const txt = await admin.textContent('.tbl'); ok(['Анна Контакт', 'Ольга Партнёр', 'Марина Товар', 'Игорь Семинар'].every(n => txt.includes(n)), 'видны имена всех четырёх');
  await admin.click('tr.click:has-text("Ольга Партнёр")'); await admin.waitForSelector('.dlg');
  const dt = await admin.textContent('.dlg'); ok(['olga@clinic.ru', 'Казань', 'Клиника «Лотос»', 'Хотим стать дистрибьютором', 'Партнёрство'].every(s => dt.includes(s)), 'в карточке все поля заявки');
  await admin.click('.dlg button:has-text("В работе")'); await admin.waitForSelector('.dlg .pill.in_work'); ok(true, 'статус «В работе» применён');
  await admin.fill('#lead-note', 'Позвонили, отправили прайс'); await admin.click('.dlg button:has-text("Добавить комментарий")'); await admin.waitForSelector('.dlg .notes li');
  ok((await admin.textContent('.dlg .notes')).includes('отправили прайс'), 'комментарий сохранён и показан'); await shot(admin, 'lead-detail');
  await admin.keyboard.press('Escape'); await admin.waitForSelector('.dlg', {state: 'detached'});
  ok((await admin.textContent('.side .badge')).trim() === '3', 'бейдж «новых» уменьшился до 3');
  await admin.click('.tab:has-text("В работе")'); await admin.waitForFunction(() => document.querySelectorAll('tr.click').length === 1 && document.querySelector('tr.click').textContent.includes('Ольга Партнёр'), null, {timeout: 8000}).catch(() => {}); ok(await admin.locator('tr.click').count() === 1, 'вкладка «В работе» показывает 1 заявку');
  await admin.click('.tab:has-text("Все")'); await admin.fill('input[type=search]', 'казань'); await admin.waitForFunction(() => document.querySelectorAll('tr.click').length === 1, null, {timeout: 8000}).catch(() => {}); ok(await admin.locator('tr.click').count() === 1, 'поиск «казань» находит заявку');
  await admin.fill('input[type=search]', ''); await admin.waitForTimeout(600);
  const [dl] = await Promise.all([admin.waitForEvent('download'), admin.click('a:has-text("Скачать CSV")')]);
  const csvText = fs.readFileSync(await dl.path(), 'utf8'); ok(csvText.charCodeAt(0) === 0xFEFF && csvText.includes('Ольга Партнёр') && csvText.includes('Игорь Семинар') && /\.csv$/.test(dl.suggestedFilename()), 'CSV скачан: BOM, все заявки', dl.suggestedFilename());

  console.log('\n[7] Отказоустойчивость формы на сайте');
  await pub.goto(base + '/contacts.html'); let n = 0;
  await pub.route('**/api/lead', r => { n++; if (n === 1) return r.fulfill({status: 429, contentType: 'application/json', body: '{"ok":false,"error":"rate_limited"}'}); if (n === 2) return r.fulfill({status: 422, contentType: 'application/json', body: '{"ok":false,"error":"invalid","errors":{"email":"Некорректный e-mail."}}'}); if (n === 3) return r.abort('connectionrefused'); return r.continue(); });
  f = await fillContact(pub, {name: 'Сбой Сети', email: 'net@example.com', msg: 'проверка отказов'});
  await f.locator('button[type=submit]').click(); await pub.waitForSelector('.form-status.err'); ok((await pub.textContent('.form-status.err')).includes('Слишком много заявок'), '429 → понятное сообщение с телефоном');
  await f.locator('button[type=submit]').click(); await pub.waitForFunction(() => document.querySelector('.fld.bad[data-f=email]')); ok(true, '422 → поле e-mail подсвечено, введённое не потеряно'); ok(await f.locator('[name=name]').inputValue() === 'Сбой Сети', 'введённые данные остались');
  await f.locator('button[type=submit]').click(); await pub.waitForFunction(() => /Не удалось отправить/.test(document.querySelector('.form-status.err') ? document.querySelector('.form-status.err').textContent : '')); ok((await pub.locator('.form-status.err a[href^="tel:"]').count()) === 1, 'обрыв сети → «Не удалось отправить» + телефон и письмо как запасной путь');
  await f.locator('button[type=submit]').click(); ok(await sent(pub), 'после восстановления связи та же форма отправляется'); await pub.unroute('**/api/lead');

  /* ---------- правка содержимого ---------- */
  console.log('\n[8] Админка: правка товара → сайт обновился');
  const productsBefore = JSON.parse(JSON.stringify(rd(S.root, 'data/products.json')));
  await admin.click('a.nav[data-id=content]'); await admin.waitForSelector('.tile'); await admin.click('.tile:has-text("Товары")'); await admin.waitForSelector('.tbl tr.click');
  ok(await admin.locator('.tbl tr.click').count() === 30, 'в списке 30 товаров');
  await admin.click('.tbl tr.click:has-text("Elastense")'); await admin.waitForSelector('.dlg input[type=text]');
  const nameInput = admin.locator('.dlg .ed-row:has(small:text-is("name")) input'); await nameInput.fill('Elastense Новое название');
  await admin.click('.dlg button.primary:has-text("Сохранить")'); await admin.waitForSelector('.toast:has-text("Сохранено")', {timeout: 20000}); await admin.waitForSelector('.dlg', {state: 'detached'});
  let html = await (await fetch(base + '/products/dermatime-elastense.html')).text(); ok(html.includes('Elastense Новое название'), 'публичная страница товара показывает новое название');
  ok(rd(S.root, 'data/products.json')[0].name === 'Elastense Новое название', 'data/products.json обновлён');
  { const after = rd(S.root, 'data/products.json'); after[0].name = productsBefore[0].name; ok(JSON.stringify(after) === JSON.stringify(productsBefore), 'изменилось только поле «name»: остальные данные (null, числа, списки) не испорчены редактором'); }

  console.log('\n[8b] Сохранение без правок не меняет данные (типы, null, вложенные списки)');
  for (const [name, row] of [['brands', 'Dermatime'], ['events', 'Химические пилинги'], ['news', 'Скидки по объёму']]) {
    const before = fs.readFileSync(path.join(S.root, 'data/' + name + '.json'), 'utf8');
    await admin.evaluate(h => { location.hash = h; }, '#/content/' + name); await admin.waitForSelector('.tbl tr.click'); await admin.click('.tbl tr.click:has-text("' + row + '")'); await admin.waitForSelector('.dlg');
    await admin.click('.dlg button.primary:has-text("Сохранить")'); await admin.waitForSelector('.toast:has-text("Изменений нет")', {timeout: 10000}); await admin.waitForSelector('.dlg', {state: 'detached'});
    ok(fs.readFileSync(path.join(S.root, 'data/' + name + '.json'), 'utf8') === before, name + ': файл после «Сохранить» без правок идентичен');
  }
  console.log('\n[8c] Все разделы содержимого открываются без ошибок');
  for (const name of ['site', 'content', 'redesign', 'catalog', 'training', 'products', 'brands', 'events', 'news']) {
    await admin.evaluate(h => { location.hash = h; }, '#/content/' + name); await admin.waitForSelector('.crumbs', {timeout: 10000}); await admin.waitForTimeout(250);
    const cards = await admin.locator('details.ed-card.top').count(), rows = await admin.locator('.tbl tr.click').count();
    ok(cards > 0 || rows > 0, 'раздел «' + name + '» отрисован', {cards, rows});
    if (cards) { await admin.evaluate(() => document.querySelectorAll('details.ed-card').forEach(d => { d.open = true; })); await admin.waitForTimeout(150); ok(await admin.locator('.savebar button.primary').isDisabled(), '«' + name + '»: кнопка «Сохранить» неактивна, пока нет правок'); }
  }
  ok(admin.__errs.length === 0, 'при просмотре всех разделов нет ошибок JS', admin.__errs);
  console.log('\n[9] Добавление новости и удаление; ошибка данных не ломает сайт');
  await admin.evaluate(() => { location.hash = '#/content/news'; }); await admin.waitForSelector('#add-item'); await admin.click('#add-item'); await admin.waitForSelector('.dlg');
  await admin.locator('.dlg .ed-row:has(small:text-is("title")) input').fill('Тестовая новость из админки'); await admin.locator('.dlg .ed-row:has(small:text-is("slug")) button:has-text("Из названия")').click();
  await admin.locator('.dlg .ed-row:has(small:text-is("excerpt")) textarea').fill('Короткий анонс тестовой новости.');
  await admin.locator('.dlg .ed-row:has(small:text-is("body")) button:has-text("Добавить")').click(); await admin.locator('.dlg .ed-row:has(small:text-is("body")) textarea').first().fill('Первый абзац новости.');
  await shot(admin, 'news-editor');
  await admin.click('.dlg button.primary:has-text("Добавить")'); await admin.waitForSelector('.toast:has-text("Добавлено")', {timeout: 20000});
  const slug = rd(S.root, 'data/news.json').items.find(i => i.title === 'Тестовая новость из админки').slug; ok(slug === 'testovaya-novost-iz-adminki', 'slug из названия: транслитерация', slug);
  html = await (await fetch(base + '/news/' + slug + '.html')).text(); ok(html.includes('Тестовая новость из админки') && html.includes('Первый абзац новости.'), 'страница новости появилась на сайте');
  await admin.click('tr.click:has-text("Тестовая новость из админки") button:has-text("Удалить")'); await admin.click('.dlg button.danger:has-text("Удалить")'); await admin.waitForSelector('.toast:has-text("Удалено")', {timeout: 20000});
  ok((await fetch(base + '/news/' + slug + '.html')).status === 404, 'после удаления страницы новости нет');
  // ошибка данных: пустой бренд у товара — сервер не принимает, сообщение понятное, сайт цел
  await admin.evaluate(() => { location.hash = '#/content/products'; }); await admin.waitForSelector('.tbl tr.click'); await admin.click('.tbl tr.click >> nth=1'); await admin.waitForSelector('.dlg');
  const sel = admin.locator('.dlg .ed-row:has(small:text-is("brand")) select'); await sel.evaluate(s => { const o = document.createElement('option'); o.value = 'нет-такого-бренда'; o.textContent = 'x'; s.append(o); s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); });
  await admin.click('.dlg button.primary:has-text("Сохранить")'); await admin.waitForSelector('.dlg .alert.err'); ok((await admin.textContent('.dlg .alert.err')).includes('неизвестный бренд'), 'ошибка: «неизвестный бренд» — данные не сохранены');
  ok((await fetch(base + '/products/dermatime-elastense.html')).status === 200, 'сайт продолжает отдавать страницы'); await admin.click('.dlg button:has-text("Отмена")'); await admin.waitForSelector('.dlg', {state: 'detached'}).catch(() => {});
  if (await admin.locator('.dlg').count()) { admin.once('dialog', d => d.accept()); await admin.click('.dlg button:has-text("Отмена")'); }
  console.log('\n[10] Документы: правка текстов, SEO, откат из «Истории»');
  await admin.evaluate(() => { location.hash = '#/content/site'; }); await admin.waitForSelector('.savebar');
  const tag = admin.locator('.ed-row:has(small:text-is("tagline")) input'); await tag.fill('Новый девиз сайта'); ok(await admin.locator('.savebar .dot').isVisible(), 'видна отметка «есть несохранённые изменения»');
  await admin.click('.savebar button.primary'); await admin.waitForSelector('.toast:has-text("Сохранено")', {timeout: 20000});
  ok((await (await fetch(base + '/index.html')).text()).includes('Новый девиз сайта') || (await (await fetch(base + '/contacts.html')).text()).includes('Новый девиз сайта'), 'новый девиз попал на страницы сайта');
  await admin.click('.savebar button:has-text("История")'); await admin.waitForSelector('.dlg tbody tr'); await admin.click('.dlg tbody tr >> nth=0 >> button:has-text("Восстановить")'); await admin.click('.dlg button:has-text("Восстановить") >> nth=-1');
  await admin.waitForSelector('.toast:has-text("Версия восстановлена")', {timeout: 20000}); ok(rd(S.root, 'data/site.json').tagline === 'Наука. Забота. Результат.', 'восстановление вернуло прежний девиз');

  /* ---------- картинки ---------- */
  console.log('\n[11] Загрузка картинки');
  await admin.click('a.nav[data-id=files]'); await admin.waitForSelector('.drop'); await admin.locator('.card:has-text("Прочие картинки") input[type=file]').setInputFiles({name: 'Тест картинка.png', mimeType: 'image/png', buffer: PNG});
  await admin.waitForSelector('.file:has-text("test-kartinka.png")', {timeout: 8000}); ok(fs.existsSync(path.join(S.root, 'assets/uploads/test-kartinka.png')), 'файл сохранён с безопасным именем (кириллица → латиница)');
  ok((await (await fetch(base + '/assets/uploads/test-kartinka.png')).status) === 200, 'файл отдаётся сайтом');
  await admin.locator('.file:has-text("test-kartinka.png") button:has-text("Удалить")').click(); await admin.click('.dlg button.danger:has-text("Удалить")'); await admin.waitForFunction(() => !document.body.textContent.includes('test-kartinka.png'));
  ok(!fs.existsSync(path.join(S.root, 'assets/uploads/test-kartinka.png')), 'файл удалён');
  await admin.locator('.card:has-text("Логотипы брендов") .file:has-text("dermatime.svg") button:has-text("Удалить")').click(); await admin.click('.dlg button.danger:has-text("Удалить")');
  await admin.waitForSelector('.toast.err:has-text("используется")'); ok(true, 'файл, на который ссылается сайт, удалить нельзя');

  /* ---------- пользователи и права ---------- */
  console.log('\n[12] Пользователи и права');
  await admin.click('a.nav[data-id=users]'); await admin.waitForSelector('.tbl'); await admin.click('button:has-text("Добавить пользователя")'); await admin.waitForSelector('.dlg');
  const pwd = await admin.locator('.dlg input[type=text] >> nth=2').inputValue(); await admin.locator('.dlg input[type=text] >> nth=0').fill('manager-ivan'); await admin.locator('.dlg input[type=text] >> nth=1').fill('Иван Менеджер');
  await admin.click('.dlg button.primary:has-text("Создать")'); await admin.waitForSelector('.toast:has-text("Пользователь создан")');
  const mctx = await browser.newContext(ctxOpts), mp = await newPage(mctx, 'manager'); await mp.goto(base + '/admin/'); await mp.waitForSelector('#f-login'); await mp.fill('#f-login', 'manager-ivan'); await mp.fill('#f-pass', pwd); await mp.click('button[type=submit]');
  await mp.waitForSelector('#p-new'); ok(true, 'новый пользователь обязан сменить временный пароль'); await mp.fill('#p-old', pwd); await mp.fill('#p-new', 'Ivan-secret-2026'); await mp.fill('#p-new2', 'Ivan-secret-2026'); await mp.click('button[type=submit]');
  await mp.waitForSelector('.side a.nav'); ok(await mp.locator('.side a.nav[data-id]').count() === 1, 'менеджер видит в меню только «Заявки»'); await mp.waitForSelector('tr.click');
  await mp.evaluate(() => { location.hash = '#/content'; }); await mp.waitForTimeout(500); ok(/#\/leads/.test(await mp.evaluate(() => location.hash)), 'прямой переход менеджера в «Содержимое» возвращает к заявкам');
  const mr = await mp.evaluate(async () => (await fetch('/api/collections')).status); ok(mr === 403, 'API содержимого для менеджера закрыт (403)', mr);
  await mp.click('tr.click >> nth=0'); await mp.click('.dlg button:has-text("Обработана")'); await mp.waitForSelector('.dlg .pill.done'); ok(await mp.locator('.dlg button:has-text("Удалить навсегда")').count() === 0, 'менеджер может обработать заявку, но не удалить');
  const log = (await adminApi.get('/api/audit')).json.items; ok(log.some(x => x.who === 'manager-ivan' && x.action === 'lead'), 'действие менеджера записано в журнал');

  /* ---------- телефон ---------- */
  console.log('\n[13] Админка на телефоне');
  const phone = await browser.newContext({viewport: {width: 390, height: 800}, isMobile: true, hasTouch: true, locale: 'ru-RU'}), pp = await newPage(phone, 'phone');
  await pp.goto(base + '/admin/'); await pp.waitForSelector('#f-login'); await pp.fill('#f-login', 'admin'); await pp.fill('#f-pass', 'Strong-pass-2026'); await pp.click('button[type=submit]'); await pp.waitForSelector('.kpis'); await pp.evaluate(() => { location.hash = '#/leads'; }); await pp.waitForSelector('tr.click');
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(over <= 1, 'список заявок без горизонтальной прокрутки на 390 px', over); await shot(pp, 'phone-leads');
  await pp.click('.topbar button'); await pp.waitForSelector('body.nav-open'); ok(await pp.isVisible('.side a.nav[data-id=content]'), 'меню открывается кнопкой ☰'); await pp.click('.side a.nav[data-id=content]'); await pp.waitForSelector('.tile');
  await pp.click('.tile:has-text("Товары")'); await pp.waitForSelector('.tbl tr.click'); const over2 = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(over2 <= 1, 'список товаров без горизонтальной прокрутки', over2);
  ok(admin.__errs.length === 0 && mp.__errs.length === 0 && pp.__errs.length === 0, 'в админке нет ошибок JS', [...admin.__errs, ...mp.__errs, ...pp.__errs]);

  /* ---------- сайт на другом адресе (GitHub Pages) → сервер заявок ---------- */
  console.log('\n[14] Сайт на другом адресе: CORS и разрешённые сайты');
  const site2 = http.createServer((q, r) => { let f = path.join(S.root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': /\.html$/.test(f) ? 'text/html; charset=utf-8' : /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => site2.listen(0, '127.0.0.1', r)); const base2 = 'http://127.0.0.1:' + site2.address().port;
  { const sp = await newPage(await browser.newContext(ctxOpts), 'static'); let calls = 0; sp.on('request', r => { if (r.url().includes('/api/lead')) calls++; }); await sp.goto(base2 + '/contacts.html'); await sp.waitForSelector('form[data-form=contact]');
    const sf = await fillContact(sp, {name: 'Без Сервера', email: 'nos@example.com', msg: 'статический хостинг без сервера заявок'}); await sf.locator('button[type=submit]').click(); await sp.waitForSelector('.form-status.err');
    ok(calls === 1 && (await sp.locator('.ok').count()) === 0 && (await sp.textContent('.form-status.err')).includes('Не удалось отправить'), 'статический хостинг без сервера заявок (адрес /api/lead не отвечает): честная ошибка с запасными контактами, а не ложное «отправлено» и не письмо'); }
  const siteDoc = (await adminApi.get('/api/collections/site')).json; siteDoc.data.formEndpoint = base + '/api/lead';
  ok((await adminApi.put('/api/collections/site', {data: siteDoc.data, version: siteDoc.version})).status === 200, 'endpoint переключён на абсолютный адрес сервера');
  const px = await newPage(await browser.newContext(ctxOpts), 'cross'); await px.goto(base2 + '/contacts.html'); await px.waitForSelector('form[data-form=contact]');
  f = await fillContact(px, {name: 'Кросс Домен', email: 'cross@example.com', msg: 'Заявка с другого адреса'}); await f.locator('button[type=submit]').click(); await px.waitForSelector('.form-status.err, .ok h3');
  ok(await px.locator('.form-status.err').count() > 0, 'сайт с неразрешённого адреса: заявка отклонена (CORS), посетитель видит запасной путь');
  const st = (await adminApi.get('/api/settings')).json; st.allowedOrigins = [base2]; ok((await adminApi.put('/api/settings', st)).status === 200, 'адрес сайта добавлен в «разрешённые» в настройках');
  await px.goto(base2 + '/contacts.html'); await px.waitForSelector('form[data-form=contact]'); f = await fillContact(px, {name: 'Кросс Домен', email: 'cross@example.com', msg: 'Заявка с другого адреса'}); await f.locator('button[type=submit]').click(); ok(await sent(px), 'после добавления адреса в разрешённые заявка уходит');
  ok((await adminApi.get('/api/leads?q=' + encodeURIComponent('Кросс Домен'))).json.total === 1, 'в админке ровно одна заявка с другого адреса (отклонённая не сохранилась)');
  site2.close();

  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}   (скриншоты: ${OUT})`);
  await closeAll(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Сбой теста:', e); process.exit(2); });
