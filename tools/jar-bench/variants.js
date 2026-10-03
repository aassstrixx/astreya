/* Участники арены. kind: 'd' — компьютер (кадры 1920x1080), 'm' — телефон (810x1440). */
const fs = require('fs'), path = require('path');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'plan.json'), 'utf8'));
const P278 = plan.p, OLD = plan.old.map((o, k) => (o !== null ? k : -1)).filter(k => k >= 0);          // номера кадров плана, которые есть в старой сетке 180
const P180 = OLD.map(k => P278[k]);

const base = {smooth: 'high'};
const V = {
  // 0. прежний движок (версия 36 и ранее): <img> напрямую, 2D, экспоненциальное сглаживание, кадры равномерной сетки 180
  v36: {label: 'v36 — прежний (img, 2D, lerp, 180 кадров)', render: '2d', decode: 'img', motion: {kind: 'lerp', tau: 0.07}, blend: 'narrow', files: OLD, P: P180},
  // 1. то, что я выкатил в v40
  v40: {label: 'v40 — GL + поток, окно ImageBitmap, пружина 10', render: 'gl', decode: 'bmp-window', bmpResize: 'high', motion: {kind: 'spring', omega: 10}, blend: 'flow', cap: 28},
  // 2. простой апгрейд: плотные кадры + пружина, всё как в v36
  img2d: {label: 'img-2D + 278 кадров + пружина 14', render: '2d', decode: 'img', motion: {kind: 'spring', omega: 14}, blend: 'narrow'},
  // 3. 2D + предекод по траектории
  bmp2d: {label: 'bmp-2D JIT + 278 кадров + пружина 14', render: '2d', decode: 'bmp-jit', bmpResize: 'none', motion: {kind: 'spring', omega: 14}, blend: 'narrow', cap: 30},
  // 4. GL + поток + предекод по траектории
  glflow: {label: 'GL + поток, JIT-декод, пружина 14', render: 'gl', decode: 'bmp-jit', bmpResize: 'none', motion: {kind: 'spring', omega: 14}, blend: 'flow', cap: 30},
  // 5. GL + поток, без предекода: текстура из <img> по требованию
  glimg: {label: 'GL + поток, texImage2D(img) по требованию', render: 'gl', decode: 'img', motion: {kind: 'spring', omega: 14}, blend: 'flow', cap: 30},
  // 6. 2D + JIT + полное смешивание кадров (плавнее, но с призраками)
  lin2d: {label: 'bmp-2D JIT + линейное смешивание', render: '2d', decode: 'bmp-jit', bmpResize: 'none', motion: {kind: 'spring', omega: 14}, blend: 'linear', cap: 30}
};
module.exports = {V, P278, P180, OLD};

/* ---- второй раунд: разбор победителя (img-2D) ---- */
const img2d = (label, motion, blend, extra) => Object.assign({label, render: '2d', decode: 'img', motion, blend, smooth: 'high'}, extra || {});
Object.assign(V, {
  s_w8: img2d('img2D пружина ω=8', {kind: 'spring', omega: 8}, 'narrow'),
  s_w14: img2d('img2D пружина ω=14', {kind: 'spring', omega: 14}, 'narrow'),
  s_w20: img2d('img2D пружина ω=20', {kind: 'spring', omega: 20}, 'narrow'),
  s_w28: img2d('img2D пружина ω=28', {kind: 'spring', omega: 28}, 'narrow'),
  l_t04: img2d('img2D lerp τ=0.04', {kind: 'lerp', tau: 0.04}, 'narrow'),
  l_t07: img2d('img2D lerp τ=0.07', {kind: 'lerp', tau: 0.07}, 'narrow'),
  l_t12: img2d('img2D lerp τ=0.12', {kind: 'lerp', tau: 0.12}, 'narrow'),
  b_lin: img2d('img2D ω=14 линейное смешивание', {kind: 'spring', omega: 14}, 'linear'),
  b_near: img2d('img2D ω=14 без смешивания', {kind: 'spring', omega: 14}, 'nearest'),
  s_hint: img2d('img2D ω=14 + img.decode() по траектории', {kind: 'spring', omega: 14}, 'narrow', {hint: true})
});
/* ---- третий раунд: запечённые промежуточные кадры (tools/jar-render/bake_mid.py), только компьютер ---- */
try {
  const bp = JSON.parse(fs.readFileSync(path.join(__dirname, '.cache', 'bake_d', 'p.json'), 'utf8')).p;
  const baked = (label, motion, blend) => ({label, render: '2d', decode: 'img', motion, blend, smooth: 'high', P: bp, devices: ['desk'], dirOf: () => '/tools/jar-bench/.cache/bake_d/'});
  Object.assign(V, {
    k2_nar: baked('запечённые 2× (556) ω=14 узкое смешивание', {kind: 'spring', omega: 14}, 'narrow'),
    k2_lin: baked('запечённые 2× (556) ω=14 линейное', {kind: 'spring', omega: 14}, 'linear'),
    k2_w20: baked('запечённые 2× (556) ω=20 линейное', {kind: 'spring', omega: 20}, 'linear'),
    k2_near: baked('запечённые 2× (556) ω=14 без смешивания', {kind: 'spring', omega: 14}, 'nearest')
  });
} catch (e) { /* кадры ещё не запечены */ }

