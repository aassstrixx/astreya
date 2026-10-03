/* Проверка плавности на настоящей странице (а не в арене): сайт поднимается из папки --root, страница открывается как у посетителя,
   прокрутка крутится по сценариям арены (колесо, бросок, медленно, средне, вперёд-стоп-назад, прыжки) прямо внутри requestAnimationFrame.
   Меряется то, что видно с любой версии движка: интервалы кадров страницы (fps, доля кадров дольше 33 мс, самые долгие), длинные задачи
   основного потока, время остановки после конца прокрутки. Для текущего движка (js/jar.js) — ещё и «видимая» ошибка положения/рывки по
   тому, какие кадры он реально нарисовал (state().drawn).

     node real.js --root <папка_сайта> --label v41 [--device desk,mob] [--throttle 1,4] [--scen wheel,fling,slow,mid,stopgo,jump] [--out real.json]

   Версии для сравнения можно развернуть из git: git worktree add /tmp/wt36 d6c48ee (v36), 9364b8d (v40).
   Песочница без видеокарты: растеризация идёт на процессоре, поэтому абсолютные fps ниже, чем у людей; сравнивать нужно версии между собой. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), pth = require('path');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = pth.resolve(arg('root', pth.resolve(__dirname, '..', '..'))), LABEL = arg('label', 'site');
const devices = arg('device', 'desk,mob').split(','), throttles = arg('throttle', '1,4').split(',').map(Number);
const scens = arg('scen', 'wheel,fling,slow,mid,stopgo,jump').split(','), outFile = arg('out', pth.join(__dirname, 'real.json')), PORT = +arg('port', 8150);
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain'};
const DEV = {desk: {kind: 'd', viewport: {width: 1280, height: 720}, dpr: 1, hasTouch: false}, mob: {kind: 'm', viewport: {width: 390, height: 844}, dpr: 2, hasTouch: true}};
const pct = (a, q) => { if (!a.length) return 0; const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/* сценарии — те же, что в arena.html */
const SCEN_SRC = `({
  wheel: {dur: 3.4, y: (t, y0) => { let y = y0; for (let i = 0; i < 16; i++) { const x = (t - 0.2 - i * 0.12) / 0.16; y += 114 * (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3)); } return y; }},
  fling: {dur: 3.2, y: (t, y0) => y0 + 3500 * 0.6 * (1 - Math.exp(-Math.max(0, t - 0.2) / 0.6))},
  slow: {dur: 3.6, y: (t, y0) => y0 + 160 * Math.max(0, t - 0.2)},
  mid: {dur: 2.6, y: (t, y0) => y0 + 1100 * Math.max(0, t - 0.2)},
  stopgo: {dur: 3.4, y: (t, y0) => { const s = Math.max(0, t - 0.2); let y = y0; y += 1100 * Math.min(s, 0.5); if (s > 0.95) y -= 1100 * Math.min(s - 0.95, 0.5); if (s > 1.85) y += 700 * Math.min(s - 1.85, 0.6); return y; }},
  jump: {dur: 3.4, y: (t, y0, L) => (t < 0.5 ? y0 : t < 1.4 ? y0 + 0.30 * L : t < 2.3 ? y0 + 0.55 * L : y0 + 0.10 * L)}
})`;

