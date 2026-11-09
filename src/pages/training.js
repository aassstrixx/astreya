const S = require('../../js/shared.js');
const {esc, I, bstyle, dparts} = S;

/* Преподаватели в режиме доработок: сразу после «Четырёх шагов до семинара». Данные — data/redesign.json → teachers (фото и описание добавляются туда же) */
function teachersRd(ctx, C, P) {
  const t = ctx.redesign.teachers;
  return `<section class="rd-sec rd-clinical rd-teachers" id="teachers"><div class="wrap">
    <header class="rd-head reveal"><span class="eyebrow">${esc(t.eyebrow)}</span><h2>${esc(t.title)}</h2><p class="lead">${esc(t.lead)}</p></header>
    <div class="rd-tgrid">${t.items.map((p, i) => `<article class="rd-tc reveal">
      <div class="rd-tc-photo">${p.photo ? `<img src="${C.u(P, p.photo)}" alt="${esc(p.last + ' ' + p.first)}" width="280" height="300" loading="lazy" decoding="async">` : `<span class="rd-tc-mono" aria-hidden="true">${esc(p.last.charAt(0) + p.first.charAt(0))}</span>`}</div>
      <p class="rd-tc-first">${esc(p.first)}</p>
      <h3 class="rd-tc-last">${esc(p.last)}</h3>
      <p class="rd-tc-role">${esc(p.role)}</p>
      ${p.bio ? `<p class="rd-tc-bio">${esc(p.bio)}</p>` : ''}
    </article>`).join('')}</div>
  </div></section>`;
}

/* ---------- ASTREYA ACADEMY: страница «Обучение» по макету заказчика (css/academy.css, js/pages.js → A.pages.training, js/sales-pages.js → календарь).
   Зоны сверху вниз: первый экран (аудитория справа, текст слева) → «Как пройти регистрацию?» (4 шага) → преподаватели (4 карточки, «О преподавателях» раскрывает всех) →
   расписание (город + «Все форматы», календарь, карточки мероприятий, «Показать ещё») → практическое обучение (панорама из фото) → видеотека (настоящие кадры видео канала) →
   вопросы и статьи (две половины) → финальный тёмно-синий баннер. Все функции прежней страницы сохранены: фильтры города и формата, запись на мероприятие, преподаватели, видео,
   FAQ, статьи, обратный отсчёт, календарь встреч. Тексты — data/redesign.json → trainingPage.academy; факты — data/training.json, data/events.json, redesign.json → teachers.
   Выключатель: trainingPage.academy = null (возвращается прежняя страница). ---------- */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const exists = f => { try { return fs.existsSync(path.join(ROOT, f)); } catch (e) { return false; } };
