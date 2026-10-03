// помогает ли img.decode(): время отрисовки <img> в 2D-canvas (с принудительной растеризацией) до и после decode()
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), pth = require('path');
const ROOT = pth.resolve(__dirname, '..', '..');
(async () => {
  const srv = http.createServer((q, r) => { const f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': f.endsWith('.html') ? 'text/html' : 'image/webp'}); r.end(d); } }); });
  await new Promise(r => srv.listen(8143, '127.0.0.1', r));
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']});
  const p = await b.newPage(); await p.goto('http://127.0.0.1:8143/tools/jar-bench/arena.html');
  for (const dir of ['/assets/jar/d/', '/assets/jar/d-lite/']) {
    const r = await p.evaluate(async (dir) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720; document.body.appendChild(c); const g = c.getContext('2d');
      const load = i => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = dir + String(i).padStart(3, '0') + '.webp?z=' + Math.random(); });
      const draw = im => { const t0 = performance.now(); g.drawImage(im, 0, 0, 1280, 720); g.getImageData(0, 0, 1, 1); return performance.now() - t0; };
      const plain = [], hinted = [], hintCost = [];
      for (let i = 10; i < 30; i++) { const im = await load(i); plain.push(draw(im)); }
      for (let i = 40; i < 60; i++) { const im = await load(i); const t0 = performance.now(); await im.decode(); hintCost.push(performance.now() - t0); hinted.push(draw(im)); }
      const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
      return {plain: med(plain), hinted: med(hinted), hintCost: med(hintCost)};
    }, dir);
    console.log(dir.padEnd(20), 'drawImage без decode():', r.plain.toFixed(1), 'мс | после await decode():', r.hinted.toFixed(1), 'мс | сам decode():', r.hintCost.toFixed(1), 'мс');
  }
  await b.close(); srv.close();
})();
