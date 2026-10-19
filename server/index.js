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
const ASSIST = require('./lib/assistant');
const INT = require('./lib/integrations');
const LAUNCH = require('./lib/launch');
const BK = require('./lib/backup');
const PRIV = require('./lib/privacy');
const SECX = require('./lib/security');
const ZIP = require('./lib/zip');
const vault = require('./lib/vault');
const {httpErr} = A;

const ADMIN_DIR = path.join(__dirname, 'admin');
const SITE_ALLOW = rel => /^[^/]+\.(html|xml|txt|ico|webmanifest)$/.test(rel) || /^\.well-known\/security\.txt$/.test(rel) || /^(assets|css|js|brands|products|training|news|pages)\//.test(rel);
const ADMIN_CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'";
const SECRET_MASK = '••••••••';

const siteUrl = () => { try { return JSON.parse(fs.readFileSync(path.join(C.ROOT, 'data', 'site.json'), 'utf8')).url || ''; } catch (e) { return ''; } };
const originOf = u => { try { return new URL(u).origin; } catch (e) { return ''; } };

/* адрес клиента: без прокси — адрес соединения; за доверенным прокси (TRUST_PROXY=1) берём запись, добавленную ближайшим доверенным прокси, а не первую (первую подделывает сам клиент) */
function clientIp(req) {
  if (C.TRUST_PROXY) { const parts = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean), x = parts[parts.length - C.PROXY_HOPS]; if (x) return x; }
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

/* журнал с адресом: кто, что, откуда */
const log = (req, who, action, detail) => AUD.add(who, action, detail, clientIp(req));
A.setFailHook((kind, login, ip) => {
  if (!(C.loadSettings().security || {}).loginAlerts) return;
  const name = /^[a-z0-9._-]{3,32}$/i.test(String(login || '')) ? login : '(неверный формат логина)';
  AUD.add(name, kind === 'fail' ? 'login_fail' : kind === 'fail2fa' ? 'login_fail2fa' : kind === 'blocked' ? 'login_blocked' : 'login_locked', kind === 'fail' ? 'неверный логин или пароль' : kind === 'fail2fa' ? 'неверный код 2FA' : kind === 'blocked' ? 'попытка входа во время блокировки' : 'превышен предел попыток — блокировка', ip);
});

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
    const body = await H.readJSONBody(req, 32 * 1024), settings = C.loadSettings(), ip = clientIp(req);
    const captcha = await INT.verifyCaptcha(body.captcha_token, ip, settings);
    const r = await L.receive(body, {ipHash: L.ipHash(ip), ua: req.headers['user-agent'], origin: req.headers.origin || '', captcha}, settings);
    if (r.notify) N.notifyLead(r.lead, settings, C.PUBLIC_URL ? C.PUBLIC_URL + '/admin/' : '').then(out => { if (out.some(x => !x.ok)) AUD.add('система', 'notify_failed', r.id + ': ' + out.filter(x => !x.ok).map(x => x.channel + ' — ' + x.error).join('; ')); }).catch(() => {});
    H.json(res, 200, {ok: true, id: r.id}, cors);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('lead error:', e);
    H.json(res, status, Object.assign({ok: false, error: status === 429 ? 'rate_limited' : status === 422 ? 'invalid' : 'error', message: status >= 500 ? 'Внутренняя ошибка. Попробуйте позже.' : e.message}, e.extra || {}), Object.assign({}, cors, e.extra && e.extra.retry_after ? {'Retry-After': String(e.extra.retry_after)} : {}));
  }
}

/* ---------- публичное: ИИ-режим помощника (ответ потоком; без ключа и модели в окружении — выключен) ---------- */
function handleAssistant(req, res) {
  const cors = corsHeaders(req);
  if (req.method !== 'GET' && !originAllowed(req)) return H.json(res, 403, {ok: false, error: 'forbidden', message: 'Помощник отвечает только на сайте.'}, cors);
  return ASSIST.handle(req, res, {cors, ip: L.ipHash(clientIp(req))});
}

