/* Текстуры страниц 3D-журнала на столике (tools/jar-render/hall_table.py, ZONE_MAG=1): два настоящих листа журнала с сайта — обложка разворота слева (фото + «Наука. Забота. Результат.»)
 * и «Содержание» справа — рисуются браузером из той же вёрстки (house.html), что и журнал на сайте, 1200×1600 px. Запуск (из корня репозитория, после node tools/build.js):
 *     NODE_PATH=/opt/node22/lib/node_modules node tools/jar-render/mag_tex.js
 * Результат: tools/jar-render/mag/page-l.png, page-r.png, cover.png (обложка — для боковой кромки не нужна, только цвет). */
const http = require('http'), fs = require('fs'), path = require('path');
const pw = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'mag');
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({viewport: {width: 1400, height: 1000}, deviceScaleFactor: 2, locale: 'ru-RU'});
  await ctx.route(/^https:\/\/fonts\./, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(base + '/house.html'); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(800);
  for (const [sel, name] of [['.pg-welcome', 'page-l'], ['.pg-toc', 'page-r']]) {
    await p.evaluate(sel => {
      document.querySelectorAll('#texbox').forEach(e => e.remove());
      const src = document.querySelector('#mag ' + sel); const box = document.createElement('div'); box.id = 'texbox';
      box.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:800px;--pw:600px;background:var(--hs-paper,#f8f2e4);overflow:hidden;z-index:99999';
      const c = src.cloneNode(true); box.appendChild(c); document.body.appendChild(box);
      c.querySelectorAll('img').forEach(i => { i.loading = 'eager'; });
    }, sel);
    await p.waitForFunction(() => Array.from(document.querySelectorAll('#texbox img')).every(i => i.complete && i.naturalWidth), null, {timeout: 15000}).catch(() => {});
    await p.waitForTimeout(400);
    await p.locator('#texbox').screenshot({path: path.join(OUT, name + '.png')});
    console.log('ok', name);
  }
  await b.close(); srv.close();
})();
