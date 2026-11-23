const fs = require('fs');
const path = require('path');
const S = require('../../js/shared.js');
const {T, Traw} = require('../texts.js');
const {esc, I, bstyle} = S;

/* Страница товара v2 («Витрина»): макро-кадр экспоната (assets/detail/stage-product.webp, tools/showroom-assets/detail/detail_stage.py) — упаковка стоит на травертиновом подиуме перед
   арочной нишей, справа «табличка» музейного типа; сверху «путь» (Каталог → Бренд → Категория → Позиция) в виде гравированных ступеней; ниже паспорт продукта плитками, запрос и «полка».
   Разделы без данных не выдумываются: показывается «Уточняется — запросите у менеджера». Крючки для js (js/extras.js, js/sales-pages.js, js/assistant.js) сохранены:
   .p-page[data-product], .p-info > .row с кнопкой [data-place="product-hero"], .specs, .p-side .p-req. Свои стили/скрипты — css/pg-product.css, js/pg-product.js. */
const ROOT = path.join(__dirname, '..', '..');
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const PH = 1520, STAGE = (readJson('assets/detail/stage.json') || {}).product || {};
const PLINTH = STAGE.plinth || {x: .344, y: .81}, PXU = STAGE.px_per_unit || 360;
const PACKS = readJson('assets/showroom/packs.json') || {};
const PACK_H = {bottle: 97, pump: 100, dropper: 83, tube: 87, jar: 49, box: 50, device: 97};            // высота макета, % (как S.packH): упаковки разного вида в одном масштабе
const spriteAr = src => { const k = path.basename(src).replace(/\.webp$/, ''), e = PACKS[k]; return e && e.w && e.h ? e.w / e.h : .3; };
const f1 = n => Math.round(n * 1000) / 1000;

