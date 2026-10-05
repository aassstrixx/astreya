/* Арена интерфейса админки: 100 вариантов оформления (размер шрифта, отступы, высота полей, скругление, ширина меню, цвет акцента, ширина предпросмотра)
   → замеры в настоящем браузере на четырёх ключевых экранах (обзор, заявки, редактор страницы, оформление) при трёх ширинах (1440, 1024, 390)
   → шесть номинаций (доступность, надёжность вёрстки, телефон, редактор, удобство, плотность) → турнир на выбывание «сражениями» → победитель.
   Запуск: node tools/arena-admin.js [--n=100] [--seed=2026] [--out=tools/arena-results/admin-ui.json] [--shots=dir]
   Результат: JSON со всеми вариантами, замерами, ходом турнира; в конце — победитель и значения для server/admin/admin.css. */
'use strict';
const fs = require('fs'), path = require('path');
const {boot, request} = require('../server/test/helpers');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
const arg = n => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const N = +(arg('n') || 100), SEED = +(arg('seed') || 2026), OUT = arg('out') || path.join(__dirname, 'arena-results', 'admin-ui.json'), SHOTS = arg('shots');
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));

/* ---------- детерминированный генератор ---------- */
const rnd = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const R = rnd(SEED), pick = a => a[Math.floor(R() * a.length)];

/* ---------- пространство вариантов ---------- */
const ACCENTS = [['#2f5bd6', '#2347b0'], ['#2347b0', '#1b3a8a'], ['#1d4ed8', '#1e40af'], ['#3b6ae0', '#2a50b8'], ['#0f6fb5', '#0b5a94'], ['#4a6cf7', '#3552d0'], ['#2a4fc4', '#203d9a'], ['#3358d4', '#243f9e']];
const AX = {fs: [14, 15, 16], pad: [12, 16, 18, 22, 26], gap: [10, 14, 18, 22], ctl: [34, 38, 42, 46], ctlSm: [24, 28, 30, 34, 38], r: [6, 10, 12, 16], side: [208, 224, 240, 264], row: [7, 9, 11, 14], pv: [340, 380, 420, 480], acc: ACCENTS.map((_, i) => i)};
const ARCH = [   // «заготовки»: действующий вид и несколько осмысленных образцов
  {name: 'действующий', fs: 15, pad: 18, gap: 14, ctl: 38, ctlSm: 30, r: 12, side: 240, row: 11, pv: 420, acc: 0},
  {name: 'компактный', fs: 14, pad: 12, gap: 10, ctl: 34, ctlSm: 26, r: 8, side: 208, row: 7, pv: 340, acc: 0},
  {name: 'просторный', fs: 16, pad: 26, gap: 22, ctl: 46, ctlSm: 38, r: 16, side: 264, row: 14, pv: 480, acc: 0},
  {name: 'для тачскрина', fs: 16, pad: 18, gap: 14, ctl: 46, ctlSm: 38, r: 12, side: 240, row: 14, pv: 420, acc: 0},
  {name: 'деловой', fs: 15, pad: 16, gap: 14, ctl: 40, ctlSm: 32, r: 10, side: 224, row: 9, pv: 380, acc: 1}
];
const variants = ARCH.slice(0, Math.min(ARCH.length, N)).map((a, i) => Object.assign({id: 'v' + String(i).padStart(3, '0')}, a));
const seen = new Set(variants.map(v => JSON.stringify(Object.assign({}, v, {id: 0, name: 0}))));
while (variants.length < N) { const v = {}; for (const k of Object.keys(AX)) v[k] = pick(AX[k]); v.ctlSm = Math.min(v.ctlSm, v.ctl - 2); const key = JSON.stringify(Object.assign({}, v, {id: 0, name: 0})); if (seen.has(key)) continue; seen.add(key); variants.push(Object.assign({id: 'v' + String(variants.length).padStart(3, '0'), name: ''}, v)); }
const tokens = v => ({'--fs': v.fs + 'px', '--pad': v.pad + 'px', '--gap': v.gap + 'px', '--ctl': v.ctl + 'px', '--ctl-sm': v.ctlSm + 'px', '--r': v.r + 'px', '--side-w': v.side + 'px', '--row': v.row + 'px', '--pv': v.pv + 'px', '--blue': ACCENTS[v.acc][0], '--blue-d': ACCENTS[v.acc][1]});

