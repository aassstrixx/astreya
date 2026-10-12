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
    return {P, B, CAT, TASK, KIND, EV, KB, today, daysTo, brandName, kbTask, kbBrand, brief, searchProducts, getProduct, getBrand, listEvents, discount, contacts, searchInfo, bestSentence, vocab, passages, iso, now};
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
    function comparison(list, st) {
      const names = list.map(p => '**' + p.name + '**'), L = [];
      const same = (f, g) => list.every(p => f(p) === f(list[0]));
      if (same(p => p.brand)) L.push((list.length === 2 ? 'Оба продукта' : 'Все продукты') + ' от ' + K.brandName(list[0].brand) + '.'); else L.push('Бренды: ' + list.map(p => p.name + ' — ' + K.brandName(p.brand)).join('; ') + '.');
      const shared = (list[0].ts || []).filter(t => list.every(p => (p.ts || []).indexOf(t) >= 0));
      if (shared.length) L.push('Общие задачи: ' + shared.map(t => lower(TASK[t])).join(', ') + '.'); else L.push('По задачам они не пересекаются: ' + list.map(p => p.name + ' — ' + ((p.ts || []).map(t => lower(TASK[t])).join(', ') || 'не указано')).join('; ') + '.');
      if (!same(p => p.c)) L.push('Категории: ' + list.map(p => p.name + ' — ' + lower(CAT[p.c])).join('; ') + '.'); else L.push('Категория одна: ' + lower(CAT[list[0].c]) + '.');
      if (!same(p => p.k)) L.push('Вид: ' + list.map(p => p.name + ' — ' + lower(KIND[p.k] || '—')).join('; ') + '.');
      const uniq = list.map(p => ({p, only: (p.ts || []).filter(t => !list.some(q => q !== p && (q.ts || []).indexOf(t) >= 0))})).filter(x => x.only.length);
      if (uniq.length && shared.length) L.push('Только у ' + uniq.map(x => x.p.name + ': ' + x.only.map(t => lower(TASK[t])).join(', ')).join('; ') + '.');
      L.push('Состав, цену и точные характеристики на сайте не указываем — их даст менеджер.');
      st.last = {intent: 'compare', cards: list.map(p => p.id), all: list.map(p => p.id), offset: list.length, tasks: shared, brand: ''};
      return R('Сравниваю ' + names.join(' и ') + ' по данным каталога:\n\n' + L.join('\n'), {cards: list.map(p => p.id), actions: hasCompare ? [{l: 'Открыть таблицу сравнения', act: 'asst-cmp', ids: list.map(p => p.id).join(',')}] : [], chips: ['Запросить условия', 'Ближайшие семинары'], intent: 'compare', steps: ['Сравниваю по данным каталога…']});
    }
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
      const text1 = sug.length ? 'Не уверена, что правильно поняла вопрос. Возможно, вы имели в виду что-то из этого?' : 'На такой вопрос я сейчас не отвечу: работаю без ИИ и знаю только данные сайта — каталог, бренды, обучение, партнёрство и контакты. С ними помогу сразу, а остальное можно передать менеджеру.';
      return R(text1, {actions: compact([act.ask(text), act.callback()]), chips: (sug.length ? sug : starters({}, st)).slice(0, 4), intent: 'unknown', sure: false, steps: ['Думаю…']});
    }

    /* ---------- главный разбор ---------- */
    function reply(raw, st, ctx) {
      ctx = ctx || {}; st = st || newState(); st.turns = (st.turns || 0) + 1; st.last = st.last || {};
      const text = String(raw == null ? '' : raw).trim(); if (!text) return fin(R('Напишите вопрос — отвечу по каталогу, обучению и условиям сотрудничества.', {chips: starters(ctx, st), intent: 'empty'}), st);
      const fixed = correct(text), n = clean(fixed.text), tk = words(n).map(stem), ntok = tk.length;
      const brandsInText = brandsIn(n), tasksInText = taskOf(n), productsInText = productsIn(n, tk), city = cityOf(n), role = roleOf(n), amount = amountOf(text);
      const refd = W('эт(?:от|а|о|ом|ого|ому|им|у)' + END + '|(?:он|она|оно)' + END + '|его|ее|её|данн|текущ').test(n) && !!(ctx.product || (st.last && st.last.product));
      if (city && (W('из\\s|я в\\s|мы в\\s|находимся|живу|работаю|у нас в|в городе|мой город').test(n) || ntok <= 2)) st.city = city;
      if (role) st.role = role;
      const done = res => fin(res, st);

      /* ---- светские реплики ---- */
      const greetRe = new RegExp('^(?:ну |а )?(?:привет|здравствуй|добрый день|доброе утро|добрый вечер|доброй ночи|(?:хай|hello|hi|салют)' + END + ')', 'i');
      if (greetRe.test(n) && ntok <= 4) { st.last = {}; return done(R(hello() + '! Я Стелла, мини-консультант «Астреи». Подскажу по каталогу и брендам, обучению, условиям сотрудничества и контактам. ' + pick(st, ['Что вас интересует?', 'С чего начнём?', 'Чем помочь?']), {chips: starters(ctx, st), intent: 'greet'})); }
      if (W('спасиб|благодар|выручил|супер|отлично|класс($|\\s)|здорово|молодец|круто').test(n) && ntok <= 6) return done(R(pick(st, ['Пожалуйста! Если появятся вопросы — пишите.', 'Рада помочь! Обращайтесь, если понадобится ещё что-то.', 'Всегда пожалуйста. Что ещё подсказать?']), {chips: ['Ближайшие семинары', 'Контакты менеджера'], intent: 'thanks'}));
      if (W('до свидани|пока($|\\s)|всего доброго|удачи|до встречи|bye').test(n) && ntok <= 5) return done(R('Всего доброго! Если понадоблюсь — Стелла всегда на связи.', {intent: 'bye'}));
      if (W('как дела|как ты|как поживаешь|как жизнь').test(n)) return done(R('Спасибо, всё хорошо — я программа и не устаю, зато жемчужинки всегда в настроении. Расскажите, что вам нужно: каталог, обучение или условия сотрудничества?', {chips: starters(ctx, st), intent: 'smalltalk'}));
      if (W('анекдот|шутк|расскажи что-нибудь смешное|спой|стих').test(n)) return done(R('Шутки и стихи — не моя сильная сторона: в моей базе только каталог, расписание и условия сотрудничества. Зато в них я разбираюсь хорошо.', {chips: starters(ctx, st), intent: 'smalltalk'}));
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
      if (W('контакт|телефон|позвонить|номер|почт|e-?mail|адрес|где наход|как добрат|как найти|офис|график|часы работ|режим работ|когда работа|whatsapp|ватсап|представительств').test(n) && !W('семинар|мероприят|вебинар').test(n)) return done(contactsAnswer(n, st));
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
      if (W('о компании|о вашей компании|кто вы|чем занимаетесь|занима(?:ет|ете)ся|расскажите о себе|расскажите о компании|оригинальн|контрафакт|подлинн|кто такие|что за компания|что вы делаете').test(n)) { const c = KB && KB.company; return done(R(c && c.about && c.about.length ? c.about[0] + (c.advantages && c.advantages.length ? '\n\nПреимущества: ' + c.advantages.slice(0, 4).map(a => lower(a.t)).join(', ') + '.' : '') : 'Подробно о компании — на странице «Компания».', {links: [link('company.html', 'О компании')], chips: ['Какие бренды?', 'Как стать партнёром'], intent: 'about'})); }

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

      /* ---- свободный вопрос: поиск по материалам сайта ---- */
      const ia = infoAnswer(text, st); if (ia) return done(ia);
      return done(unknown(text, st, tk));
    }

    /* точные и служебные намерения отвечаются здесь же (мгновенно, бесплатно, без «выдумок»): приветствия, контакты, скидка, расписание, формы, расчёт, дата; всё остальное — светская беседа, «о компании», партнёрство, новости, каталог, медицинские и свободные вопросы — при включённом ИИ уходит к нему, а без ИИ его закрывает этот же движок */
    const LOCAL = new Set(['greet', 'thanks', 'bye', 'who', 'role', 'no', 'yes', 'callback', 'price', 'avail', 'buy', 'contacts', 'human', 'forms', 'register', 'events', 'discount', 'empty', 'frustrated', 'more', 'pick', 'request', 'calc', 'datetime']);
    function fin(res, st) {
      if (res.sure !== false) res.sure = res.local || LOCAL.has(res.intent);          // res.local — продолжение диалога, которое зависит от состояния движка
      res.state = st; if (!res.chips.length) res.chips = starters({}, st).slice(0, 3);
      res.chips = res.chips.filter((c, i, a) => c && a.indexOf(c) === i).slice(0, 4);
      st.lastIntent = res.intent; return res;
    }
    const newState = () => ({turns: 0, role: '', city: '', pending: null, last: {}});
    /* когда на вопрос ответил ИИ, движок запоминает показанные им карточки: «ещё», «подробнее про первый», «сравни их» продолжают работать */
    function noteExternal(st, ids, tasks) { ids = (ids || []).filter(id => P[id]); st.last = {intent: ids.length ? 'task' : (st.last || {}).intent, cards: ids.slice(0, 4), all: ids, offset: ids.length, tasks: tasks || (st.last || {}).tasks || [], brand: ''}; }
    return {reply, newState, starters, knowledge: K, correct, noteExternal};
  }

  return {createBrain, createKnowledge};
});
