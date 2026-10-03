/* Настройки запуска (переменные окружения) и пути. Настройки, которые меняются из админки (уведомления, разрешённые адреса), лежат в data/settings.json. */
'use strict';
const path = require('path'), fs = require('fs');
const {readJSON, writeJSON} = require('./util');

const env = process.env;
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
  }
};
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const deep = (a, b) => { const o = Array.isArray(a) ? a.slice() : Object.assign({}, a); for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' ? deep(a[k], b[k]) : b[k]; return o; };
const loadSettings = () => deep(DEFAULT_SETTINGS, readJSON(SETTINGS_FILE, {}));
const saveSettings = s => writeJSON(SETTINGS_FILE, s, 0o600);

module.exports = {
  ROOT, DATA, env, DEFAULT_SETTINGS, loadSettings, saveSettings, deep,
  PORT: +env.PORT || 8080, HOST: env.HOST || '0.0.0.0',
  TRUST_PROXY: env.TRUST_PROXY === '1',                // сервер за прокси (nginx, Render…): адрес клиента и https берутся из X-Forwarded-*
  SECURE_COOKIES: env.SECURE_COOKIES === '1',          // метка Secure у cookie (включайте при работе по https)
  PUBLISH_GIT: env.PUBLISH_GIT === '1',
  PUBLIC_URL: String(env.PUBLIC_URL || '').replace(/\/+$/, '')          // публичный адрес сервера — для ссылки на админку в уведомлениях
};
