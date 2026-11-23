/* Публикация изменений из админки в git (GitHub Pages): коммит от имени пользователя админки и отправка в удалённый репозиторий (здесь — локальный bare-репозиторий). */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {execFileSync} = require('child_process'), fs = require('fs'), path = require('path');
const {boot, tmp} = require('./helpers');

const git = (cwd, ...a) => execFileSync('git', a, {cwd, encoding: 'utf8', env: Object.assign({}, process.env, {GIT_AUTHOR_NAME: 'init', GIT_AUTHOR_EMAIL: 'i@x', GIT_COMMITTER_NAME: 'init', GIT_COMMITTER_EMAIL: 'i@x'})}).trim();
let S, admin, bare;

test.before(async () => {
  S = await boot({PUBLISH_GIT: '1'}); admin = await S.admin();
  bare = tmp('astreya-remote-'); git(bare, 'init', '--bare', '-b', 'main');
  git(S.root, 'init', '-b', 'main'); git(S.root, 'add', '-A'); git(S.root, 'commit', '-q', '-m', 'init'); git(S.root, 'remote', 'add', 'origin', bare); git(S.root, 'push', '-q', '-u', 'origin', 'main');
});
test.after(() => S.close());

test('статус: ветка, нет изменений', async () => {
  const r = await admin.get('/api/publish'); assert.equal(r.status, 200); assert.equal(r.json.enabled, true); assert.equal(r.json.branch, 'main'); assert.equal(r.json.changed, 0);
  const p = await admin.post('/api/publish', {}); assert.equal(p.status, 200); assert.equal(p.json.nothing, true);
});

test('правка содержимого → в статусе появляются изменённые файлы → публикация создаёт коммит и отправляет в remote', async () => {
  const cur = (await admin.get('/api/collections/brands')).json; cur.data[0].tag = 'Новый подзаголовок бренда';
  assert.equal((await admin.put('/api/collections/brands', {data: cur.data, version: cur.version})).status, 200);
  const st = (await admin.get('/api/publish')).json; assert.ok(st.changed >= 1); assert.ok(st.files.some(f => f.file === 'data/brands.json'));
  const before = git(bare, 'rev-parse', 'main');
  const r = await admin.post('/api/publish', {message: 'Правка бренда\nвторая строка не должна попасть в заголовок'}); assert.equal(r.status, 200, r.text); assert.match(r.json.commit, /^[0-9a-f]{7,}$/);
  const after = git(bare, 'rev-parse', 'main'); assert.notEqual(after, before, 'коммит дошёл до удалённого репозитория');
  assert.equal(git(bare, 'log', '-1', '--format=%an'), 'admin'); assert.match(git(bare, 'log', '-1', '--format=%s'), /^Правка бренда вторая строка/);
  assert.match(git(bare, 'show', 'main:data/brands.json'), /Новый подзаголовок бренда/);
  assert.equal((await admin.get('/api/publish')).json.changed, 0, 'после публикации изменений нет');
});

test('приватные данные сервера и токен в адресе не попадают в публикацию и ответ', async () => {
  fs.writeFileSync(path.join(S.root, 'server-secret.txt'), 'не должно уйти');
  const cur = (await admin.get('/api/collections/brands')).json; cur.data[1].tag = 'Ещё правка'; await admin.put('/api/collections/brands', {data: cur.data, version: cur.version});
  await admin.post('/api/publish', {}); assert.throws(() => git(bare, 'show', 'main:server-secret.txt'), 'файл вне списка публикуемых путей не коммитится');
  git(S.root, 'remote', 'set-url', 'origin', 'https://user:ghp_SECRET@example.invalid/x.git');
  const st = (await admin.get('/api/publish')).json; assert.ok(!JSON.stringify(st).includes('ghp_SECRET'), 'токен скрыт в статусе'); assert.match(st.remote, /\*\*\*@/);
});

