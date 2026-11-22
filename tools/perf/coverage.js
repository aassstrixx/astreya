const {chromium} = require('playwright');
(async () => {
  const path = process.argv[2] || 'index.html', mode = process.argv[3] || 'mobile';
  const b = await chromium.launch(); const ctx = await b.newContext(mode === 'mobile' ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true} : {viewport: {width: 1440, height: 900}});
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  await p.coverage.startCSSCoverage({resetOnNavigation: false}); await p.coverage.startJSCoverage({resetOnNavigation: false});
  await p.goto('http://localhost:8830/' + path, {waitUntil: 'load'}); await p.waitForTimeout(3000);
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let i = 1; i <= 24; i++) { await p.evaluate(y => window.scrollTo(0, y), H * i / 24); await p.waitForTimeout(150); }
  await p.waitForTimeout(1500);
  const css = await p.coverage.stopCSSCoverage(), js = await p.coverage.stopJSCoverage();
  const rep = (arr, kind) => {
    let T = 0, U = 0; const rows = arr.map(e => { let tot = e.text ? e.text.length : 0; if (!tot) { try { tot = require('fs').readFileSync('/home/user/astreya/' + e.url.replace('http://localhost:8830/', '').split('?')[0], 'utf8').length; } catch (x) {} } let used = 0; if (e.ranges) used = e.ranges.reduce((a, r) => a + r.end - r.start, 0); else if (e.functions) { const m = new Uint8Array(tot); e.functions.forEach(f => f.ranges.forEach(r => { m.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(tot, r.endOffset)); })); used = m.reduce((a, v) => a + v, 0); } T += tot; U += used; return [e.url.replace('http://localhost:8830/', '').split('?')[0], tot, used]; }).filter(r => r[0].startsWith(kind));
    console.log(kind, 'файлов', rows.length, 'всего КБ', (rows.reduce((a, r) => a + r[1], 0) / 1024).toFixed(0), 'использовано КБ', (rows.reduce((a, r) => a + r[2], 0) / 1024).toFixed(0));
    rows.sort((a, b) => (b[1] - b[2]) - (a[1] - a[2])).forEach(r => console.log('  ', r[0].padEnd(28), String((r[1] / 1024).toFixed(0)).padStart(5), 'КБ  использовано', String(Math.round(100 * r[2] / Math.max(1, r[1]))).padStart(3) + '%'));
  };
  console.log(path, mode, 'высота', H); rep(css, 'css/'); rep(js, 'js/');
  await b.close();
})();
