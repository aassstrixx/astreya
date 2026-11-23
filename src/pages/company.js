/* «Компания» — страница v4 «CORPORATE EDITORIAL ATLAS» (по визуальному референсу владельца, 17.11.2026): корпоративная презентация в виде страниц премиального журнала —
   семь разделов в одной ленте: 1 портрет компании (текст слева, предметная композиция косметики на стеклянных арках справа) · 2 Астрея в цифрах · 3 направления деятельности (четыре
   компактные фото-карточки) · 4 портфель брендов (настоящие логотипы сеткой) · 5 философия и преимущества · 6 география (стилизованная карта России с подсказками) · 7 заключение.
   Данные — из прежних источников (data/content.json → company, advantages; data/brands.json; data/site.json → offices/contacts; data/events.json); ничего не выдумано: города проведения
   семинаров не названы офисами. Оформление — css/company-atrium.css (всё под .ca), поведение — js/company-atrium.js (без JS страница читаема).
   Крючки: h2 «Астрея по всей России» — к нему js/sales-pages.js пристраивает «Ваш регион»; блок преимуществ помечен data-sx-mod="trust" (продающий слой не дублирует «Почему доверять»);
   data-sx-closing="company-cta" в заключении; Стелла — только data-act="asst-open"; все data-track сохранены. Первый экран — атриум на весь экран (assets/company/atrium-v3*.webp, шапка прозрачная поверх него),
   тот же кадр — фон заключения под тёмной вуалью: так страница выглядела до v4 и так её просил владелец (в v4 я по ошибке заменил его предметной композицией; возвращено 17.11.2026). */
const fs = require('fs');
const path = require('path');
const S = require('../../js/shared.js');
const {T} = require('../texts.js');
const {esc, I, dparts} = S;
const ROOT = path.join(__dirname, '..', '..');
const has = f => { try { return fs.existsSync(path.join(ROOT, f)); } catch (e) { return false; } };

/* тонкие авторские значки преимуществ (линия 1.5): бриллиант · шапка выпускника · дом · метка · люди · столбики */
const ICON = [
  '<path d="M6 4h12l4 6-10 11L2 10z"/><path d="M2 10h20M9 4l-2 6 5 11M15 4l2 6-5 11"/>',
  '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5"/><path d="M22 9v6"/>',
  '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  '<path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14c3 .2 5 2 5 5"/>',
  '<path d="M4 20V10M10 20V5M16 20v-8M22 20H2"/>'];
const GEO = {'Москва': [37.62, 55.75], 'Санкт-Петербург': [30.32, 59.94], 'Ростов-на-Дону': [39.72, 47.22], 'Симферополь': [34.1, 44.95]};
/* Карта России владельца (assets/company/ru-map.svg, 1920×1108): коническая равноугольная проекция Ламберта, параметры подобраны по береговой линии карты
   (совпадение контуров 97 процентов, среднее отклонение берега 0,7–1,3 px). Координаты городов переводятся в проценты рамки карты — маркеры стоят на реальных местах. */
const MAP = {W: 1920, H: 1108, l0: 90.0438, p1: 46.9718, p2: 62.1925, s: 1463.4714, tx: 953.732, ty: 802.0278};
function mapAt(lon, lat) {
  const r = Math.PI / 180, a = MAP.p1 * r, b = MAP.p2 * r;
  const n = Math.log(Math.cos(a) / Math.cos(b)) / Math.log(Math.tan(Math.PI / 4 + b / 2) / Math.tan(Math.PI / 4 + a / 2));
  const F = Math.cos(a) * Math.pow(Math.tan(Math.PI / 4 + a / 2), n) / n;
  const rho = F / Math.pow(Math.tan(Math.PI / 4 + lat * r / 2), n), rho0 = F / Math.pow(Math.tan(Math.PI / 4 + 60 * r / 2), n), lam = (lon - MAP.l0) * r;
  const x = MAP.s * rho * Math.sin(n * lam) + MAP.tx, y = -MAP.s * (rho0 - rho * Math.cos(n * lam)) + MAP.ty;
  return {x: +(x / MAP.W * 100).toFixed(2), y: +(y / MAP.H * 100).toFixed(2)};
}

