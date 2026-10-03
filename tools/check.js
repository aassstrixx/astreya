#!/usr/bin/env node
/* Проверка собранного сайта без браузера: битые ссылки и якоря, h1, уникальные title/description, canonical, alt, sitemap.
   Запуск: node tools/check.js  (после node tools/build.js). Код возврата ≠ 0, если найдены проблемы. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? (['node_modules', '.git', 'src', 'tools', 'data', 'css', 'js', 'assets', 'server'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const files = walk(ROOT).filter(f => f.endsWith('.html'));
const errors = [], warns = [];
const titles = new Map(), descs = new Map();
const idsOf = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const cache = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));

for (const f of files) {
  const rel = path.relative(ROOT, f), html = cache.get(f), dir = path.dirname(f);
  const err = m => errors.push(`${rel}: ${m}`);
  const one = (re, name) => { const m = html.match(re); if (!m) err(`нет ${name}`); return m && m[1]; };
  const title = one(/<title>([^<]*)<\/title>/, '<title>'), desc = one(/<meta name="description" content="([^"]*)"/, 'meta description');
  one(/<link rel="canonical" href="([^"]+)"/, 'canonical'); one(/<meta property="og:title" content="([^"]*)"/, 'og:title'); one(/<meta property="og:image" content="([^"]*)"/, 'og:image');
  if (title) { if (titles.has(title)) err(`дубль title с ${titles.get(title)}`); titles.set(title, rel); if (title.length > 90) warns.push(`${rel}: длинный title (${title.length})`); }
  if (desc) { if (descs.has(desc)) err(`дубль description с ${descs.get(desc)}`); descs.set(desc, rel); if (desc.length > 170) warns.push(`${rel}: длинный description (${desc.length})`); }
  const h1 = (html.match(/<h1[\s>]/g) || []).length; if (h1 !== 1) err(`h1: ${h1} (нужен ровно один)`);
  // порядок заголовков: без пропуска уровней (h1 → h3 недопустимо)
  { let prev = 0; for (const m of html.matchAll(/<h([1-6])[\s>]/g)) { const l = +m[1]; if (prev && l > prev + 1) { err(`пропуск уровня заголовка: h${prev} → h${l}`); break; } prev = l; } }
  (html.match(/<img\b[^>]*>/g) || []).forEach(t => { if (!/\salt="/.test(t)) err(`img без alt: ${t.slice(0, 60)}`); });
  const ids = idsOf(html);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|data:|javascript:)/.test(u)) continue;
    const [p, hash] = u.split('#'), pth = p.split('?')[0];
    const target = pth ? path.resolve(dir, pth) : f;
    if (pth && !fs.existsSync(target)) { err(`битая ссылка: ${u}`); continue; }
    if (hash && (target.endsWith('.html'))) { const th = cache.get(target) || fs.readFileSync(target, 'utf8'); if (!idsOf(th).has(hash)) err(`нет якоря #${hash} в ${path.relative(ROOT, target)} (ссылка ${u})`); }
  }
  // повторяющиеся id внутри страницы
  const all = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]); const dup = all.filter((x, i) => all.indexOf(x) !== i);
  if (dup.length) err(`повторяющиеся id: ${[...new Set(dup)].join(', ')}`);
}
// sitemap ↔ файлы
const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const noindex = files.filter(f => /noindex/.test(cache.get(f))).length;
if (locs.length + noindex !== files.length) errors.push(`sitemap: ${locs.length} url + ${noindex} noindex ≠ ${files.length} страниц`);
console.log(`Страниц: ${files.length}; ошибок: ${errors.length}; предупреждений: ${warns.length}`);
errors.slice(0, 60).forEach(e => console.log('  ✗ ' + e)); warns.slice(0, 20).forEach(w => console.log('  ! ' + w));
process.exit(errors.length ? 1 : 0);
