const fs = require('fs');
const path = require('path');
const S = require('../../js/shared.js');
const {esc, I, bstyle} = S;
const heroMark = fs.readFileSync(path.join(__dirname, '..', 'partials', 'hero-mark.html'), 'utf8').trim();

module.exports = function home(ctx, C, P) {
  const {content, brands, tasks, site} = ctx, h = content.home;
  const today = new Date().toISOString().slice(0, 10);
  const up = ctx.sortedEvents.filter(e => e.date >= today);
  const events = (up.length ? up : ctx.sortedEvents.slice(-4)).slice(0, 4);
  /* рекомендуемые продукты: по одному на бренд, пока не наберётся четыре */
  const seen = new Set(), featured = [];
  ctx.products.filter(p => p.featured).forEach(p => { if (featured.length < 4 && !seen.has(p.brand)) { seen.add(p.brand); featured.push(p); } });
  const val = s => s.value === 'auto:brands' ? ctx.stats.brands : s.value === 'auto:products' ? ctx.stats.products : s.value === 'auto:offices' ? ctx.stats.offices : s.value;

  const pickOut = t => {
    const prods = ctx.products.filter(p => p.tasks.includes(t.id)).slice(0, 6);
    return `<div class="pick-out" data-pick="${t.id}"${t.id === tasks[0].id ? '' : ' hidden'}>
      <div>
        <span class="eyebrow in">Задача</span>
        <h3>${esc(t.label)}</h3>
        <p class="muted">${esc(t.note)}</p>
        <div class="mini-brands">${t.brands.map(id => ctx.brandById[id]).map(b => `<a class="mb" href="${C.burl(P, b)}" style="${bstyle(b)}"><i></i><div><b>${esc(b.name)}</b><span>${esc(b.tag)}</span></div>${I.arrow}</a>`).join('')}</div>
      </div>
      <div>
        <span class="eyebrow in">Что подойдёт</span>
        <div class="mini-prods" style="margin-top:18px">${prods.map(p => { const b = ctx.brandById[p.brand]; return `<a class="mini-p" href="${C.purl(P, p)}">${C.art(P, p)}<div class="t"><small>${esc(b.name)}</small>${esc(p.name)}</div></a>`; }).join('')}</div>
        <div class="row" style="margin-top:22px"><a class="btn btn-ghost btn-sm" href="${C.u(P, 'catalog.html')}?task=${t.id}" data-track="catalog_click">Открыть в каталоге ${I.arrow}</a></div>
        <p class="muted" style="margin-top:16px;font-size:12.5px">Подбор ориентировочный: протокол определяет специалист по результатам консультации.</p>
      </div>
    </div>`;
  };

  return `
  <section class="hero"><div class="wrap hero-grid">
    <div class="hero-copy" data-fade>
      <span class="eyebrow reveal">${esc(h.eyebrow)}</span>
      <h1>${h.h1}</h1>
      <p class="lead reveal">${esc(h.lead)}</p>
      <div class="row reveal">
        <a class="btn btn-fill" href="${C.u(P, 'catalog.html')}" data-track="catalog_click" data-place="hero">Перейти в каталог ${I.arrow}</a>
        <a class="btn btn-ghost" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="hero">Стать партнёром</a>
      </div>
      <div class="hero-facts reveal">${h.facts.map(f => `<span>${esc(f)}</span>`).join('')}<span>${ctx.stats.offices} города присутствия</span></div>
    </div>
    <div class="pearl-wrap reveal par" data-par="0.1">
      ${heroMark}
      <div class="ly" style="--z:.5"><div class="halo"></div></div>
      <div class="ly" style="--z:1"><div class="ring r1"><i class="od"></i></div></div>
      <div class="ly" style="--z:1.7"><div class="ring r2"><i class="od"></i></div></div>
      <div class="ly" style="--z:2.8"><div class="pearl" role="img" aria-label="Жемчужина — символ бережной точности"></div></div>
      <div class="ly" style="--z:4.2"><div class="hero-chip">${esc(h.chip)}</div></div>
      <div class="ly" style="--z:3.4"><div class="hero-card"><b>${esc(h.card.title)}</b><hr class="dash"><p>${esc(h.card.text)}</p></div></div>
    </div>
  </div></section>

  <section class="marquee reveal" aria-label="Бренды портфеля">
    <div class="mq-track">${[0, 1].map(k => `<ul class="mq-set"${k ? ' aria-hidden="true"' : ''}>${brands.map(b => `<li><a href="${C.burl(P, b)}"${k ? ' tabindex="-1"' : ''}>${esc(b.name)}</a><i></i></li>`).join('')}</ul>`).join('')}</div>
  </section>

  <section class="sec" id="about"><div class="wrap about-home">
    <div class="ah-copy">
      <span class="eyebrow">${esc(h.about.eyebrow)}</span>
      <h2>${esc(h.about.title)}</h2>
      ${h.about.text.map(t => `<p class="reveal">${esc(t)}</p>`).join('')}
      <ul class="ticks reveal">${h.about.points.map(t => `<li>${I.check}<span>${esc(t)}</span></li>`).join('')}</ul>
      <div class="row reveal" style="margin-top:30px"><a class="btn btn-ghost" href="${C.u(P, 'company.html')}">О компании ${I.arrow}</a></div>
    </div>
    <aside class="ah-visual reveal pushin" aria-hidden="true">
      <svg class="lgo ah-logo" viewBox="46 338 836 436"><use href="#logo-art"/></svg>
      <p>${esc(site.tagline)}</p>
    </aside>
  </div></section>

  <section class="stats" aria-label="Астрея в цифрах"><div class="wrap stats-grid">
    ${h.stats.map(s => `<div class="stat reveal"><b data-count="${val(s)}"${s.suffix ? ` data-suffix="${esc(s.suffix)}"` : ''}>${val(s)}</b><span>${esc(s.label)}</span>${s.note ? `<i class="snote">${esc(s.note)}</i>` : ''}</div>`).join('')}
  </div></section>

  <section class="sec"><div class="wrap">
    ${C.secHead('Преимущества', 'Почему специалисты выбирают Астрею')}
    ${C.advantageCards(content.advantages)}
  </div></section>

  <section class="sec tint"><div class="wrap">
    ${C.secHead('Бренды', `${brands.length} ${S.plural(brands.length, 'бренд', 'бренда', 'брендов')} — один подход`, C.lnk(C.u(P, 'brands.html'), 'Все бренды'))}
    <div class="bgrid" id="bgrid">${brands.map((b, i) => C.brandCardHome(P, b, i)).join('')}</div>
    <p class="muted" style="margin-top:14px;font-size:13px;text-align:center">Нажмите на карточку — раскроем описание бренда. Повторное нажатие сбрасывает выбор.</p>
  </div></section>

  <section class="sec"><div class="wrap">
    ${C.secHead('Подбор по задаче', 'С чем вы работаете сегодня?', '<p class="lead">Выберите задачу клиента — покажем подходящие бренды и товары.</p>')}
    <div class="picker reveal pushin" id="picker">
      <div class="chips" role="group" aria-label="Задача клиента">${tasks.map((t, i) => C.chip(esc(t.label), 'pick', t.id, i === 0)).join('')}</div>
      <div id="pick-out" aria-live="polite">${tasks.map(pickOut).join('')}</div>
    </div>
  </div></section>

  <section class="sec tint"><div class="wrap">
    ${C.secHead('Каталог', 'Рекомендуемые продукты', C.lnk(C.u(P, 'catalog.html'), 'Весь каталог', 'data-track="catalog_click"'))}
    <div class="grid g4">${featured.map((p, i) => C.productCard(P, p, i)).join('')}</div>
  </div></section>

  <section class="sec"><div class="wrap">
    ${C.secHead('Учебный центр', 'Ближайшие семинары', C.lnk(C.u(P, 'training.html'), 'Всё расписание'))}
    <div class="grid g3 events-grid" id="home-events">${events.slice(0, 3).map(e => C.eventCard(P, e)).join('')}</div>
    <p class="muted train-note">Базовые семинары и мастер-классы бесплатные и проходят с 10:30 до 18:00: теория чередуется с практикой.</p>
  </div></section>

  <section class="sec tint"><div class="wrap">
    ${C.secHead('Новости и акции', 'Что нового', C.lnk(C.u(P, 'news.html'), 'Все новости'))}
    <div class="grid g3">${ctx.news.slice(0, 3).map(n => C.newsCard(P, n)).join('')}</div>
  </div></section>

  ${C.ctaBand(P, 'home-cta')}`;
};
