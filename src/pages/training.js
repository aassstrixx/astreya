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

/* ---------- ASTREYA ACADEMY: страница «Обучение» (css/academy.css, js/pages.js → A.pages.training, js/sales-pages.js → календарь).
   Визуальный язык — из макета заказчика (зал во весь первый экран, тёплая штукатурка и травертин, тёмно-синие акценты), структура — своя, по пути посетителя:
   1 первый экран: зал, заголовок и тёмная панель ближайшего мероприятия с обратным отсчётом и «Записаться» → 2 календарь семинаров (главный инструмент: города, «Все форматы»,
   календарь месяца, карточки мероприятий) → 3 «Как пройти регистрацию?» (маршрут 01–04 на тонкой линии — сразу после выбора семинара) → 4 преподаватели (редакционная галерея крупных
   вертикальных портретов, «О преподавателях» раскрывает остальных) → 5 практическое обучение (полоса настоящих фото и три факта) → 6 видеотека (главный выпуск и два дополнительных) →
   7 вопросы + статьи (две половины, «Читать все статьи» раскрывает остальные) → 8 тёмно-синяя панель с аркой.
   Все функции сохранены: фильтры города и формата, выбор мероприятия и его день в календаре, запись, преподаватели, видео, вопросы, статьи, обратный отсчёт.
   Тексты — data/redesign.json → trainingPage.academy; факты — data/training.json, data/events.json, redesign.json → teachers. Выключатель: trainingPage.academy = null. ---------- */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const exists = f => { try { return fs.existsSync(path.join(ROOT, f)); } catch (e) { return false; } };
