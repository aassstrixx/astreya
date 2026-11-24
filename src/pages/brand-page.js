const fs = require('fs');
const path = require('path');
const S = require('../../js/shared.js');
const {T, Traw} = require('../texts.js');
const {esc, I, bstyle} = S;

/* Страница бренда v2 («Витрина»): кадр assets/detail/stage-brand.webp (tools/showroom-assets/detail/detail_stage.py brand) — арочная ниша-витрина: подсвеченное матовое стекло «полумесяц» за логотипом,
   стеклянная полка с латунной кромкой над упаковками, три травертиновых подставки и консоль со стеклом для 4-й…6-й упаковок; слой assets/detail/stage-brand-glow.webp красит подсветку цветом бренда (.dtb-glow).
   Логотип бренда стоит в нише, на подставках — упаковки бренда (спрайты pack-*, тот же рендер, что на стене брендов), справа на стене — «табличка» бренда.
   Ниже: «паспорт бренда» плитками (страна, направления, факты из data/brands.json + число позиций), линейки — арки с числом позиций, ассортимент — полкой,
   задачи, обучение и материалы, соседние бренды, «Стать партнёром». Всё из данных; пустое не выдумывается.
   Крючки для js сохранены: [data-brand-page], .b-hero (js/sales-pages.js вставляет за ним «Путь с брендом»), h2 «Товары …» (кнопка «К товарам»), .b-title, data-track/data-act.
   Свои стили и скрипты — css/pg-brand.css, js/pg-brand.js (собираются из src/detail/: node tools/build-detail.js). */
const ROOT = path.join(__dirname, '..', '..');
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const PH = 1520, STAGE = (readJson('assets/detail/stage.json') || {}).brand || {};
const SLOTS = STAGE.slots && STAGE.slots.length ? STAGE.slots : [{x: .253, y: .823, pxcm: 22.5}, {x: .1, y: .86, pxcm: 22.5}, {x: .398, y: .875, pxcm: 22.5}];
const NICHE = STAGE.niche || {cx: .25, top: .113, bottom: .91};
const MOON = STAGE.moon || {};                                                            // светящееся стеклянное «окно» арки (stage.json → moon: центр и габариты в долях кадра) — логотип стоит в его геометрическом центре

const PACKS = readJson('assets/showroom/packs.json') || {};
const PACK_CM = {tube: 14.4, bottle: 21.9, pump: 22.9, dropper: 15.6, jar: 6.0, box: 13.0, device: 15.6};   // как на стене брендов (src/pages/brands.js)
const f1 = n => Math.round(n * 1000) / 1000;
const LOGO_BOX = MOON.cy ? `;--cy:${f1(MOON.cy * 100)}%;--lw:${f1(MOON.w * 100 * .60)}%;--lh:${f1(MOON.h * 100 * .50)}%` : '';       // логотип вписан в окно: ширина ≤ 60% его ширины, высота ≤ 50% высоты (object-fit: contain — любые пропорции), центр — центр окна
const spriteAr = src => { const e = PACKS[path.basename(src).replace(/\.webp$/, '')]; return e && e.w && e.h ? e.w / e.h : .3; };

