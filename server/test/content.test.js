/* Содержимое сайта (data/*.json): правка → проверка → резервная копия → пересборка → публичные страницы; откат при ошибке; файлы; настройки; уведомления. Запуск: node --test server/test/ */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net');
const {boot, client, rd} = require('./helpers');

let S, admin;
const ORIGIN = 'https://astreya.example';
const read = f => fs.readFileSync(path.join(S.root, f), 'utf8');
const exists = f => fs.existsSync(path.join(S.root, f));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test.before(async () => { S = await boot({}); admin = await S.admin(); });
test.after(() => S.close());

test('разделы: список, чтение, версия', async () => {
  const r = await admin.get('/api/collections'); assert.equal(r.status, 200);
  assert.deepEqual(r.json.collections.map(c => c.name).sort(), ['brands', 'catalog', 'content', 'events', 'menu', 'news', 'pages', 'products', 'redesign', 'site', 'theme', 'training']);
  assert.equal(r.json.collections.find(c => c.name === 'products').count, rd(S.root, 'data/products.json').length);
  const p = await admin.get('/api/collections/products'); assert.equal(p.status, 200); assert.ok(Array.isArray(p.json.data)); assert.match(p.json.version, /^[0-9a-f]{12}$/);
  assert.equal((await admin.get('/api/collections/nope')).status, 404);
  assert.equal((await admin.get('/api/collections/..%2f..%2fetc')).status, 404);
});

test('правка товара: сохранилось, сайт пересобран, резервная копия создана', async () => {
  const cur = (await admin.get('/api/collections/products')).json, data = cur.data, p = data[0];
  p.name = 'Elastense Тест-правка';
  const r = await admin.put('/api/collections/products', {data, version: cur.version}); assert.equal(r.status, 200, r.text); assert.equal(r.json.build.ok, true);
  assert.equal(rd(S.root, 'data/products.json')[0].name, 'Elastense Тест-правка');
  assert.ok(read('products/' + p.slug + '.html').includes('Elastense Тест-правка'), 'публичная страница обновилась');
  assert.ok(read('js/data.js').includes('Elastense Тест-правка'));
  const h = (await admin.get('/api/collections/products/history')).json.items; assert.equal(h.length, 1); assert.equal(h[0].who, 'admin');
  // без изменений — ничего не пишется
  const again = await admin.put('/api/collections/products', {data: rd(S.root, 'data/products.json')}); assert.equal(again.json.unchanged, true);
});

test('конфликт версий: правка по устаревшей версии отклоняется', async () => {
  const cur = (await admin.get('/api/collections/products')).json;
  const d1 = JSON.parse(JSON.stringify(cur.data)); d1[1].name = 'Первая правка';
  assert.equal((await admin.put('/api/collections/products', {data: d1, version: cur.version})).status, 200);
  const d2 = JSON.parse(JSON.stringify(cur.data)); d2[2].name = 'Вторая правка (устаревшая)';
  const r = await admin.put('/api/collections/products', {data: d2, version: cur.version}); assert.equal(r.status, 409); assert.ok(r.json.current);
  assert.equal(rd(S.root, 'data/products.json')[2].name, cur.data[2].name, 'устаревшая правка не применилась');
});

test('проверка данных: неизвестный бренд/категория, повтор slug, плохой slug — 422, файл не тронут', async () => {
  const before = read('data/products.json'), cur = (await admin.get('/api/collections/products')).json;
  const bad = (fn) => { const d = JSON.parse(JSON.stringify(cur.data)); fn(d); return admin.put('/api/collections/products', {data: d}); };
  let r = await bad(d => { d[0].brand = 'нет-такого'; }); assert.equal(r.status, 422); assert.match(r.json.error, /бренд/);
  r = await bad(d => { d[0].cat = 'xxx'; }); assert.equal(r.status, 422);
  r = await bad(d => { d[1].slug = d[0].slug; }); assert.equal(r.status, 422); assert.match(r.json.error, /повтор/);
  r = await bad(d => { d[0].slug = 'Плохой Slug'; }); assert.equal(r.status, 422);
  r = await bad(d => { d[0].tasks = ['нет-задачи']; }); assert.equal(r.status, 422);
  r = await admin.put('/api/collections/products', {data: {не: 'список'}}); assert.equal(r.status, 422);
  assert.equal(read('data/products.json'), before);
});

