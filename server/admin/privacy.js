/* Разделы «Персональные данные» (реестр обработки, обращения субъектов: найти, выгрузить, удалить) и «Копии» (резервные копии данных сервера). */
(function () {
  'use strict';
  const {h} = AD;
  const RISK = {ok: ['✓', 'var(--ok,#2f8f5b)'], warn: ['!', '#b8741a'], info: ['i', 'var(--blue,#2f5bd6)']};
  const TYPE = type => (AD.config.types || {})[type] || type;
  const dl = (url) => { const a = h('a', {href: url, download: ''}); document.body.append(a); a.click(); a.remove(); };

  AD.views.privacy = {
    async mount(root) {
      const box = h('div', {});
      root.append(AD.pageHead('Персональные данные', 'Что сайт собирает, куда это уходит, как отвечать на обращения посетителей (152-ФЗ). Реестр собирается из реальных настроек, а не вручную.'), box);
      async function load() {
        const r = await AD.get('/api/privacy/registry');
        const op = h('div', {class: 'card'}, h('h2', {}, 'Оператор данных'), r.operator.ready ? AD.alertBox('ok', h('b', {}, r.operator.name), ', ИНН ' + r.operator.inn + ', ОГРН ' + r.operator.ogrn + ', ' + r.operator.address + (r.docsVersion ? ' · редакция документов от ' + r.docsVersion : '')) : AD.alertBox('err', 'Реквизиты не заполнены — политика конфиденциальности и согласие не опубликованы (на сайте стоят заглушки). ', h('a', {href: '#/content/site'}, 'Заполнить реквизиты →')),
          h('div', {class: 'row', style: {marginTop: '10px', flexWrap: 'wrap'}}, h('a', {class: 'btn sm', href: '#/content/legal'}, 'Настройки документов'), h('a', {class: 'btn sm', href: '/privacy.html', target: '_blank', rel: 'noopener'}, 'Политика на сайте'), h('a', {class: 'btn sm', href: '/consent.html', target: '_blank', rel: 'noopener'}, 'Согласие на сайте')));
        const gaps = r.gaps.length ? h('div', {class: 'card'}, h('h2', {}, 'На что обратить внимание'), h('ul', {class: 'hl'}, r.gaps.map(g => h('li', {}, h('span', {class: 'lvl warn'}), h('span', {}, g))))) : h('div', {class: 'card'}, AD.alertBox('ok', 'Расхождений между подключёнными сервисами и документами не найдено.'));
        const purposes = h('div', {class: 'card'}, h('h2', {}, 'Цели обработки'), h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Цель', 'Данные', 'Основание', 'Где хранится'].map(t => h('th', {}, t)))), h('tbody', {}, r.purposes.map(p => h('tr', {}, h('td', {dataset: {l: 'Цель'}}, h('b', {}, p.name)), h('td', {dataset: {l: 'Данные'}}, p.data), h('td', {dataset: {l: 'Основание'}}, p.basis), h('td', {dataset: {l: 'Хранится'}}, p.storage)))))));
        const systems = h('div', {class: 'card'}, h('h2', {}, 'Куда уходят данные'), h('p', {class: 'muted small'}, 'Сервисы, которые получают данные посетителей или заявок. «Включено» определяется по вашим настройкам. Всё включённое должно быть перечислено среди получателей данных в документах.'),
          h('div', {class: 'tbl-wrap', style: {marginTop: '8px'}}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Сервис', 'Статус', 'Какие данные', 'Где находится', 'Примечание'].map(t => h('th', {}, t)))), h('tbody', {}, r.systems.map(s => { const [sym, col] = RISK[s.risk] || RISK.ok; return h('tr', {style: s.on ? {} : {opacity: '.55'}}, h('td', {dataset: {l: 'Сервис'}}, h('b', {}, s.name)), h('td', {dataset: {l: 'Статус'}}, s.on ? 'включено' : 'выключено'), h('td', {dataset: {l: 'Данные'}}, s.data), h('td', {dataset: {l: 'Где'}}, s.where || '—'), h('td', {class: 'muted', dataset: {l: 'Примечание'}}, s.on && s.note ? [h('b', {style: {color: col, marginRight: '6px'}}, sym), s.note] : '')); })))));
        const inv = r.stored.inventory, stored = h('div', {class: 'card'}, h('h2', {}, 'Что хранится в заявках'), h('p', {}, r.stored.fields.join(', ') + '.'),
          h('p', {class: 'muted small', style: {marginTop: '6px'}}, 'Записей: ' + inv.total + ' (с телефоном — ' + inv.withPhone + ', с e-mail — ' + inv.withEmail + ')' + (inv.oldest ? ', самая старая — от ' + AD.fmt(inv.oldest) : '') + '. Срок хранения закрытых заявок: ' + (r.stored.retentionDays ? r.stored.retentionDays + ' дн.' : 'не задан') + ' ', h('a', {href: '#/settings'}, 'изменить →')));
        AD.fill(box, op, gaps, purposes, systems, stored, requestsCard());
      }
      /* --- обращения субъектов --- */
      function requestsCard() {
        const q = h('input', {type: 'search', placeholder: 'Телефон, e-mail или имя из обращения', 'aria-label': 'Поиск данных субъекта', style: {flex: '1 1 260px'}}), out = h('div', {}), go = h('button', {class: 'btn primary', type: 'button'}, 'Найти');
        let items = [];
        const sel = new Set();
        function paint() {
          if (!items.length) { out.replaceChildren(AD.alertBox('info', 'Ничего не найдено. Проверьте написание: телефон ищется по цифрам, e-mail — точно, имя — по части.')); return; }
          const exp = h('button', {class: 'btn', type: 'button'}, 'Выгрузить данные (JSON)'), del = h('button', {class: 'btn danger', type: 'button'}, 'Удалить выбранные');
          exp.addEventListener('click', () => dl('/api/privacy/export?q=' + encodeURIComponent(q.value.trim())));
          del.addEventListener('click', async () => { if (!sel.size) { AD.toast('Отметьте записи для удаления', 'err'); return; } if (!await AD.confirm('Удалить безвозвратно заявок: ' + sel.size + '? Это исполнение требования субъекта об уничтожении данных. Сначала выгрузите данные, если они понадобятся для ответа.', {ok: 'Удалить безвозвратно'})) return; await AD.busy(del, async () => { try { const r = await AD.post('/api/privacy/erase', {ids: [...sel], reason: 'требование субъекта'}); AD.toast('Удалено заявок: ' + r.removed, 'ok'); sel.clear(); go.click(); } catch (e) { AD.toast(e.message, 'err'); } }); });
          const all = h('input', {type: 'checkbox', 'aria-label': 'Выбрать все', onchange: () => { items.forEach(i => all.checked ? sel.add(i.id) : sel.delete(i.id)); out.querySelectorAll('tbody input').forEach(c => { c.checked = all.checked; }); }});
          out.replaceChildren(h('p', {class: 'muted small'}, 'Найдено записей: ' + items.length + '. Согласие у каждой записи сохранено с датой и номером редакции документов.'),
            h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, [h('th', {}, all), ...['Заявка', 'Дата', 'Контакты', 'Тип', 'Согласие', 'Статус'].map(t => h('th', {}, t))])), h('tbody', {}, items.map(i => h('tr', {}, h('td', {}, h('input', {type: 'checkbox', 'aria-label': 'Выбрать ' + i.id, onchange: e => { e.target.checked ? sel.add(i.id) : sel.delete(i.id); }})), h('td', {dataset: {l: 'Заявка'}}, h('a', {href: '#/leads/' + i.id}, h('b', {}, i.id)), h('div', {class: 'muted small'}, i.name)), h('td', {dataset: {l: 'Дата'}}, AD.fmt(i.created_at)), h('td', {dataset: {l: 'Контакты'}}, [i.phone, i.email].filter(Boolean).join(' · ')), h('td', {dataset: {l: 'Тип'}}, TYPE(i.type)), h('td', {dataset: {l: 'Согласие'}}, i.consent_at ? AD.fmt(i.consent_at) + (i.consent_version ? ' · ред. ' + i.consent_version : '') : '—'), h('td', {dataset: {l: 'Статус'}}, (AD.config.statuses || {})[i.status] || i.status)))))),
            h('div', {class: 'row', style: {marginTop: '10px'}}, exp, del));
        }
        go.addEventListener('click', () => AD.busy(go, async () => { sel.clear(); try { items = (await AD.get('/api/privacy/search?q=' + encodeURIComponent(q.value.trim()))).items; paint(); } catch (e) { out.replaceChildren(AD.errBox(e)); } }));
        q.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
        return h('div', {class: 'card'}, h('h2', {}, 'Обращение посетителя'), h('p', {class: 'muted small'}, 'Посетитель вправе узнать, какие данные о нём хранятся, потребовать исправить, заблокировать или уничтожить их, отозвать согласие (ст. 14, 21 152-ФЗ). Найдите его записи, выгрузите для ответа и/или удалите. Само удаление записывается в журнал без персональных данных.'),
          h('div', {class: 'row', style: {marginTop: '10px'}}, q, go), out);
      }
      await load(); return {};
    }
  };

  /* ---------- резервные копии ---------- */
  AD.views.backups = {
    async mount(root) {
      const box = h('div', {}), mk = h('button', {class: 'btn primary', type: 'button'}, 'Создать копию сейчас');
      root.append(AD.pageHead('Копии', 'Резервные копии заявок, пользователей, настроек, журнала и содержимого сайта.', mk), box);
      async function load() {
        const d = await AD.get('/api/backups');
        const auto = h('input', {type: 'checkbox', checked: d.auto}), keep = h('input', {type: 'number', min: '3', max: '90', value: String(d.keep), style: {width: '90px'}, 'aria-label': 'Сколько автокопий хранить'}), save = h('button', {class: 'btn sm', type: 'button'}, 'Сохранить');
        save.addEventListener('click', () => AD.busy(save, async () => { try { await AD.put('/api/backups/settings', {auto: auto.checked, keep: +keep.value}); AD.toast('Сохранено', 'ok'); load(); } catch (e) { AD.toast(e.message, 'err'); } }));
        const rows = d.items.map(b => h('tr', {}, h('td', {dataset: {l: 'Дата'}}, h('b', {}, AD.fmt(b.at))), h('td', {dataset: {l: 'Кто'}}, b.who), h('td', {dataset: {l: 'Вид'}}, ({auto: 'автоматическая', manual: 'вручную', 'before-restore': 'перед восстановлением'})[b.kind] || b.kind), h('td', {dataset: {l: 'Объём'}}, AD.size(b.bytes) + (b.encrypted ? ' · шифр.' : '')),
          h('td', {class: 'nowrap'}, h('button', {class: 'btn sm', type: 'button', onclick: () => dl('/api/backups/' + encodeURIComponent(b.id) + '/download')}, 'Скачать'), ' ',
            h('button', {class: 'btn sm', type: 'button', onclick: async e => { if (!await AD.confirm('Заменить все заявки на состояние копии от ' + AD.fmt(b.at) + '? Перед этим автоматически создаётся копия текущего состояния. Заявки, поступившие позже, пропадут из списка (они останутся в предыдущей копии).', {ok: 'Восстановить заявки', danger: false})) return; await AD.busy(e.currentTarget, async () => { try { const r = await AD.post('/api/backups/' + encodeURIComponent(b.id) + '/restore-leads'); AD.toast('Заявок восстановлено: ' + r.restored, 'ok'); load(); } catch (x) { AD.toast(x.message, 'err'); } }); }}, 'Восстановить заявки'), ' ',
            h('button', {class: 'btn sm danger', type: 'button', onclick: async e => { if (!await AD.confirm('Удалить эту копию?', {ok: 'Удалить'})) return; await AD.busy(e.currentTarget, async () => { try { await AD.del('/api/backups/' + encodeURIComponent(b.id)); load(); } catch (x) { AD.toast(x.message, 'err'); } }); }}, 'Удалить'))));
        AD.fill(box, AD.alertBox('warn', h('b', {}, 'Копия на том же сервере не спасёт, если пропадёт сам сервер.'), ' Регулярно скачивайте копии и храните их в другом месте. В скачиваемый файл не попадают пароли пользователей, секреты двухфакторного входа и ключи из настроек — зато там заявки с персональными данными, храните файл как конфиденциальный.'),
          h('div', {class: 'card'}, h('h2', {}, 'Автоматические копии'), h('div', {class: 'row', style: {gap: '18px', flexWrap: 'wrap', alignItems: 'center'}}, h('label', {class: 'chk'}, auto, 'Раз в сутки'), h('label', {}, 'Хранить последних ', keep, ' шт.'), save), d.encrypted ? h('p', {class: 'help', style: {marginTop: '8px'}}, 'Файлы копий на диске шифруются ключом DATA_KEY.') : h('p', {class: 'help', style: {marginTop: '8px'}}, 'Файлы копий лежат в папке данных сервера (доступ только владельцу). Чтобы шифровать их, задайте DATA_KEY.')),
          h('div', {class: 'card'}, h('h2', {}, 'Копии (' + d.items.length + ')'), d.items.length ? h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Дата', 'Кто', 'Вид', 'Объём', ''].map(t => h('th', {}, t)))), h('tbody', {}, rows))) : h('div', {class: 'empty'}, h('b', {}, 'Копий пока нет'), 'Нажмите «Создать копию сейчас».')));
      }
      mk.addEventListener('click', () => AD.busy(mk, async () => { try { await AD.post('/api/backups'); AD.toast('Копия создана', 'ok'); load(); } catch (e) { AD.toast(e.message, 'err'); } }));
      await load(); return {};
    }
  };
})();
