/* «Партнёрам» — страница v5 («Люди и поставки»): первый экран — блендер-рендер галереи с арочными окнами (assets/partners/hero*.webp, цветокор по залу «Обучения» — tools/partners-assets/grade_hero.py) прежней компактной высоты и тёмная стеклянная карточка скидки (как у «Обучения»); ниже —
   «Кому подходит» (вкладки со своим фото), преимущества мозаикой с настоящими фото, путь партнёра линией с иконками (без номеров), бренды, калькулятор скидки (прежний, каменная плита),
   обучение партнёров с ближайшими встречами и вопросы и ответы в одном разделе, заявка. Фото — из банка сайта (assets/photos, assets/news), подписи не называют людей на снимках.
   Тексты, пороги скидок и форма — из data/content.json → partners, data/site.json → discounts/contacts, js/shared.js → formHTML('partner'); расчёт скидки не менялся:
   его ведёт A.pages.partners (js/pages.js), «ориентир» с кнопкой «Запросить условия» дорисовывает js/sales-pages.js. Крючки для скриптов и навигатора Стеллы сохранены:
   [data-calc], #calc-range, #calc-sum, #calc-tier, #calc-save, .calc-main, .tiers > .tier, #calc, #form, #benefits, #way, .grid.g3 в секции преимуществ.
   Оформление — css/pg-partners.css, поведение — js/pg-partners.js. Прежняя версия («Дверь») — git-истории (резервные копии папок удалены 22.11.2026). */
const S = require('../../js/shared.js');
const {T} = require('../texts.js');
const {esc, I, rub} = S;

const RANGE_MAX = 500000, RANGE_STEP = 10000, RANGE_START = 100000;      // как в прежнем калькуляторе (js/pages.js читает те же значения из разметки)
/* условия сотрудничества — нейтральные формулировки без цифр и сроков: всё, что не подтверждено данными сайта, подтверждает менеджер */
const COND = [[T('partners.cond.s'), T('partners.cond.s2')], [T('partners.cond.s3'), T('partners.cond.s4')],
  [T('partners.cond.s5'), T('partners.cond.s6')], [T('partners.cond.s7'), T('partners.cond.s8')], [T('partners.cond.s9'), T('partners.cond.s10')]];
const STEP_ICON = ['doc', 'phone', 'layers', 'book'];

