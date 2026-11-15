const S = require('../../js/shared.js');
const {esc, I} = S;
const LEG = require('../legal.js');

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
        <span class="qx-eyebrow">Поиск</span>
        <h1 id="qx-h">Поиск по сайту</h1>
        <p class="qx-lead">Товары, бренды, новости и обучение.</p>
        <form class="search-page qx-form" role="search" action="${C.u(P, 'search.html')}" method="get">
          <label class="search"><span class="sr">Запрос</span>${I.search}<input id="sp-q" type="search" name="q" placeholder="Например: Heliocare, пилинг, семинар" autocomplete="off" enterkeyhint="search"></label>
          <button class="btn btn-fill" type="submit">Найти</button>
        </form>
        <div class="srch-hints qx-hints"><span>Популярное:</span>${ctx.content.searchHints.map(h => `<a class="chip" href="${C.u(P, 'search.html')}?q=${encodeURIComponent(h)}">${esc(h)}</a>`).join('')}</div>
      </div>
    </section>
    <section class="qx-res">
      <div class="qx-res-in">
        <div class="s-tabs" id="s-tabs" role="group" aria-label="Тип результатов" hidden></div>
        <div id="s-out" aria-live="polite"><p class="muted">Введите запрос, чтобы найти товары, бренды, новости и мероприятия.</p></div>
      </div>
    </section>
  </div>`;
}

/* Юридические страницы: полный документ из src/legal.js, когда заполнены реквизиты оператора; до того — заглушка без выдуманных сведений */
function legalPage(ctx, C, P, kind) {
  const l = ctx.content.legal[kind], op = LEG.operator(ctx), body = op.ready ? LEG[kind](ctx) : '';
  const ver = (ctx.legal || {}).version ? LEG.dateRu(ctx.legal.version) : '';
  const docs = [['privacy', 'Политика конфиденциальности'], ['consent', 'Согласие на обработку данных'], ['terms', 'Условия использования']].filter(d => ctx.content.legal[d[0]]).map(d => [ctx.content.legal[d[0]].h1 || d[1], `${d[0]}.html`, d[0] === kind]);
  return `<div class="lg-page" data-legal="${esc(kind)}">
    <div class="lg-band" aria-hidden="true">${img(C, P, 'assets/utility/wall-s.webp', 1800, 814, 'lg-band-img')}<i class="lg-band-fade"></i></div>
    <div class="lg-in">
      ${C.crumbs(P, [['Главная', 'index.html'], [l.h1, `${kind}.html`]])}
      <header class="lg-head"><span class="eyebrow reveal">Документы</span><h1 class="reveal">${esc(l.h1)}</h1>${body && ver ? `<p class="lg-ver reveal"><span>Редакция от</span> <time>${esc(ver)}</time></p>` : ''}</header>
      <div class="lg-cols">
        <aside class="lg-side" aria-label="Навигация по документу">
          <nav class="lg-toc" data-lg-toc hidden aria-label="Разделы документа"><b>Разделы</b><ol></ol></nav>
          <nav class="lg-docs" aria-label="Другие документы"><b>Документы</b><ul>${docs.map(([t, h, on]) => `<li><a href="${C.u(P, h)}"${on ? ' aria-current="page"' : ''}>${esc(t)}</a></li>`).join('')}</ul></nav>
        </aside>
        <div class="lg-main">
          ${body ? `<div class="legal-body lg-body reveal" data-lg-body>${body}</div>` : `<div class="notice reveal">${I.info}<span>Страница-заглушка: документ будет опубликован здесь.</span></div>
          <p class="lead reveal" style="margin-top:24px">${esc(l.text)}</p>`}
          <div class="row lg-foot reveal"><a class="btn btn-ghost" href="${C.u(P, 'contacts.html')}">Контакты ${I.arrow}</a><a class="btn btn-lnk" href="${C.u(P, 'index.html')}">На главную</a><a class="lg-top" href="#main" data-lg-top>Наверх ${I.arrow}</a></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* Страница 404. GitHub Pages отдаёт её на любой неверный адрес, на любой глубине (/a/b/c), поэтому все пути в ней — от корня сайта (P.root), а не «../» */
function notFoundPage(ctx, C, P) {
  const go = [['Каталог', 'catalog.html', 'Товары по задачам и брендам'], ['Бренды', 'brands.html', 'Девять линеек на одной стене'], ['Обучение', 'training.html', 'Семинары и учебный центр'], ['Поиск', 'search.html', 'Товары, бренды, новости и события']];
  return `<div class="nf-page" data-nf>
    <section class="nf-scene" aria-labelledby="nf-h">
      <div class="nf-bg" aria-hidden="true"><picture><source media="(max-width:700px)" srcset="${esc(C.u(P, 'assets/utility/arches-m.webp'))}">${img(C, P, 'assets/utility/arches.webp', 1920, 1080, 'nf-bg-img')}</picture><i class="nf-wash"></i><i class="nf-fade"></i></div>
      <div class="nf-in">
        <span class="nf-eyebrow">Ошибка 404</span>
        <p class="nf-num" aria-hidden="true">404</p>
        <h1 id="nf-h">Такой страницы нет</h1>
        <p class="nf-lead">Возможно, ссылка устарела или в адресе опечатка. Найдите нужное через поиск или перейдите в один из разделов.</p>
        <div class="nf-orb" data-nf-orb aria-hidden="true"></div>
        <form class="search-page nf-form" role="search" action="${C.u(P, 'search.html')}" method="get">
          <label class="search"><span class="sr">Запрос</span>${I.search}<input type="search" name="q" placeholder="Например: Heliocare, пилинг, семинар" autocomplete="off" enterkeyhint="search"></label>
          <button class="btn btn-fill" type="submit">Найти</button>
        </form>
        <div class="srch-hints nf-hints"><span>Популярное:</span>${ctx.content.searchHints.map(h => `<a class="chip" href="${C.u(P, 'search.html')}?q=${encodeURIComponent(h)}">${esc(h)}</a>`).join('')}</div>
      </div>
    </section>
    <section class="nf-go" aria-label="Разделы сайта">
      <ul class="nf-go-l">${go.map(([t, h, s], i) => `<li><a href="${C.u(P, h)}"><span class="nf-go-n">${String(i + 1).padStart(2, '0')}</span><b>${esc(t)}</b><small>${esc(s)}</small>${I.arrow}</a></li>`).join('')}</ul>
      <a class="btn btn-fill nf-home" href="${C.u(P, 'index.html')}">На главную ${I.arrow}</a>
    </section>
  </div>`;
}

module.exports = {searchPage, legalPage, notFoundPage};