/* ---------- замер в странице (исполняется в браузере) ---------- */
function measure() {
  const vw = innerWidth, vh = innerHeight, mobile = vw <= 900;
  const rectOf = e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; const cs = getComputedStyle(e); return cs.visibility === 'hidden' || cs.display === 'none' ? null : r; };
  const offscreenSide = e => mobile && !!e.closest('.side') && !document.body.classList.contains('nav-open');
  const skip = e => e.closest('[hidden],.sr,.toasts,.overlay,.pal-ov,iframe,script,style,.skip') || offscreenSide(e);
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1}; };
  const over = (f, b) => ({r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1});
  const bgOf = e => { const stack = []; for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none' && !/^linear-gradient/.test(cs.backgroundImage)) return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = {r: 255, g: 255, b: 255, a: 1}; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* текст: контраст и размер, с весом по числу символов */
  let chars = 0, badC = 0, smallC = 0, minRatio = 21; const fsAll = [], lowWho = [], clipWho = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.nodeValue.trim(); if (!t) continue; const e = n.parentElement; if (!e || skip(e) || !rectOf(e)) continue;
    if (e.closest(':disabled,[disabled],[aria-disabled=true]')) continue;
    const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize), fg = parse(cs.color), bg = bgOf(e); if (!fg || !bg) continue;
    let op = 1; for (let x = e; x; x = x.parentElement) op *= +getComputedStyle(x).opacity; const fgc = over(Object.assign({}, fg, {a: fg.a * op}), bg), r = ratio(fgc, bg);
    const large = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700), need = large ? 3 : 4.5;
    chars += t.length; fsAll.push([fs, t.length]); if (r < need) { badC += t.length; if (lowWho.length < 5) lowWho.push(e.tagName + '.' + String(e.className).slice(0, 24) + ' «' + t.slice(0, 22) + '» ' + r.toFixed(2) + ' ' + fs + 'px'); } if (r < minRatio) minRatio = r; if (fs < (mobile ? 14 : 13)) smallC += t.length;
  }
  /* элементы управления */
  const ctr = [...document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button]')].filter(e => !skip(e) && !(e.tagName === 'A' && e.closest('p,li,dd,small,.help,.muted,.sub,.alert,.hl,.empty,.crumbs')) && !e.classList.contains('stretch'));
  const T = []; let inFirst = 0, tiny = 0, in16 = 0, inN = 0;
  ctr.forEach(e => { const lab = (e.type === 'checkbox' || e.type === 'radio') ? e.closest('label') : null, r = (lab || e).getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') return; if (r.right <= 0 || r.left >= vw) return;
    T.push(Math.min(r.width, r.height)); if (r.top < vh && r.bottom > 0) inFirst++;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !/^(checkbox|radio|range|color)$/.test(e.type)) { inN++; if (parseFloat(getComputedStyle(e).fontSize) >= 16) in16++; } });
  const share = min => T.length ? T.filter(x => x >= min - 0.5).length / T.length : 1;
  /* вёрстка */
  const scrollsX = e => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  let offenders = 0; document.querySelectorAll('body *').forEach(e => { if (skip(e) || scrollsX(e)) return; const r = rectOf(e); if (r && r.right > vw + 1) offenders++; });
  let clipped = 0; document.querySelectorAll('.btn,.tab,button.nav,a.nav').forEach(e => { if (!skip(e) && rectOf(e) && e.scrollWidth > e.clientWidth + 1) { clipped++; if (clipWho.length < 4) clipWho.push(e.tagName + '.' + String(e.className).slice(0, 24) + ' «' + e.textContent.trim().slice(0, 24) + '» ' + e.scrollWidth + '>' + e.clientWidth + ' в ' + e.parentElement.className + ' ' + e.parentElement.clientWidth); } });
  const side = document.querySelector('.side'), sideScroll = !mobile && side ? side.scrollHeight > side.clientHeight + 1 : false;
  const pb = document.querySelector('.pb'); let editorW = null, prevW = null, stacked = null;
  if (pb && pb.children.length > 1) { const a = pb.children[0].getBoundingClientRect(), b = pb.children[1].getBoundingClientRect(); editorW = a.width; prevW = b.width; stacked = b.top > a.top + 40; }
  const main = document.querySelector('.main'), mainW = main ? main.getBoundingClientRect().width : vw;
  const cards = [...document.querySelectorAll('.card')].filter(e => rectOf(e) && !skip(e)); const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };
  const cardPad = med(cards.map(e => parseFloat(getComputedStyle(e).paddingLeft)));
  const fields = [...document.querySelectorAll('input[type=text],input[type=search],select,textarea')].filter(e => rectOf(e) && !skip(e)); const fieldH = med(fields.map(e => e.getBoundingClientRect().height));
  let sw = 0, acc = 0; fsAll.forEach(([f, n]) => { sw += n; acc += f * n; });
  return {chars, badShare: chars ? badC / chars : 0, smallShare: chars ? smallC / chars : 0, minRatio, fsMean: sw ? acc / sw : 0, share24: share(24), share40: share(40), share44: share(44), minTarget: T.length ? Math.min(...T) : 99, nCtl: T.length,
    inFirst, inputs16: inN ? in16 / inN : 1, nInputs: inN, overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), offenders, clipped, sideScroll, editorW, prevW, stacked, mainW,
    docH: document.documentElement.scrollHeight, cardPad, fieldH, lowWho, clipWho};
}

