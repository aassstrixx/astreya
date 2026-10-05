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
  for (const n of ['pages', 'menu', 'theme']) assert.ok(names.includes(n), n);
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

test('цвета: включаются, попадают в <style id="theme">; нечитаемые сочетания отклоняются; выключение убирает стиль', async () => {
  assert.ok(!read('index.html').includes('id="theme"'), 'по умолчанию тема выключена');
  const cur = (await admin.get('/api/collections/theme')).json, good = clone(cur.data); Object.assign(good, {enabled: true, radius: 6}); Object.assign(good.colors, {navy: '#0d2a22', blue: '#0f7655', blueDark: '#0b6048', milk: '#f3f6f1', mist: '#e1ece4'});
  const r = await admin.put('/api/collections/theme', {data: good, version: cur.version}); assert.equal(r.status, 200, r.text);
  const css = read('index.html').match(/<style id="theme">([^<]*)<\/style>/); assert.ok(css, 'стиль темы вставлен'); assert.match(css[1], /--blue:#0f7655/); assert.match(css[1], /--r:6px/);
  assert.ok(read('pages/../catalog.html').includes('id="theme"'), 'тема на всех страницах');
  const cur2 = (await admin.get('/api/collections/theme')).json;
  const low = clone(cur2.data); low.colors.blue = '#9bb5ff'; const x = await admin.put('/api/collections/theme', {data: low, version: cur2.version}); assert.equal(x.status, 422); assert.match(x.text, /Контраст/);
  const badHex = clone(cur2.data); badHex.colors.navy = 'red'; assert.equal((await admin.put('/api/collections/theme', {data: badHex, version: cur2.version})).status, 422);
  const rad = clone(cur2.data); rad.radius = 99; assert.equal((await admin.put('/api/collections/theme', {data: rad, version: cur2.version})).status, 422);
  const off = clone(cur2.data); off.enabled = false; assert.equal((await admin.put('/api/collections/theme', {data: off, version: cur2.version})).status, 200); assert.ok(!read('index.html').includes('id="theme"'), 'выключили — стиль убран');
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

test('обзор, поиск, список страниц, использование файла: только администратору', async () => {
  const ov = await admin.get('/api/overview'); assert.equal(ov.status, 200); assert.ok(ov.json.leads && ov.json.counts && Array.isArray(ov.json.health) && ov.json.health.length, 'обзор: заявки, счётчики, здоровье'); assert.ok(ov.json.counts.products > 0);
  const prod = rd(S.root, 'data/products.json')[0], q = (await admin.get('/api/search?q=' + encodeURIComponent(prod.name.slice(0, 6)))).json.items; assert.ok(q.some(i => i.type === 'Товар' && i.link === '#/content/products/' + encodeURIComponent(prod.id)), 'поиск находит товар');
  assert.deepEqual((await admin.get('/api/search?q=a')).json.items, [], 'короткий запрос — пусто');
  const sp = (await admin.get('/api/site-pages')).json.pages; assert.ok(sp.some(p => p.path === 'index.html') && sp.some(p => /^products\//.test(p.path)));
  const logo = rd(S.root, 'data/brands.json').find(b => b.logo).logo, u = (await admin.get('/api/files/usage?path=' + encodeURIComponent(logo))).json.used; assert.ok(u.some(f => /brands/.test(f)), 'логотип бренда найден в данных');
  // менеджер ничего из этого не видит
  const cr = await admin.post('/api/users', {login: 'mgr', password: 'Manager-pass-2026', role: 'manager', name: 'Менеджер'}); assert.equal(cr.status, 200, cr.text);
  const m = client(S.port, '10.9.9.8'); assert.equal((await m.login('mgr', 'Manager-pass-2026')).status, 200); await m.post('/api/password', {old: 'Manager-pass-2026', new: 'Manager-pass-2027-x'}).catch(() => {});
  for (const u of ['/api/overview', '/api/search?q=elastense', '/api/site-pages', '/api/collections/pages', '/api/collections/theme']) assert.equal((await m.get(u)).status, 403, u);
  assert.equal((await m.post('/api/site-audit')).status, 403);
});

test('полная проверка сайта: возвращает счётчики и группы замечаний', { timeout: 170000 }, async () => {
  const r = await admin.post('/api/site-audit'); assert.equal(r.status, 200, r.text); assert.ok(['audit', 'check'].includes(r.json.tool)); assert.equal(typeof r.json.errors, 'number'); assert.ok(Array.isArray(r.json.groups));
  assert.equal(r.json.errors, 0, JSON.stringify(r.json.groups.filter(g => g.level === 'error')));
  assert.equal((await admin.get('/api/overview')).json.siteAudit.at, r.json.at, 'результат запоминается и виден в обзоре');
});
