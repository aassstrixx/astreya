/* Палитра команд (Ctrl+K / ⌘K): быстрый переход в любой раздел, создание записей и поиск по товарам, брендам, новостям, мероприятиям и страницам. */
(function () {
  'use strict';
  const {h} = AD;
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const KW = {overview: 'главная сводка состояние здоровье', leads: 'обращения клиенты формы', texts: 'тексты заголовки страницы подписи контакты главная компания газета', news: 'новости газета акции выпуск слоты', products: 'товары витрина каталог фото упаковка', brands: 'бренды логотип', events: 'мероприятия семинары обучение преподаватели faq', contacts: 'контакты телефон адрес офисы реквизиты скидки', menu: 'меню шапка навигация', pages: 'свои страницы блоки акции конструктор', content: 'все данные json разделы', files: 'файлы загрузка медиа фото картинки', preview: 'посмотреть сайт телефон планшет', publish: 'сборка выложить github сайт опубликовать', history: 'версии откат diff изменения', backups: 'копии резервные', settings: 'уведомления telegram почта', integrations: 'метрика мессенджеры капча битрикс', users: 'пользователи роли', security: 'пароль 2fa двухфакторный', audit: 'журнал действий', privacy: 'персональные данные 152-фз', launch: 'запуск чек-лист'};
  const CMDS = AD.NAV.filter(n => !n.hide).map(n => ['Раздел', n.title, '#/' + n.id, KW[n.id] || '', n.roles]).concat([
    ['Создать', 'Новая новость', '#/news/__new', 'добавить новость акция', ['admin', 'editor']], ['Создать', 'Новый товар', '#/products/__new', 'добавить товар фото каталог', ['admin', 'editor']], ['Создать', 'Новое мероприятие', '#/events/__new', 'добавить семинар вебинар', ['admin', 'editor']], ['Создать', 'Новая страница', '#/pages', 'добавить страницу', ['admin', 'editor']],
    ['Контакты', 'Офисы и представительства', '#/contacts/offices', 'города адреса телефоны', ['admin', 'editor']], ['Контакты', 'Скидки за объём', '#/contacts/discounts', 'скидка партнёрам пороги', ['admin', 'editor']]
  ]);
  let open = null;
  AD.openPalette = function () {
    if (open || !AD.user || AD.user.mustChange || !$('#view')) return;
    const prev = document.activeElement, role = AD.user.role;
    const all = CMDS.filter(c => c[4].includes(role)).map(([type, title, link, kw]) => ({type, title, sub: '', link, kw}));
    const inp = h('input', {type: 'text', id: 'pal-q', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list', placeholder: role !== 'manager' ? 'Куда перейти или что найти? Раздел, товар, новость…' : 'Куда перейти?', autocomplete: 'off', spellcheck: 'false'}), list = h('ul', {id: 'pal-list', role: 'listbox'});
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
      filter(); clearTimeout(timer); const q = inp.value.trim(); if (role === 'manager' || q.length < 2) { remote = []; return; }
      timer = setTimeout(async () => { const my = ++seq; try { const r = await AD.get('/api/search?q=' + encodeURIComponent(q)); if (my !== seq || !open) return; remote = r.items; filter(); } catch (e) {} }, 180);
    });
    document.addEventListener('keydown', onKey, true); open = ov; document.body.append(ov); filter(); inp.focus();
  };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { if (!AD.user || AD.user.mustChange) return; e.preventDefault(); if (open) return; AD.openPalette(); } });
  function $(s) { return document.querySelector(s); }
})();
