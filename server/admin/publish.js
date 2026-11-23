/* Разделы «Опубликовать» и «История и откат».
   Опубликовать: проверка сборки → что изменилось с прошлой публикации (файлы и читаемый список правок) → отправка на GitHub (git push) → последние публикации.
   История и откат: все сохранённые версии разделов по времени; можно посмотреть, что изменилось, и вернуть прежнее состояние. */
(function () {
  'use strict';
  const {h} = AD;
  const GROUPS = [['data', 'Данные сайта', f => /^data\/.*\.json$/.test(f)], ['assets', 'Картинки', f => /^assets\//.test(f)], ['pages', 'Готовые страницы (пересобираются сами)', f => /\.(html|xml|txt|webmanifest)$/.test(f) || /^(brands|products|training|news|pages)\//.test(f)], ['other', 'Служебные файлы (стили, скрипты, версия выкладки)', () => true]];
  const STATE = {M: 'изменён', A: 'новый', D: 'удалён', '??': 'новый', R: 'переименован'};
  const kindCls = k => k === 'добавлено' ? 'done' : k === 'удалено' ? 'spam' : 'in_work';

  function diffTable(res) {
    if (res.kind !== 'json') return h('p', {class: 'muted small'}, res.note || '');
    if (!res.changes.length) return h('p', {class: 'muted small'}, 'Содержательных правок нет (изменился только порядок записей или служебные поля).');
    return h('div', {}, h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl'}, h('thead', {}, h('tr', {}, ['Где', '', 'Было', 'Стало'].map(t => h('th', {}, t)))), h('tbody', {}, res.changes.map(c => h('tr', {}, h('td', {class: 'df-path'}, c.path), h('td', {}, h('span', {class: 'pill ' + kindCls(c.kind)}, c.kind)), h('td', {class: 'df-old'}, c.from), h('td', {class: 'df-new'}, c.to)))))), res.more ? h('p', {class: 'muted small'}, 'и ещё ' + res.more + ' правок') : null);
  }

  AD.views.publish = {
    async mount(root) {
      const box = h('div', {}), colls = (await AD.get('/api/collections').catch(() => ({collections: []}))).collections, titleOf = f => { const c = colls.find(x => 'data/' + (x.name.startsWith('stella_') ? 'stella/' + x.name.slice(7) : x.name) + '.json' === f); return c ? c.title : f; };
      AD.fill(root, AD.pageHead('Опубликовать', 'Три шага: проверить сайт, посмотреть, что изменилось, отправить на GitHub Pages. Пока вы не нажали «Опубликовать», посетители видят прежнюю версию.'), box);
      async function load() {
        const [b, pub, lg] = await Promise.all([AD.get('/api/build'), AD.get('/api/publish'), AD.get('/api/publish/log?n=12').catch(() => ({items: []}))]);
        const buildBtn = h('button', {class: 'btn primary', type: 'button'}, 'Пересобрать и проверить'), out = h('div', {});
        buildBtn.addEventListener('click', () => AD.busy(buildBtn, async () => { try { await AD.post('/api/build'); AD.toast('Сайт пересобран и проверен', 'ok'); await load(); } catch (e) { out.replaceChildren(AD.errBox(e)); } }));
        const s1 = h('div', {class: 'card'}, h('h2', {}, h('span', {class: 'ed-n'}, '01'), 'Проверка сайта'),
          b.at ? (b.ok ? AD.alertBox('ok', 'Последняя сборка успешна · ' + AD.fmt(b.at) + (b.reason ? ' · ' + b.reason : '')) : AD.alertBox('err', 'Последняя сборка завершилась ошибкой · ' + AD.fmt(b.at), h('pre', {}, String((b.build && b.build.out) || (b.check && b.check.out) || '').slice(-1200)))) : AD.alertBox('info', 'Сборка из админки ещё не запускалась. Сайт собирается сам при каждом сохранении.'),
          h('div', {class: 'row', style: {marginTop: '12px'}}, buildBtn, h('a', {class: 'btn', href: '#/preview'}, 'Посмотреть сайт'), AD.user.role === 'admin' ? h('a', {class: 'btn ghost', href: '/api/site.zip', download: ''}, 'Скачать сайт архивом') : null), out);
        let s2, s3;
        if (!pub.enabled) {
          s2 = h('div', {class: 'card'}, h('h2', {}, h('span', {class: 'ed-n'}, '02'), 'Что изменилось'), AD.alertBox('info', pub.hint), h('p', {class: 'muted'}, 'Админка работает на вашем компьютере или сервере, а GitHub Pages сам программу не запускает. Чтобы кнопка «Опубликовать» заработала, запустите админку с переменной PUBLISH_GIT=1 в папке сайта (подробно — docs/ADMIN.md). Без этого можно скачать готовый сайт архивом и выложить его вручную.'));
          s3 = null;
        } else if (pub.error) s2 = h('div', {class: 'card'}, h('h2', {}, 'Публикация'), AD.alertBox('err', pub.error));
        else {
          const files = pub.files || [], byG = {}; files.forEach(f => { const g = GROUPS.find(x => x[2](f.file)); (byG[g[0]] = byG[g[0]] || []).push(f); });
          const groupsEl = GROUPS.filter(g => byG[g[0]]).map(([id, title]) => {
            const list = byG[id];
            return h('details', {class: 'ed-card', open: id === 'data' || id === 'assets'}, h('summary', {}, h('span', {class: 't'}, title), h('span', {class: 'muted small'}, list.length + ' ' + AD.plural(list.length, 'файл', 'файла', 'файлов'))),
              h('div', {class: 'in'}, list.slice(0, id === 'data' || id === 'assets' ? 100 : 12).map(f => { const det = h('div', {class: 'df-det', hidden: true}), name = id === 'data' ? titleOf(f.file) : f.file;
                return h('div', {class: 'df-row'}, h('div', {class: 'row'}, h('span', {class: 'pill ' + (f.state === 'D' ? 'spam' : f.state === 'M' ? 'in_work' : 'done')}, STATE[f.state] || f.state), h('b', {}, name), id === 'data' ? h('span', {class: 'muted small mono'}, f.file) : null,
                  id === 'data' ? h('button', {class: 'btn sm right', type: 'button', onclick: async e => { if (!det.hidden) { det.hidden = true; return; } if (!det.firstChild) { det.append(h('p', {class: 'muted small'}, 'Загружаю…')); try { det.replaceChildren(diffTable(await AD.get('/api/publish/diff?file=' + encodeURIComponent(f.file)))); } catch (x) { det.replaceChildren(AD.errBox(x)); } } det.hidden = false; }}, 'Что изменилось') : null,
                  id === 'assets' && /\.(png|jpe?g|webp|gif)$/i.test(f.file) && f.state !== 'D' ? h('img', {class: 'df-th', src: '/' + f.file, alt: ''}) : null), det); }), list.length > 12 && id !== 'data' && id !== 'assets' ? h('p', {class: 'muted small'}, 'и ещё ' + (list.length - 12)) : null));
          });
          s2 = h('div', {class: 'card'}, h('h2', {}, h('span', {class: 'ed-n'}, '02'), 'Что изменилось с прошлой публикации'), h('div', {class: 'pub-target'}, h('div', {class: 'pub-t-row'}, h('span', {class: 'pub-t-k'}, 'Ветка публикации'), h('b', {class: 'mono', id: 'pub-branch'}, pub.branch), pub.repo ? h('span', {class: 'muted small'}, ' · репозиторий ' + pub.repo) : (pub.remote ? h('span', {class: 'muted small mono'}, ' · ' + pub.remote) : null)),
            h('p', {class: 'muted small'}, 'Кнопка «Опубликовать» отправляет изменения (git push) именно в эту ветку, и сайт на GitHub Pages собирается из неё. Если Pages настроен на другую ветку, правки на сайте не появятся: проверьте в GitHub «Settings → Pages → Build and deployment → Branch».'),
            pub.pagesMismatch ? AD.alertBox('err', h('b', {}, 'Ветка публикации не совпадает с веткой сайта. '), 'На сервере указано, что GitHub Pages собирается из «' + pub.pagesBranch + '», а публикация идёт в «' + pub.branch + '». Переключите ветку на сервере (git checkout ' + pub.pagesBranch + ') или поправьте PAGES_BRANCH.') : null,
            pub.pending ? AD.alertBox('err', h('b', {}, 'Прошлая публикация не дошла до GitHub. '), 'Правки уже закоммичены (' + pub.pending.commit + ' · ' + AD.fmt(pub.pending.at) + ') и не потеряны — нажмите «Опубликовать» ещё раз, когда доступ или связь восстановятся.') : null), pub.changed ? h('div', {class: 'ed'}, h('p', {}, 'Изменённых файлов: ', h('b', {}, pub.changed)), groupsEl) : (pub.pending ? null : AD.alertBox('ok', 'Нет изменений: опубликована последняя версия.')));
          const msg = h('input', {type: 'text', id: 'pub-msg', value: 'Обновление данных сайта из админки', maxlength: '200'}), res = h('div', {}), pb = h('button', {class: 'btn primary', type: 'button', disabled: !pub.changed && !pub.pending}, 'Опубликовать на сайте');
          pb.addEventListener('click', async () => { if (!await AD.confirm('Отправить изменения (' + pub.changed + ' ' + AD.plural(pub.changed, 'файл', 'файла', 'файлов') + ') в ветку «' + pub.branch + '»? Сайт на GitHub Pages обновится через 1–2 минуты.', {ok: 'Опубликовать', danger: false})) return; await AD.busy(pb, async () => { try { const r = await AD.post('/api/publish', {message: msg.value}); res.replaceChildren(r.nothing ? AD.alertBox('info', r.message) : AD.alertBox('ok', 'Опубликовано в ветку «' + r.branch + '»: коммит ' + r.commit + (r.resent ? ' (отправлен повторно)' : ', файлов ' + r.files) + '. GitHub Pages обновится через 1–2 минуты.')); AD.toast('Опубликовано', 'ok'); await load(); } catch (e) { res.replaceChildren(AD.errBox(e)); } }); });
          s3 = h('div', {class: 'card'}, h('h2', {}, h('span', {class: 'ed-n'}, '03'), 'Опубликовать'), h('p', {class: 'muted'}, 'Изменения уйдут в ветку «' + pub.branch + '» репозитория (git push), GitHub Pages сам выложит новую версию. Если после публикации что-то пошло не так — вернуть прежний текст можно в «История и откат» и опубликовать ещё раз.'), h('div', {class: 'field', style: {marginTop: '12px'}}, h('label', {for: 'pub-msg'}, 'Комментарий к публикации (увидите в списке ниже)'), msg), h('div', {style: {marginTop: '12px'}}, pb), res);
        }
        const s4 = lg.items && lg.items.length ? h('div', {class: 'card'}, h('h2', {}, 'Последние публикации'), h('ul', {class: 'hl'}, lg.items.map(c => h('li', {}, h('span', {class: 'mono small'}, c.sha), h('span', {}, c.message.slice(0, 120)), h('span', {class: 'go muted'}, AD.fmt(c.at) + ' · ' + c.who))))) : null;
        AD.fill(box, s1, s2, s3, s4);
      }
      await load(); return {};
    }
  };

  /* ---------- история и откат ---------- */
  AD.views.history = {
    async mount(root) {
      const msg = h('div', {}), tbody = h('tbody', {}), sel = h('select', {'aria-label': 'Раздел'}), count = h('span', {class: 'muted small'});
      const colls = (await AD.get('/api/collections')).collections.filter(c => !c.name.startsWith('stella_'));
      let all = [];
      async function load() {
        const res = await Promise.all(colls.map(c => AD.get('/api/collections/' + c.name + '/history').then(r => r.items.map(i => Object.assign({coll: c.name, title: c.title}, i))).catch(() => [])));
        all = res.flat().sort((a, b) => b.at.localeCompare(a.at)); paint();
      }
      function paint() {
        const list = all.filter(x => !sel.value || x.coll === sel.value).slice(0, 150);
        tbody.replaceChildren(...list.map(x => h('tr', {}, h('td', {class: 'nowrap', dataset: {l: 'Когда'}}, AD.fmt(x.at)), h('td', {dataset: {l: 'Раздел'}}, x.title), h('td', {dataset: {l: 'Кто'}}, x.who || '—'),
          h('td', {class: 'nowrap'}, h('button', {class: 'btn sm', type: 'button', onclick: () => show(x)}, 'Что изменилось'), ' ', h('button', {class: 'btn sm', type: 'button', onclick: () => restore(x)}, 'Вернуть эту версию')))));
        count.textContent = list.length + ' из ' + all.length; if (!list.length) tbody.append(h('tr', {}, h('td', {colspan: 4, class: 'empty'}, 'Сохранённых версий пока нет: они появляются при каждом сохранении.')));
      }
      async function show(x) {
        let r; try { r = await AD.get('/api/collections/' + x.coll + '/diff?id=' + encodeURIComponent(x.id)); } catch (e) { AD.toast(e.message, 'err'); return; }
        const m = AD.modal({title: 'Версия до правки от ' + AD.fmt(x.at), cls: 'wide', body: [h('p', {class: 'muted'}, 'Раздел «' + x.title + '». Показано, чем нынешние данные отличаются от той версии: «Было» — в той версии, «Стало» — сейчас.'), diffTable(Object.assign({kind: 'json'}, r))], footer: [h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Закрыть'), h('button', {class: 'btn primary', type: 'button', onclick: () => { m.close(); restore(x); }}, 'Вернуть эту версию')]});
      }
      async function restore(x) {
        if (!await AD.confirm('Вернуть раздел «' + x.title + '» к версии до правки от ' + AD.fmt(x.at) + '? Нынешние данные сохранятся в истории — откат можно отменить.', {ok: 'Вернуть', danger: false})) return;
        try { const r = await AD.post('/api/collections/' + x.coll + '/restore', {id: x.id}); AD.toast('Версия возвращена' + (r.build ? ', сайт пересобран' : ''), 'ok'); await load(); } catch (e) { msg.replaceChildren(AD.errBox(e)); window.scrollTo({top: 0, behavior: 'smooth'}); }
      }
      sel.append(h('option', {value: ''}, 'Все разделы'), ...colls.map(c => h('option', {value: c.name}, c.title))); sel.addEventListener('change', paint);
      AD.fill(root, AD.pageHead('История и откат', 'Каждое сохранение раздела оставляет копию прежней версии. Откройте «Что изменилось», чтобы увидеть правки словами, или верните прежнее состояние.'), msg, h('div', {class: 'toolbar'}, sel, count), h('div', {class: 'tbl-wrap'}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Когда', 'Раздел', 'Кто менял', ''].map(t => h('th', {}, t)))), tbody)));
      await load(); return {};
    }
  };
})();
