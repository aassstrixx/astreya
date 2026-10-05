#!/usr/bin/env node
/* Арена фона: 100 вариантов «эффекта крема» за блоком главной (по умолчанию «Подбор по задаче») — картинка × положение × сила.
   Каждый вариант ставится на настоящий блок в браузере (десктоп 1440 и телефон 390), снимается без текста; Python (arena_score.py) считает замеры;
   дальше турнир на вылет: пары сражаются по замерам, проигравший выбывает, победитель идёт дальше. Итог — arena/result.json и снимки финалистов.
   Запуск: node tools/arena-bg.js <папка-пула> <папка-вывода> [селектор блока]   (пул — tools/bg-render/arena_pool.py) */
'use strict';
const fs = require('fs'), path = require('path'), {spawnSync} = require('child_process');
const {chromium} = require('/opt/node22/lib/node_modules/playwright');
const POOL = path.resolve(process.argv[2]), OUT = path.resolve(process.argv[3]), SEL = process.argv[4] || 'section.rd-picker';
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(OUT, {recursive: true}); fs.mkdirSync(path.join(OUT, 'shots'), {recursive: true});
const pool = JSON.parse(fs.readFileSync(path.join(POOL, 'pool.json'), 'utf8'));

/* 100 вариантов: детерминированный отбор из 20 картинок × 3 положения × 5 сил (каждая картинка встречается не реже 4 раз) */
function rnd(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const R = rnd(2026), POS = ['l', 'tl', 'bl'], STR = [5, 6, 7, 8, 9], all = [];
pool.forEach(p => POS.forEach(pos => STR.forEach(o => all.push({img: p.id, family: p.family, pos, o}))));
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
const picked = []; const cnt = {};
for (const v of all) { if (picked.length >= 100) break; if ((cnt[v.img] || 0) < 5) { picked.push(v); cnt[v.img] = (cnt[v.img] || 0) + 1; } }
picked.forEach((v, i) => { v.id = 'v' + String(i + 1).padStart(3, '0'); });

async function measure(width, height) {
  const b = await chromium.launch({executablePath: CHROME}), ctx = await b.newContext({viewport: {width, height}});
  await ctx.route(/^https:\/\/fonts\./, r => r.abort());
  const p = await ctx.newPage(); await p.goto('file://' + path.join(ROOT, 'index.html')); await p.waitForTimeout(1500);
  await p.addStyleTag({content: '[data-bd]::before{transition:none!important} html{scroll-behavior:auto!important} .reveal,.split,.eyebrow{opacity:1!important;transform:none!important}'});
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 700) { await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(60); }
  await p.evaluate(sel => { const e = document.querySelector(sel); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 60); document.querySelectorAll('.reveal,.split,.eyebrow').forEach(x => x.classList.add('in')); }, SEL);
  await p.waitForTimeout(800);
  const geom = await p.evaluate(sel => {
    const el = document.querySelector(sel), r = el.getBoundingClientRect(), pageY = scrollY;
    const rel = e => { const q = e.getBoundingClientRect(); return {x: q.left, y: q.top - r.top, w: q.width, h: q.height}; };
    const texts = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; if (!n.nodeValue.trim()) continue; const e = n.parentElement, cs = getComputedStyle(e); if (cs.visibility === 'hidden') continue;
      const rg = document.createRange(); rg.selectNodeContents(n); const q = rg.getBoundingClientRect(); if (q.width < 2 || q.height < 2) continue; const m = cs.color.match(/[\d.]+/g).map(Number);
      texts.push({x: q.left, y: q.top - r.top, w: q.width, h: q.height, color: m.slice(0, 3), a: m[3] === undefined ? 1 : m[3]}); }
    const card = el.querySelector('.picker, .card, [class*="picker"]'); const cards = [...el.querySelectorAll('.picker')].map(rel);
    return {w: r.width, h: r.height, top: r.top, cards, texts};
  }, SEL);
  const clip = async () => { const r = await p.evaluate(sel => { const q = document.querySelector(sel).getBoundingClientRect(); return {x: 0, y: q.top, width: innerWidth, height: Math.min(q.height, innerHeight - Math.max(0, q.top))}; }, SEL); return r; };
  const hideText = '.arena-notext *{color:transparent!important;text-shadow:none!important;border-color:transparent!important} .arena-notext img,.arena-notext svg,.arena-notext canvas{visibility:hidden!important}';
  await p.addStyleTag({content: hideText});
  await p.evaluate(sel => document.querySelector(sel).classList.add('arena-notext'), SEL);
  const shoot = async name => { const c = await clip(); await p.screenshot({path: name, clip: c}); return c; };
  const set = (v, on) => p.evaluate(([sel, v, on, dir]) => { const el = document.querySelector(sel);
    if (!on) { el.classList.remove('bd-on'); return; }
    el.setAttribute('data-bd-pos', v.pos); el.setAttribute('data-bd-o', String(v.o)); const small = matchMedia('(max-width:700px)').matches;
    el.style.setProperty('--bd-img', 'url("file://' + dir + '/' + v.img + (small ? '-m' : '') + '.webp")'); el.classList.add('bd-on'); }, [SEL, v, on, POOL]);
  const tag = width < 700 ? 'm' : 'd';
  await set(null, false); await p.waitForTimeout(300); const clipBase = await shoot(path.join(OUT, `base_${tag}.png`));
  for (const v of picked) {
    await set(v, true); await p.waitForTimeout(260);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await shoot(path.join(OUT, 'shots', `${v.id}_${tag}_clean.png`));
  }
  // снимки с текстом — только для будущих финалистов (делаем во втором проходе)
  const withText = async (v, file) => { await p.evaluate(sel => document.querySelector(sel).classList.remove('arena-notext'), SEL); await set(v, true); await p.waitForTimeout(300); await shoot(file); await p.evaluate(sel => document.querySelector(sel).classList.add('arena-notext'), SEL); };
  await b.close();
  return {geom, tag, withText: null};
}

