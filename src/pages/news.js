const S = require('../../js/shared.js');
const {esc, I, dparts} = S;

function newsPage(ctx, C, P) {
  const {news, newsCats, site} = ctx;
  const max = Math.max(...site.discounts.map(d => d.pct));
  const sale = news.find(n => n.category === 'sale');
  const tabs = [['all', 'Все', news.length], ...newsCats.map(c => [c.id, c.name, news.filter(n => n.category === c.id).length])];
  return `<div class="wrap" data-news>
    ${C.pageHead('Новости', 'Новости, акции и новинки', 'Новинки каталога, программы для партнёров, события учебного центра и жизнь компании.')}
    ${sale ? `<article class="feat reveal pushin">
      <div class="fb">
        <span class="tag" style="align-self:flex-start;border-color:rgba(185,194,208,.45);color:var(--silver)">Акция</span>
        <h2><a href="${C.nurl(P, sale)}">${esc(sale.title)}</a></h2>
        <p>${esc(sale.excerpt)}</p>
        <div class="row"><a class="btn btn-light" href="${C.nurl(P, sale)}">Подробнее ${I.arrow}</a><a class="btn btn-ghost-inv" href="${C.u(P, 'partners.html')}#calc" data-track="partner_cta" data-place="news-feat">Калькулятор скидки</a></div>
      </div>
      <div class="fv" aria-hidden="true"><b class="par" data-par="0.07">до ${max}<small>%</small></b></div>
    </article>` : ''}
    <div class="tabs reveal" id="news-tabs" role="group" aria-label="Категории">${tabs.map(([id, l, n], i) => C.chip(esc(l), 'news-cat', id, i === 0, `<small>${n}</small>`)).join('')}</div>
    <h2 class="sr">Материалы</h2>
    <div class="grid g3" id="news-grid">${news.map(n => C.newsCard(P, n)).join('')}</div>
    <div class="empty" id="news-empty" hidden><b>Пока пусто</b>Здесь появятся новые материалы.</div>
    <div style="height:clamp(60px,8vw,110px)"></div>
  </div>`;
}

function articlePage(ctx, C, P, n) {
  const cat = ctx.newsCatById[n.category], rel = n.related || {};
  const prods = (rel.products || []).map(id => ctx.productById[id]).filter(Boolean);
  const evs = (rel.events || []).map(id => ctx.eventById[id]).filter(Boolean);
  const brs = (rel.brands || []).map(id => ctx.brandById[id]).filter(Boolean);
  const more = ctx.news.filter(x => x.id !== n.id).sort((a, b) => (b.category === n.category) - (a.category === n.category)).slice(0, 3);
  const cta = n.cta || {};
  let ctaHtml = '';
  if (cta.type === 'partner') ctaHtml = `<a class="btn btn-fill" href="${C.u(P, 'partners.html')}#calc" data-track="partner_cta" data-place="article">Рассчитать скидку ${I.arrow}</a>`;
  else if (cta.type === 'training') ctaHtml = `<a class="btn btn-fill" href="${C.u(P, 'training.html')}${cta.query ? '?' + cta.query : ''}">К расписанию ${I.arrow}</a>`;
  else if (cta.type === 'product' && ctx.productById[cta.ref]) ctaHtml = `<a class="btn btn-fill" href="${C.purl(P, ctx.productById[cta.ref])}">Смотреть товар ${I.arrow}</a>`;
  else if (cta.type === 'catalog') ctaHtml = `<a class="btn btn-fill" href="${C.u(P, 'catalog.html')}${cta.query ? '?' + cta.query : ''}" data-track="catalog_click" data-place="article">В каталог ${I.arrow}</a>`;
  else if (cta.type === 'brand' && ctx.brandById[cta.ref]) ctaHtml = `<a class="btn btn-fill" href="${C.burl(P, ctx.brandById[cta.ref])}">О бренде ${esc(ctx.brandById[cta.ref].name)} ${I.arrow}</a>`;
  else if (cta.type === 'event' && ctx.eventById[cta.ref]) ctaHtml = `<a class="btn btn-fill" href="${C.eurl(P, ctx.eventById[cta.ref])}">О мероприятии ${I.arrow}</a>`;
  else if (cta.type === 'contacts') ctaHtml = `<a class="btn btn-fill" href="${C.u(P, 'contacts.html')}">Контакты ${I.arrow}</a>`;

  return `<div class="wrap" style="${C.newsStyle(cat)}">
    <article class="a-page" data-cat="${n.category}">
      <header class="a-head">
        ${C.crumbs(P, [['Главная', 'index.html'], ['Новости', 'news.html'], [n.title, `news/${n.slug}.html`]])}
        <div class="a-meta reveal"><span class="tag blue">${esc(cat.name)}</span>${C.timeTag(n.date)}</div>
        <h1 class="reveal">${esc(n.title)}</h1>
        <p class="lead reveal">${esc(n.excerpt)}</p>
      </header>
      <div class="a-cover reveal" aria-hidden="true"><span>${esc(cat.name)}</span></div>
      <div class="a-body reveal">${n.body.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      ${ctaHtml ? `<div class="a-cta reveal">${ctaHtml}<a class="btn btn-ghost" href="${C.u(P, 'news.html')}">Все новости</a></div>` : ''}
    </article>

    ${(prods.length || evs.length || brs.length) ? `<section class="sec" style="padding-top:0">
      ${prods.length ? `${C.secHead('Товары', 'По теме')}<div class="grid g4" style="margin-bottom:clamp(28px,4vw,48px)">${prods.map((p, i) => C.productCard(P, p, i)).join('')}</div>` : ''}
      ${evs.length ? `${C.secHead('Обучение', 'Мероприятия по теме')}<div class="grid g3 events-grid" style="margin-bottom:clamp(28px,4vw,48px)">${evs.slice(0, 3).map(e => C.eventCard(P, e)).join('')}</div>` : ''}
      ${brs.length ? `<div class="tasks-line">${brs.map(b => `<a class="tag blue" href="${C.burl(P, b)}">${esc(b.name)}</a>`).join('')}</div>` : ''}
    </section>` : ''}

    <section class="sec" style="padding-top:0">
      ${C.secHead('Новости', 'Читайте также', C.lnk(C.u(P, 'news.html'), 'Все новости'))}
      <div class="grid g3">${more.map(x => C.newsCard(P, x)).join('')}</div>
    </section>
  </div>
  ${C.ctaBand(P, 'article-cta')}`;
}

module.exports = {newsPage, articlePage};
