/* Настройки запуска (переменные окружения) и пути. Настройки, которые меняются из админки (уведомления, разрешённые адреса), лежат в data/settings.json. */
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
  notify: {
    webhookUrl: '',
    telegram: {token: '', chatId: ''},
    smtp: {host: '', port: 587, secure: false, user: '', pass: '', from: '', to: ''}
  },
  assistant: {apiKey: '', model: ''}                   // ИИ-помощник: ключ API и модель можно задать здесь (из админки); переменные окружения ANTHROPIC_API_KEY / ASSISTANT_MODEL главнее
};
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const deep = (a, b) => { const o = Array.isArray(a) ? a.slice() : Object.assign({}, a); for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' ? deep(a[k], b[k]) : b[k]; return o; };
const loadSettings = () => deep(DEFAULT_SETTINGS, readJSON(SETTINGS_FILE, {}));
const saveSettings = s => writeJSON(SETTINGS_FILE, s, 0o600);

module.exports = {
  ROOT, DATA, env, loadDotEnv, DEFAULT_SETTINGS, loadSettings, saveSettings, deep,
  PORT: +env.PORT || 8080, HOST: env.HOST || '0.0.0.0',
  TRUST_PROXY: env.TRUST_PROXY === '1',                // сервер за прокси (nginx, Render…): адрес клиента и https берутся из X-Forwarded-*
  SECURE_COOKIES: env.SECURE_COOKIES === '1',          // метка Secure у cookie (включайте при работе по https)
  PUBLISH_GIT: env.PUBLISH_GIT === '1',
  PUBLIC_URL: String(env.PUBLIC_URL || '').replace(/\/+$/, '')          // публичный адрес сервера — для ссылки на админку в уведомлениях
};
