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
  const PAD = 8;
  function place() {
    spotRaf = 0; const s = $('#g-spot'); if (!s || s.hidden || !spotEl) return;
    if (cur && cur.free) { const hole = $('.g-hole', s), pop = $('.g-pop', s); hole.style.width = '0px'; hole.style.height = '0px'; if (mobile()) { pop.style.left = ''; pop.style.top = ''; pop.classList.add('sheet'); pop.classList.remove('sheet-top'); } else { pop.classList.remove('sheet'); pop.style.left = Math.round(innerWidth - (pop.offsetWidth || 320) - 24) + 'px'; pop.style.top = Math.round(innerHeight - (pop.offsetHeight || 160) - 96) + 'px'; } spotRaf = requestAnimationFrame(place); return; }
    if (!spotEl.isConnected || !shown(spotEl)) { const t = cur && cur.t, again = t ? resolveEl(t) : null; if (again) spotEl = again; else { if (navPending && Date.now() - navPending < 6000) hideSpot(true); else hideSpot(); return; } }          // цель пропала: если это переход, который начала сама экскурсия, — состояние экскурсии сохраняем
    const r = spotEl.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, hole = $('.g-hole', s), pop = $('.g-pop', s);
    const x = Math.max(4, r.left - PAD), y = Math.max(4, r.top - PAD), w = Math.min(vw - 8, r.width + PAD * 2), h = Math.min(Math.round(vh * .6), r.height + PAD * 2);          // очень большой блок подсвечиваем только в пределах экрана
    hole.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'; hole.style.width = Math.round(w) + 'px'; hole.style.height = Math.round(h) + 'px';
    if (mobile()) {
      pop.style.left = ''; pop.style.top = ''; pop.classList.add('sheet');
      const dock = document.body.classList.contains('dock-on') ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) || 66) : 0, ph = pop.offsetHeight || 200;
      const top = vh - (y + h) - dock < ph + 16 && y > ph + 16; pop.classList.toggle('sheet-top', top);          // внизу не хватает места (цель ниже или плашки в доке) — подсказка уходит наверх, цель остаётся видна
      const popTop = vh - ph - 12 - dock; if (!top && y + h > popTop - 6 && y < popTop - 70) hole.style.height = Math.round(popTop - 6 - y) + 'px';          // места нет ни сверху, ни снизу: подсвечиваем только ту часть, что не закрыта карточкой
    }
    else {
      pop.classList.remove('sheet'); const pw = pop.offsetWidth || 320, ph = pop.offsetHeight || 120; let top, below = y + h + 14, above = y - ph - 14;
      top = below + ph <= vh - 12 ? below : above >= 12 ? above : Math.max(12, vh - ph - 16);
      const left = Math.min(Math.max(12, x + w / 2 - pw / 2), vw - pw - 12);
      pop.style.left = Math.round(left) + 'px'; pop.style.top = Math.round(top) + 'px';
      pop.setAttribute('data-side', top === below ? 'b' : top === above ? 't' : 'f');
    }
    spotRaf = requestAnimationFrame(place);
  }
  function scrollTo(el) {
    for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) { if (n.id === 'hdr' || getComputedStyle(n).position === 'fixed') return; }          // шапка, меню и кнопка Стеллы закреплены на экране — страницу не прокручиваем
    const r = el.getBoundingClientRect(), vh = innerHeight, want = mobile() ? vh * .3 : vh * .38, hdr = 76;
    if (r.top >= hdr + 10 && r.bottom <= vh - (mobile() ? 190 : 24) && r.height < vh * .8) return;          // и так на виду
    const top = Math.max(0, Math.round(scrollY + r.top - Math.max(hdr + 16, Math.min(want, (vh - r.height) / 2))));
    window.scrollTo({top, behavior: 'smooth'});
  }
  /* прогресс экскурсии: «2 из 4 · этап» и четыре отрезка (пройденные заполнены, текущий — по шагам внутри этапа) */
  function progHTML(p) {
    let seg = ''; for (let k = 0; k < p.gn; k++) seg += '<i style="--p:' + (k < p.g ? 1 : k === p.g ? p.sub : 0) + '"></i>';
    return '<small class="g-st"><b>' + (p.g + 1) + ' из ' + p.gn + '</b>' + (p.label ? ' · ' + esc(p.label) : '') + '</small><span class="g-bar" aria-hidden="true">' + seg + '</span>';
  }
  /* cfg: {t: описание цели, text, tour, prog: {g, gn, sub, label}, buttons: [{l, act, d, primary}], free — без выделения элемента, noScroll, onClose} */
  function spot(el, cfg) {
    const s = spotDom(); spotEl = el; cur = cfg; onClose = cfg.onClose || null;
    const pop = $('.g-pop', s), fresh = s.hidden, hole = $('.g-hole', s); if (fresh) hole.classList.add('g-nt'); $('.g-pe', s).innerHTML = A.pearl ? A.pearl('talk', true) : '';          // первое появление — сразу на месте, без «вылета» из угла
    $$('.g-pulse').forEach(e => { if (e !== el) e.classList.remove('g-pulse'); });
    $('.g-tx', s).innerHTML = '<p>' + bold(cfg.text || '') + '</p>' + (cfg.prog ? progHTML(cfg.prog) : '');
    const bt = (cfg.buttons || []).map(b => '<button class="btn ' + (b.primary ? 'btn-fill' : b.act === 'asst-open' || b.act === 'g-spot-x' ? 'btn-lnk' : 'btn-ghost') + ' btn-sm" type="button" data-act="' + esc(b.act) + '"' + (b.d ? ' data-d="' + esc(JSON.stringify(b.d)) + '"' : '') + '>' + esc(b.l) + '</button>').join('');
    $('.g-ctl', s).innerHTML = bt; s.hidden = false; document.body.classList.add('g-on');
    pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
    if (!cfg.noScroll && !cfg.free) scrollTo(el); cancelAnimationFrame(spotRaf); spotRaf = requestAnimationFrame(place); if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => hole.classList.remove('g-nt')));
    const f = $('.g-ctl .btn-fill', s); if (f) { try { f.focus({preventScroll: true}); } catch (e) {} }
    A.track && A.track('guide_spot', {target: cfg.t ? cfg.t.id : '', tour: cfg.tour || ''});
  }
  function hideSpot(silent, keep) {
    if (!keep) { runCleanup(true); menuRelease(); }
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
      const el = resolveEl(t); if (!el) { A.toast && A.toast(t.label + ': на этой странице не нашёл — вот что есть: ' + (targetsOn(pageKey()).slice(0, 3).map(x => x.label).join(', ') || 'меню')); return false; }
      if (S().close && !o.keepChat) S().close(true);
      spot(el, {t, text: o.text || t.say || t.label, buttons: [{l: 'Понятно', act: 'g-spot-x', primary: true}, {l: 'Спросить Стеллу', act: 'asst-open'}]});
      if (o.pulse !== false) pulse(el);
      return true;
    };
    if (wait) { setTimeout(go, wait); return true; } return go();
  }
  function pulse(el) { el.classList.remove('g-pulse'); void el.offsetWidth; el.classList.add('g-pulse'); setTimeout(() => el.classList.remove('g-pulse'), 2600); }

  /* ---------- экскурсия «Покажи сайт» ----------
     Шаги — в data/stella/guide.json → tours[site].steps: {g — номер этапа (их четыре), page — на какой странице шаг, target — id из targets, say — текст Стеллы,
     do — действие, которое Стелла выполняет на странице сама (brand-open, type-search, pick-task), pre — текст, пока действие идёт,
     next — {l, click}: кнопка «Далее» с настоящим нажатием на ссылку/карточку (переход на другую страницу), offer — предложение попробовать (только по нажатию посетителя),
     chrome — цель в шапке: шапка закрепляется на виду, на узких экранах сам раскрывается ящик меню; final — финальный шаг с предложением, что делать дальше}.
     Экскурсия НИКОГДА не запускается сама: только по просьбе посетителя («Покажи сайт» в панели Стеллы). Корзину и заявки она не трогает. */
  const tourById = id => TOURS.find(t => t.id === id) || null;
  const stepMatches = (st, key) => st.page === 'any' || st.page === key;
  const isStatic = page => PAGES.some(p => p.id === page);
  const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? v[k] : m);
  const targetOf = st => (TARGETS[st.page === 'any' ? '*' : st.page] || []).concat(TARGETS['*'] || []).find(x => x.id === st.target) || findTarget(st.target);
  function saveTour(id, i, nav) { store.set(KT, {id, i, t: Date.now(), nav: nav ? 1 : 0}); }
  /* то, что экскурсия временно изменила на странице (набранный запрос, фильтр, раскрытая карточка бренда, отмеченные для сравнения товары), возвращается назад */
  let undo = [], undoT = [], demoTimer = 0;          // undo — на время шага; undoT — на время всей экскурсии на странице (набранный запрос и фильтр остаются, пока показываем карточки)
  function runCleanup(all) { clearTimeout(demoTimer); demoTimer = 0; const l = undo.concat(all ? undoT : []); undo = []; if (all) undoT = []; l.forEach(fn => { try { fn(); } catch (e) {} }); }
  const later = (fn, ms) => { demoTimer = setTimeout(fn, Math.round(ms / speed())); };
  const prog = (T, i) => { if (!T.groups) return {g: i, gn: T.steps.length, sub: 1, label: ''}; const st = T.steps[i], g = st.g || 0, ids = T.steps.map((x, k) => (x.g || 0) === g ? k : -1).filter(k => k >= 0); return {g, gn: (T.groups || []).length || 1, sub: (ids.indexOf(i) + 1) / ids.length, label: (T.groups || [])[g] || ''}; };

  /* действия, которые Стелла выполняет на странице сама — они безопасны и обратимы (ничего не отправляется, корзина и заявки не затрагиваются) */
  const DO = {
    'brand-open'(st, el, ctx) {                                                    // раскрыть карточку первого бренда на главной
      const c = el.matches && el.matches('.bcard') ? el : $('.bcard[data-act="brand-card"]', el); if (!c || c.classList.contains('is-active')) return;
      later(() => { c.click(); undo.push(() => { if (A.actions['brand-back']) A.actions['brand-back'](); }); demoTimer = setTimeout(() => scrollTo(c), 800); }, 700);          // карточка при раскрытии сама подъезжает к краю экрана — возвращаем её в удобное место
    },
    'type-search'(st, el, ctx) {                                                   // набрать название реального товара в поиске каталога
      const q = $('#cat-q'), p = (D.products || [])[0]; if (!q || !p) return;
      const word = String(p.name || '').split(/\s+/)[0], total = (D.products || []).length; let k = 0;
      q.value = ''; undoT.push(() => { if (A.actions['cat-reset']) A.actions['cat-reset'](); });
      const tick = () => {
        q.value = word.slice(0, ++k); q.dispatchEvent(new Event('input', {bubbles: true}));
        if (k < word.length) { later(tick, 95); return; }
        demoTimer = setTimeout(() => { const m = /(\d+)\D+(\d+)/.exec(($('#res-count') || {}).textContent || ''); ctx.say({q: word, n: m ? m[1] : '?', total: m ? m[2] : total}); }, 420);          // поиск срабатывает с небольшой задержкой — ждём её в реальном времени
      };
      later(tick, 600);
    },
    'pick-task'(st, el, ctx) {                                                     // выбрать назначение в фильтре каталога
      const sel = $('#f-task'); if (!sel) return; const opt = Array.from(sel.options).find(o => o.value === 'pigment') || Array.from(sel.options).find(o => o.value !== 'all'); if (!opt) return;
      if (A.actions['cat-reset']) A.actions['cat-reset'](); undoT.push(() => { if (A.actions['cat-reset']) A.actions['cat-reset'](); });
      later(() => {
        sel.value = opt.value; sel.dispatchEvent(new Event('change', {bubbles: true}));
        demoTimer = setTimeout(() => { const m = /(\d+)\D+(\d+)/.exec(($('#res-count') || {}).textContent || ''); ctx.say({task: opt.textContent.trim(), n: m ? m[1] : '?', total: m ? m[2] : '?'}); }, 380);
      }, 650);
    }
  };
  /* «попробовать» — действие, которое меняет состояние (отметка товаров для сравнения): выполняется только по явному нажатию посетителя и откатывается */
  const OFFER = {
    'cmp-demo'(T, i, st) {
      const cards = $$('.pcard:not([hidden])').filter(shown).slice(0, 2), ids = cards.map(c => c.getAttribute('data-id')).filter(Boolean); if (ids.length < 2 || !A.actions['cmp-toggle']) return false;
      let have = []; try { have = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); } catch (e) {}
      const added = ids.filter(id => have.indexOf(id) < 0); added.forEach(id => A.actions['cmp-toggle'](null, id));
      undo.push(() => { let cur = []; try { cur = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); } catch (e) {} added.forEach(id => { if (cur.indexOf(id) >= 0) A.actions['cmp-toggle'](null, id); }); });
      later(() => {
        const bar = $('#cmp-bar'); if (!bar || bar.hidden) return;
        spot(bar, {t: {id: 'compare-bar'}, tour: T.id, prog: prog(T, i), text: st.offer.say || 'Готово: два товара отмечены. Нажмите «Попросить Стеллу рассказать» — расскажу, чем они отличаются.',
          buttons: [{l: 'Далее', act: 'g-tour-next', primary: true}, {l: 'Рассказать о товарах', act: 'g-tour-cmp'}, {l: 'Пропустить', act: 'g-spot-x'}], onClose: () => { runCleanup(true); store.del(KT); }});
      }, 450);
      return true;
    }
  };

  function tour(id, from) {
    const T = tourById(id); if (!T || !(T.steps || []).length) return false; hideNudge(); runCleanup(true);
    const key = pageKey(); let i = typeof from === 'number' ? from : T.start === 'first' ? 0 : T.steps.findIndex(s => stepMatches(s, key)); if (i < 0) i = 0;
    return tourStep(T, i, 1);
  }
  const RETRY = 12;          // сколько раз (≈ 0,2 с каждый) ждём, пока нужный элемент появится на странице
  function tourStep(T, i, dir) {
    dir = dir || 1; const key = pageKey(), n = T.steps.length;
    if (i >= n) { tourEnd(T, true); return true; } if (i < 0) i = 0;
    const st = T.steps[i];
    if (!stepMatches(st, key)) {                                                       // шаг относится к другой странице — переходим и продолжаем после загрузки
      const pg = PAGES.find(p => p.id === st.page);
      if (pg) { runCleanup(true); saveTour(T.id, i, true); go(pg.href, {keepTour: true}); return true; }
      saveTour(T.id, i, true); hintWaitPage(T, i, st); return true;                    // страница-«лист» (товар, мероприятие): ждём, пока посетитель её откроет
    }
    runCleanup();
    const t = targetOf(st);
    if (!t && !st.final) return tourStep(T, i + dir, dir);
    const wait = st.chrome ? menuHold(!!st.drawer) : (menuRelease(), t ? prepFilters(t) : 0);
    const run = tries => {
      const el = t ? resolveEl(t) : null;
      if (!el && !st.final) { if (tries < RETRY) { setTimeout(() => run(tries + 1), Math.round(220 / speed())); return; } return tourStep(T, i + dir, dir); }          // элемент так и не появился или скрыт — безопасно пропускаем шаг
      if (S().close) S().close(true);
      const last = i >= n - 1; saveTour(T.id, i, false);
      const say = v => { const p = $('#g-spot .g-tx p'); if (p && cur && cur.stepI === i && cur.tour === T.id) p.innerHTML = bold(fill(st.say, v)); };
      const buttons = [].concat(i > 0 ? [{l: 'Назад', act: 'g-tour-prev'}] : []);
      if (st.final) buttons.push({l: 'Открыть каталог', act: 'asst-go', d: {href: 'catalog.html'}, primary: true}, {l: 'Подобрать по задаче', act: 'asst-go', d: {href: 'catalog.html', show: 'task-filter'}}, {l: 'Спросить Стеллу', act: 'asst-open'}, {l: 'Закрыть', act: 'g-spot-x'});
      else buttons.push({l: st.next && st.next.l || (last ? 'Готово' : 'Далее'), act: 'g-tour-next', primary: true}, ...(st.offer ? [{l: st.offer.l, act: 'g-tour-offer'}] : []), {l: 'Пропустить', act: 'g-spot-x'});
      if (el && st.view) { const v = $(st.view); if (v) { const top = Math.max(0, Math.round(scrollY + v.getBoundingClientRect().top - 76)); window.scrollTo({top, behavior: 'smooth'}); } }          // «показать с начала»: главная — с первого экрана
      spot(el || document.body, {t: t || {id: 'free'}, tour: T.id, stepI: i, prog: prog(T, i), text: st.do && st.pre ? st.pre : fill(st.say, {}), buttons, free: !el, noScroll: !!st.view, onClose: () => { runCleanup(true); store.del(KT); }});
      if (el) pulse(el);
      if (st.do && DO[st.do] && el) DO[st.do](st, el, {say});
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
  /* «Далее» с настоящим нажатием: Стелла сама нажимает на ссылку меню или на карточку товара — так же, как это сделал бы посетитель */
  function realClick(T, i, st) {
    const cs = st.next && st.next.click; if (!cs) return false;
    const t = targetOf(st), el = t ? resolveEl(t) : null; let link = el;
    if (st.next.link) link = $(st.next.link, el) || el;
    if (!link) return false;
    const before = pageKey(), at = location.href; runCleanup(true); saveTour(T.id, i + 1, true); navPending = Date.now();
    link.click();
    setTimeout(() => { const c = store.get(KT); if (pageKey() === before && location.href === at && c && c.i === i + 1 && !(cur && cur.tour === T.id && cur.stepI !== i)) tourStep(T, i + 1, 1); }, 3600);          // нажатие не привело к переходу (ссылки нет или она заблокирована) — продолжаем сами; время не зависит от темпа анимаций
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
    el.innerHTML = '<span class="g-e-pe" aria-hidden="true">' + (A.pearl ? A.pearl('happy', true) : '') + '</span><div class="g-e-t"><b>' + esc(cfg.title) + '</b><p>' + esc(cfg.text) + '</p></div>' +
      '<div class="g-e-ch">' + (cfg.chips || []).slice(0, 4).map(c => '<button class="chip" type="button" data-act="g-chip" data-q="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<button class="btn btn-fill btn-sm g-e-b" type="button" data-act="asst-open" data-track="guide_entry">Спросить Стеллу</button>';
    const pos = cfg.pos || 'after';
    if (pos === 'after') a.insertAdjacentElement('afterend', el);
    else if (pos === 'beforeSection') { const sec = a.closest('section'); (sec || a).insertAdjacentElement('beforebegin', el); }
    else a.insertAdjacentElement('beforebegin', el);
    requestAnimationFrame(() => el.classList.add('on'));
  }

  /* ---------- проактивная подсказка ---------- */
  const NU = G.nudge || {}, TR = NU.triggers || {}, MAXN = NU.max || 3, COOL = (NU.cooldownSec || 45) * 1000;
  const nstate = () => store.get(KN) || {n: 0, last: 0, off: 0, seen: {}};
  let nEl = null, tDwell = 0, tIdle = 0, lastAct = Date.now(), pageAt = Date.now(), scrollDone = false, exitDone = false, cmpT = 0;
  function nudgeDom() {
    if (nEl && nEl.isConnected) return nEl; nEl = document.createElement('div'); nEl.id = 'g-nudge'; nEl.className = 'g-nudge'; nEl.hidden = true; nEl.setAttribute('role', 'status'); document.body.appendChild(nEl); return nEl;
  }
  function allowed(force) {
    const pgOff = NU.pages && NU.pages[pageKey()] && NU.pages[pageKey()].off; if (pgOff) return false;          // на странице стартового подбора подсказка «Не знаете, что выбрать?» не нужна: человек уже выбирает
    const st = nstate(), S_ = S(); if (st.off || st.n >= MAXN || (!force && Date.now() - st.last < COOL)) return false;
    if (document.hidden || (S_.state && (S_.state().open || S_.state().interacted || S_.state().busy))) return false;
    const b = document.body.classList; if (b.contains('x-intro') || b.contains('locked') || b.contains('menu-open') || b.contains('asst-open') || b.contains('g-on')) return false;
    const m = $('#modal'); if (m && m.classList.contains('open')) return false;
    const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'asst-in') return false;          // человек что-то вводит — не отвлекаем
    return true;
  }
  function nudgeCfg(reason) {
    const key = pageKey(), pg = (NU.pages && NU.pages[key]) || {};
    const base = {text: pg.text || NU.text, chips: pg.chips || []};
    if (reason === 'compare') { const n = (S().cmpIds ? S().cmpIds() : []).length; return {text: n > 1 ? 'Выбрали ' + n + ' товара? Нажмите плашку «' + ((G.compare && G.compare.plate) || 'Попросить Стеллу рассказать') + '» — расскажу, чем они отличаются.' : 'Добавьте ещё один товар — и я сравню их по данным сайта.', chips: [], pointer: n > 1}; }
    if (reason === 'empty') return {text: 'Ничего не нашлось? Опишите задачу своими словами — подберу из каталога.', chips: ['Подобрать по задаче', 'Покажи весь каталог']};
    if (reason === 'exit') return {text: base.text, chips: base.chips};
    return base;
  }
  /* force — для событий, вызванных самим посетителем (выбрал товары, пустой поиск): обычную паузу между подсказками не ждём */
  const entryVisible = () => { const e = $('.g-entry'); if (!e) return false; const r = e.getBoundingClientRect(); return r.bottom > 40 && r.top < innerHeight - 40; };          // блок «Спросите Стеллу» уже на экране — повторять то же пузырём незачем
  function nudge(reason, force) {
    if (!allowed(force) || (!force && entryVisible())) return false; const cfg = nudgeCfg(reason), st = nstate(), key = pageKey() + ':' + reason; if (st.seen && st.seen[key] && !force) return false;
    const el = nudgeDom(); st.n++; st.last = Date.now(); st.seen = st.seen || {}; st.seen[key] = 1; store.set(KN, st);
    el.setAttribute('data-layout', NU.layout || 'bubble');          // bubble — пузырь с кнопками-вопросами · pill — одна строка · card — карточка (выбирает арена: tools/arena-stella.js)
    el.innerHTML = '<span class="g-n-pe" aria-hidden="true">' + (A.pearl ? A.pearl('happy', true) : '') + '</span><div class="g-n-b"><button class="g-n-t" type="button" data-act="asst-open" data-track="guide_nudge_' + esc(reason) + '">' + esc(cfg.text) + '</button>' +
      ((cfg.chips || []).length ? '<div class="g-n-ch">' + cfg.chips.slice(0, 3).map(c => '<button class="chip" type="button" data-act="g-chip" data-q="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' : '') + '<button class="btn btn-fill btn-sm g-n-go" type="button" data-act="asst-open" data-track="guide_nudge_go">Спросить Стеллу</button></div>' +
      '<button class="g-n-x" type="button" data-act="g-nudge-x" aria-label="Скрыть подсказку">' + I.close + '</button>';
    el.hidden = false; void el.offsetWidth; el.classList.add('on'); S().hey && S().hey();
    A.track && A.track('guide_nudge', {reason, page: pageKey()});
    if (cfg.pointer) { const bar = $('#cmp-bar'); if (bar) { bar.classList.remove('g-ping'); void bar.offsetWidth; bar.classList.add('g-ping'); setTimeout(() => bar.classList.remove('g-ping'), 3200); } }
    clearTimeout(nudge.t); nudge.t = setTimeout(() => hideNudge(), 14000);
    return true;
  }
  function hideNudge(quick) {
    const el = nEl; if (!el || el.hidden) return; clearTimeout(nudge.t); el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, quick ? 120 : 320);
  }
  let armN = 0;
  function arm() {
    armN++; clearTimeout(tDwell); clearTimeout(tIdle); pageAt = Date.now(); scrollDone = false; exitDone = false;
    const key = pageKey(); if (key === 'notfound' || key === 'privacy' || key === 'terms') return;
    tDwell = setTimeout(function again() { const st = nstate(); if (st.off || st.n >= MAXN || (st.seen && st.seen[pageKey() + ':dwell'])) return; if (!nudge('dwell')) tDwell = setTimeout(again, 8000 / speed()); }, (TR.dwellSec || 20) * 1000 / speed());
    const idleTick = () => { const st = nstate(); if (st.off || st.n >= MAXN || (st.seen && st.seen[pageKey() + ':idle'])) return; if (Date.now() - lastAct >= (TR.idleSec || 14) * 1000 / speed() && Date.now() - pageAt > 8000 / speed()) { if (nudge('idle')) return; } tIdle = setTimeout(idleTick, 4000 / speed()); };
    tIdle = setTimeout(idleTick, (TR.idleSec || 14) * 1000 / speed());
  }
  ['pointermove', 'keydown', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, () => { lastAct = Date.now(); }, {passive: true}));
  addEventListener('scroll', () => {
    lastAct = Date.now(); if (scrollDone) return; const h = document.documentElement.scrollHeight - innerHeight; if (h > 600 && scrollY / h >= (TR.scroll || .45) && Date.now() - pageAt > 6000 / speed()) { scrollDone = true; nudge('scroll'); }
  }, {passive: true});
  document.addEventListener('mouseout', e => { if (!TR.exitIntent || exitDone || mobile() || e.relatedTarget || e.clientY > 4) return; if (Date.now() - pageAt < 10000 / speed()) return; exitDone = true; nudge('exit'); });
  /* выбрали товары для сравнения — через несколько секунд подсказываем плашку */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="cmp-toggle"], [data-act="qv-cmp"]'); if (!b) return;
    clearTimeout(cmpT); cmpT = setTimeout(() => { if ((S().cmpIds ? S().cmpIds() : []).length >= 1) nudge('compare', true); }, (TR.compareIdleSec || 4) * 1000 / speed());
  }, true);
  function watchEmpty() {
    const em = $('#cat-empty'); if (!em || em._g) return; em._g = 1; new MutationObserver(() => { if (!em.hidden) setTimeout(() => { if (!em.hidden) nudge('empty', true); }, 1200 / speed()); }).observe(em, {attributes: true, attributeFilter: ['hidden']});
  }

  /* ---------- API и подключение к страницам ---------- */
  A.guide = {why: () => ({armN, allowed: allowed(), entryVisible: entryVisible(), state: nstate(), body: document.body.className, lastAct: Date.now() - lastAct, sincePage: Date.now() - pageAt}), remount: () => { $$('.g-entry').forEach(e => e.remove()); mountEntry(); }, run, show, tour, go, filter, scroll, stop: () => { store.del(KT); hideSpot(true); }, nudge, hideNudge, targets: () => targetsOn(pageKey()), cleanHref};
  function init() { mountEntry(); arm(); watchEmpty(); resume(); }
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); hideSpot(true); hideNudge(true); init(); };
})();
