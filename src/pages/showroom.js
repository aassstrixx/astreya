/* Каталог в виде шоурума (data/redesign.json → extras.showroom; стили — css/showroom.css, поведение — js/showroom.js).
   Здесь — только разметка: панель фильтров слева, сцена (SVG-архитектура, подиумы и товары рисует js/showroom.js), «Рекомендуем», полоса преимуществ и — ниже — прежний полный список карточек.
   Всё, на что опирается остальной сайт (#results, #f-brand/#f-cat/#f-task/#f-kind/#f-sort, #cat-q, .cat-tile, #cat-grid .pcard, #res-count, #cat-reset, #cat-empty), остаётся на месте. */
const fs = require('fs');
const path = require('path');
const S = require('../../js/shared.js');
const {esc, I} = S;

/* ---------- архитектура сцены: один SVG (холст 1000×680), только фон — подиумы и товары лежат поверх обычным HTML ----------
   Исходник — src/partials/showroom-arch.svg (редактируется в любом векторном редакторе); сборка встраивает его в страницу каталога и добавляет служебные атрибуты. */
const ARCH = fs.readFileSync(path.join(__dirname, '..', 'partials', 'showroom-arch.svg'), 'utf8');
const arch = () => ARCH.replace(/^<\?xml[^>]*\?>\s*/, '').replace(/<!--[\s\S]*?-->\s*/g, '').trim()
  .replace(/<svg\b([^>]*)>/, (m, a) => `<svg class="shw-arch" aria-hidden="true" focusable="false"${a.replace(/\sxmlns="[^"]*"/, '')}>`);

