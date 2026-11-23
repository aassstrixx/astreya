/* Раздел «Бренды»: карточки брендов (логотип, цвета, тексты, факты) с живым превью и вкладки справочников каталога: категории, задачи подбора, виды продукта (data/catalog.json).
   Сохранение — целиком файл; сервер проверяет ссылки (нельзя удалить бренд или категорию, на которые ссылаются товары) и пересобирает сайт. */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const fld = (label, ctl, help, id) => h('div', {class: 'field'}, h('label', {for: id}, label), ctl, help ? h('div', {class: 'help'}, help) : null);
  let uid = 0; const nid = () => 'bf' + (++uid);
  const paras = v => (Array.isArray(v) ? v : []).join('\n\n'), fromParas = s => String(s || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);

  AD.views.brands = {
    async mount(root, parts) {
      const inst = {initial: true};
      let brands, bVer, cat, cVer, prods, tab = 'brands', openM = null;
      const load = async () => { const [b, c, p] = await Promise.all([AD.get('/api/collections/brands'), AD.get('/api/collections/catalog'), AD.get('/api/collections/products')]); brands = b.data; bVer = b.version; cat = c.data; cVer = c.version; prods = p.data; };
      await load();
      const msg = h('div', {}), body = h('div', {});
      const run = async (fn, into, btn) => { (into || msg).replaceChildren(); try { return await AD.busy(btn, fn); } catch (e) { (into || msg).replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: async () => { await load(); render(); msg.replaceChildren(); }}, 'Загрузить актуальные данные')) : AD.errBox(e)); if (!into) window.scrollTo({top: 0, behavior: 'smooth'}); return null; } };
      const saveBrands = async (next, okMsg, btn) => { const r = await AD.put('/api/collections/brands', {data: next, version: bVer}); await load(); render(); AD.toast((okMsg || 'Сохранено') + (r.build ? ', сайт пересобран' : ''), 'ok'); return r; };
      const saveCat = async (next, okMsg, btn) => { const r = await AD.put('/api/collections/catalog', {data: next, version: cVer}); await load(); render(); AD.toast((okMsg || 'Сохранено') + (r.build ? ', сайт пересобран' : ''), 'ok'); return r; };

      /* ----- бренды ----- */
      function brandCard(b) {
        const n = prods.filter(p => p.brand === b.id).length;
        return h('a', {class: 'tile br-card', href: '#/brands/' + encodeURIComponent(b.id), style: {'--c1': b.c1, '--c2': b.c2}}, h('span', {class: 'br-sw'}, b.logo ? h('img', {src: '/' + b.logo, alt: ''}) : h('b', {}, (b.name || '?').slice(0, 1))), h('b', {}, b.name), h('span', {}, (b.group || '') + ' · ' + n + ' ' + AD.plural(n, 'товар', 'товара', 'товаров')), h('span', {class: 'small'}, b.tag || ''));
      }
      function brandsTab() {
        AD.fill(body, h('div', {class: 'cols'}, brands.map(brandCard)));
      }
      function openBrand(item, isNew, restored) {
        if (openM) return openM; const dk = AD.drafts.key('brand', isNew ? '__new' : item.id);
        const w = clone(item), orig = JSON.stringify(w), err = h('div', {}), pv = h('div', {}), logoBox = h('div', {}), factsBox = h('div', {class: 'ed-list'});
        if (isNew) Object.assign(w, {id: '', name: '', group: 'Испания', country: 'Испания', tag: '', c1: '#1c2f5a', c2: '#9db4f5', ink: '#fff', desc: '', long: [], facts: [], logo: null});
        if (restored) Object.assign(w, clone(restored));
        const ids = {}; ['name', 'id', 'group', 'tag', 'desc', 'long', 'c1', 'c2', 'country', 'cn'].forEach(k => { ids[k] = nid(); });
        const txt = (k, o) => { const el = h(o && o.area ? 'textarea' : 'input', Object.assign({id: ids[o && o.id || k]}, o && o.area ? {rows: String(o.rows || 3)} : {type: 'text'})); const v = w[k] == null ? '' : w[k]; if (o && o.area) el.textContent = v; else el.value = v; el.addEventListener('input', () => { w[k] = el.value; if (k === 'name' && isNew && !idTouched) { w.id = AD.slugify(el.value); idI.value = w.id; } paint(); }); return el; };
        let idTouched = !isNew; const idI = txt('id'); idI.disabled = !isNew; idI.addEventListener('input', () => { idTouched = true; });
        const longI = h('textarea', {id: ids.long, rows: '6'}); longI.textContent = paras(w.long); longI.addEventListener('input', () => { w.long = fromParas(longI.value); });
        const color = (k, label) => { const c = h('input', {type: 'color', id: ids[k], value: /^#[0-9a-f]{6}$/i.test(w[k]) ? w[k] : '#1c2f5a', 'aria-label': label}), t = h('input', {type: 'text', value: w[k], 'aria-label': label + ' (код)', style: {maxWidth: '110px'}}); c.addEventListener('input', () => { w[k] = c.value; t.value = c.value; paint(); }); t.addEventListener('input', () => { w[k] = t.value; if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; paint(); }); return h('div', {class: 'color-w'}, c, t); };
        const ink = h('select', {id: nid(), 'aria-label': 'Цвет текста на карточке'}, [['#fff', 'Светлый текст'], ['#0b1a33', 'Тёмный текст']].map(([v, t]) => h('option', {value: v, selected: String(w.ink).toLowerCase() === v}, t))); ink.addEventListener('change', () => { w.ink = ink.value; paint(); });
        function paintFacts() { AD.fill(factsBox, (w.facts || []).map((f, i) => h('div', {class: 'ed-item'}, h('div', {class: 'v grid2'}, h('input', {type: 'text', value: f[0], placeholder: 'Название (Страна)', 'aria-label': 'Название факта', oninput: e => { f[0] = e.target.value; }}), h('input', {type: 'text', value: f[1], placeholder: 'Значение (Испания)', 'aria-label': 'Значение факта', oninput: e => { f[1] = e.target.value; }})), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Убрать факт', onclick: () => { w.facts.splice(i, 1); paintFacts(); }}, '✕'))), h('button', {class: 'btn sm', type: 'button', onclick: () => { (w.facts = w.facts || []).push(['', '']); paintFacts(); }}, '＋ Добавить факт')); }
        function paintLogo() {
          const up = async f => { try { const r = await AD.media.upload('assets/brands', f, {name: w.id || 'brand', max: 900, quality: .9}); w.logo = r.path; paintLogo(); paint(); } catch (e) { err.replaceChildren(AD.errBox(e)); } };
          const fi = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: () => { if (fi.files[0]) up(fi.files[0]); }});
          AD.fill(logoBox, h('div', {class: 'bp-photo-field'}, h('div', {class: 'bp-pv'}, w.logo ? h('img', {src: '/' + w.logo, alt: ''}) : h('span', {class: 'muted small'}, 'Логотипа нет — покажется монограмма')), h('div', {class: 'col'}, h('div', {class: 'row'}, h('button', {class: 'btn sm', type: 'button', onclick: () => fi.click()}, 'Загрузить логотип'), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.media.pick({dir: 'assets/brands', title: 'Логотип бренда', current: w.logo, onPick: p => { w.logo = p || null; paintLogo(); paint(); }})}, 'Из библиотеки'), w.logo ? h('button', {class: 'btn sm danger', type: 'button', onclick: () => { w.logo = null; paintLogo(); paint(); }}, 'Убрать') : null, fi), h('div', {class: 'small muted'}, 'Подойдёт PNG с прозрачным фоном (SVG-логотипы кладутся в репозиторий вручную). Сжатие в WebP не применяется к PNG-логотипам с прозрачностью — загрузите готовый файл.'))));
        }
        function paint() { AD.fill(pv, h('div', {class: 'pvc', style: {'--c1': w.c1 || '#1c2f5a', '--c2': w.c2 || '#9db4f5'}}, h('div', {class: 'pvc-stage', style: {color: w.ink || '#fff'}}, w.logo ? h('img', {src: '/' + w.logo, alt: '', class: 'photo', style: {maxWidth: '70%', maxHeight: '110px', filter: 'none'}}) : h('b', {style: {font: '500 44px var(--serif)'}}, (w.name || '?').slice(0, 1))), h('div', {class: 'pvc-b'}, h('small', {}, w.group || ''), h('b', {}, w.name || 'Название бренда'), h('p', {}, (w.tag || 'Краткая подпись бренда').slice(0, 90))))); }
        const grid = h('div', {class: 'pe'}, h('div', {class: 'pe-form ed-obj'}, h('div', {class: 'grid2'}, fld('Название', txt('name'), null, ids.name), fld('Идентификатор (id)', idI, isNew ? 'Латиница и дефис; задаётся один раз.' : 'Менять нельзя: на него ссылаются товары.', ids.id)),
          h('div', {class: 'grid2'}, fld('Группа (страна, линия)', txt('group'), 'Показывается над названием: «Испания», «Cantabria Labs».', ids.group), fld('Страна', txt('country'), null, ids.country)),
          fld('Короткая подпись', txt('tag'), 'Одна строка под названием на карточке бренда.', ids.tag), fld('Краткое описание', txt('desc', {area: true, rows: 3}), 'Идёт в описание страницы для поисковиков и на карточку.', ids.desc),
          fld('Подробный текст (абзацы через пустую строку)', longI, null, ids.long), fld('Факты (Страна, Направления, Обучение…)', factsBox),
          h('div', {class: 'grid3'}, fld('Цвет 1', color('c1', 'Цвет 1'), 'Основной оттенок карточки.', ids.c1), fld('Цвет 2', color('c2', 'Цвет 2'), 'Второй оттенок градиента.', ids.c2), fld('Текст на цвете', ink)), fld('Логотип', logoBox)), h('aside', {class: 'pe-pv'}, h('div', {class: 'lbl'}, 'Так выглядит карточка'), pv));
        const saveBtn = h('button', {class: 'btn primary', type: 'button'}, isNew ? 'Добавить бренд' : 'Сохранить');
        const m = openM = AD.modal({title: isNew ? 'Новый бренд' : 'Бренд: ' + item.name, cls: 'xl', sticky: true, body: [err, grid], beforeClose: AD.drafts.guard(dk, () => JSON.stringify(w) !== orig), isDirty: () => JSON.stringify(w) !== orig,
          onClose: () => { openM = null; if (/^#\/brands\//.test(location.hash)) AD.go('#/brands'); },
          footer: [!isNew ? [h('button', {class: 'btn danger', type: 'button', style: {marginRight: 'auto'}, onclick: async () => { if (!await AD.confirm('Удалить бренд «' + item.name + '»? Страница бренда исчезнет с сайта. Если у бренда есть товары, сначала смените им бренд.', {ok: 'Удалить'})) return; await run(async () => { await saveBrands(brands.filter(x => x.id !== item.id), 'Бренд удалён'); m.close(true); }, err); }}, 'Удалить'), h('a', {class: 'btn ghost', href: '/brands/' + item.id + '.html', target: '_blank', rel: 'noopener'}, 'Открыть на сайте')] : null, h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), saveBtn]});
        saveBtn.addEventListener('click', () => run(async () => {
          if (!String(w.name || '').trim()) throw new Error('Укажите название бренда.'); if (!w.id) w.id = AD.slugify(w.name);
          if (!String(w.desc || '').trim()) throw new Error('Заполните краткое описание бренда.'); if (!w.long || !w.long.length) w.long = [w.desc];
          w.facts = (w.facts || []).filter(f => String(f[0]).trim() || String(f[1]).trim()); if (!w.country) w.country = w.group;
          const next = brands.slice(), pos = isNew ? -1 : next.findIndex(x => x.id === item.id); if (pos >= 0) next[pos] = w; else next.push(w);
          await saveBrands(next, isNew ? 'Бренд добавлен' : 'Бренд сохранён'); AD.drafts.clear(dk); m.close(true);
        }, err, saveBtn));
        paintLogo(); paintFacts(); paint(); AD.drafts.watch(m.body, dk, () => (JSON.stringify(w) !== orig ? w : null)); if (!restored) { const bn = AD.drafts.banner(dk, d => { m.close(true); openBrand(item, isNew, d); }); if (bn) err.prepend(bn); } return m;
      }

      /* ----- справочники каталога ----- */
      function listTab(key, title, help, extra) {
        const work = clone(cat[key]), rows = h('div', {class: 'ed-list'}), err = h('div', {}), orig = JSON.stringify(work);
        const used = id => key === 'cats' ? prods.some(p => p.cat === id) : key === 'kinds' ? prods.some(p => p.kind === id) : prods.some(p => (p.tasks || []).includes(id));
        const nameKey = key === 'tasks' ? 'label' : 'name';
        function paintRows() {
          AD.fill(rows, work.map((x, i) => h('div', {class: 'ed-item'}, h('div', {class: 'v'}, h('div', {class: 'grid2'}, h('input', {type: 'text', value: x[nameKey], placeholder: 'Название', 'aria-label': 'Название', oninput: e => { x[nameKey] = e.target.value; dirty(); }}), h('input', {type: 'text', value: x.id, disabled: !x.__new, placeholder: 'id латиницей', 'aria-label': 'Идентификатор', oninput: e => { x.id = e.target.value; dirty(); }})),
            key === 'tasks' ? [h('textarea', {rows: '2', placeholder: 'Пояснение: логика ухода по этой задаче', 'aria-label': 'Пояснение', style: {marginTop: '8px'}, oninput: e => { x.note = e.target.value; dirty(); }}, x.note || ''), h('div', {class: 'multi', style: {marginTop: '8px'}}, brands.map(b => { const c = h('input', {type: 'checkbox', checked: (x.brands || []).includes(b.id), onchange: () => { const s = new Set(x.brands || []); if (c.checked) s.add(b.id); else s.delete(b.id); x.brands = brands.map(z => z.id).filter(z => s.has(z)); dirty(); }}); return h('label', {class: 'chk'}, c, b.name); }))] : null),
            h('div', {class: 'row gap-s'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => { [work[i - 1], work[i]] = [work[i], work[i - 1]]; paintRows(); dirty(); }}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Ниже', disabled: i === work.length - 1, onclick: () => { [work[i + 1], work[i]] = [work[i], work[i + 1]]; paintRows(); dirty(); }}, '↓'), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить', onclick: () => { if (!x.__new && used(x.id)) { AD.toast('«' + x[nameKey] + '» используется в товарах — сначала смените им значение.', 'err'); return; } work.splice(i, 1); paintRows(); dirty(); }}, '✕')))), h('button', {class: 'btn sm', type: 'button', onclick: () => { work.push(Object.assign({id: '', __new: true}, key === 'tasks' ? {label: '', note: '', brands: []} : {name: ''})); paintRows(); dirty(); }}, '＋ Добавить'));
        }
        const saveBtn = h('button', {class: 'btn primary', type: 'button', disabled: true}), state = h('span', {class: 'muted small'});
        saveBtn.textContent = 'Сохранить';
        const dirty = () => { const d = JSON.stringify(work) !== orig; saveBtn.disabled = !d; AD.dirty = d; AD.fill(state, d ? [h('span', {class: 'dot'}), 'Есть несохранённые изменения'] : ''); };
        AD.saveHook = () => { if (!saveBtn.disabled) saveBtn.click(); };
        saveBtn.addEventListener('click', () => run(async () => {
          const next = clone(cat); next[key] = work.map(x => { const c = Object.assign({}, x); delete c.__new; if (!c.id) c.id = AD.slugify(c[nameKey]); return c; });
          await saveCat(next, title + ': сохранено'); AD.dirty = false;
        }, err, saveBtn));
        paintRows();
        AD.fill(body, h('div', {class: 'card'}, h('p', {class: 'muted', style: {marginBottom: '12px'}}, help), err, rows, h('div', {class: 'row', style: {marginTop: '14px'}}, saveBtn, state)));
      }

      const TABS = [['brands', 'Бренды'], ['cats', 'Категории'], ['tasks', 'Задачи подбора'], ['kinds', 'Виды продукта']];
      function render() {
        AD.dirty = false; AD.saveHook = null;
        const tabs = h('div', {class: 'dtabs', role: 'tablist'}, TABS.map(([id, t]) => h('button', {type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { if (AD.dirty && !confirm('Есть несохранённые изменения. Перейти без сохранения?')) return; tab = id; render(); }}, t)));
        AD.fill(root, AD.pageHead('Бренды и справочники', 'Бренды портфеля, категории каталога, задачи подбора и виды продукта. Добавили бренд или категорию — они сразу появятся в фильтрах каталога и на страницах.', h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog(tab === 'brands' ? 'brands' : 'catalog', async () => { await load(); render(); })}, 'История'), tab === 'brands' ? h('button', {class: 'btn primary', type: 'button', id: 'add-item', onclick: () => AD.go('#/brands/__new')}, '＋ Добавить бренд') : null), msg, tabs, body);
        if (tab === 'brands') brandsTab(); else if (tab === 'cats') listTab('cats', 'Категории', 'Категории каталога («Эстетика лица», «Химические пилинги»). Идентификатор — латиницей, задаётся один раз; категорию с товарами удалить нельзя.'); else if (tab === 'tasks') listTab('tasks', 'Задачи подбора', 'Задачи клиента для подбора («Акне», «Пигментация»): название, пояснение логики ухода и бренды, которые с ней работают.'); else listTab('kinds', 'Виды продукта', 'Вид продукта в фильтре каталога («Сыворотки», «Кремы»).');
      }
      render();
      inst.onRoute = p => {
        const id = p[0];
        if (id === undefined) { if (openM) { const m = openM; openM = null; m.close(true); } return; }
        tab = 'brands'; if (!root.querySelector('.cols')) render();
        if (id === '__new') { if (!openM) openBrand({}, true); return; }
        const it = brands.find(x => x.id === id); if (it) openBrand(it, false); else { AD.toast('Бренд «' + id + '» не найден', 'err'); AD.go('#/brands'); }
      };
      inst.destroy = () => { if (openM) { const m = openM; openM = null; m.close(true); } AD.dirty = false; AD.saveHook = null; };
      if (parts.length) inst.onRoute(parts);
      return inst;
    }
  };
})();
