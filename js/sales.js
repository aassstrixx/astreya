/* sales.js — продающий слой «Путь к закупке» (data/redesign.json → extras.sales; тексты и настройки — data/sales.json → window.ASTREYA_DATA.sales).

   Принцип: посетителю помогают сделать следующий шаг, а не подталкивают обманом. Никаких «акций с таймером», «сейчас смотрят N человек»,
   выдуманного дефицита, отзывов и стыдящих отказов. Все факты (даты семинаров, скидки, преимущества) берутся из данных сайта.

   Что здесь:
   · стартовый подбор (страница start.html) — 3–5 коротких вопросов → план: линейки, товары, ближайшее обучение, ориентировочные условия → заявка менеджеру;
   · панель следующего шага — плашка в «доке» внизу экрана (телефон — по умолчанию; компьютер — только в варианте проверки barDesktop=pill);
   · ходы по страницам (подборки, маршрут бренда, календарь встреч, ориентир скидки…) — отдельный файл js/sales-pages.js, он подключается к этому ядру (A.sales.kit); даты считаются в браузере — статичная сборка быстро устарела бы;
   · «что дальше» после отправленной заявки;
   · метка источника заявки (поле src: страница, элемент, варианты проверок) и события sales_… и plan_… для аналитики;
   · A.exp — честные A/B-проверки на посетителях (вариант запоминается в браузере; ?x=barDesktop:pill — принудительно, для проверки).
   Не затрагивает вступление, героя, шапку, подвал и меню (страницы без слоя — sales.exclude, без панели — sales.barExclude). Выключить всё: extras.sales = false и пересборка.
   Страницы подменяются без перезагрузки — всё идемпотентно и перерисовывается в A.initPage. Ничего не отправляется на сервер без заявки посетителя. */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || !D.sales || !D.extras || !D.extras.sales) return;
  const SX = D.sales, I = A.I, esc = A.esc, X = D.extras;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const V = Object.assign({planFlow: 'four', barStyle: 'bottom'}, SX.variants || {});
  /* для проверок и арены: ?v=planFlow:three,barStyle:pill принудительно включает вариант оформления (только на этой загрузке страницы) */
  (function () { try { const q = new URLSearchParams(location.search).get('v'); if (q) q.split(',').forEach(x => { const kv = x.split(':'); if (kv[0] in V && /^[a-z]+$/.test(kv[1] || '')) V[kv[0]] = kv[1]; }); } catch (e) {} })();
  const EXCL = new Set(SX.exclude || []), BAR_EXCL = new Set(SX.barExclude || []);
  const root = () => document.body.getAttribute('data-root') || '';
  const pageKey = () => document.body.getAttribute('data-page') || '';
  const narrow = () => matchMedia('(max-width:900px)').matches;
  const speed = () => { const v = +window.ASTREYA_MOTION_SPEED; return v > 0 ? v : 1; };
  const query = () => A.query ? A.query() : new URLSearchParams(location.search);
  const mkStore = st => ({
    get: k => { try { return JSON.parse(window[st].getItem(k) || 'null'); } catch (e) { return null; } },
    set: (k, v) => { try { window[st].setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: k => { try { window[st].removeItem(k); } catch (e) {} }
  });
  const local = mkStore('localStorage'), sess = mkStore('sessionStorage');
  const KP = 'astreya:plan', KD = 'astreya:plan-draft', KC = 'astreya:city', KX = 'astreya:exp', KV = 'astreya:sx-via', KB = 'astreya:sx-bar-x';
  const track = (n, p) => { try { A.track(n, p || {}); } catch (e) {} };
  const fill = (s, v) => String(s == null ? '' : s).replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? v[k] : m);
  const plural = A.plural || ((n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; });
  const PLUS = '<svg class="ic i-pl" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4.5v11M4.5 10h11"/></svg>';
  const rub = A.rub || (n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽');

  /* ---------- что известно сайту ---------- */
  const P = {}, B = {}, T = {}, EV = {};
  (D.products || []).forEach(p => { P[p.id] = p; }); (D.brands || []).forEach(b => { B[b.id] = b; }); (D.tasks || []).forEach(t => { T[t.id] = t; }); (D.events || []).forEach(e => { EV[e.id] = e; });
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const upcoming = () => (D.events || []).filter(e => e.date >= today()).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const nextEvent = brand => upcoming().find(e => !brand || e.b === brand) || null;
  const dShort = iso => A.dparts(iso).full.replace(/\s\d{4}$/, '');
  const dFull = iso => A.dparts(iso).full;
  const daysTo = iso => Math.round((Date.parse(iso) - Date.parse(today())) / 864e5);
  const evUrl = e => 'training/' + e.slug + '.html';
  const pUrl = p => 'products/' + p.slug + '.html';
  const bUrl = b => 'brands/' + b.id + '.html';
  const planPath = (SX.planner && SX.planner.path) || 'start.html';

  /* ---------- ссылки: в обычном режиме — путь от корня страницы; в автономной сборке — собственный роутер ---------- */
  const href = path => root() + path;
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-sx-go]'); if (!a || !A.showPage || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const u = new URL(a.getAttribute('data-sx-go'), 'http://x/'); A.showPage(u.pathname.replace(/^\//, ''), u.search, u.hash, true, false);
  }, true);
  const link = (path, cls, label, sx, extra) => '<a class="' + cls + '" href="' + esc(href(path)) + '" data-sx-go="' + esc(path) + '"' + (sx ? ' data-sx="' + esc(sx) + '"' : '') + (extra || '') + '>' + label + '</a>';

  /* ---------- A/B-проверки ---------- */
  const memExp = {};
  function override(name) {
    try { const q = query().get('x'); if (!q) return ''; const m = q.split(',').map(s => s.split(':')).find(x => x[0] === name); return m ? m[1] : ''; } catch (e) { return ''; }
  }
  const pickW = c => { const w = c.weights || c.variants.map(() => 1), sum = w.reduce((a, b) => a + b, 0); let r = Math.random() * sum; for (let i = 0; i < c.variants.length; i++) { r -= w[i]; if (r < 0) return c.variants[i]; } return c.variants[0]; };
  A.exp = function (name) {
    const c = (SX.experiments || {})[name]; if (!c || !c.variants || !c.variants.length) return '';
    const o = override(name); if (o && c.variants.indexOf(o) >= 0) return o;
    if (c.fixed && c.variants.indexOf(c.fixed) >= 0) return c.fixed;
    const all = Object.assign({}, local.get(KX) || memExp); let v = all[name];
    if (c.variants.indexOf(v) < 0) { v = pickW(c); all[name] = v; Object.assign(memExp, all); local.set(KX, all); track('sales_exp', {exp: name, variant: v}); }
    return v;
  };
  const assigned = () => { const all = Object.assign({}, memExp, local.get(KX) || {}); return Object.keys(all).filter(k => (SX.experiments || {})[k] && !(SX.experiments[k].fixed)).map(k => k + ':' + all[k]).join(','); };
  const ctaLabel = () => (SX.cta || {})[A.exp('ctaCopy') || 'conditions'] || (SX.cta || {}).conditions || 'Запросить условия';

  /* ---------- метка источника заявки ---------- */
  const setVia = v => sess.set(KV, {v: v, t: Date.now()});
  const getVia = () => { const o = sess.get(KV); return o && Date.now() - o.t < 30 * 60 * 1000 ? o.v : ''; };
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-sx]'); if (!el) return;
    const v = el.getAttribute('data-sx'); setVia(v); track('sales_click', {place: v, page: pageKey()});
  }, true);
  A.leadSrc = function (o) {
    const parts = ['p=' + (pageKey() || '?')], via = getVia(), x = assigned();
    if (via) parts.push('via=' + via);
    if (x) parts.push('x=' + x);
    if (o && o.type === 'plan') { const s = savedPlan(); if (s && s.st) parts.push('plan=' + [s.st.role || '-', (s.st.tasks || []).join('.') || '-', s.st.goal || '-', s.st.volume || '-'].join('/')); }
    return parts.join(';').slice(0, 200);
  };

  /* ================= СТАРТОВЫЙ ПОДБОР ================= */
  const PL = SX.planner || {}, STEPS = PL.steps || {}, RES = PL.result || {};
  const flowName = () => (PL.flows && PL.flows[V.planFlow]) ? V.planFlow : 'four';
  const flow = () => PL.flows[flowName()].slice();
  const emptySt = () => ({role: '', tasks: [], goal: '', city: '', volume: '', brand: '', note: ''});
  function savedPlan() {
    const s = local.get(KP);
    if (!s || !s.st || !s.done || Date.now() - (s.t || 0) > 60 * 24 * 3600 * 1000) return null;
    return s;
  }
  const savePlan = (st, done) => local.set(KP, {v: 1, st: st, done: !!done, t: Date.now()});
  const saveDraft = () => { if (UI && !UI.result && (UI.st.tasks || []).length) local.set(KD, {st: UI.st, i: UI.i, t: Date.now()}); };
  const optLabel = (step, id) => { const o = ((STEPS[step] || {}).options || []).find(x => x.id === id); return o ? o.label : ''; };
  const roleSpec = id => { const i = ((STEPS.role || {}).options || []).findIndex(o => o.id === id); return i >= 0 && A.SPECS ? A.SPECS[i] || '' : ''; };

  /* подбор: детерминированный, только из данных сайта (задача → бренды из каталога, товары по пересечению задач, мероприятия по бренду и городу) */
  function compute(st) {
    const tasks = (st.tasks || []).filter(t => T[t]), tb = SX.taskBrands || {}, bs = {};
    tasks.forEach(t => (tb[t] || []).forEach((b, i, arr) => { if (B[b]) bs[b] = (bs[b] || 0) + 2 + (arr.length - i) / (arr.length + 1); }));
    if (st.brand && B[st.brand]) bs[st.brand] = (bs[st.brand] || 0) + 3;
    const brands = Object.keys(bs).sort((a, b) => bs[b] - bs[a] || (a < b ? -1 : 1)).slice(0, 3);
    const goal = st.goal || 'both';
    const cap = goal === 'train' ? 3 : 6, perBrand = 3, cnt = {};
    const scored = (D.products || []).map(p => { const n = (p.ts || []).filter(t => tasks.indexOf(t) >= 0).length; return n ? {p: p, s: n * 3 + (brands.indexOf(p.brand) >= 0 ? 2 : 0) + (p.n ? .5 : 0)} : null; }).filter(Boolean)
      .sort((a, b) => b.s - a.s || (a.p.name < b.p.name ? -1 : 1));
    let pool = scored.filter(x => brands.indexOf(x.p.brand) >= 0); if (pool.length < 2) pool = scored;
    const products = []; pool.forEach(x => { if (products.length >= cap) return; if ((cnt[x.p.brand] = (cnt[x.p.brand] || 0) + 1) > perBrand) return; products.push(x.p); });
    const ecap = goal === 'range' ? 1 : goal === 'train' ? 3 : 2, city = st.city;
    const events = upcoming().map(e => ({e: e, m: brands.indexOf(e.b) >= 0 ? 1 : 0, c: city && (e.city === city) ? 2 : (city && city !== 'Онлайн' && e.city === 'Онлайн') ? 1 : 0}))
      .filter(x => x.m).sort((a, b) => b.c - a.c || (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : 0)).slice(0, ecap).map(x => x.e);
    const tiers = D.sales.discounts || (D.site && D.site.discounts) || [];
    let tier = null; const vi = {'50': 0, '150': 1, '300': 2}[st.volume]; if (vi != null && tiers[vi]) tier = tiers[vi];
    return {st: st, tasks: tasks, brands: brands, products: products, events: events, tiers: tiers, tier: tier, goal: goal};
  }
  function summaryLines(pl) {
    const st = pl.st, L = [];
    if (st.role) L.push('Роль: ' + optLabel('role', st.role));
    L.push('Задачи: ' + pl.tasks.map(t => T[t].label).join(', '));
    if (st.goal) L.push('Цель: ' + optLabel('goal', st.goal));
    if (st.city) L.push('Город: ' + st.city);
    if (st.volume && st.volume !== 'na') L.push('Ориентир по первой закупке: ' + optLabel('volume', st.volume));
    if (st.note) L.push('Комментарий: ' + st.note);
    return L;
  }
  function planText(pl) {
    const L = ['Стартовый подбор с сайта «Астрея»', ''].concat(summaryLines(pl), ['']);
    if (pl.brands.length) L.push('Линейки: ' + pl.brands.map(b => B[b].name).join(', '));
    if (pl.products.length) L.push('Товары: ' + pl.products.map(p => p.name).join('; '));
    if (pl.events.length) L.push('Ближайшие мероприятия: ' + pl.events.map(e => dShort(e.date) + ', ' + e.city + ' — ' + e.title).join('; '));
    return L.join('\n');
  }
  const planRef = pl => ('Стартовый подбор: ' + [pl.st.role ? optLabel('role', pl.st.role) : '', pl.tasks.map(t => T[t].label).join(', ')].filter(Boolean).join(' · ')).slice(0, 280);
  const planRel = st => {
    const q = new URLSearchParams(); if (st.role) q.set('r', st.role); if (st.tasks.length) q.set('t', st.tasks.join(',')); if (st.goal) q.set('g', st.goal); if (st.city) q.set('c', st.city); if (st.volume) q.set('v', st.volume); if (st.brand) q.set('b', st.brand);
    const s = q.toString(); return planPath + (s ? '?' + s : '');
  };
  const planShareUrl = st => {
    if (window.__ASTREYA_BUNDLE) return location.href.split('#')[0] + '#/' + planRel(st);
    try { return new URL(root() + planRel(st), location.href).href; } catch (e) { return planRel(st); }
  };
  function stFromQuery() {
    const q = query(), st = emptySt(); let any = false;
    const r = q.get('r'); if (r && optLabel('role', r)) { st.role = r; any = true; }
    const t = (q.get('t') || '').split(',').filter(x => T[x]).slice(0, (STEPS.tasks || {}).max || 3); if (t.length) { st.tasks = t; any = true; }
    const g = q.get('g'); if (g && optLabel('goal', g)) { st.goal = g; any = true; }
    const c = q.get('c'); if (c && (SX.cities || []).indexOf(c) >= 0) { st.city = c; any = true; }
    const v = q.get('v'); if (v && optLabel('volume', v)) { st.volume = v; any = true; }
    const b = q.get('b'); if (b && B[b]) { st.brand = b; any = true; }
    return any ? st : null;
  }

  /* ---------- диалог со Стеллой: подбор в виде переписки (варианты кнопками или свои слова) ---------- */
  const CH = PL.chat || {}, SYN = CH.syn || {};
  let UI = null;       // состояние открытой страницы подбора
  const delay = ms => new Promise(r => setTimeout(r, Math.max(0, Math.round(ms / speed()))));
  const plain = h => String(h).replace(/<[^>]*>/g, '');
  const avatar = mood => A.pearl ? A.pearl(mood || 'idle', false, '') : '<span class="pc-mono" aria-hidden="true">С</span>';
  const labelOf = (name, v) => name === 'tasks' ? (T[v] || {}).label || v : name === 'city' ? v : optLabel(name, v) || v;
  const answered = name => name === 'tasks' ? UI.st.tasks.length > 0 : !!UI.st[name] || !!UI.skip[name];
  const firstOpen = () => flow().findIndex(n => !answered(n));
  const logEl = () => UI && UI.host ? $('.pchat-log', UI.host) : null;
  const toEnd = () => { const l = logEl(); if (l) l.scrollTo({top: l.scrollHeight, behavior: 'smooth'}); };
  const toEndSoon = () => { toEnd(); requestAnimationFrame(toEnd); setTimeout(toEnd, 260); };
  function bubble(r, html, cls) {
    const l = logEl(); if (!l) return null;
    const row = document.createElement('div'); row.className = 'pc-m pc-' + r + (cls ? ' ' + cls : '');
    row.innerHTML = (r === 'b' ? '<span class="pc-av">' + avatar() + '</span>' : '') + '<div class="pc-bub">' + html + '</div>';
    l.appendChild(row); toEnd(); return row;
  }
  async function say(html, ms) {                 // «Стелла печатает…» → сообщение
    const run = UI.run, l = logEl(); if (!l) return;
    const t = document.createElement('div'); t.className = 'pc-m pc-b pc-typing'; t.setAttribute('role', 'status'); t.setAttribute('aria-label', CH.typing || '');
    t.innerHTML = '<span class="pc-av">' + avatar('think') + '</span><div class="pc-bub"><i></i><i></i><i></i></div>';
    l.appendChild(t); toEnd(); setComp(null);
    await delay(ms != null ? ms : Math.min(1100, 380 + plain(html).length * 8));
    t.remove(); if (!UI || UI.run !== run) return;
    bubble('b', html);
  }
  function progress(n, total) {
    const left = total - n, hint = n === 1 ? 'меньше минуты' : left === 0 ? 'последний вопрос' : 'осталось ' + left + ' ' + plural(left, 'вопрос', 'вопроса', 'вопросов');
    let dots = ''; for (let k = 1; k <= total; k++) dots += '<i class="' + (k < n ? 'done' : k === n ? 'cur' : '') + '"></i>';
    return '<div class="plan-prog" role="progressbar" aria-valuemin="1" aria-valuemax="' + total + '" aria-valuenow="' + n + '" aria-label="Шаг ' + n + ' из ' + total + '"><span class="plan-prog-t">Шаг ' + n + ' из ' + total + ' <em>· ' + hint + '</em></span><span class="plan-dots" aria-hidden="true">' + dots + '</span></div>';
  }
  function paintHead() {
    const h = UI && UI.host ? $('.pchat-prog', UI.host) : null; if (!h) return; const fl = flow();
    h.innerHTML = UI.result ? '<span class="plan-prog-t">План готов</span>' : progress(Math.min(UI.i + 1, fl.length), fl.length);
  }
  function stepOptions(name) {
    if (name === 'tasks') return (D.tasks || []).map(t => ({id: t.id, label: t.label}));
    if (name === 'city') return (SX.cities || []).map(c => ({id: c, label: c}));
    return (STEPS[name] || {}).options || [];
  }
  function chip(kind, o, on, disabled) {
    return '<button class="plan-opt' + (on ? ' on' : '') + '" type="button" role="' + (kind === 'multi' ? 'checkbox' : 'radio') + '" aria-checked="' + (on ? 'true' : 'false') + '"' + (disabled ? ' aria-disabled="true" tabindex="-1"' : '') + ' data-v="' + esc(o.id) + '">' +
      (kind === 'multi' ? '<span class="plan-chk" aria-hidden="true">' + I.check + '</span>' : '') + '<span class="plan-ot"><b>' + esc(o.label) + '</b>' + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span></button>';
  }
  const quick = (act, label, extra) => '<button class="pc-quick' + (extra && extra.fill ? ' fill' : '') + '" type="button" data-pl="' + act + '"' + (extra && extra.v ? ' data-v="' + esc(extra.v) + '"' : '') + '>' + esc(label) + '</button>';
  /* нижняя панель: варианты ответа на текущий вопрос (или быстрые действия) */
  function fitChat() {                           // окно диалога целиком на экране: варианты ответа и поле ввода внизу не прячутся за краем
    if (!UI || UI.fitted) return; UI.fitted = true; const c = $('.pchat', UI.host); if (!c) return; const r = c.getBoundingClientRect();
    if (r.bottom > innerHeight - 6) window.scrollTo({top: Math.max(0, window.scrollY + r.top - 78), behavior: 'smooth'});
  }
  function setComp(name) {
    const c = UI && UI.host ? $('.pchat-comp', UI.host) : null; if (!c) return;
    if (!name) { c.hidden = true; c.innerHTML = ''; c.removeAttribute('data-step'); return; }
    c.hidden = false; c.setAttribute('data-step', name);
    toEndSoon();
    fitChat();
    if (name === 'after') {
      c.innerHTML = '<div class="pc-chips"><span class="pc-chips-l">' + esc(CH.editLabel) + '</span>' + flow().map(n => quick('editstep', (CH.stepNames || {})[n] || n, {v: n})).join('') + quick('again', CH.btnAgain) + '</div>'; return;
    }
    if (name === 'resume') { c.innerHTML = '<div class="pc-chips">' + quick('resume-yes', CH.btnResumeYes, {fill: 1}) + quick('again', CH.btnResumeNo) + '</div>'; return; }
    const S = STEPS[name] || {}, multi = name === 'tasks', st = UI.st, sel = multi ? st.tasks : [st[name]], max = S.max || 3, full = multi && st.tasks.length >= max;
    c.innerHTML = '<div class="plan-opts' + (stepOptions(name).some(o => o.sub) ? ' plan-opts--sub' : '') + '" role="' + (multi ? 'group' : 'radiogroup') + '" aria-label="' + esc(S.q || '') + '">' +
      stepOptions(name).map(o => chip(multi ? 'multi' : 'single', o, sel.indexOf(o.id) >= 0, multi && full && sel.indexOf(o.id) < 0)).join('') + '</div>' +
      '<div class="pc-foot">' + (UI.i > 0 ? '<button class="btn-lnk plan-back" type="button" data-pl="back">' + esc(CH.btnBack) + '</button>' : '<span></span>') + '<span class="pc-foot-r">' +
      (multi ? '<span class="pc-count" aria-live="polite">' + st.tasks.length + ' / ' + max + '</span>' : '') +
      (S.skip ? '<button class="btn-lnk" type="button" data-pl="skip">' + esc(S.skip) + '</button>' : '') +
      (multi ? '<button class="btn btn-fill btn-sm plan-next" type="button" data-pl="next"' + (st.tasks.length ? '' : ' disabled') + '>' + esc(CH.btnDone) + ' ' + I.arrow + '</button>' : '') + '</span></div>';
  }
  function brandTile(b, i) {
    const img = b.logo && A.assetUrl ? A.assetUrl(b.logo) : '';
    return '<span class="plan-btile" style="--c1:' + esc(b.c1) + ';--c2:' + esc(b.c2) + ';--i:' + i + '" title="' + esc(b.name) + '">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(b.name) + '" loading="lazy" decoding="async">' : '<b aria-hidden="true">' + esc(b.name.charAt(0)) + '</b>') + '</span>';
  }
  function boardHTML() {
    const st = UI.st; if (!(st.tasks || []).length) return '';
    const pl = compute(st); if (!pl.brands.length) return '';
    const n = (D.products || []).filter(p => (p.ts || []).some(t => st.tasks.indexOf(t) >= 0)).length;
    return '<p class="pc-lead">' + esc(CH.board) + '</p><div class="plan-board" aria-live="polite"><span class="plan-tiles">' + pl.brands.map((id, i) => brandTile(B[id], i)).join('') + '</span><span class="plan-board-n">' + pl.brands.map(id => esc(B[id].name)).join(', ') + ' · и ещё ' + n + ' ' + plural(n, 'товар', 'товара', 'товаров') + '</span></div>';
  }
  const leftLine = open => open <= 0 ? '' : open === 1 ? CH.left.one : fill(open < 5 ? CH.left.few : CH.left.many, {n: open});
  const knownList = st => { const L = []; if (st.role) L.push(optLabel('role', st.role)); if ((st.tasks || []).length) L.push(st.tasks.map(t => (T[t] || {}).label).filter(Boolean).join(', ')); if (st.goal) L.push(optLabel('goal', st.goal)); if (st.city) L.push(st.city); if (st.volume && st.volume !== 'na') L.push(optLabel('volume', st.volume)); return L.filter(Boolean); };

  /* ----- ход диалога ----- */
  async function ask(i, lead) {
    const run = UI.run, fl = flow(), name = fl[i], S = STEPS[name] || {};
    UI.i = i; saveDraft(); paintHead();
    await say((lead ? '<p class="pc-lead">' + lead + '</p>' : '') + '<p class="pc-q">' + esc(S.q || '') + '</p>' + (S.hint ? '<p class="pc-hint">' + esc(S.hint) + '</p>' : ''));
    if (!UI || UI.run !== run) return;
    setComp(name);
  }
  async function advance(run, lead) {
    if (!UI || UI.run !== run) return;
    const k = firstOpen(); if (k < 0) return complete(run);
    const open = flow().filter(n => !answered(n)).length, left = leftLine(open);
    await ask(k, [lead, left].filter(Boolean).join(' '));
  }
  async function complete(run) {
    await say('<p>' + esc(UI.updated ? CH.updated : CH.ready) + '</p>'); if (!UI || UI.run !== run) return;
    UI.updated = false; finish(); setComp('after');
  }
  const stepTrack = (name, v) => { if (!UI.started) { UI.started = true; track('plan_start', {flow: flowName()}); } track('plan_step', {step: name, value: v || '-'}); };
  async function pick(name, v) {
    const run = ++UI.run; UI.st[name] = v; UI.skip[name] = false; stepTrack(name, v);
    bubble('u', esc(labelOf(name, v))); setComp(null);
    await advance(run, esc((CH.ack || {})[name] || ''));
  }
  async function pickTasks() {
    const run = ++UI.run, st = UI.st; if (!st.tasks.length) return; stepTrack('tasks', st.tasks.join(','));
    bubble('u', esc(st.tasks.map(t => labelOf('tasks', t)).join(', '))); setComp(null);
    const board = boardHTML(); if (board) { await say(board, 700); if (!UI || UI.run !== run) return; }
    await advance(run, esc((CH.ack || {}).tasks || ''));
  }
  async function skip(name) {
    const run = ++UI.run; UI.st[name] = ''; UI.skip[name] = true; stepTrack(name, 'skip'); bubble('u', esc(CH.skipLabel)); setComp(null); await advance(run, '');
  }
  async function back() {
    if (UI.i <= 0) return; const run = ++UI.run; bubble('u', esc(CH.btnBack)); setComp(null); await ask(UI.i - 1, esc(CH.backSay));
  }
  async function editStep(name) {
    const i = flow().indexOf(name); if (i < 0) return; const run = ++UI.run; UI.updated = true; bubble('u', esc(CH.editLabel + ' ' + ((CH.stepNames || {})[name] || name).toLowerCase())); setComp(null); await ask(i, esc(CH.editLead));
  }
  function resetAll(msg) {
    local.del(KP); local.del(KD); UI.st = emptySt(); UI.skip = {}; UI.i = 0; UI.result = false; UI.started = false; UI.updated = false; const res = $('[data-plan-result]', UI.host); if (res) res.innerHTML = ''; const l = logEl(); if (l) l.innerHTML = '';
  }
  async function begin(lead) {
    const run = ++UI.run; paintHead(); setComp(null);
    if (lead === 'hello') { for (const h of CH.hello || []) { await say('<p>' + esc(h) + '</p>'); if (!UI || UI.run !== run) return; } }
    else if (lead) { await say('<p>' + lead + '</p>'); if (!UI || UI.run !== run) return; }
    const k = firstOpen(); if (k < 0) return complete(run);
    await ask(k, '');
  }

  /* ----- свободный ввод: понимаем, что человек имел в виду (роль, задачи, цель, город, объём) ----- */
  function interpret(raw) {
    const t = ' ' + A.norm(raw).replace(/[^a-zа-я0-9\- ]+/g, ' ').replace(/\s+/g, ' ') + ' ', fl = flow(), has = list => (list || []).some(s => t.indexOf(s) >= 0), patch = {};
    if (fl.indexOf('role') >= 0) { const r = Object.keys(SYN.role || {}).find(id => has(SYN.role[id])); if (r) patch.role = r; }
    const tasks = Object.keys(SYN.tasks || {}).filter(id => T[id] && has(SYN.tasks[id]));
    (D.tasks || []).forEach(x => { if (tasks.indexOf(x.id) < 0 && t.indexOf(' ' + A.norm(x.label)) >= 0) tasks.push(x.id); });
    if (tasks.length) patch.tasks = tasks;
    if (fl.indexOf('goal') >= 0) { const tr = has(SYN.goal && SYN.goal.train), rg = has(SYN.goal && SYN.goal.range), both = has(SYN.goal && SYN.goal.both) || (tr && rg); const g = both ? 'both' : tr ? 'train' : rg ? 'range' : ''; if (g) patch.goal = g; }
    if (fl.indexOf('city') >= 0) { const c = Object.keys(SYN.city || {}).find(id => (SX.cities || []).indexOf(id) >= 0 && has(SYN.city[id])); if (c) patch.city = c; }
    if (fl.indexOf('volume') >= 0) {
      const m = /(\d[\d ]*(?:[.,]\d+)?)\s*(тыс|т р|тр|к |k |млн|миллион)?/.exec(' ' + A.norm(raw).replace(/₽|руб[а-я.]*/g, ' ') + ' ');
      if (m) { let n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.')); const u = m[2] || ''; if (/^(тыс|т р|тр|к |k )/.test(u)) n *= 1000; else if (/^(млн|миллион)/.test(u)) n *= 1e6; if (n >= 1000) patch.volume = n < 50000 ? 'u50' : n < 150000 ? '50' : n < 300000 ? '150' : '300'; }
      else if (fl[UI.i] === 'volume' && has(SYN.unknown)) patch.volume = 'na';
    }
    return patch;
  }
  const isQuestion = raw => { const t = ' ' + A.norm(raw) + ' '; return (SYN.question || []).some(s => t.indexOf(s) >= 0); };
  const fmtBrain = tx => esc(String(tx || '').replace(/\[\[[^\]]*\]\]/g, '').replace(/[`#>]/g, '').trim().slice(0, 700)).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n+/g, '<br>');
  async function onText(raw) {
    const text = String(raw || '').trim().slice(0, 400); if (!text || !UI) return;
    const run = ++UI.run, st = UI.st, max = (STEPS.tasks || {}).max || 3; bubble('u', esc(text)); setComp(null);
    let patch = interpret(text), keys = Object.keys(patch);
    if (isQuestion(text) && keys.length === 1 && keys[0] === 'goal') { patch = {}; keys = []; }          // «как проходит доставка заказа?» — это вопрос, а не ответ про цель
    if (keys.length) {
      let many = false;
      if (patch.tasks && patch.tasks.length > max) { patch.tasks = patch.tasks.slice(0, max); many = true; }
      keys.forEach(k => { st[k] = patch[k]; UI.skip[k] = false; stepTrack(k, k === 'tasks' ? patch.tasks.join(',') : patch[k]); });
      track('plan_text', {kind: 'recognized', fields: keys.join(',')});
      const list = keys.map(k => k === 'tasks' ? patch.tasks.map(x => labelOf('tasks', x)).join(', ') : labelOf(k, patch[k])).join('; ');
      if (UI.result) UI.updated = true;
      const board = patch.tasks ? boardHTML() : ''; const lead = esc(fill(CH.understood, {list: list})) + (many ? ' ' + esc(fill(CH.tooMany, {n: max})) : '');
      if (board) { await say('<p>' + lead + '</p>' + board, 900); if (!UI || UI.run !== run) return; return advance(run, ''); }
      return advance(run, lead);
    }
    if (isQuestion(text)) {
      track('plan_text', {kind: 'question'});
      let a = null; try { a = A.assistant && A.assistant.answer ? A.assistant.answer(text) : null; } catch (e) { a = null; }
      const body = a && a.text ? fmtBrain(a.text) : '';
      await say('<p>' + (body || esc(CH.noBrain)) + '</p>'); if (!UI || UI.run !== run) return;
      if (UI.result) return setComp('after');
      return ask(Math.max(0, firstOpen()), esc(CH.backTo));
    }
    track('plan_text', {kind: 'note'});
    st.note = ((st.note ? st.note + '; ' : '') + text).slice(0, 300);
    await say('<p>' + esc(fill(CH.noted, {text: text.length > 90 ? text.slice(0, 90) + '…' : text})) + '</p>'); if (!UI || UI.run !== run) return;
    if (UI.result) { UI.updated = true; return advance(run, ''); }
    const k = firstOpen(); if (k < 0) return complete(run);
    return ask(k, '');
  }

  const shell = () => '<section class="pchat card" aria-label="' + esc(CH.label) + '"><header class="pchat-h"><span class="pchat-av">' + avatar('idle') + '</span><div class="pchat-ht"><b>' + esc(CH.name) + '<span class="pc-n2"> · ' + esc(CH.role) + '</span></b><small><i class="asst-dot" aria-hidden="true"></i><span>' + esc(CH.sub) + '</span></small></div><div class="pchat-prog"></div>' +
    '<button class="btn-lnk pchat-re" type="button" data-pl="again">' + esc(CH.btnAgain) + '</button></header>' +
    '<div class="pchat-log" role="log" aria-live="polite" tabindex="0"></div><div class="pchat-comp" hidden></div>' +
    '<form class="pchat-in" autocomplete="off"><input class="pchat-text" name="t" type="text" maxlength="400" placeholder="' + esc(CH.placeholder) + '" aria-label="' + esc(CH.inputLabel) + '" enterkeyhint="send"><button class="pchat-send" type="submit" aria-label="' + esc(CH.send) + '">' + I.arrow + '</button></form></section><div data-plan-result></div>';

  function renderPlanner(host) {
    const fromQ = stFromQuery(), prev = savedPlan();
    UI = {host: host, st: emptySt(), skip: {}, i: 0, result: false, run: 0, started: false, updated: false};
    host.innerHTML = shell();
    let source = 'new';
    if (fromQ) {
      UI.st = Object.assign(emptySt(), fromQ); source = 'link';
      if (fromQ.brand && !fromQ.tasks.length) UI.st.tasks = ((D.tasks || []).filter(t => (SX.taskBrands[t.id] || []).indexOf(fromQ.brand) >= 0).slice(0, 3)).map(t => t.id);
      const full = UI.st.tasks.length && (fromQ.goal || fromQ.role || fromQ.city);
      if (full) { UI.result = true; paintHead(); finishView(); bubble('b', '<p>' + esc(CH.linked) + '</p>'); setComp('after'); }
      else { const kn = knownList(UI.st); begin(kn.length ? esc(fill(CH.known, {list: kn.join('; ')})) : ''); }
    } else if (prev) {
      UI.st = Object.assign(emptySt(), prev.st); UI.result = true; source = 'saved'; paintHead(); finishView(); bubble('b', '<p>' + esc(CH.saved) + '</p>'); setComp('after');
    } else {
      const dr = local.get(KD);
      if (dr && dr.st && Date.now() - (dr.t || 0) < 7 * 24 * 3600 * 1000 && (dr.st.tasks || []).length) {
        UI.st = Object.assign(emptySt(), dr.st); UI.i = Math.min(+dr.i || 0, flow().length - 1); source = 'draft'; paintHead();
        bubble('b', '<p>' + esc(CH.resume) + '</p><p class="pc-lead">' + esc(knownList(UI.st).join('; ')) + '</p>'); setComp('resume');
      } else begin('hello');
    }
    track('sales_planner_view', {source: source});
  }
  function finishView() {        // план рисуется под диалогом
    const res = $('[data-plan-result]', UI.host); if (res) res.innerHTML = resultHTML();
  }
  function resultHTML() {
    const pl = compute(UI.st), st = pl.st, goal = pl.goal;
    const chips = summaryLines(pl).map(l => '<li>' + esc(l) + '</li>').join('');
    const brandsH = pl.brands.length ? '<section class="plan-sec"><h3>' + esc(RES.brandsTitle) + '</h3><div class="plan-brands">' + pl.brands.map(id => {
      const b = B[id], why = pl.tasks.filter(t => ((SX.taskBrands || {})[t] || []).indexOf(id) >= 0).map(t => T[t].label);
      return link(bUrl(b), 'plan-brand', '<span class="plan-bsw" style="--c1:' + esc(b.c1) + ';--c2:' + esc(b.c2) + '" aria-hidden="true"></span><span><b>' + esc(b.name) + '</b>' + (why.length ? '<small>' + esc(why.join(', ')) + '</small>' : '') + '</span>' + I.arrow, 'plan-brand');
    }).join('') + '</div></section>' : '';
    const prodH = pl.products.length ? '<section class="plan-sec"><h3>' + esc(RES.productsTitle) + '</h3><ul class="plan-prods">' + pl.products.map(p => {
      const b = B[p.brand] || {name: ''}, inList = A.rlHas && A.rlHas(p.id);
      return '<li>' + link(pUrl(p), 'plan-pn', '<b>' + esc(p.name) + '</b><small>' + esc(b.name) + '</small>', 'plan-product') +
        (X.requestList ? '<button class="plan-add" type="button" data-act="rl-add" data-id="' + esc(p.id) + '" data-rl-id="' + esc(p.id) + '" aria-pressed="' + (inList ? 'true' : 'false') + '" aria-label="Добавить в список запроса: ' + esc(p.name) + '">' + PLUS + '</button>' : '') + '</li>';
    }).join('') + '</ul></section>' : '<section class="plan-sec"><p class="muted">' + esc(RES.empty) + '</p></section>';
    const evH = '<section class="plan-sec"><h3>' + esc(RES.trainTitle) + '</h3>' + (pl.events.length ? '<ul class="plan-evs">' + pl.events.map(e => {
      const b = B[e.b] || {name: ''};
      return '<li><div class="plan-ed"><b>' + esc(dShort(e.date)) + '</b><small>' + esc(e.city) + '</small></div><div class="plan-et">' + link(evUrl(e), 'plan-en', esc(e.title), 'plan-event') + '<small>' + esc(b.name) + ' · ' + esc(e.fm || '') + '</small></div>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-pl="signup" data-id="' + esc(e.id) + '">Записаться</button></li>';
    }).join('') + '</ul>' : '<p class="muted">' + esc(RES.trainNone) + '</p>') + '</section>';
    const tiersH = '<section class="plan-sec"><h3>' + esc(RES.termsTitle) + '</h3><p class="muted">' + esc(RES.termsText) + '</p><div class="plan-tiers">' + pl.tiers.map((d, k) => '<div class="plan-tier' + (pl.tier && pl.tier === d ? ' on' : '') + '"><b>' + d.pct + '%</b><span>от ' + rub(d.from) + '</span></div>').join('') + '</div>' +
      (pl.tier ? '<p class="plan-tn">При закупке от ' + rub(pl.tier.from) + ' — ориентировочно ' + pl.tier.pct + '%. Точные условия подтверждает менеджер.</p>' : st.volume === 'u50' ? '<p class="plan-tn">Скидки по объёму начинаются от ' + rub((pl.tiers[0] || {}).from || 0) + '. Условия первой закупки уточнит менеджер.</p>' : '') + '</section>';
    const order = goal === 'train' ? [evH, brandsH, prodH, tiersH] : goal === 'range' ? [brandsH, prodH, evH, tiersH] : [brandsH, evH, prodH, tiersH];
    return '<div class="plan-res"><div class="plan-card card"><span class="eyebrow in">' + esc(PL.eyebrow || '') + '</span><h2 id="plan-h" tabindex="-1">' + esc(RES.title) + '</h2><ul class="plan-sum">' + chips + '</ul><p class="plan-fine muted">' + esc(RES.fine) + '</p></div>' +
      order.join('') +
      '<div class="plan-cta card"><button class="btn btn-fill btn-lg plan-main" type="button" data-pl="main" data-sx="plan-main">' + esc(RES.main) + ' ' + I.arrow + '</button><p class="plan-mainfine muted">' + esc(RES.mainFine) + '</p>' +
      '<div class="plan-sec-actions">' + (X.requestList && pl.products.length ? '<button class="btn btn-ghost" type="button" data-pl="addall">' + esc(RES.addList) + '</button>' : '') +
      '<button class="btn btn-ghost" type="button" data-pl="copy">' + esc(RES.copyLink) + '</button>' + (A.stella ? '<button class="btn btn-ghost" type="button" data-pl="ask">' + esc(RES.ask) + '</button>' : '') +
      '<button class="btn btn-lnk" type="button" data-pl="again">' + esc(RES.restart) + '</button></div></div></div>';
  }
  function finish() {
    UI.result = true; savePlan(UI.st, true); local.del(KD); const pl = compute(UI.st);
    track('plan_result', {tasks: pl.tasks.join(','), goal: pl.goal, role: UI.st.role, city: UI.st.city, products: pl.products.length, events: pl.events.length, flow: flowName()});
    finishView(); paintHead(); document.dispatchEvent(new CustomEvent('astreya:plan', {detail: {done: true}}));
    const res = $('[data-plan-result]', UI.host); if (res) setTimeout(() => { const r = res.getBoundingClientRect(); if (r.top > innerHeight * .55) window.scrollTo({top: Math.max(0, window.scrollY + r.top - 96), behavior: 'smooth'}); }, Math.round(450 / speed()));
  }
  function onPlanClick(e) {
    const t = e.target.closest && e.target.closest('[data-pl], .plan-opt'); if (!t || !UI || !UI.host || !UI.host.contains(t)) return;
    const comp = $('.pchat-comp', UI.host), name = comp ? comp.getAttribute('data-step') : '';
    if (t.classList.contains('plan-opt')) {
      if (t.getAttribute('aria-disabled') === 'true' || !name) return;
      const v = t.getAttribute('data-v'), st = UI.st;
      if (name === 'tasks') {
        const k = st.tasks.indexOf(v); if (k >= 0) st.tasks.splice(k, 1); else if (st.tasks.length < ((STEPS.tasks || {}).max || 3)) st.tasks.push(v);
        setComp('tasks'); const re = $('.plan-opt[data-v="' + v + '"]', UI.host); if (re) re.focus({preventScroll: true}); return;
      }
      pick(name, v); return;
    }
    const act = t.getAttribute('data-pl');
    if (act === 'back') back();
    else if (act === 'next') pickTasks();
    else if (act === 'skip') skip(name);
    else if (act === 'editstep') editStep(t.getAttribute('data-v'));
    else if (act === 'resume-yes') { const run = ++UI.run; bubble('u', esc(CH.btnResumeYes)); setComp(null); advance(run, ''); }
    else if (act === 'again') { track('plan_restart'); resetAll(); begin(esc(CH.againSay)); }
    else if (act === 'main') { const pl = compute(UI.st); track('plan_cta', {tasks: pl.tasks.join(','), goal: pl.goal}); setVia('plan-main'); A.openForm('plan', planRef(pl)); }
    else if (act === 'signup') { track('plan_signup', {event: t.getAttribute('data-id')}); setVia('plan-event'); A.openForm('seminar', t.getAttribute('data-id')); }
    else if (act === 'addall') { const pl = compute(UI.st), n = A.rlAdd ? A.rlAdd(pl.products.map(p => p.id)) : 0; track('plan_list_add', {added: n}); if (A.toast) A.toast(n ? 'В списке запроса: добавлено ' + n + ' ' + plural(n, 'товар', 'товара', 'товаров') : 'Эти товары уже в списке запроса'); finishView(); }
    else if (act === 'copy') {
      const url = planShareUrl(UI.st), done = () => A.toast && A.toast('Ссылка на план скопирована');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => { A.toast && A.toast(url); }); else { A.toast && A.toast(url); }
      track('plan_share');
    }
    else if (act === 'ask') { const pl = compute(UI.st); track('plan_ask_stella'); if (A.stella) A.stella.ask('Объясни мой стартовый план: ' + summaryLines(pl).join('; ') + '. Что в нём главное и с чего начать?', {sales: true}); }
  }
  document.addEventListener('click', onPlanClick);
  document.addEventListener('submit', e => {
    const f = e.target; if (!f || !f.classList || !f.classList.contains('pchat-in') || !UI || !UI.host || !UI.host.contains(f)) return;
    e.preventDefault(); const inp = f.elements.t, v = inp ? inp.value : ''; if (inp) inp.value = ''; onText(v);
  });
  document.addEventListener('astreya:form-open', e => {
    const d = e.detail || {}; if (d.type !== 'plan' || !d.form) return;
    const s = savedPlan() || (UI && UI.result ? {st: UI.st} : null); if (!s) return;
    const pl = compute(s.st), f = d.form;
    if (f.elements.msg && !f.elements.msg.value) { f.elements.msg.value = planText(pl); if (A.autosize) A.autosize(f.elements.msg); }
    if (f.elements.city && !f.elements.city.value && pl.st.city && pl.st.city !== 'Онлайн') f.elements.city.value = pl.st.city;
    if (f.elements.spec && !f.elements.spec.value && pl.st.role && roleSpec(pl.st.role)) f.elements.spec.value = roleSpec(pl.st.role);
  });

  /* ================= ДОК-ПАНЕЛЬ «СЛЕДУЮЩИЙ ШАГ» ================= */
  const BR = SX.bar || {}, BP = BR.pages || {};
  let bar = null, shownOnPage = false, armed = false, dwellT = 0, io = null, blockers = {footer: false, sec: false, form: false}, rafT = 0, model = null, ctxCache = null;
  const typeOf = k => ({product: 'product', brand: 'brand', event: 'event', training: 'training', partners: 'partners', catalog: 'catalog'}[k] || 'default');
  function ctxOf() {
    const key = pageKey(), main = $('#main') || document, c = {key: key, type: typeOf(key)};
    const pe = $('.p-page[data-product]', main); if (pe) c.product = P[pe.getAttribute('data-product')] || null;
    const be = $('[data-brand-page]', main); if (be) c.brand = B[be.getAttribute('data-brand-page')] || null; else if (c.product) c.brand = B[c.product.brand] || null;
    const ee = $('[data-event]', main); if (ee) { c.event = EV[ee.getAttribute('data-event')] || null; if (c.event && !c.brand) c.brand = B[c.event.b] || null; }
    return c;
  }
  function barModel(c) {
    const t = c.type, d = BP[t] || BP['default'] || {}, v = {product: c.product ? c.product.name : '', brand: c.brand ? c.brand.name : ''};
    if (t === 'product') { if (!c.product) return null; return {text: fill(d.text, v), kind: 'form', form: 'product', ref: c.product.id, cta: ctaLabel(), link: X.requestList ? {label: d.link, id: c.product.id} : null, fine: true}; }
    if (t === 'brand') { const ev = c.brand && nextEvent(c.brand.id); return ev ? {text: fill(d.text, {brand: v.brand, date: dShort(ev.date), city: ev.city}), kind: 'link', path: evUrl(ev), cta: d.cta} : {text: fill(d.textNone, v), kind: 'link', path: planPath + (c.brand ? '?b=' + c.brand.id : ''), cta: d.ctaNone}; }
    if (t === 'event') { const e = c.event; if (!e || e.date < today()) return null; const n = daysTo(e.date), when = n <= 0 ? 'сегодня' : n === 1 ? 'завтра' : fill(d.days, {days: n + ' ' + plural(n, 'день', 'дня', 'дней')}); return {text: fill(d.text, {date: dShort(e.date), city: e.city, fmt: e.fm || ''}) + ' · ' + when, kind: 'form', form: 'seminar', ref: e.id, cta: d.cta, fine: true}; }
    if (t === 'training') { const e = nextEvent(); return e ? {text: fill(d.text, {date: dShort(e.date), city: e.city}), kind: 'form', form: 'seminar', ref: e.id, cta: d.cta, fine: true} : null; }
    if (t === 'catalog') { const s = savedPlan(); if (s) { const n = compute(s.st).products.length; if (n) return {text: fill(d.textPlan, {n: n, nword: plural(n, 'товар', 'товара', 'товаров')}), kind: 'link', path: planRel(s.st), cta: d.ctaPlan}; } return {text: d.text, kind: 'link', path: planPath, cta: d.cta}; }
    if (t === 'partners') return {text: d.text, kind: 'scroll', sel: '#form', cta: d.cta, fine: true};
    const dd = BP['default'] || {}; return {text: dd.text, kind: 'link', path: planPath, cta: dd.cta};
  }
  function barEl() {
    if (bar && bar.isConnected) return bar;
    bar = document.createElement('div'); bar.id = 'sx-bar'; bar.className = 'sx-bar'; bar.hidden = true; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Следующий шаг');
    bar.addEventListener('click', onBarClick); A.dock().appendChild(bar); return bar;
  }
  function paintBar() {
    const el = barEl(), m = model; if (!m) return;
    const style = narrow() ? V.barStyle : 'pill';
    el.className = 'sx-bar sx-bar--' + style;
    const cta = m.kind === 'link' ? link(m.path, 'btn btn-fill btn-sm sx-bar-cta', esc(m.cta) + ' ' + I.arrow, 'bar') : '<button class="btn btn-fill btn-sm sx-bar-cta" type="button" data-sx="bar" data-bar="' + m.kind + '">' + esc(m.cta) + ' ' + I.arrow + '</button>';
    const lk = m.link ? '<button class="sx-bar-link" type="button" data-sx="bar-list" data-bar="list" data-id="' + esc(m.link.id) + '">' + esc(m.link.label) + '</button>' : '';
    el.innerHTML = '<div class="sx-bar-tx"><p class="sx-bar-t">' + esc(m.text) + '</p>' + (m.fine && BR.fine ? '<small class="sx-bar-f">' + esc(BR.fine) + '</small>' : '') + '</div><div class="sx-bar-a">' + lk + cta + '</div><button class="sx-bar-x" type="button" data-bar="x" aria-label="Закрыть">' + I.close + '</button>';
  }
  function onBarClick(e) {
    const t = e.target.closest('[data-bar]'); if (!t) return;
    const k = t.getAttribute('data-bar'), m = model;
    if (k === 'x') { sess.set(KB, 1); track('sales_bar_dismiss', {page: pageKey()}); hideBar(); return; }
    if (k === 'list') { if (A.actions && A.actions['rl-add']) A.actions['rl-add'](t, t.getAttribute('data-id')); return; }
    track('sales_bar_click', {page: pageKey(), kind: k, exp: assigned()});
    if (!m) return;
    if (k === 'form') A.openForm(m.form, m.ref);
    else if (k === 'scroll') { const f = $(m.sel); if (f) f.scrollIntoView({behavior: 'smooth', block: 'start'}); }
  }
  function barBlocked() {
    const b = document.body;
    if (b.classList.contains('menu-open') || b.classList.contains('search-open') || b.classList.contains('locked') || b.classList.contains('asst-open')) return true;
    const sp = $('#g-spot'); if (sp && !sp.hidden) return true;
    if (sess.get('astreya:g-tour')) return true;
    const d = A.dock(); if ($('#rl-bar:not([hidden])', d) || $('#cmp-bar:not([hidden])', d)) return true;
    return blockers.footer || blockers.sec || blockers.form;
  }
  function barDevice() { if (narrow()) return true; return A.exp('barDesktop') === 'pill'; }
  function reflow() {
    rafT = 0; if (!armed) return;
    const el = bar; if (!model) { if (el && !el.hidden) hideBar(); return; }
    const y = window.scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight), due = shownOnPage || y / max >= (BR.scrollPct || .3) || dwellDone;
    if (sess.get(KB) || !due) { if (el && !el.hidden && sess.get(KB)) hideBar(); return; }
    if (barBlocked()) { if (el && !el.hidden) hideBar(); return; }
    if (!barDevice()) return;
    showBar();
  }
  let dwellDone = false;
  function showBar() {
    const el = barEl(); if (!model) return;
    if (!shownOnPage) { paintBar(); shownOnPage = true; track('sales_bar_show', {page: pageKey(), exp: assigned(), style: el.className.replace(/.*sx-bar--(\w+).*/, '$1')}); }
    if (el.hidden) { el.hidden = false; A.dockUpdate(); }
  }
  function hideBar() { if (bar && !bar.hidden) { bar.hidden = true; A.dockUpdate(); } }
  const schedule = () => { if (!rafT) rafT = requestAnimationFrame(reflow); };
  function barArm() {
    clearTimeout(dwellT); if (io) { io.disconnect(); io = null; } blockers = {footer: false, sec: false, form: false};
    shownOnPage = false; dwellDone = false; armed = false; ctxCache = ctxOf(); model = barModel(ctxCache); hideBar();
    if (!model || sess.get(KB)) return;
    armed = true;
    dwellT = setTimeout(() => { dwellDone = true; schedule(); }, Math.round((BR.dwellSec || 12) * 1000 / speed()));
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(es => { es.forEach(en => { const k = en.target.getAttribute('data-sx-watch'); if (!k) return; if (k.indexOf('own') === 0) { const o = io.__own; en.isIntersecting ? o.add(k) : o.delete(k); blockers.sec = o.size > 0; } else blockers[k] = en.isIntersecting; }); schedule(); }, {threshold: 0.12});
      const ft = $('footer'), form = ctxCache.type === 'partners' ? $('#form') : null;
      if (ft) { ft.setAttribute('data-sx-watch', 'footer'); io.observe(ft); } if (form) { form.setAttribute('data-sx-watch', 'form'); io.observe(form); }
      /* свои призывы страницы (модули слоя и завершающий блок) важнее панели: пока один из них на экране, панель уступает место */
      const own = new Set(); $$('[data-sx-mod], .cta-band[data-sx-closing]').forEach((el, k) => { el.setAttribute('data-sx-watch', 'own' + k); io.observe(el); });
      io.__own = own;
    }
    schedule();
  }
  window.addEventListener('scroll', schedule, {passive: true}); window.addEventListener('resize', () => { schedule(); if (bar && !bar.hidden && model) paintBar(); });
  new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['class']});
  document.addEventListener('astreya:rl', schedule);
  document.addEventListener('astreya:plan', () => { if (armed) { model = barModel(ctxOf()); if (bar && !bar.hidden) paintBar(); } });
  document.addEventListener('visibilitychange', schedule);
  (function watchDock() { const d = A.dock(); new MutationObserver(schedule).observe(d, {childList: true, attributes: true, subtree: true, attributeFilter: ['hidden']}); })();

  /* ================= «ЧТО ДАЛЬШЕ» ПОСЛЕ ЗАЯВКИ ================= */
  A.afterForm = function (form, ok, mode) {
    if (mode !== 'sent') return;
    const type = form.getAttribute('data-form'), c = (SX.afterForm || {})[type]; if (!c) return;
    const box = document.createElement('div'); box.className = 'sx-after'; box.setAttribute('data-sx-after', type);
    box.innerHTML = '<b>' + esc(c.t) + '</b><p>' + esc(c.p) + '</p>' + link(c.href, 'btn btn-ghost btn-sm', esc(c.cta) + ' ' + I.arrow, 'after-' + type);
    const row = $('.row', ok); if (row) ok.insertBefore(box, row); else ok.appendChild(box);
    track('sales_after_view', {form_type: type});
  };

  /* ================= общие помощники для модулей страниц (js/sales-pages.js) ================= */
  const kit = {A: A, D: D, SX: SX, I: I, esc: esc, $: $, $$: $$, track: track, fill: fill, plural: plural, rub: rub, local: local, sess: sess, root: root, href: href, link: link, upcoming: upcoming, nextEvent: nextEvent,
    dShort: dShort, dFull: dFull, daysTo: daysTo, evUrl: evUrl, pUrl: pUrl, bUrl: bUrl, P: P, B: B, T: T, EV: EV, planPath: planPath, planRel: planRel, savedPlan: savedPlan, compute: compute, summaryLines: summaryLines,
    planText: planText, setVia: setVia, ctaLabel: ctaLabel, PLUS: PLUS, narrow: narrow, speed: speed, today: today,
    whenText: (n, c) => n <= 0 ? c['0'] : n === 1 ? c['1'] : fill(c.n, {days: n + ' ' + plural(n, 'день', 'дня', 'дней')}),
    city: () => { const c = local.get(KC); if (c) return c; const s = savedPlan(); return s && s.st && s.st.city && s.st.city !== 'Онлайн' ? s.st.city : ''; },
    setCity: c => { if (c) local.set(KC, c); else local.del(KC); }};
  document.addEventListener('astreya:plan', () => { const s = savedPlan(); if (s && s.st && s.st.city && s.st.city !== 'Онлайн' && !local.get(KC)) local.set(KC, s.st.city); });

  /* ================= публичный интерфейс (для Стеллы и проверок) ================= */
  A.sales = {
    plan: () => { const s = savedPlan(); if (!s) return null; const pl = compute(s.st); return {state: s.st, text: planText(pl), summary: summaryLines(pl), brands: pl.brands, products: pl.products.map(p => p.id), events: pl.events.map(e => e.id)}; },
    compute: compute, planText: planText, exp: A.exp, ctaLabel: ctaLabel, path: planPath,
    excluded: key => EXCL.has(key || pageKey()),
    kit: kit,          // общие помощники для модулей страниц
    state: () => ({armed: armed, shown: shownOnPage, dwell: dwellDone, model: !!model, blocked: barBlocked(), blockers: Object.assign({}, blockers), dismissed: !!sess.get(KB), device: barDevice()})          // для проверок: почему панель показана или скрыта
  };

  /* ================= страница ================= */
  let lastTok = null;
  function init() {
    const key = pageKey(), main = $('#main'), tok = main && main.firstElementChild;
    if (tok && tok === lastTok) return;                                  // эту страницу уже оформили (initPage может вызываться повторно)
    lastTok = tok;
    const host = $('[data-plan-app]');
    if (key === 'start' && host) { armed = false; clearTimeout(dwellT); hideBar(); renderPlanner(host); return; }
    if (EXCL.has(key)) { armed = false; clearTimeout(dwellT); hideBar(); return; }
    const c = ctxOf();
    if (A.salesPages && A.salesPages.mount) { try { A.salesPages.mount(c); } catch (e) { track('sales_error', {page: key, message: String(e && e.message || e)}); } }          // свой ход у каждой страницы (js/sales-pages.js)
    if (BAR_EXCL.has(key)) { armed = false; clearTimeout(dwellT); hideBar(); }
    else barArm();
    track('sales_page', {page: key, type: c.type});
  }
  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
