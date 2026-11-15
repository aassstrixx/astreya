/* «Контакты» — страница v2 («Приёмная»): солнечная стена с тенями листьев; крупные «ключи» связи (телефон, почта, мессенджеры с ссылкой, адрес); рельефная карта-схема из камня с метками городов —
   выбор города на карте и в списке представительств работает вместе; форма «Написать нам» на «бумаге на камне»; реквизиты — гравированной плитой.
   Все данные — из data/site.json (contacts, offices, requisites) и src/messengers.js; ничего не выдумано: нет данных — прежнее «Уточняется». Крючки скриптов и навигатора Стеллы сохранены:
   .page-head (в него js/sales-pages.js дописывает статус «на связи»), .contact-cards, #support .lead-form, ссылки tel:/mailto:, data-track. Оформление — css/pg-contacts.css, поведение — js/pg-contacts.js. */
const S = require('../../js/shared.js');
const {esc, I} = S;
const MSG = require('../messengers.js');

/* карта-схема: города по координатам (широта, долгота) на проекции карты assets/showroom/pg-relief.webp — границы 26–43° в. д., 43–62° с. ш.; береговых линий нет, это схема, а не география */
const MAP = {lon0: 26, lon1: 43, lat0: 62, lat1: 43};
const COORDS = {'Москва': [55.7558, 37.6173], 'Санкт-Петербург': [59.9343, 30.3351], 'Симферополь': [44.9521, 34.1024], 'Ростов-на-Дону': [47.2357, 39.7015]};
const GRAT = {lat: [60, 55, 50, 45], lon: [30, 35, 40]};
const proj = ([lat, lon]) => ({x: (lon - MAP.lon0) / (MAP.lon1 - MAP.lon0), y: (MAP.lat0 - lat) / (MAP.lat0 - MAP.lat1)});
const TR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya'};
const slug = s => s.toLowerCase().split('').map(ch => TR[ch] !== undefined ? TR[ch] : /[a-z0-9]/.test(ch) ? ch : '-').join('').replace(/-+/g, '-').replace(/^-|-$/g, '');

