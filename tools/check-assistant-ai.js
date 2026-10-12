#!/usr/bin/env node
/* Проверка ИИ-режима помощника в браузере: настоящий сервер из server/ запускается внутри процесса, вместо Anthropic API — поддельный клиент со сценарием
   (сеть и ключ не нужны). Проверяется весь путь: чат → /api/assistant (поток) → инструменты → статусы шагов → печать ответа → карточки и кнопки из маркеров,
   отбраковка чужих идентификаторов, возврат к встроенному режиму при сбое/лимите/отключении, остановка на полуслове. Нужны Playwright и Chromium.
   Запуск: node tools/check-assistant-ai.js  (после node tools/build.js). Код возврата ≠ 0, если что-то не так. */
'use strict';
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log('Playwright не найден — проверка пропущена.'); process.exit(0); }
const fs = require('fs'), path = require('path');
const CHROME = process.env.CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const H = require('../server/test/helpers');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const redesign = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/redesign.json'), 'utf8')).extras || {};
  if (!redesign.enabled || !redesign.assistant) { console.log('Помощник выключен в data/redesign.json — проверка пропущена.'); process.exit(0); }
  process.env.ASSISTANT_MODEL = 'fake-model'; delete process.env.ANTHROPIC_API_KEY;
  const S = await H.boot({}); const A = require('../server/lib/assistant');
  const calls = []; let script = [], round = 0; const set = r => { script = r; round = 0; };
  A.setClientFactory(() => ({messages: {stream(params) {
    calls.push(JSON.parse(JSON.stringify(params))); const h = {}, r = script[Math.min(round++, script.length - 1)];
    return {on(ev, cb) { h[ev] = cb; return this; }, abort() {}, async finalMessage() {
      if (r.delay) await wait(r.delay);
      for (const c of r.chunks || []) { h.text && h.text(c); if (r.gap) await wait(r.gap); }
      if (r.fail) throw new Error('boom');
      const content = []; if ((r.chunks || []).length) content.push({type: 'text', text: r.chunks.join('')}); (r.tools || []).forEach((t, i) => content.push({type: 'tool_use', id: 'tu' + round + i, name: t.name, input: t.input}));
      return {content, stop_reason: (r.tools || []).length ? 'tool_use' : 'end_turn'};
    }};
  }}}));
  const b = await pw.chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const ctx = await b.newContext({viewport: {width: 1440, height: 900}}); await ctx.route(/^https:\/\/fonts\./, r => r.abort()); await ctx.addInitScript(() => { window.ASTREYA_MOTION_SPEED = 6; });          // паузы и печать ускорены в 6 раз (кроме проверок ритма — они возвращают 1)
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.|status of (429|503)/.test(m.text())) errs.push(m.text()); });
  const base = 'http://127.0.0.1:' + S.port + '/';
  const skipSplash = async () => { const s = await p.$('#sp-in'); if (s) { try { await s.click({timeout: 1500}); } catch (e) {} } await wait(900); };
  const idle = () => p.waitForFunction(() => !document.getElementById('asst-form').classList.contains('busy'), null, {timeout: 20000});
  const ask = async q => { await p.fill('#asst-in', q); await p.keyboard.press('Enter'); await idle(); await wait(150); };
  const tickOf = () => p.evaluate(() => { const us = [...document.querySelectorAll('#asst-log .asst-u')], u = us[us.length - 1]; return u && u.querySelector('.asst-ck') ? u.querySelector('.asst-ck').getAttribute('data-s') : ''; });
  const lastRow = sel => p.$eval('#asst-log .asst-m:nth-last-child(2)', (e, s) => s ? [...e.querySelectorAll(s)].map(x => x.textContent.trim()) : e.textContent, sel);

  console.log('\n[ИИ-режим в браузере]');
  await p.goto(base + 'catalog.html'); await skipSplash(); await p.evaluate(() => { sessionStorage.clear(); }); await p.reload(); await skipSplash();
  await p.click('#asst-fab'); await wait(900); await idle(); await wait(200);
  ok(/ИИ/.test(await p.$eval('#asst-mode', e => e.textContent)) && /ИИ/.test(await p.$eval('#asst-note', e => e.textContent)), 'сервер сообщил о готовности — в шапке и подписи указано, что отвечает ИИ');
  ok(/Стелла/.test(await p.$eval('.asst-h', e => e.textContent)) && /любые вопросы/.test(await lastRow()), 'Стелла в первом сообщении говорит, что отвечает не только про сайт (ИИ включён)');
  const evId = await p.evaluate(() => ASTREYA_DATA.events[0].id);

  /* 1. вопрос, требующий поиска: инструмент → статус → ответ → карточки */
  set([{chunks: ['Сейчас проверю…'], tools: [{name: 'search_products', input: {task: 'pigment', limit: 3}}]},
       {chunks: ['Для работы с пятнами по данным каталога есть ', '**Discrom Control** и Acidcure — ', 'это ориентир, а не назначение.\n', '[[product:nr-serum]]\n[[product:dt-acidcure]]\n[[product:нет-такого]]\n[[event:' + evId + ']]\n[[event:нет-такого]]\n[[form:product:nr-serum]]\n[[link:catalog.html?task=pigment]]\n[[link:evil.js]]\n[[form:hack:1]]'], gap: 250, delay: 900}]);
  await p.fill('#asst-in', 'Что у вас есть от пятен на лице и чем они хороши?'); await p.keyboard.press('Enter');
  const seen = new Set(); for (let i = 0; i < 60; i++) { await wait(100); const t = await p.$eval('#asst-log .asst-status', e => e.textContent).catch(() => null); if (t) seen.add(t); if (await p.$('#asst-log .asst-caret')) break; }
  ok([...seen].some(t => /Ищу в каталоге/.test(t)), 'пока модель работает, в чате виден шаг «Ищу в каталоге…»', [...seen]);
  await idle(); await wait(200);
  const r1 = await p.evaluate(() => { const row = document.querySelector('#asst-log .asst-m:nth-last-child(2)'); return {text: row.querySelector('.asst-tx').textContent, bold: !!row.querySelector('.asst-tx b'), cards: [...row.querySelectorAll('.asst-card [data-rl-id]')].map(e => e.dataset.rlId), evs: row.querySelectorAll('.asst-ev').length, acts: [...row.querySelectorAll('.asst-acts > *')].map(e => e.textContent.trim()), raw: /\[\[/.test(document.getElementById('asst-log').textContent), fb: row.querySelectorAll('.asst-fb button').length}; });
  ok(/Discrom Control/.test(r1.text) && !/Сейчас проверю/.test(r1.text) && r1.bold && !r1.raw, 'виден только итоговый ответ (черновик «Сейчас проверю…» сброшен), без служебных маркеров', r1);
  ok(r1.cards.join() === 'nr-serum,dt-acidcure' && r1.evs === 1 && r1.acts.includes('Запросить информацию') && r1.acts.some(t => /Каталог|Все продукты|Пигмент/i.test(t)) && !r1.acts.some(t => /hack|evil/i.test(t)), 'маркеры стали карточками, мероприятием и кнопками; чужой товар, мероприятие, страница и тип формы отброшены', r1);
  ok(r1.fb === 2 && calls.length === 2, 'под ответом оценка; было два обращения к модели (поиск и ответ)', [r1.fb, calls.length]);
  const tr = calls[1].messages[calls[1].messages.length - 1].content[0]; ok(tr.type === 'tool_result' && /nr-serum/.test(tr.content), 'модель получила реальные данные каталога от инструмента');
  ok(/Что у вас есть от пятен/.test(calls[0].messages[calls[0].messages.length - 1].content), 'в запрос ушёл вопрос посетителя');

  /* 2. продолжение диалога без модели: «ещё» помнит карточки ИИ; контакты — мгновенно, без ИИ */
  const n = calls.length; await ask('Ещё'); ok(calls.length === n && /Это всё|Ещё/.test(await lastRow()), '«Ещё» после ответа ИИ обрабатывается на месте (карточки запомнены), модель не вызывается');
  await ask('Какие у вас контакты?'); ok(calls.length === n && /925-51-62/.test(await lastRow()), 'контакты отвечаются мгновенно и без затрат на ИИ');
  await ask('Подробнее про первый'); ok(calls.length === n && /Discrom Control/.test(await lastRow()), '«Подробнее про первый» ведёт на товар из ответа ИИ');

  /* 2b. вопрос на любую тему и «человеческий» ритм: прочитано → раздумье → печать */
  set([{chunks: ['Небо голубое из-за **рассеяния** света: ', 'короткие волны рассеиваются сильнее.\n\n```js\nconst sky = "blue";\n```']}]); const nq = calls.length; await p.evaluate(() => { window.ASTREYA_MOTION_SPEED = 1; }); const tq = Date.now();
  await p.fill('#asst-in', 'Объясни, почему небо голубое'); await p.keyboard.press('Enter');
  await p.waitForSelector('#asst-log .asst-typing', {timeout: 4000}); const ticks1 = await tickOf();
  await p.waitForSelector('#asst-log .asst-caret', {timeout: 10000}); const thinkMs = Date.now() - tq; await p.evaluate(() => { window.ASTREYA_MOTION_SPEED = 6; }); await idle(); await wait(200);
  const ro = await p.evaluate(() => { const row = document.querySelector('#asst-log .asst-m:nth-last-child(2)'); return {text: row.querySelector('.asst-tx').textContent, pre: row.querySelectorAll('pre.asst-code code').length, b: !!row.querySelector('.asst-tx b'), mood: row.querySelector('.pe').getAttribute('data-m')}; });
  ok(calls.length === nq + 1 && /рассеяния/.test(ro.text) && !/\[\[/.test(ro.text), 'вопрос не про сайт уходит к ИИ и получает ответ по существу', [calls.length - nq, ro.text.slice(0, 60)]);
  ok(/Стелла/.test(calls[calls.length - 1].system[0].text) && /ЛЮБУЮ тему/.test(calls[calls.length - 1].system[0].text), 'в инструкции модели — личность Стеллы и разрешение отвечать на любые темы');
  ok(ro.pre === 1 && ro.b, 'блок кода и **жирный** в ответе оформляются', ro);
  const tick2 = await tickOf(); ok(ticks1 === '1' || ticks1 === '2', 'сообщение посетителя помечено галочкой уже во время раздумья', ticks1); ok(tick2 === '2', 'после ответа у вопроса две галочки («прочитано»)', tick2);
  ok(thinkMs >= 2200, 'Стелла не отвечает мгновенно: «прочитала» → «думает» → печатает; первые слова не раньше ~2,5 с после вопроса (' + thinkMs + ' мс)', thinkMs);
  ok(ro.mood === 'idle', 'после ответа Стелла спокойна (настроение idle)', ro.mood);
  const nsm = calls.length; set([{chunks: ['Спасибо, всё хорошо!']}]); await ask('Как дела?'); ok(calls.length === nsm + 1 && /всё хорошо/.test(await lastRow()), 'светская беседа («как дела?») при включённом ИИ отвечает модель');
  { const n1 = calls.length; await ask('ок'); ok(calls.length === n1 && /Хорошо|Отлично|Принято|Поняла/.test(await lastRow()), 'служебное «ок» при включённом ИИ отвечается сразу, без обращения к модели');
    await ask('я не хочу жить'); ok(calls.length === n1 && /112/.test(await lastRow()), 'тяжёлая тема при включённом ИИ — всегда мгновенный безопасный ответ (112), без обращения к модели');
    await ask('брось кубик'); ok(calls.length === n1 && /Кубик|Бросаю|Ну что ж|Тук/.test(await lastRow()), 'игра («брось кубик») — на месте, без затрат на ИИ');
    set([{chunks: ['Я Стелла, рада знакомству.']}]); await ask('расскажи о себе'); ok(calls.length === n1 + 1 && /рада знакомству/.test(await lastRow()), 'вопрос о самой Стелле при включённом ИИ уходит модели (библиотека реплик остаётся запасным ответом)'); }
  /* «Стоп» во время раздумья: ничего не отвечено, чат свободен, вопрос остаётся */
  set([{delay: 4000, chunks: ['Ответ, который не должен появиться']}]); const nU = await p.$$eval('#asst-log .asst-u', e => e.length);
  await p.fill('#asst-in', 'Расскажи длинную историю про космос'); await p.keyboard.press('Enter'); await p.waitForSelector('#asst-log .asst-typing'); await wait(700); await p.click('#asst-send'); await idle(); await wait(200);
  ok(await p.$('#asst-log .asst-typing') === null && await p.$$eval('#asst-log .asst-u', e => e.length) === nU + 1 && !/не должен появиться/.test(await p.$eval('#asst-log', e => e.textContent)), '«Стоп» во время раздумья: индикатор убран, ответа нет, вопрос остался в ленте');

  /* 3. сбой модели → встроенный режим с пояснением */
  set([{fail: true}]); await ask('Сравни свои препараты по эффективности'); const rf = await lastRow();
  ok(/ИИ-режим сейчас недоступен/.test(rf) && rf.length > 60, 'сбой модели: честная пометка и ответ встроенным режимом', rf.slice(0, 120));
  ok(await p.$('#asst-log .asst-typing') === null && await p.$eval('#asst-send', e => !e.classList.contains('stop')), 'после сбоя чат снова готов к вводу');

  /* 4. лимит запросов → пометка «слишком много» */
  process.env.ASSISTANT_RATE = '1'; A.resetLimits(); set([{chunks: ['Первый ответ ИИ.']}]);
  await ask('Расскажи интересный факт про туманности'); await ask('А ещё что-нибудь любопытное про звёзды?'); const rl = await lastRow();
  ok(/слишком много|подождите/i.test(rl), 'лимит исчерпан: «сообщений слишком много — подождите», ответ встроенным режимом', rl.slice(0, 120));
  delete process.env.ASSISTANT_RATE; A.resetLimits();

  /* 5. остановка на полуслове */
  set([{chunks: ['Начало длинного ответа, ', 'который мы остановим', ' и не будем дожидаться конца. ', 'Ещё много текста, ', 'которого посетитель не увидит.'], gap: 2500}]);
  await p.fill('#asst-in', 'Расскажи подробно о философии звёздного неба'); await p.keyboard.press('Enter');
  await p.waitForSelector('#asst-log .asst-caret', {timeout: 8000}); await wait(150); await p.click('#asst-send'); await idle(); await wait(200);
  const rs = await lastRow(); ok(/Начало длинного ответа/.test(rs) && !/посетитель не увидит/.test(rs) && await p.$('#asst-log .asst-caret') === null, '«Стоп» оставляет уже напечатанную часть ответа', rs.slice(0, 100));
  { const n0 = calls.length; set([{chunks: ['Ответ, который не должен появиться.'], gap: 2000, delay: 3000}]);
    await p.fill('#asst-in', 'Расскажи ещё про звёзды'); await p.keyboard.press('Enter'); await wait(80); await p.click('#asst-send'); await idle(); await wait(3600);
    ok(!/не должен появиться/.test(await p.$eval('#asst-log', e => e.textContent)) && await p.$('#asst-log .asst-typing') === null, '«Стоп» сразу после отправки (до обращения к серверу) отменяет ответ — он не появится позже', calls.length - n0); }
  set([{chunks: ['Снова работаю.']}]); await ask('Продолжим разговор про туманности'); const after = await lastRow(); ok(/Снова работаю/.test(after), 'после остановки чат работает дальше', [after.slice(0, 120), calls.length]);

  /* 6. ИИ выключили на сервере → чат узнаёт об этом и возвращается к встроенному режиму */
  process.env.ASSISTANT_MODEL = ''; await ask('Расскажи про созвездия'); ok(!/ИИ/.test(await p.$eval('#asst-mode', e => e.textContent)), 'сервер выключил ИИ — в шапке снова «Отвечаю по данным сайта»');
  ok(errs.length === 0, 'нет ошибок JS и консоли', errs.slice(0, 3));

  /* 6b. вопрос, набранный пока Стелла «печатает» первое приветствие, не теряется: отправится сразу после него */
  process.env.ASSISTANT_MODEL = 'fake-model'; A.resetLimits();
  await p.evaluate(() => { sessionStorage.removeItem('astreya:chat2'); }); await p.reload(); await skipSplash(); await p.click('#asst-fab'); await wait(450);
  await p.fill('#asst-in', 'Какие у вас контакты?'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('#asst-log .asst-u').length === 1 && !document.getElementById('asst-form').classList.contains('busy') && !document.querySelector('.asst-typing'), null, {timeout: 20000}); await wait(200);
  ok(/925-51-62/.test(await lastRow()) && await p.$$eval('#asst-log .asst-b', e => e.length) === 2 && await p.$eval('#asst-in', e => e.value === ''), 'вопрос, набранный во время первого приветствия, отправляется сразу после него и не теряется');

  /* 7. анимации работают всегда — даже если в системе стоит «уменьшить движение»: полный ритм ответа, никаких переключателей */
  { const rc = await b.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'}); await rc.route(/^https:\/\/fonts\./, r => r.abort()); const rp = await rc.newPage(); const rerr = []; rp.on('pageerror', e => rerr.push(e.message));
    await rp.goto(base + 'catalog.html'); const sp = await rp.$('#sp-in'); if (sp) { try { await sp.click({timeout: 1500}); } catch (e) {} } await wait(5000);
    const anim = await rp.$eval('#asst-fab .asst-fab-i', e => getComputedStyle(e).animationName); ok(anim !== 'none', 'при системном «уменьшить движение» кнопка всё равно парит (анимации включены изначально)', anim);
    await rp.click('#asst-fab'); await rp.waitForFunction(() => document.querySelectorAll('#asst-log .asst-b').length === 1 && !document.getElementById('asst-form').classList.contains('busy'), null, {timeout: 14000}); ok(true, 'первое сообщение появилось (с паузой и печатью)');
    ok(await rp.$('.asst-motion') === null && await rp.evaluate(() => !document.body.classList.contains('calm')), 'кнопки «Включить анимации» и «спокойного режима» нет');
    const t0 = Date.now(); await rp.fill('#asst-in', 'Какие у вас контакты?'); await rp.keyboard.press('Enter'); await rp.waitForFunction(() => /925-51-62/.test(document.querySelector('#asst-log .asst-m:nth-last-child(2)').textContent) && !document.getElementById('asst-form').classList.contains('busy'), null, {timeout: 20000}); const ms = Date.now() - t0;
    ok(ms >= 3000 && ms < 16000, 'ответ приходит с полным ритмом «прочитано → думает → печатает» (' + ms + ' мс), а не мгновенно', ms);
    ok(rerr.length === 0, 'без ошибок JS', rerr); await rc.close(); }
  await b.close(); await S.close();
  console.log(`\nИтого: ✓ ${pass}  ✗ ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
