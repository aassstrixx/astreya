/* redesign.js — поведение слоя доработок (подключается только при site.redesign).
   Сейчас: шаг «Для кого?» в подборщике главной. Работает делегированием событий, поэтому переживает подмену страниц без перезагрузки.
   Используются только реальные данные каталога: у каждой мини-карточки товара есть data-cat; «Домашний уход» — категория home,
   остальные режимы («кабинет») — все остальные категории. */
(function () {
  'use strict';
  function mode() { const on = document.querySelector('#pick-aud .chip.on'); return on ? on.getAttribute('data-mode') : null; }   // null | 'cabinet' | 'home' — из DOM, без хранимого состояния

  function visibleOut() { return document.querySelector('#pick-out .pick-out:not([hidden])'); }

  function apply() {
    const out = visibleOut(); if (!out) return;
    const m = mode(), items = Array.prototype.slice.call(out.querySelectorAll('.mini-p'));
    let shown = 0;
    items.forEach(function (a) {
      const home = a.getAttribute('data-cat') === 'home';
      const ok = !m || (m === 'home' ? home : !home);
      a.hidden = !ok; if (ok) shown++;
    });
    const empty = document.getElementById('pick-empty'); if (empty) empty.hidden = !(m && items.length && !shown);
    // ссылка «Открыть в каталоге»: для домашнего ухода добавляем категорию
    const a = out.querySelector('a[href*="catalog.html?task="]');
    if (a) { const base = a.getAttribute('href').replace(/&cat=home/, ''); a.setAttribute('href', m === 'home' ? base + '&cat=home' : base); }
  }

  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('[data-act="pick-aud"],[data-act="pick-show"],[data-act="pick"]'); if (!t) return;
    const act = t.getAttribute('data-act');
    if (act === 'pick-aud') {
      const was = t.classList.contains('on');
      Array.prototype.forEach.call(document.querySelectorAll('#pick-aud .chip'), function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      if (!was) { t.classList.add('on'); t.setAttribute('aria-pressed', 'true'); }
      apply();
    } else if (act === 'pick-show') {
      apply();
      const out = document.getElementById('pick-out'); if (out) out.scrollIntoView({behavior: 'smooth', block: 'start'});
      if (window.dataLayer) window.dataLayer.push({event: 'picker_show', mode: mode() || 'all'});
    } else {
      setTimeout(apply, 0);                          // сменилась задача — применяем выбранный режим к новой выдаче
    }
  });


  /* «Почему Астрея»: подсветка цифр при скролле — светится номер пункта, ближайшего к центру экрана, пока список на экране */
  let raf = 0;
  function whyLit() {
    const list = document.querySelector('.rd-why-list'); if (!list) return;
    const items = Array.prototype.slice.call(list.querySelectorAll('.rd-why-item')), vh = window.innerHeight, lr = list.getBoundingClientRect();
    let best = null, bd = 1e9;
    if (lr.bottom > 0 && lr.top < vh) items.forEach(function (it) { const r = it.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - vh * 0.5); if (d < bd) { bd = d; best = it; } });
    items.forEach(function (it) { it.classList.toggle('lit', it === best); });
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; whyLit(); }); }
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule);
  addEventListener('load', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
  const mainEl = document.getElementById('main');
  if (mainEl && window.MutationObserver) new MutationObserver(schedule).observe(mainEl, {childList: true});
  schedule();
})();
