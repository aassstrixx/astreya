/* Уведомления о новой заявке: веб-хук, Telegram-бот, письмо по SMTP. Сбой одного канала не мешает остальным и не теряет заявку (она уже сохранена). */
'use strict';
const net = require('net'), tls = require('tls'), path = require('path'), fs = require('fs');
const C = require('./config');
const {TYPE_TITLES} = require('./leads');

const LOG = path.join(C.DATA, 'notify.log');
const log = (...a) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch (e) {} };

function text(lead, site) {
  const L = [`Новая заявка ${lead.id} — ${TYPE_TITLES[lead.type] || lead.type}`, (lead.flags || []).length ? '⚠ Подозрительная: ' + lead.flags.join('; ') : null, lead.context ? 'Тема: ' + lead.context : null, 'Имя: ' + lead.name, lead.phone ? 'Телефон: ' + lead.phone : null, lead.email ? 'E-mail: ' + lead.email : null,
    lead.city ? 'Город: ' + lead.city : null, lead.org ? 'Организация: ' + lead.org : null, lead.spec ? 'Специализация: ' + lead.spec : null, lead.msg ? '\n' + lead.msg : null,
    '\nСтраница: ' + (lead.page || '—'), site ? 'Админка: ' + site : null];
  return L.filter(x => x !== null).join('\n');
}

async function webhook(url, lead, body) {
  const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({event: 'lead.created', text: body, lead: {id: lead.id, type: lead.type, name: lead.name, phone: lead.phone, email: lead.email, city: lead.city, org: lead.org, msg: lead.msg, context: lead.context, page: lead.page, created_at: lead.created_at}}), signal: AbortSignal.timeout(10000)});
  if (!r.ok) throw new Error('веб-хук ответил ' + r.status);
}
async function telegram(t, body) {
  const base = C.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
  const r = await fetch(`${base}/bot${t.token}/sendMessage`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({chat_id: t.chatId, text: body.slice(0, 4000), disable_web_page_preview: true}), signal: AbortSignal.timeout(10000)});
  if (!r.ok) throw new Error('Telegram ответил ' + r.status);
}

/* ---- минимальный SMTP-клиент: implicit TLS (порт 465) или STARTTLS (587), AUTH PLAIN/LOGIN; письмо в UTF-8 ---- */
function smtpSend(cfg, subject, body) {
  return new Promise((resolve, reject) => {
    let sock, buf = '', step = 0, done = false, tlsUp = false, caps = '';
    const fail = e => { if (!done) { done = true; try { sock && sock.destroy(); } catch (x) {} reject(e instanceof Error ? e : new Error(String(e))); } };
    const finish = () => { if (!done) { done = true; try { sock.end(); } catch (x) {} resolve(); } };
    const to = String(cfg.to).split(/[,;\s]+/).filter(Boolean), from = cfg.from || cfg.user;
    const addr = s => (String(s).match(/<([^>]+)>/) || [null, s])[1];
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    const msg = ['From: ' + from, 'To: ' + to.join(', '), 'Subject: =?UTF-8?B?' + b64(subject) + '?=', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', (b64(body).match(/.{1,76}/g) || []).join('\r\n')].join('\r\n');
    const send = s => sock.write(s + '\r\n');
    const queue = [];
    const connect = () => {
      const opts = {host: cfg.host, port: +cfg.port || 587};
      sock = cfg.secure ? tls.connect(Object.assign({servername: cfg.host}, opts)) : net.connect(opts);
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
module.exports = {notifyLead, test, smtpSend, text};
