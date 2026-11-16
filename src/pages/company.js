/* «Компания» — страница v3 «компактная презентация»: восемь плотных блоков вместо девяти больших сцен (по образцу плотности страницы «Обучение»):
   1 вступление (≤ 520 px) · 2 компания в цифрах · 3 четыре направления + ближайшие семинары · 4 история и развитие (data/company-history.json) · 5 бренды (логотипы небольшие) ·
   6 география (стилизованная карта России + карточки городов) · 7 работа с профессионалами и преимущества · 8 финал: «Посмотреть обучение» / «Стать партнёром» + мини-калькулятор.
   Содержание прежней страницы сохранено (data/content.json → company, advantages; data/site.json; data/brands.json; data/events.json; data/sales.json → closing.company);
   ничего не выдумано: хронология — только подтверждённое, остальное «Уточняется». Атриум-рендер больше не занимает экран (его кадры остаются в assets/company/ и используются как небольшие акценты).
   Оформление — css/company-atrium.css (всё под .ca), поведение — js/company-atrium.js (без JS страница читаема: карточки городов раскрыты).
   Крючки: «Мы рядом» (h2) — к нему js/sales-pages.js пристраивает «Ваш регион»; Стелла — только data-act="asst-open" / "asst-chip"; все data-track сохранены. */
const S = require('../../js/shared.js');
const ruMap = require('../ru-map.js');
const HISTORY = require('../../data/company-history.json');
const {esc, I, dparts, rub} = S;

const PACK = {dermatime: 'dermatime-bottle', keenwell: 'keenwell-jar', endocare: 'endocare-box', neoretin: 'neoretin-dropper', heliocare: 'heliocare-tube', biretix: 'biretix-jar', iraltone: 'iraltone-bottle', elancyl: 'elancyl-tube', eva: 'eva-device'};

/* авторские знаки преимуществ (тонкая линия, без стандартных иконок): печать-арки · ступени · кабинет и дом · дуга с точками · скрещённые клинки · три порога */
const SEAL = [
  '<path d="M10 52V30a18 18 0 0 1 36 0v22"/><path d="M17 52V31a11 11 0 0 1 22 0v21"/><path d="M24 52V32a4 4 0 0 1 8 0v20"/><path d="M6 52h44"/>',
  '<path d="M6 52h44M10 52V42h12M22 52V32h12M34 52V22h12M46 52V12"/>',
  '<circle cx="21" cy="30" r="15"/><circle cx="35" cy="30" r="15"/><path d="M28 17.5a15 15 0 0 1 0 25"/>',
  '<path d="M6 46C16 18 40 18 50 46"/><circle cx="6" cy="46" r="3"/><circle cx="28" cy="25" r="3"/><circle cx="50" cy="46" r="3"/>',
  '<path d="M8 52 29 6l5 46H8Z"/><path d="M48 52 27 12l-5 40h26Z"/><ellipse cx="28" cy="30" rx="24" ry="8" transform="rotate(-14 28 30)"/>',
  '<path d="M6 52h44"/><path d="M10 52V40h8v12M24 52V28h8v24M38 52V14h8v38"/>'];

/* города карты: [ключ, широта/долгота, сторона подписи] */
const GEO = {'Москва': [37.62, 55.75, 'r'], 'Санкт-Петербург': [30.32, 59.94, 'tr'], 'Ростов-на-Дону': [39.72, 47.22, 'r'], 'Симферополь': [34.1, 44.95, 'b']};

