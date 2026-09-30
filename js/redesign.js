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

  /* «Решения по задачам»: фото закреплено по центру экрана и не едет вместе с текстом; только плавно появляется/исчезает, пока блок на экране.
     Ширина — от левого края правой колонки до правого края окна. На планшетах и телефонах (≤ 1000 px) — обычное фото под списком. */
  let raf = 0;
  function solPhoto() {
    const f = document.querySelector('.rd-sol-photo'); if (!f) return;
    const sec = f.closest('.rd-solutions'), side = f.closest('.rd-sol-side');
    if (!sec || !side || document.documentElement.clientWidth <= 1000) { f.classList.remove('fx', 'on'); return; }
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, sr = side.getBoundingClientRect(), r = sec.getBoundingClientRect();
    f.classList.add('fx');
    f.style.setProperty('--fx-l', sr.left + 'px');
    f.style.setProperty('--fx-w', Math.max(240, vw - sr.left) + 'px');
    f.classList.toggle('on', r.top < vh * 0.5 && r.bottom > vh * 0.5);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; solPhoto(); }); }
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule);
  addEventListener('load', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
  const mainEl = document.getElementById('main');
  if (mainEl && window.MutationObserver) new MutationObserver(schedule).observe(mainEl, {childList: true});
  schedule();
})();
