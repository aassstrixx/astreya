/* sales-pages.js — у каждой страницы свой ход (продающий слой, data/redesign.json → extras.sales; тексты — data/sales.json → pages).
   Общих блоков «на всех страницах» нет: каждый модуль отвечает на вопрос именно этого посетителя в этом месте сайта.

   Страница          Ход                                                                    Приём (честно: только реальные данные)
   главная           развилка «Учиться / Закупать» (вёрстка — src/pages/sales-home.js)       выбор пути, «ваш план готов» (незавершённое дело)
   каталог           подборки по задачам из «наборов» упаковок + «собрано в запросе»        снижение выбора, прогресс сбора, один клик до заявки
   бренды            ближайший семинар на карточке бренда                                    реальная ближайшая дата как повод
   бренд             «Путь с брендом»: освоить → выбрать → заказать                          рекомендуемый первый шаг, ясный маршрут
   товар             «Освоить в работе» (семинар бренда) + «Что будет после запроса»        перекрёстный шаг к обучению, прозрачность процесса
   обучение          «Календарь встреч» — месячная сетка с отмеченными днями + лист ожидания          наглядный ритм, личный город, ответ на «а если нет моего города»
   мероприятие       «Как проходит запись» + «Позвать коллегу» + «после семинара»            снятие неопределённости, социальный канал
   партнёры          «Ваш ориентир»: ступени скидок и запрос на свою сумму                   градиент цели («не хватает N ₽»), якорь «до 15 %»
   новости           у каждой новости — действие по её теме
   компания          «Ваш регион»: ближайший офис и семинар в вашем городе                   близость, персонализация
   контакты          «Сейчас на связи» — честный статус по часам работы                      прозрачность ожидания
   поиск             спасение пустого результата                                             не терять человека на тупике
   Всё в браузере, ничего не отправляется на сервер без заявки посетителя. Страницы подменяются без перезагрузки: монтирование идемпотентно. */
