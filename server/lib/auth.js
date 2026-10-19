/* Пользователи админки, пароли (scrypt), двухфакторный вход (TOTP + коды восстановления), сеансы, CSRF-токен, ограничение попыток входа. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('./config');
const vault = require('./vault');
const TOTP = require('./totp');
const {readJSON, writeJSON, randomId, safeEqual, sha256, nowISO, Mutex} = require('./util');

const USERS_FILE = path.join(C.DATA, 'users.json'), SESS_FILE = path.join(C.DATA, 'sessions.json'), SECRET_FILE = path.join(C.DATA, 'secret.key'), LOCK_FILE = path.join(C.DATA, 'throttle.json');
const ROLES = {admin: 'Администратор', manager: 'Менеджер (только заявки)'};
const limits = () => { const s = (C.loadSettings().security || {}); return {abs: Math.max(1, +s.sessionHours || 12) * 3600e3, idle: Math.max(0.25, +s.idleHours || 4) * 3600e3}; };
const mu = new Mutex();

let secret = null;
function getSecret() {                          // секрет для подписи (хэши IP и т. п.); создаётся один раз и хранится вне репозитория
  if (secret) return secret;
  try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (e) { secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SECRET_FILE, secret + '\n', {mode: 0o600}); }
  return secret;
}

/* ---- пароли ---- */
const SCRYPT = {N: 16384, r: 8, p: 1, len: 64};
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, SCRYPT.len, {N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p});
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${h.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  const [alg, N, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), Buffer.from(hash, 'base64').length, {N: +N, r: SCRYPT.r, p: SCRYPT.p});
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'base64'));
}
/* самые частые пароли и «основы» (без цифр и знаков): такие подбираются за секунды */
const COMMON = new Set(['password', 'passw0rd', 'qwerty', 'qwertyuiop', 'qwerty123', 'asdfgh', 'asdfghjkl', 'zxcvbnm', 'admin', 'administrator', 'administrateur', 'letmein', 'welcome', 'monkey', 'dragon', 'master', 'login', 'iloveyou', 'abc123', 'trustno1', 'sunshine', 'princess', 'football', 'baseball', 'superman', 'michael', 'shadow', 'astreya', 'astrea', 'astreja', 'rjpbyf', 'parol', 'password1', 'пароль', 'админ', 'администратор', 'йцукен', 'йцукенгшщзх', 'астрея', 'qazwsx', 'qazwsxedc', '1qaz2wsx', 'q1w2e3r4', 'zaq12wsx', 'changeme', 'secret', 'default', 'test', 'testtest', 'cosmetics', 'cosmetic', 'kosmetika', 'косметика', 'moscow', 'москва', 'summer', 'winter', 'spring', 'autumn', 'lena', 'natasha', 'sasha', 'irina']);
function passwordProblem(pw, login) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Пароль — не короче 12 символов.';
  if (pw.length > 200) return 'Пароль слишком длинный.';
  if (login && pw.toLowerCase().includes(String(login).toLowerCase())) return 'Пароль не должен содержать логин.';
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw) || !/\d/.test(pw)) return 'В пароле нужны и буквы, и цифры.';
  const low = pw.toLowerCase(), base = low.replace(/[^a-zа-яё]+/g, '');
  if (COMMON.has(low) || COMMON.has(base) || /(password|passw0rd|qwerty|asdfg|zxcvb|12345|astreya|admin|йцукен|пароль|админ)/.test(low)) return 'Пароль слишком простой — он входит в число самых популярных. Придумайте другой (лучше фразу из нескольких слов).';
  if (new Set(low).size < 6) return 'В пароле слишком много повторяющихся символов.';
  return null;
}

/* ---- пользователи ---- */
const loadUsers = () => readJSON(USERS_FILE, {users: []});
const saveUsers = d => writeJSON(USERS_FILE, d, 0o600);
const has2fa = u => !!(u && u.totp && u.totp.enabled);
const pub = u => u && ({id: u.id, login: u.login, name: u.name, role: u.role, mustChange: !!u.mustChange, disabled: !!u.disabled, createdAt: u.createdAt, lastLogin: u.lastLogin || null, totp: has2fa(u), recoveryLeft: has2fa(u) ? (u.totp.recovery || []).length : 0});
const validLogin = l => /^[a-z0-9._-]{3,32}$/i.test(String(l || ''));

