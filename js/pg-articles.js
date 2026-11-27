/* Библиотека статей и страницы статей: фильтр по рубрикам, полоса прогресса чтения, оглавление (плавный переход, подсветка текущего раздела).
   Разметка — src/pages/articles.js; без этого скрипта страница работает: в библиотеке видны все материалы, оглавление — обычные якорные ссылки. */
(function () {
  'use strict';
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* раскладка карточек по числу видимых — тот же расчёт, что sizes() в src/pages/articles.js */
  function sizes(n) {
    var out = [], r = n;
    while (r > 0) {
      if (r >= 5) { out.push('lc-big', 'lc-s', 'lc-s', 'lc-h', 'lc-h'); r -= 5; }
      else if (r === 4) { out.push('lc-big', 'lc-s', 'lc-s', 'lc-f'); r = 0; }
      else if (r === 3) { out.push('lc-big', 'lc-s', 'lc-s'); r = 0; }
      else if (r === 2) { out.push('lc-h', 'lc-h'); r = 0; }
      else { out.push('lc-f'); r = 0; }
    }
    return out;
  }
  var SZ = ['lc-big', 'lc-s', 'lc-h', 'lc-f'];

  /* ---------- библиотека: фильтр ---------- */
  function initLib(root) {
    var chips = $$('.lf', root), cards = $$('.lc', root), empty = $('[data-lib-empty]', root), status = $('[data-lib-status]', root);
    if (!chips.length || !cards.length) return;
    var known = chips.map(function (c) { return c.getAttribute('data-cat'); });
    function apply(cat, fromUser) {
      if (known.indexOf(cat) < 0) cat = 'all';
      var vis = cards.filter(function (c) { return cat === 'all' || (' ' + c.getAttribute('data-cats') + ' ').indexOf(' ' + cat + ' ') >= 0; });
      var sz = sizes(vis.length);
      cards.forEach(function (c) { c.hidden = vis.indexOf(c) < 0; SZ.forEach(function (k) { c.classList.remove(k); }); });
      vis.forEach(function (c, i) {
        c.classList.add(sz[i], 'in');
        if (fromUser && !RM) { c.classList.remove('lc-in'); void c.offsetWidth; c.style.animationDelay = Math.min(i, 6) * 55 + 'ms'; c.classList.add('lc-in'); }
      });
      chips.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === cat ? 'true' : 'false'); });
      if (empty) empty.hidden = vis.length > 0;
      if (status) { status.hidden = !fromUser; status.textContent = fromUser ? (vis.length ? '' + vis.length : '0') + ' ' + plural(vis.length) : ''; }
      try { var url = cat === 'all' ? location.pathname : location.pathname + '?cat=' + encodeURIComponent(cat); if (fromUser) history.replaceState(null, '', url + location.hash); } catch (e) { /* — */ }
    }
    function plural(n) { var a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'материал' : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'материала' : 'материалов'; }
    chips.forEach(function (b) { b.addEventListener('click', function () { apply(b.getAttribute('data-cat'), true); }); });
    var m = /[?&]cat=([\w-]+)/.exec(location.search);
    if (m && known.indexOf(m[1]) >= 0 && m[1] !== 'all') apply(m[1], false);
  }

  /* ---------- статья: прогресс чтения и оглавление ---------- */
  function initArticle(root) {
    var bar = $('[data-ar-prog]', root), body = $('[data-ar-body]', root), toc = $('[data-ar-toc]', root);
    if (bar && body) {
      var ticking = false, last = -1;
      var update = function () {
        ticking = false;
        var r = body.getBoundingClientRect(), vh = window.innerHeight || 800;
        var total = Math.max(1, r.height - vh * 0.55), done = Math.min(Math.max(-r.top + vh * 0.18, 0), total) / total;
        if (r.bottom <= vh * 0.9) done = 1;
        bar.style.transform = 'scaleX(' + done.toFixed(4) + ')';
        var pct = Math.round(done * 20) * 5; if (pct !== last) { last = pct; bar.setAttribute('aria-valuenow', pct); }
      };
      var req = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      addEventListener('scroll', req, {passive: true}); addEventListener('resize', req); update();
    }
    if (toc) {
      var det = $('details', toc), links = $$('[data-toc-link]', toc), mq = window.matchMedia ? matchMedia('(max-width: 1000px)') : null;
      var sync = function () { if (det && mq) det.open = !mq.matches; };     // на телефоне содержание свёрнуто, на компьютере — открыто
      sync(); if (mq && mq.addEventListener) mq.addEventListener('change', sync);
      links.forEach(function (a) {
        a.addEventListener('click', function (e) {
          var id = a.getAttribute('href').slice(1), t = document.getElementById(id); if (!t) return;
          e.preventDefault();
          var go = function () {
            t.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: 'start'});
            try { history.replaceState(null, '', '#' + id); } catch (er) { /* — */ }
            t.setAttribute('tabindex', '-1'); try { t.focus({preventScroll: true}); } catch (er) { /* — */ }
          };
          /* на телефоне содержание сначала сворачивается (оно над текстом и сдвигает его вверх), и только потом идёт прокрутка */
          if (mq && mq.matches && det && det.open) { det.open = false; requestAnimationFrame(function () { requestAnimationFrame(go); }); } else go();
        });
      });
      var heads = $$('h2[data-toc]', body || root);
      if (heads.length && 'IntersectionObserver' in window) {
        var cur = null, set = function (id) { if (id === cur) return; cur = id; links.forEach(function (a) { var on = a.getAttribute('href') === '#' + id; a.classList.toggle('is-on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); };
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (en) { if (en.isIntersecting) set(en.target.id); });
          if (window.scrollY < 120 && heads[0]) set(heads[0].id);
        }, {rootMargin: '-18% 0px -72% 0px', threshold: 0});
        heads.forEach(function (h) { io.observe(h); });
        set(heads[0].id);
      }
    }
  }

  function init() {
    var lib = $('[data-lib]'); if (lib && !lib.__ini) { lib.__ini = 1; initLib(lib); }
    var ar = $('[data-ar]'); if (ar && !ar.__ini) { ar.__ini = 1; initArticle(ar); }
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  /* страницы подменяются без перезагрузки (переходы между страницами) — инициализируем заново */
  var A = window.Astreya; if (A) { var prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); }; }
})();
