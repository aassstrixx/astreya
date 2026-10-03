/* Первое открытие сайта (холодный кэш, медленная сеть): посетитель открывает страницу, ждёт заставку и сразу листает вступление.
   Меряется то, что видит человек: ошибка показанного положения кадра относительно прокрутки (кадров ещё нет — берётся «ближайший» — картинка шагает),
   интервалы кадров, сколько кадров каждого набора уже загружено.
     node cold.js --root <папка_сайта> --label v42 [--device desk|mob] [--net wifi|4g|slow4g] [--speed 600] [--dur 9] [--delay 0.3] [--out cold.json]
   Сеть: wifi 40 мс / 5 МБ/с, 4g 100 мс / 1,5 МБ/с, slow4g 300 мс / 0,25 МБ/с (задержка — на запрос). Телефон — процессор ×4. HTTP/2, как на GitHub Pages (h2-server.js). */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), pth = require('path');
const { start } = require('./h2-server.js');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = pth.resolve(arg('root', pth.resolve(__dirname, '..', '..'))), dn = arg('device', 'desk'), NETS = arg('net', 'wifi,4g,slow4g').split(',');
const VARS = process.argv.includes('--variants') ? JSON.parse(fs.readFileSync(arg('variants'), 'utf8')) : {[arg('label', 'site')]: {}};
const SPEED = +arg('speed', 600), DUR = +arg('dur', 9), DELAY = +arg('delay', 0.3), OUT = arg('out', pth.join(__dirname, 'cold.json')), PORT = +arg('port', 8180);
const NET = {wifi: {latency: 40, down: 5e6}, '4g': {latency: 100, down: 1.5e6}, slow4g: {latency: 300, down: 0.25e6}};
const DEV = {desk: {kind: 'd', viewport: {width: 1280, height: 720}, dpr: 1, touch: false, cpu: 1}, mob: {kind: 'm', viewport: {width: 390, height: 844}, dpr: 2, touch: true, cpu: 4}};
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a, q) => { if (!a.length) return 0; const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
(async () => {
  const d = DEV[dn];
  const mo = JSON.parse(fs.readFileSync(pth.join(__dirname, 'data', 'motion_' + d.kind + '.json'), 'utf8')), pxP = q => mo.speed[Math.max(0, Math.min(mo.n, Math.round(q * mo.n)))] || 0;
  const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  for (const [LABEL, patch] of Object.entries(VARS)) for (const net of NETS) {
    const srv = await start(ROOT, PORT, Object.keys(patch).length ? patch : null);
    const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...srv.args]});
    const ctx = await b.newContext({viewport: d.viewport, deviceScaleFactor: d.dpr, hasTouch: d.touch});
    await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
    const p = await ctx.newPage(); p.setDefaultTimeout(300000);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: NET[net].latency, downloadThroughput: NET[net].down, uploadThroughput: NET[net].down});
    if (d.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: d.cpu});
    const t0 = Date.now();
    await p.goto(srv.url + '/index.html', {waitUntil: 'commit'});
    await p.waitForFunction(() => document.documentElement.classList.contains('ready') && window.Astreya && window.Astreya.jar && window.Astreya.jar.ctrl && window.Astreya.jar.ctrl.state().firstDrawn, null, {timeout: 300000, polling: 100});
    const tReady = Date.now() - t0;
    const tLoad = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return {dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd)}; });
    await p.waitForTimeout(DELAY * 1000);
    const geo = await p.evaluate(() => { const r = document.getElementById('jar-story'); return {top: Math.round(r.getBoundingClientRect().top + scrollY), L: r.offsetHeight - r.querySelector('.js-stage').clientHeight}; });
    const tierP = await p.evaluate(() => window.Astreya.jar.ctrl.tierP());
    const raw = await p.evaluate(async ([geo, speed, dur]) => {
      const c = window.Astreya.jar.ctrl, rec = {t: [], dt: [], p: [], pT: [], dr: [], tiers: []}; let prev = null, T0 = null;
      await new Promise(res => { const f = ts => { if (T0 === null) T0 = ts; const t = (ts - T0) / 1000; const s = c.state(); rec.p.push(s.p); rec.pT.push(s.pTarget); rec.dr.push(s.drawn); rec.tiers.push(s.tiers); rec.dt.push(prev === null ? 16.7 : ts - prev); prev = ts; rec.t.push(t); window.scrollTo({top: geo.top + Math.min(geo.L, speed * t), behavior: 'instant'}); if (t < dur) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      return rec;
    }, [geo, SPEED, DUR]);
    const n = raw.t.length, err = [], gh = [], dts = raw.dt.slice(5);
    for (let i = 1; i < n; i++) { const dr = raw.dr[i]; if (!dr) continue; const P = tierP[dr.ti], eff = (1 - dr.a) * P[dr.ia] + dr.a * P[dr.ib]; err.push(Math.abs(eff - raw.p[i]) * pxP(raw.p[i])); gh.push(dr.a > 0.02 && dr.a < 0.98 ? Math.min(dr.a, 1 - dr.a) * 2 * Math.abs(P[dr.ib] - P[dr.ia]) * pxP(raw.p[i]) : 0); }
    const at = s => { const i = raw.t.findIndex(t => t >= s); return raw.tiers[i < 0 ? n - 1 : i]; };
    const r = {version: LABEL, device: dn, net, tReadyMs: tReady, tLoad, frames: n, fps: 1000 / mean(dts), over33: dts.filter(x => x > 33.4).length / dts.length * 100, dtMax: Math.max(...dts), errMean: mean(err), errP95: pct(err, 0.95), stale20: err.filter(e => e > 20).length / err.length * 100, stale60: err.filter(e => e > 60).length / err.length * 100, ghostMean: mean(gh), ghost30: gh.filter(g => g > 30).length / gh.length * 100, loaded0: at(0), loaded3: at(3), loaded6: at(6), loadedEnd: at(DUR), tierN: await p.evaluate(() => window.Astreya.jar.ctrl.state().tierN)};
    results.push(r);
    const sh = a => a.map((v, i) => Math.round(v / r.tierN[i] * 100) + '%').join('/');
    console.log(`${LABEL.padEnd(6)} ${dn} ${net.padEnd(7)} ready ${(tReady / 1000).toFixed(1)}s (DCL ${tLoad.dcl} мс, load ${tLoad.load} мс) | fps ${r.fps.toFixed(1)} over33 ${r.over33.toFixed(0)}% | ошибка ${r.errMean.toFixed(1)} px (>20: ${r.stale20.toFixed(0)}%, >60: ${r.stale60.toFixed(0)}%), двоение ${r.ghostMean.toFixed(1)} px (>30: ${r.ghost30.toFixed(0)}%) | загружено старт ${sh(r.loaded0)} +3с ${sh(r.loaded3)} +6с ${sh(r.loaded6)} конец ${sh(r.loadedEnd)}`);
    fs.writeFileSync(OUT, JSON.stringify(results));
    await ctx.close(); await b.close(); srv.close();
  }
})();
