/* Общие мелочи сервера: чтение/запись JSON (атомарная), мьютекс, хэши, сравнение без утечки по времени. Только стандартная библиотека Node. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const sha256 = (s, enc = 'hex') => crypto.createHash('sha256').update(s).digest(enc);
const randomId = (n = 16) => crypto.randomBytes(n).toString('base64url');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const nowISO = () => new Date().toISOString();

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
/* запись во временный файл и переименование: при сбое посреди записи прежний файл остаётся целым */
function writeFileAtomic(file, data, mode) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = file + '.' + process.pid + '.' + randomId(4) + '.tmp';
  fs.writeFileSync(tmp, data, mode ? {mode} : undefined);
  fs.renameSync(tmp, file);
}
const writeJSON = (file, obj, mode) => writeFileAtomic(file, JSON.stringify(obj, null, 2) + '\n', mode);

/* очередь: операции выполняются строго по одной (запись заявок, сохранение контента, сборка) */
class Mutex {
  constructor() { this.p = Promise.resolve(); }
  run(fn) { const r = this.p.then(fn, fn); this.p = r.then(() => {}, () => {}); return r; }
}
module.exports = {sha256, randomId, safeEqual, nowISO, readJSON, writeFileAtomic, writeJSON, Mutex};