function listUsers() { return loadUsers().users.map(pub); }
function createUser({login, name, role, password, mustChange}) {
  return mu.run(() => {
    if (!validLogin(login)) throw httpErr(400, 'Логин: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание.');
    if (!ROLES[role]) throw httpErr(400, 'Неизвестная роль.');
    const prob = passwordProblem(password, login); if (prob) throw httpErr(400, prob);
    const d = loadUsers();
    if (d.users.some(u => u.login.toLowerCase() === String(login).toLowerCase())) throw httpErr(409, 'Такой логин уже есть.');
    const u = {id: randomId(8), login: String(login), name: String(name || login).slice(0, 80), role, hash: hashPassword(password), mustChange: !!mustChange, disabled: false, createdAt: nowISO()};
    d.users.push(u); saveUsers(d); return pub(u);
  });
}
function updateUser(id, patch, actorId) {
  return mu.run(() => {
    const d = loadUsers(), u = d.users.find(x => x.id === id); if (!u) throw httpErr(404, 'Пользователь не найден.');
    const admins = () => d.users.filter(x => x.role === 'admin' && !x.disabled).length;
    if (patch.name !== undefined) u.name = String(patch.name).slice(0, 80);
    if (patch.role !== undefined) { if (!ROLES[patch.role]) throw httpErr(400, 'Неизвестная роль.'); if (u.role === 'admin' && patch.role !== 'admin' && admins() <= 1) throw httpErr(400, 'Нельзя снять роль с последнего администратора.'); u.role = patch.role; }          // роль читается при каждом запросе, поэтому права меняются сразу, без выхода из сеанса
    if (patch.disabled !== undefined) { if (patch.disabled && u.id === actorId) throw httpErr(400, 'Нельзя отключить самого себя.'); if (patch.disabled && u.role === 'admin' && admins() <= 1) throw httpErr(400, 'Нельзя отключить последнего администратора.'); u.disabled = !!patch.disabled; if (u.disabled) dropSessionsOf(u.id); }
    if (patch.password !== undefined) { const prob = passwordProblem(patch.password, u.login); if (prob) throw httpErr(400, prob); u.hash = hashPassword(patch.password); u.mustChange = patch.mustChange !== false; dropSessionsOf(u.id); }
    saveUsers(d); return pub(u);
  });
}
function deleteUser(id, actorId) {
  return mu.run(() => {
    const d = loadUsers(), u = d.users.find(x => x.id === id); if (!u) throw httpErr(404, 'Пользователь не найден.');
    if (u.id === actorId) throw httpErr(400, 'Нельзя удалить самого себя.');
    if (u.role === 'admin' && d.users.filter(x => x.role === 'admin' && !x.disabled).length <= 1) throw httpErr(400, 'Нельзя удалить последнего администратора.');
    d.users = d.users.filter(x => x.id !== id); saveUsers(d); dropSessionsOf(id);
  });
}
/* первый запуск: если пользователей нет — создаём администратора из ADMIN_LOGIN/ADMIN_PASSWORD или с одноразовым случайным паролем (печатается в журнал сервера) */
async function ensureAdmin(log) {
  if (loadUsers().users.length) return null;
  const login = C.env.ADMIN_LOGIN || 'admin';
  let password = C.env.ADMIN_PASSWORD, generated = false;
  if (!password) { password = crypto.randomBytes(9).toString('base64url') + '7a'; generated = true; }
  await createUser({login, name: 'Администратор', role: 'admin', password, mustChange: generated});
  if (generated) log(`\n  Создан администратор.  Логин: ${login}   Пароль: ${password}\n  (пароль показан один раз; при первом входе его нужно сменить)\n`);
  return {login, generated};
}

