/* sphere.js — живой каменный шар в нише первого экрана главной (#arch-story → .ar-pearl).
   Шар — настоящий вращающийся камень: два запечённых из Blender изображения (цвет и нормали травертина с порами, tools/jar-render/bake_sphere.py) натягиваются на сферу в WebGL,
   свет считается на лету. Шар сам медленно поворачивается, от движения курсора — поворачивается следом, а свет скользит по камню (поры и зерно видны в движении).
   Шар НЕ входит в скролл-анимацию кадров: стоит на месте, пока зал вокруг него раскрывается (его положение и размер задаёт CSS, data/redesign.json → jar.arch.sphere).
   Запасной путь: нет WebGL, «меньше движения» или экономия — показана готовая картинка шара (.ar-pearl img), он лишь мягко парит (CSS). Цикл рисования стоит, пока сцена не на экране
   или вкладка скрыта; кадры ограничены ~45 к/с, размер холста — не больше 1024 px по стороне. Файл подключается только на главной (с jar.arch). */
(function () {
  'use strict';
  const root = document.querySelector('.ar-pearl');
  if (!root) return;
  const cv = root.querySelector('.ar-gl');
  if (!cv) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gl = null;
  try { gl = cv.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power'}); } catch (e) { gl = null; }
  if (!gl) { root.classList.add('gl-off'); return; }

  const VS = 'attribute vec2 a;varying vec2 p;void main(){p=a;gl_Position=vec4(a,0.,1.);}';
  const FS = [
    'precision highp float;varying vec2 p;uniform sampler2D tA,tN;uniform mat3 R;uniform vec3 L;uniform float px;',
    'void main(){',
    ' float r2=dot(p,p); if(r2>1.) discard;',
    ' float z=sqrt(1.-r2); vec3 nv=vec3(p.x,p.y,z);',
    ' vec3 o=nv*R;',                                    // умножение вектора на матрицу слева = умножение на транспонированную (обратный поворот)
    ' float u=atan(o.x,o.z)/6.2831853+.5; float v=asin(clamp(o.y,-1.,1.))/3.14159265+.5;',
    ' vec3 al=pow(texture2D(tA,vec2(u,v)).rgb,vec3(2.2));',
    ' vec3 nm=texture2D(tN,vec2(u,v)).rgb*2.-1.;',
    ' vec3 T=normalize(cross(vec3(0.,1.,0.),o+vec3(1e-4,0.,0.))); vec3 B=cross(o,T);',
    ' vec3 no=normalize(T*nm.x+B*nm.y+o*nm.z); vec3 n=normalize(R*no);',
    ' float dg=dot(nv,L), dn=dot(n,L);',
    ' float w=clamp((mix(dg,dn,.72)+.30)/1.30,0.,1.);',                // мягкий переход света в тень (камень матовый, терминатор не резкий), мелкий рельеф даёт карта нормалей
    ' float key=pow(w,1.15);',
    ' float bnc=.10*max(dot(nv,normalize(vec3(.45,-.75,.35))),0.);',   // тёплый отсвет от пола снизу
    ' vec3 col=al*((.29+.10*nv.y)*vec3(.99,.95,.91)+key*1.05*vec3(1.,.96,.90)+bnc*vec3(1.,.82,.62));',
    ' col=mix(col,vec3(dot(col,vec3(.3,.59,.11))),.42);',                // приглушённая насыщенность (цвет шара — нейтральный тёплый, не выделяется среди стен зала)
    ' col*=(.90+.10*z)*1.33;',                                         // у края чуть темнее; общая экспозиция — как у рендера Blender: шар чуть темнее стен зала
    ' vec3 h=normalize(L+vec3(0.,0.,1.)); col+=vec3(1.,.95,.88)*pow(max(dot(n,h),0.),26.)*.05*key;',
    ' col=col/(1.+.10*col);',                                          // мягкое сжатие светов
    ' col=pow(col,vec3(1./2.2));',
    ' float e=smoothstep(1.,1.-2.*px,sqrt(r2));',
    ' gl_FragColor=vec4(col*e,e);',
    '}'
  ].join('\n');
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  let prog, loc = {};
  try {
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch (e) { root.classList.add('gl-off'); return; }
  gl.useProgram(prog);
  ['tA', 'tN', 'R', 'L', 'px'].forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  function tex(unit, img) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  let ready = 0, W = 0, running = false, raf = 0, onScreen = true, tPrev = 0, visible = true;
  const st = {yaw: 0.6, pitch: -0.12, ty: 0, tp: 0, hx: 0, hy: 0, lx: 0, ly: 0};          // поворот шара, цель от курсора, положение курсора, свет
  const A = window.Astreya = window.Astreya || {};
  A.sphere = {state: () => ({yaw: st.yaw, ty: st.ty, tp: st.tp, lx: st.lx, ly: st.ly, running, ready: ready >= 2})};            // для проверок (tools/check-arch.js)
  function load(url, unit) {
    return new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { tex(unit, im); res(true); }; im.onerror = () => res(false); im.src = url; });
  }
  function size() {
    const w = Math.round(Math.min(1024, Math.max(160, (cv.clientWidth || 300) * Math.min(window.devicePixelRatio || 1, 2))));
    if (w !== W) { W = w; cv.width = W; cv.height = W; gl.viewport(0, 0, W, W); }
  }
  function mat(yaw, pitch) {                                  // R (объект → вид): R = Ry(yaw)·Rx(pitch), записана по столбцам для uniformMatrix3fv
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return new Float32Array([cy, 0, -sy,   sy * sp, cp, cy * sp,   sy * cp, -sp, cy * cp]);
  }
  function draw(t) {
    if (ready < 2) return;
    const dt = tPrev ? Math.min(.08, (t - tPrev) / 1000) : .016; tPrev = t;
    if (!still) st.yaw += dt * .13;                          // медленный собственный поворот (≈ 7,5°/с)
    st.ty += (st.hx * 1.05 - st.ty) * Math.min(1, dt * 3);     // курсор слева/справа — поворот
    st.tp += (st.hy * .28 - st.tp) * Math.min(1, dt * 3);
    st.lx += (st.hx - st.lx) * Math.min(1, dt * 2.4); st.ly += (st.hy - st.ly) * Math.min(1, dt * 2.4);
    let L = [-.42 + st.lx * .46, .5 - st.ly * .32, .72]; const n = Math.hypot(L[0], L[1], L[2]); L = L.map(v => v / n);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1i(loc.tA, 0); gl.uniform1i(loc.tN, 1);
    gl.uniformMatrix3fv(loc.R, false, mat(st.yaw + st.ty, -.12 + st.tp));
    gl.uniform3f(loc.L, L[0], L[1], L[2]); gl.uniform1f(loc.px, 1.5 / W);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!root.classList.contains('gl-on')) root.classList.add('gl-on');
  }
  function loop(t) { raf = 0; if (!running) return; if (!tPrev || t - tPrev >= 21) draw(t); raf = requestAnimationFrame(loop); }
  function go() {
    const want = ready >= 2 && onScreen && visible && !still && !document.documentElement.classList.contains('anim-off');
    if (want && !running) { running = true; tPrev = 0; raf = requestAnimationFrame(loop); }
    else if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; if (ready >= 2) draw(performance.now()); }
  }
  addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    st.hx = Math.max(-1, Math.min(1, e.clientX / innerWidth * 2 - 1)); st.hy = Math.max(-1, Math.min(1, e.clientY / innerHeight * 2 - 1));
    if (!running && ready >= 2 && onScreen && !still) go();
  }, {passive: true});
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; go(); });
  const stage = document.getElementById('arch-story');
  if (stage && window.IntersectionObserver) new IntersectionObserver(es => { es.forEach(e => { onScreen = e.isIntersecting; }); go(); }).observe(stage);
  if (window.ResizeObserver) new ResizeObserver(() => { size(); if (ready >= 2) draw(performance.now()); }).observe(cv); else addEventListener('resize', size);
  size();
  Promise.all([load(root.dataset.a, 0), load(root.dataset.n, 1)]).then(r => { if (!r[0] || !r[1]) { root.classList.add('gl-off'); return; } ready = 2; size(); draw(performance.now()); go(); });
})();
