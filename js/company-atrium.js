/* «Компания» (страница v4 «Corporate Editorial Atlas»): поведение поверх разметки src/pages/company.js. Всё необязательное — без этого файла страница статична и читаема.
   Здесь: прозрачная шапка над первым экраном (класс ca-scrolled на html, когда экран ушёл вверх);
   подсказки маркеров карты — на мыши по наведению (CSS), с клавиатуры по фокусу (CSS), на касании и по клику (класс .on: одна открытая, закрытие по Esc, повторному касанию и касанию вне карты).
   Появление блоков — штатное для сайта (js/motion.js + css/motion.css), как на «Обучении». Очистка при уходе со страницы: слушатели, rAF. */
(function () {
  'use strict';
  const A = window.Astreya; if (!A || !A.pages) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let td = null;

  function init() {
    const root = $('[data-ca]'); if (!root || root.getAttribute('data-ca-bound')) return;
    if (td) td();
    root.setAttribute('data-ca-bound', '1'); root.classList.add('is-js');
    const off = [], on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
    const tick = {raf: 0};
    const alive = () => root.isConnected && document.body.getAttribute('data-page') === 'company';

    /* ---- прозрачная шапка над первым экраном: когда он ушёл вверх, шапка получает обычный фон (как на «Обучении»); параллакса и своих анимаций появления нет ---- */
    const html = document.documentElement, hero = $('.ca-hero', root);
    function frame() {
      tick.raf = 0; if (!alive()) return teardown();
      if (hero) html.classList.toggle('ca-scrolled', hero.getBoundingClientRect().bottom < 90);
    }
    const ask = () => { if (!tick.raf) tick.raf = requestAnimationFrame(frame); };
    on(window, 'scroll', ask, {passive: true}); on(window, 'resize', ask); off.push(() => { if (tick.raf) cancelAnimationFrame(tick.raf); });
    ask();

    /* ---- карта: выбор города (маркер на карте или кнопка в списке) → карточка с адресом и ближайшей встречей ---- */
    const mws = $$('.ca-mw', root), cbs = $$('.ca-cb', root), cds = $$('.ca-cd', root);
    if (mws.length) {
      const select = city => {
        mws.forEach(m => m.classList.toggle('is-sel', m.getAttribute('data-city') === city));
        cbs.forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-city') === city ? 'true' : 'false'));
        cds.forEach(c => c.classList.toggle('is-on', c.getAttribute('data-city') === city));
      };
      mws.forEach(m => { const b = $('.ca-mk', m); if (b) on(b, 'click', e => { e.preventDefault(); select(m.getAttribute('data-city')); }); });
      cbs.forEach(b => on(b, 'click', () => select(b.getAttribute('data-city'))));
      select(mws[0].getAttribute('data-city'));
    }

    function teardown() { if (!td) return; const f = off.slice(); td = null; f.forEach(x => { try { x(); } catch (e) {} }); document.documentElement.classList.remove('ca-scrolled'); }
    td = teardown;
    on(document, 'astreya:page', () => { setTimeout(() => { if (!alive()) teardown(); }, 0); });
  }

  const prev = A.pages.company;
  A.pages.company = function () { if (prev) prev.apply(this, arguments); init(); };
  if (document.body && document.body.getAttribute('data-page') === 'company') init();
})();
