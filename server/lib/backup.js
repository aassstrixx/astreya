/* Резервные копии данных сервера: заявки, пользователи, настройки, журнал и содержимое сайта (data/*.json).
   Копии лежат в DATA_DIR/snapshots (доступ только владельцу; при заданном DATA_KEY файлы шифруются), раз в сутки создаётся автоматическая, хранится последние N.
   Выгрузка для скачивания не содержит хэшей паролей, секретов 2FA и ключей из настроек. Восстановить из копии можно заявки (остальное — вручную из папки, см. server/README.md). */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./config');
const vault = require('./vault');
const L = require('./leads');
const {httpErr} = require('./auth');
const {Mutex, nowISO} = require('./util');

const DIR = path.join(C.DATA, 'snapshots'), mu = new Mutex();
const SERVER_FILES = ['leads.json', 'users.json', 'settings.json', 'audit.log'];
const write = (f, text) => fs.writeFileSync(f, vault.seal(text), {mode: 0o600});
const read = f => { const t = fs.readFileSync(f, 'utf8'); return vault.isSealed(t) ? vault.open(t).value : t; };
const okId = id => /^[\w.-]{8,80}$/.test(String(id || ''));
const dirOf = id => { if (!okId(id)) throw httpErr(400, 'Некорректный номер копии.'); const d = path.join(DIR, id); if (!fs.existsSync(d)) throw httpErr(404, 'Копия не найдена.'); return d; };

function create(who, kind) {
  return mu.run(() => {
    fs.mkdirSync(DIR, {recursive: true, mode: 0o700});
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '__' + String(who || 'система').replace(/[^\w.-]/g, '_').slice(0, 30), d = path.join(DIR, id);
    fs.mkdirSync(d, {mode: 0o700}); fs.mkdirSync(path.join(d, 'site'), {mode: 0o700});
    const files = []; let bytes = 0;
    for (const f of SERVER_FILES) { const src = path.join(C.DATA, f); if (!fs.existsSync(src)) continue; let text = fs.readFileSync(src, 'utf8'); if (f === 'leads.json') text = JSON.stringify(L.snapshot()); write(path.join(d, f), text); files.push(f); bytes += text.length; }
    const sd = path.join(C.ROOT, 'data');
    try { for (const f of fs.readdirSync(sd).filter(x => x.endsWith('.json'))) { const text = fs.readFileSync(path.join(sd, f), 'utf8'); write(path.join(d, 'site', f), text); files.push('site/' + f); bytes += text.length; } } catch (e) {}
    const meta = {id, at: nowISO(), who: who || 'система', kind: kind || 'manual', files, bytes, encrypted: vault.enabled()};
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta, null, 2), {mode: 0o600});
    prune(); return meta;
  });
}
function prune() {
  const keep = Math.max(3, +(C.loadSettings().backup || {}).keep || 14), all = list();
  const autos = all.filter(x => x.kind === 'auto'); autos.slice(keep).forEach(x => { try { fs.rmSync(path.join(DIR, x.id), {recursive: true, force: true}); } catch (e) {} });
  const manual = all.filter(x => x.kind !== 'auto'); manual.slice(40).forEach(x => { try { fs.rmSync(path.join(DIR, x.id), {recursive: true, force: true}); } catch (e) {} });
}
function list() {
  let ids = []; try { ids = fs.readdirSync(DIR).filter(okId); } catch (e) { return []; }
  return ids.map(id => { try { return JSON.parse(fs.readFileSync(path.join(DIR, id, 'meta.json'), 'utf8')); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
}
const lastAt = () => { const l = list()[0]; return l ? l.at : null; };
function remove(id) { fs.rmSync(dirOf(id), {recursive: true, force: true}); return true; }
/* пакет для скачивания: без хэшей паролей, секретов 2FA и ключей */
function bundle(id) {
  const d = dirOf(id), meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')), out = {meta, leads: null, settings: null, site: {}};
  try { out.leads = JSON.parse(read(path.join(d, 'leads.json'))); } catch (e) {}
  try { const s = JSON.parse(read(path.join(d, 'settings.json'))); for (const p of C.SECRET_PATHS) if (C.getPath(s, p)) C.setPath(s, p, '[скрыто]'); out.settings = s; } catch (e) {}
  try { for (const f of fs.readdirSync(path.join(d, 'site'))) out.site[f] = JSON.parse(read(path.join(d, 'site', f))); } catch (e) {}
  return out;
}
/* восстановление заявок; перед этим автоматически снимается копия текущего состояния */
async function restoreLeads(id, who) {
  const d = dirOf(id), f = path.join(d, 'leads.json'); if (!fs.existsSync(f)) throw httpErr(404, 'В этой копии нет заявок.');
  let data; try { data = JSON.parse(read(f)); } catch (e) { throw httpErr(422, 'Файл заявок в копии повреждён или зашифрован другим ключом.'); }
  if (!data || !Array.isArray(data.items)) throw httpErr(422, 'Файл заявок в копии имеет неверную структуру.');
  await create(who, 'before-restore');
  return {restored: await L.replaceAll(data, who)};
}
module.exports = {create, list, lastAt, remove, bundle, restoreLeads, DIR};
