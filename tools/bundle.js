/* Автономная сборка: один HTML-фрагмент со всеми страницами и роутером (см. src/bundle-router.js).
   Вызывается из tools/build.js: node tools/build.js --bundle=/путь/к/файлу.html */
const fs = require('fs');
const path = require('path');

module.exports = function bundle({pages, layout, root, out}) {
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const home = pages.find(p => p.path === 'index.html').html;
  const body = home.slice(home.indexOf('<body'), home.lastIndexOf('</body>'));
  let chrome = body.replace(/^<body[^>]*>\n?/, '')
    .replace(/<script src="[^"]+" defer><\/script>\n?/g, '')
    .replace(/<link rel="stylesheet"[^>]*>\n?/g, '');
  const dataPages = {};
  for (const p of pages) {
    const m = p.html.match(/<main id="main"[^>]*>\n([\s\S]*?)\n<\/main>/);
    const t = p.html.match(/<title>([^<]*)<\/title>/)[1];
    dataPages[p.path] = {key: p.P.key, nav: p.P.nav || '', title: t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), main: m[1]};
  }
  const css = ['base', 'components', 'pages', 'responsive', 'motion'].map(n => read(`css/${n}.css`)).join('\n');
  const js = ['shared', 'data', 'core', 'motion', 'pages', 'hero-mark'].map(n => read(`js/${n}.js`)).join('\n;\n') + '\n;\n' + read('src/bundle-router.js');
  const fonts = home.match(/<script>\(function\(\)\{var l=document\.createElement\('link'\);[\s\S]*?<\/script>/)[0];
  const early = home.match(/<script>\(function\(d\)\{var h=d\.documentElement;[\s\S]*?<\/script>/)[0];
  const json = JSON.stringify(dataPages).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  chrome = chrome.replace(/(<p class="ftr-note">)[^<]*(<\/p>)/, '$1Прототип сайта. Ассортимент, расписание, новости и пороги скидок — демонстрационные данные (placeholder); не является официальным сайтом ООО «Астрея».$2');
  const html = `<title>Астрея</title>\n${early}\n${fonts}\n<style>\n${css}\n</style>\n${chrome}\n<script id="astreya-pages" type="application/json">${json}</script>\n<script>\n${js.replace(/<\/script>/g, '<\\/script>')}\n</script>\n`;
  fs.writeFileSync(out, html);
  console.log(`Автономная сборка: ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ, страниц: ${pages.length})`);
};
