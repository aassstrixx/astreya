/* HTTP-помощники: тело запроса, ответы JSON, cookie, раздача файлов с защитой от выхода за пределы папки. */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./config');
const {httpErr} = require('./auth');

const MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.csv': 'text/csv; charset=utf-8'};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const len = +req.headers['content-length'] || 0; if (len > limit) return reject(httpErr(413, 'Слишком большой запрос.'));
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(httpErr(413, 'Слишком большой запрос.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
}
async function readJSONBody(req, limit) {
  const ct = String(req.headers['content-type'] || '');
  if (!/^application\/json\b/i.test(ct) && !/^text\/plain\b/i.test(ct)) throw httpErr(415, 'Ожидается JSON (Content-Type: application/json).');
  const b = await readBody(req, limit);
  try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch (e) { throw httpErr(400, 'Некорректный JSON.'); }
}
const SEC = {'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'};
function send(res, status, body, headers) { res.writeHead(status, Object.assign({}, SEC, headers)); res.end(body); }
function json(res, status, obj, headers) { send(res, status, JSON.stringify(obj), Object.assign({'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}, headers)); }

const parseCookies = h => String(h || '').split(';').reduce((m, p) => { const i = p.indexOf('='); if (i > 0) m[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); return m; }, {});
const cookie = (name, value, o) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict${o.secure ? '; Secure' : ''}${o.maxAge !== undefined ? '; Max-Age=' + o.maxAge : ''}`;

/* раздача файлов из baseDir; allow(relPath) решает, что можно отдавать */
function serveStatic(req, res, baseDir, rel, opts) {
  opts = opts || {};
  let p; try { p = decodeURIComponent(rel); } catch (e) { return send(res, 400, 'bad request'); }
  if (p.includes('\0')) return send(res, 400, 'bad request');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  let file = path.normalize(path.join(baseDir, p));
  if (!file.startsWith(baseDir + path.sep) && file !== baseDir) return send(res, 403, 'forbidden');
  const tryFile = (f, retry) => {
    const relp = path.relative(baseDir, f).split(path.sep).join('/');
    if (opts.allow && !opts.allow(relp)) return retry && !path.extname(f) ? tryFile(f + '.html', false) : notFound(res, opts);
    fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { if (retry && !path.extname(f)) return tryFile(f + '.html', false); return notFound(res, opts); }
    file = f;
    const ext = path.extname(file).toLowerCase(), headers = Object.assign({'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Last-Modified': st.mtime.toUTCString()}, opts.headers && opts.headers(relp, ext));
    if (req.headers['if-modified-since'] && Date.parse(req.headers['if-modified-since']) >= Math.floor(st.mtimeMs / 1000) * 1000 && !opts.noCache) { return send(res, 304, '', headers); }
    res.writeHead(200, Object.assign({}, SEC, headers));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }); };
  tryFile(file, !!opts.cleanUrls);
}
function notFound(res, opts) {
  const f = opts && opts.notFoundFile;
  if (f && fs.existsSync(f)) { const b = fs.readFileSync(f); return send(res, 404, b, {'Content-Type': 'text/html; charset=utf-8'}); }
  send(res, 404, 'Not found', {'Content-Type': 'text/plain; charset=utf-8'});
}
module.exports = {readBody, readJSONBody, send, json, parseCookies, cookie, serveStatic, MIME, SEC};
