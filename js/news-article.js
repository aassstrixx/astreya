/* news-article.js — страница статьи в оформлении газеты (разметка — src/pages/news.js → articlePage, стили — css/news-article.css).
   Что здесь: лист ложится на стол при показе страницы и тонкая полоса прогресса чтения под шапкой. Всё необязательное: без JS статья читается полностью.
   Слушатели window снимаются, когда страницу подменили (переход без перезагрузки). «Меньше движения» — без появления листа. */
(function () {
  'use strict';
  const A = window.Astreya; if (!A) return;
  let off = null;
  function init() {
    if (off) { off(); off = null; }
    const root = document.querySelector('[data-na]'); if (!root) return;
    const sheet = root.querySelector('[data-na-sheet]'), bar = root.querySelector('[data-na-prog]');
    const reduced = matchMedia('(prefers-reduced-motion: reduce) and (min-width: 100000px)').matches;
    let raf = 0, alive = true;
    if (!reduced && 'requestAnimationFrame' in window) { root.setAttribute('data-na-ready', ''); requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-in'))); }
    const upd = () => {
      raf = 0; if (!alive || !root.isConnected || !sheet || !bar) return;
      const r = sheet.getBoundingClientRect(), total = Math.max(1, r.height - window.innerHeight * .5);
      bar.style.setProperty('--p', Math.min(1, Math.max(0, (-r.top + window.innerHeight * .15) / total)).toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    window.addEventListener('scroll', onScroll, {passive: true}); window.addEventListener('resize', onScroll); upd();
    off = () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }
  const prev = A.pages && A.pages.article; if (A.pages) A.pages.article = function (r) { if (document.querySelector('[data-na]')) init(); else if (prev) prev(r); };
  if (document.body && document.body.getAttribute('data-page') === 'article' && A.initDone) init();
})();
