/* Раздел «Новости и газета»: материалы (поиск, рубрика, статус, редактор с абзацами, кнопкой, связями и обложкой), схема газеты из 12 страниц со слотами
   (какая новость стоит на какой странице — вёрстку менять нельзя) и рубрики. Сохраняется data/news.json целиком; сервер проверяет ссылки и пересобирает сайт. */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const fld = (label, ctl, help, id) => h('div', {class: 'field'}, h('label', {for: id}, label), ctl, help ? h('div', {class: 'help'}, help) : null);
  let uid = 0; const nid = () => 'nf' + (++uid);
  const CTA = [['', '— без кнопки —'], ['partner', 'Рассчитать скидку (страница «Партнёрам»)'], ['training', 'К расписанию семинаров'], ['product', 'Смотреть товар'], ['catalog', 'В каталог'], ['brand', 'О бренде'], ['event', 'О мероприятии'], ['contacts', 'Контакты']];
  const today = () => new Date().toISOString().slice(0, 10);
  const dfmt = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : d || ''; };

  AD.views.news = {
    async mount(root, parts) {
      const inst = {initial: true};
      let data, ver, prods, brands, events, meta, tab = 'items', openM = null;
      const load = async () => { const [n, p, b, e, m] = await Promise.all([AD.get('/api/collections/news'), AD.get('/api/collections/products'), AD.get('/api/collections/brands'), AD.get('/api/collections/events'), AD.get('/api/news/layout')]); data = n.data; ver = n.version; prods = p.data; brands = b.data; events = e.data; meta = m; };
      await load();
      const msg = h('div', {}), body = h('div', {});
      const F = {q: '', cat: '', st: ''};
      const catOf = id => data.categories.find(c => c.id === id) || {id, name: id, c1: '#888', c2: '#ccc'};
      const slotsNow = () => Object.assign({}, meta.defaults, (data.layout && data.layout.slots) || {});
      const slotOfNews = id => { const s = slotsNow(), k = Object.keys(s).find(x => s[x] === id); return k ? {key: k, title: meta.info[k].title, pg: meta.where[k][1]} : null; };
      async function run(fn, into, btn) { (into || msg).replaceChildren(); try { return await AD.busy(btn, fn); } catch (e) { (into || msg).replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: async () => { await load(); render(); msg.replaceChildren(); }}, 'Загрузить актуальные данные')) : AD.errBox(e)); if (!into) window.scrollTo({top: 0, behavior: 'smooth'}); return null; } }
      async function commit(next, okMsg) { const r = await AD.put('/api/collections/news', {data: next, version: ver}); await load(); render(); AD.toast((okMsg || 'Сохранено') + (r.build ? ', сайт пересобран' : ''), 'ok'); return r; }

      /* ---------- вкладка «Материалы» ---------- */
      function itemsTab() {
        const tbody = h('tbody', {}), count = h('span', {class: 'muted small'}), empty = h('div', {class: 'empty', hidden: true}, h('b', {}, 'Ничего не найдено'), 'Измените запрос или фильтры.');
        const search = h('input', {type: 'search', class: 'grow', placeholder: 'Поиск по заголовку и тексту…', 'aria-label': 'Поиск по новостям', value: F.q, oninput: () => { F.q = search.value; paint(); }});
        const sel = (key, label, opts) => { const s = h('select', {'aria-label': label, onchange: () => { F[key] = s.value; paint(); }}, h('option', {value: ''}, label), opts.map(([v, t]) => h('option', {value: v, selected: F[key] === v}, t))); return s; };
        function paint() {
          const q = F.q.trim().toLowerCase(), list = data.items.slice().sort((a, b) => b.date.localeCompare(a.date)).filter(n => (!F.cat || n.category === F.cat) && (!F.st || (F.st === 'demo' ? n.demo : F.st === 'paper' ? slotOfNews(n.id) : F.st === 'archive' ? !slotOfNews(n.id) : true)) && (!q || [n.title, n.excerpt, n.slug, (n.body || []).join(' ')].join(' ').toLowerCase().includes(q)));
          tbody.replaceChildren(...list.map(n => { const c = catOf(n.category), sl = slotOfNews(n.id);
            return h('tr', {class: 'click', tabindex: '0', dataset: {id: n.id}, onclick: () => AD.go('#/news/' + encodeURIComponent(n.id)), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) AD.go('#/news/' + encodeURIComponent(n.id)); }},
              h('td', {class: 'nowrap', dataset: {l: 'Дата'}}, dfmt(n.date)), h('td', {dataset: {l: 'Заголовок'}}, h('b', {}, n.title), h('div', {class: 'sub'}, n.slug)),
              h('td', {dataset: {l: 'Рубрика'}}, h('span', {class: 'np-chip', style: {'--c1': c.c1}}, c.name)), h('td', {dataset: {l: 'Газета'}}, sl ? h('span', {class: 'pill done'}, 'стр. ' + sl.pg) : h('span', {class: 'pill archived'}, 'в архиве'), n.demo ? [' ', h('span', {class: 'flag'}, 'демо')] : null),
              h('td', {class: 'nowrap', onclick: e => e.stopPropagation()}, h('button', {class: 'btn sm', type: 'button', onclick: () => dup(n)}, 'Копия'), ' ', h('button', {class: 'btn sm danger', type: 'button', onclick: () => remove(n)}, 'Удалить'))); }));
          count.textContent = list.length + ' из ' + data.items.length; empty.hidden = list.length > 0;
        }
        AD.fill(body, h('div', {class: 'toolbar'}, search, sel('cat', 'Все рубрики', data.categories.map(c => [c.id, c.name])), sel('st', 'Любой статус', [['demo', 'Демо-записи'], ['paper', 'В газете'], ['archive', 'Только в архиве']]), count), h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Дата', 'Заголовок', 'Рубрика', 'Газета', ''].map(t => h('th', {}, t)))), tbody), empty)); paint();
      }
      async function remove(n) {
        const sl = slotOfNews(n.id);
        if (!await AD.confirm('Удалить новость «' + n.title + '»?' + (sl ? ' Она стоит в газете на стр. ' + sl.pg + ' — слот останется пустым.' : '') + ' Вернуть можно через «История».', {ok: 'Удалить'})) return;
        await run(async () => { const next = clone(data); next.items = next.items.filter(x => x.id !== n.id); if (next.layout && next.layout.slots) Object.keys(next.layout.slots).forEach(k => { if (next.layout.slots[k] === n.id) next.layout.slots[k] = ''; }); const base = clone(meta.defaults); if (!next.layout) next.layout = {slots: {}}; Object.keys(base).forEach(k => { if (base[k] === n.id && next.layout.slots[k] === undefined) next.layout.slots[k] = ''; }); await commit(next, 'Новость удалена'); });
      }
      function dup(n) { const c = clone(n); c.id = ''; c.slug = ''; c.title += ' (копия)'; c.date = today(); delete c.image; openEditor(c, true); }

      /* ---------- редактор новости ---------- */
      function pickList(label, options, key, w, o) {      // список ссылок: выбранные «чипами» + выпадающий список для добавления
        const box = h('div', {class: 'chips'}), add = h('select', {'aria-label': 'Добавить: ' + label});
        const cur = () => (w.related && w.related[key]) || [];
        function paint() {
          const have = new Set(cur());
          AD.fill(box, cur().map(id => { const op = options.find(x => x[0] === id); return h('span', {class: 'chip'}, op ? op[1] : id, h('button', {type: 'button', 'aria-label': 'Убрать ' + (op ? op[1] : id), onclick: () => { const l = cur().filter(x => x !== id); (w.related = w.related || {})[key] = l; if (!l.length) delete w.related[key]; paint(); }}, '✕')); }));
          AD.fill(add, h('option', {value: ''}, '＋ Добавить…'), options.filter(x => !have.has(x[0])).map(x => h('option', {value: x[0]}, x[1])));
        }
        add.addEventListener('change', () => { if (!add.value) return; (w.related = w.related || {})[key] = cur().concat(add.value); paint(); }); paint();
        return fld(label, h('div', {}, box, add), o && o.help);
      }
      function openEditor(item, isNew, restored) {
        if (openM) return openM; const dk = AD.drafts.key('news', isNew ? '__new' : item.id);
        const w = clone(item), orig = JSON.stringify(w), err = h('div', {}), pv = h('div', {}), bodyBox = h('div', {class: 'ed-list'}), coverBox = h('div', {});
        if (isNew && !item.title) Object.assign(w, {id: '', slug: '', category: data.categories[0].id, date: today(), demo: false, title: '', excerpt: '', body: [''], cta: {type: ''}});
        if (restored) Object.assign(w, clone(restored));
        if (!Array.isArray(w.body) || !w.body.length) w.body = [''];
        let slugTouched = !isNew && !!w.slug; const ids = {}; ['title', 'slug', 'date', 'cat', 'exc', 'alt'].forEach(k => { ids[k] = nid(); });
        const titleI = h('input', {type: 'text', id: ids.title, value: w.title || ''}), titleN = h('span', {class: 'counter'}), slugI = h('input', {type: 'text', id: ids.slug, value: w.slug || ''}), slugN = h('div', {class: 'help'}), excI = h('textarea', {id: ids.exc, rows: '3'}), excN = h('span', {class: 'counter'});
        excI.textContent = w.excerpt || '';
        const dateI = h('input', {type: 'date', id: ids.date, value: w.date || today()}), catS = h('select', {id: ids.cat}, data.categories.map(c => h('option', {value: c.id, selected: c.id === w.category}, c.name)));
        const demoC = h('input', {type: 'checkbox', checked: !!w.demo, onchange: () => { if (demoC.checked) w.demo = true; else delete w.demo; }});
        function upd() {
          w.title = titleI.value; w.excerpt = excI.value; w.date = dateI.value; w.category = catS.value;
          if (!slugTouched) { w.slug = AD.slugify(w.title).slice(0, 70); slugI.value = w.slug; } else w.slug = slugI.value;
          const dupe = data.items.some(x => x.slug === w.slug && x.id !== item.id), bad = w.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w.slug);
          slugN.textContent = bad ? 'Адрес — только латиница, цифры и дефисы.' : dupe ? 'Такой адрес уже занят — измените.' : w.slug ? 'Страница: /news/' + w.slug + '.html' : ''; slugN.style.color = bad || dupe ? 'var(--err)' : ''; slugI.classList.toggle('bad', !!(bad || dupe));
          const tl = Array.from(w.title).length, el = Array.from(w.excerpt).length; titleN.textContent = tl + ' / 160'; titleN.classList.toggle('bad', tl > 160); excN.textContent = el + ' / 400'; excN.classList.toggle('bad', el > 400); paint();
        }
        [titleI, excI, dateI, catS].forEach(el => el.addEventListener('input', upd)); catS.addEventListener('change', upd); slugI.addEventListener('input', () => { slugTouched = true; upd(); });
        function paintBody() {
          AD.fill(bodyBox, w.body.map((p, i) => { const ta = h('textarea', {rows: '4', 'aria-label': 'Абзац ' + (i + 1), oninput: () => { w.body[i] = ta.value; paint(); }}); ta.textContent = p;
            return h('div', {class: 'ed-item'}, h('div', {class: 'v'}, ta), h('div', {class: 'col'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => { [w.body[i - 1], w.body[i]] = [w.body[i], w.body[i - 1]]; paintBody(); }}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Ниже', disabled: i === w.body.length - 1, onclick: () => { [w.body[i + 1], w.body[i]] = [w.body[i], w.body[i + 1]]; paintBody(); }}, '↓'), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить абзац', disabled: w.body.length < 2, onclick: () => { w.body.splice(i, 1); paintBody(); paint(); }}, '✕'))); }), h('button', {class: 'btn sm', type: 'button', onclick: () => { w.body.push(''); paintBody(); }}, '＋ Добавить абзац'));
        }
        /* кнопка под статьёй */
        const cta = w.cta = w.cta && typeof w.cta === 'object' ? w.cta : {type: ''}; const ctaBox = h('div', {class: 'grid2'});
        function paintCta() {
          const t = h('select', {id: nid(), 'aria-label': 'Что открывает кнопка'}, CTA.map(([v, x]) => h('option', {value: v, selected: (cta.type || '') === v}, x))); t.addEventListener('change', () => { cta.type = t.value; delete cta.ref; if (!t.value) { delete cta.query; } paintCta(); });
          const cells = [fld('Кнопка под статьёй', t, 'Читатель нажимает её после текста новости.')];
          const refList = cta.type === 'product' ? prods.map(p => [p.id, p.name]) : cta.type === 'brand' ? brands.map(b => [b.id, b.name]) : cta.type === 'event' ? events.map(e => [e.id, dfmt(e.date) + ' · ' + e.title]) : null;
          if (refList) { const r = h('select', {id: nid(), 'aria-label': 'Куда ведёт'}, h('option', {value: ''}, '— выберите —'), refList.map(([v, x]) => h('option', {value: v, selected: cta.ref === v}, x))); r.addEventListener('change', () => { cta.ref = r.value; }); cells.push(fld('Куда ведёт', r)); }
          else if (cta.type === 'training' || cta.type === 'catalog') { const q = h('input', {type: 'text', id: nid(), value: cta.query || '', placeholder: cta.type === 'training' ? 'например: fmt=online' : 'например: task=acne', 'aria-label': 'Параметры'}); q.addEventListener('input', () => { if (q.value) cta.query = q.value; else delete cta.query; }); cells.push(fld('Фильтр (необязательно)', q, 'Параметры страницы, например task=acne.')); }
          AD.fill(ctaBox, cells);
        }
        function paintCover() {
          const up = async f => { try { const r = await AD.media.upload('assets/uploads/news', f, {name: w.slug || 'news', max: 1600}); w.image = r.path; paintCover(); paint(); } catch (e) { err.replaceChildren(AD.errBox(e)); } };
          const fi = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: () => { if (fi.files[0]) up(fi.files[0]); }});
          AD.fill(coverBox, h('div', {class: 'bp-photo-field'}, h('div', {class: 'bp-pv'}, w.image ? h('img', {src: '/' + w.image, alt: ''}) : h('span', {class: 'muted small'}, 'Не задана: на странице новости — иллюстрация рубрики')), h('div', {class: 'col'}, h('div', {class: 'row'}, h('button', {class: 'btn sm', type: 'button', onclick: () => fi.click()}, w.image ? 'Заменить' : 'Загрузить'), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.media.pick({dir: 'assets/uploads/news', title: 'Обложка новости', current: w.image, max: 1600, name: w.slug || 'news', onPick: p => { if (p) { w.image = p; AD.media.altOf(p).then(a => { if (a && !w.imageAlt) { w.imageAlt = a; paintCover(); } }); } else { delete w.image; delete w.imageAlt; } paintCover(); paint(); }})}, 'Из библиотеки'), w.image ? h('button', {class: 'btn sm danger', type: 'button', onclick: () => { delete w.image; delete w.imageAlt; paintCover(); paint(); }}, 'Убрать') : null, fi), h('div', {class: 'small muted'}, 'Рекомендуется 16:9 (например 1600×900). Картинка сожмётся в WebP.'))),
            w.image ? fld('Подпись к картинке (для незрячих)', Object.assign(h('input', {type: 'text', id: ids.alt, value: w.imageAlt || '', maxlength: '160', oninput: e => { if (e.target.value) w.imageAlt = e.target.value; else delete w.imageAlt; }}), {}), null, ids.alt) : null);
        }
        function paint() {
          const c = catOf(w.category), sl = !isNew && slotOfNews(item.id);
          AD.fill(pv, h('div', {class: 'pvc', style: {'--c1': c.c1, '--c2': c.c2}}, h('div', {class: 'pvc-stage', style: {height: '120px'}}, w.image ? h('img', {src: '/' + w.image, alt: '', class: 'photo'}) : h('b', {style: {font: '500 26px var(--serif)', color: '#fff'}}, c.name)), h('div', {class: 'pvc-b'}, h('small', {}, c.name + ' · ' + dfmt(w.date)), h('b', {}, w.title || 'Заголовок новости'), h('p', {}, (w.excerpt || 'Анонс появится здесь.').slice(0, 130)))),
            h('div', {class: 'help', style: {marginTop: '8px'}}, sl ? 'В газете: стр. ' + sl.pg + ' («' + sl.title + '»).' : 'В газете не стоит — материал в архиве выпуска и в оглавлении.'), !isNew ? h('a', {class: 'btn sm', href: '#/news', onclick: e => { e.preventDefault(); tab = 'paper'; m.close(true); AD.go('#/news'); render(); }}, 'Назначить место в газете') : null);
        }
        const body$ = h('div', {class: 'pe'}, h('div', {class: 'pe-form ed-obj'},
          h('div', {class: 'grid2'}, fld('Рубрика', catS, null, ids.cat), fld('Дата', dateI, null, ids.date)),
          fld('Заголовок', titleI, null, ids.title), titleN, fld('Адрес страницы (slug)', slugI, null, ids.slug), slugN, fld('Анонс (под заголовком и в списках)', excI, null, ids.exc), excN,
          fld('Текст новости', bodyBox, 'Абзацы идут сверху вниз. В тексте можно написать {{discounts}} — подставятся пороги скидок из «Контакты и реквизиты».'),
          ctaBox, pickList('Связанные товары', prods.map(p => [p.id, p.name]), 'products', w), pickList('Связанные бренды', brands.map(b => [b.id, b.name]), 'brands', w), pickList('Связанные мероприятия', events.map(e => [e.id, dfmt(e.date) + ' · ' + e.title]), 'events', w),
          fld('Обложка', coverBox), h('label', {class: 'chk'}, demoC, 'Демонстрационная запись (в подвале появится пометка «демо»; снимите, когда данные реальные)')), h('aside', {class: 'pe-pv'}, h('div', {class: 'lbl'}, 'Так выглядит карточка'), pv));
        const saveBtn = h('button', {class: 'btn primary', type: 'button'}, isNew ? 'Добавить новость' : 'Сохранить');
        const m = openM = AD.modal({title: isNew ? 'Новая новость' : 'Новость: ' + item.title, cls: 'xl', sticky: true, body: [err, body$], beforeClose: AD.drafts.guard(dk, () => JSON.stringify(w) !== orig), isDirty: () => JSON.stringify(w) !== orig,
          onClose: () => { openM = null; AD.dirty = false; if (/^#\/news\//.test(location.hash)) AD.go('#/news'); },
          footer: [!isNew ? h('a', {class: 'btn ghost', href: '/news/' + item.slug + '.html', target: '_blank', rel: 'noopener', style: {marginRight: 'auto'}}, 'Открыть на сайте') : null, h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), saveBtn]});
        saveBtn.addEventListener('click', () => run(async () => {
          upd(); if (!w.title.trim()) throw new Error('Укажите заголовок.'); if (!w.excerpt.trim()) throw new Error('Заполните анонс.');
          w.body = w.body.map(x => x.trim()).filter(Boolean); if (!w.body.length) throw new Error('Добавьте хотя бы один абзац текста.');
          if (!w.slug) w.slug = AD.slugify(w.title).slice(0, 70) || 'news'; if (!w.id) { let n = data.items.length + 1; while (data.items.some(x => x.id === 'n' + n)) n++; w.id = 'n' + n; }
          if (!w.cta || !w.cta.type) delete w.cta; else if (w.cta.ref === '') delete w.cta.ref;
          if (w.related) { Object.keys(w.related).forEach(k => { if (!w.related[k].length) delete w.related[k]; }); if (!Object.keys(w.related).length) delete w.related; }
          if (!w.demo) delete w.demo; if (!w.image) { delete w.image; delete w.imageAlt; }
          const next = clone(data), pos = isNew ? -1 : next.items.findIndex(x => x.id === item.id); if (pos >= 0) next.items[pos] = w; else next.items.push(w);
          await commit(next, isNew ? 'Новость добавлена' : 'Новость сохранена'); AD.drafts.clear(dk); m.close(true);
        }, err, saveBtn));
        paintBody(); paintCta(); paintCover(); upd(); AD.drafts.watch(m.body, dk, () => (JSON.stringify(w) !== orig ? w : null)); if (!restored) { const bn = AD.drafts.banner(dk, d => { m.close(true); openEditor(item, isNew, d); }); if (bn) err.prepend(bn); } return m;
      }

      /* ---------- вкладка «Газета» ---------- */
      function paperTab() {
        const work = Object.assign({}, slotsNow()), orig = JSON.stringify(work), err = h('div', {}), grid = h('div', {class: 'paper-grid'});
        const saveBtn = h('button', {class: 'btn primary', type: 'button', disabled: true}, 'Сохранить расположение'), state = h('span', {class: 'muted small'});
        const dirty = () => { const d = JSON.stringify(work) !== orig; saveBtn.disabled = !d; AD.dirty = d; AD.fill(state, d ? [h('span', {class: 'dot'}), 'Не сохранено'] : ''); };
        function paint() {
          const usedBy = {}; Object.entries(work).forEach(([k, v]) => { if (v) usedBy[v] = k; });
          AD.fill(grid, meta.pages.map(pg => h('section', {class: 'pg-tile' + (pg.slots.length ? '' : ' pg-fixed')}, h('div', {class: 'pg-n'}, h('i', {}, pg.n), pg.title), pg.slots.length ? pg.slots.map(k => { const id = 'sl-' + k, cur = data.items.find(x => x.id === work[k]);
              const s = h('select', {id, 'aria-label': meta.info[k].title}, h('option', {value: ''}, '— пусто —'), data.categories.map(c => h('optgroup', {label: c.name}, data.items.filter(n => n.category === c.id).sort((a, b) => b.date.localeCompare(a.date)).map(n => h('option', {value: n.id, selected: work[k] === n.id}, (usedBy[n.id] && usedBy[n.id] !== k ? '● ' : '') + n.title)))));
              s.addEventListener('change', () => { const v = s.value; if (v && usedBy[v] && usedBy[v] !== k) { work[usedBy[v]] = work[k] || ''; } work[k] = v; paint(); dirty(); });
              return h('div', {class: 'pg-slot'}, h('label', {for: id}, meta.info[k].title), s, !cur ? h('div', {class: 'help', style: {color: 'var(--warn)'}}, 'Слот пуст — на странице газеты будет пустое место.') : h('div', {class: 'help'}, dfmt(cur.date) + ' · ' + catOf(cur.category).name), h('div', {class: 'help'}, meta.info[k].hint)); }) : h('div', {class: 'help'}, pg.note))));
        }
        saveBtn.addEventListener('click', () => run(async () => { const next = clone(data); next.layout = {slots: Object.assign({}, work)}; await commit(next, 'Расположение в газете сохранено'); AD.dirty = false; }, err, saveBtn));
        AD.saveHook = () => { if (!saveBtn.disabled) saveBtn.click(); };
        const reset = h('button', {class: 'btn ghost', type: 'button', onclick: () => { Object.assign(work, meta.defaults); paint(); dirty(); }}, 'Вернуть исходную раскладку');
        const inPaper = new Set(Object.values(work)), archive = data.items.filter(n => !inPaper.has(n.id));
        AD.fill(body, h('div', {class: 'card'}, h('p', {class: 'muted'}, 'Схема газеты: 12 страниц (разворот = две соседние). Выберите, какая новость стоит в каждом слоте. Саму вёрстку менять нельзя: слоты, картинки и подписи страниц остаются прежними. Новости вне слотов попадают в «Архив выпуска» и оглавление на обороте.'), err, h('div', {class: 'row', style: {margin: '12px 0'}}, saveBtn, state, h('span', {class: 'right row'}, reset, h('a', {class: 'btn', href: '#/preview/news.html'}, 'Предпросмотр газеты'))), grid, h('div', {class: 'help', style: {marginTop: '14px'}}, 'Вне газеты (в архиве): ' + (archive.length ? archive.map(n => n.title).join('; ') : 'нет')))); paint();
      }

      /* ---------- вкладка «Рубрики» ---------- */
      function catsTab() {
        const work = clone(data.categories), orig = JSON.stringify(work), rows = h('div', {class: 'ed-list'}), err = h('div', {}), saveBtn = h('button', {class: 'btn primary', type: 'button', disabled: true}, 'Сохранить рубрики'), state = h('span', {class: 'muted small'});
        const dirty = () => { const d = JSON.stringify(work) !== orig; saveBtn.disabled = !d; AD.dirty = d; AD.fill(state, d ? [h('span', {class: 'dot'}), 'Не сохранено'] : ''); };
        const col = (x, k, label) => { const c = h('input', {type: 'color', value: /^#[0-9a-f]{6}$/i.test(x[k]) ? x[k] : '#336699', 'aria-label': label}); c.addEventListener('input', () => { x[k] = c.value; dirty(); }); return c; };
        function paint() { AD.fill(rows, work.map((x, i) => h('div', {class: 'ed-item'}, h('div', {class: 'v grid3'}, h('input', {type: 'text', value: x.name, 'aria-label': 'Название рубрики', placeholder: 'Название', oninput: e => { x.name = e.target.value; dirty(); }}), h('input', {type: 'text', value: x.id, disabled: !x.__new, 'aria-label': 'Идентификатор', placeholder: 'id латиницей', oninput: e => { x.id = e.target.value; dirty(); }}), h('div', {class: 'color-w'}, col(x, 'c1', 'Цвет 1'), col(x, 'c2', 'Цвет 2'), h('select', {'aria-label': 'Цвет текста', onchange: e => { x.ink = e.target.value; dirty(); }}, [['#fff', 'Светлый текст'], ['#0b1a33', 'Тёмный текст']].map(([v, t]) => h('option', {value: v, selected: String(x.ink || '').toLowerCase() === v}, t))))), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить рубрику', onclick: () => { if (!x.__new && data.items.some(n => n.category === x.id)) { AD.toast('В рубрике «' + x.name + '» есть новости — сначала перенесите их.', 'err'); return; } work.splice(i, 1); paint(); dirty(); }}, '✕'))), h('button', {class: 'btn sm', type: 'button', onclick: () => { work.push({id: '', name: '', c1: '#2f5bd6', c2: '#9db4f5', ink: '#fff', __new: true}); paint(); dirty(); }}, '＋ Добавить рубрику')); }
        saveBtn.addEventListener('click', () => run(async () => { const next = clone(data); next.categories = work.map(x => { const c = Object.assign({}, x); delete c.__new; if (!c.id) c.id = AD.slugify(c.name); return c; }); await commit(next, 'Рубрики сохранены'); AD.dirty = false; }, err, saveBtn));
        AD.saveHook = () => { if (!saveBtn.disabled) saveBtn.click(); };
        AD.fill(body, h('div', {class: 'card'}, h('p', {class: 'muted', style: {marginBottom: '12px'}}, 'Рубрики подкрашивают метки и карточки новостей. Рубрику с новостями удалить нельзя.'), err, rows, h('div', {class: 'row', style: {marginTop: '14px'}}, saveBtn, state))); paint();
      }

      const TABS = [['items', 'Материалы'], ['paper', 'Газета: слоты'], ['cats', 'Рубрики']];
      function render() {
        AD.dirty = false; AD.saveHook = null;
        const tabs = h('div', {class: 'dtabs', role: 'tablist'}, TABS.map(([id, t]) => h('button', {type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { if (AD.dirty && !confirm('Есть несохранённые изменения. Перейти без сохранения?')) return; tab = id; render(); }}, t)));
        AD.fill(root, AD.pageHead('Новости и газета', 'Материалы для страницы «Новости» и отдельные страницы статей. Во вкладке «Газета» — какая новость на какой странице интерактивной газеты.', h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog('news', async () => { await load(); render(); })}, 'История'), h('a', {class: 'btn', href: '#/preview/news.html'}, 'Предпросмотр'), h('button', {class: 'btn primary', type: 'button', id: 'add-item', onclick: () => AD.go('#/news/__new')}, '＋ Добавить новость')), msg, tabs, body);
        if (tab === 'items') itemsTab(); else if (tab === 'paper') paperTab(); else catsTab();
      }
      render();
      inst.onRoute = p => {
        const id = p[0];
        if (id === undefined) { if (openM) { const m = openM; openM = null; m.close(true); } return; }
        if (id === '__new') { if (!openM) openEditor({}, true); return; }
        const it = data.items.find(x => x.id === id); if (it) { tab = 'items'; if (!root.querySelector('.tbl')) render(); openEditor(it, false); } else { AD.toast('Новость «' + id + '» не найдена', 'err'); AD.go('#/news'); }
      };
      inst.destroy = () => { if (openM) { const m = openM; openM = null; m.close(true); } AD.dirty = false; AD.saveHook = null; };
      if (parts.length) inst.onRoute(parts);
      return inst;
    }
  };
})();
