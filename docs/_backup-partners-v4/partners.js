/* «Партнёрам» — страница v2 («Дверь»): первый экран — стена с аркой и тёмно-синей дверью (тот же дом, что на каталоге), дальше — ниши-полки с упаковками (преимущества), лестница из четырёх ступеней
   (путь партнёра), калькулятор скидки как каменная плита с подиумами порогов и гравированной табличкой результата, заявка — «бумага на камне».
   Тексты, пороги скидок и форма — из прежних источников (data/content.json → partners, data/site.json → discounts/contacts, js/shared.js → formHTML('partner')); расчёт скидки не менялся:
   его ведёт A.pages.partners (js/pages.js), «ориентир» с кнопкой «Запросить условия» дорисовывает js/sales-pages.js. Крючки для скриптов и навигатора Стеллы сохранены:
   [data-calc], #calc-range, #calc-sum, #calc-tier, #calc-save, .calc-main, .tiers > .tier, #calc, #form, .grid.g3 в секции преимуществ. Оформление — css/pg-partners.css, поведение — js/pg-partners.js. */
const S = require('../../js/shared.js');
const {esc, I, rub} = S;

const RANGE_MAX = 500000, RANGE_STEP = 10000, RANGE_START = 100000;      // как в прежнем калькуляторе (js/pages.js читает те же значения из разметки)
/* упаковки в нишах: по одной-три на преимущество (спрайты рендера сайта, assets/showroom) — только украшение, alt пустой */
/* условия сотрудничества — нейтральные формулировки без цифр и сроков: всё, что не подтверждено данными сайта, подтверждает менеджер */
const COND = [['Подбор продукции', 'Менеджер подбирает продукцию под задачи вашего кабинета, салона или клиники.'], ['Работа с ассортиментом', 'Бренды, линии и позиции — в каталоге; состав первой закупки обсуждается на консультации.'],
  ['Обучение специалистов', 'Семинары, мастер-классы и вебинары учебного центра «Астрея».'], ['Сопровождение менеджера', 'Менеджер на связи по вопросам заказов, документов и применения продукции.'], ['Условия поставок', 'Уточняются и подтверждаются менеджером при согласовании условий.']];
const NICHE_PACKS = [['dermatime-bottle'], ['dermatime-box'], ['biretix-jar'], ['dermatime-dropper'], ['bottle', 'biretix-tube', 'box'], ['heliocare-tube']];

