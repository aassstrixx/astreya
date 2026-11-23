/* Админка одним HTML-файлом (демо): стили, шрифты, скрипты админки и «сервер» внутри страницы (tools/admin-demo-backend.js) с настоящими данными сайта.
   Открывается двойным щелчком (file://), без Node и без интернета. Правки живут в открытой вкладке и сайт не меняют; пересборка, проверка, публикация, заявки, копии данных,
   двухфакторный вход и вызовы внешних сервисов — только с настоящим сервером (node server/index.js): в демо на них честный ответ «в демо недоступно».
   Как это собирается: настоящий сервер запускается внутри этого же процесса на пустых данных, у него снимаются ответы на все запросы админки (те же, что увидит человек) —
   поэтому демо не отстаёт от админки; изменяющие запросы в файле обрабатывает демо-«сервер».
   Запуск: node tools/admin-demo.js [выходной файл]   (по умолчанию astreya-admin-demo.html в текущей папке)   или   npm run admin:demo */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..'), ADMIN = path.join(ROOT, 'server', 'admin'), OUT = path.resolve(process.argv[2] || 'astreya-admin-demo.html');
const PASS = 'Demo-fixture-' + Math.random().toString(36).slice(2) + '-2026';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'astreya-demo-'));
Object.assign(process.env, {SITE_ROOT: ROOT, DATA_DIR: TMP, ADMIN_LOGIN: 'admin', ADMIN_PASSWORD: PASS, TRUST_PROXY: '1', ALLOW_PRIVATE_NETWORK: '1'});
http.globalAgent = new http.Agent({keepAlive: false});
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS = new RegExp(String.fromCharCode(0x2029), 'g');
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1').replace(LS, '\\u2028').replace(PS, '\\u2029');
const MIME = {svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', woff2: 'font/woff2'};
const dataUri = f => 'data:' + MIME[f.split('.').pop().toLowerCase()] + ';base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');

/* порядок скриптов — как в server/admin/index.html */
const SCRIPTS = [...read('server', 'admin', 'index.html').matchAll(/<script src="([\w-]+)\.js"><\/script>/g)].map(m => m[1]);

/* ---------- снимок ответов настоящего сервера ---------- */
const STATIC_GET = ['/api/config', '/api/me', '/api/overview', '/api/launch', '/api/security', '/api/backups', '/api/integrations', '/api/privacy/registry', '/api/settings', '/api/audit?limit=100', '/api/users', '/api/sessions', '/api/2fa', '/api/assistant/info', '/api/texts/registry', '/api/texts/data', '/api/news/layout', '/api/files/overview', '/api/site-pages', '/api/collections', '/api/build', '/api/publish'];
async function snapshot() {
  const {client} = require('../server/test/helpers.js');
  const app = require('../server/index'), srv = await app.start(0, '127.0.0.1'), port = srv.address().port, c = client(port, '10.9.9.9');
  try {
    const lg = await c.login('admin', PASS); if (lg.status !== 200) throw new Error('вход в локальный сервер не удался: ' + lg.status);
    const fx = {}, get = async u => { const r = await c.get(u); if (r.status !== 200) throw new Error(u + ' → ' + r.status + ' ' + r.text.slice(0, 120)); return r.json; };
    for (const u of STATIC_GET) fx[u] = await get(u);
    fx.collections = {}; for (const col of fx['/api/collections'].collections) fx.collections[col.name] = await get('/api/collections/' + col.name);
    return fx;
  } finally { await new Promise(r => srv.close(r)); }
}
/* в снимке не должно остаться ничего, что относится к этому компьютеру: адреса, пути, пароль генератора */
function scrub(fx) {
  let s = JSON.stringify(fx);
  s = s.split(ROOT).join('/site').split(TMP).join('/data').split(PASS).join('***').replace(/http:\/\/127\.0\.0\.1:\d+/g, 'https://demo.local').replace(/\b10\.9\.9\.9\b/g, '203.0.113.7');
  return JSON.parse(s);
}

