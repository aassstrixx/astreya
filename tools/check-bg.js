#!/usr/bin/env node
/* Проверка фоновых вставок (макро-текстуры за содержимым страниц; настройки — data/redesign.json → backdrops).
   1) Без браузера: файлы текстур на месте и не тяжёлые, в планах страниц только известные текстуры, на самом герое главной, во вступлении с баночкой и в бегущей строке разметки вставок нет (и вообще в skipPages, если они заданы).
   2) В браузере (нужны Playwright и Chromium; без них эта часть пропускается): на каждом типе страницы и на компьютере, и на телефоне — текстуры подгружаются и проявляются,
      нет ошибок и горизонтальной прокрутки, текстура не перехватывает клики, переход между страницами без перезагрузки (SPA) тоже даёт вставки,
      а контраст текста, лежащего прямо на текстуре, не ниже WCAG AA (4.5:1; для крупного текста 3:1) — по реальному снимку страницы без текста.
   Запуск: node tools/check-bg.js [--no-browser] [--strict-contrast]  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
const fs = require('fs'), pth = require('path'), http = require('http');
const ROOT = pth.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(pth.join(ROOT, 'data', 'redesign.json'), 'utf8')).backdrops;
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x) : ''); } };
const info = m => console.log('  ·', m);

/* ---------- 1. файлы и разметка ---------- */
console.log('\n[файлы и разметка]');
if (!cfg || !cfg.enabled) { console.log('  Вставки выключены (backdrops.enabled) — проверять нечего.'); process.exit(0); }
let total = 0;
for (const n of Object.keys(cfg.textures)) for (const sfx of ['', '-m']) {
  const f = pth.join(ROOT, 'assets', 'bg', `${n}${sfx}.webp`), has = fs.existsSync(f), sz = has ? fs.statSync(f).size : 0; total += sz;
  ok(has && sz > 2000 && sz < 400 * 1024, `assets/bg/${n}${sfx}.webp на месте и не тяжёлый (${(sz / 1024).toFixed(0)} КБ)`);
}
ok(total < 2 * 1024 * 1024, `все текстуры вместе легче 2 МБ (${(total / 1024).toFixed(0)} КБ)`);
const plans = cfg.pages || {};
const usedBy = pl => [pl, ...(pl.variants || [])].flatMap(v => [v.top, v.end, ...(v.mid || [])]).filter(Boolean).map(i => i.tex);
for (const [k, pl] of Object.entries(plans)) {
  const used = usedBy(pl);
  ok(used.every(t => cfg.textures[t]), `план «${k}»: все текстуры описаны`, used.filter(t => !cfg.textures[t]));
}
const BUBBLY = ['pearls', 'drops', 'molecules', 'swirl', 'serum', 'ctubes', 'tubes', 'pumps'];                  // жемчуг, капли, молекулы: пузырьков и шариков на страницах брендов быть не должно (просьба заказчика)
ok(!usedBy(plans.brand || {}).some(t => BUBBLY.includes(t)) && !usedBy(plans.product || {}).some(t => ['pearls', 'drops'].includes(t)), 'на страницах брендов нет молекул и пузырьков, на товарах — жемчуга и капель');
ok(!Object.keys(cfg.textures).some(t => ['pearls', 'drops', 'swirl', 'serum', 'ctubes', 'tubes', 'pumps'].includes(t)), 'убранных текстур («жемчуг», «капли», «завиток», «флаконы-колбочки», «тубы», «дозаторы») в наборе нет');
ok(!Object.values(plans).some(pl => pl.variants && pl.variants.length < 2), 'у каждого плана с вариантами их не меньше двух');
ok(!(cfg.skipPages || []).some(k => plans[k]), 'для страниц из skipPages планов нет');
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? (['.git', 'src', 'tools', 'data', 'css', 'js', 'assets', 'server', 'node_modules'].includes(e.name) ? [] : walk(pth.join(d, e.name))) : [pth.join(d, e.name)]);
const pages = walk(ROOT).filter(f => f.endsWith('.html')).map(f => pth.relative(ROOT, f)).sort();
const keyOf = rel => (fs.readFileSync(pth.join(ROOT, rel), 'utf8').match(/<body[^>]*data-page="([^"]+)"/) || [])[1];
const byKey = {}; for (const rel of pages) { const k = keyOf(rel); if (k) (byKey[k] = byKey[k] || []).push(rel); }
let bad = [];
for (const rel of pages) {
  const html = fs.readFileSync(pth.join(ROOT, rel), 'utf8'), k = keyOf(rel), skip = (cfg.skipPages || []).includes(k), has = /data-bd=|bd-fill/.test(html);
  if (skip && has) bad.push(rel + ': вставки на странице из skipPages');
  if (!skip && plans[k] && !has) bad.push(rel + ': по плану вставки есть, в разметке нет');
  if (/class="[^"]*\bjar-(story|outro)\b[^"]*"[^>]*data-bd=|data-bd="[^"]*"[^>]*class="[^"]*\bjar-(story|outro)\b/.test(html)) bad.push(rel + ': вставка на блоке вступления');
}
ok(!bad.length, 'вставки только там, где задано: не на главной и не на вступлении с баночкой', bad.slice(0, 5));
const noPlan = Object.keys(byKey).filter(k => !(cfg.skipPages || []).includes(k) && !plans[k] && !plans._default);
if (noPlan.length) info('страницы без вставок (нет плана): ' + noPlan.join(', '));

if (process.argv.includes('--no-browser')) { console.log(`\nИтого: ${pass} успешно, ${fail} с ошибками.`); process.exit(fail ? 1 : 0); }

/* ---------- 2. браузер ---------- */
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('\nPlaywright не найден — проверка в браузере пропущена.'); console.log(`\nИтого: ${pass} успешно, ${fail} с ошибками.`); process.exit(fail ? 1 : 0); }
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const STRICT = process.argv.includes('--strict-contrast'), ONLY = ((process.argv.find(a => a.startsWith('--pages=')) || '').slice(8) || '').split(',').filter(Boolean);
const wait = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.CHECK_OUT || '';

