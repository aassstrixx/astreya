#!/usr/bin/env node
/* Полный аудит собранного сайта: статика (HTML-валидатор, ссылки, SEO, изображения, формы, ARIA, вес страниц, «сироты» в assets),
   браузер (ошибки консоли, axe-core по WCAG, горизонтальная прокрутка, размеры кликабельных зон, клавиатура) и матрица «арена конфигураций»:
   100 сочетаний «ширина экрана × режим» (обычный, сниженное движение + тёмная схема, принудительные цвета, без JavaScript).
   Запуск:  node tools/audit.js [--static] [--browser] [--matrix] [--out=файл.json] [--pages=ключ,ключ]
   Нужны: playwright, axe-core, html-validate (глобально: npm i -g axe-core html-validate). Код возврата ≠ 0, если есть ошибки уровня error. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=');
const has = n => process.argv.includes('--' + n);
const ALL = !has('static') && !has('browser') && !has('matrix');
const GLOBAL = process.env.NODE_GLOBAL || '/opt/node22/lib/node_modules';
const req = n => { try { return require(n); } catch (e) { return require(path.join(GLOBAL, n)); } };
const findings = [];   // {level: error|warn|info, area, where, msg}
const add = (level, area, where, msg) => findings.push({level, area, where, msg});
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? (['node_modules', '.git', 'src', 'tools', 'data', 'css', 'js', 'assets', 'server'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const pages = walk(ROOT).filter(f => f.endsWith('.html')).sort(), rel = f => path.relative(ROOT, f);
const html = new Map(pages.map(f => [f, fs.readFileSync(f, 'utf8')]));
const keyOf = h => (h.match(/<body[^>]*data-page="([^"]+)"/) || [])[1] || '?';
const byKey = {}; for (const f of pages) (byKey[keyOf(html.get(f))] = byKey[keyOf(html.get(f))] || []).push(f);
const SITE = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8')).url || '').replace(/\/$/, '');

/* ---------- 1. статика ---------- */
async function staticAudit() {
  const {HtmlValidate} = req('html-validate');
  const hv = new HtmlValidate({root: true, extends: ['html-validate:recommended'], rules: {
    'no-inline-style': 'off', 'require-sri': 'off', 'no-trailing-whitespace': 'off', 'void-style': 'off', 'attribute-boolean-style': 'off', 'attribute-empty-style': 'off', 'no-implicit-close': 'off', 'prefer-native-element': 'warn',
    'element-permitted-content': 'warn', 'long-title': 'off', 'heading-level': 'off', 'wcag/h30': 'off', 'wcag/h32': 'warn', 'wcag/h37': 'error', 'wcag/h63': 'error', 'wcag/h67': 'error', 'no-unknown-elements': 'error', 'valid-id': ['error', {relaxed: true}],
    'unique-landmark': 'warn', 'no-redundant-role': 'warn', 'text-content': 'warn', 'attr-quotes': 'off', 'doctype-style': 'off', 'no-raw-characters': 'off', 'prefer-tbody': 'off', 'tel-non-breaking': 'off', 'script-type': 'off', 'no-missing-references': 'error', 'no-dup-id': 'error', 'no-dup-class': 'warn', 'input-missing-label': 'error', 'form-dup-name': 'warn', 'close-order': 'error', 'element-required-attributes': 'error', 'no-deprecated-attr': 'error', 'allowed-links': 'off', 'hidden-focusable': 'off', 'no-conditional-comment': 'off', 'meta-refresh': 'off', 'no-autoplay': 'off', 'area-alt': 'error', 'empty-title': 'error', 'multiple-labeled-controls': 'warn'}});
  const counts = {};
  for (const f of pages) {
    const rep = await hv.validateString(html.get(f), rel(f));
    for (const m of (rep.results[0] || {messages: []}).messages) { const k = m.ruleId; (counts[k] = counts[k] || []).push(`${rel(f)}:${m.line}: ${m.message}`); }
  }
  for (const [rule, list] of Object.entries(counts)) add(list.length > 20 ? 'warn' : 'warn', 'html-validate', rule, `${list.length}× — ${list[0]}` + (list.length > 1 ? ` (и ещё ${list.length - 1})` : ''));

  const titles = new Map(), descs = new Map(), ogimg = new Set();
  for (const f of pages) {
    const h = html.get(f), r = rel(f), k = keyOf(h), noindex = /name="robots"[^>]*noindex/.test(h);
    const m1 = re => (h.match(re) || [])[1];
    const title = m1(/<title>([^<]*)<\/title>/), desc = m1(/<meta name="description" content="([^"]*)"/), canon = m1(/<link rel="canonical" href="([^"]+)"/);
    if (title) { if (title.length < 20 || title.length > 70) add('warn', 'seo', r, `title ${title.length} симв. (удобно 20–70)`); if (titles.has(title)) add('error', 'seo', r, 'дубль title с ' + titles.get(title)); titles.set(title, r); }
    if (desc) { if (desc.length < 70 || desc.length > 170) add('warn', 'seo', r, `description ${desc.length} симв. (удобно 70–170)`); if (descs.has(desc)) add('error', 'seo', r, 'дубль description с ' + descs.get(desc)); descs.set(desc, r); }
    if (!noindex && canon) { const want = SITE + '/' + r.replace(/index\.html$/, ''); if (canon.replace(/\/$/, '') !== want.replace(/\/$/, '')) add('error', 'seo', r, `canonical ${canon} ≠ ожидаемому ${want}`); }
    if (!/<html[^>]*\slang="ru"/.test(h)) add('error', 'a11y', r, 'нет lang="ru" у <html>');
    if (!/<meta name="viewport"/.test(h)) add('error', 'a11y', r, 'нет meta viewport');
    const og = m1(/<meta property="og:image" content="([^"]+)"/); if (og) { ogimg.add(og); const p = og.replace(SITE + '/', ''); if (!fs.existsSync(path.join(ROOT, p))) add('error', 'seo', r, 'og:image не найден: ' + og); }
    for (const jm of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(jm[1]); if (!j['@context'] || !j['@type']) add('error', 'seo', r, 'JSON-LD без @context/@type'); } catch (e) { add('error', 'seo', r, 'JSON-LD не разбирается: ' + e.message); } }
    // изображения
    for (const t of h.matchAll(/<img\b[^>]*>/g)) { const tag = t[0];
      if (!/\salt=/.test(tag)) add('error', 'img', r, 'img без alt: ' + tag.slice(0, 70));
      if (!/\swidth=/.test(tag) || !/\sheight=/.test(tag)) add('warn', 'img', r, 'img без width/height (сдвиг вёрстки при загрузке): ' + (tag.match(/src="([^"]+)"/) || [])[1]);
      }
    // внешние ссылки
    for (const t of h.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(t[0])) add('error', 'security', r, 'target=_blank без rel=noopener: ' + t[0].slice(0, 80));
    for (const t of h.matchAll(/<a\b[^>]*href="(mailto:[^"]*|tel:[^"]*)"/g)) { const v = t[1]; if (/^mailto:/.test(v) && !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) add('error', 'links', r, 'некорректный mailto: ' + v); if (/^tel:/.test(v) && !/^tel:\+?[\d()\-]+$/.test(v)) add('error', 'links', r, 'некорректный tel: ' + v); }
    // формы
    for (const t of h.matchAll(/<input\b[^>]*>/g)) { const tag = t[0]; if (/type="(hidden|submit|button|checkbox|radio)"/.test(tag)) continue; if (!/\sautocomplete=/.test(tag) && /type="(text|email|tel|search)"|^<input\s(?!.*type)/.test(tag) && !/class="hp"|tabindex="-1"/.test(tag)) add('info', 'forms', r, 'поле без autocomplete: ' + tag.slice(0, 80)); }
    // ARIA-ссылки
    const ids = new Set([...h.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]));
    for (const t of h.matchAll(/\saria-(?:controls|labelledby|describedby)="([^"]+)"/g)) for (const id of t[1].split(/\s+/)) if (!ids.has(id)) add('error', 'a11y', r, `aria ссылается на несуществующий id «${id}»`);
    // ориентиры
    if (!/<main\b/.test(h)) add('error', 'a11y', r, 'нет <main>'); if (!/<header\b/.test(h)) add('warn', 'a11y', r, 'нет <header>'); if (!/<footer\b/.test(h)) add('warn', 'a11y', r, 'нет <footer>'); if (!/class="skip"/.test(h)) add('warn', 'a11y', r, 'нет ссылки «К основному содержимому»');
    // вес
    const kb = Buffer.byteLength(h) / 1024; if (kb > 250) add('warn', 'perf', r, `HTML ${kb.toFixed(0)} КБ`);
  }
  // содержимое: служебные «хвосты», двойные пробелы и слова, пустые заглушки, прямые кавычки в тексте
  for (const f of pages) { const h = html.get(f), r = rel(f);
    const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
    for (const [re, what] of [[/\b(undefined|NaN|null)\b/, 'служебное слово в тексте'], [/\[object /, '[object …] в тексте'], [/\{\{|\}\}/, 'неподставленный шаблон {{…}}'], [/lorem ipsum|TODO|FIXME/i, 'заглушка lorem/TODO']]) { const m = text.match(re); if (m) add('warn', 'content', r, `${what}: «${m[0].trim().slice(0, 50)}»`); }
    for (const seg of h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').split(/<[^>]+>/)) { const m = seg.match(/(?:^|\s)([А-Яа-яЁёA-Za-z]{3,})\s+\1(?=[\s.,;:!?]|$)/i); if (m) { add('warn', 'content', r, `повтор слова подряд в одном фрагменте: «${m[0].trim()}»`); break; } }
    if (/[A-Za-z]{3,}"[А-Яа-я]/.test(text) || /"[А-Яа-яЁё][^"]{2,60}"/.test(text)) add('info', 'content', r, 'прямые кавычки "…" вместо «ёлочек»');
    if (/Astreya/.test(text.replace(/astreya\.ru|aassstrixx|github/gi, ''))) add('warn', 'content', r, 'латинское написание «Astreya» (на сайте — «Астрея»)'); }
  // sitemap / robots
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'), locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const f of pages) { const h = html.get(f), noindex = /name="robots"[^>]*noindex/.test(h), url = SITE + '/' + rel(f).replace(/index\.html$/, ''); if (!noindex && !locs.includes(url)) add('error', 'seo', rel(f), 'нет в sitemap.xml'); if (noindex && locs.includes(url)) add('error', 'seo', rel(f), 'noindex-страница в sitemap.xml'); }
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'); if (!/Sitemap:\s*\S+sitemap\.xml/.test(robots)) add('error', 'seo', 'robots.txt', 'нет строки Sitemap');
  // вес и «сироты» в assets
  const textAll = [...pages.map(f => html.get(f)), ...['css', 'js', 'data'].flatMap(d => walkAll(path.join(ROOT, d))).map(f => fs.readFileSync(f, 'utf8'))].join('\n');
  const assets = walkAll(path.join(ROOT, 'assets')).filter(f => !/assets\/jar\//.test(f));
  for (const f of assets) { const r = path.relative(ROOT, f), name = path.basename(f), kb = fs.statSync(f).size / 1024;
    if (kb > 400) add('warn', 'perf', r, `файл ${kb.toFixed(0)} КБ`);
    if (!textAll.includes(r) && !textAll.includes(name.replace(/-m\.webp$/, '').replace(/\.webp$/, '')) && !/favicon|apple-touch|logo-512|og-image/.test(name)) add('info', 'assets', r, 'не найдено упоминаний в страницах, CSS, JS и данных (возможно, неиспользуемый файл)'); }
  const js = walkAll(path.join(ROOT, 'js')).reduce((n, f) => n + fs.statSync(f).size, 0) / 1024, css = walkAll(path.join(ROOT, 'css')).reduce((n, f) => n + fs.statSync(f).size, 0) / 1024;
  add('info', 'perf', 'js/ css/', `JS ${js.toFixed(0)} КБ, CSS ${css.toFixed(0)} КБ (без сжатия)`);
}
function walkAll(d) { if (!fs.existsSync(d)) return []; return fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walkAll(path.join(d, e.name)) : [path.join(d, e.name)]); }

/* ---------- 2. браузер ---------- */
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const pickPages = () => { const want = (arg('pages') || '').split(',').filter(Boolean); return Object.keys(byKey).filter(k => k !== '?' && (!want.length || want.includes(k))).map(k => ({key: k, file: byKey[k][0]})); };
async function openPage(ctx, file, errs) {
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type: 'layout-shift', buffered: true}); } catch (e) {} });
  p.on('pageerror', e => errs.push('JS: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::ERR_(FAILED|BLOCKED|INTERNET)/.test(m.text())) errs.push('консоль: ' + m.text().slice(0, 140)); });
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|mc\.yandex|google-analytics|googletagmanager/.test(r.url())) errs.push('запрос не удался: ' + r.url().slice(-80)); });
  await p.goto('file://' + file); await p.waitForTimeout(900);
  return p;
}
async function browserAudit() {
  const {chromium} = req('playwright'), axeSrc = fs.readFileSync(path.join(GLOBAL, 'axe-core/axe.min.js'), 'utf8');
  const b = await chromium.launch({executablePath: CHROME});
  for (const [name, vp, mobile] of [['компьютер', {width: 1440, height: 900}, false], ['телефон', {width: 390, height: 844}, true]]) {
    const ctx = await b.newContext({viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1}); await ctx.route(/^https:\/\/(fonts|mc\.yandex|www\.googletagmanager)/, r => r.abort());
    for (const {key, file} of pickPages()) {
      const errs = [], p = await openPage(ctx, file, errs), where = `${rel(file)} (${name})`;
      if (key === 'home') { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await p.waitForTimeout(800); }
      // прокрутка до конца: ленивые картинки, ошибки при подгрузке
      const H = await p.evaluate(() => document.documentElement.scrollHeight); for (let y = 0; y < H; y += 900) { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), y); await p.waitForTimeout(40); }
      await p.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'})); await p.waitForTimeout(500);
      errs.forEach(e => add('error', 'browser', where, e));
      const over = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth}));
      if (over.sw > over.cw + 1) { const who = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const q = e.getBoundingClientRect(); return q.right > innerWidth + 2 && q.width > 0; }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 30) + ' ' + getComputedStyle(e).position + ' →' + Math.round(e.getBoundingClientRect().right)));
        add('error', 'layout', where, `горизонтальная прокрутка: ${over.sw} > ${over.cw}; виновники: ${who.join(', ')}`); }
      const broken = await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc).map(i => i.currentSrc.slice(-60)));
      broken.forEach(s => add('error', 'img', where, 'картинка не загрузилась: ' + s));
      // axe
      await p.evaluate(src => { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s); }, axeSrc);
      const res = await p.evaluate(async () => { const r = await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']}, resultTypes: ['violations']}); return r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' → ' + (n.failureSummary || '').split('\n')[1])})); });
      for (const v of res) add(v.impact === 'critical' || v.impact === 'serious' ? 'error' : 'warn', 'axe:' + v.id, where, `${v.help} (${v.n}) — ${v.sample[0]}`);
      // размеры кликабельных зон (телефон): ≥ 24×24 CSS-px (WCAG 2.2, 2.5.8) — у встроенных ссылок в тексте допускается меньше
      if (mobile) { const small = await p.evaluate(() => [...document.querySelectorAll('a[href],button,input:not([type=hidden]):not(.hp),select,textarea,[role=button]')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || !r.height || cs.visibility === 'hidden' || e.closest('[hidden],.sr') || e.classList.contains('skip') || e.classList.contains('hp') || e.classList.contains('stretch')) return false; if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p,li,dd,small,.note')) return false; return r.width < 24 || r.height < 24; }).slice(0, 4).map(e => (e.className || e.tagName).toString().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().width) + '×' + Math.round(e.getBoundingClientRect().height) + ' «' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24) + '»')); small.forEach(s => add('warn', 'tap-target', where, 'маленькая зона нажатия: ' + s)); }
      // клавиатура: ссылка «К основному содержимому» первая; Tab ходит по элементам и не застревает; у каждого сфокусированного элемента виден индикатор
      if (!mobile) {
        await p.evaluate(() => { window.scrollTo({top: 0, behavior: 'instant'}); document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });      // стартовая точка Tab — начало страницы
        const seen = [], noFocus = []; let first = null, stuck = false;
        for (let i = 0; i < 45; i++) {
          await p.keyboard.press('Tab');
          const f = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e), r = e.getBoundingClientRect();
            const own = e.closest('.card'), oc = own ? getComputedStyle(own) : null;
            const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none') || (e.classList.contains('stretch') && oc && oc.outlineStyle !== 'none' && parseFloat(oc.outlineWidth) > 0);
            if (!e.__tid) e.__tid = (window.__tc = (window.__tc || 0) + 1); return {uid: e.__tid, id: e.tagName + '.' + String(e.className).slice(0, 24) + '#' + (e.id || ''), txt: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20), ring, vis: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden', inview: r.bottom > 0 && r.top < innerHeight}; });
          if (!f) { if (i > 3 && !seen.length) stuck = true; continue; }
          if (!first) first = f; if (seen.length && seen[seen.length - 1].uid === f.uid && i > 2) { stuck = true; break; }
          seen.push(f); if (!f.ring) noFocus.push(f); if (!f.vis) add('warn', 'keyboard', where, 'фокус на невидимом элементе: ' + f.id);
        }
        if (!first || !/skip/.test(first.id)) add('warn', 'keyboard', where, 'первым в порядке Tab не ссылка «К основному содержимому»: ' + (first && first.id));
        if (stuck) add('error', 'keyboard', where, 'клавиатурный фокус застрял или пропал');
        [...new Map(noFocus.map(x => [x.id, x])).values()].slice(0, 3).forEach(x => add('warn', 'keyboard', where, 'нет заметного индикатора фокуса: ' + x.id + ' «' + x.txt + '»'));
      }
      // скачки вёрстки (CLS) за время загрузки и прокрутки
      const cls = await p.evaluate(() => window.__cls || 0); if (cls > 0.1) add('warn', 'perf', where, `скачки вёрстки (CLS) ${cls.toFixed(3)} > 0.1`);
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
}

/* ---------- 3. матрица «арена конфигураций»: 100 сочетаний ширина × режим ---------- */
const WIDTHS = (arg('widths') ? arg('widths').split(',').map(Number) : [280, 320, 340, 360, 375, 390, 412, 428, 480, 540, 600, 640, 700, 720, 768, 820, 900, 1024, 1100, 1180, 1280, 1366, 1440, 1680, 1920]);
const MODES = [['обычный', {}], ['сниженное движение + тёмная схема', {reducedMotion: 'reduce', colorScheme: 'dark'}], ['принудительные цвета', {forcedColors: 'active'}], ['без JavaScript', {javaScriptEnabled: false}]];
async function matrixAudit() {
  const {chromium} = req('playwright'), b = await chromium.launch({executablePath: CHROME});
  const targets = ['home', 'catalog', 'brand', 'product', 'training', 'partners'].map(k => ({key: k, file: (byKey[k] || [])[0]})).filter(t => t.file);
  const configs = []; for (const w of WIDTHS) for (const m of MODES) configs.push({w, mname: m[0], opts: m[1]});
  const rows = []; let done = 0, fail = 0;
  async function runConfig({w, mname, opts}) {
    const js = opts.javaScriptEnabled !== false, ctx = await b.newContext({viewport: {width: w, height: w < 700 ? 800 : 900}, isMobile: w <= 900 && js, hasTouch: w <= 900 && js, ...opts});
    await ctx.route(/^https:\/\/(fonts|mc\.yandex|www\.googletagmanager)/, r => r.abort());
    const bad = [];
    for (const t of targets) {
      const errs = [], p = await openPage(ctx, t.file, errs); const where = `${w}px · ${mname} · ${t.key}`;
      if (t.key === 'home' && js) { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} } await p.waitForTimeout(400); }
      errs.forEach(e => bad.push(`${where}: ${e}`));
      if (js) { for (const y of [700, 1600, 700]) { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), y); await p.waitForTimeout(220); } }     // заголовок прячется при прокрутке вниз — после этого не должна расти ширина страницы
      const r = await p.evaluate(() => {
        const out = {}; const de = document.documentElement; out.over = de.scrollWidth - de.clientWidth; out.iw = innerWidth;
        const h1 = document.querySelector('h1'); out.h1 = h1 ? (h1.getBoundingClientRect().height > 4 && getComputedStyle(h1).visibility !== 'hidden') : false;
        // обрезанный текст: элементы с overflow:hidden, у которых содержимое шире видимой области (кроме намеренных многоточий)
        out.clipped = [...document.querySelectorAll('h1,h2,h3,p,li,a,button,span,b,small,label')].filter(e => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || e.closest('.sr,[hidden]')) return false; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
          return (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none' && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && e.children.length === 0 && e.textContent.trim(); }).slice(0, 3).map(e => e.tagName + '.' + String(e.className).slice(0, 24) + ' «' + e.textContent.trim().slice(0, 24) + '»');
        // элементы целиком за правым краем экрана (не в лентах и не в декоре)
        out.offscreen = [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || cs.position === 'fixed' || cs.visibility === 'hidden') return false; if (e.closest('[class*=marquee],[class*=track],.js-stage,.jar-story,[class*=orbit],[class*=pearl],[class*=halo],[data-bd],.bd-fill,.bd-logo,svg,.rd-bgword,[class*=bgword],[class*=bglogo]')) return false; return r.left > innerWidth + 2 && r.width > 8; }).length;
        return out; });
      if (r.over > 1) bad.push(`${where}: горизонтальная прокрутка +${r.over}px`);
      if (r.iw > w + 1) bad.push(`${where}: после прокрутки ширина страницы выросла до ${r.iw}px (элемент за краем экрана)`);
      if (!r.h1) bad.push(`${where}: заголовок H1 не виден`);
      r.clipped.forEach(c => bad.push(`${where}: обрезан текст ${c}`));
      if (r.offscreen > 3) bad.push(`${where}: ${r.offscreen} элементов за правым краем экрана`);
      await p.close();
    }
    await ctx.close(); done++; if (bad.length) fail++; rows.push({w, mode: mname, ok: !bad.length, bad});
    bad.forEach(x => add('error', 'matrix', `${w}px · ${mname}`, x.replace(/^[^:]*:\s*/, '')));
    process.stdout.write(bad.length ? '✗' : '·'); if (done % 20 === 0) process.stdout.write(` ${done}/${configs.length}\n`);
  }
  const queue = configs.slice(), pool = Array.from({length: +(arg('jobs') || 4)}, async () => { while (queue.length) await runConfig(queue.shift()); });
  await Promise.all(pool);
  await b.close(); console.log(`\nМатрица: ${configs.length} конфигураций, не прошли: ${fail}`);
  return rows.sort((x, y) => x.w - y.w);
}