test('новый товар: страница появляется, удаление товара убирает страницу', async () => {
  const cur = (await admin.get('/api/collections/products')).json, d = cur.data;
  const neu = Object.assign({}, d[0], {id: 'dt-new-test', slug: 'dermatime-novyj-test', name: 'Новый тестовый товар', desc: 'Уникальное описание тестового товара для проверки сборки.', isNew: true, featured: false});
  d.push(neu);
  let r = await admin.put('/api/collections/products', {data: d, version: cur.version}); assert.equal(r.status, 200, r.text);
  assert.ok(exists('products/dermatime-novyj-test.html')); assert.ok(read('products/dermatime-novyj-test.html').includes('Новый тестовый товар')); assert.ok(read('sitemap.xml').includes('dermatime-novyj-test'));
  const c2 = (await admin.get('/api/collections/products')).json; c2.data.pop();
  r = await admin.put('/api/collections/products', {data: c2.data, version: c2.version}); assert.equal(r.status, 200, r.text);
  assert.ok(!exists('products/dermatime-novyj-test.html')); assert.ok(!read('sitemap.xml').includes('dermatime-novyj-test'));
});

test('бренд нельзя удалить, пока у него есть товары; новость, мероприятие, настройки', async () => {
  let b = (await admin.get('/api/collections/brands')).json; const used = rd(S.root, 'data/products.json')[0].brand;
  let r = await admin.put('/api/collections/brands', {data: b.data.filter(x => x.id !== used), version: b.version}); assert.equal(r.status, 422);
  const n = (await admin.get('/api/collections/news')).json; n.data.items.unshift({id: 'n-test', slug: 'proverka-novosti', category: 'news', date: '2026-10-01', title: 'Проверка новости из админки', excerpt: 'Кратко.', body: ['Абзац 1.', 'Абзац 2.']});
  r = await admin.put('/api/collections/news', {data: n.data, version: n.version}); assert.equal(r.status, 200, r.text); assert.ok(read('news/proverka-novosti.html').includes('Проверка новости из админки'));
  const e = (await admin.get('/api/collections/events')).json; e.data[0].title = 'Правка мероприятия'; r = await admin.put('/api/collections/events', {data: e.data, version: e.version}); assert.equal(r.status, 200, r.text);
  e.data = (await admin.get('/api/collections/events')).json.data; e.data[0].date = '31.12.2026'; r = await admin.put('/api/collections/events', {data: e.data}); assert.equal(r.status, 422);
  const s = (await admin.get('/api/collections/site')).json; s.data.formEndpoint = 'javascript:alert(1)'; r = await admin.put('/api/collections/site', {data: s.data, version: s.version}); assert.equal(r.status, 422);
  s.data.formEndpoint = '/api/lead'; r = await admin.put('/api/collections/site', {data: s.data, version: s.version}); assert.equal(r.status, 200, r.text);
  assert.ok(read('js/data.js').includes('"formEndpoint":"/api/lead"') || read('js/data.js').includes('/api/lead'), 'адрес приёма заявок попал на сайт');
});

test('сборка не прошла → изменения откатываются, сайт собирается заново из прежних данных', async () => {
  const n = (await admin.get('/api/collections/news')).json, before = read('data/news.json');
  const dup = n.data.items[1].title; n.data.items[2].title = dup;                      // два одинаковых заголовка → check.js: «дубль title»
  const r = await admin.put('/api/collections/news', {data: n.data, version: n.version});
  assert.equal(r.status, 422, r.text); assert.match(r.json.error, /не собирается|изменения отменены/);
  assert.equal(read('data/news.json'), before, 'data/news.json возвращён');
  const st = (await admin.get('/api/build')).json; assert.equal(st.ok, true, 'последняя сборка — успешная (после отката)');
  assert.ok(read('news/proverka-novosti.html'), 'страницы на месте');
});

