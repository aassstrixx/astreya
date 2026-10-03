/* Арена №2: как превратить щелчки колеса мыши (100 px без сглаживания, как у пользователей без «плавной прокрутки» в браузере) в ровное движение.
   Чисто численная модель кадров 60 Гц: сглаживание колеса (js/motion.js: экспонента с постоянной τ) → пружина плейхеда (js/jar.js: критическое затухание, жёсткость ω).
   Метрики: шероховатость шага (отклонение шага кадра от скользящего среднего, % от среднего шага), задержка (на сколько мс центр движения позже входа),
   остановка (мс от последнего щелчка до установки в пределах 1 % последнего шага), «рывки» (доля кадров, где шаг больше 2× среднего). */
const DT = 1 / 60;
const SCEN = {
  'часто (щелчок/35 мс)': Array.from({length: 24}, (_, i) => 0.1 + i * 0.035),
  'обычно (щелчок/70 мс)': Array.from({length: 16}, (_, i) => 0.1 + i * 0.07),
  'редко (щелчок/140 мс)': Array.from({length: 10}, (_, i) => 0.1 + i * 0.14),
  'неровно (случайно 20–160 мс)': (() => { let t = 0.1, a = []; const r = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); for (let i = 0; i < 16; i++) { a.push(t); t += 0.02 + r() * 0.14; } return a; })()
};
function stage1(pg, notches) {            // качество самого движения страницы (до пружины плейхеда)
  const n = pg.length, step = pg.map((v, i) => (i ? v - pg[i - 1] : 0)); let a = step.findIndex(v => v > 0.5), b = step.length - 1; while (b > 0 && step[b] < 0.5) b--;
  const seg = step.slice(a, b + 1), w = 4, lo = Math.round(seg.length * 0.2), hi = Math.round(seg.length * 0.7); let dev = 0, cnt = 0;
  for (let i = Math.max(w, lo); i < Math.min(seg.length - w, hi); i++) { let m = 0; for (let k = -w; k <= w; k++) m += seg[i + k]; m /= 2 * w + 1; dev += Math.abs(seg[i] - m); cnt++; }
  const mm = seg.slice(lo, hi).reduce((s, v) => s + v, 0) / Math.max(1, hi - lo);
  return dev / cnt / mm * 100;
}
function run(notches, cfg) {
  const T = notches[notches.length - 1] + 2.5, n = Math.round(T / DT);
  let target = 0, sCur = 0, sv = 0, cp = 0, vp = 0, ni = 0; const pg = [];
  const out = [], inp = [];
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    while (ni < notches.length && notches[ni] <= t + 1e-9) { target += 100; ni++; }
    // вход: «сырой» (без сглаживания) или экспонента
    let y;
    if (cfg.tau) { sCur += (target - sCur) * (1 - Math.exp(-DT / cfg.tau)); if (Math.abs(target - sCur) < 0.5) sCur = target; y = sCur; }
    else if (cfg.wom) { const e = Math.exp(-cfg.wom * DT), d = sCur - target, c = sv + cfg.wom * d; sCur = target + (d + c * DT) * e; sv = (sv - cfg.wom * c * DT) * e; if (Math.abs(sCur - target) < 0.3 && Math.abs(sv) < 2) { sCur = target; sv = 0; } y = sCur; }
    else y = target;
    pg.push(y);
    // пружина плейхеда
    if (cfg.omega) { const e = Math.exp(-cfg.omega * DT), d = cp - y, c = vp + cfg.omega * d; cp = y + (d + c * DT) * e; vp = (vp - cfg.omega * c * DT) * e; } else cp = y;
    out.push(cp); inp.push(target);
  }
  const step = out.map((v, i) => (i ? v - out[i - 1] : 0));
  const total = out[n - 1];
  // активный участок: от первого шага > 0.5 px до последнего
  let a = step.findIndex(v => v > 0.5), b = step.length - 1; while (b > 0 && step[b] < 0.5) b--;
  const seg = step.slice(a, b + 1), w = 4; let dev = 0, cnt = 0, big = 0, mean = seg.reduce((s, v) => s + v, 0) / seg.length;
  // шероховатость считаем в середине серии (без разгона и остановки)
  const lo = Math.round(seg.length * 0.2), hi = Math.round(seg.length * 0.7);
  for (let i = Math.max(w, lo); i < Math.min(seg.length - w, hi); i++) { let m = 0; for (let k = -w; k <= w; k++) m += seg[i + k]; m /= 2 * w + 1; dev += Math.abs(seg[i] - m); big += seg[i] > 2 * m ? 1 : 0; cnt++; }
  const midMean = seg.slice(lo, hi).reduce((s, v) => s + v, 0) / Math.max(1, hi - lo);
  const t50 = arr => { const half = total / 2; for (let i = 0; i < n; i++) if (arr[i] >= half) return i * DT; return null; };
  const lag = (t50(out) - t50(inp)) * 1000;
  let settle = null; const lastN = notches[notches.length - 1]; for (let i = 0; i < n; i++) if (i * DT > lastN && Math.abs(out[i] - total) < 1) { settle = (i * DT - lastN) * 1000; break; }
  const pageR = stage1(pg, notches); return {rough: dev / cnt / midMean * 100, jerky: big / cnt * 100, lag, settle, page: pageR};
}
const CAND = [
  ['сейчас в сцене: сырое колесо + пружина ω20', {omega: 20}],
  ['сырое колесо + пружина ω10', {omega: 10}],
  ['сырое колесо + пружина ω6', {omega: 6}],
  ['сглаживание τ.17 + пружина ω20  (всегда включено)', {tau: 0.17, omega: 20}],
  ['сглаживание τ.17 + пружина ω40', {tau: 0.17, omega: 40}],
  ['сглаживание τ.17, без пружины', {tau: 0.17}],
  ['сглаживание τ.12 + пружина ω28', {tau: 0.12, omega: 28}],
  ['сглаживание τ.12 + пружина ω40', {tau: 0.12, omega: 40}],
  ['сглаживание τ.09 + пружина ω40', {tau: 0.09, omega: 40}],
  ['сглаживание τ.25 + пружина ω28', {tau: 0.25, omega: 28}],
];
if (require.main === module) {
  for (const [sn, notches] of Object.entries(SCEN)) {
    console.log('\n== ' + sn);
    console.log('вариант'.padEnd(54), 'шероховатость%  рывки%  задержка мс  остановка мс');
    for (const [name, cfg] of CAND) { const r = run(notches, cfg); console.log(name.padEnd(54), r.rough.toFixed(1).padStart(10), r.jerky.toFixed(1).padStart(8), r.lag.toFixed(0).padStart(10), (r.settle === null ? '-' : r.settle.toFixed(0)).padStart(12)); }
  }
}
module.exports = {run, SCEN, CAND};
