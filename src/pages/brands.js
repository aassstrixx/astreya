const S = require('../../js/shared.js');
const {esc, I} = S;

/* Страница «Бренды» и страница отдельного бренда */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
/* высота упаковки-макета в сантиметрах (из размеров 3D-моделей tools/showroom-assets/packs.py): по ним товары в нише получают верный масштаб относительно подиума */
const PACK_CM = {tube: 13.95, bottle: 19.15, pump: 17.0, dropper: 16.2, jar: 7.13, box: 6.0, device: 15.6};

function brandsPage(ctx, C, P) {
  const bp = ctx.redesign && ctx.redesign.brandsPage;
  if (bp && bp.gallery) return brandsGallery(ctx, C, P);
  const {brands, tasks} = ctx;
  return `<div class="wrap" data-brands>
    ${C.pageHead('Бренды', 'Бренды профессиональной косметики', 'Портфель «Астрея»: испанская профессиональная косметика, линии Cantabria Labs и аппаратное решение EVA.')}
    <div class="toolbar reveal">
      <div class="tb-top"><label class="search"><span class="sr">Поиск по брендам</span>${I.search}<input id="br-q" type="search" placeholder="Название бренда или направление" autocomplete="off"></label></div>
      <div class="tb-row"><span class="tb-lab">Задача</span><div class="chips" id="br-tasks">${C.chip('Любая', 'br-task', 'all', true)}${tasks.map(t => C.chip(esc(t.label), 'br-task', t.id, false)).join('')}</div></div>
    </div>
    <h2 class="sr">Список брендов</h2>
    <div class="grid g3" id="br-grid">${brandCards(ctx, C, P)}</div>
    <div class="empty" id="br-empty" hidden><b>Бренды не найдены</b>Измените запрос или выберите другую задачу.</div>
    <div style="height:clamp(60px,8vw,110px)"></div>
  </div>`;
}

/* список карточек; при site.redesign — две группы: косметика и аппаратные решения (заголовки скрываются фильтром, если в группе нет результатов) */
function brandCards(ctx, C, P) {
  const {brands, redesign} = ctx;
  if (!redesign) return brands.map(b => C.brandCardList(P, b)).join('');
  const bp = redesign.brandsPage, dev = new Set(bp.deviceIds);
  const cos = brands.filter(b => !dev.has(b.id)), dv = brands.filter(b => dev.has(b.id));
  return `<h2 class="br-group reveal">${esc(bp.groups.cosmetic)}</h2>${cos.map(b => C.brandCardList(P, b)).join('')}` +
    (dv.length ? `<h2 class="br-group br-group-dev reveal">${esc(bp.groups.device)}</h2><p class="br-dev-note muted">${esc(bp.deviceNote)}</p>${dv.map(b => C.brandCardList(P, b)).join('')}` : '');
}

/* ---------- архитектурная галерея брендов: первый экран-зал, панель поиска и фильтров, арочные ниши-витрины ---------- */
/* товары для ниши: сначала «избранные» и новинки, разные виды упаковки; их столько, сколько посадочных мест на подиумах в рендере ниши */
function nicheProducts(prods, n) {
  const list = prods.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  const out = [], seen = new Set();
  for (const p of list) if (!seen.has(p.type) && out.length < n) { out.push(p); seen.add(p.type); }
  for (const p of list) if (out.length < n && !out.includes(p)) out.push(p);
  return out.sort((a, b) => (PACK_CM[b.type] || 0) - (PACK_CM[a.type] || 0));          // самый высокий — на главный подиум
}

