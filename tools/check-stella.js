#!/usr/bin/env node
/* Проверка библиотеки «живых» реплик Стеллы (data/stella/*.json → KB.stella → js/assistant-brain.js).
   1) Разбор данных: у каждой темы есть правила и ответы, нет пустых и повторяющихся, ссылки ведут на существующие страницы/задачи/категории, нет запрещённого (цены, названия моделей ИИ, «выдуманных» обещаний).
   2) Формулировки: сотни реальных фраз пользователей → ожидаемая тема (и наоборот: вопросы по сайту НЕ перехватываются библиотекой).
   3) Поведение: загадка с ответом, имя, «повтори», дни до праздника, кубик/монетка (с подставным генератором), раскладка клавиатуры, английский, лестница запасных ответов, смена вариантов.
   Дата в проверках зафиксирована (12.10.2026, утро). Запуск: node tools/check-stella.js [-v] [--topic=ID]  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), VERBOSE = process.argv.includes('-v'), ONLY = (process.argv.find(a => a.startsWith('--topic=')) || '').slice(8);
const load = f => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); return JSON.parse(t.slice(t.indexOf('= ') + 2).trim().replace(/;\s*$/, '')); };
const D = load('js/data.js'); let KB; try { KB = load('js/kb.js'); } catch (e) { console.log('Нет js/kb.js — помощник выключен; проверка пропущена.'); process.exit(0); }
if (!KB.stella) { console.log('В js/kb.js нет библиотеки реплик (папка data/stella отсутствует) — проверка пропущена.'); process.exit(0); }
const {createBrain} = require('../js/assistant-brain.js');
const NOW = new Date(2026, 9, 12, 10, 0, 0);
let seq = 0, rnd = null; const brain = o => createBrain(D, KB, Object.assign({now: () => new Date(NOW), rand: () => rnd != null ? rnd : ((seq = (seq * 7 + 3) % 11) / 11)}, o || {}));
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; if (VERBOSE) console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
const short = r => r.text.replace(/\s+/g, ' ').slice(0, 150);
const b0 = brain(), LIB = b0.library, S = KB.stella;

/* ---------- 1. разбор данных ---------- */
console.log('1. Данные библиотеки');
{
  const ids = new Set(), pages = new Set(['catalog.html', 'brands.html', 'training.html', 'news.html', 'partners.html', 'company.html', 'contacts.html', 'privacy.html', 'terms.html', 'search.html', ...((KB.pages || []).map(p => p.u))]);
  const tasks = new Set(D.tasks.map(t => t.id)), cats = new Set(D.cats.map(c => c.id));
  const STAGES = new Set(['early', 'mid', 'pre', 'post', 'en']), GROUPS = new Set(['persona', 'chat', 'fun', 'scope', 'glossary', 'business', 'safety']);
  const ACTS = new Set(['callback', 'partner', 'request', 'ask']), FNS = new Set(['pickval', 'randnum', 'either', 'countdown', 'dayplus', 'nameSet', 'nameGet', 'repeat', 'clarify', 'riddle', 'fact', 'joke', 'social']);
  const PH = new Set(['hello', 'phone', 'hours', 'email', 'company', 'time', 'date', 'weekday', 'nm', ',nm', 'city', 'adv', 'v', 'a', 'b', 'q', 't', 'what', 'days', 'dword', 'n', 'echo', 'h']);
  let nTop = 0, nAns = 0, nRules = 0, bad = [];
  S.topics.forEach(t => {
    nTop++; const w = m => bad.push(t.id + ': ' + m);
    if (!/^[a-z0-9_]+$/i.test(t.id || '')) w('id'); if (ids.has(t.id)) w('повтор id'); ids.add(t.id);
    if (!(t.q && t.q.length) && !(t.rx && t.rx.length)) w('нет правил'); nRules += (t.q || []).length + (t.rx || []).length;
    if (t.stage && !STAGES.has(t.stage)) w('стадия ' + t.stage); if (t.g && !GROUPS.has(t.g)) w('группа ' + t.g);
    if (t.fn && !FNS.has(t.fn)) w('функция ' + t.fn); if (t.fn === 'pickval' && !(t.vals && t.vals.length)) w('нет vals');
    if (!(t.a && t.a.length)) w('нет ответов'); (t.a || []).concat(t.a0 || [], t.b || []).forEach(a => {
      nAns++; if (typeof a !== 'string' || (a.trim().length < 6 && !/\{/.test(a))) w('пустой ответ'); if (a.length > 700) w('слишком длинный ответ (' + a.length + ')');
      (a.match(/\{([^{}]+)\}/g) || []).forEach(p => { if (!PH.has(p.slice(1, -1))) w('неизвестная подстановка ' + p); });
      if (/(?:₽|руб\b|руб\.|рублей|\d\s?%)/i.test(a) && !/скидк|посчита/.test(a)) w('цена/процент в ответе: ' + a.slice(0, 50));
      if (/claude|anthropic|openai|gpt-|sonnet|opus|haiku|gemini|llama/i.test(a)) w('название модели в ответе');
    });
    (t.act || []).forEach(a => { if (!ACTS.has(a)) w('действие ' + a); });
    (t.links || []).forEach(l => { const [f, q] = String(l[0]).split('?'); if (!pages.has(f)) w('нет страницы ' + f); if (q) { const m = /^(task|cat)=(.+)$/.exec(q); if (!m || (m[1] === 'task' ? !tasks.has(m[2]) : !cats.has(m[2]))) w('нет в данных: ' + q); } if (!l[1]) w('ссылка без подписи'); });
    (t.chips || []).forEach(c => { if (c.length > 42) w('длинная кнопка: ' + c); });
    (t.q || []).forEach(q => { if (!/\S/.test(q)) w('пустое правило'); });
    if (t.a && t.a.length > 1 && new Set(t.a).size !== t.a.length) w('одинаковые варианты');
  });
  ok(!bad.length, 'все темы корректны (' + nTop + ' тем, ' + nRules + ' правил, ' + nAns + ' вариантов ответа)', bad.slice(0, 8));
  ok(nTop >= 150, 'тем не меньше 150', nTop); ok(nAns >= 400, 'вариантов ответа не меньше 400', nAns);
  ok((S.riddles || []).length >= 5 && (S.facts || []).length >= 8 && (S.jokes || []).length >= 5, 'загадки, факты и шутки на месте', [(S.riddles || []).length, (S.facts || []).length, (S.jokes || []).length]);
  const L = S.ladder || {}; ok(['question', 'task', 'statement', 'oneword', 'gibberish', 'suggest', 'escalate', 'english', 'ukrainian', 'foreign'].every(k => L[k] && L[k].length >= 2), 'лестница запасных ответов: все ступени и не меньше двух вариантов', Object.keys(L).filter(k => !(L[k] && L[k].length >= 2)));
  ok(Object.keys(L).every(k => L[k].every(x => !/₽|руб/.test(x))), 'в запасных ответах нет цен');
  ok((S.words || []).length >= 60, 'словарь для распознавания раскладки', (S.words || []).length);
}

/* ---------- 2. формулировки → темы ---------- */
console.log('2. Формулировки пользователей → тема');
const CASES = [];
const T = (id, ...ph) => ph.forEach(p => CASES.push([p, id])), NO = (...ph) => ph.forEach(p => CASES.push([p, null]));
require('./stella-cases.js')(T, NO, {D, KB});
let nCase = 0;
for (const [q, want] of CASES) {
  if (ONLY && want !== ONLY) continue; nCase++;
  const b = brain(), st = b.newState(), r = b.reply(q, st, {}); const got = r.intent === 'talk' ? r.topic : null;
  ok(want === null ? got === null || r.intent !== 'talk' : got === want, '«' + q + '» → ' + (want || 'не из библиотеки') + (want === null ? '' : ''), {got: got || r.intent, text: short(r)});
}
console.log('   проверено формулировок: ' + nCase);

/* ---------- 2б. всё, что есть на сайте, библиотека перехватывать не должна ---------- */
console.log('2б. Вопросы по данным сайта не перехватываются библиотекой');
{
  const bad = [], tried = []; const chk = q => { tried.push(q); const b = brain(), r = b.reply(q, b.newState(), {}); if (r.intent === 'talk' && r.topic !== 'sx_planner') bad.push(q + ' → ' + r.topic); };          // sx_planner — честный ответ про страницу «Старт со Стеллой» (она названа именем самой Стеллы), а не светская реплика
  (D.products || []).forEach(p => { chk(p.name); chk('Расскажите про ' + p.name); chk('Сколько стоит ' + p.name + '?'); });
  (D.brands || []).forEach(x => { chk(x.name); chk('Расскажи о бренде ' + x.name); chk('Что есть у ' + x.name + '?'); chk('что такое ' + x.name); });
  (D.tasks || []).forEach(t => { chk(t.label); chk('Что есть для задачи «' + t.label + '»?'); chk('посоветуй от ' + t.label.toLowerCase()); });
  (D.cats || []).forEach(c => { chk(c.name); chk('покажи ' + c.name.toLowerCase()); });
  (D.events || []).forEach(e => { chk(e.title); chk('Расскажи про семинар ' + e.title); chk('как записаться на ' + e.title); });
  ((KB.training && KB.training.faq) || []).forEach(f => chk(f.q));
  (KB.news || []).forEach(n => { chk(n.t); });
  (KB.partner && KB.partner.benefits || []).forEach(x => chk(x.t)); (KB.company && KB.company.advantages || []).forEach(x => chk(x.t));
  (KB.pages || []).forEach(p => { chk(p.t); chk('Покажи страницу ' + p.t); });
  ok(!bad.length, 'ни один из ' + tried.length + ' запросов по товарам, брендам, задачам, категориям, семинарам, FAQ, новостям и разделам сайта не ушёл в «живые реплики»', bad.slice(0, 40));
}


/* ---------- 2в. каждая быстрая кнопка из реплик понимается ---------- */
console.log('2в. Быстрые кнопки из реплик ведут к осмысленному ответу');
{
  const chips = new Set(); S.topics.forEach(t => (t.chips || []).forEach(c => chips.add(c))); Object.values(S.chips || {}).forEach(a => a.forEach(c => chips.add(c))); ['Подсказку', 'Сдаюсь', 'Ещё', 'Ещё раз', 'Ещё шутку', 'Ещё факт'].forEach(c => chips.delete(c));
  const bad = []; chips.forEach(c => { const b = brain(), st = b.newState(); st.lastTopic = ''; const r = b.reply(c, st, {}); if (r.intent === 'unknown' || (r.intent === 'talk' && /^(?:symbols)$/.test(r.topic || ''))) bad.push(c + ' → ' + r.intent); });
  ok(!bad.length, 'все ' + chips.size + ' быстрых кнопок приводят к ответу, а не к «не поняла»', bad);
}

/* ---------- 2г. без библиотеки помощник работает как прежде ---------- */
console.log('2г. Без библиотеки реплик');
{
  const KB2 = Object.assign({}, KB); delete KB2.stella; const b = createBrain(D, KB2, {now: () => new Date(NOW)}), st = b.newState(); let r = b.reply('Привет', st, {});
  ok(r.intent === 'greet' && b.library === null, 'приветствие и остальное работают, библиотека выключена (b.library = null)', [r.intent]);
  r = b.reply('метафизика бытия и сознания', st, {}); ok(r.intent === 'unknown' && /без ИИ/.test(r.text) && r.sure === false, 'непонятное — прежний честный отказ', short(r));
  r = b.reply('ghbdtn', st, {}); ok(r.intent === 'unknown', 'раскладка и английский без библиотеки не включаются', r.intent);
  r = b.reply('Какие у вас контакты?', st, {}); ok(r.intent === 'contacts', 'вопросы по сайту — как раньше', r.intent);
}

/* ---------- 3. поведение ---------- */
require('./stella-flows.js')({brain, ok, short, D, KB, NOW, setRand: v => { rnd = v; }, LIB});

console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
