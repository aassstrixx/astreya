/* Раздел «Запуск»: чек-лист готовности к публичному запуску в РФ — что уже сделано, что мешает, что подтвердить вручную. Всё проверяется на сервере по реальным данным. */
(function () {
  'use strict';
  const {h} = AD;
  const MARK = {ok: ['✓', 'var(--ok,#2f8f5b)', 'Готово'], fail: ['✗', 'var(--err,#b03024)', 'Нужно исправить'], warn: ['!', '#b8741a', 'Рекомендуется'], manual: ['○', '#b8741a', 'Нужно подтвердить'], info: ['i', 'var(--blue,#2f5bd6)', 'К сведению']};

  AD.views.launch = {
    async mount(root) {
      const box = h('div', {}), reload = h('button', {class: 'btn', type: 'button'}, 'Проверить заново');
      root.append(AD.pageHead('Запуск', 'Что нужно, чтобы сайт и админка законно и безопасно работали в России. Пункты с пометкой «обязательно» должны быть зелёными до публичного запуска.', reload), box);
      async function load() {
        const r = await AD.get('/api/launch'), groups = [...new Set(r.items.map(i => i.group))];
        const pct = Math.round(r.ok / r.total * 100);
        const head = h('div', {class: 'card'}, r.ready ? AD.alertBox('ok', h('b', {}, 'Обязательные пункты выполнены.'), ' Можно запускать' + (r.warnings ? '; ещё ' + r.warnings + ' ' + AD.plural(r.warnings, 'рекомендация', 'рекомендации', 'рекомендаций') + ' ниже стоит выполнить.' : '.')) : AD.alertBox('err', h('b', {}, 'Пока не готово: '), r.blockers + ' ' + AD.plural(r.blockers, 'обязательный пункт', 'обязательных пункта', 'обязательных пунктов') + ' требуют внимания.'),
          h('div', {style: {margin: '12px 0 4px', height: '8px', borderRadius: '99px', background: 'rgba(11,26,51,.08)', overflow: 'hidden'}, role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Готовность'}, h('div', {style: {width: pct + '%', height: '100%', background: r.ready ? 'var(--ok,#2f8f5b)' : 'var(--blue,#2f5bd6)'}})),
          h('div', {class: 'muted small'}, 'Выполнено ' + r.ok + ' из ' + r.total + ' · проверено ' + AD.fmt(r.at)));
        const note = h('div', {class: 'card tight'}, h('p', {class: 'muted small'}, 'Автоматически проверяется то, что видно серверу. Юридические пункты (Роскомнадзор, хранение в РФ, проверка юристом) подтверждает владелец вручную — отметка сохраняется с вашим именем и датой. Тексты документов собраны по требованиям 152-ФЗ, но юридическую силу им придаёт ваш юрист.'));
        const sections = groups.map(g => h('div', {class: 'card'}, h('h2', {}, g), h('ul', {class: 'hl', style: {marginTop: '8px'}}, r.items.filter(i => i.group === g).map(item))));
        AD.fill(box, head, note, sections, extHosts(r));
      }
      function item(i) {
        const [sym, col, label] = MARK[i.status] || MARK.info;
        const act = [];
        if (i.manual) {
          const b = h('button', {class: 'btn sm' + (i.confirmed ? '' : ' primary'), type: 'button'}, i.confirmed ? 'Снять отметку' : 'Подтверждаю');
          b.addEventListener('click', async () => { if (!i.confirmed && !await AD.confirm(i.title + '\n\nВы подтверждаете, что это выполнено? Отметка сохранится с вашим именем и датой.', {ok: 'Подтверждаю', danger: false})) return; await AD.busy(b, async () => { try { await AD.post('/api/launch/confirm', {id: i.id, value: !i.confirmed}); load(); } catch (e) { AD.toast(e.message, 'err'); } }); });
          act.push(b);
        }
        if (i.fix && i.status !== 'ok') act.push(h('a', {class: 'go', href: i.fix}, 'Исправить →'));
        return h('li', {style: {alignItems: 'flex-start'}}, h('b', {title: label, 'aria-label': label, style: {color: col, minWidth: '18px', textAlign: 'center', fontSize: '16px'}}, sym),
          h('span', {style: {flex: '1'}}, h('b', {}, i.title), i.blocker ? h('span', {class: 'pill new', style: {marginLeft: '8px'}}, 'обязательно') : null, i.detail ? h('div', {class: 'muted small'}, i.detail) : null, i.how && i.status !== 'ok' ? h('div', {class: 'muted small'}, 'Как: ' + i.how) : null),
          act.length ? h('span', {class: 'row gap-s', style: {flexShrink: 0}}, act) : null);
      }
      function extHosts(r) {
        const hosts = Object.entries(r.scan.hosts || {});
        return h('div', {class: 'card'}, h('h2', {}, 'Куда обращаются страницы сайта'), h('p', {class: 'muted small'}, 'Проверено страниц: ' + r.scan.pages + '. Каждый внешний адрес — это передача адреса посетителя владельцу ресурса, поэтому список должен быть коротким и осознанным.'),
          hosts.length ? h('div', {class: 'tbl-wrap', style: {marginTop: '8px'}}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Адрес', 'Что грузится', 'Раз', 'Где'].map(t => h('th', {}, t)))), h('tbody', {}, hosts.map(([host, v]) => h('tr', {}, h('td', {class: 'mono', dataset: {l: 'Адрес'}}, host), h('td', {dataset: {l: 'Что'}}, v.kinds.join(', ')), h('td', {dataset: {l: 'Раз'}}, v.count), h('td', {class: 'muted', dataset: {l: 'Где'}}, v.pages.join(', '))))))) : AD.alertBox('ok', 'Внешних загрузок нет — все шрифты, скрипты и картинки отдаются самим сайтом.'));
      }
      reload.addEventListener('click', () => AD.busy(reload, load));
      await load(); return {};
    }
  };
})();