/* карточка-витрина бренда (арочная ниша с логотипом и товарами на подиумах): общая для страницы «Бренды» и галереи на главной */
function nicheCardMaker(ctx, C, P) {
  const {products} = ctx;
  const niches = readJson('assets/brands/niches.json') || {}, packs = readJson('assets/showroom/packs.json') || {};
  const logoPx = (b, A) => b.logoW && b.logoH ? Math.round(Math.sqrt(A * b.logoW / b.logoH) * (b.logoScale || 1) * 10) / 10 : 0;
  const pct = x => Math.round(x * 10000) / 100;

  return b => {
    const n = products.filter(p => p.brand === b.id).length, nm = niches[b.id], word = S.plural(n, 'позиция', 'позиции', 'позиций');
    const hay = S.norm([b.name, b.tag, b.desc, b.group, b.country, b.tasks.map(t => ctx.taskById[t].label).join(' ')].join(' '));
    const prods = nm ? nicheProducts(products.filter(p => p.brand === b.id), nm.slots.length) : [];
    const pk = prods.map((p, i) => {
      const slot = nm.slots[i], file = S.packOf(p), key = (/([^/]+)\.webp$/.exec(file) || [])[1], meta = packs[key]; if (!meta) return '';
      const h = (PACK_CM[p.type] || 15) / (nm.frame[1] * 100);
      return `<span class="br-pk" style="--x:${pct(slot.x)}%;--y:${pct(slot.y)}%;--h:${pct(h)}%;--ar:${(meta.w / meta.h).toFixed(4)};z-index:${Math.round(slot.y * 100)}"><img src="${esc(C.u(P, file))}" alt="" width="${meta.w}" height="${meta.h}" loading="lazy" decoding="async"></span>`;
    }).join('');
    const lw = logoPx(b, 11000);
    const logo = b.logo ? `<img class="br-logo" src="${esc(C.u(P, b.logo))}" alt="${esc(b.name)}"${b.logoW ? ` width="${b.logoW}" height="${b.logoH}"` : ''}${lw ? ` style="--lw:${lw}"` : ''} loading="lazy" decoding="async">` : `<b class="br-logo br-logo-t">${esc(b.name)}</b>`;
    const names = prods.map(p => p.name).join(', ');
    return `<article class="card br-card bl-card reveal" style="${S.bstyle(b)}" data-id="${b.id}" data-tasks="${b.tasks.join(' ')}" data-q="${esc(hay)}">
    <div class="br-niche${nm ? '' : ' no-niche'}"${names ? ` role="img" aria-label="Витрина бренда ${esc(b.name)}: ${esc(names)}"` : ''}>
      ${nm ? `<img class="br-bg" src="${esc(C.u(P, nm.file))}" alt="" width="720" height="900" loading="lazy" decoding="async">` : ''}
      ${logo}${pk}
    </div>
    <div class="bb br-bb">
      ${b.country ? `<p class="br-cn">${esc(b.country)}</p>` : `<p class="br-cn">${esc(b.group)}</p>`}
      <h3 class="sr">${esc(b.name)}</h3>
      <p class="br-sp">${esc(b.tag)}</p>
      ${C.tasksLine(b.tasks, '', 2)}
      <div class="bl-foot"><span class="br-n">${n} ${word} в каталоге</span><a class="lnk stretch" href="${C.burl(P, b)}" data-track="brand_card_click" data-brand="${b.id}">О бренде ${I.arrow}</a></div>
    </div>
  </article>`;
  };
}

function brandsGallery(ctx, C, P) {
  const {brands, tasks, products, redesign} = ctx, bp = redesign.brandsPage, g = bp.gallery;
  const dev = new Set(bp.deviceIds), cos = brands.filter(b => !dev.has(b.id)), dv = brands.filter(b => dev.has(b.id));
  const usedTasks = new Set(); brands.forEach(b => b.tasks.forEach(t => usedTasks.add(t)));
  const card = nicheCardMaker(ctx, C, P);

  const star = '<svg class="br-st" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><radialGradient id="br-pg" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#cfd9f0"/><stop offset="1" stop-color="#8ea3d8"/></radialGradient></defs><circle cx="24" cy="26" r="19" fill="url(#br-pg)"/><ellipse cx="18" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><ellipse cx="30" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><path d="M20.8 31.6q3.2 3.3 6.4 0" fill="none" stroke="#0b1a33" stroke-width="1.6" stroke-linecap="round"/><path d="M37.6 2.6l1.7 4.4 4.4 1.7-4.4 1.7-1.7 4.4-1.7-4.4-4.4-1.7 4.4-1.7z" fill="#f6d58b" stroke="#e3b95c" stroke-width=".5" stroke-linejoin="round"/></svg>';
  const hero = g.hero || {};
  const wallTex = g.wallTextures || [];
  return `<div class="br-page" data-brands data-brands-gallery>
    <section class="br-hero" aria-labelledby="br-h1">
      <picture class="br-hero-pic" aria-hidden="true"><source media="(max-width: 860px)" srcset="${esc(C.u(P, hero.mobile))}"><img src="${esc(C.u(P, hero.src))}" alt="" width="${hero.w}" height="${hero.h}" fetchpriority="high" decoding="async"></picture>
      <div class="br-hero-in">
        <p class="br-eyebrow reveal">${esc(g.eyebrow)}</p>
        <h1 id="br-h1" class="reveal">${esc(g.title)}</h1>
        <p class="br-lead reveal">${esc(g.lead)}</p>
      </div>
    </section>
    <section class="br-wall" aria-label="Каталог брендов">
      <div class="br-wall-bg" aria-hidden="true" style="--n:${Math.max(1, wallTex.length - 1)}">${wallTex.map((t, i) => `<i data-bd="${t[0]}" data-bd-pos="${t[1]}" data-bd-o="${t[2]}" style="--i:${i}"></i>`).join('')}</div>
      <div class="br-in">
        <div class="br-bar toolbar reveal">
          <label class="search br-search"><span class="sr">Поиск по брендам</span>${I.search}<input id="br-q" type="search" placeholder="${esc(g.search)}" autocomplete="off"></label>
          <div class="chips br-chips" id="br-tasks" role="group" aria-label="Фильтр по задаче">${C.chip(esc(g.all), 'br-task', 'all', true)}${tasks.filter(t => usedTasks.has(t.id)).map(t => C.chip(esc(t.label), 'br-task', t.id, false)).join('')}</div>
          ${ctx.redesign.extras && ctx.redesign.extras.assistant ? `<button class="br-help" type="button" data-act="br-help">${star}<span><b>${esc(g.help)}</b><small>${esc(g.helpSub)}</small></span></button>` : ''}
        </div>
        <h2 class="sr">Список брендов</h2>
        <div class="br-grid" id="br-grid">
          <h2 class="br-group sr">${esc(bp.groups.cosmetic)}</h2>${cos.map(card).join('')}
          ${dv.length ? `<h2 class="br-group br-group-dev reveal">${esc(bp.groups.device)}</h2><p class="br-dev-note muted">${esc(bp.deviceNote)}</p>${dv.map(card).join('')}` : ''}
        </div>
        <div class="empty" id="br-empty" hidden><b>Бренды не найдены</b>Измените запрос или выберите другую задачу.</div>
      </div>
    </section>
  </div>`;
}

