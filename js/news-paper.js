/* news-paper.js — интерактивная газета (страница «Новости», разметка — src/pages/news.js, стили — css/news-paper.css).
   Что здесь:
   1. Камера. Страница прокручивается как обычно; пока сцена «прилипла», прокрутка ведёт камеру: от взгляда сверху-сбоку на стол к виду на газету в упор (наклон rotateX, приближение,
      газета разворачивается: на пороге p ≈ 0,55 обложка сама откидывается — пружиной, а не по прокрутке). Прокрутка не блокируется; «Открыть газету» мягко доезжает до конца входа.
   2. Листание. Лист — реальный объект: пружина по реальному времени кадра (колебание с затуханием), на время движения лист собирается из полос (NS) с нарастающим углом — изгиб:
      кромка отстаёт при движении (воздух), подтягивается при захвате рукой, отлипает на наведении у угла; затенение/блик считаются для каждой полосы от её угла к свету (слева сверху),
      у соседних страниц — тень от поднятого листа и складка у корешка. Лист можно взять мышью/пальцем за страницу и вести (кромка следует за рукой), отпустить — лист доворачивается
      с той скоростью, с какой его отпустили. Кнопки, точки страниц, клавиши ← →, оглавление (несколько листов подряд — «веером»).
   3. Фильтр по категории (приглушает чужие материалы, показывает, на каких страницах найденное), оглавление, ссылки вида #s3 / #a-n4 / #read-n4 и прежний ?cat=.
   4. Чтение статьи поверх газеты (возврат на тот же разворот), подсказки Стеллы (существующий помощник: data-act=asst-chip / asst-open), подписка (прежняя форма и обработчик).
   5. Телефон и узкое окно: одна страница, свайп; длинное прокручивается внутри страницы. «Меньше движения»: без входа и без пружины — смена страницы растворением.
   Без CSS-3D остаётся список-архив (data-np-fallback). Все слушатели window снимаются, когда страницу подменили (переход без перезагрузки). */