const PACK_CM = {tube: 14.4, bottle: 21.9, pump: 22.9, dropper: 15.6, jar: 6.0, box: 13.0, device: 15.6};       // высота упаковки, см (та же таблица, что у стены брендов)
const svg = d => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${d}</svg>`;
const ROUTE_ICONS = [
  svg('<rect x="7" y="10" width="34" height="30" rx="4"/><path d="M7 19h34M16 6v8M32 6v8"/><path d="M15 27h4M22 27h4M29 27h4M15 33h4M22 33h4"/>'),                          // календарь
  svg('<path d="m11 37 1.8-8.2L32 9.6a3.4 3.4 0 0 1 4.8 0l1.6 1.6a3.4 3.4 0 0 1 0 4.8L19.2 35.2z"/><path d="m28.4 13.2 6.4 6.4M11 40h26"/>'),                      // ручка
  svg('<rect x="5" y="11" width="34" height="25" rx="3.5"/><path d="m7 14 15 12 15-12"/><circle cx="36" cy="35" r="8" class="bg"/><path d="m32.4 35.2 2.6 2.6 4.8-5.2"/>'),   // письмо с галочкой
  svg('<circle cx="24" cy="24" r="17"/><path d="m16 24.6 6 6 11-12.4"/>')];                                                                                                  // готово

function academyPage(ctx, C, P) {
  const {training, site, sortedEvents, redesign, brandById, products} = ctx, A = redesign.trainingPage.academy, T = redesign.teachers, ext = site.contacts.ext;
  const packs = readJson('assets/showroom/packs.json') || {}, hall = readJson('assets/academy/hall.json');
  const H = A.hero, R = A.route, F = A.faculty || {}, K = A.calendar, L = A.lab, M = A.media, B = A.library, Z = A.final;
  const pct = x => Math.round(x * 100000) / 1000;
  const small = f => /assets\/showroom\/pack-[^/]+\.webp$/.test(f) ? f.replace(/\.webp$/, '-s.webp') : f;
  const packInfo = p => { const file = S.packOf(p), key = (/([^/]+)\.webp$/.exec(file) || [])[1], meta = packs[key]; return meta ? {meta, small: small(file)} : null; };
  const pick = ([brand, type]) => products.find(p => p.brand === brand && p.type === type) || products.find(p => p.brand === brand) || null;
  const arrow = I.arrow;

  /* 01 · первый экран: слева текст и запись, справа аудитория (рендер assets/academy/hall.webp с плавным переходом в фон страницы слева); упаковки на столе — HTML-спрайты реального масштаба по hall.json */
  const slots = hall ? H.items.map((it, i) => ({p: pick(it), sl: hall.slots[i]})).filter(x => x.p && x.sl) : [];
  const onTable = slots.map(({p, sl}) => { const pi = packInfo(p); if (!pi) return ''; const h = 1.3 * (PACK_CM[p.type] || 15) * sl.pxcm / hall.plate.h;                 // ×1,3: стол 2,3 м, и упаковки реального размера на нём едва читаются
    return `<span class="ac-pk" style="--x:${pct(sl.x)}%;--y:${pct(sl.y)}%;--h:${pct(h)}%;--ar:${(pi.meta.w / pi.meta.h).toFixed(4)};z-index:${Math.round(sl.y * 1000)}"><img class="ac-cs" src="${esc(C.u(P, pi.small))}" alt="" decoding="async"><img src="${esc(C.u(P, pi.small))}" alt="${esc(p.name)}" width="${pi.meta.w}" height="${pi.meta.h}" decoding="async"></span>`; }).join('');
  const heroPic = hall ? `<figure class="ac-hall"><div class="ac-hall-in"><picture><source media="(max-width: 900px)" srcset="${esc(C.u(P, H.hall.small))}"><img class="ac-hall-img" src="${esc(C.u(P, H.hall.src))}" alt="${esc(H.hall.alt)}" width="${hall.plate.w}" height="${hall.plate.h}" fetchpriority="high" decoding="async"></picture><span class="ac-pks">${onTable}</span></div></figure>` : '';
  const hero = `<section class="ac-hero" aria-labelledby="ac-h1">
    ${heroPic}
    <div class="ac-in ac-hero-in"><div class="ac-hero-copy">
      <span class="ac-eyebrow reveal">${esc(H.eyebrow)}</span>
      <h1 id="ac-h1" class="reveal">${esc(H.title)}</h1>
      <p class="ac-lead reveal">${esc(H.lead)}</p>
      <p class="ac-sub reveal">${esc(H.sub)}</p>
      <div class="ac-hero-row reveal"><a class="btn btn-fill ac-pill" href="#sched" data-act="scroll" data-target="sched">${esc(H.cta)} ${arrow}</a><a class="ac-more" href="#lab" data-act="scroll" data-target="lab">${esc(H.more)}<i aria-hidden="true"></i></a></div>
    </div></div>
  </section>`;

  /* 02 · «Как пройти регистрацию?»: плашка на стыке первого экрана и страницы, четыре шага со значками и стрелками */
  const steps = training.steps.map((s, i) => `${i ? `<li class="ac-arr" aria-hidden="true"><svg viewBox="0 0 40 12"><path d="M1 6h36M31 1l6 5-6 5"/></svg></li>` : ''}<li class="ac-st reveal"><i class="ac-st-ic">${ROUTE_ICONS[i % ROUTE_ICONS.length]}</i><div><h3>${esc(s.t)}</h3><p title="${esc(s.p)}">${esc((R.short && R.short[i]) || s.p)}</p></div></li>`).join('');
  const route = `<section class="ac-reg" id="route" aria-labelledby="ac-route-h"><div class="ac-in"><div class="ac-reg-card reveal">
    <div class="ac-reg-t"><h2 id="ac-route-h">${esc(R.title)}</h2><p>${esc(R.lead)}</p></div>
    <ol class="ac-steps">${steps}</ol>
  </div></div></section>`;

  /* 03 · преподаватели: четыре карточки, «О преподавателях» плавно раскрывает остальных */
  const hq = f => f ? f.replace('assets/teachers/', 'assets/teachers/hq/') : f;
  const tcard = (p, rv = true) => `<figure class="ac-tc${rv ? ' reveal' : ''}"><div class="ac-tc-frame">${p.photo ? `<img src="${C.u(P, hq(p.photo))}" alt="${esc(p.last + ' ' + p.first)}" width="560" height="600" loading="lazy" decoding="async">` : `<span class="ac-tc-mono" aria-hidden="true">${esc(p.last.charAt(0) + p.first.charAt(0))}</span>`}</div>
      <figcaption><b>${esc(p.last)}</b><em>${esc(p.first)}</em><small>${esc(p.role)}</small>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}</figcaption></figure>`;
  const nShow = F.shown || 4;
  const faculty = T ? `<section class="ac-tch" id="teachers" aria-labelledby="ac-fac-h"><div class="ac-in">
    <header class="rd-head ac-head ac-head-c reveal"><span class="ac-eyebrow">${esc(F.eyebrow || T.eyebrow)}</span><h2 id="ac-fac-h">${esc(F.title || T.title)}</h2><p class="ac-lead">${esc(F.lead || T.lead)}</p></header>
    <div class="ac-tgrid">${T.items.slice(0, nShow).map(p => tcard(p)).join('')}</div>
    ${T.items.length > nShow ? `<div class="ac-tmore" id="ac-tmore" aria-hidden="true" inert><div class="ac-tmore-in"><div class="ac-tgrid">${T.items.slice(nShow).map(p => tcard(p, false)).join('')}</div></div></div>
    <div class="ac-tbtn reveal"><button class="btn btn-fill ac-pill" type="button" data-act="acad-more" data-target="ac-tmore" aria-expanded="false" aria-controls="ac-tmore" data-more="${esc(F.more || 'О преподавателях')}" data-less="${esc(F.less || 'Свернуть')}"><span>${esc(F.more || 'О преподавателях')}</span> ${arrow}</button></div>` : ''}
  </div></section>` : '';

  /* 04 · расписание: города — чипы, формат — выпадающий список «Все форматы», календарь (js/sales-pages.js кладёт его в [data-acad-cal]), карточки мероприятий с фото и «Записаться» */
  const cityChips = ['all', ...training.cities].map((c, i) => C.chip(c === 'all' ? esc(K.allCities) : esc(c), 'city', c, i === 0)).join('');
  const fmtChips = [['all', K.anyFormat], ['offline', K.offline], ['online', K.online]].map(([id, l], i) => C.chip(esc(l), 'fmt', id, i === 0)).join('');
  const ph = redesign.photos || {};
  const evPhotos = ['about', 'expertise', 'about2', 'about3'].map(k => ph[k]).filter(Boolean);
  const evCard = (e, i) => { const d = dparts(e.date), b = brandById[e.brand], f = evPhotos[i % evPhotos.length], fk = e.fmt === 'Очно' ? 'offline' : 'online';
    return `<article class="sem-item ac-ev reveal" style="${bstyle(b)}" data-id="${e.id}" data-go="training/${e.slug}.html" data-date="${e.date}" data-city="${esc(e.city)}" data-fmt="${fk}" data-brand="${e.brand}">
      <div class="ac-ev-pic">${f ? `<img src="${C.u(P, f.src)}" alt="" width="${f.w}" height="${f.h}" loading="lazy" decoding="async">` : ''}<div class="date"><b>${d.d}</b><span>${d.m}</span></div></div>
      <div class="ac-ev-b"><span class="tag blue">${esc(e.fmt)} · ${esc(e.city)}</span><h3><a href="${C.eurl(P, e)}">${esc(e.title)}</a></h3>
        <div class="sem-meta"><div>${I.clock}<span>${esc(e.time)}</span></div><div>${I.pin}<span>${esc(e.place)}</span></div></div>
        <p class="sem-desc">${esc(e.description)}</p>
        <dl class="ac-who"><div><dt>${esc(K.speaker)}</dt><dd>${esc(e.speaker)}</dd></div><div><dt>${esc(K.brand)}</dt><dd>${esc(b.name)}</dd></div></dl>
        <div class="go"><button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">${esc(K.enroll)}</button><a class="lnk" href="${C.eurl(P, e)}">${esc(K.details)}</a></div>
      </div></article>`; };
  const calendar = `<section class="ac-cal" id="sched" aria-labelledby="ac-cal-h"><div class="ac-in">
    <header class="ac-head ac-head-row reveal"><div><span class="ac-eyebrow">${esc(K.eyebrow)}</span><h2 id="ac-cal-h">${esc(K.title)}</h2><p class="ac-lead">${esc(K.lead)}</p></div>${C.cdSlot()}</header>
    <div id="sched-filters" class="ac-filters reveal">
      <div class="chips ac-cities" id="city-chips" role="group" aria-label="${esc(K.cityLabel)}">${cityChips}</div>
      <div class="ac-dd" data-ac-dd><button class="ac-dd-b" type="button" data-act="acad-dd" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(K.fmtLabel)}"><span data-ac-dd-l>${esc(K.anyFormat)}</span><i aria-hidden="true"></i></button>
        <div class="chips ac-dd-m" id="fmt-chips" role="listbox" aria-label="${esc(K.fmtLabel)}">${fmtChips}</div></div>
    </div>
    <div class="ac-cal-grid">
      <div class="ac-cal-col" data-acad-cal></div>
      <div class="ac-ev-col"><div class="sem-list ac-evs" id="sem-list" data-fold="${K.fold || 3}">${sortedEvents.map(evCard).join('')}</div>
        <div class="empty" id="sem-empty" hidden><b>${esc(K.emptyTitle)}</b>${esc(K.emptyText)}</div>
        <div class="ac-more-row"><button class="btn btn-ghost ac-pill" type="button" data-act="acad-fold" data-more="${esc(K.more)}" data-less="${esc(K.less)}" aria-expanded="false" hidden><span>${esc(K.more)}</span></button></div></div>
    </div>
    ${C.noteBox(esc(K.note))}
  </div></section>`;

  /* 05 · практическое обучение: панорама из настоящих фото с текстом поверх */
  const lab = `<section class="ac-lab" id="lab" aria-labelledby="ac-lab-h"><div class="ac-in"><div class="ac-pano reveal">
    <div class="ac-pano-ph">${L.items.map((it, i) => { const f = ph[it.photo]; return f ? `<figure class="ac-pp ac-pp-${i + 1}"><img src="${C.u(P, f.src)}" alt="${esc(f.alt)}" width="${f.w}" height="${f.h}" loading="lazy" decoding="async"></figure>` : ''; }).join('')}</div>
    <div class="ac-pano-t"><span class="ac-eyebrow">${esc(L.eyebrow)}</span><h2 id="ac-lab-h">${esc(L.title)}</h2><p>${esc(L.lead)}</p><a class="ac-more" href="#library" data-act="scroll" data-target="library">${esc(L.more)}<i aria-hidden="true"></i></a></div>
  </div></div></section>`;

  /* 06 · видеотека: настоящие кадры видео канала Астреи на YouTube (assets/academy/videos.json: id, название, дата, ссылка, файлы заставок). Нет файла — прежний список без придуманных обложек */
  const real = (readJson('assets/academy/videos.json') || []).filter(v => v && v.thumb && v.url).slice(0, 3);
  const clean = t => String(t || '').replace(/\s+/g, ' ').trim();
  const brandIn = t => ctx.brands.find(b => new RegExp(b.name, 'i').test(t));
  const vid = v => { const t = clean(v.title), b = v.brand ? brandById[v.brand] : brandIn(t), cap = b ? b.name : (v.published ? dparts(v.published).full : ''),
      poster = v.thumb ? `<img class="ac-vid-img" src="${esc(C.u(P, v.thumbSmall || v.thumb))}" alt="" width="640" height="360" loading="lazy" decoding="async">` : '';
    return `<a class="ac-vid${v.thumb ? '' : ' is-plain'} reveal" href="${esc(v.url || ext.youtube)}" target="_blank" rel="noopener" data-track="video_click"${b ? ` data-brand="${b.id}"` : ''}><span class="ac-vid-cov" aria-hidden="true">${poster}<span class="ac-vid-play">${I.play}</span>${v.dur ? `<span class="ac-vid-dur">${esc(v.dur)}</span>` : ''}</span><span class="ac-vid-t"><small>${esc(cap)}</small><b>${esc(t)}</b></span></a>`; };
  const vids = real.length ? real : training.videos.slice(0, 3).map(v => ({title: v.title, dur: v.dur, brand: v.brand}));
  const media = `<section class="ac-media" id="media" aria-labelledby="ac-media-h"><div class="ac-in">
    <header class="ac-head ac-head-row reveal"><div><h2 id="ac-media-h">${esc(M.title)}</h2><p class="ac-lead">${esc(M.lead)}</p></div><a class="ac-more" href="${ext.youtube}" target="_blank" rel="noopener">${esc(M.channel)}<i aria-hidden="true"></i></a></header>
    <div class="ac-media-grid">${vids.map(vid).join('')}</div>
  </div></section>`;

  /* 07 · вопросы и статьи: две половины; у статей — иллюстрация (рендер журнала с вазой), если файл есть */
  const magSrc = exists('assets/academy/mag.webp') ? 'assets/academy/mag.webp' : '';
  const library = `<section class="ac-lib" id="library" aria-labelledby="ac-lib-h"><div class="ac-in"><div class="ac-lib-cols">
    <div class="ac-faq-col"><h2 class="ac-col-h reveal" id="ac-lib-h">${esc(B.faqTitle)}</h2>
      <div class="faq ac-faq reveal">${training.faq.map((f, i) => `<div class="faq-item"><button class="faq-q" type="button" data-act="faq" aria-expanded="false"><span class="ac-q-t">${esc(f.q)}</span><i class="pm"></i></button><div class="faq-a"><div><p>${esc(f.a)}</p></div></div></div>`).join('')}</div></div>
    <div class="ac-pub-col" id="materials"><h2 class="ac-col-h reveal">${esc(B.pubTitle)}</h2>
      ${magSrc ? `<figure class="ac-mag reveal"><img src="${C.u(P, magSrc)}" alt="" width="1500" height="960" loading="lazy" decoding="async"></figure>` : ''}
      <div class="grid g3 ac-pubs">${training.articles.slice(0, 3).map(C.articleCard).join('')}</div></div>
  </div></div></section>`;

  /* 08 · финальный баннер: тёмно-синий, справа арка с вазой (рендер, если есть), кремовая кнопка */
  const cz = C.closingCfg('training') || {}, btn = (b, cls) => !b ? '' : b.form ? `<button class="${cls}" type="button" data-act="form" data-type="${esc(b.form)}" data-ref="" data-track="closing_cta" data-place="training-cta">${esc(b.label)} ${arrow}</button>` : b.scroll ? `<a class="${cls}" href="#${esc(b.scroll)}" data-act="scroll" data-target="${esc(b.scroll)}" data-track="closing_cta" data-place="training-cta">${esc(b.label)} ${arrow}</a>` : `<a class="${cls}" href="${C.u(P, b.href)}" data-track="closing_cta" data-place="training-cta">${esc(b.label)} ${arrow}</a>`;
  const archSrc = exists('assets/academy/arch.webp') ? 'assets/academy/arch.webp' : '';
  const final = `<section class="ac-final-sec" id="ac-final"><div class="ac-in"><div class="ac-final reveal" data-sx-closing="training-cta">
    <div class="ac-final-copy"><h2>${esc(Z.title || cz.title)}</h2><p>${esc(Z.text || cz.text)}</p>
      <div class="row">${btn(Z.primary || cz.primary, 'btn btn-light ac-pill')}${btn(Z.secondary || cz.secondary, 'btn btn-ghost-inv ac-pill')}</div></div>
    <div class="ac-final-pic" aria-hidden="true">${archSrc ? `<img src="${C.u(P, archSrc)}" alt="" width="1300" height="800" loading="lazy" decoding="async">` : '<div class="ac-arches"><i></i><i></i><i></i></div>'}</div>
  </div></div></section>`;

  return `<div class="ac-page" data-training data-acad>${hero}${route}${faculty}${calendar}${lab}${media}${library}${final}</div>`;
}

function trainingPage(ctx, C, P) {
  if (ctx.redesign && ctx.redesign.trainingPage && ctx.redesign.trainingPage.academy) return academyPage(ctx, C, P);
  const {training, site, sortedEvents} = ctx;
  const ext = site.contacts.ext;
  const cityChips = ['all', ...training.cities].map((c, i) => C.chip(c === 'all' ? 'Все города' : esc(c), 'city', c, i === 0)).join('');
  const fmtChips = [['all', 'Любой формат'], ['offline', 'Очно'], ['online', 'Онлайн']].map(([id, l], i) => C.chip(l, 'fmt', id, i === 0)).join('');
  return `<div class="wrap" data-training>
    ${C.pageHead('Обучение', 'Учебный центр «Астрея»', 'Бесплатные семинары и мастер-классы: теория чередуется с практикой. Базовые семинары проходят с 10:30 до 18:00.')}
    ${C.cdSlot()}
    <div class="row reveal"><a class="btn btn-fill" href="#sched" data-act="scroll" data-target="sched">Смотреть расписание ${I.arrow}</a><a class="btn btn-ghost" href="tel:${site.contacts.phoneRaw}" data-track="phone_click">${esc(site.contacts.phone)}</a></div>
  </div>

  <section class="sec"><div class="wrap">
    ${C.secHead('Как записаться', 'Четыре шага до семинара')}
    <div class="steps">${training.steps.map((s, i) => `<div class="step reveal"><i>${i + 1}</i><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p></div>`).join('')}</div>
  </div></section>

  ${ctx.redesign && ctx.redesign.teachers ? teachersRd(ctx, C, P) : ''}

  <section class="sec" id="sched" style="padding-top:0"><div class="wrap">
    <hr class="dash" style="margin-bottom:clamp(50px,7vw,90px)">
    ${C.secHead('Расписание', 'Ближайшие мероприятия')}
    <div id="sched-filters">
    <div class="tb-row" style="margin-bottom:12px"><span class="tb-lab">Город</span><div class="chips reveal" id="city-chips">${cityChips}</div></div>
    <div class="tb-row" style="margin-bottom:28px"><span class="tb-lab">Формат</span><div class="chips reveal" id="fmt-chips">${fmtChips}</div></div>
    </div>
    <div class="sem-list" id="sem-list">${sortedEvents.map(e => C.eventRow(P, e)).join('')}</div>
    <div class="empty" id="sem-empty" hidden><b>Мероприятий не найдено</b>Оставьте заявку — сообщим, когда откроется запись.</div>
    ${C.noteBox(`Расписание ориентировочное: актуальные даты и адреса подтверждает менеджер учебного центра.`)}
  </div></section>

  ${ctx.redesign && ctx.redesign.teachers ? '' : `<section class="sec tint"><div class="wrap">
    ${C.secHead('Преподаватели', 'Практики, которые учат практике')}
    <div class="grid g4">${training.teachers.map(t => `<article class="card hov tcard card-pad reveal"><div class="avatar" aria-hidden="true">${esc(t.mono)}</div><h3>${esc(t.name)}</h3><p>${esc(t.spec)}</p><div class="tasks-line">${t.topics.map(x => C.tag(x)).join('')}</div></article>`).join('')}</div>
  </div></section>`}

  <section class="sec"><div class="wrap">
    ${C.secHead('Видео', 'Видео-подборка мастер-классов', `<a class="lnk" href="${ext.youtube}" target="_blank" rel="noopener">Канал на YouTube ${I.arrow}</a>`)}
    <div class="grid g4">${training.videos.map(v => { const b = ctx.brandById[v.brand]; return `<a class="card hov video reveal" href="${ext.youtube}" target="_blank" rel="noopener" style="${bstyle(b)}"><div class="th"><span class="play">${I.play}</span><span class="dur">${esc(v.dur)}</span></div><div class="vb"><h3>${esc(v.title)}</h3><small>YouTube · Астрея Косметология</small></div></a>`; }).join('')}</div>
  </div></section>

  <section class="sec" style="padding-top:0"><div class="wrap">
    ${C.secHead('Вопросы и ответы', 'Частые вопросы')}
    <div class="faq reveal">${training.faq.map(f => `<div class="faq-item"><button class="faq-q" type="button" data-act="faq" aria-expanded="false"><span>${esc(f.q)}</span><i class="pm"></i></button><div class="faq-a"><div><p>${esc(f.a)}</p></div></div></div>`).join('')}</div>
  </div></section>

  <section class="sec"${ctx.redesign ? ' id="materials"' : ''} style="padding-top:0"><div class="wrap">
    ${C.secHead('Статьи', 'Материалы для специалистов')}
    <div class="grid g3">${training.articles.slice(0, 3).map(C.articleCard).join('')}</div>
  </div></section>

  ${C.ctaBand(P, 'training-cta', C.closingCfg('training') && Object.assign({}, C.closingCfg('training'), {vars: {}}))}`;
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
          ${e.date >= new Date().toISOString().slice(0, 10) ? C.cdSlot() : ''}
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
          <article class="p-block reveal"><h2>Участие</h2><p>Базовые семинары и мастер-классы учебного центра «Астрея» бесплатные. Условия отдельных программ уточняйте у менеджера при регистрации.</p></article>
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
