#!/usr/bin/env node
/* Арена вариантов продающего слоя (data/sales.json → variants). Прогоняет в настоящем браузере (телефон 390×844 и компьютер 1280×860) все сочетания оформления
   и выбирает победителей ТОЛЬКО по измеримым признакам: сколько нажатий и текста нужно, сколько шагов не помещается на экран, насколько крупны кнопки,
   нет ли наложений на Стеллу и быструю связь, сколько места занимает панель или блок, есть ли горизонтальная прокрутка.
   Чего арена НЕ измеряет: конверсию. Это не данные посетителей и не их поведение — только «цена» оформления и соблюдение жёстких условий.
   Чтобы не выдавать произвольные веса за истину, каждая размерность оценивается при трёх разных расстановках весов (экономия нажатий / баланс / ценность данных);
   победитель назначается, только если он выигрывает минимум при двух из трёх; иначе остаётся текущий вариант. Живые различия решают A/B-проверки на посетителях (experiments).
   Запуск: node tools/arena-sales.js            — прогон и отчёт tools/arena-sales-report.md
           node tools/arena-sales.js --apply    — дополнительно записать победителей в data/sales.json → variants (затем node tools/build.js)
           node tools/arena-sales.js --quick    — по одному прогону на сочетание (быстрее; по умолчанию так и есть) */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — арена пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path');
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const H = require('../server/test/helpers');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SALES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sales.json'), 'utf8'));
const VIEWS = {m: {width: 390, height: 844, mobile: true}, d: {width: 1280, height: 860, mobile: false}};

