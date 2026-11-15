/* pg-search.js — страница поиска («картотека»). Сам поиск и разбивка по группам — js/pages.js (A.pages.search), «спасение» пустого результата — js/sales-pages.js; здесь только оформление результатов:
   миниатюра у каждой карточки (упаковка товара, логотип бренда, дата семинара, значок новости), подсветка найденных слов, горячие клавиши («/» — в строку запроса, Esc — очистить), прозрачная шапка над сценой.
   Ничего не отправляется; наблюдатель и слушатели снимаются при уходе со страницы (переходы без перезагрузки). */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const root = document.documentElement, body = document.body;
  const isPage = () => body.getAttribute('data-page') === 'search';
  const rootPath = () => body.getAttribute('data-root') || '';
  let M = null;

  /* Названия брендов в индексе латиницей; русские написания («Дерматайм») ведут к ним. Это только подсказка поиску: ничего нового на страницах не утверждается. */
  const ALIAS = {'дерматайм': 'dermatime', 'дерматайм.': 'dermatime', 'гелиокеа': 'heliocare', 'хелиокеа': 'heliocare', 'хелиокер': 'heliocare', 'гелиокер': 'heliocare', 'эндокеа': 'endocare', 'эндокер': 'endocare', 'эланцил': 'elancyl', 'эланси': 'elancyl', 'кинвелл': 'keenwell', 'кинвел': 'keenwell', 'иралтон': 'iraltone', 'иралтоне': 'iraltone', 'неоретин': 'neoretin', 'биретикс': 'biretix'};
  const aliasQ = q => String(q || '').toLowerCase().replace(/[а-яё.]+/g, w => ALIAS[w] || w);
  if (A.search && !A.search.__qxAlias) {
    const orig = A.search;
    A.search = function (q) { const r = orig.apply(this, arguments); if (r.length) return r; const q2 = aliasQ(q); return q2 === String(q).toLowerCase() ? r : orig.call(this, q2); };
    A.search.__qxAlias = true;
  }

  const byKey = (arr, key) => { const m = {}; (arr || []).forEach(x => { m[x[key]] = x; }); return m; };
  const NEWS_IC = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5h11v14H7a2 2 0 0 1-2-2V5Zm11 3h3v9a2 2 0 0 1-2 2M8 9h5M8 12h5M8 15h3"/></svg>';

  function thumb(it) {
    const type = it.getAttribute('data-type'), href = (it.getAttribute('href') || '').replace(/[?#].*$/, ''), slug = (href.match(/([^/]+)\.html$/) || [])[1] || '';
    const th = document.createElement('span'); th.className = 'qx-th qx-th--' + type; th.setAttribute('aria-hidden', 'true');
    if (type === 'product') {
      const p = (M.products[slug] || null); if (!p) return th;
      const base = rootPath() + 'assets/showroom/pack-', img = new Image(); img.alt = ''; img.decoding = 'async';
      img.onerror = () => { img.onerror = () => { th.classList.add('is-empty'); }; img.src = base + (p.t || 'jar') + '-s.webp'; };
      img.onload = () => th.appendChild(img); img.src = base + p.brand + '-' + (p.t || 'jar') + '-s.webp';
    } else if (type === 'brand') {
      const b = M.brands[slug]; if (b && b.logo) { const img = new Image(); img.alt = ''; img.decoding = 'async'; img.onload = () => th.appendChild(img); img.src = rootPath() + b.logo; }
    } else if (type === 'event') {
      const e = M.events[slug]; if (e && e.date) { const d = A.dparts(e.date); th.innerHTML = '<b>' + d.d + '</b><small>' + d.m + '</small>'; }
    } else th.innerHTML = NEWS_IC;
    return th;
  }

  function mark(el, toks) {
    if (!toks.length) return;
    const re = new RegExp('(' + toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    const walk = n => {
      if (n.nodeType === 3) {
        if (!re.test(n.nodeValue)) return; re.lastIndex = 0;
        const f = document.createDocumentFragment(); n.nodeValue.split(re).forEach((part, i) => { if (i % 2) { const m = document.createElement('mark'); m.textContent = part; f.appendChild(m); } else if (part) f.appendChild(document.createTextNode(part)); });
        n.parentNode.replaceChild(f, n);
      } else if (n.nodeType === 1 && n.tagName !== 'MARK') Array.prototype.slice.call(n.childNodes).forEach(walk);
    };
    walk(el);
  }

  /* пустой результат: предложения вместо тупика — популярные запросы (те же, что под строкой), разделы сайта и Стелла (через общий asst-open) */
  function suggest() {
    const e = $('#s-out .empty'); if (!e || $('.qx-sug', e)) return;
    const box = document.createElement('div'), R = rootPath(); box.className = 'qx-sug';
    const hints = $$('.qx-hints a.chip').map(a => '<a class="chip" href="' + a.getAttribute('href') + '" data-track="search_suggest">' + a.innerHTML + '</a>').join('');
    const go = [['Каталог', 'catalog.html'], ['Бренды', 'brands.html'], ['Обучение', 'training.html'], ['Контакты', 'contacts.html']].map(g => '<a class="chip" href="' + R + g[1] + '" data-track="search_suggest">' + g[0] + '</a>').join('');
    box.innerHTML = (hints ? '<p>Попробуйте так</p><div class="qx-sug-row">' + hints + '</div>' : '') + '<p>Или откройте раздел</p><div class="qx-sug-row">' + go + '</div>';
    e.appendChild(box);
  }

  function decorate() {
    if (!M) return; M.raf = 0;
    suggest();
    const q = ($('#sp-q') || {}).value || '', toks = aliasQ(q).split(/[\s,;]+/).filter(t => t.length > 1).slice(0, 6);
    $$('#s-out .sr-item').forEach(it => {
      if (it.__qx) return; it.__qx = true;
      const t = $('b', it), s = $('small', it), ty = $('.sr-type', it);
      const wrap = document.createElement('span'); wrap.className = 'qx-t'; if (t) wrap.appendChild(t); if (s) wrap.appendChild(s);
      it.insertBefore(wrap, it.firstChild); it.insertBefore(thumb(it), it.firstChild);
      if (ty) it.appendChild(ty);
      mark(wrap, toks);
    });
  }

  function onKey(e) {
    if (!M || !isPage() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const inp = $('#sp-q'), t = e.target, typing = !!(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || !!(t && t.isContentEditable);
    if (e.key === '/' && !typing && inp) { e.preventDefault(); inp.focus(); inp.select(); return; }
    if (e.key === 'Escape' && t === inp) { if (inp.value) inp.value = ''; else inp.blur(); }
  }
  const onScroll = () => root.classList.toggle('ut-scrolled', window.scrollY > 32);

  function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); M.offs.push(() => t.removeEventListener(ev, fn, o)); }
  function mount() {
    const out = $('#s-out'); if (!out) return;
    if (M && M.out === out && out.isConnected) { decorate(); return; }
    teardown();
    M = {out: out, offs: [], obs: [], raf: 0, products: byKey(D.products, 'slug'), brands: byKey(D.brands, 'id'), events: byKey(D.events, 'slug')};
    if (window.MutationObserver) { const mo = new MutationObserver(() => { if (M && !M.raf) M.raf = requestAnimationFrame(decorate); }); mo.observe(out, {childList: true, subtree: true}); M.obs.push(mo); }
    on(document, 'keydown', onKey); on(window, 'scroll', onScroll, {passive: true});
    onScroll(); decorate();
  }
  function teardown() {
    if (!M) return; M.offs.forEach(f => f()); M.obs.forEach(o => o.disconnect()); if (M.raf) cancelAnimationFrame(M.raf);
    M = null; root.classList.remove('ut-scrolled');
  }
  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); if (isPage()) mount(); else teardown(); };
  if (isPage()) mount();
})();
