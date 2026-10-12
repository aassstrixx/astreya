/* Клиент «любого OpenAI-совместимого сервиса» (Chat Completions): OpenAI, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Gemini (совместимый адрес),
   а также Ollama, LM Studio, vLLM и другие модели на своём сервере. Нужны только адрес сервиса, ключ (для локальных моделей он не нужен) и идентификатор модели.

   Интерфейс такой же, как у SDK Anthropic — client.messages.stream(параметры) → .on('text', …) / .finalMessage() / .abort(), — поэтому остальной код ИИ-режима
   (server/lib/assistant.js: цикл «модель → инструмент → результат → ответ») не знает, какой сервис за ним. Запрос из формата Anthropic (системные блоки, tool_use / tool_result)
   переводится в формат Chat Completions, поток событий SSE — обратно. Зависимостей нет: используется встроенный fetch (Node 18+).

   Особенности, которые учтены: у новых моделей OpenAI параметр длины ответа называется max_completion_tokens, у остальных — max_tokens (при отказе пробуется второй вариант);
   если модель не умеет вызывать инструменты, выбрасывается ошибка с кодом 'tools_unsupported' — вызывающий код переходит в режим без инструментов; часть сервисов не присылает
   index/id у вызовов или отвечает целиком (без потока) — это тоже разобрано. */
'use strict';

const DEFAULT_BASE = 'https://api.openai.com/v1';
const blocksText = (c, sep) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join(sep || '') : '';

/* параметры в формате Anthropic → тело запроса Chat Completions */
function toMessages(params) {
  const out = [], sys = blocksText(params.system, '\n\n'); if (sys) out.push({role: 'system', content: sys});
  for (const m of params.messages || []) {
    if (m.role === 'assistant') {
      const tu = Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'tool_use') : [], msg = {role: 'assistant', content: blocksText(m.content)};
      if (tu.length) msg.tool_calls = tu.map(b => ({id: b.id, type: 'function', function: {name: b.name, arguments: JSON.stringify(b.input || {})}}));
      out.push(msg);
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) if (b && b.type === 'tool_result') out.push({role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content)});
      const t = blocksText(m.content); if (t) out.push({role: 'user', content: t});
    } else out.push({role: 'user', content: String(m.content)});
  }
  return out;
}
const toTools = tools => (tools || []).map(t => ({type: 'function', function: {name: t.name, description: t.description, parameters: t.input_schema || {type: 'object', properties: {}}}}));
const isOpenAIHost = base => { try { return /(^|\.)openai\.com$/i.test(new URL(base).hostname); } catch (e) { return false; } };

/* разбор потока SSE: текст, вызовы инструментов, причина остановки; текст передаётся наружу по мере поступления */
async function readStream(res, onText) {
  const ct = String(res.headers.get('content-type') || '');
  if (/json/i.test(ct) && !/event-stream/i.test(ct)) {                         // сервис проигнорировал stream:true и ответил целиком
    const j = await res.json(), ch = j && j.choices && j.choices[0], m = (ch && ch.message) || {};
    if (j && j.error) { const e = new Error(String(j.error.message || j.error).slice(0, 300)); e.status = 502; throw e; }
    const t = typeof m.content === 'string' ? m.content : ''; if (t) onText(t);
    return {text: t, calls: (m.tool_calls || []).map(c => ({id: c.id || '', name: (c.function || {}).name || '', args: (c.function || {}).arguments || ''})), finish: ch && ch.finish_reason};
  }
  const dec = new TextDecoder(); let buf = '', text = '', finish = null; const calls = [];
  const take = line => {
    if (!line.startsWith('data:')) return; const d = line.slice(5).trim(); if (!d || d === '[DONE]') return; let j; try { j = JSON.parse(d); } catch (e) { return; }
    if (j.error) { const e = new Error(String(j.error.message || j.error).slice(0, 300)); e.status = +j.error.code || 502; throw e; }
    const ch = j.choices && j.choices[0]; if (!ch) return; const dl = ch.delta || ch.message || {};
    if (typeof dl.content === 'string' && dl.content) { text += dl.content; onText(dl.content); }
    for (const tc of dl.tool_calls || []) {
      const k = tc.index != null ? tc.index : (tc.id ? calls.length : Math.max(0, calls.length - 1)), c = calls[k] || (calls[k] = {id: '', name: '', args: ''}), f = tc.function || {};
      if (tc.id) c.id = tc.id; if (f.name) { if (!c.name) c.name = f.name; else if (f.name !== c.name) c.name += f.name; } if (f.arguments) c.args += f.arguments;
    }
    if (ch.finish_reason) finish = ch.finish_reason;
  };
  for await (const chunk of res.body) { buf += dec.decode(chunk, {stream: true}); let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); take(line); } }
  if (buf.trim()) take(buf.trim());
  return {text, calls: calls.filter(Boolean), finish};
}

