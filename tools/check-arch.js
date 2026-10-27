#!/usr/bin/env node
/* Проверка первого экрана главной (data/redesign.json → jar, секция #arch-story) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется:
   • данные: число кадров = число положений p = число файлов в наборах зала (десктоп и телефон); карты глубины, дорожки камеры и маска этикетки на месте; спрайтов баночки и рамок — по числу кадров;
     положения возрастают; лёгких наборов и «двойной» нумерации (старый движок) нет;
   • старого тёмного вступления с баночкой и экрана с лозунгом нет, плашек «Запись на семинары» и «Дистрибьютор …» и белого флакона нет; один заголовок h1; запасной герой скрыт, пока работает сцена;
   • заставка: «Листайте» виден, баночка нарисована крупно по центру кадра на светлом бежевом фоне (первый кадр зала закрыт светлым размытием — горы не видно); по ходу сцены она раскручивается и уходит
     к подиуму (по настоящим пикселям холста, без скачков), камера отъезжает, в конце баночка стоит справа-внизу на подиуме, небольшая; шар — часть кадров зала, орбиты логотипов стоят вокруг него;
   • плавность и чёткость (по настоящим пикселям WebGL-холстов): между ключевыми кадрами картинка не «мылится» (резкость в середине шага не ниже, чем на кадрах), в покое прокрутка встаёт на ключевой
     кадр, этикетка баночки нарисована и поворачивается плавно (положение надписей меняется монотонно, без скачков);
   • слои: баночка лежит над кадрами зала и под орбитами и текстом (надписи ею не закрываются); баночка не выходит за экран;
   • сцена идёт от прокрутки: в середине шапки нет и героя нет, к концу — заголовок слева (чуть левее прежнего), кнопки нажимаются, панель «Почему выбирают Астрею?» целиком в экране;
   • после конца сцены прокрутка свободная, вверх — обратная перемотка; резкий скачок и обновление страницы не ломают картинку;
   • на телефоне заголовок, кнопки и панель умещаются в экран и не налезают друг на друга; нет горизонтальной прокрутки; «меньше движения» не прячет сцену; без WebGL и без JS показан запасной герой.
   Запуск: node tools/check-arch.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. ARCH_OUT=папка — сохранить снимки этапов; ARCH_ONLY=desktop|phone — только один размер экрана. */
'use strict';
const http = require('http'), fs = require('fs'), pth = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = pth.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

const rd = JSON.parse(fs.readFileSync(pth.join(ROOT, 'data/redesign.json'), 'utf8')), J = rd.jar, A = J && J.arch;
if (!J || !J.enabled || !A || !A.enabled) { console.log('Первый экран со сценой выключен (jar.enabled / jar.arch.enabled = false) — проверка пропущена.'); process.exit(0); }