/* ---- сеансы ---- */
let sessions = null;
function loadSessions() { if (!sessions) { sessions = readJSON(SESS_FILE, {}); const t = Date.now(), L = limits(); for (const k of Object.keys(sessions)) if (t - sessions[k].created > L.abs || t - sessions[k].seen > L.idle) delete sessions[k]; } return sessions; }
let saveTimer = null;
function flushSessions() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } if (sessions) { try { writeJSON(SESS_FILE, sessions, 0o600); } catch (e) {} } }
function persistSessions() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { writeJSON(SESS_FILE, sessions, 0o600); } catch (e) {} }, 500); saveTimer.unref && saveTimer.unref(); }
const keyOf = token => sha256(token + getSecret());                // в файле лежат только хэши токенов
const sid = key => key.slice(0, 12);                               // короткий идентификатор сеанса для списка в админке (по нему сеанс можно завершить, войти по нему нельзя)
function dropSessionsOf(userId, exceptKey) { const s = loadSessions(); let n = 0; for (const k of Object.keys(s)) if (s[k].userId === userId && k !== exceptKey) { delete s[k]; n++; } persistSessions(); return n; }
function createSession(user, req, ip) {
  const s = loadSessions(), token = randomId(32), t = Date.now();
  // не копим сеансы: у одного пользователя не больше 10, самые старые завершаются
  const mine = Object.keys(s).filter(k => s[k].userId === user.id).sort((a, b) => s[a].seen - s[b].seen); while (mine.length >= 10) delete s[mine.shift()];
  s[keyOf(token)] = {userId: user.id, csrf: randomId(18), created: t, seen: t, ua: String((req && req.headers && req.headers['user-agent']) || '').slice(0, 160), ip: String(ip || '').slice(0, 60)};
  persistSessions(); return {token, csrf: s[keyOf(token)].csrf};
}
function getSession(token) {
  if (!token) return null;
  const s = loadSessions(), k = keyOf(token), r = s[k]; if (!r) return null;
  const t = Date.now(), L = limits();
  if (t - r.created > L.abs || t - r.seen > L.idle) { delete s[k]; persistSessions(); return null; }
  const u = loadUsers().users.find(x => x.id === r.userId); if (!u || u.disabled) { delete s[k]; persistSessions(); return null; }
  if (t - r.seen > 60e3) { r.seen = t; persistSessions(); }
  return {user: pub(u), csrf: r.csrf, key: k, id: sid(k), created: r.created};
}
function destroySession(token) { const s = loadSessions(); delete s[keyOf(token)]; persistSessions(); }
/* список сеансов: свои или (для администратора) все */
function listSessions(userId, all, currentKey) {
  const s = loadSessions(), users = loadUsers().users, t = Date.now(), L = limits();
  return Object.keys(s).filter(k => (all || s[k].userId === userId) && t - s[k].created <= L.abs && t - s[k].seen <= L.idle).map(k => { const u = users.find(x => x.id === s[k].userId); return {id: sid(k), userId: s[k].userId, login: u ? u.login : '—', ip: s[k].ip || '', ua: s[k].ua || '', created: new Date(s[k].created).toISOString(), seen: new Date(s[k].seen).toISOString(), current: k === currentKey}; }).sort((a, b) => b.seen.localeCompare(a.seen));
}
function revokeSession(id, userId, all, currentKey) {
  const s = loadSessions(), k = Object.keys(s).find(x => sid(x) === id && (all || s[x].userId === userId)); if (!k) throw httpErr(404, 'Сеанс не найден.');
  if (k === currentKey) throw httpErr(400, 'Это текущий сеанс — для выхода нажмите «Выйти».');
  delete s[k]; persistSessions(); return true;
}
const revokeOthers = (userId, currentKey) => dropSessionsOf(userId, currentKey);

