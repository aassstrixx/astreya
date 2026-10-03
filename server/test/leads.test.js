/* Приём заявок и работа с ними в админке: все типы форм, проверка полей, защита от спама, ограничение частоты, CORS, вход, роли, CSV. Запуск: node --test server/test/ */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {boot, client, request} = require('./helpers');

let S, admin;
const ORIGIN = 'https://astreya.example';
const good = Object.assign({}, {type: 'question', name: 'Анна Петрова', email: 'anna@example.com', phone: '+7 (916) 123-45-67', msg: 'Хочу узнать условия поставки.', context: 'Тест', page: 'https://astreya.example/contacts.html', consent: true, fill_ms: 9000});
let ipN = 20;
const anon = () => client(S.port, '10.1.' + (ipN >> 8) + '.' + (ipN++ & 255));            // у каждого «посетителя» свой адрес
const send = (body, o) => { const c = anon(); return c.raw('POST', '/api/lead', body, Object.assign({Origin: ORIGIN}, o)); };

test.before(async () => {
  S = await boot({});
  admin = await S.admin();
  const st = await admin.get('/api/settings'); const s = st.json; s.allowedOrigins = [ORIGIN];
  assert.equal((await admin.put('/api/settings', s)).status, 200);
});
test.after(() => S.close());

test('все типы форм принимаются и появляются в админке', async () => {
  const ft = require('../../js/shared.js').FORM_TYPES;
  for (const type of Object.keys(ft)) {
    const body = {type, name: 'Имя ' + type, phone: '+7 916 000-11-22', email: type + '@example.com', city: 'Москва', org: 'Клиника', spec: 'Косметология', msg: 'Сообщение ' + type, consent: true, fill_ms: 8000};
    const r = await send(body);
    assert.equal(r.status, 200, type + ': ' + r.text); assert.equal(r.json.ok, true); assert.match(r.json.id, /^L\d{5}$/);
    assert.equal(r.headers['access-control-allow-origin'], ORIGIN);
  }
  const l = await admin.get('/api/leads?limit=50');
  assert.equal(l.status, 200); assert.equal(l.json.total, Object.keys(ft).length);
  assert.deepEqual(l.json.items.map(x => x.type).sort(), Object.keys(ft).sort());
});

test('обязательные поля каждой формы берутся из js/shared.js', async () => {
  const ft = require('../../js/shared.js').FORM_TYPES;
  for (const [type, def] of Object.entries(ft)) {
    for (const [id, req] of def.fields) {
      if (!req) continue;
      const body = {type, name: 'Иван', phone: '+7 916 000-11-22', email: 'a@b.ru', city: 'Тверь', msg: 'Текст', consent: true, fill_ms: 5000}; delete body[id];
      const r = await send(body);
      assert.equal(r.status, 422, `${type}/${id}: ${r.text}`); assert.ok(r.json.errors[id], `${type}/${id}`);
    }
  }
});

test('проверка полей: e-mail, телефон, согласие, неизвестный тип, нет контакта', async () => {
  let r = await send(Object.assign({}, good, {email: 'не-почта'})); assert.equal(r.status, 422); assert.ok(r.json.errors.email);
  r = await send(Object.assign({}, good, {phone: '123'})); assert.equal(r.status, 422); assert.ok(r.json.errors.phone);
  r = await send(Object.assign({}, good, {consent: false})); assert.equal(r.status, 422); assert.ok(r.json.errors.consent);
  r = await send(Object.assign({}, good, {consent: undefined})); assert.equal(r.status, 422);
  r = await send(Object.assign({}, good, {type: 'hack'})); assert.equal(r.status, 422); assert.ok(r.json.errors.type);
  r = await send(Object.assign({}, good, {email: '', phone: ''})); assert.equal(r.status, 422);
  r = await send([1, 2]); assert.equal(r.status, 422);
  r = await send(Object.assign({}, good, {name: 'Я'})); assert.equal(r.status, 200, 'одна буква в имени допустима, как и на клиенте');
});

