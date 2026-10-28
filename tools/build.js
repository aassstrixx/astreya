#!/usr/bin/env node
/* Генератор сайта Астрея. Без зависимостей: только Node.js (≥ 16).
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
const start = require('../src/pages/start.js');
const {searchPage, legalPage, notFoundPage} = require('../src/pages/misc.js');
const customPage = require('../src/pages/custom.js');
const blocks = require('../src/blocks-schema.js');
const buildKb = require('../src/assistant-kb.js');
const agentFiles = require('../src/agent-files.js');

const ROOT = path.join(__dirname, '..');
/* Размеры и наличие прозрачности у изображения по заголовку файла (PNG, WebP, JPEG) — без зависимостей. Нет файла или формат неизвестен — null */
function imageInfo(rel) {
  try {
    const b = fs.readFileSync(path.join(ROOT, rel));
    if (b.length > 24 && b.toString('latin1', 1, 4) === 'PNG') { const ct = b[25]; return {w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: ct === 4 || ct === 6 || b.indexOf('tRNS') > 0}; }
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const t = b.toString('latin1', 12, 16);
      if (t === 'VP8X') return {w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10)};
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return {w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff), alpha: !!((v >> 28) & 1)}; }
      if (t === 'VP8 ') return {w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false};
    }
    if (b[0] === 0xff && b[1] === 0xd8) { for (let i = 2; i + 9 < b.length;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return {w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), alpha: false}; i += 2 + b.readUInt16BE(i + 2); } }
  } catch (e) {}
  return null;
}
const ctx = load();
/* версия ресурсов (?v=…) в ссылках на CSS/JS: меняется при любой правке стилей, скриптов или данных — браузер и CDN не показывают устаревшие файлы */
ctx.assetVersion = (() => {
  const h = require('crypto').createHash('md5');
  const list = d => fs.readdirSync(path.join(__dirname, '..', d)).filter(f => /\.(css|js|json)$/.test(f) && f !== 'data.js' && f !== 'kb.js').sort().map(f => path.join(__dirname, '..', d, f));
  [...list('css'), ...list('js'), ...list('data')].forEach(f => h.update(fs.readFileSync(f)));
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1).forEach(e => e.isDirectory() ? walk(path.join(d, e.name)) : h.update(fs.readFileSync(path.join(d, e.name))));
  ['brands', 'photos', 'teachers', 'jar-arch', 'bg'].filter(d => fs.existsSync(path.join(__dirname, '..', 'assets', d))).forEach(d => walk(path.join(__dirname, '..', 'assets', d)));
  return h.digest('hex').slice(0, 8);
})();
/* тексты форм из data/content.json → forms (админка: «Тексты и SEO → Тексты форм»): применяются и на страницах, и в браузере (js/data.js → forms); поля и обязательность менять нельзя */
const FORM_KEYS = ['title', 'subject', 'lead', 'submit', 'ph', 'agree', 'done'];
for (const [k, v] of Object.entries(ctx.content.forms || {})) if (S.FORM_TYPES[k]) for (const f of FORM_KEYS) if (v[f] !== undefined && v[f] !== null && v[f] !== '') S.FORM_TYPES[k][f] = v[f];
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
/* ---- ASTREYA HOUSE: предпросмотр главной-дома отдельной страницей house.html (без индексации), пока index.html собирается прежним; при house.enabled index.html сам становится домом ---- */
if (ctx.redesign && ctx.redesign.house && ctx.redesign.house.preview && !ctx.redesign.house.enabled) page({key: 'home', path: 'house.html', nav: '/', title: 'ASTREYA HOUSE — предпросмотр главной | Астрея', description: 'Предпросмотр новой главной ASTREYA HOUSE: центральный зал, журнал на столике и семь комнат с содержимым сайта. Страница не индексируется.', noindex: true, priority: 0, house: true}, P => home(ctx, C, P));
/* ---- «Старт со Стеллой» (extras.sales): страница без пункта меню; нет флага — страницы нет ---- */
if (ctx.sales) page({key: 'start', path: ctx.sales.planner.path, nav: '', title: ctx.sales.planner.seoTitle, description: ctx.sales.planner.seoDescription, priority: 0.8, breadcrumbs: [['Главная', 'index.html'], [ctx.sales.planner.eyebrow, ctx.sales.planner.path]]}, P => start(ctx, C, P));
page({key: 'search', path: 'search.html', nav: '', title: seo('search').title, description: seo('search').description, noindex: true, priority: 0}, P => searchPage(ctx, C, P));
page({key: 'privacy', path: 'privacy.html', nav: '', title: seo('privacy').title, description: seo('privacy').description, priority: 0.2, breadcrumbs: [['Главная', 'index.html'], ['Политика конфиденциальности', 'privacy.html']]}, P => legalPage(ctx, C, P, 'privacy'));
page({key: 'consent', path: 'consent.html', nav: '', title: seo('consent').title, description: seo('consent').description, priority: 0.2, breadcrumbs: [['Главная', 'index.html'], ['Согласие на обработку персональных данных', 'consent.html']]}, P => legalPage(ctx, C, P, 'consent'));
page({key: 'terms', path: 'terms.html', nav: '', title: seo('terms').title, description: seo('terms').description, priority: 0.2, breadcrumbs: [['Главная', 'index.html'], ['Пользовательское соглашение', 'terms.html']]}, P => legalPage(ctx, C, P, 'terms'));

