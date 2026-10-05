/* Раздел «Товары по брендам»: выбираете бренд — видите его товары карточками с фото; можно добавить товар, изменить, поставить или заменить фото
   (кнопкой или перетаскиванием снимка на карточку), поднять/опустить, сделать копию, удалить. Каждое действие сразу сохраняется (data/products.json),
   сайт пересобирается, а сервер проверяет данные и откатывает правку, если что-то не так. Остальные поля (документы, детали) — в «Содержимое сайта → Товары». */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const TYPES = [['tube', 'Туба'], ['jar', 'Баночка'], ['dropper', 'Флакон-капельница'], ['bottle', 'Флакон'], ['pump', 'Флакон с дозатором'], ['box', 'Коробка'], ['device', 'Устройство']];
  const PHOTO_DIR = 'assets/products';
  const field = (label, control, help, id) => h('div', {class: 'field'}, h('label', {for: id}, label), control, help ? h('div', {class: 'help'}, help) : null);
  let uid = 0; const nid = () => 'bp' + (++uid);

  AD.views.brandprods = {
    async mount(root, parts) {
      const inst = {initial: true};
      let prods, brands, cat, version, openM = null;
      const load = async () => { const [p, b, c] = await Promise.all([AD.get('/api/collections/products'), AD.get('/api/collections/brands'), AD.get('/api/collections/catalog')]); prods = p.data; version = p.version; brands = b.data; cat = c.data; };
      await load();
      let brandId = parts[0] || (brands[0] || {}).id; if (!brands.some(b => b.id === brandId)) brandId = (brands[0] || {}).id;
      let q = '';
      const msg = h('div', {}), tabs = h('div', {class: 'bp-tabs', role: 'group', 'aria-label': 'Бренды'}), head = h('div', {class: 'card bp-head'}), grid = h('div', {class: 'bp-grid'});
      const brandOf = id => brands.find(b => b.id === id) || {id, name: id}, name = (list, id) => ((list || []).find(x => x.id === id) || {}).name || id, taskName = id => ((cat.tasks || []).find(x => x.id === id) || {}).label || id;
      const mine = () => prods.filter(p => p.brand === brandId);

      /* ----- запись: целиком список товаров, по версии (чужие правки не затираются) ----- */
      async function commit(next, okMsg) {
        const r = await AD.put('/api/collections/products', {data: next, version}); await load(); paintAll();
        AD.toast(okMsg + (r.build ? ', сайт пересобран' : ''), 'ok'); return r;
      }
      async function run(fn, btn, into) {
        const box = into || msg; msg.replaceChildren(); box.replaceChildren();
        try { return await AD.busy(btn, fn); }
        catch (e) {
          box.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: async () => { await load(); paintAll(); msg.replaceChildren(); }}, 'Обновить список')) : AD.errBox(e));
          if (!into) window.scrollTo({top: 0, behavior: 'smooth'}); else err.scrollIntoView({block: 'nearest', behavior: 'smooth'}); return null;
        }
      }
      const withoutImage = p => { const c = clone(p); delete c.image; return c; };
      /* старый снимок из папки «Фото товаров» удаляем, если он больше нигде не стоит: лишние файлы в галерее не копятся */
      const tidy = async old => { if (old && await AD.dropIfUnused(old)) AD.toast('Старый снимок удалён из папки'); };
      const setImage = async (p, path) => { const old = p.image, r = await run(() => commit(prods.map(x => x.id === p.id ? (path ? Object.assign({}, x, {image: path}) : withoutImage(x)) : x), path ? 'Фото товара «' + p.name + '» установлено' : 'Фото убрано')); if (r && old !== path) await tidy(old); return r; };

      /* ----- фото: из галереи / загрузкой / перетаскиванием на карточку ----- */
      async function pickPhoto(p) { const path = await AD.pickImage({dir: PHOTO_DIR, only: true, pickUploaded: true}); if (path) await setImage(p, path); }
      async function freeName(base, ext) {
        let names = []; try { const d = (await AD.get('/api/files')).dirs.find(x => x.dir === PHOTO_DIR); names = d ? d.files.map(f => f.name) : []; } catch (e) {}
        let n = base + '.' + ext, i = 2; while (names.includes(n)) n = base + '-' + (i++) + '.' + ext; return n;
      }
      async function photoFromFile(p, file) {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { AD.toast('Нужна картинка PNG, JPG, WebP или GIF', 'err'); return; }
        AD.toast('Загружаю фото…');
        await run(async () => {
          const small = await AD.shrinkImage(file); if (small !== file) AD.toast('Фото уменьшено: ' + AD.size(file.size) + ' → ' + AD.size(small.size));
          if (small.size > (AD.config.maxUpload || 6291456)) throw new Error('Файл больше 6 МБ даже после уменьшения.');
          const ext = (small.name.match(/\.(\w+)$/) || [, 'jpg'])[1].toLowerCase().replace('jpeg', 'jpg'), up = await AD.post('/api/files', {dir: PHOTO_DIR, name: await freeName(p.slug, ext), data: await AD.readB64(small)});
          await commit(prods.map(x => x.id === p.id ? Object.assign({}, x, {image: up.path}) : x), 'Фото товара «' + p.name + '» установлено');
        }).then(r => r ? tidy(p.image) : r);
      }

      /* ----- перечень ----- */
      function paintTabs() {
        AD.fill(tabs, brands.map(b => { const n = prods.filter(p => p.brand === b.id).length; return h('button', {class: 'bp-tab', type: 'button', 'aria-pressed': String(b.id === brandId), dataset: {id: b.id}, onclick: () => AD.go('#/brandprods/' + encodeURIComponent(b.id))}, h('span', {}, b.name), h('span', {class: 'n'}, String(n))); }));
      }
      function paintHead() {
        const b = brandOf(brandId), list = mine(), withPhoto = list.filter(p => p.image).length, search = h('input', {type: 'search', id: 'bp-q', placeholder: 'Поиск по названию…', 'aria-label': 'Поиск среди товаров бренда', value: q, oninput: () => { q = search.value; paintGrid(); }});
        AD.fill(head, h('div', {class: 'bp-hd'}, b.logo ? h('img', {class: 'bp-logo', src: '/' + b.logo, alt: ''}) : null, h('div', {style: {minWidth: 0}}, h('h2', {}, b.name), h('div', {class: 'muted small'}, [b.group, list.length + ' ' + AD.plural(list.length, 'товар', 'товара', 'товаров') + (list.length ? ', с фото: ' + withPhoto : '')].filter(Boolean).join(' · '))),
          h('div', {class: 'right row'}, search, h('a', {class: 'btn', href: '/brands/' + encodeURIComponent(b.id) + '.html', target: '_blank', rel: 'noopener'}, 'Страница бренда'), h('button', {class: 'btn primary', type: 'button', id: 'bp-add', onclick: () => editDialog(null)}, '＋ Добавить товар'))));
      }
      function paintGrid() {
        const t = q.trim().toLowerCase(), list = mine(), shown = list.filter(p => !t || (p.name + ' ' + p.desc).toLowerCase().includes(t));
        if (!list.length) { AD.fill(grid, h('div', {class: 'empty', style: {gridColumn: '1/-1'}}, h('b', {}, 'У бренда пока нет товаров'), 'Добавьте первый товар — он появится в каталоге, на странице бренда и получит свою страницу.', h('div', {style: {marginTop: '12px'}}, h('button', {class: 'btn primary', type: 'button', onclick: () => editDialog(null)}, '＋ Добавить товар')))); return; }
        if (!shown.length) { AD.fill(grid, h('div', {class: 'empty', style: {gridColumn: '1/-1'}}, h('b', {}, 'Ничего не найдено'), 'Измените запрос.')); return; }
        AD.fill(grid, shown.map(p => card(p, list)));
      }
      function card(p, list) {
        const i = list.indexOf(p), over = () => ph.classList.add('over'), out = () => ph.classList.remove('over');
        const ph = h('button', {class: 'bp-ph' + (p.image ? '' : ' empty'), type: 'button', 'aria-label': (p.image ? 'Заменить фото товара ' : 'Поставить фото товара ') + p.name, onclick: () => pickPhoto(p),
          ondragover: e => { e.preventDefault(); over(); }, ondragleave: out, ondrop: e => { e.preventDefault(); out(); const f = e.dataTransfer.files[0]; if (f) photoFromFile(p, f); }},
          p.image ? h('img', {src: '/' + p.image, alt: '', loading: 'lazy'}) : h('span', {class: 'none'}, h('b', {}, 'Нет фото'), h('small', {}, 'Нажмите или перетащите снимок сюда')));
        const mv = d => run(() => { const a = prods.slice(), j = list[i + d]; if (!j) return; const x = a.indexOf(p), y = a.indexOf(j); [a[x], a[y]] = [a[y], a[x]]; return commit(a, 'Порядок изменён'); });
        return h('article', {class: 'bp-card', dataset: {id: p.id}},
          h('div', {class: 'bp-phw'}, ph, p.image ? h('button', {class: 'bp-x', type: 'button', 'aria-label': 'Убрать фото товара ' + p.name, title: 'Убрать фото', onclick: () => setImage(p, null)}, '✕') : null, h('div', {class: 'bp-badges'}, p.isNew ? h('span', {class: 'pill new'}, 'Новинка') : null, p.featured ? h('span', {class: 'pill done'}, 'На главной') : null)),
          h('div', {class: 'bp-body'}, h('h3', {}, p.name), h('div', {class: 'muted small'}, name(cat.cats, p.cat) + ' · ' + name(cat.kinds, p.kind)), h('p', {class: 'bp-desc'}, p.desc)),
          h('div', {class: 'bp-act'}, h('button', {class: 'btn sm primary', type: 'button', onclick: () => editDialog(p)}, 'Править'), h('a', {class: 'btn sm', href: '/products/' + encodeURIComponent(p.slug) + '.html', target: '_blank', rel: 'noopener'}, 'На сайте'),
            h('span', {class: 'right bl-ctl'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Поднять выше', title: 'Выше', disabled: i === 0, onclick: () => mv(-1)}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Опустить ниже', title: 'Ниже', disabled: i === list.length - 1, onclick: () => mv(1)}, '↓'),
              h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Сделать копию', title: 'Копия', onclick: () => duplicate(p)}, '⧉'), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить товар ' + p.name, title: 'Удалить', onclick: () => remove(p)}, '✕'))));
      }
      const paintAll = () => { paintTabs(); paintHead(); paintGrid(); };

      /* ----- действия ----- */
      async function remove(p) {
        if (!await AD.confirm('Удалить товар «' + p.name + '»? Его страница products/' + p.slug + '.html исчезнет с сайта. Вернуть можно через «История» в разделе «Содержимое сайта → Товары».', {ok: 'Удалить'})) return;
        await run(() => commit(prods.filter(x => x.id !== p.id), 'Товар «' + p.name + '» удалён'));
      }
      const uniq = (base, key) => { let n = base, i = 2; while (prods.some(x => x[key] === n)) n = base + '-' + (i++); return n; };
      /* копия открывается как «новый товар» с теми же данными — сохраняется, только когда вы нажмёте «Добавить» (описание нужно изменить: одинаковые описания поисковики считают дублями) */
      function duplicate(p) { const c = clone(p); c.name += ' (копия)'; delete c.id; delete c.slug; delete c.isNew; delete c.featured; editDialog(null, c, p); }

      /* ----- окно «товар»: добавить / изменить ----- */
      function editDialog(orig, tpl, copyOf) {
        if (openM) openM.close(true);
        const isNew = !orig, w = orig ? clone(orig) : Object.assign({id: '', slug: '', brand: brandId, cat: (mine()[0] || {}).cat || cat.cats[0].id, kind: (mine()[0] || {}).kind || cat.kinds[0].id, type: 'bottle', name: '', desc: '', tasks: [], docs: []}, tpl || {});
        let slugTouched = !isNew; if (tpl) w.slug = AD.slugify(w.brand + ' ' + w.name); const err = h('div', {});
        const select = (label, key, opts, extra) => { const id = nid(), el = h('select', {id}, opts.map(([v, t]) => h('option', {value: v}, t))); el.value = w[key]; el.addEventListener('change', () => { w[key] = el.value; if (extra) extra(); }); return field(label, el, null, id); };
        const text = (label, key, o) => { o = o || {}; const id = nid(), el = h(o.area ? 'textarea' : 'input', {id, type: o.area ? null : 'text', rows: o.area ? String(o.rows || 3) : null, maxlength: o.max ? String(o.max) : null, placeholder: o.ph || '', readOnly: !!o.readonly}); el.value = w[key] === null || w[key] === undefined ? '' : w[key]; el.addEventListener('input', () => { w[key] = el.value; if (o.input) o.input(el); }); return Object.assign(field(label, el, o.help, id), {input: el}); };
        const lines = (label, key, o) => { const id = nid(), el = h('textarea', {id, rows: String(o.rows || 3), placeholder: o.ph || ''}); el.value = (w[key] || []).join('\n'); el.addEventListener('input', () => { w[key] = el.value.split('\n').map(x => x.trim()).filter(Boolean); }); return field(label, el, 'Каждый пункт — с новой строки.', id); };
        const check = (label, key, help) => { const c = h('input', {type: 'checkbox', checked: !!w[key]}); c.addEventListener('change', () => { w[key] = c.checked; }); return h('div', {class: 'field'}, h('label', {class: 'switch'}, c, label), help ? h('div', {class: 'help'}, help) : null); };
        /* фото */
        const thumb = h('div', {class: 'bp-pv'}), pick = h('button', {class: 'btn', type: 'button', id: 'bp-photo', onclick: async () => { const pth = await AD.pickImage({dir: PHOTO_DIR, only: true, pickUploaded: true}); if (pth) { w.image = pth; paintPhoto(); } }}), drop = h('button', {class: 'btn danger', type: 'button', onclick: () => { delete w.image; paintPhoto(); }}, 'Убрать фото');
        function paintPhoto() { AD.fill(thumb, w.image ? h('img', {src: '/' + w.image, alt: ''}) : h('span', {class: 'muted small'}, 'Нет фото — на сайте покажется иллюстрация упаковки')); pick.textContent = w.image ? 'Заменить фото…' : 'Загрузить или выбрать фото…'; drop.hidden = !w.image; }
        const nameF = text('Название', 'name', {max: 120, input: el => { if (isNew && !slugTouched) { slugF.input.value = w.slug = AD.slugify(w.brand + ' ' + el.value); } }});
        const brandF = select('Бренд', 'brand', brands.map(b => [b.id, b.name]), () => { if (isNew && !slugTouched) slugF.input.value = w.slug = AD.slugify(w.brand + ' ' + w.name); });
        const slugF = text('Адрес страницы', 'slug', {readonly: !isNew, max: 80, help: isNew ? 'Строится из бренда и названия. Только латинские буквы, цифры и дефисы.' : 'У существующего товара адрес не меняется — чтобы не ломать ссылки.', input: () => { slugTouched = true; }});
        const tasksBox = h('div', {class: 'row gap-s', role: 'group', 'aria-label': 'Задачи ухода'}, (cat.tasks || []).map(t => { const b = h('button', {class: 'bp-chip', type: 'button', 'aria-pressed': String((w.tasks || []).includes(t.id)), onclick: () => { w.tasks = w.tasks || []; const k = w.tasks.indexOf(t.id); if (k >= 0) w.tasks.splice(k, 1); else w.tasks.push(t.id); b.setAttribute('aria-pressed', String(k < 0)); }}, t.label); return b; }));
        const body = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}}, err,
          h('div', {class: 'bp-photo-field'}, thumb, h('div', {style: {display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start'}}, h('b', {}, 'Фото товара'), h('div', {class: 'row gap-s'}, pick, drop), h('div', {class: 'help muted small'}, 'Подойдёт снимок на светлом фоне. Большие фото уменьшаются сами (до 1400 px, WebP).'))),
          nameF, h('div', {class: 'grid2'}, brandF, select('Категория', 'cat', cat.cats.map(c => [c.id, c.name]))), h('div', {class: 'grid2'}, select('Вид продукта', 'kind', cat.kinds.map(k => [k.id, k.name])), select('Иллюстрация, если нет фото', 'type', TYPES)),
          h('div', {class: 'field'}, h('span', {class: 'lbl'}, 'Задачи ухода'), tasksBox), text('Краткое описание', 'desc', {area: true, max: 400, help: 'Видно на карточке и в поиске.'}),
          h('div', {class: 'grid2'}, check('Новинка', 'isNew', 'Метка «Новинка» на карточке.'), check('В подборке на главной', 'featured', 'Показывать среди выбранных товаров на главной.')),
          h('div', {class: 'grid2'}, text('Объём', 'volume', {ph: '50 мл'}), text('Артикул', 'sku')), lines('Показания', 'indications', {rows: 3}), lines('Активные компоненты', 'actives', {rows: 3}), text('Способ применения', 'usage', {area: true, rows: 3}), slugF,
          orig ? h('div', {class: 'help muted small'}, 'Документы и подробные характеристики — ', h('a', {href: '#/content/products/' + encodeURIComponent(orig.id), onclick: () => openM && openM.close(true)}, 'в расширенном редакторе'), '.') : null);
        paintPhoto();
        const saveBtn = h('button', {class: 'btn primary', type: 'button', id: 'bp-save', onclick: () => save()}, isNew ? 'Добавить товар' : 'Сохранить');
        openM = AD.modal({title: isNew ? (copyOf ? 'Копия товара «' + copyOf.name + '»' : 'Новый товар · ' + brandOf(brandId).name) : orig.name, body, cls: 'wide', footer: [h('button', {class: 'btn', type: 'button', onclick: () => openM.close()}, 'Отмена'), saveBtn], onClose: () => { openM = null; if (location.hash.split('/').length > 3) history.replaceState(null, '', '#/brandprods/' + encodeURIComponent(brandId)); }});
        async function save() {
          err.replaceChildren(); const bad = m => { err.replaceChildren(AD.alertBox('err', m)); body.parentElement.scrollTo({top: 0, behavior: 'smooth'}); };
          if (!String(w.name || '').trim()) return bad('Укажите название товара.'); if (!String(w.desc || '').trim()) return bad('Добавьте краткое описание — оно видно на карточке и в поиске.');
          const twin = prods.find(x => x.id !== (orig && orig.id) && String(x.desc).trim() === w.desc.trim()); if (twin) return bad('Такое же описание у товара «' + twin.name + '». Измените описание — одинаковые тексты поисковики считают дублями.');
          if (isNew) { w.slug = AD.slugify(w.slug || (w.brand + ' ' + w.name)); if (!w.slug) return bad('Не удалось построить адрес страницы — впишите его латиницей.'); if (prods.some(x => x.slug === w.slug)) return bad('Товар с адресом «' + w.slug + '» уже есть. Измените адрес или название.'); }
          const out = Object.assign({}, orig || {}, w), nul = v => (String(v || '').trim() ? String(v).trim() : null);
          out.name = w.name.trim(); out.desc = w.desc.trim(); out.volume = nul(w.volume); out.sku = nul(w.sku); out.usage = nul(w.usage); out.indications = (w.indications || []).length ? w.indications : null; out.actives = w.actives || []; out.tasks = w.tasks || [];
          if (!out.isNew) delete out.isNew; if (!out.featured) delete out.featured; if (!out.image) delete out.image;
          if (isNew) { const pre = (prods.find(x => x.brand === out.brand && /^[a-z]+-/.test(x.id)) || {id: ''}).id.split('-')[0] || out.brand.slice(0, 3); out.id = uniq(pre + '-' + (AD.slugify(out.name) || 'tovar'), 'id'); out.docs = out.docs || []; out.details = out.details || null; }
          let next; if (isNew) { next = prods.slice(); const last = prods.reduce((m, x, k) => x.brand === out.brand ? k : m, -1); next.splice(last < 0 ? next.length : last + 1, 0, out); } else next = prods.map(x => x.id === orig.id ? out : x);
          const r = await run(() => commit(next, isNew ? 'Товар «' + out.name + '» добавлен' : 'Товар «' + out.name + '» сохранён'), saveBtn, err);
          if (r) { if (orig && orig.image && orig.image !== out.image) tidy(orig.image); if (out.brand !== brandId) { brandId = out.brand; AD.go('#/brandprods/' + encodeURIComponent(brandId)); } openM && openM.close(true); }
        }
        (nameF.input).focus();
      }

      root.append(AD.pageHead('Товары по брендам', 'Выберите бренд: добавляйте и убирайте товары, меняйте описания и ставьте фото. Каждое действие сразу сохраняется и обновляет сайт.'), msg, tabs, head, grid);
      paintAll();
      const openByHash = id => { const p = prods.find(x => x.id === id); if (p) { if (p.brand !== brandId) { brandId = p.brand; paintAll(); } editDialog(p); } };
      inst.onRoute = p => { if (p[0] && p[0] !== brandId && brands.some(b => b.id === p[0])) { brandId = p[0]; q = ''; paintAll(); } if (p[1]) openByHash(p[1]); };
      inst.destroy = () => { if (openM) { openM.close(true); } };
      if (parts[1]) openByHash(parts[1]);
      return inst;
    }
  };
})();
