'use strict';
/* Главная: тексты шаблона src/pages/mag-spreads.js */
module.exports = (page, use) => {
page('home', 'Главная', 'index.html', 'src/pages/mag-spreads.js', [
    ['mag', 'Журнал', [
      ['aria', 'Подпись для программ чтения с экрана', 'Диалог со Стеллой: настоящие ответы помощника сайта'],
      ['b', 'Выделенный текст', 'Стелла'],
      ['t', 'Надпись', 'помощник ASTREYA'],
      ['s7', 'Текст 7', 'Практические занятия']
    ]]
]);
use('home.training.li', 'src/pages/mag-spreads.js');
use('home.training.li2', 'src/pages/mag-spreads.js');
};