(async () => {
  if (ALL || has('static')) await staticAudit();
  if (ALL || has('browser')) await browserAudit();
  let matrix = null; if (ALL || has('matrix')) matrix = await matrixAudit();
  const order = {error: 0, warn: 1, info: 2}; findings.sort((a, b) => order[a.level] - order[b.level] || a.area.localeCompare(b.area));
  const by = {}; for (const f of findings) { const k = f.level + '|' + f.area + '|' + f.msg.replace(/\d+/g, '#').slice(0, 90); (by[k] = by[k] || {...f, n: 0, wheres: []}).n++; by[k].wheres.push(f.where); }
  const groups = Object.values(by); const cnt = l => findings.filter(f => f.level === l).length;
  console.log(`\nИТОГО: ошибок ${cnt('error')}, предупреждений ${cnt('warn')}, заметок ${cnt('info')}  (групп: ${groups.length})`);
  for (const g of groups.filter(g => g.level !== 'info').slice(0, 120)) console.log(`${g.level === 'error' ? '✗' : '!'} [${g.area}] ${g.msg}${g.n > 1 ? `  ×${g.n}` : ''}\n     ${[...new Set(g.wheres)].slice(0, 3).join('; ')}`);
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({findings, groups, matrix}, null, 1));
  process.exit(cnt('error') ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
