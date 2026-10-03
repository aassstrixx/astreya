#!/usr/bin/env node
/* Командная строка сервера: управление администраторами без входа в админку и служебные операции.
   Примеры:
     node server/cli.js create-admin ivan            — создать администратора (пароль спросит или сгенерирует)
     node server/cli.js create-manager anna          — менеджер (только заявки)
     node server/cli.js reset-password admin         — сбросить пароль (потребуется смена при входе)
     node server/cli.js list-users
     node server/cli.js export-leads [файл.csv]      — выгрузка всех заявок в CSV
     node server/cli.js build                        — пересобрать и проверить сайт
     node server/cli.js check                        — проверить конфигурацию и доступы
   Папка данных — DATA_DIR (по умолчанию server/data), сайт — SITE_ROOT (по умолчанию корень репозитория). */
'use strict';
const fs = require('fs'), crypto = require('crypto'), readline = require('readline');
const C = require('./lib/config');
const A = require('./lib/auth');
const L = require('./lib/leads');
const B = require('./lib/build');

const gen = () => crypto.randomBytes(9).toString('base64url') + '7a';
function ask(q, silent) {
  return new Promise(res => {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: true});
    if (silent) { rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(s); }; }
    rl.question(q, a => { rl.close(); if (silent) process.stdout.write('\n'); res(a); });
  });
}
async function create(role, login, args) {
  if (!login) throw new Error('Укажите логин: node server/cli.js create-' + role + ' <логин>');
  let pw = args.find(a => a.startsWith('--password='));
  pw = pw ? pw.slice(11) : (process.stdin.isTTY ? await ask('Пароль (Enter — сгенерировать): ', true) : '');
  let generated = false; if (!pw) { pw = gen(); generated = true; }
  const u = await A.createUser({login, name: login, role, password: pw, mustChange: generated});
  console.log(`Создан: ${u.login} (${A.ROLES[u.role]})` + (generated ? `\nВременный пароль: ${pw}\n(при первом входе его нужно сменить)` : ''));
}
const cmds = {
  'create-admin': (a, args) => create('admin', a, args),
  'create-manager': (a, args) => create('manager', a, args),
  async 'reset-password'(login, args) {
    const u = A.listUsers().find(x => x.login.toLowerCase() === String(login || '').toLowerCase()); if (!u) throw new Error('Пользователь не найден: ' + login);
    const pw = gen(); await A.updateUser(u.id, {password: pw, mustChange: true}, null);
    console.log(`Пароль для ${u.login} сброшен.\nВременный пароль: ${pw}\n(при входе потребуется смена; все сеансы пользователя завершены)`);
  },
  'list-users'() { A.listUsers().forEach(u => console.log(`${u.login.padEnd(20)} ${A.ROLES[u.role].padEnd(28)} ${u.disabled ? 'отключён' : 'активен'}  вход: ${u.lastLogin || '—'}`)); },
  'export-leads'(file) { const csv = L.csv({status: 'all'}); if (file) { fs.writeFileSync(file, csv); console.log('Записано: ' + file); } else process.stdout.write(csv); },
  async build() { const r = await B.build('командная строка'); console.log(r.build.out); if (r.check) console.log(r.check.out); process.exit(r.ok ? 0 : 1); },
  check() {
    const fail = []; const note = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fail.push(m); };
    console.log('Сайт: ' + C.ROOT + '\nДанные: ' + C.DATA);
    note(fs.existsSync(C.ROOT + '/tools/build.js'), 'найден tools/build.js (сборка из админки возможна)');
    note(A.listUsers().some(u => u.role === 'admin' && !u.disabled), 'есть хотя бы один активный администратор');
    const s = C.loadSettings(), n = s.notify || {};
    note(true, 'уведомления: ' + ([n.webhookUrl && 'веб-хук', n.telegram && n.telegram.token && 'Telegram', n.smtp && n.smtp.host && 'e-mail'].filter(Boolean).join(', ') || 'не настроены (заявки видны только в админке)'));
    let ep = ''; try { ep = JSON.parse(fs.readFileSync(C.ROOT + '/data/site.json', 'utf8')).formEndpoint || ''; } catch (e) {}
    note(!!ep, 'формы сайта: ' + (ep ? 'отправляют на ' + ep : 'режим «письмо» (formEndpoint пуст)'));
    note(C.SECURE_COOKIES || C.TRUST_PROXY, 'cookie админки: ' + (C.SECURE_COOKIES ? 'Secure' : C.TRUST_PROXY ? 'Secure по X-Forwarded-Proto' : 'без Secure — для публичного сервера включите https и SECURE_COOKIES=1 или TRUST_PROXY=1'));
    process.exit(fail.length ? 1 : 0);
  }
};
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !cmds[cmd]) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace('#!/usr/bin/env node\n/*', '').trim()); process.exit(cmd ? 1 : 0); }
Promise.resolve(cmds[cmd](rest[0], rest)).catch(e => { console.error('Ошибка: ' + e.message); process.exit(1); });