/* ---- вход с ограничением попыток: 5 неудач подряд по паре «адрес + логин» — блокировка на 15 минут (растёт вдвое при повторах) ---- */
const fails = new Map(), ipFails = new Map();
try { const d = readJSON(LOCK_FILE, {}); const t = Date.now(); for (const [k, v] of Object.entries(d.fails || {})) if (v.until > t) fails.set(k, v); for (const [k, v] of Object.entries(d.ips || {})) if (v.until > t) ipFails.set(k, {hits: [], until: v.until}); } catch (e) {}
function saveLocks() { try { const t = Date.now(), f = {}, g = {}; for (const [k, v] of fails) if (v.until > t) f[k] = {until: v.until, lock: v.lock}; for (const [k, v] of ipFails) if (v.until > t) g[k] = {until: v.until}; writeJSON(LOCK_FILE, {fails: f, ips: g}, 0o600); } catch (e) {} }   // блокировки переживают перезапуск сервера
function throttleKey(ip, login) { return ip + '|' + String(login || '').toLowerCase(); }
function loginBlocked(ip, login) {
  const t = Date.now(), f = fails.get(throttleKey(ip, login)), g = ipFails.get(ip);
  return Math.max(f && f.until > t ? Math.ceil((f.until - t) / 1000) : 0, g && g.until > t ? Math.ceil((g.until - t) / 1000) : 0);
}
function noteFail(ip, login, onLock) {
  const k = throttleKey(ip, login), f = fails.get(k) || {n: 0, until: 0, lock: 15 * 60e3};
  f.n++; let locked = false; if (f.n >= 5) { f.until = Date.now() + f.lock; f.lock = Math.min(f.lock * 2, 24 * 3600e3); f.n = 0; locked = true; }
  fails.set(k, f); if (fails.size > 5000) fails.clear();
  // общий предел на адрес: перебор разных логопарей с одного адреса — 25 неудач за 15 минут → блокировка адреса
  const t = Date.now(), g = ipFails.get(ip) || {hits: [], until: 0}; g.hits = g.hits.filter(x => t - x < 15 * 60e3); g.hits.push(t); if (g.hits.length >= 25) { g.until = t + 15 * 60e3; g.hits = []; locked = true; }
  ipFails.set(ip, g); if (ipFails.size > 5000) ipFails.clear();
  if (locked) { saveLocks(); if (onLock) onLock(); }
}
const failHook = {fn: null};                                       // сервер подписывается, чтобы писать неудачи и блокировки в журнал
const setFailHook = fn => { failHook.fn = fn; };
const NOPE = 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

