const S = require('../../js/shared.js');
const {esc, I, rub} = S;

module.exports = function partners(ctx, C, P) {
  const {content, site} = ctx, pt = content.partners, c = site.contacts;
  const max = Math.max(...site.discounts.map(d => d.pct));
  return `<div class="wrap">
    ${C.pageHead(pt.eyebrow, esc(pt.h1), esc(pt.lead))}
    <div class="row reveal"><a class="btn btn-fill" href="#form" data-act="scroll" data-target="form">Оставить заявку ${I.arrow}</a><a class="btn btn-ghost" href="tel:${c.phoneRaw}" data-track="phone_click">${I.phone} ${esc(c.phone)}</a></div>
  </div>

  <section class="sec"><div class="wrap">
    ${C.secHead('Преимущества', 'Что вы получаете как партнёр')}
    ${C.advantageCards(pt.benefits)}
  </div></section>

  <section class="sec tint"><div class="wrap">
    ${C.secHead('Как это работает', 'Четыре шага до сотрудничества')}
    <div class="steps">${pt.steps.map((s, i) => `<div class="step reveal"><i>${i + 1}</i><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p></div>`).join('')}</div>
  </div></section>

  <section class="sec" id="calc"><div class="wrap">
    <div class="promo reveal pushin">
      <div>
        <span class="eyebrow">Партнёрская программа</span>
        <h2>Скидки по объёму закупки</h2>
        <p>Чем крупнее закупка, тем выгоднее условия. Передвиньте ползунок и посмотрите, какая скидка вам доступна — до ${max}%.</p>
        <p class="fine">Расчёт ориентировочный (пример). Точные условия и пороги скидок подтверждает менеджер.</p>
      </div>
      <div class="calc" data-calc>
        <div class="sum"><small>Сумма закупки</small><span id="calc-sum">${rub(100000)}</span></div>
        <input type="range" id="calc-range" min="0" max="500000" step="10000" value="100000" aria-label="Сумма закупки">
        <div class="tiers">${site.discounts.map((d, i) => `<div class="tier" data-tier="${i}"><b>${d.pct}%</b><span>от ${rub(d.from)}</span></div>`).join('')}</div>
        <div class="save"><span id="calc-tier"></span><b id="calc-save"></b></div>
      </div>
    </div>
  </div></section>

  <section class="sec" id="form" style="padding-top:0"><div class="wrap">
    <div class="form-card card reveal">
      <div class="fc-copy">
        <span class="eyebrow in">Заявка</span>
        <h2>Оставьте заявку на сотрудничество</h2>
        <p class="muted">Заполните форму — менеджер свяжется с вами в рабочее время (${esc(c.hours.toLowerCase())}) и обсудит ассортимент, условия и обучение.</p>
        <ul class="contact-mini">
          <li>${I.phone}<a href="tel:${c.phoneRaw}" data-track="phone_click">${esc(c.phone)}</a></li>
          <li>${I.mail}<a href="mailto:${c.email}" data-track="email_click">${esc(c.email)}</a></li>
          <li>${I.clock}<span>${esc(c.hours)}</span></li>
        </ul>
      </div>
      <div class="fc-form">${S.formHTML('partner', {root: P.root, uid: 'pt'})}</div>
    </div>
  </div></section>`;
};
