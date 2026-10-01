/* jar.js — вступление на главной: баночка «Астрея» оживает по скроллу.
   Как это работает: секция #jar-story в несколько экранов высотой, внутри — закреплённая сцена (sticky) с canvas. Положение прокрутки
   внутри секции (0…1) выбирает кадр заранее отрендеренной последовательности (WebP) — вниз кадры идут вперёд, вверх — назад,
   как обратная перемотка. Кадр между двумя соседними плавно подмешивается, движение сглаживается (затухающая «пружина»).
   Кадры: assets/jar/d (горизонтальный экран) и assets/jar/m (вертикальный); в автономной сборке — облегчённые *-lite из data:-адресов.
   Вступление показывается при любых настройках устройства («уменьшить движение», экономия трафика) — по решению заказчика; без JS его нет. Подписи, шапка и кнопка «Пропустить» — тоже от прокрутки.
   Файл загружается только на главной и только пока jar.enabled = true (data/redesign.json). */
(function () {
  'use strict';
  const A = window.Astreya || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => x * x * (3 - 2 * x);
  const blend = x => ease(clamp((x - 0.3) / 0.4, 0, 1));      // чистый кадр держится дольше, смешивание — только на середине шага: резкая этикетка при вращении не двоится
  const pad = i => String(i).padStart(3, '0');
  const portraitMQ = window.matchMedia('(max-aspect-ratio: 11/10)');
  let ctrl = null;

  function create(root) {
    const stage = root.querySelector('.js-stage'), cv = root.querySelector('.js-cv'), skip = root.querySelector('.js-skip');
    const caps = Array.prototype.slice.call(root.querySelectorAll('.js-cap')).map(el => ({el, a: +el.dataset.from, b: +el.dataset.to}));
    const N = +root.dataset.n || 1, ext = root.dataset.ext || 'webp', ver = root.dataset.v ? '?v=' + root.dataset.v : '', bundle = !!window.__ASTREYA_BUNDLE;
    let ctx2d;
    try { ctx2d = cv.getContext('2d', {alpha: false}); } catch (e) { ctx2d = null; }
    if (!ctx2d) { root.classList.add('jar-off'); return {root, destroy() {}}; }

    let set = null, imgs = [], ok = [], W = 0, H = 0, S = 1, cur = 0, target = 0, running = false, last = 0, dead = false, firstDrawn = false, pending = [], active = 0;
    const dirOf = () => (portraitMQ.matches ? (bundle ? root.dataset.ml : root.dataset.m) : (bundle ? root.dataset.dl : root.dataset.d));
    const urlOf = (dir, i) => {
      const p = dir + pad(i) + '.' + ext;
      return A.assetUrl ? A.assetUrl(p) + (bundle ? '' : ver) : p + ver;
    };

    /* ---- загрузка кадров: сначала каждый 6-й (чтобы сразу можно было листать), затем остальные по порядку ---- */
    function startLoading() {
      const dir = dirOf(); if (set === dir) return;
      set = dir; imgs = new Array(N); ok = new Array(N).fill(0); pending = []; active = 0;
      const order = [], seen = {};
      const push = i => { if (i >= 0 && i < N && !seen[i]) { seen[i] = 1; order.push(i); } };
      push(0); for (let i = 0; i < N; i += 6) push(i); push(N - 1); for (let i = 0; i < N; i++) push(i);
      pending = order;
      const lanes = portraitMQ.matches ? 3 : 4;
      for (let k = 0; k < lanes; k++) pump(set);
    }
    function pump(forSet) {
      if (dead || forSet !== set) return;
      const i = pending.shift(); if (i === undefined) return;
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { ok[i] = 1; imgs[i] = img; active--; if (!firstDrawn && i === 0) schedule(); else if (Math.abs(i - cur) < 2.5) schedule(); pump(forSet); };
      img.onerror = () => { active--; pump(forSet); };
      active++; img.src = urlOf(forSet, i);
    }

    /* ---- размеры ---- */
    function resize() {
      const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), s = Math.min(dpr, Math.sqrt(2.6e6 / Math.max(1, w * h)));
      W = Math.round(w * s); H = Math.round(h * s); S = s;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      startLoading();
      schedule();
    }

    /* ---- кадр: ближайший загруженный к индексу i (в сторону уже загруженных) ---- */
    function nearest(i) {
      if (ok[i]) return imgs[i];
      for (let d = 1; d < N; d++) { if (i - d >= 0 && ok[i - d]) return imgs[i - d]; if (i + d < N && ok[i + d]) return imgs[i + d]; }
      return null;
    }
    function drawImg(im, alpha) {
      const iw = im.naturalWidth, ih = im.naturalHeight; if (!iw) return;
      const k = Math.max(W / iw, H / ih), dw = iw * k, dh = ih * k;
      ctx2d.globalAlpha = alpha;
      ctx2d.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    function paint() {
      const i0 = Math.floor(cur), a = blend(cur - i0), im0 = nearest(clamp(i0, 0, N - 1));
      if (!im0) return;
      ctx2d.imageSmoothingEnabled = true; ctx2d.imageSmoothingQuality = 'high';
      drawImg(im0, 1);
      if (a > 0.02 && i0 + 1 < N) { const im1 = ok[i0 + 1] ? imgs[i0 + 1] : null; if (im1) drawImg(im1, a); }
      ctx2d.globalAlpha = 1;
      if (!firstDrawn) { firstDrawn = true; root.classList.add('ready'); }
    }

    /* ---- интерфейс сцены от прогресса p (0…1) ---- */
    function ui(p, inView) {
      caps.forEach(c => {
        const len = c.b - c.a, f = Math.max(0.012, len * 0.2);
        const o = ease(clamp((p - c.a) / f, 0, 1)) * (1 - ease(clamp((p - (c.b - f)) / f, 0, 1)));
        c.el.style.setProperty('--o', o.toFixed(3));
        c.el.style.setProperty('--y', ((1 - o) * 26 * (p < (c.a + c.b) / 2 ? 1 : -1)).toFixed(1) + 'px');
      });
      stage.style.setProperty('--cue', (1 - clamp(p / 0.035, 0, 1)).toFixed(3));
      const sk = 1 - clamp((p - 0.84) / 0.05, 0, 1);
      stage.style.setProperty('--skip', sk.toFixed(3)); if (skip) skip.classList.toggle('gone', sk < 0.05);
      stage.style.setProperty('--m', ease(clamp((p - 0.74) / 0.16, 0, 1)).toFixed(3));
      document.body.classList.toggle('jar-on', inView && p < 0.56);       // светлая шапка — только пока фон тёмный; на светлом креме возвращается обычная
    }

    /* ---- прокрутка → цель; цикл догоняет цель с затуханием ---- */
    function measure() {
      const r = root.getBoundingClientRect(), total = Math.max(1, root.offsetHeight - stage.clientHeight);
      return {p: clamp(-r.top / total, 0, 1), inView: r.bottom > 0 && r.top < innerHeight, total, top: r.top};
    }
    function schedule() { if (!running && !dead) { running = true; last = 0; requestAnimationFrame(tick); } }
    function tick(t) {
      if (dead) { running = false; return; }
      const m = measure(); target = m.p * (N - 1);
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016; last = t;
      const k = 1 - Math.exp(-dt / 0.07);
      cur += (target - cur) * k;
      if (Math.abs(target - cur) < 0.004) cur = target;
      if (m.inView || !firstDrawn) paint();
      ui(cur / (N - 1), m.inView);
      if (cur !== target) requestAnimationFrame(tick); else running = false;
    }
    const onScroll = () => schedule();
    const onResize = () => resize();
    addEventListener('scroll', onScroll, {passive: true});
    addEventListener('resize', onResize);
    portraitMQ.addEventListener && portraitMQ.addEventListener('change', resize);
    if (skip) skip.addEventListener('click', () => {
      const hero = root.nextElementSibling, hh = (document.getElementById('hdr') || {}).offsetHeight || 0;
      const to = hero ? hero.getBoundingClientRect().top + scrollY - hh : root.getBoundingClientRect().bottom + scrollY;
      scrollTo({top: Math.round(to), behavior: 'smooth'});
    });
    resize();
    return {
      root,
      jump(p) { cur = target = p * (N - 1); paint(); ui(p, true); },
      state() { return {cur, target, loaded: ok.filter(Boolean).length, N, set, firstDrawn}; },
      destroy() { dead = true; removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); document.body.classList.remove('jar-on'); }
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
    const r = document.getElementById('jar-story'), hero = r && r.nextElementSibling;
    if (!r || !hero || !r.offsetHeight) return 0;
    return Math.max(0, Math.round(hero.getBoundingClientRect().top + scrollY - ((document.getElementById('hdr') || {}).offsetHeight || 0)));
  };

  /* подключаемся к инициализации страницы: при первой загрузке и после подмены содержимого (автономная сборка/переходы) */
  const prev = A.initPage;
  A.initPage = function (r) { if (prev) prev.apply(this, arguments); init(); };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