/* шаг 1: логин и пароль. Если у пользователя включён 2FA — возвращается билет на 5 минут, сеанс создаётся после кода */
const tickets = new Map(), fails2fa = new Map();          // неудачные коды 2FA по пользователю: 10 подряд → пауза 15 минут (перебор шестизначного кода через много билетов и адресов)
async function login(ip, loginName, password, req) {
  const wait = loginBlocked(ip, loginName);
  if (wait) { if (failHook.fn) failHook.fn('blocked', loginName, ip); throw httpErr(429, `Слишком много попыток входа. Подождите ${Math.ceil(wait / 60)} мин.`, {retry_after: wait}); }
  const d = loadUsers(), u = d.users.find(x => x.login.toLowerCase() === String(loginName || '').toLowerCase());
  // проверка пароля выполняется и для несуществующего логина (одинаковое время ответа)
  const ok = verifyPassword(String(password || ''), u ? u.hash : NOPE) && u && !u.disabled;
  if (!ok) { noteFail(ip, loginName, () => failHook.fn && failHook.fn('locked', loginName, ip)); if (failHook.fn) failHook.fn('fail', loginName, ip); throw httpErr(401, 'Неверный логин или пароль.'); }
  if (has2fa(u)) {
    const ticket = randomId(24); tickets.set(ticket, {userId: u.id, exp: Date.now() + 5 * 60e3, tries: 0, ip});
    if (tickets.size > 200) for (const [k, v] of tickets) if (v.exp < Date.now()) tickets.delete(k);
    return {need2fa: true, ticket};
  }
  fails.delete(throttleKey(ip, loginName));
  await mu.run(() => { const dd = loadUsers(), uu = dd.users.find(x => x.id === u.id); uu.lastLogin = nowISO(); saveUsers(dd); });
  return {user: pub(u), session: createSession(u, req, ip)};
}
const recoveryHash = code => sha256('rc:' + String(code).toLowerCase().replace(/[^a-z0-9]/g, '') + getSecret());
/* шаг 2: код из приложения или код восстановления */
async function login2fa(ip, ticket, code, req) {
  const wait = loginBlocked(ip, '2fa'); if (wait) throw httpErr(429, `Слишком много попыток. Подождите ${Math.ceil(wait / 60)} мин.`, {retry_after: wait});
  const tk = tickets.get(String(ticket || '')); if (!tk || tk.exp < Date.now()) { tickets.delete(ticket); throw httpErr(401, 'Время ввода кода истекло. Войдите заново.'); }
  const uf = fails2fa.get(tk.userId) || {n: 0, until: 0}; if (uf.until > Date.now()) { const w = Math.ceil((uf.until - Date.now()) / 1000); throw httpErr(429, `Слишком много неверных кодов. Подождите ${Math.ceil(w / 60)} мин.`, {retry_after: w}); }
  const bad = () => { uf.n++; if (uf.n >= 10) { uf.until = Date.now() + 15 * 60e3; uf.n = 0; if (failHook.fn) failHook.fn('locked', loginName(tk.userId), ip); } fails2fa.set(tk.userId, uf); tk.tries++; noteFail(ip, '2fa', () => failHook.fn && failHook.fn('locked', '2fa', ip)); if (failHook.fn) failHook.fn('fail2fa', loginName(tk.userId), ip); if (tk.tries >= 5) tickets.delete(ticket); throw httpErr(401, 'Неверный код.'); };
  return mu.run(() => {
    const d = loadUsers(), u = d.users.find(x => x.id === tk.userId); if (!u || u.disabled || !has2fa(u)) { tickets.delete(ticket); throw httpErr(401, 'Войдите заново.'); }
    const secretB32 = vault.open(u.totp.secret).value, c = String(code || '').trim();
    let usedRecovery = false;
    const step = secretB32 ? TOTP.verify(secretB32, c, u.totp.lastStep) : -1;
    if (step >= 0) u.totp.lastStep = step;
    else if (/^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(c)) { const h = recoveryHash(c), i = (u.totp.recovery || []).indexOf(h); if (i < 0) return bad(); u.totp.recovery.splice(i, 1); usedRecovery = true; }
    else return bad();
    tickets.delete(ticket); fails2fa.delete(u.id); u.lastLogin = nowISO(); saveUsers(d);
    fails.delete(throttleKey(ip, '2fa'));
    return {user: pub(u), session: createSession(u, req, ip), usedRecovery};
  });
}
const loginName = id => { const u = loadUsers().users.find(x => x.id === id); return u ? u.login : '—'; };

