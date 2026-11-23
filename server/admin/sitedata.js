/* Разделы «Контакты и реквизиты» (data/site.json: контакты, офисы, скидки, реквизиты) и «Меню» (data/menu.json: пункты меню в шапке сайта).
   Правка сохраняется целиком; сервер проверяет формат (e-mail, телефон, ИНН/КПП/ОГРН, страницы меню) и пересобирает сайт. */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const fld = (label, ctl, help, id) => h('div', {class: 'field'}, h('label', {for: id}, label), ctl, help ? h('div', {class: 'help'}, help) : null);
  let uid = 0; const nid = () => 'sd' + (++uid);
  const rub = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

  function shell(root, o) {                       // общий каркас: панель сохранения, сообщение об ошибке, подтверждение ухода
    const msg = h('div', {}), state = h('span', {class: 'muted small'}), saveBtn = h('button', {class: 'btn primary', type: 'button', disabled: true}, 'Сохранить');
    let orig = null; const dirty = () => { const d = JSON.stringify(o.work()) !== orig; saveBtn.disabled = !d; AD.dirty = d; AD.fill(state, d ? [h('span', {class: 'dot'}), 'Есть несохранённые изменения'] : ''); bar.classList.toggle('dirty', d); };
    const bar = h('div', {class: 'savebar'}, saveBtn, state, h('span', {class: 'right row'}, h('button', {class: 'btn ghost', type: 'button', onclick: async () => { if (!AD.dirty || await AD.confirm('Отменить все несохранённые изменения?', {ok: 'Отменить изменения'})) { AD.dirty = false; o.reload(); } }}, 'Сбросить'), h('button', {class: 'btn', type: 'button', onclick: () => AD.historyDialog(o.coll, () => o.reload())}, 'История')));
    saveBtn.addEventListener('click', () => AD.busy(saveBtn, async () => {
      msg.replaceChildren();
      try { const r = await o.save(); AD.toast(r.build ? 'Сохранено, сайт пересобран (' + (r.build.ms / 1000).toFixed(1) + ' с)' : r.unchanged ? 'Изменений нет' : 'Сохранено', 'ok'); AD.dirty = false; o.reload(); }
      catch (e) { msg.replaceChildren(e.status === 409 ? AD.alertBox('err', e.message, ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => { AD.dirty = false; o.reload(); }}, 'Загрузить актуальную версию')) : AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); }
    }));
    AD.saveHook = () => { if (!saveBtn.disabled) saveBtn.click(); };
    AD.fill(root, AD.pageHead(o.title, o.sub, ...(o.actions || [])), bar, msg, o.body);
    orig = JSON.stringify(o.work()); return {dirty, markClean: () => { orig = JSON.stringify(o.work()); dirty(); }};
  }
  const card = (n, title, ...kids) => h('details', {class: 'ed-card top', open: true}, h('summary', {}, h('span', {class: 'ed-n'}, String(n).padStart(2, '0')), h('span', {class: 't'}, title)), h('div', {class: 'in ed-obj'}, ...kids));

  /* ---------- Контакты и реквизиты ---------- */
  AD.views.contacts = {
    async mount(root, parts) {
      const inst = {initial: true}; let cur, w; const sec = parts[0] || '';
      const reload = async () => { cur = await AD.get('/api/collections/site'); w = {contacts: clone(cur.data.contacts), offices: clone(cur.data.offices), discounts: clone(cur.data.discounts), requisites: clone(cur.data.requisites)}; paint(); };
      let sh;
      const bind = (obj, k, o) => { o = o || {}; const id = nid(), el = h(o.area ? 'textarea' : 'input', Object.assign({id}, o.area ? {rows: '2'} : {type: o.type || 'text'}, o.ph ? {placeholder: o.ph} : {})); const v = obj[k]; if (o.area) el.textContent = v == null ? '' : v; else el.value = v == null ? '' : v; el.addEventListener('input', () => { const t = el.value; obj[k] = o.num ? (t === '' ? null : +t) : (o.nullable && t.trim() === '' ? null : t); if (o.onInput) o.onInput(t); sh.dirty(); }); return fld(o.label, el, o.help, id); };
      function paint() {
        const c = w.contacts, ext = c.ext = c.ext || {};
        const phoneRaw = bind(c, 'phoneRaw', {label: 'Телефон для ссылки (tel:)', help: 'Только цифры и «+», например +74959255162. Нажмите кнопку, чтобы взять из поля «Телефон».'});
        const fillRaw = h('button', {class: 'btn sm', type: 'button', onclick: () => { c.phoneRaw = '+' + String(c.phone || '').replace(/[^\d]/g, '').replace(/^8/, '7'); phoneRaw.querySelector('input').value = c.phoneRaw; sh.dirty(); }}, 'Взять из телефона');
        const contacts = card(1, 'Основные контакты', h('div', {class: 'grid2'}, bind(c, 'email', {label: 'Электронная почта', type: 'email'}), bind(c, 'hours', {label: 'Часы работы', help: 'Показываются в шапке страницы «Контакты» и в подвале.'})),
          h('div', {class: 'grid2'}, bind(c, 'phone', {label: 'Телефон (как показывать)', help: 'Например: +7 (495) 925-51-62'}), h('div', {}, phoneRaw, h('div', {style: {marginTop: '6px'}}, fillRaw))),
          h('div', {class: 'grid2'}, bind(c, 'address', {label: 'Адрес центрального офиса'}), bind(c, 'addressNote', {label: 'Пояснение к адресу', help: 'Например: м. Полежаевская, Динамо'})),
          bind(ext, 'youtube', {label: 'Канал на YouTube (ссылка)', nullable: true, ph: 'https://www.youtube.com/…'}), h('p', {class: 'help'}, 'MAX, Telegram и ВКонтакте — в разделе «Интеграции».'));
        /* офисы */
        const offBox = h('div', {class: 'ed-list'});
        const paintOffices = () => AD.fill(offBox, w.offices.map((o, i) => { const ph = h('div', {class: 'ed-list'});
          const paintPh = () => AD.fill(ph, (o.phones || []).map((p, j) => h('div', {class: 'ed-item'}, h('div', {class: 'v grid2'}, h('input', {type: 'text', value: p[0], placeholder: '+7 (000) 000-00-00', 'aria-label': 'Телефон', oninput: e => { p[0] = e.target.value; sh.dirty(); }}), h('input', {type: 'text', value: p[1], placeholder: 'Подпись (Тел., Отдел продаж)', 'aria-label': 'Подпись телефона', oninput: e => { p[1] = e.target.value; sh.dirty(); }})), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Убрать телефон', onclick: () => { o.phones.splice(j, 1); paintPh(); sh.dirty(); }}, '✕'))), h('button', {class: 'btn sm', type: 'button', onclick: () => { (o.phones = o.phones || []).push(['', 'Тел.']); paintPh(); sh.dirty(); }}, '＋ Телефон'));
          paintPh(); const em = h('textarea', {rows: '2', 'aria-label': 'Электронные адреса', oninput: e => { o.emails = e.target.value.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean); sh.dirty(); }}); em.textContent = (o.emails || []).join('\n');
          return h('div', {class: 'ed-item'}, h('div', {class: 'v ed-obj'}, h('div', {class: 'grid2'}, bind(o, 'city', {label: 'Город'}), bind(o, 'role', {label: 'Роль (Центральный офис, Представительство)'})), bind(o, 'addr', {label: 'Адрес'}), bind(o, 'hours', {label: 'Часы работы офиса', nullable: true, help: 'Пусто — берутся общие часы.'}), fld('Телефоны', ph), fld('Электронная почта (по одному в строке)', em)),
            h('div', {class: 'col'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => { [w.offices[i - 1], w.offices[i]] = [w.offices[i], w.offices[i - 1]]; paintOffices(); sh.dirty(); }}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Ниже', disabled: i === w.offices.length - 1, onclick: () => { [w.offices[i + 1], w.offices[i]] = [w.offices[i], w.offices[i + 1]]; paintOffices(); sh.dirty(); }}, '↓'), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Удалить офис', disabled: w.offices.length < 2, onclick: () => { w.offices.splice(i, 1); paintOffices(); sh.dirty(); }}, '✕'))); }), h('button', {class: 'btn sm', type: 'button', onclick: () => { w.offices.push({city: '', role: 'Представительство', addr: '', hours: null, phones: [], emails: []}); paintOffices(); sh.dirty(); }}, '＋ Добавить офис'));
        paintOffices();
        /* скидки */
        const dBox = h('div', {class: 'ed-list'}), dSum = h('div', {class: 'help'});
        const paintDisc = () => { AD.fill(dBox, w.discounts.map((d, i) => h('div', {class: 'ed-item'}, h('div', {class: 'v grid2'}, fld('Закупка от, ₽', h('input', {type: 'number', min: '0', value: d.from == null ? '' : d.from, 'aria-label': 'Сумма закупки от', oninput: e => { d.from = e.target.value === '' ? null : +e.target.value; sum(); sh.dirty(); }})), fld('Скидка, %', h('input', {type: 'number', min: '0', max: '100', value: d.pct == null ? '' : d.pct, 'aria-label': 'Скидка в процентах', oninput: e => { d.pct = e.target.value === '' ? null : +e.target.value; sum(); sh.dirty(); }}))), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Убрать ступень', onclick: () => { w.discounts.splice(i, 1); paintDisc(); sh.dirty(); }}, '✕'))), h('button', {class: 'btn sm', type: 'button', onclick: () => { w.discounts.push({from: null, pct: null}); paintDisc(); sh.dirty(); }}, '＋ Добавить ступень'), dSum); sum(); };
        const sum = () => { dSum.textContent = 'На сайте: ' + w.discounts.filter(d => d.from != null && d.pct != null).slice().sort((a, b) => a.from - b.from).map(d => d.pct + '% от ' + rub(d.from)).join(', '); };
        paintDisc();
        const rq = w.requisites;
        const reqs = card(4, 'Реквизиты', bind(rq, 'legalName', {label: 'Наименование'}), h('div', {class: 'grid3'}, bind(rq, 'inn', {label: 'ИНН', nullable: true, help: '10 цифр (организация) или 12 (ИП).'}), bind(rq, 'kpp', {label: 'КПП', nullable: true, help: '9 цифр.'}), bind(rq, 'ogrn', {label: 'ОГРН', nullable: true, help: '13 цифр (ОГРНИП — 15).'})), bind(rq, 'legalAddress', {label: 'Юридический адрес', nullable: true}), bind(rq, 'note', {label: 'Примечание под реквизитами', area: true}), h('p', {class: 'help'}, 'Пустые ИНН, КПП, ОГРН и адрес на сайте показываются как «Уточняется».'));
        const body = h('div', {class: 'ed'}, contacts, card(2, 'Офисы и представительства', h('p', {class: 'help'}, 'Список для страницы «Контакты» и карты. Для карты города должны быть из списка: Москва, Санкт-Петербург, Симферополь, Ростов-на-Дону; остальные покажутся в списке без метки.'), offBox), card(3, 'Скидки за объём закупки', h('p', {class: 'help'}, 'Ступени скидки видны на страницах «Партнёрам», «Контакты» и в газете. Порядок значения не имеет — сайт сам сортирует по сумме.'), dBox), reqs);
        sh = shell(root, {title: 'Контакты и реквизиты', sub: 'Телефон, адрес, офисы, скидки и реквизиты компании. Тексты заголовков и подписей страницы «Контакты» — в разделе «Тексты страниц».', coll: 'site', work: () => w, reload, body, actions: [h('a', {class: 'btn', href: '#/preview/contacts.html'}, 'Предпросмотр'), h('a', {class: 'btn', href: '#/texts/contacts'}, 'Тексты страницы')],
          save: async () => { const next = clone(cur.data); next.contacts = Object.assign({}, next.contacts, w.contacts); if (next.contacts.ext && !next.contacts.ext.youtube) delete next.contacts.ext.youtube; if (next.contacts.ext && !Object.keys(next.contacts.ext).length) delete next.contacts.ext; next.offices = w.offices.map(o => Object.assign({}, o, {phones: (o.phones || []).filter(p => String(p[0]).trim()), emails: (o.emails || []).filter(Boolean)})); next.discounts = w.discounts.filter(d => d.from != null && d.pct != null).sort((a, b) => a.from - b.from); next.requisites = w.requisites; return AD.put('/api/collections/site', {data: next, version: cur.version}); }});
        if (sec) { const t = { offices: 2, discounts: 3 }[sec]; if (t) { const d = root.querySelectorAll('details.ed-card')[t - 1]; if (d) setTimeout(() => d.scrollIntoView({block: 'start', behavior: 'smooth'}), 80); } }
      }
      await reload();
      inst.destroy = () => { AD.dirty = false; AD.saveHook = null; };
      return inst;
    }
  };

  /* ---------- Меню ---------- */
  AD.views.menu = {
    async mount(root) {
      const inst = {initial: true}; let cur, nav, pages = [];
      try { pages = AD._sitePages || (AD._sitePages = (await AD.get('/api/site-pages')).pages); } catch (e) { pages = []; }
      const choices = pages.filter(p => !/^(brands|products|training|news)\//.test(p.path) && !/^(404|consent|privacy|terms|search|start)\.html$/.test(p.path) && p.path !== 'index.html');
      const reload = async () => { cur = await AD.get('/api/collections/menu'); nav = clone(cur.data.nav); build(); };
      let sh; const list = h('div', {class: 'ed-list'});
      const keyOf = href => '/' + String(href).replace(/\.html$/, '').replace(/^pages\//, 'p/');
      function paint() {
        AD.fill(list, nav.map((it, i) => { const sel = h('select', {'aria-label': 'Страница', onchange: () => { it.href = sel.value; it.key = keyOf(sel.value); sh.dirty(); }}, !choices.some(p => p.path === it.href) ? h('option', {value: it.href}, it.href) : null, choices.map(p => h('option', {value: p.path, selected: p.path === it.href}, p.title + ' — ' + p.path)));
          return h('div', {class: 'ed-item'}, h('div', {class: 'v grid2'}, fld('Подпись в меню (до 24 символов)', h('input', {type: 'text', value: it.title, maxlength: '24', oninput: e => { it.title = e.target.value; sh.dirty(); }})), fld('Страница', sel)),
            h('div', {class: 'col'}, h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, onclick: () => { [nav[i - 1], nav[i]] = [nav[i], nav[i - 1]]; paint(); sh.dirty(); }}, '↑'), h('button', {class: 'btn sm icon', type: 'button', 'aria-label': 'Ниже', disabled: i === nav.length - 1, onclick: () => { [nav[i + 1], nav[i]] = [nav[i], nav[i + 1]]; paint(); sh.dirty(); }}, '↓'), h('button', {class: 'btn sm icon danger', type: 'button', 'aria-label': 'Убрать пункт', disabled: nav.length <= 2, onclick: () => { nav.splice(i, 1); paint(); sh.dirty(); }}, '✕'))); }),
          h('button', {class: 'btn sm', type: 'button', disabled: nav.length >= 9, onclick: () => { const p = choices.find(x => !nav.some(n => n.href === x.path)) || choices[0]; nav.push({title: p ? p.title.slice(0, 24) : '', href: p ? p.path : 'catalog.html', key: keyOf(p ? p.path : 'catalog.html')}); paint(); sh.dirty(); }}, '＋ Добавить пункт'));
      }
      function build() { paint(); sh = shell(root, {title: 'Меню сайта', sub: 'Пункты меню в шапке сайта (от 2 до 9). Свои страницы из раздела «Свои страницы» попадают в меню сами, если у них включён пункт меню. Ссылки подвала и кнопки — в «Тексты страниц» → «Шапка, подвал и общие элементы».', coll: 'menu', work: () => nav, reload, body: h('div', {class: 'card'}, list),
        save: async () => { const next = clone(cur.data); next.nav = nav.map(i => ({title: i.title.trim(), href: i.href, key: i.key || keyOf(i.href)})); return AD.put('/api/collections/menu', {data: next, version: cur.version}); }}); }
      await reload();
      inst.destroy = () => { AD.dirty = false; AD.saveHook = null; };
      return inst;
    }
  };
})();
