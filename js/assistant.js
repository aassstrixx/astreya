/* assistant.js — чат-помощник «Астреи» (data/redesign.json → extras.assistant): интерфейс, подключение «мозга» и ИИ-режима.

   «Мозг» (js/assistant-brain.js) понимает вопрос, помнит ход диалога и отвечает по данным сайта прямо в браузере — ничего никуда не отправляется.
   ИИ-режим (если сервер его включил — server/lib/assistant.js): свободные вопросы уходят на сервер, где модель сама вызывает инструменты (каталог, расписание,
   скидка, контакты, материалы сайта) и отвечает потоком; в чате видны шаги («Ищу в каталоге…»). Простые вещи (контакты, звонок, цены/наличие, скидки, расписание)
   по-прежнему отвечаются «мозгом» мгновенно и без затрат. Нет сервера, ключа или лимит исчерпан — чат тихо работает в встроенном режиме.

   Что сделано по лучшим практикам чатов 2026 года: ответ «печатается» и появляется потоком (кнопка «Стоп»), видны статусы шагов, быстрые ответы идут внутри ленты
   (ничего не перекрывают), оценка ответа 👍/👎 с передачей менеджеру, постоянная кнопка «связаться с человеком», голосовой ввод (если браузер умеет), честная пометка
   «я программа», уважение prefers-reduced-motion, скринридер получает готовый ответ целиком (не побуквенно), фокус и Esc работают как в диалоге.
   Дополнительно (экспериментально, если браузер поддерживает WebMCP): страница отдаёт ИИ-агентам браузера те же безопасные инструменты только для чтения.
   Ответ ИИ может заканчиваться маркерами [[product:ID]], [[form:ТИП]], [[link:путь]] — они становятся карточками и кнопками только если ID/путь есть в данных сайта.
   Диалог хранится в sessionStorage вкладки (не на сервере); страницы подменяются без перезагрузки — чат остаётся на месте. */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras || !D.extras.assistant || !A.brain) return;
  const X = D.extras, I = A.I, esc = A.esc;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const P = {}, B = {}, TASK = {}, EV = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.events || []).forEach(e => { EV[e.id] = e; });
  const root = () => document.body.getAttribute('data-root') || '';
  const KEY = 'astreya:chat2', TIPKEY = 'astreya:asst-tip', MAXKEEP = 40, MAXIN = 500;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = () => matchMedia('(max-width:640px)').matches;
  const PLUS = '<svg class="ic i-pl" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4.5v11M4.5 10h11"/></svg>', CHECK = '<svg class="ic i-ck" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>';
  const SPARK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.2l1.9 5.4 5.4 1.9-5.4 1.9L12 17.8l-1.9-5.4-5.4-1.9 5.4-1.9L12 3.2Z"/><path d="M18.6 15.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>';
  const SEND = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 10 16.5 3.5 12 16.5l-2.2-5.3L3.5 10Z"/><path d="m9.8 11.2 3-3"/></svg>';
  const STOP = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="5.5" y="5.5" width="9" height="9" rx="2"/></svg>';
  const RESET = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10a6 6 0 1 0 2-4.5M4 3.8v3.4h3.4"/></svg>';
  const MIC = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="7.2" y="2.5" width="5.6" height="9.5" rx="2.8"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/></svg>';
  const PERSON = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/></svg>';
  const UP = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7 9v7.5H4V9h3Zm0 0 2.6-5.5c1.2 0 2 .9 1.8 2L11 8h4.2c1 0 1.7.9 1.5 1.9l-1 5.2c-.2.8-.9 1.4-1.7 1.4H7"/></svg>';
  const DOWN = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><g transform="rotate(180 10 10)"><path d="M7 9v7.5H4V9h3Zm0 0 2.6-5.5c1.2 0 2 .9 1.8 2L11 8h4.2c1 0 1.7.9 1.5 1.9l-1 5.2c-.2.8-.9 1.4-1.7 1.4H7"/></g></svg>';
  const ARROWDOWN = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 3.5v13M5 11.5l5 5 5-5"/></svg>';
  const CARET = '<span class="asst-caret" aria-hidden="true"></span>';
  const store = {get: () => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && Array.isArray(v.msgs) ? v : null; } catch (e) { return null; } }, set: v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }};
  const brandName = id => (B[id] || {}).name || '';
  const pUrl = p => root() + 'products/' + p.slug + '.html';

  let KB = null, kbP = null, brain = null, ai = null, isOpen = false, busy = false, msgs = [], bst = null, ctrl = null, built = false, current = null, stick = true, rec = null, recOn = false, tipT = 0, nudgeT = 0, nudges = 0, interacted = false;
  A.actions = A.actions || {};

  /* ---------- данные и «мозг» ---------- */
  function loadKb() {
    if (window.ASTREYA_KB) { KB = window.ASTREYA_KB; return Promise.resolve(KB); }
    if (kbP) return kbP;
    return (kbP = new Promise(res => { const s = document.createElement('script'); s.src = root() + (X.kb || 'js/kb.js'); s.onload = () => { KB = window.ASTREYA_KB || null; res(KB); }; s.onerror = () => res(null); document.head.appendChild(s); }));
  }
  function ensureBrain() { if (!brain || (KB && brain._kb !== KB)) { brain = A.brain.createBrain(D, KB || {}, {}); brain._kb = KB; } if (!bst) bst = brain.newState(); return brain; }
  const endpoint = () => { const e = (D.site && D.site.formEndpoint) || ''; return /\/api\/lead\/?$/.test(e) ? e.replace(/\/api\/lead\/?$/, '/api/assistant') : ''; };
  function probe() {
    if (ai !== null) return Promise.resolve(ai); const ep = endpoint(); if (!ep || !/^https?:$/.test(location.protocol)) { ai = false; return Promise.resolve(false); }          // с локального файла (автономная сборка) сервера нет
    return fetch(ep + '/status', {credentials: 'omit', headers: {Accept: 'application/json'}}).then(r => r.ok ? r.json() : {ai: false}).then(j => { ai = !!(j && j.ai); return ai; }).catch(() => { ai = false; return false; });
  }
  function ctxOf() {
    const page = document.body.getAttribute('data-page') || '', c = {page};
    const pr = $('.p-page[data-product]'); if (pr) c.product = pr.getAttribute('data-product');
    const ev = $('[data-event]'); if (ev && page === 'event') c.event = ev.getAttribute('data-event');
    return c;
  }

  /* ---------- маркеры в ответе ИИ ---------- */
  const FORM_LBL = {partner: 'Стать партнёром', callback: 'Заказать звонок', question: 'Задать вопрос менеджеру', seminar: 'Записаться на мероприятие', product: 'Запросить информацию'};
  function knownUrl(path) {
    const p = String(path || '').replace(/[?#].*$/, ''); if (!/^(?:[a-z0-9-]+\/)?[a-z0-9-]+\.html$/i.test(p)) return null;
    const idx = (D.index || []).find(i => i.url === p); if (idx) return {h: path, l: idx.title};
    const pg = ((KB && KB.pages) || []).find(i => i.u === p); if (pg) return {h: path, l: pg.t};
    return p === 'index.html' ? {h: path, l: 'Главная'} : null;
  }
  function parseMarks(text) {
    const out = {cards: [], actions: [], links: []};
    const clean = String(text).replace(/\[\[(product|form|link):([^\]\s:]+)(?::([^\]\s]+))?\]\]/g, (m, kind, a, b) => {
      if (kind === 'product') { if (P[a] && out.cards.length < 3 && out.cards.indexOf(a) < 0) out.cards.push(a); }
      else if (kind === 'form') {
        const okType = FORM_LBL[a] && A.FORM_TYPES[a] && (a !== 'callback' || X.callback);
        if (okType && (a !== 'seminar' || EV[b]) && (a !== 'product' || !b || P[b]) && out.actions.length < 3) out.actions.push({l: FORM_LBL[a], act: 'form', type: a, ref: b || ''});
      } else { const u = knownUrl(a); if (u && out.links.length < 3) out.links.push(u); }
      return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return Object.assign(out, {text: clean});
  }
  const hideMarks = t => String(t).replace(/\[\[(?:product|form|link):[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/\[$/, '');

  /* ---------- вывод ---------- */
  const unbold = t => { const n = (t.match(/\*\*/g) || []).length; if (n % 2) { const i = t.lastIndexOf('**'); return t.slice(0, i) + t.slice(i + 2); } return t; };          // недопечатанное «**…» не показываем звёздочками
  const fmt = t => { const inl = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); return unbold(String(t).replace(/\r/g, '')).split(/\n{2,}/).filter(Boolean).map(b => { const ls = b.split('\n'); return ls.every(l => /^\s*([-•*]|\d+[.)])\s+/.test(l)) ? '<ul>' + ls.map(l => '<li>' + inl(l.replace(/^\s*([-•*]|\d+[.)])\s+/, '')) + '</li>').join('') + '</ul>' : '<p>' + ls.map(inl).join('<br>') + '</p>'; }).join(''); };
  function cardHTML(id, i) {
    const p = P[id]; if (!p) return ''; const b = B[p.brand] || {}, st = A.bstyle ? A.bstyle(b) : '';
    const img = p.im ? '<img src="' + esc(root() + p.im) + '" alt="" loading="lazy" decoding="async">' : '<i></i>';
    return '<div class="asst-card" style="--i:' + i + ';' + esc(st) + '"><a class="asst-card-a" href="' + esc(pUrl(p)) + '" data-track="assistant_card"><span class="asst-card-i">' + img + '</span><span class="asst-card-t"><small>' + esc(b.name || '') + '</small><b>' + esc(p.name) + '</b><em>' + esc((p.ts || []).map(t => TASK[t] || t).slice(0, 2).join(' · ')) + '</em></span></a><span class="asst-card-b">' +
      (X.requestList ? '<button class="rl-tog asst-mini" type="button" data-act="rl-add" data-id="' + id + '" data-rl-id="' + id + '">' + PLUS + CHECK + '<span class="rl-tl"></span></button>' : '') +
      (X.compare ? '<button class="cmp-tog asst-mini" type="button" data-act="cmp-toggle" data-id="' + id + '" data-cmp-id="' + id + '" aria-label="Сравнить: ' + esc(p.name) + '">⇄</button>' : '') + '</span></div>';
  }
  function eventHTML(id, i) {
    const e = EV[id]; if (!e) return ''; const d = A.dparts(e.date);
    return '<div class="asst-ev" style="--i:' + i + '"><a href="' + esc(root() + 'training/' + e.slug + '.html') + '" data-track="assistant_event"><span class="asst-ev-d"><b>' + d.d + '</b>' + esc(d.m) + '</span><span class="asst-ev-t"><b>' + esc(e.title) + '</b><small>' + esc([e.fm, e.city, e.tm].filter(Boolean).join(' · ')) + '</small></span></a><button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="seminar" data-ref="' + esc(e.id) + '" data-track="assistant_register">Записаться</button></div>';
  }
  /* всё, что идёт после текста: мероприятия, пояснение, карточки, кнопки, ссылки */
  function extraHTML(m) {
    let h = '';
    if (m.ev && m.ev.length) h += '<div class="asst-evs">' + m.ev.map(eventHTML).join('') + '</div>';
    if (m.t2) h += '<div class="asst-tx asst-tx2">' + fmt(m.t2) + '</div>';
    if (m.c && m.c.length) h += '<div class="asst-cards">' + m.c.map(cardHTML).join('') + '</div>';
    const acts = (m.a || []).map(a => a.act === 'form' && !a.spec && !a.city ? '<button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="' + esc(a.type) + '"' + (a.ref ? ' data-ref="' + esc(a.ref) + '"' : '') + ' data-track="assistant_action">' + esc(a.l) + '</button>'
      : a.act === 'form' ? '<button class="btn btn-fill btn-sm" type="button" data-act="asst-form" data-type="' + esc(a.type) + '" data-ref="' + esc(a.ref || '') + '" data-spec="' + esc(a.spec || '') + '" data-city="' + esc(a.city || '') + '" data-track="assistant_action">' + esc(a.l) + '</button>'
      : '<button class="btn btn-ghost btn-sm" type="button" data-act="' + esc(a.act) + '"' + (a.q ? ' data-q="' + esc(String(a.q).slice(0, MAXIN)) + '"' : '') + (a.ids ? ' data-ids="' + esc(a.ids) + '"' : '') + ' data-track="assistant_action">' + esc(a.l) + '</button>');
    const links = (m.l || []).map(l => '<a class="asst-ln" href="' + esc(/^(tel:|mailto:|https?:)/.test(l.h) ? l.h : root() + l.h) + '"' + (l.ext ? ' target="_blank" rel="noopener"' : '') + ' data-track="assistant_link">' + esc(l.l) + ' ' + I.arrow + '</a>');
    if (acts.length || links.length) h += '<div class="asst-acts">' + acts.join('') + links.join('') + '</div>';
    return h;
  }
  const fbHTML = m => m.fb === undefined ? '' : '<div class="asst-fb" role="group" aria-label="Оцените ответ"><button type="button" data-act="asst-fb" data-v="1" aria-pressed="' + (m.fb === 1) + '" aria-label="Ответ помог">' + UP + '</button><button type="button" data-act="asst-fb" data-v="-1" aria-pressed="' + (m.fb === -1) + '" aria-label="Ответ не помог">' + DOWN + '</button></div>';
  const avHTML = '<span class="asst-mav" aria-hidden="true">' + SPARK + '</span>';

  function scrollLog() { const l = $('#asst-log'); if (l) l.scrollTop = l.scrollHeight; }
  function follow(row) {
    const l = $('#asst-log'); if (!l) return; if (!stick) { const d = $('#asst-down'); if (d) d.hidden = false; return; }
    const bottom = l.scrollHeight - l.clientHeight, top = row ? Math.max(0, row.offsetTop - 14) : bottom; l.scrollTop = Math.min(bottom, top);          // длинный ответ не уезжает вверх: его начало остаётся на виду
  }
  function addRow(role, html, cls) { const l = $('#asst-log'), qr = $('#asst-qr'), d = document.createElement('div'); d.className = 'asst-m asst-' + role + (cls ? ' ' + cls : ''); d.innerHTML = html; l.insertBefore(d, qr); return d; }
  const botRow = (cls) => addRow('b', avHTML + '<div class="asst-bub"></div>', cls);

  /* ---------- «печать» ответа ---------- */
  function typer(tx, row, perFrame) {
    let buf = '', shown = 0, raf = 0, ended = false, cb = null, stopped = false;
    const paint = () => { tx.innerHTML = fmt(buf.slice(0, shown)) + (!ended || shown < buf.length ? CARET : ''); follow(row); };
    const tick = () => { raf = 0; const back = buf.length - shown; if (back > 0) { shown = Math.min(buf.length, shown + (reduced() ? back : Math.max(perFrame || 2, back > 240 ? 10 : back > 90 ? 5 : back > 40 ? 3 : 2))); paint(); } if (shown < buf.length || !ended) raf = requestAnimationFrame(tick); else finish(); };
    const finish = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); tx.innerHTML = fmt(buf); follow(row); if (cb) cb(); };
    const go = () => { if (!raf && !stopped) raf = requestAnimationFrame(tick); };
    return {push(s) { buf += s; go(); }, end(f) { ended = true; cb = f; go(); }, skip() { shown = buf.length; ended = true; finish(); }, text: () => buf, active: () => !stopped};
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const STEP = {search_products: 'Ищу в каталоге…', get_product: 'Открываю карточку товара…', get_brand: 'Смотрю информацию о бренде…', list_events: 'Сверяю с расписанием…', discount_for_amount: 'Считаю скидку…', get_contacts: 'Нахожу контакты…', search_info: 'Ищу в материалах сайта…', tool: 'Проверяю данные…'};

  function typingRow(label) {
    const row = botRow('asst-typing'); $('.asst-bub', row).innerHTML = '<span class="asst-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="asst-status">' + esc(label || 'Думаю…') + '</span>'; row.setAttribute('aria-hidden', 'true'); follow(row); return row;
  }
  function setStatus(row, label) { const s = $('.asst-status', row); if (!s || s.textContent === label) return; s.classList.add('swap'); setTimeout(() => { s.textContent = label; s.classList.remove('swap'); }, 140); }

  /* показ готового ответа: печать текста → затем карточки/кнопки с плавным появлением → быстрые ответы */
  async function reveal(m, row) {
    row = row || botRow(); row.setAttribute('data-i', String(msgs.indexOf(m))); const bub = $('.asst-bub', row); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); bub.innerHTML = '<div class="asst-tx"></div>'; const tx = $('.asst-tx', bub);
    current = null;
    if (m.t) {
      const ty = typer(tx, row, Math.max(2, Math.ceil(m.t.length / 110))); current = ty; ty.push(m.t);
      await new Promise(res => { if (reduced()) { ty.skip(); res(); } else ty.end(res); });
      current = null;
    }
    const extra = extraHTML(m); if (extra) { const d = document.createElement('div'); d.className = 'asst-extra'; d.innerHTML = extra; bub.appendChild(d); }
    if (m.fb !== undefined) bub.insertAdjacentHTML('beforeend', fbHTML(m));
    announce(m.t); afterRender(); qrPaint(m.ch); follow(row);
  }
  function announce(text) { const s = $('#asst-sr'); if (s) { s.textContent = ''; setTimeout(() => { s.textContent = String(text || '').replace(/\*\*/g, ''); }, 30); } }
  function afterRender() { if (A.rlSync) A.rlSync(); if (A.cmpSync) A.cmpSync(); }

  function qrPaint(list) {
    const q = $('#asst-qr'); if (!q) return; q.innerHTML = (list || []).slice(0, 4).map((t, i) => '<button class="chip" type="button" style="--i:' + i + '" data-act="asst-chip" data-q="' + esc(t) + '">' + esc(t) + '</button>').join('');
  }

  /* ---------- построение интерфейса ---------- */
  function build() {
    if (built) return; built = true; document.body.classList.add('has-asst');
    const fab = document.createElement('button'); fab.type = 'button'; fab.id = 'asst-fab'; fab.className = 'asst-fab'; fab.setAttribute('data-act', 'asst-open'); fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'asst'); fab.setAttribute('aria-label', 'Помощник «Астреи»: задать вопрос');
    fab.innerHTML = '<span class="asst-fab-ring" aria-hidden="true"></span><span class="asst-fab-i">' + SPARK + '</span><span class="asst-fab-t">Помощник</span>'; document.body.appendChild(fab);
    const tip = document.createElement('div'); tip.id = 'asst-tip'; tip.className = 'asst-tip'; tip.hidden = true; tip.innerHTML = '<button class="asst-tip-b" type="button" data-act="asst-open"></button><button class="asst-tip-x" type="button" data-act="asst-tip-x" aria-label="Скрыть подсказку">' + I.close + '</button>'; document.body.appendChild(tip);
    const el = document.createElement('section'); el.id = 'asst'; el.className = 'asst'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Помощник «Астреи»');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, voice = !!SR && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    el.innerHTML = '<header class="asst-h"><span class="asst-av" aria-hidden="true"><span class="asst-av-core">' + SPARK + '</span></span><div class="asst-ht"><b>Помощник<span class="asst-n2"> «Астреи»</span></b><small id="asst-mode"><i class="asst-dot" aria-hidden="true"></i><span>Отвечаю по данным сайта</span></small></div>' +
      '<button class="asst-ib" type="button" data-act="asst-human" aria-label="Связаться с менеджером" title="Связаться с менеджером">' + PERSON + '</button><button class="asst-ib" type="button" data-act="asst-reset" aria-label="Начать диалог заново" title="Начать заново">' + RESET + '</button><button class="asst-ib" type="button" data-act="asst-close" aria-label="Закрыть помощника">' + I.close + '</button></header>' +
      '<div class="asst-log" id="asst-log" tabindex="0" aria-label="Диалог с помощником"><div class="asst-qr" id="asst-qr"></div></div><button class="asst-down" id="asst-down" type="button" data-act="asst-down" aria-label="К последним сообщениям" hidden>' + ARROWDOWN + '</button><div class="sr" id="asst-sr" role="status" aria-live="polite"></div>' +
      '<form class="asst-form" id="asst-form" autocomplete="off"><label class="sr" for="asst-in">Ваш вопрос</label><textarea id="asst-in" rows="1" maxlength="' + MAXIN + '" placeholder="Напишите вопрос…" enterkeyhint="send"></textarea>' +
      (voice ? '<button class="asst-mic" type="button" data-act="asst-mic" aria-pressed="false" aria-label="Надиктовать вопрос голосом" title="Надиктовать">' + MIC + '</button>' : '') + '<button class="asst-send" id="asst-send" type="submit" aria-label="Отправить">' + SEND + '</button></form>' +
      '<p class="asst-note" id="asst-note">Я программа, а не сотрудник. Не вводите личные данные; цены, наличие и условия подтверждает менеджер.</p>';
    document.body.appendChild(el);
    const ta = $('#asst-in', el), log = $('#asst-log', el);
    $('#asst-form', el).addEventListener('submit', e => { e.preventDefault(); if (busy) { stopGen(); return; } const v = ta.value.trim(); if (v) { ta.value = ''; grow(ta); send(v); } });
    ta.addEventListener('input', () => grow(ta));
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy) $('#asst-form', el).requestSubmit(); } });
    log.addEventListener('scroll', () => { stick = log.scrollHeight - log.scrollTop - log.clientHeight < 90; const d = $('#asst-down'); if (d && stick) d.hidden = true; }, {passive: true});
  }
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 120) + 'px'; }
  function setMode() {
    const m = $('#asst-mode span'), n = $('#asst-note'); if (!m) return;
    m.textContent = ai ? 'На связи · ИИ и данные сайта' : 'Отвечаю по данным сайта';
    n.textContent = ai ? 'Я программа (ИИ), а не сотрудник; ответы могут быть неточными. Вопросы обрабатываются на сервере сайта и в сервисе ИИ — не вводите личные данные. Цены, наличие и условия подтверждает менеджер.' : 'Я программа, а не сотрудник. Не вводите здесь личные данные; цены, наличие и условия подтверждает менеджер.';
  }
  function setBusy(on) { busy = on; const f = $('#asst-form'), b = $('#asst-send'); if (!f) return; f.classList.toggle('busy', on); b.classList.toggle('stop', on); b.innerHTML = on ? STOP : SEND; b.setAttribute('aria-label', on ? 'Остановить ответ' : 'Отправить'); $('#asst-log').setAttribute('aria-busy', String(on)); }
  function stopGen() { if (ctrl) { try { ctrl.abort(); } catch (e) {} } if (current && current.skip) current.skip(); }

  /* ---------- диалог ---------- */
  function persist() { store.set({msgs: msgs.map(m => ({r: m.r, t: m.t, t2: m.t2, c: m.c, ev: m.ev, a: m.a, l: m.l, fb: m.fb})), st: bst, chips: msgs.chips}); }
  function renderAll() {
    const l = $('#asst-log'); $$('.asst-m', l).forEach(e => e.remove());
    msgs.forEach((m, i) => { if (m.r === 'u') addRow('u', '<div class="asst-bub"><div class="asst-tx"><p>' + esc(m.t) + '</p></div></div>'); else { const row = botRow(); row.setAttribute('data-i', i); $('.asst-bub', row).innerHTML = '<div class="asst-tx">' + fmt(m.t || '') + '</div>' + (extraHTML(m) ? '<div class="asst-extra">' + extraHTML(m) + '</div>' : '') + fbHTML(m); row.classList.add('still'); } });
    qrPaint(msgs.chips || []); afterRender(); stick = true; scrollLog();
  }
  function pushBot(res) { const m = {r: 'b', t: res.text, t2: res.text2, c: res.cards, ev: res.events, a: res.actions, l: res.links}; if (['greet', 'thanks', 'bye', 'smalltalk', 'who', 'empty', 'no', 'role', 'pick'].indexOf(res.intent) < 0) m.fb = 0; msgs.push(m); msgs.chips = res.chips; return m; }
  const followUps = mk => mk.cards.length ? ['Сравни первые два', 'Как запросить условия?', 'Ближайшие семинары'] : mk.actions.length ? ['Ближайшие семинары', 'Контакты менеджера'] : ['Подобрать средство по задаче', 'Как стать партнёром', 'Ближайшие семинары'];
  function plainHistory() { return msgs.filter(m => m.t).map(m => ({role: m.r === 'u' ? 'user' : 'assistant', content: m.t})).slice(-10); }
  function ctxLine(c) {
    if (c.product && P[c.product]) return '[Посетитель сейчас на странице товара: ' + P[c.product].name + ' (' + c.product + ')]\n';
    if (c.event && EV[c.event]) return '[Посетитель сейчас на странице мероприятия: ' + EV[c.event].title + ' (' + c.event + ')]\n';
    if (bst && (bst.city || bst.role)) return '[Из диалога: ' + [bst.role ? 'роль — ' + bst.role : '', bst.city ? 'город — ' + bst.city : ''].filter(Boolean).join(', ') + ']\n';
    return '';
  }

  /* поток ИИ: события {t} текст · {s} шаг · {reset} сбросить недописанное · {done} · {error} */
  async function askAI(ctx, row, onStep) {
    const ep = endpoint(); ctrl = new AbortController();
    const hist = plainHistory(), lastU = hist[hist.length - 1]; if (lastU) lastU.content = ctxLine(ctx) + lastU.content;
    const r = await fetch(ep, {method: 'POST', credentials: 'omit', signal: ctrl.signal, headers: {'Content-Type': 'application/json', Accept: 'text/event-stream'}, body: JSON.stringify({messages: hist})});
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; try { e.body = await r.json(); } catch (x) {} throw e; }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', got = '', err = null, ty = null, tx = null;
    const open = () => { if (ty) return; const bub = $('.asst-bub', row); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); bub.innerHTML = '<div class="asst-tx"></div>'; tx = $('.asst-tx', bub); ty = typer(tx, row, 2); current = ty; };
    for (;;) {
      const {done, value} = await rd.read(); if (done) break; buf += dec.decode(value, {stream: true});
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2); if (ev.indexOf('data: ') !== 0) continue; let o; try { o = JSON.parse(ev.slice(6)); } catch (x) { continue; }
        if (o.s && onStep) onStep(STEP[o.s] || STEP.tool);
        if (o.reset) { got = ''; if (ty) { ty.skip(); ty = null; current = null; const bub = $('.asst-bub', row); bub.innerHTML = '<span class="asst-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="asst-status">' + esc(onStep ? 'Проверяю данные…' : '') + '</span>'; row.classList.add('asst-typing'); row.setAttribute('aria-hidden', 'true'); } }
        if (o.t) { const before = hideMarks(got); got += o.t; const now = hideMarks(got); if (now.length > before.length) { open(); ty.push(now.slice(before.length)); } }
        if (o.error) err = o.error;
      }
    }
    if (err && !got) throw new Error(err);
    if (ty) await new Promise(res => (reduced() ? (ty.skip(), res()) : ty.end(res)));
    current = null; return {text: got, row, tx};
  }

  async function send(text) {
    if (busy) return; text = String(text).trim().slice(0, MAXIN); if (!text) return;
    ensureBrain(); interacted = true; hideTip();
    setBusy(true); qrPaint([]); stick = true; const down = $('#asst-down'); if (down) down.hidden = true;
    msgs.push({r: 'u', t: text}); addRow('u', '<div class="asst-bub"><div class="asst-tx"><p>' + esc(text) + '</p></div></div>'); scrollLog();
    await loadKb(); ensureBrain(); const ctx = ctxOf(), res = brain.reply(text, bst, ctx), useAI = !!(ai && !res.sure);
    A.track && A.track('assistant_msg', {mode: useAI ? 'ai' : 'local', intent: res.intent});
    const row = typingRow(useAI ? 'Думаю…' : (res.steps[0] || 'Думаю…'));
    try {
      if (useAI) {
        try {
          const out = await askAI(ctx, row, label => setStatus(row, label)), mk = parseMarks(out.text);
          const m = {r: 'b', t: mk.text || 'Не получилось сформулировать ответ — переформулируйте вопрос или свяжитесь с менеджером.', c: mk.cards, a: mk.actions, l: mk.links, fb: 0}; msgs.push(m); msgs.chips = followUps(mk);
          if (mk.cards.length) brain.noteExternal(bst, mk.cards);
          const bub = $('.asst-bub', row); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); row.setAttribute('data-i', String(msgs.length - 1));
          if (!$('.asst-tx', bub)) bub.innerHTML = '<div class="asst-tx"></div>'; $('.asst-tx', bub).innerHTML = fmt(m.t);
          const extra = extraHTML(m); if (extra) { const d = document.createElement('div'); d.className = 'asst-extra'; d.innerHTML = extra; bub.appendChild(d); } bub.insertAdjacentHTML('beforeend', fbHTML(m)); announce(m.t); afterRender(); qrPaint(msgs.chips); follow(row);
        } catch (e) {
          if (e && e.name === 'AbortError') { const partial = current && current.text ? current.text() : ''; if (!partial) { row.remove(); msgs.pop(); throw e; } const m = {r: 'b', t: hideMarks(partial), fb: 0}; msgs.push(m); row.setAttribute('data-i', String(msgs.length - 1)); const bub = $('.asst-bub', row); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); bub.innerHTML = '<div class="asst-tx">' + fmt(m.t) + '</div>' + fbHTML(m); msgs.chips = ['Подобрать средство по задаче', 'Ближайшие семинары']; qrPaint(msgs.chips); throw e; }
          const lim = e && e.status === 429, off = e && e.status === 503; if (off) { ai = false; setMode(); }
          res.text = (lim ? 'Сообщений слишком много — подождите немного. Пока отвечу по данным сайта.\n\n' : off ? '' : 'ИИ-режим сейчас недоступен — отвечаю по данным сайта.\n\n') + res.text;
          await reveal(pushBot(res), row);
        }
      } else {
        const steps = res.steps.length ? res.steps : ['Думаю…']; for (let i = 1; i < steps.length; i++) { await wait(reduced() ? 0 : 420); setStatus(row, steps[i]); }
        await wait(reduced() ? 0 : 300 + Math.min(500, res.text.length * 2)); await reveal(pushBot(res), row);
      }
      persist();
    } catch (e) { if (!(e && e.name === 'AbortError')) { const t = $('.asst-typing'); if (t) t.remove(); } persist(); }
    finally { setBusy(false); ctrl = null; current = null; const f = $('#asst-in'); if (f && isOpen && !mobile()) f.focus(); }
  }

  function welcome() { ensureBrain(); const hr = new Date().getHours(), hi = hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер'; return {r: 'b', t: hi + '! Я помощник «Астреи» — подскажу по каталогу и брендам, обучению, условиям сотрудничества и контактам. Могу подобрать продукты по задаче и объяснить выбор, сравнить товары, посчитать скидку, найти ближайший семинар. С чего начнём?'}; }
  function openChat(opener) {
    build(); if (isOpen) return; isOpen = true; interacted = true; hideTip(); const el = $('#asst'); el.hidden = false; void el.offsetWidth; el.classList.add('open');
    document.body.classList.add('asst-open'); const fab = $('#asst-fab'); fab.setAttribute('aria-expanded', 'true'); openChat.opener = opener || fab; fab.classList.remove('nudge');
    loadKb().then(() => { ensureBrain(); }); probe().then(setMode);
    const saved = store.get(); ensureBrain();
    if (saved && !msgs.length) { msgs = saved.msgs; bst = Object.assign(brain.newState(), saved.st || {}); msgs.chips = saved.chips; }
    if (!msgs.length) { msgs = [welcome()]; msgs.chips = brain.starters(ctxOf(), bst); }
    const l = $('#asst-log'); if (!$$('.asst-m', l).length) renderAll(); setTimeout(() => { const t = $('#asst-in'); if (t && !mobile()) t.focus(); }, 380);
    A.track && A.track('assistant_open');
  }
  function closeChat() {
    if (!isOpen) return; isOpen = false; stopGen(); stopVoice(); const el = $('#asst'); el.classList.remove('open'); document.body.classList.remove('asst-open');
    setTimeout(() => { if (!isOpen) el.hidden = true; }, 420); const fab = $('#asst-fab'); fab.setAttribute('aria-expanded', 'false'); const o = openChat.opener; if (o && o.focus && o.offsetParent !== null) o.focus(); else fab.focus();
  }
  function reset() { stopGen(); setBusy(false); ensureBrain(); bst = brain.newState(); msgs = [welcome()]; msgs.chips = brain.starters(ctxOf(), bst); persist(); renderAll(); A.toast && A.toast('Диалог очищен'); }

  /* ---------- подсказка у кнопки, внимание, голос ---------- */
  function tipText() {
    const c = ctxOf(), pg = c.page;
    return c.product && P[c.product] ? 'Подскажу по этому товару?' : pg === 'catalog' ? 'Помочь подобрать средство?' : pg === 'training' || pg === 'event' ? 'Найти ближайший семинар?' : pg === 'partners' ? 'Посчитать скидку по закупке?' : 'Есть вопрос? Я подскажу.';
  }
  function maybeTip() {
    if (isOpen || interacted || document.body.classList.contains('x-intro') || document.body.classList.contains('locked') || document.body.classList.contains('menu-open')) return;
    let seen = false; try { seen = !!sessionStorage.getItem(TIPKEY); } catch (e) {} if (seen) return;
    const tip = $('#asst-tip'); if (!tip) return; $('.asst-tip-b', tip).textContent = tipText(); tip.hidden = false; void tip.offsetWidth; tip.classList.add('on'); try { sessionStorage.setItem(TIPKEY, '1'); } catch (e) {}
    setTimeout(hideTip, 9000);
  }
  function hideTip() { const tip = $('#asst-tip'); if (!tip || tip.hidden) return; tip.classList.remove('on'); setTimeout(() => { tip.hidden = true; }, 300); }
  function nudge() {
    const f = $('#asst-fab'); if (!f || isOpen || interacted || nudges >= 3 || reduced()) return; nudges++; f.classList.remove('nudge'); void f.offsetWidth; f.classList.add('nudge'); nudgeT = setTimeout(nudge, 22000);
  }
  function stopVoice() { if (rec && recOn) { try { rec.stop(); } catch (e) {} } recOn = false; const m = $('.asst-mic'); if (m) { m.classList.remove('on'); m.setAttribute('aria-pressed', 'false'); } }
  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    if (recOn) { stopVoice(); return; }
    try {
      rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1; const ta = $('#asst-in'), base = ta.value ? ta.value.replace(/\s+$/, '') + ' ' : '';
      rec.onresult = e => { let t = ''; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript; ta.value = (base + t).slice(0, MAXIN); grow(ta); };
      rec.onerror = e => { A.toast && A.toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Нет доступа к микрофону — разрешите его в браузере' : e.error === 'no-speech' ? 'Не расслышал — попробуйте ещё раз' : 'Голосовой ввод сейчас недоступен'); stopVoice(); };
      rec.onend = () => { stopVoice(); ta.focus(); };
      rec.start(); recOn = true; const m = $('.asst-mic'); m.classList.add('on'); m.setAttribute('aria-pressed', 'true'); A.track && A.track('assistant_voice');
    } catch (e) { stopVoice(); A.toast && A.toast('Голосовой ввод сейчас недоступен'); }
  }

  /* ---------- события ---------- */
  A.actions['asst-open'] = t => isOpen ? closeChat() : openChat(t);
  A.actions['asst-close'] = () => closeChat();
  A.actions['asst-reset'] = () => reset();
  A.actions['asst-chip'] = t => send(t.getAttribute('data-q'));
  A.actions['asst-human'] = () => send('Хочу связаться с менеджером');
  A.actions['asst-mic'] = () => toggleVoice();
  A.actions['asst-tip-x'] = () => hideTip();
  A.actions['asst-down'] = () => { stick = true; scrollLog(); const d = $('#asst-down'); if (d) d.hidden = true; };
  A.actions['asst-ask'] = t => { const q = t.getAttribute('data-q') || ''; A.openForm('question', 'Вопрос из чата помощника'); const f = $('#modal form'); if (f && f.elements.msg && q) f.elements.msg.value = q; };
  A.actions['asst-form'] = t => { const type = t.getAttribute('data-type'); A.openForm(type, t.getAttribute('data-ref') || ''); const f = $('#modal form'); if (!f) return; const spec = t.getAttribute('data-spec'), city = t.getAttribute('data-city'); if (spec && f.elements.spec) f.elements.spec.value = spec; if (city && f.elements.city) f.elements.city.value = city; };
  A.actions['asst-cmp'] = t => { const ids = String(t.getAttribute('data-ids') || '').split(',').filter(id => P[id]); let l = []; try { l = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); } catch (e) {} ids.forEach(id => { if (l.indexOf(id) < 0 && A.actions['cmp-toggle']) A.actions['cmp-toggle'](t, id); }); setTimeout(() => A.actions['cmp-open'] && A.actions['cmp-open'](t), 60); };
  A.actions['asst-fb'] = t => {
    const row = t.closest('.asst-m'), idx = parseInt(row.getAttribute('data-i'), 10), v = +t.getAttribute('data-v'), m = msgs[idx]; if (!m) return;
    const was = m.fb; m.fb = was === v ? 0 : v; $$('[data-act="asst-fb"]', row).forEach(b => b.setAttribute('aria-pressed', String(+b.getAttribute('data-v') === m.fb))); A.track && A.track('assistant_feedback', {value: m.fb, intent: bst && bst.lastIntent});
    if (v === -1 && m.fb === -1) { ensureBrain(); const r = {text: 'Жаль, что ответ не помог. Могу передать вопрос менеджеру — он ответит в рабочее время.', actions: [{l: 'Задать вопрос менеджеру', act: 'asst-ask', q: (msgs.slice(0, idx).reverse().find(x => x.r === 'u') || {}).t || ''}].concat(X.callback ? [{l: 'Заказать звонок', act: 'form', type: 'callback', ref: ''}] : []), cards: [], events: [], links: [], chips: ['Подобрать средство по задаче', 'Ближайшие семинары'], intent: 'handoff'}; const nm = pushBot(r); delete nm.fb; const nrow = botRow(); nrow.setAttribute('data-i', msgs.length - 1); $('.asst-bub', nrow).innerHTML = '<div class="asst-tx">' + fmt(nm.t) + '</div><div class="asst-extra">' + extraHTML(nm) + '</div>'; nrow.classList.add('still'); qrPaint(r.chips); follow(nrow); }
    persist();
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen && !$('#modal.open')) { closeChat(); return; }
    if (e.key === 'Tab' && isOpen && mobile() && !$('#modal.open')) {                       // на телефоне чат — во весь экран: Tab не уходит «за» него
      const box = $('#asst'), f = $$('button, textarea, a[href]', box).filter(x => !x.disabled && x.offsetParent !== null); if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#asst a[href]'); if (a && !a.target && mobile() && !/^(tel:|mailto:)/.test(a.getAttribute('href'))) setTimeout(closeChat, 50); });
  document.addEventListener('astreya:intro', () => { const f = $('#asst-fab'); if (f) f.classList.toggle('away', document.body.classList.contains('x-intro')); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { const el = $('#asst'); if (el) el.style.setProperty('--asst-h', mobile() ? Math.round(window.visualViewport.height) + 'px' : ''); if (isOpen && stick) scrollLog(); });

  /* ---------- WebMCP (экспериментально): те же безопасные инструменты для ИИ-агентов браузера, только чтение ---------- */
  function registerWebMCP() {
    if (!X.agentReady) return; const mc = (navigator && navigator.modelContext) || (document && document.modelContext); if (!mc || typeof mc.registerTool !== 'function' || registerWebMCP.done) return; registerWebMCP.done = true;
    const run = fn => async args => { try { ensureBrain(); const out = fn(brain.knowledge, args || {}); return {content: [{type: 'text', text: JSON.stringify(out)}]}; } catch (e) { return {content: [{type: 'text', text: JSON.stringify({error: 'Не удалось выполнить запрос'})}], isError: true}; } };
    const ro = {readOnlyHint: true};
    const tools = [
      {name: 'search_products', description: 'Поиск товаров каталога «Астреи» по задаче, бренду, категории или словам. Цен и наличия на сайте нет.', inputSchema: {type: 'object', properties: {query: {type: 'string'}, task: {type: 'string', enum: (D.tasks || []).map(t => t.id)}, brand: {type: 'string', enum: (D.brands || []).map(b => b.id)}, new_only: {type: 'boolean'}}}, execute: run((K, a) => { const l = K.searchProducts({query: a.query, task: a.task, brand: a.brand, newOnly: a.new_only}); return {total: l.length, products: l.slice(0, 10).map(K.brief)}; })},
      {name: 'list_events', description: 'Расписание мероприятий учебного центра «Астреи» (будущие), с фильтрами по городу, бренду и формату.', inputSchema: {type: 'object', properties: {city: {type: 'string'}, online: {type: 'boolean'}}}, execute: run((K, a) => ({events: K.listEvents({city: a.city, online: typeof a.online === 'boolean' ? a.online : undefined}).slice(0, 10)}))},
      {name: 'discount_for_amount', description: 'Ориентировочная скидка по сумме закупки в рублях (пороги с сайта; точные условия подтверждает менеджер).', inputSchema: {type: 'object', properties: {amount_rub: {type: 'number', minimum: 0}}, required: ['amount_rub']}, execute: run((K, a) => K.discount(a.amount_rub))},
      {name: 'get_contacts', description: 'Контакты и представительства «Астреи».', inputSchema: {type: 'object', properties: {city: {type: 'string'}}}, execute: run((K, a) => K.contacts(a.city))}
    ];
    tools.forEach(t => { try { const r = mc.registerTool(Object.assign({annotations: ro}, t)); if (r && r.catch) r.catch(() => {}); } catch (e) {} });
  }

  function init() {
    build(); ensureBrain(); if (isOpen && msgs.length === 1) { msgs.chips = brain.starters(ctxOf(), bst); qrPaint(msgs.chips); }
    const f = $('#asst-fab'); if (f && !f.classList.contains('in')) setTimeout(() => f.classList.add('in'), reduced() ? 0 : 700);
    clearTimeout(tipT); tipT = setTimeout(maybeTip, 8000); if (!nudgeT) nudgeT = setTimeout(nudge, 14000);
    registerWebMCP();
  }
  A.assistant = {answer: t => { ensureBrain(); return brain.reply(t, brain.newState(), ctxOf()); }};          // для проверок (tools/check-extras.js)
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
