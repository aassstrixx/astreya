#!/usr/bin/env node
/* Сервер сайта «Астрея»: приём заявок с форм, админ-панель (/admin/), раздача самого сайта. Без внешних зависимостей, Node.js 18+.
   Запуск: node server/index.js   (настройки — переменные окружения, см. server/README.md) */
'use strict';
const http = require('http'), path = require('path'), fs = require('fs');
const C = require('./lib/config');
const A = require('./lib/auth');
const H = require('./lib/http');
const L = require('./lib/leads');
const N = require('./lib/notify');
const CT = require('./lib/content');
const B = require('./lib/build');
const F = require('./lib/files');
const P = require('./lib/publish');
const AUD = require('./lib/audit');
const INS = require('./lib/insight');
const {httpErr} = A;

const ADMIN_DIR = path.join(__dirname, 'admin');
const SITE_ALLOW = rel => /^[^/]+\.(html|xml|txt|ico)$/.test(rel) || /^(assets|css|js|brands|products|training|news|pages)\//.test(rel);
const ADMIN_CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const SECRET_MASK = '••••••••';

const siteUrl = () => { try { return JSON.parse(fs.readFileSync(path.join(C.ROOT, 'data', 'site.json'), 'utf8')).url || ''; } catch (e) { return ''; } };
const originOf = u => { try { return new URL(u).origin; } catch (e) { return ''; } };

function clientIp(req) {
  if (C.TRUST_PROXY) { const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (x) return x; }
  return req.socket.remoteAddress || '';
}
const isHttps = req => C.SECURE_COOKIES || (C.TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
function allowedOrigins() { const s = C.loadSettings(); return new Set([...(s.allowedOrigins || []), originOf(siteUrl())].filter(Boolean)); }
function corsHeaders(req) {
  const o = req.headers.origin; if (!o) return {};
  const same = req.headers.host && (o === 'http://' + req.headers.host || o === 'https://' + req.headers.host);
  return same || allowedOrigins().has(o) ? {'Access-Control-Allow-Origin': o, 'Vary': 'Origin'} : {'Vary': 'Origin'};
}
const originAllowed = req => { const o = req.headers.origin; return !o || (req.headers.host && (o === 'http://' + req.headers.host || o === 'https://' + req.headers.host)) || allowedOrigins().has(o); };

/* ---------- публичное: приём заявки ---------- */
async function handleLead(req, res) {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') {
    if (!originAllowed(req)) return H.send(res, 403, '', cors);
    return H.send(res, 204, '', Object.assign({'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Access-Control-Max-Age': '600'}, cors));
  }
  if (req.method !== 'POST') return H.json(res, 405, {ok: false, error: 'method_not_allowed'}, {Allow: 'POST, OPTIONS'});
  try {
    if (!originAllowed(req)) throw httpErr(403, 'Заявки принимаются только с сайта.');
    const body = await H.readJSONBody(req, 32 * 1024), settings = C.loadSettings();
    const r = await L.receive(body, {ipHash: L.ipHash(clientIp(req)), ua: req.headers['user-agent'], origin: req.headers.origin || ''}, settings);
    if (r.notify) N.notifyLead(r.lead, settings, C.PUBLIC_URL ? C.PUBLIC_URL + '/admin/' : '').then(out => { if (out.some(x => !x.ok)) AUD.add('система', 'notify_failed', r.id + ': ' + out.filter(x => !x.ok).map(x => x.channel + ' — ' + x.error).join('; ')); }).catch(() => {});
    H.json(res, 200, {ok: true, id: r.id}, cors);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('lead error:', e);
    H.json(res, status, Object.assign({ok: false, error: status === 429 ? 'rate_limited' : status === 422 ? 'invalid' : 'error', message: status >= 500 ? 'Внутренняя ошибка. Попробуйте позже.' : e.message}, e.extra || {}), Object.assign({}, cors, e.extra && e.extra.retry_after ? {'Retry-After': String(e.extra.retry_after)} : {}));
  }
}