/* ---------- сбор данных для экранов ---------- */
async function seed(S, api) {
  const cur = (await api.get('/api/collections/pages')).json;
  const blocks = [{type: 'text', title: 'Как мы работаем', paragraphs: ['Мы работаем с клиниками и салонами по всей России и помогаем освоить новые продукты.', 'Обучаем специалистов бесплатно.']}, {type: 'list', title: 'Что вы получаете', items: ['Обучение специалистов', 'Поддержку менеджера', 'Скидки по объёму']},
    {type: 'cards', eyebrow: 'Условия', title: 'Три шага к сотрудничеству', cols: 3, items: [{title: 'Заявка', text: 'Оставьте контакты', href: '', image: ''}, {title: 'Договор', text: 'Согласуем условия', href: '', image: ''}]}, {type: 'steps', eyebrow: '', title: 'Как это работает', items: [{title: 'Знакомство', text: 'Созвон'}, {title: 'Обучение', text: 'Семинар'}]},
    {type: 'faq', eyebrow: '', title: 'Частые вопросы', items: [{q: 'Сколько стоит обучение?', a: 'Для партнёров бесплатно.'}]}, {type: 'cta', eyebrow: '', title: 'Готовы начать?', text: 'Оставьте заявку.', label: 'Стать партнёром', href: 'partners.html', tone: 'dark'}];
  const items = [{slug: 'usloviya', title: 'Условия сотрудничества', eyebrow: 'Партнёрам', lead: 'Как мы работаем с клиниками и салонами.', description: 'Условия сотрудничества с Астреей: обучение специалистов, поддержка менеджера и скидки по объёму закупки для клиник.', published: true, nav: false, blocks}];
  const r = await api.put('/api/collections/pages', {data: Object.assign({}, cur.data, {items}), version: cur.version}); if (r.status !== 200) throw new Error('seed pages: ' + r.text);
  const s = (await api.get('/api/settings')).json; s.rateLimit = {per10min: 500, perDay: 5000}; await api.put('/api/settings', s);
  const names = ['Мария Иванова', 'Алексей Петров', 'Ольга Смирнова', 'Дмитрий Кузнецов', 'Елена Соколова', 'Иван Попов', 'Наталья Лебедева', 'Сергей Козлов', 'Анна Новикова', 'Павел Морозов'];
  for (let i = 0; i < names.length; i++) await request(S.port, 'POST', '/api/lead', {headers: {Origin: 'http://127.0.0.1:' + S.port, 'X-Forwarded-For': '10.1.' + i + '.1'}, body: {type: ['partner', 'question', 'seminar', 'product'][i % 4], name: names[i], phone: '+7 916 555-44-3' + i, email: 'user' + i + '@example.com', city: ['Самара', 'Казань', 'Москва'][i % 3], org: 'Клиника «Роза»', msg: 'Интересует сотрудничество и обучение специалистов, просим связаться.', consent: true, fill_ms: 9000}});
}
const SCREENS = [['overview', '#/overview', '.kpis'], ['leads', '#/leads', 'tr.click'], ['editor', '#/pages/usloviya', '#pg-save'], ['design', '#/design/backdrops', '.tex']];
const VIEWPORTS = [['wide', {width: 1440, height: 900}, {}], ['laptop', {width: 1024, height: 768}, {}], ['phone', {width: 390, height: 844}, {isMobile: true, hasTouch: true}]];

