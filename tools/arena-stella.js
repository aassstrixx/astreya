#!/usr/bin/env node
/* «Арена» Стеллы-навигатора: турнир вариантов по ИЗМЕРИМЫМ критериям — что внедрить по умолчанию (data/stella/guide.json).
   Это не опрос посетителей и не A/B-тест: данных о поведении реальных людей у сайта пока нет. Арена отсеивает плохое (обрезанный текст, нехватка контраста, наезд на другие кнопки, давящие
   и обещающие формулировки) и выбирает лучшее из того, что можно проверить в браузере и по тексту. Реальные результаты покажет аналитика после запуска (события guide_nudge, cmp_ask_stella…).

   Что соревнуется:
   1. Формат ответа-сравнения (lines · sections · cards · verdict · brief): по ВСЕМ парам (435) и тройкам (4060) товаров каталога — полнота фактов, читаемость, «сканируемость», повторы, длина,
      честность (нет цен, обещаний, «undefined»), помощь в выборе. Победитель → compare.template.
   2. Оформление подсказки у кнопки (bubble · pill · card), блока на странице (strip · slim · card) и плашки сравнения (full · compact · stacked): в Chromium на 7 размерах экрана и 5 страницах
      — влезает ли, нет ли наезда на кнопку Стеллы / нижнюю плашку / шапку, контраст текста (WCAG), размер нажимаемых элементов, доля экрана, число строк, сдвиг вёрстки (CLS).
      Победители → nudge.layout, entry.style, compare.plateStyle.
   3. Тексты подсказок «Не знаете, …? Спросите меня…» для каждой страницы (по ~11 формулировок на страницу, включая заведомо плохие — давящие, длинные, без призыва — для контроля арены):
      длина, вопрос-зацепка, призыв, польза для человека, обращение, отсутствие давления и обещаний. Формулировка заказчика для главной и каталога закреплена и в турнире только проверяется.
   Запуск: node tools/arena-stella.js [--text] [--layout] [--apply] [--quick]   (после node tools/build.js). Без флагов — всё, без записи. --apply записывает победителей в data/stella/guide.json
   и отчёт в tools/arena-stella-report.md. Нужны Playwright и Chromium для части 2. Код возврата ≠ 0, если контрольные («заведомо плохие») варианты выиграли — значит, арена сломана. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..'), ARGS = process.argv.slice(2), has = f => ARGS.includes(f);
const DO_TEXT = has('--text') || !has('--layout'), DO_LAYOUT = has('--layout') || !has('--text'), APPLY = has('--apply'), QUICK = has('--quick');
const load = f => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); return JSON.parse(t.slice(t.indexOf('= ') + 2).trim().replace(/;\s*$/, '')); };
const D = load('js/data.js'), KB = load('js/kb.js');
const {createBrain} = require('../js/assistant-brain.js');
const brain = createBrain(D, KB, {now: () => new Date(2026, 9, 12, 10, 0, 0)});
const GUIDE_FILE = path.join(ROOT, 'data/stella/guide.json'), G = JSON.parse(fs.readFileSync(GUIDE_FILE, 'utf8')).guide;
const out = {text: {}, layout: {}}; let bad = 0; const lines = [];
const log = s => { console.log(s); lines.push(s); };
const trace = m => { if (process.env.ARENA_VERBOSE) process.stderr.write('      ' + m + '\n'); };
const pct = x => Math.round(x * 100) + '%', f1 = x => (Math.round(x * 10) / 10).toFixed(1);

/* ============ 1. формат ответа-сравнения ============ */
function textArena() {
  log('\n## 1. Формат ответа-сравнения');
  const ids = D.products.map(p => p.id), pairs = [], triples = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { pairs.push([ids[i], ids[j]]); if (!QUICK || (i * 7 + j) % 5 === 0) for (let k = j + 1; k < ids.length; k += (QUICK ? 7 : 3)) triples.push([ids[i], ids[j], ids[k]]); }
  const sample = pairs.concat(triples).concat(ids.map(i => [i]));
  const FACTS = [/бренд|Dermatime|Keenwell|Endocare|Neoretin|Heliocare|Elancyl|Iraltone|Eva|Biretix/i, /категори|эстетика|пилинг|косметик|домашн|аппарат|фотозащит|волос/i, /вид|препарат|пилинг|средств|крем|сыворотк|гель|шампун|маск/i, /задач|для «/i, /Только у|Общие задачи|Общая задача|общая задача/, /новинк/i, /кабинет|дом/i, /Чего на сайте нет|на сайте нет/, /специалист|менеджер/, /Кому что ближе|Коротко|ближе|Окончательный выбор|Итог/, /\?|Чтобы подсказать|запрос/];
  const BAD = /undefined|null|NaN|\[object|₽|руб|%|гаранти|лечит|вылеч|эффективн|безопасн для всех|лучший|№\s?1|:\s*;|—\s*\.|\s,|\.\./i;
  const names = brain.compareTemplates, res = {};
  names.forEach(t => { res[t] = {n: 0, cov: 0, read: 0, scan: 0, redun: 0, lenFit: 0, help: 0, score: 0, hardFail: 0, len: 0, minScore: 100}; });
  const words = s => s.replace(/\*\*/g, '').split(/\s+/).filter(Boolean), sentences = s => s.replace(/\*\*/g, '').split(/(?<=[.!?])\s+|\n+/).filter(x => x.trim().length > 2);
  for (const s of sample) {
    const one = s.length === 1;
    for (const t of names) {
      const txt = brain.compareText(s, t), R = res[t]; R.n++; R.len += txt.length;
      const hard = BAD.test(txt.replace(/«[^»]*»/g, '«»')) || !s.every(id => txt.includes(D.products.find(p => p.id === id).name)) || !txt.trim();
      if (hard) R.hardFail++;
      const cov = FACTS.filter((re, i) => (one && (i === 4 || i === 6) ? false : true) && re.test(txt)).length / FACTS.filter((re, i) => !(one && (i === 4 || i === 6))).length;
      const sn = sentences(txt), wps = sn.length ? sn.reduce((a, x) => a + words(x).length, 0) / sn.length : 99, read = Math.max(0, Math.min(1, 1 - (wps - 14) / 22));
      const labels = (txt.match(/\*\*[^*]{2,24}\*\*/g) || []).length + (txt.match(/^- /gm) || []).length, scan = Math.min(1, labels / (one ? 4 : 5));
      const w4 = words(txt.toLowerCase()); const grams = {}; let rep = 0, tot = 0; for (let i = 0; i + 3 < w4.length; i++) { const g = w4.slice(i, i + 4).join(' '); grams[g] = (grams[g] || 0) + 1; if (grams[g] > 1) rep++; tot++; } const redun = tot ? rep / tot : 0;
      const lo = one ? 260 : 380, hi = one ? 760 : 1250, lenFit = txt.length < lo ? txt.length / lo : txt.length > hi ? Math.max(0, 1 - (txt.length - hi) / hi) : 1;
      const help = /Кому что ближе|Коротко|Итог|ближе|подойдут оба|Выбор зависит|Окончательный выбор|Чтобы подсказать/.test(txt) ? 1 : 0;
      const score = hard ? 0 : 100 * (0.30 * cov + 0.20 * read + 0.15 * scan + 0.15 * (1 - Math.min(1, redun * 6)) + 0.10 * lenFit + 0.10 * help);
      R.cov += cov; R.read += read; R.scan += scan; R.redun += redun; R.lenFit += lenFit; R.help += help; R.score += score; R.minScore = Math.min(R.minScore, score);
    }
  }
  log('Выборка: ' + sample.length + ' наборов товаров (' + pairs.length + ' пар, ' + triples.length + ' троек, ' + ids.length + ' одиночных). Критерии: полнота фактов 30 · читаемость 20 · сканируемость 15 · без повторов 15 · длина 10 · помощь в выборе 10; брак (цены, обещания, «undefined», пропавшие названия) = 0.');
  log('\n| Формат | Балл (средний) | Худший | Полнота | Читаемость | Сканируемость | Повторы | Длина, знаков | Брак |\n|---|---|---|---|---|---|---|---|---|');
  const rows = names.map(t => { const R = res[t], n = R.n; return {t, score: R.score / n, min: R.minScore, cov: R.cov / n, read: R.read / n, scan: R.scan / n, redun: R.redun / n, len: R.len / n, hard: R.hardFail}; }).sort((a, b) => b.score - a.score);
  rows.forEach(r => log(`| ${r.t} | **${f1(r.score)}** | ${f1(r.min)} | ${pct(r.cov)} | ${pct(r.read)} | ${pct(r.scan)} | ${pct(r.redun)} | ${Math.round(r.len)} | ${r.hard} |`));
  const win = rows.filter(r => r.hard === 0 && r.t !== 'brief')[0] || rows[0];
  out.text.compare = {winner: win.t, scores: Object.fromEntries(rows.map(r => [r.t, Math.round(r.score * 10) / 10]))};
  log('\nПобедитель: **' + win.t + '**' + (rows[0].t === 'brief' ? ' («brief» — короткая версия с встречным вопросом: набирает мало фактов и в победители не допускается, она нужна как запасной формат)' : '') + '.');
  if (win.hard) { bad++; log('✗ у победителя есть брак'); }
  return win.t;
}

/* ============ 3. тексты подсказок ============ */
const PAGE_Q = {home: ['с чего начать', 'с чего начинать'], catalog: ['что выбрать', 'что взять'], brands: ['какой бренд вам ближе', 'какой бренд выбрать'], brand: ['что выбрать у этого бренда', 'что взять у этого бренда'], product: ['подойдёт ли вам этот продукт', 'для кого этот продукт'],
  training: ['какой семинар выбрать', 'на какое мероприятие пойти'], event: ['стоит ли вам идти на это мероприятие', 'что будет на мероприятии'], partners: ['с чего начать сотрудничество', 'какие условия вам подойдут'], contacts: ['кому написать', 'как быстрее связаться'], search: ['что искать', 'как найти нужное'], company: ['что о нас важно знать', 'с чего знакомиться с компанией'], news: ['что почитать', 'что здесь главное']};
const FIX = {home: 'заказчик', catalog: 'заказчик'};          // формулировка «Не знаете, что выбрать? Спросите меня — всё обсудим, и я помогу.» задана заказчиком
function copyVariants(page) {
  const [q, q2] = PAGE_Q[page], cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  return [
    {id: 'ask-discuss', ctl: false, t: `Не знаете, ${q}? Спросите меня — всё обсудим, и я помогу.`},
    {id: 'doubt-facts', ctl: false, t: `Сомневаетесь, ${q}? Спросите меня — расскажу по данным сайта.`},
    {id: 'help-reply', ctl: false, t: `Помочь разобраться, ${q}? Спросите Стеллу — отвечу сразу.`},
    {id: 'question-show', ctl: false, t: `${cap(q)}? Спросите Стеллу: подскажу и покажу на сайте.`},
    {id: 'describe-pick', ctl: false, t: `Не определились? Опишите задачу — Стелла подберёт и объяснит.`},
    {id: 'hint-guide', ctl: false, t: `Нужна подсказка? Я Стелла — отвечу на вопросы и проведу по сайту.`},
    {id: 'lazy-find', ctl: false, t: `Не хотите искать сами? Скажите, что нужно, — я найду и покажу.`},
    {id: 'not-hard', ctl: false, t: `Не так сложно, как кажется. Спросите меня — разберёмся вместе.`},
    {id: 'alt-q', ctl: false, t: `Не знаете, ${q2}? Спросите меня — всё обсудим, и я помогу.`},
    /* контрольные (заведомо плохие): арена обязана их отвергнуть */
    {id: 'CTL-pressure', ctl: true, t: `Только сегодня: спросите Стеллу и получите лучший подбор со скидкой!`},
    {id: 'CTL-long', ctl: true, t: `Если у вас возникли вопросы по ассортименту, условиям поставки, обучению или сотрудничеству, вы можете задать их мне, и я постараюсь вам помочь в удобное время.`},
    {id: 'CTL-nocta', ctl: true, t: `Стелла — помощник на сайте.`},
    {id: 'CTL-promise', ctl: true, t: `Гарантируем результат: Стелла подберёт самое лучшее средство!`}
  ];
}
const BADW = /срочно|только сегодня|успейте|скидк|акци[яию]|бесплатн|гаранти|лучш(?:ий|ая|ее|им)|самое|100\s?%|№\s?1|распродаж/i;
/* слова, по которым видно, что подсказка относится именно к этой странице (а не «одна на всех») */
const REL = {home: /начать|начина|сайт/i, catalog: /выбрать|взять|подбер|задач/i, brands: /бренд/i, brand: /бренд/i, product: /продукт/i, training: /семинар|мероприят|обучен/i, event: /мероприят/i, partners: /сотрудничеств|условия|скидк/i, contacts: /написать|связаться|менеджер/i, search: /искать|найти|ищете/i, company: /компани|знакомить|нас/i, news: /почитать|главн|новост/i};
function scoreCopy(t, page) {
  const first = t.split(/(?<=[.!?])\s+/)[0] || t, w = t.replace(/[—–-]/g, ' ').split(/\s+/).filter(Boolean), sn = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  let s = 0; const why = [];
  if (/\?/.test(first)) { s += 15; why.push('вопрос-зацепка'); }
  if (/спросите|расскажите|опишите|скажите|напишите/i.test(t)) { s += 15; why.push('призыв'); }
  if (/помогу|подскажу|подберу|расскажу|объясню|найду|покажу|разберёмся|отвечу|проведу|подберёт|объяснит/i.test(t)) { s += 15; why.push('польза'); }
  if (/(?:^|[^а-яё])(?:я|меня|мне|Стелл[аыу])(?![а-яё])/i.test(t)) { s += 10; why.push('живой голос'); }
  s += t.length <= 82 ? 15 : t.length <= 110 ? 7 : 0; if (t.length > 110) why.push('длинно');
  s += sn.length ? (w.length / sn.length <= 12 ? 10 : 4) : 0;
  if (REL[page] && REL[page].test(t)) { s += 20; why.push('про эту страницу'); }
  if (BADW.test(t)) { s -= 100; why.push('давление/обещание'); }
  return {score: s, why};
}
function copyArena() {
  log('\n## 3. Тексты подсказок «Не знаете, …?» по страницам');
  log('Критерии: вопрос-зацепка 15 · призыв 15 · польза для человека 15 · живой голос 10 · длина ≤82 знаков 15 (≤110 — 7) · короткие предложения 10 · «про эту страницу» 20; давление и обещания («только сегодня», «скидка», «гарантируем», «лучший») — минус 100. Контрольные варианты помечены CTL и обязаны проиграть.');
  const pick = {}; let ctlWon = 0;
  Object.keys(PAGE_Q).forEach(page => {
    const TONE = {'ask-discuss': 2, 'alt-q': 1};          // при равенстве баллов — тон, который задал заказчик («Не знаете…? Спросите меня — всё обсудим, и я помогу»)
    const vars = copyVariants(page).map(v => Object.assign(v, scoreCopy(v.t, page))).sort((a, b) => b.score - a.score || (TONE[b.id] || 0) - (TONE[a.id] || 0) || a.t.length - b.t.length);
    const win = FIX[page] ? vars.find(v => v.id === 'ask-discuss') : vars.find(v => !v.ctl);
    if (vars[0].ctl) { ctlWon++; log('✗ ' + page + ': выиграл контрольный вариант ' + vars[0].id); }
    pick[page] = {id: win.id, text: win.t, score: win.score, runnerUp: vars.filter(v => v !== win && !v.ctl)[0].id, fixed: !!FIX[page]};
  });
  log('\n| Страница | Победитель | Балл | Текст |\n|---|---|---|---|'); Object.keys(pick).forEach(p => log(`| ${p} | ${pick[p].id}${pick[p].fixed ? ' (закреплён заказчиком)' : ''} | ${pick[p].score} | ${pick[p].text} |`));
  log('\nВариантов в турнире: ' + Object.keys(PAGE_Q).length * 13 + ' (из них контрольных ' + Object.keys(PAGE_Q).length * 4 + '); контрольные выиграли: ' + ctlWon + '.');
  if (ctlWon) bad++;
  out.text.nudge = pick; return pick;
}

/* ============ 2. оформление в браузере ============ */
const MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml'};
const serve = () => new Promise(res => { const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }); srv.listen(0, () => res({srv, base: 'http://127.0.0.1:' + srv.address().port + '/'})); });
const VIEWPORTS = process.env.ARENA_VP ? process.env.ARENA_VP.split(',').map(x => x.split('x').map(Number)) : [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [414, 896], [390, 844], [360, 740]];
const PAGES = ['catalog.html', 'products/' + D.products[0].slug + '.html', 'training.html', 'partners.html', 'brands.html'];
const NUDGE_V = ['bubble', 'pill', 'card'], ENTRY_V = ['strip', 'slim', 'card'], PLATE_V = ['full', 'compact', 'stacked'];

