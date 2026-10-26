#!/usr/bin/env node
/* Проверка первого экрана главной (data/redesign.json → jar, секция #arch-story) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется:
   • данные: число кадров = число положений p = число файлов в наборах зала (десктоп и телефон), лёгкие наборы — 2N−1 файлов; спрайтов баночки и рамок — по числу кадров; положения возрастают;
   • старого тёмного вступления с баночкой и экрана с лозунгом нет, плашек «Запись на семинары» и «Дистрибьютор …» и белого флакона нет; один заголовок h1; запасной герой скрыт, пока работает сцена;
   • заставка: «Листайте» виден, баночка нарисована крупно по центру (стоит на подиуме), шара в кадре ещё нет — он стоит в зале рядом с камерой; по ходу сцены двигается только камера: баночка
     плавно уменьшается и смещается вправо-вниз (по настоящим пикселям холста, без скачков), шар въезжает в кадр сверху и садится на своё место (размер на готовом кадре — по данным пути камеры),
     зал светлеет от полумрака к дневному свету (lit); при курсоре шар живой (поворачивается, свет меняется);
   • слои: баночка лежит над шаром и под орбитами и текстом (надписи ею не закрываются); баночка не выходит за экран;
   • сцена идёт от прокрутки: в середине шапки нет и героя нет, к концу — заголовок слева (чуть левее прежнего), кнопки нажимаются, панель «Почему выбирают Астрею?» целиком в экране;
   • после конца сцены прокрутка свободная, вверх — обратная перемотка; резкий скачок и обновление страницы не ломают картинку;
   • на телефоне заголовок, кнопки и панель умещаются в экран и не налезают друг на друга; нет горизонтальной прокрутки; «меньше движения» не прячет сцену; без canvas и без JS показан запасной герой.
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
  ok(A.p.length === N && A.pb.length === 2 * N - 1, 'число положений: p = кадры, pb = 2N−1', [A.p.length, A.pb.length, N]);
  ok(A.p.every((v, i) => i === 0 || v > A.p[i - 1]) && A.pb.every((v, i) => i === 0 || v > A.pb[i - 1]) && A.p[0] === 0 && A.p[N - 1] <= 1, 'положения кадров возрастают, начинаются с 0 и не выходят за 1');
  ok(cnt(A.desktop) === N && cnt(A.mobile) === N, 'файлы наборов зала: десктоп и телефон', [cnt(A.desktop), cnt(A.mobile)]);
  ok(cnt(A.lite.desktop) === 2 * N - 1 && cnt(A.lite.mobile) === 2 * N - 1, 'файлы лёгких наборов зала: 2N−1', [cnt(A.lite.desktop), cnt(A.lite.mobile)]);
  const JA = A.jar;
  ok(cnt(JA.desktop.dir) === N && cnt(JA.mobile.dir) === N, 'спрайты баночки: по одному на кадр (десктоп и телефон)', [cnt(JA.desktop.dir), cnt(JA.mobile.dir)]);
  const rectsOk = r => r.length === N && r.every(a => a.length === 4 && a.every(v => v >= 0 && v <= 1) && a[0] + a[2] <= 1.0001 && a[1] + a[3] <= 1.0001 && a[2] > 0.02 && a[3] > 0.02);
  ok(rectsOk(JA.desktop.rects) && rectsOk(JA.mobile.rects), 'рамки спрайтов: по кадру, внутри кадра', [JA.desktop.rects.length, JA.mobile.rects.length]);
  const S = A.sphere, tex = S.tex, sub = (S.desktop.track.length - 1) / (N - 1);
  const trOk = s => s && s.ref > 0.1 && s.ref <= 1.2 && Number.isInteger(sub) && sub >= 1 && s.track.length === (N - 1) * sub + 1 && s.track.every(a => a.length === 3 && a.every(Number.isFinite)) && s.track[s.track.length - 1][2] > 0.1;
  ok(trOk(S.desktop) && trOk(S.mobile) && ['a', 'n', 'poster'].every(k => fs.existsSync(pth.join(ROOT, tex[k]))), 'шар: путь по кадрам (десктоп и телефон) и карты (цвет, нормали, запасная картинка) на месте', {sub, d: S.desktop.track.length, m: S.mobile.track.length});
  ok(Array.isArray(A.lit) && A.lit.length === N && A.lit[0] < 0.45 && A.lit[N - 1] > 0.99 && A.lit.every((v, i) => i === 0 || v >= A.lit[i - 1]), 'освещённость зала по кадрам: от полумрака к дневному свету, не убывает', [A.lit[0], A.lit[N - 1]]);
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
  const at = async (p, g, pv, ms = 1700) => { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + pv * g.tot)); await wait(ms); };
  /* что нарисовано на холсте баночки: рамка непрозрачных пикселей в координатах экрана и доля заполнения (по настоящим пикселям, шаг 6) */
  const jarBox = p => p.evaluate(() => {
    const cv = document.querySelector('.ar-jar-cv'); if (!cv) return null;
    const cx = cv.getContext('2d'), w = cv.width, h = cv.height, d = cx.getImageData(0, 0, w, h).data, r = cv.getBoundingClientRect(), k = r.width / w;
    let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
    for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) if (d[(y * w + x) * 4 + 3] > 30) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return n ? {l: Math.round(r.left + x0 * k), t: Math.round(r.top + y0 * k), r: Math.round(r.left + x1 * k), b: Math.round(r.top + y1 * k), n} : {n: 0};
  });
  const pearl = p => p.evaluate(() => { const e = document.querySelector('.ar-pearl'); if (!e) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left * 10) / 10, t: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, op: +getComputedStyle(e).opacity, gl: e.classList.contains('gl-on'), off: e.classList.contains('gl-off')}; });
  const view = p => p.evaluate(() => {
    const q = s => document.querySelector(s), rc = e => { if (!e) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom)}; };
    const op = e => e ? +getComputedStyle(e).opacity : -1, c = Astreya.jar.arch, s = c && c.state(), hdr = q('#hdr'), cta = q('.ar-cta a'), cr = cta && cta.getBoundingClientRect();
    return {p: s ? +s.p.toFixed(3) : -1, drawn: !!(s && s.drawn), loaded: s ? s.loaded : 0, tiers: s ? s.tiers : [], jar: s ? s.jar : null, h1: op(q('.ar-h')), lead: op(q('.ar-lead')), cta: op(q('.ar-cta')), panel: op(q('.ar-panel')), cue: op(q('.ar-cue')), orbit: op(q('.ar-orbit')),
      hdrB: hdr ? Math.round(hdr.getBoundingClientRect().bottom) : 0, bodyCls: document.body.className, hr: rc(q('.ar-h')), er: rc(q('.ar-e')), lr: rc(q('.ar-lead')), cr: rc(q('.ar-cta')), pr: rc(q('.ar-panel')), orb: rc(q('.ar-orbit')), facts: rc(q('.ar-facts')), more: rc(q('.ar-more')), moreTxt: (q('.ar-more') || {}).textContent || '',
      hit: cr ? (() => { const e = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2); return !!(e && e.closest('.ar-cta a')); })() : false,
      stageTop: Math.round(q('#arch-story').getBoundingClientRect().top), h1count: document.querySelectorAll('h1').length, hero: getComputedStyle(q('.hero')).display, sw: document.documentElement.scrollWidth,
      old: ['#jar-story', '#jar-outro', '.ar-chip', '.ar-card', '.ar-fg', '.js-milk', '.js-cap'].filter(s => q(s)),
      z: (() => { const zi = e => e ? (parseInt(getComputedStyle(e).zIndex, 10) || 0) : -1; return {world: zi(q('.ar-world')), copy: zi(q('.ar-copy')), jar: zi(q('.ar-jar-cv')), pearl: zi(q('.ar-sph')), orbit: zi(q('.ar-orb'))}; })()};
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
    ok(p.reqs.length > 0 && p.reqs.every(u => mobile ? /jar-arch\/(m|mm|jm|sphere|stone)/.test(u) : /jar-arch\/(d|dm|j|sphere|stone)/.test(u)), 'грузятся наборы под размер экрана (десктоп — d/j, телефон — m/jm)', p.reqs.slice(0, 3));

    /* ---- заставка ---- */
    await at(p, g, 0); v = await view(p);
    ok(v.cue > 0.95 && v.h1 < 0.02 && v.panel < 0.02, 'заставка: «Листайте» виден, героя ещё нет', {cue: v.cue, h1: v.h1});
    ok(!/arch-hide/.test(v.bodyCls) && /arch-top/.test(v.bodyCls), 'заставка: шапка на месте и прозрачная', v.bodyCls);
    ok(v.drawn && v.jar && v.jar.shown && v.jar.loaded > 1, 'заставка: зал и спрайт баночки нарисованы', {drawn: v.drawn, jar: v.jar});
    const pe0 = await pearl(p), jb0 = await jarBox(p);
    ok(jb0 && jb0.n > 400 && jb0.l > W * 0.12 && jb0.r < W * 0.88 && (jb0.r - jb0.l) > W * (mobile ? 0.38 : 0.26) && jb0.t >= 0 && jb0.b <= H, 'заставка: баночка крупно по центру, целиком в экране', {jb0, W, H});
    ok(pe0 && pe0.w < 2, 'заставка: шар стоит в зале рядом с камерой, в кадре его ещё нет (слой не показан и не рисуется)', pe0);
    await shot(p, `arch-0-splash-${mobile ? 'phone' : 'desktop'}`);

    /* ---- движение: двигается только камера — баночка стоит на подиуме, шар въезжает в кадр ---- */
    const boxes = [], pearls = [pe0], PV = [0.15, 0.3, 0.45, 0.6, 0.8, 0.97], wW = Math.max(W, mobile ? H * 9 / 16 : H * 16 / 9);
    for (const pv of PV) {
      await at(p, g, pv); const bx = await jarBox(p), pe = await pearl(p); boxes.push([pv, bx]); pearls.push(pe);
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
    const lastD = (mobile ? S.mobile : S.desktop).track.slice(-1)[0][2] * wW, pf = pearls[pearls.length - 1];
    ok(pearls[1].w < 2 && pearls[2].w < 2, 'шар ещё не в кадре на первых 15–30 % прокрутки: он стоит в зале рядом с камерой и въезжает позже', [pearls[1].w, pearls[2].w]);
    ok(pearls[3].w > 20 && pearls[3].w > pf.w * 1.15, 'шар въезжает в кадр сверху крупным планом, затем уменьшается по мере отъезда камеры', pearls.map(e => Math.round(e.w)));
    ok(Math.abs(pf.w - lastD) <= wW * 0.03 && pf.l + pf.w / 2 > W * (mobile ? 0.3 : 0.58) && pf.l + pf.w / 2 < W * (mobile ? 0.7 : 0.85) && pf.t + pf.h / 2 > 0 && pf.t + pf.h / 2 < H, 'готовый кадр: шар стоит на своём месте (размер и положение — по данным камеры), справа от текста', {pf, lastD});

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
    ok(v.z.world <= v.z.copy && v.z.jar > v.z.pearl && v.z.orbit > v.z.jar, 'слои: шар → баночка → орбиты (внутри мира), мир → текст: баночка не закрывает надписи', v.z);
    ok(v.hit, 'финал: кнопка «Перейти в каталог» нажимается (ничто не перекрывает)');
    ok(/Подробнее/.test(v.moreTxt) && v.more && v.more.b <= H + 1, 'финал: в нижней панели есть кнопка «Подробнее» и она в экране', {t: v.moreTxt, r: v.more});
    ok(v.sw <= W + 1, 'нет горизонтальной прокрутки', [v.sw, W]);
    ok(v.tiers[0] > 0, 'кадры зала полного набора загружены', v.tiers);
    const pe1 = await pearl(p);
    ok(pe1 && (pe1.gl || pe1.off || pe1.w > 0), 'шар: WebGL запущен или показана запасная картинка', pe1);
    if (pe1 && pe1.gl && !mobile) {                                   // живой шар: сам вращается и ловит свет за курсором (сравниваем настоящие пиксели холста)
      const sph = () => p.evaluate(() => Astreya.sphere.state());
      await p.mouse.move(W / 2, H / 2); await wait(900); const s0 = await sph(); await wait(1400); const s1 = await sph();
      ok(s1.running && s1.yaw - s0.yaw > 0.08, 'шар живой: сам медленно вращается (поры и зерно камня движутся)', {s0: s0.yaw, s1: s1.yaw});
      await p.mouse.move(W - 40, H / 2); await wait(1800); const s2 = await sph(); await p.mouse.move(40, 40); await wait(1800); const s3 = await sph();
      ok(Math.abs(s2.ty - s3.ty) > 0.4 && Math.abs(s2.lx - s3.lx) > 0.5, 'шар живой: поворот и свет следуют за курсором', {s2, s3});
    }
    await shot(p, `arch-97-final-${mobile ? 'phone' : 'desktop'}`);

    /* ---- после сцены и обратная перемотка ---- */
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + g.tot)); await wait(900);
    const t0 = (await view(p)).stageTop; await p.evaluate(() => window.scrollBy({top: 200, behavior: 'instant'})); await wait(500); const t1 = (await view(p)).stageTop;
    ok(Math.abs((t0 - t1) - 200) <= 2, 'после конца сцены прокрутка свободная: за 200 px прокрутки сцена уехала на 200 px', [t0, t1]);
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + g.h + H * 0.3)); await wait(900); v = await view(p);
    ok(v.stageTop < -g.tot, 'дальше по странице сцена осталась выше', v.stageTop);
    await at(p, g, 0.5); v = await view(p); ok(Math.abs(v.p - 0.5) < 0.03 && /arch-hide/.test(v.bodyCls) && v.h1 < 0.02, 'вверх: кадры перематываются назад, шапка снова убрана, герой ушёл', {p: v.p, cls: v.bodyCls, h1: v.h1});
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
