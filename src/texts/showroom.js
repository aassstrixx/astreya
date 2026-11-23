'use strict';
/* Каталог: тексты шаблона src/pages/showroom.js */
module.exports = (page, use) => {
page('catalog', 'Каталог', 'catalog.html', 'src/pages/showroom.js', [
    ['sr-more', 'Витрина: кнопки', [
      ['btn', 'Кнопка', 'Ещё']
    ]],
    ['sr-aside', 'Витрина: боковая панель', [
      ['aria', 'Подпись для программ чтения с экрана', 'Фильтры каталога'],
      ['a', 'Подсказка в поле', 'Поиск по каталогу…'],
      ['t', 'Надпись', 'Только избранное'],
      ['btn', 'Кнопка', 'Запросить']
    ]],
    ['sr-pop', 'Витрина: рекомендуем', [
      ['h2', 'Заголовок раздела', 'Рекомендуем'],
      ['t', 'Надпись', 'Листайте вправо — экспозиция продолжается'],
      ['a', 'Ссылка', 'Смотреть весь список'],
      ['aria', 'Подпись для программ чтения с экрана', 'Назад'],
      ['aria2', 'Подпись для программ чтения с экрана 2', 'Вперёд']
    ]],
    ['sr-adv', 'Витрина: преимущества', [
      ['s', 'Текст', 'Оригинальная продукция'],
      ['s2', 'Текст 2', 'Учебный центр'],
      ['s3', 'Текст 3', 'Поддержка специалистов'],
      ['aria', 'Подпись для программ чтения с экрана', 'Преимущества'],
      ['aria2', 'Подпись для программ чтения с экрана 2', 'Спросить Стеллу — она учтёт выбранные фильтры'],
      ['b', 'Выделенный текст', 'Спросить Стеллу'],
      ['sm', 'Подпись', 'подберёт под вашу задачу']
    ]],
    ['sr-cats', 'Витрина: категории', [
      ['aria', 'Подпись для программ чтения с экрана', 'Категории'],
      ['b', 'Выделенный текст', 'Все']
    ]],
    ['sr-stage', 'Витрина: сцена', [
      ['aria', 'Подпись для программ чтения с экрана', 'Витрина каталога'],
      ['aria2', 'Подпись для программ чтения с экрана 2', 'Товары в экспозиции'],
      ['aria3', 'Подпись для программ чтения с экрана 3', 'Сдвинуть сцену влево'],
      ['aria4', 'Подпись для программ чтения с экрана 4', 'Сдвинуть сцену вправо']
    ]],
    ['sr-card', 'Витрина: карточка товара', [
      ['aria', 'Подпись для программ чтения с экрана', 'Выбранный товар'],
      ['aria2', 'Подпись для программ чтения с экрана 2', 'Предыдущие товары'],
      ['aria3', 'Подпись для программ чтения с экрана 3', 'Следующие товары'],
      ['t', 'Надпись', 'Показать в витрине']
    ]],
    ['sr-tasks', 'Витрина: подбор по задаче', [
      ['eyebrow', 'Надпись над заголовком', 'Подбор'],
      ['h2', 'Заголовок раздела', 'Подберите по задаче'],
      ['lead', 'Вводный абзац', 'Выберите задачу кабинета или домашнего ухода — витрина выше соберёт подходящие продукты.']
    ]],
    ['sr-brands', 'Витрина: бренды в галерее', [
      ['eyebrow', 'Надпись над заголовком', 'Партнёры'],
      ['h2', 'Заголовок раздела', 'Бренды в галерее']
    ]],
    ['sr-dirs', 'Витрина: направления ухода', [
      ['eyebrow', 'Надпись над заголовком', 'Коллекции'],
      ['h2', 'Заголовок раздела', 'Выберите направление ухода'],
      ['lead', 'Вводный абзац', 'Каждая коллекция — отдельная экспозиция в той же галерее. Нажмите, и главная витрина переставится под выбранное направление.'],
      ['aria', 'Подпись для программ чтения с экрана', 'Направления ухода'],
      ['eyebrow2', 'Надпись над заголовком 2', 'Полный список'],
      ['b', 'Выделенный текст', 'Весь ассортимент списком']
    ]]
]);
use('catalog.search.s', 'src/pages/showroom.js');
use('catalog.search.s2', 'src/pages/showroom.js');
use('catalog.search.s3', 'src/pages/showroom.js');
use('catalog.search.s4', 'src/pages/showroom.js');
use('catalog.search.s5', 'src/pages/showroom.js');
use('catalog.search.s6', 'src/pages/showroom.js');
use('catalog.search.s7', 'src/pages/showroom.js');
use('catalog.search.s8', 'src/pages/showroom.js');
use('catalog.search.s9', 'src/pages/showroom.js');
use('catalog.search.s10', 'src/pages/showroom.js');
use('catalog.search.s11', 'src/pages/showroom.js');
use('catalog.search.s12', 'src/pages/showroom.js');
use('catalog.search.s13', 'src/pages/showroom.js');
use('catalog.search.t', 'src/pages/showroom.js');
use('catalog.search.btn', 'src/pages/showroom.js');
use('catalog.result.t2', 'src/pages/showroom.js');
use('catalog.result.btn', 'src/pages/showroom.js');
use('catalog.head.s', 'src/pages/showroom.js');
use('catalog.head.s2', 'src/pages/showroom.js');
use('catalog.head.s3', 'src/pages/showroom.js');
use('catalog.result.b', 'src/pages/showroom.js');
use('catalog.result.b2', 'src/pages/showroom.js');
use('catalog.result.t', 'src/pages/showroom.js');
use('catalog.result.h2', 'src/pages/showroom.js');
use('catalog.result.s', 'src/pages/showroom.js');
use('catalog.result.b3', 'src/pages/showroom.js');
};