(function () {
  'use strict';
  const A = window.Astreya; if (!A) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [].slice.call((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const NS = 9, OMEGA = 8.6, ZETA = .74;                 // полос на лист; собственная частота и затухание пружины листа (≈ 1 с на полный поворот)
  const NLEAF = 6, NPAGE = 12;
  let inst = null;

  function create(root) {
    const ac = new AbortController(), sig = {signal: ac.signal};
    const stage = $('[data-np-stage]', root), sticky = $('[data-np-sticky]', root), cam = $('[data-np-cam]', root), rig = $('[data-np-rig]', root), book = $('[data-np-book]', root);
    const pageEls = $$('.np-pg', $('[data-np-pages]', root)).sort((a, b) => +a.dataset.pg - +b.dataset.pg);
    const data = JSON.parse($('#np-data').textContent);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const S = {mode: 'spread', pw: 500, ph: 676, p: reduced ? 1 : 0, cur: 0, hh: 84, filter: 'all', ov: null, userFlip: false, drag: null, moving: false, introDist: 1, hash: ''};
    let leaves = [], edgeL, edgeR, raf = 0, last = 0, scrollRaf = 0, tween = 0, idleT = 0, alive = true;
    if (reduced) root.setAttribute('data-np-static', '');

    /* ---------- геометрия ---------- */
    function measure() {
      const hdr = $('.hdr'); S.hh = hdr ? Math.round(hdr.getBoundingClientRect().height) || 84 : 84;
      root.style.setProperty('--np-hh', S.hh + 'px');
      const vw = window.innerWidth, H = window.innerHeight - S.hh;
      let mode = vw < 860 || vw / H < 1.05 ? 'single' : 'spread', pw, ph;
      if (mode === 'spread') { pw = Math.min((vw - 56) / 2, (H - 150) * .74); ph = pw / .74; if (pw < 395) mode = 'single'; }
      if (mode === 'single') { ph = Math.max(300, H - 150); pw = Math.min(vw - 28, 540, ph * .86); }
      const was = S.mode; S.mode = mode; S.pw = Math.round(pw); S.ph = Math.round(ph);
      root.dataset.mode = mode;
      book.style.setProperty('--pw', S.pw + 'px'); book.style.setProperty('--ph', S.ph + 'px');
      if (mode === 'spread') book.style.fontSize = (S.pw * .0255).toFixed(2) + 'px'; else book.style.fontSize = '';
      S.introDist = reduced ? 0 : Math.max(240, Math.round(window.innerHeight * 1.5));
      root.style.setProperty('--np-intro', S.introDist + 'px');
      return was !== mode;
    }

    /* ---------- листы ---------- */
    const stepsMax = () => S.mode === 'spread' ? NLEAF : NPAGE;                        // состояний 0 … stepsMax (число перевёрнутых листов)
    const nLeaves = () => S.mode === 'spread' ? NLEAF : NPAGE;
    function mkFace(cls, pg) {
      const f = el('div', 'np-face ' + cls);
      if (pg) f.appendChild(pg);
      const fold = el('i', 'np-fold'), sh = el('i', 'np-shade'); f.appendChild(fold); f.appendChild(sh);
      f._sh = sh; return f;
    }
    function build() {
      leaves.forEach(L => L.el.remove()); [edgeL, edgeR].forEach(e => e && e.remove());
      leaves = [];
      pageEls.forEach(p => p.remove());                                                // страницы переезжают из листов в листы: сначала освобождаем
      const n = nLeaves();
      for (let k = 0; k < n; k++) {
        const L = {k, el: el('div', 'np-leaf'), f: 0, v: 0, tf: 0, peel: 0, tp: 0, startAt: 0, drag: false, strips: null, rest: false, key: ''};
        if (S.mode === 'spread') { L.front = mkFace('np-fa', pageEls[2 * k]); L.back = mkFace('np-bk', pageEls[2 * k + 1]); }
        else { L.front = mkFace('np-fa', pageEls[k]); L.back = mkFace('np-bk', null); L.back.classList.add('np-blank'); }
        L.el.appendChild(L.front); L.el.appendChild(L.back);
        book.appendChild(L.el); leaves.push(L);
      }
      edgeL = el('i', 'np-edge l'); edgeR = el('i', 'np-edge r'); book.appendChild(edgeL); book.appendChild(edgeR);
      const flipped = S.cur;
      leaves.forEach(L => { L.tf = L.f = L.k < flipped ? 1 : 0; });
      paintAll(true);
    }
    function ensureStrips(L) {
      if (L.strips && L.stripsPw === S.pw) return L.strips;
      if (L.strips) L.strips.holder.remove();
      const holder = el('div', 'np-strips'); holder.setAttribute('aria-hidden', 'true'); holder.inert = true;
      const w = S.pw / NS, arr = []; let parent = holder;
      const clone = (src, off) => {
        const c = src.cloneNode(true); c.removeAttribute('id'); $$('[id]', c).forEach(e => e.removeAttribute('id')); $$('img', c).forEach(i => { i.loading = 'eager'; });
        $$('a,button,input,select,textarea', c).forEach(e => e.setAttribute('tabindex', '-1'));
        const wrap = el('div', 'np-cl'); wrap.style.left = off + 'px'; wrap.appendChild(c); return wrap;
      };
      const pgF = L.front.querySelector('.np-pg'), pgB = L.back.querySelector('.np-pg');
      for (let i = 0; i < NS; i++) {
        const st = el('div', 'np-st'); st.style.width = (w + 1.7) + "px"; if (i) st.style.left = w + 'px';
        const sf = el('div', 'np-sl np-sf'), sb = el('div', 'np-sl np-sb');
        if (pgF) sf.appendChild(clone(pgF, -i * w));
        if (pgB) sb.appendChild(clone(pgB, -(S.pw - (i + 1) * w)));
        const dkf = el('i', 'np-dk'), ltf = el('i', 'np-lt'), dkb = el('i', 'np-dk'), ltb = el('i', 'np-lt');
        sf.appendChild(dkf); sf.appendChild(ltf); sb.appendChild(dkb); sb.appendChild(ltb);
        st.appendChild(sf); st.appendChild(sb); parent.appendChild(st); parent = st;
        arr.push({st, dkf, ltf, dkb, ltb});
      }
      L.el.appendChild(holder); L.strips = {holder, arr}; L.stripsPw = S.pw; return L.strips;
    }
    function dropStrips(L) { if (L.strips) { L.strips.holder.remove(); L.strips = null; } L.el.classList.remove('is-bend'); }

    /* кривая изгиба: относительные углы полос (градусы), сумма углов — угол кромки относительно корешка */
    const W = (() => { const w = []; let s = 0; for (let i = 1; i < NS; i++) { const v = Math.pow(i, 1.35); w.push(v); s += v; } return w.map(v => v / s); })();
    const WP = (() => { const w = []; for (let i = 1; i < NS; i++) w.push(Math.pow(i / (NS - 1), 3.2)); return w; })();
    function bendStrips(L, th, f) {
      const g = ensureStrips(L); const s = Math.sin(Math.PI * clamp(f, 0, 1));
      const lag = -30 * clamp(L.v / 2.3, -1, 1) * s;                                // кромка отстаёт, пока лист летит (воздух)
      const lead = (L.drag ? 20 : 7) * s * (f < .5 ? 1 : -1);                       // рукой кромку тянут вперёд; в покое лёгкий прогиб
      const sgn = f < .5 ? 1 : -1, peel = L.peel * 13 * sgn;
      let abs = th;
      g.arr.forEach((o, i) => {
        let d = 0;
        if (i) d = clamp((lag + lead) * W[i - 1] + peel * WP[i - 1], -26, 26);
        abs += d;
        o.st.style.transform = i ? 'rotateY(' + (-d).toFixed(2) + 'deg)' : '';
        const a = clamp(abs, 0, 180) * Math.PI / 180, sa = Math.sin(a);
        let lt = 0, dk = 0;
        if (abs <= 90) lt = .24 * sa + Math.max(0, .24 * (1 - Math.abs(abs - 68) / 13)); else dk = .58 * Math.pow(sa, .9);
        let ltb = 0, dkb = 0;
        if (abs > 90) ltb = Math.max(0, .18 * (1 - Math.abs(abs - 122) / 16)); else dkb = .3 * sa;
        o.ltf.style.opacity = lt.toFixed(3); o.dkf.style.opacity = (abs <= 90 ? 0 : dk).toFixed(3); o.ltb.style.opacity = ltb.toFixed(3); o.dkb.style.opacity = (abs > 90 ? dkb : (.5 * sa)).toFixed(3);
      });
    }
    const zOf = (L, f) => (f < .5 ? nLeaves() - L.k : L.k + 1) * .5;
    let shaded = [];
    function paintLeaf(L, force) {
      const f = clamp(L.f, -.05, 1.05), th = f * 180;
      L.el.style.zIndex = (f < .5 ? nLeaves() - L.k : L.k + 1);                       // порядок стопок в покое: сверху — ближний к читателю лист
      const atRest = Math.abs(L.f - L.tf) < 1e-3 && !L.v && L.peel < .008 && !L.drag && (L.f === 0 || L.f === 1);
      const key = atRest ? 'r' + L.f : f.toFixed(4) + '|' + L.peel.toFixed(3) + '|' + L.v.toFixed(2);
      if (!force && key === L.key) return; L.key = key;
      if (atRest) {                                                                   // в покое: лист плоский, без полос и без смещения по Z — текст резкий
        if (L.strips) dropStrips(L);
        L.el.style.transform = L.f ? 'rotateY(-180deg)' : '';
      } else {
        L.el.style.transform = 'translateZ(' + zOf(L, f).toFixed(2) + 'px) rotateY(' + (-th).toFixed(3) + 'deg)';
        bendStrips(L, th, f); L.el.classList.add('is-bend');
      }
    }
    function paintAll(force) {
      leaves.forEach(L => paintLeaf(L, force));
      // видимые листы: два верхних на стопках + листья «в полёте» + соседние (чтобы под летящим листом уже было что показать)
      const r = leaves.filter(L => L.f >= .5).length;
      leaves.forEach(L => {
        const mv = L.f > .002 && L.f < .998 || L.peel > .008 || L.drag || Math.abs(L.f - L.tf) > .002;
        const show = mv || L.k === r - 1 || L.k === r || L.k === r + 1 || L.k === r - 2;
        L.el.classList.toggle('is-off', !show);
      });
      // тень от поднятого листа на соседние страницы
      shaded.forEach(f => { f._sh.style.opacity = 0; }); shaded = [];
      let m = null, ms = .02; leaves.forEach(L => { const s = Math.sin(Math.PI * clamp(L.f, 0, 1)); if (s > ms) { ms = s; m = L; } });
      if (m) {
        const th = clamp(m.f, 0, 1) * Math.PI, c = Math.cos(th), s = Math.sin(th), under = m.f < .5 ? leaves[m.k + 1] : leaves[m.k - 1];
        const face = under && (m.f < .5 ? under.front : under.back);
        if (face) { face._sh.style.setProperty('--sx', clamp(Math.abs(c) * 100 + 24 * s, 8, 100).toFixed(1) + '%'); face._sh.style.opacity = (Math.pow(s, 1.2) * .95).toFixed(3); shaded.push(face); }
        if (S.mode === 'spread') {                                                      // летящий лист закрывает свет и от противоположной страницы
          const opp = m.f < .5 ? leaves[m.k - 1] : leaves[m.k + 1], of = opp && (m.f < .5 ? opp.back : opp.front);
          if (of && of !== face) { of._sh.style.setProperty('--sx', '30%'); of._sh.style.opacity = (s * .18).toFixed(3); shaded.push(of); }
        }
      }
      // корешок и кромки стопок; книга сдвигается, пока обложка закрыта
      const n = leaves.length, f0 = clamp(leaves[0].f, 0, 1), fl = clamp(leaves[n - 1].f, 0, 1);
      if (S.mode === 'spread') {
        const bx = S.pw * (-.5 * (1 - f0) + .5 * fl);
        book.style.setProperty('--bx', bx.toFixed(1) + 'px');
        book.style.setProperty('--sl', (S.pw * (1 - f0)).toFixed(1) + 'px'); book.style.setProperty('--sr', (S.pw * fl).toFixed(1) + 'px');
        const nl = leaves.reduce((a, L) => a + clamp(L.f, 0, 1), 0);
        edgeL.style.setProperty('--e', Math.min(nl, 5) * 1.25 + 'px'); edgeR.style.setProperty('--e', Math.min(n - nl, 5) * 1.25 + 'px');
        edgeL.style.opacity = f0 > .03 ? 1 : 0; edgeR.style.opacity = fl < .97 ? 1 : 0;
      } else { book.style.setProperty('--bx', '0px'); book.style.setProperty('--sl', '0px'); book.style.setProperty('--sr', '0px'); }
    }

    /* ---------- физика: пружина по реальному времени кадра ---------- */
    function frame(ts) {
      raf = 0; if (!alive || !root.isConnected) return;
      const dt = clamp(last ? (ts - last) / 1000 : .016, 0, .05); last = ts;
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n; let moving = false;
      leaves.forEach(L => {
        if (L.drag) { moving = true; return; }
        if (ts < L.startAt) { moving = true; return; }
        for (let i = 0; i < n; i++) {
          const a = -OMEGA * OMEGA * (L.f - L.tf) - 2 * ZETA * OMEGA * L.v; L.v += a * h; L.f += L.v * h;
          if (L.f > 1) { L.f = 1; if (L.v > 0) L.v *= -.25; } else if (L.f < 0) { L.f = 0; if (L.v < 0) L.v *= -.25; }        // лист не проходит сквозь стопку: касается и чуть отскакивает
        }
        if (Math.abs(L.f - L.tf) < .0006 && Math.abs(L.v) < .012) { L.f = L.tf; L.v = 0; } else moving = true;
        const pd = L.tp - L.peel; if (Math.abs(pd) > .003) { L.peel += pd * Math.min(1, dt * 9); moving = true; } else L.peel = L.tp;
      });
      paintAll(); S.moving = moving;
      if (moving) raf = requestAnimationFrame(frame); else { last = 0; settled(); }
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    function settled() { paintAll(true); idleT = setTimeout(prebuild, 160); updateUI(); }
    function prebuild() {                                                              // полосы для соседних листов готовим заранее: первый кадр листания без задержки
      if (!alive || S.moving) return;
      const r = leaves.filter(L => L.f >= .5).length;
      [leaves[r - 1], leaves[r]].forEach(L => { if (L && !L.strips && !S.noBend) { const t = performance.now(); ensureStrips(L); L.el.classList.remove('is-bend'); if (performance.now() - t > 80) S.slow = true; } });
    }

    /* ---------- переход на состояние s (0 … stepsMax): листы летят по очереди «веером» ---------- */
    function go(s, o) {
      o = o || {}; s = clamp(Math.round(s), 0, stepsMax()); if (S.ov && !o.keepOv) closeOv(true);
      const from = S.cur; S.cur = s; if (!o.auto) S.userFlip = true;
      const inst = o.instant || reduced;
      const fwd = s > from, ks = leaves.filter(L => (L.k < s ? 1 : 0) !== L.tf).sort((a, b) => fwd ? a.k - b.k : b.k - a.k);
      const now = performance.now();
      leaves.forEach(L => { const t = L.k < s ? 1 : 0; if (inst) { L.f = L.tf = t; L.v = 0; L.peel = L.tp = 0; L.startAt = 0; } else { L.tp = 0; } });
      ks.forEach((L, i) => { L.tf = L.k < s ? 1 : 0; if (!inst) L.startAt = now + i * 110; });
      if (inst) { paintAll(true); fade(); updateUI(); } else { if (ks.length) S.moving = true; kick(); }
      if (!o.noHash) writeHash();
      updateUI();
    }
    function fade() {                                                                  // «меньше движения»: смена страницы — растворением
      if (!reduced || !book.animate) return;
      try { book.animate([{opacity: .25}, {opacity: 1}], {duration: 240, easing: 'ease-out'}); } catch (e) {}
    }
    const spreadOf = cur => S.mode === 'spread' ? cur : (cur + 1) >> 1;                 // номер разворота (0 — обложка)
    const curFromSpread = sp => S.mode === 'spread' ? sp : (sp === 0 ? 0 : 2 * sp - 1);
    const goSpread = (sp, o) => go(curFromSpread(sp), o);
    const step = d => { if (d > 0 ? S.cur >= stepsMax() : S.cur <= 0) return; go(S.cur + d); };

    /* ---------- вход: камера от прокрутки ---------- */
    function applyCam(p) {
      const e = easeIO(clamp(p, 0, 1));
      if (p >= .999) { cam.classList.add('is-flat'); cam.classList.remove('is-moving'); cam.style.removeProperty('--rx'); cam.style.removeProperty('--tz'); cam.style.removeProperty('--ty'); rig.style.removeProperty('--rgz'); rig.style.removeProperty('--rgx'); rig.style.removeProperty('--rgy'); }
      else {
        cam.classList.remove('is-flat'); cam.classList.add('is-moving');
        cam.style.setProperty('--rx', lerp(54, 0, e).toFixed(2) + 'deg'); cam.style.setProperty('--tz', lerp(-170, 0, e).toFixed(1) + 'px'); cam.style.setProperty('--ty', lerp(70, 0, e).toFixed(1) + 'px');
        rig.style.setProperty('--rgz', lerp(-4.2, 0, e).toFixed(2) + 'deg'); rig.style.setProperty('--rgx', lerp(S.pw * .2, 0, e).toFixed(1) + 'px'); rig.style.setProperty('--rgy', lerp(-S.ph * .13, 0, e).toFixed(1) + 'px');
      }
      const open = p >= .5; if (open !== root.classList.contains('is-open')) root.classList.toggle('is-open', open);
    }
    function progress() {
      if (reduced || !S.introDist) return 1;
      const r = stage.getBoundingClientRect(), t = S.hh - r.top; return clamp(t / S.introDist, 0, 1);
    }
    function onScroll() {
      if (scrollRaf) return; scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0; if (!alive) return; if (!root.isConnected) { destroy(); return; }
        const p = progress(); if (Math.abs(p - S.p) < .0005 && p !== 0 && p !== 1) return; S.p = p; applyCam(p);
        if (!S.userFlip || S.cur <= 1) {                                               // обложка откидывается сама, когда камера подошла; назад — когда ушла (если читатель сам не листал)
          if (p >= .56 && S.cur === 0) go(1, {auto: true, noHash: true});
          else if (p <= .38 && S.cur === 1 && !S.userFlip) go(0, {auto: true, noHash: true});
        }
      });
    }
    function scrollToOpen(ms) {
      if (A.motion && A.motion.cancelSmooth) A.motion.cancelSmooth();
      const y0 = window.pageYOffset, y1 = Math.round(stage.getBoundingClientRect().top + y0 - S.hh + S.introDist + 1); if (y1 <= y0 + 2) return;
      cancelAnimationFrame(tween); let t0 = 0; const d = ms || 1500;
      const f = ts => { if (!alive) return; if (!t0) t0 = ts; const k = clamp((ts - t0) / d, 0, 1); window.scrollTo({top: y0 + (y1 - y0) * easeIO(k), behavior: 'instant'}); if (k < 1) tween = requestAnimationFrame(f); };
      tween = requestAnimationFrame(f);
    }
    const toStageEnd = () => { const y = Math.round(stage.getBoundingClientRect().top + window.pageYOffset - S.hh + S.introDist + 1); window.scrollTo({top: y, behavior: 'instant'}); };

    /* ---------- рука: перетаскивание листа, кромка следует за указателем ---------- */
    const spineX = () => { const r = book.getBoundingClientRect(); return S.mode === 'spread' ? r.left + r.width / 2 : r.left; };
    function pageZone(e) {                                                             // что под указателем: {dir: +1 вперёд / -1 назад, ux: доля от корешка, zone: у угла?}
      const r = book.getBoundingClientRect(), x = e.clientX, y = e.clientY;
      if (x < r.left - 2 || x > r.right + 2 || y < r.top || y > r.bottom) return null;
      if (S.mode === 'single') return {dir: 1, ux: (x - r.left) / r.width, corner: x > r.right - r.width * .2 && y > r.bottom - r.height * .3};
      const mid = r.left + r.width / 2, right = x >= mid;
      return {dir: right ? 1 : -1, ux: right ? (x - mid) / (r.width / 2) : (mid - x) / (r.width / 2), corner: (right ? x > r.right - r.width * .09 : x < r.left + r.width * .09) && y > r.top + r.height * .55};
    }
    const leafFor = dir => leaves[dir > 0 ? S.cur : S.cur - 1];
    function onDown(e) {
      if (e.button || S.ov || S.drag) return;
      if (e.target.closest('a,button,input,select,textarea,summary,label,[data-act]')) return;
      const z = pageZone(e); if (!z) return;
      S.drag = {id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, started: false, z, samples: [[e.timeStamp, e.clientX]], touch: e.pointerType === 'touch'};
    }
    function dragF(d, x) {
      if (S.mode === 'spread') {
        const g = clamp(d.g, .42, 1), c = clamp((x - spineX()) / (g * S.pw), -1, 1); return Math.acos(c) / Math.PI;
      }
      const dx = x - d.x0; return d.dir > 0 ? clamp(-dx / (S.pw * .85), 0, 1) : clamp(1 - dx / (S.pw * .85), 0, 1);
    }
    function onMove(e) {
      const d = S.drag;
      if (!d) { hoverPeel(e); return; }
      if (e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.started) {
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
        const dir = S.mode === 'single' ? (dx < 0 ? 1 : -1) : d.z.dir;
        const ok = Math.abs(dx) > Math.abs(dy) * 1.15 && ((S.mode === 'single') || (d.z.dir > 0 ? dx < 0 : dx > 0)) && (dir > 0 ? S.cur < stepsMax() : S.cur > 0);
        if (!ok) { if (Math.abs(dy) > 10 || d.touch) S.drag = null; return; }
        d.started = true; d.dir = dir; d.L = leafFor(dir); d.g = S.mode === 'spread' ? (dir > 0 ? (d.x0 - spineX()) / S.pw : (spineX() - d.x0) / S.pw) : 1;
        d.L.drag = true; d.L.tp = 0; d.L.startAt = 0; try { book.setPointerCapture(e.pointerId); } catch (er) {}
        root.classList.add('is-drag'); cancelAnimationFrame(tween); kick();
      }
      const L = d.L, f = dragF(d, e.clientX); L.v = (f - L.f) / Math.max(.008, (e.timeStamp - (d.samples[d.samples.length - 1][0])) / 1000) * .35 + L.v * .65; L.f = f;
      d.samples.push([e.timeStamp, e.clientX]); if (d.samples.length > 5) d.samples.shift(); d.f = f; paintAll(); e.preventDefault();
    }
    function onUp(e) {
      const d = S.drag; if (!d || (e && e.pointerId !== d.id)) return; S.drag = null; root.classList.remove('is-drag');
      if (!d.started) return;
      d.moved = true; setTimeout(() => { d.moved = false; }, 0); S.justDragged = true; setTimeout(() => { S.justDragged = false; }, 60);
      const L = d.L, sm = d.samples, a = sm[0], b = sm[sm.length - 1]; let vx = b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) * 1000 : 0;
      if (e && e.timeStamp - b[0] > 90) vx = 0;                                       // рука остановилась перед отпусканием — скорости нет, решает положение листа             // px/с
      const vf = clamp((S.mode === 'spread' ? 1 : 1) * (d.dir > 0 ? -vx : vx) / (S.pw * .85), -6, 6);                                              // доля поворота в секунду «вперёд» относительно листа
      const fwdSpeed = d.dir > 0 ? vf : -vf, flip = d.dir > 0 ? (L.f > .5 && vf > -.6) || vf > 1.1 : (L.f < .5 && vf > -.6) || vf > 1.1;
      L.drag = false; L.v = (L.f < .5 ? 1 : -1) * 0 + (d.dir > 0 ? vf : -vf) * (flip ? 1 : 1) * (d.dir > 0 ? 1 : 1); L.v = clamp(L.v * (d.dir > 0 ? 1 : 1), -6, 6);
      L.v = d.dir > 0 ? clamp(vf, -6, 6) : clamp(-vf, -6, 6) * -1 * -1;
      const to = d.dir > 0 ? (flip ? S.cur + 1 : S.cur) : (flip ? S.cur - 1 : S.cur);
      S.cur = clamp(to, 0, stepsMax()); S.userFlip = true;
      leaves.forEach(X => { if (X !== L) X.tf = X.k < S.cur ? 1 : 0; }); L.tf = L.k < S.cur ? 1 : 0; if (L.tf === 1) L.v = Math.abs(L.v) * (L.v < 0 ? 0 : 1); else L.v = -Math.abs(L.v) * (L.v > 0 ? 0 : 1);
      writeHash(); kick(); updateUI();
    }
    function hoverPeel(e) {                                                            // у нижнего угла страницы кромка приподнимается: «можно взять»
      if (e.pointerType !== 'mouse' || S.ov || S.drag || reduced) return;
      const z = pageZone(e); let target = null;
      if (z && z.corner) { const dir = z.dir; if (dir > 0 ? S.cur < stepsMax() : S.cur > 0) target = leafFor(dir); }
      let ch = false; leaves.forEach(L => { const t = L === target ? .75 : 0; if (L.tp !== t && !L.drag) { L.tp = t; ch = true; } });
      if (ch) kick(); root.classList.toggle('is-grab', !!(z && (z.corner || z.ux > .6)) && !!target);
    }
    function onClick(e) {
      if (S.justDragged) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.target.closest('a,button,input,select,textarea,summary,label,[data-act]')) return;
      const z = pageZone(e); if (z && z.corner && !S.ov) step(z.dir);                   // щелчок по углу страницы — перевернуть
    }

    /* ---------- фильтр, оглавление, статус ---------- */
    const spreadsOf = cat => { const out = []; Object.keys(data.arts).forEach(id => { const a = data.arts[id]; if ((cat === 'all' || a.cat === cat) && a.sp && out.indexOf(a.sp) < 0) out.push(a.sp); }); return out.sort((x, y) => x - y); };
    function setFilter(cat, o) {
      o = o || {}; S.filter = cat; root.dataset.filter = cat;
      $$('[data-np-cat]', root).forEach(b => { const on = b.dataset.npCat === cat; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      const st = $('[data-np-status]', root), arts = Object.keys(data.arts).filter(id => cat === 'all' || data.arts[id].cat === cat), sps = spreadsOf(cat);
      $('[data-np-empty]', root).hidden = arts.length > 0;
      if (cat === 'all') st.hidden = true;
      else {
        const name = ($('[data-np-cat="' + cat + '"]', root) || {}).firstChild; const nm = name ? name.textContent : cat;
        st.innerHTML = esc('«' + nm + '»: ' + arts.length + ' ' + (arts.length === 1 ? 'материал' : arts.length < 5 ? 'материала' : 'материалов')) + (sps.length ? ' · ' + sps.map(sp => '<button type="button" data-np-sp="' + sp + '">стр. ' + (2 * sp) + '–' + (2 * sp + 1) + '</button>').join(' ') : '') + ' <button type="button" data-np-cat="all">Сбросить</button>';
        st.hidden = false;
      }
      if (!o.keep && cat !== 'all' && sps.length && sps.indexOf(spreadOf(S.cur)) < 0 && !(S.mode === 'single' && sps.indexOf(spreadOf(S.cur)) >= 0)) goSpread(sps.filter(x => x >= spreadOf(S.cur))[0] || sps[0], {noHash: false});
      if (o.hash !== false) writeHash();
    }
    function jumpTo(id, o) {
      const a = data.arts[id]; if (!a) return; o = o || {};
      if (!a.sp) { openArticle(id); return; }
      const sp = a.sp, was = spreadOf(S.cur);
      if (S.p < .98) { toStageEnd(); S.p = 1; applyCam(1); }
      goSpread(sp, {instant: o.instant});
      setTimeout(() => { $$('.np-art[data-id="' + id + '"]', book).forEach(x => { x.classList.remove('is-pulse'); void x.offsetWidth; x.classList.add('is-pulse'); }); }, o.instant ? 50 : (was === sp ? 30 : 700));
    }

    /* ---------- интерфейс: индикатор, точки, подсказка Стеллы ---------- */
    const dots = $('[data-np-dots]', root), pgtxt = $('[data-np-pgtxt]', root), hintT = $('[data-np-hint-t]', root);
    function rebuildDots() {
      dots.innerHTML = ''; const n = S.mode === 'spread' ? NLEAF + 1 : NPAGE;
      for (let i = 0; i < n; i++) { const b = el('button'); b.type = 'button'; b.dataset.npDot = i; b.setAttribute('aria-label', S.mode === 'spread' ? (i === 0 ? 'Обложка' : i === NLEAF ? 'Оборот, страница 12' : 'Страницы ' + (2 * i) + '–' + (2 * i + 1)) : 'Страница ' + (i + 1)); const li = el('li'); li.appendChild(b); dots.appendChild(li); }
    }
    function pageLabel() {
      if (S.mode === 'single') return 'Страница ' + (S.cur + 1) + ' из ' + NPAGE;
      if (S.cur === 0) return 'Обложка'; if (S.cur === NLEAF) return 'Оборот · стр. 12';
      return 'Стр. ' + (2 * S.cur) + '–' + (2 * S.cur + 1) + ' из ' + NPAGE;
    }
    let hintFor = -1;
    function updateUI() {
      pgtxt.textContent = pageLabel();
      $$('button', dots).forEach(b => b.classList.toggle('is-on', +b.dataset.npDot === S.cur));
      const pv = $('[data-np-step="-1"]', root), nx = $('[data-np-step="1"]', root); pv.disabled = S.cur <= 0; nx.disabled = S.cur >= stepsMax();
      const sp = spreadOf(S.cur);
      if (hintFor !== sp && hintT) { hintFor = sp; hintT.style.opacity = 0; setTimeout(() => { if (alive) { hintT.textContent = data.hints[sp] || data.hints[0]; hintT.style.opacity = 1; } }, 170); }
    }
    function writeHash() {
      let h = '';
      if (S.cur > 0 && (S.p >= .98 || S.userFlip)) h = '#s' + spreadOf(S.cur);
      if (S.filter !== 'all') h += (h ? '' : '#') + (h ? '' : '') ; // фильтр в адрес не пишем: ?cat= остаётся только для входящих ссылок
      if (S.ov) h = '#read-' + S.ov;
      if (h === S.hash) return; S.hash = h;
      try { history.replaceState(history.state, '', location.pathname + location.search + h); } catch (e) {}
    }

    /* ---------- чтение статьи поверх газеты ---------- */
    const ov = $('[data-np-ov]', root); let ovOpener = null;
    function ovHTML(a) {
      const rel = a.rel || {};
      return '<div class="np-ov-sheet" role="dialog" aria-modal="true" aria-labelledby="np-ov-t" tabindex="-1">' +
        '<button class="np-ov-x" type="button" data-np-close aria-label="Закрыть"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<div class="np-ov-mast"><span>АСТРЕЯ</span><span>' + esc(a.dateText) + '</span></div>' +
        '<div class="np-meta"><span class="np-tag"><i></i>' + esc(a.catName) + '</span></div>' +
        '<h2 id="np-ov-t">' + esc(a.title) + '</h2><p class="np-ov-dek">' + esc(a.excerpt) + '</p>' +
        '<div class="np-ov-body">' + a.body.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<div class="np-ov-act">' + (a.cta ? '<a class="np-btn" href="' + esc(a.cta.href) + '" ' + a.cta.attrs + '>' + esc(a.cta.label) + ' <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>' : '') +
        (a.sp ? '<button class="np-lnk" type="button" data-np-back>К газете · стр. ' + esc(a.pg) + '</button>' : '<button class="np-lnk" type="button" data-np-close>К газете</button>') +
        '<a class="np-lnk" href="' + esc(a.url) + '" data-track="news_open_page">Отдельной страницей</a></div>' +
        ((rel.products && rel.products.length) ? '<div class="np-ov-rel"><div><h3>Товары по теме</h3><ul>' + rel.products.map(p => '<li><a href="' + esc(p.href) + '">' + esc(p.name) + '<small>' + esc(p.brand) + '</small></a></li>').join('') + '</ul></div></div>' : '') +
        ((rel.events && rel.events.length) ? '<div class="np-ov-rel"><div><h3>Мероприятия по теме</h3><ul>' + rel.events.map(e => '<li><a href="' + esc(e.href) + '">' + esc(e.title) + '<small>' + esc(e.date) + ' · ' + esc(e.city) + '</small></a></li>').join('') + '</ul></div></div>' : '') +
        '<aside class="np-ov-st"><span class="np-st-av" aria-hidden="true"><i></i></span><div><b>Спросите Стеллу</b><button class="np-chip" type="button" data-act="asst-chip" data-q="' + esc('Расскажите подробнее: ' + a.title) + '" data-track="news_stella">Расскажите подробнее об этом материале</button></div></aside>' +
        '</div>';
    }
    function openArticle(id, opener) {
      const a = data.arts[id]; if (!a) return; if (S.ov) closeOv(true);
      ovOpener = opener || document.activeElement; S.ov = id; ov.innerHTML = ovHTML(a); ov.hidden = false;
      const sheet = $('.np-ov-sheet', ov); if (opener && opener.getBoundingClientRect) { const r = opener.getBoundingClientRect(); sheet.style.setProperty('--ox', (r.left + r.width / 2) / window.innerWidth * 100 + '%'); sheet.style.setProperty('--oy', (r.top + r.height / 2) / window.innerHeight * 100 + '%'); }
      requestAnimationFrame(() => { ov.classList.add('is-in'); try { sheet.focus({preventScroll: true}); } catch (e) {} });
      document.body.classList.add('np-reading'); writeHash();
      if (A.track) A.track('news_read', {id});
    }
    function closeOv(quick) {
      if (!S.ov) return; const id = S.ov; S.ov = null; ov.classList.remove('is-in');
      const done = () => { ov.hidden = true; ov.innerHTML = ''; document.body.classList.remove('np-reading'); };
      if (quick || reduced) done(); else setTimeout(done, 380);
      if (ovOpener && ovOpener.focus && ovOpener.isConnected) { try { ovOpener.focus({preventScroll: true}); } catch (e) {} }
      writeHash();
    }

    /* ---------- события ---------- */
    root.addEventListener('click', e => {
      const t = e.target;
      const open = t.closest('[data-np-open]');
      if (open && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) {
        const jump = open.hasAttribute('data-np-jump');
        e.preventDefault(); if (jump) { toc(false); jumpTo(open.dataset.npOpen); } else openArticle(open.dataset.npOpen, open); return;
      }
      const show = t.closest('[data-np-show]'); if (show) { e.preventDefault(); jumpTo(show.dataset.npShow); return; }
      const st = t.closest('[data-np-step]'); if (st) { step(+st.dataset.npStep); return; }
      const dot = t.closest('[data-np-dot]'); if (dot) { go(+dot.dataset.npDot); return; }
      const cat = t.closest('[data-np-cat]'); if (cat) { setFilter(cat.dataset.npCat); return; }
      const sp = t.closest('[data-np-sp]'); if (sp) { goSpread(+sp.dataset.npSp); return; }
      const g0 = t.closest('[data-np-go]'); if (g0) { go(+g0.dataset.npGo); return; }
      if (t.closest('[data-np-skip]')) { scrollToOpen(); return; }
      if (t.closest('[data-np-tocbtn]')) { toc(); return; }
      if (t.closest('[data-np-back]')) { const id = S.ov; closeOv(); if (id) jumpTo(id); return; }
      if (t.closest('[data-np-close]') || t === ov) { closeOv(); return; }
    });
    root.addEventListener('click', onClick, true);
    function toc(force) { const p = $('[data-np-toc]', root), b = $('.np-tocbtn', root), open = force === undefined ? p.hidden : force; p.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    book.addEventListener('pointerdown', onDown, sig);
    window.addEventListener('pointermove', e => { if (!root.isConnected) { destroy(); return; } onMove(e); }, {signal: ac.signal, passive: false});
    window.addEventListener('pointerup', onUp, sig); window.addEventListener('pointercancel', onUp, sig);
    book.addEventListener('pointerleave', () => { if (!S.drag && leaves.some(L => L.tp)) { leaves.forEach(L => { L.tp = 0; }); kick(); } }, sig);
    window.addEventListener('scroll', onScroll, {signal: ac.signal, passive: true});
    window.addEventListener('resize', () => { if (!root.isConnected) { destroy(); return; } clearTimeout(S.rt); S.rt = setTimeout(relayout, 120); }, sig);
    window.addEventListener('keydown', e => {
      if (!root.isConnected) { destroy(); return; }
      if (e.key === 'Escape') { if (S.ov) { e.preventDefault(); closeOv(); } else if (!$('[data-np-toc]', root).hidden) { toc(false); $('.np-tocbtn', root).focus(); } return; }
      if (S.ov || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target; if (t && t.closest && t.closest('input,textarea,select,[contenteditable],.np-toc')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const r = stage.getBoundingClientRect(); if (S.p < .9 || r.bottom < window.innerHeight * .35 || r.top > window.innerHeight * .5) return;      // газета должна быть на экране
      e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1);
    }, sig);
    window.addEventListener('hashchange', () => { if (root.isConnected) applyHash(true); }, sig);
    ov.addEventListener('keydown', e => {                                                // фокус не выходит из чтения
      if (e.key !== 'Tab') return; const f = $$('a[href],button:not([disabled])', ov).filter(x => x.offsetParent !== null); if (!f.length) return;
      const a = f[0], b = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    });

    /* ---------- адрес: #s3 · #a-n4 · #read-n4 · ?cat= ---------- */
    function applyHash(live) {
      const h = location.hash || ''; let m;
      if ((m = /^#read-(\w+)$/.exec(h)) && data.arts[m[1]]) { if (S.p < 1) { toStageEnd(); S.p = 1; applyCam(1); } const a = data.arts[m[1]]; if (a.sp) goSpread(a.sp, {instant: true, noHash: true}); if (S.ov !== m[1]) openArticle(m[1]); return true; }
      if ((m = /^#a-(\w+)$/.exec(h)) && data.arts[m[1]]) { jumpTo(m[1], {instant: !live}); return true; }
      if ((m = /^#s(\d)$/.exec(h)) && +m[1] <= NLEAF) { if (S.p < 1) { toStageEnd(); S.p = 1; applyCam(1); } goSpread(+m[1], {instant: !live, noHash: true}); S.hash = h; return true; }
      return false;
    }

    function relayout() {
      if (!alive) return; const changed = measure();
      if (changed) { const sp = S.mode === 'spread' ? (S.cur + 1) >> 1 : S.cur; S.cur = S.mode === 'spread' ? clamp(sp, 0, NLEAF) : (sp === 0 ? 0 : 2 * sp - 1); build(); rebuildDots(); }
      else { leaves.forEach(L => { if (L.strips) dropStrips(L); }); paintAll(true); }
      S.p = progress(); applyCam(S.p); updateUI();
    }
    function destroy() { alive = false; ac.abort(); cancelAnimationFrame(raf); cancelAnimationFrame(tween); clearTimeout(idleT); clearTimeout(S.rt); document.body.classList.remove('np-reading'); if (inst && inst.root === root) inst = null; }

    /* ---------- старт ---------- */
    measure(); build(); rebuildDots();
    const cat0 = new URLSearchParams(location.search).get('cat');
    const hashed = applyHash(false);
    S.p = progress(); applyCam(S.p);
    if (S.p >= .56 && S.cur === 0 && !hashed) go(1, {auto: true, noHash: true, instant: true});
    if (cat0 && $('[data-np-cat="' + cat0 + '"]', root)) setFilter(cat0, {keep: false, hash: false}); else setFilter('all', {hash: false});
    updateUI();
    const lazy = () => { if (!alive) return; paintAll(true); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(lazy);
    return {root, destroy, go, goSpread, step, setFilter, openArticle, closeOv, state: () => ({mode: S.mode, cur: S.cur, p: S.p, filter: S.filter, ov: S.ov, pw: S.pw, ph: S.ph, moving: S.moving, bend: leaves.filter(L => L.el.classList.contains('is-bend')).length, f: leaves.map(L => +L.f.toFixed(3))}), leaves: () => leaves, relayout};
  }

  function init() {
    if (inst) { inst.destroy(); inst = null; }
    const root = $('[data-np]'); if (!root) return;
    const ok = window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d') && CSS.supports('backface-visibility', 'hidden') && $('#np-data');
    if (!ok) { root.setAttribute('data-np-fallback', ''); return; }
    inst = create(root); A.news = inst;
  }
  const prev = A.pages.news; A.pages.news = function (r) { if ($('[data-np]')) init(); else if (prev) prev(r); };
  if (document.body && document.body.getAttribute('data-page') === 'news' && A.initDone) init();
})();