/* ---------- админский API ---------- */
const need = (ctx, ...roles) => { if (!roles.includes(ctx.user.role)) throw httpErr(403, 'Недостаточно прав.'); };
const maskSettings = s => { const o = JSON.parse(JSON.stringify(s)); const m = (obj, k) => { if (obj && obj[k]) obj[k] = SECRET_MASK; }; m(o.notify.telegram, 'token'); m(o.notify.smtp, 'pass'); return o; };
const mergeSecrets = (neu, old) => { const o = JSON.parse(JSON.stringify(neu)); const keep = (a, b, k) => { if (a && a[k] === SECRET_MASK) a[k] = b && b[k] || ''; }; keep(o.notify && o.notify.telegram, old.notify.telegram, 'token'); keep(o.notify && o.notify.smtp, old.notify.smtp, 'pass'); return o; };
function checkSettings(s) {
  const url = v => !v || /^https?:\/\/[^\s]+$/.test(v);
  if (!s || typeof s !== 'object') throw httpErr(400, 'Некорректные настройки.');
  if (!Array.isArray(s.allowedOrigins) || !s.allowedOrigins.every(x => typeof x === 'string' && /^https?:\/\/[^\s/]+$/.test(x))) throw httpErr(422, 'Разрешённые сайты: адреса вида https://example.com (без пути и слэша на конце).');
  if (s.notify && !url(s.notify.webhookUrl)) throw httpErr(422, 'Веб-хук: полный адрес https://…');
  const sm = s.notify && s.notify.smtp; if (sm && sm.host && (!sm.to || !sm.from && !sm.user)) throw httpErr(422, 'SMTP: укажите получателя и отправителя.');
  const rl = s.rateLimit || {}; if (!(+rl.per10min >= 1 && +rl.perDay >= 1)) throw httpErr(422, 'Ограничение заявок: положительные числа.');
  if (s.retentionDays !== undefined && !(+s.retentionDays >= 0)) throw httpErr(422, 'Срок хранения: число дней (0 — не удалять).');
}

