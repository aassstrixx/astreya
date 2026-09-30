const S = require('../../js/shared.js');
const {esc, I, bstyle, dparts} = S;

function trainingPage(ctx, C, P) {
  const {training, site, sortedEvents} = ctx;
  const ext = site.contacts.ext;
  const cityChips = ['all', ...training.cities].map((c, i) => C.chip(c === 'all' ? 'Все города' : esc(c), 'city', c, i === 0)).join('');
  const fmtChips = [['all', 'Любой формат'], ['offline', 'Очно'], ['online', 'Онлайн']].map(([id, l], i) => C.chip(l, 'fmt', id, i === 0)).join('');
  return `<div class="wrap" data-training>
    ${C.pageHead('Обучение', 'Учебный центр «Астреи»', 'Бесплатные семинары и мастер-классы: теория чередуется с практикой. Базовые семинары проходят с 10:30 до 18:00.')}
    <div class="row reveal"><a class="btn btn-fill" href="#sched" data-act="scroll" data-target="sched">Смотреть расписание ${I.arrow}</a><a class="btn btn-ghost" href="tel:${site.contacts.phoneRaw}" data-track="phone_click">${esc(site.contacts.phone)}</a></div>
  </div>

  <section class="sec"><div class="wrap">
    ${C.secHead('Как записаться', 'Четыре шага до семинара')}
    <div class="steps">${training.steps.map((s, i) => `<div class="step reveal"><i>${i + 1}</i><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p></div>`).join('')}</div>
  </div></section>

  <section class="sec" id="sched" style="padding-top:0"><div class="wrap">
    <hr class="dash" style="margin-bottom:clamp(50px,7vw,90px)">
    ${C.secHead('Расписание', 'Ближайшие мероприятия')}
    <div class="tb-row" style="margin-bottom:12px"><span class="tb-lab">Город</span><div class="chips reveal" id="city-chips">${cityChips}</div></div>
    <div class="tb-row" style="margin-bottom:28px"><span class="tb-lab">Формат</span><div class="chips reveal" id="fmt-chips">${fmtChips}</div></div>
    <div class="sem-list" id="sem-list">${sortedEvents.map(e => C.eventRow(P, e)).join('')}</div>
    <div class="empty" id="sem-empty" hidden><b>Мероприятий не найдено</b>Оставьте заявку — сообщим, когда откроется запись.</div>
    ${C.noteBox(`Расписание ориентировочное: актуальные даты и адреса подтверждает менеджер учебного центра. Полная версия — на <a href="${ext.academy}" target="_blank" rel="noopener" style="border-bottom:1px dashed;font-weight:600">academy.acosm.ru</a>.`)}
  </div></section>

  <section class="sec tint"><div class="wrap">
    ${C.secHead('Преподаватели', 'Практики, которые учат практике')}
    <div class="grid g4">${training.teachers.map(t => `<article class="card hov tcard card-pad reveal"><div class="avatar" aria-hidden="true">${esc(t.mono)}</div><h3>${esc(t.name)}</h3><p>${esc(t.spec)}</p><div class="tasks-line">${t.topics.map(x => C.tag(x)).join('')}</div></article>`).join('')}</div>
  </div></section>

  <section class="sec"><div class="wrap">
    ${C.secHead('Видео', 'Видео-подборка мастер-классов', `<a class="lnk" href="${ext.youtube}" target="_blank" rel="noopener">Канал на YouTube ${I.arrow}</a>`)}
    <div class="grid g4">${training.videos.map(v => { const b = ctx.brandById[v.brand]; return `<a class="card hov video reveal" href="${ext.youtube}" target="_blank" rel="noopener" style="${bstyle(b)}"><div class="th"><span class="play">${I.play}</span><span class="dur">${esc(v.dur)}</span></div><div class="vb"><h3>${esc(v.title)}</h3><small>YouTube · Астрея Косметология</small></div></a>`; }).join('')}</div>
  </div></section>

  <section class="sec" style="padding-top:0"><div class="wrap">
    ${C.secHead('Вопросы и ответы', 'Частые вопросы')}
    <div class="faq reveal">${training.faq.map(f => `<div class="faq-item"><button class="faq-q" type="button" data-act="faq" aria-expanded="false"><span>${esc(f.q)}</span><i class="pm"></i></button><div class="faq-a"><div><p>${esc(f.a)}</p></div></div></div>`).join('')}</div>
  </div></section>

  <section class="sec" style="padding-top:0"><div class="wrap">
    ${C.secHead('Статьи', 'Материалы для специалистов', `<a class="lnk" href="${ext.academy}" target="_blank" rel="noopener">academy.acosm.ru ${I.arrow}</a>`)}
    <div class="grid g3">${training.articles.slice(0, 3).map(C.articleCard).join('')}</div>
  </div></section>

  ${C.ctaBand(P, 'training-cta')}`;
}

