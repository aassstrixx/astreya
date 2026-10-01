/* Знак за «жемчужиной» на главной: мягкая отрисовка вдоль одного пути (перенесено из прежнего index.html без изменений логики).
   Экспортирует Astreya.heroMarkStart(wrap[, {manual, lite}]). */
(function () {
'use strict';
/* Знак за «жемчужиной»: мягкая отрисовка вдоль одного пути. Фронт каждой части (дуга, правая и левая ноги) — линейный градиент-маска,
   шарик летит по центру линии один раз и меняет размер вместе с её толщиной. Координаты — в единицах логотипа. */
const HM = {
  P:[[97.5,667.0],[109.5,659.7],[121.5,652.6],[133.5,646.5],[145.5,640.6],[157.5,635.6],[169.5,630.7],[181.5,626.5],[193.5,622.5],[205.5,618.9],[217.5,615.6],[229.5,612.6],[241.5,609.9],[253.5,607.5],[265.5,605.4],[277.5,603.7],[289.5,602.3],[301.5,601.2],[313.5,600.7],[325.5,600.6],[337.5,601.0],[349.5,602.2],[361.5,604.0],[373.5,607.6],[385.5,614.6],[397.5,622.0],[409.5,629.7],[421.5,637.9],[433.5,646.4],[440,651.1],[446,656],[447.3,658.0],[429.6,639.8],[411.9,621.7],[394.2,603.5],[376.5,585.4],[358.9,567.2],[341.2,549.1],[323.5,530.9],[305.8,512.8],[288.1,494.6],[270.4,476.5],[252.7,458.3],[235.0,440.1],[217.4,422.0],[199.7,403.8],[199.6,403.4],[188.7,426.5],[177.7,449.5],[166.8,472.6],[155.8,495.6],[144.9,518.7],[133.9,541.7],[123.0,564.8],[112.0,587.8],[101.1,610.9],[90.1,633.9],[79.2,657.0],[68.3,680.0],[57.3,703.1],[46.4,726.1]],
  T:[0.0,5.2,9.9,13.5,16.3,18.6,20.6,22.4,24.1,25.7,27.4,29.2,31.2,33.3,35.6,37.9,40.2,42.5,44.7,46.6,48.0,49.0,48.9,45.2,37.1,27.9,19.5,12.2,6.5,2.6,0.6,1.0,4.4,9.4,14.7,20.0,25.3,30.6,35.9,41.2,46.5,51.8,57.1,58.1,50.0,40.4,42.0,54.1,63.1,61.7,56.0,50.2,44.4,38.6,32.9,27.1,21.3,15.5,9.7,4.4,0.0],
  ia:30, it:46, F:6, V:255, ce:421.0,
  O:[447.3, 658.0], A:[199.6, 403.4], u:[-0.6978, -0.7163], v:[-0.429, 0.9033],
  TR:[[79,700],[94.9,667],[146,572],[345.0,572],[443.1,653.7],[470,676.1],[470,700]], RT:[[124.6,48.2],[258.8,740.4],[1436.9,511.8],[1302.6,-180.3]], LF:[[205.4,401.8],[270.6,738.1],[-907.4,966.6],[-1041.7,274.5],[-346.6,139.6]], WG:[[136.4,45.9],[207.3,411.5],[-359.9,142.2]],
  D:"M49.8 718.9L184.6 326.1L443.1 653.7L210.6 460.2ZM97.5 667C99.5 665.3 105.5 659.8 109.5 656.5C113.5 653.3 117.5 650.2 121.5 647.3C125.5 644.5 129.5 641.8 133.5 639.3C137.5 636.8 141.5 634.5 145.5 632.2C149.5 630 153.5 628 157.5 626C161.5 624 165.5 622.1 169.5 620.3C173.5 618.4 177.5 616.7 181.5 615.1C185.5 613.4 189.5 611.9 193.5 610.4C197.5 608.8 201.5 607.4 205.5 606C209.5 604.5 213.5 603.2 217.5 601.8C221.5 600.5 225.5 599.2 229.5 597.9C233.5 596.7 237.5 595.4 241.5 594.3C245.5 593.1 249.5 592 253.5 590.9C257.5 589.7 261.5 588.7 265.5 587.6C269.5 586.6 273.5 585.6 277.5 584.7C281.5 583.7 285.5 582.9 289.5 582.1C293.5 581.3 297.5 580.5 301.5 579.8C305.5 579.2 309.5 578.6 313.5 578.1C317.5 577.6 321.5 577.3 325.5 577C329.5 576.8 333.5 576.7 337.5 576.7C341.5 576.7 345.5 576.9 349.5 577.2C353.5 577.6 358.7 578.4 361.5 578.8C364.3 579.2 364.9 579.6 366.2 579.8C367.5 579.9 368.7 579.7 369.2 579.7L442 652L440 652C438.9 651.5 436.6 650.3 433.5 648.9C430.4 647.5 425.5 645.1 421.5 643.5C417.5 641.8 413.5 640.4 409.5 639C405.5 637.7 401.5 636.5 397.5 635.5C393.5 634.4 389.5 633.6 385.5 632.8C381.5 632 377.5 631.5 373.5 630.8C369.5 630.1 365.5 629.3 361.5 628.6C357.5 627.9 353.5 627.2 349.5 626.6C345.5 626 341.5 625.4 337.5 624.9C333.5 624.5 329.5 624.1 325.5 623.7C321.5 623.4 317.5 623.1 313.5 622.9C309.5 622.7 305.5 622.5 301.5 622.4C297.5 622.3 293.5 622.2 289.5 622.2C285.5 622.2 281.5 622.3 277.5 622.4C273.5 622.6 269.5 622.8 265.5 623C261.5 623.3 257.5 623.6 253.5 624C249.5 624.4 245.5 624.9 241.5 625.4C237.5 625.9 233.5 626.4 229.5 627.1C225.5 627.7 221.5 628.4 217.5 629.1C213.5 629.9 209.5 630.7 205.5 631.6C201.5 632.5 197.5 633.5 193.5 634.5C189.5 635.5 185.5 636.5 181.5 637.6C177.5 638.7 173.5 639.8 169.5 641C165.5 642.3 161.5 643.5 157.5 644.8C153.5 646.1 149.5 647.5 145.5 648.9C141.5 650.3 137.5 651.7 133.5 653.2C129.5 654.7 125.5 656.2 121.5 657.7C117.5 659.2 113.5 660.8 109.5 662.3C105.5 663.9 99.5 666.2 97.5 667Z"
};
/* середина сечения многоугольника линией f(q)=c (для выпуклых фигур — две точки пересечения); блик едет по этой точке, то есть строго по кончику рисуемой палки */
const hmCut = (pl, f, c) => {
  const pts = [];
  for (let i = 0; i < pl.length; i++) { const a = pl[i], b = pl[(i + 1) % pl.length], fa = f(a) - c, fb = f(b) - c; if ((fa <= 0 && fb > 0) || (fa > 0 && fb <= 0)) { const t = fa / (fa - fb); pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
  return pts.length < 2 ? null : [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1])];
};
const HMc = (() => { const a = Math.hypot(184.6 - 443.1, 326.1 - 653.7), b = Math.hypot(49.8 - 184.6, 718.9 - 326.1); return {rx: (184.6 - 443.1) / a, ry: (326.1 - 653.7) / a, lx: (49.8 - 184.6) / b, ly: (718.9 - 326.1) / b}; })();   // оси ног знака (единичные векторы)
const hmArea = pl => { let a = 0; for (let i = 0; i < pl.length; i++) { const p = pl[i], q = pl[(i + 1) % pl.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
const hmPos = pl => hmArea(pl) < 0 ? pl.slice().reverse() : pl;
const hmClip = (pl, f, c) => {                       // оставляет часть многоугольника, где f(точка) <= c
  const out = [];
  for (let i = 0; i < pl.length; i++) {
    const a = pl[i], b = pl[(i + 1) % pl.length], fa = f(a) - c, fb = f(b) - c;
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
};
function heroMarkStart(wrap, opt){
  opt = opt || {};
  const svg = wrap.querySelector('svg.hm'); if (!svg) return;
  const $g = id => svg.querySelector('#' + id), ga = $g('hm-ga'), gr = $g('hm-gr'), gl = $g('hm-gl'), dot = $g('hm-dot'), use = svg.querySelector('use');
  if (!ga || !gr || !gl || !dot) return;
  const {P, T, ia, it, F, V, O, A, u, v, D} = HM, n = P.length, L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const S = L[n - 1], sA = L[ia], sR0 = L[ia + 1], sT = L[it], total = S + F + 12, dur = total / V * 1000;
  const at = s => {                                  // точка пути и толщина линии на длине s
    let i = 1; while (i < n - 1 && L[i] < s) i++;
    const t = Math.max(0, Math.min(1, (s - L[i - 1]) / (L[i] - L[i - 1])));
    return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t, T[i - 1] + (T[i] - T[i - 1]) * t];
  };
  const put = (g, x1, y1, x2, y2) => { g.setAttribute('x1', x1); g.setAttribute('y1', y1); g.setAttribute('x2', x2); g.setAttribute('y2', y2); };
  const ease = k => .5 * k + .25 * (1 - Math.cos(Math.PI * k));
  const r = svg.getBoundingClientRect(), sx = r.width / 396 || 1, sy = r.height / 379 || 1, sk = (sx + sy) / 2;
  /* Телефоны и планшеты: рисуем в небольшом canvas (только видимая часть героя, плотность ≤ 2×) — маска SVG на таком размере и на 3× слишком тяжела */
  let lite = opt.lite !== undefined ? opt.lite : matchMedia('(max-width:900px),(pointer:coarse)').matches;
  let cv = null, cx = null, off = null, tf = null, W = 0, H = 0, dc = 1, TRp = null, RTp = null, LFp = null, WGp = null, done = false, bead = null, bx0 = 0, by0 = 0;
  let clean = false, ARCp = null, RTt = null, LFt = null;      // телефон (≤640 px): три отдельные «палки» — дуга и две ноги знака, у каждой чистый фронт без зубцов
  const prev = {a: -1e9, r: -1e9, l: -1e9};
  if (lite) {
    try {
      const hr = (wrap.closest('.hero') || wrap).getBoundingClientRect(), sw = svg.parentNode, sb = sw.getBoundingClientRect();
      clean = matchMedia('(max-width:640px)').matches;
      /* острие вершины знака (y=326) выходит за рамку SVG (viewBox начинается с y=341) — на телефоне даём canvas запас сверху, иначе вершина срезана плоско */
      const il = Math.max(r.left, hr.left), it2 = Math.max(r.top - (clean ? 20 * sy : 0), hr.top), ir = Math.min(r.right, hr.right), ib = Math.min(r.bottom, hr.bottom);
      if (ir - il < 20 || ib - it2 < 20 || typeof Path2D === 'undefined') throw 0;
      dc = Math.min(window.devicePixelRatio || 1, 2); W = Math.round((ir - il) * dc); H = Math.round((ib - it2) * dc);
      cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cv.style.cssText = 'position:absolute;pointer-events:none;left:' + (il - sb.left) + 'px;top:' + (it2 - sb.top) + 'px;width:' + (ir - il) + 'px;height:' + (ib - it2) + 'px';
      cx = cv.getContext('2d');
      tf = [sx * dc, sy * dc, (r.left - 49 * sx - il) * dc, (r.top - 341 * sy - it2) * dc];
      off = document.createElement('canvas'); off.width = W; off.height = H;
      const oc = off.getContext('2d'), g = oc.createLinearGradient(443, 342, 52, 719);
      oc.setTransform(tf[0], 0, 0, tf[1], tf[2], tf[3]);
      g.addColorStop(0, 'rgba(185,194,208,.46)'); g.addColorStop(.55, 'rgba(142,166,216,.30)'); g.addColorStop(1, 'rgba(47,91,214,.20)');
      oc.fillStyle = g; oc.fill(new Path2D(D));
      TRp = hmPos(HM.TR); RTp = hmPos(HM.RT); LFp = hmPos(HM.LF); WGp = hmPos(HM.WG);
      if (clean) { ARCp = new Path2D(D.slice(D.indexOf('Z') + 1)); /* знак режется по прямой «правая нога — внутренняя вершина — левый внешний край»: правая палка с вершиной — цельный треугольник без угла сбоку, левая — узкий клин (с запасом 1,5 ед. внахлёст, чтобы не было шва) */
        RTt = hmPos([[184.6, 326.1], [443.1, 653.7], [154.6, 413.6]]); LFt = hmPos([[155.6, 412.4], [211.6, 459.0], [49.8, 718.9]]); }
      bead = document.createElement('i');            // светящаяся точка — маленький слой, двигается только через transform
      bead.style.cssText = 'position:absolute;left:0;top:0;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;pointer-events:none;opacity:0;background:radial-gradient(circle closest-side,#fff 0,rgba(228,236,255,.95) 26%,rgba(125,156,240,.42) 55%,rgba(47,91,214,0) 100%)';
      bx0 = r.left - sb.left; by0 = r.top - sb.top;
      sw.insertBefore(cv, svg); sw.appendChild(bead); svg.style.visibility = 'hidden';
    } catch (e) { lite = false; if (cv) cv.remove(); if (bead) bead.remove(); cv = off = bead = null; }
  }
  const settle = () => {                             // финал: неподвижный SVG без маски
    if (done) return; done = true;
    dot.style.opacity = 0; if (use) use.removeAttribute('mask');
    if (bead) { bead.remove(); bead = null; }
    if (cv) { svg.style.visibility = ''; cv.remove(); cv = null; }
    off = null;
  };
  const t0 = performance.now() + 600;
  const frame = now => {
    if (!svg.isConnected || done) return;
    const k = Math.min(1, Math.max(0, (now - t0) / dur)), s = ease(k) * total, sp = Math.min(s, S), p = at(sp);
    const fx = s <= sA ? p[0] : at(sA)[0] + (s - sA);                    // 1-я часть, дуга: вертикальный фронт
    const cb = s - sR0, cM = sT - sR0, cr = cb + (HM.ce - cM) * Math.pow(Math.min(1, Math.max(0, (cb - 200) / (cM - 200))), 2), cl = s - sT;                                     // 2-я: правая нога (фронт вдоль оси), 3-я: левая нога
    const R = Math.max(1.5, .4 * p[2]) * sk;                             // радиус шарика (px) следует толщине линии
    let bp = p, Rr = R;                                                  // положение и радиус блика (на телефоне — по кончику рисуемой палки, см. ниже)
    const bo = k <= 0 ? 0 : Math.min(1, s / 26) * (s <= S ? 1 : Math.max(0, 1 - (s - S) / 12));
    if (lite) {
      const fr = q => (q[0] - O[0]) * u[0] + (q[1] - O[1]) * u[1], fl = q => (q[0] - A[0]) * v[0] + (q[1] - A[1]) * v[1], sl = (pl, f, c, c0) => hmClip(hmClip(pl, f, c), q => -f(q), -(c0 - 2));
      const pl = [];
      if (clean) {
        /* дуга рисуется только по своему контуру (вертикальный фронт), правая нога — от острия вверх к вершине, левая — от вершины вниз; фронты прямые, поперёк оси ноги */
        const gx = q => (q[0] - 443.1) * HMc.rx + (q[1] - 653.7) * HMc.ry, gy = q => (q[0] - 184.6) * HMc.lx + (q[1] - 326.1) * HMc.ly;
        const RLn = 417.3, LLn = 415.3, LQ = 92.5;                                   // длины осей ног; LQ — где левый клин выходит из правой «палки»
        const pR = Math.min(1, Math.max(0, (s - sR0) / (sT - sR0))), pL = Math.min(1, Math.max(0, (s - sT) / (S - sT)));
        const cR = s < sR0 ? -1e9 : s >= sT ? 1e5 : pR * RLn, cL = s < sT ? -1e9 : s >= S + F ? 1e5 : pL * LLn;
        if (s >= sR0) {                                                              // блик — на середине сечения в точке фронта
          let q = null, wq = 0;
          if (s < sT) { q = hmCut(RTt, gx, Math.min(RLn - .01, Math.max(.01, pR * RLn))); }
          else if (pL * LLn < LQ) { const k2 = pL * LLn / LQ; q = [184.6 + (183.6 - 184.6) * k2, 326.1 + (435.7 - 326.1) * k2]; wq = 24 * k2; }
          else q = hmCut(LFt, gy, Math.min(LLn - .01, pL * LLn));
          if (q) { bp = [q[0], q[1], Math.min(58, q.length > 2 ? q[2] : wq)]; Rr = Math.max(1.5, .4 * bp[2]) * sk; }
        }
        if (fx > prev.a) {
          const x0 = prev.a > -1e8 ? prev.a - 2 : -200;
          cx.save(); cx.setTransform(tf[0], 0, 0, tf[1], tf[2], tf[3]); cx.clip(ARCp); cx.beginPath(); cx.rect(x0, -200, fx - x0, 1400); cx.clip();
          cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'copy'; cx.drawImage(off, 0, 0); cx.restore();
        }
        if (cR > prev.r) pl.push(sl(RTt, gx, cR, prev.r));
        if (cL > prev.l) pl.push(sl(LFt, gy, cL, prev.l));
        prev.a = Math.max(prev.a, fx); prev.r = Math.max(prev.r, cR); prev.l = Math.max(prev.l, cL);
      } else {
      if (fx > prev.a) pl.push(sl(TRp, q => q[0], fx, prev.a));
      if (cr > prev.r) { pl.push(sl(RTp, fr, cr, prev.r)); pl.push(sl(WGp, fr, cr, prev.r)); }
      if (cl > prev.l) pl.push(sl(LFp, fl, cl, prev.l));
      prev.a = fx; prev.r = cr; prev.l = cl;
      }
      if (pl.some(q => q.length > 2)) {
        cx.save(); cx.setTransform(tf[0], 0, 0, tf[1], tf[2], tf[3]); cx.beginPath();
        for (const q of pl) if (q.length > 2) { q.forEach((c, i) => i ? cx.lineTo(c[0], c[1]) : cx.moveTo(c[0], c[1])); cx.closePath(); }
        cx.setTransform(1, 0, 0, 1, 0, 0); cx.clip(); cx.globalCompositeOperation = 'copy'; cx.drawImage(off, 0, 0); cx.restore();
      }
      bead.style.transform = 'translate3d(' + (bx0 + (bp[0] - 49) * sx).toFixed(1) + 'px,' + (by0 + (bp[1] - 341) * sy).toFixed(1) + 'px,0) scale(' + (Rr / 32).toFixed(3) + ')';
      bead.style.opacity = bo;
    } else {
      put(ga, fx - F, 0, fx, 0);
      const qx = O[0] + u[0] * cr, qy = O[1] + u[1] * cr; put(gr, qx - u[0] * F, qy - u[1] * F, qx, qy);
      const lx = A[0] + v[0] * cl, ly = A[1] + v[1] * cl; put(gl, lx - v[0] * F, ly - v[1] * F, lx, ly);
      dot.setAttribute('cx', p[0].toFixed(2)); dot.setAttribute('cy', p[1].toFixed(2));
      dot.setAttribute('rx', (R / sx).toFixed(2)); dot.setAttribute('ry', (R / sy).toFixed(2));
      dot.style.opacity = bo;
    }
    if (k < 1) { if (!opt.manual) requestAnimationFrame(frame); }
    else if (!opt.manual) { if (cv) { if (bead) bead.remove(); bead = off = null; done = true; } else settle(); }   // на телефоне готовый canvas остаётся как есть
    else frame.settle = settle;
  };
  frame.t0 = t0; frame.cv = () => cv;
  if (opt.manual) return frame;
  if (cv) {                                                       // при повороте экрана — неподвижный SVG нужного размера (панель браузера на iOS resize не меняет ширину)
    const w0 = innerWidth, on = () => { if (Math.abs(innerWidth - w0) > 2) { removeEventListener('resize', on); done = false; settle(); } };
    addEventListener('resize', on);
  }
  requestAnimationFrame(frame);
}
window.Astreya = window.Astreya || {};
window.Astreya.heroMarkStart = heroMarkStart;
})();
