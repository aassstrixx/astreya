/* Разделы «Картинки», «Публикация», «Настройки и заявки», «Пользователи», «Журнал». */
(function () {
  'use strict';
  const {h, $, $$} = AD;
  const clone = v => JSON.parse(JSON.stringify(v));
  const MASK = '••••••••';
  const IMG_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

  /* ---------- картинки ---------- */
  const readB64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Не удалось прочитать файл')); r.readAsDataURL(file); });
  async function uploadFiles(dir, files, onDone) {
    let ok = 0, last = null;
    for (const f of files) {
      if (f.size > (AD.config.maxUpload || 6291456)) { AD.toast(f.name + ': больше 6 МБ', 'err'); continue; }
      try { const r = await AD.post('/api/files', {dir, name: f.name, data: await readB64(f)}); ok++; last = r.path; } catch (e) { AD.toast(f.name + ': ' + e.message, 'err'); }
    }
    if (ok) AD.toast('Загружено файлов: ' + ok, 'ok'); if (onDone) onDone(last); return last;
  }
  function dropZone(dir, onDone) {
    const input = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, class: 'sr', 'aria-label': 'Выбрать файлы для загрузки', onchange: () => { uploadFiles(dir, Array.from(input.files), onDone); input.value = ''; }});
    const z = h('div', {class: 'drop', tabindex: '0', role: 'button', onclick: () => input.click(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
      ondragover: e => { e.preventDefault(); z.classList.add('over'); }, ondragleave: () => z.classList.remove('over'), ondrop: e => { e.preventDefault(); z.classList.remove('over'); uploadFiles(dir, Array.from(e.dataTransfer.files), onDone); }}, 'Перетащите картинки сюда или нажмите, чтобы выбрать (PNG, JPG, WebP, GIF, до 6 МБ)');
    return h('div', {}, z, input);                       // поле выбора файла — рядом, а не внутри кнопки (вложенные интерактивные элементы читаются экранными дикторами плохо)
  }
  AD.views.files = {
    async mount(root) {
      const box = h('div', {}); root.append(AD.pageHead('Картинки', 'Фото, логотипы брендов, фото преподавателей. Загруженный файл потом выбирается в нужной записи (кнопка «Выбрать / загрузить…»).'), box);
      async function load() {
        const {dirs} = await AD.get('/api/files');
        box.replaceChildren(...dirs.map(d => h('div', {class: 'card'}, h('h2', {}, d.title, h('span', {class: 'muted small mono', style: {marginLeft: '10px'}}, d.dir)), dropZone(d.dir, load), h('div', {class: 'files', style: {marginTop: '14px'}}, d.files.map(f => h('div', {class: 'file'},
          IMG_EXT.test(f.name) ? h('div', {class: 'th', style: {backgroundImage: 'url("/' + encodeURI(f.path) + '")'}, role: 'img', 'aria-label': f.name}) : h('div', {class: 'th'}), h('div', {class: 'nm'}, f.name), h('div', {class: 'muted'}, AD.size(f.size)),
          h('div', {class: 'row gap-s'}, h('button', {class: 'btn sm', type: 'button', onclick: () => AD.copy(f.path, 'Путь скопирован')}, 'Путь'), h('button', {class: 'btn sm', type: 'button', onclick: () => usage(f)}, 'Где?'), h('button', {class: 'btn sm danger', type: 'button', onclick: () => delFile(f)}, 'Удалить'))))))));
      }
      /* где файл упомянут (данные, шаблоны, стили): понятно, можно ли его удалить */
      async function usage(f) {
        let used; try { used = (await AD.get('/api/files/usage?path=' + encodeURIComponent(f.path))).used; } catch (e) { AD.toast(e.message, 'err'); return; }
        AD.modal({title: 'Где используется ' + f.name, body: used.length ? h('div', {}, h('p', {}, 'Файл упомянут в ' + used.length + ' ' + AD.plural(used.length, 'месте', 'местах', 'местах') + ':'), h('ul', {class: 'hl'}, used.map(u => h('li', {}, h('span', {class: 'lvl info'}), h('span', {class: 'mono'}, u)))), h('p', {class: 'muted small', style: {marginTop: '10px'}}, 'Пока файл используется, удалить его нельзя: сначала замените картинку в соответствующей записи.'))
          : AD.alertBox('ok', 'Нигде не используется — файл можно удалить.')});
      }
      async function delFile(f) {
        if (!await AD.confirm('Удалить файл ' + f.path + '?', {ok: 'Удалить'})) return;
        try { await AD.del('/api/files?path=' + encodeURIComponent(f.path)); AD.toast('Файл удалён'); load(); } catch (e) { AD.toast(e.message, 'err', 9000); }
      }
      await load(); return {};
    }
  };
  /* выбор картинки для поля в редакторе: окно с галереей и загрузкой; возвращает путь или null */
  AD.pickImage = () => new Promise(async res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    let dirs; try { dirs = (await AD.get('/api/files')).dirs; } catch (e) { AD.toast(e.message, 'err'); return fin(null); }
    const body = h('div', {}); let m;
    const paint = d => body.replaceChildren(...d.map(x => h('div', {class: 'sect'}, h('h3', {}, x.title), dropZone(x.dir, async () => { const nd = (await AD.get('/api/files')).dirs; paint(nd); }), h('div', {class: 'files', style: {marginTop: '12px'}}, x.files.filter(f => IMG_EXT.test(f.name)).map(f => h('div', {class: 'file pick', tabindex: '0', role: 'button', 'aria-label': 'Выбрать ' + f.name, onclick: () => { fin(f.path); m.close(true); }, onkeydown: e => { if (e.key === 'Enter') { fin(f.path); m.close(true); } }}, h('div', {class: 'th', style: {backgroundImage: 'url("/' + encodeURI(f.path) + '")'}}), h('div', {class: 'nm'}, f.name)))))));
    paint(dirs); m = AD.modal({title: 'Выберите картинку', body, cls: 'xl', onClose: () => fin(null)});
  });

  /* ---------- публикация ---------- */
  AD.views.publish = {
    async mount(root) {
      const box = h('div', {});
      root.append(AD.pageHead('Публикация', 'Сборка страниц из данных и отправка изменений на GitHub Pages.'), box);
      async function load() {
        const [b, pub] = await Promise.all([AD.get('/api/build'), AD.get('/api/publish')]);
        const buildBtn = h('button', {class: 'btn primary', type: 'button'}, 'Пересобрать сайт'), out = h('div', {});
        buildBtn.addEventListener('click', () => AD.busy(buildBtn, async () => { try { const r = await AD.post('/api/build'); AD.toast('Сайт пересобран и проверен', 'ok'); await load(); } catch (e) { AD.toast('Сборка не прошла', 'err'); out.replaceChildren(AD.alertBox('err', h('b', {}, 'Сборка не прошла'), h('pre', {}, ((e.data && e.data.build && e.data.build.out) || '') + '\n' + ((e.data && e.data.check && e.data.check.out) || '')))); } }));
        const card1 = h('div', {class: 'card'}, h('h2', {}, 'Сборка сайта'),
          b.at ? h('div', {}, h('div', {}, b.ok ? AD.alertBox('ok', 'Последняя сборка успешна · ' + AD.fmt(b.at) + (b.reason ? ' · ' + b.reason : '')) : AD.alertBox('err', 'Последняя сборка завершилась ошибкой · ' + AD.fmt(b.at))), h('pre', {class: 'out', style: {marginTop: '10px'}}, [b.build && b.build.out, b.check && b.check.out].filter(Boolean).join('\n'))) : h('p', {class: 'muted'}, 'С момента запуска сервера сборок не было.'),
          h('div', {style: {marginTop: '12px'}}, buildBtn), out);
        let card2;
        if (!pub.enabled) card2 = h('div', {class: 'card'}, h('h2', {}, 'Публикация на GitHub Pages'), AD.alertBox('info', pub.hint), h('p', {class: 'muted small', style: {marginTop: '10px'}}, 'Без git: скачайте собранные файлы с сервера (или используйте «git pull» на сервере) и загрузите в репозиторий вручную. Подробности — в server/README.md.'));
        else if (pub.error) card2 = h('div', {class: 'card'}, h('h2', {}, 'Публикация на GitHub Pages'), AD.alertBox('err', pub.error));
        else {
          const msg = h('input', {type: 'text', value: 'Обновление данных сайта из админки', maxlength: '200', 'aria-label': 'Комментарий к публикации'}), pb = h('button', {class: 'btn primary', type: 'button', disabled: !pub.changed}, 'Опубликовать'), res = h('div', {});
          pb.addEventListener('click', async () => { if (!await AD.confirm('Отправить изменения (' + pub.changed + ' файл.) в ветку «' + pub.branch + '»? Сайт на GitHub Pages обновится через 1–2 минуты.', {ok: 'Опубликовать', danger: false})) return; await AD.busy(pb, async () => { try { const r = await AD.post('/api/publish', {message: msg.value}); res.replaceChildren(AD.alertBox('ok', r.nothing ? r.message : 'Опубликовано: коммит ' + r.commit + ' в ветку ' + r.branch + '.')); load(); } catch (e) { res.replaceChildren(AD.errBox(e)); } }); });
          card2 = h('div', {class: 'card'}, h('h2', {}, 'Публикация на GitHub Pages'), h('p', {class: 'muted'}, 'Ветка: ', h('b', {}, pub.branch), pub.remote ? ' · ' + pub.remote : ''),
            pub.changed ? h('div', {}, h('p', {style: {margin: '10px 0 6px'}}, 'Изменённых файлов: ', h('b', {}, pub.changed)), h('pre', {class: 'out'}, pub.files.map(f => f.state + ' ' + f.file).join('\n'))) : h('p', {style: {margin: '10px 0'}}, 'Всё уже опубликовано — несохранённых в git изменений нет.'),
            h('div', {class: 'field', style: {marginTop: '12px'}}, h('label', {}, 'Комментарий к публикации'), msg), h('div', {style: {marginTop: '12px'}}, pb), res);
        }
        box.replaceChildren(card1, card2);
      }
      await load(); return {};
    }
  };

  /* ---------- настройки и заявки ---------- */
  let fldN = 0;                                                       // подпись связана с полем (для экранных дикторов и клика по подписи)
  function fld(label, input, help) { if (input && /^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName) && !input.id) input.id = 'sf' + (++fldN); return h('div', {class: 'field'}, h('label', {for: input && input.id ? input.id : null}, label), input, help ? h('div', {class: 'help'}, help) : null); }
  AD.views.settings = {
    async mount(root) {
      const [settings, site] = await Promise.all([AD.get('/api/settings'), AD.get('/api/collections/site')]);
      const S = clone(settings), n = S.notify, tg = n.telegram, sm = n.smtp, ep = (AD.config.origin || location.origin) + '/api/lead';
      const inp = (obj, key, o) => { const i = h('input', Object.assign({type: 'text', value: obj[key] === undefined || obj[key] === null ? '' : String(obj[key]), oninput: () => { obj[key] = o && o.num ? (i.value === '' ? '' : +i.value) : i.value; }}, o && o.attrs)); return i; };
      const chk = (obj, key, text) => { const c = h('input', {type: 'checkbox', checked: !!obj[key], onchange: () => { obj[key] = c.checked; }}); return h('label', {class: 'chk'}, c, text); };
      const origins = h('textarea', {rows: '3', placeholder: 'https://example.github.io', 'aria-label': 'Разрешённые сайты', oninput: () => { S.allowedOrigins = origins.value.split(/\s+/).map(x => x.replace(/\/+$/, '')).filter(Boolean); }}); origins.value = (S.allowedOrigins || []).join('\n');
      const msg = h('div', {}), testBtn = h('button', {class: 'btn', type: 'button'}, 'Сохранить и отправить тест');
      async function save() { const r = await AD.put('/api/settings', S); Object.assign(S, clone(r)); return r; }
      const mkSave = () => { const b = h('button', {class: 'btn primary', type: 'button', 'data-act': 'save-settings'}, 'Сохранить настройки'); b.addEventListener('click', () => AD.busy(b, async () => { msg.replaceChildren(); try { await save(); AD.toast('Настройки сохранены', 'ok'); } catch (e) { msg.replaceChildren(AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); } })); return b; };
      testBtn.addEventListener('click', () => AD.busy(testBtn, async () => {
        msg.replaceChildren();
        try { await save(); const t = await AD.post('/api/settings/test-notify'); msg.replaceChildren(!t.configured ? AD.alertBox('warn', 'Ни один канал не настроен: заполните веб-хук, Telegram или SMTP.') : h('div', {}, t.results.map(x => AD.alertBox(x.ok ? 'ok' : 'err', h('b', {}, x.channel + ': '), x.ok ? 'отправлено — проверьте получение.' : x.error)))); }
        catch (e) { msg.replaceChildren(AD.errBox(e)); }
      }));
      const epInput = h('input', {type: 'text', value: site.data.formEndpoint || ep, 'aria-label': 'Адрес приёма заявок'}), epBtn = h('button', {class: 'btn', type: 'button'}, 'Записать в настройки сайта'), epMsg = h('div', {});
      epBtn.addEventListener('click', () => AD.busy(epBtn, async () => {
        epMsg.replaceChildren(); const v = epInput.value.trim();
        try { const cur = await AD.get('/api/collections/site'); const d = cur.data; d.formEndpoint = v; const r = await AD.put('/api/collections/site', {data: d, version: cur.version}); AD.toast(v ? 'Формы сайта теперь отправляют заявки на этот сервер' : 'Формы переключены на письмо (mailto)', 'ok'); epMsg.replaceChildren(AD.alertBox('ok', r.build ? 'Сайт пересобран. ' + (AD.config.publish && AD.config.publish.enabled ? 'Опубликуйте изменения на странице «Публикация».' : 'Если сайт размещён на GitHub Pages, закоммитьте data/site.json и js/data.js.') : 'Сохранено.')); }
        catch (e) { epMsg.replaceChildren(AD.errBox(e)); }
      }));
      const curEp = site.data.formEndpoint;
      root.append(AD.pageHead('Настройки и заявки', 'Куда приходят заявки с сайта, как их защищать от спама и о чём уведомлять.', mkSave()), msg,
        h('div', {class: 'card'}, h('h2', {}, 'Подключение форм сайта'),
          curEp ? AD.alertBox('ok', 'Сейчас формы отправляют заявки на: ' + curEp) : AD.alertBox('warn', 'Сейчас формы работают в режиме «письмо»: у посетителя открывается почтовая программа. Чтобы заявки приходили в админку, укажите адрес ниже.'),
          h('div', {class: 'field', style: {marginTop: '12px'}}, h('label', {}, 'Адрес приёма заявок'), epInput, h('div', {class: 'help'}, 'Если сайт и админка работают на одном сервере — оставьте ', h('span', {class: 'mono'}, '/api/lead'), '. Если сайт на GitHub Pages — полный адрес сервера: ', h('span', {class: 'mono'}, ep), ' (нужен https). Пустое значение — режим «письмо».')),
          h('div', {class: 'row', style: {marginTop: '10px'}}, epBtn, h('button', {class: 'btn ghost', type: 'button', onclick: () => { epInput.value = '/api/lead'; }}, 'Тот же сервер (/api/lead)'), h('button', {class: 'btn ghost', type: 'button', onclick: () => { epInput.value = ep; }}, 'Полный адрес')), epMsg,
          h('div', {class: 'field', style: {marginTop: '16px'}}, h('label', {}, 'Сайты, с которых принимаются заявки (по одному в строке)'), origins, h('div', {class: 'help'}, 'Адрес из «Настройки сайта → url» разрешён автоматически (', h('span', {class: 'mono'}, AD.config.siteUrl || '—'), '). Добавьте другие адреса, если форму показывают где-то ещё. Формат: https://example.com — без пути и слэша на конце.'))),
        h('div', {class: 'card'}, h('h2', {}, 'Защита от спама и хранение'), h('div', {class: 'grid3'}, fld('Заявок с одного адреса за 10 минут', inp(S.rateLimit, 'per10min', {num: true, attrs: {type: 'number', min: '1'}})), fld('…и за сутки', inp(S.rateLimit, 'perDay', {num: true, attrs: {type: 'number', min: '1'}})), fld('Слишком быстрая отправка, мс', inp(S, 'minFillMs', {num: true, attrs: {type: 'number', min: '0'}}), 'Быстрее — заявка помечается ⚠ (но не теряется).')),
          h('div', {class: 'grid2', style: {marginTop: '12px'}}, fld('Хранить закрытые заявки, дней', inp(S, 'retentionDays', {num: true, attrs: {type: 'number', min: '0', placeholder: '0'}}), '0 или пусто — не удалять. Удаляются только обработанные, спам и архив.'), h('div', {class: 'field'}, h('label', {}, 'Сайт'), chk(S, 'autoBuild', 'Пересобирать сайт после сохранения содержимого'))),
          h('p', {class: 'help', style: {marginTop: '10px'}}, 'Также всегда работают: скрытое поле-ловушка, отсечение повторов за 10 минут, проверка полей и согласия на обработку данных.')),
        h('div', {class: 'card'}, h('h2', {}, 'Уведомления о новых заявках'), h('p', {class: 'muted small', style: {marginBottom: '12px'}}, 'Заявка сохраняется в админке всегда; уведомления — дополнительный способ узнать о ней сразу. Можно включить несколько каналов. Спам не уведомляет.'),
          h('h3', {}, 'Telegram'), h('div', {class: 'grid2'}, fld('Токен бота', inp(tg, 'token', {attrs: {type: 'password', autocomplete: 'off', placeholder: '123456:ABC…'}}), 'Создайте бота у @BotFather и добавьте его в чат.'), fld('ID чата', inp(tg, 'chatId', {attrs: {placeholder: '-100123456789'}}))),
          h('h3', {style: {marginTop: '18px'}}, 'Электронная почта (SMTP)'), h('div', {class: 'grid3'}, fld('Сервер', inp(sm, 'host', {attrs: {placeholder: 'smtp.example.com'}})), fld('Порт', inp(sm, 'port', {num: true, attrs: {type: 'number', placeholder: '587'}}), '587 (STARTTLS) или 465 (SSL).'), h('div', {class: 'field'}, h('label', {}, 'Шифрование'), chk(sm, 'secure', 'Сразу SSL/TLS (порт 465)'))),
          h('div', {class: 'grid2', style: {marginTop: '12px'}}, fld('Логин', inp(sm, 'user', {attrs: {autocomplete: 'off'}})), fld('Пароль', inp(sm, 'pass', {attrs: {type: 'password', autocomplete: 'new-password'}}))),
          h('div', {class: 'grid2', style: {marginTop: '12px'}}, fld('Отправитель (From)', inp(sm, 'from', {attrs: {placeholder: 'Сайт Астреи <site@example.com>'}})), fld('Получатели (через запятую)', inp(sm, 'to', {attrs: {placeholder: 'sales@example.com, manager@example.com'}}))),
          h('h3', {style: {marginTop: '18px'}}, 'Веб-хук (для CRM, Bitrix24, amoCRM, n8n, Zapier…)'), fld('Адрес', inp(n, 'webhookUrl', {attrs: {placeholder: 'https://…'}}), 'На адрес уходит POST с JSON: {event: "lead.created", text, lead: {…}}.'),
          h('div', {class: 'row', style: {marginTop: '16px'}}, mkSave(), testBtn)));
      return {};
    }
  };

  /* ---------- пользователи ---------- */
  const genPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ', d = '23456789'; const r = n => Array.from(crypto.getRandomValues(new Uint32Array(n)), x => x); const pick = (s, k) => s[k % s.length]; const k = r(12); return Array.from({length: 10}, (_, i) => pick(a, k[i % 12])).join('') + pick(d, k[10]) + pick(d, k[11]); };
  AD.views.users = {
    async mount(root) {
      const box = h('div', {}); const addBtn = h('button', {class: 'btn primary', type: 'button', onclick: () => createDialog()}, '＋ Добавить пользователя');
      root.append(AD.pageHead('Пользователи', 'Администратор управляет всем. Менеджер видит и обрабатывает только заявки.', addBtn), box);
      async function load() {
        const {users} = await AD.get('/api/users'), roles = AD.config.roles;
        box.replaceChildren(h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Логин', 'Имя', 'Роль', 'Последний вход', ''].map(t => h('th', {}, t)))), h('tbody', {}, users.map(u => h('tr', {dataset: {login: u.login}},
          h('td', {dataset: {l: 'Логин'}}, h('b', {}, u.login), u.disabled ? h('span', {class: 'pill archived', style: {marginLeft: '8px'}}, 'отключён') : null, u.mustChange ? h('span', {class: 'flag'}, 'сменит пароль') : null), h('td', {dataset: {l: 'Имя'}}, u.name), h('td', {dataset: {l: 'Роль'}}, roles[u.role] || u.role), h('td', {dataset: {l: 'Вход'}}, u.lastLogin ? AD.ago(u.lastLogin) : 'ещё не входил'),
          h('td', {class: 'nowrap'}, h('button', {class: 'btn sm', type: 'button', onclick: () => editDialog(u)}, 'Изменить'), ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => resetDialog(u)}, 'Сбросить пароль'), ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => toggle(u)}, u.disabled ? 'Включить' : 'Отключить'), ' ', u.id === AD.user.id ? null : h('button', {class: 'btn sm danger', type: 'button', onclick: () => remove(u)}, 'Удалить'))))))));
      }
      const roleSel = cur => h('select', {}, Object.entries(AD.config.roles).map(([k, v]) => h('option', {value: k, selected: k === cur}, v)));
      function createDialog() {
        const login = h('input', {type: 'text', autocapitalize: 'none', autocomplete: 'off'}), name = h('input', {type: 'text'}), role = roleSel('manager'), pw = h('input', {type: 'text', value: genPassword(), autocomplete: 'off'}), err = h('div', {});
        const ok = h('button', {class: 'btn primary', type: 'button'}, 'Создать');
        const m = AD.modal({title: 'Новый пользователь', body: [err, h('div', {class: 'ed-obj'}, fld('Логин', login, 'Латиница, цифры, точка, дефис, подчёркивание (3–32).'), fld('Имя', name), fld('Роль', role), fld('Временный пароль', h('div', {class: 'row gap-s', style: {flexWrap: 'nowrap'}}, pw, h('button', {class: 'btn sm', type: 'button', onclick: () => { pw.value = genPassword(); }}, 'Другой')), 'Передайте пользователю: при первом входе он задаст свой.'))], footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), ok]});
        ok.addEventListener('click', () => AD.busy(ok, async () => { err.replaceChildren(); try { await AD.post('/api/users', {login: login.value.trim(), name: name.value.trim(), role: role.value, password: pw.value}); m.close(); AD.toast('Пользователь создан', 'ok'); AD.copy('Логин: ' + login.value.trim() + '\nПароль: ' + pw.value, 'Логин и пароль скопированы'); load(); } catch (e) { err.replaceChildren(AD.errBox(e)); } }));
      }
      function editDialog(u) {
        const name = h('input', {type: 'text', value: u.name}), role = roleSel(u.role), err = h('div', {}), ok = h('button', {class: 'btn primary', type: 'button'}, 'Сохранить');
        const m = AD.modal({title: 'Пользователь ' + u.login, body: [err, h('div', {class: 'ed-obj'}, fld('Имя', name), fld('Роль', role))], footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), ok]});
        ok.addEventListener('click', () => AD.busy(ok, async () => { try { await AD.patch('/api/users/' + u.id, {name: name.value.trim(), role: role.value}); m.close(); AD.toast('Сохранено', 'ok'); if (u.id === AD.user.id && role.value !== u.role) location.reload(); else load(); } catch (e) { err.replaceChildren(AD.errBox(e)); } }));
      }
      function resetDialog(u) {
        const pw = h('input', {type: 'text', value: genPassword(), autocomplete: 'off'}), err = h('div', {}), ok = h('button', {class: 'btn primary', type: 'button'}, 'Сбросить пароль');
        const m = AD.modal({title: 'Новый пароль для ' + u.login, body: [err, fld('Временный пароль', h('div', {class: 'row gap-s', style: {flexWrap: 'nowrap'}}, pw, h('button', {class: 'btn sm', type: 'button', onclick: () => { pw.value = genPassword(); }}, 'Другой')), 'Все сеансы пользователя будут завершены; при входе он должен сменить пароль.')], footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Отмена'), ok]});
        ok.addEventListener('click', () => AD.busy(ok, async () => { try { await AD.patch('/api/users/' + u.id, {password: pw.value}); m.close(); AD.copy('Логин: ' + u.login + '\nПароль: ' + pw.value, 'Пароль сброшен и скопирован'); load(); } catch (e) { err.replaceChildren(AD.errBox(e)); } }));
      }
      async function toggle(u) { try { await AD.patch('/api/users/' + u.id, {disabled: !u.disabled}); AD.toast(u.disabled ? 'Пользователь включён' : 'Пользователь отключён', 'ok'); load(); } catch (e) { AD.toast(e.message, 'err'); } }
      async function remove(u) { if (!await AD.confirm('Удалить пользователя ' + u.login + '? Его сеансы будут завершены.', {ok: 'Удалить'})) return; try { await AD.del('/api/users/' + u.id); AD.toast('Удалён'); load(); } catch (e) { AD.toast(e.message, 'err'); } }
      await load(); return {};
    }
  };

  /* ---------- журнал ---------- */
  const AUDIT = {login: 'Вход', logout: 'Выход', password: 'Смена пароля', lead: 'Заявка', lead_delete: 'Удаление заявки', export: 'Выгрузка CSV', content: 'Содержимое', restore: 'Восстановление', upload: 'Загрузка файла', file_delete: 'Удаление файла', build: 'Сборка', publish: 'Публикация', settings: 'Настройки', notify_test: 'Проверка уведомлений', notify_failed: 'Сбой уведомления', user_create: 'Новый пользователь', user_update: 'Изменён пользователь', user_delete: 'Удалён пользователь'};
  AD.views.audit = {
    async mount(root) {
      const box = h('div', {}), lim = h('select', {'aria-label': 'Сколько записей'}, [100, 300, 500].map(n => h('option', {value: n}, 'Последние ' + n)));
      async function load() { const {items} = await AD.get('/api/audit?limit=' + lim.value); box.replaceChildren(items.length ? h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Время', 'Кто', 'Действие', 'Подробности'].map(t => h('th', {}, t)))), h('tbody', {}, items.map(x => h('tr', {}, h('td', {class: 'nowrap', dataset: {l: 'Время'}}, AD.fmt(x.t)), h('td', {dataset: {l: 'Кто'}}, x.who), h('td', {dataset: {l: 'Действие'}}, AUDIT[x.action] || x.action), h('td', {class: 'muted', dataset: {l: 'Подробности'}}, x.detail)))))) : h('div', {class: 'empty'}, h('b', {}, 'Журнал пуст'))); }
      lim.addEventListener('change', load);
      root.append(AD.pageHead('Журнал действий', 'Кто и что менял в админке: входы, правки, заявки, настройки.', lim, h('button', {class: 'btn', type: 'button', onclick: load}, 'Обновить')), box);
      await load(); return {};
    }
  };
})();
