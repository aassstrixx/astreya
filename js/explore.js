/* explore.js — выбор товара и мероприятия. Подключается вместе с extras.js (data/redesign.json → extras.enabled; по отдельности: quickView, compare, countdown).

   1) Быстрый просмотр (extras.quickView): на карточке товара — кнопка «Быстрый просмотр»; окно с крупной иллюстрацией, описанием, назначением, только теми
      характеристиками, которые есть в данных, и действиями (запрос, список запроса, сравнение). Стрелки ‹ › листают товары текущего списка.
   2) Сравнение (extras.compare): до трёх товаров; таблица «бренд / категория / вид / назначение / описание» (+ характеристики, если они заполнены хотя бы у одного
      товара), совпадающие задачи подсвечены, переключатель «Только различия». Выбор хранится в браузере (localStorage), плашка «Сравнение» — в общем доке.
   3) Обратный отсчёт (extras.countdown): до ближайшего мероприятия — на «Обучении», на главной (блок «Обучение специалистов») и на странице самого мероприятия.
      Время — московское (все мероприятия проходят в часовом поясе Москвы или онлайн).
   Страницы подменяются без перезагрузки: всё идемпотентно и перерисовывается в A.initPage. */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras) return;
  const X = D.extras, I = A.I, esc = A.esc;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const P = {}, B = {}, CAT = {}, TASK = {}, KIND = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.cats || []).forEach(c => { CAT[c.id] = c.name; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.kinds || []).forEach(k => { KIND[k.id] = k.name; });
  const root = () => document.body.getAttribute('data-root') || '';
  const store = {get: k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};
  const ICON = {
    eye: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z"/><circle cx="10" cy="10" r="2.4"/></svg>',
    cmp: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 7h11M11.5 4l3 3-3 3M16.5 13h-11M8.5 10l-3 3 3 3"/></svg>',
    chev: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 8 5 5 5-5"/></svg>',
    prev: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m12 4.5-5.5 5.5 5.5 5.5"/></svg>',
    next: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m8 4.5 5.5 5.5L8 15.5"/></svg>'
  };
  A.actions = A.actions || {};
  const brandName = id => (B[P[id].brand] || {}).name || '';
  const plural = A.plural || ((n, a, b, c) => c);

  /* иллюстрация товара — та же разметка, что у карточек на сервере (src/components.js → art) */
  function art(p, big) {
    const b = B[p.brand] || {}, st = A.bstyle ? A.bstyle(b) : '';
    /* на странице-витрине (extras.showroom) окно просмотра и сравнение показывают тот же 3D-макет упаковки, что и сцена */
    if (D.extras.showroom && !(p.im && D.showroom && D.showroom.photos) && A.packOf && A.stageArt && document.querySelector('[data-showroom]')) return A.stageArt({id: p.id, t: p.t}, A.assetUrl ? A.assetUrl(A.packOf(p)) : root() + A.packOf(p), {aria: b.name + ' — ' + p.name + ': иллюстрация упаковки', style: st, pod: big ? true : undefined, eager: true});
    if (p.im) return '<div class="art art-photo" style="' + esc(st) + '"><img src="' + esc(root() + p.im) + '" alt="' + esc(b.name + ' — ' + p.name) + '" loading="lazy" decoding="async"></div>';
    return '<div class="art" role="img" aria-label="' + esc(b.name + ' — ' + p.name + ': иллюстрация упаковки') + '" style="' + esc(st) + '"><div class="pk pk-' + esc(p.t || 'bottle') + '"><i class="sh"></i><i class="hd"></i><i class="cap"></i><i class="body"><b class="lbl"></b></i></div></div>';
  }
  const pUrl = p => root() + 'products/' + p.slug + '.html';

  /* ---------- 1. Быстрый просмотр ---------- */
  let qvIds = [], qvAt = 0, qvOpener = null;
  const rlHas = id => store.get('astreya:rl').indexOf(id) >= 0;
  const cmpGet = () => store.get('astreya:cmp').filter(id => P[id]);
  function qvBody(id) {
    const p = P[id], x = p.x || {}, rows = [['Бренд', esc(brandName(id))], ['Категория', esc(CAT[p.c] || '')], ['Вид', esc(KIND[p.k] || '')]];
    if (x.volume) rows.push(['Объём', esc(x.volume)]); if (x.sku) rows.push(['Артикул', esc(x.sku)]);
    if (x.actives) rows.push(['Активные компоненты', esc(x.actives.join(', '))]); if (x.indications) rows.push(['Показания', esc(x.indications.join(', '))]); if (x.usage) rows.push(['Способ применения', esc(x.usage)]);
    const inList = X.requestList && rlHas(id), inCmp = X.compare && cmpGet().indexOf(id) >= 0, many = qvIds.length > 1;
    return '<div class="qv-art">' + (p.n ? '<span class="newtag">Новинка</span>' : '') + art(p, true) + '</div><div class="qv-info">' +
      '<span class="eyebrow in">' + esc(brandName(id)) + '</span><h2 id="m-title">' + esc(p.name) + '</h2><p class="qv-d">' + esc(p.d || '') + '</p>' +
      '<div class="tasks-line">' + (p.ts || []).map(t => '<span class="tag blue">' + esc(TASK[t] || t) + '</span>').join('') + '</div>' +
      '<dl class="qv-spec">' + rows.filter(r => r[1]).map(r => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('') + '</dl>' +
      '<div class="qv-act"><button class="btn btn-fill" type="button" data-act="qv-ask" data-id="' + id + '">Запросить информацию ' + I.arrow + '</button>' +
      (X.requestList ? '<button class="btn btn-ghost" type="button" data-act="qv-list" data-id="' + id + '" aria-pressed="' + inList + '">' + (inList ? '✓ В списке запроса' : '+ В список запроса') + '</button>' : '') +
      (X.compare ? '<button class="btn btn-ghost" type="button" data-act="qv-cmp" data-id="' + id + '" aria-pressed="' + inCmp + '">' + ICON.cmp + (inCmp ? ' В сравнении' : ' Сравнить') + '</button>' : '') +
      (NAVI ? '<button class="btn btn-ghost" type="button" data-act="qv-stella" data-id="' + id + '">Спросить Стеллу</button>' : '') + '</div>' +
      '<a class="lnk qv-more" href="' + esc(pUrl(p)) + '" data-track="qv_to_page">Страница товара ' + I.arrow + '</a></div>' +
      (many ? '<div class="qv-nav" role="group" aria-label="Листать товары"><button type="button" data-act="qv-prev" aria-label="Предыдущий товар">' + ICON.prev + '</button><span aria-live="polite">' + (qvAt + 1) + ' из ' + qvIds.length + '</span><button type="button" data-act="qv-next" aria-label="Следующий товар">' + ICON.next + '</button></div>' : '');
  }
  function qvPaint(focusSel) {
    const m = $('#modal'); if (!m) return; m.innerHTML = '<div class="dlg qv-dlg" role="document"><button class="x" type="button" data-act="close" aria-label="Закрыть">' + I.close + '</button>' + qvBody(qvIds[qvAt]) + '</div>';
    const f = (focusSel && $(focusSel, m)) || $('[data-act="qv-ask"]', m); if (f) f.focus();
  }
  function qvOpen(id, opener) {
    const m = $('#modal'); if (!m || !P[id]) return;
    qvIds = $$('.pcard[data-id]:not([hidden])').map(c => c.getAttribute('data-id')).filter(i => P[i]); if (qvIds.indexOf(id) < 0) qvIds = [id]; qvAt = qvIds.indexOf(id); qvOpener = opener || document.activeElement;
    m.classList.remove('closing'); m.setAttribute('aria-hidden', 'false'); m.setAttribute('aria-labelledby', 'm-title'); m.classList.add('open'); document.body.classList.add('locked'); qvPaint();
    A.track && A.track('quick_view', {product: id});
  }
  const qvOn = () => { const m = $('#modal'); return !!(m && m.classList.contains('open') && $('.qv-dlg', m)); };
  function qvStep(d) { qvAt = (qvAt + d + qvIds.length) % qvIds.length; qvPaint(d > 0 ? '[data-act="qv-next"]' : '[data-act="qv-prev"]'); }
  function injectCards(root0) {
    $$('.pcard[data-id]', root0 || document).forEach(card => {
      const id = card.getAttribute('data-id'); if (!P[id]) return;
      if (X.quickView && !$('.qv-btn', card)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'qv-btn'; b.setAttribute('data-act', 'qv-open'); b.setAttribute('data-id', id); b.innerHTML = ICON.eye + '<span>Быстрый просмотр</span>'; b.setAttribute('aria-label', 'Быстрый просмотр: ' + P[id].name); card.appendChild(b); }       // кнопка — прямой потомок карточки (как «+»): внутри .art она оказалась бы под «растянутой» ссылкой
      if (X.compare && !$('.cmp-add', card)) { const c = document.createElement('button'); c.type = 'button'; c.className = 'cmp-add'; c.setAttribute('data-act', 'cmp-toggle'); c.setAttribute('data-id', id); c.setAttribute('data-cmp-id', id); c.innerHTML = ICON.cmp; card.appendChild(c); }
    });
    cmpSync();
  }

  /* ---------- 2. Сравнение ---------- */
  /* с навигатором (extras.navigator) таблицы сравнения нет: выбранные товары собираются на плашке, а рассказывает о них и сравнивает Стелла (js/assistant.js → A.stella.compare) */
  const NAVI = !!(X.navigator && D.guide), GC = (D.guide && D.guide.compare) || {};
  const CMAX = NAVI && GC.max ? GC.max : 3; let cmpOnly = false, cmpRestore = null;
  function cmpBar() { let el = $('#cmp-bar'); if (el) return el; el = document.createElement('div'); el.id = 'cmp-bar'; el.className = 'cmp-bar'; el.hidden = true; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Сравнение товаров');
    if (NAVI) {
      el.className = 'cmp-bar cmp-stella'; el.setAttribute('data-style', GC.plateStyle || 'full');          // full · compact · stacked
      el.innerHTML = '<span class="cmp-pe" aria-hidden="true">' + (A.pearl ? A.pearl('happy', true) : '') + '</span><div class="cmp-main"><div class="cmp-info"><b class="cmp-count" aria-hidden="true">0</b><span class="cmp-txt"></span></div><ul class="cmp-names"></ul></div>' +
        '<button class="cmp-ask" type="button" data-act="cmp-ask" data-track="cmp_ask_stella"><span class="cmp-ask-t"></span> ' + I.arrow + '</button><button class="cmp-clr" type="button" data-act="cmp-clear" aria-label="Очистить сравнение" title="Очистить">' + I.close + '</button>';
      A.dock().appendChild(el); return el;
    }
    el.innerHTML = '<button class="cmp-open" type="button" data-act="cmp-open" aria-haspopup="dialog"><span class="cmp-count" aria-hidden="true">0</span><span class="cmp-txt"></span><span class="cmp-go" aria-hidden="true"><span class="cmp-go-t">Сравнить</span> ' + I.arrow + '</span></button>'; A.dock().appendChild(el); return el; }
  function cmpSync(bump) {
    if (!X.compare) return; const l = cmpGet(), el = cmpBar(), n = l.length;
    $$('[data-cmp-id]').forEach(b => { const id = b.getAttribute('data-cmp-id'), on = l.indexOf(id) >= 0; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', (on ? 'Убрать из сравнения: ' : 'Добавить к сравнению: ') + P[id].name); b.title = on ? 'Убрать из сравнения' : 'Сравнить'; });
    $('.cmp-count', el).textContent = n;
    if (NAVI) {
      $('.cmp-txt', el).innerHTML = n < 2 ? '<span class="sr">Сравнение: </span>1 товар · добавьте ещё, чтобы сравнить' : '<span class="sr">Сравнение: </span>' + n + ' ' + plural(n, 'товар', 'товара', 'товаров') + ' на сравнение';
      $('.cmp-names', el).innerHTML = l.map(id => '<li><span>' + esc(P[id].name) + '</span><button type="button" data-act="cmp-del" data-id="' + id + '" aria-label="Убрать из сравнения: ' + esc(P[id].name) + '">' + I.close + '</button></li>').join('');
      const mob = matchMedia('(max-width:640px)').matches; $('.cmp-ask-t', el).textContent = mob ? (GC.plateShort || 'Спросить Стеллу') : (GC.plate || 'Попросить Стеллу рассказать');
      el.hidden = n === 0 || document.body.classList.contains('x-intro'); A.dockUpdate && A.dockUpdate();
      if (bump && !el.hidden) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      return;
    }
    const go = $('.cmp-go', el), op = $('.cmp-open', el); go.hidden = n < 1; $('.cmp-go-t', el).textContent = n < 2 ? 'Открыть' : 'Сравнить'; op.disabled = n < 1; op.setAttribute('aria-disabled', String(n < 1));       // таблица открывается уже с одним товаром: остальные добавляются прямо в ней
    el.hidden = n === 0 || document.body.classList.contains('x-intro'); A.dockUpdate && A.dockUpdate();
    if (bump && !el.hidden) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  A.cmpSync = () => cmpSync();
  function cmpToggle(id) {
    if (!P[id]) return; let l = cmpGet();
    if (l.indexOf(id) >= 0) { l = l.filter(x => x !== id); A.toast('Убрано из сравнения: ' + P[id].name); A.track && A.track('cmp_remove', {product: id}); }
    else { if (l.length >= CMAX) { A.toast('Сравнивать можно до ' + CMAX + ' товаров — уберите один из выбранных'); return; } l = l.concat(id); A.toast('Добавлено к сравнению: ' + P[id].name + ' (' + l.length + ' из ' + CMAX + ')'); A.track && A.track('cmp_add', {product: id}); }
    store.set('astreya:cmp', l); cmpSync(true); if (cmpPanelOn()) cmpPaint(); if (qvOn()) qvPaint('[data-act="qv-cmp"]');
  }
  const cmpPanelOn = () => { const m = $('#modal'); return !!(m && m.classList.contains('open') && $('.cmp-dlg', m)); };
  function cmpTable(l) {
    const ps = l.map(id => P[id]); const taskCount = {}; ps.forEach(p => (p.ts || []).forEach(t => { taskCount[t] = (taskCount[t] || 0) + 1; }));
    const rows = [
      ['Бренд', ps.map(p => esc(brandName(p.id)))], ['Категория', ps.map(p => esc(CAT[p.c] || '—'))], ['Вид', ps.map(p => esc(KIND[p.k] || '—'))],
      ['Назначение', ps.map(p => (p.ts || []).length ? (p.ts || []).map(t => '<span class="tag' + (taskCount[t] > 1 ? ' blue' : '') + '">' + esc(TASK[t] || t) + '</span>').join('') : '—')],
      ['Новинка', ps.map(p => p.n ? 'Да' : '—')], ['Описание', ps.map(p => esc(p.d || '—'))]
    ];
    [['volume', 'Объём'], ['sku', 'Артикул'], ['actives', 'Активные компоненты'], ['indications', 'Показания'], ['usage', 'Способ применения']].forEach(([k, lb]) => {
      if (ps.some(p => p.x && p.x[k])) rows.push([lb, ps.map(p => p.x && p.x[k] ? esc([].concat(p.x[k]).join(', ')) : '<span class="tbd">Уточняется</span>')]);
    });
    const body = rows.filter(r => !cmpOnly || new Set(r[1]).size > 1).map(r => '<tr><th scope="row">' + r[0] + '</th>' + r[1].map(c => '<td>' + c + '</td>').join('') + '</tr>').join('');
    const head = '<tr><td></td>' + ps.map(p => '<th scope="col"><div class="cmp-card">' + art(p) + '<a href="' + esc(pUrl(p)) + '"><b>' + esc(p.name) + '</b></a><button class="cmp-x" type="button" data-act="cmp-del" data-id="' + p.id + '" aria-label="Убрать из сравнения: ' + esc(p.name) + '">' + I.close + '</button></div></th>').join('') + '</tr>';
    const foot = '<tr><td></td>' + ps.map(p => '<td><button class="btn btn-fill btn-sm" type="button" data-act="qv-ask" data-id="' + p.id + '">Запросить</button></td>').join('') + '</tr>';
    return '<div class="cmp-wrap"><table class="cmp-t" style="--n:' + ps.length + '"><thead>' + head + '</thead><tbody>' + (body || '<tr><td colspan="' + (ps.length + 1) + '" class="muted">Различий в этих полях нет.</td></tr>') + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
  }
  /* выбор ещё одного товара прямо в окне: сначала «похожие по задаче», затем весь каталог по брендам */
  function cmpPicker(l) {
    const mine = new Set(); l.forEach(id => (P[id].ts || []).forEach(t => mine.add(t)));
    const rest = (D.products || []).filter(p => l.indexOf(p.id) < 0), opt = p => '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    const near = rest.filter(p => (p.ts || []).some(t => mine.has(t))), far = rest.filter(p => near.indexOf(p) < 0);
    const groups = (D.brands || []).map(b => { const g = far.filter(p => p.brand === b.id); return g.length ? '<optgroup label="' + esc(b.name) + '">' + g.map(opt).join('') + '</optgroup>' : ''; }).join('');
    return '<label class="cmp-pick"><span>Добавить товар к сравнению</span><select data-act="cmp-pick" aria-label="Добавить товар к сравнению"><option value="">Выберите товар…</option>' + (near.length ? '<optgroup label="Похожие по задаче">' + near.map(opt).join('') + '</optgroup>' : '') + groups + '</select></label>';
  }
  function cmpHTML() {
    const l = cmpGet();
    return '<div class="dlg cmp-dlg" role="document"><button class="x" type="button" data-act="close" aria-label="Закрыть">' + I.close + '</button><span class="eyebrow in">Сравнение</span><h2 id="m-title">Сравнение товаров</h2>' +
      (!l.length ? '<p class="muted">Пока ничего не выбрано — нажмите ⇄ на карточке товара.</p>' :
        '<p class="muted">' + (l.length < 2 ? 'Это данные одного товара. Добавьте ещё один — таблица покажет сходства и различия.' : 'Показаны данные из каталога; чего в нём нет, уточняет менеджер. Совпадающие задачи выделены.') + '</p>' +
        (l.length >= 2 ? '<label class="chk cmp-only"><input type="checkbox" data-act="cmp-only"' + (cmpOnly ? ' checked' : '') + '> Только различия</label>' : '') + cmpTable(l) + (l.length < CMAX ? cmpPicker(l) : '')) +
      '<div class="rl-actions">' + (l.length ? '<button class="btn btn-lnk" type="button" data-act="cmp-clear">Очистить сравнение</button>' : '') + '</div></div>';
  }
  function cmpPaint() { const m = $('#modal'); if (!m) return; const keep = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-act'); m.innerHTML = cmpHTML(); const f = (keep && $('[data-act="' + keep + '"]', m)) || $('.x', m); if (f) f.focus(); }
  function cmpOpen(opener) {
    const m = $('#modal'); if (!m || cmpGet().length < 1) return; cmpRestore = opener || document.activeElement;
    m.classList.remove('closing'); m.setAttribute('aria-hidden', 'false'); m.setAttribute('aria-labelledby', 'm-title'); m.innerHTML = cmpHTML(); m.classList.add('open'); document.body.classList.add('locked');
    A.track && A.track('cmp_open', {count: cmpGet().length}); setTimeout(() => { const f = $('.x', m); if (f) f.focus(); }, 40);
  }

  /* ---------- 3. Обратный отсчёт до ближайшего мероприятия ---------- */
  const MSK = '+03:00';
  const startOf = e => { const m = /(\d{1,2})[:.](\d{2})/.exec(e.tm || ''); return new Date(e.date + 'T' + (m ? String(m[1]).padStart(2, '0') + ':' + m[2] : '10:00') + ':00' + MSK); };
  const endOf = e => { const m = /[–—-]\s*(\d{1,2})[:.](\d{2})/.exec(e.tm || ''); return m ? new Date(e.date + 'T' + String(m[1]).padStart(2, '0') + ':' + m[2] + ':00' + MSK) : new Date(startOf(e).getTime() + 6 * 36e5); };
  function nextEvent() { const now = Date.now(); return (D.events || []).filter(e => endOf(e).getTime() > now).sort((a, b) => startOf(a) - startOf(b))[0] || null; }
  function cdParts(ev) {
    const diff = startOf(ev).getTime() - Date.now(); if (diff <= 0) return null; const m = Math.floor(diff / 6e4);
    return {d: Math.floor(m / 1440), h: Math.floor(m % 1440 / 60), m: m % 60};
  }
  function cdFill(box) {
    const ev = (D.events || []).find(e => e.id === box.getAttribute('data-ev')); if (!ev) { box.hidden = true; return; }
    const p = cdParts(ev), b = $('.cd-b', box); box.hidden = false;
    if (!p) { b.innerHTML = '<span class="cd-live">Идёт сейчас</span>'; return; }
    const cell = (n, w) => '<span><b>' + String(n).padStart(2, '0') + '</b>' + w + '</span>';
    b.innerHTML = cell(p.d, plural(p.d, 'день', 'дня', 'дней')) + cell(p.h, 'ч') + cell(p.m, 'мин');
    box.setAttribute('aria-label', 'До начала: ' + p.d + ' ' + plural(p.d, 'день', 'дня', 'дней') + ' ' + p.h + ' ч ' + p.m + ' мин');
  }
  function cdBox(ev, label) {
    const d = A.dparts ? A.dparts(ev.date) : {full: ev.date};
    const el = document.createElement('div'); el.className = 'cd'; el.setAttribute('data-ev', ev.id); el.setAttribute('role', 'timer');
    el.innerHTML = '<div class="cd-t"><small>' + esc(label) + '</small><b>' + esc(ev.title) + '</b><em>' + esc([d.full, ev.tm, ev.city].filter(Boolean).join(' · ')) + ' · время московское</em></div><div class="cd-b" aria-hidden="true"></div>' +
      '<button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="seminar" data-ref="' + esc(ev.id) + '" data-track="countdown_register">Записаться ' + I.arrow + '</button>';
    cdFill(el); return el;
  }
  let cdTimer = 0;
  function countdown() {
    if (!X.countdown) return; $$('.cd').forEach(e => e.remove()); clearInterval(cdTimer);
    const page = document.body.getAttribute('data-page'), slot = $('.cd-slot'), ev = nextEvent();
    const put = (box, fallback) => { if (slot) { slot.appendChild(box); slot.classList.add('on'); } else if (fallback) fallback.insertAdjacentElement('afterend', box); };
    if (!ev) { if (slot) slot.hidden = true; return; }
    if (page === 'training') put(cdBox(ev, 'Ближайшее мероприятие'), $('[data-training] .page-head'));
    else if (page === 'home') put(cdBox(ev, 'До начала'), $('.rd-train-copy .rd-next'));
    else if (page === 'event') { const w = $('[data-event]'), me = w && (D.events || []).find(e => e.id === w.getAttribute('data-event')); if (me && cdParts(me)) put(cdBox(me, 'До начала'), $('.e-top > div:last-child .lead')); else if (slot) slot.hidden = true; }
    if (slot && !slot.classList.contains('on')) slot.hidden = true;
    cdTimer = setInterval(() => $$('.cd').forEach(cdFill), 30000);
  }

  /* ---------- события ---------- */
  A.actions['qv-open'] = (t, id) => qvOpen(id || t.getAttribute('data-id'), t);
  A.actions['qv-prev'] = () => qvStep(-1); A.actions['qv-next'] = () => qvStep(1);
  A.actions['qv-ask'] = (t, id) => { id = id || t.getAttribute('data-id'); const back = qvOpener; A.closeModal(); setTimeout(() => { A.openForm('product', id); }, 330); void back; };
  A.actions['qv-stella'] = (t, id) => { id = id || t.getAttribute('data-id'); if (!P[id] || !A.stella) return; A.closeModal(); setTimeout(() => A.stella.ask((GC.requestOne || 'Расскажи о выбранном товаре: {names}').replace('{names}', P[id].name), {cmp: [id]}), 380); };          // «Спросить Стеллу» в быстром просмотре
  A.actions['qv-list'] = (t, id) => { id = id || t.getAttribute('data-id'); if (A.actions['rl-add']) A.actions['rl-add'](t, id); qvPaint('[data-act="qv-list"]'); };
  A.actions['qv-cmp'] = (t, id) => cmpToggle(id || t.getAttribute('data-id'));
  A.actions['cmp-toggle'] = (t, id) => cmpToggle(id || t.getAttribute('data-id'));
  A.actions['cmp-open'] = t => { if (NAVI) { if (A.stella) A.stella.compare(cmpGet()); return; } cmpOpen(t); };
  A.actions['cmp-ask'] = () => { if (A.stella) A.stella.compare(cmpGet()); };
  A.actions['cmp-del'] = (t, id) => cmpToggle(id || t.getAttribute('data-id'));
  A.actions['cmp-clear'] = () => { store.set('astreya:cmp', []); cmpSync(); if (cmpPanelOn()) cmpPaint(); A.toast('Сравнение очищено'); };
  document.addEventListener('change', e => { const t = e.target, a = t && t.getAttribute && t.getAttribute('data-act'); if (a === 'cmp-only') { cmpOnly = t.checked; cmpPaint(); } else if (a === 'cmp-pick' && t.value) { cmpToggle(t.value); } });
  document.addEventListener('keydown', e => { if (qvOn() && qvIds.length > 1 && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { if (e.key === 'ArrowLeft') { e.preventDefault(); qvStep(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); qvStep(1); } } });
  document.addEventListener('astreya:rl', () => { if (qvOn()) qvPaint(document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-act') ? '[data-act="' + document.activeElement.getAttribute('data-act') + '"]' : null); });
  window.addEventListener('storage', e => { if (e.key === 'astreya:cmp') cmpSync(); });
  document.addEventListener('astreya:intro', () => cmpSync());
  /* после закрытия окна возвращаем фокус на кнопку, с которой его открыли */
  const mm = $('#modal'); if (mm) new MutationObserver(() => { if (mm.getAttribute('aria-hidden') === 'true') { const r = qvOpener || cmpRestore; qvOpener = cmpRestore = null; if (r) setTimeout(() => { if (r.isConnected && r.focus && r.offsetParent !== null) r.focus(); }, 60); } }).observe(mm, {attributes: true, attributeFilter: ['aria-hidden']});

  function init() { injectCards(document); if (X.compare) cmpSync(); countdown(); }
  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
