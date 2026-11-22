// проверка кэша: первый заход, второй заход (перезагрузка), переход на другую страницу — сколько запросов дошло до сервера
const {chromium} = require('playwright');
(async () => {
  const BASE = 'http://localhost:8832', b = await chromium.launch(); const ctx = await b.newContext({ignoreHTTPSErrors: true, viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  const hits = async () => (await ctx.request.get(BASE + '/__count')).json(), reset = () => ctx.request.get(BASE + '/__reset');
  await reset(); await p.goto(BASE + '/index.html?sw=1', {waitUntil: 'load'});
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, {timeout: 20000}).catch(() => console.log('SW не взял управление'));
  await p.waitForTimeout(16000);
  let h = await hits(); console.log('1-й заход: до сервера дошло запросов', h.n, ' МБ', (h.b / 1048576).toFixed(1));
  await reset(); await p.reload({waitUntil: 'load'}); await p.waitForTimeout(8000);
  h = await hits(); console.log('2-й заход (перезагрузка): запросов', h.n, ' МБ', (h.b / 1048576).toFixed(2), h.list.slice(0, 8).join(' '));
  await reset(); await p.goto(BASE + '/catalog.html?sw=1', {waitUntil: 'load'}); await p.waitForTimeout(3000);
  h = await hits(); console.log('переход на каталог: запросов', h.n, ' МБ', (h.b / 1048576).toFixed(2));
  await reset(); await p.goto(BASE + '/index.html?sw=1', {waitUntil: 'load'}); await p.waitForTimeout(6000);
  h = await hits(); console.log('возврат на главную: запросов', h.n, ' МБ', (h.b / 1048576).toFixed(2));
  await b.close();
})();
