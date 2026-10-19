/* Безопасность и запуск в РФ: заголовки и политика страниц, подмена X-Forwarded-For, блокировки входа, двухфакторный вход, сеансы, список адресов, защита от обращений во внутреннюю сеть,
   шифрование секретов, пароли, чек-лист запуска, документы 152-ФЗ, Метрика / SmartCaptcha / Битрикс24 (на заглушках), обращения субъектов, копии. Запуск: node --test server/test/security.test.js */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const {boot, client, request, rd} = require('./helpers');
const TOTP = require('../lib/totp');

let S, admin;
const ORIGIN = 'https://astreya.example';
let ipN = 40;
const anon = () => client(S.port, '10.4.' + (ipN >> 8) + '.' + (ipN++ & 255));
const code = secret => TOTP.hotp(secret.replace(/\s/g, ''), TOTP.stepNow());
const mock = (handler) => new Promise(res => { const calls = []; const srv = http.createServer((req, rs) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { calls.push({method: req.method, url: req.url, headers: req.headers, body: b}); handler(req, rs, b, calls); }); }); srv.listen(0, '127.0.0.1', () => res({srv, calls, base: 'http://127.0.0.1:' + srv.address().port})); });
const jsonRes = (rs, status, obj) => { rs.writeHead(status, {'Content-Type': 'application/json'}); rs.end(JSON.stringify(obj)); };
const lead = (o) => Object.assign({type: 'question', name: 'Анна', email: 'a' + Math.random().toString(36).slice(2, 8) + '@example.com', phone: '+7 916 000-11-22', msg: 'Тест', consent: true, fill_ms: 8000, page: ORIGIN + '/contacts.html'}, o);
const getSettings = async () => (await admin.get('/api/settings')).json;
const putSettings = async (mut) => { const s = await getSettings(); mut(s); return admin.put('/api/settings', s); };

test.before(async () => {
  S = await boot({});
  admin = await S.admin();
  assert.equal((await putSettings(s => { s.allowedOrigins = [ORIGIN]; })).status, 200);
});
test.after(() => S.close());

