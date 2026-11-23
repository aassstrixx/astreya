'use strict';
/* Главная: тексты шаблона src/pages/home-house.js */
module.exports = (page, use) => {
page('home', 'Главная', 'index.html', 'src/pages/home-house.js', [
    ['mag', 'Журнал', [
      ['s', 'Текст', 'Дальше'],
      ['s2', 'Текст 2', 'К оглавлению'],
      ['s3', 'Текст 3', 'На главную'],
      ['s4', 'Текст 4', 'Журнал ASTREYA: листайте прокруткой'],
      ['s5', 'Текст 5', 'К контактам'],
      ['s6', 'Текст 6', 'Листайте ниже — откроется журнал']
    ]]
]);
use('home.news.s5', 'src/pages/home-house.js');
use('home.hero.a2', 'src/pages/home-house.js');
use('home.catalog.s', 'src/pages/home-house.js');
};
