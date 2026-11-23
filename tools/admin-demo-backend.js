/* Демо-«сервер» для админки в одном HTML-файле (tools/admin-demo.js): подменяет fetch для адресов /api/* и отвечает из данных, встроенных в файл.
   Правки живут только в открытой вкладке (перезагрузка возвращает исходные данные) и сайт не меняют. Всё, что нельзя сделать без настоящего сервера
   (пересборка, публикация, заявки, копии данных, двухфакторный вход, внешние сервисы), отвечает «в демо недоступно».
   Данные: window.__DEMO = {fx: снимок ответов настоящего сервера, collections: все разделы данных, assets: картинки (data-URI), files: текстовые файлы сайта}. */
(function () {
  'use strict';
  const D = window.__DEMO, fx = D.fx, clone = v => JSON.parse(JSON.stringify(v));
  const now = () => new Date().toISOString(), ago = h => new Date(Date.now() - h * 3600e3).toISOString();
  const UNAVAILABLE = 'В демо недоступно: ';
  const NEEDS_SERVER = ' Это работает только в настоящей админке (запуск: node server/index.js).';
  const httpErr = (status, error, extra) => Object.assign(new Error(error), {status, body: Object.assign({error}, extra || {})});
  const unavailable = what => httpErr(503, UNAVAILABLE + what + '.' + NEEDS_SERVER);
  const TX = () => window.__demoRequire('src/texts.js');
  D.summary = fx['/api/collections'].collections; D.pages = fx['/api/site-pages'].pages; D.blocks = window.__demoRequire('src/blocks-schema.js');
  const B = D.blocks;
  let ver = 1; const nextVer = () => 'demo' + (++ver);

  /* ---------- хранилище разделов ---------- */
  const store = {}; Object.keys(D.collections).forEach(k => { store[k] = {data: clone(D.collections[k].data), version: D.collections[k].version, hist: []}; });
  const meta = Object.fromEntries(D.summary.map(c => [c.name, c]));
  const countOf = n => { const c = meta[n], d = store[n].data; return c.kind === 'array' ? d.length : c.list ? (d[c.list] || []).length : null; };
  const summary = () => D.summary.map(c => Object.assign({}, c, {count: countOf(c.name)}));
  const audit = clone(fx['/api/audit?limit=100'].items || []); const log = (action, detail) => audit.unshift({t: now(), who: 'admin', action, detail: detail || '', ip: '203.0.113.7'});
  log('login', 'вход (демо)');

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
    if (name === 'texts') { const it = data && data.items; if (!it || typeof it !== 'object' || Array.isArray(it)) return ['Нужен объект «items».']; const T = TX(); Object.entries(it).forEach(([k, v]) => T.problems(k, v).forEach(x => P.push(x))); return P; }
    if (name === 'media') { if (!data || typeof data !== 'object' || Array.isArray(data)) return ['Ожидается объект.']; return P; }
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
  /* ---------- сравнение версий и тексты из данных: настоящий код сервера, запущенный в браузере ---------- */
  const JD = () => window.__demoRequire('server/lib/jsondiff.js');
  window.__demoStubs['path'] = {}; window.__demoStubs['./config'] = {}; window.__demoStubs['./util'] = {readJSON: () => null};
  window.__demoStubs['./auth'] = {httpErr}; window.__demoStubs['./content'] = {
    read: name => { const st = store[name]; if (!st) throw httpErr(404, 'Неизвестный раздел.'); return {name, data: clone(st.data), version: st.version}; },
    save: async (name, data, o) => save(name, data, o && o.version)
  };
  const DT = () => window.__demoRequire('server/lib/datatexts.js');
  const pad = n => String(n).padStart(2, '0');
  const histDiff = (name, id) => { const h = store[name].hist.find(x => x.id === id); if (!h) throw httpErr(404, 'Копия не найдена.'); return JD().diff(h.data, store[name].data); };

  function save(name, data, version) {
    const st = store[name]; if (!st) throw httpErr(404, 'Неизвестный раздел.');
    if (version && version !== st.version) throw httpErr(409, 'Эти данные уже изменил кто-то другой. Обновите страницу и повторите правку.');
    const pr = problems(name, data); if (pr.length) throw httpErr(422, 'Данные не сохранены: ' + pr.slice(0, 8).join(' '), {problems: pr});
    if (JSON.stringify(st.data) === JSON.stringify(data)) return {ok: true, unchanged: true, version: st.version, build: null};
    st.hist.unshift({id: now().replace(/[:.]/g, '-') + '__admin', at: now(), who: 'admin', data: st.data}); st.hist = st.hist.slice(0, 30); st.data = clone(data); st.version = nextVer(); log('content', name);
    return {ok: true, version: st.version, backup: st.hist[0].id, build: null};
  }

  /* ---------- обзор, поиск ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  function search(q) {
    q = norm(q).trim(); if (q.length < 2) return []; const out = [], add = (type, title, sub, link, hay) => { if (norm([title, sub, hay].join(' ')).includes(q)) out.push({type, title, sub, link}); };
    store.products.data.forEach(p => add('Товар', p.name, p.brand, '#/products/' + encodeURIComponent(p.id), p.desc)); store.brands.data.forEach(b => add('Бренд', b.name, b.group || '', '#/brands/' + encodeURIComponent(b.id), b.tag + ' ' + b.desc));
    (store.news.data.items || []).forEach(n => add('Новость', n.title, n.date, '#/news/' + encodeURIComponent(n.id), n.excerpt)); store.events.data.forEach(e => add('Мероприятие', e.title, e.date + ' · ' + (e.city || ''), '#/events/' + encodeURIComponent(e.id), e.description));
    (store.pages.data.items || []).forEach(p => add('Страница', p.title, 'pages/' + p.slug + '.html', '#/pages/' + encodeURIComponent(p.slug), p.description)); return out.slice(0, 30);
  }
  const sitePages = () => [...D.pages, ...(store.pages.data.items || []).filter(p => p.published !== false && !D.pages.some(x => x.path === 'pages/' + p.slug + '.html')).map(p => ({path: 'pages/' + p.slug + '.html', title: p.title, group: 'Свои страницы'}))];

  /* ---------- файлы (папки, загрузка, переименование — в памяти вкладки) ---------- */
  const F = clone(fx['/api/files/overview']);
  const dirOf = p => F.dirs.find(d => d.files.some(f => f.path === p));
  const usedIn = p => (F.usage[p] || []).slice();
  const EXT = /\.(png|jpe?g|webp|gif)$/i, CYR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya'};
  const slug = s => String(s || '').toLowerCase().replace(/[а-яё]/g, c => CYR[c] || '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const imgSize = uri => new Promise(res => { const i = new Image(); i.onload = () => res({w: i.naturalWidth, h: i.naturalHeight}); i.onerror = () => res({}); i.src = uri; });
  const MIMES = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'};

  /* ---------- пользователи, настройки, безопасность ---------- */
  let settings = clone(fx['/api/settings']); const users = clone(fx['/api/users'].users), sec = clone(fx['/api/security']), launch = clone(fx['/api/launch']), backups = clone(fx['/api/backups']), sessions = clone(fx['/api/sessions'].items);
  const ME = clone(fx['/api/me'].user);

  /* ---------- маршрутизатор ---------- */
  async function handle(method, url, body) {
    const u = new URL(url, 'http://demo'), p = u.pathname, q = Object.fromEntries(u.searchParams); let m;
    if (p === '/api/me') return {user: ME, csrf: 'demo', needs2fa: false};
    if (p === '/api/login' || p === '/api/login/2fa') return {user: ME, csrf: 'demo'};
    if (p === '/api/logout' || p === '/api/password') return {ok: true};
    if (p === '/api/config') return Object.assign(clone(fx['/api/config']), {publish: {enabled: false, hint: UNAVAILABLE + 'публикация на GitHub Pages.' + NEEDS_SERVER}, demo: true});
    /* разделы данных */
    if (p === '/api/collections' && method === 'GET') return {collections: summary()};
    if ((m = p.match(/^\/api\/collections\/([a-z0-9_]+)$/))) { const st = store[m[1]]; if (!st) throw httpErr(404, 'Неизвестный раздел.'); if (method === 'GET') return {name: m[1], data: clone(st.data), version: st.version}; if (method === 'PUT') return save(m[1], body.data, body.version); }
    if ((m = p.match(/^\/api\/collections\/([a-z0-9_]+)\/history$/))) { const st = store[m[1]]; if (!st) throw httpErr(404, 'Неизвестный раздел.'); return {items: st.hist.map(h => ({id: h.id, at: h.at, who: h.who, size: JSON.stringify(h.data).length}))}; }
    if ((m = p.match(/^\/api\/collections\/([a-z0-9_]+)\/diff$/))) { if (!store[m[1]]) throw httpErr(404, 'Неизвестный раздел.'); return histDiff(m[1], q.id); }
    if ((m = p.match(/^\/api\/collections\/([a-z0-9_]+)\/restore$/)) && method === 'POST') { const st = store[m[1]], h = st && st.hist.find(x => x.id === body.id); if (!h) throw httpErr(404, 'Копия не найдена.'); st.hist.unshift({id: now().replace(/[:.]/g, '-') + '__admin', at: now(), who: 'admin', data: st.data}); st.data = clone(h.data); st.version = nextVer(); log('restore', m[1] + ' ← ' + body.id); return {ok: true, version: st.version, build: null}; }
    /* тексты страниц */
    if (p === '/api/texts/registry') return clone(fx['/api/texts/registry']);
    if (p === '/api/texts/data' && method === 'GET') return DT().fields();
    if (p === '/api/texts/data' && method === 'POST') { const r = await DT().apply(body.changes, 'admin'); log('content', 'тексты из данных: ' + (body.changes || []).length); return r; }
    if (p === '/api/news/layout') return clone(fx['/api/news/layout']);
    /* обзор, поиск, страницы сайта */
    if (p === '/api/overview') { const o = clone(fx['/api/overview']); o.counts = Object.fromEntries(summary().filter(c => c.count !== null).map(c => [c.name, c.count])); o.pages = (store.pages.data.items || []).length; o.audit = audit.slice(0, 8); o.build = null; return o; }
    if (p === '/api/search') return {items: search(q.q)};
    if (p === '/api/site-pages') return {pages: sitePages()};
    /* сборка и публикация: только с настоящим сервером */
    if (p === '/api/site-audit') throw unavailable('проверка всех страниц сайта');
    if (p === '/api/build') { if (method === 'POST') throw unavailable('пересборка сайта'); return {}; }
    if (p === '/api/publish') { if (method === 'POST') throw httpErr(501, UNAVAILABLE + 'публикация на GitHub Pages.' + NEEDS_SERVER); return {enabled: false, hint: UNAVAILABLE + 'публикация на GitHub Pages.' + NEEDS_SERVER}; }
    if (p === '/api/publish/diff') return {kind: 'file', note: UNAVAILABLE + 'сравнение с последней публикацией (нужен git на сервере).'};
    if (p === '/api/publish/log') return {enabled: false, items: []};
    /* заявки: хранятся на сервере */
    if (p === '/api/leads/stats' || p === '/api/leads' || /^\/api\/leads\//.test(p)) throw unavailable('заявки с форм сайта (они хранятся на сервере)');
    /* файлы */
    if (p === '/api/files/overview') return clone(F);
    if (p === '/api/files/usage') return {used: usedIn(q.path || '')};
    if (p === '/api/files' && method === 'GET') return {dirs: clone(F.dirs)};
    if (p === '/api/files/folder' && method === 'POST') { const n = slug(body.name).slice(0, 40); if (!n) throw httpErr(400, 'Название папки — латиница, цифры и дефис.'); const dir = 'assets/uploads/' + n; if (!F.dirs.some(d => d.dir === dir)) F.dirs.push({dir, title: 'Загрузки: ' + n, files: [], writable: true, custom: true}); return {dir}; }
    if (p === '/api/files' && method === 'POST') {
      const d = F.dirs.find(x => x.dir === body.dir); if (!d || d.readonly) throw httpErr(400, 'Эту папку менять нельзя.');
      const ext = (String(body.name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '', n = (slug(String(body.name || 'image').replace(/\.[^.]+$/, '')) || 'image') + '.' + ext.toLowerCase();
      if (!EXT.test(n)) throw httpErr(400, 'Допустимы PNG, JPG, WebP и GIF. (SVG-логотипы кладутся в репозиторий вручную.)');
      const bytes = Math.floor(String(body.data || '').length * 3 / 4); if (bytes > 6291456) throw httpErr(413, 'Файл больше 6 МБ.');
      const uri = 'data:' + MIMES[ext.toLowerCase()] + ';base64,' + body.data, sz = await imgSize(uri), path = body.dir + '/' + n;
      D.assets['/' + path] = uri; d.files = d.files.filter(f => f.path !== path); d.files.push(Object.assign({name: n, size: bytes, mtime: now(), path}, sz)); log('file_upload', path);
      return {path, size: bytes, w: sz.w, h: sz.h};
    }
    if (p === '/api/files' && method === 'DELETE') { const pth = q.path || '', used = usedIn(pth), d = dirOf(pth); if (!d) throw httpErr(404, 'Файл не найден.'); if (used.length && q.force !== '1') throw httpErr(409, 'Файл используется на сайте (' + used.map(x => x.label).join(', ') + '). Сначала замените картинку там или удалите её со страницы.', {used}); d.files = d.files.filter(f => f.path !== pth); delete D.assets['/' + pth]; log('file_delete', pth); return {ok: true, path: pth}; }
    if (p === '/api/files/rename' && method === 'POST') {
      const d = dirOf(body.path), f = d && d.files.find(x => x.path === body.path); if (!f) throw httpErr(404, 'Файл не найден.'); const ext = (f.name.match(/\.[^.]+$/) || [''])[0], n = (slug(String(body.name || '').replace(/\.[^.]+$/, '')) || 'image') + ext;
      const np = d.dir + '/' + n; if (d.files.some(x => x.path === np && x !== f)) throw httpErr(409, 'Файл с таким именем уже есть.');
      const changed = Object.keys(store).filter(k => JSON.stringify(store[k].data).includes(body.path)); changed.forEach(k => { store[k].data = JSON.parse(JSON.stringify(store[k].data).split(body.path).join(np)); store[k].version = nextVer(); });
      if (D.assets['/' + body.path]) { D.assets['/' + np] = D.assets['/' + body.path]; delete D.assets['/' + body.path]; } if (F.usage[body.path]) { F.usage[np] = F.usage[body.path]; delete F.usage[body.path]; }
      f.name = n; f.path = np; log('file_rename', body.path + ' → ' + np); return {path: np, changed: changed.map(k => 'data/' + k + '.json')};
    }
    /* пользователи */
    if (p === '/api/users' && method === 'GET') return {users: clone(users)};
    if (p === '/api/users' && method === 'POST') { if (!/^[a-z0-9._-]{3,32}$/i.test(body.login || '')) throw httpErr(400, 'Логин: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание.'); if (users.some(x => x.login.toLowerCase() === String(body.login).toLowerCase())) throw httpErr(409, 'Такой логин уже есть.'); if (String(body.password || '').length < 12) throw httpErr(422, 'Пароль не короче 12 знаков.'); const x = {id: 'u' + (users.length + 1) + Math.random().toString(36).slice(2, 6), login: body.login, name: body.name || body.login, role: body.role || 'manager', mustChange: true, disabled: false, createdAt: now(), lastLogin: null, totp: false, recoveryLeft: 0}; users.push(x); log('user_create', x.login); return clone(x); }
    if ((m = p.match(/^\/api\/users\/([\w-]+)\/reset-2fa$/)) && method === 'POST') { const x = users.find(u => u.id === m[1]); if (!x) throw httpErr(404, 'Пользователь не найден.'); x.totp = false; return {ok: true}; }
    if ((m = p.match(/^\/api\/users\/([\w-]+)$/))) { const x = users.find(u => u.id === m[1]); if (!x) throw httpErr(404, 'Пользователь не найден.');
      if (method === 'PATCH') { if (body.password !== undefined && String(body.password).length < 12) throw httpErr(422, 'Пароль не короче 12 знаков.'); ['name', 'role', 'disabled'].forEach(k => { if (body[k] !== undefined) x[k] = body[k]; }); if (body.password) x.mustChange = true; return clone(x); }
      if (method === 'DELETE') { if (x.id === ME.id) throw httpErr(400, 'Себя удалить нельзя.'); users.splice(users.indexOf(x), 1); return {ok: true}; } }
    /* настройки, безопасность, запуск */
    if (p === '/api/settings' && method === 'GET') return clone(settings);
    if (p === '/api/settings' && method === 'PUT') { settings = Object.assign(clone(settings), clone(body)); return clone(settings); }
    if (p === '/api/settings/test-notify') return {configured: false, results: []};
    if (p === '/api/security' && method === 'GET') return clone(sec);
    if (p === '/api/security' && method === 'PUT') { sec.policy = Object.assign({}, sec.policy, clone(body)); return clone(sec); }
    if (p === '/api/security/seal') throw unavailable('шифрование секретов на сервере');
    if (p === '/api/sessions' && method === 'GET') return {items: clone(sessions)};
    if (p === '/api/sessions/revoke-others') return {ok: true, revoked: 0};
    if (/^\/api\/sessions\/[0-9a-f]{12}$/.test(p)) return {ok: true};
    if (p === '/api/2fa' && method === 'GET') return clone(fx['/api/2fa']);
    if (/^\/api\/2fa\//.test(p)) throw unavailable('двухфакторный вход');
    if (p === '/api/launch' && method === 'GET') return clone(launch);
    if (p === '/api/launch/confirm') { const it = launch.items.find(x => x.id === body.id); if (!it) throw httpErr(404, 'Пункт не найден.'); it.confirmed = !!body.value; return {ok: true}; }
    if (p === '/api/backups' && method === 'GET') return clone(backups);
    if (p === '/api/backups/settings') { backups.auto = !!body.auto; backups.keep = +body.keep || backups.keep; return {ok: true}; }
    if (p === '/api/backups' || /^\/api\/backups\//.test(p)) throw unavailable('резервные копии данных сервера');
    if (p === '/api/integrations' && method === 'GET') return clone(fx['/api/integrations']);
    if (/^\/api\/integrations\//.test(p)) throw unavailable('проверка внешних сервисов (Яндекс Метрика, Битрикс24)');
    if (p === '/api/assistant/info') return clone(fx['/api/assistant/info']);
    if (p === '/api/assistant/test') throw unavailable('проверка подключения помощника');
    if (p === '/api/privacy/registry') return clone(fx['/api/privacy/registry']);
    if (/^\/api\/privacy\//.test(p)) throw unavailable('поиск, выгрузка и удаление персональных данных (заявки хранятся на сервере)');
    if (p === '/api/audit') return {items: audit.slice(0, +q.limit || 100)};
    if (p === '/api/site.zip') throw unavailable('скачивание сайта архивом');
    throw httpErr(404, UNAVAILABLE + 'этот запрос не поддерживается демонстрационной версией (' + p + ').');
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    const s = String(url && url.url || url), path0 = s.split('?')[0];
    if (D.files[path0]) return new Response(D.files[path0], {status: 200, headers: {'Content-Type': 'application/json'}});
    if (!/^\/api\//.test(s) && !/^https?:\/\/demo\//.test(s)) return realFetch(url, opts);
    const method = ((opts && opts.method) || 'GET').toUpperCase(); let body; try { body = opts && opts.body ? JSON.parse(opts.body) : undefined; } catch (e) {}
    await new Promise(r => setTimeout(r, 25));
    try { const out = await handle(method, s, body), json = JSON.stringify(out === undefined ? {} : out); return new Response(json, {status: 200, headers: {'Content-Type': 'application/json'}}); }
    catch (e) { return new Response(JSON.stringify(e.body || {error: e.message}), {status: e.status || 500, headers: {'Content-Type': 'application/json'}}); }
  };

  /* предпросмотр: сайт в рамке без сервера не открыть — показываем пояснение */
  window.__DEMO_READY = function (AD) {
    AD.previewUrl = path => 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><body style="font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f2f4f9;color:#0b1a33;text-align:center"><div style="max-width:420px;padding:24px"><h2 style="margin:0 0 8px;font:600 22px Georgia,serif">Предпросмотр сайта</h2><p style="margin:0 0 6px">В демо-версии страница <b>' + String(path).split('?')[0].replace(/[<>&"]/g, '') + '</b> не открывается: сайт лежит рядом с настоящей админкой.</p><p style="margin:0;color:#5b6780">Запустите <code>node server/index.js</code> — здесь появится сайт с вашими правками.</p></div></body>');
  };
})();
