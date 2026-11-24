const fs = require('fs');
const path = require('path');
const S = require('../../js/shared.js');
const {T} = require('../texts.js');
const {esc, I, bstyle, dparts} = S;

/* Страница мероприятия v2 («Билет»): кадр брендовой ниши (assets/detail/stage-brand.webp) — слева в нише логотип и упаковки бренда семинара, справа на каменной стене лежит
   билет-приглашение: корешок с датой крупно, перфорация, название, описание, таймер и кнопка «Записаться». Ниже — программа таймлайном, «паспорт события» (дата, время, адрес из data/events.json,
   формат, преподаватель), условия участия, форма регистрации и другие мероприятия. Программа по блокам и число мест в данных не заданы — показывается «Уточняется».
   Крючки для js сохранены: [data-event][data-date], #past-note, #e-cta (js/pages.js прячет для прошедших, js/sales-pages.js вставляет «Как проходит запись»), .cd-slot (js/explore.js),
   #register, форма seminar (S.formHTML), data-act/data-track. Свои стили и скрипты — css/pg-event.css, js/pg-event.js (собираются из src/detail/). */
const ROOT = path.join(__dirname, '..', '..');
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const PH = 1520, STAGE = (readJson('assets/detail/stage.json') || {}).brand || {};
const SLOTS = STAGE.slots && STAGE.slots.length ? STAGE.slots : [{x: .253, y: .823, pxcm: 22.5}, {x: .1, y: .86, pxcm: 22.5}, {x: .398, y: .875, pxcm: 22.5}];
const NICHE = STAGE.niche || {cx: .25};
const MOON = STAGE.moon || {};
const LOGO_BOX = MOON.cy ? `;--cy:${Math.round(MOON.cy * 100000) / 1000}%;--lw:${Math.round(MOON.w * 60000) / 1000}%;--lh:${Math.round(MOON.h * 50000) / 1000}%` : '';       // логотип по центру светящегося окна арки (как на странице бренда)
const PACKS = readJson('assets/showroom/packs.json') || {};
const PACK_CM = {tube: 14.4, bottle: 21.9, pump: 22.9, dropper: 15.6, jar: 6.0, box: 13.0, device: 15.6};
const f1 = n => Math.round(n * 1000) / 1000;
const spriteAr = src => { const e = PACKS[path.basename(src).replace(/\.webp$/, '')]; return e && e.w && e.h ? e.w / e.h : .3; };

