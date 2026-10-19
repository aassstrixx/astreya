/* База знаний помощника — собирается из data/*.json, ничего «от себя» не добавляет.
   Попадает в js/kb.js (его подгружает браузер при первом открытии чата) и в системную инструкцию ИИ-режима на сервере (server/lib/assistant.js).
   Товары и мероприятия берутся из js/data.js, здесь — всё остальное: о компании, контакты, представительства, партнёрам, обучение (вопросы и ответы), новости, задачи ухода. */
'use strict';

const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/[\s,.;:—-]+\S*$/, '') + '…' : s; };

module.exports = function buildKb(ctx) {
  const {site, content, training} = ctx, c = site.contacts, co = content.company || {}, pt = content.partners || {};
  return {
    v: 2,
    company: {
      name: site.name, legal: site.legalName || site.name, tagline: site.tagline || '',
      about: (co.who || []).map(s => clip(s, 600)),
      directions: (co.directions || []).map(d => ({t: d.title, p: clip(d.text, 240)})),
      advantages: (content.advantages || []).map(d => ({t: d.title, p: clip(d.text, 240)})),
      professionals: (co.professionals && co.professionals.text || []).map(s => clip(s, 400)),
      requisites: site.requisites && site.requisites.note ? site.requisites.note : ''
    },
    contacts: {phone: c.phone, phoneRaw: c.phoneRaw, email: c.email, hours: c.hours, address: c.address, addressNote: c.addressNote || '', max: c.max || '', telegram: c.telegram || '', vk: c.vk || '', ext: c.ext || {}},
    offices: (site.offices || []).map(o => ({city: o.city, role: o.role, addr: o.addr, hours: o.hours || '', phones: o.phones || [], emails: o.emails || []})),
    discounts: {tiers: site.discounts || [], note: 'Ориентировочная программа скидок по объёму закупки; точные условия и пороги подтверждает менеджер.'},
    partner: {
      benefits: (pt.benefits || []).map(b => ({t: b.title, p: clip(b.text, 220)})), steps: (pt.steps || []).map(s => ({t: s.t, p: clip(s.p, 220)})),
      specs: pt.specializations || []
    },
    training: {
      cities: training.cities || [], steps: (training.steps || []).map(s => ({t: s.t, p: clip(s.p, 220)})),
      faq: (training.faq || []).map(f => ({q: f.q, a: clip(f.a, 420)}))
    },
    tasks: ctx.tasks.map(t => ({id: t.id, label: t.label, note: clip(t.note, 260), brands: t.brands})),
    brands: ctx.brands.map(b => ({id: b.id, name: b.name, group: b.group || '', country: b.country || '', tag: b.tag || '', desc: clip(b.desc, 300), tasks: b.tasks || [], url: `brands/${b.id}.html`})),
    news: ctx.news.map(n => ({t: n.title, d: clip(n.excerpt, 200), date: n.date, cat: (ctx.newsCatById[n.category] || {}).name || '', u: `news/${n.slug}.html`})),
    pages: [
      {t: 'Каталог', u: 'catalog.html', d: 'Все продукты: фильтры по бренду, категории, задаче и виду'},
      {t: 'Бренды', u: 'brands.html', d: 'Бренды в портфеле: ' + ctx.brands.map(b => b.name).join(', ')},
      {t: 'Обучение', u: 'training.html', d: 'Расписание семинаров, мастер-классов и вебинаров учебного центра'},
      {t: 'Новости', u: 'news.html', d: 'Новости, акции, новинки и анонсы'},
      {t: 'Стать партнёром', u: 'partners.html', d: 'Условия сотрудничества и калькулятор скидок'},
      {t: 'Компания', u: 'company.html', d: 'О компании и представительства'},
      {t: 'Контакты', u: 'contacts.html', d: 'Телефон, почта, адреса, форма вопроса'}
    ].concat(ctx.sales ? [{t: 'Старт со Стеллой', u: ctx.sales.planner.path, d: 'Несколько коротких вопросов → план: линейки и товары под задачи, ближайшие семинары, ориентир по скидкам; план можно отправить менеджеру'}] : []),
    stella: ctx.stella ? Object.assign({}, ctx.stella, {guide: undefined}) : undefined,               // библиотека живых реплик (data/stella/*.json): о помощнике, светская беседа, чего сайт не знает
    /* что помощник НЕ знает и не должен выдумывать */
    gaps: ['цены на продукцию', 'наличие на складе', 'сроки и стоимость доставки', 'состав и дозировки (если не указаны у товара)', 'сертификаты и регистрационные документы', 'персональные рекомендации по уходу и лечению']
  };
};
