/* Главная в режиме доработок (site.redesign = true): другой порядок и состав секций, смена фонов (AIR / CLINICAL / EDITORIAL / ACCENT).
   Прежние секции берутся готовыми из home.js (parts), новые собираются здесь из data/redesign.json и общих данных. Ничего не выдумывается:
   цифры, бренды, мероприятия, новости — из data/*.json; заглушки помечены placeholder в data/redesign.json. */
const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function homeRedesign(ctx, C, P, parts, {events, val}) {
  const rd = ctx.redesign, brands = ctx.brands, tasks = ctx.tasks, content = ctx.content, h = content.home;

  /* фото 01–05 (data/redesign.json → photos): каждое — только в своём блоке */
  const ph = k => rd.photos[k];
  const img = (k, cls = '', extra = '') => { const f = ph(k); return `<img${cls ? ` class="${cls}"` : ''} src="${C.u(P, f.src)}" alt="${esc(f.alt)}" width="${f.w}" height="${f.h}"${extra} decoding="async">`; };
  const showDemo = !rd.ui || rd.ui.showDemoNotices !== false;

  /* крупный логотип «Астрея» на заднем плане секции (вместо слова); цвет задаётся CSS (--lm), прозрачность 5–6 % */
  const bgLogo = rd.bgLogo ? '<div class="rd-bglogo" aria-hidden="true"><svg viewBox="49.8 341.6 829.5 428.9" preserveAspectRatio="xMidYMid meet"><use href="#logo-art"/></svg></div>' : '';


  /* ---------- 0. О компании: фото 02 слева (~42 %), текст справа ---------- */
  const ab = h.about;
  const slogan = (ctx.site.tagline.match(/[^.]+\./g) || [ctx.site.tagline]).map(w => w.trim()).concat(['', '', '']);   // «Наука. Забота. Результат.» → по слову на каждое из трёх фото
  const about = `<section class="sec rd-about" id="about"><div class="wrap about-home rd-about-grid">
    <div class="rd-about-media">
      <figure class="rd-about-photo reveal">${img('about', '', ' loading="lazy"')}<figcaption>${esc(slogan[0])}</figcaption></figure>
      <div class="rd-about-pair">
        <figure class="rd-about-p2 reveal">${img('about2', '', ' loading="lazy"')}<figcaption>${esc(slogan[1])}</figcaption></figure>
        <figure class="rd-about-p3 reveal">${img('about3', '', ' loading="lazy"')}<figcaption>${esc(slogan[2])}</figcaption></figure>
      </div>
    </div>
    <div class="ah-copy">
      <span class="eyebrow">${esc(ab.eyebrow)}</span>
      <h2>${esc(ab.title)}</h2>
      ${ab.text.map(t => `<p class="reveal">${esc(t)}</p>`).join('')}
      <ul class="ticks reveal">${ab.points.map(t => `<li>${I.check}<span>${esc(t)}</span></li>`).join('')}</ul>
      <div class="row reveal" style="margin-top:30px"><a class="btn btn-ghost" href="${C.u(P, 'company.html')}">О компании ${I.arrow}</a></div>
    </div>
  </div></section>`;

  /* ---------- 0. Hero: шар с орбитами — как прежде; фото 01 — мягкий фон слева, за текстом ---------- */
  const hero = parts.hero.replace('<section class="hero">', `<section class="hero"><div class="hero-bgphoto" aria-hidden="true">${img('hero', '', ' fetchpriority="high"')}</div>`);

  /* ---------- 1. Астрея в цифрах (CLINICAL + фоновый логотип) ---------- */
  const statItems = [...h.stats, ...rd.stats.extra].filter(s => s.value !== null && s.value !== undefined);
  const stats = `<section class="rd-sec rd-clinical rd-stats rd-bgword" aria-label="${esc(rd.stats.eyebrow)}">${bgLogo}<div class="wrap rd-stats-grid">
    <div class="rd-stats-copy reveal"><span class="eyebrow">${esc(rd.stats.eyebrow)}</span><h2>${esc(rd.stats.title)}</h2></div>
    <div class="rd-nums">${statItems.map(s => `<div class="rd-num reveal"><b data-count="${val(s)}"${s.suffix ? ` data-suffix="${esc(s.suffix)}"` : ''}>${val(s)}</b><span>${esc(s.label)}</span>${s.note ? `<i class="snote">${esc(s.note)}</i>` : ''}${s.placeholder && showDemo ? '<em class="rd-ph">демо-данные</em>' : ''}</div>`).join('')}</div>
  </div></section>`;

  /* ---------- 2. Почему Астрея (editorial: крупные номера, тонкие линии) ---------- */
  const why = `<section class="rd-sec rd-why"><div class="wrap rd-why-grid">
    <div class="rd-why-head reveal"><span class="eyebrow">${esc(rd.why.eyebrow)}</span><h2>${esc(rd.why.title)}</h2></div>
    <ol class="rd-why-list">${rd.why.pick.map((k, i) => content.advantages[k]).filter(Boolean).map((a, i) => `<li class="rd-why-item reveal"><span class="rd-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div></li>`).join('')}</ol>
  </div></section>`;

  /* ---------- 3. Решения по задачам (CLINICAL, крупные кликабельные карточки; первая — двойная) ---------- */
  const solutions = `<section class="rd-sec rd-clinical rd-solutions" id="solutions"><div class="wrap">
    <header class="rd-head reveal"><span class="eyebrow">${esc(rd.solutions.eyebrow)}</span><h2>${esc(rd.solutions.title)}</h2><p class="lead">${esc(rd.solutions.lead)}</p></header>
    <div class="rd-tasks">${tasks.map((t, i) => {
      const n = ctx.products.filter(p => p.tasks.includes(t.id)).length, bs = t.brands.map(id => ctx.brandById[id]).filter(Boolean);
      return `<a class="rd-task reveal${i === 0 ? ' rd-task-lead' : ''}" href="${C.u(P, 'catalog.html')}?task=${t.id}" data-track="catalog_click" data-place="solutions">
        <span class="rd-task-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(t.label)}</h3>
        ${i === 0 ? `<p>${esc(t.note)}</p>` : ''}
        <div class="rd-task-logos" aria-hidden="true">${bs.slice(0, 4).map(b => C.slotLogo(P, b, 1500)).join('')}</div>
        <div class="rd-task-foot"><span>${bs.length} ${S.plural(bs.length, 'бренд', 'бренда', 'брендов')} · ${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')}</span><span class="rd-go">Подобрать ${I.arrow}</span></div>
      </a>`;
    }).join('')}</div>
  </div></section>`;

  /* ---------- 4. Подборщик: прежний + шаг «Для кого?» (js/redesign.js) ---------- */
  const audience = `<div class="rd-pick-step">
        <span class="tb-lab">${esc(rd.picker.audienceTitle)}</span>
        <div class="chips" id="pick-aud" role="group" aria-label="${esc(rd.picker.audienceTitle)}">${rd.picker.audiences.map(a => `<button class="chip" type="button" data-act="pick-aud" data-mode="${a.mode}" aria-pressed="false">${esc(a.label)}</button>`).join('')}</div>
        <button class="btn btn-fill btn-sm" type="button" data-act="pick-show">${esc(rd.picker.cta)}</button>
      </div>
      <p class="rd-pick-empty" id="pick-empty" hidden>${esc(rd.picker.emptyText)}</p>
      `;
  const picker = parts.picker.replace('<div id="pick-out"', audience + '<div id="pick-out"').replace('С чем вы работаете сегодня?', 'Какая задача вас интересует?').replace('class="sec"', 'class="rd-sec rd-clinical"');

  /* ---------- 5. Продукты ---------- */
  const featured = parts.featured.replace('Рекомендуемые продукты', 'Профессиональные решения').replace('class="sec tint"', 'class="rd-sec"');

  /* ---------- 6. Editorial-блок (графит): крупная мысль + реальная продукция брендов либо фото специалиста ---------- */
  const ed = rd.editorial;
  const trio = `<div class="rd-ed-trio" aria-label="Продукция брендов">${ed.products.map((p, i) => { const b = ctx.brandById[p.brand]; return `<figure class="rd-ed-p rd-ed-p${i + 1}"><img src="${C.u(P, p.src)}" alt="" width="${p.w}" height="${p.h}" loading="lazy" decoding="async"><figcaption>${esc(b.name)}</figcaption></figure>`; }).join('')}</div>`;
  const editorial = `<section class="rd-sec rd-editorial rd-bgword">${bgLogo}<div class="wrap rd-ed-grid">
    <figure class="rd-ed-photo reveal">${img(ed.photo, '', ' loading="lazy"')}</figure>
    <div class="rd-ed-copy">
      <span class="eyebrow reveal">${esc(ed.eyebrow)}</span>
      <h2 class="reveal"><span class="l1">${ed.lead.map(esc).join('<br>')}</span><span class="l2">${ed.accent.map(esc).join('<br>')}</span></h2>
      <div class="row reveal"><a class="btn btn-light" href="${C.u(P, ed.cta.href)}">${esc(ed.cta.label)} ${I.arrow}</a></div>
      ${trio}
    </div>
  </div></section>`;

  /* ---------- 7. Обучение специалистов (асимметрия: визуал слева, текст и ближайшее мероприятие справа) ---------- */
  const tr = rd.training, next = events[0];
  const nextBlock = next
    ? (() => { const d = S.dparts(next.date), b = ctx.brandById[next.brand]; return `<a class="rd-next reveal" href="${C.eurl(P, next)}"><span class="rd-date"><b>${d.d}</b><i>${d.m}</i></span><span class="rd-next-t"><small>Ближайшее мероприятие</small><b>${esc(next.title)}</b><em>${esc(next.fmt)} · ${esc(next.city)} · ${esc(b.name)}</em></span>${I.arrow}</a>`; })()
    : `<p class="muted rd-next-none">${esc(tr.emptyNote)}</p>`;
  const trainVisual = tr.photo
    ? `<figure class="rd-train-photo reveal"><img src="${C.u(P, tr.photo)}" alt="" loading="lazy" decoding="async"></figure>`
    : `<div class="rd-train-art reveal" aria-hidden="true"><svg class="lgo" viewBox="46 338 836 436"><use href="#logo-art"/></svg><ul><li>Семинары</li><li>Вебинары</li><li>Практика</li></ul></div>`;
  const training = `<section class="rd-sec rd-training" id="training-block"><div class="wrap">
    <div class="rd-train-grid">
      ${trainVisual}
      <div class="rd-train-copy">
        <span class="eyebrow reveal">${esc(tr.eyebrow)}</span>
        <h2 class="reveal">${esc(tr.title)}</h2>
        <p class="rd-sub reveal">${esc(tr.sub)}</p>
        <p class="muted reveal">${esc(tr.text)}</p>
        ${nextBlock}
        <div class="row reveal" style="margin-top:26px"><a class="btn btn-fill" href="${C.u(P, 'training.html')}">Все мероприятия ${I.arrow}</a>${next ? `<a class="btn btn-ghost" href="${C.eurl(P, next)}">Подробнее</a>` : ''}</div>
      </div>
    </div>
    ${events.length > 1 ? `<div class="grid g3 events-grid rd-events" id="home-events">${events.slice(1, 4).map(e => C.eventCard(P, e)).join('')}</div>` : ''}
  </div></section>`;

  /* ---------- 8. Для кого Астрея (CLINICAL, асимметрия) ---------- */
  const au = rd.audience;
  const forWhom = `<section class="rd-sec rd-clinical rd-aud"><div class="wrap rd-aud-grid">
    <div class="rd-aud-head reveal"><span class="eyebrow">${esc(au.eyebrow)}</span><h2>${esc(au.title)}</h2></div>
    <div class="rd-aud-list">${au.items.map((a, i) => `<article class="rd-aud-item reveal"><span class="rd-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><a class="lnk" href="${C.u(P, a.href.split('#')[0])}${a.href.includes('#') ? '#' + a.href.split('#')[1] : ''}">${esc(a.cta)} ${I.arrow}</a></article>`).join('')}</div>
  </div></section>`;

  /* ---------- 9. Новости ---------- */
  const news = parts.news.replace('Новости и акции', 'События Астреи').replace('Что нового', 'Новости и события Астреи').replace('class="sec tint"', 'class="rd-sec"');

  /* ---------- 10. Большой блок «Наши бренды» (логотипы в исходных цветах, много воздуха) ---------- */
  const w = rd.wall;
  const wall = `<section class="rd-sec rd-wall"><div class="wrap">
    <header class="rd-head rd-head-row reveal"><div><span class="eyebrow">${esc(w.eyebrow)}</span><h2>${esc(w.title)}</h2></div>${C.lnk(C.u(P, 'brands.html'), esc(w.cta))}</header>
    <ul class="rd-wall-grid">${brands.map(b => `<li class="reveal"><a href="${C.burl(P, b)}" data-track="brand_card_click" data-brand="${b.id}">${C.marqueeLogo(P, b)}</a></li>`).join('')}</ul>
  </div></section>`;

  /* ---------- 11. Финальный CTA (ACCENT) ---------- */
  const f = rd.finalCta;
  const finalCta = `<section class="rd-sec rd-final"><div class="wrap"><div class="rd-final-band reveal pushin">
    <div class="rd-final-copy"><span class="eyebrow">${esc(f.eyebrow)}</span><h2>${esc(f.title)}</h2><p>${esc(f.text)}</p>
      <div class="row">${C.partnerBtn(P, 'home-final-cta', 'btn btn-light')}<a class="btn btn-ghost-inv" href="tel:${ctx.site.contacts.phoneRaw}" data-track="phone_click">${I.phone} ${esc(ctx.site.contacts.phone)}</a></div></div>
    <ul class="rd-perks">${f.perks.map((t, i) => `<li><span aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${esc(t)}</li>`).join('')}</ul>
  </div></div></section>`;

  /* порядок: воздух → цифры → причины → решения → бренды → подборщик → продукты → эксперт-блок → обучение → аудитория → новости → логотипы → призыв */
  return [hero, parts.marquee, about, stats, why, solutions, parts.brands.replace('class="sec tint"', 'class="rd-sec"'), picker, featured, editorial, training, forWhom, news, wall, finalCta].join('\n\n  ');
};