/* ---------- картинки, нужные админке: упаковки, фото, логотипы, миниатюры сцен (в файл кладём только их — остальное показывается рамкой) ---------- */
function collectAssets(fx) {
  const out = {}, add = f => { if (!out['/' + f] && fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size < 400e3) out['/' + f] = dataUri(f); };
  const ls = d => { try { return fs.readdirSync(path.join(ROOT, d)); } catch (e) { return []; } };
  ls('assets/showroom').filter(f => /^pack-.*\.webp$/.test(f)).forEach(f => add('assets/showroom/' + f));
  for (const d of ['assets/photos', 'assets/teachers']) ls(d).filter(f => /\.(webp|png|jpe?g)$/i.test(f)).forEach(f => add(d + '/' + f));
  ls('assets/brands').filter(f => /\.(svg|png)$/i.test(f)).forEach(f => add('assets/brands/' + f));
  ls('assets/bg').filter(f => /-t\.webp$|\.svg$/.test(f)).forEach(f => add('assets/bg/' + f));
  add('assets/favicon.svg'); add('assets/showroom/pg-travertine.webp');
  /* всё, что выбрано в данных как картинка (фото товаров, обложки новостей и т. д.), если файл небольшой */
  JSON.stringify(fx.collections).replace(/assets\/[\w\-./]+\.(?:webp|png|jpe?g|svg|gif)/gi, m => { add(m); return m; });
  return out;
}

/* ---------- шрифты: только кириллица и латиница Playfair Display (прямой и курсив) и Manrope, остальное — запасные системные ---------- */
function fontsCss() {
  const css = read('css', 'fonts.css'), out = [];
  for (const m of css.matchAll(/@font-face\{[^}]*\}/g)) {
    const b = m[0], f = (b.match(/url\(\.\.\/(assets\/fonts\/[\w.-]+\.woff2)\)/) || [])[1];
    if (f && /^(playfair-display(-italic)?-(cyrillic|latin)|manrope-(cyrillic|latin))-[0-9a-f]+\.woff2$/.test(path.basename(f))) out.push(b.replace(/url\(\.\.\/assets\/fonts\/[\w.-]+\.woff2\)/, 'url(' + dataUri(f) + ')'));
  }
  return out.join('\n');
}

/* ---------- мини-«require» для кода сервера, который работает и в браузере (реестр текстов, сравнение версий, тексты из данных) ---------- */
function moduleBundle() {
  const ids = ['src/texts.js', 'src/texts-registry.js', 'server/lib/jsondiff.js', 'server/lib/datatexts.js', 'src/blocks-schema.js', ...fs.readdirSync(path.join(ROOT, 'src', 'texts')).map(f => 'src/texts/' + f)];
  const src = Object.fromEntries(ids.map(i => [i, read(...i.split('/'))]));
  return `(function(){var S=${JSON.stringify(src)},C={},ST={};
function norm(p){var o=[];p.split('/').forEach(function(s){if(s==='..')o.pop();else if(s&&s!=='.')o.push(s);});return o.join('/');}
function load(id){if(C[id])return C[id].exports;if(!(id in S))throw new Error('нет модуля '+id);var m={exports:{}};C[id]=m;new Function('module','exports','require',S[id])(m,m.exports,function(n){return req(id,n);});return m.exports;}
function req(from,n){if(n in ST)return ST[n];if(n.charAt(0)==='.'){var id=norm(from.replace(/[^/]*$/,'')+n);if(!(id in S)&&(id+'.js') in S)id+='.js';return load(id);}if(n in ST)return ST[n];throw new Error('в демо нет модуля '+n);}
window.__demoRequire=function(id){return load(id);};window.__demoStubs=ST;})();`;
}

