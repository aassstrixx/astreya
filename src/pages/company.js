/* «Компания» — страница v2 «ASTREYA Grand Atrium»: один центральный рендер атриума (травертин, арки, ниши, латунь, тёмно-синий металл, арочное стекло — Blender, tools/showroom-assets/atrium)
   и девять веб-сцен поверх него: 1 вход · 2 четыре направления в нишах · 3 выставка брендов · 4 шесть панелей доверия · 5 комната профессионалов · 6 учебный центр ·
   7 география · 8 пространство партнёрства (калькулятор) · 9 финал «Познакомимся на практике».
   Содержание прежней страницы сохранено целиком (data/content.json → company, advantages; data/site.json; data/brands.json; data/events.json; data/sales.json → closing.company);
   ничего не выдумано. Ближайшие события — по дате сборки, как на главной и в новостях. Оформление — css/company-atrium.css (всё под .ca), поведение — js/company-atrium.js
   (без JS страница читаема: все сцены статичны, карточки городов раскрыты). Крючки: «Мы рядом» (h2) — к нему js/sales-pages.js пристраивает «Ваш регион»;
   Стелла — только data-act="asst-open" / "asst-chip"; все data-track сохранены. */
const S = require('../../js/shared.js');
const {esc, I, dparts, rub} = S;

const PACK = {dermatime: 'dermatime-bottle', keenwell: 'keenwell-jar', endocare: 'endocare-box', neoretin: 'neoretin-dropper', heliocare: 'heliocare-tube', biretix: 'biretix-jar', iraltone: 'iraltone-bottle', elancyl: 'elancyl-tube', eva: 'eva-device'};

/* авторские знаки панелей доверия (тонкая линия, без стандартных иконок): печать-арки · ступени · кабинет и дом · дуга с точками · скрещённые клинки · три порога */
const SEAL = [
  '<path d="M10 52V30a18 18 0 0 1 36 0v22"/><path d="M17 52V31a11 11 0 0 1 22 0v21"/><path d="M24 52V32a4 4 0 0 1 8 0v20"/><path d="M6 52h44"/>',
  '<path d="M6 52h44M10 52V42h12M22 52V32h12M34 52V22h12M46 52V12"/>',
  '<circle cx="21" cy="30" r="15"/><circle cx="35" cy="30" r="15"/><path d="M28 17.5a15 15 0 0 1 0 25"/>',
  '<path d="M6 46C16 18 40 18 50 46"/><circle cx="6" cy="46" r="3"/><circle cx="28" cy="25" r="3"/><circle cx="50" cy="46" r="3"/>',
  '<path d="M8 52 29 6l5 46H8Z"/><path d="M48 52 27 12l-5 40h26Z"/><ellipse cx="28" cy="30" rx="24" ry="8" transform="rotate(-14 28 30)"/>',
  '<path d="M6 52h44"/><path d="M10 52V40h8v12M24 52V28h8v24M38 52V14h8v38"/>'];
/* экспонаты четырёх ниш */
const EXH = [
  p => `<span class="ca-pk ca-pk1"><img src="${p('dermatime-bottle')}" alt="" loading="lazy" decoding="async"></span><span class="ca-pk ca-pk2"><img src="${p('keenwell-jar')}" alt="" loading="lazy" decoding="async"></span><span class="ca-pk ca-pk3"><img src="${p('endocare-box')}" alt="" loading="lazy" decoding="async"></span>`,
  () => '<span class="ca-ringnum"><b>20+</b><small>лет семинаров</small></span>',
  () => '<svg class="ca-const" viewBox="0 0 120 120" aria-hidden="true"><path d="M20 84 46 34l30 20 24 38" class="l"/><circle cx="20" cy="84" r="5"/><circle cx="46" cy="34" r="5"/><circle cx="76" cy="54" r="5"/><circle cx="100" cy="92" r="5"/><circle cx="60" cy="102" r="3.5" class="o"/></svg>',
  () => '<svg class="ca-blades" viewBox="0 0 120 120" aria-hidden="true"><path d="M26 108 54 22l6 86Z" class="a"/><path d="M96 108 66 34l-6 74Z" class="b"/><ellipse cx="60" cy="62" rx="46" ry="13" transform="rotate(-14 60 62)" class="r"/></svg>'];

