const {T} = require('./texts.js');
/* Каналы связи в подвале и на странице «Контакты»: MAX, Telegram, ВКонтакте.
   Ссылки задаются в админке («Интеграции → Мессенджеры»). Канал без ссылки показывается ячейкой «скоро» —
   пока в тех же настройках не выключено «Показывать ячейки без ссылки». */
'use strict';

const CHANNELS = [
  {key: 'max', name: 'MAX', cta: T('contacts.msg.s'), sub: T('contacts.ways.email.s')},
  {key: 'telegram', name: 'Telegram', cta: T('contacts.msg.s2'), sub: T('contacts.ways.email.s')},
  {key: 'vk', name: T('contacts.msg.s3'), cta: T('contacts.msg.s4'), sub: T('contacts.msg.s5')}
];

/** Ячейки для вывода: {key, name, cta, sub, url}; url пустой — канал не подключён. */
function cells(contacts) {
  const c = contacts || {};
  return CHANNELS.map(ch => Object.assign({url: c[ch.key] || ''}, ch)).filter(ch => ch.url || c.msgShowEmpty !== false);
}

module.exports = {CHANNELS, cells};
