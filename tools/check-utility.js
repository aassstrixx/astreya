#!/usr/bin/env node
/* Проверка служебных страниц v2 в браузере (нужны Playwright и Chromium; без них проверка пропускается): «Старт со Стеллой», поиск, юридические страницы, 404.
   Старт: диалог от первого вопроса до итога (линейки, товары, семинары, условия), действия итога (главная кнопка открывает форму, «Скопировать» кладёт текст в буфер), на телефоне диалог виден сразу.
   Поиск: «Дерматайм» (русское написание ведёт к бренду), «крем», «семинар» — группы с миниатюрами и подсветкой, вкладки фильтруют, пустой результат даёт предложения; параметр ?q= сохраняется.
   Юридические страницы: оглавление-навигатор (по заголовкам документа), якоря, подсветка текущего раздела; тексты документов не меняются (сравнение с исходной разметкой до скрипта).
   Документы до заполнения реквизитов оператора показывают заглушку, поэтому для проверки собирается временная копия сайта с тестовыми реквизитами (в /tmp, после проверки удаляется).
   404: четыре раздела, строка поиска, шар Стеллы. Везде: 1440 и 390 px, нет ошибок консоли и горизонтальной прокрутки.
   Запуск: node tools/check-utility.js (после node tools/build.js). Код возврата ≠ 0 при ошибках. */
'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const clock = require('./fixed-clock.js');
const ROOT = path.join(__dirname, '..'), CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain'};
let ok = 0; const bad = [];
const t = (cond, name, info) => { if (cond) ok++; else bad.push(name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); };
const serve = dir => new Promise(res => {
  const s = http.createServer((q, r) => {                                  // 404.html собран для GitHub Pages (/astreya/…): префикс снимаем
    let u = decodeURIComponent(q.url.split('?')[0]).replace(/^\/astreya\//, '/'), f = path.join(dir, u); if (f.endsWith('/')) f += 'index.html';
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404, {'content-type': 'text/plain'}); r.end('404'); } else { r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(d); } });
  });
  s.listen(0, '127.0.0.1', () => res({s, base: 'http://127.0.0.1:' + s.address().port}));
});

