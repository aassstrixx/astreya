#!/usr/bin/env node
/* Генератор сайта Астреи. Без зависимостей: только Node.js (≥ 16).
   Читает data/*.json и шаблоны src/, пишет готовые HTML-страницы в корень проекта, а также js/data.js, sitemap.xml и robots.txt.
   Запуск: node tools/build.js            — собрать сайт
           node tools/build.js --bundle=out.html — дополнительно собрать один автономный HTML-файл (для предпросмотра/артефакта) */
const fs = require('fs');
const path = require('path');
const S = require('../js/shared.js');
const {load} = require('../src/data.js');
const components = require('../src/components.js');
const layoutFactory = require('../src/layout.js');
const home = require('../src/pages/home.js');
const catalog = require('../src/pages/catalog.js');
const {brandsPage, brandPage} = require('../src/pages/brands.js');
const product = require('../src/pages/product.js');
const {trainingPage, eventPage} = require('../src/pages/training.js');
const {newsPage, articlePage} = require('../src/pages/news.js');
const company = require('../src/pages/company.js');
const contacts = require('../src/pages/contacts.js');
const partners = require('../src/pages/partners.js');
const {searchPage, legalPage} = require('../src/pages/misc.js');
const customPage = require('../src/pages/custom.js');
const blocks = require('../src/blocks-schema.js');

const ROOT = path.join(__dirname, '..');
const ctx = load();
/* версия ресурсов (?v=…) в ссылках на CSS/JS: меняется при любой правке стилей, скриптов или данных — браузер и CDN не показывают устаревшие файлы */
ctx.assetVersion = (() => {
  const h = require('crypto').createHash('md5');
  const list = d => fs.readdirSync(path.join(__dirname, '..', d)).filter(f => /\.(css|js|json)$/.test(f) && f !== 'data.js').sort().map(f => path.join(__dirname, '..', d, f));
  [...list('css'), ...list('js'), ...list('data')].forEach(f => h.update(fs.readFileSync(f)));
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1).forEach(e => e.isDirectory() ? walk(path.join(d, e.name)) : h.update(fs.readFileSync(path.join(d, e.name))));
  ['brands', 'photos', 'teachers', 'jar', 'bg'].filter(d => fs.existsSync(path.join(__dirname, '..', 'assets', d))).forEach(d => walk(path.join(__dirname, '..', 'assets', d)));
  return h.digest('hex').slice(0, 8);
})();
const C = components(ctx), L = layoutFactory(ctx, C);
const {site, content} = ctx;
const BUILD_DATE = new Date().toISOString().slice(0, 10);
/* meta description: 70–160 символов; слишком короткий анонс дополняется хвостом, слишком длинный обрезается */
const descr = (s, tail) => { s = trunc(s); return s.length < 70 && tail ? trunc(`${s.replace(/[.\s]+$/, '')}. ${tail}`) : s; };
const trunc = (s, n = 158) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,;:.—-]+\S*$/, '') + '…'; };
const structured = !site.demoNotice;      // JSON-LD Product/Event/Article — только когда данные перестали быть демонстрационными

const pages = [];
function page(p, body) {
  const depth = p.path.split('/').length - 1;
  const P = Object.assign({depth, root: depth ? '../'.repeat(depth) : ''}, p);
  pages.push({P, html: L.shell(P, typeof body === 'function' ? body(P) : body), path: p.path, priority: p.priority});
}
const seo = k => content.seo[k];