async function collect(S) {
  const browser = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {}), res = {};
  await Promise.all(VIEWPORTS.map(async ([vn, vp, extra]) => {
    const ctx = await browser.newContext(Object.assign({viewport: vp, locale: 'ru-RU'}, extra)), p = await ctx.newPage(); p.on('dialog', d => d.accept());
    await p.goto('http://127.0.0.1:' + S.port + '/admin/'); await p.fill('#f-login', 'admin'); await p.fill('#f-pass', 'Strong-pass-2026'); await p.click('button[type=submit]'); await p.waitForSelector('.side a.nav');
    for (const [sn, hash, sel] of SCREENS) {
      await p.evaluate(h => { location.hash = h; }, hash); await p.waitForSelector(sel, {timeout: 20000}); await p.waitForTimeout(400);
      if (sn === 'editor') await p.evaluate(() => document.querySelectorAll('.blk').forEach(b => { b.open = true; }));
      for (const v of variants) {
        await p.evaluate(t => { const r = document.documentElement.style; for (const k in t) r.setProperty(k, t[k]); }, tokens(v)); await p.waitForTimeout(25);
        (res[v.id] = res[v.id] || {})[vn + '/' + sn] = await p.evaluate(measure);
      }
      await p.evaluate(() => { const r = document.documentElement.style; ['--fs', '--pad', '--gap', '--ctl', '--ctl-sm', '--r', '--side-w', '--row', '--pv', '--blue', '--blue-d'].forEach(k => r.removeProperty(k)); });
    }
    await ctx.close();
  }));
  await browser.close(); return res;
}

