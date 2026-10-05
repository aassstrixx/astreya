/* Палитра команд (Ctrl+K / ⌘K): быстрый переход в любой раздел, создание записей и поиск по товарам, брендам, новостям, мероприятиям и страницам. */
(function () {
  'use strict';
  const {h} = AD;
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const CMDS = [
    ['Раздел', 'Обзор', '#/overview', 'главная сводка состояние здоровье', ['admin']], ['Раздел', 'Заявки', '#/leads', 'обращения клиенты формы', ['admin', 'manager']], ['Раздел', 'Содержимое сайта', '#/content', 'тексты товары бренды новости мероприятия', ['admin']],
    ['Раздел', 'Страницы (конструктор)', '#/pages', 'свои страницы блоки акции', ['admin']], ['Раздел', 'Оформление', '#/design', 'цвета меню фон', ['admin']], ['Раздел', 'Предпросмотр', '#/preview', 'посмотреть сайт телефон планшет', ['admin']],
    ['Раздел', 'Картинки', '#/files', 'файлы загрузка медиа фото', ['admin']], ['Раздел', 'Публикация', '#/publish', 'сборка выложить github сайт', ['admin']], ['Раздел', 'Настройки и заявки', '#/settings', 'уведомления telegram почта', ['admin']], ['Раздел', 'Пользователи', '#/users', 'доступ пароль роли', ['admin']], ['Раздел', 'Журнал', '#/audit', 'история действия', ['admin']],
    ['Создать', 'Новая новость', '#/content/news/__new', 'добавить новость акция', ['admin']], ['Создать', 'Новый товар', '#/content/products/__new', 'добавить товар', ['admin']], ['Создать', 'Новое мероприятие', '#/content/events/__new', 'добавить семинар вебинар обучение', ['admin']], ['Создать', 'Новая страница', '#/pages/__new', 'создать страницу конструктор', ['admin']],
    ['Оформление', 'Меню сайта', '#/design/menu', 'пункты шапка навигация', ['admin']], ['Оформление', 'Цвета и скругления', '#/design/colors', 'тема палитра', ['admin']], ['Оформление', 'Фоны страниц', '#/design/backdrops', 'текстуры крем фон', ['admin']]
  ];
  let open = null;
  AD.openPalette = function () {
    if (open || !AD.user || AD.user.mustChange || !$('#view')) return;
    const prev = document.activeElement, role = AD.user.role;
    const all = CMDS.filter(c => c[4].includes(role)).map(([type, title, link, kw]) => ({type, title, sub: '', link, kw}));
    const inp = h('input', {type: 'text', id: 'pal-q', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list', placeholder: role === 'admin' ? 'Куда перейти или что найти? Раздел, товар, новость…' : 'Куда перейти?', autocomplete: 'off', spellcheck: 'false'}), list = h('ul', {id: 'pal-list', role: 'listbox'});
    const foot = h('div', {class: 'foot'}, h('span', {}, h('span', {class: 'kbd'}, '↑'), ' ', h('span', {class: 'kbd'}, '↓'), ' выбрать'), h('span', {}, h('span', {class: 'kbd'}, 'Enter'), ' открыть'), h('span', {}, h('span', {class: 'kbd'}, 'Esc'), ' закрыть'));
    const ov = h('div', {class: 'pal-ov', onmousedown: e => { if (e.target === ov) close(); }}, h('div', {class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Быстрый переход и поиск'}, inp, list, foot));
    let items = [], at = 0, remote = [], timer = null, seq = 0;
    const SP = (typeof $ === 'function') ? $ : AD.$;
    function paint() {
      list.replaceChildren(...(items.length ? items.map((it, i) => h('li', {role: 'presentation'}, h('button', {type: 'button', role: 'option', id: 'pal-o' + i, tabindex: '-1', 'aria-selected': String(i === at), onclick: () => go(it), onmousemove: () => { if (at !== i) { at = i; mark(); } }}, h('span', {class: 'ty'}, it.type), h('span', {}, it.title), it.sub ? h('span', {class: 'sb'}, it.sub) : null))) : [h('li', {class: 'muted small', style: {padding: '14px 16px'}}, 'Ничего не найдено')]));
      inp.setAttribute('aria-activedescendant', items.length ? 'pal-o' + at : '');
    }
    function mark() { list.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === at))); const b = list.querySelectorAll('button')[at]; if (b) b.scrollIntoView({block: 'nearest'}); inp.setAttribute('aria-activedescendant', 'pal-o' + at); }
    function filter() {
      const q = norm(inp.value).trim(), words = q.split(/\s+/).filter(Boolean);
      /* сначала те, у кого слова есть в названии, потом совпавшие по ключевым словам */
      const inTitle = c => { const t = norm(c.title); return words.every(w => t.includes(w)); };
      const local = !words.length ? all : all.filter(c => { const hay = norm(c.title + ' ' + c.type + ' ' + c.kw); return words.every(w => hay.includes(w)); }).sort((a, b) => inTitle(b) - inTitle(a));
      items = local.concat(remote).slice(0, 40); at = 0; paint();
    }
    function go(it) { close(); if (it.link === location.hash) return; AD.go(it.link); }
    function close() { if (!open) return; document.removeEventListener('keydown', onKey, true); ov.remove(); open = null; clearTimeout(timer); if (prev && prev.focus) try { prev.focus(); } catch (e) {} }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { at = (at + 1) % items.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { at = (at - 1 + items.length) % items.length; mark(); } }
      else if (e.key === 'Enter' && document.activeElement === inp) { e.preventDefault(); if (items[at]) go(items[at]); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    }
    inp.addEventListener('input', () => {
      filter(); clearTimeout(timer); const q = inp.value.trim(); if (role !== 'admin' || q.length < 2) { remote = []; return; }
      timer = setTimeout(async () => { const my = ++seq; try { const r = await AD.get('/api/search?q=' + encodeURIComponent(q)); if (my !== seq || !open) return; remote = r.items; filter(); } catch (e) {} }, 180);
    });
    document.addEventListener('keydown', onKey, true); open = ov; document.body.append(ov); filter(); inp.focus();
  };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { if (!AD.user || AD.user.mustChange) return; e.preventDefault(); if (open) return; AD.openPalette(); } });
  function $(s) { return document.querySelector(s); }
})();
