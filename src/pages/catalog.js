const S = require('../../js/shared.js');
const {T} = require('../texts.js');
const {esc, I} = S;

module.exports = function catalog(ctx, C, P) {
  const {cats, tasks, kinds, brands, products, site} = ctx;
  if (C.xon('gallery') && C.xon('showroom')) return require('./showroom.js')(ctx, C, P);          // шоурум (extras.showroom): другая раскладка тех же элементов; выключен — прежний каталог ниже
  const sel = (id, label, opts) => `<div class="fld"><label for="${id}">${label}</label><div class="sel"><select id="${id}">${opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>${I.chevron}</div></div>`;
  return `<div class="wrap" data-catalog>
    ${C.pageHead(T('catalog.head.s'), T('catalog.head.s2'), T('catalog.head.s3'))}
    <div class="cat-tiles" id="categories">${cats.map(c => {
      const n = products.filter(p => p.cat === c.id).length;
      return `<button type="button" class="cat-tile reveal" data-act="cat-tile" data-id="${c.id}" aria-pressed="false"><span>${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')}</span><b>${esc(c.name)}</b></button>`;
    }).join('')}</div>

    <div class="toolbar reveal" id="results">
      <div class="tb-top">
        <label class="search"><span class="sr">${T('catalog.search.t')}</span>${I.search}<input id="cat-q" type="search" placeholder="${T('catalog.search.a')}" autocomplete="off"></label>
        <button class="btn btn-ghost btn-sm filters-toggle" type="button" data-act="filters" aria-expanded="false" aria-controls="filters">${I.filter} ${T('catalog.search.btn')} <span class="badge" id="f-badge" hidden>0</span></button>
      </div>
      <div class="filters" id="filters">
        ${sel('f-brand', T('catalog.search.s'), [['all', T('catalog.search.s2')], ...brands.map(b => [b.id, b.name])])}
        ${sel('f-cat', T('catalog.search.s3'), [['all', T('catalog.search.s4')], ...cats.map(c => [c.id, c.name])])}
        ${sel('f-task', T('catalog.search.s5'), [['all', T('catalog.search.s6')], ...tasks.map(t => [t.id, t.label])])}
        ${sel('f-kind', T('catalog.search.s7'), [['all', T('catalog.search.s8')], ...kinds.map(k => [k.id, k.name])])}
        ${sel('f-sort', T('catalog.search.s9'), [['def', T('catalog.search.s10')], ['new', T('catalog.search.s11')], ['az', T('catalog.search.s12')], ['brand', T('catalog.search.s13')]])}
      </div>
      <div class="active-filters" id="active-filters" hidden></div>
    </div>

    <div class="res-line"><span id="res-count" aria-live="polite">${T('catalog.result.t')} ${products.length} ${T('catalog.result.t2')} ${products.length}</span><button class="lnk" type="button" data-act="cat-reset" id="cat-reset" hidden>${T('catalog.result.btn')}</button></div>
    <h2 class="sr">${T('catalog.result.h2')}</h2>
    <div class="grid g4" id="cat-grid">${products.map((p, i) => C.productCard(P, p, i)).join('')}</div>
    <div class="empty" id="cat-empty" hidden><b>${T('catalog.result.b')}</b>${T('catalog.result.b2')}</div>
    ${C.noteBox(`${ctx.redesign && ctx.redesign.ui && ctx.redesign.ui.showDemoNotices === false ? '' : T('catalog.result.s')}${T('catalog.result.b3')}`)}
    <div style="height:clamp(60px,8vw,110px)"></div>
  </div>`;
};