/* ---- 404.html: GitHub Pages показывает его на любом неверном адресе (на любой глубине), поэтому пути в нём — от корня сайта, не «../» ---- */
page({key: 'notfound', path: '404.html', nav: '', root: new URL(L.base).pathname, title: 'Страница не найдена — ошибка 404 | Астрея', description: 'Такой страницы нет на сайте «Астрея». Воспользуйтесь поиском или перейдите в каталог, к брендам, обучению и новостям.', noindex: true, priority: 0}, P => notFoundPage(ctx, C, P));

/* ---- бренды ---- */
ctx.brands.forEach(b => page({key: 'brand', path: `brands/${b.id}.html`, nav: '/brands', ogType: 'website', priority: 0.7,
  title: `${b.name} — бренд профессиональной косметики | Астрея`, description: trunc(b.desc),
  breadcrumbs: [['Главная', 'index.html'], ['Бренды', 'brands.html'], [b.name, `brands/${b.id}.html`]]}, P => brandPage(ctx, C, P, b)));

/* ---- товары ---- */
ctx.products.forEach(p => {
  const b = ctx.brandById[p.brand];
  page({key: 'product', path: `products/${p.slug}.html`, nav: '/catalog', ogType: 'website', priority: 0.6, ...(p.image ? {image: p.image} : {}),
    title: (S.norm(p.name).includes(S.norm(b.name)) ? `${p.name} — профессиональное решение | Астрея` : `${p.name} — ${b.name} | Астрея`), description: trunc(`${p.desc} Бренд ${b.name}. Запросите информацию у менеджеров «Астрея».`),
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
  ...(ctx.sales ? [{t: 'page', title: ctx.sales.planner.eyebrow, url: ctx.sales.planner.path, sub: 'Соберите стартовый план закупки и обучения за минуту', q: S.norm([ctx.sales.planner.eyebrow, ctx.sales.planner.title, ctx.sales.planner.lead, 'с чего начать подбор план закупки ассортимент обучение условия старт'].join(' '))}] : []),
  ...ctx.customPages.filter(pg => !pg.noindex).map(pg => ({t: 'page', title: pg.title, url: `pages/${pg.slug}.html`, sub: pg.description || pg.lead || '', q: S.norm([pg.title, pg.description, pg.lead, ...pg.blocks.flatMap(b => [b.title, b.text, ...(b.paragraphs || []), ...(b.left || []), ...(b.right || []), ...(b.items || []).map(i => typeof i === 'string' ? i : [i.title, i.text, i.q, i.a, i.label].join(' '))])].filter(Boolean).join(' '))})),
  ...ctx.news.map(n => ({t: 'news', title: n.title, url: `news/${n.slug}.html`, sub: `${ctx.newsCatById[n.category].name} · ${S.dparts(n.date).full}`, q: S.norm([n.title, n.excerpt, n.body.join(' '), ctx.newsCatById[n.category].name].join(' '))})),
  ...ctx.sortedEvents.map(e => ({t: 'event', title: e.title, url: `training/${e.slug}.html`, sub: `${e.fmt} · ${e.city} · ${S.dparts(e.date).full}`, date: e.date, q: S.norm([e.title, e.description, e.city, e.fmt, e.speaker, brandName(e.brand), 'семинар мероприятие обучение запись'].join(' '))}))
];
const data = {
  site: {name: site.name, contacts: {email: site.contacts.email, phone: site.contacts.phone, phoneRaw: site.contacts.phoneRaw, hours: site.contacts.hours, max: site.contacts.max || '', telegram: site.contacts.telegram || '', vk: site.contacts.vk || '', showEmpty: site.contacts.msgShowEmpty !== false}, formEndpoint: site.formEndpoint || '', discounts: site.discounts},
  forms: Object.fromEntries(Object.entries(ctx.content.forms || {}).filter(([k]) => S.FORM_TYPES[k]).map(([k, v]) => [k, Object.fromEntries(FORM_KEYS.filter(f => v[f] !== undefined && v[f] !== null && v[f] !== '').map(f => [f, v[f]]))])),
  integrations: L.publicIntegrations,                                                     // что нужно браузеру для Метрики, согласия и капчи (data/integrations.json, data/legal.json); секретов здесь нет
  brands: ctx.brands.map(b => ({id: b.id, name: b.name, logo: b.logo || undefined, logoW: b.logoW, logoH: b.logoH, logoScale: b.logoScale, c1: b.c1, c2: b.c2, ink: b.ink})),
  cats: ctx.cats, tasks: ctx.tasks.map(t => ({id: t.id, label: t.label})), kinds: ctx.kinds,
  /* products/events: поля для «Быстрого просмотра», сравнения, обратного отсчёта и помощника (d — описание, c — категория, k — вид, ts — задачи, n — новинка, x — только заполненные характеристики) */
  products: ctx.products.map(p => { const x = {}; if (p.volume) x.volume = p.volume; if (p.sku) x.sku = p.sku; if (p.usage) x.usage = p.usage; if (p.indications && p.indications.length) x.indications = p.indications; if (p.actives && p.actives.length) x.actives = p.actives;
    const ii = p.image ? imageInfo(p.image) : null;      // размеры и прозрачность фото: витрина ставит снимок с прозрачным фоном на подиум как есть, а со сплошным фоном — «вплавляет» умножением
    return {id: p.id, slug: p.slug, name: p.name, brand: p.brand, t: p.type, im: p.image || undefined, iw: ii ? ii.w : undefined, ih: ii ? ii.h : undefined, ia: ii && ii.alpha ? 1 : undefined, d: p.desc, c: p.cat, k: p.kind, ts: p.tasks, n: p.isNew ? 1 : undefined, f: p.featured ? 1 : undefined, x: Object.keys(x).length ? x : undefined}; }),
  events: ctx.sortedEvents.map(e => ({id: e.id, slug: e.slug, title: e.title, date: e.date, city: e.city, tm: e.time, fm: e.fmt, pl: e.place, b: e.brand, sp: e.speaker})),
  index,
  sales: ctx.sales ? Object.assign({}, ctx.sales, {_comment: undefined}) : undefined,                                    // продающий слой «Путь к закупке»: тексты и настройки (data/sales.json) + факты сайта
  guide: C.xon('assistant') && C.xon('navigator') && ctx.stella && ctx.stella.guide ? (ctx.sales ? ctx.stella.guide : Object.assign({}, ctx.stella.guide, {pages: ctx.stella.guide.pages.filter(p => p.id !== 'start')})) : undefined,       // «навигатор» Стеллы: цели подсветки, экскурсии, подсказки (data/stella/guide.json)
  extras: site.redesign && ctx.redesign && ctx.redesign.extras && ctx.redesign.extras.enabled ? {requestList: C.xon('requestList'), quickContact: C.xon('quickContact'), recent: C.xon('recent'), callback: C.xon('callback'), quickView: C.xon('quickView'), gallery: C.xon('gallery'), showroom: C.xon('showroom'), compare: C.xon('compare'), countdown: C.xon('countdown'), subscribe: C.xon('subscribe'), assistant: C.xon('assistant'), navigator: C.xon('assistant') && C.xon('navigator'), sales: !!ctx.sales, agentReady: C.xon('agentReady'), kb: C.xon('assistant') ? 'js/kb.js' + (ctx.assetVersion ? '?v=' + ctx.assetVersion : '') : undefined} : null,
  showroom: C.xon('showroom') ? (() => { const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/showroom', f), 'utf8')); } catch (e) { return {}; } }; return {photos: C.xon('showroomPhotos'), packs: rd('packs.json'), pod: (rd('layers.json') || {}).pod}; })() : undefined      // размеры макетов упаковки и область этикетки (assets/showroom/packs.json)
};
/* «агент-ready» (extras.agentReady): llms.txt и manifest.webmanifest; флаг выключен — файлов нет */
for (const f of ['llms.txt', 'manifest.webmanifest']) if (!C.xon('agentReady')) fs.rmSync(path.join(ROOT, f), {force: true});
if (C.xon('agentReady')) { const af = agentFiles(ctx, L, ctx.kb); fs.writeFileSync(path.join(ROOT, 'llms.txt'), af.llms); fs.writeFileSync(path.join(ROOT, 'manifest.webmanifest'), af.manifest); }
/* база знаний помощника: js/kb.js подгружается браузером при первом открытии чата; нет флага extras.assistant — файла нет */
const KB_FILE = path.join(ROOT, 'js', 'kb.js');
if (C.xon('assistant')) fs.writeFileSync(KB_FILE, `/* Сгенерировано tools/build.js из data/*.json — не редактировать вручную. */\nwindow.ASTREYA_KB = ${JSON.stringify(buildKb(ctx))};\n`); else fs.rmSync(KB_FILE, {force: true});
fs.writeFileSync(path.join(ROOT, 'js', 'data.js'), `/* Сгенерировано tools/build.js из data/*.json — не редактировать вручную. */\nwindow.ASTREYA_DATA = ${JSON.stringify(data)};\n`);

/* ---- sitemap.xml и robots.txt ---- */
const base = L.base;
const urls = pages.filter(p => !p.P.noindex).map(p => `  <url><loc>${L.absUrl(p.path)}</loc><lastmod>${BUILD_DATE}</lastmod><priority>${(p.priority || 0.5).toFixed(1)}</priority></url>`);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /search.html\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${base}sitemap.xml\n`);
/* security.txt (RFC 9116): куда сообщать об уязвимостях; срок действия — конец следующего года (не меняется от сборки к сборке) */
fs.mkdirSync(path.join(ROOT, '.well-known'), {recursive: true});
fs.writeFileSync(path.join(ROOT, '.well-known', 'security.txt'), `Contact: mailto:${site.contacts.email}\nExpires: ${site.year + 1}-12-31T23:59:59.000Z\nPreferred-Languages: ru, en\nCanonical: ${base}.well-known/security.txt\n`);

console.log(`Собрано страниц: ${pages.length} (в sitemap: ${urls.length}); js/data.js: ${(fs.statSync(path.join(ROOT, 'js', 'data.js')).size / 1024).toFixed(1)} КБ`);
module.exports = {pages, ctx};

if (process.argv.some(a => a.startsWith('--bundle='))) require('./bundle.js')({pages: pages.filter(p => p.P.key !== 'notfound'), ctx, layout: L, root: ROOT, out: process.argv.find(a => a.startsWith('--bundle=')).slice(9)});
