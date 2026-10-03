/* Публикация изменений на GitHub Pages: git add → commit → push. Включается переменной PUBLISH_GIT=1; нужны git и права на запись в удалённый репозиторий (токен/ключ на сервере). */
'use strict';
const {execFile} = require('child_process');
const C = require('./config');
const {httpErr} = require('./auth');
const PATHS = ['data', 'assets', 'js', 'css', 'index.html', 'catalog.html', 'brands.html', 'training.html', 'news.html', 'company.html', 'contacts.html', 'partners.html', 'search.html', 'privacy.html', 'terms.html', 'brands', 'products', 'training', 'news', 'sitemap.xml', 'robots.txt'];
const scrub = s => s.replace(/\/\/[^@/\s]+@/g, '//***@');                       // токен в адресе репозитория не должен попадать в сообщения
const git = (args, env) => new Promise((res, rej) => execFile('git', args, {cwd: C.ROOT, timeout: 120000, maxBuffer: 4e6, env: Object.assign({}, process.env, env || {}, {GIT_TERMINAL_PROMPT: '0'})}, (e, out, err) => e ? rej(Object.assign(new Error(scrub((String(err) || e.message).trim().slice(-600))), {code: e.code})) : res(String(out).trim())));

async function status() {
  if (!C.PUBLISH_GIT) return {enabled: false, hint: 'Публикация через git выключена. Включите PUBLISH_GIT=1 на сервере (нужны git и доступ на запись в репозиторий).'};
  try {
    const [branch, remote, porcelain] = await Promise.all([git(['rev-parse', '--abbrev-ref', 'HEAD']), git(['remote', 'get-url', 'origin']).catch(() => ''), git(['status', '--porcelain', '--', ...PATHS])]);
    const files = porcelain ? porcelain.split('\n').map(l => ({state: l.slice(0, 2).trim(), file: l.slice(3)})) : [];
    return {enabled: true, branch, remote: remote.replace(/\/\/[^@/]+@/, '//***@'), changed: files.length, files: files.slice(0, 200)};
  } catch (e) { return {enabled: true, error: 'git: ' + e.message}; }
}
async function publish(message, who) {
  if (!C.PUBLISH_GIT) throw httpErr(501, 'Публикация через git выключена (PUBLISH_GIT=1).');
  const st = await status(); if (st.error) throw httpErr(500, st.error);
  if (!st.changed) return {ok: true, nothing: true, message: 'Нет изменений для публикации.'};
  const msg = String(message || 'Обновление данных сайта из админки').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const author = {GIT_AUTHOR_NAME: who || 'Админка сайта', GIT_AUTHOR_EMAIL: C.env.GIT_AUTHOR_EMAIL || 'admin@localhost', GIT_COMMITTER_NAME: who || 'Админка сайта', GIT_COMMITTER_EMAIL: C.env.GIT_AUTHOR_EMAIL || 'admin@localhost'};
  try {
    await git(['add', '--', ...PATHS.filter(p => require('fs').existsSync(require('path').join(C.ROOT, p)))]);
    await git(['commit', '-m', msg + '\n\nОпубликовано из админки сайта.'], author);
    const sha = await git(['rev-parse', '--short', 'HEAD']);
    await git(['push', 'origin', 'HEAD']);
    return {ok: true, commit: sha, branch: st.branch, files: st.changed};
  } catch (e) { throw httpErr(502, 'Не удалось опубликовать: ' + e.message); }
}
module.exports = {status, publish};
