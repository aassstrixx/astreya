/* Арена №3: каждого кандидата рисует в canvas браузером (как это делает js/jar.js: cover, imageSmoothingQuality low/high) и сохраняет PNG.
   node sharp-run.js <папка_кандидатов> <d|m> <ширинаxвысота,…>  — затем sharp-eval.py считает метрики против исходника без потерь */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), pth = require('path');
const dir = pth.resolve(process.argv[2]), kind = process.argv[3], sizes = process.argv[4].split(',').map(s => s.split('x').map(Number));
const meta = JSON.parse(fs.readFileSync(pth.join(dir, 'meta.json'), 'utf8'));
(async () => {
  const srv = http.createServer((q, r) => { const f = pth.join(dir, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': f.endsWith('.png') ? 'image/png' : f.endsWith('.json') ? 'application/json' : f.endsWith('.avif') ? 'image/avif' : 'image/webp', 'access-control-allow-origin': '*'}); r.end(d); } }); });
  await new Promise(r => srv.listen(8163, '127.0.0.1', r));
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const p = await b.newPage(); await p.goto('http://127.0.0.1:8163/meta.json');
  fs.mkdirSync(pth.join(dir, 'out'), {recursive: true});
  for (const [CW, CH] of sizes) for (const name of Object.keys(meta.cands)) for (const k of meta.ks) for (const q of ['low', 'high']) {
    const url = await p.evaluate(async ([name, k, CW, CH, q, ext]) => {
      const im = new Image(); im.src = `/${name}_${String(k).padStart(3, '0')}.${ext}`; await im.decode();
      const c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d', {alpha: false});
      const s = Math.max(CW / im.naturalWidth, CH / im.naturalHeight), dw = im.naturalWidth * s, dh = im.naturalHeight * s;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = q; g.drawImage(im, (CW - dw) / 2, (CH - dh) / 2, dw, dh);
      return c.toDataURL('image/png');
    }, [name, k, CW, CH, q, meta.ext || 'webp']);
    fs.writeFileSync(pth.join(dir, 'out', `${name}_${String(k).padStart(3, '0')}_${CW}_${q}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close(); srv.close();
})();