(async () => {
  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': MIME[pth.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=3600'}); r.end(d); } }); });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']});
  const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  for (const dn of devices) for (const th of throttles) {
    const d = DEV[dn];
    const ctx = await b.newContext({viewport: d.viewport, deviceScaleFactor: d.dpr, hasTouch: d.hasTouch});
    await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
    const p = await ctx.newPage(); p.setDefaultTimeout(240000);
    await p.goto('http://127.0.0.1:' + PORT + '/index.html'); await p.waitForTimeout(500);
    const sp = await p.$('#sp-in'); if (sp) { try { await sp.click({timeout: 1500}); } catch (e) {} } await p.waitForTimeout(2800);
    // ждём, пока кадры загрузятся (у старых версий — loaded >= N, у текущей — complete)
    for (let k = 0; k < 160; k++) { const st = await p.evaluate(() => { const c = window.Astreya && window.Astreya.jar && window.Astreya.jar.ctrl; if (!c) return null; const s = c.state(); return s.complete !== undefined ? s.complete : s.loaded >= s.N; }); if (st) break; await p.waitForTimeout(500); }
    const geo = await p.evaluate(() => { const r = document.getElementById('jar-story'); return {top: Math.round(r.getBoundingClientRect().top + scrollY), L: r.offsetHeight - r.querySelector('.js-stage').clientHeight}; });
    const mo = JSON.parse(fs.readFileSync(pth.join(__dirname, 'data', 'motion_' + d.kind + '.json'), 'utf8'));
    const pxP = q => mo.speed[Math.max(0, Math.min(mo.n, Math.round(q * mo.n)))] || 0;
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', {rate: th});
    const tierP = await p.evaluate(() => { const c = window.Astreya.jar.ctrl; return c.tierP ? c.tierP() : null; });
    for (const sc of scens) {
      const t0 = Date.now();
      const raw = await p.evaluate(async ([src, name, geo]) => {
        const S = eval(src)[name], y0 = 0.04 * geo.L, wait = ms => new Promise(x => setTimeout(x, ms)), c = window.Astreya.jar.ctrl;
        window.scrollTo({top: geo.top + y0, behavior: 'instant'}); await wait(2200);                // исходное положение, плейхед успокоился
        const long = []; let po = null; try { po = new PerformanceObserver(l => l.getEntries().forEach(e => long.push(e.duration))); po.observe({entryTypes: ['longtask']}); } catch (e) {}
        const rec = {t: [], dt: [], p: [], pT: [], dr: [], used: []}; let prev = null, T0 = null;
        await new Promise(res => {
          const f = ts => {
            if (T0 === null) T0 = ts;
            const s = c.state(); rec.p.push(s.p !== undefined ? s.p : s.cur / Math.max(1, s.N - 1)); rec.pT.push(s.pTarget !== undefined ? s.pTarget : s.target / Math.max(1, s.N - 1)); rec.dr.push(s.drawn || null); rec.used.push(s.used === undefined ? -1 : s.used);   // состояние после отрисовки прошлого кадра
            rec.dt.push(prev === null ? 16.7 : ts - prev); prev = ts; const t = (ts - T0) / 1000; rec.t.push(t);
            window.scrollTo({top: geo.top + S.y(t, y0, geo.L), behavior: 'instant'});
            if (t < S.dur + 1.6) requestAnimationFrame(f); else res();
          };
          requestAnimationFrame(f);
        });
        if (po) po.disconnect();
        const st = c.state();
        return {rec, long, perf: st.perf || null, gov: st.gov === undefined ? null : st.gov};
      }, [SCEN_SRC, sc, geo]);
      const r = raw.rec, n = r.t.length, dts = r.dt.slice(5);
      const mov = [], err = [], jud = [], vis = [], eff = new Array(n).fill(null);
      if (tierP) for (let i = 0; i < n; i++) { const d0 = r.dr[i]; if (!d0) continue; const P = tierP[d0.ti]; eff[i] = (1 - d0.a) * P[d0.ia] + d0.a * P[d0.ib]; }
      for (let i = 1; i < n; i++) {
        const dcp = r.p[i] - r.p[i - 1], k = pxP(r.p[i]);
        if (Math.abs(dcp) * k < 0.2 && Math.abs(r.pT[i] - r.p[i]) * k < 0.5) continue;
        mov.push(i);
        if (eff[i] === null || eff[i - 1] === null) continue;
        const d0 = r.dr[i], P = tierP[d0.ti], eOff = Math.abs(eff[i] - r.p[i]) * k;
        const ghost = (d0.a > 0.02 && d0.a < 0.98) ? Math.min(d0.a, 1 - d0.a) * 2 * Math.abs(P[d0.ib] - P[d0.ia]) * k : 0;
        err.push(eOff); vis.push(eOff + 0.5 * ghost); jud.push(Math.abs((eff[i] - eff[i - 1]) - dcp) * k);
      }
      let lastMove = 0; for (let i = 1; i < n; i++) if (Math.abs(r.pT[i] - r.pT[i - 1]) * pxP(r.pT[i]) > 0.3) lastMove = i;
      let settle = null; for (let i = lastMove; i < n; i++) if (Math.abs(r.pT[i] - r.p[i]) * pxP(r.pT[i]) < 0.5) { settle = (r.t[i] - r.t[lastMove]) * 1000; break; }
      const sc_ = {version: LABEL, device: dn, throttle: th, scenario: sc, frames: n, fps: 1000 / mean(dts), dtP95: pct(dts, 0.95), dtP99: pct(dts, 0.99), dtMax: Math.max(...dts),
        over33: dts.filter(x => x > 33.4).length / dts.length * 100, over50: dts.filter(x => x > 50).length / dts.length * 100,
        longTasks: raw.long.length, longTotal: raw.long.reduce((s, v) => s + v, 0), longMax: raw.long.length ? Math.max(...raw.long) : 0,
        settleMs: settle, visMean: vis.length ? mean(vis) : null, errMean: err.length ? mean(err) : null, judRms: jud.length ? Math.sqrt(mean(jud.map(x => x * x))) : null,
        liteShare: r.used.some(u => u >= 0) ? r.used.filter(u => u > 0).length / n * 100 : null, tickMean: raw.perf ? raw.perf.mean : null, tickP95: raw.perf ? raw.perf.p95 : null, tickMax: raw.perf ? raw.perf.max : null, gov: raw.gov};
      results.push(sc_);
      const f = (v, d = 1) => (v === null || v === undefined ? '-' : v.toFixed(d));
      console.log(`${LABEL.padEnd(5)} ${dn} x${th} ${sc.padEnd(7)} fps ${f(sc_.fps)} over33 ${f(sc_.over33)}% over50 ${f(sc_.over50)}% p99 ${f(sc_.dtP99, 0)}ms max ${f(sc_.dtMax, 0)}ms | long ${sc_.longTasks} (${f(sc_.longTotal, 0)}ms, max ${f(sc_.longMax, 0)}) | settle ${f(sc_.settleMs, 0)}ms | vis ${f(sc_.visMean)} jud ${f(sc_.judRms)} lite ${f(sc_.liteShare, 0)}% tick ${f(sc_.tickMean)}/${f(sc_.tickP95)}/${f(sc_.tickMax)}ms gov ${sc_.gov === null ? '-' : sc_.gov}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      fs.writeFileSync(outFile, JSON.stringify(results));
    }
    await ctx.close();
  }
  await b.close(); srv.close();
})();
