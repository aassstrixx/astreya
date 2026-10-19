/* Одноразовые коды (TOTP, RFC 6238) для двухфакторного входа: совместимо с Яндекс Ключом, Google Authenticator, Microsoft Authenticator, 2FAS и др. Только стандартная библиотека. */
'use strict';
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; }
function b32decode(s) { s = String(s).toUpperCase().replace(/[\s=-]/g, ''); let bits = 0, v = 0; const out = []; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) return null; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
const newSecret = () => b32encode(crypto.randomBytes(20));
function hotp(secretB32, counter, digits) {
  const key = b32decode(secretB32); if (!key) return null;
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest(), o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % (10 ** (digits || 6));
  return String(code).padStart(digits || 6, '0');
}
const STEP = 30;
const stepNow = (t) => Math.floor((t === undefined ? Date.now() : t) / 1000 / STEP);
/* проверка кода с допуском ±1 шаг (30 с); lastStep — последний принятый шаг: повторное использование кода отклоняется. Возвращает номер шага или -1 */
function verify(secretB32, code, lastStep, now) {
  code = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(code)) return -1;
  const cur = stepNow(now); let hit = -1;
  for (let d = -1; d <= 1; d++) { const s = cur + d, exp = hotp(secretB32, s); if (exp && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(code)) && hit < 0) hit = s; }
  return hit >= 0 && !(lastStep && hit <= lastStep) ? hit : -1;
}
const uri = (secret, account, issuer) => 'otpauth://totp/' + encodeURIComponent(issuer + ':' + account) + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&algorithm=SHA1&digits=6&period=30';
module.exports = {newSecret, hotp, verify, uri, b32encode, b32decode, stepNow};
