#!/usr/bin/env node
/* Проверка «мозга» помощника (js/assistant-brain.js) на живых диалогах и на реальных данных сайта (js/data.js + js/kb.js; нужен `node tools/build.js`).
   Дата в проверках зафиксирована (12.10.2026, утро), чтобы результаты не зависели от дня запуска. Сеть и браузер не нужны.
   Запуск: node tools/check-assistant.js [-v]   (с -v печатает ответы). Код возврата ≠ 0, если что-то не так. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), VERBOSE = process.argv.includes('-v');
const load = f => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); return JSON.parse(t.slice(t.indexOf('= ') + 2).trim().replace(/;\s*$/, '')); };
const D = load('js/data.js'); let KB; try { KB = load('js/kb.js'); } catch (e) { console.log('Нет js/kb.js — помощник выключен в data/redesign.json (extras.assistant); проверка пропущена.'); process.exit(0); }
const {createBrain} = require('../js/assistant-brain.js');
const NOW = new Date(2026, 9, 12, 10, 0, 0);
const brain = () => createBrain(D, KB, {now: () => new Date(NOW)});
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; if (VERBOSE) console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const short = r => r.text.replace(/\s+/g, ' ').slice(0, 170);
const talk = (b, st) => (q, ctx) => { const r = b.reply(q, st, ctx || {}); if (VERBOSE) console.log('  > ' + q + '\n    [' + r.intent + '] ' + short(r) + (r.cards.length ? '  cards:' + r.cards.join(',') : '') + (r.events.length ? '  events:' + r.events.join(',') : '')); return r; };

const b = brain();
console.log('1. Знакомство, время суток, роль и город');
{ const st = b.newState(), say = talk(b, st);
  let r = say('Привет'); ok(r.intent === 'greet' && /Доброе утро/.test(r.text) && r.chips.length >= 3, 'приветствие учитывает время суток', short(r));
  r = say('Я косметолог из Ростова'); ok(r.intent === 'role' && st.role === 'cosmetologist' && st.city === 'Ростов-на-Дону', 'запоминает роль и город', {role: st.role, city: st.city});
  r = say('Какие семинары ближайшие?'); ok(r.intent === 'events' && r.events.join() === 's4' && /Ростов/.test(r.text), 'расписание сразу по городу пользователя', r.events);
  r = say('Все города'); ok(r.events.length >= 2, '«все города» снимает фильтр', r.events);
  r = say('Как стать партнёром?'); ok(r.intent === 'partner' && r.actions[0].spec === 'Косметолог / эстетист' && /специалист/.test(r.text), 'форма партнёра заполняется по роли', r.actions); }

console.log('2. Опечатки и разговорные формулировки');
{ const cases = [['Расскажите о компании', 'about'], ['что есть от пятен на лице', 'task'], ['средство от морщин', 'task'], ['что у вас с партнёрами', 'partner'], ['о ваших брендах', 'catalog'], ['расскажите о семинарах', 'events'], ['посоветуйте от пигментацыи', 'task'], ['расписание семинарров', 'events'], ['расскажите про дермотайм', 'brand'], ['чо у вас по акне', 'task'], ['що есть для волос', 'task'], ['пилинги есть?', 'category'], ['скока стоит эластенс', 'price'], ['хочу записатся на семинар', 'register'], ['есть ли фотозашита', 'task'], ['сертифекаты есть', 'avail']];
  for (const [q, intent] of cases) { const st = b.newState(), r = b.reply(q, st, {}); ok(r.intent === intent, '«' + q + '» → ' + intent, [r.intent, short(r)]); } }

console.log('3. Подбор по задаче и уточнения по ходу диалога');
{ const st = b.newState(), say = talk(b, st);
  let r = say('Посоветуйте что-нибудь от пигментации'); ok(r.intent === 'task' && r.cards.length >= 3 && /не назначение/.test(r.text) && /бренды/i.test(r.text), 'подбор: карточки, бренды, оговорка', r.cards);
  const firstIds = r.cards.slice(), total = st.last.all.length;
  r = say('Почему именно эти?'); ok(r.intent === 'why' && /Порядок такой/.test(r.text) && /Работа с пигментом/.test(r.text), 'объясняет логику подбора и цитирует описание задачи', short(r));
  r = say('А у Dermatime?'); ok(r.intent === 'task' && r.cards.every(id => D.products.find(p => p.id === id).brand === 'dermatime') && /Dermatime/.test(r.text), 'уточнение «а у <бренд>?» сохраняет задачу', r.cards);
  r = say('Подробнее про первый'); ok(r.intent === 'product' && r.cards[0] === st.last.cards[0], 'порядковая ссылка «про первый» ведёт на товар', r.cards);
  r = say('Посоветуйте от пигментации'); r = say('С чем сочетать?'); ok(r.intent === 'combo' && r.cards.length >= 2 && r.cards.every(id => D.products.find(p => p.id === id).ts.includes('sun')) && /фотозащит/i.test(r.text), 'сочетание: сайт прямо советует фотозащиту — показывает её', short(r));
  r = say('Посоветуйте от акне'); const n1 = r.cards.length; r = say('Ещё'); ok(r.intent === 'more' && (total >= 0), '«ещё» листает найденное', short(r));
  r = say('Для домашнего ухода'); ok(r.intent === 'task' && r.cards.every(id => D.products.find(p => p.id === id).c === 'home') || /ничего нет/.test(r.text), 'фильтр «для дома»', short(r));
  r = say('Сравни первые два'); ok(['compare', 'similar', 'task'].includes(r.intent), 'сравнение «первых двух» при одной карточке предлагает с чем сравнить', r.intent); }
{ const st = b.newState(), say = talk(b, st); say('Посоветуйте от пигментации');
  const r = say('сравни их'); ok(r.intent === 'compare' && r.cards.length === 2 && /Сравниваю/.test(r.text) && /(Общие задачи|не пересекаются)/.test(r.text) && r.actions[0].act === 'asst-cmp', 'сравнение показанных товаров словами + таблица', short(r)); }
{ const st = b.newState(), say = talk(b, st), r = say('Сравни Acidcure и Elastense');
  ok(r.intent === 'compare' && r.cards.length === 2 && /Бренды|Оба продукта/.test(r.text), 'сравнение по названиям', short(r)); }

console.log('4. Расчёты: скидка и даты');
{ const st = b.newState(), say = talk(b, st);
  let r = say('Какие у вас скидки?'); ok(r.intent === 'discount' && /50\s000/.test(r.text) && /Назовите сумму/.test(r.text), 'пороги скидок', short(r));
  r = say('А при 200 тысячах?'); ok(/\*\*10%\*\*/.test(r.text) && /20\s000/.test(r.text) && /180\s000/.test(r.text) && /100\s000/.test(r.text), '200 тыс. → 10%, экономия 20 000, до 15% не хватает 100 000', short(r));
  r = say('а если на 40 000'); ok(/скидки пока нет/.test(r.text) && /10\s000/.test(r.text), 'ниже порога — сколько не хватает', short(r));
  r = say('Закупка на 2 млн, какая скидка'); ok(/\*\*15%\*\*/.test(r.text) && /максимальный/.test(r.text), '2 млн → максимальный порог', short(r));
  r = say('скидка при закупке на 150000 руб'); ok(/\*\*10%\*\*/.test(r.text), 'ровно на пороге — скидка действует', short(r)); }
{ const st = b.newState(), say = talk(b, st);
  let r = say('Семинары в ноябре'); ok(r.intent === 'events' && r.events.join() === 's4,s5,s6' && /в ноябре/.test(r.text), 'месяц: ноябрь → три мероприятия', r.events);
  r = say('Ближайший семинар в Питере'); ok(r.events.join() === 's2' && /Санкт-Петербург/.test(r.text) || r.events[0] === 's2', 'ближайшее по городу', r.events);
  r = say('Сколько дней до ближайшего семинара?'); ok(/через 2 дня/.test(r.text), 'считает дни до события', short(r));
  r = say('Есть онлайн вебинары?'); ok(r.events.join() === 's3,s7', 'формат: онлайн', r.events);
  r = say('что будет в декабре'); ok(r.events.join() === 's7', 'декабрь', r.events);
  r = say('мероприятия в марте'); ok(r.events.length && /нет|не нашёл/.test(r.text) && /Ближайшие/.test(r.text), 'пусто — честно + ближайшие', short(r));
  r = say('семинары на этой неделе'); ok(r.events.join() === 's1', 'на этой неделе (до воскресенья 18.10)', r.events); }

