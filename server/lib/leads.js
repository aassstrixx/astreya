/* Заявки с форм сайта: проверка, защита от спама, хранение, поиск, статусы, заметки, выгрузка в CSV. */
'use strict';
const path = require('path');
const C = require('./config');
const {readJSON, writeJSON, randomId, sha256, nowISO, Mutex} = require('./util');
const {getSecret, httpErr} = require('./auth');

const FILE = path.join(C.DATA, 'leads.json');
const mu = new Mutex();
const STATUSES = {new: 'Новая', in_work: 'В работе', done: 'Обработана', spam: 'Спам', archived: 'В архиве'};
const TYPE_TITLES = {partner: 'Партнёрство', seminar: 'Запись на мероприятие', product: 'Запрос по товару', question: 'Вопрос', contact: 'Контакты'};

/* какие поля обязательны — берём из той же таблицы, по которой строятся формы на сайте (js/shared.js): единый источник правды */
function formTypes() { try { delete require.cache[require.resolve(path.join(C.ROOT, 'js', 'shared.js'))]; return require(path.join(C.ROOT, 'js', 'shared.js')).FORM_TYPES; } catch (e) { return null; } }

const clean = (v, max) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const emailOk = v => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const LIMITS = {name: 120, phone: 40, email: 254, city: 120, org: 200, spec: 120, msg: 4000, context: 300};

