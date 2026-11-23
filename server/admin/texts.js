/* Раздел «Тексты страниц»: все тексты шаблонов сайта (заголовки, подписи, кнопки, подсказки) — страница → блок → поле.
   Реестр ключей приходит с сервера (/api/texts/registry), значения заказчика лежат в data/texts.json. Пока поле не правили, на сайте исходный текст.
   Черновик автоматически хранится в браузере, Ctrl+S сохраняет, справа можно открыть предпросмотр страницы. Текст вставляется только как текст (без innerHTML). */
(function () {
  'use strict';
  const {h} = AD;
  const LS = 'ad.draft.texts';
  const lsGet = () => { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); return v && v.d && typeof v.d === 'object' ? v : null; } catch (e) { return null; } };
  const lsSet = d => { try { if (Object.keys(d).length) localStorage.setItem(LS, JSON.stringify({at: Date.now(), d})); else localStorage.removeItem(LS); } catch (e) {} };
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const TAGS = /^<\/?(?:br|em|strong|b|i|wbr|sup|sub|small)\s*\/?>$/i;
  const ACTIVE = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form|svg)\b|javascript:|\bon\w+\s*=|data:text\/html/i;
  const TYPE_HELP = {data: 'Текст из данных сайта (data/*.json): сохраняется прямо в свой файл.', line: 'Одна строка.', text: 'Абзац.', rich: 'Можно <br> (перенос), <em> (курсив), <strong> (жирный) и &nbsp; (неразрывный пробел).', link: 'Ссылка: страница сайта (catalog.html), якорь (#cp-req), https://… , tel: или mailto:.'};
  /* те же правила, что на сервере (сервер всё равно проверит) */
  function check(it, v) {
    const s = String(v).trim(), len = Array.from(s).length;
    if (!s) return it.optional ? '' : 'Поле не должно быть пустым — верните исходный текст кнопкой справа.';
    if (len > it.max) return len + ' символов — слишком длинно (не больше ' + it.max + ').';
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) return 'Недопустимые управляющие символы.';
    if (it.type === 'data') { if (Array.from(s).length > it.max) return len + ' символов — слишком длинно (не больше ' + it.max + ').'; return ACTIVE.test(s) ? 'Скрипты, формы, встроенные кадры и обработчики событий в тексте недопустимы.' : ''; }
    if (it.type === 'link') return /^(?:(?:[\w.-]+\/)*[\w.-]+\.html(?:[?#][\w\-=&%./]*)?|#[\w-]+|https?:\/\/[^\s<>"']+|tel:\+?[\d\s()-]{5,20}|mailto:[^\s<>"']+)$/.test(s) ? '' : 'Нужна ссылка: страница сайта (catalog.html), якорь (#cp-req), адрес https://… , tel: или mailto:.';
    if (it.type === 'rich') { const bad = (s.match(/<\/?[a-z][^>]*>/gi) || []).filter(t => !TAGS.test(t)); return bad.length ? 'Разрешены только теги <br>, <em>, <strong>, <b>, <i> (лишнее: ' + bad[0].slice(0, 24) + ').' : ''; }
    if (/[<>]/.test(s)) return 'Символы < и > здесь не нужны: поле — простой текст.';
    if (it.type === 'line' && /[\r\n]/.test(s)) return 'В этом поле один абзац, без переводов строки.';
    return '';
  }

  AD.views.texts = {
    async mount(root, parts) {
      const inst = {initial: true};
      const [reg0, cur0, dat0] = await Promise.all([AD.get('/api/texts/registry'), AD.get('/api/collections/texts'), AD.get('/api/texts/data')]);
      let reg = null, dat = dat0, items = {};
      /* к текстам шаблонов добавляются тексты из data/content.json и data/redesign.json (страница → блок → поле) */
      function build() {
        reg = JSON.parse(JSON.stringify(reg0));
        dat.pages.forEach(dp => { let pg = reg.pages.find(x => x.id === dp.id); if (!pg) { pg = {id: dp.id, title: dp.title || dp.id, url: 'index.html', blocks: []}; reg.pages.push(pg); } dp.blocks.forEach(b => pg.blocks.push({id: b.id, title: b.title, items: b.fields.map(f => ({key: 'd:' + f.id, label: f.label, type: 'data', multi: f.type === 'text', max: 3000, def: f.value, hint: '', optional: false, data: {coll: f.coll, path: f.path}}))})); });
        items = {}; reg.pages.forEach(p => p.blocks.forEach(b => b.items.forEach(i => { items[i.key] = Object.assign({page: p, block: b}, i); })));
      }
      build();
      let cur = cur0, over = Object.assign({}, (cur.data && cur.data.items) || {});
      const stored = lsGet(); let draft = {};                              // правки, ещё не сохранённые на сервер: ключ → текст
      const valueOf = it => (it.key in draft ? draft[it.key] : (typeof over[it.key] === 'string' ? over[it.key] : it.def));
      const isChanged = it => valueOf(it) !== it.def;
      const pageChanged = p => p.blocks.reduce((n, b) => n + b.items.filter(isChanged).length, 0);
      const msg = h('div', {}), body = h('div', {});
      let pageId = parts[0] || '', q = '', showPrev = false, frame = null;
      try { showPrev = localStorage.getItem('ad.texts.prev') === '1'; } catch (e) {}
      const dirty = () => Object.keys(draft).length;
      const refreshDirty = () => { AD.dirty = dirty() > 0; lsSet(draft); };

      /* ---- поле ---- */
      function field(it) {
        let ctl; const bad = h('div', {class: 'tx-err', role: 'alert', hidden: true}), count = h('span', {class: 'counter'}), chg = h('span', {class: 'tx-chg', hidden: true}, 'изменено');
        const box = h('div', {class: 'tx-f'});
        const revert = h('button', {class: 'btn sm ghost', type: 'button', hidden: true, title: 'Вернуть текст, который был на сайте с самого начала', onclick: () => { set(it.def, true); }}, (it.data ? 'Вернуть как было' : 'Вернуть исходный'));
        const fit = () => { if (ctl.tagName === 'TEXTAREA') { ctl.style.height = 'auto'; ctl.style.height = Math.min(360, ctl.scrollHeight + 2) + 'px'; } };
        function paint() {
          const v = ctl.value, err = check(it, v), ch = v !== it.def;
          count.textContent = Array.from(v).length + ' / ' + it.max; count.classList.toggle('bad', Array.from(v).length > it.max);
          bad.textContent = err; bad.hidden = !err; box.classList.toggle('bad', !!err); box.classList.toggle('chg', ch); chg.hidden = !ch; revert.hidden = !ch; ctl.classList.toggle('bad', !!err);
        }
        function set(v, fromBtn) { ctl.value = v; store(); if (fromBtn) fit(); paint(); }
        function store() { const v = ctl.value, saved = typeof over[it.key] === 'string' ? over[it.key] : it.def; if (v === saved) delete draft[it.key]; else draft[it.key] = v; refreshDirty(); updateBar(); }
        ctl = (it.type === 'line' || it.type === 'link') || (it.type === 'data' && !it.multi) ? h('input', {type: 'text', id: 'tx-' + it.key, value: valueOf(it), maxlength: String(it.max + 40), autocomplete: 'off', spellcheck: 'true'}) : h('textarea', {id: 'tx-' + it.key, rows: '2', spellcheck: 'true'}, valueOf(it));
        ctl.addEventListener('input', () => { store(); fit(); paint(); updateTile(); });
        AD.fill(box, h('div', {class: 'tx-top'}, h('label', {for: 'tx-' + it.key}, it.label), chg, h('span', {class: 'tx-k'}, it.data ? it.data.coll + ' › ' + it.data.path.join(' › ') : it.key)), ctl, bad,
          h('div', {class: 'tx-meta'}, count, h('span', {class: 'tx-type'}, TYPE_HELP[it.type]), h('span', {class: 'right'}, revert)), it.hint ? h('div', {class: 'help'}, it.hint) : null);
        box.update = () => { const v = valueOf(it); if (ctl.value !== v) ctl.value = v; fit(); paint(); };
        setTimeout(() => { fit(); paint(); }, 0);
        return box;
      }
      /* ---- панель сохранения ---- */
      const saveBtn = h('button', {class: 'btn primary', type: 'button', disabled: true, onclick: () => save()}, 'Сохранить'), state = h('span', {class: 'muted small'});
      const resetBtn = h('button', {class: 'btn ghost', type: 'button', onclick: async () => { if (!dirty() || await AD.confirm('Отменить все несохранённые изменения текстов?', {ok: 'Отменить изменения'})) { draft = {}; refreshDirty(); render(); } }}, 'Сбросить');
      const bar = h('div', {class: 'savebar'}, saveBtn, state, h('span', {class: 'right row'}, resetBtn, h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog('texts', () => AD.get('/api/collections/texts').then(c => { cur = c; over = Object.assign({}, c.data.items || {}); draft = {}; refreshDirty(); render(); }))}, 'История')));
      function updateBar() { const n = dirty(); saveBtn.disabled = !n; bar.classList.toggle('dirty', n > 0); AD.fill(state, n ? [h('span', {class: 'dot'}), 'Не сохранено: ' + n + ' ' + AD.plural(n, 'текст', 'текста', 'текстов')] : ''); }
      function badOnes() { return Object.keys(draft).filter(k => items[k] && check(items[k], draft[k])); }
      async function save() {
        msg.replaceChildren();
        const bads = badOnes(); if (bads.length) { msg.replaceChildren(AD.alertBox('err', 'Исправьте поля с ошибками: ' + bads.slice(0, 4).map(k => '«' + items[k].label + '»').join(', ') + (bads.length > 4 ? ' и ещё ' + (bads.length - 4) : '') + '.')); const el = document.getElementById('tx-' + bads[0]); if (el) el.focus(); return; }
        const next = Object.assign({}, over), dch = Object.keys(draft).filter(k => items[k] && items[k].data).map(k => ({coll: items[k].data.coll, path: items[k].data.path, from: items[k].def, value: draft[k].trim()})), hasTexts = Object.keys(draft).some(k => items[k] && !items[k].data);
        Object.keys(draft).forEach(k => { const it = items[k]; if (!it || it.data) return; const v = draft[k].trim(); if (v === it.def.trim() || (!v && !it.optional)) delete next[k]; else next[k] = v; });
        await AD.busy(saveBtn, async () => {
          try {
            let r = null;
            if (dch.length) r = await AD.post('/api/texts/data', {changes: dch});
            if (hasTexts || !dch.length) r = await AD.put('/api/collections/texts', {data: Object.assign({}, cur.data, {items: next}), version: cur.version});
            cur = await AD.get('/api/collections/texts'); over = Object.assign({}, cur.data.items || {}); if (dch.length) { dat = await AD.get('/api/texts/data'); build(); } draft = {}; refreshDirty(); render();
            AD.toast(r.build ? 'Сохранено, сайт пересобран (' + (r.build.ms / 1000).toFixed(1) + ' с)' : r.unchanged ? 'Изменений нет' : 'Сохранено', 'ok'); reloadFrame();
          } catch (e) { msg.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: async () => { cur = await AD.get('/api/collections/texts'); over = Object.assign({}, cur.data.items || {}); msg.replaceChildren(); render(); }}, 'Загрузить актуальную версию')) : AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); }
        });
      }
      AD.saveHook = () => { if (!saveBtn.disabled) save(); };
      const tiles = {};
      function updateTile() { Object.entries(tiles).forEach(([id, t]) => { const p = reg.pages.find(x => x.id === id), n = pageChanged(p); t.chg.hidden = !n; t.chg.textContent = n + ' ' + AD.plural(n, 'правка', 'правки', 'правок'); }); }
      function reloadFrame() { if (frame && pageId) { const pg = reg.pages.find(x => x.id === pageId); if (pg) frame.src = AD.previewUrl(pg.url + (pg.url.includes('?') ? '&' : '?') + 'pv=' + Date.now()); } }

      /* ---- экраны ---- */
      function draftBanner() {
        const s = stored && !dirty() && Object.keys(stored.d).filter(k => items[k]).length ? stored : null; if (!s) return null;
        const n = Object.keys(s.d).filter(k => items[k]).length;
        return h('div', {class: 'draft-note'}, h('span', {}, 'Найден несохранённый черновик: ' + n + ' ' + AD.plural(n, 'текст', 'текста', 'текстов') + ' (' + AD.fmt(new Date(s.at).toISOString()) + ').'),
          h('button', {class: 'btn sm primary', type: 'button', onclick: () => { Object.keys(s.d).forEach(k => { if (items[k]) draft[k] = s.d[k]; }); stored.d = {}; refreshDirty(); render(); }}, 'Восстановить'), h('button', {class: 'btn sm', type: 'button', onclick: () => { stored.d = {}; lsSet({}); render(); }}, 'Отбросить'));
      }
      function searchRow(it) { return h('div', {class: 'tx-sr'}, h('div', {class: 'tx-path'}, h('a', {href: '#/texts/' + it.page.id}, it.page.title), ' › ', it.block.title), field(it)); }
      function overview() {
        const input = h('input', {type: 'search', id: 'tx-q', class: 'grow', placeholder: 'Найти текст по всему сайту: слово из заголовка, подписи, кнопки…', value: q, 'aria-label': 'Поиск по текстам', autocomplete: 'off'});
        const results = h('div', {class: 'tx-results'}); let moreBox = {};
        function run() {
          q = input.value; const words = norm(q).split(/\s+/).filter(Boolean);
          if (!words.length) { results.replaceChildren(); grid.hidden = false; moreBox.hidden = false; return; }
          grid.hidden = true; moreBox.hidden = true;
          const found = Object.values(items).filter(it => { const t = norm([it.label, it.def, valueOf(it), it.key, it.block.title, it.page.title].join(' ')); return words.every(w => t.includes(w)); });
          AD.fill(results, h('p', {class: 'muted small'}, found.length ? 'Найдено: ' + found.length + (found.length > 40 ? ' (показаны первые 40 — уточните запрос)' : '') : 'Ничего не найдено. Попробуйте другое слово.'), found.slice(0, 40).map(searchRow));
        }
        input.addEventListener('input', run);
        const grid = h('div', {class: 'cols tx-tiles'}, reg.pages.map(p => {
          const n = p.blocks.reduce((s, b) => s + b.items.length, 0), c = h('span', {class: 'pill warn2', hidden: true}); tiles[p.id] = {chg: c};
          return h('a', {class: 'tile', href: '#/texts/' + p.id}, h('b', {}, p.title), h('span', {}, n + ' ' + AD.plural(n, 'текст', 'текста', 'текстов') + ' · ' + p.blocks.length + ' ' + AD.plural(p.blocks.length, 'блок', 'блока', 'блоков')), ' ', c);
        }));
        const MORE = [['Путь к закупке («Старт со Стеллой»)', 'Вопросы, подсказки и итоговые тексты подбора', '#/content/sales'], ['Библиотека реплик Стеллы', 'Живые ответы помощника по темам', '#/content/stella_config'], ['Юридические документы', 'Политика, согласие, соглашение — полные данные документов', '#/content/legal'], ['Обучение: преподаватели, шаги, вопросы', 'Раздел «Мероприятия и обучение»', '#/events']];
        const more = h('div', {}, h('div', {class: 'group-h'}, 'Другие данные с текстами'), h('p', {class: 'muted small', style: {marginBottom: '10px'}}, 'Эти тексты правятся в своих разделах: их много, и они устроены как сценарии.'), h('div', {class: 'cols'}, MORE.map(([t, d, href]) => h('a', {class: 'tile', href}, h('b', {}, t), h('span', {}, d)))));
        moreBox = more; AD.fill(body, h('div', {class: 'toolbar'}, input), results, grid, more); updateTile(); run();
        return null;
      }
      function pageView(pg) {
        const first = pg.blocks.find(b => b.items.some(isChanged));
        const left = h('div', {class: 'ed'}, pg.blocks.map((b, i) => {
          const n = b.items.filter(isChanged).length;
          return h('details', {class: 'ed-card top', open: first ? b === first : i === 0}, h('summary', {}, h('span', {class: 'ed-n'}, String(i + 1).padStart(2, '0')), h('span', {class: 't'}, b.title), h('span', {class: 'muted small'}, b.items.length + ' шт.' + (n ? ' · изменено ' + n : ''))), h('div', {class: 'in tx-grid'}, b.items.map(field)));
        }));
        const toggle = h('button', {class: 'btn', type: 'button', 'aria-pressed': String(showPrev), onclick: () => { showPrev = !showPrev; try { localStorage.setItem('ad.texts.prev', showPrev ? '1' : '0'); } catch (e) {} render(); }}, showPrev ? 'Скрыть предпросмотр' : 'Предпросмотр рядом');
        const open = h('a', {class: 'btn', href: '#/preview/' + encodeURIComponent(pg.url)}, 'Посмотреть на сайте');
        const head = [h('div', {class: 'crumbs'}, h('a', {href: '#/texts'}, 'Тексты страниц'), ' › ', pg.title), AD.pageHead(pg.title, 'Тексты этой страницы. Пока поле не правили, на сайте остаётся исходный текст. Сохранённое сразу попадает на страницу после пересборки.', toggle, open)];
        if (!showPrev) { AD.fill(body, head, left); return; }
        frame = h('iframe', {title: 'Предпросмотр: ' + pg.title, src: AD.previewUrl(pg.url + '?pv=' + Date.now())});
        AD.fill(body, head, h('div', {class: 'pb'}, left, h('aside', {class: 'pb-prev'}, h('div', {class: 'row'}, h('b', {}, 'Так сейчас на сайте'), h('button', {class: 'btn sm right', type: 'button', onclick: reloadFrame}, 'Обновить')), h('div', {class: 'frame'}, frame), h('p', {class: 'muted small'}, 'После «Сохранить» страница в рамке обновится сама.'))));
      }
      function render() {
        frame = null; const pg = reg.pages.find(x => x.id === pageId);
        if (!pageId || !pg) { pageId = ''; AD.fill(root, AD.pageHead('Тексты страниц', 'Заголовки, подписи, кнопки и подсказки на всех страницах. Выберите страницу или найдите текст поиском. Фоновые изображения и структура сайта здесь не меняются.'), draftBanner(), bar, msg, body); overview(); }
        else { AD.fill(root, draftBanner(), bar, msg, body); pageView(pg); }
        updateBar();
      }
      inst.onRoute = p => { if ((p[0] || '') !== pageId) { pageId = p[0] || ''; render(); window.scrollTo(0, 0); } };
      inst.destroy = () => { AD.saveHook = null; AD.dirty = false; };
      render(); return inst;
    }
  };
})();
