/* house.js — ASTREYA HOUSE: навигация по дому и журнал (подключается вместе с css/house.css, когда главная собрана как дом: <section class="arch-story is-house">).
   • Два равноправных пути к комнатам — проходы и меню в зале, журнал на столике — ведут в одну функцию go(): мягкая «вуаль света», переход к комнате, арка раскрывается; адрес #room-… и история браузера.
   • Журнал — настоящий интерфейс: листы с перелистыванием (ПК), одна страница и свайп (телефон), клавиатура, оглавление, закрытие, возврат фокуса.
   • Прежние якоря главной (#solutions, #brands-gallery, #training-block, #home-events, #how-to-start, #start-path, #hb-strip) работают и открывают нужную комнату.
   Страница прокручивается всегда: никакого scroll-lock (кроме открытого журнала-диалога). Всё содержимое — настоящий HTML; без JS комнаты — обычные секции подряд. */
(function () {
  'use strict';
  const A = window.Astreya = window.Astreya || {};
  const root = document.documentElement;
  const story = document.getElementById('arch-story');
  if (!story || !story.classList.contains('is-house')) return;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const track = (n, p) => { try { (A.track || function () {})(n, p || {}); } catch (e) {} };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('lite');
  const phone = () => matchMedia('(max-width:700px)').matches;

  /* без анимации (уменьшенное движение, «лёгкий режим»): вместо закреплённой сцены — готовый кадр зала; движок кадров выключаем */
  function setStatic() {
    if (story.classList.contains('is-static')) return;
    story.classList.add('is-static');
    try { if (A.jar && A.jar.arch && A.jar.arch.destroy) A.jar.arch.destroy(); } catch (e) {}
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('lite')) setStatic();
  else if ('MutationObserver' in window) { const mo = new MutationObserver(() => { if (root.classList.contains('lite')) { setStatic(); mo.disconnect(); } }); mo.observe(root, {attributes: true, attributeFilter: ['class']}); }

  const rooms = $$('.room'), ids = rooms.map(r => r.getAttribute('data-room'));
  const veil = $('.house-veil'), nav = $('.house-nav'), mag = $('#mag');
  const LEGACY = {'start-path': 'partners', 'how-to-start': 'partners', 'brands-gallery': 'brands', 'hb-strip': 'brands', solutions: 'finder', 'training-block': 'academy', 'home-events': 'academy', 'expertise-block': 'expertise'};

  /* ---------- положение зала и перемещение ---------- */
  const abs = el => el.getBoundingClientRect().top + window.pageYOffset;
  const hallY = () => story.classList.contains('is-static') || story.classList.contains('jar-off') ? Math.max(0, abs(story)) : Math.max(0, abs(story) + story.offsetHeight - window.innerHeight);       // конец закреплённой сцены: герой стоит в готовом кадре зала
  const jump = y => window.scrollTo({top: Math.round(y), behavior: 'instant'});                // «instant» — мимо html{scroll-behavior:smooth}: никакого пролёта мимо чужих комнат
  const afterPaint = fn => requestAnimationFrame(() => requestAnimationFrame(fn));
  let veilTimer = 0;
  function through(fn, quick) {
    if (reduce() || quick || !veil) { fn(); return; }
    clearTimeout(veilTimer); veil.classList.add('on');
    veilTimer = setTimeout(() => { fn(); afterPaint(() => { veil.classList.remove('on'); }); }, 240);
  }

  /* ---------- комнаты ---------- */
  let current = null;
  function arrive(room) {
    room.classList.remove('is-arriving'); void room.offsetWidth; room.classList.add('is-arriving');
    setTimeout(() => room.classList.remove('is-arriving'), 1300);
    room.setAttribute('tabindex', '-1'); try { room.focus({preventScroll: true}); } catch (e) {}
  }
  function go(id, o) {
    o = o || {};
    const room = document.getElementById('room-' + id); if (!room) return;
    loadRoomImg(room);
    if (mag && mag.classList.contains('is-open')) closeMag({silent: true, noFocus: true});
    through(() => {
      const target = o.el && room.contains(o.el) ? o.el : room;
      jump(abs(target) - (target === room ? 0 : 90));
      arrive(room); current = id; markNav(id);
    }, o.instant);
    if (!o.fromHash) { try { history.pushState({house: id}, '', '#room-' + id); } catch (e) {} }
    track('house_room', {room: id, via: o.via || 'link'});
  }
  function hall(o) {
    o = o || {};
    if (mag && mag.classList.contains('is-open')) closeMag({silent: true, noFocus: true});
    through(() => {
      jump(hallY()); current = null; markNav(null);
      const f = $('.mag-prev'); if (f) setTimeout(() => { try { f.focus({preventScroll: true}); } catch (e) {} }, 60);
    }, o.instant);
    if (!o.fromHash) { try { history.pushState({house: 'hall'}, '', '#hall'); } catch (e) {} }
    track('house_hall', {via: o.via || 'link'});
  }
  function markNav(id) {
    $$('.hn-rooms a').forEach(a => { if (a.getAttribute('data-house-go') === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  }

  /* ---------- фоны комнат (рендеры интерьеров) подгружаются, когда комната приближается к экрану ---------- */
  function loadRoomImg(room) {
    const src = room.getAttribute('data-img'); if (!src || room.getAttribute('data-img-on')) return;
    room.setAttribute('data-img-on', '1');
    const im = new Image(); im.onload = () => { room.style.setProperty('--room-img', 'url("' + src + '")'); room.classList.add('has-img'); }; im.onerror = () => { room.removeAttribute('data-img-on'); }; im.decoding = 'async'; im.src = src;
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { loadRoomImg(e.target); io.unobserve(e.target); } }), {rootMargin: '120% 0px'});
    rooms.forEach(r => io.observe(r));
  } else { rooms.forEach(loadRoomImg); }

  /* ---------- плавающая навигация: появляется, когда зал ушёл из кадра ---------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.pageYOffset, past = y > hallY() + window.innerHeight * 0.3;
      if (nav) nav.classList.toggle('is-off', !past || !!(mag && mag.classList.contains('is-open')));
      let best = null, mid = window.innerHeight * 0.4;
      rooms.forEach(r => { const b = r.getBoundingClientRect(); if (b.top <= mid && b.bottom > mid) best = r.getAttribute('data-room'); });
      if (best !== current) { current = best; markNav(best); }
    });
  }
  addEventListener('scroll', onScroll, {passive: true}); addEventListener('resize', onScroll, {passive: true});

  /* ---------- журнал ---------- */
  const book = mag && $('.mag-book', mag), leaves = mag ? $$('.leaf', mag) : [], N = leaves.length;
  const stEl = mag && $('.mag-st', mag), wrap = mag && $('.mag-wrap', mag), pvB = mag && $('.mag-pv', mag), nxB = mag && $('.mag-nx', mag), scroller = mag && $('.leaves', mag);
  let s = 1, lastFocus = null, magOpen = false;
  const clampS = v => Math.max(0, Math.min(N, v));
  const inertOf = (el, on) => { if ('inert' in el) el.inert = on; else $$('a,button', el).forEach(f => { if (on) f.setAttribute('tabindex', '-1'); else f.removeAttribute('tabindex'); }); el.setAttribute('aria-hidden', on ? 'true' : 'false'); };

  function render(v, o) {
    o = o || {}; s = clampS(v);
    if (!book) return;
    leaves.forEach((l, k) => {
      l.classList.toggle('is-flipped', k < s);
      const front = $('.front', l), back = $('.back', l);
      inertOf(front, !(k === s));                       // справа видна лицевая сторона листа s
      inertOf(back, !(k === s - 1));                    // слева — оборот листа s−1
    });
    book.setAttribute('data-s', String(s)); book.setAttribute('data-end', s === N ? '1' : '0');
    if (stEl) stEl.textContent = s === 0 ? 'Обложка' : s === N ? 'Конец' : 'Страницы ' + (2 * s) + '–' + (2 * s + 1);
    if (pvB) pvB.disabled = s === 0; if (nxB) nxB.disabled = s === N;
    if (phone() && scroller && !o.noScroll) { const p = s === 0 ? 0 : 2 * s - 1, w = scroller.clientWidth; scroller.scrollTo({left: p * w, behavior: o.instant || reduce() ? 'instant' : 'smooth'}); }
    if (magOpen && !o.silent) { try { history.replaceState(history.state, '', '#magazine/' + s); } catch (e) {} }
  }
  const step = d => { render(s + d); track('house_magazine_flip', {page: s}); };
  const stateOfRoom = id => { const i = ids.indexOf(id); return i < 0 ? 1 : i + 2; };

  function openMag(o) {
    o = o || {}; if (!mag || magOpen) return;
    lastFocus = document.activeElement; magOpen = true;
    mag.hidden = false; render(o.s === undefined ? 1 : o.s, {instant: true, silent: true});
    root.classList.add('mag-lock');
    /* FLIP: журнал вырастает из разворота на столике */
    const src = $('.mag-prev-b'), phoneMode = phone();
    if (wrap) { wrap.style.transition = 'none'; wrap.style.transform = ''; wrap.style.opacity = ''; }
    if (src && wrap && !reduce() && !phoneMode && o.from === 'table') {
      const a = src.getBoundingClientRect(), b = book.getBoundingClientRect();
      if (b.width > 0 && a.width > 0) {
        const k = a.width / b.width, dx = (a.left + a.width / 2) - (b.left + b.width / 2), dy = (a.top + a.height / 2) - (b.top + b.height / 2);
        wrap.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + k.toFixed(3) + ') rotateX(58deg)'; wrap.style.opacity = '.3';
      }
    }
    void mag.offsetWidth;
    afterPaint(() => { if (wrap) { wrap.style.transition = 'transform .85s cubic-bezier(.2,.7,.2,1),opacity .6s ease'; wrap.style.transform = ''; wrap.style.opacity = ''; } mag.classList.add('is-open'); });
    try { if (!o.fromHash) history.pushState({mag: s}, '', '#magazine/' + s); } catch (e) {}
    setTimeout(() => { if (magOpen && book) try { book.focus({preventScroll: true}); } catch (e) {} }, 120);
    onScroll(); track('house_magazine_open', {from: o.from || 'link', page: s});
  }
  function closeMag(o) {
    o = o || {}; if (!mag || !magOpen) return; magOpen = false;
    mag.classList.remove('is-open'); root.classList.remove('mag-lock');
    setTimeout(() => { if (!magOpen) mag.hidden = true; }, reduce() ? 0 : 480);
    if (!o.noFocus && lastFocus && lastFocus.focus) { try { lastFocus.focus({preventScroll: true}); } catch (e) {} }
    if (!o.silent) { try { if (history.state && history.state.mag !== undefined) history.back(); else history.replaceState(history.state, '', location.pathname + location.search + (current ? '#room-' + current : '#hall')); } catch (e) {} }
    onScroll();
  }

  /* ---------- события: клики, клавиатура, свайп ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-house-go],[data-house-hall],[data-house-mag],[data-mag-close],[data-mag-page],[data-mag-step]'); if (!t) return;
    if (t.hasAttribute('data-mag-step')) { e.preventDefault(); step(parseInt(t.getAttribute('data-mag-step'), 10)); return; }
    if (t.hasAttribute('data-mag-page')) { e.preventDefault(); render(parseInt(t.getAttribute('data-mag-page'), 10)); return; }
    if (t.hasAttribute('data-house-go')) {
      e.preventDefault(); const via = t.closest('.mag') ? 'magazine' : t.closest('.hall-door') ? 'door' : t.closest('.hn-rooms') ? 'menu' : t.closest('.room-door') ? 'doorway' : t.closest('.hall-rooms') ? 'hall-list' : 'nav';
      if (t.hasAttribute('data-mag-close')) closeMag({silent: true, noFocus: true});
      go(t.getAttribute('data-house-go'), {via}); return;
    }
    if (t.hasAttribute('data-mag-close')) { e.preventDefault(); closeMag(); return; }
    if (t.hasAttribute('data-house-hall')) { e.preventDefault(); hall({via: t.closest('.house-nav') ? 'menu' : 'room'}); return; }
    if (t.hasAttribute('data-house-mag')) {
      e.preventDefault(); const rid = t.getAttribute('data-mag-room');
      openMag({s: rid ? stateOfRoom(rid) : 1, from: t.classList.contains('mag-prev') ? 'table' : rid ? 'room' : 'menu'});
    }
  });
  document.addEventListener('keydown', e => {
    if (!magOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMag(); return; }
    const tag = (e.target && e.target.tagName) || '';
    if (e.key === 'Tab' && wrap) {                                   // фокус не уходит из диалога
      const f = $$('a[href],button:not([disabled])', wrap).filter(x => !x.closest('[aria-hidden="true"]') && x.offsetParent !== null);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || !wrap.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); render(0); }
    else if (e.key === 'End') { e.preventDefault(); render(N); }
  });
  if (book) {
    let x0 = null, y0 = 0, t0 = 0;
    book.addEventListener('pointerdown', e => { if (phone()) return; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); });
    book.addEventListener('pointerup', e => {
      if (phone() || x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { step(dx < 0 ? 1 : -1); return; }       // свайп/протяжка мышью
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() - t0 < 600 && !(e.target.closest && e.target.closest('a,button'))) {       // клик по краю страницы
        const b = book.getBoundingClientRect(), x = (e.clientX - b.left) / b.width;
        if (x > 0.7 && s < N) step(1); else if (x < 0.3 && s > 0) step(-1);
      }
    });
    book.addEventListener('pointermove', e => {
      if (phone()) return; const b = book.getBoundingClientRect(), x = (e.clientX - b.left) / b.width;
      book.setAttribute('data-hover', x > 0.7 && s < N ? 'r' : x < 0.3 && s > 0 ? 'l' : '');
    });
    book.addEventListener('pointerleave', () => book.removeAttribute('data-hover'));
    if (scroller) {                                                   // телефон: свайп — это прокрутка ленты страниц; номер страницы следует за ней
      let st = 0;
      scroller.addEventListener('scroll', () => {
        if (!phone()) return; clearTimeout(st);
        st = setTimeout(() => { const p = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth)), v = p === 0 ? 0 : Math.ceil(p / 2); if (v !== s) render(v, {noScroll: true}); }, 90);
      }, {passive: true});
    }
  }

  /* ---------- адрес: #room-…, #hall, #magazine/N и прежние якоря ---------- */
  function applyHash(initial) {
    const h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!h) { if (mag && magOpen) closeMag({silent: true}); return; }
    if (h === 'hall') { if (!initial && current === null && Math.abs(window.pageYOffset - hallY()) < 60) return; hall({fromHash: true, instant: initial}); return; }
    let m = /^room-([a-z]+)$/.exec(h);
    if (m && ids.indexOf(m[1]) >= 0) { if (!initial && current === m[1]) return; go(m[1], {fromHash: true, instant: initial, via: 'url'}); return; }
    m = /^magazine(?:\/(\d+))?$/.exec(h);
    if (m) { openMag({s: m[1] === undefined ? 1 : parseInt(m[1], 10), fromHash: true, from: 'url'}); return; }
    if (LEGACY[h]) { const el = document.getElementById(h); go(LEGACY[h], {fromHash: true, instant: true, el, via: 'anchor'}); }
  }
  addEventListener('popstate', () => { if (magOpen && !/^#magazine/.test(location.hash)) { closeMag({silent: true}); } applyHash(false); });
  addEventListener('hashchange', () => { /* переходы по ссылкам-якорям вне нашей истории */ });
  if (location.hash) addEventListener('load', () => setTimeout(() => applyHash(true), 350));
  render(1, {instant: true, silent: true, noScroll: true}); onScroll();

  A.house = {go: id => go(id, {via: 'api'}), hall: () => hall({via: 'api'}), openMagazine: p => openMag({s: p, from: 'api'}), closeMagazine: () => closeMag(), state: () => ({room: current, magazine: magOpen, page: s, rooms: ids})};
})();
