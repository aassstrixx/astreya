/* assistant.js — чат-помощник «Астреи» (data/redesign.json → extras.assistant).

   Работает в двух режимах, посетитель разницы в интерфейсе не замечает:
   1) Встроенный (всегда): отвечает прямо в браузере по данным сайта — js/data.js (товары, бренды, мероприятия) и js/kb.js (о компании, контакты, партнёрам,
      обучение, новости; его собирает tools/build.js и подгружает чат при первом открытии). Ничего никуда не отправляет. Умеет: подбор по задаче, товар и бренд,
      расписание и запись, условия партнёрства и скидки, контакты по городам, «заказать звонок», вопрос менеджеру. Чего на сайте нет (цены, наличие, сроки,
      сертификаты, медицинские рекомендации) — честно говорит об этом и предлагает связаться с менеджером.
   2) ИИ-режим (если сервер включил его — server/lib/assistant.js): свободные вопросы уходят на сервер (/api/assistant, ответ приходит потоком), инструкция
      с данными сайта собирается там же. Простые вещи (контакты, звонок, цены/наличие, скидки) по-прежнему отвечаются встроенным режимом — мгновенно и без затрат.
      Если сервер недоступен или лимит исчерпан, чат тихо возвращается к встроенному режиму.
   Ответ ИИ может заканчиваться маркерами [[product:ID]], [[form:ТИП]], [[link:путь]] — они превращаются в карточки и кнопки только если ID/путь есть в данных сайта.
   Диалог хранится в sessionStorage вкладки (не на сервере), страницы подменяются без перезагрузки — чат остаётся на месте. */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.extras || !D.extras.assistant) return;
  const X = D.extras, I = A.I, esc = A.esc;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const P = {}, B = {}, CAT = {}, TASK = {}, KIND = {}, EV = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.cats || []).forEach(c => { CAT[c.id] = c.name; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.kinds || []).forEach(k => { KIND[k.id] = k.name; }); (D.events || []).forEach(e => { EV[e.id] = e; });
  const root = () => document.body.getAttribute('data-root') || '';
  const KEY = 'astreya:chat', MAXKEEP = 40, MAXIN = 500;
  const PLUS = '<svg class="ic i-pl" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4.5v11M4.5 10h11"/></svg>', CHECK = '<svg class="ic i-ck" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>';
  const SPARK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.2l1.9 5.4 5.4 1.9-5.4 1.9L12 17.8l-1.9-5.4-5.4-1.9 5.4-1.9L12 3.2Z"/><path d="M18.6 15.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>';
  const SEND = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 10 16.5 3.5 12 16.5l-2.2-5.3L3.5 10Z"/><path d="m9.8 11.2 3-3"/></svg>';
  const RESET = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10a6 6 0 1 0 2-4.5M4 3.8v3.4h3.4"/></svg>';
  const store = {get: () => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }, set: v => { try { sessionStorage.setItem(KEY, JSON.stringify(v.slice(-MAXKEEP))); } catch (e) {} }};
  const brandName = id => (B[id] || {}).name || '';
  const pUrl = p => root() + 'products/' + p.slug + '.html';
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  let KB = null, kbP = null, ai = null, isOpen = false, busy = false, msgs = [], ctrl = null, built = false, last = {};
  A.actions = A.actions || {};

  /* ---------- данные ---------- */
  function loadKb() {
    if (window.ASTREYA_KB) { KB = window.ASTREYA_KB; return Promise.resolve(KB); }
    if (kbP) return kbP;
    return (kbP = new Promise(res => { const s = document.createElement('script'); s.src = root() + (X.kb || 'js/kb.js'); s.onload = () => { KB = window.ASTREYA_KB || null; res(KB); }; s.onerror = () => res(null); document.head.appendChild(s); }));
  }
  const endpoint = () => { const e = (D.site && D.site.formEndpoint) || ''; return /\/api\/lead\/?$/.test(e) ? e.replace(/\/api\/lead\/?$/, '/api/assistant') : ''; };
  function probe() {
    if (ai !== null) return Promise.resolve(ai); const ep = endpoint(); if (!ep || !/^https?:$/.test(location.protocol)) { ai = false; return Promise.resolve(false); }          // с локального файла (автономная сборка) сервера нет
    return fetch(ep + '/status', {credentials: 'omit', headers: {Accept: 'application/json'}}).then(r => r.ok ? r.json() : {ai: false}).then(j => { ai = !!(j && j.ai); return ai; }).catch(() => { ai = false; return false; });
  }

  /* ---------- разбор текста ---------- */
  const N = s => A.norm(s).replace(/[^a-zа-я0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const W = re => new RegExp('(^|[^a-zа-я0-9])(?:' + re + ')', 'i');
  const T = s => A.tokens(s);
  const STOP = new Set(['и', 'для', 'по', 'на', 'в', 'с', 'от', 'до', 'из', 'при', 'или', 'как', 'что', 'это', 'мне', 'нам', 'вас', 'про', 'есть', 'ли', 'а', 'у', 'о', 'об', 'не', 'но', 'же', 'бы', 'уход', 'космет', 'средств', 'продукц', 'препарат']);
  const SYN = {
    acne: 'акне|прыщ|высыпан|воспален|постакне|комедон|жирн\\S* кож|черн\\S* точк',
    pigment: 'пигмент|пятн|веснуш|мелазм|осветлен|осветлит|тон кожи|неровн\\S* тон',
    antiage: 'антивозраст|морщин|старен|возрастн|лифтинг|упруг|омолож|регенерац|anti-?age',
    sun: 'солнц|spf|фотозащит|загар|солнцезащит|ожог',
    sens: 'чувствительн|покраснен|куперо|раздражен|реактивн|жжен',
    body: 'тел[оау]($|[^a-zа-я0-9])|фигур|целлюлит|растяжк|похуден|объем[ы]? тела|апельсинов',
    hair: 'волос|выпадени|перхот|кожа головы|кожи головы|трихолог|облысен',
    intim: 'интим|женск\\S* здоров|гинеколог'
  };
  const taskOf = n => Object.keys(SYN).filter(k => TASK[k] && W(SYN[k]).test(n));
  const ALIAS = {dermatime: 'дерматайм|дерматим', keenwell: 'кинвелл|кейнвелл|кинвел|кеенвелл', endocare: 'эндокер|эндокэр|эндокейр', neoretin: 'неоретин', heliocare: 'гелиокер|гелиокэр|гелиокеа|хелиокер', biretix: 'биретикс', iraltone: 'иралтон|ираллтон|ирал тон', elancyl: 'эланцил', eva: 'ева|eva'};
  function brandsIn(n) {
    return (D.brands || []).filter(b => { const nm = N(b.name), al = ALIAS[b.id]; return new RegExp('(^|[^a-zа-я0-9])(?:' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (al ? '|' + al : '') + ')($|[^a-zа-я0-9])', 'i').test(n); });
  }
  function productsIn(n, tokens) {
    const set = new Set(tokens), out = [];
    (D.products || []).forEach(p => {
      const nm = N(p.name); if (!nm) return;
      const tk = T(p.name).filter(t => !STOP.has(t)); if (!tk.length) return;
      if (n.indexOf(nm) >= 0 || tk.every(t => set.has(t) && t.length > 3)) out.push(p);
    });
    return out;
  }
  const CITY = [['Москва', 'москв'], ['Санкт-Петербург', 'санкт|питер|спб|петербург'], ['Ростов-на-Дону', 'ростов'], ['Симферополь', 'симферопол|крым']];
  const cityOf = n => { const c = CITY.find(x => W(x[1]).test(n)); return c ? c[0] : ''; };

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
        if (okType && (a !== 'seminar' || EV[b]) && (a !== 'product' || P[b]) && out.actions.length < 3) out.actions.push({l: FORM_LBL[a], act: 'form', type: a, ref: b || ''});
      } else { const u = knownUrl(a); if (u && out.links.length < 3) out.links.push(u); }
      return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return Object.assign(out, {text: clean});
  }
  const hideMarks = t => String(t).replace(/\[\[(?:product|form|link):[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/\[$/, '');

  /* ---------- встроенный режим: ответы по данным сайта ---------- */
  const R = (text, o) => Object.assign({text, cards: [], events: [], actions: [], links: [], chips: []}, o);
  const callbackAct = () => X.callback ? {l: 'Заказать звонок', act: 'form', type: 'callback', ref: ''} : null;
  const askAct = q => ({l: 'Задать вопрос менеджеру', act: 'asst-ask', q: q || ''});
  const MGR = 'Точные условия, цены и наличие подтверждает менеджер: ' + (D.site.contacts.phone || '') + ', ' + (D.site.contacts.hours || '') + '.';
  const compact = a => a.filter(Boolean);
  const kbPage = u => { const p = ((KB && KB.pages) || []).find(x => x.u === u); return p ? {h: u, l: p.t} : {h: u, l: u}; };

  function ctxOf() {
    const page = document.body.getAttribute('data-page') || '', c = {page};
    const pr = $('.p-page[data-product]'); if (pr) c.product = pr.getAttribute('data-product');
    const ev = $('[data-event]'); if (ev && page === 'event') c.event = ev.getAttribute('data-event');
    const bd = document.body.getAttribute('data-brand') || ($('[data-brand-page]') || {getAttribute: () => ''}).getAttribute('data-brand-page'); if (bd) c.brand = bd;
    return c;
  }
  function productAnswer(p, intro) {
    const x = p.x || {}, lines = [intro || ('**' + p.name + '** — ' + brandName(p.brand) + ', ' + (CAT[p.c] || '').toLowerCase() + (KIND[p.k] ? ' (' + KIND[p.k].toLowerCase() + ')' : '') + '.')];
    if (p.d) lines.push(p.d);
    if ((p.ts || []).length) lines.push('Задачи: ' + p.ts.map(t => TASK[t] || t).join(', ') + '.');
    if (x.volume) lines.push('Объём: ' + x.volume + '.'); if (x.usage) lines.push('Применение: ' + x.usage + '.');
    lines.push('Состав, цену и наличие уточняет менеджер — можно отправить запрос по этому товару.');
    return R(lines.join('\n\n'), {cards: [p.id], actions: [{l: 'Запросить информацию', act: 'form', type: 'product', ref: p.id}], links: [{h: pUrl(p), l: 'Страница товара'}], chips: ['С чем сравнить?', 'Ближайшие семинары', 'Контакты менеджера']});
  }
  function brandAnswer(b) {
    const k = ((KB && KB.brands) || []).find(x => x.id === b.id) || {}, ps = (D.products || []).filter(p => p.brand === b.id);
    const tasks = (D.tasks || []).filter(t => ((KB && KB.tasks || []).find(x => x.id === t.id) || {brands: []}).brands.indexOf(b.id) >= 0).map(t => t.label);
    const lines = ['**' + b.name + '**' + (k.group ? ' — ' + k.group : '') + (k.tag ? '. ' + k.tag : '.')]; if (k.desc) lines.push(k.desc);
    lines.push('В каталоге: ' + ps.length + ' ' + A.plural(ps.length, 'позиция', 'позиции', 'позиций') + (tasks.length ? '. Задачи: ' + tasks.join(', ').toLowerCase() : '') + '.');
    return R(lines.join('\n\n'), {cards: ps.slice(0, 3).map(p => p.id), links: [{h: 'brands/' + b.id + '.html', l: 'Страница бренда'}, {h: 'catalog.html?brand=' + b.id, l: 'Все продукты бренда'}], chips: ['Ближайшие семинары', 'Как стать партнёром']});
  }
  function taskAnswer(ids, n) {
    const id = ids[0], t = ((KB && KB.tasks) || []).find(x => x.id === id) || {label: TASK[id], note: '', brands: []};
    let ps = (D.products || []).filter(p => ids.every(i => (p.ts || []).indexOf(i) >= 0)); if (!ps.length) ps = (D.products || []).filter(p => (p.ts || []).indexOf(id) >= 0);
    const order = t.brands || []; ps.sort((a, b) => (order.indexOf(a.brand) < 0 ? 99 : order.indexOf(a.brand)) - (order.indexOf(b.brand) < 0 ? 99 : order.indexOf(b.brand)) || (b.n ? 1 : 0) - (a.n ? 1 : 0));
    const lines = ['**' + ids.map(i => TASK[i]).join(' + ') + '.** ' + (t.note || '')];
    if (t.brands && t.brands.length) lines.push('Бренды по этой задаче: ' + t.brands.map(brandName).filter(Boolean).join(', ') + '.');
    lines.push('Это ориентир по каталогу, а не назначение: протокол определяет специалист по результатам консультации.');
    return R(lines.join('\n\n'), {cards: ps.slice(0, 4).map(p => p.id), links: [{h: 'catalog.html?task=' + id, l: 'Все продукты по задаче «' + TASK[id] + '»'}], chips: ['Как запросить условия?', 'Ближайшие семинары']});
  }
  function eventsAnswer(n) {
    const city = cityOf(n), online = W('онлайн|вебинар|дистанц').test(n), td = todayIso();
    let evs = (D.events || []).filter(e => e.date >= td).sort((a, b) => a.date.localeCompare(b.date));
    if (city) evs = evs.filter(e => e.city === city); else if (online) evs = evs.filter(e => /онлайн/i.test(e.fm + ' ' + e.city));
    const faq = ((KB && KB.training && KB.training.faq) || []).map(f => ({f, s: T(f.q).filter(t => !STOP.has(t)).filter(t => n.indexOf(t) >= 0).length})).sort((a, b) => b.s - a.s)[0];
    if (faq && faq.s >= 2 && !W('ближайш|расписан|когда|какие').test(n)) return R(faq.f.a, {links: [kbPage('training.html')], actions: [], chips: ['Ближайшие семинары', 'Как записаться?']});
    if (!evs.length) return R('В расписании на сайте сейчас нет ' + (city ? 'будущих мероприятий в городе ' + city : 'будущих мероприятий') + '. Следите за новостями учебного центра или уточните у менеджера.' + ' ' + MGR, {links: [kbPage('training.html'), kbPage('news.html')], actions: compact([callbackAct()])});
    const shown = evs.slice(0, 3);
    return R('Ближайшие мероприятия учебного центра' + (city ? ' (' + city + ')' : '') + ':', {events: shown.map(e => e.id), links: [kbPage('training.html')], text2: 'Базовые семинары бесплатные; время проведения и условия подтверждает менеджер при регистрации.', chips: ['Сколько стоит участие?', 'Как проходит день обучения?']});
  }
  function contactsAnswer(n) {
    const c = (KB && KB.contacts) || D.site.contacts, city = cityOf(n), off = city && KB ? (KB.offices || []).find(o => o.city === city) : null;
    const lines = [];
    if (off && city !== 'Москва') { lines.push('**' + off.city + '** (' + off.role.toLowerCase() + '): ' + off.addr + '.'); off.phones.forEach(p => lines.push(p[1] + ': ' + p[0])); off.emails.forEach(e => lines.push(e)); }
    else lines.push('Главный офис: ' + (c.address || '') + (c.addressNote ? ' (' + c.addressNote + ')' : '') + '.', 'Телефон: ' + c.phone + ' · e-mail: ' + c.email, 'Часы работы: ' + c.hours + '.');
    const links = [{h: 'tel:' + (c.phoneRaw || ''), l: 'Позвонить ' + c.phone}, {h: 'mailto:' + c.email, l: c.email}]; if (c.whatsapp) links.push({h: c.whatsapp, l: 'WhatsApp', ext: true});
    links.push(kbPage('contacts.html')); 
    return R(lines.join('\n'), {links, actions: compact([callbackAct()]), chips: ['Как стать партнёром', 'Ближайшие семинары']});
  }
  function partnerAnswer(n) {
    const pt = (KB && KB.partner) || {steps: [], benefits: []};
    const lines = ['Сотрудничество строится так: ' + (pt.steps.length ? pt.steps.map((s, i) => (i + 1) + ') ' + s.t.toLowerCase()).join(', ') + '.' : 'оставьте заявку — менеджер свяжется и обсудит условия.')];
    if (pt.benefits.length) lines.push('Что получает партнёр: ' + pt.benefits.slice(0, 4).map(b => b.t.toLowerCase()).join(', ') + '.');
    if (W('скидк|порог|объем|объём').test(n)) lines.push(discountText());
    return R(lines.join('\n\n'), {actions: [{l: 'Стать партнёром', act: 'form', type: 'partner', ref: ''}], links: [{h: 'partners.html', l: 'Условия и калькулятор скидок'}], chips: ['Какие скидки?', 'Контакты менеджера']});
  }
  function discountText(short) {
    const d = (KB && KB.discounts) || {tiers: D.site.discounts || [], note: 'Условия подтверждает менеджер.'};
    return 'Скидки по объёму закупки (ориентировочно): ' + (d.tiers || []).map(t => 'от ' + t.from.toLocaleString('ru-RU') + ' ₽ — ' + t.pct + '%').join('; ') + '.' + (short ? '' : ' ' + d.note);
  }

  /* правила: [распознавание, ответ]; порядок важен. Возвращает {a: ответ, sure: «уверенно — можно не обращаться к ИИ»} */
  function local(text, ctx) {
    const n = N(text), tokens = T(text), rs = (a, sure) => ({a, sure: sure !== false});
    if (!n) return rs(R('Напишите вопрос — отвечу по каталогу, обучению и условиям сотрудничества.'));
    if (W('привет|здравствуй|добрый день|доброе утро|добрый вечер|хай|hello|hi($|\\s)').test(n) && tokens.length <= 4) return rs(R('Здравствуйте! Подскажу по каталогу и брендам, обучению, условиям сотрудничества и контактам. Что вас интересует?', {chips: starters()}));
    if (W('спасиб|благодар').test(n)) return rs(R('Пожалуйста! Если появятся вопросы — пишите.', {chips: ['Ближайшие семинары', 'Контакты менеджера']}));
    if (W('до свидани|пока($|\\s)|всего доброго|удачи').test(n)) return rs(R('Всего доброго! Если понадоблюсь — я здесь.'));
    if (W('кто ты|что ты умеешь|что умеешь|ты бот|ты человек|ты робот|ты живой|ты ии|нейросет|чем ты можешь|чем можешь помочь|помощь|что можно спросить').test(n))
      return rs(R('Я программа-помощник сайта «Астреи», не сотрудник. ' + (ai ? 'Отвечаю на свободные вопросы с помощью ИИ и по данным сайта. ' : 'Отвечаю по данным сайта. ') + 'Умею: подобрать продукты по задаче, рассказать о брендах и товарах, показать расписание обучения, объяснить условия сотрудничества, дать контакты. Цены, наличие и персональные рекомендации — к менеджеру.', {chips: starters()}));
    if (W('перезвон|заказать звонок|закажу звонок|позвоните мне|обратный звонок').test(n)) return rs(R(X.callback ? 'Оставьте имя и телефон — менеджер перезвонит в рабочее время (' + D.site.contacts.hours + ').' : 'Позвоните нам: ' + D.site.contacts.phone + ' (' + D.site.contacts.hours + ').', {actions: compact([callbackAct()])}));
    if (W('медицинск|беремен|лактац|аллерги|противопоказ|диагноз|лечени|болезн|дерматит|экзем|псориаз|онколог|можно ли мне|подойд[её]т ли мне|назначь|что мне делать').test(n))
      return rs(R('Я не даю медицинских рекомендаций и не ставлю диагнозов: подбор ухода и протокол определяет специалист по результатам консультации. Могу рассказать, какие продукты на сайте относятся к нужной задаче, а с вопросами по применению поможет менеджер или ваш косметолог.', {actions: [askAct(text)], links: [{h: 'catalog.html', l: 'Каталог'}], chips: ['Подобрать средство по задаче']}));
    if (W('цен|стоит|стоимост|прайс|почем|сколько стоит|дорог|дешев').test(n) && !W('обучен|семинар|мастер|вебинар|участи').test(n)) { const pp = productsIn(n, tokens)[0];
      return rs(R('Цен на сайте нет: стоимость зависит от объёма закупки и условий партнёрства, её называет менеджер (' + D.site.contacts.phone + ', ' + D.site.contacts.hours + '). Для ориентира — ' + discountText(true).charAt(0).toLowerCase() + discountText(true).slice(1) + ' Точные условия подтверждает менеджер.', {cards: pp ? [pp.id] : [], actions: compact([{l: 'Запросить условия', act: 'form', type: 'product', ref: pp ? pp.id : ''}, callbackAct()]), links: [{h: 'partners.html', l: 'Калькулятор скидок'}]})); }
    if (W('налич|на склад|достав|отгруз|срок поставк|сроки|сертификат|регистрац|декларац|документ|состав|дозиров|штрихкод|гарант').test(n) && !productsIn(n, tokens).length)
      return rs(R('Этих сведений на сайте нет, чтобы не ошибиться, их подтверждает менеджер: наличие, сроки и условия доставки, документы и сертификаты, состав. ' + MGR, {actions: compact([{l: 'Запросить информацию', act: 'form', type: 'product', ref: ''}, callbackAct()])}));
    if (W('контакт|телефон|позвонить|номер|почт|e-?mail|адрес|где наход|как добрат|как найти|офис|график|часы работ|режим работ|когда работа|whatsapp|ватсап|представительств').test(n)) return rs(contactsAnswer(n));
    if (W('менеджер|оператор|живой человек|связаться|свяжитесь|консультант').test(n)) return rs(R('Менеджер ответит в рабочее время: ' + D.site.contacts.phone + ' (' + D.site.contacts.hours + '). Можно заказать звонок или задать вопрос письменно.', {actions: compact([callbackAct(), askAct(text)]), links: [kbPage('contacts.html')]}));
    if (W('где купить|как купить|как заказать|как приобрести|как оформить заказ|физлиц|частн\\S* лиц|для себя|интернет-магазин').test(n)) return rs(R('Продукция «Астреи» рассчитана на специалистов — косметологов, салоны и клиники — и поставляется партнёрам. Чтобы начать, оставьте заявку на партнёрство или запрос по товару: менеджер уточнит условия и подскажет, как оформить поставку. Для частных покупателей условия уточняйте у менеджера.', {actions: compact([{l: 'Стать партнёром', act: 'form', type: 'partner', ref: ''}, {l: 'Запросить информацию', act: 'form', type: 'product', ref: ''}, callbackAct()]), links: [{h: 'partners.html', l: 'Условия сотрудничества'}]}));
    if (W('партн[её]р|сотрудничеств|дилер|дистрибьют|оптом|опт($|\\s)|закупк|условия поставк|договор|стать клиент').test(n)) return rs(partnerAnswer(n));
    if (W('скидк|порог|программа скидок').test(n)) return rs(R(discountText(), {actions: [{l: 'Стать партнёром', act: 'form', type: 'partner', ref: ''}], links: [{h: 'partners.html', l: 'Калькулятор скидок'}]}));
    if (W('заявк|оставить запрос|отправить запрос').test(n)) return rs(R('Выберите, что оформить:', {actions: compact([{l: 'Запросить информацию', act: 'form', type: 'product', ref: ''}, {l: 'Стать партнёром', act: 'form', type: 'partner', ref: ''}, callbackAct()])}));
    if (W('как записат|записат|регистрац на|запись на').test(n) && (D.events || []).length) { const e = (D.events || []).filter(x => x.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date))[0]; if (e) return rs(R('Выберите мероприятие в расписании и нажмите «Записаться» — или запишитесь на ближайшее:', {events: [e.id], links: [kbPage('training.html')]})); }
    if (W('обучен|семинар|мастер-?класс|вебинар|курс|академи|мероприят|расписан|учебн').test(n)) return rs(eventsAnswer(n));
    if (W('новост|акци[июя]|что нового|анонс').test(n)) { const nw = ((KB && KB.news) || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3); return rs(R(nw.length ? 'Свежее на сайте: ' + nw.map(x => x.t).join('; ') + '.' : 'Новости — на странице «Новости».', {links: nw.map(x => ({h: root() + x.u, l: x.t})).concat(nw.length ? [] : [kbPage('news.html')])})); }
    if (W('новинк').test(n)) { const ps = (D.products || []).filter(p => p.n).slice(0, 4); return rs(R(ps.length ? 'Новинки каталога:' : 'Сейчас новинок в каталоге нет.', {cards: ps.map(p => p.id), links: [{h: 'catalog.html', l: 'Весь каталог'}]})); }
    if (W('о компании|кто вы|чем занимаетесь|расскажите о себе|расскажите о компании|оригинальн|контрафакт|подлинн|кто такие').test(n)) { const c = KB && KB.company; return rs(R(c && c.about && c.about.length ? c.about[0] + (c.advantages && c.advantages.length ? '\n\nПреимущества: ' + c.advantages.slice(0, 4).map(a => a.t.toLowerCase()).join(', ') + '.' : '') : 'Подробно о компании — на странице «Компания».', {links: [{h: 'company.html', l: 'О компании'}], chips: ['Какие бренды?', 'Как стать партнёром']})); }
    /* сущности: товар, бренд, задача, категория */
    const ps = productsIn(n, tokens), bs = brandsIn(n), tk = taskOf(n);
    if (ps.length >= 2 && W('сравн|чем отличается|в чем разница|разниц|что лучше|отличи').test(n)) {
      const list = ps.slice(0, 3);
      if (list.length >= 2) return rs(R('Сравнить удобно по таблице: ' + list.map(p => p.name).join(' и ') + '. Показаны данные из каталога; чего в нём нет, уточняет менеджер.', {cards: list.map(p => p.id), actions: X.compare ? [{l: 'Открыть сравнение', act: 'asst-cmp', ids: list.map(p => p.id).join(',')}] : []}));
    }
    if (ps.length === 1) return rs(productAnswer(ps[0]), !ai);
    if (ps.length > 1) return rs(R('Нашёл несколько подходящих товаров:', {cards: ps.slice(0, 4).map(p => p.id), actions: X.compare && ps.length >= 2 ? [{l: 'Сравнить', act: 'asst-cmp', ids: ps.slice(0, 3).map(p => p.id).join(',')}] : []}), !ai);
    if (bs.length === 1) return rs(brandAnswer(bs[0]), !ai);
    if (bs.length > 1) return rs(R('Подскажу по брендам: ' + bs.map(b => b.name).join(', ') + '. О каком рассказать подробнее?', {links: bs.map(b => ({h: 'brands/' + b.id + '.html', l: b.name})), chips: bs.map(b => 'Расскажите про ' + b.name)}), !ai);
    if (tk.length) return rs(taskAnswer(tk, n), !ai);
    if (W('этот|эта|это($|\\s)|его|ее|её|данн|текущ').test(n) && ctx.product && P[ctx.product]) return rs(productAnswer(P[ctx.product]), !ai);
    const cats = (D.cats || []).filter(c => T(c.name).filter(t => !STOP.has(t) && t.length > 3).some(t => tokens.indexOf(t) >= 0));
    if (cats.length) { const cps = (D.products || []).filter(p => p.c === cats[0].id); return rs(R('**' + cats[0].name + '** — ' + cps.length + ' ' + A.plural(cps.length, 'позиция', 'позиции', 'позиций') + ' в каталоге.', {cards: cps.slice(0, 3).map(p => p.id), links: [{h: 'catalog.html?cat=' + cats[0].id, l: 'Открыть категорию'}]}), !ai); }
    if (W('подобрать|подбор|посоветуй|порекоменд|что выбрать|что взять|помогите выбрать|что подойд[её]т').test(n)) return rs(R('По какой задаче подбираем? Выберите или напишите своими словами.', {chips: (D.tasks || []).slice(0, 8).map(t => t.label)}), !ai);
    if (W('каталог|ассортимент|что у вас есть|что продаёте|что продаете|что есть|продукци|бренд').test(n)) { const cnt = {}; (D.products || []).forEach(p => { cnt[p.c] = (cnt[p.c] || 0) + 1; }); return rs(R('В каталоге ' + D.products.length + ' ' + A.plural(D.products.length, 'позиция', 'позиции', 'позиций') + ' ' + (D.brands || []).length + ' ' + A.plural((D.brands || []).length, 'бренда', 'брендов', 'брендов') + ': ' + (D.brands || []).map(b => b.name).join(', ') + '. Категории: ' + (D.cats || []).filter(c => cnt[c.id]).map(c => c.name.toLowerCase()).join(', ') + '.', {links: [{h: 'catalog.html', l: 'Каталог'}, {h: 'brands.html', l: 'Бренды'}], chips: ['Подобрать средство по задаче']}), !ai); }
    /* поиск по сайту: пересечение основ слов с индексом */
    const q = tokens.filter(t => !STOP.has(t) && t.length > 2);
    if (q.length) {
      const scored = (D.index || []).map(it => { const hay = it.q || ''; return {it, s: q.filter(t => hay.indexOf(t) >= 0).length}; }).filter(x => x.s >= Math.min(2, q.length)).sort((a, b) => b.s - a.s).slice(0, 3);
      if (scored.length) return rs(R('Вот что нашёл на сайте по вашему вопросу:', {links: scored.map(x => ({h: root() + x.it.url, l: x.it.title})), actions: [askAct(text)]}), false);
    }
    return rs(R('Не уверен, что правильно понял вопрос. Могу подсказать по каталогу, брендам, обучению, партнёрству и контактам — или передайте вопрос менеджеру.', {actions: compact([askAct(text), callbackAct()]), chips: starters()}), false);
  }
  function starters() { const c = ctxOf(); return c.product ? ['Расскажите об этом товаре', 'С чем сравнить?', 'Как запросить условия?', 'Ближайшие семинары'] : ['Подобрать средство по задаче', 'Ближайшие семинары', 'Как стать партнёром', 'Контакты и часы работы']; }

  /* ---------- ИИ-режим ---------- */
  function ctxLine(c) {
    if (c.product && P[c.product]) return '[Посетитель сейчас на странице товара: ' + P[c.product].name + ' (' + c.product + ')]\n';
    if (c.event && EV[c.event]) return '[Посетитель сейчас на странице мероприятия: ' + EV[c.event].title + ' (' + c.event + ')]\n';
    return '';
  }
  function plainHistory(extra) {
    const out = msgs.filter(m => m.t).map(m => ({role: m.r === 'u' ? 'user' : 'assistant', content: m.t})).slice(-10);
    return out.concat(extra || []);
  }
  async function askAI(text, ctx, bubble) {
    const ep = endpoint(); ctrl = new AbortController();
    const hist = plainHistory(); const lastU = hist[hist.length - 1]; if (lastU) lastU.content = ctxLine(ctx) + lastU.content;
    const r = await fetch(ep, {method: 'POST', credentials: 'omit', signal: ctrl.signal, headers: {'Content-Type': 'application/json', Accept: 'text/event-stream'}, body: JSON.stringify({messages: hist})});
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; try { e.body = await r.json(); } catch (x) {} throw e; }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', got = '', err = null;
    for (;;) {
      const {done, value} = await rd.read(); if (done) break; buf += dec.decode(value, {stream: true});
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); if (ev.indexOf('data: ') !== 0) continue; let o; try { o = JSON.parse(ev.slice(6)); } catch (x) { continue; } if (o.t) { got += o.t; paintBubble(bubble, hideMarks(got)); } if (o.error) err = o.error; }
    }
    if (err && !got) throw new Error(err);
    return got;
  }

  /* ---------- интерфейс ---------- */
  function build() {
    if (built) return; built = true; document.body.classList.add('has-asst');
    const fab = document.createElement('button'); fab.type = 'button'; fab.id = 'asst-fab'; fab.className = 'asst-fab'; fab.setAttribute('data-act', 'asst-open'); fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'asst'); fab.setAttribute('aria-label', 'Помощник «Астреи»: задать вопрос');
    fab.innerHTML = SPARK + '<span class="asst-fab-t">Помощник</span>'; document.body.appendChild(fab);
    const el = document.createElement('section'); el.id = 'asst'; el.className = 'asst'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Помощник «Астреи»');
    el.innerHTML = '<header class="asst-h"><span class="asst-av" aria-hidden="true">' + SPARK + '</span><div class="asst-ht"><b>Помощник «Астреи»</b><small id="asst-mode">Подсказываю по каталогу, обучению и условиям</small></div>' +
      '<button class="asst-ib" type="button" data-act="asst-reset" aria-label="Начать диалог заново" title="Начать заново">' + RESET + '</button><button class="asst-ib" type="button" data-act="asst-close" aria-label="Закрыть помощника">' + I.close + '</button></header>' +
      '<div class="asst-log" id="asst-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0"></div><div class="asst-chips" id="asst-chips"></div>' +
      '<form class="asst-form" id="asst-form" autocomplete="off"><label class="sr" for="asst-in">Ваш вопрос</label><textarea id="asst-in" rows="1" maxlength="' + MAXIN + '" placeholder="Напишите вопрос…" enterkeyhint="send"></textarea><button class="asst-send" type="submit" aria-label="Отправить">' + SEND + '</button></form>' +
      '<p class="asst-note" id="asst-note">Я программа, а не сотрудник. Не вводите здесь личные данные; цены, наличие и условия подтверждает менеджер.</p>';
    document.body.appendChild(el);
    const ta = $('#asst-in', el);
    $('#asst-form', el).addEventListener('submit', e => { e.preventDefault(); const v = ta.value.trim(); if (v) { ta.value = ''; grow(ta); send(v); } });
    ta.addEventListener('input', () => grow(ta));
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#asst-form', el).requestSubmit(); } });
  }
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 120) + 'px'; }
  function setMode() {
    const m = $('#asst-mode'), n = $('#asst-note'); if (!m) return;
    m.textContent = ai ? 'Отвечаю на свободные вопросы с помощью ИИ' : 'Подсказываю по каталогу, обучению и условиям';
    n.textContent = ai ? 'Я программа (ИИ), а не сотрудник; ответы могут быть неточными. Текст вопросов обрабатывается на сервере сайта и в сервисе ИИ — не вводите личные данные. Цены, наличие и условия подтверждает менеджер.' : 'Я программа, а не сотрудник. Не вводите здесь личные данные; цены, наличие и условия подтверждает менеджер.';
  }
  const fmt = t => { const inl = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); return String(t).replace(/\r/g, '').split(/\n{2,}/).filter(Boolean).map(b => { const ls = b.split('\n'); return ls.every(l => /^\s*([-•*]|\d+[.)])\s+/.test(l)) ? '<ul>' + ls.map(l => '<li>' + inl(l.replace(/^\s*([-•*]|\d+[.)])\s+/, '')) + '</li>').join('') + '</ul>' : '<p>' + ls.map(inl).join('<br>') + '</p>'; }).join(''); };
  function cardHTML(id) {
    const p = P[id]; if (!p) return ''; const b = B[p.brand] || {}, st = A.bstyle ? A.bstyle(b) : '';
    const img = p.im ? '<img src="' + esc(root() + p.im) + '" alt="" loading="lazy" decoding="async">' : '<i></i>';
    return '<div class="asst-card" style="' + esc(st) + '"><a class="asst-card-a" href="' + esc(pUrl(p)) + '" data-track="assistant_card"><span class="asst-card-i">' + img + '</span><span class="asst-card-t"><small>' + esc(b.name || '') + '</small><b>' + esc(p.name) + '</b><em>' + esc((p.ts || []).map(t => TASK[t] || t).slice(0, 2).join(' · ')) + '</em></span></a><span class="asst-card-b">' +
      (X.requestList ? '<button class="rl-tog asst-mini" type="button" data-act="rl-add" data-id="' + id + '" data-rl-id="' + id + '">' + PLUS + CHECK + '<span class="rl-tl"></span></button>' : '') +
      (X.compare ? '<button class="cmp-tog asst-mini" type="button" data-act="cmp-toggle" data-id="' + id + '" data-cmp-id="' + id + '" aria-label="Сравнить: ' + esc(p.name) + '">⇄</button>' : '') + '</span></div>';
  }
  function eventHTML(id) {
    const e = EV[id]; if (!e) return ''; const d = A.dparts(e.date);
    return '<div class="asst-ev"><a href="' + esc(root() + 'training/' + e.slug + '.html') + '" data-track="assistant_event"><span class="asst-ev-d"><b>' + d.d + '</b>' + esc(d.m) + '</span><span class="asst-ev-t"><b>' + esc(e.title) + '</b><small>' + esc([e.fm, e.city, e.tm].filter(Boolean).join(' · ')) + '</small></span></a><button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="seminar" data-ref="' + esc(e.id) + '" data-track="assistant_register">Записаться</button></div>';
  }
  function bodyHTML(m) {
    let h = m.t ? '<div class="asst-tx">' + fmt(m.t) + '</div>' : '';
    if (m.ev && m.ev.length) h += '<div class="asst-evs">' + m.ev.map(eventHTML).join('') + '</div>';
    if (m.t2) h += '<div class="asst-tx asst-tx2">' + fmt(m.t2) + '</div>';
    if (m.c && m.c.length) h += '<div class="asst-cards">' + m.c.map(cardHTML).join('') + '</div>';
    const acts = (m.a || []).map(a => a.act === 'form' ? '<button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="' + esc(a.type) + '"' + (a.ref ? ' data-ref="' + esc(a.ref) + '"' : '') + ' data-track="assistant_action">' + esc(a.l) + '</button>' : '<button class="btn btn-ghost btn-sm" type="button" data-act="' + esc(a.act) + '"' + (a.q ? ' data-q="' + esc(a.q.slice(0, MAXIN)) + '"' : '') + (a.ids ? ' data-ids="' + esc(a.ids) + '"' : '') + ' data-track="assistant_action">' + esc(a.l) + '</button>');
    const links = (m.l || []).map(l => '<a class="asst-ln" href="' + esc(/^(tel:|mailto:|https?:)/.test(l.h) ? l.h : root() + l.h) + '"' + (l.ext ? ' target="_blank" rel="noopener"' : '') + ' data-track="assistant_link">' + esc(l.l) + ' ' + I.arrow + '</a>');
    if (acts.length || links.length) h += '<div class="asst-acts">' + acts.join('') + links.join('') + '</div>';
    return h;
  }
  function paintBubble(b, text) { const tx = $('.asst-tx', b); if (tx) tx.innerHTML = fmt(text); else b.innerHTML = '<div class="asst-tx">' + fmt(text) + '</div>'; scrollLog(); }
  function scrollNew(el) { const l = $('#asst-log'); if (l && el) l.scrollTop = Math.max(0, el.offsetTop - 12); }          // новый ответ показываем с начала, а не с конца
  function scrollLog() { const l = $('#asst-log'); if (l) l.scrollTop = l.scrollHeight; }
  function addBubble(role, html, cls) { const l = $('#asst-log'), d = document.createElement('div'); d.className = 'asst-m asst-' + role + (cls ? ' ' + cls : ''); d.innerHTML = html; l.appendChild(d); scrollLog(); return d; }
  function chipsPaint(list) { const c = $('#asst-chips'); if (!c) return; c.innerHTML = (list || []).slice(0, 4).map(t => '<button class="chip" type="button" data-act="asst-chip" data-q="' + esc(t) + '">' + esc(t) + '</button>').join(''); }
  function renderAll() {
    const l = $('#asst-log'); l.innerHTML = '';
    msgs.forEach(m => addBubble(m.r === 'u' ? 'u' : 'b', m.r === 'u' ? '<div class="asst-tx"><p>' + esc(m.t) + '</p></div>' : bodyHTML(m)));
    const lm = msgs[msgs.length - 1]; chipsPaint(lm && lm.r === 'b' ? lm.ch : starters()); afterRender();
  }
  function afterRender() { if (A.rlSync) A.rlSync(); if (A.cmpSync) A.cmpSync(); }
  function persist() { store.set(msgs.map(m => ({r: m.r, t: m.t, t2: m.t2, c: m.c, ev: m.ev, a: m.a, l: m.l, ch: m.ch}))); }
  function typing(on) { const old = $('.asst-typing'); if (old) old.remove(); if (on) addBubble('b', '<span class="asst-dots" aria-label="Помощник печатает"><i></i><i></i><i></i></span>', 'asst-typing'); }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function pushBot(res) { const m = {r: 'b', t: res.text, t2: res.text2, c: res.cards, ev: res.events, a: res.actions, l: res.links, ch: res.chips}; msgs.push(m); return m; }
  async function send(text) {
    if (busy) return; text = String(text).trim().slice(0, MAXIN); if (!text) return;
    busy = true; $('#asst-form').classList.add('busy'); chipsPaint([]);
    msgs.push({r: 'u', t: text}); addBubble('u', '<div class="asst-tx"><p>' + esc(text) + '</p></div>');
    await loadKb(); const ctx = ctxOf(), L = local(text, ctx); A.track && A.track('assistant_msg', {mode: ai && !L.sure ? 'ai' : 'local'});
    try {
      if (ai && !L.sure) {
        const bubble = addBubble('b', '<span class="asst-dots" aria-label="Помощник печатает"><i></i><i></i><i></i></span>', 'asst-typing');
        try {
          const full = await askAI(text, ctx, bubble), mk = parseMarks(full);
          const m = pushBot(R(mk.text || 'Не получилось сформулировать ответ — переформулируйте вопрос или свяжитесь с менеджером.', {cards: mk.cards, actions: mk.actions, links: mk.links, chips: followUps(mk)}));
          bubble.classList.remove('asst-typing'); bubble.innerHTML = bodyHTML(m); afterRender(); scrollNew(bubble);
        } catch (e) {
          bubble.remove(); if (e && e.name === 'AbortError') throw e;
          const lim = e && e.status === 429, off = e && e.status === 503; if (off) { ai = false; setMode(); }
          const res = L.a; res.text = (lim ? 'Сообщений слишком много — подождите немного. Пока отвечу по данным сайта.\n\n' : off ? '' : 'ИИ-режим сейчас недоступен — отвечаю по данным сайта.\n\n') + res.text;
          const fb = addBubble('b', bodyHTML(pushBot(res))); afterRender(); scrollNew(fb);
        }
      } else {
        typing(true); await wait(380 + Math.min(500, L.a.text.length * 3)); typing(false);
        const nb = addBubble('b', bodyHTML(pushBot(L.a))); afterRender(); scrollNew(nb);
      }
      const lm = msgs[msgs.length - 1]; chipsPaint(lm.ch); afterRender(); persist();
    } catch (e) { typing(false); } finally { busy = false; $('#asst-form') && $('#asst-form').classList.remove('busy'); }
  }
  const followUps = mk => mk.cards.length || mk.actions.length ? ['Ближайшие семинары', 'Контакты менеджера'] : ['Подобрать средство по задаче', 'Как стать партнёром'];

  function openChat(opener) {
    build(); if (isOpen) return; isOpen = true; const el = $('#asst'); el.hidden = false; void el.offsetWidth; el.classList.add('open');
    document.body.classList.add('asst-open'); const fab = $('#asst-fab'); fab.setAttribute('aria-expanded', 'true'); openChat.opener = opener || fab;
    loadKb(); probe().then(setMode);
    msgs = store.get(); const l = $('#asst-log');
    if (!msgs.length) { msgs = [{r: 'b', t: 'Здравствуйте! Я помощник «Астреи». Подскажу по каталогу и брендам, обучению, условиям сотрудничества и контактам. Что вас интересует?', ch: starters()}]; }
    if (!l.children.length) renderAll(); setTimeout(() => { const t = $('#asst-in'); if (t) t.focus(); }, 60);
    A.track && A.track('assistant_open');
  }
  function closeChat() {
    if (!isOpen) return; isOpen = false; if (ctrl) { try { ctrl.abort(); } catch (e) {} } const el = $('#asst'); el.classList.remove('open'); document.body.classList.remove('asst-open');
    setTimeout(() => { if (!isOpen) el.hidden = true; }, 280); const fab = $('#asst-fab'); fab.setAttribute('aria-expanded', 'false'); const o = openChat.opener; if (o && o.focus && o.offsetParent !== null) o.focus(); else fab.focus();
  }
  function reset() { if (ctrl) { try { ctrl.abort(); } catch (e) {} } busy = false; $('#asst-form').classList.remove('busy'); msgs = [{r: 'b', t: 'Начнём заново. Что вас интересует?', ch: starters()}]; persist(); renderAll(); A.toast && A.toast('Диалог очищен'); }

  /* ---------- события ---------- */
  A.actions['asst-open'] = t => isOpen ? closeChat() : openChat(t);
  A.actions['asst-close'] = () => closeChat();
  A.actions['asst-reset'] = () => reset();
  A.actions['asst-chip'] = t => send(t.getAttribute('data-q'));
  A.actions['asst-ask'] = t => { const q = t.getAttribute('data-q') || ''; A.openForm('question', 'Вопрос из чата помощника'); const f = $('#modal form'); if (f && f.elements.msg && q) f.elements.msg.value = q; };
  A.actions['asst-cmp'] = t => { const ids = String(t.getAttribute('data-ids') || '').split(',').filter(id => P[id]); let l = []; try { l = JSON.parse(localStorage.getItem('astreya:cmp') || '[]'); } catch (e) {} ids.forEach(id => { if (l.indexOf(id) < 0 && A.actions['cmp-toggle']) A.actions['cmp-toggle'](t, id); }); setTimeout(() => A.actions['cmp-open'] && A.actions['cmp-open'](t), 60); };
  if (window.visualViewport) { const fit = () => { const el = $('#asst'); if (el) el.style.setProperty('--asst-h', matchMedia('(max-width:640px)').matches ? Math.round(window.visualViewport.height) + 'px' : ''); scrollLog(); }; window.visualViewport.addEventListener('resize', fit); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen && !$('#modal.open')) closeChat(); }, true);          // фаза захвата: пока окно заявки открыто, Esc закрывает только его
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#asst a[href]'); if (a && !a.target && matchMedia('(max-width:640px)').matches && !/^(tel:|mailto:)/.test(a.getAttribute('href'))) setTimeout(closeChat, 50); });
  document.addEventListener('astreya:intro', () => { const f = $('#asst-fab'); if (f) f.classList.toggle('away', document.body.classList.contains('x-intro')); });

  function init() { build(); if (isOpen && msgs.length === 1) chipsPaint(starters()); }          // после смены страницы подсказки в начале диалога подстраиваются под неё
  A.assistant = {answer: t => local(t, ctxOf()).a};          // для проверок (tools/check-extras.js)
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
