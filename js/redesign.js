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


  /* галерея брендов на главной (#hb-strip): стрелки листают ленту на две карточки; стрелка гаснет у края */
  function hbState(s) {
    const prev = document.querySelector('[data-act="hb-prev"]'), next = document.querySelector('[data-act="hb-next"]'); if (!prev || !next) return;
    prev.disabled = s.scrollLeft < 4; next.disabled = s.scrollLeft + s.clientWidth > s.scrollWidth - 4;
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-act="hb-prev"],[data-act="hb-next"]'); if (!b) return;
    const s = document.getElementById('hb-strip'); if (!s) return;
    const c = s.querySelector('.br-card'), step = (c ? c.offsetWidth + 18 : 300) * 2, dir = b.getAttribute('data-act') === 'hb-next' ? 1 : -1;
    s.scrollBy({left: dir * step, behavior: 'smooth'});
  });
  document.addEventListener('scroll', function (e) { if (e.target && e.target.id === 'hb-strip') hbState(e.target); }, true);
  addEventListener('load', function () { const s = document.getElementById('hb-strip'); if (s) hbState(s); });

  /* подбор по задаче на главной (.hp-find-grid): наведение, фокус или первое касание переключает витрину справа; клик по уже выбранной задаче открывает каталог.
     Без JS все задачи — обычные ссылки в каталог, а справа видна первая витрина. */
  function hpActivate(a, count) {
    const root = a.closest('[data-hp-find]'); if (!root || a.classList.contains('on')) return;
    const id = a.getAttribute('data-hp-task');
    Array.prototype.forEach.call(root.querySelectorAll('[data-hp-task]'), function (t) { const on = t === a; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-hp-panel]'), function (p) { p.classList.toggle('on', p.getAttribute('data-hp-panel') === id); });
    if (count && window.Astreya && window.Astreya.track) window.Astreya.track('finder_task', {task: id});          // считаем осознанный выбор (касание, клавиатура), а не каждое проведение мыши
  }
  document.addEventListener('mouseover', function (e) {
    const a = e.target.closest && e.target.closest('[data-hp-task]'); if (a && window.matchMedia && window.matchMedia('(hover:hover)').matches) hpActivate(a);
  });
  document.addEventListener('focusin', function (e) { const a = e.target.closest && e.target.closest('[data-hp-task]'); if (a) hpActivate(a, true); });
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('[data-hp-task]'); if (!a) return;
    if (!a.classList.contains('on')) { e.preventDefault(); hpActivate(a, true); }
  });

  /* «Почему Астрея»: подсветка цифр при скролле — светится номер пункта, ближайшего к центру экрана, пока список на экране.
     Список отслеживает IntersectionObserver: пока он вне экрана (почти всегда), в кадре прокрутки не читается вёрстка и не пишутся стили — раньше getBoundingClientRect
     вызывался в каждом кадре на любой странице и заставлял браузер пересчитывать стили посреди прокрутки. */
  let raf = 0, whyEl, whyVis = false, whyIO = null;
  function whyFind() {
    const list = document.querySelector('.rd-why-list'); if (whyIO) { whyIO.disconnect(); whyIO = null; }
    whyEl = list || null; whyVis = false; if (!list) return;
    if (!('IntersectionObserver' in window)) { whyVis = true; return; }
    whyIO = new IntersectionObserver(function (es) { whyVis = es[es.length - 1].isIntersecting; if (whyVis) schedule(); }, {threshold: 0});
    whyIO.observe(list);
  }
  function whyLit() {
    if (whyEl === undefined || (whyEl && !whyEl.isConnected)) whyFind();
    const list = whyEl; if (!list || !whyVis) return;
    const items = Array.prototype.slice.call(list.querySelectorAll('.rd-why-item')), vh = window.innerHeight, lr = list.getBoundingClientRect();
    let best = null, bd = 1e9;
    if (lr.bottom > 0 && lr.top < vh) items.forEach(function (it) { const r = it.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - vh * 0.5); if (d < bd) { bd = d; best = it; } });
    items.forEach(function (it) { it.classList.toggle('lit', it === best); });
  }
  function schedule() { if (raf || whyEl === null || (whyEl && !whyVis)) return; raf = requestAnimationFrame(function () { raf = 0; whyLit(); }); }          // нет списка или он вне экрана — кадр не заказываем вовсе
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule);
  addEventListener('load', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
  const mainEl = document.getElementById('main');
  if (mainEl && window.MutationObserver) new MutationObserver(function () { whyEl = undefined; schedule(); }).observe(mainEl, {childList: true});
  schedule();
})();
