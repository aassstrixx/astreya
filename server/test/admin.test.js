/* Новая админка: тексты страниц, слоты газеты, новости без ссылок и картинок, товары и витрина, картинки (папки, переименование, удаление), роли, история с читаемым сравнением. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const {boot, client, rd} = require('./helpers');

let S, admin, editor;
const read = f => fs.readFileSync(path.join(S.root, f), 'utf8');
const exists = f => fs.existsSync(path.join(S.root, f));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const save = async (c, name, mut) => { const cur = (await c.get('/api/collections/' + name)).json; mut(cur.data); return c.put('/api/collections/' + name, {data: cur.data, version: cur.version}); };

test.before(async () => {
  S = await boot({}); admin = await S.admin();
  const r = await admin.post('/api/users', {login: 'redaktor', name: 'Редактор', role: 'editor', password: 'Edit-pass-Ключ-2026-x', mustChange: false});
  assert.equal(r.status, 200, r.text);
  editor = client(S.port, '10.9.9.8'); assert.equal((await editor.login('redaktor', 'Edit-pass-Ключ-2026-x')).status, 200); assert.equal((await editor.post('/api/password', {old: 'Edit-pass-Ключ-2026-x', new: 'Edit-pass-Ключ-2027-z'})).status, 200);   // временный пароль надо сменить
  editor = client(S.port, '10.9.9.8'); const l = await editor.login('redaktor', 'Edit-pass-Ключ-2027-z'); assert.equal(l.status, 200, l.text);
});
test.after(() => S.close());

/* ---------- тексты страниц ---------- */
test('тексты: реестр с сервера, правка попадает на страницу и экранируется, «вернуть исходный» возвращает прежнее', async () => {
  const reg = (await editor.get('/api/texts/registry')).json; assert.ok(reg.total > 500, 'в реестре много ключей'); assert.ok(reg.pages.length >= 14);
  const key = 'contacts.hero.h1', it = reg.pages.find(p => p.id === 'contacts').blocks.find(b => b.id === 'hero').items.find(i => i.key === key); assert.equal(it.def, 'Свяжитесь с Астрея');
  assert.ok(read('contacts.html').includes('Свяжитесь с Астрея'));
  let r = await save(editor, 'texts', d => { d.items[key] = 'Мы на связи — «Астрея» & команда'; }); assert.equal(r.status, 200, r.text); assert.equal(r.json.build.ok, true);
  const html = read('contacts.html'); assert.ok(html.includes('Мы на связи — «Астрея» &amp; команда'), 'текст изменился, & экранирован'); assert.ok(!html.includes('Свяжитесь с Астрея</h1>'));
  r = await save(editor, 'texts', d => { delete d.items[key]; }); assert.equal(r.status, 200); assert.ok(read('contacts.html').includes('Свяжитесь с Астрея'), 'исходный текст вернулся');
});
test('тексты: проверка — неизвестный ключ, слишком длинно, теги, пустое, ссылка', async () => {
  const bad = async (k, v, re) => { const r = await save(admin, 'texts', d => { d.items[k] = v; }); assert.equal(r.status, 422, k + ': ' + r.text); assert.match(r.json.error, re, k); };
  await bad('nope.key', 'x', /Неизвестный текст/); await bad('contacts.hero.h1', 'я'.repeat(500), /символов/); await bad('contacts.hero.h1', 'a <script>alert(1)</script>', /< и >/);
  await bad('contacts.hero.h1', '   ', /пусто/); await bad('contacts.topics.partners.pd', 'до {pct}% <iframe src=x>', /разрешены только теги/);
  await bad('contacts.topics.docs.h', 'javascript:alert(1)', /ссылка/); await bad('contacts.topics.docs.h', 'a b"><x', /ссылка/);
  assert.deepEqual(rd(S.root, 'data/texts.json').items, {}, 'ничего не сохранилось');
  const ok = await save(admin, 'texts', d => { d.items['contacts.topics.partners.pd'] = 'Скидка до {pct}%<br>за объём'; }); assert.equal(ok.status, 200, ok.text);
  assert.match(read('contacts.html'), /Скидка до <span data-count="\d+">\d+<\/span>%<br>за объём/, 'rich-тексты: <br> разрешён, значение подставилось');
  const lk = await save(admin, 'texts', d => { d.items['contacts.topics.docs.h'] = 'https://example.com/docs?a=1&b=2'; d.items['contacts.topics.catalog.h'] = 'training.html#sched'; }); assert.equal(lk.status, 200, lk.text);
  assert.match(read('contacts.html'), /href="https:\/\/example\.com\/docs\?a=1&amp;b=2" data-track="contacts_topic"/, 'внешняя ссылка плитки, & экранирован'); assert.match(read('contacts.html'), /href="training\.html#sched" data-track="contacts_topic"/, 'страница сайта со ссылкой-якорем');
  await save(admin, 'texts', d => { d.items = {}; });
});
test('тексты: редактор может, менеджер — нет; сайт без правок собирается тем же', async () => {
  const mgr = client(S.port, '10.9.9.7'); await admin.post('/api/users', {login: 'manager1', name: 'Менеджер', role: 'manager', password: 'Mgr-pass-Ключ-2026-y', mustChange: false});
  assert.equal((await mgr.login('manager1', 'Mgr-pass-Ключ-2026-y')).status, 200); await mgr.post('/api/password', {old: 'Mgr-pass-Ключ-2026-y', new: 'Mgr-pass-Ключ-2027-q'}); assert.equal((await mgr.get('/api/texts/registry')).status, 403); assert.equal((await mgr.get('/api/collections/texts')).status, 403);
  assert.equal((await editor.get('/api/collections/texts')).status, 200);
});