(async () => {
  const main = await serve(ROOT);
  /* временная копия с тестовыми реквизитами — чтобы документы собрались целиком, а не заглушкой */
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'astreya-site-util-'));
  fs.cpSync(ROOT, copy, {recursive: true, filter: f => !/^(\.git|\.claude|node_modules)([\\/]|$)/.test(path.relative(ROOT, f))});
  const sj = path.join(copy, 'data/site.json'), site = JSON.parse(fs.readFileSync(sj, 'utf8'));
  Object.assign(site.requisites = site.requisites || {}, {legalName: 'Тестовое ООО (проверка вёрстки)', inn: '0000000000', ogrn: '0000000000000', legalAddress: 'г. Москва, тестовый адрес'});
  fs.writeFileSync(sj, JSON.stringify(site, null, 2)); cp.execFileSync('node', ['tools/build.js'], {cwd: copy, stdio: 'ignore'});
  const leg = await serve(copy);
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const open = async (base, url, w, h) => {
    const mob = w < 700, ctx = await b.newContext({viewport: {width: w, height: h}, locale: 'ru-RU', hasTouch: mob, isMobile: mob, permissions: ['clipboard-read', 'clipboard-write']});
    await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await clock.install(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('astreya:consent', JSON.stringify({v: 1, a: false, t: Date.now()})); } catch (e) {} });
    const p = await ctx.newPage(), errs = []; p._errs = errs; p._ctx = ctx;
    p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    await p.goto(base + url); await p.waitForSelector('html.ready', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(1800); return p;
  };
  const jc = (p, sel) => p.evaluate(q => { const e = document.querySelector(q); if (!e) throw new Error('нет элемента ' + q); e.click(); }, sel);
  const flat = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const done = async (p, what) => { t(await flat(p), what + ': нет горизонтальной прокрутки'); t(p._errs.length === 0, what + ': нет ошибок консоли', p._errs.slice(0, 3)); await p._ctx.close(); };
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const comp = async (p, step) => { await p.waitForSelector('.pchat-comp[data-step="' + step + '"]:not([hidden])', {timeout: 12000}); await p.waitForTimeout(200); };

  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const tag = W + ' px';
    /* ================= старт со Стеллой ================= */
    let p = await open(main.base, '/start.html?v=planFlow:four', W, H); await comp(p, 'role');
    t(await p.evaluate(() => document.querySelectorAll('h1').length === 1 && !!document.querySelector('.st-page .pchat .pchat-log') && !!document.querySelector('.st-bg-img') && document.querySelectorAll('.pchat-log .pc-b').length >= 2), 'старт ' + tag + ': одна h1, сцена, окно диалога, Стелла уже поздоровалась');
    if (W < 700) { const m = await p.evaluate(() => { const c = document.querySelector('.pchat').getBoundingClientRect(); return {top: Math.round(c.top), bottom: Math.round(c.bottom), vh: innerHeight, lead: getComputedStyle(document.querySelector('.st-lead')).display}; }); t(m.top < m.vh * .5 && m.bottom <= m.vh + 4 && m.lead === 'none', 'старт ' + tag + ': на телефоне диалог начинается сразу и помещается на экран', m); }
    else t(await p.evaluate(() => { const c = document.querySelector('.pchat').getBoundingClientRect(), h = document.querySelector('.st-head h1').getBoundingClientRect(); return c.left > h.left + 300 && c.top < innerHeight * .4; }), 'старт ' + tag + ': заголовок слева, диалог справа на первом экране');
    t(/Шаг 1 из 4/.test(await p.textContent('.plan-prog-t')), 'старт ' + tag + ': прогресс «Шаг 1 из 4»');
    await jc(p, '.plan-opt[data-v="salon"]'); await comp(p, 'tasks');
    const ids = await p.evaluate(() => [...document.querySelectorAll('.plan-opt')].map(o => o.getAttribute('data-v')));
    for (const id of ids.slice(0, 3)) await jc(p, '.plan-opt[data-v="' + id + '"]');
    t(await p.evaluate(() => document.querySelectorAll('.plan-opt[aria-checked="true"]').length === 3 && !document.querySelector('.plan-next').disabled), 'старт ' + tag + ': выбраны три задачи, «Готово» доступна');
    await jc(p, '.plan-next'); await comp(p, 'goal');
    t(await p.evaluate(() => document.querySelectorAll('.pchat-log .plan-board .plan-btile').length >= 1), 'старт ' + tag + ': Стелла показала подходящие линейки');
    await p.fill('.pchat-text', 'Хочу и обучиться, и закупить, я из Москвы'); await p.press('.pchat-text', 'Enter');
    await p.waitForSelector('.plan-res', {timeout: 12000}); await p.waitForTimeout(900);
    const res = await p.evaluate(() => ({h2: (document.querySelector('.plan-res h2') || {}).textContent, brands: document.querySelectorAll('.plan-brand').length, prods: document.querySelectorAll('.plan-prods li').length, evs: document.querySelectorAll('.plan-evs li').length, facts: document.querySelectorAll('.plan-facts li').length,
      tracks: [...document.querySelectorAll('.plan-res [data-track], .plan-res [data-sx], [data-plan-app] [data-pl]')].length, fine: /ориентировочн/i.test(document.querySelector('.plan-res').textContent), sec: document.querySelectorAll('.plan-res .plan-sec').length}));
    t(/Ваш стартовый план/.test(res.h2 || '') && res.brands >= 1 && res.prods >= 1 && res.evs >= 1 && res.facts >= 3, 'старт ' + tag + ': итог — линейки, товары, семинары, условия', res);
    t(res.tracks >= 3 && res.fine, 'старт ' + tag + ': действия итога и оговорка «ориентировочно» на месте', res);
    t(await p.evaluate(() => { const e = document.querySelector('.plan-evs li'); const r = e.getBoundingClientRect(); return r.width > 200 && /\d/.test(e.textContent); }), 'старт ' + tag + ': семинары показаны билетами с датой');
    await jc(p, '[data-pl="copy"]'); await p.waitForTimeout(500);
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    t(/start\.html\?.*r=salon/.test(clip) && /t=/.test(clip), 'старт ' + tag + ': «Скопировать» кладёт в буфер ссылку на план (роль и задачи в адресе)', clip.slice(0, 90));
    await jc(p, '[data-pl="main"]'); await p.waitForSelector('#modal.open form', {timeout: 8000}).catch(() => {});
    t(await p.evaluate(() => !!document.querySelector('#modal.open form')), 'старт ' + tag + ': главная кнопка итога открывает форму менеджеру'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    t(await p.evaluate(() => [...document.querySelectorAll('.plan-res a[href]')].every(a => !/^#?$/.test(a.getAttribute('href')))), 'старт ' + tag + ': все ссылки итога ведут на страницы');
    await done(p, 'старт ' + tag);

    /* ================= поиск ================= */
    p = await open(main.base, '/search.html', W, H);
    t(await p.evaluate(() => !!document.querySelector('.qx-page .qx-bg-img') && document.querySelectorAll('.qx-hints a.chip').length >= 3 && document.querySelector('#sp-q').value === '' && document.querySelectorAll('h1').length === 1), 'поиск ' + tag + ': сцена, строка запроса, быстрые подсказки');
    t(await p.evaluate(() => { const f = document.querySelector('.qx-form').getBoundingClientRect(), i = document.querySelector('#sp-q').getBoundingClientRect(); return i.height >= 52 && f.width > Math.min(innerWidth - 32, 700) * .9; }), 'поиск ' + tag + ': строка запроса крупная (≥ 52 px) и широкая');
    await p._ctx.close();
    for (const [q, what] of [['Дерматайм', 'бренд по русскому написанию'], ['крем', 'товары'], ['семинар', 'обучение и новости']]) {
      p = await open(main.base, '/search.html?q=' + encodeURIComponent(q), W, H);
      const r = await p.evaluate(() => ({items: document.querySelectorAll('#s-out .sr-item').length, groups: document.querySelectorAll('#s-out .s-group').length, th: document.querySelectorAll('#s-out .sr-item .qx-th').length, mark: document.querySelectorAll('#s-out .sr-item mark').length, types: [...new Set([...document.querySelectorAll('#s-out .sr-item')].map(i => i.getAttribute('data-type')))], tr: [...document.querySelectorAll('#s-out .sr-item')].every(i => i.getAttribute('data-track') === 'search_result_click'), val: document.querySelector('#sp-q').value, title: document.title}));
      t(r.items >= 1 && r.groups >= 1 && r.th === r.items && r.tr && r.val === q && r.title.indexOf(q) >= 0, 'поиск ' + tag + ' «' + q + '» (' + what + '): результаты с миниатюрами, запрос и заголовок на месте', r);
      t(r.mark >= 1, 'поиск ' + tag + ' «' + q + '»: найденное подсвечено', r.mark);
      if (q === 'семинар') {
        t(r.types.indexOf('event') >= 0 && await p.evaluate(() => !!document.querySelector('.qx-th--event b') && /\d/.test(document.querySelector('.qx-th--event b').textContent)), 'поиск ' + tag + ' «семинар»: у мероприятий в миниатюре дата');
        const n0 = r.items; await jc(p, '#s-tabs .chip:nth-child(2)'); await p.waitForTimeout(400);
        const g = await p.evaluate(() => ({groups: document.querySelectorAll('#s-out .s-group').length, on: document.querySelector('#s-tabs .chip.on').getAttribute('data-id'), n: document.querySelectorAll('#s-out .sr-item').length}));
        t(g.groups === 1 && g.n < n0 && g.on !== 'all', 'поиск ' + tag + ': вкладка типа оставляет одну группу', g);
      }
      await done(p, 'поиск ' + tag + ' «' + q + '»');
    }
    p = await open(main.base, '/search.html?q=' + encodeURIComponent('ыыыы'), W, H);
    const em = await p.evaluate(() => ({e: !!document.querySelector('#s-out .empty'), sug: [...document.querySelectorAll('#s-out .qx-sug a.chip')].map(a => a.getAttribute('href')), btn: document.querySelectorAll('#s-out .qx-sug a.chip').length}));
    t(em.e && em.btn >= 6 && em.sug.some(h => /search\.html\?q=/.test(h)) && em.sug.some(h => /catalog\.html/.test(h)), 'поиск ' + tag + ' пусто: «Ничего не найдено» и предложения (запросы и разделы)', em);
    await p.fill('#sp-q', 'пилинг'); await p.press('#sp-q', 'Enter'); await p.waitForFunction(() => /q=/.test(location.search) && document.querySelectorAll('#s-out .sr-item').length > 0, null, {timeout: 12000}).catch(() => {});
    t(await p.evaluate(() => decodeURIComponent(location.search).indexOf('q=пилинг') >= 0 && document.querySelectorAll('#s-out .sr-item').length > 0), 'поиск ' + tag + ': отправка формы сохраняет ?q= в адресе и показывает результаты');
    await done(p, 'поиск ' + tag + ' пусто');

    /* ================= юридические страницы (копия с тестовыми реквизитами) ================= */
    for (const kind of ['privacy', 'terms', 'consent']) {
      p = await open(leg.base, '/' + kind + '.html', W, H);
      const raw = await (await fetch(leg.base + '/' + kind + '.html')).text();
      const same = await p.evaluate(r => { const a = new DOMParser().parseFromString(r, 'text/html').querySelector('[data-lg-body]'), c = document.querySelector('[data-lg-body]'); const n = s => s.replace(/\s+/g, ' ').trim(); return !!a && !!c && n(a.textContent) === n(c.textContent) && n(c.textContent).length > 800; }, raw);
      t(same, 'юр. ' + kind + ' ' + tag + ': текст документа на странице совпадает с исходной разметкой (скрипт ничего не меняет)');
      const L = await p.evaluate(() => { const l = [...document.querySelectorAll('[data-lg-toc] a')], h = [...document.querySelectorAll('[data-lg-body] h2')]; return {n: l.length, h: h.length, vis: document.querySelector('[data-lg-toc]').getBoundingClientRect().height > 0, ids: l.every((a, i) => a.getAttribute('href') === '#' + h[i].id && h[i].id), cur: document.querySelectorAll('[data-lg-toc] a[aria-current]').length, doc: document.querySelectorAll('.lg-docs a').length, docCur: document.querySelectorAll('.lg-docs a[aria-current="page"]').length, h1: document.querySelectorAll('h1').length}; });
      t(L.n >= 3 && L.n === L.h && L.vis && L.ids && L.cur === 1 && L.h1 === 1, 'юр. ' + kind + ' ' + tag + ': оглавление собрано из заголовков, якоря совпадают, подсвечен один раздел', L);
      t(L.doc === 3 && L.docCur === 1, 'юр. ' + kind + ' ' + tag + ': навигация по трём документам, текущий отмечен', L);
      const pick = Math.min(L.n - 1, 2);
      await p.evaluate(i => document.querySelectorAll('[data-lg-toc] a')[i].click(), pick); await p.waitForTimeout(900);
      const A = await p.evaluate(i => { const h = document.querySelectorAll('[data-lg-body] h2')[i], r = h.getBoundingClientRect(), a = document.querySelectorAll('[data-lg-toc] a'); return {top: Math.round(r.top), hash: location.hash === '#' + h.id, cur: [...a].findIndex(x => x.hasAttribute('aria-current')) === i, hdr: (document.querySelector('.hdr') || {getBoundingClientRect: () => ({bottom: 0})}).getBoundingClientRect().bottom}; }, pick);
      t(A.hash && A.cur && A.top >= 0 && A.top < H * .45, 'юр. ' + kind + ' ' + tag + ': переход по якорю ставит раздел под шапку и подсвечивает его', A);
      await done(p, 'юр. ' + kind + ' ' + tag);
    }

    /* ================= 404 ================= */
    p = await open(main.base, '/astreya/404.html', W, H);
    const nf = await p.evaluate(() => ({h1: document.querySelectorAll('h1').length, links: [...document.querySelectorAll('.nf-go-l a')].map(a => a.getAttribute('href')), orb: !!document.querySelector('[data-nf-orb] svg'), form: !!document.querySelector('.nf-form input[type=search][name=q]'), num: !!document.querySelector('.nf-num'), bg: !!document.querySelector('.nf-bg-img'), tap: [...document.querySelectorAll('.nf-go-l a, .nf-home, .nf-hints .chip')].every(a => a.getBoundingClientRect().height >= 43)}));
    t(nf.h1 === 1 && nf.orb && nf.form && nf.num && nf.bg && nf.tap, '404 ' + tag + ': «404», зал, шар Стеллы, строка поиска, цели касания ≥ 44 px', nf);
    t(['catalog', 'brands', 'training', 'search'].every((k, i) => new RegExp(k + '\\.html$').test(nf.links[i] || '')) && nf.links.length === 4, '404 ' + tag + ': предложения — каталог, бренды, обучение, поиск', nf.links);
    let all = true; for (const h of nf.links) { const r = await p.request.get(main.base + h); all = all && r.status() === 200; } t(all, '404 ' + tag + ': все ссылки разделов открываются');
    await p.fill('.nf-form input', 'крем'); await p.press('.nf-form input', 'Enter'); await p.waitForFunction(() => /search/.test(location.pathname) && document.querySelectorAll('#s-out .sr-item').length > 0, null, {timeout: 12000}).catch(() => {});
    t(await p.evaluate(() => /search/.test(location.pathname) && decodeURIComponent(location.search).indexOf('q=крем') >= 0 && document.querySelectorAll('#s-out .sr-item').length > 0), '404 ' + tag + ': поиск со страницы 404 открывает результаты');
    await done(p, '404 ' + tag);
  }

  await b.close(); main.s.close(); leg.s.close(); fs.rmSync(copy, {recursive: true, force: true});
  console.log('\nУспешно: ' + ok + ' из ' + (ok + bad.length)); bad.forEach(m => console.log('  ✗ ' + m));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
