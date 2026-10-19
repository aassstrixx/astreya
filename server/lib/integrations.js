/* Интеграции с российскими сервисами: Яндекс Метрика (проверка счётчика, цели, статистика через API), Yandex SmartCaptcha (проверка токена на сервере), Битрикс24 (см. notify.js).
   Публичные настройки (номер счётчика, коды подтверждения, режим согласия) лежат в data/integrations.json и попадают на сайт при сборке; секреты (OAuth-токен, ключ капчи, веб-хук CRM) — в настройках сервера, наружу не отдаются. */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./config');
const NG = require('./netguard');
const {httpErr} = require('./auth');

const siteData = name => { try { return JSON.parse(fs.readFileSync(path.join(C.ROOT, 'data', name + '.json'), 'utf8')); } catch (e) { return null; } };
const pub = () => siteData('integrations') || {};
const METRIKA_API = () => String(C.env.METRIKA_API_BASE || 'https://api-metrika.yandex.net').replace(/\/+$/, '');

/* ---------- Яндекс Метрика ---------- */
const counterId = () => { const id = String(((pub().metrika) || {}).id || '').trim(); return /^\d{4,12}$/.test(id) ? id : ''; };
async function mApi(method, p, body, token) {
  if (!token) throw httpErr(400, 'Не задан OAuth-токен Метрики (Интеграции → Яндекс Метрика → Доступ к API).');
  let r; try { r = await NG.request(METRIKA_API() + p, {method, headers: Object.assign({Authorization: 'OAuth ' + token, Accept: 'application/json'}, body ? {'Content-Type': 'application/json'} : {}), body: body ? JSON.stringify(body) : undefined, timeout: 15000}); }
  catch (e) { throw httpErr(502, 'Нет связи с API Метрики: ' + e.message); }
  if (r.status === 401 || r.status === 403) throw httpErr(502, 'API Метрики отклонил токен (' + r.status + '): проверьте токен и права «Получение статистики, чтение параметров своих и доверенных счётчиков» и «Изменение параметров своих счётчиков».');
  if (r.status === 404) throw httpErr(502, 'Счётчик не найден в этом аккаунте Метрики (404): токен выдан другому пользователю или номер указан неверно.');
  if (r.status < 200 || r.status >= 300) throw httpErr(502, 'API Метрики ответил ' + r.status + ((r.json && r.json.message) ? ': ' + r.json.message : ''));
  return r.json || {};
}
async function metrikaCheck(settings) {
  const id = counterId(); if (!id) throw httpErr(400, 'Номер счётчика не указан (Интеграции → Яндекс Метрика).');
  const j = await mApi('GET', `/management/v1/counter/${id}`, null, settings.integrations.metrika.token), c = j.counter || {};
  return {id, name: c.name || '', site: c.site || c.site2 && c.site2.site || '', status: c.status || '', codeStatus: c.code_status || '', createTime: c.create_time || null, webvisor: !!(c.code_options && c.code_options.visor), clickmap: !!(c.code_options && c.code_options.clickmap)};
}
async function metrikaGoals(settings) {
  const id = counterId(); if (!id) throw httpErr(400, 'Номер счётчика не указан.');
  const j = await mApi('GET', `/management/v1/counter/${id}/goals`, null, settings.integrations.metrika.token);
  return (j.goals || []).map(g => ({id: g.id, name: g.name, type: g.type, ids: (g.conditions || []).map(c => c.url).filter(Boolean)}));
}
/* создать в Метрике цели «JavaScript-событие» для тех идентификаторов из data/integrations.json, которых там ещё нет */
async function metrikaSyncGoals(settings) {
  const id = counterId(), want = ((pub().metrika || {}).goals || []).filter(g => g && g.id && g.name), have = await metrikaGoals(settings), haveIds = new Set(have.flatMap(g => g.ids));
  const created = [], skipped = [], failed = [];
  for (const g of want) {
    if (haveIds.has(g.id)) { skipped.push(g.id); continue; }
    try { await mApi('POST', `/management/v1/counter/${id}/goals`, {goal: {name: g.name.slice(0, 100), type: 'action', is_retargeting: 0, conditions: [{type: 'exact', url: g.id}]}}, settings.integrations.metrika.token); created.push(g.id); }
    catch (e) { failed.push({id: g.id, error: e.message}); if (e.status === 502 && /токен/.test(e.message)) break; }
  }
  return {created, skipped, failed};
}
/* сводка за период: визиты, посетители, просмотры, отказы + достижения целей */
async function metrikaStats(settings, days) {
  const id = counterId(); if (!id) throw httpErr(400, 'Номер счётчика не указан.');
  days = Math.max(1, Math.min(+days || 7, 90));
  const q = new URLSearchParams({ids: id, metrics: 'ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds', date1: days + 'daysAgo', date2: 'today', accuracy: 'full'});
  const j = await mApi('GET', '/stat/v1/data?' + q, null, settings.integrations.metrika.token), t = Array.isArray(j.totals) ? (Array.isArray(j.totals[0]) ? j.totals[0] : j.totals) : ((j.data && j.data[0] && j.data[0].metrics) || []);
  const out = {days, visits: t[0] || 0, users: t[1] || 0, pageviews: t[2] || 0, bounce: Math.round((t[3] || 0) * 10) / 10, duration: Math.round(t[4] || 0), goals: []};
  try {
    const goals = (await metrikaGoals(settings)).slice(0, 10);
    if (goals.length) {
      const q2 = new URLSearchParams({ids: id, metrics: goals.map(g => `ym:s:goal${g.id}reaches`).join(','), date1: days + 'daysAgo', date2: 'today', accuracy: 'full'});
      const j2 = await mApi('GET', '/stat/v1/data?' + q2, null, settings.integrations.metrika.token), t2 = Array.isArray(j2.totals) ? (Array.isArray(j2.totals[0]) ? j2.totals[0] : j2.totals) : ((j2.data && j2.data[0] && j2.data[0].metrics) || []);
      out.goals = goals.map((g, i) => ({id: g.id, name: g.name, ids: g.ids, reaches: t2[i] || 0}));
    }
  } catch (e) { out.goalsError = e.message; }
  return out;
}

