/* Astreya — движение: заставка (только главная, один раз за сессию), шторка переходов между страницами, появление блоков,
   счётчики, параллакс, инерционный скролл, курсорные эффекты. Двигаются только transform/opacity. */
(function () {
  'use strict';
  const A = window.Astreya, {$, $$, wait} = A;
  const html = document.documentElement, body = document.body;
  const M = A.motion = {done: false};
  const store = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { sessionStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- прогресс чтения ---------- */
  const bar = $('#progress'), hdr = $('#hdr');
  let ticking = false, lastY = 0, scrollNow = 0;
  function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    ticking = false;
  }
  function onScroll() {
    updateProgress();
    const y = scrollY, d = y - lastY;
    scrollNow = y;
    if (hdr && !body.classList.contains('menu-open') && !body.classList.contains('search-open')) {
      if (y > 160 && d > 4) hdr.classList.add('hide');            // шапка уходит при скролле вниз
      else if (d < -4 || y <= 160) hdr.classList.remove('hide');
    }
    lastY = y;
    parKick();
    if (sRaf && Math.abs(scrollY - sCur) > 3) { cancelAnimationFrame(sRaf); sRaf = 0; }   // внешний скролл (клавиши, якорь) отменяет инерцию
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, {passive: true});
  addEventListener('resize', updateProgress);

  /* ---------- инерционное колесо мыши (только точный указатель; тач остаётся нативным) ---------- */
  let sTarget = 0, sCur = 0, sRaf = 0;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  const scrollsInside = el => { for (let n = el; n && n !== body && n !== html; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1) return true; } return false; };
  function sStep() {
    sCur += (sTarget - sCur) * .095;
    if (Math.abs(sTarget - sCur) < .5) { sCur = sTarget; sRaf = 0; } else sRaf = requestAnimationFrame(sStep);
    window.scrollTo({top: sCur, behavior: 'instant'});
  }
  M.cancelSmooth = () => { cancelAnimationFrame(sRaf); sRaf = 0; sTarget = sCur = scrollY; };
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    addEventListener('wheel', e => {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (body.classList.contains('locked') || scrollsInside(e.target)) return;
      e.preventDefault();
      let dy = e.deltaY; if (e.deltaMode === 1) dy *= 34; else if (e.deltaMode === 2) dy *= innerHeight;
      if (!sRaf) sCur = sTarget = scrollY;
      sTarget = Math.max(0, Math.min(maxScroll(), sTarget + dy));
      if (!sRaf) sRaf = requestAnimationFrame(sStep);
    }, {passive: false});
  }

  /* ---------- параллакс слоёв и уход hero-текста ---------- */
  let parItems = [], fadeItems = [], parRaf = 0;
  function measurePar() {
    scrollNow = scrollY;
    parItems.forEach(p => { if (!p.host.isConnected) return; const r = p.host.getBoundingClientRect(); p.top = r.top + scrollNow; p.h = r.height; });
  }
  function collectMotion(root) {
    parItems = $$('[data-par]', root).map(el => ({el, k: +el.getAttribute('data-par'), cur: 0, host: el.parentElement, top: 0, h: 0}));
    fadeItems = $$('[data-fade]', root);
    if (M.done) { measurePar(); parKick(); }
  }
  function parTick() {
    let moving = false; const vh = innerHeight;
    parItems.forEach(p => {
      const top = p.top - scrollNow;
      if (top + p.h < -240 || top > vh + 240) return;
      const tgt = -((top + p.h / 2) - vh / 2) * p.k;
      p.cur += (tgt - p.cur) * .12;
      if (Math.abs(tgt - p.cur) > .05) moving = true;
      p.el.style.transform = `translate3d(0,${p.cur.toFixed(2)}px,0)`;
    });
    const y = Math.min(1, scrollNow / (vh * .75));
    fadeItems.forEach(el => {                         // в покое слой не создаём: текст hero остаётся чётким (без растеризации в отдельном слое)
      if (y < .002) { el.style.opacity = ''; el.style.transform = ''; return; }
      el.style.opacity = (1 - y * .9).toFixed(3); el.style.transform = `translate3d(0,${Math.round(-y * 40)}px,0)`;
    });
    parRaf = moving ? requestAnimationFrame(parTick) : 0;
  }
  function parKick() { if (!parRaf && M.done && (parItems.length || fadeItems.length)) parRaf = requestAnimationFrame(parTick); }
  addEventListener('resize', () => { measurePar(); parKick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measurePar(); parKick(); });

  /* ---------- курсор: свет и глубина «жемчужины» (карточки и кнопки не двигаются — текст остаётся чётким) ---------- */
  const hp = {x: 0, y: 0, tx: 0, ty: 0, raf: 0};
  function hpTick() {
    const w = $('.pearl-wrap'); if (!w) { hp.raf = 0; return; }
    hp.x += (hp.tx - hp.x) * .07; hp.y += (hp.ty - hp.y) * .07;
    w.style.setProperty('--px', hp.x.toFixed(3)); w.style.setProperty('--py', hp.y.toFixed(3));
    w.style.setProperty('--lx', (33 + hp.x * 15).toFixed(1) + '%'); w.style.setProperty('--ly', (27 + hp.y * 13).toFixed(1) + '%');
    hp.raf = (Math.abs(hp.tx - hp.x) > .002 || Math.abs(hp.ty - hp.y) > .002) ? requestAnimationFrame(hpTick) : 0;
  }
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      if (scrollY < innerHeight && $('.pearl-wrap')) { hp.tx = e.clientX / innerWidth * 2 - 1; hp.ty = e.clientY / innerHeight * 2 - 1; if (!hp.raf) hp.raf = requestAnimationFrame(hpTick); }
    }, {passive: true});
    html.addEventListener('mouseleave', () => { hp.tx = hp.ty = 0; if (!hp.raf) hp.raf = requestAnimationFrame(hpTick); });
  }

  /* ---------- заголовки: слова выезжают из-под маски ---------- */
  function splitWords(el) {
    let i = 0;
    const walk = node => Array.from(node.childNodes).forEach(ch => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        ch.textContent.split(/(\s+)/).forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'), s = document.createElement('span');
          w.className = 'w'; s.textContent = tok; s.style.setProperty('--i', i++); w.appendChild(s); frag.appendChild(w);
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    });
    walk(el);
    el.classList.remove('reveal'); el.classList.add('split');
  }
  const splitAll = root => $$('h1:not(.b-title), .sec-head h2, .promo h2, .feat h2, .cta-band h2', root).forEach(el => { if (!el.classList.contains('split')) splitWords(el); });

  /* ---------- появление блоков и счётчики ---------- */
  let io = null, revealTok = 0;
  function runCounter(el) {
    if (el.dataset.run) return;
    el.dataset.run = '1';
    const to = +el.getAttribute('data-count'), dur = 1500, t0 = performance.now();
    el.textContent = '0';
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function initReveal(root) {
    if (!M.done) return;
    revealTok++;
    if (io) io.disconnect();
    /* титул бренда «проявляется» шторкой (clip-path) — IntersectionObserver такой элемент не видит, поэтому открываем его сами */
    $$('.b-title.reveal:not(.in)', root).forEach(el => requestAnimationFrame(() => { el.style.setProperty('--rd', '120ms'); el.classList.add('in'); }));
    const targets = $$('.reveal:not(.in):not(.b-title), .split:not(.in), .eyebrow:not(.in), hr.dash:not(.in), [data-count]:not([data-run])', root);
    const show = (el, i) => {
      if (el.hasAttribute('data-count')) { runCounter(el); return; }
      if (el.classList.contains('reveal')) el.style.setProperty('--rd', Math.min(i, 8) * 90 + 'ms');
      if (el.classList.contains('split')) el.style.setProperty('--sd', Math.min(i, 5) * 70 + 'ms');
      el.classList.add('in');
      if (el.classList.contains('pearl-wrap') && A.heroMarkStart) { try { A.heroMarkStart(el); } catch (e) {} }
    };
    if (!('IntersectionObserver' in window)) { targets.forEach(show); return; }
    io = new IntersectionObserver(entries => {
      let i = 0;
      entries.forEach(en => { if (!en.isIntersecting) return; io.unobserve(en.target); show(en.target, i++); });
    }, {threshold: .12, rootMargin: '0px 0px -5% 0px'});
    targets.forEach(t => io.observe(t));
  }
  M.scheduleReveal = (root, ms) => { const t = ++revealTok; setTimeout(() => { if (t === revealTok) initReveal(root); }, ms); };
  M.scan = (root, delay) => { root = root || $('#main'); splitAll(root); collectMotion(root); delay ? M.scheduleReveal(root, delay) : initReveal(root); };

  /* ---------- шторка: переходы между страницами ----------
     Как в прежней версии сайта: страница не перезагружается. Полосы шторки закрываются (820 мс), пока читается титр раздела,
     содержимое <main> подменяется на новое (берётся из настоящей страницы), полосы поднимаются (700 мс), блоки появляются через 470 мс.
     Если подмена невозможна (файл открыт с диска, нет сети) — обычный переход по ссылке под той же шторкой. */
  const curtain = $('#curtain');
  const LABELS = {'catalog': 'Каталог', 'brands': 'Бренды', 'training': 'Обучение', 'news': 'Новости и акции', 'company': 'Компания', 'contacts': 'Контакты', 'partners': 'Партнёрам', 'search': 'Поиск', 'privacy': 'Документы', 'terms': 'Документы'};
  const labelFor = url => {
    const seg = new URL(url, location.href).pathname.split('/').filter(Boolean);
    const last = (seg[seg.length - 1] || 'index').replace(/\.html$/, '');
    const dir = seg.length > 1 ? seg[seg.length - 2] : '';
    if (dir === 'brands') { const b = (A.D.brands || []).find(x => x.id === last); return b ? b.name : 'Бренды'; }
    if (dir === 'products') return 'Каталог'; if (dir === 'training') return 'Обучение'; if (dir === 'news') return 'Новости и акции';
    return last === 'index' || !seg.length ? 'Главная' : (LABELS[last] || 'Астрея');
  };
  function setCurtainLabel(t) {
    const ct = $('.ct', curtain); if (!ct) return;
    ct.innerHTML = `<small>Астрея</small><b>${Array.from(t).map((c, i) => c === ' ' ? '<span class="ch" style="width:.28em"></span>' : `<span class="ch"><span style="--i:${i}">${c}</span></span>`).join('')}</b><span class="ct-line"></span>`;
  }
  if (curtain && !$('.cs', curtain)) curtain.innerHTML = '<div class="cs">' + Array.from({length: 8}, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div><div class="ct" aria-hidden="true"></div>';
  M.curtainLabel = setCurtainLabel; M.labelFor = labelFor;

  const canSwap = !window.__ASTREYA_BUNDLE && /^https?:$/.test(location.protocol) && 'fetch' in window && 'DOMParser' in window && 'pushState' in history;
  const abs = (el, url) => {                                // ссылки в подменяемом содержимом считаются от адреса НОВОЙ страницы
    ['href', 'src', 'action'].forEach(at => el.querySelectorAll('[' + at + ']').forEach(n => {
      const v = n.getAttribute(at); if (!v || v.charAt(0) === '#') return;
      try { n.setAttribute(at, new URL(v, url).href); } catch (e) {}
    }));
  };
  const pages = new Map();
  function fetchPage(url) {
    const key = url.split('#')[0];
    if (!pages.has(key)) pages.set(key, fetch(key, {credentials: 'same-origin', cache: 'no-cache'}).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(t => new DOMParser().parseFromString(t, 'text/html')).catch(e => { pages.delete(key); throw e; }));
    return pages.get(key);
  }
  document.addEventListener('pointerover', e => {            // страницу можно подгрузить заранее, пока курсор над ссылкой
    if (!canSwap) return;
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    try { const u = new URL(a.href, location.href); if (u.host === location.host && /\.html$/.test(u.pathname) && u.pathname !== location.pathname) fetchPage(u.href).catch(() => {}); } catch (err) {}
  }, {passive: true});

  function syncHead(doc) {
    document.title = doc.title;
    const copy = (sel, at) => { const n = doc.querySelector(sel), c = document.querySelector(sel); if (n && c) c.setAttribute(at, n.getAttribute(at)); };
    copy('meta[name="description"]', 'content'); copy('link[rel="canonical"]', 'href');
    ['og:title', 'og:description', 'og:url', 'og:type', 'og:image'].forEach(k => copy(`meta[property="${k}"]`, 'content'));
    ['twitter:title', 'twitter:description', 'twitter:image'].forEach(k => copy(`meta[name="${k}"]`, 'content'));
    const rb = doc.querySelector('meta[name="robots"]'), rc = document.querySelector('meta[name="robots"]');
    if (rb && !rc) document.head.appendChild(rb.cloneNode()); else if (!rb && rc) rc.remove();
    $$('script[type="application/ld+json"]', document.head).forEach(x => x.remove());
    $$('script[type="application/ld+json"]', doc).forEach(x => { const sc = document.createElement('script'); sc.type = 'application/ld+json'; sc.textContent = x.textContent; document.head.appendChild(sc); });
  }
  function swapIn(doc, url) {
    const main = $('#main'), nm = doc.getElementById('main'); if (!main || !nm) throw new Error('no main');
    abs(nm, url);
    main.innerHTML = nm.innerHTML;
    ['data-page', 'data-nav'].forEach(at => { body.setAttribute(at, doc.body.getAttribute(at) || ''); });
    main.setAttribute('data-page', doc.body.getAttribute('data-page') || '');
    syncHead(doc);
    const nav = doc.body.getAttribute('data-nav') || '';
    $$('#nav .nl').forEach(a => { const on = a.getAttribute('data-nav') === nav; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  }

  let busy = false, pending = null;
  async function go(url, push) {
    if (busy) { pending = {url, push}; return; }
    busy = true;
    const u = new URL(url, location.href);
    setCurtainLabel(labelFor(u.href));
    curtain.classList.remove('out'); curtain.classList.add('in');
    let doc = null;
    const got = fetchPage(u.href).then(d => { doc = d; }).catch(() => {});
    await wait(820);                                        // полосы закрылись, читается титр раздела
    await got;
    if (!doc) { location.href = u.href; return; }            // подмена не удалась — обычный переход
    try {
      swapIn(doc, u.href);
      if (push) history.pushState({}, '', u.href);
    } catch (e) { location.href = u.href; return; }
    A.closeMenu(); A.closeSearch(); A.closeModal();
    window.scrollTo({top: 0, left: 0, behavior: 'instant'});
    M.cancelSmooth();
    const hdr = $('#hdr'); if (hdr) hdr.classList.remove('hide');
    A.initPage(document);
    M.scan($('#main'), 470);
    updateProgress();
    curtain.classList.remove('in'); curtain.classList.add('out');
    if (u.hash) setTimeout(() => { const el = document.getElementById(decodeURIComponent(u.hash.slice(1))); if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'}); }, 900);
    await wait(700);
    curtain.classList.remove('out');
    busy = false;
    if (pending) { const p = pending; pending = null; go(p.url, p.push); }
  }
  M.go = go;
  addEventListener('popstate', () => { if (canSwap) go(location.href, false); });

  let leaving = false;
  M.navigate = function (url) {                            // запасной путь (файл с диска): шторка закрывается, затем обычный переход
    if (canSwap) { go(url, true); return; }
    if (leaving) return; leaving = true;
    store.set('astreya:nav', JSON.stringify({t: Date.now()}));
    if (!curtain) { location.href = url; return; }
    setCurtainLabel(labelFor(url));
    curtain.classList.remove('out'); curtain.classList.add('in');
    setTimeout(() => { location.href = url; }, 820);
    setTimeout(() => { leaving = false; store.del('astreya:nav'); }, 4500);
  };
  M.liftAfterNav = async function () {                     // пришли обычным переходом: шторка уже закрыта — поднимаем её
    store.del('astreya:nav');
    curtain.classList.add('in');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    html.classList.remove('nav-in');
    curtain.classList.remove('in'); curtain.classList.add('out');
    await wait(700);
    curtain.classList.remove('out');
  };
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    let u; try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.protocol !== location.protocol || u.host !== location.host) return;             // внешние ссылки — как обычно
    if (!/\.html$|\/$/.test(u.pathname)) return;
    if (u.pathname === location.pathname && u.search === location.search) { if (u.hash) return; e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); return; }
    if (u.pathname === location.pathname && u.hash) return;                                // якорь на этой же странице
    e.preventDefault();
    A.closeMenu(); A.closeSearch();
    M.navigate(u.href);
  });
  addEventListener('pageshow', e => { if (e.persisted && curtain) { leaving = false; busy = false; curtain.classList.remove('in', 'out'); html.classList.remove('nav-in'); } });

  /* ---------- заставка (только главная, один раз за сессию) ---------- */
  function letters(el, text, gap) {
    el.innerHTML = Array.from(text).map((c, i) => c === ' ' ? `<span class="ch" style="width:${gap}em"></span>` : `<span class="ch"><span style="--i:${i}">${c}</span></span>`).join('');
  }
  function buildSplashLogo() {
    /* Знак собирается из слоёв: каждый двигается только transform/opacity, поэтому анимация идёт на компоновщике
       и не «замирает», пока главный поток занят первой вёрсткой страницы. */
    const art = $('#logo-art'), vb = '46 338 836 436';
    const svg = (cls, style, inner) => `<svg class="${cls}" style="${style}" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
    let mark = '', lts = '', i = 0;
    art.querySelectorAll('.pc').forEach(p => {
      const k = p.getAttribute('data-k'), d = `<path fill-rule="evenodd" d="${p.getAttribute('d')}"/>`;
      if (k === 'mountain' || k === 'arc') mark += d;                    // гора и дуга — один знак, двигаются вместе
      else lts += svg('sl-lt', `--i:${i++}`, d);
    });
    const pl = art.querySelector('.pl');
    $('#sp-logo').innerHTML = svg('sl-mark', '', mark) + lts + svg('sl-pearl', '', `<circle cx="${pl.getAttribute('cx')}" cy="${pl.getAttribute('cy')}" r="${pl.getAttribute('r')}" fill="url(#lg-p)"/>`);
  }
  async function endSplash() {
    const sp = $('#splash'); if (!sp || sp.dataset.leaving) return;
    sp.dataset.leaving = '1';
    $('#sp-in').classList.add('leave');
    await wait(320);
    curtain.classList.add('instant', 'in');                // шторка мгновенно закрывается тем же цветом
    sp.remove();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    curtain.classList.remove('instant', 'in'); curtain.classList.add('out');           // и поднимается полосами
    body.classList.remove('locked');
    finish(200);                                           // сцена начинается, когда полосы уже поднимаются
    await wait(520);
    curtain.classList.remove('out');
  }
  function runSplash() {
    buildSplashLogo();
    letters($('#sp-sub'), 'Профессиональная косметика', 1);
    body.classList.add('locked');
    $('#sp-in').addEventListener('click', endSplash);
    setTimeout(endSplash, 2150);
  }

  /* ---------- старт ---------- */
  function finish(delay) {
    html.classList.add('ready');
    M.done = true;
    measurePar();
    A.initPage(document);
    M.scan($('#main'), delay || 0);
    parKick();
    updateProgress();
  }
  M.boot = function () {
    try { history.scrollRestoration = 'manual'; } catch (e) {}
    /* ссылки шапки, подвала и поиска остаются в документе при подмене содержимого — делаем их абсолютными, чтобы они не «ехали» вместе с адресом */
    if (!window.__ASTREYA_BUNDLE) $$('#hdr [href], .ftr [href], #srch [href], #hdr [action], #srch [action]').forEach(n => { ['href', 'action'].forEach(at => { const v = n.getAttribute(at); if (v && v.charAt(0) !== '#') { try { n.setAttribute(at, new URL(v, location.href).href); } catch (e) {} } }); });
    const fromNav = html.classList.contains('nav-in');
    if ($('#splash') && !fromNav) { requestAnimationFrame(() => setTimeout(runSplash, 0)); return; }   // заставка — при каждой загрузке/обновлении страницы
    const sp = $('#splash'); if (sp) sp.remove();
    if (fromNav) { M.liftAfterNav(); finish(340); } else finish(60);
  };
  A.navigate = M.navigate;
  /* defer-скрипты выполняются при readyState «interactive», но до DOMContentLoaded — запускаемся после них (pages.js, hero-mark.js) */
  if (document.readyState === 'complete') M.boot(); else document.addEventListener('DOMContentLoaded', M.boot);
})();
