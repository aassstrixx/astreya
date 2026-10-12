/* ИИ-режим на НАСТОЯЩЕМ пакете @anthropic-ai/sdk: вместо api.anthropic.com — локальная имитация протокола Messages API (потоковые события SSE, tool_use,
   коды ошибок). Проверяется то, что поддельный клиент в assistant.test.js проверить не может: что код действительно умеет разговаривать с SDK —
   формат запроса (модель, системные блоки с cache_control, инструменты, заголовки), разбор потока, цикл «модель → инструмент → результат → ответ»,
   обработка ошибок авторизации/модели, остановка запроса при обрыве. Сети и ключа не нужно. Нет пакета (необязательная зависимость) — тесты пропускаются. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('http');
const {boot, client} = require('./helpers');

let hasSdk = true; try { require.resolve('@anthropic-ai/sdk'); } catch (e) { hasSdk = false; }
const T = {skip: hasSdk ? false : 'пакет @anthropic-ai/sdk не установлен (npm install в корне)'};

let S, A, mock, mockPort; const reqs = []; let rounds = [], roundN = 0, mode = 'ok', closedEarly = 0;
const MODEL = 'mock-model-id';
const sse = (res, ev, data) => res.write('event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n');
/* раунд = {text: [куски], tool: {name, input}, gap: мс между кусками} → поток событий в формате Anthropic Messages */
function reply(res, r) {
  res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'});
  sse(res, 'message_start', {type: 'message_start', message: {id: 'msg_mock', type: 'message', role: 'assistant', content: [], model: MODEL, stop_reason: null, stop_sequence: null, usage: {input_tokens: 25, output_tokens: 1}}});
  let idx = 0;
  if (r.text && r.text.length) {
    sse(res, 'content_block_start', {type: 'content_block_start', index: idx, content_block: {type: 'text', text: ''}});
    const go = async () => { for (const t of r.text) { sse(res, 'content_block_delta', {type: 'content_block_delta', index: idx, delta: {type: 'text_delta', text: t}}); if (r.gap) await new Promise(x => setTimeout(x, r.gap)); } };
    return go().then(() => { sse(res, 'content_block_stop', {type: 'content_block_stop', index: idx}); idx++; tail(res, r, idx); });
  }
  tail(res, r, idx);
}
function tail(res, r, idx) {
  if (r.tool) {
    const json = JSON.stringify(r.tool.input), mid = Math.ceil(json.length / 2);
    sse(res, 'content_block_start', {type: 'content_block_start', index: idx, content_block: {type: 'tool_use', id: 'toolu_mock_' + roundN, name: r.tool.name, input: {}}});
    sse(res, 'content_block_delta', {type: 'content_block_delta', index: idx, delta: {type: 'input_json_delta', partial_json: json.slice(0, mid)}});
    sse(res, 'content_block_delta', {type: 'content_block_delta', index: idx, delta: {type: 'input_json_delta', partial_json: json.slice(mid)}});
    sse(res, 'content_block_stop', {type: 'content_block_stop', index: idx});
  }
  sse(res, 'message_delta', {type: 'message_delta', delta: {stop_reason: r.tool ? 'tool_use' : 'end_turn', stop_sequence: null}, usage: {output_tokens: 12}});
  sse(res, 'message_stop', {type: 'message_stop'}); res.end();
}
const err = (res, status, type, message) => { res.writeHead(status, {'Content-Type': 'application/json', 'retry-after-ms': '5'}); res.end(JSON.stringify({type: 'error', error: {type, message}})); };