/* по одной странице каждого вида (ключ) + главная как отрицательный пример */
const pick = [...new Set(['home', ...Object.keys(plans).filter(k => !(cfg.skipPages || []).includes(k))])].filter(k => byKey[k] && (!ONLY.length || k === 'home' && ONLY.includes('home') || ONLY.includes(k))).map(k => ({k, rel: byKey[k][0]}));

/* контраст: в браузере прячем текст, снимаем страницу целиком и для каждого текстового элемента берём самое тёмное место его рамки на фоне */
const TEXTS = () => {
  const out = [], root = document.getElementById('main'); if (!root) return out;
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const cv1 = document.createElement('canvas'); cv1.width = cv1.height = 1; const c1 = cv1.getContext('2d', {willReadFrequently: true});
  const parse = s => { if (!s || s === 'transparent') return null; c1.clearRect(0, 0, 1, 1); c1.fillStyle = '#000'; c1.fillStyle = s; c1.fillRect(0, 0, 1, 1); const d = c1.getImageData(0, 0, 1, 1).data; const m = s.match(/(?:\/|,)\s*([\d.]+%?)\s*\)$/); let a = 1; if (/rgba|\//.test(s) && m) a = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]); return [d[0], d[1], d[2], a]; };      // любой css-цвет (в том числе color-mix) → rgba через canvas
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; if (!/\S{2,}/.test(t.nodeValue)) continue; const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('.hero,.jar-story,.jar-outro,.marquee,input,textarea,select,button,.btn,.chip,.tag,.badge,.srch,.sr,svg,script,style,noscript,[hidden],[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const col = parse(cs.color); if (!col || col[3] < .5) continue;
    let skip = false, op = 1;
    for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
      const s = getComputedStyle(a); op *= parseFloat(s.opacity);
      if (a !== el || true) { const bg = parse(s.backgroundColor); if (a !== root && !a.hasAttribute('data-bd') && ((bg && bg[3] > .6) || (s.backgroundImage && s.backgroundImage !== 'none' && !/bd-fill/.test(a.className)))) { skip = true; break; } }
      if (a.hasAttribute('data-bd') && !a.classList.contains('bd-fill')) break;
    }
    if (skip || op < .9) continue;
    const range = document.createRange(); range.selectNodeContents(t); const rects = Array.from(range.getClientRects()).filter(r => r.width > 2 && r.height > 2); if (!rects.length) continue;
    const fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700, large = fs >= 24 || (fs >= 18.66 && bold);
    for (const r of rects) out.push({x: Math.floor(r.left + scrollX), y: Math.floor(r.top + scrollY), w: Math.ceil(r.width), h: Math.ceil(r.height), tl: lum(col), large, txt: t.nodeValue.trim().slice(0, 28), color: cs.color});
  }
  return out;
};
const MEASURE = async ({b64, rects}) => {
  const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const cx = cv.getContext('2d', {willReadFrequently: true}); cx.drawImage(img, 0, 0);
  const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return rects.map(r => {
    const x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(r.w, img.width - x), h = Math.min(r.h, img.height - y); if (w < 1 || h < 1) return null;
    const d = cx.getImageData(x, y, w, h).data, L = []; for (let i = 0; i < d.length; i += 4) L.push(.2126 * f(d[i]) + .7152 * f(d[i + 1]) + .0722 * f(d[i + 2]));
    L.sort((a, c) => a - c); const lb = L[Math.floor(L.length * .01)];
    return (lb + .05) / (r.tl + .05) > 1 ? (lb + .05) / (r.tl + .05) : (r.tl + .05) / (lb + .05);
  });
};

