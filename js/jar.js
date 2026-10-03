/* jar.js — вступление на главной: баночка «Астрея» оживает по скроллу.
   Секция #jar-story в несколько экранов высотой, внутри — закреплённая сцена (sticky) с canvas. Положение прокрутки внутри секции (0…1)
   выбирает момент заранее отрендеренной последовательности кадров (WebP): вниз — вперёд, вверх — обратная перемотка.

   Как добиться плавности (всё это — только здесь, кадры и вёрстка не меняются):
   • движение по кадрам ведёт «пружина» с критическим затуханием (а не простое сглаживание): нет рывка на старте и мягкая остановка без «щелчка»;
   • между соседними кадрами положение дорисовывается по карте оптического потока (assets/jar/f*, см. tools/jar-render/make_flow.py):
     WebGL-шейдер сдвигает оба кадра к нужному моменту и смешивает — этикетка и крышка едут, а не двоятся. Если WebGL или карты недоступны —
     обычное смешивание кадров на 2D-canvas;
   • кадры декодируются заранее и вне основного потока (createImageBitmap) в окне вокруг текущего положения, в видеопамяти держится только окно;
   • в цикле нет чтения вёрстки: границы сцены измеряются один раз (и при изменении размера), CSS-переменные пишутся только при изменении;
   • пока сцена на экране, колесо мыши не «сглаживается» второй раз (js/motion.js смотрит на класс jar-zone) — иначе задержки складываются.
   Кадры: assets/jar/d (горизонтальный экран) и assets/jar/m (вертикальный); в автономной сборке — облегчённые *-lite из data:-адресов.
   Положения кадров по сценарию (p от 0 до 1) — data-p: сетка неравномерная, кадров больше там, где движение быстрее.
   Вступление показывается при любых настройках устройства («уменьшить движение», экономия трафика) — по решению заказчика; без JS его нет.
   Подписи, шапка и кнопка «Пропустить» — тоже от прокрутки. После баночки идёт экран с лозунгом (#jar-outro): слова проявляются по той же
   прокрутке, линия с жемчужиной дорисовывается, затем всё уходит.
   Файл загружается только на главной и только пока jar.enabled = true (data/redesign.json). */
