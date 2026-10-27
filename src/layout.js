/* Оболочка страницы: <head> (SEO), шапка, подвал, оверлеи, скрипты. Единая для всех страниц. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CSP = require('./csp.js');
const MSG = require('./messengers.js');
const S = require('../js/shared.js');
const backdropsFactory = require('./backdrops.js');
const decorFactory = require('./decor.js');
const {esc, I} = S;

const logoDefs = fs.readFileSync(path.join(__dirname, 'partials', 'logo-defs.html'), 'utf8');
const CSS = ['fonts', 'base', 'components', 'pages', 'responsive', 'motion', 'consent'];
const JS = ['shared', 'data', 'core', 'consent', 'motion', 'pages', 'hero-mark'];
/* шрифты лежат на самом сайте (assets/fonts, css/fonts.css) — страницы не обращаются к серверам Google; заранее подгружаем только основные начертания */
const FONT_PRELOAD = fs.readdirSync(path.join(__dirname, '..', 'assets', 'fonts')).filter(f => /^(manrope-(cyrillic|latin)|playfair-display-(cyrillic|latin))-[0-9a-f]{6}\.woff2$/.test(f));

/* Ранний скрипт: класс js, «уже видели заставку», «пришли с переходом» — до первой отрисовки, чтобы не было мигания */
/* Совместимость со старыми ссылками одностраничной версии (#/catalog?brand=…, #/brand/keenwell, #/academy…) — только на главной */
const LEGACY = `(function(l){var m=l.hash.match(/^#\\/(catalog|brands|brand\\/[\\w-]+|academy|news|company)(\\?.*)?$/);if(!m)return;var t=m[1],q=m[2]||'',u=t==='academy'?'training.html':t.indexOf('brand/')===0?'brands/'+t.slice(6)+'.html':t+'.html';l.replace(u+q);})(location);`;
const EARLY = `(function(d){var h=d.documentElement;h.classList.add('js');try{if(top!==self){try{void top.location.href}catch(e){h.style.display='none'}}}catch(e){}if(/[?&]pv=/.test(location.search))h.classList.add('nav-quiet');try{var n=sessionStorage.getItem('astreya:nav');if(n){var o=JSON.parse(n);if(o&&Date.now()-o.t<8000)h.classList.add(o.q?'nav-quiet':'nav-in');else sessionStorage.removeItem('astreya:nav')}}catch(e){}})(document);`;

