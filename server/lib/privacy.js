/* Персональные данные (152-ФЗ): реестр обработки по факту (что собираем и куда уходит), поиск и выгрузка данных субъекта, удаление по его требованию. */
'use strict';
const C = require('./config');
const L = require('./leads');
const INT = require('./integrations');
const {httpErr} = require('./auth');

const hostOf = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
const ruHost = h => /(\.ru|\.рф|\.su|\.xn--p1ai)$/i.test(h) || /(^|\.)yandex\.(ru|net|cloud)$|yandexcloud\.net$|bitrix24\.(ru|by|kz)$/i.test(h);
const localHost = h => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);

/* найти записи по телефону, e-mail или имени из обращения субъекта */
function search(q) {
  if (String(q || '').trim().length < 3) throw httpErr(400, 'Введите телефон, e-mail или имя (минимум 3 символа).');
  return L.findSubject(q).slice(0, 200).map(x => ({id: x.id, created_at: x.created_at, status: x.status, type: x.type, name: x.name, phone: x.phone, email: x.email, city: x.city, org: x.org, msg: String(x.msg || '').slice(0, 200), consent_at: x.consent_at || null, consent_version: x.consent_version || '', notes: (x.notes || []).length}));
}
function exportSubject(q) {
  if (String(q || '').trim().length < 3) throw httpErr(400, 'Введите телефон, e-mail или имя (минимум 3 символа).');
  const items = L.findSubject(q);
  return {query: String(q).slice(0, 80), exported_at: new Date().toISOString(), count: items.length, note: 'Данные, которые сайт хранит о субъекте. Поле ip — необратимый хэш сетевого адреса (самого адреса в базе нет).', items};
}
async function erase(ids, who) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(x => /^L\d+$/.test(String(x)))) throw httpErr(400, 'Укажите номера заявок для удаления (до 500).');
  return L.eraseSubject(ids, who);
}

