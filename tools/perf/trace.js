// трасса главной (первые секунды): самые долгие события основного потока по типам
const {chromium} = require('playwright'); const fs = require('fs');
(async () => {
  const mode = process.argv[2] || 'mobile', path = process.argv[3] || 'index.html', ms = +(process.argv[4] || 5000);
  const b = await chromium.launch(); const ctx = await b.newContext(mode === 'mobile' ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true} : {viewport: {width: 1440, height: 900}});
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  await b.startTracing(p, {path: 'trace.json', categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline']});
  await p.goto('http://localhost:8830/' + path, {waitUntil: 'load'}); await p.waitForTimeout(ms);
  await b.stopTracing();
  const tr = JSON.parse(fs.readFileSync('trace.json', 'utf8')).traceEvents;
  const main = tr.find(e => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain');
  const ev = tr.filter(e => e.ph === 'X' && e.pid === main.pid && e.tid === main.tid && e.dur);
  const t0 = Math.min(...ev.map(e => e.ts));
  const agg = {}; ev.forEach(e => { if (e.dur > 3000 || ['EvaluateScript', 'v8.compile', 'ParseHTML', 'Layout', 'UpdateLayoutTree', 'Paint', 'FunctionCall'].includes(e.name)) { agg[e.name] = agg[e.name] || [0, 0, 0]; agg[e.name][0]++; agg[e.name][1] += e.dur / 1000; agg[e.name][2] = Math.max(agg[e.name][2], e.dur / 1000); } });
  console.log('типы событий (шт, сумма мс, макс мс):'); Object.entries(agg).sort((a, b) => b[1][1] - a[1][1]).slice(0, 16).forEach(([k, v]) => console.log(' ', k.padEnd(28), v[0], v[1].toFixed(0), v[2].toFixed(0)));
  console.log('самые долгие события:'); ev.filter(e => e.dur > 60000).sort((a, b) => a.ts - b.ts).slice(0, 25).forEach(e => console.log('  t=' + ((e.ts - t0) / 1000).toFixed(0) + 'мс', e.name, (e.dur / 1000).toFixed(0) + 'мс', (e.args && e.args.data && (e.args.data.url || e.args.data.functionName) || '').toString().replace('http://localhost:8830/', '').slice(0, 60)));
  await b.close();
})();