test('история и восстановление', async () => {
  const h = (await admin.get('/api/collections/products/history')).json.items; assert.ok(h.length >= 2);
  const first = h[h.length - 1];                       // самая старая копия — исходное содержимое
  const r = await admin.post('/api/collections/products/restore', {id: first.id}); assert.equal(r.status, 200, r.text);
  assert.notEqual(rd(S.root, 'data/products.json')[0].name, 'Elastense Тест-правка');
  assert.equal((await admin.post('/api/collections/products/restore', {id: '../../etc/passwd'})).status, 404);
});

test('ручная пересборка', async () => {
  const r = await admin.post('/api/build', {}); assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.match(r.json.build.out, /Собрано страниц/); assert.match(r.json.check.out, /ошибок: 0/);
});

test('загрузка картинок: PNG принимается, подмена типа/SVG/слишком большой/чужая папка — нет', async () => {
  const up = (dir, name, buf) => admin.post('/api/files', {dir, name, data: buf.toString('base64')});
  let r = await up('assets/uploads', 'Тест Лого.PNG', PNG); assert.equal(r.status, 200, r.text); assert.match(r.json.path, /^assets\/uploads\/[a-z0-9._-]+\.png$/);
  assert.ok(exists(r.json.path)); const p = r.json.path;
  assert.ok((await admin.get('/api/files')).json.dirs.find(d => d.dir === 'assets/uploads').files.some(f => 'assets/uploads/' + f.name === p));
  assert.equal((await up('assets/uploads', 'fake.png', Buffer.from('<?php echo 1; ?>'))).status, 400);
  assert.equal((await up('assets/uploads', 'logo.svg', Buffer.from('<svg onload=alert(1)/>'))).status, 400);
  assert.equal((await up('assets/uploads', 'shell.html', PNG)).status, 400);
  assert.equal((await up('js', 'x.png', PNG)).status, 400);
  assert.equal((await up('../..', 'x.png', PNG)).status, 400);
  assert.equal((await up('assets/uploads', '../../../evil.png', PNG)).status, 200); assert.ok(!fs.existsSync(path.join(S.root, '..', 'evil.png')), 'имя очищено, выхода из папки нет');
  assert.equal((await up('assets/uploads', 'big.png', Buffer.concat([PNG, Buffer.alloc(6.5 * 1024 * 1024)]))).status, 413);
  assert.equal((await admin.del('/api/files?path=' + encodeURIComponent(p))).status, 200); assert.ok(!exists(p));
  assert.equal((await admin.del('/api/files?path=' + encodeURIComponent('js/core.js'))).status, 400);
  assert.equal((await admin.del('/api/files?path=' + encodeURIComponent('assets/uploads/../../js/core.js'))).status, 400);
  assert.ok(exists('js/core.js'));
});

test('настройки: секреты маскируются и сохраняются при повторной записи; проверка значений', async () => {
  let s = (await admin.get('/api/settings')).json;
  s.allowedOrigins = [ORIGIN]; s.notify.telegram = {token: '123:SECRET', chatId: '777'}; s.notify.smtp.pass = 'smtp-secret';
  let r = await admin.put('/api/settings', s); assert.equal(r.status, 200, r.text);
  assert.equal(r.json.notify.telegram.token, '••••••••'); assert.equal(r.json.notify.smtp.pass, '••••••••');
  assert.ok(!r.text.includes('123:SECRET') && !r.text.includes('smtp-secret'));
  r = await admin.put('/api/settings', r.json); assert.equal(r.status, 200);                          // маски вернулись обратно — секреты не затёрты
  const saved = JSON.parse(fs.readFileSync(path.join(S.data, 'settings.json'), 'utf8')); assert.equal(saved.notify.telegram.token, '123:SECRET'); assert.equal(saved.notify.smtp.pass, 'smtp-secret');
  assert.equal(fs.statSync(path.join(S.data, 'settings.json')).mode & 0o777, 0o600);
  const bad = JSON.parse(JSON.stringify(r.json)); bad.allowedOrigins = ['astreya.example/']; assert.equal((await admin.put('/api/settings', bad)).status, 422);
  bad.allowedOrigins = []; bad.notify.webhookUrl = 'ftp://x'; assert.equal((await admin.put('/api/settings', bad)).status, 422);
  bad.notify.webhookUrl = ''; bad.rateLimit = {per10min: 0, perDay: 5}; assert.equal((await admin.put('/api/settings', bad)).status, 422);
  s = r.json; s.notify.telegram = {token: '', chatId: ''}; s.notify.smtp.pass = ''; await admin.put('/api/settings', s);
});

