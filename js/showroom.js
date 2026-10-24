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
  const MAIN_MAX = 10;                                                  // всё на переднем плане: на странице десять товаров, каждый на своём подиуме; на заднем плане (ниша, полки) предметов нет
  const perFor = () => MAIN_MAX;
  /* на узких экранах показывается та же сцена, что на компьютере: полоса холста [WX0…1536]×[WY0…WY0+WH]; если по ширине она не умещается при читаемом масштабе, сцену можно сдвигать пальцем или стрелками */
  const ASIDE_TOP = 100, COMPACT_TOP = 318, COMPACT_EXT = 392;                          // по вертикали холста показываем от верха самой высокой упаковки (y≈318) до оснований подиумов (y≈710)

  /* расстановка по макету 1536×1024: десять подиумов в одну линию на переднем плане — высота разная, ряд чередуется (дальний/передний: ±32 px по вертикали), главный товар — на самом высоком подиуме и крупнее.
     Подиумы не перекрывают друг друга, упаковка занимает не больше FIT ширины своего подиума — ни один товар не заходит на чужой подиум и не закрывает соседа. Размеры — проектные пиксели холста.
     REF: [высота подиума, ряд (0 — дальний, 1 — передний), масштаб товара] */
  const REF = [[44, 1, 1.00], [82, 0, .96], [104, 1, 1.08], [56, 0, 1.04], [92, 1, 1.00], [40, 0, 1.02], [76, 1, .98], [100, 0, 1.06], [50, 1, 1.00], [70, 0, 1.03]];
  const HV = [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1.7, 1.0, .75, 1.6, .9, 1.8, 1.2, .8, 1.5, .9], [.9, 1.5, 1.15, .75, 1.7, .8, 1.4, 1.1, .7, 1.6]];      // высоты подиумов по категории: «композиций» три, архитектура одна
  const BASE = [654, 686], CAP_RATIO = (D.showroom && D.showroom.pod && D.showroom.pod.capRatio) || .1026, TOP_MIN = 322;
  const SPAN = [322, 1448], GAP = 10, FIT = .82, PW_MIN = 96;
  function compose(prods, s) { return s.rows2 ? composeRows(prods, s) : composeLine(prods, s); }
  function composeLine(prods, s) {
    s.stage.classList.remove('is-rows2');
    const n = Math.min(prods.length, MAIN_MAX), slots = [], v = s.variant;
    const idx = n === 1 ? [2] : Array.from({length: n}, (_, i) => Math.round(i * (MAIN_MAX - 1) / (n - 1)));
    const cells = idx.map((k, i) => { const [h0, row, sc] = REF[k], p = prods[i], im = imgOf(p), th = thOf(p) * sc, bw = th * im.ar; return {k, p, im, h0, row, th, bw, pw: Math.max(bw / FIT, PW_MIN), hero: k === 2 || (n <= 3 && i === Math.floor((n - 1) / 2))}; });
    const avail = SPAN[1] - SPAN[0], sum = cells.reduce((a, c) => a + c.pw, 0), gaps = (n - 1) * GAP, f = Math.min(1, (avail - gaps) / sum);
    const extra = n > 1 ? Math.min(46, Math.max(0, avail - gaps - sum * f) / (n - 1)) : 0, used = sum * f + (gaps + extra * (n - 1));
    let x = SPAN[0] + (avail - used) / 2;
    cells.forEach((c, i) => {
      const pw = c.pw * f, cx = x + pw / 2, k = Math.min(1, pw * FIT / c.bw), th = c.th * k, bw = c.bw * k;
      const tmin = cx + bw / 2 > 1240 ? 404 : TOP_MIN;                                                    // справа сверху — акцентная карточка: товар под ней не заходит на неё
      const hh = Math.max(30, Math.min(124, c.h0 * HV[v][c.k], BASE[c.row] - th - tmin));         // верх упаковки не заходит под заголовок, категории и карточку
      const e = pw * CAP_RATIO, topFace = BASE[c.row] - hh;                                             // y центра верхней грани подиума — здесь стоит упаковка
      x += pw + GAP + extra;
      slots.push({group: 'main', i, p: c.p, im: c.im, hero: c.hero, row: c.row, pod: {l: cx - pw / 2, t: topFace - e / 2, w: pw, e, b: hh}, it: {l: cx - bw / 2, t: topFace + e * .08 - th, w: bw, h: th, cx, z: 5 + c.row * 2 + (c.hero ? 1 : 0)}});
    });
    return slots;
  }

  /* узкий экран (телефон): та же экспозиция, но «в две полки» — до пяти подиумов в ряд, оба ряда на одном экране без сдвига; задний ряд стоит на каменной полке, передний — на платформе.
     Масштаб подбирается так, чтобы всё поместилось по ширине и по высоте (measure). Размеры — те же проектные пиксели холста. */
  const R2 = {Yf: 700, R: 236, cs: .72, cols: 5, slot: 104, topC: 246, ext: 462, cap: 214};
  function composeRows(prods, s) {
    const n = Math.min(prods.length, MAIN_MAX), slots = [], v = s.variant, wc = s.wc, vx0 = s.vx0, m = 12 / s.s, slotW = (wc - 2 * m) / R2.cols, Yb = R2.Yf - R2.R;
    const back = n > R2.cols ? Math.ceil(n / 2) : 0, rows = [prods.slice(0, back).map((p, j) => [p, j]), prods.slice(back).map((p, j) => [p, back + j])];
    rows.forEach((list, r) => {
      const c = list.length, x0 = vx0 + wc / 2 - c * slotW / 2 + slotW / 2, base = r ? R2.Yf : Yb;
      list.forEach(([p, i], j) => {
        const hero = i === 2, im = imgOf(p), th0 = thOf(p) * (hero ? 1.06 : 1) * R2.cs, bw0 = th0 * im.ar, pw = Math.min(slotW - 8, Math.max(bw0 / FIT, 60)), k = Math.min(1, pw * FIT / bw0), th = th0 * k, bw = bw0 * k, cx = x0 + j * slotW;
        const hh = Math.max(18, Math.min(REF[i][0] * .42 * HV[v][i], R2.cap - th)), e = pw * CAP_RATIO, topFace = base - hh;
        slots.push({group: 'main', i, p, im, hero, row: r, pod: {l: cx - pw / 2, t: topFace - e / 2, w: pw, e, b: hh}, it: {l: cx - bw / 2, t: topFace + e * .08 - th, w: bw, h: th, cx, z: 5 + r * 2 + (hero ? 1 : 0)}});
      });
    });
    const st = s.stage.style; s.stage.classList.toggle('is-rows2', back > 0);
    st.setProperty('--ledx', (vx0 + m * .4).toFixed(1) + 'px'); st.setProperty('--ledw', (wc - m * .8).toFixed(1) + 'px'); st.setProperty('--ledy', (Yb - 6).toFixed(1) + 'px');
    return slots;
  }

  /* ---------- элементы ---------- */
  function itemEl(g) {
    const p = g.p, b = B[p.brand] || {}, im = g.im, el = document.createElement('button');
    el.type = 'button'; el.className = 'shw-it' + (g.group === 'niche' ? ' is-bg' : ''); el.setAttribute('data-act', 'shw-pick'); el.setAttribute('data-id', p.id); el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', (b.name ? b.name + ' — ' : '') + p.name); el.setAttribute('style', bstyle(b));
    el.innerHTML = '<i class="shw-gl"></i><i class="shw-sh"></i><span class="shw-ph"><img class="shw-img' + (im.mock || p.ia ? '' : ' opq') + '" src="' + esc(im.src) + '" alt="" decoding="async" draggable="false"></span>';
    el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') preview(p.id); });
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') unpreview(); });
    el.addEventListener('focus', () => preview(p.id));
    el.addEventListener('blur', () => unpreview());
    return el;
  }
  /* подиум работает как продолжение товара на нём: наведение и нажатие по камню — то же, что по упаковке (так курсор не «соскакивает» при переходе от товара к подиуму) */
  function podEl() {
    const el = document.createElement('i'); el.className = 'shw-slab shw-pd'; el.setAttribute('aria-hidden', 'true');
    const id = () => { const q = S && S.pods.find(r => r.el === el); return q && q.g && q.g.p ? q.g.p.id : null; };
    el.addEventListener('pointerenter', e => { const i = id(); if (i && e.pointerType !== 'touch') preview(i); });
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') unpreview(); });
    el.addEventListener('click', () => { const i = id(); if (i) select(i); });
    return el;
  }
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
    if (!s.sel && !s.hov) paintCard(idleId(), false);
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
  /* на компьютере плашка товара показывается только при наведении на предмет и при выборе; на планшете и телефоне (наведения нет) в покое стоит плашка товара по умолчанию */
  const idleId = () => S && S.stack ? S.defId : null;
  function paintCard(id, open) {
    const c = S.card; if (!id || !P[id]) { clearTimeout(c._t); c.classList.remove('swap', 'is-open'); c._id = null; if (!c.hidden && !c.classList.contains('is-idle')) { c.classList.add('is-idle'); clearTimeout(c._h); c._h = setTimeout(() => { if (c.classList.contains('is-idle')) c.hidden = true; }, 780); } return; }
    clearTimeout(c._h); if (c.hidden || c.classList.contains('is-idle')) { c.hidden = false; void c.offsetWidth; c.classList.remove('is-idle'); }
    c.classList.toggle('is-open', !!open);
    if (c._id === id) return;
    const first = !c._id; clearTimeout(c._t);
    if (first) { c.classList.remove('swap'); c.innerHTML = cardHTML(P[id]); c._id = id; return; }
    c.classList.add('swap'); c._id = id; c._t = setTimeout(() => { c.innerHTML = cardHTML(P[id]); c.classList.remove('swap'); }, 230);
  }
  function preview(id) { if (!S || S.sel) return; clearTimeout(S.hovT); clearTimeout(S.cardT); S.hov = id; S.root.classList.add('has-hov'); S.items.forEach((r, k) => r.el.classList.toggle('is-hov', k === id)); if (!S.sel) paintCard(id, false); const rec = S.items.get(id), pd = rec && S.pods.find(q => q.g === rec.g); if (pd) pd.el.classList.add('is-lit'); }
  function unpreview() { if (!S) return; clearTimeout(S.hovT); S.hovT = setTimeout(() => { if (!S) return; S.hov = null; S.root.classList.remove('has-hov'); S.items.forEach(r => r.el.classList.remove('is-hov')); S.pods.forEach(q => q.el.classList.remove('is-lit')); if (S.stack && !S.sel) paintCard(S.defId, false); }, 170); if (!S.stack) S.cardT = setTimeout(() => { if (S && !S.sel && !S.hov && !S.cardHover) paintCard(null); }, 520); }

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
    S.items.forEach((rec, k) => { const on = k === id; rec.el.classList.toggle('is-sel', on); rec.el.classList.remove('is-hov'); rec.el.setAttribute('aria-pressed', String(on)); });
    clearTimeout(S.hovT); S.hov = null; S.root.classList.remove('has-hov'); S.pods.forEach(q => q.el.classList.remove('is-lit'));
    S.sel = id; S.root.classList.add('has-sel'); positionSel(); paintCard(id, true);
    track('showroom_select', {product: id});
    if (S.stack && mode() !== 'off') setTimeout(() => { if (!S) return; const r = S.card.getBoundingClientRect(); if (r.bottom > innerHeight - 8 || r.top < 70) S.card.scrollIntoView({behavior: 'smooth', block: 'nearest'}); }, 260);
  }
  function clearSel(quiet) {
    if (!S) return; const was = S.sel; S.sel = null; S.root.classList.remove('has-sel');
    S.items.forEach(rec => { rec.el.classList.remove('is-sel'); rec.el.setAttribute('aria-pressed', 'false'); });
    S.card.style.setProperty('--cx', '0px'); S.card.style.setProperty('--cy', '0px');
    paintCard(S.hov || idleId(), false);
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
    $$('[data-act="shw-to"]').forEach(d => d.setAttribute('aria-pressed', String(cur[d.getAttribute('data-key')] === d.getAttribute('data-id'))));
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
    const ln = $('#shw-list-n'); if (ln && m) ln.textContent = m[1] === m[2] ? m[2] : m[1] + ' из ' + m[2];
    const rs = $('[data-shw-reset]', s.aside), rb = $('#cat-reset'); if (rs && rb) rs.hidden = rb.hidden;
  }

  /* ---------- размеры и запуск ---------- */
  function measure() {
    const s = S, stack = smq.matches; let W, H, k, oy = 0, ox = 0, st = 0, sb = 0, rows2 = false, wc = 0, vx0 = 0;
    if (stack) {
      /* планшет и телефон: сцена — фон «героя» на весь первый экран; всё помещается без сдвига: считаем масштаб по ширине и по свободной высоте между заголовком (сверху) и плашкой товара с доком (снизу).
         Одна линия из десяти подиумов (планшет) или две полки по пять (телефон) — берём то, что даёт крупнее. */
      const hr = s.hero.getBoundingClientRect(); W = s.hero.clientWidth; H = s.hero.clientHeight;
      if (!s.sel && s.card && !s.card.hidden) s.cardTop = s.card.getBoundingClientRect().top - hr.top;          // свёрнутая плашка товара: сцена должна кончаться над ней
      const top = s.head.getBoundingClientRect().bottom - hr.top + 6, bot = (s.cardTop || H - 218) - 34, avail = Math.max(120, bot - top), Wa = W - 24;
      const k1 = Math.min(Wa / (SPAN[1] - SPAN[0]), avail / COMPACT_EXT), k2 = Math.min(Wa / (R2.cols * R2.slot), avail / R2.ext);
      rows2 = k2 > k1 * 1.12; k = Math.max(.42, W / W0, Math.min(1.45, rows2 ? k2 : k1));            // сцена не уже окна: справа и слева всегда стена, а не пустота
      oy = top - (rows2 ? R2.topC : COMPACT_TOP) * k; wc = W / k; vx0 = Math.max(0, Math.min(W0 - wc, 885 - wc / 2)); ox = -vx0 * k;
      st = Math.round(top + 18); sb = H - bot + 30;
    } else { W = s.room.clientWidth; H = s.room.clientHeight; k = W / W0; }
    if (!W || !H) return false;
    const ch = stack !== s.stack || rows2 !== s.rows2 || Math.abs(k - s.s) > 1e-4 || Math.abs(oy - (s.oy || 0)) > .5 || !s.W;
    s.W = W; s.H = H; s.s = k; s.oy = oy; s.stack = stack; s.rows2 = rows2; s.wc = wc; s.vx0 = vx0;
    const rs = s.room.style; rs.setProperty('--s', k.toFixed(5));
    if (stack) { rs.setProperty('--oy', oy.toFixed(1)); rs.setProperty('--ox', ox.toFixed(1)); rs.setProperty('--st', st + 'px'); rs.setProperty('--sb', sb + 'px'); }
    else { ['--oy', '--ox', '--st', '--sb'].forEach(n => rs.removeProperty(n)); }
    /* панель фильтров слева: сцена масштабируется по ширине, а окно может быть низким — ужимаем панель по высоте, чтобы при заходе она была видна целиком */
    let ak = 1; if (!stack && s.panel) { const need = s.panel.scrollHeight; ak = need ? Math.max(.7, Math.min(1, ((innerHeight - 16) / k - ASIDE_TOP) / need)) : 1; }
    rs.setProperty('--ak', ak.toFixed(3));
    s.panOn = false; $$('.shw-pan', s.root).forEach(b => { b.hidden = true; });
    return ch;
  }
  function variantOf() { const c = val('cat'); return c === 'all' ? 0 : ((D.cats || []).findIndex(x => x.id === c) + 1) % 3; }
  function ensure() {
    if (S && S.root.isConnected) return S;
    if (S && S.ro) S.ro.disconnect(); if (S && S.io) S.io.disconnect();
    const rootEl = $('[data-shw]'); if (!rootEl) { S = null; html.classList.remove('shw-top'); return null; }
    S = {root: rootEl, room: $('[data-shw-room]', rootEl), vw: $('.shw-vw', rootEl), view: $('[data-shw-view]', rootEl), stage: $('[data-shw-stage]', rootEl), card: $('[data-shw-card]', rootEl), pager: $('[data-shw-pager]', rootEl), pgText: $('[data-shw-pg]', rootEl), empty: $('[data-shw-empty]', rootEl),
      panel: $('.shw-aside .shw-panel', rootEl), hero: $('.shw-hero', rootEl), head: $('.shw-head', rootEl), aside: $('.shw-aside', rootEl), grid: $('#cat-grid'), ids: [], pageIds: [], page: 0, per: 10, W: 0, H: 0, s: 1, stack: false, panOn: false, centered: false, variant: 0, items: new Map(), pods: [], anims: new Set(), sel: null, hov: null, defId: null, rendered: false, rz: 0, rect: null};
    S.card.addEventListener('pointerenter', e => { if (e.pointerType === 'touch') return; S.cardHover = true; clearTimeout(S.cardT); });
    S.card.addEventListener('pointerleave', e => { if (e.pointerType === 'touch') return; S.cardHover = false; clearTimeout(S.cardT); S.cardT = setTimeout(() => { if (S && !S.stack && !S.sel && !S.hov && !S.cardHover) paintCard(null); }, 380); });
    S.spot = document.createElement('i'); S.spot.className = 'shw-spot'; S.spot.setAttribute('aria-hidden', 'true'); S.stage.appendChild(S.spot); S.veil = document.createElement('i'); S.veil.className = 'shw-veil'; S.veil.setAttribute('aria-hidden', 'true'); S.stage.appendChild(S.veil);
    S.sent = document.createElement('i'); S.sent.className = 'shw-sent'; S.sent.setAttribute('aria-hidden', 'true'); S.room.appendChild(S.sent);
    if (window.IntersectionObserver) { S.io = new IntersectionObserver(es => es.forEach(e => html.classList.toggle('shw-top', e.isIntersecting)), {rootMargin: '-84px 0px 0px 0px'}); S.io.observe(S.sent); } else html.classList.add('shw-top');
    S.link = document.createElement('i'); S.link.className = 'shw-link'; S.link.setAttribute('aria-hidden', 'true'); $('.shw-canvas', rootEl).appendChild(S.link);
    S.root.addEventListener('click', e => { if (S.sel && e.target.closest && !e.target.closest('.shw-it') && !e.target.closest('.shw-pd') && !e.target.closest('.shw-card') && e.target.closest('.shw-view')) clearSel(); });
    S.view.addEventListener('scroll', () => { if (S.stack && !S.panRaf) S.panRaf = requestAnimationFrame(() => { if (!S) return; S.panRaf = 0; updatePan(); }); }, {passive: true});
    S.stage.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const its = $$('.shw-it:not(.is-gone)', S.stage), i = its.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); const nx = its[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (nx) nx.focus();
    });
    S.ro = window.ResizeObserver ? new ResizeObserver(() => { if (!S || S.rz) return; S.rz = requestAnimationFrame(() => { if (!S) return; S.rz = 0; layout(); }); }) : null;
    if (!window.__shwResize) { window.__shwResize = true; let rq = 0; addEventListener('resize', () => { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; if (S && S.root.isConnected) layout(); }); }); }
    if (S.ro) { S.ro.observe(S.room); S.ro.observe(S.hero); S.ro.observe(S.head); } else addEventListener('resize', () => layout());
    S.ids = visibleIds(); S.variant = variantOf();
    popInit();
    return S;
  }
  /* цвет низа сцены = цвет фона страницы в этой точке. Фон <html> — вертикальный градиент: молочный → жемчужно-голубой (620 px) → молочный (1240 px); см. css/base.css.
     Если низ сцены растворять в чистый --milk, остаётся еле заметный шов. */
  function seam() {
    const s = S, el = smq.matches ? s.hero : s.room; if (!el) return;
    const y = el.getBoundingClientRect().bottom + (window.pageYOffset || 0), w = y <= 0 ? 0 : y <= 620 ? y / 620 : y < 1240 ? (1240 - y) / 620 : 0, m = [245, 242, 236], c = [238, 242, 249];
    s.root.style.setProperty('--shw-end', m.map((v, i) => Math.round(v + (c[i] - v) * w)).join(','));
  }
  function layout() {
    if (!S) return; const ch = measure(); if (!S.W) return; seam();
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
  /* плитки под витриной («Подбор по задаче», «Коллекции», «Бренды»): включают нужное значение фильтра и возвращают к главной экспозиции, которая перестраивается под него; повторный клик по выбранной плитке только возвращает к витрине */
  A.actions['shw-to'] = t => {
    const k = t.getAttribute('data-key') || 'cat', v = t.getAttribute('data-id'), sel = selOf(k);
    if (sel && sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', {bubbles: true})); }
    const room = S && S.room; if (room) window.scrollTo({top: Math.max(0, room.getBoundingClientRect().top + window.scrollY), behavior: mode() === 'full' ? 'smooth' : 'auto'});
  };
  A.actions['shw-page'] = t => go(+t.getAttribute('data-dir'));
  A.actions['shw-opt'] = t => {
    const k = t.getAttribute('data-key'), v = t.getAttribute('data-v'), sel = selOf(k); if (!sel) return;
    sel.value = sel.value === v ? 'all' : v; sel.dispatchEvent(new Event('change', {bubbles: true}));
  };
  const refit = () => setTimeout(() => { if (S) layout(); }, 380);                                  /* после раскрытия/сворачивания групп панель снова подгоняется по высоте окна */
  A.actions['shw-grp'] = t => { const g = t.closest('.shw-grp'), open = g.classList.toggle('is-open'); t.setAttribute('aria-expanded', String(open)); refit(); };
  A.actions['shw-more'] = t => { const go = t.closest('.shw-go'), on = go.classList.toggle('more'), n = $$('.shw-o.xtra', go).length; t.setAttribute('aria-expanded', String(on)); t.textContent = on ? 'Свернуть' : 'Ещё ' + n; refit(); };
  A.actions['shw-pop-nav'] = t => { const tr = $('.shw-pop-t'); if (tr) tr.scrollBy({left: +t.getAttribute('data-dir') * tr.clientWidth * .92, behavior: mode() === 'full' ? 'smooth' : 'auto'}); };
  /* «Смотреть весь список» (и адрес #shw-all) раскрывает свёрнутый нижний список и приводит к нему */
  const openList = go => { const d = $('[data-shw-list]'); if (!d) return; d.open = true; if (go) d.scrollIntoView({behavior: mode() === 'full' ? 'smooth' : 'auto', block: 'start'}); };
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href="#shw-all"]'); if (a && $('[data-shw-list]')) { e.preventDefault(); openList(true); } });
  window.addEventListener('hashchange', () => { if (location.hash === '#shw-all') openList(true); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !S || !S.sel || !S.root.isConnected) return;
    const m = $('#modal'); if (m && m.classList.contains('open')) return;
    clearSel();
  });
  A.showroom = {
    sync,
    select: id => select(id), close: () => clearSel(), page: dir => go(dir),
    openList, state: () => S && ({ids: S.ids.slice(), pageIds: (S.pageIds || []).slice(), page: S.page, per: S.per, sel: S.sel, stack: S.stack, pan: S.panOn, W: S.W, H: S.H, s: S.s, rendered: S.rendered, pods: S.pods.length}),
    /* для перелёта в окно просмотра (gallery.js): упаковка товара на сцене и её рамка */
    flightSrc: id => { if (!S || !S.root.isConnected) return null; const rec = S.items.get(id); if (!rec || rec.el.classList.contains('is-gone')) return null; const el = rec.el.querySelector('.shw-ph'); return el ? {el, img: rec.el.querySelector('.shw-img'), rect: el.getBoundingClientRect()} : null; }
  };
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); const s = ensure(); if (s) { syncUI(); layout(); } };
})();
