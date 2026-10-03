/* Содержимое сайта (data/*.json): чтение, проверка, резервные копии, сохранение с пересборкой и откатом при ошибке. */
'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const C = require('./config');
const {readJSON, writeFileAtomic, Mutex, nowISO} = require('./util');
const {httpErr} = require('./auth');
const B = require('./build');

const mu = new Mutex();
const COLLECTIONS = {
  site:     {title: 'Настройки сайта',        group: 'Сайт',     file: 'data/site.json',     kind: 'object'},
  content:  {title: 'Тексты страниц и SEO',   group: 'Сайт',     file: 'data/content.json',  kind: 'object'},
  redesign: {title: 'Главная и оформление',   group: 'Сайт',     file: 'data/redesign.json', kind: 'object'},
  products: {title: 'Товары',                 group: 'Каталог',  file: 'data/products.json', kind: 'array', label: 'name'},
  brands:   {title: 'Бренды',                 group: 'Каталог',  file: 'data/brands.json',   kind: 'array', label: 'name'},
  catalog:  {title: 'Категории, задачи, типы', group: 'Каталог', file: 'data/catalog.json',  kind: 'object'},
  events:   {title: 'Мероприятия',            group: 'Обучение', file: 'data/events.json',   kind: 'array', label: 'title'},
  training: {title: 'Преподаватели, FAQ, шаги, видео', group: 'Обучение', file: 'data/training.json', kind: 'object'},
  news:     {title: 'Новости и акции',        group: 'Новости',  file: 'data/news.json',     kind: 'object', list: 'items', label: 'title'}
};
const BACKUPS = path.join(C.DATA, 'backups');
const abs = name => path.join(C.ROOT, COLLECTIONS[name].file);
const version = text => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
const need = name => { if (!COLLECTIONS[name]) throw httpErr(404, 'Неизвестный раздел.'); return COLLECTIONS[name]; };

function summary() {
  return Object.entries(COLLECTIONS).map(([name, c]) => { let count = null; try { const d = readJSON(abs(name)); count = c.kind === 'array' ? d.length : c.list ? d[c.list].length : null; } catch (e) {} return {name, title: c.title, group: c.group, kind: c.kind, list: c.list || null, label: c.label || null, count}; });
}
function read(name) {
  need(name); const text = fs.readFileSync(abs(name), 'utf8');
  return {name, data: JSON.parse(text), version: version(text)};
}