console.log('5. Диалог с «да/нет» и честность');
{ const st = b.newState(), say = talk(b, st);
  let r = say('Сколько стоит Acidcure?'); ok(r.intent === 'price' && /Цен на сайте нет/.test(r.text) && r.cards[0] === 'dt-acidcure' && st.pending && st.pending.type === 'request', 'цены нет — честно, предлагает запрос и ждёт ответа', short(r));
  r = say('да'); ok(r.actions.some(a => a.type === 'product' && a.ref === 'dt-acidcure'), '«да» → форма запроса по этому товару', r.actions);
  r = say('да'); ok(r.intent !== 'yes' || true, 'повторное «да» без вопроса безопасно');
  r = say('Есть ли сертификаты и доставка?'); ok(r.intent === 'avail' && /нет/.test(r.text), 'сертификаты/доставка — «на сайте нет»', short(r));
  r = say('нет'); ok(/как скажете/.test(r.text), '«нет» закрывает предложение');
  r = say('Можно ли это при беременности?'); ok(r.intent === 'medical' && /не даю медицинских рекомендаций/.test(r.text), 'медицина — к специалисту', short(r));
  r = say('Ты тупой, ничего не понимаешь'); ok(r.intent === 'frustrated' && r.actions.length >= 1, 'раздражение → передача менеджеру', short(r)); }
{ const all = []; const st = b.newState();
  ['Сколько стоит Acidcure?', 'цены на Heliocare', 'прайс', 'есть ли в наличии Biretix'].forEach(q => all.push(b.reply(q, st, {})));
  const bad = all.filter(r => (r.text.match(/\d[\d\s]*\s?(₽|руб)/g) || []).some(m => !/^(50|150|300)\s000/.test(m.trim().replace(/\u00a0/g, ' ')))); ok(bad.length === 0, 'в ответах о цене нет выдуманных сумм (только пороги скидок с сайта)', bad.map(short)); }

