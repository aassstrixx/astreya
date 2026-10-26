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
  const heroX = (rd.jar && rd.jar.enabled && rd.jar.arch && rd.jar.arch.enabled) ? hero.replace('<h1>', '<h2 class="h1x">').replace('</h1>', '</h2>') : hero;          // заголовок первой страницы — в архитектурном экране (jar.arch); у запасного героя он остаётся обычным заголовком второго уровня

  /* ---------- 1. Астрея в цифрах (CLINICAL + фоновый логотип) ---------- */
  const statItems = [...h.stats, ...rd.stats.extra].filter(s => s.value !== null && s.value !== undefined);
  const stats = `<section class="rd-sec rd-clinical rd-stats rd-bgword" aria-label="${esc(rd.stats.eyebrow)}">${bgLogo}<div class="wrap rd-stats-grid">
    <div class="rd-stats-copy reveal"><span class="eyebrow">${esc(rd.stats.eyebrow)}</span><h2>${esc(rd.stats.title)}</h2></div>
    <div class="rd-nums">${statItems.map(s => `<div class="rd-num reveal"><b data-count="${val(s)}"${s.suffix ? ` data-suffix="${esc(s.suffix)}"` : ''}>${val(s)}</b><span>${esc(s.label)}</span>${s.note ? `<i class="snote">${esc(s.note)}</i>` : ''}${s.placeholder && showDemo ? '<em class="rd-ph">демо-данные</em>' : ''}</div>`).join('')}</div>
  </div></section>`;

  /* ---------- 2. Почему Астрея (editorial: крупные номера, тонкие линии) ---------- */
  const why = `<section class="rd-sec rd-why"><div class="wrap rd-why-grid">
    <div class="rd-why-head reveal"><span class="eyebrow">${esc(rd.why.eyebrow)}</span><h2>${esc(rd.why.title)}</h2></div>
    <ol class="rd-why-list">${rd.why.pick.map((k, i) => content.advantages[k]).filter(Boolean).map((a, i) => `<li class="rd-why-item reveal"><span class="rd-no" aria-hidden="true">${i + 1}</span><div><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div></li>`).join('')}</ol>
  </div></section>`;

  /* ---------- 3. Решения по задачам (CLINICAL, крупные кликабельные карточки; первая — двойная) ---------- */
  const solutions = `<section class="rd-sec rd-clinical rd-solutions" id="solutions"><div class="wrap">
    <header class="rd-head reveal"><span class="eyebrow">${esc(rd.solutions.eyebrow)}</span><h2>${esc(rd.solutions.title)}</h2><p class="lead">${esc(rd.solutions.lead)}</p></header>
    <div class="rd-tasks">${tasks.map((t, i) => {
      const n = ctx.products.filter(p => p.tasks.includes(t.id)).length, bs = t.brands.map(id => ctx.brandById[id]).filter(Boolean);
      return `<a class="rd-task reveal${i === 0 ? ' rd-task-lead' : ''}" href="${C.u(P, 'catalog.html')}?task=${t.id}" data-track="catalog_click" data-place="solutions">
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
  const picker = parts.picker.replace('<div id="pick-out"', audience + '<div id="pick-out"').replace('С чем вы работаете сегодня?', 'Какая задача вас интересует?').replace('class="sec"', 'class="rd-sec rd-clinical rd-picker"');

  /* ---------- 5. Продукты ---------- */
  const featured = parts.featured.replace('Рекомендуемые продукты', 'Профессиональные решения').replace('class="sec tint"', 'class="rd-sec rd-featured"');

  /* ---------- 6. Editorial-блок (графит): крупная мысль + реальная продукция брендов либо фото специалиста ---------- */
  const ed = rd.editorial;
  const trio = `<div class="rd-ed-trio" role="group" aria-label="Продукция брендов">${ed.products.map((p, i) => { const b = ctx.brandById[p.brand]; return `<figure class="rd-ed-p rd-ed-p${i + 1}"><img src="${C.u(P, p.src)}" alt="" width="${p.w}" height="${p.h}" loading="lazy" decoding="async"><figcaption>${esc(b.name)}</figcaption></figure>`; }).join('')}</div>`;
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
        ${next ? C.cdSlot() : ''}
        <div class="row reveal" style="margin-top:26px"><a class="btn btn-fill" href="${C.u(P, 'training.html')}">Все мероприятия ${I.arrow}</a>${next ? `<a class="btn btn-ghost" href="${C.eurl(P, next)}">Подробнее</a>` : ''}</div>
      </div>
    </div>
    ${events.length > 1 ? `<div class="grid g3 events-grid rd-events" id="home-events">${events.slice(1, 4).map(e => C.eventCard(P, e)).join('')}</div>` : ''}
  </div></section>`;

  /* ---------- 8. Для кого Астрея (CLINICAL, асимметрия) ---------- */
  const au = rd.audience;
  if (ctx.sales && ctx.sales.homeAudience) au.items = au.items.map((a, i) => ctx.sales.homeAudience[i] ? Object.assign({}, a, ctx.sales.homeAudience[i]) : a);          // продающий слой: у каждой аудитории — свой адресный шаг (подбор под роль)
  const forWhom = `<section class="rd-sec rd-clinical rd-aud"><div class="wrap rd-aud-grid">
    <div class="rd-aud-head reveal"><span class="eyebrow">${esc(au.eyebrow)}</span><h2>${esc(au.title)}</h2></div>
    <div class="rd-aud-list">${au.items.map((a, i) => `<article class="rd-aud-item reveal"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><a class="lnk" href="${C.u(P, a.href.split('#')[0])}${a.href.includes('#') ? '#' + a.href.split('#')[1] : ''}">${esc(a.cta)} ${I.arrow}</a></article>`).join('')}</div>
  </div></section>`;

  /* ---------- 9. Новости ---------- */
  const news = parts.news.replace('Новости и акции', 'События Астрея').replace('Что нового', 'Новости и события Астрея').replace('class="sec tint"', 'class="rd-sec rd-news"');

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
    <ul class="rd-perks">${f.perks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
  </div></div></section>`;

  /* порядок: воздух → цифры → причины → решения → бренды → подборщик → продукты → эксперт-блок → обучение → аудитория → новости → логотипы → призыв */
  /* первый экран главной (data/redesign.json → jar): закреплённая сцена со скролл-анимацией. Движок — js/jar.js, живой шар — js/sphere.js, стили — css/home-arch.css.
     Сцена открывается заставкой: баночка крупно по центру зала, внизу «Листайте»; по прокрутке камера отъезжает («наезд с отъездом»), баночка уходит на подиум и встаёт там одна,
     затем поверх встаёт герой: заголовок слева, шар с орбитами логотипов, внизу панель «Почему выбирают Астрею?».
     Слои (снизу вверх): кадры зала без баночки (canvas .js-cv) → каменный шар (WebGL, .ar-pearl; привязан к миру: положение и размер в каждом кадре — по данным камеры) → спрайт баночки (canvas .ar-jar-cv, чёткий, с прозрачным фоном; всегда поверх шара — товар виден целиком) → орбиты логотипов → текст и панель.
     Баночка лежит под надписями: ничто из текста и логотипов ею не закрывается. Без JS или без canvas сцена скрыта, остаётся прежний герой (css/home-arch.css).
     Тексты — те же, что у прежнего героя (data/content.json → home), цифры — из данных (число представительств и брендов). */
  const arch = (() => {
    const j = rd.jar, a = j && j.enabled && j.arch; if (!a || !a.enabled) return '';
    const nOff = ctx.stats.offices, nBr = ctx.stats.brands, cities = ctx.site.offices.map(o => o.city);
    const auto = {offices: `${nOff} ${S.plural(nOff, 'город', 'города', 'городов')} присутствия`, brands: `${nBr} ${S.plural(nBr, 'бренд', 'бренда', 'брендов')} в портфеле`};
    /* каменный шар: холст WebGL (js/sphere.js) и готовая картинка на случай, когда WebGL нет или движение уменьшено; положение — в % кадра, у телефона своё */
    const sp = a.sphere, tex = sp.tex;
    const pearl = `<div class="ar-sph" aria-hidden="true"><div class="ar-pearl" data-a="${C.u(P, tex.a)}" data-n="${C.u(P, tex.n)}"><canvas class="ar-gl"></canvas><img class="ar-poster" src="${C.u(P, tex.poster)}" alt="" width="640" height="640" decoding="async"></div></div>`;
    const items = a.panel.items.map(it => ({icon: it.icon, title: it.auto ? auto[it.auto] : it.title, text: it.auto === 'offices' ? cities.join(', ') : it.text}));
    /* логотипы на орбитах вокруг шара — те же, что у прежнего героя (data/content.json → home.orbits) */
    const orb = o => { const b = o.brand ? ctx.brandById[o.brand] : null, src = b ? b.logo : o.src, w = b ? b.logoW : o.w, hh = b ? b.logoH : o.h;
      return `<span class="arm" style="--a:${o.angle}deg"><span class="orb"><img src="${C.u(P, src)}" alt=""${w ? ` width="${w}" height="${hh}"` : ''} style="--lw:${o.width}" decoding="async"></span></span>`; };
    const ring = k => { const o = h.orbits.find(x => x.orbit === k); return `<div class="ring ${k}" aria-hidden="true">${o ? orb(o) : ''}</div>`; };
    const jr = a.jar;
    return `<section class="jar-story arch-story" id="arch-story" data-mode="arch" data-view-at="0.97" style="--jh:${a.heightVh.desktop}vh;--jhm:${a.heightVh.mobile}vh" data-n="${a.frames}" data-ext="${a.ext}" data-v="${esc(ctx.assetVersion || '')}" data-d="${a.desktop}" data-m="${a.mobile}" data-dm="${a.lite.desktop}" data-mm="${a.lite.mobile}" data-p="${a.p.join(',')}" data-pb="${a.pb.join(',')}" data-jd="${jr.desktop.dir}" data-jm="${jr.mobile.dir}" data-jx="${jr.ext}" data-jr="${JSON.stringify(jr.desktop.rects)}" data-jrm="${JSON.stringify(jr.mobile.rects)}" data-sp="${JSON.stringify(sp.desktop.track)}" data-spm="${JSON.stringify(sp.mobile.track)}" data-spr="${sp.desktop.ref}" data-sprm="${sp.mobile.ref}" data-lit="${JSON.stringify(a.lit)}" aria-label="${esc(a.alt)}">
    <div class="js-stage">
      <canvas class="js-cv" role="img" aria-label="${esc(a.alt)}"></canvas>
      <div class="ar-vig" aria-hidden="true"></div>
      <div class="ar-hero">
        <div class="ar-world">
          ${pearl}
          <canvas class="ar-jar-cv" aria-hidden="true"></canvas>
          <div class="ar-sph ar-sph-o" aria-hidden="true"><div class="ar-orbit">${ring('r3')}${ring('r1')}${ring('r2')}</div></div>
        </div>
        <div class="ar-cue" aria-hidden="true"><span>${esc(j.cue)}</span><i></i></div>
        <div class="ar-copy">
          <span class="eyebrow ar-e">${esc(h.eyebrow)}</span>
          <h1 class="ar-h">${h.h1}</h1>
          <p class="lead ar-lead">${esc(h.lead)}</p>
          <div class="row ar-cta">
            <a class="btn btn-fill" href="${C.u(P, 'catalog.html')}" data-track="catalog_click" data-place="hero">Перейти в каталог ${I.arrow}</a>
            <a class="btn btn-ghost" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="hero">Стать партнёром</a>
          </div>
          <ul class="ar-facts">${h.facts.map(f => `<li>${esc(f)}</li>`).join('')}<li>${esc(auto.offices)}</li></ul>
        </div>
        <div class="ar-panel" role="group" aria-label="${esc(a.panel.title)}">
          <p class="ar-pt">${esc(a.panel.title)}</p>
          <ul>${items.map(it => `<li><span class="ar-ic" aria-hidden="true">${I[it.icon] || I.check}</span><span class="ar-tx"><b>${esc(it.title)}</b><em>${esc(it.text)}</em></span></li>`).join('')}</ul>
          <a class="btn btn-ghost btn-sm ar-more" href="${C.u(P, 'company.html')}">Подробнее ${I.arrow}</a>
        </div>
      </div>
    </div>
  </section>`;
  })();
  /* галерея брендов в стиле страницы «Бренды»: те же арочные ниши-витрины (рендеры assets/brands, логотип и товары на подиумах), лентой с горизонтальной прокруткой */
  const brandsX = (() => {
    if (!arch) return null;
    const mk = require('./brands.js').nicheCardMaker(ctx, C, P), bp = ctx.redesign.brandsPage || {}, dev = new Set(bp.deviceIds || []);
    const list = brands.filter(b => !dev.has(b.id)).concat(brands.filter(b => dev.has(b.id)));
    return `<section class="rd-sec rd-brands hb" id="brands-gallery"><div class="wrap">
    <header class="rd-head rd-head-row reveal"><div><span class="eyebrow">Бренды</span><h2>${brands.length} ${S.plural(brands.length, 'бренд', 'бренда', 'брендов')} — один подход</h2></div>
      <div class="hb-ctl"><button class="hb-arr" type="button" data-act="hb-prev" aria-label="Назад" disabled>${I.arrow}</button><button class="hb-arr" type="button" data-act="hb-next" aria-label="Вперёд">${I.arrow}</button>${C.lnk(C.u(P, 'brands.html'), 'Все бренды')}</div></header>
    </div>
    <div class="hb-strip" id="hb-strip" role="region" aria-label="Бренды портфеля: листайте по горизонтали" tabindex="0">${list.map(mk).join('')}</div>
  </section>`;
  })();
  const fork = ctx.sales && ctx.sales.homeFork ? require('./sales-home.js')(ctx, C, P) : '';          // продающий слой: развилка «Учиться / Закупать» сразу под строкой брендов (героя и вступление не трогаем)
  return [arch, heroX, parts.marquee, ...(fork ? [fork] : []), about, stats, why, solutions, (brandsX || parts.brands.replace('class="sec tint"', 'class="rd-sec rd-brands"')), picker, featured, editorial, training, forWhom, news, wall, finalCta].join('\n\n  ');
};