module.exports = function partners(ctx, C, P) {
  const {content, site, sortedEvents} = ctx, pt = content.partners, c = site.contacts, u = f => C.u(P, f);
  const today = new Date().toISOString().slice(0, 10), up = sortedEvents.filter(e => e.date >= today), two = (up.length >= 2 ? up : up.concat(sortedEvents.slice(-(2 - up.length)))).slice(0, 2);
  const ds = site.discounts, max = Math.max(...ds.map(d => d.pct)), n = ds.length;
  const pack = id => `<img src="${u('assets/showroom/pack-' + id + '-s.webp')}" alt="" loading="lazy" decoding="async" draggable="false">`;
  const no = i => String(i + 1).padStart(2, '0');
  const {dparts} = S;
  const stella = C.xon('assistant') ? `<button class="pp-ask" type="button" data-act="asst-chip" data-q="Какие условия для партнёров?" data-track="asst_chip" data-place="partners">${I.chat || ''}<span>Спросить Стеллу об условиях</span></button>` : '';

  return `<div class="pp" data-pp>
  <section class="pp-hero" id="top">
    <div class="pp-scene" aria-hidden="true">
      <picture><source media="(max-width:760px)" srcset="${u('assets/showroom/pg-door-m.webp')}"><img src="${u('assets/showroom/pg-door.webp')}" alt="" width="2400" height="1600" fetchpriority="high" decoding="async"></picture>
      <i class="pp-sun"></i>
    </div>
    <div class="pp-in pp-hero-in">
      <div class="pp-copy">
        <span class="pp-eyebrow">${esc(pt.eyebrow)}</span>
        <h1>${esc(pt.h1)}</h1>
        <p class="pp-lead">${esc(pt.lead)}</p>
        <div class="pp-cta">
          <a class="btn btn-fill pp-pill" href="#form" data-act="scroll" data-target="form" data-track="partner_cta" data-place="partners-hero">Оставить заявку ${I.arrow}</a>
          <a class="btn btn-ghost pp-pill" href="tel:${c.phoneRaw}" data-track="phone_click" data-place="partners-hero">${I.phone} ${esc(c.phone)}</a>
        </div>
      </div>
      <a class="pp-plate" href="#calc" data-act="scroll" data-target="calc" data-track="partner_cta" data-place="partners-hero-discount"><small>Скидки по объёму</small><b>до ${max}<i>%</i></b><span>Рассчитать ${I.arrow}</span></a>
    </div>
    <nav class="pp-rail pp-in" aria-label="Разделы страницы">
      <a href="#benefits" data-act="scroll" data-target="benefits"><i>01</i>Преимущества</a>
      <a href="#way" data-act="scroll" data-target="way"><i>02</i>Путь партнёра</a>
      <a href="#calc" data-act="scroll" data-target="calc"><i>03</i>Калькулятор</a>
      <a href="#form" data-act="scroll" data-target="form"><i>04</i>Заявка</a>
    </nav>
  </section>

  <section class="sec pp-sec pp-ben" id="benefits"><div class="pp-in">
    <header class="pp-head"><span class="pp-eyebrow">Преимущества</span><h2>Что вы получаете как партнёр</h2></header>
    <div class="grid g3 pp-niches">${pt.benefits.map((b, i) => `<article class="pp-niche reveal" style="--rd:${(i % 6) * 90}ms">
      <div class="pp-arch" aria-hidden="true"><span class="pp-no">${no(i)}</span><div class="pp-packs pp-k${(NICHE_PACKS[i % NICHE_PACKS.length]).length}">${NICHE_PACKS[i % NICHE_PACKS.length].map(pack).join('')}</div><i class="pp-plinth"></i></div>
      <div class="pp-nt"><span class="pp-ic">${I[b.icon] || (b.icon === 'map' ? I.pin : I.check)}</span><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></div>
    </article>`).join('')}</div>
  </div></section>

  <section class="sec pp-sec pp-way" id="way"><div class="pp-in">
    <header class="pp-head"><span class="pp-eyebrow">Как это работает</span><h2>Четыре шага до сотрудничества</h2></header>
    <ol class="pp-stairs">${pt.steps.map((s, i) => `<li class="pp-step" style="--i:${i};--k:${i + 1}"><div class="pp-sk"><span class="pp-n" aria-hidden="true">${no(i)}</span><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p></div><i class="pp-tread" aria-hidden="true">${i === pt.steps.length - 1 ? '<em class="pp-door"></em>' : ''}</i></li>`).join('')}</ol>
  </div></section>

  <section class="sec pp-sec pp-calc" id="calc"><div class="pp-in pp-calc-in">
    <div class="pp-calc-copy reveal">
      <span class="pp-eyebrow">Условия сотрудничества</span>
      <h2>Условия и скидки по объёму закупки</h2>
      <p>Чем крупнее закупка, тем выгоднее условия. Передвиньте ползунок и посмотрите, какая скидка вам доступна — до ${max}%.</p>
      <ul class="pp-cond" aria-label="Что входит в сотрудничество">${COND.map(([t, x]) => `<li><b>${esc(t)}</b><span>${esc(x)}</span></li>`).join('')}</ul>
      <p class="pp-fine">Расчёт ориентировочный (пример). Точные условия и пороги скидок подтверждает менеджер.</p>
      ${stella}
    </div>
    <div class="pp-slab reveal" data-calc>
      <div class="calc-main">
        <div class="pp-read">
          <div class="pp-sumbox"><small id="pp-sum-l">Сумма закупки</small><span id="calc-sum" aria-labelledby="pp-sum-l">${rub(RANGE_START)}</span></div>
          <div class="pp-bumps"><button class="pp-bump" type="button" data-pp-bump="-1" aria-label="Уменьшить сумму на ${rub(RANGE_STEP)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button><button class="pp-bump" type="button" data-pp-bump="1" aria-label="Увеличить сумму на ${rub(RANGE_STEP)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button></div>
        </div>
        <div class="pp-track">
          <input type="range" id="calc-range" min="0" max="${RANGE_MAX}" step="${RANGE_STEP}" value="${RANGE_START}" aria-label="Сумма закупки">
          <ol class="pp-ticks" aria-hidden="true">${ds.map(d => `<li style="--x:${(d.from / RANGE_MAX).toFixed(4)}"><i></i><span>${d.pct}%</span></li>`).join('')}</ol>
        </div>
        <div class="pp-pres" role="group" aria-label="Быстрый выбор суммы">${[...ds.map(d => d.from), RANGE_MAX].map(v => `<button class="pp-pre" type="button" data-pp-set="${v}" aria-pressed="false">${rub(v)}</button>`).join('')}</div>
        <div class="tiers pp-tiers" role="list" aria-label="Пороги скидок">${ds.map((d, i) => `<div class="tier" role="listitem" data-tier="${i}" style="--h:${Math.round(38 + 62 * (i + 1) / n)}%"><b>${d.pct}%</b><span>от ${rub(d.from)}</span></div>`).join('')}</div>
        <div class="save pp-plaque"><i class="pp-screw" aria-hidden="true"></i><i class="pp-screw r" aria-hidden="true"></i>
          <div class="pp-pl-l"><small>Результат</small><span id="calc-tier"></span></div>
          <div class="pp-pl-r"><small>Экономия</small><b id="calc-save"></b></div>
        </div>
      </div>
    </div>
  </div></section>

  <section class="sec pp-sec pp-edu" id="training"><div class="pp-in pp-edu-in">
    <div class="pp-edu-copy reveal">
      <span class="pp-eyebrow">Обучение партнёров</span>
      <h2>Учебный центр — для вашей команды</h2>
      <p>Семинары, мастер-классы и вебинары для специалистов: очно в Москве, Санкт-Петербурге, Ростове-на-Дону, Симферополе и онлайн. Партнёры обучают команду работать с препаратами на практике.</p>
      <div class="pp-cta"><a class="btn btn-fill pp-pill" href="${u('training.html')}" data-track="training_click" data-place="partners-edu">Расписание ${I.arrow}</a></div>
    </div>
    <ul class="pp-evs">${two.map(e => { const d = dparts(e.date), b = ctx.brandById[e.brand]; return `<li class="pp-ev reveal" data-date="${e.date}">
      <time datetime="${e.date}"><b>${d.d}</b><span>${esc(d.m)}</span></time>
      <div><span class="pp-evt">${esc(e.fmt)} · ${esc(e.city)}</span><h3><a href="${C.eurl(P, e)}" data-track="event_click" data-place="partners-edu">${esc(e.title)}</a></h3>
        <p>${esc(e.time)} · ${esc(e.speaker)}${b ? ` · ${esc(b.name)}` : ''}</p>
        <button class="btn btn-ghost btn-sm" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">Записаться</button></div></li>`; }).join('')}</ul>
  </div></section>

  <section class="sec pp-sec pp-apply" id="form"><div class="pp-in pp-apply-in">
    <div class="pp-ap-copy reveal">
      <span class="pp-eyebrow">Заявка</span>
      <h2>Оставьте заявку на сотрудничество</h2>
      <p>Заполните форму — менеджер свяжется с вами в рабочее время (${esc(c.hours.toLowerCase())}) и обсудит ассортимент, условия и обучение.</p>
      <ul class="pp-contact">
        <li>${I.phone}<a href="tel:${c.phoneRaw}" data-track="phone_click">${esc(c.phone)}</a></li>
        <li>${I.mail}<a href="mailto:${c.email}" data-track="email_click">${esc(c.email)}</a></li>
        <li>${I.clock}<span>${esc(c.hours)}</span></li>
      </ul>
    </div>
    <div class="pp-paper reveal">${S.formHTML('partner', {root: P.root, uid: 'pt'})}</div>
  </div></section>
  </div>`;
};