/* ---- основные страницы ---- */
page({key: 'home', path: 'index.html', nav: '/', title: seo('index').title, description: seo('index').description, priority: 1.0}, P => home(ctx, C, P));
page({key: 'catalog', path: 'catalog.html', nav: '/catalog', title: seo('catalog').title, description: seo('catalog').description, priority: 0.9, breadcrumbs: [['Главная', 'index.html'], ['Каталог', 'catalog.html']]}, P => catalog(ctx, C, P));
page({key: 'brands', path: 'brands.html', nav: '/brands', title: seo('brands').title, description: seo('brands').description, priority: 0.8, breadcrumbs: [['Главная', 'index.html'], ['Бренды', 'brands.html']]}, P => brandsPage(ctx, C, P));
page({key: 'training', path: 'training.html', nav: '/training', title: seo('training').title, description: seo('training').description, priority: 0.8, breadcrumbs: [['Главная', 'index.html'], ['Обучение', 'training.html']],
  jsonld: [{'@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: ctx.training.faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}}))}]}, P => trainingPage(ctx, C, P));
page({key: 'news', path: 'news.html', nav: '/news', title: seo('news').title, description: seo('news').description, priority: 0.7, breadcrumbs: [['Главная', 'index.html'], ['Новости', 'news.html']]}, P => newsPage(ctx, C, P));
page({key: 'company', path: 'company.html', nav: '/company', title: seo('company').title, description: seo('company').description, priority: 0.7, breadcrumbs: [['Главная', 'index.html'], ['Компания', 'company.html']]}, P => company(ctx, C, P));
page({key: 'contacts', path: 'contacts.html', nav: '/contacts', title: seo('contacts').title, description: seo('contacts').description, priority: 0.7, breadcrumbs: [['Главная', 'index.html'], ['Контакты', 'contacts.html']]}, P => contacts(ctx, C, P));
page({key: 'partners', path: 'partners.html', nav: '/partners', title: seo('partners').title, description: seo('partners').description, priority: 0.9, breadcrumbs: [['Главная', 'index.html'], ['Стать партнёром', 'partners.html']]}, P => partners(ctx, C, P));
page({key: 'search', path: 'search.html', nav: '', title: seo('search').title, description: seo('search').description, noindex: true, priority: 0}, P => searchPage(ctx, C, P));
page({key: 'privacy', path: 'privacy.html', nav: '', title: seo('privacy').title, description: seo('privacy').description, priority: 0.2, breadcrumbs: [['Главная', 'index.html'], ['Политика конфиденциальности', 'privacy.html']]}, P => legalPage(ctx, C, P, 'privacy'));
page({key: 'terms', path: 'terms.html', nav: '', title: seo('terms').title, description: seo('terms').description, priority: 0.2, breadcrumbs: [['Главная', 'index.html'], ['Пользовательское соглашение', 'terms.html']]}, P => legalPage(ctx, C, P, 'terms'));

/* ---- бренды ---- */
ctx.brands.forEach(b => page({key: 'brand', path: `brands/${b.id}.html`, nav: '/brands', ogType: 'website', priority: 0.7,
  title: `${b.name} — бренд профессиональной косметики | Астрея`, description: trunc(b.desc),
  breadcrumbs: [['Главная', 'index.html'], ['Бренды', 'brands.html'], [b.name, `brands/${b.id}.html`]]}, P => brandPage(ctx, C, P, b)));

/* ---- товары ---- */
ctx.products.forEach(p => {
  const b = ctx.brandById[p.brand];
  page({key: 'product', path: `products/${p.slug}.html`, nav: '/catalog', ogType: 'website', priority: 0.6, ...(p.image ? {image: p.image} : {}),
    title: (S.norm(p.name).includes(S.norm(b.name)) ? `${p.name} — профессиональное решение | Астрея` : `${p.name} — ${b.name} | Астрея`), description: trunc(`${p.desc} Бренд ${b.name}. Запросите информацию у менеджеров «Астреи».`),
    breadcrumbs: [['Главная', 'index.html'], ['Каталог', 'catalog.html'], [b.name, `brands/${b.id}.html`], [p.name, `products/${p.slug}.html`]],
    jsonld: structured ? [{'@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.desc, brand: {'@type': 'Brand', name: b.name}, ...(p.image ? {image: L.absUrl(p.image)} : {}), ...(p.sku ? {sku: p.sku} : {})}] : []}, P => product(ctx, C, P, p));
});

/* ---- мероприятия ---- */
ctx.events.forEach(e => {
  const d = S.dparts(e.date);
  page({key: 'event', path: `training/${e.slug}.html`, nav: '/training', priority: 0.6,
    title: `${e.title} | Астрея`, description: trunc(`${e.description} ${e.fmt}, ${e.city}, ${d.full}, ${e.time}.`),
    breadcrumbs: [['Главная', 'index.html'], ['Обучение', 'training.html'], [e.title, `training/${e.slug}.html`]],
    jsonld: structured ? [{'@context': 'https://schema.org', '@type': 'Event', name: e.title, startDate: e.date, description: e.description, eventAttendanceMode: e.fmt === 'Очно' ? 'https://schema.org/OfflineEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode', organizer: {'@type': 'Organization', name: site.name}}] : []}, P => eventPage(ctx, C, P, e));
});

/* ---- новости ---- */
ctx.news.forEach(n => page({key: 'article', path: `news/${n.slug}.html`, nav: '/news', ogType: 'article', priority: 0.5,
  title: `${n.title} | Астрея`, description: descr(n.excerpt, 'Новости и акции компании «Астрея».'),
  breadcrumbs: [['Главная', 'index.html'], ['Новости', 'news.html'], [n.title, `news/${n.slug}.html`]],
  jsonld: structured ? [{'@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title, datePublished: n.date, description: n.excerpt, publisher: {'@type': 'Organization', name: site.name}}] : []}, P => articlePage(ctx, C, P, n)));

/* ---- страницы из админки (data/pages.json): pages/<slug>.html ---- */
{ const bad = blocks.pageProblems(ctx.pagesRaw); if (bad.length) { console.error('data/pages.json: ' + bad.slice(0, 6).join(' ')); process.exit(1); } }
ctx.customPages.forEach(pg => page({key: 'custom', path: `pages/${pg.slug}.html`, nav: pg.nav ? '/p/' + pg.slug : '', priority: 0.5, noindex: !!pg.noindex,
  title: `${pg.title} | Астрея`, description: descr(pg.description || pg.lead || pg.title, 'Астрея — дистрибьютор профессиональной косметики.'),
  breadcrumbs: [['Главная', 'index.html'], [pg.title, `pages/${pg.slug}.html`]]}, P => customPage(ctx, C, P, pg)));

/* ---- запись файлов ---- */
for (const d of ['brands', 'products', 'training', 'news', 'pages']) fs.rmSync(path.join(ROOT, d), {recursive: true, force: true});
for (const pg of pages) {
  const f = path.join(ROOT, pg.path);
  fs.mkdirSync(path.dirname(f), {recursive: true});
  fs.writeFileSync(f, pg.html);
}

/* ---- данные для браузера: js/data.js (формы, поиск, калькулятор) ---- */
const brandName = id => ctx.brandById[id].name;
const index = [
  ...ctx.products.map(p => ({t: 'product', title: p.name, url: `products/${p.slug}.html`, sub: `${brandName(p.brand)} · ${ctx.catById[p.cat].name}`,
    q: S.norm([p.name, p.desc, brandName(p.brand), ctx.catById[p.cat].name, (ctx.kindById[p.kind] || {}).name, p.tasks.map(t => ctx.taskById[t].label).join(' ')].join(' '))})),
  ...ctx.brands.map(b => ({t: 'brand', title: b.name, url: `brands/${b.id}.html`, sub: b.tag,
    q: S.norm([b.name, b.tag, b.desc, b.group, b.country, b.tasks.map(t => ctx.taskById[t].label).join(' ')].join(' '))})),
  ...ctx.customPages.filter(pg => !pg.noindex).map(pg => ({t: 'page', title: pg.title, url: `pages/${pg.slug}.html`, sub: pg.description || pg.lead || '', q: S.norm([pg.title, pg.description, pg.lead, ...pg.blocks.flatMap(b => [b.title, b.text, ...(b.paragraphs || []), ...(b.left || []), ...(b.right || []), ...(b.items || []).map(i => typeof i === 'string' ? i : [i.title, i.text, i.q, i.a, i.label].join(' '))])].filter(Boolean).join(' '))})),
  ...ctx.news.map(n => ({t: 'news', title: n.title, url: `news/${n.slug}.html`, sub: `${ctx.newsCatById[n.category].name} · ${S.dparts(n.date).full}`, q: S.norm([n.title, n.excerpt, n.body.join(' '), ctx.newsCatById[n.category].name].join(' '))})),
  ...ctx.sortedEvents.map(e => ({t: 'event', title: e.title, url: `training/${e.slug}.html`, sub: `${e.fmt} · ${e.city} · ${S.dparts(e.date).full}`, date: e.date, q: S.norm([e.title, e.description, e.city, e.fmt, e.speaker, brandName(e.brand), 'семинар мероприятие обучение запись'].join(' '))}))
];
const data = {
  site: {name: site.name, contacts: {email: site.contacts.email, phone: site.contacts.phone, phoneRaw: site.contacts.phoneRaw, hours: site.contacts.hours}, formEndpoint: site.formEndpoint || '', discounts: site.discounts},
  brands: ctx.brands.map(b => ({id: b.id, name: b.name, logo: b.logo || undefined, logoW: b.logoW, logoH: b.logoH, logoScale: b.logoScale})),
  cats: ctx.cats, tasks: ctx.tasks.map(t => ({id: t.id, label: t.label})), kinds: ctx.kinds,
  products: ctx.products.map(p => ({id: p.id, slug: p.slug, name: p.name, brand: p.brand})),
  events: ctx.sortedEvents.map(e => ({id: e.id, slug: e.slug, title: e.title, date: e.date, city: e.city})),
  index
};
fs.writeFileSync(path.join(ROOT, 'js', 'data.js'), `/* Сгенерировано tools/build.js из data/*.json — не редактировать вручную. */\nwindow.ASTREYA_DATA = ${JSON.stringify(data)};\n`);

/* ---- sitemap.xml и robots.txt ---- */
const base = L.base;
const urls = pages.filter(p => !p.P.noindex).map(p => `  <url><loc>${L.absUrl(p.path)}</loc><lastmod>${BUILD_DATE}</lastmod><priority>${(p.priority || 0.5).toFixed(1)}</priority></url>`);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /search.html\n\nSitemap: ${base}sitemap.xml\n`);

console.log(`Собрано страниц: ${pages.length} (в sitemap: ${urls.length}); js/data.js: ${(fs.statSync(path.join(ROOT, 'js', 'data.js')).size / 1024).toFixed(1)} КБ`);
module.exports = {pages, ctx};

if (process.argv.some(a => a.startsWith('--bundle='))) require('./bundle.js')({pages, ctx, layout: L, root: ROOT, out: process.argv.find(a => a.startsWith('--bundle=')).slice(9)});