/* ---- двухфакторный вход: подключение, отключение ---- */
const pending2fa = new Map();
function totpBegin(userId, issuer) {
  const u = loadUsers().users.find(x => x.id === userId); if (!u) throw httpErr(404, 'Пользователь не найден.');
  if (has2fa(u)) throw httpErr(409, 'Двухфакторный вход уже включён.');
  const s = TOTP.newSecret(); pending2fa.set(userId, {secret: s, exp: Date.now() + 15 * 60e3, tries: 0});
  return {secret: s.replace(/(.{4})/g, '$1 ').trim(), uri: TOTP.uri(s, u.login, issuer || 'Астрея'), account: u.login};
}
function totpConfirm(userId, code) {
  const p = pending2fa.get(userId); if (!p || p.exp < Date.now()) throw httpErr(400, 'Начните подключение заново.');
  if (++p.tries > 8) { pending2fa.delete(userId); throw httpErr(429, 'Слишком много неверных кодов. Начните заново.'); }
  const step = TOTP.verify(p.secret, code); if (step < 0) throw httpErr(422, 'Код не подошёл. Проверьте время на телефоне и введите актуальный код.');
  return mu.run(() => {
    const d = loadUsers(), u = d.users.find(x => x.id === userId); if (!u) throw httpErr(404, 'Пользователь не найден.');
    const codes = Array.from({length: 10}, () => { const r = crypto.randomBytes(5).toString('hex').slice(0, 8); return r.slice(0, 4) + '-' + r.slice(4); });
    u.totp = {enabled: true, secret: vault.seal(p.secret), lastStep: step, since: nowISO(), recovery: codes.map(recoveryHash)};
    saveUsers(d); pending2fa.delete(userId); return {codes};
  });
}
/* отключение: нужен пароль (и действующий код — это защищает от угнанного сеанса) */
function totpDisable(userId, password, code) {
  return mu.run(() => {
    const d = loadUsers(), u = d.users.find(x => x.id === userId); if (!u || !has2fa(u)) throw httpErr(400, 'Двухфакторный вход не включён.');
    if (!verifyPassword(String(password || ''), u.hash)) throw httpErr(403, 'Пароль указан неверно.');
    const c = String(code || '').trim(), s = vault.open(u.totp.secret).value, step = s ? TOTP.verify(s, c, u.totp.lastStep) : -1, ri = (u.totp.recovery || []).indexOf(recoveryHash(c));
    if (step < 0 && ri < 0) throw httpErr(403, 'Код не подошёл.');
    delete u.totp; saveUsers(d); return true;
  });
}
/* администратор сбрасывает 2FA другому пользователю (потерян телефон); его сеансы завершаются */
function totpReset(userId) {
  return mu.run(() => { const d = loadUsers(), u = d.users.find(x => x.id === userId); if (!u) throw httpErr(404, 'Пользователь не найден.'); delete u.totp; saveUsers(d); dropSessionsOf(userId); return pub(u); });
}
/* новые коды восстановления (старые перестают действовать); нужен действующий код из приложения */
function totpNewRecovery(userId, code) {
  return mu.run(() => {
    const d = loadUsers(), u = d.users.find(x => x.id === userId); if (!u || !has2fa(u)) throw httpErr(400, 'Двухфакторный вход не включён.');
    const s = vault.open(u.totp.secret).value, step = s ? TOTP.verify(s, code, u.totp.lastStep) : -1; if (step < 0) throw httpErr(403, 'Код не подошёл.');
    u.totp.lastStep = step; const codes = Array.from({length: 10}, () => { const r = crypto.randomBytes(5).toString('hex').slice(0, 8); return r.slice(0, 4) + '-' + r.slice(4); });
    u.totp.recovery = codes.map(recoveryHash); saveUsers(d); return {codes};
  });
}

async function changeOwnPassword(userId, oldPw, newPw, currentKey) {
  const d = loadUsers(), u = d.users.find(x => x.id === userId); if (!u) throw httpErr(404, 'Пользователь не найден.');
  if (!verifyPassword(String(oldPw || ''), u.hash)) throw httpErr(403, 'Текущий пароль указан неверно.');
  if (safeEqual(oldPw, newPw)) throw httpErr(400, 'Новый пароль должен отличаться от прежнего.');
  const prob = passwordProblem(newPw, u.login); if (prob) throw httpErr(400, prob);
  await mu.run(() => { const dd = loadUsers(), uu = dd.users.find(x => x.id === userId); uu.hash = hashPassword(newPw); uu.mustChange = false; saveUsers(dd); });
  return dropSessionsOf(userId, currentKey);                       // все остальные сеансы (в том числе чужие, если пароль был украден) завершаются
}

const safeEqualToken = (a, b) => safeEqual(a, b);
function httpErr(status, message, extra) { const e = new Error(message); e.status = status; e.extra = extra; return e; }
module.exports = {flushSessions, safeEqualToken, safeEqual, ROLES, getSecret, hashPassword, verifyPassword, passwordProblem, listUsers, createUser, updateUser, deleteUser, ensureAdmin, createSession, getSession, destroySession, login, login2fa, changeOwnPassword, httpErr, pub, setFailHook,
  listSessions, revokeSession, revokeOthers, totpBegin, totpConfirm, totpDisable, totpReset, totpNewRecovery, has2fa, limits, loadUsersRaw: loadUsers};
