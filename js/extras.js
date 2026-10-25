/* extras.js — дополнения интерфейса. Подключается при site.redesign и data/redesign.json → extras.enabled (по отдельности: requestList, quickContact).
   Работает поверх готовой разметки: без JS страницы остаются прежними, а при выключенном флаге файл вообще не подключается.

   1) «Список запроса» — на карточке товара (справа вверху) и на странице товара появляется кнопка «+»: можно собрать несколько позиций и отправить
      одной заявкой. Список хранится в браузере (localStorage, до 12 позиций), внизу экрана — плашка «В списке: N», по ней открывается
      окно со списком. Отправка идёт через обычную форму «Запросить информацию» (те же поля, согласие, защита от спама, админка заявок):
      тема — «Список запроса (N): названия», полный список — в тексте сообщения. После отправленной заявки список очищается.
   2) Быстрая связь на телефоне (≤ 900 px) — круглая кнопка внизу справа: «Позвонить» и мессенджеры MAX / Telegram / ВКонтакте (контакты из data/site.json и «Интеграции»).
      Показывается после небольшой прокрутки, не мешает вступлению на главной, подвалу и открытым окнам.
   3) «Вы недавно смотрели» (extras.recent) — на странице товара запоминаем товар (localStorage, до 8 штук, только id), на странице товара и в каталоге
      показываем до четырёх последних (кроме текущего). Блок можно очистить.
   4) «Заказать звонок» (extras.callback) — форма из двух полей (имя, телефон); кнопки: в подвале, на странице товара и в меню быстрой связи.
   Страницы подменяются без перезагрузки — поэтому работаем делегированием и перерисовываем кнопки в A.initPage. */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras) return;
  const X = D.extras, I = A.I, esc = A.esc;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const KEY = 'astreya:rl', MAX = 12;
  const P = {}, B = {}; (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; });
  const PLUS = '<svg class="ic i-pl" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4.5v11M4.5 10h11"/></svg>';
  const CHECK = '<svg class="ic i-ck" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>';
  const brandOf = id => (B[P[id].brand] || {}).name || '';
  const noun = n => A.plural ? A.plural(n, 'товар', 'товара', 'товаров') : 'позиций';

  A.actions = A.actions || {};

  /* Общий «док» внизу экрана: плашки «В списке» (extras.js) и «Сравнение» (explore.js) стоят рядом; плавающие кнопки поднимаются над ним */
  A.dock = function () { let d = document.getElementById('xdock'); if (!d) { d = document.createElement('div'); d.id = 'xdock'; d.className = 'xdock'; document.body.appendChild(d); } return d; };
  A.dockUpdate = function () {
    const d = A.dock(), any = Array.prototype.some.call(d.children, c => !c.hidden); document.body.classList.toggle('dock-on', any);
    requestAnimationFrame(() => { document.body.style.setProperty('--dock-h', any ? Math.round(d.getBoundingClientRect().height + 12) + 'px' : '0px'); });
  };

  /* ---------- Список запроса ---------- */
  let mem = [], list = [], sending = false, restore = null, introSeen = false;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(id => P[id]).slice(0, MAX) : []; } catch (e) { return mem.filter(id => P[id]); } };
  const save = l => { mem = l.slice(); try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {} };
  const has = id => list.indexOf(id) >= 0;

  function label(id, on) { return (on ? 'Убрать из списка запроса: ' : 'Добавить в список запроса: ') + P[id].name; }
  function addBtn(id) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rl-add'; b.setAttribute('data-act', 'rl-add'); b.setAttribute('data-id', id); b.setAttribute('data-rl-id', id);
    b.innerHTML = PLUS + CHECK; return b;
  }
  function inject(root) {
    root = root || document;
    $$('.pcard[data-id]', root).forEach(card => {                                              // кнопка «+» — в правом верхнем углу карточки, вёрстку подвала карточки не трогаем
      if ($('.rl-add', card)) return;
      const id = card.getAttribute('data-id'); if (P[id]) card.appendChild(addBtn(id));
    });
    const hero = $('[data-product] [data-place="product-hero"]', root);                       // страница товара: рядом с «Запросить информацию»
    if (hero && !$('.rl-tog', hero.parentNode)) {
      const id = hero.getAttribute('data-ref'); if (!P[id]) return;
      const t = document.createElement('button'); t.type = 'button'; t.className = 'btn btn-ghost rl-tog'; t.setAttribute('data-act', 'rl-add'); t.setAttribute('data-id', id); t.setAttribute('data-rl-id', id);
      t.innerHTML = PLUS + CHECK + '<span class="rl-tl"></span>'; hero.parentNode.insertBefore(t, hero.nextSibling);
    }
  }

  function bar() {
    let el = $('#rl-bar'); if (el) return el;
    el = document.createElement('div'); el.id = 'rl-bar'; el.className = 'rl-bar'; el.hidden = true; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Список запроса');
    el.innerHTML = '<button class="rl-open" type="button" data-act="rl-open" aria-haspopup="dialog"><span class="rl-count" aria-hidden="true">0</span><span class="rl-txt"></span><span class="rl-go" aria-hidden="true">Открыть ' + I.arrow + '</span></button>';
    A.dock().appendChild(el); return el;
  }
  function sync(bump) {
    if (!X.requestList) return;
    $$('[data-rl-id]').forEach(b => {
      const id = b.getAttribute('data-rl-id'), on = has(id);
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', label(id, on)); b.title = on ? 'Убрать из списка запроса' : 'Добавить в список запроса';
      const tl = $('.rl-tl', b); if (tl) tl.textContent = on ? 'В списке запроса' : 'В список запроса';
    });
    const el = bar(), n = list.length;
    $('.rl-count', el).textContent = n; $('.rl-txt', el).innerHTML = '<span class="sr">Список запроса: </span>' + n + ' ' + noun(n);
    const show = n > 0 && !introSeen; el.hidden = !show; A.dockUpdate();
    if (bump && show) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    document.dispatchEvent(new CustomEvent('astreya:rl', {detail: list.slice()}));
  }
  A.rlSync = () => sync();                                                                   // чат помощника перерисовывает свои кнопки «+»
  A.rlAdd = ids => { let n = 0; (ids || []).forEach(id => { if (P[id] && !has(id) && list.length < MAX) { list = list.concat(id); n++; A.track('rl_add', {product: id, via: 'plan'}); } }); if (n) { save(list); sync(true); } return n; };      // добавить сразу несколько («Старт со Стеллой»): только по явному нажатию, уже добавленные пропускаются
  A.rlHas = id => has(id);
  const panelOpen = () => { const m = $('#modal'); return !!(m && m.classList.contains('open') && $('.rl-dlg', m)); };
  function toggle(id) {
    if (!P[id]) return;
    if (has(id)) { list = list.filter(x => x !== id); A.toast('Убрано из списка запроса: ' + P[id].name); A.track('rl_remove', {product: id}); }
    else {
      if (list.length >= MAX) { A.toast('В списке запроса не больше ' + MAX + ' позиций — отправьте его и соберите новый'); return; }
      list = list.concat(id); A.toast('Добавлено в список запроса: ' + P[id].name + ' (' + list.length + ')'); A.track('rl_add', {product: id});
    }
    save(list); sync(true);
  }

  /* окно со списком — в готовом #modal: его закрытие (крестик, Esc, клик по фону) и ловушка фокуса уже есть в core.js */
  function panelHTML() {
    const n = list.length;
    const items = list.map(id => `<li class="rl-item"><div><b>${esc(P[id].name)}</b><small>${esc(brandOf(id))}</small></div><button class="rl-del" type="button" data-act="rl-del" data-id="${id}" aria-label="Убрать из списка: ${esc(P[id].name)}">${I.close}</button></li>`).join('');
    return `<div class="dlg rl-dlg" role="document">
      <button class="x" type="button" data-act="close" aria-label="Закрыть">${I.close}</button>
      <span class="eyebrow in">Заявка</span>
      <h2 id="m-title">Список запроса</h2>
      ${n ? `<p class="muted">Отправьте все позиции одним запросом: менеджер пришлёт информацию и условия поставки по каждой.</p>
      <ul class="rl-list">${items}</ul>
      <div class="rl-actions"><button class="btn btn-fill" type="button" data-act="rl-send">Отправить запрос (${n}) ${I.arrow}</button><button class="btn btn-lnk" type="button" data-act="rl-clear">Очистить список</button></div>`
      : `<p class="muted">Список пуст. Нажмите «+» на карточке товара — и позиция появится здесь.</p><div class="rl-actions"><a class="btn btn-fill" href="${esc((document.body.getAttribute('data-root') || '') + 'catalog.html')}" data-act="close">Перейти в каталог ${I.arrow}</a></div>`}
    </div>`;
  }
  function paintPanel() { const m = $('#modal'); if (!m) return; const keep = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-act'); m.innerHTML = panelHTML(); const f = (keep && $('[data-act="' + keep + '"]', m)) || $('[data-act="rl-send"]', m) || $('.x', m); if (f) f.focus(); }
  function openPanel(opener) {
    const m = $('#modal'); if (!m) return;
    restore = opener || document.activeElement; m.classList.remove('closing'); m.innerHTML = panelHTML();
    m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); m.setAttribute('aria-labelledby', 'm-title'); document.body.classList.add('locked');
    A.track('rl_open', {count: list.length}); setTimeout(() => { const f = $('[data-act="rl-send"]', m) || $('.x', m); if (f) f.focus(); }, 40);
  }
  function send() {
    if (!list.length) return;
    const names = list.map(id => P[id].name); let used = [], ctx = 'Список запроса (' + list.length + '): ';
    for (let i = 0; i < names.length; i++) { if ((ctx + used.concat(names[i]).join('; ')).length > 262) break; used.push(names[i]); }       // поле «тема» на сервере — до 300 знаков
    ctx += used.join('; ') + (used.length < names.length ? '… и ещё ' + (names.length - used.length) : '');
    const msg = 'Интересуют позиции (' + list.length + '):\n' + list.map((id, i) => (i + 1) + '. ' + (brandOf(id) ? brandOf(id) + ' · ' : '') + P[id].name).join('\n') + '\n\nПришлите, пожалуйста, информацию и условия поставки по каждой позиции.';
    sending = true; A.openForm('product', ctx);
    const f = $('#modal form'); if (f && f.elements.msg) f.elements.msg.value = msg;
    A.track('rl_send', {count: list.length});
  }
  /* следим за окном: отправленная заявка очищает список; после закрытия возвращаем фокус */
  function onModal() {
    const m = $('#modal'); if (!m) return;
    if (sending) { const h = $('.ok h3', m); if (h && /^Заявка отправлена/.test(h.textContent)) { sending = false; list = []; save(list); sync(); A.track('rl_sent'); } }
    if (m.getAttribute('aria-hidden') === 'true') {
      sending = false;
      if (restore) { const r = restore; restore = null; setTimeout(() => { if (r.isConnected && r.focus && r.offsetParent !== null) r.focus(); else { const o = $('#rl-bar .rl-open'); if (o && !o.closest('[hidden]')) o.focus(); } }, 60); }
    }
  }

  /* ---------- Быстрая связь (телефон) ---------- */
  let qcFooter = false, qcRaf = 0;
  function qc() {
    let el = $('#qc'), page = document.body.getAttribute('data-page');
    if (!X.quickContact || page === 'contacts' || page === 'notfound') { if (el) el.hidden = true; return; }
    if (!el) {
      const c = D.site.contacts || {}, ms = [['MAX', c.max], ['Telegram', c.telegram], ['ВКонтакте', c.vk]].filter(m => m[1]);
      el = document.createElement('div'); el.id = 'qc'; el.className = 'qc'; el.hidden = false;
      el.innerHTML = `<div class="qc-menu" id="qc-menu" hidden>
        <a class="qc-item" href="tel:${esc(c.phoneRaw)}" data-track="phone_click" data-place="quick"><span class="qc-ic">${I.phone}</span><span><b>Позвонить</b><small>${esc(c.phone)}</small></span></a>
        ${ms.map(m => `<a class="qc-item" href="${esc(m[1])}" target="_blank" rel="noopener" data-track="messenger_click" data-place="quick"><span class="qc-ic">${I.chat}</span><span><b>${m[0]}</b><small>Написать сообщение</small></span></a>`).join('')}
        ${X.callback ? `<button class="qc-item" type="button" data-act="form" data-type="callback" data-track="callback_open" data-place="quick"><span class="qc-ic">${I.clock}</span><span><b>Заказать звонок</b><small>Перезвоним в рабочее время</small></span></button>` : ''}
      </div>
      <button class="qc-btn" type="button" aria-expanded="false" aria-controls="qc-menu" aria-label="Связаться с нами">${I.phone}</button>`;
      document.body.appendChild(el);
    }
    el.hidden = false; qcUpdate();
  }
  function qcClose() { const el = $('#qc'); if (!el) return; const b = $('.qc-btn', el), m = $('#qc-menu', el); if (b) b.setAttribute('aria-expanded', 'false'); if (m) m.hidden = true; el.classList.remove('open'); }
  function qcUpdate() {
    const el = $('#qc'); if (!el || el.hidden) return;
    const on = window.scrollY > 480 && !introSeen && !qcFooter; el.classList.toggle('on', on); if (!on) qcClose();
  }
  function onScroll() { if (qcRaf) return; qcRaf = requestAnimationFrame(() => { qcRaf = 0; qcUpdate(); }); }

  /* вступление на главной (баночка, лозунг) и подвал: поверх них плавающие кнопки не показываем */
  let io = null;
  function setIntro() { document.body.classList.toggle('x-intro', introSeen); document.dispatchEvent(new CustomEvent('astreya:intro', {detail: introSeen})); }
  function watch() {
    if (io) io.disconnect();
    introSeen = false; qcFooter = false; setIntro();
    if (!('IntersectionObserver' in window)) return;
    const state = new Map();
    io = new IntersectionObserver(es => {
      es.forEach(e => state.set(e.target, e.isIntersecting));
      introSeen = ['#jar-story', '#jar-outro', '#arch-story'].some(s => { const t = $(s); return t && state.get(t); });
      qcFooter = !!(state.get($('.ftr')));
      setIntro(); sync(); qcUpdate();
    }, {threshold: 0});
    ['#jar-story', '#jar-outro', '#arch-story', '.ftr'].forEach(s => { const t = $(s); if (t) io.observe(t); });
  }

  /* ---------- «Вы недавно смотрели» ---------- */
  const RV = 'astreya:rv', RVMAX = 8, RVSHOW = 4;
  const rvLoad = () => { try { const v = JSON.parse(localStorage.getItem(RV) || '[]'); return Array.isArray(v) ? v.filter(id => P[id]) : []; } catch (e) { return []; } };
  const rvSave = l => { try { localStorage.setItem(RV, JSON.stringify(l)); } catch (e) {} };
  const root = () => document.body.getAttribute('data-root') || '';
  function rvArt(p) {
    const b = B[p.brand] || {}, st = A.bstyle ? A.bstyle(b) : '';
    if (p.im) return '<div class="art art-photo" style="' + esc(st) + '"><img src="' + esc(root() + p.im) + '" alt="' + esc(b.name + ' — ' + p.name) + '" loading="lazy" decoding="async"></div>';
    return '<div class="art" role="img" aria-label="' + esc(b.name + ' — ' + p.name + ': иллюстрация упаковки') + '" style="' + esc(st) + '"><div class="pk pk-' + esc(p.t || 'bottle') + '"><i class="sh"></i><i class="hd"></i><i class="cap"></i><i class="body"><b class="lbl"></b></i></div></div>';
  }
  function recent() {
    if (!X.recent) return;
    const old = $('#recent'); if (old) old.remove();
    const page = document.body.getAttribute('data-page'), cur = page === 'product' ? (($('.p-page[data-product]') || {getAttribute: () => ''}).getAttribute('data-product')) : '';
    let l = rvLoad();
    if (cur && P[cur]) { l = [cur].concat(l.filter(x => x !== cur)).slice(0, RVMAX); rvSave(l); }
    if (page === 'catalog' && $('[data-showroom]')) return;                              // на странице-витрине (extras.showroom) блока «Недавно просмотренные» нет: фокус на экспозиции
    const show = l.filter(id => id !== cur).slice(0, RVSHOW); if (!show.length || (page !== 'product' && page !== 'catalog')) return;
    const sec = document.createElement('section'); sec.className = 'sec rv-sec'; sec.id = 'recent'; sec.setAttribute('aria-labelledby', 'rv-h');
    sec.innerHTML = '<div class="wrap"><div class="sec-head"><div><span class="eyebrow">Вы смотрели</span><h2 id="rv-h">Недавно просмотренные</h2></div><button class="lnk" type="button" data-act="rv-clear">Очистить ' + I.close + '</button></div>' +
      '<div class="rv-grid">' + show.map(id => { const p = P[id]; return '<a class="mini-p" href="' + esc(root() + 'products/' + p.slug + '.html') + '" data-track="recent_click" data-product="' + esc(id) + '">' + rvArt(p) + '<div class="t"><small>' + esc(brandOf(id)) + '</small>' + esc(p.name) + '</div></a>'; }).join('') + '</div></div>';
    const main = $('#main'); if (!main) return;
    const anchor = page === 'catalog' ? $('[data-kits-anchor]', main) || $('#results', main) : $('.cta-band', main) || null;
    if (page === 'catalog' && anchor) anchor.parentNode.insertBefore(sec, anchor); else if (anchor) { const host = anchor.closest('section') || anchor; host.parentNode.insertBefore(sec, host); } else main.appendChild(sec);
  }

  /* ---------- события ---------- */
  A.actions['rv-clear'] = () => { rvSave([]); const s = $('#recent'); if (s) s.remove(); A.toast('Список просмотренных очищен'); };
  A.actions['rl-add'] = (t, id) => toggle(id || t.getAttribute('data-id'));
  A.actions['rl-open'] = t => openPanel(t);
  A.actions['rl-del'] = (t, id) => { id = id || t.getAttribute('data-id'); const p = P[id]; list = list.filter(x => x !== id); save(list); sync(); if (panelOpen()) paintPanel(); if (p) A.toast('Убрано из списка запроса: ' + p.name); };
  A.actions['rl-clear'] = () => { list = []; save(list); sync(); if (panelOpen()) paintPanel(); A.toast('Список запроса очищен'); };
  A.actions['rl-send'] = () => send();
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.qc-btn');
    if (b) { const el = $('#qc'), m = $('#qc-menu'), open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); m.hidden = !open; el.classList.toggle('open', open); if (open) { const f = $('a', m); if (f) f.focus(); } return; }
    if (!e.target.closest('#qc') || e.target.closest('.qc-item')) qcClose();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#qc.open')) { qcClose(); const b = $('#qc .qc-btn'); if (b) b.focus(); } });
  window.addEventListener('scroll', onScroll, {passive: true});
  window.addEventListener('storage', e => { if (e.key === KEY) { list = load(); sync(); } });

  function init() {
    if (X.requestList) { inject(document); sync(); }
    qc(); watch(); recent();
  }
  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
  if (X.requestList) { list = load(); bar(); const m = $('#modal'); if (m) new MutationObserver(onModal).observe(m, {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden']}); }
})();
