/* Раздел «Оформление»: меню сайта (data/menu.json) и фоновые вставки страниц (data/redesign.json → backdrops).
   Каждая вкладка — отдельный набор данных со своей кнопкой «Сохранить»: сервер проверяет данные, пересобирает сайт и откатывает правку, если сайт не собирается. */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const uid = (() => { let n = 0; return () => 'ds' + (++n); })();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const field = (label, control, help, id) => h('div', {class: 'field'}, h('label', {for: id}, label), control, help ? h('div', {class: 'help'}, help) : null);

  /* ---------- общая обвязка вкладки: загрузка, учёт изменений, сохранение, история ---------- */
  function tabShell(name, o) {
    const msg = h('div', {}), state = h('span', {class: 'muted small'});
    const t = {name, cur: null, work: null, msg, state, saveBtn: h('button', {class: 'btn primary', type: 'button', id: 'ds-save', disabled: true}, 'Сохранить')};
    t.load = async () => { t.cur = await AD.get('/api/collections/' + name); t.work = o.pick(clone(t.cur.data)); t.orig = clone(t.work); };
    t.dirty = () => !same(t.work, t.orig);
    t.touch = () => { const d = t.dirty(); AD.dirty = d; const bad = o.invalid ? o.invalid(t.work) : null; t.saveBtn.disabled = !d || !!bad; AD.fill(state, d ? [h('span', {class: 'dot'}), bad ? 'Исправьте ошибки, чтобы сохранить' : 'Есть несохранённые изменения'] : ''); if (o.onTouch) o.onTouch(); };
    t.save = () => AD.busy(t.saveBtn, async () => {
      msg.replaceChildren();
      try { const r = await AD.put('/api/collections/' + name, {data: o.merge(clone(t.cur.data), clone(t.work)), version: t.cur.version}); await t.load(); if (o.repaint) o.repaint(); AD.dirty = false; AD.toast(r.unchanged ? 'Изменений нет' : r.build ? 'Сохранено, сайт пересобран' : 'Сохранено', 'ok'); t.touch(); if (o.saved) o.saved(); }
      catch (e) { msg.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => { AD.dirty = false; location.reload(); }}, 'Загрузить актуальную версию')) : AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); }
    }).then(() => t.touch());
    t.saveBtn.addEventListener('click', t.save);
    t.bar = (...extra) => h('div', {class: 'savebar'}, t.saveBtn, state, h('span', {class: 'right row'}, extra, h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog(name, async () => { await t.load(); AD.dirty = false; o.repaint(); t.touch(); })}, 'История')));
    return t;
  }

  /* =============================== МЕНЮ =============================== */
  async function menuTab(box) {
    const t = tabShell('menu', {pick: d => d.nav, merge: (d, w) => Object.assign(d, {nav: w}), invalid: w => w.length < 2 || w.length > 9 || w.some(i => !i.title.trim() || i.title.length > 24 || !i.href), repaint: () => paint()});
    await t.load();
    let pagesAll = AD._sitePages; if (!pagesAll) { try { pagesAll = AD._sitePages = (await AD.get('/api/site-pages')).pages; } catch (e) { pagesAll = []; } }
    let customNav = []; try { customNav = (await AD.get('/api/collections/pages')).data.items.filter(p => p.nav && p.published !== false); } catch (e) {}
    const list = h('div', {class: 'nav-ed'}), prev = h('div', {class: 'mini-nav', 'aria-label': 'Так будет выглядеть меню'});
    const groups = [...new Set(pagesAll.map(p => p.group))];
    function paint() {
      const w = t.work;
      list.replaceChildren(...w.map((it, i) => {
        const id = uid(), ti = h('input', {type: 'text', id, value: it.title, maxlength: '24', 'aria-label': 'Подпись пункта ' + (i + 1), oninput: () => { it.title = ti.value; ti.classList.toggle('bad', !ti.value.trim()); t.touch(); repaintPrev(); }});
        const sel = h('select', {'aria-label': 'Страница пункта ' + (i + 1), onchange: () => { it.href = sel.value; delete it.key; t.touch(); }},
          !pagesAll.some(p => p.path === it.href) ? h('option', {value: it.href}, it.href) : null,
          groups.map(g => h('optgroup', {label: g}, pagesAll.filter(p => p.group === g).map(p => h('option', {value: p.path}, p.title + ' — ' + p.path)))));
        sel.value = it.href;
        const mv = d => { const j = i + d; if (j < 0 || j >= w.length) return; [w[i], w[j]] = [w[j], w[i]]; paint(); t.touch(); };
        return h('div', {class: 'it'}, ti, sel, h('span', {class: 'bl-ctl'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => mv(-1)}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Ниже', disabled: i === w.length - 1, onclick: () => mv(1)}, '↓'),
          h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Убрать пункт', disabled: w.length <= 2, onclick: () => { w.splice(i, 1); paint(); t.touch(); }}, '✕')));
      }));
      repaintPrev();
    }
    const repaintPrev = () => AD.fill(prev, [...t.work.map(i => i.title || '…'), ...customNav.map(p => p.navTitle || p.title)].map(x => h('span', {}, x)), h('span', {class: 'cta'}, 'Стать партнёром'));
    const addBtn = h('button', {class: 'btn', type: 'button', id: 'menu-add', onclick: () => { if (t.work.length >= 9) { AD.toast('В меню не больше 9 пунктов', 'err'); return; } const used = new Set(t.work.map(i => i.href)), free = pagesAll.find(p => !used.has(p.path)); t.work.push({title: free ? free.title.slice(0, 24) : 'Новый', href: free ? free.path : 'index.html'}); paint(); t.touch(); const ins = list.querySelectorAll('input[type=text]'); ins[ins.length - 1].focus(); }}, '＋ Добавить пункт');
    box.replaceChildren(h('div', {class: 'card'}, h('h2', {}, 'Меню в шапке сайта'), h('p', {class: 'muted small', style: {margin: '4px 0 12px'}}, 'Порядок, подписи и страницы. До 24 символов в подписи, от 2 до 9 пунктов. Кнопка «Стать партнёром» и поиск есть всегда.'), prev, h('div', {style: {margin: '14px 0 4px'}}, list), h('div', {class: 'row', style: {marginTop: '10px'}}, addBtn),
      customNav.length ? h('div', {class: 'alert info', style: {marginTop: '14px'}}, 'Из раздела «Страницы» в меню добавляются: ', customNav.map((p, i) => [i ? ', ' : '', h('a', {href: '#/pages/' + encodeURIComponent(p.slug)}, p.navTitle || p.title)]), '. Включается и выключается в настройках самой страницы.') : null), t.msg);
    box.prepend(t.bar(h('button', {class: 'btn', type: 'button', onclick: () => { t.work = clone(t.orig); paint(); t.touch(); }}, 'Отменить правки')));
    paint(); t.touch();
    return t;
  }

  /* =============================== ФОНЫ =============================== */
  const PAGE_LABELS = {home: 'Главная', catalog: 'Каталог', brands: 'Бренды (список)', brand: 'Страница бренда', product: 'Страница товара', training: 'Обучение', event: 'Мероприятие', custom: 'Свои страницы', news: 'Новости (список)', article: 'Статья новости', company: 'Компания', contacts: 'Контакты', partners: 'Партнёрам', search: 'Поиск', privacy: 'Политика', terms: 'Условия'};
  const SAMPLE = {home: 'index.html', catalog: 'catalog.html', brands: 'brands.html', training: 'training.html', news: 'news.html', company: 'company.html', contacts: 'contacts.html', partners: 'partners.html', search: 'search.html', privacy: 'privacy.html', terms: 'terms.html'};
  const SAMPLE_DIR = {brand: 'brands/', product: 'products/', event: 'training/', article: 'news/', custom: 'pages/'};
  const POS9 = [['tl', 'Слева сверху'], ['t', 'Сверху'], ['tr', 'Справа сверху'], ['l', 'Слева'], ['c', 'По центру'], ['r', 'Справа'], ['bl', 'Слева снизу'], ['b', 'Снизу'], ['br', 'Справа снизу']];
  const BLOCK = new Set(['section', 'div', 'header', 'article', 'aside', 'ul', 'form']);

  async function backdropsTab(box, parts) {
    const t = tabShell('redesign', {pick: d => d.backdrops || {enabled: false, textures: {}, pages: {}}, merge: (d, w) => Object.assign(d, {backdrops: w}), repaint: () => paintAll(), saved: () => { blocksCache = {}; }});
    await t.load();
    let pageKey = parts[0] && parts[0] !== '' ? decodeURIComponent(parts[0]) : 'home', vi = 0, blocksCache = {};
    const sitePages = AD._sitePages || [];
    const texKeys = () => Object.keys(t.work.textures || {});
    const bdOf = () => t.work;
    const planOf = () => { const pl = bdOf().pages[pageKey]; return pl && Array.isArray(pl.variants) ? (pl.variants[Math.min(vi, pl.variants.length - 1)] || pl.variants[0]) : pl; };

    /* блоки страницы, на которые можно поставить фон: разбираем готовый HTML образца (те же правила, что в src/backdrops.js: первые три уровня вложенности) */
    async function blocksOf(key) {
      if (blocksCache[key]) return blocksCache[key];
      const path = SAMPLE[key] || (sitePages.find(p => p.path.startsWith(SAMPLE_DIR[key] || '~')) || {}).path; if (!path) return (blocksCache[key] = []);
      let html; try { const r = await fetch('/' + path, {cache: 'no-store'}); html = await r.text(); } catch (e) { return (blocksCache[key] = []); }
      const main = new DOMParser().parseFromString(html, 'text/html').querySelector('main'), skip = new Set(bdOf().skipClasses || []), out = [];
      if (main) { const walk = (el, d) => { for (const c of el.children) { const tag = c.tagName.toLowerCase(); if (d <= 2 && BLOCK.has(tag) && ![...c.classList].some(x => skip.has(x)) && !c.classList.contains('bd-fill') && !c.classList.contains('bd-logo')) { const heading = c.querySelector('h1,h2,h3'); out.push({tag, cls: [...c.classList], id: c.id || '', title: heading ? heading.textContent.replace(/\s+/g, ' ').trim().slice(0, 48) : ''}); } if (!/^(script|style|svg)$/.test(tag)) walk(c, d + 1); } }; walk(main, 0); }
      const have = out.map(b => b.tag + b.cls.map(x => '.' + x).join(''));
      out.forEach((b, i) => { const sel = have[i], hits = out.filter(o => o.tag === b.tag && b.cls.every(x => o.cls.includes(x))); b.sel = sel; b.n = hits.indexOf(b); });
      return (blocksCache[key] = out);
    }

    /* ---- мелкие элементы ---- */
    const texPicker = (it, optional, onChange) => {
      const wrap = h('div', {class: 'tex-grid', role: 'group', 'aria-label': 'Текстура'}), paint = () => wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === (it.tex || ''))));
      if (optional) wrap.append(h('button', {class: 'tex', type: 'button', dataset: {k: ''}, onclick: () => { it.tex = ''; paint(); onChange(); }}, h('i', {style: {background: 'repeating-linear-gradient(45deg,#f0f2f6 0 8px,#fff 8px 16px)'}}), h('span', {}, 'Без фона')));
      texKeys().forEach(k => wrap.append(h('button', {class: 'tex', type: 'button', dataset: {k}, 'aria-label': bdOf().textures[k].title || k, onclick: () => { it.tex = k; paint(); onChange(); }}, h('i', {style: {backgroundImage: 'url(/assets/bg/' + k + '-m.webp)'}}), h('span', {}, bdOf().textures[k].title || k))));
      paint(); return wrap;
    };
    const posPicker = (it, dflt, onChange) => {
      const g = h('div', {class: 'pos9', role: 'group', 'aria-label': 'Где лежит текстура'}), paint = () => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === (it.pos || dflt))));
      POS9.forEach(([p, title]) => g.append(h('button', {type: 'button', dataset: {p}, title, 'aria-label': title, onclick: () => { it.pos = p; paint(); onChange(); }})));
      paint(); return g;
    };
    const strength = (it, onChange) => {
      const id = uid(), r = h('input', {type: 'range', id, 'aria-label': 'Сила текстуры', min: '3', max: '10', step: '1', value: String(it.o || 7)}), out = h('output', {class: 'mono', for: id}, it.o ? String(it.o) : 'авто'), auto = h('input', {type: 'checkbox', checked: it.o === undefined || it.o === null, 'aria-label': 'Сила по умолчанию'});
      const sync = () => { r.disabled = auto.checked; out.textContent = auto.checked ? 'авто' : r.value; };
      r.addEventListener('input', () => { it.o = +r.value; sync(); onChange(); }); auto.addEventListener('change', () => { if (auto.checked) delete it.o; else it.o = +r.value; sync(); onChange(); }); sync();
      return h('div', {class: 'row'}, r, out, h('label', {class: 'chk small', for: undefined}, auto, 'по умолчанию'));
    };
    const slot = (title, host, key, o) => {
      const cur = host[key], on = !!cur, body = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px'}}), sw = h('input', {type: 'checkbox', checked: on, 'aria-label': title + ': включить', onchange: () => { if (sw.checked) host[key] = {tex: texKeys()[0], pos: o.pos}; else delete host[key]; t.touch(); paintAll(true); }});
      const card = h('div', {class: 'bd-slot'}, h('label', {class: 'switch'}, sw, h('b', {}, title)), o.help ? h('div', {class: 'help muted small'}, o.help) : null);
      if (on) { const ch = () => t.touch(); body.append(texPicker(cur, false, ch), h('div', {class: 'row top', style: {gap: '24px'}}, h('div', {class: 'field'}, h('span', {class: 'lbl'}, 'Положение'), posPicker(cur, o.pos, ch)), h('div', {class: 'field', style: {flex: '1 1 220px'}}, h('span', {class: 'lbl'}, 'Сила'), strength(cur, ch)))); card.append(body); }
      return card;
    };

    /* ---- план одной страницы ---- */
    const planBox = h('div', {}), pageList = h('div', {class: 'lst', role: 'group', 'aria-label': 'Страницы сайта'});
    async function paintPlan() {
      const pl = planOf(), pageObj = bdOf().pages[pageKey]; if (!pageObj) { planBox.replaceChildren(h('div', {class: 'card'}, h('p', {class: 'muted'}, 'Для этой страницы фон пока не задан.'), h('button', {class: 'btn primary', type: 'button', onclick: () => { bdOf().pages[pageKey] = {top: {tex: texKeys()[0], pos: 'tr'}, end: {tex: texKeys()[0], pos: 'br'}}; t.touch(); paintAll(); }}, 'Задать фон'))); return; }
      const hasVar = Array.isArray(pageObj.variants), blocks = await blocksOf(pageKey), nodes = [];
      const sel = pageKey === 'home' ? null : 1;
      nodes.push(h('div', {class: 'card'}, h('div', {class: 'row'}, h('h2', {style: {margin: 0}}, PAGE_LABELS[pageKey] || pageKey), h('span', {class: 'right row'}, SAMPLE[pageKey] || (sitePages.find(p => p.path.startsWith(SAMPLE_DIR[pageKey] || '~')) || {}).path ? h('a', {class: 'btn sm', href: '#/preview/' + encodeURIComponent(SAMPLE[pageKey] || sitePages.find(p => p.path.startsWith(SAMPLE_DIR[pageKey])).path)}, 'Посмотреть страницу') : null,
          h('button', {class: 'btn sm danger', type: 'button', onclick: async () => { if (!await AD.confirm('Убрать фон со страницы «' + (PAGE_LABELS[pageKey] || pageKey) + '»?', {ok: 'Убрать'})) return; delete bdOf().pages[pageKey]; t.touch(); paintAll(); }}, 'Убрать фон страницы'))),
        h('p', {class: 'muted small', style: {marginTop: '6px'}}, pageKey === 'home' ? 'Главная: фон ставится на отдельные блоки (ниже героя).' : 'Полосы в начале и конце страницы, плюс по желанию фон на отдельных блоках и крупный логотип.'),
        hasVar ? h('div', {style: {marginTop: '12px'}}, h('span', {class: 'lbl'}, 'Варианты (страницы с одним видом — бренды, товары — получают их по очереди)'), h('div', {class: 'row', style: {marginTop: '6px'}}, pageObj.variants.map((v, i) => h('button', {class: 'btn sm' + (i === Math.min(vi, pageObj.variants.length - 1) ? ' primary' : ''), type: 'button', onclick: () => { vi = i; paintPlan(); }}, 'Вариант ' + (i + 1))),
          h('button', {class: 'btn sm', type: 'button', onclick: () => { pageObj.variants.push(clone(pl)); vi = pageObj.variants.length - 1; t.touch(); paintPlan(); }}, '＋ Копия варианта'), pageObj.variants.length > 1 ? h('button', {class: 'btn sm danger', type: 'button', onclick: () => { pageObj.variants.splice(Math.min(vi, pageObj.variants.length - 1), 1); vi = 0; t.touch(); paintPlan(); }}, 'Удалить вариант') : null)) :
          h('div', {style: {marginTop: '10px'}}, h('button', {class: 'btn sm', type: 'button', onclick: () => { const {variants, ...base} = pageObj; bdOf().pages[pageKey] = {variants: [base, clone(base)]}; vi = 0; t.touch(); paintAll(); }}, 'Сделать несколько вариантов фона'))));
      nodes.push(slot('Начало страницы', pl, 'top', {pos: 'tr', help: 'Полоса под шапкой, за заголовком страницы.'}));
      if (pageKey !== 'home') nodes.push(slot('Конец страницы', pl, 'end', {pos: 'br', help: 'Полоса над подвалом.'}));
      /* фон на блоках */
      const mid = pl.mid = pl.mid || []; const midBox = h('div', {class: 'bd-slot'}, h('b', {}, 'Фон на отдельных блоках'), h('div', {class: 'help muted small'}, pageKey === 'home' ? 'Каждому блоку главной — своя текстура.' : 'Выберите блок страницы и текстуру. Блоков на странице: ' + blocks.length + '.'));
      mid.forEach((m, i) => {
        const found = blocks.find(b => b.sel === m.sel && b.n === (m.n || 0)), label = found ? (found.title ? '«' + found.title + '»' : m.sel) : null, ch = () => t.touch();
        const select = h('select', {'aria-label': 'Блок страницы ' + (i + 1), onchange: () => { const b = blocks[+select.value]; if (b) { m.sel = b.sel; if (b.n) m.n = b.n; else delete m.n; t.touch(); paintPlan(); } }}, !found ? h('option', {value: '-1'}, m.sel + (m.n ? ' №' + (m.n + 1) : '') + ' (вручную)') : null, blocks.map((b, bi) => h('option', {value: String(bi)}, (b.title ? b.title + ' — ' : '') + b.sel + (b.n ? ' №' + (b.n + 1) : ''))));
        if (found) select.value = String(blocks.indexOf(found)); else select.value = '-1';
        midBox.append(h('div', {class: 'sub-item'}, h('div', {class: 'top'}, h('span', {class: 'small', style: {flex: 1, minWidth: 0}}, select), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Убрать фон с блока', onclick: () => { mid.splice(i, 1); if (!mid.length) delete pl.mid; t.touch(); paintPlan(); }}, '✕')), texPicker(m, false, ch),
          h('div', {class: 'row top', style: {gap: '24px'}}, h('div', {class: 'field'}, h('span', {class: 'lbl'}, 'Положение'), posPicker(m, 'r', ch)), h('div', {class: 'field', style: {flex: '1 1 220px'}}, h('span', {class: 'lbl'}, 'Сила'), strength(m, ch)))));
      });
      midBox.append(h('div', {}, h('button', {class: 'btn sm', type: 'button', id: 'bd-add-mid', onclick: () => { const used = new Set(mid.map(m => m.sel + '#' + (m.n || 0))), b = blocks.find(x => !used.has(x.sel + '#' + x.n)); if (!b) { AD.toast('Все блоки страницы уже с фоном', 'err'); return; } const it = {sel: b.sel, tex: texKeys()[0], pos: 'r', o: 7}; if (b.n) it.n = b.n; mid.push(it); t.touch(); paintPlan(); }}, '＋ Фон на блок')));
      if (!mid.length && pageKey !== 'home') { /* пусто — оставляем кнопку */ }
      nodes.push(midBox);
      if (pageKey !== 'home') {
        const lg = pl.logo, lgBox = h('div', {class: 'bd-slot'}), sw = h('input', {type: 'checkbox', checked: !!lg, 'aria-label': 'Крупный логотип на фоне', onchange: () => { if (sw.checked) pl.logo = {pos: 'c', o: 6}; else delete pl.logo; t.touch(); paintPlan(); }});
        lgBox.append(h('label', {class: 'switch'}, sw, h('b', {}, 'Крупный логотип «Астрея» на фоне')), h('div', {class: 'help muted small'}, 'Едва заметный знак за содержимым страницы.'));
        if (lg) lgBox.append(h('div', {class: 'row top', style: {gap: '24px', marginTop: '8px'}}, h('div', {class: 'field'}, h('span', {class: 'lbl'}, 'Положение'), (() => { const g = h('div', {class: 'row gap-s', role: 'group', 'aria-label': 'Положение логотипа'}); [['l', 'Слева'], ['c', 'По центру'], ['r', 'Справа']].forEach(([p, tt]) => g.append(h('button', {class: 'btn sm' + ((lg.pos || 'c') === p ? ' primary' : ''), type: 'button', onclick: () => { lg.pos = p; t.touch(); paintPlan(); }}, tt))); return g; })())));
        nodes.push(lgBox);
      }
      planBox.replaceChildren(...nodes);
    }
    function paintList() {
      const keys = Object.keys(PAGE_LABELS);
      pageList.replaceChildren(...keys.map(k => h('button', {type: 'button', 'aria-current': String(k === pageKey), onclick: () => { pageKey = k; vi = 0; history.replaceState(null, '', '#/design/backdrops/' + k); paintAll(); }}, PAGE_LABELS[k], bdOf().pages[k] ? '' : ' ○')));
    }
    function paintAll(keep) { paintList(); paintPlan(); }
    const master = h('input', {type: 'checkbox', id: 'bd-on', checked: !!bdOf().enabled, onchange: () => { bdOf().enabled = master.checked; t.touch(); }});
    box.replaceChildren(h('div', {class: 'card'}, h('label', {class: 'switch'}, master, 'Показывать фоновые вставки на сайте'), h('div', {class: 'help muted small', style: {marginTop: '4px'}}, 'Макро-текстуры крема, шёлка, линий и плёнок за блоками страниц. Выключено — фоны не загружаются вовсе. Новые текстуры рисуются отдельно (папка tools/bg-render), здесь выбираются готовые.')),
      h('div', {class: 'bd-pages', style: {marginTop: 'var(--gap,14px)'}}, pageList, planBox), t.msg);
    box.prepend(t.bar(h('button', {class: 'btn', type: 'button', onclick: () => { t.work = clone(t.orig); master.checked = !!t.work.enabled; paintAll(); t.touch(); }}, 'Отменить правки')));
    paintList(); await paintPlan(); t.touch();
    t.goPage = async k => { if (PAGE_LABELS[k] && k !== pageKey) { pageKey = k; vi = 0; paintAll(); } };
    return t;
  }

  /* ---------- раздел ---------- */
  const TABS = [['menu', 'Меню сайта', menuTab], ['backdrops', 'Фоны страниц', backdropsTab]];
  AD.views.design = {
    async mount(root, parts) {
      const inst = {initial: true}, body = h('div', {}); let tab = null, tabId = null;
      const tabs = h('div', {class: 'dtabs', role: 'tablist', 'aria-label': 'Разделы оформления'}, TABS.map(([id, title]) => h('button', {type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': 'false', dataset: {id}, onclick: () => AD.go('#/design/' + id)}, title)));
      root.append(AD.pageHead('Оформление', 'Меню и фоны сайта. Каждая вкладка сохраняется отдельно; перед записью сервер проверяет данные и пересобирает сайт.'), tabs, body);
      async function open(id, rest) {
        id = TABS.some(t => t[0] === id) ? id : 'menu';
        if (id === tabId) { if (tab && tab.goPage && rest[0]) await tab.goPage(decodeURIComponent(rest[0])); return; }
        if (AD.dirty && !confirm('Есть несохранённые изменения. Перейти без сохранения?')) { history.replaceState(null, '', '#/design/' + tabId); return; }
        AD.dirty = false; tabId = id; tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id)));
        body.replaceChildren(h('p', {class: 'boot'}, 'Загрузка…')); const mine = id, box = h('div', {});
        try { const t = await TABS.find(x => x[0] === id)[2](box, rest); if (tabId !== mine) return; tab = t; body.replaceChildren(box); } catch (e) { if (tabId === mine) body.replaceChildren(AD.errBox(e)); }
      }
      inst.onRoute = p => open(p[0] || 'menu', p.slice(1));
      inst.destroy = () => { AD.dirty = false; };
      await open(parts[0] || 'menu', (parts || []).slice(1)); return inst;
    }
  };
})();
