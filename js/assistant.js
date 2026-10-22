/* assistant.js — чат-помощник «Астрея» по имени Стелла (data/redesign.json → extras.assistant): интерфейс, подключение «мозга» и ИИ-режима.

   Стелла — мини-консультант и талисман сайта: жемчужинка со звёздочкой (SVG, настроения: ждёт, думает, говорит, радуется). Кнопка в углу «оживает» плавно
   (пружинное появление, искры, парение, моргание, глаза следят за курсором, подпись раскрывается и сворачивается). Ответы приходят «как в мессенджере»:
   сообщение посетителя помечается ✓ и ✓✓ (прочитано), Стелла «думает» (статусы шагов), затем сообщение «отправляется» — всплывает и печатается; «Стоп» работает на любом шаге.

   «Мозг» (js/assistant-brain.js) понимает вопрос, помнит ход диалога и отвечает по данным сайта прямо в браузере — ничего никуда не отправляется.
   ИИ-режим (если сервер его включил — server/lib/assistant.js): свободные вопросы НА ЛЮБУЮ ТЕМУ уходят на сервер, где модель сама вызывает инструменты (каталог,
   расписание, скидка, контакты, материалы сайта) и отвечает потоком; в чате видны шаги («Ищу в каталоге…»). Точные и служебные вещи (контакты, звонок, цены/наличие,
   скидки, расписание, формы, арифметика, дата) по-прежнему отвечаются «мозгом» мгновенно и без затрат. Нет сервера, ключа или лимит исчерпан — чат тихо работает во встроенном режиме.

   Что сделано по лучшим практикам чатов 2026 года: ответ «печатается» и появляется потоком (кнопка «Стоп»), видны статусы шагов, быстрые ответы идут внутри ленты
   (ничего не перекрывают), оценка ответа 👍/👎 с передачей менеджеру, постоянная кнопка «связаться с человеком», голосовой ввод (если браузер умеет), честная пометка
   «я программа», уважение prefers-reduced-motion, скринридер получает готовый ответ целиком (не побуквенно), фокус и Esc работают как в диалоге.
   Дополнительно (экспериментально, если браузер поддерживает WebMCP): страница отдаёт ИИ-агентам браузера те же безопасные инструменты только для чтения.
   Ответ ИИ может заканчиваться маркерами [[product:ID]], [[event:ID]], [[form:ТИП]], [[link:путь]] — они становятся карточками и кнопками только если ID/путь есть в данных сайта.
   Диалог хранится в sessionStorage вкладки (не на сервере); страницы подменяются без перезагрузки — чат остаётся на месте.

   Навигатор (extras.navigator, js/guide.js): ответ может содержать кнопки-действия «открыть страницу», «показать на странице», «провести по шагам», «выставить фильтры» — их исполняет A.guide;
   сравнение товаров идёт через Стеллу (плашка «Попросить Стеллу рассказать» → A.stella.compare). Рамки Стеллы (js/stella-policy.js): ссылки только на этот сайт, названия товаров — ссылками на наши страницы,
   под объяснениями о коже и уходе — плашка «не медицинская рекомендация». */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras || !D.extras.assistant || !A.brain) return;
  const X = D.extras, I = A.I, esc = A.esc, POL = A.policy || null, NAVI = !!(X.navigator && D.guide);
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const P = {}, B = {}, TASK = {}, EV = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.events || []).forEach(e => { EV[e.id] = e; });
  const root = () => document.body.getAttribute('data-root') || '';
  const KEY = 'astreya:chat2', TIPKEY = 'astreya:asst-tip', MAXKEEP = 40, MAXIN = 500;
  /* анимации работают всегда, независимо от системной настройки «уменьшить движение» (так решил владелец сайта). window.ASTREYA_MOTION_SPEED > 1 ускоряет паузы и печать — нужно только автоматическим проверкам. */
  const speed = () => { const v = +window.ASTREYA_MOTION_SPEED; return v > 0 ? v : 1; };
  const T = ms => Math.round(ms / speed());
  const mobile = () => matchMedia('(max-width:640px)').matches;
  const PLUS = '<svg class="ic i-pl" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4.5v11M4.5 10h11"/></svg>', CHECK = '<svg class="ic i-ck" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>';
  /* маскот Стелла: жемчужинка со звёздочкой. Рисунок один на все места (градиент берётся из скрытого набора #pe-defs); настроения переключает атрибут data-m: idle · think · talk · happy */
  const PEARL = (mood, live, cls) => '<svg class="pe' + (live ? ' live' : '') + (cls ? ' ' + cls : '') + '" data-m="' + (mood || 'idle') + '" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g class="pe-b"><circle cx="24" cy="26" r="19" fill="url(#pe-g)"/><circle cx="24" cy="26" r="18.6" fill="none" stroke="#8ea3d8" stroke-opacity=".55" stroke-width=".8"/><ellipse cx="16.4" cy="17.4" rx="6.2" ry="3.1" transform="rotate(-32 16.4 17.4)" fill="#fff" opacity=".92"/><circle cx="31.5" cy="35.6" r="2.2" fill="#fff" opacity=".35"/>' +
    '<g class="pe-f"><g class="pe-e"><ellipse cx="18" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><ellipse cx="30" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><circle cx="18.8" cy="25.4" r=".85" fill="#fff"/><circle cx="30.8" cy="25.4" r=".85" fill="#fff"/></g>' +
    '<g class="pe-eh"><path d="M15.4 27.6q2.6-3.9 5.2 0M27.4 27.6q2.6-3.9 5.2 0" fill="none" stroke="#0b1a33" stroke-width="1.9" stroke-linecap="round"/></g><g class="pe-es"><path d="M15.4 26.2q2.6 3.5 5.2 0M27.4 26.2q2.6 3.5 5.2 0" fill="none" stroke="#0b1a33" stroke-width="1.8" stroke-linecap="round"/></g>' +
    '<ellipse class="pe-bl" cx="12.8" cy="31.6" rx="2.7" ry="1.75" fill="#f4a3b8"/><ellipse class="pe-bl" cx="35.2" cy="31.6" rx="2.7" ry="1.75" fill="#f4a3b8"/>' +
    '<path class="pe-m" d="M20.8 31.6q3.2 3.3 6.4 0" fill="none" stroke="#0b1a33" stroke-width="1.6" stroke-linecap="round"/><ellipse class="pe-mo" cx="24" cy="33.2" rx="2" ry="2.4" fill="#0b1a33"/></g></g>' +
    '<path class="pe-st" d="M37.6 2.6l1.7 4.4 4.4 1.7-4.4 1.7-1.7 4.4-1.7-4.4-4.4-1.7 4.4-1.7z" fill="#f6d58b" stroke="#e3b95c" stroke-width=".5" stroke-linejoin="round"/></svg>';
  const PEARL_DEFS = '<svg id="pe-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs><radialGradient id="pe-g" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#eef2fd"/><stop offset="1" stop-color="#b3c3ec"/></radialGradient></defs></svg>';
  const CHECKS = '<svg viewBox="0 0 18 11" aria-hidden="true" focusable="false"><path class="k1" d="M1.5 6.2 4.7 9.2 10.3 1.8"/><path class="k2" d="M7 7.4 8.2 9.2 13.8 1.8"/></svg>';
  const SEND = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 10 16.5 3.5 12 16.5l-2.2-5.3L3.5 10Z"/><path d="m9.8 11.2 3-3"/></svg>';
  const STOP = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="5.5" y="5.5" width="9" height="9" rx="2"/></svg>';
  const RESET = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10a6 6 0 1 0 2-4.5M4 3.8v3.4h3.4"/></svg>';
  const MIC = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="7.2" y="2.5" width="5.6" height="9.5" rx="2.8"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/></svg>';
  const TOURI = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7"/><path d="m12.8 7.2-1.6 4-4 1.6 1.6-4 4-1.6Z"/></svg>';          // компас: «Покажи сайт»
  const PERSON = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/></svg>';
  const UP = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7 9v7.5H4V9h3Zm0 0 2.6-5.5c1.2 0 2 .9 1.8 2L11 8h4.2c1 0 1.7.9 1.5 1.9l-1 5.2c-.2.8-.9 1.4-1.7 1.4H7"/></svg>';
  const DOWN = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><g transform="rotate(180 10 10)"><path d="M7 9v7.5H4V9h3Zm0 0 2.6-5.5c1.2 0 2 .9 1.8 2L11 8h4.2c1 0 1.7.9 1.5 1.9l-1 5.2c-.2.8-.9 1.4-1.7 1.4H7"/></g></svg>';
  const ARROWDOWN = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 3.5v13M5 11.5l5 5 5-5"/></svg>';
  const CARET = '<span class="asst-caret" aria-hidden="true"></span>';
  /* курсор печати — внутри последнего абзаца (или пункта списка / блока кода), в одну строку с текстом, а не отдельной строкой под ним */
  const withCaret = h => /<\/(?:p|li)>(?:<\/(?:ul|ol)>)?$/.test(h) ? h.replace(/(<\/(?:p|li)>(?:<\/(?:ul|ol)>)?)$/, CARET + '$1') : /<\/code><\/pre>$/.test(h) ? h.replace(/<\/code><\/pre>$/, CARET + '</code></pre>') : h + CARET;
  const store = {get: () => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && Array.isArray(v.msgs) ? v : null; } catch (e) { return null; } }, set: v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }};
  const brandName = id => (B[id] || {}).name || '';
  const pUrl = p => root() + 'products/' + p.slug + '.html';

  let KB = null, kbP = null, brain = null, ai = null, isOpen = false, busy = false, msgs = [], bst = null, ctrl = null, built = false, current = null, stick = true, rec = null, recOn = false, tipT = 0, nudgeT = 0, nudges = 0, interacted = false, longT = 0, helloT = 0, introOn = false, introQ = '', mg = {raf: 0, x: 0, y: 0, ox: 0, oy: 0};
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
  /* товары, которые посетитель отметил для сравнения (хранит explore.js) */
  function cmpIds() { try { const v = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); return Array.isArray(v) ? v.filter(id => P[id]).slice(0, 4) : []; } catch (e) { return []; } }
  function ctxOf() {
    const page = document.body.getAttribute('data-page') || '', c = {page};
    const pr = $('.p-page[data-product]'); if (pr) c.product = pr.getAttribute('data-product');
    const ev = $('[data-event]'); if (ev && page === 'event') c.event = ev.getAttribute('data-event');
    const br = $('[data-brand-page]'); if (br && page === 'brand') c.brand = br.getAttribute('data-brand-page');
    const cm = cmpIds(); if (cm.length) c.cmp = cm;
    if (A.sales && A.sales.plan) { const pl = A.sales.plan(); if (pl) c.plan = pl; }          // «Старт со Стеллой» посетителя (extras.sales): чтобы Стелла говорила о «его плане»
    return c;
  }

  /* ---------- маркеры в ответе ИИ ---------- */
  const FORM_LBL = {partner: 'Стать партнёром', callback: 'Заказать звонок', question: 'Задать вопрос менеджеру', seminar: 'Записаться на мероприятие', product: 'Запросить информацию', plan: 'Получить подбор от менеджера'};
  function knownUrl(path) {
    const p = String(path || '').replace(/[?#].*$/, ''); if (!/^(?:[a-z0-9-]+\/)?[a-z0-9-]+\.html$/i.test(p)) return null;
    const idx = (D.index || []).find(i => i.url === p); if (idx) return {h: path, l: idx.title};
    const pg = ((KB && KB.pages) || []).find(i => i.u === p); if (pg) return {h: path, l: pg.t};
    return p === 'index.html' ? {h: path, l: 'Главная'} : null;
  }
  /* маркеры навигатора: цель подсветки / экскурсия / фильтр — только если они есть в настройках сайта (D.guide) и значения существуют */
  const GT = (D.guide && D.guide.targets) || {}, GTOUR = (D.guide && D.guide.tours) || [], GPG = (D.guide && D.guide.pages) || [];
  /* цель по id: сначала на текущей странице и «везде», затем на остальных (id вроде «form» есть на нескольких страницах) */
  const tgFind = id => { const cur = document.body.getAttribute('data-page') || ''; for (const k of [cur, '*'].concat(Object.keys(GT))) { const t = (GT[k] || []).find(x => x.id === id); if (t) return {page: k, t}; } return null; };
  function navMark(kind, a) {
    if (!NAVI) return null;
    if (kind === 'go') { const u = knownUrl(a); return u ? {l: 'Открыть: ' + u.l, act: 'asst-go', d: {href: String(a).replace(/^\.?\//, '')}} : null; }
    if (kind === 'show') { const f = tgFind(a); if (!f) return null; const here = f.page === '*' || f.page === (document.body.getAttribute('data-page') || ''); const pg = GPG.find(p => p.id === f.page); return here ? {l: 'Показать: ' + f.t.label, act: 'asst-show', d: {target: a}} : pg ? {l: 'Показать: ' + f.t.label, act: 'asst-go', d: {href: pg.href, show: a}} : null; }
    if (kind === 'tour') { const t = GTOUR.find(x => x.id === a); return t ? {l: 'Показать по шагам: ' + t.title, act: 'asst-tour', d: {tour: a}} : null; }
    if (kind === 'filter') {
      const q = new URLSearchParams(a), ok = {task: id => (D.tasks || []).some(t => t.id === id), brand: id => !!B[id], cat: id => (D.cats || []).some(c => c.id === id), kind: id => (D.kinds || []).some(k => k.id === id)}, f = [];
      q.forEach((v, k) => { if (ok[k] && ok[k](v)) f.push(k + '=' + encodeURIComponent(v)); });
      return f.length ? {l: 'Показать в каталоге', act: 'asst-filter', d: {f: f.join('&')}} : null;
    }
    if (kind === 'compare') { const ids = String(a).split(',').filter(id => P[id]).slice(0, 3); return ids.length ? {l: ids.length > 1 ? 'Сравнить: ' + ids.map(id => P[id].name).join(' и ') : 'Рассказать о: ' + P[ids[0]].name, act: 'asst-cmp', ids: ids.join(',')} : null; }
    return null;
  }
  function parseMarks(text) {
    const out = {cards: [], events: [], actions: [], links: [], med: false};
    const clean = String(text).replace(/\[\[(product|event|form|link|go|show|tour|filter|compare|med)(?::([^\]\s:]+))?(?::([^\]\s]+))?\]\]/g, (m, kind, a, b) => {
      if (kind === 'med') out.med = true;
      else if (/^(go|show|tour|filter|compare)$/.test(kind)) { const x = navMark(kind, a); if (x && out.actions.length < 3 && !out.actions.some(y => y.act === x.act && JSON.stringify(y.d || y.ids) === JSON.stringify(x.d || x.ids))) out.actions.push(x); }
      else if (kind === 'product') { if (P[a] && out.cards.length < 3 && out.cards.indexOf(a) < 0) out.cards.push(a); }
      else if (kind === 'event') { if (EV[a] && out.events.length < 2 && out.events.indexOf(a) < 0) out.events.push(a); }
      else if (kind === 'form') {
        const okType = FORM_LBL[a] && A.FORM_TYPES[a] && (a !== 'callback' || X.callback) && (a !== 'plan' || X.sales);
        if (okType && (a !== 'seminar' || EV[b]) && (a !== 'product' || !b || P[b]) && out.actions.length < 3) out.actions.push({l: FORM_LBL[a], act: 'form', type: a, ref: b || ''});
      } else { const u = knownUrl(a); if (u && out.links.length < 3) out.links.push(u); }
      return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return Object.assign(out, {text: clean});
  }
  const hideMarks = t => String(t).replace(/\[\[(?:product|event|form|link|go|show|tour|filter|compare|med)(?::[^\]]*)?\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/\[$/, '');

  /* ---------- вывод ---------- */
  const unbold = t => { const n = (t.match(/\*\*/g) || []).length; if (n % 2) { const i = t.lastIndexOf('**'); return t.slice(0, i) + t.slice(i + 2); } return t; };          // недопечатанное «**…» не показываем звёздочками
  const inl = s => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const blocks = t => unbold(t).split(/\n{2,}/).filter(b => b.trim()).map(b => { const ls = b.replace(/^\n+|\n+$/g, '').split('\n'); return ls.every(l => /^\s*([-•*]|\d+[.)])\s+/.test(l)) ? '<ul>' + ls.map(l => '<li>' + inl(l.replace(/^\s*([-•*]|\d+[.)])\s+/, '')) + '</li>').join('') + '</ul>' : '<p>' + ls.map(inl).join('<br>') + '</p>'; }).join('');
  /* текст ответа → безопасный HTML: абзацы, списки, **жирный**, `код` и блоки кода в тройных кавычках (незакрытый блок при печати тоже показывается как код) */
  const fmt = t => {
    t = String(t).replace(/\r/g, ''); const re = /```[a-z0-9+#.-]*[ \t]*\n?([\s\S]*?)(```|$)/gi; let out = '', last = 0, m;
    while ((m = re.exec(t))) { out += blocks(t.slice(last, m.index)) + '<pre class="asst-code"><code>' + esc(m[1].replace(/\n$/, '')) + '</code></pre>'; last = m.index + m[0].length; if (!m[0].length) re.lastIndex++; }
    return out + blocks(t.slice(last));
  };
  /* названия товаров и брендов из каталога становятся ссылками на страницы этого сайта (js/stella-policy.js) */
  const urlOfName = x => x.kind === 'p' ? (P[x.id] ? pUrl(P[x.id]) : '') : (B[x.id] ? root() + 'brands/' + B[x.id].id + '.html' : '');
  const fmtL = t => { const h = fmt(t); return POL ? POL.linkify(h, D, urlOfName) : h; };
  const discHTML = () => { const d = POL ? POL.DISCLAIMER : {title: 'Справочная информация', text: 'Это не медицинская рекомендация.'}; return '<div class="asst-disc" role="note"><svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.2v.1"/></svg><div><b>' + esc(d.title) + ' · не медицинская рекомендация</b><span>' + esc(d.text) + '</span></div></div>'; };
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
      : '<button class="btn ' + (/^asst-(go|tour|show|filter)$/.test(a.act) ? 'btn-fill' : 'btn-ghost') + ' btn-sm" type="button" data-act="' + esc(a.act) + '"' + (a.q ? ' data-q="' + esc(String(a.q).slice(0, MAXIN)) + '"' : '') + (a.ids ? ' data-ids="' + esc(a.ids) + '"' : '') + (a.d ? ' data-d="' + esc(JSON.stringify(a.d)) + '"' : '') + ' data-track="assistant_action">' + esc(a.l) + '</button>');
    const links = (m.l || []).map(l => '<a class="asst-ln" href="' + esc(/^(tel:|mailto:|https?:)/.test(l.h) ? l.h : root() + l.h) + '"' + (l.ext ? ' target="_blank" rel="noopener"' : '') + ' data-track="assistant_link">' + esc(l.l) + ' ' + I.arrow + '</a>');
    if (acts.length || links.length) h += '<div class="asst-acts">' + acts.join('') + links.join('') + '</div>';
    if (m.d) h += discHTML();
    return h;
  }
  const fbHTML = m => m.fb === undefined ? '' : '<div class="asst-fb" role="group" aria-label="Оцените ответ"><button type="button" data-act="asst-fb" data-v="1" aria-pressed="' + (m.fb === 1) + '" aria-label="Ответ помог">' + UP + '</button><button type="button" data-act="asst-fb" data-v="-1" aria-pressed="' + (m.fb === -1) + '" aria-label="Ответ не помог">' + DOWN + '</button></div>';
  const avHTML = mood => '<span class="asst-mav" aria-hidden="true">' + PEARL(mood || 'idle') + '</span>';
  const userHTML = (t, st) => '<div class="asst-bub"><div class="asst-tx"><p>' + esc(t) + '</p></div></div><span class="asst-ck" data-s="' + st + '" aria-hidden="true">' + CHECKS + '</span>';

  function scrollLog() { const l = $('#asst-log'); if (l) l.scrollTop = l.scrollHeight; }
  function follow(row) {
    const l = $('#asst-log'); if (!l) return; if (!stick) { const d = $('#asst-down'); if (d) d.hidden = false; return; }
    const bottom = l.scrollHeight - l.clientHeight, top = row ? Math.max(0, row.offsetTop - 14) : bottom; l.scrollTop = Math.min(bottom, top);          // длинный ответ не уезжает вверх: его начало остаётся на виду
  }
  function addRow(role, html, cls) { const l = $('#asst-log'), qr = $('#asst-qr'), d = document.createElement('div'); d.className = 'asst-m asst-' + role + (cls ? ' ' + cls : ''); d.innerHTML = html; l.insertBefore(d, qr); return d; }
  const botRow = (cls, mood) => addRow('b', avHTML(mood) + '<div class="asst-bub"></div>', cls);

  /* ---------- «печать» ответа ---------- */
  /* печатает по времени, а не по кадрам: скорость cps знаков в секунду, на знаках препинания короткая пауза; win — «окно догоняния» для потока ИИ (отставание от потока не больше win мс) */
  function typer(tx, row, o) {
    o = o || {}; let buf = '', shown = 0, raf = 0, ended = false, cb = null, stopped = false, last = 0, acc = 0, hold = 0;
    const base0 = (o.cps || 70) / 1000, win = o.win || 0, k = () => speed();
    const paint = () => { const h = fmt(buf.slice(0, shown)); tx.innerHTML = !ended || shown < buf.length ? withCaret(h) : h; follow(row); };
    const tick = now => {
      raf = 0; const dt = Math.min(64, last ? now - last : 16); last = now;
      if (hold > 0) hold -= dt;
      else {
        const back = buf.length - shown;
        if (back > 0) {
          const rate = Math.max(base0 * k(), win ? back / win * k() : 0); acc += dt * rate; let n = Math.floor(acc); acc -= n;
          if (n > 0) { n = Math.min(n, back); shown += n; const ch = buf.charAt(shown - 1); if (shown < buf.length) hold = (/[.!?…]/.test(ch) && /\s/.test(buf.charAt(shown) || ' ') ? 240 : ch === '\n' ? 180 : /[,;:]/.test(ch) ? 90 : 0) / k(); paint(); }
        }
      }
      if (shown < buf.length || !ended) raf = requestAnimationFrame(tick); else finish();
    };
    const finish = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); tx.innerHTML = fmtL(buf); follow(row); if (cb) cb(); };
    const go = () => { if (!raf && !stopped) { last = 0; raf = requestAnimationFrame(tick); } };
    return {push(s) { buf += s; go(); }, end(f) { ended = true; cb = f; go(); }, skip() { shown = buf.length; ended = true; finish(); }, text: () => buf, active: () => !stopped};
  }
  /* ожидания, которые «Стоп» может прервать: нажал — Стелла сразу показывает готовый ответ */
  let skipping = false; const sleepers = new Set();
  const sleep = ms => new Promise(res => { ms = ms / speed(); if (skipping || ms <= 0) { res(); return; } const done = () => { clearTimeout(t); sleepers.delete(done); res(); }, t = setTimeout(done, ms); sleepers.add(done); });
  const wake = () => { Array.from(sleepers).forEach(f => f()); };
  const STEP = {search_products: 'Ищу в каталоге…', get_product: 'Открываю карточку товара…', get_brand: 'Смотрю информацию о бренде…', compare_products: 'Сравниваю товары по данным сайта…', list_events: 'Сверяю с расписанием…', discount_for_amount: 'Считаю скидку…', get_contacts: 'Нахожу контакты…', search_info: 'Ищу в материалах сайта…', tool: 'Проверяю данные…'};

  /* настроение Стеллы: в шапке и в строке сообщения */
  function headMood(m) { const pe = $('.asst-av .pe'); if (pe) pe.setAttribute('data-m', m); }
  function rowMood(row, m) { const pe = row && $('.pe', row); if (pe) pe.setAttribute('data-m', m); headMood(m); }
  function cheer(row, ms) { rowMood(row, 'happy'); setTimeout(() => { if (row && row.isConnected) rowMood(row, 'idle'); else headMood('idle'); }, ms || 1800); }
  function sentPop(bub) { bub.classList.remove('sent'); void bub.offsetWidth; bub.classList.add('sent'); bub.addEventListener('animationend', function f(e) { if (e.target === bub) { bub.classList.remove('sent'); bub.removeEventListener('animationend', f); } }); }
  function tickRead(urow) { const c = urow && $('.asst-ck', urow); if (c) c.setAttribute('data-s', '2'); }

  function typingRow(label) {
    const row = botRow('asst-typing', 'think'); $('.asst-bub', row).innerHTML = '<span class="asst-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="asst-status">' + esc(label || 'Думаю…') + '</span>'; row.setAttribute('aria-hidden', 'true'); headMood('think'); follow(row); return row;
  }
  function setStatus(row, label) { const s = $('.asst-status', row); if (!s || s.textContent === label) return; s.classList.add('swap'); setTimeout(() => { s.textContent = label; s.classList.remove('swap'); }, 140); }
  /* «раздумье»: статусы меняются равномерно за T мс (первый уже показан) */
  async function thinkOver(row, labels, T) { const per = T / labels.length; for (let i = 0; i < labels.length; i++) { if (i) setStatus(row, labels[i]); await sleep(per); } }
  const thinkMs = res => ['greet', 'thanks', 'bye', 'empty', 'calc', 'datetime', 'no', 'yes'].indexOf(res.intent) >= 0 || (res.intent === 'talk' && res.local && (res.text || '').length < 140) ? 1000 : Math.max(1300, Math.min(2800, 900 + (res.text || '').length * 6));

  /* показ готового ответа: сообщение «отправляется» (всплывает) → печатается → затем карточки/кнопки с плавным появлением → быстрые ответы */
  async function reveal(m, row, o) {
    o = o || {}; row = row || botRow(); row.setAttribute('data-i', String(msgs.indexOf(m))); const bub = $('.asst-bub', row); if (m.k) bub.classList.add('asst-k-' + m.k); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); bub.innerHTML = '<div class="asst-tx"></div>'; const tx = $('.asst-tx', bub);
    sentPop(bub); rowMood(row, 'talk'); current = null;
    if (m.t) {
      const len = m.t.length, ty = typer(tx, row, {cps: o.fast ? Math.max(80, len * 1000 / 3200) : Math.min(300, Math.max(58, len * 1000 / 3500))}); current = ty; ty.push(m.t);
      await new Promise(res => { if (skipping) { ty.skip(); res(); } else ty.end(res); });
      current = null;
    }
    const extra = extraHTML(m); if (extra) { const d = document.createElement('div'); d.className = 'asst-extra'; d.innerHTML = extra; bub.appendChild(d); }
    if (m.fb !== undefined) bub.insertAdjacentHTML('beforeend', fbHTML(m));
    if (o.cheer || ['greet', 'thanks'].indexOf(o.intent) >= 0) cheer(row); else rowMood(row, o.sleepy ? 'sleep' : 'idle');
    announce(m.t); afterRender(); qrPaint(msgs.chips); follow(row);
    if (o.autorun && o.autorun.length && A.guide) setTimeout(() => o.autorun.forEach(a => A.guide.run(a.act, a.d)), T(o.quiet ? 600 : 950));          // команда посетителя («открой каталог») выполняется сама, после того как Стелла ответила
  }
  function announce(text) { const s = $('#asst-sr'); if (s) { s.textContent = ''; setTimeout(() => { s.textContent = String(text || '').replace(/\*\*/g, ''); }, 30); } }
  function afterRender() { if (A.rlSync) A.rlSync(); if (A.cmpSync) A.cmpSync(); }

  /* «Старт со Стеллой» (extras.sales). Прежняя кнопка «Подобрать (средство) по задаче» заменена выделенной синей кнопкой: она не пишет в чат, а ведёт на страницу start.html — диалог со Стеллой.
     Подмена идёт при отрисовке (в данных реплик оставлены прежние подписи), поэтому без продающего слоя всё работает как раньше. */
  const PLAN_OLD = ['Подобрать средство по задаче', 'Подобрать по задаче'], PLAN_Q = 'Старт со Стеллой', planOn = () => !!(A.sales && A.sales.path);
  A.planChip = {
    label: PLAN_Q, on: planOn,
    list(chips) { if (!planOn()) return chips || []; const out = []; let seen = false; (chips || []).forEach(c => { if (PLAN_OLD.indexOf(c) >= 0 || c === PLAN_Q) { if (!seen) { seen = true; out.push(PLAN_Q); } } else out.push(c); }); return out; },          // на месте прежней кнопки; повторов нет
    html(c, extra) { return c === PLAN_Q && planOn() ? '<button class="chip chip-plan" type="button"' + (extra || '') + ' data-act="g-plan" data-track="plan_chip">' + esc(c) + ' ' + A.I.arrow + '</button>' : null; },
    go() {
      if (!planOn()) return; const path = A.sales.path; A.track && A.track('plan_chip_click', {page: document.body.getAttribute('data-page') || ''});
      if (isOpen) closeChat(true);
      if (A.showPage) { A.showPage(path, '', '', true, false); return; }          // автономная сборка: свой роутер
      let u; try { u = new URL((document.body.getAttribute('data-root') || '') + path, location.href).href; } catch (e) { u = path; }
      if (A.navigate) A.navigate(u, false); else location.href = u;
    }
  };
  A.actions['g-plan'] = () => A.planChip.go();
  function qrPaint(list) {
    const q = $('#asst-qr'); if (!q) return; q.innerHTML = A.planChip.list(list).slice(0, 4).map((t, i) => A.planChip.html(t, ' style="--i:' + i + '"') || '<button class="chip" type="button" style="--i:' + i + '" data-act="asst-chip" data-q="' + esc(t) + '">' + esc(t) + '</button>').join('');
  }


  /* ---------- построение интерфейса ---------- */
  function build() {
    if (built) return; built = true; document.body.classList.add('has-asst');
    const fab = document.createElement('button'); fab.type = 'button'; fab.id = 'asst-fab'; fab.className = 'asst-fab'; fab.setAttribute('data-act', 'asst-open'); fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'asst'); fab.setAttribute('aria-label', 'Стелла, помощник «Астрея»: задать вопрос');
    const sparks = [0, 1, 2, 3, 4, 5, 6, 7].map(k => '<i style="--a:' + (k * 45 + 12) + 'deg;--d:' + (40 + (k % 3) * 9) + 'px;--k:' + k + '"></i>').join('');
    fab.innerHTML = '<span class="asst-fab-glow" aria-hidden="true"></span><span class="asst-fab-fx" aria-hidden="true">' + sparks + '</span><span class="asst-fab-ring" aria-hidden="true"></span><span class="asst-fab-roll"><span class="asst-fab-i"><span class="asst-fab-pe">' + PEARL('sleep', true) + '</span></span></span><span class="asst-fab-t"><span><b>Спросить Стеллу</b></span></span>';
    document.body.insertAdjacentHTML('beforeend', PEARL_DEFS); document.body.appendChild(fab);
    fab.addEventListener('pointerenter', () => { fab.classList.add('long'); clearTimeout(longT); }); fab.addEventListener('pointerleave', () => { if (!fab.matches(':focus-visible')) longT = setTimeout(() => fab.classList.remove('long'), 450); });
    fab.addEventListener('focus', () => { if (fab.matches(':focus-visible')) { fab.classList.add('long'); clearTimeout(longT); } }); fab.addEventListener('blur', () => { longT = setTimeout(() => fab.classList.remove('long'), 450); });
    const tip = document.createElement('div'); tip.id = 'asst-tip'; tip.className = 'asst-tip'; tip.hidden = true; tip.innerHTML = '<span class="asst-tip-pe" aria-hidden="true">' + PEARL('happy', true) + '</span><button class="asst-tip-b" type="button" data-act="asst-open"></button><button class="asst-tip-x" type="button" data-act="asst-tip-x" aria-label="Скрыть подсказку">' + I.close + '</button>'; document.body.appendChild(tip);
    const el = document.createElement('section'); el.id = 'asst'; el.className = 'asst'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Стелла — помощник «Астрея»');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, voice = !!SR && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    el.innerHTML = '<header class="asst-h"><span class="asst-av" aria-hidden="true">' + PEARL('idle', true, 'look') + '</span><div class="asst-ht"><b>Стелла<span class="asst-n2"> · помощник</span></b><small id="asst-mode"><i class="asst-dot" aria-hidden="true"></i><span>Отвечаю по данным сайта</span></small></div>' +
      (D.guide && D.extras && D.extras.navigator ? '<button class="asst-ib asst-ib-tour" type="button" data-act="asst-tour-site" aria-label="Показать сайт — экскурсия" title="Показать сайт — экскурсия">' + TOURI + '</button>' : '') +
      '<button class="asst-ib" type="button" data-act="asst-human" aria-label="Связаться с менеджером" title="Связаться с менеджером">' + PERSON + '</button><button class="asst-ib" type="button" data-act="asst-reset" aria-label="Начать диалог заново" title="Начать заново">' + RESET + '</button><button class="asst-ib" type="button" data-act="asst-close" aria-label="Закрыть помощника">' + I.close + '</button></header>' +
      '<div class="asst-log" id="asst-log" tabindex="0" aria-label="Диалог с помощником"><div class="asst-qr" id="asst-qr"></div></div><button class="asst-down" id="asst-down" type="button" data-act="asst-down" aria-label="К последним сообщениям" hidden>' + ARROWDOWN + '</button><div class="sr" id="asst-sr" role="status" aria-live="polite"></div>' +
      '<form class="asst-form" id="asst-form" autocomplete="off"><label class="sr" for="asst-in">Ваш вопрос</label><textarea id="asst-in" rows="1" maxlength="' + MAXIN + '" placeholder="Напишите вопрос…" enterkeyhint="send"></textarea>' +
      (voice ? '<button class="asst-mic" type="button" data-act="asst-mic" aria-pressed="false" aria-label="Надиктовать вопрос голосом" title="Надиктовать">' + MIC + '</button>' : '') + '<button class="asst-send" id="asst-send" type="submit" aria-label="Отправить">' + SEND + '</button></form>' +
      '<p class="asst-note" id="asst-note"><span id="asst-note-t">Я программа, а не сотрудник. Не вводите личные данные; цены, наличие и условия подтверждает менеджер.</span></p>';
    document.body.appendChild(el);
    const ta = $('#asst-in', el), log = $('#asst-log', el);
    $('#asst-form', el).addEventListener('submit', e => { e.preventDefault(); const v = ta.value.trim(); if (busy && introOn && v) { introQ = v; ta.value = ''; grow(ta); stopGen(); return; } if (busy) { stopGen(); return; } if (v) { const from = ta.getBoundingClientRect(); ta.value = ''; grow(ta); send(v, from); } });          // вопрос, набранный пока Стелла «печатает» приветствие, отправится сразу после него
    ta.addEventListener('input', () => grow(ta));
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy || introOn) $('#asst-form', el).requestSubmit(); } });
    log.addEventListener('scroll', () => { stick = log.scrollHeight - log.scrollTop - log.clientHeight < 90; const d = $('#asst-down'); if (d && stick) d.hidden = true; }, {passive: true});
  }
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 120) + 'px'; }
  function setMode() {
    const m = $('#asst-mode span'), n = $('#asst-note-t'); if (!m) return;
    m.textContent = ai ? 'На связи · ИИ: любые вопросы и данные сайта' : 'Отвечаю по данным сайта';
    n.textContent = ai ? 'Я Стелла — программа (ИИ), а не сотрудник; могу ошибаться и не знаю свежих новостей. Вопросы обрабатываются на сервере сайта и в сервисе ИИ — не вводите личные данные. Цены, наличие и условия подтверждает менеджер.' : 'Я Стелла — программа, а не сотрудник. Не вводите здесь личные данные; цены, наличие и условия подтверждает менеджер.';
  }
  function setBusy(on) { busy = on; const f = $('#asst-form'), b = $('#asst-send'); if (!f) return; f.classList.toggle('busy', on); b.classList.toggle('stop', on); b.innerHTML = on ? STOP : SEND; b.setAttribute('aria-label', on ? 'Остановить ответ' : 'Отправить'); $('#asst-log').setAttribute('aria-busy', String(on)); }
  function stopGen() { skipping = true; wake(); if (ctrl) { try { ctrl.abort(); } catch (e) {} } if (current && current.skip) current.skip(); }

  /* ---------- диалог ---------- */
  function persist() { store.set({msgs: msgs.map(m => ({r: m.r, t: m.t, t2: m.t2, c: m.c, ev: m.ev, a: m.a, l: m.l, fb: m.fb, d: m.d, k: m.k})), st: bst, chips: msgs.chips}); }
  function renderAll() {
    const l = $('#asst-log'); $$('.asst-m', l).forEach(e => e.remove());
    msgs.forEach((m, i) => { if (m.r === 'u') addRow('u', userHTML(m.t, 2)); else { const row = botRow(); row.setAttribute('data-i', i); const bb = $('.asst-bub', row); if (m.k) bb.classList.add('asst-k-' + m.k); bb.innerHTML = '<div class="asst-tx">' + fmtL(m.t || '') + '</div>' + (extraHTML(m) ? '<div class="asst-extra">' + extraHTML(m) + '</div>' : '') + fbHTML(m); row.classList.add('still'); } });
    qrPaint(msgs.chips || []); afterRender(); stick = true; scrollLog();
  }
  const DISC_INT = /^(compare|task|combo|product|why|talk)$/;
  /* quiet — действия, которые Стелла выполняет сама и кнопкой не показывает (например, экскурсия) */
  function pushBot(res) { const m = {r: 'b', t: res.text, t2: res.text2, c: res.cards, ev: res.events, a: (res.actions || []).filter((x, i) => (res.quiet || []).indexOf(i) < 0), l: res.links}; if (res.intent === 'compare') m.k = 'cmp'; if (res.disclaimer || (POL && DISC_INT.test(res.intent) && POL.needsDisclaimer(res.text))) m.d = true; if (['greet', 'thanks', 'bye', 'smalltalk', 'who', 'empty', 'no', 'role', 'pick', 'talk'].indexOf(res.intent) < 0) m.fb = 0; msgs.push(m); msgs.chips = res.chips; return m; }
  const followUps = mk => mk.cards.length ? ['Сравни первые два', 'Как запросить условия?', 'Ближайшие семинары'] : mk.events.length ? ['Как записаться?', 'Сколько стоит участие?', 'Контакты менеджера'] : mk.actions.length ? ['Ближайшие семинары', 'Контакты менеджера'] : ['Расскажи подробнее', 'Подобрать средство по задаче', 'Ближайшие семинары'];
  function plainHistory() { return msgs.filter(m => m.t).map(m => ({role: m.r === 'u' ? 'user' : 'assistant', content: m.t})).slice(-10); }
  function ctxLine(c) {
    const parts = [], pg = GPG.find(p => p.id === c.page);
    if (c.product && P[c.product]) parts.push('сейчас на странице товара: ' + P[c.product].name + ' (' + c.product + ')');
    else if (c.event && EV[c.event]) parts.push('сейчас на странице мероприятия: ' + EV[c.event].title + ' (' + c.event + ')');
    else if (c.brand && B[c.brand]) parts.push('сейчас на странице бренда: ' + B[c.brand].name + ' (' + c.brand + ')');
    else if (pg) parts.push('сейчас на странице «' + pg.label + '»');
    if (c.cmp && c.cmp.length) parts.push('отметил для сравнения: ' + c.cmp.map(id => P[id].name + ' (' + id + ')').join(', '));
    if (c.plan && c.plan.summary && c.plan.summary.length) parts.push('собрал «Старт со Стеллой»: ' + c.plan.summary.join('; '));
    if (bst && (bst.city || bst.role)) parts.push('из диалога: ' + [bst.role ? 'роль — ' + bst.role : '', bst.city ? 'город — ' + bst.city : ''].filter(Boolean).join(', '));
    return parts.length ? '[Посетитель ' + parts.join('; ') + ']\n' : '';
  }

  /* поток ИИ: события {t} текст · {s} шаг · {reset} сбросить недописанное · {done} · {error}.
     Первые слова появляются не раньше, чем через ~1 с после вопроса: Стелла «думает», а не выпаливает ответ. */
  async function askAI(ctx, row, onStep) {
    if (skipping) { const e = new Error('stopped'); e.name = 'AbortError'; throw e; }          // «Стоп» нажат ещё до отправки на сервер
    const ep = endpoint(); ctrl = new AbortController(); const t0 = Date.now(), MIN = 1600 / speed();
    const hist = plainHistory(), lastU = hist[hist.length - 1]; if (lastU) lastU.content = ctxLine(ctx) + lastU.content;
    const r = await fetch(ep, {method: 'POST', credentials: 'omit', signal: ctrl.signal, headers: {'Content-Type': 'application/json', Accept: 'text/event-stream'}, body: JSON.stringify({messages: hist})});
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; try { e.body = await r.json(); } catch (x) {} throw e; }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', got = '', shown = '', err = null, ty = null, tx = null, timer = 0, fin = false;
    const open = () => { if (ty) return; const bub = $('.asst-bub', row); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); bub.innerHTML = '<div class="asst-tx"></div>'; tx = $('.asst-tx', bub); sentPop(bub); rowMood(row, 'talk'); ty = typer(tx, row, {cps: 56, win: 2200}); current = ty; };
    const flush = () => {          // внешние адреса вырезаются ещё в потоке; последнее недописанное слово придерживаем, чтобы половинка адреса не мигнула на экране
      timer = 0; let now = hideMarks(got); if (POL) { now = POL.stripExternal(now).text; if (!fin) now = now.replace(/\S+$/, ''); }
      if (now.length > shown.length && now.indexOf(shown) === 0) { open(); ty.push(now.slice(shown.length)); shown = now; }
    };
    const feed = () => { const left = MIN - (Date.now() - t0); if (left <= 0 || skipping) { if (timer) { clearTimeout(timer); timer = 0; } flush(); } else if (!timer) timer = setTimeout(flush, left); };
    for (;;) {
      const {done, value} = await rd.read(); if (done) break; buf += dec.decode(value, {stream: true});
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2); if (ev.indexOf('data: ') !== 0) continue; let o; try { o = JSON.parse(ev.slice(6)); } catch (x) { continue; }
        if (o.s && onStep) onStep(STEP[o.s] || STEP.tool);
        if (o.reset) { got = ''; shown = ''; if (timer) { clearTimeout(timer); timer = 0; } if (ty) { ty.skip(); ty = null; current = null; const bub = $('.asst-bub', row); bub.innerHTML = '<span class="asst-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="asst-status">' + esc('Проверяю данные…') + '</span>'; row.classList.add('asst-typing'); row.setAttribute('aria-hidden', 'true'); rowMood(row, 'think'); } }
        if (o.t) { got += o.t; feed(); }
        if (o.error) err = o.error;
      }
    }
    fin = true; if (err && !got) throw new Error(err);
    if (timer) { const left = MIN - (Date.now() - t0); if (left > 0) await sleep(left); clearTimeout(timer); timer = 0; flush(); }
    if (ty) await new Promise(res => (skipping ? (ty.skip(), res()) : ty.end(res)));
    current = null; return {text: got, row, tx};
  }

  const userRow = text => { const d = addRow('u', userHTML(text, 1)); return d; };
  /* вопрос «вылетает» из поля ввода (или кнопки-подсказки) в ленту */
  function flyIn(row, from) {
    if (!from || speed() > 2) return; const bub = $('.asst-bub', row); if (!bub) return; row.classList.add('fly'); bub.style.transition = 'none';
    const to = bub.getBoundingClientRect(), dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    bub.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(.55)'; bub.style.opacity = '.15'; void bub.offsetWidth; bub.style.transition = ''; bub.style.transform = ''; bub.style.opacity = '';
    setTimeout(() => row.classList.remove('fly'), 950);
  }
  let forceCtx = null;          // разовые дополнения к контексту (например, выбранные для сравнения товары, пока они не записались в хранилище)
  async function send(text, from) {
    if (busy) return; text = String(text).trim().slice(0, MAXIN); if (!text) return;
    ensureBrain(); interacted = true; hideTip(); skipping = false;
    setBusy(true); qrPaint([]); stick = true; const down = $('#asst-down'); if (down) down.hidden = true;
    msgs.push({r: 'u', t: text}); const urow = userRow(text); scrollLog(); flyIn(urow, from);
    await loadKb(); if (ai === null) await probe(); ensureBrain(); bst.ai = !!ai; const ctx = Object.assign(ctxOf(), forceCtx || {}); forceCtx = null; const res = brain.reply(text, bst, ctx), useAI = !!(ai && !res.sure);
    A.track && A.track('assistant_msg', {mode: useAI ? 'ai' : 'local', intent: res.intent});
    await sleep(650); tickRead(urow); await sleep(450);          // ✓ → ✓✓: вопрос прочитан, и только потом Стелла начинает «думать»
    const row = typingRow('Читаю вопрос…');
    try {
      if (useAI) {
        try {
          let stepped = false; const t1 = setTimeout(() => { if (!stepped) setStatus(row, 'Думаю над ответом…'); }, T(1500)), t2 = setTimeout(() => { if (!stepped) setStatus(row, 'Подбираю слова…'); }, T(3300));
          const out = await askAI(ctx, row, label => { stepped = true; setStatus(row, label); }).finally(() => { clearTimeout(t1); clearTimeout(t2); }), mk = parseMarks(out.text), pol = POL ? POL.clean(mk.text, D) : null;
          if (pol) { mk.text = pol.text; pol.products.forEach(id => { if (mk.cards.length < 3 && mk.cards.indexOf(id) < 0) mk.cards.push(id); }); }          // упомянутые товары — карточками с нашей ссылкой
          const m = {r: 'b', t: mk.text || 'Не получилось сформулировать ответ — переформулируйте вопрос или свяжитесь с менеджером.', c: mk.cards, ev: mk.events, a: mk.actions, l: mk.links, fb: 0, d: !!(mk.med || (pol && pol.disclaimer))}; msgs.push(m); msgs.chips = followUps(mk);
          if (mk.cards.length) brain.noteExternal(bst, mk.cards);
          const bub = $('.asst-bub', row); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); row.setAttribute('data-i', String(msgs.length - 1));
          if (!$('.asst-tx', bub)) { bub.innerHTML = '<div class="asst-tx"></div>'; sentPop(bub); } $('.asst-tx', bub).innerHTML = fmtL(m.t);
          const extra = extraHTML(m); if (extra) { const d = document.createElement('div'); d.className = 'asst-extra'; d.innerHTML = extra; bub.appendChild(d); } bub.insertAdjacentHTML('beforeend', fbHTML(m)); rowMood(row, 'idle'); announce(m.t); afterRender(); qrPaint(msgs.chips); follow(row);
        } catch (e) {
          if (e && e.name === 'AbortError') { const partial = current && current.text ? current.text() : ''; if (!partial) { row.remove(); headMood('idle'); throw e; } const m = {r: 'b', t: POL ? POL.stripExternal(hideMarks(partial)).text : hideMarks(partial), fb: 0}; msgs.push(m); row.setAttribute('data-i', String(msgs.length - 1)); const bub = $('.asst-bub', row); row.classList.remove('asst-typing'); row.removeAttribute('aria-hidden'); bub.innerHTML = '<div class="asst-tx">' + fmtL(m.t) + '</div>' + fbHTML(m); rowMood(row, 'idle'); msgs.chips = ['Подобрать средство по задаче', 'Ближайшие семинары']; qrPaint(msgs.chips); throw e; }
          const lim = e && e.status === 429, off = e && e.status === 503; if (off) { ai = false; setMode(); }
          rowMood(row, 'think'); skipping = false;
          res.text = (lim ? 'Сообщений слишком много — подождите немного. Пока отвечу по данным сайта.\n\n' : off ? '' : 'ИИ-режим сейчас недоступен — отвечаю по данным сайта.\n\n') + res.text;
          await reveal(pushBot(res), row, {intent: res.intent});
        }
      } else {
        const labels = ['Читаю вопрос…'].concat(res.steps.length ? res.steps : ['Думаю над ответом…']); if (thinkMs(res) > 1900) labels.push('Подбираю слова…');
        await thinkOver(row, labels, thinkMs(res));
        await reveal(pushBot(res), row, {intent: res.intent, quiet: !!(res.quiet && res.quiet.length), autorun: (res.autorun || []).map(i => (res.actions || [])[i]).filter(Boolean), cheer: /^(compliment|love_you|user_birthday|mood_good|holiday_greet|sorry_user|motivation|joke|riddle_ok)$/.test(res.topic || ''), sleepy: res.topic === 'good_night'});
      }
      persist();
    } catch (e) { if (!(e && e.name === 'AbortError')) { const t = $('.asst-typing'); if (t) t.remove(); headMood('idle'); } persist(); }
    finally { setBusy(false); ctrl = null; current = null; skipping = false; const f = $('#asst-in'); if (f && isOpen && !mobile()) f.focus(); }
  }

  function welcome() {
    ensureBrain(); const hr = new Date().getHours(), hi = hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
    const own = brain && brain.welcome ? brain.welcome(ctxOf(), bst, {nav: NAVI, ai: !!ai}) : '';          // приветствие «своими словами» (data/stella/voice.json): по странице и времени суток, варианты чередуются
    return {r: 'b', t: own || hi + '! Я Стелла, мини-консультант «Астрея». Подскажу по каталогу и брендам, обучению, условиям сотрудничества и контактам: подберу продукты по задаче и объясню выбор, сравню товары, посчитаю скидку, найду ближайший семинар.' + (NAVI ? ' Могу и провести по сайту: открою нужный раздел, покажу, где что находится, выставлю фильтры в каталоге и расскажу о товарах, которые вы отметите для сравнения.' : '') + (ai ? ' А ещё с удовольствием отвечу на любые вопросы — не только про сайт.' : '') + ' С чего начнём?'};
  }
  /* первое сообщение приходит как живое: Стелла «печатает», затем сообщение отправляется и печатается */
  async function introWelcome() {
    const l = $('#asst-log'); $$('.asst-m', l).forEach(e => e.remove()); qrPaint([]); skipping = false; introOn = true; setBusy(true);
    const row = typingRow('Стелла печатает…');
    try {
      await Promise.race([probe().then(setMode), sleep(1100)]); await sleep(1000);
      msgs[0] = Object.assign(welcome(), {}); const m = msgs[0]; msgs.chips = brain.starters(ctxOf(), bst);
      if (row.isConnected) await reveal(m, row, {fast: true, cheer: true});
    } finally { introOn = false; setBusy(false); skipping = false; persist(); if (introQ) { const q = introQ; introQ = ''; send(q); } }
  }
  function openChat(opener, quick) {
    build(); if (isOpen) return; isOpen = true; interacted = true; hideTip(); const el = $('#asst'); el.hidden = false; void el.offsetWidth; el.classList.add('open');
    document.body.classList.add('asst-open'); const fab = $('#asst-fab'); fab.setAttribute('aria-expanded', 'true'); openChat.opener = opener || fab; fab.classList.remove('nudge', 'long');
    loadKb().then(() => { ensureBrain(); }); const pr = probe().then(setMode);
    const saved = store.get(); ensureBrain();
    if (saved && !msgs.length) { msgs = saved.msgs; bst = Object.assign(brain.newState(), saved.st || {}); msgs.chips = saved.chips; }
    const l = $('#asst-log'), fresh = !msgs.length;
    if (fresh) { msgs = [welcome()]; msgs.chips = brain.starters(ctxOf(), bst); if (quick) { renderAll(); persist(); } else introWelcome(); }          // quick — чат открыт по просьбе («расскажи о выбранном»): без длинного приветствия
    else { if (!$$('.asst-m', l).length) renderAll(); headMood('happy'); setTimeout(() => { if (!busy) headMood('idle'); }, 1600); }
    setTimeout(() => { const t = $('#asst-in'); if (t && !mobile()) t.focus(); }, 380);
    A.track && A.track('assistant_open'); return pr;
  }
  function closeChat(quiet) {
    if (!isOpen) return; isOpen = false; stopGen(); stopVoice(); const el = $('#asst'); el.classList.remove('open'); document.body.classList.remove('asst-open');
    setTimeout(() => { if (!isOpen) el.hidden = true; }, 420); const fab = $('#asst-fab'); fab.setAttribute('aria-expanded', 'false');
    if (!quiet) { const o = openChat.opener; if (o && o.focus && o.offsetParent !== null) o.focus(); else fab.focus(); heyFab(1600); }
  }
  function reset() { stopGen(); setBusy(false); ensureBrain(); bst = brain.newState(); msgs = [welcome()]; msgs.chips = brain.starters(ctxOf(), bst); persist(); A.toast && A.toast('Диалог очищен'); introWelcome(); }

  /* ---------- подсказка у кнопки, внимание, голос ---------- */
  function tipText() { return 'Добро пожаловать! Я Стелла — помогу выбрать, подскажу и расскажу.'; }
  function maybeTip() {
    if (NAVI) return;          // с навигатором приветствие показывает js/guide.js
    if (ctxOf().page !== 'home') return;          // всплывающая подсказка — только на главной, на остальных страницах окон нет
    const fb = $('#asst-fab'); if (fb && fb.classList.contains('long') && !isOpen) { clearTimeout(tipT); tipT = setTimeout(maybeTip, 2500); return; }          // пока раскрыта подпись «Спросить Стеллу», подсказку не показываем: не дублировать
    if (isOpen || interacted || document.body.classList.contains('x-intro') || document.body.classList.contains('locked') || document.body.classList.contains('menu-open')) return;
    let seen = false; try { seen = !!sessionStorage.getItem(TIPKEY); } catch (e) {} if (seen) return;
    const tip = $('#asst-tip'); if (!tip) return; $('.asst-tip-b', tip).textContent = tipText(); tip.hidden = false; void tip.offsetWidth; tip.classList.add('on'); heyFab(1800); try { sessionStorage.setItem(TIPKEY, '1'); } catch (e) {}
    setTimeout(hideTip, 9000);
  }
  function hideTip() { const tip = $('#asst-tip'); if (!tip || tip.hidden) return; tip.classList.remove('on'); setTimeout(() => { tip.hidden = true; }, 300); }
  /* Подпись «Спросить Стеллу» раскрывается один раз за открытие страницы: когда человек пролистал страницу и остановился, она остаётся раскрытой 2 секунды и снова сворачивается в круг.
     Сразу при загрузке она не раскрывается (первые секунды страница и без того занята вступлением); на телефоне подписи нет. */
  let peekDone = false;
  function armPeek(f) {
    if (peekDone || mobile()) return; peekDone = true;
    const y0 = window.scrollY; let idleT = 0, tries = 0;
    const stop = () => { window.removeEventListener('scroll', onScroll); clearTimeout(idleT); };
    const peek = () => {
      if (isOpen || interacted) return stop();
      if (Math.abs(window.scrollY - y0) < 120) return;                  // прокрутка закончилась, но страница почти не сдвинулась (например, браузер вернул прежнюю позицию) — ждём настоящей
      if (!f.classList.contains('settled') || document.body.classList.contains('locked') || document.body.classList.contains('menu-open')) { if (++tries < 40) idleT = setTimeout(peek, 500); else stop(); return; }       // кнопка ещё появляется или закрыта шторкой — подождать
      stop(); f.classList.add('long'); clearTimeout(longT);
      longT = setTimeout(() => { if (!f.matches(':hover, :focus-visible')) f.classList.remove('long'); }, T(1000 + 2000));       // ≈ 1 с раскрытие + 2 с открыта
    };
    /* в самом обработчике прокрутки ничего не читаем (чтение scrollY посреди прокрутки заставляет браузер пересчитать стили раньше времени — в замерах это было ~0,5 мс на каждое событие):
       только переставляем таймер «через 0,35 с после последнего движения», а положение читаем один раз, когда прокрутка уже остановилась */
    const onScroll = () => { clearTimeout(idleT); idleT = setTimeout(peek, 350); };
    window.addEventListener('scroll', onScroll, {passive: true});
  }
  function nudge() {
    const f = $('#asst-fab'); if (!f || isOpen || interacted || nudges >= 3 || !f.classList.contains('in')) return; nudges++; f.classList.remove('nudge'); void f.offsetWidth; f.classList.add('nudge'); heyFab(1500); if (!mobile()) { f.classList.add('long'); clearTimeout(longT); longT = setTimeout(() => { if (!f.matches(':hover, :focus-visible')) f.classList.remove('long'); }, T(3000)); } nudgeT = setTimeout(nudge, 22000);
  }
  /* Стелла на кнопке радуется (машет, улыбается) */
  function heyFab(ms) { const f = $('#asst-fab'); if (!f) return; const pe = $('.pe', f); if (pe) pe.setAttribute('data-m', 'happy'); f.classList.remove('hello'); void f.offsetWidth; f.classList.add('hello'); clearTimeout(helloT); helloT = setTimeout(() => { f.classList.remove('hello'); if (pe) pe.setAttribute('data-m', 'idle'); }, ms || 1500); }
  /* кнопка слегка тянется к курсору, глаза Стеллы следят за ним (только мышь; без «уменьшения движения») */
  function magnet() {
    mg.raf = 0; const f = $('#asst-fab'); if (!f || !f.classList.contains('in') || isOpen || document.hidden) return;
    /* кнопка закреплена в правом нижнем углу, а глаза следят за курсором не дальше ~560 px: пока курсор далеко, читать вёрстку (getBoundingClientRect заставляет браузер
       пересчитать стили и вёрстку посреди прокрутки) и писать стили незачем — только один раз вернуть кнопку в исходное положение */
    if (Math.hypot(mg.x - (innerWidth - 110), mg.y - (innerHeight - 50)) > 660) { if (!mg.far) { mg.far = true; mg.ox = mg.oy = 0; ['--mx', '--my', '--ex', '--ey'].forEach(k => f.style.removeProperty(k)); } return; }
    mg.far = false;
    const r = f.getBoundingClientRect(), cx = r.left + r.width / 2 - mg.ox, cy = r.top + r.height / 2 - mg.oy, dx = mg.x - cx, dy = mg.y - cy, d = Math.hypot(dx, dy) || 1, near = Math.max(0, 1 - d / 190);
    mg.ox = dx / d * 9 * near; mg.oy = dy / d * 9 * near; const eye = Math.max(0, 1 - d / 560);
    f.style.setProperty('--mx', mg.ox.toFixed(1) + 'px'); f.style.setProperty('--my', mg.oy.toFixed(1) + 'px'); f.style.setProperty('--ex', (dx / d * 1.9 * eye).toFixed(2) + 'px'); f.style.setProperty('--ey', (dy / d * 1.9 * eye).toFixed(2) + 'px');
  }
  document.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || isOpen || !built) return; mg.x = e.clientX; mg.y = e.clientY; if (!mg.raf) mg.raf = requestAnimationFrame(magnet); }, {passive: true});
  document.documentElement.addEventListener('mouseleave', () => { const f = $('#asst-fab'); if (f) ['--mx', '--my', '--ex', '--ey'].forEach(k => f.style.removeProperty(k)); mg.ox = mg.oy = 0; });
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
  A.actions['asst-chip'] = t => send(t.getAttribute('data-q'), t.getBoundingClientRect());
  A.actions['asst-human'] = () => send('Хочу связаться с менеджером');
  A.actions['asst-tour-site'] = () => send('Покажи сайт');          // экскурсия запускается только по нажатию посетителя
  A.actions['asst-mic'] = () => toggleVoice();
  A.actions['asst-tip-x'] = () => hideTip();
  A.actions['asst-down'] = () => { stick = true; scrollLog(); const d = $('#asst-down'); if (d) d.hidden = true; };
  A.actions['asst-ask'] = t => { const q = t.getAttribute('data-q') || ''; A.openForm('question', 'Вопрос из чата помощника'); const f = $('#modal form'); if (f && f.elements.msg && q) f.elements.msg.value = q; };
  A.actions['asst-form'] = t => { const type = t.getAttribute('data-type'); A.openForm(type, t.getAttribute('data-ref') || ''); const f = $('#modal form'); if (!f) return; const spec = t.getAttribute('data-spec'), city = t.getAttribute('data-city'); if (spec && f.elements.spec) f.elements.spec.value = spec; if (city && f.elements.city) f.elements.city.value = city; };
  A.actions['asst-cmp'] = t => { const ids = String(t.getAttribute('data-ids') || '').split(',').filter(id => P[id]); if (NAVI) { try { localStorage.setItem('astreya:cmp', JSON.stringify(ids.slice(0, 3))); } catch (e) {} afterRender(); A.stella.compare(ids); return; }          // с навигатором таблицы нет: сравнение рассказывает Стелла
    let l = []; try { l = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); } catch (e) {} ids.forEach(id => { if (l.indexOf(id) < 0 && A.actions['cmp-toggle']) A.actions['cmp-toggle'](t, id); }); setTimeout(() => A.actions['cmp-open'] && A.actions['cmp-open'](t), 60); };
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
      {name: 'search_products', description: 'Поиск товаров каталога «Астрея» по задаче, бренду, категории или словам. Цен и наличия на сайте нет.', inputSchema: {type: 'object', properties: {query: {type: 'string'}, task: {type: 'string', enum: (D.tasks || []).map(t => t.id)}, brand: {type: 'string', enum: (D.brands || []).map(b => b.id)}, new_only: {type: 'boolean'}}}, execute: run((K, a) => { const l = K.searchProducts({query: a.query, task: a.task, brand: a.brand, newOnly: a.new_only}); return {total: l.length, products: l.slice(0, 10).map(K.brief)}; })},
      {name: 'list_events', description: 'Расписание мероприятий учебного центра «Астрея» (будущие), с фильтрами по городу, бренду и формату.', inputSchema: {type: 'object', properties: {city: {type: 'string'}, online: {type: 'boolean'}}}, execute: run((K, a) => ({events: K.listEvents({city: a.city, online: typeof a.online === 'boolean' ? a.online : undefined}).slice(0, 10)}))},
      {name: 'discount_for_amount', description: 'Ориентировочная скидка по сумме закупки в рублях (пороги с сайта; точные условия подтверждает менеджер).', inputSchema: {type: 'object', properties: {amount_rub: {type: 'number', minimum: 0}}, required: ['amount_rub']}, execute: run((K, a) => K.discount(a.amount_rub))},
      {name: 'get_contacts', description: 'Контакты и представительства «Астрея».', inputSchema: {type: 'object', properties: {city: {type: 'string'}}}, execute: run((K, a) => K.contacts(a.city))}
    ];
    tools.forEach(t => { try { const r = mc.registerTool(Object.assign({annotations: ro}, t)); if (r && r.catch) r.catch(() => {}); } catch (e) {} });
  }

  function init() {
    build(); ensureBrain(); if (isOpen && msgs.length === 1) { msgs.chips = brain.starters(ctxOf(), bst); qrPaint(msgs.chips); }
    const f = $('#asst-fab'); if (f) armPeek(f);
    if (f && !f.classList.contains('in')) setTimeout(() => {          // появление как сцена (≈ 3,5 с): круг проявляется → искры слетаются и вспыхивают → Стелла «просыпается» → машет; подпись раскрывается позже — после первой прокрутки (armPeek)
      f.classList.add('in'); const fx = $('.asst-fab-fx', f); if (fx) { fx.classList.remove('go'); void fx.offsetWidth; fx.classList.add('go'); }
      const pe = $('.pe', f);
      setTimeout(() => { if (pe) { pe.classList.add('waking'); pe.setAttribute('data-m', 'idle'); setTimeout(() => pe.classList.remove('waking'), 800); } }, T(2100));
      setTimeout(() => f.classList.add('settled'), T(2300)); setTimeout(() => heyFab(1900), T(2900));
    }, T(1200));
    clearTimeout(tipT); tipT = setTimeout(maybeTip, Math.round(15500 / speed())); if (!nudgeT) nudgeT = setTimeout(nudge, Math.round(26000 / speed()));
    registerWebMCP();
  }
  /* то, чем пользуются другие части сайта: плашка сравнения (explore.js), навигатор (guide.js), точки входа */
  A.pearl = PEARL;
  A.stella = {
    open: quick => openChat(null, quick), close: quiet => closeChat(quiet), isOpen: () => isOpen, state: () => ({open: isOpen, interacted, busy}), hey: () => heyFab(1500), cmpIds,
    ask(text, extra) {
      text = String(text || '').trim().slice(0, MAXIN); if (!text) return; forceCtx = extra || null; const wasClosed = !isOpen; if (wasClosed) openChat(null, true);
      const fire = n => { if (introOn) { introQ = text; return; } if (busy) { if (n < 60) setTimeout(() => fire(n + 1), 300); return; } send(text); };
      setTimeout(() => fire(0), wasClosed ? 450 : 0);
    },
    compare(ids) {
      const cfg = (D.guide && D.guide.compare) || {}; ids = (ids && ids.length ? ids : cmpIds()).filter(id => P[id]).slice(0, cfg.max || 3);
      if (!ids.length) { A.toast && A.toast('Сначала отметьте товары значком ⇄ на карточках'); return; }
      const names = ids.map(id => P[id].name).join(', '), tpl = ids.length > 1 ? (cfg.request || 'Расскажи и сравни выбранные товары: {names}') : (cfg.requestOne || 'Расскажи о выбранном товаре: {names}');
      A.track && A.track('stella_compare', {count: ids.length}); this.ask(tpl.replace('{names}', names), {cmp: ids});
    }
  };
  A.assistant = {answer: t => { ensureBrain(); return brain.reply(t, brain.newState(), ctxOf()); }};          // для проверок (tools/check-extras.js)
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
