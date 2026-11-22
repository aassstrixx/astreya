// когда на самом деле дошли кадры по сети (CDP) и когда движок отметил их загруженными
const {chromium} = require('playwright');
(async () => {
  const mbit = +(process.argv[2] || 30), rtt = +(process.argv[3] || 60), BASE = process.env.BASE || 'https://localhost:8831';
  const b = await chromium.launch(); const ctx = await b.newContext({ignoreHTTPSErrors: true, viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true});
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: rtt, downloadThroughput: mbit * 125000, uploadThroughput: mbit * 125000 / 4});
  const fin = []; const t0 = Date.now();
  cdp.on('Network.loadingFinished', e => fin.push([Date.now() - t0, e.encodedDataLength, e.requestId]));
  const urls = {}; cdp.on('Network.requestWillBeSent', e => { urls[e.requestId] = e.request.url; });
  await p.goto(BASE + '/index.html', {waitUntil: 'load', timeout: 120000});
  let all = 0;
  for (let i = 0; i < 200; i++) { await p.waitForTimeout(500); const st = await p.evaluate(() => { const c = window.Astreya.jar.arch; return c && c.state ? c.state().loaded + '/' + c.state().N : null; }).catch(() => null); if (st && st.split('/')[0] === st.split('/')[1]) { all = Date.now() - t0; break; } }
  const fr = fin.filter(f => /house-hall\/(m|zm|jm)\//.test(urls[f[2]] || '')); const last = Math.max(...fr.map(f => f[0]));
  const pct = q => { const a = fr.map(f => f[0]).sort((x, y) => x - y); return a[Math.floor(a.length * q)]; };
  console.log(mbit + ' Мбит/с, rtt ' + rtt, '| кадров скачано по сети:', fr.length, ', МБ', (fr.reduce((a, f) => a + f[1], 0) / 1048576).toFixed(1), '| 50% к', pct(.5), 'мс, 90% к', pct(.9), 'мс, последний к', last, 'мс | движок отметил все ключи загруженными к', all, 'мс');
  await b.close();
})();