test.before(async () => {
  if (!hasSdk) return;
  mock = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('close', () => { if (!res.writableEnded) closedEarly++; });
    req.on('end', () => {
      if (req.method !== 'POST' || !/^\/v1\/messages/.test(req.url)) { res.writeHead(404); res.end('{}'); return; }
      const j = JSON.parse(body || '{}'); reqs.push({headers: req.headers, body: j});
      if (mode === 'auth') return err(res, 401, 'authentication_error', 'invalid x-api-key');
      if (mode === 'model') return err(res, 404, 'not_found_error', 'model: ' + j.model);
      if (mode === 'rate') return err(res, 429, 'rate_limit_error', 'rate limited');
      const r = rounds[Math.min(roundN++, rounds.length - 1)]; reply(res, r);
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r)); mockPort = mock.address().port;
  Object.assign(process.env, {ANTHROPIC_API_KEY: 'sk-ant-mock-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + mockPort, ASSISTANT_MODEL: MODEL, ASSISTANT_RATE: '50'});
  S = await boot({}); A = require('../lib/assistant'); A.setClientFactory(null);          // настоящий SDK, не подмена
  const admin = await S.admin(); const st = (await admin.get('/api/settings')).json; st.allowedOrigins = ['https://astreya.example']; assert.equal((await admin.put('/api/settings', st)).status, 200);
});
test.after(async () => { if (!hasSdk) return; A.setClientFactory(null); delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_BASE_URL; delete process.env.ASSISTANT_MODEL; delete process.env.ASSISTANT_RATE; await S.close(); await new Promise(r => mock.close(r)); });
const set = (rs, m) => { rounds = rs; roundN = 0; mode = m || 'ok'; reqs.length = 0; A.resetLimits(); };
const ipN = {n: 40}; const anon = () => client(S.port, '10.9.' + (ipN.n >> 8) + '.' + (ipN.n++ & 255));
const ask = (c, messages) => c.raw('POST', '/api/assistant', {messages}, {Origin: 'https://astreya.example'});
const parse = text => { const out = {text: '', steps: [], resets: 0, done: false, error: null}; for (const m of text.split('\n\n')) { if (!m.startsWith('data: ')) continue; const o = JSON.parse(m.slice(6)); if (o.t) out.text += o.t; if (o.reset) { out.resets++; out.text = ''; } if (o.s) out.steps.push(o.s); if (o.done) out.done = true; if (o.error) out.error = o.error; } return out; };

test('SDK: статус «ИИ готов», обычный ответ приходит потоком, запрос оформлен по протоколу Messages API', T, async () => {
  set([{text: ['Здравствуйте! ', 'Я Стелла. ', 'Чем помочь?'], gap: 5}]);
  const c = anon(); assert.deepEqual((await c.get('/api/assistant/status')).json, {ai: true});
  const r = await ask(c, [{role: 'user', content: 'Привет!'}]); assert.equal(r.status, 200); assert.match(r.headers['content-type'], /text\/event-stream/);
  const p = parse(r.text); assert.equal(p.text, 'Здравствуйте! Я Стелла. Чем помочь?'); assert.equal(p.done, true); assert.equal(p.error, null);
  const q = reqs[0]; assert.equal(q.headers['x-api-key'], 'sk-ant-mock-key'); assert.ok(q.headers['anthropic-version'], 'версия API передана'); assert.match(q.headers['content-type'], /json/);
  assert.equal(q.body.model, MODEL); assert.equal(q.body.stream, true); assert.equal(q.body.max_tokens, 1200);
  assert.ok(Array.isArray(q.body.system) && q.body.system[0].type === 'text' && q.body.system[0].cache_control.type === 'ephemeral' && /Ты — Стелла/.test(q.body.system[0].text), 'системная инструкция — блок с кэшем');
  assert.match(q.body.system[1].text, /^Сегодня \d{4}-\d{2}-\d{2}/); assert.equal(q.body.system[1].cache_control, undefined);
  assert.deepEqual(q.body.tools.map(t => t.name), ['search_products', 'get_product', 'get_brand', 'compare_products', 'list_events', 'discount_for_amount', 'get_contacts', 'search_info']);
  assert.ok(q.body.tools.every(t => t.input_schema.type === 'object' && t.description), 'инструменты со схемами'); assert.equal(q.body.tools[q.body.tools.length - 1].cache_control.type, 'ephemeral');
  assert.deepEqual(q.body.messages, [{role: 'user', content: 'Привет!'}]);
});

test('SDK: цикл с инструментом — модель просит search_products, сервер выполняет по данным сайта, результат уходит обратно, итоговый ответ приходит потоком', T, async () => {
  set([{text: ['Сейчас проверю… '], tool: {name: 'search_products', input: {task: 'pigment', limit: 2}}}, {text: ['По каталогу есть ', '**Discrom Control**.\n', '[[product:nr-serum]]\n[[event:нет-такого]]']}]);
  const r = await ask(anon(), [{role: 'user', content: 'Что от пигментации?'}]); const p = parse(r.text);
  assert.equal(r.status, 200); assert.deepEqual(p.steps, ['search_products']); assert.equal(p.resets, 1, 'черновик перед инструментом сброшен'); assert.match(p.text, /^По каталогу есть \*\*Discrom Control\*\*\./); assert.match(p.text, /\[\[product:nr-serum\]\]/); assert.equal(p.done, true);
  assert.equal(reqs.length, 2, 'два обращения к модели'); const m = reqs[1].body.messages; assert.deepEqual(m.map(x => x.role), ['user', 'assistant', 'user']);
  const tu = m[1].content.find(b => b.type === 'tool_use'); assert.equal(tu.name, 'search_products'); assert.deepEqual(tu.input, {task: 'pigment', limit: 2}, 'вход инструмента собран из фрагментов потока');
  const tr = m[2].content[0]; assert.equal(tr.type, 'tool_result'); assert.equal(tr.tool_use_id, tu.id); assert.match(tr.content, /nr-serum/, 'в результате — реальные данные каталога'); assert.ok(m[1].content.some(b => b.type === 'text'), 'вместе с вызовом вернулся и текст модели');
});

test('SDK: проверка подключения (selfTest) — успех и разбор ошибок настоящего SDK (401 / 404 / 429)', T, async () => {
  set([{text: ['готово']}]); let r = await A.selfTest(); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.sample, 'готово'); assert.equal(r.model, MODEL); assert.equal(reqs[0].body.max_tokens, 40);
  set([], 'auth'); r = await A.selfTest(); assert.equal(r.ok, false); assert.equal(r.code, 'auth'); assert.match(r.message, /Ключ API не принят/); assert.ok(!JSON.stringify(r).includes('sk-ant-mock-key'), 'ключ не утекает');
  set([], 'model'); r = await A.selfTest(); assert.equal(r.code, 'model'); assert.match(r.message, /Модель или адрес сервиса не найдены/);
  set([], 'rate'); r = await A.selfTest(); assert.equal(r.code, 'rate'); assert.match(r.message, /Лимит/);
});

test('SDK: ошибка авторизации во время диалога — посетитель получает короткое «ИИ недоступен», подробности не раскрываются', T, async () => {
  set([], 'auth'); const orig = console.error, logged = []; console.error = (...a) => logged.push(a.join(' '));
  try { const r = await ask(anon(), [{role: 'user', content: 'вопрос'}]); const p = parse(r.text); assert.equal(r.status, 200); assert.equal(p.error, 'ai_unavailable'); assert.ok(!/sk-ant|invalid x-api-key|authentication/.test(r.text), 'в ответе браузеру нет подробностей'); }
  finally { console.error = orig; } assert.ok(logged.some(x => /assistant:/.test(x) && !/sk-ant-mock-key/.test(x)), 'в журнале сервера — служебная строка без ключа');
});

test('SDK: обрыв соединения посетителем останавливает запрос к модели', T, async () => {
  set([{text: Array.from({length: 40}, (_, i) => 'кусок ' + i + ' '), gap: 60}]); closedEarly = 0;
  await new Promise(resolve => {
    const body = JSON.stringify({messages: [{role: 'user', content: 'долгий вопрос'}]});
    const req = http.request({host: '127.0.0.1', port: S.port, method: 'POST', path: '/api/assistant', headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Forwarded-For': '10.8.7.6', Origin: 'https://astreya.example'}}, res => { res.once('data', () => { req.destroy(); setTimeout(resolve, 600); }); });
    req.on('error', () => {}); req.end(body);
  });
  assert.ok(closedEarly >= 1, 'соединение с «сервисом ИИ» закрыто досрочно, генерация остановлена');
});

test('ключ и модель можно задать в админке: сервер использует их, ключ не возвращается в браузер, переменные окружения главнее', T, async () => {
  const saved = {k: process.env.ANTHROPIC_API_KEY, m: process.env.ASSISTANT_MODEL}; delete process.env.ANTHROPIC_API_KEY; delete process.env.ASSISTANT_MODEL;
  const adm = await S.admin();
  try {
    let st = (await adm.get('/api/settings')).json; assert.deepEqual(st.assistant, {provider: 'anthropic', baseUrl: '', apiKey: '', model: '', tools: true}); assert.equal(A.info().ai, false); assert.equal(A.info().reason, 'no_key');
    st.assistant = {provider: 'anthropic', baseUrl: '', apiKey: 'sk-ant-from-admin-123', model: 'admin-model-id', tools: true}; let r = await adm.put('/api/settings', st); assert.equal(r.status, 200);
    assert.equal(r.json.assistant.apiKey, '••••••••', 'в ответе ключ скрыт'); assert.equal(r.json.assistant.model, 'admin-model-id'); assert.ok(!JSON.stringify((await adm.get('/api/settings')).json).includes('sk-ant-from-admin-123'), 'ключ не отдаётся браузеру');
    let i = A.info(); assert.equal(i.ai, true); assert.equal(i.keyFrom, 'settings'); assert.equal(i.modelFrom, 'settings'); assert.ok(!JSON.stringify(i).includes('sk-ant-from-admin-123'));
    set([{text: ['Ответ из настроек админки.']}]); const out = parse((await ask(anon(), [{role: 'user', content: 'привет'}])).text);
    assert.equal(out.text, 'Ответ из настроек админки.'); assert.equal(reqs[0].headers['x-api-key'], 'sk-ant-from-admin-123'); assert.equal(reqs[0].body.model, 'admin-model-id');
    /* повторное сохранение с «замаскированным» ключом не стирает настоящий */
    const again = (await adm.get('/api/settings')).json; again.assistant.model = 'admin-model-2'; r = await adm.put('/api/settings', again); assert.equal(r.status, 200);
    set([{text: ['ок']}]); await ask(anon(), [{role: 'user', content: 'ещё'}]); assert.equal(reqs[0].headers['x-api-key'], 'sk-ant-from-admin-123', 'ключ сохранился'); assert.equal(reqs[0].body.model, 'admin-model-2');
    /* окружение главнее */
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env-456'; process.env.ASSISTANT_MODEL = 'env-model-id'; A.setClientFactory(null);
    set([{text: ['из окружения']}]); await ask(anon(), [{role: 'user', content: 'и ещё'}]); assert.equal(reqs[0].headers['x-api-key'], 'sk-ant-from-env-456'); assert.equal(reqs[0].body.model, 'env-model-id'); assert.equal(A.info().keyFrom, 'env');
    delete process.env.ANTHROPIC_API_KEY; delete process.env.ASSISTANT_MODEL;
    /* проверка значений */
    const bad = (await adm.get('/api/settings')).json; bad.assistant.apiKey = 'ключ с пробелом'; assert.equal((await adm.put('/api/settings', bad)).status, 422); bad.assistant.apiKey = '••••••••'; bad.assistant.model = 'модель!'; assert.equal((await adm.put('/api/settings', bad)).status, 422);
  } finally {
    const clean = (await adm.get('/api/settings')).json; clean.assistant = {provider: 'anthropic', baseUrl: '', apiKey: '', model: '', tools: true}; await adm.put('/api/settings', clean);
    if (saved.k !== undefined) process.env.ANTHROPIC_API_KEY = saved.k; if (saved.m !== undefined) process.env.ASSISTANT_MODEL = saved.m; A.setClientFactory(null);
  }
});
