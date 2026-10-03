/* Пользователи админки, пароли (scrypt), сессии, CSRF-токен, ограничение попыток входа. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const C = require('./config');
const {readJSON, writeJSON, randomId, safeEqual, sha256, nowISO, Mutex} = require('./util');

const USERS_FILE = path.join(C.DATA, 'users.json'), SESS_FILE = path.join(C.DATA, 'sessions.json'), SECRET_FILE = path.join(C.DATA, 'secret.key');
const ROLES = {admin: 'Администратор', manager: 'Менеджер (только заявки)'};
const SESSION_ABS_MS = 12 * 3600e3, SESSION_IDLE_MS = 4 * 3600e3;
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
function passwordProblem(pw, login) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Пароль — не короче 10 символов.';
  if (pw.length > 200) return 'Пароль слишком длинный.';
  if (login && pw.toLowerCase().includes(String(login).toLowerCase())) return 'Пароль не должен содержать логин.';
  if (!/[A-Za-zА-Яа-я]/.test(pw) || !/\d/.test(pw)) return 'В пароле нужны и буквы, и цифры.';
  return null;
}

/* ---- пользователи ---- */
const loadUsers = () => readJSON(USERS_FILE, {users: []});
const saveUsers = d => writeJSON(USERS_FILE, d, 0o600);
const pub = u => u && ({id: u.id, login: u.login, name: u.name, role: u.role, mustChange: !!u.mustChange, disabled: !!u.disabled, createdAt: u.createdAt, lastLogin: u.lastLogin || null});
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
    if (patch.role !== undefined) { if (!ROLES[patch.role]) throw httpErr(400, 'Неизвестная роль.'); if (u.role === 'admin' && patch.role !== 'admin' && admins() <= 1) throw httpErr(400, 'Нельзя снять роль с последнего администратора.'); u.role = patch.role; }
    if (patch.disabled !== undefined) { if (patch.disabled && u.id === actorId) throw httpErr(400, 'Нельзя отключить самого себя.'); if (patch.disabled && u.role === 'admin' && admins() <= 1) throw httpErr(400, 'Нельзя отключить последнего администратора.'); u.disabled = !!patch.disabled; }
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

/* ---- сессии ---- */
let sessions = null;
function loadSessions() { if (!sessions) { sessions = readJSON(SESS_FILE, {}); const t = Date.now(); for (const k of Object.keys(sessions)) if (t - sessions[k].created > SESSION_ABS_MS || t - sessions[k].seen > SESSION_IDLE_MS) delete sessions[k]; } return sessions; }
let saveTimer = null;
function flushSessions() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } if (sessions) { try { writeJSON(SESS_FILE, sessions, 0o600); } catch (e) {} } }
function persistSessions() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; try { writeJSON(SESS_FILE, sessions, 0o600); } catch (e) {} }, 500); saveTimer.unref && saveTimer.unref(); }
const keyOf = token => sha256(token + getSecret());                // в файле лежат только хэши токенов
function dropSessionsOf(userId) { const s = loadSessions(); for (const k of Object.keys(s)) if (s[k].userId === userId) delete s[k]; persistSessions(); }
function createSession(user, req) {
  const s = loadSessions(), token = randomId(32);
  s[keyOf(token)] = {userId: user.id, csrf: randomId(18), created: Date.now(), seen: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 160)};
  persistSessions(); return {token, csrf: s[keyOf(token)].csrf};
}
function getSession(token) {
  if (!token) return null;
  const s = loadSessions(), k = keyOf(token), r = s[k]; if (!r) return null;
  const t = Date.now();
  if (t - r.created > SESSION_ABS_MS || t - r.seen > SESSION_IDLE_MS) { delete s[k]; persistSessions(); return null; }
  const u = loadUsers().users.find(x => x.id === r.userId); if (!u || u.disabled) { delete s[k]; persistSessions(); return null; }
  if (t - r.seen > 60e3) { r.seen = t; persistSessions(); }
  return {user: pub(u), csrf: r.csrf, key: k};
}
function destroySession(token) { const s = loadSessions(); delete s[keyOf(token)]; persistSessions(); }

