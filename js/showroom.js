/* showroom.js — «Каталог-шоурум» (data/redesign.json → extras.showroom; стили — css/showroom.css, разметка — src/pages/showroom.js). Подключается после gallery.js; работает только на странице каталога.
   Что делает (поверх существующей логики каталога, ничего не заменяя):
   1) Сцена. Видимые (отфильтрованные и отсортированные) товары из списка #cat-grid ставятся на подиумы: по 6 на странице на компьютере, меньше — на узких экранах; остальные — на следующих страницах (товары не теряются).
      Подиумы и упаковки — обычный HTML, архитектура — один SVG. Фото товара (поле image в админке) — как есть, без искажений; пока фото нет — CSS-иллюстрация упаковки того же вида, что в карточках.
   2) Смена категории/фильтра/страницы: ушедшие товары мягко растворяются, оставшиеся переезжают на новые места (FLIP), новые появляются; высоты подиумов и композиция зависят от категории и тоже плавно меняются.
   3) Наведение: упаковка приподнимается, под ней меняется свет, проявляется название; карточка справа показывает превью. Выбор (клик/тап): остальные приглушаются, карточка раскрывается (описание, назначение,
      характеристики из данных, «Подробнее», «Запросить», «Быстрый просмотр», «Помочь с подбором»), закрыть — крестиком, Esc или кликом по пустому месту сцены.
   4) Панель фильтров слева — это кнопки-галочки поверх настоящих <select> (#f-brand/#f-cat/#f-task/#f-kind): значения живут в них, поэтому работают адреса с параметрами, Стелла, тесты и gallery.js.
   Двигаются только opacity и transform; prefers-reduced-motion — только прозрачность; «лёгкий режим» (html.lite) — без анимаций. Идемпотентно: страницы могут подменяться без перезагрузки (A.initPage). */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras || !D.extras.showroom || !D.extras.gallery) return;
  const X = D.extras, I = A.I || {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const html = document.documentElement, rmq = matchMedia('(prefers-reduced-motion: reduce)'), nmq = matchMedia('(max-width:760px)');
  const canAnimate = typeof Element.prototype.animate === 'function';
  const mode = () => (html.classList.contains('lite') || !canAnimate) ? 'off' : rmq.matches ? 'soft' : 'full';
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const esc = A.esc || (s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
  const root = () => document.body.getAttribute('data-root') || '';
  const track = (n, d) => { try { A.track && A.track(n, d); } catch (e) {} };
  const P = {}, B = {}, CAT = {}, TASK = {}, KIND = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.cats || []).forEach(c => { CAT[c.id] = c.name; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.kinds || []).forEach(k => { KIND[k.id] = k.name; });
  const NAVI = !!(X.navigator && D.guide);
  const KEYS = ['brand', 'cat', 'task', 'kind'];
  const bstyle = b => (A.bstyle ? A.bstyle(b) : '--c1:' + b.c1 + ';--c2:' + b.c2 + ';--ink:' + b.ink);

  /* размеры упаковок: w×h — как у .pk в css/components.css, top — на сколько выступает крышка/помпа над корпусом, th — высота на сцене (в «единицах сцены»: ширина сцены = 1000) */
  const TYPE = {
    bottle: {w: 64, h: 128, top: 0, th: 190}, pump: {w: 64, h: 128, top: 14, th: 200}, dropper: {w: 56, h: 132, top: 28, th: 192},
    tube: {w: 58, h: 138, top: 0, th: 182}, jar: {w: 104, h: 74, top: 0, th: 98}, box: {w: 112, h: 84, top: 0, th: 112}, device: {w: 44, h: 146, top: 30, bw: 58, th: 214}
  };
  const typeOf = p => TYPE[p.t] || TYPE.bottle;

  let S = null;

  /* ---------- состав и размеры ---------- */
  const visibleIds = () => $$('.pcard', S.grid).filter(c => !c.hidden).map(c => c.getAttribute('data-id'));
  const perFor = (W, narrow) => narrow ? (W >= 520 ? 4 : 3) : (W >= 820 ? 6 : 5);
  const inView = () => { const r = S.stage.getBoundingClientRect(); return r.bottom > -80 && r.top < innerHeight + 80; };

  /* расстановка: slots[i] = {pod:{l,t,w,h,ry}, it:{l,t,w,h,bw,bh,ps,z}}; расстояния «от низа сцены» (d) и размеры — в единицах u (u = пикселей на единицу сцены) */
  function compose(prods, s) {
    const {W, H, u, narrow, variant} = s, n = prods.length, slots = [];
    let xs;
    if (narrow) xs = ({1: [.5], 2: [.3, .7], 3: [.19, .5, .81], 4: [.135, .378, .622, .865]}[n] || [.5]).map(f => f * W);
    else { const span = Math.min(880, n * 150), left = 500 - span / 2; xs = Array.from({length: n}, (_, i) => (left + span * (i + .5) / n) * u); }
    const gap = n > 1 ? Math.abs(xs[1] - xs[0]) : W * .3;
    for (let i = 0; i < n; i++) {
      const p = prods[i], T = typeOf(p), row = (i + variant) % 2 ? 1 : 0, ds = row ? 1 : .94, sc = narrow ? .86 : 1;
      let hh = variant === 0 ? 34 + 78 * Math.sin(Math.PI * (i + .5) / Math.max(n, 2)) : variant === 1 ? (i % 2 ? 40 : 96) + (i % 3) * 6 : 62 + 44 * Math.cos(i * 1.25);
      hh = Math.max(28, Math.min(112, hh)) * (narrow ? .8 : 1);
      let bw, bh, ps = 0;
      if (p.im) { const th = T.th * ds * sc * u; bh = th; bw = th * (p.iw && p.ih ? p.iw / p.ih : .45); }
      else { ps = T.th / (T.h + T.top) * ds * sc * u; bw = (T.bw || T.w) * ps; bh = (T.h + T.top) * ps; }
      const pw = Math.min(Math.max(bw * 1.28, 96 * u), narrow ? gap * .96 : 156 * u), ry = Math.max(7 * u, pw * .1), baseY = H - (row ? 80 : 100) * u, top = baseY - hh * u;
      const cx = xs[i];
      /* упаковка не выше нижней кромки заголовка/категорий/карточки над ней: при необходимости чуть уменьшаем (не более чем до 72 %) */
      const lim = (s.zones || []).reduce((m, z) => (cx + bw / 2 > z.l && cx - bw / 2 < z.r) ? Math.max(m, z.b + 10) : m, 0);
      if (lim && top + ry * .25 - bh < lim) { const f = Math.max(.72, (top + ry * .25 - lim) / bh); if (f < 1) { bw *= f; bh *= f; ps *= f; } }
      slots.push({row, hh, pod: {l: cx - pw / 2, t: top, w: pw, h: hh * u + ry, ry}, it: {l: cx - bw / 2, t: top + ry * .25 - bh, w: bw, h: bh, bw, bh, ps, z: 4 + row, cx}});
    }
    return slots;
  }

  /* ---------- элементы ---------- */
  function itemEl(p) {
    const b = B[p.brand] || {}, T = typeOf(p), el = document.createElement('button');
    el.type = 'button'; el.className = 'shw-it'; el.setAttribute('data-act', 'shw-pick'); el.setAttribute('data-id', p.id); el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', (b.name ? b.name + ' — ' : '') + p.name); el.setAttribute('style', bstyle(b));
    const body = p.im
      ? '<img class="shw-img' + (p.ia ? '' : ' opq') + '" src="' + esc(root() + p.im) + '" alt="" decoding="async" draggable="false">'
      : '<span class="shw-pk" style="width:' + T.w + 'px;height:' + T.h + 'px"><span class="pk pk-' + esc(p.t || 'bottle') + '" style="display:block"><i class="sh"></i><i class="hd"></i><i class="cap"></i><i class="body"><b class="lbl"></b></i></span></span>';
    el.innerHTML = '<i class="shw-gl"></i><i class="shw-sh"></i>' + body + '<span class="shw-nm"><small>' + esc(b.name || '') + '</small>' + esc(p.name) + '</span>';
    el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') preview(p.id); });
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') unpreview(); });
    el.addEventListener('focus', () => preview(p.id));
    el.addEventListener('blur', () => unpreview());
    return el;
  }
  function podEl() { const el = document.createElement('i'); el.className = 'shw-pd'; el.setAttribute('aria-hidden', 'true'); return el; }
  function placeItem(rec, g) {
    const el = rec.el, it = g.it, st = el.style;
    st.left = it.l.toFixed(1) + 'px'; st.top = it.t.toFixed(1) + 'px'; st.width = it.w.toFixed(1) + 'px'; st.height = it.h.toFixed(1) + 'px';
    el.style.setProperty('--bw', it.bw.toFixed(1) + 'px'); el.style.setProperty('--bh', it.bh.toFixed(1) + 'px'); el.style.setProperty('--z', it.z);
    el.style.setProperty('--pdh', (g.pod.t + g.pod.h - (it.t + it.h)).toFixed(1) + 'px');
    const pk = el.querySelector('.shw-pk'), img = el.querySelector('.shw-img');
    if (pk) pk.style.setProperty('--ps', it.ps.toFixed(4)); if (img) { img.style.width = it.bw.toFixed(1) + 'px'; img.style.height = it.bh.toFixed(1) + 'px'; }
    rec.g = g;
  }
  function placePod(rec, g) {
    const el = rec.el, d = g.pod;
    el.style.left = d.l.toFixed(1) + 'px'; el.style.top = d.t.toFixed(1) + 'px'; el.style.width = d.w.toFixed(1) + 'px'; el.style.height = d.h.toFixed(1) + 'px'; el.style.setProperty('--ry', d.ry.toFixed(1) + 'px');
    rec.g = g;
  }

  /* ---------- анимации (WAAPI; только opacity и transform) ---------- */
  function run(el, kf, opt) { const a = el.animate(kf, opt); S.anims.add(a); a.onfinish = a.oncancel = () => S.anims.delete(a); return a; }
  function stopAnims() { S.anims.forEach(a => { try { a.cancel(); } catch (e) {} }); S.anims.clear(); }
  const rel = el => { const r = el.getBoundingClientRect(), sr = S.rect; return {l: r.left - sr.left, t: r.top - sr.top, w: r.width, h: r.height}; };

  function render(kind, dir) {
    const s = S; if (!s || !s.W) return;
    const m = mode(), anim = !!kind && m !== 'off' && inView(), full = anim && m === 'full';
    s.per = perFor(s.W, s.narrow);
    const pages = Math.max(1, Math.ceil(s.ids.length / s.per)); s.page = Math.max(0, Math.min(pages - 1, s.page));
    const ids = s.ids.slice(s.page * s.per, s.page * s.per + s.per), prods = ids.map(id => P[id]).filter(Boolean);
    s.pageIds = prods.map(p => p.id);
    s.rect = s.stage.getBoundingClientRect();
    const slots = compose(prods, s), u = s.u;
    /* 1. запомнить, где всё стоит сейчас (с учётом идущих анимаций) */
    const oldIt = new Map(); s.items.forEach((rec, id) => oldIt.set(id, rel(rec.el)));
    const oldPd = s.pods.map(rec => rel(rec.el));
    stopAnims();
    /* 2. ушедшие товары */
    s.items.forEach((rec, id) => {
      if (s.pageIds.indexOf(id) >= 0) return;
      s.items.delete(id); rec.el.classList.add('is-gone'); rec.el.setAttribute('tabindex', '-1'); rec.el.setAttribute('aria-hidden', 'true');
      const done = () => rec.el.remove();
      if (!anim) { done(); return; }
      const a = run(rec.el, full ? [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translate(' + (kind === 'page' ? -dir * 34 * u : 0) + 'px,' + (kind === 'page' ? 0 : 12 * u) + 'px) scale(.97)'}] : [{opacity: 1}, {opacity: 0}], {duration: kind === 'page' ? 260 : 240, easing: 'ease-out', fill: 'forwards'});
      a.onfinish = a.oncancel = () => { S && S.anims.delete(a); done(); };
    });
    /* 3. подиумы по номеру места */
    for (let i = 0; i < Math.max(slots.length, s.pods.length); i++) {
      const g = slots[i], rec = s.pods[i];
      if (g && rec) {
        placePod(rec, g); const o = oldPd[i];
        if (full && o && kind !== 'page') { const n = rec.el.getBoundingClientRect(), nl = n.left - s.rect.left, nt = n.top - s.rect.top; if (Math.abs(o.l - nl) > 1 || Math.abs(o.t - nt) > 1 || Math.abs(o.w - n.width) > 1 || Math.abs(o.h - n.height) > 1) run(rec.el, [{transform: 'translate(' + (o.l - nl) + 'px,' + (o.t - nt) + 'px) scale(' + (o.w / n.width) + ',' + (o.h / n.height) + ')', transformOrigin: '0 0'}, {transform: 'none', transformOrigin: '0 0'}], {duration: 620, easing: EASE}); }
      } else if (g) {
        const r = {el: podEl(), g}; s.pods[i] = r; s.stage.insertBefore(r.el, s.spot); placePod(r, g);
        if (anim) run(r.el, full ? [{opacity: 0, transform: 'translateY(' + 18 * u + 'px) scaleY(.7)'}, {opacity: 1, transform: 'none'}] : [{opacity: 0}, {opacity: 1}], {duration: 560, delay: 40 * i, easing: EASE, fill: 'backwards'});
      } else if (rec) {
        s.pods[i] = null; const el = rec.el;
        if (!anim) el.remove(); else { const a = run(el, [{opacity: 1}, {opacity: 0}], {duration: 220, easing: 'ease-out', fill: 'forwards'}); a.onfinish = a.oncancel = () => { S && S.anims.delete(a); el.remove(); }; }
      }
    }
    s.pods = s.pods.filter(Boolean);
    /* 4. товары: остались — переезжают, новые — появляются */
    prods.forEach((p, i) => {
      const g = slots[i]; let rec = s.items.get(p.id);
      if (rec) {
        placeItem(rec, g); const o = oldIt.get(p.id);
        if (full && o) { const n = rec.el.getBoundingClientRect(), dx = o.l - (n.left - s.rect.left), dy = o.t - (n.top - s.rect.top); if (Math.abs(dx) > 1 || Math.abs(dy) > 1) run(rec.el, [{transform: 'translate(' + dx + 'px,' + dy + 'px)'}, {transform: 'none'}], {duration: 620, easing: EASE}); }
      } else {
        rec = {el: itemEl(p), g}; s.items.set(p.id, rec); s.stage.insertBefore(rec.el, s.spot); placeItem(rec, g);
        if (p.id === s.sel) { rec.el.classList.add('is-sel'); rec.el.setAttribute('aria-pressed', 'true'); }
        if (anim) {
          const from = kind === 'page' ? 'translate(' + dir * 40 * u + 'px,' + 6 * u + 'px) scale(.97)' : 'translateY(' + 30 * u + 'px) scale(.94)';
          run(rec.el, full ? [{opacity: 0, transform: from}, {opacity: 1, transform: 'none'}] : [{opacity: 0}, {opacity: 1}], {duration: kind === 'enter' ? 760 : 560, delay: (kind === 'page' ? 110 : kind === 'enter' ? 160 : 140) + i * (kind === 'enter' ? 70 : 45), easing: EASE, fill: 'backwards'});
        }
      }
    });
    /* 5. выбранный товар исчез со сцены — снимаем выбор */
    if (s.sel && s.pageIds.indexOf(s.sel) < 0) clearSel(true);
    else if (s.sel) positionSel();
    s.defId = s.pageIds.find(id => P[id].f || P[id].n) || s.pageIds[0] || null;
    if (!s.sel && !s.hov) paintCard(s.defId, false);
    paintPager(pages);
    s.empty.hidden = s.ids.length > 0;
    s.rendered = true;
  }

  /* ---------- карточка справа ---------- */
  function cardHTML(p) {
    const b = B[p.brand] || {}, x = p.x || {}, url = root() + 'products/' + p.slug + '.html';
    const rows = [['Категория', CAT[p.c]], ['Вид', KIND[p.k]]]; if (x.volume) rows.push(['Объём', x.volume]); if (x.sku) rows.push(['Артикул', x.sku]); if (x.usage) rows.push(['Применение', x.usage]);
    const badge = p.n ? '<span class="c-bd is-new">Новинка</span>' : p.f ? '<span class="c-bd">Рекомендуем</span>' : '';
    return '<div class="c-in">' + badge + '<span class="c-br">' + esc(b.name || '') + '</span><div class="c-t">' + esc(p.name) + '</div><p class="c-d">' + esc(p.d || '') + '</p>' +
      '<div class="c-more"><div><div class="c-tasks">' + (p.ts || []).map(t => '<span class="tag blue">' + esc(TASK[t] || t) + '</span>').join('') + '</div>' +
      '<dl class="c-spec">' + rows.filter(r => r[1]).map(r => '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl></div></div>' +
      '<div class="c-act"><a class="btn btn-fill" href="' + esc(url) + '" data-track="product_card_click" data-place="showroom_card" data-product="' + esc(p.id) + '">Подробнее ' + (I.arrow || '') + '</a>' +
      '<button class="btn btn-ghost" type="button" data-act="form" data-type="product" data-ref="' + esc(p.id) + '">Запросить</button></div>' +
      '<div class="c-act c-extra">' + (X.quickView ? '<button class="btn btn-ghost" type="button" data-act="qv-open" data-id="' + esc(p.id) + '">Быстрый просмотр</button>' : '') +
      (NAVI ? '<button class="btn btn-ghost" type="button" data-act="qv-stella" data-id="' + esc(p.id) + '">Помочь с подбором</button>' : '') + '</div></div>' +
      '<button class="c-x" type="button" data-act="shw-close" aria-label="Закрыть карточку товара">' + (I.close || '×') + '</button>';
  }
  function paintCard(id, open) {
    const c = S.card; if (!id || !P[id]) { c.hidden = true; c._id = null; return; }
    c.hidden = false; c.classList.toggle('is-open', !!open);
    if (c._id === id) return;
    const first = !c._id, put = () => { c.innerHTML = cardHTML(P[id]); c.classList.remove('swap'); c._id = id; };
    clearTimeout(c._t);
    if (first || mode() === 'off') { put(); return; }
    c.classList.add('swap'); c._id = id; c._t = setTimeout(() => { c.innerHTML = cardHTML(P[id]); c.classList.remove('swap'); }, 150);
  }
  function preview(id) { if (!S) return; clearTimeout(S.hovT); S.hov = id; if (!S.sel) paintCard(id, false); const rec = S.items.get(id); if (rec) { const pd = S.pods.find(q => q.g === rec.g); if (pd) pd.el.classList.add('is-lit'); } }
  function unpreview() { if (!S) return; clearTimeout(S.hovT); S.hovT = setTimeout(() => { S.hov = null; S.pods.forEach(q => q.el.classList.remove('is-lit')); if (!S.sel) paintCard(S.defId, false); }, 170); }

  /* ---------- выбор ---------- */
  function positionSel() {
    const rec = S.items.get(S.sel); if (!rec) return;
    const it = rec.g.it, cx = it.cx, cy = it.t + it.h * .55;
    S.spot.style.transform = 'translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px)';
    let shift = 0;
    if (!S.narrow && cx > S.W / 2) { const top = S.card.parentNode, padL = parseFloat(getComputedStyle(top).paddingLeft) || 0; shift = -(S.card.offsetLeft - padL); }
    S.card.style.setProperty('--cx', shift.toFixed(1) + 'px');
  }
  function select(id) {
    if (!S || !S.items.has(id)) return;
    if (S.sel === id) { clearSel(); return; }
    S.items.forEach((rec, k) => { const on = k === id; rec.el.classList.toggle('is-sel', on); rec.el.setAttribute('aria-pressed', String(on)); });
    S.sel = id; S.root.classList.add('has-sel'); positionSel(); paintCard(id, true);
    track('showroom_select', {product: id});
    if (S.narrow && mode() !== 'off') setTimeout(() => { const r = S.card.getBoundingClientRect(); if (r.bottom > innerHeight - 8 || r.top < 70) S.card.scrollIntoView({behavior: 'smooth', block: 'nearest'}); }, 260);
  }
  function clearSel(quiet) {
    if (!S) return; const was = S.sel; S.sel = null; S.root.classList.remove('has-sel');
    S.items.forEach(rec => { rec.el.classList.remove('is-sel'); rec.el.setAttribute('aria-pressed', 'false'); });
    S.card.style.setProperty('--cx', '0px');
    paintCard(S.hov || S.defId, false);
    if (was && !quiet) { const rec = S.items.get(was); if (rec && document.activeElement === document.body) { try { rec.el.focus({preventScroll: true}); } catch (e) {} } }
  }

  /* ---------- листание ---------- */
  function paintPager(pages) {
    const pg = S.pager, n = S.ids.length;
    pg.hidden = pages < 2;
    if (pages < 2) return;
    const a = S.page * S.per + 1, b = Math.min(n, (S.page + 1) * S.per);
    S.pgText.textContent = a + '–' + b + ' из ' + n;
    $$('.shw-nav', pg).forEach(btn => { const d = +btn.getAttribute('data-dir'); btn.disabled = d < 0 ? S.page <= 0 : S.page >= pages - 1; });
  }
  function go(dir) {
    if (!S) return; const pages = Math.ceil(S.ids.length / S.per), np = Math.max(0, Math.min(pages - 1, S.page + dir)); if (np === S.page) return;
    S.page = np; if (S.sel) clearSel(true); render('page', dir); track('showroom_page', {page: np + 1});
  }

  /* ---------- панель фильтров: состояние берётся из настоящих select ---------- */
  const selOf = k => $('#f-' + k);
  const val = k => { const s = selOf(k); return s ? s.value : 'all'; };
  function syncUI() {
    const s = S, cards = $$('.pcard', s.grid), qEl = $('#cat-q'), toks = A.tokens ? A.tokens(qEl ? qEl.value : '') : [];
    const cur = {}; KEYS.forEach(k => { cur[k] = val(k); });
    const match = (c, skip) => KEYS.every(k => {
      if (k === skip || cur[k] === 'all') return true;
      return k === 'task' ? c.dataset.tasks.split(' ').indexOf(cur[k]) !== -1 : c.dataset[k] === cur[k];
    }) && toks.every(t => c.dataset.q.indexOf(t) !== -1);
    KEYS.forEach(k => {
      const grp = $('.shw-grp[data-key="' + k + '"]', s.aside); if (!grp) return;
      const pool = cards.filter(c => match(c, k));
      $$('.shw-o', grp).forEach(o => {
        const v = o.getAttribute('data-v'), on = cur[k] === v;
        const n = pool.filter(c => k === 'task' ? c.dataset.tasks.split(' ').indexOf(v) !== -1 : c.dataset[k] === v).length;
        o.setAttribute('aria-pressed', String(on)); $('em', o).textContent = n; o.classList.toggle('is-zero', n === 0);
        o.classList.toggle('keep', on && o.classList.contains('xtra'));
      });
      if (cur[k] !== 'all' && !grp.classList.contains('is-open')) { grp.classList.add('is-open'); $('.shw-gh', grp).setAttribute('aria-expanded', 'true'); }
    });
    const all = $('.shw-all', s.root); if (all) { const on = cur.cat === 'all'; all.classList.toggle('on', on); all.setAttribute('aria-pressed', String(on)); }
    const m = /(\d+)\D+(\d+)/.exec(($('#res-count') || {}).textContent || ''), cnt = $('[data-shw-count]', s.aside);
    if (cnt && m) cnt.textContent = m[1] + ' из ' + m[2];
    const rs = $('[data-shw-reset]', s.aside), rb = $('#cat-reset'); if (rs && rb) rs.hidden = rb.hidden;
  }

  /* ---------- запуск ---------- */
  function measure() {
    const s = S, W = s.stage.clientWidth, H = s.stage.clientHeight; if (!W || !H) return false;
    const narrow = nmq.matches, u = narrow ? W / 460 : W / 1000;
    let ch = W !== s.W || H !== s.H || narrow !== s.narrow;
    s.W = W; s.H = H; s.narrow = narrow; s.u = u; s.stage.style.setProperty('--u', u.toFixed(4) + 'px');
    /* что лежит над сценой (заголовок, категории, карточка): упаковки не должны заезжать под них — измеряем занятые области */
    if (!s.sel || !s.zones) s.zones = [];
    if (!narrow && !s.sel) {
      const sr = s.stage.getBoundingClientRect();
      [$('.page-head', s.root), $('.shw-pills', s.root), s.card].forEach(el => { if (!el || el.hidden) return; const r = el.getBoundingClientRect(); if (r.width && r.height) s.zones.push({l: r.left - sr.left, r: r.right - sr.left, b: r.bottom - sr.top}); });
    }
    const zs = s.zones.map(z => Math.round(z.b)).join(); if (zs !== s.zs) { s.zs = zs; ch = true; }
    return ch;
  }
  function variantOf() { const c = val('cat'); return c === 'all' ? 0 : ((D.cats || []).findIndex(x => x.id === c) + 1) % 3; }
  function ensure() {
    if (S && S.root.isConnected) return S;
    if (S && S.ro) S.ro.disconnect();
    const rootEl = $('[data-shw]'); if (!rootEl) { S = null; return null; }
    S = {root: rootEl, stage: $('[data-shw-stage]', rootEl), card: $('[data-shw-card]', rootEl), pager: $('[data-shw-pager]', rootEl), pgText: $('[data-shw-pg]', rootEl), empty: $('[data-shw-empty]', rootEl),
      aside: $('.shw-aside'), grid: $('#cat-grid'), ids: [], pageIds: [], page: 0, per: 6, W: 0, H: 0, u: 1, narrow: false, variant: 0, items: new Map(), pods: [], anims: new Set(), sel: null, hov: null, defId: null, rendered: false, rz: 0, rect: null};
    S.spot = document.createElement('i'); S.spot.className = 'shw-spot'; S.spot.setAttribute('aria-hidden', 'true'); S.stage.appendChild(S.spot);
    S.root.addEventListener('click', e => { if (S.sel && e.target.closest && !e.target.closest('.shw-it') && !e.target.closest('.shw-card') && e.target.closest('.shw-stage')) clearSel(); });
    S.stage.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const its = $$('.shw-it:not(.is-gone)', S.stage), i = its.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); const nx = its[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (nx) nx.focus();
    });
    S.ro = window.ResizeObserver ? new ResizeObserver(() => { if (S.rz) return; S.rz = requestAnimationFrame(() => { S.rz = 0; layout(); }); }) : null;
    if (S.ro) { S.ro.observe(S.stage); const hd = $('.shw-head', S.root); if (hd) S.ro.observe(hd); } else addEventListener('resize', () => layout());
    S.ids = visibleIds(); S.variant = variantOf();
    popInit();
    return S;
  }
  function layout() {
    if (!S) return; const ch = measure(); if (!S.W) return;
    if (!S.rendered) { render('enter'); return; }
    if (ch) {
      const first = S.page * S.per; S.stage.classList.add('rz'); S.page = Math.floor(first / perFor(S.W, S.narrow)); render(null); requestAnimationFrame(() => S && S.stage.classList.remove('rz'));
    }
  }
  function sync(push) {
    const s = ensure(); if (!s) return;
    const ids = visibleIds(), changed = ids.join() !== s.ids.join(), v = variantOf(), vch = v !== s.variant;
    s.ids = ids; s.variant = v;
    syncUI();
    if (!s.rendered || !s.W) return;                                   // первая отрисовка — после того, как известен размер сцены (layout)
    if (changed || vch) { s.page = 0; if (s.sel) clearSel(true); render(push ? 'filter' : null); }
  }

  /* ---------- «Рекомендуем»: стрелки прокручивают ряд ---------- */
  function popInit() {
    const t = $('.shw-pop-t'); if (!t || t._shw) return; t._shw = true;
    const upd = () => { const prev = $('.shw-pop-w .prev'), next = $('.shw-pop-w .next'); if (!prev) return; prev.disabled = t.scrollLeft < 4; next.disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4; };
    let raf = 0; t.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; upd(); }); }, {passive: true});
    if (window.ResizeObserver) new ResizeObserver(upd).observe(t); upd();
  }

  /* ---------- действия ---------- */
  A.actions = A.actions || {};
  A.actions['shw-pick'] = (t, id) => select(id || t.getAttribute('data-id'));
  A.actions['shw-close'] = () => clearSel();
  A.actions['shw-page'] = t => go(+t.getAttribute('data-dir'));
  A.actions['shw-opt'] = t => {
    const k = t.getAttribute('data-key'), v = t.getAttribute('data-v'), sel = selOf(k); if (!sel) return;
    sel.value = sel.value === v ? 'all' : v; sel.dispatchEvent(new Event('change', {bubbles: true}));
  };
  A.actions['shw-grp'] = t => { const g = t.closest('.shw-grp'), open = g.classList.toggle('is-open'); t.setAttribute('aria-expanded', String(open)); };
  A.actions['shw-more'] = t => { const go = t.closest('.shw-go'), on = go.classList.toggle('more'), n = $$('.shw-o.xtra', go).length; t.setAttribute('aria-expanded', String(on)); t.textContent = on ? 'Свернуть' : 'Ещё ' + n; };
  A.actions['shw-pop-nav'] = t => { const tr = $('.shw-pop-t'); if (tr) tr.scrollBy({left: +t.getAttribute('data-dir') * tr.clientWidth * .92, behavior: mode() === 'full' ? 'smooth' : 'auto'}); };
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !S || !S.sel || !S.root.isConnected) return;
    const m = $('#modal'); if (m && m.classList.contains('open')) return;
    clearSel();
  });
  /* «Смотреть весь список» и плитки категорий не должны прыгать к панели фильтров: она теперь слева от сцены */
  A.showroom = {
    sync,
    select: id => select(id), close: () => clearSel(), page: dir => go(dir),
    state: () => S && ({ids: S.ids.slice(), pageIds: (S.pageIds || []).slice(), page: S.page, per: S.per, sel: S.sel, narrow: S.narrow, W: S.W, H: S.H, u: S.u, rendered: S.rendered}),
    /* для перелёта в окно просмотра (gallery.js): упаковка товара на сцене и её рамка */
    flightSrc: id => { if (!S || !S.root.isConnected) return null; const rec = S.items.get(id); if (!rec || rec.el.classList.contains('is-gone')) return null; const el = rec.el.querySelector('.shw-pk, .shw-img'); return el ? {el, rect: el.getBoundingClientRect()} : null; }
  };
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); const s = ensure(); if (s) { syncUI(); layout(); } };
})();
