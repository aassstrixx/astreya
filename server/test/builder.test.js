/* Конструктор сайта в админке: свои страницы, меню, цвета, фоны, обзор, поиск, проверка сайта. Каждая правка идёт через настоящий сервер: проверка → запись → пересборка → публичные файлы. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const {boot, client, rd} = require('./helpers');

let S, admin;
const read = f => fs.readFileSync(path.join(S.root, f), 'utf8');
const exists = f => fs.existsSync(path.join(S.root, f));
const clone = v => JSON.parse(JSON.stringify(v));
const page = (slug, extra) => Object.assign({slug, title: 'Условия сотрудничества', eyebrow: 'Партнёрам', lead: 'Как мы работаем с клиниками и салонами.', description: 'Условия сотрудничества с Астреей: обучение, поддержка, скидки по объёму закупки для кабинетов и клиник.', published: true, noindex: false, nav: false, blocks: [
  {type: 'text', title: 'Как мы работаем', paragraphs: ['Первый абзац про сотрудничество.', 'Второй абзац.']},
  {type: 'list', title: 'Что вы получаете', items: ['Обучение специалистов', 'Поддержка менеджера']},
  {type: 'cta', title: 'Готовы начать?', text: 'Оставьте заявку', label: 'Стать партнёром', href: 'partners.html', tone: 'dark'}]}, extra);
const savePages = async items => { const cur = (await admin.get('/api/collections/pages')).json; return admin.put('/api/collections/pages', {data: Object.assign({}, cur.data, {items}), version: cur.version}); };

test.before(async () => { S = await boot({}); admin = await S.admin(); });
test.after(() => S.close());

test('все разделы конструктора есть в списке', async () => {
  const names = (await admin.get('/api/collections')).json.collections.map(c => c.name);
  for (const n of ['pages', 'menu']) assert.ok(names.includes(n), n);
  for (const n of ['theme', 'announce']) { assert.ok(!names.includes(n), n + ': раздела больше нет'); assert.equal((await admin.get('/api/collections/' + n)).status, 404); }
});

test('страница: создаётся, собирается, попадает в карту сайта и поиск, черновик скрыт, удаление убирает файл', async () => {
  const r = await savePages([page('usloviya'), page('chernovik', {title: 'Черновик акции', published: false})]); assert.equal(r.status, 200, r.text); assert.equal(r.json.build.ok, true);
  assert.ok(exists('pages/usloviya.html'), 'страница собрана');
  const html = read('pages/usloviya.html');
  assert.match(html, /<h1[^>]*>[\s\S]*Условия сотрудничества/); assert.ok(html.includes('Второй абзац.')); assert.ok(html.includes('Обучение специалистов')); assert.match(html, /href="\.\.\/partners\.html"/);
  assert.ok(!exists('pages/chernovik.html'), 'черновик на сайт не попадает');
  assert.ok(read('sitemap.xml').includes('pages/usloviya.html') && !read('sitemap.xml').includes('chernovik'), 'карта сайта: опубликованная есть, черновика нет');
  assert.ok(read('js/data.js').includes('pages/usloviya.html'), 'страница есть в поиске по сайту');
  const sp = (await admin.get('/api/site-pages')).json.pages; assert.ok(sp.some(p => p.path === 'pages/usloviya.html' && p.group === 'Свои страницы'));
  const rm = await savePages([]); assert.equal(rm.status, 200); assert.ok(!exists('pages/usloviya.html'), 'после удаления файла нет');
});

test('страница: проверка данных', async () => {
  const bad = async (items, re) => { const r = await savePages(items); assert.equal(r.status, 422, JSON.stringify(items).slice(0, 80)); assert.match(r.text, re); };
  await bad([page('Bad Slug')], /адрес/);
  await bad([page('catalog')], /занят/);
  await bad([page('a1'), page('a1')], /уже используется/);
  await bad([page('ok1', {blocks: [{type: 'nope'}]})], /неизвестный тип/);
  await bad([page('ok2', {blocks: [{type: 'image', src: 'assets/bg/cream.webp'}]})], /alt|опис|decorative|Описани/i);
  await bad([page('ok3', {blocks: [{type: 'cta', title: 'X', label: 'Y', href: 'javascript:alert(1)'}]})], /ссылк/);
  await bad([page('ok4', {blocks: [{type: 'cta', title: 'X', label: 'Y', href: 'net-takoy.html'}]})], /несуществующ/);
  await bad([page('ok5', {nav: true})], /меню/);
  assert.ok(!exists('pages/ok1.html'), 'ничего не записано');
  const r = await savePages([page('ok6', {blocks: [{type: 'text', title: '<script>alert(1)</script>', paragraphs: ['<img src=x onerror=alert(1)>']}]})]); assert.equal(r.status, 200, r.text);
  const html = read('pages/ok6.html'); assert.ok(!html.includes('<script>alert(1)') && !html.includes('<img src=x'), 'HTML из текста экранируется'); await savePages([]);
});

test('страница в меню: пункт появляется на всех страницах; больше четырёх нельзя', async () => {
  assert.equal((await savePages([page('menu1', {nav: true, navTitle: 'Условия'})])).status, 200);
  assert.ok(read('index.html').includes('pages/menu1.html') && read('catalog.html').includes('../pages/menu1.html') === false && read('catalog.html').includes('pages/menu1.html'), 'пункт меню на обычных страницах');
  assert.ok(read('pages/menu1.html').includes('aria-current="page"'), 'на самой странице пункт подсвечен');
  const many = [1, 2, 3, 4, 5].map(i => page('m' + i, {title: 'Страница ' + i, nav: true, navTitle: 'Пункт ' + i})); const r = await savePages(many); assert.equal(r.status, 422); assert.match(r.text, /не больше четырёх/);
  await savePages([]); assert.ok(!read('index.html').includes('pages/menu1.html'), 'после удаления пункта нет');
});

test('меню сайта: порядок и подписи; неверные данные отклоняются', async () => {
  const cur = (await admin.get('/api/collections/menu')).json, nav = clone(cur.data.nav); const first = nav.shift(); nav.push(Object.assign(first, {title: 'Продукция'}));
  const r = await admin.put('/api/collections/menu', {data: Object.assign({}, cur.data, {nav}), version: cur.version}); assert.equal(r.status, 200, r.text);
  const idx = read('index.html'), pos = t => idx.indexOf('>' + t + '</a>', idx.indexOf('id="nav"')); assert.ok(pos('Продукция') > pos('Компания'), 'порядок изменился'); assert.ok(pos('Бренды') > 0 && pos('Бренды') < pos('Продукция'));
  const cur2 = (await admin.get('/api/collections/menu')).json;
  for (const [mod, re] of [[n => n.splice(1), /от 2 до 9/], [n => { n[0].title = 'Очень длинная подпись пункта меню'; }, /до 24 символов/], [n => { n[0].href = 'net.html'; }, /нет на сайте/], [n => { n[1].href = n[0].href; }, /уже есть/], [n => { n[0].href = 'javascript:1'; }, /ссылка/]]) {
    const d = clone(cur2.data); mod(d.nav); const x = await admin.put('/api/collections/menu', {data: d, version: cur2.version}); assert.equal(x.status, 422, x.text); assert.match(x.text, re);
  }
});

test('фоны: допустимая правка применяется, неизвестная текстура / место / селектор отклоняются', async () => {
  const cur = (await admin.get('/api/collections/redesign')).json, mk = f => { const d = clone(cur.data); f(d.backdrops.pages); return d; };
  const put = d => admin.put('/api/collections/redesign', {data: d, version: cur.version});
  for (const [f, re] of [[p => { p.catalog.top.tex = 'bubbles'; }, /нет текстуры/], [p => { p.catalog.top.pos = 'middle'; }, /неизвестное место/], [p => { p.catalog.end.o = 40; }, /сила/], [p => { p.home.mid[0].sel = 'section > .x'; }, /селектор/]]) { const x = await put(mk(f)); assert.equal(x.status, 422, x.text); assert.match(x.text, re); }
  const ok = await put(mk(p => { p.catalog.top = {tex: 'silk', pos: 'tl', o: 5}; })); assert.equal(ok.status, 200, ok.text);
  assert.match(read('catalog.html'), /bd-top[^>]*data-bd="silk" data-bd-pos="tl" data-bd-o="5"/);
  const x = await admin.put('/api/collections/redesign', {data: (() => { const d = rd(S.root, 'data/redesign.json'); d.backdrops.pages.home.mid[0].sel = 'section.net-takogo'; return d; })(), version: (await admin.get('/api/collections/redesign')).json.version}); assert.equal(x.status, 422, 'блока нет на странице — сборка не проходит, правка откатывается');
  assert.ok(!JSON.stringify(rd(S.root, 'data/redesign.json')).includes('net-takogo'), 'данные откатились');
});

test('товары: фото, добавление, правка, удаление, защита от битых данных', async () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const dirs = (await admin.get('/api/files')).json.dirs; assert.ok(dirs.some(d => d.dir === 'assets/products' && d.title === 'Фото товаров'), 'папка «Фото товаров» есть');
  const up = await admin.post('/api/files', {dir: 'assets/products', name: 'Тестовое фото.PNG', data: PNG.toString('base64')}); assert.equal(up.status, 200, up.text); assert.equal(up.json.path, 'assets/products/testovoe-foto.png');
  const getP = async () => (await admin.get('/api/collections/products')).json, putP = async (data, version, expect) => { const r = await admin.put('/api/collections/products', {data, version}); assert.equal(r.status, expect || 200, r.text); return r; };
  let cur = await getP(), prods = clone(cur.data), p0 = prods[0];
  assert.match((await admin.get('/api/overview')).json.health.map(x => x.text).join('\n'), /без фото/, 'в обзоре подсказка про товары без фото');
  // фото
  p0.image = up.json.path; await putP(prods, cur.version);
  for (const f of ['products/' + p0.slug + '.html', 'catalog.html', 'brands/' + p0.brand + '.html']) assert.ok(read(f).includes('art art-photo'), f + ': фото вместо иллюстрации');
  const pg = read('products/' + p0.slug + '.html'); assert.match(pg, /<img src="\.\.\/assets\/products\/testovoe-foto\.png(\?v=[\w]+)?" alt="[^"]+"/); assert.match(pg, /<meta property="og:image" content="[^"]*assets\/products\/testovoe-foto\.png/, 'фото — картинка для соцсетей');
  assert.ok(read('products/' + prods[1].slug + '.html').includes('class="pk pk-'), 'у товара без фото остаётся иллюстрация');
  // неверные фото
  cur = await getP(); for (const bad of ['assets/products/net.png', 'assets/products/x.svg', 'https://example.com/x.png', '../data/site.json', 'assets/products/testovoe-foto.txt']) { const d = clone(cur.data); d[0].image = bad; const r = await putP(d, cur.version, 422); assert.match(r.text, /фото/, bad); }
  // тип и описание
  for (const [mod, re] of [[d => { d[0].desc = ''; }, /описания/], [d => { d[0].type = 'barrel'; }, /вид упаковки/]]) { const d = clone(cur.data); mod(d); assert.match((await putP(d, cur.version, 422)).text, re); }
  // добавление товара бренду (как делает раздел «Товары по брендам»)
  const mk = {id: 'dt-test-novinka', slug: 'dermatime-test-novinka', brand: 'dermatime', cat: 'face', kind: 'serum', type: 'dropper', name: 'Тест Новинка', desc: 'Сыворотка для проверки: добавлена из админки вместе с фото.', tasks: ['antiage'], isNew: true, volume: '30 мл', sku: null, usage: null, indications: null, docs: [], details: null, actives: ['Пептиды'], image: up.json.path};
  cur = await getP(); const withNew = clone(cur.data), last = withNew.reduce((m, x, k) => x.brand === 'dermatime' ? k : m, -1); withNew.splice(last + 1, 0, mk); await putP(withNew, cur.version);
  assert.ok(exists('products/dermatime-test-novinka.html') && read('products/dermatime-test-novinka.html').includes('Тест Новинка') && read('brands/dermatime.html').includes('Тест Новинка') && read('catalog.html').includes('data-id="dt-test-novinka"'), 'новый товар на странице, в бренде и каталоге');
  assert.ok(read('js/data.js').includes('dermatime-test-novinka'), 'и в поиске по сайту');
  // правка
  cur = await getP(); const ed = clone(cur.data); ed.find(x => x.id === mk.id).name = 'Тест Новинка 2'; ed.find(x => x.id === mk.id).volume = '50 мл'; await putP(ed, cur.version); assert.ok(read('products/dermatime-test-novinka.html').includes('Тест Новинка 2') && read('products/dermatime-test-novinka.html').includes('50 мл'), 'правка применилась');
  // нельзя удалить товар, на который ссылаются новости
  const news = JSON.stringify(rd(S.root, 'data/news.json')), used = cur.data.find(x => news.includes('"' + x.id + '"'));
  if (used) { const d = clone(cur.data).filter(x => x.id !== used.id); const r = await putP(d, cur.version, 422); assert.match(r.text, /нельзя удалить.*Новости/); assert.ok(exists('products/' + used.slug + '.html'), 'ничего не удалилось'); }
  // удаление своего товара
  cur = await getP(); await putP(clone(cur.data).filter(x => x.id !== mk.id), cur.version); assert.ok(!exists('products/dermatime-test-novinka.html') && !read('catalog.html').includes('dt-test-novinka'), 'удалённый товар исчез с сайта');
  // фото нельзя удалить, пока оно используется; после снятия — можно
  assert.equal((await admin.del('/api/files?path=' + encodeURIComponent(up.json.path))).status, 409, 'файл используется — удалить нельзя');
  cur = await getP(); const un = clone(cur.data); delete un[0].image; await putP(un, cur.version); assert.ok(read('products/' + p0.slug + '.html').includes('class="pk pk-'), 'без фото снова иллюстрация');
  assert.equal((await admin.del('/api/files?path=' + encodeURIComponent(up.json.path))).status, 200, 'не используется — удаляется');
});

test('обзор, поиск, список страниц, использование файла: только администратору', async () => {
  const ov = await admin.get('/api/overview'); assert.equal(ov.status, 200); assert.ok(ov.json.leads && ov.json.counts && Array.isArray(ov.json.health) && ov.json.health.length, 'обзор: заявки, счётчики, здоровье'); assert.ok(ov.json.counts.products > 0);
  const prod = rd(S.root, 'data/products.json')[0], q = (await admin.get('/api/search?q=' + encodeURIComponent(prod.name.slice(0, 6)))).json.items; assert.ok(q.some(i => i.type === 'Товар' && i.link === '#/brandprods/' + encodeURIComponent(prod.brand) + '/' + encodeURIComponent(prod.id)), 'поиск находит товар');
  assert.deepEqual((await admin.get('/api/search?q=a')).json.items, [], 'короткий запрос — пусто');
  const sp = (await admin.get('/api/site-pages')).json.pages; assert.ok(sp.some(p => p.path === 'index.html') && sp.some(p => /^products\//.test(p.path)));
  const logo = rd(S.root, 'data/brands.json').find(b => b.logo).logo, u = (await admin.get('/api/files/usage?path=' + encodeURIComponent(logo))).json.used; assert.ok(u.some(f => /brands/.test(f)), 'логотип бренда найден в данных');
  // менеджер ничего из этого не видит
  const cr = await admin.post('/api/users', {login: 'mgr', password: 'Manager-pass-2026', role: 'manager', name: 'Менеджер'}); assert.equal(cr.status, 200, cr.text);
  const m = client(S.port, '10.9.9.8'); assert.equal((await m.login('mgr', 'Manager-pass-2026')).status, 200); await m.post('/api/password', {old: 'Manager-pass-2026', new: 'Manager-pass-2027-x'}).catch(() => {});
  for (const u of ['/api/overview', '/api/search?q=elastense', '/api/site-pages', '/api/collections/pages', '/api/collections/menu']) assert.equal((await m.get(u)).status, 403, u);
  assert.equal((await m.post('/api/site-audit')).status, 403);
});

test('полная проверка сайта: возвращает счётчики и группы замечаний', { timeout: 170000 }, async () => {
  const r = await admin.post('/api/site-audit'); assert.equal(r.status, 200, r.text); assert.ok(['audit', 'check'].includes(r.json.tool)); assert.equal(typeof r.json.errors, 'number'); assert.ok(Array.isArray(r.json.groups));
  assert.equal(r.json.errors, 0, JSON.stringify(r.json.groups.filter(g => g.level === 'error')));
  assert.equal((await admin.get('/api/overview')).json.siteAudit.at, r.json.at, 'результат запоминается и виден в обзоре');
});
