/* assistant-brain.js — «мозг» помощника: понимает вопрос, помнит ход диалога, считает, ищет и объясняет. Не зависит от страницы (UMD): работает в браузере
   (js/assistant.js) и в Node (серверные инструменты ИИ-режима, tools/check-assistant.js).

   Что умеет (всё — по данным сайта, ничего не выдумывает):
   · исправляет опечатки по словарю предметной области («пигментацыя», «семинарры», «дермотайм»), понимает падежи и разговорные формулировки;
   · помнит диалог: «а у Dermatime?», «ещё», «подробнее про второй», «почему именно эти?», «с чем сочетать?», «сравни их», «да/нет» на свой вопрос;
   · запоминает роль и город («я косметолог из Ростова») и подстраивает ответы и формы;
   · считает: скидку по сумме закупки («а при 200 тысячах?»), дни до мероприятия, расписание по месяцу/неделе/городу/формату;
   · сравнивает товары по данным и объясняет различия словами; рассказывает, почему порекомендовал именно это;
   · ищет по материалам сайта (о компании, обучение, партнёрам, новости, бренды) и отвечает найденным предложением со ссылкой;
   · на непонятное — «возможно, вы имели в виду…» и передача менеджеру, а не выдуманный ответ.
   createKnowledge(D, KB) — общие инструменты поиска (их же вызывает ИИ-режим на сервере); createBrain(D, KB) — диалоговый движок. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Astreya = root.Astreya || {}; root.Astreya.brain = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const S = (typeof module === 'object' && module.exports && typeof require === 'function') ? require('./shared.js') : root.Astreya;
  const norm = S.norm, stem = S.stem, plural = S.plural, MON_G = S.MON_G;

  /* ---------- слова и опечатки ---------- */
  const words = s => norm(s).replace(/[^a-zа-я0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const clean = s => norm(s).replace(/[^a-zа-я0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  function lev(a, b, max) {                                       // расстояние Дамерау — Левенштейна с отсечкой
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  const limitFor = w => w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0;
  const STOP = new Set(['и', 'для', 'по', 'на', 'в', 'с', 'от', 'до', 'из', 'при', 'или', 'как', 'что', 'это', 'мне', 'нам', 'вас', 'про', 'есть', 'ли', 'а', 'у', 'о', 'об', 'не', 'но', 'же', 'бы', 'уход', 'космет', 'средств', 'продукц', 'препарат', 'ваш', 'вам', 'можно', 'нужн', 'хочу', 'хотел', 'подскаж', 'скаж', 'расскаж', 'пожалуйст', 'какой', 'какие', 'какая', 'какое', 'где', 'когда', 'ещ', 'очень', 'там', 'тут', 'они', 'оно', 'все', 'всё']);
  const KEYWORDS = ('семинар мероприятие обучение вебинар расписание пигментация акне антивозраст фотозащита чувствительная сравнить сравнение контакты телефон адрес партнёр сотрудничество скидка скидки цена стоимость доставка наличие ' +
    'сертификат новинки каталог бренд бренды записаться менеджер позвонить перезвонить подобрать посоветуйте рекомендуете волосы выпадение целлюлит растяжки морщины солнцезащита пилинг пилинги мезотерапия ампулы сыворотка крем ' +
    'интимное тональный корректор шампунь лосьон гель флюид обучение косметолог салон клиника студия магазин москва петербург ростов симферополь крым онлайн ближайшие бесплатно компания документы подробнее отличается разница почему').split(' ');

  /* ---------- знания о сайте ---------- */
  function createKnowledge(D, KB, opts) {
    opts = opts || {}; KB = KB || {};
    const now = opts.now || (() => new Date());
    const P = {}, B = {}, CAT = {}, TASK = {}, KIND = {}, EV = {};
    (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.cats || []).forEach(c => { CAT[c.id] = c.name; }); (D.tasks || []).forEach(t => { TASK[t.id] = t.label; }); (D.kinds || []).forEach(k => { KIND[k.id] = k.name; }); (D.events || []).forEach(e => { EV[e.id] = e; });
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const today = () => iso(now());
    const daysTo = date => Math.round((Date.UTC(...date.split('-').map((x, i) => i === 1 ? +x - 1 : +x)) - Date.UTC(now().getFullYear(), now().getMonth(), now().getDate())) / 864e5);
    const brandName = id => (B[id] || {}).name || '';
    const kbTask = id => ((KB.tasks || []).find(t => t.id === id)) || {id, label: TASK[id], note: '', brands: []};
    const kbBrand = id => ((KB.brands || []).find(b => b.id === id)) || {};

    /* товары: поиск по запросу, задаче, бренду, категории */
    function brief(p) { return {id: p.id, name: p.name, brand: brandName(p.brand), category: CAT[p.c] || '', kind: KIND[p.k] || '', tasks: (p.ts || []).map(t => TASK[t] || t), new: !!p.n, description: p.d || ''}; }
    function searchProducts(q) {
      q = q || {}; let list = (D.products || []).slice();
      if (q.task) list = list.filter(p => (p.ts || []).indexOf(q.task) >= 0);
      if (q.brand) list = list.filter(p => p.brand === q.brand);
      if (q.category) list = list.filter(p => p.c === q.category);
      if (q.kind) list = list.filter(p => p.k === q.kind);
      if (q.newOnly) list = list.filter(p => p.n);
      if (q.home === true) list = list.filter(p => p.c === 'home'); else if (q.home === false) list = list.filter(p => p.c !== 'home');
      if (q.query) { const tk = words(q.query).map(stem).filter(t => t.length > 2 && !STOP.has(t)); if (tk.length) { list = list.map(p => { const hay = norm([p.name, p.d, brandName(p.brand), CAT[p.c], KIND[p.k], (p.ts || []).map(t => TASK[t]).join(' ')].join(' ')); return {p, s: tk.filter(t => hay.indexOf(t) >= 0).length}; }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.p); } }
      if (q.task) { const order = kbTask(q.task).brands || []; list.sort((a, b) => (order.indexOf(a.brand) < 0 ? 99 : order.indexOf(a.brand)) - (order.indexOf(b.brand) < 0 ? 99 : order.indexOf(b.brand)) || (b.n ? 1 : 0) - (a.n ? 1 : 0)); }
      return list;
    }
    function getProduct(id) {
      const p = P[id]; if (!p) return null; const x = p.x || {};
      return Object.assign(brief(p), {url: 'products/' + p.slug + '.html', volume: x.volume || null, sku: x.sku || null, usage: x.usage || null, indications: x.indications || null, actives: x.actives || null, note: 'Цена, наличие и состав на сайте не указаны — уточняет менеджер.'});
    }
    function getBrand(id) {
      const b = B[id]; if (!b) return null; const k = kbBrand(id), ps = (D.products || []).filter(p => p.brand === id);
      return {id, name: b.name, origin: k.group || '', summary: k.tag || '', description: k.desc || '', url: 'brands/' + id + '.html', tasks: (D.tasks || []).filter(t => (kbTask(t.id).brands || []).indexOf(id) >= 0).map(t => t.label), products: ps.map(p => ({id: p.id, name: p.name}))};
    }

    /* мероприятия */
    function listEvents(q) {
      q = q || {}; const t0 = q.from || today();
      let list = (D.events || []).filter(e => e.date >= t0 && (!q.to || e.date <= q.to)).sort((a, b) => a.date.localeCompare(b.date));
      if (q.city) list = list.filter(e => e.city === q.city);
      if (q.brand) list = list.filter(e => e.b === q.brand);
      if (q.online === true) list = list.filter(e => /онлайн|вебинар/i.test(e.fm + ' ' + e.city)); else if (q.online === false) list = list.filter(e => !/онлайн|вебинар/i.test(e.fm + ' ' + e.city));
      return list.map(e => ({id: e.id, title: e.title, date: e.date, city: e.city, format: e.fm, time: e.tm, brand: brandName(e.b), speaker: e.sp || '', days_until: daysTo(e.date), url: 'training/' + e.slug + '.html'}));
    }

    /* скидка по сумме закупки (пороги — из data/site.json, «ориентировочные») */
    function discount(amount) {
      const tiers = ((KB.discounts && KB.discounts.tiers) || D.site.discounts || []).slice().sort((a, b) => a.from - b.from), a = Math.max(0, Math.round(+amount || 0));
      let cur = null; tiers.forEach(t => { if (a >= t.from) cur = t; }); const next = tiers.find(t => t.from > a) || null;
      return {amount: a, pct: cur ? cur.pct : 0, threshold: cur ? cur.from : null, saving: cur ? Math.round(a * cur.pct / 100) : 0, total: cur ? Math.round(a * (100 - cur.pct) / 100) : a, next_pct: next ? next.pct : null, next_from: next ? next.from : null, shortfall: next ? next.from - a : 0, tiers,
        note: (KB.discounts && KB.discounts.note) || 'Скидки ориентировочные: точные условия подтверждает менеджер.'};
    }

    /* контакты и представительства */
    function contacts(city) {
      const c = KB.contacts || D.site.contacts, offices = KB.offices || [], off = city ? offices.find(o => o.city === city) : null;
      return {main: {phone: c.phone, phoneRaw: c.phoneRaw, email: c.email, hours: c.hours, address: c.address || '', whatsapp: c.whatsapp || ''}, office: off || null, offices: offices.map(o => ({city: o.city, role: o.role, address: o.addr, phones: o.phones, emails: o.emails}))};
    }

    /* поиск по материалам сайта: абзацы базы знаний, стеммы, TF-IDF, ближайшая по смыслу фраза */
    const passages = [];
    const addP = (title, text, url, kind) => { text = String(text || '').trim(); if (text) passages.push({title, text, url: url || '', kind: kind || ''}); };
    if (KB.company) {
      (KB.company.about || []).forEach(t => addP('О компании', t, 'company.html', 'company')); (KB.company.directions || []).forEach(d => addP(d.t, d.p, 'company.html', 'company')); (KB.company.advantages || []).forEach(d => addP(d.t, d.p, 'company.html', 'company')); (KB.company.professionals || []).forEach(t => addP('Работа с профессионалами', t, 'company.html', 'company'));
      ((KB.training && KB.training.faq) || []).forEach(f => addP(f.q, f.a, 'training.html', 'faq')); ((KB.training && KB.training.steps) || []).forEach(s => addP('Как записаться: ' + s.t, s.p, 'training.html', 'training'));
      ((KB.partner && KB.partner.benefits) || []).forEach(b => addP('Партнёрам: ' + b.t, b.p, 'partners.html', 'partner')); ((KB.partner && KB.partner.steps) || []).forEach(s => addP('Как стать партнёром: ' + s.t, s.p, 'partners.html', 'partner'));
      (KB.news || []).forEach(n => addP(n.t, n.d, n.u, 'news')); (KB.brands || []).forEach(b => addP(b.name, [b.tag, b.desc].filter(Boolean).join('. '), b.url, 'brand')); (KB.tasks || []).forEach(t => addP(t.label, t.note, 'catalog.html?task=' + t.id, 'task'));
      (KB.offices || []).forEach(o => addP('Представительство: ' + o.city, [o.role, o.addr, (o.phones || []).map(p => p[0] + ' (' + p[1] + ')').join(', ')].join('. '), 'contacts.html', 'office'));
    }
    const df = {}; passages.forEach(p => { p.tf = {}; const tk = words(p.title + ' ' + p.text).map(stem); p.len = tk.length || 1; tk.forEach(t => { p.tf[t] = (p.tf[t] || 0) + 1; }); p.tt = new Set(words(p.title).map(stem)); Object.keys(p.tf).forEach(t => { df[t] = (df[t] || 0) + 1; }); });
    const vocab = Object.keys(df);
    const idf = t => Math.log(1 + (passages.length + 1) / ((df[t] || 0) + 0.5));
    /* разговорные слова → слова материалов сайта («бесплатно» ищется как «стоит/участие») */
    const SYNQ = {бесплатн: ['стоит', 'участи'], платн: ['стоит', 'участи'], цен: ['стоит'], дорог: ['стоит'], работает: ['часы'], график: ['часы'], преподавател: ['спикер'], документ: ['документ']};
    function searchInfo(query, k) {
      const qt0 = words(query).map(stem).filter(t => t.length > 2 && !STOP.has(t)); if (!qt0.length || !passages.length) return [];
      const qt = qt0.slice(); qt0.forEach(t => { Object.keys(SYNQ).forEach(key => { if (t.indexOf(key) === 0) SYNQ[key].forEach(x => { if (qt.indexOf(x) < 0 && df[x]) qt.push(x); }); }); });
      const expand = qt.map(t => { if (df[t]) return t; if (t.length < 5) return t; const lim = limitFor(t); let best = null, bd = lim + 1; for (const v of vocab) { if (v[0] !== t[0]) continue; const d = lev(t, v, lim); if (d < bd) { bd = d; best = v; } } return best || t; });
      const res = passages.map(p => { let s = 0, hit = 0; expand.forEach(t => { const f = p.tf[t]; if (f) { hit++; s += idf(t) * (1 + Math.log(f)) / Math.sqrt(p.len) * (p.tt.has(t) ? 1.4 : 1); } }); return {p, s: s * Math.pow(hit / expand.length, 2), hit}; }).filter(x => x.hit > 0).sort((a, b) => b.s - a.s);
      return res.slice(0, k || 4).map(x => ({title: x.p.title, text: x.p.text, url: x.p.url, kind: x.p.kind, score: Math.round(x.s * 1000) / 1000, hit: x.hit, of: expand.length, _p: x.p, _q: expand}));
    }
    /* самая подходящая фраза абзаца */
    function bestSentence(text, qtokens) {
      const ss = String(text).split(/(?<=[.!?])\s+/).filter(Boolean); if (ss.length <= 1) return text;
      const sc = ss.map((s, i) => { const w = new Set(words(s).map(stem)); return {s, i, n: qtokens.filter(t => w.has(t)).length}; }).sort((a, b) => b.n - a.n || a.i - b.i);
      return sc[0].n ? sc[0].s : ss[0];
    }
    /* факты для сравнения нескольких товаров — только то, что есть в данных сайта (их же получает ИИ инструментом compare_products) */
    function compareFacts(ids) {
      const list = (ids || []).map(id => P[id]).filter(Boolean).slice(0, 4); if (!list.length) return null;
      const items = list.map(p => { const b = B[p.brand] || {}, kb = kbBrand(p.brand), x = p.x || {}; return {id: p.id, name: p.name, brand: b.name || '', brand_origin: kb.group || '', brand_country: kb.country || '', brand_summary: kb.tag || '', category: CAT[p.c] || '', kind: KIND[p.k] || '', tasks: (p.ts || []).map(t => TASK[t] || t), task_ids: (p.ts || []).slice(), description: p.d || '', new: !!p.n, for_home: p.c === 'home', url: 'products/' + p.slug + '.html', details: Object.keys(x).length ? x : null}; });
      const shared = items.length > 1 ? items[0].task_ids.filter(t => items.every(i => i.task_ids.indexOf(t) >= 0)) : [], uniq = {};
      items.forEach(i => { uniq[i.id] = items.length > 1 ? i.task_ids.filter(t => !items.some(o => o !== i && o.task_ids.indexOf(t) >= 0)).map(t => TASK[t] || t) : []; });
      const same = f => items.every(i => f(i) === f(items[0]));
      return {products: items, shared_tasks: shared.map(t => TASK[t] || t), shared_task_ids: shared, shared_task_notes: shared.map(t => ({task: TASK[t] || t, note: kbTask(t).note || ''})).filter(x => x.note), unique_tasks: uniq, same_brand: same(i => i.brand), same_category: same(i => i.category), same_kind: same(i => i.kind),
        missing_on_site: ['состав и активные компоненты', 'объём и артикул', 'способ применения', 'цена и наличие', 'документы и сертификаты'].filter((t, i) => i > 3 || !items.every(it => it.details && (i === 0 ? it.details.actives : i === 1 ? (it.details.volume && it.details.sku) : it.details.usage))), note: 'Это все данные сайта по этим товарам. Чего здесь нет, того на сайте нет: уточняет менеджер.'};
    }
    return {P, B, CAT, TASK, KIND, EV, KB, today, daysTo, brandName, kbTask, kbBrand, brief, searchProducts, getProduct, getBrand, listEvents, discount, contacts, searchInfo, bestSentence, compareFacts, vocab, passages, iso, now};
  }

  /* ---------- диалоговый движок ---------- */
  const SYN = {
    acne: 'акн[еэ]|прыщ|высыпан|воспален|постакне|комедон|жирн\\S* кож|черн\\S* точк',
    pigment: 'пигмент|пят[её]н|пятн|веснуш|мелазм|осветлен|осветлит|тон кожи|неровн\\S* тон|гиперпигмент',
    antiage: 'антивозраст|морщин|старен|возрастн|лифтинг|упруг|омолож|регенерац|anti-?age',
    sun: 'солнц|spf|фотозащит|загар|солнцезащит|ожог',
    sens: 'чувствительн|покраснен|куперо|раздражен|реактивн|жжен',
    body: 'тел[оау]($|[^a-zа-я0-9])|фигур|целлюлит|растяжк|похуден|объем[ы]? тела|апельсинов',
    hair: 'волос|выпадени|перхот|кожа головы|кожи головы|кожу головы|трихолог|облысен',
    intim: 'интим|женск\\S* здоров|гинеколог'
  };
  const ALIAS = {dermatime: 'дерматайм|дерматим|дермотайм|dermatim', keenwell: 'кинвелл|кейнвелл|кинвел|кеенвелл|keenvel', endocare: 'эндокер|эндокэр|эндокейр|эндокар', neoretin: 'неоретин|неоретен', heliocare: 'гелиокер|гелиокэр|гелиокеа|хелиокер|гелиокар', biretix: 'биретикс|бирэтикс|биретис', iraltone: 'иралтон|ираллтон|ирал тон|иралтоун', elancyl: 'эланцил|еланцил|эланцыл', eva: 'ева|eva'};
  const CITY = [['Москва', 'москв|мск'], ['Санкт-Петербург', 'санкт|питер|спб|петербург'], ['Ростов-на-Дону', 'ростов'], ['Симферополь', 'симферопол|крым']];
  const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  const SPEC_BY_ROLE = {cosmetologist: 'Косметолог / эстетист', salon: 'Салон красоты', clinic: 'Клиника / центр эстетической медицины', shop: 'Магазин / дистрибьютор', other: 'Другое'};
  const W = re => new RegExp('(^|[^a-zа-я0-9])(?:' + re + ')', 'i');
  const END = '($|[^a-zа-я0-9])';
  const ORD = [['перв', 0], ['втор', 1], ['трет', 2], ['четв[её]рт', 3]];

  function createBrain(D, KB, opts) {
    opts = opts || {};
    const K = createKnowledge(D, KB, opts), {P, B, CAT, TASK, KIND, EV} = K;
    const D_ = D, contactsMain = (KB && KB.contacts) || D.site.contacts;
    const hasCallback = !!(D.extras && D.extras.callback), hasCompare = !!(D.extras && D.extras.compare);

    /* словарь для исправления опечаток: названия из данных + ключевые слова + слова материалов сайта */
    const VOC = new Set();
    const addV = s => words(s).forEach(w => { if (w.length >= 5) VOC.add(w); });
    (D.products || []).forEach(p => addV(p.name)); (D.brands || []).forEach(b => addV(b.name)); (D.tasks || []).forEach(t => addV(t.label)); (D.cats || []).forEach(c => addV(c.name)); KEYWORDS.forEach(addV);
    Object.keys(ALIAS).forEach(k => ALIAS[k].split('|').forEach(a => { if (!/\\|\(/.test(a)) addV(a); }));
    const vocStem = {}; VOC.forEach(w => { vocStem[w] = stem(w); });
    function correct(text) {
      const out = []; let changed = false;
      words(text).forEach(w => {
        if (w.length < 5 || VOC.has(w) || /\d/.test(w)) { out.push(w); return; }
        const sw = stem(w), lim = limitFor(w), ls = limitFor(sw); let best = null, bd = 99;
        for (const v of VOC) {
          if (v[0] !== w[0] || Math.abs(v.length - w.length) > lim + 2) continue;
          let d = lev(w, v, lim);
          if (d > lim) { const ds = ls ? lev(sw, vocStem[v], ls) : 99; d = ds <= ls ? ds : 99; }          // сравнение основ: падежи не мешают
          if (d < bd && d <= Math.max(lim, ls)) { bd = d; best = v; }
        }
        if (best) { if (w.startsWith(best) || best.startsWith(w) || stem(best) === sw) out.push(w); else { out.push(best); changed = true; } } else out.push(w);          // падежная форма — не опечатка: слово остаётся как есть, иначе ломаются шаблоны («о компании»)
      });
      return {text: out.join(' '), changed};
    }

    /* сущности */
    const taskOf = n => Object.keys(SYN).filter(k => TASK[k] && W(SYN[k]).test(n));
    const brandsIn = n => (D.brands || []).filter(b => { const nm = clean(b.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), al = ALIAS[b.id]; return new RegExp('(^|[^a-zа-я0-9])(?:' + nm + (al ? '|' + al : '') + ')' + END, 'i').test(n); });
    function productsIn(n, tk) {
      const set = new Set(tk), out = [];
      (D.products || []).forEach(p => {
        const nm = clean(p.name); if (!nm) return; const core = words(p.name).map(stem).filter(t => !STOP.has(t) && t.length > 3); if (!core.length) return;
        if (n.indexOf(nm) >= 0 || core.every(t => set.has(t))) out.push(p);
      });
      return out;
    }
    const cityOf = n => { const c = CITY.find(x => W(x[1]).test(n)); return c ? c[0] : ''; };
    function roleOf(n) {
      if (W('я\\s+(косметолог|эстетист|врач|дерматолог|мастер|специалист)|работаю косметолог|косметолог по профессии').test(n)) return 'cosmetologist';
      if (W('(у меня|у нас|мой|наш|открываю|владею|владелец)\\S*\\s*(салон|студи)|салон красоты').test(n)) return 'salon';
      if (W('(у меня|у нас|мо[яй]|наш[аи]?|работаю в|открываю)\\s*(клиник|медцентр|центр эстетическ)').test(n)) return 'clinic';
      if (W('(у меня|у нас|мой|наш|открываю)\\s*(магазин|интернет-магазин)|я дистрибьютор|мы дистрибьютор').test(n)) return 'shop';
      return '';
    }
    const ROLE_NAME = {cosmetologist: 'косметолог', salon: 'салон красоты', clinic: 'клиника', shop: 'магазин', other: ''};
    function amountOf(text) {
      const n = norm(text).replace(/(\d)\s+(?=\d{3}(\D|$))/g, '$1');
      let m = /(\d+(?:[.,]\d+)?)\s*(млн|миллион\S*|тыс\S*|т\.?\s?р|к|k)?(?![а-я])/i.exec(n); if (m && m[1]) { let v = parseFloat(m[1].replace(',', '.')), u = (m[2] || '').toLowerCase(); if (/^млн|^миллион/.test(u)) v *= 1e6; else if (/^тыс|^т\.?\s?р|^к$|^k$/.test(u)) v *= 1e3; return Math.round(v); }
      if (/полмиллион/.test(n)) return 5e5; if (/миллион/.test(n)) return 1e6; return 0;
    }
    function periodOf(n) {
      const t = K.now(), y = t.getFullYear(), iso = K.iso;
      if (W('сегодня').test(n)) return {from: iso(t), to: iso(t), label: 'сегодня'};
      if (W('завтра').test(n)) { const d = new Date(t); d.setDate(d.getDate() + 1); return {from: iso(d), to: iso(d), label: 'завтра'}; }
      if (W('на этой неделе|на неделе|эту неделю').test(n)) { const d = new Date(t); d.setDate(d.getDate() + (7 - (d.getDay() || 7))); return {from: iso(t), to: iso(d), label: 'на этой неделе'}; }
      if (W('на следующей неделе|следующую неделю').test(n)) { const a = new Date(t), b = new Date(t); a.setDate(a.getDate() + (8 - (a.getDay() || 7))); b.setDate(a.getDate() + 6); return {from: iso(a), to: iso(b), label: 'на следующей неделе'}; }
      if (W('в этом месяце|этот месяц').test(n)) { const b = new Date(y, t.getMonth() + 1, 0); return {from: iso(t), to: iso(b), label: 'в этом месяце'}; }
      if (W('в следующем месяце|следующий месяц').test(n)) { const a = new Date(y, t.getMonth() + 1, 1), b = new Date(y, t.getMonth() + 2, 0); return {from: iso(a), to: iso(b), label: 'в следующем месяце'}; }
      for (let i = 0; i < 12; i++) if (W(MONTHS[i] + '\\S*').test(n)) { const yy = i < t.getMonth() ? y + 1 : y, a = new Date(yy, i, 1), b = new Date(yy, i + 1, 0); return {from: iso(a), to: iso(b), label: 'в ' + ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'][i]}; }
      return null;
    }

    /* вспомогательные ответы */
    const R = (text, o) => Object.assign({text, text2: '', cards: [], events: [], actions: [], links: [], chips: [], steps: [], sure: true, intent: ''}, o);
    const act = {
      form: (type, l, ref, extra) => Object.assign({l, act: 'form', type, ref: ref || ''}, extra || {}),
      callback: () => hasCallback ? {l: 'Заказать звонок', act: 'form', type: 'callback', ref: ''} : null,
      ask: q => ({l: 'Задать вопрос менеджеру', act: 'asst-ask', q: q || ''}),
      partner: st => ({l: 'Стать партнёром', act: 'form', type: 'partner', ref: '', spec: st && st.role ? SPEC_BY_ROLE[st.role] : '', city: st && st.city || ''})
    };
    const compact = a => a.filter(Boolean);
    const link = (h, l) => ({h, l});
    const MGR = () => 'Точные условия, цены и наличие подтверждает менеджер: ' + contactsMain.phone + ', ' + contactsMain.hours + '.';
    const pick = (st, arr) => arr[((st.turns || 0) + arr.length * 9) % arr.length];
    const fmtDate = d => { const [y, m, dd] = d.split('-').map(Number); return dd + ' ' + MON_G[m - 1]; };
    const fmtRub = n => Number(n).toLocaleString('ru-RU') + ' ₽';
    const inDays = d => d === 0 ? 'сегодня' : d === 1 ? 'завтра' : 'через ' + d + ' ' + plural(d, 'день', 'дня', 'дней');
    const brandList = ids => ids.map(K.brandName).filter(Boolean).join(', ');
    const lower = s => String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);
    const hello = () => { const h = K.now().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; };

    function starters(ctx, st) {
      ctx = ctx || {};
      if (ctx.brand && B[ctx.brand]) return ['С чем работает этот бренд?', 'Что выбрать у этого бренда?', 'Ближайшие семинары', 'Как запросить условия?'];
      if (ctx.product && P[ctx.product]) return ['Расскажите об этом товаре', 'С чем сравнить?', 'Как запросить условия?', 'Ближайшие семинары'];
      if (ctx.event && EV[ctx.event]) return ['Как записаться?', 'Сколько стоит участие?', 'Другие семинары', 'Контакты менеджера'];
      if (st && st.role) return ['Подобрать средство по задаче', 'Ближайшие семинары', 'Условия и скидки', 'Контакты'];
      return ['Подобрать средство по задаче', 'Ближайшие семинары', 'Как стать партнёром', 'Контакты и часы работы'];
    }

    /* карточки списком: сохраняем «всё найденное» для «ещё» и порядковых ссылок */
    function showList(st, ids, o) {
      const first = ids.slice(0, 4); st.last = Object.assign({}, st.last, {cards: first, all: ids, offset: first.length}, o || {}); return first;
    }

    function productAnswer(p, st, intro) {
      const x = p.x || {}, lines = [intro || ('**' + p.name + '** — ' + K.brandName(p.brand) + ', ' + lower(CAT[p.c] || '') + (KIND[p.k] ? ' (' + lower(KIND[p.k]) + ')' : '') + '.')];
      if (p.d) lines.push(p.d);
      if ((p.ts || []).length) lines.push('Подходит для задач: ' + p.ts.map(t => lower(TASK[t] || t)).join(', ') + (p.n ? '. Это новинка каталога.' : '.'));
      if (x.volume) lines.push('Объём: ' + x.volume + '.'); if (x.usage) lines.push('Применение: ' + x.usage + '.');
      lines.push('Состав, цену и наличие на сайте не указываем — их подтверждает менеджер; можно отправить запрос по этому товару.');
      st.last = {intent: 'product', cards: [p.id], all: [p.id], offset: 1, tasks: (p.ts || []).slice(), brand: p.brand, product: p.id};
      return R(lines.join('\n\n'), {cards: [p.id], actions: [act.form('product', 'Запросить информацию', p.id)], links: [link('products/' + p.slug + '.html', 'Страница товара')], chips: ['С чем сочетать?', 'С чем сравнить?', 'Ближайшие семинары'], intent: 'product', steps: ['Открываю карточку товара…']});
    }
    function brandAnswer(b, st) {
      const info = K.getBrand(b.id), ps = (D.products || []).filter(p => p.brand === b.id);
      const lines = ['**' + info.name + '**' + (info.origin ? ' — ' + info.origin : '') + (info.summary ? '. ' + info.summary : '.')]; if (info.description) lines.push(info.description);
      lines.push('В каталоге: ' + ps.length + ' ' + plural(ps.length, 'позиция', 'позиции', 'позиций') + (info.tasks.length ? '. Основные задачи: ' + info.tasks.map(lower).join(', ') : '') + '.');
      const first = showList(st, ps.map(p => p.id), {intent: 'brand', brand: b.id, tasks: []});
      return R(lines.join('\n\n'), {cards: first, links: [link('brands/' + b.id + '.html', 'Страница бренда'), link('catalog.html?brand=' + b.id, 'Все продукты бренда')], chips: ps.length > 4 ? ['Ещё товары бренда', 'Ближайшие семинары'] : ['Ближайшие семинары', 'Как стать партнёром'], intent: 'brand', steps: ['Смотрю информацию о бренде…']});
    }
    function taskAnswer(ids, st, filt) {
      filt = filt || {}; const id = ids[0], t = K.kbTask(id);
      let ps = K.searchProducts({task: id}); if (ids.length > 1) { const both = ps.filter(p => ids.every(i => (p.ts || []).indexOf(i) >= 0)); if (both.length) ps = both; }
      const base = ps.slice(); if (filt.brand) ps = ps.filter(p => p.brand === filt.brand); if (filt.home === true) ps = ps.filter(p => p.c === 'home'); else if (filt.home === false) ps = ps.filter(p => p.c !== 'home');
      const label = ids.map(i => TASK[i]).join(' + '), lines = [];
      if (!ps.length) {
        const alt = base.map(p => K.brandName(p.brand)).filter((v, i, a) => a.indexOf(v) === i);
        st.last = {intent: 'task', tasks: ids, brand: filt.brand || '', cards: [], all: [], offset: 0, home: filt.home};
        return R('По задаче «' + label + '»' + (filt.brand ? ' у бренда ' + K.brandName(filt.brand) : '') + (filt.home === true ? ' для домашнего ухода' : filt.home === false ? ' для кабинета' : '') + ' в каталоге ничего нет.' + (base.length ? ' Зато по этой задаче есть: ' + alt.join(', ') + '.' : ''), {cards: base.slice(0, 3).map(p => p.id), chips: ['Все по задаче «' + label + '»', 'Другая задача'], intent: 'task'});
      }
      const first = showList(st, ps.map(p => p.id), {intent: 'task', tasks: ids, brand: filt.brand || '', home: filt.home});
      lines.push('**' + label + '**' + (filt.brand ? ' · ' + K.brandName(filt.brand) : '') + (filt.home === true ? ' · для дома' : filt.home === false ? ' · для кабинета' : '') + '. ' + (t.note || ''));
      const brands = ps.map(p => p.brand).filter((v, i, a) => a.indexOf(v) === i);
      if (t.brands && t.brands.length) lines.push('Сайт называет основными для этой задачи бренды: ' + brandList(t.brands) + '.');
      lines.push('Нашёл ' + ps.length + ' ' + plural(ps.length, 'позицию', 'позиции', 'позиций') + ' (' + brandList(brands) + '). ' + (ps.length > first.length ? 'Показываю первые ' + first.length + ' — напишите «ещё», чтобы увидеть остальные.' : ''));
      lines.push('Это ориентир по каталогу, а не назначение: протокол определяет специалист по результатам консультации.');
      const chips = ['Почему именно эти?', 'С чем сочетать?']; if (first.length > 1 && hasCompare) chips.push('Сравни первые два'); if (!filt.brand && brands.length > 1) chips.push('А у ' + K.brandName(brands[0]) + '?');
      return R(lines.join('\n\n'), {cards: first, links: [link('catalog.html?task=' + ids[0], 'Все продукты по задаче')], chips: chips.slice(0, 4), intent: 'task', steps: ['Смотрю каталог по задаче…', 'Подбираю бренды…']});
    }
    /* ---------- сравнение: текст по данным сайта; шаблон выбрала «арена» (tools/arena-stella.js), остальные оставлены для проверок ---------- */
    const nm = i => '**' + i.name + '**', lowT = t => lower(t), join = (a, w) => a.length > 1 ? a.slice(0, -1).join(', ') + ' ' + (w || 'и') + ' ' + a[a.length - 1] : a[0] || '';
    const brandLine = i => { const o = [i.brand_origin, i.brand_country].filter((x, k, a) => x && a.indexOf(x) === k).join(', '); return i.brand + (o ? ' (' + o + ')' : ''); };
    const capF = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1), uniqBy = (a, f) => a.filter((x, k) => a.findIndex(y => f(y) === f(x)) === k);
    const firstSent = t => { const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(String(t || '')); return (m ? m[0] : String(t || '')).trim(); };
    const CMPT = {
      /* A — «строки»: бренд / категория / вид / назначение / описание (как прежняя таблица, но словами) */
      lines(f) {
        const it = f.products, L = ['Сравниваю ' + join(it.map(nm)) + ' по данным сайта:', ''];
        L.push('- Бренд: ' + it.map(i => i.name + ' — ' + i.brand).join('; ') + '.'); L.push('- Категория: ' + it.map(i => i.name + ' — ' + lowT(i.category)).join('; ') + '.'); L.push('- Вид: ' + it.map(i => i.name + ' — ' + lowT(i.kind || '—')).join('; ') + '.');
        L.push('- Назначение: ' + it.map(i => i.name + ' — ' + (i.tasks.map(lowT).join(', ') || 'не указано')).join('; ') + '.'); L.push('- Описание на сайте: ' + it.map(i => i.name + ' — «' + firstSent(i.description).replace(/[.!\s]+$/, '') + '».').join(' '));
        return L.join('\n');
      },
      /* B — «разделы»: общее → различия → кому что ближе → чего на сайте нет */
      sections(f) {
        const it = f.products, one = it.length === 1, L = [];
        if (one) {
          const i = it[0]; L.push('Рассказываю о ' + nm(i) + ' по данным сайта.'); L.push('**Что это.** ' + i.category + ', ' + lowT(i.kind || 'продукт') + ' бренда ' + brandLine(i) + (i.brand_summary ? ' — «' + i.brand_summary + '»' : '') + '.');
          L.push('**Для каких задач указан.** ' + (i.tasks.length ? i.tasks.map(lowT).join(', ') : 'на сайте не указано') + (i.new ? '. Новинка каталога' : '') + '.'); L.push('**Описание на сайте.** «' + String(i.description || '').replace(/[.!\s]+$/, '') + '».'); L.push('**Чего на сайте нет.** ' + capF(f.missing_on_site.join(', ')) + ' — это уточняет менеджер.');
          return L.join('\n\n');
        }
        L.push('Сравниваю ' + join(it.map(nm)) + ' по данным сайта.');
        const common = []; common.push(f.same_brand ? (it.length === 2 ? 'Оба продукта' : 'Все продукты') + ' — ' + brandLine(it[0]) + '.' : 'Бренды разные: ' + uniqBy(it, i => i.brand).map(b => brandLine(b) + ' — ' + join(it.filter(i => i.brand === b.brand).map(i => i.name))).join('; ') + '.');
        if (f.shared_tasks.length) common.push('Общие задачи: ' + f.shared_tasks.map(lowT).join(', ') + (f.shared_task_notes[0] ? ' («' + f.shared_task_notes[0].note.replace(/[.!\s]+$/, '') + '»)' : '') + '.'); else common.push('По указанным на сайте задачам они не пересекаются.');
        if (f.same_category && f.same_kind) common.push('Категория и вид совпадают: ' + lowT(it[0].category) + ', ' + lowT(it[0].kind) + '.');
        L.push('**Что общего.** ' + common.join(' '));
        const diff = [];
        if (!f.same_brand) { const bs = uniqBy(it.filter(i => i.brand_summary), i => i.brand); if (bs.length) diff.push('На сайте бренды описаны так: ' + bs.map(i => i.brand + ' — «' + i.brand_summary + '»').join('; ') + '.'); }
        if (!f.same_category) diff.push('Категории: ' + it.map(i => i.name + ' — ' + lowT(i.category)).join('; ') + '.'); if (!f.same_kind) diff.push('Вид: ' + it.map(i => i.name + ' — ' + lowT(i.kind || '—')).join('; ') + '.');
        const homeSet = it.filter(i => i.for_home), cab = it.filter(i => !i.for_home); if (homeSet.length && cab.length) diff.push('Домашний уход: ' + join(homeSet.map(i => i.name)) + '; для кабинета: ' + join(cab.map(i => i.name)) + '.');
        const un = it.filter(i => f.unique_tasks[i.id].length); if (un.length) diff.push('Только у ' + un.map(i => i.name + ': ' + f.unique_tasks[i.id].map(lowT).join(', ')).join('; ') + '.');
        const nw = it.filter(i => i.new); if (nw.length && nw.length < it.length) diff.push('Новинка: ' + join(nw.map(i => i.name)) + '.');
        L.push('**Чем отличаются.** ' + (diff.filter(Boolean).join(' ') || 'По данным сайта заметных различий нет — подробности у менеджера.'));
        const near = it.filter(i => f.unique_tasks[i.id].length).map(i => 'если важна задача «' + lowT(f.unique_tasks[i.id][0]) + '» — ближе ' + i.name).concat(f.shared_tasks.length ? ['по общей задаче «' + lowT(f.shared_tasks[0]) + '» подойдут оба'] : []);
        L.push('**Кому что ближе.** ' + (near.length ? capF(near.join('; ')) + '. Окончательный выбор делает специалист по результатам консультации.' : 'Выбор зависит от задачи и протокола — его определяет специалист.'));
        L.push('**Чего на сайте нет.** ' + capF(f.missing_on_site.join(', ')) + ' — это уточняет менеджер.');
        return L.join('\n\n');
      },
      /* C — «визитки»: короткий профиль каждого и общий вывод */
      cards(f) {
        const it = f.products, L = ['Вот что известно по данным сайта:', '']; it.forEach(i => { L.push('**' + i.name + '** — ' + brandLine(i) + '; ' + lowT(i.category) + ', ' + lowT(i.kind || 'продукт') + '. Задачи: ' + (i.tasks.map(lowT).join(', ') || 'не указаны') + '. На сайте: «' + firstSent(i.description).replace(/[.!\s]+$/, '') + '».'); L.push(''); });
        L.push(it.length > 1 ? '**Итог.** ' + (f.shared_tasks.length ? 'Общее — ' + f.shared_tasks.map(lowT).join(', ') + '; различия — в бренде, категории и дополнительных задачах.' : 'Пересечений по задачам нет: это продукты для разных целей.') + ' Состав и цену уточнит менеджер.' : '**Итог.** Состав, цену и применение уточнит менеджер.');
        return L.join('\n');
      },
      /* E — «вердикт»: сначала короткий вывод, затем по строке на товар и честная оговорка */
      verdict(f) {
        const it = f.products; if (it.length === 1) return CMPT.sections(f);
        const un = it.filter(i => f.unique_tasks[i.id].length).map(i => 'для «' + lowT(f.unique_tasks[i.id][0]) + '» — ' + nm(i));
        const head = f.shared_tasks.length ? 'общая задача — «' + lowT(f.shared_tasks[0]) + '»' + (un.length ? '; а ' + join(un) : '') + '.' : 'продукты решают разные задачи — ' + it.map(i => nm(i) + ': ' + (i.tasks.map(lowT).join(', ') || 'не указано')).join('; ') + '.';
        const L = ['**Коротко.** ' + capF(head), ''];
        it.forEach(i => L.push('- ' + nm(i) + ' — ' + brandLine(i) + '; ' + lowT(i.category) + (i.kind ? ', ' + lowT(i.kind) : '') + (i.new ? '; новинка' : '') + '.'));
        L.push('', '**Чего на сайте нет.** ' + capF(f.missing_on_site.join(', ')) + ' — это уточняет менеджер. Окончательный выбор делает специалист по результатам консультации.');
        return L.join('\n');
      },
      /* D — «коротко + вопрос»: пара предложений и встречный вопрос */
      brief(f) {
        const it = f.products; if (it.length === 1) return nm(it[0]) + ' — ' + brandLine(it[0]) + '; задачи: ' + (it[0].tasks.map(lowT).join(', ') || 'не указаны') + '. Чтобы подсказать точнее: для кабинета или для дома, и какая задача главная?';
        return 'Коротко: ' + join(it.map(nm)) + (f.shared_tasks.length ? ' объединяет задача «' + lowT(f.shared_tasks[0]) + '»' : ' решают разные задачи') + (f.same_brand ? ', бренд один — ' + it[0].brand : ', бренды разные: ' + join(it.map(i => i.brand))) + '. Чтобы подсказать точнее: для кабинета или для дома, и какая задача главная?';
      }
    };
    const CMP_TPL = (D.guide && D.guide.compare && D.guide.compare.template) || 'sections';
    function comparison(list, st, tpl) {
      const ids = list.map(p => p.id), f = K.compareFacts(ids), body = (CMPT[tpl || CMP_TPL] || CMPT.sections)(f);
      st.last = {intent: 'compare', cards: ids, all: ids, offset: ids.length, tasks: f.shared_task_ids, brand: ''};
      const chips = list.length > 1 ? ['Для кабинета или для дома?', 'С чем сочетать?', 'Запросить условия', 'Добавить ещё товар'] : ['С чем сравнить?', 'С чем сочетать?', 'Запросить условия'];
      return R(body, {cards: ids, actions: compact([{l: 'Запросить информацию', act: 'form', type: 'product', ref: ids[0]}]), chips, intent: 'compare', disclaimer: true, steps: ['Сравниваю по данным сайта…', 'Собираю общее и различия…']});
    }

    /* ---------- «навигатор»: команды по сайту (открыть страницу, показать место, провести по шагам, отфильтровать каталог, сравнить выбранное) ----------
       Всё считается по data/stella/guide.json (D.guide): страницы, цели подсветки, экскурсии. Действия выполняет интерфейс (js/guide.js); здесь — только решение, что сделать. */
    const G = D.guide || null, GPAGES = G ? G.pages || [] : [], GTARG = G ? G.targets || {} : {}, GTOURS = G ? G.tours || [] : [];
    const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const synHit = (n, list) => { let best = 0; (list || []).forEach(sy => { const q = norm(sy); if (q && new RegExp('(^|[^a-zа-я0-9])' + reEsc(q)).test(n) && q.length > best) best = q.length; }); return best; };
    const pageOf = n => { let best = null, bl = 0; GPAGES.forEach(p => { const l = synHit(n, (p.syn || []).concat([p.label])); if (l > bl) { bl = l; best = p; } }); return best; };
    const targetOf = (n, pageKey) => {
      let best = null, bl = 0; const scan = (key, bonus) => (GTARG[key] || []).forEach(t => { const l = synHit(n, (t.syn || []).concat([t.label])); if (l && l + bonus > bl) { bl = l + bonus; best = {page: key, t}; } });
      scan(pageKey, 2); scan('*', 1); if (!best) Object.keys(GTARG).forEach(k => { if (k !== '*' && k !== pageKey) scan(k, 0); }); return best;
    };
    const tourOf = n => { let best = null, bl = 0; GTOURS.forEach(t => { const l = synHit(n, (t.syn || []).concat([t.title])); if (l > bl) { bl = l; best = t; } }); return best; };
    const urlOfBrand = id => 'brands/' + id + '.html';
    function navIntent(text, n, tk, st, ctx, ents) {
      if (!G) return null; const page = ctx.page || '', cmpIds = (ctx.cmp || []).filter(id => P[id]), words0 = tk.length;
      const act = (l, a, d, o) => Object.assign({l, act: a, d: d || {}}, o || {});
      const NAV = (txt, actions, o) => R(txt, Object.assign({actions, autorun: actions.length ? [0] : [], intent: 'nav', local: true, steps: ['Понимаю, куда вести…']}, o || {}));
      /* прокрутка */
      if (words0 <= 5 && W('наверх|вверх|в начало страницы|в самый верх|к началу').test(n)) return NAV('Поднимаюсь в начало страницы.', [act('Наверх', 'asst-scroll', {to: 'top'})]);
      if (words0 <= 5 && W('вниз|в конец страницы|в самый низ|к подвалу|в подвал|вниз страницы').test(n) && !W('как|где|что').test(n)) return NAV('Опускаюсь в конец страницы.', [act('Вниз', 'asst-scroll', {to: 'bottom'})]);
      /* сравнение того, что выбрано на сайте */
      if (cmpIds.length && W('сравни|сравнить|расскажи|рассказать|объясни|разбери').test(n) && W('выбранн|то,? что выбрал|избранн|выбрал[аи]? для сравнения|в сравнении|мо[иё] товар|эти товар|эти продукт|сравнение').test(n)) return done_(comparison(cmpIds.map(id => P[id]), st));
      if (W('очисти|очистить|сбрось|сбросить|убери|удали').test(n) && W('сравнени').test(n) && words0 <= 6) return NAV('Очищаю сравнение.', [act('Очистить сравнение', 'asst-cmp-clear')]);
      /* фильтры каталога */
      const filt = W('отфильтруй|отфильтровать|фильтр|оставь только|покажи только|только для|только от|сбрось фильтр|сбросить фильтр|убери фильтр|очисти фильтр|покажи все товары|покажи весь каталог').test(n);
      if (filt) {
        if (W('сброс|убери фильтр|очисти фильтр|покажи все товары|покажи весь каталог|без фильтр').test(n)) return NAV('Сбрасываю фильтры каталога.', [act('Сбросить фильтры', 'asst-filter', {f: 'reset'})]);
        const f = {}; if (ents.tasks.length) f.task = ents.tasks[0]; if (ents.brands.length) f.brand = ents.brands[0].id;
        const cat = (D.cats || []).find(c => words(c.name).map(stem).filter(t => t.length > 3 && !STOP.has(t)).some(t => tk.indexOf(t) >= 0)); if (cat) f.cat = cat.id; else if (W('для дом|домашн').test(n)) f.cat = 'home';
        const keys = Object.keys(f);
        if (keys.length) { const q = keys.map(k => k + '=' + f[k]).join('&'), label = keys.map(k => k === 'task' ? lower(TASK[f[k]]) : k === 'brand' ? K.brandName(f[k]) : lower(CAT[f[k]] || f[k])).join(' · ');
          return NAV('Применяю фильтр в каталоге: **' + label + '**.', [act('Показать в каталоге: ' + label, 'asst-filter', {f: q})], {chips: ['Сравни их', 'Подобрать по задаче', 'Сбросить фильтры']}); }
      }
      /* экскурсия / «покажи, как…» */
      const tour = tourOf(n), howShow = W('покажи как|покажи,? как|объясни как|научи|проведи|экскурс|покажи сайт|что есть на сайте|пошагово|шаг за шагом|покажи шаги|покажи на сайте|как сделать|как можно|подскажи как|помоги').test(n);
      if (tour && howShow && words0 <= 9) return NAV('Хорошо, покажу по шагам: **' + tour.title + '**. Подсвечу нужные места прямо на странице.', [act('Начать: ' + tour.title, 'asst-tour', {tour: tour.id})], {chips: GTOURS.filter(t => t.id !== tour.id).slice(0, 3).map(t => t.title)});
      /* где находится / покажи место на странице */
      const where = W('где (?:находится|найти|найду|тут|здесь|у вас|можно найти|расположен|искать)|как найти|покажи где|покажи мне где|подсвети|покажи кнопку|на что нажать|куда нажать|где кнопка|где поле|где строка').test(n) || (/^где\s/.test(n) && words0 <= 5 && !cityOf(n) && !ents.products.length && !W('ближайш|когда|сколько|дата|во сколько|стоит|цена|купить|заказать|офис|адрес|находится ли').test(n));
      if (where) {
        const tg = targetOf(n, page);
        if (tg) {
          const here = tg.page === page || tg.page === '*', pg = pageById(tg.page);
          if (here) return NAV('Показываю: **' + tg.t.label + '**. ' + tg.t.say, [act('Показать: ' + tg.t.label, 'asst-show', {target: tg.t.id})]);
          if (pg) return NAV('«' + tg.t.label + '» — на странице **' + pg.label + '**. Перейду и покажу.', [act('Перейти и показать', 'asst-go', {href: pg.href, show: tg.t.id})]);
        }
      }
      /* открыть страницу */
      const goVerb = W('открой|откройте|открыть|перейд|зайди|зайти|веди|отведи|на страницу|страницу|верни(?:сь)? на|вернись|перенеси меня|переключи на|давай на|хочу на|мне на').test(n), showVerb = W('покажи|показать|покажите|ведите').test(n);
      const pg = pageOf(n), clean = !ents.tasks.length && !ents.brands.length && !ents.products.length;
      if (pg && ((goVerb && words0 <= 8) || (showVerb && words0 <= 4 && clean)) && !(where && targetOf(n, page))) return NAV('Открываю: **' + pg.label + '**.', [act('Открыть: ' + pg.label, 'asst-go', {href: pg.href})]);
      if (goVerb && words0 <= 8 && ents.products.length === 1 && !ents.brands.length) { const p = ents.products[0]; return NAV('Открываю страницу продукта **' + p.name + '**.', [act('Открыть: ' + p.name, 'asst-go', {href: 'products/' + p.slug + '.html'})]); }
      if (goVerb && words0 <= 8 && ents.brands.length === 1 && !ents.products.length && !ents.tasks.length) { const b = ents.brands[0]; return NAV('Открываю страницу бренда **' + b.name + '**.', [act('Открыть: ' + b.name, 'asst-go', {href: urlOfBrand(b.id)})]); }
      return null;
    }
    const pageById = id => GPAGES.find(p => p.id === id);
    const done_ = r => r;
    function eventsAnswer(n, st, ctx) {
      const per = periodOf(n), city = cityOf(n) || '', online = W('онлайн|вебинар|дистанц').test(n) ? true : W('очно|вживую|офлайн').test(n) ? false : undefined;
      const brands = brandsIn(n), q = {from: per ? (per.from > K.today() ? per.from : K.today()) : undefined, to: per && per.to, city: city || undefined, brand: brands[0] && brands[0].id, online};
      let list = K.listEvents(q);
      const homeCity = !city && st.city ? st.city : ''; let usedCity = '';
      if (homeCity && !W('все|любой|любом').test(n)) { const mine = K.listEvents(Object.assign({}, q, {city: homeCity})); if (mine.length) { list = mine; usedCity = homeCity; } }
      const ask = W('сколько дней|когда|через сколько|ближайш').test(n);
      if (!list.length) {
        const any = K.listEvents({}).slice(0, 3);
        st.last = {intent: 'events', eventIds: any.map(e => e.id)};
        return R('В расписании на сайте ' + (per ? per.label + ' ' : '') + (city ? 'в городе ' + city + ' ' : '') + 'мероприятий не нашёл.' + (any.length ? ' Ближайшие из остальных — ниже.' : ' Расписание может обновиться: следите за новостями или уточните у менеджера.'), {events: any.map(e => e.id), actions: compact([act.callback()]), links: [link('training.html', 'Всё расписание')], chips: ['Показать все семинары', 'Онлайн-вебинары'], intent: 'events', steps: ['Сверяю с расписанием…']});
      }
      const shown = list.slice(0, 3); st.last = Object.assign({}, st.last, {intent: 'events', eventIds: shown.map(e => e.id), cards: [], all: [], offset: 0});
      const first = shown[0]; let head;
      if (ask && !per && list.length) head = 'Ближайшее — **' + first.title + '**: ' + fmtDate(first.date) + ', ' + first.city + ' (' + lower(first.format) + '), ' + inDays(first.days_until) + '.';
      else head = (usedCity ? 'Вы из города ' + usedCity + ' — показываю мероприятия там. ' : '') + (per ? 'Мероприятия ' + per.label : 'Ближайшие мероприятия') + (city ? ' (' + city + ')' : '') + ' — нашёл ' + list.length + ' ' + plural(list.length, 'мероприятие', 'мероприятия', 'мероприятий') + (list.length > shown.length ? ', показываю первые ' + shown.length : '') + ':';
      return R(head, {events: shown.map(e => e.id), text2: 'Базовые семинары бесплатные; время проведения и условия подтверждает менеджер при регистрации.', links: [link('training.html', 'Всё расписание')], chips: ['Как записаться?', 'Сколько стоит участие?', usedCity ? 'Все города' : 'Онлайн-вебинары'], intent: 'events', steps: ['Сверяю с расписанием…']});
    }
    function discountAnswer(amount, st) {
      st.last = Object.assign({}, st.last, {intent: 'discount'}); const d = K.discount(amount);
      if (!amount) return R('Скидки по объёму закупки (ориентировочно): ' + d.tiers.map(t => 'от ' + fmtRub(t.from) + ' — ' + t.pct + '%').join('; ') + '. ' + d.note + ' Назовите сумму закупки — посчитаю.', {actions: [act.partner(st)], links: [link('partners.html', 'Калькулятор скидок')], chips: ['А при 200 тысячах?', 'Как стать партнёром'], intent: 'discount', steps: ['Смотрю пороги скидок…']});
      let t;
      if (!d.pct) t = 'При закупке на ' + fmtRub(d.amount) + ' скидки пока нет: первый порог — от ' + fmtRub(d.tiers[0].from) + ' (' + d.tiers[0].pct + '%). Не хватает ' + fmtRub(d.shortfall) + '.';
      else t = 'При закупке на ' + fmtRub(d.amount) + ' ориентировочная скидка — **' + d.pct + '%** (порог от ' + fmtRub(d.threshold) + '): экономия около ' + fmtRub(d.saving) + ', к оплате около ' + fmtRub(d.total) + '.' + (d.next_from ? ' До следующего порога (' + d.next_pct + '% от ' + fmtRub(d.next_from) + ') не хватает ' + fmtRub(d.shortfall) + '.' : ' Это максимальный из указанных на сайте порогов.');
      return R(t + '\n\n' + d.note, {actions: compact([act.partner(st), act.callback()]), links: [link('partners.html', 'Калькулятор скидок')], chips: ['Как стать партнёром', 'Контакты менеджера'], intent: 'discount', steps: ['Считаю скидку…']});
    }
    function contactsAnswer(n, st) {
      const city = cityOf(n), c = K.contacts(city), L = [], links = [];
      if (c.office && city !== 'Москва') { L.push('**' + c.office.city + '** (' + lower(c.office.role) + '): ' + c.office.addr + '.'); (c.office.phones || []).forEach(p => L.push(p[1] + ': ' + p[0])); (c.office.emails || []).forEach(e => L.push(e)); }
      else { L.push('Главный офис: ' + (c.main.address || '') + (contactsMain.addressNote ? ' (' + contactsMain.addressNote + ')' : '') + '.'); L.push('Телефон: ' + c.main.phone + ' · e-mail: ' + c.main.email); L.push('Часы работы: ' + c.main.hours + '.'); }
      links.push({h: 'tel:' + c.main.phoneRaw, l: 'Позвонить ' + c.main.phone}, {h: 'mailto:' + c.main.email, l: c.main.email}); if (c.main.whatsapp) links.push({h: c.main.whatsapp, l: 'WhatsApp', ext: true}); links.push(link('contacts.html', 'Контакты'));
      if (!city) L.push('Есть представительства: ' + c.offices.map(o => o.city).join(', ') + '.');
      return R(L.join('\n'), {links, actions: compact([act.callback()]), chips: ['Как стать партнёром', 'Ближайшие семинары'], intent: 'contacts', steps: ['Нахожу контакты…']});
    }
    function partnerAnswer(n, st) {
      const pt = (KB && KB.partner) || {steps: [], benefits: []}, L = [];
      const intro = st.role ? {cosmetologist: 'Как специалист, вы можете работать с нами напрямую или через салон.', salon: 'Для салона сотрудничество строится так.', clinic: 'Для клиники сотрудничество строится так.', shop: 'Для магазина или дистрибьютора сотрудничество строится так.'}[st.role] || '' : '';
      if (intro) L.push(intro);
      L.push('Сотрудничество строится так: ' + (pt.steps.length ? pt.steps.map((s, i) => (i + 1) + ') ' + lower(s.t)).join(', ') + '.' : 'оставьте заявку — менеджер свяжется и обсудит условия.'));
      if (pt.benefits.length) L.push('Что получает партнёр: ' + pt.benefits.slice(0, 4).map(b => lower(b.t)).join(', ') + '.');
      if (W('скидк|порог|объем|объём').test(n)) L.push(discountAnswer(0, st).text.split(' Назовите')[0]);
      return R(L.join('\n\n'), {actions: [act.partner(st)], links: [link('partners.html', 'Условия и калькулятор скидок')], chips: ['Какие скидки?', 'Контакты менеджера'], intent: 'partner', steps: ['Смотрю условия сотрудничества…']});
    }
    function moreAnswer(st) {
      const l = st.last || {}; if (!l.all || l.offset >= l.all.length) return R('Это всё, что нашёл по вашему запросу. Можно уточнить задачу или бренд — подберу заново.', {chips: starters({}, st), intent: 'more'});
      const next = l.all.slice(l.offset, l.offset + 4); const from = l.offset + 1; l.offset += next.length; l.cards = next;
      return R((next.length === 1 ? 'Ещё один вариант (' + l.offset + ' из ' + l.all.length + '):' : 'Ещё варианты (' + from + '–' + l.offset + ' из ' + l.all.length + '):'), {cards: next, chips: l.offset < l.all.length ? ['Ещё', 'Сравни первые два'] : ['Почему именно эти?', 'С чем сочетать?'], intent: 'more'});
    }
    function whyAnswer(st) {
      const l = st.last || {};
      if (l.intent === 'task' && l.tasks && l.tasks.length) {
        const t = K.kbTask(l.tasks[0]); const brands = (t.brands || []).map(K.brandName).filter(Boolean);
        return R('Подбор простой и прозрачный. Сначала беру из каталога продукты, у которых в карточке указана задача «' + K.TASK[l.tasks[0]] + '». Порядок такой: сначала бренды, которые сайт называет основными для этой задачи (' + brands.join(', ') + '), затем новинки. Описание задачи — со страницы каталога: «' + (t.note || '') + '» Я не оцениваю эффективность и не даю назначений — это решает специалист.', {chips: ['С чем сочетать?', 'Ещё'], intent: 'why', steps: ['Вспоминаю, как подбирал…']});
      }
      return R('По сайту я отвечаю только по его данным: каталогу, расписанию, материалам для партнёров. Спросите, что именно вас интересует, — объясню, откуда взял ответ.', {chips: starters({}, st), intent: 'why'});
    }
    function comboAnswer(st) {
      const l = st.last || {}, ids = l.tasks && l.tasks.length ? l.tasks : [], L = [];
      const note = ids.map(i => K.kbTask(i).note).join(' ');
      const sun = K.searchProducts({task: 'sun'}).filter(p => (l.cards || []).indexOf(p.id) < 0);
      if (/фотозащит/i.test(note) && sun.length) {
        const first = showList(st, sun.map(p => p.id), {intent: 'combo', tasks: ['sun']});
        return R('Сайт прямо указывает: «' + String(K.kbTask(ids[0]).note || '').replace(/[.!\s]+$/, '') + '». Поэтому к этой задаче логично добавить ежедневную фотозащиту — вот продукты из каталога:', {cards: first, links: [link('catalog.html?task=sun', 'Вся фотозащита')], chips: ['Сравни первые два', 'Как запросить условия?'], intent: 'combo', steps: ['Ищу, что сочетается…']});
      }
      const first = l.cards && l.cards[0] && P[l.cards[0]];
      if (first && first.c !== 'home') { const home = K.searchProducts({task: (first.ts || [])[0], home: true}).filter(p => p.id !== first.id); if (home.length) { const f = showList(st, home.map(p => p.id), {intent: 'combo'}); return R('Сайт описывает связку «кабинет и дом»: домашний уход продлевает результат процедур. По этой задаче для дома в каталоге есть:', {cards: f, chips: ['Подробнее про первый', 'Как запросить условия?'], intent: 'combo'}); } }
      return R('Сочетания зависят от протокола, а его определяет специалист. По данным сайта могу показать продукты по другой задаче — например, фотозащиту: она нужна почти в любом протоколе.', {links: [link('catalog.html?task=sun', 'Фотозащита')], chips: ['Покажи фотозащиту', 'Подобрать средство по задаче'], intent: 'combo'});
    }
    function infoAnswer(text, st) {
      const hits = K.searchInfo(text, 4);
      if (hits.length && hits[0].hit >= Math.min(2, hits[0].of) && hits[0].score > 0.02) {
        const h = hits[0], sent = K.bestSentence(h.text, h._q);
        st.last = Object.assign({}, st.last, {intent: 'info'});
        return R((h.kind === 'faq' ? '' : '**' + h.title + '.** ') + sent, {links: compact([h.url ? link(h.url, h.kind === 'news' ? 'Читать новость' : 'Подробнее на сайте') : null]), actions: [], chips: ['Спасибо', 'Задать другой вопрос'], intent: 'info', sure: false, steps: ['Ищу в материалах сайта…'], meta: {score: h.score, source: h.title}});
      }
      return null;
    }

    /* ---------- мелкие умения без ИИ: арифметика и дата/время (работают всегда и мгновенно) ---------- */
    function calcOf(raw) {
      let t = String(raw).toLowerCase().replace(/ё/g, 'е').replace(/[  ]/g, ' ').replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)\s*[×хx*]\s*(?=[\d(])/g, '$1*').replace(/(\d)\s*[÷:]\s*(?=[\d(])/g, '$1/').replace(/(\d)\s*(?:умножить на|помножить на)\s*(?=[\d(])/g, '$1*').replace(/(\d)\s*(?:разделить на|поделить на)\s*(?=[\d(])/g, '$1/').replace(/(\d)\s*плюс\s*(?=[\d(])/g, '$1+').replace(/(\d)\s*минус\s*(?=[\d(])/g, '$1-');
      const trig = /(?:^|[^а-яa-z])(?:посчитай|подсчитай|вычисли|сколько будет|сколько получится|реши|найди значение|калькулятор)(?:$|[^а-яa-z])|=\s*\??\s*$/.test(t);
      if (t.length > 90 || /\d{3}-\d{2}-\d{2}/.test(t)) return null;
      let m = t.match(/(\d+(?:\.\d+)?)\s*(?:%|процент\S*)\s*от\s*([\d ]+(?:\.\d+)?)/);
      if (m && (trig || ntokOf(t) <= 6)) { const a = +m[1], b = +m[2].replace(/ /g, ''); if (isFinite(a) && isFinite(b)) return {expr: m[1] + '% от ' + fmtNum(b), val: a / 100 * b}; }
      let ex = t.replace(/^[^\d(\-]*/, '').replace(/\s*(?:=|\?)+\s*$/, '').replace(/\s*(?:рубл\S*|руб\.?|₽|р\.?)\s*$/, '').trim();
      if (!/^[\d\s.+\-*/^()]+$/.test(ex) || !/\d\s*[+\-*/^]\s*[\d(]|\)\s*[+\-*/^]/.test(ex)) return null;
      if (!trig && !/^[\d\s.+\-*/^()=?]+$/.test(t.replace(/\s*(?:рубл\S*|руб\.?|₽)\s*/g, ''))) return null;
      const toks = ex.replace(/(\d)\s+(?=\d{3}(?!\d))/g, '$1').match(/\d+(?:\.\d+)?|[+\-*/^()]/g) || [], j = toks.join('');
      if (j.replace(/\s/g, '') !== ex.replace(/(\d)\s+(?=\d{3}(?!\d))/g, '$1').replace(/\s/g, '')) return null;
      let i = 0, steps = 0; const bad = () => { throw new Error('x'); };
      const prim = () => { if (++steps > 200) bad(); const k = toks[i++]; if (k === undefined) bad(); if (k === '(') { const v = add(); if (toks[i++] !== ')') bad(); return v; } if (k === '-') return -un(); if (k === '+') return un(); if (!/^\d/.test(k)) bad(); return +k; };
      const un = () => prim();
      const pow = () => { const b = prim(); if (toks[i] === '^') { i++; const e = pow(); return Math.pow(b, e); } return b; };
      const mul = () => { let v = pow(); while (toks[i] === '*' || toks[i] === '/') { const o = toks[i++], r = pow(); if (o === '/' && r === 0) { const e = new Error('div0'); throw e; } v = o === '*' ? v * r : v / r; } return v; };
      const add = () => { let v = mul(); while (toks[i] === '+' || toks[i] === '-') { const o = toks[i++], r = mul(); v = o === '+' ? v + r : v - r; } return v; };
      try { const v = add(); if (i !== toks.length) return null; return {expr: toks.map(k => /^\d/.test(k) ? fmtNum(+k) : k).join(' ').replace(/\*/g, '×').replace(/\//g, '÷').replace(/\^/g, '^').replace(/\( /g, '(').replace(/ \)/g, ')'), val: v}; }
      catch (e) { return e.message === 'div0' ? {expr: ex, err: 'Делить на ноль нельзя — результат не определён.'} : null; }
    }
    const ntokOf = t => (t.match(/[a-zа-я]+/g) || []).length;
    const fmtNum = v => { if (!isFinite(v)) return '∞'; const r = Math.abs(v) >= 1e15 || (Math.abs(v) > 0 && Math.abs(v) < 1e-6) ? v.toExponential(6) : Number(v.toFixed(8)).toLocaleString('ru-RU', {maximumFractionDigits: 8}); return r; };
    const WEEK = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    function dateAnswer(n) {
      const d = K.now(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0'), full = d.getDate() + ' ' + MON_G[d.getMonth()] + ' ' + d.getFullYear() + ' года', wd = WEEK[d.getDay()];
      const wantTime = W('час|времени|время').test(n) && !W('число|дата|день|год').test(n);
      if (wantTime) return 'Сейчас **' + hh + ':' + mm + '** (по часам вашего устройства).';
      if (W('год').test(n) && !W('число|дата|день').test(n)) return 'Сейчас **' + d.getFullYear() + '** год.';
      if (W('день недели|какой день|что за день').test(n) && !W('число|дата').test(n)) return 'Сегодня **' + wd + '**, ' + full + '.';
      return 'Сегодня **' + full + '**, ' + wd + '. Время — ' + hh + ':' + mm + ' (по часам вашего устройства).';
    }

    function unknown(text, st, tk) {
      const sug = [];
      const cand = []; (D.products || []).forEach(p => cand.push([p.name, 'Расскажите про ' + p.name])); (D.brands || []).forEach(b => cand.push([b.name, 'Расскажите про ' + b.name])); (D.tasks || []).forEach(t => cand.push([t.label, t.label]));
      const ws = words(text).filter(w => w.length > 3); const scored = cand.map(([nm, q]) => { const nw = words(nm); let best = 9, len = 0; ws.forEach(w => nw.forEach(x => { const sw = stem(w), d = lev(sw, stem(x), 3); if (d < best) { best = d; len = sw.length; } })); return {nm, q, d: best, len}; }).filter(x => x.d <= 1 || (x.d <= 2 && x.len >= 8)).sort((a, b) => a.d - b.d).slice(0, 3);
      scored.forEach(x => sug.push(x.q));
      const hits = K.searchInfo(text, 3).filter(h => (h.kind === 'faq' || h.kind === 'task' || h.kind === 'news') && h.hit >= Math.min(2, h.of) && h.score > 0.02).slice(0, 2); hits.forEach(h => sug.push(h.title.length < 60 ? h.title : h.title.slice(0, 57) + '…'));
      const text1 = ladder(text, clean(text), st, sug) || (sug.length ? 'Не уверена, что правильно поняла вопрос. Возможно, вы имели в виду что-то из этого?' : 'На такой вопрос я сейчас не отвечу: работаю без ИИ и знаю только данные сайта — каталог, бренды, обучение, партнёрство и контакты. С ними помогу сразу, а остальное можно передать менеджеру.');
      return R(text1, {actions: compact([act.ask(text), act.callback()]), chips: (sug.length ? sug : starters({}, st)).slice(0, 4), intent: 'unknown', sure: false, steps: ['Думаю…']});
    }


    /* ---------- библиотека живых реплик (data/stella/*.json → KB.stella) ----------
       Для вопросов, на которые у сайта нет ответа: о самой Стелле, светская беседа, «странные» просьбы, чего сайт не знает, безопасность, мини-справочник терминов, игры и расчёты (монетка, кубик, дни до праздника).
       Тема = правила (q) + варианты ответа (a) + необязательно: второе сообщение-«мостик» (b), кнопки (chips), действия (act), ссылки (links), расчётная функция (fn), стадия (stage), local.
       Правило — слова через пробел, ВСЕ должны найтись; слово «а|б|в» — любое из вариантов, совпадает с началом слова («сколько|скока тебе лет»); «=да» — слово целиком; «!слово» — не должно быть;
       «как_дела» — фраза; «*…» в начале — ключевое правило (слово может стоять где угодно во фразе). Обычное правило должно «покрывать» ≥ 55 % значимых слов запроса — иначе это длинный вопрос о другом, и тема не берётся. */
    const SL = KB && KB.stella && Array.isArray(KB.stella.topics) ? KB.stella : null, SLT = [], SLID = {};
    const YOU = 'ты|тебя|тебе|тобой|твой|твоя|твое|твои|твоим|твоих|твоей|вы|вас|вам|вами|ваш|ваша|ваше|ваши|вашей|вашу', ME = 'я|меня|мне|мной|мой|моя|мое|мои|моим|моих|мы|нас|нам|нами|наш|наша|наше|наши';
    const ULTRA = new Set(('сегодня сейчас вообще там тут здесь стелла стеллы стелле стеллу стеллой стеллочка и а но же бы ли или вот ну то так просто вообще пожалуйста плиз слушай слушайте скажи скажите подскажи подскажите кстати блин значит еще уже ведь типа ой в во на с со к ко у о об от по за из для про при над под без до что чем как какой какая какое какие каких какую какого такой такое такая такие это этот эта эти есть бывает можно можешь можете очень совсем тоже также ' + YOU.replace(/\|/g, ' ') + ' ' + ME.replace(/\|/g, ' ')).split(' '));
    const DEFLEAD = 'что_такое|что_за|что_значит|что_означает|для_чего|зачем|объясни|поясни|определение|что_это|кто_такой|кто_такая|кто_это|что_известно_про|что_знаешь_про|знаешь_про', TELLLEAD = 'расскажи_про|расскажи_о|расскажите_про|расскажите_о|расскажи_мне_про|расскажи_мне_о';
    const ruleOf = src => {
      let s0 = String(src).trim(), weak = s0[0] === '~'; if (weak) s0 = s0.slice(1); let s = s0.replace(/(^|\s)@def(?=\s|$)/g, '$1' + DEFLEAD).replace(/(^|\s)@tell(?=\s|$)/g, '$1' + TELLLEAD), kw = false; if (s[0] === '*') { kw = true; s = s.slice(1).trim(); } const pos = [], neg = [];
      s.split(/\s+/).forEach(t => { if (!t) return; const ng = t[0] === '!'; if (ng) t = t.slice(1);
        if (t === 'ты' || t === 'вы' || t === 'ты|вы' || t === 'вы|ты' || t === '@you') t = YOU; else if (t === 'я' || t === 'мы' || t === 'я|мы' || t === 'мы|я' || t === '@me') t = ME;
        const alts = t.split('|').filter(Boolean).map(a => { a = a.replace(/_/g, ' '); const ex = a[0] === '='; if (ex) a = a.slice(1); a = norm(a); return {a, s: a.length >= 6 ? a.split(' ').map(w => { if (w.length < 6) return w; const x = stem(w); return x.length >= 5 ? x : w; }).join(' ') : a, ex: ex || (a.length < 5 && a.indexOf(' ') < 0), k: a.split(' ').length}; });
        if (alts.length) (ng ? neg : pos).push(alts); });
      return {pos, neg, kw, weak, tell: /(^|\s)@tell(\s|$)/.test(String(src))};
    };
    if (SL) SL.topics.forEach(t => { t.rules = (t.q || []).map(ruleOf); t.stage = t.stage || 'mid'; SLT.push(t); SLID[t.id] = t; });
    function ruleHit(r, ws, wst) {
      let score = 0; const hit = new Set();
      const at = (al, i) => al.k > 1 ? (ws.slice(i, i + al.k).join(' ').startsWith(al.a) || wst.slice(i, i + al.k).join(' ').startsWith(al.s)) : al.ex ? ws[i] === al.a : (ws[i].startsWith(al.a) || wst[i].startsWith(al.s) || (al.a.length >= 9 && ws[i].length >= al.a.length - 1 && lev(ws[i].slice(0, al.a.length), al.a, 1) <= 1));
      for (const alts of r.pos) {
        let ok = false;
        for (const al of alts) for (let i = 0; i + al.k <= ws.length; i++) if (at(al, i)) { for (let j = 0; j < al.k; j++) hit.add(i + j); if (!ok) score += 3 + (al.k > 1 ? al.k : al.a.length >= 5 ? 1 : 0); ok = true; }
        if (!ok) return null;
      }
      for (const alts of r.neg) for (const al of alts) for (let i = 0; i + al.k <= ws.length; i++) if (at(al, i)) return null;
      return {score, hit};
    }
    /* подходящие темы стадии, лучшая первой */
    function slFind(stage, variants, raw, ent) {
      if (!SL) return []; const out = {};
      if (raw) SLT.forEach(t => { if (t.stage === stage && t.rx && t.rx.some(r => new RegExp(r, 'i').test(raw))) out[t.id] = {t, sc: 99}; });
      variants.forEach(ws => {
        if (!ws.length) return; const total = ws.filter(w => !ULTRA.has(w)).length, wst = ws.map(stem);
        SLT.forEach(t => { if (stage !== 'weak' && t.stage !== stage) return;
          t.rules.forEach(r => { if ((stage === 'weak') !== !!r.weak) return; if (r.tell && ent && (ent.products.length || ent.brands.length)) return; const m = ruleHit(r, ws, wst); if (!m) return; const cov = total ? [...m.hit].filter(i => !ULTRA.has(ws[i])).length / total : (m.hit.size === ws.length ? 1 : 0);
            if (!(r.kw ? ws.length <= 16 : cov >= 0.55 || (cov >= 0.5 && r.pos.length >= 2) || (cov >= 0.3 && r.pos.length >= 3))) return;
            const sc = m.score * (r.kw ? 0.6 : 1) + cov * 4 + (t.prio || 0); if (!out[t.id] || sc > out[t.id].sc) out[t.id] = {t, sc}; }); });
      });
      return Object.keys(out).map(k => out[k]).sort((a, b) => b.sc - a.sc).map(x => x.t);
    }
    const squash = s => s.replace(/(.)\1{2,}/g, '$1');
    const hashOf = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
    const safeEcho = s => String(s || '').replace(/[*_`<>\[\]{}\\|~#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const rand = () => (opts.rand || Math.random)();
    const NUMW = {один: 1, одну: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, пару: 2, полторы: 1};
    const HOLID = [['нов\\S* год|новог|новогодн', 0, 1, 'Нового года'], ['рождеств', 0, 7, 'Рождества (7 января)'], ['14 февраля|валентин', 1, 14, 'Дня святого Валентина'], ['23 февраля|защитник', 1, 23, '23 февраля'], ['8 марта|женск\\S* день|женск\\S* дня', 2, 8, '8 Марта'], ['1 мая|первомай', 4, 1, '1 Мая'], ['9 мая|дня победы|день победы', 4, 9, 'Дня Победы'], ['12 июня|дня россии|день россии', 5, 12, 'Дня России'], ['1 сентября|дня знаний|день знаний', 8, 1, '1 сентября'], ['4 ноября|народного единства', 10, 4, 'Дня народного единства'], ['лета|лето', 5, 1, 'лета (по календарю — с 1 июня)'], ['осени|осень', 8, 1, 'осени (по календарю — с 1 сентября)'], ['зимы|зима', 11, 1, 'зимы (по календарю — с 1 декабря)'], ['весны|весна', 2, 1, 'весны (по календарю — с 1 марта)']];
    const WDAY = [['воскресень', 0, 'воскресенья'], ['понедельник', 1, 'понедельника'], ['вторник', 2, 'вторника'], ['сред[ыу]', 3, 'среды'], ['четверг', 4, 'четверга'], ['пятниц', 5, 'пятницы'], ['суббот', 6, 'субботы'], ['выходн', 6, 'выходных (ближайшая суббота)']];
    const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dword = d => d + ' ' + plural(d, 'день', 'дня', 'дней');
    const RU2EN = {q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю', '`': 'ё', '&': '?', '?': ',', '/': '.', '$': ';', '^': ':', '@': '"', '#': '№'};
    const EN_COMMON = new Set('hello hi hey thanks thank you bye goodbye ok okay yes no help please price prices catalog catalogue contact contacts how are what who where when why is the and a to of for i me my your do does can could will would want need about this that it with from have has hi there good morning evening night nice name speak english russian manager call phone email training seminar seminars webinar webinars partner partners partnership schedule education course courses brands brand products product'.split(' '));
    const ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    const isMash = w => { if (w.length < 5) return false; for (let i = 0; i + 5 <= w.length; i++) { const g = w.slice(i, i + 5), r = g.split('').reverse().join(''); if (ROWS.some(row => row.indexOf(g) >= 0 || row.indexOf(r) >= 0)) return true; } return false; };
    function gibberish(n) { const ws = words(n).filter(w => w.length >= 4); if (!ws.length) return false; const bad = ws.filter(w => isMash(w) || /[бвгджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxz]{5,}/.test(w) || !/[аеёиоуыэюяaeiouy]/.test(w)); return bad.length >= Math.ceil(ws.length / 2); }
    function layoutFix(raw) {
      if (!SL || /[а-яё]/i.test(raw) || !/[a-z]/i.test(raw)) return '';
      const ws = words(raw); if (!ws.length || ws.filter(w => EN_COMMON.has(w)).length / ws.length >= 0.4) return '';
      const conv = raw.replace(/[A-Za-z\[\];',.`&?\/$^@#]/g, c => { const lo = c.toLowerCase(), r = RU2EN[lo]; if (!r) return c; return c !== lo ? r.toUpperCase() : r; }).trim();
      const cw = words(conv).filter(w => w.length >= 3); if (!cw.length) return '';
      const known = w => VOC.has(w) || KNOWN.has(w); if (cw.filter(known).length / cw.length < 0.5) return '';
      return conv;
    }
    const KNOWN = new Set(); if (SL) { SLT.forEach(t => t.rules.forEach(r => r.pos.concat(r.neg).forEach(alts => alts.forEach(al => { if (al.k === 1 && al.a.length >= 4) KNOWN.add(al.a); })))); (SL.words || []).forEach(w => KNOWN.add(w)); }
    const startsKnown = w => { if (VOC.has(w) || KNOWN.has(w)) return true; for (const k of KNOWN) if (k.length >= 4 && w.startsWith(k)) return true; return false; };

    const FN = {
      pickval(t, st, x) { const v = t.vals[Math.floor(rand() * t.vals.length)]; return {vars: {v}}; },
      randnum(t, st, x) {
        let a = 1, b = 10, m = /от\s*(-?\d+)\s*до\s*(-?\d+)/.exec(x.n) || /(-?\d+)\s*-\s*(-?\d+)/.exec(x.n); if (m) { a = +m[1]; b = +m[2]; } else if ((m = /до\s*(\d+)/.exec(x.n))) b = +m[1]; else if ((m = /(\d+)\s*(?:знач|вариант|числ)/.exec(x.n))) b = +m[1];
        if (a > b) { const c = a; a = b; b = c; } if (b - a > 1e9) b = a + 1e9; return {vars: {v: a + Math.floor(rand() * (b - a + 1)), a, b}};
      },
      either(t, st, x) {
        if (x.p.products.length || x.p.brands.length || x.p.tasks.length) return null;
        const m = /([^:?!.,;]{1,60}?)\s+или\s+([^?!.,;]{1,40})/i.exec(x.raw.replace(/^[^:]*:/, '')); if (!m) return null;
        const FILL = /^(?:выбери|выбирай|реши|решай|что|лучше|какой|какая|какое|какие|как|мне|нам|ты|давай|скажи|посоветуй|выбрать|выбор|вот|а|ну|тогда|кем|быть|стоит|надо|нужно|лучше)$/i;
        const lw = m[1].trim().split(/\s+/).filter(w => !FILL.test(w)).slice(-2).join(' '), rw = m[2].trim().split(/\s+/).slice(0, 2).join(' '); if (!lw || !rw) return null;
        return {vars: {v: safeEcho(rand() < 0.5 ? lw : rw)}};
      },
      countdown(t, st, x) {
        const now = midnight(K.now()); let tgt = null, label = '';
        const h = HOLID.find(c => new RegExp('(^|[^а-я0-9])(?:' + c[0] + ')').test(x.n));
        if (h) { let d = new Date(now.getFullYear(), h[1], h[2]); if (d < now) d = new Date(now.getFullYear() + 1, h[1], h[2]); tgt = d; label = h[3]; }
        else { const w = WDAY.find(c => new RegExp('(^|[^а-я0-9])(?:' + c[0] + ')').test(x.n)); if (w) { const k = (w[1] - now.getDay() + 7) % 7; tgt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k); label = w[2]; } }
        if (!tgt) return null; const days = Math.round((tgt - now) / 864e5);
        return days === 0 ? {pool: t.a0, vars: {what: label}} : {vars: {what: label, days, dword: dword(days)}};
      },
      dayplus(t, st, x) {
        const m = /через\s+(\d+|[а-я]+)\s*(дн\S*|нед\S*|мес\S*)?/.exec(x.n); if (!m) return null; let k = /^\d+$/.test(m[1]) ? +m[1] : NUMW[m[1]]; let u = m[2] || '';
        if (!u && /^(?:неделю|месяц|день)$/.test(m[1])) { u = m[1]; k = 1; } if (!k && /^(?:неделю|недели)$/.test(m[1])) k = 1; if (!k || k > 3650) return null; if (!u) u = 'дн';
        const d = new Date(K.now()); const isW = /^нед/.test(u), isM = /^мес/.test(u); if (isM) d.setMonth(d.getMonth() + k); else d.setDate(d.getDate() + k * (isW ? 7 : 1));
        return {vars: {date: d.getDate() + ' ' + MON_G[d.getMonth()] + ' ' + d.getFullYear() + ' года', weekday: WEEK[d.getDay()], n: k + ' ' + (isM ? plural(k, 'месяц', 'месяца', 'месяцев') : isW ? plural(k, 'неделю', 'недели', 'недель') : plural(k, 'день', 'дня', 'дней'))}};
      },
      nameSet(t, st, x) {
        const m = /(?:меня зовут|мо[её] имя|зови меня|называй меня|можешь звать меня|можно звать меня|меня все зовут)\s+([A-Za-zА-Яа-яЁё-]{2,20})/i.exec(x.raw); if (!m) return null;
        const nm = cap(m[1].toLowerCase()); if (/^(?:как|так|вот|просто|тебе|ты|вы|не|да|нет|что|кто|его|её|ее)$/i.test(nm)) return null; st.name = nm; return {vars: {nm}};
      },
      nameGet(t, st) { return st.name ? {vars: {nm: st.name}} : {pool: t.a0}; },
      repeat(t, st) { return st.lastText ? {vars: {t: st.lastText}, keepLast: true} : {pool: t.a0}; },
      clarify(t, st) { if (!st.lastText) return {pool: t.a0}; const s = st.lastText.replace(/\s+/g, ' '); const m = /^[\s\S]{40,230}?[.!?](?=\s|$)/.exec(s); return {vars: {t: m ? m[0] : s.slice(0, 200)}, keepLast: true}; },
      riddle(t, st) { const rs = SL.riddles || []; if (!rs.length) return null; const i = (st.riddleN || 0) % rs.length; st.riddleN = (st.riddleN || 0) + 1; st.riddle = {i, tries: 0}; return {vars: {q: rs[i].q}}; },
      fact(t, st) { const fs = SL.facts || []; if (!fs.length) return null; const i = ((st.factN || 0) + hashOf(String(st.turns || 0)) % 3) % fs.length; st.factN = (st.factN || 0) + 1; return {vars: {v: fs[i]}}; },
      social(t) { return contactsMain.whatsapp ? {} : {pool: t.a0}; },
      joke(t, st) { const js = SL.jokes || []; if (!js.length) return null; const i = (st.jokeN || 0) % js.length; st.jokeN = (st.jokeN || 0) + 1; return {vars: {v: js[i]}}; }
    };
    const FNMAP = {pickval: FN.pickval, randnum: FN.randnum, either: FN.either, countdown: FN.countdown, dayplus: FN.dayplus, nameSet: FN.nameSet, nameGet: FN.nameGet, repeat: FN.repeat, clarify: FN.clarify, riddle: FN.riddle, fact: FN.fact, joke: FN.joke, social: FN.social};

    function slFill(s, st, vars) {
      const d = K.now(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
      const m = Object.assign({hello: hello(), phone: contactsMain.phone || '', hours: contactsMain.hours || '', email: contactsMain.email || '', company: (KB && KB.company && KB.company.name) || 'Астрея', time: hh + ':' + mm, date: d.getDate() + ' ' + MON_G[d.getMonth()], weekday: WEEK[d.getDay()], nm: (st && st.name) || '', ',nm': (st && st.name) ? ', ' + st.name : '', city: (st && st.city) || '', adv: (((KB && KB.company && KB.company.advantages) || []).slice(0, 4).map(a => lower(a.t)).join(', ')) || 'о них на странице «Компания»'}, vars || {});
      return String(s).replace(/\{([^{}]+)\}/g, (a, k) => m[k] != null ? String(m[k]) : '');
    }
    const ACT = {callback: () => act.callback(), partner: st => act.partner(st), request: () => act.form('product', 'Запросить информацию', '')};
    /* ответ по теме: вариант по кругу (повторный вопрос — другая формулировка), второе сообщение-«мостик» к делу, кнопки */
    function slAnswer(t, st, ctx, x) {
      let o = {}; const fnName = t.fn, f = fnName && FNMAP[fnName]; if (f) { o = f(t, st, x); if (!o) return null; }
      const pool = (o.pool && o.pool.length ? o.pool : t.a) || []; if (!pool.length) return null;
      st.said = st.said || {}; const c = st.said[t.id] || 0; st.said[t.id] = c + 1;
      let text = slFill(pool[(hashOf(t.id) + c) % pool.length], st, o.vars);
      if (c >= pool.length && SL.again && SL.again.length && !t.fn) text = SL.again[c % SL.again.length] + ' ' + text;
      if (t.reset) { st.last = {}; st.pending = null; st.riddle = null; }
      let text2 = ''; const bp = t.b === false ? null : (t.b && t.b.length ? t.b : (SL.bridges && SL.bridges[t.g]) || null);
      if (bp && bp.length && (t.bridge === 'always' || (c + hashOf(t.id)) % 2 === 0)) text2 = slFill(bp[(hashOf(t.id) + c) % bp.length], st, o.vars);
      const acts = (t.act || []).map(k => ACT[k] && ACT[k](st)).filter(Boolean); if (t.act && t.act.indexOf('ask') >= 0) acts.push(act.ask(x.raw));
      const links = (t.links || []).map(l => link(l[0], l[1]));
      const chips = (t.chips && t.chips.length ? t.chips : (SL.chips && SL.chips[t.g]) || []).slice(0, 4);
      return R(text, {text2, actions: acts, links, chips, intent: 'talk', topic: t.id, local: !!t.local, keepLast: !!o.keepLast, steps: t.steps || []});
    }
    /* ответ из темы нужной стадии: пробует найденные темы по порядку (расчётная функция может «отказаться») */
    function slReply(stage, x, st, ctx) {
      const list = slFind(stage, x.vs, x.raw, x.p); for (const t of list) { const r = slAnswer(t, st, ctx, x); if (r) return r; } return null;
    }

    /* ---------- «лестница» запасных ответов: непонятное не получает один и тот же отказ ---------- */
    const QW = /^(?:а\s+)?(?:почему|зачем|отчего|как|что|кто|где|куда|откуда|когда|сколько|какой|какая|какие|какое|чей|чем|можно ли|правда ли|а если|неужели|разве|объясни|расскажи|подскажи|скажи|покажи|найди|дай|посоветуй|порекомендуй)(?![а-я])/, IMP = /^(?:а\s+)?(?:напиши|составь|придумай|переведи|нарисуй|реши|сделай|помоги|сочини|сгенерируй|подготовь|распиши|создай|исправь|проверь|запомни|включи|открой|отправь|позвони|спой)(?![а-я])/;
    function ladder(raw, n, st, sug) {
      const L = SL && SL.ladder; if (!L) return null; const ws = words(n);
      st.missN = (st.missN || 0) + 1; st.said = st.said || {};
      let kind = sug.length ? 'suggest' : gibberish(n) ? 'gibberish' : ws.length === 1 ? 'oneword' : (/\?\s*$/.test(raw) || QW.test(n)) ? 'question' : IMP.test(n) ? 'task' : 'statement';
      if (!sug.length && st.missN >= 3 && L.escalate && kind !== 'gibberish') kind = 'escalate';
      const pool = L[kind] || L.statement; if (!pool || !pool.length) return null; const key = 'ladder:' + kind, c = st.said[key] || 0; st.said[key] = c + 1;
      return slFill(pool[(hashOf(key) + c) % pool.length], st, {echo: safeEcho(raw)});
    }
    function ladderOnly(kind, st, raw) { const L = SL && SL.ladder, pool = L && L[kind]; if (!pool || !pool.length) return null; st.said = st.said || {}; const key = 'ladder:' + kind, c = st.said[key] || 0; st.said[key] = c + 1; return slFill(pool[(hashOf(key) + c) % pool.length], st, {echo: safeEcho(raw)}); }
    function riddleCheck(st, X, n) {
      const rd = SL && SL.riddle, rs = SL && SL.riddles && SL.riddles[st.riddle.i]; if (!rd || !rs) { st.riddle = null; return null; }
      const ws = X.vs[0], solved = ws.some(w => rs.a.some(a => w.startsWith(a))), say = (arr, vars) => slFill(arr[(st.turns || 0) % arr.length], st, Object.assign({a: rs.reveal}, vars || {})), R2 = (arr, topic, chips, vars) => R(say(arr, vars), {chips, intent: 'talk', topic, local: true});
      if (solved) { st.riddle = null; return R2(rd.ok, 'riddle_ok', ['Ещё загадку', 'Расскажи факт', 'Вернуться к делу']); }
      if (W('загадк|ещ[её]($|\\s)|другую|следующую|новую').test(n)) { st.riddle = null; return null; }            // «ещё загадку» — не отгадка, а просьба
      if (W('подсказк|подскажи|намёк|намек').test(n)) { st.riddle.tries++; return R2(rd.hint, 'riddle_hint', ['Сдаюсь'], {h: rs.hint}); }
      if (W('сдаюсь|сдалась|не знаю|ответ|отгадк|понятия не имею|без понятия').test(n)) { st.riddle = null; return R2(rd.giveup, 'riddle_giveup', ['Ещё загадку', 'Расскажи факт', 'Вернуться к делу']); }
      if (ws.length <= 3 && st.riddle.tries < 3) { st.riddle.tries++; return R2(rd.no, 'riddle_no', ['Подсказку', 'Сдаюсь']); }
      if (st.riddle.tries >= 3 && ws.length <= 3) { st.riddle = null; return R2(rd.giveup, 'riddle_giveup', ['Ещё загадку', 'Вернуться к делу']); }
      st.riddle = null; return null;
    }
    function symbolsAnswer(raw, st) {
      const S2 = SL && SL.symbols; if (!S2) return null; const row = S2.find(r => r.re && new RegExp(r.re, 'u').test(raw)) || S2.find(r => r.dflt); if (!row) return null;
      const c = (st.said && st.said['sym:' + row.id]) || 0; st.said = st.said || {}; st.said['sym:' + row.id] = c + 1;
      return R(slFill(row.a[(hashOf(row.id) + c) % row.a.length], st), {chips: starters({}, st).slice(0, 3), intent: 'talk', topic: 'symbols', local: true});
    }

    /* ---------- главный разбор ---------- */
    function reply(raw, st, ctx) {
      ctx = ctx || {}; st = st || newState(); st.turns = (st.turns || 0) + 1; st.last = st.last || {};
      let text = String(raw == null ? '' : raw).trim(); if (ctx.brand && B[ctx.brand]) text = text.replace(/(?:э(?:тот|того|тому|тим|том)|данн\S+|текущ\S+)\s+бренд\S*/gi, B[ctx.brand].name);          // «у этого бренда» на странице бренда
      if (!text) return fin(R('Напишите вопрос — отвечу по каталогу, обучению и условиям сотрудничества.', {chips: starters(ctx, st), intent: 'empty'}), st);
      const fixed = correct(text), n = clean(fixed.text), tk = words(n).map(stem), ntok = tk.length;
      const brandsInText = brandsIn(n), tasksInText = taskOf(n), productsInText = productsIn(n, tk), city = cityOf(n), role = roleOf(n), amount = amountOf(text);
      const refd = W('эт(?:от|а|о|ом|ого|ому|им|у)' + END + '|(?:он|она|оно)' + END + '|его|ее|её|данн|текущ').test(n) && !!(ctx.product || (st.last && st.last.product));
      if (city && (W('из\\s|я в\\s|мы в\\s|находимся|живу|работаю|у нас в|в городе|мой город').test(n) || ntok <= 2)) st.city = city;
      if (role) st.role = role;
      const done = res => fin(res, st);
      const X = {raw: text, n: squash(clean(text)), vs: [], p: {products: productsInText, brands: brandsInText, tasks: tasksInText}};
      if (SL) { const a1 = words(squash(n)), a2 = words(squash(clean(text))); X.vs = a1.join(' ') === a2.join(' ') ? [a1] : [a1, a2]; }

      /* ---- раскладка, язык, служебное, безопасность, игры и расчёты (библиотека реплик, стадия «early») ---- */
      if (SL) {
        if (!ctx.noLayout) { const lf = layoutFix(text); if (lf) { const r2 = reply(lf, st, Object.assign({}, ctx, {noLayout: true})); st.turns--; r2.text = 'Похоже, раскладка клавиатуры была не та — читаю как «' + safeEcho(lf) + '».\n\n' + r2.text; return r2; } }
        const w0 = words(text);
        if (w0.length && !/[а-яё]/i.test(text) && w0.filter(w => EN_COMMON.has(w)).length / w0.length >= 0.5 && !brandsInText.length && !productsInText.length) { const re = slReply('en', X, st, ctx); return done(re || R(ladderOnly('english', st, text) || 'I understand Russian best — please write in Russian.', {actions: compact([act.ask(text), act.callback()]), intent: 'unknown', sure: false, steps: ['Думаю…']})); }
        if (/[іїєґ]/i.test(text) && !/[ыэъё]/i.test(text)) return done(R(ladderOnly('ukrainian', st, text) || 'Я краще розумію російську.', {actions: compact([act.ask(text)]), intent: 'unknown', sure: false}));
        if (/[\u0590-\u06FF\u0900-\u0DFF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(text)) return done(R(ladderOnly('foreign', st, text) || 'Я лучше всего понимаю русский.', {actions: compact([act.ask(text)]), intent: 'unknown', sure: false}));
        if (st.riddle) { const rr = riddleCheck(st, X, n); if (rr) return done(rr); }
        if (!X.vs.length || !X.vs[0].length) { const sy = symbolsAnswer(text, st); if (sy) return done(sy); }
        if (st.lastTopic && SLID[st.lastTopic] && SLID[st.lastTopic].repeat && ntok <= 4 && W('ещ[её]($|\\s)|давай ещ[её]|следующ|другую|другой|ещ[её] одн|продолжай').test(n)) { const rp = slAnswer(SLID[st.lastTopic], st, ctx, X); if (rp) return done(rp); }
        const re = slReply('early', X, st, ctx); if (re) return done(re);
      }

      /* ---- «Привет, как дела?» / «Здравствуйте, подскажите про пилинги» — приветствие + вопрос: отвечаем на вопрос, приветствие учитываем ---- */
      if (SL && !ctx.noLead && ntok >= 4) { const ld = /^(?:ну\s+|а\s+)?(?:привет(?:ствую)?|здравствуй(?:те)?|добрый\s+(?:день|вечер)|доброе\s+утро|хай|hello|hi|салют)[\s,!.:;—-]+(?:стелла[\s,!.:;—-]+)?(.{6,})$/i.exec(text); if (ld) { const snap = JSON.stringify(st), r2 = reply(ld[1], st, Object.assign({}, ctx, {noLead: true})); if (r2 && r2.intent !== 'unknown') { st.turns--; r2.text = hello() + '! ' + r2.text; return r2; } Object.keys(st).forEach(k => { delete st[k]; }); Object.assign(st, JSON.parse(snap)); } }

      /* ---- светские реплики ---- */
      const greetRe = new RegExp('^(?:ну |а )?(?:привет|здравствуй|добрый день|доброе утро|добрый вечер|доброй ночи|(?:хай|hello|hi|салют)' + END + ')', 'i');
      if (greetRe.test(n) && ntok <= 4) { st.last = {}; return done(R(hello() + '! Я Стелла, мини-консультант «Астреи». Подскажу по каталогу и брендам, обучению, условиям сотрудничества и контактам. ' + pick(st, ['Что вас интересует?', 'С чего начнём?', 'Чем помочь?']), {chips: starters(ctx, st), intent: 'greet'})); }
      if ((W('спасиб|благодар|выручил').test(n) && ntok <= 6 && !W('нет|не надо|не нужно').test(n)) || (W('супер|отлично|класс($|\\s)|здорово|молодец|круто').test(n) && ntok <= 1)) return done(R(pick(st, ['Пожалуйста! Если появятся вопросы — пишите.', 'Рада помочь! Обращайтесь, если понадобится ещё что-то.', 'Всегда пожалуйста. Что ещё подсказать?']), {chips: ['Ближайшие семинары', 'Контакты менеджера'], intent: 'thanks'}));
      if ((W('до свидани|всего доброго|удачи|до встречи|bye').test(n) && ntok <= 5) || (/^пока(?![а-я])/.test(n) && ntok <= 2)) return done(R('Всего доброго! Если понадоблюсь — Стелла всегда на связи.', {intent: 'bye'}));
      if (W('тупой|глупый|бесполезн|ерунда|не понимаешь|не то|плохо отвечаешь|ничего не понимаешь|дурак|идиот').test(n)) return done(R('Сожалею, что не получилось помочь. Давайте передадим вопрос человеку — менеджер ответит в рабочее время (' + contactsMain.hours + ').', {actions: compact([act.callback(), act.ask(st.last.q || text)]), links: [link('contacts.html', 'Контакты')], chips: ['Подобрать средство по задаче', 'Ближайшие семинары'], intent: 'frustrated'}));
      if (W('кто ты|что ты умеешь|что умеешь|ты бот|ты человек|ты робот|ты живой|ты ии|нейросет|чем ты можешь|чем можешь помочь|что можно спросить|как тебя зовут|ты настоящ').test(n))
        return done(R('Меня зовут Стелла — я мини-консультант сайта «Астреи»: программа, а не сотрудник. Умею: подобрать продукты по задаче и объяснить выбор, рассказать о товарах и брендах, сравнить товары, показать расписание обучения и записать, посчитать скидку по сумме закупки, дать контакты. Помню, о чём мы говорили: можно спрашивать «а у Dermatime?», «ещё», «почему именно эти?». Цены, наличие и персональные рекомендации — к менеджеру.' + (st.ai ? ' А ещё могу поговорить на любую тему и ответить на общие вопросы.' : ''), {chips: starters(ctx, st), intent: 'who'}));

      const cx = calcOf(text); if (cx) { if (cx.err) return done(R(cx.err, {chips: starters(ctx, st), intent: 'calc'})); return done(R('**' + cx.expr + ' = ' + fmtNum(cx.val) + '**', {chips: starters(ctx, st), intent: 'calc'})); }
      if (ntok <= 6 && W('какое сегодня число|какое число|какая сегодня дата|какая дата|сегодня какое|какой сегодня день|какой день недели|который час|сколько времени|сколько сейчас времени|какой сейчас год|какой год|текущая дата|текущее время').test(n)) return done(R(dateAnswer(n), {chips: starters(ctx, st), intent: 'datetime'}));

      /* ---- роль и город ---- */
      if (role && ntok <= 9 && !tasksInText.length && !brandsInText.length) {
        const who = ROLE_NAME[role];
        return done(R('Принято: ' + who + (st.city ? ', ' + st.city : '') + '. Учту это в ответах.' + (role === 'cosmetologist' ? ' Могу подобрать продукты по задаче или показать ближайшие семинары.' : ' Могу рассказать об условиях сотрудничества и скидках по объёму.'), {chips: role === 'cosmetologist' ? ['Подобрать средство по задаче', 'Ближайшие семинары'] : ['Как стать партнёром', 'Какие скидки?', 'Ближайшие семинары'], actions: role === 'cosmetologist' ? [] : [act.partner(st)], intent: 'role'}));
      }

      /* ---- ответ на собственный вопрос («да», «нет») ---- */
      const yes = ntok <= 3 && W('(?:да|ага|угу|конечно|давай|хорошо|ок|окей|можно|пожалуйста|буду)' + END).test(n), no = ntok <= 3 && W('(?:нет|не надо|не нужно|не стоит|потом|позже)' + END).test(n);
      if (yes && st.pending) {
        const p = st.pending; st.pending = null;
        if (p.type === 'register' && p.ids && p.ids.length) return done(R('Выберите мероприятие — откроется форма записи:', {events: p.ids, intent: 'register'}));
        if (p.type === 'request') return done(R('Хорошо, оформим запрос — менеджер уточнит условия и наличие:', {actions: compact([act.form('product', 'Запросить информацию', p.ref || ''), act.callback()]), intent: 'request'}));
        if (p.type === 'callback') return done(R('Оставьте имя и телефон — менеджер перезвонит.', {actions: compact([act.callback()]), intent: 'callback'}));
      }
      if (no && st.pending) { st.pending = null; return done(R('Хорошо, как скажете. Чем ещё помочь?', {chips: starters(ctx, st), intent: 'no'})); }

      /* ---- уточнения по ходу диалога ---- */
      const l = st.last || {};
      if (l.all && l.all.length && W('ещ[её]($|\\s)|дальше|другие|продолжи(?:ть)?($|\\s)|покажи больше|еще варианты|ещё варианты|остальные').test(n) && ntok <= 4) return done(moreAnswer(st));
      const ordIdx = ORD.find(([re]) => W(re).test(n)); const lastWord = W('последн').test(n);
      if ((ordIdx || lastWord) && l.cards && l.cards.length && W('подробн|расскажи|про|а |что за|что такое|покажи|открой').test(n)) { const id = lastWord ? l.cards[l.cards.length - 1] : l.cards[ordIdx[1]]; if (id && P[id]) return done(Object.assign(productAnswer(P[id], st), {local: true})); }
      if (W('почему|обоснуй|на каком основании|как ты выбира|как подбира|откуда ты|зачем эти|чем руководств').test(n) && ntok <= 9 && (['task', 'more', 'combo', 'similar', 'products', 'compare'].indexOf(l.intent) >= 0 || W('именно|эти|выбрал|порекомендов|подобрал').test(n))) return done(Object.assign(whyAnswer(st), {local: true}));
      if (W('с чем сочета|чем дополнить|что добавить|что ещё добавить|с чем комбинир|что к этому|в связке|что вместе').test(n)) return done(Object.assign(comboAnswer(st), {local: true}));
      if (W('покажи фотозащит|давай фотозащит').test(n)) return done(taskAnswer(['sun'], st));
      if (W('сравни|сравнить|сравнение|чем отличает|в чем разница|разниц|отличи').test(n) && l.cards && l.cards.length >= 2 && !productsInText.length && W('их|эти|оба|первые|первых|между|выбранн|показанн|все').test(n)) return done(Object.assign(comparison(l.cards.slice(0, W('трет|три|3').test(n) ? 3 : 2).map(id => P[id]), st), {local: true}));
      if (W('сравни|сравнить|сравнение|чем отличает|в чем разница|разниц|отличи').test(n) && l.cards && l.cards.length === 1 && P[l.cards[0]] && !productsInText.length && W('их|эти|оба|первые|первых|между').test(n)) {
        const base = P[l.cards[0]], sim = K.searchProducts({task: (base.ts || [])[0]}).filter(p => p.id !== base.id).slice(0, 3);
        if (sim.length) { const f = showList(st, [base.id].concat(sim.map(p => p.id)), {intent: 'similar', product: base.id}); return done(R('Сейчас у нас на экране один товар — **' + base.name + '**. Сравнить его можно, например, с этими (общая задача «' + lower(TASK[(base.ts || [])[0]]) + '»):', {cards: sim.map(p => p.id), chips: sim.slice(0, 2).map(p => 'Сравни ' + base.name + ' и ' + p.name), intent: 'similar'})); }
      }
      if (W('сравни|сравнить|сравнение|чем отличает|в чем разница|разниц|отличи|что лучше').test(n) && productsInText.length >= 2) return done(comparison(productsInText.slice(0, 3), st));
      if (W('сравни|сравнить|сравнение|чем отличает|в чем разница|разниц|отличи').test(n) && productsInText.length === 1 && ctx.product && ctx.product !== productsInText[0].id && P[ctx.product]) return done(comparison([P[ctx.product], productsInText[0]], st));
      if (W('сравни|сравнить|сравнение|с чем сравнить|чем отличает').test(n) && (refd || W('с чем сравнить').test(n)) && P[ctx.product || l.product]) {
        const base = P[ctx.product || l.product], sim = K.searchProducts({task: (base.ts || [])[0]}).filter(p => p.id !== base.id).slice(0, 3);
        if (sim.length) { const first = showList(st, sim.map(p => p.id), {intent: 'similar', product: base.id}); return done(R('С чем сравнить **' + base.name + '**? По общей задаче «' + lower(TASK[(base.ts || [])[0]]) + '» в каталоге есть:', {cards: first, chips: sim.slice(0, 2).map(p => 'Сравни ' + base.name + ' и ' + p.name), intent: 'similar'})); }
      }
      /* уточнение предыдущего подбора: другой бренд / другая задача / «для кабинета» / «для дома» */
      const homeF = W('для дом|домашн|для ухода дома|на дом').test(n) ? true : W('для кабинет|кабинетн|профессиональн|процедур').test(n) ? false : undefined;
      if (l.intent === 'task' || l.intent === 'brand' || l.intent === 'combo') {
        if (brandsInText.length === 1 && !tasksInText.length && !productsInText.length && ntok <= 6 && (l.tasks && l.tasks.length)) return done(Object.assign(taskAnswer(l.tasks, st, {brand: brandsInText[0].id, home: l.home}), {local: true}));
        if (homeF !== undefined && !tasksInText.length && (l.tasks && l.tasks.length) && ntok <= 7) return done(Object.assign(taskAnswer(l.tasks, st, {brand: l.brand, home: homeF}), {local: true}));
        if (tasksInText.length && l.brand && ntok <= 6 && !brandsInText.length && W('а |ещ[её]|тоже|также|и для').test(n)) return done(taskAnswer(tasksInText, st, {brand: l.brand}));
      }

      /* ---- «навигатор»: открыть страницу, показать место, провести по шагам, отфильтровать каталог ---- */
      { const nv = navIntent(text, n, tk, st, ctx, {tasks: tasksInText, brands: brandsInText, products: productsInText}); if (nv) return done(nv); }

      /* ---- библиотека реплик: о Стелле, светская беседа, не по теме, чего сайт не знает (стадия «mid») — раньше общих «прямых намерений», чтобы «договорились» не принималось за «договор» ---- */
      if (SL) { const rm = slReply('mid', X, st, ctx); if (rm) return done(rm); }

      /* ---- прямые намерения ---- */
      if (W('перезвон|заказать звонок|закажу звонок|позвоните мне|обратный звонок').test(n)) return done(R(hasCallback ? 'Оставьте имя и телефон — менеджер перезвонит в рабочее время (' + contactsMain.hours + ').' : 'Позвоните нам: ' + contactsMain.phone + ' (' + contactsMain.hours + ').', {actions: compact([act.callback()]), intent: 'callback'}));
      if (W('медицинск|беремен|лактац|аллерги|противопоказ|диагноз|лечени|болезн|дерматит|экзем|псориаз|онколог|можно ли мне|подойд[её]т ли мне|назначь|что мне делать|какой препарат принимать').test(n))
        return done(R('Я не даю медицинских рекомендаций и не ставлю диагнозов: подбор ухода и протокол определяет специалист по результатам консультации. Могу рассказать, какие продукты на сайте относятся к нужной задаче, а с вопросами по применению поможет менеджер или ваш косметолог.', {actions: [act.ask(text)], links: [link('catalog.html', 'Каталог')], chips: ['Подобрать средство по задаче'], intent: 'medical'}));
      if (amount && (W('скидк|порог|закуп|объем|объём|заказ|при сумме|на сумму|от суммы|купить на|взять на').test(n) || ['discount', 'price', 'partner'].indexOf((st.last || {}).intent) >= 0 || st.lastIntent === 'price')) return done(discountAnswer(amount, st));
      if (W('скидк|порог|программа скидок').test(n) && !W('стать партн|сотруднич').test(n)) { st.last = {intent: 'discount'}; return done(discountAnswer(0, st)); }
      if (W('цен(?:а|ы|у|е|ой|ам|ах|ами)?(?![а-яa-z0-9])|стоит|стоимост|прайс|почем(?![а-яa-z])|сколько стоит|дорог(?:о|ой|ая|ие|ое|ий)?(?![а-яa-z])|дешев|недорог|бюджет').test(n) && !W('обучен|семинар|мастер|вебинар|участи|регистрац').test(n)) {
        const pp = productsInText[0] || (refd && P[ctx.product || l.product]) || null; st.pending = {type: 'request', ref: pp ? pp.id : ''};
        const d = K.discount(0);
        return done(R('Цен на сайте нет: стоимость зависит от объёма закупки и условий партнёрства, её называет менеджер (' + contactsMain.phone + ', ' + contactsMain.hours + '). Для ориентира: ' + lower('Скидки по объёму закупки (ориентировочно): ') + d.tiers.map(t => 'от ' + fmtRub(t.from) + ' — ' + t.pct + '%').join('; ') + '. Назовите сумму закупки — посчитаю скидку. Отправить запрос менеджеру?', {cards: pp ? [pp.id] : [], actions: compact([act.form('product', 'Запросить условия', pp ? pp.id : ''), act.callback()]), links: [link('partners.html', 'Калькулятор скидок')], chips: ['Да, отправить запрос', 'А при 200 тысячах?'], intent: 'price'}));
      }
      if (W('налич|на склад|достав|отгруз|срок поставк|сроки|сертификат|регистрац|декларац|документ|состав|дозиров|штрихкод|гарант').test(n) && !productsInText.length && !W('мероприят|семинар|вебинар|обучен|записат').test(n)) {
        st.pending = {type: 'request', ref: ''};
        return done(R('Этих сведений на сайте нет — чтобы не ошибиться, их подтверждает менеджер: наличие, сроки и условия доставки, документы и сертификаты, состав. ' + MGR() + ' Отправить запрос?', {actions: compact([act.form('product', 'Запросить информацию', ''), act.callback()]), chips: ['Да, отправить запрос'], intent: 'avail'}));
      }
      if (W('где купить|как купить|как заказать|как приобрести|как оформить заказ|физлиц|частн\\S* лиц|для себя|интернет-магазин').test(n)) return done(R('Продукция «Астреи» рассчитана на специалистов — косметологов, салоны и клиники — и поставляется партнёрам. Чтобы начать, оставьте заявку на партнёрство или запрос по товару: менеджер уточнит условия и подскажет, как оформить поставку. Для частных покупателей условия уточняйте у менеджера.', {actions: compact([act.partner(st), act.form('product', 'Запросить информацию', ''), act.callback()]), links: [link('partners.html', 'Условия сотрудничества')], intent: 'buy'}));
      if ((W('контакт|телефон|позвонить|номер|почт|e-?mail|адрес|как добрат|как найти|офис|график|часы работ|режим работ|когда работа|whatsapp|ватсап|представительств').test(n) && !W('семинар|мероприят|вебинар').test(n)) || (W('где наход').test(n) && W('вы|ваш|офис|компани|склад|представительств|магазин|учебн|центр').test(n) && !W('семинар|мероприят|вебинар').test(n))) return done(contactsAnswer(n, st));
      if (W('менеджер|оператор|живой человек|связаться|свяжитесь|консультант|человек').test(n)) return done(R('Менеджер ответит в рабочее время: ' + contactsMain.phone + ' (' + contactsMain.hours + '). Можно заказать звонок или задать вопрос письменно.', {actions: compact([act.callback(), act.ask(text)]), links: [link('contacts.html', 'Контакты')], intent: 'human'}));
      if (W('партн[её]р|сотрудничеств|дилер|дистрибьют|оптом|опт($|\\s)|закупк|условия поставк|договор|стать клиент').test(n)) return done(partnerAnswer(n, st));
      if (W('заявк|оставить запрос|отправить запрос').test(n)) return done(R('Выберите, что оформить:', {actions: compact([act.form('product', 'Запросить информацию', ''), act.partner(st), act.callback()]), intent: 'forms'}));
      if (W('как записат|записат|регистрац на|запись на|хочу на семинар|хочу записаться').test(n) && (D.events || []).length) {
        const list = K.listEvents(Object.assign({city: cityOf(n) || undefined})); const e = list[0] || K.listEvents({})[0];
        if (e) { st.pending = null; return done(R('Выберите мероприятие в расписании и нажмите «Записаться» — или запишитесь на ближайшее:', {events: list.slice(0, 2).map(x => x.id).length ? list.slice(0, 2).map(x => x.id) : [e.id], links: [link('training.html', 'Всё расписание')], intent: 'register'})); }
      }
      if (W('все города|любой город|в любом городе|все семинары|показать все|покажи все|все мероприятия').test(n) && (l.intent === 'events' || W('семинар|мероприят').test(n))) { const res = eventsAnswer('все семинары', st, ctx); st.pending = {type: 'register', ids: res.events.slice(0, 2)}; return done(res); }
      if (W('обучен|семинар|мастер-?класс|вебинар|курс|академи|мероприят|расписан|учебн|тренинг').test(n)) {
        const faqHit = K.searchInfo(text, 2).find(h => h.kind === 'faq');
        if (faqHit && faqHit.hit / faqHit.of >= 0.4 && faqHit.score > 0.02 && !W('ближайш|расписан|когда|какие|покажи|список|онлайн|вебинар|очно').test(n) && !cityOf(n) && !periodOf(n)) { st.pending = {type: 'register', ids: K.listEvents({}).slice(0, 2).map(e => e.id)}; return done(R(faqHit.text, {links: [link('training.html', 'Обучение')], chips: ['Ближайшие семинары', 'Как записаться?'], intent: 'faq', steps: ['Ищу ответ в материалах…']})); }
        const res = eventsAnswer(n, st, ctx); st.pending = {type: 'register', ids: res.events.slice(0, 2)}; return done(res);
      }
      if (periodOf(n) && !tasksInText.length && !productsInText.length && K.listEvents({from: periodOf(n).from, to: periodOf(n).to}).length) return done(eventsAnswer(n, st, ctx));
      if (W('новост|акци[июя]|что нового|анонс').test(n)) { const nw = ((KB && KB.news) || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3); return done(R(nw.length ? 'Свежее на сайте: ' + nw.map(x => x.t).join('; ') + '.' : 'Новости — на странице «Новости».', {links: nw.map(x => link(x.u, x.t)).concat(nw.length ? [] : [link('news.html', 'Новости')]), intent: 'news', steps: ['Смотрю новости…']})); }
      if (W('новинк').test(n)) { const ps = (D.products || []).filter(p => p.n); const first = showList(st, ps.map(p => p.id), {intent: 'new'}); return done(R(ps.length ? 'Новинки каталога:' : 'Сейчас новинок в каталоге нет.', {cards: first, links: [link('catalog.html', 'Весь каталог')], intent: 'new'})); }
      if (W('о компании|про компани|про вашу компани|о вас($|\\s)|про вас($|\\s)|об астре|про астре|о вашей компании|кто вы|чем занимаетесь|занима(?:ет|ете)ся|расскажите о себе|расскажите о компании|оригинальн|контрафакт|подлинн|кто такие|что за компания|что вы делаете').test(n)) { const c = KB && KB.company; return done(R(c && c.about && c.about.length ? c.about[0] + (c.advantages && c.advantages.length ? '\n\nПреимущества: ' + c.advantages.slice(0, 4).map(a => lower(a.t)).join(', ') + '.' : '') : 'Подробно о компании — на странице «Компания».', {links: [link('company.html', 'О компании')], chips: ['Какие бренды?', 'Как стать партнёром'], intent: 'about'})); }

      /* ---- сущности каталога ---- */
      if (productsInText.length === 1) return done(productAnswer(productsInText[0], st));
      if (productsInText.length > 1) { const first = showList(st, productsInText.map(p => p.id), {intent: 'products'}); return done(R('Нашёл несколько подходящих товаров:', {cards: first, actions: hasCompare ? [{l: 'Сравнить', act: 'asst-cmp', ids: productsInText.slice(0, 3).map(p => p.id).join(',')}] : [], chips: ['Сравни первые два'], intent: 'products'})); }
      if (brandsInText.length === 1) return done(brandAnswer(brandsInText[0], st));
      if (brandsInText.length > 1) return done(R('Подскажу по брендам: ' + brandList(brandsInText.map(b => b.id)) + '. О каком рассказать подробнее?', {links: brandsInText.map(b => link('brands/' + b.id + '.html', b.name)), chips: brandsInText.map(b => 'Расскажите про ' + b.name), intent: 'brands'}));
      if (tasksInText.length) return done(taskAnswer(tasksInText, st, {home: homeF}));
      if (refd && P[ctx.product || l.product]) return done(productAnswer(P[ctx.product || l.product], st));
      const cats = (D.cats || []).filter(c => words(c.name).map(stem).filter(t => !STOP.has(t) && t.length > 3).some(t => tk.indexOf(t) >= 0));
      if (cats.length) { const cps = (D.products || []).filter(p => p.c === cats[0].id); const first = showList(st, cps.map(p => p.id), {intent: 'category'}); return done(R('**' + cats[0].name + '** — ' + cps.length + ' ' + plural(cps.length, 'позиция', 'позиции', 'позиций') + ' в каталоге.', {cards: first, links: [link('catalog.html?cat=' + cats[0].id, 'Открыть категорию')], intent: 'category'})); }
      if (W('подобрать|подбор|посоветуй|порекоменд|что выбрать|что взять|помогите выбрать|что подойд[её]т|помоги выбрать|что бы вы').test(n)) return done(R('По какой задаче подбираем? Выберите или напишите своими словами — например, «пигментация» или «чувствительная кожа».', {chips: (D.tasks || []).slice(0, 8).map(t => t.label), intent: 'pick'}));
      if (W('каталог|ассортимент|что у вас есть|что продаёте|что продаете|что есть|продукци|бренд').test(n)) { const cnt = {}; (D.products || []).forEach(p => { cnt[p.c] = (cnt[p.c] || 0) + 1; }); return done(R('В каталоге ' + D.products.length + ' ' + plural(D.products.length, 'позиция', 'позиции', 'позиций') + ' ' + (D.brands || []).length + ' ' + plural((D.brands || []).length, 'бренда', 'брендов', 'брендов') + ': ' + (D.brands || []).map(b => b.name).join(', ') + '. Категории: ' + (D.cats || []).filter(c => cnt[c.id]).map(c => lower(c.name)).join(', ') + '.', {links: [link('catalog.html', 'Каталог'), link('brands.html', 'Бренды')], chips: ['Подобрать средство по задаче'], intent: 'catalog'})); }

      /* ---- библиотека реплик: о Стелле, светская беседа, просьбы не по теме (стадия «pre») ---- */
      if (SL) { const rp = slReply('pre', X, st, ctx); if (rp) return done(rp); }

      /* ---- свободный вопрос: поиск по материалам сайта ---- */
      const ia = infoAnswer(text, st); if (ia) return done(ia);

      /* ---- чего на сайте нет (возврат, рассрочка, вакансии…) и последний шанс библиотеки (стадия «post») ---- */
      if (SL) { const rp = slReply('post', X, st, ctx) || slReply('weak', X, st, ctx); if (rp) return done(rp); }
      return done(unknown(text, st, tk));
    }

    /* точные и служебные намерения отвечаются здесь же (мгновенно, бесплатно, без «выдумок»): приветствия, контакты, скидка, расписание, формы, расчёт, дата; всё остальное — светская беседа, «о компании», партнёрство, новости, каталог, медицинские и свободные вопросы — при включённом ИИ уходит к нему, а без ИИ его закрывает этот же движок */
    const LOCAL = new Set(['nav', 'compare', 'greet', 'thanks', 'bye', 'who', 'role', 'no', 'yes', 'callback', 'price', 'avail', 'buy', 'contacts', 'human', 'forms', 'register', 'events', 'discount', 'empty', 'frustrated', 'more', 'pick', 'request', 'calc', 'datetime']);
    function fin(res, st) {
      if (res.sure !== false) res.sure = res.local || LOCAL.has(res.intent);          // res.local — продолжение диалога, которое зависит от состояния движка
      res.state = st; if (!res.chips.length) res.chips = starters({}, st).slice(0, 3);
      if (!res.keepLast) st.lastText = String(res.text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (res.intent !== 'unknown') st.missN = 0; st.lastTopic = res.topic || '';
      res.chips = res.chips.filter((c, i, a) => c && a.indexOf(c) === i).slice(0, 4);
      st.lastIntent = res.intent; return res;
    }
    const newState = () => ({turns: 0, role: '', city: '', pending: null, last: {}});
    /* когда на вопрос ответил ИИ, движок запоминает показанные им карточки: «ещё», «подробнее про первый», «сравни их» продолжают работать */
    function noteExternal(st, ids, tasks) { ids = (ids || []).filter(id => P[id]); st.last = {intent: ids.length ? 'task' : (st.last || {}).intent, cards: ids.slice(0, 4), all: ids, offset: ids.length, tasks: tasks || (st.last || {}).tasks || [], brand: ''}; }
    return {reply, newState, starters, knowledge: K, correct, noteExternal, compareTemplates: Object.keys(CMPT), compareText: (ids, tpl) => { const f = K.compareFacts(ids); return f ? (CMPT[tpl || CMP_TPL] || CMPT.sections)(f) : ''; }, library: SL ? {topics: SLT, byId: SLID, raw: SL, find: (stage, text) => slFind(stage, [words(squash(clean(text)))]).map(t => t.id)} : null};
  }

  return {createBrain, createKnowledge};
});
