/* Главная ниже первого экрана — «маршрут партнёра» (data/redesign.json → homePath; css/home-path.css; js/redesign.js → подбор по задаче).
   Порядок разделов повторяет путь решения закупщика: «это для меня?» (роль) → «им можно верить» (цифры, команда, что вы получаете) → «что у них есть» (бренды) →
   «что взять под мою задачу» (подбор) → «как они учат» (учебный центр) → «как начать» (четыре шага) → «позвоните/оставьте заявку» (призыв).
   Цифры, бренды, задачи, товары, события, преподаватели и шаги — из data/*.json, здесь они только собираются в разметку; ничего не выдумано. */
const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function homePath(ctx, C, P, {events, val, img, bgLogo, showDemo}) {
  const rd = ctx.redesign, hp = rd.homePath, content = ctx.content, h = content.home, tasks = ctx.tasks, brands = ctx.brands;
  const href = x => { const [path, hash] = x.split('#'); return C.u(P, path) + (hash ? '#' + hash : ''); };

  /* ---------- 1. С чего начать: четыре роли (арочные плиты) + «Старт со Стеллой» ---------- */
  const R = hp.roles, au = rd.audience;
  let roles = au.items.map(a => Object.assign({}, a));
  if (ctx.sales && ctx.sales.homeAudience) roles = roles.map((a, i) => ctx.sales.homeAudience[i] ? Object.assign({}, a, ctx.sales.homeAudience[i]) : a);          // продающий слой: у каждой роли свой адресный шаг (подбор под роль)
  const roleIcon = ['user', 'layers', 'users', 'map'];
  const rolesSec = `<section class="rd-sec hp-roles" id="start-path" aria-labelledby="hp-roles-h"><div class="wrap">
    <header class="hp-head"><div><span class="eyebrow">${esc(R.eyebrow)}</span><h2 id="hp-roles-h" class="reveal">${esc(R.title)}</h2></div><p class="lead reveal">${esc(R.lead)}</p></header>
    <ol class="hp-roles-list">${roles.map((a, i) => `<li class="hp-role reveal" style="--rd:${i * 90}ms"><a href="${href(a.href)}" data-track="role_click" data-role="${i + 1}">
      <span class="hp-role-no" aria-hidden="true">0${i + 1}</span>
      <span class="hp-role-ic" aria-hidden="true">${I[roleIcon[i]] || I.check}</span>
      <h3>${esc(a.title)}</h3><p>${esc(a.text)}</p>
      <span class="hp-role-go">${esc(a.cta)} ${I.arrow}</span></a></li>`).join('')}</ol>
    <div class="hp-stella reveal"><span class="hp-stella-t"><b>${esc(R.stella.text)}</b><em>${esc(R.stella.sub)}</em></span><a class="btn btn-ghost" href="${href(R.stella.href)}" data-track="stella_start" data-place="home-roles">${esc(R.stella.cta)} ${I.arrow}</a></div>
  </div></section>`;

  /* ---------- 2. Доверие: фото команды, цифры, города, что вы получаете (бенто) ---------- */
  const ab = h.about, pf = hp.proof;
  const slogan = (ctx.site.tagline.match(/[^.]+\./g) || [ctx.site.tagline]).map(w => w.trim());
  const statItems = [...h.stats, ...rd.stats.extra].filter(s => s.value !== null && s.value !== undefined);
  const statTile = s => {
    const extra = s.key === 'geo' ? `<ul class="hp-cities" aria-label="Города присутствия">${ctx.site.offices.map(o => `<li>${esc(o.city)}</li>`).join('')}</ul>`
      : s.key === 'brands' ? `<div class="hp-mlogos" aria-hidden="true">${brands.slice(0, 4).map(b => C.slotLogo(P, b, 1200)).join('')}<em>+${brands.length - 4}</em></div>` : '';
    return `<div class="hp-stat hp-st-${esc(s.key || 'x')} reveal"><b data-count="${val(s)}"${s.suffix ? ` data-suffix="${esc(s.suffix)}"` : ''}>${val(s)}</b><span>${esc(s.label)}</span>${s.note ? `<i>${esc(s.note)}</i>` : ''}${extra}${s.placeholder && showDemo ? '<em class="rd-ph">демо-данные</em>' : ''}</div>`;
  };
  const reasons = pf.pick.map(k => content.advantages[k]).filter(Boolean);
  const proofSec = `<section class="rd-sec rd-clinical hp-proof" aria-labelledby="hp-proof-h">${bgLogo}<div class="wrap">
    <header class="hp-head"><div><span class="eyebrow">${esc(pf.eyebrow)}</span><h2 id="hp-proof-h" class="reveal">${esc(ab.title)}</h2></div><p class="lead reveal">${esc(ab.text[1])}</p></header>
    <div class="hp-bento">
      <figure class="hp-photo reveal pushin">${img('about', '', ' loading="lazy"')}<figcaption><span>${esc(slogan.join(' '))}</span></figcaption></figure>
      ${statItems.map(statTile).join('')}
    </div>
    <div class="hp-reasons-head reveal"><span class="eyebrow">${esc(pf.reasonsEyebrow)}</span></div>
    <ul class="hp-reasons">${reasons.map((a, i) => `<li class="hp-reason reveal" style="--rd:${i * 80}ms"><span class="hp-ic" aria-hidden="true">${I[a.icon] || I.check}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></li>`).join('')}</ul>
    <div class="row hp-more reveal"><a class="btn btn-ghost" href="${C.u(P, 'company.html')}">${esc(pf.more)} ${I.arrow}</a></div>
  </div></section>`;

  /* ---------- 4. Подбор по задаче: слева задачи, справа витрина выбранной (js/redesign.js переключает без перезагрузки) ---------- */
  const F = hp.finder, sol = rd.solutions;
  const taskLine = (t, i) => {
    const n = ctx.products.filter(p => p.tasks.includes(t.id)).length, nb = t.brands.length;
    return `<li><a class="hp-task${i === 0 ? ' on' : ''}" href="${C.u(P, 'catalog.html')}?task=${t.id}" data-hp-task="${t.id}"${i === 0 ? ' aria-current="true"' : ''} data-track="catalog_click" data-place="home-finder">
      <span class="hp-task-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="hp-task-name">${esc(t.label)}</span>
      <span class="hp-task-n">${nb} ${S.plural(nb, 'бренд', 'бренда', 'брендов')} · ${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')}</span><span class="hp-task-ar" aria-hidden="true">${I.arrow}</span></a></li>`;
  };
  const panel = (t, i) => {
    const prods = ctx.products.filter(p => p.tasks.includes(t.id)).slice(0, 4);
    return `<article class="hp-panel${i === 0 ? ' on' : ''}" data-hp-panel="${t.id}" aria-label="${esc(t.label)}">
      <header><span class="eyebrow">Задача</span><h3>${esc(t.label)}</h3><p>${esc(t.note)}</p></header>
      <div class="hp-brands">${t.brands.map(id => ctx.brandById[id]).filter(Boolean).map(b => `<a class="hp-brand" href="${C.burl(P, b)}">${C.slotLogo(P, b, 2400)}<span>${esc(b.name)}</span></a>`).join('')}</div>
      <div class="hp-prods">${prods.map(p => { const b = ctx.brandById[p.brand]; return `<a class="hp-prod" href="${C.purl(P, p)}">${C.art(P, p)}<span><small>${esc(b.name)}</small>${esc(p.name)}</span></a>`; }).join('')}</div>
      <div class="row hp-panel-cta"><a class="btn btn-fill" href="${C.u(P, 'catalog.html')}?task=${t.id}" data-track="catalog_click" data-place="home-finder-panel">${esc(F.open)} ${I.arrow}</a><a class="btn btn-ghost" href="${C.u(P, 'start.html')}" data-track="stella_start" data-place="home-finder">${esc(F.ask)}</a></div>
      <p class="hp-fine">Подбор ориентировочный: протокол определяет специалист по результатам консультации.</p>
    </article>`;
  };
  const finderSec = `<section class="rd-sec rd-clinical hp-find" id="solutions" aria-labelledby="hp-find-h"><div class="wrap">
    <header class="hp-head"><div><span class="eyebrow">${esc(F.eyebrow)}</span><h2 id="hp-find-h" class="reveal">${esc(F.title)}</h2></div><p class="lead reveal">${esc(sol.lead)}</p></header>
    <div class="hp-find-grid" data-hp-find>
      <ul class="hp-tasks reveal" aria-label="Задачи">${tasks.map(taskLine).join('')}</ul>
      <div class="hp-panels reveal" aria-live="polite">${tasks.map(panel).join('')}</div>
    </div>
    <div class="row hp-more reveal"><a class="lnk" href="${C.u(P, 'catalog.html')}">${esc(F.all)} ${I.arrow}</a></div>
  </div></section>`;

  /* ---------- 5. Учебный центр: тёмная глава — фото эксперта, ближайшая встреча, преподаватели, расписание ---------- */
  const ed = rd.editorial, tr = rd.training, A = hp.academy, next = events[0];
  const nextBlock = next
    ? (() => { const d = S.dparts(next.date), b = ctx.brandById[next.brand]; return `<a class="hp-next reveal" href="${C.eurl(P, next)}"><span class="hp-date"><b>${d.d}</b><i>${d.m}</i></span><span class="hp-next-t"><small>Ближайшее мероприятие</small><b>${esc(next.title)}</b><em>${esc(next.fmt)} · ${esc(next.city)} · ${esc(b.name)}</em></span>${I.arrow}</a>`; })()
    : `<p class="hp-next-none">${esc(tr.emptyNote)}</p>`;
  const faces = rd.teachers.items.slice(0, 5);
  const evCard = e => { const d = S.dparts(e.date), b = ctx.brandById[e.brand]; return `<a class="hp-ev reveal" href="${C.eurl(P, e)}"><span class="hp-date"><b>${d.d}</b><i>${d.m}</i></span><span class="hp-ev-t"><b>${esc(e.title)}</b><em>${esc(e.fmt)} · ${esc(e.city)} · ${esc(b.name)}</em></span><span class="hp-ev-go" aria-hidden="true">${I.arrow}</span></a>`; };
  const academySec = `<section class="rd-sec hp-acad rd-bgword" id="training-block" aria-labelledby="hp-acad-h">${bgLogo}<div class="wrap">
    <div class="hp-acad-grid">
      <figure class="hp-acad-photo reveal">${img(ed.photo, '', ' loading="lazy"')}
        <a class="hp-faces" href="${href(A.teachersHref)}" aria-label="${esc(A.teachersLabel)}"><span class="hp-faces-row">${faces.map(t => `<img src="${C.u(P, t.photo)}" alt="" width="280" height="300" loading="lazy" decoding="async">`).join('')}</span><span class="hp-faces-t">${esc(A.teachersLabel)} ${I.arrow}</span></a></figure>
      <div class="hp-acad-copy">
        <span class="eyebrow reveal">${esc(ed.eyebrow)}</span>
        <h2 id="hp-acad-h" class="reveal"><span class="l1">${ed.lead.map(esc).join(' ')}</span> <span class="l2">${ed.accent.map(esc).join(' ')}</span></h2>
        <p class="hp-sub reveal">${esc(tr.sub)}</p>
        <ul class="hp-facts reveal">${A.facts.map(f => `<li>${I.check}<span>${esc(f)}</span></li>`).join('')}</ul>
        ${nextBlock}
        ${next ? C.cdSlot() : ''}
        <div class="row hp-acad-cta reveal"><a class="btn btn-light" href="${C.u(P, 'training.html')}">${esc(A.all)} ${I.arrow}</a><a class="btn btn-ghost-inv" href="${C.u(P, ed.cta.href)}">${esc(A.about)}</a></div>
      </div>
    </div>
    ${events.length > 1 ? `<div class="hp-events" id="home-events" role="group" aria-label="${esc(A.eventsLabel)}">${events.slice(1, 4).map(evCard).join('')}</div>` : ''}
  </div></section>`;

  /* ---------- 6. Как начать: четыре шага (данные страницы «Партнёрам») ---------- */
  const ST = hp.steps, steps = content.partners.steps;
  const stepsSec = `<section class="rd-sec hp-steps" id="how-to-start" aria-labelledby="hp-steps-h"><div class="wrap">
    <header class="hp-head"><div><span class="eyebrow">${esc(ST.eyebrow)}</span><h2 id="hp-steps-h" class="reveal">${esc(ST.title)}</h2></div><p class="lead reveal">${esc(ST.lead)}</p></header>
    <ol class="hp-steps-list">${steps.map((s, i) => `<li class="hp-step reveal" style="--rd:${i * 110}ms"><span class="hp-step-no" aria-hidden="true">${i + 1}</span><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p></li>`).join('')}</ol>
    <div class="row hp-steps-cta reveal"><a class="lnk" href="${href(ST.calc.href)}" data-track="calc_click" data-place="home-steps">${esc(ST.calc.label)} ${I.arrow}</a></div>
  </div></section>`;

  return {rolesSec, proofSec, finderSec, academySec, stepsSec};
};
