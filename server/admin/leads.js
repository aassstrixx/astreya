/* Раздел «Заявки»: список с фильтрами, карточка заявки (статус, комментарии, история), выгрузка в CSV, автообновление. */
(function () {
  'use strict';
  const {h, $, $$} = AD;
  const TABS = [['active', 'Активные'], ['new', 'Новые'], ['in_work', 'В работе'], ['done', 'Обработанные'], ['spam', 'Спам'], ['archived', 'Архив'], ['all', 'Все']];
  const statusName = s => (AD.config.statuses || {})[s] || s, typeName = t => (AD.config.types || {})[t] || t;
  const pill = s => h('span', {class: 'pill ' + s}, statusName(s));
  const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
  const ACTION = {created: 'Заявка поступила', status: 'Статус', note: 'Комментарий'};
  const state = AD.leadsState = AD.leadsState || {tab: 'active', type: '', q: '', from: '', to: '', page: 1};

  function query(extra) {
    const p = new URLSearchParams(); p.set('status', state.tab); if (state.type) p.set('type', state.type); if (state.q) p.set('q', state.q); if (state.from) p.set('from', state.from); if (state.to) p.set('to', state.to);
    Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v)); return p.toString();
  }

  AD.views.leads = {
    async mount(root) {
      const isAdmin = AD.user.role === 'admin';
      const statsEl = h('div', {class: 'stats'}), tabsEl = h('div', {class: 'tabs', role: 'tablist'}), listEl = h('div', {}), pagerEl = h('div', {class: 'pager'});
      const q = h('input', {type: 'search', class: 'grow', placeholder: 'Поиск: имя, телефон, e-mail, город, текст…', 'aria-label': 'Поиск по заявкам', value: state.q});
      const typeSel = h('select', {'aria-label': 'Тип заявки'}, h('option', {value: ''}, 'Все типы'), Object.entries(AD.config.types || {}).filter(([k]) => k !== 'contact').map(([k, v]) => h('option', {value: k, selected: state.type === k}, v)));
      const from = h('input', {type: 'date', 'aria-label': 'Дата с', value: state.from}), to = h('input', {type: 'date', 'aria-label': 'Дата по', value: state.to});
      const csv = h('a', {class: 'btn', href: '#', download: '', onclick: e => { e.currentTarget.href = '/api/leads.csv?' + query(); }}, 'Скачать CSV');
      const refreshBtn = h('button', {class: 'btn', type: 'button', onclick: () => load(false)}, 'Обновить');
      root.append(AD.pageHead('Заявки', 'Обращения с форм сайта: партнёрство, запись на мероприятия, запросы по товарам, вопросы.', refreshBtn, csv), statsEl, tabsEl,
        h('div', {class: 'toolbar'}, q, typeSel, from, to, h('button', {class: 'btn ghost sm', type: 'button', onclick: () => { Object.assign(state, {q: '', type: '', from: '', to: '', page: 1}); q.value = ''; typeSel.value = ''; from.value = ''; to.value = ''; load(false); }}, 'Сбросить')), listEl, pagerEl);

      let drawer = null, timer = null, lastNew = null, destroyed = false, seq = 0;
      const stat = (n, t, hot) => h('div', {class: 'stat' + (hot ? ' hot' : '')}, h('div', {class: 'n'}, n), h('div', {class: 't'}, t));
      function paintTabs(s) {
        const by = s.byStatus || {}, cnt = {active: s.total - (by.spam || 0) - (by.archived || 0), all: s.total}; Object.keys(by).forEach(k => { cnt[k] = by[k]; });
        tabsEl.replaceChildren(...TABS.map(([id, t]) => h('button', {class: 'tab' + (state.tab === id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': state.tab === id, onclick: () => { state.tab = id; state.page = 1; load(false); }}, t, h('span', {class: 'c'}, cnt[id] || 0))));
      }
      function paintList(d) {
        if (!d.items.length) { listEl.replaceChildren(h('div', {class: 'tbl-wrap'}, h('div', {class: 'empty'}, h('b', {}, state.q || state.type || state.from || state.to ? 'Ничего не найдено' : 'Заявок пока нет'), state.q || state.type || state.from || state.to ? 'Измените или сбросьте фильтры.' : 'Когда посетитель отправит форму на сайте, заявка появится здесь.'))); pagerEl.replaceChildren(); return; }
        const rows = d.items.map(l => {
          const tr = h('tr', {class: 'click' + (l.status === 'new' ? ' is-new' : ''), tabindex: '0', dataset: {id: l.id}, onclick: () => AD.go('#/leads/' + l.id), onkeydown: e => { if (e.key === 'Enter') AD.go('#/leads/' + l.id); }},
            h('td', {class: 'nowrap', dataset: {l: 'Дата'}}, h('div', {}, AD.fmt(l.created_at)), h('div', {class: 'sub'}, l.id)),
            h('td', {dataset: {l: 'Статус'}}, pill(l.status), (l.flags || []).length ? h('span', {class: 'flag', title: l.flags.join('; ')}, '⚠') : null),
            h('td', {dataset: {l: 'Заявка'}}, h('b', {}, l.name || '—'), h('div', {class: 'sub'}, typeName(l.type) + (l.context ? ' · ' + l.context : '')), l.org || l.city ? h('div', {class: 'sub'}, [l.org, l.city].filter(Boolean).join(', ')) : null),
            h('td', {dataset: {l: 'Контакты'}}, l.phone ? h('div', {class: 'ph'}, l.phone) : null, l.email ? h('div', {class: 'sub'}, l.email) : null),
            h('td', {dataset: {l: 'Сообщение'}}, h('div', {class: 'msg'}, l.msg || '—'), l.notes ? h('div', {class: 'sub'}, '💬 ' + l.notes) : null, l.duplicates ? h('div', {class: 'sub'}, '↻ повторов: ' + l.duplicates) : null));
          return tr;
        });
        listEl.replaceChildren(h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Дата', 'Статус', 'Заявка', 'Контакты', 'Сообщение'].map(t => h('th', {}, t)))), h('tbody', {}, rows))));
        const pages = Math.max(1, Math.ceil(d.total / d.limit));
        AD.fill(pagerEl, pages > 1 ? [h('button', {class: 'btn sm', type: 'button', disabled: d.page <= 1, onclick: () => { state.page--; load(false); }}, '← Назад'), h('span', {class: 'muted small'}, `Страница ${d.page} из ${pages} · ${d.total}`), h('button', {class: 'btn sm', type: 'button', disabled: d.page >= pages, onclick: () => { state.page++; load(false); }}, 'Дальше →')] : [h('span', {class: 'muted small'}, `Найдено: ${d.total}`)]);
      }
      async function load(silent) {
        const my = ++seq;
        try {
          const [d, s] = await Promise.all([AD.get('/api/leads?' + query({page: state.page, limit: 50})), AD.get('/api/leads/stats')]);
          if (destroyed || my !== seq) return;
          statsEl.replaceChildren(stat(s.new, 'Новых', s.new > 0), stat(s.today, 'За сутки'), stat(s.week, 'За 7 дней'), stat(s.total, 'Всего'));
          paintTabs(s); paintList(d); AD.setBadge(s.new);
          if (silent && lastNew !== null && s.new > lastNew) AD.toast('Новая заявка: ' + (s.new - lastNew) + ' ' + AD.plural(s.new - lastNew, 'шт.', 'шт.', 'шт.'), 'ok');
          lastNew = s.new;
        } catch (e) { if (!destroyed && !silent) listEl.replaceChildren(AD.errBox(e)); }
      }
      let qt = null;
      q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { state.q = q.value.trim(); state.page = 1; load(false); }, 300); });
      typeSel.addEventListener('change', () => { state.type = typeSel.value; state.page = 1; load(false); });
      from.addEventListener('change', () => { state.from = from.value; state.page = 1; load(false); }); to.addEventListener('change', () => { state.to = to.value; state.page = 1; load(false); });
      await load(false);
      timer = setInterval(() => { if (!document.hidden && !drawer) load(true); }, 30000);

      /* ---- карточка заявки ---- */
      function field(label, val) { return val ? [h('dt', {}, label), h('dd', {}, val)] : []; }
      function paintDetail(l, dlgBody, head) {
        head.textContent = `${l.id} · ${typeName(l.type)}`;
        const note = h('textarea', {id: 'lead-note', rows: '3', placeholder: 'Например: позвонили, договорились на четверг…', maxlength: '2000'});
        const addBtn = h('button', {class: 'btn primary', type: 'button'}, 'Добавить комментарий');
        const setStatus = async (st, btn) => { await AD.busy(btn, async () => { try { const x = await AD.patch('/api/leads/' + l.id, {status: st}); AD.toast('Статус: ' + statusName(st), 'ok'); paintDetail(x, dlgBody, head); load(true); AD.pollNew(); } catch (e) { AD.toast(e.message, 'err'); } }); };
        const addNote = async () => { if (!note.value.trim()) { note.focus(); return; } await AD.busy(addBtn, async () => { try { const x = await AD.patch('/api/leads/' + l.id, {comment: note.value}); paintDetail(x, dlgBody, head); load(true); } catch (e) { AD.toast(e.message, 'err'); } }); };
        addBtn.addEventListener('click', addNote); note.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote(); });
        const page = AD.safeUrl(l.page);
        AD.fill(dlgBody,
          h('div', {class: 'row'}, pill(l.status), h('span', {class: 'muted small'}, 'Поступила ' + AD.fmt(l.created_at) + (l.duplicates ? ' · повторно отправлена ' + l.duplicates + ' ' + AD.plural(l.duplicates, 'раз', 'раза', 'раз') : ''))),
          (l.spam_reasons || []).length ? h('div', {style: {marginTop: '12px'}}, AD.alertBox('err', 'Отмечена как спам: ' + l.spam_reasons.join('; ') + '.')) : null,
          (l.flags || []).length ? h('div', {style: {marginTop: '12px'}}, AD.alertBox('warn', '⚠ Подозрительная: ' + l.flags.join('; ') + '. Проверьте, прежде чем перезванивать.')) : null,
          h('dl', {class: 'kv', style: {marginTop: '16px'}},
            field('Имя', l.name), field('Телефон', l.phone ? h('span', {class: 'row gap-s'}, h('a', {href: telHref(l.phone)}, l.phone), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.copy(l.phone, 'Телефон скопирован')}, 'Копировать')) : ''),
            field('E-mail', l.email ? h('span', {class: 'row gap-s'}, h('a', {href: 'mailto:' + l.email}, l.email), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.copy(l.email, 'Адрес скопирован')}, 'Копировать')) : ''),
            field('Город', l.city), field('Организация', l.org), field('Специализация', l.spec), field('Тема', l.context), field('Страница', page ? h('a', {href: page, target: '_blank', rel: 'noopener noreferrer'}, page.replace(/^https?:\/\//, '')) : '')),
          l.msg ? h('div', {class: 'sect'}, h('h3', {}, 'Сообщение'), h('div', {class: 'msg-box'}, l.msg)) : null,
          h('div', {class: 'sect'}, h('h3', {}, 'Статус'), h('div', {class: 'row gap-s'}, Object.entries(AD.config.statuses).map(([k, v]) => { const b = h('button', {class: 'btn sm' + (l.status === k ? ' primary' : ''), type: 'button', 'aria-pressed': l.status === k, onclick: () => { if (l.status !== k) setStatus(k, b); }}, v); return b; }))),
          h('div', {class: 'sect'}, h('h3', {}, 'Комментарии'), (l.notes || []).length ? h('ul', {class: 'notes'}, l.notes.map(n => h('li', {}, h('span', {class: 'who'}, n.who), h('span', {class: 't'}, AD.fmt(n.t)), h('div', {style: {whiteSpace: 'pre-wrap'}}, n.text)))) : h('p', {class: 'muted small'}, 'Пока нет.'), h('div', {class: 'field', style: {marginTop: '10px'}}, note, h('div', {}, addBtn, h('span', {class: 'muted small', style: {marginLeft: '10px'}}, 'Ctrl+Enter'))), ),
          h('div', {class: 'sect'}, h('h3', {}, 'История'), h('ul', {class: 'hist'}, (l.history || []).slice().reverse().map(x => h('li', {}, h('span', {class: 'who'}, x.who), h('span', {class: 't'}, AD.fmt(x.t)), h('div', {class: 'muted'}, (ACTION[x.action] || x.action) + (x.detail ? ': ' + x.detail : ''))))))
        );
      }
      async function openDetail(id) {
        if (drawer && drawer.id === id) return;
        if (drawer) { const old = drawer; drawer = null; old.m.close(true); }
        let l; try { l = await AD.get('/api/leads/' + encodeURIComponent(id)); } catch (e) { AD.toast(e.message, 'err'); AD.go('#/leads'); return; }
        if (destroyed) return;
        const head = h('span', {}), body = h('div', {}), footer = [];
        const m = AD.modal({title: '', side: true, body, footer: isAdmin ? [h('button', {class: 'btn danger sm', type: 'button', onclick: async () => { if (await AD.confirm('Удалить заявку ' + l.id + ' навсегда? Вместо этого можно перенести её в архив.', {ok: 'Удалить навсегда'})) { try { await AD.del('/api/leads/' + l.id); AD.toast('Заявка удалена'); m.close(true); drawer = null; AD.go('#/leads'); load(true); AD.pollNew(); } catch (e) { AD.toast(e.message, 'err'); } } }}, 'Удалить навсегда')] : null,
          onClose: () => { if (drawer && drawer.m === m) { drawer = null; if (/^#\/leads\//.test(location.hash)) AD.go('#/leads'); } }});
        $('h2', m.dlg).replaceChildren(head);
        drawer = {id, m}; paintDetail(l, body, head);
        if (l.status === 'new') { /* просмотр не меняет статус: менеджер сам решает, когда взять в работу */ }
      }
      return {
        onRoute(parts) { if (parts[0]) openDetail(parts[0]); else if (drawer) { const m = drawer.m; drawer = null; m.close(true); } },
        destroy() { destroyed = true; clearInterval(timer); clearTimeout(qt); if (drawer) { drawer.m.close(true); drawer = null; } }
      };
    }
  };
})();
