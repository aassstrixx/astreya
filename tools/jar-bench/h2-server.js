/* Локальный HTTP/2-сервер для проверки первой загрузки: GitHub Pages отдаёт файлы по HTTP/2 (параллельных запросов много), а обычный http-сервер Node — по HTTP/1.1
   (шесть соединений на хост), из-за чего ограничение числа «полос» загрузки в странице было бы искажено. Сертификат одноразовый, для localhost;
   Chromium получает его отпечаток (--ignore-certificate-errors-spki-list) — проверка остальных сертификатов не отключается.
   const {start} = require('./h2-server.js'); const s = await start(rootDir, port); s.args — аргументы запуска Chromium; s.url; s.close() */
const http2 = require('http2'), fs = require('fs'), pth = require('path'), cp = require('child_process'), os = require('os');
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain'};
exports.start = async function (root, port, patches) {
  const dir = fs.mkdtempSync(pth.join(os.tmpdir(), 'h2-')), key = pth.join(dir, 'k.pem'), crt = pth.join(dir, 'c.pem');
  cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], {stdio: 'ignore'});
  const pub = cp.execSync(`openssl x509 -in ${crt} -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`).toString().trim();
  const srv = http2.createSecureServer({key: fs.readFileSync(key), cert: fs.readFileSync(crt), allowHTTP1: true}, (q, r) => {
    let f = pth.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
    fs.readFile(f, (e, d) => { if (!e && patches) { const rel = pth.relative(root, f); for (const [name, list] of Object.entries(patches)) if (rel === name) { let t = d.toString(); for (const [a, b] of list) { if (!t.includes(a)) console.error('ПРАВКА НЕ НАЙДЕНА', name, a.slice(0, 60)); t = t.split(a).join(b); } d = Buffer.from(t); } } if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': MIME[pth.extname(f)] || 'application/octet-stream', 'cache-control': 'public, max-age=600'}); r.end(d); } });
  });
  await new Promise(res => srv.listen(port, '127.0.0.1', res));
  return {url: `https://localhost:${port}`, args: [`--ignore-certificate-errors-spki-list=${pub}`], close: () => { srv.close(); fs.rmSync(dir, {recursive: true, force: true}); }};
};
