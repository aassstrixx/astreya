/* «Партнёрам» (страница v2): поведение поверх разметки src/pages/partners.js. Расчёт скидки здесь НЕ ведётся — его делает A.pages.partners из js/pages.js (мы только подхватываем его вызов и добавляем своё),
   «ориентир» с кнопкой «Запросить условия» дорисовывает js/sales-pages.js. Здесь: шапка прозрачна над первым экраном; вкладки «Кому подходит» (страница v5);
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

  /* «Кому подходит»: вкладки (клик, стрелки, Home/End); у каждой — своя панель с фото */
  function tabs(pp) {
    const box = $('[data-pp-tabs]', pp); if (!box || box.getAttribute('data-pp-bound')) return; box.setAttribute('data-pp-bound', '1');
    const tabs = $$('[role="tab"]', box), pans = $$('[role="tabpanel"]', box);
    const pick = (i, focus) => {
      i = (i + tabs.length) % tabs.length;
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      pans.forEach((p, k) => { p.hidden = k !== i; });
      if (focus) tabs[i].focus();
      if (A.track) A.track('partner_audience', {tab: tabs[i].id.replace('pp-tab-', '')});
    };
    /* фото скрытых вкладок подгружаем заранее (в скрытой панели lazy-картинка не загрузилась бы до первого клика — вкладка открывалась бы с пустым фото) */
    const warm = () => $$('img[loading="lazy"]', box).forEach(i => { i.loading = 'eager'; });
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); warm(); } }, {rootMargin: '900px 0px'}); io.observe(box); } else warm();
    box.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[role="tab"]'); if (t && box.contains(t)) pick(tabs.indexOf(t)); });
    box.addEventListener('keydown', e => {
      const t = e.target.closest && e.target.closest('[role="tab"]'); if (!t) return; const i = tabs.indexOf(t);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick(i + 1, true); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick(i - 1, true); }
      else if (e.key === 'Home') { e.preventDefault(); pick(0, true); } else if (e.key === 'End') { e.preventDefault(); pick(tabs.length - 1, true); }
    });
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
    watchHeader(); headerNow(); tabs(pp); calc(pp);
  };
})();
