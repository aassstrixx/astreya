/* Раздел «Интеграции»: Яндекс Метрика, уведомление о cookie и согласие, подтверждение сайта в Вебмастере, мессенджеры MAX / Telegram / ВКонтакте, Яндекс SmartCaptcha, Битрикс24.
   Публичные значения (номер счётчика, тексты, ключи клиента) хранятся в data/integrations.json и попадают на сайт при сборке; секреты (токены, серверные ключи, веб-хуки) — только на сервере. */
(function () {
  'use strict';
  const {h} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  let fldN = 0;
  const fld = (label, input, help) => { if (input && /^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName) && !input.id) input.id = 'in' + (++fldN); return h('div', {class: 'field'}, h('label', {for: input && input.id ? input.id : null}, label), input, help ? h('div', {class: 'help'}, help) : null); };
  const ext = (href, text) => h('a', {href, target: '_blank', rel: 'noopener noreferrer'}, text);
  const MODES = {optin: ['Только с согласия (рекомендуется)', 'Аналитика не запускается, пока посетитель не нажал «Принять». Самый осторожный вариант: данные не собираются до согласия.'], notice: ['Уведомление: работает, пока не откажутся', 'Метрика работает сразу, посетитель видит уведомление и может отказаться; Вебвизор — только с согласия. Данных больше, но риск выше.'], off: ['Без уведомления', 'Только если на сайте нет аналитики. С подключённой Метрикой не рекомендуется: Роскомнадзор проверяет сайты автоматически.']};

  AD.views.integrations = {
    async mount(root) {
      const [coll, settings, sum] = await Promise.all([AD.get('/api/collections/integrations'), AD.get('/api/settings'), AD.get('/api/integrations')]);
      const pub = clone(coll.data), sec = clone(settings); let origPub = JSON.stringify(pub), origSec = JSON.stringify(sec), version = coll.version;
      pub.metrika = pub.metrika || {}; pub.consent = pub.consent || {}; pub.verification = pub.verification || {}; pub.messengers = pub.messengers || {}; pub.captcha = pub.captcha || {};
      const msg = h('div', {}), box = h('div', {});
      const text = (obj, key, o) => { const i = h('input', Object.assign({type: 'text', value: obj[key] === undefined || obj[key] === null ? '' : String(obj[key]), oninput: () => { obj[key] = i.value.trim(); }}, o)); return i; };
      const area = (obj, key, rows) => { const t = h('textarea', {rows: String(rows || 3), oninput: () => { obj[key] = t.value; }}); t.value = obj[key] || ''; return t; };
      const chk = (obj, key, label) => { const c = h('input', {type: 'checkbox', checked: !!obj[key], onchange: () => { obj[key] = c.checked; }}); return h('label', {class: 'chk'}, c, label); };
      const sync = (t, src) => { for (const k of Object.keys(src)) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && t[k] && typeof t[k] === 'object') sync(t[k], src[k]); else t[k] = clone(src[k]); } };
      async function saveAll(btn) {
        await AD.busy(btn, async () => {
          msg.replaceChildren();
          try {
            let built = false;
            if (JSON.stringify(pub) !== origPub) { const r = await AD.put('/api/collections/integrations', {data: pub, version}); version = r.version; origPub = JSON.stringify(pub); built = !!r.build; }
            if (JSON.stringify(sec) !== origSec) { const r = await AD.put('/api/settings', sec); sync(sec, r); origSec = JSON.stringify(sec); }
            AD.toast(built ? 'Сохранено, сайт пересобран' : 'Сохранено', 'ok');
            if (built) msg.replaceChildren(AD.alertBox('ok', 'Сайт пересобран. ' + (AD.config.publish && AD.config.publish.enabled ? 'Чтобы изменения увидели посетители, опубликуйте их на странице «Публикация».' : 'Чтобы изменения увидели посетители, загрузите обновлённые файлы сайта на хостинг.')));
            const s = await AD.get('/api/integrations'); Object.assign(sum, s);
          } catch (e) { msg.replaceChildren(AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); }
        });
      }
      const saveBtn = () => { const b = h('button', {class: 'btn primary', type: 'button'}, 'Сохранить'); b.addEventListener('click', () => saveAll(b)); return b; };

      /* --- Метрика --- */
      function metrikaCard() {
        const out = h('div', {}), stat = h('div', {});
        const run = async (btn, fn) => AD.busy(btn, async () => { out.replaceChildren(); try { await fn(); } catch (e) { out.replaceChildren(AD.errBox(e)); } });
        const check = h('button', {class: 'btn', type: 'button'}, 'Проверить счётчик'), goalsBtn = h('button', {class: 'btn', type: 'button'}, 'Создать недостающие цели'), stats7 = h('button', {class: 'btn', type: 'button'}, 'Статистика за 7 дней'), stats30 = h('button', {class: 'btn', type: 'button'}, 'за 30 дней');
        check.addEventListener('click', () => run(check, async () => { await saveAllQuiet(); const r = await AD.post('/api/integrations/metrika/check'); out.replaceChildren(AD.alertBox(r.codeStatus && !/OK/i.test(r.codeStatus) ? 'warn' : 'ok', h('b', {}, 'Счётчик ' + r.id + (r.name ? ' «' + r.name + '»' : '') + ' найден. '), 'Сайт в Метрике: ' + (r.site || '—') + ' · статус: ' + (r.status || '—') + ' · код на сайте: ' + (r.codeStatus || '—') + (r.codeStatus && !/OK/i.test(r.codeStatus) ? ' (Метрика ещё не видит код — он появится после публикации сайта и первого согласия посетителя)' : ''))); }));
        goalsBtn.addEventListener('click', () => run(goalsBtn, async () => { await saveAllQuiet(); const r = await AD.post('/api/integrations/metrika/sync-goals'); out.replaceChildren(AD.alertBox(r.failed.length ? 'warn' : 'ok', 'Создано целей: ' + r.created.length + ', уже были: ' + r.skipped.length + (r.failed.length ? ', не удалось: ' + r.failed.map(f => f.id + ' (' + f.error + ')').join('; ') : '') + '.')); }));
        const showStats = (btn, days) => btn.addEventListener('click', () => run(btn, async () => { await saveAllQuiet(); const r = await AD.get('/api/integrations/metrika/stats?days=' + days); const kpi = (n, t) => h('div', {class: 'kpi'}, h('b', {}, n), h('span', {}, t)); AD.fill(stat, h('div', {class: 'kpis', style: {marginTop: '12px'}}, kpi(r.visits, 'визитов за ' + r.days + ' дн.'), kpi(r.users, 'посетителей'), kpi(r.pageviews, 'просмотров'), kpi(r.bounce + '%', 'отказов'), kpi(Math.floor(r.duration / 60) + ':' + String(r.duration % 60).padStart(2, '0'), 'средняя длительность')), r.goals.length ? h('ul', {class: 'hl', style: {marginTop: '10px'}}, r.goals.map(g => h('li', {}, h('span', {class: 'lvl info'}), h('span', {}, g.name), h('span', {class: 'go muted', style: {fontWeight: 600}}, g.reaches)))) : null, r.goalsError ? h('p', {class: 'muted small'}, 'Цели: ' + r.goalsError) : null); }));
        showStats(stats7, 7); showStats(stats30, 30);
        const goals = (pub.metrika.goals || []);
        return h('div', {class: 'card'}, h('h2', {}, 'Яндекс Метрика'), h('p', {class: 'muted small'}, 'Статистика посещаемости и записи действий на сайте. Счётчик включается только по правилам выбранного режима согласия (карточка ниже). Создать счётчик: ', ext('https://metrika.yandex.ru', 'metrika.yandex.ru'), ' → «Добавить счётчик» → скопировать номер.'),
          h('div', {class: 'grid2', style: {marginTop: '10px'}}, fld('Номер счётчика', text(pub.metrika, 'id', {inputmode: 'numeric', placeholder: 'например, 98765432', maxlength: '12'}), 'Только цифры. Пусто — Метрика не подключена, баннер cookie не показывается.'),
            fld('OAuth-токен для чтения статистики и целей', text(sec.integrations.metrika, 'token', {type: 'password', autocomplete: 'off', placeholder: 'необязательно'}), h('span', {}, 'Нужен только админке (статистика здесь, создание целей), для работы счётчика на сайте не нужен. Получить: ', ext('https://oauth.yandex.ru', 'oauth.yandex.ru'), ' → создать приложение с доступом «Яндекс Метрика: получение статистики» и «изменение параметров счётчиков» → отладочный токен. Хранится на сервере, наружу не отдаётся.'))),
          h('div', {class: 'row', style: {marginTop: '10px', gap: '18px', flexWrap: 'wrap'}}, chk(pub.metrika, 'webvisor', 'Вебвизор (запись действий на странице) — только после явного согласия'), chk(pub.metrika, 'clickmap', 'Карта кликов'), chk(pub.metrika, 'trackLinks', 'Внешние ссылки и скачивания'), chk(pub.metrika, 'accurateTrackBounce', 'Точный показатель отказов')),
          h('div', {class: 'help', style: {marginTop: '6px'}}, 'Вебвизор записывает действия посетителя, поэтому по закону и практике Роскомнадзора включается только с согласия, а в политике конфиденциальности он указывается отдельно (документы обновляются сами).'),
          h('h3', {style: {marginTop: '16px'}}, 'Цели (' + goals.length + ')'), h('p', {class: 'muted small'}, 'События сайта, которые Метрика считает целями: заявки, звонки, переходы. Список редактируется в «Содержимое сайта → Интеграции», а кнопка ниже создаёт в вашем счётчике недостающие.'),
          h('ul', {class: 'hl'}, goals.map(g => h('li', {}, h('span', {class: 'lvl ' + (g.key ? 'ok' : 'info')}), h('span', {}, g.name, h('span', {class: 'muted small mono', style: {marginLeft: '8px'}}, g.id)), g.key ? h('span', {class: 'go', style: {fontWeight: 600}}, 'ключевая') : null))),
          h('div', {class: 'row', style: {marginTop: '12px', flexWrap: 'wrap'}}, saveBtn(), check, goalsBtn, stats7, stats30), out, stat);
      }
      const saveAllQuiet = async () => { if (JSON.stringify(pub) !== origPub || JSON.stringify(sec) !== origSec) { const dummy = h('button', {}); await saveAll(dummy); } };

      /* --- Согласие --- */
      function consentCard() {
        const c = pub.consent, modeDesc = h('div', {class: 'help'}), sel = h('select', {onchange: () => { c.mode = sel.value; modeDesc.textContent = MODES[c.mode][1]; }}, Object.entries(MODES).map(([k, v]) => h('option', {value: k, selected: c.mode === k}, v[0])));
        modeDesc.textContent = (MODES[c.mode] || MODES.optin)[1];
        return h('div', {class: 'card'}, h('h2', {}, 'Уведомление о cookie и согласие на аналитику'), h('p', {class: 'muted small'}, 'Небольшая карточка в верхнем углу сайта (внизу экрана ничего не показывается). Выбор посетителя запоминается; при изменении текста или настроек Метрики спрашивается снова. Кнопка «Настройки cookie» всегда есть в подвале.'),
          fld('Режим', sel), modeDesc,
          h('div', {class: 'grid2', style: {marginTop: '10px'}}, fld('Заголовок', text(c, 'title', {maxlength: '80'})), fld('Подпись ссылки в подвале', text(c, 'settings', {maxlength: '40'}))),
          fld('Текст', area(c, 'text', 4)), h('div', {class: 'grid2'}, fld('Кнопка «Принять»', text(c, 'accept', {maxlength: '40'})), fld('Кнопка отказа', text(c, 'decline', {maxlength: '40'}))),
          h('div', {class: 'row', style: {marginTop: '10px'}}, saveBtn()));
      }
      /* --- Вебмастер --- */
      function verifyCard() {
        const v = pub.verification;
        return h('div', {class: 'card'}, h('h2', {}, 'Подтверждение сайта в поисковиках'), h('p', {class: 'muted small'}, 'Чтобы видеть индексацию, ошибки и поисковые запросы. На все страницы добавляется метатег подтверждения. Карта сайта уже создаётся при сборке: ', h('span', {class: 'mono', style: {overflowWrap: 'anywhere'}}, (AD.config.siteUrl || '') + 'sitemap.xml'), '.'),
          h('div', {class: 'grid3'}, fld('Яндекс Вебмастер', text(v, 'yandex', {placeholder: 'код из метатега', maxlength: '128'}), h('span', {}, ext('https://webmaster.yandex.ru', 'webmaster.yandex.ru'), ' → «Права доступа» → «Метатег». Вставьте только значение content.')), fld('Google Search Console', text(v, 'google', {placeholder: 'код из метатега', maxlength: '128'})), fld('Mail.ru Вебмастер', text(v, 'mailru', {placeholder: 'код из метатега', maxlength: '128'}))),
          h('div', {class: 'row', style: {marginTop: '10px'}}, saveBtn()));
      }
      /* --- Мессенджеры --- */
      const MSGS = [['max', 'MAX', 'https://max.ru/…', 'Ссылка на ваш профиль или канал в MAX.'], ['telegram', 'Telegram', 'https://t.me/…', 'Ссылка на аккаунт или канал в Telegram.'], ['vk', 'ВКонтакте', 'https://vk.com/…', 'Ссылка на сообщество компании.']];
      function messengersCard() {
        const m = pub.messengers, cells = [];
        if (m.showEmpty === undefined) m.showEmpty = true;
        const on = k => !!m[k], where = k => on(k) ? 'На сайте: кнопка со ссылкой.' : (m.showEmpty ? 'На сайте: ячейка «Скоро» без ссылки.' : 'На сайте: не показывается.');
        const empt = chk(m, 'showEmpty', 'Показывать канал без ссылки ячейкой «Скоро» (если выключить, канал без ссылки на сайте не виден)');
        const refresh = [];
        for (const [k, name, ph, help] of MSGS) {
          const inp = text(m, k, {placeholder: ph, maxlength: '200', spellcheck: 'false'}), st = h('div', {class: 'help'});
          const upd = () => { st.textContent = where(k); }; upd(); inp.addEventListener('input', upd); refresh.push(upd);
          cells.push(fld(name, inp, help), st);
        }
        empt.querySelector('input').addEventListener('change', () => refresh.forEach(f => f()));
        return h('div', {class: 'card'}, h('h2', {}, 'Мессенджеры: MAX, Telegram, ВКонтакте'), h('p', {class: 'muted small'}, 'Три ячейки появятся в подвале и на странице «Контакты», а кнопки — в ответах чат-помощника. Вставьте ссылку на ваш профиль, канал или сообщество — ячейка станет рабочей кнопкой. Пока ссылки нет, на сайте показывается ячейка «Скоро».'),
          h('div', {class: 'grid3'}, ...[0, 2, 4].map(i => h('div', {}, cells[i], cells[i + 1]))),
          h('div', {style: {marginTop: '8px'}}, empt),
          h('div', {class: 'row', style: {marginTop: '10px'}}, saveBtn()));
      }
      /* --- SmartCaptcha --- */
      function captchaCard() {
        const cp = sec.integrations.captcha;
        return h('div', {class: 'card'}, h('h2', {}, 'Яндекс SmartCaptcha (защита форм)'), h('p', {class: 'muted small'}, 'Невидимая проверка при отправке формы поверх скрытого поля, контроля скорости и лимитов. Заявки без пройденной проверки не теряются: они попадают в папку «Спам». Создать капчу: ', ext('https://yandex.cloud/ru/services/smartcaptcha', 'Yandex Cloud → SmartCaptcha'), ' (нужен аккаунт Yandex Cloud; сервис тарифицируется по числу проверок — условия на странице сервиса).'),
          h('div', {class: 'grid2'}, fld('Ключ клиента', text(pub.captcha, 'siteKey', {placeholder: 'ключ для страницы', maxlength: '100'}), 'Публичный, попадает на сайт.'), fld('Серверный ключ', text(cp, 'serverKey', {type: 'password', autocomplete: 'off', placeholder: 'секретный ключ'}), 'Хранится на сервере.')),
          h('div', {style: {marginTop: '8px'}}, chk(cp, 'enabled', 'Включить проверку на сервере (нужны оба ключа)')),
          h('div', {class: 'help'}, 'Для работы капчи страницы разрешают обращения к smartcaptcha.yandexcloud.net (политика безопасности страниц обновляется сама после сохранения и пересборки).'),
          h('div', {class: 'row', style: {marginTop: '10px'}}, saveBtn()));
      }
      /* --- Битрикс24 --- */
      function bitrixCard() {
        const bx = sec.integrations.bitrix24, out = h('div', {}), test = h('button', {class: 'btn', type: 'button'}, 'Сохранить и отправить тестовый лид');
        test.addEventListener('click', () => AD.busy(test, async () => { out.replaceChildren(); try { await saveAllQuiet(); const r = await AD.post('/api/integrations/bitrix24/test'); out.replaceChildren(AD.alertBox('ok', 'Лид создан в Битрикс24' + (r.id ? ' (№' + r.id + ')' : '') + '. Удалите его в CRM — это проверка.')); } catch (e) { out.replaceChildren(AD.errBox(e)); } }));
        return h('div', {class: 'card'}, h('h2', {}, 'Битрикс24'), h('p', {class: 'muted small'}, 'Каждая заявка с сайта (кроме спама) автоматически создаёт лид в CRM. В Битрикс24: «Разработчикам» → «Другое» → «Входящий веб-хук» → права «CRM» → скопировать адрес вида https://<портал>.bitrix24.ru/rest/1/код/ .'),
          h('div', {class: 'grid2'}, fld('Адрес входящего веб-хука', text(bx, 'webhook', {type: 'password', autocomplete: 'off', placeholder: 'https://портал.bitrix24.ru/rest/1/…/'}), 'Содержит секретный код — хранится на сервере, наружу не отдаётся.'), fld('Источник лида', text(bx, 'source', {placeholder: 'WEB', maxlength: '40'}), 'Код источника из справочника CRM (по умолчанию WEB).')),
          h('div', {style: {marginTop: '8px'}}, chk(bx, 'enabled', 'Передавать заявки в Битрикс24')), h('div', {class: 'row', style: {marginTop: '10px'}}, saveBtn(), test), out);
      }
      /* --- сводка --- */
      function summaryCard() {
        const n = sum.notify, row = (on, name, where) => h('li', {}, h('span', {class: 'lvl ' + (on ? 'ok' : 'info')}), h('span', {}, name), h('span', {class: 'go muted', style: {fontWeight: 400}}, on ? 'включено' : 'выключено'));
        return h('div', {class: 'card'}, h('h2', {}, 'Что сейчас подключено'), h('ul', {class: 'hl'}, row(!!sum.metrika.id, 'Яндекс Метрика' + (sum.metrika.id ? ' · ' + sum.metrika.id : '')), row(sum.captcha.enabled, 'SmartCaptcha'), row(sum.bitrix24.enabled, 'Битрикс24'), row(!!(sum.messengers || {}).max, 'MAX на сайте'), row(!!(sum.messengers || {}).telegram, 'Telegram на сайте'), row(!!(sum.messengers || {}).vk, 'ВКонтакте на сайте'), row(n.telegram, 'Уведомления в Telegram'), row(n.smtp, 'Уведомления по e-mail'), row(n.webhook, 'Веб-хук')),
          h('p', {class: 'muted small', style: {marginTop: '8px'}}, 'Уведомления (Telegram, e-mail, веб-хук) и ИИ-помощник настраиваются в разделе «Настройки и заявки». Что куда передаётся — в разделе «Персональные данные».'));
      }
      root.append(AD.pageHead('Интеграции', 'Подключения для российского рынка. Любая интеграция включается и выключается здесь; секреты хранятся только на сервере.'), msg, box);
      AD.fill(box, summaryCard(), metrikaCard(), consentCard(), verifyCard(), messengersCard(), captchaCard(), bitrixCard());
      return {destroy() { AD.dirty = false; }};
    }
  };
})();
