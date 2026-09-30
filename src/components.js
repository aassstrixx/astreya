/* Компоненты страниц: функции, возвращающие HTML-строки. Все ссылки строятся относительно корня сайта через P.root. */
const S = require('../js/shared.js');
const {esc, I, dparts, bstyle, norm} = S;

module.exports = function components(ctx) {
  const {brandById, catById, taskById, kindById, site, content} = ctx;
  const u = (P, p) => P.root + p;
  const purl = (P, p) => u(P, `products/${p.slug}.html`);
  const burl = (P, b) => u(P, `brands/${b.id}.html`);
  const eurl = (P, e) => u(P, `training/${e.slug}.html`);
  const nurl = (P, n) => u(P, `news/${n.slug}.html`);
  const phoneHref = site.contacts.phoneRaw;
  const FMT_KEY = {'Очно': 'offline', 'Вебинар': 'online'};

  /* CSS-иллюстрация упаковки — пока нет фотографий; подмена на фото: поле image в products.json (см. README) */
  const art = (P, p) => {
    const b = brandById[p.brand];
    return `<div class="art" role="img" aria-label="${esc(`${b.name} — ${p.name}: иллюстрация упаковки`)}" style="${bstyle(b)}"><div class="pk pk-${p.type}"><i class="sh"></i><i class="hd"></i><i class="cap"></i><i class="body"><b class="lbl"></b></i></div></div>`;
  };

  const tag = (t, cls = '') => `<span class="tag${cls ? ' ' + cls : ''}">${esc(t)}</span>`;
  const tasksLine = (ids, cls = '', n = 99) => `<div class="tasks-line">${ids.slice(0, n).map(t => tag(taskById[t].label, cls)).join('')}</div>`;
  const timeTag = iso => { const d = dparts(iso); return `<time datetime="${iso}">${d.full}</time>`; };

  const chip = (label, act, id, on, extra = '') =>
    `<button type="button" class="chip${on ? ' on' : ''}" data-act="${act}" data-id="${id}" aria-pressed="${on ? 'true' : 'false'}">${label}${extra}</button>`;

  const crumbs = (P, items) => `<nav class="crumbs" aria-label="Хлебные крошки">${items.map((it, i) =>
    i === items.length - 1 ? `<span aria-current="page">${esc(it[0])}</span>` : `<a href="${u(P, it[1])}">${esc(it[0])}</a><span aria-hidden="true">/</span>`).join('')}</nav>`;

  const pageHead = (eyebrow, title, lead, extra = '') =>
    `<header class="page-head"><span class="eyebrow reveal">${eyebrow}</span><h1 class="reveal">${title}</h1>${lead ? `<p class="lead reveal">${lead}</p>` : ''}${extra}</header>`;

  const secHead = (eyebrow, title, right = '') =>
    `<div class="sec-head"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div>${right}</div>`;

  const lnk = (href, text, attrs = '') => `<a class="lnk" href="${href}"${attrs ? ' ' + attrs : ''}>${text} ${I.arrow}</a>`;

  const partnerBtn = (P, place, cls = 'btn btn-fill', label = 'Стать партнёром') =>
    `<a class="${cls}" href="${u(P, 'partners.html')}" data-track="partner_cta" data-place="${place}">${label} ${I.arrow}</a>`;

  /* ---------------- товар ---------------- */
  const productCard = (P, p, i = 0) => {
    const b = brandById[p.brand], c = catById[p.cat], k = kindById[p.kind];
    const hay = norm([p.name, p.desc, b.name, c.name, k && k.name, p.tasks.map(t => taskById[t].label).join(' ')].join(' '));
    return `<article class="card hov pcard reveal" style="${bstyle(b)}" data-id="${p.id}" data-brand="${p.brand}" data-cat="${p.cat}" data-kind="${p.kind}" data-tasks="${p.tasks.join(' ')}" data-new="${p.isNew ? 1 : 0}" data-idx="${i}" data-name="${esc(norm(p.name))}" data-q="${esc(hay)}">
    ${p.isNew ? '<span class="newtag">Новинка</span>' : ''}
    ${art(P, p)}
    <div class="pb">
      <div class="bl"><i></i>${esc(b.name)} · ${esc(c.name)}</div>
      <h3><a class="stretch" href="${purl(P, p)}" data-track="product_card_click" data-product="${p.id}">${esc(p.name)}</a></h3>
      <p>${esc(p.desc)}</p>
      <div class="pf">
        <span class="lnk">Подробнее ${I.arrow}</span>
        <button class="btn btn-ghost btn-sm z3" type="button" data-act="form" data-type="product" data-ref="${p.id}">Запросить</button>
      </div>
    </div>
  </article>`;
  };

  /* ---------------- мероприятие ---------------- */
  const eventCard = (P, e) => {
    const b = brandById[e.brand], d = dparts(e.date);
    return `<article class="card hov sem card-pad reveal" style="${bstyle(b)}" data-date="${e.date}" data-city="${esc(e.city)}" data-fmt="${FMT_KEY[e.fmt] || 'offline'}" data-brand="${e.brand}">
    <div class="sem-top">
      <div class="date"><b>${d.d}</b><span>${d.m}</span></div>
      <div><span class="tag blue">${esc(e.fmt)} · ${esc(e.city)}</span><h3 style="margin-top:12px"><a class="stretch" href="${eurl(P, e)}">${esc(e.title)}</a></h3></div>
    </div>
    <div class="sem-meta">
      <div>${I.clock}<span>${esc(e.time)}</span></div>
      <div>${I.user}<span>${esc(e.speaker)}</span></div>
      <div>${I.pin}<span>${esc(e.place)}</span></div>
    </div>
    <div class="sem-foot"><span class="tag">${esc(b.name)}</span><button class="btn btn-fill btn-sm z3" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">Записаться</button></div>
  </article>`;
  };

  const eventRow = (P, e) => {
    const d = dparts(e.date), b = brandById[e.brand];
    return `<article class="sem-item reveal" data-date="${e.date}" data-city="${esc(e.city)}" data-fmt="${FMT_KEY[e.fmt] || 'offline'}" data-brand="${e.brand}">
      <div class="date"><b>${d.d}</b><span>${d.m}</span></div>
      <div><span class="tag blue">${esc(e.fmt)} · ${esc(e.city)}</span><h3 style="margin-top:10px"><a href="${eurl(P, e)}">${esc(e.title)}</a></h3>
        <div class="sem-meta"><div>${I.clock}<span>${esc(e.time)}</span></div><div>${I.pin}<span>${esc(e.place)}</span></div></div>
        <p class="sem-desc">${esc(e.description)}</p></div>
      <div class="who"><b>Преподаватель</b>${esc(e.speaker)}<br><span class="tag" style="margin-top:8px">${esc(b.name)}</span></div>
      <div class="go"><button class="btn btn-fill btn-sm" type="button" data-act="form" data-type="seminar" data-ref="${e.id}">Записаться</button><a class="lnk" href="${eurl(P, e)}">Подробнее</a></div>
    </article>`;
  };

  /* ---------------- новость ---------------- */
  const newsStyle = c => `--c1:${c.c1};--c2:${c.c2};--ink:${c.ink}`;
  const newsCard = (P, n) => {
    const c = ctx.newsCatById[n.category];
    return `<article class="card hov art-card newscard reveal" style="${newsStyle(c)}" data-cat="${n.category}">
    <div class="cov"><span>${esc(c.name)}</span></div>
    <div class="ab"><h3><a class="stretch" href="${nurl(P, n)}">${esc(n.title)}</a></h3><p>${esc(n.excerpt)}</p>
      <div class="meta">${timeTag(n.date)}<span class="lnk">Подробнее ${I.arrow}</span></div></div>
  </article>`;
  };

  /* ---------------- бренд ---------------- */
  /* логотип бренда: картинка (если задан b.logo) или монограмма; путь строится от корня сайта страницы P */
  /* гармоничный размер: логотипы разной формы приводятся к одной «площади» (ширина ≈ √(A·пропорция)), у плотных/тяжёлых знаков поправка logoScale */
  const logoPx = (b, A) => b.logoW && b.logoH ? Math.round(Math.sqrt(A * b.logoW / b.logoH) * (b.logoScale || 1) * 10) / 10 : 0;
  const darkInk = b => !/^#?f{3,6}$/i.test(b.ink || '#fff');        // тёмный текст на светлой плашке → логотип чёрный, иначе белый
  const logoImg = (P, b, cls, alt) => `<img class="${`blogo ${cls}${cls.includes('bl-img') && darkInk(b) ? ' ink-dark' : ''}`.trim()}" src="${esc(u(P, b.logo))}" alt="${esc(alt)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}"` : ''}${cls.includes('bl-img') && logoPx(b, 11000) ? ` style="--lw:${logoPx(b, 11000)}"` : ''} loading="lazy" decoding="async">`;
  const logoMark = (P, b, cls = '') => b.logo
    ? logoImg(P, b, cls, `Логотип ${b.name}`)
    : `<span class="blogo mono ${cls}" role="img" aria-label="Логотип ${esc(b.name)}">${esc(b.name.slice(0, 1))}</span>`;

  /* страница бренда: крупный логотип вместо текстового заголовка (h1 остаётся, название — в alt) */
  /* бегущая строка: логотип в исходных цветах (у бренда без логотипа — его название текстом) */
  const marqueeLogo = (P, b) => b.logo
    ? `<img class="mq-logo" src="${esc(u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}" style="--lw:${logoPx(b, 10000)}"` : ''} decoding="async">`
    : esc(b.name);

  /* небольшой логотип вместо цветного квадрата рядом с названием бренда (исходные цвета; название — текстом рядом, поэтому alt пустой) */
  const slotLogo = (P, b, A, alt = '') => b.logo
    ? `<div class="slot-logo"><img src="${esc(u(P, b.logo))}" alt="${esc(alt)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}" style="--lw:${logoPx(b, A)}"` : ''} loading="lazy" decoding="async"></div>`
    : '<i></i>';

  /* «Предыдущий/Следующий» бренд: логотип вместо названия (название — в alt) */
  const sibLogo = (P, b) => b.logo
    ? `<span class="sib-logo"><img src="${esc(u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}" style="--lw:${logoPx(b, 9000)}"` : ''} loading="lazy" decoding="async"></span>`
    : `<b>${esc(b.name)}</b>`;

  const heroLogo = (P, b) => `<img class="b-logo" src="${esc(u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}" style="--lw:${logoPx(b, 105000)}"` : ''} decoding="async">`;

  /* белый знак «Астрея» в правом верхнем углу цветной шапки карточки бренда (главная и страница «Бренды») */
  const astreyaMark = '<span class="bc-mark" aria-hidden="true"><svg class="lgo" viewBox="46 338 836 436"><use href="#logo-art"/></svg></span>';

  const brandCardHome = (P, b, i) => `<article class="bcard reveal" data-act="brand-card" data-id="${b.id}" tabindex="0" aria-expanded="false" style="${bstyle(b)}">
    <div class="band${b.logo ? ' has-logo' : ''}">${b.logo ? logoImg(P, b, 'bl-img', b.name) : `<span class="nm">${esc(b.name)}</span>`}${astreyaMark}<span class="ix">${String(i + 1).padStart(2, '0')}</span></div>
    <div class="low">
      <div class="bc-front">
        <p class="sp">${esc(b.tag)}</p>
        ${tasksLine(b.tasks, '', 3)}
        <span class="hint">Подробнее</span>
      </div>
      <div class="bc-back">
        <p>${esc(b.desc)}</p>
        <div class="row">
          <a class="btn btn-fill btn-sm" href="${burl(P, b)}">О бренде</a>
          <a class="btn btn-ghost btn-sm" href="${u(P, 'catalog.html')}?brand=${b.id}">Ассортимент</a>
          <button class="btn btn-lnk" type="button" data-act="brand-back">Назад</button>
        </div>
      </div>
    </div>
  </article>`;

  const brandCardList = (P, b) => {
    const n = ctx.products.filter(p => p.brand === b.id).length;
    const hay = norm([b.name, b.tag, b.desc, b.group, b.country, b.tasks.map(t => taskById[t].label).join(' ')].join(' '));
    return `<article class="card hov bl-card reveal" style="${bstyle(b)}" data-id="${b.id}" data-tasks="${b.tasks.join(' ')}" data-q="${esc(hay)}">
    <div class="band${b.logo ? ' has-logo' : ''}">${b.logo ? logoImg(P, b, 'bl-img', b.name) : `${logoMark(P, b, 'on-band')}<b>${esc(b.name)}</b>`}${astreyaMark}</div>
    <div class="bb"><div class="tasks-line">${tag(b.group)}${b.country && b.country !== b.group ? tag(b.country) : ''}</div><h3 class="sr">${esc(b.name)}</h3><p>${esc(b.tag)}</p>${tasksLine(b.tasks, '', 3)}
      <div class="bl-foot"><span class="muted small">${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')} в каталоге</span><a class="lnk stretch" href="${burl(P, b)}" data-track="brand_card_click" data-brand="${b.id}">О бренде ${I.arrow}</a></div></div>
  </article>`;
  };

  /* ---------------- прочее ---------------- */
  const advantageCards = (list, cls = 'g3') => `<div class="grid ${cls}">${list.map(a => `<article class="card adv card-pad reveal"><span class="adv-ic">${I[a.icon] || I.check}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></article>`).join('')}</div>`;

  const officeCard = o => `<article class="card hov city reveal">
    <span class="tag blue" style="align-self:flex-start">${esc(o.role)}</span>
    <h3>${esc(o.city)}</h3>
    <div class="li">${I.pin}<span>${esc(o.addr)}</span></div>
    ${o.hours ? `<div class="li">${I.clock}<span>${esc(o.hours)}</span></div>` : ''}
    ${o.phones.map(([p, l]) => `<div class="li">${I.phone}<span><a href="tel:${p.replace(/[^+\d]/g, '')}">${esc(p)}</a> · ${esc(l)}</span></div>`).join('')}
    ${o.emails.map(m => `<div class="li">${I.mail}<span><a href="mailto:${m}">${esc(m)}</a></span></div>`).join('')}
  </article>`;

  /* вместо шара в блоках-призывах — логотип «Астрея» (светлый вариант на тёмном фоне; тот же вектор, что в подвале) */
  const ctaLogo = '<div class="cb-art" aria-hidden="true"><span class="logo inv"><svg class="lgo" viewBox="46 338 836 436"><use href="#logo-art"/></svg></span></div>';
  const ctaBand = (P, place = 'cta-band') => `<section class="sec"><div class="wrap">
    <div class="cta-band reveal pushin">
      <div class="cb-copy">
        <span class="eyebrow">Партнёрам</span>
        <h2>Станьте партнёром Astreya</h2>
        <p>Оригинальная продукция, обучение вашей команды и поддержка менеджеров. Оставьте заявку — мы свяжемся и обсудим условия сотрудничества.</p>
        <div class="row">${partnerBtn(P, place, 'btn btn-light')}<a class="btn btn-ghost-inv" href="tel:${phoneHref}" data-track="phone_click">${I.phone} ${esc(site.contacts.phone)}</a></div>
      </div>
      ${ctaLogo}
    </div>
  </div></section>`;

  /* статья учебного центра (внешний материал на academy.acosm.ru) */
  const articleCard = a => {
    const b = brandById[a.brand];
    return `<a class="card hov art-card reveal" href="${site.contacts.ext.academy}" target="_blank" rel="noopener" style="${bstyle(b)}">
    <div class="cov"><span>${esc(a.tag)}</span></div>
    <div class="ab"><h3>${esc(a.title)}</h3><div class="meta"><span>${dparts(a.date).full}</span><span>${a.min} мин чтения</span></div></div>
  </a>`;
  };

  const noteBox = html => `<div class="note">${I.info}<span>${html}</span></div>`;

  return {u, purl, burl, eurl, nurl, art, tag, tasksLine, timeTag, chip, crumbs, pageHead, secHead, lnk, partnerBtn, productCard, eventCard, eventRow,
    newsCard, newsStyle, articleCard, logoMark, heroLogo, marqueeLogo, slotLogo, sibLogo, brandCardHome, brandCardList, advantageCards, officeCard, ctaLogo, ctaBand, noteBox, FMT_KEY};
};