test('пользователи: создание, проверки, смена роли, отключение, защита последнего администратора, сброс пароля', async () => {
  const mk = await admin.post('/api/users', {login: 'second', name: 'Второй', role: 'admin', password: 'Another-pass-777'}); assert.equal(mk.status, 200); assert.equal(mk.json.hash, undefined);
  assert.equal((await admin.post('/api/users', {login: 'second', role: 'admin', password: 'Another-pass-777'})).status, 409);
  assert.equal((await admin.post('/api/users', {login: 'ab', role: 'admin', password: 'Another-pass-777'})).status, 400);
  assert.equal((await admin.post('/api/users', {login: 'weakone', role: 'manager', password: 'short1'})).status, 400);
  assert.equal((await admin.post('/api/users', {login: 'rootx', role: 'god', password: 'Another-pass-777'})).status, 400);
  const list = (await admin.get('/api/users')).json.users; const me = list.find(u => u.login === 'admin'), sec = list.find(u => u.login === 'second');
  assert.equal((await admin.patch('/api/users/' + me.id, {disabled: true})).status, 400, 'нельзя отключить себя');
  assert.equal((await admin.del('/api/users/' + me.id)).status, 400, 'нельзя удалить себя');
  const sc = client(S.port, '10.88.0.1'); assert.equal((await sc.login('second', 'Another-pass-777')).status, 200);
  assert.equal((await sc.get('/api/users')).status, 403, 'временный пароль: сначала смена'); assert.equal((await sc.post('/api/password', {old: 'Another-pass-777', new: 'Fresh-pass-2026'})).status, 200); assert.equal((await sc.get('/api/users')).status, 200);
  // отключённый пользователь сразу теряет сессию и не может войти
  assert.equal((await admin.patch('/api/users/' + sec.id, {disabled: true})).status, 200); assert.equal((await sc.get('/api/leads')).status, 401);
  assert.equal((await client(S.port, '10.88.0.2').login('second', 'Fresh-pass-2026')).status, 401);
  assert.equal((await admin.patch('/api/users/' + sec.id, {disabled: false})).status, 200);
  // роль: второй администратор снимает права с первого, затем сам не может стать «последним без прав»
  const s2 = client(S.port, '10.88.0.3'); await s2.login('second', 'Fresh-pass-2026');
  assert.equal((await s2.patch('/api/users/' + me.id, {role: 'manager'})).status, 200); assert.equal((await admin.get('/api/users')).status, 403, 'после смены роли права пропали');
  assert.equal((await s2.patch('/api/users/' + sec.id, {role: 'manager'})).status, 400, 'нельзя снять роль с последнего администратора');
  assert.equal((await s2.patch('/api/users/' + sec.id, {disabled: true})).status, 400);
  assert.equal((await s2.del('/api/users/' + sec.id)).status, 400);
  assert.equal((await s2.patch('/api/users/' + me.id, {role: 'admin'})).status, 200); admin = await S.admin();
  // сброс пароля администратором → вход со старым невозможен, с новым — только со сменой
  assert.equal((await admin.patch('/api/users/' + sec.id, {password: 'Reset-pass-2026'})).status, 200);
  assert.equal((await s2.get('/api/users')).status, 401, 'сессии сброшены');
  assert.equal((await client(S.port, '10.88.0.4').login('second', 'Fresh-pass-2026')).status, 401);
  const rs = client(S.port, '10.88.0.5'); assert.equal((await rs.login('second', 'Reset-pass-2026')).status, 200); assert.equal((await rs.get('/api/users')).status, 403);
  assert.equal((await admin.del('/api/users/' + sec.id)).status, 200); assert.equal((await admin.get('/api/users')).json.users.length, 2 - 1 + (list.length - 2));
});

