const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), pth = require('path');
const ROOT = pth.resolve(__dirname, '..', '..');
const MIME = {'.webp': 'image/webp', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.png': 'image/png', '.html': 'text/html'};
(async () => {
  const srv = http.createServer((q, r) => { const f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': MIME[pth.extname(f)] || 'text/html'}); r.end(d); } }); });
  await new Promise(r => srv.listen(8142, '127.0.0.1', r));
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p = await b.newPage(); await p.goto('http://127.0.0.1:8142/tools/jar-bench/arena.html');
  const names = ['webp80', 'jpg80', 'jpg70', 'jpgP80', 'avif60', 'png', 'webp70_s', 'jpg80_s'];
  const exts = {webp80: 'webp', jpg80: 'jpg', jpg70: 'jpg', jpgP80: 'jpg', avif60: 'avif', png: 'png', webp70_s: 'webp', jpg80_s: 'jpg'};
  for (const n of names) {
    const r = await p.evaluate(async ([n, ext]) => {
      const bm = []; let size = 0;
      for (let rep = 0; rep < 8; rep++) for (const k of ['a', 'b', 'c']) { const blob = await (await fetch(`/tools/jar-bench/.cache/fmt/${k}_${n}.${ext}?r=${rep}`)).blob(); size = blob.size; const t0 = performance.now(); const x = await createImageBitmap(blob); bm.push(performance.now() - t0); x.close(); }
      bm.sort((a, b) => a - b); return {med: bm[Math.floor(bm.length / 2)], kb: size / 1024};
    }, [n, exts[n]]);
    console.log(n.padEnd(10), 'createImageBitmap(blob) медиана', r.med.toFixed(1), 'мс; файл', r.kb.toFixed(0), 'КБ');
  }
  await b.close(); srv.close();
})();
