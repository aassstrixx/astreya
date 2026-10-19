/* Уведомления о новой заявке: веб-хук, Telegram-бот, письмо по SMTP. Сбой одного канала не мешает остальным и не теряет заявку (она уже сохранена). */
'use strict';
const net = require('net'), tls = require('tls'), path = require('path'), fs = require('fs');
const C = require('./config');
const {TYPE_TITLES} = require('./leads');
const NG = require('./netguard');

const LOG = path.join(C.DATA, 'notify.log');
const log = (...a) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch (e) {} };

function text(lead, site) {
  const L = [`Новая заявка ${lead.id} — ${TYPE_TITLES[lead.type] || lead.type}`, (lead.flags || []).length ? '⚠ Подозрительная: ' + lead.flags.join('; ') : null, lead.context ? 'Тема: ' + lead.context : null, lead.src ? 'Источник: ' + lead.src : null, 'Имя: ' + lead.name, lead.phone ? 'Телефон: ' + lead.phone : null, lead.email ? 'E-mail: ' + lead.email : null,
    lead.city ? 'Город: ' + lead.city : null, lead.org ? 'Организация: ' + lead.org : null, lead.spec ? 'Специализация: ' + lead.spec : null, lead.msg ? '\n' + lead.msg : null,
    '\nСтраница: ' + (lead.page || '—'), site ? 'Админка: ' + site : null];
  return L.filter(x => x !== null).join('\n');
}

