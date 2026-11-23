/* pg-start.js — «Старт со Стеллой»: поведение сцены. Диалог и расчёт плана — в js/sales.js (здесь они не меняются); оформление — css/pg-start.css, разметка — src/pages/start.js.
   Что делает:
   · шапка прозрачна над сценой и становится сплошной при прокрутке (html.ut-scrolled);
   · живой световой шар Стеллы над стойкой: «думает», пока Стелла печатает, радуется после реплики; кольцо вокруг аватара в шапке диалога показывает долю пройденных вопросов (--st-p);
   · клавиатура: 1–9 — выбрать вариант, стрелки — перейти между вариантами, «/» — в строку ввода, Esc — из строки ввода; после выбора с клавиатуры фокус переходит к вариантам следующего вопроса;
   · план: миниатюры упаковок у товаров (рендеры сайта, assets/showroom/pack-*), кнопки «Скопировать текстом» и «Распечатать» (печатается только план);
   · телефон: высота окна диалога следует за видимой областью (экранная клавиатура не закрывает строку ввода).
   Ничего не отправляется на сервер; всё снимается при уходе со страницы (переходы без перезагрузки). */
(function () {
  'use strict';
  const AT = (k, d) => window.Astreya.T(k, d);          // подписи интерфейса: правка заказчика (js/data.js → texts) или исходный текст
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const root = document.documentElement, body = document.body;
  const isStart = () => body.getAttribute('data-page') === 'start';
  const narrow = () => matchMedia('(max-width:760px)').matches;
  const track = (n, p) => { try { A.track(n, p || {}); } catch (e) {} };
  let M = null;

  /* ---------- шар Стеллы ---------- */
  function setMood(m) {
    if (!M || !M.orb || M.mood === m) return; M.mood = m;
    const svg = $('svg', M.orb); if (svg) svg.setAttribute('data-m', m);
    clearTimeout(M.moodT); if (m === 'happy') M.moodT = setTimeout(() => setMood('idle'), 1700);
  }

  /* ---------- миниатюры упаковок в плане ---------- */
  const rootPath = () => body.getAttribute('data-root') || '';
  function packs(res) {
    $$('.st-pk[data-pk]', res).forEach(pk => {
      if (pk.__done) return; pk.__done = true;
      const parts = pk.getAttribute('data-pk').split('/'), brand = parts[0], type = parts[1], base = rootPath() + 'assets/showroom/pack-';
      const img = new Image(); img.alt = ''; img.decoding = 'async';
      img.onerror = () => { img.onerror = () => pk.remove(); img.src = base + type + '-s.webp'; };
      img.onload = () => pk.appendChild(img);
      img.src = base + brand + '-' + type + '-s.webp';
    });
  }
  function actions(res) {
    const row = $('.plan-sec-actions', res); if (!row || $('[data-st-act]', row)) return;
    const again = $('[data-pl="again"]', row);
    const mk = (act, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost'; b.setAttribute('data-st-act', act); b.textContent = label; return b; };
    const a = mk('copytext', AT('ui.start.k1', AT('ui.start.k1', 'Скопировать текстом'))), p = mk('print', AT('ui.x_start.k1', 'Распечатать'));
    if (again) { row.insertBefore(a, again); row.insertBefore(p, again); } else { row.appendChild(a); row.appendChild(p); }
  }
  function stats(res) {
    const card = $('.plan-card', res); if (!card || $('.st-stats', card)) return;
    const pl = A.plural || ((n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; });
    const n1 = $$('.plan-brand', res).length, n2 = $$('.plan-prods li', res).length, n3 = $$('.plan-evs li', res).length;
    const items = [[n1, pl(n1, 'линейка', 'линейки', 'линеек')], [n2, pl(n2, 'товар', 'товара', 'товаров')], [n3, pl(n3, 'семинар', 'семинара', 'семинаров')]];
    const ul = document.createElement('ul'); ul.className = 'st-stats'; ul.setAttribute('aria-label', AT('ui.start.k2', AT('ui.start.k2', 'Состав плана')));
    ul.innerHTML = items.filter(x => x[0] > 0).map(x => '<li><b>' + x[0] + '</b><span>' + x[1] + '</span></li>').join(''); card.appendChild(ul);
  }
  function onClick(e) {
    const t = e.target.closest && e.target.closest('[data-st-act]'); if (!t || !M) return;
    const act = t.getAttribute('data-st-act');
    if (act === 'print') { track('plan_print'); window.print(); return; }
    if (act === 'copytext') {
      const pl = A.sales && A.sales.plan && A.sales.plan(), tx = pl && pl.text; if (!tx) return;
      const ok = () => A.toast && A.toast(AT('ui.start.k3', AT('ui.start.k3', 'План скопирован текстом')));
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tx).then(ok, () => A.toast && A.toast(tx.slice(0, 120) + '…')); else if (A.toast) A.toast(tx.slice(0, 120) + '…');
      track('plan_copy_text');
    }
  }

  /* ---------- синхронизация с диалогом ---------- */
  function sync() {
    if (!M) return; M.raf = 0;
    const h = M.host, log = $('.pchat-log', h), av = $('.pchat-av', h), comp = $('.pchat-comp', h);
    if (av) {
      const pr = $('.plan-prog', h); let p = 1;
      if (pr) { const n = +pr.getAttribute('aria-valuenow') || 1, t = +pr.getAttribute('aria-valuemax') || 1; p = Math.min(1, n / t); }
      if (+av.style.getPropertyValue('--st-p') !== p) av.style.setProperty('--st-p', p.toFixed(3));
    }
    const typing = !!(log && $('.pc-typing', log));
    if (typing) { M.typing = true; setMood('think'); } else if (M.typing) { M.typing = false; setMood('happy'); }
    const step = comp && !comp.hidden ? comp.getAttribute('data-step') || '' : '';
    if (step !== M.step) {
      M.step = step;
      if (step && M.kb) { const first = $$('.plan-opt:not([aria-disabled="true"])', comp)[0] || $('.pc-quick', comp); if (first) first.focus({preventScroll: true}); }
    }
    const res = $('.plan-res', h); if (res) { packs(res); actions(res); stats(res); }
  }

  /* ---------- клавиатура ---------- */
  function onKey(e) {
    if (!M || !isStart() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target, typing = !!(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || !!(t && t.isContentEditable);
    const input = $('.pchat-text', M.host);
    if (e.key === 'Escape' && t === input) { input.blur(); return; }
    if (e.key === '/' && !typing && input) { e.preventDefault(); input.focus(); return; }
    if (typing) return;
    M.kb = /^(\d|Enter| |Arrow.*)$/.test(e.key);
    const comp = $('.pchat-comp:not([hidden])', M.host); if (!comp) return;
    const opts = $$('.plan-opt', comp);
    if (/^[1-9]$/.test(e.key) && opts.length) { const o = opts[+e.key - 1]; if (o) { e.preventDefault(); o.click(); } return; }
    if (opts.length && /^Arrow(Up|Down|Left|Right)$/.test(e.key) && comp.contains(document.activeElement)) {
      const live = opts.filter(o => o.getAttribute('aria-disabled') !== 'true'), i = live.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault(); const d = /Down|Right/.test(e.key) ? 1 : -1, n = live[(i + d + live.length) % live.length]; n.focus({preventScroll: false});
    }
  }

  /* ---------- шапка и высота окна на телефоне ---------- */
  function onScroll() { root.classList.toggle('ut-scrolled', window.scrollY > 32); }
  function onViewport() {
    const page = $('.st-page'); if (!page) return;
    if (narrow() && window.visualViewport) page.style.setProperty('--st-vvh', Math.round(window.visualViewport.height) + 'px'); else page.style.removeProperty('--st-vvh');
  }
  function onFocusIn(e) {
    if (!narrow() || !e.target || !e.target.classList || !e.target.classList.contains('pchat-text')) return;
    const chat = $('.pchat', M.host); if (chat) setTimeout(() => { const r = chat.getBoundingClientRect(); if (r.top < 0 || r.top > 120) window.scrollTo({top: window.scrollY + r.top - (parseFloat(getComputedStyle(root).getPropertyValue('--hdr')) || 64) - 6, behavior: 'smooth'}); }, 260);
  }

  /* ---------- жизненный цикл ---------- */
  function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); M.offs.push(() => t.removeEventListener(ev, fn, o)); }
  function mount() {
    const host = $('[data-plan-app]'); if (!host) return;
    if (M && M.host === host && host.isConnected) { sync(); return; }
    teardown();
    M = {host: host, offs: [], obs: [], raf: 0, mood: 'idle', moodT: 0, kb: false, step: '', typing: false, orb: null};
    const orb = $('[data-st-orb]');
    if (orb && A.pearl) { orb.innerHTML = A.pearl('idle', true, ''); M.orb = orb; }
    if (orb && M.orb) {
      const bg = $('.st-bg'), still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce) and (min-width: 100000px)').matches;
      let gz = 0, px = 0, py = 0;
      const place = () => { const r = orb.getBoundingClientRect(), b = bg && bg.getBoundingClientRect(); if (bg && b && r.width) { bg.style.setProperty('--ox', Math.round(r.left + r.width / 2 - b.left) + 'px'); bg.style.setProperty('--oy', Math.round(r.top + r.height / 2 - b.top) + 'px'); } };
      /* «взгляд» Стеллы: лицо целиком поворачивается к курсору, глаза на лице неподвижны (иначе они «разъезжаются» с ртом и щеками). Поворот зависит только от движения курсора: направление на курсор,
         амплитуда растёт с расстоянием (предел ≈ 200 px) — до ±3,6 ед. вьюбокса по горизонтали и ±2,8 по вертикали (≈ ±19 px на орбе 250 px). Прокрутка страницы положение не меняет. «Думает/спит» ведёт CSS. */
      const AX = 3.6, AY = 2.8;
      const look = () => { gz = 0; const svg = $('svg', orb), r = orb.getBoundingClientRect(); if (!svg || !r.width) return; const m = svg.getAttribute('data-m'); if (m === 'think' || m === 'sleep') return;
        const dx = px - (r.left + r.width * .5), dy = py - (r.top + r.height * .56), d = Math.hypot(dx, dy) || 1, a = Math.min(1, d / 200);
        svg.style.setProperty('--ex', (dx / d * Math.pow(a, .8) * AX).toFixed(2) + 'px'); svg.style.setProperty('--ey', (dy / d * Math.pow(a, .8) * AY).toFixed(2) + 'px'); };
      const rest = () => { const svg = $('svg', orb); if (svg) { svg.style.setProperty('--ex', '0px'); svg.style.setProperty('--ey', '0px'); } };
      if (!still) {
        on(window, 'pointermove', e => { if (e.pointerType === 'touch') return; px = e.clientX; py = e.clientY; M.seen = true; if (!gz) gz = requestAnimationFrame(look); }, {passive: true});
        on(document.documentElement, 'mouseleave', () => { M.seen = false; rest(); });
      }
      on(window, 'resize', place, {passive: true}); place(); setTimeout(place, 400); setTimeout(place, 1600);
    }
    if (window.MutationObserver) { const mo = new MutationObserver(() => { if (M && !M.raf) M.raf = requestAnimationFrame(sync); }); mo.observe(host, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-step', 'aria-valuenow']}); M.obs.push(mo); }
    on(window, 'scroll', onScroll, {passive: true}); on(document, 'keydown', onKey); on(document, 'click', onClick);
    on(document, 'pointerdown', () => { if (M) M.kb = false; }, {passive: true}); on(document, 'focusin', onFocusIn);
    on(window, 'resize', onViewport, {passive: true}); if (window.visualViewport) on(window.visualViewport, 'resize', onViewport, {passive: true});
    onScroll(); onViewport(); sync();
  }
  function teardown() {
    if (!M) return; M.offs.forEach(f => f()); M.obs.forEach(o => o.disconnect()); clearTimeout(M.moodT); if (M.raf) cancelAnimationFrame(M.raf);
    M = null; root.classList.remove('ut-scrolled');
  }

  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); if (isStart()) mount(); else teardown(); };
  if (isStart()) mount();          // файл подключён уже на странице (переход без перезагрузки)
})();
