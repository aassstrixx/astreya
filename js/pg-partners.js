/* «Партнёрам» (страница v2): поведение поверх разметки src/pages/partners.js. Расчёт скидки здесь НЕ ведётся — его делает A.pages.partners из js/pages.js (мы только подхватываем его вызов и добавляем своё),
   «ориентир» с кнопкой «Запросить условия» дорисовывает js/sales-pages.js. Здесь: шапка прозрачна над первым экраном; лестница «достраивается», когда доходит до экрана;
   у калькулятора — кнопки «−/+», быстрый выбор суммы, подсветка достигнутых порогов и читаемое значение ползунка для скринридеров. Всё идемпотентно: при переходе между страницами без перезагрузки
   функция вызывается заново на новой разметке; глобальных слушателей — один. */
(function () {
  'use strict';
  const A = window.Astreya; if (!A || !A.pages) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  let watching = false;

  /* шапка: прозрачная, пока под ней первый экран (css: html.pp-scrolled) */
  function watchHeader() {
    if (watching) return; watching = true; let raf = 0;
    const tick = () => { raf = 0; const hero = $('.pp-hero'); document.documentElement.classList.toggle('pp-scrolled', !!hero && hero.getBoundingClientRect().bottom < 90); };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(tick); }, {passive: true}); window.addEventListener('resize', tick);
  }
  const headerNow = () => { const hero = $('.pp-hero'); document.documentElement.classList.toggle('pp-scrolled', !!hero && hero.getBoundingClientRect().bottom < 90); };

  /* лестница: ступени вырастают по очереди, когда блок показался на экране (без IntersectionObserver — сразу видна) */
  function stairs(pp) {
    const st = $('.pp-stairs', pp); if (!st || st.getAttribute('data-pp-io') || !('IntersectionObserver' in window)) return;
    st.setAttribute('data-pp-io', '1'); st.classList.add('is-pre');
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); requestAnimationFrame(() => st.classList.remove('is-pre')); } }, {threshold: .2});
    io.observe(st);
  }

  /* калькулятор: поверх прежней логики (js/pages.js) */
  function calc(pp) {
    const r = $('#calc-range', pp); if (!r || r.getAttribute('data-pp-bound')) return; r.setAttribute('data-pp-bound', '1');
    const DS = ((window.ASTREYA_DATA || {}).site || {}).discounts || [], rub = A.rub || (n => String(n));
    const step = +r.step || 10000, min = +r.min || 0, max = +r.max || 500000;
    const set = v => { v = Math.max(min, Math.min(max, Math.round(v / step) * step)); if (+r.value === v) return; r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); };
    const paint = () => {
      const v = +r.value; let tier = -1; DS.forEach((d, i) => { if (v >= d.from) tier = i; });
      $$('.pp-tiers .tier', pp).forEach((t, i) => t.classList.toggle('reached', i <= tier));
      $$('[data-pp-set]', pp).forEach(b => b.setAttribute('aria-pressed', String(+b.getAttribute('data-pp-set') === v)));
      r.setAttribute('aria-valuetext', rub(v) + (tier >= 0 ? ', скидка ' + DS[tier].pct + '%' : ', скидки пока нет'));
    };
    r.addEventListener('input', paint);
    pp.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-pp-bump],[data-pp-set]'); if (!b || !pp.contains(b)) return;
      if (b.hasAttribute('data-pp-bump')) { set(+r.value + (+b.getAttribute('data-pp-bump')) * step); if (A.track) A.track('calc_bump', {dir: b.getAttribute('data-pp-bump')}); }
      else { set(+b.getAttribute('data-pp-set')); if (A.track) A.track('calc_preset', {sum: +b.getAttribute('data-pp-set')}); }
    });
    paint();
  }

  const prev = A.pages.partners;                                                         // прежний инициализатор (калькулятор) остаётся первым
  A.pages.partners = function () {
    if (prev) prev.apply(this, arguments);
    const pp = $('[data-pp]'); if (!pp) return;
    watchHeader(); headerNow(); stairs(pp); calc(pp);
  };
})();
