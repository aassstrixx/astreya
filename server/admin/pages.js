/* Раздел «Страницы»: конструктор своих страниц (data/pages.json). Список страниц, редактор с блоками (текст, картинка, карточки, список, колонки, шаги, цифры, вопросы, призыв, форма)
   и живым предпросмотром рядом. Сохранение проверяется сервером и пересобирает сайт; страница-черновик на сайт не попадает. */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const TR = {а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'};
  const slugify = s => String(s || '').toLowerCase().replace(/[а-яё]/g, c => TR[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const FORM_KINDS = [['partner', 'Стать партнёром'], ['question', 'Вопрос / обратная связь'], ['seminar', 'Запись на мероприятие'], ['product', 'Запрос по товару']];

  /* ---------- поля ---------- */
  let uid = 0; const nid = () => 'pf' + (++uid);
  let touch = () => {};
  function field(label, control, help, id) { return h('div', {class: 'field'}, h('label', {for: id}, label), control, help ? h('div', {class: 'help'}, help) : null); }
  function fText(label, obj, key, o) {
    o = o || {}; const id = nid(), cnt = o.max ? h('span', {class: 'counter'}) : null;
    const el = h(o.area ? 'textarea' : 'input', {id, type: o.area ? null : 'text', rows: o.area ? String(o.rows || 3) : null, placeholder: o.ph || '', maxlength: o.max ? String(o.max) : null, oninput: () => { obj[key] = el.value; upd(); touch(); }});
    el.value = obj[key] === undefined || obj[key] === null ? '' : obj[key];
    const upd = () => { if (cnt) { const n = el.value.length, lo = o.min || 0; cnt.textContent = n + (o.min || o.max ? ' / ' + (o.min ? o.min + '–' : '') + o.max : ''); cnt.className = 'counter ' + (n > o.max || (o.min && n && n < o.min) ? 'bad' : n >= lo && n ? 'good' : ''); } };
    upd(); return field(label, [el, cnt], o.help, id);
  }
  /* список строк в одном поле: абзацы через пустую строку (para) или по строке на пункт */
  function fLines(label, obj, key, o) {
    o = o || {}; const id = nid(), sep = o.para ? /\n\s*\n/ : /\n/, join = o.para ? '\n\n' : '\n';
    const el = h('textarea', {id, rows: String(o.rows || 5), placeholder: o.ph || '', oninput: () => { obj[key] = el.value.split(sep).map(x => x.trim()).filter(Boolean); if (!obj[key].length) obj[key] = ['']; touch(); }});
    el.value = (obj[key] || []).join(join); return field(label, el, o.help || (o.para ? 'Абзацы разделяйте пустой строкой.' : 'Каждый пункт — с новой строки.'), id);
  }
  function fImage(label, obj, key, o) {
    const id = nid(), ok = v => /^assets\/.+\.(png|jpe?g|webp|gif|svg)$/i.test(v || ''), img = h('img', {alt: '', style: {maxHeight: '90px', maxWidth: '160px', borderRadius: '8px', border: '1px solid var(--line)', display: ok(obj[key]) ? 'block' : 'none'}, src: ok(obj[key]) ? '/' + obj[key] : ''});
    const inp = h('input', {id, type: 'text', placeholder: 'assets/…', style: {flex: '1 1 200px'}, oninput: () => { obj[key] = inp.value; img.style.display = ok(inp.value) ? 'block' : 'none'; if (ok(inp.value)) img.src = '/' + inp.value; touch(); }}); inp.value = obj[key] || '';
    return field(label, h('div', {class: 'row'}, img, inp, h('button', {class: 'btn sm', type: 'button', onclick: async () => { const p = await AD.pickImage(); if (p) { inp.value = p; obj[key] = p; img.src = '/' + p; img.style.display = 'block'; touch(); } }}, 'Выбрать / загрузить…')), (o && o.help) || null, id);
  }
  function fLink(label, obj, key, o) {
    const id = nid(), dl = h('datalist', {id: id + '-l'}, (AD._sitePages || []).map(p => h('option', {value: p.path}, p.title)));
    const el = h('input', {id, type: 'text', list: id + '-l', placeholder: 'about.html, pages/akcii.html или https://…', oninput: () => { obj[key] = el.value.trim(); touch(); }}); el.value = obj[key] || '';
    return field(label, [el, dl], (o && o.help) || 'Начните вводить — подскажем страницы сайта. Можно вставить внешний адрес (https://…), телефон (tel:+7…) или почту (mailto:…).', id);
  }
  function fSelect(label, obj, key, opts, dflt) {
    const id = nid(), el = h('select', {id, onchange: () => { obj[key] = el.value; touch(); }}, opts.map(([v, t]) => h('option', {value: v}, t))); el.value = obj[key] !== undefined ? String(obj[key]) : dflt; if (!obj[key]) obj[key] = el.value; return field(label, el, null, id);
  }
  function fSwitch(label, obj, key, help) { const c = h('input', {type: 'checkbox', checked: !!obj[key], onchange: () => { obj[key] = c.checked; touch(); }}); return h('div', {class: 'field'}, h('label', {class: 'switch'}, c, label), help ? h('div', {class: 'help'}, help) : null); }
  /* список вложенных элементов с добавлением, порядком и удалением */
  function subList(obj, key, blank, render, o) {
    o = o || {}; const box = h('div', {class: 'sub-list'}); obj[key] = obj[key] || [];
    const paint = () => { box.replaceChildren(...obj[key].map((it, i) => {
      const mv = d => { const j = i + d; if (j < 0 || j >= obj[key].length) return; [obj[key][i], obj[key][j]] = [obj[key][j], obj[key][i]]; touch(); paint(); };
      return h('div', {class: 'sub-item'}, h('div', {class: 'top'}, h('b', {class: 'small'}, (o.noun || 'Пункт') + ' ' + (i + 1)), h('span', {class: 'bl-ctl'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => mv(-1)}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Ниже', disabled: i === obj[key].length - 1, onclick: () => mv(1)}, '↓'), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить пункт', onclick: () => { obj[key].splice(i, 1); touch(); paint(); }}, '✕'))), render(it, i));
    }), h('div', {}, h('button', {class: 'btn sm', type: 'button', onclick: () => { obj[key].push(blank()); touch(); paint(); }}, '＋ Добавить ' + (o.noun || 'пункт').toLowerCase()))); };
    paint(); return box;
  }

  /* ---------- блоки ---------- */
  const T = {
    text: {title: 'Текст', hint: 'Заголовок и абзацы', make: () => ({type: 'text', title: '', paragraphs: ['']}), sum: b => b.title || (b.paragraphs || [])[0] || '',
      form: b => [fText('Заголовок (необязательно)', b, 'title', {max: 120}), fLines('Текст', b, 'paragraphs', {para: true, rows: 7})]},
    image: {title: 'Картинка', hint: 'Фото с подписью', make: () => ({type: 'image', src: '', alt: '', caption: '', wide: false}), sum: b => b.alt || b.src || '',
      form: b => [fImage('Картинка', b, 'src'), fText('Описание картинки (alt)', b, 'alt', {max: 200, help: 'Для читающих с экрана и поисковиков: что на фото.'}), fText('Подпись под картинкой', b, 'caption', {max: 200}), fSwitch('На всю ширину', b, 'wide')]},
    cards: {title: 'Карточки', hint: 'Сетка из 2–4 карточек', make: () => ({type: 'cards', eyebrow: '', title: 'Заголовок раздела', cols: 3, items: [{title: 'Первая карточка', text: '', href: '', image: ''}]}), sum: b => b.title || '',
      form: b => [fText('Надпись над заголовком', b, 'eyebrow', {max: 60}), fText('Заголовок', b, 'title', {max: 120}), fSelect('Колонок', b, 'cols', [['2', '2'], ['3', '3'], ['4', '4']], '3'),
        subList(b, 'items', () => ({title: '', text: '', href: '', image: ''}), it => [fText('Заголовок карточки', it, 'title', {max: 100}), fText('Текст', it, 'text', {area: true, max: 600}), fLink('Ссылка (необязательно)', it, 'href'), fImage('Картинка (необязательно)', it, 'image')], {noun: 'Карточка'})]},
    list: {title: 'Список', hint: 'Пункты с галочками', make: () => ({type: 'list', title: '', items: ['']}), sum: b => b.title || (b.items || [])[0] || '',
      form: b => [fText('Заголовок (необязательно)', b, 'title', {max: 120}), fLines('Пункты', b, 'items', {rows: 6})]},
    columns: {title: 'Две колонки', hint: 'Текст в два столбца', make: () => ({type: 'columns', title: '', left: [''], right: ['']}), sum: b => b.title || (b.left || [])[0] || '',
      form: b => [fText('Заголовок (необязательно)', b, 'title', {max: 120}), fLines('Левая колонка', b, 'left', {para: true}), fLines('Правая колонка', b, 'right', {para: true})]},
    steps: {title: 'Шаги', hint: 'Нумерованный путь', make: () => ({type: 'steps', eyebrow: '', title: 'Как это работает', items: [{title: 'Первый шаг', text: ''}]}), sum: b => b.title || '',
      form: b => [fText('Надпись над заголовком', b, 'eyebrow', {max: 60}), fText('Заголовок', b, 'title', {max: 120}), subList(b, 'items', () => ({title: '', text: ''}), it => [fText('Название шага', it, 'title', {max: 100}), fText('Описание', it, 'text', {area: true, max: 500})], {noun: 'Шаг'})]},
    stats: {title: 'Цифры', hint: 'Крупные показатели', make: () => ({type: 'stats', items: [{value: '', label: ''}]}), sum: b => (b.items || []).map(x => x.value).join(' · '),
      form: b => [subList(b, 'items', () => ({value: '', label: ''}), it => h('div', {class: 'grid2'}, fText('Значение', it, 'value', {max: 12, ph: '20+'}), fText('Подпись', it, 'label', {max: 80})), {noun: 'Цифра'})]},
    faq: {title: 'Вопросы и ответы', hint: 'Раскрывающиеся ответы', make: () => ({type: 'faq', eyebrow: '', title: 'Частые вопросы', items: [{q: '', a: ''}]}), sum: b => b.title || '',
      form: b => [fText('Надпись над заголовком', b, 'eyebrow', {max: 60}), fText('Заголовок', b, 'title', {max: 120}), subList(b, 'items', () => ({q: '', a: ''}), it => [fText('Вопрос', it, 'q'), fText('Ответ', it, 'a', {area: true, rows: 3})], {noun: 'Вопрос'})]},
    cta: {title: 'Призыв к действию', hint: 'Крупная кнопка', make: () => ({type: 'cta', eyebrow: '', title: 'Заголовок призыва', text: '', label: 'Подробнее', href: '', tone: 'dark'}), sum: b => b.title || '',
      form: b => [fText('Надпись над заголовком', b, 'eyebrow', {max: 60}), fText('Заголовок', b, 'title', {max: 120}), fText('Текст (необязательно)', b, 'text', {area: true, max: 400}), fText('Подпись кнопки', b, 'label', {max: 40}), fLink('Ссылка кнопки', b, 'href'), fSelect('Оформление', b, 'tone', [['dark', 'Тёмная плашка'], ['light', 'Светлая карточка']], 'dark')]},
    form: {title: 'Форма заявки', hint: 'Заявка уйдёт в раздел «Заявки»', make: () => ({type: 'form', title: 'Оставьте заявку', text: '', kind: 'question'}), sum: b => b.title || '',
      form: b => [fText('Заголовок', b, 'title', {max: 120}), fText('Пояснение', b, 'text', {area: true, max: 400}), fSelect('Вид формы', b, 'kind', FORM_KINDS, 'question')]}
  };
  const blank = {slug: '', title: '', eyebrow: '', lead: '', description: '', published: false, noindex: false, nav: false, navTitle: '', blocks: []};
  const TEMPLATES = [
    ['Пустая страница', 'Заголовок, дальше — блоки по вашему выбору', () => []],
    ['Информационная', 'Текст, список преимуществ, призыв', () => [T.text.make(), T.list.make(), T.cta.make()]],
    ['Вопросы и ответы', 'Вступление, вопросы, форма', () => [T.text.make(), T.faq.make(), Object.assign(T.form.make(), {title: 'Не нашли ответ? Напишите нам'})]],
    ['Предложение / акция', 'Цифры, карточки условий, призыв', () => [T.stats.make(), T.cards.make(), T.cta.make()]],
    ['Для партнёров', 'Описание, шаги, форма партнёра', () => [T.text.make(), T.steps.make(), Object.assign(T.form.make(), {kind: 'partner', title: 'Стать партнёром'})]]
  ];

  /* ---------- раздел ---------- */
  AD.views.pages = {
    async mount(root, parts) {
      const inst = {initial: true, page: null};
      let cur = await AD.get('/api/collections/pages'); try { AD._sitePages = (await AD.get('/api/site-pages')).pages; } catch (e) { AD._sitePages = []; }
      const items = () => cur.data.items;
      const reload = async () => { cur = await AD.get('/api/collections/pages'); try { AD._sitePages = (await AD.get('/api/site-pages')).pages; } catch (e) {} };
      async function commit(next, btn) { return AD.busy(btn, async () => { const r = await AD.put('/api/collections/pages', {data: Object.assign({}, cur.data, {items: next}), version: cur.version}); await reload(); return r; }); }

      function listView() {
        root.replaceChildren(); AD.dirty = false; touch = () => {};
        const tbody = h('tbody', {}), q = h('input', {type: 'search', class: 'grow', placeholder: 'Поиск по названию или адресу…', 'aria-label': 'Поиск', oninput: paint}), msg = h('div', {});
        function paint() {
          const t = q.value.trim().toLowerCase(), rows = items().filter(p => !t || (p.title + ' ' + p.slug).toLowerCase().includes(t));
          tbody.replaceChildren(...rows.map(p => h('tr', {class: 'click', tabindex: '0', onclick: () => AD.go('#/pages/' + encodeURIComponent(p.slug)), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) AD.go('#/pages/' + encodeURIComponent(p.slug)); }},
            h('td', {dataset: {l: 'Название'}}, h('b', {}, p.title), p.nav ? h('span', {class: 'pill', style: {marginLeft: '8px'}}, 'в меню') : null),
            h('td', {dataset: {l: 'Адрес'}, class: 'mono'}, 'pages/' + p.slug + '.html'),
            h('td', {dataset: {l: 'Статус'}}, p.published === false ? h('span', {class: 'pill'}, 'черновик') : h('span', {class: 'pill done'}, 'на сайте')),
            h('td', {dataset: {l: 'Блоков'}}, String((p.blocks || []).length)),
            h('td', {class: 'nowrap', onclick: e => e.stopPropagation()}, p.published !== false ? [h('a', {class: 'btn sm', href: '/pages/' + p.slug + '.html', target: '_blank', rel: 'noopener'}, 'На сайте'), ' '] : null,
              h('button', {class: 'btn sm', type: 'button', onclick: () => duplicate(p)}, 'Копия'), ' ', h('button', {class: 'btn sm danger', type: 'button', onclick: () => remove(p)}, 'Удалить')))));
          empty.hidden = rows.length > 0 || !items().length; none.hidden = items().length > 0;
        }
        const empty = h('div', {class: 'empty', hidden: true}, h('b', {}, 'Ничего не найдено'), 'Измените запрос.'), none = h('div', {class: 'empty', hidden: true}, h('b', {}, 'Своих страниц пока нет'), 'Создайте страницу — акцию, «О сотрудничестве», подробные условия. Она появится по адресу pages/…html, в поиске по сайту, карте сайта и (по желанию) в меню.', h('div', {style: {marginTop: '12px'}}, h('button', {class: 'btn primary', type: 'button', onclick: newDialog}, '＋ Создать первую страницу')));
        async function remove(p) { if (!await AD.confirm('Удалить страницу «' + p.title + '»? Адрес pages/' + p.slug + '.html перестанет работать. Восстановить можно через «История».', {ok: 'Удалить'})) return; try { await commit(items().filter(x => x.slug !== p.slug)); AD.toast('Страница удалена, сайт пересобран', 'ok'); paint(); msg.replaceChildren(); } catch (e) { msg.replaceChildren(AD.errBox(e)); } }
        async function duplicate(p) { const c = clone(p); c.title += ' (копия)'; c.slug = uniqueSlug(slugify(c.title)); c.published = false; c.nav = false; try { await commit([...items(), c]); AD.toast('Копия создана как черновик', 'ok'); AD.go('#/pages/' + c.slug); } catch (e) { msg.replaceChildren(AD.errBox(e)); } }
        root.append(AD.pageHead('Страницы', 'Свои страницы сайта: акции, условия, информация. Собирайте из готовых блоков — текст, картинки, карточки, вопросы, форма заявки.', h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog('pages', async () => { await reload(); paint(); })}, 'История'), h('button', {class: 'btn primary', type: 'button', id: 'new-page', onclick: newDialog}, '＋ Новая страница')), msg,
          h('div', {class: 'toolbar'}, q), h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Название', 'Адрес', 'Статус', 'Блоков', ''].map(t => h('th', {}, t)))), tbody), empty, none));
        paint();
      }
      const uniqueSlug = s => { let b = s || 'page', n = b, i = 2; while (items().some(p => p.slug === n)) n = b + '-' + (i++); return n; };
      function newDialog() {
        const title = h('input', {type: 'text', id: 'np-title', placeholder: 'Например: Условия сотрудничества', maxlength: '120'}); let tpl = 0;
        const cards = TEMPLATES.map(([t, d], i) => h('button', {class: 'add-card', type: 'button', 'aria-pressed': i === 0 ? 'true' : 'false', onclick: e => { tpl = i; cards.forEach((c, j) => c.setAttribute('aria-pressed', j === i ? 'true' : 'false')); }}, h('b', {}, t), h('span', {}, d)));
        const m = AD.modal({title: 'Новая страница', cls: 'wide', body: [field('Название страницы', title, 'Станет заголовком; адрес построим из него.', 'np-title'), h('div', {class: 'lbl', style: {margin: '12px 0 6px'}}, 'С чего начать'), h('div', {class: 'page-tpl'}, cards), h('p', {class: 'muted small', style: {marginTop: '10px'}}, 'Страница создаётся как черновик — на сайт она попадёт, когда вы включите «Опубликована».')],
          footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), h('button', {class: 'btn primary', type: 'button', id: 'np-go', onclick: () => { const t = title.value.trim(); if (!t) { title.classList.add('bad'); title.focus(); return; } m.close(true); const p = Object.assign(clone(blank), {title: t, slug: uniqueSlug(slugify(t)), blocks: TEMPLATES[tpl][2]()}); inst.edit(p, true); history.replaceState(null, '', '#/pages/__edit'); }}, 'Создать')]});
      }

      /* ----- редактор страницы ----- */
      function editView(src, isNew) {
        root.replaceChildren(); const work = clone(src), msg = h('div', {}), state = h('span', {class: 'muted small'}); let savedSlug = isNew ? null : src.slug, origStr = JSON.stringify(work);
        const saveBtn = h('button', {class: 'btn primary', type: 'button', id: 'pg-save', disabled: !isNew}, isNew ? 'Создать страницу' : 'Сохранить'), frame = h('div', {class: 'frame'});
        const dirtyNow = () => JSON.stringify(work) !== origStr;
        touch = () => { const fresh = !savedSlug, d = dirtyNow() || fresh; AD.dirty = d; saveBtn.disabled = !d; AD.fill(state, d ? [h('span', {class: 'dot'}), fresh ? 'Страница ещё не сохранена' : 'Есть несохранённые изменения'] : ''); };
        const showPrev = () => { if (!savedSlug || work.published === false) { AD.fill(frame, h('div', {class: 'hint'}, savedSlug ? 'Страница — черновик: на сайт она не попадает. Включите «Опубликована» и сохраните, чтобы увидеть её здесь.' : 'Предпросмотр появится после первого сохранения.')); return; }
          const f = h('iframe', {title: 'Предпросмотр страницы', src: '/pages/' + savedSlug + '.html?pv=' + Date.now(), loading: 'lazy'}); AD.fill(frame, f); };
        /* настройки */
        const titleF = fText('Заголовок страницы (H1)', work, 'title', {max: 120}), slugF = fText('Адрес страницы', work, 'slug', {max: 60, help: 'Только латинские буквы, цифры и дефисы. Страница будет доступна по адресу pages/…html. Если сменить адрес, старый перестанет работать.'});
        const settings = h('div', {class: 'card'}, h('h2', {}, 'Страница'), h('div', {class: 'ed-obj', style: {display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px'}},
          titleF, fText('Надпись над заголовком', work, 'eyebrow', {max: 60}), fText('Подводка под заголовком', work, 'lead', {area: true, max: 500, rows: 2}), slugF,
          fText('Описание для поиска (то, что видно в Google и Яндексе)', work, 'description', {area: true, rows: 2, min: 70, max: 160, help: 'Лучше 70–160 символов. Если пусто — возьмём подводку.'}),
          h('div', {class: 'grid2'}, fSwitch('Опубликована', work, 'published', 'Выключено — черновик, на сайте её нет.'), fSwitch('Не показывать в поиске Google', work, 'noindex', 'Страница откроется по ссылке, но в карту сайта не попадёт.')),
          fSwitch('Показывать в меню сайта', work, 'nav', 'Не больше четырёх своих страниц в меню.'), fText('Подпись в меню', work, 'navTitle', {max: 24, help: 'Коротко: до 24 символов.'})));
        const ti = titleF.querySelector('input'), si = slugF.querySelector('input'); let slugTouched = !isNew;
        si.addEventListener('input', () => { slugTouched = true; });
        if (isNew) ti.addEventListener('input', () => { if (!slugTouched) { work.slug = uniqueSlug(slugify(ti.value)); si.value = work.slug; } });
        /* блоки */
        const blocksBox = h('div', {}), openSet = new WeakSet();                                   // какие блоки раскрыты — запоминаем по самому блоку, чтобы порядок и удаление не сворачивали остальные
        if (work.blocks.length <= 2) work.blocks.forEach(x => openSet.add(x));
        function paintBlocks() {
          blocksBox.replaceChildren(...work.blocks.map((b, i) => {
            const t = T[b.type] || {title: b.type, form: () => [], sum: () => ''}, sm = h('span', {class: 'sum'}, t.sum(b)), bid = nid(), mv = d => { const j = i + d; if (j < 0 || j >= work.blocks.length) return; [work.blocks[i], work.blocks[j]] = [work.blocks[j], work.blocks[i]]; touch(); paintBlocks(); };
            const tg = h('button', {class: 'tg', type: 'button', 'aria-expanded': 'false', 'aria-controls': bid, onclick: () => { blk.open = !blk.open; }}, h('span', {class: 'tp'}, t.title), sm);
            const body = h('div', {class: 'in', id: bid, hidden: true}); body.append(...[].concat(t.form(b)));
            const blk = h('div', {class: 'blk'}, h('div', {class: 'hd'}, tg, h('span', {class: 'bl-ctl'},
              h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Блок выше', disabled: i === 0, onclick: () => mv(-1)}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Блок ниже', disabled: i === work.blocks.length - 1, onclick: () => mv(1)}, '↓'),
              h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Дублировать блок', title: 'Дублировать', onclick: () => { work.blocks.splice(i + 1, 0, clone(b)); touch(); paintBlocks(); }}, '⧉'),
              h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить блок', onclick: () => { work.blocks.splice(i, 1); touch(); paintBlocks(); }}, '✕'))), body);
            Object.defineProperty(blk, 'open', {get: () => !body.hidden, set: v => { body.hidden = !v; tg.setAttribute('aria-expanded', String(!!v)); blk.classList.toggle('open', !!v); if (v) openSet.add(b); else openSet.delete(b); }});
            body.addEventListener('input', () => { sm.textContent = t.sum(b); blk.classList.remove('err'); }); body.addEventListener('change', () => { sm.textContent = t.sum(b); });
            blk.open = openSet.has(b); return blk;
          }));
          if (!work.blocks.length) blocksBox.append(h('div', {class: 'empty'}, h('b', {}, 'Блоков пока нет'), 'Добавьте первый блок — например, «Текст».'));
        }
        /* блоки, на которые пожаловался сервер («…блок 2…»), подсвечиваем и раскрываем */
        const markBad = e => { const bad = new Set(((e.data && e.data.problems) || []).map(x => /блок (\d+)/.exec(x)).filter(Boolean).map(m => +m[1] - 1)); blocksBox.querySelectorAll('.blk').forEach((d, i) => { d.classList.toggle('err', bad.has(i)); if (bad.has(i)) d.open = true; }); };
        const addBtn = h('button', {class: 'btn primary', type: 'button', id: 'add-block', onclick: () => {
          const m = AD.modal({title: 'Какой блок добавить?', cls: 'wide', body: h('div', {class: 'add-grid'}, Object.entries(T).map(([k, t]) => h('button', {class: 'add-card', type: 'button', dataset: {type: k}, onclick: () => { work.blocks.push(t.make()); m.close(); touch(); paintBlocks(); const last = blocksBox.querySelector('.blk:last-child'); if (last) { last.open = true; last.scrollIntoView({behavior: 'smooth', block: 'center'}); } }}, h('b', {}, t.title), h('span', {}, t.hint))))});
        }}, '＋ Добавить блок');
        paintBlocks();
        saveBtn.addEventListener('click', () => AD.busy(saveBtn, async () => {
          msg.replaceChildren(); work.slug = String(work.slug || '').trim() || slugify(work.title);
          ['eyebrow', 'lead', 'description', 'navTitle'].forEach(k => { if (work[k] === '') delete work[k]; });
          const next = items().slice(), pos = savedSlug ? next.findIndex(p => p.slug === savedSlug) : -1; if (pos >= 0) next[pos] = work; else next.push(work);
          try { const r = await AD.put('/api/collections/pages', {data: Object.assign({}, cur.data, {items: next}), version: cur.version}); await reload(); savedSlug = work.slug; src = clone(work); AD.dirty = false; AD.toast(r.build ? 'Сохранено, сайт пересобран' : 'Сохранено', 'ok'); inst.hash = '#/pages/' + encodeURIComponent(work.slug); history.replaceState(null, '', inst.hash);
            origStr = JSON.stringify(work); touch(); showPrev(); saveBtn.textContent = 'Сохранить'; }
          catch (e) { markBad(e); msg.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => { AD.dirty = false; AD.go('#/pages'); location.reload(); }}, 'Загрузить актуальную версию')) : AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); }
        }).then(() => touch()));
        const bar = h('div', {class: 'savebar'}, saveBtn, state, h('span', {class: 'right row'}, h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog('pages', () => AD.go('#/pages'))}, 'История'), h('button', {class: 'btn ghost', type: 'button', onclick: () => { if (!AD.dirty || confirm('Закрыть без сохранения?')) { AD.dirty = false; AD.go('#/pages'); } }}, 'К списку')));
        root.append(h('div', {class: 'crumbs'}, h('a', {href: '#/pages'}, 'Страницы'), ' › ', isNew ? 'Новая страница' : src.title), AD.pageHead(isNew ? 'Новая страница' : src.title), bar, msg,
          h('div', {class: 'pb'}, h('div', {}, settings, h('div', {class: 'row', style: {margin: '16px 0 10px'}}, h('h2', {style: {margin: 0}}, 'Содержимое'), h('span', {class: 'right'}, addBtn)), blocksBox),
            h('div', {class: 'pb-prev'}, h('div', {class: 'row'}, h('b', {}, 'Предпросмотр'), h('span', {class: 'right row gap-s'}, h('button', {class: 'btn sm', type: 'button', onclick: showPrev}, 'Обновить'), h('a', {class: 'btn sm', href: '#/preview', onclick: e => { if (savedSlug) { e.preventDefault(); AD.go('#/preview/' + encodeURIComponent('pages/' + savedSlug + '.html')); } }}, 'Большой экран'))), frame)));
        showPrev(); touch();
        return {destroy() { AD.dirty = false; touch = () => {}; }};
      }
      inst.edit = (p, isNew) => { inst.page = editView(p, isNew); inst.hash = '#/pages/' + (isNew ? '__edit' : encodeURIComponent(p.slug)); };
      inst.onRoute = async p => {
        const slug = p[0] === undefined ? undefined : decodeURIComponent(p[0]);
        if (slug === '__edit' && inst.page) return;                                           // редактор новой страницы уже открыт
        if (inst.page && AD.dirty && !confirm('Есть несохранённые изменения. Закрыть страницу без сохранения?')) { history.replaceState(null, '', inst.hash || '#/pages'); return; }
        if (inst.page && inst.page.destroy) inst.page.destroy(); inst.page = null;
        if (slug === undefined || slug === '__edit') return listView();
        if (slug === '__new') { listView(); newDialog(); return; }
        const pg = items().find(x => x.slug === slug); if (!pg) { AD.toast('Страница «' + slug + '» не найдена', 'err'); AD.go('#/pages'); return; }
        inst.edit(pg, false);
      };
      inst.destroy = () => { if (inst.page && inst.page.destroy) inst.page.destroy(); AD.dirty = false; };
      await inst.onRoute(parts || []); return inst;
    }
  };
})();