module.exports = function company(ctx, C, P) {
  const {content, brands, site, sortedEvents} = ctx, cp = content.company, c = site.contacts, u = f => C.u(P, f), no = i => String(i + 1).padStart(2, '0');
  const today = new Date().toISOString().slice(0, 10);
  const up = sortedEvents.filter(e => e.date >= today), two = (up.length >= 2 ? up : up.concat(sortedEvents.slice(-(2 - up.length)))).slice(0, 2);
  const closing = C.closingCfg('company') || {};
  const stella = C.xon('assistant');
  const chip = (q, label, place) => stella ? `<button class="ca-ask" type="button" data-act="asst-chip" data-q="${esc(q)}" data-track="asst_chip" data-place="${place || 'company'}">${I.chat || ''}<span>${esc(label)}</span></button>` : '';
  const pk = id => u('assets/showroom/pack-' + id + '-s.webp');
  const img = (f, w, h, cls, lazy) => `<img${cls ? ` class="${cls}"` : ''} src="${u(f)}" alt="" width="${w}" height="${h}"${lazy === false ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;

  /* ---- бренды: производители и линии отдельно ---- */
  const spain = brands.filter(b => b.group === 'Испания'), lines = brands.filter(b => b.group === 'Cantabria Labs'), dev = brands.filter(b => b.group === 'Аппаратное решение');
  const frame = (b, big) => `<a class="ca-frame${big ? ' is-big' : ''}" href="${C.burl(P, b)}" style="--c1:${esc(b.c1)};--c2:${esc(b.c2)}" data-track="brand_click" data-place="company-expo">
      <span class="ca-niche-img"><img src="${u('assets/brands/niche-' + b.id + '.webp')}" alt="" width="720" height="900" loading="lazy" decoding="async">${PACK[b.id] ? `<img class="ca-on-plinth" src="${pk(PACK[b.id])}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <span class="ca-fcap"><img class="ca-blogo" src="${u(b.logo)}" alt="${esc(b.name)}" loading="lazy" decoding="async"><small>${esc(b.tag)}</small></span></a>`;

  /* ---- география ---- */
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

  /* ---- партнёрство: пороги скидок из data/site.json ---- */
  const ds = site.discounts, RMAX = 500000, RSTEP = 10000, RSTART = 100000;

  return `<div class="ca" data-ca>
  <section class="sec ca-s ca-entry" id="ca-entry" data-scene="1" data-title="Вход" aria-labelledby="ca-h1">
    <div class="ca-bg" aria-hidden="true" data-ca-hero>
      <picture><source media="(max-width:760px)" srcset="${u('assets/company/atrium-m.webp')}"><img src="${u('assets/company/atrium-s.webp')}" srcset="${u('assets/company/atrium-s.webp')} 1200w, ${u('assets/company/atrium.webp')} 2400w" sizes="100vw" alt="" width="2400" height="1350" fetchpriority="high" decoding="async"></picture>
      <i class="ca-shaft ca-sh1"></i><i class="ca-shaft ca-sh2"></i><canvas class="ca-dust" data-ca-dust></canvas><i class="ca-veil"></i>
    </div>
    <div class="ca-in ca-entry-in" data-ca-copy>
      <span class="ca-eyebrow">О компании</span>
      <h1 id="ca-h1">Астрея — пространство профессиональной косметологии</h1>
      <p class="ca-lead">${esc(cp.lead)}</p>
      <p class="ca-dist">${esc(cp.h1)}</p>
      <div class="ca-cta"><a class="btn btn-fill ca-pill" href="#ca-niches" data-act="scroll" data-target="ca-niches" data-track="company_intro" data-place="company-hero">Познакомиться с компанией ${I.arrow}</a></div>
    </div>
    <a class="ca-scroll" href="#ca-niches" data-act="scroll" data-target="ca-niches" aria-label="К следующей сцене"><i></i></a>
  </section>

  <section class="sec ca-s ca-niches" id="ca-niches" data-scene="2" data-title="Направления" aria-labelledby="ca-h2">
    <div class="ca-in">
      <header class="ca-head"><span class="ca-eyebrow">Направления</span><h2 id="ca-h2">Чем занимается компания</h2></header>
      <div class="ca-who">
        <div class="ca-who-t reveal">${cp.who.map(t => `<p>${esc(t)}</p>`).join('')}</div>
        <ol class="ca-why reveal">
          <li><i>01</i><div><b>Оригинальная продукция</b><p>Работа с официальным дистрибьютором защищает от подделок.</p></div></li>
          <li><i>02</i><div><b>Учебный центр</b><p>Более 20 лет развиваем методику семинаров: теория и практика в одном дне.</p></div></li>
          <li><i>03</i><div><b>Поддержка в регионах</b><p>Москва, Санкт-Петербург, Ростов-на-Дону и Крым — рядом с партнёрами.</p></div></li>
        </ol>
      </div>
      <ul class="ca-nrow">${cp.directions.map((d, i) => `<li class="ca-nich reveal" style="--rd:${i * 90}ms">
        <div class="ca-arch" aria-hidden="true"><span class="ca-no">${no(i)}</span><div class="ca-exh">${EXH[i % EXH.length](pk)}</div><i class="ca-plinth"></i></div>
        <div class="ca-nt"><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p></div></li>`).join('')}</ul>
    </div>
  </section>

  <section class="sec ca-s ca-expo" id="ca-expo" data-scene="3" data-title="Бренды" aria-labelledby="ca-h3">
    <div class="ca-in">
      <header class="ca-head"><span class="ca-eyebrow">Выставка брендов</span><h2 id="ca-h3">Бренды «Астрея»</h2><p class="ca-sub">Производитель и его линии показаны отдельно: Cantabria Labs — производитель, Endocare, Neoretin, Heliocare, Biretix, Iraltone и Elancyl — его линии.</p></header>
      <div class="ca-wall">
        <div class="ca-grp ca-g-spain"><h3 class="ca-gt">Испания</h3><div class="ca-fr2">${spain.map(b => frame(b, true)).join('')}</div></div>
        <div class="ca-grp ca-g-cl"><h3 class="ca-gt"><img class="ca-mk" src="${u('assets/brands/cantabria-labs-h.svg')}" alt="Cantabria Labs" loading="lazy" decoding="async"><small>производитель · линии</small></h3><div class="ca-fr6">${lines.map(b => frame(b)).join('')}</div></div>
        <div class="ca-grp ca-g-dev"><h3 class="ca-gt">Аппаратное решение</h3><div class="ca-fr1">${dev.map(b => frame(b, true)).join('')}</div></div>
      </div>
      <div class="ca-cta"><a class="btn btn-fill ca-pill" href="${u('brands.html')}" data-track="brands_click" data-place="company-expo">Все бренды ${I.arrow}</a><a class="btn btn-ghost ca-pill" href="${u('catalog.html')}" data-track="catalog_click" data-place="company-expo">Перейти в каталог</a></div>
    </div>
  </section>

  <section class="sec ca-s ca-trust" id="ca-trust" data-scene="4" data-title="Доверие" aria-labelledby="ca-h4">
    <div class="ca-in">
      <header class="ca-head"><span class="ca-eyebrow">Сотрудничество</span><h2 id="ca-h4">Преимущества работы с Астрея</h2></header>
      <ul class="ca-slabs">${content.advantages.map((a, i) => `<li class="ca-slab reveal" style="--rd:${(i % 3) * 90}ms" data-tilt>
        <span class="ca-seal" aria-hidden="true"><svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${SEAL[i % SEAL.length]}</svg></span>
        <span class="ca-sn" aria-hidden="true">${no(i)}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></li>`).join('')}</ul>
    </div>
  </section>

  <section class="sec ca-s ca-pro" id="ca-pro" data-scene="5" data-title="Профессионалам" aria-labelledby="ca-h5">
    <div class="ca-in ca-pro-in">
      <div class="ca-pro-art reveal" aria-hidden="true"><div class="ca-frame-arch" data-ca-par><img src="${u('assets/company/atrium-side.webp')}" alt="" width="1800" height="1012" loading="lazy" decoding="async"></div></div>
      <div class="ca-pro-copy">
        <span class="ca-eyebrow">Профессионалам</span>
        <h2 id="ca-h5">${esc(cp.professionals.title)}</h2>
        <p>${esc(cp.professionals.text[0])}</p>
        <aside class="ca-plate" role="note"><b>Подбор ориентировочный</b><p>${esc(cp.professionals.text[1])}</p></aside>
        <div class="ca-asks" aria-label="Спросить Стеллу">${chip('Подобрать ассортимент для кабинета косметолога', 'Косметологу')}${chip('Какие средства подойдут врачу-косметологу?', 'Врачу-косметологу')}${chip('Подобрать ассортимент для салона или клиники', 'Салону и клинике')}</div>
        <div class="ca-cta"><a class="btn btn-fill ca-pill" href="${u('catalog.html')}" data-track="catalog_click" data-place="company">Перейти в каталог ${I.arrow}</a></div>
      </div>
    </div>
  </section>

  <section class="sec ca-s ca-edu" id="ca-edu" data-scene="6" data-title="Учебный центр" aria-labelledby="ca-h6">
    <div class="ca-edu-bg" aria-hidden="true" data-ca-par><img src="${u('assets/house/room-academy.webp')}" alt="" width="1920" height="1080" loading="lazy" decoding="async"></div>
    <div class="ca-in ca-edu-in">
      <div class="ca-edu-copy">
        <span class="ca-eyebrow">Обучение</span>
        <h2 id="ca-h6">Учебный центр «Астрея»</h2>
        <p>Семинары, мастер-классы и вебинары для специалистов: очно в четырёх городах и онлайн.${up.length ? ` Ближайших мероприятий в расписании: ${up.length}.` : ''}</p>
        <div class="ca-cta"><a class="btn btn-fill ca-pill" href="${u('training.html')}" data-track="training_click" data-place="company-edu">Посмотреть расписание ${I.arrow}</a></div>
      </div>
      <ul class="ca-evs">${two.map(e => { const d = dparts(e.date), b = ctx.brandById[e.brand]; return `<li class="ca-ev reveal" data-date="${e.date}" data-city="${esc(e.city)}">
        <time datetime="${e.date}"><b>${d.d}</b><span>${esc(d.m)}</span></time>
        <div class="ca-evb"><span class="ca-evt">${esc(e.fmt)} · ${esc(e.city)}</span><h3><a href="${C.eurl(P, e)}" data-track="event_click" data-place="company-edu">${esc(e.title)}</a></h3>
          <p>${esc(e.time)} · ${esc(e.speaker)}${b ? ` · ${esc(b.name)}` : ''}</p>
          <button class="btn btn-ghost btn-sm" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">Записаться</button></div></li>`; }).join('')}</ul>
    </div>
  </section>

  <section class="sec ca-s ca-geo" id="ca-geo" data-scene="7" data-title="География" aria-labelledby="ca-h7">
    <div class="ca-in">
      <header class="ca-head ca-head-row"><div><span class="ca-eyebrow">Представительства</span><h2 id="ca-h7">Мы рядом</h2><p class="ca-sub">Офисы — в Москве и Санкт-Петербурге; Ростов-на-Дону и Симферополь — города семинаров; вебинары — онлайн.</p></div>
        <a class="ca-more" href="${u('contacts.html')}" data-track="contacts_click" data-place="company-geo">Все контакты ${I.arrow}</a></header>
      <ol class="ca-cities">${office(o1, 0)}${office(o2, 1)}${sem('Ростов-на-Дону', 2)}${sem('Симферополь', 3)}${online}</ol>
    </div>
  </section>

  <section class="sec ca-s ca-partner" id="ca-partner" data-scene="8" data-title="Партнёрство" aria-labelledby="ca-h8">
    <div class="ca-part-bg" aria-hidden="true" data-ca-par><img src="${u('assets/company/atrium-arch.webp')}" alt="" width="1800" height="1012" loading="lazy" decoding="async"></div>
    <div class="ca-in ca-part-in">
      <div class="ca-part-copy">
        <span class="ca-eyebrow">Партнёрам</span>
        <h2 id="ca-h8">Станьте партнёром Астрея</h2>
        <p>Оригинальная продукция, обучение вашей команды и поддержка менеджеров. Оставьте заявку — мы свяжемся и обсудим условия сотрудничества.</p>
        <div class="ca-cta">${C.partnerBtn(P, 'company', 'btn btn-fill ca-pill')}<a class="btn btn-ghost ca-pill" href="tel:${c.phoneRaw}" data-track="phone_click">${I.phone} ${esc(c.phone)}</a></div>
      </div>
      <div class="ca-slab-calc" data-ca-calc>
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

  <section class="sec ca-s ca-final" id="ca-final" data-scene="9" data-title="Финал" aria-labelledby="ca-h9">
    <div class="ca-fin-bg" aria-hidden="true" data-ca-par><img src="${u('assets/company/atrium-wide.webp')}" alt="" width="2400" height="1350" loading="lazy" decoding="async"></div>
    <div class="ca-in ca-fin-in" data-sx-closing="company-cta">
      <header class="ca-head ca-head-c"><span class="ca-eyebrow">${esc(closing.eyebrow || 'Знакомство без обязательств')}</span><h2 id="ca-h9">${esc(closing.title || 'Познакомимся на практике')}</h2><p class="ca-sub">${esc(closing.text || 'Приезжайте на семинар или пройдите «Старт со Стеллой» — сотрудничество можно начать с небольшого шага.')}</p></header>
      <div class="ca-panels">
        <a class="ca-panel" href="${u((closing.primary || {}).href || 'training.html')}" data-track="closing_cta" data-place="company-cta"><span class="ca-pn">01</span><h3>Учебный центр</h3><p>Семинары, мастер-классы и вебинары: теория и практика в одном дне.</p><span class="ca-go">${esc((closing.primary || {}).label || 'Расписание семинаров')} ${I.arrow}</span></a>
        <a class="ca-panel is-navy" href="${u((closing.secondary || {}).href || 'start.html')}" data-track="closing_cta" data-place="company-cta"><span class="ca-pn">02</span><h3>Старт со Стеллой</h3><p>«Старт со Стеллой» — минута, без обязательств.</p><span class="ca-go">${esc((closing.secondary || {}).label || 'Старт со Стеллой')} ${I.arrow}</span></a>
      </div>
      <p class="ca-fin-ask">${stella ? `<button class="ca-ask" type="button" data-act="asst-open" data-track="asst_open" data-place="company">${I.chat || ''}<span>Спросить Стеллу</span></button>` : ''}</p>
    </div>
  </section>
</div>`;
};
