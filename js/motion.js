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
    if (sRaf && Math.abs(scrollY - sCur) > 3) { cancelAnimationFrame(sRaf); sRaf = 0; sLast = 0; sVel = 0; }   // внешний скролл (клавиши, якорь) отменяет инерцию
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, {passive: true});
  addEventListener('resize', updateProgress);

  /* ---------- инерционное колесо мыши (только точный указатель; тач остаётся нативным) ----------
     Щелчки колеса (по 100 px) без «плавной прокрутки» браузера дают ступеньки, а простая экспонента к цели при каждом щелчке меняет скорость скачком
     (заметная «пульсация»). Поэтому цель двигается щелчками, а страницу к ней ведёт пружина с критическим затуханием: скорость непрерывна,
     остановка мягкая. Подбор жёсткости — tools/jar-bench/scroll-sim.js (ω = 10: шероховатость движения в 3–4 раза ниже экспоненты при той же задержке).
     Работает везде одинаково, в том числе на сцене с баночкой: пока сглаживание включали и выключали по зоне, на границе страница «дёргалась» назад. */
  let sTarget = 0, sCur = 0, sVel = 0, sRaf = 0, sLast = 0;
  const S_OMEGA = 10;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  const scrollsInside = el => { for (let n = el; n && n !== body && n !== html; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1) return true; } return false; };
  function sStep(t) {
    const dt = sLast ? Math.min(.05, Math.max(.004, (t - sLast) / 1000)) : .0167; sLast = t;
    const e = Math.exp(-S_OMEGA * dt), d = sCur - sTarget, c = sVel + S_OMEGA * d;        // точное решение критически затухающей пружины на шаг dt
    sCur = sTarget + (d + c * dt) * e; sVel = (sVel - S_OMEGA * c * dt) * e;
    const mx = maxScroll();
    if (sCur < 0) { sCur = 0; sVel = 0; } else if (sCur > mx) { sCur = mx; sVel = 0; }      // у краёв страницы скорость гасим
    if (Math.abs(sTarget - sCur) < .5 && Math.abs(sVel) < 6) { sCur = sTarget; sVel = 0; sRaf = 0; sLast = 0; } else sRaf = requestAnimationFrame(sStep);
    window.scrollTo({top: sCur, behavior: 'instant'});
  }
  M.cancelSmooth = () => { cancelAnimationFrame(sRaf); sRaf = 0; sLast = 0; sVel = 0; sTarget = sCur = scrollY; };
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    addEventListener('wheel', e => {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (body.classList.contains('locked') || scrollsInside(e.target)) return;
      e.preventDefault();
      let dy = e.deltaY; if (e.deltaMode === 1) dy *= 34; else if (e.deltaMode === 2) dy *= innerHeight;
      if (!sRaf) { sCur = sTarget = scrollY; sVel = 0; }
      if (dy * sVel < 0) sVel = 0;                                  // смена направления: инерцию прежнего движения гасим, иначе страница «проскакивает» вперёд
      sTarget = Math.max(0, Math.min(maxScroll(), sTarget + dy));
      if (!sRaf) sRaf = requestAnimationFrame(sStep);
    }, {passive: false});
  }

  /* ---------- параллакс слоёв и уход hero-текста ---------- */
  let parItems = [], fadeItems = [], parRaf = 0, heroBase = 0;
  function measurePar() {
    scrollNow = scrollY;
    heroBase = A.heroBase ? A.heroBase() : 0;                 // с вступлением (баночка) hero начинается не с нуля прокрутки: уход текста считаем от его места
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
    const y = Math.max(0, Math.min(1, (scrollNow - heroBase) / (vh * .75)));
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
      if (scrollY - heroBase < innerHeight && $('.pearl-wrap')) { hp.tx = e.clientX / innerWidth * 2 - 1; hp.ty = e.clientY / innerHeight * 2 - 1; if (!hp.raf) hp.raf = requestAnimationFrame(hpTick); }
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
  const pathInfo = url => {
    const seg = new URL(url, location.href).pathname.split('/').filter(Boolean);
    return {seg, last: (seg[seg.length - 1] || 'index').replace(/\.html$/, ''), dir: seg.length > 1 ? seg[seg.length - 2] : ''};
  };
  const brandFor = url => { const {last, dir} = pathInfo(url); return dir === 'brands' ? (A.D.brands || []).find(x => x.id === last) || null : null; };
  const labelFor = url => {
    const {seg, last, dir} = pathInfo(url);
    if (dir === 'brands') { const b = brandFor(url); return b ? b.name : 'Бренды'; }
    if (dir === 'products') return 'Каталог'; if (dir === 'training') return 'Обучение'; if (dir === 'news') return 'Новости и акции';
    return last === 'index' || !seg.length ? 'Главная' : (LABELS[last] || 'Астрея');
  };
  /* титр шторки: сверху — белый знак «Астрея» (вместо маленькой надписи); по центру — название раздела, а для страницы бренда — его белый логотип */
  const MARK = '<span class="ct-astreya" aria-hidden="true"><svg viewBox="49.8 341.6 829.5 428.9"><use href="#logo-art"/></svg></span>';
  function setCurtainLabel(t, brand) {
    const ct = $('.ct', curtain); if (!ct) return;
    const src = brand && brand.logo ? A.assetUrl(brand.logo) : '';
    const title = src
      ? `<span class="ct-brand"><img src="${src}" alt="" style="--lw:${Math.round(Math.sqrt(60000 * brand.logoW / brand.logoH) * (brand.logoScale || 1))}"></span>`
      : `<b>${Array.from(t).map((c, i) => c === ' ' ? '<span class="ch" style="width:.28em"></span>' : `<span class="ch"><span style="--i:${i}">${c}</span></span>`).join('')}</b>`;
    ct.innerHTML = MARK + title + '<span class="ct-line"></span>';
  }
  const curtainLabelFor = url => setCurtainLabel(labelFor(url), brandFor(url));
  if (curtain && !$('.cs', curtain)) curtain.innerHTML = '<div class="cs">' + Array.from({length: 8}, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div><div class="ct" aria-hidden="true"></div>';
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => (A.D.brands || []).forEach(b => { const u = b.logo && A.assetUrl(b.logo); if (u) { const i = new Image(); i.decoding = 'async'; i.src = u; } }));
  M.curtainLabel = setCurtainLabel; M.labelFor = labelFor; M.curtainLabelFor = curtainLabelFor;

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
  document.addEventListener('focusin', e => { if (canSwap && e.target && (e.target.id === 'srch-q' || (e.target.closest && e.target.closest('.nav-search')))) { try { fetchPage(new URL('search.html', location.href.replace(/[^/]*$/, '')).href).catch(() => {}); } catch (err) {} } });
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
  /* у страниц разный набор стилей и скриптов (вступление с баночкой — css/jar.css + js/jar.js — есть только у главной). Если подменяем страницу на ту, чьих файлов
     в документе ещё нет (например, возврат на главную по логотипу из каталога), подключаем их и ждём загрузки: иначе блоки приходят без оформления и скриптов */
  /* ключ файла — «папка/имя» без адреса и версии: относительные ссылки уже загруженных <link>/<script> после pushState читаются от адреса новой страницы и сравнивать полные URL нельзя */
  const assetKey = h => String(h).split('#')[0].split('?')[0].split('/').slice(-2).join('/');
  function syncAssets(doc, base) {
    const have = sel => Array.from(document.querySelectorAll(sel)).map(n => assetKey(n.getAttribute('href') || n.getAttribute('src')));
    const css = have('link[rel="stylesheet"][href]'), js = have('script[src]'), jobs = [];
    const add = (mk, href) => jobs.push(new Promise(res => { const n = mk(); n.onload = n.onerror = () => res(); document.head.appendChild(n); setTimeout(res, 8000); }));
    doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(l => { let h; try { h = new URL(l.getAttribute('href'), base).href; } catch (e) { return; } if (css.indexOf(assetKey(h)) < 0) { css.push(assetKey(h)); add(() => { const n = document.createElement('link'); n.rel = 'stylesheet'; n.href = h; return n; }); } });
    doc.querySelectorAll('script[src]').forEach(sc => { let h; try { h = new URL(sc.getAttribute('src'), base).href; } catch (e) { return; } if (js.indexOf(assetKey(h)) < 0) { js.push(assetKey(h)); add(() => { const n = document.createElement('script'); n.src = h; n.async = false; return n; }); } });
    return Promise.all(jobs);
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

  /* Лого и ссылки на главную ведут к основной странице (герою), а не в начало вступления с баночкой: вступление остаётся выше героя — до него можно долистать вверх (его кадры при этом перематываются назад).
     При первой загрузке сайта главная по-прежнему открывается с вступления. Без вступления (выключено или нет canvas) герой и есть верх страницы. */
  const isHome = u => /(^|\/)(index\.html)?$/.test(u.pathname);
  M.heroTop = () => { const jar = document.getElementById('jar-story'); return jar && jar.offsetHeight && A.heroBase ? A.heroBase() : 0; };
  M.scrollHome = () => window.scrollTo({top: M.heroTop(), behavior: 'smooth'});
  let busy = false, pending = null;
  /* quiet — тихий переход (поиск): без шторки и заставки, страница подменяется, как только пришла, и мягко проявляется */
  async function go(url, push, quiet) {
    if (busy) { pending = {url, push, quiet}; return; }
    busy = true;
    const u = new URL(url, location.href);
    if (!quiet) { curtainLabelFor(u.href); curtain.classList.remove('out'); curtain.classList.add('in'); }
    let doc = null;
    const got = fetchPage(u.href).then(d => { doc = d; }).catch(() => {});
    if (!quiet) await wait(820);                            // полосы закрылись, читается титр раздела
    await got;
    if (!doc) { if (quiet) store.set('astreya:nav', JSON.stringify({t: Date.now(), q: 1})); location.href = u.href; return; }            // подмена не удалась — обычный переход
    await syncAssets(doc, u.href);
    try {
      swapIn(doc, u.href);
      if (push) history.pushState({}, '', u.href);
    } catch (e) { if (quiet) store.set('astreya:nav', JSON.stringify({t: Date.now(), q: 1})); location.href = u.href; return; }
    A.closeMenu(); A.closeSearch(); A.closeModal();
    window.scrollTo({top: 0, left: 0, behavior: 'instant'});
    M.cancelSmooth();
    const hdr = $('#hdr'); if (hdr) hdr.classList.remove('hide');
    A.initPage(document);
    const toHero = isHome(u) && !u.hash && M.heroTop() > 0;           // переход на главную: открываем героя, а не вступление (оно выше)
    if (toHero) window.scrollTo({top: M.heroTop(), left: 0, behavior: 'instant'});
    M.scan($('#main'), quiet ? 40 : 470);
    updateProgress();
    if (quiet) { const m = $('#main'); m.classList.remove('qfade'); void m.offsetWidth; m.classList.add('qfade'); }
    else { curtain.classList.remove('in'); curtain.classList.add('out'); }
    if (u.hash) setTimeout(() => { const el = document.getElementById(decodeURIComponent(u.hash.slice(1))); if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'}); }, quiet ? 200 : 900);
    if (!quiet) { await wait(700); curtain.classList.remove('out'); } else await wait(60);
    busy = false;
    if (pending) { const p = pending; pending = null; go(p.url, p.push, p.quiet); }
  }
  M.go = go;
  addEventListener('popstate', () => { if (canSwap) go(location.href, false); });

  let leaving = false;
  M.navigate = function (url, quiet) {                     // запасной путь (файл с диска): шторка закрывается, затем обычный переход
    if (canSwap) { go(url, true, quiet); return; }
    if (leaving) return; leaving = true;
    try { const tu = new URL(url, location.href); if (isHome(tu) && !tu.hash) store.set('astreya:hero', '1'); } catch (e) {}          // обычный переход (файл с диска): главная откроется на герое — см. M.boot
    if (quiet) { store.set('astreya:nav', JSON.stringify({t: Date.now(), q: 1})); location.href = url; return; }
    store.set('astreya:nav', JSON.stringify({t: Date.now()}));
    if (!curtain) { location.href = url; return; }
    curtainLabelFor(url);
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
  const isSearchUrl = u => /(^|\/)search\.html$/.test(u.pathname);
  /* форма поиска (шапка, окно поиска, страница поиска): раньше уходила обычным переходом — перезагрузка, заставка и шторка. Теперь страница результатов подменяется тихо */
  document.addEventListener('submit', e => {
    const f = e.target; if (!f || !f.getAttribute || e.defaultPrevented) return;
    const act = f.getAttribute('action'); if (!act || (f.getAttribute('method') || 'get').toLowerCase() !== 'get') return;
    let u; try { u = new URL(f.action || act, location.href); } catch (err) { return; }
    if (u.host !== location.host || !isSearchUrl(u) || !f.elements || !f.elements.q) return;
    e.preventDefault();
    const q = String(f.elements.q.value || '').trim();
    u.search = q ? '?q=' + encodeURIComponent(q) : '';
    A.closeMenu();
    if (u.pathname === location.pathname && u.search === location.search) { A.closeSearch(); return; }
    M.navigate(u.href, true);
  });
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    let u; try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.protocol !== location.protocol || u.host !== location.host) return;             // внешние ссылки — как обычно
    if (!/\.html$|\/$/.test(u.pathname)) return;
    if (u.pathname === location.pathname && u.search === location.search) { if (u.hash) return; e.preventDefault(); A.closeMenu(); M.scrollHome(); return; }
    if (u.pathname === location.pathname && u.hash) return;                                // якорь на этой же странице
    e.preventDefault();
    A.closeMenu(); A.closeSearch();
    M.navigate(u.href, isSearchUrl(u));                         // переход к результатам поиска — без шторки
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
    await wait(840);                                       // последняя полоса заканчивает через 8×38 + 520 мс
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
    /* обновление страницы (F5, «перезагрузить») на главной открывает героя, а не вступление с баночкой: вступление — для захода на сайт, а не для обновления */
    const reloaded = document.body.getAttribute('data-page') === 'home' && !location.hash && (() => { try { const n = performance.getEntriesByType('navigation')[0]; return n ? n.type === 'reload' : !!(performance.navigation && performance.navigation.type === 1); } catch (e) { return false; } })();
    if (store.get('astreya:hero') || reloaded) { store.del('astreya:hero'); const ht = M.heroTop(); if (ht > 0) window.scrollTo({top: ht, left: 0, behavior: 'instant'}); }
    const fromNav = html.classList.contains('nav-in');
    if (html.classList.contains('nav-quiet')) { store.del('astreya:nav'); html.classList.remove('nav-quiet'); const sq = $('#splash'); if (sq) sq.remove(); finish(40); return; }          // тихий переход обычной загрузкой (поиск): ни заставки, ни шторки
    if ($('#splash') && !fromNav) { requestAnimationFrame(() => setTimeout(runSplash, 0)); return; }   // заставка — при каждой загрузке/обновлении страницы
    const sp = $('#splash'); if (sp) sp.remove();
    if (fromNav) { M.liftAfterNav(); finish(340); } else finish(60);
  };
  A.navigate = M.navigate;
  /* defer-скрипты выполняются при readyState «interactive», но до DOMContentLoaded — запускаемся после них (pages.js, hero-mark.js) */
  if (document.readyState === 'complete') M.boot(); else document.addEventListener('DOMContentLoaded', M.boot);
})();
