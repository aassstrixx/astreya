/* ГОТОВЫЙ ФАЙЛ: собран tools/build-detail.js из src/detail/shared.js и src/detail/<страница>.js — не правьте вручную */
/* Общая часть страниц «Товар», «Бренд», «Событие» (страницы v2): прозрачная шапка над кадром, липкая панель, свет и предметы следят за курсором.
   Исходник: src/detail/shared.js; в js/pg-product.js, js/pg-brand.js, js/pg-event.js попадает сборкой node tools/build-detail.js.
   Без утечек при переходах без перезагрузки: слушатели окна — один раз за жизнь страницы, остальное — на элементах текущей страницы. Двигаются только transform/translate/opacity. */
(function () {
  'use strict';
  const A = window.Astreya = window.Astreya || {}; A.pages = A.pages || {};
  if (A.detail) return;
  const $ = (s, r) => (r || document).querySelector(s), html = document.documentElement;
  const still = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = A.detail = {};

  /* шапка прозрачна, пока под ней кадр: класс на <html>; страницы без кадра его снимают */
  let raf = 0;
  const top = D.top = () => { raf = 0; const st = $('.dt-stage'); html.classList.toggle('pg-top', !!st && st.getBoundingClientRect().bottom > 96); };
  const kick = () => { if (!raf) raf = requestAnimationFrame(top); };
  window.addEventListener('scroll', kick, {passive: true}); window.addEventListener('resize', kick, {passive: true});
  document.addEventListener('astreya:page', () => setTimeout(top, 60));

  /* липкая панель встаёт под шапку, пока шапка видна (при прокрутке вверх), и поднимается к краю, когда шапка ушла (класс .hide ставит js/motion.js) */
  let curBar = null, hmo = null;
  const sync = () => { const h = $('#hdr'); if (curBar && curBar.isConnected && h) curBar.style.top = (h.classList.contains('hide') ? 0 : h.offsetHeight) + 'px'; };
  const watchHdr = () => { const h = $('#hdr'); if (hmo || !h || !('MutationObserver' in window)) return; hmo = new MutationObserver(sync); hmo.observe(h, {attributes: true, attributeFilter: ['class']}); window.addEventListener('resize', sync, {passive: true}); };

  D.init = function (root) {
    root = root || document;
    const stage = $('.dt-stage', root); top(); if (!stage) return null;

    /* липкая панель: когда табличка ушла вверх за край экрана — сверху появляется название и кнопка запроса */
    const bar = $('[data-dt-bar]', root); curBar = bar; watchHdr(); sync();
    const plaque = $('.dt-plaque, .dt-ticket', stage);
    if (bar && plaque && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        const on = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        bar.classList.toggle('is-on', on); bar.setAttribute('aria-hidden', on ? 'false' : 'true');
      }), {threshold: 0});
      io.observe(plaque);
    }

    /* свет и предметы следят за курсором: лёгкий сдвиг (--mx, --my от −1 до 1) и тёплый блик по кадру (только мышь; при «меньше движения» — нет) */
    const view = $('.dt-view', stage), glint = $('.dt-glint', stage);
    if (view && !still() && window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches) {
      let pr = 0, tx = 0, ty = 0, gx = 0, gy = 0, w = 1, h = 1, x0 = 0, y0 = 0;
      const tick = () => {
        pr = 0; gx += (tx - gx) * .14; gy += (ty - gy) * .14;
        if (glint) glint.style.transform = 'translate3d(' + (gx - glint.offsetWidth / 2).toFixed(1) + 'px,' + (gy - glint.offsetHeight / 2).toFixed(1) + 'px,0)';
        stage.style.setProperty('--mx', ((gx / w - .5) * 2).toFixed(3)); stage.style.setProperty('--my', ((gy / h - .5) * 2).toFixed(3));
        if (Math.abs(tx - gx) > .6 || Math.abs(ty - gy) > .6) pr = requestAnimationFrame(tick);
      };
      view.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; const r = view.getBoundingClientRect(); w = r.width; h = r.height; x0 = r.left; y0 = r.top; stage.classList.add('is-lit'); });
      view.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; tx = e.clientX - x0; ty = e.clientY - y0; if (!pr) pr = requestAnimationFrame(tick); }, {passive: true});
      view.addEventListener('pointerleave', () => { stage.classList.remove('is-lit'); tx = w / 2; ty = h / 2; if (!pr) pr = requestAnimationFrame(tick); });
    }
    return stage;
  };
})();

(function () {
  'use strict';
  const A = window.Astreya; if (!A || !A.detail) return;
  /* js/pages.js уже вешает на страницу мероприятия «прошло» (прячет запись) — это сохраняем и добавляем общую часть */
  const prev = A.pages.event;
  if (prev && prev.__dt) return;
  const fn = A.pages.event = function (root) {
    if (prev) prev.apply(this, arguments);
    A.detail.init(root);
    const w = document.querySelector('[data-event]'), bar = document.querySelector('[data-dt-bar]');
    /* «Как проходит запись» вставляется js/sales-pages.js после #e-cta — переносим под программу (узел тот же: обработчики на документе) */
    const slot = document.querySelector('[data-dt-ticket-slot]');
    if (slot && w) {
      const move = () => { const t = w.querySelector('.sx-ticket'); if (t && t.parentNode !== slot) slot.appendChild(t); return !!t; };
      if (!move() && 'MutationObserver' in window) { const mo = new MutationObserver(() => { if (move()) mo.disconnect(); }); mo.observe(w, {childList: true, subtree: true}); setTimeout(() => mo.disconnect(), 12000); }
    }
    if (w && bar && w.getAttribute('data-date') < new Date().toISOString().slice(0, 10)) bar.remove();   // прошедшее: липкой кнопки записи нет
  };
  fn.__dt = true;
})();