/* ---- проверка входных данных. Возвращает {ok, lead} или {ok:false, errors:{поле: текст}} ---- */
function validate(body) {
  const types = formTypes() || {}, errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {ok: false, errors: {_: 'Ожидается JSON-объект.'}};
  const type = clean(body.type, 20);
  if (!types[type]) errors.type = 'Неизвестный тип формы.';
  const req = {}; (types[type] ? types[type].fields : []).forEach(([id, r]) => { req[id] = !!r; });
  const f = {};
  for (const k of ['name', 'phone', 'email', 'city', 'org', 'spec', 'msg', 'context']) f[k] = clean(body[k], LIMITS[k]);
  for (const k of Object.keys(req)) if (req[k] && !f[k]) errors[k] = 'Обязательное поле.';
  if (f.email && !emailOk(f.email)) errors.email = 'Некорректный e-mail.';
  const digits = f.phone.replace(/\D/g, '');
  if (f.phone && (digits.length < 10 || digits.length > 15)) errors.phone = 'Некорректный телефон.';
  if (body.consent !== true && body.consent !== 'true') errors.consent = 'Нужно согласие на обработку персональных данных.';
  if (!f.email && !f.phone) errors.contact = 'Укажите телефон или e-mail.';
  let page = clean(body.page, 500); if (page && !/^https?:\/\//i.test(page)) page = '';
  if (Object.keys(errors).length) return {ok: false, errors};
  return {ok: true, lead: Object.assign({type}, f, {phone: f.phone, page, fill_ms: Number.isFinite(+body.fill_ms) ? Math.max(0, Math.min(+body.fill_ms, 36e5)) : null, honeypot: clean(body.company_site, 200)})};
}

/* ---- спам-признаки. «Сильные» (скрытое поле, разметка, куча ссылок) — заявка уходит в «Спам» без уведомления.
   «Слабые» (слишком быстрое заполнение — так же выглядит автозаполнение браузера) — заявка остаётся новой, но помечается и приходит с предупреждением: живого клиента терять нельзя. ---- */
function spamReasons(lead, minFillMs) {
  const spam = [], flags = [];
  if (lead.honeypot) spam.push('заполнено скрытое поле');
  const links = (lead.msg.match(/https?:\/\/|www\./gi) || []).length; if (links > 2) spam.push('много ссылок в сообщении');
  if (/(<\s*script|<\s*a\s+href|\[url=)/i.test([lead.name, lead.msg, lead.org, lead.city].join(' '))) spam.push('разметка в тексте');
  if (lead.fill_ms !== null && lead.fill_ms < minFillMs) flags.push('форма заполнена слишком быстро');
  return {spam, flags};
}

/* ---- ограничение частоты по адресу (хэш адреса, не сам адрес) ---- */
const hits = new Map();
const ipHash = ip => sha256(String(ip) + getSecret()).slice(0, 16);
function rateCheck(ipH, settings) {
  const t = Date.now(), arr = (hits.get(ipH) || []).filter(x => t - x < 864e5);
  const last10 = arr.filter(x => t - x < 600e3).length, lim = settings.rateLimit || {per10min: 5, perDay: 30};
  if (last10 >= lim.per10min) return Math.ceil((600e3 - (t - arr.filter(x => t - x < 600e3)[0])) / 1000);
  if (arr.length >= lim.perDay) return Math.ceil((864e5 - (t - arr[0])) / 1000);
  return 0;
}
const rateNote = ipH => { const t = Date.now(), arr = (hits.get(ipH) || []).filter(x => t - x < 864e5); arr.push(t); hits.set(ipH, arr); if (hits.size > 20000) hits.clear(); };

/* заявки целиком в памяти (запись только из этого процесса, строго по одной): список и поиск не перечитывают файл при каждом запросе */
let cache = null;
const load = () => cache || (cache = readJSON(FILE, {seq: 0, items: []}));
const save = d => { try { writeJSON(FILE, d, 0o600); cache = d; } catch (e) { cache = null; throw e; } };

/* ---- приём заявки ---- */
function receive(body, meta, settings) {
  return mu.run(() => {
    const v = validate(body); if (!v.ok) throw httpErr(422, 'Проверьте поля формы.', {errors: v.errors});
    const lead = v.lead, ipH = meta.ipHash, wait = rateCheck(ipH, settings);
    if (wait) throw httpErr(429, 'Слишком много заявок с одного адреса. Попробуйте позже или позвоните нам.', {retry_after: wait});
    rateNote(ipH);
    const sr = spamReasons(lead, settings.minFillMs || 0), reasons = sr.spam, d = load();
    // повтор той же заявки за 10 минут (двойной клик, повторная отправка) — не плодим записи
    const t = Date.now(), dup = d.items.find(x => x.type === lead.type && x.phone === lead.phone && x.email === lead.email && x.msg === lead.msg && x.context === lead.context && t - Date.parse(x.created_at) < 600e3);
    if (dup) { dup.duplicates = (dup.duplicates || 0) + 1; save(d); return {id: dup.id, duplicate: true, notify: false, lead: dup}; }
    d.seq++;
    const rec = {
      id: 'L' + String(d.seq).padStart(5, '0'), n: d.seq, created_at: nowISO(), updated_at: nowISO(), status: reasons.length ? 'spam' : 'new',
      type: lead.type, name: lead.name, phone: lead.phone, email: lead.email, city: lead.city, org: lead.org, spec: lead.spec, msg: lead.msg, context: lead.context, page: lead.page,
      consent: true, fill_ms: lead.fill_ms, ip: ipH, ua: clean(meta.ua, 200), origin: clean(meta.origin, 200), spam_reasons: reasons, flags: sr.flags, duplicates: 0,
      notes: [], history: [{t: nowISO(), who: 'сайт', action: 'created', detail: reasons.length ? 'отмечена как спам: ' + reasons.join('; ') : sr.flags.length ? 'подозрительная: ' + sr.flags.join('; ') : ''}]
    };
    d.items.push(rec); save(d);
    return {id: rec.id, duplicate: false, notify: !reasons.length, lead: rec, spam: reasons.length > 0};
  });
}

/* ---- просмотр ---- */
function toListItem(x) { return {id: x.id, n: x.n, created_at: x.created_at, status: x.status, type: x.type, name: x.name, phone: x.phone, email: x.email, city: x.city, org: x.org, context: x.context, msg: x.msg.slice(0, 140), notes: x.notes.length, duplicates: x.duplicates || 0, flags: x.flags || [], spam_reasons: x.spam_reasons || []}; }
function filtered(q) {
  const d = load(); let a = d.items;
  if (q.status === 'active' || !q.status) a = a.filter(x => x.status !== 'archived' && x.status !== 'spam'); else if (q.status !== 'all') a = a.filter(x => x.status === q.status);
  if (q.type) a = a.filter(x => x.type === q.type);
  if (q.from) a = a.filter(x => x.created_at >= q.from);
  if (q.to) a = a.filter(x => x.created_at <= q.to + 'T23:59:59.999Z' || x.created_at <= q.to);
  if (q.q) { const s = String(q.q).toLowerCase(); a = a.filter(x => [x.id, x.name, x.phone, x.email, x.city, x.org, x.msg, x.context].some(v => String(v || '').toLowerCase().includes(s))); }
  return a.slice().sort((x, y) => y.n - x.n);
}
function list(q) {
  const a = filtered(q), limit = Math.max(1, Math.min(+q.limit || 50, 200)), page = Math.max(1, +q.page || 1);
  return {total: a.length, page, limit, items: a.slice((page - 1) * limit, page * limit).map(toListItem)};
}
const get = id => load().items.find(x => x.id === id) || null;
function stats() {
  const a = load().items, t = Date.now(), by = f => a.reduce((m, x) => { m[x[f]] = (m[x[f]] || 0) + 1; return m; }, {});
  const day = x => t - Date.parse(x.created_at) < 864e5, week = x => t - Date.parse(x.created_at) < 7 * 864e5;
  return {total: a.length, new: a.filter(x => x.status === 'new').length, today: a.filter(day).length, week: a.filter(week).length, byStatus: by('status'), byType: by('type')};
}

/* ---- изменения ---- */
function update(id, patch, who) {
  return mu.run(() => {
    const d = load(), x = d.items.find(i => i.id === id); if (!x) throw httpErr(404, 'Заявка не найдена.');
    // сначала проверяем всё, потом меняем: данные лежат в памяти, полупримёнённая правка недопустима
    if (patch.status !== undefined && !STATUSES[patch.status]) throw httpErr(400, 'Неизвестный статус.');
    const text = patch.comment !== undefined ? clean(patch.comment, 2000) : null; if (patch.comment !== undefined && !text) throw httpErr(400, 'Пустой комментарий.');
    if (patch.status !== undefined && patch.status !== x.status) { x.history.push({t: nowISO(), who, action: 'status', detail: STATUSES[x.status] + ' → ' + STATUSES[patch.status]}); x.status = patch.status; }
    if (text) { x.notes.push({t: nowISO(), who, text}); x.history.push({t: nowISO(), who, action: 'note', detail: text.slice(0, 80)}); }
    x.updated_at = nowISO(); save(d); return x;
  });
}
function remove(id, who) {                   // жёсткое удаление — только администратор; менеджеры переносят в архив
  return mu.run(() => { const d = load(), i = d.items.findIndex(x => x.id === id); if (i < 0) throw httpErr(404, 'Заявка не найдена.'); d.items.splice(i, 1); save(d); return {id, by: who}; });
}
function purgeOld(days) {                    // срок хранения: удаление обработанных заявок старше N дней
  return mu.run(() => { if (!days) return 0; const d = load(), lim = Date.now() - days * 864e5, n = d.items.length; d.items = d.items.filter(x => !(['done', 'spam', 'archived'].includes(x.status) && Date.parse(x.created_at) < lim)); save(d); return n - d.items.length; });
}

/* ---- CSV (разделитель «;», UTF-8 с BOM — так открывается в Excel); ячейки, начинающиеся с = + - @, экранируются от «CSV-инъекций» ---- */
const cell = v => { let s = String(v === undefined || v === null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function csv(q) {
  const rows = filtered(Object.assign({}, q, {status: q.status || 'all'}));      // выгрузка без явного статуса — все заявки
  const head = ['№', 'Дата (UTC)', 'Статус', 'Тип', 'Имя', 'Телефон', 'E-mail', 'Город', 'Организация', 'Специализация', 'Тема', 'Сообщение', 'Страница', 'Комментарии'];
  const lines = [head.map(cell).join(';')].concat(rows.map(x => [x.id, x.created_at, STATUSES[x.status], TYPE_TITLES[x.type] || x.type, x.name, x.phone, x.email, x.city, x.org, x.spec, x.context, x.msg, x.page, x.notes.map(n => n.who + ': ' + n.text).join(' | ')].map(cell).join(';')));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
module.exports = {STATUSES, TYPE_TITLES, validate, receive, list, get, stats, update, remove, purgeOld, csv, ipHash, spamReasons};
