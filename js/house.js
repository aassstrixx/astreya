/* house.js — ASTREYA HOUSE: журнал после зала (подключается вместе с css/house.css, когда главная собрана как дом: <section class="arch-story is-house">).
   • После зала идёт только журнал (комнаты — его страницы). Он стоит в закреплённой сцене: прокрутка вниз сначала «подъезжает» к журналу на столике, раскрывает обложку, а дальше листает
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
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('lite');
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
      if (book) book.style.setProperty('--bx', (-.5 * (1 - Math.min(1, v))).toFixed(3));       // закрытый журнал стоит по центру, раскрытый — разворотом
      const ns = Math.round(v);
      if (ns !== s || !book.hasAttribute('data-s')) setS(ns);
    }
    function setS(ns) {
      s = ns;
      leaves.forEach((l, k) => { inertOf($('.front', l), !(k === s)); inertOf($('.back', l), !(k === s - 1)); });         // справа читается лицевая сторона листа s, слева — оборот листа s−1
      book.setAttribute('data-s', String(s));
      if (stEl) stEl.textContent = s === 0 ? 'Обложка' : s >= N - 1 ? 'Контакты' : 'Страницы ' + (2 * s) + '–' + (2 * s + 1);
      if (pvB) pvB.disabled = s === 0; if (nxB) nxB.disabled = s >= N - 1;
      const r = roomOfState(s); if (r !== current) { current = r; }
    }
    function render(v, o) {                                                    // мгновенно: телефон, «без анимации», запасные случаи
      o = o || {}; setP(clamp(v, 0, N - 1));
      if (phone() && scroller && !o.noScroll) { const q = s === 0 ? 0 : 2 * s - 1, w = scroller.clientWidth; scroller.scrollTo({left: q * w, behavior: o.instant || reduce() ? 'instant' : 'smooth'}); }
    }

    /* ---------- читалка: состояние журнала задаёт прокрутка ---------- */
    const RD = {open: .26, from: .28, span: .68};                               // доли пути сцены: журнал вырастает до .26, обложка раскрывается с .28, дальше разворот за разворотом до .96
    const WIN = [.14, .86];                                                    // окно поворота внутри отрезка одного разворота (остальное — страница стоит и читается)
    const ease = x => x * x * (3 - 2 * x);
    const pOf = t => {
      if (t <= RD.from) return 0; if (t >= RD.from + RD.span) return N - 1;
      const q = (t - RD.from) / RD.span * (N - 1), j = Math.floor(q), u = q - j;
      return j + ease(clamp((u - WIN[0]) / (WIN[1] - WIN[0]), 0, 1));
    };
    function readerUpdate() {
      if (flat()) { reader.classList.add('is-flat'); reader.style.setProperty('--ra', '1'); if (s === 0 && p === 0) render(1, {instant: true, noScroll: true}); return; }
      reader.classList.remove('is-flat');
      const t = readerT(), open = phone() ? .5 : RD.open, ra = ease(clamp(t / open, 0, 1));
      reader.style.setProperty('--ra', ra.toFixed(4));
      if (phone()) { const target = ra > .94 ? Math.max(s, 1) : 0; if (target !== s && !(s > 0 && target > 0)) render(target, {noScroll: target === 0, instant: true}); return; }
      setP(pOf(t));
    }
    function toState(v, o) {                                                   // прокрутить страницу так, чтобы журнал стоял на развороте v
      v = clamp(v, 0, N - 1); const b = readerBox();
      const t = v === 0 ? .06 : RD.from + v / (N - 1) * RD.span, y = Math.round(b.top + b.total * t);
      const far = Math.abs(y - window.pageYOffset) > window.innerHeight * 3.2;
      window.scrollTo({top: y, behavior: (o && o.instant) || reduce() || far ? 'instant' : 'smooth'});
    }
    const step = d => { track('house_magazine_flip', {page: s + d}); if (flat() || phone()) render(s + d); else toState(s + d); };

    function go(id, o) {                                                       // к развороту комнаты: те же адреса #room-…, что и раньше
      o = o || {}; const v = stateOfRoom(id);
      if (flat() || phone()) { jump(readerBox().top); render(v, {instant: true}); } else toState(v, {instant: o.instant});
      if (!o.fromHash) { try { history.replaceState(history.state, '', '#room-' + id); } catch (e) {} }
      track('house_room', {room: id, via: o.via || 'link'});
    }
    function hall(o) {
      o = o || {};
      jump(hallY());
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
        e.preventDefault(); track('house_magazine_open', {from: 'table', page: 1});
        if (flat()) { jump(readerBox().top); render(1, {instant: true, noScroll: true}); } else if (phone()) { jump(readerBox().top + readerBox().total * .6); } else toState(1);
      }
    });
    on(mag, 'keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') { e.preventDefault(); if (flat() || phone()) render(0); else toState(0); }
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
    setS(0); setP(0); readerUpdate();

    A.house = {go: id => go(id, {via: 'api'}), hall: () => hall({via: 'api'}), openMagazine: v => { if (flat() || phone()) { jump(readerBox().top); render(v === undefined ? 1 : v, {instant: true}); } else toState(v === undefined ? 1 : v); }, state: () => ({room: current, magazine: true, page: s, rooms: ids, reader: true}), readerState: () => ({t: readerT(), s, p})};
  }

  init();
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