/* ---------- Yandex SmartCaptcha ---------- */
/* 'off' — проверка выключена; 'ok' — человек; 'fail' — робот; 'missing' — токена нет; 'error' — сервис недоступен (заявку не теряем: помечаем). Токен действует 5 минут и проверяется один раз */
async function verifyCaptcha(token, ip, settings) {
  const cp = ((settings.integrations || {}).captcha) || {}, on = cp.enabled && cp.serverKey && String(((pub().captcha) || {}).siteKey || '');
  if (!on) return 'off';
  token = String(token || ''); if (!token || token.length > 4000) return 'missing';
  try {
    const body = new URLSearchParams({secret: cp.serverKey, token, ip: String(ip || '')}).toString();
    const r = await NG.request(cp.url || 'https://smartcaptcha.yandexcloud.net/validate', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body, timeout: 6000, httpsOnly: !NG.allowPrivate()});
    if (r.status !== 200 || !r.json) return 'error';
    return r.json.status === 'ok' ? 'ok' : 'fail';
  } catch (e) { return 'error'; }
}

/* ---------- сводка для раздела «Интеграции» (без секретов) ---------- */
function summary(settings) {
  const p = pub(), m = p.metrika || {}, cp = settings.integrations.captcha, n = settings.notify, bx = settings.integrations.bitrix24;
  return {
    metrika: {id: counterId(), idRaw: m.id || '', webvisor: !!m.webvisor, tokenSet: !!settings.integrations.metrika.token, goals: (m.goals || []).length},
    consent: p.consent || {}, verification: p.verification || {}, messengers: p.messengers || {},
    captcha: {enabled: !!cp.enabled, serverKeySet: !!cp.serverKey, siteKeySet: !!((p.captcha || {}).siteKey)},
    bitrix24: {enabled: !!bx.enabled, webhookSet: !!bx.webhook},
    notify: {webhook: !!n.webhookUrl, telegram: !!(n.telegram.token && n.telegram.chatId), smtp: !!(n.smtp.host && n.smtp.to)}
  };
}
module.exports = {pub, siteData, counterId, metrikaCheck, metrikaGoals, metrikaSyncGoals, metrikaStats, verifyCaptcha, summary};
