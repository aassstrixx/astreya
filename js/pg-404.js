/* pg-404.js — страница 404 («потерялись в галерее»): жемчужина Стеллы из js/assistant.js (A.pearl) растерянно плывёт в зале, чуть смещается за указателем
   (только transform), веселеет, когда посетитель начинает вводить запрос. Прозрачная шапка над сценой, пока страница не прокручена (html.ut-scrolled).
   Ничего не отправляется; слушатели и кадры снимаются при уходе со страницы (переходы без перезагрузки). */
(function () {
  'use strict';
  const A = window.Astreya; if (!A) return;
  const $ = s => document.querySelector(s);
  const root = document.documentElement, body = document.body;
  const isPage = () => body.getAttribute('data-page') === 'notfound';
  let M = null;

  const mood = m => { if (!M || !M.orb) return; const svg = M.orb.querySelector('svg'); if (svg) svg.setAttribute('data-m', m); };
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); M.offs.push(() => t.removeEventListener(ev, fn, o)); };
  function mount() {
    const orb = $('[data-nf-orb]'); if (!orb) return;
    if (M && M.orb === orb && orb.isConnected) return;
    teardown(); M = {orb: orb, offs: [], raf: 0, px: 0, py: 0};
    if (A.pearl && !orb.firstChild) orb.innerHTML = A.pearl('think', true, '');
    const calm = matchMedia('(prefers-reduced-motion:reduce)').matches;
    const tick = () => { M.raf = 0; orb.style.setProperty('--nf-x', (M.px * 14).toFixed(1) + 'px'); orb.style.setProperty('--nf-y', (M.py * 10).toFixed(1) + 'px'); };
    if (!calm) on(window, 'pointermove', e => { if (!M) return; M.px = e.clientX / innerWidth - .5; M.py = e.clientY / innerHeight - .5; if (!M.raf) M.raf = requestAnimationFrame(tick); }, {passive: true});
    on(window, 'scroll', () => root.classList.toggle('ut-scrolled', window.scrollY > 32), {passive: true});
    root.classList.toggle('ut-scrolled', window.scrollY > 32);
    const inp = document.querySelector('.nf-form input[type="search"]');
    if (inp) { on(inp, 'focus', () => mood('happy')); on(inp, 'blur', () => mood('think')); }
  }
  function teardown() {
    if (!M) return; M.offs.forEach(f => f()); if (M.raf) cancelAnimationFrame(M.raf);
    M = null; root.classList.remove('ut-scrolled');
  }
  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); if (isPage()) mount(); else teardown(); };
  if (isPage()) mount();
})();
