/* Раздел «Мероприятия и обучение»: расписание семинаров (дата, город, формат, время, бренд, преподаватель, места, описание), преподаватели с фото и «био»,
   вопросы и ответы, шаги записи, видео и статьи, города. Расписание — data/events.json; остальное — data/training.json и data/redesign.json (преподаватели на странице «Обучение»). */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const fld = (label, ctl, help, id) => h('div', {class: 'field'}, h('label', {for: id}, label), ctl, help ? h('div', {class: 'help'}, help) : null);
  let uid = 0; const nid = () => 'ev' + (++uid);
  const dfmt = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : d || ''; };

  AD.views.events = {
    async mount(root, parts) {
      const inst = {initial: true};
      let events, eVer, tr, tVer, rd, rVer, brands, tab = 'events', openM = null;
      const load = async () => { const [e, t, r, b] = await Promise.all([AD.get('/api/collections/events'), AD.get('/api/collections/training'), AD.get('/api/collections/redesign'), AD.get('/api/collections/brands')]); events = e.data; eVer = e.version; tr = t.data; tVer = t.version; rd = r.data; rVer = r.version; brands = b.data; };
      await load();
      const msg = h('div', {}), body = h('div', {});
      const bName = id => (brands.find(b => b.id === id) || {}).name || '';
      async function run(fn, into, btn) { (into || msg).replaceChildren(); try { return await AD.busy(btn, fn); } catch (e) { (into || msg).replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: async () => { await load(); render(); msg.replaceChildren(); }}, 'Загрузить актуальные данные')) : AD.errBox(e)); if (!into) window.scrollTo({top: 0, behavior: 'smooth'}); return null; } }
      const put = async (name, data, version, okMsg) => { const r = await AD.put('/api/collections/' + name, {data, version}); await load(); render(); AD.toast((okMsg || 'Сохранено') + (r.build ? ', сайт пересобран' : ''), 'ok'); return r; };

      /* ---------- универсальный редактор строк ---------- */
      function rows(o) {
        const work = clone(o.get()), orig = JSON.stringify(work), list = h('div', {class: 'ed-list'}), err = h('div', {}), state = h('span', {class: 'muted small'});
        const saveBtn = h('button', {class: 'btn primary', type: 'button', disabled: true}, 'Сохранить');
        const dirty = () => { const d = JSON.stringify(work) !== orig; saveBtn.disabled = !d; AD.dirty = d; AD.fill(state, d ? [h('span', {class: 'dot'}), 'Не сохранено'] : ''); };
        function control(it, f, i) {
          const get = () => (o.prim ? work[i] : it[f.k]), set = v => { if (o.prim) work[i] = v; else it[f.k] = v; dirty(); };
          if (f.type === 'select') { const s = h('select', {'aria-label': f.label}, f.opts().map(([v, t]) => h('option', {value: v, selected: v === (get() || '')}, t))); s.addEventListener('change', () => set(s.value || null)); return s; }
          if (f.type === 'image') { const box = h('div', {class: 'row gap-s'}), paint = () => AD.fill(box, h('div', {class: 'bp-pv', style: {width: '56px', height: '60px'}}, get() ? h('img', {src: '/' + get(), alt: ''}) : h('span', {class: 'muted small'}, 'нет')), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.media.pick({dir: f.dir, title: f.label, current: get(), max: 700, name: it.id || 'photo', onPick: p => { set(p || null); paint(); }})}, 'Фото…')); paint(); return box; }
          const el = h(f.type === 'area' ? 'textarea' : 'input', Object.assign({'aria-label': f.label, placeholder: f.label}, f.type === 'area' ? {rows: String(f.rows || 3)} : {type: f.type === 'num' ? 'number' : f.type === 'date' ? 'date' : 'text', min: f.type === 'num' ? '0' : null}));
          const v = get(); if (f.type === 'area') el.textContent = v == null ? '' : v; else el.value = v == null ? '' : v;
          el.addEventListener('input', () => set(f.type === 'num' ? (el.value === '' ? null : +el.value) : f.list ? el.value.split(',').map(x => x.trim()).filter(Boolean) : el.value)); if (f.list && Array.isArray(v)) el.value = v.join(', ');
          return el;
        }
        function paint() {
          AD.fill(list, work.map((it, i) => h('div', {class: 'ed-item'}, h('div', {class: 'v ed-obj'}, h('div', {class: o.cols || 'grid2'}, o.fields.map(f => fld(f.label, control(it, f, i), f.help)))), h('div', {class: 'col'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => { [work[i - 1], work[i]] = [work[i], work[i - 1]]; paint(); dirty(); }}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Ниже', disabled: i === work.length - 1, onclick: () => { [work[i + 1], work[i]] = [work[i], work[i + 1]]; paint(); dirty(); }}, '↓'), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить', onclick: () => { if (o.canDelete && !o.canDelete(it)) return; work.splice(i, 1); paint(); dirty(); }}, '✕')))), h('button', {class: 'btn sm', type: 'button', onclick: () => { work.push(o.blank()); paint(); dirty(); }}, '＋ ' + (o.add || 'Добавить')));
        }
        saveBtn.addEventListener('click', () => run(async () => { await o.save(work.filter(x => !o.empty || !o.empty(x))); AD.dirty = false; }, err, saveBtn));
        AD.saveHook = () => { if (!saveBtn.disabled) saveBtn.click(); };
        paint(); AD.fill(body, h('div', {class: 'card'}, o.help ? h('p', {class: 'muted', style: {marginBottom: '12px'}}, o.help) : null, err, list, h('div', {class: 'row', style: {marginTop: '14px'}}, saveBtn, state)));
      }

      /* ---------- расписание ---------- */
      function eventsTab() {
        const tbody = h('tbody', {}), q = {s: '', up: ''}, count = h('span', {class: 'muted small'});
        const search = h('input', {type: 'search', class: 'grow', placeholder: 'Поиск по названию, городу, бренду…', 'aria-label': 'Поиск', oninput: () => { q.s = search.value; paint(); }});
        const st = h('select', {'aria-label': 'Показать', onchange: () => { q.up = st.value; paint(); }}, [['', 'Все мероприятия'], ['up', 'Предстоящие'], ['past', 'Прошедшие']].map(([v, t]) => h('option', {value: v}, t)));
        function paint() {
          const today = new Date().toISOString().slice(0, 10), s = q.s.trim().toLowerCase();
          const list = events.slice().sort((a, b) => a.date.localeCompare(b.date)).filter(e => (!q.up || (q.up === 'up' ? e.date >= today : e.date < today)) && (!s || [e.title, e.city, bName(e.brand), e.speaker].join(' ').toLowerCase().includes(s)));
          tbody.replaceChildren(...list.map(e => h('tr', {class: 'click', tabindex: '0', onclick: () => AD.go('#/events/' + encodeURIComponent(e.id)), onkeydown: ev => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) AD.go('#/events/' + encodeURIComponent(e.id)); }},
            h('td', {class: 'nowrap', dataset: {l: 'Дата'}}, dfmt(e.date), h('div', {class: 'sub'}, e.time || '')), h('td', {dataset: {l: 'Название'}}, h('b', {}, e.title), h('div', {class: 'sub'}, bName(e.brand))), h('td', {dataset: {l: 'Город'}}, e.city, h('div', {class: 'sub'}, e.fmt)),
            h('td', {dataset: {l: 'Места'}}, e.seats == null ? '—' : String(e.seats), e.demo ? [' ', h('span', {class: 'flag'}, 'демо')] : null), h('td', {class: 'nowrap', onclick: ev => ev.stopPropagation()}, h('button', {class: 'btn sm', type: 'button', onclick: () => { const c = clone(e); c.id = ''; c.slug = ''; c.title += ' (копия)'; openEditor(c, true); }}, 'Копия'), ' ', h('button', {class: 'btn sm danger', type: 'button', onclick: async () => { if (!await AD.confirm('Удалить мероприятие «' + e.title + '»? Страница исчезнет с сайта. Вернуть можно через «История».', {ok: 'Удалить'})) return; run(() => put('events', events.filter(x => x.id !== e.id), eVer, 'Мероприятие удалено')); }}, 'Удалить')))));
          count.textContent = list.length + ' из ' + events.length;
        }
        AD.fill(body, h('div', {class: 'toolbar'}, search, st, count), h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Дата', 'Мероприятие', 'Город · формат', 'Места', ''].map(t => h('th', {}, t)))), tbody)));
        paint();
      }
      function openEditor(item, isNew) {
        if (openM) return openM;
        const w = clone(item), orig = JSON.stringify(w), err = h('div', {}), cities = tr.cities.filter(c => c !== 'Онлайн');
        if (isNew && !item.title) Object.assign(w, {id: '', slug: '', date: new Date().toISOString().slice(0, 10), city: cities[0], fmt: 'Очно', time: '10:30–18:00', brand: (brands[0] || {}).id, title: '', teacher: (tr.teachers[0] || {}).id, speaker: '', place: '', description: '', seats: null, demo: false});
        const ids = {}; ['title', 'slug', 'date', 'time', 'city', 'fmt', 'brand', 'teacher', 'speaker', 'place', 'seats', 'desc'].forEach(k => { ids[k] = nid(); });
        let slugTouched = !isNew;
        const inp = (k, o) => { const el = h(o && o.area ? 'textarea' : 'input', Object.assign({id: ids[k]}, o && o.area ? {rows: '4'} : {type: o && o.type || 'text'})); const v = w[k]; if (o && o.area) el.textContent = v == null ? '' : v; else el.value = v == null ? '' : v; el.addEventListener('input', () => { w[k] = o && o.num ? (el.value === '' ? null : +el.value) : el.value; sync(k); }); return el; };
        const sel = (k, opts, none) => { const s = h('select', {id: ids[k]}, none ? h('option', {value: ''}, none) : null, opts.map(([v, t]) => h('option', {value: v, selected: v === w[k]}, t))); s.addEventListener('change', () => { w[k] = s.value || null; sync(k); }); return s; };
        const slugI = inp('slug'), titleI = inp('title'), dateI = inp('date', {type: 'date'}), note = h('div', {class: 'help'});
        function sync(k) {
          if ((k === 'date' || k === 'city' || k === 'brand' || k === 'title') && !slugTouched) { const part = AD.slugify((w.city || '') + ' ' + (w.brand || '')); w.slug = [w.date, part].filter(Boolean).join('-'); slugI.value = w.slug; }
          if (k === 'slug') slugTouched = true;
          const dupe = events.some(e => e.slug === w.slug && e.id !== item.id); note.textContent = dupe ? 'Такой адрес уже занят — измените.' : w.slug ? 'Страница: /training/' + w.slug + '.html' : ''; note.style.color = dupe ? 'var(--err)' : ''; slugI.classList.toggle('bad', dupe);
        }
        const form = h('div', {class: 'ed-obj'}, fld('Название мероприятия', titleI, null, ids.title), h('div', {class: 'grid3'}, fld('Дата', dateI, null, ids.date), fld('Время', inp('time'), 'Например: 10:30–18:00', ids.time), fld('Места', inp('seats', {type: 'number', num: true}), 'Пусто — «уточняйте при регистрации».', ids.seats)),
          h('div', {class: 'grid3'}, fld('Город', sel('city', tr.cities.map(c => [c, c])), 'Список городов — вкладка «Города».', ids.city), fld('Формат', sel('fmt', [['Очно', 'Очно'], ['Вебинар', 'Вебинар']]), null, ids.fmt), fld('Бренд', sel('brand', brands.map(b => [b.id, b.name]), '— без бренда —'), null, ids.brand)),
          h('div', {class: 'grid2'}, fld('Преподаватель', sel('teacher', tr.teachers.map(t => [t.id, t.name]), '— не указан —'), null, ids.teacher), fld('Спикер (как подписать)', inp('speaker'), 'Например: Савиных С. В.', ids.speaker)),
          fld('Место проведения (адрес или «онлайн»)', inp('place'), null, ids.place), fld('Описание', inp('description', {area: true}), 'Что будет на мероприятии: темы, формат, для кого.', ids.desc), fld('Адрес страницы (slug)', slugI, null, ids.slug), note,
          h('label', {class: 'chk'}, Object.assign(h('input', {type: 'checkbox', checked: !!w.demo}), {onchange: e => { w.demo = e.target.checked; }}), 'Демонстрационная запись (с пометкой «демо»)'));
        const saveBtn = h('button', {class: 'btn primary', type: 'button'}, isNew ? 'Добавить мероприятие' : 'Сохранить');
        const m = openM = AD.modal({title: isNew ? 'Новое мероприятие' : 'Мероприятие: ' + item.title, cls: 'wide', sticky: true, body: [err, form], beforeClose: () => JSON.stringify(w) === orig || confirm('Закрыть без сохранения? Изменения будут потеряны.'),
          onClose: () => { openM = null; if (/^#\/events\//.test(location.hash)) AD.go('#/events'); }, footer: [!isNew ? h('a', {class: 'btn ghost', href: '/training/' + item.slug + '.html', target: '_blank', rel: 'noopener', style: {marginRight: 'auto'}}, 'Открыть на сайте') : null, h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), saveBtn]});
        saveBtn.addEventListener('click', () => run(async () => {
          if (!String(w.title || '').trim()) throw new Error('Укажите название мероприятия.'); if (!w.date) throw new Error('Укажите дату.');
          if (!w.slug) w.slug = [w.date, AD.slugify((w.city || '') + ' ' + (w.brand || ''))].filter(Boolean).join('-'); if (!w.id) { let n = events.length + 1; while (events.some(x => x.id === 's' + n)) n++; w.id = 's' + n; }
          ['brand', 'teacher'].forEach(k => { if (!w[k]) delete w[k]; }); if (!w.demo) w.demo = false;
          const next = events.slice(), pos = isNew ? -1 : next.findIndex(x => x.id === item.id); if (pos >= 0) next[pos] = w; else next.push(w);
          await put('events', next, eVer, isNew ? 'Мероприятие добавлено' : 'Мероприятие сохранено'); m.close(true);
        }, err, saveBtn));
        sync('init'); return m;
      }

      /* ---------- остальные вкладки ---------- */
      const trSave = (key, okMsg) => async val => { const next = clone(tr); next[key] = val; await put('training', next, tVer, okMsg); };
      const TABS = [['events', 'Расписание'], ['teachers', 'Преподаватели'], ['faq', 'Вопросы и ответы'], ['steps', 'Шаги записи'], ['videos', 'Видео'], ['articles', 'Статьи'], ['cities', 'Города']];
      function tabBody() {
        if (tab === 'events') return eventsTab();
        if (tab === 'teachers') return rows({help: 'Преподаватели на странице «Обучение»: фото, должность и краткое био (под должностью). Нет фото — показывается монограмма. Фото сжимается в WebP.', get: () => rd.teachers.items, cols: 'grid2', add: 'Добавить преподавателя', blank: () => ({id: 'teacher-' + Date.now().toString(36), first: '', last: '', role: '', bio: '', photo: null}), canDelete: it => { if (events.some(e => e.teacher === it.id)) { AD.toast('Преподаватель назначен на мероприятия — сначала замените его там.', 'err'); return false; } return true; }, fields: [{k: 'first', label: 'Имя и отчество'}, {k: 'last', label: 'Фамилия'}, {k: 'role', label: 'Должность', type: 'area', rows: 2}, {k: 'bio', label: 'Краткое био', type: 'area', rows: 3}, {k: 'photo', label: 'Фото', type: 'image', dir: 'assets/teachers'}], save: async v => { const next = clone(rd); next.teachers.items = v; await put('redesign', next, rVer, 'Преподаватели сохранены'); }});
        if (tab === 'faq') return rows({help: 'Частые вопросы на странице «Обучение».', get: () => tr.faq, cols: 'grid1', add: 'Добавить вопрос', blank: () => ({q: '', a: ''}), empty: x => !x.q.trim() && !x.a.trim(), fields: [{k: 'q', label: 'Вопрос'}, {k: 'a', label: 'Ответ', type: 'area', rows: 3}], save: trSave('faq', 'Вопросы сохранены')});
        if (tab === 'steps') return rows({help: 'Шаги записи на семинар («Четыре шага до семинара»).', get: () => tr.steps, add: 'Добавить шаг', blank: () => ({t: '', p: ''}), empty: x => !x.t.trim(), fields: [{k: 't', label: 'Заголовок шага'}, {k: 'p', label: 'Пояснение', type: 'area', rows: 2}], save: trSave('steps', 'Шаги сохранены')});
        if (tab === 'videos') return rows({help: 'Видео-подборка на странице «Обучение».', get: () => tr.videos, cols: 'grid3', add: 'Добавить видео', blank: () => ({title: '', dur: '', brand: ''}), empty: x => !x.title.trim(), fields: [{k: 'title', label: 'Название'}, {k: 'dur', label: 'Длительность (42:10)'}, {k: 'brand', label: 'Бренд', type: 'select', opts: () => [['', '— без бренда —']].concat(brands.map(b => [b.id, b.name]))}], save: trSave('videos', 'Видео сохранены')});
        if (tab === 'articles') return rows({help: 'Статьи в блоке «Материалы для специалистов».', get: () => tr.articles, cols: 'grid2', add: 'Добавить статью', blank: () => ({tag: '', title: '', min: 5, date: new Date().toISOString().slice(0, 10), brand: ''}), empty: x => !x.title.trim(), fields: [{k: 'title', label: 'Заголовок'}, {k: 'tag', label: 'Тема (метка)'}, {k: 'min', label: 'Минут на чтение', type: 'num'}, {k: 'date', label: 'Дата', type: 'date'}, {k: 'brand', label: 'Бренд', type: 'select', opts: () => [['', '— без бренда —']].concat(brands.map(b => [b.id, b.name]))}], save: trSave('articles', 'Статьи сохранены')});
        return rows({help: 'Города для фильтра расписания. «Онлайн» оставьте для вебинаров. Город с мероприятиями удалить нельзя.', get: () => tr.cities, prim: true, cols: 'grid1', add: 'Добавить город', blank: () => '', empty: x => !String(x).trim(), canDelete: c => { if (events.some(e => e.city === c)) { AD.toast('В городе «' + c + '» есть мероприятия — сначала перенесите их.', 'err'); return false; } return true; }, fields: [{k: '.', label: 'Город'}], save: trSave('cities', 'Города сохранены')});
      }
      function render() {
        AD.dirty = false; AD.saveHook = null;
        const tabs = h('div', {class: 'dtabs', role: 'tablist'}, TABS.map(([id, t]) => h('button', {type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { if (AD.dirty && !confirm('Есть несохранённые изменения. Перейти без сохранения?')) return; tab = id; render(); }}, t)));
        AD.fill(root, AD.pageHead('Мероприятия и обучение', 'Расписание семинаров и вебинаров, преподаватели, вопросы и ответы, шаги записи, видео и статьи страницы «Обучение».', h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog(tab === 'events' ? 'events' : tab === 'teachers' ? 'redesign' : 'training', async () => { await load(); render(); })}, 'История'), h('button', {class: 'btn primary', type: 'button', id: 'add-item', onclick: () => AD.go('#/events/__new')}, '＋ Добавить мероприятие')), msg, tabs, body);
        tabBody();
      }
      render();
      inst.onRoute = p => {
        const id = p[0];
        if (id === undefined) { if (openM) { const m = openM; openM = null; m.close(true); } return; }
        tab = 'events'; if (!root.querySelector('.tbl')) render();
        if (id === '__new') { if (!openM) openEditor({}, true); return; }
        const it = events.find(x => x.id === id); if (it) openEditor(it, false); else { AD.toast('Мероприятие «' + id + '» не найдено', 'err'); AD.go('#/events'); }
      };
      inst.destroy = () => { if (openM) { const m = openM; openM = null; m.close(true); } AD.dirty = false; AD.saveHook = null; };
      if (parts.length) inst.onRoute(parts);
      return inst;
    }
  };
})();
