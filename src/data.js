/* Загрузка data/*.json и вычисляемые связи (бренды ↔ товары ↔ мероприятия ↔ новости). Только чтение. */
const fs = require('fs');
const path = require('path');
const S = require('../js/shared.js');

const dir = path.join(__dirname, '..', 'data');
const read = n => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
const byId = (arr, key = 'id') => Object.fromEntries(arr.map(x => [x[key], x]));

function load() {
  const site = read('site'), content = read('content'), catalog = read('catalog'), training = read('training');
  const brands = read('brands'), products = read('products'), events = read('events'), newsRaw = read('news');
  const ctx = {site, content, brands, products, events, training};

  ctx.cats = catalog.cats; ctx.tasks = catalog.tasks; ctx.kinds = catalog.kinds;
  ctx.brandById = byId(brands); ctx.catById = byId(ctx.cats); ctx.taskById = byId(ctx.tasks); ctx.kindById = byId(ctx.kinds);
  ctx.teachers = training.teachers; ctx.teacherById = byId(ctx.teachers);
  ctx.productById = Object.assign(byId(products), byId(products, 'slug'));
  ctx.eventById = Object.assign(byId(events), byId(events, 'slug'));

  brands.forEach(b => { b.tasks = ctx.tasks.filter(t => t.brands.includes(b.id)).map(t => t.id); });

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