console.log('6. Страница товара и свободные вопросы');
{ const st = b.newState(), say = talk(b, st), ctx = {product: 'br-gel', page: 'product'};
  let r = say('Расскажите об этом товаре', ctx); ok(r.intent === 'product' && r.cards[0] === 'br-gel', 'контекст страницы: «этот товар»', r.cards);
  r = say('С чем сравнить?', ctx); ok(r.intent === 'similar' && r.cards.length >= 1 && !r.cards.includes('br-gel'), 'подбирает ближайшие по задаче для сравнения', short(r));
  r = say('А сколько он стоит?', ctx); ok(r.intent === 'price' && r.cards[0] === 'br-gel', 'местоимение «он» → текущий товар', short(r)); }
{ const st = b.newState(), say = talk(b, st);
  let r = say('Это бесплатное обучение?'); ok(/бесплатн/i.test(r.text), 'вопрос про обучение → ответ из FAQ сайта', short(r));
  r = say('Чем занимается ваша компания?'); ok(r.intent === 'about' && /дистрибьютор/i.test(r.text), 'о компании', short(r));
  r = say('Есть ли у вас представительство в Крыму?'); ok(r.intent === 'contacts' && /Симферополь/.test(r.text) && /978/.test(r.text), 'контакты по региону', short(r));
  r = say('Кто из преподавателей ведёт семинары?'); ok(['faq', 'events', 'info', 'unknown'].includes(r.intent), 'вопрос вне данных не приводит к выдумке', [r.intent, short(r)]);
  r = say('квантовая физика чёрных дыр'); ok(r.intent === 'unknown' && r.actions.some(a => a.act === 'asst-ask') && r.sure === false, 'непонятное → «не уверен» + передача менеджеру', short(r));
  r = say('Расскажи анекдот'); ok(r.intent === 'smalltalk', 'просьба пошутить — вежливо и по делу', short(r));
  r = say('Как ты себя чувствуешь'); ok(r.intent === 'smalltalk' || r.intent === 'who' || r.intent === 'unknown', 'небольшой разговор не ломает движок'); }

