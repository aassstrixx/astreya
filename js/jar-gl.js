/* jar-gl.js — «камера по глубине»: WebGL2-отрисовка кадров зала первого экрана (js/jar.js, секция #arch-story).
   Кадры сцены (Blender, tools/jar-render) — это отдельные снимки через равные промежутки пути камеры. Раньше между ними картинки просто смешивались: при движении предметы
   раздваивались, картинка «дребезжала», а чтобы было легче, в движении показывался более мягкий набор кадров. Теперь к каждому кадру прилагается карта глубины, а положение камеры
   в любой точке прокрутки известно (дорожка камеры из hall_story.py → camtrack). Для текущего положения p берутся два соседних кадра, каждый «перепроецируется» на камеру p (сетка точек,
   смещённых по глубине), и они сливаются: резкие кромки, никакого двоения, движение камеры непрерывное — как будто сцену снимают в реальном времени, а не листают картинки.
   В покое берётся один ближайший кадр — пиксель в пиксель; растянутые («резиновые») треугольники на открывшихся местах отбрасываются, их место занимает второй кадр.
   Файл только рисует; загрузкой кадров и пружиной плейхеда занимается jar.js. */
(function () {
  'use strict';
  const A = (window.Astreya = window.Astreya || {});

  const VS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uDepth;
uniform ivec2 uGrid;      // число ячеек сетки
uniform ivec2 uDSize;     // размер карты глубины, px
uniform vec2 uDisp;       // диапазон обратной глубины 1/z (м⁻¹)
uniform vec3 uSP, uSF, uSR, uSU; uniform float uSL;   // камера кадра: положение, вперёд, вправо, вверх, фокусное (мм)
uniform vec3 uTP, uTF, uTR, uTU; uniform float uTL;   // текущая камера
uniform vec2 uAsp;        // размеры кадра в долях большей стороны: ландшафт (1, 1/a), портрет (a, 1)
uniform vec2 uCover;      // растяжение кадра до заполнения холста (cover)
uniform vec2 uNF;         // ближняя / дальняя плоскости
out vec2 vUv;
void main() {
  int gw = uGrid.x + 1;
  ivec2 ij = ivec2(gl_VertexID % gw, gl_VertexID / gw);
  vec2 uv = vec2(ij) / vec2(uGrid);
  ivec2 tc = min(ivec2(uv * vec2(uDSize)), uDSize - 1);
  vec4 d = texelFetch(uDepth, tc, 0) * 255.0;
  float v = (d.r * 256.0 + d.g) / 65535.0;
  float disp = max(uDisp.x + v * (uDisp.y - uDisp.x), 0.02);
  float z = 1.0 / disp;
  float S = 36.0 / uSL * z;
  vec3 P = uSP + uSF * z + uSR * ((uv.x - 0.5) * S * uAsp.x) + uSU * ((0.5 - uv.y) * S * uAsp.y);
  vec3 q = P - uTP;
  float zt = dot(q, uTF), xt = dot(q, uTR), yt = dot(q, uTU);
  float k = 2.0 * uTL / 36.0;
  float zc = max(zt, 0.02);
  float a = (uNF.y + uNF.x) / (uNF.y - uNF.x), b = -2.0 * uNF.y * uNF.x / (uNF.y - uNF.x);
  /* деление на глубину делаем сами (w = 1): тогда uv и глубина интерполируются по экрану линейно — иначе у кромок, где соседние точки сетки лежат на разной глубине, пиксели берутся не из своих мест */
  gl_Position = vec4(vec2(xt * k / uAsp.x, yt * k / uAsp.y) * uCover / zc, (a * zc + b) / zc, 1.0);
  vUv = uv;
}`;

  const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uColor;
uniform sampler2D uDepth; uniform ivec2 uDSize; uniform vec2 uDisp;
uniform float uEdge;      // относительный скачок глубины между соседними точками карты, с которого пиксель считается кромкой (его цвет — смесь переднего и заднего плана)
uniform vec2 uTexSize;
uniform float uExpect;    // сколько пикселей кадра приходится на пиксель экрана (по площади) при неизменной камере
uniform float uStretch;   // треугольники, растянутые сильнее (площадь на экране больше в 1/uStretch раз), считаются «резиновыми»
in vec2 vUv;
out vec4 o;
float zAt(ivec2 tc) {
  vec4 d = texelFetch(uDepth, clamp(tc, ivec2(0), uDSize - 1), 0) * 255.0;
  return 1.0 / max(uDisp.x + (d.r * 256.0 + d.g) / 65535.0 * (uDisp.y - uDisp.x), 0.02);
}
void main() {
  vec2 gx = dFdx(vUv * uTexSize), gy = dFdy(vUv * uTexSize);
  float det = abs(gx.x * gy.y - gx.y * gy.x);
  bool bad = det < uExpect * uStretch;
  ivec2 tc = ivec2(vUv * vec2(uDSize));
  float z0 = zAt(tc);
  float m = max(max(abs(zAt(tc + ivec2(1, 0)) - z0), abs(zAt(tc - ivec2(1, 0)) - z0)), max(abs(zAt(tc + ivec2(0, 1)) - z0), abs(zAt(tc - ivec2(0, 1)) - z0)));
  bad = bad || m > uEdge * z0;
  o = vec4(texture(uColor, vUv).rgb, 1.0);
  gl_FragDepth = bad ? 0.99995 : gl_FragCoord.z;
}`;

  /* заполнитель: где камера смотрит за край кадра или открывается место, не видимое ни одному из двух кадров, показывается сам кадр, повёрнутый на текущую камеру (как бесконечно далёкий фон);
     глубина у него самая дальняя, поэтому любая настоящая точка кадра его перекрывает */
  const FS_BK = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uColor;
uniform vec2 uRes, uAsp, uCover;
uniform vec3 uSF, uSR, uSU; uniform float uSL;
uniform vec3 uTF, uTR, uTU; uniform float uTL;
out vec4 o;
void main() {
  vec2 n = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float kt = 2.0 * uTL / 36.0, ks = 2.0 * uSL / 36.0;
  vec3 d = uTF + uTR * (n.x * uAsp.x / (kt * uCover.x)) + uTU * (n.y * uAsp.y / (kt * uCover.y));
  float zs = max(dot(d, uSF), 1e-3);
  vec2 nd = vec2(dot(d, uSR) / zs * ks / uAsp.x, dot(d, uSU) / zs * ks / uAsp.y);
  o = vec4(texture(uColor, vec2(nd.x * 0.5 + 0.5, 0.5 - nd.y * 0.5)).rgb, 1.0);
  gl_FragDepth = 0.99998;
}`;

  const VS_Q = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  const FS_Q = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uCA, uCB, uDA, uDB;
uniform vec2 uRes, uNF;
uniform float uT;
out vec4 o;
int pr(float d) { return d < 0.9999 ? 2 : (d < 0.99997 ? 1 : (d < 1.0 ? 0 : -1)); }      // 2 — настоящая точка, 1 — «резиновая», 0 — заполнитель, −1 — пусто
float lin(float d) { float zn = d * 2.0 - 1.0; return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - zn * (uNF.y - uNF.x)); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float dA = texture(uDA, uv).r, dB = texture(uDB, uv).r;
  vec3 cA = texture(uCA, uv).rgb, cB = texture(uCB, uv).rgb;
  int pA = pr(dA), pB = pr(dB);
  vec3 c;
  if (pA == 2 && pB == 2) {
    float zA = lin(dA), zB = lin(dB);
    c = abs(zA - zB) < 0.012 + 0.02 * min(zA, zB) ? mix(cA, cB, uT) : (zA < zB ? cA : cB);
  } else if (pA > pB) c = cA;
  else if (pB > pA) c = cB;
  else c = mix(cA, cB, uT);
  o = vec4(c, 1.0);
}`;

  /* лёгкое сглаживание кромок (FXAA): только на резких границах — в движении у перепроецированных кромок ступеньки по сетке; в покое показывается ровный кадр и сглаживание не нужно */
  const FS_AA = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uTex; uniform vec2 uRes;
out vec4 o;
float lm(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 px = 1.0 / uRes, uv = gl_FragCoord.xy * px;
  vec3 cM = texture(uTex, uv).rgb;
  vec3 cNW = texture(uTex, uv + vec2(-1.0, 1.0) * px).rgb, cNE = texture(uTex, uv + vec2(1.0, 1.0) * px).rgb;
  vec3 cSW = texture(uTex, uv + vec2(-1.0, -1.0) * px).rgb, cSE = texture(uTex, uv + vec2(1.0, -1.0) * px).rgb;
  float lM = lm(cM), lNW = lm(cNW), lNE = lm(cNE), lSW = lm(cSW), lSE = lm(cSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.035, lMax * 0.14)) { o = vec4(cM, 1.0); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-6.0), vec2(6.0)) * px;
  vec3 a = 0.5 * (texture(uTex, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(uTex, uv + dir * -0.5).rgb + texture(uTex, uv + dir * 0.5).rgb);
  float lB = lm(b);
  o = vec4(lB < lMin || lB > lMax ? a : b, 1.0);
}`;

  function sh(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function prog(gl, vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return {p, u};
  }
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* камера по дорожке: p → положение, оси (вперёд, вправо, вверх), фокусное. Дорожка плотная (591 отсчёт), между ними — линейно */
  function camTrack(tr) {
    const M = tr.p.length;
    function at(p, out) {
      const x = clamp(p, 0, 1) * (M - 1), i = Math.min(M - 2, Math.floor(x)), t = x - i;
      const pa = tr.pos[i], pb = tr.pos[i + 1], ta = tr.tgt[i], tb = tr.tgt[i + 1];
      const pos = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
      const tgt = [ta[0] + (tb[0] - ta[0]) * t, ta[1] + (tb[1] - ta[1]) * t, ta[2] + (tb[2] - ta[2]) * t];
      const f = norm([tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]);
      const r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
      const ja = tr.jar[i], jb = tr.jar[i + 1];
      const o = out || {};
      o.pos = pos; o.f = f; o.r = r; o.u = u; o.lens = tr.lens[i] + (tr.lens[i + 1] - tr.lens[i]) * t;
      o.jar = [ja[0] + (jb[0] - ja[0]) * t, ja[1] + (jb[1] - ja[1]) * t, ja[2] + (jb[2] - ja[2]) * t];
      o.yaw = tr.yaw[i] + (tr.yaw[i + 1] - tr.yaw[i]) * t;
      o.glow = tr.glow ? tr.glow[i] + (tr.glow[i + 1] - tr.glow[i]) * t : 0;
      return o;
    }
    return {at, M, raw: tr};
  }

  /* cfg: {portrait, track (дорожка камеры), phi (положения кадров по сценарию), grid: [w, h] — число ячеек сетки, stretch}
     возвращает null, если WebGL2 недоступен */
  function createHall(cv, cfg) {
    let gl = null;
    try {
      gl = cv.getContext('webgl2', {alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!cfg.preserve});
    } catch (e) { gl = null; }
    if (!gl) return null;
    let P0, P1, P2, P3;
    try { P1 = prog(gl, VS, FS); P2 = prog(gl, VS_Q, FS_Q); P3 = prog(gl, VS_Q, FS_AA); P0 = prog(gl, VS_Q, FS_BK); } catch (e) { console.warn('jar-gl:', e.message); return null; }
    const track = camTrack(cfg.track), Phi = cfg.phi, N = Phi.length, portrait = !!cfg.portrait;
    const asp = portrait ? [cfg.frameAspect || 9 / 16, 1] : [1, 1 / (cfg.frameAspect || 16 / 9)];
    const fAspect = cfg.frameAspect || (portrait ? 9 / 16 : 16 / 9);
    const NF = [0.1, 40], disp = cfg.track.dispRange || [0.08, 4];
    const keys = new Array(N).fill(null);
    let gridK = 1, W = 0, H = 0, gw = 0, gh = 0, ibo = null, nIdx = 0, fb = [null, null], comp = null, dead = false;
    const vao = gl.createVertexArray();

    function mkTex(filter, wrap) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
      return t;
    }
    function buildGrid(w, h) {
      if (w === gw && h === gh) return;
      gw = w; gh = h;
      const idx = new Uint32Array(gw * gh * 6); let n = 0;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const a = j * (gw + 1) + i, b = a + 1, c = a + gw + 1, d = c + 1;
        idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
      }
      nIdx = n;
      gl.bindVertexArray(vao);
      if (ibo) gl.deleteBuffer(ibo);
      ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    }
    function mkFB() {
      const color = mkTex(gl.NEAREST), depth = mkTex(gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, color); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, depth); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, W, H, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return {f, color, depth};
    }
    function setSize(w, h) {
      w = Math.max(2, w | 0); h = Math.max(2, h | 0);
      if (w === W && h === H) return;
      W = w; H = h;
      if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
      fb.forEach(f => { if (f) { gl.deleteFramebuffer(f.f); gl.deleteTexture(f.color); gl.deleteTexture(f.depth); } });
      fb = [mkFB(), mkFB()];
      if (comp) { gl.deleteFramebuffer(comp.f); gl.deleteTexture(comp.color); }
      { const color = mkTex(gl.LINEAR); gl.bindTexture(gl.TEXTURE_2D, color); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); comp = {f, color}; }
      const g = cfg.grid || [480, 270], f = gridK;
      buildGrid(Math.max(30, Math.round(g[0] * f)), Math.max(20, Math.round(g[1] * f)));
    }
    /* слабая видеокарта: сетка вдвое реже (кромки чуть грубее, зато втрое меньше вершин) */
    function setGridScale(f) { gridK = f; const g = cfg.grid || [480, 270]; buildGrid(Math.max(30, Math.round(g[0] * f)), Math.max(20, Math.round(g[1] * f))); }

    /* кадр k: цвет и глубина (ImageBitmap / <img> / canvas) */
    function setKey(k, colorSrc, depthSrc, cw, ch, dw, dh) {
      dropKey(k);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      /* уменьшенные копии (mip) нужны, только если холст заметно мельче кадра (окно меньше 1920 px): иначе они лишь занимают память и время загрузки */
      const mip = W > 0 && W < 0.72 * (cw || colorSrc.width || colorSrc.naturalWidth);
      const c = mkTex(mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR), d = mkTex(gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, c); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, colorSrc); if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, d); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, depthSrc);
      keys[k] = {c, d, cw: cw || colorSrc.width || colorSrc.naturalWidth, ch: ch || colorSrc.height || colorSrc.naturalHeight, dw: dw || depthSrc.width || depthSrc.naturalWidth, dh: dh || depthSrc.height || depthSrc.naturalHeight};
    }
    function dropKey(k) { const e = keys[k]; if (!e) return; gl.deleteTexture(e.c); gl.deleteTexture(e.d); keys[k] = null; }
    const hasKey = k => !!keys[k];

    const camS = {}, camT = {};
    function layer(i, k, t) {
      const e = keys[k]; track.at(Phi[k], camS);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb[i].f); gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clearDepth(1.0); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      { const b = P0.u; gl.useProgram(P0.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.c); gl.uniform1i(b.uColor, 0);
        gl.uniform2f(b.uRes, W, H); gl.uniform2f(b.uAsp, asp[0], asp[1]); const cb = W / H; gl.uniform2f(b.uCover, Math.max(1, fAspect / cb), Math.max(1, cb / fAspect));
        gl.uniform3fv(b.uSF, camS.f); gl.uniform3fv(b.uSR, camS.r); gl.uniform3fv(b.uSU, camS.u); gl.uniform1f(b.uSL, camS.lens);
        gl.uniform3fv(b.uTF, camT.f); gl.uniform3fv(b.uTR, camT.r); gl.uniform3fv(b.uTU, camT.u); gl.uniform1f(b.uTL, camT.lens);
        gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); }
      gl.useProgram(P1.p); const u = P1.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.c); gl.uniform1i(u.uColor, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, e.d); gl.uniform1i(u.uDepth, 1);
      gl.uniform2i(u.uGrid, gw, gh); gl.uniform2i(u.uDSize, e.dw, e.dh); gl.uniform2f(u.uDisp, disp[0], disp[1]);
      gl.uniform3fv(u.uSP, camS.pos); gl.uniform3fv(u.uSF, camS.f); gl.uniform3fv(u.uSR, camS.r); gl.uniform3fv(u.uSU, camS.u); gl.uniform1f(u.uSL, camS.lens);
      gl.uniform3fv(u.uTP, camT.pos); gl.uniform3fv(u.uTF, camT.f); gl.uniform3fv(u.uTR, camT.r); gl.uniform3fv(u.uTU, camT.u); gl.uniform1f(u.uTL, camT.lens);
      gl.uniform2f(u.uAsp, asp[0], asp[1]);
      const ca = W / H;
      gl.uniform2f(u.uCover, Math.max(1, fAspect / ca), Math.max(1, ca / fAspect));
      gl.uniform2f(u.uNF, NF[0], NF[1]);
      gl.uniform2f(u.uTexSize, e.cw, e.ch);
      const sc = Math.max(W / e.cw, H / e.ch);                      // во сколько раз кадр растянут на холсте (cover)
      gl.uniform1f(u.uExpect, 1 / (sc * sc));
      gl.uniform1f(u.uStretch, cfg.stretch || 0.22);
      gl.uniform2i(u.uDSize, e.dw, e.dh); gl.uniform2f(u.uDisp, disp[0], disp[1]); gl.uniform1f(u.uEdge, cfg.edge === undefined ? 0.08 : cfg.edge);
      gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
    }

    /* рисует вид для положения p; rest ∈ [0,1] — «покой»: 1 — только ближайший кадр (пиксель в пиксель), 0 — плавное слияние двух.
       Возвращает {ka, kb, t} или null, если нужных кадров ещё нет */
    function draw(p, rest, aa) {
      if (dead || !W) return null;
      p = clamp(p, 0, 1);
      let lo = 0, hi = N - 1;
      if (p <= Phi[0]) { hi = 0; } else if (p >= Phi[N - 1]) { lo = N - 1; } else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Phi[m] <= p) lo = m; else hi = m; } }
      let ka = lo, kb = Math.min(N - 1, lo + 1);
      if (!keys[ka] || !keys[kb]) {                                   // нужных кадров нет — ближайшие загруженные по обе стороны
        let a = lo, b = Math.min(N - 1, lo + 1);
        while (a >= 0 && !keys[a]) a--;
        while (b < N && !keys[b]) b++;
        ka = a >= 0 ? a : -1; kb = b < N ? b : -1;
        if (ka < 0 && kb < 0) return null;
        if (ka < 0) ka = kb; if (kb < 0) kb = ka;
      }
      let t = ka === kb ? 0 : clamp((p - Phi[ka]) / (Phi[kb] - Phi[ka]), 0, 1);
      const r = clamp(rest || 0, 0, 1);
      t = t * (1 - r) + (t < 0.5 ? 0 : 1) * r;
      track.at(p, camT);
      const single = ka === kb || t <= 0.0005 || t >= 0.9995;
      const one = ka === kb ? ka : t <= 0.0005 ? ka : kb;
      const f1 = single ? 0 : 1;                                                 // кадр один (покой на кадре): второй слой не рисуем
      if (single) { layer(0, one, 0); t = 0; } else { layer(0, ka, t); layer(1, kb, t); }
      const useAA = !!aa && !single;
      gl.bindFramebuffer(gl.FRAMEBUFFER, useAA ? comp.f : null); gl.viewport(0, 0, W, H); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(P2.p); const u = P2.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fb[0].color); gl.uniform1i(u.uCA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fb[f1].color); gl.uniform1i(u.uCB, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fb[0].depth); gl.uniform1i(u.uDA, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, fb[f1].depth); gl.uniform1i(u.uDB, 3);
      gl.uniform2f(u.uRes, W, H); gl.uniform2f(u.uNF, NF[0], NF[1]); gl.uniform1f(u.uT, t);
      gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (useAA) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(P3.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, comp.color); gl.uniform1i(P3.u.uTex, 0); gl.uniform2f(P3.u.uRes, W, H);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindVertexArray(null);
      return {ka, kb, t: single ? (one === kb && ka !== kb ? 1 : 0) : t, single};
    }
    function destroy(keepContext) {
      dead = true;
      for (let k = 0; k < N; k++) dropKey(k);
      fb.forEach(f => { if (f) { gl.deleteFramebuffer(f.f); gl.deleteTexture(f.color); gl.deleteTexture(f.depth); } });
      if (comp) { gl.deleteFramebuffer(comp.f); gl.deleteTexture(comp.color); }
      if (ibo) gl.deleteBuffer(ibo); [P0, P1, P2, P3].forEach(q => q && gl.deleteProgram(q.p));
      if (!keepContext) { try { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* — */ } }
    }
    return {gl, setSize, setKey, dropKey, hasKey, draw, destroy, setGridScale, camAt: p => track.at(p, {}), keys, get size() { return [W, H]; }};
  }


  /* ---------------------------------------------------------------- баночка: спрайт без этикетки + этикетка в реальном времени ----------------------------------------------------------------
     Спрайт баночки (Blender, слой «jar», этикетка выключена) выровнен по положению баночки в мире и по текущей камере; надписи этикетки рисуются поверх по настоящей геометрии:
     для каждого пикселя спрайта луч камеры пересекается с цилиндром корпуса (радиус 3,65 см, этикетка по высоте 0,9…3,2 см), по точке попадания берётся маска надписей label.png,
     а поворот баночки — это просто угол в формуле. Поэтому вращение плавное при любом положении прокрутки, а надписи резкие на любом размере (маска 4096 px по окружности). */
  const VS_J = `#version 300 es
precision highp float;
uniform vec4 uRect;            // куда рисовать спрайт: левый верхний угол и размер в долях кадра
out vec2 vUv; out vec2 vFr;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vUv = c;
  vFr = uRect.xy + uRect.zw * c;
  gl_Position = vec4(vFr.x * 2.0 - 1.0, 1.0 - vFr.y * 2.0, 0.0, 1.0);
}`;

  const FS_J = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uSprite; uniform sampler2D uLabel;
uniform float uW;              // вес спрайта (смешивание двух соседних кадров)
uniform vec2 uAsp;             // размеры кадра в долях большей стороны
uniform vec3 uCP, uCF, uCR, uCU; uniform float uCL;      // камера
uniform vec3 uJar; uniform float uYaw, uScale;             // основание баночки, поворот (рад), метров в сантиметре модели
uniform float uInk;            // насколько чернила темнят корпус на полном покрытии (множитель яркости)
uniform float uInkOn;
in vec2 vUv; in vec2 vFr;
out vec4 o;
const float R = 3.65, ZMIN = 0.5, ZMAX = 3.35, H = 3.6, TAU = 6.28318530718;
void main() {
  vec4 s = texture(uSprite, vUv);
  vec3 c = s.rgb;
  if (uInkOn > 0.5 && s.a > 0.002) {
    vec2 n = vFr - 0.5;
    float k = 36.0 / uCL;
    vec3 d = normalize(uCF + uCR * (n.x * k * uAsp.x) + uCU * (-n.y * k * uAsp.y));
    vec2 oc = uCP.xy - uJar.xy;
    float r = R * uScale;
    float a = dot(d.xy, d.xy), b = 2.0 * dot(oc, d.xy), cc = dot(oc, oc) - r * r;
    float disc = b * b - 4.0 * a * cc;
    if (disc > 0.0 && a > 1e-8) {
      float t = (-b - sqrt(disc)) / (2.0 * a);
      vec3 hit = uCP + d * t;
      float zl = (hit.z - uJar.z) / uScale;
      if (zl > ZMIN && zl < ZMAX) {
        float th = atan(hit.y - uJar.y, hit.x - uJar.x) - uYaw;
        float u = fract(th / TAU);
        float ink = texture(uLabel, vec2(u, 1.0 - zl / H)).r;
        c *= mix(1.0, uInk, ink);
      }
    }
  }
  o = vec4(c, s.a) * uW;
}`;

  function createJar(cv, cfg) {
    let gl = null;
    try { gl = cv.getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!cfg.preserve}); } catch (e) { gl = null; }
    if (!gl) return null;
    let PJ;
    try { PJ = prog(gl, VS_J, FS_J); } catch (e) { console.warn('jar-gl (jar):', e.message); return null; }
    const track = cfg.track.at ? cfg.track : camTrack(cfg.track), Phi = cfg.phi, N = Phi.length, portrait = !!cfg.portrait;
    const fAspect = cfg.frameAspect || (portrait ? 9 / 16 : 16 / 9);
    const asp = portrait ? [fAspect, 1] : [1, 1 / fAspect];
    const rects = cfg.rects, raw = track.raw, scale = raw.jarScale || 0.02, cz = raw.jarCenterZ || 0.057;
    const sprites = new Array(N).fill(null);
    let label = null, W = 0, H = 0, dead = false;
    const vao = gl.createVertexArray();
    const mk = (filter) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    function setSize(w, h) { w = Math.max(2, w | 0); h = Math.max(2, h | 0); if (w === W && h === H) return; W = w; H = h; if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H; }
    function setSprite(k, src) {
      dropSprite(k);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      const t = mk(gl.LINEAR_MIPMAP_LINEAR); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D);
      sprites[k] = t;
    }
    function dropSprite(k) { if (sprites[k]) { gl.deleteTexture(sprites[k]); sprites[k] = null; } }
    function setLabel(src) {
      if (label) gl.deleteTexture(label);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      label = mk(gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    }
    const hasSprite = k => !!sprites[k];

    function proj(cam, P) {            // точка мира → доли кадра (x вправо, y вниз) и глубина
      const q = [P[0] - cam.pos[0], P[1] - cam.pos[1], P[2] - cam.pos[2]];
      const zt = q[0] * cam.f[0] + q[1] * cam.f[1] + q[2] * cam.f[2];
      const xt = q[0] * cam.r[0] + q[1] * cam.r[1] + q[2] * cam.r[2], yt = q[0] * cam.u[0] + q[1] * cam.u[1] + q[2] * cam.u[2];
      const S = 36 / cam.lens * zt;
      return {u: 0.5 + xt / (S * asp[0]), v: 0.5 - yt / (S * asp[1]), z: zt};
    }
    const camP = {}, camK = {};
    const center = cam => [cam.jar[0], cam.jar[1], cam.jar[2] + cz];
    /* где рисовать спрайт кадра k при камере p: его рамка переносится так, чтобы центр баночки встал на проекцию её настоящего центра, а размер изменился во столько же раз, во сколько изменился видимый размер */
    function place(k, cp) {
      track.at(Phi[k], camK);
      const ck = proj(camK, center(camK)), cc = proj(cp, center(cp));
      const rho = (cp.lens / cc.z) / (camK.lens / ck.z), r = rects[k];
      const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      const w = r[2] * rho, h = r[3] * rho;
      return [cc.u + (cx - ck.u) * rho - w / 2, cc.v + (cy - ck.v) * rho - h / 2, w, h];
    }
    /* рисует баночку для положения p; pair = {ka, kb, t} из hall.draw (те же кадры и доля), чтобы баночка и зал смешивались одинаково */
    function draw(p, pair, opt) {
      if (dead || !W) return false;
      opt = opt || {};
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!pair) return false;
      let ka = pair.ka, kb = pair.kb, t = pair.t;
      if (!sprites[ka] && !sprites[kb]) {               // нужных спрайтов ещё нет — ближайший загруженный
        let best = -1, bd = 1e9;
        for (let k = 0; k < N; k++) if (sprites[k]) { const d = Math.abs(Phi[k] - p); if (d < bd) { bd = d; best = k; } }
        if (best < 0) return false;
        ka = kb = best; t = 0;
      } else if (!sprites[ka]) { ka = kb; t = 0; } else if (!sprites[kb]) { kb = ka; t = 0; }
      track.at(p, camP);
      gl.useProgram(PJ.p); const u = PJ.u;
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST);
      gl.uniform2f(u.uAsp, asp[0], asp[1]);
      gl.uniform3fv(u.uCP, camP.pos); gl.uniform3fv(u.uCF, camP.f); gl.uniform3fv(u.uCR, camP.r); gl.uniform3fv(u.uCU, camP.u); gl.uniform1f(u.uCL, camP.lens);
      gl.uniform3fv(u.uJar, camP.jar); gl.uniform1f(u.uYaw, camP.yaw * Math.PI / 180); gl.uniform1f(u.uScale, scale);
      gl.uniform1f(u.uInk, opt.ink || cfg.ink || 0.43); gl.uniform1f(u.uInkOn, label && opt.label !== false ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, label || sprites[ka]); gl.uniform1i(u.uLabel, 1);
      gl.bindVertexArray(vao);
      const items = ka === kb ? [[ka, 1]] : [[ka, 1 - t], [kb, t]];
      for (const [k, w] of items) {
        if (w <= 0.0005) continue;
        const rc = place(k, camP);
        gl.uniform4f(u.uRect, rc[0], rc[1], rc[2], rc[3]); gl.uniform1f(u.uW, w);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sprites[k]); gl.uniform1i(u.uSprite, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(null); gl.disable(gl.BLEND);
      return true;
    }
    function destroy(keepContext) { dead = true; for (let k = 0; k < N; k++) dropSprite(k); if (label) gl.deleteTexture(label); gl.deleteProgram(PJ.p); if (!keepContext) { try { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (er) { /* — */ } } }
    return {gl, setSize, setSprite, dropSprite, hasSprite, setLabel, draw, destroy, place, proj};
  }

  A.ArchGL = {createHall, createJar, camTrack};
})();