function create(o) {
  o = o || {}; const base = String(o.baseUrl || DEFAULT_BASE).replace(/\/+$/, ''), key = String(o.apiKey || ''), timeout = o.timeout || 60000;
  const headers = Object.assign({'Content-Type': 'application/json', Accept: 'text/event-stream'}, key ? {Authorization: 'Bearer ' + key} : {}, o.headers || {});
  return {messages: {stream(params) {
    const ac = new AbortController(); const h = {}; let aborted = false, p = null;
    const run = async () => {
      if (aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      const body = {model: params.model, messages: toMessages(params), stream: true}, tl = toTools(params.tools); if (tl.length) body.tools = tl;
      let tokParam = isOpenAIHost(base) ? 'max_completion_tokens' : 'max_tokens'; if (params.max_tokens) body[tokParam] = params.max_tokens;
      let res = null, swapped = false;
      for (let attempt = 0; attempt < 3 && !res; attempt++) {
        let timedOut = false; const t = setTimeout(() => { timedOut = true; ac.abort(); }, timeout);
        try {
          const r = await fetch(base + '/chat/completions', {method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal}); clearTimeout(t);
          if (r.ok) { res = r; break; }
          let msg = ''; try { const tx = await r.text(); try { const j = JSON.parse(tx); msg = (j.error && (j.error.message || j.error)) || j.message || tx; } catch (e) { msg = tx; } } catch (e) {}
          const err = new Error(String(msg).slice(0, 300)); err.status = r.status;
          if ((r.status === 400 || r.status === 422) && /max_completion_tokens|max_tokens/i.test(err.message) && !swapped && params.max_tokens) { swapped = true; delete body[tokParam]; tokParam = tokParam === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'; body[tokParam] = params.max_tokens; continue; }
          if ((r.status === 400 || r.status === 422 || r.status === 404) && body.tools && /tool|function/i.test(err.message)) err.code = 'tools_unsupported';
          throw err;
        } catch (e) { clearTimeout(t); if (timedOut) { const x = new Error('timeout'); x.code = 'ETIMEDOUT'; throw x; } throw e; }
      }
      const r = await readStream(res, t => { if (h.text) h.text(t); });
      const content = []; if (r.text) content.push({type: 'text', text: r.text}); let n = 0;
      for (const c of r.calls) { let input = {}; try { input = c.args ? JSON.parse(c.args) : {}; } catch (e) { input = {}; } content.push({type: 'tool_use', id: c.id || 'call_' + (++n), name: c.name, input}); }
      return {content, stop_reason: r.calls.length ? 'tool_use' : r.finish === 'length' ? 'max_tokens' : 'end_turn'};
    };
    return {on(ev, cb) { h[ev] = cb; return this; }, abort() { aborted = true; try { ac.abort(); } catch (e) {} }, finalMessage() { return p || (p = run()); }};
  }}};
}

module.exports = {create, toMessages, toTools, DEFAULT_BASE};