(function () {
  'use strict';
  const A = window.Astreya || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => x * x * (3 - 2 * x);
  /* без карты потока (или на 2D-canvas): пока на кадре чёткие детали (p < 0.6) — смешивание только на самой середине шага, чтобы этикетка не двоилась;
     на гладком креме (нырок) — плавно по всему шагу */
  const blendPolicy = (x, p) => p < 0.6 ? ease(clamp((x - 0.42) / 0.16, 0, 1)) : ease(x);
  const pad = i => String(i).padStart(3, '0');
  const portraitMQ = window.matchMedia('(max-aspect-ratio: 11/10)');
  const OMEGA = 10;           // жёсткость пружины, 1/с: отставание при равномерной прокрутке ≈ 2/OMEGA = 0,2 с, остановка (до 2 %) ≈ 0,6 с
  let ctrl = null;

  function create(root) {
    const stage = root.querySelector('.js-stage'), skip = root.querySelector('.js-skip');
    let cv = root.querySelector('.js-cv');
    const caps = Array.prototype.slice.call(root.querySelectorAll('.js-cap')).map(el => ({el, a: +el.dataset.from, b: +el.dataset.to}));
    const ds = root.dataset, N = +ds.n || 1, ext = ds.ext || 'webp', ver = ds.v ? '?v=' + ds.v : '', bundle = !!window.__ASTREYA_BUNDLE;
    let P = (ds.p || '').split(',').map(Number);
    if (P.length !== N || P.some(isNaN)) { P = []; for (let i = 0; i < N; i++) P.push(N > 1 ? i / (N - 1) : 0); }

    const outro = document.getElementById('jar-outro'), jo = outro && outro.querySelector('.jo-stage');
    const words = outro ? Array.prototype.slice.call(outro.querySelectorAll('.jo-w')) : [];

    /* ---- набор кадров: полный или облегчённый; для телефона — вертикальный ---- */
    const isPortrait = () => portraitMQ.matches;
    const dirOf = () => (isPortrait() ? (bundle ? ds.ml : ds.m) : (bundle ? ds.dl : ds.d));
    const flowDirOf = () => (isPortrait() ? (bundle ? ds.fml : ds.fm) : (bundle ? ds.fdl : ds.fd));
    const nomOf = () => String(isPortrait() ? ds.sm : ds.sd || '').split('x').map(Number);        // номинальный размер кадра (px), в нём выражен поток
    const rangeOf = () => +(isPortrait() ? ds.rm : ds.rd) || 64;
    const urlOf = (dir, i) => { const p = dir + pad(i) + '.' + ext; return A.assetUrl ? A.assetUrl(p) + (bundle ? '' : ver) : p + ver; };

    /* ---- рендерер: WebGL2 (с потоком) или 2D-canvas (смешивание) ---- */
    let gl = null, glLost = false, prog = null, U = {}, quad = null, ctx2d = null;
    function initGL() {
      const vs = '#version 300 es\nin vec2 aPos;out vec2 vUv;void main(){vUv=vec2(aPos.x*.5+.5,.5-aPos.y*.5);gl_Position=vec4(aPos,0.,1.);}';
      const fs = '#version 300 es\nprecision highp float;in vec2 vUv;out vec4 o;'
        + 'uniform sampler2D uA,uB,uF;uniform vec2 uScale,uNom;uniform float uT,uFlow,uMix,uRange,uHalf;'
        + 'float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}'
        + 'void main(){'
        + 'vec2 uv=(vUv-.5)*uScale+.5;vec3 c;'
        + 'if(uFlow>.5){'
        + 'vec2 fab=(texture(uF,vec2(min(uv.x*.5,.5-uHalf),uv.y)).rg*255.-128.)/127.*uRange/uNom;'      // поток вперёд (A → B), px → доля кадра
        + 'vec2 fba=(texture(uF,vec2(max(.5+uv.x*.5,.5+uHalf),uv.y)).rg*255.-128.)/127.*uRange/uNom;'    // поток назад (B → A)
        + 'vec3 a=texture(uA,uv+uT*fba).rgb;vec3 b=texture(uB,uv+(1.-uT)*fab).rgb;c=mix(a,b,uT);'
        + '}else{c=mix(texture(uA,uv).rgb,texture(uB,uv).rgb,uMix);}'
        + 'c+=(h(gl_FragCoord.xy)-.5)/255.;'          // лёгкий дизеринг: тёмные градиенты не полосят
        + 'o=vec4(c,1.);}';
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      U = {}; ['uA', 'uB', 'uF', 'uScale', 'uNom', 'uT', 'uFlow', 'uMix', 'uRange', 'uHalf'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uF, 2);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    }
    function use2D() {            // канвас, получивший WebGL-контекст, 2D уже не отдаст — подменяем элемент
      if (gl) { const n = cv.cloneNode(false); cv.parentNode.replaceChild(n, cv); cv = n; }
      gl = null; glLost = false; flowPending = [];
      try { ctx2d = cv.getContext('2d', {alpha: false}); } catch (e) { ctx2d = null; }
      if (!ctx2d) { root.classList.add('jar-off'); dead = true; }
      resetCache(); sizeCanvas(true); schedule();
    }
    function glFail() { if (gl) use2D(); }
    try {
      gl = cv.getContext('webgl2', {alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance'});
      if (gl) initGL();
    } catch (e) { gl = null; }

    /* ---- состояние ---- */
    let set = null, flowSet = null, W = 0, H = 0, S = 1, dead = false, firstDrawn = false, running = false, last = 0, dirty = true;
    let cp = 0, vp = 0, pT = 0, cq = 0, vq = 0, qT = 0, paintedP = -1, lostTimer = 0;
    let sTop = 0, sTot = 1, sH = 1, oTop = 0, oTot = 1, oH = 0, zone = false;
    let srcW = 0, srcH = 0, drawW = 0, drawH = 0, dirSign = 1;
    const fr = new Array(N), fl = new Array(N - 1);                  // записи кадров и карт потока
    for (let i = 0; i < N; i++) fr[i] = {img: null, bmp: null, tex: null, dec: false};
    for (let i = 0; i < N - 1; i++) fl[i] = {img: null, bmp: null, tex: null, dec: false};
    let loaded = 0, flowsLoaded = 0, decActive = 0, epoch = 0, pending = [], flowPending = [];
    const MAXDEC = 2, CAP = () => (isPortrait() ? 26 : 30);

    /* ---- загрузка: сначала каждый 8-й кадр (чтобы сразу можно было листать), затем остальные; карты потока — следом ---- */
    function startLoading() {
      const dir = dirOf(), fdir = flowDirOf(); if (set === dir) return;
      resetCache();
      set = dir; flowSet = fdir; loaded = 0; flowsLoaded = 0; inflight = 0; flInflight = 0; firstAsked = false;
      for (let i = 0; i < N; i++) fr[i] = {img: null, bmp: null, tex: null, dec: false};
      for (let i = 0; i < N - 1; i++) fl[i] = {img: null, bmp: null, tex: null, dec: false};
      const seen = {}, order = [];
      const push = i => { if (i >= 0 && i < N && !seen[i]) { seen[i] = 1; order.push(i); } };
      push(0); for (let i = 0; i < N; i += 8) push(i); push(N - 1); for (let i = 0; i < N; i++) push(i);
      pending = order;
      flowPending = [];
      if (fdir && gl) { const s2 = {}; const pf = i => { if (i >= 0 && i < N - 1 && !s2[i]) { s2[i] = 1; flowPending.push(i); } }; for (let i = 0; i < N - 1; i += 8) pf(i); for (let i = 0; i < N - 1; i++) pf(i); }
      pump(set);
    }
    let inflight = 0, flInflight = 0;
    let winLoaded = document.readyState === 'complete', firstAsked = false;      // пока страница грузится, берём только первый кадр: остальные не должны задерживать событие load
    function pump(forSet) {
      if (dead || forSet !== set) return;
      if (!winLoaded) {
        if (!firstAsked && pending.length && pending[0] === 0) { firstAsked = true; pending.shift(); load(0, false, forSet); }
        return;
      }
      const lanes = isPortrait() ? 3 : 4;
      while (inflight < lanes) {
        let isFlow = false, i;
        const needFrames = loaded + (inflight - flInflight) < Math.min(N, 9);            // сначала грубая сетка кадров
        if (!needFrames && flowPending.length && flowsLoaded + flInflight < loaded - 1) { i = flowPending.shift(); isFlow = true; }
        else if (pending.length) i = pending.shift();
        else if (flowPending.length) { i = flowPending.shift(); isFlow = true; }
        else return;
        load(i, isFlow, forSet);
      }
    }
    function load(i, isFlow, forSet) {
      const img = new Image(); img.decoding = 'async';
      inflight++; if (isFlow) flInflight++;
      img.onload = () => {
        inflight--; if (isFlow) flInflight--;
        if (forSet !== set) return;
        if (isFlow) { fl[i].img = img; flowsLoaded++; const k = locate(cp).k; if (i >= k - 2 && i <= k + 8) { dirty = true; schedule(); } }
        else {
          fr[i].img = img; loaded++;
          if (!srcW) { srcW = img.naturalWidth; srcH = img.naturalHeight; }
          dirty = true; schedule();
        }
        pump(forSet);
      };
      img.onerror = () => { inflight--; if (isFlow) flInflight--; pump(forSet); };
      img.src = urlOf(isFlow ? flowSet : forSet, i);
    }

    /* ---- размеры холста и декодированных кадров ---- */
    function sizeCanvas(force) {
      const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), s = Math.min(dpr, Math.sqrt(4.4e6 / Math.max(1, w * h)));
      const nw = Math.round(w * s), nh = Math.round(h * s);
      if (force || nw !== W || nh !== H || cv.width !== nw || cv.height !== nh) {
        W = nw; H = nh; S = s;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        if (gl) gl.viewport(0, 0, W, H);
        resetCache();                  // размеры декодированных кадров привязаны к размеру холста
      }
      dirty = true;
    }
    function coverSize() {              // во сколько пикселей нужно декодировать кадр, чтобы он лёг на холст 1:1
      if (!srcW) return [0, 0];
      const k = Math.min(1, Math.max(W / srcW, H / srcH));
      return [Math.max(1, Math.round(srcW * k)), Math.max(1, Math.round(srcH * k))];
    }

    /* ---- кэш декодированных кадров (ImageBitmap → текстура) ---- */
    function freeFrame(rec) {
      if (rec.bmp) { try { rec.bmp.close(); } catch (e) {} rec.bmp = null; }
      if (rec.tex && gl && !glLost) gl.deleteTexture(rec.tex);
      rec.tex = null; rec.gen = (rec.gen || 0) + 1; rec.dec = false;
    }
    function resetCache() {
      for (let i = 0; i < N; i++) if (fr[i]) freeFrame(fr[i]);
      for (let i = 0; i < N - 1; i++) if (fl[i]) freeFrame(fl[i]);
      decActive = 0; epoch++;
    }
    function mkTex(src) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function decode(rec, isFlow) {
      if (rec.dec || rec.bmp || rec.tex || !rec.img || dead) return;
      const ep = epoch;
      const done = bmp => {
        if (ep === epoch) decActive--;
        rec.dec = false;
        if (dead) { try { bmp.close(); } catch (e) {} return; }
        if (gen !== rec.gen) { try { bmp.close(); } catch (e) {} pumpDecode(); return; }      // за время декодирования размеры/набор сменились
        if (gl) {
          if (glLost) { try { bmp.close(); } catch (e) {} }
          else { try { rec.tex = mkTex(bmp); } catch (e) { try { bmp.close(); } catch (e2) {} glFail(); return; } try { bmp.close(); } catch (e) {} }     // WebGL не принял изображение (например, страница открыта с диска, file://) — переходим на 2D
        } else rec.bmp = bmp;
        dirty = true; schedule(); pumpDecode();
      };
      const gen = rec.gen = rec.gen || 0;
      rec.dec = true; decActive++;
      if (typeof createImageBitmap !== 'function') { decActive--; rec.dec = false; rec.useImg = true; return; }
      const opts = {premultiplyAlpha: 'none', colorSpaceConversion: 'none'};
      if (!isFlow) { const [bw, bh] = coverSize(); if (bw && bw < srcW) { opts.resizeWidth = bw; opts.resizeHeight = bh; opts.resizeQuality = 'high'; } }
      createImageBitmap(rec.img, opts).then(done, () => createImageBitmap(rec.img).then(done, () => { if (ep === epoch) decActive--; rec.dec = false; rec.useImg = true; }));
    }
    let wantQueue = [];
    function pumpDecode() {
      while (decActive < MAXDEC && wantQueue.length) { const w = wantQueue.shift(); decode(w.rec, w.flow); }
    }
    function manage(u) {                // окно вокруг текущего положения: впереди (по направлению движения) шире, чем позади
      if (!srcW) return;
      const ahead = 9, behind = 4, k0 = Math.floor(u);
      const lo = dirSign > 0 ? k0 - behind : k0 - ahead, hi = dirSign > 0 ? k0 + ahead : k0 + behind;
      wantQueue = [];
      const cand = [];
      for (let i = Math.max(0, lo); i <= Math.min(N - 1, hi + 1); i++) cand.push(i);
      cand.sort((a, b) => Math.abs(a - u) - Math.abs(b - u));
      cand.forEach(i => { if (fr[i].img && !fr[i].bmp && !fr[i].tex && !fr[i].dec && !fr[i].useImg) wantQueue.push({rec: fr[i], flow: false}); });
      if (fl.length) for (let i = Math.max(0, lo - 2); i <= Math.min(N - 2, hi + 2); i++) { const r = fl[i]; if (r.img && !r.bmp && !r.tex && !r.dec && !r.useImg) wantQueue.push({rec: r, flow: true}); }
      // выгрузка: всё, что ушло далеко от окна
      const elo = lo - 6, ehi = hi + 8;
      for (let i = 0; i < N; i++) if (i < elo || i > ehi) { const r = fr[i]; if (r.bmp || r.tex) freeFrame(r); }
      for (let i = 0; i < N - 1; i++) if (i < elo - 4 || i > ehi + 4) { const r = fl[i]; if (r.bmp || r.tex) freeFrame(r); }
      pumpDecode();
    }

    /* ---- положение на сценарии → пара кадров и доля между ними ---- */
    function locate(p) {
      if (p <= P[0]) return {k: 0, t: 0};
      if (p >= P[N - 1]) return {k: Math.max(0, N - 2), t: 1};
      let lo = 0, hi = N - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= p) lo = m; else hi = m; }
      return {k: lo, t: (p - P[lo]) / (P[lo + 1] - P[lo])};
    }
    const have = i => !!(fr[i] && (fr[i].tex || fr[i].bmp));
    function nearestReady(i, maxd) {
      if (have(i)) return i;
      for (let d = 1; d <= maxd; d++) { if (i - d >= 0 && have(i - d)) return i - d; if (i + d < N && have(i + d)) return i + d; }
      return -1;
    }
    function emergency(i) {              // ничего не декодировано (самое начало): берём загруженный <img> напрямую
      for (let d = 0; d < N; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < N && fr[j].img) return j;
      return -1;
    }

    /* ---- отрисовка ---- */
    function paint(p) {
      const {k, t} = locate(p), u = k + t;
      if (!srcW) return false;
      manage(u);
      let ia = k, ib = Math.min(N - 1, k + 1), tt = t, useFlow = false, mix = 0;
      if (!have(ia) || !have(ib)) {
        const na = nearestReady(ia, 4), nb = nearestReady(ib, 4);
        if (na < 0 && nb < 0) {
          const e = emergency(ia);
          if (e < 0) return false;
          ia = ib = e;
        } else if (!have(ia) && !have(ib)) { ia = ib = na >= 0 ? na : nb; }
        else { ia = have(ia) ? ia : nb; ib = have(ib) ? ib : na; }
        tt = 0;
      } else {
        const f = fl[k];
        useFlow = !!(gl && !glLost && f && f.tex && ib === ia + 1);
        mix = blendPolicy(t, p);
      }
      if (gl) {
        if (glLost) return false;
        const A_ = fr[ia], B_ = fr[ib];
        let ta = A_.tex, tb = B_.tex;
        try {
          if (!ta) { ta = mkTex(A_.img); A_.tex = ta; }                 // аварийно: без предварительного декодирования
          if (!tb) { tb = mkTex(B_.img); B_.tex = tb; }
        } catch (e) { glFail(); return false; }
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ta);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb);
        if (useFlow) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fl[k].tex); }
        const ca = W / H, fa = srcW / srcH;
        const nom = nomOf();
        gl.uniform2f(U.uScale, Math.min(1, ca / fa), Math.min(1, fa / ca));
        gl.uniform2f(U.uNom, nom[0] || srcW, nom[1] || srcH);
        gl.uniform1f(U.uT, tt); gl.uniform1f(U.uFlow, useFlow ? 1 : 0); gl.uniform1f(U.uMix, ib === ia ? 0 : mix);
        gl.uniform1f(U.uRange, rangeOf()); gl.uniform1f(U.uHalf, 0.5 / Math.max(2, (fl[k] && fl[k].img ? fl[k].img.naturalWidth : 960)));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        if (!ctx2d) return false;
        const src = i => (fr[i].bmp || fr[i].img);
        const drawImg = (im, alpha) => {
          const iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight; if (!iw) return;
          const kk = Math.max(W / iw, H / ih), dw = iw * kk, dh = ih * kk;
          ctx2d.globalAlpha = alpha; ctx2d.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
        };
        const ima = src(ia); if (!ima) return false;
        ctx2d.imageSmoothingEnabled = true; ctx2d.imageSmoothingQuality = 'high';
        drawImg(ima, 1);
        if (ib !== ia && mix > 0.02) { const imb = src(ib); if (imb) drawImg(imb, mix); }
        ctx2d.globalAlpha = 1;
      }
      if (!firstDrawn) { firstDrawn = true; root.classList.add('ready'); }
      return true;
    }

    /* ---- запись CSS-переменных только при изменении значения ---- */
    function setv(el, name, val) {
      const key = '_' + name;
      if (el[key] === val) return;
      el[key] = val; el.style.setProperty(name, val);
    }

    /* ---- интерфейс сцены от прогресса p (0…1) ---- */
    function ui(p, inView) {
      caps.forEach(c => {
        const len = c.b - c.a, f = Math.max(0.012, len * 0.2);
        const o = ease(clamp((p - c.a) / f, 0, 1)) * (1 - ease(clamp((p - (c.b - f)) / f, 0, 1)));
        setv(c.el, '--o', o.toFixed(3));
        setv(c.el, '--y', ((1 - o) * 26 * (p < (c.a + c.b) / 2 ? 1 : -1)).toFixed(1) + 'px');
      });
      setv(stage, '--cue', (1 - clamp(p / 0.035, 0, 1)).toFixed(3));
      const sk = 1 - clamp((p - 0.84) / 0.05, 0, 1);
      setv(stage, '--skip', sk.toFixed(3)); if (skip) skip.classList.toggle('gone', sk < 0.05);
      setv(stage, '--m', ease(clamp((p - 0.76) / 0.225, 0, 1)).toFixed(3));       // крем плавно растворяется в молоко почти до конца сцены
      document.body.classList.toggle('jar-on', inView && p < 0.56);       // светлая шапка — только пока фон тёмный; на светлом креме возвращается обычная
    }

    /* ---- экран с лозунгом: q (0…1) — прокрутка внутри закреплённой части; проявление по порядку: подпись → слова → линия с жемчужиной → девиз → уход ---- */
    function uiOutro(q) {
      const st = (a, b) => ease(clamp((q - a) / (b - a), 0, 1));
      const n = words.length;
      setv(jo, '--q', q.toFixed(3));
      setv(jo, '--e', st(0.02, 0.12).toFixed(3));
      words.forEach((w, i) => { const a = 0.07 + i * (n > 1 ? 0.36 / (n - 1) : 0); setv(w, '--o', st(a, a + 0.2).toFixed(3)); });
      setv(jo, '--r', st(0.56, 0.74).toFixed(3));
      setv(jo, '--s', st(0.70, 0.82).toFixed(3));
      setv(jo, '--x', (1 - st(0.90, 1.0)).toFixed(3));
      setv(jo, '--g', (st(0.0, 0.45) * (1 - st(0.88, 1.0))).toFixed(3));       // свечение фона: из молока и обратно в молоко (без видимых краёв сцены)
    }

    /* ---- границы сцены измеряются один раз (и при изменении размера) — в цикле вёрстку не читаем ---- */
    function measureStatic() {
      const sy = window.scrollY || window.pageYOffset || 0;
      const r = root.getBoundingClientRect(); sTop = r.top + sy; sH = root.offsetHeight; sTot = Math.max(1, sH - stage.clientHeight);
      if (outro) { const o = outro.getBoundingClientRect(); oTop = o.top + sy; oH = outro.offsetHeight; oTot = Math.max(1, oH - jo.clientHeight); }
    }

    /* ---- цикл: прокрутка → цель; пружина ведёт текущее положение к цели ---- */
    function schedule() { if (!running && !dead) { running = true; last = 0; requestAnimationFrame(tick); } }
    function tick(t) {
      if (dead) { running = false; return; }
      const dt = last ? clamp((t - last) / 1000, 0.001, 0.1) : 0.016; last = t;
      const y = window.scrollY || window.pageYOffset || 0, vh = innerHeight;
      pT = clamp((y - sTop) / sTot, 0, 1);
      qT = outro ? clamp((y - oTop) / oTot, 0, 1) : 0;
      // критически затухающая пружина (точное решение на шаг dt): x'' = −2ω x' − ω² (x − цель)
      const e = Math.exp(-OMEGA * dt);
      let d = cp - pT, c = vp + OMEGA * d;
      cp = pT + (d + c * dt) * e; vp = (vp - OMEGA * c * dt) * e;
      d = cq - qT; c = vq + OMEGA * d;
      cq = qT + (d + c * dt) * e; vq = (vq - OMEGA * c * dt) * e;
      if (Math.abs(cp - pT) < 2e-6 && Math.abs(vp) < 1e-4) { cp = pT; vp = 0; }
      if (Math.abs(cq - qT) < 2e-6 && Math.abs(vq) < 1e-4) { cq = qT; vq = 0; }
      cp = clamp(cp, 0, 1); cq = clamp(cq, 0, 1);
      if (Math.abs(vp) > 1e-3) dirSign = vp > 0 ? 1 : -1;
      const inView = y + vh > sTop && y < sTop + sH;
      const inOutro = !!outro && y + vh > oTop && y < oTop + oH;
      const nz = inView || inOutro;
      if (nz !== zone) { zone = nz; document.body.classList.toggle('jar-zone', zone); }
      if ((inView || !firstDrawn) && (dirty || Math.abs(cp - paintedP) > 1e-7)) {
        if (paint(cp)) { paintedP = cp; dirty = false; } else dirty = true;
      }
      ui(cp, inView);
      if (jo && (inOutro || cq !== qT)) uiOutro(cq);
      if (cp !== pT || cq !== qT || dirty && !firstDrawn) requestAnimationFrame(tick); else running = false;
    }

    const onScroll = () => schedule();
    let rzTimer = 0;
    const onResize = () => { clearTimeout(rzTimer); rzTimer = setTimeout(() => { measureStatic(); sizeCanvas(false); startLoading(); schedule(); }, 120); schedule(); };
    const onMQ = () => { measureStatic(); sizeCanvas(true); srcW = srcH = 0; startLoading(); schedule(); };
    addEventListener('scroll', onScroll, {passive: true});
    addEventListener('resize', onResize);
    portraitMQ.addEventListener && portraitMQ.addEventListener('change', onMQ);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!dead) { measureStatic(); schedule(); } });
    const onLoad = () => { if (dead) return; winLoaded = true; measureStatic(); pump(set); schedule(); };
    addEventListener('load', onLoad);
    cv.addEventListener('webglcontextlost', e => {
      e.preventDefault(); glLost = true;
      lostTimer = setTimeout(() => { if (glLost && !dead) use2D(); }, 1500);          // контекст не вернулся — переходим на 2D
    });
    cv.addEventListener('webglcontextrestored', () => {
      clearTimeout(lostTimer); glLost = false;
      try { initGL(); gl.viewport(0, 0, W, H); } catch (e) { use2D(); return; }
      resetCache(); dirty = true; schedule();
    });
    if (skip) skip.addEventListener('click', () => {
      const hero = document.querySelector('.hero'), hh = (document.getElementById('hdr') || {}).offsetHeight || 0;
      const to = hero ? hero.getBoundingClientRect().top + scrollY - hh : root.getBoundingClientRect().bottom + scrollY;
      scrollTo({top: Math.round(to), behavior: 'smooth'});
    });

    if (!gl) { try { ctx2d = cv.getContext('2d', {alpha: false}); } catch (e) { ctx2d = null; } if (!ctx2d) { root.classList.add('jar-off'); return {root, destroy() {}}; } }
    measureStatic();
    sizeCanvas(true);
    startLoading();
    schedule();
    return {
      root,
      jump(p) { cp = pT = p; vp = 0; if (outro) { /* экран с лозунгом не трогаем */ } paint(cp); ui(p, true); },
      state() { return {p: cp, pTarget: pT, u: (() => { const l = locate(cp); return l.k + l.t; })(), cur: (() => { const l = locate(cp); return l.k + l.t; })(), target: pT * (N - 1), loaded, flows: flowsLoaded, N, set, firstDrawn, oq: cq, oTarget: qT, gl: !!gl && !glLost, cache: fr.filter(r => r.tex || r.bmp).length}; },
      destroy() {
        dead = true; clearTimeout(rzTimer); clearTimeout(lostTimer);
        removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); removeEventListener('load', onLoad);
        portraitMQ.removeEventListener && portraitMQ.removeEventListener('change', onMQ);
        resetCache();
        document.body.classList.remove('jar-on', 'jar-zone');
      }
    };
  }

  function init() {
    const root = document.getElementById('jar-story');
    if (ctrl && ctrl.root === root) return;
    if (ctrl) { ctrl.destroy(); ctrl = null; }
    if (!root) return;
    try { ctrl = create(root); } catch (e) { root.classList.add('jar-off'); ctrl = null; }
  }
  window.Astreya = A; A.jar = {init, get ctrl() { return ctrl; }};
  /* где в документе «покой» героя (его верх под шапкой): от этой прокрутки считается уход текста героя (js/motion.js) */
  A.heroBase = function () {
    const r = document.getElementById('jar-story'), hero = r && document.querySelector('.hero');
    if (!r || !hero || !r.offsetHeight) return 0;
    return Math.max(0, Math.round(hero.getBoundingClientRect().top + scrollY - ((document.getElementById('hdr') || {}).offsetHeight || 0)));
  };

  /* подключаемся к инициализации страницы: при первой загрузке и после подмены содержимого (автономная сборка/переходы) */
  const prev = A.initPage;
  A.initPage = function (r) { if (prev) prev.apply(this, arguments); init(); };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
