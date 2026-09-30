const S = require('../../js/shared.js');
const {esc, I, bstyle} = S;

module.exports = function company(ctx, C, P) {
  const {content, brands, site} = ctx, cp = content.company;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = ctx.sortedEvents.filter(e => e.date >= today).length;
  return `<div class="wrap">
    ${C.pageHead(cp.eyebrow, esc(cp.h1), esc(cp.lead))}
    <section class="about-grid">
      <div class="txt reveal">${cp.who.map(t => `<p>${esc(t)}</p>`).join('')}</div>
      <div class="why reveal">
        <div><i>01</i><span><b>Оригинальная продукция</b><p>Работа с официальным дистрибьютором защищает от подделок.</p></span></div>
        <div><i>02</i><span><b>Учебный центр</b><p>Более 20 лет развиваем методику семинаров: теория и практика в одном дне.</p></span></div>
        <div><i>03</i><span><b>Поддержка в регионах</b><p>Москва, Санкт-Петербург, Ростов-на-Дону и Крым — рядом с партнёрами.</p></span></div>
      </div>
    </section>

    <section class="sec">
      ${C.secHead('Направления', 'Чем занимается компания')}
      ${C.advantageCards(cp.directions, 'g4')}
    </section>

    <section class="sec" style="padding-top:0">
      <div class="split-panel reveal pushin">
        <div><span class="eyebrow">Профессионалам</span><h2>${esc(cp.professionals.title)}</h2>${cp.professionals.text.map(t => `<p>${esc(t)}</p>`).join('')}
          <div class="row" style="margin-top:22px"><a class="btn btn-fill" href="${C.u(P, 'catalog.html')}" data-track="catalog_click" data-place="company">Перейти в каталог ${I.arrow}</a></div></div>
        <ul class="brand-list" aria-label="Бренды">${brands.map(b => `<li><a href="${C.burl(P, b)}" style="${bstyle(b)}">${C.slotLogo(P, b, 3600)}<b>${esc(b.name)}</b><span>${esc(b.tag)}</span></a></li>`).join('')}</ul>
      </div>
    </section>

    <section class="sec" style="padding-top:0">
      <div class="teaser card card-pad reveal">
        <div><span class="eyebrow in">Обучение</span><h2>Учебный центр «Астреи»</h2>
          <p class="muted">Семинары, мастер-классы и вебинары для специалистов: очно в четырёх городах и онлайн.${upcoming ? ` Ближайших мероприятий в расписании: ${upcoming}.` : ''}</p></div>
        <div class="row"><a class="btn btn-ghost" href="${C.u(P, 'training.html')}">Расписание ${I.arrow}</a></div>
      </div>
    </section>

    <section class="sec" style="padding-top:0">
      ${C.secHead('Сотрудничество', 'Преимущества работы с Астреей')}
      ${C.advantageCards(content.advantages)}
    </section>

    <section class="sec" style="padding-top:0">
      ${C.secHead('Представительства', 'Мы рядом', C.lnk(C.u(P, 'contacts.html'), 'Все контакты'))}
      <div class="cities">${site.offices.slice(0, 2).map(C.officeCard).join('')}</div>
    </section>
  </div>
  ${C.ctaBand(P, 'company-cta')}`;
};