/* ---- четвёртый раунд: ImageBitmap из Blob (декодирование вне основного потока), 2D и GL ---- */
Object.assign(V, {
  blob2d: {label: 'Blob→ImageBitmap JIT, 2D, 278 кадров, ω=20, смешивание узкое', render: '2d', decode: 'bmp-jit', blob: true, bmpResize: 'none', motion: {kind: 'spring', omega: 20}, blend: 'narrow', cap: 30},
  blob2dl: {label: 'Blob→ImageBitmap JIT, 2D, 278 кадров, ω=20, линейное', render: '2d', decode: 'bmp-jit', blob: true, bmpResize: 'none', motion: {kind: 'spring', omega: 20}, blend: 'linear', cap: 30},
  blobgl: {label: 'Blob→ImageBitmap JIT, GL + поток, ω=20', render: 'gl', decode: 'bmp-jit', blob: true, bmpResize: 'none', motion: {kind: 'spring', omega: 20}, blend: 'flow', cap: 30}
});
try {
  const bp2 = JSON.parse(fs.readFileSync(path.join(__dirname, '.cache', 'bake_d', 'p.json'), 'utf8')).p;
  Object.assign(V, {
    k2_blob: {label: 'запечённые 2× + Blob→ImageBitmap JIT, 2D, ω=20 линейное', render: '2d', decode: 'bmp-jit', blob: true, bmpResize: 'none', motion: {kind: 'spring', omega: 20}, blend: 'linear', cap: 40, P: bp2, devices: ['desk'], dirOf: () => '/tools/jar-bench/.cache/bake_d/'}
  });
} catch (e) {}

/* ---- пятый раунд: движок целиком в Worker (OffscreenCanvas) — основной поток свободен ---- */
Object.assign(V, {
  wkgl: {label: 'Worker: Blob→ImageBitmap JIT + GL + поток, ω=20', worker: true, render: 'gl', decode: 'bmp-jit', blob: true, bmpResize: 'none', motion: {kind: 'spring', omega: 20}, blend: 'flow', cap: 30},
  wk2d: {label: 'Worker: Blob→ImageBitmap JIT + 2D, ω=20, узкое смешивание', worker: true, render: '2d', decode: 'bmp-jit', blob: true, bmpResize: 'none', motion: {kind: 'spring', omega: 20}, blend: 'narrow', cap: 30}
});

