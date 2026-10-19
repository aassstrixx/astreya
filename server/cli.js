#!/usr/bin/env node
/* Командная строка сервера: управление администраторами без входа в админку и служебные операции.
   Примеры:
     node server/cli.js create-admin ivan            — создать администратора (пароль спросит или сгенерирует)
     node server/cli.js create-manager anna          — менеджер (только заявки)
     node server/cli.js reset-password admin         — сбросить пароль (потребуется смена при входе)
     node server/cli.js reset-2fa admin              — снять двухфакторный вход (потерян телефон и коды восстановления)
     node server/cli.js list-users
     node server/cli.js backup                       — создать резервную копию данных сервера
     node server/cli.js launch                       — чек-лист готовности к запуску в РФ (то же, что раздел «Запуск» в админке)
     node server/cli.js export-leads [файл.csv]      — выгрузка всех заявок в CSV
     node server/cli.js build                        — пересобрать и проверить сайт
     node server/cli.js check                        — проверить конфигурацию и доступы
     node server/cli.js assistant-check              — проверить подключение ИИ-помощника «Стелла» (пробный запрос к модели, тратит несколько токенов)
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
  async 'reset-2fa'(login) {
    const u = A.listUsers().find(x => x.login.toLowerCase() === String(login || '').toLowerCase()); if (!u) throw new Error('Пользователь не найден: ' + login);
    await A.totpReset(u.id); console.log(`Двухфакторный вход у ${u.login} снят, сеансы завершены. Включите его снова в админке: Безопасность.`);
  },
  async backup() { const r = await require('./lib/backup').create('командная строка', 'manual'); console.log('Копия создана: ' + r.id + ' (' + r.files.length + ' файлов' + (r.encrypted ? ', зашифрована' : '') + ')\nПапка: ' + require('./lib/backup').DIR); },
  launch() {
    const r = require('./lib/launch').run({https: /^https:/.test(C.PUBLIC_URL)}), mark = {ok: '✓', fail: '✗', warn: '!', manual: '○', info: 'i'};
    let g = ''; r.items.forEach(i => { if (i.group !== g) { g = i.group; console.log('\n' + g); } console.log(`  ${mark[i.status] || '?'} ${i.title}${i.blocker ? ' [обязательно]' : ''}${i.status !== 'ok' && i.detail ? '\n      ' + i.detail : ''}`); });
    console.log(`\n${r.ready ? 'Обязательные пункты выполнены.' : 'Не готово: обязательных пунктов — ' + r.blockers + '.'} Выполнено ${r.ok} из ${r.total}, рекомендаций: ${r.warnings}.`); process.exit(r.ready ? 0 : 1);
  },
  'list-users'() { A.listUsers().forEach(u => console.log(`${u.login.padEnd(20)} ${A.ROLES[u.role].padEnd(28)} ${u.disabled ? 'отключён' : 'активен'}  вход: ${u.lastLogin || '—'}`)); },
  'export-leads'(file) { const csv = L.csv({status: 'all'}); if (file) { fs.writeFileSync(file, csv); console.log('Записано: ' + file); } else process.stdout.write(csv); },
  async build() { const r = await B.build('командная строка'); console.log(r.build.out); if (r.check) console.log(r.check.out); process.exit(r.ok ? 0 : 1); },
  async 'assistant-check'() {
    const AS = require('./lib/assistant'), i = AS.info(); console.log('ИИ-помощник «Стелла»');
    console.log('  ✓ сервис: ' + (i.provider === 'openai' ? 'OpenAI-совместимый' + (i.baseUrl ? ' (' + i.baseUrl + ')' : '') : 'Anthropic (Claude)') + (i.tools ? '' : ', без инструментов'));
    console.log((i.key ? '  ✓ ' : '  ✗ ') + 'ключ API: ' + (i.key ? (i.keyFrom === 'not_needed' ? 'не нужен (локальная модель)' : 'задан (' + (i.keyFrom === 'env' ? 'окружение / .env' : 'настройки админки') + ')') : 'не задан — вставьте в админке или задайте ASSISTANT_API_KEY (шаблон: server/.env.example)'));
    console.log((i.model ? '  ✓ ' : '  ✗ ') + 'модель: ' + (i.model ? i.model + ' (' + (i.modelFrom === 'env' ? 'окружение / .env' : 'настройки админки') + ')' : 'не указана — впишите в админке или задайте ASSISTANT_MODEL'));
    console.log((i.sdk ? '  ✓ ' : '  ✗ ') + (i.provider === 'openai' ? 'пакеты: не требуются' : 'пакет @anthropic-ai/sdk: ' + (i.sdk ? 'установлен' : 'не установлен (npm install в корне проекта)')));
    console.log((i.data ? '  ✓ ' : '  ✗ ') + 'данные сайта js/data.js и js/kb.js: ' + (i.data ? 'есть' : 'нет — выполните node tools/build.js'));
    if (!i.ai) { console.log('\nИИ-режим выключен: ' + i.message); process.exit(1); }
    console.log('\nПробный запрос к модели…'); const r = await AS.selfTest();
    console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.message + (r.ok ? ' Ответ: «' + (r.sample || '—') + '» (' + r.ms + ' мс)' : ''));
    process.exit(r.ok ? 0 : 1);
  },
  check() {
    const fail = []; const note = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fail.push(m); };
    console.log('Сайт: ' + C.ROOT + '\nДанные: ' + C.DATA);
    note(fs.existsSync(C.ROOT + '/tools/build.js'), 'найден tools/build.js (сборка из админки возможна)');
    note(A.listUsers().some(u => u.role === 'admin' && !u.disabled), 'есть хотя бы один активный администратор');
    const s = C.loadSettings(), n = s.notify || {};
    note(true, 'уведомления: ' + ([n.webhookUrl && 'веб-хук', n.telegram && n.telegram.token && 'Telegram', n.smtp && n.smtp.host && 'e-mail'].filter(Boolean).join(', ') || 'не настроены (заявки видны только в админке)'));
    let ep = ''; try { ep = JSON.parse(fs.readFileSync(C.ROOT + '/data/site.json', 'utf8')).formEndpoint || ''; } catch (e) {}
    note(!!ep, 'формы сайта: ' + (ep ? 'отправляют на ' + ep : 'режим «письмо» (formEndpoint пуст)'));
    const V = require('./lib/vault'), users = A.listUsers().filter(u => u.role === 'admin' && !u.disabled);
    note(users.every(u => u.totp), 'двухфакторный вход у администраторов: ' + (users.every(u => u.totp) ? 'включён у всех' : 'нет у ' + users.filter(u => !u.totp).map(u => u.login).join(', ')));
    note(V.enabled(), 'шифрование секретов на диске: ' + (V.enabled() ? 'включено (DATA_KEY)' : 'не включено — задайте DATA_KEY (фраза от 16 символов)'));
    note(C.secretsState().plain === 0 || !V.enabled(), 'секреты в открытом виде: ' + C.secretsState().plain);
    note(C.SECURE_COOKIES || C.TRUST_PROXY, 'cookie админки: ' + (C.SECURE_COOKIES ? 'Secure' : C.TRUST_PROXY ? 'Secure по X-Forwarded-Proto' : 'без Secure — для публичного сервера включите https и SECURE_COOKIES=1 или TRUST_PROXY=1'));
    process.exit(fail.length ? 1 : 0);
  }
};
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !cmds[cmd]) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace('#!/usr/bin/env node\n/*', '').trim()); process.exit(cmd ? 1 : 0); }
Promise.resolve(cmds[cmd](rest[0], rest)).catch(e => { console.error('Ошибка: ' + e.message); process.exit(1); });
