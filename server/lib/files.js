/* Загрузка картинок для сайта (логотипы брендов, фото). Только растровые форматы, проверка сигнатуры файла, безопасные имена, ограничение размера. */
'use strict';
const path = require('path'), fs = require('fs');
const C = require('./config');
const {httpErr} = require('./auth');

const DIRS = {'assets/photos': 'Фото (главная, о компании, обучение)', 'assets/products': 'Фото товаров', 'assets/brands': 'Логотипы брендов', 'assets/teachers': 'Фото преподавателей', 'assets/uploads': 'Прочие картинки'};
const MAX = 6 * 1024 * 1024;
const SIG = {
  png: b => b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: b => b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP',
  gif: b => b.length > 6 && /^GIF8[79]a/.test(b.slice(0, 6).toString())
};
const EXT = {'.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp', '.gif': 'gif'};
const SUB = /^assets\/uploads\/[a-z0-9][a-z0-9-]{0,39}$/;                                   // подпапки загрузок: assets/uploads/news, assets/uploads/events …
const dirOf = d => { if (!DIRS[d] && !SUB.test(String(d))) throw httpErr(400, 'Эту папку менять нельзя.'); return path.join(C.ROOT, d); };
const subdirs = () => { try { return fs.readdirSync(path.join(C.ROOT, 'assets', 'uploads'), {withFileTypes: true}).filter(e => e.isDirectory() && SUB.test('assets/uploads/' + e.name)).map(e => 'assets/uploads/' + e.name).sort(); } catch (e) { return []; } };
const TR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'};
/* безопасное имя: кириллица транслитерируется, всё прочее вне a-z0-9._- заменяется дефисом; путь («../») отбрасывается */
const safeName = n => {
  const base = String(n || '').split(/[\\/]/).pop().toLowerCase().replace(/[а-яё]/g, c => TR[c]).replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/\.{2,}/g, '.');
  const m = base.match(/^(.*?)(\.[a-z0-9]+)?$/); return ((m[1] || 'image').slice(0, 70) + (m[2] || '')).replace(/^\./, 'image.');
};