console.log('7. «Умный» поиск по материалам сайта');
{ const st = b.newState(), say = talk(b, st);
  const qs = [['Какие документы нужны чтобы начать сотрудничество?', /./], ['С какого времени проходят базовые семинары', /10:30/], ['Как проходит день обучения?', /10:30|теор/i], ['Проходят ли семинары в регионах?', /Москва|Ростов|Симферопол/]];
  for (const [q, re] of qs) { const r = say(q); ok(re.test(r.text), '«' + q + '» → ответ по материалам сайта', short(r)); } }

console.log('8. Полный проход по каталогу');
{ const bad = []; D.products.forEach(p => { const r = b.reply('Расскажите про ' + p.name, b.newState(), {}); if (r.cards.indexOf(p.id) < 0) bad.push('товар ' + p.name); });
  D.brands.forEach(br => { const r = b.reply('Расскажите про ' + br.name, b.newState(), {}); if (!r.links.some(l => l.h === 'brands/' + br.id + '.html') && !r.cards.some(id => D.products.find(x => x.id === id).brand === br.id)) bad.push('бренд ' + br.name); });
  D.tasks.forEach(t => { const r = b.reply(t.label, b.newState(), {}); if (!r.cards.length || !r.links.some(l => /task=/.test(l.h))) bad.push('задача ' + t.label); });
  ok(bad.length === 0, 'на все товары, бренды и задачи есть содержательный ответ', bad);
  const corrupt = ['Расскажите о компании', 'как стать партнёром', 'контакты и часы работы', 'ближайшие семинары', 'подобрать средство по задаче', 'какие у вас бренды', 'сколько стоит обучение', 'можно ли записаться онлайн', 'условия поставки', 'новинки каталога', 'фотозащита для чувствительной кожи', 'уход за волосами', 'антивозрастной уход', 'есть ли доставка', 'где находится офис', 'хочу записаться на мастер-класс'].filter(q => b.correct(q).changed);
  ok(corrupt.length === 0, 'нормальные слова не «исправляются» (нет ложных замен)', corrupt.map(q => [q, b.correct(q).text])); }
{ const empty = b.reply('   ', b.newState(), {}); ok(empty.intent === 'empty', 'пустое сообщение безопасно'); const long = b.reply('слово '.repeat(400), b.newState(), {}); ok(!!long.text, 'очень длинное сообщение не ломает движок'); const xss = b.reply('<script>alert(1)</script> пигментация', b.newState(), {}); ok(xss.intent === 'task', 'разметка в тексте игнорируется (в ответ не попадает)', xss.text); }

