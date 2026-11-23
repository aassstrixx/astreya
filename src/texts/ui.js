'use strict';
/* Подписи интерфейса, которые рисуют браузерные скрипты (js/*.js): кнопки, подсказки, статусы форм, сообщения. В скрипте стоит AT('ключ', 'исходный текст'); правки заказчика попадают в js/data.js → texts.
   В этих текстах нельзя прямые кавычки, < и > (их вставляют в разметку), метки вида {имя} здесь не используются. */
module.exports = (page, use) => {
page('ui', 'Подписи интерфейса сайта (скрипты)', 'index.html', 'js/core.js', [
  ['forms', 'Формы заявок: статусы и сообщения', [
    ['k1', 'Режим письма: заголовок «Почти готово»', 'Почти готово', {js: true, manual: true, file: 'js/core.js'}],
    ['k2', 'Режим письма: кнопка «Открыть письмо ещё раз»', 'Открыть письмо ещё раз', {js: true, manual: true, file: 'js/core.js'}],
    ['k3', 'После отправки: заголовок «Заявка отправлена»', 'Заявка отправлена', {js: true, manual: true, file: 'js/core.js'}],
    ['k4', 'После отправки: кнопка «Отправить ещё одну»', 'Отправить ещё одну', {js: true, manual: true, file: 'js/core.js'}],
    ['k5', 'Режим письма: заголовок «Заявка подготовлена»', 'Заявка подготовлена', {js: true, manual: true, file: 'js/core.js'}],
    ['k6', 'Режим письма: кнопка «Открыть в почтовой программе»', 'Открыть в почтовой программе', {js: true, manual: true, file: 'js/core.js'}],
    ['k7', 'Режим письма: кнопка «Скопировать письмо»', 'Скопировать письмо', {js: true, manual: true, file: 'js/core.js'}],
    ['k8', 'Режим письма: кнопка «Скопировать адрес»', 'Скопировать адрес', {js: true, manual: true, file: 'js/core.js'}],
    ['k9', 'Ошибка: проверьте поля, отмеченные красным', 'Проверьте поля, отмеченные красным.', {js: true, manual: true, file: 'js/core.js'}],
    ['k10', 'Статус «Отправляем заявку…»', 'Отправляем заявку…', {js: true, manual: true, file: 'js/core.js'}],
    ['k11', 'Ошибка: слишком много заявок', 'Слишком много заявок с вашего адреса.', {js: true, manual: true, file: 'js/core.js'}],
    ['k12', 'Ошибка отправки: заголовок', 'Не удалось отправить заявку.', {js: true, manual: true, file: 'js/core.js'}],
    ['k13', 'Подпись о защите формы (SmartCaptcha)', 'Форма защищена сервисом Yandex SmartCaptcha.', {js: true, manual: true, file: 'js/core.js'}],
    ['k14', 'Подсказка «Текст выделен — нажмите Ctrl+C»', 'Текст выделен — нажмите Ctrl+C или ⌘C', {js: true, manual: true, file: 'js/core.js'}],
    ['k15', 'Уведомление «Адрес скопирован»', 'Адрес скопирован', {js: true, manual: true, file: 'js/core.js'}],
    ['k16', 'Уведомление «Письмо скопировано»', 'Письмо скопировано', {js: true, manual: true, file: 'js/core.js'}]
  ]],
  ['showroom', 'Витрина: окно товара и избранное', [
    ['k1', 'Избранное: подсказка «Убрать из избранного»', 'Убрать из избранного', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k2', 'Избранное: подсказка «Добавить в избранное»', 'Добавить в избранное', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k3', 'Окно товара: заголовок «Активные компоненты»', 'Активные компоненты', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k4', 'Окно товара: пояснение про 3D-макет упаковки', 'Изображение упаковки условное — это 3D-макет без текста и логотипов.', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k5', 'Окно товара: кнопка «В избранное»', 'В избранное', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k6', 'Окно товара: кнопка «Быстрый просмотр»', 'Быстрый просмотр', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k7', 'Окно товара: кнопка «Помочь с подбором»', 'Помочь с подбором', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k8', 'Окно товара: подпись кнопки закрытия', 'Закрыть карточку товара', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k9', 'Окно товара: подпись для незрячих', 'Краткие сведения о товаре', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k10', 'Сообщение: избранное пусто', 'Избранное пока пусто — отметьте товары сердечком', {js: true, manual: true, file: 'js/showroom.js'}]
  ]],
  ['extras', 'Список запроса, связь и «Вы смотрели»', [
    ['k1', 'Кнопка «Список запроса»', 'Список запроса', {js: true, manual: true, file: 'js/extras.js'}],
    ['k2', 'Подсказка «Убрать из списка запроса»', 'Убрать из списка запроса', {js: true, manual: true, file: 'js/extras.js'}],
    ['k3', 'Подсказка «Добавить в список запроса»', 'Добавить в список запроса', {js: true, manual: true, file: 'js/extras.js'}],
    ['k4', 'Метка «В списке запроса»', 'В списке запроса', {js: true, manual: true, file: 'js/extras.js'}],
    ['k5', 'Метка «В список запроса»', 'В список запроса', {js: true, manual: true, file: 'js/extras.js'}],
    ['k6', 'Окно списка: пояснение', 'Отправьте все позиции одним запросом: менеджер пришлёт информацию и условия поставки по каждой.', {js: true, manual: true, file: 'js/extras.js'}],
    ['k7', 'Окно списка: кнопка «Очистить список»', 'Очистить список', {js: true, manual: true, file: 'js/extras.js'}],
    ['k8', 'Окно списка: если список пуст', 'Список пуст. Нажмите «+» на карточке товара — и позиция появится здесь.', {js: true, manual: true, file: 'js/extras.js'}],
    ['k9', 'Окно списка: кнопка «Перейти в каталог»', 'Перейти в каталог', {js: true, manual: true, file: 'js/extras.js'}],
    ['k10', 'Кнопка связи: «Написать сообщение»', 'Написать сообщение', {js: true, manual: true, file: 'js/extras.js'}],
    ['k11', 'Кнопка связи: «Заказать звонок»', 'Заказать звонок', {js: true, manual: true, file: 'js/extras.js'}],
    ['k12', 'Кнопка связи: подпись под «Заказать звонок»', 'Перезвоним в рабочее время', {js: true, manual: true, file: 'js/extras.js'}],
    ['k13', 'Кнопка связи: подпись для незрячих', 'Связаться с нами', {js: true, manual: true, file: 'js/extras.js'}],
    ['k14', 'Блок: надпись «Вы смотрели»', 'Вы смотрели', {js: true, manual: true, file: 'js/extras.js'}],
    ['k15', 'Блок: заголовок «Недавно просмотренные»', 'Недавно просмотренные', {js: true, manual: true, file: 'js/extras.js'}],
    ['k16', 'Уведомление: список просмотренных очищен', 'Список просмотренных очищен', {js: true, manual: true, file: 'js/extras.js'}],
    ['k17', 'Уведомление: список запроса очищен', 'Список запроса очищен', {js: true, manual: true, file: 'js/extras.js'}]
  ]],
  ['compare', 'Быстрый просмотр, сравнение, обратный отсчёт', [
    ['k1', 'Быстрый просмотр: «Способ применения»', 'Способ применения', {js: true, manual: true, file: 'js/explore.js'}],
    ['k2', 'Кнопка «✓ В списке запроса»', '✓ В списке запроса', {js: true, manual: true, file: 'js/explore.js'}],
    ['k3', 'Кнопка «+ В список запроса»', '+ В список запроса', {js: true, manual: true, file: 'js/explore.js'}],
    ['k4', 'Кнопка «Спросить Стеллу»', 'Спросить Стеллу', {js: true, manual: true, file: 'js/explore.js'}],
    ['k5', 'Подпись: листать товары', 'Листать товары', {js: true, manual: true, file: 'js/explore.js'}],
    ['k6', 'Подпись: предыдущий товар', 'Предыдущий товар', {js: true, manual: true, file: 'js/explore.js'}],
    ['k7', 'Подпись: следующий товар', 'Следующий товар', {js: true, manual: true, file: 'js/explore.js'}],
    ['k8', 'Заголовок «Сравнение товаров»', 'Сравнение товаров', {js: true, manual: true, file: 'js/explore.js'}],
    ['k9', 'Кнопка «Очистить сравнение»', 'Очистить сравнение', {js: true, manual: true, file: 'js/explore.js'}],
    ['k10', 'Подсказка «Убрать из сравнения»', 'Убрать из сравнения', {js: true, manual: true, file: 'js/explore.js'}],
    ['k11', 'Таблица: «Различий в этих полях нет.»', 'Различий в этих полях нет.', {js: true, manual: true, file: 'js/explore.js'}],
    ['k12', 'Подпись выбора «Добавить товар к сравнению»', 'Добавить товар к сравнению', {js: true, manual: true, file: 'js/explore.js'}],
    ['k13', 'Список: «Выберите товар…»', 'Выберите товар…', {js: true, manual: true, file: 'js/explore.js'}],
    ['k14', 'Группа: «Похожие по задаче»', 'Похожие по задаче', {js: true, manual: true, file: 'js/explore.js'}],
    ['k15', 'Сравнение пусто: подсказка', 'Пока ничего не выбрано — нажмите ⇄ на карточке товара.', {js: true, manual: true, file: 'js/explore.js'}],
    ['k16', 'Сравнение: пояснение про данные каталога', 'Показаны данные из каталога; чего в нём нет, уточняет менеджер. Совпадающие задачи выделены.', {js: true, manual: true, file: 'js/explore.js'}],
    ['k17', 'Флажок «Только различия»', 'Только различия', {js: true, manual: true, file: 'js/explore.js'}],
    ['k18', 'Обратный отсчёт: «Идёт сейчас»', 'Идёт сейчас', {js: true, manual: true, file: 'js/explore.js'}],
    ['k19', 'Обратный отсчёт: «Ближайшее мероприятие»', 'Ближайшее мероприятие', {js: true, manual: true, file: 'js/explore.js'}],
    ['k20', 'Обратный отсчёт: «До начала»', 'До начала', {js: true, manual: true, file: 'js/explore.js'}],
    ['k21', 'Уведомление «Сравнение очищено»', 'Сравнение очищено', {js: true, manual: true, file: 'js/explore.js'}]
  ]],
  ['pages', 'Каталог и подбор: кнопки и сообщения', [
    ['k1', 'Подпись «Ближайший семинар»', 'Ближайший семинар', {js: true, manual: true, file: 'js/pages.js'}],
    ['k2', 'Кнопка «Выбрать семинар»', 'Выбрать семинар', {js: true, manual: true, file: 'js/pages.js'}],
    ['k3', 'Кнопка «Задать вопрос»', 'Задать вопрос', {js: true, manual: true, file: 'js/pages.js'}],
    ['k4', 'Калькулятор: «Ваша скидка —»', 'Ваша скидка —', {js: true, manual: true, file: 'js/pages.js'}],
    ['k5', 'Калькулятор: «До первой скидки —»', 'До первой скидки —', {js: true, manual: true, file: 'js/pages.js'}],
    ['k6', 'Поиск: «Ничего не найдено»', 'Ничего не найдено', {js: true, manual: true, file: 'js/pages.js'}]
  ]],
  ['gallery', 'Быстрый просмотр в каталоге', [
    ['k1', 'Блок «Тот же бренд и назначение»', 'Тот же бренд и назначение', {js: true, manual: true, file: 'js/gallery.js'}],
    ['k2', 'Вопрос помощнику, если ничего не нашлось', 'Ничего не нашлось — что подойдёт рядом?', {js: true, manual: true, file: 'js/gallery.js'}]
  ]],
  ['news', 'Газета: окно материала', [
    ['k1', 'Кнопка «К газете»', 'К газете', {js: true, manual: true, file: 'js/news-paper.js'}],
    ['k2', 'Ссылка «Отдельной страницей»', 'Отдельной страницей', {js: true, manual: true, file: 'js/news-paper.js'}],
    ['k3', 'Блок «Товары по теме»', 'Товары по теме', {js: true, manual: true, file: 'js/news-paper.js'}],
    ['k4', 'Блок «Мероприятия по теме»', 'Мероприятия по теме', {js: true, manual: true, file: 'js/news-paper.js'}]
  ]],
  ['consent', 'Cookie-баннер: уведомления', [
    ['k1', 'Уведомление: настройки сохранены', 'Спасибо, настройки сохранены', {js: true, manual: true, file: 'js/consent.js'}],
    ['k2', 'Уведомление: аналитика отключена', 'Аналитика отключена', {js: true, manual: true, file: 'js/consent.js'}]
  ]],
  ['start', 'Старт: план закупки', [
    ['k1', 'Кнопка «Скопировать текстом»', 'Скопировать текстом', {js: true, manual: true, file: 'js/pg-start.js'}],
    ['k2', 'Заголовок «Состав плана»', 'Состав плана', {js: true, manual: true, file: 'js/pg-start.js'}],
    ['k3', 'Уведомление: план скопирован', 'План скопирован текстом', {js: true, manual: true, file: 'js/pg-start.js'}]
  ]],
  ['search', 'Поиск: подсказки', [
    ['k1', 'Подсказка «Попробуйте так»', 'Попробуйте так', {js: true, manual: true, file: 'js/pg-search.js'}],
    ['k2', 'Подсказка «Или откройте раздел»', 'Или откройте раздел', {js: true, manual: true, file: 'js/pg-search.js'}]
  ]],
  ['sales', 'Путь к закупке: тексты скрипта', [
    ['k1', 'Кнопка «Запросить условия»', 'Запросить условия', {js: true, manual: true, file: 'js/sales.js'}],
    ['k2', 'Заголовок «План готов»', 'План готов', {js: true, manual: true, file: 'js/sales.js'}],
    ['k3', 'Блок «Для старта»', 'Для старта', {js: true, manual: true, file: 'js/sales.js'}],
    ['k4', 'Блок «Как заказать»', 'Как заказать', {js: true, manual: true, file: 'js/sales.js'}],
    ['k5', 'Блок «Условия закупки»', 'Условия закупки', {js: true, manual: true, file: 'js/sales.js'}],
    ['k6', 'Блок «Условия и заявка»', 'Условия и заявка', {js: true, manual: true, file: 'js/sales.js'}],
    ['k7', 'Сообщение: товары уже в списке запроса', 'Эти товары уже в списке запроса', {js: true, manual: true, file: 'js/sales.js'}],
    ['k8', 'Сообщение: ссылка на план скопирована', 'Ссылка на план скопирована', {js: true, manual: true, file: 'js/sales.js'}],
    ['k9', 'Кнопка «Следующий шаг»', 'Следующий шаг', {js: true, manual: true, file: 'js/sales.js'}]
  ]],
  ['x_explore', 'Сравнение и быстрый просмотр: остальные подписи', [
    ['k1', '«Бренд»', 'Бренд', {js: true, manual: true, file: 'js/explore.js'}],
    ['k2', '«Категория»', 'Категория', {js: true, manual: true, file: 'js/explore.js'}],
    ['k3', '«Объём»', 'Объём', {js: true, manual: true, file: 'js/explore.js'}],
    ['k4', '«Артикул»', 'Артикул', {js: true, manual: true, file: 'js/explore.js'}],
    ['k5', '«Показания»', 'Показания', {js: true, manual: true, file: 'js/explore.js'}],
    ['k6', '«Новинка»', 'Новинка', {js: true, manual: true, file: 'js/explore.js'}],
    ['k7', '«Закрыть»', 'Закрыть', {js: true, manual: true, file: 'js/explore.js'}],
    ['k8', '«Сравнить»', 'Сравнить', {js: true, manual: true, file: 'js/explore.js'}],
    ['k9', '«Сравнение:»', 'Сравнение:', {js: true, manual: true, file: 'js/explore.js'}],
    ['k10', '«1 товар · добавьте ещё, чтобы сравнить»', '1 товар · добавьте ещё, чтобы сравнить', {js: true, manual: true, file: 'js/explore.js'}],
    ['k11', '«Попросить Стеллу рассказать»', 'Попросить Стеллу рассказать', {js: true, manual: true, file: 'js/explore.js'}],
    ['k12', '«Открыть»', 'Открыть', {js: true, manual: true, file: 'js/explore.js'}],
    ['k13', '«Назначение»', 'Назначение', {js: true, manual: true, file: 'js/explore.js'}],
    ['k14', '«Описание»', 'Описание', {js: true, manual: true, file: 'js/explore.js'}],
    ['k15', '«Уточняется»', 'Уточняется', {js: true, manual: true, file: 'js/explore.js'}],
    ['k16', '«Запросить»', 'Запросить', {js: true, manual: true, file: 'js/explore.js'}],
    ['k17', '«Сравнение»', 'Сравнение', {js: true, manual: true, file: 'js/explore.js'}],
    ['k18', '«Это данные одного товара. Добавьте ещё один — таблица покажет …»', 'Это данные одного товара. Добавьте ещё один — таблица покажет сходства и различия.', {js: true, manual: true, file: 'js/explore.js'}],
    ['k19', '«Расскажи о выбранном товаре: {names}»', 'Расскажи о выбранном товаре: {names}', {js: true, manual: true, file: 'js/explore.js'}]
  ]],
  ['x_showroom', 'Витрина: остальные подписи', [
    ['k1', '«Применение»', 'Применение', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k2', '«Рекомендуем»', 'Рекомендуем', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k3', '«Состав»', 'Состав', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k4', '«Подробные характеристики уточняются — менеджер пришлёт состав …»', 'Подробные характеристики уточняются — менеджер пришлёт состав и протокол по запросу.', {js: true, manual: true, file: 'js/showroom.js'}],
    ['k5', '«Свернуть»', 'Свернуть', {js: true, manual: true, file: 'js/showroom.js'}]
  ]],
  ['x_extras', 'Список запроса и связь: остальные подписи', [
    ['k1', '«Заявка»', 'Заявка', {js: true, manual: true, file: 'js/extras.js'}],
    ['k2', '«ВКонтакте»', 'ВКонтакте', {js: true, manual: true, file: 'js/extras.js'}],
    ['k3', '«Позвонить»', 'Позвонить', {js: true, manual: true, file: 'js/extras.js'}],
    ['k4', '«Очистить»', 'Очистить', {js: true, manual: true, file: 'js/extras.js'}]
  ]],
  ['x_pages', 'Каталог и подбор: остальные подписи', [
    ['k1', '«Помоги выбрать бренд: расскажи, чем бренды «Астреи» отличаются…»', 'Помоги выбрать бренд: расскажи, чем бренды «Астреи» отличаются и под какие задачи кожи подходят.', {js: true, manual: true, file: 'js/pages.js'}],
    ['k2', '«Товары»', 'Товары', {js: true, manual: true, file: 'js/pages.js'}],
    ['k3', '«Бренды»', 'Бренды', {js: true, manual: true, file: 'js/pages.js'}],
    ['k4', '«Обучение»', 'Обучение', {js: true, manual: true, file: 'js/pages.js'}],
    ['k5', '«Новости»', 'Новости', {js: true, manual: true, file: 'js/pages.js'}]
  ]],
  ['x_gallery', 'Быстрый просмотр в каталоге: остальные подписи', [
    ['k1', '«Помоги подобрать: опиши, что подойдёт под мою задачу.»', 'Помоги подобрать: опиши, что подойдёт под мою задачу.', {js: true, manual: true, file: 'js/gallery.js'}]
  ]],
  ['x_news', 'Газета: остальные подписи', [
    ['k1', '«Сбросить»', 'Сбросить', {js: true, manual: true, file: 'js/news-paper.js'}],
    ['k2', '«Обложка»', 'Обложка', {js: true, manual: true, file: 'js/news-paper.js'}],
    ['k3', '«Оборот, страница 12»', 'Оборот, страница 12', {js: true, manual: true, file: 'js/news-paper.js'}],
    ['k4', '«Оборот · стр. 12»', 'Оборот · стр. 12', {js: true, manual: true, file: 'js/news-paper.js'}]
  ]],
  ['x_consent', 'Cookie-баннер: остальные подписи', [
    ['k1', '«Подробнее»', 'Подробнее', {js: true, manual: true, file: 'js/consent.js'}]
  ]],
  ['x_start', 'Старт: остальные подписи', [
    ['k1', '«Распечатать»', 'Распечатать', {js: true, manual: true, file: 'js/pg-start.js'}]
  ]],
  ['x_search', 'Поиск: остальные подписи', [
    ['k1', '«Каталог»', 'Каталог', {js: true, manual: true, file: 'js/pg-search.js'}],
    ['k2', '«Контакты»', 'Контакты', {js: true, manual: true, file: 'js/pg-search.js'}]
  ]],
  ['x_sales', 'Путь к закупке: остальные подписи', [
    ['k1', '«Стартовый план с сайта «Астрея»»', 'Стартовый план с сайта «Астрея»', {js: true, manual: true, file: 'js/sales.js'}],
    ['k2', '«Записаться»', 'Записаться', {js: true, manual: true, file: 'js/sales.js'}]
  ]],
  ['x_salesp', 'Страницы с планом закупки: остальные подписи', [
    ['k1', '«Открыть мой план»', 'Открыть мой план', {js: true, manual: true, file: 'js/sales-pages.js'}],
    ['k2', '«Открыть список»', 'Открыть список', {js: true, manual: true, file: 'js/sales-pages.js'}],
    ['k3', '«Рассчитать скидку»', 'Рассчитать скидку', {js: true, manual: true, file: 'js/sales-pages.js'}],
    ['k4', '«Смотреть в каталоге»', 'Смотреть в каталоге', {js: true, manual: true, file: 'js/sales-pages.js'}],
    ['k5', '«К расписанию»', 'К расписанию', {js: true, manual: true, file: 'js/sales-pages.js'}]
  ]],
  ['x_core', 'Формы и поиск: остальные подписи', [
    ['k1', '«Товар»', 'Товар', {js: true, manual: true, file: 'js/core.js'}],
    ['k2', '«Новость»', 'Новость', {js: true, manual: true, file: 'js/core.js'}],
    ['k3', '«Страница»', 'Страница', {js: true, manual: true, file: 'js/core.js'}],
    ['k4', '«Согласие на обработку персональных данных: да»', 'Согласие на обработку персональных данных: да', {js: true, manual: true, file: 'js/core.js'}],
    ['k5', '«Отправлено с сайта «Астрея».»', 'Отправлено с сайта «Астрея».', {js: true, manual: true, file: 'js/core.js'}],
    ['k6', '«Отправка…»', 'Отправка…', {js: true, manual: true, file: 'js/core.js'}],
    ['k7', '«Проверьте соединение и попробуйте ещё раз — введённые данные с…»', 'Проверьте соединение и попробуйте ещё раз — введённые данные сохранены.', {js: true, manual: true, file: 'js/core.js'}]
  ]],
  ['x_motion', 'Заставка и переходы между страницами', [
    ['k1', '«Новости и акции»', 'Новости и акции', {js: true, manual: true, file: 'js/motion.js'}],
    ['k2', '«Компания»', 'Компания', {js: true, manual: true, file: 'js/motion.js'}],
    ['k3', '«Партнёрам»', 'Партнёрам', {js: true, manual: true, file: 'js/motion.js'}],
    ['k4', '«Поиск»', 'Поиск', {js: true, manual: true, file: 'js/motion.js'}],
    ['k5', '«Документы»', 'Документы', {js: true, manual: true, file: 'js/motion.js'}],
    ['k6', '«Главная»', 'Главная', {js: true, manual: true, file: 'js/motion.js'}],
    ['k7', '«Астрея»', 'Астрея', {js: true, manual: true, file: 'js/motion.js'}],
    ['k8', '«Профессиональная косметика»', 'Профессиональная косметика', {js: true, manual: true, file: 'js/motion.js'}]
  ]]
]);
use('ui.showroom.k3', 'js/explore.js');
use('ui.showroom.k6', 'js/explore.js');
use('ui.showroom.k7', 'js/gallery.js');
use('ui.showroom.k3', 'js/explore.js');
use('ui.compare.k1', 'js/explore.js');
use('ui.compare.k2', 'js/explore.js');
use('ui.compare.k3', 'js/explore.js');
use('ui.compare.k4', 'js/explore.js');
use('ui.compare.k5', 'js/explore.js');
use('ui.compare.k6', 'js/explore.js');
use('ui.compare.k7', 'js/explore.js');
use('ui.showroom.k6', 'js/explore.js');
use('ui.compare.k8', 'js/explore.js');
use('ui.compare.k9', 'js/explore.js');
use('ui.compare.k10', 'js/explore.js');
use('ui.compare.k11', 'js/explore.js');
use('ui.compare.k12', 'js/explore.js');
use('ui.compare.k13', 'js/explore.js');
use('ui.compare.k14', 'js/explore.js');
use('ui.compare.k15', 'js/explore.js');
use('ui.compare.k16', 'js/explore.js');
use('ui.compare.k17', 'js/explore.js');
use('ui.compare.k19', 'js/explore.js');
use('ui.compare.k20', 'js/explore.js');
use('ui.compare.k21', 'js/explore.js');
use('ui.showroom.k1', 'js/showroom.js');
use('ui.showroom.k2', 'js/showroom.js');
use('ui.x_explore.k2', 'js/showroom.js');
use('ui.x_explore.k3', 'js/showroom.js');
use('ui.x_explore.k4', 'js/showroom.js');
use('ui.x_explore.k6', 'js/showroom.js');
use('ui.x_explore.k13', 'js/showroom.js');
use('ui.showroom.k3', 'js/showroom.js');
use('ui.x_explore.k5', 'js/showroom.js');
use('ui.showroom.k4', 'js/showroom.js');
use('ui.showroom.k5', 'js/showroom.js');
use('ui.x_explore.k8', 'js/showroom.js');
use('ui.x_explore.k16', 'js/showroom.js');
use('ui.showroom.k6', 'js/showroom.js');
use('ui.showroom.k7', 'js/showroom.js');
use('ui.showroom.k8', 'js/showroom.js');
use('ui.x_explore.k7', 'js/showroom.js');
use('ui.showroom.k9', 'js/showroom.js');
use('ui.showroom.k10', 'js/showroom.js');
use('ui.extras.k1', 'js/extras.js');
use('ui.x_explore.k12', 'js/extras.js');
use('ui.extras.k2', 'js/extras.js');
use('ui.extras.k3', 'js/extras.js');
use('ui.extras.k4', 'js/extras.js');
use('ui.extras.k5', 'js/extras.js');
use('ui.x_explore.k7', 'js/extras.js');
use('ui.extras.k6', 'js/extras.js');
use('ui.extras.k7', 'js/extras.js');
use('ui.extras.k8', 'js/extras.js');
use('ui.extras.k9', 'js/extras.js');
use('ui.extras.k10', 'js/extras.js');
use('ui.extras.k11', 'js/extras.js');
use('ui.extras.k12', 'js/extras.js');
use('ui.extras.k13', 'js/extras.js');
use('ui.extras.k14', 'js/extras.js');
use('ui.extras.k15', 'js/extras.js');
use('ui.extras.k16', 'js/extras.js');
use('ui.extras.k17', 'js/extras.js');
use('ui.pages.k1', 'js/pages.js');
use('ui.x_explore.k7', 'js/pages.js');
use('ui.pages.k2', 'js/pages.js');
use('ui.pages.k3', 'js/pages.js');
use('ui.pages.k4', 'js/pages.js');
use('ui.pages.k5', 'js/pages.js');
use('ui.pages.k6', 'js/pages.js');
use('ui.gallery.k1', 'js/gallery.js');
use('ui.showroom.k7', 'js/gallery.js');
use('ui.gallery.k2', 'js/gallery.js');
use('ui.x_explore.k7', 'js/news-paper.js');
use('ui.news.k1', 'js/news-paper.js');
use('ui.news.k2', 'js/news-paper.js');
use('ui.news.k3', 'js/news-paper.js');
use('ui.news.k4', 'js/news-paper.js');
use('ui.consent.k1', 'js/consent.js');
use('ui.consent.k2', 'js/consent.js');
use('ui.start.k1', 'js/pg-start.js');
use('ui.start.k2', 'js/pg-start.js');
use('ui.start.k3', 'js/pg-start.js');
use('ui.x_pages.k3', 'js/pg-search.js');
use('ui.x_pages.k4', 'js/pg-search.js');
use('ui.search.k1', 'js/pg-search.js');
use('ui.search.k2', 'js/pg-search.js');
use('ui.sales.k1', 'js/sales.js');
use('ui.sales.k2', 'js/sales.js');
use('ui.sales.k3', 'js/sales.js');
use('ui.x_pages.k4', 'js/sales.js');
use('ui.sales.k4', 'js/sales.js');
use('ui.sales.k5', 'js/sales.js');
use('ui.sales.k6', 'js/sales.js');
use('ui.sales.k7', 'js/sales.js');
use('ui.sales.k8', 'js/sales.js');
use('ui.sales.k9', 'js/sales.js');
use('ui.x_explore.k7', 'js/sales.js');
use('ui.x_sales.k2', 'js/sales-pages.js');
use('ui.x_gallery.k1', 'js/sales-pages.js');
use('ui.x_explore.k1', 'js/core.js');
use('ui.x_pages.k4', 'js/core.js');
use('ui.x_explore.k7', 'js/core.js');
use('ui.x_extras.k1', 'js/core.js');
use('ui.forms.k1', 'js/core.js');
use('ui.forms.k2', 'js/core.js');
use('ui.forms.k3', 'js/core.js');
use('ui.forms.k4', 'js/core.js');
use('ui.forms.k5', 'js/core.js');
use('ui.forms.k6', 'js/core.js');
use('ui.forms.k7', 'js/core.js');
use('ui.forms.k8', 'js/core.js');
use('ui.forms.k9', 'js/core.js');
use('ui.forms.k10', 'js/core.js');
use('ui.forms.k11', 'js/core.js');
use('ui.forms.k12', 'js/core.js');
use('ui.forms.k13', 'js/core.js');
use('ui.forms.k14', 'js/core.js');
use('ui.forms.k15', 'js/core.js');
use('ui.forms.k16', 'js/core.js');
use('ui.x_search.k1', 'js/motion.js');
use('ui.x_pages.k3', 'js/motion.js');
use('ui.x_pages.k4', 'js/motion.js');
use('ui.x_search.k2', 'js/motion.js');
use('ui.x_news.k2', 'js/house.js');
use('ui.x_search.k2', 'js/house.js');
const J = {js: true, manual: true, file: 'js/shared.js'};
page('ui', 'Подписи интерфейса сайта (скрипты)', 'index.html', 'js/shared.js', [
  ['fields', 'Поля форм: подписи и сообщения об ошибках', [
    ['name', 'Поле «Имя»: подпись', 'Имя', J], ['nameErr', 'Поле «Имя»: ошибка', 'Укажите имя', J], ['phone', 'Поле «Телефон»: подпись', 'Телефон', J], ['phoneErr', 'Поле «Телефон»: ошибка', 'Проверьте номер телефона', J],
    ['emailErr', 'Поле «Email»: ошибка', 'Проверьте адрес почты', J], ['city', 'Поле «Город»: подпись', 'Город', J], ['cityErr', 'Поле «Город»: ошибка', 'Укажите город', J], ['org', 'Поле «Организация»: подпись', 'Название организации', J],
    ['spec', 'Поле «Специализация»: подпись', 'Специализация', J], ['msg', 'Поле «Комментарий»: подпись', 'Комментарий', J], ['msgErr', 'Поле «Комментарий»: ошибка', 'Напишите сообщение', J], ['choose', 'Список: «Выберите…»', 'Выберите…', J]
  ]]
]);
};