async function handleApi(req, res, url) {
  const p = url.pathname, m = req.method;
  if (p === '/api/lead') return handleLead(req, res);
  if (p === '/api/health') return H.json(res, 200, {ok: true, time: new Date().toISOString(), build: (B.last() || {}).at || null});

  if (!originAllowed(req) && m !== 'GET') throw httpErr(403, 'Запрос с чужого сайта отклонён.');
  const cookies = H.parseCookies(req.headers.cookie), token = cookies.astreya_sid;

  if (p === '/api/login' && m === 'POST') {
    const b = await H.readJSONBody(req, 4096);
    const r = await A.login(clientIp(req), b.login, b.password, req);
    AUD.add(r.user.login, 'login', clientIp(req) ? 'вход' : '');
    return H.json(res, 200, {user: r.user, csrf: r.session.csrf}, {'Set-Cookie': H.cookie('astreya_sid', r.session.token, {secure: isHttps(req), maxAge: 12 * 3600})});
  }
  const sess = A.getSession(token);
  if (p === '/api/me' && m === 'GET') return sess ? H.json(res, 200, {user: sess.user, csrf: sess.csrf}) : H.json(res, 401, {error: 'Требуется вход.'});
  if (!sess) throw httpErr(401, 'Требуется вход.');
  const ctx = {user: sess.user, csrf: sess.csrf, who: sess.user.login};
  if (m !== 'GET' && m !== 'HEAD') { if (!A.safeEqualToken(String(req.headers['x-csrf-token'] || ''), sess.csrf)) throw httpErr(403, 'Сессия устарела. Обновите страницу.'); }

  if (p === '/api/logout' && m === 'POST') { A.destroySession(token); AUD.add(ctx.who, 'logout'); return H.json(res, 200, {ok: true}, {'Set-Cookie': H.cookie('astreya_sid', '', {secure: isHttps(req), maxAge: 0})}); }
  if (p === '/api/password' && m === 'POST') { const b = await H.readJSONBody(req, 4096); await A.changeOwnPassword(ctx.user.id, b.old, b.new); AUD.add(ctx.who, 'password', 'смена пароля'); return H.json(res, 200, {ok: true}); }
  if (sess.user.mustChange) throw httpErr(403, 'Сначала смените пароль.', {mustChange: true});

  if (p === '/api/config' && m === 'GET') return H.json(res, 200, {statuses: L.STATUSES, types: L.TYPE_TITLES, roles: A.ROLES, publish: await P.status(), siteUrl: siteUrl(), origin: (req.headers['x-forwarded-proto'] || (isHttps(req) ? 'https' : 'http')) + '://' + req.headers.host, uploadDirs: F.DIRS, maxUpload: F.MAX});

  /* заявки (администратор и менеджер) */
  if (p === '/api/leads' && m === 'GET') { need(ctx, 'admin', 'manager'); return H.json(res, 200, L.list(Object.fromEntries(url.searchParams))); }
  if (p === '/api/leads/stats' && m === 'GET') { need(ctx, 'admin', 'manager'); return H.json(res, 200, L.stats()); }
  if (p === '/api/leads.csv' && m === 'GET') { need(ctx, 'admin', 'manager'); AUD.add(ctx.who, 'export', 'выгрузка заявок в CSV'); return H.send(res, 200, L.csv(Object.fromEntries(url.searchParams)), {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads-' + new Date().toISOString().slice(0, 10) + '.csv"', 'Cache-Control': 'no-store'}); }
  let mm = p.match(/^\/api\/leads\/(L\d+)$/);
  if (mm) {
    need(ctx, 'admin', 'manager');
    if (m === 'GET') { const x = L.get(mm[1]); if (!x) throw httpErr(404, 'Заявка не найдена.'); return H.json(res, 200, x); }
    if (m === 'PATCH') { const b = await H.readJSONBody(req, 8192); const x = await L.update(mm[1], {status: b.status, comment: b.comment}, ctx.who); AUD.add(ctx.who, 'lead', mm[1] + (b.status ? ' → ' + L.STATUSES[b.status] : '') + (b.comment ? ' + комментарий' : '')); return H.json(res, 200, x); }
    if (m === 'DELETE') { need(ctx, 'admin'); await L.remove(mm[1], ctx.who); AUD.add(ctx.who, 'lead_delete', mm[1]); return H.json(res, 200, {ok: true}); }
  }

  /* дальше — только администратор */
  need(ctx, 'admin');
  if (p === '/api/collections' && m === 'GET') return H.json(res, 200, {collections: CT.summary()});
  mm = p.match(/^\/api\/collections\/([a-z]+)$/);
  if (mm) {
    if (m === 'GET') return H.json(res, 200, CT.read(mm[1]));
    if (m === 'PUT') { const b = await H.readJSONBody(req, 6e6); const r = await CT.save(mm[1], b.data, {version: b.version, who: ctx.who}); AUD.add(ctx.who, 'content', mm[1] + (r.unchanged ? ' (без изменений)' : '')); return H.json(res, 200, r); }
  }
  mm = p.match(/^\/api\/collections\/([a-z]+)\/history$/); if (mm && m === 'GET') return H.json(res, 200, {items: CT.history(mm[1])});
  mm = p.match(/^\/api\/collections\/([a-z]+)\/restore$/);
  if (mm && m === 'POST') { const b = await H.readJSONBody(req, 4096); const r = await CT.restore(mm[1], b.id, ctx.who); AUD.add(ctx.who, 'restore', mm[1] + ' ← ' + b.id); return H.json(res, 200, r); }

  if (p === '/api/overview' && m === 'GET') return H.json(res, 200, Object.assign(INS.overview(), {siteAudit: B.lastAudit()}));
  if (p === '/api/site-pages' && m === 'GET') return H.json(res, 200, {pages: INS.sitePages()});
  if (p === '/api/search' && m === 'GET') return H.json(res, 200, {items: INS.search(url.searchParams.get('q'))});
  if (p === '/api/site-audit' && m === 'POST') { const r = await B.audit(); AUD.add(ctx.who, 'site_audit', `${r.errors} ошибок, ${r.warns} замечаний`); return H.json(res, 200, r); }
  if (p === '/api/files/usage' && m === 'GET') return H.json(res, 200, {used: F.usedIn(String(url.searchParams.get('path') || ''))});
  if (p === '/api/files' && m === 'GET') return H.json(res, 200, {dirs: F.list()});
  if (p === '/api/files' && m === 'POST') { const b = await H.readJSONBody(req, 9 * 1024 * 1024); const buf = Buffer.from(String(b.data || ''), 'base64'); const r = F.upload(b.dir, b.name, buf); AUD.add(ctx.who, 'upload', r.path); return H.json(res, 200, r); }
  if (p === '/api/files' && m === 'DELETE') { const r = F.remove(url.searchParams.get('path'), url.searchParams.get('force') === '1'); AUD.add(ctx.who, 'file_delete', r.path); return H.json(res, 200, r); }

  if (p === '/api/build' && m === 'GET') return H.json(res, 200, B.last() || {});
  if (p === '/api/build' && m === 'POST') { const r = await B.build('пересборка из админки'); AUD.add(ctx.who, 'build', r.ok ? 'успешно' : 'ошибка'); return H.json(res, r.ok ? 200 : 422, r); }
  if (p === '/api/publish' && m === 'GET') return H.json(res, 200, await P.status());
  if (p === '/api/publish' && m === 'POST') { const b = await H.readJSONBody(req, 4096); const r = await P.publish(b.message, ctx.who); AUD.add(ctx.who, 'publish', r.commit || r.message || ''); return H.json(res, 200, r); }

  if (p === '/api/settings' && m === 'GET') return H.json(res, 200, maskSettings(C.loadSettings()));
  if (p === '/api/settings' && m === 'PUT') { const b = await H.readJSONBody(req, 32768); const s = mergeSecrets(b, C.loadSettings()); checkSettings(s); C.saveSettings(C.deep(C.DEFAULT_SETTINGS, s)); AUD.add(ctx.who, 'settings', 'настройки'); return H.json(res, 200, maskSettings(C.loadSettings())); }
  if (p === '/api/settings/test-notify' && m === 'POST') { const out = await N.test(C.loadSettings()); AUD.add(ctx.who, 'notify_test', out.map(x => x.channel + ':' + (x.ok ? 'ok' : 'ошибка')).join(', ')); return H.json(res, 200, {results: out, configured: out.length > 0}); }

  if (p === '/api/users' && m === 'GET') return H.json(res, 200, {users: A.listUsers()});
  if (p === '/api/users' && m === 'POST') { const b = await H.readJSONBody(req, 4096); const u = await A.createUser({login: b.login, name: b.name, role: b.role, password: b.password, mustChange: true}); AUD.add(ctx.who, 'user_create', u.login + ' (' + u.role + ')'); return H.json(res, 200, u); }
  mm = p.match(/^\/api\/users\/([\w-]+)$/);
  if (mm && m === 'PATCH') { const b = await H.readJSONBody(req, 4096); const u = await A.updateUser(mm[1], b, ctx.user.id); AUD.add(ctx.who, 'user_update', u.login); return H.json(res, 200, u); }
  if (mm && m === 'DELETE') { await A.deleteUser(mm[1], ctx.user.id); AUD.add(ctx.who, 'user_delete', mm[1]); return H.json(res, 200, {ok: true}); }
  if (p === '/api/audit' && m === 'GET') return H.json(res, 200, {items: AUD.tail(+url.searchParams.get('limit') || 100)});

  throw httpErr(404, 'Неизвестный запрос.');
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) { try { return await handleApi(req, res, url); } catch (e) { const st = e.status || 500; if (st === 500) console.error(e); return H.json(res, st, Object.assign({error: st === 500 ? 'Внутренняя ошибка.' : e.message}, e.extra || {}), e.extra && e.extra.retry_after ? {'Retry-After': String(e.extra.retry_after)} : {}); } }
      if (req.method !== 'GET' && req.method !== 'HEAD') return H.send(res, 405, 'method not allowed', {Allow: 'GET, HEAD'});
      if (url.pathname === '/admin') return H.send(res, 301, '', {Location: '/admin/'});
      if (url.pathname.startsWith('/admin/')) return H.serveStatic(req, res, ADMIN_DIR, url.pathname.slice('/admin/'.length), {allow: r => /^[\w.-]+\.(html|css|js)$/.test(r), noCache: true, headers: (r, ext) => Object.assign({'Cache-Control': 'no-store'}, ext === '.html' ? {'Content-Security-Policy': ADMIN_CSP, 'X-Frame-Options': 'DENY'} : {}), notFoundFile: null});
      return H.serveStatic(req, res, C.ROOT, url.pathname.slice(1), {allow: SITE_ALLOW, headers: (r, ext) => ({'Cache-Control': ext === '.html' || ext === '.xml' || ext === '.txt' ? 'no-cache' : 'public, max-age=3600'}), cleanUrls: true, notFoundFile: path.join(C.ROOT, '404.html')});
    } catch (e) { console.error(e); try { H.send(res, 500, 'error'); } catch (x) {} }
  });
}

async function start(port, host) {
  await A.ensureAdmin(m => console.log(m));
  const srv = createServer();
  await new Promise(r => srv.listen(port === undefined ? C.PORT : port, host || C.HOST, r));
  const s = C.loadSettings(); if (s.retentionDays) L.purgeOld(+s.retentionDays);
  const t = setInterval(() => { const st = C.loadSettings(); if (st.retentionDays) L.purgeOld(+st.retentionDays); }, 24 * 3600e3); t.unref();
  return srv;
}
module.exports = {createServer, start};
if (require.main === module) {
  const stop = () => { A.flushSessions(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  start().then(srv => { const a = srv.address(); console.log(`Сервер сайта «Астрея»: http://${a.address === '0.0.0.0' ? 'localhost' : a.address}:${a.port}/   админка: /admin/   (сайт: ${C.ROOT})`); }).catch(e => { console.error(e); process.exit(1); });
}
