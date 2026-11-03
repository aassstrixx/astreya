#!/usr/bin/env node
/* Снимок баночки главной (холст .ar-jar-cv на последнем экране героя, прозрачный фон, этикетка и свет — как на сайте) для запекания в ключи пролёта (bake_jar.py).
   ПК:      node cap_hero_jar.js /home/user/astreya 2 1920 1080 /tmp/zone/jarbake/hero_jar_dpr2.png
   Телефон: node cap_hero_jar.js /home/user/astreya 2 390 844 /tmp/zone/jarbake/hero_jar_m_dpr2.png --mobile   (затем bake_jar.py --mobile --vw 390 --vh 844) */
const http = require('http'), fs = require('fs'), path = require('path');
const pw = require(['playwright', '/opt/node22/lib/node_modules/playwright'].find(m => { try { require.resolve(m); return true; } catch (e) { return false; } }));
const ROOT = process.argv[2] || '.', DPR = +(process.argv[3] || 2), W = +(process.argv[4] || 1920), H = +(process.argv[5] || 1080), OUT = process.argv[6] || '/tmp/hero_jar.png', MOB = process.argv.includes('--mobile');
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2'};
(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const ctx = await b.newContext({viewport: {width: W, height: H}, deviceScaleFactor: DPR, isMobile: MOB, hasTouch: MOB}); const p = await ctx.newPage();
  await p.route(/^https:\/\/fonts\./, r => r.abort()); await p.route('**/api/assistant/status', r => r.fulfill({status: 404, body: ''}));
  await p.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
  await p.goto(base + '/index.html'); await p.waitForTimeout(800); { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } } await p.waitForTimeout(3500);
  const hy = await p.evaluate(() => { const a = document.getElementById('arch-story'); return a.getBoundingClientRect().top + scrollY + a.offsetHeight - innerHeight; });
  await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), hy);
  await p.waitForFunction(() => { const s = Astreya.jar.arch.state(); return s.p > 0.999 && s.jar && s.jar.loaded > 0; }, null, {timeout: 120000}).catch(() => {}); await p.waitForTimeout(4000);
  const info = await p.evaluate(() => { const c = document.querySelector('#arch-story .ar-jar-cv'); c.classList.add('capjar'); return {w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, op: getComputedStyle(c).opacity}; });
  console.log(JSON.stringify(info));
  await p.addStyleTag({content: 'html,body{background:transparent!important} *{visibility:hidden!important} .capjar{visibility:visible!important}'}); await p.waitForTimeout(600);
  await p.screenshot({path: OUT, omitBackground: true, timeout: 120000});
  await b.close(); srv.close(); console.log('ok', OUT);
})();