module.exports = function eventPage(ctx, C, P, e) {
  const b = ctx.brandById[e.brand], t = ctx.teacherById[e.teacher], d = dparts(e.date);
  const others = ctx.sortedEvents.filter(x => x.id !== e.id).slice(0, 3);
  const online = e.fmt !== 'Очно';
  const future = e.date >= new Date().toISOString().slice(0, 10);
  const [t0, t1] = String(e.time || '').split(/\s*[–-]\s*/);
  const register = (cls, place, label = T('event.labels.s')) => `<button class="${cls}" type="button" data-act="form" data-type="seminar" data-ref="${e.id}" data-track="event_register" data-place="${place}">${label} ${I.arrow}</button>`;
  const facts = [[T('event.labels.s2'), C.timeTag(e.date)], [T('event.labels.s3'), esc(e.time)], [T('event.labels.s4'), esc(e.city)], [T('event.labels.s5'), esc(e.fmt)], [online ? T('event.labels.s6') : T('event.labels.s7'), esc(e.place)],
    [T('event.labels.s8'), esc(e.speaker)], [T('event.labels.s9'), `<a href="${C.burl(P, b)}">${esc(b.name)}</a>`], [T('event.labels.s10'), e.seats ? esc(String(e.seats)) : T('event.labels.s11')]];

  /* ниша бренда: логотип и две упаковки бренда на подставках */
  const prods = ctx.products.filter(p => p.brand === b.id), seen = new Set(), pick = [];
  [...prods.filter(p => p.isNew), ...prods].forEach(p => { const s = S.packOf(p); if (!seen.has(s) && pick.length < 2) { seen.add(s); pick.push(p); } });
  const packs = pick.map((p, k) => { const s = SLOTS[k], src = S.packOf(p), hp = f1((PACK_CM[p.type || 'bottle'] || 21.9) * s.pxcm / PH * 100);
    return `<div class="pdp-pack dtb-pk" style="left:${f1(s.x * 100)}%;top:${f1(s.y * 100 + .4)}%;--hp:${hp};--sar:${f1(spriteAr(src))};--k:${k}" aria-hidden="true">
        <img class="pdp-cs" src="${esc(C.u(P, src))}" alt="" decoding="async"><img class="pdp-pk" src="${esc(C.u(P, src))}" alt="" decoding="async"></div>`; }).join('');
  const logo = b.logo
    ? `<span class="dtb-logo" style="--cx:${f1((MOON.cx || NICHE.cx) * 100)}%${LOGO_BOX}"><img src="${esc(C.u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}"` : ''} decoding="async"></span>`
    : `<span class="dtb-logo is-text" style="--cx:${f1((MOON.cx || NICHE.cx) * 100)}%${LOGO_BOX}"><b>${esc(b.name)}</b></span>`;

  const route = `<nav class="dt-route" aria-label="${T('event.route.aria')}">
      <ol>
        <li style="--i:0" class="is-home"><a href="${C.u(P, 'index.html')}" aria-label="${T('common.aria.home')}"><svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 9.4 10 4l6.5 5.4M5.3 8.2V16h9.4V8.2M8.4 16v-4.2h3.2V16"/></svg></a></li>
        <li style="--i:1"><a href="${C.u(P, 'training.html')}"><small>${T('event.route.sm')}</small><b>${T('event.route.b')}</b></a></li>
        <li style="--i:2"><a href="${C.burl(P, b)}"><small>${T('event.labels.s9')}</small><b>${esc(b.name)}</b></a></li>
        <li style="--i:3" aria-current="page"><small>${T('event.route.sm2')}</small><b>${esc(e.title)}</b></li>
      </ol>
      <a class="dt-back" href="${C.u(P, 'training.html')}">${I.back}<span>${T('event.route.t')}</span></a>
    </nav>`;

  /* программа: только то, что есть в данных (время, место/подключение, описание); состав блоков — «Уточняется» */
  const steps = [
    [t0 || T('event.prog.s'), T('event.prog.s'), online ? T('event.prog.s2') : `${esc(e.city)}${/\d/.test(e.place) && !/^Адрес/i.test(e.place) ? ', ' : '. '}${esc(e.place)}.`],
    [T('event.prog.s3'), T('event.prog.s4'), `${esc(e.description)}${online ? '' : ' ' + T('common.pages.eventTheory')}`],
    [T('event.prog.s5'), T('event.prog.s6'), `<span class="tbd">${T('common.pages.eventTbd')}</span>`],
    [t1 || T('event.prog.s7'), T('event.prog.s8'), T('event.prog.s9')]
  ];
  const timeline = `<ol class="dtev-line">${steps.map(([k, h, p], i) => `<li class="reveal" style="--i:${i}"><span class="dtev-k">${esc(k)}</span><span class="dtev-dot" aria-hidden="true"></span><div><h3>${h}</h3><p>${p}</p></div></li>`).join('')}</ol>`;

  return `<div class="dt dtev" style="${bstyle(b)}" data-event="${e.id}" data-date="${e.date}" data-page-root>
    <section class="e-hero dt-stage dtev-stage" data-dt-stage style="--px:${f1(NICHE.cx)};--py:${f1(NICHE.bottom || .91)}">
      <div class="dt-view">
        <div class="dt-world">
          <i class="dt-glint" aria-hidden="true"></i>
          <picture><source media="(max-width:900px)" srcset="${C.u(P, 'assets/detail/stage-brand-s.webp')}"><img class="dt-plate" src="${C.u(P, 'assets/detail/stage-brand.webp')}" alt="" width="2880" height="1520" decoding="async" fetchpriority="high"></picture>
          ${logo}${packs}
        </div>
      </div>
      <div class="dt-over wrap">
        ${route}
        <div class="dt-ticket e-top">
          <div class="dt-stub"><span class="dt-stub-k">${online ? T('event.fmt.s') : T('event.fmt.s2')}</span><time datetime="${e.date}"><b>${d.d}</b><span>${d.m}</span><em>${d.y}</em></time><span class="dt-stub-t">${esc(e.time)}</span></div>
          <div class="dt-tk-body">
            <span class="tag blue">${esc(e.fmt)} · ${esc(e.city)}</span>
            <h1>${esc(e.title)}</h1>
            <p class="lead">${esc(e.description)}</p>
            ${future ? C.cdSlot() : ''}
            <div class="notice past" id="past-note" hidden>${I.info}<span>${T('common.pages.eventPast', {link: `<a href="${C.u(P, 'training.html')}">${T('event.hero.a')}</a>`})}</span></div>
            <div class="row" id="e-cta">${register('btn btn-fill', 'event-hero')}
              <a class="btn btn-ghost" href="${C.u(P, 'training.html')}">${T('event.hero.a2')}</a></div>
          </div>
        </div>
      </div>
    </section>

    <section class="sec dtev-main wrap" aria-label="${T('event.main.aria')}">
      <div class="dtev-prog">
        <span class="eyebrow in">${T('event.main.eyebrow')}</span>
        <h2>${T('event.main.h2')} ${online ? T('event.main.s') : T('event.main.s2')}</h2>
        ${timeline}
        <div class="dtev-after" data-dt-ticket-slot></div>
      </div>
      <aside class="dtev-pass reveal" aria-label="${T('event.pass.aria')}">
        <span class="dtev-pass-k">${online ? T('event.fmt.s') : T('event.fmt.s2')} · ${esc(b.name)}</span>
        <dl class="facts-dl">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      </aside>
    </section>

    <section class="dtev-terms wrap">
      <article class="dt-tile reveal"><span class="dt-no" aria-hidden="true">01</span><h2>${T('event.join.h2')}</h2><p>${T('event.join.p')}</p></article>
      <article class="dt-tile reveal"><span class="dt-no" aria-hidden="true">02</span><h2>${online ? T('event.labels.s6') : T('event.join.s')}</h2><p>${online ? T('common.pages.eventWebinar') : T('common.pages.eventWhere', {city: esc(e.city), place: esc(e.place)})}</p></article>
      ${t ? `<article class="card tcard card-pad reveal e-teacher dtev-teacher"><div class="avatar" aria-hidden="true">${esc(t.mono)}</div><div><span class="eyebrow in">${T('event.labels.s8')}</span><h3>${esc(t.name)}</h3><p>${esc(t.spec)}</p><div class="tasks-line">${t.topics.map(x => C.tag(x)).join('')}</div></div></article>` : ''}
    </section>

    <section class="sec dtev-reg wrap" id="register" style="padding-top:0">
      <div class="reg-card card card-pad reveal">
        <div><span class="eyebrow in">${T('event.reg.eyebrow')}</span><h2>${T('event.reg.h2')}</h2><p class="muted">${T('event.reg.p')}</p>
          <p class="muted small">${esc(e.title)} — ${d.full}, ${esc(e.city)}</p></div>
        <div>${S.formHTML('seminar', {root: P.root, uid: 'ev', ref: e.id})}</div>
      </div>
    </section>

    <section class="sec dtev-others wrap" style="padding-top:0">
      ${C.secHead(T('event.route.b'), T('event.more.s'), C.lnk(C.u(P, 'training.html'), T('event.route.t')))}
      <div class="grid g3 events-grid">${others.map(x => C.eventCard(P, x)).join('')}</div>
    </section>

    <div class="dt-bar" data-dt-bar hidden aria-hidden="true">
      <div class="wrap"><span class="dt-bar-t"><small>${d.d} ${d.m} · ${esc(e.city)}</small><b>${esc(e.title)}</b></span>${register('btn btn-fill btn-sm', 'event-sticky')}</div>
    </div>
  </div>`;
};
