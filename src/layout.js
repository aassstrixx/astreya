/* Оболочка страницы: <head> (SEO), шапка, подвал, оверлеи, скрипты. Единая для всех страниц. */
const fs = require('fs');
const path = require('path');
const S = require('../js/shared.js');
const {esc, I} = S;

const logoDefs = fs.readFileSync(path.join(__dirname, 'partials', 'logo-defs.html'), 'utf8');
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Playfair+Display:ital,wght@0,500;0,600;1,400;1,500&family=Manrope:wght@400;500;600;700&display=swap';
const CSS = ['base', 'components', 'pages', 'responsive', 'motion'];
const JS = ['shared', 'data', 'core', 'motion', 'pages', 'hero-mark'];

/* Ранний скрипт: класс js, «уже видели заставку», «пришли с переходом» — до первой отрисовки, чтобы не было мигания */
/* Совместимость со старыми ссылками одностраничной версии (#/catalog?brand=…, #/brand/keenwell, #/academy…) — только на главной */
const LEGACY = `(function(l){var m=l.hash.match(/^#\\/(catalog|brands|brand\\/[\\w-]+|academy|news|company)(\\?.*)?$/);if(!m)return;var t=m[1],q=m[2]||'',u=t==='academy'?'training.html':t.indexOf('brand/')===0?'brands/'+t.slice(6)+'.html':t+'.html';l.replace(u+q);})(location);`;
const EARLY = `(function(d){var h=d.documentElement;h.classList.add('js');try{var n=sessionStorage.getItem('astreya:nav');if(n){var o=JSON.parse(n);if(o&&Date.now()-o.t<8000)h.classList.add('nav-in');else sessionStorage.removeItem('astreya:nav')}}catch(e){}})(document);`;