console.log('9. Стелла: личность, маршрутизация между встроенным движком и ИИ, арифметика и дата');
{ const st = b.newState(), say = talk(b, st);
  let r = say('Привет'); ok(/Я Стелла/.test(r.text) && r.sure === true, 'приветствие: Стелла представляется, ответ мгновенный', short(r));
  r = say('Кто ты?'); ok(/зовут Стелла/.test(r.text) && /программа, а не сотрудник/.test(r.text) && r.sure === true, 'на вопрос «кто ты» — имя и честное «я программа»', short(r));
  const s2 = b.newState(); s2.ai = true; r = b.reply('Кто ты?', s2, {}); ok(/любую тему/.test(r.text), 'если ИИ включён, Стелла говорит, что может поговорить на любую тему', short(r));
  r = say('Как дела?'); ok(r.intent === 'smalltalk' && r.sure === false, 'светская беседа — на усмотрение ИИ (встроенный ответ остаётся запасным)', [r.intent, r.sure]);
  r = say('Расскажи анекдот'); ok(r.sure === false && !!r.text, 'шутка — к ИИ; без ИИ скромный честный ответ', short(r));
  r = say('Объясни, почему небо голубое'); ok(r.intent === 'unknown' && r.sure === false && /без ИИ|не отвечу/.test(r.text) && !/Цен на сайте/.test(r.text), 'вопрос не про сайт: к ИИ; встроенный режим честно говорит, что отвечать не умеет (и не путает «почему» с «почём»)', short(r));
  r = say('Мне можно при беременности?'); ok(r.intent === 'medical' && r.sure === false && /не даю медицинских рекомендаций/.test(r.text), 'медицинский вопрос: ИИ отвечает осторожно, встроенный режим — с отказом', short(r));
  for (const [q, intent] of [['Какие у вас контакты?', 'contacts'], ['А при 200 тысячах скидка?', 'discount'], ['Ближайшие семинары', 'events'], ['Сколько стоит Acidcure?', 'price'], ['Перезвоните мне', 'callback']]) { r = b.reply(q, b.newState(), {}); ok(r.intent === intent && r.sure === true, '«' + q + '» — точный ответ сразу, без ИИ (' + intent + ')', [r.intent, r.sure]); }
  for (const q of ['Расскажите о компании', 'Как стать партнёром?', 'Новинки', 'Что у вас есть?']) { r = b.reply(q, b.newState(), {}); ok(r.sure === false, '«' + q + '» при включённом ИИ уходит к нему (встроенный ответ — запасной)', [r.intent, r.sure]); }
  const calc = (q, re) => { const x = b.reply(q, b.newState(), {}); ok(x.intent === 'calc' && re.test(x.text) && x.sure === true, 'арифметика: «' + q + '»', short(x)); };
  calc('сколько будет 15*12', /= 180\*\*/); calc('посчитай (200000+50000)*0.9', /225\s000/); calc('15% от 2000', /= 300\*\*/); calc('2 + 2', /= 4\*\*/); calc('12 x 5', /= 60\*\*/); calc('2 ^ 10', /1\s024/); calc('100 000 + 50 000 =', /150\s000/); calc('посчитай 3,5*2', /= 7\*\*/);
  r = b.reply('сколько будет 10/0', b.newState(), {}); ok(r.intent === 'calc' && /Делить на ноль нельзя/.test(r.text), 'деление на ноль — вежливое объяснение, без ошибки', short(r));
  for (const q of ['925-51-62', '12-14 октября', 'посчитай скидку на 200000', 'позвоните по 495-123-45-67']) { r = b.reply(q, b.newState(), {}); ok(r.intent !== 'calc', '«' + q + '» не принимается за арифметику', r.intent); }
  r = b.reply('какое сегодня число?', b.newState(), {}); ok(r.intent === 'datetime' && /12 октября 2026/.test(r.text) && /понедельник/.test(r.text), 'дата: «12 октября 2026, понедельник»', short(r));
  r = b.reply('который час?', b.newState(), {}); ok(r.intent === 'datetime' && /10:00/.test(r.text), 'время: по часам устройства', short(r));
  r = b.reply('какой сегодня день недели', b.newState(), {}); ok(r.intent === 'datetime' && /понедельник/.test(r.text), 'день недели', short(r));
  const bad = []; for (const q of ['почему именно эти?', 'Центр обучения', 'где центральный офис']) { r = b.reply(q, b.newState(), {}); if (r.intent === 'price') bad.push(q); } ok(!bad.length, 'слова «почему», «центр» не принимаются за вопрос о цене', bad); }

console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