(async () => {
  const fx = scrub(await snapshot());
  const collections = fx.collections; delete fx.collections;
  const summary = fx['/api/collections'].collections;
  const assets = collectAssets({collections});
  const files = {'/assets/showroom/packs.json': read('assets', 'showroom', 'packs.json')};
  const demo = `window.__DEMO = ${JSON.stringify({fx, collections, assets, files})};`;
  const bootJs = `/* демо: картинки берём из файла, чужие (не вошедшие в файл) показываем рамкой; запускаем админку */
(function(){var A=window.__DEMO.assets,PH='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect width="80" height="60" fill="#e8e1d2"/><path d="M14 44l14-16 10 11 8-8 20 13z" fill="#cfc4ad"/><circle cx="56" cy="19" r="5" fill="#cfc4ad"/></svg>');
function one(i){var s=i.getAttribute&&i.getAttribute('src');if(!s||s.charAt(0)!=='/'||s.indexOf('/assets/')!==0)return;var k=s.split('?')[0];i.src=A[k]||PH;}
function fix(r){if(!r||!r.querySelectorAll)return;if(r.tagName==='IMG')one(r);r.querySelectorAll('img[src^="/assets/"]').forEach(one);r.querySelectorAll('[style*="/assets/"]').forEach(function(e){e.setAttribute('style',e.getAttribute('style').replace(/url\\(["']?(\\/assets\\/[^)"']+)["']?\\)/g,function(m,u){var k=u.split('?')[0];return 'url('+(A[k]||PH)+')';}));});}
new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes'){if(m.target.tagName==='IMG')one(m.target);else fix(m.target);}m.addedNodes.forEach(function(n){if(n.nodeType===1)fix(n);});});}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','style']});
/* ссылки вида /contacts.html открывают настоящий сайт, ссылки на скачивание файлов с сервера — недоступны */
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="/"]');if(!a)return;var h=a.getAttribute('href');e.preventDefault();e.stopPropagation();
if(/^\\/api\\//.test(h)){AD.toast('В демо недоступно: скачивание файлов с сервера. Это работает только в настоящей админке.','err');return;}
var base=(AD.config&&AD.config.siteUrl)||'';if(base)window.open(base.replace(/\\/?$/,'/')+h.replace(/^\\//,''),'_blank','noopener');else AD.toast('Адрес сайта в демо не задан.','err');},true);
window.__DEMO_READY(AD); AD.start();})();`;
  let css = read('server', 'admin', 'admin.css') + '\n' + read('server', 'admin', 'admin-x.css');
  css = css.replace('url(/assets/showroom/pg-travertine.webp)', 'url(' + (assets['/assets/showroom/pg-travertine.webp'] || '') + ')');
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Админка — Астрея (демо)</title>
<link rel="icon" href="${assets['/assets/favicon.svg'] || ''}" type="image/svg+xml">
<style>
${fontsCss()}
${css}
.demo-bar{background:#fff3cd;color:#5c4100;padding:8px 16px;font:600 13.5px/1.45 system-ui,sans-serif;text-align:center;border-bottom:1px solid #e3c97a;position:relative;z-index:80}
.demo-bar span{font-weight:500}
</style>
</head>
<body>
<div class="demo-bar">ДЕМО-ВЕРСИЯ АДМИНКИ. <span>Данные настоящие, формы работают, но правки живут только в этой вкладке (после обновления страницы вернутся исходные) и сайт не меняют. Пересборка, публикация, заявки и копии данных — только в настоящей админке (<code>node server/index.js</code>).</span></div>
<div id="app"><p class="boot">Загрузка…</p></div>
<script>${safe(demo)}</script>
<script>${safe(moduleBundle())}</script>
<script>${safe(read('tools', 'admin-demo-backend.js'))}</script>
${SCRIPTS.map(n => `<script>${safe(read('server', 'admin', n + '.js'))}</script>`).join('\n')}
<script>${safe(bootJs)}</script>
</body>
</html>
`;
  fs.writeFileSync(OUT, html);
  const leak = [ROOT, TMP, PASS, '127.0.0.1'].filter(x => html.includes(x));
  if (leak.length) { fs.unlinkSync(OUT); throw new Error('в файл попали данные этого компьютера: ' + leak.join(', ')); }
  console.log('Админка-демо: ' + OUT + ' (' + (Buffer.byteLength(html) / 1048576).toFixed(2) + ' МБ; разделов: ' + summary.length + ', картинок в файле: ' + Object.keys(assets).length + ', скриптов: ' + SCRIPTS.length + ')');
})().catch(e => { console.error('Не удалось собрать демо: ' + (e.stack || e)); process.exitCode = 1; }).finally(() => { try { fs.rmSync(TMP, {recursive: true, force: true}); } catch (e) {} setTimeout(() => process.exit(process.exitCode || 0), 50); });
