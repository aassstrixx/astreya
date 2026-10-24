#!/usr/bin/env node
/* Генератор слоя «растение»: оливковые ветки в белой вазе слева и небольшая ветка в нише справа → src/partials/showroom/plant.svg.
   Один раз сгенерированный SVG можно править руками (или перегенерировать: node tools/showroom-assets/gen-plant.js). Холст 1536×1024, как вся сцена. */
const fs = require('fs'), path = require('path');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pt = (P, t) => { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; };
const leaf = (L, W) => `M0 0C${(W * .95).toFixed(1)} ${(-L * .2).toFixed(1)} ${(W * .9).toFixed(1)} ${(-L * .72).toFixed(1)} 0 ${-L}C${(-W * .9).toFixed(1)} ${(-L * .72).toFixed(1)} ${(-W * .95).toFixed(1)} ${(-L * .2).toFixed(1)} 0 0Z`;
function branch(P, n, size, shadow) {
  let out = '', sh = '';
  const stem = `M${P[0]}C${P[1]} ${P[2]} ${P[3]}`;
  out += `<path d="${stem}" fill="none" stroke="#6e6a45" stroke-width="${(2.6 * size).toFixed(1)}" stroke-linecap="round"/>`;
  sh += `<path d="${stem}" fill="none" stroke="#6b4a25" stroke-width="${(2.6 * size).toFixed(1)}" stroke-linecap="round"/>`;
  for (let i = 1; i <= n; i++) {
    const t = .1 + .9 * i / n, [x, y] = pt(P, t), [x2, y2] = pt(P, Math.min(1, t + .03)), ang = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI + 90;
    for (const side of [-1, 1]) {
      if (side === 1 && i % 5 === 0) continue;
      const k = (1 - t * .45) * size, L = (30 + rnd() * 16) * k, W = (7.5 + rnd() * 3) * k, rot = ang + side * (48 + rnd() * 24), under = rnd() < .28;
      const tr = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`;
      out += `<g transform="${tr}"><path d="${leaf(L, W)}" fill="url(#${under ? 'plU' : 'plA'})"/><path d="M0 -2Q${(side * 1.4).toFixed(1)} ${(-L * .5).toFixed(1)} 0 ${(-L * .94).toFixed(1)}" fill="none" stroke="#f3f0d4" stroke-opacity="${under ? .55 : .3}" stroke-width="${(.9 * size).toFixed(1)}"/></g>`;
      sh += `<g transform="${tr}"><path d="${leaf(L, W)}"/></g>`;
    }
  }
  const [ex, ey] = pt(P, 1), [ex0, ey0] = pt(P, .97), a = Math.atan2(ey - ey0, ex - ex0) * 180 / Math.PI + 90;
  out += `<g transform="translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${a.toFixed(1)})"><path d="${leaf(26 * size, 7 * size)}" fill="url(#plA)"/></g>`;
  return {out, sh};
}
const B = [
  branch([[368, 492], [352, 410], [410, 318], [498, 252]], 15, 1.05),
  branch([[372, 492], [404, 436], [492, 408], [596, 368]], 14, .98),
  branch([[364, 492], [326, 424], [318, 340], [350, 268]], 13, 1.0),
  branch([[370, 492], [372, 420], [392, 350], [436, 300]], 11, .9)
];
const R = branch([[1486, 618], [1470, 570], [1486, 520], [1506, 478]], 10, .62);
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Слой «растение»: оливковые ветки в вазе слева (на низкой ступени) и ветка в нише справа. Сгенерирован tools/showroom-assets/gen-plant.js; правится вручную. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024" preserveAspectRatio="none">
<defs>
  <linearGradient id="plA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9ad7c"/><stop offset=".55" stop-color="#7e8758"/><stop offset="1" stop-color="#5f6b42"/></linearGradient>
  <linearGradient id="plU" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c6c8a8"/><stop offset="1" stop-color="#97a07a"/></linearGradient>
  <linearGradient id="plVase" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cdbd9f"/><stop offset=".35" stop-color="#fffaf0"/><stop offset=".7" stop-color="#eee2cc"/><stop offset="1" stop-color="#bba788"/></linearGradient>
  <filter id="plBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="plDof" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.8"/></filter>
</defs>
<!-- тень от веток на стене -->
<g fill="#6b4a25" fill-opacity=".2" filter="url(#plBlur)" transform="translate(26 14)">${B.map(b => b.sh).join('')}</g>
<!-- ваза -->
<ellipse cx="368" cy="588" rx="48" ry="9" fill="#5b3f1f" fill-opacity=".3" filter="url(#plBlur)"/>
<path d="M350 478C348 474 352 468 368 468C384 468 388 474 386 478C410 496 414 548 396 580C390 590 346 590 340 580C322 548 326 496 350 478Z" fill="url(#plVase)"/>
<path d="M356 488C334 506 332 548 346 576" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="368" cy="471" rx="17" ry="4" fill="#9a8a6c" fill-opacity=".55"/>
<g>${B.map(b => b.out).join('')}</g>
<!-- ветка в нише (мягкий фокус) -->
<g filter="url(#plDof)" opacity=".9">${R.out}</g>
</svg>
`;
fs.writeFileSync(path.join(__dirname, '..', '..', 'src', 'partials', 'showroom', 'plant.svg'), svg); console.log('plant.svg', svg.length);
