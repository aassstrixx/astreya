/* house.js — ASTREYA HOUSE: журнал после зала (подключается вместе с css/house.css, когда главная собрана как дом: <section class="arch-story is-house">).
   • После зала идёт только журнал (комнаты — его страницы). Он стоит в закреплённой сцене: прокрутка вниз — настоящий пролёт камеры от зала к журналу на столике (кадры Blender, tools/jar-render/hall_table.py flight);
     камера встаёт над журналом, живой журнал проявляется ровно поверх нарисованного, дальше прокрутка листает
     страницы — каждый лист поворачивается вслед за прокруткой (не по щелчку), посередине разворота страница стоит и читается. Кнопки «Назад/Далее», оглавление, клавиатура, свайп и прежние
     адреса (#room-…, #magazine/N, #hall, старые якоря главной) просто прокручивают к нужному развороту: прокрутка страницы не блокируется никогда.
   • Телефон: одна страница на экране, листаем пальцем (scroll-snap). Без анимации (prefers-reduced-motion, «лёгкий режим»): обычный экран с раскрытым журналом, листание кнопками.
   • Без JS страницы журнала идут подряд (обычные блоки), ссылки #room-… ведут на нужную страницу. Всё содержимое — настоящий HTML. */
(function () {
  'use strict';
  const A = window.Astreya = window.Astreya || {};
  const root = document.documentElement;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const track = (n, p) => { try { (A.track || function () {})(n, p || {}); } catch (e) {} };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce) and (min-width: 100000px)').matches;                // только системная настройка «уменьшить движение»; автоматический «лёгкий режим» (html.lite, FPS < 30) пролёт и листание не отключает
  const phone = () => matchMedia('(max-width:700px)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let off = [];                                                    // отписка от прошлой страницы: переходы без перезагрузки подменяют #main, а скрипт остаётся

  function init() {
    off.forEach(f => { try { f(); } catch (e) {} }); off = [];
    const story = document.getElementById('arch-story');
    if (!story || !story.classList.contains('is-house')) return;
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
    const reader = $('#house-reader'), mag = $('#mag');
    if (!reader || !mag) return;

    const book = $('.mag-book', mag), leaves = $$('.leaf', mag), N = leaves.length;
    const stEl = $('.mag-st', mag), pvB = $('.mag-pv', mag), nxB = $('.mag-nx', mag), scroller = $('.leaves', mag);
    const ids = $$('.pg-r[data-room]', mag).map(el => el.getAttribute('data-room'));            // комнаты в порядке страниц журнала
    const LEGACY = {'start-path': 'partners', 'how-to-start': 'partners', 'brands-gallery': 'brands', 'hb-strip': 'brands', solutions: 'finder', 'training-block': 'academy', 'home-events': 'academy', 'expertise-block': 'expertise'};
    const stateOfRoom = id => { const i = ids.indexOf(id); return i < 0 ? 1 : i + 2; };         // разворот комнаты: лист i+2 лицом, обратная сторона предыдущего — слева
    const roomOfState = v => (v >= 2 && v - 2 < ids.length) ? ids[v - 2] : null;

    /* ---------- положение страницы ---------- */
    const abs = el => el.getBoundingClientRect().top + window.pageYOffset;
    const hallY = () => story.classList.contains('jar-off') ? Math.max(0, abs(story)) : Math.max(0, abs(story) + story.offsetHeight - window.innerHeight);       // конец закреплённой сцены: герой стоит в готовом кадре зала
    const jump = y => window.scrollTo({top: Math.round(y), behavior: 'instant'});                // «instant» — мимо html{scroll-behavior:smooth}
    const readerBox = () => { const r = reader.getBoundingClientRect(); return {top: r.top + window.pageYOffset, total: Math.max(0, r.height - window.innerHeight)}; };
    const readerT = () => { const r = reader.getBoundingClientRect(), tot = r.height - window.innerHeight; return tot > 0 ? clamp(-r.top / tot, 0, 1) : 1; };
    const flat = () => reduce() || reader.classList.contains('is-flat');

    /* ---------- журнал: p — «сколько листов перевёрнуто» (дробное — лист в движении); s — ближайший целый разворот ---------- */
    let s = 0, p = 0, current = null;
    const inertOf = (el, onn) => { if ('inert' in el) el.inert = onn; else $$('a,button', el).forEach(f => { if (onn) f.setAttribute('tabindex', '-1'); else f.removeAttribute('tabindex'); }); el.setAttribute('aria-hidden', onn ? 'true' : 'false'); };
    const fs = leaves.map(() => -1);
    function setP(v) {
      v = clamp(v, 0, N - 1); p = v;
      leaves.forEach((l, k) => {
        const f = clamp(v - k, 0, 1), q = Math.round(f * 1000) / 1000;
        if (q === fs[k]) return; fs[k] = q;
        l.style.setProperty('--f', q.toFixed(3));
        l.style.setProperty('--lt', Math.sin(Math.PI * q).toFixed(3));                       // «подъём» листа в движении: тень и приподнятость
        l.classList.toggle('is-flipped', q > .5);
        l.classList.toggle('is-turning', q > 0 && q < 1);
      });
      { let sr = 0, sl = 0;                                                                   // тень поднятого листа на страницу под ним: пока лист стоит над правой стопкой — на правую, за серединой — на левую
        for (let k = 0; k < N; k++) { const f = clamp(v - k, 0, 1); if (f > 0 && f < 1) { const lt = Math.sin(Math.PI * f); sr = Math.max(sr, lt * clamp((.64 - f) / .3, 0, 1)); sl = Math.max(sl, lt * clamp((f - .36) / .3, 0, 1)); } }
        if (scroller) { scroller.style.setProperty('--sr', sr.toFixed(3)); scroller.style.setProperty('--sl', sl.toFixed(3)); } }
      if (book) book.style.setProperty('--bx', (-.5 * (1 - Math.min(1, v))).toFixed(3));       // закрытый журнал стоит по центру, раскрытый — разворотом
      const ns = Math.round(v);
      if (ns !== s || !book.hasAttribute('data-s')) setS(ns);
    }
    function setS(ns) {
      s = ns;
      leaves.forEach((l, k) => { inertOf($('.front', l), !(k === s)); inertOf($('.back', l), !(k === s - 1)); });         // справа читается лицевая сторона листа s, слева — оборот листа s−1
      book.setAttribute('data-s', String(s));
      if (stEl) stEl.textContent = s === 0 ? 'Обложка' : s >= N - 1 ? 'Контакты' : 'Страницы ' + (2 * s) + '–' + (2 * s + 1);
      if (pvB) pvB.disabled = s <= 1 && !phone() && !flat(); if (nxB) nxB.disabled = s >= N - 1;
      const r = roomOfState(s); if (r !== current) { current = r; }
    }
    function render(v, o) {                                                    // мгновенно: телефон, «без анимации», запасные случаи
      o = o || {}; setP(clamp(v, 0, N - 1));
      if (phone() && scroller && !o.noScroll) { const q = s === 0 ? 0 : 2 * s - 1, w = scroller.clientWidth; scroller.scrollTo({left: q * w, behavior: o.instant || reduce() ? 'instant' : 'smooth'}); }
    }

    /* ---------- читалка: состояние журнала задаёт прокрутка ---------- */
    const RD = {open: .30, from: .34, span: .62, hold: .05};          // hold — первые 5 % пути камера стоит: холсты героя гаснут над тем же кадром (баночка не мигает)                               // доли пути сцены: пролёт камеры 0….30, журнал стоит на первом развороте, с .34 разворот за разворотом до .96
    const WIN = [.14, .86];                                                    // окно поворота внутри отрезка одного разворота (остальное — страница стоит и читается)
    const ease = x => x * x * (3 - 2 * x);
    const pOf = t => {
      if (t <= RD.from) return 1; if (t >= RD.from + RD.span) return N - 1;
      const q = (t - RD.from) / RD.span * (N - 2), j = Math.floor(q), u = q - j;
      return 1 + j + ease(clamp((u - WIN[0]) / (WIN[1] - WIN[0]), 0, 1));
    };

    /* ---------- пролёт камеры: кадры от зала к журналу, проигрываются прокруткой ---------- */
    const cvS = $('.hr-seq', reader), poster = $('.hr-bg img', reader);
    let FL = null; try { FL = JSON.parse(reader.getAttribute('data-flight') || 'null'); } catch (e) {}
    let flImgs = [], flLoaded = 0, flStarted = false;
    const flCfg = () => FL ? (phone() ? FL.mobile : FL.desktop) : null;
    function loadFlight() {
      const c = flCfg(); if (flStarted || !c || !cvS || reduce()) return;
      flStarted = true; flImgs = new Array(FL.n + 1); flImgs[0] = poster;       // нулевой кадр — готовый кадр зала (постер)
      const order = []; for (let i = 1; i <= FL.n; i++) order.push(i);
      /* по порядку полёта: кадры нужны ровно в этом порядке; последний — первым (по нему живой журнал совмещается с нарисованным) */
      order.splice(order.indexOf(FL.n), 1); order.unshift(FL.n);                  // последний кадр — первым: по нему живой журнал совмещается с нарисованным
      let k = 0, act = 0; const need = Math.min(FL.n, 6);
      const pump = () => {
        while (act < 4 && k < order.length) {
          const i = order[k++], im = new Image(); act++; im.decoding = 'async';
          im.onload = im.onerror = () => {
            act--;
            if (im.naturalWidth) { flImgs[i] = im; flLoaded++; try { if (im.decode) im.decode().catch(() => {}); } catch (e) {} if (flLoaded === need) { reader.classList.add('has-seq'); } readerUpdate(true); }
            pump();
          };
          im.src = c.dir + String(i).padStart(3, '0') + '.' + (FL.ext || 'webp');
        }
      };
      pump();
    }
    const flNear = (i, dir) => { for (let j = i; j >= 0 && j <= FL.n; j += dir) if (flImgs[j] && (flImgs[j].naturalWidth || flImgs[j].width)) return j; return dir > 0 ? FL.n : 0; };
    const bookBox = () => { const w = $('.mag-wrap', mag); return {x: w.offsetLeft + book.offsetLeft, y: w.offsetTop + book.offsetTop, w: book.offsetWidth, h: book.offsetHeight}; };
    function drawFlight(u) {
      if (!cvS || !reader.classList.contains('has-seq')) return;
      const W = cvS.clientWidth, Hh = cvS.clientHeight, c = flCfg(); if (!W || !Hh || !c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5), cw = Math.round(W * dpr), ch = Math.round(Hh * dpr);
      if (cvS.width !== cw || cvS.height !== ch) { cvS.width = cw; cvS.height = ch; }
      const cx = cvS.getContext('2d'), x = u * FL.n, f = Math.max(0, Math.min(FL.n, Math.round(x))), lo = flNear(f, -1), hi = flNear(f, 1), i0 = (f - lo <= hi - f) ? lo : hi;          // ближайший кадр без смешения: смешение двух кадров «двоило» бы баночку (она ближе всего к камере и сдвигается сильнее всего)
      const fit = im => { const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, k = Math.max(W / iw, Hh / ih); return {iw, ih, k, ox: (W - iw * k) / 2, oy: (Hh - ih * k) / 2}; };
      const draw = (im, al) => { if (!im || !(im.naturalWidth || im.width)) return; const f = fit(im); cx.globalAlpha = al; cx.drawImage(im, f.ox * dpr, f.oy * dpr, f.iw * f.k * dpr, f.ih * f.k * dpr); };
      cx.globalAlpha = 1; cx.clearRect(0, 0, cw, ch); draw(flImgs[i0], 1);
      /* к концу пролёта кадр сдвигается и масштабируется так, чтобы нарисованный журнал лёг ровно на живой (его размер зависит от экрана) */
      const wA = ease(clamp((u - .6) / .4, 0, 1)), last = flImgs[FL.n];                        // (последний кадр нужен для совмещения; пока он не загрузился — совмещения нет)
      if (wA > 0 && last && c.rect && book.offsetWidth) {
        const f = fit(last), r = c.rect, sx = f.ox + r[0] * f.iw * f.k, sy = f.oy + r[1] * f.ih * f.k, sw = (r[2] - r[0]) * f.iw * f.k, sh = (r[3] - r[1]) * f.ih * f.k, b = bookBox();
        const S = 1 + (b.w / sw - 1) * wA, scx = sx + sw / 2, scy = sy + sh / 2;
        cvS.style.transformOrigin = scx.toFixed(1) + 'px ' + scy.toFixed(1) + 'px';
        cvS.style.transform = 'translate(' + ((b.x + b.w / 2 - scx) * wA).toFixed(1) + 'px,' + ((b.y + b.h / 2 - scy) * wA).toFixed(1) + 'px) scale(' + S.toFixed(4) + ')';
      } else cvS.style.transform = '';
    }

    function setLive(live, hf) {                                               // герой и журнал — одна сцена (css/house.css, 3б): читалка встаёт на тот же экран под героем, холсты героя гаснут
      reader.classList.toggle('is-live', live); story.classList.toggle('rd-live', live);
      story.style.setProperty('--hf', hf.toFixed(3)); story.classList.toggle('rd-gone', live && hf >= .985);
      story.style.setProperty('--hy', (live ? Math.max(0, Math.min(window.innerHeight * 1.2, -reader.getBoundingClientRect().top)) : 0).toFixed(1) + 'px');          // холсты героя стоят на месте, пока гаснут: сцена уезжает вверх, а они — вниз на столько же
    }
    function readerUpdate() {
      if (flat()) { reader.classList.add('is-flat'); reader.style.setProperty('--ra', '1'); reader.style.setProperty('--fu', '1'); setLive(false, 0); if (s === 0 && p === 0) render(1, {instant: true, noScroll: true}); return; }
      reader.classList.remove('is-flat');
      const rr = reader.getBoundingClientRect(), t = readerT(), open = phone() ? .5 : RD.open, hold = phone() ? 0 : RD.hold, fu = ease(clamp((t - hold) / (open - hold), 0, 1)), ra = clamp((fu - .86) / .14, 0, 1);
      if (t > 0 && !flStarted) loadFlight();
      if (phone()) setLive(false, 0); else setLive(rr.top < -1, ease(clamp(t / .05, 0, 1)));
      reader.style.setProperty('--fu', fu.toFixed(4)); reader.style.setProperty('--ra', ra.toFixed(4));
      drawFlight(fu);
      if (phone()) { const target = ra > .94 ? Math.max(s, 1) : 0; if (target !== s && !(s > 0 && target > 0)) render(target, {noScroll: target === 0, instant: true}); return; }
      setP(pOf(t));
    }

    /* ---------- автоматический плавный ход страницы: клик по «Откройте журнал», «Далее/Назад», оглавление, список разделов.
       Страницу ведёт одна кривая (rAF, по реальному времени кадра), журнал и камера считаются от прокрутки так же, как при колесе, — лист поворачивается тем же способом ---------- */
    let glideRaf = 0, goal = null;
    const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;           // долгий ход: мягкий старт и мягкая остановка
    const eSoft = x => .5 * x + .5 * x * x * (3 - 2 * x);                                // листание: почти равномерно — лист успевает повернуться на виду
    const glideStop = () => { if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; } goal = null; };
    function glide(y, g) {
      const mx = Math.max(0, document.documentElement.scrollHeight - window.innerHeight); y = Math.round(clamp(y, 0, mx));
      const y0 = window.pageYOffset, dist = y - y0; if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; }
      if (Math.abs(dist) < 2) { goal = null; return; }
      const far = Math.abs(dist) > window.innerHeight * 1.2, dur = clamp(1050 + Math.abs(dist) / window.innerHeight * 330, 1200, 4200), ease = far ? eIO : eSoft; let t0 = 0;
      goal = g === undefined ? null : g;
      const frame = ts => {
        if (!t0) t0 = ts; const k = clamp((ts - t0) / dur, 0, 1);
        window.scrollTo({top: y0 + dist * ease(k), behavior: 'instant'}); readerUpdate();
        if (k < 1) glideRaf = requestAnimationFrame(frame); else { glideRaf = 0; goal = null; window.scrollTo({top: y, behavior: 'instant'}); readerUpdate(); }
      };
      glideRaf = requestAnimationFrame(frame);
    }
    ['wheel', 'touchstart'].forEach(ev => on(window, ev, glideStop, {passive: true}));          // рука на колесе или экране — автоход уступает
    on(window, 'keydown', e => { if (glideRaf && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key) && !(e.target && e.target.closest && e.target.closest('#mag'))) glideStop(); });
    on(window, 'pointerdown', e => { if (e.target === document.documentElement) glideStop(); });         // полоса прокрутки

    function toState(v, o) {                                                   // вести страницу так, чтобы журнал встал на разворот v
      v = clamp(v, 1, N - 1); const b = readerBox();
      const t = v <= 1 ? (RD.open + RD.from) / 2 : RD.from + (v - 1) / (N - 2) * RD.span, y = Math.round(b.top + b.total * t);
      if ((o && o.instant) || reduce()) { glideStop(); jump(y); readerUpdate(); return; }
      glide(y, v);
    }
    const step = d => { const base = goal !== null ? goal : s; track('house_magazine_flip', {page: base + d}); if (flat() || phone()) render(s + d); else toState(base + d); };

    function go(id, o) {                                                       // к развороту комнаты: те же адреса #room-…, что и раньше
      o = o || {}; const v = stateOfRoom(id);
      if (flat() || phone()) { jump(readerBox().top); render(v, {instant: true}); } else toState(v, {instant: o.instant});
      if (!o.fromHash) { try { history.replaceState(history.state, '', '#room-' + id); } catch (e) {} }
      track('house_room', {room: id, via: o.via || 'link'});
    }
    function hall(o) {
      o = o || {};
      glideStop(); jump(hallY());
      const f = $('.mag-prev'); if (f) setTimeout(() => { try { f.focus({preventScroll: true}); } catch (e) {} }, 60);
      if (!o.fromHash) { try { history.replaceState(history.state, '', '#hall'); } catch (e) {} }
      track('house_hall', {via: o.via || 'link'});
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => { ticking = false; readerUpdate(); });
    }
    on(window, 'scroll', onScroll, {passive: true}); on(window, 'resize', onScroll, {passive: true});

    /* ---------- события: клики, клавиатура, свайп ---------- */
    on(document, 'click', e => {
      const t = e.target.closest && e.target.closest('[data-house-go],[data-house-mag],[data-mag-page],[data-mag-step]'); if (!t) return;
      if (t.hasAttribute('data-mag-step')) { e.preventDefault(); step(parseInt(t.getAttribute('data-mag-step'), 10)); return; }
      if (t.hasAttribute('data-mag-page')) { e.preventDefault(); const v = parseInt(t.getAttribute('data-mag-page'), 10); track('house_magazine_toc', {page: v}); if (flat() || phone()) render(v); else toState(v); return; }
      if (t.hasAttribute('data-house-go')) { e.preventDefault(); go(t.getAttribute('data-house-go'), {via: t.closest('.hall-rooms') ? 'hall-list' : 'link'}); return; }
      if (t.hasAttribute('data-house-mag')) {                                                  // журнал на столике: сцена «подъезжает» к нему и раскрывает
        e.preventDefault(); track('house_magazine_open', {from: t.getAttribute('data-from') || 'table', page: 1});
        if (flat()) { jump(readerBox().top); render(1, {instant: true, noScroll: true}); } else if (phone()) { jump(readerBox().top + readerBox().total * .6); } else toState(1);          // ПК: камера сама плавно летит к журналу
      }
    });
    on(mag, 'keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') { e.preventDefault(); if (flat() || phone()) render(0); else toState(1); }
      else if (e.key === 'End') { e.preventDefault(); if (flat() || phone()) render(N - 1); else toState(N - 1); }
    });
    if (book) {
      let x0 = null, y0 = 0, t0 = 0;
      book.addEventListener('pointerdown', e => { if (phone()) return; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); });
      book.addEventListener('pointerup', e => {
        if (phone() || x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { step(dx < 0 ? 1 : -1); return; }       // протяжка мышью
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() - t0 < 600 && !(e.target.closest && e.target.closest('a,button'))) {       // клик по краю страницы
          const b = book.getBoundingClientRect(), x = (e.clientX - b.left) / b.width;
          if (x > 0.7 && s < N - 1) step(1); else if (x < 0.3 && s > 0) step(-1);
        }
      });
      book.addEventListener('pointermove', e => {
        if (phone()) return; const b = book.getBoundingClientRect(), x = (e.clientX - b.left) / b.width;
        book.setAttribute('data-hover', x > 0.7 && s < N - 1 ? 'r' : x < 0.3 && s > 0 ? 'l' : '');
      });
      book.addEventListener('pointerleave', () => book.removeAttribute('data-hover'));
      if (scroller) {                                                   // телефон: свайп — это прокрутка ленты страниц; номер страницы следует за ней
        let st = 0;
        scroller.addEventListener('scroll', () => {
          if (!phone()) return; clearTimeout(st);
          st = setTimeout(() => { const q = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth)), v = q === 0 ? 0 : Math.ceil(q / 2); if (v !== s) render(v, {noScroll: true}); }, 90);
        }, {passive: true});
      }
    }

    /* ---------- адрес: #room-…, #hall, #magazine/N и прежние якоря ---------- */
    function applyHash(initial) {
      const h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      if (!h) return;
      if (h === 'hall') { hall({fromHash: true}); return; }
      let m = /^room-([a-z]+)$/.exec(h);
      if (m && ids.indexOf(m[1]) >= 0) { go(m[1], {fromHash: true, instant: initial, via: 'url'}); return; }
      m = /^magazine(?:\/(\d+))?$/.exec(h);
      if (m) { const v = m[1] === undefined ? 1 : parseInt(m[1], 10); if (flat() || phone()) { jump(readerBox().top); render(v, {instant: true}); } else toState(v, {instant: initial}); return; }
      if (LEGACY[h]) go(LEGACY[h], {fromHash: true, instant: true, via: 'anchor'});
    }
    on(window, 'popstate', () => applyHash(false));
    if (location.hash) { const run = () => setTimeout(() => applyHash(true), 350); if (document.readyState === 'complete') run(); else on(window, 'load', run, {once: true}); }
    mag.removeAttribute('hidden');
    if (phone() || flat()) { setS(0); setP(0); } else setP(1);
    readerUpdate(); if ('requestIdleCallback' in window) setTimeout(() => requestIdleCallback(loadFlight), 1800); else setTimeout(loadFlight, 2500);

    A.house = {go: id => go(id, {via: 'api'}), hall: () => hall({via: 'api'}), openMagazine: v => { if (flat() || phone()) { jump(readerBox().top); render(v === undefined ? 1 : v, {instant: true}); } else toState(v === undefined ? 1 : v); }, state: () => ({room: current, magazine: true, page: s, rooms: ids, reader: true}), readerState: () => ({t: readerT(), s, p, flight: {loaded: flLoaded, n: FL ? FL.n : 0}})};
  }

  init();
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
