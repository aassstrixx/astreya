/* gallery.js — «Витрина каталога» (data/redesign.json → extras.gallery; стили — css/gallery.css). Подключается после explore.js; работает только на странице каталога.
   Что делает (всё поверх существующей логики, ничего не заменяя):
   1) Наведение. Состояние .is-hov ставится по координатам курсора в РАСКЛАДКЕ сетки (offsetLeft/offsetTop не зависят от transform): приподнятая карточка уходит из-под курсора
      на нижней кромке, и обычный :hover «дребезжал» бы. Заодно считаются --mx/--my — положение блика на фоне упаковки. Во время прокрутки наведение снимается.
   2) Смена фильтров и сортировки (js/pages.js вызывает A.gallery.begin/end вокруг apply): приёмом FLIP оставшиеся карточки плавно переезжают на новые места, пришедшие проявляются
      с небольшим смещением, ушедшие — «призраки» (копия карточки поверх сетки) растворяются. Состояние каталога (hidden, счётчик, чипы, адрес) меняется сразу, а не после
      анимации; каждый следующий вызов отменяет незаконченные анимации и продолжает с их текущих положений — быстрые смены не накладываются.
   3) Окно просмотра товара (js/explore.js): упаковка «перелетает» из карточки в окно и обратно (копия .art, анимируется размер небольшого элемента), листание — мягкая смена
      содержимого, блок «Тот же бренд и назначение» (только из данных: один бренд и общая задача), «Помочь с подбором» передаёт Стелле бренд, категорию и назначение товара.
   4) «Помочь с подбором» в строке результатов: передаёт Стелле выбранные категорию, бренд, назначение, тип и запрос (встроенные ответы; ИИ-режим — только при подключённом сервере).
   Не анимируется ничего, кроме opacity/transform (у перелёта — размер одного элемента). prefers-reduced-motion — только прозрачность; медленные кадры (html.lite) — без анимаций.
   Всё идемпотентно: страницы могут подменяться без перезагрузки (A.initPage). */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras || !D.extras.gallery) return;
  const X = D.extras;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const html = document.documentElement, rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => rmq.matches, lite = () => html.classList.contains('lite'), canAnimate = typeof Element.prototype.animate === 'function';
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const P = {}, B = {}, CAT = {}, TASK = {}, KIND = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.cats || []).forEach(c => { CAT[c.id] = c.name; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.kinds || []).forEach(k => { KIND[k.id] = k.name; });
  const esc = A.esc || (s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
  const track = (n, d) => { try { A.track && A.track(n, d); } catch (e) {} };
  const mode = () => (lite() || !canAnimate) ? 'off' : reduce() ? 'soft' : 'full';

  /* ---------- 1. наведение ---------- */
  const hv = {grid: null, geo: null, cur: null, raf: 0, px: -1, py: -1, idleT: 0, scrolling: false, bound: false};
  const hoverDirty = () => { hv.geo = null; if (hv.px >= 0 && hv.grid && hv.grid._galKick) hv.grid._galKick(); };         // раскладка изменилась: наведение под неподвижным курсором пересчитывается
  function hoverInit(grid) {
    if (grid._galHover || !matchMedia('(hover:hover) and (pointer:fine)').matches) return; grid._galHover = true;
    Object.assign(hv, {grid, geo: null, cur: null, px: -1, py: -1});
    const measure = () => { hv.geo = $$('.pcard', grid).filter(c => !c.hidden).map(c => ({c, l: c.offsetLeft, t: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight})); };
    const setCur = c => { if (c === hv.cur) return; if (hv.cur) hv.cur.classList.remove('is-hov'); hv.cur = c; if (c) c.classList.add('is-hov'); };
    const tick = () => {
      hv.raf = 0; if (hv.grid !== grid || hv.px < 0 || hv.scrolling) return; if (!hv.geo) measure();
      const g = grid.getBoundingClientRect(), lx = hv.px - g.left, ly = hv.py - g.top; let hit = null;
      for (let i = 0; i < hv.geo.length; i++) { const it = hv.geo[i]; if (lx >= it.l && lx < it.l + it.w && ly >= it.t && ly < it.t + it.h) { hit = it; break; } }
      setCur(hit && hit.c);
      if (hit) { hit.c.style.setProperty('--mx', Math.max(0, Math.min(100, (lx - hit.l) / hit.w * 100)).toFixed(1) + '%'); hit.c.style.setProperty('--my', Math.max(0, Math.min(100, (ly - hit.t) / 200 * 100)).toFixed(1) + '%'); }
    };
    const kick = () => { if (!hv.raf) hv.raf = requestAnimationFrame(tick); };
    grid.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; hv.px = e.clientX; hv.py = e.clientY; kick(); }, {passive: true});
    grid.addEventListener('pointerleave', () => { hv.px = hv.py = -1; setCur(null); });
    if (!hv.bound) {                                                                     // окно слушаем один раз, даже если страницы подменяются без перезагрузки
      hv.bound = true;
      addEventListener('scroll', () => { if (!hv.grid) return; if (hv.cur) { hv.cur.classList.remove('is-hov'); hv.cur = null; } hv.scrolling = true; clearTimeout(hv.idleT); hv.idleT = setTimeout(() => { hv.scrolling = false; if (hv.px >= 0 && hv.grid.isConnected && hv.grid._galKick) hv.grid._galKick(); }, 140); }, {passive: true});
      addEventListener('resize', hoverDirty);
    }
    grid._galKick = kick;
    if (window.ResizeObserver) new ResizeObserver(hoverDirty).observe(grid);
  }

  /* ---------- 2. смена фильтров: FLIP ---------- */
  const live = {anims: new Set(), ghosts: new Set()};
  function stopAll() { live.anims.forEach(a => { try { a.cancel(); } catch (e) {} }); live.anims.clear(); live.ghosts.forEach(g => g.remove()); live.ghosts.clear(); }
  function run(el, kf, opt) { const a = el.animate(kf, opt); live.anims.add(a); a.onfinish = a.oncancel = () => live.anims.delete(a); return a; }
  const near = r => r.bottom > -120 && r.top < innerHeight + 120;
  function ghostCard(c, grid, f) {
    const g = c.cloneNode(true);
    g.getAttributeNames().forEach(n => { if (n === 'hidden' || n === 'id' || n.indexOf('data-') === 0) g.removeAttribute(n); });
    g.className = 'card pc-ghost'; g.setAttribute('aria-hidden', 'true'); g.setAttribute('inert', '');
    $$('[id]', g).forEach(n => n.removeAttribute('id')); $$('a,button', g).forEach(n => n.setAttribute('tabindex', '-1'));
    g.style.left = f.x + 'px'; g.style.top = f.y + 'px'; g.style.width = f.w + 'px'; g.style.height = f.h + 'px';
    grid.appendChild(g); live.ghosts.add(g); return g;
  }
  function begin(grid, cards) {
    const m = mode(), g0 = grid.getBoundingClientRect(), first = new Map();
    cards.forEach(c => { c.classList.remove('is-hov'); if (c.hidden) return; const r = c.getBoundingClientRect(); first.set(c, {x: r.left - g0.left, y: r.top - g0.top, w: r.width, h: r.height, vis: near(r)}); });   // положения — вместе с незаконченными анимациями
    stopAll();
    return {
      end() {
        hoverDirty();
        if (m === 'off') return;
        const g1 = grid.getBoundingClientRect(); let k = 0;
        cards.forEach(c => {
          const f = first.get(c);
          if (!c.hidden) {
            const r = c.getBoundingClientRect(), x = r.left - g1.left, y = r.top - g1.top, shown = c.classList.contains('in');        // не проявленные ещё карточки проявит штатный .reveal
            if (f) {
              const dx = f.x - x, dy = f.y - y;
              if (m === 'full' && shown && (f.vis || near(r)) && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) run(c, [{transform: 'translate(' + dx + 'px,' + dy + 'px)'}, {transform: 'translate(0,0)'}], {duration: 480, easing: EASE});
            } else if (shown && near(r)) {
              run(c, m === 'full' ? [{opacity: 0, transform: 'translateY(18px) scale(.97)'}, {opacity: 1, transform: 'none'}] : [{opacity: 0}, {opacity: 1}], {duration: 460, delay: 90 + Math.min(k++, 7) * 36, easing: EASE, fill: 'backwards'});
            }
          } else if (f && f.vis && m === 'full') {
            const gh = ghostCard(c, grid, f), a = run(gh, [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'scale(.96)'}], {duration: 220, easing: 'ease-out', fill: 'forwards'});
            a.onfinish = a.oncancel = () => { gh.remove(); live.ghosts.delete(gh); live.anims.delete(a); };
          }
        });
      }
    };
  }

  /* ---------- 3. окно просмотра ---------- */
  const modal = () => $('#modal');
  const cardOf = id => $('#cat-grid .pcard[data-id="' + id + '"]:not([hidden])');
  let openSrc = null, curId = null, lastOpener = null, flight = null;
  const pkScale = art => { const pk = $('.pk', art), s = pk ? parseFloat(getComputedStyle(pk).scale) : 1; return s > 0 ? s : 1; };
  function ghostArt(art, rev) {
    const g = art.cloneNode(true); g.removeAttribute('role'); g.removeAttribute('aria-label'); g.setAttribute('aria-hidden', 'true'); $$('[id]', g).forEach(n => n.removeAttribute('id'));
    g.classList.add('gal-fly'); if (rev) g.classList.add('rev'); return g;
  }
  const box = (r, rad, pb) => ({left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: rad, paddingBottom: pb});
  function stopFlight() { if (flight) { try { flight.a.cancel(); } catch (e) {} flight.done(); flight = null; } }
  function fly(art, src, from, to, s0, s1, ms, rev, pb0, pb1) {                         // art — настоящая упаковка в окне, src — её копия-образец (карточка или окно)
    const g = ghostArt(src, rev), r0 = rev ? '22px' : '22px 22px 0 0', r1 = rev ? '22px 22px 0 0' : '22px'; Object.assign(g.style, box(from, r0, pb0)); document.body.appendChild(g); art.style.visibility = 'hidden';
    const a = g.animate([box(from, r0, pb0), box(to, r1, pb1)], {duration: ms, easing: rev ? 'cubic-bezier(.4,0,.2,1)' : EASE, fill: 'forwards'});
    const pk = $('.pk', g); if (pk && s0 !== s1) pk.animate([{scale: String(s0)}, {scale: String(s1)}], {duration: ms, easing: rev ? 'cubic-bezier(.4,0,.2,1)' : EASE, fill: 'forwards'});
    const done = () => { art.style.visibility = ''; g.remove(); if (flight && flight.g === g) flight = null; };
    a.onfinish = a.oncancel = done; flight = {g, a, done};
  }
  function flyIn(d, id) {
    if (mode() !== 'full') return;
    const card = cardOf(id), src = card && $('.art', card), art = $('.qv-art .art', d); if (!src || !art) return;
    const a = src.getBoundingClientRect(), b = art.getBoundingClientRect(); if (!a.width || !b.width || !near(a)) return;
    stopFlight(); fly(art, src, a, b, 1, pkScale(art), 520, false, getComputedStyle(src).paddingBottom, getComputedStyle(art).paddingBottom);
  }
  function flyOut(d, id) {
    stopFlight(); if (mode() !== 'full') return;
    const card = cardOf(id), dst = card && $('.art', card), art = $('.qv-art .art', d); if (!dst || !art) return;
    const a = art.getBoundingClientRect(), b = dst.getBoundingClientRect(); if (!a.width || !b.width || !near(b)) return;
    fly(art, art, a, b, pkScale(art), 1, 300, true, getComputedStyle(art).paddingBottom, getComputedStyle(dst).paddingBottom);
  }
  function related(id) {
    const p = P[id], ts = p.ts || [];
    return (D.products || []).filter(q => q.id !== id && q.brand === p.brand && (q.ts || []).some(t => ts.indexOf(t) >= 0))
      .map(q => [(q.ts || []).filter(t => ts.indexOf(t) >= 0).length + (q.c === p.c ? 1 : 0), q]).sort((x, y) => y[0] - x[0]).slice(0, 3).map(x => x[1]);
  }
  function addRelated(d, id) {
    const list = related(id), at = $('.qv-more', d); if (!list.length || !at || $('.qv-rel', d)) return;
    const w = document.createElement('div'); w.className = 'qv-rel';
    w.innerHTML = '<span class="qv-rel-t">Тот же бренд и назначение</span><div class="qv-rel-l">' + list.map(q => '<button type="button" class="chip" data-act="qv-open" data-id="' + esc(q.id) + '">' + esc(q.name) + '</button>').join('') + '</div>';
    at.parentNode.insertBefore(w, at);
  }
  const order = () => $$('#cat-grid .pcard[data-id]:not([hidden])').map(c => c.getAttribute('data-id'));
  function enhance(d) {
    d.classList.add('gal-done'); const src = openSrc; openSrc = null;
    if (!$('[data-catalog]')) { curId = null; return; }
    const ask = $('[data-act="qv-ask"]', d), id = ask && ask.getAttribute('data-id'); if (!id || !P[id]) return;
    d.classList.add('gal');
    const st = $('[data-act="qv-stella"]', d); if (st) st.textContent = 'Помочь с подбором';
    addRelated(d, id);
    const swap = !!curId && curId !== id && (!src || !src.fresh), prev = curId; curId = id;
    if (src && src.fresh) { d.classList.add('gal-open'); lastOpener = src.opener || document.activeElement; flyIn(d, id); }
    else if (swap && mode() !== 'off') { const o = order(); d.style.setProperty('--dir', o.indexOf(id) >= o.indexOf(prev) ? 1 : -1); d.classList.add('gal-swap'); }
  }
  function watchModal() {
    const m = modal(); if (!m || m._galMO || !window.MutationObserver) return; m._galMO = true;
    new MutationObserver(() => { const d = $('.qv-dlg', m); if (d && !d.classList.contains('gal-done')) enhance(d); else if (!d) { curId = null; } }).observe(m, {childList: true});
  }
  const open0 = A.actions && A.actions['qv-open'];
  if (open0) A.actions['qv-open'] = function (t, id) {
    id = id || (t && t.getAttribute && t.getAttribute('data-id')); const m = modal();
    openSrc = {id, fresh: !(m && m.classList.contains('open') && $('.qv-dlg', m)), opener: t && t.focus ? t : document.activeElement};
    return open0.apply(this, arguments);
  };
  const close0 = A.closeModal;
  if (close0) A.closeModal = function () {
    const m = modal(), d = m && m.classList.contains('open') && !m.classList.contains('closing') && $('.qv-dlg.gal', m);
    if (!d) return close0.apply(this, arguments);
    const id = curId; flyOut(d, id); curId = null;
    const r = close0.apply(this, arguments);
    setTimeout(() => {                                                                  // фокус — на «Быстрый просмотр» той карточки, где закрыли (если дальше не открылась форма)
      const mm = modal(); if (mm && mm.classList.contains('open')) return;
      const c = id && cardOf(id), t = (c && $('.qv-btn', c)) || (lastOpener && lastOpener.isConnected ? lastOpener : null);
      if (t && t.focus) t.focus({preventScroll: true});
    }, 330);
    return r;
  };

  /* ---------- 4. «Помочь с подбором» ---------- */
  A.actions['qv-stella'] = function (t, id) {
    id = id || (t && t.getAttribute('data-id')); const p = P[id]; if (!p || !A.stella) return;
    const b = B[p.brand] || {}, bits = [];
    if (CAT[p.c]) bits.push('категория «' + CAT[p.c] + '»'); if (KIND[p.k]) bits.push('вид: ' + KIND[p.k].toLowerCase());
    const ts = (p.ts || []).map(x => TASK[x]).filter(Boolean); if (ts.length) bits.push('назначение: ' + ts.join(', ').toLowerCase());
    const text = 'Помоги с подбором: расскажи о товаре ' + (b.name ? b.name + ' ' : '') + p.name + (bits.length ? ' (' + bits.join('; ') + ')' : '') + ' — кому подходит и что к нему добавить в протокол.';          // «с чем сочетать» уводит встроенные ответы в общий разговор о протоколах
    track('gallery_help', {product: id}); A.closeModal(); setTimeout(() => A.stella.ask(text, {cmp: [id], product: id}), 380);
  };
  function catalogState() {
    const val = id => { const s = $('#' + id); return s && s.value !== 'all' ? s.selectedOptions[0].textContent.trim() : ''; };
    const m = /(\d+)\D+(\d+)/.exec(($('#res-count') || {}).textContent || ''), q = (($('#cat-q') || {}).value || '').trim();
    return {cat: val('f-cat'), brand: val('f-brand'), task: val('f-task'), kind: val('f-kind'), q, n: m ? +m[1] : null, total: m ? +m[2] : null};
  }
  A.actions['gal-help'] = function () {
    if (!A.stella) return; const s = catalogState(), parts = [];
    if (s.cat) parts.push('категория «' + s.cat + '»'); if (s.brand) parts.push('бренд ' + s.brand); if (s.task) parts.push('назначение: ' + s.task.toLowerCase()); if (s.kind) parts.push('вид: ' + s.kind.toLowerCase()); if (s.q) parts.push('запрос «' + s.q + '»');
    const text = parts.length ? 'Помоги с подбором в каталоге: ' + parts.join(', ') + '. ' + (s.n === 0 ? 'Ничего не нашлось — что подойдёт рядом?' : 'Найдено ' + s.n + ' из ' + s.total + ' — что выбрать и с чего начать?') : 'Помоги подобрать: опиши, что подойдёт под мою задачу.';
    track('gallery_help', {cat: s.cat, brand: s.brand, task: s.task}); A.stella.ask(text, {catalog: s});
  };
  function helpInit() {
    const line = $('.res-line'); if (!line || !X.assistant || $('.gal-help', line)) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lnk gal-help'; b.setAttribute('data-act', 'gal-help'); b.innerHTML = 'Помочь с подбором ' + (A.I && A.I.arrow || '');
    line.insertBefore(b, $('#cat-reset', line) || null);
  }

  A.gallery = {begin, mode, state: catalogState};
  function init() {
    watchModal();
    const grid = $('[data-catalog] #cat-grid'); if (!grid) return;
    hoverInit(grid); helpInit();
  }
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
