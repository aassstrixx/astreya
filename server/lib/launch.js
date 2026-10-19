/* Чек-лист готовности к запуску в РФ: проверяет сайт, сервер, безопасность, интеграции и юридические пункты (152-ФЗ). Что можно проверить автоматически — проверяется; остальное владелец подтверждает вручную
   (подтверждение хранится в настройках с именем и временем). «Обязательные» пункты (blocker) должны быть зелёными до публичного запуска. */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./config');
const A = require('./auth');
const B = require('./build');
const INT = require('./integrations');
const BK = require('./backup');
const vault = require('./vault');
const AUD = require('./audit');

const data = n => INT.siteData(n);
const filled = v => typeof v === 'string' && v.trim() !== '' && !/^(null|—|-|\.\.\.)$/i.test(v.trim());
const PAGE_DIRS = ['', 'brands', 'products', 'training', 'news', 'pages'];
function htmlFiles() {
  const out = [];
  for (const d of PAGE_DIRS) { let es = []; try { es = fs.readdirSync(path.join(C.ROOT, d)); } catch (e) { continue; } es.filter(f => f.endsWith('.html')).forEach(f => out.push(d ? d + '/' + f : f)); }
  return out;
}
/* просмотр готовых страниц: защитный заголовок в мета-теге, внешние ресурсы, встроенные обработчики событий */
function scanSite() {
  const files = htmlFiles(), res = {pages: files.length, noCsp: [], inlineHandlers: [], hosts: {}, fontsExternal: false};
  const own = (() => { try { return new URL(data('site').url).host; } catch (e) { return ''; } })();
  for (const f of files) {
    let t; try { t = fs.readFileSync(path.join(C.ROOT, f), 'utf8'); } catch (e) { continue; }
    if (!/<meta http-equiv="Content-Security-Policy"/i.test(t)) res.noCsp.push(f);
    if (/\son[a-z]+\s*=\s*["']/i.test(t.replace(/<script[\s\S]*?<\/script>/gi, '')) || /href\s*=\s*["']\s*javascript:/i.test(t)) res.inlineHandlers.push(f);
    for (const m of t.matchAll(/<(script|link|img|iframe|source|video|audio)\b([^>]*)>/gi)) {
      const attrs = m[2], u = (attrs.match(/\b(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"/i) || [])[1]; if (!u) continue;
      if (m[1].toLowerCase() === 'link' && !/rel\s*=\s*"(?:stylesheet|preload|preconnect|dns-prefetch|icon|manifest|modulepreload)/i.test(attrs)) continue;
      let host; try { host = new URL(u).host; } catch (e) { continue; } if (host === own) continue;
      (res.hosts[host] = res.hosts[host] || {count: 0, kinds: new Set(), pages: new Set()}); res.hosts[host].count++; res.hosts[host].kinds.add(m[1].toLowerCase()); if (res.hosts[host].pages.size < 3) res.hosts[host].pages.add(f);
    }
  }
  for (const h of Object.keys(res.hosts)) { res.hosts[h] = {count: res.hosts[h].count, kinds: [...res.hosts[h].kinds], pages: [...res.hosts[h].pages]}; if (/fonts\.(googleapis|gstatic)\.com/.test(h)) res.fontsExternal = true; }
  return res;
}
const hosts = s => Object.keys(s.hosts);

function run(env) {
  env = env || {};
  const settings = C.loadSettings(), site = data('site') || {}, integ = data('integrations') || {}, legal = data('legal') || {}, req = site.requisites || {}, users = A.loadUsersRaw().users, admins = users.filter(u => u.role === 'admin' && !u.disabled);
  const conf = settings.launch.confirmed || {}, sec = settings.security, scan = scanSite(), build = B.last(), audit = B.lastAudit(), backups = BK.list(), lastBk = backups[0];
  const items = [], add = (group, id, title, status, detail, o) => items.push(Object.assign({group, id, title, status, detail: detail || ''}, o));
  const manual = (group, id, title, detail, o) => { const c = conf[id]; add(group, id, title, c ? 'ok' : 'manual', c ? 'Подтверждено: ' + c.by + ', ' + String(c.at).slice(0, 10) : detail, Object.assign({manual: true, confirmed: !!c}, o)); };
  const https = !!(env.https || /^https:/.test(C.PUBLIC_URL));
  const hostOf = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
  const siteHost = hostOf(site.url);

  /* --- 1. Юридическое: 152-ФЗ --- */
  const G1 = 'Закон о персональных данных (152-ФЗ)';
  const reqMissing = [['legalName', 'название'], ['inn', 'ИНН'], ['ogrn', 'ОГРН'], ['legalAddress', 'юридический адрес']].filter(([k]) => !filled(req[k])).map(x => x[1]);
  add(G1, 'requisites', 'Реквизиты оператора заполнены', reqMissing.length ? 'fail' : 'ok', reqMissing.length ? 'Не заполнено: ' + reqMissing.join(', ') + '. Без них политика конфиденциальности и согласие не публикуются.' : req.legalName + ', ИНН ' + req.inn, {blocker: true, fix: '#/content/site', how: 'Содержимое сайта → Настройки сайта → Реквизиты компании.'});
  add(G1, 'legal_docs', 'Политика конфиденциальности и согласие опубликованы', reqMissing.length ? 'fail' : (legal.version ? 'ok' : 'warn'), reqMissing.length ? 'Документы появятся на сайте после заполнения реквизитов.' : 'Редакция от ' + (legal.version || '—') + '. Документы собираются автоматически из реквизитов и подключённых сервисов.', {blocker: true, fix: '#/content/legal', how: 'Содержимое сайта → Документы (152-ФЗ).'});
  manual(G1, 'rkn_notice', 'Уведомление Роскомнадзора об обработке персональных данных подано', 'Оператор ПДн обязан подать уведомление до начала обработки (ч. 1 ст. 22 152-ФЗ) — через портал pd.rkn.gov.ru. Это делает владелец компании; если считаете, что подавать не нужно, подтвердите это после консультации юриста.', {blocker: true});
  manual(G1, 'localization', 'Заявки хранятся на сервере в России', 'Первичная запись и хранение данных граждан РФ — в базах на территории РФ (ч. 5 ст. 18 152-ФЗ). Сервер заявок (этот сервер) должен находиться у российского хостинг-провайдера.', {blocker: true});
  manual(G1, 'lawyer', 'Юрист проверил документы и процессы', 'Тексты политики и согласия собраны по требованиям 152-ФЗ, но юридическую силу им придаёт ваш юрист: пусть проверит под вашу деятельность.', {blocker: true});
  manual(G1, 'responsible', 'Назначено ответственное лицо и порядок реагирования на утечки', 'Нужен ответственный за организацию обработки ПДн (ст. 22.1) и порядок: при утечке — уведомление Роскомнадзора в течение 24 часов, подробности в течение 72 часов (ст. 21).');
  const cm = (integ.consent || {}).mode || 'optin';
  add(G1, 'consent_mode', 'Баннер согласия на аналитику', cm === 'off' ? ((integ.metrika || {}).id ? 'fail' : 'info') : 'ok', cm === 'off' ? 'Баннер выключен. Если на сайте работает Метрика — включите его: Роскомнадзор проверяет сайты автоматически и ищет уведомление до начала сбора данных.' : 'Режим: ' + (cm === 'optin' ? 'аналитика только после согласия' : 'уведомление, отказ отключает аналитику') + '.', {blocker: !!(integ.metrika || {}).id && cm === 'off', fix: '#/integrations'});
  const aiInfo = require('./assistant').info(), crossAi = aiInfo.ai && aiInfo.keyFrom !== 'not_needed' && (aiInfo.provider === 'anthropic' || !/\.(ru|рф|su)(\/|:|$)|localhost|127\.0\.0\.1/.test(aiInfo.baseUrl || ''));          // ИИ включён и модель не российская / не своя
  add(G1, 'crossborder', 'Передача данных за границу (ИИ-помощник, уведомления)', crossAi || settings.notify.telegram.token ? 'warn' : 'ok', crossAi ? 'ИИ-помощник обращается к зарубежному сервису: вопросы посетителей уходят за рубеж. Предупреждение показано в чате и в политике; для крупных рисков используйте российскую модель или локальную. Если передаются ПДн — нужно уведомление Роскомнадзора о трансграничной передаче.' : settings.notify.telegram.token ? 'Telegram-уведомления содержат данные заявок и идут через серверы Telegram. Это нужно учесть в политике и оценке рисков (или использовать e-mail / Битрикс24).' : 'Зарубежные сервисы не подключены.', {fix: '#/integrations'});
  const fontsNote = scan.fontsExternal;
  add(G1, 'fonts', 'Шрифты и скрипты не грузятся с зарубежных серверов', fontsNote ? 'fail' : 'ok', fontsNote ? 'Страницы подключают Google Fonts: адрес посетителя передаётся в Google. Пересоберите сайт — шрифты теперь хранятся на самом сайте.' : 'Шрифты — свои, внешних загрузок кроме разрешённых сервисов нет.', {blocker: fontsNote, fix: '#/publish'});

  /* --- 2. Сайт --- */
  const G2 = 'Сайт';
  add(G2, 'demo', 'Пометка «демонстрационные данные» снята', site.demoNotice ? 'fail' : 'ok', site.demoNotice ? 'В подвале показано: «' + String(site.demoNotice).slice(0, 80) + '…», а разметка товаров и событий для поисковиков отключена. Заполните реальные данные и очистите поле.' : 'Реальные данные.', {blocker: true, fix: '#/content/site'});
  add(G2, 'domain', 'Свой домен вместо тестового', /github\.io$|localhost|127\.0\.0\.1|example\./.test(siteHost) ? 'warn' : 'ok', /github\.io$|localhost|127\.0\.0\.1|example\./.test(siteHost) ? 'Адрес сайта — ' + (siteHost || 'не задан') + '. Для запуска в РФ нужен свой домен (.ru / .рф): им занимается и Роскомнадзор, и поисковики.' : siteHost, {blocker: false, fix: '#/content/site'});
  add(G2, 'form_endpoint', 'Формы отправляют заявки на сервер', site.formEndpoint ? 'ok' : 'fail', site.formEndpoint ? 'Адрес приёма: ' + site.formEndpoint : 'Формы работают в режиме «письмо» (mailto): нет журнала согласий и защиты от спама.', {blocker: true, fix: '#/settings'});
  add(G2, 'contacts', 'Контакты на сайте актуальны', 'info', (site.contacts || {}).phone + ' · ' + (site.contacts || {}).email + ' · ' + (site.contacts || {}).address, {fix: '#/content/site', how: 'Проверьте телефон, почту и адрес — это первое, что ищет клиент.'});
  const wa = (site.contacts || {}).whatsapp, ms = integ.messengers || {};
  add(G2, 'whatsapp', 'WhatsApp убран из контактов', wa && ms.showWhatsapp ? 'warn' : 'ok', wa && ms.showWhatsapp ? 'WhatsApp в России заблокирован, ссылка не откроется у большинства посетителей. Включите MAX или Telegram.' : 'Ссылка WhatsApp на сайте не показывается.', {fix: '#/integrations'});
  add(G2, 'messenger', 'Подключён MAX или Telegram', ms.max || ms.telegram ? 'ok' : 'warn', ms.max || ms.telegram ? 'Каналы: ' + [ms.max && 'MAX', ms.telegram && 'Telegram'].filter(Boolean).join(', ') : 'Российские клиенты чаще пишут в MAX и Telegram — добавьте хотя бы один.', {fix: '#/integrations'});
  const mid = INT.counterId();
  add(G2, 'metrika', 'Яндекс Метрика подключена', mid ? 'ok' : 'warn', mid ? 'Счётчик ' + mid + (((integ.metrika || {}).webvisor) ? ', Вебвизор включён (только после согласия)' : '') : 'Без аналитики нельзя понять, откуда приходят клиенты и что работает.', {fix: '#/integrations', how: 'Создайте счётчик на metrika.yandex.ru и впишите его номер.'});
  const ver = integ.verification || {};
  add(G2, 'webmaster', 'Сайт подтверждён в Яндекс Вебмастере', ver.yandex ? 'ok' : 'warn', ver.yandex ? 'Метатег подтверждения добавлен на все страницы.' : 'Добавьте сайт в webmaster.yandex.ru и вставьте код подтверждения: так вы увидите индексацию и ошибки.', {fix: '#/integrations'});
  add(G2, 'robots', 'robots.txt и sitemap.xml', fs.existsSync(path.join(C.ROOT, 'robots.txt')) && fs.existsSync(path.join(C.ROOT, 'sitemap.xml')) ? 'ok' : 'fail', 'Создаются при сборке; адрес карты сайта отдан поисковикам.', {fix: '#/publish'});
  add(G2, 'build', 'Сайт собран без ошибок', build && build.ok ? 'ok' : 'warn', build ? (build.ok ? 'Последняя сборка: ' + String(build.at).slice(0, 16).replace('T', ' ') : 'Последняя сборка завершилась ошибкой') : 'С момента запуска сервера сборок не было — нажмите «Пересобрать».', {fix: '#/publish'});
  add(G2, 'audit', 'Полная проверка сайта (HTML, SEO, ссылки)', audit ? (audit.errors ? 'fail' : audit.warns ? 'warn' : 'ok') : 'warn', audit ? 'Ошибок: ' + audit.errors + ', замечаний: ' + audit.warns : 'Проверка ещё не запускалась (Обзор → «Полная проверка сайта»).', {fix: '#/overview'});

  /* --- 3. Безопасность --- */
  const G3 = 'Безопасность';
  add(G3, 'https', 'Админка работает по https', https ? 'ok' : 'fail', https ? 'Соединение защищено.' : 'Сейчас соединение без шифрования: пароли и сеансы можно перехватить. Включите https на сервере (Caddy/nginx + сертификат) и SECURE_COOKIES=1 или TRUST_PROXY=1.', {blocker: true});
  add(G3, 'cookie_secure', 'Cookie сеанса защищены (Secure, SameSite, HttpOnly)', https && (C.SECURE_COOKIES || C.TRUST_PROXY) ? 'ok' : 'warn', C.SECURE_COOKIES || C.TRUST_PROXY ? 'Включено.' : 'Включите SECURE_COOKIES=1 (или TRUST_PROXY=1 за прокси).', {blocker: false});
  const stale = users.filter(u => !u.disabled && u.mustChange);
  add(G3, 'default_pw', 'Временные пароли заменены', stale.length ? 'fail' : 'ok', stale.length ? 'Не сменили пароль: ' + stale.map(u => u.login).join(', ') : 'Все пользователи задали свои пароли.', {blocker: true, fix: '#/users'});
  const envPw = C.env.ADMIN_PASSWORD && users.some(u => !u.disabled && A.verifyPassword(C.env.ADMIN_PASSWORD, u.hash));
  add(G3, 'env_pw', 'Пароль не совпадает с ADMIN_PASSWORD из настроек запуска', envPw ? 'fail' : 'ok', envPw ? 'Один из паролей всё ещё равен ADMIN_PASSWORD, а он лежит открытым текстом в конфигурации запуска. Смените пароль.' : 'Совпадений нет.', {blocker: true, fix: '#/security'});
  const no2 = admins.filter(u => !A.has2fa(u));
  add(G3, '2fa', 'У всех администраторов включён двухфакторный вход', no2.length ? 'fail' : 'ok', no2.length ? 'Без 2FA: ' + no2.map(u => u.login).join(', ') + '. Украденный пароль даст полный доступ к сайту и заявкам.' : 'Включён у всех администраторов.', {blocker: true, fix: '#/security'});
  const pol2 = require('./security').policy2fa();
  add(G3, '2fa_policy', 'Политика «2FA обязательна для администраторов»', pol2 ? 'ok' : 'warn', pol2 ? 'Включена.' : 'Включите, чтобы новый администратор не мог войти без второго фактора.', {fix: '#/security'});
  add(G3, 'ip_allow', 'Доступ в админку ограничен по адресам', sec.ipAllowlist.length ? 'ok' : 'info', sec.ipAllowlist.length ? 'Разрешено адресов/сетей: ' + sec.ipAllowlist.length : 'Не ограничен (защита — пароль и 2FA). Если у офиса постоянный адрес — ограничьте.', {fix: '#/security'});
  add(G3, 'vault', 'Секреты (токены, ключи) шифруются на диске', vault.enabled() ? (C.secretsState().plain ? 'warn' : 'ok') : 'warn', vault.enabled() ? (C.secretsState().plain ? 'Ключ шифрования задан, но часть секретов ещё в открытом виде — нажмите «Зашифровать сейчас».' : 'Все секреты зашифрованы (AES-256-GCM).') : 'Задайте DATA_KEY (случайная фраза от 16 символов) в настройках запуска — тогда токены Telegram, SMTP, ИИ и Метрики хранятся зашифрованными.', {fix: '#/security'});
  add(G3, 'vault_broken', 'Ключ шифрования подходит к данным', C.vaultBroken() ? 'fail' : 'ok', C.vaultBroken() ? 'В настройках есть зашифрованные секреты, а DATA_KEY не задан или другой. Верните прежний ключ или введите секреты заново.' : 'Да.', {blocker: C.vaultBroken()});
  add(G3, 'headers', 'Защитные заголовки и политика безопасности страниц', scan.noCsp.length ? 'fail' : 'ok', scan.noCsp.length ? 'Без политики безопасности: ' + scan.noCsp.slice(0, 3).join(', ') + (scan.noCsp.length > 3 ? '…' : '') + '. Пересоберите сайт.' : 'На всех ' + scan.pages + ' страницах есть Content-Security-Policy; сервер добавляет заголовки HSTS, X-Content-Type-Options, Permissions-Policy и др.', {blocker: true, fix: '#/publish'});
  add(G3, 'inline', 'Нет встроенных обработчиков событий', scan.inlineHandlers.length ? 'warn' : 'ok', scan.inlineHandlers.length ? 'Найдены onclick= и т. п. на: ' + scan.inlineHandlers.slice(0, 3).join(', ') + ' — политика безопасности их заблокирует.' : 'Нет.');
  const extra = hosts(scan).filter(h => !/^(mc\.yandex\.(ru|com)|yastatic\.net|smartcaptcha\.yandexcloud\.net)$/.test(h));
  add(G3, 'external', 'Внешние ресурсы на страницах', extra.length ? 'warn' : 'ok', extra.length ? 'Сторонние адреса: ' + extra.join(', ') + '. Каждый — это передача адреса посетителя владельцу ресурса.' : (hosts(scan).length ? 'Только разрешённые российские сервисы: ' + hosts(scan).join(', ') : 'Нет ни одного: страницы работают полностью на своих файлах.'));
  const bkAge = lastBk ? (Date.now() - Date.parse(lastBk.at)) / 864e5 : null;
  add(G3, 'backup', 'Резервные копии создаются', lastBk ? (bkAge > 3 ? 'warn' : 'ok') : 'warn', lastBk ? 'Последняя: ' + String(lastBk.at).slice(0, 16).replace('T', ' ') + (settings.backup.auto ? ' (автокопия раз в сутки)' : '') : 'Копий пока нет — создайте первую в разделе «Копии». Копия на том же сервере не спасёт при его потере: скачивайте её и храните отдельно.', {fix: '#/backups'});
  add(G3, 'audit_log', 'Журнал действий ведётся', 'ok', 'Размер журнала: ' + Math.round(AUD.size() / 1024) + ' КБ (ротация при 5 МБ).');

  /* --- 4. Заявки и связь --- */
  const G4 = 'Заявки и связь';
  const ch = [settings.notify.webhookUrl && 'веб-хук', settings.notify.telegram.token && settings.notify.telegram.chatId && 'Telegram', settings.notify.smtp.host && settings.notify.smtp.to && 'e-mail', settings.integrations.bitrix24.enabled && settings.integrations.bitrix24.webhook && 'Битрикс24'].filter(Boolean);
  add(G4, 'notify', 'Менеджеры получают уведомления о новых заявках', ch.length ? 'ok' : 'fail', ch.length ? 'Каналы: ' + ch.join(', ') : 'Заявки видны только в админке — их легко пропустить. Подключите e-mail, Telegram или Битрикс24.', {blocker: true, fix: '#/settings'});
  add(G4, 'retention', 'Срок хранения закрытых заявок задан', settings.retentionDays ? 'ok' : 'warn', settings.retentionDays ? settings.retentionDays + ' дн.' : 'Хранить данные дольше, чем нужно для цели, нельзя (ст. 5 152-ФЗ). Задайте срок.', {fix: '#/settings'});
  add(G4, 'spam', 'Защита форм от спама', settings.integrations.captcha.enabled && settings.integrations.captcha.serverKey && (integ.captcha || {}).siteKey ? 'ok' : 'info', settings.integrations.captcha.enabled ? 'Яндекс SmartCaptcha включена' : 'Работают скрытое поле, проверка скорости и лимиты по адресу. Яндекс SmartCaptcha — дополнительная защита (по желанию).', {fix: '#/integrations'});
  add(G4, 'origins', 'Разрешённые источники заявок заданы верно', 'ok', 'Адрес из «Настройки сайта → url» разрешён автоматически' + (settings.allowedOrigins.length ? '; дополнительно: ' + settings.allowedOrigins.join(', ') : '') + '.');

  const bad = items.filter(i => i.blocker && i.status !== 'ok'), warn = items.filter(i => !i.blocker && (i.status === 'warn' || i.status === 'fail'));
  return {at: new Date().toISOString(), ready: bad.length === 0, blockers: bad.length, warnings: warn.length, total: items.length, ok: items.filter(i => i.status === 'ok').length, items, scan: {pages: scan.pages, hosts: scan.hosts}};
}
module.exports = {run, scanSite};
