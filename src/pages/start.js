/* «Старт со Стеллой» (extras.sales): страница-каркас. Сам подбор рисует js/sales.js в #plan-app (даты мероприятий считаются в браузере — статичная сборка быстро устарела бы).
   Оформление — «консьерж-салон»: рендер зала (круглая стойка, арочные ниши с упаковками, солнце через переплёт окна; tools/showroom-assets/utility/salon.py), поверх — «лист бумаги» с диалогом Стеллы; план — «папка-досье» под ним.
   Стили — css/pg-start.css, поведение сцены (шапка, световой шар, клавиши, печать плана) — js/pg-start.js. #plan-app получает display:contents: диалог и план становятся ячейками сетки страницы. */
const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function start(ctx, C, P) {
  const sx = ctx.sales, pl = sx.planner, c = ctx.site.contacts, u = h => C.u(P, h);
  const img = (f, w, h, cls, extra) => `<img class="${cls}" src="${esc(u(f))}" width="${w}" height="${h}" alt="" decoding="async"${extra || ''}>`;
  const pledge = [
    ['Несколько коротких вопросов', 'кнопками или своими словами'],
    ['Ничего не отправляется', 'пока вы сами не решите'],
    ['План остаётся на вкладке', 'его можно скопировать или распечатать']
  ];
  return `<div class="st-page" data-start-page>
    <section class="st-scene" aria-labelledby="st-h">
      <div class="st-bg" aria-hidden="true">
        <picture><source media="(max-width:700px)" srcset="${esc(u('assets/utility/salon-wide-m.webp'))}">${img('assets/utility/salon-wide.webp', 2880, 1620, 'st-bg-img', ' fetchpriority="high"')}</picture>
        <i class="st-wash"></i><i class="st-sun"></i><i class="st-fade"></i>
      </div>
      <div class="st-in">
        <header class="st-head">
          <span class="st-eyebrow">${esc(pl.eyebrow)}</span>
          <h1 id="st-h">${esc(pl.title)}</h1>
          <p class="st-lead">${esc(pl.lead)}</p>
          <ul class="st-pledge">${pledge.map(([b, s]) => `<li><b>${esc(b)}</b><span>${esc(s)}</span></li>`).join('')}</ul>
        </header>
        <div class="st-orb" data-st-orb aria-hidden="true"></div>
        <div class="plan" id="plan-app" data-plan-app>
          <noscript><div class="plan-ns st-ns">
            <h2>Подбор работает с включённым JavaScript</h2>
            <p>Без него можно сразу перейти к нужному разделу или связаться с менеджером.</p>
            <div class="row"><a class="btn btn-fill" href="${u('catalog.html')}">Каталог ${I.arrow}</a><a class="btn btn-ghost" href="${u('training.html')}">Обучение</a><a class="btn btn-ghost" href="${u('partners.html')}">Стать партнёром</a><a class="btn btn-ghost" href="tel:${c.phoneRaw}">${I.phone} ${esc(c.phone)}</a></div>
          </div></noscript>
        </div>
      </div>
    </section>
  </div>`;
};
