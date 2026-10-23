#!/usr/bin/env node
/* Сторож плавности прокрутки: конструктивные причины микрофризов, найденные трассировкой. Меряет не «скорость» (она зависит от компьютера и шумит), а то, что устойчиво:
   • размытие фона (backdrop-filter) у повторяющихся элементов: на каталоге было ≈90 слоёв с размытием (по три кнопки на карточку) — браузер пересчитывал их в каждом кадре;
   • блокирующие (passive:false) слушатели прокрутки: вне экскурсии Стеллы их быть не должно (кроме инерционного колеса на компьютере) — иначе браузер ждёт главный поток на каждое касание;
   • число композиционных слоёв каталога (LayerTree): потолок и ни одного слоя «BackdropFilter»;
   • полоса чтения: запись transform не чаще нескольких раз в секунду (каждая запись заставляла заново собирать слои страницы);
   • включение «лёгкого режима»: пересчёт стилей должен быть дешёвым (раньше селектор «.reveal *» пересчитывал стили у всех потомков блоков разом);
   • подсветка «Почему Астрея» не читает геометрию списка, пока он вне экрана.
   Нужны Playwright и Chromium. Запуск: node tools/check-scroll.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('нет'); return; } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
let base = '';
const PRODUCT = fs.readdirSync(path.join(ROOT, 'products')).find(f => f.endsWith('.html'));

async function open(b, pg, o, y) {
  const ctx = await b.newContext(Object.assign({deviceScaleFactor: 1, locale: 'ru-RU', viewport: {width: 1440, height: 900}}, o || {})); await ctx.route(/^https:\/\/fonts\.|mc\.yandex|yastatic/, r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  const p = await ctx.newPage(); p.ctx = ctx; p.errs = []; p.on('pageerror', e => p.errs.push(String(e.message || e).slice(0, 200)));
  await p.goto(base + pg); await p.evaluate(() => { const s = document.getElementById('sp-in'); if (s) s.click(); });                         // «пропустить» изнутри страницы: клик средствами Playwright на время ставит свои слушатели на window
  await p.waitForSelector('html.ready', {timeout: 25000}).catch(() => {}); await wait(5500);
  if (y) { await p.evaluate(yy => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, yy); }, y); await wait(2500); }
  return p;
}
const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

(async () => {
  await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});

  console.log('\n[размытие фона у повторяющихся элементов]');
  for (const [pg, lim] of [['catalog.html', 1], ['index.html', 14], ['brands.html', 4], ['products/' + PRODUCT, 6]]) {
    const p = await open(b, pg, null, 0);
    const bf = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const c = getComputedStyle(e); return (c.backdropFilter && c.backdropFilter !== 'none') || (c.webkitBackdropFilter && c.webkitBackdropFilter !== 'none'); }).map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]));
    const cards = await p.evaluate(() => [...document.querySelectorAll('.rl-add,.cmp-add,.qv-btn')].filter(e => { const c = getComputedStyle(e); return c.backdropFilter !== 'none'; }).length);
    ok(cards === 0, pg + ': у кнопок на карточках («+», «⇄», «Быстрый просмотр») размытия фона нет', cards);
    ok(bf.length <= lim, pg + ': всего элементов с размытием фона ' + bf.length + ' (потолок ' + lim + ')', bf.slice(0, 6));
    await p.ctx.close();
  }

  console.log('\n[блокирующие слушатели прокрутки]');
  for (const [name, o, pg] of [['компьютер', {}, 'catalog.html'], ['телефон', {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2}, 'catalog.html'], ['компьютер, главная', {}, 'index.html']]) {
    const p = await open(b, pg, o, 0); const cdp = await p.ctx.newCDPSession(p); const urls = {}; cdp.on('Debugger.scriptParsed', e => { urls[e.scriptId] = e.url; }); await cdp.send('Debugger.enable');
    const lis = [];
    for (const expr of ['window', 'document', 'document.documentElement', 'document.body']) {
      const ro = (await cdp.send('Runtime.evaluate', {expression: expr})).result; if (!ro.objectId) continue;
      const {listeners} = await cdp.send('DOMDebugger.getEventListeners', {objectId: ro.objectId});
      listeners.forEach(l => { if (/^(wheel|mousewheel|touchstart|touchmove)$/.test(l.type) && l.passive === false && /\/js\//.test(urls[l.scriptId] || '')) lis.push(expr + ':' + l.type + ':' + String(urls[l.scriptId]).split('/').pop().split('?')[0] + ':' + l.lineNumber); });          // только скрипты сайта
    }
    const touch = lis.filter(x => /touch/.test(x)), wheel = lis.filter(x => /wheel/.test(x));
    ok(touch.length === 0, name + ' (' + pg + '): блокирующих слушателей touchstart/touchmove нет', touch);
    ok(wheel.length <= (o.isMobile ? 1 : 1), name + ' (' + pg + '): блокирующих слушателей колеса не больше одного — инерция колеса на компьютере (' + wheel.length + ')', wheel);
    await p.ctx.close();
  }

  console.log('\n[композиционные слои каталога]');
  { const p = await open(b, 'catalog.html', null, 3000); const cdp = await p.ctx.newCDPSession(p);
    let layers = []; cdp.on('LayerTree.layerTreeDidChange', e => { if (e.layers) layers = e.layers; }); await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable'); await wait(600); await p.mouse.move(700, 400); await p.mouse.wheel(0, 40); await wait(1000);
    let bfl = 0; for (const l of layers) { try { const r = (await cdp.send('LayerTree.compositingReasons', {layerId: l.layerId})).compositingReasonIds || []; if (r.indexOf('BackdropFilter') >= 0) bfl++; } catch (e) {} }
    ok(layers.length > 0 && layers.length <= 130, 'слоёв на каталоге: ' + layers.length + ' (потолок 130; с размытием фона на кнопках было 183)', layers.length);
    ok(bfl === 0, 'слоёв «BackdropFilter»: ' + bfl + ' (было 90)', bfl); await p.ctx.close(); }

  console.log('\n[полоса чтения]');
  { const p = await open(b, 'catalog.html', null, 1500);
    await p.evaluate(() => { window.__pw = 0; const bar = document.getElementById('progress'); new MutationObserver(m => { window.__pw += m.length; }).observe(bar, {attributes: true, attributeFilter: ['style']}); });
    await p.mouse.move(700, 400); const t0 = Date.now(); for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, 100); await wait(40); } await wait(700);
    const n = await p.evaluate(() => window.__pw), sec = (Date.now() - t0) / 1000, rate = n / sec;
    const fin = await p.evaluate(() => { const b = document.getElementById('progress'), m = document.documentElement.scrollHeight - innerHeight; return {w: new DOMMatrix(getComputedStyle(b).transform).a, e: scrollY / m}; });
    ok(rate <= 6, 'полоса чтения: ' + n + ' записей за ' + sec.toFixed(1) + ' с (' + rate.toFixed(1) + '/с, потолок 6/с; раньше — в каждом кадре, ≈60/с)', rate);
    await wait(500); const fin2 = await p.evaluate(() => { const b = document.getElementById('progress'), m = document.documentElement.scrollHeight - innerHeight; return {w: new DOMMatrix(getComputedStyle(b).transform).a, e: scrollY / m}; });
    ok(Math.abs(fin2.w - fin2.e) < 0.02, 'по окончании прокрутки полоса показывает точное значение (' + fin2.w.toFixed(3) + ' из ' + fin2.e.toFixed(3) + ')', fin2); await p.ctx.close(); }

  console.log('\n[включение «лёгкого режима»]');
  for (const [pg, y] of [['catalog.html', 3000], ['index.html', 9000]]) {
    const p = await open(b, pg, null, y);
    const t = await p.evaluate(() => { const h = document.documentElement, out = []; for (let i = 0; i < 7; i++) { h.classList.remove('lite'); void document.body.offsetHeight; const a = performance.now(); h.classList.add('lite'); void document.body.offsetHeight; out.push(performance.now() - a); } h.classList.remove('lite'); return out; });
    const med = median(t); ok(med < 15, pg + ': пересчёт стилей при включении «лёгкого режима» — ' + med.toFixed(1) + ' мс (потолок 15; со старым селектором «.reveal *» было 13…27 мс на этом же компьютере)', t.map(v => +v.toFixed(1)));
    await p.ctx.close();
  }

  console.log('\n[подсветка «Почему Астрея» вне экрана]');
  { const p = await open(b, 'index.html', null, 14000);
    await p.evaluate(() => { window.__why = 0; const o = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function () { if (this.classList && (this.classList.contains('rd-why-list') || this.classList.contains('rd-why-item'))) window.__why++; return o.apply(this, arguments); }; });
    await p.mouse.move(700, 400); for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 60); await wait(40); } await wait(500);
    const n = await p.evaluate(() => window.__why), y = await p.evaluate(() => scrollY), top = await p.evaluate(() => { const l = document.querySelector('.rd-why-list'); const r = l.getBoundingClientRect(); window.__why = 0; return {t: r.top, b: r.bottom, h: innerHeight}; });
    ok(top.b < 0 || top.t > top.h, 'на y=' + Math.round(y) + ' список «Почему Астрея» вне экрана', top);
    ok(n === 0, 'пока список вне экрана, в кадрах прокрутки его геометрия не читается (чтений: ' + n + ')', n);
    await wait(1500); await p.evaluate(() => { document.querySelector('.rd-why-list').scrollIntoView({block: 'center'}); }); await wait(1500);
    const lit = await p.evaluate(() => document.querySelectorAll('.rd-why-item.lit').length);
    ok(lit === 1, 'когда список на экране, подсвечен ровно один пункт (' + lit + ')', lit); await p.ctx.close(); }

  console.log('\n[инерция колеса на компьютере]');
  { const p = await open(b, 'catalog.html', null, 600); await p.mouse.move(700, 400);
    await p.evaluate(() => { window.__ys = []; window.__stopY = false; const t0 = performance.now(), f = t => { window.__ys.push([t - t0, scrollY]); if (!window.__stopY) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const y0 = await p.evaluate(() => scrollY); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 100); await wait(35); } await wait(1800);
    const ys = await p.evaluate(() => { window.__stopY = true; return window.__ys; }); const y1 = ys[ys.length - 1][1];
    let mono = true, maxStep = 0; for (let i = 1; i < ys.length; i++) { const d = ys[i][1] - ys[i - 1][1]; if (d < -1) mono = false; maxStep = Math.max(maxStep, d); }
    ok(Math.abs(y1 - y0 - 600) <= 2, 'шесть щелчков колеса по 100 px приводят ровно к цели: сдвиг ' + Math.round(y1 - y0) + ' px', y1 - y0);
    ok(mono && maxStep < 70, 'движение плавное: без откатов, самый большой шаг кадра ' + maxStep.toFixed(0) + ' px (без сглаживания было бы 100 px за кадр)', {mono, maxStep});
    /* программный прыжок (якорь, scrollIntoView, клавиши) во время инерции: страница остаётся там, куда прыгнули, а не отскакивает к прежней цели */
    for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 100); await wait(30); } await wait(120);
    await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 300); }); await wait(1500);
    const yj = await p.evaluate(() => scrollY); ok(Math.abs(yj - 300) <= 3, 'прыжок во время инерции колеса не откатывается к старой цели: y = ' + Math.round(yj) + ' (ожидалось 300)', yj);
    await p.mouse.wheel(0, 100); await wait(900); const yn = await p.evaluate(() => scrollY); ok(yn > 380 && yn <= 405, 'после прыжка колесо снова работает от нового места (y = ' + Math.round(yn) + ')', yn);
    ok(p.errs.length === 0, 'без ошибок JavaScript', p.errs); await p.ctx.close(); }

  await b.close(); srv.close();
  console.log('\nИтого: ✓ ' + pass + '  ✗ ' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
