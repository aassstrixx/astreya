#!/usr/bin/env node
/* Проверка архитектурного первого экрана главной (data/redesign.json → jar.arch, #arch-story) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется:
   • данные: число кадров = число положений p = число файлов в наборах (десктоп и телефон), лёгкие наборы — 2N−1 файлов; положения возрастают;
   • один заголовок h1 на странице; прежний герой (шар с орбитами) скрыт, пока работает сцена, и показывается без JS и при недоступном canvas;
   • кадры сцены не грузятся, пока до неё далеко (отложенная загрузка), и грузятся из своего набора (d для компьютера, m для телефона);
   • сцена идёт от прокрутки: в начале — сплошной молочный фон (слой растворяется), в середине шапки нет и героя нет, к концу — заголовок слева, кнопки нажимаются, панель «Почему выбирают Астрею?», шапка вернулась;
   • после конца сцены прокрутка свободная (сцена уезжает вверх строго за прокруткой), вверх — обратная перемотка и снова нет шапки; резкий скачок и обновление страницы не ломают кадр;
   • на телефоне заголовок, кнопки и панель умещаются в экран и не налезают друг на друга; нет горизонтальной прокрутки; «меньше движения» не прячет сцену.
   Запуск: node tools/check-arch.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), pth = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = pth.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

const rd = JSON.parse(fs.readFileSync(pth.join(ROOT, 'data/redesign.json'), 'utf8')), A = rd.jar && rd.jar.arch;
if (!A || !A.enabled) { console.log('Архитектурный первый экран выключен (jar.arch.enabled = false) — проверка пропущена.'); process.exit(0); }

(async () => {
  console.log('\n[данные]');
  const cnt = d => fs.existsSync(pth.join(ROOT, d)) ? fs.readdirSync(pth.join(ROOT, d)).filter(f => /\.webp$/.test(f)).length : -1;
  ok(A.p.length === A.frames && A.pb.length === 2 * A.frames - 1, 'число положений: p = кадры, pb = 2N−1', [A.p.length, A.pb.length, A.frames]);
  ok(A.p.every((v, i) => i === 0 || v > A.p[i - 1]) && A.pb.every((v, i) => i === 0 || v > A.pb[i - 1]) && A.p[0] === 0 && A.p[A.frames - 1] <= 1, 'положения кадров возрастают, начинаются с 0 и не выходят за 1');
  ok(cnt(A.desktop) === A.frames && cnt(A.mobile) === A.frames, 'файлы полных наборов: десктоп и телефон', [cnt(A.desktop), cnt(A.mobile)]);
  ok(cnt(A.lite.desktop) === 2 * A.frames - 1 && cnt(A.lite.mobile) === 2 * A.frames - 1, 'файлы лёгких наборов: 2N−1', [cnt(A.lite.desktop), cnt(A.lite.mobile)]);
  ok(A.panel.items.length >= 3 && A.panel.title, 'панель «Почему выбирают…» заполнена');

  const srv = http.createServer((q, r) => { let f = pth.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': MIME[pth.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});

  const open = async (W, H, o = {}) => {
    const ctx = await b.newContext({viewport: {width: W, height: H}, isMobile: W < 700, hasTouch: W < 700, reducedMotion: o.reduced ? 'reduce' : 'no-preference', javaScriptEnabled: o.js !== false});
    await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
    if (o.noCanvas) await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const p = await ctx.newPage(); p.errs = []; p.reqs = [];
    p.on('pageerror', e => p.errs.push(String(e.message).slice(0, 160)));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.|404|ERR_FAILED/.test(m.text())) p.errs.push(m.text().slice(0, 160)); });
    p.on('request', r => { if (/assets\/jar-arch\/(d|dm|m|mm)\//.test(r.url())) p.reqs.push(r.url()); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    return {ctx, p};
  };
  const skipSplash = async p => { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await wait(1200); };
  const geo = p => p.evaluate(() => { const r = document.getElementById('arch-story'); if (!r) return null; const st = r.firstElementChild; return {top: Math.round(r.getBoundingClientRect().top + scrollY), tot: r.offsetHeight - st.clientHeight, h: r.offsetHeight}; });
  const at = async (p, g, pv, ms = 1700) => { await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + pv * g.tot)); await wait(ms); };
  const view = p => p.evaluate(() => {
    const q = s => document.querySelector(s), rc = e => { if (!e) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom)}; };
    const op = e => e ? +getComputedStyle(e).opacity : -1, c = Astreya.jar.arch, s = c && c.state(), hdr = q('#hdr'), cta = q('.ar-cta a'), cr = cta && cta.getBoundingClientRect();
    return {p: s ? +s.p.toFixed(3) : -1, drawn: !!(s && s.drawn), loaded: s ? s.loaded : 0, tiers: s ? s.tiers : [], milk: op(q('.arch-story .js-milk')), h1: op(q('.ar-h')), lead: op(q('.ar-lead')), cta: op(q('.ar-cta')), panel: op(q('.ar-panel')),
      hdrB: hdr ? Math.round(hdr.getBoundingClientRect().bottom) : 0, bodyCls: document.body.className, hr: rc(q('.ar-h')), lr: rc(q('.ar-lead')), cr: rc(q('.ar-cta')), chip: rc(q('.ar-chip')), card: rc(q('.ar-card')), orbit: rc(q('.ar-orbit')), facts: rc(q('.ar-facts')), more: rc(q('.ar-more')), chipOp: op(q('.ar-chip')), cardOp: op(q('.ar-card')), orbitOp: op(q('.ar-orbit')), factsOp: op(q('.ar-facts')), chipDisp: q('.ar-chip') ? getComputedStyle(q('.ar-chip')).display : '', moreTxt: q('.ar-more') ? q('.ar-more').textContent.trim() : '', pr: rc(q('.ar-panel')), er: rc(q('.ar-copy .eyebrow')), W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth, y: Math.round(scrollY),
      hit: cr ? (() => { const e = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2); return !!(e && e.closest('.ar-cta a')); })() : false,
      stageTop: Math.round(q('#arch-story').getBoundingClientRect().top), h1count: document.querySelectorAll('h1').length, hero: getComputedStyle(q('.hero')).display, archDisp: getComputedStyle(q('#arch-story')).display};
  });

  for (const [name, W, H, mobile] of [['компьютер', 1440, 900, false], ['телефон', 390, 844, true]]) {
    console.log(`\n[${name}]`);
    const {ctx, p} = await open(W, H);
    await p.goto(base + 'index.html'); await skipSplash(p);
    const g = await geo(p); ok(g && g.tot > H * 2, 'сцена на месте и закреплена на несколько экранов', g);
    let v = await view(p);
    ok(v.h1count === 1, 'на странице один заголовок первого уровня', v.h1count); ok(v.hero === 'none', 'прежний герой скрыт, пока работает сцена', v.hero);
    ok(p.reqs.length === 0, 'пока до сцены далеко, кадры не грузятся', p.reqs.length);
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.max(0, g.top - H * 1.4)); await wait(1800);
    ok(p.reqs.length > 0 && p.reqs.every(u => mobile ? /jar-arch\/(m|mm)\//.test(u) : /jar-arch\/(d|dm)\//.test(u)), 'за ~1,5 экрана до сцены кадры начинают грузиться — из набора под размер экрана', p.reqs.slice(0, 2));

    await at(p, g, 0); v = await view(p);
    ok(v.milk > 0.97 && v.h1 < 0.02 && v.panel < 0.02, 'начало: сплошной молочный фон, героя ещё нет (бесшовно продолжает лозунг)', {milk: v.milk, h1: v.h1});
    await at(p, g, 0.12); v = await view(p); ok(v.milk < 0.05 && v.drawn, 'к 12 % пути молочный слой растворился, кадр нарисован', {milk: v.milk, drawn: v.drawn});
    await at(p, g, 0.4); v = await view(p);
    ok(/arch-hide/.test(v.bodyCls) && v.hdrB <= 1, 'в середине сцены шапка убрана', {cls: v.bodyCls, hdrB: v.hdrB}); ok(v.h1 < 0.02 && v.panel < 0.02, 'в середине сцены героя ещё нет', {h1: v.h1, panel: v.panel});
    await at(p, g, 0.7); v = await view(p); ok(v.h1 > 0.05 && v.h1 < 0.9, 'камера почти отъехала — заголовок проявляется (не мгновенно)', v.h1);
    await at(p, g, 0.97); v = await view(p);
    ok(v.h1 > 0.97 && v.lead > 0.97 && v.cta > 0.97 && v.panel > 0.97, 'финал: заголовок, текст, кнопки и панель проявились', {h1: v.h1, lead: v.lead, cta: v.cta, panel: v.panel});
    ok(!/arch-hide/.test(v.bodyCls) && v.hdrB >= 40, 'финал: шапка вернулась', {cls: v.bodyCls, hdrB: v.hdrB});
    ok(v.hr && v.hr.l >= 0 && v.hr.r <= W && v.er.t >= v.hdrB - 2, 'финал: заголовок целиком в экране и под шапкой', [v.hr, v.er, v.hdrB]);
    ok(v.cr && v.cr.b <= H && v.pr && v.pr.b <= H + 1 && v.pr.t >= v.cr.b - 2, 'финал: кнопки и панель в экране и не налезают друг на друга', [v.cr, v.pr]);
    if (!mobile) ok(v.hr.r <= W * 0.6, 'финал: текст слева, ниша справа свободна', v.hr);
    ok(v.hit, 'финал: кнопка «Перейти в каталог» нажимается (ничто не перекрывает)');
    const hit = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    if (!mobile) {                                                    // живая жемчужина: переливается и следует за курсором (блик и сдвиг), флакон лежит поверх неё
      const lx = () => p.evaluate(() => { const e = document.querySelector('.ar-pearl'); const cs = getComputedStyle(e); return {lx: parseFloat(cs.getPropertyValue('--lx')), px: parseFloat(cs.getPropertyValue('--px')), op: +cs.opacity, anim: getComputedStyle(e.firstElementChild).animationName, w: Math.round(e.getBoundingClientRect().width)}; });
      await p.mouse.move(40, H / 2); await wait(1400); const l0 = await lx(); await p.mouse.move(W - 40, H / 2); await wait(1600); const l1 = await lx();
      ok(l0.op > 0.97 && l0.w > W * 0.14 && /floaty/.test(l0.anim), 'финал: жемчужина на месте (крупная, проявлена, плавает)', l0);
      ok(l1.lx > l0.lx + 8 && l1.px > l0.px + .5, 'жемчужина следует за курсором: блик и сдвиг меняются вслед за мышью', {l0, l1});
      const z = await p.evaluate(() => { const w = document.querySelector('.ar-world'), kids = [...w.children]; return {pearl: kids.findIndex(e => e.classList.contains('ar-pearl')), fg: kids.findIndex(e => e.classList.contains('ar-fg')), fgOp: +getComputedStyle(w.querySelector('.ar-fg')).opacity}; });
      ok(z.pearl >= 0 && z.fg > z.pearl && z.fgOp > 0.97, 'флакон отдельным слоем лежит поверх жемчужины', z);
    }
    ok(/Подробнее/.test(v.moreTxt) && v.more && v.more.b <= H + 1, 'финал: в нижней панели есть кнопка «Подробнее» и она в экране', {t: v.moreTxt, r: v.more});
    if (!mobile) {
      ok(v.chipOp > 0.97 && v.cardOp > 0.97 && v.orbitOp > 0.97 && v.factsOp > 0.97, 'финал: плашка семинаров, карточка дистрибьютора, орбиты с логотипами и строка фактов проявились', {chip: v.chipOp, card: v.cardOp, orbit: v.orbitOp, facts: v.factsOp});
      ok(v.chip && v.card && v.chip.l >= 0 && v.chip.r <= W && v.chip.t >= v.hdrB - 2 && v.card.r <= W && v.card.b <= v.pr.t + 2, 'финал: плашка и карточка целиком в экране, не заходят под шапку и панель', {chip: v.chip, card: v.card, hdrB: v.hdrB, pr: v.pr});
      ok(!hit(v.chip, v.hr) && !hit(v.chip, v.lr) && !hit(v.card, v.hr) && !hit(v.card, v.lr) && !hit(v.card, v.cr) && !hit(v.chip, v.cr) && !hit(v.card, v.facts), 'финал: плашка и карточка не налезают на заголовок, текст, кнопки и факты', {chip: v.chip, card: v.card, h1: v.hr, lead: v.lr, cta: v.cr, facts: v.facts});
    } else ok(v.chipDisp === 'none', 'телефон: плашка и карточка скрыты (экран узкий, сцена остаётся чистой)', v.chipDisp);
    ok(v.sw <= W + 1, 'нет горизонтальной прокрутки', [v.sw, W]);
    ok(v.tiers[0] > 0, 'кадры полного набора загружены', v.tiers);
    if (process.env.ARCH_OUT) await p.screenshot({path: pth.join(process.env.ARCH_OUT, `arch-final-${mobile ? 'phone' : 'desktop'}.png`)});

    // после конца сцены прокрутка свободная: сцена уезжает вверх ровно за прокруткой
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + g.tot)); await wait(900);
    const t0 = (await view(p)).stageTop; await p.evaluate(() => window.scrollBy({top: 200, behavior: 'instant'})); await wait(500); const t1 = (await view(p)).stageTop;
    ok(Math.abs((t0 - t1) - 200) <= 2, 'после конца сцены прокрутка свободная: за 200 px прокрутки сцена уехала на 200 px', [t0, t1]);
    await p.evaluate(y => window.scrollTo({top: y, behavior: 'instant'}), Math.round(g.top + g.h + H * 0.3)); await wait(900); v = await view(p);
    ok(v.stageTop < -g.tot, 'дальше по странице сцена осталась выше', v.stageTop);

    await at(p, g, 0.5); v = await view(p); ok(Math.abs(v.p - 0.5) < 0.03 && /arch-hide/.test(v.bodyCls) && v.h1 < 0.02, 'вверх: кадры перематываются назад, шапка снова убрана, герой ушёл', {p: v.p, cls: v.bodyCls, h1: v.h1});
    await at(p, g, 0.02, 400); await at(p, g, 0.96, 1900); v = await view(p); ok(Math.abs(v.p - 0.96) < 0.03 && v.drawn && v.h1 > 0.95, 'резкий скачок из начала в конец: кадр на месте, герой проявлен', {p: v.p, drawn: v.drawn, h1: v.h1});
    await p.reload(); await skipSplash(p); await wait(1500); v = await view(p);
    ok(v.p > 0.9 && v.h1 > 0.9, 'обновление страницы открывает героя (конец сцены), а не начало вступления', {p: v.p, h1: v.h1});
    ok(p.errs.length === 0, 'нет ошибок JS', p.errs);
    await ctx.close();
  }

  console.log('\n[«меньше движения»]');
  { const {ctx, p} = await open(1440, 900, {reduced: true}); await p.goto(base + 'index.html'); await skipSplash(p); const g = await geo(p); await at(p, g, 0.97); const v = await view(p);
    ok(v.h1 > 0.97 && v.panel > 0.97 && v.drawn, 'при «меньше движения» сцена и герой на месте (решение заказчика: вступление показывается всегда)', {h1: v.h1, drawn: v.drawn}); ok(p.errs.length === 0, 'нет ошибок JS', p.errs); await ctx.close(); }

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
