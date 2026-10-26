#!/usr/bin/env node
/* Запасная картинка шара (assets/jar-arch/stone-sphere.webp) — снимок самого живого шара (js/sphere.js) в начальном повороте, без курсора.
   Картинка лежит под холстом WebGL: пока грузятся карты, шар уже на месте и выглядит так же, а когда холст готов, они сменяются незаметно; без WebGL и при «меньше движения» остаётся она.
   Запуск: node tools/jar-render/sphere_poster.js  (нужны Playwright, Chromium и Pillow; после правки js/sphere.js или карт sphere-a/sphere-n картинку нужно сделать заново). */
'use strict';
const http = require('http'), fs = require('fs'), pth = require('path'), cp = require('child_process');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.error('Playwright не найден'); process.exit(1); }
const ROOT = pth.join(__dirname, '..', '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp'};
const SIZE = 640, OUT = pth.join(ROOT, 'assets/jar-arch/stone-sphere');
const PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}.ar-pearl{width:${SIZE}px;height:${SIZE}px;position:relative}.ar-gl{width:100%;height:100%;display:block}</style>
<div class="ar-pearl" data-a="assets/jar-arch/sphere-a.webp" data-n="assets/jar-arch/sphere-n.webp"><canvas class="ar-gl"></canvas></div><script src="js/sphere.js"></script>`;
(async () => {
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/poster.html') { r.writeHead(200, {'Content-Type': MIME['.html']}); return r.end(PAGE); }
    fs.readFile(pth.join(ROOT, decodeURIComponent(u)), (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[pth.extname(u)] || 'application/octet-stream'}); r.end(d); });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await pw.chromium.launch(Object.assign(CHROME ? {executablePath: CHROME} : {}, {args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}));
  const ctx = await b.newContext({viewport: {width: SIZE, height: SIZE}, reducedMotion: 'reduce', deviceScaleFactor: 1});
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${srv.address().port}/poster.html`);
  await p.waitForSelector('.ar-pearl.gl-on', {timeout: 20000});
  await p.waitForTimeout(400);
  await p.screenshot({path: OUT + '.png', omitBackground: true, clip: {x: 0, y: 0, width: SIZE, height: SIZE}});
  await b.close(); srv.close();
  cp.execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(OUT + '.png')}).convert('RGBA'); im.save(${JSON.stringify(OUT + '.webp')},'WEBP',quality=92,alpha_quality=100,method=6); print(im.size)`], {stdio: 'inherit'});
  fs.unlinkSync(OUT + '.png');
  console.log('готово:', OUT + '.webp', Math.round(fs.statSync(OUT + '.webp').size / 1024) + ' КБ');
})().catch(e => { console.error(e); process.exit(1); });