/* ---------- газета ---------- */
test('газета: слоты берутся из данных; повтор новости в двух слотах и неизвестный слот отклоняются; пустые слоты не ломают сборку', async () => {
  const meta = (await editor.get('/api/news/layout')).json; assert.equal(meta.defaults.promo, 'n1'); assert.equal(meta.pages.length, 10);
  const news = rd(S.root, 'data/news.json'), a = news.items.find(n => n.id === 'n1'), b = news.items.find(n => n.id === 'n3');
  assert.match(read('news/' + a.slug + '.html'), /К газете, стр\. 2–3/);
  let r = await save(editor, 'news', d => { d.layout = {slots: {promo: 'n3', newA: 'n1'}}; }); assert.equal(r.status, 200, r.text);
  assert.match(read('news/' + b.slug + '.html'), /К газете, стр\. 2–3/, 'новость n3 теперь на страницах 2–3'); assert.match(read('news/' + a.slug + '.html'), /К газете, стр\. 4/);
  r = await save(editor, 'news', d => { d.layout = {slots: {promo: 'n3', newA: 'n3'}}; }); assert.equal(r.status, 422); assert.match(r.json.error, /двух слотах/);
  r = await save(editor, 'news', d => { d.layout = {slots: {zzz: 'n3'}}; }); assert.equal(r.status, 422); assert.match(r.json.error, /неизвестный слот/);
  r = await save(editor, 'news', d => { d.layout = {slots: {promo: 'nope'}}; }); assert.equal(r.status, 422);
  r = await save(editor, 'news', d => { d.layout = {slots: Object.fromEntries(Object.keys(meta.defaults).map(k => [k, ''])) }; }); assert.equal(r.status, 200, r.text); assert.equal(r.json.build.ok, true, 'все слоты пусты — сайт собирается');
  r = await save(editor, 'news', d => { delete d.layout; }); assert.equal(r.status, 200); assert.match(read('news/' + a.slug + '.html'), /К газете, стр\. 2–3/, 'без layout — прежняя раскладка');
});
test('новости: без ссылок, кнопки и картинки собирается; с обложкой — картинка на странице; проверка полей', async () => {
  let r = await save(editor, 'news', d => { d.items.push({id: 'n99', slug: 'prostaya-novost', category: d.categories[0].id, date: '2026-11-20', title: 'Простая новость', excerpt: 'Короткий анонс.', body: ['Один абзац.']}); });
  assert.equal(r.status, 200, r.text); assert.ok(exists('news/prostaya-novost.html')); assert.ok(read('news.html').includes('Простая новость'), 'есть в архиве газеты');
  await admin.post('/api/files', {dir: 'assets/uploads/news', name: 'cover.png', data: PNG.toString('base64')});
  r = await save(editor, 'news', d => { const n = d.items.find(x => x.id === 'n99'); n.image = 'assets/uploads/news/cover.png'; n.imageAlt = 'Подпись'; }); assert.equal(r.status, 200, r.text);
  assert.match(read('news/prostaya-novost.html'), /assets\/uploads\/news\/cover\.png(\?v=[0-9a-f]+)?" alt="Подпись"/);
  const bad = async (mut, re) => { const x = await save(editor, 'news', mut); assert.equal(x.status, 422, x.text); assert.match(x.json.error, re); };
  await bad(d => { d.items.find(x => x.id === 'n99').body = []; }, /текст/); await bad(d => { d.items.find(x => x.id === 'n99').cta = {type: 'product', ref: 'net-takogo'}; }, /несуществующий товар/);
  await bad(d => { d.items.find(x => x.id === 'n99').related = {products: ['net']}; }, /связанные товары/); await bad(d => { d.items.find(x => x.id === 'n99').image = 'assets/uploads/news/net.png'; }, /нет в папке/);
  await bad(d => { d.items.push(Object.assign({}, d.items[0])); }, /повтор/);
  r = await save(editor, 'news', d => { d.items = d.items.filter(x => x.id !== 'n99'); }); assert.equal(r.status, 200); assert.ok(!exists('news/prostaya-novost.html'));
});

/* ---------- товары и витрина ---------- */
test('товары: новый товар появляется в каталоге, на странице и в «Рекомендуем»; повтор адреса и плохие поля отклоняются', async () => {
  const base = rd(S.root, 'data/products.json')[0];
  const np = {id: 'tst-1', slug: 'dermatime-test-syvorotka', brand: base.brand, cat: base.cat, kind: base.kind, type: 'dropper', name: 'Тестовая сыворотка Альфа', desc: 'Проверочное описание нового товара для витрины.', tasks: [base.tasks[0]], featured: true, isNew: true, docs: [], imageAlt: 'Флакон Альфа'};
  let r = await save(editor, 'products', d => { d.push(np); }); assert.equal(r.status, 200, r.text);
  assert.ok(exists('products/dermatime-test-syvorotka.html')); assert.ok(read('catalog.html').includes('Тестовая сыворотка Альфа'), 'в каталоге'); assert.ok(read('brands/' + base.brand + '.html').includes('Тестовая сыворотка Альфа'), 'на странице бренда');
  assert.ok(read('products/dermatime-test-syvorotka.html').includes('Тестовая сыворотка Альфа'));
  const bad = async (mut, re) => { const x = await save(editor, 'products', mut); assert.equal(x.status, 422, x.text); assert.match(x.json.error, re); };
  await bad(d => { d.push(Object.assign({}, np, {id: 'tst-2'})); }, /повтор/); await bad(d => { d.find(p => p.id === 'tst-1').featured = 'да'; }, /да или нет/);
  await bad(d => { d.find(p => p.id === 'tst-1').docs = [{title: 'Файл', url: 'javascript:alert(1)'}]; }, /документ/); await bad(d => { d.find(p => p.id === 'tst-1').desc = 'я'.repeat(700); }, /до 600/);
  await bad(d => { d.find(p => p.id === 'tst-1').type = 'sack'; }, /упаковки/); await bad(d => { d.find(p => p.id === 'tst-1').imageAlt = 'я'.repeat(200); }, /imageAlt/);
  r = await save(editor, 'products', d => { const p = d.find(x => x.id === 'tst-1'); p.featured = false; delete p.isNew; }); assert.equal(r.status, 200);
  r = await save(editor, 'products', d => { d.splice(d.findIndex(x => x.id === 'tst-1'), 1); }); assert.equal(r.status, 200); assert.ok(!exists('products/dermatime-test-syvorotka.html'), 'удалённый товар исчез с сайта');
});
test('бренды и справочники: новый бренд, категория; нельзя удалить используемое', async () => {
  const b0 = rd(S.root, 'data/brands.json')[0];
  let r = await save(editor, 'brands', d => { d.push(Object.assign({}, b0, {id: 'novyi-brend', name: 'Новый бренд', logo: null, desc: 'Новый бренд для проверки: описание отличается от остальных.', tag: 'Проверочный бренд', long: ['Новый бренд для проверки.'], facts: [['Страна', 'Испания']]})); }); assert.equal(r.status, 200, r.text); assert.ok(exists('brands/novyi-brend.html')); assert.ok(read('partners.html').includes('Новый бренд'), 'бренд без логотипа показывается названием'); assert.ok(read('brands.html').includes('Новый бренд'), 'есть в списке брендов');
  r = await save(editor, 'catalog', d => { d.cats.push({id: 'novaya-kat', name: 'Новая категория'}); }); assert.equal(r.status, 200, r.text);
  r = await save(editor, 'catalog', d => { d.cats = d.cats.filter(c => c.id !== rd(S.root, 'data/products.json')[0].cat); }); assert.equal(r.status, 422, 'категория с товарами');
  r = await save(editor, 'brands', d => { d.splice(d.findIndex(x => x.id === 'novyi-brend'), 1); }); assert.equal(r.status, 200);
});
test('мероприятия: формат, город и места проверяются', async () => {
  const e0 = rd(S.root, 'data/events.json')[0], bad = async (mut, re) => { const x = await save(editor, 'events', mut); assert.equal(x.status, 422, x.text); assert.match(x.json.error, re); };
  await bad(d => { d[0].fmt = 'Заочно'; }, /Очно/); await bad(d => { d[0].city = 'Урюпинск'; }, /нет в списке городов/); await bad(d => { d[0].seats = -3; }, /места/);
  const r = await save(editor, 'events', d => { d[0].seats = 25; d[0].speaker = 'Новый спикер'; }); assert.equal(r.status, 200, r.text); assert.ok(read('training/' + e0.slug + '.html').includes('Новый спикер'));
});

/* ---------- картинки ---------- */
test('картинки: подпапка, загрузка, список с размерами и использованием, переименование с обновлением ссылок, удаление только неиспользуемых, сцены только чтение', async () => {
  let r = await admin.post('/api/files/folder', {name: 'Новости 2026'}); assert.equal(r.status, 200, r.text); assert.equal(r.json.dir, 'assets/uploads/novosti-2026');
  assert.equal((await admin.post('/api/files/folder', {name: '../../etc'})).status, 200, 'название приводится к безопасному'); assert.ok(!exists('etc'));
  r = await editor.post('/api/files', {dir: 'assets/uploads/novosti-2026', name: 'Фото.png', data: PNG.toString('base64')}); assert.equal(r.status, 200, r.text); const p = r.json.path; assert.match(p, /^assets\/uploads\/novosti-2026\/foto\.png$/);
  assert.equal((await editor.post('/api/files', {dir: 'assets/bg', name: 'x.png', data: PNG.toString('base64')})).status, 400, 'в папку сцен загружать нельзя');
  assert.equal((await editor.post('/api/files', {dir: 'assets/uploads/..', name: 'x.png', data: PNG.toString('base64')})).status, 400);
  let ov = (await editor.get('/api/files/overview')).json; const f = ov.dirs.find(d => d.dir === 'assets/uploads/novosti-2026').files[0]; assert.equal(f.w, 1); assert.equal(f.h, 1); assert.deepEqual(ov.usage[p], undefined);
  assert.ok(ov.scenes.length >= 3 && ov.scenes.every(d => d.readonly), 'сцены помечены «только просмотр»'); assert.ok(ov.scenes.some(d => d.dir === 'assets/bg'));
  assert.equal((await editor.del('/api/files?path=assets/bg/cream.webp')).status, 400, 'фон нельзя удалить'); assert.ok(exists('assets/bg/cream.webp'));
  await save(editor, 'news', d => { d.items[0].image = p; });
  ov = (await editor.get('/api/files/overview')).json; assert.ok(ov.usage[p] && /Новости/.test(ov.usage[p][0].label), 'отмечено, где используется');
  r = await editor.del('/api/files?path=' + encodeURIComponent(p)); assert.equal(r.status, 409, 'используемую нельзя удалить');
  r = await editor.post('/api/files/rename', {path: p, name: 'Обложка осень'}); assert.equal(r.status, 200, r.text); assert.equal(r.json.path, 'assets/uploads/novosti-2026/oblozhka-osen.png');
  assert.equal(rd(S.root, 'data/news.json').items[0].image, 'assets/uploads/novosti-2026/oblozhka-osen.png', 'ссылка в данных обновилась'); assert.equal(r.json.build.ok, true);
  assert.equal((await editor.post('/api/files/rename', {path: r.json.path, name: 'x.exe'})).status, 200, 'расширение сохраняется'); const np = 'assets/uploads/novosti-2026/x.png'; assert.ok(exists(np));
  await save(editor, 'news', d => { delete d.items[0].image; });
  assert.equal((await editor.del('/api/files?path=' + encodeURIComponent(np))).status, 200); assert.ok(!exists(np));
  assert.equal((await editor.post('/api/files/rename', {path: 'assets/bg/cream.webp', name: 'z'})).status, 400);
});
test('подписи к картинкам: хранятся в data/media.json, проверяются', async () => {
  let r = await save(editor, 'media', d => { d.alt['assets/teachers/bondareva.webp'] = 'Наталья Бондарева'; }); assert.equal(r.status, 200, r.text);
  r = await save(editor, 'media', d => { d.alt['../etc/passwd'] = 'x'; }); assert.equal(r.status, 422); r = await save(editor, 'media', d => { d.alt = {'assets/a.png': 'я'.repeat(200)}; }); assert.equal(r.status, 422);
  await save(editor, 'media', d => { d.alt = {}; });
  const up = await editor.post('/api/files', {dir: 'assets/uploads', name: 'podpis.png', data: PNG.toString('base64')}); assert.equal(up.status, 200);
  assert.equal((await save(editor, 'media', d => { d.alt[up.json.path] = 'Подпись для удаления'; })).status, 200);
  assert.deepEqual((await editor.get('/api/files/overview')).json.usage[up.json.path], undefined, 'подпись не считается использованием картинки');
  assert.equal((await editor.del('/api/files?path=' + encodeURIComponent(up.json.path))).status, 200, 'картинку с подписью можно удалить'); assert.deepEqual(rd(S.root, 'data/media.json').alt, {}, 'подпись удалённой картинки убрана');
});

/* ---------- роли ---------- */
test('роли: редактор правит содержимое, но не настройки, пользователей, безопасность, журнал, копии и заявки', async () => {
  for (const u of ['/api/settings', '/api/users', '/api/audit', '/api/backups', '/api/launch', '/api/security', '/api/integrations', '/api/leads', '/api/privacy/registry', '/api/site.zip']) assert.equal((await editor.get(u)).status, 403, u);
  for (const u of ['/api/collections', '/api/files', '/api/overview', '/api/build', '/api/publish', '/api/site-pages', '/api/search?q=elastense']) assert.equal((await editor.get(u)).status, 200, u);
  assert.equal((await editor.get('/api/collections/integrations')).status, 403, 'подключения — только администратору'); assert.ok(!(await editor.get('/api/collections')).json.collections.some(c => c.name === 'integrations'));
  assert.equal((await editor.post('/api/assistant/test')).status, 403); assert.equal((await editor.put('/api/settings', {})).status, 403);
  const cfg = (await editor.get('/api/config')).json; assert.equal(cfg.roles.editor.startsWith('Редактор'), true);
  const meta = (await admin.get('/api/users')).json.users.find(u => u.login === 'redaktor'); assert.equal(meta.role, 'editor');
});

/* ---------- история и читаемое сравнение ---------- */
test('история: «что изменилось» словами — было и стало', async () => {
  await save(editor, 'news', d => { d.items[1].title = 'Заголовок после правки'; });
  const h = (await editor.get('/api/collections/news/history')).json.items; assert.ok(h.length >= 1);
  const d = (await editor.get('/api/collections/news/diff?id=' + encodeURIComponent(h[0].id))).json;
  assert.ok(d.changes.some(c => /title/.test(c.path) && c.to === 'Заголовок после правки' && c.kind === 'изменено'), JSON.stringify(d.changes).slice(0, 300));
  assert.equal((await editor.get('/api/collections/news/diff?id=nope')).status, 404);
  const rs = await editor.post('/api/collections/news/restore', {id: h[0].id}); assert.equal(rs.status, 200, rs.text);
});

test('витрина: фото товара показывается вместо упаковки только при включённом переключателе', async () => {
  const up = await editor.post('/api/files', {dir: 'assets/products', name: 'probnoe.png', data: PNG.toString('base64')}); assert.equal(up.status, 200, up.text);
  let r = await save(editor, 'products', d => { d[0].image = up.json.path; d[0].featured = true; }); assert.equal(r.status, 200, r.text);
  const uses = () => read('catalog.html').split(up.json.path).length - 1, off = uses();           // в классическом списке под витриной фото есть всегда; на самой витрине — только при переключателе
  r = await save(editor, 'redesign', d => { d.extras.showroomPhotos = true; }); assert.equal(r.status, 200, r.text);
  assert.ok(uses() > off, 'переключатель включён — фото появилось и на витрине'); assert.ok(read('products/' + rd(S.root, 'data/products.json')[0].slug + '.html').includes(up.json.path));
  r = await save(editor, 'redesign', d => { d.extras.showroomPhotos = false; }); assert.equal(r.status, 200); assert.equal(uses(), off, 'выключили — на витрине снова упаковка');
  await save(editor, 'products', d => { delete d[0].image; });
});

test('тексты из данных: content.json и redesign.json в «Тексты страниц» — правка пишется в свой файл, чужие правки не затираются', async () => {
  const d = (await editor.get('/api/texts/data')).json; assert.ok(d.pages.length >= 10 && d.versions.content && d.versions.redesign);
  const home = d.pages.find(p => p.id === 'home'), seo = d.pages.find(p => p.id === 'seo'); assert.ok(home.blocks.length > 10 && seo.blocks.length >= 10, 'главная и SEO собраны из данных');
  const f = home.blocks.flatMap(b => b.fields).find(x => x.id === 'content:home.h1'); assert.ok(f, 'заголовок героя главной найден'); const old = f.value;
  let r = await editor.post('/api/texts/data', {changes: [{coll: 'content', path: ['home', 'h1'], from: old, value: 'Новый заголовок главной'}]}); assert.equal(r.status, 200, r.text);
  assert.equal(rd(S.root, 'data/content.json').home.h1, 'Новый заголовок главной'); assert.ok(read('index.html').includes('Новый заголовок главной'), 'сайт пересобран');
  r = await editor.post('/api/texts/data', {changes: [{coll: 'content', path: ['home', 'h1'], from: old, value: 'Ещё одна правка'}]}); assert.equal(r.status, 409, 'устаревшее «было» — чужая правка не затирается');
  const bad = async (ch, st) => { const x = await editor.post('/api/texts/data', {changes: [ch]}); assert.equal(x.status, st, JSON.stringify(ch).slice(0, 80) + ' ' + x.text.slice(0, 120)); };
  await bad({coll: 'content', path: ['home', 'h1'], value: '<script>alert(1)</script>'}, 422); await bad({coll: 'content', path: ['home', 'h1'], value: '   '}, 422); await bad({coll: 'content', path: ['home', 'h1'], value: 'x<img src=x onerror=alert(1)>'}, 422);
  await bad({coll: 'products', path: [0, 'name'], value: 'x'}, 400); await bad({coll: 'content', path: ['home', 'nope'], value: 'x'}, 400); await bad({coll: 'content', path: ['__proto__', 'x'], value: 'x'}, 400); await bad({coll: 'content', path: ['seo', 'index', 'title'], value: 'я'.repeat(3500)}, 422);
  const sf = seo.blocks.flatMap(b => b.fields).find(x => x.id === 'content:seo.index.title'); r = await editor.post('/api/texts/data', {changes: [{coll: 'content', path: ['seo', 'index', 'title'], from: sf.value, value: 'Астрея — новый SEO-заголовок'}]}); assert.equal(r.status, 200, r.text); assert.match(read('index.html'), /<title>Астрея — новый SEO-заголовок<\/title>/, 'SEO-заголовок главной');
  r = await editor.post('/api/texts/data', {changes: [{coll: 'redesign', path: ['finalCta', 'title'], from: rd(S.root, 'data/redesign.json').finalCta.title, value: 'Финальный призыв по-новому'}]}); assert.equal(r.status, 200, r.text); assert.equal(rd(S.root, 'data/redesign.json').finalCta.title, 'Финальный призыв по-новому');
  const mgr = client(S.port, '10.9.9.6'); assert.equal((await mgr.get('/api/texts/data')).status, 401);
});

test('SEO-шаблоны карточек: метки подставляются, лишние метки отклоняются', async () => {
  const b = rd(S.root, 'data/brands.json')[0], bad = await save(editor, 'texts', d => { d.items['seo.brand.title'] = '{title} — бренд | Астрея'; }); assert.equal(bad.status, 422); assert.match(bad.json.error, /неизвестная метка \{title\}/);
  let r = await save(editor, 'texts', d => { d.items['seo.brand.title'] = 'Бренд {name} для кабинета | Астрея'; d.items['seo.crumbs.catalog'] = 'Все товары'; }); assert.equal(r.status, 200, r.text);
  assert.ok(read('brands/' + b.id + '.html').includes('<title>Бренд ' + b.name + ' для кабинета | Астрея</title>'), 'заголовок страницы бренда по шаблону'); assert.ok(read('catalog.html').includes('Все товары'), 'хлебные крошки');
  await save(editor, 'texts', d => { d.items = {}; });
});

test('подписи интерфейса для скриптов: попадают в js/data.js, опасные символы отклоняются', async () => {
  const key = Object.values(require(require('path').join(S.root, 'src', 'texts-registry.js')).index).find(i => i.js); assert.ok(key, 'в реестре есть тексты для скриптов');
  const bad = await save(editor, 'texts', d => { d.items[key.key] = 'a" onmouseover="x'; }); assert.equal(bad.status, 422); assert.match(bad.json.error, /кавычки/);
  const ok = await save(editor, 'texts', d => { d.items[key.key] = 'Новая подпись «для скрипта»'; }); assert.equal(ok.status, 200, ok.text);
  const dj = read('js/data.js'); assert.ok(dj.includes('"' + key.key + '":"Новая подпись «для скрипта»"'), 'правка в js/data.js → texts');
  await save(editor, 'texts', d => { d.items = {}; }); assert.ok(read('js/data.js').includes('"texts":{}'));
});


test('демо-файл админки: собирается одним HTML, без данных компьютера, со всеми разделами и недоступностью серверных действий', () => {
  const out = path.join(S.data, 'demo.html');
  require('child_process').execFileSync('node', [path.join(__dirname, '..', '..', 'tools', 'admin-demo.js'), out], {cwd: path.join(__dirname, '..', '..'), timeout: 120000, env: Object.assign({}, process.env, {NO_PROXY: '127.0.0.1,localhost'})});
  const html = fs.readFileSync(out, 'utf8'); assert.ok(html.length < 12 * 1048576, 'размер файла: ' + (html.length / 1048576).toFixed(1) + ' МБ');
  for (const view of ['texts', 'products', 'news', 'files', 'publish', 'history', 'preview', 'security', 'launch']) assert.ok(html.includes('AD.views.' + view + ' ='), 'раздел «' + view + '» в файле');
  assert.ok(html.includes('data:font/woff2;base64,') && html.includes('data:image/webp;base64,'), 'шрифты и картинки встроены');
  assert.ok(!/<script[^>]+src=|<link[^>]+href="(?:\/|https?:)/.test(html), 'нет внешних файлов: всё внутри');
  for (const leak of [REPO_ROOT(), '127.0.0.1', 'ghp_', 'Demo-fixture']) assert.ok(!html.includes(leak), 'в файле нет «' + leak + '»');
  assert.ok(html.includes('В демо недоступно: '), 'серверные действия честно отвечают «в демо недоступно»');
});
function REPO_ROOT() { return path.resolve(__dirname, '..', '..'); }