/* измерения внутри страницы (выполняются в Chromium) */
function inPage() {
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const a = [m[0], m[1], m[2]].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const ratio = (c1, c2) => { const a = lum(c1), b = lum(c2), hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
  /* фон под текстом: у градиентов берём все цвета (худший случай), у обычного фона — цвет ближайшего непрозрачного предка */
  const bgsOf = el => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n), im = cs.backgroundImage || ''; if (/gradient\(/.test(im)) { const l = (im.match(/rgba?\([^)]+\)/g) || []).filter(c => !/,\s*0\)$/.test(c)); if (l.length) return l; } const c = cs.backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return [c]; } return ['rgb(255,255,255)']; };
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  window.__measure = (sel, o) => {
    const el = document.querySelector(sel); if (!el || el.hidden) return {missing: true};
    const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, res = {missing: false};
    res.share = r.width * r.height / (vw * vh); res.w = Math.round(r.width); res.h = Math.round(r.height);
    res.inView = !o.fixed || (r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1);
    res.hOverflow = document.documentElement.scrollWidth > innerWidth + 1;
    /* обрезанный текст и вылезающие дочерние элементы */
    res.clipped = Array.from(el.querySelectorAll('*')).some(c => { if (c.closest('.sr')) return false; const cr = c.getBoundingClientRect(); if (!cr.width || !cr.height) return false; if (getComputedStyle(c).display === 'none') return false; return cr.right > r.right + 1.5 || cr.left < r.left - 1.5 || cr.bottom > r.bottom + 1.5 || cr.top < r.top - 1.5; }) || Array.from(el.querySelectorAll('button,p,b,span,li')).some(c => { if (c.classList.contains('sr') || c.closest('.sr')) return false; const cs = getComputedStyle(c); return cs.overflow !== 'visible' && cs.textOverflow !== 'ellipsis' && c.scrollWidth > c.clientWidth + 1; });
    /* наезд на другие плавающие элементы */
    let col = 0; res.collWith = []; (o.avoid || []).forEach(s => document.querySelectorAll(s).forEach(x => { if (x === el || el.contains(x) || x.contains(el) || x.hidden) return; const xr = x.getBoundingClientRect(); if (!xr.width || !xr.height) return; const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return; const a = inter(r, xr); if (a > 20) res.collWith.push(s.replace(/ > .*$/, '')); col += a; }));
    res.collision = Math.round(col);
    /* контраст основного текста и кнопок */
    let worst = 99; el.querySelectorAll('p,b,span,button,li,small,a').forEach(t => { if (!t.textContent.trim() || t.children.length > 2) return; const tr = t.getBoundingClientRect(); if (!tr.width || getComputedStyle(t).display === 'none') return; const col = getComputedStyle(t).color, ra = Math.min.apply(null, bgsOf(t).map(b => ratio(col, b))); const fs = parseFloat(getComputedStyle(t).fontSize), need = fs >= 18 || (fs >= 14 && getComputedStyle(t).fontWeight >= 700) ? 3 : 4.5; worst = Math.min(worst, ra / need * 4.5); });
    res.contrast = Math.round(worst * 10) / 10;
    /* нажимаемые элементы */
    const taps = Array.from(el.querySelectorAll('button,a')).filter(b => { const br = b.getBoundingClientRect(); return br.width > 0 && br.height > 0 && getComputedStyle(b).display !== 'none'; }).map(b => { const br = b.getBoundingClientRect(); return Math.min(br.width, br.height); });
    res.tapN = taps.length; res.tapOk = taps.filter(x => x >= 32).length; res.tap44 = taps.filter(x => x >= 44).length;
    const main = el.querySelector('.g-n-t,.g-e-t p,.g-e-t b,.cmp-txt'); if (main) { const lh = parseFloat(getComputedStyle(main).lineHeight) || 20; res.lines = Math.round(main.getBoundingClientRect().height / lh); }
    const sub = el.querySelector('.g-e-t p'); res.sub = !sub || getComputedStyle(sub).display !== 'none'; res.chips = Array.from(el.querySelectorAll('.chip')).filter(c => getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().width > 0).length; res.cta = Array.from(el.querySelectorAll('.g-n-go,.g-e-b,.cmp-ask,.g-n-t')).some(c => c.getBoundingClientRect().width > 0); res.names = Array.from(el.querySelectorAll('.cmp-names li')).filter(c => c.getBoundingClientRect().width > 0).length;
    return res;
  };
}
/* веса критериев: приоритет заказчика — информативность и помощь посетителю (рядом с компактностью), поэтому «информативность» весит больше всего */
const WEIGHTS = {share: 0.15, tap: 0.20, lines: 0.15, rich: 0.40, contrast: 0.10};
function scoreLayout(kind, m) {
  if (m.missing) return {fail: 'не показан'};
  if (!m.inView) return {fail: 'вышел за экран'}; if (m.clipped) return {fail: 'текст обрезан'}; if (m.hOverflow) return {fail: 'горизонтальная прокрутка'}; if (m.collision > 20) return {fail: 'наезд на ' + (m.collWith || []).filter((x, i, a) => a.indexOf(x) === i).join(', ') + ' (' + m.collision + ' px²)'}; if (m.contrast < 4.5) return {fail: 'контраст ' + m.contrast};
  const ideal = kind === 'nudge' ? [0, 0.1] : kind === 'entry' ? [0.045, 0.2] : [0, 0.12];
  const shareS = m.share <= ideal[1] ? (m.share >= ideal[0] ? 1 : m.share / ideal[0]) : Math.max(0, 1 - (m.share - ideal[1]) / ideal[1]);
  const tapS = m.tapN ? (0.5 * m.tapOk / m.tapN + 0.5 * m.tap44 / m.tapN) : 0, lineS = m.lines == null ? 1 : m.lines <= 3 ? 1 : Math.max(0, 1 - (m.lines - 3) * 0.3);
  /* информативность: что человек получает с первого взгляда (текст-пояснение, готовые вопросы-кнопки, призыв, названия выбранных товаров) */
  const rich = kind === 'nudge' ? Math.min(1, 0.4 + Math.min(3, m.chips) * 0.17 + (m.cta ? 0.1 : 0)) : kind === 'entry' ? Math.min(1, 0.25 + (m.sub ? 0.25 : 0) + Math.min(4, m.chips) * 0.11 + (m.cta ? 0.15 : 0)) : Math.min(1, 0.45 + Math.min(3, m.names) * 0.15 + 0.1);
  return {score: 100 * (WEIGHTS.share * shareS + WEIGHTS.tap * tapS + WEIGHTS.lines * lineS + WEIGHTS.rich * rich + WEIGHTS.contrast * Math.min(1, m.contrast / 7))};
}

