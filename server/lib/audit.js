/* Журнал действий в админке (кто, что, когда, с какого адреса) — data/audit.log, одна JSON-строка на событие. Файл ротируется: при 5 МБ уходит в audit.log.1 … .5 (старые стираются). */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./config');
const FILE = path.join(C.DATA, 'audit.log'), MAX = 5 * 1024 * 1024, KEEP = 5;
const oneLine = (s, n) => String(s === undefined || s === null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, n);
function rotate() {
  try { if (fs.statSync(FILE).size < MAX) return; } catch (e) { return; }
  try {
    for (let i = KEEP; i >= 1; i--) { const from = i === 1 ? FILE : FILE + '.' + (i - 1), to = FILE + '.' + i; if (fs.existsSync(from)) fs.renameSync(from, to); }
  } catch (e) {}
}
function add(who, action, detail, ip) {
  try { rotate(); fs.appendFileSync(FILE, JSON.stringify({t: new Date().toISOString(), who: oneLine(who || '—', 80), action, detail: oneLine(detail, 300), ip: ip ? oneLine(ip, 60) : undefined}) + '\n', {mode: 0o600}); } catch (e) {}
}
/* последние n записей: читается только хвост файла (до 1 МБ), журнал любого размера открывается быстро */
function tail(n, filter) {
  try {
    const fd = fs.openSync(FILE, 'r'), size = fs.fstatSync(fd).size, len = Math.min(size, 1024 * 1024), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len); fs.closeSync(fd);
    let lines = buf.toString('utf8').split('\n'); if (size > len) lines = lines.slice(1);
    let items = lines.filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    if (filter) items = items.filter(filter);
    return items.slice(-Math.max(1, Math.min(n || 100, 1000))).reverse();
  } catch (e) { return []; }
}
const size = () => { try { return fs.statSync(FILE).size; } catch (e) { return 0; } };
module.exports = {add, tail, size};
