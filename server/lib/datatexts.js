/* Тексты, которые лежат не в шаблонах, а в данных (data/content.json, data/redesign.json): заголовки героя, подписи блоков, вопросы-ответы, SEO страниц, подвал, формы.
   Здесь они собираются в те же «страница → блок → поле», что и тексты шаблонов, а запись идёт обратно в свои файлы (с проверкой раздела и пересборкой сайта). */
'use strict';
const path = require('path');
const C = require('./config');
const {readJSON} = require('./util');
const {httpErr} = require('./auth');
const CT = require('./content');

const CYR = /[А-Яа-яЁё]/;
/* какие корневые ключи файла на какую страницу попадают: [страница, заголовок блока] */
const MAP = {
  content: {
    seo: ['seo', null], home: ['home', 'Данные: первый экран, цифры, «О нас»'], advantages: ['home', 'Данные: преимущества'], partners: ['partners', 'Данные: карточки, шаги, форматы практики, вопросы'], company: ['company', 'Данные: «Кто мы», направления, специалисты'],
    forms: ['forms', null], legal: ['legal', 'Данные: тексты документов'], searchHints: ['search', 'Данные: подсказки поиска']
  },
  redesign: {
    photos: ['home', 'Данные: описания фото'], stats: ['home', 'Данные: «Астрея в цифрах»'], why: ['home', 'Данные: «Почему Астрея»'], solutions: ['home', 'Данные: «Решения»'], wall: ['home', 'Данные: галерея брендов'], editorial: ['home', 'Данные: редакционный блок'],
    training: ['home', 'Данные: обучение на главной'], audience: ['home', 'Данные: «Для кого»'], homePath: ['home', 'Данные: «Маршрут партнёра»'], finalCta: ['home', 'Данные: финальный призыв'], house: ['home', 'Данные: журнал ASTREYA и комнаты дома'], picker: ['catalog', 'Данные: подбор по задаче'],
    footer: ['layout', 'Данные: подвал (колонки и подписи)'], brandsPage: ['brands', 'Данные: страница «Бренды»'], teachers: ['training', 'Данные: преподаватели'], trainingPage: ['training', 'Данные: страница «Обучение»']
  }
};
const SEO_NAMES = {index: 'Главная', catalog: 'Каталог', brands: 'Бренды', training: 'Обучение', news: 'Новости', company: 'Компания', contacts: 'Контакты', partners: 'Партнёрам', search: 'Поиск', privacy: 'Политика конфиденциальности', consent: 'Согласие на обработку данных', terms: 'Пользовательское соглашение'};
const FORM_NAMES = {partner: 'Стать партнёром', seminar: 'Запись на мероприятие', product: 'Запрос по товару', question: 'Вопрос', callback: 'Обратный звонок', subscribe: 'Подписка на новости', plan: 'План закупки (Стелла)', contact: 'Форма на странице «Контакты»'};
const PAGE_TITLES = {forms: 'Формы заявок (заголовки, кнопки, согласие)'};
const KEYS = {eyebrow: 'Надпись над заголовком', h1: 'Заголовок страницы', h2: 'Заголовок раздела', title: 'Заголовок', lead: 'Вводный абзац', text: 'Текст', p: 'Абзац', sub: 'Подзаголовок', cta: 'Кнопка', label: 'Подпись', alt: 'Описание картинки (для незрячих)', q: 'Вопрос', a: 'Ответ', desc: 'Описание', description: 'Описание', name: 'Название', tab: 'Название вкладки', note: 'Примечание', role: 'Должность', bio: 'Краткое био', first: 'Имя и отчество', last: 'Фамилия', tag: 'Метка', tags: 'Метка', chip: 'Подсказка', value: 'Значение', suffix: 'Единица', placeholder: 'Подсказка в поле', subject: 'Тема письма', submit: 'Текст кнопки', ph: 'Подсказка в поле', agree: 'Подпись у согласия', done: 'Сообщение после отправки', empty: 'Если пусто', more: 'Ссылка «Ещё»', lead2: 'Второй абзац', cap: 'Подпись к фото', caption: 'Подпись к фото', topic: 'Тема', intro: 'Вступление', kicker: 'Надпись', head: 'Заголовок', btn: 'Кнопка', hint: 'Подсказка', items: 'Пункты', links: 'Ссылки', columns: 'Колонки', tagline: 'Девиз', short: 'Коротко'};
const SKIP_KEY = /^(_|id$|slug$|icon$|key$|href$|url$|src$|image$|photo$|logo$|tex$|pos$|sel$|ref$|type$|c1$|c2$|ink$|color$|angle$|width$|orbit$|brand$|brands$|query$)/;
const looksTech = s => /^(assets\/|https?:|#|\/|[\w.-]+\.html|[\w-]+$)/.test(s) && !/\s/.test(s) && s.length < 40 && !CYR.test(s);

function leaves(node, trail, out, ctxLabel) {
  if (typeof node === 'string') { if (CYR.test(node) && !looksTech(node)) out.push({path: trail.slice(), value: node, ctx: ctxLabel}); return; }
  if (Array.isArray(node)) { node.forEach((x, i) => { const own = x && typeof x === 'object' && !Array.isArray(x) ? ['title', 'name', 'tab', 'q', 'label', 'first'].map(k => x[k]).find(v => typeof v === 'string' && v.trim()) : null; leaves(x, trail.concat(i), out, own ? '«' + String(own).slice(0, 36) + '»' : '№' + (i + 1)); }); return; }
  if (node && typeof node === 'object') Object.keys(node).forEach(k => { if (SKIP_KEY.test(k)) return; leaves(node[k], trail.concat(k), out, ctxLabel); });
}
const labelOf = (p, ctx) => {
  const keys = p.filter(x => typeof x === 'string'), last = keys[keys.length - 1] || '';
  const base = KEYS[last] || last, nums = p.some(x => typeof x === 'number');
  return (ctx && nums ? ctx + ' · ' : '') + base + (keys.length > 1 && !KEYS[last] ? '' : '');
};
const SEC = {benefits: 'карточки преимуществ', steps: 'шаги', specializations: 'форматы практики', audience: 'для кого', faq: 'вопросы и ответы', who: 'кто мы', directions: 'направления', professionals: 'специалисты', orbits: 'логотипы на орбитах', card: 'карточка', facts: 'факты', about: 'о нас', items: 'пункты', hero: 'первый экран', hall: 'зал', reader: 'журнал', mag: 'журнал: страницы', rooms: 'комнаты', arch: 'арка', academy: 'академия', roles: 'роли', proof: 'доверие', finder: 'подбор', teachers: 'преподаватели', gallery: 'галерея', wall: 'стена', groups: 'группы', ask: 'вопрос помощнику', tasks: 'задачи', panel: 'панель', plate: 'плита'};
const SPLIT = new Set(['seo', 'forms', 'legal']);
const blockKey = (coll, p) => SPLIT.has(p[0]) && coll === 'content' ? p[0] + '.' + p[1] : (p.length > 2 && typeof p[1] === 'string' ? p[0] + '.' + p[1] : p[0]);

function fields() {
  const pages = new Map(), versions = {};
  for (const coll of Object.keys(MAP)) {
    let data; try { const r = CT.read(coll); data = r.data; versions[coll] = r.version; } catch (e) { continue; }
    const all = []; Object.keys(MAP[coll]).forEach(top => { if (data[top] !== undefined) leaves(data[top], [top], all, ''); });
    for (const lf of all) {
      const top = lf.path[0], [pid, btitle] = MAP[coll][top], bk = blockKey(coll, lf.path);
      let title = btitle; if (top === 'seo') title = 'Страница «' + (SEO_NAMES[lf.path[1]] || lf.path[1]) + '»: заголовок и описание'; else if (top === 'forms') title = 'Форма «' + (FORM_NAMES[lf.path[1]] || lf.path[1]) + '»'; else if (top === 'legal') title = 'Документ «' + (SEO_NAMES[lf.path[1]] || lf.path[1]) + '»'; else if (bk.includes('.')) title = btitle + ' › ' + (SEC[lf.path[1]] || lf.path[1]);
      const pg = pages.get(pid) || pages.set(pid, {id: pid, title: PAGE_TITLES[pid] || null, blocks: new Map()}).get(pid);
      const bl = pg.blocks.get(coll + ':' + bk) || pg.blocks.set(coll + ':' + bk, {id: 'd-' + coll + '-' + bk.replace(/\./g, '-'), title, fields: []}).get(coll + ':' + bk);
      const multi = lf.value.includes('\n') || lf.value.length > 110;
      bl.fields.push({id: coll + ':' + lf.path.join('.'), coll, path: lf.path, label: labelOf(lf.path.slice(top === 'seo' || top === 'forms' || top === 'legal' ? 2 : 1), lf.ctx) || 'Текст', value: lf.value, type: multi ? 'text' : 'line'});
    }
  }
  return {pages: [...pages.values()].map(p => ({id: p.id, title: p.title, blocks: [...p.blocks.values()]})), versions};
}

const getAt = (o, p) => p.reduce((a, k) => (a == null ? undefined : a[k]), o);
const ACTIVE = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form|svg)\b|javascript:|\bon\w+\s*=|data:text\/html/i;
/* запись правок: [{coll, path, from, value}] → в свои файлы; чужие правки (текущее значение не равно «from») не затираются */
async function apply(changes, who) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 500) throw httpErr(400, 'Нет правок или их слишком много.');
  const byColl = {};
  for (const c of changes) {
    if (!MAP[c.coll] || !Array.isArray(c.path) || !c.path.length || c.path.some(k => typeof k !== 'string' && typeof k !== 'number') || c.path[0] === '__proto__' || typeof c.value !== 'string') throw httpErr(400, 'Некорректная правка текста.');
    if (!MAP[c.coll][c.path[0]]) throw httpErr(400, 'Этот раздел данных здесь не правится.');
    if (!c.value.trim()) throw httpErr(422, 'Текст не может быть пустым: ' + c.path.join(' › ') + ' (чтобы вернуть прежний, нажмите «Вернуть как было»).');
    if (c.value.length > 3000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(c.value)) throw httpErr(422, 'Слишком длинный текст или недопустимые символы: ' + c.path.join(' › '));
    if (ACTIVE.test(c.value)) throw httpErr(422, 'В тексте нельзя использовать скрипты, формы, встроенные кадры и обработчики событий: ' + c.path.join(' › '));
    (byColl[c.coll] = byColl[c.coll] || []).push(c);
  }
  const done = [];
  for (const [coll, list] of Object.entries(byColl)) {
    const cur = CT.read(coll), data = cur.data;
    for (const c of list) {
      const now = getAt(data, c.path); if (typeof now !== 'string') throw httpErr(400, 'Поля «' + c.path.join(' › ') + '» нет в данных.');
      if (c.from !== undefined && now !== c.from) throw httpErr(409, 'Текст «' + c.path.join(' › ') + '» уже изменил кто-то другой. Обновите страницу и повторите правку.');
      const parent = getAt(data, c.path.slice(0, -1)); parent[c.path[c.path.length - 1]] = c.value;
    }
    const r = await CT.save(coll, data, {version: cur.version, who}); done.push({coll, build: r.build, unchanged: !!r.unchanged});
  }
  return {ok: true, saved: done, build: done.map(d => d.build).filter(Boolean).pop() || null};
}
module.exports = {fields, apply};
