const S = require('../../js/shared.js');
const {esc, I} = S;

/* Страница поиска: результаты строит js/pages.js по индексу из js/data.js */
function searchPage(ctx, C, P) {
  return `<div class="wrap" data-search>
    ${C.pageHead('Поиск', 'Поиск по сайту', 'Товары, бренды, новости и обучение.')}
    <form class="search-page reveal" role="search" action="${C.u(P, 'search.html')}" method="get">
      <label class="search"><span class="sr">Запрос</span>${I.search}<input id="sp-q" type="search" name="q" placeholder="Например: Heliocare, пилинг, семинар" autocomplete="off" enterkeyhint="search"></label>
      <button class="btn btn-fill" type="submit">Найти</button>
    </form>
    <div class="s-tabs" id="s-tabs" role="group" aria-label="Тип результатов" hidden></div>
    <div id="s-out" aria-live="polite"><p class="muted">Введите запрос, чтобы найти товары, бренды, новости и мероприятия.</p></div>
    <div class="srch-hints" style="margin-top:28px"><span>Популярное:</span>${ctx.content.searchHints.map(h => `<a class="chip" href="${C.u(P, 'search.html')}?q=${encodeURIComponent(h)}">${esc(h)}</a>`).join('')}</div>
    <div style="height:clamp(60px,8vw,110px)"></div>
  </div>`;
}

/* Юридические страницы-заглушки: без выдуманных документов */
function legalPage(ctx, C, P, kind) {
  const l = ctx.content.legal[kind];
  return `<div class="wrap legal">
    ${C.crumbs(P, [['Главная', 'index.html'], [l.h1, `${kind}.html`]])}
    <header class="page-head"><span class="eyebrow reveal">Документы</span><h1 class="reveal">${esc(l.h1)}</h1></header>
    <div class="notice reveal">${I.info}<span>Страница-заглушка: документ будет опубликован здесь.</span></div>
    <p class="lead reveal" style="margin-top:24px">${esc(l.text)}</p>
    <div class="row reveal" style="margin:28px 0 clamp(60px,8vw,110px)"><a class="btn btn-ghost" href="${C.u(P, 'contacts.html')}">Контакты ${I.arrow}</a><a class="btn btn-lnk" href="${C.u(P, 'index.html')}">На главную</a></div>
  </div>`;
}

module.exports = {searchPage, legalPage};
