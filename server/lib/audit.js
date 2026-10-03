/* Журнал действий в админке (кто, что, когда) — data/audit.log, одна JSON-строка на событие. */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./config');
const FILE = path.join(C.DATA, 'audit.log');
function add(who, action, detail) { try { fs.appendFileSync(FILE, JSON.stringify({t: new Date().toISOString(), who: who || '—', action, detail: String(detail || '').slice(0, 300)}) + '\n', {mode: 0o600}); } catch (e) {} }
function tail(n) {
  try { const lines = fs.readFileSync(FILE, 'utf8').trim().split('\n').slice(-Math.max(1, Math.min(n || 100, 500))); return lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).reverse(); } catch (e) { return []; }
}
module.exports = {add, tail};
