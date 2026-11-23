'use strict';
/* Контакты: тексты шаблона src/messengers.js */
module.exports = (page, use) => {
page('contacts', 'Контакты', 'contacts.html', 'src/messengers.js', [
    ['msg', 'Мессенджеры', [
      ['s', 'Текст', 'Написать в MAX'],
      ['s2', 'Текст 2', 'Написать в Telegram'],
      ['s3', 'Текст 3', 'ВКонтакте'],
      ['s4', 'Текст 4', 'Сообщество ВКонтакте'],
      ['s5', 'Текст 5', 'Новости и анонсы']
    ]]
]);
use('contacts.ways.email.s', 'src/messengers.js');
};
