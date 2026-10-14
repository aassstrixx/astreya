/* «Старт со Стеллой» (extras.sales): страница-каркас. Сам подбор рисует js/sales.js (даты мероприятий считаются в браузере — статичная сборка быстро устарела бы). */
const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function start(ctx, C, P) {
  const sx = ctx.sales, pl = sx.planner, c = ctx.site.contacts, u = h => C.u(P, h);
  return `<div class="wrap">
    ${C.pageHead(esc(pl.eyebrow), esc(pl.title), esc(pl.lead))}
    <div class="plan" id="plan-app" data-plan-app>
      <noscript><div class="plan-ns card card-pad">
        <h2>Подбор работает с включённым JavaScript</h2>
        <p class="muted">Без него можно сразу перейти к нужному разделу или связаться с менеджером.</p>
        <div class="row"><a class="btn btn-fill" href="${u('catalog.html')}">Каталог ${I.arrow}</a><a class="btn btn-ghost" href="${u('training.html')}">Обучение</a><a class="btn btn-ghost" href="${u('partners.html')}">Стать партнёром</a><a class="btn btn-ghost" href="tel:${c.phoneRaw}">${I.phone} ${esc(c.phone)}</a></div>
      </div></noscript>
    </div>
  </div>`;
};
