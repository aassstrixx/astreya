#!/usr/bin/env node
/* Проверка страницы «Бренды» (единая каменная витрина) в браузере: нужны Playwright и Chromium (без них проверка пропускается).
   Что проверяется: заголовок и рендер стены; девять ниш = числу брендов из data/brands.json; у каждой — логотип (не текст) внутри арки, упаковки реального масштаба (5–24 см по высоте, не выше 62 % ниши)
   внутри своей ниши, число позиций в подписи совпадает с data/products.json; фильтры и фильтр-цепочки не пересекаются с арками; наведение подсвечивает нишу, нажатие открывает панель бренда (товары, «Каталог», «О бренде»),
   повторное нажатие / Esc / «Закрыть» возвращают общий вид; фильтры по задачам и поиск приглушают лишние ниши (стена остаётся целой), пустой результат; блок «Бренд под вашу задачу»; кнопки «Подобрать бренд со Стеллой»;
   ссылка ?brand=…; запасной вид без рендера; адаптив (десктоп — панорама, планшет и телефон — горизонтальная галерея) без горизонтальной прокрутки страницы.
   Запуск: node tools/check-brands.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'};
const BRANDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/brands.json'), 'utf8')), PRODUCTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
const WALL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/brands/wall.json'), 'utf8'));
let ok = 0, bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };

(async () => {
  const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const open = async (w, h, query = '', opts = {}) => {
    const ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', hasTouch: !!opts.touch, isMobile: !!opts.touch}); await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    if (opts.noPlate) await ctx.route(/assets\/brands\/wall(-s)?\.webp/, r => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.goto(base + '/brands.html' + query); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} }
    await p.waitForTimeout(1600); p._errs = errs; p._ctx = ctx; return p;
  };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const offIds = p => p.evaluate(() => [...document.querySelectorAll('.bw-n.is-off')].map(x => x.dataset.id));
  const openId = p => p.evaluate(() => { const a = [...document.querySelectorAll('.bw-pn')].filter(x => !x.hidden); return a.length === 1 && !document.getElementById('bw-panel').hidden ? a[0].dataset.id : a.length ? '?' + a.length : ''; });
  const geom = p => p.evaluate(() => {
    const R = e => { const r = e.getBoundingClientRect(); return {l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY, w: r.width, h: r.height}; };
    const plane = document.querySelector('.bw-plane'), pr = R(plane), bar = document.querySelector('.bw-bar'), head = document.querySelector('.bw-head');
    return {plane: pr, scrollKids: [...document.querySelector('.bw-scroll').children].map(e => e.className || e.tagName), stageH: R(document.querySelector('.bw-stage')).h, barB: bar ? R(bar).b : 0, headB: head ? R(head).b : 0,
      niches: [...document.querySelectorAll('.bw-n')].map(li => {
        const hit = li.querySelector('.bw-hit'), lg = li.querySelector('.bw-logo'), ar = R(hit);
        return {id: li.dataset.id, hit: ar, logo: lg ? Object.assign(R(lg), {tag: lg.tagName, ok: lg.tagName === 'IMG' && lg.complete && lg.naturalWidth > 0}) : null, label: hit.getAttribute('aria-label'),
          pk: [...li.querySelectorAll('.bw-pk')].map(k => { const im = k.querySelector('img:not(.bw-cs)'), r = R(k); return Object.assign(r, {ok: !!(im && im.complete && im.naturalWidth > 0)}); })};
      })};
  });

  /* --- десктоп 1672: первый экран, данные, масштаб --- */
  let p = await open(1672, 940);
  t(await p.evaluate(() => document.body.dataset.page === 'brands' && !!document.querySelector('[data-bw] .bw-plane')), 'страница брендов: единая стена включена');
  t((await p.textContent('.bw-head h1')).trim() === 'Косметические бренды', 'заголовок первого экрана');
  t(/МИР ПРОФЕССИОНАЛЬНОГО УХОДА/i.test(await p.textContent('.bw-head .br-eyebrow')), 'надпись над заголовком');
  t(await p.evaluate(() => { const i = document.querySelector('.bw-plate'); return i && i.complete && i.naturalWidth >= 1800; }), 'рендер стены загружен');
  t(await p.evaluate(() => document.documentElement.classList.contains('br-top')), 'шапка прозрачна над первым экраном (br-top)');
  const hdrBg = await p.evaluate(() => getComputedStyle(document.querySelector('.hdr')).backgroundColor); t(/rgba\(0, 0, 0, 0\)|transparent/.test(hdrBg), 'фон шапки прозрачный', hdrBg);
  t(await noOverflow(p), 'нет горизонтальной прокрутки (1672)');
  let g = await geom(p);
  t(g.niches.length === BRANDS.length, 'число ниш = числу брендов в data/brands.json', [g.niches.length, BRANDS.length]);
  t(g.scrollKids.length === 1 && Math.abs(g.stageH - g.plane.h) < 2, 'сцена по высоте равна рендеру стены (посторонних блоков внутри нет)', [g.scrollKids, g.stageH, g.plane.h]);
  const pxPerCm = WALL.px_per_cm * g.plane.w / WALL.plate.w;
  for (const br of BRANDS) {
    const n = g.niches.find(x => x.id === br.id); if (!n) { t(false, br.id + ': ниша есть'); continue; }
    const cnt = PRODUCTS.filter(x => x.brand === br.id).length;
    t(new RegExp('\\b' + cnt + '\\b').test(n.label || ''), br.id + ': число позиций в подписи совпадает с data/products.json', [n.label, cnt]);
    t(br.logo ? !!(n.logo && n.logo.ok) : !!n.logo, br.id + ': логотип бренда (картинка) загружен', n.logo && n.logo.tag);
    t(!!n.logo && n.logo.l >= n.hit.l - 1 && n.logo.r <= n.hit.r + 1 && n.logo.t >= n.hit.t - 1 && n.logo.b <= n.hit.t + n.hit.h * .45, br.id + ': логотип внутри арки, в верхней части ниши', n.logo && [Math.round(n.logo.l - n.hit.l), Math.round(n.hit.r - n.logo.r), Math.round(n.logo.t - n.hit.t)]);
    t(n.pk.length >= Math.min(2, cnt) && n.pk.every(k => k.ok), br.id + ': упаковки на подиумах загружены', [n.pk.length, cnt]);
    t(n.pk.every(k => k.l >= n.hit.l - 2 && k.r <= n.hit.r + 2 && k.b <= n.hit.b + 2 && k.h <= n.hit.h * .62), br.id + ': упаковки внутри ниши и не выше 62 % её высоты');
    t(n.pk.every(k => { const cm = k.h / pxPerCm; return cm >= 5.2 && cm <= 24; }), br.id + ': реальный масштаб упаковок (5–24 см)', n.pk.map(k => Math.round(k.h / pxPerCm * 10) / 10));
    t(fs.existsSync(path.join(ROOT, 'brands', br.id + '.html')), br.id + ': страница бренда собрана');
  }
  t(g.niches.every(n => n.hit.t >= g.barB + 4), 'ряд фильтров не пересекает арки ниш (1672)', [Math.round(g.barB), Math.round(Math.min(...g.niches.map(n => n.hit.t)))]);
  t(await p.evaluate(() => { const a = document.querySelector('.bw-plate'), r = a.getBoundingClientRect(); return r.width > 1600; }), 'стена на всю ширину экрана');

  /* --- наведение, нажатие, панель --- */
  await p.hover('.bw-n[data-id="dermatime"] .bw-hit'); await p.waitForTimeout(900);
  t(await p.evaluate(() => document.querySelector('.bw-n[data-id="dermatime"]').classList.contains('is-hov') && parseFloat(getComputedStyle(document.querySelector('.bw-n[data-id="dermatime"] .bw-glow')).opacity) > .5), 'наведение подсвечивает нишу');
  await p.click('.bw-n[data-id="keenwell"] .bw-hit'); await p.waitForTimeout(1100);
  t(await openId(p) === 'keenwell', 'нажатие на нишу открывает панель этого бренда', await openId(p));
  t(await p.evaluate(() => document.querySelector('.bw-n[data-id="keenwell"]').classList.contains('is-sel') && document.querySelector('.bw').classList.contains('has-sel') && document.querySelector('.bw-n[data-id="keenwell"] .bw-hit').getAttribute('aria-expanded') === 'true'), 'ниша выделена, aria-expanded=true');
  const pn = await p.evaluate(() => { const a = document.querySelector('.bw-pn[data-id="keenwell"]'); return {cat: (a.querySelector('.bw-pn-act a.btn') || {}).href || '', about: (a.querySelectorAll('.bw-pn-act a')[1] || {}).href || '', n: a.querySelectorAll('.bw-pn-prods li').length, logo: !!a.querySelector('.bw-pn-logo'), mini: !!a.querySelector('.bw-mini')}; });
  t(/catalog\.html\?brand=keenwell/.test(pn.cat), 'в панели: ссылка в каталог с фильтром бренда', pn.cat); t(/brands\/keenwell\.html/.test(pn.about), 'в панели: «О бренде» ведёт на страницу бренда', pn.about);
  t(pn.n >= 1 && pn.logo && pn.mini, 'в панели: логотип, миниатюра ниши и товары', pn);
  const EVENTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8')), evs = Array.isArray(EVENTS) ? EVENTS : EVENTS.events || EVENTS.items || [], today = new Date().toISOString().slice(0, 10);
  const chipIds = await p.evaluate(() => [...document.querySelectorAll('.bw-pn')].filter(a => a.querySelector('.sx-bchip')).map(a => a.dataset.id));
  const withEv = BRANDS.filter(x => evs.some(e => e.brand === x.id && e.date >= today)).map(x => x.id);
  t(withEv.length === chipIds.length && withEv.every(id => chipIds.includes(id)), 'в панели каждого бренда с будущим семинаром есть плашка «ближайший семинар» (и только у них)', {withEv, chipIds});
  await p.click('.bw-n[data-id="endocare"] .bw-hit'); await p.waitForTimeout(500); t(await openId(p) === 'endocare', 'другая ниша переключает панель (одна открытая)', await openId(p));
  await p.click('.bw-n[data-id="endocare"] .bw-hit'); await p.waitForTimeout(400); t(await openId(p) === '', 'повторное нажатие закрывает панель', await openId(p));
  await p.click('.bw-n[data-id="neoretin"] .bw-hit'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(300); t(await openId(p) === '', 'Esc закрывает панель');
  await p.click('.bw-n[data-id="eva"] .bw-hit'); await p.waitForTimeout(600); await p.click('.bw-pn:not([hidden]) .bw-close'); await p.waitForTimeout(300);
  t(await openId(p) === '' && await p.evaluate(() => !document.querySelector('.bw-n.is-sel') && !document.querySelector('.bw').classList.contains('has-sel')), '«Закрыть» возвращает общий вид');
  t(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('bw-hit')), 'после закрытия фокус возвращается на нишу');

  /* --- поиск и фильтры: стена остаётся целой, лишние ниши приглушены --- */
  await p.fill('#br-q', 'helio'); await p.waitForTimeout(500); let off = await offIds(p); t(off.length === BRANDS.length - 1 && !off.includes('heliocare'), 'поиск «helio» → остаётся Heliocare', off);
  await p.fill('#br-q', 'пигмент'); await p.waitForTimeout(500); off = await offIds(p); t(off.length > 0 && off.length < BRANDS.length - 1, 'поиск по задаче «пигмент» находит несколько брендов', off.length);
  await p.fill('#br-q', 'ъъъъ'); await p.waitForTimeout(500); off = await offIds(p); t(off.length === BRANDS.length && await p.evaluate(() => !document.getElementById('br-empty').hidden), 'пустой результат: все ниши приглушены и есть сообщение');
  await p.fill('#br-q', ''); await p.waitForTimeout(500); off = await offIds(p); t(off.length === 0 && await p.evaluate(() => document.getElementById('br-empty').hidden), 'сброс поиска возвращает все ниши', off);
  const taskIds = await p.evaluate(() => [...document.querySelectorAll('#br-tasks [data-act="br-task"]')].map(x => x.dataset.id).filter(x => x !== 'all'));
  t(taskIds.length >= 4, 'фильтры по задачам из данных каталога', taskIds);
  for (const id of taskIds) {
    await p.click('#br-tasks [data-act="br-task"][data-id="' + id + '"]'); await p.waitForTimeout(350);
    const r = await p.evaluate(id2 => [...document.querySelectorAll('.bw-n')].map(c => ({id: c.dataset.id, off: c.classList.contains('is-off'), has: c.dataset.tasks.split(' ').includes(id2)})), id);
    t(r.every(x => x.off === !x.has) && r.some(x => !x.off), 'фильтр «' + id + '» приглушает только неподходящие бренды', r.filter(x => x.off === x.has).map(x => x.id));
  }
  await p.click('#br-tasks [data-act="br-task"][data-id="all"]'); await p.waitForTimeout(350); off = await offIds(p); t(off.length === 0, '«Все бренды» сбрасывает фильтр', off);

  /* --- «Бренд под вашу задачу» --- */
  const tk = await p.evaluate(() => [...document.querySelectorAll('#bw-task-chips [data-act="bw-task"]')].map(x => x.dataset.id));
  t(tk.length >= 4 && tk.length === taskIds.length, 'блок «Бренд под вашу задачу»: те же задачи, что в фильтре', tk);
  if (tk[0]) {
    await p.click('#bw-task-chips [data-act="bw-task"][data-id="' + tk[0] + '"]'); await p.waitForTimeout(400);
    const r = await p.evaluate(id2 => { const u = document.querySelector('.bw-tr[data-task="' + id2 + '"]'); return {shown: !!u && !u.hidden, n: u ? u.querySelectorAll('li').length : 0, logos: u ? u.querySelectorAll('li img.bw-tr-logo').length : 0, links: u ? [...u.querySelectorAll('a')].every(a => /brands\/[a-z]+\.html/.test(a.getAttribute('href'))) : false, want: [...document.querySelectorAll('.bw-n')].filter(c => c.dataset.tasks.split(' ').includes(id2)).length, off: document.querySelectorAll('.bw-n.is-off').length}; }, tk[0]);
    t(r.shown && r.n === r.want && r.n >= 2 && r.logos === r.n && r.links, 'задача показывает подходящие бренды с логотипами и ссылками', r);
    t(r.off === BRANDS.length - r.want, 'выбор задачи приглушает неподходящие ниши на стене', r);
    await p.click('#bw-task-chips [data-act="bw-task"][data-id="' + tk[0] + '"]'); await p.waitForTimeout(350); off = await offIds(p); t(off.length === 0, 'повторное нажатие на задачу сбрасывает выбор', off);
  }

  /* --- Стелла и шапка --- */
  const helps = await p.$$('.br-help'); t(helps.length >= 2, 'кнопки «Подобрать бренд со Стеллой» (в нижней полосе и в блоке приглашения)', helps.length);
  if (helps[0]) { await helps[0].click(); await p.waitForTimeout(1500); t(await p.evaluate(() => !!(window.ASTREYA && ASTREYA.stella && ASTREYA.stella.state().open) || !!document.querySelector('.asst.open, #asst.open, body.asst-open')), 'кнопка «Подобрать бренд» открывает Стеллу'); }
  t(await p.evaluate(() => !!document.querySelector('.g-entry') && document.querySelector('.g-entry').parentElement.classList.contains('bw')), 'полоска Стеллы стоит под стеной (не внутри неё)');
  await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(500);
  t(await p.evaluate(() => !document.documentElement.classList.contains('br-top')), 'после прокрутки шапка снова обычная');
  t(await p.evaluate(() => !!document.querySelector('#hdr a.logo') && document.querySelectorAll('#nav a.nl').length >= 5), 'верхняя навигация на месте');
  t(p._errs.length === 0, 'нет ошибок в консоли (1672)', p._errs);
  await p._ctx.close();

  /* --- прямая ссылка на бренд и запасной вид --- */
  p = await open(1672, 940, '?brand=heliocare'); t(await openId(p) === 'heliocare', 'ссылка ?brand=heliocare открывает панель бренда', await openId(p)); await p._ctx.close();
  p = await open(1672, 940, '', {noPlate: true}); t(await p.evaluate(() => document.querySelector('[data-bw-stage]').classList.contains('no-plate')), 'без рендера стены включается запасной вид'); g = await geom(p);
  t(g.niches.length === BRANDS.length && g.niches.every(n => n.hit.w > 40 && n.hit.h > 100), 'запасной вид: все ниши на месте и нажимаются'); await p.click('.bw-n[data-id="biretix"] .bw-hit', {force: true}); await p.waitForTimeout(500); t(await openId(p) === 'biretix', 'запасной вид: панель бренда открывается'); await p._ctx.close();

  /* --- ширины: панорама на десктопе, горизонтальная галерея на планшете и телефоне --- */
  for (const [w, h, desk] of [[1920, 1000, true], [1440, 900, true], [1280, 800, true], [1180, 800, true], [1024, 768, false], [768, 1024, false], [600, 900, false], [390, 844, false], [360, 740, false], [320, 700, false]]) {
    p = await open(w, h, '', {touch: !desk}); await p.evaluate(() => document.querySelectorAll('.bw-page img[loading="lazy"]').forEach(i => { i.loading = 'eager'; })); await p.waitForTimeout(900); g = await geom(p); const sc = await p.evaluate(() => { const s = document.querySelector('[data-bw-scroll]'); return {sw: s.scrollWidth, cw: s.clientWidth}; });
    t(await noOverflow(p), w + ' px: нет горизонтальной прокрутки страницы');
    if (desk) {
      t(Math.abs(g.plane.w - w) < 3 && sc.sw <= sc.cw + 2, w + ' px: стена целиком на экране (панорама)', [g.plane.w, sc.sw, sc.cw]);
      t(g.niches.every(n => n.hit.t >= g.barB + 2), w + ' px: фильтры не пересекают арки', [Math.round(g.barB), Math.round(Math.min(...g.niches.map(n => n.hit.t)))]);
      t(g.niches.every(n => n.logo && n.logo.ok && n.logo.w >= 34), w + ' px: логотипы читаемы (≥ 34 px шириной)', g.niches.map(n => n.logo && Math.round(n.logo.w)));
    } else {
      t(sc.sw > sc.cw + 40, w + ' px: стена листается по горизонтали (ниши крупные)', sc);
      const big = g.niches.filter(n => n.hit.w >= 44 && n.hit.h >= 120).length; t(big === BRANDS.length, w + ' px: все ниши достаточно крупные для нажатия (≥ 44 px)', g.niches.map(n => Math.round(n.hit.w)));
      t(g.niches.every(n => n.logo && n.logo.ok && n.logo.w >= 34), w + ' px: логотипы читаемы (≥ 34 px шириной)', g.niches.map(n => n.logo && Math.round(n.logo.w)));
    }
    if (w === 390 || w === 1024) {
      await p.evaluate(() => document.querySelector('.bw-n[data-id="dermatime"] .bw-hit').scrollIntoView({inline: 'center', block: 'nearest'})); await p.waitForTimeout(500);
      await p.evaluate(() => document.querySelector('.bw-n[data-id="dermatime"] .bw-hit').click()); await p.waitForTimeout(1200);
      t(await openId(p) === 'dermatime', w + ' px: нажатие открывает панель бренда', await openId(p));
      t(await p.evaluate(() => { const r = document.querySelector('.bw-pn:not([hidden])').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), w + ' px: панель бренда помещается по ширине');
      t(await noOverflow(p), w + ' px: после открытия панели нет горизонтальной прокрутки');
    }
    t(await p.evaluate(() => [...document.querySelectorAll('.bw-strip li button small')].every(x => x.scrollWidth <= x.clientWidth + 1)), w + ' px: подписи в нижней полосе не обрезаны по ширине');
    t(p._errs.length === 0, w + ' px: нет ошибок в консоли', p._errs); await p._ctx.close();
  }

  await b.close(); srv.close();
  console.log(bad.length ? `Страница «Бренды»: ✓ ${ok}, ✗ ${bad.length}\n  ✗ ` + bad.join('\n  ✗ ') : `Страница «Бренды»: ✓ ${ok}, ✗ 0`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
