/* «Компания» (страница v2 «ASTREYA Grand Atrium»): поведение поверх разметки src/pages/company.js. Всё необязательное — без этого файла страница статична и читаема.
   Здесь: прозрачная шапка над первым экраном; навигатор по девяти сценам (IntersectionObserver); «шаг вглубь атриума» на первом экране и мягкий параллакс фонов сцен
   (только transform/opacity через CSS-переменные --hp/--p, обновляются в requestAnimationFrame и только у видимых сцен, прокрутка не блокируется); пылинки в лучах (canvas, 24 штуки,
   пауза вне экрана); наклон панелей доверия за указателем; карточки городов (наведение / фокус / касание); калькулятор скидки по порогам из data/site.json.
   При prefers-reduced-motion движения нет (параллакс, пылинки и наклон отключены). Очистка при уходе со страницы: слушатели, rAF, observers. */
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
    const html = document.documentElement, hero = $('.ca-entry', root), vis = new Set(), tick = {raf: 0};
    const alive = () => root.isConnected && document.body.getAttribute('data-page') === 'company';

    /* ---- кадр: шапка, шаг вглубь, параллакс ---- */
    const pars = $$('[data-ca-par]', root);
    function frame() {
      tick.raf = 0; if (!alive()) return teardown();
      const vh = window.innerHeight || 800, hb = hero.getBoundingClientRect();
      html.classList.toggle('ca-scrolled', hb.bottom < 90);
      if (!still) {
        root.style.setProperty('--hp', clamp(-hb.top / Math.max(1, hb.height), 0, 1).toFixed(3));
        pars.forEach(el => { if (!vis.has(el)) return; const r = el.getBoundingClientRect(); el.style.setProperty('--p', clamp((r.top + r.height / 2 - vh / 2) / vh, -1, 1).toFixed(3)); });
      }
    }
    const ask = () => { if (!tick.raf) tick.raf = requestAnimationFrame(frame); };
    on(window, 'scroll', ask, {passive: true}); on(window, 'resize', ask); off.push(() => { if (tick.raf) cancelAnimationFrame(tick.raf); });

    if ('IntersectionObserver' in window) {
      const pio = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) vis.add(e.target); else vis.delete(e.target); }); ask(); }, {rootMargin: '20% 0px'});
      pars.forEach(el => pio.observe(el)); off.push(() => pio.disconnect());
    } else { pars.forEach(el => vis.add(el)); }
    ask();

    /* ---- пылинки в лучах света (canvas, только на первом экране и не при reduced-motion) ---- */
    const cv = $('[data-ca-dust]', root);
    if (cv && !still && cv.getContext) {
      const cx = cv.getContext('2d'), N = 24, ps = []; let W = 0, H = 0, run = false, raf = 0, last = 0;
      const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 1.5); W = cv.width = Math.max(1, Math.round(r.width * d)); H = cv.height = Math.max(1, Math.round(r.height * d)); };
      for (let i = 0; i < N; i++) ps.push({x: Math.random(), y: Math.random(), r: .6 + Math.random() * 1.6, s: .004 + Math.random() * .01, a: .25 + Math.random() * .5, ph: Math.random() * 6.28});
      const draw = t => {
        raf = 0; if (!run) return; const dt = Math.min(60, t - last) / 1000; last = t; cx.clearRect(0, 0, W, H);
        ps.forEach(p => { p.y -= p.s * dt * 6; p.x += Math.sin(t / 2600 + p.ph) * .00012; if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); } const k = .55 + .45 * Math.sin(t / 1700 + p.ph); cx.fillStyle = 'rgba(255,247,226,' + (p.a * k).toFixed(2) + ')'; cx.beginPath(); cx.arc(p.x * W, p.y * H, p.r * (W / 1400 + .5), 0, 6.283); cx.fill(); });
        raf = requestAnimationFrame(draw);
      };
      const go = v => { if (v === run) return; run = v; if (run) { size(); last = performance.now(); raf = requestAnimationFrame(draw); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      if ('IntersectionObserver' in window) { const dio = new IntersectionObserver(es => go(es.some(e => e.isIntersecting))); dio.observe(hero); off.push(() => dio.disconnect()); } else go(true);
      on(window, 'resize', () => { if (run) size(); }); off.push(() => { run = false; if (raf) cancelAnimationFrame(raf); });
    }

    /* ---- панели доверия: лёгкий наклон за указателем ---- */
    if (!still && window.matchMedia && window.matchMedia('(hover:hover)').matches) {
      $$('[data-tilt]', root).forEach(el => {
        on(el, 'pointermove', e => { const r = el.getBoundingClientRect(); el.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 5).toFixed(2) + 'deg'); el.style.setProperty('--rx', ((.5 - (e.clientY - r.top) / r.height) * 4).toFixed(2) + 'deg'); });
        on(el, 'pointerleave', () => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); });
      });
    }

    /* ---- география: одна раскрытая карточка (наведение, фокус, касание) ---- */
    const cities = $$('.ca-city', root);
    if (cities.length) {
      const mks = $$('.ca-mk', root);
      const open = li => { cities.forEach(c => { const o = c === li; c.classList.toggle('on', o); const b = $('.ca-node', c); if (b) b.setAttribute('aria-expanded', String(o)); }); mks.forEach(m => m.classList.toggle('on', m.getAttribute('data-city') === li.getAttribute('data-city'))); };
      open(cities[0]);
      mks.forEach(m => { const li = cities.filter(c => c.getAttribute('data-city') === m.getAttribute('data-city'))[0]; if (!li) return; on(m, 'click', () => open(li)); on(m, 'focus', () => open(li)); on(m, 'pointerenter', e => { if (e.pointerType === 'mouse') open(li); }); });
      cities.forEach(li => {
        on(li, 'pointerenter', e => { if (e.pointerType === 'mouse') open(li); });
        on(li, 'focusin', () => open(li));
        const b = $('.ca-node', li); if (b) on(b, 'click', () => open(li));
      });
    }

    /* ---- калькулятор скидки (пороги — data/site.json → discounts, как на странице «Партнёрам») ---- */
    const box = $('[data-ca-calc]', root), r = box && $('#ca-range', box);
    if (r) {
      const DS = ((window.ASTREYA_DATA || {}).site || {}).discounts || [], rub = A.rub || (n => String(n) + ' ₽');
      const sum = $('#ca-sum', box), tier = $('#ca-tier', box), save = $('#ca-save', box), tiers = $$('.ca-tiers li', box);
      const paint = () => {
        const v = +r.value; let t = -1; DS.forEach((d, i) => { if (v >= d.from) t = i; });
        sum.textContent = rub(v);
        tier.textContent = t >= 0 ? 'Ваша скидка — ' + DS[t].pct + '%' : (DS[0] ? 'До первой скидки — ' + rub(DS[0].from - v) : '');
        save.textContent = t >= 0 ? rub(Math.round(v * DS[t].pct / 100)) : '—';
        tiers.forEach((li, i) => li.classList.toggle('reached', i <= t));
        r.setAttribute('aria-valuetext', rub(v) + (t >= 0 ? ', скидка ' + DS[t].pct + '%' : ', скидки пока нет'));
      };
      on(r, 'input', paint); on(r, 'change', () => { if (A.track) A.track('calc_company', {sum: +r.value}); }); paint();
    }

    function teardown() { if (!td) return; const f = off.slice(); td = null; f.forEach(x => { try { x(); } catch (e) {} }); html.classList.remove('ca-scrolled'); }
    td = teardown;
    on(document, 'astreya:page', () => { setTimeout(() => { if (!alive()) teardown(); }, 0); });
  }

  const prev = A.pages.company;
  A.pages.company = function () { if (prev) prev.apply(this, arguments); init(); };
  if (document.body && document.body.getAttribute('data-page') === 'company') init();
})();
