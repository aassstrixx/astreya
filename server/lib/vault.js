/* Шифрование секретов «в покое» (AES-256-GCM): токены, пароли и ключи в settings.json, секреты двухфакторного входа в users.json.
   Ключ — переменная окружения DATA_KEY (любая фраза от 16 символов или 64 hex-символа); без неё значения лежат как есть, но файлы доступны только владельцу (0600).
   Зашифрованное значение выглядит так: enc:v1:<iv>:<тег>:<данные>. Потеряете ключ — секреты придётся ввести заново (заявки и контент это не затрагивает). */
'use strict';
const crypto = require('crypto');

const PREFIX = 'enc:v1:';
let cache = {src: null, key: null};
function key() {
  const src = String(process.env.DATA_KEY || '');
  if (!src) return null;
  if (cache.src === src) return cache.key;
  const k = /^[0-9a-f]{64}$/i.test(src) ? Buffer.from(src, 'hex') : crypto.scryptSync(src, 'astreya-vault-v1', 32);
  cache = {src, key: k}; return k;
}
const enabled = () => !!key() && String(process.env.DATA_KEY).length >= 16;
const isSealed = v => typeof v === 'string' && v.startsWith(PREFIX);

function seal(plain) {
  plain = String(plain === undefined || plain === null ? '' : plain);
  if (!plain || isSealed(plain) || !enabled()) return plain;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv), ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), ct].map(b => b.toString('base64url')).join(':');
}
/* расшифровка; если значение зашифровано, а ключа нет или он другой, возвращается '' и ok=false (сервер не падает — секрет просто считается незаданным) */
function open(value) {
  if (!isSealed(value)) return {value: value === undefined || value === null ? '' : String(value), ok: true};
  const k = key(); if (!k) return {value: '', ok: false};
  try {
    const [iv, tag, ct] = value.slice(PREFIX.length).split(':').map(s => Buffer.from(s, 'base64url')), d = crypto.createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(tag);
    return {value: Buffer.concat([d.update(ct), d.final()]).toString('utf8'), ok: true};
  } catch (e) { return {value: '', ok: false}; }
}
module.exports = {enabled, seal, open, isSealed, PREFIX};
