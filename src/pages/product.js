const S = require('../../js/shared.js');
const {esc, I, bstyle} = S;

/* Отдельная страница товара. Разделы без данных не выдумываются: показывается «Уточняется — запросите у менеджера». */
module.exports = function product(ctx, C, P, p) {
  const b = ctx.brandById[p.brand], c = ctx.catById[p.cat], k = ctx.kindById[p.kind];
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
  const details = p.details && p.details.length ? p.details : [
    p.desc,
    `Позиция входит в портфель бренда ${b.name} — ${lc(b.tag)}.`,
    'Информацию о составе, способе применения и условиях поставки предоставляют менеджеры «Астреи» — воспользуйтесь кнопкой «Запросить информацию».'
  ];
  const tbd = '<span class="tbd">Уточняется — запросите у менеджера</span>';
  const list = a => `<ul class="ticks">${a.map(x => `<li>${I.check}<span>${esc(x)}</span></li>`).join('')}</ul>`;
  const rows = [['Бренд', `<a href="${C.burl(P, b)}">${esc(b.name)}</a>`], ['Категория', esc(c.name)], ['Тип продукта', k ? esc(k.name) : tbd],
    ['Объём', p.volume ? esc(p.volume) : tbd], ['Артикул', p.sku ? esc(p.sku) : tbd]];
  const related = ctx.related(p);
  const request = (cls, place) => `<button class="${cls}" type="button" data-act="form" data-type="product" data-ref="${p.id}" data-track="product_request" data-place="${place}">Запросить информацию ${I.arrow}</button>`;

  return `<div class="wrap p-page" style="${bstyle(b)}" data-product="${p.id}">
    <section class="p-top">
      ${C.crumbs(P, [['Главная', 'index.html'], ['Каталог', 'catalog.html'], [b.name, `brands/${b.id}.html`], [p.name, `products/${p.slug}.html`]])}
      <div class="p-hero">
        <div class="p-visual reveal">${p.isNew ? '<span class="newtag">Новинка</span>' : ''}${C.art(P, p)}</div>
        <div class="p-info">
          <div class="tasks-line reveal">${C.tag(b.name, 'blue')}${C.tag(c.name)}${k ? C.tag(k.name) : ''}</div>
          <h1 class="reveal">${esc(p.name)}</h1>
          <p class="lead reveal">${esc(p.desc)}</p>
          <div class="row reveal" style="margin-top:8px">${request('btn btn-fill', 'product-hero')}
            <a class="btn btn-ghost" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="product-hero">Стать партнёром</a></div>
          <dl class="specs reveal">${rows.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('')}</dl>
        </div>
      </div>
    </section>

    <section class="sec p-detail" style="padding-top:0">
      <div class="p-cols">
        <div class="p-main">
          <article class="p-block reveal"><h2>Описание</h2>${details.map(t => `<p>${esc(t)}</p>`).join('')}</article>
          <article class="p-block reveal"><h2>Назначение</h2>
            <div class="tasks-line">${p.tasks.map(t => C.tag(ctx.taskById[t].label, 'blue')).join('')}</div>
            <p class="muted">Подбор ориентировочный: решение о применении принимает специалист по результатам консультации клиента.</p></article>
          <article class="p-block reveal"><h2>Показания</h2>${p.indications && p.indications.length ? list(p.indications) : `<p>${tbd}</p>`}</article>
          <article class="p-block reveal"><h2>Активные компоненты</h2>${p.actives && p.actives.length ? list(p.actives) : `<p>${tbd}</p>`}</article>
          <article class="p-block reveal"><h2>Способ применения</h2>${p.usage ? `<p>${esc(p.usage)}</p>` : `<p>${tbd}</p>`}</article>
          <article class="p-block reveal"><h2>Документы</h2>${p.docs && p.docs.length
            ? `<ul class="docs">${p.docs.map(d => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${I.doc}<span>${esc(d.title)}</span>${I.external}</a></li>`).join('')}</ul>`
            : `<p>${tbd}</p>`}</article>
        </div>
        <aside class="p-side reveal">
          <div class="card card-pad p-req">
            <span class="eyebrow in">Запрос</span>
            <h3>Нужна информация по продукту?</h3>
            <p class="muted">Пришлём описание, наличие и условия поставки.</p>
            ${request('btn btn-fill', 'product-side')}
            <a class="lnk" href="tel:${ctx.site.contacts.phoneRaw}" data-track="phone_click">${I.phone} ${esc(ctx.site.contacts.phone)}</a>
          </div>
        </aside>
      </div>
    </section>
    </div>

    ${related.length ? `<section class="sec tint"><div class="wrap">
      ${C.secHead('Сопутствующие товары', 'С этим продуктом смотрят', C.lnk(`${C.u(P, 'catalog.html')}?brand=${b.id}`, `Все ${esc(b.name)}`))}
      <div class="grid g4">${related.map((q, i) => C.productCard(P, q, i)).join('')}</div>
    </div></section>` : ''}

    ${C.ctaBand(P, 'product-cta')}`;
};
