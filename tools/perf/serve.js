/* Локальный сервер для замеров: HTTP/2 + gzip на https://localhost:8831 (как у хостинга), обычный http://localhost:8832 (на нём работает service worker без сертификата).
   Счётчик запросов: /__reset и /__count (его читают sw-check.js и другие). Сертификат самоподписанный, создаётся при первом запуске (openssl). Запуск: node tools/perf/serve.js */
const http = require('http'), http2 = require('http2'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), KEY = path.join(os.tmpdir(), 'astreya-h2.key'), CRT = path.join(os.tmpdir(), 'astreya-h2.crt');
if (!fs.existsSync(KEY) || !fs.existsSync(CRT)) cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', KEY, '-out', CRT, '-days', '30', '-subj', '/CN=localhost'], {stdio: 'ignore'});
const T = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml'};
let hits = {n: 0, b: 0, list: []};
const handler = (req, res) => {
  if (req.url.startsWith('/__reset')) { hits = {n: 0, b: 0, list: []}; res.writeHead(200); return res.end('ok'); }
  if (req.url.startsWith('/__count')) { res.writeHead(200, {'content-type': 'application/json'}); return res.end(JSON.stringify(hits)); }
  let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  const ext = path.extname(f), h = {'content-type': T[ext] || 'application/octet-stream', 'cache-control': 'max-age=600'};
  const gz = /\.(html|js|css|json|svg|webmanifest|txt|xml)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '');
  let body = fs.readFileSync(f); if (gz) { body = zlib.gzipSync(body, {level: 6}); h['content-encoding'] = 'gzip'; }
  h['content-length'] = body.length; hits.n++; hits.b += body.length; hits.list.push(u); res.writeHead(200, h); res.end(body);
};
http2.createSecureServer({key: fs.readFileSync(KEY), cert: fs.readFileSync(CRT), allowHTTP1: true}, handler).listen(8831, () => console.log('HTTP/2 на https://localhost:8831'));
http.createServer(handler).listen(8832, () => console.log('HTTP/1.1 на http://localhost:8832'));