/* ---- уведомления ---- */
function mockHttp(handler) {
  return new Promise(res => { const got = []; const srv = http.createServer((req, rs) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { got.push({url: req.url, body: b}); const out = handler ? handler(req, b) : {status: 200, body: '{"ok":true}'}; rs.writeHead(out.status, {'Content-Type': 'application/json'}); rs.end(out.body); }); }); srv.listen(0, '127.0.0.1', () => res({got, port: srv.address().port, close: () => srv.close()})); });
}
function mockSmtp(opts) {
  return new Promise(res => {
    const mails = []; const srv = net.createServer(sock => {
      let data = false, cur = {rcpt: [], auth: null, raw: ''}, buf = ''; sock.setEncoding('utf8'); sock.write('220 mock ESMTP\r\n');
      sock.on('data', chunk => {
        buf += chunk;
        for (;;) {
          if (data) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; cur.raw = buf.slice(0, i); buf = buf.slice(i + 5); data = false; mails.push(cur); cur = {rcpt: [], auth: null, raw: ''}; sock.write('250 queued\r\n'); continue; }
          const i = buf.indexOf('\r\n'); if (i < 0) return; const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (/^EHLO/i.test(line)) sock.write('250-mock\r\n250-SIZE 1000000\r\n' + (opts && opts.auth ? '250-AUTH PLAIN LOGIN\r\n' : '') + '250 8BITMIME\r\n');
          else if (/^AUTH PLAIN/i.test(line)) { cur.auth = Buffer.from(line.slice(11), 'base64').toString().split('\0').slice(1).join(':'); sock.write(opts.rejectAuth ? '535 bad credentials\r\n' : '235 ok\r\n'); }
          else if (/^MAIL FROM/i.test(line)) { cur.from = line; sock.write('250 ok\r\n'); }
          else if (/^RCPT TO/i.test(line)) { cur.rcpt.push(line.slice(8)); sock.write('250 ok\r\n'); }
          else if (/^DATA/i.test(line)) { data = true; sock.write('354 go\r\n'); }
          else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); return; }
          else sock.write('500 ?\r\n');
        }
      });
    });
    srv.listen(0, '127.0.0.1', () => res({mails, port: srv.address().port, close: () => srv.close()}));
  });
}
const waitFor = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 40)); } return fn(); };
const leadBody = Object.assign({type: 'partner', name: 'Мария Иванова', phone: '+7 916 555-44-33', email: 'maria@example.com', city: 'Самара', org: 'Клиника «Роза»', msg: 'Интересует сотрудничество', consent: true, fill_ms: 9000});