test('заголовки: каждый ответ защищён, у страниц есть политика безопасности без unsafe-inline для скриптов', async () => {
  const c = anon();
  let r = await c.raw('GET', '/api/health');
  assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.match(r.headers['permissions-policy'], /camera=\(\)/); assert.equal(r.headers['cross-origin-opener-policy'], 'same-origin'); assert.ok(!r.headers['strict-transport-security'], 'без https HSTS не отправляется');
  r = await c.raw('GET', '/api/health', undefined, {'X-Forwarded-Proto': 'https'}); assert.match(r.headers['strict-transport-security'], /max-age=\d+/);
  r = await c.raw('GET', '/index.html'); const csp = r.headers['content-security-policy'];
  assert.ok(csp, 'у страницы есть заголовок политики'); assert.match(csp, /default-src 'self'/); assert.match(csp, /object-src 'none'/); assert.match(csp, /frame-ancestors 'self'/); assert.match(csp, /base-uri 'self'/);
  const script = csp.split(';').find(x => /script-src/.test(x)); assert.ok(!/unsafe-inline|unsafe-eval/.test(script), script); assert.match(script, /'sha256-/);
  assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(r.text, /<meta http-equiv="Content-Security-Policy" content="default-src 'self'/);
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(r.text), 'шрифты не грузятся с серверов Google');
  const a = await c.raw('GET', '/admin/'); assert.equal(a.headers['x-frame-options'], 'DENY'); assert.match(a.headers['content-security-policy'], /script-src 'self'/); assert.equal(a.headers['cross-origin-resource-policy'], 'same-origin');
  const sec = await c.raw('GET', '/.well-known/security.txt'); assert.equal(sec.status, 200); assert.match(sec.text, /^Contact: mailto:/);
  assert.equal((await c.raw('GET', '/assets/fonts/' + fs.readdirSync(path.join(S.root, 'assets', 'fonts'))[0])).status, 200);
  assert.equal((await c.raw('GET', '/.git/config')).status, 404); assert.equal((await c.raw('GET', '/server/data/users.json')).status, 404); assert.equal((await c.raw('GET', '/.env')).status, 404);
});

test('вход по https: cookie с префиксом __Host-, Secure, HttpOnly, SameSite=Strict', async () => {
  const c = anon(); const r = await c.raw('POST', '/api/login', {login: 'admin', password: 'Strong-pass-2026'}, {'X-Forwarded-Proto': 'https'});
  assert.equal(r.status, 200); const sc = r.setCookie[0]; assert.match(sc, /^__Host-astreya_sid=/); assert.match(sc, /Secure/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Path=\//);
  const plain = anon(); const p = await plain.raw('POST', '/api/login', {login: 'admin', password: 'Strong-pass-2026'}); assert.match(p.setCookie[0], /^astreya_sid=/); assert.ok(!/Secure/.test(p.setCookie[0]));
  c.cookie = sc.split(';')[0]; c.csrf = r.json.csrf; assert.equal((await c.get('/api/me')).status, 200, 'cookie с префиксом принимается');
});

test('подделка X-Forwarded-For не сбрасывает блокировку входа', async () => {
  const hit = (spoof) => request(S.port, 'POST', '/api/login', {headers: {'X-Forwarded-For': spoof + ', 9.9.8.8'}, body: {login: 'admin', password: 'Wrong-pass-' + Math.random()}});
  for (let i = 0; i < 5; i++) assert.equal((await hit('1.1.1.' + i)).status, 401);
  const r = await hit('2.2.2.2'); assert.equal(r.status, 429, 'тот же настоящий адрес — блокировка действует, сколько бы «первых» адресов ни подставляли'); assert.ok(+r.headers['retry-after'] > 0);
  const ok = await request(S.port, 'POST', '/api/login', {headers: {'X-Forwarded-For': '1.1.1.1, 7.7.7.7'}, body: {login: 'admin', password: 'Strong-pass-2026'}}); assert.equal(ok.status, 200, 'с другого настоящего адреса вход работает');
  const log = (await admin.get('/api/audit?limit=200')).json.items; assert.ok(log.some(x => x.action === 'login_locked' && x.ip === '9.9.8.8'), 'блокировка в журнале с адресом'); assert.ok(log.some(x => x.action === 'login_fail' && x.ip === '9.9.8.8'));
});

test('двухфакторный вход: подключение, вход с кодом, повтор кода отклоняется, коды восстановления одноразовые, отключение', async () => {
  const mk = await admin.post('/api/users', {login: 'ivan2fa', name: 'Иван', role: 'admin', password: 'Tulip-Garden-2026'}); assert.equal(mk.status, 200);
  const u = anon(); assert.equal((await u.login('ivan2fa', 'Tulip-Garden-2026')).status, 200); assert.equal((await u.post('/api/password', {old: 'Tulip-Garden-2026', new: 'Birch-Lantern-2027'})).status, 200);
  const b = await u.post('/api/2fa/begin'); assert.equal(b.status, 200); assert.match(b.json.uri, /^otpauth:\/\/totp\//); assert.match(b.json.uri, /secret=[A-Z2-7]{32}/); const secret = b.json.secret;
  assert.equal((await u.post('/api/2fa/confirm', {code: '000000'})).status, 422);
  const cf = await u.post('/api/2fa/confirm', {code: code(secret)}); assert.equal(cf.status, 200, cf.text); assert.equal(cf.json.codes.length, 10); assert.match(cf.json.codes[0], /^[0-9a-f]{4}-[0-9a-f]{4}$/);
  assert.equal((await u.get('/api/2fa')).json.enabled, true);
  // шаг 1 даёт билет, а не сеанс
  const c2 = anon(); const s1 = await c2.raw('POST', '/api/login', {login: 'ivan2fa', password: 'Birch-Lantern-2027'}); assert.equal(s1.status, 200); assert.equal(s1.json.need2fa, true); assert.ok(s1.json.ticket); assert.equal(s1.setCookie.length, 0, 'до кода cookie не выдаётся');
  assert.equal((await c2.raw('POST', '/api/login/2fa', {ticket: s1.json.ticket, code: '123456'})).status, 401);
  // код следующего окна (допуск ±30 с) принимается; код того же окна, что и при подключении, — уже нет (повтор), как и тот же код дважды
  const good = TOTP.hotp(secret.replace(/\s/g, ''), TOTP.stepNow() + 1); const s2 = await c2.raw('POST', '/api/login', {login: 'ivan2fa', password: 'Birch-Lantern-2027'});
  const ok = await c2.raw('POST', '/api/login/2fa', {ticket: s2.json.ticket, code: good}); assert.equal(ok.status, 200, ok.text); assert.ok(ok.setCookie.length);
  assert.equal((await anon().raw('POST', '/api/login/2fa', {ticket: (await anon().raw('POST', '/api/login', {login: 'ivan2fa', password: 'Birch-Lantern-2027'})).json.ticket, code: code(secret)})).status, 401, 'код окна, уже использованного при подключении, повторно не принимается');
  const s3 = await c2.raw('POST', '/api/login', {login: 'ivan2fa', password: 'Birch-Lantern-2027'}); assert.equal((await c2.raw('POST', '/api/login/2fa', {ticket: s3.json.ticket, code: good})).status, 401, 'тот же код второй раз не принимается');
  // код восстановления: работает один раз
  const rc = cf.json.codes[0]; const s4 = await c2.raw('POST', '/api/login', {login: 'ivan2fa', password: 'Birch-Lantern-2027'}); const r4 = await c2.raw('POST', '/api/login/2fa', {ticket: s4.json.ticket, code: rc}); assert.equal(r4.status, 200); assert.equal(r4.json.usedRecovery, true);
  const s5 = await c2.raw('POST', '/api/login', {login: 'ivan2fa', password: 'Birch-Lantern-2027'}); assert.equal((await c2.raw('POST', '/api/login/2fa', {ticket: s5.json.ticket, code: rc})).status, 401, 'код восстановления одноразовый');
  assert.equal((await c2.raw('POST', '/api/login/2fa', {ticket: 'fake', code: '123456'})).status, 401);
  // секрет не лежит открытым текстом в ответах списка пользователей
  const list = (await admin.get('/api/users')).json.users.find(x => x.login === 'ivan2fa'); assert.equal(list.totp, true); assert.equal(list.hash, undefined); assert.equal(list.totpSecret, undefined);
  // отключение: нужен пароль и код
  assert.equal((await u.post('/api/2fa/disable', {password: 'wrong', code: code(secret)})).status, 403);
  const used = TOTP.stepNow(); assert.ok(used > 0);
  // сброс администратором
  assert.equal((await admin.post('/api/users/' + list.id + '/reset-2fa')).status, 200); assert.equal((await admin.get('/api/users')).json.users.find(x => x.login === 'ivan2fa').totp, false);
  assert.equal((await u.get('/api/me')).status, 401, 'после сброса сеансы пользователя завершены');
});

test('перебор кода 2FA через много билетов и адресов упирается в блокировку пользователя', async () => {
  await admin.post('/api/users', {login: 'lock2fa', name: 'Л', role: 'manager', password: 'Poplar-Garden-2026'});
  const u = anon(); await u.login('lock2fa', 'Poplar-Garden-2026'); await u.post('/api/password', {old: 'Poplar-Garden-2026', new: 'Poplar-Garden-2027'});
  const b = await u.post('/api/2fa/begin'); await u.post('/api/2fa/confirm', {code: code(b.json.secret)});
  let last;
  for (let i = 0; i < 10; i++) { const c = anon(); const t = await c.raw('POST', '/api/login', {login: 'lock2fa', password: 'Poplar-Garden-2027'}); last = await c.raw('POST', '/api/login/2fa', {ticket: t.json.ticket, code: String(100000 + i)}); assert.equal(last.status, 401, 'попытка ' + i); }
  const c2 = anon(); const t2 = await c2.raw('POST', '/api/login', {login: 'lock2fa', password: 'Poplar-Garden-2027'});
  const blocked = await c2.raw('POST', '/api/login/2fa', {ticket: t2.json.ticket, code: TOTP.hotp(b.json.secret.replace(/\s/g, ''), TOTP.stepNow() + 1)}); assert.equal(blocked.status, 429, 'даже верный код не принимается во время блокировки'); assert.ok(+blocked.headers['retry-after'] > 0);
});

test('содержимое: ключ __proto__ в данных отклоняется', async () => {
  const c = (await admin.get('/api/collections/menu')).json; const body = JSON.stringify({data: JSON.parse(JSON.stringify(c.data)), version: c.version}).replace('{"data":{', '{"data":{"__proto__":{"x":1},');
  const r = await admin.put('/api/collections/menu', body, {'Content-Type': 'application/json'}); assert.equal(r.status, 422); assert.match(r.json.error, /__proto__/);
});

test('политика «2FA обязательна»: администратор без второго фактора не пускается дальше экрана подключения', async () => {
  await admin.post('/api/users', {login: 'polad', name: 'Политик', role: 'admin', password: 'Aspen-Valley-2026'});
  const me = anon(); assert.equal((await me.login('polad', 'Aspen-Valley-2026')).status, 200); await me.post('/api/password', {old: 'Aspen-Valley-2026', new: 'Aspen-Valley-2027'});
  assert.equal((await me.put('/api/security', {require2fa: true})).status, 422, 'сначала нужно включить 2FA у себя');
  const b = await me.post('/api/2fa/begin'); assert.equal((await me.post('/api/2fa/confirm', {code: code(b.json.secret)})).status, 200);
  assert.equal((await me.put('/api/security', {require2fa: true})).status, 200);
  try {
    assert.equal((await me.post('/api/2fa/disable', {password: 'Aspen-Valley-2027', code: '123456'})).status, 403, 'при политике отключить 2FA нельзя');
    await me.post('/api/users', {login: 'newadm', name: 'Новый', role: 'admin', password: 'Maple-Orchard-2026'});
    const n = anon(); assert.equal((await n.login('newadm', 'Maple-Orchard-2026')).status, 200); await n.post('/api/password', {old: 'Maple-Orchard-2026', new: 'Cedar-Meadow-2027'});
    const m = await n.get('/api/me'); assert.equal(m.json.needs2fa, true);
    const blocked = await n.get('/api/leads/stats'); assert.equal(blocked.status, 403); assert.equal(blocked.json.needs2fa, true); assert.equal((await n.get('/api/launch')).status, 403);
    const nb = await n.post('/api/2fa/begin'); assert.equal(nb.status, 200); assert.equal((await n.post('/api/2fa/confirm', {code: code(nb.json.secret)})).status, 200);
    assert.equal((await n.get('/api/leads/stats')).status, 200, 'после подключения доступ открыт');
  } finally { assert.equal((await me.put('/api/security', {require2fa: false})).status, 200); }
});

test('сеансы: список, завершение чужого, смена пароля завершает остальные', async () => {
  await admin.post('/api/users', {login: 'sess1', name: 'С', role: 'manager', password: 'Willow-Harbor-2026'});
  const a = anon(), b = anon(); await a.login('sess1', 'Willow-Harbor-2026'); await b.login('sess1', 'Willow-Harbor-2026');
  assert.notEqual(a.cookie, b.cookie, 'каждый вход — новый токен');
  await a.post('/api/password', {old: 'Willow-Harbor-2026', new: 'Willow-Harbor-2027'}).catch(() => {});
  const list = await a.get('/api/sessions'); assert.equal(list.status, 200); assert.ok(list.json.items.every(x => x.login === 'sess1'), 'менеджер видит только свои сеансы'); assert.ok(list.json.items.some(x => x.current));
  const all = (await admin.get('/api/sessions?all=1')).json.items; assert.ok(all.some(x => x.login === 'sess1') && all.some(x => x.login === 'admin'));
  assert.equal((await a.get('/api/sessions?all=1')).json.items.every(x => x.login === 'sess1'), true, 'флаг all для менеджера не действует');
  // пароль сменили в сеансе a → сеанс b закрыт
  assert.equal((await b.get('/api/me')).status, 401, 'смена пароля завершила остальные сеансы'); assert.equal((await a.get('/api/me')).status, 200);
  // завершение сеанса администратором
  const c = anon(); await c.login('sess1', 'Willow-Harbor-2027'); const id = (await admin.get('/api/sessions?all=1')).json.items.find(x => x.login === 'sess1' && !x.current && x.ip === c.ip).id;
  assert.equal((await admin.del('/api/sessions/' + id)).status, 200); assert.equal((await c.get('/api/me')).status, 401);
  const cur = (await a.get('/api/sessions')).json.items.find(x => x.current); assert.equal((await a.del('/api/sessions/' + cur.id)).status, 400, 'текущий сеанс так не завершить');
});

test('пароли: короткие, популярные и однообразные отклоняются', async () => {
  for (const pw of ['Short1a', 'Password12345', 'qwerty123456', 'aaaaaaaaaa11', 'Astreya2026ab', 'admin-admin-1234']) { const r = await admin.post('/api/users', {login: 'pw' + Math.random().toString(36).slice(2, 7), role: 'manager', password: pw}); assert.equal(r.status, 400, pw + ' → ' + r.text); }
  assert.equal((await admin.post('/api/users', {login: 'pwgood', role: 'manager', password: 'Tulip-Garden-2026'})).status, 200);
});

test('список разрешённых адресов: нельзя запереть себя, чужим адресам закрыты админка и её API, заявки и чат открыты', async () => {
  const a = await S.admin();
  assert.equal((await a.put('/api/security', {ipAllowlist: ['203.0.113.7']})).status, 422, 'своего адреса нет в списке');
  assert.equal((await a.put('/api/security', {ipAllowlist: ['не адрес']})).status, 422);
  assert.equal((await a.put('/api/security', {ipAllowlist: ['10.9.9.0/24']})).status, 200);
  const other = client(S.port, '10.77.0.1');
  assert.equal((await other.raw('POST', '/api/login', {login: 'admin', password: 'Strong-pass-2026'})).status, 403);
  assert.equal((await other.raw('GET', '/admin/')).status, 403);
  assert.equal((await other.raw('GET', '/api/health')).status, 200);
  assert.equal((await other.raw('POST', '/api/lead', lead(), {Origin: ORIGIN})).status, 200, 'заявки с сайта принимаются с любого адреса');
  assert.equal((await a.get('/api/me')).status, 200);
  assert.ok((await a.get('/api/audit?limit=50')).json.items.some(x => x.action === 'ip_denied'));
  assert.equal((await a.put('/api/security', {ipAllowlist: []})).status, 200);
  assert.equal((await other.raw('GET', '/admin/')).status, 200);
});

test('защита от обращений во внутреннюю сеть: веб-хук, CRM, прямые запросы', async () => {
  const NG = require('../lib/netguard'); const prev = process.env.ALLOW_PRIVATE_NETWORK; process.env.ALLOW_PRIVATE_NETWORK = '0';
  try {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.5.5', '172.31.255.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) assert.equal(NG.isPrivateIp(ip), true, ip);
    for (const ip of ['8.8.8.8', '77.88.8.8', '2a02:6b8::feed:0ff']) assert.equal(NG.isPrivateIp(ip), false, ip);
    for (const u of ['http://127.0.0.1:1/', 'http://localhost/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://10.1.2.3/x', 'file:///etc/passwd', 'ftp://example.com/', 'http://user:pw@example.com/', 'http://service.internal/']) await assert.rejects(NG.request(u), undefined, u);
    await assert.rejects(new Promise((res, rej) => NG.guardedLookup('localhost', {}, (e, a) => e ? rej(e) : res(a))), /внутреннюю сеть/, 'имя, разрешающееся в 127.0.0.1, блокируется при соединении');
    let r = await admin.put('/api/settings', Object.assign(await getSettings(), {})); assert.equal(r.status, 200);
    const s = await getSettings(); s.notify.webhookUrl = 'http://169.254.169.254/hook'; r = await admin.put('/api/settings', s); assert.equal(r.status, 422); assert.match(r.json.error, /Веб-хук/);
    const s2 = await getSettings(); s2.integrations.bitrix24 = {enabled: true, webhook: 'https://127.0.0.1/rest/1/abc/', source: 'WEB'}; assert.equal((await admin.put('/api/settings', s2)).status, 422);
  } finally { process.env.ALLOW_PRIVATE_NETWORK = prev; }
});

test('секреты шифруются на диске при заданном DATA_KEY и не отдаются в браузер', async () => {
  const C = require('../lib/config'), file = path.join(S.data, 'settings.json');
  process.env.DATA_KEY = 'test-key-for-vault-0123456789';
  try {
    assert.equal((await putSettings(s => { s.notify.telegram.token = '123456:SECRET-TOKEN-VALUE'; s.notify.telegram.chatId = '-100500'; })).status, 200);
    const raw = fs.readFileSync(file, 'utf8'); assert.ok(!raw.includes('SECRET-TOKEN-VALUE'), 'токен на диске не открытым текстом'); assert.match(raw, /"token": "enc:v1:/);
    assert.equal(C.loadSettings().notify.telegram.token, '123456:SECRET-TOKEN-VALUE', 'сервер читает расшифрованным');
    const g = await admin.get('/api/settings'); assert.equal(g.json.notify.telegram.token, '••••••••'); assert.ok(!g.text.includes('SECRET-TOKEN'));
    assert.equal(g.json.security, undefined, 'политика безопасности не отдаётся через общие настройки'); assert.equal((await admin.put('/api/settings', g.json)).status, 200); assert.equal(C.loadSettings().notify.telegram.token, '123456:SECRET-TOKEN-VALUE', 'маска при сохранении не затирает секрет');
    const st = (await admin.get('/api/security')).json; assert.equal(st.vault.enabled, true); assert.equal(st.vault.sealed >= 1, true);
    delete process.env.DATA_KEY; assert.equal(C.loadSettings().notify.telegram.token, '', 'без ключа секрет не читается'); assert.equal(C.vaultBroken(), true);
    const l = (await admin.get('/api/launch')).json.items.find(x => x.id === 'vault_broken'); assert.equal(l.status, 'fail');
    process.env.DATA_KEY = 'test-key-for-vault-0123456789'; assert.equal(C.loadSettings().notify.telegram.token, '123456:SECRET-TOKEN-VALUE');
    process.env.DATA_KEY = 'wrong-key-wrong-key-wrong-key'; assert.equal(C.loadSettings().notify.telegram.token, '');
  } finally { process.env.DATA_KEY = 'test-key-for-vault-0123456789'; await putSettings(s => { s.notify.telegram.token = ''; s.notify.telegram.chatId = ''; }); delete process.env.DATA_KEY; }
});

test('настройки: ключи вида __proto__ и лишние поля не попадают в данные', async () => {
  const s = await getSettings(); const body = JSON.stringify(s).replace('{', '{"__proto__":{"polluted":true},"evil":{"x":1},');
  const r = await admin.put('/api/settings', body, {'Content-Type': 'application/json'}); assert.equal(r.status, 200, r.text);
  assert.equal({}.polluted, undefined); const saved = rd(S.data.replace(/\\/g, '/'), 'settings.json'); assert.equal(Object.prototype.hasOwnProperty.call(saved, '__proto__'), false); assert.equal(saved.evil, undefined);
});

test('сайт: Метрика, согласие, подтверждение Вебмастера и мессенджеры попадают на страницы; политика безопасности строится по подключённому', async () => {
  const c = (await admin.get('/api/collections/integrations')).json, d = c.data;
  const bad = JSON.parse(JSON.stringify(d)); bad.metrika.id = 'abc'; assert.equal((await admin.put('/api/collections/integrations', {data: bad, version: c.version})).status, 422);
  bad.metrika.id = ''; bad.messengers.max = 'http://evil.example/x'; assert.equal((await admin.put('/api/collections/integrations', {data: bad, version: c.version})).status, 422);
  d.metrika.id = '12345678'; d.metrika.webvisor = true; d.verification.yandex = 'abcdef0123456789'; d.messengers.max = 'https://max.ru/astreya'; d.messengers.telegram = 'https://t.me/astreya_bot';
  const r = await admin.put('/api/collections/integrations', {data: d, version: c.version}); assert.equal(r.status, 200, r.text); assert.ok(r.json.build && r.json.build.ok);
  const idx = fs.readFileSync(path.join(S.root, 'index.html'), 'utf8');
  assert.match(idx, /<meta name="yandex-verification" content="abcdef0123456789">/);
  const csp = idx.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1]; assert.match(csp, /script-src [^;]*https:\/\/mc\.yandex\.ru/); assert.match(csp, /connect-src [^;]*wss:\/\/mc\.yandex\.ru/); assert.ok(!/unsafe-eval/.test(csp));
  assert.match(idx, /href="https:\/\/max\.ru\/astreya"/); assert.match(idx, /data-act="cookie-settings"/); assert.match(idx, /consent\.html/);
  assert.ok(!/wa\.me/.test(fs.readFileSync(path.join(S.root, 'contacts.html'), 'utf8')), 'WhatsApp скрыт по умолчанию'); assert.match(fs.readFileSync(path.join(S.root, 'contacts.html'), 'utf8'), /Написать в MAX/);
  const data = fs.readFileSync(path.join(S.root, 'js', 'data.js'), 'utf8'); assert.match(data, /"integrations":\{"metrika":\{"id":"12345678","webvisor":true/); assert.match(data, /"consent":\{"active":true,"mode":"optin"/); assert.ok(!/"token"|serverKey/.test(data), 'секретов в данных страницы нет');
  const csp2 = (await anon().raw('GET', '/index.html')).headers['content-security-policy']; assert.match(csp2, /mc\.yandex\.ru/);
});

test('документы 152-ФЗ: до реквизитов — заглушки, после — полные политика, согласие и соглашение', async () => {
  const stub = fs.readFileSync(path.join(S.root, 'privacy.html'), 'utf8'); assert.match(stub, /Страница-заглушка/);
  assert.ok(fs.existsSync(path.join(S.root, 'consent.html')));
  const site = (await admin.get('/api/collections/site')).json; site.data.requisites = {legalName: 'ООО «Астрея»', inn: '7701234567', kpp: null, ogrn: '1157746123456', legalAddress: '125000, г. Москва, проезд Березовой рощи, д. 8', note: ''};
  assert.equal((await admin.put('/api/collections/site', {data: Object.assign({}, site.data, {requisites: Object.assign({}, site.data.requisites, {inn: '123'})}), version: site.version})).status, 422, 'ИНН проверяется');
  const r = await admin.put('/api/collections/site', {data: site.data, version: site.version}); assert.equal(r.status, 200, r.text);
  const pr = fs.readFileSync(path.join(S.root, 'privacy.html'), 'utf8'); assert.ok(!/Страница-заглушка/.test(pr)); for (const t of ['Оператор', 'ИНН 7701234567', 'ОГРН 1157746123456', 'Яндекс Метрика', 'Вебвизор', 'Ваши права', 'ст. 6']) assert.ok(pr.includes(t), t);
  const co = fs.readFileSync(path.join(S.root, 'consent.html'), 'utf8'); for (const t of ['Цели и перечень данных', 'Срок действия и отзыв', 'отдельно от любых других условий']) assert.ok(co.includes(t), t);
  assert.match(fs.readFileSync(path.join(S.root, 'terms.html'), 'utf8'), /публичной офертой/);
  assert.match(fs.readFileSync(path.join(S.root, 'contacts.html'), 'utf8'), /consent\.html/, 'форма ссылается на отдельное согласие');
  const L = (await admin.get('/api/launch')).json; assert.equal(L.items.find(x => x.id === 'requisites').status, 'ok'); assert.equal(L.items.find(x => x.id === 'legal_docs').status, 'ok'); assert.equal(L.items.find(x => x.id === 'fonts').status, 'ok');
  assert.equal(L.items.find(x => x.id === 'headers').status, 'ok');
});

test('чек-лист запуска: проверки идут по реальным данным, ручные пункты подтверждаются с именем и датой', async () => {
  const L = (await admin.get('/api/launch')).json; assert.ok(L.items.length >= 30); assert.equal(L.ready, false); assert.ok(L.blockers > 0);
  for (const id of ['https', 'default_pw', '2fa', 'demo', 'notify', 'rkn_notice', 'localization', 'metrika', 'webmaster', 'backup', 'fonts', 'crossborder']) assert.ok(L.items.some(x => x.id === id), id);
  const rkn = L.items.find(x => x.id === 'rkn_notice'); assert.equal(rkn.status, 'manual');
  const ok = await admin.post('/api/launch/confirm', {id: 'rkn_notice', value: true}); assert.equal(ok.status, 200); assert.equal(ok.json.items.find(x => x.id === 'rkn_notice').status, 'ok'); assert.match(ok.json.items.find(x => x.id === 'rkn_notice').detail, /admin/);
  assert.equal((await admin.post('/api/launch/confirm', {id: 'https', value: true})).status, 404, 'автоматические пункты вручную не подтверждаются');
  assert.equal((await admin.post('/api/launch/confirm', {id: 'rkn_notice', value: false})).json.items.find(x => x.id === 'rkn_notice').status, 'manual');
  assert.ok((await admin.get('/api/audit?limit=20')).json.items.some(x => x.action === 'launch_confirm'));
  const ov = (await admin.get('/api/overview')).json; assert.equal(ov.launch.ready, false);
  const mgr = anon(); await mgr.login('pwgood', 'Tulip-Garden-2026').catch(() => {}); assert.equal((await mgr.get('/api/launch')).status === 200, false);
});

test('Яндекс Метрика через API: проверка счётчика, цели, статистика (заглушка сервера Метрики)', async () => {
  const goals = [{id: 11, name: 'Заявка', type: 'action', conditions: [{type: 'exact', url: 'form_submit'}]}];
  const M = await mock((req, rs, body) => {
    if (req.headers.authorization !== 'OAuth tok-metrika-123') return jsonRes(rs, 403, {message: 'denied'});
    if (req.url === '/management/v1/counter/12345678') return jsonRes(rs, 200, {counter: {id: 12345678, name: 'Астрея', site: 'astreya.example', status: 'Active', code_status: 'CS_OK', code_options: {visor: true}}});
    if (req.url === '/management/v1/counter/12345678/goals' && req.method === 'GET') return jsonRes(rs, 200, {goals});
    if (req.url === '/management/v1/counter/12345678/goals' && req.method === 'POST') { const g = JSON.parse(body).goal; goals.push({id: 100 + goals.length, name: g.name, type: g.type, conditions: g.conditions}); return jsonRes(rs, 200, {goal: {id: 100}}); }
    if (req.url.startsWith('/stat/v1/data')) return jsonRes(rs, 200, req.url.includes('goal') ? {totals: [7, 3]} : {totals: [120, 90, 340, 31.4, 95]});
    jsonRes(rs, 404, {});
  });
  process.env.METRIKA_API_BASE = M.base;
  try {
    assert.equal((await admin.post('/api/integrations/metrika/check')).status, 400, 'без токена — понятная ошибка');
    assert.equal((await putSettings(s => { s.integrations.metrika.token = 'tok-metrika-123'; })).status, 200);
    const c = await admin.post('/api/integrations/metrika/check'); assert.equal(c.status, 200, c.text); assert.equal(c.json.name, 'Астрея'); assert.equal(c.json.codeStatus, 'CS_OK'); assert.equal(c.json.webvisor, true);
    const sync = await admin.post('/api/integrations/metrika/sync-goals'); assert.equal(sync.status, 200, sync.text); assert.ok(sync.json.skipped.includes('form_submit')); assert.ok(sync.json.created.includes('phone_click')); assert.equal(sync.json.failed.length, 0);
    const posted = M.calls.filter(x => x.method === 'POST'); assert.ok(posted.length >= 10); const g0 = JSON.parse(posted[0].body).goal; assert.equal(g0.type, 'action'); assert.equal(g0.conditions[0].type, 'exact'); assert.ok(g0.conditions[0].url);
    const again = await admin.post('/api/integrations/metrika/sync-goals'); assert.equal(again.json.created.length, 0, 'повторный запуск ничего не дублирует');
    const st = await admin.get('/api/integrations/metrika/stats?days=30'); assert.equal(st.status, 200); assert.equal(st.json.visits, 120); assert.equal(st.json.users, 90); assert.equal(st.json.bounce, 31.4); assert.ok(st.json.goals.length > 0);
    assert.equal((await putSettings(s => { s.integrations.metrika.token = 'wrong-token-123'; })).status, 200); const bad = await admin.post('/api/integrations/metrika/check'); assert.equal(bad.status, 502); assert.match(bad.json.error, /токен/);
    assert.ok(!JSON.stringify((await admin.get('/api/audit?limit=200')).json).includes('tok-metrika-123'), 'токен в журнал не попадает');
  } finally { delete process.env.METRIKA_API_BASE; M.srv.close(); }
});

test('Yandex SmartCaptcha: человек проходит, робот и заявка без токена — в «Спам», сбой сервиса заявку не теряет', async () => {
  let mode = 'normal';
  const M = await mock((req, rs, body) => { const p = new URLSearchParams(body); if (mode === 'down') { rs.writeHead(500); return rs.end('x'); } if (p.get('secret') !== 'srv-key-1234567') return jsonRes(rs, 200, {status: 'failed', message: 'Invalid secret'}); jsonRes(rs, 200, p.get('token') === 'good-token' ? {status: 'ok', host: 'astreya.example'} : {status: 'failed', message: 'Token invalid or expired'}); });
  try {
    const ic = (await admin.get('/api/collections/integrations')).json; ic.data.captcha.siteKey = 'ysc1_clientkey1234'; assert.equal((await admin.put('/api/collections/integrations', {data: ic.data, version: ic.version})).status, 200);
    assert.equal((await putSettings(s => { s.integrations.captcha = {enabled: true, serverKey: 'srv-key-1234567', url: M.base + '/validate'}; s.rateLimit = {per10min: 50, perDay: 500}; })).status, 200);
    const send = async b => { const r = await anon().raw('POST', '/api/lead', lead(b), {Origin: ORIGIN}); assert.equal(r.status, 200, r.text); return (await admin.get('/api/leads/' + r.json.id)).json; };
    const okL = await send({captcha_token: 'good-token', msg: 'человек'}); assert.equal(okL.status, 'new');
    const badL = await send({captcha_token: 'bot-token', msg: 'робот'}); assert.equal(badL.status, 'spam'); assert.match(badL.spam_reasons.join(), /SmartCaptcha/);
    const noL = await send({msg: 'без токена'}); assert.equal(noL.status, 'spam');
    mode = 'down'; const dwn = await send({captcha_token: 'good-token', msg: 'сервис лежит'}); assert.equal(dwn.status, 'new', 'при сбое сервиса заявка не теряется'); assert.match(dwn.flags.join(), /не отработала/);
    const form = M.calls.find(x => x.url === '/validate'); const p = new URLSearchParams(form.body); assert.equal(p.get('secret'), 'srv-key-1234567'); assert.ok(p.get('ip'));
  } finally { await putSettings(s => { s.integrations.captcha = {enabled: false, serverKey: '', url: 'https://smartcaptcha.yandexcloud.net/validate'}; }); M.srv.close(); }
});

test('Битрикс24: заявка создаёт лид (поля, телефон и e-mail списками); ошибка портала видна в проверке', async () => {
  let fail = false;
  const M = await mock((req, rs, body) => { if (fail) return jsonRes(rs, 200, {error: 'WRONG_AUTH_TYPE', error_description: 'Wrong authentication type'}); jsonRes(rs, 200, {result: 4321}); });
  try {
    assert.equal((await putSettings(s => { s.integrations.bitrix24 = {enabled: true, webhook: M.base + '/rest/1/abc123def/', source: 'WEB'}; })).status, 200);
    const t = await admin.post('/api/integrations/bitrix24/test'); assert.equal(t.status, 200, t.text); assert.equal(t.json.id, 4321);
    const call = M.calls[0]; assert.equal(call.url, '/rest/1/abc123def/crm.lead.add.json'); const b = JSON.parse(call.body); assert.equal(b.fields.SOURCE_ID, 'WEB'); assert.ok(b.fields.TITLE.includes('Заявка с сайта')); assert.ok(Array.isArray(b.fields.EMAIL) && b.fields.EMAIL[0].VALUE_TYPE === 'WORK');
    M.calls.length = 0; const r = await anon().raw('POST', '/api/lead', lead({name: 'Мария', phone: '+7 916 555-44-33', org: 'Клиника «Роза»', city: 'Самара'}), {Origin: ORIGIN}); assert.equal(r.status, 200);
    for (let i = 0; i < 30 && !M.calls.length; i++) await new Promise(x => setTimeout(x, 50));
    const lb = JSON.parse(M.calls[0].body).fields; assert.equal(lb.NAME, 'Мария'); assert.equal(lb.PHONE[0].VALUE, '+7 916 555-44-33'); assert.equal(lb.COMPANY_TITLE, 'Клиника «Роза»'); assert.equal(lb.ADDRESS_CITY, 'Самара');
    fail = true; const e = await admin.post('/api/integrations/bitrix24/test'); assert.equal(e.status, 502); assert.match(e.json.error, /Wrong authentication/);
    assert.equal((await putSettings(s => { s.integrations.bitrix24.webhook = 'не адрес'; })).status, 422);
    assert.equal((await admin.get('/api/settings')).json.integrations.bitrix24.webhook, '••••••••', 'адрес веб-хука (в нём секрет) скрыт');
  } finally { await putSettings(s => { s.integrations.bitrix24 = {enabled: false, webhook: '', source: 'WEB'}; }); M.srv.close(); }
});

test('согласие у заявки сохраняется с датой и версией документов; обращения субъектов: поиск, выгрузка, удаление', async () => {
  await putSettings(s => { s.rateLimit = {per10min: 50, perDay: 500}; });
  const phone = '+7 916 777-88-99', ids = [];
  for (const o of [{phone, email: 'x1@example.com', name: 'Пётр Сидоров'}, {phone: '8 (916) 777-88-99', email: 'x2@example.com', name: 'Пётр С.'}, {phone: '+7 925 000-00-01', email: 'other@example.com', name: 'Другой Человек'}]) { const r = await anon().raw('POST', '/api/lead', lead(Object.assign({consent_version: '2026-10-19', msg: 'Для проверки ' + o.email}, o)), {Origin: ORIGIN}); assert.equal(r.status, 200); ids.push(r.json.id); }
  const one = (await admin.get('/api/leads/' + ids[0])).json; assert.equal(one.consent, true); assert.equal(one.consent_version, '2026-10-19'); assert.ok(Date.now() - Date.parse(one.consent_at) < 60000); assert.ok(!('ip_raw' in one) && !/10\.4\./.test(JSON.stringify(one)), 'сырой IP-адрес в заявке не хранится');
  const found = await admin.get('/api/privacy/search?q=' + encodeURIComponent('89167778899')); assert.equal(found.status, 200); assert.deepEqual(found.json.items.map(x => x.id).sort(), [ids[0], ids[1]].sort(), 'телефон ищется по цифрам в любом написании');
  assert.equal((await admin.get('/api/privacy/search?q=other@example.com')).json.items.length, 1); assert.equal((await admin.get('/api/privacy/search?q=ab')).status, 400);
  const ex = await admin.get('/api/privacy/export?q=' + encodeURIComponent(phone)); assert.equal(ex.status, 200); assert.match(ex.headers['content-disposition'], /attachment/); assert.equal(ex.json.count, 2); assert.ok(ex.json.items[0].consent_at);
  assert.equal((await admin.post('/api/privacy/erase', {ids: ['bad']})).status, 400);
  const er = await admin.post('/api/privacy/erase', {ids: [ids[0], ids[1]], reason: 'требование субъекта'}); assert.equal(er.status, 200); assert.equal(er.json.removed, 2);
  assert.equal((await admin.get('/api/leads/' + ids[0])).status, 404); assert.equal((await admin.get('/api/leads/' + ids[2])).status, 200);
  const log = JSON.stringify((await admin.get('/api/audit?limit=100')).json.items); assert.ok(log.includes('privacy_erase')); assert.ok(!log.includes('x1@example.com') && !log.includes('777-88-99'), 'персональных данных в журнале нет');
  const reg = (await admin.get('/api/privacy/registry')).json; assert.ok(reg.systems.length >= 6); assert.ok(reg.systems.find(x => x.key === 'metrika').on); assert.ok(reg.purposes.length >= 4); assert.ok(reg.stored.inventory.total >= 1);
  const mgr = anon(); await mgr.login('pwgood', 'Tulip-Garden-2026'); await mgr.post('/api/password', {old: 'Tulip-Garden-2026', new: 'Tulip-Garden-2027'}); assert.equal((await mgr.get('/api/privacy/search?q=other@example.com')).status, 403, 'менеджер не видит инструменты персональных данных');
});

test('резервные копии: создание, скачивание без паролей и секретов, восстановление заявок, шифрование при DATA_KEY', async () => {
  const BK = require('../lib/backup');
  const r0 = await admin.post('/api/lead', {}).catch(() => null); void r0;
  const sent = await anon().raw('POST', '/api/lead', lead({name: 'Для копии', msg: 'сохранить'}), {Origin: ORIGIN}); assert.equal(sent.status, 200); const id = sent.json.id;
  const mk = await admin.post('/api/backups'); assert.equal(mk.status, 200); assert.ok(mk.json.files.includes('leads.json') && mk.json.files.includes('users.json'));
  const list = (await admin.get('/api/backups')).json; assert.ok(list.items.length >= 1);
  const dl = await admin.get('/api/backups/' + encodeURIComponent(mk.json.id) + '/download'); assert.equal(dl.status, 200); assert.ok(!/scrypt\$/.test(dl.text), 'хэшей паролей в выгрузке нет'); assert.ok(!/"totp"/.test(dl.text)); assert.ok(dl.json.leads.items.some(x => x.id === id)); assert.ok(dl.json.site['site.json']);
  assert.equal((await admin.del('/api/leads/' + id)).status, 200); assert.equal((await admin.get('/api/leads/' + id)).status, 404);
  const rs = await admin.post('/api/backups/' + encodeURIComponent(mk.json.id) + '/restore-leads'); assert.equal(rs.status, 200); assert.equal((await admin.get('/api/leads/' + id)).status, 200, 'заявка вернулась');
  assert.ok((await admin.get('/api/backups')).json.items.some(x => x.kind === 'before-restore'), 'перед восстановлением снята копия текущего состояния');
  assert.equal((await admin.get('/api/backups/..%2f..%2fetc/download')).status, 404); assert.equal((await admin.get('/api/backups/' + encodeURIComponent('x'.repeat(5)) + '/download')).status, 400);
  process.env.DATA_KEY = 'test-key-for-backup-0123456789'; try { const enc = await BK.create('тест', 'manual'); const f = fs.readFileSync(path.join(BK.DIR, enc.id, 'leads.json'), 'utf8'); assert.match(f, /^enc:v1:/, 'при DATA_KEY файлы копии зашифрованы'); assert.ok(BK.bundle(enc.id).leads.items.length >= 1); } finally { delete process.env.DATA_KEY; }
  assert.equal((await admin.put('/api/backups/settings', {auto: false, keep: 5})).status, 200);
  const mgr = client(S.port, '10.5.5.5'); await mgr.login('pwgood', 'Tulip-Garden-2027'); assert.equal((await mgr.get('/api/backups')).status, 403);
});

test('полный контроль: тексты форм, подвал, картинка для соцсетей, «Путь к закупке» и реплики Стеллы правятся из админки и попадают на сайт', async () => {
  const c = (await admin.get('/api/collections/content')).json, d = c.data;
  const bad = JSON.parse(JSON.stringify(d)); bad.forms.contact.agree = 'без ссылки на документ'; assert.equal((await admin.put('/api/collections/content', {data: bad, version: c.version})).status, 422, 'подпись у согласия обязана вести на документ');
  d.forms.contact.title = 'Напишите нам прямо сейчас'; d.forms.contact.submit = 'Отправить сообщение'; d.forms.subscribe.done = ['Готово!', 'Ждите писем.'];
  const r = await admin.put('/api/collections/content', {data: d, version: c.version}); assert.equal(r.status, 200, r.text); assert.ok(r.json.build.ok);
  const contacts = fs.readFileSync(path.join(S.root, 'contacts.html'), 'utf8'); assert.ok(contacts.includes('Отправить сообщение'), 'текст кнопки формы на странице');
  const data = fs.readFileSync(path.join(S.root, 'js', 'data.js'), 'utf8'); assert.ok(data.includes('Напишите нам прямо сейчас') && data.includes('Ждите писем.') && data.includes('Отправить сообщение'), 'и в браузерных данных (окна форм)');
  const site = (await admin.get('/api/collections/site')).json, sd = site.data; sd.schemaAddress.street = 'ул. Новая, д. 1'; const bad2 = JSON.parse(JSON.stringify(sd)); bad2.ogImage = 'assets/нет-такого.png';
  assert.equal((await admin.put('/api/collections/site', {data: bad2, version: site.version})).status, 422); assert.equal((await admin.put('/api/collections/site', {data: sd, version: site.version})).status, 200);
  const idx = fs.readFileSync(path.join(S.root, 'index.html'), 'utf8'); assert.ok(idx.includes('ул. Новая, д. 1'), 'адрес в разметке организации берётся из данных'); assert.match(idx, /"sameAs":\[[^\]]*youtube\.com/, 'профили организации попадают в разметку'); assert.match(idx, /property="og:image" content="[^"]*assets\/og-image\.png"/);
  const sales = (await admin.get('/api/collections/sales')); assert.equal(sales.status, 200); assert.ok(sales.json.data.planner); assert.equal((await admin.put('/api/collections/sales', {data: sales.json.data, version: sales.json.version})).json.unchanged, true);
  const sv = (await admin.get('/api/collections/stella_voice')); assert.equal(sv.status, 200); assert.equal((await admin.put('/api/collections/stella_voice', {data: sv.json.data, version: sv.json.version})).json.unchanged, true);
  assert.equal((await admin.put('/api/collections/stella_voice', {data: [], version: sv.json.version})).status, 422);
  const groups = (await admin.get('/api/collections')).json.collections.map(x => x.group); assert.ok(groups.includes('Помощник Стелла'));
});

test('архив сайта для обычного хостинга: корректный ZIP без исходных данных и серверного кода', async () => {
  const r = await new Promise((res, rej) => { const chunks = []; const rq = http.request({host: '127.0.0.1', port: S.port, path: '/api/site.zip', headers: {'X-Forwarded-For': '10.9.9.9', Cookie: admin.cookie}}, rs => { rs.on('data', c => chunks.push(c)); rs.on('end', () => res({status: rs.statusCode, headers: rs.headers, body: Buffer.concat(chunks)})); }); rq.on('error', rej); rq.end(); });
  assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'application/zip'); assert.equal(r.body.readUInt32LE(0), 0x04034b50, 'сигнатура ZIP');
  const file = path.join(S.data, 'site-test.zip'); fs.writeFileSync(file, r.body);
  const py = require('child_process').spawnSync('python3', ['-c', 'import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip(); n=z.namelist(); print(json.dumps({"bad": bad, "n": len(n), "names": n}))', file], {encoding: 'utf8'});
  if (py.error) return; const j = JSON.parse(py.stdout); assert.equal(j.bad, null, 'все записи читаются, контрольные суммы верны'); assert.ok(j.n > 100);
  for (const must of ['index.html', 'privacy.html', 'consent.html', 'css/fonts.css', 'js/data.js', 'sitemap.xml', 'robots.txt', '.well-known/security.txt']) assert.ok(j.names.includes(must), must);
  assert.ok(!j.names.some(n => /^(data|server|tools|src)\//.test(n) || /\.json$/.test(n) && !/webmanifest/.test(n)), 'исходных данных и сервера в архиве нет');
  assert.equal((await client(S.port, '10.9.9.8').raw('GET', '/api/site.zip')).status, 401);
});

test('журнал: действия с адресом, строки без управляющих символов, ограничение размера записи', async () => {
  const AUD = require('../lib/audit'); AUD.add('тест\nинъекция', 'content', 'строка\nвторая\u0000строка', '5.5.5.5');
  const items = (await admin.get('/api/audit?limit=5')).json.items; const x = items[0]; assert.ok(!/[\n\u0000]/.test(x.who + x.detail)); assert.equal(x.ip, '5.5.5.5');
  AUD.add('x', 'content', 'я'.repeat(1000)); assert.equal((await admin.get('/api/audit?limit=1')).json.items[0].detail.length, 300);
  const filtered = (await admin.get('/api/audit?action=login_fail&limit=100')).json.items; assert.ok(filtered.length > 0 && filtered.every(i => i.action === 'login_fail'));
});

test('прочее: заголовки CORS только для разрешённых сайтов, чужой Origin не допускается к админке', async () => {
  const c = anon();
  const ok = await c.raw('POST', '/api/lead', lead(), {Origin: ORIGIN}); assert.equal(ok.headers['access-control-allow-origin'], ORIGIN);
  const evil = await c.raw('POST', '/api/lead', lead(), {Origin: 'https://evil.example'}); assert.equal(evil.status, 403); assert.ok(!evil.headers['access-control-allow-origin']);
  const a = await S.admin(); a.origin = 'https://evil.example'; assert.equal((await a.post('/api/backups')).status, 403, 'запрос с чужого сайта отклонён даже с cookie и токеном');
  assert.equal((await client(S.port, '10.6.6.6').raw('POST', '/api/lead', '[1,2,3]', {Origin: ORIGIN, 'Content-Type': 'application/json'})).status, 422);
});
