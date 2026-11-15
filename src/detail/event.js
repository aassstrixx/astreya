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
