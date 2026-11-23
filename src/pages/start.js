/* «Старт со Стеллой» (extras.sales): страница-каркас. Сам подбор рисует js/sales.js в #plan-app (даты мероприятий считаются в браузере — статичная сборка быстро устарела бы).
   Оформление — «консьерж-салон»: рендер зала (круглая стойка, арочные ниши с упаковками, солнце через переплёт окна; tools/showroom-assets/utility/salon.py), поверх — «лист бумаги» с диалогом Стеллы; план — «папка-досье» под ним.
   Стили — css/pg-start.css, поведение сцены (шапка, световой шар, клавиши, печать плана) — js/pg-start.js. #plan-app получает display:contents: диалог и план становятся ячейками сетки страницы. */
const S = require('../../js/shared.js');
const {T} = require('../texts.js');
const {esc, I} = S;

module.exports = function start(ctx, C, P) {
  const sx = ctx.sales, pl = sx.planner, c = ctx.site.contacts, u = h => C.u(P, h);
  const img = (f, w, h, cls, extra) => `<img class="${cls}" src="${esc(u(f))}" width="${w}" height="${h}" alt="" decoding="async"${extra || ''}>`;
  const pledge = [
    [T('start.intro.s'), T('start.intro.s2')],
    [T('start.intro.s3'), T('start.intro.s4')],
    [T('start.intro.s5'), T('start.intro.s6')]
  ];
  return `<div class="st-page" data-start-page>
    <section class="st-scene" aria-labelledby="st-h">
      <div class="st-bg" aria-hidden="true">
        <picture>${img('assets/house/room-editorial.webp', 1920, 1080, 'st-bg-img', ' fetchpriority="high"')}</picture>
        <i class="st-wash"></i><i class="st-sun"></i>
        <i class="st-fade"></i>
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
            <h2>${T('start.nojs.h2')}</h2>
            <p>${T('start.nojs.p')}</p>
            <div class="row"><a class="btn btn-fill" href="${u('catalog.html')}">${T('start.nojs.a')} ${I.arrow}</a><a class="btn btn-ghost" href="${u('training.html')}">${T('start.nojs.a2')}</a><a class="btn btn-ghost" href="${u('partners.html')}">${T('start.nojs.a3')}</a><a class="btn btn-ghost" href="tel:${c.phoneRaw}">${I.phone} ${esc(c.phone)}</a></div>
          </div></noscript>
        </div>
      </div>
    </section>
  </div>`;
};
