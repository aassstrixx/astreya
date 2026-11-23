'use strict';
/* Главная: тексты шаблона src/pages/home-path.js */
module.exports = (page, use) => {
page('home', 'Главная', 'index.html', 'src/pages/home-path.js', [
    ['tasks', 'Подбор по задаче', [
      ['aria3', 'Подпись для программ чтения с экрана 3', 'Города присутствия'],
      ['aria4', 'Подпись для программ чтения с экрана 4 2', 'Задачи']
    ]]
]);
use('home.tasks.eyebrow', 'src/pages/home-path.js');
use('home.tasks.p', 'src/pages/home-path.js');
use('home.training.sm', 'src/pages/home-path.js');
};
