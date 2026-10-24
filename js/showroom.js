/* showroom.js — «Каталог-шоурум» (data/redesign.json → extras.showroom; стили — css/showroom.css, разметка — src/pages/showroom.js). Подключается после gallery.js; работает только на странице каталога.
   Что делает (поверх существующей логики каталога, ничего не заменяя):
   1) Экспозиция. Видимые (отфильтрованные и отсортированные) товары из списка #cat-grid ставятся в сцену 1536×1024: до 7 товаров — на подиумы переднего плана (главный — крупнее и на самом высоком подиуме),
      ещё до 4 — на стеклянные полки ниши (дальний план, мягкий фокус). Остальные — на следующих страницах; полный список всегда ниже (товары не теряются).
      Товар — настоящее фото (поле image) или, пока его нет, условный 3D-макет упаковки без текста и логотипов (assets/showroom/*.webp); фото не искажается.
   2) Смена категории/фильтра/страницы: ушедшие товары растворяются, оставшиеся переезжают на новые места (FLIP), новые появляются; высоты подиумов и композиция зависят от категории — архитектура остаётся на месте.
   3) Наведение: упаковка приподнимается, под ней загорается свет, проявляется название, карточка показывает превью. Выбор (клик/тап): остальные приглушаются, включается световое пятно, карточка раскрывается
      и приезжает к выбранному товару (соединена с ним тонкой линией): описание, назначение, характеристики из данных, «Подробнее», «Запросить», «Быстрый просмотр», «Помочь с подбором».
      Закрыть — крестиком, Esc или кликом по пустому месту сцены.
   4) Панель фильтров слева — кнопки-галочки поверх настоящих <select> (#f-brand/#f-cat/#f-task/#f-kind): значения живут в них, поэтому работают адреса с параметрами, Стелла, тесты и gallery.js.
   Двигаются только opacity и transform; prefers-reduced-motion — только прозрачность; «лёгкий режим» (html.lite) — без анимаций. Идемпотентно: страницы могут подменяться без перезагрузки (A.initPage). */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras || !D.extras.showroom || !D.extras.gallery) return;
  const X = D.extras, I = A.I || {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const html = document.documentElement, rmq = matchMedia('(prefers-reduced-motion: reduce)'), smq = matchMedia('(max-width:1100px)');
  const canAnimate = typeof Element.prototype.animate === 'function';
  const mode = () => (html.classList.contains('lite') || !canAnimate) ? 'off' : rmq.matches ? 'soft' : 'full';
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const esc = A.esc || (s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
  const root = () => document.body.getAttribute('data-root') || '';
  const track = (n, d) => { try { A.track && A.track(n, d); } catch (e) {} };
  const P = {}, B = {}, CAT = {}, TASK = {}, KIND = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.cats || []).forEach(c => { CAT[c.id] = c.name; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.kinds || []).forEach(k => { KIND[k.id] = k.name; });
  const PACKS = (D.showroom && D.showroom.packs) || {}, PHOTOS = !!(D.showroom && D.showroom.photos);        // настоящие фото в сцене — только при extras.showroomPhotos; по умолчанию витрина показывает 3D-рендеры упаковки
  const NAVI = !!(X.navigator && D.guide);
  const KEYS = ['brand', 'cat', 'task', 'kind'];
  const bstyle = b => (A.bstyle ? A.bstyle(b) : '--c1:' + b.c1 + ';--c2:' + b.c2 + ';--ink:' + b.ink);
  const W0 = 1536, H0 = 1024;

  /* высота упаковки на сцене (проектные пиксели холста) по виду упаковки; ширина — из пропорций картинки */
  const TH = {bottle: 240, pump: 246, dropper: 205, tube: 214, jar: 118, box: 122, device: 240};
  const thOf = p => TH[p.t] || TH.bottle;
  const packKey = p => { const s = A.packOf ? A.packOf(p) : ''; const m = /([^/]+)\.webp$/.exec(s); return m ? m[1] : ''; };
  const url = p => A.assetUrl ? A.assetUrl(p) : root() + p;       // обычный сайт: путь от корня; автономная сборка: data:-адрес
  const imgOf = p => p.im && PHOTOS ? {src: url(p.im), ar: p.iw && p.ih ? p.iw / p.ih : .45, mock: false} : (() => { const k = packKey(p), m = PACKS[k]; return {src: url(A.packOf ? A.packOf(p) : ''), ar: m ? m.w / m.h : .3, mock: true, label: m && m.label}; })();

  let S = null;

  /* ---------- состав и режимы ---------- */
  const visibleIds = () => $$('.pcard', S.grid).filter(c => !c.hidden).map(c => c.getAttribute('data-id'));
  const inView = () => { const r = S.view.getBoundingClientRect(); return r.bottom > -80 && r.top < innerHeight + 80; };
  const MAIN_MAX = 7, NICHE = [[1352, 425], [1436, 425], [1352, 549], [1436, 549]];
  const perFor = () => MAIN_MAX + NICHE.length;
  /* на узких экранах показывается та же сцена, что на компьютере: полоса холста [WX0…1536]×[WY0…WY0+WH]; если по ширине она не умещается при читаемом масштабе, сцену можно сдвигать пальцем или стрелками */
  const WX0 = 270, WY0 = 128, WW = 1266, WH = 612, MIN_VIEW_H = 330, PAN_S = .8;

  /* расстановка по макету 1536×1024: семь подиумов передней группы стоят террасой (главный товар — на самом высоком подиуме посередине, остальные ниже и разной ширины, подиумы перекрывают друг друга),
     ещё четыре товара — на двух стеклянных полках ниши справа (мельче, в мягком фокусе). Размеры — проектные пиксели холста.
     REF: [x центра, диаметр подиума, высота, ряд (0 — дальний, 1 — передний), масштаб товара] */
  const REF = [[452, 262, 40, 1, 1.00], [585, 176, 78, 0, .95], [738, 230, 100, 1, 1.08], [880, 214, 52, 0, 1.06], [1008, 168, 76, 1, 1.00], [1130, 236, 42, 0, 1.00], [1292, 264, 38, 1, 1.04]];
  const HV = [[1, 1, 1, 1, 1, 1, 1], [1.7, 1.0, .75, 1.6, .9, 1.8, 1.9], [.9, 1.5, 1.15, .75, 1.7, .8, 1.4]];      // высоты подиумов по категории: «композиций» три, архитектура одна
  const BASE = [654, 686], CAP_RATIO = (D.showroom && D.showroom.pod && D.showroom.pod.capRatio) || .1026;
  function compose(prods, s) {
    const n = Math.min(prods.length, MAIN_MAX), slots = [], v = s.variant;
    const idx = n === 1 ? [2] : Array.from({length: n}, (_, i) => Math.round(i * 6 / (n - 1)));
    for (let i = 0; i < n; i++) {
      const p = prods[i], [cx, diam, h0, row, sc] = REF[idx[i]], hero = idx[i] === 2 || (n <= 3 && i === Math.floor((n - 1) / 2));
      const hh = Math.max(30, Math.min(124, h0 * HV[v][idx[i]])), im = imgOf(p), th = thOf(p) * sc, bw = th * im.ar, bh = th;
      const pw = Math.max(diam, bw * 1.5), e = pw * CAP_RATIO, topFace = BASE[row] - hh;                 // y центра верхней грани подиума — здесь стоит упаковка
      slots.push({group: 'main', i, p, im, hero, row, pod: {l: cx - pw / 2, t: topFace - e / 2, w: pw, e, b: hh}, it: {l: cx - bw / 2, t: topFace + e * .08 - bh, w: bw, h: bh, cx, z: 5 + row * 2 + (hero ? 1 : 0)}});
    }
    prods.slice(MAIN_MAX, MAIN_MAX + NICHE.length).forEach((p, k) => {
      const im = imgOf(p), th = thOf(p) * .5, bw = th * im.ar, [cx, y] = NICHE[k];
      slots.push({group: 'niche', i: MAIN_MAX + k, p, im, hero: false, row: 0, pod: null, it: {l: cx - bw / 2, t: y + 2 - th, w: bw, h: th, cx, z: 3}});
    });
    return slots;
  }

  /* ---------- элементы ---------- */
  function itemEl(g) {
    const p = g.p, b = B[p.brand] || {}, im = g.im, el = document.createElement('button');
    el.type = 'button'; el.className = 'shw-it' + (g.group === 'niche' ? ' is-bg' : ''); el.setAttribute('data-act', 'shw-pick'); el.setAttribute('data-id', p.id); el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', (b.name ? b.name + ' — ' : '') + p.name); el.setAttribute('style', bstyle(b));
    el.innerHTML = '<i class="shw-gl"></i><i class="shw-sh"></i><span class="shw-ph"><img class="shw-img' + (im.mock || p.ia ? '' : ' opq') + '" src="' + esc(im.src) + '" alt="" decoding="async" draggable="false"></span><span class="shw-nm"><small>' + esc(b.name || '') + '</small>' + esc(p.name) + '</span>';
    el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') preview(p.id); });
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') unpreview(); });
    el.addEventListener('focus', () => preview(p.id));
    el.addEventListener('blur', () => unpreview());
    return el;
  }
  function podEl() { const el = document.createElement('i'); el.className = 'shw-slab shw-pd'; el.setAttribute('aria-hidden', 'true'); return el; }
  function placeItem(rec, g) {
    const el = rec.el, it = g.it, st = el.style;
    st.left = it.l.toFixed(1) + 'px'; st.top = it.t.toFixed(1) + 'px'; st.width = it.w.toFixed(1) + 'px'; st.height = it.h.toFixed(1) + 'px';
    el.style.setProperty('--bw', it.w.toFixed(1) + 'px'); el.style.setProperty('--z', it.z);
    el.style.setProperty('--pdh', g.pod ? (g.pod.t + g.pod.e + g.pod.b - (it.t + it.h)).toFixed(1) + 'px' : '14px');
    rec.g = g;
  }
  function placePod(rec, g) {
    const el = rec.el, d = g.pod, st = el.style;
    st.left = d.l.toFixed(1) + 'px'; st.top = d.t.toFixed(1) + 'px'; st.setProperty('--w', d.w.toFixed(1) + 'px'); st.setProperty('--e', d.e.toFixed(1) + 'px'); st.setProperty('--b', d.b.toFixed(1) + 'px'); st.zIndex = 2 + g.row * 2;
    rec.g = g;
  }

  /* ---------- анимации (WAAPI; только opacity и transform) ---------- */
  function run(el, kf, opt) { const a = el.animate(kf, opt); S.anims.add(a); a.onfinish = a.oncancel = () => { S && S.anims.delete(a); }; return a; }
  function stopAnims() { if (!S) return; S.anims.forEach(a => { try { a.cancel(); } catch (e) {} }); S.anims.clear(); }
  const rel = el => { const r = el.getBoundingClientRect(), sr = S.rect, k = S.s || 1; return {l: (r.left - sr.left) / k, t: (r.top - sr.top) / k, w: r.width / k, h: r.height / k}; };

  function render(kind, dir) {
    const s = S; if (!s || !s.W) return;
    const m = mode(), anim = !!kind && m !== 'off' && inView(), full = anim && m === 'full';
    s.per = perFor(s);
    const pages = Math.max(1, Math.ceil(s.ids.length / s.per)); s.page = Math.max(0, Math.min(pages - 1, s.page));
    const ids = s.ids.slice(s.page * s.per, s.page * s.per + s.per), prods = ids.map(id => P[id]).filter(Boolean);
    s.pageIds = prods.map(p => p.id);
    s.rect = s.stage.getBoundingClientRect();
    const slots = compose(prods, s);
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
      const a = run(rec.el, full ? [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translate(' + (kind === 'page' ? -dir * 36 : 0) + 'px,' + (kind === 'page' ? 0 : 14) + 'px) scale(.97)'}] : [{opacity: 1}, {opacity: 0}], {duration: kind === 'page' ? 280 : 240, easing: 'ease-out', fill: 'forwards'});
      a.onfinish = a.oncancel = () => { S && S.anims.delete(a); done(); };
    });
    /* 3. подиумы по номеру места (у полки подиума нет) */
    const pg = slots.filter(g => g.pod);
    for (let i = 0; i < Math.max(pg.length, s.pods.length); i++) {
      const g = pg[i], rec = s.pods[i];
      if (g && rec) {
        placePod(rec, g); const o = oldPd[i];
        if (full && o && kind !== 'page') { const n = rel(rec.el); if (Math.abs(o.l - n.l) > 1 || Math.abs(o.t - n.t) > 1 || Math.abs(o.w - n.w) > 1 || Math.abs(o.h - n.h) > 1) run(rec.el, [{transform: 'translate(' + (o.l - n.l) + 'px,' + (o.t - n.t) + 'px) scale(' + (o.w / n.w) + ',' + (o.h / n.h) + ')', transformOrigin: '0 0'}, {transform: 'none', transformOrigin: '0 0'}], {duration: 640, easing: EASE}); }
      } else if (g) {
        const r = {el: podEl(), g}; s.pods[i] = r; s.stage.insertBefore(r.el, s.spot); placePod(r, g);
        if (anim) run(r.el, full ? [{opacity: 0, transform: 'translateY(26px) scaleY(.7)'}, {opacity: 1, transform: 'none'}] : [{opacity: 0}, {opacity: 1}], {duration: 600, delay: 45 * i, easing: EASE, fill: 'backwards'});
      } else if (rec) {
        s.pods[i] = null; const el = rec.el;
        if (!anim) el.remove(); else { const a = run(el, [{opacity: 1}, {opacity: 0}], {duration: 220, easing: 'ease-out', fill: 'forwards'}); a.onfinish = a.oncancel = () => { S && S.anims.delete(a); el.remove(); }; }
      }
    }
    s.pods = s.pods.filter(Boolean);
    /* 4. товары: остались — переезжают, новые — появляются */
    slots.forEach((g, i) => {
      const p = g.p; let rec = s.items.get(p.id);
      if (rec) {
        placeItem(rec, g); const o = oldIt.get(p.id);
        if (full && o) { const n = rel(rec.el), dx = o.l - n.l, dy = o.t - n.t; if (Math.abs(dx) > 1 || Math.abs(dy) > 1) run(rec.el, [{transform: 'translate(' + dx + 'px,' + dy + 'px)'}, {transform: 'none'}], {duration: 640, easing: EASE}); }
      } else {
        rec = {el: itemEl(g), g}; s.items.set(p.id, rec); s.stage.insertBefore(rec.el, s.spot); placeItem(rec, g);
        if (p.id === s.sel) { rec.el.classList.add('is-sel'); rec.el.setAttribute('aria-pressed', 'true'); }
        if (anim) {
          const from = kind === 'page' ? 'translate(' + dir * 44 + 'px,6px) scale(.97)' : 'translateY(34px) scale(.95)';
          run(rec.el, full ? [{opacity: 0, transform: from}, {opacity: 1, transform: 'none'}] : [{opacity: 0}, {opacity: 1}], {duration: kind === 'enter' ? 800 : 580, delay: (kind === 'page' ? 120 : kind === 'enter' ? 200 : 150) + (g.group === 'niche' ? 260 : 0) + i * (kind === 'enter' ? 75 : 48), easing: EASE, fill: 'backwards'});
        }
      }
    });
    /* 5. выбранный товар исчез со сцены — снимаем выбор */
    if (s.sel && s.pageIds.indexOf(s.sel) < 0) clearSel(true);
    else if (s.sel) positionSel();
    const hero = slots.find(g => g.hero) || slots[0];
    s.defId = (slots.find(g => g.group === 'main' && (g.p.f || g.p.n)) || hero || {p: {}}).p.id || null;
    if (!s.sel && !s.hov) paintCard(s.defId, false);
    paintPager(pages);
    s.empty.hidden = s.ids.length > 0;
    s.rendered = true;
  }

  /* ---------- карточка товара ---------- */
  function cardHTML(p) {
    const b = B[p.brand] || {}, x = p.x || {}, url = root() + 'products/' + p.slug + '.html';
    const rows = [['Категория', CAT[p.c]], ['Вид', KIND[p.k]]]; if (x.volume) rows.push(['Объём', x.volume]); if (x.sku) rows.push(['Артикул', x.sku]); if (x.usage) rows.push(['Применение', x.usage]);
    const badge = p.n ? '<span class="c-bd is-new">Новинка</span>' : p.f ? '<span class="c-bd">Рекомендуем</span>' : '';
    return '<div class="c-in">' + badge + '<span class="c-br">' + esc(b.name || '') + '</span><div class="c-t">' + esc(p.name) + '</div><p class="c-d">' + esc(p.d || '') + '</p>' +
      '<div class="c-more"><div><div class="c-tasks">' + (p.ts || []).map(t => '<span class="tag blue">' + esc(TASK[t] || t) + '</span>').join('') + '</div>' +
      '<dl class="c-spec">' + rows.filter(r => r[1]).map(r => '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl>' +
      (p.im && PHOTOS ? '' : '<p class="c-note">Изображение упаковки условное — это 3D-макет без текста и логотипов.</p>') + '</div></div>' +
      '<div class="c-act"><a class="btn btn-fill" href="' + esc(url) + '" data-track="product_card_click" data-place="showroom_card" data-product="' + esc(p.id) + '">Подробнее ' + (I.arrow || '') + '</a>' +
      '<button class="btn btn-ghost" type="button" data-act="form" data-type="product" data-ref="' + esc(p.id) + '">Запросить</button></div>' +
      '<div class="c-act c-extra">' + (X.quickView ? '<button class="btn btn-ghost" type="button" data-act="qv-open" data-id="' + esc(p.id) + '">Быстрый просмотр</button>' : '') +
      (NAVI ? '<button class="btn btn-ghost" type="button" data-act="qv-stella" data-id="' + esc(p.id) + '">Помочь с подбором</button>' : '') + '</div></div>' +
      '<button class="c-x" type="button" data-act="shw-close" aria-label="Закрыть карточку товара">' + (I.close || '×') + '</button>';
  }
  function paintCard(id, open) {
    const c = S.card; if (!id || !P[id]) { clearTimeout(c._t); c.classList.remove('swap'); c.hidden = true; c._id = null; return; }
    c.hidden = false; c.classList.toggle('is-open', !!open);
    if (c._id === id) return;
    const first = !c._id; clearTimeout(c._t);
    if (first || mode() === 'off') { c.classList.remove('swap'); c.innerHTML = cardHTML(P[id]); c._id = id; return; }
    c.classList.add('swap'); c._id = id; c._t = setTimeout(() => { c.innerHTML = cardHTML(P[id]); c.classList.remove('swap'); }, 150);
  }
  function preview(id) { if (!S) return; clearTimeout(S.hovT); S.hov = id; if (!S.sel) paintCard(id, false); const rec = S.items.get(id), pd = rec && S.pods.find(q => q.g === rec.g); if (pd) pd.el.classList.add('is-lit'); }
  function unpreview() { if (!S) return; clearTimeout(S.hovT); S.hovT = setTimeout(() => { if (!S) return; S.hov = null; S.pods.forEach(q => q.el.classList.remove('is-lit')); if (!S.sel) paintCard(S.defId, false); }, 170); }

  /* ---------- выбор ---------- */
  function positionSel() {
    const rec = S.items.get(S.sel); if (!rec) return; const it = rec.g.it;
    S.spot.style.transform = 'translate(' + it.cx.toFixed(1) + 'px,' + (it.t + it.h * .55).toFixed(1) + 'px)';
    if (S.stack) { S.card.style.setProperty('--cx', '0px'); S.card.style.setProperty('--cy', '0px'); if (S.panOn) S.view.scrollTo({left: Math.max(0, it.cx * S.s - S.view.clientWidth / 2), behavior: mode() === 'full' ? 'smooth' : 'auto'}); return; }
    /* карточка приезжает к товару: справа от него, а если места нет — слева; выноска идёт от края карточки к упаковке */
    const cw = 270, right = it.l + it.w + 46 + cw < W0 - 18, x = right ? it.l + it.w + 46 : it.l - 46 - cw, y = Math.max(132, Math.min(262, it.t - 8));                                    /* раскрытая карточка ≈470 px высотой: её низ не заходит на ряд «Рекомендуем» (с 743) */
    S.card.style.setProperty('--cx', (x - 1252).toFixed(1) + 'px'); S.card.style.setProperty('--cy', (y - 142).toFixed(1) + 'px');
    const x1 = right ? x : x + cw, y1 = y + 54, x2 = right ? it.l + it.w * .86 : it.l + it.w * .14, y2 = it.t + it.h * .34, len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    S.link.style.width = len.toFixed(1) + 'px'; S.link.style.transform = 'translate(' + x1.toFixed(1) + 'px,' + y1.toFixed(1) + 'px) rotate(' + ang.toFixed(2) + 'deg)';
  }
  function select(id) {
    if (!S || !S.items.has(id)) return;
    if (S.sel === id) { clearSel(); return; }
    S.items.forEach((rec, k) => { const on = k === id; rec.el.classList.toggle('is-sel', on); rec.el.setAttribute('aria-pressed', String(on)); });
    S.sel = id; S.root.classList.add('has-sel'); positionSel(); paintCard(id, true);
    track('showroom_select', {product: id});
    if (S.stack && mode() !== 'off') setTimeout(() => { if (!S) return; const r = S.card.getBoundingClientRect(); if (r.bottom > innerHeight - 8 || r.top < 70) S.card.scrollIntoView({behavior: 'smooth', block: 'nearest'}); }, 260);
  }
  function clearSel(quiet) {
    if (!S) return; const was = S.sel; S.sel = null; S.root.classList.remove('has-sel');
    S.items.forEach(rec => { rec.el.classList.remove('is-sel'); rec.el.setAttribute('aria-pressed', 'false'); });
    S.card.style.setProperty('--cx', '0px'); S.card.style.setProperty('--cy', '0px');
    paintCard(S.hov || S.defId, false);
    if (was && !quiet) { const rec = S.items.get(was); if (rec && document.activeElement === document.body) { try { rec.el.focus({preventScroll: true}); } catch (e) {} } }
  }

  /* ---------- листание ---------- */
  function paintPager(pages) {
    const pg = S.pager, n = S.ids.length;
    pg.hidden = pages < 2; if (pages < 2) return;
    const a = S.page * S.per + 1, b = Math.min(n, (S.page + 1) * S.per);
    S.pgText.textContent = S.stack ? a + '–' + b + ' из ' + n : (S.page + 1) + ' / ' + pages;
    S.pgText.setAttribute('title', a + '–' + b + ' из ' + n);
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

  /* ---------- размеры и запуск ---------- */
  function measure() {
    const s = S, stack = smq.matches; let W, H, k;
    if (stack) {
      W = s.vw.clientWidth; const fit = W / WW;
      k = fit * WH >= MIN_VIEW_H ? fit : PAN_S; H = WH * k;                       // помещается целиком — масштаб по ширине; иначе — крупнее, со сдвигом
    } else { W = s.room.clientWidth; H = s.room.clientHeight; k = W / W0; }
    if (!W || !H) return false;
    const ch = stack !== s.stack || Math.abs(k - s.s) > 1e-4 || !s.W;
    s.W = W; s.H = H; s.s = k; s.stack = stack;
    const st = s.room.style; st.setProperty('--s', k.toFixed(5));
    if (stack) { st.setProperty('--wy', WY0); st.setProperty('--wh', WH); }
    else { ['--wy', '--wh'].forEach(n => st.removeProperty(n)); }
    const pan = stack && W0 * k > W + 2; s.panOn = pan;
    $$('.shw-pan', s.root).forEach(b => { b.hidden = !pan; });
    if (stack && !s.centered && W) { s.view.scrollLeft = Math.max(0, 872 * k - W / 2); s.centered = true; }
    if (!stack) s.centered = false;
    return ch;
  }
  function variantOf() { const c = val('cat'); return c === 'all' ? 0 : ((D.cats || []).findIndex(x => x.id === c) + 1) % 3; }
  function ensure() {
    if (S && S.root.isConnected) return S;
    if (S && S.ro) S.ro.disconnect(); if (S && S.io) S.io.disconnect();
    const rootEl = $('[data-shw]'); if (!rootEl) { S = null; html.classList.remove('shw-top'); return null; }
    S = {root: rootEl, room: $('[data-shw-room]', rootEl), vw: $('.shw-vw', rootEl), view: $('[data-shw-view]', rootEl), stage: $('[data-shw-stage]', rootEl), card: $('[data-shw-card]', rootEl), pager: $('[data-shw-pager]', rootEl), pgText: $('[data-shw-pg]', rootEl), empty: $('[data-shw-empty]', rootEl),
      aside: $('.shw-aside', rootEl), grid: $('#cat-grid'), ids: [], pageIds: [], page: 0, per: 11, W: 0, H: 0, s: 1, stack: false, panOn: false, centered: false, variant: 0, items: new Map(), pods: [], anims: new Set(), sel: null, hov: null, defId: null, rendered: false, rz: 0, rect: null};
    S.spot = document.createElement('i'); S.spot.className = 'shw-spot'; S.spot.setAttribute('aria-hidden', 'true'); S.stage.appendChild(S.spot);
    S.sent = document.createElement('i'); S.sent.className = 'shw-sent'; S.sent.setAttribute('aria-hidden', 'true'); S.room.appendChild(S.sent);
    if (window.IntersectionObserver) { S.io = new IntersectionObserver(es => es.forEach(e => html.classList.toggle('shw-top', e.isIntersecting)), {rootMargin: '-84px 0px 0px 0px'}); S.io.observe(S.sent); } else html.classList.add('shw-top');
    S.link = document.createElement('i'); S.link.className = 'shw-link'; S.link.setAttribute('aria-hidden', 'true'); $('.shw-canvas', rootEl).appendChild(S.link);
    S.root.addEventListener('click', e => { if (S.sel && e.target.closest && !e.target.closest('.shw-it') && !e.target.closest('.shw-card') && e.target.closest('.shw-view')) clearSel(); });
    S.view.addEventListener('scroll', () => { if (S.stack && !S.panRaf) S.panRaf = requestAnimationFrame(() => { if (!S) return; S.panRaf = 0; updatePan(); }); }, {passive: true});
    S.stage.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const its = $$('.shw-it:not(.is-gone)', S.stage), i = its.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); const nx = its[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (nx) nx.focus();
    });
    S.ro = window.ResizeObserver ? new ResizeObserver(() => { if (!S || S.rz) return; S.rz = requestAnimationFrame(() => { if (!S) return; S.rz = 0; layout(); }); }) : null;
    if (S.ro) S.ro.observe(S.room); else addEventListener('resize', () => layout());
    S.ids = visibleIds(); S.variant = variantOf();
    popInit();
    return S;
  }
  function layout() {
    if (!S) return; const ch = measure(); if (!S.W) return;
    if (!S.rendered) { render('enter'); return; }
    if (ch) { const first = S.page * S.per; S.per = perFor(S); S.page = Math.floor(first / S.per); render(null); }
    if (S.stack && S.panOn) updatePan();
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
  function updatePan() { const v = S.view, l = $('.shw-pan.prev', S.root), r = $('.shw-pan.next', S.root); if (l) l.disabled = v.scrollLeft < 4; if (r) r.disabled = v.scrollLeft + v.clientWidth >= v.scrollWidth - 4; }
  A.actions['shw-pan'] = t => { if (!S) return; S.view.scrollBy({left: +t.getAttribute('data-dir') * S.view.clientWidth * .7, behavior: mode() === 'full' ? 'smooth' : 'auto'}); };
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
  A.showroom = {
    sync,
    select: id => select(id), close: () => clearSel(), page: dir => go(dir),
    state: () => S && ({ids: S.ids.slice(), pageIds: (S.pageIds || []).slice(), page: S.page, per: S.per, sel: S.sel, stack: S.stack, pan: S.panOn, W: S.W, H: S.H, s: S.s, rendered: S.rendered, pods: S.pods.length}),
    /* для перелёта в окно просмотра (gallery.js): упаковка товара на сцене и её рамка */
    flightSrc: id => { if (!S || !S.root.isConnected) return null; const rec = S.items.get(id); if (!rec || rec.el.classList.contains('is-gone')) return null; const el = rec.el.querySelector('.shw-ph'); return el ? {el, img: rec.el.querySelector('.shw-img'), rect: el.getBoundingClientRect()} : null; }
  };
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); const s = ensure(); if (s) { syncUI(); layout(); } };
})();
