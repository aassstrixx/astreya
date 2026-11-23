const S = require('../../js/shared.js');
const {esc, I} = S;
const LEG = require('../legal.js');
const {T} = require('../texts.js');

/* Служебные страницы в формате v2 (docs/PAGES-V2-BRIEF.md): поиск — «картотека» на стене ниш, документы — спокойная «читальня» с навигатором, 404 — три пустые арки и Стелла с лучом света.
   Стили — css/pg-search.css, css/pg-legal.css (общий для privacy / terms / consent), css/pg-404.css; поведение — js/pg-search.js, js/pg-legal.js, js/pg-404.js.
   Данные, тексты документов и логика поиска прежние: результаты строит js/pages.js (A.pages.search) по индексу из js/data.js, документы собирает src/legal.js. */

const img = (C, P, f, w, h, cls, extra) => `<img class="${cls}" src="${esc(C.u(P, f))}" width="${w}" height="${h}" alt="" decoding="async"${extra || ''}>`;

/* Страница поиска */
function searchPage(ctx, C, P) {
  return `<div class="qx-page" data-search>
    <section class="qx-scene" aria-labelledby="qx-h">
      <div class="qx-bg" aria-hidden="true"><picture><source media="(max-width:700px)" srcset="${esc(C.u(P, 'assets/utility/wall-s.webp'))}">${img(C, P, 'assets/utility/wall.webp', 3072, 1390, 'qx-bg-img')}</picture><i class="qx-wash"></i><i class="qx-fade"></i></div>
      <div class="qx-in">
        <span class="qx-eyebrow">${T('search.scene.eyebrow')}</span>
        <h1 id="qx-h">${T('search.scene.h1')}</h1>
        <p class="qx-lead">${T('search.scene.lead')}</p>
        <form class="search-page qx-form" role="search" action="${C.u(P, 'search.html')}" method="get">
          <label class="search"><span class="sr">${T('search.scene.t')}</span>${I.search}<input id="sp-q" type="search" name="q" placeholder="${T('search.scene.a')}" autocomplete="off" enterkeyhint="search"></label>
          <button class="btn btn-fill" type="submit">${T('search.scene.btn')}</button>
        </form>
        <div class="srch-hints qx-hints"><span>${T('search.scene.t2')}</span>${ctx.content.searchHints.map(h => `<a class="chip" href="${C.u(P, 'search.html')}?q=${encodeURIComponent(h)}">${esc(h)}</a>`).join('')}</div>
      </div>
    </section>
    <section class="qx-res">
      <div class="qx-res-in">
        <div class="s-tabs" id="s-tabs" role="group" aria-label="${T('search.scene.aria')}" hidden></div>
        <div id="s-out" aria-live="polite"><p class="muted">${T('search.scene.p')}</p></div>
      </div>
    </section>
  </div>`;
}

