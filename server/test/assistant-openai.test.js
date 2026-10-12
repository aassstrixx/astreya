/* ИИ-режим с ЛЮБЫМ OpenAI-совместимым сервисом (OpenAI, OpenRouter, Gemini, Groq, DeepSeek, Mistral, Ollama…): вместо настоящего сервиса — локальная имитация
   протокола Chat Completions (потоковые события SSE, вызовы инструментов, коды ошибок, особенности вроде max_tokens / max_completion_tokens и «модель без инструментов»).
   Проверяется весь путь: настройки → клиент → цикл с инструментами → поток в браузер; проверка подключения; локальные модели без ключа; ключ из админки. Сети и ключей не нужно. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('http');
const {boot, client} = require('./helpers');

let S, A, mock, mockPort; const reqs = []; let rounds = [], roundN = 0, mode = 'ok';
const MODEL = 'any-model-id';
const chunk = (res, o) => res.write('data: ' + JSON.stringify(o) + '\n\n');
function reply(res, r) {
  res.writeHead(200, {'Content-Type': 'text/event-stream'});
  chunk(res, {choices: [{index: 0, delta: {role: 'assistant', content: ''}, finish_reason: null}]});
  for (const t of r.text || []) chunk(res, {choices: [{index: 0, delta: {content: t}, finish_reason: null}]});
  if (r.tool) {
    const json = JSON.stringify(r.tool.input), mid = Math.ceil(json.length / 2);
    chunk(res, {choices: [{index: 0, delta: {tool_calls: [{index: 0, id: 'call_mock_' + roundN, type: 'function', function: {name: r.tool.name, arguments: ''}}]}, finish_reason: null}]});
    chunk(res, {choices: [{index: 0, delta: {tool_calls: [{index: 0, function: {arguments: json.slice(0, mid)}}]}, finish_reason: null}]});
    chunk(res, {choices: [{index: 0, delta: {tool_calls: [{index: 0, function: {arguments: json.slice(mid)}}]}, finish_reason: null}]});
  }
  chunk(res, {choices: [{index: 0, delta: {}, finish_reason: r.tool ? 'tool_calls' : 'stop'}]}); res.write('data: [DONE]\n\n'); res.end();
}
const err = (res, status, message, type) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: {message, type: type || 'invalid_request_error'}})); };

test.before(async () => {
  mock = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      if (req.method !== 'POST' || !/\/chat\/completions$/.test(req.url)) { res.writeHead(404); res.end('{}'); return; }
      const j = JSON.parse(body || '{}'); reqs.push({headers: req.headers, body: j, url: req.url});
      if (mode === 'auth') return err(res, 401, 'Incorrect API key provided', 'authentication_error');
      if (mode === 'model') return err(res, 404, 'The model `' + j.model + '` does not exist');
      if (mode === 'rate') return err(res, 429, 'Rate limit reached', 'rate_limit_error');
      if (mode === 'maxtok' && 'max_tokens' in j) return err(res, 400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.");
      if (mode === 'notools' && j.tools) return err(res, 400, 'tools is not supported by this model');
      if (mode === 'nostream') { res.writeHead(200, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({choices: [{message: {role: 'assistant', content: 'Ответ целиком, без потока.'}, finish_reason: 'stop'}]})); }
      const r = rounds[Math.min(roundN++, rounds.length - 1)]; reply(res, r);
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r)); mockPort = mock.address().port;
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ASSISTANT_API_KEY; delete process.env.OPENAI_API_KEY;
  Object.assign(process.env, {ASSISTANT_PROVIDER: 'openai', ASSISTANT_BASE_URL: 'https://llm.example.test/v1', ASSISTANT_API_KEY: 'sk-any-key-123', ASSISTANT_MODEL: MODEL, ASSISTANT_RATE: '60'});
  S = await boot({}); A = require('../lib/assistant'); A.setClientFactory(null);
  /* адрес сервиса «подменяем» на локальную имитацию: сам клиент настоящий (server/lib/llm-openai.js) */
  process.env.ASSISTANT_BASE_URL = 'http://127.0.0.1:' + mockPort + '/v1'; process.env.ASSISTANT_API_KEY = 'sk-any-key-123';
  const admin = await S.admin(); const st = (await admin.get('/api/settings')).json; st.allowedOrigins = ['https://astreya.example']; assert.equal((await admin.put('/api/settings', st)).status, 200);
});
test.after(async () => { A.setClientFactory(null); for (const k of ['ASSISTANT_PROVIDER', 'ASSISTANT_BASE_URL', 'ASSISTANT_API_KEY', 'ASSISTANT_MODEL', 'ASSISTANT_RATE', 'ASSISTANT_TOOLS']) delete process.env[k]; await S.close(); await new Promise(r => mock.close(r)); });
const set = (rs, m) => { rounds = rs; roundN = 0; mode = m || 'ok'; reqs.length = 0; A.resetLimits(); };
const ipN = {n: 60}; const anon = () => client(S.port, '10.6.' + (ipN.n >> 8) + '.' + (ipN.n++ & 255));
const ask = (c, messages) => c.raw('POST', '/api/assistant', {messages}, {Origin: 'https://astreya.example'});
const parse = text => { const out = {text: '', steps: [], resets: 0, done: false, error: null}; for (const m of text.split('\n\n')) { if (!m.startsWith('data: ')) continue; const o = JSON.parse(m.slice(6)); if (o.t) out.text += o.t; if (o.reset) { out.resets++; out.text = ''; } if (o.s) out.steps.push(o.s); if (o.done) out.done = true; if (o.error) out.error = o.error; } return out; };

