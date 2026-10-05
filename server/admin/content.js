/* Раздел «Содержимое сайта»: правка data/*.json через формы.
   — товары, бренды, мероприятия, новости: список + окно правки одной записи (добавить, изменить, дублировать, удалить);
   — тексты страниц, настройки, главная, каталог-справочники, обучение: разделы-аккордеоны с общим редактором.
   Любое сохранение проверяется сервером, пересобирает сайт и откатывается, если сайт не собрался. */
(function () {
  'use strict';
  const {h, $, $$} = AD;

  /* ---------- словари: подписи, ссылки на другие разделы, образцы для пустых полей ---------- */
  const LABELS = {id: 'Идентификатор (id)', slug: 'Адрес страницы (slug)', name: 'Название', title: 'Заголовок', desc: 'Краткое описание', description: 'Описание', brand: 'Бренд', cat: 'Категория', kind: 'Вид продукта', type: 'Форма выпуска', tasks: 'Задачи ухода', isNew: 'Новинка', featured: 'Показывать на главной', volume: 'Объём', sku: 'Артикул', usage: 'Способ применения', indications: 'Показания', actives: 'Активные компоненты', docs: 'Документы', details: 'Описание (абзацы)', group: 'Группа', tag: 'Подзаголовок', c1: 'Цвет 1', c2: 'Цвет 2', ink: 'Цвет текста', site: 'Сайт', long: 'Подробный текст (абзацы)', facts: 'Факты', country: 'Страна', logo: 'Логотип', date: 'Дата', city: 'Город', fmt: 'Формат', time: 'Время', teacher: 'Преподаватель', speaker: 'Спикер', place: 'Место', seats: 'Количество мест', demo: 'Демонстрационные данные', category: 'Рубрика', excerpt: 'Анонс', body: 'Текст (абзацы)', cta: 'Кнопка', related: 'Связанные материалы', label: 'Название', note: 'Пояснение', text: 'Текст', lead: 'Подводка', eyebrow: 'Надпись над заголовком', h1: 'Заголовок страницы (H1)', email: 'E-mail', phone: 'Телефон', phoneRaw: 'Телефон для ссылки (цифры и +)', hours: 'Часы работы', address: 'Адрес', addressNote: 'Как добраться', whatsapp: 'WhatsApp', url: 'Адрес', formEndpoint: 'Адрес приёма заявок', tagline: 'Девиз', legalName: 'Юридическое название', nameLatin: 'Название латиницей', year: 'Год', lang: 'Язык сайта', redesign: 'Новое оформление включено', demoNotice: 'Пометка о демонстрационных данных', inn: 'ИНН', kpp: 'КПП', ogrn: 'ОГРН', legalAddress: 'Юридический адрес', phones: 'Телефоны', emails: 'E-mail', role: 'Роль', addr: 'Адрес', from: 'От (руб.)', pct: 'Скидка, %', topics: 'Темы', spec: 'Специализация', mono: 'Буква на аватаре', t: 'Заголовок', p: 'Текст', q: 'Вопрос', a: 'Ответ', dur: 'Длительность', min: 'Время чтения, мин', cities: 'Города', teachers: 'Преподаватели', steps: 'Шаги записи', faq: 'Частые вопросы', videos: 'Видео', articles: 'Статьи', cats: 'Категории', kinds: 'Виды продуктов', categories: 'Рубрики', items: 'Записи', src: 'Файл', alt: 'Описание картинки', w: 'Ширина', h: 'Высота', href: 'Ссылка', enabled: 'Включено', icon: 'Значок', stats: 'Цифры', seo: 'SEO', home: 'Главная', points: 'Пункты', orbits: 'Орбиты', value: 'Значение', suffix: 'Подпись к числу', count: 'Число', query: 'Параметры ссылки', brands: 'Бренды', products: 'Товары', events: 'Мероприятия', accent: 'Выделенные слова', pick: 'Какие показывать', extra: 'Дополнительно', perks: 'Преимущества', columns: 'Колонки', links: 'Ссылки', items_: 'Пункты', cue: 'Подсказка «Листайте»', skip: 'Кнопка «Пропустить»', lines: 'Строки', sub: 'Подзаголовок', ext: 'Внешние ссылки', contacts: 'Контакты', requisites: 'Реквизиты', offices: 'Офисы', discounts: 'Скидки по объёму', searchHints: 'Подсказки поиска', advantages: 'Преимущества', benefits: 'Выгоды', specializations: 'Специализации', directions: 'Направления', who: 'Кто мы', professionals: 'Работа с профессионалами', legal: 'Юридические страницы', privacy: 'Политика конфиденциальности', terms: 'Пользовательское соглашение', company: 'О компании', partners: 'Партнёрам', index: 'Главная', catalog: 'Каталог', brands_: 'Бренды', training: 'Обучение', news: 'Новости', contacts_: 'Контакты', search: 'Поиск'};
  const SECTIONS = {'content.seo': 'SEO: заголовки и описания страниц (то, что видно в поиске Google/Яндекса)', 'content.home': 'Главная страница: тексты', 'content.advantages': 'Преимущества', 'content.partners': 'Страница «Стать партнёром»', 'content.company': 'Страница «О компании»', 'content.legal': 'Политика и соглашение', 'content.searchHints': 'Подсказки в поиске',
    'site.contacts': 'Контакты (телефон, почта, часы работы)', 'site.requisites': 'Реквизиты компании', 'site.offices': 'Офисы и представительства', 'site.discounts': 'Скидки по объёму закупки (калькулятор)',
    'catalog.cats': 'Категории каталога', 'catalog.tasks': 'Задачи ухода', 'catalog.kinds': 'Виды продуктов', 'training.cities': 'Города обучения', 'training.teachers': 'Преподаватели', 'training.steps': 'Как записаться (шаги)', 'training.faq': 'Частые вопросы', 'training.videos': 'Видео', 'training.articles': 'Статьи',
    'redesign.jar': 'Вступление с баночкой (технический раздел — аккуратно)', 'redesign.photos': 'Фотографии на главной', 'redesign.stats': 'Цифры («Астрея в цифрах»)', 'redesign.why': 'Блок «Почему Астрея»', 'redesign.solutions': 'Блок «Решения по задачам»', 'redesign.wall': 'Блок «Наши бренды»', 'redesign.editorial': 'Блок «Экспертиза»', 'redesign.training': 'Блок «Учебный центр»', 'redesign.audience': 'Блок «Для кого Астрея»', 'redesign.finalCta': 'Блок «Хотите работать с Астреей?»', 'redesign.footer': 'Подвал сайта', 'redesign.brandsPage': 'Страница «Бренды»', 'redesign.picker': 'Подборщик решений', 'redesign.teachers': 'Преподаватели (страница «Обучение»)', 'redesign.ui': 'Служебные переключатели'};
  const label = k => LABELS[k] || k;
  const REFS = {
    'products.brand': {c: 'brands', v: 'id', t: 'name'}, 'products.cat': {c: 'catalog', l: 'cats', v: 'id', t: 'name'}, 'products.kind': {c: 'catalog', l: 'kinds', v: 'id', t: 'name'}, 'products.tasks': {c: 'catalog', l: 'tasks', v: 'id', t: 'label', multi: true},
    'events.brand': {c: 'brands', v: 'id', t: 'name', blank: '— без бренда —'}, 'events.teacher': {c: 'training', l: 'teachers', v: 'id', t: 'name', blank: '— не указан —'},
    'news.items.category': {c: 'news', l: 'categories', v: 'id', t: 'name'}, 'news.items.related.brands': {c: 'brands', v: 'id', t: 'name', multi: true}, 'news.items.related.products': {c: 'products', v: 'id', t: 'name', multi: true}, 'news.items.related.events': {c: 'events', v: 'id', t: 'title', multi: true},
    'catalog.tasks.brands': {c: 'brands', v: 'id', t: 'name', multi: true}, 'training.videos.brand': {c: 'brands', v: 'id', t: 'name', blank: '— без бренда —'}, 'training.articles.brand': {c: 'brands', v: 'id', t: 'name', blank: '— без бренда —'}
  };
  const ENUMS = {'news.items.cta.type': [['', '— без кнопки —'], ['partner', 'Рассчитать скидку (страница «Стать партнёром»)'], ['training', 'К расписанию'], ['catalog', 'В каталог'], ['product', 'Смотреть товар'], ['brand', 'О бренде'], ['event', 'О мероприятии'], ['contacts', 'Контакты']]};
  const PATH_LABELS = {'news.items.cta': 'Кнопка под статьёй', 'news.items.cta.type': 'Что открывает кнопка', 'news.items.cta.ref': 'id товара / бренда / мероприятия', 'news.items.cta.query': 'Параметры страницы (например task=sun)'};
  const SAMPLES = {products: {details: [''], indications: [''], actives: [''], usage: '', volume: '', sku: '', docs: [{title: '', url: ''}]}, events: {seats: 0}};
  const TEXTAREA_KEYS = new Set(['desc', 'description', 'text', 'excerpt', 'lead', 'usage', 'msg', 'a', 'p', 'note', 'sub', 'demoNotice', 'long', 'body', 'details', 'tag', 'spec', 'alt']);
  const IMAGE_KEYS = /^(logo|src|photo|image|img|poster)$/;
  const IMAGE_VAL = /^assets\/.+\.(png|jpe?g|webp|gif|svg)$/i;

  /* ---------- настройки списков ---------- */
  const TR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'};
  const slugify = s => String(s || '').toLowerCase().replace(/[а-яё]/g, c => TR[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const LISTS = {
    products: {noun: 'товар', neu: 'Новый', one: 'товара', title: 'Товары', path: null, label: 'name', url: x => 'products/' + x.slug + '.html', slugFrom: x => slugify((x.brand || '') + ' ' + (x.name || '')), idFrom: x => slugify((x.brand || '').slice(0, 2) + ' ' + (x.name || '')),
      order: ['name', 'brand', 'cat', 'kind', 'tasks', 'desc', 'slug', 'id', 'type', 'isNew', 'featured', 'volume', 'sku', 'usage', 'indications', 'actives', 'details', 'docs'], ensure: {actives: [], details: [], indications: [], docs: []},
      cols: [['Название', x => h('b', {}, x.name)], ['Бренд', (x, r) => r('products.brand', x.brand)], ['Категория', (x, r) => r('products.cat', x.cat)], ['Метки', x => [x.isNew ? h('span', {class: 'pill new'}, 'новинка') : null, x.featured ? h('span', {class: 'pill done', style: {marginLeft: '4px'}}, 'на главной') : null]]]},
    brands: {noun: 'бренд', neu: 'Новый', one: 'бренда', title: 'Бренды', path: null, label: 'name', url: x => 'brands/' + x.id + '.html', slugFrom: x => slugify(x.name), idFrom: x => slugify(x.name), movable: true,
      order: ['name', 'group', 'country', 'tag', 'desc', 'long', 'facts', 'logo', 'site', 'c1', 'c2', 'ink', 'id'],
      cols: [['Название', x => [h('b', {}, x.name), h('span', {class: 'sub', style: {marginLeft: '8px'}}, x.id)]], ['Группа', x => x.group || ''], ['Страна', x => x.country || ''], ['Цвета', x => [x.c1, x.c2].filter(Boolean).map(c => h('span', {style: {display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%', background: c, border: '1px solid rgba(0,0,0,.15)', marginRight: '4px', verticalAlign: 'middle'}}))]]},
    events: {noun: 'мероприятие', neu: 'Новое', one: 'мероприятия', title: 'Мероприятия', path: null, label: 'title', url: x => 'training/' + x.slug + '.html', slugFrom: x => slugify((x.date || '') + ' ' + (x.city || '') + ' ' + (x.brand || '')), idFrom: x => slugify(x.date + ' ' + x.city),
      order: ['title', 'date', 'time', 'city', 'fmt', 'brand', 'teacher', 'speaker', 'place', 'description', 'seats', 'slug', 'id', 'demo'], sort: (a, b) => String(a.date).localeCompare(String(b.date)),
      cols: [['Дата', x => [h('b', {}, x.date || ''), x.time ? h('div', {class: 'sub'}, x.time) : null]], ['Название', x => x.title], ['Город / формат', x => [x.city, x.fmt].filter(Boolean).join(' · ')], ['Бренд', (x, r) => r('events.brand', x.brand)]]},
    news: {noun: 'новость', neu: 'Новая', one: 'новости', title: 'Новости и акции', path: 'items', label: 'title', url: x => 'news/' + x.slug + '.html', slugFrom: x => slugify(x.title), idFrom: x => 'n-' + slugify(x.slug || x.title).slice(0, 30),
      order: ['title', 'category', 'date', 'excerpt', 'body', 'cta', 'related', 'slug', 'id', 'demo'],
      cols: [['Дата', x => x.date || ''], ['Заголовок', x => h('b', {}, x.title)], ['Рубрика', (x, r) => r('news.items.category', x.category)]], extra: {categories: 'Рубрики'}}
  };

  /* ---------- данные других разделов (для выпадающих списков) ---------- */
  const cache = {};
  const coll = async name => cache[name] || (cache[name] = await AD.get('/api/collections/' + name));
  const refList = ref => { const d = (cache[ref.c] || {}).data; return d ? (ref.l ? d[ref.l] : (ref.c === 'news' ? d.items : d)) || [] : []; };
  async function preloadRefs(name) { const need = new Set(Object.keys(REFS).filter(k => k.startsWith(name + '.')).map(k => REFS[k].c)); await Promise.all([...need].map(coll)); }
  const refName = (key, val) => { const ref = REFS[key]; if (!ref) return val; const f = refList(ref).find(x => x[ref.v] === val); return f ? f[ref.t] : (val || ''); };

  /* ---------- общие помощники ---------- */
  const clone = v => JSON.parse(JSON.stringify(v));
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  /* пустая копия по образцу: строки → '', числа → null, списки → [], вложенные объекты — рекурсивно */
  function blankLike(s) { if (Array.isArray(s)) return []; if (isObj(s)) { const o = {}; Object.keys(s).forEach(k => { o[k] = k[0] === '_' ? s[k] : blankLike(s[k]); }); return o; } if (typeof s === 'boolean') return false; if (typeof s === 'number') return null; if (s === null) return null; return ''; }
  const itemTitle = (it, i) => { if (typeof it === 'string') return it.slice(0, 80) || '(пусто)'; const t = it && (it.name || it.title || it.label || it.t || it.q || it.city || it.src || it.id || it.from); return t !== undefined && t !== null && t !== '' ? String(t).slice(0, 90) : 'Пункт ' + (i + 1); };
  /* какого вида должны быть элементы пустого списка / пустого поля */
  const sampleOf = (arr, o) => { const own = arr.find(x => x !== null); if (own !== undefined) return own; return Array.isArray(o.sample) ? o.sample.find(x => x !== null) : undefined; };

  /* ---------- универсальный редактор значения ---------- */
  function slot(value, set, o) {
    const wrap = h('div', {class: 'slot', style: {minWidth: 0, width: '100%'}});
    const render = v => wrap.replaceChildren(node(v, nv => { set(nv); }, o, render));
    render(value); return wrap;
  }
  function changed(o) { if (o.onChange) o.onChange(); }
  function node(value, set, o, rerender) {
    const refKey = o.coll ? o.coll + '.' + o.path.join('.') : '', ref = REFS[refKey];
    if (Array.isArray(value)) return arrayNode(value, set, o, ref);
    if (isObj(value)) return objectNode(value, set, Object.assign({}, o, {top: false}));
    if (typeof value === 'boolean') { const c = h('input', {type: 'checkbox', checked: value, id: o.id, onchange: () => { set(c.checked); changed(o); }}); return h('label', {class: 'chk'}, c, 'Да'); }
    if (typeof value === 'number') { const i = h('input', {type: 'number', step: 'any', value: String(value), id: o.id, oninput: () => { set(i.value === '' ? null : +i.value); changed(o); }}); return i; }
    if (value === null || value === undefined) return nullNode(set, o, rerender, ref);
    return strNode(String(value), set, o, ref);
  }
  function nullNode(set, o, rerender, ref) {
    const s = o.sample;
    if (Array.isArray(s)) return h('button', {class: 'btn sm', type: 'button', onclick: () => { const v = []; set(v); changed(o); rerender(v); }}, '＋ Задать список');
    if (isObj(s)) return h('button', {class: 'btn sm', type: 'button', onclick: () => { const v = blankLike(s); set(v); changed(o); rerender(v); }}, '＋ Задать');
    if (ref && !ref.multi) return strNode('', (v) => set(v === '' ? null : v), o, ref);
    const num = typeof s === 'number', i = h('input', {type: num ? 'number' : 'text', step: num ? 'any' : null, id: o.id, placeholder: 'не задано', oninput: () => { set(i.value === '' ? null : num ? +i.value : i.value); changed(o); }});
    return i;
  }
  function strNode(value, set, o, ref) {
    const key = o.key || '';
    const upd = v => { set(v); changed(o); };
    const en = ENUMS[(o.coll || '') + '.' + (o.path || []).join('.')];
    if (en) { const known = en.some(x => x[0] === value), sel = h('select', {id: o.id, onchange: () => upd(sel.value)}, !known ? h('option', {value, selected: true}, '(неизвестно: ' + value + ')') : null, en.map(x => h('option', {value: x[0], selected: x[0] === value}, x[1]))); return sel; }
    if (ref && !ref.multi) {
      const opts = refList(ref), has = opts.some(x => x[ref.v] === value);
      const sel = h('select', {id: o.id, onchange: () => upd(sel.value)}, (!has || ref.blank) ? h('option', {value: ''}, value && !has ? '(неизвестно: ' + value + ')' : ref.blank || '— выберите —') : null, value && !has ? h('option', {value, selected: true}, '(неизвестно: ' + value + ')') : null, opts.map(x => h('option', {value: x[ref.v], selected: x[ref.v] === value}, x[ref.t])));
      if (!value) sel.value = ''; return sel;
    }
    if (IMAGE_KEYS.test(key) || IMAGE_VAL.test(value)) return imageNode(value, upd, o);
    if (/^(c1|c2|ink)$/.test(key) || /^#[0-9a-f]{3,8}$/i.test(value)) {
      const t = h('input', {type: 'text', value, id: o.id, maxlength: '9', oninput: () => { upd(t.value); if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; }}), full = v => /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map(x => x + x).join('') : /^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7) : '#000000';
      const c = h('input', {type: 'color', value: full(value), 'aria-label': 'Выбор цвета', oninput: () => { t.value = c.value; upd(c.value); }}); return h('div', {class: 'color-w'}, c, t);
    }
    if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) { const d = h('input', {type: 'date', value, id: o.id, oninput: () => upd(d.value)}); return d; }
    if (value.includes('\n') || value.length > 90 || TEXTAREA_KEYS.has(key)) {
      const t = h('textarea', {id: o.id, rows: value.length > 260 ? '6' : '3', oninput: () => upd(t.value)}, value); t.value = value; return t;
    }
    const i = h('input', {type: 'text', value, id: o.id, readOnly: !!o.readonly, title: o.readonly ? 'Идентификатор нельзя менять: на него ссылаются другие записи' : null, oninput: () => upd(i.value)});
    if (o.readonly) return i;
    if ((key === 'slug' || key === 'id') && o.slugGen) { return h('div', {class: 'row gap-s', style: {flexWrap: 'nowrap'}}, i, h('button', {class: 'btn sm', type: 'button', title: 'Подставить по названию', onclick: () => { const v = o.slugGen(key); if (v) { i.value = v; upd(v); } }}, 'Из названия')); }
    return i;
  }
  function imageNode(value, upd, o) {
    const img = h('img', {alt: '', src: value && IMAGE_VAL.test(value) ? '/' + value : '', hidden: !(value && IMAGE_VAL.test(value))});
    const i = h('input', {type: 'text', value, id: o.id, placeholder: 'assets/…', style: {flex: '1 1 220px'}, oninput: () => { upd(i.value); const ok = IMAGE_VAL.test(i.value); img.hidden = !ok; if (ok) img.src = '/' + i.value; }});
    return h('div', {class: 'img-w'}, img, i, h('button', {class: 'btn sm', type: 'button', onclick: async () => { const p = await AD.pickImage(); if (p) { i.value = p; upd(p); img.src = '/' + p; img.hidden = false; } }}, 'Выбрать / загрузить…'));
  }
  const isPrim = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
  function arrayNode(arr, set, o, ref) {
    if (arr.length > 12 && arr.every(x => typeof x === 'number')) return h('div', {class: 'ed-note'}, 'Служебный набор из ' + arr.length + ' чисел (положения кадров анимации) — здесь не редактируется.');
    if (ref && ref.multi) {
      const opts = refList(ref), box = h('div', {class: 'multi'});
      opts.forEach(x => { const c = h('input', {type: 'checkbox', checked: arr.includes(x[ref.v]), onchange: () => { const on = opts.map(y => y[ref.v]).filter(v => v === x[ref.v] ? c.checked : arr.includes(v)); const unknown = arr.filter(v => !opts.some(y => y[ref.v] === v)); arr.splice(0, arr.length, ...on, ...unknown); changed(o); }}); box.append(h('label', {class: 'chk'}, c, x[ref.t])); });
      if (!opts.length) box.append(h('span', {class: 'muted small'}, 'Список пуст.'));
      return box;
    }
    const sample = sampleOf(arr, o), kidsObj = isObj(sample), kidsArr = Array.isArray(sample), box = h('div', {class: 'ed-list'});
    const addBlank = () => kidsObj ? blankLike(sample) : kidsArr ? [] : typeof sample === 'number' ? 0 : '';
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; changed(o); paint(); };
    const ctl = (i, extra) => h('span', {class: 'row gap-s', style: {flexWrap: 'nowrap'}, onclick: e => e.stopPropagation()}, extra || null, h('button', {class: 'btn sm icon', type: 'button', title: 'Выше', 'aria-label': 'Выше', disabled: i === 0, onclick: () => move(i, -1)}, '↑'), h('button', {class: 'btn sm icon', type: 'button', title: 'Ниже', 'aria-label': 'Ниже', disabled: i === arr.length - 1, onclick: () => move(i, 1)}, '↓'),
      h('button', {class: 'btn sm icon danger', type: 'button', title: 'Удалить', 'aria-label': 'Удалить пункт', onclick: () => { arr.splice(i, 1); changed(o); paint(); }}, '✕'));
    function paint() {
      box.replaceChildren();
      arr.forEach((it, i) => {
        const sub = Object.assign({}, o, {sample: undefined, samples: isObj(sample) ? sample : undefined, id: undefined, top: false});
        if (isObj(it)) {
          const dup = h('button', {class: 'btn sm icon', type: 'button', title: 'Дублировать', 'aria-label': 'Дублировать', onclick: () => { arr.splice(i + 1, 0, clone(it)); changed(o); paint(); }}, '⧉');
          const title = h('span', {class: 't'}, itemTitle(it, i)), det = h('details', {class: 'ed-card'}, h('summary', {}, title, ctl(i, dup)), h('div', {class: 'in'}, objectNode(it, null, Object.assign({}, sub, {onChange: () => { title.textContent = itemTitle(it, i); changed(o); }}))));
          if (arr.length <= 3 || o.open) det.open = true; box.append(det);
        } else if (Array.isArray(it)) {
          box.append(h('div', {class: 'ed-item'}, h('div', {class: 'v'}, h('div', {style: {border: '1px solid var(--line)', borderRadius: '10px', padding: '8px 10px', background: '#fafbfd'}}, arrayNode(it, null, Object.assign({}, o, {path: o.path}), null))), ctl(i)));
        } else {
          box.append(h('div', {class: 'ed-item'}, h('div', {class: 'v'}, slot(it, v => { arr[i] = v; }, Object.assign({}, o, {sample: undefined, id: undefined}))), ctl(i)));
        }
      });
      if (!arr.length) box.append(h('p', {class: 'muted small'}, 'Пока пусто.'));
      box.append(h('div', {}, h('button', {class: 'btn sm', type: 'button', onclick: () => { arr.push(addBlank()); changed(o); paint(); const last = box.querySelector('details:last-of-type'); if (last) last.open = true; else { const f = box.querySelector('.ed-item:last-of-type input,.ed-item:last-of-type textarea'); if (f) f.focus(); } }}, '＋ Добавить')));
    }
    paint(); return box;
  }
  let idc = 0;
  function objectNode(obj, set, o) {
    const keys = Object.keys(obj), ord = (o.order || []).filter(k => keys.includes(k)), rest = keys.filter(k => !ord.includes(k) && !(o.hide || []).includes(k)), box = h('div', {class: 'ed-obj'});
    ord.concat(rest).forEach(k => {
      const v = obj[k];
      if (k[0] === '_') { if (typeof v === 'string') box.append(h('div', {class: 'ed-note'}, v)); return; }
      const complex = Array.isArray(v) ? v.some(x => isObj(x) || Array.isArray(x)) || (!v.length && Array.isArray(o.samples && o.samples[k]) && isObj(o.samples[k][0])) : isObj(v);
      const known = o.samples ? o.samples[k] : undefined;
      const sub = Object.assign({}, o, {key: k, path: o.path.concat(k), id: 'f' + (++idc), order: undefined, sample: known, samples: isObj(known) ? known : undefined, readonly: !!(o.lock && o.lock.includes(k)), lock: undefined});
      box.append(h('div', {class: 'ed-row' + (complex ? ' wide' : '')}, h('label', {class: 'k', for: sub.id}, (o.coll && PATH_LABELS[o.coll + '.' + sub.path.join('.')]) || label(k), h('small', {}, k)), slot(v, nv => { obj[k] = nv; }, sub)));
    });
    return box;
  }
  Object.assign(AD, {blankLike, slugify});

  /* ---------- общие части страниц ---------- */
  const uidN = (() => { let n = 0; return () => 'e' + (++n); })();
  async function historyDialog(name, reload) {
    let items; try { items = (await AD.get('/api/collections/' + name + '/history')).items; } catch (e) { AD.toast(e.message, 'err'); return; }
    const body = items.length ? h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl'}, h('thead', {}, h('tr', {}, ['Состояние до изменения от', 'Кто менял', ''].map(t => h('th', {}, t)))), h('tbody', {}, items.map(x => h('tr', {}, h('td', {}, AD.fmt(x.at)), h('td', {}, x.who), h('td', {}, h('button', {class: 'btn sm', type: 'button', onclick: async e => { if (!await AD.confirm('Вернуть раздел к состоянию на ' + AD.fmt(x.at) + '? Текущие данные тоже сохранятся в истории.', {ok: 'Восстановить', danger: false})) return; await AD.busy(e.currentTarget, async () => { try { await AD.post('/api/collections/' + name + '/restore', {id: x.id}); delete cache[name]; AD.toast('Версия восстановлена, сайт пересобран', 'ok'); m.close(); reload(); } catch (err) { AD.toast(err.message, 'err'); } }); }}, 'Восстановить')))))))
      : h('div', {class: 'empty'}, h('b', {}, 'История пуста'), 'Копии появляются при каждом сохранении раздела.');
    const m = AD.modal({title: 'История изменений', body, cls: 'wide'});
  }
  AD.historyDialog = historyDialog;                                        // общее окно истории — для разделов «Страницы» и «Оформление»
  const saveInfo = r => r.build ? 'Сохранено, сайт пересобран (' + (r.build.ms / 1000).toFixed(1) + ' с)' : r.unchanged ? 'Изменений нет' : 'Сохранено';

  /* ---------- вход в раздел: свой маленький маршрутизатор (#/content, #/content/products, #/content/products/<id>) ---------- */
  AD.views.content = {
    async mount(root, parts) {
      const inst = {initial: true, name: undefined, page: null};
      inst.show = async (p, force) => {
        const name = p[0] || '';
        if (force || name !== inst.name) {
          if (inst.page && inst.page.destroy) inst.page.destroy();
          inst.name = name; inst.page = null; AD.dirty = false; root.replaceChildren();
          const reload = () => inst.show([name], true);
          inst.page = LISTS[name] ? await listPage(root, name, reload) : name ? await docPage(root, name, reload) : await overview(root);
        }
        if (inst.page && inst.page.onRoute) inst.page.onRoute(p[1] === undefined ? undefined : decodeURIComponent(p[1]));
      };
      inst.onRoute = p => inst.show(p).catch(e => { root.replaceChildren(AD.errBox(e)); });
      inst.destroy = () => { if (inst.page && inst.page.destroy) inst.page.destroy(); AD.dirty = false; };
      await inst.show(parts); return inst;
    }
  };
  async function overview(root) {
    const {collections} = await AD.get('/api/collections'), groups = {};
    collections.forEach(c => (groups[c.group] = groups[c.group] || []).push(c));
    AD.fill(root, AD.pageHead('Содержимое сайта', 'Выберите раздел. После сохранения сайт пересобирается автоматически; если данные ошибочны, изменения откатываются.'),
      Object.entries(groups).map(([g, cs]) => [h('div', {class: 'group-h'}, g), h('div', {class: 'cols'}, cs.map(c => h('a', {class: 'tile', href: '#/content/' + c.name}, h('b', {}, c.title), h('span', {}, c.count !== null ? c.count + ' ' + AD.plural(c.count, 'запись', 'записи', 'записей') : 'Редактировать'))))]));
    return {};
  }

  /* ---------- раздел-документ: аккордеоны ---------- */
  async function docPage(root, name, reloadPage) {
    await preloadRefs(name);
    const cur = await AD.get('/api/collections/' + name), draft = clone(cur.data); let orig = JSON.stringify(draft);
    const meta = (await AD.get('/api/collections')).collections.find(c => c.name === name) || {title: name};
    const msg = h('div', {}), saveBtn = h('button', {class: 'btn primary', type: 'button', disabled: true}, 'Сохранить'), state = h('span', {class: 'muted small'});
    const bar = h('div', {class: 'savebar'}, saveBtn, state, h('span', {class: 'right row'}, h('button', {class: 'btn', type: 'button', onclick: () => historyDialog(name, reloadPage)}, 'История'), h('button', {class: 'btn ghost', type: 'button', onclick: async () => { if (!AD.dirty || await AD.confirm('Отменить все несохранённые изменения?', {ok: 'Отменить изменения'})) { AD.dirty = false; reloadPage(); } }}, 'Сбросить')));
    const onChange = () => { const d = JSON.stringify(draft) !== orig; AD.dirty = d; saveBtn.disabled = !d; AD.fill(state, d ? [h('span', {class: 'dot'}), 'Есть несохранённые изменения'] : ''); bar.classList.toggle('dirty', d); };
    const body = h('div', {class: 'ed'}), keys = Object.keys(draft), scalars = keys.filter(k => k[0] !== '_' && !Array.isArray(draft[k]) && !isObj(draft[k])), complex = keys.filter(k => k[0] !== '_' && !scalars.includes(k));
    const base = {coll: name, onChange};
    if (typeof draft._comment === 'string') body.append(h('div', {class: 'ed-note'}, draft._comment));
    if (scalars.length) {
      const sc = {}; scalars.forEach(k => { sc[k] = draft[k]; });
      const inner = objectNode(new Proxy(sc, {set(t, k, v) { t[k] = v; draft[k] = v; return true; }}), null, Object.assign({}, base, {path: []}));
      body.append(h('details', {class: 'ed-card top', open: true}, h('summary', {}, h('span', {class: 't'}, name === 'site' ? 'Основное' : 'Общие поля')), h('div', {class: 'in'}, inner)));
    }
    complex.forEach((k, idx) => {
      const o = Object.assign({}, base, {path: [k], key: k, id: 'f' + (++idc)});
      body.append(h('details', {class: 'ed-card top', open: complex.length <= 3 && idx === 0}, h('summary', {}, h('span', {class: 't'}, SECTIONS[name + '.' + k] || label(k)), h('span', {class: 'muted small'}, Array.isArray(draft[k]) ? draft[k].length + ' шт.' : '')), h('div', {class: 'in'}, slot(draft[k], v => { draft[k] = v; }, o))));
    });
    saveBtn.addEventListener('click', () => AD.busy(saveBtn, async () => {
      msg.replaceChildren();
      try {
        const r = await AD.put('/api/collections/' + name, {data: draft, version: cur.version}); cur.version = r.version; orig = JSON.stringify(draft); delete cache[name];
        AD.dirty = false; saveBtn.disabled = true; state.textContent = ''; bar.classList.remove('dirty'); AD.toast(saveInfo(r), 'ok');
      } catch (e) { msg.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => { AD.dirty = false; reloadPage(); }}, 'Загрузить актуальную версию')) : AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); }
    }));
    root.append(h('div', {class: 'crumbs'}, h('a', {href: '#/content'}, 'Содержимое'), ' › ', meta.title), AD.pageHead(meta.title), bar, msg, body);
    return {destroy() { AD.dirty = false; }};
  }

  /* ---------- раздел-список: товары, бренды, мероприятия, новости ---------- */
  async function listPage(root, name, reloadPage) {
    const L = LISTS[name]; await preloadRefs(name); let cur = await AD.get('/api/collections/' + name), openM = null;
    const getItems = () => L.path ? cur.data[L.path] : cur.data, search = h('input', {type: 'search', placeholder: 'Поиск по названию…', 'aria-label': 'Поиск'}), tbody = h('tbody', {}), msg = h('div', {});
    const count = h('span', {class: 'muted small'}), empty = h('div', {class: 'empty', hidden: true}, h('b', {}, 'Ничего не найдено'), 'Измените запрос.');
    const openRoute = it => AD.go('#/content/' + name + '/' + encodeURIComponent(it.id));
    async function commit(items, doneMsg, btn) {                      // отправить весь список целиком; сервер проверит и пересоберёт сайт
      const data = L.path ? Object.assign({}, cur.data, {[L.path]: items}) : items;
      return AD.busy(btn, async () => {
        const r = await AD.put('/api/collections/' + name, {data, version: cur.version});
        cur = await AD.get('/api/collections/' + name); delete cache[name]; await preloadRefs(name); paint(); AD.toast(doneMsg || saveInfo(r), 'ok'); return r;
      });
    }
    function paint() {
      const q = search.value.trim().toLowerCase(), items = getItems(), rows = [];
      items.forEach((it, idx) => { if (q && !JSON.stringify([it.name, it.title, it.id, it.slug, it.city, it.brand]).toLowerCase().includes(q)) return; rows.push([it, idx]); });
      if (L.sort) rows.sort((a, b) => L.sort(a[0], b[0]));
      tbody.replaceChildren(...rows.map(([it, idx]) => h('tr', {class: 'click', tabindex: '0', dataset: {id: it.id}, onclick: () => openRoute(it), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) openRoute(it); }},
        L.cols.map(([t, f]) => h('td', {dataset: {l: t}}, f(it, refName))),
        h('td', {class: 'nowrap', onclick: e => e.stopPropagation()}, L.movable && !q ? [h('button', {class: 'btn sm icon', type: 'button', title: 'Выше', 'aria-label': 'Выше', disabled: idx === 0, onclick: e => moveItem(idx, -1, e.currentTarget)}, '↑'), ' ', h('button', {class: 'btn sm icon', type: 'button', title: 'Ниже', 'aria-label': 'Ниже', disabled: idx === items.length - 1, onclick: e => moveItem(idx, 1, e.currentTarget)}, '↓'), ' '] : null,
          h('button', {class: 'btn sm', type: 'button', onclick: () => duplicate(it)}, 'Копия'), ' ', h('button', {class: 'btn sm danger', type: 'button', onclick: () => remove(it)}, 'Удалить')))));
      count.textContent = rows.length + ' из ' + items.length; empty.hidden = rows.length > 0;
    }
    async function moveItem(i, d, btn) { const a = getItems().slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; try { await commit(a, 'Порядок изменён', btn); msg.replaceChildren(); } catch (e) { msg.replaceChildren(AD.errBox(e)); } }
    async function remove(it) {
      if (!await AD.confirm('Удалить «' + itemTitle(it, 0) + '»? Страница на сайте исчезнет. Восстановить можно через «История».', {ok: 'Удалить'})) return;
      try { await commit(getItems().filter(x => x.id !== it.id), 'Удалено, сайт пересобран'); msg.replaceChildren(); } catch (e) { msg.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message) : AD.errBox(e)); }
    }
    function duplicate(it) { const c = clone(it); c.id = ''; c.slug = ''; if (c.title) c.title += ' (копия)'; if (c.name) c.name += ' (копия)'; openEditor(c, null); }
    const template = () => { const s = getItems()[0] || {}, t = blankLike(s); if (name === 'products') { t.brand = s.brand; t.cat = s.cat; t.kind = s.kind; t.type = s.type; } if (t.date !== undefined) t.date = new Date().toISOString().slice(0, 10); if (name === 'news') t.category = ((cur.data.categories || [])[0] || {}).id || ''; if (t.demo !== undefined) t.demo = false; return t; };
    function openEditor(item, id) {
      if (openM) return openM;
      const isNew = id === null, work = clone(item), originalKeys = new Set(Object.keys(item));
      if (isNew && !Object.keys(work).length) Object.assign(work, template());
      Object.keys(L.ensure || {}).forEach(k => { if (!(k in work)) work[k] = clone(L.ensure[k]); });
      const orig = JSON.stringify(work), err = h('div', {}), saveBtn = h('button', {class: 'btn primary', type: 'button'}, isNew ? 'Добавить' : 'Сохранить'), samples = {};
      getItems().forEach(x => Object.keys(x).forEach(k => { if (x[k] !== null && samples[k] === undefined) samples[k] = x[k]; })); Object.assign(samples, SAMPLES[name] || {});
      const o = {coll: name, path: L.path ? [L.path] : [], order: L.order, samples, lock: isNew ? null : ['id'], slugGen: k => k === 'slug' ? L.slugFrom(work) : L.idFrom(work), onChange: () => {}};
      const m = openM = AD.modal({title: isNew ? L.neu + ' ' + L.noun : 'Правка: ' + itemTitle(item, 0), cls: 'wide', sticky: true, body: [err, objectNode(work, null, o)],
        beforeClose: () => JSON.stringify(work) === orig || confirm('Закрыть без сохранения? Изменения будут потеряны.'),
        onClose: () => { openM = null; if (new RegExp('^#/content/' + name + '/').test(location.hash)) AD.go('#/content/' + name); },
        footer: [!isNew && L.url ? h('a', {class: 'btn ghost', href: '/' + L.url(item), target: '_blank', rel: 'noopener', style: {marginRight: 'auto'}}, 'Открыть на сайте') : null, h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), saveBtn]});
      saveBtn.addEventListener('click', async () => {
        err.replaceChildren();
        Object.keys(work).forEach(k => { if (!originalKeys.has(k) && (work[k] === null || work[k] === '' || (Array.isArray(work[k]) && !work[k].length))) delete work[k]; });
        if (work.slug !== undefined && !String(work.slug).trim()) work.slug = L.slugFrom(work);
        if (work.id !== undefined && !String(work.id).trim()) work.id = L.idFrom(work) || work.slug;
        const items = getItems().slice(), pos = isNew ? -1 : items.findIndex(x => x.id === id);
        if (pos >= 0) items[pos] = work; else items.push(work);
        try { await commit(items, isNew ? 'Добавлено, сайт пересобран' : undefined, saveBtn); m.close(true); }
        catch (e) { err.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: async () => { cur = await AD.get('/api/collections/' + name); m.close(true); paint(); }}, 'Загрузить актуальные данные')) : AD.errBox(e)); err.scrollIntoView({block: 'nearest'}); }
      });
      return m;
    }
    search.addEventListener('input', paint); search.className = 'grow';
    root.append(h('div', {class: 'crumbs'}, h('a', {href: '#/content'}, 'Содержимое'), ' › ', L.title),
      AD.pageHead(L.title, null, h('button', {class: 'btn', type: 'button', onclick: () => historyDialog(name, reloadPage)}, 'История'), h('button', {class: 'btn primary', type: 'button', id: 'add-item', onclick: () => openEditor({}, null)}, '＋ Добавить ' + L.noun)), msg,
      h('div', {class: 'toolbar'}, search, count), h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, L.cols.map(c => h('th', {}, c[0])), h('th', {}, ''))), tbody), empty));
    Object.entries(L.extra || {}).forEach(([key, title]) => {                 // дополнительные списки в том же файле (рубрики новостей)
      let work = clone(cur.data[key]); const em = h('div', {}), b = h('button', {class: 'btn primary', type: 'button', disabled: true}, 'Сохранить'), same = () => JSON.stringify(work) === JSON.stringify(cur.data[key]);
      const o = {coll: name, path: [key], onChange: () => { b.disabled = same(); AD.dirty = !same(); }};
      b.addEventListener('click', async () => { em.replaceChildren(); try { const data = Object.assign({}, cur.data, {[key]: work}); const r = await AD.busy(b, () => AD.put('/api/collections/' + name, {data, version: cur.version})); cur = await AD.get('/api/collections/' + name); delete cache[name]; b.disabled = true; AD.dirty = false; AD.toast(saveInfo(r), 'ok'); } catch (e) { em.replaceChildren(AD.errBox(e)); } });
      root.append(h('div', {class: 'card', style: {marginTop: '22px'}}, h('h2', {}, title), em, slot(work, v => { work = v; }, o), h('div', {style: {marginTop: '12px'}}, b)));
    });
    paint();
    return {
      onRoute(id) { if (id === '__new') { if (!openM) openEditor({}, null); return; } if (id === undefined) { if (openM) { const m = openM; openM = null; m.close(true); } return; } const it = getItems().find(x => x.id === id); if (it) openEditor(it, id); else { AD.toast('Запись «' + id + '» не найдена', 'err'); AD.go('#/content/' + name); } },
      destroy() { if (openM) { const m = openM; openM = null; m.close(true); } AD.dirty = false; }
    };
  }
})();