test('сбой отправки: понятная ошибка, коммит остаётся локально, повторная публикация отправляет его', async () => {
  const cur = (await admin.get('/api/collections/brands')).json; cur.data[2].tag = 'Правка при недоступном GitHub'; await admin.put('/api/collections/brands', {data: cur.data, version: cur.version});
  const r = await admin.post('/api/publish', {}); assert.equal(r.status, 502); assert.match(r.json.error, /Не опубликовано/); assert.equal(r.json.code, 'network'); assert.match(r.json.error, /Нет связи с GitHub/); assert.ok(!r.text.includes('ghp_SECRET'), 'токен не попал в ответ');
  const st = (await admin.get('/api/publish')).json; assert.equal(st.changed, 0); assert.ok(st.pending && st.pending.commit, 'в статусе видно: коммит есть, но на GitHub не отправлен');
  git(S.root, 'remote', 'set-url', 'origin', bare);
  const before = git(bare, 'rev-parse', 'main');
  const again = await admin.post('/api/publish', {}); assert.equal(again.status, 200, again.text); assert.equal(again.json.resent, true); assert.notEqual(git(bare, 'rev-parse', 'main'), before, 'отложенный коммит дошёл до удалённого репозитория');
  assert.equal((await admin.get('/api/publish')).json.pending, null, 'после отправки отметка снята');
  assert.equal((await admin.post('/api/publish', {})).json.nothing, true);
});

test('конфликт с GitHub: ветка ушла вперёд — понятный совет, правки не теряются; в статусе видны ветка и репозиторий', async () => {
  const other = tmp('astreya-other-'); git(other, 'clone', '-q', bare, '.'); fs.writeFileSync(path.join(other, 'README-other.txt'), 'кто-то правил напрямую'); git(other, 'add', '-A'); git(other, 'commit', '-q', '-m', 'прямая правка'); git(other, 'push', '-q', 'origin', 'main');
  const cur = (await admin.get('/api/collections/brands')).json; cur.data[3].tag = 'Правка при конфликте'; await admin.put('/api/collections/brands', {data: cur.data, version: cur.version});
  const r = await admin.post('/api/publish', {}); assert.equal(r.status, 409, r.text); assert.equal(r.json.code, 'conflict'); assert.match(r.json.error, /git pull --rebase --autostash origin main/); assert.match(r.json.error, /не потеряны/);
  const st = (await admin.get('/api/publish')).json; assert.equal(st.branch, 'main'); assert.ok(st.pending, 'коммит ждёт отправки'); assert.equal(st.pagesMismatch, false);
  git(S.root, 'pull', '-q', '--rebase', '--autostash', 'origin', 'main');
  const ok = await admin.post('/api/publish', {}); assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.resent, true); assert.match(git(bare, 'show', 'main:data/brands.json'), /Правка при конфликте/);
});

test('нет прав и защищённая ветка: советы по тексту ошибки git', () => {
  const {advise} = require('../lib/publish.js');
  assert.equal(advise("remote: Permission to a/b.git denied to user.\nfatal: unable to access 'https://github.com/a/b.git/': The requested URL returned error: 403", 'main').code, 'auth');
  assert.equal(advise('fatal: Authentication failed for https://github.com/a/b.git/', 'main').code, 'auth');
  assert.equal(advise('! [remote rejected] main -> main (protected branch hook declined)\nremote: error: GH006: Protected branch update failed', 'main').code, 'protected');
  assert.equal(advise('! [rejected] main -> main (non-fast-forward)', 'main').code, 'conflict');
  assert.match(advise('fatal: unable to access x: Could not resolve host: github.com', 'main').text, /связи/);
  assert.equal(advise('странная ошибка', 'main').code, 'other');
});

test('своя страница из конструктора (pages/<адрес>.html) и 404.html попадают в публикацию', async () => {
  const cur = (await admin.get('/api/collections/pages')).json, slug = 'usloviya-publikatsii';
  const item = {slug, title: 'Условия публикации', eyebrow: 'Партнёрам', lead: 'Проверка публикации своей страницы из конструктора.', description: 'Страница для проверки того, что свои страницы из конструктора уходят в репозиторий при публикации из админки.', published: true, noindex: false, nav: false, navTitle: '', blocks: [{type: 'text', title: 'Как это работает', paragraphs: ['Первый абзац.']}]};
  const put = await admin.put('/api/collections/pages', {data: Object.assign({}, cur.data, {items: [...(cur.data.items || []), item]}), version: cur.version}); assert.equal(put.status, 200, put.text);
  assert.ok(fs.existsSync(path.join(S.root, 'pages', slug + '.html')), 'страница собрана');
  assert.ok((await admin.get('/api/publish')).json.files.some(f => f.file.startsWith('pages/')), 'pages/ видна в статусе публикации');
  const r = await admin.post('/api/publish', {message: 'Своя страница'}); assert.equal(r.status, 200, r.text);
  assert.match(git(bare, 'show', 'main:pages/' + slug + '.html'), /Условия публикации/, 'страница дошла до удалённого репозитория');
  assert.ok(git(bare, 'ls-tree', '--name-only', 'main').split('\n').includes('404.html'), '404.html лежит в репозитории');
});