/* Юридические страницы: полный документ из src/legal.js, когда заполнены реквизиты оператора; до того — заглушка без выдуманных сведений */
function legalPage(ctx, C, P, kind) {
  const l = ctx.content.legal[kind], op = LEG.operator(ctx), body = op.ready ? LEG[kind](ctx) : '';
  const ver = (ctx.legal || {}).version ? LEG.dateRu(ctx.legal.version) : '';
  const docs = [['privacy', T('legal.head.s')], ['consent', T('legal.head.s2')], ['terms', T('legal.head.s3')]].filter(d => ctx.content.legal[d[0]]).map(d => [ctx.content.legal[d[0]].h1 || d[1], `${d[0]}.html`, d[0] === kind]);
  return `<div class="lg-page" data-legal="${esc(kind)}">
    <div class="lg-band" aria-hidden="true">${img(C, P, 'assets/utility/wall-s.webp', 1800, 814, 'lg-band-img')}<i class="lg-band-fade"></i></div>
    <div class="lg-in">
      ${C.crumbs(P, [[T('legal.head.s4'), 'index.html'], [l.h1, `${kind}.html`]])}
      <header class="lg-head"><span class="eyebrow reveal">${T('legal.side.eyebrow')}</span><h1 class="reveal">${esc(l.h1)}</h1>${body && ver ? `<p class="lg-ver reveal"><span>${T('legal.side.t')}</span> <time>${esc(ver)}</time></p>` : ''}</header>
      <div class="lg-cols">
        <aside class="lg-side" aria-label="${T('legal.side.aria')}">
          <nav class="lg-toc" data-lg-toc hidden aria-label="${T('legal.side.aria2')}"><b>${T('legal.side.b')}</b><ol></ol></nav>
          <nav class="lg-docs" aria-label="${T('legal.side.aria3')}"><b>${T('legal.side.eyebrow')}</b><ul>${docs.map(([t, h, on]) => `<li><a href="${C.u(P, h)}"${on ? ' aria-current="page"' : ''}>${esc(t)}</a></li>`).join('')}</ul></nav>
        </aside>
        <div class="lg-main">
          ${body ? `<div class="legal-body lg-body reveal" data-lg-body>${body}</div>` : `<div class="notice reveal">${I.info}<span>${T('legal.side.t2')}</span></div>
          <p class="lead reveal" style="margin-top:24px">${esc(l.text)}</p>`}
          <div class="row lg-foot reveal"><a class="btn btn-ghost" href="${C.u(P, 'contacts.html')}">${T('legal.side.a')} ${I.arrow}</a><a class="btn btn-lnk" href="${C.u(P, 'index.html')}">${T('legal.side.a2')}</a><a class="lg-top" href="#main" data-lg-top>${T('legal.side.a3')} ${I.arrow}</a></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* Страница 404. GitHub Pages отдаёт её на любой неверный адрес, на любой глубине (/a/b/c), поэтому все пути в ней — от корня сайта (P.root), а не «../» */
function notFoundPage(ctx, C, P) {
  const go = [[T('notfound.hints.s'), 'catalog.html', T('notfound.hints.s2')], [T('notfound.hints.s3'), 'brands.html', T('notfound.hints.s4')], [T('notfound.hints.s5'), 'training.html', T('notfound.hints.s6')], [T('search.scene.eyebrow'), 'search.html', T('notfound.hints.s8')]];
  return `<div class="nf-page" data-nf>
    <section class="nf-scene" aria-labelledby="nf-h">
      <div class="nf-bg" aria-hidden="true"><picture><source media="(max-width:700px)" srcset="${esc(C.u(P, 'assets/utility/arches-m.webp'))}">${img(C, P, 'assets/utility/arches.webp', 1920, 1080, 'nf-bg-img')}</picture><i class="nf-wash"></i><i class="nf-fade"></i></div>
      <div class="nf-in">
        <span class="nf-eyebrow">${T('notfound.scene.eyebrow')}</span>
        <p class="nf-num" aria-hidden="true">404</p>
        <h1 id="nf-h">${T('notfound.scene.h1')}</h1>
        <p class="nf-lead">${T('notfound.scene.lead')}</p>
        <div class="nf-orb" data-nf-orb aria-hidden="true"></div>
        <form class="search-page nf-form" role="search" action="${C.u(P, 'search.html')}" method="get">
          <label class="search"><span class="sr">${T('search.scene.t')}</span>${I.search}<input type="search" name="q" placeholder="${T('search.scene.a')}" autocomplete="off" enterkeyhint="search"></label>
          <button class="btn btn-fill" type="submit">${T('search.scene.btn')}</button>
        </form>
        <div class="srch-hints nf-hints"><span>${T('search.scene.t2')}</span>${ctx.content.searchHints.map(h => `<a class="chip" href="${C.u(P, 'search.html')}?q=${encodeURIComponent(h)}">${esc(h)}</a>`).join('')}</div>
      </div>
    </section>
    <section class="nf-go" aria-label="${T('notfound.scene.aria')}">
      <ul class="nf-go-l">${go.map(([t, h, s], i) => `<li><a href="${C.u(P, h)}"><span class="nf-go-n">${String(i + 1).padStart(2, '0')}</span><b>${esc(t)}</b><small>${esc(s)}</small>${I.arrow}</a></li>`).join('')}</ul>
      <a class="btn btn-fill nf-home" href="${C.u(P, 'index.html')}">${T('legal.side.a2')} ${I.arrow}</a>
    </section>
  </div>`;
}

module.exports = {searchPage, legalPage, notFoundPage};
