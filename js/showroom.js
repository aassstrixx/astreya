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
  const html = document.documentElement, rmq = matchMedia('(prefers-reduced-motion: reduce) and (min-width: 100000px)'), rmReal = matchMedia('(prefers-reduced-motion: reduce)'), smq = matchMedia('(max-width:1100px)');
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

  /* ---------- «галерея»: ниши, избранное, камера ---------- */
  const NK = ['arch', 'round', 'recess', 'plinth'];                       // виды ниш за товаром: арка со светодиодной кромкой, круглая ниша (мотив шара), вертикальное углубление со стеклянной полкой, открытое основание с тонкими световыми линиями
  const FAV_ON = X.favorites !== false, FKEY = 'astreya:fav';
  const SV = (d, extra) => '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"' + (extra || '') + '>' + d + '</svg>';
  const IC = {
    heart: SV('<path d="M10 16.3S3.3 12.3 3.3 7.7A3.5 3.5 0 0 1 10 6.1a3.5 3.5 0 0 1 6.7 1.6c0 4.6-6.7 8.6-6.7 8.6z"/>'),
    cmp: SV('<path d="M5 16V9M10 16V4M15 16v-4"/>'),
    eye: SV('<path d="M1.8 10S5 4.6 10 4.6 18.2 10 18.2 10 15 15.4 10 15.4 1.8 10 1.8 10z"/><circle cx="10" cy="10" r="2.5"/>'),
    close: SV('<path d="M5 5l10 10M15 5L5 15"/>')
  };
  const favGet = () => { try { const l = JSON.parse(localStorage.getItem(FKEY) || '[]'); return Array.isArray(l) ? l.filter(id => P[id]) : []; } catch (e) { return []; } };
  const favHas = id => favGet().indexOf(id) >= 0;
  function favSync() {
    const l = favGet();
    $$('[data-fav-id]').forEach(b => { const id = b.getAttribute('data-fav-id'), on = l.indexOf(id) >= 0; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on); b.setAttribute('aria-label', (on ? 'Убрать из избранного: ' : 'Добавить в избранное: ') + (P[id] ? P[id].name : '')); b.setAttribute('title', on ? 'Убрать из избранного' : 'Добавить в избранное'); });
    $$('[data-shw-favn]').forEach(n => { n.textContent = l.length; });
    $$('[data-shw-favs]').forEach(b => { b.classList.toggle('has', l.length > 0); b.setAttribute('aria-pressed', String(!!(S && S.favOnly))); });
  }
  function favToggle(id) {
    if (!P[id]) return; let l = favGet(), on;
    if (l.indexOf(id) >= 0) { l = l.filter(x => x !== id); on = false; A.toast && A.toast('Убрано из избранного: ' + P[id].name); } else { l = l.concat(id); on = true; A.toast && A.toast('Добавлено в избранное: ' + P[id].name); }
    try { localStorage.setItem(FKEY, JSON.stringify(l)); } catch (e) { /* без хранилища — только до перезагрузки */ }
    favSync(); track('showroom_fav', {product: id, on}); if (S && S.favOnly) sync(false);
  }
  /* три действия над товаром (наведение, «Рекомендуем»): избранное, сравнение, быстрый просмотр (или карточка товара, если просмотра нет). Цен нет нигде */
  const actBtns = id => (FAV_ON ? '<button class="shw-ab shw-fav" type="button" data-act="fav-toggle" data-fav-id="' + esc(id) + '" aria-pressed="false">' + IC.heart + '</button>' : '') +
    (X.compare ? '<button class="shw-ab shw-cmp" type="button" data-act="cmp-toggle" data-id="' + esc(id) + '" data-cmp-id="' + esc(id) + '" aria-pressed="false">' + IC.cmp + '</button>' : '') +
    '<button class="shw-ab shw-eye" type="button" data-act="' + (X.quickView ? 'qv-open' : 'shw-open') + '" data-id="' + esc(id) + '" aria-label="Открыть подробную информацию: ' + esc((P[id] || {}).name || '') + '" title="Подробнее">' + IC.eye + '</button>';

  /* камера: при выборе вся сцена (стена, ниши, товары) приближается к выбранной нише, и товар встаёт в фокус композиции; карточка раскрывается рядом */
  const CAM = {k: 1.3, fx: 770, fy: 500};
  function camFor(it) {
    const k = CAM.k, cx = it.cx, cy = it.t + it.h * .55;
    let tx = CAM.fx - k * cx, ty = CAM.fy - k * cy;
    tx = Math.max(W0 - k * W0, Math.min(0, tx)); ty = Math.max(H0 - k * H0, Math.min(0, ty));
    return {k, tx, ty, px: tx + k * cx, py: ty + k * cy};
  }
  function camApply(it) {
    const c = camFor(it), st = S.view.style; S.cam = c; S.root.classList.add('is-cam');
    st.setProperty('--cz', c.k.toFixed(3)); st.setProperty('--cx', c.tx.toFixed(1) + 'px'); st.setProperty('--cy', c.ty.toFixed(1) + 'px');
  }
  function camClear(instant) {
    if (!S) return; const st = S.view.style;
    if (instant) { S.view.classList.add('no-tr'); }
    ['--cz', '--cx', '--cy'].forEach(n => st.removeProperty(n)); S.cam = null;
    if (instant) { void S.view.offsetWidth; S.view.classList.remove('no-tr'); }
    clearTimeout(S.camT); S.camT = setTimeout(() => { if (S && !S.cam) S.root.classList.remove('is-cam'); }, 1250);
  }
  /* Экспозиция по образцу заказчика: подиумы (ступенчатые блоки и диски из травертина), стол, ваза, шары запечены в сцену (tools/showroom-assets/expo.py), живыми остаются только товары.
     Места товаров приходят из сцены (layers.json → anchors.slots): x и y основания на подиуме, px на сантиметр упаковки на этой глубине (дальше — мельче, ближе — крупнее: перспектива, а не одинаковый масштаб),
     глубина d и номер подиума. Высоты упаковок — реальные (10–25 см). */
  const CMH = {pump: 24, bottle: 22, dropper: 14, jar: 10, tube: 16, box: 14, device: 18};
  const cmOf = p => CMH[p.t] || CMH.bottle;
  const packKey = p => { const s = A.packOf ? A.packOf(p) : ''; const m = /([^/]+)\.webp$/.exec(s); return m ? m[1] : ''; };
  const url = p => A.assetUrl ? A.assetUrl(p) : root() + p;       // обычный сайт: путь от корня; автономная сборка: data:-адрес
  const imgOf = p => p.im && PHOTOS ? {src: url(p.im), ar: p.iw && p.ih ? p.iw / p.ih : .45, mock: false} : (() => { const k = packKey(p), m = PACKS[k]; return {src: url(A.packOf ? A.packOf(p) : ''), ar: m ? m.w / m.h : .3, mock: true, label: m && m.label}; })();

  let S = null;

  /* ---------- состав и режимы ---------- */
  const visibleIds = () => { const fo = S.favOnly ? favGet() : null; return $$('.pcard', S.grid).filter(c => !c.hidden).map(c => c.getAttribute('data-id')).filter(id => !fo || fo.indexOf(id) >= 0); };
  const inView = () => { const r = S.view.getBoundingClientRect(); return r.bottom > -80 && r.top < innerHeight + 80; };
  const MAIN_MAX = ((D.showroom && D.showroom.slots) || []).length || 8;                                                  // всё на переднем плане: на странице десять товаров, каждый на своём подиуме; на заднем плане (ниша, полки) предметов нет
  const perFor = () => MAIN_MAX;
  /* на узких экранах показывается та же сцена, что на компьютере: полоса холста [WX0…1536]×[WY0…WY0+WH]; если по ширине она не умещается при читаемом масштабе, сцену можно сдвигать пальцем или стрелками */
  const SLOTS = (D.showroom && D.showroom.slots) || [];
  const SLOT_CAP = [16, 18, 25, 14, 11, 24, 24, 20];                                     // наибольшая высота упаковки на месте, см (малые места — для малых упаковок)
  const SLOT_RANK = [2, 3, 5, 6, 1, 0, 7, 4];                                            // порядок заполнения: самые заметные места первыми
  const TOP_Y = 326;                                                                     // верх упаковки не выше: под заголовком и чипами категорий
  const ASIDE_TOP = 100, SPAN = SLOTS.length ? [Math.min.apply(null, SLOTS.map(q => q.x)) - 62, Math.max.apply(null, SLOTS.map(q => q.x)) + 62] : [470, 1250];
  const COMPACT_TOP = TOP_Y - 6, COMPACT_EXT = (SLOTS.length ? Math.max.apply(null, SLOTS.map(q => q.y)) : 640) + 58 - COMPACT_TOP;   // по вертикали холста показываем от верха самой высокой упаковки до оснований подиумов

  /* расстановка: товары (по высоте упаковки) по местам на подиумах — высокие на высокие места, малые на малые; если товаров меньше мест, занимаются самые заметные (SLOT_RANK) */
  function compose(prods, s) {
    const n = Math.min(prods.length, SLOTS.length, MAIN_MAX), use = SLOT_RANK.filter(i => i < SLOTS.length).slice(0, n), byCap = use.slice().sort((a, b) => SLOT_CAP[b] - SLOT_CAP[a] || a - b);
    const order = prods.slice(0, n).map((p, i) => ({p, i})).sort((a, b) => cmOf(b.p) - cmOf(a.p) || a.i - b.i), asg = order.map((o, k) => ({o, si: byCap[k]}));
    const wcm = o => cmOf(o.p) * imgOf(o.p).ar, a3 = asg.find(q => q.si === 3), a4 = asg.find(q => q.si === 4);
    if (a3 && a4 && wcm(a4.o) > wcm(a3.o)) { const t = a3.o; a3.o = a4.o; a4.o = t; }                                // более широкий предмет (баночка) — на широкий диск, узкий — на малый блок
    const slots = [];
    asg.forEach((q, k) => {
      const si = q.si, sl = SLOTS[si], p = q.o.p, im = imgOf(p), hero = k === 0;
      let hcm = Math.min(cmOf(p) * (hero ? 1.02 : 1), SLOT_CAP[si], (sl.y - TOP_Y) / sl.pxcm), th = hcm * sl.pxcm, bw = th * im.ar;
      slots.push({group: 'main', i: q.o.i, slot: si, p, im, hero, row: sl.d > 8 ? 0 : 1, nk: hero ? 0 : (q.o.i + s.variant) % 4, pod: null, sl,
        it: {l: sl.x - bw / 2, t: sl.y - th, w: bw, h: th, cx: sl.x, z: 5 + Math.round((14 - sl.d) * 2)}});
    });
    /* соседние предметы почти не закрывают друг друга: слишком широкий (например, коробка) чуть уменьшается — заход друг за друга не больше 40 % меньшей ширины, как у малого предмета позади ближнего в образце */
    const fit = (g, f) => { const bw = g.it.w * f, th = g.it.h * f; g.it = {l: g.sl.x - bw / 2, t: g.sl.y - th, w: bw, h: th, cx: g.sl.x, z: g.it.z}; }, rs = slots.slice().sort((a, b) => a.sl.x - b.sl.x);
    for (let k = 0; k < 4; k++) for (let i = 0; i + 1 < rs.length; i++) {
      const a = rs[i], b = rs[i + 1], dx = b.sl.x - a.sl.x, ov = (a.it.w + b.it.w) / 2 - dx;
      if (ov > .4 * Math.min(a.it.w, b.it.w)) { const big = a.it.w >= b.it.w ? a : b, sm = big === a ? b : a; fit(big, Math.max(.6, Math.min(.98, 2 * (dx - sm.it.w / 2 + .4 * sm.it.w) / big.it.w))); }
    }
    return slots.sort((a, b) => a.i - b.i);
  }

  /* ---------- элементы ---------- */
  function itemEl(g) {
    const p = g.p, b = B[p.brand] || {}, im = g.im, el = document.createElement('button');
    el.type = 'button'; el.className = 'shw-it' + (g.group === 'niche' ? ' is-bg' : ''); el.setAttribute('data-act', 'shw-pick'); el.setAttribute('data-id', p.id); el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', (b.name ? b.name + ' — ' : '') + p.name); el.setAttribute('style', bstyle(b));
    el.innerHTML = '<i class="shw-gl"></i><i class="shw-sh"></i><img class="shw-cs" src="' + esc(im.src) + '" alt="" decoding="async" draggable="false" aria-hidden="true"><span class="shw-ph"><img class="shw-img' + (im.mock || p.ia ? '' : ' opq') + '" src="' + esc(im.src) + '" alt="" decoding="async" draggable="false"></span>';
    el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') preview(p.id); });
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') unpreview(); });
    el.addEventListener('focus', () => preview(p.id));
    el.addEventListener('blur', () => unpreview());
    return el;
  }
  function placeItem(rec, g) {
    const el = rec.el, it = g.it, st = el.style;
    st.left = it.l.toFixed(1) + 'px'; st.top = it.t.toFixed(1) + 'px'; st.width = it.w.toFixed(1) + 'px'; st.height = it.h.toFixed(1) + 'px';
    el.style.setProperty('--bw', it.w.toFixed(1) + 'px'); el.style.setProperty('--z', it.z);
    el.style.setProperty('--pdh', g.pod ? (g.pod.t + g.pod.e + g.pod.b - (it.t + it.h)).toFixed(1) + 'px' : '14px');
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
    if (s.cam) { s.view.classList.add('no-tr'); const st = s.view.style; ['--cz', '--cx', '--cy'].forEach(n => st.removeProperty(n)); void s.view.offsetWidth; }
    s.rect = s.stage.getBoundingClientRect();
    const slots = compose(prods, s);
    /* 1. запомнить, где всё стоит сейчас (с учётом идущих анимаций) */
    const oldIt = new Map(); s.items.forEach((rec, id) => oldIt.set(id, rel(rec.el)));
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
    /* 3. товары: остались — переезжают, новые — появляются */
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
    /* 4. выбранный товар исчез со сцены — снимаем выбор */
    if (s.sel && s.pageIds.indexOf(s.sel) < 0) { s.cam = null; clearSel(true); }
    else if (s.sel) { const rc = s.items.get(s.sel); if (rc && !s.stack && !rmReal.matches) camApply(rc.g.it); positionSel(); }
    if (s.view.classList.contains('no-tr')) { void s.view.offsetWidth; s.view.classList.remove('no-tr'); }
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
    const list = (t, a) => a && a.length ? '<div class="c-sec"><h4>' + t + '</h4><ul>' + a.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></div>' : '';
    const det = x.details && x.details.length ? x.details.map(t => '<p class="c-d2">' + esc(t) + '</p>').join('') : '';
    const known = !!(x.actives && x.actives.length || x.composition || x.indications && x.indications.length || x.details && x.details.length || x.volume || x.sku || x.usage);
    return '<div class="c-in">' + badge + '<span class="c-br">' + esc(b.name || '') + '</span><div class="c-t">' + esc(p.name) + '</div><p class="c-d">' + esc(p.d || '') + '</p>' +
      '<div class="c-more"><div>' + det + '<div class="c-lb">Назначение</div><div class="c-tasks">' + (p.ts || []).map(t => '<span class="tag blue">' + esc(TASK[t] || t) + '</span>').join('') + '</div>' +
      list('Активные компоненты', x.actives) + (x.composition ? '<div class="c-sec"><h4>Состав</h4><p>' + esc(x.composition) + '</p></div>' : '') + list('Показания', x.indications) +
      '<dl class="c-spec">' + rows.filter(r => r[1]).map(r => '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl>' +
      (known ? '' : '<p class="c-note">Подробные характеристики уточняются — менеджер пришлёт состав и протокол по запросу.</p>') +
      (p.im && PHOTOS ? '' : '<p class="c-note">Изображение упаковки условное — это 3D-макет без текста и логотипов.</p>') + '</div></div>' +
      '<div class="c-act"><a class="btn btn-fill" href="' + esc(url) + '" data-track="product_card_click" data-place="showroom_card" data-product="' + esc(p.id) + '">Подробнее ' + (I.arrow || '') + '</a>' +
      (FAV_ON ? '<button class="btn btn-ghost c-fav" type="button" data-act="fav-toggle" data-fav-id="' + esc(p.id) + '" aria-pressed="false">' + IC.heart + '<span>В избранное</span></button>' : '') +
      (X.compare ? '<button class="btn btn-ghost c-cmp" type="button" data-act="cmp-toggle" data-id="' + esc(p.id) + '" data-cmp-id="' + esc(p.id) + '" aria-pressed="false">' + IC.cmp + '<span>Сравнить</span></button>' : '') + '</div>' +
      '<div class="c-act c-extra"><button class="btn btn-ghost" type="button" data-act="form" data-type="product" data-ref="' + esc(p.id) + '">Запросить</button>' + (X.quickView && S && S.stack ? '<button class="btn btn-ghost" type="button" data-act="qv-open" data-id="' + esc(p.id) + '">Быстрый просмотр</button>' : '') +       // на компьютере быстрый просмотр — «глаз» в панели при наведении; на телефоне наведения нет
      (NAVI ? '<button class="btn btn-ghost" type="button" data-act="qv-stella" data-id="' + esc(p.id) + '">Помочь с подбором</button>' : '') + '</div></div>' +
      '<button class="c-x" type="button" data-act="shw-close" aria-label="Закрыть карточку товара">' + IC.close + '<span>Закрыть</span></button>';
  }
  /* на компьютере плашка товара показывается только при наведении на предмет и при выборе; на планшете и телефоне (наведения нет) в покое стоит плашка товара по умолчанию */
  const idleId = () => S && S.stack ? S.defId : null;
  function paintCard(id, open) {
    const c = S.card; if (!id || !P[id]) { clearTimeout(c._t); c.classList.remove('swap', 'is-open'); c._id = null; if (!c.hidden && !c.classList.contains('is-idle')) { c.classList.add('is-idle'); clearTimeout(c._h); c._h = setTimeout(() => { if (c.classList.contains('is-idle')) c.hidden = true; }, 780); } return; }
    clearTimeout(c._h); if (c.hidden || c.classList.contains('is-idle')) { c.hidden = false; void c.offsetWidth; c.classList.remove('is-idle'); }
    c.classList.toggle('is-open', !!open);
    if (c._id === id) return;
    const first = !c._id; clearTimeout(c._t);
    if (first) { c.classList.remove('swap'); c.innerHTML = cardHTML(P[id]); c._id = id; favSync(); A.cmpSync && A.cmpSync(); return; }
    c.classList.add('swap'); c._id = id; c._t = setTimeout(() => { c.innerHTML = cardHTML(P[id]); c.classList.remove('swap'); favSync(); A.cmpSync && A.cmpSync(); }, 230);
  }
  function preview(id) { if (!S || S.sel) return; clearTimeout(S.hovT); clearTimeout(S.cardT); S.hov = id; S.root.classList.add('has-hov'); S.items.forEach((r, k) => r.el.classList.toggle('is-hov', k === id)); if (S.stack) paintCard(id, false); else showTip(id); const rec = S.items.get(id), pd = rec && S.pods.find(q => q.g === rec.g); if (pd) pd.el.classList.add('is-lit'); }
  function unpreview() { if (!S) return; clearTimeout(S.hovT); S.hovT = setTimeout(() => { if (!S) return; if (S.tipHover) return; S.hov = null; S.root.classList.remove('has-hov'); S.items.forEach(r => r.el.classList.remove('is-hov')); S.pods.forEach(q => q.el.classList.remove('is-lit')); hideTip(); if (S.stack && !S.sel) paintCard(S.defId, false); }, 170); }

  /* ---------- панель при наведении: название, бренд, краткое описание, назначение и три действия ---------- */
  function tipHTML(p) {
    const b = B[p.brand] || {}, tasks = (p.ts || []).map(t => TASK[t]).filter(Boolean).slice(0, 2);
    return '<div class="t-act">' + actBtns(p.id) + '</div><div class="t-br">' + esc(b.name || '') + '</div><div class="t-n">' + esc(p.name) + '</div><p class="t-d">' + esc(p.d || '') + '</p>' +
      '<div class="t-tg">' + [KIND[p.k], ...tasks].filter(Boolean).map(t => '<span>' + esc(t) + '</span>').join('') + '</div>';          // три действия — сверху панели: ниже них нет подиумов соседних товаров, клики по подиумам не перехватываются
  }
  function showTip(id) {
    const tip = S.tip, rec = S.items.get(id), p = P[id]; if (!tip || !rec || !p || S.sel) return;
    clearTimeout(S.tipT);
    if (tip._id !== id) { tip.innerHTML = tipHTML(p); tip._id = id; favSync(); A.cmpSync && A.cmpSync(); }
    if (tip.hidden) { tip.hidden = false; void tip.offsetWidth; }
    const it = rec.g.it, w = 236, h = tip.offsetHeight || 200, right = it.cx < 900, x = right ? it.l + it.w + 24 : it.l - 24 - w, y = Math.min(304, 696 - h);       // панель всегда у верха сцены (кнопки — в её верхней строке, выше подиумов соседей), целиком над рядом «Рекомендуем» (он с y≈706)
    tip.style.left = x.toFixed(1) + 'px'; tip.style.top = y.toFixed(1) + 'px'; tip.classList.toggle('on-left', !right);
    tip.classList.add('is-on');
  }
  function hideTip() { const tip = S && S.tip; if (!tip || tip.hidden) return; tip.classList.remove('is-on'); clearTimeout(S.tipT); S.tipT = setTimeout(() => { if (S && S.tip && !S.tip.classList.contains('is-on')) { S.tip.hidden = true; S.tip._id = null; } }, 380); }

  /* ---------- выбор ---------- */
  function positionSel() {
    const rec = S.items.get(S.sel); if (!rec) return; const it = rec.g.it;
    S.spot.style.transform = 'translate(' + it.cx.toFixed(1) + 'px,' + (it.t + it.h * .55).toFixed(1) + 'px)';
    if (S.stack) { S.card.style.setProperty('--cx', '0px'); S.card.style.setProperty('--cy', '0px'); if (S.panOn) S.view.scrollTo({left: Math.max(0, it.cx * S.s - S.view.clientWidth / 2), behavior: mode() === 'full' ? 'smooth' : 'auto'}); return; }
    /* карточка приезжает к товару: справа от него, а если места нет — слева; выноска идёт от края карточки к упаковке */
    const c = S.cam, cw = 300, px = c ? c.px : it.cx, py = c ? c.py : it.t + it.h * .55, half = it.w * (c ? c.k : 1) / 2;
    const right = px + half + 52 + cw < W0 - 18, x = right ? px + half + 52 : px - half - 52 - cw, y = Math.max(126, Math.min(184, py - 250));
    if (c) { const sp = S.spot.style; sp.transform = 'translate(' + it.cx.toFixed(1) + 'px,' + (it.t + it.h * .55).toFixed(1) + 'px)'; }                                    /* раскрытая карточка ≈470 px высотой: её низ не заходит на ряд «Рекомендуем» (с 743) */
    S.card.style.setProperty('--cx', (x - 1252).toFixed(1) + 'px'); S.card.style.setProperty('--cy', (y - 142).toFixed(1) + 'px');
    const x1 = right ? x : x + cw, y1 = y + 54, x2 = right ? it.l + it.w * .86 : it.l + it.w * .14, y2 = it.t + it.h * .34, len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  }
  function select(id) {
    if (!S || !S.items.has(id)) return;
    if (S.sel === id) { clearSel(); return; }
    S.items.forEach((rec, k) => { const on = k === id; rec.el.classList.toggle('is-sel', on); rec.el.classList.remove('is-hov'); rec.el.setAttribute('aria-pressed', String(on)); });
    clearTimeout(S.hovT); S.hov = null; S.root.classList.remove('has-hov'); S.pods.forEach(q => q.el.classList.remove('is-lit'));
    S.sel = id; S.root.classList.add('has-sel'); hideTip(); S.hov = null; S.root.classList.remove('has-hov');
    S.pods.forEach(q => q.el.classList.toggle('is-sel', !!(q.g && q.g.p && q.g.p.id === id)));          // ниша выбранного товара остаётся освещённой над затемнением
    S.view.style.setProperty('--px', '0'); S.view.style.setProperty('--py', '0');
    /* камера и параллакс — крупное движение: при системной настройке «уменьшить движение» их нет (остальные анимации витрины прежние) */
    if (!S.stack && mode() === 'full' && !rmReal.matches) camApply(S.items.get(id).g.it);
    positionSel(); paintCard(id, true);
    track('showroom_select', {product: id});
    if (S.stack && mode() !== 'off') setTimeout(() => { if (!S) return; const r = S.card.getBoundingClientRect(); if (r.bottom > innerHeight - 8 || r.top < 70) S.card.scrollIntoView({behavior: 'smooth', block: 'nearest'}); }, 260);
  }
  function clearSel(quiet) {
    if (!S) return; const was = S.sel; S.sel = null; S.root.classList.remove('has-sel'); camClear(!!quiet);
    S.items.forEach(rec => { rec.el.classList.remove('is-sel'); rec.el.setAttribute('aria-pressed', 'false'); }); S.pods.forEach(q => q.el.classList.remove('is-sel'));
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
    const s = S, stack = smq.matches; let W, H, k, oy = 0, ox = 0, st = 0, sb = 0, wc = 0, vx0 = 0;
    if (stack) {
      /* планшет и телефон: сцена — фон «героя» на весь первый экран; всё помещается без сдвига: считаем масштаб по ширине и по свободной высоте между заголовком (сверху) и плашкой товара с доком (снизу).
         Одна линия из десяти подиумов (планшет) или две полки по пять (телефон) — берём то, что даёт крупнее. */
      const hr = s.hero.getBoundingClientRect(); W = s.hero.clientWidth; H = s.hero.clientHeight;
      if (!s.sel && s.card && !s.card.hidden) s.cardTop = s.card.getBoundingClientRect().top - hr.top;          // свёрнутая плашка товара: сцена должна кончаться над ней
      const top = s.head.getBoundingClientRect().bottom - hr.top + 6, bot = (s.cardTop || H - 218) - 34, avail = Math.max(120, bot - top), Wa = W - 24;
      const k1 = Math.min(Wa / (SPAN[1] - SPAN[0]), avail / COMPACT_EXT);
      k = Math.max(.42, W / W0, Math.min(1.45, k1));                                       // сцена не уже окна: справа и слева всегда стена, а не пустота
      oy = top - COMPACT_TOP * k; wc = W / k; vx0 = Math.max(0, Math.min(W0 - wc, (SPAN[0] + SPAN[1]) / 2 - wc / 2)); ox = -vx0 * k;
      st = Math.round(top + 18); sb = H - bot + 30;
    } else { W = s.room.clientWidth; H = s.room.clientHeight; k = W / W0; }
    if (!W || !H) return false;
    const ch = stack !== s.stack || Math.abs(k - s.s) > 1e-4 || Math.abs(oy - (s.oy || 0)) > .5 || !s.W;
    s.W = W; s.H = H; s.s = k; s.oy = oy; s.stack = stack; s.wc = wc; s.vx0 = vx0;
    s.root.classList.toggle('is-stack', stack);
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
    S.tip = document.createElement('div'); S.tip.className = 'shw-tip'; S.tip.hidden = true; S.tip.setAttribute('role', 'group'); S.tip.setAttribute('aria-label', 'Краткие сведения о товаре');
    S.tip.addEventListener('pointerenter', e => { if (e.pointerType === 'touch') return; S.tipHover = true; clearTimeout(S.hovT); clearTimeout(S.tipT); });
    S.tip.addEventListener('pointerleave', e => { if (e.pointerType === 'touch') return; S.tipHover = false; unpreview(); });
    S.stage.appendChild(S.tip);
    /* лёгкий параллакс: фон и товары едва заметно смещаются навстречу друг другу за курсором (только мышь, только полный режим, пока ничего не выбрано) */
    S.view.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || S.sel || S.stack || mode() !== 'full' || rmReal.matches) return; const r = S.view.getBoundingClientRect();
      S.px = ((e.clientX - r.left) / r.width - .5) * 2; S.py = ((e.clientY - r.top) / r.height - .5) * 2;
      if (!S.pxRaf) S.pxRaf = requestAnimationFrame(() => { if (!S) return; S.pxRaf = 0; S.view.style.setProperty('--px', S.px.toFixed(3)); S.view.style.setProperty('--py', S.py.toFixed(3)); });
    });
    S.view.addEventListener('pointerleave', () => { if (!S) return; S.view.style.setProperty('--px', '0'); S.view.style.setProperty('--py', '0'); });
    S.spot = document.createElement('i'); S.spot.className = 'shw-spot'; S.spot.setAttribute('aria-hidden', 'true'); S.stage.appendChild(S.spot); S.veil = document.createElement('i'); S.veil.className = 'shw-veil'; S.veil.setAttribute('aria-hidden', 'true'); S.stage.appendChild(S.veil);
    S.sent = document.createElement('i'); S.sent.className = 'shw-sent'; S.sent.setAttribute('aria-hidden', 'true'); S.room.appendChild(S.sent);
    if (window.IntersectionObserver) { S.io = new IntersectionObserver(es => es.forEach(e => html.classList.toggle('shw-top', e.isIntersecting)), {rootMargin: '-84px 0px 0px 0px'}); S.io.observe(S.sent); } else html.classList.add('shw-top');
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
    s.ids = ids; s.variant = v; s.root.setAttribute('data-light', String(v));
    syncUI(); favSync();
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
  A.actions['fav-toggle'] = (t, id) => favToggle(id || t.getAttribute('data-fav-id') || t.getAttribute('data-id'));
  A.actions['shw-open'] = (t, id) => { const p = P[id || t.getAttribute('data-id')]; if (p) location.href = root() + 'products/' + p.slug + '.html'; };
  /* «Избранное»: в экспозиции остаются только отмеченные товары (остальные фильтры работают как раньше); повторное нажатие возвращает все */
  A.actions['shw-favs'] = () => { if (!S) return; if (!S.favOnly && !favGet().length) { A.toast && A.toast('Избранное пока пусто — отметьте товары сердечком'); return; } S.favOnly = !S.favOnly; favSync(); sync(true); };
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
  document.addEventListener('click', e => { const r = e.target.closest && e.target.closest('[data-act="cat-reset"]'); if (r && S && S.favOnly) { S.favOnly = false; favSync(); } }, true);          // «Сбросить фильтры» снимает и «Только избранное»
  window.addEventListener('storage', e => { if (e.key === FKEY) { favSync(); if (S && S.favOnly) sync(false); } });
  A.showroom = {
    fav: {has: favHas, toggle: favToggle, list: favGet},
    sync,
    select: id => select(id), close: () => clearSel(), page: dir => go(dir),
    openList, state: () => S && ({ids: S.ids.slice(), pageIds: (S.pageIds || []).slice(), page: S.page, per: S.per, sel: S.sel, stack: S.stack, pan: S.panOn, W: S.W, H: S.H, s: S.s, rendered: S.rendered, pods: S.pods.length}),
    /* для перелёта в окно просмотра (gallery.js): упаковка товара на сцене и её рамка */
    flightSrc: id => { if (!S || !S.root.isConnected) return null; const rec = S.items.get(id); if (!rec || rec.el.classList.contains('is-gone')) return null; const el = rec.el.querySelector('.shw-ph'); return el ? {el, img: rec.el.querySelector('.shw-img'), rect: el.getBoundingClientRect()} : null; }
  };
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); const s = ensure(); if (s) { syncUI(); layout(); } };
})();
