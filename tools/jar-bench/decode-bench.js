// сколько стоит декодировать один кадр (вне основного потока, img.decode()) — ориентир для слабых телефонов умножать на 3-5
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), pth = require('path');
const ROOT = pth.resolve(__dirname, '..', '..');
(async () => {
  const srv = http.createServer((q, r) => { const f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': 'image/webp'}); r.end(d); } }); });
  await new Promise(r => srv.listen(8141, '127.0.0.1', r));
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p = await b.newPage(); await p.goto('http://127.0.0.1:8141/assets/jar/d/002.webp');
  for (const [name, dir, n] of [['desktop 1920x1080 q80', '/assets/jar/d/', 60], ['mobile 810x1440 q80', '/assets/jar/m/', 60], ['desktop-lite 960x540 q70', '/assets/jar/d-lite/', 60], ['mobile-lite 540x960 q70', '/assets/jar/m-lite/', 60], ['baked desktop 1920x1080', '/tools/jar-bench/.cache/bake_d/', 60]]) {
    const r = await p.evaluate(async ([dir, n]) => {
      const ms = []; let bytes = 0;
      for (let i = 0; i < n; i++) { const k = String(i * 3 % 270 + 2).padStart(3, '0'); const url = dir + k + '.webp?x=' + Math.random(); const t0 = performance.now(); const im = new Image(); im.src = url; await im.decode(); ms.push(performance.now() - t0); }
      const bm = []; for (let i = 0; i < 20; i++) { const k = String(i * 5 % 270 + 2).padStart(3, '0'); const blob = await (await fetch(dir + k + '.webp')).blob(); bytes += blob.size; const t0 = performance.now(); const b = await createImageBitmap(blob); bm.push(performance.now() - t0); b.close(); }
      ms.sort((a, b) => a - b); bm.sort((a, b) => a - b);
      return {decodeMed: ms[Math.floor(ms.length / 2)], decodeP90: ms[Math.floor(ms.length * 0.9)], bmpMed: bm[Math.floor(bm.length / 2)], kb: bytes / 20 / 1024};
    }, [dir, n]);
    console.log(name.padEnd(28), 'img.decode() медиана', r.decodeMed.toFixed(1), 'мс, p90', r.decodeP90.toFixed(1), '| createImageBitmap(blob)', r.bmpMed.toFixed(1), 'мс | файл', r.kb.toFixed(0), 'КБ');
  }
  await b.close(); srv.close();
})();
