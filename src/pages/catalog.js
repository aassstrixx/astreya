const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function catalog(ctx, C, P) {
  const {cats, tasks, kinds, brands, products, site} = ctx;
  const sel = (id, label, opts) => `<div class="fld"><label for="${id}">${label}</label><div class="sel"><select id="${id}">${opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>${I.chevron}</div></div>`;
  return `<div class="wrap" data-catalog>
    ${C.pageHead('Каталог', 'Каталог профессиональной косметики', 'Направления, бренды и задачи — фильтруйте ассортимент так, как думает специалист.')}
    <div class="cat-tiles" id="categories">${cats.map(c => {
      const n = products.filter(p => p.cat === c.id).length;
      return `<button type="button" class="cat-tile reveal" data-act="cat-tile" data-id="${c.id}" aria-pressed="false"><span>${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')}</span><b>${esc(c.name)}</b></button>`;
    }).join('')}</div>

    <div class="toolbar reveal" id="results">
      <div class="tb-top">
        <label class="search"><span class="sr">Поиск по каталогу</span>${I.search}<input id="cat-q" type="search" placeholder="Поиск по названию, бренду или задаче" autocomplete="off"></label>
        <button class="btn btn-ghost btn-sm filters-toggle" type="button" data-act="filters" aria-expanded="false" aria-controls="filters">${I.filter} Фильтры <span class="badge" id="f-badge" hidden>0</span></button>
      </div>
      <div class="filters" id="filters">
        ${sel('f-brand', 'Бренд', [['all', 'Все бренды'], ...brands.map(b => [b.id, b.name])])}
        ${sel('f-cat', 'Категория', [['all', 'Все категории'], ...cats.map(c => [c.id, c.name])])}
        ${sel('f-task', 'Назначение', [['all', 'Любое назначение'], ...tasks.map(t => [t.id, t.label])])}
        ${sel('f-kind', 'Тип продукта', [['all', 'Все типы'], ...kinds.map(k => [k.id, k.name])])}
        ${sel('f-sort', 'Сортировка', [['def', 'По умолчанию'], ['new', 'Сначала новинки'], ['az', 'По названию А–Я'], ['brand', 'По бренду']])}
      </div>
      <div class="active-filters" id="active-filters" hidden></div>
    </div>

    <div class="res-line"><span id="res-count" aria-live="polite">Найдено: ${products.length} из ${products.length}</span><button class="lnk" type="button" data-act="cat-reset" id="cat-reset" hidden>Сбросить фильтры</button></div>
    <h2 class="sr">Товары каталога</h2>
    <div class="grid g4" id="cat-grid">${products.map((p, i) => C.productCard(P, p, i)).join('')}</div>
    <div class="empty" id="cat-empty" hidden><b>Ничего не нашлось</b>Измените запрос или сбросьте фильтры.</div>
    ${C.noteBox(`${ctx.redesign && ctx.redesign.ui && ctx.redesign.ui.showDemoNotices === false ? '' : 'Ассортимент на этой странице демонстрационный (placeholder). '}Актуальный каталог, описания и документы — на <a href="${site.contacts.ext.catalog}" target="_blank" rel="noopener" style="border-bottom:1px dashed;font-weight:600">acosm.ru/catalog</a>.`)}
    <div style="height:clamp(60px,8vw,110px)"></div>
  </div>`;
};