(async () => {
  const S = await H.boot({});
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const base = 'http://127.0.0.1:' + S.port + '/';
  const mk = async v => {
    const ctx = await b.newContext({viewport: {width: v.width, height: v.height}, isMobile: v.mobile, hasTouch: v.mobile, locale: 'ru-RU'});
    await ctx.route(/^https:\/\/fonts\./, r => r.abort());
    await ctx.addInitScript(() => { window.ASTREYA_MOTION_SPEED = 8; localStorage.setItem('astreya:exp', JSON.stringify({barDesktop: 'pill', ctaCopy: 'conditions'})); });
    const p = await ctx.newPage(); await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
    p.open = async url => { await p.goto(base + url); await p.waitForSelector('html.ready', {timeout: 20000}); await wait(500); };
    return p;
  };

  /* ---------- 1. Стартовый подбор: число шагов × вид вариантов ---------- */
  async function planner(flow, style, vk) {
    const p = await mk(VIEWS[vk]); await p.open('start.html?v=planFlow:' + flow + ',optionStyle:' + style);
    const m = {clicks: 0, steps: 0, chars: 0, fold: 0, tapMin: 999, overflow: false, fields: new Set()};
    for (let guard = 0; guard < 8; guard++) {
      const step = await p.evaluate(() => { const c = document.querySelector('.plan-card[data-step]'); return c ? c.getAttribute('data-step') : null; });
      if (!step) break;
      const info = await p.evaluate(() => { const c = document.querySelector('.plan-card'), r = c.getBoundingClientRect(); const btns = [...c.querySelectorAll('.plan-opt, .plan-next, .plan-foot button')].map(e => e.getBoundingClientRect().height);
        return {h: r.height, vh: innerHeight, chars: [...c.querySelectorAll('h2, .plan-hint, .plan-opt b, .plan-opt small')].map(e => e.textContent.length).reduce((a, x) => a + x, 0), tap: Math.min.apply(null, btns), ov: document.documentElement.scrollWidth > innerWidth + 1}; });
      m.steps++; m.chars += info.chars; if (info.h > info.vh - 150) m.fold++; m.tapMin = Math.min(m.tapMin, info.tap); m.overflow = m.overflow || info.ov; m.fields.add(step);
      const click = async sel => { await p.click(sel); m.clicks++; await wait(120); };
      if (step === 'role') { await click('.plan-opt[data-v="salon"]'); }
      else if (step === 'tasks') { const ids = await p.evaluate(() => [...document.querySelectorAll('.plan-opt')].map(o => o.getAttribute('data-v'))); await click('.plan-opt[data-v="' + ids[0] + '"]'); await click('.plan-opt[data-v="' + ids[1] + '"]'); await click('.plan-next'); }
      else if (step === 'goal') { await click('.plan-opt[data-v="both"]'); }
      else if (step === 'city') { await click('.plan-opt[data-v="Москва"]'); await click('.plan-next'); }
      else if (step === 'volume') { await click('.plan-opt[data-v="150"]'); await click('.plan-next'); }
      await p.waitForFunction(s => { const c = document.querySelector('.plan-card[data-step]'); return !c || c.getAttribute('data-step') !== s; }, step, {timeout: 6000}).catch(() => {});
      await wait(100);
    }
    const done = await p.evaluate(() => !!document.querySelector('.plan-res'));
    await p.context().close(); m.done = done; m.fields = m.fields.size; return m;
  }
  /* веса: [нажатия, шаги, 1/40 знака, «не помещается», ценность поля для менеджера] — три расстановки */
  const W3 = {'экономия нажатий': [14, 8, 1.0, 18, 4], 'баланс': [10, 6, 1.0, 14, 9], 'ценность данных': [7, 4, 0.8, 10, 16]};
  const planScore = (m, w) => 100 - (m.clicks * w[0] + m.steps * w[1] + m.chars / 40 * w[2] + m.fold * w[3]) + m.fields * w[4] - (m.tapMin < 44 ? 40 : 0) - (m.overflow ? 60 : 0) - (m.done ? 0 : 200);

  /* ---------- 2. Панель следующего шага (телефон): вид × сколько места занимает и мешает ли ---------- */
  async function bar(style) {
    const p = await mk(VIEWS.m); await p.open('products/' + (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'))[0].slug) + '.html?v=barStyle:' + style);
    await p.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * .45)); await wait(1200);
    const r = await p.evaluate(() => { const hit = (a, c) => !!(a && c && a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top); const q = s => { const e = document.querySelector(s); return e && !e.hidden && (e.offsetWidth || e.offsetHeight) ? e.getBoundingClientRect() : null; };
      const bar = q('#sx-bar'); if (!bar) return null; const cta = document.querySelector('#sx-bar .sx-bar-cta').getBoundingClientRect(), x = document.querySelector('#sx-bar .sx-bar-x').getBoundingClientRect();
      return {h: bar.height, w: bar.width, collide: ['.asst-fab', '.qc', '.asst-tip'].filter(s => hit(bar, q(s))).length, tap: Math.min(cta.height, x.height, x.width), ov: document.documentElement.scrollWidth > innerWidth + 1, inView: bar.bottom <= innerHeight + 1 && bar.left >= 0 && bar.right <= innerWidth + 1, lines: Math.round(document.querySelector('#sx-bar .sx-bar-t').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('#sx-bar .sx-bar-t')).lineHeight))}; });
    await p.context().close(); return r;
  }
  const W_BAR = {'экономия места': [0.6, 60, 40], 'баланс': [0.35, 50, 40], 'читаемость': [0.2, 50, 40]};
  const barScore = (m, w) => !m ? -999 : 100 - m.h * w[0] - m.collide * w[1] - (m.tap < 44 ? w[2] : 0) - (m.ov ? 60 : 0) - (m.inView ? 0 : 60) - Math.max(0, m.lines - 2) * 8;

  /* ---------- 3. Ходы по страницам: не ломают ли вёрстку (замеряется, выбор не меняется — убедительность хода арена не оценивает) ---------- */
  const first = dir => fs.readdirSync(path.join(ROOT, dir)).filter(f => /\.html$/.test(f)).sort()[0];
  const PAGES = [['главная', 'index.html'], ['каталог', 'catalog.html'], ['бренды', 'brands.html'], ['бренд', 'brands/keenwell.html'], ['товар', 'products/' + first('products')], ['обучение', 'training.html'],
    ['мероприятие', 'training/' + first('training')], ['партнёры', 'partners.html'], ['новости', 'news.html', true], ['статья', 'news/' + first('news')], ['компания', 'company.html'], ['контакты', 'contacts.html'], ['подбор', 'start.html']];
  async function pageMods(url, vk) {
    const p = await mk(VIEWS[vk]); await p.open(url); await wait(2500);
    await p.evaluate(async () => { for (const y of [.25, .5, .75, 1]) { scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * y); await new Promise(r => setTimeout(r, 250)); } });
    const r = await p.evaluate(() => { const mods = [...document.querySelectorAll('[data-sx-mod], [data-sx-closing], .sx-mod, .sx-fork, .plan, .sx-bchip, .sx-status')]; const taps = [...document.querySelectorAll('[data-sx-mod] .btn, .sx-mod .btn, .sx-fork .btn, [data-sx-mod] [data-sx-act], .sx-fork [data-sx-cta], [data-lad-cta], .sx-cal-nav')].filter(e => e.offsetWidth && e.offsetHeight).map(e => e.offsetHeight);       // высота в вёрстке, без учёта анимации появления (масштаб)
      return {n: mods.length, h: mods.reduce((a, e) => a + e.getBoundingClientRect().height, 0), tap: taps.length ? Math.min.apply(null, taps) : 999, ov: document.documentElement.scrollWidth > innerWidth + 1}; });
    await p.context().close(); return r;
  }

  /* ---------- прогон ---------- */
  const out = {}, tables = [];
  const flows = ['three', 'four', 'five'], styles = ['cards', 'chips'];
  const pr = {};
  for (const vk of ['m', 'd']) for (const f of flows) for (const s of styles) pr[vk + f + s] = await planner(f, s, vk);
  const planCombos = []; for (const f of flows) for (const s of styles) planCombos.push([f, s]);
  const rank = (items, scoreFn, weights) => { const res = {}; for (const [wn, w] of Object.entries(weights)) { const sc = items.map(it => [it.id, scoreFn(it, w)]).sort((x, y) => y[1] - x[1]); res[wn] = sc; } return res; };
  /* победитель — первый минимум при двух расстановках весов из трёх И с отрывом ≥ 2 баллов от второго места в этих расстановках (иначе разница в пределах произвола весов); при равенстве или малом отрыве остаётся текущий */
  const MARGIN = 2;
  const robust = (ranks, current, decides) => {
    if (decides === false) return current;
    const wins = {}; Object.values(ranks).forEach(r => { if (r.length > 1 && r[0][1] - r[1][1] >= MARGIN) wins[r[0][0]] = (wins[r[0][0]] || 0) + 1; });
    const top = Object.entries(wins).sort((a, b) => b[1] - a[1])[0]; return top && top[1] >= 2 ? top[0] : current;
  };
  const fmt = n => (Math.round(n * 10) / 10).toFixed(1);

  /* сначала сравниваем число шагов (при текущем виде вариантов), затем вид вариантов внутри выбранного числа шагов */
  const curStyle = SALES.variants.optionStyle, avg = (it, w) => (planScore(it.m, w) + planScore(it.d, w)) / 2;
  const flowItems = flows.map(f => ({id: f, m: pr['m' + f + curStyle], d: pr['d' + f + curStyle]}));
  const flowRanks = rank(flowItems, avg, W3);
  out.planFlow = robust(flowRanks, SALES.variants.planFlow);
  const styleItems = styles.map(s => ({id: s, m: pr['m' + out.planFlow + s], d: pr['d' + out.planFlow + s]}));
  const styleRanks = rank(styleItems, avg, W3);
  out.optionStyle = robust(styleRanks, curStyle);
  const planRows = planCombos.map(([f, s]) => { const it = {m: pr['m' + f + s], d: pr['d' + f + s]}; return [f + '+' + s, it.m.clicks, it.m.steps, it.m.chars, it.m.fold, Math.round(it.m.tapMin), ...Object.values(W3).map(w => fmt(avg(it, w)))]; });
  tables.push(['Стартовый подбор: число шагов (при текущем виде вариантов)', ['вариант', 'нажатий', 'шагов', 'знаков', 'не помещ. (тел.)', 'мин. кнопка (тел.), px', ...Object.keys(W3).map(k => 'балл: ' + k)], planRows, flowRanks, out.planFlow]);
  tables.push(['Стартовый подбор: вид вариантов ответа (внутри «' + out.planFlow + '»)', ['вариант', ...Object.keys(W3).map(k => 'балл: ' + k)], styleItems.map(it => [it.id, ...Object.values(W3).map(w => fmt(avg(it, w)))]), styleRanks, out.optionStyle]);

  const barItems = []; for (const s of ['bottom', 'card']) barItems.push({id: s, m: await bar(s)});
  barItems.push({id: 'pill', m: await bar('pill')});
  const barRanks = rank(barItems, (it, w) => barScore(it.m, w), W_BAR);
  out.barStyle = robust(barRanks, SALES.variants.barStyle);
  tables.push(['Панель следующего шага на телефоне', ['вариант', 'высота, px', 'наложений', 'мин. кнопка, px', 'строк текста', 'на экране', ...Object.keys(W_BAR).map(k => 'балл: ' + k)],
    barItems.map(it => [it.id, it.m ? Math.round(it.m.h) : '—', it.m ? it.m.collide : '—', it.m ? Math.round(it.m.tap) : '—', it.m ? it.m.lines : '—', it.m ? (it.m.inView ? 'да' : 'нет') : '—', ...Object.values(W_BAR).map(w => fmt(barScore(it.m, w)))]), barRanks, out.barStyle]);

  const modRows = [], modBad = [];
  for (const [name, url, noMod] of PAGES) { const m = await pageMods(url, 'm'), d = await pageMods(url, 'd'); modRows.push([name, m.n, Math.round(m.h), Math.round(d.h), Math.round(Math.min(m.tap, d.tap)), m.ov || d.ov ? 'да' : 'нет']); if ((!m.n && !noMod) || m.ov || d.ov || Math.min(m.tap, d.tap) < 44) modBad.push(name); }
  tables.push(['Ходы по страницам (замер вёрстки, выбор не меняется)', ['страница', 'блоков', 'высота тел., px', 'высота комп., px', 'мин. кнопка, px', 'гориз. прокрутка'], modRows, null, modBad.length ? 'нарушения: ' + modBad.join(', ') : 'все в норме']);
  out.pageModules = modBad.length ? 'нарушения: ' + modBad.join(', ') : 'ok';

  /* ---------- отчёт ---------- */
  const L = ['# Арена продающего слоя — отчёт', '', '_Сгенерировано `node tools/arena-sales.js`. Это замеры оформления в браузере, **не данные о конверсии и не поведение посетителей**._', '',
    '## Как выбирались победители', '',
    '* Каждое сочетание оформления прогнано в настоящем браузере (Chromium) на телефоне 390×844 и на компьютере 1280×860: сквозной сценарий «типичный посетитель», замеры размеров и наложений.',
    '* Жёсткие условия: кнопки ≥ 44 px, нет горизонтальной прокрутки, панель целиком на экране и не накрывает Стеллу/быструю связь, подбор доходит до результата. Нарушение — сильный штраф.',
    '* Веса условны, поэтому каждая размерность оценивается при **трёх** расстановках весов. Победитель назначается, если он первый минимум при двух из трёх **и** с отрывом не менее 2 баллов от второго места; иначе остаётся текущий вариант.',
    '* Ходы по страницам (у каждой страницы свой: развилка на главной, подборки, маршрут бренда, календарь встреч и т. д.) арена только **проверяет вёрстку** — блок на месте, нет горизонтальной прокрутки, кнопки ≥ 44 px, — но убедительность хода не оценивает и выбор не меняет.',
    '* Что арена не знает: какой вариант лучше убеждает. Это решают живые проверки на посетителях (`data/sales.json → experiments`: `barDesktop`, `ctaCopy`) и ваша аналитика/заявки (поле «Источник» у заявки).', ''];
  for (const [title, head, rows, ranks, win] of tables) {
    L.push('## ' + title, '', '| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |'), '');
    L.push((ranks ? 'Первое место по расстановкам весов: ' + Object.entries(ranks).map(([k, v]) => k + ' → **' + v[0][0] + '**').join('; ') + '. ' : '') + '**Итог: ' + win + '**', '');
  }
  L.push('## Итог', '', '```json', JSON.stringify(out, null, 2), '```', '');
  fs.writeFileSync(path.join(__dirname, 'arena-sales-report.md'), L.join('\n'));
  console.log(L.join('\n'));
  if (APPLY) {
    const f = path.join(ROOT, 'data/sales.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const {pageModules, ...vars} = out; Object.assign(j.variants, vars); fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
    console.log('\nЗаписано в data/sales.json → variants. Теперь: node tools/build.js');
  }
  await b.close(); await S.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
