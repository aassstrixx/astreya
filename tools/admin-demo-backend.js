/* Демо-«сервер» для админки в одном HTML-файле (tools/admin-demo.js): подменяет fetch для адресов /api/* и отвечает из данных, встроенных в файл.
   Правки живут только в открытой вкладке (перезагрузка возвращает исходные данные) и сайт не меняют. Пересборка, проверка и публикация сайта доступны
   только с настоящим сервером (node server/index.js) — здесь на них честный ответ «недоступно в демо». Данные: window.__DEMO = {data, summary, files, pages, blocks}. */
(function () {
  'use strict';
  const D = window.__DEMO, B = D.blocks, clone = v => JSON.parse(JSON.stringify(v));
  const now = () => new Date().toISOString(), ago = h => new Date(Date.now() - h * 3600e3).toISOString();
  const STATUSES = {new: 'Новая', in_work: 'В работе', done: 'Обработана', spam: 'Спам', archived: 'В архиве'};
  const TYPES = {partner: 'Партнёрство', seminar: 'Запись на мероприятие', product: 'Запрос по товару', question: 'Вопрос', contact: 'Контакты'};
  const ROLES = {admin: 'Администратор', manager: 'Менеджер (только заявки)'};
  const DEMO_ONLY = 'Это демонстрационная версия админки в одном файле: сайт здесь не пересобирается и не публикуется. Запустите админку с сервером (node server/index.js) — там это работает по-настоящему.';
  let ver = 1; const nextVer = () => 'demo' + (++ver);

  /* ---------- хранилище разделов ---------- */
  const store = {}; Object.keys(D.data).forEach(k => { store[k] = {data: clone(D.data[k]), version: 'demo1', hist: []}; });
  const meta = Object.fromEntries(D.summary.map(c => [c.name, c]));
  const countOf = n => { const c = meta[n], d = store[n].data; return c.kind === 'array' ? d.length : c.list ? (d[c.list] || []).length : null; };
  const summary = () => D.summary.map(c => Object.assign({}, c, {count: countOf(c.name)}));
  const audit = []; const log = (action, detail) => audit.unshift({t: now(), who: 'admin', action, detail: detail || ''});
  log('login', 'вход');

  /* ---------- проверки (те же правила, что на сервере, в упрощённом виде) ---------- */
  const isStr = v => typeof v === 'string' && v.trim() !== '';
  const slugOk = v => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), dateOk = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'));
  const pageSet = () => new Set((store.pages.data.items || []).filter(p => p.published !== false).map(p => 'pages/' + p.slug + '.html'));
  const siteFile = f => D.pages.some(p => p.path === f) || pageSet().has(f);
  function problems(name, data) {
    const P = [];
    if (meta[name].kind === 'array' && !Array.isArray(data)) return ['Ожидается список.'];
    if (meta[name].kind === 'object' && (typeof data !== 'object' || data === null || Array.isArray(data))) return ['Ожидается объект.'];
    const uniq = (arr, key, what) => { const seen = new Set(); arr.forEach((x, i) => { const v = x && x[key]; if (!isStr(v)) P.push(`${what} №${i + 1}: не заполнено «${key}».`); else if (seen.has(v)) P.push(`${what}: повтор «${key}» = ${v}.`); else seen.add(v); }); };
    if (name === 'products') {
      uniq(data, 'id', 'Товар'); uniq(data, 'slug', 'Товар'); const brands = new Set(store.brands.data.map(b => b.id)), cat = store.catalog.data;
      data.forEach(p => { const w = `Товар «${p.name || p.id}»`; if (!isStr(p.name)) P.push(`${w}: нет названия.`); if (!isStr(p.desc)) P.push(`${w}: нет краткого описания.`); if (isStr(p.slug) && !slugOk(p.slug)) P.push(`${w}: адрес (slug) — только строчные латинские буквы, цифры и дефисы.`);
        if (!brands.has(p.brand)) P.push(`${w}: неизвестный бренд «${p.brand}».`); if (!cat.cats.some(c => c.id === p.cat)) P.push(`${w}: неизвестная категория «${p.cat}».`); if (!cat.kinds.some(k => k.id === p.kind)) P.push(`${w}: неизвестный тип «${p.kind}».`);
        if (p.image && !/^assets\/[\w\-./]+\.(png|jpe?g|webp|gif)$/i.test(p.image)) P.push(`${w}: фото — файл PNG, JPG, WebP или GIF из папки assets/.`); });
      const text = n => JSON.stringify(store[n].data); store.products.data.filter(o => !data.some(p => p.id === o.id)).forEach(o => { for (const [n, what] of [['news', 'Новости и акции'], ['redesign', 'Главная и оформление']]) if (text(n).includes('"' + o.id + '"')) { P.push(`Товар «${o.name}» нельзя удалить: на него ссылается раздел «${what}». Сначала уберите ссылку.`); break; } });
    } else if (name === 'brands') { uniq(data, 'id', 'Бренд'); data.forEach(b => { if (!isStr(b.name)) P.push(`Бренд «${b.id}»: нет названия.`); });
      if (store.products.data.some(p => !data.some(b => b.id === p.brand))) P.push('Есть товары, у которых бренд удалён из списка: сначала смените бренд у товаров.');
    } else if (name === 'events') { uniq(data, 'id', 'Мероприятие'); uniq(data, 'slug', 'Мероприятие'); data.forEach(e => { if (!isStr(e.title)) P.push(`Мероприятие «${e.id}»: нет названия.`); if (!dateOk(e.date)) P.push(`Мероприятие «${e.title || e.id}»: дата — формат ГГГГ-ММ-ДД.`); });
    } else if (name === 'news') { if (!Array.isArray(data.items)) return ['Нужен список «items».']; uniq(data.items, 'slug', 'Новость'); data.items.forEach(n => { if (!isStr(n.title)) P.push(`Новость «${n.slug}»: нет заголовка.`); if (!dateOk(n.date)) P.push(`Новость «${n.title || n.slug}»: дата — формат ГГГГ-ММ-ДД.`); });
    } else if (name === 'pages') {
      if (!Array.isArray(data.items)) return ['Нужен список «items».']; B.pageProblems(data.items).forEach(x => P.push(x));
      const files = new Set(data.items.filter(p => p && p.published !== false).map(p => 'pages/' + p.slug + '.html')), ok = h => { const f = String(h).split('#')[0]; return !f || files.has(f) || D.pages.some(p => p.path === f); };
      data.items.forEach(p => (p.blocks || []).forEach((b, j) => { const w = `Страница «${p.title || p.slug}», блок ${j + 1}`; [b.href, ...(b.items || []).map(i => i && i.href)].forEach(h => { if (h && !/^(https?:|tel:|mailto:|#)/.test(h) && !ok(h)) P.push(`${w}: ссылка «${h}» ведёт на несуществующую страницу.`); }); }));
    } else if (name === 'menu') {
      if (!Array.isArray(data.nav)) return ['Нужен список «nav».']; if (data.nav.length < 2 || data.nav.length > 9) P.push('В меню от 2 до 9 пунктов.'); const seen = new Set();
      data.nav.forEach((i, n) => { const w = `Пункт меню №${n + 1}`; if (!i || !isStr(i.title) || i.title.length > 24) P.push(`${w}: подпись — до 24 символов.`); if (!i || !isStr(i.href) || !siteFile(i.href)) P.push(`${w}: страницы «${i && i.href}» нет на сайте.`); else if (seen.has(i.href)) P.push(`${w}: страница «${i.href}» уже есть в меню.`); else seen.add(i.href); });
    } else if (name === 'site') { const e = data.contacts && data.contacts.email; if (!isStr(e) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) P.push('Контакты: нужен корректный e-mail.'); }
    return P;
  }
  const httpErr = (status, error, extra) => Object.assign(new Error(error), {status, body: Object.assign({error}, extra || {})});

  function save(name, data, version) {
    const st = store[name]; if (!st) throw httpErr(404, 'Неизвестный раздел.');
    if (version && version !== st.version) throw httpErr(409, 'Эти данные уже изменил кто-то другой. Обновите страницу и повторите правку.');
    const pr = problems(name, data); if (pr.length) throw httpErr(422, 'Данные не сохранены: ' + pr.slice(0, 8).join(' '), {problems: pr});
    if (JSON.stringify(st.data) === JSON.stringify(data)) return {ok: true, unchanged: true, version: st.version, build: null};
    st.hist.unshift({id: now().replace(/[:.]/g, '-'), at: now(), who: 'admin', data: st.data}); st.hist = st.hist.slice(0, 30); st.data = clone(data); st.version = nextVer(); log('content', name);
    return {ok: true, version: st.version, backup: st.hist[0].id, build: null};
  }

  /* ---------- заявки ---------- */
  const NAMES = [['Мария Иванова', 'partner', 'Самара', 'Клиника «Роза»', 'Интересует сотрудничество и обучение специалистов, просим связаться.'], ['Алексей Петров', 'product', 'Казань', 'Кабинет «Фея»', 'Нужна информация по Elastense: объём, условия поставки.'], ['Ольга Смирнова', 'seminar', 'Москва', '', 'Хочу записаться на осенний семинар по фотозащите.'], ['Дмитрий Кузнецов', 'question', 'Новосибирск', 'Салон «Лотос»', 'Есть ли сертификаты на пилинги Dermatime?'], ['Елена Соколова', 'partner', 'Краснодар', 'Студия красоты «Лидер»', 'Хотим стать партнёрами, какие условия по скидкам?'], ['Иван Попов', 'product', 'Екатеринбург', 'Клиника «Аврора»', 'Запрос по линейке Heliocare для сезона.'], ['Наталья Лебедева', 'seminar', 'Симферополь', '', 'Запись на вебинар по трихологии Iraltone.'], ['Сергей Козлов', 'question', 'Воронеж', '', 'Подскажите, где купить продукцию в нашем городе?'], ['Анна Новикова', 'partner', 'Ростов-на-Дону', 'Центр эстетики «Грация»', 'Рассматриваем бренд Keenwell для кабинета.'], ['Павел Морозов', 'product', 'Уфа', 'Клиника «Здоровье»', 'Интересует аппаратное решение EVA.']];
  const leads = NAMES.map((n, i) => ({id: 'L' + (100 + i), n: 100 + i, created_at: ago(i * 7 + 1), status: i === 3 ? 'in_work' : i === 6 ? 'done' : 'new', type: n[1], name: n[0], phone: '+7 916 555-44-' + String(30 + i), email: 'user' + i + '@example.com', city: n[2], org: n[3], spec: i % 2 ? 'Косметолог' : 'Руководитель', context: n[1] === 'product' ? 'Elastense' : n[1] === 'seminar' ? 'Осенний семинар' : '', msg: n[4], page: '', notes: i === 3 ? [{t: ago(2), who: 'admin', text: 'Отправили сертификаты на почту.'}] : [], history: [{t: ago(i * 7 + 1), who: 'сайт', action: 'created', detail: ''}], duplicates: 0, flags: [], spam_reasons: []}));
  const leadItem = x => ({id: x.id, n: x.n, created_at: x.created_at, status: x.status, type: x.type, name: x.name, phone: x.phone, email: x.email, city: x.city, org: x.org, context: x.context, msg: x.msg.slice(0, 140), notes: x.notes.length, duplicates: x.duplicates || 0, flags: x.flags || [], spam_reasons: x.spam_reasons || []});
  const leadStats = () => { const t = Date.now(), by = f => leads.reduce((m, x) => { m[x[f]] = (m[x[f]] || 0) + 1; return m; }, {}); return {total: leads.length, new: leads.filter(x => x.status === 'new').length, today: leads.filter(x => t - Date.parse(x.created_at) < 864e5).length, week: leads.filter(x => t - Date.parse(x.created_at) < 6048e5).length, byStatus: by('status'), byType: by('type')}; };
  function leadList(q) {
    let a = leads; if (q.status === 'active' || !q.status) a = a.filter(x => x.status !== 'archived' && x.status !== 'spam'); else if (q.status !== 'all') a = a.filter(x => x.status === q.status);
    if (q.type) a = a.filter(x => x.type === q.type); if (q.q) { const t = q.q.toLowerCase(); a = a.filter(x => [x.name, x.phone, x.email, x.city, x.org, x.msg].join(' ').toLowerCase().includes(t)); }
    const limit = Math.max(1, Math.min(+q.limit || 50, 200)), page = Math.max(1, +q.page || 1); return {total: a.length, page, limit, items: a.slice((page - 1) * limit, page * limit).map(leadItem)};
  }

  /* ---------- обзор, поиск, здоровье ---------- */
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; };
  function health() {
    const out = [], add = (level, text, link) => out.push({level, text, link}), products = store.products.data, events = store.events.data, news = store.news.data.items || [], site = store.site.data, pages = store.pages.data.items || [];
    const short = products.filter(p => !p.desc || String(p.desc).trim().length < 40); if (short.length) add('warn', `${short.length} ${plural(short.length, 'товар', 'товара', 'товаров')} без нормального описания (короче 40 символов): ${short.slice(0, 3).map(p => '«' + p.name + '»').join(', ')}${short.length > 3 ? '…' : ''}`, '#/brandprods');
    const upcoming = events.filter(e => e.date >= now().slice(0, 10)); if (!upcoming.length) add('warn', 'В расписании нет ближайших мероприятий — раздел «Обучение» выглядит пустым', '#/content/events');
    if (site.demoNotice) add('warn', 'Сайт помечен как демонстрационный: в подвале показывается пометка, разметка товаров и событий для поисковиков отключена. Снимите пометку, когда данные станут реальными', '#/content/site');
    const noPhoto = products.filter(p => !p.image).length; if (products.length && noPhoto) add('info', `${noPhoto} из ${products.length} товаров без фото — на сайте показана иллюстрация упаковки. Фото ставятся в разделе «Товары по брендам»`, '#/brandprods');
    const hidden = pages.filter(p => p.published === false).length; if (hidden) add('info', `${hidden} ${plural(hidden, 'страница скрыта', 'страницы скрыты', 'страниц скрыто')} (черновики)`, '#/pages');
    const st = leadStats(); if (st.new) add('warn', `${st.new} ${plural(st.new, 'необработанная заявка', 'необработанные заявки', 'необработанных заявок')}`, '#/leads');
    if (!out.some(x => x.level === 'warn')) out.unshift({level: 'ok', text: 'Серьёзных замечаний к данным сайта нет', link: ''}); return out;
  }
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  function search(q) {
    q = norm(q).trim(); if (q.length < 2) return []; const out = [], add = (type, title, sub, link, hay) => { if (norm([title, sub, hay].join(' ')).includes(q)) out.push({type, title, sub, link}); };
    store.products.data.forEach(p => add('Товар', p.name, p.brand, '#/brandprods/' + encodeURIComponent(p.brand) + '/' + encodeURIComponent(p.id), p.desc)); store.brands.data.forEach(b => add('Бренд', b.name, b.group || '', '#/content/brands/' + encodeURIComponent(b.id), b.tag + ' ' + b.desc));
    (store.news.data.items || []).forEach(n => add('Новость', n.title, n.date, '#/content/news/' + encodeURIComponent(n.slug || n.id), n.excerpt)); store.events.data.forEach(e => add('Мероприятие', e.title, e.date + ' · ' + (e.city || ''), '#/content/events/' + encodeURIComponent(e.id), e.description));
    (store.pages.data.items || []).forEach(p => add('Страница', p.title, 'pages/' + p.slug + '.html', '#/pages/' + encodeURIComponent(p.slug), p.description)); return out.slice(0, 30);
  }
  const sitePages = () => [...D.pages, ...(store.pages.data.items || []).filter(p => p.published !== false).map(p => ({path: 'pages/' + p.slug + '.html', title: p.title, group: 'Свои страницы'}))];

  /* ---------- файлы, пользователи, настройки ---------- */
  const files = clone(D.files), users = [{id: 1, login: 'admin', name: 'Администратор', role: 'admin', mustChange: false, disabled: false, createdAt: ago(900), lastLogin: now()}, {id: 2, login: 'manager', name: 'Ирина (менеджер)', role: 'manager', mustChange: false, disabled: false, createdAt: ago(300), lastLogin: ago(26)}];
  let settings = {allowedOrigins: [], autoBuild: true, rateLimit: {per10min: 5, perDay: 30}, minFillMs: 700, retentionDays: 0, notify: {webhookUrl: '', telegram: {token: '', chatId: ''}, smtp: {host: '', port: 587, secure: false, user: '', pass: '', from: '', to: ''}}};
  const usedIn = p => Object.keys(store).filter(n => JSON.stringify(store[n].data).includes(p)).map(n => 'data/' + n + '.json');

  /* ---------- маршрутизатор ---------- */
  function handle(method, url, body) {
    const u = new URL(url, 'http://demo'), p = u.pathname, q = Object.fromEntries(u.searchParams); let m;
    if (p === '/api/me') return {user: users[0], csrf: 'demo'};
    if (p === '/api/login' && method === 'POST') return {user: users[0], csrf: 'demo'};
    if (p === '/api/logout') return {ok: true}; if (p === '/api/password') return {ok: true};
    if (p === '/api/config') return {statuses: STATUSES, types: TYPES, roles: ROLES, publish: {enabled: false, hint: DEMO_ONLY}, siteUrl: 'astreya-site.html', origin: 'https://demo.local', uploadDirs: {}, maxUpload: 6291456};
    if (p === '/api/leads/stats') return leadStats(); if (p === '/api/leads' && method === 'GET') return leadList(q);
    if ((m = p.match(/^\/api\/leads\/(L\d+)$/))) { const x = leads.find(l => l.id === m[1]); if (!x) throw httpErr(404, 'Заявка не найдена.');
      if (method === 'GET') return x; if (method === 'DELETE') { leads.splice(leads.indexOf(x), 1); return {ok: true}; }
      if (method === 'PATCH') { if (body.status !== undefined) { if (!STATUSES[body.status]) throw httpErr(400, 'Неизвестный статус.'); if (body.status !== x.status) { x.history.push({t: now(), who: 'admin', action: 'status', detail: STATUSES[x.status] + ' → ' + STATUSES[body.status]}); x.status = body.status; } } if (body.comment !== undefined) { const t = String(body.comment).trim(); if (!t) throw httpErr(400, 'Пустой комментарий.'); x.notes.push({t: now(), who: 'admin', text: t}); x.history.push({t: now(), who: 'admin', action: 'note', detail: t.slice(0, 80)}); } return x; } }
    if (p === '/api/collections' && method === 'GET') return {collections: summary()};
    if ((m = p.match(/^\/api\/collections\/([a-z]+)$/))) { const st = store[m[1]]; if (!st) throw httpErr(404, 'Неизвестный раздел.'); if (method === 'GET') return {name: m[1], data: clone(st.data), version: st.version}; if (method === 'PUT') return save(m[1], body.data, body.version); }
    if ((m = p.match(/^\/api\/collections\/([a-z]+)\/history$/))) { const st = store[m[1]]; if (!st) throw httpErr(404, 'Неизвестный раздел.'); return {items: st.hist.map(h => ({id: h.id, at: h.at, who: h.who, size: JSON.stringify(h.data).length}))}; }
    if ((m = p.match(/^\/api\/collections\/([a-z]+)\/restore$/)) && method === 'POST') { const st = store[m[1]], h = st && st.hist.find(x => x.id === body.id); if (!h) throw httpErr(404, 'Копия не найдена.'); st.hist.unshift({id: now().replace(/[:.]/g, '-'), at: now(), who: 'admin', data: st.data}); st.data = clone(h.data); st.version = nextVer(); return {ok: true, version: st.version}; }
    if (p === '/api/overview') return {leads: leadStats(), counts: Object.fromEntries(summary().filter(c => c.count !== null).map(c => [c.name, c.count])), build: null, health: health(), audit: audit.slice(0, 8), pages: (store.pages.data.items || []).filter(x => x.published !== false).length, siteAudit: null};
    if (p === '/api/search') return {items: search(q.q)}; if (p === '/api/site-pages') return {pages: sitePages()};
    if (p === '/api/site-audit' || (p === '/api/build' && method === 'POST')) throw httpErr(503, DEMO_ONLY);
    if (p === '/api/build') return {}; if (p === '/api/publish') { if (method === 'POST') throw httpErr(501, DEMO_ONLY); return {enabled: false, hint: DEMO_ONLY}; }
    if (p === '/api/files/usage') return {used: usedIn(q.path || '')};
    if (p === '/api/files' && method === 'GET') return {dirs: files};
    if (p === '/api/files' && method === 'POST') { const d = files.find(x => x.dir === body.dir); if (!d) throw httpErr(400, 'Эту папку менять нельзя.'); const name = String(body.name || 'image').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image.webp', size = Math.round(String(body.data || '').length * 0.75); d.files = d.files.filter(f => f.name !== name); d.files.push({name, size, mtime: now()}); return {path: body.dir + '/' + name, size}; }
    if (p === '/api/files' && method === 'DELETE') { const path = q.path || '', used = usedIn(path); if (used.length) throw httpErr(409, 'Файл используется на сайте (' + used.join(', ') + '). Сначала замените картинку в содержимом.', {usedIn: used}); files.forEach(d => { d.files = d.files.filter(f => d.dir + '/' + f.name !== path); }); return {path}; }
    if (p === '/api/users' && method === 'GET') return {users: clone(users)};
    if (p === '/api/users' && method === 'POST') { if (!/^[a-z0-9._-]{3,32}$/i.test(body.login || '')) throw httpErr(400, 'Логин: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание.'); if (users.some(x => x.login === body.login)) throw httpErr(400, 'Такой логин уже есть.'); const x = {id: Math.max(...users.map(u => u.id)) + 1, login: body.login, name: body.name || body.login, role: body.role || 'manager', mustChange: true, disabled: false, createdAt: now(), lastLogin: null}; users.push(x); return x; }
    if ((m = p.match(/^\/api\/users\/(\d+)$/))) { const x = users.find(u => u.id === +m[1]); if (!x) throw httpErr(404, 'Пользователь не найден.'); if (method === 'PATCH') { Object.assign(x, Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'role', 'disabled'].includes(k)))); if (body.password) x.mustChange = true; return x; } if (method === 'DELETE') { if (x.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) throw httpErr(400, 'Нельзя удалить последнего администратора.'); users.splice(users.indexOf(x), 1); return {ok: true}; } }
    if (p === '/api/settings' && method === 'GET') return clone(settings); if (p === '/api/settings' && method === 'PUT') { settings = Object.assign(clone(settings), clone(body)); return clone(settings); }
    if (p === '/api/settings/test-notify') return {configured: false, results: []};
    if (p === '/api/audit') return {items: audit.slice(0, +q.limit || 100)};
    throw httpErr(404, 'В демо-версии этот запрос не поддерживается: ' + p);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    const s = String(url && url.url || url); if (!/^\/api\//.test(s) && !/^https?:\/\/demo\//.test(s)) return realFetch(url, opts);
    const method = ((opts && opts.method) || 'GET').toUpperCase(); let body; try { body = opts && opts.body ? JSON.parse(opts.body) : undefined; } catch (e) {}
    await new Promise(r => setTimeout(r, 40));
    try { const out = handle(method, s, body), json = JSON.stringify(out === undefined ? {} : out); return new Response(json, {status: 200, headers: {'Content-Type': 'application/json'}}); }
    catch (e) { return new Response(JSON.stringify(e.body || {error: e.message}), {status: e.status || 500, headers: {'Content-Type': 'application/json'}}); }
  };

  /* предпросмотр: сайт в рамке не открыть без сервера — показываем пояснение со ссылкой на файл сайта */
  window.__DEMO_READY = function (AD) {
    AD.previewUrl = path => 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f2f4f9;color:#0b1a33;text-align:center;padding:24px"><div style="max-width:420px"><h2 style="margin:0 0 8px">Предпросмотр: ' + String(path).replace(/[<&]/g, '').split('?')[0] + '</h2><p style="color:#5a6a85">В демо-версии админки сайт в рамке не показывается: он лежит в отдельном файле. Откройте <b>astreya-site.html</b> — там весь сайт целиком. С настоящим сервером админка показывает здесь живую страницу.</p></div>');
  };
})();
