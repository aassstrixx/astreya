/* Параметризуемый движок «скролл → кадры» для арены (tools/jar-bench). Один и тот же код, разные настройки — чтобы сравнивать честно.
   Настройки (cfg):
     canvas, W, H            холст и его размер в пикселях
     files[]                 если задан — номера файлов кадров (подмножество папки; например, только кадры равномерной сетки 180)
     N, P[]                  число кадров и положения кадров по сценарию (0…1)
     dir, ext                папка и расширение кадров; flowDir, nom[w,h], range — карты потока (для blend:'flow')
     render   '2d' | 'gl'
     blob     true — кадры хранятся как Blob, декодирование createImageBitmap(blob) (вне основного потока)
     decode   'img'         рисуем <img> напрямую (браузер сам декодирует при отрисовке) — как в версии 36
              'bmp-window'  ImageBitmap заранее в окне вокруг положения (как в версии 40)
              'bmp-jit'     ImageBitmap по предсказанной траектории пружины (то, что реально понадобится в ближайшие кадры)
     bmpResize 'none' | 'medium' | 'high'     масштабировать ли кадр при декодировании в размер холста
     motion   {kind:'lerp', tau} | {kind:'spring', omega} | {kind:'none'}
     blend    'narrow' (смешивание только на середине шага) | 'linear' | 'nearest' | 'flow' (WebGL, по карте потока)
     flush    true — в конце кадра дожидаться растеризации (чтобы замер включал декодирование картинки при отрисовке)
     hint     true — для decode:'img' заранее вызывать img.decode() по траектории
     smooth   'low' | 'high'   качество масштабирования в 2D
     cap      сколько декодированных кадров держим
   Возвращает {preload(), frame(t, y, total), counters, destroy()}.  frame() вызывает тест на каждом кадре; y — прокрутка внутри сцены (px). */