async function webhook(url, lead, body) {
  const r = await NG.postJSON(url, {event: 'lead.created', text: body, lead: {id: lead.id, type: lead.type, name: lead.name, phone: lead.phone, email: lead.email, city: lead.city, org: lead.org, msg: lead.msg, context: lead.context, page: lead.page, created_at: lead.created_at}});
  if (r.status < 200 || r.status >= 300) throw new Error('веб-хук ответил ' + r.status);
}
async function telegram(t, body) {
  const base = String(C.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
  const r = await NG.postJSON(`${base}/bot${t.token}/sendMessage`, {chat_id: t.chatId, text: body.slice(0, 4000), disable_web_page_preview: true});
  if (r.status < 200 || r.status >= 300) throw new Error('Telegram ответил ' + r.status);
}
/* Битрикс24: входящий веб-хук портала → crm.lead.add. Адрес вида https://<портал>.bitrix24.ru/rest/<id>/<код>/ (создаётся в Битрикс24: Разработчикам → Другое → Входящий веб-хук) */
const b24Url = hook => String(hook || '').replace(/\/?$/, '/') + 'crm.lead.add.json';
async function bitrix24(cfg, lead, body) {
  const fields = {TITLE: `Заявка с сайта ${lead.id}: ${TYPE_TITLES[lead.type] || lead.type}`, NAME: lead.name, SOURCE_ID: cfg.source || 'WEB', SOURCE_DESCRIPTION: lead.page || 'сайт', COMMENTS: body.slice(0, 6000), OPENED: 'Y'};
  if (lead.phone) fields.PHONE = [{VALUE: lead.phone, VALUE_TYPE: 'WORK'}];
  if (lead.email) fields.EMAIL = [{VALUE: lead.email, VALUE_TYPE: 'WORK'}];
  if (lead.org) fields.COMPANY_TITLE = lead.org;
  if (lead.city) fields.ADDRESS_CITY = lead.city;
  const r = await NG.postJSON(b24Url(cfg.webhook), {fields, params: {REGISTER_SONET_EVENT: 'N'}});
  if (r.status < 200 || r.status >= 300 || (r.json && r.json.error)) throw new Error('Битрикс24: ' + ((r.json && (r.json.error_description || r.json.error)) || 'ответ ' + r.status));
  return r.json && r.json.result;
}

/* ---- минимальный SMTP-клиент: implicit TLS (порт 465) или STARTTLS (587), AUTH PLAIN/LOGIN; письмо в UTF-8 ---- */
function smtpSend(cfg, subject, body) {
  return new Promise((resolve, reject) => {
    let sock, buf = '', step = 0, done = false, tlsUp = false, caps = '';
    const fail = e => { if (!done) { done = true; try { sock && sock.destroy(); } catch (x) {} reject(e instanceof Error ? e : new Error(String(e))); } };
    const finish = () => { if (!done) { done = true; try { sock.end(); } catch (x) {} resolve(); } };
    const clean1 = s => String(s).replace(/[\r\n\0]+/g, ' ').trim(), addr = s => clean1((String(s).match(/<([^>]+)>/) || [null, s])[1]);
    const to = clean1(cfg.to).split(/[,;\s]+/).filter(Boolean), from = clean1(cfg.from || cfg.user);
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    const msg = ['From: ' + from, 'To: ' + to.join(', '), 'Subject: =?UTF-8?B?' + b64(subject) + '?=', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', (b64(body).match(/.{1,76}/g) || []).join('\r\n')].join('\r\n');
    const send = s => sock.write(s + '\r\n');
    const queue = [];
    const connect = () => {
      const opts = {host: cfg.host, port: +cfg.port || 587};
      sock = cfg.secure ? tls.connect(Object.assign({servername: cfg.host, lookup: NG.guardedLookup}, opts)) : net.connect(Object.assign({lookup: NG.guardedLookup}, opts));
      sock.setTimeout(15000, () => fail(new Error('SMTP: время ожидания вышло')));
      sock.setEncoding('utf8'); sock.on('error', fail); sock.on('data', onData);
    };
    const flow = [
      () => send('EHLO astreya'),
      () => { if (!cfg.secure && /STARTTLS/i.test(caps) && !tlsUp) { send('STARTTLS'); step = 10; } else next(); },
      () => { if (cfg.user && cfg.pass) { if (/AUTH[^\n]*PLAIN/i.test(caps)) send('AUTH PLAIN ' + b64('\0' + cfg.user + '\0' + cfg.pass)); else send('AUTH LOGIN'); } else next(); },
      () => { send('MAIL FROM:<' + addr(from) + '>'); },
      () => { const t = to.slice(); queue.length = 0; t.forEach(x => queue.push(x)); sendRcpt(); },
      () => send('DATA'),
      () => { sock.write(msg.replace(/^\./gm, '..') + '\r\n.\r\n'); },
      () => send('QUIT')
    ];
    let loginPhase = 0;
    const sendRcpt = () => { if (queue.length) send('RCPT TO:<' + addr(queue.shift()) + '>'); };
    const next = () => { step++; flow[step] && flow[step](); };
    function onData(chunk) {                                                       // ответ сервера может быть многострочным (250-… / 250 …): ждём строку «код + пробел»
      buf += chunk;
      for (;;) {
        const lines = buf.split(/\r?\n/), acc = []; let idx = -1;
        for (let i = 0; i < lines.length - 1; i++) { acc.push(lines[i]); if (/^\d{3}( |$)/.test(lines[i])) { idx = i; break; } }
        if (idx < 0) return;
        buf = lines.slice(idx + 1).join('\r\n');
        reply(+acc[acc.length - 1].slice(0, 3), acc.join('\n'));
        if (done) return;
      }
    }
    function reply(code, text) {
      if (step === 0 && code === 220) { flow[0](); step = 0.5; return; }
      if (step === 0.5) { if (code !== 250) return fail(new Error('SMTP EHLO: ' + code)); caps = text; step = 1; flow[1](); return; }
      if (step === 10) { if (code !== 220) return fail(new Error('SMTP STARTTLS: ' + code)); sock.removeAllListeners('data'); const raw = sock; sock = tls.connect({socket: raw, servername: cfg.host}, () => { tlsUp = true; sock.setEncoding('utf8'); sock.on('data', onData); sock.on('error', fail); buf = ''; step = 0.5; send('EHLO astreya'); }); sock.on('error', fail); return; }
      if (step === 2) {
        if (code === 334) { if (loginPhase === 0) { send(b64(cfg.user)); loginPhase = 1; } else send(b64(cfg.pass)); return; }
        if (code !== 235) return fail(new Error('SMTP: авторизация не удалась (' + code + ')')); return next();
      }
      if (step === 3) { if (code !== 250) return fail(new Error('SMTP MAIL FROM: ' + code)); return next(); }
      if (step === 4) { if (code !== 250 && code !== 251) return fail(new Error('SMTP RCPT: ' + code)); if (queue.length) return sendRcpt(); return next(); }
      if (step === 5) { if (code !== 354) return fail(new Error('SMTP DATA: ' + code)); return next(); }
      if (step === 6) { if (code !== 250) return fail(new Error('SMTP: письмо не принято (' + code + ')')); return next(); }
      if (step === 7) return finish();
    }
    connect();
  });
}

async function notifyLead(lead, settings, publicUrl) {
  const n = settings.notify || {}, body = text(lead, publicUrl), jobs = [];
  if (n.webhookUrl) jobs.push(['веб-хук', webhook(n.webhookUrl, lead, body)]);
  if (n.telegram && n.telegram.token && n.telegram.chatId) jobs.push(['Telegram', telegram(n.telegram, body)]);
  const bx = (settings.integrations || {}).bitrix24; if (bx && bx.enabled && bx.webhook) jobs.push(['Битрикс24', bitrix24(bx, lead, body)]);
  if (n.smtp && n.smtp.host && n.smtp.to) jobs.push(['e-mail', smtpSend(n.smtp, `Заявка с сайта ${lead.id}: ${TYPE_TITLES[lead.type] || lead.type} — ${lead.name}`, body)]);
  const res = await Promise.allSettled(jobs.map(j => j[1]));
  const out = res.map((r, i) => ({channel: jobs[i][0], ok: r.status === 'fulfilled', error: r.status === 'rejected' ? String(r.reason && r.reason.message || r.reason) : null}));
  out.filter(x => !x.ok).forEach(x => log('ОШИБКА', x.channel, lead.id, x.error));
  return out;
}
/* пробная отправка из админки */
async function test(settings) {
  const fake = {id: 'L00000', type: 'question', name: 'Проверка связи', phone: '', email: 'test@example.com', city: '', org: '', spec: '', msg: 'Это тестовое уведомление из админки сайта «Астрея».', context: '', page: '', created_at: new Date().toISOString()};
  return notifyLead(fake, settings, '');
}
module.exports = {notifyLead, test, smtpSend, text, bitrix24, b24Url};
