/* Настройки запуска (переменные окружения) и пути. Настройки, которые меняются из админки (уведомления, интеграции, безопасность), лежат в data/settings.json. */
'use strict';
const path = require('path'), fs = require('fs');
const {readJSON, writeJSON} = require('./util');

const env = process.env;
/* файл .env (необязательно): строки КЛЮЧ=значение, # — комментарий; уже заданные переменные окружения не перезаписываются. Нужен, чтобы подключить ИИ-помощника без правки команд запуска:
   скопируйте server/.env.example в server/.env и впишите ANTHROPIC_API_KEY и ASSISTANT_MODEL. Файл .env в репозиторий не попадает (.gitignore); значения нигде не выводятся. */
function loadDotEnv(file, target) {
  let t; try { t = fs.readFileSync(file, 'utf8'); } catch (e) { return 0; } let n = 0;
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/); if (!m || /^\s*#/.test(line)) continue;
    let v = m[2]; const q = v.match(/^(['"])(.*?)\1(?:\s+#.*)?$/); v = q ? q[2] : v.replace(/\s+#.*$/, '');
    if (target[m[1]] === undefined && v !== '') { target[m[1]] = v; n++; }
  }
  return n;
}
loadDotEnv(path.join(__dirname, '..', '.env'), env); loadDotEnv(path.join(__dirname, '..', '..', '.env'), env);
const ROOT = path.resolve(env.SITE_ROOT || path.join(__dirname, '..', '..'));          // папка сайта (в ней tools/build.js, data/, готовые страницы)
const DATA = path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data'));          // приватные данные сервера: заявки, пользователи, резервные копии
fs.mkdirSync(DATA, {recursive: true, mode: 0o700});

const DEFAULT_SETTINGS = {
  allowedOrigins: [],                                  // с каких сайтов принимать заявки (CORS); адрес из data/site.json → url добавляется сам
  autoBuild: true,                                     // пересобирать сайт после сохранения содержимого
  rateLimit: {per10min: 5, perDay: 30},                // заявок с одного адреса
  minFillMs: 700,                                      // быстрее — подозрительно (бот): заявка остаётся, но помечается; автозаполнение браузера укладывается в ~1 с
  retentionDays: 0,                                    // сколько дней хранить закрытые заявки (0 — не удалять)
  notify: {
    webhookUrl: '',
    telegram: {token: '', chatId: ''},
    smtp: {host: '', port: 587, secure: false, user: '', pass: '', from: '', to: ''}
  },
  assistant: {provider: 'anthropic', baseUrl: '', apiKey: '', model: '', tools: true},                   // ИИ-помощник: сервис (anthropic | openai-совместимый), адрес, ключ и модель задаются здесь (из админки); переменные окружения ASSISTANT_* главнее
  security: {
    require2fa: env.NODE_ENV === 'production',         // администраторы без двухфакторного входа обязаны включить его при следующем входе (в рабочем режиме, например в Docker, по умолчанию включено; переменная REQUIRE_2FA=0/1 главнее)
    ipAllowlist: [],                                   // если не пусто — админка и её API открываются только с этих адресов / сетей (CIDR)
    sessionHours: 12, idleHours: 4,                    // предельная и «холостая» длительность сеанса
    loginAlerts: true                                  // писать в журнал неудачные входы и блокировки
  },
  integrations: {
    metrika: {token: ''},                              // OAuth-токен для чтения статистики и управления целями (не нужен для самого счётчика)
    bitrix24: {enabled: false, webhook: '', source: 'WEB'},   // входящий веб-хук Битрикс24: https://<портал>.bitrix24.ru/rest/<id>/<код>/
    captcha: {enabled: false, serverKey: '', url: 'https://smartcaptcha.yandexcloud.net/validate'}   // Yandex SmartCaptcha: серверный ключ (клиентский — в data/integrations.json)
  },
  launch: {confirmed: {}},                             // ручные подтверждения чек-листа запуска: ключ → {by, at}
  backup: {auto: true, keep: 14}                       // ежесуточная резервная копия данных сервера
};
/* значения, которые никогда не отдаются в браузер и (если задан DATA_KEY) хранятся зашифрованными */
const SECRET_PATHS = [['notify', 'telegram', 'token'], ['notify', 'smtp', 'pass'], ['assistant', 'apiKey'], ['integrations', 'metrika', 'token'], ['integrations', 'bitrix24', 'webhook'], ['integrations', 'captcha', 'serverKey']];
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
/* слияние с защитой от загрязнения прототипа; лишние ключи, которых нет в образце, отбрасываются (b — присланное, a — образец) */
function deep(a, b) {
  const o = Array.isArray(a) ? a.slice() : Object.assign({}, a);
  for (const k of Object.keys(b || {})) {
    if (UNSAFE.has(k)) continue;
    const known = a && Object.prototype.hasOwnProperty.call(a, k), freeMap = a && !Array.isArray(a) && !Object.keys(a).length;      // пустой объект в образце — свободный словарь (launch.confirmed)
    if (!known && !freeMap && !Array.isArray(a)) continue;
    o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deep(a[k], b[k]) : b[k];
  }
  return o;
}
/* вложенное чтение/запись по пути */
const getPath = (o, p) => p.reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
function setPath(o, p, v) { let x = o; for (let i = 0; i < p.length - 1; i++) { if (!x[p[i]] || typeof x[p[i]] !== 'object') x[p[i]] = {}; x = x[p[i]]; } x[p[p.length - 1]] = v; }
let cache = {sig: '', val: null, vaultBroken: false};
function loadSettings() {
  let st = null; try { st = fs.statSync(SETTINGS_FILE); } catch (e) {}
  const sig = st ? st.mtimeMs + ':' + st.size + ':' + (env.DATA_KEY || '') : 'none';          // ключ входит в подпись: смена DATA_KEY сразу меняет то, как читаются секреты
  if (cache.val && cache.sig === sig) return JSON.parse(JSON.stringify(cache.val));
  const vault = require('./vault'); let broken = false;
  const s = deep(DEFAULT_SETTINGS, readJSON(SETTINGS_FILE, {}));
  for (const p of SECRET_PATHS) { const cur = getPath(s, p); if (vault.isSealed(cur)) { const r = vault.open(cur); if (!r.ok) broken = true; setPath(s, p, r.value); } }
  cache = {sig, val: s, vaultBroken: broken};
  return JSON.parse(JSON.stringify(s));
}
/* true, если в settings.json есть зашифрованные значения, а подходящего ключа DATA_KEY нет */
const vaultBroken = () => { loadSettings(); return cache.vaultBroken; };
function saveSettings(s) {
  const vault = require('./vault'), out = JSON.parse(JSON.stringify(s));
  for (const p of SECRET_PATHS) { const cur = getPath(out, p); if (cur) setPath(out, p, vault.seal(cur)); }
  writeJSON(SETTINGS_FILE, out, 0o600); cache = {sig: '', val: null, vaultBroken: false};
}
/* сколько секретов лежит в открытом виде / зашифровано (для раздела «Безопасность») */
function secretsState() {
  let raw = {}; try { raw = readJSON(SETTINGS_FILE, {}); } catch (e) {}
  let plain = 0, sealed = 0; for (const p of SECRET_PATHS) { const v = getPath(raw, p); if (v) { if (require('./vault').isSealed(v)) sealed++; else plain++; } }
  return {plain, sealed};
}

module.exports = {
  ROOT, DATA, env, loadDotEnv, DEFAULT_SETTINGS, SECRET_PATHS, loadSettings, saveSettings, secretsState, vaultBroken, deep, getPath, setPath,
  PORT: +env.PORT || 8080, HOST: env.HOST || '0.0.0.0',
  TRUST_PROXY: env.TRUST_PROXY === '1',                // сервер за прокси (nginx, Render…): адрес клиента и https берутся из X-Forwarded-*
  PROXY_HOPS: Math.max(1, +env.TRUSTED_PROXY_HOPS || 1),   // сколько доверенных прокси стоит перед сервером (адрес клиента — N-й справа в X-Forwarded-For)
  SECURE_COOKIES: env.SECURE_COOKIES === '1',          // метка Secure у cookie (включайте при работе по https)
  PUBLISH_GIT: env.PUBLISH_GIT === '1',
  PUBLIC_URL: String(env.PUBLIC_URL || '').replace(/\/+$/, '')          // публичный адрес сервера — для ссылки на админку в уведомлениях
};