module.exports = function company(ctx, C, P) {
  const {content, brands, site, sortedEvents} = ctx, cp = content.company, c = site.contacts, u = f => C.u(P, f), no = i => String(i + 1).padStart(2, '0');
  const today = new Date().toISOString().slice(0, 10);
  const up = sortedEvents.filter(e => e.date >= today), two = (up.length >= 2 ? up : up.concat(sortedEvents.slice(-(2 - up.length)))).slice(0, 2);
  const closing = C.closingCfg('company') || {};
  const stella = C.xon('assistant');
  const chip = (q, label, place) => stella ? `<button class="ca-ask" type="button" data-act="asst-chip" data-q="${esc(q)}" data-track="asst_chip" data-place="${place || 'company'}">${I.chat || ''}<span>${esc(label)}</span></button>` : '';
  const pk = id => u('assets/showroom/pack-' + id + '-s.webp');
  const pimg = id => `<img src="${pk(id)}" alt="" loading="lazy" decoding="async">`;

  /* ---- бренды: производители и линии отдельно, логотипы небольшие ---- */
  const spain = brands.filter(b => b.group === 'Испания'), lines = brands.filter(b => b.group === 'Cantabria Labs'), dev = brands.filter(b => b.group === 'Аппаратное решение');
  const bcard = b => `<a class="ca-frame reveal" href="${C.burl(P, b)}" style="--c1:${esc(b.c1)};--c2:${esc(b.c2)}" data-track="brand_click" data-place="company-expo">
      <span class="ca-bl"><img class="ca-blogo" src="${u(b.logo)}" alt="${esc(b.name)}" loading="lazy" decoding="async"></span>
      <span class="ca-bt"><b>${esc(b.name)}</b><small>${esc(b.tag)}</small></span>${PACK[b.id] ? `<span class="ca-bp" aria-hidden="true">${pimg(PACK[b.id])}</span>` : ''}</a>`;

  /* ---- география ---- */
  const map = ruMap(520, 300, 10);
  const evIn = city => up.find(e => e.city === city);
  const evLine = city => { const e = evIn(city); return e ? `<a class="ca-cev" href="${C.eurl(P, e)}" data-track="event_click" data-place="company-geo"><time datetime="${e.date}">${dparts(e.date).d} ${esc(dparts(e.date).m)}</time><span>${esc(e.title)}</span></a>` : ''; };
  const [o1, o2] = site.offices;
  const office = (o, i) => `<li class="ca-city is-office" data-city="${esc(o.city)}" style="--x:${i}"><button class="ca-node" type="button" aria-expanded="false" aria-controls="ca-c${i}"><i aria-hidden="true"></i><span><small>${esc(o.role)}</small><b>${esc(o.city)}</b></span></button>
      <div class="ca-cd" id="ca-c${i}" role="group" aria-label="${esc(o.city)}"><div class="ca-cdi">
        <div class="ca-li">${I.pin}<span>${esc(o.addr)}</span></div>
        ${o.hours ? `<div class="ca-li">${I.clock}<span>${esc(o.hours)}</span></div>` : ''}
        ${o.phones.map(([p, l]) => `<div class="ca-li">${I.phone}<span><a href="tel:${p.replace(/[^+\d]/g, '')}" data-track="phone_click">${esc(p)}</a> · ${esc(l)}</span></div>`).join('')}
        ${o.emails.map(m => `<div class="ca-li">${I.mail}<span><a href="mailto:${m}" data-track="email_click">${esc(m)}</a></span></div>`).join('')}
        ${evLine(o.city)}</div></div></li>`;
  const sem = (city, i) => `<li class="ca-city is-sem" data-city="${esc(city)}" style="--x:${i}"><button class="ca-node" type="button" aria-expanded="false" aria-controls="ca-c${i}"><i aria-hidden="true"></i><span><small>Город семинаров</small><b>${esc(city)}</b></span></button>
      <div class="ca-cd" id="ca-c${i}" role="group" aria-label="${esc(city)}"><div class="ca-cdi"><p>Здесь проходят семинары учебного центра «Астрея».</p>${evLine(city) || `<a class="ca-cev is-plain" href="${u('training.html')}" data-track="training_click" data-place="company-geo"><span>Даты — в расписании</span></a>`}</div></div></li>`;
  const online = `<li class="ca-city is-sem is-online" data-city="Онлайн" style="--x:4"><button class="ca-node" type="button" aria-expanded="false" aria-controls="ca-c4"><i aria-hidden="true"></i><span><small>Вебинары</small><b>Онлайн</b></span></button>
      <div class="ca-cd" id="ca-c4" role="group" aria-label="Онлайн"><div class="ca-cdi"><p>Вебинары и онлайн-мероприятия учебного центра.</p>${evLine('Онлайн') || `<a class="ca-cev is-plain" href="${u('training.html')}" data-track="training_click" data-place="company-geo"><span>Даты — в расписании</span></a>`}</div></div></li>`;
  const mk = Object.keys(GEO).map(city => { const [lo, la, side] = GEO[city], p = map.at(lo, la), off = city === o1.city || city === o2.city;
    return `<button class="ca-mk ${off ? 'is-office' : 'is-sem'} s-${side}" type="button" data-city="${esc(city)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(city)}${off ? ' — офис' : ' — город семинаров'}"><i aria-hidden="true"></i><span>${esc(city)}</span></button>`; }).join('');

  /* ---- цифры и хронология ---- */
  const stats = [[brands.length, '', 'брендов и линий в портфеле'], [ctx.products.length, '', 'позиций в каталоге'], [20, '+', 'лет развиваем методику семинаров'], [4, '', 'города семинаров и онлайн']];
  const fill = t => String(t || '').replace('{brands}', brands.length).replace('{products}', ctx.products.length);
  const hist = (HISTORY.items || []).map((h, i) => {
    const ok = h.confirmed && (h.text || '').trim(), yr = (h.year || '').trim(), txt = fill(h.text).trim();
    return `<li class="ca-hi reveal${ok ? '' : ' is-tbd'}" style="--rd:${i * 70}ms"><span class="ca-hy">${esc(yr || 'Уточняется')}</span><i class="ca-hn" aria-hidden="true"></i><h3>${esc(h.title)}</h3><p>${txt ? esc(txt) : 'Уточняется — сведения будут добавлены после подтверждения.'}</p></li>`; }).join('');
  const ds = site.discounts, RMAX = 500000, RSTEP = 10000, RSTART = 100000;

  /* ---- иллюстрации четырёх направлений: небольшие окна-арки ---- */
  const ILL = [
    () => `<span class="ca-ill ca-ill-pk" aria-hidden="true">${pimg('dermatime-bottle')}${pimg('keenwell-jar')}${pimg('endocare-box')}</span>`,
    () => `<span class="ca-ill ca-ill-ph" aria-hidden="true"><img src="${u('assets/house/room-academy.webp')}" alt="" width="640" height="360" loading="lazy" decoding="async"></span>`,
    () => `<span class="ca-ill ca-ill-rg" aria-hidden="true"><svg viewBox="0 0 160 110" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M22 78 54 34l36 22 40 26" class="l"/><circle cx="22" cy="78" r="5"/><circle cx="54" cy="34" r="5"/><circle cx="90" cy="56" r="5"/><circle cx="130" cy="82" r="5"/><circle cx="76" cy="92" r="3.4" class="o"/><text x="60" y="30">СПб</text><text x="96" y="52">Москва</text><text x="104" y="98">Ростов</text><text x="2" y="96">Крым</text></svg></span>`,
    () => `<span class="ca-ill ca-ill-sp" aria-hidden="true"><svg viewBox="0 0 160 110" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="64" cy="55" r="34"/><circle cx="96" cy="55" r="34"/><path d="M80 25.5a34 34 0 0 1 0 59"/><text x="36" y="58">Астрея</text><text x="104" y="58">Партнёр</text></svg></span>`];

  return `<div class="ca" data-ca>
  <section class="sec ca-s ca-entry" id="ca-entry" data-scene="1" data-title="О компании" aria-labelledby="ca-h1">
    <div class="ca-bg" aria-hidden="true" data-ca-hero>
      <picture><source media="(max-width:760px)" srcset="${u('assets/company/atrium-m.webp')}"><img src="${u('assets/company/atrium-s.webp')}" srcset="${u('assets/company/atrium-s.webp')} 1200w, ${u('assets/company/atrium.webp')} 2400w" sizes="100vw" alt="" width="2400" height="1350" fetchpriority="high" decoding="async"></picture>
      <i class="ca-shaft ca-sh1"></i><i class="ca-shaft ca-sh2"></i><canvas class="ca-dust" data-ca-dust></canvas><i class="ca-veil"></i>
    </div>
    <div class="ca-in ca-entry-in" data-ca-copy>
      <span class="ca-eyebrow reveal">О компании</span>
      <h1 id="ca-h1">${esc(cp.h1)}</h1>
      <p class="ca-lead reveal">${esc(cp.lead)}</p>
      <p class="ca-dist reveal">Официальный дистрибьютор: оригинальная продукция, учебный центр и менеджеры, которые помогают с ассортиментом.</p>
      <div class="ca-cta reveal"><a class="btn btn-fill ca-pill" href="#ca-niches" data-act="scroll" data-target="ca-niches" data-track="company_intro" data-place="company-hero">Познакомиться с компанией ${I.arrow}</a><a class="btn btn-ghost ca-pill" href="${u('brands.html')}" data-track="brands_click" data-place="company-hero">Все бренды</a></div>
    </div>
  </section>

  <section class="ca-numbers" aria-label="Компания в цифрах">
    <ul class="ca-in ca-stats">${stats.map(([n, sf, t]) => `<li class="ca-stat reveal"><b><span data-count="${n}">${n}</span>${sf}</b><span>${esc(t)}</span></li>`).join('')}</ul>
  </section>

  <section class="sec ca-s ca-niches" id="ca-niches" data-scene="2" data-title="Направления" aria-labelledby="ca-h2">
    <div class="ca-in ca-dir">
      <div class="ca-dir-t">
        <span class="ca-eyebrow reveal">Направления</span><h2 id="ca-h2">Чем занимается компания</h2>
        <div class="ca-who about-grid"><div class="ca-who-t txt reveal">${cp.who.map(t => `<p>${esc(t)}</p>`).join('')}</div></div>
      </div>
      <div class="ca-dir-r">
      <ul class="ca-nrow">${cp.directions.map((d, i) => `<li class="ca-nich reveal" style="--rd:${i * 80}ms">${ILL[i % ILL.length]()}<span class="ca-no">${no(i)}</span><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p></li>`).join('')}</ul>
    <div class="ca-edu" id="ca-edu">
      <div class="ca-edu-copy"><span class="ca-eyebrow reveal">Учебный центр</span><h3 class="ca-edu-h">Ближайшие семинары</h3>
        <p>Семинары, мастер-классы и вебинары для специалистов: очно в четырёх городах и онлайн.${up.length ? ` В расписании мероприятий: ${up.length}.` : ''}</p>
        <div class="ca-cta reveal"><a class="btn btn-fill ca-pill" href="${u('training.html')}" data-track="training_click" data-place="company-edu">Посмотреть расписание ${I.arrow}</a></div></div>
      <ul class="ca-evs">${two.map(e => { const d = dparts(e.date), b = ctx.brandById[e.brand]; return `<li class="ca-ev reveal" data-date="${e.date}" data-city="${esc(e.city)}">
        <time datetime="${e.date}"><b>${d.d}</b><span>${esc(d.m)}</span></time>
        <div class="ca-evb"><span class="ca-evt">${esc(e.fmt)} · ${esc(e.city)}</span><h3><a href="${C.eurl(P, e)}" data-track="event_click" data-place="company-edu">${esc(e.title)}</a></h3>
          <p>${esc(e.time)} · ${esc(e.speaker)}${b ? ` · ${esc(b.name)}` : ''}</p>
          <button class="btn btn-ghost btn-sm" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">Записаться</button></div></li>`; }).join('')}</ul>
    </div>
      </div>
    </div>
  </section>

  <section class="sec ca-s ca-hist" id="ca-hist" data-scene="3" data-title="История" aria-labelledby="ca-h4">
    <div class="ca-in">
      <header class="ca-head"><span class="ca-eyebrow reveal">История и развитие</span><h2 id="ca-h4">Путь компании</h2><p class="ca-sub reveal">Только подтверждённые сведения; этапы без даты — «Уточняется».</p></header>
      <ol class="ca-tl">${hist}</ol>
    </div>
  </section>

  <section class="sec ca-s ca-expo" id="ca-expo" data-scene="4" data-title="Бренды" aria-labelledby="ca-h3">
    <div class="ca-in">
      <header class="ca-head ca-head-row"><div><span class="ca-eyebrow reveal">Бренды</span><h2 id="ca-h3">Бренды «Астрея»</h2><p class="ca-sub reveal">Производитель и его линии показаны отдельно: Cantabria Labs — производитель, Endocare, Neoretin, Heliocare, Biretix, Iraltone и Elancyl — его линии.</p></div>
        <div class="ca-cta reveal"><a class="btn btn-fill ca-pill" href="${u('brands.html')}" data-track="brands_click" data-place="company-expo">Все бренды ${I.arrow}</a><a class="btn btn-ghost ca-pill" href="${u('catalog.html')}" data-track="catalog_click" data-place="company-expo">Перейти в каталог</a></div></header>
      <div class="ca-wall">
        <div class="ca-grp ca-g-spain"><h3 class="ca-gt">Испания</h3><div class="ca-fr2">${spain.map(bcard).join('')}</div></div>
        <div class="ca-grp ca-g-cl"><h3 class="ca-gt"><img class="ca-mkl" src="${u('assets/brands/cantabria-labs-h.svg')}" alt="Cantabria Labs" loading="lazy" decoding="async"><small>производитель · линии</small></h3><div class="ca-fr6">${lines.map(bcard).join('')}</div></div>
        <div class="ca-grp ca-g-dev"><h3 class="ca-gt">Аппаратное решение</h3><div class="ca-fr1">${dev.map(bcard).join('')}</div></div>
      </div>
    </div>
  </section>

  <section class="sec ca-s ca-geo" id="ca-geo" data-scene="5" data-title="География" aria-labelledby="ca-h7">
    <div class="ca-in">
      <header class="ca-head ca-head-row"><div><span class="ca-eyebrow reveal">Представительства</span><h2 id="ca-h7">Мы рядом</h2><p class="ca-sub reveal">Офисы — в Москве и Санкт-Петербурге; Ростов-на-Дону и Симферополь — города семинаров; вебинары — онлайн.</p></div>
        <a class="ca-more" href="${u('contacts.html')}" data-track="contacts_click" data-place="company-geo">Все контакты ${I.arrow}</a></header>
      <div class="ca-geo-g">
        <figure class="ca-map reveal" aria-label="Схема: офисы и города семинаров на карте России (стилизованная, не картографический источник)">
          <div class="ca-mapbox"><svg viewBox="0 0 ${map.W} ${map.H}" role="img" aria-hidden="true" focusable="false"><path class="g" d="${map.grid}"/><path class="l" d="${map.land}"/></svg>${mk}</div>
          <figcaption><span><i class="d-o"></i>Офис</span><span><i class="d-s"></i>Город семинаров</span><span class="on">Онлайн — по всей России</span></figcaption>
        </figure>
        <ol class="ca-cities">${office(o1, 0)}${office(o2, 1)}${sem('Ростов-на-Дону', 2)}${sem('Симферополь', 3)}${online}</ol>
      </div>
    </div>
  </section>

  <section class="sec ca-s ca-pro" id="ca-pro" data-scene="6" data-title="Профессионалам" aria-labelledby="ca-h5">
    <div class="ca-in">
      <div class="ca-pro-in">
        <figure class="ca-pro-art reveal" aria-hidden="true"><img src="${u('assets/company/atrium-side.webp')}" alt="" width="1800" height="1012" loading="lazy" decoding="async"></figure>
        <div class="ca-pro-copy">
          <span class="ca-eyebrow reveal">Профессионалам</span>
          <h2 id="ca-h5">${esc(cp.professionals.title)}</h2>
          <p>${esc(cp.professionals.text[0])}</p>
          <aside class="ca-plate reveal" role="note"><b>Подбор ориентировочный</b><p>${esc(cp.professionals.text[1])}</p></aside>
          <div class="ca-asks reveal" aria-label="Спросить Стеллу">${chip('Подобрать ассортимент для кабинета косметолога', 'Косметологу')}${chip('Какие средства подойдут врачу-косметологу?', 'Врачу-косметологу')}${chip('Подобрать ассортимент для салона или клиники', 'Салону и клинике')}</div>
          <div class="ca-cta reveal"><a class="btn btn-fill ca-pill" href="${u('catalog.html')}" data-track="catalog_click" data-place="company">Перейти в каталог ${I.arrow}</a></div>
        </div>
      </div>
      <ul class="ca-slabs ca-slabs-2">${[2, 4].map(i => content.advantages[i]).filter(Boolean).map((a, k) => `<li class="ca-slab reveal" style="--rd:${k * 80}ms">
        <span class="ca-seal" aria-hidden="true"><svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SEAL[k % SEAL.length].replace(/<(path|circle|ellipse)/g, '<$1 pathLength="1"')}</svg></span>
        <div><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div></li>`).join('')}</ul>
    </div>
  </section>

  <section class="sec ca-s ca-final" id="ca-final" data-scene="7" data-title="Финал" aria-labelledby="ca-h9">
    <div class="ca-fin-bg" aria-hidden="true" data-ca-par><img src="${u('assets/company/atrium-wide.webp')}" alt="" width="2400" height="1350" loading="lazy" decoding="async"></div>
    <div class="ca-in ca-fin-g">
      <div class="ca-fin-in" data-sx-closing="company-cta">
        <span class="ca-eyebrow reveal">${esc(closing.eyebrow || 'Знакомство без обязательств')}</span><h2 id="ca-h9">${esc(closing.title || 'Познакомимся на практике')}</h2>
        <p class="ca-sub reveal">${esc(closing.text || 'Приезжайте на семинар или пройдите «Старт со Стеллой» — сотрудничество можно начать с небольшого шага.')}</p>
        <div class="ca-cta reveal"><a class="btn btn-fill ca-pill" href="${u('training.html')}" data-track="closing_cta" data-place="company-cta">Посмотреть обучение ${I.arrow}</a>${C.partnerBtn(P, 'company', 'btn btn-ghost ca-pill')}</div>
        <p class="ca-fin-ask reveal"><a class="ca-more" href="${u((closing.secondary || {}).href || 'start.html')}" data-track="closing_cta" data-place="company-cta">${esc((closing.secondary || {}).label || 'Старт со Стеллой')} ${I.arrow}</a>${stella ? `<button class="ca-ask" type="button" data-act="asst-open" data-track="asst_open" data-place="company">${I.chat || ''}<span>Спросить Стеллу</span></button>` : ''}<a class="ca-tel" href="tel:${c.phoneRaw}" data-track="phone_click">${I.phone} ${esc(c.phone)}</a></p>
      </div>
      <div class="ca-slab-calc reveal" data-ca-calc>
        <h3>Скидка по объёму закупки</h3>
        <div class="ca-sumrow"><small id="ca-sum-l">Сумма закупки</small><output id="ca-sum" for="ca-range" aria-labelledby="ca-sum-l">${rub(RSTART)}</output></div>
        <div class="ca-track"><input type="range" id="ca-range" min="0" max="${RMAX}" step="${RSTEP}" value="${RSTART}" aria-label="Сумма закупки">
          <ol class="ca-ticks" aria-hidden="true">${ds.map(d => `<li style="--x:${(d.from / RMAX).toFixed(4)}"><i></i><span>${d.pct}%</span></li>`).join('')}</ol></div>
        <ul class="ca-tiers" aria-label="Пороги скидок">${ds.map((d, i) => `<li data-tier="${i}"><b>${d.pct}%</b><span>от ${rub(d.from)}</span></li>`).join('')}</ul>
        <div class="ca-res" aria-live="polite"><div><small>Результат</small><span id="ca-tier">${ds[0] ? `До первой скидки — ${rub(Math.max(0, ds[0].from - RSTART))}` : ''}</span></div><div><small>Экономия</small><b id="ca-save">—</b></div></div>
        <p class="ca-fine">Расчёт ориентировочный (пример). Точные условия и пороги скидок подтверждает менеджер.</p>
      </div>
    </div>
  </section>
</div>`;
};