test('мусорный и слишком большой запрос', async () => {
  const c = anon();
  let r = await c.raw('POST', '/api/lead', '{нет', {Origin: ORIGIN, 'Content-Type': 'application/json'}); assert.equal(r.status, 400);
  r = await c.raw('POST', '/api/lead', 'a=1', {Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'}); assert.equal(r.status, 415);
  r = await c.raw('POST', '/api/lead', JSON.stringify(Object.assign({}, good, {msg: 'x'.repeat(40000)})), {Origin: ORIGIN, 'Content-Type': 'application/json'}); assert.equal(r.status, 413);
  r = await c.raw('GET', '/api/lead'); assert.equal(r.status, 405);
});

test('CORS: разрешённый сайт проходит, чужой — нет; предзапрос OPTIONS', async () => {
  const c = anon();
  let r = await c.raw('OPTIONS', '/api/lead', undefined, {Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'});
  assert.equal(r.status, 204); assert.equal(r.headers['access-control-allow-origin'], ORIGIN); assert.match(r.headers['access-control-allow-headers'], /Content-Type/i);
  r = await c.raw('OPTIONS', '/api/lead', undefined, {Origin: 'https://evil.example'}); assert.equal(r.status, 403); assert.equal(r.headers['access-control-allow-origin'], undefined);
  r = await send(good, {Origin: 'https://evil.example'}); assert.equal(r.status, 403); assert.equal(r.headers['access-control-allow-origin'], undefined);
  r = await anon().raw('POST', '/api/lead', Object.assign({}, good, {msg: 'без Origin (curl, почтовик)'})); assert.equal(r.status, 200, 'запрос без Origin допустим: защита — ограничение частоты и спам-фильтры');
});

test('скрытое поле, ссылки, разметка → «Спам» без уведомления; быстрое заполнение → помечается, но остаётся новой', async () => {
  let r = await send(Object.assign({}, good, {msg: 'бот 1', company_site: 'http://spam.example'})); assert.equal(r.status, 200);
  let x = (await admin.get('/api/leads/' + r.json.id)).json; assert.equal(x.status, 'spam'); assert.match(x.spam_reasons[0], /скрыт/);
  r = await send(Object.assign({}, good, {msg: 'http://a.ru http://b.ru http://c.ru'})); x = (await admin.get('/api/leads/' + r.json.id)).json; assert.equal(x.status, 'spam');
  r = await send(Object.assign({}, good, {msg: '<script>alert(1)</script>'})); x = (await admin.get('/api/leads/' + r.json.id)).json; assert.equal(x.status, 'spam');
  r = await send(Object.assign({}, good, {msg: 'очень быстро', fill_ms: 120})); x = (await admin.get('/api/leads/' + r.json.id)).json;
  assert.equal(x.status, 'new'); assert.equal(x.flags.length, 1);
  const list = await admin.get('/api/leads?limit=200'); assert.ok(!list.json.items.some(i => i.status === 'spam'), 'спам не показывается в списке по умолчанию');
  const sp = await admin.get('/api/leads?status=spam'); assert.equal(sp.json.total, 3);
});

test('повторная отправка той же заявки за 10 минут не создаёт дубль', async () => {
  const body = Object.assign({}, good, {msg: 'Двойной клик'});
  const a = await send(body), b = await send(body);
  assert.equal(a.json.id, b.json.id);
  assert.equal((await admin.get('/api/leads/' + a.json.id)).json.duplicates, 1);
});

test('ограничение частоты: 5 за 10 минут с одного адреса, затем 429 с Retry-After', async () => {
  const c = client(S.port, '10.77.7.7'); const codes = [];
  for (let i = 0; i < 7; i++) { const r = await c.raw('POST', '/api/lead', Object.assign({}, good, {msg: 'flood ' + i}), {Origin: ORIGIN}); codes.push(r.status); if (r.status === 429) { assert.equal(r.json.error, 'rate_limited'); assert.ok(+r.headers['retry-after'] > 0); } }
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  const other = await client(S.port, '10.77.7.8').raw('POST', '/api/lead', good, {Origin: ORIGIN}); assert.ok([200].includes(other.status), 'другой адрес не затронут');
});

test('вход: неверный пароль, блокировка после 5 попыток, успешный вход, cookie HttpOnly', async () => {
  const c = client(S.port, '10.50.0.1');
  for (let i = 0; i < 5; i++) assert.equal((await c.login('admin', 'wrong-' + i)).status, 401);
  const blocked = await c.login('admin', 'Strong-pass-2026'); assert.equal(blocked.status, 429); assert.ok(+blocked.headers['retry-after'] > 800);
  const c2 = client(S.port, '10.50.0.2'); const ok = await c2.login('admin', 'Strong-pass-2026'); assert.equal(ok.status, 200);
  assert.match(ok.setCookie[0], /HttpOnly/); assert.match(ok.setCookie[0], /SameSite=Strict/);
  assert.equal(ok.json.user.role, 'admin'); assert.equal(ok.json.user.hash, undefined);
});

test('перебор разных логинов с одного адреса: после 25 неудач адрес блокируется целиком', async () => {
  const c = client(S.port, '10.51.0.1'); let last;
  for (let i = 0; i < 25; i++) last = await c.login('user' + i, 'wrong-' + i);
  assert.equal(last.status, 401); const r = await c.login('admin', 'Strong-pass-2026'); assert.equal(r.status, 429, 'даже верный пароль не принимается с заблокированного адреса');
  assert.equal((await client(S.port, '10.51.0.2').login('admin', 'Strong-pass-2026')).status, 200, 'другой адрес не затронут');
});

test('без входа админский API закрыт; CSRF-токен обязателен; чужой Origin отклоняется', async () => {
  const c = anon();
  for (const [m, u] of [['GET', '/api/leads'], ['GET', '/api/collections'], ['GET', '/api/settings'], ['GET', '/api/users'], ['GET', '/api/leads.csv'], ['POST', '/api/build'], ['GET', '/api/files']]) assert.equal((await c.raw(m, u, m === 'POST' ? {} : undefined)).status, 401, m + ' ' + u);
  const noCsrf = Object.assign({}, admin, {csrf: ''}); const raw = (m, u, b) => request(S.port, m, u, {headers: {Cookie: admin.cookie, 'X-Forwarded-For': '10.9.9.9'}, body: b});
  assert.equal((await raw('PATCH', '/api/leads/L00001', {status: 'done'})).status, 403);
  assert.equal((await raw('POST', '/api/build', {})).status, 403);
  const r = await request(S.port, 'PATCH', '/api/leads/L00001', {headers: {Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf, Origin: 'https://evil.example', 'X-Forwarded-For': '10.9.9.9'}, body: {status: 'done'}}); assert.equal(r.status, 403);
});

test('менеджер: видит и обрабатывает заявки, но не содержимое/настройки/пользователей/удаление', async () => {
  const mk = await admin.post('/api/users', {login: 'manager1', name: 'Мария', role: 'manager', password: 'Temporary-pass-1'}); assert.equal(mk.status, 200);
  const m = client(S.port, '10.60.0.1'); assert.equal((await m.login('manager1', 'Temporary-pass-1')).status, 200);
  assert.equal((await m.get('/api/leads')).status, 403, 'временный пароль: сначала смена'); assert.equal((await m.get('/api/config')).status, 403);
  assert.equal((await m.post('/api/password', {old: 'Temporary-pass-1', new: 'weak'})).status, 400);
  assert.equal((await m.post('/api/password', {old: 'Temporary-pass-1', new: 'Manager-pass-2026'})).status, 200);
  assert.equal((await m.get('/api/config')).status, 200);
  const lead = (await admin.get('/api/leads?limit=1')).json.items[0];
  assert.equal((await m.patch('/api/leads/' + lead.id, {status: 'in_work', comment: 'Позвонили, ждём ответа'})).status, 200);
  for (const [meth, u] of [['get', '/api/collections'], ['get', '/api/settings'], ['get', '/api/users'], ['get', '/api/audit'], ['get', '/api/files'], ['del', '/api/leads/' + lead.id]]) assert.equal((await m[meth](u)).status, 403, u);
  assert.equal((await m.post('/api/build', {})).status, 403);
  assert.equal((await m.post('/api/logout', {})).status, 200); assert.equal((await m.get('/api/leads')).status, 401, 'после выхода сессия недействительна');
});

test('заявка: статус, комментарий, история, поиск, фильтры, архив', async () => {
  const a = await send(Object.assign({}, good, {type: 'partner', name: 'Ольга Смирнова', city: 'Казань', org: 'Клиника «Лотос»', spec: 'Косметология', msg: 'Хотим стать дистрибьютором'}));
  const id = a.json.id;
  let r = await admin.patch('/api/leads/' + id, {status: 'in_work'}); assert.equal(r.status, 200); assert.equal(r.json.status, 'in_work');
  r = await admin.patch('/api/leads/' + id, {comment: 'Отправили прайс'}); assert.equal(r.json.notes.length, 1); assert.equal(r.json.notes[0].who, 'admin');
  assert.equal((await admin.patch('/api/leads/' + id, {status: 'bogus'})).status, 400);
  assert.equal((await admin.patch('/api/leads/' + id, {comment: '   '})).status, 400);
  assert.equal((await admin.patch('/api/leads/L99999', {status: 'done'})).status, 404);
  const g = (await admin.get('/api/leads/' + id)).json; assert.deepEqual(g.history.map(h => h.action), ['created', 'status', 'note']);
  assert.equal((await admin.get('/api/leads?q=' + encodeURIComponent('лотос'))).json.total, 1);
  assert.equal((await admin.get('/api/leads?type=partner&status=in_work')).json.total, 1);
  assert.equal((await admin.get('/api/leads?q=' + encodeURIComponent('нет такого'))).json.total, 0);
  await admin.patch('/api/leads/' + id, {status: 'archived'});
  assert.equal((await admin.get('/api/leads?q=' + encodeURIComponent('лотос'))).json.total, 0, 'архив скрыт по умолчанию');
  assert.equal((await admin.get('/api/leads?q=' + encodeURIComponent('лотос') + '&status=archived')).json.total, 1);
  assert.equal((await admin.get('/api/leads?q=' + encodeURIComponent('лотос') + '&status=all')).json.total, 1);
  const st = (await admin.get('/api/leads/stats')).json; assert.ok(st.total >= 10 && st.byType.partner >= 1);
});

test('CSV: BOM, разделитель «;», кавычки, защита от формул', async () => {
  await send(Object.assign({}, good, {name: '=HYPERLINK("http://x")', msg: 'Строка 1\nСтрока "2"; с точкой с запятой'}));
  const r = await admin.get('/api/leads.csv?status=all');
  assert.equal(r.status, 200); assert.match(r.headers['content-type'], /text\/csv/); assert.match(r.headers['content-disposition'], /attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(r.text.charCodeAt(0), 0xFEFF);
  const lines = r.text.slice(1).split('\r\n'); assert.match(lines[0], /^№;Дата/);
  assert.ok(r.text.includes("'=HYPERLINK"), 'ячейка с «=» экранирована');
  assert.ok(r.text.includes('"Строка 1\nСтрока ""2""; с точкой с запятой"'));
});

test('удаление — только администратор; журнал действий ведётся', async () => {
  const a = await send(Object.assign({}, good, {msg: 'на удаление'}));
  assert.equal((await admin.del('/api/leads/' + a.json.id)).status, 200); assert.equal((await admin.get('/api/leads/' + a.json.id)).status, 404);
  const log = (await admin.get('/api/audit')).json.items; assert.ok(log.some(x => x.action === 'lead_delete') && log.some(x => x.action === 'login'));
});

test('публикация через git выключена по умолчанию', async () => {
  const r = await admin.get('/api/publish'); assert.equal(r.status, 200); assert.equal(r.json.enabled, false); assert.match(r.json.hint, /PUBLISH_GIT=1/);
  assert.equal((await admin.post('/api/publish', {})).status, 501);
});

test('файлы сайта и приватные данные недоступны по HTTP', async () => {
  const c = anon();
  for (const u of ['/server/index.js', '/data/site.json', '/tools/build.js', '/.git/config', '/../etc/passwd', '/%2e%2e/etc/passwd', '/assets/../data/site.json']) { const r = await c.raw('GET', u); assert.ok([403, 404].includes(r.status), u + ' → ' + r.status); }
  assert.equal((await c.raw('GET', '/')).status, 200); assert.equal((await c.raw('GET', '/brands')).status, 200); assert.equal((await c.raw('GET', '/css/base.css')).status, 200);
  const h = await c.raw('GET', '/admin/'); assert.ok([200, 404].includes(h.status));
});