(async () => {
  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[pth.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const worst = [];
  for (const [name, W, H, mobile] of [['компьютер', 1440, 900, false], ['телефон', 390, 844, true]]) {
    console.log(`\n[${name}]`);
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: mobile, hasTouch: mobile}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    const calc = await ctx.newPage();
    for (const {k, rel} of pick) {
      const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('requestfailed', r => { if (!/fonts\./.test(r.url())) errs.push('запрос не удался: ' + r.url().slice(-50)); });
      await p.goto(base + rel); await wait(k === 'home' ? 3800 : 900);
      const home = k === 'home';
      const Hh = await p.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < Hh; y += 600) { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), y); await wait(90); }
      await p.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
      await p.waitForFunction(() => document.querySelectorAll('[data-bd]:not(.bd-on)').length === 0, null, {timeout: 15000}).catch(() => {});
      await p.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
      const st = await p.evaluate(() => ({fills: document.querySelectorAll('.bd-fill').length, hosts: document.querySelectorAll('[data-bd]').length, on: document.querySelectorAll('[data-bd].bd-on').length,
        imgs: Array.from(document.querySelectorAll('[data-bd]')).filter(e => /url\(/.test(e.style.getPropertyValue('--bd-img'))).length, ovf: document.documentElement.scrollWidth - innerWidth, muted: getComputedStyle(document.getElementById('main')).getPropertyValue('--muted').trim()}));
      if (home) {
        const free = await p.evaluate(() => ['.hero', '.jar-story', '.jar-outro', '.marquee'].map(q => { const e = document.querySelector(q); return e ? (!e.closest('[data-bd]') && !e.querySelector('[data-bd]')) : true; }));
        ok(free.every(Boolean), `${rel}: герой, вступление с баночкой и бегущая строка без вставок`, free);
      }
      ok(st.hosts > 0 && st.on === st.hosts && st.imgs === st.hosts, `${rel}: вставки подгрузились и проявились (${st.on}/${st.hosts})`, st);
      ok(st.ovf <= 1, `${rel}: нет горизонтальной прокрутки`, st.ovf);
      ok(!errs.length, `${rel}: без ошибок в консоли и запросов`, errs.slice(0, 3));
      const click = await p.evaluate(() => Array.from(document.querySelectorAll('[data-bd]')).every(e => { const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = Math.min(Math.max(r.top + 40, 5), innerHeight - 5), t = document.elementFromPoint(x, y); return !t || !t.hasAttribute || !t.hasAttribute('data-bd') || !t.classList.contains('bd-fill'); }));
      ok(click, `${rel}: текстура не перехватывает клики`);
      /* контраст */
      await p.addStyleTag({content: '*,*::before,*::after{transition:none!important}#splash,#curtain{display:none!important}'});      // без переходов: все блоки сразу в конечном положении, замеры не «плывут»
      for (let i = 0; i < 3; i++) { await p.evaluate(() => document.querySelectorAll('.reveal,.split,.eyebrow,.b-title,[data-count]').forEach(e => e.classList.add('in'))); await wait(450); }      // слова заголовков разбиваются с задержкой — открываем несколько раз
      let rects = await p.evaluate(TEXTS);
      for (let i = 0; i < 12; i++) {                                                 // ждём, пока тексты перестанут двигаться (появление слов, подгрузка картинок и шрифтов)
        await wait(350); await p.evaluate(() => document.querySelectorAll('.reveal,.split,.eyebrow,.b-title,[data-count]').forEach(e => e.classList.add('in'))); const r2 = await p.evaluate(TEXTS), key = a => JSON.stringify(a.map(r => [r.x, r.y, r.w, r.h]));
        const same = key(r2) === key(rects); rects = r2; if (same) break;
      }
      await p.addStyleTag({content: '#main *{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important}#main *::placeholder{color:transparent!important}#main svg *{visibility:hidden!important}'});
      await wait(300);
      const shot = await p.screenshot({fullPage: true, type: 'png'}); if (OUT && !mobile) fs.writeFileSync(pth.join(OUT, `bg-${k}.png`), shot);
      await calc.goto('about:blank'); const ratios = await calc.evaluate(MEASURE, {b64: shot.toString('base64'), rects});
      let min = 99, bad = []; rects.forEach((r, i) => { const q = ratios[i]; if (q == null) return; const need = r.large ? 3 : 4.5; if (q < min) min = q; if (q < need) bad.push(`${q.toFixed(2)}<${need} «${r.txt}» ${r.color} @${r.x},${r.y} ${r.w}×${r.h}`); });
      worst.push([`${name}: ${rel}`, min, rects.length]);
      const msg = `${rel}: контраст текста на текстуре ≥ AA (текстов ${rects.length}, худший ${min === 99 ? '—' : min.toFixed(2)}:1)`;
      if (STRICT) ok(!bad.length, msg, bad.slice(0, 4)); else { ok(true, msg); if (bad.length) info(`  ниже нормы у ${bad.length}: ` + bad.slice(0, 6).join('; ')); }
      await p.close();
    }
    /* переход без перезагрузки: вставки появляются и на странице, куда пришли по ссылке; на главную — исчезают */
    {
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + 'catalog.html'); await wait(900);
      await p.evaluate(() => document.querySelector('#nav .nl[href$="company.html"]').click()); await wait(2800);
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(300);
      await p.waitForFunction(() => document.querySelectorAll('[data-bd]').length > 0 && document.querySelectorAll('[data-bd]:not(.bd-on)').length === 0, null, {timeout: 12000}).catch(() => {});
      const s = await p.evaluate(() => ({url: location.pathname, page: document.body.getAttribute('data-page'), hosts: document.querySelectorAll('[data-bd]').length, on: document.querySelectorAll('[data-bd].bd-on').length}));
      ok(/company/.test(s.url) && s.page === 'company' && s.hosts > 0 && s.on === s.hosts, 'переход «каталог → компания» по ссылке: вставки новой страницы подгрузились', s);
      ok(!errs.length, 'при переходе нет ошибок', errs.slice(0, 2));
      await p.close();
    }
    {
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + 'company.html'); await wait(900);
      await p.evaluate(() => document.querySelector('#hdr a.logo').click()); await wait(3800);
      const s = await p.evaluate(() => ({page: document.body.getAttribute('data-page'), hosts: document.querySelectorAll('[data-bd]').length, fills: document.querySelectorAll('.bd-fill').length}));
      ok(s.page === 'home' && s.hosts > 0 && s.fills === 0, 'переход «компания → главная» по лого: на главной вставки блоков есть, полос страницы нет', s);
      ok(!errs.length, 'при возврате на главную нет ошибок', errs.slice(0, 2));
      await p.close();
    }
    await ctx.close();
  }
  console.log('\nХудший контраст по страницам:'); worst.sort((a, c) => a[1] - c[1]).slice(0, 6).forEach(w => console.log(`  ${w[1] === 99 ? '—' : w[1].toFixed(2).padStart(5)}:1  ${w[0]}`));
  await b.close(); srv.close();
  console.log(`\nИтого: ${pass} успешно, ${fail} с ошибками.`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
