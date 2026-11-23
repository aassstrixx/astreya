/* Раздел «Товары и витрина»: список с поиском и фильтрами, массовые действия, редактор карточки товара с живым превью (как карточка на интерактивной витрине),
   фото с автосжатием в WebP, выбор упаковки (спрайты assets/showroom/pack-*.webp), дублирование, перестановка, импорт и экспорт CSV.
   Все изменения уходят в data/products.json целиком; сервер проверяет данные, пересобирает сайт и откатывает правку, если сайт не собирается. */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const TYPES = [['tube', 'Туба'], ['jar', 'Баночка'], ['dropper', 'Капельница'], ['bottle', 'Флакон'], ['pump', 'Дозатор'], ['box', 'Коробка'], ['device', 'Аппарат']];
  const NOIR = {bottle: 1, pump: 1, dropper: 1};
  let PACKS = null;
  const loadPacks = async () => { if (PACKS) return PACKS; try { const r = await fetch('/assets/showroom/packs.json', {cache: 'no-store'}); PACKS = r.ok ? await r.json() : {}; } catch (e) { PACKS = {}; } return PACKS; };
  /* та же логика, что js/shared.js → packOf: упаковка бренда, если нарисована, иначе общая (часть флаконов — чёрные) */
  function packSrc(brand, type, id) {
    const t = TYPES.some(x => x[0] === type) ? type : 'bottle';
    if (PACKS && brand && PACKS['pack-' + brand + '-' + t]) return '/assets/showroom/pack-' + brand + '-' + t + '.webp';
    let k = 7; String(id || 'x').split('').forEach(c => { k = (k * 31 + c.charCodeAt(0)) >>> 0; });
    return '/assets/showroom/pack-' + t + (NOIR[t] && k % 3 === 0 ? '-noir' : '') + '.webp';
  }
  const lines = v => (Array.isArray(v) ? v : []).join('\n');
  const toList = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const fld = (label, ctl, help, id) => h('div', {class: 'field'}, h('label', {for: id}, label), ctl, help ? h('div', {class: 'help'}, help) : null);
  let uid = 0; const nid = () => 'pf' + (++uid);

  /* ---------- CSV ---------- */
  const COLS = [['id', 'id'], ['slug', 'адрес'], ['brand', 'бренд'], ['cat', 'категория'], ['kind', 'вид'], ['type', 'упаковка'], ['name', 'название'], ['desc', 'описание'], ['tasks', 'задачи'], ['isNew', 'новинка'], ['featured', 'на_витрине'], ['volume', 'объём'], ['sku', 'артикул'], ['usage', 'применение'], ['indications', 'показания'], ['details', 'подробности'], ['actives', 'активные'], ['docs', 'документы'], ['image', 'фото'], ['imageAlt', 'подпись_фото']];
  const SEP = ' || ';
  const bool = v => (v ? 'да' : 'нет'), yes = v => /^(да|yes|true|1|\+)$/i.test(String(v || '').trim());
  function toCSV(prods) {
    const q = v => { const s = String(v == null ? '' : v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const row = p => COLS.map(([k]) => q(k === 'tasks' ? (p.tasks || []).join('|') : k === 'isNew' || k === 'featured' ? bool(p[k]) : ['indications', 'details', 'actives'].includes(k) ? (p[k] || []).join(SEP) : k === 'docs' ? (p.docs || []).map(d => d.title + '::' + d.url).join(SEP) : p[k])).join(';');
    return '﻿' + COLS.map(c => c[1]).join(';') + '\r\n' + prods.map(row).join('\r\n') + '\r\n';
  }
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, ''); const first = text.split(/\r?\n/)[0] || '', sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', inq = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inq) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inq = false; } else cell += c; }
      else if (c === '"') inq = true; else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }

  AD.views.products = {
    async mount(root, parts) {
      const inst = {initial: true};
      let prods, brands, cat, version, openM = null;
      await loadPacks();
      const load = async () => { const [p, b, c] = await Promise.all([AD.get('/api/collections/products'), AD.get('/api/collections/brands'), AD.get('/api/collections/catalog')]); prods = p.data; version = p.version; brands = b.data; cat = c.data; };
      await load();
      const F = {q: '', brand: '', cat: '', st: ''}, sel = new Set(); let pageN = 1;
      const nameOf = (list, id) => ((list || []).find(x => x.id === id) || {}).name || id, brandOf = id => brands.find(b => b.id === id) || {id, name: id, c1: '#2f5bd6', c2: '#9db4f5', ink: '#fff'};
      const msg = h('div', {}), tbody = h('tbody', {}), count = h('span', {class: 'muted small'}), bulk = h('div', {class: 'bulk', hidden: true});
      const thumb = p => p.image ? h('img', {src: '/' + p.image, alt: '', loading: 'lazy'}) : h('img', {class: 'mock', src: packSrc(p.brand, p.type, p.id), alt: '', loading: 'lazy'});

      async function commit(next, okMsg, btn) {
        return AD.busy(btn, async () => {
          const r = await AD.put('/api/collections/products', {data: next, version});
          await load(); paint(); AD.toast((okMsg || 'Сохранено') + (r.build ? ', сайт пересобран' : ''), 'ok'); return r;
        });
      }
      async function run(fn, into) {
        msg.replaceChildren(); const box = into || msg;
        try { return await fn(); }
        catch (e) { box.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: async () => { await load(); paint(); msg.replaceChildren(); }}, 'Загрузить актуальные данные')) : AD.errBox(e)); if (!into) window.scrollTo({top: 0, behavior: 'smooth'}); return null; }
      }
      const visible = () => {
        const q = F.q.trim().toLowerCase();
        return prods.filter(p => (!F.brand || p.brand === F.brand) && (!F.cat || p.cat === F.cat)
          && (!F.st || (F.st === 'featured' ? p.featured : F.st === 'new' ? p.isNew : F.st === 'nophoto' ? !p.image : F.st === 'nofeat' ? !p.featured : true))
          && (!q || [p.name, p.slug, p.id, p.sku, nameOf(brands, p.brand), p.desc].join(' ').toLowerCase().includes(q)));
      };
      function paint() {
        const all = visible(), per = 40, pages = Math.max(1, Math.ceil(all.length / per)); if (pageN > pages) pageN = pages;
        const list = all.slice((pageN - 1) * per, pageN * per);
        tbody.replaceChildren(...list.map(p => {
          const idx = all.indexOf(p), chk = h('input', {type: 'checkbox', checked: sel.has(p.id), 'aria-label': 'Выбрать ' + p.name, onclick: e => { e.stopPropagation(); if (chk.checked) sel.add(p.id); else sel.delete(p.id); bulkPaint(); }});
          return h('tr', {class: 'click', tabindex: '0', dataset: {id: p.id}, onclick: () => AD.go('#/products/' + encodeURIComponent(p.id)), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) AD.go('#/products/' + encodeURIComponent(p.id)); }},
            h('td', {onclick: e => e.stopPropagation(), class: 'pr-chk'}, chk), h('td', {class: 'pr-th', dataset: {l: 'Фото'}}, thumb(p)),
            h('td', {dataset: {l: 'Название'}}, h('b', {}, p.name), h('div', {class: 'sub'}, p.slug)), h('td', {dataset: {l: 'Бренд'}}, nameOf(brands, p.brand)), h('td', {dataset: {l: 'Категория'}}, nameOf(cat.cats, p.cat)),
            h('td', {dataset: {l: 'Метки'}}, p.featured ? h('span', {class: 'pill done'}, 'На витрине') : null, ' ', p.isNew ? h('span', {class: 'pill new'}, 'Новинка') : null, ' ', !p.image ? h('span', {class: 'pill archived'}, 'без фото') : null),
            h('td', {class: 'nowrap', onclick: e => e.stopPropagation()}, !F.q && !F.brand && !F.cat && !F.st ? [h('button', {class: 'btn sm icon', type: 'button', title: 'Выше', 'aria-label': 'Выше', disabled: idx === 0, onclick: e => move(p, -1, e.currentTarget)}, '↑'), ' ', h('button', {class: 'btn sm icon', type: 'button', title: 'Ниже', 'aria-label': 'Ниже', disabled: idx === all.length - 1, onclick: e => move(p, 1, e.currentTarget)}, '↓'), ' '] : null, h('button', {class: 'btn sm', type: 'button', onclick: () => dup(p)}, 'Копия')));
        }));
        count.textContent = all.length + ' из ' + prods.length + (pages > 1 ? ' · страница ' + pageN + ' из ' + pages : '');
        pager.replaceChildren(...(pages > 1 ? [h('button', {class: 'btn sm', type: 'button', disabled: pageN <= 1, onclick: () => { pageN--; paint(); }}, '← Назад'), h('span', {class: 'muted small'}, pageN + ' / ' + pages), h('button', {class: 'btn sm', type: 'button', disabled: pageN >= pages, onclick: () => { pageN++; paint(); }}, 'Дальше →')] : []));
        empty.hidden = list.length > 0; bulkPaint();
      }
      const pager = h('div', {class: 'pager'}), empty = h('div', {class: 'empty', hidden: true}, h('b', {}, 'Ничего не найдено'), 'Измените запрос или фильтры.');
      async function move(p, d, btn) {
        const all = visible(), i = all.indexOf(p), other = all[i + d]; if (!other) return;
        const a = prods.slice(), x = a.indexOf(p), y = a.indexOf(other); [a[x], a[y]] = [a[y], a[x]]; await run(() => commit(a, 'Порядок изменён', btn));
      }
      function dup(p) { const c = clone(p); c.name += ' (копия)'; c.slug = p.slug + '-kopiya'; c.id = ''; delete c.image; openEditor(c, true); }

      /* ----- массовые действия ----- */
      function bulkPaint() {
        const n = sel.size; bulk.hidden = !n; if (!n) return;
        const act = (title, fn, o) => h('button', {class: 'btn sm' + (o && o.danger ? ' danger' : ''), type: 'button', onclick: e => run(async () => { const next = prods.map(p => sel.has(p.id) ? fn(clone(p)) : p).filter(Boolean); await commit(next, title + ': ' + n + ' ' + AD.plural(n, 'товар', 'товара', 'товаров'), e.currentTarget); if (!(o && o.keep)) sel.clear(); paint(); })}, title);
        AD.fill(bulk, h('b', {}, 'Выбрано: ' + n), act('На витрину', p => { p.featured = true; return p; }), act('Снять с витрины', p => { p.featured = false; return p; }), act('Пометить новинкой', p => { p.isNew = true; return p; }), act('Снять «новинка»', p => { delete p.isNew; return p; }),
          h('button', {class: 'btn sm', type: 'button', onclick: () => changeCat()}, 'Сменить категорию…'),
          h('button', {class: 'btn sm danger', type: 'button', onclick: async e => { if (!await AD.confirm('Удалить выбранные товары (' + n + ')? Страницы товаров исчезнут с сайта; вернуть можно через «История».', {ok: 'Удалить'})) return; await run(async () => { await commit(prods.filter(p => !sel.has(p.id)), 'Удалено', e.currentTarget); sel.clear(); paint(); }); }}, 'Удалить'),
          h('button', {class: 'btn sm ghost', type: 'button', onclick: () => { sel.clear(); paint(); }}, 'Снять выбор'));
      }
      function changeCat() {
        const s = h('select', {id: 'bc-cat'}, cat.cats.map(c => h('option', {value: c.id}, c.name))), m = AD.modal({title: 'Сменить категорию', body: fld('Новая категория для выбранных товаров (' + sel.size + ')', s, null, 'bc-cat'), footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), h('button', {class: 'btn primary', type: 'button', onclick: e => run(async () => { await commit(prods.map(p => sel.has(p.id) ? Object.assign(clone(p), {cat: s.value}) : p), 'Категория изменена', e.currentTarget); m.close(true); sel.clear(); paint(); })}, 'Применить')]});
      }

      /* ----- CSV ----- */
      function exportCsv() {
        const blob = new Blob([toCSV(visible())], {type: 'text/csv;charset=utf-8'}), a = h('a', {href: URL.createObjectURL(blob), download: 'astreya-products-' + new Date().toISOString().slice(0, 10) + '.csv'}); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        AD.toast('Выгружено товаров: ' + visible().length + '. Откройте файл в Excel и сохраните как CSV (UTF-8) после правок.', 'ok', 6000);
      }
      function importCsv() {
        const out = h('div', {}), file = h('input', {type: 'file', accept: '.csv,text/csv,text/plain'}); let plan = null;
        const apply = h('button', {class: 'btn primary', type: 'button', disabled: true, onclick: e => run(async () => { await commit(plan.next, 'Импорт: добавлено ' + plan.added + ', обновлено ' + plan.updated, e.currentTarget); m.close(true); }, out)}, 'Применить импорт');
        file.addEventListener('change', async () => {
          plan = null; apply.disabled = true; out.replaceChildren(); if (!file.files[0]) return;
          const rows = parseCSV(await file.files[0].text()); if (rows.length < 2) { out.replaceChildren(AD.alertBox('err', 'В файле нет строк с товарами.')); return; }
          const head = rows[0].map(x => x.trim().toLowerCase()), colOf = {}; COLS.forEach(([k, ru]) => { const i = head.findIndex(x => x === ru || x === k.toLowerCase()); if (i >= 0) colOf[k] = i; });
          const problems = [], next = prods.map(clone); let added = 0, updated = 0;
          if (colOf.name === undefined && colOf.id === undefined && colOf.slug === undefined) { out.replaceChildren(AD.alertBox('err', 'В первой строке нужны заголовки столбцов (как в выгрузке): id, адрес, название…')); return; }
          rows.slice(1).forEach((r, n) => {
            const g = k => (colOf[k] === undefined ? undefined : String(r[colOf[k]] == null ? '' : r[colOf[k]]).trim()), w = `Строка ${n + 2}`;
            let ex = next.find(p => (g('id') && p.id === g('id')) || (g('slug') && p.slug === g('slug'))), p = ex || {tasks: [], docs: []};
            const set = (k, v) => { if (v !== undefined && (v !== '' || ex === undefined || ['volume', 'sku', 'usage', 'image', 'imageAlt'].includes(k))) p[k] = v === '' ? null : v; };
            ['name', 'desc', 'brand', 'cat', 'kind', 'type', 'volume', 'sku', 'usage', 'image', 'imageAlt'].forEach(k => set(k, g(k)));
            if (g('slug')) p.slug = g('slug'); if (g('id')) p.id = g('id');
            if (g('tasks') !== undefined) p.tasks = g('tasks').split(/[|,]/).map(x => x.trim()).filter(Boolean);
            if (g('isNew') !== undefined) { if (yes(g('isNew'))) p.isNew = true; else delete p.isNew; }
            if (g('featured') !== undefined) p.featured = yes(g('featured'));
            ['indications', 'details', 'actives'].forEach(k => { if (g(k) !== undefined) p[k] = g(k) ? g(k).split(/\s*\|\|\s*/).map(x => x.trim()).filter(Boolean) : null; });
            if (g('docs') !== undefined) p.docs = g('docs') ? g('docs').split(/\s*\|\|\s*/).map(x => { const i = x.indexOf('::'); return {title: x.slice(0, i).trim(), url: x.slice(i + 2).trim()}; }).filter(d => d.title && d.url) : [];
            if (!p.name) { problems.push(w + ': нет названия.'); return; }
            if (!ex) { if (!p.slug) p.slug = AD.slugify((p.brand || '') + ' ' + p.name); if (!p.id) p.id = p.slug; if (p.featured === undefined) p.featured = false; if (!p.docs) p.docs = []; if (next.some(x => x.id === p.id || x.slug === p.slug)) { problems.push(w + ': «' + p.name + '» — такой id или адрес уже есть.'); return; } next.push(p); added++; } else updated++;
            if (!brands.some(b => b.id === p.brand)) problems.push(w + ': неизвестный бренд «' + p.brand + '» (допустимые: ' + brands.map(b => b.id).join(', ') + ').');
            if (!cat.cats.some(c => c.id === p.cat)) problems.push(w + ': неизвестная категория «' + p.cat + '».');
            if (!cat.kinds.some(c => c.id === p.kind)) problems.push(w + ': неизвестный вид «' + p.kind + '».');
            if (!TYPES.some(t => t[0] === p.type)) problems.push(w + ': неизвестная упаковка «' + p.type + '» (допустимые: ' + TYPES.map(t => t[0]).join(', ') + ').');
          });
          plan = {next, added, updated};
          out.replaceChildren(AD.alertBox(problems.length ? 'warn' : 'ok', 'Будет добавлено: ' + added + ', обновлено: ' + updated + (problems.length ? '. Проблем: ' + problems.length + ' — исправьте файл и загрузите снова.' : '.')), problems.length ? h('ul', {class: 'alert err', style: {marginTop: '8px', paddingLeft: '28px', listStyle: 'disc'}}, problems.slice(0, 10).map(x => h('li', {}, x))) : null);
          apply.disabled = problems.length > 0 || (!added && !updated);
        });
        const m = AD.modal({title: 'Импорт товаров из CSV', cls: 'wide', body: [h('p', {class: 'muted'}, 'Файл в формате выгрузки («Экспорт CSV»): первая строка — заголовки, разделитель «;». Существующие товары ищутся по id или адресу и обновляются, новые добавляются. Перед применением вы увидите итог.'), h('div', {class: 'field'}, h('label', {for: 'imp-f'}, 'Файл CSV'), Object.assign(file, {id: 'imp-f'})), out], footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), apply]});
      }

      /* ----- редактор карточки ----- */
      function openEditor(item, isNew, restored) {
        if (openM) return openM; const dk = AD.drafts.key('product', isNew ? '__new' : item.id);
        const w = clone(item), orig = JSON.stringify(w), err = h('div', {}), photoBox = h('div', {}), packBox = h('div', {class: 'pk-grid', role: 'radiogroup', 'aria-label': 'Тип упаковки'}), pv = h('div', {class: 'pvc-w'}), slugNote = h('div', {class: 'help'});
        if (isNew && !w.brand) Object.assign(w, {brand: F.brand || (brands[0] || {}).id, cat: F.cat || (cat.cats[0] || {}).id, kind: (cat.kinds[0] || {}).id, type: 'bottle', tasks: [], docs: [], featured: false});
        if (restored) Object.assign(w, clone(restored));
        let slugTouched = !isNew;
        const ids = {}; ['name', 'slug', 'brand', 'cat', 'kind', 'desc', 'volume', 'sku', 'usage', 'ind', 'act', 'det', 'alt'].forEach(k => { ids[k] = nid(); });
        const txt = (k, id, o) => { const el = h(o && o.area ? 'textarea' : 'input', Object.assign({id, value: w[k] == null ? '' : w[k]}, o && o.area ? {rows: String(o.rows || 3)} : {type: 'text'}, o && o.max ? {maxlength: String(o.max)} : {})); if (o && o.area) el.textContent = w[k] == null ? '' : w[k]; el.addEventListener('input', () => { w[k] = el.value; if (!el.value && k !== 'name' && k !== 'desc') w[k] = null; onInput(k); }); return el; };
        const sel$ = (k, id, list) => { const el = h('select', {id}, list.map(x => h('option', {value: x.id, selected: x.id === w[k]}, x.name))); el.addEventListener('change', () => { w[k] = el.value; onInput(k); }); return el; };
        const listArea = (k, id, rows) => { const el = h('textarea', {id, rows: String(rows)}); el.textContent = lines(w[k]); el.addEventListener('input', () => { const l = toList(el.value); w[k] = l.length ? l : null; }); return el; };
        const nameI = txt('name', ids.name), slugI = txt('slug', ids.slug), descI = txt('desc', ids.desc, {area: true, rows: 3, max: 600}), descN = h('span', {class: 'counter'});
        const brandS = sel$('brand', ids.brand, brands), catS = sel$('cat', ids.cat, cat.cats), kindS = sel$('kind', ids.kind, cat.kinds);
        slugI.addEventListener('input', () => { slugTouched = true; });
        function onInput(k) {
          if (k === 'name' && !slugTouched) { const b = w.brand || ''; w.slug = AD.slugify(AD.slugify(w.name).startsWith(b) ? w.name : b + ' ' + w.name); slugI.value = w.slug; }
          if (k === 'brand' && !slugTouched && w.name) { w.slug = AD.slugify(w.brand + ' ' + w.name); slugI.value = w.slug; }
          const dupe = prods.some(p => p.slug === w.slug && p.id !== item.id), bad = w.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w.slug);
          slugNote.textContent = bad ? 'Адрес — только строчные латинские буквы, цифры и дефисы.' : dupe ? 'Такой адрес уже занят другим товаром — измените.' : w.slug ? 'Адрес страницы: /products/' + w.slug + '.html' : ''; slugNote.style.color = bad || dupe ? 'var(--err)' : '';
          slugI.classList.toggle('bad', !!(bad || dupe)); descN.textContent = Array.from(w.desc || '').length + ' / 600'; paintPv();
        }
        const taskBox = h('div', {class: 'multi'}, cat.tasks.map(t => { const c = h('input', {type: 'checkbox', checked: (w.tasks || []).includes(t.id), onchange: () => { const s = new Set(w.tasks || []); if (c.checked) s.add(t.id); else s.delete(t.id); w.tasks = cat.tasks.map(x => x.id).filter(x => s.has(x)); }}); return h('label', {class: 'chk'}, c, t.label); }));
        const flags = h('div', {class: 'multi'}, [['featured', 'Показывать на витрине («Рекомендуем»)'], ['isNew', 'Новинка']].map(([k, t]) => { const c = h('input', {type: 'checkbox', checked: !!w[k], onchange: () => { if (k === 'isNew' && !c.checked) delete w.isNew; else w[k] = c.checked; paintPv(); }}); return h('label', {class: 'chk'}, c, t); }));
        const docsBox = h('div', {class: 'ed-list'});
        const paintDocs = () => AD.fill(docsBox, (w.docs || []).map((d, i) => h('div', {class: 'ed-item'}, h('div', {class: 'v grid2'}, h('input', {type: 'text', value: d.title, placeholder: 'Название документа', 'aria-label': 'Название документа', oninput: e => { d.title = e.target.value; }}), h('input', {type: 'text', value: d.url, placeholder: 'Ссылка: https://… или assets/…', 'aria-label': 'Ссылка на документ', oninput: e => { d.url = e.target.value; }})), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Убрать документ', onclick: () => { w.docs.splice(i, 1); paintDocs(); }}, '✕'))), h('button', {class: 'btn sm', type: 'button', onclick: () => { (w.docs = w.docs || []).push({title: '', url: ''}); paintDocs(); }}, '＋ Добавить документ'));
        function paintPack() {
          AD.fill(packBox, TYPES.map(([id, t]) => h('button', {type: 'button', class: 'pk', role: 'radio', 'aria-checked': String(w.type === id), onclick: () => { w.type = id; paintPack(); paintPv(); }}, h('img', {src: packSrc(w.brand, id, w.id || w.slug), alt: ''}), h('span', {}, t))));
        }
        function paintPhoto() {
          const up = async f => { photoBox.querySelector('.mp-st').textContent = 'Сжимаю и загружаю…'; try { const r = await AD.media.upload('assets/products', f, {name: w.slug || 'product', max: 1400}); w.image = r.path; paintPhoto(); paintPv(); AD.toast('Фото загружено: ' + AD.size(r.size) + (r.before ? ' (было ' + AD.size(r.before) + ')' : ''), 'ok'); } catch (e) { photoBox.querySelector('.mp-st').replaceChildren(AD.alertBox('err', e.message)); } };
          const fi = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: () => { if (fi.files[0]) up(fi.files[0]); }});
          const dz = h('div', {class: 'bp-photo-field' + ''}, h('div', {class: 'bp-pv'}, w.image ? h('img', {src: '/' + w.image, alt: ''}) : h('span', {class: 'muted small'}, 'Фото нет — на витрине покажется упаковка')), h('div', {class: 'col'}, h('div', {class: 'row'}, h('button', {class: 'btn sm', type: 'button', onclick: () => fi.click()}, w.image ? 'Заменить фото' : 'Загрузить фото'), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.media.pick({dir: 'assets/products', title: 'Фото товара', current: w.image, max: 1400, name: w.slug || 'product', onPick: p => { if (p) { w.image = p; AD.media.altOf(p).then(a => { if (a && !w.imageAlt) { w.imageAlt = a; const el = document.getElementById(ids.alt); if (el) el.value = a; } }); } else delete w.image; paintPhoto(); paintPv(); }})}, 'Из библиотеки'), w.image ? h('button', {class: 'btn sm danger', type: 'button', onclick: () => { delete w.image; paintPhoto(); paintPv(); }}, 'Убрать') : null, fi), h('div', {class: 'mp-st small muted'}, 'Перетащите снимок сюда или выберите файл: он сожмётся в WebP (до 1400 px).')));
          ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('over'); })); ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('over'); })); dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files[0]) up(e.dataTransfer.files[0]); });
          AD.fill(photoBox, dz);
        }
        function paintPv() {
          const b = brandOf(w.brand), src = w.image ? '/' + w.image : packSrc(w.brand, w.type, w.id || w.slug);
          AD.fill(pv, h('div', {class: 'pvc', style: {'--c1': b.c1 || '#2f5bd6', '--c2': b.c2 || '#9db4f5', '--ink': b.ink || '#fff'}}, w.isNew ? h('span', {class: 'pvc-tag'}, 'Новинка') : null, h('div', {class: 'pvc-stage'}, h('img', {src, alt: '', class: w.image ? 'photo' : 'mock'})), h('div', {class: 'pvc-b'}, h('small', {}, b.name || ''), h('b', {}, w.name || 'Название товара'), h('p', {}, (w.desc || 'Краткое описание появится здесь.').slice(0, 110)), h('span', {class: 'pvc-go'}, 'Подробнее'))),
            h('div', {class: 'help', style: {marginTop: '8px'}}, w.featured ? 'Товар на интерактивной витрине в блоке «Рекомендуем» (новинки — первыми) и в каталоге.' : 'Товар виден в каталоге и на странице бренда; в «Рекомендуем» на витрине не показывается.'), h('div', {class: 'help'}, w.image ? 'Показывается фото (когда включена опция «фото товаров на витрине»), иначе — упаковка.' : 'На витрине и в каталоге нарисована упаковка выбранного вида.'));
        }
        const body = h('div', {class: 'pe'}, h('div', {class: 'pe-form ed-obj'},
          h('div', {class: 'grid2'}, fld('Название', nameI, null, ids.name), fld('Бренд', brandS, null, ids.brand)),
          fld('Адрес страницы (slug)', slugI, null, ids.slug), slugNote,
          h('div', {class: 'grid2'}, fld('Категория', catS, null, ids.cat), fld('Вид продукта', kindS, null, ids.kind)),
          fld('Для каких задач', taskBox), fld('Краткое описание (для карточки и поиска)', descI, null, ids.desc), descN,
          h('div', {class: 'grid2'}, fld('Объём', txt('volume', ids.volume), 'Например: 50 мл', ids.volume), fld('Артикул', txt('sku', ids.sku), null, ids.sku)),
          fld('Способ применения', txt('usage', ids.usage, {area: true, rows: 3}), null, ids.usage),
          fld('Показания (по одному в строке)', listArea('indications', ids.ind, 3), null, ids.ind), fld('Активные компоненты (по одному в строке)', listArea('actives', ids.act, 3), null, ids.act),
          fld('Подробное описание (абзацы, по одному в строке)', listArea('details', ids.det, 4), null, ids.det),
          fld('Документы', docsBox), fld('Метки', flags), fld('Тип упаковки', packBox, 'Так товар выглядит на витрине, пока нет фото. Нарисованные упаковки бренда подставляются сами.'),
          fld('Фото товара', photoBox), fld('Подпись к фото (для незрячих и поиска)', txt('imageAlt', ids.alt, {max: 160}), 'Если пусто — «Бренд — Название».', ids.alt)),
          h('aside', {class: 'pe-pv'}, h('div', {class: 'lbl'}, 'Так выглядит карточка'), pv));
        const saveBtn = h('button', {class: 'btn primary', type: 'button'}, isNew ? 'Добавить товар' : 'Сохранить');
        const m = openM = AD.modal({title: isNew ? 'Новый товар' : 'Товар: ' + item.name, cls: 'xl', sticky: true, body: [err, body],
          beforeClose: AD.drafts.guard(dk, () => JSON.stringify(w) !== orig), isDirty: () => JSON.stringify(w) !== orig,
          onClose: () => { openM = null; AD.dirty = false; if (/^#\/products\//.test(location.hash)) AD.go('#/products'); },
          footer: [!isNew ? h('a', {class: 'btn ghost', href: '/products/' + item.slug + '.html', target: '_blank', rel: 'noopener', style: {marginRight: 'auto'}}, 'Открыть на сайте') : null, h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), saveBtn]});
        saveBtn.addEventListener('click', () => run(async () => {
          if (!String(w.name || '').trim()) throw new Error('Укажите название товара.');
          if (!String(w.desc || '').trim()) throw new Error('Заполните краткое описание: оно показывается на карточке.');
          w.slug = String(w.slug || '').trim() || AD.slugify(w.brand + ' ' + w.name); if (!w.id) w.id = w.slug;
          w.docs = (w.docs || []).filter(d => d.title.trim() || d.url.trim());
          ['volume', 'sku', 'usage', 'indications', 'actives', 'details', 'imageAlt'].forEach(k => { if (w[k] === '' || (Array.isArray(w[k]) && !w[k].length)) w[k] = null; }); if (!w.isNew) delete w.isNew;
          const next = prods.slice(), pos = isNew ? -1 : next.findIndex(x => x.id === item.id); if (pos >= 0) next[pos] = w; else next.push(w);
          await commit(next, isNew ? 'Товар добавлен' : 'Товар сохранён', saveBtn); AD.drafts.clear(dk); m.close(true);
        }, err));
        paintPhoto(); paintPack(); paintDocs(); onInput('init'); AD.drafts.watch(m.body, dk, () => (JSON.stringify(w) !== orig ? w : null)); if (!restored) { const bn = AD.drafts.banner(dk, d => { m.close(true); openEditor(item, isNew, d); }); if (bn) err.prepend(bn); } return m;
      }

      /* ----- каркас страницы ----- */
      const search = h('input', {type: 'search', class: 'grow', placeholder: 'Поиск: название, артикул, бренд…', 'aria-label': 'Поиск по товарам', oninput: () => { F.q = search.value; pageN = 1; paint(); }});
      const mkSel = (key, label, opts) => { const s = h('select', {'aria-label': label, onchange: () => { F[key] = s.value; pageN = 1; paint(); }}, h('option', {value: ''}, label), opts.map(([v, t]) => h('option', {value: v}, t))); return s; };
      const hdr = AD.pageHead('Товары и витрина', 'Каждый товар попадает в каталог, на страницу бренда и — если отмечен «на витрине» — в блок «Рекомендуем» интерактивной витрины. После сохранения сайт пересобирается сам.',
        h('button', {class: 'btn', type: 'button', onclick: exportCsv}, 'Экспорт CSV'), h('button', {class: 'btn', type: 'button', onclick: importCsv}, 'Импорт CSV'), h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog('products', async () => { await load(); paint(); })}, 'История'), h('button', {class: 'btn primary', type: 'button', id: 'add-item', onclick: () => AD.go('#/products/__new')}, '＋ Добавить товар'));
      AD.fill(root, hdr, msg, h('div', {class: 'toolbar'}, search, mkSel('brand', 'Все бренды', brands.map(b => [b.id, b.name])), mkSel('cat', 'Все категории', cat.cats.map(c => [c.id, c.name])), mkSel('st', 'Все товары', [['featured', 'На витрине'], ['nofeat', 'Не на витрине'], ['new', 'Новинки'], ['nophoto', 'Без фото']]), count), bulk,
        h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, h('th', {class: 'pr-chk'}, h('input', {type: 'checkbox', 'aria-label': 'Выбрать все видимые', onclick: e => { visible().forEach(p => { if (e.target.checked) sel.add(p.id); else sel.delete(p.id); }); paint(); }})), ['Фото', 'Название', 'Бренд', 'Категория', 'Метки', ''].map(t => h('th', {}, t)))), tbody), empty), pager);
      paint();
      inst.onRoute = p => {
        const id = p[0];
        if (id === undefined) { if (openM) { const m = openM; openM = null; m.close(true); } return; }
        if (id === '__new') { if (!openM) openEditor({}, true); return; }
        const it = prods.find(x => x.id === id); if (it) openEditor(it, false); else { AD.toast('Товар «' + id + '» не найден', 'err'); AD.go('#/products'); }
      };
      inst.destroy = () => { if (openM) { const m = openM; openM = null; m.close(true); } AD.dirty = false; };
      if (parts.length) inst.onRoute(parts);
      return inst;
    }
  };
})();
