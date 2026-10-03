/* Автономная сборка: один HTML-фрагмент со всеми страницами и роутером (см. src/bundle-router.js).
   Вызывается из tools/build.js: node tools/build.js --bundle=/путь/к/файлу.html */
const fs = require('fs');
const path = require('path');

module.exports = function bundle({pages, ctx, layout, root, out}) {
  const rd = !!(ctx && ctx.site && ctx.site.redesign);
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const home = pages.find(p => p.path === 'index.html').html;
  const body = home.slice(home.indexOf('<body'), home.lastIndexOf('</body>'));
  let chrome = body.replace(/^<body[^>]*>\n?/, '')
    .replace(/<script src="[^"]+" defer><\/script>\n?/g, '')
    .replace(/<link rel="stylesheet"[^>]*>\n?/g, '');
  /* картинки логотипов: в одном файле нет обычных путей, поэтому кладём их в отдельный JSON (data: URI, по одному разу) и подставляем роутером */
  const assets = {};
  const inline = html => html.replace(/src="(?:\.\.\/)*(assets\/(?:brands|photos|teachers)\/[\w.-]+)(?:\?v=\w+)?"/g, (m, f) => {
    if (!assets[f]) assets[f] = 'data:image/' + (f.endsWith('.svg') ? 'svg+xml' : f.split('.').pop()) + ';base64,' + fs.readFileSync(path.join(root, f)).toString('base64');
    return `data-asset="${f}"`;
  });
  chrome = inline(chrome);
  /* вступление с баночкой: в одном файле кадры берутся из data:-адресов — кладём облегчённые наборы (assets/jar/*-lite) в тот же JSON */
  const jar = rd && ctx.redesign && ctx.redesign.jar && ctx.redesign.jar.enabled ? ctx.redesign.jar : null;
  if (jar) for (const dir of [jar.lite.desktop, jar.lite.mobile, ...(jar.flow ? [jar.flow.lite.desktop, jar.flow.lite.mobile] : [])]) {      // + облегчённые карты потока
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) fs.readdirSync(abs).filter(f => /\.webp$/.test(f)).sort().forEach(f => { assets[dir + f] = 'data:image/webp;base64,' + fs.readFileSync(path.join(abs, f)).toString('base64'); });
  }
  const dataPages = {};
  for (const p of pages) {
    const m = p.html.match(/<main id="main"[^>]*>\n([\s\S]*?)\n<\/main>/);
    const t = p.html.match(/<title>([^<]*)<\/title>/)[1];
    dataPages[p.path] = {key: p.P.key, nav: p.P.nav || '', title: t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), main: inline(m[1])};
  }
  const css = ['base', 'components', 'pages', 'responsive', 'motion', ...(rd ? ['redesign'] : []), ...(rd && ctx.redesign.jar && ctx.redesign.jar.enabled ? ['jar'] : [])].map(n => read(`css/${n}.css`)).join('\n');
  const js = 'window.__ASTREYA_BUNDLE = true;\n' + (rd ? "document.body.classList.add('rd');   /* тег <body> в автономной сборке не сохраняется, а правила слоя доработок привязаны к body.rd */\n" : '') + ['shared', 'data', 'core', 'motion', 'pages', 'hero-mark', ...(rd ? ['redesign'] : []), ...(rd && ctx.redesign.jar && ctx.redesign.jar.enabled ? ['jar'] : [])].map(n => read(`js/${n}.js`)).join('\n;\n') + '\n;\n' + read('src/bundle-router.js');
  const fonts = home.match(/<script>\(function\(\)\{var l=document\.createElement\('link'\);[\s\S]*?<\/script>/)[0];
  const early = home.match(/<script>\(function\(d\)\{var h=d\.documentElement;[\s\S]*?<\/script>/)[0];
  const json = JSON.stringify(dataPages).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  chrome = chrome.replace(/(<p class="ftr-note">)[^<]*(<\/p>)/, '$1Прототип сайта. Ассортимент, расписание, новости и пороги скидок — демонстрационные данные (placeholder); не является официальным сайтом ООО «Астрея».$2');
  const assetsJson = JSON.stringify(assets).replace(/</g, '\\u003c');
  const html = `<title>Астрея</title>\n${early}\n${fonts}\n<style>\n${css}\n</style>\n${chrome}\n<script id="astreya-pages" type="application/json">${json}</script>\n<script id="astreya-assets" type="application/json">${assetsJson}</script>\n<script>\n${js.replace(/<\/script>/g, '<\\/script>')}\n</script>\n`;
  fs.writeFileSync(out, html);
  console.log(`Автономная сборка: ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ, страниц: ${pages.length})`);
};
