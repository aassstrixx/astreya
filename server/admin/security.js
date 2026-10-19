/* Раздел «Безопасность»: двухфакторный вход, свои сеансы, политика доступа (обязательный 2FA, список адресов, длительность сеансов), состояние защиты. */
(function () {
  'use strict';
  const {h} = AD;
  let fldN = 0;
  const fld = (label, input, help) => { if (input && /^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName) && !input.id) input.id = 'sc' + (++fldN); return h('div', {class: 'field'}, h('label', {for: input && input.id ? input.id : null}, label), input, help ? h('div', {class: 'help'}, help) : null); };
  const ok = (good, text, help) => h('li', {}, h('b', {style: {color: good === true ? 'var(--ok,#2f8f5b)' : good === false ? 'var(--err,#b03024)' : '#b8741a', marginRight: '6px'}}, good === true ? '✓' : good === false ? '✗' : '!'), text, help ? h('div', {class: 'muted small', style: {marginLeft: '20px'}}, help) : null);
  const agent = ua => { ua = String(ua || ''); const b = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Браузер' : '—'; const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''; return b + (o ? ' · ' + o : ''); };

  /* ---------- подключение 2FA (используется и на странице, и на экране принудительного включения) ---------- */
  AD.twoFaSetup = function (box, done) {
    const msg = h('div', {});
    const paint = (...kids) => box.replaceChildren(msg, ...kids);
    function start() {
      const btn = h('button', {class: 'btn primary', type: 'button'}, 'Начать подключение');
      btn.addEventListener('click', () => AD.busy(btn, async () => {
        try { const r = await AD.post('/api/2fa/begin'); step2(r); } catch (e) { msg.replaceChildren(AD.errBox(e)); }
      }));
      paint(h('p', {class: 'muted small'}, 'Понадобится приложение-аутентификатор на телефоне: Яндекс Ключ, Google Authenticator, Microsoft Authenticator, 2FAS, FreeOTP и т. п.'), btn);
    }
    function step2(r) {
      const code = h('input', {type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', placeholder: '123 456', 'aria-label': 'Шестизначный код', style: {fontSize: '20px', letterSpacing: '.16em', maxWidth: '200px'}});
      const btn = h('button', {class: 'btn primary', type: 'button'}, 'Подтвердить и включить');
      let qr = null; try { qr = window.QR.svg(r.uri, 192); } catch (e) {}
      btn.addEventListener('click', () => AD.busy(btn, async () => {
        msg.replaceChildren();
        try { const res = await AD.post('/api/2fa/confirm', {code: code.value}); AD.user.totp = true; step3(res.codes); }
        catch (e) { msg.replaceChildren(AD.errBox(e)); code.select(); }
      }));
      code.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
      paint(h('ol', {class: 'help', style: {paddingLeft: '20px', display: 'grid', gap: '6px'}}, h('li', {}, 'Откройте приложение-аутентификатор и добавьте новый аккаунт.'), h('li', {}, 'Отсканируйте QR-код ниже или введите ключ вручную.'), h('li', {}, 'Введите шестизначный код из приложения.')),
        h('div', {style: {display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', margin: '12px 0'}}, qr ? h('div', {style: {background: '#fff', padding: '6px', borderRadius: '10px', border: '1px solid var(--line)'}}, qr) : null,
          h('div', {}, h('div', {class: 'muted small'}, 'Ключ для ручного ввода (аккаунт ' + r.account + '):'), h('code', {class: 'mono', style: {fontSize: '15px', wordBreak: 'break-all'}}, r.secret), h('div', {style: {marginTop: '6px'}}, h('button', {class: 'btn sm', type: 'button', onclick: () => AD.copy(r.secret.replace(/\s/g, ''), 'Ключ скопирован')}, 'Скопировать ключ')))),
        fld('Код из приложения', code), h('div', {style: {marginTop: '10px'}}, btn));
      code.focus();
    }
    function step3(codes) {
      const text = 'Коды восстановления админки «Астрея». Каждый действует один раз.\n\n' + codes.join('\n') + '\n';
      const saved = h('input', {type: 'checkbox'}), fin = h('button', {class: 'btn primary', type: 'button', disabled: true}, 'Готово');
      saved.addEventListener('change', () => { fin.disabled = !saved.checked; }); fin.addEventListener('click', () => done && done());
      paint(AD.alertBox('ok', h('b', {}, 'Двухфакторный вход включён.'), ' Сохраните коды восстановления: если потеряете телефон, войти можно будет только с их помощью. Показаны один раз.'),
        h('div', {class: 'mono', style: {display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '6px 18px', margin: '12px 0', fontSize: '16px'}}, codes.map(c => h('span', {}, c))),
        h('div', {class: 'row'}, h('button', {class: 'btn sm', type: 'button', onclick: () => AD.copy(codes.join('\n'), 'Коды скопированы')}, 'Скопировать'), h('button', {class: 'btn sm', type: 'button', onclick: () => { const a = h('a', {href: URL.createObjectURL(new Blob([text], {type: 'text/plain'})), download: 'astreya-recovery-codes.txt'}); document.body.append(a); a.click(); a.remove(); }}, 'Скачать файлом')),
        h('label', {class: 'chk', style: {marginTop: '12px'}}, saved, 'Я сохранил(а) коды в надёжном месте'), h('div', {style: {marginTop: '10px'}}, fin));
    }
    start();
  };

  AD.views.security = {
    async mount(root) {
      const isAdmin = AD.user.role === 'admin', box = h('div', {});
      root.append(AD.pageHead('Безопасность', isAdmin ? 'Двухфакторный вход, сеансы, правила доступа и состояние защиты сайта и админки.' : 'Ваш вход: двухфакторная защита и открытые сеансы.'), box);
      async function load() {
        const [tf, ss, sec] = await Promise.all([AD.get('/api/2fa'), AD.get('/api/sessions' + (isAdmin ? '?all=1' : '')), isAdmin ? AD.get('/api/security') : null]);
        AD.user.totp = tf.enabled;
        /* --- 2FA --- */
        const setup = h('div', {}), c2 = h('div', {class: 'card'}, h('h2', {}, 'Двухфакторный вход'));
        if (tf.enabled) {
          const pw = h('input', {type: 'password', autocomplete: 'current-password', 'aria-label': 'Пароль'}), code = h('input', {type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '12', 'aria-label': 'Код'});
          const off = h('button', {class: 'btn danger', type: 'button', disabled: tf.required}, 'Отключить'), rec = h('button', {class: 'btn', type: 'button'}, 'Выпустить новые коды восстановления'), m = h('div', {});
          off.addEventListener('click', () => AD.busy(off, async () => { try { await AD.post('/api/2fa/disable', {password: pw.value, code: code.value}); AD.toast('Двухфакторный вход отключён'); load(); } catch (e) { m.replaceChildren(AD.errBox(e)); } }));
          rec.addEventListener('click', () => AD.busy(rec, async () => { m.replaceChildren(); try { const r = await AD.post('/api/2fa/recovery', {code: code.value}); const t = h('div', {}); AD.twoFaCodes(t, r.codes); m.replaceChildren(AD.alertBox('ok', 'Старые коды больше не действуют. Сохраните новые:'), t); } catch (e) { m.replaceChildren(AD.errBox(e)); } }));
          AD.fill(c2, h('h2', {}, 'Двухфакторный вход'), AD.alertBox('ok', 'Включён. Кодов восстановления осталось: ' + tf.recoveryLeft + (tf.recoveryLeft < 4 ? ' — выпустите новые.' : '.')),
            tf.required ? h('p', {class: 'help', style: {marginTop: '8px'}}, 'Политика безопасности делает 2FA обязательным для администраторов, поэтому отключить его нельзя.') : null,
            h('div', {class: 'grid2', style: {marginTop: '12px'}}, fld('Текущий код из приложения (или код восстановления)', code, 'Нужен, чтобы выпустить новые коды или отключить защиту.'), tf.required ? null : fld('Пароль (для отключения)', pw)), h('div', {class: 'row', style: {marginTop: '10px'}}, rec, tf.required ? null : off), m);
        } else {
          AD.fill(c2, h('h2', {}, 'Двухфакторный вход'), AD.alertBox('warn', 'Не включён. Войти можно только по паролю — если его украдут или подберут, доступ получит чужой человек.'), h('div', {style: {marginTop: '12px'}}, setup));
          AD.twoFaSetup(setup, load);
        }
        /* --- пароль --- */
        const cpw = h('div', {class: 'card'}, h('h2', {}, 'Пароль'), h('p', {class: 'muted small'}, 'Не короче 12 символов, буквы и цифры, не из списка популярных. После смены остальные сеансы завершаются.'), h('div', {style: {marginTop: '10px'}}, h('button', {class: 'btn', type: 'button', onclick: () => AD.changePasswordDialog()}, 'Сменить пароль')));
        /* --- сеансы --- */
        const revokeBtn = h('button', {class: 'btn sm', type: 'button'}, 'Завершить все остальные'), mine = ss.items.filter(x => x.userId === AD.user.id);
        revokeBtn.addEventListener('click', async () => { if (!await AD.confirm('Завершить все ваши сеансы, кроме этого?', {ok: 'Завершить', danger: false})) return; await AD.busy(revokeBtn, async () => { const r = await AD.post('/api/sessions/revoke-others'); AD.toast('Завершено сеансов: ' + r.revoked, 'ok'); load(); }); });
        const rows = ss.items.map(s => h('tr', {}, h('td', {dataset: {l: 'Кто'}}, h('b', {}, s.login), s.current ? h('span', {class: 'pill new', style: {marginLeft: '6px'}}, 'этот') : null), h('td', {dataset: {l: 'Устройство'}}, agent(s.ua)), h('td', {class: 'mono', dataset: {l: 'Адрес'}}, s.ip || '—'), h('td', {dataset: {l: 'Вход'}}, AD.fmt(s.created)), h('td', {dataset: {l: 'Активность'}}, AD.ago(s.seen)),
          h('td', {}, s.current ? null : h('button', {class: 'btn sm danger', type: 'button', onclick: async e => { await AD.busy(e.currentTarget, async () => { try { await AD.del('/api/sessions/' + s.id); AD.toast('Сеанс завершён', 'ok'); load(); } catch (x) { AD.toast(x.message, 'err'); } }); }}, 'Завершить'))));
        const c3 = h('div', {class: 'card'}, h('h2', {}, isAdmin ? 'Открытые сеансы (все пользователи)' : 'Мои сеансы'), h('p', {class: 'muted small'}, 'Если видите незнакомое устройство или адрес — завершите сеанс и смените пароль.'),
          h('div', {class: 'tbl-wrap', style: {marginTop: '8px'}}, h('table', {class: 'tbl cards'}, h('thead', {}, h('tr', {}, ['Кто', 'Устройство', 'Адрес', 'Вход', 'Активность', ''].map(t => h('th', {}, t)))), h('tbody', {}, rows))), mine.length > 1 ? h('div', {style: {marginTop: '10px'}}, revokeBtn) : null);
        const parts = [c2, cpw, c3];
        if (isAdmin) parts.push(...adminParts(sec));
        AD.fill(box, parts);
      }
      /* --- политика и состояние (администратор) --- */
      function adminParts(sec) {
        const pol = JSON.parse(JSON.stringify(sec.policy)), m = h('div', {});
        const chk = (key, text) => { const c = h('input', {type: 'checkbox', checked: !!pol[key], onchange: () => { pol[key] = c.checked; }}); return h('label', {class: 'chk'}, c, text); };
        const num = (key, attrs) => { const i = h('input', Object.assign({type: 'number', value: String(pol[key]), oninput: () => { pol[key] = +i.value; }}, attrs)); return i; };
        const ips = h('textarea', {rows: '4', placeholder: '203.0.113.5\n198.51.100.0/24', 'aria-label': 'Разрешённые адреса', oninput: () => { pol.ipAllowlist = ips.value.split(/[\s,;]+/).filter(Boolean); }}); ips.value = pol.ipAllowlist.join('\n');
        const save = h('button', {class: 'btn primary', type: 'button'}, 'Сохранить правила');
        save.addEventListener('click', () => AD.busy(save, async () => { m.replaceChildren(); try { await AD.put('/api/security', pol); AD.toast('Правила безопасности сохранены', 'ok'); load(); } catch (e) { m.replaceChildren(AD.errBox(e)); } }));
        const card = h('div', {class: 'card'}, h('h2', {}, 'Правила доступа'), m,
          h('div', {style: {display: 'grid', gap: '12px'}}, chk('require2fa', 'Двухфакторный вход обязателен для всех администраторов (тот, у кого его нет, при следующем входе обязан включить)' + (sec.policy.require2faEnv ? ' — сейчас значение задано переменной REQUIRE_2FA на сервере и главнее этой галочки' : '')), chk('loginAlerts', 'Записывать в журнал неудачные входы и блокировки')),
          h('div', {class: 'grid2', style: {marginTop: '12px'}}, fld('Максимальная длительность сеанса, часов', num('sessionHours', {min: '1', max: '72', step: '1'}), 'Через столько часов войти придётся заново.'), fld('Выход при бездействии, часов', num('idleHours', {min: '0.25', max: '24', step: '0.25'}), 'Если ничего не нажимать — сеанс закроется.')),
          h('div', {style: {marginTop: '12px'}}, fld('Доступ в админку только с этих адресов (по одному в строке)', ips, 'Пусто — доступ с любого адреса (защита: пароль и 2FA). Можно указывать сети: 203.0.113.0/24. Ваш адрес сейчас: ' + sec.you.ip + '. Заявки с сайта и чат не ограничиваются. Если закроете себе доступ — задайте на сервере ADMIN_IP_ALLOW_DISABLE=1 и перезапустите его.'),
            h('button', {class: 'btn sm', type: 'button', onclick: () => { if (!pol.ipAllowlist.includes(sec.you.ip)) { pol.ipAllowlist.push(sec.you.ip); ips.value = pol.ipAllowlist.join('\n'); } }}, 'Добавить мой адрес')),
          sec.policy.ipOverride ? AD.alertBox('warn', 'Сейчас список адресов отключён переменной ADMIN_IP_ALLOW_DISABLE=1.') : null, h('div', {style: {marginTop: '12px'}}, save));
        const v = sec.vault, s = sec.server, u = sec.users, a = sec.activity;
        const sealBtn = h('button', {class: 'btn sm', type: 'button'}, 'Зашифровать сейчас');
        sealBtn.addEventListener('click', () => AD.busy(sealBtn, async () => { try { await AD.post('/api/security/seal'); AD.toast('Секреты зашифрованы', 'ok'); load(); } catch (e) { AD.toast(e.message, 'err'); } }));
        const state = h('div', {class: 'card'}, h('h2', {}, 'Состояние защиты'), h('ul', {class: 'help', style: {listStyle: 'none', padding: '0', margin: '8px 0 0', display: 'grid', gap: '8px'}},
          ok(s.https, s.https ? 'Соединение с админкой защищено (https)' : 'Соединение не защищено: пароли можно перехватить', s.https ? '' : 'Включите https на сервере (Caddy / nginx + сертификат) и SECURE_COOKIES=1 или TRUST_PROXY=1.'),
          ok(u.without2fa.length === 0, u.without2fa.length ? 'Администраторы без 2FA: ' + u.without2fa.join(', ') : 'У всех администраторов включён 2FA'),
          ok(u.temporaryPasswords.length === 0, u.temporaryPasswords.length ? 'Не сменили временный пароль: ' + u.temporaryPasswords.join(', ') : 'Временных паролей нет'),
          ok(v.enabled ? (v.plain === 0) : null, v.enabled ? (v.plain ? 'Часть секретов ещё в открытом виде (' + v.plain + ')' : 'Секреты (токены, ключи) шифруются на диске') : 'Секреты лежат на диске без шифрования (файл доступен только владельцу)', v.enabled ? null : (v.keyShort ? 'DATA_KEY короче 16 символов — шифрование не включено.' : 'Задайте DATA_KEY (фраза от 16 символов) в настройках запуска сервера.')),
          v.broken ? ok(false, 'Зашифрованные секреты не читаются: нет ключа DATA_KEY или он другой') : null,
          ok(s.trustProxy ? (s.proxyHops >= 1) : null, s.trustProxy ? 'Адрес клиента берётся из X-Forwarded-For (доверенных прокси: ' + s.proxyHops + ')' : 'Прокси не используется: адрес клиента — адрес соединения'),
          ok(sec.policy.ipAllowlist.length > 0 ? true : null, sec.policy.ipAllowlist.length ? 'Админка открыта только с ' + sec.policy.ipAllowlist.length + ' адресов/сетей' : 'Админка открыта с любого адреса'),
          ok(true, 'За последние 24 часа: входов ' + a.logins24h + ', неудачных ' + a.failedLogins24h + ', блокировок ' + a.lockouts24h + (a.deniedByIp24h ? ', отказов по адресу ' + a.deniedByIp24h : '')),
          ok(sec.lastBackup ? true : null, sec.lastBackup ? 'Последняя резервная копия: ' + AD.fmt(sec.lastBackup) : 'Резервных копий ещё нет (раздел «Копии»)')),
          v.enabled && v.plain ? h('div', {style: {marginTop: '10px'}}, sealBtn) : null);
        const prot = h('div', {class: 'card'}, h('h2', {}, 'Что защищает сайт и админку'), h('ul', {class: 'hl'}, sec.protections.map(t => h('li', {}, h('span', {class: 'lvl info'}), h('span', {}, t)))), h('p', {class: 'muted small', style: {marginTop: '8px'}}, 'Версия Node.js на сервере: ' + s.node + '. Рекомендуется поддерживаемая LTS-версия.'));
        return [card, state, prot];
      }
      AD.twoFaCodes = (t, codes) => { const text = codes.join('\n'); AD.fill(t, h('div', {class: 'mono', style: {display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '6px 18px', margin: '10px 0', fontSize: '16px'}}, codes.map(c => h('span', {}, c))), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.copy(text, 'Коды скопированы')}, 'Скопировать')); };
      await load(); return {};
    }
  };
})();