/* ---- вход с ограничением попыток: 5 неудач подряд по паре «адрес + логин» — блокировка на 15 минут (растёт вдвое при повторах) ---- */
const fails = new Map(), ipFails = new Map();
function throttleKey(ip, login) { return ip + '|' + String(login || '').toLowerCase(); }
function loginBlocked(ip, login) {
  const t = Date.now(), f = fails.get(throttleKey(ip, login)), g = ipFails.get(ip);
  return Math.max(f && f.until > t ? Math.ceil((f.until - t) / 1000) : 0, g && g.until > t ? Math.ceil((g.until - t) / 1000) : 0);
}
function noteFail(ip, login) {
  const k = throttleKey(ip, login), f = fails.get(k) || {n: 0, until: 0, lock: 15 * 60e3};
  f.n++; if (f.n >= 5) { f.until = Date.now() + f.lock; f.lock = Math.min(f.lock * 2, 24 * 3600e3); f.n = 0; }
  fails.set(k, f); if (fails.size > 5000) fails.clear();
  // общий предел на адрес: перебор разных логопарей с одного адреса — 25 неудач за 15 минут → блокировка адреса
  const t = Date.now(), g = ipFails.get(ip) || {hits: [], until: 0}; g.hits = g.hits.filter(x => t - x < 15 * 60e3); g.hits.push(t); if (g.hits.length >= 25) { g.until = t + 15 * 60e3; g.hits = []; }
  ipFails.set(ip, g); if (ipFails.size > 5000) ipFails.clear();
}
async function login(ip, loginName, password, req) {
  const wait = loginBlocked(ip, loginName);
  if (wait) throw httpErr(429, `Слишком много попыток входа. Подождите ${Math.ceil(wait / 60)} мин.`, {retry_after: wait});
  const d = loadUsers(), u = d.users.find(x => x.login.toLowerCase() === String(loginName || '').toLowerCase());
  // проверка пароля выполняется и для несуществующего логина (одинаковое время ответа)
  const ok = verifyPassword(String(password || ''), u ? u.hash : 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64')) && u && !u.disabled;
  if (!ok) { noteFail(ip, loginName); throw httpErr(401, 'Неверный логин или пароль.'); }
  fails.delete(throttleKey(ip, loginName));
  await mu.run(() => { const dd = loadUsers(), uu = dd.users.find(x => x.id === u.id); uu.lastLogin = nowISO(); saveUsers(dd); });
  return {user: pub(u), session: createSession(u, req)};
}
async function changeOwnPassword(userId, oldPw, newPw) {
  const d = loadUsers(), u = d.users.find(x => x.id === userId); if (!u) throw httpErr(404, 'Пользователь не найден.');
  if (!verifyPassword(String(oldPw || ''), u.hash)) throw httpErr(403, 'Текущий пароль указан неверно.');
  if (safeEqual(oldPw, newPw)) throw httpErr(400, 'Новый пароль должен отличаться от прежнего.');
  const prob = passwordProblem(newPw, u.login); if (prob) throw httpErr(400, prob);
  await mu.run(() => { const dd = loadUsers(), uu = dd.users.find(x => x.id === userId); uu.hash = hashPassword(newPw); uu.mustChange = false; saveUsers(dd); });
}

const safeEqualToken = (a, b) => safeEqual(a, b);
function httpErr(status, message, extra) { const e = new Error(message); e.status = status; e.extra = extra; return e; }
module.exports = {flushSessions, safeEqualToken, safeEqual, ROLES, getSecret, hashPassword, verifyPassword, passwordProblem, listUsers, createUser, updateUser, deleteUser, ensureAdmin, createSession, getSession, destroySession, login, changeOwnPassword, httpErr, pub};
