/* Общее для тестов сервера: временная копия сайта, запуск сервера на свободном порту, HTTP-запросы с cookie и CSRF. Запускается из server/test/*.test.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const REPO = path.resolve(__dirname, '..', '..');

/* копия сайта без тяжёлых кадров вступления (нужны только первые кадры, на них ссылаются страницы) */
function makeSite(dir) {
  fs.mkdirSync(dir, {recursive: true});
  const skip = new Set(['.git', 'node_modules']);
  for (const e of fs.readdirSync(REPO, {withFileTypes: true})) {
    if (skip.has(e.name)) continue;
    const src = path.join(REPO, e.name), dst = path.join(dir, e.name);
    if (e.name === 'assets') {
      fs.mkdirSync(dst, {recursive: true});
      for (const a of fs.readdirSync(src, {withFileTypes: true})) {
        if (a.name === 'jar') { for (const d of ['d', 'm']) { fs.mkdirSync(path.join(dst, 'jar', d), {recursive: true}); fs.copyFileSync(path.join(src, 'jar', d, '000.webp'), path.join(dst, 'jar', d, '000.webp')); } }
        else fs.cpSync(path.join(src, a.name), path.join(dst, a.name), {recursive: true});
      }
    } else if (e.name === 'tools') fs.cpSync(src, dst, {recursive: true, filter: s => !s.includes('jar-bench')});
    else if (e.name === 'server') fs.cpSync(src, dst, {recursive: true, filter: s => !/\/server\/(data|test)(\/|$)/.test(s)});         // как в рабочем размещении: server/ лежит внутри папки сайта, сборка и проверка его не трогают
    else fs.cpSync(src, dst, {recursive: true});
  }
  return dir;
}
const tmp = prefix => fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), prefix));

/* простой HTTP-клиент: возвращает {status, headers, text, json, cookie} */
function request(port, method, url, o) {
  o = o || {};
  return new Promise((resolve, reject) => {
    const headers = Object.assign({}, o.headers);
    let body = o.body;
    if (body !== undefined && typeof body !== 'string' && !Buffer.isBuffer(body)) { body = JSON.stringify(body); headers['Content-Type'] = headers['Content-Type'] || 'application/json'; }
    if (body !== undefined) headers['Content-Length'] = Buffer.byteLength(body);
    const r = http.request({host: '127.0.0.1', port, method, path: url, headers}, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch (e) {}
        const sc = [].concat(res.headers['set-cookie'] || []);
        resolve({status: res.statusCode, headers: res.headers, text, json, setCookie: sc});
      });
    });
    r.on('error', reject); r.end(body);
  });
}
/* клиент с сессией: client.login(), client.get/post/put/patch/del */
function client(port, ip) {
  const c = {cookie: '', csrf: '', ip: ip || '10.0.0.1', origin: null};
  const call = (method, url, body, extra) => {
    const headers = Object.assign({'X-Forwarded-For': c.ip}, extra);
    if (c.cookie) headers.Cookie = c.cookie; if (c.csrf && method !== 'GET') headers['X-CSRF-Token'] = c.csrf; if (c.origin) headers.Origin = c.origin;
    return request(port, method, url, {headers, body});
  };
  Object.assign(c, {
    raw: call,
    get: (u, h) => call('GET', u, undefined, h), post: (u, b, h) => call('POST', u, b === undefined ? {} : b, h), put: (u, b, h) => call('PUT', u, b, h), patch: (u, b, h) => call('PATCH', u, b, h), del: (u, h) => call('DELETE', u, undefined, h),
    async login(login, password) {
      const r = await call('POST', '/api/login', {login, password});
      if (r.status === 200) { c.cookie = r.setCookie.map(s => s.split(';')[0]).join('; '); c.csrf = r.json.csrf; }
      return r;
    }
  });
  return c;
}
/* запуск сервера внутри процесса теста: свои копия сайта и папка данных, адрес клиента берётся из X-Forwarded-For (TRUST_PROXY=1) */
async function boot(env) {
  const root = makeSite(tmp('astreya-site-')), data = tmp('astreya-data-');
  Object.assign(process.env, {SITE_ROOT: root, DATA_DIR: data, TRUST_PROXY: '1', ADMIN_LOGIN: 'admin', ADMIN_PASSWORD: 'Strong-pass-2026'}, env);
  const app = require('../index'), server = await app.start(0, '127.0.0.1');
  const port = server.address().port;
  return {root, data, port, server, close: () => new Promise(r => { server.close(r); server.closeAllConnections && server.closeAllConnections(); }),
    admin: async () => { const c = client(port, '10.9.9.9'); const r = await c.login('admin', 'Strong-pass-2026'); if (r.status !== 200) throw new Error('admin login failed: ' + r.text); return c; }};
}
const rd = (root, f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
module.exports = {REPO, makeSite, tmp, request, client, boot, rd};
