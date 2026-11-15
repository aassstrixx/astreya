/* Общие часы для браузерных проверок. В data/events.json стоят реальные даты семинаров, и через какое-то время
   они уходят в прошлое: сайт честно перестаёт показывать «ближайший семинар», а проверки, которые ищут кнопку
   «Записаться», начинают падать не из-за ошибки в странице. Поэтому в браузере проверки «сегодня» — фиксированная
   дата до первого семинара (часы идут вперёд как обычно, сдвинуто только начало отсчёта).
   Свою дату можно задать так: ASTREYA_CHECK_NOW=2026-11-01T10:00:00Z node tools/check-sales.js */
'use strict';
const NOW = Date.parse(process.env.ASTREYA_CHECK_NOW || '2026-10-10T10:00:00Z');
const install = ctx => ctx.addInitScript(t => {
  const D = Date, off = t - D.now();
  class FakeDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } }
  window.Date = FakeDate;
}, NOW);
module.exports = {NOW, install};
