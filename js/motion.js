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
    fadeItems.forEach(el => { el.style.opacity = (1 - y * .9).toFixed(3); el.style.transform = `translate3d(0,${(-y * 40).toFixed(1)}px,0)`; });
    parRaf = moving ? requestAnimationFrame(parTick) : 0;
  }
  function parKick() { if (!parRaf && M.done && (parItems.length || fadeItems.length)) parRaf = requestAnimationFrame(parTick); }
  addEventListener('resize', () => { measurePar(); parKick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measurePar(); parKick(); });

  /* ---------- курсор: свет «жемчужины», 3D-наклон карточек, магнитные кнопки ---------- */
  const hp = {x: 0, y: 0, tx: 0, ty: 0, raf: 0};
  function hpTick() {
    const w = $('.pearl-wrap'); if (!w) { hp.raf = 0; return; }
    hp.x += (hp.tx - hp.x) * .07; hp.y += (hp.ty - hp.y) * .07;
    w.style.setProperty('--px', hp.x.toFixed(3)); w.style.setProperty('--py', hp.y.toFixed(3));
    w.style.setProperty('--lx', (33 + hp.x * 15).toFixed(1) + '%'); w.style.setProperty('--ly', (27 + hp.y * 13).toFixed(1) + '%');
    hp.raf = (Math.abs(hp.tx - hp.x) > .002 || Math.abs(hp.ty - hp.y) > .002) ? requestAnimationFrame(hpTick) : 0;
  }
  let tiltEl = null, magEl = null;
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      if (scrollY < innerHeight && $('.pearl-wrap')) { hp.tx = e.clientX / innerWidth * 2 - 1; hp.ty = e.clientY / innerHeight * 2 - 1; if (!hp.raf) hp.raf = requestAnimationFrame(hpTick); }
      const card = e.target.closest ? e.target.closest('.card.hov, .bgrid:not(.has-active) .bcard') : null;
      if (card !== tiltEl) { if (tiltEl) { tiltEl.style.setProperty('--rx', '0deg'); tiltEl.style.setProperty('--ry', '0deg'); } tiltEl = card; }
      if (card) {
        const r = card.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5, k = r.width > 520 ? 3 : 8;
        card.style.setProperty('--ry', (nx * k).toFixed(2) + 'deg'); card.style.setProperty('--rx', (-ny * k).toFixed(2) + 'deg');
      }
      const btn = e.target.closest ? e.target.closest('.btn') : null;
      if (btn !== magEl) { if (magEl) { magEl.style.setProperty('--mx', '0px'); magEl.style.setProperty('--my', '0px'); } magEl = btn; }
      if (btn) { const r = btn.getBoundingClientRect(); btn.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * .16).toFixed(1) + 'px'); btn.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * .24).toFixed(1) + 'px'); }
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

  /* ---------- шторка: переходы между страницами ---------- */
  const curtain = $('#curtain');
  const LABELS = {'catalog': 'Каталог', 'brands': 'Бренды', 'brand': 'Бренд', 'training': 'Обучение', 'news': 'Новости', 'company': 'Компания', 'contacts': 'Контакты', 'partners': 'Партнёрам', 'search': 'Поиск', 'products': 'Каталог', 'index': 'Астрея', 'privacy': 'Документы', 'terms': 'Документы'};
  const labelFor = url => {
    const seg = new URL(url, location.href).pathname.split('/').filter(Boolean);
    const last = (seg[seg.length - 1] || 'index').replace(/\.html$/, '');
    const dir = seg.length > 1 ? seg[seg.length - 2] : '';
    if (dir === 'brands') return 'Бренды'; if (dir === 'products') return 'Каталог'; if (dir === 'training') return 'Обучение'; if (dir === 'news') return 'Новости';
    return LABELS[last] || 'Астрея';
  };
  function setCurtainLabel(t) {
    const ct = $('.ct', curtain); if (!ct) return;
    ct.innerHTML = `<small>Астрея</small><b>${Array.from(t).map((c, i) => c === ' ' ? '<span class="ch" style="width:.28em"></span>' : `<span class="ch"><span style="--i:${i}">${c}</span></span>`).join('')}</b><span class="ct-line"></span>`;
  }
  if (curtain) curtain.innerHTML = '<div class="cs">' + Array.from({length: 8}, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div><div class="ct" aria-hidden="true"></div>';

  let leaving = false;
  M.navigate = function (url, label) {                     // переход на другую страницу: шторка закрывается, затем обычная навигация
    if (leaving) return; leaving = true;
    store.set('astreya:nav', label || labelFor(url));
    if (!curtain) { location.href = url; return; }
    setCurtainLabel(label || labelFor(url));
    curtain.classList.remove('out'); curtain.classList.add('in');
    setTimeout(() => { location.href = url; }, 640);
    setTimeout(() => { leaving = false; }, 3000);          // на случай, если навигация не состоялась
  };
  M.openCurtain = async function () {                      // мы пришли по переходу: шторка уже закрыта, поднимаем её
    const label = store.get('astreya:nav'); store.del('astreya:nav');
    if (label) setCurtainLabel(label);
    curtain.classList.add('in');                           // .nav-in держит полосы закрытыми до первой отрисовки
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    html.classList.remove('nav-in');
    curtain.classList.remove('in'); curtain.classList.add('out');
    await wait(760);
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
    (A.navigate || M.navigate)(u.href, a.getAttribute('data-ct') || null);
  });
  addEventListener('pageshow', e => { if (e.persisted && curtain) { leaving = false; curtain.classList.remove('in', 'out'); html.classList.remove('nav-in'); } });

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
    finish(340);                                           // сцена начинается, когда полосы уже поднимаются
    await wait(720);
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
    const first = !html.classList.contains('seen'), fromNav = html.classList.contains('nav-in');
    store.set('astreya:seen', '1');
    try { history.scrollRestoration = 'manual'; } catch (e) {}
    if (body.getAttribute('data-page') === 'home' && first && $('#splash')) { requestAnimationFrame(() => setTimeout(runSplash, 0)); return; }
    const sp = $('#splash'); if (sp) sp.remove();
    if (fromNav) { M.openCurtain(); finish(340); } else finish(60);
  };
  A.navigate = M.navigate;
  /* defer-скрипты выполняются при readyState «interactive», но до DOMContentLoaded — запускаемся после них (pages.js, hero-mark.js) */
  if (document.readyState === 'complete') M.boot(); else document.addEventListener('DOMContentLoaded', M.boot);
})();