/* ---- шестой раунд: во что обходится отрисовка <img> (смягчение, подсказки декодирования) при принудительной растеризации ---- */
Object.assign(V, {
  s_low: Object.assign(img2d('img2D ω=20, смягчение low', {kind: 'spring', omega: 20}, 'narrow'), {smooth: 'low'}),
  s_high: Object.assign(img2d('img2D ω=20, смягчение high', {kind: 'spring', omega: 20}, 'narrow'), {smooth: 'high'}),
  h_low: Object.assign(img2d('img2D ω=20, low + img.decode() подсказки', {kind: 'spring', omega: 20}, 'narrow', {hint: true}), {smooth: 'low'}),
  lite_low: Object.assign(img2d('img2D lite 960x540 (кадры d-lite), low', {kind: 'spring', omega: 20}, 'narrow'), {smooth: 'low', dirOf: dn => (dn === 'desk' ? '/assets/jar/d-lite/' : '/assets/jar/m-lite/')})
});

/* ---- седьмой раунд: два уровня качества (LOD) ---- */
const lodCfg = (label, over) => Object.assign({label, lod: true, render: '2d', decode: 'img', motion: {kind: 'spring', omega: 20}, blend: 'linear', fast: 18, slow: 9, hold: 140,
  mkLod: (dn, d, P) => ({hi: {dir: d.dir, P}, lite: {dir: dn === 'desk' ? '/assets/jar/d-lite/' : '/assets/jar/m-lite/', P}})}, over || {});
Object.assign(V, {
  lod1: lodCfg('LOD: лёгкие при движении (линейное смешивание), полные в покое'),
  lod2: lodCfg('LOD: порог быстрее (fast 30, slow 14)', {fast: 30, slow: 14}),
  lod3: lodCfg('LOD: узкое смешивание на лёгких', {blend: 'narrow'})
});

/* ---- восьмой раунд: три уровня (полные / лёгкие запечённые / совсем лёгкие) и регулятор по времени кадра ---- */
try {
  const P556 = JSON.parse(fs.readFileSync(path.join(__dirname, '.cache', 'bake_dl', 'p.json'), 'utf8')).p;
  const tiersFor = dn => [
    {dir: dn === 'desk' ? '/assets/jar/d/' : '/assets/jar/m/', P: P278},
    {dir: dn === 'desk' ? '/tools/jar-bench/.cache/bake_dl/' : '/tools/jar-bench/.cache/bake_ml/', P: P556},
    {dir: dn === 'desk' ? '/tools/jar-bench/.cache/bake_dxl/' : '/tools/jar-bench/.cache/bake_mxl/', P: P556}
  ];
  const gov = (label, over) => Object.assign({label, lod: true, render: '2d', decode: 'img', motion: {kind: 'spring', omega: 20}, blend: 'linear', fast: 18, slow: 9, hold: 140, fast2: 0, governor: false,
    mkLod: (dn, d, P) => ({tiers: tiersFor(dn)})}, over || {});
  Object.assign(V, {
    g_off: gov('3 уровня, без регулятора (скорость: полные/лёгкие запечённые)'),
    g_on: gov('3 уровня + регулятор по времени кадра', {governor: true}),
    g_on2: gov('3 уровня + регулятор + «совсем лёгкие» при очень быстром движении', {governor: true, fast2: 45})
  });
} catch (e) { /* лёгкие запечённые наборы ещё не готовы */ }

/* ---- десятый раунд: разрешение «среднего» уровня (чёткость в движении). Уровни: полные 278 → средний (555, запечённые) → низкий (555, 960×540) ---- */
try {
  const PB = JSON.parse(fs.readFileSync(path.join(__dirname, '.cache', 'bake_dl', 'p.json'), 'utf8')).p;
  const mk = (label, mid, over) => Object.assign({label, lod: true, render: '2d', decode: 'img', motion: {kind: 'spring', omega: 24}, blend: 'linear', fast: 18, slow: 9, hold: 140, fast2: 0, governor: true, devices: ['desk'],
    mkLod: (dn, d, P) => ({tiers: [{dir: '/assets/jar/d/', P: P278}, {dir: '/tools/jar-bench/.cache/' + mid + '/', P: PB}, {dir: '/tools/jar-bench/.cache/bake_dl/', P: PB}]})}, over || {});
  Object.assign(V, {
    q_cur: Object.assign(mk('сейчас: полные / 960 / 480', 'bake_dl'), {mkLod: (dn, d, P) => ({tiers: [{dir: '/assets/jar/d/', P: P278}, {dir: '/tools/jar-bench/.cache/bake_dl/', P: PB}, {dir: '/tools/jar-bench/.cache/bake_dxl/', P: PB}]})}),
    q_1120: mk('средний 1120×630', 'mid1120'),
    q_1280: mk('средний 1280×720', 'mid1280'),
    q_1440: mk('средний 1440×810', 'mid1440'),
    q_1280f: mk('средний 1280×720, быстрее 45 кадров/с — низкий 960', 'mid1280', {fast2: 45})
  });
} catch (e) {}