(function () {
  'use strict';
  const A = window.Astreya, K = A && A.sales && A.sales.kit;
  if (!K) return;
  const {D, SX, I, esc, $, $$, track, fill, plural, rub, local, root, href, link, upcoming, nextEvent, dShort, daysTo, evUrl, bUrl, P, B, T, EV, planPath, planRel, savedPlan, compute, PLUS, whenText, today} = K;
  const PG = SX.pages || {};
  const mod = (name, host) => host && host.querySelector ? host.querySelector('[data-sx-mod="' + name + '"]') : null;
  const el = (tag, cls, html, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); return e; };
  const findSection = (main, rx) => $$('section', main).find(s => { const h = $('h2', s); return h && rx.test(h.textContent); }) || null;
  const nword = n => plural(n, 'товар', 'товара', 'товаров');
  const brandMono = b => '<span class="sx-bm" style="--c1:' + esc(b.c1) + ';--c2:' + esc(b.c2) + '" aria-hidden="true">' + esc(b.name.charAt(0)) + '</span>';
  const doForm = (type, ref) => { A.openForm(type, ref || ''); };

  /* ---------- упаковки: «набор» из трёх флаконов в цветах брендов (те же иллюстрации, что на карточках каталога) ---------- */
  function pack(p) { const b = B[p.brand]; return '<span class="sx-pk" style="--c1:' + esc(b.c1) + ';--c2:' + esc(b.c2) + ';--ink:' + esc(b.ink) + '"><span class="pk pk-' + esc(p.t) + '"><i class="sh"></i><i class="hd"></i><i class="cap"></i><i class="body"><b class="lbl"></b></i></span></span>'; }

  /* ================= ГЛАВНАЯ: развилка «Учиться / Закупать» (вёрстка статическая, здесь — только живые данные) ================= */
  function home() {
    const root_ = $('[data-sx-fork]'); if (!root_) return;
    const h = PG.home || {}, door = $('.sx-door-learn', root_), buy = $('.sx-door-buy', root_);
    const ev = nextEvent();
    if (door && ev) {                                                    // дата в сборке могла устареть — берём ближайшую на сегодня
      const dp = A.dparts(ev.date), n = daysTo(ev.date), b = B[ev.b], dd = h.learn || {};
      $('[data-sx-d]', door).textContent = dp.d; $('[data-sx-m]', door).textContent = dp.full.split(' ')[1];
      $('[data-sx-when]', door).textContent = whenText(n, dd.days || {0: 'сегодня', 1: 'завтра', n: 'через {days}'});
      if (b) { door.style.setProperty('--c1', b.c1); door.style.setProperty('--c2', b.c2); door.style.setProperty('--ink', b.ink); }
      $('[data-sx-line]', door).innerHTML = '<a href="' + esc(href(evUrl(ev))) + '" data-sx-go="' + esc(evUrl(ev)) + '" data-sx-ev-title data-track="home_fork_event">' + esc(ev.title) + '</a>';
      $('[data-sx-meta]', door).textContent = ev.fm + ' · ' + ev.city;
      const cta = $('[data-sx-cta]', door); if (cta) { cta.setAttribute('data-type', 'seminar'); cta.setAttribute('data-ref', ev.id); cta.innerHTML = esc(dd.cta || 'Записаться') + ' ' + I.arrow; }
    } else if (door && !ev) {
      $('[data-sx-line]', door).textContent = (h.learn || {}).none || ''; $('[data-sx-meta]', door).textContent = ''; $('[data-sx-when]', door).textContent = '';
    }
    const s = savedPlan();
    if (buy && s) {                                                      // сохранённый план: вернуться к начатому проще, чем начинать заново
      const cta = $('[data-sx-cta]', buy); if (cta) { cta.innerHTML = esc((h.buy || {}).ctaPlan || 'Открыть мой план') + ' ' + I.arrow; cta.setAttribute('href', href(planRel(s.st))); cta.setAttribute('data-sx-go', planRel(s.st)); }
      const note = $('[data-sx-buy-note]', buy); if (note) note.textContent = (h.buy || {}).notePlan || '';
    }
    if (!root_.__sxSeen && 'IntersectionObserver' in window) { root_.__sxSeen = 1; const o = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { track('sales_fork_view', {plan: !!s}); o.disconnect(); } }, {threshold: .3}); o.observe(root_); }
  }

  /* ================= КАТАЛОГ: подборки по задачам ================= */
  function kitsFor() {
    const cfg = PG.catalog || {}, out = [];
    (D.tasks || []).forEach(t => {
      const pl = compute({tasks: [t.id], goal: 'range', role: '', city: '', volume: '', brand: ''});
      const prods = pl.products.slice(0, cfg.perKit || 3); if (prods.length < 2) return;
      out.push({task: t, products: prods, brands: pl.brands.slice(0, 2)});
    });
    return out.slice(0, cfg.max || 6);
  }
  function kitState(card) {
    const ids = (card.getAttribute('data-ids') || '').split(','), all = ids.length && ids.every(id => A.rlHas && A.rlHas(id)), btn = $('[data-kit-add]', card), cfg = PG.catalog || {};
    card.classList.toggle('on', !!all); if (btn) { btn.setAttribute('aria-pressed', all ? 'true' : 'false'); $('.lbl', btn).textContent = all ? cfg.added : cfg.add; }
  }
  /* карусель: одна подборка крупно спереди, две соседние — позади, меньше и бледнее; листается пальцем, стрелками, точками и клавишами */
  function kitsCarousel(sec) {
    const row = $('.sx-kit-row', sec), cards = $$('.sx-kit', sec), dots = $$('[data-kit-go]', sec); if (!row || !cards.length) return;
    let raf = 0, cur = 0;
    const layout = () => {
      raf = 0; const mid = row.clientWidth / 2; let best = 0, bd = 1e9;
      cards.forEach((c, i) => {
        const d = (c.offsetLeft + c.offsetWidth / 2 - row.scrollLeft - mid) / (c.offsetWidth * .82), ad = Math.abs(d);
        c.style.setProperty('--s', (1 - Math.min(ad, 2) * .12).toFixed(3)); c.style.setProperty('--o', ad <= 1 ? (1 - ad * .4).toFixed(3) : Math.max(0, .6 - (ad - 1) * .6).toFixed(3));
        c.style.setProperty('--z', String(20 - Math.round(ad * 6))); c.style.setProperty('--tx', (-d * c.offsetWidth * .03).toFixed(1) + 'px');
        if (ad < bd) { bd = ad; best = i; }
      });
      if (best !== cur || !cards[best].classList.contains('is-active')) { cur = best; cards.forEach((c, i) => { c.classList.toggle('is-active', i === best); c.setAttribute('aria-current', i === best ? 'true' : 'false'); }); dots.forEach((d, i) => { d.classList.toggle('on', i === best); d.setAttribute('aria-current', i === best ? 'true' : 'false'); }); }
      const pv = $('[data-kit-nav="-1"]', sec), nx = $('[data-kit-nav="1"]', sec); if (pv) pv.disabled = best === 0; if (nx) nx.disabled = best === cards.length - 1;
    };
    const sched = () => { if (!raf) raf = requestAnimationFrame(layout); };
    const go = i => { i = Math.max(0, Math.min(cards.length - 1, i)); const c = cards[i]; row.scrollTo({left: c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2, behavior: 'smooth'}); };
    row.addEventListener('scroll', sched, {passive: true}); window.addEventListener('resize', sched);
    sec.addEventListener('click', e => { const n = e.target.closest('[data-kit-nav]'); if (n) { go(cur + (+n.getAttribute('data-kit-nav'))); track('sales_kit_nav'); return; } const d = e.target.closest('[data-kit-go]'); if (d) go(+d.getAttribute('data-kit-go')); });
    /* карточка «на фоне» сначала выходит вперёд, и только потом её кнопки работают */
    row.addEventListener('click', e => { const c = e.target.closest('.sx-kit'); if (c && !c.classList.contains('is-active')) { e.preventDefault(); e.stopPropagation(); go(cards.indexOf(c)); } }, true);
    row.addEventListener('focusin', e => { const c = e.target.closest('.sx-kit'); if (c && !c.classList.contains('is-active')) go(cards.indexOf(c)); });
    row.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); } });
    const mid = cards.length > 2 ? 1 : 0, c0 = cards[mid];          // начинаем со второй подборки: справа и слева видно по соседней — «одна вперёд, две позади»
    row.scrollLeft = c0.offsetLeft - (row.clientWidth - c0.offsetWidth) / 2;
    layout(); setTimeout(() => { row.scrollLeft = c0.offsetLeft - (row.clientWidth - c0.offsetWidth) / 2; layout(); }, 350); setTimeout(layout, 1200);
  }
  function catalog(c, main) {
    const wrap = $('[data-catalog]', main), tb = $('#results', main); if (!wrap || !tb || mod('kits', wrap)) return;
    const cfg = PG.catalog || {}, kits = kitsFor(); if (!kits.length) return;
    const sec = el('section', 'sx-mod sx-kits', '<header class="sx-head"><span class="eyebrow">' + esc(cfg.eyebrow) + '</span><h2>' + esc(cfg.title) + '</h2><p class="lead">' + esc(cfg.lead) + '</p></header>' +
      '<div class="sx-kit-stage"><button class="sx-kit-nav prev" type="button" data-kit-nav="-1" aria-label="' + esc(cfg.prev) + '">' + I.arrow + '</button>' +
      '<div class="sx-kit-row" role="list" tabindex="0" aria-label="' + esc(cfg.title) + '">' + kits.map((k, i) => {
        const ids = k.products.map(p => p.id), b0 = B[k.products[0].brand];
        return '<article class="sx-kit" role="listitem" style="--c1:' + esc(b0.c1) + ';--c2:' + esc(b0.c2) + ';--i:' + i + '" data-ids="' + esc(ids.join(',')) + '" data-task="' + esc(k.task.id) + '">' +
          '<div class="sx-kit-art" aria-hidden="true">' + k.products.map(pack).join('') + '</div>' +
          '<h3>' + esc(k.task.label) + '</h3><p class="sx-kit-sub">' + esc(fill(cfg.count, {n: ids.length, nword: nword(ids.length), brands: k.brands.map(id => B[id].name).join(', ')})) + '</p>' +
          '<div class="sx-kit-act"><button class="btn btn-fill btn-sm" type="button" data-kit-add data-sx="kit-add"><span class="lbl">' + esc(cfg.add) + '</span></button><button class="btn btn-lnk" type="button" data-kit-show>' + esc(cfg.show) + '</button></div></article>';
      }).join('') + '</div><button class="sx-kit-nav next" type="button" data-kit-nav="1" aria-label="' + esc(cfg.next) + '">' + I.arrow + '</button></div>' +
      '<div class="sx-kit-dots" role="group" aria-label="' + esc(cfg.title) + '">' + kits.map((k, i) => '<button type="button" data-kit-go="' + i + '" aria-label="' + esc(k.task.label) + '"></button>').join('') + '</div>' +
      '<p class="sx-kit-meta" aria-live="polite" data-kit-meta></p>');
    sec.setAttribute('data-sx-mod', 'kits'); tb.parentNode.insertBefore(sec, tb);
    $$('.sx-kit', sec).forEach(kitState);
    metaKits(sec); kitsCarousel(sec);
    track('sales_kits_view', {kits: kits.length});
  }
  function metaKits(sec) {
    const m = $('[data-kit-meta]', sec), n = (function () { try { return (JSON.parse(localStorage.getItem('astreya:rl') || '[]')).length; } catch (e) { return 0; } })(), cfg = PG.catalog || {};
    if (m) m.innerHTML = n ? esc(cfg.listTitle) + ': <b>' + n + ' ' + nword(n) + '</b> · <button class="lnk-btn" type="button" data-act="rl-open">Открыть список</button>' : '';
  }
  document.addEventListener('click', e => {
    const add = e.target.closest && e.target.closest('[data-kit-add]'), show = e.target.closest && e.target.closest('[data-kit-show]');
    if (add) {
      const card = add.closest('.sx-kit'), ids = (card.getAttribute('data-ids') || '').split(',');
      const n = A.rlAdd ? A.rlAdd(ids) : 0; track('sales_kit_add', {task: card.getAttribute('data-task'), added: n});
      if (A.toast) A.toast(n ? fill((PG.catalog || {}).addedToast, {n: n, nword: nword(n)}) : (PG.catalog || {}).added);
      $$('.sx-kit').forEach(kitState); const sec = card.closest('.sx-kits'); if (sec) metaKits(sec);
    }
    if (show) {
      const card = show.closest('.sx-kit'), sel = $('#f-task'), tb = $('#results'); track('sales_kit_show', {task: card.getAttribute('data-task')});
      if (sel) { sel.value = card.getAttribute('data-task'); sel.dispatchEvent(new Event('change', {bubbles: true})); }
      if (tb) tb.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  });
  document.addEventListener('astreya:rl', () => { $$('.sx-kit').forEach(kitState); const sec = $('.sx-kits'); if (sec) metaKits(sec); });

  /* пустая выдача каталога и поиска: не терять человека на тупике */
  function rescueHTML(cfg) {
    return '<div class="sx-rescue" data-sx-mod="rescue"><b>' + esc(cfg.title) + '</b><p>' + esc(cfg.text) + '</p><div class="row">' + link(planPath, 'btn btn-fill btn-sm', esc(cfg.cta || cfg.plan) + ' ' + I.arrow, 'rescue-plan') +
      (A.stella ? '<button class="btn btn-ghost btn-sm" type="button" data-sx-ask data-sx="rescue-ask">' + esc(cfg.ask) + '</button>' : '') + (cfg.call && A.openForm ? '<button class="btn btn-lnk" type="button" data-sx-cb data-sx="rescue-call">' + esc(cfg.call) + '</button>' : '') + '</div></div>';
  }
  function catalogRescue(main) { const e = $('#cat-empty', main); if (e && !mod('rescue', e)) e.insertAdjacentHTML('beforeend', rescueHTML(((PG.catalog || {}).emptyRescue) || {})); }
  function searchRescue(main) {
    const out = $('#s-out', main); if (!out || out.__sxObs) return; out.__sxObs = true;
    const cfg = PG.search || {}, tasks = (D.tasks || []).slice(0, 5);
    const fix = () => { const empty = $('.empty', out); if (!empty || mod('rescue', empty)) return;
      empty.insertAdjacentHTML('beforeend', rescueHTML(cfg) + '<div class="sx-rescue-tasks"><span>' + esc(cfg.tasks) + '</span>' + tasks.map(t => link('catalog.html?task=' + t.id, 'chip', esc(t.label), 'rescue-task')).join('') + '</div>'); track('sales_search_rescue'); };
    new MutationObserver(fix).observe(out, {childList: true}); fix();
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-sx-ask]'), cb = e.target.closest && e.target.closest('[data-sx-cb]');
    if (a && A.stella) A.stella.ask('Помоги подобрать: опиши, что подойдёт под мою задачу.', {sales: true});
    if (cb) doForm((D.extras || {}).callback ? 'callback' : 'question', '');
  });

  /* ================= БРЕНДЫ: ближайший семинар на карточке бренда ================= */
  function brands(c, main) {
    const cfg = PG.brands || {};
    $$('.bl-card[data-id]', main).forEach(card => {
      if ($('.sx-bchip', card)) return; const id = card.getAttribute('data-id'), ev = nextEvent(id), foot = $('.bl-foot', card); if (!ev || !foot) return;
      const dp = A.dparts(ev.date), a = el('a', 'sx-bchip', '<span class="sx-bt" aria-hidden="true"><b>' + dp.d + '</b><small>' + esc(dp.m) + '</small></span><span>' + esc(fill(cfg.chip, {date: dShort(ev.date), city: ev.city})) + '</span>', {href: href(evUrl(ev)), 'data-sx-go': evUrl(ev), title: cfg.chipTitle || '', 'data-sx': 'brands-chip'});
      foot.parentNode.insertBefore(a, foot);
    });
  }

  /* ================= БРЕНД: «Путь с брендом» ================= */
  function brand(c, main) {
    const b = c.brand, hero = $('.b-hero', main); if (!b || !hero || mod('route', main)) return;
    const cfg = PG.brand || {}, evs = upcoming().filter(e => e.b === b.id), ev = evs[0] || null;
    const prods = (D.products || []).filter(p => p.brand === b.id), taskIds = Array.from(new Set(prods.reduce((a, p) => a.concat(p.ts || []), []))), tl = taskIds.slice(0, 3).map(t => (T[t] || {}).label).filter(Boolean);
    const st = {brand: b.name, date: ev ? dShort(ev.date) : '', city: ev ? ev.city : '', fmt: ev ? ev.fm : '', n: prods.length, nword: nword(prods.length), tasks: tl.join(', ')};
    const steps = (cfg.steps || []).map((s, i) => {
      let t = fill(s.t, st), p = fill(s.p, st), cta = s.cta, act = '';
      if (s.id === 'learn') {
        if (ev) act = '<button class="btn btn-fill btn-sm" type="button" data-sx-act="seminar" data-ref="' + esc(ev.id) + '" data-sx="route-learn">' + esc(cta) + ' ' + I.arrow + '</button>';
        else { t = s.tNone; p = s.pNone; act = '<button class="btn btn-ghost btn-sm" type="button" data-sx-act="question" data-ref="' + esc('Обучение по бренду ' + b.name) + '" data-sx="route-learn">' + esc(s.ctaNone) + '</button>'; }
      } else if (s.id === 'pick') act = '<button class="btn btn-ghost btn-sm" type="button" data-sx-act="scroll-products" data-sx="route-pick">' + esc(cta) + ' ' + I.arrow + '</button>';
      else act = '<button class="btn btn-ghost btn-sm" type="button" data-sx-act="product" data-ref="' + esc('Бренд ' + b.name) + '" data-sx="route-order">' + esc(K.ctaLabel()) + ' ' + I.arrow + '</button>';
      return '<li class="sx-station' + (s.id === 'learn' && ev ? ' first' : '') + '" style="--i:' + i + '"><div class="sx-st-top"><b class="sx-num" aria-hidden="true">0' + (i + 1) + '</b><span class="sx-st-k">' + esc(s.k) + '</span>' + (s.id === 'learn' && ev && s.badge ? '<em>' + esc(s.badge) + '</em>' : '') + '</div><div class="sx-st-body"><h3>' + esc(t) + '</h3><p>' + esc(p) + '</p>' + act + '</div></li>';
    }).join('');
    const sec = el('section', 'sx-mod sx-route-sec', '<header class="sx-head"><span class="eyebrow">' + esc(cfg.eyebrow) + '</span><h2>' + esc(fill(cfg.title, {brand: b.name})) + '</h2></header><ol class="sx-route">' + steps + '</ol>', {'data-sx-mod': 'route'});
    hero.parentNode.insertBefore(sec, hero.nextSibling);
    track('sales_route_view', {brand: b.id, event: ev ? ev.id : ''});
  }

  /* ================= ТОВАР: «Освоить в работе» + «Что будет после запроса» ================= */
  function product(c, main) {
    const p = c.product, b = c.brand; if (!p || !b) return;
    const cfg = PG.product || {}, ev = nextEvent(b.id), row = $('.p-info > .row', main);
    if (row && !mod('hook', main)) {
      const h = cfg.hook || {}, dp = ev ? A.dparts(ev.date) : null, node = el('div', 'sx-hook' + (ev ? '' : ' off'), ev
        ? '<span class="sx-bt" aria-hidden="true"><b>' + dp.d + '</b><small>' + esc(dp.m) + '</small></span><span class="sx-hook-t">' + esc(fill(h.text, {brand: b.name, date: dShort(ev.date), city: ev.city})) + '</span><button class="btn-lnk sx-hook-a" type="button" data-sx-act="seminar" data-ref="' + esc(ev.id) + '" data-sx="hook">' + esc(h.cta) + ' ' + I.arrow + '</button>'
        : '<span class="sx-hook-t">' + esc(fill(h.none, {brand: b.name})) + '</span>' + link('training.html', 'btn-lnk sx-hook-a', esc(h.noneCta) + ' ' + I.arrow, 'hook'), {'data-sx-mod': 'hook'});
      row.parentNode.insertBefore(node, row.nextSibling);
    }
    const side = $('.p-side', main), req = side && $('.p-req', side);
    if (req && !mod('after', main)) {
      const a = cfg.after || {}, hours = D.site.contacts.hours || '';
      const card = el('div', 'sx-after-steps', '<b>' + esc(a.title) + '</b><ol>' + (a.steps || []).map((s, i) => '<li><span class="sx-sq" aria-hidden="true">' + (i + 1) + '</span><div><b>' + esc(s.t) + '</b><p>' + esc(fill(s.p, {hours: hours})) + '</p></div></li>').join('') + '</ol><p class="sx-fine">' + esc(a.fine) + '</p>', {'data-sx-mod': 'after'});
      req.parentNode.insertBefore(card, req.nextSibling);
    }
  }

  /* ================= ОБУЧЕНИЕ: «Календарь встреч» ================= */
  /* настоящий календарик: сетка месяца Пн–Вс; дни с мероприятиями окрашены цветом бренда и ведут на мероприятие; под сеткой — встречи месяца списком.
     Месяцы листаются стрелками; фильтр города оставляет его мероприятия и онлайн. Всё считается в браузере из расписания сайта. */
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'], WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const bOf = e => B[e.b] || {c1: '#2f5bd6', c2: '#8ea8f0', ink: '#fff', name: ''};
  const evLabel = e => dShort(e.date) + ', ' + e.city + ' — ' + e.title;
  const monthsBetween = (a, z) => { const out = []; let y = +a.slice(0, 4), m = +a.slice(5, 7); const yz = +z.slice(0, 4), mz = +z.slice(5, 7); while ((y < yz || (y === yz && m <= mz)) && out.length < 12) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return out; };
  function calMonth(evs, key, nearId, cfg) {
    const y = +key.slice(0, 4), m = +key.slice(5, 7), nd = new Date(y, m, 0).getDate(), lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, t = today(), by = {};
    evs.forEach(e => { if (e.date.slice(0, 7) === key) (by[+e.date.slice(8, 10)] = by[+e.date.slice(8, 10)] || []).push(e); });
    let cells = ''; for (let i = 0; i < lead; i++) cells += '<span class="sx-cd off" aria-hidden="true"></span>';
    for (let d = 1; d <= nd; d++) {
      const iso = key + '-' + String(d).padStart(2, '0'), list = by[d] || [], we = (lead + d - 1) % 7 >= 5;
      const cls = 'sx-cd' + (iso === t ? ' today' : '') + (iso < t ? ' past' : '') + (we ? ' we' : '') + (list.length ? ' ev' : '') + (list.some(e => e.id === nearId) ? ' near' : '');
      if (!list.length) { cells += '<span class="' + cls + '"' + (iso === t ? ' aria-label="' + esc(cfg.today) + '"' : '') + '><b>' + d + '</b></span>'; continue; }
      const e = list[0], b = bOf(e);
      cells += '<a class="' + cls + '" style="--c1:' + esc(b.c1) + ';--c2:' + esc(b.c2) + '" href="' + esc(href(evUrl(e))) + '" data-sx-go="' + esc(evUrl(e)) + '" data-sx="calendar" aria-label="' + esc(list.map(evLabel).join('; ')) + '"><b>' + d + '</b>' +
        '<span class="sx-cd-bars">' + list.map(x => '<i style="background:' + esc(bOf(x).c1) + '"></i>').join('') + '</span></a>';
    }
    return '<div class="sx-cal-wd" aria-hidden="true">' + WD.map((w, i) => '<span' + (i > 4 ? ' class="we"' : '') + '>' + w + '</span>').join('') + '</div><div class="sx-cal-grid">' + cells + '</div>';
  }
  function calList(evs, key, cfg) {
    const list = evs.filter(e => e.date.slice(0, 7) === key);
    if (!list.length) return '<p class="sx-cal-empty">' + esc(cfg.empty) + '</p>';
    return '<ul class="sx-cal-list">' + list.map(e => { const dp = A.dparts(e.date), b = bOf(e);
      return '<li><a class="sx-cal-row" style="--c1:' + esc(b.c1) + ';--ink:' + esc(b.ink || '#fff') + '" href="' + esc(href(evUrl(e))) + '" data-sx-go="' + esc(evUrl(e)) + '" data-sx="calendar-list"><span class="sx-bt" aria-hidden="true"><b>' + dp.d + '</b><small>' + esc(dp.m) + '</small></span>' +
        '<span class="sx-cal-t"><b>' + esc(e.city) + (e.fm && e.fm !== 'Очно' ? ' · ' + esc(e.fm) : '') + '</b><em>' + esc(e.title) + '</em><span>' + esc(b.name) + '</span></span><span class="sx-cal-go" aria-hidden="true">' + I.arrow + '</span></a></li>'; }).join('') + '</ul>';
  }
  function training(c, main) {
    const wrap = $('[data-training]', main); if (!wrap || mod('timeline', main)) return;
    const cfg = PG.training || {}, all = upcoming().slice(0, 12); if (!all.length) return;
    const cities = (SX.cities || []), pref = K.city() || 'all', cal = cfg.cal || {};
    const sec = el('section', 'sx-mod sx-tl-sec', '<div class="wrap"><header class="sx-head"><span class="eyebrow">' + esc(cfg.eyebrow) + '</span><h2>' + esc(cfg.title) + '</h2><p class="lead">' + esc(cfg.lead) + '</p></header>' +
      '<div class="sx-tl-bar"><div class="sx-tl-city" role="group" aria-label="' + esc(cfg.cityLabel) + '"><span>' + esc(cfg.cityLabel) + '</span>' + ['all'].concat(cities).map(x => '<button type="button" class="chip' + (x === pref ? ' on' : '') + '" data-sx-city="' + esc(x) + '" aria-pressed="' + (x === pref) + '">' + esc(x === 'all' ? cfg.all : x) + '</button>').join('') + '</div></div>' +
      '<div class="sx-tl-main"><div class="sx-tl-next" data-sx-tl-next></div><div class="sx-cal" data-sx-tl-track aria-label="' + esc(cal.label) + '"></div></div></div>', {'data-sx-mod': 'timeline'});
    wrap.parentNode.insertBefore(sec, wrap.nextSibling);
    let evs = [], months = [], mi = 0, nearId = '';
    const paintCal = () => {
      const host = $('[data-sx-tl-track]', sec), key = months[mi];
      if (!key) { host.innerHTML = ''; host.hidden = true; return; }
      host.hidden = false;
      host.innerHTML = '<div class="sx-cal-box"><header class="sx-cal-h"><button type="button" class="sx-cal-nav prev" data-cal-nav="-1" aria-label="' + esc(cal.prev) + '"' + (mi === 0 ? ' disabled' : '') + '>' + I.arrow + '</button>' +
        '<h3 class="sx-cal-m" aria-live="polite"><span>' + MONTHS[+key.slice(5, 7) - 1] + '</span> <small>' + key.slice(0, 4) + '</small></h3>' +
        '<button type="button" class="sx-cal-nav" data-cal-nav="1" aria-label="' + esc(cal.next) + '"' + (mi === months.length - 1 ? ' disabled' : '') + '>' + I.arrow + '</button></header>' +
        calMonth(evs, key, nearId, cfg) + '<p class="sx-cal-leg"><i class="t"></i>' + esc(cfg.today) + '<i class="e"></i>' + esc(cal.legend) + '</p></div>' +
        '<div class="sx-cal-side"><b class="sx-cal-lt">' + esc(cal.listTitle) + '</b>' + calList(evs, key, cal) + '</div>';
    };
    const draw = city => {
      evs = city === 'all' ? all : all.filter(e => e.city === city || e.city === 'Онлайн');
      const local_ = city === 'all' ? evs : evs.filter(e => e.city === city), first = (local_[0] || evs[0]);
      $$('[data-sx-city]', sec).forEach(b => { const on = b.getAttribute('data-sx-city') === city; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      const next = $('[data-sx-tl-next]', sec);
      const wait = city !== 'all' && city !== 'Онлайн' && !local_.length ? '<p class="sx-tl-none">' + esc(cfg.none) + '</p><button class="btn btn-ghost btn-sm" type="button" data-sx-wait="' + esc(city) + '" data-sx="timeline-wait">' + esc(cfg.noneCta) + '</button>' : '';
      if (!first) { next.innerHTML = wait || '<p class="sx-tl-none">' + esc(cfg.none) + '</p>'; months = []; mi = 0; nearId = ''; paintCal(); return; }
      const n = daysTo(first.date), b = B[first.b] || {};
      next.innerHTML = '<span class="sx-tl-soon">' + esc(cfg.soon) + '</span><b class="sx-tl-in">' + esc(whenText(n, cfg.in)) + '</b><p class="sx-tl-t">' + esc(first.title) + '</p><p class="sx-tl-m">' + esc(dShort(first.date)) + ' · ' + esc(first.city) + ' · ' + esc(b.name || '') + '</p>' +
        '<button class="btn btn-fill" type="button" data-sx-act="seminar" data-ref="' + esc(first.id) + '" data-sx="timeline-register">' + esc(cfg.more) + ' ' + I.arrow + '</button><p class="sx-tl-free">' + esc(cfg.free) + '</p>' + wait;
      months = monthsBetween(evs[0].date.slice(0, 7), evs[evs.length - 1].date.slice(0, 7)); nearId = first.id;
      mi = Math.max(0, months.indexOf(first.date.slice(0, 7))); paintCal();
    };
    draw(pref); sec.__draw = draw;
    sec.addEventListener('click', e => {
      const nv = e.target.closest('[data-cal-nav]'); if (nv) { if (nv.disabled) return; mi = Math.min(months.length - 1, Math.max(0, mi + (+nv.getAttribute('data-cal-nav')))); paintCal(); track('sales_calendar_month', {month: months[mi]}); return; }
      const b = e.target.closest('[data-sx-city]'); if (!b) return; const city = b.getAttribute('data-sx-city'); K.setCity(city === 'all' || city === 'Онлайн' ? '' : city); draw(city); track('sales_timeline_city', {city: city});
    });
    track('sales_timeline_view', {n: all.length});
    /* лист ожидания и в пустой выдаче расписания */
    const emp = $('#sem-empty', main); if (emp && !$('[data-sx-wait]', emp)) emp.insertAdjacentHTML('beforeend', '<div class="row" style="justify-content:center;margin-top:14px"><button class="btn btn-fill btn-sm" type="button" data-sx-wait="" data-sx="schedule-wait">' + esc(cfg.noneCta) + '</button></div>');
  }
  document.addEventListener('click', e => {
    const w = e.target.closest && e.target.closest('[data-sx-wait]'); if (!w) return;
    let city = w.getAttribute('data-sx-wait') || ''; if (!city) { const on = $('#city-chips .chip.on'); city = on && on.getAttribute('data-id') !== 'all' ? (on.getAttribute('data-v') || on.textContent.trim()) : ''; }
    track('sales_waitlist', {city: city}); doForm('question', fill((PG.training || {}).noneRef, {city: city && city !== 'all' ? city : 'любой город'}));
  });

  /* ================= МЕРОПРИЯТИЕ: «Как проходит запись» ================= */
  function eventPage(c, main) {
    const e = c.event; if (!e || e.date < today()) return;
    const slot = $('#e-cta', main); if (!slot || mod('ticket', main)) return;
    const cfg = PG.event || {}, b = B[e.b] || {name: ''};
    const node = el('div', 'sx-ticket', '<b class="sx-tk-t">' + esc(cfg.title) + '</b><ol class="sx-steps3">' + (cfg.steps || []).map((s, i) => '<li><span class="sx-sq" aria-hidden="true">' + (i + 1) + '</span><div><b>' + esc(s.t) + '</b><p>' + esc(s.p) + '</p></div></li>').join('') + '</ol>' +
      '<div class="sx-tk-row"><button class="btn btn-ghost btn-sm" type="button" data-sx-colleague data-sx="colleague">' + I.users + ' ' + esc(cfg.colleague) + '</button><span class="sx-fine">' + esc(cfg.colleagueNote) + '</span></div>' +
      (b.name ? '<p class="sx-tk-after">' + esc(fill(cfg.after, {brand: b.name})) + ' ' + link(planPath + '?b=' + e.b, 'lnk', esc(cfg.afterCta) + ' ' + I.arrow, 'event-after') + '</p>' : ''), {'data-sx-mod': 'ticket'});
    slot.parentNode.insertBefore(node, slot.nextSibling);
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-sx-colleague]'); if (!b) return;
    const w = $('[data-event]'), e = w && EV[w.getAttribute('data-event')], cfg = PG.event || {}; if (!e) return;
    const url = location.href.split('#')[0], text = fill(cfg.shareText, {title: e.title, date: dShort(e.date), city: e.city});
    track('sales_colleague', {event: e.id});
    if (navigator.share) { navigator.share({title: e.title, text: text, url: url}).catch(() => {}); return; }
    const full = text + ' ' + url, done = () => A.toast && A.toast(cfg.copied);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(full).then(done, () => { A.toast && A.toast(full); }); else A.toast && A.toast(full);
  });

  /* ================= ПАРТНЁРЫ: «Ваш ориентир» ================= */
  function partners(c, main) {
    const calc = $('[data-calc]', main), range = $('#calc-range', main); if (!calc || !range || mod('ladder', calc)) return;
    const cfg = PG.partners || {}, tiers = (D.site.discounts || []).slice().sort((a, b) => a.from - b.from), maxp = Math.max.apply(null, tiers.map(t => t.pct));
    const box = el('div', 'sx-lad', '<b class="sx-lad-t">' + esc(cfg.title) + '</b><ol class="sx-lad-bars" aria-hidden="true">' + tiers.map((t, i) => '<li data-i="' + i + '" style="--h:' + Math.round(34 + 66 * (i + 1) / tiers.length) + '%"><b>' + t.pct + '%</b></li>').join('') + '</ol><p class="sx-lad-msg" aria-live="polite" data-lad-msg></p>' +
      '<button class="btn btn-fill btn-sm" type="button" data-lad-cta data-sx="ladder-cta"></button><p class="sx-fine">' + esc(cfg.fine) + '</p>', {'data-sx-mod': 'ladder'});
    calc.appendChild(box);
    const upd = () => {
      const sum = +range.value || 0, cur = tiers.filter(t => sum >= t.from).pop() || null, nxt = tiers.find(t => sum < t.from) || null, msg = $('[data-lad-msg]', box), cta = $('[data-lad-cta]', box);
      $$('.sx-lad-bars li', box).forEach((li, i) => li.classList.toggle('on', !!cur && tiers.indexOf(cur) >= i));
      msg.innerHTML = !cur ? esc(fill(cfg.start, {from: rub(tiers[0].from)})) + (nxt ? ' ' + esc(fill(cfg.toNext, {pct: nxt.pct, rest: rub(nxt.from - sum)})) + '.' : '') : nxt ? esc(fill(cfg.toNext, {pct: nxt.pct, rest: rub(nxt.from - sum)})) + '.' : esc(fill(cfg.top, {pct: maxp}));
      cta.textContent = sum > 0 ? fill(cfg.cta, {sum: rub(sum)}) : cfg.ctaNone; cta.setAttribute('data-sum', sum); cta.setAttribute('data-pct', cur ? cur.pct : 0);
    };
    range.addEventListener('input', upd); upd();
    box.addEventListener('click', e => { const b = e.target.closest('[data-lad-cta]'); if (!b) return; const sum = +b.getAttribute('data-sum') || 0, pct = +b.getAttribute('data-pct') || 0; track('sales_ladder_cta', {sum: sum, pct: pct}); K.setVia('ladder'); doForm('partner', sum ? 'Ориентир закупки: ' + rub(sum) + (pct ? ' · скидка ≈' + pct + '%' : '') : ''); });
  }
  document.addEventListener('astreya:form-open', e => {
    const d = e.detail || {}, f = d.form; if (d.type !== 'partner' || !f || !/^Ориентир закупки/.test(d.ref || '')) return;
    const msg = f.elements.msg; if (msg && !msg.value) { const m = /Ориентир закупки: ([^·]+)(?:· скидка ≈(\d+)%)?/.exec(d.ref || ''); if (m) { msg.value = fill((PG.partners || {}).msg, {sum: m[1].trim(), pct: m[2] || '0'}); if (A.autosize) A.autosize(msg); } }
  });

  /* ================= НОВОСТИ: у каждой новости — действие по её теме ================= */
  function news(c, main) {
    const map = {sale: ['partners.html#calc', 'Рассчитать скидку'], novelty: ['catalog.html', 'Смотреть в каталоге'], edu: ['training.html#sched', 'К расписанию'], event: ['training.html#sched', 'К расписанию']};
    $$('.newscard[data-cat]', main).forEach(card => {
      if ($('.sx-nact', card)) return; const m = map[card.getAttribute('data-cat')]; if (!m) return; const meta = $('.meta', card); if (!meta) return;
      const a = el('a', 'sx-nact z3', esc(m[1]) + ' ' + I.arrow, {href: href(m[0]), 'data-sx-go': m[0], 'data-sx': 'news-act'}); meta.parentNode.insertBefore(a, meta);
    });
  }

  /* ================= КОМПАНИЯ: «Ваш регион» ================= */
  function company(c, main) {
    if (mod('region', main)) return; const cfg = PG.company || {}, offs = SX.offices || []; if (!offs.length) return;
    const near = findSection(main, /Мы рядом/), anchorEl = near || $$('section', main).filter(s => $('.cta-band', s)).pop(); if (!anchorEl) return;
    const pref = K.city(), start = offs.find(o => o.city === pref) || offs[0];
    const sec = el('section', 'sx-mod sx-region', '<div class="wrap"><header class="sx-head"><span class="eyebrow">' + esc(cfg.eyebrow) + '</span><h2>' + esc(cfg.title) + '</h2><p class="lead">' + esc(cfg.lead) + '</p></header>' +
      '<div class="sx-reg-tabs" style="--n:' + offs.length + '" role="group" aria-label="' + esc(cfg.eyebrow) + '">' + offs.map((o, i) => '<button type="button" class="sx-reg-n' + (o.city === start.city ? ' on' : '') + '" data-sx-reg="' + esc(o.city) + '" aria-pressed="' + (o.city === start.city) + '"><small>0' + (i + 1) + '</small><span>' + esc(o.city) + '</span></button>').join('') + '</div>' +
      '<div class="sx-reg-card" data-sx-reg-card aria-live="polite"></div></div>', {'data-sx-mod': 'region'});
    anchorEl.parentNode.insertBefore(sec, near ? anchorEl.nextSibling : anchorEl);
    const tr = cfg.trust;
    if (tr && (tr.items || []).length && !mod('trust', main)) {
      const t = el('section', 'sx-mod sx-trust', '<div class="wrap"><header class="sx-head"><h2>' + esc(tr.title) + '</h2></header><ul class="sx-tl">' + tr.items.map(it => '<li><span class="sx-ti" aria-hidden="true">' + (I[it.icon] || I.check) + '</span><span><b>' + esc(it.title) + '</b><small>' + esc(it.text) + '</small></span></li>').join('') + '</ul>' + (tr.note ? '<p class="sx-fine">' + esc(tr.note) + '</p>' : '') + '</div>', {'data-sx-mod': 'trust'});
      sec.parentNode.insertBefore(t, sec.nextSibling);
    }
    const draw = city => {
      const o = offs.find(x => x.city === city) || offs[0], evs = upcoming(), ev = evs.find(e => e.city === o.city) || null, ol = evs.find(e => e.city === 'Онлайн') || null, ph = o.phones[0], more = o.phones.length - 1;
      $$('[data-sx-reg]', sec).forEach(b => { const on = b.getAttribute('data-sx-reg') === o.city; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $('[data-sx-reg-card]', sec).innerHTML = '<div class="sx-reg-col"><span class="eyebrow in">' + esc(cfg.office) + ' · ' + esc(o.role) + '</span><h3>' + esc(o.city) + '</h3><p>' + esc(o.addr) + '</p><p class="muted small">' + esc(o.hours) + '</p>' +
        '<div class="row">' + (ph ? '<a class="btn btn-fill btn-sm" href="tel:' + esc(ph.raw) + '" data-track="phone_click" data-sx="region-call">' + I.phone + ' ' + esc(ph.n) + '</a>' : '') + '<button class="btn btn-ghost btn-sm" type="button" data-sx-region-cb="' + esc(o.city) + '" data-sx="region-cb">' + esc(cfg.callback) + '</button></div>' + (more > 0 ? '<p class="sx-fine">' + esc(cfg.phones) + ': ' + o.phones.map(p => esc(p.n) + ' (' + esc(p.l) + ')').join(' · ') + '</p>' : '') + '</div>' +
        '<div class="sx-reg-col sx-reg-ev"><span class="eyebrow in">' + esc(cfg.seminar) + '</span>' + (ev ? '<h3>' + esc(ev.title) + '</h3><p class="muted">' + esc(dShort(ev.date)) + ' · ' + esc(ev.fm) + '</p><button class="btn btn-fill btn-sm" type="button" data-sx-act="seminar" data-ref="' + esc(ev.id) + '" data-sx="region-register">Записаться ' + I.arrow + '</button>'
        : '<p class="muted">' + esc(cfg.noSeminar) + '</p>' + (ol ? '<p><a href="' + esc(href(evUrl(ol))) + '" data-sx-go="' + esc(evUrl(ol)) + '" class="lnk">' + esc(ol.title) + ' · ' + esc(dShort(ol.date)) + '</a></p>' : link('training.html', 'lnk', esc(cfg.all), 'region-all'))) + '</div>';
    };
    draw(start.city); sec.addEventListener('click', e => { const b = e.target.closest('[data-sx-reg]'); if (b) { const city = b.getAttribute('data-sx-reg'); K.setCity(city); draw(city); track('sales_region', {city: city}); } const cb = e.target.closest('[data-sx-region-cb]'); if (cb) { K.setVia('region'); doForm((D.extras || {}).callback ? 'callback' : 'question', ''); const f = $('#modal form'); if (f && f.elements.city) f.elements.city.value = cb.getAttribute('data-sx-region-cb'); } });
  }

  /* ================= КОНТАКТЫ: «Сейчас на связи» ================= */
  function workStatus(hours) {
    const m = /(Пн|Вт|Ср|Чт|Пт|Сб|Вс)\s*[–-]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс)[^\d]*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(hours || ''); if (!m) return null;
    const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'], d1 = names.indexOf(m[1]), d2 = names.indexOf(m[2]), start = +m[3] * 60 + +m[4], end = +m[5] * 60 + +m[6];
    const days = []; for (let d = d1; ; d = (d + 1) % 7) { days.push(d); if (d === d2) break; if (days.length > 7) return null; }
    const now = new Date(Date.now() + 3 * 3600e3), dow = now.getUTCDay(), min = now.getUTCHours() * 60 + now.getUTCMinutes(), work = days.indexOf(dow) >= 0;
    const f = x => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'), where = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
    if (work && min >= start && min < end) return {on: true, end: f(end), start: f(start)};
    let when = 'сегодня'; if (!(work && min < start)) { let k = 1; while (k < 8 && days.indexOf((dow + k) % 7) < 0) k++; when = k === 1 ? 'завтра' : where[(dow + k) % 7]; }
    return {on: false, start: f(start), end: f(end), when: when};
  }
  function contacts(c, main) {
    const head = $('.page-head', main); if (!head || mod('status', main)) return; const cfg = PG.contacts || {}, st = workStatus(D.site.contacts.hours); if (!st) return;
    const node = el('div', 'sx-status ' + (st.on ? 'on' : 'off'), '<span class="sx-live" aria-hidden="true"><i></i><em>' + (st.on ? 'онлайн' : 'пауза') + '</em></span><div><b>' + esc(st.on ? cfg.on : cfg.off) + '</b><span>' + esc(st.on ? fill(cfg.onSub, {end: st.end}) : fill(cfg.offSub, {when: st.when, start: st.start})) + '</span></div>' +
      '<div class="sx-tips"><span>' + esc(cfg.tipsTitle) + '</span>' + (cfg.tips || []).map(t => '<em>' + esc(t) + '</em>').join('') + '</div>', {'data-sx-mod': 'status', role: 'status'});
    head.appendChild(node); track('sales_status', {on: st.on});
  }

  /* ================= общий обработчик кнопок модулей ================= */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-sx-act]'); if (!b) return;
    const k = b.getAttribute('data-sx-act'), ref = b.getAttribute('data-ref') || '';
    track('sales_mod_click', {act: k, page: document.body.getAttribute('data-page')});
    if (k === 'seminar') doForm('seminar', ref);
    else if (k === 'question') doForm('question', ref);
    else if (k === 'product') doForm('product', ref);
    else if (k === 'scroll-products') { const s = findSection($('#main'), /^Товары/); if (s) s.scrollIntoView({behavior: 'smooth', block: 'start'}); }
  });

  /* ================= монтирование ================= */
  A.salesPages = {
    mount: function (c) {
      const main = $('#main'); if (!main) return;
      switch (c.key) {
        case 'home': home(); break;
        case 'catalog': catalog(c, main); catalogRescue(main); break;
        case 'brands': brands(c, main); break;
        case 'brand': brand(c, main); break;
        case 'product': product(c, main); break;
        case 'training': training(c, main); break;
        case 'event': eventPage(c, main); break;
        case 'partners': partners(c, main); break;
        case 'news': news(c, main); break;
        case 'company': company(c, main); break;
        case 'contacts': contacts(c, main); break;
        case 'search': searchRescue(main); break;
        default: break;
      }
    },
    workStatus: workStatus
  };
})();
