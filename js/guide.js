/* guide.js — Стелла как навигатор по сайту (data/redesign.json → extras.navigator; настройки — data/stella/guide.json → window.ASTREYA_DATA.guide).

   Что здесь: «руки» Стеллы. Чат (assistant.js) и «мозг» (assistant-brain.js) решают, ЧТО показать, — этот файл делает это на странице:
   · spot()    — подсветка элемента с пояснением (затемнение вокруг, подсказка рядом, следит за прокруткой);
   · tour()    — экскурсия по шагам, переживает переходы между страницами (состояние в sessionStorage, живёт ≈ 3 минуты);
     «Покажи сайт» (tour «site») — интерактивная экскурсия из четырёх этапов: Стелла сама прокручивает, подсвечивает, переходит между страницами, нажимает ссылку меню и карточку, набирает запрос в поиске и выбирает фильтр (всё обратимо); запускается только по просьбе посетителя;
   · go()      — открыть страницу этого сайта (только известные адреса), filter() — выставить фильтры каталога, scroll() — прокрутка;
   · точки входа — на каждой странице блок «Не знаете, что выбрать? Спросите Стеллу» с готовыми вопросами;
   · проактивная подсказка — аккуратный пузырь у кнопки Стеллы: при долгом чтении, прокрутке, паузе, «мышь ушла вверх», пустых результатах и выбранных для сравнения товарах.
   Подсказка показывается не чаще заданного числа раз за сессию, не мешает вводу и окнам, закрывается крестиком — и после этого больше не появляется.
   Ничего не уходит на сервер: это чистая разметка на странице. Выключить всё: extras.navigator = false в data/redesign.json. */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.guide || !D.extras || !D.extras.assistant || !D.extras.navigator) return;
  const G = D.guide, I = A.I, esc = A.esc;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const root = () => document.body.getAttribute('data-root') || '';
  const pageKey = () => document.body.getAttribute('data-page') || '';
  const speed = () => { const v = +window.ASTREYA_MOTION_SPEED; return v > 0 ? v : 1; };
  const mobile = () => matchMedia('(max-width:640px)').matches;
  const narrow = () => matchMedia('(max-width:900px)').matches;          // с этой ширины меню — выезжающий ящик (бургер)
  const store = {
    get: k => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: k => { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  const KT = 'astreya:g-tour', KP = 'astreya:g-pend', KN = 'astreya:g-nudge', KC = 'astreya:g-chat';
  const S = () => A.stella || {};
  A.actions = A.actions || {};

  /* ---------- что известно сайту ---------- */
  const PAGES = (G.pages || []), TOURS = (G.tours || []), TARGETS = G.targets || {};
  const P = {}, B = {}; (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; });
  const okPath = new Set(PAGES.map(p => p.href).concat(['index.html']));
  (D.products || []).forEach(p => okPath.add('products/' + p.slug + '.html')); (D.brands || []).forEach(b => okPath.add('brands/' + b.id + '.html'));
  (D.events || []).forEach(e => okPath.add('training/' + e.slug + '.html'));
  (D.index || []).forEach(i => { if (i && i.url) okPath.add(i.url); });
  /* адрес можно открыть только если это страница этого сайта */
  function cleanHref(href) {
    const h = String(href || '').trim().replace(/^\.?\//, ''); const m = /^([a-z0-9][a-z0-9\-\/]*\.html)((?:\?[\w=&%.\-]*)?(?:#[\w\-]*)?)$/i.exec(h);
    return m && okPath.has(m[1]) ? {path: m[1], rest: m[2] || '', href: m[1] + (m[2] || '')} : null;
  }
  const targetsOn = key => (TARGETS[key] || []).concat(TARGETS['*'] || []);
  const findTarget = (id, key) => targetsOn(key || pageKey()).find(t => t.id === id) || null;
  const shown = el => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); if (!r.width && !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  function resolveEl(t) { let l = []; try { l = $$(t.sel); } catch (e) {} return l.find(shown) || null; }
  /* на телефоне фильтры каталога спрятаны за кнопкой — раскрываем, если подсвечиваем их */
  function prepFilters(t) {
    const tb = $('#results'); if (!tb || !/^#f-|#filters|#categories/.test(t.sel) || resolveEl(t)) return 0;
    const b = $('.filters-toggle', tb); if (b && b.getAttribute('aria-expanded') !== 'true') { b.click(); return 320; } return 0;
  }

  /* ---------- подсветка ---------- */
  let spotEl = null, spotRaf = 0, cur = null, onClose = null, navPending = 0;
  function spotDom() {
    let s = $('#g-spot'); if (s) return s;
    s = document.createElement('div'); s.id = 'g-spot'; s.className = 'g-spot'; s.hidden = true;
    s.innerHTML = '<div class="g-hole" aria-hidden="true"></div><div class="g-pop" role="dialog" aria-label="Подсказка Стеллы" aria-live="polite"><span class="g-pe" aria-hidden="true"></span><div class="g-body"><div class="g-tx"></div><div class="g-ctl"></div></div><button class="g-x" type="button" data-act="g-spot-x" aria-label="Закрыть подсказку">' + I.close + '</button></div>';
    document.body.appendChild(s); return s;
  }
  const bold = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const pickV = v => Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;          // реплика может быть списком вариантов: каждый раз берётся один, чтобы не повторяться
  const PAD = 8;
  /* Комментарий Стеллы стоит всегда на одном месте и сам ни к чему не «подстраивается»: на компьютере — внизу по центру, на телефоне — нижняя «шторка» (CSS, .g-pop). Подстраивается страница: блок ставится выше комментария (см. scrollTarget), рамка обходит блок целиком. */
  const popTop = () => { const p = $('#g-spot .g-pop'); return p ? Math.round(p.getBoundingClientRect().top) : innerHeight; };
  function place() {
    spotRaf = 0; const s = $('#g-spot'); if (!s || s.hidden || !spotEl) return;
    const hole = $('.g-hole', s), pop = $('.g-pop', s); pop.classList.toggle('sheet', mobile()); pop.classList.toggle('sheet-top', mobile() && !!(cur && cur.dockTop)); pop.classList.toggle('dock-top', !mobile() && !!(cur && cur.dockTop));
    if (cur && cur.free) { hole.style.width = '0px'; hole.style.height = '0px'; spotRaf = requestAnimationFrame(place); return; }
    if (!spotEl.isConnected || !shown(spotEl)) { const t = cur && cur.t, again = t ? resolveEl(t) : null; if (again) spotEl = again; else { if (navPending && Date.now() - navPending < 6000) hideSpot(true); else hideSpot(); return; } }          // цель пропала: если это переход, который начала сама экскурсия, — состояние экскурсии сохраняем
    const r = spotEl.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    /* рамка — это сам блок с отступом, обрезанный краем экрана: пока страница едет, она «приклеена» к блоку и въезжает вместе с ним с края экрана; пока блока на экране нет — рамки нет (не «открывается заранее» поверх чужого места) */
    const scrolling = LOCK.prog > 0, x = Math.max(4, r.left - PAD), w = Math.min(vw - 8, r.width + PAD * 2), yT = r.top - PAD, yB = r.bottom + PAD;
    let y = Math.max(4, yT), h = Math.min(vh - 4, yB) - y;
    const gone = h < 2;
    if (gone) { y = yB <= 4 ? 4 : vh - 4; h = 0; }
    else if (!scrolling && !(cur && (cur.dockTop || cur.fixed))) h = Math.min(h, Math.max(40, popTop() - 10 - y));          // блок выше свободной зоны — обрезается по краю комментария, а не наоборот
    hole.classList.toggle('g-sc', scrolling || gone);
    hole.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'; hole.style.width = Math.round(gone ? 0 : w) + 'px'; hole.style.height = Math.round(h) + 'px';
    spotRaf = requestAnimationFrame(place);
  }
  /* прокрутка к элементу — только та, что делает сама экскурсия: после неё страница снова «закреплена» (см. LOCK ниже) */
  const HDR = 76;
  /* свободная зона для показа: между шапкой и комментарием Стеллы (внизу) — либо между комментарием (вверху) и низом экрана; высота комментария — по тексту этого шага */
  function zone(topDock) {
    const vh = innerHeight, sp = $('#g-spot'), pop = sp && !sp.hidden ? $('.g-pop', sp) : null, ph = (pop && pop.offsetHeight) || (mobile() ? 220 : 170);
    if (topDock) { const t = (mobile() ? 80 : 88) + ph + 18; return {top: t, bottom: vh - 24}; }
    const b = mobile() ? 12 : 20;          // нижняя плашка сайта (список запроса, «следующий шаг») на время показа скрыта — комментарий стоит у самого низа
    return {top: HDR + 14, bottom: vh - b - ph - 14};
  }
  const isFixedEl = el => { for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) { if (n.id === 'hdr' || getComputedStyle(n).position === 'fixed') return true; } return false; };
  /* куда прокрутить страницу, чтобы блок (и то, что рядом должно быть видно) оказался в свободной зоне; если страница кончается и выше блок не поднять — комментарий уходит наверх */
  function planScroll(el, o) {
    o = o || {}; if (isFixedEl(el)) return {to: null, dockTop: !!o.dockTop, fixed: true};
    let r = el.getBoundingClientRect(); const vh = innerHeight, maxS = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    if (o.keep) { const k = o.keep.getBoundingClientRect(); r = {top: Math.min(r.top, k.top), bottom: Math.max(r.bottom, k.bottom), height: Math.max(r.bottom, k.bottom) - Math.min(r.top, k.top)}; }
    if (o.frac != null) { const to = Math.max(0, Math.round(scrollY + r.top - Math.max(HDR + 16, vh * o.frac))); return {to: Math.abs(to - scrollY) < 6 ? null : to, dockTop: !!o.dockTop}; }
    if (!o.fit) { return {to: (r.top >= HDR + 10 && r.bottom <= vh - (mobile() ? 190 : 24) && r.height < vh * .8) ? null : Math.max(0, Math.round(scrollY + r.top - Math.max(HDR + 16, Math.min(vh * (mobile() ? .3 : .38), (vh - r.height) / 2)))), dockTop: !!o.dockTop}; }          // обычная прокрутка к элементу, когда нужно просто показать
    let best = null;
    for (const td of o.dockTop ? [true] : [false, true]) {
      const z = zone(td), room = z.bottom - z.top - PAD * 2, want = z.top + PAD + Math.max(0, room - r.height) * .4;
      if (r.top >= z.top + PAD - 4 && r.bottom <= z.bottom - PAD) return {to: null, dockTop: td};          // уже помещается — не двигаем
      const to = Math.min(maxS, Math.max(0, Math.round(scrollY + r.top - want))), shift = to - scrollY, nt = r.top - shift, nb = r.bottom - shift;
      const bad = Math.max(0, z.top + PAD - 4 - nt) + Math.max(0, nb - (z.bottom - PAD));          // насколько блок всё равно заходит под комментарий или шапку
      const res = {to: Math.abs(shift) < 2 ? null : to, dockTop: td};
      if (!bad) return res; if (!best || bad < best.bad) best = Object.assign(res, {bad});
    }
    const res = best;
    return res;
  }
  const scrollTarget = (el, frac, fit, keep) => { const pl = planScroll(el, {frac, fit, keep, dockTop: !!(cur && cur.dockTop)}); return pl.to; };
  const LOCK = {on: false, y: 0, prog: 0};
  /* Блокирующие (passive:false) слушатели колеса и касаний висят на странице ТОЛЬКО пока идёт экскурсия. Раньше они стояли всегда: браузер не может прокручивать страницу
     без ожидания главного потока, пока на window есть такой слушатель (на телефоне — на каждый touchmove), и любая заминка главного потока превращалась в микрофриз прокрутки. */
  function lockPage(on) {
    LOCK.on = on; LOCK.y = scrollY;
    ['wheel', 'touchmove'].forEach(ev => { if (on) addEventListener(ev, stopScroll, {passive: false, capture: true}); else removeEventListener(ev, stopScroll, {capture: true}); });
  }
  /* плавная прокрутка «с разгоном и торможением»: чем дальше ехать, тем дольше, но без рывков; встроенная плавность браузера на дальних расстояниях слишком резкая */
  let scrollTok = 0;
  function progScroll(top, jumpOver) {
    if (top == null || Math.abs(top - scrollY) < 2) { LOCK.y = scrollY; return Promise.resolve(); }
    const tok = ++scrollTok, y0 = scrollY, dist = top - y0, jump = !!jumpOver && Math.abs(dist) > jumpOver, k = mobile() ? 1.3 : 1, dur = jump ? 40 : Math.max(60, Math.round(Math.min(2000, (480 + Math.sqrt(Math.abs(dist)) * 26) * k) / speed())), t0 = performance.now();          // из начала главной (вступление с баночкой) к первому кадру — сразу: не показываем перемотку всего вступления
    LOCK.prog++;
    return new Promise(res => {
      const end = () => { LOCK.prog = Math.max(0, LOCK.prog - 1); LOCK.y = scrollY; res(); };
      const step = now => {
        if (tok !== scrollTok) return end();          // началась другая прокрутка или показ закрыт
        const t = Math.min(1, (now - t0) / dur), e = jump ? 1 : t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        window.scrollTo({top: y0 + dist * e, behavior: 'instant'});
        if (spotRaf && spotEl) { cancelAnimationFrame(spotRaf); place(); }          // рамка встаёт на место в том же кадре, что и страница: без отставания на кадр
        if (t < 1) requestAnimationFrame(step); else end();
      };
      requestAnimationFrame(step);
    });
  }
  const scrollTo = (el, frac, fit, keep) => progScroll(scrollTarget(el, frac, fit, keep));
  /* пока идёт экскурсия, страница не прокручивается колесом, пальцем, клавишами и ползунком: подсветка и Стелла стоят на месте, листает только сама Стелла */
  const stopScroll = e => { if (!LOCK.on) return; if (e.target && e.target.closest && e.target.closest('#asst')) return; e.preventDefault(); e.stopImmediatePropagation(); };
  addEventListener('keydown', e => { if (!LOCK.on) return; const tag = (e.target || {}).tagName || ''; if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.closest && e.target.closest('#asst'))) return; if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.key) || (e.key === ' ' && !/^(BUTTON|A)$/.test(tag))) e.preventDefault(); }, true);
  addEventListener('scroll', () => { if (!LOCK.on || LOCK.prog) return; const max = Math.max(0, document.documentElement.scrollHeight - innerHeight); if (LOCK.y > max && Math.abs(scrollY - max) <= 2) LOCK.y = max; if (Math.abs(scrollY - LOCK.y) > 2) window.scrollTo({top: LOCK.y, behavior: 'instant'}); }, {passive: true});          // страница стала короче (фильтр убрал карточки) — «закреплённое» место сдвигается вместе с ней
  /* прогресс экскурсии: «2 из 9 · этап» и девять отрезков (пройденные заполнены, текущий — по шагам внутри этапа) */
  function progHTML(p) {
    let seg = ''; for (let k = 0; k < p.gn; k++) seg += '<i style="--p:' + (k < p.g ? 1 : k === p.g ? p.sub : 0) + '"></i>';
    return '<small class="g-st"><b>' + (p.g + 1) + ' из ' + p.gn + '</b>' + (p.label ? ' · ' + esc(p.label) : '') + '</small><span class="g-bar" aria-hidden="true">' + seg + '</span>';
  }
  /* cfg: {t: описание цели, text, tour, prog: {g, gn, sub, label}, buttons: [{l, act, d, primary}], free — без выделения элемента, noScroll, onClose} */
  function spot(el, cfg) {
    const s = spotDom(); spotEl = el; cur = cfg; onClose = cfg.onClose || null;
    const pop = $('.g-pop', s), fresh = s.hidden, hole = $('.g-hole', s); if (fresh) { hole.classList.add('g-nt'); pop.removeAttribute('data-side'); } $('.g-pe', s).innerHTML = A.pearl ? A.pearl('talk', true) : '';          // первое появление — сразу на месте, без «вылета» из угла
    $$('.g-pulse').forEach(e => { if (e !== el) e.classList.remove('g-pulse'); });
    $('.g-tx', s).innerHTML = '<p>' + bold(cfg.text || '') + '</p>' + (cfg.prog ? progHTML(cfg.prog) : '');
    const bt = (cfg.buttons || []).map(b => '<button class="btn ' + (b.primary ? 'btn-fill' : b.act === 'asst-open' || b.act === 'g-spot-x' ? 'btn-lnk' : 'btn-ghost') + ' btn-sm" type="button" data-act="' + esc(b.act) + '"' + (b.d ? ' data-d="' + esc(JSON.stringify(b.d)) + '"' : '') + '>' + esc(b.l) + '</button>').join('');
    s.classList.toggle('g-nodim', cfg.dim === false); $('.g-ctl', s).innerHTML = bt; s.hidden = false; document.body.classList.add('g-on');
    pop.classList.toggle('sheet', mobile()); pop.classList.toggle('sheet-top', mobile() && !!cfg.dockTop); pop.classList.toggle('dock-top', !mobile() && !!cfg.dockTop); pop.style.minHeight = '';
    if (cfg.reserve && cfg.reserve !== cfg.text) { const tx = $('.g-tx p', s), keepH = tx.innerHTML; tx.innerHTML = bold(cfg.reserve); const hh = pop.offsetHeight; tx.innerHTML = keepH; pop.style.minHeight = Math.max(hh, pop.offsetHeight) + 'px'; }          // место под самый длинный из двух текстов шага: комментарий не «растёт» и не наезжает на показ
    pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
    if (cfg.tour) lockPage(true);
    if (!cfg.noScroll && !cfg.free) { const pl = planScroll(el, {frac: cfg.at, fit: true, keep: cfg.keep, dockTop: cfg.dockTop}); if (pl.dockTop && !cfg.dockTop) { cfg.dockTop = true; pop.classList.toggle('sheet-top', mobile()); pop.classList.toggle('dock-top', !mobile()); } progScroll(pl.to); }
    cur.fixed = isFixedEl(el); $$('.xdock .g-keep').forEach(e => e.classList.remove('g-keep')); { const dk = el.closest ? el.closest('.xdock > *') : null; if (dk) dk.classList.add('g-keep'); }          // плашка сайта внизу прячется на время показа, кроме той, которую сама показываем
    cancelAnimationFrame(spotRaf); place();          // рамка встаёт на новую цель сразу, в том же кадре, что и новый текст: ни кадра со старым положением (лишняя рамка над чужим местом)
    if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => hole.classList.remove('g-nt')));
    const f = $('.g-ctl .btn-fill', s); if (f) { try { f.focus({preventScroll: true}); } catch (e) {} }
    A.track && A.track('guide_spot', {target: cfg.t ? cfg.t.id : '', tour: cfg.tour || ''});
  }
  function hideSpot(silent, keep) {
    if (!keep) { runId++; scrollTok++; lockPage(false); cursorHide(); closeDd(); runCleanup(true); menuRelease(); }
    const s = $('#g-spot'); if (!s || s.hidden) { spotEl = null; return; }
    s.hidden = true; document.body.classList.remove('g-on'); cancelAnimationFrame(spotRaf); spotRaf = 0; spotEl = null; const cb = onClose; onClose = null; cur = null; if (cb && !silent) cb();
  }
  /* экскурсия по меню: шапка всегда на виду (она уходит при прокрутке вниз), на узких экранах ящик меню открывается сам; всё возвращается, когда подсветка закрыта */
  let mUI = {drawer: false, hdr: false};
  function menuHold(open) {
    const b = document.body, h = $('#hdr'); if (h) h.classList.remove('hide'); b.classList.add('g-hdr'); mUI.hdr = true;
    if (!narrow() || open === b.classList.contains('menu-open')) return 0;
    if (A.toggleMenu) A.toggleMenu(open); mUI.drawer = open; return Math.round(480 / speed());
  }
  function menuRelease() {
    if (!mUI.hdr) return;
    document.body.classList.remove('g-hdr'); if (mUI.drawer && A.closeMenu) A.closeMenu(); mUI = {drawer: false, hdr: false};
  }

  /* ---------- «покажи» ---------- */
  function show(id, o) {
    o = o || {}; hideNudge(); const t = findTarget(id); if (!t) return false;
    const wait = prepFilters(t);
    const go = () => {
      const el = resolveEl(t); if (!el) { A.toast && A.toast(t.label + ': на этой странице не нашла — вот что есть: ' + (targetsOn(pageKey()).slice(0, 3).map(x => x.label).join(', ') || 'меню')); return false; }
      if (S().close && !o.keepChat) S().close(true);
      spot(el, {t, text: o.text || pickV(t.say) || t.label, buttons: [{l: 'Понятно', act: 'g-spot-x', primary: true}, {l: 'Спросить Стеллу', act: 'asst-open'}]});
      if (o.pulse !== false) pulse(el);
      return true;
    };
    if (wait) { setTimeout(go, wait); return true; } return go();
  }
  function pulse(el) { el.classList.remove('g-pulse'); void el.offsetWidth; el.classList.add('g-pulse'); setTimeout(() => el.classList.remove('g-pulse'), 2600); }

  /* ---------- экскурсия «Покажи сайт» ----------
     Шаги — в data/stella/guide.json → tours[site].steps: {g — номер этапа (их шесть), page — на какой странице шаг, target — id из targets, say — текст Стеллы,
     do — действие, которое Стелла выполняет на странице сама (brand-open, type-search, pick-task, calc-demo), pre — текст, пока действие идёт,
     next — {l, click}: кнопка «Далее» с настоящим нажатием на ссылку/карточку (переход на другую страницу), offer — предложение попробовать (только по нажатию посетителя),
     chrome — цель в шапке: шапка закрепляется на виду, на узких экранах сам раскрывается ящик меню; final — финальный шаг с предложением, что делать дальше}.
     Экскурсия НИКОГДА не запускается сама: только по просьбе посетителя («Покажи сайт» в панели Стеллы). Корзину и заявки она не трогает. */
  const tourById = id => TOURS.find(t => t.id === id) || null;
  const stepMatches = (st, key) => st.page === 'any' || st.page === key;
  const isStatic = page => PAGES.some(p => p.id === page);
  const fill = (t, v, dflt) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? v[k] : dflt != null ? dflt : m);
  const targetOf = st => st.sel ? {id: st.id || 'step', sel: mobile() && st.msel ? st.msel : st.sel, label: st.label || ''} : (TARGETS[st.page === 'any' ? '*' : st.page] || []).concat(TARGETS['*'] || []).find(x => x.id === st.target) || findTarget(st.target);          // sel — свой селектор прямо в шаге
  function saveTour(id, i, nav) { store.set(KT, {id, i, t: Date.now(), nav: nav ? 1 : 0}); }
  /* то, что экскурсия временно изменила на странице (набранный запрос, фильтр, раскрытая карточка бренда, отмеченные для сравнения товары), возвращается назад */
  let undo = [], undoT = [], demoTimer = 0;          // undo — на время шага; undoT — на время всей экскурсии на странице (набранный запрос и фильтр остаются, пока показываем карточки)
  function runCleanup(all) { clearTimeout(demoTimer); demoTimer = 0; const l = undo.concat(all ? undoT : []); undo = []; if (all) undoT = []; l.forEach(fn => { try { fn(); } catch (e) {} }); }
  const later = (fn, ms) => { demoTimer = setTimeout(fn, Math.round(ms / speed())); };
  const prog = (T, i) => { if (!T.groups) return {g: i, gn: T.steps.length, sub: 1, label: ''}; const st = T.steps[i], g = st.g || 0, ids = T.steps.map((x, k) => (x.g || 0) === g ? k : -1).filter(k => k >= 0); return {g, gn: (T.groups || []).length || 1, sub: (ids.indexOf(i) + 1) / ids.length, label: (T.groups || [])[g] || ''}; };

  /* ---------- курсор экскурсии ----------
     На глазах у посетителя Стелла «берёт мышь»: плывёт по дуге к тому, о чём говорит, нажимает (круги от нажатия), печатает по буквам, раскрывает список и выбирает пункт, тянет ползунок,
     а к следующему разделу идёт, нажимая пункт меню. Всё идёт в «человеческом» темпе (сама экскурсия никуда не спешит) и обратимо: всё, что изменено на странице, возвращается. */
  const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, Math.round(ms / speed()))));
  const pause = ms => new Promise(r => setTimeout(r, ms));          // ожидание отклика самой страницы: от темпа показа не зависит
  let runId = 0;                                          // номер показа: смена шага, «Пропустить» и выход обрывают всё, что шло под прежним номером
  const alive = id => id === runId;
  const fire = (el, type) => el.dispatchEvent(new Event(type, {bubbles: true}));
  const grp3 = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let cEl = null, cx = 0, cy = 0, cInit = false;
  function cursorDom() {
    if (cEl && cEl.isConnected) return cEl;
    cEl = document.createElement('div'); cEl.id = 'g-cursor'; cEl.className = 'g-cursor'; cEl.hidden = true; cEl.setAttribute('aria-hidden', 'true');
    cEl.innerHTML = '<svg viewBox="0 0 28 32" width="30" height="34" focusable="false"><path d="M4 2.5v22.2l5.6-5 3.7 8.6 4-1.8-3.7-8.4h8.1z" fill="#fff" stroke="#0b1a33" stroke-width="1.8" stroke-linejoin="round"/></svg><i class="g-c-rip"></i>';
    document.body.appendChild(cEl); return cEl;
  }
  const cPlace = (x, y) => { cx = x; cy = y; if (cEl) cEl.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 3) + 'px)'; };
  function cursorShow() {
    if (mobile()) return;          // на телефоне курсора нет: показываем само действие (набор, выбор, нажатые элементы)
    const el = cursorDom(); if (el.hidden) { if (!cInit) { cx = Math.round(innerWidth * .62); cy = Math.round(innerHeight * .7); cInit = true; } cPlace(cx, cy); el.hidden = false; void el.offsetWidth; }
    el.classList.add('on');
  }
  function cursorHide() { if (!cEl) return; const el = cEl; el.classList.remove('on', 'press'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 380); }
  /* плавный путь: лёгкая дуга, разгон и торможение у цели */
  function cursorGo(x, y, id, dur) {
    if (mobile()) { cx = x; cy = y; return sleep(Math.min(420, dur || 420)); }
    cursorShow(); const x0 = cx, y0 = cy, dx = x - x0, dy = y - y0, d = Math.hypot(dx, dy); if (d < 2) return Promise.resolve();
    const time = Math.round((dur || 560 + d * .75) / speed()), nx = -dy / d, ny = dx / d, bow = Math.min(90, d * .16) * (dx > 0 ? -1 : 1), mx = x0 + dx / 2 + nx * bow, my = y0 + dy / 2 + ny * bow, t0 = performance.now();
    return new Promise(res => {
      const step = now => { if (!alive(id)) return res(); const t = Math.min(1, (now - t0) / time), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, u = 1 - e; cPlace(u * u * x0 + 2 * u * e * mx + e * e * x, u * u * y0 + 2 * u * e * my + e * e * y); if (t < 1) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    });
  }
  async function cursorPress(id) {
    if (mobile()) { await sleep(420); return; }
    if (!cEl) return; cEl.classList.add('press'); const rip = $('.g-c-rip', cEl); rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go');
    await sleep(190); if (!alive(id)) return; cEl.classList.remove('press'); await sleep(320);
  }
  function aim(el, at) {          // куда «ткнуть» в элемент: у поля — в начало, у списка — к стрелке, у большого блока — в верхнюю часть
    const r = el.getBoundingClientRect(); let x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (at === 'start' || (el.tagName === 'INPUT' && el.type !== 'range')) x = r.left + Math.min(54, r.width * .25); else if (at === 'end') x = r.right - Math.min(40, r.width * .2);
    if (r.height > 220) y = r.top + Math.min(70, r.height * .25);
    return [Math.round(Math.max(10, Math.min(innerWidth - 10, x))), Math.round(Math.max(10, Math.min(innerHeight - 24, y)))];          // шапка закреплена сверху — курсору можно и туда
  }
  const ensureView = async el => { await progScroll(scrollTarget(el)); };
  const settle = async id => { while (LOCK.prog && alive(id)) await sleep(70); await sleep(260); };          // сначала прокрутка закончилась и подсветка встала, потом курсор

  /* выпадающий список: настоящий <select> не раскрыть из скрипта, поэтому показываем «меню» рядом с ним — пункты те же, выбор настоящий */
  let ddEl = null;
  function ddDom() { if (ddEl && ddEl.isConnected) return ddEl; ddEl = document.createElement('div'); ddEl.id = 'g-dd'; ddEl.className = 'g-dd'; ddEl.hidden = true; ddEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(ddEl); return ddEl; }
  function closeDd(sel) { if (sel) sel.classList.remove('g-open'); $$('select.g-open').forEach(x => x.classList.remove('g-open')); if (!ddEl) return; const d = ddEl; d.classList.remove('on'); setTimeout(() => { if (!d.classList.contains('on')) d.hidden = true; }, 300); }

  const REPORT = {
    count(c) { const m = /(\d+)\D+(\d+)/.exec(($('#res-count') || {}).textContent || ''); c.vars.n = m ? m[1] : '?'; c.vars.total = m ? m[2] : String((D.products || []).length); },
    calc(c) { const sum = grp3(+(($('#calc-range') || {}).value || 0)) + ' ₽', tier = (($('#calc-tier') || {}).textContent || '').trim(); c.vars.sum = sum; c.vars.tier = tier ? tier.charAt(0).toLowerCase() + tier.slice(1) : ''; },
    tiers(c) { const t = (D.sales && D.sales.discounts) || (D.site && D.site.discounts) || []; c.vars.tiers = t.map(x => x.pct + '% от ' + grp3(x.from) + ' ₽').join(', '); },
    visible(c, a) { c.vars[a.as || 'n'] = $$(a.sel).filter(e => !e.hidden && shown(e)).length; },
    text(c, a) { const e = resolveEl({sel: a.sel}); let t = e ? e.textContent.trim().replace(/\s+/g, ' ') : ''; if (a.nd) t = t.replace(/^\d+\s*|\s*\d+$/g, ''); c.vars[a.as || 't'] = t.slice(0, a.max || 80); }
  };
  async function follow(el, x, y, c) {          // страница могла перестроиться после нажатия (список стал короче): курсор остаётся у элемента, а не висит в пустоте
    if (!el.isConnected) return; const [x2, y2] = aim(el); if (Math.hypot(x2 - x, y2 - y) > 8) await cursorGo(x2, y2, c.id, 420);
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  /* «заявка для примера»: Стелла сама придумывает данные (имя, телефон, почту, город, организацию и короткий комментарий); номера и адреса — вымышленные */
  const DEMO = {
    first: ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Ирина', 'Светлана', 'Екатерина', 'Татьяна', 'Юлия'],
    last: ['Воронцова', 'Лебедева', 'Орлова', 'Миронова', 'Захарова', 'Крылова', 'Беляева', 'Громова', 'Фролова', 'Соболева'],
    mail: ['demo.studio', 'demo.salon', 'demo.klinika', 'demo.kabinet', 'demo.beauty'],
    city: ['Москва', 'Санкт-Петербург', 'Ростов-на-Дону', 'Симферополь', 'Казань', 'Краснодар'],
    org: ['Студия красоты «Лотос»', 'Клиника эстетики «Мира»', 'Салон «Эльза»', 'Центр ухода «Верба»', 'Кабинет косметолога «Линия»'],
    msg: {
      partner: ['Открываем второй кабинет, хотим обсудить поставки Dermatime и обучение для команды.', 'Интересуют условия закупки и ближайшие семинары для косметологов.', 'Работаем с проф. уходом, ищем официального поставщика. Расскажите про пороги скидок.'],
      question: ['Подскажите, как записаться на ближайший семинар и что взять с собой?', 'Какие бренды лучше подойдут для кабинета с упором на пигментацию?', 'Нужна консультация по выбору линейки для салона. Удобнее по почте.'],
      def: ['Здравствуйте! Хотим узнать подробности и условия. Спасибо.', 'Подскажите, пожалуйста, по ассортименту и срокам. Спасибо.']
    }
  };
  function demoData(type) {
    const nm = pick(DEMO.first) + ' ' + pick(DEMO.last), pool = DEMO.msg[type] || DEMO.msg[type === 'contact' ? 'question' : 'def'];
    return {name: nm, phone: '+7 (9' + rnd(10, 99) + ') 555-01-' + rnd(10, 99), email: pick(DEMO.mail) + rnd(10, 99) + '@example.com', city: pick(DEMO.city), org: pick(DEMO.org), msg: pick(pool)};
  }
  const qsel = (sel, c) => sel === '@target' ? c.el : sel && sel.nodeType ? sel : resolveEl({sel});
  const resetCat = () => { if (A.actions['cat-reset']) A.actions['cat-reset'](); };
  const undoOf = (u, c) => { if (u === '@reset') undo.push(resetCat); else if (u) undo.push(() => { const e = qsel(u, c); if (e) e.click(); }); };
  const ACTS = {
    async wait(a) { await sleep(a.wait); },
    async point(a, c) { const el = qsel(a.point, c); if (!el) return; if (spotEl && !spotEl.contains(el) && !el.contains(spotEl)) return; await ensureView(el);          // на узком экране подсвечен только кусок блока: что вне рамки — не показываем, чтобы страница не «уезжала»
       if (!alive(c.id)) return; const [x, y] = aim(el, a.at); await cursorGo(x, y, c.id); if (a.hold) await sleep(a.hold); },
    async click(a, c) {
      const el = qsel(a.click, c); if (!el) return; await ensureView(el); if (!alive(c.id)) return;
      const [x, y] = aim(el, a.at); await cursorGo(x, y, c.id); if (mobile()) pulse(el); await cursorPress(c.id); if (!alive(c.id)) return;
      undoOf(a.undo, c); el.click(); await sleep(a.after != null ? a.after : 600); await follow(el, x, y, c);
    },
    async type(a, c) {                                                              // печатает по буквам, неспешно; поле и набранное подсвечены синим
      const el = qsel(a.type, c); if (!el) return; await ensureView(el); if (!alive(c.id)) return;
      const word = String(a.text || '').replace('@prod', String(((D.products || [])[0] || {}).name || '').split(/\s+/)[0]).replace('@mail', demoData('').email), [x, y] = aim(el, 'start');          // @mail — придуманный адрес (example.com)
      await cursorGo(x, y, c.id); await cursorPress(c.id); if (!alive(c.id)) return;
      try { el.focus({preventScroll: true}); } catch (e) {}
      el.classList.add('g-typing'); undo.push(() => { el.classList.remove('g-typing'); if ($('#cat-q') === el) resetCat(); else { el.value = ''; fire(el, 'input'); } });
      el.value = ''; fire(el, 'input'); await sleep(350); cursorGo(x + 210, y + 18, c.id, 700);          // курсор отходит в сторону, чтобы не закрывать набираемые буквы
      for (let k = 1; k <= word.length; k++) { if (!alive(c.id)) return; el.value = word.slice(0, k); fire(el, 'input'); await sleep((a.per || 250) + (k % 3) * Math.round((a.per || 250) / 4.5)); }
      c.vars[a.as || 'q'] = word; await sleep(600); await pause(260);          // поиск в каталоге откликается с задержкой — ждём её
    },
    async choose(a, c) {                                                            // курсор нажимает на список, меню раскрывается, курсор скользит вниз и выбирает пункт
      let sel = qsel(a.choose, c);
      if (!sel) { const tg = $('#results .filters-toggle'); if (tg && shown(tg) && tg.getAttribute('aria-expanded') !== 'true') { await ensureView(tg); const [tx, ty] = aim(tg); await cursorGo(tx, ty, c.id); await cursorPress(c.id); tg.click(); await sleep(700); sel = qsel(a.choose, c); } }
      if (!sel || !alive(c.id)) return;
      await ensureView(sel); if (!alive(c.id)) return;
      if (!mobile() && !a.stay) { const top = sel.getBoundingClientRect().top; if (top < innerHeight * .4) await progScroll(Math.max(0, Math.round(scrollY + top - innerHeight * .46))); if (!alive(c.id)) return; }          // список ставим пониже: над ним остаётся место для карточки Стеллы
      const opts = Array.from(sel.options), want = a.value === '@rand' ? pick(opts.filter(o => o.value)) : opts.find(o => o.value === a.value) || opts.find(o => o.value && o.value !== 'all'); if (!want) return;
      const [x, y] = aim(sel, 'end'); await cursorGo(x, y, c.id); await cursorPress(c.id); if (!alive(c.id)) return;
      const dd = ddDom(), r = sel.getBoundingClientRect(), h = Math.min(300, opts.length * 40 + 12), below = r.bottom + 8 + h <= (cur && cur.dockTop ? innerHeight : popTop()) - 8;
      dd.innerHTML = opts.map(o => '<div class="g-dd-o' + (o.selected ? ' cur' : '') + '" data-v="' + esc(o.value) + '">' + esc(o.textContent.trim()) + '</div>').join('');
      dd.style.cssText = 'left:' + Math.round(r.left) + 'px;width:' + Math.round(Math.max(r.width, 200)) + 'px;max-height:' + h + 'px;top:' + Math.round(below ? r.bottom + 8 : Math.max(8, r.top - 8 - h)) + 'px'; dd.hidden = false; void dd.offsetWidth; dd.classList.add('on'); sel.classList.add('g-open');
      await sleep(a.fast ? 400 : 800); if (!alive(c.id)) { closeDd(sel); return; }
      const rows = $$('.g-dd-o', dd), k = rows.findIndex(o => o.getAttribute('data-v') === want.value);
      for (let j = 0; j <= k; j++) {
        if (!alive(c.id)) { closeDd(sel); return; }
        rows.forEach(o => o.classList.remove('hov')); rows[j].classList.add('hov'); if (rows[j].offsetTop + 44 - dd.scrollTop > dd.clientHeight) dd.scrollTop = rows[j].offsetTop + 50 - dd.clientHeight;
        const rr = rows[j].getBoundingClientRect(); await cursorGo(rr.left + Math.min(70, rr.width * .3), rr.top + rr.height / 2, c.id, a.fast ? 220 : 320); await sleep(j === k ? (a.fast ? 350 : 650) : (a.fast ? 140 : 260));
      }
      rows[k].classList.add('pick'); await cursorPress(c.id); if (!alive(c.id)) { closeDd(sel); return; }
      const was = sel.value; closeDd(sel); sel.value = want.value; fire(sel, 'change'); undo.push(a.stay ? () => { sel.value = was; fire(sel, 'change'); } : resetCat); c.vars[a.as || 'task'] = want.textContent.trim();
      await sleep(a.fast ? 350 : 650); const [bx, by] = aim(sel, 'end'); await cursorGo(bx, by, c.id, a.fast ? 350 : 500); await sleep(a.fast ? 200 : 450);          // курсор возвращается к полю и не закрывает карточку
    },
    async drag(a, c) {                                                              // берёт ползунок и неторопливо тянет
      const r = qsel(a.drag, c); if (!r) return; await ensureView(r); if (!alive(c.id)) return;
      const min = +r.min || 0, max = +r.max || 100, step = +r.step || 1, from = +r.value || 0, tiers = (D.sales && D.sales.discounts) || (D.site && D.site.discounts) || [], to = Math.min(max, a.to === '@tier1' ? +(tiers[1] && tiers[1].from) || 150000 : +a.to || 0);
      const box = () => r.getBoundingClientRect(), px = v => box().left + 11 + (box().width - 22) * ((v - min) / (max - min)), py = () => box().top + box().height / 2;
      await cursorGo(px(from), py(), c.id); await sleep(300); if (!alive(c.id)) return; if (cEl) cEl.classList.add('press'); undo.push(() => { r.value = String(from); fire(r, 'input'); });
      const n = Math.max(1, Math.round(Math.abs(to - from) / step)), per = Math.max(70, Math.min(190, 3000 / n));
      for (let k = 1; k <= n; k++) { if (!alive(c.id)) { if (cEl) cEl.classList.remove('press'); return; } r.value = String(Math.round((from + (to - from) * k / n) / step) * step); fire(r, 'input'); cPlace(px(+r.value), py()); await sleep(per); }
      if (cEl) cEl.classList.remove('press'); await sleep(700);
    },
    async fill(a, c) {                                                              // заполняет заявку «для примера»: поле за полем, курсор нажимает и печатает придуманные данные; согласие и отправку не трогает
      const f = qsel(a.fill, c); if (!f) return; const D = demoData(f.getAttribute('data-form') || ''), flds = $$('.fld', f).filter(shown);
      undo.push(() => { $$('input,textarea,select', f).forEach(e => { if (e.type === 'checkbox') return; if (e.value) { e.value = ''; fire(e, e.tagName === 'SELECT' ? 'change' : 'input'); } e.classList.remove('g-typing'); }); f._t0 = 0; $$('.fld.bad', f).forEach(w => w.classList.remove('bad')); });
      for (const w of flds) {
        if (!alive(c.id)) return; const id = w.getAttribute('data-f'), ctl = $('input,textarea,select', w); if (!ctl) continue;
        spotEl = w; await progScroll(scrollTarget(w, null, true)); if (!alive(c.id)) return;          // рамка идёт за полем: на любом экране оно помещается над комментарием Стеллы
        if (ctl.tagName === 'SELECT') { await ACTS.choose({choose: ctl, value: '@rand', stay: true, fast: true}, c); continue; }
        const val = D[id]; if (!val) continue;
        const r = ctl.getBoundingClientRect(), [x, y0] = aim(ctl, 'start'), y = ctl.tagName === 'TEXTAREA' ? Math.round(r.top + 26) : y0;
        await cursorGo(x, y, c.id, 380 + Math.hypot(x - cx, y - cy) * .5); await cursorPress(c.id); if (!alive(c.id)) return;
        try { ctl.focus({preventScroll: true}); } catch (e) {}
        $$('.g-typing', f).forEach(e => e.classList.remove('g-typing')); ctl.classList.add('g-typing'); ctl.value = ''; fire(ctl, 'input'); await sleep(220); cursorGo(x + 150, y + 16, c.id, 500);
        const per = id === 'msg' ? 45 : 75;
        for (let k = 1; k <= val.length; k++) { if (!alive(c.id)) return; ctl.value = val.slice(0, k); fire(ctl, 'input'); await sleep(per + (k % 3) * 25); }
        await sleep(250);
      }
      $$('.g-typing', f).forEach(e => e.classList.remove('g-typing')); await sleep(500);          // рамка остаётся на последнем поле
    },
    async report(a, c) { if (REPORT[a.report]) REPORT[a.report](c, a); },
    async say(a, c) { c.say(c.vars); },
    async reset() { resetCat(); }
  };
  async function runActs(list, c) { for (const a of list) { if (!alive(c.id)) return false; const k = Object.keys(ACTS).find(x => x in a); if (k) { try { await ACTS[k](a, c); } catch (e) {} } } return alive(c.id); }

  /* «попробовать» — действие, которое меняет состояние (отметка товаров для сравнения): выполняется только по явному нажатию посетителя и откатывается */
  const OFFER = {
    'cmp-demo'(T, i, st) {
      const id = runId, cards = $$('.pcard:not([hidden])').filter(shown).slice(0, 2); if (cards.length < 2 || !A.actions['cmp-toggle']) return false;
      let have = []; try { have = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); } catch (e) {}
      undo.push(() => { let cur = []; try { cur = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); } catch (e) {} cur.filter(x => have.indexOf(x) < 0).forEach(x => A.actions['cmp-toggle'](null, x)); });
      (async () => {
        for (const card of cards) { const b = $('.cmp-add', card); if (!b) continue; await ensureView(b); if (!alive(id)) return; const [x, y] = aim(b); await cursorGo(x, y, id); await cursorPress(id); if (!alive(id)) return; b.click(); await sleep(450); }
        await sleep(500); const bar = $('#cmp-bar'); if (!alive(id) || !bar || bar.hidden) return;
        spot(bar, {t: {id: 'compare-bar'}, tour: T.id, stepI: i, prog: prog(T, i), text: st.offer.say || 'Готово: два товара отмечены. Нажмите «Попросить Стеллу рассказать» — расскажу, чем они отличаются.',
          buttons: [{l: 'Далее', act: 'g-tour-next', primary: true}, {l: 'Рассказать о товарах', act: 'g-tour-cmp'}, {l: 'Пропустить', act: 'g-spot-x'}], dockTop: true, onClose: () => { runCleanup(true); store.del(KT); }});
        await settle(id); if (!alive(id)) return; const [x, y] = aim(bar); await cursorGo(x, y, id);
      })();
      return true;
    }
  };

  function tour(id, from) {
    const T = tourById(id); if (!T || !(T.steps || []).length) return false; hideNudge(); runCleanup(true);
    const key = pageKey(); let i = typeof from === 'number' ? from : T.start === 'first' ? 0 : T.steps.findIndex(s => stepMatches(s, key)); if (i < 0) i = 0;
    return tourStep(T, i, 1);
  }
  const RETRY = 12;          // сколько раз (≈ 0,2 с каждый) ждём, пока нужный элемент появится на странице
  /* к следующему разделу Стелла идёт сама: нажимает пункт меню (на телефоне — открыв меню), на новой странице экскурсия продолжается */
  async function travel(T, i, st, pg, id) {
    const w = menuHold(true); if (w) await new Promise(r => setTimeout(r, w)); if (!alive(id)) return;
    let el = null; try { el = pg.nav ? $$(pg.nav).find(shown) : null; } catch (e) {}
    const text = pg.go || 'Идём дальше.', cfg = {t: {id: 'nav-' + pg.id}, tour: T.id, stepI: i - .5, prog: prog(T, i), text, buttons: [{l: 'Пропустить', act: 'g-spot-x'}], onClose: () => { runCleanup(true); store.del(KT); }};
    saveTour(T.id, i, true);
    if (!el) { spot(document.body, Object.assign(cfg, {free: true})); await sleep(1600); if (alive(id)) go(pg.href, {keepTour: true}); return; }
    spot(el, cfg); pulse(el); await settle(id); if (!alive(id)) return;
    const [x, y] = aim(el); await cursorGo(x, y, id); await follow(el, x, y, {id}); await sleep(450); await cursorPress(id); if (!alive(id)) return;
    navPending = Date.now(); saveTour(T.id, i, true); el.click();
    setTimeout(() => { if (alive(id)) go(pg.href, {keepTour: true}); }, 4200);          // нажатие не привело к переходу — переходим сами
  }
  function tourStep(T, i, dir) {
    dir = dir || 1; const key = pageKey(), n = T.steps.length;
    if (i >= n) { tourEnd(T, true); return true; } if (i < 0) i = 0;
    const st = T.steps[i], id = ++runId;
    if (!stepMatches(st, key)) {                                                       // шаг относится к другой странице — переходим и продолжаем после загрузки
      const pg = PAGES.find(p => p.id === st.page);
      if (pg) { runCleanup(true); saveTour(T.id, i, true); if (dir > 0 && i > 0 && (pg.nav || pg.go)) travel(T, i, st, pg, id); else go(pg.href, {keepTour: true}); return true; }
      saveTour(T.id, i, true); hintWaitPage(T, i, st); return true;                    // страница-«лист» (товар, мероприятие): ждём, пока посетитель её откроет
    }
    runCleanup();
    const t = targetOf(st);
    if (!t && !st.final) return tourStep(T, i + dir, dir);
    const wait = st.chrome ? menuHold(!!st.drawer) : (menuRelease(), t ? prepFilters(t) : 0);
    const run = tries => {
      if (!alive(id)) return;
      const el = t ? resolveEl(t) : null;
      if (!el && !st.final) { if (tries < RETRY) { setTimeout(() => run(tries + 1), Math.round(220 / speed())); return; } return tourStep(T, i + dir, dir); }          // элемент так и не появился или скрыт — безопасно пропускаем шаг
      if (S().close) S().close(true);
      const last = i >= n - 1; saveTour(T.id, i, false);
      const acts = st.acts || (el && !st.final ? [{point: '@target'}] : st.final ? [{point: '#asst-fab'}] : []), hasSay = acts.some(a => 'say' in a);
      const ctx = {id, el, vars: {}, say: v => { const p = $('#g-spot .g-tx p'); if (p && cur && cur.stepI === i && cur.tour === T.id) p.innerHTML = bold(fill(st.say, v)); }};
      const buttons = [].concat(i > 0 ? [{l: 'Назад', act: 'g-tour-prev'}] : []);
      if (st.final) buttons.push({l: 'Вернуться на главную', act: 'asst-go', d: {href: 'index.html'}, primary: true}, (A.planChip && A.planChip.on() ? {l: A.planChip.label, act: 'asst-go', d: {href: A.sales.path}} : {l: 'Подобрать по задаче', act: 'asst-go', d: {href: 'catalog.html', show: 'task-filter'}}), {l: 'Спросить Стеллу', act: 'asst-open'}, {l: 'Закрыть', act: 'g-spot-x'});
      else buttons.push({l: st.next && st.next.l || (last ? 'Готово' : 'Далее'), act: 'g-tour-next', primary: true}, ...(st.offer ? [{l: st.offer.l, act: 'g-tour-offer'}] : []), {l: 'Пропустить', act: 'g-spot-x'});
      const shownText = hasSay && st.pre ? st.pre : fill(st.say, {}), keepEl = st.keep ? $(st.keep) : null;
      spot(el || document.body, {t: t || {id: 'free'}, tour: T.id, stepI: i, prog: prog(T, i), text: shownText, reserve: acts.some(a => 'say' in a) ? fill(st.say, {}, '0000000') : '', buttons, free: !el, noScroll: !!st.view, dockTop: !!st.dockTop || !!st.final, dim: st.dim, keep: keepEl, at: st.at, onClose: () => { runCleanup(true); store.del(KT); }});
      if (el && st.view) { const v = $(st.view), at = v && v.getAttribute('data-view-at'); if (v) progScroll(Math.max(0, Math.round(scrollY + v.getBoundingClientRect().top + (at ? +at * Math.max(0, v.offsetHeight - innerHeight) : -76))), 1500); }          // «показать с начала»: главная — с первого кадра героя (красиво, без затемнения кнопок)
      if (el) pulse(el);
      (async () => { await settle(id); if (!alive(id)) return;
        for (let k = 0; k < 2 && el && !st.view && !st.final && alive(id); k++) { const pl = planScroll(el, {fit: true, keep: keepEl, dockTop: !!(cur && cur.dockTop)}); if (pl.to == null) break; if (pl.dockTop && cur && !cur.dockTop) { cur.dockTop = true; const pp = $('#g-spot .g-pop'); pp.classList.toggle('sheet-top', mobile()); pp.classList.toggle('dock-top', !mobile()); } progScroll(pl.to); await settle(id); }          // страница могла «поехать» после загрузки (картинки, шрифты) — ставим блок на место ещё раз
        if (st.clear && alive(id)) { const cl = $(st.clear), over = cl ? cl.getBoundingClientRect().bottom - (popTop() - 14) : 0; if (over > 4) { progScroll(Math.round(scrollY + Math.min(over, 160))); await settle(id); } }          // то, что в кадре не подсвечено, но должно остаться видным (кнопки первого экрана), комментарий не закрывает
        if (!alive(id)) return; if (acts.length) await runActs(acts, ctx); })();
    };
    if (wait) setTimeout(() => run(0), wait); else run(0); return true;
  }
  function hintWaitPage(T, i, st) {
    const s = spotDom(), pg = st.page === 'product' ? 'товар' : st.page === 'event' ? 'мероприятие' : 'страницу';
    spot(document.body, {t: {id: 'wait'}, tour: T.id, text: 'Откройте ' + pg + ' — и я продолжу показ.', buttons: [{l: 'Пропустить', act: 'g-spot-x', primary: true}], free: true, onClose: () => { store.del(KT); }});
  }
  function tourEnd(T, done) {
    runCleanup(true); store.del(KT); hideSpot(true);
    if (done && T.id !== 'site') { A.toast && A.toast('Экскурсия окончена. Я рядом — спрашивайте!'); S().hey && S().hey(); }
  }
  /* «Далее» с настоящим нажатием: Стелла сама подводит курсор к ссылке или карточке и нажимает — так же, как это сделал бы посетитель */
  function realClick(T, i, st) {
    const cs = st.next && st.next.click; if (!cs) return false;
    const t = targetOf(st), el = t ? resolveEl(t) : null; let link = el;
    if (st.next.link) link = $(st.next.link, el) || el;
    if (!link) return false;
    const before = pageKey(), at = location.href, id = runId; runCleanup(true); saveTour(T.id, i + 1, true); navPending = Date.now();
    (async () => { await ensureView(link); if (!alive(id)) return; const [x, y] = aim(link); await cursorGo(x, y, id); await cursorPress(id); if (!alive(id)) return; link.click(); })();
    setTimeout(() => { const c = store.get(KT); if (pageKey() === before && location.href === at && c && c.i === i + 1 && !(cur && cur.tour === T.id && cur.stepI !== i)) tourStep(T, i + 1, 1); }, 5600);          // нажатие не привело к переходу (ссылки нет или она заблокирована) — продолжаем сами; время не зависит от темпа анимаций
    return true;
  }
  function tourMove(d) {
    const st = store.get(KT); if (!st) { hideSpot(true); return; } const T = tourById(st.id); if (!T) { hideSpot(true); return; }
    if (d > 0 && T.steps[st.i] && realClick(T, st.i, T.steps[st.i])) return;
    let i = st.i + d; if (i < 0) i = 0;
    tourStep(T, i, d < 0 ? -1 : 1);
  }

  /* ---------- переходы ---------- */
  function go(href, o) {
    o = o || {}; const h = cleanHref(href); if (!h) return false;
    if (o.show) store.set(KP, {show: o.show, t: Date.now()}); if (!o.keepTour && !(store.get(KT) || {}).nav) store.del(KT);
    if (S().isOpen && S().isOpen()) { if (mobile()) { if (S().close) S().close(true); } else store.set(KC, 1); }          // на телефоне чат занимает весь экран — убираем, чтобы была видна страница; на компьютере при обычной перезагрузке (файл с диском) он откроется снова
    hideSpot(true);
    const pgx = PAGES.find(p => p.href === h.path); if (pgx && pgx.id === pageKey() && !h.rest) { window.scrollTo({top: 0, behavior: 'smooth'}); setTimeout(resume, 60); return true; }          // уже на этой странице: просто наверх и продолжаем (так же и в автономной сборке с её роутером)
    if (A.showPage) { const u = new URL(h.href, 'http://x/'); A.showPage(u.pathname.replace(/^\//, ''), u.search, u.hash, true, false); return true; }          // автономная сборка: свой роутер
    let u; try { u = new URL(root() + h.href, location.href); } catch (e) { return false; }
    if (u.pathname === location.pathname && u.search === location.search && !u.hash) { window.scrollTo({top: 0, behavior: 'smooth'}); resume(); return true; }
    if (A.navigate) A.navigate(u.href, false); else location.href = u.href;
    return true;
  }
  /* фильтры каталога: на странице каталога — выставляем значения полей, на другой — открываем каталог уже с фильтрами */
  function filter(f) {
    f = String(f || ''); const reset = f === 'reset';
    if (pageKey() !== 'catalog') { return go('catalog.html' + (reset || !f ? '' : '?' + f.replace(/[^\w=&%.\-]/g, '')), {show: 'found'}); }
    if (S().close) S().close(true);
    const q = new URLSearchParams(reset ? '' : f); if (A.actions['cat-reset']) A.actions['cat-reset']();
    const map = {brand: '#f-brand', cat: '#f-cat', task: '#f-task', kind: '#f-kind'}; let set = 0;
    Object.keys(map).forEach(k => { const v = q.get(k), sel = $(map[k]); if (v && sel && Array.from(sel.options).some(o => o.value === v)) { sel.value = v; sel.dispatchEvent(new Event('change', {bubbles: true})); set++; } });
    const qs = q.get('q'), qe = $('#cat-q'); if (qs && qe) { qe.value = qs; qe.dispatchEvent(new Event('input', {bubbles: true})); set++; }
    setTimeout(() => { const cnt = $('#res-count'); show('found', {text: reset ? 'Фильтры сброшены — в каталоге все товары.' : set ? 'Готово! ' + (cnt ? cnt.textContent + '. ' : '') + 'Нажмите на карточку, чтобы открыть, или добавьте товары к сравнению — расскажу.' : 'Таких фильтров не нашлось — вот весь каталог.'}); }, 420);
    return true;
  }
  function scroll(to) { window.scrollTo({top: to === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'smooth'}); return true; }

  /* ---------- единая точка запуска действий (из чата, подсказок, ИИ) ---------- */
  function run(act, d) {
    d = d || {};
    switch (act) {
      case 'asst-go': return go(d.href, {show: d.show});
      case 'asst-show': return show(d.target, {});
      case 'asst-tour': return tour(d.tour);
      case 'asst-filter': return filter(d.f);
      case 'asst-scroll': return scroll(d.to);
      case 'asst-cmp-clear': if (A.actions['cmp-clear']) A.actions['cmp-clear'](); return true;
    }
    return false;
  }
  const dOf = t => { try { return JSON.parse(t.getAttribute('data-d') || '{}'); } catch (e) { return {}; } };
  ['asst-go', 'asst-show', 'asst-tour', 'asst-filter', 'asst-scroll', 'asst-cmp-clear'].forEach(a => { A.actions[a] = t => { run(a, dOf(t)); }; });
  A.actions['g-spot-x'] = () => { hideSpot(); };
  A.actions['g-tour-next'] = () => tourMove(1);
  A.actions['g-tour-prev'] = () => tourMove(-1);
  A.actions['g-tour-offer'] = () => { const c = store.get(KT), T = c && tourById(c.id), st = T && T.steps[c.i]; if (st && st.offer && OFFER[st.offer.do]) OFFER[st.offer.do](T, c.i, st); };
  A.actions['g-tour-cmp'] = () => { undo = []; undoT = []; store.del(KT); hideSpot(true); if (A.actions['cmp-ask']) A.actions['cmp-ask'](); };          // посетитель сам попросил рассказать об отмеченных товарах — они остаются в сравнении
  /* подсказки-вопросы: «Старт со Стеллой» (если включён продающий слой) — выделенная кнопка-ссылка на start.html, остальные — вопросы Стелле */
  const chipsHTML = (list, n) => (A.planChip ? A.planChip.list(list) : (list || [])).slice(0, n).map(c => (A.planChip && A.planChip.html(c)) || '<button class="chip" type="button" data-act="g-chip" data-q="' + esc(c) + '">' + esc(c) + '</button>').join('');
  A.actions['g-chip'] = t => { hideNudge(true); S().ask && S().ask(t.getAttribute('data-q') || ''); };
  A.actions['g-nudge-x'] = () => { hideNudge(true); store.set(KN, Object.assign(nstate(), {off: 1})); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#g-spot') && !$('#g-spot').hidden) hideSpot(); });
  /* окно (форма, быстрый просмотр) открылось поверх — подсветку убираем, чтобы не мешала */
  const modal = $('#modal'); if (modal) new MutationObserver(() => { if (modal.classList.contains('open')) { const s = $('#g-spot'); if (s && !s.hidden) hideSpot(true); hideNudge(); } }).observe(modal, {attributes: true, attributeFilter: ['class']});

  /* ---------- возврат после перехода ---------- */
  function afterLoad(fn, tries) {
    tries = tries || 0; const cu = document.getElementById('curtain'), busy = (cu && (cu.classList.contains('in') || cu.classList.contains('out'))) || document.body.classList.contains('x-intro');
    if (busy && tries < 40) { setTimeout(() => afterLoad(fn, tries + 1), 250 / speed()); return; } setTimeout(fn, 250 / speed());
  }
  function resume() {
    const pend = store.get(KP), tr = store.get(KT), reopen = store.get(KC);
    if (pend && Date.now() - pend.t < 60000) { store.del(KP); afterLoad(() => show(pend.show, {})); return; }
    if (pend) store.del(KP);
    if (tr && Date.now() - tr.t < 60000 && tr.nav) {
      const T = tourById(tr.id); if (!T) { store.del(KT); return; }
      const key = pageKey(); let j = -1; for (let k = tr.i; k < T.steps.length; k++) { if (stepMatches(T.steps[k], key)) { j = k; break; } }
      if (j >= 0) { afterLoad(() => tourStep(T, j, false)); return; }
      const first = T.steps[tr.i]; if (first && !isStatic(first.page) && !(S().isOpen && S().isOpen())) { saveTour(T.id, tr.i, true); return; }        // ждём нужную страницу
      store.del(KT);
    } else if (tr && !tr.nav) { store.del(KT); }
    if (reopen) { store.del(KC); afterLoad(() => { if (S().open && !pend && !tr) S().open(true); }); }
  }

  /* ---------- точки входа на страницах ---------- */
  function entryKey() { return pageKey(); }
  function mountEntry() {
    const key = entryKey(), cfg = G.entry && G.entry.pages && G.entry.pages[key]; if (!cfg || $('.g-entry')) return;
    let a = null; try { a = $(cfg.anchor); } catch (e) {} if (!a) return;
    const el = document.createElement('aside'); el.className = 'g-entry'; el.setAttribute('aria-label', 'Помощник Стелла'); el.setAttribute('data-style', (G.entry && G.entry.style) || 'strip');          // strip · slim · card
    el.innerHTML = '<span class="g-e-pe" aria-hidden="true">' + (A.pearl ? A.pearl('happy', true) : '') + '</span><div class="g-e-t"><b>' + esc(pickV(cfg.title)) + '</b><p>' + esc(pickV(cfg.text)) + '</p></div>' +
      '<div class="g-e-ch">' + chipsHTML(cfg.chips, 4) + '</div>' +
      '<button class="btn btn-fill btn-sm g-e-b" type="button" data-act="asst-open" data-track="guide_entry">Спросить Стеллу</button>';
    const pos = cfg.pos || 'after';
    if (pos === 'after') a.insertAdjacentElement('afterend', el);
    else if (pos === 'beforeSection') { const sec = a.closest('section'); (sec || a).insertAdjacentElement('beforebegin', el); }
    else a.insertAdjacentElement('beforebegin', el);
    requestAnimationFrame(() => el.classList.add('on'));
    if (cfg.hello) watchHello(el, cfg.hello);
  }
  /* Приветствие на главной — небольшое окно «от самого маскота» у жемчужинки в основной плашке Стеллы (слева от неё, а если места нет — над плашкой; хвостик указывает на маскота).
     Появляется, когда после вступления посетитель чуть прокрутил главную и плашка оказалась на экране; один раз за сессию. */
  let helloEl = null, helloT = 0;
  function watchHello(strip, h) {
    const st = nstate(); if (st.off || (st.seen && st.seen.hello)) return;
    const go = () => { if (strip.dataset.hello) return; strip.dataset.hello = '1'; setTimeout(() => { if (strip.isConnected && allowedHello()) showHello(strip, h); }, Math.round(500 / speed())); };
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, {threshold: .6}); io.observe(strip); } else go();
  }
  const allowedHello = () => { const b = document.body.classList; return !(document.hidden || b.contains('g-on') || b.contains('asst-open') || b.contains('locked') || b.contains('menu-open')); };
  function showHello(strip, h) {
    const wrap = document.createElement('div'), title = pickV(h.title), text = pickV(h.text);
    wrap.className = 'g-hello-w'; wrap.innerHTML = '<div class="g-hello" role="status"><b>' + esc(title) + '</b><p>' + esc(text) + '</p><button class="g-hello-x" type="button" data-act="g-hello-x" aria-label="Скрыть">' + I.close + '</button></div>';
    strip.appendChild(wrap); helloEl = wrap; wrap.setAttribute('data-side', strip.getBoundingClientRect().left >= 304 && innerWidth > 900 ? 'l' : 't');          // слева от жемчужинки, если слева есть поле, иначе над плашкой
    requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('on'); strip.classList.add('hey'); setTimeout(() => strip.classList.remove('hey'), 1600); }));
    const st = nstate(); st.seen = st.seen || {}; st.seen.hello = 1; store.set(KN, st); A.track && A.track('guide_nudge', {reason: 'hello', page: pageKey()});
    clearTimeout(helloT); helloT = setTimeout(hideHello, (h.showSec || 20) * 1000);
  }
  function hideHello(quick) { clearTimeout(helloT); const w = helloEl; helloEl = null; if (!w) return; w.classList.remove('on'); setTimeout(() => w.remove(), quick ? 80 : 420); }
  A.actions['g-hello-x'] = () => hideHello();
  new MutationObserver(() => { if (helloEl && !allowedHello()) hideHello(true); }).observe(document.body, {attributes: true, attributeFilter: ['class']});          // открыли чат, экскурсию или меню — окно убираем

  /* ---------- приветствие Стеллы (всплывающее окно) ----------
     Всплывающее окно у кнопки Стеллы есть только на главной (G.nudge.pages) и только одно: «Добро пожаловать» + чем Стелла может помочь.
     Показывается один раз за сессию, когда посетитель дошёл до самой страницы (вступление с баночкой закончилось), и никогда не перебивает: ни при открытом чате, ни в форме, ни во время экскурсии.
     На остальных страницах окон нет — там блок «Спросите Стеллу» прямо в странице и сама кнопка. */
  const NU = G.nudge || {}, WE = NU.welcome || {}, NPAGES = NU.pages || ['home'];
  const nstate = () => store.get(KN) || {n: 0, last: 0, off: 0, seen: {}};
  let nEl = null, tWel = 0, tRot = 0, readyAt = Date.now(), cmpT = 0;
  function nudgeDom() {
    if (nEl && nEl.isConnected) return nEl; nEl = document.createElement('div'); nEl.id = 'g-nudge'; nEl.className = 'g-nudge'; nEl.hidden = true; nEl.setAttribute('role', 'status'); document.body.appendChild(nEl);
    nEl.addEventListener('mouseenter', () => { clearTimeout(welcome.t); });          // пока читают — не убираем
    nEl.addEventListener('mouseleave', () => { if (!nEl.hidden) { clearTimeout(welcome.t); welcome.t = setTimeout(() => hideNudge(), 6000); } });
    return nEl;
  }
  function allowed() {
    if (NPAGES.indexOf(pageKey()) < 0) return false;          // только главная
    const st = nstate(), S_ = S(); if (st.off) return false;
    if (document.hidden || (S_.state && (S_.state().open || S_.state().interacted || S_.state().busy))) return false;
    const b = document.body.classList; if (b.contains('x-intro') || b.contains('locked') || b.contains('menu-open') || b.contains('asst-open') || b.contains('g-on')) return false;
    const m = $('#modal'); if (m && m.classList.contains('open')) return false;
    const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'asst-in') return false;          // человек что-то вводит — не отвлекаем
    return true;
  }
  const entryVisible = () => { const e = $('.g-entry'); if (!e) return false; const r = e.getBoundingClientRect(); return r.bottom > 40 && r.top < innerHeight - 40; };
  function welcome(force) {
    if (!WE.title || !allowed()) return false; const st = nstate(); if (st.seen && st.seen.welcome && !force) return false;
    const fab = $('#asst-fab'); if (!force && fab && (!fab.classList.contains('in') || fab.classList.contains('away'))) return false;          // кнопки Стеллы ещё нет (или она спрятана на вступлении) — приветствие было бы «в воздухе»
    const can = (WE.can || []).filter(Boolean), el = nudgeDom(); st.n = (st.n || 0) + 1; st.last = Date.now(); st.seen = st.seen || {}; st.seen.welcome = 1; store.set(KN, st);
    el.setAttribute('data-layout', NU.layout || 'bubble'); el.setAttribute('data-kind', 'welcome');
    el.innerHTML = '<span class="g-n-pe" aria-hidden="true">' + (A.pearl ? A.pearl('happy', true) : '') + '</span><div class="g-n-b"><b class="g-n-h">' + esc(WE.title) + '</b>' +
      '<button class="g-n-t" type="button" data-act="asst-open" data-track="guide_welcome" aria-label="' + esc(WE.title + ' ' + (WE.lead || '') + ' ' + can.join(', ') + '. Открыть чат со Стеллой') + '"><span class="g-n-lead">' + esc(WE.lead || '') + '</span>' +
      (can.length ? '<span class="g-n-rot" aria-hidden="true">' + can.map((t, i) => '<i' + (i ? '' : ' class="on"') + '>' + esc(t) + '</i>').join('') + '</span>' : '') + '</button>' +
      ((WE.chips || []).length ? '<div class="g-n-ch">' + chipsHTML(WE.chips, 3) + '</div>' : '') + '<button class="btn btn-fill btn-sm g-n-go" type="button" data-act="asst-open" data-track="guide_welcome_go">Спросить Стеллу</button></div>' +
      '<button class="g-n-x" type="button" data-act="g-nudge-x" aria-label="Скрыть">' + I.close + '</button>';
    el.hidden = false; void el.offsetWidth; el.classList.add('on'); S().hey && S().hey();
    A.track && A.track('guide_nudge', {reason: 'welcome', page: pageKey()});
    rotate(el); clearTimeout(welcome.t); welcome.t = setTimeout(() => hideNudge(), (WE.showSec || 24) * 1000);
    return true;
  }
  /* строка «могу …» меняется: помочь → подсказать → рассказать → показать (по кругу, пока окно открыто и на него не наведены) */
  function rotate(el) {
    clearInterval(tRot); const items = $$('.g-n-rot i', el); if (items.length < 2) return; let k = 0;
    tRot = setInterval(() => { if (el.hidden || !el.classList.contains('on') || el.matches(':hover')) return; items[k].classList.remove('on'); k = (k + 1) % items.length; items[k].classList.add('on'); }, (WE.rotateSec || 2.8) * 1000);
  }
  function hideNudge(quick) {
    hideHello(quick); clearInterval(tRot); const el = nEl; if (!el || el.hidden) return; clearTimeout(welcome.t); el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, quick ? 120 : 320);
  }
  let armN = 0;
  function arm() {
    armN++; clearTimeout(tWel); readyAt = Date.now();
    if (NPAGES.indexOf(pageKey()) < 0 || !WE.title) return;
    const delay = (WE.delaySec || 3) * 1000 / speed();
    const tick = () => { const st = nstate(); if (st.off || (st.seen && st.seen.welcome)) return; if (Date.now() - readyAt >= delay && welcome()) return; tWel = setTimeout(tick, Math.max(150, 800 / speed())); };
    tWel = setTimeout(tick, delay);
  }
  /* срок ожидания считаем от конца вступления: пока идёт баночка, окно не показываем, а если посетитель вернулся наверх — убираем */
  document.addEventListener('astreya:intro', e => { if (e.detail) hideNudge(true); else readyAt = Date.now(); });
  /* выбрали товары для сравнения — через несколько секунд слегка «пульсирует» плашка сравнения (без всплывающего окна) */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="cmp-toggle"], [data-act="qv-cmp"]'); if (!b) return;
    clearTimeout(cmpT); cmpT = setTimeout(() => { if ((S().cmpIds ? S().cmpIds() : []).length > 1) { const bar = $('#cmp-bar'); if (bar) { bar.classList.remove('g-ping'); void bar.offsetWidth; bar.classList.add('g-ping'); setTimeout(() => bar.classList.remove('g-ping'), 3200); } } }, ((NU.compareIdleSec || 4) * 1000) / speed());
  }, true);

  /* ---------- API и подключение к страницам ---------- */
  A.guide = {why: () => ({armN, allowed: allowed(), entryVisible: entryVisible(), state: nstate(), body: document.body.className, sinceReady: Date.now() - readyAt}), remount: () => { $$('.g-entry').forEach(e => e.remove()); mountEntry(); }, run, show, tour, go, filter, scroll, stop: () => { store.del(KT); hideSpot(true); }, nudge: welcome, welcome, hideNudge, targets: () => targetsOn(pageKey()), cleanHref};
  function init() { mountEntry(); arm(); resume(); }
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); hideSpot(true); hideNudge(true); init(); };
})();
