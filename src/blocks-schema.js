/* Страницы, созданные в админке (data/pages.json): допустимые блоки и проверка данных.
   Используется и сборкой сайта (src/pages/custom.js), и сервером админки (проверка перед сохранением). Только CommonJS, без зависимостей. */
'use strict';

const TYPES = {
  text:    {title: 'Текст',                 fields: ['title', 'paragraphs']},
  image:   {title: 'Картинка',              fields: ['src', 'alt', 'caption', 'wide']},
  cards:   {title: 'Карточки',              fields: ['eyebrow', 'title', 'cols', 'items']},
  list:    {title: 'Список с галочками',    fields: ['title', 'items']},
  columns: {title: 'Две колонки текста',    fields: ['title', 'left', 'right']},
  steps:   {title: 'Шаги',                  fields: ['eyebrow', 'title', 'items']},
  stats:   {title: 'Цифры',                 fields: ['items']},
  faq:     {title: 'Вопросы и ответы',      fields: ['eyebrow', 'title', 'items']},
  cta:     {title: 'Призыв к действию',     fields: ['eyebrow', 'title', 'text', 'label', 'href', 'tone']},
  form:    {title: 'Форма заявки',          fields: ['title', 'text', 'kind']}
};
const FORM_KINDS = ['partner', 'question', 'seminar', 'product'];
const TONES = ['dark', 'light'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['index', 'catalog', 'brands', 'training', 'news', 'company', 'contacts', 'partners', 'search', 'privacy', 'terms']);   // имена обычных страниц сайта
/* ссылка: страница сайта (about.html, pages/x.html, brands/eva.html#id), адрес http(s), телефон, почта или якорь; всё прочее (javascript:, data:) — недопустимо */
const hrefOk = v => v === '' || /^(https?:\/\/[^\s"'<>]+|tel:\+?[\d()\-\s]+|mailto:[^\s@"'<>]+@[^\s@"'<>]+|#[\w-]+|(?:[\w-]+\/)*[\w-]+\.html(?:#[\w-]+)?)$/.test(v);
const imgOk = v => v === '' || /^assets\/[\w\-./]+\.(png|jpe?g|webp|gif|svg)$/i.test(v);
const isStr = v => typeof v === 'string';
const strs = v => Array.isArray(v) && v.every(isStr);
const len = (s, n) => isStr(s) && s.length <= n;

/* проверка одного блока; возвращает список проблем (пустой — блок корректен) */
function blockProblems(b, where) {
  const P = [], t = b && b.type;
  if (!b || typeof b !== 'object' || !TYPES[t]) return [`${where}: неизвестный тип блока «${t}».`];
  const need = (k, max) => { if (!isStr(b[k]) || !b[k].trim()) P.push(`${where}: заполните «${k}».`); else if (b[k].length > max) P.push(`${where}: «${k}» длиннее ${max} символов.`); };
  const opt = (k, max) => { if (b[k] !== undefined && b[k] !== '' && !len(b[k], max)) P.push(`${where}: «${k}» должно быть текстом до ${max} символов.`); };
  const items = (min, max, each) => { if (!Array.isArray(b.items) || b.items.length < min) P.push(`${where}: добавьте хотя бы ${min} пункт.`); else if (b.items.length > max) P.push(`${where}: не больше ${max} пунктов.`); else b.items.forEach((it, i) => each(it, `${where}, пункт ${i + 1}`)); };
  switch (t) {
    case 'text': opt('title', 120); if (!strs(b.paragraphs) || !b.paragraphs.some(x => x.trim())) P.push(`${where}: добавьте хотя бы один абзац.`); else if (b.paragraphs.some(x => x.length > 4000)) P.push(`${where}: абзац длиннее 4000 символов.`); break;
    case 'image': if (!isStr(b.src) || !imgOk(b.src) || !b.src) P.push(`${where}: выберите картинку из папки assets/.`); opt('alt', 200); opt('caption', 200); if (b.alt === undefined || (isStr(b.alt) && !b.alt.trim() && !b.decorative)) P.push(`${where}: опишите картинку (alt) — для читающих с экрана и поиска.`); break;
    case 'cards': opt('eyebrow', 60); need('title', 120); items(1, 12, (it, w) => { if (!it || !isStr(it.title) || !it.title.trim()) P.push(`${w}: нужен заголовок.`); if (it && it.text !== undefined && !len(it.text, 600)) P.push(`${w}: текст длиннее 600 символов.`); if (it && it.href !== undefined && !hrefOk(it.href)) P.push(`${w}: недопустимая ссылка «${it.href}».`); if (it && it.image !== undefined && !imgOk(it.image)) P.push(`${w}: картинка должна лежать в assets/.`); }); if (b.cols !== undefined && ![2, 3, 4].includes(+b.cols)) P.push(`${where}: колонок может быть 2, 3 или 4.`); break;
    case 'list': opt('title', 120); if (!strs(b.items) || !b.items.some(x => x.trim())) P.push(`${where}: добавьте хотя бы один пункт.`); else if (b.items.length > 30) P.push(`${where}: не больше 30 пунктов.`); break;
    case 'columns': opt('title', 120); if (!strs(b.left) || !strs(b.right) || !(b.left.some(x => x.trim()) || b.right.some(x => x.trim()))) P.push(`${where}: заполните хотя бы одну колонку.`); break;
    case 'steps': opt('eyebrow', 60); need('title', 120); items(1, 8, (it, w) => { if (!it || !isStr(it.title) || !it.title.trim()) P.push(`${w}: нужен заголовок.`); if (it && it.text !== undefined && !len(it.text, 500)) P.push(`${w}: текст длиннее 500 символов.`); }); break;
    case 'stats': items(1, 6, (it, w) => { if (!it || !isStr(it.value) || !it.value.trim() || it.value.length > 12) P.push(`${w}: «значение» — до 12 символов.`); if (!it || !isStr(it.label) || !it.label.trim() || it.label.length > 80) P.push(`${w}: «подпись» — до 80 символов.`); }); break;
    case 'faq': opt('eyebrow', 60); need('title', 120); items(1, 30, (it, w) => { if (!it || !isStr(it.q) || !it.q.trim()) P.push(`${w}: нужен вопрос.`); if (!it || !isStr(it.a) || !it.a.trim()) P.push(`${w}: нужен ответ.`); }); break;
    case 'cta': opt('eyebrow', 60); need('title', 120); opt('text', 400); need('label', 40); if (!isStr(b.href) || !b.href || !hrefOk(b.href)) P.push(`${where}: укажите корректную ссылку кнопки.`); if (b.tone !== undefined && !TONES.includes(b.tone)) P.push(`${where}: оформление — dark или light.`); break;
    case 'form': opt('title', 120); opt('text', 400); if (!FORM_KINDS.includes(b.kind)) P.push(`${where}: вид формы — ${FORM_KINDS.join(', ')}.`); break;
  }
  return P;
}
/* проверка списка страниц: уникальные адреса, обязательные поля, блоки */
function pageProblems(items, opts) {
  opts = opts || {}; const P = [], seen = new Set();
  if (!Array.isArray(items)) return ['Ожидается список страниц.'];
  items.forEach((p, i) => {
    const w = `Страница «${(p && (p.title || p.slug)) || '№' + (i + 1)}»`;
    if (!p || typeof p !== 'object') { P.push(`Страница №${i + 1}: пустая запись.`); return; }
    if (!isStr(p.slug) || !SLUG.test(p.slug)) P.push(`${w}: адрес (slug) — строчные латинские буквы, цифры и дефисы.`);
    else if (RESERVED.has(p.slug)) P.push(`${w}: адрес «${p.slug}» занят служебной страницей сайта.`);
    else if (seen.has(p.slug)) P.push(`${w}: адрес «${p.slug}» уже используется.`); else seen.add(p.slug);
    if (!isStr(p.title) || !p.title.trim()) P.push(`${w}: нет заголовка.`); else if (p.title.length > 120) P.push(`${w}: заголовок длиннее 120 символов.`);
    if (p.description !== undefined && !len(p.description, 300)) P.push(`${w}: описание для поиска длиннее 300 символов.`);
    if (p.eyebrow !== undefined && !len(p.eyebrow, 60)) P.push(`${w}: надпись над заголовком длиннее 60 символов.`);
    if (p.lead !== undefined && !len(p.lead, 500)) P.push(`${w}: подводка длиннее 500 символов.`);
    if (p.nav && (!isStr(p.navTitle) || !p.navTitle.trim() || p.navTitle.length > 24)) P.push(`${w}: для пункта меню нужно короткое название (до 24 символов).`);
    if (!Array.isArray(p.blocks)) P.push(`${w}: нет списка блоков.`); else if (p.blocks.length > 60) P.push(`${w}: не больше 60 блоков.`); else p.blocks.forEach((b, j) => blockProblems(b, `${w}, блок ${j + 1} «${(TYPES[b && b.type] || {}).title || (b && b.type)}»`).forEach(x => P.push(x)));
  });
  if (items.filter(p => p && p.nav && p.published !== false).length > 4) P.push('В меню сайта не больше четырёх своих страниц (всего пунктов — до 9).');
  return P;
}
module.exports = {TYPES, FORM_KINDS, TONES, SLUG, RESERVED, hrefOk, imgOk, blockProblems, pageProblems};
