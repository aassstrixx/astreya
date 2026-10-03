/* Пересборка сайта (tools/build.js) и проверка (tools/check.js) из админки. Операции идут по одной; результат последней сборки хранится в data/build.json. */
'use strict';
const path = require('path'), fs = require('fs'), {execFile} = require('child_process');
const C = require('./config');
const {Mutex, nowISO, readJSON, writeJSON} = require('./util');

const mu = new Mutex(), STATE = path.join(C.DATA, 'build.json');
const run = (script, args) => new Promise(resolve => {
  const t0 = Date.now();
  execFile(process.execPath, [path.join(C.ROOT, 'tools', script), ...(args || [])], {cwd: C.ROOT, timeout: 180000, maxBuffer: 4e6, env: Object.assign({}, process.env, {NODE_NO_WARNINGS: '1'})}, (err, out, errOut) => {
    resolve({code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: (String(out || '') + String(errOut || '')).trim().slice(-8000), ms: Date.now() - t0});
  });
});
/* собрать и проверить; check.js возвращает ненулевой код при битых ссылках, дублях title и т. п. */
function build(reason) {
  return mu.run(async () => {
    if (!fs.existsSync(path.join(C.ROOT, 'tools', 'build.js'))) return {ok: false, at: nowISO(), reason, build: {code: 1, out: 'tools/build.js не найден в ' + C.ROOT, ms: 0}, check: null};
    const b = await run('build.js'), c = b.code === 0 ? await run('check.js') : null;
    const res = {ok: b.code === 0 && (!c || c.code === 0), at: nowISO(), reason: reason || '', build: b, check: c};
    try { writeJSON(STATE, res); } catch (e) {}
    return res;
  });
}
const last = () => readJSON(STATE, null);
module.exports = {build, last};
