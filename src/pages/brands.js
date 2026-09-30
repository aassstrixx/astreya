const S = require('../../js/shared.js');
const {esc, I} = S;

/* Страница «Бренды» и страница отдельного бренда */
function brandsPage(ctx, C, P) {
  const {brands, tasks} = ctx;
  return `<div class="wrap" data-brands>
    ${C.pageHead('Бренды', 'Бренды профессиональной косметики', 'Портфель «Астреи»: испанская профессиональная косметика, линии Cantabria Labs и аппаратное решение EVA.')}
    <div class="toolbar reveal">
      <div class="tb-top"><label class="search"><span class="sr">Поиск по брендам</span>${I.search}<input id="br-q" type="search" placeholder="Название бренда или направление" autocomplete="off"></label></div>
      <div class="tb-row"><span class="tb-lab">Задача</span><div class="chips" id="br-tasks">${C.chip('Любая', 'br-task', 'all', true)}${tasks.map(t => C.chip(esc(t.label), 'br-task', t.id, false)).join('')}</div></div>
    </div>
    <h2 class="sr">Список брендов</h2>
    <div class="grid g3" id="br-grid">${brands.map(b => C.brandCardList(P, b)).join('')}</div>
    <div class="empty" id="br-empty" hidden><b>Бренды не найдены</b>Измените запрос или выберите другую задачу.</div>
    <div style="height:clamp(60px,8vw,110px)"></div>
  </div>`;
}

function brandPage(ctx, C, P, b) {
  const {brands, products, cats, tasks} = ctx;
  const i = brands.indexOf(b), n = brands.length, prev = brands[(i - 1 + n) % n], next = brands[(i + 1) % n];
  const prods = products.filter(p => p.brand === b.id);
  const groups = cats.map(c => [c, prods.filter(p => p.cat === c.id)]).filter(x => x[1].length);
  const facts = [...(b.country ? [['Страна', b.country + (b.countryNote ? ` (${b.countryNote})` : '')]] : [['Страна', 'Уточняется']]), ...b.facts.filter(f => f[0] !== 'Страна')];
  const events = ctx.sortedEvents.filter(e => e.brand === b.id);
  const icons = ['layers', 'shield', 'book', 'check'];
  const adv = [{icon: 'shield', title: 'Оригинальная продукция', text: `${b.name} поставляется официальным дистрибьютором «Астрея».`},
    ...b.facts.filter(f => !['Страна', 'Концерн', 'Поставка'].includes(f[0])).slice(0, 2).map((f, k) => ({icon: icons[k % icons.length], title: f[0], text: f[1]})),
    {icon: 'users', title: 'Поддержка специалистов', text: 'Консультации менеджеров и материалы учебного центра «Астреи».'}];
  return `<div class="wrap" style="${S.bstyle(b)}">
    <section class="b-hero">
      ${C.crumbs(P, [['Главная', 'index.html'], ['Бренды', 'brands.html'], [b.name, `brands/${b.id}.html`]])}
      <div class="b-line reveal"><span class="eyebrow">${esc(b.group)}${b.country && b.country !== b.group ? ' · ' + esc(b.country) : ''}</span></div>
      <h1 class="b-title${b.logo ? ' b-title-logo' : ''} reveal">${b.logo ? C.heroLogo(P, b) : esc(b.name)}</h1>
      <p class="b-sub reveal">${esc(b.tag)}</p>
      <div class="row reveal" style="margin-top:34px">
        <a class="btn btn-fill" href="${C.u(P, 'catalog.html')}?brand=${b.id}" data-track="catalog_click" data-place="brand-hero">Смотреть ассортимент ${I.arrow}</a>
        ${partnerLink(C, P, 'brand-hero')}
        <a class="btn btn-lnk" href="${esc(b.site)}" target="_blank" rel="noopener">Каталог на acosm.ru ${I.external}</a>
      </div>
      <div class="b-cols">
        <div class="txt reveal">${b.long.map(p => `<p>${esc(p)}</p>`).join('')}<div class="tasks-line" style="margin-top:24px">${b.tasks.map(t => C.tag(ctx.taskById[t].label, 'blue')).join('')}</div></div>
        <div class="facts reveal">${facts.map(([k, v]) => `<div class="fact"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>
      </div>
    </section>

    <section class="sec" style="padding-top:clamp(30px,4vw,56px)">
      ${C.secHead('Преимущества', `Почему ${esc(b.name)}`)}
      ${C.advantageCards(adv, 'g4')}
    </section>

    ${groups.length ? `<section class="sec" style="padding-top:0">
      ${C.secHead('Продуктовые линейки', `Направления ${esc(b.name)}`)}
      <div class="grid g3">${groups.map(([c, list]) => `<a class="card hov linecard card-pad reveal" href="${C.u(P, 'catalog.html')}?brand=${b.id}&cat=${c.id}" data-track="catalog_click" data-place="brand-lines">
        <span class="tag blue">${list.length} ${S.plural(list.length, 'позиция', 'позиции', 'позиций')}</span><h3>${esc(c.name)}</h3>
        <p>${esc(list.slice(0, 3).map(p => p.name).join(' · '))}${list.length > 3 ? ' …' : ''}</p><span class="lnk">В каталоге ${I.arrow}</span></a>`).join('')}</div>
    </section>` : ''}

    <section class="sec" style="padding-top:0">
      ${C.secHead('Ассортимент', `Товары ${esc(b.name)}`, C.lnk(`${C.u(P, 'catalog.html')}?brand=${b.id}`, 'В каталоге'))}
      <div class="grid g3">${prods.map((p, k) => C.productCard(P, p, k)).join('')}</div>
    </section>

    ${events.length ? `<section class="sec" style="padding-top:0">
      ${C.secHead('Обучение', `Мероприятия по ${esc(b.name)}`, C.lnk(C.u(P, 'training.html'), 'Всё расписание'))}
      <div class="grid g3 events-grid">${events.slice(0, 3).map(e => C.eventCard(P, e)).join('')}</div>
    </section>` : ''}

    <section class="sec" style="padding-top:0">
      <div class="cta-band cta-brand reveal pushin">
        <div class="cb-copy">
          <span class="eyebrow">Сотрудничество</span>
          <h2>${esc(b.name)} для вашего кабинета</h2>
          <p>Расскажите о своей организации — подберём ассортимент, условия поставки и обучение.</p>
          <div class="row"><a class="btn btn-light" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="brand-cta">Стать партнёром ${I.arrow}</a>
            <button class="btn btn-ghost-inv" type="button" data-act="form" data-type="question" data-ref="Бренд ${esc(b.name)}: запрос условий">Запросить условия</button></div>
        </div>
        <div class="cb-art" aria-hidden="true"><i class="cb-ring"></i><i class="cb-pearl"></i></div>
      </div>
      <nav class="sib" aria-label="Соседние бренды">
        <a class="reveal" href="${C.burl(P, prev)}" style="${S.bstyle(prev)}"><small>${I.back} Предыдущий</small><b>${esc(prev.name)}</b></a>
        <a class="nx reveal" href="${C.burl(P, next)}" style="${S.bstyle(next)}"><small>Следующий ${I.arrow}</small><b>${esc(next.name)}</b></a>
      </nav>
    </section>
  </div>`;
}

function partnerLink(C, P, place) {
  return `<a class="btn btn-ghost" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="${place}">Стать партнёром</a>`;
}

module.exports = {brandsPage, brandPage};
