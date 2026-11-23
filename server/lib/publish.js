/* Публикация изменений на GitHub Pages: git add → commit → push. Включается переменной PUBLISH_GIT=1; нужны git и права на запись в удалённый репозиторий (токен/ключ на сервере). */
'use strict';
const {execFile} = require('child_process');
const C = require('./config');
const {httpErr} = require('./auth');
const PATHS = ['data', 'assets', 'js', 'css', 'index.html', 'catalog.html', 'brands.html', 'training.html', 'news.html', 'company.html', 'contacts.html', 'partners.html', 'start.html', 'search.html', 'privacy.html', 'consent.html', 'terms.html', '404.html', 'brands', 'products', 'training', 'news', 'pages', 'sitemap.xml', 'robots.txt', 'build.json', '.well-known', 'llms.txt', 'manifest.webmanifest'];   // pages/ — свои страницы из конструктора; без них на GitHub Pages они не появились бы
const scrub = s => s.replace(/\/\/[^@/\s]+@/g, '//***@');                       // токен в адресе репозитория не должен попадать в сообщения
const git = (args, env) => new Promise((res, rej) => execFile('git', args, {cwd: C.ROOT, timeout: 120000, maxBuffer: 4e6, env: Object.assign({}, process.env, env || {}, {GIT_TERMINAL_PROMPT: '0'})}, (e, out, err) => e ? rej(Object.assign(new Error(scrub((String(err) || e.message).trim().slice(-600))), {code: e.code})) : res(String(out).trim())));

const FS = require('fs'), PTH = require('path');
const pendingFile = () => PTH.join(C.DATA, 'publish-pending.json');
const readPending = () => { try { return JSON.parse(FS.readFileSync(pendingFile(), 'utf8')); } catch (e) { return null; } };
const repoOf = remote => (String(remote).match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i) || [])[1] || '';
/* понятный совет по тексту ошибки git: что случилось и что делать (без токенов — scrub уже убрал их из текста) */
function advise(raw, branch) {
  const m = String(raw);
  if (/non-fast-forward|fetch first|tip of your current branch is behind|updates were rejected|stale info/i.test(m))
    return {code: 'conflict', text: `Конфликт: в ветке «${branch}» на GitHub уже есть более новые изменения (кто-то публиковал или правил файлы напрямую). Ваши правки не потеряны: они сохранены и закоммичены на сервере. Что делать: на сервере выполните «git pull --rebase --autostash origin ${branch}» (при вопросах по конфликту — позовите разработчика), затем нажмите «Опубликовать» ещё раз.`};
  if (/protected branch|GH006|GH013|required status check|review is required|Changes must be made through a pull request/i.test(m))
    return {code: 'protected', text: `Ветка «${branch}» защищена правилами GitHub: прямая отправка запрещена. Что делать: в GitHub откройте Settings → Branches и разрешите отправку для этого пользователя/токена (или публикуйте в другую ветку и объедините pull request-ом). Правки сохранены и закоммичены на сервере.`};
  if (/Could not resolve host|Failed to connect|Connection (?:timed out|refused|reset)|Network is unreachable|Operation timed out|timed out|CONNECT tunnel failed|RPC failed|early EOF|SSL (?:connect|certificate)/i.test(m))
    return {code: 'network', text: 'Нет связи с GitHub (сеть, прокси или сервис недоступен). Правки сохранены и закоммичены на сервере — нажмите «Опубликовать» ещё раз, когда связь появится.'};
  if (/Authentication failed|could not read Username|could not read Password|Invalid username or password|Permission denied|publickey|403|401|Write access to repository not granted|denied to|not allowed to|Repository not found|requested URL returned error: (?:401|403|404)/i.test(m))
    return {code: 'auth', text: `Нет прав на запись в репозиторий. Что делать: проверьте токен или ключ доступа, которым сервер отправляет изменения в GitHub: он не должен быть просрочен и должен иметь право на запись в этот репозиторий (токен: «Contents — Read and write»; ключ: «Allow write access»). Правки сохранены и закоммичены на сервере — после исправления доступа просто нажмите «Опубликовать» ещё раз.`};
  if (/does not appear to be a git repository|No configured push destination|No such remote|no upstream/i.test(m))
    return {code: 'remote', text: 'У репозитория на сервере не настроен адрес GitHub («origin»). Что делать: выполните «git remote add origin <адрес репозитория>» и повторите публикацию.'};
  return {code: 'other', text: 'git вернул ошибку. Правки сохранены и закоммичены на сервере; повторите публикацию, а если ошибка остаётся — покажите текст ниже разработчику.'};
}
const short = m => String(m).replace(/\s+/g, ' ').trim().slice(0, 300);