test('любой OpenAI-совместимый сервис: статус «готов», ответ потоком, запрос оформлен как Chat Completions', async () => {
  set([{text: ['Здравствуйте! ', 'Я Стелла.']}]);
  const c = anon(); assert.deepEqual((await c.get('/api/assistant/status')).json, {ai: true});
  const r = await ask(c, [{role: 'user', content: 'Привет!'}]); assert.equal(r.status, 200); const p = parse(r.text);
  assert.equal(p.text, 'Здравствуйте! Я Стелла.'); assert.equal(p.done, true); assert.equal(p.error, null);
  const q = reqs[0]; assert.equal(q.url, '/v1/chat/completions'); assert.equal(q.headers.authorization, 'Bearer sk-any-key-123'); assert.equal(q.body.model, MODEL); assert.equal(q.body.stream, true); assert.equal(q.body.max_tokens, 1200, 'для не-OpenAI адреса — max_tokens');
  assert.equal(q.body.messages[0].role, 'system'); assert.match(q.body.messages[0].content, /Ты — Стелла/); assert.match(q.body.messages[0].content, /СПРАВОЧНИК О САЙТЕ/); assert.deepEqual(q.body.messages.slice(1), [{role: 'user', content: 'Привет!'}]);
  assert.deepEqual(q.body.tools.map(t => t.function.name), ['search_products', 'get_product', 'get_brand', 'list_events', 'discount_for_amount', 'get_contacts', 'search_info']);
  assert.ok(q.body.tools.every(t => t.type === 'function' && t.function.parameters.type === 'object' && t.function.description), 'инструменты в формате function'); assert.ok(!JSON.stringify(q.body).includes('cache_control'), 'служебные поля Anthropic не уходят');
});

test('цикл с инструментом через OpenAI-формат: tool_calls → выполнение по данным сайта → tool-сообщение → итоговый ответ', async () => {
  set([{text: ['Проверяю… '], tool: {name: 'search_products', input: {task: 'pigment', limit: 2}}}, {text: ['По каталогу есть ', '**Discrom Control**.\n', '[[product:nr-serum]]']}]);
  const p = parse((await ask(anon(), [{role: 'user', content: 'Что от пигментации?'}])).text);
  assert.deepEqual(p.steps, ['search_products']); assert.equal(p.resets, 1); assert.match(p.text, /^По каталогу есть \*\*Discrom Control\*\*\./); assert.match(p.text, /\[\[product:nr-serum\]\]/); assert.equal(p.done, true);
  assert.equal(reqs.length, 2); const m = reqs[1].body.messages; assert.deepEqual(m.map(x => x.role), ['system', 'user', 'assistant', 'tool']);
  const as = m[2]; assert.equal(as.tool_calls[0].type, 'function'); assert.equal(as.tool_calls[0].function.name, 'search_products'); assert.deepEqual(JSON.parse(as.tool_calls[0].function.arguments), {task: 'pigment', limit: 2}, 'аргументы собраны из фрагментов потока');
  assert.equal(m[3].tool_call_id, as.tool_calls[0].id); assert.match(m[3].content, /nr-serum/, 'в ответе инструмента — реальные данные каталога');
});

