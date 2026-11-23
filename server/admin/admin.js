/* Админка «Астрея» — ядро: запросы к серверу, окна, уведомления, вход, каркас и переходы между разделами.
   Разделы подключаются отдельными файлами (leads.js, content.js, system.js) и регистрируются в AD.views. */
(function () {
  'use strict';
  const AD = window.AD = {views: {}, user: null, csrf: '', config: null, dirty: false, cur: null, _guards: new Set()};

  /* ---------- DOM-помощники (данные сервера вставляются только как текст — без innerHTML) ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k of Object.keys(attrs || {})) {
      const v = attrs[k]; if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(n => { if (n.startsWith('--')) el.style.setProperty(n, v[n]); else el.style[n] = v[n]; });
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'for') el.setAttribute('for', v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly' || k === 'hidden') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    kids.flat(Infinity).forEach(c => { if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ICONS = {
    inbox: 'M3 13l2-8h14l2 8M3 13v6h18v-6M3 13h5l1 3h6l1-3h5', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01', upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 16v4h16v-4', gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12a7 7 0 00.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
    users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 4.3a3.5 3.5 0 010 6.4M17.5 14.7c2.3.5 3.7 2.4 4 5.3', list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01', globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
    dash: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z', rocket: 'M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9zM9 15l-3 4 3-1M15 15l3 4-3-1M12 9.5h.01', shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3zM9 12l2 2 4-4', plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0V8zM12 17v4', archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3M12 15v2', pages: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6', palette: 'M12 3a9 9 0 100 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4-4-8-9-8zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01', eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5', text: 'M4 6h16M4 12h10M4 18h14', news: 'M5 4h12v16H7a2 2 0 01-2-2V4zM17 8h3v10a2 2 0 01-2 2M8 8h6M8 12h6M8 16h4', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 005 5L16 12l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 013-2z', menu: 'M4 7h16M4 12h16M4 17h16', tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01', hist: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2', store: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9a3 3 0 006 0 3 3 0 006 0 3 3 0 004 0M9 20v-6h6v6', cap: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5', box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8'
  };
  const ico = n => { const s = document.createElementNS(SVG_NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', ICONS[n] || ''); s.append(p); return s; };
  /* замена содержимого элемента: принимает узлы, строки, вложенные массивы; null/false пропускаются */
  const fill = (el, ...kids) => { const out = kids.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false).map(c => c.nodeType ? c : document.createTextNode(String(c))); el.replaceChildren(...out); return el; };
  Object.assign(AD, {h, $, $$, ico, fill});

  /* ---------- форматирование ---------- */
  const pad = n => String(n).padStart(2, '0');
  AD.fmt = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  AD.plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; };
  AD.ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (isNaN(s)) return ''; if (s < 60) return 'только что'; if (s < 3600) { const m = Math.floor(s / 60); return m + ' мин назад'; } if (s < 86400) { const x = Math.floor(s / 3600); return x + ' ' + AD.plural(x, 'час', 'часа', 'часов') + ' назад'; } return AD.fmt(iso); };
  AD.size = n => n < 1024 ? n + ' Б' : n < 1048576 ? (n / 1024).toFixed(0) + ' КБ' : (n / 1048576).toFixed(1) + ' МБ';
  AD.safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? u : null;                 // в href попадают только http(s)-адреса

  /* ---------- уведомления, окна ---------- */
  let toastBox = null;
  AD.toast = function (msg, kind, ms) {
    if (!toastBox) { toastBox = h('div', {class: 'toasts', role: 'status', 'aria-live': 'polite'}); document.body.append(toastBox); }
    const t = h('div', {class: 'toast' + (kind ? ' ' + kind : '')}, msg); toastBox.append(t);
    setTimeout(() => t.remove(), ms || (kind === 'err' ? 7000 : 3500));
  };
  AD.modal = function (o) {
    const body = h('div', {class: 'body'}, o.body), footer = o.footer ? h('footer', {}, o.footer) : null, prev = document.activeElement;
    const dlg = h('div', {class: 'dlg ' + (o.cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || ''}, h('header', {}, h('h2', {}, o.title || ''), h('button', {class: 'btn ghost icon', type: 'button', 'aria-label': 'Закрыть', onclick: () => close()}, '✕')), body, footer);
    const ov = h('div', {class: 'overlay' + (o.side ? ' side-r' : '')}, dlg);
    let closed = false; if (o.isDirty) AD._guards.add(o.isDirty);
    const key = e => { if (e.key === 'Escape' && ov === lastOverlay()) { e.stopPropagation(); close(); } };
    const lastOverlay = () => { const a = $$('.overlay'); return a[a.length - 1]; };
    function close(force) { if (closed) return; if (!force && o.beforeClose && o.beforeClose() === false) return; closed = true; if (o.isDirty) AD._guards.delete(o.isDirty); document.removeEventListener('keydown', key, true); ov.remove(); if (prev && prev.focus) try { prev.focus(); } catch (e) {} if (o.onClose) o.onClose(); }
    if (!o.sticky) ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', key, true);
    document.body.append(ov);
    const f = $('input,textarea,select,button.primary', body); (f || $('button', dlg)).focus();
    return {el: ov, dlg, body, footer, close};
  };
  AD.confirm = (text, o) => new Promise(res => {
    o = o || {}; let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const m = AD.modal({title: o.title || 'Подтверждение', body: h('p', {}, text), cls: '', onClose: () => fin(false), footer: [
      h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, o.cancel || 'Отмена'),
      h('button', {class: 'btn ' + (o.danger === false ? 'primary' : 'danger'), type: 'button', onclick: () => { fin(true); m.close(); }}, o.ok || 'Удалить')]});
  });
  AD.busy = async function (btn, fn) {
    if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
  };
  AD.copy = async function (text, msg) {
    try { await navigator.clipboard.writeText(text); } catch (e) { const t = h('textarea', {style: {position: 'fixed', opacity: 0}}, text); document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (x) {} t.remove(); }
    AD.toast(msg || 'Скопировано');
  };
  AD.alertBox = (kind, ...kids) => h('div', {class: 'alert ' + kind, role: kind === 'err' ? 'alert' : 'status'}, ...kids);
  /* текст ошибки сервера (с перечнем проблем, если есть) */
  AD.errBox = e => AD.alertBox('err', h('b', {}, e.message || 'Ошибка'), e.data && Array.isArray(e.data.problems) && e.data.problems.length ? h('ul', {}, e.data.problems.slice(0, 12).map(p => h('li', {}, p))) : null);

  /* ---------- запросы ---------- */
  AD.api = async function (method, url, body) {
    const headers = {Accept: 'application/json'}; let payload;
    if (AD.csrf && method !== 'GET') headers['X-CSRF-Token'] = AD.csrf;
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let r;
    try { r = await fetch(url, {method, headers, body: payload, credentials: 'same-origin', cache: 'no-store'}); }
    catch (e) { throw Object.assign(new Error('Нет связи с сервером. Проверьте интернет и повторите.'), {status: 0}); }
    let data = null; if ((r.headers.get('content-type') || '').includes('json')) { try { data = await r.json(); } catch (e) {} }
    if (!r.ok) {
      if (r.status === 401 && url !== '/api/login' && url !== '/api/me') AD.sessionLost();
      throw Object.assign(new Error((data && (data.error || data.message)) || 'Ошибка ' + r.status), {status: r.status, data});
    }
    return data;
  };
  AD.get = u => AD.api('GET', u); AD.post = (u, b) => AD.api('POST', u, b === undefined ? {} : b); AD.put = (u, b) => AD.api('PUT', u, b); AD.patch = (u, b) => AD.api('PATCH', u, b); AD.del = u => AD.api('DELETE', u);

  /* ---------- вход, смена пароля ---------- */
  function clearIntervals() { (AD.timers || []).forEach(clearInterval); AD.timers = []; }
  AD.sessionLost = function () { if (AD.loggedOut) return; AD.loggedOut = true; AD.user = null; AD.csrf = ''; clearIntervals(); AD.dirty = false; showLogin('Сессия истекла. Войдите снова.'); };
  /* логотип сайта (вектор из src/partials/logo-defs.html, он вставлен в index.html как #logo-art); цвет надписи — через --lm */
  const logoNode = cls => { const sv = document.createElementNS(SVG_NS, 'svg'); sv.setAttribute('viewBox', '46 338 836 436'); sv.setAttribute('class', 'brand-logo' + (cls ? ' ' + cls : '')); sv.setAttribute('aria-hidden', 'true'); const us = document.createElementNS(SVG_NS, 'use'); us.setAttribute('href', '#logo-art'); sv.append(us); return sv; };
  function loginScreen(kids) { const app = $('#app'); app.replaceChildren(h('div', {class: 'login-wrap'}, h('div', {class: 'login'}, h('div', {class: 'brand brand-login'}, logoNode('dark'), h('small', {}, 'Административная панель')), ...kids))); }
  function showLogin(msg) {
    document.title = 'Вход — Админка Астрея';
    const err = h('div', {hidden: true}), login = h('input', {type: 'text', id: 'f-login', name: 'login', autocomplete: 'username', required: true, autocapitalize: 'none', spellcheck: 'false'}), pw = h('input', {type: 'password', id: 'f-pass', name: 'password', autocomplete: 'current-password', required: true});
    const btn = h('button', {class: 'btn primary', type: 'submit'}, 'Войти');
    const form = h('form', {novalidate: true, onsubmit: async e => {
      e.preventDefault(); err.hidden = true;
      if (!login.value.trim() || !pw.value) { err.replaceChildren(AD.alertBox('err', 'Введите логин и пароль.')); err.hidden = false; return; }
      await AD.busy(btn, async () => {
        try { const r = await AD.api('POST', '/api/login', {login: login.value.trim(), password: pw.value}); if (r.need2fa) { show2fa(r.ticket); return; } AD.user = r.user; AD.csrf = r.csrf; AD.loggedOut = false; await afterLogin(); }
        catch (x) { err.replaceChildren(AD.alertBox('err', x.message)); err.hidden = false; pw.value = ''; pw.focus(); }
      });
    }}, msg ? AD.alertBox('warn', msg) : null, err, h('div', {class: 'field'}, h('label', {for: 'f-login'}, 'Логин'), login), h('div', {class: 'field'}, h('label', {for: 'f-pass'}, 'Пароль'), pw), btn);
    loginScreen([h('h1', {}, 'Вход'), h('p', {class: 'muted small'}, 'Заявки с сайта, тексты, каталог и новости.'), form]);
    login.focus();
  }
  /* второй шаг входа: код из приложения-аутентификатора или код восстановления */
  function show2fa(ticket) {
    document.title = 'Код подтверждения — Админка Астрея';
    const err = h('div', {hidden: true}), code = h('input', {type: 'text', id: 'f-code', name: 'code', autocomplete: 'one-time-code', inputmode: 'text', required: true, autocapitalize: 'none', spellcheck: 'false', maxlength: '12', placeholder: '123 456', style: {fontSize: '22px', letterSpacing: '.18em', textAlign: 'center'}});
    const btn = h('button', {class: 'btn primary', type: 'submit'}, 'Подтвердить');
    const form = h('form', {novalidate: true, onsubmit: async e => {
      e.preventDefault(); err.hidden = true; if (!code.value.trim()) return;
      await AD.busy(btn, async () => {
        try { const r = await AD.api('POST', '/api/login/2fa', {ticket, code: code.value.trim()}); AD.user = r.user; AD.csrf = r.csrf; AD.loggedOut = false; await afterLogin(); if (r.usedRecovery) AD.toast('Вы вошли по коду восстановления. Выпустите новые коды в разделе «Безопасность».', 'err', 12000); }
        catch (x) { err.replaceChildren(AD.alertBox('err', x.message)); err.hidden = false; code.value = ''; code.focus(); if (/истекло|Войдите заново/.test(x.message)) setTimeout(() => showLogin(x.message), 1200); }
      });
    }}, err, h('div', {class: 'field'}, h('label', {for: 'f-code'}, 'Код из приложения'), code, h('div', {class: 'help'}, 'Шесть цифр из приложения-аутентификатора. Потеряли телефон — введите один из кодов восстановления (вида abcd-1234).')), btn);
    loginScreen([h('h1', {}, 'Подтверждение входа'), h('p', {class: 'muted small'}, 'Пароль принят. Остался второй шаг.'), form, h('button', {class: 'btn ghost sm', type: 'button', style: {marginTop: '10px'}, onclick: () => showLogin()}, 'Назад')]);
    code.focus();
  }
  /* политика безопасности требует 2FA от администратора, а он ещё не включён: пока не включит, дальше не пускаем */
  function showForced2fa() {
    document.title = 'Двухфакторный вход — Админка Астрея';
    const holder = h('div', {});
    loginScreen([h('h1', {}, 'Включите двухфакторный вход'), AD.alertBox('info', 'Политика безопасности сайта требует второй фактор для администраторов: даже украденный пароль не даст доступа к заявкам и сайту.'), holder, h('button', {class: 'btn ghost sm', type: 'button', style: {marginTop: '10px'}, onclick: () => AD.logout()}, 'Выйти')]);
    AD.twoFaSetup(holder, () => { AD.needs2fa = false; afterLogin(); });
  }
  function passwordForm(forced, done) {
    const o = h('input', {type: 'password', id: 'p-old', autocomplete: 'current-password', required: true}), n = h('input', {type: 'password', id: 'p-new', autocomplete: 'new-password', required: true}), n2 = h('input', {type: 'password', id: 'p-new2', autocomplete: 'new-password', required: true});
    const err = h('div', {hidden: true}), btn = h('button', {class: 'btn primary', type: 'submit'}, 'Сменить пароль');
    const form = h('form', {novalidate: true, style: {display: 'flex', flexDirection: 'column', gap: '14px'}, onsubmit: async e => {
      e.preventDefault(); err.hidden = true; const bad = m => { err.replaceChildren(AD.alertBox('err', m)); err.hidden = false; };
      if (n.value !== n2.value) return bad('Новый пароль и повтор не совпадают.');
      await AD.busy(btn, async () => { try { await AD.post('/api/password', {old: o.value, new: n.value}); AD.toast('Пароль изменён', 'ok'); AD.user.mustChange = false; done(); } catch (x) { bad(x.message); } });
    }}, forced ? AD.alertBox('info', 'Первый вход: задайте свой пароль. Не короче 12 символов, буквы и цифры, не из списка популярных.') : h('p', {class: 'muted small'}, 'Не короче 12 символов, буквы и цифры, без логина внутри. Остальные ваши сеансы будут завершены.'), err,
      h('div', {class: 'field'}, h('label', {for: 'p-old'}, forced ? 'Временный пароль' : 'Текущий пароль'), o), h('div', {class: 'field'}, h('label', {for: 'p-new'}, 'Новый пароль'), n), h('div', {class: 'field'}, h('label', {for: 'p-new2'}, 'Повторите новый пароль'), n2), btn);
    return {form, focus: () => o.focus()};
  }
  function showForcedPassword() {
    document.title = 'Смена пароля — Админка Астрея';
    const f = passwordForm(true, () => afterLogin());
    loginScreen([h('h1', {}, 'Смена пароля'), f.form, h('button', {class: 'btn ghost sm', type: 'button', style: {marginTop: '10px'}, onclick: () => AD.logout()}, 'Выйти')]); f.focus();
  }
  AD.changePasswordDialog = function () { const f = passwordForm(false, () => m.close()); const m = AD.modal({title: 'Смена пароля', body: f.form}); };
  AD.logout = async function () {
    if (AD.dirty && !confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
    try { await AD.post('/api/logout'); } catch (e) {}
    AD.user = null; AD.csrf = ''; AD.dirty = false; clearIntervals(); AD.loggedOut = true; showLogin();
  };

  /* ---------- каркас и разделы ---------- */
  /* меню: группы по смыслу; editor — редактор содержимого (без безопасности, пользователей и настроек), manager — только заявки */
  const GROUPS = [{id: 'main', title: 'Главное'}, {id: 'content', title: 'Контент'}, {id: 'media', title: 'Медиа'}, {id: 'publish', title: 'Публикация'}, {id: 'system', title: 'Система'}];
  const ADM = ['admin'], EDT = ['admin', 'editor'];
  const NAV = [
    {g: 'main', id: 'overview', title: 'Обзор', icon: 'dash', roles: EDT}, {g: 'main', id: 'leads', title: 'Заявки', icon: 'inbox', roles: ['admin', 'manager']},
    {g: 'content', id: 'texts', title: 'Тексты страниц', icon: 'text', roles: EDT}, {g: 'content', id: 'news', title: 'Новости и газета', icon: 'news', roles: EDT}, {g: 'content', id: 'products', title: 'Товары и витрина', icon: 'box', roles: EDT}, {g: 'content', id: 'brands', title: 'Бренды', icon: 'tag', roles: EDT},
    {g: 'content', id: 'events', title: 'Мероприятия и обучение', icon: 'cap', roles: EDT}, {g: 'content', id: 'contacts', title: 'Контакты и реквизиты', icon: 'phone', roles: EDT}, {g: 'content', id: 'menu', title: 'Меню', icon: 'menu', roles: EDT},
    {g: 'content', id: 'pages', title: 'Свои страницы', icon: 'pages', roles: EDT}, {g: 'content', id: 'content', title: 'Все данные сайта', icon: 'edit', roles: EDT},
    {g: 'media', id: 'files', title: 'Картинки', icon: 'image', roles: EDT},
    {g: 'publish', id: 'preview', title: 'Предпросмотр', icon: 'eye', roles: EDT}, {g: 'publish', id: 'publish', title: 'Опубликовать', icon: 'upload', roles: EDT}, {g: 'publish', id: 'history', title: 'История и откат', icon: 'hist', roles: EDT}, {g: 'publish', id: 'backups', title: 'Копии данных', icon: 'archive', roles: ADM},
    {g: 'system', id: 'settings', title: 'Настройки', icon: 'gear', roles: ADM}, {g: 'system', id: 'integrations', title: 'Интеграции', icon: 'plug', roles: ADM}, {g: 'system', id: 'users', title: 'Пользователи', icon: 'users', roles: ADM}, {g: 'system', id: 'security', title: 'Безопасность', icon: 'shield', roles: ['admin', 'manager', 'editor']},
    {g: 'system', id: 'audit', title: 'Журнал', icon: 'list', roles: ADM}, {g: 'system', id: 'privacy', title: 'Персональные данные', icon: 'lock', roles: ADM}, {g: 'system', id: 'launch', title: 'Запуск', icon: 'rocket', roles: ADM},
    {g: 'hidden', id: 'design', title: 'Оформление (служебный)', icon: 'palette', roles: ADM, hide: true}, {g: 'hidden', id: 'brandprods', title: 'Товары по брендам (прежний вид)', icon: 'box', roles: ADM, hide: true}
  ];
  AD.setBadge = n => { $$('.nav .badge').forEach(b => { b.textContent = n; b.hidden = !n; }); document.title = (n ? '(' + n + ') ' : '') + 'Админка — Астрея'; };
  AD.pollNew = async function () { try { const s = await AD.get('/api/leads/stats'); AD.setBadge(s.new); AD.stats = s; } catch (e) {} };

  async function afterLogin() {
    try { const me = await AD.api('GET', '/api/me'); AD.user = me.user; AD.csrf = me.csrf; AD.needs2fa = !!me.needs2fa; } catch (e) { return showLogin(e.message); }
    if (AD.user.mustChange) return showForcedPassword();
    if (AD.needs2fa) return showForced2fa();
    try { AD.config = await AD.get('/api/config'); } catch (e) { return showLogin(e.message); }
    mountShell();
  }
  function mountShell() {
    const items = NAV.filter(n => n.roles.includes(AD.user.role) && AD.views[n.id]);          // разделов, которых нет в этой сборке (демо-файл), в меню нет
    const navLink = n => h('a', {class: 'nav', href: '#/' + n.id, dataset: {id: n.id}}, ico(n.icon), n.title, n.id === 'leads' ? h('span', {class: 'badge', hidden: true}) : null);
    const groups = GROUPS.map((g, gi) => { const list = items.filter(n => n.g === g.id && !n.hide); return list.length ? [h('div', {class: 'nav-h'}, g.title), list.map(navLink)] : null; });
    const side = h('nav', {class: 'side', 'aria-label': 'Разделы'}, h('div', {class: 'brand'}, h('div', {class: 'brand-t'}, logoNode(), h('small', {}, 'Административная панель'))),
      h('button', {class: 'nav pal-btn', type: 'button', id: 'pal-open', onclick: () => { document.body.classList.remove('nav-open'); AD.openPalette(); }}, ico('search'), 'Поиск', h('span', {class: 'kbd', 'aria-hidden': 'true'}, 'Ctrl K')),
      groups,
      h('div', {class: 'sep'}), h('a', {class: 'nav', href: AD.config.siteUrl || '/', target: '_blank', rel: 'noopener'}, ico('globe'), 'Открыть сайт'),
      h('div', {class: 'who'}, h('div', {}, h('b', {}, AD.user.name && AD.user.name !== ((AD.config.roles || {})[AD.user.role]) ? AD.user.name : AD.user.login), h('br'), (AD.config.roles || {})[AD.user.role] || AD.user.role), h('button', {class: 'btn sm', type: 'button', onclick: () => AD.changePasswordDialog()}, 'Сменить пароль'), h('button', {class: 'btn sm', type: 'button', id: 'logout', onclick: () => AD.logout()}, 'Выйти')));
    const top = h('div', {class: 'topbar'}, h('button', {type: 'button', 'aria-label': 'Меню', onclick: () => document.body.classList.toggle('nav-open')}, '☰'), 'Астрея · админка');
    const main = h('main', {class: 'main', id: 'view', tabindex: '-1'});
    $('#app').replaceChildren(h('div', {}, top, h('div', {class: 'shell'}, side, main), h('div', {class: 'scrim', onclick: () => document.body.classList.remove('nav-open')})));
    side.addEventListener('click', e => { if (e.target.closest('a.nav')) document.body.classList.remove('nav-open'); });
    AD.cur = null; AD.pollNew(); AD.timers = [setInterval(() => { if (!document.hidden) AD.pollNew(); }, 60000)];
    route();
  }
  const home = () => (AD.user && AD.user.role !== 'manager' ? 'overview' : 'leads');
  function parseHash() { const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } }); return {id: p[0] || home(), parts: p.slice(1)}; }
  let lastHash = location.hash, reverting = false;
  function route() {
    if (!AD.user || AD.user.mustChange) return;
    const {id: want, parts} = parseHash(), allowed = NAV.filter(n => n.roles.includes(AD.user.role) && AD.views[n.id]).map(n => n.id), id = allowed.includes(want) ? want : home();
    if (id !== want) { history.replaceState(null, '', '#/' + id); }
    $$('.side a.nav').forEach(a => a.classList.toggle('on', a.dataset.id === id));
    const root = $('#view'); if (!root) return;
    if (AD.cur && AD.cur.id === id && AD.cur.inst && AD.cur.inst.onRoute) { AD.cur.inst.onRoute(parts); return; }
    if (AD.cur && AD.cur.inst && AD.cur.inst.destroy) AD.cur.inst.destroy();
    AD.dirty = false; AD.saveHook = null; root.replaceChildren(); window.scrollTo(0, 0);
    const v = AD.views[id]; AD.cur = {id, inst: null}; const cur = AD.cur;
    if (!v) { root.replaceChildren(AD.alertBox('info', 'Этот раздел недоступен в данной версии админки.')); return; }
    Promise.resolve(v.mount(root, parts)).then(inst => { cur.inst = inst || null; if (cur === AD.cur && inst && inst.onRoute && parts.length && !inst.initial) inst.onRoute(parts); })
      .catch(e => { if (cur === AD.cur) root.replaceChildren(AD.errBox(e)); });
  }
  window.addEventListener('hashchange', () => {
    if (reverting) { reverting = false; lastHash = location.hash; return; }
    if (AD.dirty && AD.cur && AD.cur.id !== parseHash().id && !confirm('Есть несохранённые изменения. Уйти без сохранения?')) { reverting = true; location.hash = lastHash; return; }
    lastHash = location.hash; route();
  });
  /* Ctrl+S (⌘S) сохраняет открытый раздел, если он зарегистрировал AD.saveHook */
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') && AD.user) { const ovs = $$('.overlay'), top = ovs[ovs.length - 1], pb = top && $('footer .btn.primary', top); if (pb) { e.preventDefault(); if (!pb.disabled) pb.click(); } else if (typeof AD.saveHook === 'function') { e.preventDefault(); AD.saveHook(); } } });
  window.addEventListener('beforeunload', e => { if (AD.dirty || Array.from(AD._guards).some(g => { try { return g(); } catch (x) { return false; } })) { e.preventDefault(); e.returnValue = ''; } });

  AD.start = async function () {
    try { const r = await AD.api('GET', '/api/me'); AD.user = r.user; AD.csrf = r.csrf; AD.needs2fa = !!r.needs2fa; await afterLogin(); }
    catch (e) { showLogin(e.status === 401 || !e.status ? '' : e.message); }
  };
  AD.go = hash => { location.hash = hash; };
  AD.previewUrl = p => '/' + p;                       // адрес страницы сайта для рамки предпросмотра (демо-версия подменяет)
  /* ---------- черновики форм в браузере: правки не теряются при случайном закрытии вкладки; localStorage может быть недоступен — тогда просто без черновиков ---------- */
  AD.drafts = {
    key: (kind, id) => 'ad.draft.' + kind + '.' + id,
    get(k) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && v.d ? v : null; } catch (e) { return null; } },
    set(k, d) { try { localStorage.setItem(k, JSON.stringify({at: Date.now(), d})); } catch (e) {} },
    clear(k) { try { localStorage.removeItem(k); } catch (e) {} },
    /* автосохранение черновика при вводе: state() возвращает данные, если есть несохранённые правки, иначе null */
    watch(el, k, state) { let t = null; const save = () => { clearTimeout(t); t = setTimeout(() => { const d = state(); if (d) AD.drafts.set(k, d); else AD.drafts.clear(k); }, 500); }; el.addEventListener('input', save); el.addEventListener('change', save); el.addEventListener('click', e => { if (e.target.closest('button')) save(); }); },
    /* плашка «найден черновик» с кнопками; restore(данные) открывает форму с черновиком */
    banner(k, restore) { const v = AD.drafts.get(k); if (!v) return null; return h('div', {class: 'draft-note'}, h('span', {}, 'Найден несохранённый черновик от ' + AD.fmt(new Date(v.at).toISOString()) + '.'), h('button', {class: 'btn sm primary', type: 'button', onclick: () => restore(v.d)}, 'Восстановить'), h('button', {class: 'btn sm', type: 'button', onclick: e => { AD.drafts.clear(k); e.currentTarget.closest('.draft-note').hidden = true; }}, 'Отбросить')); },
    /* beforeClose для окна: спрашивает, если есть правки, и стирает черновик при согласии потерять */
    guard(k, dirty) { return () => { if (!dirty()) { AD.drafts.clear(k); return true; } if (confirm('Закрыть без сохранения? Изменения будут потеряны.')) { AD.drafts.clear(k); return true; } return false; }; }
  };
  /* общий заголовок страницы */
  AD.pageHead = (title, sub, ...actions) => {
    const n = AD.cur && NAV.find(x => x.id === AD.cur.id), gi = n ? GROUPS.findIndex(g => g.id === n.g) : -1;
    return h('div', {class: 'page-h'}, gi >= 0 ? h('div', {class: 'eyebrow'}, GROUPS[gi].title) : null, h('h1', {}, title), h('div', {class: 'right row'}, actions), sub ? h('p', {class: 'sub'}, sub) : null);
  };
  AD.NAV = NAV; AD.GROUPS = GROUPS;
})();
