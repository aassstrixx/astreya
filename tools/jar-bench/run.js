/* Турнир: node run.js [--only v36,v40] [--device desk|mob] [--throttle 1,4] [--scen wheel,fling] [--out results.json]
   Для каждого участника × устройства × замедления CPU гоняет сценарии скролла и собирает метрики (arena.html). */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), pth = require('path');
const { V, P278 } = require('./variants.js');
const ROOT = pth.resolve(__dirname, '..', '..');
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp'};
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const only = (arg('only', '') || '').split(',').filter(Boolean), devices = (arg('device', 'desk,mob')).split(','), throttles = arg('throttle', '1,4').split(',').map(Number);
const FLUSH = process.argv.includes('--flush');
const scens = arg('scen', 'wheel,fling,slow,mid,stopgo,jump').split(','), outFile = arg('out', pth.join(__dirname, 'results.json')), extra = arg('extra', null);
const DEV = {
  desk: {kind: 'd', viewport: {width: 1280, height: 720}, dpr: 1, dir: '/assets/jar/d/', flowDir: '/assets/jar/fd/', nom: [1920, 1080], total: 5.8 * 720, startP: 0.04, scale: 1},
  mob: {kind: 'm', viewport: {width: 390, height: 844}, dpr: 2, dir: '/assets/jar/m/', flowDir: '/assets/jar/fm/', nom: [810, 1440], total: 4.6 * 844, startP: 0.04, scale: 2}
};
let variants = Object.assign({}, V);
if (extra) variants = Object.assign(variants, require(pth.resolve(extra)));

(async () => {
  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': MIME[pth.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=3600'}); r.end(d); } }); });
  await new Promise(r => srv.listen(8140, '127.0.0.1', r));
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']});
  const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  for (const dn of devices) for (const th of throttles) for (const name of Object.keys(variants)) {
    if (only.length && !only.includes(name)) continue;
    const v = variants[name], d = DEV[dn];
    if (v.devices && !v.devices.includes(dn)) continue;
    const ctx = await b.newContext({viewport: d.viewport, deviceScaleFactor: 1});
    const p = await ctx.newPage(); p.setDefaultTimeout(240000);
    await p.goto('http://127.0.0.1:8140/tools/jar-bench/arena.html');
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', {rate: th});
    const W = d.viewport.width * d.dpr, H = d.viewport.height * d.dpr;
    const P = v.P || P278; const N = P.length;
    if (v.lod) { v.lod = true; }
    const cfg = Object.assign({}, v, {W, H, N, P, dir: (v.dirOf ? v.dirOf(dn) : d.dir), flowDir: d.flowDir, nom: d.nom, range: 96});
    delete cfg.label; delete cfg.dirOf; delete cfg.devices; if (v.mkLod) { Object.assign(cfg, v.mkLod(dn, d, P278)); } delete cfg.mkLod; if (FLUSH) cfg.flush = true;
    for (const sc of scens) {
      const t0 = Date.now(); let r;
      try { r = await p.evaluate(([c, s, o]) => window.__run(c, s, o), [cfg, sc, {kind: d.kind, total: d.total, startP: d.startP}]); }
      catch (e) { r = {error: String(e.message || e).slice(0, 200)}; }
      results.push({variant: name, label: v.label, device: dn, throttle: th, scenario: sc, ...r});
      console.log(`${name.padEnd(8)} ${dn} x${th} ${sc.padEnd(7)} ${r.error ? 'ERR ' + r.error : `fps ${r.fps.toFixed(1)} over33 ${r.over33.toFixed(1)}% js ${r.jsMean.toFixed(1)}/${r.jsP95.toFixed(1)}ms stale ${r.stale.toFixed(1)}% jud ${r.judRms.toFixed(1)}px err ${r.errMean.toFixed(1)}px lag ${r.lagMs === null ? '-' : r.lagMs.toFixed(0)}ms settle ${r.settleMs === null ? '-' : r.settleMs.toFixed(0)}ms | js>8ms ${r.jsOver8.toFixed(1)}% dec ${r.counters.decodes||0} up ${r.counters.uploads||0}/${(r.counters.uploadMs||0).toFixed(0)}ms lite ${(r.liteShare||0).toFixed(0)}% sw ${r.counters.switches||0}`}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      fs.writeFileSync(outFile, JSON.stringify(results));
    }
    await ctx.close();
  }
  await b.close(); srv.close();
})();
