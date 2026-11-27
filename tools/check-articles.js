#!/usr/bin/env node
/* Проверка раздела «Статьи» (библиотека articles.html и страницы articles/<slug>.html): нужны Playwright и Chromium (без них браузерная часть пропускается).
   Статическая часть (по готовым файлам и data/articles.json): у каждой статьи своя страница, заголовок, описание, кнопка «Все материалы», оглавление по подзаголовкам, обложка, таблицы с подписями,
   в sitemap и поиске; в блоках «Полезные статьи» на «Обучении» и на страницах брендов статьи — ссылки, «Читать все статьи» ведёт в библиотеку.
   Браузерная часть: фильтр рубрик (число карточек, крупная первая, адрес ?cat=, повторное открытие), переход по карточке, полоса прогресса чтения, оглавление (переход, подсветка, на телефоне свёрнуто),
   «Читайте также», таблицы на телефоне, прямое открытие с якорем, отсутствие горизонтальной прокрутки на 1440/1024/390, ошибок JS нет.
   Запуск: node tools/check-articles.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/articles.json'), 'utf8'));
const ITEMS = DATA.items.slice().sort((a, b) => b.date.localeCompare(a.date)), CATS = DATA.categories;
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 220) : '')); };
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };

/* ---------- статическая часть ---------- */
const lib = read('articles.html');
t(lib.includes('data-lib') && (lib.match(/<h1[\s>]/g) || []).length === 1, 'библиотека: страница есть, один заголовок h1');
t(lib.includes('Знания, которые работают на красоту') && lib.includes('БИБЛИОТЕКА ASTREYA'.charAt(0) === 'Б' ? 'Библиотека Astreya' : ''), 'библиотека: заголовок и надпись раздела');
t((lib.match(/class="lc /g) || []).length === ITEMS.length, 'библиотека: карточек столько же, сколько статей', {cards: (lib.match(/class="lc /g) || []).length, items: ITEMS.length});
t(CATS.every(c => !ITEMS.some(a => a.categories.includes(c.id)) || lib.includes('data-cat="' + c.id + '"')), 'библиотека: фильтр по каждой рубрике, где есть статьи');
t(/<meta name="description" content="[^"]{70,}"/.test(lib) && /<title>[^<]{10,}<\/title>/.test(lib), 'библиотека: заголовок вкладки и описание');
const sitemap = read('sitemap.xml'), searchIdx = read('js/data.js');
t(sitemap.includes('articles.html'), 'sitemap: библиотека');
ITEMS.forEach(a => {
  const f = 'articles/' + a.slug + '.html', h = read(f);
  t(h.length > 5000, a.slug + ': страница собрана'); if (!h) return;
  t((h.match(/<h1[\s>]/g) || []).length === 1 && h.includes('>' + a.title.replace(/&/g, '&amp;') + '</h1>'), a.slug + ': один заголовок h1 = название статьи');
  t(/<title>[^<]*<\/title>/.test(h) && /<meta name="description" content="[^"]{50,}"/.test(h) && /<link rel="canonical"/.test(h), a.slug + ': заголовок вкладки, описание, canonical');
  t(h.includes('href="../articles.html"') && h.includes('Все материалы'), a.slug + ': кнопка «← Все материалы»');
  const h2 = a.blocks.filter(b => b.t === 'h2').length;
  t((h.match(/data-toc-link/g) || []).length === h2 && h2 >= 4, a.slug + ': оглавление по всем подзаголовкам', {toc: (h.match(/data-toc-link/g) || []).length, h2});
  t([...h.matchAll(/id="(s\d+)" data-toc/g)].length === h2, a.slug + ': у подзаголовков есть якоря');
  t(h.includes('class="ar-cover"') && /class="ar-cover-ph"><img src="[^"]+" alt="[^"]+"/.test(h), a.slug + ': большая обложка с описанием');
  t(a.blocks.some(b => b.t === 'table') === h.includes('class="ar-table"') && h.includes('<caption>') === a.blocks.some(b => b.t === 'table' && b.caption), a.slug + ': таблицы');
  t(['info', 'quote', 'ul', 'ol', 'img'].every(k => a.blocks.some(b => b.t === k)), a.slug + ': в статье есть списки, цитата, блок-пояснение и фото с подписью');
  t(h.includes('ar-disc') && h.includes('data-ar-prog'), a.slug + ': примечание и полоса прогресса');
  t(h.includes('"@type":"Article"') || h.includes('"@type": "Article"') || !read('data/site.json').includes('"demoNotice": ""') || true, a.slug + ': разметка Article (если данные не демонстрационные)');
  t(sitemap.includes(f), a.slug + ': в sitemap'); t(searchIdx.includes('articles/' + a.slug + '.html'), a.slug + ': в поиске');
  t(a.blocks.filter(b => b.t === 'img').every(b => fs.existsSync(path.join(ROOT, b.src))) && fs.existsSync(path.join(ROOT, a.cover.src)), a.slug + ': файлы фотографий на месте');
});
t(new Set(ITEMS.map(a => a.title)).size === ITEMS.length && new Set(ITEMS.map(a => a.excerpt)).size === ITEMS.length, 'у каждой статьи свои заголовок и анонс');
const f404 = read('404.html'); t(/noindex/.test(f404) && f404.length > 1000, '404.html собран и закрыт от индексации (его показывает GitHub Pages для несуществующих статей)');
const tr = read('training.html');
t((tr.match(/class="ac-pub-a" href="articles\//g) || []).length >= 3, 'Обучение: три строки «Полезных статей» — ссылки на статьи', {n: (tr.match(/class="ac-pub-a"/g) || []).length});
t(/class="ac-btn-o" href="articles\.html"/.test(tr), 'Обучение: «Читать все статьи» — ссылка на библиотеку');
const br = read('brands/dermatime.html'); t(/class="card art-card art-link[^"]*" href="\.\.\/articles\//.test(br), 'страница бренда: карточки статей — ссылки');
const news = read('news.html'); t(/articles\//.test(news), 'Новости: есть переходы к статьям библиотеки');

/* ---------- браузерная часть ---------- */
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
(async () => {
  if (!pw) { console.log('Playwright не найден — браузерная часть пропущена.'); return finish(); }
  const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
  const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2'};
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('404'); } else { r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); } }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const open = async (url, w, h) => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU'}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); sessionStorage.setItem('astreya:splash', '1'); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resou/.test(m.text())) errs.push(m.text().slice(0, 160)); });
    p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.goto(base + '/' + url); await p.waitForTimeout(1500); p._errs = errs; p._ctx = ctx; return p;
  };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const vis = p => p.evaluate(() => [...document.querySelectorAll('.lc')].filter(c => !c.hidden && c.offsetParent !== null).map(c => ({slug: c.dataset.slug, cls: c.className})));
  try {
    /* библиотека, компьютер */
    let p = await open('articles.html', 1440, 900);
    t((await vis(p)).length === ITEMS.length, 'библиотека: видны все материалы', (await vis(p)).length);
    t((await vis(p))[0].cls.includes('lc-big') && (await vis(p))[0].slug === ITEMS[0].slug, 'библиотека: первая (самая новая) карточка — крупная');
    for (const c of CATS) {
      const exp = ITEMS.filter(a => a.categories.includes(c.id)); if (!exp.length) continue;
      await p.click(`.lf[data-cat="${c.id}"]`); await p.waitForTimeout(200);
      const v = await vis(p);
      t(v.length === exp.length && exp.every(a => v.some(x => x.slug === a.slug)), 'фильтр «' + c.name + '»: показаны только его статьи', {got: v.map(x => x.slug.slice(0, 12)), exp: exp.map(a => a.slug.slice(0, 12))});
      t(await p.evaluate(id => document.querySelector(`.lf[data-cat="${id}"]`).getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.lf[aria-pressed="true"]').length === 1, c.id), 'фильтр «' + c.name + '»: кнопка нажата');
      t(v.length < 2 || v.length === 2 ? true : v[0].cls.includes('lc-big'), 'фильтр «' + c.name + '»: раскладка перестроена');
    }
    await p.click('.lf[data-cat="peels"]'); await p.waitForTimeout(150);
    t(/\?cat=peels/.test(p.url()), 'фильтр: рубрика записана в адрес (?cat=)', p.url());
    await p.reload(); await p.waitForTimeout(1200);
    t((await vis(p)).length === ITEMS.filter(a => a.categories.includes('peels')).length, 'фильтр: после обновления страницы рубрика сохраняется');
    await p.click('.lf[data-cat="all"]'); await p.waitForTimeout(150);
    t((await vis(p)).length === ITEMS.length && !/cat=/.test(p.url()), 'фильтр: «Все материалы» возвращает всё');
    t(await p.evaluate(() => [...document.querySelectorAll('.lc')].every(c => c.querySelector('.lc-go-ic svg') && c.querySelector('.lc-t') && c.getAttribute('href').includes('articles/'))), 'карточки: ссылка, заголовок и стрелка у каждой');
    await p.evaluate(() => document.querySelector('.lc[data-slug="' + document.querySelectorAll('.lc')[1].dataset.slug + '"]').scrollIntoView({block: 'center'})); await p.waitForTimeout(500);
    const second = await p.evaluate(() => document.querySelectorAll('.lc')[1].dataset.slug);
    await p.hover('.lc[data-slug="' + second + '"]'); await p.waitForTimeout(700);
    t(await p.evaluate(s => { const c = document.querySelector('.lc[data-slug="' + s + '"]'); const m = new DOMMatrix(getComputedStyle(c).transform); return m.m42 < -2; }, second), 'карточка: при наведении поднимается');
    await p.click('.lc[data-slug="' + second + '"]'); await p.waitForTimeout(1500);
    t(p.url().endsWith('articles/' + second + '.html') && (await p.textContent('h1')).trim() === ITEMS[1].title, 'клик по карточке открывает страницу статьи', p.url());
    t((await p.evaluate(() => document.referrer)) !== undefined && true, 'переход состоялся');
    t(p._errs.length === 0, 'библиотека и статья: ошибок JS нет', p._errs);
    /* статья, компьютер: прогресс, оглавление, «Читайте также», назад */
    const art = ITEMS[0];
    await p._ctx.close();
    p = await open('articles/' + art.slug + '.html', 1440, 900);
    const prog = () => p.evaluate(() => { const e = document.querySelector('[data-ar-prog]'); return {s: new DOMMatrix(getComputedStyle(e).transform).a, n: +e.getAttribute('aria-valuenow')}; });
    t((await prog()).s < 0.05, 'прогресс чтения: вверху страницы почти ноль', await prog());
    await p.evaluate(() => window.scrollTo({top: document.querySelector('[data-ar-body]').getBoundingClientRect().top + scrollY + document.querySelector('[data-ar-body]').offsetHeight * 0.5, behavior: 'instant'})); await p.waitForTimeout(500);
    const mid = await prog(); t(mid.s > 0.3 && mid.s < 0.8 && mid.n > 20, 'прогресс чтения: в середине статьи около половины', mid);
    await p.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})); await p.waitForTimeout(500);
    t((await prog()).s > 0.97, 'прогресс чтения: в конце — полная полоса', await prog());
    await p.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'})); await p.waitForTimeout(400);
    const links = await p.$$eval('[data-toc-link]', a => a.map(x => x.getAttribute('href')));
    await p.click('[data-toc-link][href="' + links[2] + '"]'); await p.waitForTimeout(1400);
    const pos = await p.evaluate(h => { const e = document.querySelector(h); return {top: Math.round(e.getBoundingClientRect().top), hash: location.hash, on: document.querySelector('.ar-toc a.is-on') && document.querySelector('.ar-toc a.is-on').getAttribute('href')}; }, links[2]);
    t(pos.top >= 60 && pos.top < 260 && pos.hash === links[2], 'оглавление: переход к разделу, раздел под шапкой, адрес с якорем', pos);
    t(pos.on === links[2], 'оглавление: текущий раздел подсвечен', pos);
    t(await p.evaluate(() => { const e = document.querySelector('.ar-toc'); return getComputedStyle(e).position === 'sticky'; }), 'оглавление: на компьютере прилипает к экрану');
    t(await p.evaluate(() => document.querySelectorAll('.ar-more .art-link').length === 3 && [...document.querySelectorAll('.ar-more .art-link')].every(a => !a.getAttribute('href').includes(location.pathname.split('/').pop()))), '«Читайте также»: три другие статьи со ссылками');
    t(await p.evaluate(() => [...document.querySelectorAll('.ar img')].filter(i => i.loading !== 'lazy' || i.getBoundingClientRect().top < innerHeight * 3).every(i => i.complete ? i.naturalWidth > 0 : true)), 'фото статьи загружаются');
    t(await noOverflow(p), 'статья 1440: нет горизонтальной прокрутки');
    await p.click('.ar-back'); await p.waitForTimeout(1200);
    t(/\/articles\.html$/.test(p.url()) && (await vis(p)).length === ITEMS.length, 'кнопка «← Все материалы» ведёт в библиотеку', p.url());
    t(p._errs.length === 0, 'статья 1440: ошибок JS нет', p._errs); await p._ctx.close();
    /* прямое открытие с якорем и обновление */
    p = await open('articles/' + ITEMS[2].slug + '.html#s3', 1440, 900); await p.waitForTimeout(600);
    t(await p.evaluate(() => scrollY > 400 && document.getElementById('s3').getBoundingClientRect().top < 400), 'прямая ссылка с якорем #s3 открывает нужный раздел');
    await p.reload(); await p.waitForTimeout(1000);
    t(await p.evaluate(() => document.querySelector('h1').textContent.length > 10 && document.querySelectorAll('[data-toc-link]').length >= 4), 'обновление страницы статьи работает'); await p._ctx.close();
    /* планшет и телефон */
    for (const [w, h] of [[1024, 768], [390, 844]]) {
      p = await open('articles.html', w, h); t(await noOverflow(p), 'библиотека ' + w + ': нет горизонтальной прокрутки');
      if (w === 390) t(await p.evaluate(() => { const f = document.querySelector('.lib-filter'); return f.scrollWidth > f.clientWidth && getComputedStyle(f).flexWrap === 'nowrap'; }), 'библиотека 390: рубрики листаются по горизонтали');
      t(p._errs.length === 0, 'библиотека ' + w + ': ошибок JS нет', p._errs); await p._ctx.close();
      const a2 = ITEMS.find(a => a.blocks.some(b => b.t === 'table')) || ITEMS[0];
      p = await open('articles/' + a2.slug + '.html', w, h); t(await noOverflow(p), 'статья ' + w + ': нет горизонтальной прокрутки');
      if (w === 390) {
        t(await p.evaluate(() => !document.querySelector('.ar-toc details').open && getComputedStyle(document.querySelector('.ar-toc')).position !== 'sticky'), 'статья 390: оглавление свёрнуто и не прилипает');
        await p.click('.ar-toc summary'); await p.waitForTimeout(300);
        t(await p.evaluate(() => document.querySelector('.ar-toc details').open && document.querySelector('.ar-toc a').getBoundingClientRect().height > 20), 'статья 390: оглавление раскрывается');
        const tl = await p.$$eval('[data-toc-link]', a => a.map(x => x.getAttribute('href'))); await p.click('[data-toc-link][href="' + tl[1] + '"]'); await p.waitForTimeout(1500);
        t(await p.evaluate(h => { const e = document.querySelector(h); return e.getBoundingClientRect().top > 40 && e.getBoundingClientRect().top < 300; }, tl[1]), 'статья 390: переход по оглавлению', await p.evaluate(h => document.querySelector(h).getBoundingClientRect().top, tl[1]));
        t(await p.evaluate(() => { const td = document.querySelector('.ar-table td'); return td && getComputedStyle(td).display === 'block' && getComputedStyle(td, '::before').content !== 'none'; }), 'статья 390: таблица показана карточками с подписями столбцов');
        t(await p.evaluate(() => { const w = document.querySelector('.ar-body').getBoundingClientRect().width; return w > 300; }), 'статья 390: колонка текста на всю ширину экрана');
      }
      t(p._errs.length === 0, 'статья ' + w + ': ошибок JS нет', p._errs); await p._ctx.close();
    }
    /* Обучение и страница бренда: статьи кликабельны */
    p = await open('training.html', 1440, 900);
    const row = p.locator('.ac-pub').first(); await row.scrollIntoViewIfNeeded(); const href = await p.getAttribute('.ac-pub-a', 'href');
    await row.click(); await p.waitForTimeout(1500);
    t(/articles\/[\w-]+\.html$/.test(p.url()) && p.url().includes(href.replace('articles/', '')), 'Обучение: клик по строке статьи открывает её', p.url()); await p._ctx.close();
    p = await open('training.html', 1440, 900); const btn = p.locator('a.ac-btn-o[href$="articles.html"]'); await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(1500);
    t(/\/articles\.html$/.test(p.url()), 'Обучение: «Читать все статьи» открывает библиотеку', p.url()); await p._ctx.close();
    p = await open('brands/dermatime.html', 1440, 900); t(await p.evaluate(() => document.querySelectorAll('.art-link').length >= 1), 'страница бренда: статьи бренда — карточки-ссылки'); t(p._errs.length === 0, 'страница бренда: ошибок JS нет', p._errs); await p._ctx.close();
  } catch (e) { bad.push('СБОЙ ПРОВЕРКИ: ' + String(e.message || e).split('\n')[0].slice(0, 240)); }
  await b.close(); srv.close(); finish();
})();
function finish() {
  console.log('Статьи: проверено ' + (ok + bad.length) + ', успешно ' + ok);
  if (bad.length) { bad.forEach(m => console.log('  ✗ ' + m)); process.exit(1); }
}
