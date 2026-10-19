/* Политика безопасности админки: обязательный 2FA, список разрешённых адресов, длительность сеансов; сводка состояния для раздела «Безопасность». */
'use strict';
const net = require('net');
const C = require('./config');
const A = require('./auth');
const vault = require('./vault');
const AUD = require('./audit');
const BK = require('./backup');
const {httpErr} = A;

/* ---- адреса: одиночный или сеть (CIDR), IPv4 и IPv6 ---- */
function toBig(ip) {
  ip = String(ip || '').trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i); if (mapped) ip = mapped[1];
  if (net.isIPv4(ip)) return {v: 4, n: ip.split('.').reduce((a, o) => (a << 8n) | BigInt(+o), 0n)};
  if (net.isIPv6(ip)) {
    let [h, t] = ip.split('::'); const head = h ? h.split(':') : [], tail = t !== undefined ? (t ? t.split(':') : []) : [];
    if (t === undefined && head.length !== 8) return null;
    const mid = t !== undefined ? Array(8 - head.length - tail.length).fill('0') : [], parts = [...head, ...mid, ...tail];
    if (parts.length !== 8) return null; return {v: 6, n: parts.reduce((a, p) => (a << 16n) | BigInt(parseInt(p || '0', 16)), 0n)};
  }
  return null;
}
function parseEntry(s) {
  const [addr, bitsS] = String(s || '').trim().split('/'), a = toBig(addr); if (!a) return null;
  const max = a.v === 4 ? 32 : 128, bits = bitsS === undefined ? max : +bitsS; if (!Number.isInteger(bits) || bits < 0 || bits > max || (bitsS !== undefined && !/^\d{1,3}$/.test(bitsS))) return null;
  const shift = BigInt(max - bits); return {v: a.v, net: (a.n >> shift) << shift, shift};
}
function matches(list, ip) {
  const a = toBig(ip); if (!a) return false;
  return list.some(e => { const p = parseEntry(e); return p && p.v === a.v && ((a.n >> p.shift) << p.shift) === p.net; });
}
const ipAllowed = ip => {
  if (C.env.ADMIN_IP_ALLOW_DISABLE === '1') return true;
  const list = ((C.loadSettings().security || {}).ipAllowlist) || [];
  return !list.length || matches(list, ip);
};
/* обязателен ли 2FA: переменная REQUIRE_2FA (0 / 1) главнее настройки из админки — так владелец не потеряет доступ, если нет приложения-аутентификатора */
const policy2fa = () => C.env.REQUIRE_2FA === '1' ? true : C.env.REQUIRE_2FA === '0' ? false : !!C.loadSettings().security.require2fa;
const requires2fa = user => !!(policy2fa() && user && user.role === 'admin');
const mustSetup2fa = user => requires2fa(user) && !user.totp;

/* что изменилось в настройках — только названия полей, без значений (секреты в журнал не попадают) */
function flat(o, pre, out) { for (const k of Object.keys(o || {})) { const v = o[k], key = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = JSON.stringify(v); } return out; }
function diffKeys(a, b) {
  const x = flat(a, '', {}), y = flat(b, '', {}), secret = new Set(C.SECRET_PATHS.map(p => p.join('.'))), out = [];
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[k] !== y[k]) out.push(secret.has(k) ? k + ' (секрет)' : k);
  return out.slice(0, 20).join(', ') || 'без изменений';
}

