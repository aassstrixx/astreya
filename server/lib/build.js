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
/* полный статический аудит сайта (tools/audit.js --static): валидатор HTML, SEO, ссылки, изображения, ARIA; если его модули не установлены — простая проверка tools/check.js */
const REPORT = path.join(C.DATA, 'audit-report.json');
function audit() {
  return mu.run(async () => {
    const t0 = Date.now(); let r = await run('audit.js', ['--static', '--out=' + REPORT]), rep = null;
    if (r.code !== 2 && fs.existsSync(REPORT)) { try { rep = readJSON(REPORT, null); } catch (e) {} }
    if (rep) { const cnt = l => rep.findings.filter(f => f.level === l).length; const res = {ok: true, tool: 'audit', at: nowISO(), ms: Date.now() - t0, errors: cnt('error'), warns: cnt('warn'), infos: cnt('info'), groups: rep.groups.map(g => ({level: g.level, area: g.area, msg: g.msg, n: g.n, where: [...new Set(g.wheres)].slice(0, 3)})).slice(0, 80)}; try { writeJSON(path.join(C.DATA, 'audit-last.json'), res); } catch (e) {} return res; }
    const c = await run('check.js'); const lines = c.out.split('\n').filter(l => /^\s*[✗!]/.test(l)).map(l => l.trim());
    const res = {ok: true, tool: 'check', at: nowISO(), ms: Date.now() - t0, errors: lines.filter(l => l.startsWith('✗')).length, warns: lines.filter(l => l.startsWith('!')).length, infos: 0, groups: lines.slice(0, 80).map(l => ({level: l.startsWith('✗') ? 'error' : 'warn', area: 'check', msg: l.replace(/^[✗!]\s*/, ''), n: 1, where: []}))};
    try { writeJSON(path.join(C.DATA, 'audit-last.json'), res); } catch (e) {} return res;
  });
}
const lastAudit = () => readJSON(path.join(C.DATA, 'audit-last.json'), null);
module.exports = {build, last, audit, lastAudit};