const svg = d => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${d}</svg>`;
const ROUTE_ICONS = [
  svg('<rect x="8" y="11" width="32" height="29" rx="4"/><path d="M8 20h32M17 7v8M31 7v8"/><path d="M16 27h3M22.5 27h3M29 27h3M16 33h3M22.5 33h3"/>'),                          // календарь
  svg('<path d="M38 26v10a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4h11"/><path d="m21 27 1.4-6.2L36.6 6.6a2.6 2.6 0 0 1 3.7 0l1.1 1.1a2.6 2.6 0 0 1 0 3.7L27.2 25.6z"/>'),  // лист с ручкой
  svg('<path d="M6 20 24 8l18 12v17a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path d="m6 20 18 11 18-11"/><path d="M14 17h20M14 22h12"/>'),                                               // раскрытое письмо
  svg('<circle cx="24" cy="24" r="17"/><path d="m16 24.6 6 6 11-12.4"/>')];                                                                                                  // готово

function academyPage(ctx, C, P) {
  const {training, site, sortedEvents, redesign, brandById} = ctx, A = redesign.trainingPage.academy, T = redesign.teachers, ext = site.contacts.ext;
  const hall = readJson('assets/academy/hall.json') || {plate: {w: 2800, h: 1100}};
  const H = A.hero, R = A.route, F = A.faculty || {}, K = A.calendar, L = A.lab, M = A.media, B = A.library, Z = A.final;
  const arrow = I.arrow, ph = redesign.photos || {};
  const PT = A.patterns || {}, bd = k => (PT[k] || []).length ? `<div class="ac-bd" aria-hidden="true">${PT[k].map(t => `<i data-bd="${esc(t[0])}" data-bd-pos="${esc(t[1])}" data-bd-o="${+t[2] || 8}"></i>`).join('')}</div>` : '';          // фоновые узоры зон: redesign.json → trainingPage.academy.patterns
  const side = (id, title, lead, extra = '', cls = '') => `<header class="ac-side${cls ? ' ' + cls : ''} reveal"><h2${id ? ` id="${id}"` : ''}>${esc(title).replace(/-/g, '\u2011')}</h2>${lead ? `<p class="ac-side-p">${esc(lead)}</p>` : ''}${extra}</header>`;

  /* 01 · первый экран: рендер зала на всю ширину (слева — стена с тенью листвы под текст), шапка сайта лежит поверх */
  const hs = H.hall, hm = exists('assets/academy/hall-m.webp');
  const hero = `<section class="ac-hero" aria-labelledby="ac-h1">
    <figure class="ac-hall" data-ac-par><div class="ac-hall-in"><picture>${hm ? `<source media="(max-width: 760px)" srcset="${esc(C.u(P, 'assets/academy/hall-m.webp'))}">` : ''}<source media="(max-width: 1300px)" srcset="${esc(C.u(P, hs.small))}"><img class="ac-hall-img" src="${esc(C.u(P, hs.src))}" alt="${esc(hs.alt)}" width="${hall.plate.w}" height="${hall.plate.h}" fetchpriority="high" decoding="async"></picture></div></figure>
    <div class="ac-in ac-hero-in"><div class="ac-hero-copy">
      <span class="ac-eyebrow reveal">${esc(H.eyebrow)}</span>
      <h1 id="ac-h1" class="reveal">${esc(H.title).replace(/^(.+?)\s+(«.+»)$/, '<span class="ac-nb">$1</span> <span class="ac-nb">$2</span>')}</h1>
      <p class="ac-lead reveal">${esc(H.lead)}</p>
      <p class="ac-sub reveal">${esc(H.sub)}</p>
      <div class="ac-hero-row reveal"><a class="btn btn-fill ac-pill" href="#sched" data-act="scroll" data-target="sched">${esc(H.cta)} ${arrow}</a><a class="ac-more" href="#lab" data-act="scroll" data-target="lab">${esc(H.more)}<i aria-hidden="true"></i></a></div>
    </div><div class="ac-hero-next reveal">${C.cdSlot()}</div></div>
  </section>`;

  /* 03 · «Как пройти регистрацию?»: полоса сразу после календаря — маршрут на тонкой линии: точки, цифры 01–04 со значками, подпись в две строки; полный текст шага — во всплывающей подсказке */
  const cap = (s, i) => { const c = R.captions && R.captions[i]; return c ? c.map(esc).join('<br>') : esc(s.t); };
  const steps = training.steps.map((s, i) => `<li class="ac-st reveal" tabindex="0"><div class="ac-st-top"><b class="ac-st-n">${String(i + 1).padStart(2, '0')}</b><i class="ac-st-ic">${ROUTE_ICONS[i % ROUTE_ICONS.length]}</i></div><h3>${cap(s, i)}</h3><p class="ac-st-tip" role="note">${esc(s.p)}</p></li>`).join('');
  const route = `<section class="ac-reg" id="route" aria-labelledby="ac-route-h">${bd('route')}<div class="ac-in ac-split ac-reg-in">
    <div class="ac-reg-t reveal"><h2 id="ac-route-h">${esc(R.title)}</h2><p>${esc(R.lead)}</p></div>
    <ol class="ac-steps">${steps}</ol>
  </div></section>`;

  /* 04 · преподаватели — витрина-кабинет, отдельный рендер (tools/showroom-assets/academy_gallery.py → assets/academy/gallery.webp): светлый стеллаж из известняка, десять ниш с рифлёными панелями, в восьми — портреты-фотопечати
     без рам на латунных стойках с табличками, в двух — косметологические полки (флаконы, кремы, ампулы, зеркало, спа-полотенца). Фото уже внутри рендера; вёрстка кладёт поверх только прозрачные кнопки
     (по раскладке gallery.json в долях кадра), подписи на таблички и карточку преподавателя (js/pages.js → «acad-t»: портрет «снимается со стены» и выезжает на передний план, остальное затухает, проявляются ФИО и сведения).
     Тексты карточки лежат в разметке (скрыты) — их видят поисковики и программы чтения. На экранах уже 1100 px и без рендера — те же портреты-фотопечати сеткой на рифлёном фоне. */
  const hq = f => f ? f.replace('assets/teachers/', 'assets/teachers/hq2/') : f;
  const SP = F.sp || {}, WL = readJson('assets/academy/gallery.json'), wallOk = !!(T && WL && WL.cells && WL.cells.length >= T.items.length && exists('assets/academy/gallery.webp') && exists('assets/teachers/hq2/' + T.items[0].id + '.webp'));
  const fx = v => Math.round(v * 100000) / 100000, host = u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const tcard = (p, i) => { const c = wallOk ? WL.cells[i] : null;
    const st = c ? `--i:${i};--x:${fx(c.ap.x)};--y:${fx(c.ap.y)};--w:${fx(c.ap.w)};--h:${fx(c.ap.h)};--fx:${fx(c.frame.x)};--fy:${fx(c.frame.y)};--fw:${fx(c.frame.w)};--fh:${fx(c.frame.h)};--px:${fx(c.plaque.x)};--py:${fx(c.plaque.y)};--pw:${fx(c.plaque.w)};--ph:${fx(c.plaque.h)}` : `--i:${i}`;
    const pic = p.photo ? `<img src="${C.u(P, hq(p.photo))}" alt="" width="1120" height="1200" loading="lazy" decoding="async">` : `<span class="ac-tc-mono" aria-hidden="true">${esc(p.last.charAt(0) + p.first.charAt(0))}</span>`;
    return `<li class="ac-tc" data-id="${esc(p.id)}" data-n="${i + 1}" style="${st}">
      <span class="ac-tc-ph" aria-hidden="true">${pic}</span><span class="ac-tc-void" aria-hidden="true"></span>
      <button class="ac-tc-frame" type="button" data-act="acad-t" data-id="${esc(p.id)}" aria-haspopup="dialog" aria-label="${esc(p.last + ' ' + p.first + ' — открыть карточку')}"></button>
      <div class="ac-tc-cap" data-act="acad-t" data-id="${esc(p.id)}" aria-hidden="true"><b>${esc(p.last)}</b><em>${esc(p.first)}</em>${p.tag ? `<small>${esc(p.tag)}</small>` : ''}</div>
      <div class="ac-tc-more" hidden><h3>${esc(p.last)} ${esc(p.first)}</h3><p class="ac-tc-role">${esc(p.role)}</p>${(p.facts || []).length ? `<ul>${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>
    </li>`; };
  const wallPic = wallOk ? `<picture class="ac-wall-pic"><source media="(max-width: 1700px)" srcset="${esc(C.u(P, 'assets/academy/gallery-s.webp'))}"><img class="ac-wall-img" src="${esc(C.u(P, 'assets/academy/gallery.webp'))}" alt="Витрина преподавателей учебного центра «Астрея»: восемь портретов на рифлёных панелях светлого стеллажа и косметологические полки с флаконами, кремами и ампулами" width="${WL.plate.w}" height="${WL.plate.h}" loading="lazy" decoding="async"></picture>` : '';
  const faculty = T ? `<section class="ac-tch" id="teachers" aria-labelledby="ac-fac-h">${bd('faculty')}<div class="ac-in">
    <header class="rd-head ac-head-row reveal"><div class="ac-head-t"><span class="ac-eyebrow">${esc(F.eyebrow || T.eyebrow)}</span><h2 id="ac-fac-h">${esc(F.title || T.title)}</h2></div><p class="ac-side-p">${esc(F.lead || T.lead)}</p><p class="ac-hint">${esc(F.hint || '')}</p></header></div>
    <div class="ac-wall${wallOk ? '' : ' no-wall'} reveal" data-ac-wall style="${wallOk ? `--ar:${WL.plate.w}/${WL.plate.h}` : ''}"
      data-sp='${esc(JSON.stringify({eyebrow: SP.eyebrow, factsTitle: SP.factsTitle, note: SP.note, cta: SP.cta, ask: SP.ask, close: SP.close, prev: SP.prev, next: SP.next, of: SP.of}))}'>
      ${wallPic}<ul class="ac-tl">${T.items.map(tcard).join('')}</ul></div>
  </section>` : '';

  /* 02 · календарь семинаров: города — чипы, формат — «Все форматы», календарь месяца (js/sales-pages.js кладёт его в [data-acad-cal]), карточки мероприятий: фото, дата, формат и город, спикер, бренд, «Записаться» */
  const cityChips = ['all', ...training.cities].map((c, i) => C.chip(c === 'all' ? esc(K.allCities) : esc(c), 'city', c, i === 0)).join('');
  const fmtChips = [['all', K.anyFormat], ['offline', K.offline], ['online', K.online]].map(([id, l], i) => C.chip(esc(l), 'fmt', id, i === 0)).join('');
  const evPhotos = ['about', 'expertise', 'about2', 'about3'].map(k => ph[k]).filter(Boolean);
  const evCard = (e, i) => { const d = dparts(e.date), b = brandById[e.brand], f = evPhotos[i % evPhotos.length], fk = e.fmt === 'Очно' ? 'offline' : 'online';
    return `<article class="sem-item ac-ev reveal" style="${bstyle(b)}" data-id="${e.id}" data-go="training/${e.slug}.html" data-date="${e.date}" data-city="${esc(e.city)}" data-fmt="${fk}" data-brand="${e.brand}" title="${esc(d.full + ', ' + e.time + ' · ' + e.place)}">
      <div class="ac-ev-pic">${f ? `<img src="${C.u(P, f.src)}" alt="" width="${f.w}" height="${f.h}" loading="lazy" decoding="async">` : ''}</div>
      <div class="ac-ev-b"><div class="ac-ev-top"><b class="ac-ev-d"><time datetime="${e.date}">${e.date.slice(8, 10)}.${e.date.slice(5, 7)}</time></b><span class="ac-ev-f">${esc(e.fmt)}${fk === 'offline' ? ' · ' + esc(e.city) : ''}</span></div>
        <h3><a href="${C.eurl(P, e)}">${esc(e.title)}</a></h3>
        <dl class="ac-who"><div><dt>${esc(K.speaker)}:</dt><dd>${esc(e.speaker)}</dd></div><div><dt>${esc(K.brand)}:</dt><dd>${esc(b.name)}</dd></div><div><dt>${esc(K.time || 'Время')}:</dt><dd>${esc(e.time)}</dd></div></dl>
        <div class="go"><button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">${esc(K.enroll)}</button><a class="lnk" href="${C.eurl(P, e)}">${esc(K.details)}</a></div>
      </div></article>`; };
  const calendar = `<section class="ac-cal" id="sched" aria-labelledby="ac-cal-h">${bd('calendar')}<div class="ac-in ac-split">
    ${side('ac-cal-h', K.title, K.lead)}
    <div class="ac-main">
      <div id="sched-filters" class="ac-filters reveal">
        <div class="chips ac-cities" id="city-chips" role="group" aria-label="${esc(K.cityLabel)}">${cityChips}</div>
        <div class="ac-dd" data-ac-dd><button class="ac-dd-b" type="button" data-act="acad-dd" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(K.fmtLabel)}"><span data-ac-dd-l>${esc(K.anyFormat)}</span>${arrow}</button>
          <div class="chips ac-dd-m" id="fmt-chips" role="listbox" aria-label="${esc(K.fmtLabel)}">${fmtChips}</div></div>
      </div>
      <div class="ac-cal-grid">
        <div class="ac-cal-col reveal" data-acad-cal></div>
        <div class="ac-ev-col"><div class="sem-list ac-evs" id="sem-list" data-fold="${K.fold || 3}">${sortedEvents.map(evCard).join('')}</div>
          <div class="empty" id="sem-empty" hidden><b>${esc(K.emptyTitle)}</b>${esc(K.emptyText)}</div></div>
      </div>
      <div class="ac-cal-foot"><p class="ac-note">${I.info}<span>${esc(K.note)}</span></p><button class="ac-btn-o" type="button" data-act="acad-fold" data-more="${esc(K.more)}" data-less="${esc(K.less)}" aria-expanded="false" hidden><span>${esc(K.more)}</span></button></div>
    </div>
  </div></section>`;

  /* 05 · практическое обучение: светлая полоса — слева текст, справа три настоящих фото, плавно переходящих друг в друга и в фон */
  const lab = `<section class="ac-lab" id="lab" aria-labelledby="ac-lab-h">
    <div class="ac-lab-ph" aria-hidden="true">${L.items.map((it, i) => { const f = ph[it.photo]; return f ? `<figure class="ac-pp ac-pp-${i + 1}"><img src="${C.u(P, f.src)}" alt="" width="${f.w}" height="${f.h}" loading="lazy" decoding="async"></figure>` : ''; }).join('')}</div>
    <div class="ac-in ac-lab-in">${side('ac-lab-h', L.title, L.lead, `${(L.facts || []).length ? `<ul class="ac-facts">${L.facts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<a class="ac-btn-o" href="#media" data-act="scroll" data-target="media"><span>${esc(L.more)}</span> ${arrow}</a>`)}</div>
  </section>`;

  /* 06 · видеотека: настоящие кадры видео канала Астреи на YouTube (assets/academy/videos.json). Нет файла — прежний список без придуманных обложек */
  const clean = t => String(t || '').replace(/\s+/g, ' ').trim();
  const brandIn = t => ctx.brands.find(b => new RegExp(b.name, 'i').test(t));
  const vid = (v, i) => { const lead = i === 0, t = clean(v.title), b = v.brand ? brandById[v.brand] : brandIn(t), cap = b ? b.name : (v.published ? dparts(v.published).full : ''),
      poster = v.thumb ? `<img class="ac-vid-img" src="${esc(C.u(P, v.thumb))}" alt="" width="640" height="360" loading="lazy" decoding="async">` : '';
    return `<a class="ac-vid${v.thumb ? '' : ' is-plain'}${lead ? ' is-lead' : ''} reveal" href="${esc(v.url || ext.youtube)}" target="_blank" rel="noopener" data-track="video_click"${b ? ` data-brand="${b.id}"` : ''} aria-label="${esc(t)}"><span class="ac-vid-cov" aria-hidden="true">${poster}<span class="ac-vid-play">${I.play}</span>${v.dur ? `<span class="ac-vid-dur">${esc(v.dur)}</span>` : ''}</span><span class="ac-vid-t"><small>${esc(cap)}</small><b>${esc(t)}</b></span></a>`; };
  const pool = (readJson('assets/academy/videos.json') || []).filter(v => v && v.thumb && v.url), li = Math.min(pool.length - 1, Math.max(0, M.leadVideo | 0));          // главный выпуск — горизонтальный кадр (media.leadVideo), вертикальные ролики идут дополнительными
  const vids = pool.length ? [pool[li], ...pool.filter((v, i) => i !== li)].slice(0, 3) : training.videos.slice(0, 3).map(v => ({title: v.title, dur: v.dur, brand: v.brand}));
  const media = `<section class="ac-media" id="media" aria-labelledby="ac-media-h">${bd('media')}<div class="ac-in">
    <header class="ac-head-row reveal"><div class="ac-head-t"><span class="ac-eyebrow">${esc(M.eyebrow || 'Медиатека')}</span><h2 id="ac-media-h">${esc(M.title).replace(/-/g, '\u2011')}</h2></div><p class="ac-side-p">${esc(M.lead)}</p><a class="ac-btn-o ac-more-b" href="${ext.youtube}" target="_blank" rel="noopener"><span>${esc(M.channel)}</span> ${arrow}</a></header>
    <div class="ac-media-grid">${vids.map(vid).join('')}</div>
  </div></section>`;

  /* 07 · вопросы и статьи: левая половина — вопросы (заголовок в столбце слева), правая — «Полезные статьи» на тёплой панели с рендером журнала; «Читать все статьи» раскрывает остальные */
  const magSrc = exists('assets/academy/mag.webp') ? 'assets/academy/mag.webp' : '';
  const pub = a => { const b = brandById[a.brand]; return `<li class="ac-pub" style="${bstyle(b)}"><span class="ac-pub-tag">${esc(a.tag)}</span><b>${esc(a.title)}</b><small>${dparts(a.date).full} · ${a.min} мин чтения</small></li>`; };
  const nPub = B.shown || 3, pubs = training.articles;
  const library = `<section class="ac-lib" id="library" aria-labelledby="ac-lib-h"><div class="ac-lib-grid">
    <div class="ac-faq-half">${bd('faq')}<div class="ac-faq-in">
      ${side('ac-lib-h', B.faqTitle, B.faqLead)}
      <div class="faq ac-faq reveal">${training.faq.map(f => `<div class="faq-item"><button class="faq-q" type="button" data-act="faq" aria-expanded="false"><span class="ac-q-t">${esc(f.q)}</span><i class="pm"></i></button><div class="faq-a"><div><p>${esc(f.a)}</p></div></div></div>`).join('')}</div>
    </div></div>
    <div class="ac-pub-half" id="materials">
      ${magSrc ? `<figure class="ac-mag" aria-hidden="true"><img src="${C.u(P, magSrc)}" alt="" width="1600" height="1000" loading="lazy" decoding="async"></figure>` : ''}
      <div class="ac-pub-copy reveal"><h2>${esc(B.pubTitle)}</h2>${B.pubLead ? `<p class="ac-side-p">${esc(B.pubLead)}</p>` : ''}
        ${pubs.length > nPub ? `<button class="ac-btn-o" type="button" data-act="acad-more" data-target="ac-pmore" aria-expanded="false" aria-controls="ac-pmore" data-more="${esc(B.pubMore || 'Читать все статьи')}" data-less="${esc(B.pubLess || 'Свернуть')}"><span>${esc(B.pubMore || 'Читать все статьи')}</span> ${arrow}</button>` : ''}</div>
      <ul class="grid ac-pubs reveal">${pubs.slice(0, nPub).map(pub).join('')}</ul>
      ${pubs.length > nPub ? `<div class="ac-tmore ac-pmore" id="ac-pmore" aria-hidden="true" inert><div class="ac-tmore-in"><ul class="ac-pubs">${pubs.slice(nPub).map(pub).join('')}</ul></div></div>` : ''}
    </div>
  </div></section>`;

  /* 08 · финальная панель: тёмно-синяя, справа арка с вазой (рендер, если есть), кремовая кнопка */
  const cz = C.closingCfg('training') || {}, btn = (b, cls) => !b ? '' : b.form ? `<button class="${cls}" type="button" data-act="form" data-type="${esc(b.form)}" data-ref="" data-track="closing_cta" data-place="training-cta">${esc(b.label)} ${arrow}</button>` : b.scroll ? `<a class="${cls}" href="#${esc(b.scroll)}" data-act="scroll" data-target="${esc(b.scroll)}" data-track="closing_cta" data-place="training-cta">${esc(b.label)} ${arrow}</a>` : `<a class="${cls}" href="${C.u(P, b.href)}" data-track="closing_cta" data-place="training-cta">${esc(b.label)} ${arrow}</a>`;
  const archSrc = exists('assets/academy/arch.webp') ? 'assets/academy/arch.webp' : '';
  const final = `<section class="ac-final-sec" id="ac-final"><div class="ac-final reveal" data-sx-closing="training-cta">
    <div class="ac-final-pic" aria-hidden="true">${archSrc ? `<img src="${C.u(P, archSrc)}" alt="" width="1500" height="700" loading="lazy" decoding="async">` : '<div class="ac-arches"><i></i><i></i><i></i></div>'}</div>
    <div class="ac-final-copy"><h2>${esc(Z.title || cz.title)}</h2><p>${esc(Z.text || cz.text)}</p></div>
    <div class="ac-final-row">${btn(Z.primary || cz.primary, 'btn btn-light ac-pill')}${btn(Z.secondary || cz.secondary, 'ac-final-2')}</div>
  </div></section>`;

  return `<div class="ac-page" data-training data-acad>${hero}${calendar}${route}${faculty}${lab}${media}${library}${final}</div>`;
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
