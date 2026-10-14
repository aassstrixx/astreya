/* Продающий слой, главная: развилка «Учиться / Закупать» (extras.sales). Вёрстка статическая (без сдвигов макета при загрузке);
   js/sales-pages.js лишь обновляет в ней дату ближайшего семинара и предлагает вернуться к сохранённому плану.
   Все факты — из данных сайта: мероприятия (data/events.json), пороги скидок (data/site.json). Тексты — data/sales.json → pages.home.
   Оформление — «картотека»: две карточки с крупной цифрой (дата / процент), без кругов. */
const S = require('../../js/shared.js');
const {esc, I, rub, dparts} = S;

module.exports = function salesHome(ctx, C, P) {
  const sx = ctx.sales, h = sx.pages.home, today = new Date().toISOString().slice(0, 10);
  const ev = ctx.sortedEvents.find(e => e.date >= today) || null;
  const disc = ctx.site.discounts, top = Math.max.apply(null, disc.map(d => d.pct));
  const days = ev ? Math.round((Date.parse(ev.date) - Date.parse(today)) / 864e5) : 0;
  const when = n => n <= 0 ? h.learn.days['0'] : n === 1 ? h.learn.days['1'] : h.learn.days.n.replace('{days}', n + ' ' + S.plural(n, 'день', 'дня', 'дней'));
  const d = ev ? dparts(ev.date) : null, b = ev ? ctx.brandById[ev.brand] : null, month = d ? d.full.split(' ')[1] : '';
  const learn = `<article class="sx-door sx-door-learn reveal" data-door="learn"${ev ? ` style="${S.bstyle(b)}"` : ''}>
      <div class="sx-big" aria-hidden="true"><span class="sx-big-k" data-sx-when>${ev ? esc(when(days)) : ''}</span><b data-sx-d>${ev ? d.d : '—'}</b><small data-sx-m>${esc(month)}</small></div>
      <div class="sx-door-body">
        <span class="eyebrow">${esc(h.learn.eyebrow)}</span>
        <h3>${esc(h.learn.title)}</h3>
        <p class="sx-door-line" data-sx-line>${ev ? `<a href="${C.eurl(P, ev)}" data-sx-ev-title data-track="home_fork_event">${esc(ev.title)}</a>` : esc(h.learn.none)}</p>
        <p class="sx-door-meta" data-sx-meta>${ev ? `${esc(ev.fmt)} · ${esc(ev.city)}` : ''}</p>
        <div class="row">${ev ? `<button class="btn btn-fill" type="button" data-act="form" data-type="seminar" data-ref="${ev.id}" data-track="home_fork_register" data-sx="home-learn" data-sx-cta>${esc(h.learn.cta)} ${I.arrow}</button>` : `<button class="btn btn-fill" type="button" data-act="form" data-type="question" data-sx-cta>${esc(h.learn.noneCta)} ${I.arrow}</button>`}<a class="btn btn-lnk" href="${C.u(P, 'training.html')}" data-track="home_fork_all">${esc(h.learn.more)}</a></div>
        <p class="sx-door-note">${esc(h.learn.note)}</p>
      </div>
    </article>`;
  const buy = `<article class="sx-door sx-door-buy reveal" data-door="buy">
      <div class="sx-big" aria-hidden="true"><span class="sx-big-k">${esc(h.buy.pearl.split('{pct}')[0].trim())}</span><b>${top}%</b><small>${esc(h.buy.pearlSub)}</small></div>
      <div class="sx-door-body">
        <span class="eyebrow">${esc(h.buy.eyebrow)}</span>
        <h3>${esc(h.buy.title)}</h3>
        <p class="sx-door-line">${esc(h.buy.text)}</p>
        <ol class="sx-ladder" aria-label="Ориентировочные скидки по объёму закупки">${disc.map((x, i) => `<li style="--h:${Math.round(38 + 62 * (i + 1) / disc.length)}%"><b>${x.pct}%</b><span>от ${esc(rub(x.from))}</span></li>`).join('')}</ol>
        <div class="row"><a class="btn btn-fill" href="${C.u(P, sx.planner.path)}" data-track="home_fork_plan" data-sx="home-buy" data-sx-cta>${esc(h.buy.cta)} ${I.arrow}</a><a class="btn btn-lnk" href="${C.u(P, 'partners.html')}" data-track="home_fork_partners">${esc(h.buy.more)}</a></div>
        <p class="sx-door-note" data-sx-buy-note>${esc(h.buy.note)}</p>
      </div>
    </article>`;
  return `<section class="rd-sec sx-fork" aria-labelledby="sx-fork-h" data-sx-fork><div class="wrap">
    <header class="sx-fork-head reveal"><span class="eyebrow">${esc(h.eyebrow)}</span><h2 id="sx-fork-h">${esc(h.title)}</h2><p class="lead">${esc(h.lead)}</p></header>
    <div class="sx-doors">${learn}<div class="sx-or" aria-hidden="true"><span>или</span></div>${buy}</div>
  </div></section>`;
};
