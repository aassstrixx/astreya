/* Загрузка data/*.json и вычисляемые связи (бренды ↔ товары ↔ мероприятия ↔ новости). Только чтение. */
const fs = require('fs');
const path = require('path');
const S = require('../js/shared.js');

const dir = path.join(__dirname, '..', 'data');
const read = n => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
const byId = (arr, key = 'id') => Object.fromEntries(arr.map(x => [x[key], x]));

/* необязательные файлы (меню, свои страницы, оформление): нет файла — берутся значения по умолчанию */
const readOpt = (n, dflt) => { try { return read(n); } catch (e) { if (e.code === 'ENOENT') return dflt; throw e; } };
const DEFAULT_NAV = [{title: 'Каталог', href: 'catalog.html', key: '/catalog'}, {title: 'Бренды', href: 'brands.html', key: '/brands'}, {title: 'Обучение', href: 'training.html', key: '/training'}, {title: 'Новости', href: 'news.html', key: '/news'}, {title: 'Компания', href: 'company.html', key: '/company'}];
const DEFAULT_THEME = {navy: '#0b1a33', blue: '#2f5bd6', blueDark: '#2347b0', milk: '#f5f2ec', mist: '#e5ebf5'};

function load() {
  const site = read('site'), content = read('content'), catalog = read('catalog'), training = read('training');
  const brands = read('brands'), products = read('products'), events = read('events'), newsRaw = read('news');
  const ctx = {site, content, brands, products, events, training};
  ctx.menu = readOpt('menu', {nav: DEFAULT_NAV});
  ctx.nav = (ctx.menu.nav && ctx.menu.nav.length ? ctx.menu.nav : DEFAULT_NAV).map(i => ({title: i.title, href: i.href, key: i.key || '/' + String(i.href).replace(/\.html$/, '').replace(/^pages\//, 'p/')}));
  ctx.pagesRaw = readOpt('pages', {items: []}).items || [];
  ctx.customPages = ctx.pagesRaw.filter(p => p.published !== false);
  ctx.customNav = ctx.customPages.filter(p => p.nav).map(p => ({title: p.navTitle || p.title, href: `pages/${p.slug}.html`, key: '/p/' + p.slug}));
  ctx.theme = readOpt('theme', {enabled: false, colors: DEFAULT_THEME, radius: 14});
  ctx.redesign = site.redesign ? read('redesign') : null;      // слой доработок (см. README → «Доработки и откат»)

  ctx.cats = catalog.cats; ctx.tasks = catalog.tasks; ctx.kinds = catalog.kinds;
  ctx.brandById = byId(brands); ctx.catById = byId(ctx.cats); ctx.taskById = byId(ctx.tasks); ctx.kindById = byId(ctx.kinds);
  ctx.teachers = training.teachers; ctx.teacherById = byId(ctx.teachers);
  ctx.productById = Object.assign(byId(products), byId(products, 'slug'));
  ctx.eventById = Object.assign(byId(events), byId(events, 'slug'));

  brands.forEach(b => { b.tasks = ctx.tasks.filter(t => t.brands.includes(b.id)).map(t => t.id); });

  /* логотипы брендов: размеры из заголовка PNG / viewBox SVG (для width/height в разметке — без скачков вёрстки) */
  brands.forEach(b => {
    if (!b.logo) return;
    const f = path.join(dir, '..', b.logo);
    if (!fs.existsSync(f)) { console.warn(`Нет файла логотипа: ${b.logo} (бренд ${b.id}) — будет показана монограмма`); b.logo = null; return; }
    if (/\.svg$/i.test(f)) { const m = fs.readFileSync(f, 'utf8').match(/viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/); if (m) { b.logoW = +m[1]; b.logoH = +m[2]; } return; }
    const h = fs.readFileSync(f).subarray(0, 24);
    if (h.toString('latin1', 1, 4) === 'PNG') { b.logoW = h.readUInt32BE(16); b.logoH = h.readUInt32BE(20); }
  });

  /* новости: подставляем пороги скидок в текст */
  const disc = site.discounts.map(d => `${d.pct}% от ${S.rub(d.from)}`).join(', ');
  ctx.newsCats = newsRaw.categories; ctx.newsCatById = byId(newsRaw.categories);
  ctx.news = newsRaw.items.slice().sort((a, b) => b.date.localeCompare(a.date));
  ctx.news.forEach(n => { n.body = n.body.map(p => p.replace('{{discounts}}', disc)); });
  ctx.newsBySlug = byId(ctx.news, 'slug');

  ctx.sortedEvents = events.slice().sort((a, b) => a.date.localeCompare(b.date));
  ctx.stats = {brands: brands.length, products: products.length, offices: site.offices.length};

  /* сопутствующие товары: тот же бренд → та же категория/тип → пересечение задач */
  ctx.related = p => {
    const score = q => (q.brand === p.brand ? 8 : 0) + (q.cat === p.cat ? 3 : 0) + (q.kind === p.kind ? 2 : 0) + q.tasks.filter(t => p.tasks.includes(t)).length;
    return products.filter(q => q.id !== p.id).map(q => [score(q), q]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 4).map(x => x[1]);
  };
  return ctx;
}

module.exports = {load};
