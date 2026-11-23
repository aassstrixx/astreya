/* Сквозная проверка новой админки в настоящем браузере: меню по группам, тексты страниц (правка, счётчик, черновик после перезагрузки, Ctrl+S), товары (создание с фото и сжатием в WebP, массовые действия, CSV),
   слоты газеты, библиотека картинок, публикация и история, роли, ширина экрана 820 и 390 без горизонтальной прокрутки.
   Запуск: node server/test/e2e-admin.js (нужен Playwright и Chromium; без них проверка пропускается). */
'use strict';
const fs = require('fs'), path = require('path');
const {boot, client} = require('./helpers');

let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — сквозная проверка пропущена.'); process.exit(0); }
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const OUT = process.env.E2E_OUT || path.join(require('os').tmpdir(), 'astreya-e2e-admin'); fs.mkdirSync(OUT, {recursive: true});
/* PNG 640×480 с градиентом: настоящая картинка достаточного размера, чтобы проверить сжатие в WebP */
const PNG = (() => {
  const zlib = require('zlib'), w = 640, h = 480, T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 40 + (x * 200 / w | 0); raw[o + 1] = 90 + (y * 100 / h | 0); raw[o + 2] = 160; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x) : ''); } return !!c; };

(async () => {
  const S = await boot({}), base = 'http://127.0.0.1:' + S.port, api = await S.admin();
  const read = f => fs.readFileSync(path.join(S.root, f), 'utf8'), rdj = f => JSON.parse(read(f));
  const ur = await api.post('/api/users', {login: 'redaktor', name: 'Редактор', role: 'editor', password: 'Edit-pass-Ключ-2026-x'}); const ec = client(S.port, '10.9.9.8'); await ec.login('redaktor', 'Edit-pass-Ключ-2026-x'); await ec.post('/api/password', {old: 'Edit-pass-Ключ-2026-x', new: 'Edit-pass-Ключ-2027-z'});
  const browser = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const mk = async (w, h, who) => {
    const ctx = await browser.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', acceptDownloads: true}), p = await ctx.newPage(); p.__errs = [];
    p.on('pageerror', e => p.__errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(base + '/admin/'); await p.fill('#f-login', who ? 'redaktor' : 'admin'); await p.fill('#f-pass', who ? 'Edit-pass-Ключ-2027-z' : 'Strong-pass-2026'); await p.click('button[type=submit]'); await p.waitForSelector('.shell');
    return p;
  };
  const go = async (p, h, sel) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForSelector(sel || '.page-h', {timeout: 8000}); await p.waitForTimeout(250); };
  const toast = async p => { await p.waitForSelector('.toast.ok', {timeout: 15000}); const t = await p.locator('.toast.ok').last().innerText(); await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove())); return t; };

  const act = async (p, fn) => { await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove())); await fn(); return toast(p); };   // сначала убираем старые уведомления, потом действие, потом ждём новое
  console.log('Каркас и меню');
  const p = await mk(1440, 900);
  ok(await p.locator('.side .nav-h').count() === 5, 'в меню пять групп');
  ok(JSON.stringify(await p.locator('.side a.nav[data-id]').evaluateAll(a => a.map(x => x.dataset.id))) === JSON.stringify(['overview', 'leads', 'texts', 'news', 'products', 'brands', 'events', 'contacts', 'menu', 'pages', 'content', 'files', 'preview', 'publish', 'history', 'backups', 'settings', 'integrations', 'users', 'security', 'audit', 'privacy', 'launch']), 'разделы в нужном порядке', await p.locator('.side a.nav[data-id]').evaluateAll(a => a.map(x => x.dataset.id)));
  ok(!(await p.locator('.side a.nav[data-id=design]').count()), '«Оформление» (фоны) не в основном меню');
  ok((await p.evaluate(() => getComputedStyle(document.querySelector('.page-h h1')).fontFamily)).includes('Playfair'), 'заголовки — шрифтом Playfair Display'); await p.screenshot({path: path.join(OUT, '01-overview.png')});

  console.log('Тексты страниц');
  await go(p, '#/texts/contacts', '.tx-f');
  const h1 = p.locator('#tx-contacts\\.hero\\.h1'); await h1.fill('Мы на связи — Астрея'); await p.waitForTimeout(700);
  ok(await p.locator('.tx-f.chg').count() === 1 && /не сохранено/i.test(await p.locator('.savebar').innerText()), 'правка помечена, панель сохранения активна');
  ok(/^\d+ \/ \d+$/.test((await h1.locator('xpath=ancestor::div[contains(@class,"tx-f")]').locator('.counter').innerText()).trim()), 'счётчик символов');
  await p.goto(base + '/admin/#/texts/contacts'); await p.reload(); await p.waitForSelector('.shell'); await go(p, '#/texts', '.draft-note');
  ok(await p.locator('.draft-note').isVisible(), 'после перезагрузки найден черновик'); await p.click('.draft-note button.primary'); await go(p, '#/texts/contacts', '.tx-f');
  ok(await p.locator('#tx-contacts\\.hero\\.h1').inputValue() === 'Мы на связи — Астрея', 'черновик восстановлен');
  await p.keyboard.press('Control+s'); ok(/сайт пересобран/.test(await toast(p)), 'Ctrl+S сохраняет и пересобирает сайт'); ok(read('contacts.html').includes('Мы на связи — Астрея'), 'новый заголовок на странице «Контакты»');
  await p.locator('#tx-contacts\\.hero\\.h1').fill('<b>'); ok(await p.locator('.tx-f.bad').count() === 1, 'недопустимые символы подсвечены'); await p.locator('#tx-contacts\\.hero\\.h1').fill('Мы на связи — Астрея');
  await p.locator('.tx-f:has(#tx-contacts\\.hero\\.h1) button:has-text("Вернуть исходный")').click(); ok(await p.locator('#tx-contacts\\.hero\\.h1').inputValue() === 'Свяжитесь с Астрея', '«Вернуть исходный» возвращает текст'); await p.click('.savebar .btn.primary'); await toast(p);
  ok(read('contacts.html').includes('Свяжитесь с Астрея') && JSON.stringify(rdj('data/texts.json').items) === '{}', 'после возврата данные снова пусты');
  await go(p, '#/texts', '#tx-q'); await p.fill('#tx-q', 'Как добраться'); await p.waitForSelector('.tx-sr'); ok(await p.locator('.tx-sr').count() >= 1, 'поиск по всем текстам находит поле');

  console.log('Товары и витрина');
  await go(p, '#/products', 'table.tbl tbody tr'); const rows0 = await p.locator('table.tbl tbody tr').count();
  await p.click('#add-item'); await p.waitForSelector('.dlg .pe'); await p.locator('.dlg input[type=text]').first().fill('Тестовая сыворотка Альфа'); await p.fill('.dlg textarea', 'Проверочное описание нового товара для витрины и каталога.');
  await p.locator('.dlg .bp-photo-field input[type=file]').setInputFiles({name: 'foto.png', mimeType: 'image/png', buffer: PNG}); await p.waitForFunction(() => !!document.querySelector('.dlg .bp-pv img'), null, {timeout: 20000});
  const img = await p.locator('.dlg .bp-pv img').getAttribute('src'); ok(/^\/assets\/products\/.+\.webp$/.test(img), 'фото сжато в WebP', img);
  await p.locator('.dlg label:has-text("Новинка") input').check(); await p.locator('.dlg label:has-text("Показывать на витрине") input').check(); await p.waitForTimeout(500); await p.screenshot({path: path.join(OUT, '02-product-editor.png')});
  await p.keyboard.press('Control+s'); await toast(p); await p.waitForSelector('.dlg', {state: 'detached'});
  const np = rdj('data/products.json').find(x => x.name === 'Тестовая сыворотка Альфа'); ok(np && np.featured && np.isNew && /\.webp$/.test(np.image || ''), 'товар сохранён с фото, меткой и витриной', np);
  const wp = fs.readFileSync(path.join(S.root, np.image)); ok(wp.slice(0, 4).toString() === 'RIFF' && wp.slice(8, 12).toString() === 'WEBP', 'на диске настоящий WebP', wp.length);
  ok(fs.existsSync(path.join(S.root, 'products', np.slug + '.html')) && read('catalog.html').includes('Тестовая сыворотка Альфа'), 'страница товара и каталог обновились'); ok(await p.locator('table.tbl tbody tr').count() === rows0 + 1, 'строка появилась в списке');
  await p.fill('input[type=search]', 'Альфа'); await p.waitForTimeout(200); await p.locator('table.tbl tbody tr .pr-chk input').first().check(); ok(await p.locator('.bulk').isVisible(), 'появилась панель массовых действий');
  await p.locator('.bulk button:has-text("Снять с витрины")').click(); await toast(p); ok(rdj('data/products.json').find(x => x.id === np.id).featured === false, 'массово снято с витрины');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Экспорт CSV")')]); const csv = fs.readFileSync(await dl.path(), 'utf8'); ok(csv.includes('Тестовая сыворотка Альфа') && csv.startsWith('\ufeffid;адрес;бренд'), 'экспорт CSV с заголовками'); await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
  const csv2 = csv.replace('Тестовая сыворотка Альфа', 'Тестовая сыворотка Бета').replace(/;нет;нет;/, ';нет;да;');
  await p.click('button:has-text("Импорт CSV")'); await p.waitForSelector('.dlg input[type=file]'); await p.setInputFiles('.dlg input[type=file]', {name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv2, 'utf8')}); await p.waitForSelector('.dlg .alert.ok, .dlg .alert.warn');
  const impTxt = (await p.locator('.dlg .alert, .dlg li').allInnerTexts()).join(' | '); ok(/обновлено: 1/.test(impTxt) && !/Проблем/.test(impTxt), 'импорт показывает итог перед применением и без проблем', impTxt); await p.click('.dlg footer .btn.primary'); await toast(p);
  ok(rdj('data/products.json').some(x => x.name === 'Тестовая сыворотка Бета'), 'импорт обновил товар');
  await p.fill('input[type=search]', 'Бета'); await p.waitForTimeout(200); await p.locator('table.tbl tbody tr .pr-chk input').first().check(); p.once('dialog', d => d.accept()); await p.locator('.bulk button:has-text("Удалить")').click(); await act(p, () => p.click('.dlg button.danger'));
  ok(!fs.existsSync(path.join(S.root, 'products', np.slug + '.html')), 'удалённый товар исчез с сайта', rdj('data/products.json').filter(x => /Тестовая/.test(x.name)).map(x => x.name + ' ' + x.slug));

  console.log('Газета и новости');
  await go(p, '#/news', 'table.tbl'); await p.click('.dtabs button:nth-child(2)'); await p.waitForSelector('.paper-grid select');
  const first = p.locator('#sl-promo'), cur = await first.inputValue(), other = (await first.locator('option').evaluateAll(o => o.map(x => x.value).filter(Boolean))).find(v => v !== cur);
  await first.selectOption(other); await act(p, () => p.click('.card .btn.primary')); ok(rdj('data/news.json').layout.slots.promo === other, 'слот газеты сохранён в data/news.json → layout');
  { const sl = rdj('data/news.json').items.find(n => n.id === other).slug, html = read('news/' + sl + '.html'); ok(/К газете, стр\. 2–3/.test(html), 'новость стоит на страницах 2–3', [other, cur, (html.match(/К газете[^<]*/) || [])[0]]); }
  await p.click('.dtabs button:nth-child(1)'); await p.waitForSelector('table.tbl'); await p.click('#add-item'); await p.waitForSelector('.dlg .pe'); await p.locator('.dlg input[type=text]').first().fill('Простая новость без картинки'); await p.fill('.dlg textarea >> nth=0', 'Короткий анонс.'); await p.locator('.dlg textarea >> nth=1').fill('Единственный абзац.');
  await p.keyboard.press('Control+s'); await toast(p); ok(rdj('data/news.json').items.some(n => n.title === 'Простая новость без картинки' && !n.image && !n.cta), 'новость без картинки, кнопки и связей сохранилась'); ok(!!read('news/' + AD_slug(rdj('data/news.json'), 'Простая новость без картинки') + '.html'), 'страница новости собралась');

  console.log('Картинки');
  await go(p, '#/files', '.lib-grid'); await p.locator('input[type=file][multiple]').setInputFiles({name: 'obl.png', mimeType: 'image/png', buffer: PNG}); await p.waitForSelector('.up-state .pill.done', {timeout: 20000});
  await p.locator('.lib-grid .file .pick-btn').first().click(); await p.waitForSelector('.dlg .lib-big'); ok(await p.locator('.dlg .alert.ok').isVisible(), 'новая картинка: «нигде не используется»');
  await p.fill('#alt-i', 'Проверочная картинка'); await p.click('button:has-text("Сохранить подпись")'); await toast(p); ok(rdj('data/media.json').alt[Object.keys(rdj('data/media.json').alt)[0]] === 'Проверочная картинка', 'подпись (alt) сохранена');
  await p.fill('#rn-i', 'osennyaya'); await p.click('button:has-text("Переименовать")'); await toast(p); ok(fs.readdirSync(path.join(S.root, 'assets/uploads')).some(f => /^osennyaya.*\.webp$/.test(f)) || fs.readdirSync(path.join(S.root, 'assets/uploads')).some(f => /^osennyaya/.test(f)), 'файл переименован');
  await p.locator('.lib-grid .file .pick-btn').first().click(); await p.waitForSelector('.dlg .lib-big'); await p.click('.dlg footer .btn.danger'); await p.click('.dlg .btn.danger >> nth=-1'); await toast(p).catch(() => {}); await p.waitForTimeout(400);

  console.log('Публикация, история, роли');
  await go(p, '#/publish', '.card'); ok(/PUBLISH_GIT/.test(await p.locator('body').innerText()), 'публикация без PUBLISH_GIT объясняет, как включить');
  await go(p, '#/history', 'table.tbl'); ok(await p.locator('table.tbl tbody tr').count() >= 3, 'в истории есть сохранённые версии'); await p.locator('table.tbl tbody tr button:has-text("Что изменилось")').first().click(); await p.waitForSelector('.dlg table.tbl, .dlg .muted'); ok(await p.locator('.dlg').isVisible(), 'сравнение «было/стало» открывается'); await p.keyboard.press('Escape');
  await p.keyboard.press('Control+k'); await p.waitForSelector('.pal input'); await p.fill('.pal input', 'газета'); await p.waitForTimeout(300); ok(await p.locator('.pal li button').count() >= 1, 'Ctrl+K: быстрый переход работает'); await p.keyboard.press('Escape');
  const e = await mk(1440, 900, true); const ids = await e.locator('.side a.nav[data-id]').evaluateAll(a => a.map(x => x.dataset.id));
  ok(['texts', 'news', 'products', 'files', 'publish', 'history', 'security'].every(x => ids.includes(x)) && !['settings', 'users', 'audit', 'backups', 'integrations', 'leads', 'privacy', 'launch'].some(x => ids.includes(x)), 'редактор видит содержимое и не видит настройки, пользователей, журнал, копии', ids);
  await e.evaluate(() => { location.hash = '#/settings'; }); await e.waitForTimeout(500); ok(/#\/overview/.test(await e.evaluate(() => location.hash)), 'прямой переход редактора в «Настройки» перенаправляет'); await e.context().close();

  console.log('Планшет и телефон');
  for (const [w, h, name] of [[820, 1100, 'tablet'], [390, 844, 'phone']]) {
    const q = await mk(w, h);
    for (const r of ['#/overview', '#/texts/contacts', '#/products', '#/news', '#/events', '#/contacts', '#/files', '#/publish']) { await go(q, r); await q.waitForTimeout(300); const over = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(over <= 1, name + ' ' + r + ': нет горизонтальной прокрутки', over); }
    await q.click('.topbar button'); await q.waitForSelector('body.nav-open'); ok(await q.isVisible('.side a.nav[data-id=texts]'), name + ': меню открывается кнопкой ☰'); await q.screenshot({path: path.join(OUT, '10-' + name + '-menu.png')}); await q.context().close();
  }
  ok(!p.__errs.length, 'в консоли админки нет ошибок', p.__errs);
  await browser.close(); await S.close(); console.log(`\nИтого: ✓ ${pass}, ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('Сбой e2e:', e.message); process.exit(1); });
function AD_slug(news, title) { return (news.items.find(n => n.title === title) || {}).slug; }