async function shotsWithText(ids, width, height) {
  const b = await chromium.launch({executablePath: CHROME}), ctx = await b.newContext({viewport: {width, height}});
  await ctx.route(/^https:\/\/fonts\./, r => r.abort());
  const p = await ctx.newPage(); await p.goto('file://' + path.join(ROOT, 'index.html')); await p.waitForTimeout(1500);
  await p.addStyleTag({content: '[data-bd]::before{transition:none!important} html{scroll-behavior:auto!important}'});
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 700) { await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(60); }
  await p.evaluate(sel => { const e = document.querySelector(sel); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 60); document.querySelectorAll('.reveal,.split,.eyebrow').forEach(x => x.classList.add('in')); }, SEL); await p.waitForTimeout(900);
  const tag = width < 700 ? 'm' : 'd';
  for (const id of ids) {
    const v = picked.find(x => x.id === id);
    await p.evaluate(([sel, v, dir]) => { const el = document.querySelector(sel); el.setAttribute('data-bd-pos', v.pos); el.setAttribute('data-bd-o', String(v.o)); const small = matchMedia('(max-width:700px)').matches;
      el.style.setProperty('--bd-img', 'url("file://' + dir + '/' + v.img + (small ? '-m' : '') + '.webp")'); el.classList.add('bd-on'); }, [SEL, v, POOL]);
    await p.waitForTimeout(350);
    const c = await p.evaluate(sel => { const q = document.querySelector(sel).getBoundingClientRect(); return {x: 0, y: Math.max(0, q.top), width: innerWidth, height: Math.min(q.height, innerHeight - Math.max(0, q.top))}; }, SEL);
    await p.screenshot({path: path.join(OUT, `final_${id}_${tag}.png`), clip: c});
  }
  await b.close();
}

(async () => {
  const geoms = {};
  for (const [w, h] of [[1440, 900], [390, 844]]) { const m = await measure(w, h); geoms[m.tag] = m.geom; process.stdout.write(`снято ${picked.length} вариантов на ${w}px\n`); }
  fs.writeFileSync(path.join(OUT, 'variants.json'), JSON.stringify({variants: picked, geoms}, null, 1));
  const r = spawnSync('python3.11', [path.join(__dirname, 'arena_score.py'), OUT], {stdio: 'inherit'});
  if (r.status) process.exit(r.status);
  const res = JSON.parse(fs.readFileSync(path.join(OUT, 'result.json'), 'utf8'));
  const ids = res.top.map(x => x.id);
  await shotsWithText(ids, 1440, 900); await shotsWithText(ids, 390, 844);
  console.log('Финалисты:', ids.join(', '));
})().catch(e => { console.error(e); process.exit(1); });