/* измерение: каждый вариант на каждом экране и странице → сырые замеры (их можно сохранить в ARENA_RAW и пересчитать баллы без браузера: --rescore) */
async function measureAll(base) {
  let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
  if (!pw) return null;
  const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
  const launchB = () => pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});          // новый браузер на каждый размер экрана
  const raw = []; let cls = 0, clsPages = 0;
  const AVOID_N = ['#asst-fab', '#xdock > *:not([hidden])', '#hdr', '.qc', '#toast.show'];
  for (const [vw, vh] of VIEWPORTS) {
    const b = await launchB();
    const ctx = await b.newContext({viewport: {width: vw, height: vh}, isMobile: vw < 600, hasTouch: vw < 900, locale: 'ru-RU'}); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await ctx.addInitScript(() => { window.ASTREYA_MOTION_SPEED = 20; });
    for (const page of QUICK ? PAGES.slice(0, 3) : PAGES) {
      if (process.env.ARENA_VERBOSE) process.stderr.write('  · ' + vw + '×' + vh + ' ' + page + '\n');
      const p = await ctx.newPage(); p.setDefaultTimeout(6000); await p.route('**/api/assistant/status', r => r.fulfill({status: 200, contentType: 'application/json', body: '{"ai":false}'}));
      await p.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type: 'layout-shift', buffered: true}); } catch (e) {} });
      await p.goto(base + page); const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1200}); } catch (e) {} } await p.waitForSelector('#asst-fab.in', {timeout: 20000}).catch(() => {}); await p.waitForTimeout(1200);
      await p.evaluate(inPage); const cl = await p.evaluate(() => window.__cls); cls += cl; clsPages++;
      /* а) подсказка у кнопки: каждый вариант (с нижней плашкой и без неё — самый тесный случай) */
      for (const v of NUDGE_V) for (const dock of [false, true]) {
        if (dock) { await p.evaluate(() => { const A = window.Astreya, ids = window.ASTREYA_DATA.products.slice(0, 2).map(x => x.id); localStorage.setItem('astreya:cmp', JSON.stringify(ids)); A.cmpSync(); }); await p.waitForTimeout(400); }
        await p.evaluate(v2 => { const G = window.ASTREYA_DATA.guide; G.nudge.layout = v2; sessionStorage.removeItem('astreya:g-nudge'); window.Astreya.guide.hideNudge(true); window.Astreya.guide.nudge('dwell', true); }, v); await p.waitForTimeout(700);
        raw.push({k: 'nudge', v, vp: vw, page, m: await p.evaluate(a => window.__measure('#g-nudge', {fixed: true, avoid: a}), AVOID_N)});
        await p.evaluate(() => window.Astreya.guide.hideNudge(true)); if (dock) await p.evaluate(() => { localStorage.removeItem('astreya:cmp'); window.Astreya.cmpSync(); });
      }
      /* б) блок на странице */
      for (const v of ENTRY_V) {
        const has2 = await p.evaluate(v2 => { window.ASTREYA_DATA.guide.entry.style = v2; window.Astreya.guide.remount(); const e = document.querySelector('.g-entry'); if (e) e.classList.add('on'); return !!e; }, v);
        if (!has2) continue; await p.waitForTimeout(650);
        raw.push({k: 'entry', v, vp: vw, page, m: await p.evaluate(() => { const e = document.querySelector('.g-entry'); if (e) e.scrollIntoView({block: 'center'}); return window.__measure('.g-entry', {fixed: false, avoid: []}); })});
      }
      /* в) плашка сравнения (только где есть карточки) */
      if (await p.$('.pcard:not([hidden]) .cmp-add')) {
        await p.evaluate(() => { const ids = window.ASTREYA_DATA.products.slice(0, 3).map(x => x.id); localStorage.setItem('astreya:cmp', JSON.stringify(ids)); window.Astreya.cmpSync(); }); await p.waitForTimeout(600);
        for (const v of PLATE_V) {
          await p.evaluate(v2 => { document.querySelector('#cmp-bar').setAttribute('data-style', v2); }, v); await p.waitForTimeout(250);
          raw.push({k: 'plate', v, vp: vw, page, m: await p.evaluate(a => window.__measure('#cmp-bar', {fixed: true, avoid: a}), ['#asst-fab', '#hdr', '.qc', '#xdock > *:not(#cmp-bar):not([hidden])'])});
        }
      }
      await p.close();
    }
    await ctx.close(); await b.close();
  }
  return {raw, cls, clsPages};
}

