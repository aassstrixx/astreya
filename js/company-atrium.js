/* «Компания» (страница v4 «Corporate Editorial Atlas»): поведение поверх разметки src/pages/company.js. Всё необязательное — без этого файла страница статична и читаема.
   Здесь: прозрачная шапка над первым экраном (класс ca-scrolled на html, когда экран ушёл вверх), прежние движения страницы («шаг вглубь» первого экрана --hp, сдвиг картинки заключения --p);
   подсказки маркеров карты — на мыши по наведению (CSS), с клавиатуры по фокусу (CSS), на касании и по клику (класс .on: одна открытая, закрытие по Esc, повторному касанию и касанию вне карты).
   Появление блоков — прежнее (по просьбе владельца 17.11): штатный .reveal на отдельных элементах и заголовки по словам (.ca h2 в js/motion.js). Очистка при уходе со страницы: слушатели, rAF, observers. */
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
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null, still = !!(mq && mq.matches);
    const vis = new Set(), tick = {raf: 0};
    const alive = () => root.isConnected && document.body.getAttribute('data-page') === 'company';

    /* ---- прежние движения страницы: прозрачная шапка над первым экраном; «шаг вглубь» атриума и уход текста первого экрана при прокрутке (--hp);
       мягкий сдвиг картинки заключения (--p). Только transform/opacity, обновляется в requestAnimationFrame, прокрутка не блокируется ---- */
    const html = document.documentElement, hero = $('.ca-hero', root), pars = $$('[data-ca-par]', root);
    function frame() {
      tick.raf = 0; if (!alive()) return teardown();
      const vh = window.innerHeight || 800;
      if (hero) {
        const hb = hero.getBoundingClientRect();
        html.classList.toggle('ca-scrolled', hb.bottom < 90);
        if (!still) root.style.setProperty('--hp', clamp(-hb.top / Math.max(1, hb.height), 0, 1).toFixed(3));
      }
      if (still) return;
      pars.forEach(el => { if (!vis.has(el)) return; const r = el.getBoundingClientRect(); el.style.setProperty('--p', clamp((r.top + r.height / 2 - vh / 2) / vh, -1, 1).toFixed(3)); });
    }
    const ask = () => { if (!tick.raf) tick.raf = requestAnimationFrame(frame); };
    on(window, 'scroll', ask, {passive: true}); on(window, 'resize', ask); off.push(() => { if (tick.raf) cancelAnimationFrame(tick.raf); });
    if (pars.length && !still) {
      if ('IntersectionObserver' in window) {
        const pio = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) vis.add(e.target); else vis.delete(e.target); }); ask(); }, {rootMargin: '20% 0px'});
        pars.forEach(el => pio.observe(el)); off.push(() => pio.disconnect());
      } else { pars.forEach(el => vis.add(el)); }
    }
    ask();

    /* ---- география: подсказки маркеров ---- */
    const mws = $$('.ca-mw', root);
    if (mws.length) {
      const closeAll = except => mws.forEach(m => { if (m !== except) m.classList.remove('on'); });
      mws.forEach(m => {
        const b = $('.ca-mk', m); if (!b) return;
        on(b, 'click', e => { e.preventDefault(); const was = m.classList.contains('on'); closeAll(); m.classList.toggle('on', !was); });
        on(b, 'blur', () => { setTimeout(() => { if (!m.contains(document.activeElement)) m.classList.remove('on'); }, 0); });
      });
      on(document, 'keydown', e => { if (e.key === 'Escape') { const o = mws.filter(m => m.classList.contains('on'))[0]; closeAll(); if (o) { const b = $('.ca-mk', o); if (b) b.focus(); } } });
      on(document, 'pointerdown', e => { if (!e.target.closest || !e.target.closest('.ca-mw')) closeAll(); });
    }

    function teardown() { if (!td) return; const f = off.slice(); td = null; f.forEach(x => { try { x(); } catch (e) {} }); document.documentElement.classList.remove('ca-scrolled'); }
    td = teardown;
    on(document, 'astreya:page', () => { setTimeout(() => { if (!alive()) teardown(); }, 0); });
  }

  const prev = A.pages.company;
  A.pages.company = function () { if (prev) prev.apply(this, arguments); init(); };
  if (document.body && document.body.getAttribute('data-page') === 'company') init();
})();