/* ---- одиннадцатый раунд: пороги скорости. «Полные» кадры (278) шагают по ~15 px и при медленной прокрутке дают «стоп-моушен» (рывки ≈ 9 px): пробуем держать полные только в покое ---- */
try {
  const PB11 = JSON.parse(fs.readFileSync(path.join(__dirname, '.cache', 'bake_dl', 'p.json'), 'utf8')).p;
  const t11 = (label, over) => Object.assign({label, lod: true, render: '2d', decode: 'img', motion: {kind: 'spring', omega: 24}, blend: 'linear', fast: 18, slow: 9, hold: 140, fast2: 0, governor: true, devices: ['desk'],
    mkLod: (dn, d, P) => ({tiers: [{dir: '/assets/jar/d/', P: P278}, {dir: '/tools/jar-bench/.cache/mid1280/', P: PB11}, {dir: '/tools/jar-bench/.cache/bake_dl/', P: PB11}]})}, over || {});
  Object.assign(V, {
    t_cur: t11('пороги 18/9 (сейчас)'),
    t_5: t11('пороги 5/2.5', {fast: 5, slow: 2.5}),
    t_3: t11('пороги 3/1.5', {fast: 3, slow: 1.5}),
    t_3f: t11('пороги 3/1.5, низкий уровень от 60 кадров/с', {fast: 3, slow: 1.5, fast2: 60})
  });
} catch (e) {}

/* ---- двенадцатый раунд: телефон — разрешение среднего уровня (полные 810×1440 → средний → низкий 540×960), пороги 5/2.5 ---- */
try {
  const PB12 = JSON.parse(fs.readFileSync(path.join(__dirname, '.cache', 'bake_ml', 'p.json'), 'utf8')).p;
  const m12 = (label, mid, over) => Object.assign({label, lod: true, render: '2d', decode: 'img', motion: {kind: 'spring', omega: 24}, blend: 'linear', fast: 5, slow: 2.5, hold: 140, fast2: 0, governor: true, devices: ['mob'],
    mkLod: (dn, d, P) => ({tiers: [{dir: '/assets/jar/m/', P: P278}, {dir: '/tools/jar-bench/.cache/' + mid + '/', P: PB12}, {dir: '/tools/jar-bench/.cache/bake_ml/', P: PB12}]})}, over || {});
  Object.assign(V, {
    m_cur: m12('телефон сейчас: пороги 18/9, полные / 540×960 / 270×480', 'bake_ml', {fast: 18, slow: 9, mkLod: (dn, d, P) => ({tiers: [{dir: '/assets/jar/m/', P: P278}, {dir: '/tools/jar-bench/.cache/bake_ml/', P: PB12}, {dir: '/tools/jar-bench/.cache/bake_mxl/', P: PB12}]})}),
    m_540: m12('телефон: пороги 5/2.5, средний = 540×960 (прежний лёгкий)', 'bake_ml', {mkLod: (dn, d, P) => ({tiers: [{dir: '/assets/jar/m/', P: P278}, {dir: '/tools/jar-bench/.cache/bake_ml/', P: PB12}, {dir: '/tools/jar-bench/.cache/bake_mxl/', P: PB12}]})}),
    m_630: m12('телефон: средний 630×1120', 'mm630'),
    m_675: m12('телефон: средний 675×1200', 'mm675'),
    m_720: m12('телефон: средний 720×1280', 'mm720')
  });
} catch (e) {}