module.exports = function showroom(ctx, C, P) {
  const {cats, tasks, kinds, brands, products, content} = ctx;
  const site = ctx.site || {};
  const cnt = {brand: {}, cat: {}, task: {}, kind: {}};
  products.forEach(p => { cnt.brand[p.brand] = (cnt.brand[p.brand] || 0) + 1; cnt.cat[p.cat] = (cnt.cat[p.cat] || 0) + 1; cnt.kind[p.kind] = (cnt.kind[p.kind] || 0) + 1; p.tasks.forEach(t => { cnt.task[t] = (cnt.task[t] || 0) + 1; }); });
  const assistant = C.xon('assistant');
  const GROUPS = [
    ['brand', 'Бренд', 'f-brand', 'Все бренды', brands.map(b => [b.id, b.name])],
    ['cat', 'Категория', 'f-cat', 'Все категории', cats.map(c => [c.id, c.name])],
    ['task', 'Назначение', 'f-task', 'Любое назначение', tasks.map(t => [t.id, t.label])],
    ['kind', 'Тип продукта', 'f-kind', 'Все типы', kinds.map(k => [k.id, k.name])]
  ];
  const LIM = 6;
  const group = ([key, label, id, all, opts], i) => {
    const open = i < 2;
    return `<div class="shw-grp${open ? ' is-open' : ''}" data-key="${key}">
      <button class="shw-gh" type="button" data-act="shw-grp" aria-expanded="${open}" aria-controls="shw-go-${key}"><span>${label}</span>${I.chevron}</button>
      <div class="shw-go" id="shw-go-${key}"><div class="shw-gi" role="group" aria-label="${label}">
        ${opts.map(([v, t], j) => `<button class="shw-o${j >= LIM ? ' xtra' : ''}" type="button" data-act="shw-opt" data-key="${key}" data-v="${esc(v)}" aria-pressed="false"><i class="shw-ck" aria-hidden="true">${I.check}</i><span class="t">${esc(t)}</span><em>${cnt[key][v] || 0}</em></button>`).join('')}
        ${opts.length > LIM ? `<button class="shw-more" type="button" data-act="shw-more" aria-expanded="false">Ещё ${opts.length - LIM}</button>` : ''}
      </div></div>
      <div class="fld shw-fld"><label for="${id}">${label}</label><div class="sel"><select id="${id}">${[['all', all], ...opts].map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>${I.chevron}</div></div>
    </div>`;
  };
  const sort = `<div class="fld shw-sort"><label for="f-sort">Сортировка</label><div class="sel"><select id="f-sort">${[['def', 'По умолчанию'], ['new', 'Сначала новинки'], ['az', 'По названию А–Я'], ['brand', 'По бренду']].map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>${I.chevron}</div></div>`;
  const reset = `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.8 10a6.2 6.2 0 1 0 1.9-4.4M3.5 3.6v3.2h3.2"/></svg>`;

  const aside = `<aside class="shw-aside" aria-label="Фильтры каталога">
    <div class="toolbar shw-panel" id="results">
      <div class="tb-top">
        <label class="search"><span class="sr">Поиск по каталогу</span>${I.search}<input id="cat-q" type="search" placeholder="Поиск по каталогу…" autocomplete="off"></label>
        <button class="btn btn-ghost btn-sm filters-toggle" type="button" data-act="filters" aria-expanded="false" aria-controls="filters">${I.filter} Фильтры <span class="badge" id="f-badge" hidden>0</span></button>
      </div>
      <div class="filters shw-filters" id="filters">
        ${GROUPS.map(group).join('')}
        ${sort}
      </div>
      <div class="active-filters" id="active-filters" hidden></div>
      <div class="shw-aside-foot"><span class="shw-count" data-shw-count>${products.length} из ${products.length}</span><button class="shw-reset" type="button" data-act="cat-reset" data-shw-reset hidden>${reset}Сбросить фильтры</button></div>
    </div>
  </aside>`;

  /* «Рекомендуем» — товары с отметкой «В подборке» (featured) из админки; новинки — первыми */
  const feat = products.filter(p => p.featured).sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  const popCard = p => {
    const b = ctx.brandById[p.brand], k = ctx.kindById[p.kind];
    return `<article class="shw-pc" role="listitem" style="${S.bstyle(b)}" data-id="${p.id}">
      ${p.isNew ? '<span class="shw-pc-tag">Новинка</span>' : ''}
      ${C.art(P, p)}
      <div class="shw-pc-b">
        <span class="shw-pc-br">${esc(b.name)}</span>
        <h3><a class="stretch" href="${C.purl(P, p)}" data-track="product_card_click" data-place="showroom_pop" data-product="${p.id}">${esc(p.name)}</a></h3>
        <span class="shw-pc-k">${esc(k ? k.name : '')}</span>
        <div class="shw-pc-f"><span class="shw-pc-v">${esc(p.volume || '')}</span><button class="shw-ask z3" type="button" data-act="form" data-type="product" data-ref="${p.id}">Запросить ${I.arrow}</button></div>
      </div>
    </article>`;
  };
  const pop = feat.length ? `<section class="shw-pop" aria-labelledby="shw-pop-t">
      <div class="shw-pop-h"><h2 id="shw-pop-t">Рекомендуем</h2><a class="lnk" href="#shw-all" data-act="shw-all">Смотреть весь список ${I.arrow}</a></div>
      <div class="shw-pop-w">
        <button class="shw-nav prev" type="button" data-act="shw-pop-nav" data-dir="-1" aria-label="Назад" disabled>${I.arrow}</button>
        <div class="shw-pop-t" role="list" tabindex="0" aria-label="Рекомендуем">${feat.map(popCard).join('')}</div>
        <button class="shw-nav next" type="button" data-act="shw-pop-nav" data-dir="1" aria-label="Вперёд">${I.arrow}</button>
      </div>
    </section>` : '';

  /* полоса преимуществ — тексты сайта (data/content.json → advantages), ничего не придумано */
  const advs = (content.advantages || []).filter(a => ['Оригинальная продукция', 'Учебный центр', 'Поддержка специалистов'].includes(a.title));
  const adv = `<div class="shw-adv" aria-label="Преимущества">
      ${advs.map(a => `<div class="shw-av"><span class="shw-av-i" aria-hidden="true">${I[a.icon] || ''}</span><span class="shw-av-t"><b>${esc(a.title)}</b><span>${esc(a.text)}</span></span></div>`).join('')}
      ${assistant ? `<button class="shw-help" type="button" data-act="gal-help"><svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 2.5l1.7 4.3 4.3 1.7-4.3 1.7L10 14.5l-1.7-4.3L4 8.5l4.3-1.7zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>Помочь с подбором</button>` : ''}
    </div>`;

  const head = C.pageHead('Каталог', 'Каталог профессиональной косметики', 'Направления, бренды и задачи — фильтруйте ассортимент так, как думает специалист.');
  const pills = `<div class="cat-tiles shw-pills" id="categories" role="group" aria-label="Категории">
      <button type="button" class="shw-all on" data-act="cat-tile" data-id="all" aria-pressed="true"><b>Все</b></button>
      ${cats.map(c => {
        const n = products.filter(p => p.cat === c.id).length;
        return `<button type="button" class="cat-tile" data-act="cat-tile" data-id="${c.id}" aria-pressed="false"><b>${esc(c.name)}</b><span>${n}</span></button>`;
      }).join('')}
    </div>`;

  const scene = `<section class="shw" data-shw aria-label="Витрина каталога">
      <div class="shw-room">
        <div class="shw-top">
          <div class="shw-head">${head}${pills}</div>
          <aside class="shw-card" data-shw-card aria-live="polite" aria-label="Выбранный товар"></aside>
        </div>
        <div class="shw-stage" data-shw-stage role="group" aria-label="Товары на подиумах">
          ${arch()}
          <div class="shw-base" aria-hidden="true"></div>
          <div class="shw-empty" data-shw-empty hidden><b>Ничего не нашлось</b><span>Измените запрос или сбросите фильтры.</span><button class="btn btn-ghost btn-sm" type="button" data-act="cat-reset">Сбросить фильтры</button></div>
        </div>
        <div class="shw-pager" data-shw-pager hidden>
          <button class="shw-nav prev" type="button" data-act="shw-page" data-dir="-1" aria-label="Предыдущие товары">${I.arrow}</button>
          <span class="shw-pg" data-shw-pg aria-live="polite"></span>
          <button class="shw-nav next" type="button" data-act="shw-page" data-dir="1" aria-label="Следующие товары">${I.arrow}</button>
        </div>
      </div>
    </section>`;

  return `<div class="wrap shw-wrap" data-catalog data-showroom>
    <div class="shw-layout">
      ${aside}
      <div class="shw-main">
        ${scene}
        ${pop}
        ${adv}
      </div>
    </div>

    <div data-kits-anchor></div>
    <div class="shw-all-h" id="shw-all"><span class="eyebrow">Полный список</span><h2>Весь ассортимент</h2></div>
    <div class="res-line"><span id="res-count" aria-live="polite">Найдено: ${products.length} из ${products.length}</span><button class="lnk" type="button" data-act="cat-reset" id="cat-reset" hidden>Сбросить фильтры</button></div>
    <h2 class="sr">Товары каталога</h2>
    <div class="grid g4" id="cat-grid">${products.map((p, i) => C.productCard(P, p, i)).join('')}</div>
    <div class="empty" id="cat-empty" hidden><b>Ничего не нашлось</b>Измените запрос или сбросьте фильтры.</div>
    ${C.noteBox(`${ctx.redesign && ctx.redesign.ui && ctx.redesign.ui.showDemoNotices === false ? '' : 'Ассортимент на этой странице демонстрационный (placeholder). '}Полный каталог, описания и документы пришлёт менеджер — оставьте заявку или спросите Стеллу.`)}
    <div style="height:clamp(60px,8vw,110px)"></div>
  </div>`;
};
