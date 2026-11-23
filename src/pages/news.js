/* Новости: интерактивная газета «Астрея» на каменном столе (css/news-paper.css, js/news-paper.js) и страницы статей (css/news-article.css, js/news-article.js).
   Содержание — только из data/news.json, data/site.json (скидки, офисы, контакты), data/events.json, data/products.json: ничего не выдумывается.
   Страницы газеты собираются здесь статически (12 страниц: обложка, 5 разворотов, оборот); листы, камеру и физику листания строит js/news-paper.js.
   Без JS (и если нет CSS-3D) остаётся «Архив выпуска» — список всех материалов ссылками на отдельные страницы. */
const S = require('../../js/shared.js');
const {T, Traw} = require('../texts.js');
const {esc, I, dparts} = S;

/* какая статья на какой странице газеты (остальные — в архиве и в оглавлении на обороте): слот → id статьи; задаётся в data/news.json → layout.slots, по умолчанию — src/news-layout.js */
const {WHERE, slotsOf} = require('../news-layout.js');
const SECTION = [T('news.sections.cover'), T('news.sections.promo'), T('news.sections.new'), T('news.sections.expert'), T('news.sections.edu'), T('news.sections.region'), T('news.sections.back')];
const SECTION_PG = ['2–3', '4–5', '6–7', '8–9', '10–11'];                         // страницы разделов (для содержания), по порядку SECTION[1…5]

/* главное действие по теме статьи (то же, что кнопка на странице статьи) */
function ctaOf(ctx, C, P, n) {
  const c = n.cta || {};
  if (c.type === 'partner') return {href: `${C.u(P, 'partners.html')}#calc`, label: T('news.links.cta.partner'), attrs: 'data-track="partner_cta" data-place="article"'};
  if (c.type === 'training') return {href: `${C.u(P, 'training.html')}${c.query ? '?' + c.query : ''}`, label: T('news.links.cta.training'), attrs: ''};
  if (c.type === 'product' && ctx.productById[c.ref]) return {href: C.purl(P, ctx.productById[c.ref]), label: T('news.links.cta.product'), attrs: ''};
  if (c.type === 'catalog') return {href: `${C.u(P, 'catalog.html')}${c.query ? '?' + c.query : ''}`, label: T('news.links.cta.catalog'), attrs: 'data-track="catalog_click" data-place="article"'};
  if (c.type === 'brand' && ctx.brandById[c.ref]) return {href: C.burl(P, ctx.brandById[c.ref]), label: `${T('news.links.cta.brand')} ${ctx.brandById[c.ref].name}`, attrs: ''};
  if (c.type === 'event' && ctx.eventById[c.ref]) return {href: C.eurl(P, ctx.eventById[c.ref]), label: T('news.links.cta.event'), attrs: ''};
  if (c.type === 'contacts') return {href: C.u(P, 'contacts.html'), label: T('news.links.cta.contacts'), attrs: ''};
  return null;
}

