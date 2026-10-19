/* Защищённые исходящие запросы (веб-хук, CRM, API Метрики, проверка капчи): адрес назначения проверяется в момент соединения, поэтому подмена DNS (rebinding)
   и ссылки на внутреннюю сеть (127.0.0.1, 10.*, 169.254.169.254 — служебные адреса облака) не работают. Переходы по redirect не выполняются.
   Для тестов и локальных систем (своя CRM в той же сети) частные адреса можно разрешить переменной ALLOW_PRIVATE_NETWORK=1. */
'use strict';
const dns = require('dns'), net = require('net'), http = require('http'), https = require('https');
const C = require('./config');

const allowPrivate = () => C.env.ALLOW_PRIVATE_NETWORK === '1';
function privateV4(a) {
  const [p, q] = a.split('.').map(Number);
  return p === 0 || p === 10 || p === 127 || (p === 100 && q >= 64 && q <= 127) || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 0) || (p === 192 && q === 168) || (p === 198 && (q === 18 || q === 19)) || p >= 224;
}
function isPrivateIp(ip) {
  ip = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (net.isIPv4(ip)) return privateV4(ip);
  if (!net.isIPv6(ip)) return true;
  const m = ip.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/); if (m) return privateV4(m[1]);
  const mh = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/); if (mh) { const a = parseInt(mh[1], 16), b = parseInt(mh[2], 16); return privateV4([a >> 8, a & 255, b >> 8, b & 255].join('.')); }
  if (ip === '::' || ip === '::1') return true;
  const first = parseInt(ip.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}
/* разбор и первичная проверка адреса; бросает понятную ошибку */
function parse(urlStr, opts) {
  let u; try { u = new URL(String(urlStr)); } catch (e) { throw new Error('некорректный адрес'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('разрешены только http(s)-адреса');
  if (u.username || u.password) throw new Error('логин и пароль в адресе не допускаются');
  if (u.protocol === 'http:' && opts && opts.httpsOnly) throw new Error('нужен адрес https://');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate()) {
    if (net.isIP(host) && isPrivateIp(host)) throw new Error('адрес во внутренней сети запрещён');
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('внутренние имена запрещены');
  }
  return u;
}
function guardedLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, Object.assign({}, options, {all: true}), (err, list) => {
    if (err) return cb(err);
    const ok = allowPrivate() ? list : list.filter(a => !isPrivateIp(a.address));
    if (!ok.length) return cb(Object.assign(new Error('адрес разрешается во внутреннюю сеть — запрос заблокирован'), {code: 'EBLOCKED'}));
    if (options && options.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}
/* запрос: {method, headers, body (строка/Buffer), timeout, maxBytes, httpsOnly}; ответ: {status, headers, text, json} */
function request(urlStr, o) {
  o = o || {};
  return new Promise((resolve, reject) => {
    let u; try { u = parse(urlStr, o); } catch (e) { return reject(e); }
    const lib = u.protocol === 'https:' ? https : http, body = o.body === undefined ? null : (Buffer.isBuffer(o.body) ? o.body : Buffer.from(String(o.body), 'utf8'));
    const headers = Object.assign({'User-Agent': 'astreya-server/1.0'}, o.headers); if (body) headers['Content-Length'] = body.length;
    const req = lib.request({protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: u.pathname + u.search, method: o.method || 'GET', headers, lookup: guardedLookup, timeout: o.timeout || 10000}, res => {
      const chunks = []; let n = 0, over = false;
      res.on('data', c => { n += c.length; if (n > (o.maxBytes || 2e6)) { over = true; req.destroy(new Error('ответ слишком большой')); } else chunks.push(c); });
      res.on('end', () => { if (over) return; const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch (e) {} resolve({status: res.statusCode, headers: res.headers, text, json}); });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('время ожидания вышло')));
    req.on('error', reject);
    req.end(body);
  });
}
const postJSON = (url, obj, o) => request(url, Object.assign({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(obj)}, o));
module.exports = {request, postJSON, parse, isPrivateIp, allowPrivate, guardedLookup};
