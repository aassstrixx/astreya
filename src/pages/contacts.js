const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function contacts(ctx, C, P) {
  const {site} = ctx, c = site.contacts, rq = site.requisites;
  const q = encodeURIComponent(c.address);
  const tbd = '<span class="tbd">Уточняется</span>';
  const cards = [
    {ic: I.phone, t: 'Телефон', v: `<a href="tel:${c.phoneRaw}" data-track="phone_click">${esc(c.phone)}</a>`, s: esc(c.hours)},
    {ic: I.mail, t: 'Email', v: `<a href="mailto:${c.email}" data-track="email_click">${esc(c.email)}</a>`, s: 'Ответим в рабочее время'},
    {ic: I.chat, t: 'WhatsApp', v: `<a href="${c.whatsapp}" target="_blank" rel="noopener" data-track="messenger_click">Написать в WhatsApp</a>`, s: 'Тот же номер, что и телефон'},
    {ic: I.pin, t: 'Центральный офис', v: esc(c.address), s: esc(c.addressNote)}
  ];
  return `<div class="wrap">
    ${C.pageHead('Контакты', 'Свяжитесь с Астреей', 'Центральный офис в Москве и представительства в регионах. Позвоните, напишите или оставьте заявку — ответим в рабочее время.')}
    <h2 class="sr">Способы связи</h2>
    <div class="grid g4 contact-cards">${cards.map(k => `<article class="card card-pad ccard reveal"><span class="adv-ic">${k.ic}</span><h3>${k.t}</h3><p class="cv">${k.v}</p><p class="muted small">${k.s}</p></article>`).join('')}</div>

    <section class="sec">
      <div class="map-row">
        <div class="map-card card reveal" role="img" aria-label="Место под карту: ${esc(c.address)}">
          <div class="map-grid" aria-hidden="true"><i class="map-pin"></i></div>
          <div class="map-cap"><b>${esc(c.address)}</b><span>${esc(c.addressNote)}</span>
            <div class="row"><a class="btn btn-fill btn-sm" href="https://yandex.ru/maps/?text=${q}" target="_blank" rel="noopener">Яндекс Карты ${I.external}</a>
              <a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Google Maps ${I.external}</a></div></div>
        </div>
        <div class="form-card stack card reveal" id="support">
          <div><span class="eyebrow in">Обратная связь</span><h2 style="font-size:var(--fs-h2-sm)">Написать нам</h2>
            <p class="muted">Вопрос по продукции, обучению или сотрудничеству — ответим по почте или телефону.</p></div>
          ${S.formHTML('contact', {root: P.root, uid: 'ct'})}
        </div>
      </div>
    </section>

    <section class="sec" style="padding-top:0">
      ${C.secHead('Представительства', 'Контакты по городам')}
      <div class="cities">${site.offices.map(C.officeCard).join('')}</div>
    </section>

    <section class="sec" style="padding-top:0">
      ${C.secHead('Реквизиты', 'Информация о компании')}
      <dl class="facts-dl reqs card card-pad reveal">
        <div><dt>Наименование</dt><dd>${esc(rq.legalName)}</dd></div>
        <div><dt>ИНН</dt><dd>${rq.inn ? esc(rq.inn) : tbd}</dd></div>
        <div><dt>КПП</dt><dd>${rq.kpp ? esc(rq.kpp) : tbd}</dd></div>
        <div><dt>ОГРН</dt><dd>${rq.ogrn ? esc(rq.ogrn) : tbd}</dd></div>
        <div><dt>Юридический адрес</dt><dd>${rq.legalAddress ? esc(rq.legalAddress) : tbd}</dd></div>
        <div><dt>Фактический адрес</dt><dd>${esc(c.address)}</dd></div>
      </dl>
      <p class="muted small" style="margin-top:12px">${esc(rq.note)}</p>
    </section>
  </div>`;
};