module.exports = function layout(ctx, C) {
  const {site} = ctx, {u} = C;
  const showNote = !!site.demoNotice && !(ctx.redesign && ctx.redesign.ui && ctx.redesign.ui.showDemoNotices === false);   // пометка «демо-данные» в подвале (в режиме доработок скрывается флагом redesign.ui)
  const rd = !!site.redesign, BD = rd ? backdropsFactory(ctx) : {on: false, apply: (P, h) => h}, DC = rd ? decorFactory(ctx, C) : {on: false, apply: (P, h) => h};
  const EX = !!(rd && ctx.redesign && ctx.redesign.extras && ctx.redesign.extras.enabled);       // дополнения интерфейса (css/extras.css, js/extras.js): список запроса, быстрая связь, быстрый просмотр, сравнение, обратный отсчёт, помощник
  const SX = !!(EX && ctx.sales);                                                                      // продающий слой «Путь к закупке» (css/sales.css, js/sales.js): extras.sales
  const cssList = rd ? [...CSS, 'redesign', ...(BD.on ? ['backdrops'] : []), ...(DC.on ? ['decor'] : []), ...(EX ? ['extras', ...(ctx.redesign.extras.assistant && ctx.redesign.extras.navigator ? ['guide'] : []), ...(SX ? ['sales', 'sales-pages'] : [])] : [])] : CSS, jsList = rd ? [...JS, 'redesign', ...(BD.on ? ['backdrops'] : []), ...(EX ? ['extras', 'explore', ...(ctx.redesign.extras.assistant ? ['assistant-brain', 'stella-policy', 'assistant', ...(ctx.redesign.extras.navigator ? ['guide'] : [])] : []), ...(SX ? ['sales', 'sales-pages'] : [])] : [])] : JS;   // слой доработок включается одним флагом site.redesign; фоновые вставки — backdrops.enabled в data/redesign.json
  const ver = ctx.assetVersion ? '?v=' + ctx.assetVersion : '';
  const jarCfg = rd && ctx.redesign && ctx.redesign.jar && ctx.redesign.jar.enabled ? ctx.redesign.jar : null;     // первый экран главной со скролл-анимацией (css/home-arch.css, js/jar-gl.js, js/jar.js) — только на главной и только пока jar.enabled
  const SHR = !!(EX && ctx.redesign.extras.showroom);                                                  // «Витрина-шоурум» (css/showroom.css, js/showroom.js): extras.showroom — только каталог; требует витрину-галерею (extras.gallery)
  const GAL = !!(EX && ctx.redesign.extras.gallery);                                                   // витрина каталога (css/gallery.css, js/gallery.js): extras.gallery — подключается только странице каталога
  const withGal = (list, P, after) => GAL && P.key === 'catalog' && list.indexOf(after) >= 0 ? [...list.slice(0, list.indexOf(after) + 1), 'gallery', ...(SHR ? ['showroom'] : []), ...list.slice(list.indexOf(after) + 1)] : list;
  const BRG = !!(rd && ctx.redesign && ctx.redesign.brandsPage && ctx.redesign.brandsPage.gallery);                          // архитектурная галерея брендов (css/brands.css): redesign.json → brandsPage.gallery
  const HMA = !!(jarCfg && jarCfg.arch && jarCfg.arch.enabled);                                                       // архитектурный первый экран и оформление главной (css/system.css + css/home-arch.css): redesign.json → jar.arch.enabled
  const withSys = (list, P) => HMA && P.key === 'home' ? [...list, 'system', 'brands', 'home-arch', 'home-path'] : SHR && (P.key === 'catalog' || P.key === 'product' || (P.key === 'brands' && BRG)) ? [...list, 'system', ...(P.key === 'brands' ? ['brands'] : [])] : list;   // единая дизайн-система (css/system.css): каталог, страницы товаров и галерея брендов; на главной — вместе с css/home-arch.css   // единая дизайн-система (css/system.css): каталог, страницы товаров и галерея брендов
  const pageCss = P => withSys(withGal(cssList, P, 'extras'), P), pageJs = P => withGal(HMA && P.key === 'home' ? [...jsList, 'jar-gl', 'jar'] : jsList, P, 'explore');
  /* первый кадр сцены грузим сразу (до скриптов): иначе заставка появится с задержкой */
  /* первый кадр, его карта глубины, спрайт баночки, дорожка камеры и маска этикетки грузятся заранее: движок (js/jar.js) берёт их через fetch — as="fetch" с crossorigin совпадает с его запросами и используется без повторной загрузки */
  const jarPreload = P => HMA && P.key === 'home' ? ['(min-aspect-ratio: 11/10)', '(max-aspect-ratio: 11/10)'].map((m, i) => { const A = jarCfg.arch, k = i ? 'mobile' : 'desktop'; return [A[k] + '000.' + A.ext, A.depth[k] + '000.' + A.depth.ext, A.jar[k].dir + '000.' + A.jar.ext, A.cam[k], A.label].map(f => `<link rel="preload" as="fetch" crossorigin href="${u(P, f)}${ver}" media="${m}">`).join('\n'); }).join('\n') : '';
  const base = site.url.replace(/\/?$/, '/');
  const absUrl = p => p === 'index.html' ? base : base + p;
  const nav = [...ctx.nav, ...ctx.customNav].map(i => [i.title, i.href, i.key]);                    // меню — data/menu.json + свои страницы с включённым пунктом меню
  const c = site.contacts;


  /* подписка на новости (extras.subscribe): компактная форма в подвале — та же система заявок (тип subscribe), поле только одно: e-mail */
  const subBlock = P => C.xon('subscribe') ? `<div class="ftr-sub"><div class="ftr-sub-t"><h2 class="ftr-h">Новости и приглашения</h2><p>${esc(S.FORM_TYPES.subscribe.lead)}</p></div>${S.formHTML('subscribe', {uid: 'sub-ftr', root: u(P, '')})}</div>` : '';

  /* подключения: что нужно браузеру (js/data.js → integrations) и что выводится в <head> и подвале; секретов здесь нет */
  const IT = ctx.integrations || {}, MT = IT.metrika || {}, CS = IT.consent || {}, VR = IT.verification || {}, LG = ctx.legal || {};
  const metrikaOn = /^\d{4,12}$/.test(String(MT.id || '')), consentMode = ['off', 'notice', 'optin'].includes(CS.mode) ? CS.mode : 'optin', consentOn = metrikaOn && consentMode !== 'off';
  const consentCfg = {active: consentOn, mode: consentMode, title: CS.title || 'Cookie и аналитика', text: CS.text || '', accept: CS.accept || 'Принять', decline: CS.decline || 'Только необходимые', settings: CS.settings || 'Настройки cookie'};
  consentCfg.version = crypto.createHash('md5').update(JSON.stringify([consentCfg, !!MT.webvisor, LG.version || ''])).digest('hex').slice(0, 8);
  const publicIntegrations = {metrika: metrikaOn ? {id: String(MT.id), webvisor: !!MT.webvisor, clickmap: MT.clickmap !== false, trackLinks: MT.trackLinks !== false, accurateTrackBounce: MT.accurateTrackBounce !== false} : null, consent: consentCfg, captcha: (IT.captcha || {}).siteKey ? {siteKey: String(IT.captcha.siteKey)} : null, legalVersion: LG.version || ''};
  const verifyMeta = [['yandex-verification', VR.yandex], ['google-site-verification', VR.google], ['wmail-verification', VR.mailru]].filter(([, v]) => v && /^[\w-]{6,128}$/.test(String(v))).map(([n, v]) => `<meta name="${n}" content="${esc(v)}">`).join('\n');
  const msgItems = () => MSG.cells(c).map(ch => ch.url ? `<li><a href="${esc(ch.url)}" target="_blank" rel="noopener" data-track="messenger_click" data-place="footer">${ch.name}</a></li>` : `<li class="msg-off"><span>${ch.name}</span> <small>скоро</small></li>`).join('');
  const legalLinks = P => `<a href="${u(P, 'privacy.html')}">Политика конфиденциальности</a><a href="${u(P, 'consent.html')}">Согласие на обработку данных</a><a href="${u(P, 'terms.html')}">Пользовательское соглашение</a>${consentOn ? `<button class="ftr-cookie" type="button" data-act="cookie-settings">${esc(consentCfg.settings)}</button>` : ''}`;

  const header = P => `<header class="hdr" id="hdr">
  <div class="wrap hdr-in">
    <a href="${u(P, 'index.html')}" class="logo" style="--i:0" aria-label="Астрея — на главную">
      <svg class="lgo" viewBox="46 338 836 436" aria-hidden="true"><use href="#logo-art"/></svg>
    </a>
    <nav class="nav" id="nav" style="--i:1" aria-label="Основная навигация">
      ${nav.map(([t, href, key]) => `<a class="nl${P.nav === key ? ' on' : ''}" href="${u(P, href)}" data-nav="${key}"${P.nav === key ? ' aria-current="page"' : ''}>${t}</a>`).join('\n      ')}
      <div class="nav-extra">
        <form class="nav-search" role="search" action="${u(P, 'search.html')}" method="get">
          <label class="search"><span class="sr">Поиск по сайту</span>${I.search}<input type="search" name="q" placeholder="Поиск по сайту" autocomplete="off" enterkeyhint="search"></label>
          <button class="sr" type="submit" tabindex="-1">Найти</button>
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
          ${msgItems()}
          <li>${esc(c.address)}</li>
          <li class="muted-l">${esc(c.hours)}</li>
          ${C.xon('callback') ? `<li>${C.callbackBtn('ftr-btn', 'footer')}</li>` : ''}
        </ul>
      </div>
    </div>
    ${subBlock(P)}
    <div class="ftr-bottom">
      <span>© ${esc(site.name)}, ${site.year}</span>
      <span class="ftr-legal">${legalLinks(P)}</span>
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
        ${msgItems()}
        <li>${esc(c.address)}</li>
        <li class="muted-l">${esc(c.hours)}</li>
        ${C.xon('callback') ? `<li>${C.callbackBtn('ftr-btn', 'footer')}</li>` : ''}
      </ul>
    </div>
    <div class="ftr-rd-cols">${f.columns.map(col => `<div><h2 class="ftr-h">${esc(col.title)}</h2><ul>${col.links.map(([t, h]) => `<li><a href="${u(P, h)}">${esc(t)}</a></li>`).join('')}</ul></div>`).join('')}</div>
    ${subBlock(P)}
    <div class="ftr-bottom">
      <span>© ${esc(site.name)}, ${site.year}</span>
      <span class="ftr-legal">${legalLinks(P)}</span>
    </div>
    ${showNote ? `<p class="ftr-note">${esc(site.demoNotice)}</p>` : ''}
  </div>
</footer>`; };

  const searchPanel = P => `<div id="srch" class="srch" role="dialog" aria-modal="true" aria-label="Поиск по сайту" hidden>
  <div class="srch-box wrap">
    <form class="srch-form" role="search" action="${u(P, 'search.html')}" method="get">
      <label class="search"><span class="sr">Поиск по товарам, брендам, новостям и обучению</span>${I.search}<input id="srch-q" type="search" name="q" placeholder="Товары, бренды, новости, обучение…" autocomplete="off" enterkeyhint="search"></label>
      <button class="sr" type="submit" tabindex="-1">Найти</button>
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

  const sameAs = [c.max, c.telegram, c.vk, ((c.ext || {}).youtube)].filter(x => /^https:\/\//.test(x || ''));            // профили в соцсетях и мессенджерах — для карточки организации в поиске
  const orgLd = {'@context': 'https://schema.org', '@type': 'Organization', name: site.name, alternateName: site.nameLatin, url: base,
    logo: base + 'assets/logo-512.png', email: c.email, telephone: c.phone,
    address: Object.assign({'@type': 'PostalAddress', addressLocality: (site.schemaAddress || {}).locality || 'Москва', streetAddress: (site.schemaAddress || {}).street || c.address, addressCountry: 'RU'}, (site.schemaAddress || {}).postalCode ? {postalCode: site.schemaAddress.postalCode} : {}),
    ...(sameAs.length ? {sameAs} : {})};
  const siteLd = {'@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: base,
    potentialAction: {'@type': 'SearchAction', target: base + 'search.html?q={search_term_string}', 'query-input': 'required name=search_term_string'}};

  const inline = P => P.key === 'home' ? [EARLY, LEGACY] : [EARLY];                       // встроенные скрипты страницы — разрешены в политике безопасности по хэшу

  /* P: {key, path, depth, root, nav, title, description, ogType, image, noindex, jsonld:[]} */
  /* картинки из assets/ получают ?v=<хэш> (как css/js): после замены файла браузер/CDN не показывают старый кэш */
  const verAssets = html => ver ? html.replace(/(\ssrc=")((?:\.\.\/)*assets\/[^"?#]+)(")/g, '$1$2' + ver + '$3') : html;
  function shell(P, body) {
    body = DC.apply(P, BD.apply(P, body));
    const url = absUrl(P.path), img = base + (P.image || site.ogImage || 'assets/og-image.png');
    const ld = [...(P.key === 'home' ? [orgLd, siteLd] : []), ...(P.jsonld || [])];
    const bread = P.breadcrumbs && P.breadcrumbs.length ? {'@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: P.breadcrumbs.map((b, i) => ({'@type': 'ListItem', position: i + 1, name: b[0], item: absUrl(b[1])}))} : null;
    if (bread) ld.push(bread);
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP.build(ctx, inline(P))}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
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
<link rel="apple-touch-icon" href="${u(P, 'assets/apple-touch-icon.png')}">${C.xon('agentReady') ? `\n<link rel="manifest" href="${u(P, 'manifest.webmanifest')}">` : ''}
${verifyMeta ? verifyMeta + '\n' : ''}<script>${EARLY}</script>
${P.key === 'home' ? `<script>${LEGACY}</script>\n` : ''}<!-- У Fraunces нет кириллицы, поэтому русские заголовки набираются парным по контрасту Playfair Display; латиница и цифры — Fraunces. Шрифты — свои (css/fonts.css), не с серверов Google. -->
${FONT_PRELOAD.map(f => `<link rel="preload" href="${u(P, 'assets/fonts/' + f)}" as="font" type="font/woff2" crossorigin>`).join('\n')}
${pageCss(P).map(n => `<link rel="stylesheet" href="${u(P, `css/${n}.css`)}${ver}">`).join('\n')}
${jarPreload(P)}
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head>
<body${rd ? ' class="rd"' : ''} data-page="${P.key}" data-nav="${P.nav || ''}" data-root="${P.root}">
<a class="skip" href="#main">К основному содержимому</a>
${logoDefs}
<div id="progress" aria-hidden="true"></div>
${P.key === 'notfound' ? '' : splash}
<div id="curtain" aria-hidden="true"><div class="cs">${Array.from({length: 8}, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><div class="ct" aria-hidden="true"></div></div>

${header(P)}

<main id="main" tabindex="-1" data-page="${P.key}">
${body}
</main>

${rd ? footerRd(P) : footer(P)}

${searchPanel(P)}
<div id="modal" aria-hidden="true"></div>
<div id="toast" role="status" aria-live="polite"></div>

${pageJs(P).map(n => `<script src="${u(P, `js/${n}.js`)}${ver}" defer></script>`).join('\n')}
</body>
</html>
`;
  }
  return {shell: (P, body) => verAssets(shell(P, body)), absUrl, base, nav, extrasOn: EX, publicIntegrations};
};