module.exports = function brandPage(ctx, C, P, b) {
  const {brands, products, cats} = ctx;
  const i = brands.indexOf(b), n = brands.length, prev = brands[(i - 1 + n) % n], next = brands[(i + 1) % n];
  const prods = products.filter(p => p.brand === b.id);
  const groups = cats.map(c => [c, prods.filter(p => p.cat === c.id)]).filter(x => x[1].length);
  const events = ctx.sortedEvents.filter(e => e.brand === b.id);
  const facts = [[T('brand.passport.s'), b.country ? b.country + (b.countryNote ? ` (${b.countryNote})` : '') : T('brand.passport.s2')], ...(b.facts || []).filter(f => f[0] !== T('brand.passport.s'))];
  const cnt = (k, a, b2, c2) => `${k} ${S.plural(k, a, b2, c2)}`;
  const catalogHref = `${C.u(P, 'catalog.html')}?brand=${b.id}`;
  const request = (cls, place, label) => `<button class="${cls}" type="button" data-act="form" data-type="question" data-ref="${T('brand.route.sm2')} ${esc(b.name)}${T('common.pages.brandRef')}" data-track="brand_request" data-place="${place}">${label} ${I.arrow}</button>`;
  const partner = (cls, place) => `<a class="${cls}" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="${place}">${T('brand.cta.a')}</a>`;

  /* «Витрина»: стеклянный кабинет бренда (до 9 позиций на 1–3 полках: мелкое выше, высокое ниже) и полки по направлениям. Предмет — спрайт упаковки (тот же рендер, что на стене брендов и в каталоге),
     размер в сантиметрах (PACK_CM) → единый масштаб на всех полках; подпись появляется при наведении, клик ведёт на страницу товара. */
  const vbItem = (p, k) => { const src = S.packOf(p), cm = PACK_CM[p.type || 'bottle'] || 21.9;
    return `<a class="vb-item" href="${C.purl(P, p)}" style="--cm:${cm};--sar:${f1(spriteAr(src))};--k:${k}" data-track="product_click" data-place="brand-vitrine" aria-label="${esc(p.name)}"><img class="vb-pk" src="${esc(C.u(P, src))}" alt="" loading="lazy" decoding="async"><span class="vb-tag">${esc(p.name)}</span></a>`; };
  const vbShelf = (list, k0) => { const mx = Math.max(...list.map(p => PACK_CM[p.type || 'bottle'] || 21.9)); return `<div class="vb-shelf" style="--sh:${f1(mx + 14.5)}">${list.map((p, j) => vbItem(p, k0 + j)).join('')}<i class="vb-slab" aria-hidden="true"></i></div>`; };
  const cab = [...prods].sort((a, b2) => (b2.isNew ? 1 : 0) - (a.isNew ? 1 : 0)).slice(0, 9).sort((a, b2) => (PACK_CM[a.type || 'bottle'] || 21.9) - (PACK_CM[b2.type || 'bottle'] || 21.9));
  const nSh = Math.min(3, Math.max(1, Math.ceil(cab.length / 3))), per = Math.ceil(cab.length / nSh), cabShelves = [];
  for (let k = 0; k < cab.length; k += per) cabShelves.push(cab.slice(k, k + per));
  const vbSign = b.logo ? `<img src="${esc(C.u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}"` : ''} decoding="async" fetchpriority="high">` : `<b>${esc(b.name)}</b>`;
  const vitrine = `<div class="vb reveal" role="group" aria-label="${T('brand.shelf.aria')} ${esc(b.name)}">
        <div class="vb-crown"><span class="vb-sign">${vbSign}</span></div>
        <div class="vb-case"><div class="vb-glass">${cabShelves.map((l, k) => vbShelf(l, k * per)).join('')}<i class="vb-gloss" aria-hidden="true"></i></div></div>
        <div class="vb-base" aria-hidden="true"></div>
      </div>`;

  /* упаковки в нише: разные спрайты (по виду), центральная подставка — первая новинка или первая позиция */
  const seen = new Set(), pick = [];
  [...prods.filter(p => p.isNew), ...prods].forEach(p => { const s = S.packOf(p); if (!seen.has(s) && pick.length < SLOTS.length) { seen.add(s); pick.push(p); } });
  const packs = pick.map((p, k) => { const s = SLOTS[k], src = S.packOf(p), hp = f1((PACK_CM[p.type || 'bottle'] || 21.9) * s.pxcm / PH * 100);
    return `<div class="pdp-pack dtb-pk" style="left:${f1(s.x * 100)}%;top:${f1(s.y * 100 + .4)}%;--hp:${hp};--sar:${f1(spriteAr(src))};--k:${k}" role="img" aria-label="${esc(Traw('common.aria.pack', {brand: b.name, product: p.name}))}">
        <img class="pdp-cs" src="${esc(C.u(P, src))}" alt="" aria-hidden="true" decoding="async"><img class="pdp-pk" src="${esc(C.u(P, src))}" alt="" decoding="async"></div>`; }).join('');
  const logo = b.logo
    ? `<span class="dtb-logo" style="--cx:${f1((MOON.cx || NICHE.cx) * 100)}%${LOGO_BOX}"><img src="${esc(C.u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}"` : ''} decoding="async" fetchpriority="high"></span>`
    : `<span class="dtb-logo is-text" style="--cx:${f1((MOON.cx || NICHE.cx) * 100)}%${LOGO_BOX}"><b aria-hidden="true">${esc(b.name)}</b></span>`;
  const brandMark = b.logo ? `<img class="dt-rl" src="${esc(C.u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}"` : ''} decoding="async">` : `<b>${esc(b.name)}</b>`;
  const route = `<nav class="dt-route" aria-label="${T('brand.route.aria')}">
      <ol>
        <li style="--i:0" class="is-home"><a href="${C.u(P, 'index.html')}" aria-label="${T('common.aria.home')}"><svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 9.4 10 4l6.5 5.4M5.3 8.2V16h9.4V8.2M8.4 16v-4.2h3.2V16"/></svg></a></li>
        <li style="--i:1"><a href="${C.u(P, 'brands.html')}"><small>${T('brand.route.sm')}</small><b>${T('brand.route.b')}</b></a></li>
        <li style="--i:2" aria-current="page"><small>${T('brand.route.sm2')}</small><b>${esc(b.name)}</b></li>
      </ol>
      <a class="dt-back" href="${C.u(P, 'brands.html')}">${I.back}<span>${T('brand.route.t')}</span></a>
    </nav>`;

  const tile = (no, title, html, cls = '', ic = '') => `<article class="dt-tile reveal${cls ? ' ' + cls : ''}"><span class="dt-no" aria-hidden="true">${no}</span><div class="dt-th">${ic ? `<span class="dt-ic" aria-hidden="true">${ic}</span>` : ''}<h3>${esc(title)}</h3></div>${html}</article>`;
  const PIC = ['globe', 'layers', 'book', 'box', 'shield', 'chat'];
  const passport = [
    ...facts.map(([k, v]) => [k, `<p>${esc(v)}</p>`]),
    [T('brand.facts.s'), `<p>${cnt(prods.length, 'позиция', 'позиции', 'позиций')} в ${cnt(groups.length, 'линейке', 'линейках', 'линейках')}.</p>`],
    [T('brand.facts.s2'), `<p>${esc(b.name)} ${T('brand.facts.p')}</p>`],
    [T('brand.facts.s3'), `<p>${T('common.pages.brandConsult')}</p>`]
  ].slice(0, 6).map(([k, v], k2) => tile(String(k2 + 1).padStart(2, '0'), k, v, '', I[PIC[k2]])).join('');

  const arches = groups.length ? `<section class="sec dtb-lines wrap" aria-label="${T('brand.lines.aria')}">
      ${C.secHead(T('brand.lines.aria'), `${T('brand.lines.tx')} ${esc(b.name)}`)}
      <div class="vb-lines">${groups.map(([c, list], k) => `<section class="vb-row reveal" style="--i:${k}">
          <header class="vb-rh"><h3>${esc(c.name)}</h3><p>${list.length} ${S.plural(list.length, 'позиция', 'позиции', 'позиций')}</p><a class="lnk" href="${catalogHref}&cat=${c.id}" data-track="catalog_click" data-place="brand-lines">${T('brand.facts.s')} ${I.arrow}</a></header>
          ${vbShelf([...list].sort((a, b2) => (PACK_CM[a.type || 'bottle'] || 21.9) - (PACK_CM[b2.type || 'bottle'] || 21.9)).slice(0, 6), 0)}
        </section>`).join('')}</div>
    </section>` : '';

  const tasks = b.tasks && b.tasks.length ? `<section class="sec rd-b-tasks wrap" style="padding-top:0">
      ${C.secHead(T('brand.tasks.s'), `${T('brand.tasks.tx')} ${esc(b.name)}`)}
      <div class="rd-b-tasklist">${b.tasks.map((id, k) => { const t = ctx.taskById[id], c2 = prods.filter(p => p.tasks.includes(id)).length;
        return `<a class="rd-b-task reveal" href="${catalogHref}&task=${id}" data-track="catalog_click" data-place="brand-tasks"><span class="rd-no" aria-hidden="true">${String(k + 1).padStart(2, '0')}</span><h3>${esc(t.label)}</h3><span class="rd-b-count">${c2} ${S.plural(c2, 'позиция', 'позиции', 'позиций')}</span></a>`; }).join('')}</div>
    </section>` : '';
  const PHO = {'photo-05-expertise': [683, 1024, '50% 28%'], 'photo-02c-about': [683, 1024, '50% 24%'], 'photo-02b-about': [768, 768, '50% 30%'], 'photo-01-hero': [626, 626, '50% 30%'], 'photo-02-about': [800, 533, '50% 35%']};
  const SHOTS = ['photo-05-expertise', 'photo-02b-about', 'photo-02c-about', 'photo-01-hero'];          // три снимка подряд по кругу (у соседних брендов наборы разные)
  const phImg = f => `<img src="${esc(C.u(P, 'assets/photos/' + f + '.webp'))}" alt="" width="${PHO[f][0]}" height="${PHO[f][1]}" style="object-position:${PHO[f][2]}" loading="lazy" decoding="async">`;
  const shots = [0, 1, 2].map(k => SHOTS[(Math.max(0, i) + k) % SHOTS.length]);
  const photos = `<div class="dtb-photos reveal" aria-hidden="true">${shots.map(f => `<figure class="dtb-ph">${phImg(f)}</figure>`).join('')}</div>`;
  const arts = (ctx.training.articles || []).filter(a => a.brand === b.id);
  const sib = (x, cls, label) => `<a class="${cls} reveal" href="${C.burl(P, x)}" style="${bstyle(x)}"><span><small>${label}</small>${x.logo ? `<img class="is-logo" src="${esc(C.u(P, x.logo))}" alt="${esc(x.name)}" loading="lazy" decoding="async">` : `<b>${esc(x.name)}</b>`}</span></a>`;

  return `<div class="dt dtb" style="${bstyle(b)}" data-brand-page="${b.id}" data-page-root>
    <section class="b-hero dt-stage dtb-stage" data-dt-stage style="--px:${f1(NICHE.cx)};--py:${f1(NICHE.bottom)}">
      <div class="dt-view">
        <div class="dt-world">
          <i class="dt-glint" aria-hidden="true"></i>
          <picture><source media="(max-width:900px)" srcset="${C.u(P, 'assets/detail/stage-brand-s.webp')}"><img class="dt-plate" src="${C.u(P, 'assets/detail/stage-brand.webp')}" alt="" width="2880" height="1520" decoding="async" fetchpriority="high"></picture>
          <i class="dtb-glow" aria-hidden="true"></i>${logo}${packs}
        </div>
      </div>
      <div class="dt-over wrap">
        ${route}
        <div class="dt-plaque">
          <span class="eyebrow in">${esc(b.group)}${b.country && b.country !== b.group ? ' · ' + esc(b.country) : ''}</span>
          <h1 class="b-title">${esc(b.name)}</h1>
          <p class="lead">${esc(b.tag)}</p>
          <ul class="dtb-stats" aria-label="${T('brand.hero.aria')}"><li><b>${prods.length}</b><small>${S.plural(prods.length, 'позиция', 'позиции', 'позиций')}</small></li><li><b>${groups.length}</b><small>${S.plural(groups.length, 'линейка', 'линейки', 'линеек')}</small></li><li><b>${events.length}</b><small>${S.plural(events.length, 'семинар', 'семинара', 'семинаров')}</small></li></ul>
          <div class="row">
            <a class="btn btn-fill" href="${catalogHref}" data-track="catalog_click" data-place="brand-hero">${T('brand.hero.a')} ${I.arrow}</a>
            ${partner('btn btn-ghost', 'brand-hero')}
          </div>
        </div>
      </div>
    </section>

    <section class="sec dtb-about wrap" aria-label="${T('brand.about.aria')}">
      <div class="dtb-story reveal">
        <h2 class="sr">${T('brand.about.aria')} ${esc(b.name)}</h2>
        <span class="eyebrow in">${T('brand.about.aria')}</span>
        ${(b.long || []).map(t => `<p>${esc(t)}</p>`).join('')}
        ${b.tasks && b.tasks.length ? `<div class="tasks-line">${b.tasks.map(t => C.tag(ctx.taskById[t].label, 'blue')).join('')}</div>` : ''}
      </div>
      <div class="dtb-passport" aria-label="${T('brand.about.aria2')}">${passport}</div>
    </section>

    <section class="sec dtb-gallery wrap" aria-hidden="true">${photos}</section>

    ${arches}

    <section class="sec dtb-shelf" aria-label="${T('brand.shelf.aria')}">
      <div class="wrap">
        ${C.secHead(T('brand.shelf.aria'), `${T('brand.shelf.tx')} ${esc(b.name)}`, C.lnk(catalogHref, T('brand.facts.s')))}
        <div class="grid g3">${prods.map((p, k) => C.productCardX(P, p, k)).join('')}</div>
      </div>
    </section>

    ${tasks}

    ${events.length ? `<section class="sec wrap" style="padding-top:0">
      ${C.secHead(T('brand.edu.s'), T('common.pages.brandEvents', {brand: esc(b.name)}), C.lnk(C.u(P, 'training.html'), T('brand.edu.s2')))}
      <div class="grid g3 events-grid">${events.slice(0, 3).map(e => C.eventCard(P, e)).join('')}</div>
    </section>` : ''}

    ${arts.length ? `<section class="sec wrap" style="padding-top:0">
      ${C.secHead(T('brand.edu.s3'), T('common.pages.brandArticles', {brand: esc(b.name)}), C.lnk(C.u(P, 'training.html') + '#materials', T('brand.edu.s4')))}
      <div class="grid g3">${arts.slice(0, 3).map(C.articleCard).join('')}</div>
    </section>` : ''}

    <section class="sec wrap" style="padding-top:0">
      <div class="cta-band cta-brand reveal pushin">
        <div class="cb-copy">
          <span class="eyebrow">${T('brand.coop.eyebrow')}</span>
          <h2>${esc(b.name)} ${T('brand.coop.h2')}</h2>
          <p>${T('brand.coop.p')}</p>
          <div class="row"><a class="btn btn-light" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="brand-cta">${T('brand.cta.a')} ${I.arrow}</a>
            <button class="btn btn-ghost-inv" type="button" data-act="form" data-type="question" data-ref="${T('brand.route.sm2')} ${esc(b.name)}${T('common.pages.brandRef')}">${T('brand.coop.btn')}</button></div>
        </div>
        <figure class="cb-ph" aria-hidden="true"><img src="${esc(C.u(P, 'assets/photos/photo-02-about.webp'))}" alt="" width="800" height="533" loading="lazy" decoding="async"></figure>
      </div>
    </section>

    <nav class="dt-sib wrap" aria-label="${T('brand.sib.aria')}">
      ${sib(prev, '', `${I.back} ${T('brand.sib.tx')}`)}
      ${sib(next, 'nx', `${T('brand.sib.tx2')} ${I.arrow}`)}
    </nav>

    <div class="dt-bar" data-dt-bar hidden aria-hidden="true">
      <div class="wrap"><span class="dt-bar-t"><small>${esc(b.group)}</small><b>${esc(b.name)}</b></span><span class="dt-bar-a"><a class="btn btn-ghost btn-sm" href="${catalogHref}" data-track="catalog_click" data-place="brand-sticky">${T('brand.shelf.aria')}</a>${request('btn btn-fill btn-sm', 'brand-sticky', T('brand.coop.btn'))}</span></div>
    </div>
  </div>`;
};
