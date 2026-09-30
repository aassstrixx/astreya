/* Astreya — общий модуль (UMD): работает и в Node (генератор страниц), и в браузере.
   Здесь только чистые функции и шаблоны, которым не нужен DOM: экранирование, иконки, даты, поиск, шаблон форм. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Astreya = root.Astreya || {}; Object.assign(root.Astreya, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  /* ---------- иконки: один стиль (обводка 1.6, 20×20) ---------- */
  const ic = d => `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${d}</svg>`;
  const I = {
    arrow:   ic('<path d="M3.5 10h13M11.5 5l5 5-5 5"/>'),
    back:    ic('<path d="M16.5 10h-13M8.5 5l-5 5 5 5"/>'),
    search:  ic('<circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8"/>'),
    phone:   ic('<path d="M5 3h3l1.4 3.6-1.8 1.2a9 9 0 0 0 4.6 4.6l1.2-1.8L17 12v3a2 2 0 0 1-2 2A12 12 0 0 1 3 5a2 2 0 0 1 2-2Z"/>'),
    mail:    ic('<rect x="3" y="4.5" width="14" height="11" rx="2"/><path d="m3.5 6 6.5 5 6.5-5"/>'),
    pin:     ic('<path d="M10 17.5s5.5-4.7 5.5-9a5.5 5.5 0 0 0-11 0c0 4.3 5.5 9 5.5 9Z"/><circle cx="10" cy="8.5" r="2"/>'),
    clock:   ic('<circle cx="10" cy="10" r="7"/><path d="M10 6v4.2l2.8 1.6"/>'),
    user:    ic('<circle cx="10" cy="7" r="3.2"/><path d="M3.8 16.5c.8-3 3.2-4.5 6.2-4.5s5.4 1.5 6.2 4.5"/>'),
    play:    ic('<path d="M5 3.5v13l11-6.5z"/>'),
    check:   ic('<path d="m4.5 10.5 3.5 3.5 7.5-8"/>'),
    close:   ic('<path d="m5 5 10 10M15 5 5 15"/>'),
    info:    ic('<circle cx="10" cy="10" r="7.5"/><path d="M10 9v4.5M10 6.6v.1"/>'),
    alert:   ic('<path d="M10 3.2 17.5 16.5h-15L10 3.2Z"/><path d="M10 8.2v3.6M10 14.2v.1"/>'),
    shield:  ic('<path d="M10 2.5 16 5v4.5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V5l6-2.5Z"/><path d="m7.2 10 2 2 3.6-4"/>'),
    book:    ic('<path d="M3.5 4.5c2.5-.8 4.8-.6 6.5.8 1.7-1.4 4-1.6 6.5-.8v10.5c-2.5-.8-4.8-.6-6.5.8-1.7-1.4-4-1.6-6.5-.8Z"/><path d="M10 5.3v10.5"/>'),
    layers:  ic('<path d="m10 3 7 3.6-7 3.6-7-3.6L10 3Z"/><path d="m3 10 7 3.6 7-3.6M3 13.4 10 17l7-3.6"/>'),
    globe:   ic('<circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.7-3-7.5s1-5.3 3-7.5Z"/>'),
    users:   ic('<circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16c.6-2.7 2.5-4 5-4s4.4 1.3 5 4"/><circle cx="14" cy="7.6" r="2.2"/><path d="M14.5 12.2c1.7.2 2.6 1.3 3 3.4"/>'),
    percent: ic('<path d="M15.5 4.5 4.5 15.5"/><circle cx="6.3" cy="6.3" r="1.9"/><circle cx="13.7" cy="13.7" r="1.9"/>'),
    device:  ic('<rect x="7" y="2.5" width="6" height="15" rx="3"/><path d="M10 6v3"/>'),
    calendar:ic('<rect x="3.5" y="4.5" width="13" height="12" rx="2"/><path d="M3.5 8.5h13M7 3v3M13 3v3"/>'),
    filter:  ic('<path d="M3 5h14M6 10h8M8.5 15h3"/>'),
    doc:     ic('<path d="M5.5 2.5h6l3.5 3.5v11.5H5.5z"/><path d="M11.5 2.5V6H15M8 10h4M8 13h4"/>'),
    chevron: ic('<path d="m5 8 5 5 5-5"/>'),
    external:ic('<path d="M8 4.5H5A1.5 1.5 0 0 0 3.5 6v9A1.5 1.5 0 0 0 5 16.5h9a1.5 1.5 0 0 0 1.5-1.5v-3M11.5 3.5h5v5M16.5 3.5l-7 7"/>'),
    chat:    ic('<path d="M10 2.8a7.2 7.2 0 0 0-6.2 10.8L3 17.2l3.7-.9A7.2 7.2 0 1 0 10 2.8Z"/><path d="M7.4 7.2c.2 2.2 2.4 4.4 4.6 4.6l1-1-1.7-1-.7.6c-.7-.3-1.4-1-1.7-1.7l.6-.7-1-1.7Z"/>'),
    box:     ic('<path d="M3.5 6.5 10 3l6.5 3.5v7L10 17l-6.5-3.5v-7Z"/><path d="m3.5 6.5 6.5 3.5 6.5-3.5M10 10v7"/>')
  };

  /* ---------- даты ---------- */
  const MON_S = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const dparts = iso => { const [y, m, d] = iso.split('-').map(Number); return {d, m: MON_S[m - 1], full: `${d} ${MON_G[m - 1]} ${y}`, y}; };
  const rub = n => Number(n).toLocaleString('ru-RU') + ' ₽';
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; };

  /* ---------- поиск: нормализация и простое «стеммирование» (без словарей) ---------- */
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[®™©]/g, '');
  const stem = w => { let x = w; if (x.length > 5) x = x.replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ей|ом|ем|ам|ям|ой|ый|ий|ая|яя|ое|ее|ые|ие|ую|юю)$/, ''); if (x.length > 4) x = x.replace(/[аяуюыиеёоьй]$/, ''); return x; };
  const tokens = s => norm(s).split(/[^a-zа-я0-9]+/).filter(Boolean).map(stem);

  /* ---------- стили бренда (переменные CSS) ---------- */
  const bstyle = b => `--c1:${b.c1};--c2:${b.c2};--ink:${b.ink};--cc:${b.c1};--cs:color-mix(in srgb,${b.c1} 58%,transparent)`;

  /* ---------- шаблон формы (модальное окно и встроенные формы на страницах) ---------- */
  const SPECS = ['Косметолог / эстетист', 'Салон красоты', 'Клиника / центр эстетической медицины', 'Магазин / дистрибьютор', 'Другое'];
  const FIELDS = {
    name:  {label: 'Имя', type: 'text', ac: 'name', err: 'Укажите имя'},
    phone: {label: 'Телефон', type: 'tel', ac: 'tel', ph: '+7', err: 'Проверьте номер телефона'},
    email: {label: 'Email', type: 'email', ac: 'email', err: 'Проверьте адрес почты'},
    city:  {label: 'Город', type: 'text', ac: 'address-level2', err: 'Укажите город'},
    org:   {label: 'Название организации', type: 'text', ac: 'organization'},
    spec:  {label: 'Специализация', type: 'select'},
    msg:   {label: 'Комментарий', type: 'textarea', err: 'Напишите сообщение'}
  };
  /* fields: [id, обязательное?] — порядок = порядок на странице */
  const FORM_TYPES = {
    partner:  {title: 'Стать партнёром', subject: 'Заявка на партнёрство', lead: 'Расскажите о своей организации — свяжемся и обсудим условия сотрудничества.', submit: 'Отправить заявку', ph: 'Интересующие бренды, объёмы, вопросы…',
               fields: [['name', 1], ['phone', 1], ['email', 1], ['city', 1], ['org'], ['spec'], ['msg']]},
    seminar:  {title: 'Запись на мероприятие', subject: 'Регистрация на мероприятие', lead: 'Оставьте контакты — менеджер учебного центра подтвердит участие и вышлет детали.', submit: 'Записаться', ph: 'Количество участников, вопросы организаторам…',
               fields: [['name', 1], ['phone', 1], ['email', 1], ['city', 1], ['msg']]},
    product:  {title: 'Запросить информацию', subject: 'Запрос по товару', lead: 'Пришлём информацию о продукте, наличии и условиях поставки.', submit: 'Отправить запрос', ph: 'Что именно вас интересует?',
               fields: [['name', 1], ['phone', 1], ['email', 1], ['city', 1], ['org'], ['msg']]},
    question: {title: 'Задать вопрос', subject: 'Вопрос с сайта', lead: 'Напишите нам — ответим по почте или телефону в рабочее время.', submit: 'Отправить', ph: 'Ваш вопрос…',
               fields: [['name', 1], ['email', 1], ['phone'], ['msg', 1]]}
  };
  FORM_TYPES.contact = Object.assign({}, FORM_TYPES.question);

  function fieldHTML(uid, id, req, ft) {
    const f = FIELDS[id], fid = `${uid}-${id}`, r = req ? ' required aria-required="true"' : '', star = req ? ' <span class="req" aria-hidden="true">*</span>' : '';
    let ctl;
    if (f.type === 'textarea') ctl = `<textarea id="${fid}" name="${id}"${r} placeholder="${esc(ft.ph || '')}" rows="4"></textarea>`;
    else if (f.type === 'select') ctl = `<div class="sel"><select id="${fid}" name="${id}"><option value="">Выберите…</option>${SPECS.map(s => `<option>${esc(s)}</option>`).join('')}</select>${I.chevron}</div>`;
    else ctl = `<input id="${fid}" name="${id}" type="${f.type}" autocomplete="${f.ac}"${f.ph ? ` placeholder="${f.ph}"` : ''}${f.type === 'tel' ? ' inputmode="tel"' : ''}${r}>`;
    return `<div class="fld" data-f="${id}"><label for="${fid}">${f.label}${star}</label>${ctl}${f.err ? `<span class="err" id="${fid}-err">${f.err}</span>` : ''}</div>`;
  }
  /* opts: {root:'../', uid:'lf1', ref:'ctx text', track:'partner_form'} */
  function formHTML(type, opts) {
    opts = opts || {};
    const ft = FORM_TYPES[type] || FORM_TYPES.question, uid = opts.uid || 'lf-' + type, root = opts.root || '';
    const rows = []; let pend = null;
    ft.fields.forEach(([id, req]) => {
      const html = fieldHTML(uid, id, req, ft), wide = id === 'msg';
      if (wide) { if (pend) { rows.push(pend); pend = null; } rows.push(html); return; }
      if (pend) { rows.push(`<div class="two">${pend}${html}</div>`); pend = null; } else pend = html;
    });
    if (pend) rows.push(pend);
    return `<form class="lead-form" data-form="${type}" data-ref="${esc(opts.ref || '')}" novalidate>
      ${rows.join('\n      ')}
      <input class="hp" type="text" name="company_site" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="agree"><input type="checkbox" name="agree" required><span>Я согласен(-на) на обработку персональных данных для ответа на обращение. <a href="${root}privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a></span></label>
      <div class="form-status" role="status" aria-live="polite" hidden></div>
      <div class="row form-actions"><button class="btn btn-fill" type="submit" data-track="form_submit_click"><span class="lbl">${ft.submit}</span>${I.arrow}<i class="spin" aria-hidden="true"></i></button>${opts.cancel ? '<button class="btn btn-lnk" type="button" data-act="close">Отмена</button>' : ''}</div>
    </form>`;
  }

  return {esc, I, MON_S, MON_G, dparts, rub, plural, norm, stem, tokens, bstyle, SPECS, FIELDS, FORM_TYPES, formHTML};
});
