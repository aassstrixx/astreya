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

test('сбой отправки: понятная ошибка, коммит остаётся локально, повторная публикация возможна', async () => {
  const cur = (await admin.get('/api/collections/brands')).json; cur.data[2].tag = 'Правка при недоступном GitHub'; await admin.put('/api/collections/brands', {data: cur.data, version: cur.version});
  const r = await admin.post('/api/publish', {}); assert.equal(r.status, 502); assert.match(r.json.error, /Не удалось опубликовать/); assert.ok(!r.text.includes('ghp_SECRET'), 'токен не попал в сообщение об ошибке');
  git(S.root, 'remote', 'set-url', 'origin', bare);
  const again = await admin.post('/api/publish', {}); assert.equal(again.status, 200, again.text);   // нет новых изменений, но локальный коммит нужно отправить
});
