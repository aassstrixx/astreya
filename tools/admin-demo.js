/* Админка одним HTML-файлом (демо): стили и скрипты админки + «сервер» внутри страницы (tools/admin-demo-backend.js) с данными сайта.
   Открывается двойным щелчком, без Node. Правки живут в открытой вкладке и сайт не меняют; пересборка, проверка и публикация — только с настоящим сервером.
   Запуск: node tools/admin-demo.js [выходной файл]   (по умолчанию astreya-admin-demo.html в текущей папке) */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), ADMIN = path.join(ROOT, 'server', 'admin'), OUT = path.resolve(process.argv[2] || 'astreya-admin-demo.html');
process.env.SITE_ROOT = ROOT; process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'astreya-demo-'));       // библиотеки сервера используем только для чтения списка разделов и папок
const CT = require('../server/lib/content'), F = require('../server/lib/files');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS = new RegExp(String.fromCharCode(0x2029), 'g');
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1').replace(LS, '\\u2028').replace(PS, '\\u2029');

const summary = CT.summary(), data = {};
summary.forEach(c => { data[c.name] = JSON.parse(read('data', c.name + '.json')); });

/* страницы сайта: для выбора ссылок, меню и предпросмотра */
const GROUPS = [['', 'Основные'], ['pages', 'Свои страницы'], ['brands', 'Бренды'], ['products', 'Товары'], ['training', 'Мероприятия'], ['news', 'Новости']], pages = [];
const titleOf = f => { try { const m = fs.readFileSync(f, 'utf8').match(/<title>([^<]*)<\/title>/); return m ? m[1].replace(/\s*\|\s*Астрея$/, '') : path.basename(f); } catch (e) { return path.basename(f); } };
for (const [dir, label] of GROUPS) { let files = []; try { files = fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.html')).sort(); } catch (e) { continue; } files.forEach(f => pages.push({path: (dir ? dir + '/' : '') + f, title: titleOf(path.join(ROOT, dir, f)), group: label})); }

/* логотипы и фото преподавателей — чтобы миниатюры в админке были видны без сервера */
const MIME = {svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'}, assets = {};
for (const dir of ['assets/brands', 'assets/teachers', 'assets/photos', 'assets/bg']) { try { fs.readdirSync(path.join(ROOT, dir)).forEach(f => { const ext = f.split('.').pop().toLowerCase(); if (MIME[ext] && (dir !== 'assets/bg' || /-m\.webp$/.test(f))) assets['/' + dir + '/' + f] = 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(path.join(ROOT, dir, f)).toString('base64'); }); } catch (e) {} }

const blocks = `(function(){var module={exports:{}};${read('src', 'blocks-schema.js')}\nreturn module.exports;})()`;
const demo = `window.__DEMO = {data: ${JSON.stringify(data)}, summary: ${JSON.stringify(summary)}, files: ${JSON.stringify(F.list())}, pages: ${JSON.stringify(pages)}, assets: ${JSON.stringify(assets)}, blocks: ${blocks}};`;
const SCRIPTS = ['admin', 'leads', 'content', 'system', 'brandprods', 'overview', 'pages', 'design', 'preview', 'palette'];
const bootJs = `/* демо: подставляем картинки из файла и запускаем админку */
(function(){var A=window.__DEMO.assets,fix=function(r){(r.querySelectorAll?r.querySelectorAll('img[src^="/assets/"]'):[]).forEach(function(i){var s=i.getAttribute('src');if(A[s])i.src=A[s];});(r.querySelectorAll?r.querySelectorAll('[style*="/assets/"]'):[]).forEach(function(e){var m=(e.getAttribute('style')||'').match(/url\\("?(\\/assets\\/[^")]+)"?\\)/);if(m&&A[decodeURI(m[1])])e.style.backgroundImage='url("'+A[decodeURI(m[1])]+'")';});};
new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){if(n.tagName==='IMG'&&A[n.getAttribute('src')])n.src=A[n.getAttribute('src')];fix(n);}});if(m.type==='attributes'&&m.target.tagName==='IMG'&&A[m.target.getAttribute('src')])m.target.src=A[m.target.getAttribute('src')];});}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});})();
window.__DEMO_READY(AD); AD.start();`;

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Админка — Астрея (демо)</title>
<style>
${read('server', 'admin', 'admin.css')}
${read('server', 'admin', 'admin-x.css')}
.demo-bar{background:#fff3cd;color:#5c4100;padding:9px 16px;font:600 14px/1.45 system-ui,sans-serif;text-align:center;border-bottom:1px solid #e3c97a}
.demo-bar span{font-weight:500}
</style>
</head>
<body>
<div class="demo-bar">ДЕМО-ВЕРСИЯ АДМИНКИ. <span>Всё работает, но правки живут только в этой вкладке и сам сайт не меняют; пересборка, проверка и публикация доступны на настоящем сервере (<code>node server/index.js</code>).</span></div>
<div id="app"><p class="boot">Загрузка…</p></div>
<script>${safe(demo)}</script>
<script>${safe(read('tools', 'admin-demo-backend.js'))}</script>
${SCRIPTS.map(n => `<script>${safe(read('server', 'admin', n + '.js'))}</script>`).join('\n')}
<script>${safe(bootJs)}</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log('Админка-демо: ' + OUT + ' (' + (html.length / 1048576).toFixed(2) + ' МБ; разделов: ' + summary.length + ', страниц сайта: ' + pages.length + ')');