module.exports = function layout(ctx, C) {
  const {site} = ctx, {u} = C;
  const showNote = !!site.demoNotice && !(ctx.redesign && ctx.redesign.ui && ctx.redesign.ui.showDemoNotices === false);   // пометка «демо-данные» в подвале (в режиме доработок скрывается флагом redesign.ui)
  const rd = !!site.redesign, cssList = rd ? [...CSS, 'redesign'] : CSS, jsList = rd ? [...JS, 'redesign'] : JS;   // слой доработок включается одним флагом site.redesign
  const ver = ctx.assetVersion ? '?v=' + ctx.assetVersion : '';
  const base = site.url.replace(/\/?$/, '/');
  const absUrl = p => p === 'index.html' ? base : base + p;
  const nav = [['Каталог', 'catalog.html', '/catalog'], ['Бренды', 'brands.html', '/brands'], ['Обучение', 'training.html', '/training'], ['Новости', 'news.html', '/news'], ['Компания', 'company.html', '/company']];
  const c = site.contacts;

  const header = P => `<header class="hdr" id="hdr">
  <div class="wrap hdr-in">
    <a href="${u(P, 'index.html')}" class="logo" style="--i:0" aria-label="Астрея — на главную">
      <svg class="lgo" viewBox="46 338 836 436" aria-hidden="true"><use href="#logo-art"/></svg>
    </a>
    <nav class="nav" id="nav" style="--i:1" aria-label="Основная навигация">
      ${nav.map(([t, href, key]) => `<a class="nl${P.nav === key ? ' on' : ''}" href="${u(P, href)}" data-nav="${key}"${P.nav === key ? ' aria-current="page"' : ''}>${t}</a>`).join('\n      ')}
      <div class="nav-extra">
        <form class="nav-search" role="search" action="${u(P, 'search.html')}" method="get">
          <label class="search"><span class="sr">Поиск по сайту</span>${I.search}<input type="search" name="q" placeholder="Поиск по сайту" autocomplete="off"></label>
        </form>
        <a class="btn btn-fill" href="${u(P, 'partners.html')}" data-track="partner_cta" data-place="menu">Стать партнёром ${I.arrow}</a>
        <div class="nav-contacts">
          <a href="tel:${c.phoneRaw}" data-track="phone_click">${I.phone} ${esc(c.phone)}</a>
          <a href="mailto:${c.email}" data-track="email_click">${I.mail} ${esc(c.email)}</a>
          <span>${I.clock} ${esc(c.hours)}</span>
        </div>
      </div>
    </nav>
    <div class="hdr-cta" style="--i:2">
      <button class="icon-btn" type="button" data-act="search" aria-label="Открыть поиск" aria-expanded="false" aria-controls="srch">${I.search}</button>
      <a class="btn btn-fill btn-sm hdr-partner" href="${u(P, 'partners.html')}" data-track="partner_cta" data-place="header">Стать партнёром</a>
      <button class="burger" id="burger" type="button" data-act="menu" aria-label="Меню" aria-expanded="false" aria-controls="nav"><i></i></button>
    </div>
  </div>
</header>`;

  const footer = P => `<footer class="ftr">
  <div class="wrap">
    <div class="ftr-grid">
      <div class="ftr-brand">
        <a href="${u(P, 'index.html')}" class="logo inv big" aria-label="Астрея — на главную">
          <svg class="lgo" viewBox="46 338 836 436" aria-hidden="true"><use href="#logo-art"/></svg>
        </a>
        <p class="about">«Астрея» — дистрибьютор профессиональной косметики. Оригинальная продукция, обучение и поддержка специалистов.</p>
      </div>
      <div>
        <h2 class="ftr-h">Компания</h2>
        <ul>
          <li><a href="${u(P, 'company.html')}">О компании</a></li>
          <li><a href="${u(P, 'contacts.html')}">Контакты</a></li>
          <li><a href="${u(P, 'news.html')}">Новости</a></li>
          <li><a href="${u(P, 'training.html')}">Обучение</a></li>
        </ul>
      </div>
      <div>
        <h2 class="ftr-h">Каталог</h2>
        <ul>
          <li><a href="${u(P, 'catalog.html')}" data-track="catalog_click">Все продукты</a></li>
          <li><a href="${u(P, 'catalog.html')}#categories">Категории</a></li>
          <li><a href="${u(P, 'brands.html')}">Бренды</a></li>
        </ul>
      </div>
      <div>
        <h2 class="ftr-h">Партнёрам</h2>
        <ul>
          <li><a href="${u(P, 'partners.html')}" data-track="partner_cta" data-place="footer">Стать партнёром</a></li>
          <li><a href="${u(P, 'contacts.html')}#support">Поддержка</a></li>
        </ul>
      </div>
      <div>
        <h2 class="ftr-h">Контакты</h2>
        <ul>
          <li><a href="tel:${c.phoneRaw}" data-track="phone_click">${esc(c.phone)}</a></li>
          <li><a href="mailto:${c.email}" data-track="email_click">${esc(c.email)}</a></li>
          <li>${esc(c.address)}</li>
          <li class="muted-l">${esc(c.hours)}</li>
        </ul>
      </div>
    </div>
    <div class="ftr-bottom">
      <span>© ${esc(site.name)}, ${site.year}</span>
      <span class="ftr-legal"><a href="${u(P, 'privacy.html')}">Политика конфиденциальности</a><a href="${u(P, 'terms.html')}">Пользовательское соглашение</a></span>
    </div>
    ${showNote ? `<p class="ftr-note">${esc(site.demoNotice)}</p>` : ''}
  </div>
</footer>`;

  /* расширенный подвал (site.redesign): колонки из data/redesign.json → footer; ссылки ведут только на существующие страницы и якоря */
  const footerRd = P => { const f = ctx.redesign.footer;
    return `<footer class="ftr ftr-rd">
  <div class="wrap">
    <div class="ftr-rd-top">
      <div class="ftr-brand">
        <a href="${u(P, 'index.html')}" class="logo inv big" aria-label="Астрея — на главную"><svg class="lgo" viewBox="46 338 836 436" aria-hidden="true"><use href="#logo-art"/></svg></a>
        <p class="about">${esc(f.tagline)}</p>
      </div>
      <ul class="ftr-rd-contacts">
        <li><a href="tel:${c.phoneRaw}" data-track="phone_click">${esc(c.phone)}</a></li>
        <li><a href="mailto:${c.email}" data-track="email_click">${esc(c.email)}</a></li>
        <li>${esc(c.address)}</li>
        <li class="muted-l">${esc(c.hours)}</li>
      </ul>
    </div>
    <div class="ftr-rd-cols">${f.columns.map(col => `<div><h2 class="ftr-h">${esc(col.title)}</h2><ul>${col.links.map(([t, h]) => `<li><a href="${u(P, h)}">${esc(t)}</a></li>`).join('')}</ul></div>`).join('')}</div>
    <div class="ftr-bottom">
      <span>© ${esc(site.name)}, ${site.year}</span>
      <span class="ftr-legal"><a href="${u(P, 'privacy.html')}">Политика конфиденциальности</a><a href="${u(P, 'terms.html')}">Пользовательское соглашение</a></span>
    </div>
    ${showNote ? `<p class="ftr-note">${esc(site.demoNotice)}</p>` : ''}
  </div>
</footer>`; };

  const searchPanel = P => `<div id="srch" class="srch" role="dialog" aria-modal="true" aria-label="Поиск по сайту" hidden>
  <div class="srch-box wrap">
    <form class="srch-form" role="search" action="${u(P, 'search.html')}" method="get">
      <label class="search"><span class="sr">Поиск по товарам, брендам, новостям и обучению</span>${I.search}<input id="srch-q" type="search" name="q" placeholder="Товары, бренды, новости, обучение…" autocomplete="off"></label>
      <button class="x" type="button" data-act="search-close" aria-label="Закрыть поиск">${I.close}</button>
    </form>
    <div class="srch-hints" id="srch-hints"><span>Популярное:</span>${ctx.content.searchHints.map(h => `<a class="chip" href="${u(P, 'search.html')}?q=${encodeURIComponent(h)}">${esc(h)}</a>`).join('')}</div>
    <div class="srch-out" id="srch-out" aria-live="polite"></div>
  </div>
</div>`;

  const splash = `<div id="splash" aria-hidden="true">
  <div class="sp-in" id="sp-in">
    <div class="sp-logo" id="sp-logo" role="img" aria-label="Астрея"></div>
    <div class="sp-sub" id="sp-sub"></div>
    <i class="sp-line"></i>
    <p class="sp-tag">${esc(site.tagline)}</p>
  </div>
</div>`;

  const orgLd = {'@context': 'https://schema.org', '@type': 'Organization', name: site.name, alternateName: site.nameLatin, url: base,
    logo: base + 'assets/logo-512.png', email: c.email, telephone: c.phone,
    address: {'@type': 'PostalAddress', addressLocality: 'Москва', streetAddress: 'проезд Березовой рощи, д. 8', addressCountry: 'RU'}};
  const siteLd = {'@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: base,
    potentialAction: {'@type': 'SearchAction', target: base + 'search.html?q={search_term_string}', 'query-input': 'required name=search_term_string'}};

  /* P: {key, path, depth, root, nav, title, description, ogType, image, noindex, jsonld:[]} */
  /* картинки из assets/ получают ?v=<хэш> (как css/js): после замены файла браузер/CDN не показывают старый кэш */
  const verAssets = html => ver ? html.replace(/(\ssrc=")((?:\.\.\/)*assets\/[^"?#]+)(")/g, '$1$2' + ver + '$3') : html;
  function shell(P, body) {
    const url = absUrl(P.path), img = base + (P.image || 'assets/og-image.png');
    const ld = [...(P.key === 'home' ? [orgLd, siteLd] : []), ...(P.jsonld || [])];
    const bread = P.breadcrumbs && P.breadcrumbs.length ? {'@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: P.breadcrumbs.map((b, i) => ({'@type': 'ListItem', position: i + 1, name: b[0], item: absUrl(b[1])}))} : null;
    if (bread) ld.push(bread);
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(P.title)}</title>
<meta name="description" content="${esc(P.description)}">
${P.noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<meta name="theme-color" content="#f5f2ec">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${P.ogType || 'website'}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(P.title)}">
<meta property="og:description" content="${esc(P.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(site.name)} — профессиональная косметика">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(P.title)}">
<meta name="twitter:description" content="${esc(P.description)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="${u(P, 'assets/favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${u(P, 'assets/favicon-32.png')}" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${u(P, 'assets/apple-touch-icon.png')}">
<script>${EARLY}</script>
${P.key === 'home' ? `<script>${LEGACY}</script>\n` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- У Fraunces нет кириллицы, поэтому русские заголовки набираются парным по контрасту Playfair Display; латиница и цифры — Fraunces.
     Шрифты подключаются асинхронно: страница стартует сразу, даже если Google Fonts медленный (у всех гарнитур есть запасные — см. --serif / --sans). -->
<script>(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='${FONTS}';document.head.appendChild(l);})();</script>
<noscript><link href="${FONTS}" rel="stylesheet"></noscript>
${cssList.map(n => `<link rel="stylesheet" href="${u(P, `css/${n}.css`)}${ver}">`).join('\n')}
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head>
<body${rd ? ' class="rd"' : ''} data-page="${P.key}" data-nav="${P.nav || ''}" data-root="${P.root}">
<a class="skip" href="#main">К основному содержимому</a>
${logoDefs}
<div id="progress" aria-hidden="true"></div>
${splash}
<div id="curtain" aria-hidden="true"><div class="cs">${Array.from({length: 8}, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><div class="ct" aria-hidden="true"></div></div>

${header(P)}

<main id="main" tabindex="-1" data-page="${P.key}">
${body}
</main>

${rd ? footerRd(P) : footer(P)}

${searchPanel(P)}
<div id="modal" aria-hidden="true"></div>
<div id="toast" role="status" aria-live="polite"></div>

${jsList.map(n => `<script src="${u(P, `js/${n}.js`)}${ver}" defer></script>`).join('\n')}
</body>
</html>
`;
  }
  return {shell: (P, body) => verAssets(shell(P, body)), absUrl, base, nav};
};