module.exports = function company(ctx, C, P) {
  const {content, brands, site, sortedEvents} = ctx, cp = content.company, u = f => C.u(P, f);
  const today = new Date().toISOString().slice(0, 10), up = sortedEvents.filter(e => e.date >= today);
  const stella = C.xon('assistant');
  const arrow = I.arrow;
  const img = (f, w, h, cls, alt, pos) => `<img${cls ? ` class="${cls}"` : ''} src="${u(f)}" alt="${esc(alt || '')}" width="${w}" height="${h}" loading="lazy" decoding="async"${pos ? ` style="object-position:${pos}"` : ''}>`;

  /* ---- 1 · портрет компании ---- */
  const heroArt = `<picture><source media="(max-width:760px)" srcset="${u('assets/company/atrium-v3-m.webp')}"><img src="${u('assets/company/atrium-v3-s.webp')}" srcset="${u('assets/company/atrium-v3-s.webp')} 1200w, ${u('assets/company/atrium-v3.webp')} 2400w" sizes="100vw" alt="" width="2400" height="1350" fetchpriority="high" decoding="async"></picture>`;

  /* ---- 2 · в цифрах ---- */
  const stats = [[brands.length, '', T('company.facts.s')], [ctx.products.length, '', T('company.facts.s2')], [20, '+', T('company.facts.s3')], [4, '', T('company.facts.s4')]];

  /* ---- 3 · направления ---- */
  /* карточка «Работа с регионами»: та же карта владельца, что и в блоке «Астрея по всей России» (assets/company/ru-map.svg), города — точками в процентах рамки карты */
  const mapPic = `<span class="ca-dp ca-dp-map" aria-hidden="true"><span class="ca-dm"><img src="${u('assets/company/ru-map.svg')}" alt="" width="1920" height="1108" loading="lazy" decoding="async">${Object.keys(GEO).map(k => { const p = mapAt(GEO[k][0], GEO[k][1]); return `<i style="left:${p.x}%;top:${p.y}%"></i>`; }).join('')}</span></span>`;
  const dirs = [
    {t: T('company.dirs.s'), p: T('company.dirs.s2'), href: u('catalog.html'), tr: 'catalog_click', pl: 'company-dir-1',
      pic: `<span class="ca-dp ca-dp-pk" aria-hidden="true">${img('assets/photos/dermatime-micellar.webp', 279, 900)}${img('assets/photos/iraltone-shampoo.webp', 329, 900)}${img('assets/photos/keenwell-mask.webp', 397, 900)}</span>`},
    {t: T('company.dirs.s3'), p: T('company.dirs.s4'), href: u('training.html'), tr: 'training_click', pl: 'company-dir-2',
      pic: `<span class="ca-dp ca-dp-ph" aria-hidden="true">${img('assets/news/ph-seminar-a.webp', 960, 540, '', '', '50% 36%')}</span>`},
    {t: T('company.dirs.s5'), p: T('company.dirs.s6'), href: u('contacts.html'), tr: 'contacts_click', pl: 'company-dir-3', pic: mapPic},
    {t: T('company.dirs.s7'), p: T('company.dirs.s8'), href: u('partners.html'), tr: 'partner_cta', pl: 'company-dir-4',
      pic: `<span class="ca-dp ca-dp-ph" aria-hidden="true">${img('assets/photos/photo-02b-about.webp', 768, 768, '', '', '50% 30%')}</span>`}];

  /* ---- 4 · бренды ---- */
  const tagOf = b => b.group === 'Cantabria Labs' ? T('company.brands.s') : b.group;
  const bcell = (b, i) => `<a class="ca-bc reveal" style="--c1:${esc(b.c1)}" href="${C.burl(P, b)}" data-track="brand_click" data-place="company-brands" aria-label="${esc(b.name)}"><span class="ca-bl">${b.logo ? `<img class="ca-blogo" src="${u(b.logo)}" alt="${esc(b.name)}" loading="lazy" decoding="async">` : `<b class="ca-bname">${esc(b.name)}</b>`}</span><small>${esc(tagOf(b))}</small></a>`;

  /* ---- 6 · география ---- */
  const [o1, o2] = site.offices;
  const roleOf = city => city === o1.city ? o1.role : city === o2.city ? o2.role : T('company.geo.s');
  const officeOf = city => city === o1.city ? o1 : city === o2.city ? o2 : null;
  const evIn = city => up.find(e => e.city === city);
    const mk = Object.keys(GEO).map((city, i) => {
    const p = mapAt(GEO[city][0], GEO[city][1]), o = officeOf(city), ev = evIn(city), role = roleOf(city), id = 'ca-tip-' + i;
    const side = i === 0 ? 'r' : i === 1 ? 'r' : i === 2 ? 'br' : 'tl';   /* подписи не заходят на точки: Ростов — под точкой справа, Симферополь — над точкой */
    const body = o ? `<span class="ca-tl">${esc(o.addr)}</span>${o.phones[0] ? `<a href="tel:${o.phones[0][0].replace(/[^+\d]/g, '')}" data-track="phone_click">${esc(o.phones[0][0])}</a>` : ''}`
      : `<span class="ca-tl">${T('company.geo.t')}</span>${ev ? `<a href="${C.eurl(P, ev)}" data-track="event_click" data-place="company-geo"><time datetime="${ev.date}">${dparts(ev.date).d} ${esc(dparts(ev.date).m)}</time> · ${esc(ev.title)}</a>` : `<a href="${u('training.html')}" data-track="training_click" data-place="company-geo">${T('company.geo.a')}</a>`}`;
    return `<div class="ca-mw s-${side}${o ? ' is-office' : ' is-sem'}" data-city="${esc(city)}" style="left:${p.x}%;top:${p.y}%;--i:${i}">
      <button class="ca-mk" type="button" aria-describedby="${id}" aria-label="${esc(city)} — ${esc(role)}" data-city="${esc(city)}"><i aria-hidden="true"></i><span class="ca-mn">${esc(city)}</span></button>
      <div class="ca-tip" id="${id}" role="tooltip"><b>${esc(city)}</b><em>${esc(role)}</em>${body}</div></div>`; }).join('');
  const cardOf = city => { const o = officeOf(city), ev = evIn(city), role = roleOf(city), ph = o && o.phones[0] ? o.phones[0] : null;
    const evl = ev ? `<a class="ca-cl" href="${C.eurl(P, ev)}" data-track="event_click" data-place="company-map"><time datetime="${ev.date}">${dparts(ev.date).d} ${esc(dparts(ev.date).m)}</time> · ${esc(ev.title)}</a>`
      : `<a class="ca-cl" href="${u('training.html')}" data-track="training_click" data-place="company-map">${T('company.geo.a2')}</a>`;
    return `<article class="ca-cd" data-city="${esc(city)}" aria-label="${esc(city)}"><em>${esc(role)}</em><h3>${esc(city)}</h3><p>${esc(o ? o.addr : T('company.geo.t'))}</p>${o && o.hours ? `<p class="ca-ch">${esc(o.hours)}</p>` : ''}<div class="ca-cr">${ph ? `<a class="ca-cl" href="tel:${ph[0].replace(/[^+\d]/g, '')}" data-track="phone_click" data-place="company-map">${esc(ph[0])}</a>` : ''}${evl}</div></article>`; };
  const cityBtns = Object.keys(GEO).map((city, i) => `<li><button class="ca-cb" type="button" data-city="${esc(city)}" aria-pressed="${i === 0 ? 'true' : 'false'}"><b>${esc(city)}</b><small>${esc(officeOf(city) ? T('company.geo.s2') : T('company.geo.s3'))}</small></button></li>`).join('');
  const globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>';
  const geoItems = [
    {ic: I.pin, k: '2', t: T('company.geo.s4'), d: `${o1.city} — ${o1.role.toLowerCase()}; ${o2.city} — ${o2.role.toLowerCase()}`},
    {ic: I.pin, k: '2', t: T('company.geo.s5'), d: T('company.geo.s6'), hollow: true},
    {ic: globe, k: T('company.geo.s7'), t: T('company.geo.s8'), d: T('company.geo.s9')}];

  /* ---- 7 · заключение ---- */
  const finImg = has('assets/company/atrium-v3.webp') ? 'assets/company/atrium-v3.webp' : 'assets/company/atrium.webp';

  return `<div class="ca" data-ca>
  <section class="ca-s ca-hero" id="ca-entry" data-scene="1" data-title="${T('company.sidenav.nav')}" aria-labelledby="ca-h1">
    <div class="ca-hero-art" aria-hidden="true">${heroArt}<i class="ca-hero-veil"></i></div>
    <div class="ca-in ca-hero-in">
      <div class="ca-copy" data-ca-copy>
        <span class="ca-eyebrow reveal">${T('company.sidenav.nav')}</span>
        <h1 id="ca-h1" class="reveal" data-nosplit>${T('company.hero.h1')}</h1>
        <p class="ca-lead reveal">${T('company.hero.lead')}</p>
        <div class="ca-cta reveal"><a class="ca-btn-o" href="#ca-stats" data-act="scroll" data-target="ca-stats" data-track="company_intro" data-place="company-hero"><span>${T('company.hero.t')}</span>${arrow}</a></div>
      </div>
    </div>
  </section>

  <section class="ca-s ca-stats" id="ca-stats" data-scene="2" data-title="${T('company.sidenav.nav2')}" aria-label="${T('company.hero.aria')}">
    
    <ul class="ca-in ca-stl">${stats.map(([n, sf, t], i) => `<li class="ca-stat reveal"><b><span>${n}</span>${sf}</b><span>${esc(t)}</span></li>`).join('')}</ul>
  </section>

  <section class="ca-s ca-dirs" id="ca-niches" data-scene="3" data-title="${T('company.sidenav.nav3')}" aria-labelledby="ca-h2">
    <div class="ca-in ca-dir-in">
      <header class="ca-dirs-h reveal"><span class="ca-eyebrow">${T('company.dirs.eyebrow')}</span><h2 id="ca-h2">${T('company.dirs.h2')}</h2></header>
      <ul class="ca-dl">${dirs.map((d, i) => `<li class="ca-dc reveal"><a href="${d.href}" data-track="${d.tr}" data-place="${d.pl}" aria-label="${esc(d.t)}">
        <span class="ca-dpw">${d.pic}</span><span class="ca-dt"><b>${esc(d.t)}</b><small>${esc(d.p)}</small></span><span class="ca-go" aria-hidden="true">${arrow}</span></a></li>`).join('')}</ul>
    </div>
  </section>

  <section class="ca-s ca-brands" id="ca-expo" data-scene="4" data-title="${T('company.sidenav.nav4')}" aria-labelledby="ca-h3">
    <div class="ca-in ca-br-in">
      <div class="ca-br-t reveal">
        <span class="ca-eyebrow">${T('company.brands.eyebrow')}</span><h2 id="ca-h3">${T('company.brands.h2')}</h2>
        <p class="ca-p">${esc(cp.who[0])}</p>
        <p class="ca-note"><img class="ca-mkl" src="${u('assets/brands/cantabria-labs-h.svg')}" alt="Cantabria Labs" loading="lazy" decoding="async"><span>${T('company.brands.t')}</span></p>
        <div class="ca-cta"><a class="ca-btn-o" href="${u('brands.html')}" data-track="brands_click" data-place="company-brands"><span>${T('company.brands.t2')}</span>${arrow}</a></div>
      </div>
      <div class="ca-bgrid reveal">${brands.map(bcell).join('')}</div>
    </div>
  </section>

  <section class="ca-s ca-phil" id="ca-phil" data-scene="5" data-title="${T('company.sidenav.nav5')}" aria-labelledby="ca-h5">
    <i class="ca-ribbon" aria-hidden="true"></i>
    <div class="ca-in ca-phil-in">
      <header class="ca-phil-t reveal"><span class="ca-eyebrow">${T('company.adv.eyebrow')}</span><h2 id="ca-h5">${T('company.adv.h2')}</h2>
        <p class="ca-p">${T('company.adv.p')}</p>
        <figure class="ca-ph ca-ph-team" aria-hidden="true">${img('assets/photos/photo-02-about.webp', 800, 533, '', '', '50% 20%')}</figure></header>
      <ul class="ca-adv reveal" data-sx-mod="trust" aria-label="${T('company.adv.aria')}">${content.advantages.map((a, i) => `<li class="ca-av reveal"><span class="ca-ai" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[i % ICON.length]}</svg></span>
        <div><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div></li>`).join('')}</ul>
      <ul class="ca-pts">
        <li class="reveal"><b>${T('company.adv.b')}</b><span>${T('company.adv.t')}</span></li>
        <li class="reveal"><b>${T('company.adv.b2')}</b><span>${T('company.adv.t2')}</span></li>
        <li class="reveal"><b>${T('company.adv.b3')}</b><span>${T('company.adv.t3')}</span></li>
        <li class="reveal"><b>${T('company.adv.b4')}</b><span>${T('company.adv.t4')}</span></li>
      </ul>
    </div>
  </section>

  <section class="ca-s ca-center" id="ca-center" data-scene="6" data-title="${T('company.dirs.s3')}" aria-labelledby="ca-h6">
    <i class="ca-ribbon" aria-hidden="true"></i>
    <div class="ca-in ca-center-in">
      <div class="ca-center-t">
        <span class="ca-eyebrow reveal">${T('company.academy.eyebrow')}</span><h2 id="ca-h6" class="reveal">${T('company.academy.h2')}</h2>
        <p class="ca-p reveal">${T('company.academy.p')}</p>
        <ul class="ca-tags"><li class="reveal">${T('company.academy.li')}</li><li class="reveal">${T('company.academy.li2')}</li><li class="reveal">${T('company.academy.li3')}</li></ul>
        <div class="ca-cta reveal"><a class="ca-btn-o" href="${u('training.html')}" data-track="training_click" data-place="company-center"><span>${T('company.geo.a2')}</span>${arrow}</a></div>
      </div>
      <div class="ca-cph" aria-hidden="true"><figure class="ca-ph reveal">${img('assets/news/ph-seminar-a.webp', 960, 540, '', '', '46% 40%')}</figure><figure class="ca-ph reveal">${img('assets/news/ph-seminar-b.webp', 960, 540, '', '', '50% 40%')}</figure></div>
    </div>
  </section>

  <section class="ca-s ca-geo" id="ca-geo" data-scene="7" data-title="${T('company.sidenav.nav6')}" aria-labelledby="ca-h7">
    <div class="ca-in ca-geo-in">
      <div class="ca-geo-t reveal">
        <span class="ca-eyebrow">${T('company.distr.eyebrow')}</span><h2 id="ca-h7">${T('company.distr.h2')}</h2>
        <p class="ca-p">${T('company.distr.p')}</p>
        <p class="ca-quote">${T('company.distr.p2')}</p>
        <div class="ca-cta"><a class="ca-btn-o" href="${u('contacts.html')}" data-track="contacts_click" data-place="company-geo"><span>${T('company.distr.t')}</span>${arrow}</a></div>
      </div>
      <ul class="ca-gi">${geoItems.map((g, i) => `<li class="ca-gic reveal"><span class="ca-gii${g.hollow ? ' is-h' : ''}" aria-hidden="true">${g.ic}</span><div><b>${esc(g.k)}</b> <span>${esc(g.t)}</span><small>${esc(g.d)}</small></div></li>`).join('')}</ul>
    </div>
    <div class="ca-in ca-atlas" id="ca-atlas" aria-label="${T('company.distr.aria')}">
      <div class="ca-atl-l reveal">
        <ul class="ca-cities">${cityBtns}</ul>
        <div class="ca-cds" aria-live="polite">${Object.keys(GEO).map(cardOf).join('')}</div>
      </div>
      <figure class="ca-map reveal" aria-label="${T('company.distr.aria2')}">
        <div class="ca-mapview"><div class="ca-mapbox"><img src="${u('assets/company/ru-map.svg')}" alt="" width="1920" height="1108" loading="lazy" decoding="async">${mk}</div></div>
        <figcaption><span><i class="d-o"></i>${T('company.geo.s2')}</span><span><i class="d-s"></i>${T('company.geo.s')}</span><span class="ca-hint">${T('company.distr.t2')}</span></figcaption>
      </figure>
    </div>
  </section>

  <section class="ca-s ca-final" id="ca-final" data-scene="8" data-title="${T('company.sidenav.nav7')}" aria-labelledby="ca-h9">
    <div class="ca-fin-bg" aria-hidden="true"><img src="${u(finImg)}" alt="" width="2400" height="1350" loading="lazy" decoding="async"></div>
    <div class="ca-in ca-fin reveal" data-sx-closing="company-cta">
      <div class="ca-fin-t"><h2 id="ca-h9">${T('company.closing.h2')}</h2>
      <p class="ca-sign">${T('company.closing.p')}<br>${T('company.closing.tx')}</p></div>
      <div class="ca-fin-b"><a class="btn btn-light ac-pill" href="${u('training.html')}" data-track="closing_cta" data-place="company-cta">${T('company.closing.a')} ${arrow}</a>${C.partnerBtn(P, 'company', 'btn btn-ghost-inv')}${stella ? `<button class="ca-ask" type="button" data-act="asst-open" data-track="asst_open" data-place="company">${I.chat || ''}<span>${T('company.closing.t')}</span></button>` : ''}</div>
    </div>
  </section>
</div>`;
};