module.exports = function contacts(ctx, C, P) {
  const {site} = ctx, c = site.contacts, rq = site.requisites, u = f => C.u(P, f), offs = site.offices;
  const q = encodeURIComponent(c.address);
  const tbd = '<span class="tbd">Уточняется</span>';
  const no = i => String(i + 1).padStart(2, '0');
  const keys = [
    {ic: I.phone, t: 'Телефон', v: `<a href="tel:${c.phoneRaw}" data-track="phone_click">${esc(c.phone)}</a>`, s: esc(c.hours), link: 1},
    {ic: I.mail, t: 'Email', v: `<a href="mailto:${c.email}" data-track="email_click">${esc(c.email)}</a>`, s: 'Ответим в рабочее время', link: 1},
    /* мессенджеры без ссылки не показываем («Скоро» выглядит недоделкой): ключ появится сам, когда ссылка будет задана в настройках */
    ...MSG.cells(c).filter(ch => ch.url).map(ch => ({ic: I.msg, t: ch.name, v: `<a href="${esc(ch.url)}" target="_blank" rel="noopener" data-track="messenger_click" data-place="contacts">${ch.cta}</a>`, s: ch.sub, link: 1})),
    {ic: I.pin, t: 'Центральный офис', v: esc(c.address), s: esc(c.addressNote)}
  ];
  const mapLinks = (o, main) => {
    const addr = main ? c.address : (o.city + ', ' + o.addr.replace(/\s*\([^)]*\)\s*$/, '')), qq = main ? q : encodeURIComponent(addr);
    return /уточн/i.test(o.addr) ? '' : `<div class="cp-route"><a class="btn btn-fill btn-sm cp-pill" href="https://yandex.ru/maps/?text=${qq}" target="_blank" rel="noopener">Яндекс Карты ${I.external}</a><a class="btn btn-ghost btn-sm cp-pill" href="https://2gis.ru/search/${qq}" target="_blank" rel="noopener">2ГИС ${I.external}</a></div>`;
  };
  const stella = C.xon('assistant') ? `<button class="cp-ask" type="button" data-act="asst-chip" data-q="С кем из менеджеров связаться?" data-track="asst_chip" data-place="contacts"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg><span>Подобрать менеджера со Стеллой</span></button>` : '';
  const pins = offs.map((o, i) => COORDS[o.city] ? {o, i, p: proj(COORDS[o.city])} : null).filter(Boolean);
  const hub = pins.find(x => x.o.city === 'Москва') || pins[0];
  const curve = (a, b) => { const mx = (a.x + b.x) / 2 * 1000, my = (a.y + b.y) / 2 * 538, dx = (b.x - a.x) * 1000, dy = (b.y - a.y) * 538, k = .16; return `M${(a.x * 1000).toFixed(1)} ${(a.y * 538).toFixed(1)} Q${(mx - dy * k).toFixed(1)} ${(my + dx * k).toFixed(1)} ${(b.x * 1000).toFixed(1)} ${(b.y * 538).toFixed(1)}`; };

  return `<div class="cp" data-cp>
  <section class="cp-hero">
    <div class="cp-scene" aria-hidden="true"><img src="${u('assets/showroom/pg-wall.webp')}" alt="" width="1800" height="1018" fetchpriority="high" decoding="async"><i class="cp-sun"></i></div>
    <div class="cp-in cp-hero-in">
      <header class="page-head cp-copy">
        <span class="cp-eyebrow">Контакты</span>
        <h1>Свяжитесь с Астрея</h1>
        <p class="cp-lead">Центральный офис в Москве и представительства в регионах. Позвоните, напишите или оставьте заявку — ответим в рабочее время.</p>
        <div class="cp-cta">${C.callbackBtn('btn btn-fill cp-pill', 'contacts-hero')}<a class="btn btn-ghost cp-pill" href="tel:${c.phoneRaw}" data-track="phone_click" data-place="contacts-hero">${I.phone} ${esc(c.phone)}</a></div>
      </header>
    </div>
  </section>

  <section class="cp-keys-wrap"><div class="cp-in">
    <h2 class="sr">Способы связи</h2>
    <div class="contact-cards cp-keys cp-n${keys.length}">${keys.map(k => `<article class="ccard cp-key${k.link ? ' is-link' : ''} reveal"><span class="cp-kic">${k.ic}</span><h3>${k.t}</h3><p class="cv">${k.v}</p><p class="cp-ks">${k.s}</p></article>`).join('')}</div>
  </div></section>

  <section class="cp-sec cp-map" id="offices"><div class="cp-in">
    <header class="cp-head"><span class="cp-eyebrow">Представительства</span><h2>Контакты по городам</h2></header>
    <div class="cp-atlas">
      <div class="cp-relief reveal" role="group" aria-label="Расположение офиса: ${esc(c.address)}">
        <div class="cp-stone">
          <img src="${u('assets/showroom/pg-relief.webp')}" alt="" width="2400" height="1290" loading="lazy" decoding="async">
          <svg class="cp-svg" viewBox="0 0 1000 538" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            ${GRAT.lat.map(l => { const y = proj([l, MAP.lon0]).y * 538; return `<line x1="0" x2="1000" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="r" x="964" y="${(y - 7).toFixed(1)}">${l}° с. ш.</text>`; }).join('')}
            ${GRAT.lon.map(l => { const x = proj([MAP.lat0, l]).x * 1000; return `<line y1="0" y2="538" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}"/><text x="${(x + 8).toFixed(1)}" y="36">${l}° в. д.</text>`; }).join('')}
            ${hub ? pins.filter(x => x !== hub).map(x => `<path class="cp-rt" data-city="${esc(x.o.city)}" d="${curve(hub.p, x.p)}"/>`).join('') : ''}
          </svg>
          ${pins.map(({o, i, p}) => `<button class="cp-pin${o === (hub && hub.o) ? ' is-hub' : ''}" type="button" data-city="${esc(o.city)}" data-side="${p.x > .62 ? 'l' : 'r'}" style="--x:${p.x.toFixed(4)};--y:${p.y.toFixed(4)}" aria-controls="office-${slug(o.city)}" aria-label="${esc(o.city)} — ${esc(o.role)}"><i aria-hidden="true"></i><span>${esc(o.city)}</span></button>`).join('')}
          <p class="cp-cap" aria-hidden="true">Схема расположения · не в масштабе</p>
        </div>
      </div>
      <div class="cp-offices" data-cp-offices>${offs.map((o, i) => `<article class="cp-office" id="office-${slug(o.city)}" data-city="${esc(o.city)}">
        <h3 class="cp-oh"><button class="cp-ob-t" type="button" aria-expanded="true" aria-controls="ob-${slug(o.city)}"><i>${no(i)}</i><b>${esc(o.city)}</b><span>${esc(o.role)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></h3>
        <div class="cp-ob" id="ob-${slug(o.city)}"><div class="cp-obi">
          <div class="cp-li">${I.pin}<span>${esc(o.addr)}</span></div>
          ${o.hours ? `<div class="cp-li">${I.clock}<span>${esc(o.hours)}</span></div>` : ''}
          ${o.phones.map(([p, l]) => `<div class="cp-li">${I.phone}<span><a href="tel:${p.replace(/[^+\d]/g, '')}" data-track="phone_click" data-place="contacts-office">${esc(p)}</a> · ${esc(l)}</span></div>`).join('')}
          ${o.emails.map(m => `<div class="cp-li">${I.mail}<span><a href="mailto:${m}" data-track="email_click" data-place="contacts-office">${esc(m)}</a></span></div>`).join('')}
          ${mapLinks(o, o.city === 'Москва')}
        </div></div>
      </article>`).join('')}</div>
    </div>
  </div></section>

  <section class="cp-sec cp-write"><div class="cp-in cp-write-in">
    <div class="cp-wr-copy reveal">
      <span class="cp-eyebrow">Обратная связь</span>
      <h2>Написать нам</h2>
      <p>Вопрос по продукции, обучению или сотрудничеству — ответим по почте или телефону.</p>
      ${stella}
    </div>
    <div class="cp-paper reveal" id="support">${S.formHTML('contact', {root: P.root, uid: 'ct'})}</div>
  </div></section>

  <section class="cp-sec cp-req"><div class="cp-in">
    <header class="cp-head"><span class="cp-eyebrow">Реквизиты</span><h2>Информация о компании</h2></header>
    <dl class="cp-ledger reveal">
      <div><dt>Наименование</dt><dd>${esc(rq.legalName)}</dd></div>
      <div><dt>ИНН</dt><dd>${rq.inn ? esc(rq.inn) : tbd}</dd></div>
      <div><dt>КПП</dt><dd>${rq.kpp ? esc(rq.kpp) : tbd}</dd></div>
      <div><dt>ОГРН</dt><dd>${rq.ogrn ? esc(rq.ogrn) : tbd}</dd></div>
      <div><dt>Юридический адрес</dt><dd>${rq.legalAddress ? esc(rq.legalAddress) : tbd}</dd></div>
      <div><dt>Фактический адрес</dt><dd>${esc(c.address)}</dd></div>
    </dl>
    <p class="cp-note">${esc(rq.note)}</p>
  </div></section>
  </div>`;
};
