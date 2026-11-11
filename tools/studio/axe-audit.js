#!/usr/bin/env node
/* Аудит доступности и контраста страниц ASTREYA движком axe-core (внешний инструмент студии, в репозиторий не входит):
     mkdir -p /tmp/studio-tools && cd /tmp/studio-tools && npm init -y && npm i axe-core
   Запуск (сайт должен отдаваться по http, по умолчанию http://127.0.0.1:8791/):
     node tools/studio/axe-audit.js [страницы через запятую] [ширина]
   Печатает по каждой странице число нарушений по правилам (контраст, имена кнопок/ссылок, alt, языки и т. д.) и первые элементы-нарушители контраста с реальным коэффициентом. */
'use strict';
const fs = require('fs'), path = require('path');
const TOOLS = process.env.STUDIO_TOOLS || '/tmp/studio-tools';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден'); process.exit(0); }
const axeSrc = fs.readFileSync(path.join(TOOLS, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const BASE = process.env.BASE || 'http://127.0.0.1:8791/';
const pages = (process.argv[2] || 'index,catalog,brands,training,news,company,partners,contacts').split(','), W = +process.argv[3] || 1440;
(async () => {
  const b = await pw.chromium.launch(); const out = [];
  for (const f of pages) {
    const ctx = await b.newContext({viewport: {width: W, height: 900}, locale: 'ru-RU', bypassCSP: true});
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
    const p = await ctx.newPage(); await p.goto(BASE + f + '.html', {waitUntil: 'load'}).catch(() => {}); await p.waitForTimeout(2500);
    await p.addScriptTag({content: axeSrc});
    const r = await p.evaluate(async () => { const a = await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice']}, resultTypes: ['violations']}); return a.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 3).map(n => ({t: n.target.join(' ').slice(0, 70), s: (n.any[0] && n.any[0].message || '').slice(0, 110)}))})); });
    out.push({page: f, violations: r}); await ctx.close();
  }
  for (const o of out) {
    console.log('\n== ' + o.page + ' — нарушений правил: ' + o.violations.length + ', элементов: ' + o.violations.reduce((s, v) => s + v.n, 0));
    for (const v of o.violations.sort((a, b) => b.n - a.n).slice(0, 8)) { console.log('  [' + v.impact + '] ' + v.id + ' × ' + v.n); if (v.id === 'color-contrast' || v.n <= 2) v.ex.slice(0, 2).forEach(e => console.log('      ' + e.t + ' — ' + e.s)); }
  }
  await b.close();
})();
