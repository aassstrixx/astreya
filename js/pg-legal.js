/* pg-legal.js — юридические страницы (privacy / terms / consent): оглавление-навигатор слева собирается из заголовков h2 документа (тексты не меняются: заголовкам без id
   добавляется только якорь), текущий раздел подсвечивается по прокрутке (aria-current="location"), переходы по якорям учитывают высоту шапки (scroll-margin в css).
   Если документ ещё не опубликован (заглушка до заполнения реквизитов), оглавление остаётся скрытым. Прозрачная шапка над полосой стены, пока страница не прокручена.
   Ничего не отправляется; слушатели снимаются при уходе со страницы (переходы без перезагрузки). */
(function () {
  'use strict';
  const A = window.Astreya; if (!A) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const root = document.documentElement, body = document.body;
  const isPage = () => /^(privacy|terms|consent)$/.test(body.getAttribute('data-page') || '');
  let M = null;

  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); M.offs.push(() => t.removeEventListener(ev, fn, o)); };
  function build(doc, toc) {
    const hs = $$('h2', doc); if (hs.length < 2) return [];
    const list = $('ol', toc), used = {};
    hs.forEach((h, i) => { if (!h.id) { let id = 'razdel-' + (i + 1); while (used[id] || document.getElementById(id)) id += '-x'; h.id = id; } used[h.id] = 1; });
    list.innerHTML = '';
    const links = hs.map(h => {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + h.id; a.textContent = h.textContent.replace(/^\s*\d+\.\s*/, ''); a.setAttribute('data-lg-link', h.id);
      li.appendChild(a); list.appendChild(li); return a;
    });
    toc.hidden = false; return links;
  }
  function mount() {
    const page = $('[data-legal]'); if (!page) return;
    if (M && M.page === page && page.isConnected) return;
    teardown(); M = {page: page, offs: [], raf: 0, links: [], heads: [], cur: -1};
    const doc = $('[data-lg-body]', page), toc = $('[data-lg-toc]', page);
    if (doc && toc) { M.links = build(doc, toc); M.heads = $$('h2', doc); }
    const spy = () => {
      M.raf = 0; if (!M.heads.length) return;
      const line = (parseFloat(getComputedStyle(root).getPropertyValue('--hdr')) || 84) + 120; let k = 0;
      M.heads.forEach((h, i) => { if (h.getBoundingClientRect().top <= line) k = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) k = M.heads.length - 1;
      if (k === M.cur) return; M.cur = k;
      M.links.forEach((a, i) => { if (i === k) { a.setAttribute('aria-current', 'location'); const ol = a.parentNode.parentNode; if (ol.scrollWidth > ol.clientWidth) ol.scrollTo({left: a.offsetLeft - 16, behavior: 'auto'}); } else a.removeAttribute('aria-current'); });
    };
    const tick = () => { root.classList.toggle('ut-scrolled', window.scrollY > 32); if (!M.raf) M.raf = requestAnimationFrame(spy); };
    on(window, 'scroll', tick, {passive: true}); on(window, 'resize', tick, {passive: true});
    tick(); spy();
  }
  function teardown() {
    if (!M) return; M.offs.forEach(f => f()); if (M.raf) cancelAnimationFrame(M.raf);
    M = null; root.classList.remove('ut-scrolled');
  }
  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); if (isPage()) mount(); else teardown(); };
  if (isPage()) mount();
})();
