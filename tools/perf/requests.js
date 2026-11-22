const {chromium} = require('playwright');
(async () => {
  const mode = process.argv[2] || 'mobile', path = process.argv[3] || 'index.html', wait = +(process.argv[4] || 4000);
  const b = await chromium.launch();
  const ctx = await b.newContext(mode === 'mobile' ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true} : {ignoreHTTPSErrors: true, viewport: {width: 1440, height: 900}});
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  const reqs = [];
  p.on('requestfinished', async r => { try { const sz = await r.sizes(); reqs.push({u: r.url().replace(/^https?:\/\/localhost:\d+\//, '').split('?')[0], b: sz.responseBodySize, t: r.resourceType()}); } catch (e) {} });
  await p.goto((process.env.BASE || 'http://localhost:8830') + '/' + path, {waitUntil: 'load'}); await p.waitForTimeout(wait);
  const g = {}; reqs.forEach(r => { const k = r.u.replace(/\/\d+\.webp$/, '/*.webp').replace(/\.(js|css)$/, '.$1'); const d = k.startsWith('assets/') ? k.split('/').slice(0, 3).join('/') + (k.endsWith('*.webp') ? '/*' : '') : k; g[d] = g[d] || [0, 0]; g[d][0]++; g[d][1] += r.b; });
  Object.entries(g).sort((a, b) => b[1][1] - a[1][1]).slice(0, 40).forEach(([k, v]) => console.log(String(v[0]).padStart(4), (v[1] / 1024).toFixed(0).padStart(7), 'КБ', k));
  console.log('ИТОГО', reqs.length, (reqs.reduce((a, r) => a + r.b, 0) / 1048576).toFixed(2), 'МБ');
  await b.close();
})();