module.exports = function partners(ctx, C, P) {
  const {content, site, sortedEvents, brands} = ctx, pt = content.partners, c = site.contacts, u = f => C.u(P, f);
  const today = new Date().toISOString().slice(0, 10), up = sortedEvents.filter(e => e.date >= today), two = (up.length >= 2 ? up : up.concat(sortedEvents.slice(-(2 - up.length)))).slice(0, 2);
  const ds = site.discounts, max = Math.max(...ds.map(d => d.pct)), n = ds.length;
  const {dparts} = S;
  /* настоящие фото: размер в атрибутах — без скачков вёрстки; позиция кадра — object-position */
  const img = (f, w, h, cls, pos, alt) => `<img${cls ? ` class="${cls}"` : ''} src="${u(f)}" alt="${esc(alt || '')}" width="${w}" height="${h}" loading="lazy" decoding="async" draggable="false"${pos ? ` style="object-position:${pos}"` : ''}>`;
  const PH = {team: ['assets/photos/photo-02-about.webp', 800, 533], pair: ['assets/photos/photo-02b-about.webp', 768, 768], solo: ['assets/photos/photo-02c-about.webp', 683, 1024], care: ['assets/news/ph-care.webp', 600, 900],
    semA: ['assets/news/ph-seminar-a.webp', 960, 540], semB: ['assets/news/ph-seminar-b.webp', 960, 540], present: ['assets/news/ph-presenter.webp', 540, 720]};
  const ph = (k, cls, pos, alt) => img(PH[k][0], PH[k][1], PH[k][2], cls, pos, alt);
  const bottles = `<span class="pp-bot" aria-hidden="true">${img('assets/photos/dermatime-micellar.webp', 279, 900, '')}${img('assets/photos/iraltone-shampoo.webp', 329, 900, '')}${img('assets/photos/keenwell-mask.webp', 397, 900, '')}</span>`;
  const stella = C.xon('assistant') ? `<button class="pp-ask" type="button" data-act="asst-chip" data-q="${T('partners.hero.q')}" data-track="asst_chip" data-place="partners">${I.chat || ''}<span>${T('partners.hero.t')}</span></button>` : '';
  const tx = s => esc(String(s).replace('{max}', max));
  /* фоновые текстуры разделов (по две на раздел, поверх собственного оттенка раздела и под содержимым): redesign.json → backdrops.pages.partners.patterns = {id раздела: [[текстура, место, сила 3…10, сдвиг сверху %]]} */
  const PAT = ((((ctx.redesign || {}).backdrops || {}).pages || {}).partners || {}).patterns || {};
  const bd = k => (PAT[k] || []).length ? `<div class="pp-bd" aria-hidden="true">${PAT[k].map(t => `<i data-bd="${esc(t[0])}" data-bd-pos="${esc(t[1])}" data-bd-o="${+t[2] || 8}"${t[3] ? ` style="top:${+t[3]}%"` : ''}></i>`).join('')}</div>` : '';
  const BEN_K = ['prod', 'learn', 'disc', 'mgr', 'range', 'geo'];                          // вид плитки мозаики по порядку преимуществ
  const tile = (b, i) => {
    const k = BEN_K[i % BEN_K.length], icon = `<span class="pp-ic">${I[b.icon] || (b.icon === 'map' ? I.pin : I.check)}</span>`;
    const pic = k === 'prod' ? bottles : k === 'learn' ? `<span class="pp-bph">${ph('semB', '', '50% 40%')}</span>` : k === 'mgr' ? `<span class="pp-bph pp-bph-s">${ph('pair', '', '50% 28%')}</span>` : '';
    const big = k === 'disc' ? `<span class="pp-big" aria-hidden="true">${T('common.labels.upto', {n: max})}<i>%</i></span>` : '';
    const cities = k === 'geo' ? `<ul class="pp-cities" aria-label="${T('partners.hero.aria')}">${['Москва', 'Санкт-Петербург', 'Ростов-на-Дону', 'Симферополь', 'Онлайн'].map(x => `<li>${x}</li>`).join('')}</ul>` : '';
    return `<article class="pp-bt pp-bt-${k} reveal" style="--rd:${(i % 3) * 90}ms">${pic}<div class="pp-btx">${big}${icon}<h3>${esc(b.title)}</h3><p>${tx(b.text)}</p></div>${cities}</article>`;
  };
  const aud = pt.audience || [];
  const audPhoto = a => a.photo ? ph(Object.keys(PH).find(k => PH[k][0] === a.photo) || 'care', '', a.id === 'cosmetologist' ? '50% 30%' : a.id === 'clinic' ? '50% 40%' : '50% 24%') : `<span class="pp-bot pp-bot-l" aria-hidden="true">${img('assets/photos/dermatime-micellar.webp', 279, 900, '')}${img('assets/photos/iraltone-shampoo.webp', 329, 900, '')}${img('assets/photos/keenwell-mask.webp', 397, 900, '')}</span>`;
  const bcell = b => `<a class="pp-bc reveal" href="${C.burl(P, b)}" data-track="brand_click" data-place="partners-brands" aria-label="${esc(b.name)}">${b.logo ? `<img src="${u(b.logo)}" alt="${esc(b.name)}" loading="lazy" decoding="async">` : `<b class="pp-bname">${esc(b.name)}</b>`}</a>`;

  return `<div class="pp" data-pp>
  <section class="pp-hero" id="top">
    <div class="pp-scene" aria-hidden="true">
      <picture><source media="(max-width:760px)" srcset="${u('assets/partners/hero-m.webp')}"><img src="${u('assets/partners/hero.webp')}" alt="" width="1800" height="1012" fetchpriority="high" decoding="async" draggable="false"></picture>
    </div>
    <div class="pp-in pp-hero-in">
      <div class="pp-copy">
        <span class="pp-eyebrow">${esc(pt.eyebrow)}</span>
        <h1>${esc(pt.h1)}</h1>
        <p class="pp-lead">${esc(pt.lead)}</p>
        <div class="pp-cta">
          <a class="btn btn-fill pp-pill" href="#form" data-act="scroll" data-target="form" data-track="partner_cta" data-place="partners-hero">${T('partners.hero.a')} ${I.arrow}</a>
          <a class="btn btn-ghost pp-pill" href="tel:${c.phoneRaw}" data-track="phone_click" data-place="partners-hero">${I.phone} ${esc(c.phone)}</a>
        </div>
      </div>
      <a class="pp-plate" href="#calc" data-act="scroll" data-target="calc" data-track="partner_cta" data-place="partners-hero-discount"><small>${T('partners.hero.sm')}</small><b>${T('common.labels.upto', {n: max})}<i>%</i></b><em>${T('partners.hero.em')}</em><span>${T('partners.hero.t2')} ${I.arrow}</span></a>
    </div>
    <nav class="pp-facts pp-in" aria-label="${T('partners.hero.aria2')}">
      <a href="#benefits" data-act="scroll" data-target="benefits">${I.shield}<span>${T('partners.hero.t3')}</span></a>
      <a href="#audience" data-act="scroll" data-target="audience">${I.users}<span>${T('partners.hero.t4')}</span></a>
      <a href="#calc" data-act="scroll" data-target="calc">${I.percent}<span>${T('partners.hero.t5')} ${max} %</span></a>
      <a href="#training" data-act="scroll" data-target="training">${I.book}<span>${T('partners.hero.t6')}</span></a>
    </nav>
  </section>

  <section class="sec pp-sec pp-aud" id="audience">${bd('audience')}<div class="pp-in">
    <header class="pp-head"><div class="pp-hl"><span class="pp-eyebrow">${T('partners.for.eyebrow')}</span><h2>${T('partners.for.h2')}</h2></div><p class="pp-side">${T('partners.for.p')}</p></header>
    <div class="pp-aud-box reveal" data-pp-tabs>
      <div class="pp-tabs" role="tablist" aria-label="${T('partners.for.aria')}">${aud.map((a, i) => `<button class="pp-tab" type="button" role="tab" id="pp-tab-${a.id}" aria-controls="pp-pan-${a.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-pp-tab="${i}">${esc(a.tab)}</button>`).join('')}</div>
      ${aud.map((a, i) => `<div class="pp-pan" role="tabpanel" id="pp-pan-${a.id}" aria-labelledby="pp-tab-${a.id}"${i === 0 ? '' : ' hidden'}>
        <figure class="pp-pan-ph">${audPhoto(a)}</figure>
        <div class="pp-pan-tx"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><ul class="pp-chips">${a.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
          <a class="btn btn-fill pp-pill" href="#form" data-act="scroll" data-target="form" data-track="partner_cta" data-place="partners-audience-${a.id}">${T('partners.hero.a')} ${I.arrow}</a></div></div>`).join('')}
    </div>
  </div></section>

  <section class="sec pp-sec pp-ben" id="benefits">${bd('benefits')}<div class="pp-in">
    <header class="pp-head"><div class="pp-hl"><span class="pp-eyebrow">${T('partners.benefits.eyebrow')}</span><h2>${T('partners.benefits.h2')}</h2></div><p class="pp-side">${T('partners.benefits.p')}</p></header>
    <div class="grid g3 pp-bento">${pt.benefits.map(tile).join('')}</div>
  </div></section>

  <section class="sec pp-sec pp-way" id="way">${bd('way')}<div class="pp-in">
    <header class="pp-head"><div class="pp-hl"><span class="pp-eyebrow">${T('partners.steps.eyebrow')}</span><h2>${T('partners.steps.h2')}</h2></div><p class="pp-side">${T('partners.steps.p')}</p></header>
    <ol class="pp-path">${pt.steps.map((s, i) => `<li class="pp-st reveal" style="--rd:${i * 110}ms"><span class="pp-dot" aria-hidden="true">${I[STEP_ICON[i % STEP_ICON.length]] || I.check}</span><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p></li>`).join('')}</ol>
  </div></section>

  <section class="sec pp-sec pp-brands" id="brands">${bd('brands')}<div class="pp-in">
    <header class="pp-head"><div class="pp-hl"><span class="pp-eyebrow">${T('partners.brands.eyebrow')}</span><h2>${T('partners.brands.h2')}</h2></div><p class="pp-side">${T('partners.brands.p')}</p><a class="btn btn-ghost pp-pill pp-hbtn" href="${u('brands.html')}" data-track="brands_click" data-place="partners-brands">${T('partners.brands.a')} ${I.arrow}</a></header>
    <div class="pp-bwall">${brands.map(bcell).join('')}</div>
  </div></section>

  <section class="sec pp-sec pp-calc" id="calc">${bd('calc')}<div class="pp-in pp-calc-in">
    <div class="pp-calc-copy reveal">
      <span class="pp-eyebrow">${T('partners.terms.eyebrow')}</span>
      <h2>${T('partners.terms.h2')}</h2>
      <p>${T('partners.terms.p')} ${max}%.</p>
      <ul class="pp-cond" aria-label="${T('partners.terms.aria')}">${COND.map(([t, x]) => `<li><b>${esc(t)}</b><span>${esc(x)}</span></li>`).join('')}</ul>
      <p class="pp-fine">${T('partners.terms.p2')}</p>
      ${stella}
    </div>
    <div class="pp-slab reveal" data-calc>
      <div class="calc-main">
        <div class="pp-read">
          <div class="pp-sumbox"><small id="pp-sum-l">${T('partners.terms.sm')}</small><span id="calc-sum" aria-labelledby="pp-sum-l">${rub(RANGE_START)}</span></div>
          <div class="pp-bumps"><button class="pp-bump" type="button" data-pp-bump="-1" aria-label="${T('common.aria.bumpDn', {step: rub(RANGE_STEP)})}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button><button class="pp-bump" type="button" data-pp-bump="1" aria-label="${T('common.aria.bumpUp', {step: rub(RANGE_STEP)})}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button></div>
        </div>
        <div class="pp-track">
          <input type="range" id="calc-range" min="0" max="${RANGE_MAX}" step="${RANGE_STEP}" value="${RANGE_START}" aria-label="${T('partners.terms.sm')}">
          <ol class="pp-ticks" aria-hidden="true">${ds.map(d => `<li style="--x:${(d.from / RANGE_MAX).toFixed(4)}"><i></i><span>${d.pct}%</span></li>`).join('')}</ol>
        </div>
        <div class="pp-pres" role="group" aria-label="${T('partners.terms.aria2')}">${[...ds.map(d => d.from), RANGE_MAX].map(v => `<button class="pp-pre" type="button" data-pp-set="${v}" aria-pressed="false">${rub(v)}</button>`).join('')}</div>
        <div class="tiers pp-tiers" role="list" aria-label="${T('partners.terms.aria3')}">${ds.map((d, i) => `<div class="tier" role="listitem" data-tier="${i}" style="--h:${Math.round(38 + 62 * (i + 1) / n)}%"><b>${d.pct}%</b><span>${T('common.labels.from', {sum: rub(d.from)})}</span></div>`).join('')}</div>
        <div class="save pp-plaque"><i class="pp-screw" aria-hidden="true"></i><i class="pp-screw r" aria-hidden="true"></i>
          <div class="pp-pl-l"><small>${T('partners.terms.sm2')}</small><span id="calc-tier"></span></div>
          <div class="pp-pl-r"><small>${T('partners.terms.sm3')}</small><b id="calc-save"></b></div>
        </div>
      </div>
    </div>
  </div></section>

  <section class="sec pp-sec pp-edu" id="training">${bd('training')}<div class="pp-in">
    <header class="pp-head"><div class="pp-hl"><span class="pp-eyebrow">${T('partners.edu.eyebrow')}</span><h2>${T('partners.edu.h2')}</h2></div><p class="pp-side">${T('partners.edu.p')}</p></header>
    <div class="pp-tf">
      <div class="pp-tf-l">
        <figure class="pp-edu-ph reveal">${ph('semA', '', '50% 36%')}<figcaption>${T('partners.edu.cap')}</figcaption></figure>
        <div class="pp-edu-copy reveal">
          <h3>${T('partners.edu.h3')}</h3>
          <p>${T('partners.edu.p2')}</p>
          <div class="pp-cta"><a class="btn btn-fill pp-pill" href="${u('training.html')}" data-track="training_click" data-place="partners-edu">${T('partners.edu.a')} ${I.arrow}</a></div>
        </div>
        <ul class="pp-evs">${two.map(e => { const d = dparts(e.date), b = ctx.brandById[e.brand]; return `<li class="pp-ev reveal" data-date="${e.date}">
          <time datetime="${e.date}"><b>${d.d}</b><span>${esc(d.m)}</span></time>
          <div><span class="pp-evt">${esc(e.fmt)} · ${esc(e.city)}</span><h3><a href="${C.eurl(P, e)}" data-track="event_click" data-place="partners-edu">${esc(e.title)}</a></h3>
            <p>${esc(e.time)} · ${esc(e.speaker)}${b ? ` · ${esc(b.name)}` : ''}</p>
            <button class="btn btn-ghost btn-sm" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">${T('partners.edu.btn')}</button></div></li>`; }).join('')}</ul>
      </div>
      <div class="pp-tf-r" id="faq">
        <h3 class="pp-qh">${T('partners.edu.h32')}</h3>
        <div class="pp-qa">${(pt.faq || []).map((f, i) => `<details class="pp-q reveal" style="--rd:${(i % 3) * 70}ms"${i === 0 ? ' open' : ''}><summary><span>${esc(f.q)}</span><i aria-hidden="true"></i></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
        <div class="pp-qcta reveal"><b>${T('partners.edu.b')}</b><span>${T('partners.edu.t')} ${esc(c.hours)}</span>
          <div class="pp-qb"><a class="btn pp-qb-f" href="#form" data-act="scroll" data-target="form" data-track="partner_cta" data-place="partners-faq">${T('partners.hero.a')} ${I.arrow}</a><a class="btn pp-qb-g" href="tel:${c.phoneRaw}" data-track="phone_click" data-place="partners-faq">${I.phone} ${esc(c.phone)}</a></div></div>
      </div>
    </div>
  </div></section>

  <section class="sec pp-sec pp-apply" id="form">${bd('form')}<div class="pp-in pp-apply-in">
    <div class="pp-ap-copy reveal">
      <span class="pp-eyebrow">${T('partners.apply.eyebrow')}</span>
      <h2>${T('partners.apply.h2')}</h2>
      <p>${T('partners.apply.lead2', {hours: esc(c.hours.toLowerCase())})}</p>
      <figure class="pp-ap-ph">${ph('team', '', '50% 32%', T('partners.apply.s'))}</figure>
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