test('проверка подключения и понятные сообщения об ошибках сервиса (401 / 404 / 429)', async () => {
  set([{text: ['готово']}]); let r = await A.selfTest(); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.sample, 'готово'); assert.equal(reqs[0].body.max_tokens, 40);
  set([], 'auth'); r = await A.selfTest(); assert.equal(r.ok, false); assert.equal(r.code, 'auth'); assert.match(r.message, /Ключ API не принят/); assert.ok(!JSON.stringify(r).includes('sk-any-key-123'), 'ключ не утекает');
  set([], 'model'); r = await A.selfTest(); assert.equal(r.code, 'model'); assert.match(r.message, /Модель или адрес сервиса не найдены/);
  set([], 'rate'); r = await A.selfTest(); assert.equal(r.code, 'rate');
});

test('«max_tokens не поддерживается» (новые модели): запрос автоматически повторяется с max_completion_tokens', async () => {
  set([{text: ['Ответ после повтора.']}], 'maxtok');
  const p = parse((await ask(anon(), [{role: 'user', content: 'Привет'}])).text); assert.equal(p.text, 'Ответ после повтора.');
  assert.equal(reqs.length, 2); assert.ok('max_tokens' in reqs[0].body); assert.ok(!('max_tokens' in reqs[1].body) && reqs[1].body.max_completion_tokens === 1200);
});