test('уведомления о заявке: веб-хук, Telegram и e-mail получают заявку; сбой одного канала не мешает остальным', async () => {
  const hook = await mockHttp(), tg = await mockHttp(), smtp = await mockSmtp({auth: true});
  process.env.TELEGRAM_API_BASE = 'http://127.0.0.1:' + tg.port;
  let s = (await admin.get('/api/settings')).json;
  s.allowedOrigins = [ORIGIN]; s.notify.webhookUrl = 'http://127.0.0.1:' + hook.port + '/hook'; s.notify.telegram = {token: '555:ABC', chatId: '-100500'};
  s.notify.smtp = {host: '127.0.0.1', port: smtp.port, secure: false, user: 'robot', pass: 'p4ss', from: 'Сайт <site@astreya.example>', to: 'sales@astreya.example, boss@astreya.example'};
  assert.equal((await admin.put('/api/settings', s)).status, 200);
  const c = client(S.port, '10.99.0.1');
  const r = await c.raw('POST', '/api/lead', leadBody, {Origin: ORIGIN}); assert.equal(r.status, 200);
  await waitFor(() => hook.got.length && tg.got.length && smtp.mails.length);
  assert.equal(hook.got.length, 1); const hb = JSON.parse(hook.got[0].body); assert.equal(hb.event, 'lead.created'); assert.equal(hb.lead.id, r.json.id); assert.equal(hb.lead.email, 'maria@example.com'); assert.match(hb.text, /Мария Иванова/);
  assert.equal(tg.got.length, 1); assert.equal(tg.got[0].url, '/bot555:ABC/sendMessage'); const tb = JSON.parse(tg.got[0].body); assert.equal(tb.chat_id, '-100500'); assert.match(tb.text, /Новая заявка L\d+ — Партнёрство/); assert.match(tb.text, /Самара/);
  assert.equal(smtp.mails.length, 1); const m = smtp.mails[0]; assert.equal(m.auth, 'robot:p4ss'); assert.equal(m.rcpt.length, 2); assert.match(m.rcpt[0], /sales@astreya\.example/);
  const subj = m.raw.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1]; assert.match(Buffer.from(subj, 'base64').toString(), /Партнёрство — Мария Иванова/);
  const bodyB64 = m.raw.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''); assert.match(Buffer.from(bodyB64, 'base64').toString(), /Клиника «Роза»/);
  // спам не уведомляет
  const before = hook.got.length;
  await c.raw('POST', '/api/lead', Object.assign({}, leadBody, {msg: 'бот', company_site: 'x'}), {Origin: ORIGIN}); await new Promise(r => setTimeout(r, 300)); assert.equal(hook.got.length, before);
  // Telegram недоступен (500) — остальные каналы доходят, ошибка попадает в журнал
  tg.close(); process.env.TELEGRAM_API_BASE = 'http://127.0.0.1:1';
  const r2 = await c.raw('POST', '/api/lead', Object.assign({}, leadBody, {msg: 'второй'}), {Origin: ORIGIN}); assert.equal(r2.status, 200, 'заявка принята, хотя уведомление не ушло');
  await waitFor(() => hook.got.length > before && smtp.mails.length > 1);
  assert.equal(smtp.mails.length, 2);
  const audit = (await admin.get('/api/audit')).json.items; assert.ok(audit.some(x => x.action === 'notify_failed' && /Telegram/.test(x.detail)), 'сбой Telegram записан в журнал');
  assert.ok((await admin.get('/api/leads/' + r2.json.id)).json.id, 'заявка сохранена');
  // пробная отправка из админки
  const t = await admin.post('/api/settings/test-notify', {}); assert.equal(t.status, 200); assert.equal(t.json.results.length, 3); assert.equal(t.json.results.filter(x => x.ok).length, 2); assert.equal(t.json.results.find(x => x.channel === 'Telegram').ok, false);
  hook.close(); smtp.close();
  s = (await admin.get('/api/settings')).json; s.notify = {webhookUrl: '', telegram: {token: '', chatId: ''}, smtp: {host: '', port: 587, secure: false, user: '', pass: '', from: '', to: ''}}; await admin.put('/api/settings', s);
});

test('SMTP: неверный пароль → понятная ошибка, заявка не теряется', async () => {
  const smtp = await mockSmtp({auth: true, rejectAuth: true});
  let s = (await admin.get('/api/settings')).json; s.notify.smtp = {host: '127.0.0.1', port: smtp.port, secure: false, user: 'robot', pass: 'wrong', from: 'site@astreya.example', to: 'sales@astreya.example'};
  await admin.put('/api/settings', s);
  const t = await admin.post('/api/settings/test-notify', {}); assert.equal(t.json.results.length, 1); assert.equal(t.json.results[0].ok, false); assert.match(t.json.results[0].error, /авторизация|535/);
  smtp.close(); s = (await admin.get('/api/settings')).json; s.notify.smtp.host = ''; await admin.put('/api/settings', s);
});