(async () => {
  console.log('\n[данные]');
  const cnt = d => fs.existsSync(pth.join(ROOT, d)) ? fs.readdirSync(pth.join(ROOT, d)).filter(f => /\.webp$/.test(f)).length : -1;
  const N = A.frames;
  ok(A.p.length === N && !A.pb && !A.lite, 'число положений p = число кадров; лёгких наборов и положений pb нет (новый движок: камера по глубине)', [A.p.length, N, !!A.pb, !!A.lite]);
  ok(A.p.every((v, i) => i === 0 || v > A.p[i - 1]) && A.p[0] === 0 && A.p[N - 1] <= 1, 'положения кадров возрастают, начинаются с 0 и не выходят за 1');
  ok(cnt(A.desktop) === N && cnt(A.mobile) === N, 'файлы наборов зала: десктоп и телефон', [cnt(A.desktop), cnt(A.mobile)]);
  ok(A.depth && cnt(A.depth.desktop) === N && cnt(A.depth.mobile) === N, 'карты глубины: по одной на кадр (десктоп и телефон)', A.depth && [cnt(A.depth.desktop), cnt(A.depth.mobile)]);
  const camOk = f => { try { const c = JSON.parse(fs.readFileSync(pth.join(ROOT, f), 'utf8')); return c.p.length > 200 && c.p[0] === 0 && c.p[c.p.length - 1] === 1 && ['pos', 'tgt', 'lens', 'jar', 'yaw'].every(k => c[k].length === c.p.length) && c.jarScale > 0 && c.dispRange.length === 2; } catch (e) { return false; } };
  ok(A.cam && camOk(A.cam.desktop) && camOk(A.cam.mobile), 'дорожки камеры и баночки (десктоп и телефон) на месте и полные', A.cam);
  ok(A.label && fs.existsSync(pth.join(ROOT, A.label)) && A.ink > 0.1 && A.ink < 0.9, 'маска надписей этикетки и сила чернил заданы', [A.label, A.ink]);
  const JA = A.jar;
  ok(cnt(JA.desktop.dir) === N && cnt(JA.mobile.dir) === N, 'спрайты баночки: по одному на кадр (десктоп и телефон)', [cnt(JA.desktop.dir), cnt(JA.mobile.dir)]);
  const rectsOk = r => r.length === N && r.every(a => a.length === 4 && a.every(v => v >= 0 && v <= 1) && a[0] + a[2] <= 1.0001 && a[1] + a[3] <= 1.0001 && a[2] > 0.02 && a[3] > 0.02);
  ok(rectsOk(JA.desktop.rects) && rectsOk(JA.mobile.rects), 'рамки спрайтов: по кадру, внутри кадра', [JA.desktop.rects.length, JA.mobile.rects.length]);
  const S = A.sphere, sOk = t => Array.isArray(t) && t.length === 3 && t[0] > 0.1 && t[0] < 0.9 && t[1] > 0.1 && t[1] < 0.8 && t[2] > 0.08 && t[2] < 0.5;
  ok(sOk(S.desktop) && sOk(S.mobile) && !S.tex && !A.lit, 'шар: в данных только положение в готовом кадре (центр x, центр y, диаметр — доли кадра, компьютер и телефон); карт и освещённости живого шара нет', S);
  ok(!fs.existsSync(pth.join(ROOT, 'js/sphere.js')) && ['sphere-a', 'sphere-n', 'stone-sphere'].every(f => !fs.existsSync(pth.join(ROOT, 'assets/jar-arch', f + '.webp'))), 'живого шара (js/sphere.js, карты, запасная картинка) больше нет — шар запечён в кадры');
  ok(A.panel.items.length >= 3 && A.panel.title && J.cue, 'панель «Почему выбирают…» и подпись «Листайте» заполнены');
  ok(!fs.existsSync(pth.join(ROOT, 'assets/jar')) && !fs.existsSync(pth.join(ROOT, 'css/jar.css')) && !J.outro && !J.captions, 'старого вступления и экрана с лозунгом нет ни в файлах, ни в настройках');
  const html = fs.readFileSync(pth.join(ROOT, 'index.html'), 'utf8');
  const arch = (html.match(/<section class="jar-story arch-story"[\s\S]*?<\/section>/) || [''])[0];
  ok(arch.length > 500 && !/ar-chip|ar-card|ar-fg|js-milk|Запись на семинары|Дистрибьютор Dermatime/i.test(arch) && !/id="jar-story"|id="jar-outro"|js-cap|jo-title|Кожа чувствует разницу/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'в разметке главной нет старого вступления, лозунга, плашек и флакона');

  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[pth.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(Object.assign(CHROME ? {executablePath: CHROME} : {}, {args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}));

  const open = async (W, H, o = {}) => {
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: W < 700, hasTouch: W < 700, reducedMotion: o.reduced ? 'reduce' : 'no-preference', javaScriptEnabled: o.js !== false});
    await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
    await ctx.addInitScript(() => {
      window.__ASTREYA_GL_PRESERVE = true;                                                          // чтобы проверка могла читать пиксели холстов
      window.__ASTREYA_GL_GRID = 0.5;                                                                // программный WebGL (SwiftShader) в сотню раз медленнее настоящей видеокарты: сетка вдвое реже
      /* уменьшенная копия холста зала в оттенках серого (w × h) — для метрик резкости и плавности */
      window.__gray = (sel, w) => { const cv = document.querySelector(sel); if (!cv || !cv.width) return null; const h = Math.round(cv.height * w / cv.width), c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(cv, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]; return {g, w, h}; };
      window.__lap = sel => { const r = window.__gray(sel, 960); if (!r) return -1; const {g, w, h} = r; let s = 0, s2 = 0, n = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const v = 4 * g[y * w + x] - g[y * w + x - 1] - g[y * w + x + 1] - g[(y - 1) * w + x] - g[(y + 1) * w + x]; s += v; s2 += v * v; n++; } return s2 / n - (s / n) * (s / n); };
      /* сколько тёмных штрихов (надписи этикетки) на нижней части корпуса баночки: непрозрачные пиксели темнее 72 % медианы */
      window.__ink = () => { const cv = document.querySelector('.ar-jar-cv'); if (!cv || !cv.width) return -1; const w = 960, h = Math.round(cv.height * w / cv.width), c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(cv, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data; let x0 = w, x1 = -1, y0 = h, y1 = -1; for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 128) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
        if (x1 < 0) return 0; const ya = Math.round(y0 + 0.58 * (y1 - y0)), yb = Math.round(y1 - 0.06 * (y1 - y0)), xa = Math.round(x0 + 0.1 * (x1 - x0)), xb = Math.round(x1 - 0.1 * (x1 - x0)), L = [];
        for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { const i = (yy * w + xx) * 4; if (d[i + 3] > 240) L.push(.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]); }
        if (L.length < 50) return 0; const m = L.slice().sort((a, b) => a - b)[L.length >> 1]; return L.filter(v => v < m * 0.72).length; };
      window.__jbox = () => { const cv = document.querySelector('.ar-jar-cv'); if (!cv || !cv.width) return null; const w = 1280, h = Math.round(cv.height * w / cv.width), c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(cv, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data; let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0; for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4 + 3] > 128) { n++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } return n ? {l: x0 / w, r: x1 / w, t: y0 / h, b: y1 / h, n} : {n: 0}; };
    });
    if (o.noCanvas) await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const p = await ctx.newPage(); p.errs = []; p.reqs = [];
    p.on('pageerror', e => p.errs.push(String(e.message).slice(0, 160)));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.|404|ERR_FAILED/.test(m.text())) p.errs.push(m.text().slice(0, 160)); });
    p.on('request', r => { if (/assets\/jar-arch\//.test(r.url())) p.reqs.push(r.url()); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    return {ctx, p};
  };
  const skipSplash = async p => { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await wait(1200); };
  const geo = p => p.evaluate(() => { const r = document.getElementById('arch-story'); if (!r) return null; const st = r.firstElementChild; return {top: Math.round(r.getBoundingClientRect().top + scrollY), tot: r.offsetHeight - st.clientHeight, h: r.offsetHeight}; });
  /* перейти к положению pv: прокрутка + ожидание, пока плейхед не дойдёт (в программном WebGL кадр рисуется секунды, а пружина стоит на ключевом кадре — ждём её остановки) */
  const at = async (p, g, pv, ms = 1700) => { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + pv * g.tot)); await wait(ms);
    try { await p.waitForFunction(t => { const c = window.Astreya.jar.arch, s = c && c.state(); return s && s.firstDrawn && Math.abs(s.p - s.pTarget) < 0.012 && (s.pTarget < 0.003 || s.drawn); }, pv, {timeout: 60000, polling: 250}); } catch (e) { /* — */ } await wait(500); };
  /* что нарисовано на холсте баночки: рамка непрозрачных пикселей в координатах экрана и доля заполнения (по настоящим пикселям, шаг 6) */
  const jarBox = p => p.evaluate(() => {
    const cv = document.querySelector('.ar-jar-cv'); if (!cv || !cv.width) return null;          // рамка — по плотным пикселям (мягкая тень под баночкой на заставке прозрачнее 50 % и в неё не входит)
    const w = cv.width, h = cv.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', {willReadFrequently: true}); cx.drawImage(cv, 0, 0); const d = cx.getImageData(0, 0, w, h).data, r = cv.getBoundingClientRect(), k = r.width / w;
    let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
    for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) if (d[(y * w + x) * 4 + 3] > 128) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return n ? {l: Math.round(r.left + x0 * k), t: Math.round(r.top + y0 * k), r: Math.round(r.left + x1 * k), b: Math.round(r.top + y1 * k), n} : {n: 0};
  });
  const orbitBox = p => p.evaluate(() => { const e = document.querySelector('.ar-orb'); if (!e) return null; const r = e.getBoundingClientRect(); return {cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, op: +getComputedStyle(document.querySelector('.ar-orbit')).opacity}; });
  const view = p => p.evaluate(() => {
    const q = s => document.querySelector(s), rc = e => { if (!e) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom)}; };
    const op = e => e ? +getComputedStyle(e).opacity : -1, c = Astreya.jar.arch, s = c && c.state(), hdr = q('#hdr'), cta = q('.ar-cta a'), cr = cta && cta.getBoundingClientRect();
    return {p: s ? +s.p.toFixed(3) : -1, drawn: !!(s && s.drawn), loaded: s ? s.loaded : 0, resident: s ? s.resident : 0, gl: !!(s && s.gl), snapped: !!(s && s.snapped), single: !!(s && s.drawn && s.drawn.single), jar: s ? s.jar : null, h1: op(q('.ar-h')), lead: op(q('.ar-lead')), cta: op(q('.ar-cta')), panel: op(q('.ar-panel')), cue: op(q('.ar-cue')), orbit: op(q('.ar-orbit')),
      hdrB: hdr ? Math.round(hdr.getBoundingClientRect().bottom) : 0, bodyCls: document.body.className, hr: rc(q('.ar-h')), er: rc(q('.ar-e')), lr: rc(q('.ar-lead')), cr: rc(q('.ar-cta')), pr: rc(q('.ar-panel')), orb: rc(q('.ar-orbit')), facts: rc(q('.ar-facts')), more: rc(q('.ar-more')), moreTxt: (q('.ar-more') || {}).textContent || '',
      hit: cr ? (() => { const e = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2); return !!(e && e.closest('.ar-cta a')); })() : false,
      stageTop: Math.round(q('#arch-story').getBoundingClientRect().top), h1count: document.querySelectorAll('h1').length, hero: getComputedStyle(q('.hero')).display, sw: document.documentElement.scrollWidth,
      old: ['#jar-story', '#jar-outro', '.ar-chip', '.ar-card', '.ar-fg', '.js-milk', '.js-cap'].filter(s => q(s)),
      z: (() => { const zi = e => e ? (parseInt(getComputedStyle(e).zIndex, 10) || 0) : -1; return {world: zi(q('.ar-world')), copy: zi(q('.ar-copy')), jar: zi(q('.ar-jar-cv')), orbit: zi(q('.ar-orb'))}; })()};
  });
  const shot = async (p, name) => { if (process.env.ARCH_OUT) await p.screenshot({path: pth.join(process.env.ARCH_OUT, name + '.png')}); };

  for (const [name, W, H, mobile] of [['компьютер', 1440, 900, false], ['телефон', 390, 844, true]].filter(x => !process.env.ARCH_ONLY || process.env.ARCH_ONLY === (x[3] ? 'phone' : 'desktop'))) {
    console.log(`\n[${name}]`);
    const {ctx, p} = await open(W, H);
    await p.goto(base + 'index.html'); await skipSplash(p); await wait(2500);
    const g = await geo(p); ok(g && g.tot > H * 2, 'сцена на месте и закреплена на несколько экранов', g);
    let v = await view(p);
    ok(v.h1count === 1, 'на странице один заголовок первого уровня', v.h1count); ok(v.hero === 'none', 'запасной герой скрыт, пока работает сцена', v.hero);
    ok(v.old.length === 0, 'нет старого вступления, лозунга, плашек, флакона и молочного слоя', v.old);
    ok(p.reqs.length > 0 && p.reqs.every(u => mobile ? /jar-arch\/(m|zm|jm|cam-m|label)/.test(u) : /jar-arch\/(d|zd|j|cam-d|label)/.test(u)), 'грузятся наборы под размер экрана (десктоп — d/zd/j, телефон — m/zm/jm), лёгких наборов нет', p.reqs.slice(0, 3));

    /* ---- заставка ---- */
    await at(p, g, 0); v = await view(p);
    ok(v.cue > 0.95 && v.h1 < 0.02 && v.panel < 0.02, 'заставка: «Листайте» виден, героя ещё нет', {cue: v.cue, h1: v.h1});
    ok(!/arch-hide/.test(v.bodyCls) && /arch-top/.test(v.bodyCls), 'заставка: шапка на месте и прозрачная', v.bodyCls);
    ok(v.drawn && v.jar && v.jar.shown && v.jar.loaded > 1, 'заставка: зал и спрайт баночки нарисованы', {drawn: v.drawn, jar: v.jar});
    const jb0 = await jarBox(p);
    ok(jb0 && jb0.n > 400 && jb0.l > W * 0.12 && jb0.r < W * 0.88 && (jb0.r - jb0.l) > W * (mobile ? 0.38 : 0.26) && jb0.t >= 0 && jb0.b <= H, 'заставка: баночка крупно по центру, целиком в экране', {jb0, W, H});
    ok(jb0 && Math.abs((jb0.l + jb0.r) / 2 - W / 2) < W * 0.02 && Math.abs((jb0.t + jb0.b) / 2 - H / 2) < H * 0.035, 'заставка: баночка ровно по центру экрана (по горизонтали и вертикали)', {cx: jb0 && (jb0.l + jb0.r) / 2, cy: jb0 && (jb0.t + jb0.b) / 2, W, H});
    const top0 = await p.evaluate(() => { const st = document.querySelector('#arch-story .js-stage'), cue = document.querySelector('.ar-cue i'), a = cue && getComputedStyle(cue, '::after'); return {stageTop: st.getBoundingClientRect().top, scrollY: Math.round(scrollY), cueAnim: a && a.animationName, cueState: a && a.animationPlayState}; });
    ok(top0.scrollY === 0 && top0.stageTop <= 0.5, 'заставка: сцена начинается от самого верха экрана (под прозрачной шапкой), белой полосы над ней нет', top0);
    ok(top0.cueAnim === 'jarCue' && top0.cueState === 'running', '«Листайте»: по полоске бежит свет (анимация идёт)', top0);
    await shot(p, `arch-0-splash-${mobile ? 'phone' : 'desktop'}`);

    /* ---- плавность и чёткость по настоящим пикселям холстов ---- */
    const Pk = A.p;
    const ink0 = await p.evaluate(() => window.__ink());
    ok(ink0 > 250, 'заставка: надписи этикетки нарисованы на баночке (тёмные штрихи на корпусе)', ink0);
    const sh = await p.evaluate(() => { const c = Astreya.jar.ctrl; c.jump(0); const l0 = window.__lap('.js-cv'); c.jump(0.3); return {l0, l30: window.__lap('.js-cv')}; });
    ok(sh.l0 >= 0 && sh.l0 < sh.l30 * 0.5, 'первый кадр закрыт светлым размытием: резкость на заставке (p = 0) вдвое ниже, чем после того, как оно сошло (p = 0,3) — горы не видно', sh);
    for (const k of [14, 26, 40]) {
      await p.evaluate(([a, b]) => Astreya.jar.ctrl.prefetch(a, b), [k - 1, k + 2]);
      const r = await p.evaluate(([a, b]) => { const c = Astreya.jar.ctrl, L = () => window.__lap('.js-cv'); c.jump(a); const l0 = L(); c.jump((a + b) / 2); const lm = L(), dr = c.state().drawn; c.jump(b); return {l0, lm, l1: L(), dr}; }, [Pk[k], Pk[k + 1]]);
      ok(r.lm >= 0.7 * Math.min(r.l0, r.l1) && r.dr && !r.dr.single && Math.abs(r.dr.t - 0.5) < 0.02, `чёткость между ключевыми кадрами ${k}–${k + 1}: в середине шага не ниже 70 % резкости кадров (кадры не смешиваются «картинка в картинку»)`, r);
    }
    await p.evaluate(([a, b]) => Astreya.jar.ctrl.prefetch(a, b), [24, 35]);
    const walk = await p.evaluate(([a, b]) => { const c = Astreya.jar.ctrl, n = 36, boxes = [], mad = []; let prev = null;
      for (let i = 0; i <= n; i++) { c.jump(a + (b - a) * i / n); boxes.push(window.__jbox()); const g = window.__gray('.js-cv', 240).g; if (prev) { let q = 0; for (let j = 0; j < g.length; j++) q += Math.abs(g[j] - prev[j]); mad.push(q / g.length); } prev = g; }
      return {boxes, mad}; }, [Pk[24], Pk[34]]);
    { const bx = walk.boxes.filter(b => b && b.n), cxs = bx.map(b => (b.l + b.r) / 2), cys = bx.map(b => b.b), ws = bx.map(b => b.r - b.l), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
      const d2 = a => a.slice(2).map((v, i) => Math.abs(v - 2 * a[i + 1] + a[i])), d1 = a => a.slice(1).map((v, i) => Math.abs(v - a[i]));
      const tol = a => Math.max(0.0035, 0.5 * mean(d1(a)));
      ok(bx.length === walk.boxes.length && Math.max(...d2(cxs)) <= tol(cxs) && Math.max(...d2(cys)) <= tol(cys) && Math.max(...d2(ws)) <= tol(ws), 'баночка при ходе прокрутки не дёргается: центр, низ и ширина меняются плавно (вторая разность в пределах допуска)', {cx: Math.max(...d2(cxs)).toFixed(4), cy: Math.max(...d2(cys)).toFixed(4), w: Math.max(...d2(ws)).toFixed(4), tolx: tol(cxs).toFixed(4)});
      const m = mean(walk.mad);
      ok(Math.min(...walk.mad) > 0.3 * m && Math.max(...walk.mad) < 2.2 * m, 'камера идёт без «стоящих» кадров и скачков: разница между соседними шагами равномерна', {min: Math.min(...walk.mad).toFixed(2), mean: m.toFixed(2), max: Math.max(...walk.mad).toFixed(2)}); }
    await p.evaluate(() => Astreya.jar.ctrl.unpin());
    /* в покое прокрутка встаёт на ключевой кадр: показан сам отрендеренный кадр, без пересчёта */
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + (Pk[30] + (Pk[31] - Pk[30]) * 0.37) * g.tot)); await wait(1300); await p.waitForFunction(() => Astreya.jar.ctrl.state().snapped, null, {timeout: 20000, polling: 200}).catch(() => {}); v = await view(p);
    ok(v.snapped && v.single && Math.abs(v.p - Pk[30]) < 2e-3, 'в покое картинка встаёт на ближайший ключевой кадр (пиксель в пиксель)', {p: v.p, key: Pk[30], snapped: v.snapped, single: v.single});

    /* ---- движение: двигается только камера — баночка стоит на подиуме, шар въезжает в кадр ---- */
    const boxes = [], PV = [0.15, 0.3, 0.45, 0.6, 0.8, 0.97], wW = Math.max(W, mobile ? H * 9 / 16 : H * 16 / 9);
    for (const pv of PV) {
      await at(p, g, pv); const bx = await jarBox(p); boxes.push([pv, bx]);
      if (pv === 0.45) { v = await view(p); ok(/arch-hide/.test(v.bodyCls) && v.hdrB <= 1, 'в середине сцены шапка убрана', {cls: v.bodyCls, hdrB: v.hdrB}); ok(v.h1 < 0.02 && v.panel < 0.02 && v.cue < 0.02, 'в середине сцены героя и «Листайте» нет', {h1: v.h1, cue: v.cue}); await shot(p, `arch-45-flight-${mobile ? 'phone' : 'desktop'}`); }
    }
    const wid = bx => bx && bx.n ? bx.r - bx.l : 0, cxOf = bx => (bx.l + bx.r) / 2, cyOf = bx => bx.b;
    ok(boxes.every(([, bx]) => bx && bx.n > 0), 'баночка нарисована на всех положениях прокрутки', boxes.map(a => [a[0], a[1] && a[1].n]));
    ok(boxes.every(([, bx]) => bx.l >= -2 && bx.r <= W + 2 && bx.t >= -2 && bx.b <= H + 2), 'баночка нигде не выходит за экран', boxes.map(a => a[1]));
    ok(wid(boxes[1][1]) > wid(boxes[2][1]) * 0.98 && wid(boxes[2][1]) > wid(boxes[3][1]) * 0.98 && wid(boxes[3][1]) > wid(boxes[4][1]) * 0.98 && wid(boxes[4][1]) >= wid(boxes[5][1]) * 0.95 && wid(boxes[5][1]) < wid(jb0) * 0.6, 'камера отъезжает: баночка по ходу сцены уменьшается (после первых 15 % приближения) и в конце вдвое меньше, чем на заставке', [wid(jb0), ...boxes.map(a => wid(a[1]))]);
    const fin = boxes[5][1];
    ok(fin.l > jb0.l + W * 0.12 && fin.t > jb0.t + H * 0.12 && (fin.r - fin.l) < W * (mobile ? 0.3 : 0.16), 'в конце баночка стоит правее и ниже заставки, небольшая (на подиуме)', {jb0, fin});
    const path = [jb0, ...boxes.map(a => a[1])];
    ok(path.every((bx, i) => i === 0 || (Math.abs(cxOf(bx) - cxOf(path[i - 1])) < W * 0.36 && Math.abs(cyOf(bx) - cyOf(path[i - 1])) < H * 0.4)), 'баночка перемещается плавно, без скачков между положениями прокрутки (она всё время на подиуме, парения нет)', path.map(bx => [Math.round(cxOf(bx)), Math.round(cyOf(bx))]));
    const sd = mobile ? S.mobile : S.desktop, ob = await orbitBox(p);
    ok(ob && Math.abs(ob.w - sd[2] * wW) <= wW * 0.01, 'орбиты логотипов: диаметр равен диаметру шара в готовом кадре (по данным)', {ob, d: sd[2] * wW});
    ok(ob && Math.abs(ob.cx - (W / 2 + (sd[0] - 0.5) * wW)) <= 3 && ob.cy > H * 0.2 && ob.cy < H * 0.6, 'орбиты стоят вокруг шара: центр — по данным, в верхней половине экрана, выше нижней панели', {ob, sd});

    /* ---- финал ---- */
    await at(p, g, 0.7); v = await view(p); ok(v.h1 > 0.05 && v.h1 < 0.95, 'камера почти отъехала — заголовок проявляется (не мгновенно)', v.h1);
    await at(p, g, 0.97, 2200); v = await view(p);
    ok(v.h1 > 0.97 && v.lead > 0.97 && v.cta > 0.97 && v.panel > 0.97, 'финал: заголовок, текст, кнопки и панель проявились', {h1: v.h1, lead: v.lead, cta: v.cta, panel: v.panel});
    ok(!/arch-hide/.test(v.bodyCls) && v.hdrB >= 40, 'финал: шапка вернулась', {cls: v.bodyCls, hdrB: v.hdrB});
    ok(v.hr && v.hr.l >= 0 && v.hr.r <= W && v.er.t >= v.hdrB - 2, 'финал: заголовок целиком в экране и под шапкой', [v.hr, v.er, v.hdrB]);
    ok(v.cr && v.cr.b <= H && v.pr && v.pr.b <= H + 1 && v.pr.t >= v.cr.b - 2, 'финал: кнопки и панель в экране и не налезают друг на друга', [v.cr, v.pr]);
    if (!mobile) {
      ok(v.hr.r <= W * 0.6, 'финал: текст слева, ниша справа свободна', v.hr);
      ok(v.hr.l >= W * 0.08 && v.hr.l <= W * 0.2, 'финал: надписи слева — правее проёма с комнатой и стеллажом (не заходят на него), но не дальше пятой части экрана (слева не остаётся пустой полосы)', {l: v.hr.l});
      ok(v.orbit > 0.97 && v.facts !== null, 'финал: орбиты с логотипами вокруг шара проявились', {orbit: v.orbit});
    }
    ok(v.z.world <= v.z.copy && v.z.jar > 0 && v.z.orbit > v.z.jar, 'слои: кадры зала → баночка → орбиты (внутри мира), мир → текст: баночка не закрывает надписи', v.z);
    ok(v.hit, 'финал: кнопка «Перейти в каталог» нажимается (ничто не перекрывает)');
    ok(/Подробнее/.test(v.moreTxt) && v.more && v.more.b <= H + 1, 'финал: в нижней панели есть кнопка «Подробнее» и она в экране', {t: v.moreTxt, r: v.more});
    ok(v.sw <= W + 1, 'нет горизонтальной прокрутки', [v.sw, W]);
    ok(v.gl && v.resident > 0 && v.loaded > 10, 'WebGL-движок работает: ключевые кадры загружены, текстуры в видеопамяти', {gl: v.gl, resident: v.resident, loaded: v.loaded});
    const jc = await p.evaluate(() => { const c = document.querySelector('.ar-jar-cv'), w = document.querySelector('.ar-world'); return {cw: c.width, ww: w.clientWidth, dpr: window.devicePixelRatio || 1, pearl: !!document.querySelector('.ar-pearl, .ar-gl, .ar-poster'), webgl: !!(window.Astreya && window.Astreya.sphere)}; });
    ok(jc.cw >= jc.ww * Math.min(jc.dpr, 2) * 0.99, 'баночка: холст рисуется в полном разрешении экрана (не мельче, чем пиксели устройства)', jc);
    ok(!jc.pearl && !jc.webgl, 'живого шара на странице нет (ни холста, ни картинки, ни скрипта): шар — часть кадров зала', jc);
    await shot(p, `arch-97-final-${mobile ? 'phone' : 'desktop'}`);

    /* ---- после сцены и обратная перемотка ---- */
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + g.tot)); await wait(900);
    const t0 = (await view(p)).stageTop; await p.evaluate(() => window.scrollBy({top: 200, behavior: 'instant'})); await wait(500); const t1 = (await view(p)).stageTop;
    ok(Math.abs((t0 - t1) - 200) <= 2, 'после конца сцены прокрутка свободная: за 200 px прокрутки сцена уехала на 200 px', [t0, t1]);
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + g.h + H * 0.3)); await wait(900); v = await view(p);
    ok(v.stageTop < -g.tot, 'дальше по странице сцена осталась выше', v.stageTop);
    await at(p, g, 0.6); v = await view(p); ok(Math.abs(v.p - 0.6) < 0.03 && /arch-hide/.test(v.bodyCls) && v.h1 < 0.02, 'вверх: кадры перематываются назад, шапка снова убрана, герой ушёл', {p: v.p, cls: v.bodyCls, h1: v.h1});
    const jbBack = await jarBox(p); ok(jbBack && jbBack.n > 0 && Math.abs(wid(jbBack) - wid(boxes[3][1])) < W * 0.1 && wid(jbBack) > wid(boxes[5][1]), 'вверх: баночка возвращается по тому же пути (размер как на пути вниз)', [wid(jbBack), wid(boxes[3][1])]);
    await at(p, g, 0.02, 400); await at(p, g, 0.96, 1900); v = await view(p); ok(Math.abs(v.p - 0.96) < 0.03 && v.drawn && v.h1 > 0.95, 'резкий скачок из начала в конец: кадр на месте, герой проявлен', {p: v.p, drawn: v.drawn, h1: v.h1});
    await at(p, g, 0.4, 100); await at(p, g, 0.9, 150); await at(p, g, 0.05, 150); await at(p, g, 0.62, 1900); const jbMix = await jarBox(p); v = await view(p);
    ok(Math.abs(v.p - 0.62) < 0.03 && jbMix && jbMix.n > 0, 'резкие рывки вперёд-назад: баночка и кадр на месте', {p: v.p, jb: jbMix && jbMix.n});
    await p.reload(); await skipSplash(p); await wait(1500); v = await view(p);
    ok(v.p > 0.9 && v.h1 > 0.9, 'обновление страницы открывает героя (конец сцены), а не заставку', {p: v.p, h1: v.h1});
    ok(p.errs.length === 0, 'нет ошибок JS', p.errs);
    await ctx.close();
  }

  console.log('\n[«меньше движения»]');
  { const {ctx, p} = await open(1440, 900, {reduced: true}); await p.goto(base + 'index.html'); await skipSplash(p); await wait(2000); const g = await geo(p); await at(p, g, 0.97, 2000); const v = await view(p), jb = await jarBox(p);
    ok(v.h1 > 0.97 && v.panel > 0.97 && v.drawn && jb && jb.n > 0, 'при «меньше движения» сцена, баночка и герой на месте (решение заказчика: сцена показывается всегда)', {h1: v.h1, drawn: v.drawn, jb: jb && jb.n}); ok(p.errs.length === 0, 'нет ошибок JS', p.errs); await ctx.close(); }

  console.log('\n[запасной вариант]');
  { const {ctx, p} = await open(1440, 900, {noCanvas: true}); await p.goto(base + 'index.html'); await skipSplash(p);
    const r = await p.evaluate(() => { const q = s => document.querySelector(s), vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }; return {arch: vis(q('#arch-story')), hero: vis(q('.hero')), cta: vis(q('.hero-copy .row a')), h: !!q('.hero .h1x'), h1: document.querySelectorAll('h1').length}; });
    ok(!r.arch && r.hero && r.cta, 'canvas недоступен: сцены нет, показан прежний герой с кнопками', r); ok(r.h1 === 1, 'и один заголовок первого уровня', r);
    await ctx.close(); }
  { const {ctx, p} = await open(1440, 900, {js: false}); await p.goto(base + 'index.html'); await wait(800);
    const r = await p.evaluate(() => { const q = s => document.querySelector(s), vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }; return {arch: vis(q('#arch-story')), hero: vis(q('.hero'))}; });
    ok(!r.arch && r.hero, 'без JavaScript: сцены нет, виден прежний герой', r); await ctx.close(); }

  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