function brandPage(ctx, C, P, b) {
  const {brands, products, cats, tasks} = ctx;
  const i = brands.indexOf(b), n = brands.length, prev = brands[(i - 1 + n) % n], next = brands[(i + 1) % n];
  const prods = products.filter(p => p.brand === b.id);
  const groups = cats.map(c => [c, prods.filter(p => p.cat === c.id)]).filter(x => x[1].length);
  const facts = [...(b.country ? [['Страна', b.country + (b.countryNote ? ` (${b.countryNote})` : '')]] : [['Страна', 'Уточняется']]), ...b.facts.filter(f => f[0] !== 'Страна')];
  const events = ctx.sortedEvents.filter(e => e.brand === b.id);
  const icons = ['layers', 'shield', 'book', 'check'];
  const adv = [{icon: 'shield', title: 'Оригинальная продукция', text: `${b.name} поставляется официальным дистрибьютором «Астрея».`},
    ...b.facts.filter(f => !['Страна', 'Концерн', 'Поставка'].includes(f[0])).slice(0, 2).map((f, k) => ({icon: icons[k % icons.length], title: f[0], text: f[1]})),
    {icon: 'users', title: 'Поддержка специалистов', text: 'Консультации менеджеров и материалы учебного центра «Астрея».'}];
  return `<div class="wrap" style="${S.bstyle(b)}" data-brand-page="${b.id}">
    <section class="b-hero">
      ${C.crumbs(P, [['Главная', 'index.html'], ['Бренды', 'brands.html'], [b.name, `brands/${b.id}.html`]])}
      <div class="b-line reveal"><span class="eyebrow">${esc(b.group)}${b.country && b.country !== b.group ? ' · ' + esc(b.country) : ''}</span></div>
      <h1 class="b-title${b.logo ? ' b-title-logo' : ''} reveal">${b.logo ? C.heroLogo(P, b) : esc(b.name)}</h1>
      <p class="b-sub reveal">${esc(b.tag)}</p>
      <div class="row reveal" style="margin-top:34px">
        <a class="btn btn-fill" href="${C.u(P, 'catalog.html')}?brand=${b.id}" data-track="catalog_click" data-place="brand-hero">Смотреть ассортимент ${I.arrow}</a>
        ${partnerLink(C, P, 'brand-hero')}
      </div>
      <div class="b-cols">
        <div class="txt reveal">${b.long.map(p => `<p>${esc(p)}</p>`).join('')}<div class="tasks-line" style="margin-top:24px">${b.tasks.map(t => C.tag(ctx.taskById[t].label, 'blue')).join('')}</div></div>
        <div class="facts reveal">${facts.map(([k, v]) => `<div class="fact"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>
      </div>
    </section>

    <section class="sec" style="padding-top:clamp(30px,4vw,56px)">
      ${C.secHead('Преимущества', `Почему ${esc(b.name)}`)}
      ${C.advantageCards(adv, 'g4')}
    </section>

    ${groups.length ? `<section class="sec" style="padding-top:0">
      ${C.secHead('Продуктовые линейки', `Направления ${esc(b.name)}`)}
      <div class="grid g3">${groups.map(([c, list]) => `<a class="card hov linecard card-pad reveal" href="${C.u(P, 'catalog.html')}?brand=${b.id}&cat=${c.id}" data-track="catalog_click" data-place="brand-lines">
        <span class="tag blue">${list.length} ${S.plural(list.length, 'позиция', 'позиции', 'позиций')}</span><h3>${esc(c.name)}</h3>
        <p>${esc(list.slice(0, 3).map(p => p.name).join(' · '))}${list.length > 3 ? ' …' : ''}</p><span class="lnk">В каталоге ${I.arrow}</span></a>`).join('')}</div>
    </section>` : ''}

    <section class="sec" style="padding-top:0">
      ${C.secHead('Ассортимент', `Товары ${esc(b.name)}`, C.lnk(`${C.u(P, 'catalog.html')}?brand=${b.id}`, 'В каталоге'))}
      <div class="grid g3">${prods.map((p, k) => C.productCard(P, p, k)).join('')}</div>
    </section>

    ${ctx.redesign ? brandTasks(ctx, C, P, b) : ''}

    ${events.length ? `<section class="sec" style="padding-top:0">
      ${C.secHead('Обучение', `Мероприятия по ${esc(b.name)}`, C.lnk(C.u(P, 'training.html'), 'Всё расписание'))}
      <div class="grid g3 events-grid">${events.slice(0, 3).map(e => C.eventCard(P, e)).join('')}</div>
    </section>` : ''}

    ${ctx.redesign ? brandMaterials(ctx, C, P, b) : ''}

    <section class="sec" style="padding-top:0">
      <div class="cta-band cta-brand reveal pushin">
        <div class="cb-copy">
          <span class="eyebrow">Сотрудничество</span>
          <h2>${esc(b.name)} для вашего кабинета</h2>
          <p>Расскажите о своей организации — подберём ассортимент, условия поставки и обучение.</p>
          <div class="row"><a class="btn btn-light" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="brand-cta">Стать партнёром ${I.arrow}</a>
            <button class="btn btn-ghost-inv" type="button" data-act="form" data-type="question" data-ref="Бренд ${esc(b.name)}: запрос условий">Запросить условия</button></div>
        </div>
        ${C.ctaLogo}
      </div>
      <nav class="sib" aria-label="Соседние бренды">
        <a class="reveal" href="${C.burl(P, prev)}" style="${S.bstyle(prev)}"><small>${I.back} Предыдущий</small>${C.sibLogo(P, prev)}</a>
        <a class="nx reveal" href="${C.burl(P, next)}" style="${S.bstyle(next)}"><small>Следующий ${I.arrow}</small>${C.sibLogo(P, next)}</a>
      </nav>
    </section>
  </div>`;
}

/* «Решения по задачам» бренда: только задачи, связанные с брендом в data/catalog.json */
function brandTasks(ctx, C, P, b) {
  if (!b.tasks.length) return '';
  return `<section class="sec rd-b-tasks" style="padding-top:0">
      ${C.secHead('Решения по задачам', `С чем работает ${esc(b.name)}`)}
      <div class="rd-b-tasklist">${b.tasks.map((id, i) => { const t = ctx.taskById[id], n = ctx.products.filter(p => p.brand === b.id && p.tasks.includes(id)).length;
        return `<a class="rd-b-task reveal" href="${C.u(P, 'catalog.html')}?brand=${b.id}&task=${id}" data-track="catalog_click" data-place="brand-tasks"><span class="rd-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><h3>${esc(t.label)}</h3><span class="rd-b-count">${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')} ${I.arrow}</span></a>`; }).join('')}</div>
    </section>`;
}

/* «Материалы»: статьи учебного центра, привязанные к бренду (data/training.json → articles); если их нет — блок не показывается */
function brandMaterials(ctx, C, P, b) {
  const list = ctx.training.articles.filter(a => a.brand === b.id);
  if (!list.length) return '';
  return `<section class="sec" style="padding-top:0">
      ${C.secHead('Материалы', `Статьи по ${esc(b.name)}`, C.lnk(C.u(P, 'training.html') + '#materials', 'Все материалы'))}
      <div class="grid g3">${list.slice(0, 3).map(C.articleCard).join('')}</div>
    </section>`;
}

function partnerLink(C, P, place) {
  return `<a class="btn btn-ghost" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="${place}">Стать партнёром</a>`;
}

module.exports = {brandsPage, brandPage, nicheCardMaker};