/* ---------- админский API ---------- */
const need = (ctx, ...roles) => { if (!roles.includes(ctx.user.role)) throw httpErr(403, 'Недостаточно прав.'); };
const maskSettings = s => { const o = JSON.parse(JSON.stringify(s)); for (const p of C.SECRET_PATHS) if (C.getPath(o, p)) C.setPath(o, p, SECRET_MASK); delete o.security; delete o.launch; return o; };
const mergeSecrets = (neu, old) => { const o = JSON.parse(JSON.stringify(neu)); for (const p of C.SECRET_PATHS) if (C.getPath(o, p) === SECRET_MASK) C.setPath(o, p, C.getPath(old, p) || ''); return o; };
function checkSettings(s) {
  const url = v => !v || /^https?:\/\/[^\s]+$/.test(v);
  if (!s || typeof s !== 'object') throw httpErr(400, 'Некорректные настройки.');
  if (!Array.isArray(s.allowedOrigins) || !s.allowedOrigins.every(x => typeof x === 'string' && /^https?:\/\/[^\s/]+$/.test(x))) throw httpErr(422, 'Разрешённые сайты: адреса вида https://example.com (без пути и слэша на конце).');
  if (s.notify && !url(s.notify.webhookUrl)) throw httpErr(422, 'Веб-хук: полный адрес https://…');
  if (s.notify && s.notify.webhookUrl) { try { require('./lib/netguard').parse(s.notify.webhookUrl); } catch (e) { throw httpErr(422, 'Веб-хук: ' + e.message + '.'); } }
  const sm = s.notify && s.notify.smtp; if (sm && sm.host && (!sm.to || !sm.from && !sm.user)) throw httpErr(422, 'SMTP: укажите получателя и отправителя.');
  const as = s.assistant || {}; if (typeof as.apiKey !== 'string' || (as.apiKey && !/^[\x21-\x7e]{8,400}$/.test(as.apiKey))) throw httpErr(422, 'Ключ API: только латиница, цифры и знаки без пробелов (8–400 символов), как он выдан в консоли.'); if (['anthropic', 'openai'].indexOf(as.provider) < 0) throw httpErr(422, 'Сервис ИИ: «anthropic» или «openai» (любой OpenAI-совместимый).'); if (typeof as.baseUrl !== 'string' || (as.baseUrl && !/^https?:\/\/[^\s]{3,300}$/.test(as.baseUrl))) throw httpErr(422, 'Адрес сервиса: полный адрес вида https://api.example.com/v1 (http:// допустим только для своих локальных моделей).'); if (typeof as.tools !== 'boolean') as.tools = true; if (typeof as.model !== 'string' || (as.model && !/^[A-Za-z0-9._:\/-]{1,100}$/.test(as.model))) throw httpErr(422, 'Модель: идентификатор из документации, латиница, цифры и знаки . _ : / - (до 100 символов).');
  const rl = s.rateLimit || {}; if (!(+rl.per10min >= 1 && +rl.perDay >= 1)) throw httpErr(422, 'Ограничение заявок: положительные числа.');
  if (s.retentionDays !== undefined && !(+s.retentionDays >= 0)) throw httpErr(422, 'Срок хранения: число дней (0 — не удалять).');
  const it = s.integrations || {}, tok = (v, w) => { if (typeof v !== 'string' || (v && !/^[\x21-\x7e]{8,600}$/.test(v))) throw httpErr(422, w + ': только латиница, цифры и знаки без пробелов (8–600 символов).'); };
  tok((it.metrika || {}).token, 'Токен Метрики'); tok((it.captcha || {}).serverKey, 'Серверный ключ SmartCaptcha');
  const bx = it.bitrix24 || {}, bxRe = NG_ALLOW() ? /^https?:\/\/[^\s/]+\/rest\/\d+\/[\w-]+\/?$/ : /^https:\/\/[^\s/]+\/rest\/\d+\/[\w-]+\/?$/; if (typeof bx.webhook !== 'string' || (bx.webhook && !bxRe.test(bx.webhook))) throw httpErr(422, 'Битрикс24: адрес входящего веб-хука вида https://<портал>.bitrix24.ru/rest/<номер>/<код>/ .');
  if (bx.webhook) { try { require('./lib/netguard').parse(bx.webhook, {httpsOnly: !NG_ALLOW()}); } catch (e) { throw httpErr(422, 'Битрикс24: ' + e.message + '.'); } }
  if (bx.enabled && !bx.webhook) throw httpErr(422, 'Битрикс24: включено, но адрес веб-хука не указан.');
  if (bx.source !== undefined && !/^[A-Z0-9_]{1,40}$/.test(String(bx.source))) throw httpErr(422, 'Битрикс24: источник — латиница в верхнем регистре (например WEB).');
  const cp = it.captcha || {}; if (cp.url && !/^https:\/\/[^\s]+$/.test(cp.url) && !(NG_ALLOW() && /^http:\/\//.test(cp.url))) throw httpErr(422, 'SmartCaptcha: адрес проверки — https://…');
  if (cp.enabled && !cp.serverKey) throw httpErr(422, 'SmartCaptcha: включена, но серверный ключ не указан.');
}
const NG_ALLOW = () => require('./lib/netguard').allowPrivate();

async function handleApi(req, res, url) {
  const p = url.pathname, m = req.method;
  if (p === '/api/lead') return handleLead(req, res);
  if (p === '/api/assistant' || p === '/api/assistant/status') return handleAssistant(req, res);
  if (p === '/api/health') return H.json(res, 200, {ok: true, time: new Date().toISOString(), build: (B.last() || {}).at || null});

  /* дальше — админский API: может быть закрыт списком разрешённых адресов (Безопасность → Доступ по адресам) */
  const ip = clientIp(req);
  if (!SECX.ipAllowed(ip)) { AUD.add('—', 'ip_denied', p, ip); throw httpErr(403, 'С этого адреса вход в админку не разрешён.'); }
  if (!originAllowed(req) && m !== 'GET') throw httpErr(403, 'Запрос с чужого сайта отклонён.');
  const secure = isHttps(req), cookies = H.parseCookies(req.headers.cookie), token = H.sessionToken(cookies);
  const setSession = (sess) => ({'Set-Cookie': H.cookie(H.cookieName(secure), sess.token, {secure, maxAge: Math.floor(A.limits().abs / 1000)})});

  if (p === '/api/login' && m === 'POST') {
    const b = await H.readJSONBody(req, 4096);
    const r = await A.login(ip, String(b.login || '').slice(0, 64), String(b.password || '').slice(0, 300), req);
    if (r.need2fa) return H.json(res, 200, {need2fa: true, ticket: r.ticket});
    AUD.add(r.user.login, 'login', 'вход', ip);
    return H.json(res, 200, {user: r.user, csrf: r.session.csrf}, setSession(r.session));
  }
  if (p === '/api/login/2fa' && m === 'POST') {
    const b = await H.readJSONBody(req, 2048);
    const r = await A.login2fa(ip, String(b.ticket || ''), String(b.code || '').slice(0, 20), req);
    AUD.add(r.user.login, 'login', r.usedRecovery ? 'вход с кодом восстановления (осталось ' + r.user.recoveryLeft + ')' : 'вход с кодом 2FA', ip);
    return H.json(res, 200, {user: r.user, csrf: r.session.csrf, usedRecovery: r.usedRecovery}, setSession(r.session));
  }
  const sess = A.getSession(token);
  const needs2fa = !!(sess && SECX.mustSetup2fa(sess.user));
  if (p === '/api/me' && m === 'GET') return sess ? H.json(res, 200, {user: sess.user, csrf: sess.csrf, needs2fa}) : H.json(res, 401, {error: 'Требуется вход.'});
  if (!sess) throw httpErr(401, 'Требуется вход.');
  const ctx = {user: sess.user, csrf: sess.csrf, who: sess.user.login, sess};
  if (m !== 'GET' && m !== 'HEAD') { if (!A.safeEqualToken(String(req.headers['x-csrf-token'] || ''), sess.csrf)) throw httpErr(403, 'Сессия устарела. Обновите страницу.'); }

  if (p === '/api/logout' && m === 'POST') { A.destroySession(token); log(req, ctx.who, 'logout'); return H.json(res, 200, {ok: true}, {'Set-Cookie': H.cookie(H.cookieName(secure), '', {secure, maxAge: 0})}); }
  if (p === '/api/password' && m === 'POST') {
    const b = await H.readJSONBody(req, 4096);
    const dropped = await A.changeOwnPassword(ctx.user.id, b.old, b.new, sess.key); log(req, ctx.who, 'password', 'смена пароля' + (dropped ? ', завершено других сеансов: ' + dropped : ''));
    return H.json(res, 200, {ok: true, dropped});
  }
  /* двухфакторный вход: подключение доступно каждому пользователю (в том числе менеджеру) */
  if (p === '/api/2fa' && m === 'GET') return H.json(res, 200, {enabled: ctx.user.totp, recoveryLeft: ctx.user.recoveryLeft, required: SECX.requires2fa(ctx.user)});
  if (p === '/api/2fa/begin' && m === 'POST') return H.json(res, 200, A.totpBegin(ctx.user.id, 'Астрея'));
  if (p === '/api/2fa/confirm' && m === 'POST') { const b = await H.readJSONBody(req, 1024); const r = await A.totpConfirm(ctx.user.id, b.code); log(req, ctx.who, '2fa_on', 'двухфакторный вход включён'); return H.json(res, 200, r); }
  if (p === '/api/2fa/disable' && m === 'POST') {
    if (SECX.requires2fa(ctx.user)) throw httpErr(403, 'Политика безопасности требует двухфакторный вход для администраторов — отключить его нельзя.');
    const b = await H.readJSONBody(req, 1024); await A.totpDisable(ctx.user.id, b.password, b.code); log(req, ctx.who, '2fa_off', 'двухфакторный вход отключён'); return H.json(res, 200, {ok: true});
  }
  if (p === '/api/2fa/recovery' && m === 'POST') { const b = await H.readJSONBody(req, 1024); const r = await A.totpNewRecovery(ctx.user.id, b.code); log(req, ctx.who, '2fa_recovery', 'выпущены новые коды восстановления'); return H.json(res, 200, r); }
  /* свои сеансы */
  if (p === '/api/sessions' && m === 'GET') { const all = url.searchParams.get('all') === '1' && ctx.user.role === 'admin'; return H.json(res, 200, {items: A.listSessions(ctx.user.id, all, sess.key)}); }
  if (p === '/api/sessions/revoke-others' && m === 'POST') { const n = A.revokeOthers(ctx.user.id, sess.key); log(req, ctx.who, 'sessions_revoke', 'завершены другие сеансы: ' + n); return H.json(res, 200, {revoked: n}); }
  let mm = p.match(/^\/api\/sessions\/([0-9a-f]{12})$/);
  if (mm && m === 'DELETE') { A.revokeSession(mm[1], ctx.user.id, ctx.user.role === 'admin', sess.key); log(req, ctx.who, 'sessions_revoke', 'завершён сеанс ' + mm[1]); return H.json(res, 200, {ok: true}); }

  if (sess.user.mustChange) throw httpErr(403, 'Сначала смените пароль.', {mustChange: true});
  if (needs2fa) throw httpErr(403, 'Политика безопасности: администратору нужно включить двухфакторный вход.', {needs2fa: true});

  if (p === '/api/config' && m === 'GET') return H.json(res, 200, {statuses: L.STATUSES, types: L.TYPE_TITLES, roles: A.ROLES, publish: await P.status(), siteUrl: siteUrl(), origin: (isHttps(req) ? 'https' : 'http') + '://' + req.headers.host, uploadDirs: F.DIRS, maxUpload: F.MAX, vault: vault.enabled(), https: secure});

  /* заявки (администратор и менеджер) */
  if (p === '/api/leads' && m === 'GET') { need(ctx, 'admin', 'manager'); return H.json(res, 200, L.list(Object.fromEntries(url.searchParams))); }
  if (p === '/api/leads/stats' && m === 'GET') { need(ctx, 'admin', 'manager'); return H.json(res, 200, L.stats()); }
  if (p === '/api/leads.csv' && m === 'GET') { need(ctx, 'admin', 'manager'); log(req, ctx.who, 'export', 'выгрузка заявок в CSV'); return H.send(res, 200, L.csv(Object.fromEntries(url.searchParams)), {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads-' + new Date().toISOString().slice(0, 10) + '.csv"', 'Cache-Control': 'no-store'}); }
  mm = p.match(/^\/api\/leads\/(L\d+)$/);
  if (mm) {
    need(ctx, 'admin', 'manager');
    if (m === 'GET') { const x = L.get(mm[1]); if (!x) throw httpErr(404, 'Заявка не найдена.'); return H.json(res, 200, x); }
    if (m === 'PATCH') { const b = await H.readJSONBody(req, 8192); const x = await L.update(mm[1], {status: b.status, comment: b.comment}, ctx.who); log(req, ctx.who, 'lead', mm[1] + (b.status ? ' → ' + L.STATUSES[b.status] : '') + (b.comment ? ' + комментарий' : '')); return H.json(res, 200, x); }
    if (m === 'DELETE') { need(ctx, 'admin'); await L.remove(mm[1], ctx.who); log(req, ctx.who, 'lead_delete', mm[1]); return H.json(res, 200, {ok: true}); }
  }

  /* дальше — только администратор */
  need(ctx, 'admin');
  if (p === '/api/collections' && m === 'GET') return H.json(res, 200, {collections: CT.summary()});
  mm = p.match(/^\/api\/collections\/([a-z0-9_]+)$/);
  if (mm) {
    if (m === 'GET') return H.json(res, 200, CT.read(mm[1]));
    if (m === 'PUT') { const b = await H.readJSONBody(req, 6e6); const r = await CT.save(mm[1], b.data, {version: b.version, who: ctx.who}); log(req, ctx.who, 'content', mm[1] + (r.unchanged ? ' (без изменений)' : '')); return H.json(res, 200, r); }
  }
  mm = p.match(/^\/api\/collections\/([a-z0-9_]+)\/history$/); if (mm && m === 'GET') return H.json(res, 200, {items: CT.history(mm[1])});
  mm = p.match(/^\/api\/collections\/([a-z0-9_]+)\/restore$/);
  if (mm && m === 'POST') { const b = await H.readJSONBody(req, 4096); const r = await CT.restore(mm[1], b.id, ctx.who); log(req, ctx.who, 'restore', mm[1] + ' ← ' + b.id); return H.json(res, 200, r); }

  if (p === '/api/assistant/info' && m === 'GET') return H.json(res, 200, ASSIST.info());
  if (p === '/api/assistant/test' && m === 'POST') {
    const now = Date.now(); if (now - (handleApi.lastAiTest || 0) < 4000) throw httpErr(429, 'Подождите несколько секунд между проверками.'); handleApi.lastAiTest = now;
    const r = await ASSIST.selfTest(); log(req, ctx.who, 'assistant_test', r.ok ? 'проверка ИИ: успешно' : 'проверка ИИ: ' + (r.code || 'ошибка')); return H.json(res, 200, r);
  }
  if (p === '/api/overview' && m === 'GET') return H.json(res, 200, Object.assign(INS.overview(), {siteAudit: B.lastAudit(), launch: (() => { const l = LAUNCH.run({https: secure}); return {ready: l.ready, blockers: l.blockers, warnings: l.warnings, ok: l.ok, total: l.total}; })()}));
  if (p === '/api/site-pages' && m === 'GET') return H.json(res, 200, {pages: INS.sitePages()});
  if (p === '/api/search' && m === 'GET') return H.json(res, 200, {items: INS.search(url.searchParams.get('q'))});
  if (p === '/api/site-audit' && m === 'POST') { const r = await B.audit(); log(req, ctx.who, 'site_audit', `${r.errors} ошибок, ${r.warns} замечаний`); return H.json(res, 200, r); }
  if (p === '/api/files/usage' && m === 'GET') return H.json(res, 200, {used: F.usedIn(String(url.searchParams.get('path') || ''))});
  if (p === '/api/files' && m === 'GET') return H.json(res, 200, {dirs: F.list()});
  if (p === '/api/files' && m === 'POST') { const b = await H.readJSONBody(req, 9 * 1024 * 1024); const buf = Buffer.from(String(b.data || ''), 'base64'); const r = F.upload(b.dir, b.name, buf); log(req, ctx.who, 'upload', r.path); return H.json(res, 200, r); }
  if (p === '/api/files' && m === 'DELETE') { const r = F.remove(url.searchParams.get('path'), url.searchParams.get('force') === '1'); log(req, ctx.who, 'file_delete', r.path); return H.json(res, 200, r); }

  if (p === '/api/build' && m === 'GET') return H.json(res, 200, B.last() || {});
  if (p === '/api/build' && m === 'POST') { const r = await B.build('пересборка из админки'); log(req, ctx.who, 'build', r.ok ? 'успешно' : 'ошибка'); return H.json(res, r.ok ? 200 : 422, r); }
  if (p === '/api/site.zip' && m === 'GET') {
    log(req, ctx.who, 'site_zip', 'скачан архив сайта');
    res.writeHead(200, Object.assign({}, H.SEC, {'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="astreya-site-' + new Date().toISOString().slice(0, 10) + '.zip"', 'Cache-Control': 'no-store'}));
    try { await ZIP.stream(res); } catch (e) { console.error('zip:', e.message); res.destroy(); } res.end(); return;
  }
  if (p === '/api/publish' && m === 'GET') return H.json(res, 200, await P.status());
  if (p === '/api/publish' && m === 'POST') { const b = await H.readJSONBody(req, 4096); const r = await P.publish(b.message, ctx.who); log(req, ctx.who, 'publish', r.commit || r.message || ''); return H.json(res, 200, r); }

  /* настройки (уведомления, антиспам, ИИ, секреты интеграций); политика безопасности, чек-лист и копии меняются отдельными запросами */
  if (p === '/api/settings' && m === 'GET') return H.json(res, 200, maskSettings(C.loadSettings()));
  if (p === '/api/settings' && m === 'PUT') {
    const b = await H.readJSONBody(req, 32768), cur = C.loadSettings(); const s = mergeSecrets(b, cur); checkSettings(s);
    const next = C.deep(C.DEFAULT_SETTINGS, s); next.security = cur.security; next.launch = cur.launch; next.backup = cur.backup;
    C.saveSettings(next); log(req, ctx.who, 'settings', SECX.diffKeys(cur, next)); return H.json(res, 200, maskSettings(C.loadSettings()));
  }
  if (p === '/api/settings/test-notify' && m === 'POST') { const out = await N.test(C.loadSettings()); log(req, ctx.who, 'notify_test', out.map(x => x.channel + ':' + (x.ok ? 'ok' : 'ошибка')).join(', ')); return H.json(res, 200, {results: out, configured: out.length > 0}); }

  /* интеграции */
  if (p === '/api/integrations' && m === 'GET') return H.json(res, 200, INT.summary(C.loadSettings()));
  if (p === '/api/integrations/metrika/check' && m === 'POST') { const r = await INT.metrikaCheck(C.loadSettings()); log(req, ctx.who, 'integration', 'проверка счётчика Метрики'); return H.json(res, 200, r); }
  if (p === '/api/integrations/metrika/goals' && m === 'GET') return H.json(res, 200, {goals: await INT.metrikaGoals(C.loadSettings())});
  if (p === '/api/integrations/metrika/sync-goals' && m === 'POST') { const r = await INT.metrikaSyncGoals(C.loadSettings()); log(req, ctx.who, 'integration', 'цели Метрики: создано ' + r.created.length + ', уже были ' + r.skipped.length + (r.failed.length ? ', ошибок ' + r.failed.length : '')); return H.json(res, 200, r); }
  if (p === '/api/integrations/metrika/stats' && m === 'GET') return H.json(res, 200, await INT.metrikaStats(C.loadSettings(), url.searchParams.get('days')));
  if (p === '/api/integrations/bitrix24/test' && m === 'POST') {
    const s = C.loadSettings(), bx = s.integrations.bitrix24; if (!bx.webhook) throw httpErr(400, 'Адрес веб-хука Битрикс24 не указан.');
    const lead = {id: 'L00000', type: 'question', name: 'Проверка связи с сайтом', phone: '', email: 'test@example.com', msg: 'Тестовый лид из админки сайта «Астрея». Его можно удалить.', page: '', created_at: new Date().toISOString()};
    try { const id = await N.bitrix24(bx, lead, N.text(lead, '')); log(req, ctx.who, 'integration', 'проверка Битрикс24: успешно'); return H.json(res, 200, {ok: true, id}); }
    catch (e) { log(req, ctx.who, 'integration', 'проверка Битрикс24: ошибка'); throw httpErr(502, e.message); }
  }

  /* запуск: чек-лист готовности */
  if (p === '/api/launch' && m === 'GET') return H.json(res, 200, LAUNCH.run({https: secure}));
  if (p === '/api/launch/confirm' && m === 'POST') {
    const b = await H.readJSONBody(req, 1024), item = LAUNCH.run({https: secure}).items.find(x => x.id === b.id && x.manual); if (!item) throw httpErr(404, 'Такого пункта нет или он проверяется автоматически.');
    const s = C.loadSettings(); if (b.value === false) delete s.launch.confirmed[b.id]; else s.launch.confirmed[b.id] = {by: ctx.who, at: new Date().toISOString()};
    C.saveSettings(s); log(req, ctx.who, 'launch_confirm', (b.value === false ? 'снято: ' : 'подтверждено: ') + item.title); return H.json(res, 200, LAUNCH.run({https: secure}));
  }

  /* безопасность */
  if (p === '/api/security' && m === 'GET') return H.json(res, 200, SECX.status({https: secure, ip, req}));
  if (p === '/api/security' && m === 'PUT') { const b = await H.readJSONBody(req, 4096); const r = SECX.save(b, ip, ctx.user); log(req, ctx.who, 'security', r.changed.join('; ') || 'без изменений'); return H.json(res, 200, SECX.status({https: secure, ip, req})); }
  if (p === '/api/security/seal' && m === 'POST') { if (!vault.enabled()) throw httpErr(400, 'Ключ шифрования DATA_KEY не задан (минимум 16 символов).'); C.saveSettings(C.loadSettings()); log(req, ctx.who, 'security', 'секреты зашифрованы на диске'); return H.json(res, 200, SECX.status({https: secure, ip, req})); }

  /* персональные данные */
  if (p === '/api/privacy/registry' && m === 'GET') return H.json(res, 200, PRIV.registry(C.loadSettings()));
  if (p === '/api/privacy/search' && m === 'GET') { const items = PRIV.search(url.searchParams.get('q')); log(req, ctx.who, 'privacy', 'поиск по обращению субъекта: найдено ' + items.length); return H.json(res, 200, {items}); }
  if (p === '/api/privacy/export' && m === 'GET') { const r = PRIV.exportSubject(url.searchParams.get('q')); log(req, ctx.who, 'privacy', 'выгрузка данных субъекта: ' + r.count); return H.send(res, 200, JSON.stringify(r, null, 2), {'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="subject-data.json"', 'Cache-Control': 'no-store'}); }
  if (p === '/api/privacy/erase' && m === 'POST') { const b = await H.readJSONBody(req, 8192); const r = await PRIV.erase(b.ids, ctx.who); log(req, ctx.who, 'privacy_erase', 'удалено заявок: ' + r.removed + (b.reason ? ' (' + String(b.reason).slice(0, 80) + ')' : '')); return H.json(res, 200, r); }

  /* резервные копии */
  if (p === '/api/backups' && m === 'GET') { const s = C.loadSettings(); return H.json(res, 200, {items: BK.list(), auto: s.backup.auto, keep: s.backup.keep, encrypted: vault.enabled()}); }
  if (p === '/api/backups' && m === 'POST') { const r = await BK.create(ctx.who, 'manual'); log(req, ctx.who, 'backup', 'создана копия ' + r.id); return H.json(res, 200, r); }
  if (p === '/api/backups/settings' && m === 'PUT') { const b = await H.readJSONBody(req, 512), s = C.loadSettings(); s.backup = {auto: b.auto !== false, keep: Math.max(3, Math.min(+b.keep || 14, 90))}; C.saveSettings(s); log(req, ctx.who, 'backup', 'настройки копий'); return H.json(res, 200, s.backup); }
  mm = p.match(/^\/api\/backups\/([\w.-]+)(\/download|\/restore-leads)?$/);
  if (mm) {
    if (m === 'GET' && mm[2] === '/download') { log(req, ctx.who, 'backup', 'скачана копия ' + mm[1]); return H.send(res, 200, JSON.stringify(BK.bundle(mm[1]), null, 2), {'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="backup-' + mm[1].slice(0, 19) + '.json"', 'Cache-Control': 'no-store'}); }
    if (m === 'POST' && mm[2] === '/restore-leads') { const r = await BK.restoreLeads(mm[1], ctx.who); log(req, ctx.who, 'backup', 'заявки восстановлены из ' + mm[1] + ' (' + r.restored + ')'); return H.json(res, 200, r); }
    if (m === 'DELETE' && !mm[2]) { BK.remove(mm[1]); log(req, ctx.who, 'backup', 'удалена копия ' + mm[1]); return H.json(res, 200, {ok: true}); }
  }

  /* пользователи */
  if (p === '/api/users' && m === 'GET') return H.json(res, 200, {users: A.listUsers()});
  if (p === '/api/users' && m === 'POST') { const b = await H.readJSONBody(req, 4096); const u = await A.createUser({login: b.login, name: b.name, role: b.role, password: b.password, mustChange: true}); log(req, ctx.who, 'user_create', u.login + ' (' + u.role + ')'); return H.json(res, 200, u); }
  mm = p.match(/^\/api\/users\/([\w-]+)\/reset-2fa$/);
  if (mm && m === 'POST') { const u = await A.totpReset(mm[1]); log(req, ctx.who, '2fa_reset', 'сброшен 2FA у ' + u.login); return H.json(res, 200, u); }
  mm = p.match(/^\/api\/users\/([\w-]+)$/);
  if (mm && m === 'PATCH') { const b = await H.readJSONBody(req, 4096); const u = await A.updateUser(mm[1], b, ctx.user.id); log(req, ctx.who, 'user_update', u.login + (b.password ? ' (пароль сброшен)' : '')); return H.json(res, 200, u); }
  if (mm && m === 'DELETE') { await A.deleteUser(mm[1], ctx.user.id); log(req, ctx.who, 'user_delete', mm[1]); return H.json(res, 200, {ok: true}); }
  if (p === '/api/audit' && m === 'GET') { const q = String(url.searchParams.get('q') || '').toLowerCase(), act = url.searchParams.get('action'); return H.json(res, 200, {items: AUD.tail(+url.searchParams.get('limit') || 100, x => (!act || x.action === act) && (!q || JSON.stringify(x).toLowerCase().includes(q))), size: AUD.size()}); }

  throw httpErr(404, 'Неизвестный запрос.');
}

/* кэширование статики: страницы всегда сверяются с сервером; файлы с версией в адресе (?v=хэш: скрипты, стили, картинки) и шрифты с хэшем в имени не меняются — храним год;
   кадры вступления — неделю; остальное — час */
function cacheControl(rel, ext, url) {
  if (ext === '.html' || ext === '.xml' || ext === '.txt') return 'no-cache';
  if (ext === '.woff2' || (url && url.searchParams.has('v'))) return 'public, max-age=31536000, immutable';
  if (/^assets\/jar\//.test(rel)) return 'public, max-age=604800';
  return 'public, max-age=3600';
}

/* заголовки сайта: политика безопасности страницы (из <meta>, который кладёт сборка) + защита от встраивания на чужие сайты */
const policyCache = new Map();
function sitePolicy(file) {
  let st; try { st = fs.statSync(file); } catch (e) { return null; }
  const hit = policyCache.get(file); if (hit && hit.m === st.mtimeMs) return hit.v;
  let v = null; try { const t = fs.readFileSync(file, 'utf8').slice(0, 20000), mt = t.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i); if (mt) v = mt[1] + "; frame-ancestors 'self'"; } catch (e) {}
  policyCache.set(file, {m: st.mtimeMs, v}); if (policyCache.size > 500) policyCache.clear(); return v;
}
const SECURITY_TXT = () => {
  const s = INT.siteData('site') || {}, base = String(s.url || '').replace(/\/?$/, '/'), mail = (s.contacts || {}).email || '';
  return `Contact: mailto:${mail}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)}T00:00:00.000Z\nPreferred-Languages: ru, en\nCanonical: ${base}.well-known/security.txt\n`;
};

function createServer() {
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    for (const [k, v] of Object.entries(H.SEC)) res.setHeader(k, v);                                       // защитные заголовки — на каждый ответ, в том числе на ошибки
    if (isHttps(req)) res.setHeader('Strict-Transport-Security', H.HSTS);
    try {
      if (url.pathname.startsWith('/api/')) { try { return await handleApi(req, res, url); } catch (e) { const st = e.status || 500; if (st === 500) console.error(e); return H.json(res, st, Object.assign({error: st === 500 ? 'Внутренняя ошибка.' : e.message}, e.extra || {}), e.extra && e.extra.retry_after ? {'Retry-After': String(e.extra.retry_after)} : {}); } }
      if (req.method !== 'GET' && req.method !== 'HEAD') return H.send(res, 405, 'method not allowed', {Allow: 'GET, HEAD'});
      if (url.pathname === '/admin') return H.send(res, 301, '', {Location: '/admin/'});
      if (url.pathname.startsWith('/admin/')) {
        if (!SECX.ipAllowed(clientIp(req))) return H.send(res, 403, 'Доступ с этого адреса закрыт.', {'Content-Type': 'text/plain; charset=utf-8'});
        return H.serveStatic(req, res, ADMIN_DIR, url.pathname.slice('/admin/'.length), {allow: r => /^[\w.-]+\.(html|css|js)$/.test(r), noCache: true, headers: (r, ext) => Object.assign({'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin'}, ext === '.html' ? {'Content-Security-Policy': ADMIN_CSP, 'X-Frame-Options': 'DENY'} : {}), notFoundFile: null});
      }
      if (url.pathname === '/.well-known/security.txt' && !fs.existsSync(path.join(C.ROOT, '.well-known', 'security.txt'))) return H.send(res, 200, SECURITY_TXT(), {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache'});
      return H.serveStatic(req, res, C.ROOT, url.pathname.slice(1), {allow: SITE_ALLOW, headers: (r, ext, f) => Object.assign({'Cache-Control': cacheControl(r, ext, url), 'X-Frame-Options': 'SAMEORIGIN'}, ext === '.html' && sitePolicy(f) ? {'Content-Security-Policy': sitePolicy(f)} : {}), cleanUrls: true, notFoundFile: path.join(C.ROOT, '404.html')});
    } catch (e) { console.error(e); try { H.send(res, 500, 'error'); } catch (x) {} }
  });
  srv.headersTimeout = 20000; srv.requestTimeout = 120000; srv.keepAliveTimeout = 5000;            // медленные «висящие» соединения не копятся
  return srv;
}

async function start(port, host) {
  await A.ensureAdmin(m => console.log(m));
  const srv = createServer();
  await new Promise(r => srv.listen(port === undefined ? C.PORT : port, host || C.HOST, r));
  const daily = async () => {
    const st = C.loadSettings(); if (st.retentionDays) L.purgeOld(+st.retentionDays);
    if (st.backup.auto) { const last = BK.lastAt(); if (!last || Date.now() - Date.parse(last) > 23 * 3600e3) { try { await BK.create('авто', 'auto'); } catch (e) { console.error('backup:', e.message); } } }
  };
  await daily();
  const t = setInterval(() => daily().catch(() => {}), 3600e3); t.unref();
  return srv;
}
module.exports = {createServer, start};
if (require.main === module) {
  const stop = () => { A.flushSessions(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  start().then(srv => { const a = srv.address(); console.log(`Сервер сайта «Астрея»: http://${a.address === '0.0.0.0' ? 'localhost' : a.address}:${a.port}/   админка: /admin/   (сайт: ${C.ROOT})`); }).catch(e => { console.error(e); process.exit(1); });
}