function newsPage(ctx, C, P) {
  const SLOT = slotsOf(ctx.newsLayout);
  const {news, newsCats, site} = ctx, u = h => C.u(P, h);
  const byId = Object.fromEntries(news.map(n => [n.id, n]));
  const slot = k => byId[SLOT[k]];
  const maxPct = Math.max(...site.discounts.map(d => d.pct));
  const latest = news[0], ld = dparts(latest.date);
  const MONTH = {янв: 'январь', фев: 'февраль', мар: 'март', апр: 'апрель', май: 'май', июн: 'июнь', июл: 'июль', авг: 'август', сен: 'сентябрь', окт: 'октябрь', ноя: 'ноябрь', дек: 'декабрь'};
  const issueTxt = `${MONTH[ld.m] || ld.m} ${ld.y}`;
  const cat = n => ctx.newsCatById[n.category];
  const phone = site.contacts.phone;

  const tag = n => `<span class="np-tag" style="--c1:${cat(n).c1}"><i></i>${esc(cat(n).name)}</span>`;
  const time = n => `<time datetime="${n.date}">${esc(dparts(n.date).full)}</time>`;
  const open = (n, cls = '') => `<a class="${cls}" href="${C.nurl(P, n)}" data-np-open="${n.id}" data-track="news_open" data-place="paper">`;
  const head = (n, lvl = 3, cls = '') => `<h${lvl} class="np-h ${cls}">${open(n)}${esc(n.title)}</a></h${lvl}>`;
  const meta = n => `<div class="np-meta">${tag(n)}${time(n)}</div>`;
  const paras = (n, from = 0, to = 99) => n.body.slice(from, to).map(p => `<p>${esc(p)}</p>`).join('');
  const act = (n, extra = '') => { const c = ctaOf(ctx, C, P, n); return `<div class="np-act">${c ? `<a class="np-btn" href="${c.href}" ${c.attrs}>${esc(c.label)} ${I.arrow}</a>` : ''}${open(n, 'np-lnk')}${T('news.links.more')} ${I.arrow}</a>${extra}</div>`; };
  const img = (name, alt, w, h, cls = '') => `<img class="${cls}" src="${u('assets/news/' + name)}" width="${w}" height="${h}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  const pk = (name, w, h, cls = '') => `<img class="np-pk ${cls}" src="${u('assets/showroom/pack-' + name + '.webp')}" width="${w}" height="${h}" alt="" loading="lazy" decoding="async" aria-hidden="true">`;
  const folio = (i, label) => `<header class="np-folio"><span>${T('news.pages.mast')}</span><em>${esc(label)}</em><span>${T('news.pages.pg')} ${i + 1}</span></header>`;
  const foot = (i, side) => `<footer class="np-foot ${side}"><span>${esc(issueTxt)}</span><b>${i + 1}</b></footer>`;
  const page = (i, cls, inner, label) => `<article class="np-pg ${cls}" data-pg="${i}" data-sp="${i === 0 ? 0 : Math.ceil(i / 2)}" aria-label="${T('news.pages.page')} ${i + 1}">${i === 0 || i === 11 ? '' : folio(i, label)}${inner}${i === 0 || i === 11 ? '' : foot(i, i % 2 ? 'l' : 'r')}</article>`;
  const prodLinks = n => ((n.related || {}).products || []).map(id => ctx.productById[id]).filter(Boolean).map(p => `<li><a href="${C.purl(P, p)}" data-track="news_product">${esc(p.name)}<small>${esc(ctx.brandById[p.brand].name)}</small></a></li>`).join('');
  const where = n => { const k = Object.keys(SLOT).find(x => SLOT[x] === n.id); return k ? WHERE[k][1] : ''; };
  const alsoIn = (excl, label) => { const rest = news.filter(n => !excl.includes(n.id)).slice(0, 3);
    return rest.length ? `<aside class="np-brief"><b>${esc(label || T('news.pages.also'))}</b><ul>${rest.map(n => `<li>${open(n)}<span>${esc(n.title)}</span><em>${where(n) ? '' + T('news.pages.pg') + ' ' + where(n) : T('news.pages.archive')}</em></a></li>`).join('')}</ul></aside>` : ''; };

  const nPromo = slot('promo'), nA = slot('newA'), nB = slot('newB'), nX = slot('expert'), nE1 = slot('eduA'), nE2 = slot('eduB'), nE3 = slot('eduC'), nE4 = slot('eduD'), nR = slot('region');
  const sub = S.FORM_TYPES.subscribe;

  /* ---- 0. Обложка ---- */
  const lead = nE1 || latest;
  const cover = `<div class="np-cover">
      <header class="np-mast"><div class="np-mast-top"><span>${esc(issueTxt)}</span><span>${T('news.cover.cities')}</span></div>
        <div class="np-mast-t" aria-hidden="true">${T('news.pages.mast')}</div><div class="np-mast-sub">${T('news.cover.tagline')}</div></header>
      <article class="np-art np-lead np-grow" data-id="${lead.id}" data-cat="${lead.category}">
        ${meta(lead)}${head(lead, 2, 'np-h-xl')}
        <figure class="np-fig">${img('ph-seminar-a.webp', T('news.cover.alt'), 960, 540)}<figcaption>${T('news.cover.cap')}</figcaption></figure>
        <p class="np-dek">${esc(lead.excerpt)}</p>
        <div class="np-act">${open(lead, 'np-lnk')}${T('common.pages.newsRead', {n: where(lead) || '8'})} ${I.arrow}</a></div>
      </article>
      <div class="np-tease">${[[nPromo, Traw('common.labels.upto', {n: maxPct + '%'})], [nA, ''], [nE2, '']].filter(x => x[0]).map(([n, big]) => `<article class="np-art np-ts" data-id="${n.id}" data-cat="${n.category}">${tag(n)}${big ? `<b class="np-big">${esc(big)}</b>` : ''}${head(n, 3, 'np-h-s')}<span class="np-pgref">${T('news.pages.pg')} ${where(n)}</span></article>`).join('')}</div>
    </div>`;

  /* ---- 1–2. Акции ---- */
  const promoL = nPromo ? `<div class="np-poster">
      <span class="np-kick np-kick-w">${T('news.promo.badge')}</span>
      <div class="np-fig-pct" aria-label="${T('common.aria.pct', {pct: maxPct})}"><span>до</span><b>${maxPct}<small>%</small></b></div>
      ${head(nPromo, 2, 'np-h-l')}
      <p class="np-dek">${esc(nPromo.excerpt)}</p>
      <div class="np-act np-act-w"><a class="np-btn np-btn-w" href="${u('partners.html')}#calc" data-track="partner_cta" data-place="news-paper">${T('news.promo.calc')} ${I.arrow}</a>${C.partnerBtn(P, 'news-paper', 'np-btn np-btn-ghost', T('news.promo.partner'))}</div>
    </div>` : '';
  const ledger = `<table class="np-ledger"><caption>${T('news.promo.steps')}</caption><thead><tr><th scope="col">${T('news.promo.buy')}</th><th scope="col">${T('news.promo.disc')}</th></tr></thead><tbody>${site.discounts.map(d => `<tr><th scope="row">${T('common.labels.from', {sum: esc(S.rub(d.from))})}</th><td><span class="np-bar" style="--w:${Math.round(d.pct / maxPct * 100)}%"></span><b>${d.pct}%</b></td></tr>`).join('')}</tbody></table>`;
  const promoR = nPromo ? `<article class="np-art np-promo-r" data-id="${nPromo.id}" data-cat="${nPromo.category}">
      <span class="np-kick">${T('news.pages.tag.promo')}</span>${meta(nPromo)}
      <div class="np-body">${paras(nPromo, 0, 1)}</div>${ledger}<div class="np-body">${paras(nPromo, 1)}</div>${act(nPromo)}
    </article>` : '';

  /* ---- 3–4. Новинки ---- */
  const novelty = (n, sprites, kick, np = 2) => n ? `<article class="np-art np-novelty" data-id="${n.id}" data-cat="${n.category}">
      <span class="np-kick">${kick}</span>${meta(n)}${head(n, 2, 'np-h-l')}
      <div class="np-stage-pk" aria-hidden="true"><i class="np-plinth"></i>${sprites}</div>
      <p class="np-dek">${esc(n.excerpt)}</p>
      <div class="np-body np-cols">${paras(n, 0, np)}</div>
      ${prodLinks(n) ? `<ul class="np-plist">${prodLinks(n)}</ul>` : ''}
      ${act(n)}</article>` : '';
  const novA = novelty(nA, pk('eva-device', 277, 820, 'np-pk-a'), T('news.pages.tag.newA'), 1);
  const novB = novelty(nB, pk('dermatime-bottle', 332, 1200, 'np-pk-b') + pk('dermatime-box', 555, 1200, 'np-pk-c'), T('news.pages.tag.newB'));

  /* ---- 5–6. Экспертное ---- */
  const quote = nX ? nX.body.find(p => /специалист/.test(p)) || nX.excerpt : '';
  const expL = nX ? `<article class="np-art" data-id="${nX.id}" data-cat="${nX.category}">
      <span class="np-kick">${T('news.pages.tag.expert')}</span>${meta(nX)}${head(nX, 2, 'np-h-l')}
      <p class="np-dek">${esc(nX.excerpt)}</p>
      <div class="np-body np-cols">${paras(nX, 0, 2)}</div>${act(nX)}
    </article>` : '';
  const expR = nX ? `<div class="np-expert">
      <figure class="np-fig np-fig-tall">${img('ph-care.webp', T('news.photos.expert'), 600, 900)}</figure>
      <blockquote class="np-quote"><p>${esc(quote)}</p><footer>Из материала «${esc(nX.title)}»</footer></blockquote>
      <div class="np-stage-pk np-stage-sm" aria-hidden="true"><i class="np-plinth"></i>${pk('heliocare-bottle', 231, 820, 'np-pk-a')}${pk('neoretin-bottle', 231, 820, 'np-pk-b')}</div>
      ${prodLinks(nX) ? `<ul class="np-plist">${prodLinks(nX)}</ul>` : ''}
    </div>` : '';

  /* ---- 7–8. Обучение и события ---- */
  const evs = ctx.sortedEvents.filter(e => e.date >= new Date().toISOString().slice(0, 10)).slice(0, 2);
  const evList = (evs.length ? evs : ctx.sortedEvents.slice(-2)).map(e => `<li><a href="${C.eurl(P, e)}" data-track="news_event"><time datetime="${e.date}"><b>${dparts(e.date).d}</b>${esc(dparts(e.date).m)}</time><span>${esc(e.title)}<small>${esc(e.city)} · ${esc(e.fmt)}</small></span></a></li>`).join('');
  const small = (n, extra = '', np = 2) => n ? `<article class="np-art np-sm${extra ? ' np-row' : ''}" data-id="${n.id}" data-cat="${n.category}">${extra}<div class="np-sm-t">${meta(n)}${head(n, 3, 'np-h-m')}<p class="np-dek">${esc(n.excerpt)}</p>${np ? `<div class="np-body">${paras(n, 0, np)}</div>` : ''}${act(n)}</div></article>` : '';
  const eduL = `<div class="np-col"><span class="np-kick">${T('news.pages.tag.edu')}</span>${nE1 ? `<article class="np-art np-grow" data-id="${nE1.id}" data-cat="${nE1.category}">${meta(nE1)}${head(nE1, 2, 'np-h-l')}<figure class="np-fig">${img('ph-seminar-b.webp', T('news.photos.seminar'), 960, 540)}</figure><p class="np-dek">${esc(nE1.excerpt)}</p><div class="np-body np-cols">${paras(nE1, 0, 1)}</div>${act(nE1)}</article>` : ''}${small(nE2, '', 0)}</div>`;
  const eduR = `<div class="np-col"><span class="np-kick">${T('news.pages.tag.edu')}</span>${small(nE3, `<figure class="np-fig np-fig-side">${img('ph-presenter.webp', T('news.photos.webinar'), 540, 720)}</figure>`, 1)}${small(nE4, '', 0)}
      <section class="np-evs"><h3 class="np-h np-h-s">${T('news.edu.soon')}</h3><ul>${evList}</ul><a class="np-lnk" href="${u('training.html')}" data-track="news_training">${T('news.edu.all')} ${I.arrow}</a></section></div>`;

  /* ---- 9–10. Компания и регионы + подписка ---- */
  const offices = site.offices.map(o => `<li><b>${esc(o.city)}</b><span>${esc(o.role)}</span>${o.addr && !/уточняйте/.test(o.addr) ? `<small>${esc(o.addr)}</small>` : ''}${o.phones && o.phones[0] ? `<a href="tel:${o.phones[0][0].replace(/[^\d+]/g, '')}">${esc(o.phones[0][0])}</a>` : ''}</li>`).join('');
  const regL = `<div class="np-col"><span class="np-kick">${T('news.pages.tag.region')}</span>${nR ? `<article class="np-art np-grow" data-id="${nR.id}" data-cat="${nR.category}">${meta(nR)}${head(nR, 2, 'np-h-l')}<figure class="np-fig">${img('ph-team.webp', T('news.photos.team'), 800, 533)}</figure><p class="np-dek">${esc(nR.excerpt)}</p><div class="np-body np-cols">${paras(nR, 0, 2)}</div>${act(nR)}</article>` : ''}
      <ul class="np-offices" aria-label="${T('news.region.offices')}">${offices}</ul></div>`;
  const subR = `<div class="np-coupon"><span class="np-kick">${T('news.region.sub')}</span><h2 class="np-h np-h-l">${esc(sub.title)}</h2><p class="np-dek">${esc(sub.lead)}</p>
      <div class="np-cut" aria-hidden="true"></div>${S.formHTML('subscribe', {uid: 'np-sub', root: u('')})}</div>`;

  /* ---- 11. Оборот: содержание ---- */
  /* содержание как в настоящем журнале: по разделам и в порядке страниц (раньше шло по датам, номера страниц прыгали 8, 2–3, 8, 4…), цвет точки — рубрика (как у фильтров) */
  const secGroups = SECTION.slice(1, 6).map((name, i) => ({name, pg: SECTION_PG[i], items: Object.keys(SLOT).filter(k => WHERE[k][0] === i + 1).map(k => byId[SLOT[k]]).filter(Boolean)})).filter(g => g.items.length);
  const inSlot = new Set(Object.values(SLOT)), archive = news.filter(n => !inSlot.has(n.id));
  const tocRow = n => `<li data-cat="${n.category}"><a href="${C.nurl(P, n)}" data-np-open="${n.id}" data-track="news_toc"><i class="np-dot" style="--c1:${cat(n).c1}" title="${esc(cat(n).name)}"></i><span>${esc(n.title)}</span><em>${where(n) || T('news.pages.archive')}</em></a></li>`;
  const toc = [...secGroups, ...(archive.length ? [{name: T('news.pages.inarch'), pg: '', items: archive}] : [])].map(g => `<section class="np-tg" data-cats="${[...new Set(g.items.map(n => n.category))].join(' ')}" style="--n:${g.items.length + 1}"><h3><span>${esc(g.name)}</span><em>${g.pg ? '' + T('news.pages.pg') + ' ' + g.pg : ''}</em></h3><ul>${g.items.map(tocRow).join('')}</ul></section>`).join('');
  const back = `<div class="np-back"><div class="np-mast-t np-mast-s" aria-hidden="true">${T('news.pages.mast')}</div><h2 class="np-h np-h-m">${T('news.back.toc')}</h2><div class="np-toc-l">${toc}</div>
      <div class="np-colo"><p>${esc(site.name)} ${T('news.back.about')} ${esc(site.contacts.hours)}.</p><p><a href="tel:${site.contacts.phoneRaw}" data-track="phone_click">${esc(phone)}</a> · <a href="mailto:${esc(site.contacts.email)}">${esc(site.contacts.email)}</a></p>
      <button class="np-btn" type="button" data-np-go="0">${T('news.back.first')} ${I.arrow}</button></div></div>`;

  const pages = [page(0, 'np-p-cover', cover, SECTION[0]), page(1, 'np-p-l np-poster-pg', promoL, SECTION[1]), page(2, 'np-p-r', promoR, SECTION[1]), page(3, 'np-p-l', novA + (nA && nB ? alsoIn([nA.id, nB.id]) : ''), SECTION[2]), page(4, 'np-p-r', novB, SECTION[2]),
    page(5, 'np-p-l', expL + (nX ? alsoIn([nX.id]) : ''), SECTION[3]), page(6, 'np-p-r', expR, SECTION[3]), page(7, 'np-p-l', eduL, SECTION[4]), page(8, 'np-p-r', eduR, SECTION[4]), page(9, 'np-p-l', regL, SECTION[5]),
    page(10, 'np-p-r', subR, SECTION[5]), page(11, 'np-p-back', back, SECTION[6])];

  /* данные для чтения статьи поверх газеты (тексты и действия те же, что на отдельных страницах; безопасно для <script>: «<» экранируется) */
  const data = {arts: Object.fromEntries(news.map(n => { const c = ctaOf(ctx, C, P, n), k = Object.keys(SLOT).find(x => SLOT[x] === n.id);
    return [n.id, {id: n.id, title: n.title, excerpt: n.excerpt, body: n.body, date: n.date, dateText: dparts(n.date).full, cat: n.category, catName: cat(n).name, url: C.nurl(P, n), sp: k ? WHERE[k][0] : 0, pg: k ? WHERE[k][1] : '',
      cta: c ? {href: c.href, label: c.label, attrs: c.attrs} : null,
      rel: {products: ((n.related || {}).products || []).map(id => ctx.productById[id]).filter(Boolean).map(p => ({name: p.name, href: C.purl(P, p), brand: ctx.brandById[p.brand].name})),
        events: ((n.related || {}).events || []).map(id => ctx.eventById[id]).filter(Boolean).slice(0, 3).map(e => ({title: e.title, href: C.eurl(P, e), date: dparts(e.date).full, city: e.city}))}}]; })),
    spreads: SECTION,
    discounts: site.discounts};

  const tabs = [['all', T('news.intro.all'), news.length], ...newsCats.map(c => [c.id, c.name, news.filter(n => n.category === c.id).length])];
  const arch = news.map(n => `<li class="np-ai" data-cat="${n.category}" data-id="${n.id}">${tag(n)}${time(n)}<h3><a href="${C.nurl(P, n)}" data-np-open="${n.id}" data-track="news_open" data-place="archive">${esc(n.title)}</a></h3><p>${esc(n.excerpt)}</p><div class="np-ai-f">${(c => c ? `<a class="np-lnk sx-nact" href="${c.href}" ${c.attrs}>${esc(c.label)} ${I.arrow}</a>` : '')(ctaOf(ctx, C, P, n))}<a class="np-lnk" href="${C.nurl(P, n)}" data-np-open="${n.id}">${T('news.links.read')} ${I.arrow}</a>${where(n) ? `<button class="np-lnk" type="button" data-np-show="${n.id}">${T('news.links.inpaper')} ${where(n)}</button>` : ''}</div></li>`).join('');

  /* подставка стола — призма из граней по кругу (24 грани по 15°, с юга видны 7…17): ствол, плинт и воротник, каждая грань — срез общей полосы (assets/news/leg-strip.webp); верх воротника и верх плинта — диски. Стили — css/news-table.css */
  const PED = `<span class="np-ped">${Array.from({length: 11}, (_, k) => `<b style="--i:${k - 5};--k:${k}"><u></u></b>`).join('')}<i class="np-pcap"></i><i class="np-ppl"></i></span>`;
  return `<div class="np" data-np data-np-n="${news.length}" data-np-issue="${esc(issueTxt)}">
    <section class="np-stage" data-np-stage aria-labelledby="np-title">
      <div class="np-sticky" data-np-sticky>
        <div class="np-world" data-np-world>
          <div class="np-cam" data-np-cam>
            <div class="np-table" aria-hidden="true"><i class="np-tex"></i><i class="np-light"></i></div>
            <div class="np-t3" aria-hidden="true"><i class="np-leg"></i>${PED}<i class="np-gl"></i><span class="np-wl"><b style="--i:0;--sh:0.05"></b><b style="--i:1;--sh:0.07"></b><b style="--i:2;--sh:0.10"></b><b style="--i:3;--sh:0.13"></b><b style="--i:4;--sh:0.16"></b><b style="--i:5;--sh:0.18"></b><b style="--i:6;--sh:0.21"></b><b style="--i:7;--sh:0.24"></b><b style="--i:8;--sh:0.27"></b><b style="--i:9;--sh:0.29"></b><b style="--i:10;--sh:0.31"></b><b style="--i:11;--sh:0.32"></b><b style="--i:12;--sh:0.33"></b><b style="--i:13;--sh:0.34"></b><b style="--i:14;--sh:0.34"></b><b style="--i:15;--sh:0.33"></b><b style="--i:16;--sh:0.32"></b><b style="--i:17;--sh:0.31"></b><b style="--i:18;--sh:0.29"></b><b style="--i:19;--sh:0.27"></b><b style="--i:20;--sh:0.24"></b><b style="--i:21;--sh:0.21"></b><b style="--i:22;--sh:0.18"></b><b style="--i:23;--sh:0.16"></b><b style="--i:24;--sh:0.13"></b><b style="--i:25;--sh:0.10"></b><b style="--i:26;--sh:0.07"></b><b style="--i:27;--sh:0.05"></b><b style="--i:28;--sh:0.03"></b><b style="--i:29;--sh:0.02"></b><b style="--i:30;--sh:0.01"></b><b style="--i:31;--sh:0.00"></b><b style="--i:32;--sh:0.00"></b><b style="--i:33;--sh:0.01"></b><b style="--i:34;--sh:0.02"></b><b style="--i:35;--sh:0.03"></b></span></div>
            <div class="np-rig" data-np-rig>
              <i class="np-shd np-shd-c is-on" data-np-shd="c" aria-hidden="true"></i><i class="np-shd np-shd-o" data-np-shd="o" aria-hidden="true"></i>
              <div class="np-book" data-np-book></div>
            </div>
          </div>
        </div>
        <div class="np-hud np-hud-top">
          <div class="np-title"><span class="np-eyebrow reveal">${T('news.intro.eyebrow')}</span><h1 id="np-title" class="reveal" data-nosplit>${T('news.intro.h1')}</h1><p class="reveal">${T('news.intro.lead')}</p></div>
          <div class="np-filters" role="group" aria-label="${T('news.intro.cats')}">${tabs.map(([id, l, n], i) => `<button class="np-f${i ? '' : ' is-on'}" type="button" data-np-cat="${id}" aria-pressed="${i ? 'false' : 'true'}">${esc(l)}<small>${n}</small></button>`).join('')}</div>
          <button class="np-tocbtn" type="button" data-np-tocbtn aria-expanded="false" aria-controls="np-toc"><span>${T('news.nav.toc')}</span></button>
        </div>
        <p class="np-status" data-np-status role="status" aria-live="polite" hidden></p>
        <div class="np-intro" data-np-intro><button class="np-open reveal" type="button" data-np-skip>${T('news.intro.open')}</button><span class="np-scrollhint reveal" aria-hidden="true">${T('news.intro.hint')}</span></div>
        <div class="np-hud np-hud-bot" data-np-bot>
          
          <nav class="np-nav" aria-label="${T('news.nav.paper')}"><button class="np-nb" type="button" data-np-step="-1" aria-label="${T('news.nav.prev')}">${I.back}<span>${T('news.nav.prev')}</span></button>
            <div class="np-ind" data-np-ind><span data-np-pgtxt>${T('news.sections.cover')}</span><ol class="np-dots" data-np-dots></ol></div>
            <button class="np-nb np-nb-n" type="button" data-np-step="1" aria-label="${T('news.nav.next')}"><span>${T('news.nav.next')}</span>${I.arrow}</button></nav>
        </div>
        <aside class="np-toc" id="np-toc" data-np-toc hidden aria-label="${T('news.nav.toc.aria')}"><div class="np-toc-h"><b>${T('news.nav.toc')}</b><button type="button" data-np-tocbtn aria-label="${T('news.nav.toc.close')}">${I.close}</button></div>
          <ol>${[...secGroups.flatMap(g => g.items), ...archive].map(n => { const w = where(n); return `<li data-cat="${n.category}"><a href="${C.nurl(P, n)}" data-np-open="${n.id}" data-np-jump="${n.id}">${tag(n)}<span>${esc(n.title)}</span><em>${w ? '' + T('news.pages.pg') + ' ' + w : T('news.pages.archive')}</em></a></li>`; }).join('')}</ol></aside>
        <div class="np-pages" data-np-pages hidden>${pages.join('\n')}</div>
      </div>
    </section>
    <section class="np-arch" aria-labelledby="np-arch-t">
      <div class="np-arch-in"><span class="np-eyebrow">${T('news.archive.h2')}</span><h2 id="np-arch-t">${T('news.archive.kicker')}</h2>
        <p class="np-arch-l">${T('news.archive.text')}</p>
        <ul class="np-ai-l" data-np-arch>${arch}</ul>
        <div class="np-empty" data-np-empty hidden><b>${T('news.archive.empty.h')}</b>${T('news.archive.empty.p')}</div></div>
    </section>
    <div class="np-ov" data-np-ov hidden></div>
    <script type="application/json" id="np-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
  </div>`;
}

function articlePage(ctx, C, P, n) {
  const SLOT = slotsOf(ctx.newsLayout);
  const cat = ctx.newsCatById[n.category], rel = n.related || {}, u = h => C.u(P, h);
  const prods = (rel.products || []).map(id => ctx.productById[id]).filter(Boolean);
  const evs = (rel.events || []).map(id => ctx.eventById[id]).filter(Boolean);
  const brs = (rel.brands || []).map(id => ctx.brandById[id]).filter(Boolean);
  const idx = ctx.news.indexOf(n), prev = ctx.news[idx + 1], next = ctx.news[idx - 1];
  const more = ctx.news.filter(x => x.id !== n.id).sort((a, b) => (b.category === n.category) - (a.category === n.category)).slice(0, 3);
  const cta = ctaOf(ctx, C, P, n);
  const kk = Object.keys(SLOT).find(x => SLOT[x] === n.id), sp = kk ? WHERE[kk][0] : 0;
  const photo = {sale: null, novelty: null, edu: 'ph-seminar-b.webp', event: 'ph-seminar-a.webp', news: n.id === 'n9' ? 'ph-team.webp' : n.id === 'n4' ? 'ph-care.webp' : null}[n.category];
  const sprites = {n3: ['eva-device'], n5: ['dermatime-bottle', 'dermatime-box'], n4: ['heliocare-bottle', 'neoretin-bottle'], n6: ['iraltone-bottle', 'iraltone-box']}[n.id];
  const lead = n.excerpt, paras = n.body;
  return `<div class="na" style="--c1:${cat.c1};--c2:${cat.c2}" data-cat="${n.category}" data-art="${n.id}" data-na>
    <section class="na-stone" aria-label="${T('news.article.aria')}"><i class="na-light" aria-hidden="true"></i>
    <article class="na-sheet" data-na-sheet><i class="na-prog" data-na-prog aria-hidden="true"></i>
      <header class="na-head">
        ${C.crumbs(P, [[T('news.article.home'), 'index.html'], [T('news.article.crumb'), 'news.html'], [n.title, `news/${n.slug}.html`]])}
        <div class="na-mast" aria-hidden="true"><span>${T('news.pages.mast')}</span><em>${T('news.cover.tagline')}</em><span>${esc(dparts(n.date).full)}</span></div>
        <div class="na-meta reveal"><span class="np-tag" style="--c1:${cat.c1}"><i></i>${esc(cat.name)}</span>${C.timeTag(n.date)}</div>
        <h1 class="reveal">${esc(n.title)}</h1>
        <p class="na-dek reveal">${esc(lead)}</p>
      </header>
      <figure class="na-cover reveal" aria-hidden="true">
        ${n.image ? `<img src="${esc(u(n.image))}" alt="${esc(n.imageAlt || '')}" width="960" height="540" decoding="async">` : photo ? `<img src="${u('assets/news/' + photo)}" alt="" width="960" height="540" decoding="async">` : `<div class="na-type"><span>${n.category === 'sale' ? Traw('common.labels.upto', {n: Math.max(...ctx.site.discounts.map(d => d.pct)) + '%'}) : esc(cat.name)}</span></div>`}
        ${sprites ? `<div class="np-stage-pk na-pk">${sprites.map((s, i) => `<img class="np-pk np-pk-${'abc'[i]}" src="${u('assets/showroom/pack-' + s + '.webp')}" alt="" loading="lazy" decoding="async">`).join('')}</div>` : ''}
      </figure>
      <div class="na-body reveal">${paras.map((p, i) => `<p${i === 0 ? ' class="na-first"' : ''}>${esc(p)}</p>`).join('')}</div>
      ${cta ? `<div class="na-cta reveal"><a class="btn btn-fill" href="${cta.href}" ${cta.attrs}>${esc(cta.label)} ${I.arrow}</a><a class="btn btn-ghost" href="${u('news.html')}${sp ? '#s' + sp : ''}">${T('news.article.togazette')}${sp ? T('common.pages.newsPg', {n: WHERE[kk][1]}) : ''}</a></div>` : `<div class="na-cta reveal"><a class="btn btn-ghost" href="${u('news.html')}">${T('news.article.all')}</a></div>`}
      <nav class="na-sib" aria-label="${T('news.article.near')}">${prev ? `<a href="${C.nurl(P, prev)}"><small>${I.back} ${T('news.article.prev')}</small><span>${esc(prev.title)}</span></a>` : '<span></span>'}${next ? `<a class="nx" href="${C.nurl(P, next)}"><small>${T('news.article.next')} ${I.arrow}</small><span>${esc(next.title)}</span></a>` : '<span></span>'}</nav>
    </article></section>

    <div class="wrap na-after">
    ${(prods.length || evs.length || brs.length) ? `<section class="sec na-rel" style="padding-top:0">
      ${prods.length ? `${C.secHead(T('news.article.products'), T('news.article.products.h'))}<div class="grid g4" style="margin-bottom:clamp(28px,4vw,48px)">${prods.map((p, i) => C.productCardX(P, p, i)).join('')}</div>` : ''}
      ${evs.length ? `${C.secHead(T('news.article.events'), T('news.article.events.h'))}<div class="grid g3 events-grid" style="margin-bottom:clamp(28px,4vw,48px)">${evs.slice(0, 3).map(e => C.eventCard(P, e)).join('')}</div>` : ''}
      ${brs.length ? `<div class="tasks-line">${brs.map(b => `<a class="tag blue" href="${C.burl(P, b)}">${esc(b.name)}</a>`).join('')}</div>` : ''}
    </section>` : ''}

    <section class="sec na-more" style="padding-top:0">
      ${C.secHead(T('news.article.also'), T('news.article.also.h'), C.lnk(u('news.html'), T('news.article.also.all')))}
      <div class="grid g3">${more.map(x => C.newsCard(P, x)).join('')}</div>
    </section>
    </div>
  </div>
  ${C.ctaBand(P, 'article-cta', C.closingCfg('article', n.category) && Object.assign({}, C.closingCfg('article', n.category), {vars: {}}))}`;
}

module.exports = {newsPage, articlePage};