/* размеры картинки из заголовка файла (PNG, JPEG, WebP, GIF) — для подписи в библиотеке */
function imgSize(buf) {
  try {
    if (buf.length > 24 && buf.slice(1, 4).toString() === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    if (buf.slice(0, 3).toString('latin1') === 'GIF') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      const t = buf.slice(12, 16).toString();
      if (t === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
      if (t === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
      if (t === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) { let i = 2; while (i + 9 < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; i += 2 + buf.readUInt16BE(i + 2); } }
  } catch (e) {}
  return null;
}
const sizeCache = new Map();
function dimsOf(full, st) {
  const k = full + ':' + st.mtimeMs; if (sizeCache.has(k)) return sizeCache.get(k);
  let r = null; try { const fd = fs.openSync(full, 'r'), b = Buffer.alloc(Math.min(st.size, 262144)); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); r = imgSize(b); } catch (e) {}
  if (sizeCache.size > 3000) sizeCache.clear(); sizeCache.set(k, r); return r;
}
function listDir(dir, title, extra) {
  let files = []; try { files = fs.readdirSync(path.join(C.ROOT, dir)).filter(f => !f.startsWith('.')).map(f => { const full = path.join(C.ROOT, dir, f), st = fs.statSync(full); if (!st.isFile()) return null; const d = EXT[path.extname(f).toLowerCase()] ? dimsOf(full, st) : null; return {name: f, size: st.size, mtime: st.mtime.toISOString(), path: dir + '/' + f, w: d ? d[0] : null, h: d ? d[1] : null}; }).filter(Boolean).sort((a, b) => b.mtime.localeCompare(a.mtime)); } catch (e) {}
  return Object.assign({dir, title, files}, extra || {});
}
function list() {
  const out = Object.entries(DIRS).map(([dir, title]) => listDir(dir, title));
  subdirs().forEach(d => out.push(listDir(d, 'Загрузки: ' + d.split('/').pop(), {sub: true})));
  return out;
}
/* картинки сцен, фонов и рендеров сайта: только просмотр (нельзя ни заменить, ни удалить — это структура сайта) */
const SCENES = [['assets/bg', 'Фоновые текстуры'], ['assets/showroom', 'Витрина: сцена и упаковки'], ['assets/news', 'Газета: фото и сцены'], ['assets/company', 'Компания: сцены и карта'], ['assets/utility', 'Служебные страницы: сцены'], ['assets/academy', 'Обучение: сцены'], ['assets/house', 'ASTREYA HOUSE: сцены'], ['assets/decor', 'Декор'], ['assets/partners', 'Партнёрам: сцены'], ['assets/textures', 'Текстуры'], ['assets/detail', 'Страницы деталей: сцены']];
function scenes() {
  return SCENES.map(([dir, title]) => { const d = listDir(dir, title, {readonly: true}); d.total = d.files.length; d.files = d.files.filter(f => /\.(webp|png|jpe?g|gif|svg)$/i.test(f.name)).slice(0, 400).map(f => ({name: f.name, size: f.size, path: f.path, w: f.w, h: f.h})); return d; }).filter(d => d.total);
}
function mkdir(name) {
  const n = String(name || '').toLowerCase().replace(/[а-яё]/g, c => TR[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40), dir = 'assets/uploads/' + n;
  if (!n || !SUB.test(dir)) throw httpErr(400, 'Название папки — латиница, цифры и дефис.');
  fs.mkdirSync(path.join(C.ROOT, dir), {recursive: true}); return {dir};
}
function upload(dir, name, buf) {
  const base = dirOf(dir), n = safeName(name), ext = path.extname(n);
  if (!EXT[ext]) throw httpErr(400, 'Допустимы PNG, JPG, WebP и GIF. (SVG-логотипы кладутся в репозиторий вручную.)');
  if (buf.length > MAX) throw httpErr(413, 'Файл больше 6 МБ.');
  if (!SIG[EXT[ext]](buf)) throw httpErr(400, 'Содержимое файла не похоже на ' + ext.slice(1).toUpperCase() + '.');
  fs.mkdirSync(base, {recursive: true});
  const target = path.join(base, n); if (!target.startsWith(base + path.sep)) throw httpErr(400, 'Недопустимое имя файла.');
  fs.writeFileSync(target, buf);
  return {path: dir + '/' + n, size: buf.length};
}
/* где файл упомянут (данные, шаблоны, стили, скрипты, готовые страницы) — чтобы не удалить картинку, на которую ссылается сайт */
function usedIn(p) {
  const out = [], seen = new Set();
  const scan = (dir, deep, re) => {
    let es; try { es = fs.readdirSync(path.join(C.ROOT, dir), {withFileTypes: true}); } catch (e) { return; }
    for (const e of es) {
      const rel = dir ? dir + '/' + e.name : e.name;
      if (e.isDirectory()) { if (deep) scan(rel, deep, re); continue; }
      if (!re.test(e.name) || seen.has(rel)) continue; seen.add(rel);
      try { if (fs.readFileSync(path.join(C.ROOT, rel), 'utf8').includes(p)) out.push(rel); } catch (x) {}
    }
  };
  scan('data', false, /\.json$/); scan('src', true, /\.(js|html|css|json)$/); scan('css', false, /\.css$/); scan('', false, /\.html$/);
  return out.filter(x => x !== 'js/data.js').slice(0, 8);
}
function remove(p, force) {
  const m = String(p || '').match(/^(assets\/(?:uploads\/[a-z0-9-]+|[a-z]+))\/([^/]+)$/); if (!m) throw httpErr(400, 'Недопустимый путь.');
  const base = dirOf(m[1]), target = path.join(base, path.basename(m[2]));
  if (!fs.existsSync(target)) throw httpErr(404, 'Файл не найден.');
  const used = usedIn(p); if (used.length && !force) throw httpErr(409, 'Файл используется на сайте (' + used.join(', ') + '). Сначала замените картинку в содержимом.', {usedIn: used});
  fs.unlinkSync(target); return {path: p};
}
/* где каждая картинка упомянута: данные сайта (с названием записи) и шаблоны/стили; один проход по файлам вместо поиска для каждой картинки */
const ASSET_RE = /assets\/[\w\-./]+\.(?:png|jpe?g|webp|gif|svg)/g;
function usageIndex() {
  const CT = require('./content'), map = new Map(), add = (p, label, kind) => { const a = map.get(p) || map.set(p, []).get(p); if (!a.some(x => x.label === label)) a.push({label, kind}); };
  for (const [coll, c] of Object.entries(CT.COLLECTIONS)) {
    if (coll.startsWith('stella_')) continue; let data; try { data = JSON.parse(fs.readFileSync(path.join(C.ROOT, c.file), 'utf8')); } catch (e) { continue; }
    const walk = (node, label, key) => {
      if (typeof node === 'string') { let m; ASSET_RE.lastIndex = 0; while ((m = ASSET_RE.exec(node))) add(m[0], c.title + (label ? ' › ' + label : ''), coll); return; }
      if (Array.isArray(node)) { node.forEach(x => walk(x, label, key)); return; }
      if (node && typeof node === 'object') { const l = typeof node.name === 'string' ? node.name : typeof node.title === 'string' ? node.title : typeof node.label === 'string' ? node.label : typeof node.city === 'string' ? node.city : typeof node.first === 'string' ? (node.first + ' ' + (node.last || '')).trim() : null; Object.keys(node).forEach(k => walk(node[k], l && !/^(id|slug)$/.test(k) ? '«' + l.slice(0, 50) + '»' : label, k)); }
    };
    walk(data, '', '');
  }
  const scan = (dir, deep, re) => { let es; try { es = fs.readdirSync(path.join(C.ROOT, dir), {withFileTypes: true}); } catch (e) { return; } for (const e of es) { const rel = dir ? dir + '/' + e.name : e.name; if (e.isDirectory()) { if (deep && e.name !== 'texts') scan(rel, deep, re); continue; } if (!re.test(e.name)) continue; let t = ''; try { t = fs.readFileSync(path.join(C.ROOT, rel), 'utf8'); } catch (x) { continue; } let m; ASSET_RE.lastIndex = 0; while ((m = ASSET_RE.exec(t))) add(m[0], 'Шаблон сайта (' + rel + ')', 'code'); } };
  scan('src', true, /\.(js|html|css|json)$/); scan('css', false, /\.css$/);
  return map;
}
/* переименование картинки из «своих» папок: ссылки в данных обновляются сами; если на файл ссылается шаблон или стиль — переименовать нельзя */
function rename(from, newName) {
  const m = String(from || '').match(/^(assets\/(?:uploads\/[a-z0-9-]+|[a-z]+))\/([^/]+)$/); if (!m) throw httpErr(400, 'Недопустимый путь.');
  const base = dirOf(m[1]), src = path.join(base, path.basename(m[2])); if (!fs.existsSync(src)) throw httpErr(404, 'Файл не найден.');
  const ext = path.extname(m[2]).toLowerCase(), n = safeName(String(newName || '').replace(/\.[^.]+$/, '') + ext);
  if (path.extname(n) !== ext) throw httpErr(400, 'Расширение файла менять нельзя.');
  const target = path.join(base, n), to = m[1] + '/' + n; if (to === from) return {path: from, changed: []}; if (fs.existsSync(target)) throw httpErr(409, 'Файл с таким именем уже есть.');
  const idx = usageIndex(), uses = idx.get(from) || [], code = uses.filter(u => u.kind === 'code'); if (code.length) throw httpErr(409, 'На файл ссылается шаблон или стиль сайта (' + code[0].label + ') — переименовывать нельзя.');
  fs.renameSync(src, target);
  const changed = []; for (const f of fs.readdirSync(path.join(C.ROOT, 'data')).filter(x => /\.json$/.test(x))) { const fp = path.join(C.ROOT, 'data', f), t = fs.readFileSync(fp, 'utf8'); if (t.includes(from)) { fs.writeFileSync(fp, t.split(from).join(to)); changed.push('data/' + f); } }
  return {path: to, changed};
}
module.exports = {DIRS, list, scenes, mkdir, upload, remove, rename, usedIn, usageIndex, imgSize, MAX};
