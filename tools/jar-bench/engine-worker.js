/* Воркер для арены: тот же движок (engine.js), но весь — внутри Worker на OffscreenCanvas: декодирование, загрузка текстур и шейдер не трогают основной поток. */
importScripts('engine.js');
let eng = null, running = false, latestY = 0, total = 1, rec = null, T0 = 0, n = 0;
function loop() {
  if (!running) return;
  const now = performance.now();
  const a = performance.now(); const info = eng.frame(now, latestY, total); const js = performance.now() - a;
  rec.t.push((now - T0) / 1000); rec.js.push(js); rec.cp.push(info.cp); rec.pT.push(info.pT); rec.eff.push(info.eff); rec.stale.push(info.stale ? 1 : 0); rec.flow.push(info.flow ? 1 : 0); rec.a.push(info.a); rec.vp.push(info.vp); rec.ia.push(info.ia); rec.ib.push(info.ib);
  rec.dt.push(rec.t.length > 1 ? (rec.t[rec.t.length - 1] - rec.t[rec.t.length - 2]) * 1000 : 16.7);
  n++; setTimeout(loop, Math.max(0, T0 + n * 1000 / 60 - performance.now()));
}
onmessage = async e => {
  const m = e.data;
  if (m.type === 'init') {
    eng = ArenaEngine(Object.assign({}, m.cfg, {canvas: m.canvas}));
    await eng.preload(); eng.reset(m.startP); latestY = m.y0; total = m.total;
    running = true; rec = {t: [], dt: [], js: [], cp: [], pT: [], eff: [], stale: [], flow: [], a: [], vp: [], ia: [], ib: []}; T0 = performance.now(); n = 0; loop();
    postMessage({type: 'ready'});
  } else if (m.type === 'y') { latestY = m.y; total = m.total; }
  else if (m.type === 'mark') { rec = {t: [], dt: [], js: [], cp: [], pT: [], eff: [], stale: [], flow: [], a: [], vp: [], ia: [], ib: []}; T0 = performance.now(); n = 0; Object.keys(eng.counters).forEach(k => { eng.counters[k] = 0; }); }
  else if (m.type === 'stop') { running = false; postMessage({type: 'result', rec, counters: Object.assign({}, eng.counters)}); eng.destroy(); }
};
