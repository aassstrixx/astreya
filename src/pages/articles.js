/* Библиотека статей «Astreya»: страница-библиотека articles.html и страницы статей articles/<slug>.html.
   Содержание — data/articles.json (рубрики, статьи с блоками p / h2 / h3 / ul / ol / quote / info / warn / table / img); тексты самих страниц — реестр «Тексты страниц» (src/texts/articles.js).
   Библиотека: фильтр по рубрикам (js/pg-articles.js; без JS видны все материалы), первая карточка крупная, остальные компактные; карточка целиком — ссылка.
   Статья: кнопка «← Все материалы», рубрика, дата, время чтения, заголовок, вводный абзац, обложка, колонка текста, оглавление (на телефоне сворачивается), полоса прогресса чтения, «Читайте также».
   Свои стили и скрипты — css/pg-articles.css, js/pg-articles.js (redesign.json → pageAssets: library, material). */
const S = require('../../js/shared.js');
const {T} = require('../texts.js');
const {esc, I, dparts} = S;

/* **жирное** в тексте блоков → <strong>; всё остальное экранируется */
const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const NOTE_ICON = {info: I.info, warn: I.alert};

/* статья → разметка блоков + оглавление (h2 получают якоря s1, s2 …) */
function renderBlocks(a, u) {
  const toc = []; let n = 0, fig = 0;
  const html = a.blocks.map(b => {
    switch (b.t) {
      case 'h2': { n++; toc.push({id: 's' + n, text: b.text}); return `<h2 id="s${n}" data-toc>${inline(b.text)}</h2>`; }
      case 'h3': return `<h3>${inline(b.text)}</h3>`;
      case 'p': return `<p>${inline(b.text)}</p>`;
      case 'ul': return `<ul class="ar-list">${b.items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`;
      case 'ol': return `<ol class="ar-list ar-ol">${b.items.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`;
      case 'quote': return `<blockquote class="ar-quote"><p>${inline(b.text)}</p>${b.by ? `<footer>${esc(b.by)}</footer>` : ''}</blockquote>`;
      case 'info': case 'warn': return `<aside class="ar-note ar-note-${b.t}" role="note"><i class="ar-note-ic" aria-hidden="true">${NOTE_ICON[b.t]}</i><div>${b.title ? `<b>${esc(b.title)}</b>` : ''}<p>${inline(b.text)}</p></div></aside>`;
      case 'table': return `<div class="ar-table" role="region" tabindex="0" aria-label="${esc(b.caption || T('material.body.table'))}"><table>${b.caption ? `<caption>${esc(b.caption)}</caption>` : ''}<thead><tr>${b.head.map(h => `<th scope="col">${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${inline(c)}</th>` : `<td data-l="${esc(b.head[i] || '')}">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${b.note ? `<p class="ar-table-note">${inline(b.note)}</p>` : ''}</div>`;
      case 'img': { fig++; return `<figure class="ar-fig reveal"><div class="ar-fig-ph"><img src="${esc(u(b.src))}" alt="${esc(b.alt || '')}" loading="lazy" decoding="async" width="${b.w || 960}" height="${b.h || 600}"${b.pos ? ` style="object-position:${esc(b.pos)}"` : ''}></div>${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ''}</figure>`; }
      default: return '';
    }
  }).join('\n');
  return {html, toc};
}

/* общий CTA-панель (тёмная лента сайта): «Хотите разобрать тему на практике?» */
const cta = (C, P) => C.ctaBand(P, 'articles-cta', {
  eyebrow: T('material.cta.eyebrow'), title: T('material.cta.title'), text: T('material.cta.text'),
  primary: {href: 'training.html', label: T('material.cta.a')}, secondary: {href: 'partners.html', label: T('material.cta.b')}, vars: {}
});

/* раскладка карточек по числу видимых материалов (тот же расчёт — js/pg-articles.js при фильтрации): lc-big — крупная (8 колонок, две строки), lc-s — малая (4), lc-h — половина (6), lc-f — во всю ширину */
function sizes(n) {
  const out = []; let r = n;
  while (r > 0) {
    if (r >= 5) { out.push('lc-big', 'lc-s', 'lc-s', 'lc-h', 'lc-h'); r -= 5; }
    else if (r === 4) { out.push('lc-big', 'lc-s', 'lc-s', 'lc-f'); r = 0; }
    else if (r === 3) { out.push('lc-big', 'lc-s', 'lc-s'); r = 0; }
    else if (r === 2) { out.push('lc-h', 'lc-h'); r = 0; }
    else { out.push('lc-f'); r = 0; }
  }
  return out;
}

/* карточка библиотеки: обложка-фото, рубрики, название, анонс, дата, время чтения, стрелка */
function libCard(C, P, a, cls, first) {
  const u = h => C.u(P, h), cover = a.cover || {};
  return `<a class="lc ${cls} reveal" href="${u('articles/' + a.slug + '.html')}" data-cats="${esc(a.cats.join(' '))}" data-slug="${esc(a.slug)}" data-track="article_click" data-place="library">
    <span class="lc-ph">${cover.src ? `<img src="${esc(u(cover.src))}" alt="" loading="${first ? 'eager' : 'lazy'}" decoding="async" width="960" height="600"${cover.pos ? ` style="object-position:${esc(cover.pos)}"` : ''}>` : ''}<i class="lc-shade" aria-hidden="true"></i><span class="lc-cat">${esc(a.tag)}</span></span>
    <span class="lc-body">
      <span class="lc-meta"><time datetime="${a.date}">${dparts(a.date).full}</time><i aria-hidden="true"></i><span>${T('common.pages.minRead', {min: a.min})}</span></span>
      <h2 class="lc-t">${esc(a.title)}</h2>
      <span class="lc-ex">${esc(a.excerpt)}</span>
      <span class="lc-go" aria-hidden="true"><span class="lc-go-t">${T('library.card.read')}</span><i class="lc-go-ic">${I.arrow}</i></span>
    </span>
  </a>`;
}

function libraryPage(ctx, C, P) {
  const u = h => C.u(P, h), list = ctx.articles, cats = ctx.articleCats;
  const count = id => list.filter(a => a.cats.includes(id)).length;
  const chips = [`<button class="lf" type="button" data-cat="all" aria-pressed="true"><span>${T('library.filter.all')}</span><em>${list.length}</em></button>`]
    .concat(cats.filter(c => count(c.id)).map(c => `<button class="lf" type="button" data-cat="${esc(c.id)}" aria-pressed="false"><span>${esc(c.name)}</span><em>${count(c.id)}</em></button>`)).join('');
  return `<div class="lib" data-lib>
  <section class="lib-hero" aria-labelledby="lib-h1">
    <div class="wrap">
      ${C.crumbs(P, [[T('material.crumbs.home'), 'index.html'], [T('material.crumbs.lib'), 'articles.html']])}
      <span class="eyebrow reveal">${T('library.hero.eyebrow')}</span>
      <h1 id="lib-h1" class="reveal">${T('library.hero.h1')}</h1>
      <p class="lib-lead reveal">${T('library.hero.lead')}</p>
    </div>
  </section>
  <section class="lib-main" aria-label="${T('library.filter.aria')}">
    <div class="wrap">
      <div class="lib-filter reveal" role="group" aria-label="${T('library.filter.aria')}">${chips}</div>
      <p class="lib-status" data-lib-status aria-live="polite" hidden></p>
      <div class="lib-grid" data-lib-grid>${(sz => list.map((a, i) => libCard(C, P, a, sz[i], i === 0)).join(''))(sizes(list.length))}</div>
      <p class="lib-empty" data-lib-empty hidden>${T('library.filter.empty')}</p>
    </div>
  </section>
  ${cta(C, P)}
</div>`;
}

function materialPage(ctx, C, P, a) {
  const u = h => C.u(P, h), cover = a.cover || {};
  const {html, toc} = renderBlocks(a, u);
  const same = ctx.articles.filter(x => x.slug !== a.slug)
    .map(x => [(a.related || []).includes(x.slug) ? 10 : 0 + x.cats.filter(c => a.cats.includes(c)).length * 2 + (x.brand === a.brand ? 1 : 0), x]).sort((p, q) => q[0] - p[0] || q[1].date.localeCompare(p[1].date)).map(x => x[1]);
  const more = same.slice(0, 3);
  const cats = a.cats.map(c => ctx.articleCatById[c].name);
  return `<div class="ar" data-ar>
  <i class="ar-prog" data-ar-prog role="progressbar" aria-label="${T('material.body.progress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></i>
  <header class="ar-head">
    <div class="wrap-n">
      <a class="ar-back" href="${u('articles.html')}" data-track="article_back">${I.back}<span>${T('material.head.back')}</span></a>
      <div class="ar-meta">
        <span class="ar-cat">${esc(cats[0])}</span>
        <time datetime="${a.date}">${dparts(a.date).full}</time><i aria-hidden="true"></i>
        <span>${T('common.pages.minRead', {min: a.min})}</span>
      </div>
      <h1>${esc(a.title)}</h1>
      ${a.intro ? `<p class="ar-intro">${esc(a.intro)}</p>` : ''}
    </div>
  </header>
  ${cover.src ? `<figure class="ar-cover"><div class="wrap-c"><div class="ar-cover-ph"><img src="${esc(u(cover.src))}" alt="${esc(cover.alt || '')}" width="1600" height="900" fetchpriority="high" decoding="async"${cover.pos ? ` style="object-position:${esc(cover.pos)}"` : ''}></div>${cover.caption ? `<figcaption>${esc(cover.caption)}</figcaption>` : ''}</div></figure>` : ''}
  <div class="ar-layout">
    <aside class="ar-toc" data-ar-toc aria-label="${T('material.toc.aria')}">
      <details class="ar-toc-d" open>
        <summary><span>${T('material.toc.t')}</span><i aria-hidden="true">${I.chevron}</i></summary>
        <ol>${toc.map(t => `<li><a href="#${t.id}" data-toc-link>${esc(t.text)}</a></li>`).join('')}</ol>
      </details>
    </aside>
    <article class="ar-body" data-ar-body>
      ${html}
      <aside class="ar-disc" role="note"><i aria-hidden="true">${I.info}</i><p><b>${T('material.disc.t')}</b> ${T('material.disc.s')}</p></aside>
      <nav class="ar-end" aria-label="${T('material.head.back')}"><a class="lnk" href="${u('articles.html')}">${I.back} ${T('material.head.back')}</a></nav>
    </article>
  </div>
  ${more.length ? `<section class="ar-more" aria-labelledby="ar-more-h">
    <div class="wrap">
      <div class="sec-head"><div><span class="eyebrow">${T('material.more.eyebrow')}</span><h2 id="ar-more-h">${T('material.more.title')}</h2></div>${C.lnk(u('articles.html'), T('material.more.all'))}</div>
      <div class="grid g3">${more.map(x => C.articleCard(x, P)).join('')}</div>
    </div>
  </section>` : ''}
  ${cta(C, P)}
</div>`;
}

module.exports = {libraryPage, materialPage};
