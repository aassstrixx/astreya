/* «Контакты» — страница v3 («Приёмная в арке»): первый экран — фото приёмной в арочной раме со стеклянной карточкой адреса; дальше нумерованные разделы 01–04:
   способы связи строками (телефон, почта, мессенджеры, адрес) рядом с фото команды; настоящая карта России владельца (assets/company/ru-map.svg, та же, что на странице компании)
   крупным планом запада страны с метками городов и маршрутами из Москвы — выбор города на карте и в списке представительств работает вместе; форма «Написать нам» на тёмной плите
   с фото учебного центра; реквизиты — гравированной плитой. Все данные — из data/site.json (contacts, offices, requisites) и src/messengers.js; нет данных — прежнее «Уточняется».
   Крючки скриптов и навигатора Стеллы сохранены: .page-head (в него js/sales-pages.js дописывает статус «на связи»), .contact-cards, #support .lead-form, ссылки tel:/mailto:, data-track,
   .cp-pin / .cp-rt / .cp-office / .cp-ob-t (js/pg-contacts.js). Оформление — css/pg-contacts.css. */
const S = require('../../js/shared.js');
const {esc, I} = S;
const MSG = require('../messengers.js');
const {T, Traw} = require('../texts.js');

/* карта России владельца (assets/company/ru-map.svg, 1920×1108), коническая проекция Ламберта подобрана по береговой линии карты (как в src/pages/company.js). Показываем окно на запад страны:
   в пикселях карты x 0…640, y 420…900 — все города представительств с запасом под подписи; метки стоят на реальных местах */
const MAPP = {W: 1920, H: 1108, l0: 90.0438, p1: 46.9718, p2: 62.1925, s: 1463.4714, tx: 953.732, ty: 802.0278};
const WIN = {x0: 0, y0: 420, w: 640, h: 480};
const COORDS = {'Москва': [37.6173, 55.7558], 'Санкт-Петербург': [30.3351, 59.9343], 'Симферополь': [34.1024, 44.9521], 'Ростов-на-Дону': [39.7015, 47.2357]};
function mapPx(lon, lat) {
  const r = Math.PI / 180, a = MAPP.p1 * r, b = MAPP.p2 * r;
  const n = Math.log(Math.cos(a) / Math.cos(b)) / Math.log(Math.tan(Math.PI / 4 + b / 2) / Math.tan(Math.PI / 4 + a / 2));
  const F = Math.cos(a) * Math.pow(Math.tan(Math.PI / 4 + a / 2), n) / n;
  const rho = F / Math.pow(Math.tan(Math.PI / 4 + lat * r / 2), n), rho0 = F / Math.pow(Math.tan(Math.PI / 4 + 60 * r / 2), n), lam = (lon - MAPP.l0) * r;
  return {x: MAPP.s * rho * Math.sin(n * lam) + MAPP.tx, y: -MAPP.s * (rho0 - rho * Math.cos(n * lam)) + MAPP.ty};
}
const proj = ([lon, lat]) => { const q = mapPx(lon, lat); return {px: q.x - WIN.x0, py: q.y - WIN.y0, x: (q.x - WIN.x0) / WIN.w, y: (q.y - WIN.y0) / WIN.h}; };
const TR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya'};
const slug = s => s.toLowerCase().split('').map(ch => TR[ch] !== undefined ? TR[ch] : /[a-z0-9]/.test(ch) ? ch : '-').join('').replace(/-+/g, '-').replace(/^-|-$/g, '');

