/* Движок с двумя уровнями качества (LOD) для арены: пока картинка движется быстро — лёгкие кадры (дёшево декодировать), в покое и при медленной прокрутке — полные.
   Только 2D-canvas и <img> напрямую (как версия 36): основной поток почти ничего не делает. Настройки cfg:
     hi {dir, P, files}, lite {dir, P, files}   наборы кадров (у каждого свои положения P)
     fast, slow, hold    пороги скорости в кадрах полного набора в секунду: выше fast — лёгкие; ниже slow дольше hold мс — полные
     motion, blend       как в engine.js (blend для лёгкого уровня: 'linear'|'narrow'; для полного — всегда 'narrow') */
(function () {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => x * x * (3 - 2 * x);
  const pad = i => String(i).padStart(3, '0');
  const narrow = (x, p) => p < 0.6 ? ease(clamp((x - 0.42) / 0.16, 0, 1)) : ease(x);
  (typeof window !== 'undefined' ? window : self).ArenaLod = function (cfg) {
    const W = cfg.W, H = cfg.H, cv = cfg.canvas, ctx = cv.getContext('2d', {alpha: false});
    cv.width = W; cv.height = H;
    const defs = cfg.tiers || [cfg.hi, cfg.lite];
    const T = defs.map(d => ({P: d.P, N: d.P.length, dir: d.dir, files: d.files, im: []}));
    let cp = 0, vp = 0, pT = 0, last = 0, tier = defs.length - 1, calmSince = 0, gov = cfg.govStart || 0, dtEma = 16.7, slowRun = 0, fastRun = 0, govLockUntil = 0, lastGovChange = 0, upgradeLocked = false;
    const C = {switches: 0, liteFrames: 0, hiFrames: 0, draws: 0, sync: 0, govChanges: 0, tierFrames: defs.map(() => 0)};
    const load = src => new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    async function preload() {
      const jobs = [];
      for (const t of T.slice().reverse()) { for (let i = 0; i < t.N; i++) jobs.push(() => load(t.dir + pad(t.files ? t.files[i] : i) + '.webp').then(im => { t.im[i] = im; })); }
      let n = 0; await Promise.all(Array.from({length: 10}, async () => { while (n < jobs.length) { const j = jobs[n++]; await j(); } }));
    }
    function step(dt) {
      const m = cfg.motion;
      if (m.kind === 'lerp') { cp += (pT - cp) * (1 - Math.exp(-dt / m.tau)); vp = 0; return; }
      const e = Math.exp(-m.omega * dt), d = cp - pT, c = vp + m.omega * d; cp = pT + (d + c * dt) * e; vp = (vp - m.omega * c * dt) * e;
    }
    function locate(t, p) {
      const P = t.P, N = t.N;
      if (p <= P[0]) return {k: 0, t: 0}; if (p >= P[N - 1]) return {k: N - 2, t: 1};
      let lo = 0, hi = N - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= p) lo = m; else hi = m; }
      return {k: lo, t: (p - P[lo]) / (P[lo + 1] - P[lo])};
    }
    function draw(im, a) { const k = Math.max(W / im.naturalWidth, H / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k; ctx.globalAlpha = a; ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh); }
    function frame(now, y, total) {
      const dt = last ? clamp((now - last) / 1000, 0.001, 0.1) : 1 / 60; last = now;
      pT = clamp(y / total, 0, 1); step(dt); cp = clamp(cp, 0, 1);
      const fps = Math.abs(vp) * (T[0].N - 1);              // сколько кадров самого тяжёлого набора в секунду проходит плейхед
      const moving = fps > 2;
      // регулятор: если кадры идут дольше бюджета — разрешаем только более лёгкие наборы; если запас большой — возвращаем
      if (cfg.governor) {
        dtEma += (dt * 1000 - dtEma) * 0.15;
        if (moving) { if (dtEma > 21) { slowRun++; fastRun = 0; } else if (dtEma < 17.6) { fastRun++; slowRun = 0; } else { slowRun = 0; } }
        if (slowRun >= 14 && gov < defs.length - 1 && now > govLockUntil) { gov++; C.govChanges++; slowRun = 0; fastRun = 0; govLockUntil = now + 1200; if (now - lastGovChange < 4000) upgradeLocked = true; lastGovChange = now; }
        else if (fastRun >= 240 && gov > (cfg.govStart || 0) && !upgradeLocked && now > govLockUntil + 2800) { gov--; C.govChanges++; fastRun = 0; govLockUntil = now + 1200; lastGovChange = now; }
      }
      // уровень по скорости
      let want = 0;
      if (fps > cfg.fast) want = 1;
      if (cfg.fast2 && fps > cfg.fast2) want = 2;
      want = Math.min(defs.length - 1, want);
      if (want >= tier) { if (want > tier) { tier = want; C.switches++; } calmSince = 0; }
      else { if (fps < cfg.slow) { if (!calmSince) calmSince = now; if (now - calmSince > cfg.hold) { tier = want; C.switches++; calmSince = 0; } } else calmSince = 0; }
      const tierIdx = Math.min(defs.length - 1, Math.max(tier, gov));
      const t = T[tierIdx], {k, t: tt} = locate(t, cp);
      const ia = k, ib = Math.min(t.N - 1, k + 1);
      let a = tierIdx > 0 ? (cfg.blend === 'linear' ? tt : narrow(tt, cp)) : (fps < 0.6 ? (tt < 0.5 ? 0 : 1) : narrow(tt, cp));       // полный набор: в покое — ровно ближайший кадр (без двоения)
      const A = t.im[ia], B = t.im[ib];
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
      if (A) draw(A, 1); if (B && ib !== ia && a > 0.02) draw(B, a); ctx.globalAlpha = 1;
      if (cfg.flush) ctx.getImageData(0, 0, 1, 1);
      C.draws++; C.tierFrames[tierIdx]++;
      return {ia, ib, a, flow: false, stale: false, eff: (1 - a) * t.P[ia] + a * t.P[ib], cp, vp, pT, tier: tierIdx};
    }
    function reset(p0) { cp = pT = p0 || 0; vp = 0; last = 0; tier = defs.length - 1; calmSince = 0; dtEma = 16.7; slowRun = fastRun = 0; }
    return {preload, frame, reset, counters: C, destroy() {}};
  };
})();
