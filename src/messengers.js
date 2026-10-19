/* Каналы связи в подвале и на странице «Контакты»: MAX, Telegram, ВКонтакте.
   Ссылки задаются в админке («Интеграции → Мессенджеры»). Канал без ссылки показывается ячейкой «скоро» —
   пока в тех же настройках не выключено «Показывать ячейки без ссылки». */
'use strict';

const CHANNELS = [
  {key: 'max', name: 'MAX', cta: 'Написать в MAX', sub: 'Ответим в рабочее время'},
  {key: 'telegram', name: 'Telegram', cta: 'Написать в Telegram', sub: 'Ответим в рабочее время'},
  {key: 'vk', name: 'ВКонтакте', cta: 'Сообщество ВКонтакте', sub: 'Новости и анонсы'}
];

/** Ячейки для вывода: {key, name, cta, sub, url}; url пустой — канал не подключён. */
function cells(contacts) {
  const c = contacts || {};
  return CHANNELS.map(ch => Object.assign({url: c[ch.key] || ''}, ch)).filter(ch => ch.url || c.msgShowEmpty !== false);
}

module.exports = {CHANNELS, cells};
