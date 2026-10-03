/* Загрузка картинок для сайта (логотипы брендов, фото). Только растровые форматы, проверка сигнатуры файла, безопасные имена, ограничение размера. */
'use strict';
const path = require('path'), fs = require('fs');
const C = require('./config');
const {httpErr} = require('./auth');

const DIRS = {'assets/photos': 'Фото (главная, о компании, обучение)', 'assets/brands': 'Логотипы брендов', 'assets/teachers': 'Фото преподавателей', 'assets/uploads': 'Прочие картинки'};
const MAX = 6 * 1024 * 1024;
const SIG = {
  png: b => b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: b => b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP',
  gif: b => b.length > 6 && /^GIF8[79]a/.test(b.slice(0, 6).toString())
};
const EXT = {'.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp', '.gif': 'gif'};
const dirOf = d => { if (!DIRS[d]) throw httpErr(400, 'Эту папку менять нельзя.'); return path.join(C.ROOT, d); };
const TR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'};
/* безопасное имя: кириллица транслитерируется, всё прочее вне a-z0-9._- заменяется дефисом; путь («../») отбрасывается */
const safeName = n => {
  const base = String(n || '').split(/[\\/]/).pop().toLowerCase().replace(/[а-яё]/g, c => TR[c]).replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/\.{2,}/g, '.');
  const m = base.match(/^(.*?)(\.[a-z0-9]+)?$/); return ((m[1] || 'image').slice(0, 70) + (m[2] || '')).replace(/^\./, 'image.');
};

function list() {
  return Object.entries(DIRS).map(([dir, title]) => {
    let files = []; try { files = fs.readdirSync(path.join(C.ROOT, dir)).filter(f => !f.startsWith('.')).map(f => { const st = fs.statSync(path.join(C.ROOT, dir, f)); return st.isFile() ? {name: f, size: st.size, mtime: st.mtime.toISOString(), path: dir + '/' + f} : null; }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)); } catch (e) {}
    return {dir, title, files};
  });
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
  const m = String(p || '').match(/^(assets\/[a-z]+)\/([^/]+)$/); if (!m) throw httpErr(400, 'Недопустимый путь.');
  const base = dirOf(m[1]), target = path.join(base, path.basename(m[2]));
  if (!fs.existsSync(target)) throw httpErr(404, 'Файл не найден.');
  const used = usedIn(p); if (used.length && !force) throw httpErr(409, 'Файл используется на сайте (' + used.join(', ') + '). Сначала замените картинку в содержимом.', {usedIn: used});
  fs.unlinkSync(target); return {path: p};
}
module.exports = {DIRS, list, upload, remove, usedIn, MAX};
