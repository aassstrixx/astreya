/* Тексты страниц, которые правятся из админки (раздел «Тексты страниц»). Реестр ключей — src/texts-registry.js, значения заказчика — data/texts.json.
   В шаблонах вместо зашитой строки стоит T('страница.блок.ключ'): пока заказчик ничего не менял, это ровно прежний текст, и страницы собираются байт в байт как раньше.
   T() возвращает готовый к вставке в HTML текст (обычные строки экранируются, «rich» — только безопасные теги); Traw() — «сырой» текст для случаев, когда шаблон экранирует сам. */
'use strict';
const REG = require('./texts-registry.js');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const index = REG.index;                                   // ключ → описание {key, page, block, name, label, type, max, def, hint, optional}
let over = {};

/* ---- «rich»: можно <br>, <em>, <strong>, <b>, <i>, <wbr>, <sup>, <sub>, <small> и символьные ссылки (&nbsp; &mdash; …); всё остальное экранируется ---- */
const TAGS = /^<\/?(?:br|em|strong|b|i|wbr|sup|sub|small)\s*\/?>$/i;
const ENT = /^&(?:nbsp|mdash|ndash|laquo|raquo|amp|lt|gt|quot|shy|hellip|middot|times|rarr|larr|deg|plusmn|bull|thinsp|#\d{2,5}|#x[0-9a-f]{2,5});$/i;
const SAFE = /<\/?[a-z][^>]*>|&[#\w]+;|[&<>"]/gi;
function richClean(v) {
  return String(v).replace(SAFE, m => (m[0] === '<' && m.length > 1) ? (TAGS.test(m) ? m : esc(m)) : (m[0] === '&' && m.length > 1 && ENT.test(m)) ? m : m === '"' ? '&quot;' : m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : esc(m));
}
/* проблемы значения (для сервера и админки): пустой список — значение годится */
function problems(key, v) {
  const d = index[key]; if (!d) return [`Неизвестный текст «${key}».`];
  if (typeof v !== 'string') return [`«${d.label}»: ожидается текст.`];
  const P = [], s = v.trim();
  if (!s) { return d.optional ? P : [`«${d.label}»: пусто — чтобы вернуть исходный текст, нажмите «Вернуть исходный».`]; }
  const len = Array.from(s).length;
  if (len > d.max) P.push(`«${d.label}»: ${len} символов, допустимо не больше ${d.max}.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/.test(v)) P.push(`«${d.label}»: недопустимые управляющие символы.`);
  if (d.js && /[<>"'`\\]/.test(s)) P.push(`«${d.label}»: в подписях интерфейса нельзя прямые кавычки ' \" ` + "`" + `, обратную косую черту и < > — используйте «ёлочки» (эти тексты вставляются в разметку скриптами).`);
  if (d.ph || /\{\w+\}/.test(s)) { const allowed = new Set(d.ph || []), bad = (s.match(/\{\w+\}/g) || []).map(x => x.slice(1, -1)).filter(x => !allowed.has(x)); if (bad.length) P.push(`«${d.label}»: неизвестная метка {${bad[0]}}${allowed.size ? ' (можно: ' + [...allowed].map(x => '{' + x + '}').join(', ') + ')' : ' — в этом поле меток нет'}.`); }
  if (d.type === 'link') { if (!/^(?:(?:[\w.-]+\/)*[\w.-]+\.html(?:[?#][\w\-=&%./]*)?|#[\w-]+|https?:\/\/[^\s<>"']+|tel:\+?[\d\s()-]{5,20}|mailto:[^\s<>"']+)$/.test(s)) P.push(`«${d.label}»: ссылка — страница сайта (например catalog.html), якорь (#cp-req), адрес https://… , tel: или mailto:.`); }
  else if (d.type === 'rich') { const bad = (s.match(/<\/?[a-z][^>]*>/gi) || []).filter(t => !TAGS.test(t)); if (bad.length) P.push(`«${d.label}»: разрешены только теги <br>, <em>, <strong>, <b>, <i> (лишнее: ${bad[0].slice(0, 30)}).`); }
  else if (/[<>]/.test(s)) P.push(`«${d.label}»: символы < и > в этом поле не нужны — здесь простой текст.`);
  if (d.type === 'line' && /[\r\n]/.test(s)) P.push(`«${d.label}»: в этом поле один абзац без переводов строки.`);
  return P;
}
const fillVars = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
function value(key) {
  const d = index[key]; if (!d) throw new Error('Нет текста «' + key + '» в src/texts-registry.js');
  const o = over[key]; if (typeof o === 'string' && (o.trim() || d.optional)) { if (!problems(key, o).length) return o.trim(); }
  return d.def;
}
/* T — готовый HTML; Traw — текст как есть (его экранирует сам шаблон: esc(Traw('…'))). vars: {имя: значение} подставляются вместо {имя} без экранирования (разметку делает код шаблона). */
function T(key, vars) {
  const d = index[key], v = value(key);
  return fillVars(d.type === 'rich' ? richClean(v) : esc(v), vars);
}
function Traw(key, vars) { return fillVars(value(key), vars); }
function set(items) { over = items && typeof items === 'object' ? items : {}; }
/* правки подписей интерфейса для браузерных скриптов (js/data.js → texts): только допустимые значения ключей с флагом js */
function jsOverrides() { const o = {}; for (const [k, v] of Object.entries(over)) { const d = index[k]; if (d && d.js && typeof v === 'string' && v.trim() && !problems(k, v).length) o[k] = v.trim(); } return o; }
const get = () => over;
module.exports = {T, Traw, set, get, jsOverrides, problems, richClean, registry: REG, index, esc};