/* реестр обработки: собирается из настроек и подключённых сервисов — то, что действительно работает сейчас */
function registry(settings) {
  const site = INT.siteData('site') || {}, integ = INT.siteData('integrations') || {}, legal = INT.siteData('legal') || {}, rq = site.requisites || {}, n = settings.notify, as = settings.assistant, bx = settings.integrations.bitrix24, cp = settings.integrations.captcha;
  const systems = [];
  const add = (key, name, on, data, where, note, risk) => systems.push({key, name, on: !!on, data, where, note: note || '', risk: risk || 'ok'});
  add('metrika', 'Яндекс Метрика', INT.counterId(), 'идентификаторы cookie, страницы и действия, устройство, примерное местоположение' + ((integ.metrika || {}).webvisor ? '; запись сеансов (Вебвизор)' : ''), 'Россия (ООО «Яндекс»)', 'Работает только после согласия в уведомлении о cookie (режим «' + ((integ.consent || {}).mode || 'optin') + '»).', 'ok');
  add('smartcaptcha', 'Яндекс SmartCaptcha', cp.enabled && cp.serverKey, 'сетевой адрес и поведение при отправке формы', 'Россия (Yandex Cloud)', '', 'ok');
  const tg = n.telegram.token && n.telegram.chatId; add('telegram', 'Уведомления в Telegram', tg, 'имя, телефон, e-mail, сообщение из заявки', 'Серверы мессенджера за пределами РФ', 'Передача данных заявки через иностранный сервис — оцените как трансграничную передачу или используйте e-mail / Битрикс24.', 'warn');
  const smtpHost = n.smtp.host && n.smtp.to ? n.smtp.host : ''; add('smtp', 'Уведомления по e-mail (SMTP)', smtpHost, 'содержимое заявки', smtpHost ? (ruHost(smtpHost) ? 'Россия (по адресу сервера ' + smtpHost + ')' : 'Уточните страну сервера ' + smtpHost) : '', smtpHost && !ruHost(smtpHost) ? 'Сервер почты не на российском домене — убедитесь, где он находится.' : '', smtpHost && !ruHost(smtpHost) ? 'warn' : 'ok');
  const wh = n.webhookUrl; add('webhook', 'Веб-хук (CRM / автоматизация)', wh, 'содержимое заявки', wh ? (ruHost(hostOf(wh)) ? 'Россия (по адресу ' + hostOf(wh) + ')' : 'Уточните страну сервера ' + hostOf(wh)) : '', wh && !ruHost(hostOf(wh)) ? 'Адрес не на российском домене — проверьте, где расположен получатель.' : '', wh && !ruHost(hostOf(wh)) ? 'warn' : 'ok');
  const bh = bx.enabled && bx.webhook ? hostOf(bx.webhook) : ''; add('bitrix24', 'Битрикс24 (лиды в CRM)', bh, 'имя, телефон, e-mail, город, организация, сообщение', bh ? (ruHost(bh) ? 'Россия (' + bh + ')' : 'Портал ' + bh + ' — уточните расположение серверов') : '', '', bh && !ruHost(bh) ? 'warn' : 'ok');
  const ai = require('./assistant').info(), aiHost = hostOf(ai.baseUrl), aiOn = !!ai.ai;
  const aiLocal = ai.keyFrom === 'not_needed' || (aiHost && localHost(aiHost)), aiRu = aiHost && ruHost(aiHost);
  add('assistant', 'ИИ-помощник «Стелла»', aiOn, 'текст вопросов посетителей (они могут ввести и персональные данные)', aiLocal ? 'Свой сервер' : aiRu ? 'Россия (' + aiHost + ')' : ai.provider === 'anthropic' ? 'Зарубежный сервис (Anthropic)' : 'Зарубежный сервис' + (aiHost ? ' (' + aiHost + ')' : ''), aiLocal || aiRu ? '' : 'Вопросы уходят в зарубежный сервис ИИ. Предупреждение показано в политике; рассмотрите российскую или локальную модель.', aiLocal || aiRu || !aiOn ? 'ok' : 'warn');
  add('server', 'Этот сервер (заявки, админка)', true, 'заявки целиком, учётные записи, журнал', 'Определяется вашим хостингом', 'Для граждан РФ база должна находиться в России (ч. 5 ст. 18 152-ФЗ). Подтвердите это в разделе «Запуск».', 'info');
  const named = (legal.processors || []).map(p => String(p.name || '').toLowerCase());
  const mention = (re) => named.some(x => re.test(x));
  const gaps = [];
  if (tg && !mention(/telegram|телеграм/)) gaps.push('Telegram включён, но не указан среди получателей данных (Документы → Получатели данных).');
  if (bh && !mention(/битрикс|bitrix/)) gaps.push('Битрикс24 включён, но не указан среди получателей данных.');
  if (smtpHost && !mention(/почт|mail|smtp|яндекс|mailru|vk|рамблер|timeweb|reg\.ru|selectel/)) gaps.push('Почтовый сервис уведомлений не указан среди получателей данных.');
  if (aiOn && !aiLocal && !mention(/ии|ai|anthropic|openai|yandexgpt|gigachat|llm|нейро/)) gaps.push('Внешний сервис ИИ включён, но не указан среди получателей данных.');
  if (wh && !mention(new RegExp(hostOf(wh).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) && !mention(/crm|вебхук|веб-хук|webhook/)) gaps.push('Веб-хук подключён, но получатель не указан среди получателей данных.');
  if (!settings.retentionDays) gaps.push('Не задан срок хранения закрытых заявок (Настройки → Защита от спама и хранение).');
  if (!legal.storageInRussia) gaps.push('В документах не заявлено хранение данных в РФ (Документы → «Хранение в РФ») — включайте только после подтверждения.');
  return {
    operator: {name: rq.legalName || site.legalName || '', inn: rq.inn || '', ogrn: rq.ogrn || '', address: rq.legalAddress || '', ready: !!(rq.legalName && rq.inn && rq.ogrn && rq.legalAddress)},
    purposes: [
      {name: 'Ответ на обращения (вопрос, звонок, контакты)', data: 'имя, телефон, e-mail, сообщение', basis: 'согласие (п. 1 ч. 1 ст. 6)', storage: 'заявки (админка)'},
      {name: 'Партнёрство, запросы по товарам, запись на мероприятия, подбор ассортимента', data: 'имя, телефон, e-mail, город, организация, специализация, комментарий', basis: 'согласие; договор (п. 5 ч. 1 ст. 6)', storage: 'заявки (админка)'},
      {name: 'Рассылка новостей', data: 'e-mail', basis: 'согласие', storage: 'заявки типа «Подписка»'},
      {name: 'Аналитика посещаемости', data: 'cookie-идентификаторы, поведение на сайте', basis: 'согласие (уведомление о cookie)', storage: 'Яндекс Метрика'}
    ],
    stored: {fields: ['имя', 'телефон', 'e-mail', 'город', 'организация', 'специализация', 'сообщение', 'страница отправки', 'user-agent', 'хэш IP-адреса (не сам адрес)', 'отметка и версия согласия', 'заметки менеджеров'], retentionDays: settings.retentionDays || 0, inventory: L.inventory()},
    systems, gaps, docsVersion: legal.version || ''
  };
}
module.exports = {search, exportSubject, erase, registry};
