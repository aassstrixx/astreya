/* Astreya — поведение страниц: каталог (фильтры, сортировка, URL), бренды, обучение, новости, главная (сетка брендов, подбор),
   калькулятор скидок, страница поиска. Страницы уже отрисованы генератором; здесь только интерактив поверх готовой разметки. */
(function () {
  'use strict';
  const A = window.Astreya, {$, $$, D, I, esc} = A;
  const today = () => new Date().toISOString().slice(0, 10);
  const setOn = (box, id, attr) => $$('.chip', box).forEach(c => { const on = c.getAttribute(attr || 'data-id') === id; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
  /* query/URL можно подменить (A.query / A.writeQuery) — так работает автономная сборка без настоящих адресов */
  const params = () => A.query ? A.query() : new URLSearchParams(location.search);
  const writeUrl = p => { if (A.writeQuery) { A.writeQuery(p); return; } try { const s = p.toString(); history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) {} };
  const debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; };
  const brandName = id => (D.brands.find(b => b.id === id) || {}).name || id;
  const catName = id => (D.cats.find(c => c.id === id) || {}).name || id;
  const taskName = id => (D.tasks.find(t => t.id === id) || {}).label || id;
  const kindName = id => (D.kinds.find(k => k.id === id) || {}).name || id;

  /* ---------- все страницы: прошедшие мероприятия скрываются (если не все прошли) ---------- */
  A.pages._all = function (root) {
    $$('.events-grid', root).forEach(g => {
      const cards = $$('[data-date]', g), fut = cards.filter(c => c.getAttribute('data-date') >= today());
      if (fut.length && fut.length < cards.length) cards.forEach(c => { if (c.getAttribute('data-date') < today()) c.hidden = true; });
    });
  };

  /* ---------- главная: сетка брендов, подбор по задаче ---------- */
  let activeBrand = null;
  function setBrand(id) {
    const g = $('#bgrid'); if (!g) return;
    activeBrand = id;
    const cards = $$('.bcard', g), a = id && cards.find(c => c.getAttribute('data-id') === id), ar = a && a.getBoundingClientRect();
    if (ar) cards.forEach(c => { const r = c.getBoundingClientRect(); c.style.setProperty('--dist', Math.min(4, Math.hypot((r.left - ar.left) / ar.width, (r.top - ar.top) / ar.height)).toFixed(2)); });
    g.classList.toggle('has-active', !!id);
    cards.forEach(c => { const on = c.getAttribute('data-id') === id; c.classList.toggle('is-active', on); c.setAttribute('aria-expanded', String(on)); if (on) c.scrollIntoView({block: 'nearest', behavior: 'smooth'}); });
  }
  A.actions['brand-card'] = (t, id, e) => { if (e.target.closest('a[href]') && t.contains(e.target.closest('a[href]'))) return; setBrand(activeBrand === id ? null : id); };
  A.actions['brand-back'] = () => setBrand(null);
  A.actions.pick = (t, id) => {
    const box = $('#picker'); if (!box) return;
    setOn(box, id);
    $$('.pick-out', box).forEach(p => { p.hidden = p.getAttribute('data-pick') !== id; if (!p.hidden) { p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); } });
    A.track('picker_select', {task: id});
  };
  document.addEventListener('click', e => {
    if (activeBrand && !(e.target.closest && (e.target.closest('.bgrid') || e.target.closest('[data-act="brand-card"]')))) setBrand(null);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeBrand) { setBrand(null); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('bcard')) { e.preventDefault(); setBrand(activeBrand === e.target.getAttribute('data-id') ? null : e.target.getAttribute('data-id')); }
  });
  A.pages.home = () => { activeBrand = null; };

  /* ---------- каталог ---------- */
  A.pages.catalog = function () {
    const grid = $('#cat-grid'); if (!grid) return;
    const cards = $$('.pcard', grid), total = cards.length;
    const el = {brand: $('#f-brand'), cat: $('#f-cat'), task: $('#f-task'), kind: $('#f-kind'), sort: $('#f-sort')}, qEl = $('#cat-q');
    const S = {brand: 'all', cat: 'all', task: 'all', kind: 'all', sort: 'def', q: ''};
    const p0 = params();
    ['brand', 'cat', 'task', 'kind', 'sort'].forEach(k => { const v = p0.get(k), sel = el[k]; if (v && sel && Array.from(sel.options).some(o => o.value === v)) S[k] = v; });
    S.q = p0.get('q') || '';
    const order = cards.slice();
    const cmp = {
      new: (a, b) => (b.dataset.new - a.dataset.new) || (a.dataset.idx - b.dataset.idx),
      az: (a, b) => a.dataset.name.localeCompare(b.dataset.name, 'ru'),
      brand: (a, b) => brandName(a.dataset.brand).localeCompare(brandName(b.dataset.brand), 'ru') || (a.dataset.idx - b.dataset.idx),
      def: (a, b) => a.dataset.idx - b.dataset.idx
    };
    function apply(push) {
      const gal = push && A.gallery ? A.gallery.begin(grid, cards) : null;      // витрина (js/gallery.js): запоминает положения карточек до смены фильтра — и плавно переставляет их после
      const toks = A.tokens(S.q);
      let n = 0;
      cards.forEach(c => {
        const ok = (S.brand === 'all' || c.dataset.brand === S.brand) && (S.cat === 'all' || c.dataset.cat === S.cat) && (S.kind === 'all' || c.dataset.kind === S.kind) &&
          (S.task === 'all' || c.dataset.tasks.split(' ').indexOf(S.task) !== -1) && toks.every(t => c.dataset.q.indexOf(t) !== -1);
        c.hidden = !ok; if (ok) n++;
      });
      order.slice().sort(cmp[S.sort] || cmp.def).forEach(c => grid.appendChild(c));
      const active = ['brand', 'cat', 'task', 'kind'].filter(k => S[k] !== 'all');
      const filtered = active.length > 0 || S.q.trim() !== '';
      $('#res-count').textContent = `Найдено: ${n} из ${total}`;
      $('#cat-reset').hidden = !filtered;
      $('#cat-empty').hidden = n > 0;
      const badge = $('#f-badge'); badge.textContent = active.length; badge.hidden = !active.length;
      $$('.cat-tile').forEach(t => { const on = t.getAttribute('data-id') === S.cat; t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); });
      Object.keys(el).forEach(k => { if (el[k].value !== S[k]) el[k].value = S[k]; });
      const af = $('#active-filters');
      af.hidden = !active.length;
      af.innerHTML = active.map(k => { const name = k === 'brand' ? brandName(S[k]) : k === 'cat' ? catName(S[k]) : k === 'task' ? taskName(S[k]) : kindName(S[k]);
        return `<button type="button" class="chip on" data-act="cat-clear" data-id="${k}" aria-label="Убрать фильтр: ${esc(name)}">${esc(name)} ${I.close}</button>`; }).join('');
      if (push) { const p = new URLSearchParams(); ['brand', 'cat', 'task', 'kind'].forEach(k => { if (S[k] !== 'all') p.set(k, S[k]); }); if (S.sort !== 'def') p.set('sort', S.sort); if (S.q.trim()) p.set('q', S.q.trim()); writeUrl(p); }
      if (A.showroom) A.showroom.sync(!!push);                                  // шоурум (js/showroom.js): сцена с подиумами и панель фильтров слева читают то же состояние
      if (gal) gal.end();
    }
    Object.keys(el).forEach(k => el[k].addEventListener('change', () => { S[k] = el[k].value; apply(true); A.track('catalog_filter', {filter: k, value: S[k]}); }));
    qEl.value = S.q;
    qEl.addEventListener('input', debounce(() => { S.q = qEl.value; apply(true); }, 140));
    A.actions['cat-tile'] = (t, id) => { S.cat = S.cat === id ? 'all' : id; apply(true); const r = $('#results'); if (r && !r.closest('.shw-aside')) r.scrollIntoView({behavior: 'smooth', block: 'start'}); };
    A.actions['cat-clear'] = (t, id) => { S[id] = 'all'; apply(true); };
    A.actions['cat-reset'] = () => { S.brand = S.cat = S.task = S.kind = 'all'; S.q = ''; qEl.value = ''; apply(true); };
    A.actions.filters = t => { const tb = t.closest('.toolbar'), open = tb.classList.toggle('filters-open'); t.setAttribute('aria-expanded', String(open)); };
    if (['brand', 'cat', 'task', 'kind'].some(k => S[k] !== 'all')) { const tb = $('#results'); if (tb && innerWidth <= 900) { tb.classList.add('filters-open'); $('.filters-toggle', tb).setAttribute('aria-expanded', 'true'); } }
    apply(false);
  };

  /* ---------- бренды ---------- */
  /* ---------- бренды: единая витрина-стена (css/brands-wall.css, src/pages/brands.js → brandsWall) ----------
     Ниши — кнопки: наведение подсвечивает нишу (класс is-hov), нажатие выделяет её и открывает панель бренда под стеной (панели собраны на странице заранее из data/*.json). Фильтр по задаче и поиск не прячут ниши, а приглушают лишние
     (стена остаётся целой); «Бренд под вашу задачу» работает от того же состояния. Esc и «Закрыть» возвращают общую экспозицию. */
  function brandsWallPage() {
    const page = $('[data-bw]'), sec = $('.bw', page), niches = $$('.bw-n', page), strip = $$('.bw-strip li', page), qEl = $('#br-q'), empty = $('#br-empty'), panel = $('#bw-panel'), box = $('.bw-tasks', page), scroller = $('[data-bw-scroll]'), stage = $('[data-bw-stage]');
    let task = 'all', sel = '';
    const byId = id => niches.find(n => n.dataset.id === id), pns = $$('.bw-pn', panel), holes = $$('.bw-hole', page), dim = $('.bw-dim', page);
    function apply() {
      const toks = A.tokens(qEl.value); let n = 0;
      niches.forEach(li => { const ok = (task === 'all' || li.dataset.tasks.split(' ').indexOf(task) !== -1) && toks.every(t => li.dataset.q.indexOf(t) !== -1); li.classList.toggle('is-off', !ok); if (ok) n++; const s = strip.find(x => x.dataset.id === li.dataset.id); if (s) s.classList.toggle('is-off', !ok); });
      empty.hidden = n > 0; setOn($('#br-tasks'), task); setOn($('#bw-task-chips'), task === 'all' ? '__none' : task);
      $$('.bw-tr', box).forEach(u => { u.hidden = u.dataset.task !== task; }); box.classList.toggle('has-res', task !== 'all'); paintFocus();
    }
    /* затемнение стены: при выборе бренда или фильтре стена и лишние ниши слегка темнеют (слой .bw-dim с «окнами» по аркам подходящих ниш), подходящие остаются светлыми и подсвечены */
    function paintFocus() {
      const filt = niches.some(n => n.classList.contains('is-off')), set = sel ? [sel] : filt ? niches.filter(n => !n.classList.contains('is-off')).map(n => n.dataset.id) : [], on = !!(sel || filt);
      sec.classList.toggle('has-filter', filt);
      if (dim) dim.classList.toggle('on', on);
      holes.forEach(h => h.classList.toggle('on', set.indexOf(h.dataset.id) !== -1));
      niches.forEach(n => n.classList.toggle('is-dim', on && set.indexOf(n.dataset.id) === -1));
    }
    const wallBottom = () => stage.getBoundingClientRect().bottom + (window.scrollY || 0);
    function show(id, opts) {
      sel = id || ''; const open = !!sel, quiet = !!(opts && opts.quiet);
      niches.forEach(li => { const on = li.dataset.id === sel; li.classList.toggle('is-sel', on); const b = $('.bw-hit', li); if (b) b.setAttribute('aria-expanded', String(on)); });
      strip.forEach(li => li.classList.toggle('is-sel', li.dataset.id === sel)); sec.classList.toggle('has-sel', open);
      pns.forEach(a => { const on = a.dataset.id === sel; a.classList.toggle('is-on', on); a.setAttribute('aria-hidden', String(!on)); if (on) a.removeAttribute('inert'); else a.setAttribute('inert', ''); });
      panel.classList.toggle('is-open', open); panel.setAttribute('aria-hidden', String(!open));
      paintFocus();
      const vh = window.innerHeight || 800, sy = window.scrollY || 0;
      if (!open) { if (!quiet && sy > wallBottom() - vh * .2) window.scrollTo({top: Math.max(0, wallBottom() - vh * .62), behavior: 'smooth'}); return; }          // закрыли панель, пока читали её, — вернуться к стене
      if (quiet) return;
      A.track && A.track('brands_wall_open', {brand: sel});
      const li = byId(sel), hit = li && $('.bw-hit', li);
      if (scroller && scroller.scrollWidth > scroller.clientWidth + 8 && hit) scroller.scrollTo({left: hit.offsetLeft + hit.offsetWidth / 2 - scroller.clientWidth / 2, behavior: 'smooth'});
      const want = Math.max(0, wallBottom() - vh * .4);                                                                   // стена остаётся в кадре (выбранная ниша светится), под ней — начало панели
      if (Math.abs(sy - want) > 70) window.scrollTo({top: want, behavior: 'smooth'});
    }
    const fillPearl = () => $$('[data-pe]', page).forEach(el => { if (!el.firstChild && A.pearl) el.innerHTML = A.pearl(el.getAttribute('data-pe') || 'happy', true); });
    fillPearl(); window.addEventListener('load', fillPearl);
    A.actions['br-task'] = (t, id) => { task = (id === task && id !== 'all') ? 'all' : id; apply(); };            // повторное нажатие на активный фильтр сбрасывает его
    A.actions['bw-task'] = (t, id) => { task = task === id ? 'all' : id; apply(); };
    A.actions['bw-open'] = (t, id) => { show(sel === id ? '' : id); };
    A.actions['bw-close'] = () => { const was = sel; show(''); const li = was && byId(was), b = li && $('.bw-hit', li); if (b && b.focus) b.focus({preventScroll: true}); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sel) A.actions['bw-close'](); });
    niches.forEach(li => { const b = $('.bw-hit', li); if (!b) return; const on = () => li.classList.add('is-hov'), off = () => li.classList.remove('is-hov'); b.addEventListener('mouseenter', on); b.addEventListener('mouseleave', off); b.addEventListener('focus', on); b.addEventListener('blur', off); });
    qEl.addEventListener('input', debounce(apply, 120));
    const img = $('.bw-plate', page); if (img) { const bad = () => stage.classList.add('no-plate'); img.addEventListener('error', bad); if (img.complete && img.naturalWidth === 0 && img.src) bad(); }
    const q = params().get('q'); if (q) qEl.value = q;
    const tk = params().get('task'); if (tk && $('#br-tasks [data-id="' + tk + '"]')) task = tk;
    apply(); const want = params().get('brand') || location.hash.replace(/^#brand-/, ''); if (want && byId(want)) show(want, {quiet: true});
    const root = document.documentElement; let raf = 0; const top = () => { raf = 0; root.classList.toggle('br-top', stage.getBoundingClientRect().bottom > 96); };         // шапка прозрачна, пока под ней стена-витрина
    top(); window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(top); }, {passive: true});
    A.actions['br-help'] = () => {
      if (!A.stella) return; const chip = $('#br-tasks .chip.on'), label = chip && chip.dataset.id !== 'all' ? chip.textContent.trim() : '', word = qEl.value.trim(), nm = sel && $('.bw-pn[data-id="' + sel + '"] .sr', panel);
      const text = label ? 'Помоги выбрать бренд для задачи «' + label + '»: чем бренды отличаются и с чего начать?' : word ? 'Помоги выбрать бренд по запросу «' + word + '»: что подойдёт и чем бренды отличаются?' : nm ? 'Расскажи про бренд ' + nm.textContent.trim() + ': для каких задач он подходит и с чего начать?' : 'Помоги выбрать бренд: расскажи, чем бренды «Астреи» отличаются и под какие задачи кожи подходят.';
      A.track && A.track('brands_help', {task: label}); A.stella.ask(text, {brands: true});
    };
  }

  A.pages.brands = function () {
    const grid = $('#br-grid'); if (!grid) return;
    if ($('[data-bw]')) return brandsWallPage();
    const cards = $$('.bl-card', grid), qEl = $('#br-q'); let task = 'all', pageReady = false;
    function apply() {
      const toks = A.tokens(qEl.value); let n = 0;
      const pop = pageReady && grid.closest('[data-brands-gallery]');            // галерея: после смены запроса или задачи витрины плавно всплывают по очереди (keyframes — работают и в «лёгком режиме»)
      cards.forEach(c => { const ok = (task === 'all' || c.dataset.tasks.split(' ').indexOf(task) !== -1) && toks.every(t => c.dataset.q.indexOf(t) !== -1); c.hidden = !ok; if (ok) { if (pop) { c.style.setProperty('--k', n); c.classList.remove('br-pop'); void c.offsetWidth; c.classList.add('br-pop'); } n++; } });
      $('#br-empty').hidden = n > 0;
      $$('.br-group, .br-dev-note', grid).forEach(h => { let el = h.nextElementSibling, any = false; while (el && !el.classList.contains('br-group')) { if (el.classList.contains('bl-card') && !el.hidden) any = true; el = el.nextElementSibling; } h.hidden = !any; });
    }
    qEl.addEventListener('input', debounce(apply, 120));
    A.actions['br-task'] = (t, id) => { task = (id === task && id !== 'all') ? 'all' : id; setOn($('#br-tasks'), task); apply(); };
    const q = params().get('q'); if (q) { qEl.value = q; apply(); }
    const tk = params().get('task'); if (tk && $('[data-act="br-task"][data-id="' + tk + '"]')) A.actions['br-task'](null, tk);
    pageReady = true;
    /* архитектурная галерея: шапка прозрачна над первым экраном, пока страница не прокручена (как на каталоге); «Подобрать бренд» — вопрос Стелле с учётом выбранного фильтра */
    if (grid.closest('[data-brands-gallery]')) {
      const root = document.documentElement; let raf = 0;
      const top = () => { raf = 0; root.classList.toggle('br-top', (window.scrollY || 0) < 8); };
      top(); window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(top); }, {passive: true});
      A.actions['br-help'] = () => {
        if (!A.stella) return; const chip = $('#br-tasks .chip.on'), label = chip && chip.dataset.id !== 'all' ? chip.textContent.trim() : '', word = qEl.value.trim();
        const text = label ? 'Помоги выбрать бренд для задачи «' + label + '»: чем бренды отличаются и с чего начать?' : word ? 'Помоги выбрать бренд по запросу «' + word + '»: что подойдёт и чем бренды отличаются?' : 'Помоги выбрать бренд: расскажи, чем бренды «Астреи» отличаются и под какие задачи кожи подходят.';
        A.track && A.track('brands_help', {task: label}); A.stella.ask(text, {brands: true});
      };
    }
  };

  /* ---------- обучение ---------- */
  A.pages.training = function () {
    const list = $('#sem-list'); if (!list) return;
    const rows = $$('.sem-item', list); let city = 'all', fmt = 'all';
    const allPast = rows.every(r => r.dataset.date < today());
    const acad = $('[data-acad]');
    const foldN = +list.dataset.fold || 0, foldBtn = $('[data-act="acad-fold"]');
    /* ASTREYA ACADEMY: выбранное мероприятие — тёмно-синяя карточка; тот же день подсвечивается в календаре; календарь не показывает дни скрытых фильтром мероприятий */
    let selId = '';
    const byGo = go => rows.find(r => r.dataset.go === go);
    function paintDays() {
      if (!acad) return; const cur = selId && rows.find(r => r.dataset.id === selId);
      $$('.sx-cal .sx-cd.ev').forEach(d => { const r = byGo(d.getAttribute('data-sx-go')); d.classList.toggle('acad-sel', !!(cur && r === cur)); d.classList.toggle('acad-off', !!(r && r.hidden)); });
    }
    function fold() {                                        // «Показать ещё»: видны первые foldN подходящих карточек, остальные раскрываются кнопкой
      if (!acad || !foldN) return;
      const vis = rows.filter(r => !r.hidden); vis.forEach((r, i) => r.classList.toggle('is-fold', i >= foldN)); rows.filter(r => r.hidden).forEach(r => r.classList.remove('is-fold'));
      const more = vis.length > foldN;
      if (foldBtn) { foldBtn.hidden = !more; const open = list.classList.contains('is-open'); foldBtn.setAttribute('aria-expanded', String(open)); foldBtn.firstElementChild.textContent = open ? foldBtn.dataset.less : foldBtn.dataset.more; }
    }
    function select(id) {
      selId = id || ''; rows.forEach(r => { const on = r.dataset.id === selId; r.classList.toggle('is-sel', on); if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
      const cur = rows.find(r => r.dataset.id === selId); if (cur && cur.classList.contains('is-fold')) { list.classList.add('is-open'); fold(); }
      paintDays();
    }
    function ensure() { if (!acad) return; if (!rows.some(r => r.dataset.id === selId && !r.hidden)) { const f = rows.find(r => !r.hidden); select(f ? f.dataset.id : ''); } else paintDays(); }
    function apply() {
      let n = 0;
      rows.forEach(r => { const ok = (city === 'all' || r.dataset.city === city) && (fmt === 'all' || r.dataset.fmt === fmt) && (allPast || r.dataset.date >= today()); r.hidden = !ok; if (ok) n++; });
      $('#sem-empty').hidden = n > 0; fold(); ensure();
    }
    const dd = $('[data-ac-dd]');
    function ddOpen(on) { if (!dd) return; dd.classList.toggle('is-open', on); const b = $('.ac-dd-b', dd); if (b) b.setAttribute('aria-expanded', String(on)); }
    function fmtLabel() { const c = $('#fmt-chips .chip.on'), l = $('[data-ac-dd-l]'); if (c && l) l.textContent = c.textContent.trim(); }
    A.actions.city = (t, id) => { city = id; setOn($('#city-chips'), id); apply(); if (acad) { const s = $('.sx-tl-sec'); if (s && s.__draw) s.__draw(id); } };
    A.actions.fmt = (t, id) => { fmt = id; setOn($('#fmt-chips'), id); fmtLabel(); ddOpen(false); apply(); };
    A.actions['acad-dd'] = () => ddOpen(!(dd && dd.classList.contains('is-open')));
    A.actions['acad-fold'] = () => { list.classList.toggle('is-open'); fold(); };
    A.actions['acad-more'] = t => {                           // «О преподавателях»: плавно раскрывает остальных (grid-template-rows 0fr → 1fr)
      const box = document.getElementById(t.dataset.target); if (!box) return; const open = !box.classList.contains('is-open');
      box.classList.toggle('is-open', open); box.setAttribute('aria-hidden', String(!open)); if (open) box.removeAttribute('inert'); else box.setAttribute('inert', '');
      t.setAttribute('aria-expanded', String(open)); t.firstElementChild.textContent = open ? t.dataset.less : t.dataset.more;
    };
    document.addEventListener('click', e => { if (dd && !e.target.closest('[data-ac-dd]')) ddOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') ddOpen(false); });
    const f = params().get('fmt'); if (f === 'online' || f === 'offline') { fmt = f; setOn($('#fmt-chips'), f); fmtLabel(); }
    const c = params().get('city'); if (c) { city = c; setOn($('#city-chips'), c); }
    apply();
    if (acad) {
      list.addEventListener('click', e => { const r = e.target.closest('.sem-item'); if (r && !e.target.closest('a,button')) select(r.dataset.id); });
      list.addEventListener('focusin', e => { const r = e.target.closest('.sem-item'); if (r && r.dataset.id !== selId) select(r.dataset.id); });
      const host = $('[data-acad-cal]');
      if (host) {
        host.addEventListener('mouseover', e => { const d = e.target.closest('.sx-cd.ev'); if (!d) return; const r = byGo(d.getAttribute('data-sx-go')); if (r && !r.hidden && r.dataset.id !== selId) select(r.dataset.id); });
        if (window.MutationObserver) new MutationObserver(paintDays).observe(host, {childList: true, subtree: true});
      }
    }
  };
  A.pages.event = function () {
    const w = $('[data-event]'); if (!w) return;
    if (w.getAttribute('data-date') < today()) { const n = $('#past-note'); if (n) n.hidden = false; const c = $('#e-cta'); if (c) c.hidden = true; const r = $('#register'); if (r) r.hidden = true; }
  };

  /* ---------- новости ---------- */
  A.pages.news = function () {
    const grid = $('#news-grid'); if (!grid) return;
    const cards = $$('.newscard', grid);
    A.actions['news-cat'] = (t, id) => {
      setOn($('#news-tabs'), id);
      let n = 0; cards.forEach(c => { const ok = id === 'all' || c.dataset.cat === id; c.hidden = !ok; if (ok) n++; });
      $('#news-empty').hidden = n > 0;
    };
    const c = params().get('cat'); if (c) A.actions['news-cat'](null, c);
  };

  /* ---------- калькулятор скидок (страница «Стать партнёром») ---------- */
  A.pages.partners = function () {
    const r = $('#calc-range'); if (!r) return;
    const DS = D.site.discounts;
    const tween = (el, to, fmt) => {
      const from = el.dataset.v === undefined ? to : +el.dataset.v; el.dataset.v = to; cancelAnimationFrame(el._r);
      if (from === to) { el.textContent = fmt(to); return; }
      const t0 = performance.now(), dur = 460;
      const tick = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (p < 1) el._r = requestAnimationFrame(tick); };
      el._r = requestAnimationFrame(tick);
    };
    function upd() {
      const v = +r.value; r.style.setProperty('--p', (v / +r.max * 100) + '%');
      tween($('#calc-sum'), v, A.rub);
      let tier = -1; DS.forEach((d, i) => { if (v >= d.from) tier = i; });
      $$('.tier').forEach((t, i) => t.classList.toggle('on', i === tier));
      const d = tier >= 0 ? DS[tier] : null;
      $('#calc-tier').textContent = d ? `Ваша скидка — ${d.pct}%` : `До первой скидки — ${A.rub(DS[0].from - v)}`;
      tween($('#calc-save'), d ? Math.round(v * d.pct / 100) : 0, n => n ? A.rub(n) : '—');
    }
    r.addEventListener('input', upd); upd();
  };

  /* ---------- поиск ---------- */
  A.pages.search = function () {
    const out = $('#s-out'), tabs = $('#s-tabs'), inp = $('#sp-q'); if (!out) return;
    const q = (params().get('q') || '').trim(); inp.value = q;
    if (!q) return;
    document.title = `Поиск: ${q} — Астрея`;
    const res = A.search(q);
    A.track('search', {query: q, results: res.length});
    if (!res.length) { out.innerHTML = `<div class="empty"><b>Ничего не найдено</b>По запросу «${esc(q)}» ничего нет. Попробуйте название бренда, продукта или тему («пилинг», «фотозащита»).</div>`; return; }
    const groups = A.TYPE_ORDER.map(t => [t, res.filter(r => r.t === t)]).filter(g => g[1].length);
    const plur = {product: 'Товары', brand: 'Бренды', event: 'Обучение', news: 'Новости'};
    function render(type) {
      out.innerHTML = groups.filter(g => type === 'all' || g[0] === type).map(([t, list]) => `<section class="s-group"><h2>${plur[t]} <small>${list.length}</small></h2><div class="s-list">${list.map(A.resHTML).join('')}</div></section>`).join('');
    }
    tabs.hidden = false;
    tabs.innerHTML = [['all', 'Все', res.length], ...groups.map(g => [g[0], plur[g[0]], g[1].length])].map(([id, l, n], i) => `<button type="button" class="chip${i ? '' : ' on'}" data-act="s-tab" data-id="${id}" aria-pressed="${i ? 'false' : 'true'}">${l}<small>${n}</small></button>`).join('');
    A.actions['s-tab'] = (t, id) => { setOn(tabs, id); render(id); };
    render('all');
  };
})();