test('модель без инструментов: сервер сам переходит в режим «без инструментов» (каталог в инструкции) и запоминает это', async () => {
  set([{text: ['Отвечаю без инструментов.']}], 'notools');
  let p = parse((await ask(anon(), [{role: 'user', content: 'Что есть от пигментации?'}])).text); assert.equal(p.text, 'Отвечаю без инструментов.'); assert.equal(p.error, null);
  assert.equal(reqs.length, 2, 'первая попытка с инструментами отклонена, вторая — без них'); assert.ok(reqs[0].body.tools && !reqs[1].body.tools);
  const sys = reqs[1].body.messages[0].content; assert.match(sys, /Инструментов у тебя нет/); assert.match(sys, /КАТАЛОГ \(id \| название/); assert.match(sys, /nr-serum/); assert.match(sys, /РАСПИСАНИЕ/); assert.match(sys, /КОНТАКТЫ/); assert.match(sys, /СКИДКИ ПО ОБЪЁМУ/); assert.ok(!/search_products —/.test(sys), 'в инструкции нет упоминаний инструментов');
  reqs.length = 0; roundN = 0; p = parse((await ask(anon(), [{role: 'user', content: 'А ещё?'}])).text); assert.equal(reqs.length, 1, 'следующий запрос сразу без инструментов'); assert.ok(!reqs[0].body.tools); assert.equal(p.done, true);
});

test('сервис ответил целиком (без потока) — тоже работает', async () => {
  set([], 'nostream'); const p = parse((await ask(anon(), [{role: 'user', content: 'Привет'}])).text); assert.equal(p.text, 'Ответ целиком, без потока.'); assert.equal(p.done, true);
});

test('локальная модель (Ollama и т. п.): адрес на этом компьютере — ключ не нужен и не отправляется', async () => {
  const saved = process.env.ASSISTANT_API_KEY; delete process.env.ASSISTANT_API_KEY; A.setClientFactory(null);
  try { set([{text: ['Локальный ответ.']}]); const c = anon(); assert.deepEqual((await c.get('/api/assistant/status')).json, {ai: true}); const i = A.info(); assert.equal(i.key, true); assert.equal(i.keyFrom, 'not_needed'); assert.equal(i.provider, 'openai');
    const p = parse((await ask(c, [{role: 'user', content: 'Привет'}])).text); assert.equal(p.text, 'Локальный ответ.'); assert.equal(reqs[0].headers.authorization, undefined, 'заголовка авторизации нет'); }
  finally { process.env.ASSISTANT_API_KEY = saved; A.setClientFactory(null); }
  assert.ok(A.isLocalUrl('http://localhost:11434/v1') && A.isLocalUrl('http://192.168.1.5:1234/v1') && A.isLocalUrl('http://host.docker.internal:11434/v1') && !A.isLocalUrl('https://api.openai.com/v1') && !A.isLocalUrl('https://example.com'), 'какие адреса считаются локальными');
});

test('настройки в админке: сервис, адрес, ключ и модель; ключ скрыт; окружение главнее; проверка значений', async () => {
  const keep = {};
  for (const k of ['ASSISTANT_PROVIDER', 'ASSISTANT_BASE_URL', 'ASSISTANT_API_KEY', 'ASSISTANT_MODEL']) { keep[k] = process.env[k]; delete process.env[k]; }
  const adm = await S.admin(); A.setClientFactory(null);
  try {
    let st = (await adm.get('/api/settings')).json; assert.equal(A.info().ai, false);
    st.assistant = {provider: 'openai', baseUrl: 'http://127.0.0.1:' + mockPort + '/v1', apiKey: 'sk-from-admin-777', model: 'admin-model', tools: true}; let r = await adm.put('/api/settings', st); assert.equal(r.status, 200);
    assert.equal(r.json.assistant.apiKey, '••••••••'); assert.equal(r.json.assistant.provider, 'openai'); assert.ok(!JSON.stringify((await adm.get('/api/settings')).json).includes('sk-from-admin-777'), 'ключ не отдаётся браузеру');
    const i = A.info(); assert.equal(i.ai, true); assert.equal(i.provider, 'openai'); assert.equal(i.keyFrom, 'settings'); assert.equal(i.modelFrom, 'settings'); assert.equal(i.baseUrl, 'http://127.0.0.1:' + mockPort + '/v1');
    set([{text: ['Ответ по настройкам админки.']}]); const p = parse((await ask(anon(), [{role: 'user', content: 'привет'}])).text); assert.equal(p.text, 'Ответ по настройкам админки.'); assert.equal(reqs[0].headers.authorization, 'Bearer sk-from-admin-777'); assert.equal(reqs[0].body.model, 'admin-model');
    /* «без инструментов» принудительно */
    const again = (await adm.get('/api/settings')).json; again.assistant.tools = false; assert.equal((await adm.put('/api/settings', again)).status, 200);
    set([{text: ['без инструментов']}]); await ask(anon(), [{role: 'user', content: 'ещё'}]); assert.equal(reqs.length, 1); assert.ok(!reqs[0].body.tools, 'инструменты не отправлялись'); assert.match(reqs[0].body.messages[0].content, /КАТАЛОГ/);
    /* проверка значений */
    const bad = (await adm.get('/api/settings')).json; bad.assistant.provider = 'другое'; assert.equal((await adm.put('/api/settings', bad)).status, 422); bad.assistant.provider = 'openai'; bad.assistant.baseUrl = 'ftp://example.com'; assert.equal((await adm.put('/api/settings', bad)).status, 422); bad.assistant.baseUrl = 'https://пробел в адресе'; assert.equal((await adm.put('/api/settings', bad)).status, 422);
  } finally {
    const clean = (await adm.get('/api/settings')).json; clean.assistant = {provider: 'anthropic', baseUrl: '', apiKey: '', model: '', tools: true}; await adm.put('/api/settings', clean);
    for (const k of Object.keys(keep)) if (keep[k] !== undefined) process.env[k] = keep[k]; A.setClientFactory(null);
  }
});