/* ---- проверка: структура и ссылки между файлами ---- */
const isStr = v => typeof v === 'string' && v.trim() !== '';
const dateOk = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'));
const slugOk = v => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
function problems(name, data) {
  const P = [], c = COLLECTIONS[name], other = n => (n === name ? data : readJSON(abs(n)));
  if (c.kind === 'array' && !Array.isArray(data)) return ['Ожидается список.'];
  if (c.kind === 'object' && (typeof data !== 'object' || data === null || Array.isArray(data))) return ['Ожидается объект.'];
  const uniq = (arr, key, what) => { const seen = new Set(); arr.forEach((x, i) => { const v = x && x[key]; if (!isStr(v)) P.push(`${what} №${i + 1}: не заполнено «${key}».`); else if (seen.has(v)) P.push(`${what}: повтор «${key}» = ${v}.`); else seen.add(v); }); };
  const ids = (n, key = 'id', pick = d => d) => new Set((pick(other(n)) || []).map(x => x[key]));
  if (name === 'products') {
    uniq(data, 'id', 'Товар'); uniq(data, 'slug', 'Товар');
    const brands = ids('brands'), cat = other('catalog'), cats = new Set(cat.cats.map(x => x.id)), kinds = new Set(cat.kinds.map(x => x.id)), tasks = new Set(cat.tasks.map(x => x.id));
    data.forEach(p => { const w = `Товар «${p.name || p.id}»`;
      if (!isStr(p.name)) P.push(`${w}: нет названия.`); if (isStr(p.slug) && !slugOk(p.slug)) P.push(`${w}: адрес (slug) — только строчные латинские буквы, цифры и дефисы.`);
      if (!brands.has(p.brand)) P.push(`${w}: неизвестный бренд «${p.brand}».`); if (!cats.has(p.cat)) P.push(`${w}: неизвестная категория «${p.cat}».`); if (!kinds.has(p.kind)) P.push(`${w}: неизвестный тип «${p.kind}».`);
      (p.tasks || []).forEach(t => { if (!tasks.has(t)) P.push(`${w}: неизвестная задача «${t}».`); }); });
  } else if (name === 'brands') {
    uniq(data, 'id', 'Бренд'); data.forEach(b => { if (!isStr(b.name)) P.push(`Бренд «${b.id}»: нет названия.`); if (isStr(b.id) && !slugOk(b.id)) P.push(`Бренд «${b.id}»: id — латиница, цифры, дефис.`); ['c1', 'c2'].forEach(k => { if (b[k] && !/^#[0-9a-f]{3,8}$/i.test(b[k])) P.push(`Бренд «${b.name}»: цвет ${k} — вида #1a2b3c.`); }); });
    if (readJSON(abs('products'), []).some(p => !data.some(b => b.id === p.brand))) P.push('Есть товары, у которых бренд удалён из списка: сначала смените бренд у товаров.');
  } else if (name === 'events') {
    uniq(data, 'id', 'Мероприятие'); uniq(data, 'slug', 'Мероприятие'); const teachers = new Set(other('training').teachers.map(t => t.id)), brands = ids('brands');
    data.forEach(e => { const w = `Мероприятие «${e.title || e.id}»`; if (!isStr(e.title)) P.push(`${w}: нет названия.`); if (!dateOk(e.date)) P.push(`${w}: дата — формат ГГГГ-ММ-ДД.`); if (e.brand && !brands.has(e.brand)) P.push(`${w}: неизвестный бренд «${e.brand}».`); if (e.teacher && !teachers.has(e.teacher)) P.push(`${w}: неизвестный преподаватель «${e.teacher}».`); if (isStr(e.slug) && !slugOk(e.slug)) P.push(`${w}: slug — латиница, цифры, дефис.`); });
  } else if (name === 'news') {
    if (!Array.isArray(data.items) || !Array.isArray(data.categories)) return ['Нужны списки «categories» и «items».'];
    uniq(data.items, 'slug', 'Новость'); const cats = new Set(data.categories.map(x => x.id));
    data.items.forEach(n => { const w = `Новость «${n.title || n.slug}»`; if (!isStr(n.title)) P.push(`${w}: нет заголовка.`); if (!cats.has(n.category)) P.push(`${w}: неизвестная категория «${n.category}».`); if (!dateOk(n.date)) P.push(`${w}: дата — формат ГГГГ-ММ-ДД.`); if (isStr(n.slug) && !slugOk(n.slug)) P.push(`${w}: slug — латиница, цифры, дефис.`); });
  } else if (name === 'catalog') {
    ['cats', 'tasks', 'kinds'].forEach(k => { if (!Array.isArray(data[k])) P.push(`Нужен список «${k}».`); else uniq(data[k], 'id', k); });
    if (!P.length) { const prods = readJSON(abs('products'), []); prods.forEach(p => { if (!data.cats.some(c => c.id === p.cat)) P.push(`Товар «${p.name}»: категория «${p.cat}» удалена.`); if (!data.kinds.some(k => k.id === p.kind)) P.push(`Товар «${p.name}»: тип «${p.kind}» удалён.`); }); }
  } else if (name === 'site') {
    const e = data.contacts && data.contacts.email; if (!isStr(e) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) P.push('Контакты: нужен корректный e-mail.');
    if (data.formEndpoint && !/^(https?:\/\/[^\s]+|\/[^\s]*)$/.test(data.formEndpoint)) P.push('Адрес приёма заявок: полный адрес вида https://… или путь /api/lead.');
    if (data.url && !/^https?:\/\/[^\s]+\/$/.test(data.url)) P.push('Адрес сайта (url) — полный, с http(s):// и слэшем на конце.');
  } else if (name === 'training') {
    ['teachers', 'steps', 'faq'].forEach(k => { if (!Array.isArray(data[k])) P.push(`Нужен список «${k}».`); }); if (Array.isArray(data.teachers)) uniq(data.teachers, 'id', 'Преподаватель');
    if (!P.length) readJSON(abs('events'), []).forEach(e => { if (e.teacher && !data.teachers.some(t => t.id === e.teacher)) P.push(`Мероприятие «${e.title}»: преподаватель «${e.teacher}» удалён.`); });
  }
  return P;
}

/* ---- резервные копии ---- */
function backup(name, text, who) {
  const dir = path.join(BACKUPS, name); fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '__' + String(who || 'system').replace(/[^\w.-]/g, '_');
  fs.writeFileSync(path.join(dir, id + '.json'), text, {mode: 0o600});
  const all = fs.readdirSync(dir).sort(); all.slice(0, Math.max(0, all.length - 60)).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });     // последние 60
  return id;
}
function history(name) {
  need(name); const dir = path.join(BACKUPS, name); if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse().map(f => { const [t, who] = f.slice(0, -5).split('__'); return {id: f.slice(0, -5), at: t.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z'), who: who || '', size: fs.statSync(path.join(dir, f)).size}; });
}
const pretty = d => JSON.stringify(d, null, 2) + '\n';

/* ---- сохранение: проверка → резервная копия → запись → сборка → при ошибке откат ---- */
function save(name, data, opts) {
  need(name); opts = opts || {};
  return mu.run(async () => {
    const file = abs(name), old = fs.readFileSync(file, 'utf8');
    if (opts.version && opts.version !== version(old)) throw httpErr(409, 'Эти данные уже изменил кто-то другой. Обновите страницу и повторите правку.', {current: version(old)});
    const pr = problems(name, data); if (pr.length) throw httpErr(422, 'Данные не сохранены: ' + pr.slice(0, 8).join(' '), {problems: pr});
    // данные не изменились (даже если файл набран вручную в другом формате) — ничего не пишем и не пересобираем
    let same = false; try { same = JSON.stringify(JSON.parse(old)) === JSON.stringify(data); } catch (e) {}
    if (same) return {ok: true, unchanged: true, version: version(old), build: null};
    const text = pretty(data);
    const bid = backup(name, old, opts.who);
    writeFileAtomic(file, text);
    const s = C.loadSettings();
    if (opts.build === false || !s.autoBuild) return {ok: true, version: version(text), backup: bid, build: null};
    const res = await B.build('сохранён раздел «' + COLLECTIONS[name].title + '»');
    if (!res.ok) {                                         // сборка не прошла — возвращаем прежние данные и собираем заново
      writeFileAtomic(file, old); await B.build('откат после ошибки сборки');
      throw httpErr(422, 'Сайт не собирается с этими данными — изменения отменены. ' + String((res.build.code ? res.build.out : (res.check && res.check.out) || '')).split('\n').slice(0, 6).join(' '), {build: res});
    }
    return {ok: true, version: version(text), backup: bid, build: {ok: true, at: res.at, ms: res.build.ms + (res.check ? res.check.ms : 0)}};
  });
}
function restore(name, id, who) {
  need(name); const file = path.join(BACKUPS, name, String(id).replace(/[^\w.-]/g, '') + '.json');
  if (!fs.existsSync(file)) throw httpErr(404, 'Копия не найдена.');
  return save(name, JSON.parse(fs.readFileSync(file, 'utf8')), {who});
}
module.exports = {COLLECTIONS, summary, read, save, history, restore, problems, version};