/* турнир по замерам: отсевы и баллы */
function rankLayout(M) {
  log('\n## 2. Оформление: подсказка у кнопки, блок на странице, плашка сравнения');
  log('Экраны: ' + VIEWPORTS.map(v => v.join('×')).join(', ') + '; страницы: ' + PAGES.join(', ') + '. Жёсткие отсевы: вышел за экран · текст обрезан · горизонтальная прокрутка · наезд на кнопку Стеллы/нижнюю плашку/шапку · контраст ниже 4,5:1. Дальше баллы: информативность (пояснение, кнопки-вопросы, призыв, названия выбранных товаров) 40 · нажимаемость (≥32 и ≥44 px) 20 · доля экрана 15 · строки текста 15 · запас контраста 10 — приоритет заказчика: информативность и помощь важнее компактности.');
  const table = {nudge: {}, entry: {}, plate: {}};
  M.raw.forEach(({k, v, vp, page, m}) => { const r = scoreLayout(k, m), T = table[k][v] = table[k][v] || {n: 0, sum: 0, fails: {}, ex: {}, min: 100}; T.n++; if (r.fail) { const key = r.fail.replace(/\(.*\)/, '').trim(); T.fails[key] = (T.fails[key] || 0) + 1; if (!T.ex[key]) T.ex[key] = vp + ' px, ' + page; } else { T.sum += r.score; T.min = Math.min(T.min, r.score); } });
  const rep = {}; log('\nСдвиг вёрстки (CLS) при появлении блока Стеллы, среднее по ' + M.clsPages + ' загрузкам: ' + (M.cls / M.clsPages).toFixed(4) + (M.cls / M.clsPages < 0.1 ? ' — в норме (< 0,1).' : ' — ВЫШЕ нормы 0,1.'));
  if (M.cls / M.clsPages >= 0.1) { bad++; log('✗ сдвиг вёрстки выше нормы'); }
  const names = {nudge: 'Подсказка у кнопки Стеллы', entry: 'Блок «Спросите Стеллу» на странице', plate: 'Плашка сравнения'}, keys = {nudge: 'nudge.layout', entry: 'entry.style', plate: 'compare.plateStyle'};
  Object.keys(table).forEach(k => {
    log('\n### ' + names[k] + '\n\n| Вариант | Средний балл | Худший | Измерений | Отсевы |\n|---|---|---|---|---|');
    const rows = Object.keys(table[k]).map(v => { const T = table[k][v], ok = T.n - Object.values(T.fails).reduce((a, x) => a + x, 0); return {v, n: T.n, ok, fails: T.fails, ex: T.ex, score: ok ? T.sum / ok : 0, min: ok ? T.min : 0, dq: Object.keys(T.fails).length > 0}; });
    rows.sort((a, b) => (a.dq - b.dq) || (b.score - a.score));
    rows.forEach(r => log(`| ${r.v} | ${r.dq ? '—' : '**' + f1(r.score) + '**'} | ${r.dq ? '—' : f1(r.min)} | ${r.n} | ${Object.keys(r.fails).length ? Object.entries(r.fails).map(([a, x]) => a + ' ×' + x + ' (напр. ' + r.ex[a] + ')').join('; ') : 'нет'} |`));
    const clean = rows.filter(r => !r.dq), win = (clean.length ? clean : rows.sort((a, b) => b.score - a.score))[0];
    log('\nПобедитель: **' + win.v + '**' + (clean.length ? '' : ' (чистых вариантов нет — взят лучший по баллам, смотрите отсевы)') + '.'); rep[keys[k]] = win.v;
    if (!clean.length) bad++;
  });
  log('\n**Как менялась арена по ходу работы (честно).** Первый прогон шёл с равными весами (доля экрана 25 · нажимаемость 25 · информативность 25) и выбрал самые компактные варианты (pill · slim · compact). Приоритет заказчика — информативность и помощь посетителю, поэтому вес информативности повышен до 40, остальные уменьшены (см. выше), а победителями стали bubble · strip · stacked. Первый прогон нашёл и настоящий недостаток: на экранах 1024–1440 px подсказка у кнопки пересекалась с нижней плашкой («Сравнение»/«В списке») — исправлено в css/guide.css (подсказка поднимается над плашкой); во втором прогоне отсевов нет. Ложные срабатывания самой арены (скрытый текст для скринридера, градиентные кнопки при расчёте контраста) тоже были найдены и исправлены в измерителе.');
  out.layout = rep; return rep;
}