function eventPage(ctx, C, P, e) {
  const b = ctx.brandById[e.brand], t = ctx.teacherById[e.teacher], d = dparts(e.date);
  const others = ctx.sortedEvents.filter(x => x.id !== e.id).slice(0, 3);
  const online = e.fmt !== 'Очно';
  const facts = [['Дата', C.timeTag(e.date)], ['Время', esc(e.time)], ['Город', esc(e.city)], ['Формат', esc(e.fmt)], [online ? 'Подключение' : 'Место', esc(e.place)],
    ['Преподаватель', esc(e.speaker)], ['Бренд', `<a href="${C.burl(P, b)}">${esc(b.name)}</a>`], ['Места', e.seats ? esc(String(e.seats)) : 'Количество мест уточняйте при регистрации']];
  return `<div class="wrap" style="${bstyle(b)}" data-event="${e.id}" data-date="${e.date}">
    <section class="e-hero">
      ${C.crumbs(P, [['Главная', 'index.html'], ['Обучение', 'training.html'], [e.title, `training/${e.slug}.html`]])}
      <div class="e-top">
        <div class="date big reveal"><b>${d.d}</b><span>${d.m}</span><em>${d.y}</em></div>
        <div>
          <span class="tag blue reveal">${esc(e.fmt)} · ${esc(e.city)}</span>
          <h1 class="reveal">${esc(e.title)}</h1>
          <p class="lead reveal">${esc(e.description)}</p>
          <div class="notice past reveal" id="past-note" hidden>${I.info}<span>Мероприятие уже прошло. Актуальные даты — в <a href="${C.u(P, 'training.html')}">расписании</a>.</span></div>
          <div class="row reveal" id="e-cta"><button class="btn btn-fill" type="button" data-act="form" data-type="seminar" data-ref="${e.id}" data-track="event_register" data-place="event-hero">Записаться ${I.arrow}</button>
            <a class="btn btn-ghost" href="${C.u(P, 'training.html')}">Все мероприятия</a></div>
        </div>
      </div>
    </section>

    <section class="sec" style="padding-top:clamp(20px,3vw,40px)">
      <div class="e-cols">
        <div class="e-main">
          <article class="p-block reveal"><h2>О мероприятии</h2><p>${esc(e.description)}</p>
            <p>${online ? 'Формат — вебинар: ссылку на подключение присылаем после регистрации.' : 'Базовые семинары проходят с 10:30 до 18:00: теоретические блоки чередуются с практическими мастер-классами.'}</p></article>
          <article class="p-block reveal"><h2>Программа</h2><p><span class="tbd">Уточняется — программу пришлёт менеджер учебного центра при подтверждении участия.</span></p></article>
          <article class="p-block reveal"><h2>Участие</h2><p>Базовые семинары и мастер-классы учебного центра «Астреи» бесплатные. Условия отдельных программ уточняйте у менеджера при регистрации.</p></article>
          ${t ? `<article class="card tcard card-pad reveal e-teacher"><div class="avatar" aria-hidden="true">${esc(t.mono)}</div><div><span class="eyebrow in">Преподаватель</span><h3>${esc(t.name)}</h3><p>${esc(t.spec)}</p><div class="tasks-line">${t.topics.map(x => C.tag(x)).join('')}</div></div></article>` : ''}
        </div>
        <aside class="e-side reveal">
          <dl class="facts-dl card card-pad">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        </aside>
      </div>
    </section>

    <section class="sec" id="register" style="padding-top:0">
      <div class="reg-card card card-pad reveal">
        <div><span class="eyebrow in">Регистрация</span><h2>Записаться на мероприятие</h2><p class="muted">Оставьте контакты — менеджер учебного центра подтвердит участие и вышлет детали.</p>
          <p class="muted small">${esc(e.title)} — ${d.full}, ${esc(e.city)}</p></div>
        <div>${S.formHTML('seminar', {root: P.root, uid: 'ev', ref: e.id})}</div>
      </div>
    </section>

    <section class="sec" style="padding-top:0">
      ${C.secHead('Обучение', 'Другие мероприятия', C.lnk(C.u(P, 'training.html'), 'Всё расписание'))}
      <div class="grid g3 events-grid">${others.map(x => C.eventCard(P, x)).join('')}</div>
    </section>
  </div>`;
}

module.exports = {trainingPage, eventPage};