function save(body, ip, user) {
  const s = C.loadSettings(), cur = s.security, next = Object.assign({}, cur), changed = [];
  if (body.require2fa !== undefined) { next.require2fa = body.require2fa === true; }
  if (body.ipAllowlist !== undefined) {
    if (!Array.isArray(body.ipAllowlist) || body.ipAllowlist.length > 50) throw httpErr(422, 'Список адресов: не больше 50 строк.');
    const list = [...new Set(body.ipAllowlist.map(x => String(x).trim()).filter(Boolean))];
    const bad = list.find(x => !parseEntry(x)); if (bad) throw httpErr(422, `Адрес «${bad}» не распознан. Допустимо: 203.0.113.5, 203.0.113.0/24, 2001:db8::/32.`);
    next.ipAllowlist = list;
  }
  if (body.sessionHours !== undefined) { const v = +body.sessionHours; if (!(v >= 1 && v <= 72)) throw httpErr(422, 'Длительность сеанса: от 1 до 72 часов.'); next.sessionHours = v; }
  if (body.idleHours !== undefined) { const v = +body.idleHours; if (!(v >= 0.25 && v <= 24)) throw httpErr(422, 'Время бездействия: от 0,25 до 24 часов.'); next.idleHours = v; }
  if (body.loginAlerts !== undefined) next.loginAlerts = body.loginAlerts !== false;
  if (next.ipAllowlist.length && C.env.ADMIN_IP_ALLOW_DISABLE !== '1' && !matches(next.ipAllowlist, ip)) throw httpErr(422, `Ваш текущий адрес ${ip} не входит в список — вы потеряли бы доступ. Добавьте его.`);
  if (next.require2fa && user.role === 'admin' && !user.totp) throw httpErr(422, 'Сначала включите двухфакторный вход у себя (раздел «Безопасность» → «Двухфакторный вход»), затем делайте его обязательным для всех.');
  for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(cur[k])) changed.push(k);
  s.security = next; C.saveSettings(s); return {changed};
}

/* сводка для раздела «Безопасность» */
function status(o) {
  const s = C.loadSettings(), sec = s.security, users = A.listUsers(), admins = users.filter(u => u.role === 'admin' && !u.disabled), since = Date.now() - 864e5;
  const events = AUD.tail(1000, x => Date.parse(x.t) > since), count = a => events.filter(x => x.action === a).length;
  const st = C.secretsState();
  return {
    policy: {require2fa: policy2fa(), require2faEnv: C.env.REQUIRE_2FA === '0' || C.env.REQUIRE_2FA === '1', ipAllowlist: sec.ipAllowlist, sessionHours: sec.sessionHours, idleHours: sec.idleHours, loginAlerts: sec.loginAlerts, ipOverride: C.env.ADMIN_IP_ALLOW_DISABLE === '1'},
    you: {ip: o.ip, allowed: ipAllowed(o.ip)},
    server: {https: !!o.https, secureCookies: C.SECURE_COOKIES, trustProxy: C.TRUST_PROXY, proxyHops: C.PROXY_HOPS, host: C.HOST, publicUrl: C.PUBLIC_URL, node: process.version, publishGit: C.PUBLISH_GIT, allowPrivateNetwork: require('./netguard').allowPrivate()},
    vault: {enabled: vault.enabled(), keyShort: !!C.env.DATA_KEY && !vault.enabled(), plain: st.plain, sealed: st.sealed, broken: C.vaultBroken()},
    users: {total: users.length, admins: admins.length, adminsWith2fa: admins.filter(u => u.totp).length, without2fa: admins.filter(u => !u.totp).map(u => u.login), temporaryPasswords: users.filter(u => !u.disabled && u.mustChange).map(u => u.login)},
    activity: {failedLogins24h: count('login_fail') + count('login_fail2fa'), lockouts24h: count('login_locked') + count('login_blocked'), deniedByIp24h: count('ip_denied'), logins24h: count('login')},
    sessions: A.listSessions(null, true).length,
    audit: {size: AUD.size()},
    lastBackup: BK.lastAt(),
    protections: [
      'Пароли хранятся только в виде scrypt-хэшей; перебор ограничен (5 неудач — блокировка на 15 минут и дольше при повторах, предел на адрес).',
      'Сеанс: cookie HttpOnly + SameSite=Strict' + (o.https ? ' + Secure + префикс __Host-' : '') + ', в базе — только хэш токена, защита от подделки запросов (CSRF-токен), смена пароля завершает остальные сеансы.',
      'Каждый ответ получает заголовки: X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy' + (o.https ? ', Strict-Transport-Security (HSTS)' : '') + '; страницы сайта — ещё и Content-Security-Policy (разрешены только свои скрипты и скрипты Яндекса, если подключены) и защита от встраивания.',
      'Исходящие запросы (веб-хук, Битрикс24, Метрика, капча) проверяются: адреса внутренней сети и служебные адреса облака заблокированы, перенаправления не выполняются.',
      'Загрузка файлов: только растровые изображения, проверка содержимого, безопасные имена, ограничение размера.',
      'Все действия администраторов и неудачные входы пишутся в журнал с адресом; журнал сам ротируется.'
    ]
  };
}
module.exports = {ipAllowed, policy2fa, requires2fa, mustSetup2fa, diffKeys, save, status, matches, parseEntry};
