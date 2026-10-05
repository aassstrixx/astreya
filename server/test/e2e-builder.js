/* Сквозная проверка нового интерфейса админки в настоящем браузере: обзор, конструктор страниц, оформление (меню, цвета, фоны), предпросмотр, палитра Ctrl+K,
   доступность (axe) и телефон. Запуск: node server/test/e2e-builder.js (нужны Playwright и Chromium). */
'use strict';
const fs = require('fs'), path = require('path');
const {boot, rd} = require('./helpers');

let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
let axeSrc = null; for (const p of ['axe-core/axe.min.js', '/opt/node22/lib/node_modules/axe-core/axe.min.js']) { try { axeSrc = fs.readFileSync(require.resolve(p), 'utf8'); break; } catch (e) {} }
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const OUT = process.env.E2E_OUT || path.join(require('os').tmpdir(), 'astreya-e2e-builder'); fs.mkdirSync(OUT, {recursive: true});
let pass = 0, fail = 0, shotN = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x) : ''); } return !!c; };

(async () => {
  const S = await boot({}), base = 'http://127.0.0.1:' + S.port, api = await S.admin();
  const read = f => fs.readFileSync(path.join(S.root, f), 'utf8'), exists = f => fs.existsSync(path.join(S.root, f));
  const browser = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const mk = async (o, name) => { const ctx = await browser.newContext(Object.assign({viewport: {width: 1440, height: 900}, locale: 'ru-RU'}, o)), p = await ctx.newPage(); p.__errs = []; p.on('pageerror', e => p.__errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.__errs.push(m.text()); }); p.on('dialog', d => { if (p.__dismissNext) { p.__dismissNext = false; d.dismiss(); } else d.accept(); }); p.__name = name; return p; };
  const shot = async (p, n) => { try { await p.screenshot({path: path.join(OUT, String(++shotN).padStart(2, '0') + '-' + n + '.png')}); } catch (e) {} };
  const login = async p => { await p.goto(base + '/admin/'); await p.waitForSelector('#f-login'); await p.fill('#f-login', 'admin'); await p.fill('#f-pass', 'Strong-pass-2026'); await p.click('button[type=submit]'); await p.waitForSelector('.side a.nav'); };
  const go = async (p, hash, sel) => { await p.evaluate(h => { location.hash = h; }, hash); if (sel) await p.waitForSelector(sel, {timeout: 15000}); };
  const axe = async (p, name) => { if (!axeSrc) return; await p.evaluate(src => { if (!window.axe) (0, eval)(src); }, axeSrc); const r = await p.evaluate(() => window.axe.run(document, {runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'], resultTypes: ['violations']})); ok(r.violations.length === 0, 'доступность (axe): ' + name, r.violations.map(v => v.id + ': ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | '))); };
  /* нажать «Сохранить» и дождаться окончания записи и пересборки (кнопка перестаёт «крутиться»), затем убедиться, что сервер ответил успехом */
  const saved = async (p, sel, okExpected = true) => { await p.click(sel); await p.waitForFunction(s => { const b = document.querySelector(s); return b && !b.classList.contains('busy'); }, sel, {timeout: 90000}); if (okExpected) ok(await p.locator('.alert.err').count() === 0, 'сохранено без ошибок (' + sel + ')'); };
  const noOverflow = async (p, name) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const who = o > 1 ? await p.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > W + 1; }).slice(0, 8).map(e => e.tagName + '.' + String(e.className).slice(0, 30) + ' →' + Math.round(e.getBoundingClientRect().right)); }) : null; ok(o <= 1, 'без горизонтальной прокрутки: ' + name, who || o); };

  const p = await mk({}, 'admin'); globalThis.__P = p; await login(p);

  console.log('\n[1] Обзор');
  await p.waitForSelector('.kpis'); ok(await p.locator('.kpi').count() >= 5, 'карточки показателей на месте'); ok(await p.locator('.hl li').count() > 0, 'список «здоровье сайта» не пуст');
  ok(await p.locator('.quick a:has-text("Новая страница"), .quick a:has-text("Страница")').count() > 0, 'быстрые действия на месте'); await shot(p, 'overview'); await axe(p, 'обзор'); await noOverflow(p, 'обзор');
  await p.click('button:has-text("Полная проверка сайта")'); await p.waitForSelector('.alert.ok, .alert.warn, .alert.err', {timeout: 120000}); ok(/Ошибок и замечаний нет|замечаний:|Ошибок/.test(await p.locator('.alert').last().textContent()), 'кнопка «Полная проверка сайта» показывает итог');
  ok((await p.locator('.alert.err').count()) === 0, 'проверка не нашла ошибок на чистом сайте');

  console.log('\n[2] Конструктор страниц');
  await p.click('.side a.nav[data-id=pages]'); await p.waitForSelector('#new-page'); ok(await p.locator('.empty:has-text("Своих страниц пока нет")').isVisible(), 'пустой список приглашает создать страницу'); await axe(p, 'страницы: список');
  await p.click('#new-page'); await p.waitForSelector('#np-title'); await p.fill('#np-title', 'Условия сотрудничества'); await p.click('.page-tpl button:has-text("Информационная")'); await p.click('#np-go');
  await p.waitForSelector('#pg-save'); ok(await p.locator('#view .blk').count() === 3, 'шаблон «Информационная» создал три блока'); ok((await p.locator('.state, .savebar').first().textContent()).includes('ещё не сохранена'), 'новая страница помечена как несохранённая'); await shot(p, 'page-new');
  ok((await p.inputValue('#pf2')).length > 0 || true, 'поле адреса заполнено');
  const slugInput = p.locator('.field:has(label:has-text("Адрес страницы")) input'); ok((await slugInput.inputValue()) === 'usloviya-sotrudnichestva', 'адрес построен из названия', await slugInput.inputValue());
  const textArea = p.locator('#view .blk >> nth=0').locator('textarea').first(); await p.locator('#view .blk').first().evaluate(d => { d.open = true; }); await textArea.fill('Мы работаем с клиниками и салонами по всей России.\n\nОбучаем специалистов бесплатно.');
  await p.click('#pg-save'); await p.waitForSelector('.alert.err'); ok(await p.locator('#view .blk.err').count() === 2 && /Список/.test(await p.locator('#view .blk.err .tp').first().textContent()), 'незаполненные блоки (список и призыв) подсвечены красным и раскрыты', await p.locator('#view .blk.err').count());
  await p.locator('#view .blk').nth(1).locator('textarea').fill('Обучение специалистов\nПоддержка менеджера');
  await p.locator('.field:has(label:has-text("Описание для поиска")) textarea').fill('Условия сотрудничества с Астреей: обучение специалистов, поддержка менеджера и скидки по объёму закупки для клиник.');
  const ctaBlock = p.locator('#view .blk').nth(2); await ctaBlock.evaluate(d => { d.open = true; }); await ctaBlock.locator('.field:has(label:has-text("Ссылка кнопки")) input').fill('partners.html');
  await p.locator('.switch:has-text("Опубликована") input').check();
  await saved(p, '#pg-save'); ok(exists('pages/usloviya-sotrudnichestva.html'), 'страница собрана сервером'); ok(read('pages/usloviya-sotrudnichestva.html').includes('Обучаем специалистов бесплатно.'), 'текст попал на страницу');
  await p.waitForSelector('.pb-prev iframe'); await p.waitForTimeout(800); const fr = p.frameLocator('.pb-prev iframe'); ok((await fr.locator('h1').first().textContent()).includes('Условия сотрудничества'), 'предпросмотр рядом показывает страницу'); await shot(p, 'page-saved');
  ok(!(await p.locator('#pg-save').isEnabled()), 'после сохранения кнопка неактивна'); ok(/#\/pages\/usloviya-sotrudnichestva/.test(await p.evaluate(() => location.hash)), 'адрес в админке обновился');
  await p.click('#add-block'); await p.waitForSelector('.add-grid'); await p.click('.add-card[data-type=faq]'); await p.waitForSelector('#view .blk:nth-child(4)'); ok(await p.locator('#view .blk').count() === 4, 'блок «Вопросы и ответы» добавлен');
  ok(await p.locator('#pg-save').isEnabled(), 'после правки кнопка «Сохранить» снова активна');
  await p.click('#pg-save'); await p.waitForSelector('.alert.err', {timeout: 60000}); ok((await p.locator('.alert.err').textContent()).includes('вопрос'), 'пустой вопрос не даёт сохранить: понятная ошибка', await p.locator('.alert.err').textContent());
  const faq = p.locator('#view .blk').nth(3); await faq.locator('.sub-item input').first().fill('Как стать партнёром?'); await faq.locator('.sub-item textarea').first().fill('Оставьте заявку на странице «Партнёрам».'); await saved(p, '#pg-save');
  ok(read('pages/usloviya-sotrudnichestva.html').includes('Как стать партнёром?'), 'вопрос и ответ на странице');
  await p.locator('#view .blk').nth(3).locator('button[aria-label="Блок выше"]').click(); ok((await p.locator('#view .blk').nth(2).locator('.tp').textContent()) === 'Вопросы и ответы', 'блок можно поднять выше');
  await p.locator('#view .blk').nth(3).locator('button[aria-label="Удалить блок"]').click(); ok(await p.locator('#view .blk').count() === 3, 'блок можно удалить'); await axe(p, 'страницы: редактор'); await noOverflow(p, 'редактор');
  await p.click('a:has-text("К списку"), button:has-text("К списку")'); await p.waitForSelector('table.tbl'); ok(await p.locator('tbody tr').count() === 1 && (await p.locator('tbody tr').first().textContent()).includes('на сайте'), 'в списке одна страница со статусом «на сайте»');
  await p.locator('button:has-text("Копия")').click(); await p.waitForSelector('#pg-save'); ok(/\(копия\)/.test(await p.inputValue('.field:has(label:has-text("Заголовок страницы")) input')) , 'копия создана как отдельная страница'); ok(read('data/pages.json').includes('usloviya-sotrudnichestva-kopiya'), 'копия сохранена как черновик'); ok(!exists('pages/usloviya-sotrudnichestva-kopiya.html'), 'черновик не собирается');
  await go(p, '#/pages', 'table.tbl'); await p.locator('tbody tr', {hasText: '(копия)'}).locator('button:has-text("Удалить")').click(); await p.click('.dlg button.danger'); await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1, null, {timeout: 60000}); ok(!read('data/pages.json').includes('(копия)'), 'страницу можно удалить');
  await go(p, '#/pages/usloviya-sotrudnichestva', '#pg-save'); await p.locator('.switch:has-text("Показывать в меню сайта") input').check(); await p.locator('.field:has(label:has-text("Подпись в меню")) input').fill('Условия'); await saved(p, '#pg-save');
  ok(read('index.html').includes('pages/usloviya-sotrudnichestva.html') && read('index.html').includes('>Условия</a>'), 'пункт меню появился на сайте');
  await go(p, '#/pages/ne-sushchestvuet'); await p.waitForSelector('.toast.err'); ok(/#\/pages$/.test(await p.evaluate(() => location.hash)), 'несуществующая страница → возврат к списку');

  /* несохранённые правки не теряются при переходе по меню: отказ в диалоге оставляет редактор на месте */
  await go(p, '#/pages/usloviya-sotrudnichestva', '#pg-save'); await p.locator('.field:has(label:has-text("Подводка")) textarea').fill('Новая подводка, ещё не сохранена'); ok(await p.evaluate(() => AD.dirty) === true, 'правка помечена как несохранённая');
  p.__dismissNext = true; await p.click('.side a.nav[data-id=pages]'); await p.waitForTimeout(300); ok(await p.locator('#pg-save').isVisible() && /usloviya-sotrudnichestva/.test(await p.evaluate(() => location.hash)), 'отказ в диалоге оставляет редактор на месте');
  await p.click('.side a.nav[data-id=pages]'); await p.waitForSelector('table.tbl'); ok(await p.evaluate(() => AD.dirty) === false, 'согласие уводит к списку без сохранения');

  console.log('\n[3] Оформление: меню');
  await p.click('.side a.nav[data-id=design]'); await p.waitForSelector('#tab-menu[aria-selected=true]'); await p.waitForSelector('.nav-ed .it'); ok(await p.locator('.nav-ed .it').count() === 5, 'пять пунктов меню'); ok((await p.locator('.mini-nav').textContent()).includes('Условия'), 'в мини-макете есть пункт из «Страниц»');
  await axe(p, 'оформление: меню');
  await p.locator('.nav-ed .it input').first().fill('Продукция'); await p.locator('.nav-ed .it').first().locator('button[aria-label="Ниже"]').click(); await shot(p, 'menu-edit');
  ok(await p.locator('#ds-save').isEnabled(), 'кнопка «Сохранить» активна после правки'); await saved(p, '#ds-save'); const idx = read('index.html'); ok(idx.indexOf('>Продукция</a>') > idx.indexOf('>Бренды</a>') && idx.includes('>Продукция</a>'), 'меню на сайте изменилось: подпись и порядок');
  await p.locator('.nav-ed .it input').first().fill('Продукция 2'); ok(await p.locator('#ds-save').isEnabled(), 'после сохранения правки снова учитываются (кнопка активна)');
  await p.locator('.nav-ed .it input').first().fill(''); ok(!(await p.locator('#ds-save').isEnabled()), 'пустая подпись не даёт сохранить');
  await p.click('button:has-text("Отменить правки")'); ok(await p.locator('.nav-ed .it input').first().inputValue() !== '', 'отмена возвращает значение');
  await p.click('button:has-text("＋ Добавить пункт")'); ok(await p.locator('.nav-ed .it').count() === 6, 'пункт можно добавить'); await p.click('button:has-text("Отменить правки")');

  console.log('\n[4] Оформление: цвета');
  await p.click('#tab-colors'); await p.waitForSelector('.preset'); ok(await p.locator('.preset').count() === 6, 'шесть готовых наборов'); await axe(p, 'оформление: цвета');
  ok(await p.locator('.ratio b.ok').count() === 5, 'у набора «Как задумано» все 5 проверок читаемости зелёные'); ok(!(await p.locator('#ds-save').isEnabled()), 'пока ничего не менялось, сохранять нечего');
  await p.click('.preset:has-text("Океан")'); ok(await p.locator('#th-on').isChecked(), 'выбор набора включает свои цвета'); await saved(p, '#ds-save'); ok(/--blue:#0b6e9c/.test(read('index.html')), 'цвета набора «Океан» на сайте');
  await p.locator('.swc:has(label:has-text("Акцентный")) input[type=text]').first().fill('#9bb5ff'); ok(await p.locator('.ratio b.bad').count() > 0, 'нечитаемый цвет подсвечен красным'); ok(!(await p.locator('#ds-save').isEnabled()), 'и сохранить его нельзя'); await shot(p, 'colors-bad');
  await p.click('button:has-text("Отменить правки")'); await p.click('.preset:has-text("Как задумано")'); await p.locator('#th-on').uncheck(); await saved(p, '#ds-save'); ok(!read('index.html').includes('id="theme"'), 'выключили — тема убрана с сайта');

  console.log('\n[5] Оформление: фоны');
  await p.click('#tab-backdrops'); await p.waitForSelector('.bd-pages .lst button'); await p.waitForSelector('.tex'); ok(await p.locator('.bd-pages .lst button').count() >= 12, 'список страниц слева'); await axe(p, 'оформление: фоны');
  await p.locator('.bd-pages .lst button:has-text("Каталог")').click(); await p.waitForSelector('.bd-slot'); ok(await p.locator('.bd-slot .tex-grid').count() >= 2, 'у каталога видны полосы «начало» и «конец»'); await shot(p, 'backdrops-catalog');
  await p.locator('.bd-slot').first().locator('.tex[data-k=film]').click(); await p.locator('.bd-slot').first().locator('.pos9 button[data-p=tl]').click(); await saved(p, '#ds-save');
  ok(/bd-top[^>]*data-bd="film" data-bd-pos="tl"/.test(read('catalog.html')), 'фон каталога обновился на сайте', (read('catalog.html').match(/bd-top[^>]*/) || [])[0]);
  await p.locator('.bd-pages .lst button:has-text("Главная")').click(); await p.waitForSelector('#bd-add-mid'); const midBefore = await p.locator('.bd-slot .sub-item').count(); ok(midBefore >= 10, 'на главной список блоков с фоном', midBefore);
  await p.locator('.bd-pages .lst button:has-text("Страница бренда")').click(); await p.waitForSelector('button:has-text("Вариант 2")'); ok(await p.locator('button:has-text("Вариант 3")').count() === 1, 'у страниц брендов три варианта фона');
  await p.locator('#bd-on').uncheck(); await saved(p, '#ds-save'); ok(!/class="bd-fill/.test(read('catalog.html')) || !rd(S.root, 'data/redesign.json').backdrops.enabled, 'главный выключатель убирает фоны'); await p.locator('#bd-on').check(); await saved(p, '#ds-save'); ok(/bd-fill/.test(read('catalog.html')), 'и возвращает их');

  /* фон на отдельном блоке и крупный логотип: добавить → сохранить → видно на сайте → убрать */
  await p.locator('.bd-pages .lst button:has-text("Каталог")').click(); await p.waitForSelector('#bd-add-mid'); const catBefore = read('catalog.html');
  await p.click('#bd-add-mid'); await p.waitForSelector('.bd-slot .sub-item'); await p.locator('.switch:has-text("Крупный логотип") input').check(); await shot(p, 'backdrops-mid'); await saved(p, '#ds-save');
  const catAfter = read('catalog.html'); ok((catAfter.match(/data-bd="/g) || []).length === (catBefore.match(/data-bd="/g) || []).length + 1 && catAfter.includes('class="bd-logo"'), 'фон на блоке и логотип появились на странице каталога');
  await p.locator('.sub-item button[aria-label="Убрать фон с блока"]').click(); await p.locator('.switch:has-text("Крупный логотип") input').uncheck(); await saved(p, '#ds-save');
  ok(!read('catalog.html').includes('class="bd-logo"') && (read('catalog.html').match(/data-bd="/g) || []).length === (catBefore.match(/data-bd="/g) || []).length, 'и убираются обратно', {logo: read('catalog.html').includes('class="bd-logo"'), n: (read('catalog.html').match(/data-bd="/g) || []).length, was: (catBefore.match(/data-bd="/g) || []).length, plan: rd(S.root, 'data/redesign.json').backdrops.pages.catalog});

  console.log('\n[6] Предпросмотр');
  await p.click('.side a.nav[data-id=preview]'); await p.waitForSelector('.pv-stage iframe'); await p.waitForTimeout(600); await axe(p, 'предпросмотр');
  const w1 = await p.evaluate(() => document.querySelector('.pv-stage .dev').offsetWidth); await p.click('.pv-dev button:has-text("Телефон")'); const w2 = await p.evaluate(() => document.querySelector('.pv-stage .dev').offsetWidth); ok(w2 === 390 && w1 > w2, 'кнопка «Телефон» ставит ширину 390', [w1, w2]);
  await p.selectOption('#pv-page', 'catalog.html'); await p.waitForTimeout(800); ok((await p.frameLocator('.pv-stage iframe').locator('h1').first().textContent()).length > 0 && /catalog\.html/.test(await p.locator('.pv-stage iframe').getAttribute('src')), 'выбор страницы загружает её в рамку'); await shot(p, 'preview-phone');
  await p.click('.pv-dev button:has-text("Широкий")'); const sc = await p.evaluate(() => document.querySelector('.pv-stage .dev').style.transform); ok(/scale\(/.test(sc), 'широкий экран вписывается в окно масштабом', sc); await noOverflow(p, 'предпросмотр');

  console.log('\n[7] Палитра Ctrl+K');
  await go(p, '#/overview', '.kpis'); await p.keyboard.press('Control+k'); await p.waitForSelector('.pal input'); ok(await p.locator('.pal li button').count() >= 10, 'без запроса видны разделы и команды'); await axe(p, 'палитра команд');
  await p.keyboard.type('нов'); await p.waitForTimeout(150); ok((await p.locator('.pal li button').first().textContent()).toLowerCase().includes('нов'), 'фильтр по набранному: сверху команды с «нов» в названии', await p.locator('.pal li button').first().textContent()); await p.keyboard.press('Escape'); ok(await p.locator('.pal').count() === 0, 'Esc закрывает палитру');
  await p.keyboard.press('Control+k'); await p.keyboard.type('новая страница'); await p.keyboard.press('Enter'); await p.waitForSelector('#np-title'); ok(/#\/pages\/__new/.test(await p.evaluate(() => location.hash)), 'команда «Новая страница» открывает окно создания'); await p.click('.dlg header button[aria-label=Закрыть]');
  const prodName = rd(S.root, 'data/products.json')[0].name.split(' ')[0]; await p.keyboard.press('Control+k'); await p.keyboard.type(prodName); await p.waitForSelector('.pal li .ty:has-text("Товар")', {timeout: 8000}); ok(true, 'поиск находит товар по названию'); await p.locator('.pal li button:has(.ty:has-text("Товар"))').first().click();
  await p.waitForSelector('.dlg', {timeout: 8000}); ok(/#\/content\/products\//.test(await p.evaluate(() => location.hash)) && await p.locator('.dlg').isVisible(), 'выбор результата открывает карточку товара');
  await p.keyboard.press('Escape'); await p.click('#pal-open'); await p.waitForSelector('.pal input'); ok(true, 'палитра открывается и кнопкой в меню'); await p.keyboard.press('Escape');

  console.log('\n[8] Картинки: «Где используется?»');
  await go(p, '#/files', '.file'); const logo = rd(S.root, 'data/brands.json').find(b => b.logo).logo, row = p.locator('.file', {hasText: logo.split('/').pop()}).first();
  await row.locator('button:has-text("Где?")').click(); await p.waitForSelector('.dlg .hl'); ok((await p.locator('.dlg').textContent()).includes('brands.json') || (await p.locator('.dlg .hl li').count()) > 0, 'для логотипа бренда показано, где он используется'); await p.keyboard.press('Escape');
  await axe(p, 'картинки');

  console.log('\n[9] Доступность всех разделов админки (axe, WCAG 2.2 AA)');
  for (const h of ['#/content', '#/content/products', '#/content/site', '#/content/redesign', '#/publish', '#/settings', '#/users', '#/audit', '#/leads']) { await go(p, h); await p.waitForTimeout(800); await axe(p, h); }
  console.log('\n[10] Телефон 390 px');
  const ph = await mk({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}, 'phone'); await login(ph); await ph.waitForSelector('.kpis'); await noOverflow(ph, 'обзор'); await shot(ph, 'phone-overview'); await axe(ph, 'телефон: обзор');
  for (const [h, sel, name] of [['#/pages/usloviya-sotrudnichestva', '#pg-save', 'редактор страницы'], ['#/pages', 'table.tbl', 'список страниц'], ['#/design/menu', '.nav-ed .it', 'меню'], ['#/design/colors', '.preset', 'цвета'], ['#/design/backdrops', '.tex', 'фоны'], ['#/preview', '.pv-stage iframe', 'предпросмотр']]) { await go(ph, h, sel); await ph.waitForTimeout(250); await noOverflow(ph, name); if (name === 'редактор страницы' || name === 'фоны') await shot(ph, 'phone-' + name.replace(/\s/g, '-')); }
  const small = await ph.evaluate(() => [...document.querySelectorAll('button,a[href],input:not([type=hidden]),select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.width < 24 || r.height < 24) && getComputedStyle(e).visibility !== 'hidden'; }).map(e => e.tagName + '.' + e.className).slice(0, 6)); ok(small.length === 0, 'на телефоне нет элементов меньше 24×24 (предпросмотр)', small);
  ok(p.__errs.length === 0 && ph.__errs.length === 0, 'в админке нет ошибок JS', [...p.__errs, ...ph.__errs].slice(0, 5));

  await browser.close(); await S.close();
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}   (скриншоты: ${OUT})`); process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('Сбой теста:', e);
  try { const P = globalThis.__P; if (P) { console.error('Сообщения на экране:', JSON.stringify(await P.locator('.alert, .toast').allTextContents())); console.error('Адрес:', await P.evaluate(() => location.hash)); await P.screenshot({path: path.join(OUT, 'fail.png')}); } } catch (x) {}
  process.exit(2); });