module.exports = function product(ctx, C, P, p) {
  const b = ctx.brandById[p.brand], c = ctx.catById[p.cat], k = ctx.kindById[p.kind];
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
  const details = p.details && p.details.length ? p.details : [
    p.desc,
    `${T('product.about.tx')} ${b.name} — ${lc(b.tag)}.`,
    T('product.about.s')
  ];
  const tbd = `<span class="tbd">${T('common.labels.tbd')}</span>`;
  const list = a => `<ul class="ticks">${a.map(x => `<li>${I.check}<span>${esc(x)}</span></li>`).join('')}</ul>`;
  const rows = [[T('product.about.s2'), `<a href="${C.burl(P, b)}">${esc(b.name)}</a>`], [T('product.about.s3'), esc(c.name)], [T('product.about.s4'), k ? esc(k.name) : tbd],
    [T('product.about.s5'), p.volume ? esc(p.volume) : tbd], [T('product.about.s6'), p.sku ? esc(p.sku) : tbd]];
  const related = ctx.related(p);
  const request = (cls, place, label = T('product.cta.s')) => `<button class="${cls}" type="button" data-act="form" data-type="product" data-ref="${p.id}" data-track="product_request" data-place="${place}">${label} ${I.arrow}</button>`;

  /* путь: Каталог → бренд → категория (с теми же фильтрами, что в каталоге) → позиция; «назад к списку» ведёт в каталог с фильтрами бренда и категории */
  const listHref = `${C.u(P, 'catalog.html')}?brand=${b.id}&cat=${c.id}`;
  const line = ctx.products.filter(q => q.brand === p.brand), at = line.indexOf(p), prev = line[(at - 1 + line.length) % line.length], next = line[(at + 1) % line.length];
  const brandMark = b.logo ? `<img class="dt-rl" src="${esc(C.u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}"` : ''} decoding="async">` : `<b>${esc(b.name)}</b>`;
  const route = `<nav class="dt-route" aria-label="${T('product.route.aria')}">
      <ol>
        <li style="--i:0" class="is-home"><a href="${C.u(P, 'index.html')}" aria-label="${T('common.aria.home')}"><svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 9.4 10 4l6.5 5.4M5.3 8.2V16h9.4V8.2M8.4 16v-4.2h3.2V16"/></svg></a></li>
        <li style="--i:1"><a href="${C.u(P, 'catalog.html')}"><small>${T('product.route.sm')}</small><b>${T('product.route.b')}</b></a></li>
        <li style="--i:2"><a href="${C.burl(P, b)}"><small>${T('product.about.s2')}</small>${brandMark}</a></li>
        <li style="--i:3"><a href="${listHref}"><small>${T('product.about.s3')}</small><b>${esc(c.name)}</b></a></li>
        <li style="--i:4" aria-current="page"><small>${T('product.route.sm2')}</small><b>${esc(p.name)}</b></li>
      </ol>
      <a class="dt-back" href="${listHref}" data-dt-back>${I.back}<span>${T('product.route.t')}</span></a>
    </nav>`;

  /* упаковка на подиуме: спрайт того же рендера, что на стене брендов (по бренду и виду), высота — в долях кадра, тень от солнца слева как у ниш стены */
  const type = p.type || 'bottle', src = S.packOf(p), hp = f1(2.2 * PXU * (PACK_H[type] || 97) / 97 / PH * 100), ar = f1(spriteAr(src));
  const pack = p.image
    ? `<div class="pdp-photo" style="--hp:${f1(2.2 * PXU / PH * 100 * .92)}"><img src="${esc(C.u(P, p.image))}" alt="${esc(p.imageAlt || `${b.name} — ${p.name}`)}" decoding="async"></div>`
    : `<div class="pdp-pack" style="--hp:${hp};--sar:${ar}" role="img" aria-label="${esc(Traw('common.aria.pack', {brand: b.name, product: p.name}))}">
        <img class="pdp-cs" src="${esc(C.u(P, src))}" alt="" aria-hidden="true" decoding="async">
        <img class="pdp-pk" src="${esc(C.u(P, src))}" alt="" decoding="async" fetchpriority="high">
      </div>`;

  const tile = (n, title, html, cls = '') => `<article class="dt-tile reveal${cls ? ' ' + cls : ''}"><span class="dt-no" aria-hidden="true">${n}</span><h2>${title}</h2>${html}</article>`;
  const have = (a) => a && a.length;
  const tasksHtml = `<div class="tasks-line">${p.tasks.map(t => `<a class="tag blue" href="${C.u(P, 'catalog.html')}?task=${t}">${esc(ctx.taskById[t].label)}</a>`).join('')}</div>
    <p class="muted">${T('product.route.p')}</p>`;
  const docsHtml = have(p.docs)
    ? `<ul class="docs">${p.docs.map(d => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${I.doc}<span>${esc(d.title)}</span>${I.external}</a></li>`).join('')}</ul>`
    : `<p>${tbd}</p>`;

  return `<div class="p-page pdp dt" style="${bstyle(b)}" data-product="${p.id}" data-page-root>
    <section class="dt-stage" data-dt-stage style="--px:${f1(PLINTH.x)};--py:${f1(PLINTH.y)}">
      <div class="dt-view">
        <div class="dt-world">
          <i class="dt-glint" aria-hidden="true"></i>
          <picture><source media="(max-width:900px)" srcset="${C.u(P, 'assets/detail/stage-product-s.webp')}"><img class="dt-plate" src="${C.u(P, 'assets/detail/stage-product.webp')}" alt="" width="2880" height="1520" decoding="async" fetchpriority="high"></picture>
          ${pack}
        </div>
      </div>
      <div class="dt-over wrap">
        ${route}
        <div class="dt-plaque p-info">
          <div class="tasks-line reveal">${p.isNew ? `<span class="dt-newchip">${T('common.labels.new')}</span>` : ''}${C.tag(b.name, 'blue')}${C.tag(c.name)}${k ? C.tag(k.name) : ''}</div>
          <h1 class="reveal">${esc(p.name)}</h1>
          <p class="lead reveal">${esc(p.desc)}</p>
          <div class="row reveal">${request('btn btn-fill', 'product-hero')}
            <a class="btn btn-ghost" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="product-hero">${T('product.stage.a')}</a></div>
        </div>
      </div>
    </section>

    <section class="pdp-spec wrap" aria-label="${T('product.stage.aria')}">
      <dl class="specs reveal">${rows.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('')}</dl>
    </section>

    <section class="pdp-passport wrap p-detail">
      <div class="pdp-mosaic">
        ${tile('01', T('product.sections.s'), details.map(t => `<p>${esc(t)}</p>`).join(''), 'is-wide')}
        ${tile('02', T('product.sections.s2'), tasksHtml)}
        ${tile('03', T('product.sections.s3'), have(p.indications) ? list(p.indications) : `<p>${tbd}</p>`)}
        ${tile('04', T('product.sections.s4'), have(p.actives) ? list(p.actives) : `<p>${tbd}</p>`)}
        ${tile('05', T('product.sections.s5'), p.usage ? `<p>${esc(p.usage)}</p>` : `<p>${tbd}</p>`)}
        ${tile('06', T('product.sections.s6'), docsHtml)}
        <aside class="p-side pdp-side reveal is-wide">
          <div class="card card-pad p-req">
            <span class="eyebrow in">${T('product.side.eyebrow')}</span>
            <h3>${T('product.side.h3')}</h3>
            <p class="muted">${T('product.side.p')}</p>
            ${request('btn btn-fill', 'product-side')}
            <a class="lnk" href="tel:${ctx.site.contacts.phoneRaw}" data-track="phone_click">${I.phone} ${esc(ctx.site.contacts.phone)}</a>
            ${C.callbackBtn('lnk', 'product-side')}
          </div>
        </aside>
      </div>
    </section>

    ${related.length ? `<section class="pdp-shelf"><div class="wrap">
      ${C.secHead(T('product.shelf.s'), T('product.shelf.s2'), C.lnk(`${C.u(P, 'catalog.html')}?brand=${b.id}`, `${T('product.shelf.tx')} ${esc(b.name)}`))}
      <div class="grid g4">${related.map((q, i) => C.productCardX(P, q, i)).join('')}</div>
    </div></section>` : ''}

    ${line.length > 1 ? `<nav class="dt-sib wrap" aria-label="${T('common.aria.sib', {brand: esc(b.name)})}">
      <a class="reveal" href="${C.purl(P, prev)}" rel="prev" data-track="product_card_click" data-product="${prev.id}"><img src="${esc(C.u(P, S.packOf(prev)))}" alt="" loading="lazy" decoding="async"><span><small>${I.back} ${T('product.sib.sm')}</small><b>${esc(prev.name)}</b></span></a>
      <a class="nx reveal" href="${C.purl(P, next)}" rel="next" data-track="product_card_click" data-product="${next.id}"><span><small>${T('product.sib.sm2')} ${I.arrow}</small><b>${esc(next.name)}</b></span><img src="${esc(C.u(P, S.packOf(next)))}" alt="" loading="lazy" decoding="async"></a>
    </nav>` : ''}

    <div class="dt-bar" data-dt-bar hidden aria-hidden="true">
      <div class="wrap"><span class="dt-bar-t"><small>${esc(b.name)}</small><b>${esc(p.name)}</b></span>${request('btn btn-fill btn-sm', 'product-sticky', T('product.cta.s2'))}</div>
    </div>
  </div>

    ${C.ctaBand(P, 'product-cta', C.closingCfg('product') && Object.assign({}, C.closingCfg('product'), {vars: {product: p.name, ref: p.id}}))}`;
};
