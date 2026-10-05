/* «Обзор» админки: сводка по заявкам, содержимому, сборке и публикации + проверки качества данных («здоровье сайта»); поиск по содержимому для палитры команд. */
'use strict';
const path = require('path'), fs = require('fs');
const C = require('./config');
const CT = require('./content');
const L = require('./leads');
const B = require('./build');
const AUD = require('./audit');
const {readJSON} = require('./util');

const data = n => { try { return JSON.parse(fs.readFileSync(path.join(C.ROOT, 'data', n + '.json'), 'utf8')); } catch (e) { return null; } };
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/* проверки качества данных: каждая — {level: warn|info|ok, text, link}; link — хэш раздела админки, где это исправить */
function health() {
  const out = [], add = (level, text, link) => out.push({level, text, link});
  const products = data('products') || [], brands = data('brands') || [], events = data('events') || [], news = (data('news') || {}).items || [], site = data('site') || {}, pages = (data('pages') || {}).items || [];
  const shortDesc = products.filter(p => !p.desc || String(p.desc).trim().length < 40);
  if (shortDesc.length) add('warn', `${shortDesc.length} ${plural(shortDesc.length, 'товар', 'товара', 'товаров')} без нормального описания (короче 40 символов): ${shortDesc.slice(0, 3).map(p => '«' + p.name + '»').join(', ')}${shortDesc.length > 3 ? '…' : ''}`, '#/content/products');
  const noLogo = brands.filter(b => !b.logo); if (noLogo.length) add('info', `У ${noLogo.length} ${plural(noLogo.length, 'бренда', 'брендов', 'брендов')} нет логотипа — на сайте показана буква: ${noLogo.map(b => b.name).join(', ')}`, '#/content/brands');
  const missing = []; brands.forEach(b => { if (b.logo && !fs.existsSync(path.join(C.ROOT, b.logo))) missing.push(b.name); }); products.forEach(p => { (p.docs || []).forEach(d => { if (d && d.url && /^assets\//.test(d.url) && !fs.existsSync(path.join(C.ROOT, d.url))) missing.push(p.name + ' (документ)'); }); });
  if (missing.length) add('warn', `Файлы не найдены на диске: ${missing.slice(0, 4).join(', ')}`, '#/files');
  const old = events.filter(e => e.date < daysAgo(60)); if (old.length) add('info', `${old.length} ${plural(old.length, 'прошедшее мероприятие', 'прошедших мероприятия', 'прошедших мероприятий')} старше двух месяцев — их можно убрать из расписания`, '#/content/events');
  const upcoming = events.filter(e => e.date >= today()); if (!upcoming.length) add('warn', 'В расписании нет ближайших мероприятий — раздел «Обучение» выглядит пустым', '#/content/events');
  const staleNews = news.length ? news.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0].date : null; if (staleNews && staleNews < daysAgo(90)) add('info', `Последняя новость от ${staleNews} — прошло больше трёх месяцев`, '#/content/news');
  if (site.demoNotice) add('warn', 'Сайт помечен как демонстрационный: в подвале показывается пометка, разметка товаров и событий для поисковиков отключена. Снимите пометку, когда данные станут реальными', '#/content/site');
  const demo = [...products, ...events, ...news].filter(x => x && x.demo).length; if (demo) add('info', `${demo} ${plural(demo, 'запись помечена', 'записи помечены', 'записей помечено')} как демонстрационные`, '#/content');
  const hidden = pages.filter(p => p.published === false).length; if (hidden) add('info', `${hidden} ${plural(hidden, 'страница скрыта', 'страницы скрыты', 'страниц скрыто')} (черновики)`, '#/pages');
  const noDesc = pages.filter(p => p.published !== false && !p.description).length; if (noDesc) add('info', `${noDesc} ${plural(noDesc, 'своя страница', 'своих страницы', 'своих страниц')} без описания для поисковиков`, '#/pages');
  const st = L.stats(); if (st.new) add('warn', `${st.new} ${plural(st.new, 'необработанная заявка', 'необработанные заявки', 'необработанных заявок')}`, '#/leads');
  const b = B.last(); if (b && !b.ok) add('warn', 'Последняя сборка сайта завершилась ошибкой — смотрите раздел «Публикация»', '#/publish');
  if (!out.some(x => x.level === 'warn')) out.unshift({level: 'ok', text: 'Серьёзных замечаний к данным сайта нет', link: ''});
  return out;
}
function plural(n, a, b, c) { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; }

function overview() {
  const cols = CT.summary(), pagesDir = path.join(C.ROOT, 'pages');
  return {
    leads: L.stats(),
    counts: Object.fromEntries(cols.filter(c => c.count !== null).map(c => [c.name, c.count])),
    build: B.last(), health: health(), audit: AUD.tail(8),
    pages: (() => { try { return fs.readdirSync(pagesDir).filter(f => f.endsWith('.html')).length; } catch (e) { return 0; } })()
  };
}

/* поиск по содержимому для палитры команд (Ctrl+K): ≤ 30 результатов, по подстроке без учёта регистра и ё */
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
function search(q) {
  q = norm(q).trim(); if (q.length < 2) return [];
  const out = [], add = (type, title, sub, link, hay) => { if (norm([title, sub, hay].join(' ')).includes(q)) out.push({type, title, sub, link}); };
  (data('products') || []).forEach(p => add('Товар', p.name, p.brand, '#/content/products/' + encodeURIComponent(p.id), p.desc));
  (data('brands') || []).forEach(b => add('Бренд', b.name, b.group || '', '#/content/brands/' + encodeURIComponent(b.id), b.tag + ' ' + b.desc));
  ((data('news') || {}).items || []).forEach(n => add('Новость', n.title, n.date, '#/content/news/' + encodeURIComponent(n.slug || n.id), n.excerpt));
  (data('events') || []).forEach(e => add('Мероприятие', e.title, e.date + ' · ' + (e.city || ''), '#/content/events/' + encodeURIComponent(e.id), e.description));
  ((data('pages') || {}).items || []).forEach(p => add('Страница', p.title, 'pages/' + p.slug + '.html', '#/pages/' + encodeURIComponent(p.slug), p.description));
  return out.slice(0, 30);
}
/* список страниц сайта (готовые HTML): для выбора ссылки, меню и предпросмотра */
const GROUPS = [['', 'Основные'], ['pages', 'Свои страницы'], ['brands', 'Бренды'], ['products', 'Товары'], ['training', 'Мероприятия'], ['news', 'Новости']];
function sitePages() {
  const out = [], title = f => { try { const m = fs.readFileSync(f, 'utf8').match(/<title>([^<]*)<\/title>/); return m ? m[1].replace(/\s*\|\s*Астрея$/, '') : path.basename(f); } catch (e) { return path.basename(f); } };
  for (const [dir, label] of GROUPS) {
    const base = path.join(C.ROOT, dir); let files = []; try { files = fs.readdirSync(base).filter(f => f.endsWith('.html')).sort(); } catch (e) { continue; }
    files.forEach(f => out.push({path: (dir ? dir + '/' : '') + f, title: title(path.join(base, f)), group: label}));
  }
  return out;
}
module.exports = {overview, health, search, sitePages};