module.exports = function contacts(ctx, C, P) {
  const {site} = ctx, c = site.contacts, rq = site.requisites, u = f => C.u(P, f), offs = site.offices;
  const q = encodeURIComponent(c.address);
  const tbd = '<span class="tbd">' + T('contacts.req.tbd') + '</span>';
  const no = i => String(i + 1).padStart(2, '0');
  const keys = [
    {ic: I.phone, t: T('contacts.ways.phone'), v: `<a href="tel:${c.phoneRaw}" data-track="phone_click">${esc(c.phone)}</a>`, s: esc(c.hours), link: 1},
    {ic: I.mail, t: T('contacts.ways.email'), v: `<a href="mailto:${c.email}" data-track="email_click">${esc(c.email)}</a>`, s: T('contacts.ways.email.s'), link: 1},
    /* мессенджеры без ссылки не показываем («Скоро» выглядит недоделкой): ключ появится сам, когда ссылка будет задана в настройках */
    ...MSG.cells(c).filter(ch => ch.url).map(ch => ({ic: I.msg, t: ch.name, v: `<a href="${esc(ch.url)}" target="_blank" rel="noopener" data-track="messenger_click" data-place="contacts">${ch.cta}</a>`, s: ch.sub, link: 1})),
    {ic: I.pin, t: T('contacts.ways.office'), v: esc(c.address), s: esc(c.addressNote)}
  ];
  const mapLinks = (o, main) => {
    const addr = main ? c.address : (o.city + ', ' + o.addr.replace(/\s*\([^)]*\)\s*$/, '')), qq = main ? q : encodeURIComponent(addr);
    return /уточн/i.test(o.addr) ? '' : `<div class="cp-route"><a class="btn btn-fill btn-sm cp-pill" href="https://yandex.ru/maps/?text=${qq}" target="_blank" rel="noopener">Яндекс Карты ${I.external}</a><a class="btn btn-ghost btn-sm cp-pill" href="https://2gis.ru/search/${qq}" target="_blank" rel="noopener">2ГИС ${I.external}</a></div>`;
  };
  const stella = C.xon('assistant') ? `<button class="cp-ask" type="button" data-act="asst-chip" data-q="${T('contacts.write.stella.q')}" data-track="asst_chip" data-place="contacts"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg><span>${T('contacts.write.stella')}</span></button>` : '';
  const pins = offs.map((o, i) => COORDS[o.city] ? {o, i, p: proj(COORDS[o.city])} : null).filter(Boolean);
  const hub = pins.find(x => x.o.city === 'Москва') || pins[0];
  const curve = (a, b) => { const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2, dx = b.px - a.px, dy = b.py - a.py, k = .18; return `M${a.px.toFixed(1)} ${a.py.toFixed(1)} Q${(mx - dy * k).toFixed(1)} ${(my + dx * k).toFixed(1)} ${b.px.toFixed(1)} ${b.py.toFixed(1)}`; };

  const team = `<figure class="cp-photo reveal"><img src="${u('assets/photos/photo-02-about.webp')}" alt="${T('contacts.ways.photo.alt')}" width="800" height="533" loading="lazy" decoding="async"><figcaption><b>${T('contacts.ways.photo.b')}</b><span>${esc(c.hours)}</span></figcaption></figure>`;
  const maxPct = (site.discounts || []).reduce((m, d) => Math.max(m, d.pct || 0), 0);
  const lk = k => { const v = Traw(k); return esc(/^(https?:|tel:|mailto:|#)/.test(v) ? v : u(v)); };          // ссылка плитки: страница сайта, якорь или внешний адрес (правится в «Тексты страниц»)
  const topics = [
    {ic: I.box, t: T('contacts.topics.catalog.t'), p: T('contacts.topics.catalog.p'), h: lk('contacts.topics.catalog.h')},
    {ic: I.book, t: T('contacts.topics.training.t'), p: T('contacts.topics.training.p'), h: lk('contacts.topics.training.h')},
    {ic: I.percent, t: T('contacts.topics.partners.t'), p: maxPct ? T('contacts.topics.partners.pd', {pct: `<span data-count="${maxPct}">${maxPct}</span>`}) : T('contacts.topics.partners.p'), h: lk('contacts.topics.partners.h')},
    {ic: I.doc, t: T('contacts.topics.docs.t'), p: T('contacts.topics.docs.p'), h: lk('contacts.topics.docs.h')}
  ];
  const how = `<div class="cp-how reveal">
      <div class="cp-how-in">
        <span class="cp-eyebrow">${T('contacts.how.eyebrow')}</span>
        <h2>${T('contacts.how.h2')}</h2>
        <ul class="cp-hl">
          <li>${I.pin}<span><b>${esc(c.address)}</b><small>${esc(c.addressNote)}</small></span></li>
          <li>${I.clock}<span><b>${esc(c.hours)}</b><small>${T('contacts.how.hours')}</small></span></li>
          <li>${I.phone}<span><b><a href="tel:${c.phoneRaw}" data-track="phone_click" data-place="contacts-how">${esc(c.phone)}</a></b><small>${T('contacts.how.phone')}</small></span></li>
        </ul>
        ${mapLinks({addr: c.address}, true)}
      </div>
      <figure class="cp-how-ph"><img src="${u('assets/company/atrium-wide.webp')}" alt="" width="1800" height="1012" loading="lazy" decoding="async"></figure>
    </div>`;
  const no2 = i => String(i + 1).padStart(2, '0');

  return `<div class="cp" data-cp>
  <section class="cp-hero">
    <div class="cp-scene" aria-hidden="true"><img src="${u('assets/utility/arches.webp')}" alt="" width="1920" height="1080" fetchpriority="high" decoding="async" data-par="-.05"><i class="cp-veil"></i></div>
    <div class="cp-in cp-hero-in">
      <header class="page-head cp-copy">
        <span class="cp-eyebrow">${T('contacts.hero.eyebrow')}</span>
        <h1>${T('contacts.hero.h1')}</h1>
        <p class="cp-lead">${T('contacts.hero.lead')}</p>
        <div class="cp-cta">${C.callbackBtn('btn btn-fill cp-pill', 'contacts-hero')}<a class="btn btn-ghost cp-pill" href="tel:${c.phoneRaw}" data-track="phone_click" data-place="contacts-hero">${I.phone} ${esc(c.phone)}</a></div>
      </header>
    </div>
  </section>

  <section class="cp-sec cp-topics" id="cp-topics"><div class="cp-in">
    <header class="cp-head reveal"><span class="cp-num">${no2(0)}</span><div><span class="cp-eyebrow">${T('contacts.topics.eyebrow')}</span><h2>${T('contacts.topics.h2')}</h2></div></header>
    <div class="cp-tiles">${topics.map(t => `<a class="cp-tile reveal" href="${t.h}" data-track="contacts_topic"><span class="cp-tic">${t.ic}</span><b>${t.t}</b><p>${t.p}</p><i class="cp-tgo">${I.arrow}</i></a>`).join('')}</div>
  </div></section>

  <section class="cp-sec cp-ways" id="cp-ways"><div class="cp-in">
    <header class="cp-head reveal"><span class="cp-num">${no2(1)}</span><div><span class="cp-eyebrow">${T('contacts.ways.eyebrow')}</span><h2>${T('contacts.ways.h2')}</h2></div></header>
    <div class="cp-ways-grid">
      ${team}
      <div class="contact-cards cp-keys cp-n${keys.length}"><h2 class="sr">${T('contacts.ways.eyebrow')}</h2>${keys.map((k, i) => `<article class="ccard cp-key${k.link ? ' is-link' : ''} reveal"><i class="cp-kn">${no(i)}</i><span class="cp-kic">${k.ic}</span><h3>${k.t}</h3><p class="cv">${k.v}</p><p class="cp-ks">${k.s}</p></article>`).join('')}</div>
    </div>
  </div></section>

  <section class="cp-sec cp-map" id="offices"><div class="cp-in">
    <header class="cp-head reveal"><span class="cp-num">${no2(2)}</span><div><span class="cp-eyebrow">${T('contacts.map.eyebrow')}</span><h2>${T('contacts.map.h2')}</h2></div></header>
    <div class="cp-atlas">
      <div class="cp-offices" data-cp-offices>${offs.map((o, i) => `<article class="cp-office reveal" id="office-${slug(o.city)}" data-city="${esc(o.city)}">
        <h3 class="cp-oh"><button class="cp-ob-t" type="button" aria-expanded="true" aria-controls="ob-${slug(o.city)}"><i>${no(i)}</i><b>${esc(o.city)}</b><span>${esc(o.role)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></h3>
        <div class="cp-ob" id="ob-${slug(o.city)}"><div class="cp-obi">
          <div class="cp-li">${I.pin}<span>${esc(o.addr)}</span></div>
          ${o.hours ? `<div class="cp-li">${I.clock}<span>${esc(o.hours)}</span></div>` : ''}
          ${o.phones.map(([p, l]) => `<div class="cp-li">${I.phone}<span><a href="tel:${p.replace(/[^+\d]/g, '')}" data-track="phone_click" data-place="contacts-office">${esc(p)}</a> · ${esc(l)}</span></div>`).join('')}
          ${o.emails.map(m => `<div class="cp-li">${I.mail}<span><a href="mailto:${m}" data-track="email_click" data-place="contacts-office">${esc(m)}</a></span></div>`).join('')}
          ${mapLinks(o, o.city === 'Москва')}
        </div></div>
      </article>`).join('')}</div>
      <div class="cp-relief reveal" role="group" aria-label="${T('common.aria.office', {address: esc(c.address), eyebrow: T('contacts.map.eyebrow')})}">
        <div class="cp-stone">
          <img class="cp-mapimg" src="${u('assets/company/ru-map.svg')}" alt="" width="1920" height="1108" loading="lazy" decoding="async">
          <svg class="cp-svg" viewBox="0 0 ${WIN.w} ${WIN.h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            ${hub ? pins.filter(x => x !== hub).map(x => `<path class="cp-rt" data-city="${esc(x.o.city)}" d="${curve(hub.p, x.p)}"/>`).join('') : ''}
          </svg>
          ${pins.map(({o, i, p}, n) => `<button class="cp-pin${o === (hub && hub.o) ? ' is-hub' : ''}" type="button" data-city="${esc(o.city)}" data-side="r" style="--x:${p.x.toFixed(4)};--y:${p.y.toFixed(4)};--n:${n}" aria-controls="office-${slug(o.city)}" aria-label="${esc(o.city)} — ${esc(o.role)}"><i aria-hidden="true"></i><span>${esc(o.city)}</span></button>`).join('')}
          <p class="cp-cap" aria-hidden="true">${T('contacts.map.cap')}</p>
        </div>
      </div>
    </div>
  </div></section>

  <section class="cp-sec cp-hw" id="cp-how"><div class="cp-in">${how}</div></section>

  <section class="cp-sec cp-write" id="cp-write"><div class="cp-in cp-write-in">
    <div class="cp-wr-copy reveal">
      <header class="cp-head cp-head-l"><span class="cp-num">${no2(3)}</span><div><span class="cp-eyebrow">${T('contacts.write.eyebrow')}</span><h2>${T('contacts.write.h2')}</h2></div></header>
      <p>${T('contacts.write.lead')}</p>
      <p class="cp-fast">${T('contacts.write.fast')}</p>
      <ul class="cp-chips"><li>${T('contacts.write.chip1')}</li><li>${T('contacts.write.chip2')}</li><li>${T('contacts.write.chip3')}</li></ul>
      ${stella}
      <div class="cp-duo reveal" aria-hidden="true">
        <img src="${u('assets/news/ph-seminar-b.webp')}" alt="" width="960" height="540" loading="lazy" decoding="async">
        <img src="${u('assets/photos/photo-02b-about.webp')}" alt="" width="768" height="768" loading="lazy" decoding="async">
      </div>
    </div>
    <div class="cp-paper reveal" id="support">${S.formHTML('contact', {root: P.root, uid: 'ct'})}</div>
  </div></section>

  <section class="cp-sec cp-req" id="cp-req"><div class="cp-in">
    <header class="cp-head reveal"><span class="cp-num">${no2(4)}</span><div><span class="cp-eyebrow">${T('contacts.req.eyebrow')}</span><h2>${T('contacts.req.h2')}</h2></div></header>
    <dl class="cp-ledger reveal">
      <div><dt>${T('contacts.req.name')}</dt><dd>${esc(rq.legalName)}</dd></div>
      <div><dt>${T('contacts.req.inn')}</dt><dd>${rq.inn ? esc(rq.inn) : tbd}</dd></div>
      <div><dt>${T('contacts.req.kpp')}</dt><dd>${rq.kpp ? esc(rq.kpp) : tbd}</dd></div>
      <div><dt>${T('contacts.req.ogrn')}</dt><dd>${rq.ogrn ? esc(rq.ogrn) : tbd}</dd></div>
      <div><dt>${T('contacts.req.legal')}</dt><dd>${rq.legalAddress ? esc(rq.legalAddress) : tbd}</dd></div>
      <div><dt>${T('contacts.req.fact')}</dt><dd>${esc(c.address)}</dd></div>
    </dl>
    <p class="cp-note">${esc(rq.note)}</p>
  </div></section>
  </div>`;
};