(function () {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => x * x * (3 - 2 * x);
  const pad = i => String(i).padStart(3, '0');
  const narrow = (x, p) => p < 0.6 ? ease(clamp((x - 0.42) / 0.16, 0, 1)) : ease(x);

  (typeof window !== 'undefined' ? window : self).ArenaEngine = function (cfg) {
    const N = cfg.N, P = cfg.P, W = cfg.W, H = cfg.H, cv = cfg.canvas;
    const fr = [], fl = [];
    for (let i = 0; i < N; i++) fr.push({img: null, bmp: null, tex: null, dec: false, use: 0});
    for (let i = 0; i < N - 1; i++) fl.push({img: null, bmp: null, tex: null, dec: false});
    const C = {decodes: 0, decodeMs: 0, uploads: 0, uploadMs: 0, uploadBytes: 0, draws: 0, sync: 0, evict: 0, maxQueue: 0};
    let gl = null, ctx2d = null, prog = null, U = {}, srcW = 0, srcH = 0;
    let cp = 0, vp = 0, pT = 0, lastPT = 0, vT = 0, last = 0;
    let queue = [], decActive = 0, epoch = 0, stampN = 0, lastEff = 0;
    const MAXDEC = cfg.maxDec || (cfg.decode === 'bmp-jit' ? 3 : 2);
    const CAP = cfg.cap || 28;

    /* ---- рендерер ---- */
    if (cfg.render === 'gl') {
      gl = cv.getContext('webgl2', {alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance'});
      if (!gl) throw new Error('no webgl2');
      const vs = '#version 300 es\nin vec2 aPos;out vec2 vUv;void main(){vUv=vec2(aPos.x*.5+.5,.5-aPos.y*.5);gl_Position=vec4(aPos,0.,1.);}';
      const fs = '#version 300 es\nprecision highp float;in vec2 vUv;out vec4 o;uniform sampler2D uA,uB,uF;uniform vec2 uScale,uNom;uniform float uT,uFlow,uMix,uRange,uHalf;'
        + 'float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}'
        + 'void main(){vec2 uv=(vUv-.5)*uScale+.5;vec3 c;if(uFlow>.5){'
        + 'vec2 fab=(texture(uF,vec2(min(uv.x*.5,.5-uHalf),uv.y)).rg*255.-128.)/127.*uRange/uNom;'
        + 'vec2 fba=(texture(uF,vec2(max(.5+uv.x*.5,.5+uHalf),uv.y)).rg*255.-128.)/127.*uRange/uNom;'
        + 'vec3 a=texture(uA,uv+uT*fba).rgb;vec3 b=texture(uB,uv+(1.-uT)*fab).rgb;c=mix(a,b,uT);}'
        + 'else{c=mix(texture(uA,uv).rgb,texture(uB,uv).rgb,uMix);}c+=(h(gl_FragCoord.xy)-.5)/255.;o=vec4(c,1.);}';
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog); gl.useProgram(prog);
      ['uA', 'uB', 'uF', 'uScale', 'uNom', 'uT', 'uFlow', 'uMix', 'uRange', 'uHalf'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
      const q = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uF, 2);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.viewport(0, 0, W, H);
    } else {
      ctx2d = cv.getContext('2d', {alpha: false});
    }
    cv.width = W; cv.height = H;
    if (gl) gl.viewport(0, 0, W, H);

    const url = (dir, i) => dir + pad(cfg.files && dir === cfg.dir ? cfg.files[i] : i) + '.' + (cfg.ext || 'webp');
    function loadImg(src) { return new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
    async function preload() {
      const jobs = [];
      if (cfg.blob) {
        // кадры лежат в памяти как Blob: createImageBitmap(blob) декодирует вне основного потока (в отличие от createImageBitmap(<img>))
        for (let i = 0; i < N; i++) jobs.push(() => fetch(url(cfg.dir, i)).then(r => r.blob()).then(bl => { fr[i].blob = bl; fr[i].img = null; }));
        if (cfg.blend === 'flow') for (let i = 0; i < N - 1; i++) jobs.push(() => fetch(url(cfg.flowDir, i)).then(r => r.blob()).then(bl => { fl[i].blob = bl; fl[i].img = {naturalWidth: 960}; }));
        let nx = 0; await Promise.all(Array.from({length: 10}, async () => { while (nx < jobs.length) { const j = jobs[nx++]; await j(); } }));
        const b0 = await createImageBitmap(fr[0].blob); srcW = b0.width; srcH = b0.height; b0.close();
        return;
      }
      for (let i = 0; i < N; i++) jobs.push(() => loadImg(url(cfg.dir, i)).then(im => { fr[i].img = im; if (im && !srcW) { srcW = im.naturalWidth; srcH = im.naturalHeight; } }));
      if (cfg.blend === 'flow') for (let i = 0; i < N - 1; i++) jobs.push(() => loadImg(url(cfg.flowDir, i)).then(im => { fl[i].img = im; }));
      let next = 0;
      await Promise.all(Array.from({length: 10}, async () => { while (next < jobs.length) { const j = jobs[next++]; await j(); } }));
      if (!srcW) { srcW = fr[0].img.naturalWidth; srcH = fr[0].img.naturalHeight; }
    }

    /* ---- текстуры / битмапы ---- */
    function mkTex(src, bytes) {
      const t0 = performance.now();
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      C.uploads++; C.uploadMs += performance.now() - t0; C.uploadBytes += bytes || 0;
      return t;
    }
    function free(r) { if (r.bmp) { try { r.bmp.close(); } catch (e) {} r.bmp = null; } if (r.tex && gl) gl.deleteTexture(r.tex); r.tex = null; r.dec = false; C.evict++; }
    const have = i => !!(fr[i].bmp || fr[i].tex);
    function decodeOpts() {
      const o = {premultiplyAlpha: 'none', colorSpaceConversion: 'none'};
      if (cfg.bmpResize && cfg.bmpResize !== 'none') {
        const k = Math.min(1, Math.max(W / srcW, H / srcH)), bw = Math.round(srcW * k);
        if (bw < srcW) { o.resizeWidth = bw; o.resizeHeight = Math.round(srcH * k); o.resizeQuality = cfg.bmpResize === 'high' ? 'high' : 'medium'; }
      }
      return o;
    }
    function decode(rec, isFlow) {
      const srcObj = cfg.blob ? rec.blob : rec.img;
      if (rec.dec || rec.bmp || rec.tex || !srcObj) return;
      rec.dec = true; decActive++; const ep = epoch, t0 = performance.now();
      createImageBitmap(srcObj, isFlow ? {premultiplyAlpha: 'none', colorSpaceConversion: 'none'} : decodeOpts()).then(b => {
        if (ep === epoch) decActive--;
        rec.dec = false; C.decodes++; C.decodeMs += performance.now() - t0;
        if (gl) { rec.tex = mkTex(b, b.width * b.height * 4); b.close(); } else rec.bmp = b;
        pump();
      }, () => { if (ep === epoch) decActive--; rec.dec = false; pump(); });
    }
    function pump() { while (decActive < MAXDEC && queue.length) { const w = queue.shift(); decode(w.rec, w.flow); } }

    /* ---- выбор кадров ---- */
    function locate(p) {
      if (p <= P[0]) return {k: 0, t: 0};
      if (p >= P[N - 1]) return {k: N - 2, t: 1};
      let lo = 0, hi = N - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= p) lo = m; else hi = m; }
      return {k: lo, t: (p - P[lo]) / (P[lo + 1] - P[lo])};
    }
    function stepMotion(x, v, target, dt) {
      const m = cfg.motion || {kind: 'none'};
      if (m.kind === 'lerp') return [x + (target - x) * (1 - Math.exp(-dt / m.tau)), 0];
      if (m.kind === 'spring') { const e = Math.exp(-m.omega * dt), d = x - target, c = v + m.omega * d; return [target + (d + c * dt) * e, (v - m.omega * c * dt) * e]; }
      return [target, 0];
    }
    function wantWindow(u, dir) {
      const ahead = 9, behind = 4, k0 = Math.floor(u), out = [];
      const lo = dir > 0 ? k0 - behind : k0 - ahead, hi = dir > 0 ? k0 + ahead : k0 + behind;
      for (let i = Math.max(0, lo); i <= Math.min(N - 1, hi + 1); i++) out.push(i);
      out.sort((a, b) => Math.abs(a - u) - Math.abs(b - u));
      return {list: out, keep: [Math.max(0, lo - 6), Math.min(N - 1, hi + 8)]};
    }
    function wantJit(dt) {
      // симулируем ближайшие кадры: пружина + продолжение движения цели с текущей скоростью
      const H_ = cfg.lookahead || 8, step = 1 / 60, out = [], seen = {};
      let x = cp, v = vp, tg = pT;
      for (let j = 1; j <= H_; j++) {
        tg = clamp(tg + vT * step, 0, 1);
        [x, v] = stepMotion(x, v, tg, step);
        const {k} = locate(clamp(x, 0, 1));
        for (const i of [k, Math.min(N - 1, k + 1)]) if (!seen[i]) { seen[i] = 1; out.push(i); }
      }
      const {k} = locate(cp); for (const i of [k, Math.min(N - 1, k + 1)]) if (!seen[i]) { seen[i] = 1; out.unshift(i); }
      return out;
    }
    function manage(dt) {
      if (cfg.decode === 'img') {
        if (!cfg.hint) return;
        // подсказка браузеру: заранее декодировать кадры, которые понадобятся в ближайшие 8 кадров (decode() идёт вне основного потока)
        let n = 0;
        for (const i of wantJit(dt)) { const r = fr[i]; if (!r.hinted && r.img && r.img.decode && n < 4) { r.hinted = true; n++; r.img.decode().catch(() => {}); } }
        return;
      }
      const stamp = ++stampN;
      let need;
      if (cfg.decode === 'bmp-window') {
        const w = wantWindow(locate(cp).k + locate(cp).t, vp >= 0 ? 1 : -1); need = w.list;
        for (let i = 0; i < N; i++) if ((i < w.keep[0] || i > w.keep[1]) && (fr[i].bmp || fr[i].tex)) free(fr[i]);
      } else {
        need = wantJit(dt);
      }
      need.forEach(i => { fr[i].use = stamp; });
      queue = [];
      const has_ = r => !!(cfg.blob ? r.blob : r.img);
      if (cfg.blend === 'flow') need.forEach(i => { if (i < N - 1 && has_(fl[i]) && !fl[i].tex && !fl[i].dec) queue.push({rec: fl[i], flow: true}); });
      need.forEach(i => { if (has_(fr[i]) && !fr[i].bmp && !fr[i].tex && !fr[i].dec) queue.push({rec: fr[i], flow: false}); });
      // приоритет — кадры, нужные раньше (порядок need уже такой), потоки позже
      queue.sort((a, b) => (a.flow ? 1 : 0) - (b.flow ? 1 : 0));
      C.maxQueue = Math.max(C.maxQueue, queue.length);
      if (cfg.decode === 'bmp-jit') {
        // LRU: выгружаем самые давно не нужные, пока не уложимся в cap
        let have_ = []; for (let i = 0; i < N; i++) if (fr[i].bmp || fr[i].tex) have_.push(i);
        if (have_.length > CAP) { have_.sort((a, b) => fr[a].use - fr[b].use); for (let j = 0; j < have_.length - CAP; j++) if (fr[have_[j]].use !== stamp) free(fr[have_[j]]); }
      }
      pump();
    }
    function nearestReady(i, maxd) {
      if (have(i)) return i;
      for (let d = 1; d <= maxd; d++) { if (i - d >= 0 && have(i - d)) return i - d; if (i + d < N && have(i + d)) return i + d; }
      return -1;
    }

    /* ---- отрисовка ---- */
    function drawImg(src, alpha) {
      const iw = src.width || src.naturalWidth, ih = src.height || src.naturalHeight;
      const k = Math.max(W / iw, H / ih), dw = iw * k, dh = ih * k;
      ctx2d.globalAlpha = alpha; ctx2d.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    function paint(k, t) {
      const info = {ia: k, ib: Math.min(N - 1, k + 1), a: 0, flow: false, stale: false, eff: 0};
      let ia = info.ia, ib = info.ib;
      const imgMode = cfg.decode === 'img';
      if (!imgMode) {
        if (!have(ia) || !have(ib)) {
          info.stale = true;
          const na = nearestReady(ia, 12), nb = nearestReady(ib, 12);
          if (na < 0 && nb < 0 && cfg.blob) { info.eff = lastEff; return info; }       // нечего показать — остаётся предыдущая картинка
          if (na < 0 && nb < 0) { // совсем ничего готового: синхронный запасной путь
            C.sync++; const e = fr[ia].img ? ia : ib;
            if (gl) { fr[e].tex = mkTex(fr[e].img, srcW * srcH * 4); } else { ia = ib = e; info.ia = info.ib = e; info.eff = P[e]; drawImg(fr[e].img, 1); C.draws++; return info; }
            ia = ib = e;
          } else if (!have(ia) && !have(ib)) { ia = ib = na >= 0 ? na : nb; }
          else { ia = have(ia) ? ia : nb; ib = have(ib) ? ib : na; }
          info.ia = ia; info.ib = ib;
        }
      }
      let a = 0, flowOn = false;
      if (info.ia !== info.ib) {
        if (cfg.blend === 'flow' && gl && !info.stale && fl[k] && fl[k].tex) { flowOn = true; a = t; }
        else if (cfg.blend === 'linear') a = t;
        else if (cfg.blend === 'nearest') a = t < 0.5 ? 0 : 1;
        else a = narrow(t, cp);
      }
      info.a = a; info.flow = flowOn;
      if (gl) {
        let ta, tb;
        const need = i => { if (!fr[i].tex) { fr[i].tex = mkTex(fr[i].img, srcW * srcH * 4); C.sync++; } return fr[i].tex; };
        ta = fr[info.ia].tex || need(info.ia); tb = fr[info.ib].tex || need(info.ib);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ta);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb);
        if (flowOn) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fl[k].tex); }
        const ca = W / H, fa = srcW / srcH;
        gl.uniform2f(U.uScale, Math.min(1, ca / fa), Math.min(1, fa / ca)); gl.uniform2f(U.uNom, cfg.nom ? cfg.nom[0] : srcW, cfg.nom ? cfg.nom[1] : srcH);
        gl.uniform1f(U.uT, t); gl.uniform1f(U.uFlow, flowOn ? 1 : 0); gl.uniform1f(U.uMix, a); gl.uniform1f(U.uRange, cfg.range || 96);
        gl.uniform1f(U.uHalf, 0.5 / Math.max(2, fl[k] && fl[k].img ? fl[k].img.naturalWidth : 960));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // кэш текстур для img-режима: держим не больше cap
        if (imgMode) { let n = 0; for (let i = 0; i < N; i++) if (fr[i].tex) n++; if (n > CAP) { for (let i = 0; i < N && n > CAP; i++) if (fr[i].tex && i !== info.ia && i !== info.ib && Math.abs(i - k) > 6) { free(fr[i]); n--; } } }
      } else {
        ctx2d.imageSmoothingEnabled = true; ctx2d.imageSmoothingQuality = cfg.smooth || 'high';
        const src = i => (imgMode ? fr[i].img : (fr[i].bmp || fr[i].img));
        drawImg(src(info.ia), 1);
        if (info.ib !== info.ia && a > 0.02) drawImg(src(info.ib), a);
        ctx2d.globalAlpha = 1;
      }
      if (cfg.flush) { if (gl) gl.finish(); else ctx2d.getImageData(0, 0, 1, 1); }       // принудительно дожидаемся растеризации: в замер попадает декодирование картинки при отрисовке
      C.draws++;
      info.eff = flowOn ? cp : (1 - a) * P[info.ia] + a * P[info.ib]; lastEff = info.eff;
      return info;
    }

    /* ---- кадр ---- */
    function frame(t, y, total) {
      const dt = last ? clamp((t - last) / 1000, 0.001, 0.1) : 1 / 60; last = t;
      pT = clamp(y / total, 0, 1);
      const vInst = (pT - lastPT) / dt; vT += (vInst - vT) * 0.35; lastPT = pT;        // сглаженная скорость цели (для предсказания)
      [cp, vp] = stepMotion(cp, vp, pT, dt); cp = clamp(cp, 0, 1);
      manage(dt);
      const {k, t: tt} = locate(cp);
      const info = paint(k, tt);
      info.cp = cp; info.vp = vp; info.pT = pT;
      return info;
    }
    function reset(p0) { cp = pT = lastPT = p0 || 0; vp = vT = 0; last = 0; }
    function destroy() { epoch++; for (let i = 0; i < N; i++) free(fr[i]); for (let i = 0; i < N - 1; i++) free(fl[i]); }
    return {preload, frame, reset, counters: C, destroy, get srcSize() { return [srcW, srcH]; }};
  };
})();
