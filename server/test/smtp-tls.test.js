/* SMTP с шифрованием: STARTTLS (587) и сразу TLS (465). Проверка сертификата включена всегда — тестовому серверу доверяют только через NODE_EXTRA_CA_CERTS в дочернем процессе;
   без этого доверия отправка обязана провалиться (то есть проверка действительно работает). Нужен openssl. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('child_process'), fs = require('fs'), path = require('path');
const {tmp} = require('./helpers');

let have = true; try { execFileSync('openssl', ['version'], {stdio: 'ignore'}); } catch (e) { have = false; }
const dir = have ? tmp('astreya-tls-') : null;
if (have) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:TRUE'], {stdio: 'ignore'});

/* дочерний процесс: поднимает почтовый сервер с TLS и отправляет письмо нашим клиентом */
const CHILD = `
const net = require('net'), tls = require('tls'), fs = require('fs'), path = require('path');
process.env.DATA_DIR = process.env.TMPD; const {smtpSend} = require(process.env.NOTIFY);
const key = fs.readFileSync(path.join(process.env.TMPD, 'k.pem')), cert = fs.readFileSync(path.join(process.env.TMPD, 'c.pem'));
const mode = process.env.MODE, got = {auth: null, rcpt: [], body: '', tls: false};
function handler(sock) {
  let buf = '', data = false; sock.setEncoding('utf8'); let upgraded = false;
  const onData = chunk => { buf += chunk; for (;;) {
    if (data) { const i = buf.indexOf('\\r\\n.\\r\\n'); if (i < 0) return; got.body = buf.slice(0, i); buf = buf.slice(i + 5); data = false; sock.write('250 queued\\r\\n'); continue; }
    const i = buf.indexOf('\\r\\n'); if (i < 0) return; const line = buf.slice(0, i); buf = buf.slice(i + 2);
    if (/^EHLO/i.test(line)) sock.write('250-mock\\r\\n' + (mode === 'starttls' && !upgraded ? '250-STARTTLS\\r\\n' : '') + (mode !== 'starttls' || upgraded ? '250-AUTH PLAIN\\r\\n' : '') + '250 8BITMIME\\r\\n');
    else if (/^STARTTLS/i.test(line)) { sock.write('220 go\\r\\n'); sock.removeListener('data', onData); const t = new tls.TLSSocket(sock, {isServer: true, key, cert}); upgraded = true; got.tls = true; buf = ''; handler2(t); return; }
    else if (/^AUTH PLAIN/i.test(line)) { got.auth = Buffer.from(line.slice(11), 'base64').toString().split('\\0').slice(1).join(':'); sock.write('235 ok\\r\\n'); }
    else if (/^MAIL FROM/i.test(line)) sock.write('250 ok\\r\\n'); else if (/^RCPT TO/i.test(line)) { got.rcpt.push(line.slice(8)); sock.write('250 ok\\r\\n'); }
    else if (/^DATA/i.test(line)) { data = true; sock.write('354 go\\r\\n'); } else if (/^QUIT/i.test(line)) { sock.write('221 bye\\r\\n'); sock.end(); return; } else sock.write('500 ?\\r\\n');
  } };
  sock.on('data', onData); sock.on('error', () => {});
  function handler2(t) { t.setEncoding('utf8'); t.on('error', () => {}); const st = {buf: '', data: false}; handlerTls(t, st); }
  function handlerTls(t) { let b = '', d = false; t.on('data', c => { b += c; for (;;) {
    if (d) { const i = b.indexOf('\\r\\n.\\r\\n'); if (i < 0) return; got.body = b.slice(0, i); b = b.slice(i + 5); d = false; t.write('250 queued\\r\\n'); continue; }
    const i = b.indexOf('\\r\\n'); if (i < 0) return; const line = b.slice(0, i); b = b.slice(i + 2);
    if (/^EHLO/i.test(line)) t.write('250-mock\\r\\n250-AUTH PLAIN\\r\\n250 8BITMIME\\r\\n'); else if (/^AUTH PLAIN/i.test(line)) { got.auth = Buffer.from(line.slice(11), 'base64').toString().split('\\0').slice(1).join(':'); t.write('235 ok\\r\\n'); }
    else if (/^MAIL FROM/i.test(line)) t.write('250 ok\\r\\n'); else if (/^RCPT TO/i.test(line)) { got.rcpt.push(line.slice(8)); t.write('250 ok\\r\\n'); }
    else if (/^DATA/i.test(line)) { d = true; t.write('354 go\\r\\n'); } else if (/^QUIT/i.test(line)) { t.write('221 bye\\r\\n'); t.end(); return; } else t.write('500 ?\\r\\n');
  } }); }
  if (mode === 'implicit') sock.write('220 mock ESMTP\\r\\n'); else sock.write('220 mock ESMTP\\r\\n');
}
const srv = mode === 'implicit' ? tls.createServer({key, cert}, handler) : net.createServer(handler);
srv.listen(0, '127.0.0.1', async () => {
  const cfg = {host: process.env.HOSTN || 'localhost', port: srv.address().port, secure: mode === 'implicit', user: 'robot', pass: 'p4ss', from: 'site@astreya.example', to: 'sales@astreya.example'};
  try { await smtpSend(cfg, 'Тема письма', 'Тело письма: привет'); console.log(JSON.stringify({ok: true, got})); } catch (e) { console.log(JSON.stringify({ok: false, error: e.message})); }
  process.exit(0);
});`;
const run = (mode, trust, host) => { const f = path.join(dir, 'child.js'); fs.writeFileSync(f, CHILD);
  const env = Object.assign({}, process.env, {MODE: mode, TMPD: dir, NOTIFY: path.resolve(__dirname, '..', 'lib', 'notify.js'), HOSTN: host || 'localhost'}); delete env.NODE_EXTRA_CA_CERTS; if (trust) env.NODE_EXTRA_CA_CERTS = path.join(dir, 'c.pem');
  const r = spawnSync(process.execPath, [f], {env, encoding: 'utf8', timeout: 30000}); const line = (r.stdout || '').trim().split('\n').pop(); try { return JSON.parse(line); } catch (e) { return {ok: false, error: 'нет ответа: ' + r.stdout + r.stderr}; } };

test('STARTTLS (порт 587): письмо уходит по шифрованному каналу, пароль передаётся только после шифрования', {skip: !have && 'нет openssl'}, () => {
  const r = run('starttls', true); assert.equal(r.ok, true, r.error); assert.equal(r.got.tls, true); assert.equal(r.got.auth, 'robot:p4ss'); assert.match(r.got.rcpt[0], /sales@astreya\.example/);
  assert.match(Buffer.from(r.got.body.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''), 'base64').toString(), /Тело письма: привет/);
});
test('сразу TLS (порт 465)', {skip: !have && 'нет openssl'}, () => {
  const r = run('implicit', true); assert.equal(r.ok, true, r.error); assert.equal(r.got.auth, 'robot:p4ss');
});
test('сертификат не из доверенных → отправка отклоняется (проверка TLS не отключена); по IP из SAN — проходит', {skip: !have && 'нет openssl'}, () => {
  let r = run('starttls', false); assert.equal(r.ok, false); assert.match(r.error, /self[- ]signed|certificate|CERT/i);
  r = run('implicit', false); assert.equal(r.ok, false);
  r = run('implicit', true, '127.0.0.1'); assert.equal(r.ok, true, 'по IP сертификат тоже действителен (SAN IP:127.0.0.1)');
});
