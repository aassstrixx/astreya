/* ASTREYA HOUSE — главная как архитектурный дом (data/redesign.json → house; css/house.css; js/house.js; docs/ASTREYA-HOUSE.md).
   Центральный зал (поверх последнего кадра сцены #arch-story): приветствие, проходы в комнаты, журнал на столике. Семь комнат подряд — в каждой лежит
   настоящее содержимое прежней главной (те же секции, те же ссылки, якоря и события аналитики), а журнал собирается из тех же данных и ведёт в те же комнаты.
   Ничего не выдумано: цифры, бренды, задачи, события, новости, преподаватели, контакты — из data/*.json; здесь только компоновка. */
const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function homeHouse(ctx, C, P, deps) {
  const rd = ctx.redesign, H = rd.house, content = ctx.content, h = content.home, site = ctx.site, brands = ctx.brands, tasks = ctx.tasks;
  const {events, val, img, hpS, brandsX, news, fork, finalCta, marquee} = deps;
  const hp = rd.homePath, ed = rd.editorial, tr = rd.training, A = hp.academy, F = hp.finder, R = hp.roles, ST = hp.steps, sol = rd.solutions;
  const href = x => { const [path, hash] = x.split('#'); return C.u(P, path) + (hash ? '#' + hash : ''); };
  const rooms = H.rooms.map((r, i) => Object.assign({no: i + 1, n2: String(i + 1).padStart(2, '0')}, r));
  const roomBy = id => rooms.find(r => r.id === id);
  const pc = (n, one, few, many) => `${n} ${S.plural(n, one, few, many)}`;
  const next = events[0];
  const pct = n => (Math.round(n * 1000) / 10) + '%';

  /* ---------------------------------------------------------------- зал: проходы, журнал на столике, приветствие */
  const hallBox = (b, k) => `--x:${b[0]};--y:${b[1]};--w:${b[2]};--h:${b[3] === undefined ? 0 : b[3]}`;
  const doors = H.hall.doors.map(d => {
    const r = roomBy(d.room); if (!r) return '';
    return `<a class="hall-door" href="#room-${r.id}" data-house-go="${r.id}" data-track="house_door" data-room="${r.id}" style="${hallBox(d.d)};--xm:${d.m[0]};--ym:${d.m[1]};--wm:${d.m[2]};--hm:${d.m[3]}" aria-label="Открыть комнату ${r.n2}: ${esc(r.name)}">
      <span class="hd-arch" aria-hidden="true"></span><span class="hd-tag"><b>${r.n2}</b><span>${esc(r.name)}</span></span></a>`;
  }).join('');
  const tb = H.hall.table;
  /* журнал на столике: раскрытый разворот (обложка слева — фото, справа — содержание), только для глаз; настоящий журнал — в диалоге ниже */
  const prevLine = r => `<li><b>${r.n2}</b><span>${esc(r.short)}</span></li>`;
  const mc = H.mag, cover = rd.photos.hero, hello = rd.photos.about;
  const magTable = `<div class="hall-mag" style="--tx:${tb.d[0]};--ty:${tb.d[1]};--tw:${tb.d[2]};--txm:${tb.m[0]};--tym:${tb.m[1]};--twm:${tb.m[2]}">
      <button class="mag-prev" type="button" data-house-mag aria-haspopup="dialog" aria-controls="mag" data-track="house_magazine" data-place="table"><span class="mag-prev-b" aria-hidden="true">
        <span class="mp-l"><img src="${C.u(P, hello.src)}" alt="" width="${hello.w}" height="${hello.h}" loading="lazy" decoding="async"><i>${esc(site.tagline.split('.')[0])}.</i></span>
        <span class="mp-r"><em>${esc(mc.tocTitle)}</em><ol>${rooms.map(prevLine).join('')}</ol></span></span>
        <span class="mag-hint">${esc(H.hall.hint)}</span><span class="sr">Журнал ASTREYA: открыть и листать — оглавление и переходы в комнаты</span></button>
    </div>`;
  const hallWorld = `<div class="hall-doors" role="group" aria-label="${esc(H.hall.doorsLabel)}">${doors}</div>${magTable}`;
  const hallGreeting = `<p class="hall-greet reveal">${esc(H.hall.greeting)}</p>`;
  const hallRooms = `<nav class="hall-rooms" aria-label="${esc(H.hall.doorsLabel)}"><ol>${rooms.map(r => `<li><a href="#room-${r.id}" data-house-go="${r.id}" data-track="house_room" data-place="hall"><b>${r.n2}</b><span>${esc(r.short)}</span></a></li>`).join('')}</ol></nav>`;

  /* ---------------------------------------------------------------- комнаты */
  const roomTag = r => `<p class="room-tag"><b>${r.n2}</b><span>${esc(r.name)}</span></p>`;
  const roomNav = (r, i) => {
    const pv = rooms[i - 1], nx = rooms[i + 1];
    return `<nav class="room-nav" aria-label="${esc(H.nav.label)}">
      <a class="rn-hall" href="#hall" data-house-hall>${I.arrow}<span>${esc(H.nav.hall)}</span></a>
      <button class="rn-mag" type="button" data-house-mag data-mag-room="${r.id}" aria-haspopup="dialog" aria-controls="mag">${esc(H.nav.magazine)}</button>
      <span class="rn-sp"></span>
      ${pv ? `<a class="rn-pv" href="#room-${pv.id}" data-house-go="${pv.id}" aria-label="${esc(H.nav.prev)}: ${esc(pv.name)}">${I.arrow}<span>${pv.n2} ${esc(pv.short)}</span></a>` : ''}
      ${nx ? `<a class="rn-nx" href="#room-${nx.id}" data-house-go="${nx.id}" aria-label="${esc(H.nav.next)}: ${esc(nx.name)}"><span>${nx.n2} ${esc(nx.short)}</span>${I.arrow}</a>` : ''}
    </nav>`;
  };
  const roomDoor = (r, i) => {
    const nx = rooms[i + 1];
    if (!nx) return `<a class="room-door rd-end" href="${C.u(P, 'contacts.html')}" data-track="house_contacts"><span class="rd-arch" aria-hidden="true"></span><small>Дальше</small><b>Контакты и подвал</b></a>`;
    return `<a class="room-door" href="#room-${nx.id}" data-house-go="${nx.id}"><span class="rd-arch" aria-hidden="true"></span><small>${esc(H.nav.next)}</small><b>${nx.n2} · ${esc(nx.name)}</b></a>`;
  };
  const room = (r, i, body, cls = '') => `<section class="room room-${r.id}${cls ? ' ' + cls : ''}" id="room-${r.id}" data-room="${r.id}" data-no="${r.no}" aria-label="Комната ${r.n2}: ${esc(r.name)}">
    <div class="room-stage" aria-hidden="true"><i class="room-bg"></i><i class="room-sun"></i></div>
    <div class="wrap room-top">${roomTag(r)}${roomNav(r, i)}</div>
    <div class="room-body">${body}</div>
    ${roomDoor(r, i)}
  </section>`;

  /* 04 экспертиза: фото эксперта + преподаватели + обещание (верх прежнего «учебного» блока) */
  const faces = rd.teachers.items.slice(0, 5);
  const expertise = `<section class="rd-sec hp-acad hp-exp" id="expertise-block" aria-labelledby="hp-exp-h"><div class="wrap">
    <div class="hp-acad-grid">
      <figure class="hp-acad-photo reveal">${img(ed.photo, '', ' loading="lazy"')}
        <a class="hp-faces" href="${href(A.teachersHref)}" aria-label="${esc(A.teachersLabel)}"><span class="hp-faces-row">${faces.map(t => `<img src="${C.u(P, t.photo)}" alt="" width="280" height="300" loading="lazy" decoding="async">`).join('')}</span><span class="hp-faces-t">${esc(A.teachersLabel)} ${I.arrow}</span></a></figure>
      <div class="hp-acad-copy">
        <span class="eyebrow reveal">${esc(ed.eyebrow)}</span>
        <h2 id="hp-exp-h" class="reveal"><span class="l1">${ed.lead.map(esc).join(' ')}</span> <span class="l2">${ed.accent.map(esc).join(' ')}</span></h2>
        <p class="hp-sub reveal">${esc(tr.sub)}</p>
        <ul class="hp-facts reveal">${A.facts.map(f => `<li>${I.check}<span>${esc(f)}</span></li>`).join('')}</ul>
        <div class="row hp-acad-cta reveal"><a class="btn btn-light" href="${href(A.teachersHref)}">${esc(A.teachersLabel)} ${I.arrow}</a><a class="btn btn-ghost-inv" href="${C.u(P, ed.cta.href)}">${esc(A.about)}</a></div>
      </div>
    </div>
  </div></section>`;

  /* 05 учебный центр: ближайшее мероприятие с отсчётом и ближайшие встречи */
  const nextBlock = next
    ? (() => { const d = S.dparts(next.date), b = ctx.brandById[next.brand]; return `<a class="hp-next reveal" href="${C.eurl(P, next)}"><span class="hp-date"><b>${d.d}</b><i>${d.m}</i></span><span class="hp-next-t"><small>Ближайшее мероприятие</small><b>${esc(next.title)}</b><em>${esc(next.fmt)} · ${esc(next.city)} · ${esc(b.name)}</em></span>${I.arrow}</a>`; })()
    : `<p class="hp-next-none">${esc(tr.emptyNote)}</p>`;
  const evCard = e => { const d = S.dparts(e.date), b = ctx.brandById[e.brand]; return `<a class="hp-ev reveal" href="${C.eurl(P, e)}"><span class="hp-date"><b>${d.d}</b><i>${d.m}</i></span><span class="hp-ev-t"><b>${esc(e.title)}</b><em>${esc(e.fmt)} · ${esc(e.city)} · ${esc(b.name)}</em></span></a>`; };
  const academy = `<section class="rd-sec hp-acad hp-train" id="training-block" aria-labelledby="hp-train-h"><div class="wrap">
    <header class="hp-head"><div><span class="eyebrow">${esc(tr.eyebrow)}</span><h2 id="hp-train-h" class="reveal">${esc(tr.title)}</h2></div><p class="lead reveal">${esc(tr.text)}</p></header>
    <div class="hp-train-grid">
      <div class="hp-train-main">
        <p class="hp-sub reveal">${esc(tr.sub)}</p>
        <ul class="hp-facts reveal">${A.facts.map(f => `<li>${I.check}<span>${esc(f)}</span></li>`).join('')}</ul>
        ${nextBlock}
        ${next ? C.cdSlot() : ''}
        <div class="row hp-acad-cta reveal"><a class="btn btn-fill" href="${C.u(P, 'training.html')}">${esc(A.all)} ${I.arrow}</a>${next ? `<a class="btn btn-ghost" href="${C.eurl(P, next)}">Подробнее</a>` : ''}</div>
      </div>
      ${events.length > 1 ? `<div class="hp-events" id="home-events" role="group" aria-label="${esc(A.eventsLabel)}">${events.slice(1, 4).map(evCard).join('')}</div>` : ''}
    </div>
  </div></section>`;

  /* 07 редакция: новости; путь к событиям и контактам */
  const editorial = `${news}
    <div class="wrap hp-ed-more"><div class="row"><a class="btn btn-ghost" href="${C.u(P, 'training.html')}">${esc(A.all)} ${I.arrow}</a><a class="btn btn-ghost" href="${C.u(P, 'contacts.html')}" data-track="house_contacts">Контакты ${I.arrow}</a></div></div>`;

  const bodies = {
    about: hpS.proofSec,
    brands: brandsX || '',
    finder: hpS.finderSec,
    expertise,
    academy,
    partners: `${hpS.rolesSec}${fork || ''}${hpS.stepsSec}${finalCta}`,
    editorial
  };
  const roomsHtml = rooms.map((r, i) => room(r, i, bodies[r.id] || '')).join('\n\n  ');

  /* ---------------------------------------------------------------- журнал: настоящие страницы, содержимое — из данных */
  const ph = k => rd.photos[k];
  const pimg = (k, cls = '') => { const f = ph(k); return `<img${cls ? ` class="${cls}"` : ''} src="${C.u(P, f.src)}" alt="${esc(f.alt)}" width="${f.w}" height="${f.h}" loading="lazy" decoding="async">`; };
  const foot = (n, side) => `<footer class="pg-f ${side}"><span>ASTREYA</span><b>${n}</b></footer>`;
  const openBtn = r => `<a class="btn btn-fill btn-sm mg-open" href="#room-${r.id}" data-house-go="${r.id}" data-mag-close data-track="house_magazine_room" data-room="${r.id}">${esc(mc.open)} ${I.arrow}</a>`;
  const deepBtn = r => `<a class="mg-deep" href="${href(r.href)}">${esc(r.cta)} ${I.arrow}</a>`;
  const statsOf = () => [...h.stats, ...rd.stats.extra].filter(s => s.value !== null && s.value !== undefined);
  const nTasks = tasks.length;
  const facts = arr => `<ul class="mg-facts">${arr.map(f => `<li><b>${esc(String(f[0]))}</b><span>${esc(f[1])}</span></li>`).join('')}</ul>`;
  const lines = arr => `<ul class="mg-lines">${arr.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const ab = h.about, pf = hp.proof;
  const reasons = pf.pick.map(k => content.advantages[k]).filter(Boolean);
  /* что написано на правой странице комнаты: заголовок, абзац, факты/строки — только реальные тексты и цифры */
  const rightOf = {
    about: () => ({head: ab.title, text: ab.text[1], extra: facts(statsOf().slice(0, 4).map(s => [val(s) + (s.suffix || ''), s.label]))}),
    brands: () => ({head: `${pc(brands.length, 'бренд', 'бренда', 'брендов')} — один подход`, text: `${brands.slice(0, 4).map(b => b.name).join(', ')} и ещё ${brands.length - 4}. ${ab.points[0]}.`, extra: `<ul class="mg-chips">${brands.map(b => `<li>${esc(b.name)}</li>`).join('')}</ul>`}),
    finder: () => ({head: F.title, text: sol.lead, extra: `<ul class="mg-chips">${tasks.map(t => `<li>${esc(t.label)}</li>`).join('')}</ul>`}),
    expertise: () => ({head: `${ed.lead.join(' ')} ${ed.accent.join(' ')}`, text: tr.text, extra: lines(A.facts)}),
    academy: () => {
      const d = next && S.dparts(next.date);
      return {head: tr.title, text: tr.sub + '.', extra: next ? `<p class="mg-next"><b>${d.d} ${d.m}</b><span>${esc(next.title)}<em>${esc(next.fmt)} · ${esc(next.city)}</em></span></p>` : `<p class="mg-next"><span>${esc(tr.emptyNote)}</span></p>`};
    },
    partners: () => ({head: R.title, text: R.lead, extra: lines((rd.audience.items || []).map(a => a.title))}),
    editorial: () => ({head: 'Новости и события Астрея', text: '', extra: `<ul class="mg-news">${ctx.news.slice(0, 3).map(n => `<li><time datetime="${n.date}">${esc(S.dparts(n.date).full)}</time><span>${esc(n.title)}</span></li>`).join('')}</ul>`})
  };
  const leftPhoto = {
    about: () => pimg('about'), brands: () => `<img src="${C.u(P, 'assets/brands/hero.webp')}" alt="" loading="lazy" decoding="async">`, finder: () => pimg('hero'),
    expertise: () => pimg('expertise'), academy: () => pimg('about2'), partners: () => pimg('about3'),
    editorial: () => `<img src="${C.u(P, 'assets/photos/keenwell-mask.webp')}" alt="" class="mg-prod" loading="lazy" decoding="async">`
  };
  const pageL = (r, n) => `<div class="pg pg-l pg-ph pg-${r.id}"><div class="mg-ph">${leftPhoto[r.id]()}</div><p class="mg-no" aria-hidden="true">${r.n2}</p><p class="mg-kick">${esc(r.short)}</p>${foot(n, 'l')}</div>`;
  const pageR = (r, n) => { const c = rightOf[r.id](); return `<div class="pg pg-r pg-tx pg-${r.id}"><p class="mg-kick">Комната ${r.n2} · ${esc(r.name)}</p><h3 class="mg-h">${esc(c.head)}</h3>${c.text ? `<p class="mg-p">${esc(c.text)}</p>` : ''}${c.extra || ''}<div class="mg-act">${openBtn(r)}${deepBtn(r)}</div>${foot(n, 'r')}</div>`; };
  const logoSvg = '<svg class="lgo" viewBox="46 338 836 436" aria-hidden="true"><use href="#logo-art"/></svg>';
  const pCover = `<div class="pg pg-cover"><span class="cv-kick">${esc(mc.kicker)}</span><p class="cv-title" role="heading" aria-level="2">${esc(mc.title)}</p><figure class="cv-ph">${pimg('hero')}</figure><span class="cv-year">${site.year}</span>${logoSvg}</div>`;
  const pWelcome = `<div class="pg pg-l pg-ph pg-welcome"><div class="mg-ph">${pimg('about')}</div><p class="mg-kick">${esc(mc.welcome)}</p><p class="mg-quote">${esc(site.tagline)}</p>${foot(2, 'l')}</div>`;
  const pToc = `<div class="pg pg-r pg-tx pg-toc"><p class="mg-kick">${esc(mc.tocTitle)}</p><h3 class="mg-h">${esc(site.name)} · ${esc(site.nameLatin)}</h3>
    <ol class="mg-toc">${rooms.map((r, i) => `<li><button type="button" data-mag-page="${i + 2}"><b>${r.n2}</b><span>${esc(r.name)}</span><i>${(i + 1) * 2 + 2}</i></button></li>`).join('')}<li><button type="button" data-mag-page="${rooms.length + 2}"><b>—</b><span>${esc(mc.contactsTitle)}</span><i>${(rooms.length + 1) * 2 + 2}</i></button></li></ol>${foot(3, 'r')}</div>`;
  const offices = site.offices || [];
  const pContactsL = n => `<div class="pg pg-l pg-ph pg-cont-l"><div class="mg-ph"><ul class="mg-cities">${offices.map(o => `<li><b>${esc(o.city)}</b><span>${esc(o.role)}</span></li>`).join('')}</ul></div><p class="mg-kick">${esc(mc.contactsTitle)}</p>${foot(n, 'l')}</div>`;
  const pContactsR = n => `<div class="pg pg-r pg-tx pg-cont-r"><p class="mg-kick">${esc(mc.contactsTitle)}</p><h3 class="mg-h">${esc(site.legalName)}</h3>
    <ul class="mg-contacts"><li><a href="tel:${site.contacts.phoneRaw}" data-track="phone_click">${esc(site.contacts.phone)}</a></li><li><a href="mailto:${site.contacts.email}" data-track="email_click">${esc(site.contacts.email)}</a></li><li>${esc(site.contacts.address)}</li><li>${esc(site.contacts.hours)}</li></ul>
    <div class="mg-act"><a class="btn btn-fill btn-sm" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="magazine">Стать партнёром ${I.arrow}</a><a class="mg-deep" href="${C.u(P, 'catalog.html')}" data-track="catalog_click" data-place="magazine">Каталог ${I.arrow}</a></div>${foot(n, 'r')}</div>`;
  const pBack = `<div class="pg pg-l pg-back"><p class="mg-colophon">${esc(site.legalName)} · ${esc(site.tagline)}</p>${logoSvg}</div>`;

  /* листы: лист k — спереди правая страница, сзади левая страница следующего разворота; порядок в DOM = порядок страниц при чтении */
  const pagesR = [pCover, pToc, ...rooms.map((r, i) => pageR(r, (i + 1) * 2 + 3)), pContactsR((rooms.length + 1) * 2 + 3)];
  const pagesL = [pWelcome, ...rooms.map((r, i) => pageL(r, (i + 1) * 2 + 2)), pContactsL((rooms.length + 1) * 2 + 2), pBack];
  const leaves = pagesR.map((f, k) => `<div class="leaf" data-k="${k}" style="--zr:${pagesR.length - k};--zl:${k + 1}"><div class="face front">${f}</div><div class="face back">${pagesL[k] || ''}</div></div>`).join('');
  const magazine = `<div class="mag" id="mag" role="dialog" aria-modal="true" aria-label="Журнал ASTREYA" hidden data-n="${pagesR.length}">
    <div class="mag-veil" data-mag-close></div>
    <div class="mag-wrap">
      <div class="mag-bar"><button class="mag-x" type="button" data-mag-close aria-label="${esc(mc.closeLabel)}"><span aria-hidden="true">×</span></button><button class="mag-cv" type="button" data-mag-page="0">${esc(mc.coverLabel)}</button><p class="mag-st" aria-live="polite"></p></div>
      <div class="mag-book" tabindex="-1"><div class="mag-spine" aria-hidden="true"></div><div class="leaves">${leaves}</div></div>
      <div class="mag-ctl"><button class="mag-pv" type="button" data-mag-step="-1">${I.arrow}<span>${esc(mc.prevLabel)}</span></button><button class="mag-nx" type="button" data-mag-step="1"><span>${esc(mc.nextLabel)}</span>${I.arrow}</button></div>
    </div>
  </div>`;

  /* плавающая навигация по дому: появляется, когда зал ушёл из кадра */
  const houseNav = `<nav class="house-nav is-off" aria-label="${esc(H.nav.label)}">
    <a class="hn-hall" href="#hall" data-house-hall>${esc(H.nav.hall)}</a>
    <button class="hn-mag" type="button" data-house-mag aria-haspopup="dialog" aria-controls="mag">${esc(H.nav.magazine)}</button>
    <ol class="hn-rooms" aria-label="${esc(H.nav.rooms)}">${rooms.map(r => `<li><a href="#room-${r.id}" data-house-go="${r.id}" aria-label="${r.n2}: ${esc(r.name)}"><b>${r.n2}</b><span>${esc(r.short)}</span></a></li>`).join('')}</ol>
  </nav>`;
  const veil = '<div class="house-veil" aria-hidden="true"></div>';

  return {
    hall: {world: hallWorld, greeting: hallGreeting, rooms: hallRooms},
    compose: arch => [arch, marquee, roomsHtml, magazine, houseNav, veil].join('\n\n  ')
  };
};