async function status() {
  if (!C.PUBLISH_GIT) return {enabled: false, hint: 'Публикация через git выключена. Включите PUBLISH_GIT=1 на сервере (нужны git и доступ на запись в репозиторий).'};
  try {
    const [branch, remote, porcelain] = await Promise.all([git(['rev-parse', '--abbrev-ref', 'HEAD']), git(['remote', 'get-url', 'origin']).catch(() => ''), git(['status', '--porcelain', '--', ...PATHS])]);
    const files = porcelain ? porcelain.split('\n').map(l => { const m = l.match(/^\s*(\S{1,2})\s+(.+)$/); return m ? {state: m[1], file: m[2].replace(/^"(.*)"$/, '$1')} : null; }).filter(Boolean) : [];          // git() обрезает пробелы: у первой строки « M файл» пропадает ведущий пробел
    const pend = readPending(), pagesBranch = String(C.env.PAGES_BRANCH || '').trim() || null;
    return {enabled: true, branch, remote: remote.replace(/\/\/[^@/]+@/, '//***@'), repo: repoOf(remote), changed: files.length, files: files.slice(0, 200),
      pending: pend ? {commit: pend.commit, at: pend.at} : null,                                                  // коммит уже сделан, но на GitHub не отправился
      pagesBranch, pagesMismatch: !!(pagesBranch && pagesBranch !== branch), detached: branch === 'HEAD'};
  } catch (e) { return {enabled: true, error: 'git: ' + e.message}; }
}
async function publish(message, who) {
  if (!C.PUBLISH_GIT) throw httpErr(501, 'Публикация через git выключена (PUBLISH_GIT=1).');
  const st = await status(); if (st.error) throw httpErr(500, st.error);
  if (st.detached) throw httpErr(409, 'Репозиторий на сервере не стоит ни на какой ветке («отсоединённый HEAD»), поэтому публиковать некуда. Что делать: выполните «git checkout <ветка, из которой собирается сайт>» и повторите.');
  if (!st.changed && !st.pending) return {ok: true, nothing: true, message: 'Нет изменений для публикации.'};
  const author = {GIT_AUTHOR_NAME: who || 'Админка сайта', GIT_AUTHOR_EMAIL: C.env.GIT_AUTHOR_EMAIL || 'admin@localhost', GIT_COMMITTER_NAME: who || 'Админка сайта', GIT_COMMITTER_EMAIL: C.env.GIT_AUTHOR_EMAIL || 'admin@localhost'};
  let sha = st.pending ? st.pending.commit : null;
  if (st.changed) {
    const msg = String(message || 'Обновление данных сайта из админки').replace(/[\r\n]+/g, ' ').slice(0, 200);
    try {
      await git(['add', '--', ...PATHS.filter(p => FS.existsSync(PTH.join(C.ROOT, p)))]);
      await git(['commit', '-m', msg + '\n\nОпубликовано из админки сайта.'], author);
      sha = await git(['rev-parse', '--short', 'HEAD']);
      try { FS.mkdirSync(C.DATA, {recursive: true}); FS.writeFileSync(pendingFile(), JSON.stringify({commit: sha, at: new Date().toISOString()})); } catch (e) {}
    } catch (e) { throw httpErr(502, 'Не удалось подготовить коммит: ' + short(e.message) + '. Файлы на сайте не потеряны; обратитесь к разработчику.', {code: 'commit'}); }
  }
  try {
    await git(['push', 'origin', 'HEAD']);
    try { FS.unlinkSync(pendingFile()); } catch (e) {}
    return {ok: true, commit: sha, branch: st.branch, repo: st.repo, files: st.changed, resent: !st.changed};
  } catch (e) {
    const a = advise(e.message, st.branch);
    throw httpErr(a.code === 'conflict' ? 409 : 502, `Не опубликовано: ${a.text} (git: ${short(e.message)})`, {code: a.code, commit: sha});
  }
}
/* что изменилось в одном файле данных относительно последней публикации (HEAD): читаемый список правок */
async function diffFile(file) {
  const fs = require('fs'), path = require('path'), JD = require('./jsondiff');
  if (!/^data\/[\w\-/]+\.json$/.test(String(file))) return {kind: 'file', note: 'Для этого файла показывается только факт изменения.'};
  let head = null; try { head = JSON.parse(await git(['show', 'HEAD:' + file])); } catch (e) { head = null; }
  let now = null; try { now = JSON.parse(fs.readFileSync(path.join(C.ROOT, file), 'utf8')); } catch (e) { return {kind: 'file', note: 'Файл удалён или не читается.'}; }
  if (head === null) return {kind: 'new', note: 'Новый файл (в последней публикации его не было).'};
  const r = JD.diff(head, now);
  if (file === 'data/texts.json') { try { const TX = require(path.join(C.ROOT, 'src', 'texts.js')); r.changes.forEach(c => { const k = String(c.path).replace(/^items › /, ''), d = TX.index[k]; if (d) { const pg = TX.registry.pages.find(x => x.id === d.page), bl = pg && pg.blocks.find(x => x.id === d.block); c.path = [pg ? pg.title : d.page, bl ? bl.title : d.block, d.label].join(' › '); } }); } catch (e) { /* без подписей — остаются ключи */ } }
  return Object.assign({kind: 'json'}, r);
}
/* последние публикации (коммиты) — для истории */
async function log(n) {
  if (!C.PUBLISH_GIT) return {enabled: false, items: []};
  try { const out = await git(['log', '-n', String(Math.min(+n || 15, 50)), '--pretty=format:%h\t%an\t%aI\t%s']); return {enabled: true, items: out ? out.split('\n').map(l => { const [sha, who, at, ...msg] = l.split('\t'); return {sha, who, at, message: msg.join(' ')}; }) : []}; }
  catch (e) { return {enabled: true, items: [], error: e.message}; }
}
module.exports = {status, publish, diffFile, log, advise};