/* ---------- оценки по номинациям ---------- */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
function score(v, M) {
  const by = vn => SCREENS.map(([sn]) => M[vn + '/' + sn]);
  /* акцент: синий текст и ссылки на белом, на фоне страницы и на светло-синем, белый текст на синей кнопке — не меньше 4,5:1 (проверка по цветам, а не только по видимым надписям: учитывает и наведение, и вкладки) */
  const lumH = h => { const a = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }, ratioH = (p, q) => { const x = lumH(p), y = lumH(q); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const accMin = Math.min(...['#ffffff', '#f2f4f9', '#e8eefc'].map(bg => ratioH(ACCENTS[v.acc][0], bg)), ratioH(ACCENTS[v.acc][1], '#e8eefc')), accent = clamp(accMin - 3.5);
  const a11y = vn => { const m = by(vn), contrast = mean(m.map(x => 1 - clamp(x.badShare * 12) * (x.minRatio < 3 ? 1 : 0.8))), tg = mean(m.map(x => 0.5 * x.share24 + 0.5 * (vn === 'phone' ? x.share44 : x.share40))), fonts = mean(m.map(x => 1 - clamp(x.smallShare * 6))); return 0.3 * contrast + 0.15 * accent + 0.35 * tg + 0.2 * fonts; };
  const fit = vn => { const m = by(vn); let s = 1; m.forEach(x => { if (x.overflowX > 1) s -= 0.5 / m.length * 2; if (x.offenders) s -= 0.2 / m.length * 2; s -= Math.min(0.3, x.clipped * 0.1) / m.length; if (x.sideScroll) s -= 0.2 / m.length; }); return clamp(s); };
  const comfort = (() => { const m = ['wide', 'laptop'].flatMap(vn => by(vn)); const fsm = mean(m.map(x => x.fsMean)), fh = mean(m.map(x => x.fieldH).filter(Boolean)), cp = mean(m.map(x => x.cardPad).filter(Boolean)), t40 = mean(m.map(x => x.share40)); return mean([clamp(1 - Math.abs(fsm - 15.3) / 2.5), clamp(1 - Math.abs(fh - 42) / 12), clamp(1 - Math.abs(cp - 21) / 14), t40]); })();
  const density = (() => { const w = by('wide'), l = by('laptop'); return {first: mean([...w, ...l].map(x => x.inFirst)), h: M['wide/editor'].docH}; })();
  const mobile = (() => { const m = by('phone'); return 0.35 * mean(m.map(x => x.overflowX > 1 || x.offenders ? 0 : 1)) + 0.25 * mean(m.map(x => x.inputs16)) + 0.4 * mean(m.map(x => x.share44)); })();
  const editor = (() => { const w = M['wide/editor'], l = M['laptop/editor']; const col = (x, lo, hi) => x === null ? 0 : x >= lo && x <= hi ? 1 : clamp(1 - (x < lo ? lo - x : x - hi) / 300); return 0.35 * col(w.editorW, 560, 840) + 0.25 * (w.prevW >= 360 ? 1 : clamp(w.prevW / 360)) + 0.25 * (l.stacked ? col(l.editorW, 500, 900) : col(l.editorW, 520, 900)) + 0.15 * clamp(1 - Math.abs(w.mainW - 1100) / 700); })();
  const dq = accMin < 4.5 || [...VIEWPORTS.map(x => x[0])].some(vn => by(vn).some(x => x.share24 < 0.98 || x.badShare > 0.05 && x.minRatio < 3)) || by('phone').some(x => x.overflowX > 1);
  return {accMin: +accMin.toFixed(2), a11y: mean(VIEWPORTS.map(x => a11y(x[0]))), fit: mean(VIEWPORTS.map(x => fit(x[0]))), mobile, editor, comfort, density, dq};
}
function finish(all) {                           // плотность — нормируем по всем вариантам
  const f = all.map(x => x.score.density.first), h = all.map(x => x.score.density.h), nf = v => (v - Math.min(...f)) / ((Math.max(...f) - Math.min(...f)) || 1), nh = v => 1 - (v - Math.min(...h)) / ((Math.max(...h) - Math.min(...h)) || 1);
  all.forEach(x => { x.score.density = 0.6 * nf(x.score.density.first) + 0.4 * nh(x.score.density.h); const s = x.score; x.total = 0.25 * s.a11y + 0.2 * s.fit + 0.15 * s.mobile + 0.15 * s.editor + 0.15 * s.comfort + 0.1 * s.density; });
}
const CATS = ['a11y', 'fit', 'mobile', 'editor', 'comfort', 'density'], CAT_RU = {a11y: 'доступность', fit: 'надёжность вёрстки', mobile: 'телефон', editor: 'редактор', comfort: 'удобство', density: 'плотность'};

/* ---------- турнир на выбывание ---------- */
function battle(A, B, rng) {
  if (A.score.dq !== B.score.dq) return {w: A.score.dq ? B : A, pts: [0, 0], why: 'дисквалификация'};
  let a = 0, b = 0; const rows = CATS.map(c => { const d = A.score[c] - B.score[c]; if (Math.abs(d) < 0.01) { a += 0.5; b += 0.5; return [c, 'ничья']; } if (d > 0) { a++; return [c, A.id]; } b++; return [c, B.id]; });
  if (a !== b) return {w: a > b ? A : B, pts: [a, b], rows}; if (Math.abs(A.total - B.total) > 1e-9) return {w: A.total > B.total ? A : B, pts: [a, b], rows, why: 'по сумме баллов'}; return {w: rng() < 0.5 ? A : B, pts: [a, b], rows, why: 'жребий'};
}
function seedOrder(n) { let o = [1]; while (o.length < n) { const m = o.length * 2 + 1; o = o.flatMap(x => [x, m - x]); } return o; }
function tournament(all, rng) {
  const ranked = all.slice().sort((x, y) => y.total - x.total), size = 2 ** Math.ceil(Math.log2(ranked.length)), order = seedOrder(size);
  let round = order.map(s => ranked[s - 1] || null), rounds = [];
  while (round.length > 1) { const next = [], log = []; for (let i = 0; i < round.length; i += 2) { const A = round[i], B = round[i + 1]; if (!A || !B) { next.push(A || B); continue; } const r = battle(A, B, rng); next.push(r.w); log.push({a: A.id, b: B.id, winner: r.w.id, pts: r.pts, why: r.why || ''}); } rounds.push(log); round = next; }
  return {champion: round[0], rounds};
}

(async () => {
  const S = await boot({}), api = await S.admin(); await seed(S, api);
  console.log(`Вариантов: ${variants.length}; экранов: ${SCREENS.length} × ширин: ${VIEWPORTS.length}; замеры…`); const t0 = Date.now();
  const M = await collect(S); console.log(`замеры готовы за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  const all = variants.map(v => ({id: v.id, name: v.name || '', tokens: v, score: score(v, M[v.id]), metrics: M[v.id]})); finish(all);
  const rng = rnd(SEED + 1), T = tournament(all, rng), champ = T.champion, ranked = all.slice().sort((a, b) => b.total - a.total);
  const fmt = x => x.toFixed(3);
  console.log('\nТурнир: ' + T.rounds.map((r, i) => `раунд ${i + 1}: ${r.length} боёв`).join(', '));
  console.log('\nПервые 10 по сумме баллов:'); ranked.slice(0, 10).forEach((x, i) => console.log(` ${String(i + 1).padStart(2)}. ${x.id} ${(x.name || '').padEnd(12)} итог ${fmt(x.total)} | ` + CATS.map(c => CAT_RU[c].slice(0, 6) + ' ' + fmt(x.score[c])).join(' | ') + (x.score.dq ? '  [ДИСКВАЛИФИЦИРОВАН]' : '')));
  const incumbent = all[0]; console.log(`\nДействующий вид (${incumbent.id}): итог ${fmt(incumbent.total)}, место по сумме: ${ranked.indexOf(incumbent) + 1}${incumbent.score.dq ? ', дисквалифицирован' : ''}`);
  console.log('\nПОБЕДИТЕЛЬ ТУРНИРА:', champ.id, JSON.stringify(champ.tokens), ' итог ' + fmt(champ.total), ' место по сумме: ' + (ranked.indexOf(champ) + 1)); console.log('  номинации: ' + CATS.map(c => CAT_RU[c] + ' ' + fmt(champ.score[c])).join(', '));
  console.log('  дисквалифицировано вариантов: ' + all.filter(x => x.score.dq).length + ' из ' + all.length);
  fs.writeFileSync(OUT, JSON.stringify({seed: SEED, axes: AX, accents: ACCENTS, categories: CAT_RU, champion: champ.id, variants: all.map(x => ({id: x.id, name: x.name, tokens: x.tokens, total: +x.total.toFixed(4), score: Object.fromEntries(Object.entries(x.score).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v])), metrics: x.metrics})), tournament: T.rounds}, null, 1));
  console.log('\nОтчёт: ' + OUT);
  if (SHOTS) {                       // снимки финалистов для проверки глазами
    fs.mkdirSync(SHOTS, {recursive: true}); const browser = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {}), finalists = [champ, incumbent, ...ranked.filter(x => x !== champ && x !== incumbent).slice(0, 2)];
    for (const [vn, vp, extra] of VIEWPORTS.filter(x => x[0] !== 'laptop')) { const ctx = await browser.newContext(Object.assign({viewport: vp, locale: 'ru-RU'}, extra)), p = await ctx.newPage(); await p.goto('http://127.0.0.1:' + S.port + '/admin/'); await p.fill('#f-login', 'admin'); await p.fill('#f-pass', 'Strong-pass-2026'); await p.click('button[type=submit]'); await p.waitForSelector('.side a.nav');
      for (const [sn, hash, sel] of SCREENS.filter(x => ['editor', 'overview'].includes(x[0]))) { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForSelector(sel); await p.waitForTimeout(400); if (sn === 'editor') await p.evaluate(() => document.querySelectorAll('.blk').forEach(b => { b.open = true; }));
        for (const f of finalists) { await p.evaluate(t => { const r = document.documentElement.style; for (const k in t) r.setProperty(k, t[k]); }, tokens(f.tokens)); await p.waitForTimeout(150); await p.screenshot({path: path.join(SHOTS, `${vn}-${sn}-${f.id}${f === champ ? '-WINNER' : f === incumbent ? '-current' : ''}.png`)}); } }
      await ctx.close(); }
    await browser.close(); console.log('Снимки финалистов: ' + SHOTS);
  }
  await S.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
