/* Раздел «Обзор»: что требует внимания сейчас — заявки, состояние сайта, быстрые действия, проверка сайта, последние правки. */
(function () {
  'use strict';
  const {h} = AD;
  const ACT = {login: 'вход', logout: 'выход', content: 'правка содержимого', restore: 'откат правки', upload: 'загрузка картинки', file_delete: 'удаление картинки', build: 'сборка сайта', publish: 'публикация', settings: 'настройки', lead: 'работа с заявкой', lead_delete: 'удаление заявки', export: 'выгрузка заявок', user_create: 'новый пользователь', user_update: 'правка пользователя', user_delete: 'удаление пользователя', password: 'смена пароля', site_audit: 'проверка сайта', notify_test: 'тест уведомлений'};
  const plural = AD.plural;

  AD.views.overview = {
    async mount(root) {
      const box = h('div', {});
      root.append(AD.pageHead('Обзор', 'Что происходит на сайте и что стоит сделать. Быстрый переход куда угодно — Ctrl+K.',
        h('a', {class: 'btn', href: AD.config.siteUrl || '/', target: '_blank', rel: 'noopener'}, 'Открыть сайт'), h('a', {class: 'btn', href: '#/preview'}, 'Предпросмотр')), box);
      async function load() {
        const d = await AD.get('/api/overview'), c = d.counts, ls = d.leads, b = d.build;
        const kpi = (cls, href, num, text) => h(href ? 'a' : 'div', {class: 'kpi ' + (cls || ''), href}, h('b', {}, num), h('span', {}, text));
        const kpis = h('div', {class: 'kpis'},
          kpi(ls.new ? 'warn' : 'ok', '#/leads', ls.new, ls.new ? AD.plural(ls.new, 'новая заявка', 'новые заявки', 'новых заявок') + ' · всего ' + ls.total : 'новых заявок нет · всего ' + ls.total),
          kpi('', '#/leads', ls.week, 'заявок за неделю, сегодня ' + ls.today),
          kpi('', '#/content/products', c.products || 0, 'товаров в каталоге · брендов ' + (c.brands || 0)),
          kpi('', '#/content/events', c.events || 0, AD.plural(c.events || 0, 'мероприятие', 'мероприятия', 'мероприятий') + ' · новостей ' + (c.news || 0)),
          kpi('', '#/pages', c.pages || 0, 'своих страниц'),
          kpi(b ? (b.ok ? 'ok' : 'err') : '', '#/publish', b ? (b.ok ? 'OK' : 'Ошибка') : '—', b ? 'сборка сайта · ' + AD.ago(b.at) : 'сайт ещё не собирали из админки'));
        const quick = h('div', {class: 'card tight'}, h('h2', {}, 'Быстрые действия'), h('div', {class: 'quick', style: {marginTop: '10px'}},
          [['＋ Новость', '#/content/news/__new'], ['＋ Товар', '#/content/products/__new'], ['＋ Мероприятие', '#/content/events/__new'], ['＋ Страница', '#/pages/__new'], ['Меню и цвета', '#/design'], ['Фоны страниц', '#/design/backdrops'], ['Картинки', '#/files'], ['Опубликовать', '#/publish']]
            .map(([t, href]) => h('a', {class: 'btn' + (t[0] === '＋' ? ' primary' : ''), href}, t))));
        const hl = h('ul', {class: 'hl'}, d.health.map(x => h('li', {}, h('span', {class: 'lvl ' + x.level}), h('span', {}, x.text), x.link ? h('a', {class: 'go', href: x.link}, 'Исправить →') : null)));
        const auditOut = h('div', {});
        const auditBtn = h('button', {class: 'btn', type: 'button'}, 'Полная проверка сайта');
        const showAudit = r => AD.fill(auditOut, h('div', {style: {marginTop: '10px'}}, r.errors ? AD.alertBox('err', 'Ошибок: ' + r.errors + ', замечаний: ' + r.warns) : r.warns ? AD.alertBox('warn', 'Ошибок нет, замечаний: ' + r.warns) : AD.alertBox('ok', 'Ошибок и замечаний нет — сайт в порядке'),
          h('p', {class: 'muted small', style: {marginTop: '6px'}}, 'Проверено ' + AD.fmt(r.at) + ' · ' + (r.tool === 'audit' ? 'валидатор HTML, SEO, ссылки, изображения, доступность' : 'ссылки, заголовки, SEO') + ' · ' + (r.ms / 1000).toFixed(1) + ' с')),
          r.groups && r.groups.filter(g => g.level !== 'info').length ? h('div', {class: 'audit-groups'}, h('ul', {class: 'hl'}, r.groups.filter(g => g.level !== 'info').map(g => h('li', {}, h('span', {class: 'lvl ' + (g.level === 'error' ? 'error' : 'warn')}), h('span', {}, g.msg, g.n > 1 ? ' ×' + g.n : '', g.where && g.where.length ? h('div', {class: 'muted small'}, g.where.join(' · ')) : null))))) : null);
        if (d.siteAudit) showAudit(d.siteAudit);
        auditBtn.addEventListener('click', () => AD.busy(auditBtn, async () => { try { showAudit(await AD.post('/api/site-audit')); } catch (e) { AD.fill(auditOut, AD.errBox(e)); } }));
        const health = h('div', {class: 'card tight'}, h('h2', {}, 'Здоровье сайта'), hl, h('div', {class: 'row', style: {marginTop: '10px'}}, auditBtn, h('span', {class: 'muted small'}, 'проверяет все страницы: HTML, ссылки, SEO, изображения, доступность')), auditOut);
        const act = h('div', {class: 'card tight'}, h('h2', {}, 'Последние действия'), d.audit.length ? h('ul', {class: 'hl'}, d.audit.map(x => h('li', {}, h('span', {class: 'lvl'}), h('span', {}, h('b', {}, x.who), ' · ', ACT[x.action] || x.action, x.detail ? h('span', {class: 'muted'}, ' — ' + x.detail.slice(0, 70)) : null), h('span', {class: 'go muted', style: {fontWeight: 400}}, AD.ago(x.t))))) : h('p', {class: 'muted'}, 'Пока пусто.'),
          h('div', {style: {marginTop: '8px'}}, h('a', {class: 'btn sm', href: '#/audit'}, 'Весь журнал →')));
        AD.fill(box, kpis, h('div', {class: 'cols2'}, h('div', {style: {display: 'flex', flexDirection: 'column', gap: 'var(--gap,14px)'}}, health, act), h('div', {style: {display: 'flex', flexDirection: 'column', gap: 'var(--gap,14px)'}}, quick,
          h('div', {class: 'card tight'}, h('h2', {}, 'Как это устроено'), h('ul', {class: 'hl'}, [
            ['Любая правка сохраняется, сайт пересобирается сам; если данные ошибочны — изменения отменяются.', ''],
            ['Страницы, меню, цвета и фоны — в разделах «Страницы» и «Оформление»; результат виден в «Предпросмотре».', ''],
            ['Кнопка «Опубликовать» отправляет готовый сайт на GitHub Pages (если подключено).', ''],
            ['Каждое изменение можно откатить: «История» в любом разделе содержимого.', '']].map(([t]) => h('li', {}, h('span', {class: 'lvl info'}), h('span', {}, t))))))));
      }
      await load(); return {};
    }
  };
})();
