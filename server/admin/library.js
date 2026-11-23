/* Раздел «Картинки»: медиа-библиотека. Загрузка (перетаскиванием, сразу несколько файлов) со сжатием в WebP, папки, поиск, подписи (alt), переименование,
   отметка «где используется» и удаление только неиспользуемых. Фоны, сцены и рендеры сайта показаны только для просмотра — это структура сайта, их не заменить и не удалить. */
(function () {
  'use strict';
  const {h} = AD;
  const IMG = /\.(png|jpe?g|webp|gif)$/i;
  const thumb = p => 'url("/' + encodeURI(p) + '")';

  AD.views.files = {
    async mount(root, parts) {
      const inst = {initial: true};
      let ov, alt, altVer, tab = 'lib'; const S = {q: '', dir: '', unused: false, sort: 'new'};
      const msg = h('div', {}), body = h('div', {});
      const load = async () => { const [o, a] = await Promise.all([AD.get('/api/files/overview'), AD.get('/api/collections/media')]); ov = o; alt = a.data.alt || {}; altVer = a; AD.media.invalidate(); };
      await load();
      const used = f => (ov.usage[f.path] || []);
      const run = async (fn, into) => { (into || msg).replaceChildren(); try { return await fn(); } catch (e) { (into || msg).replaceChildren(e.status === 409 && e.data && e.data.usedIn ? AD.alertBox('err', e.message) : AD.errBox(e)); return null; } };

      /* ---------- загрузка ---------- */
      const upState = h('div', {class: 'up-state'});
      let upDir = 'assets/uploads'; const dirSel = h('select', {id: 'up-dir', 'aria-label': 'Папка для загрузки', onchange: () => { upDir = dirSel.value; }}), webp = h('input', {type: 'checkbox', id: 'up-webp', checked: true}), maxSel = h('select', {id: 'up-max', 'aria-label': 'Максимальный размер'}, [[1200, 'до 1200 px'], [1600, 'до 1600 px'], [2400, 'до 2400 px']].map(([v, t]) => h('option', {value: v, selected: v === 1600}, t)));
      const fileIn = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true});
      const drop = h('div', {class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Загрузить картинки'}, h('b', {}, 'Перетащите картинки сюда или нажмите, чтобы выбрать'), h('div', {class: 'small'}, 'Можно сразу несколько. PNG, JPG, WebP, GIF — до 25 МБ каждая; после сжатия не больше 6 МБ.'));
      async function upload(files) {
        const list = Array.from(files); if (!list.length) return; upState.replaceChildren();
        for (const f of list) {
          const row = h('div', {class: 'small muted'}, '«' + f.name + '»: сжимаю и загружаю…'); upState.append(row);
          try { const c = webp.checked ? {} : {quality: 0.95}; const r = await AD.media.upload(dirSel.value, f, Object.assign({max: +maxSel.value}, c)); row.replaceChildren(h('span', {class: 'pill done'}, 'готово'), ' «' + f.name + '» → ' + r.path.split('/').pop() + ' · ' + AD.size(r.size) + (r.before ? ' (было ' + AD.size(r.before) + ')' : '')); }
          catch (e) { row.replaceChildren(h('span', {class: 'pill err'}, 'ошибка'), ' «' + f.name + '»: ' + e.message); }
        }
        await load(); paint();
      }
      drop.addEventListener('click', () => fileIn.click()); drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
      fileIn.addEventListener('change', () => { upload(fileIn.files); fileIn.value = ''; });
      ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); })); ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) upload(e.dataTransfer.files); });
      async function newFolder() {
        const inp = h('input', {type: 'text', id: 'nf-name', placeholder: 'например: news или events'}), m = AD.modal({title: 'Новая папка для загрузок', body: [h('p', {class: 'muted'}, 'Папка создаётся внутри assets/uploads. Название — латиница, цифры, дефис (кириллица заменится транслитом).'), h('div', {class: 'field'}, h('label', {for: 'nf-name'}, 'Название папки'), inp)], footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), h('button', {class: 'btn primary', type: 'button', onclick: async e => { await AD.busy(e.currentTarget, async () => { try { const r = await AD.post('/api/files/folder', {name: inp.value}); m.close(true); await load(); upDir = r.dir; paint(); AD.toast('Папка создана: ' + r.dir, 'ok'); } catch (x) { AD.toast(x.message, 'err'); } }); }}, 'Создать')]});
      }

      /* ---------- карточка файла ---------- */
      function detail(f, readonly) {
        const u = readonly ? [] : used(f), code = u.filter(x => x.kind === 'code'), box = h('div', {}), err = h('div', {});
        const meta = h('dl', {class: 'kv'}, h('dt', {}, 'Путь'), h('dd', {}, h('span', {class: 'mono'}, f.path), ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => AD.copy(f.path, 'Путь скопирован')}, 'Копировать')), h('dt', {}, 'Размер'), h('dd', {}, AD.size(f.size) + (f.w ? ' · ' + f.w + '×' + f.h + ' px' : '')), !readonly && f.mtime ? [h('dt', {}, 'Загружен'), h('dd', {}, AD.fmt(f.mtime))] : null);
        const usedBox = readonly ? h('div', {class: 'alert info'}, 'Это часть оформления сайта (фон, сцена или рендер). Её нельзя заменить или удалить из админки — иначе изменится структура и вид сайта.') : u.length ? h('div', {}, h('div', {class: 'sect'}, h('h3', {}, 'Где используется (' + u.length + ')')), h('ul', {class: 'hl'}, u.slice(0, 12).map(x => h('li', {}, h('span', {class: 'lvl ' + (x.kind === 'code' ? 'warn' : 'info')}), h('span', {}, x.label)))), u.length > 12 ? h('div', {class: 'small muted'}, 'и ещё ' + (u.length - 12)) : null) : h('div', {class: 'alert ok'}, 'Нигде не используется — файл можно удалить.');
        const altI = h('input', {type: 'text', id: 'alt-i', maxlength: '160', value: alt[f.path] || '', placeholder: 'Что изображено (для незрячих и поиска)'}), altBtn = h('button', {class: 'btn sm', type: 'button', onclick: e => run(async () => { const next = Object.assign({}, altVer.data, {alt: Object.assign({}, alt)}); if (altI.value.trim()) next.alt[f.path] = altI.value.trim(); else delete next.alt[f.path]; const r = await AD.busy(e.currentTarget, () => AD.put('/api/collections/media', {data: next, version: altVer.version})); await load(); AD.toast('Подпись сохранена', 'ok'); }, err)}, 'Сохранить подпись');
        const nm = h('input', {type: 'text', id: 'rn-i', value: f.name.replace(/\.[^.]+$/, '')}), rnBtn = h('button', {class: 'btn sm', type: 'button', disabled: !!code.length, title: code.length ? 'На файл ссылается шаблон сайта' : '', onclick: e => run(async () => { const r = await AD.busy(e.currentTarget, () => AD.post('/api/files/rename', {path: f.path, name: nm.value})); m.close(true); await load(); paint(); AD.toast('Переименовано' + (r.changed && r.changed.length ? ', ссылки обновлены, сайт пересобран' : ''), 'ok'); }, err)}, 'Переименовать');
        const delBtn = h('button', {class: 'btn danger', type: 'button', disabled: u.length > 0, title: u.length ? 'Файл используется — сначала замените его там, где он стоит' : '', onclick: async e => { if (!await AD.confirm('Удалить «' + f.name + '» навсегда?', {ok: 'Удалить'})) return; run(async () => { await AD.busy(e.currentTarget, () => AD.del('/api/files?path=' + encodeURIComponent(f.path))); m.close(true); await load(); paint(); AD.toast('Файл удалён', 'ok'); }, err); }}, 'Удалить');
        AD.fill(box, err, h('div', {class: 'lib-big', style: {backgroundImage: thumb(f.path)}, role: 'img', 'aria-label': f.name}), meta, usedBox, readonly ? null : [h('div', {class: 'field', style: {marginTop: '14px'}}, h('label', {for: 'alt-i'}, 'Подпись (alt)'), h('div', {class: 'row'}, altI, altBtn), h('div', {class: 'help'}, 'Подставляется при выборе этой картинки в карточке товара и новости.')), h('div', {class: 'field', style: {marginTop: '12px'}}, h('label', {for: 'rn-i'}, 'Имя файла'), h('div', {class: 'row'}, nm, rnBtn), h('div', {class: 'help'}, 'Ссылки в данных сайта обновятся сами.'))]);
        const m = AD.modal({title: f.name, cls: 'wide', body: box, footer: [readonly ? null : delBtn, h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Закрыть')]});
      }

      /* ---------- библиотека ---------- */
      function libTab() {
        const grid = h('div', {class: 'files lib-grid'}), count = h('span', {class: 'muted small'});
        const search = h('input', {type: 'search', class: 'grow', placeholder: 'Найти по имени…', 'aria-label': 'Поиск по картинкам', value: S.q, oninput: () => { S.q = search.value; paintGrid(); }});
        const dsel = h('select', {'aria-label': 'Папка', onchange: () => { S.dir = dsel.value; paintGrid(); }}, h('option', {value: ''}, 'Все папки'), ov.dirs.map(d => h('option', {value: d.dir, selected: S.dir === d.dir}, d.title + ' (' + d.files.length + ')')));
        const ssel = h('select', {'aria-label': 'Порядок', onchange: () => { S.sort = ssel.value; paintGrid(); }}, [['new', 'Сначала новые'], ['name', 'По имени'], ['size', 'Сначала крупные']].map(([v, t]) => h('option', {value: v, selected: S.sort === v}, t)));
        const un = h('label', {class: 'chk'}, h('input', {type: 'checkbox', checked: S.unused, onchange: e => { S.unused = e.target.checked; paintGrid(); }}), 'Только неиспользуемые');
        function paintGrid() {
          const q = S.q.trim().toLowerCase(), all = [];
          ov.dirs.forEach(d => { if (S.dir && d.dir !== S.dir) return; d.files.forEach(f => { if (IMG.test(f.name) && (!q || f.name.toLowerCase().includes(q) || (alt[f.path] || '').toLowerCase().includes(q)) && (!S.unused || !used(f).length)) all.push(f); }); });
          all.sort(S.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : S.sort === 'size' ? (a, b) => b.size - a.size : (a, b) => String(b.mtime).localeCompare(String(a.mtime)));
          count.textContent = all.length + ' ' + AD.plural(all.length, 'картинка', 'картинки', 'картинок');
          AD.fill(grid, all.length ? all.slice(0, 160).map(f => { const u = used(f);
            return h('div', {class: 'file'}, h('button', {class: 'pick-btn', type: 'button', title: f.path, onclick: () => detail(f)}, h('div', {class: 'th', style: {backgroundImage: thumb(f.path)}}), h('div', {class: 'nm'}, f.name), h('div', {class: 'muted'}, AD.size(f.size) + (f.w ? ' · ' + f.w + '×' + f.h : '')), u.length ? h('span', {class: 'pill done'}, 'используется ×' + u.length) : h('span', {class: 'pill archived'}, 'не используется'))); }) : h('div', {class: 'empty', style: {gridColumn: '1/-1'}}, h('b', {}, 'Картинок не найдено'), 'Измените поиск или загрузите новые выше.'));
          if (all.length > 160) grid.append(h('div', {class: 'muted small', style: {gridColumn: '1/-1'}}, 'Показаны первые 160 — уточните поиск или папку.'));
        }
        AD.fill(body, h('div', {class: 'card'}, h('div', {class: 'up-opts row'}, h('label', {for: 'up-dir', class: 'lbl'}, 'Загружать в'), dirSel, maxSel, h('label', {class: 'chk', for: 'up-webp'}, webp, 'Сжимать в WebP'), h('button', {class: 'btn sm right', type: 'button', onclick: newFolder}, '＋ Новая папка')), drop, fileIn, upState), h('div', {class: 'toolbar'}, search, dsel, ssel, un, count), grid); paintGrid();
      }
      function paint() {
        AD.fill(dirSel, ov.dirs.map(d => h('option', {value: d.dir, selected: d.dir === upDir}, d.title + ' (' + d.dir + ')')));
        AD.fill(root, AD.pageHead('Картинки', 'Фото товаров и преподавателей, логотипы брендов и прочие загрузки. Картинка сжимается в WebP прямо в браузере, к ней можно добавить подпись; удалить можно только то, что нигде не используется.'), msg, body);
        libTab();
      }
      paint();
      return inst;
    }
  };
})();