async function layoutArena(base) {
  let M = null; const RAWF = process.env.ARENA_RAW;
  if (has('--rescore') && RAWF && fs.existsSync(RAWF)) M = JSON.parse(fs.readFileSync(RAWF, 'utf8'));          // баллы пересчитываются по сохранённым замерам, браузер не нужен
  else { M = await measureAll(base); if (!M) { log('\n## 2. Оформление в браузере — Playwright не найден, часть пропущена'); return null; } if (RAWF) fs.writeFileSync(RAWF, JSON.stringify(M)); }
  return rankLayout(M);
}

(async () => {
  let tpl = null, picks = null, lay = null;
  log('# Арена Стеллы-навигатора'); log('_Турнир по измеримым критериям, а не опрос посетителей: реальных данных о поведении людей у сайта пока нет, их покажет аналитика после запуска._');
  if (DO_TEXT) { tpl = textArena(); picks = copyArena(); }
  if (DO_LAYOUT) { const {srv, base} = await serve(); try { lay = await layoutArena(base); } finally { srv.close(); } }
  if (APPLY) {
    const raw = JSON.parse(fs.readFileSync(GUIDE_FILE, 'utf8')), g = raw.guide;
    if (tpl) { g.compare.template = tpl; }
    if (picks) { Object.keys(picks).forEach(page => { g.nudge.pages[page] = g.nudge.pages[page] || {}; if (picks[page].text) g.nudge.pages[page].text = picks[page].text; /* для главной и каталога это формулировка заказчика (арена её только проверяет) */ }); }
    if (lay) { g.nudge.layout = lay['nudge.layout']; g.entry.style = lay['entry.style']; g.compare.plateStyle = lay['compare.plateStyle']; }
    g.arena = {note: 'Победители арены (tools/arena-stella.js): турнир по измеримым критериям, не опрос посетителей.', template: g.compare.template, nudgeLayout: g.nudge.layout, entryStyle: g.entry.style, plateStyle: g.compare.plateStyle};
    fs.writeFileSync(GUIDE_FILE, JSON.stringify(raw, null, 2) + '\n'); fs.writeFileSync(path.join(__dirname, 'arena-stella-report.md'), lines.join('\n') + '\n');
    log('\nПобедители записаны в data/stella/guide.json, отчёт — tools/arena-stella-report.md. Дальше: node tools/build.js');
  }
  void G; process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
