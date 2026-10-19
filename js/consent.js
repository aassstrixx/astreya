/* Согласие на cookie и аналитика: уведомление, хранение выбора, запуск «Яндекс Метрики» только когда это разрешено, «виртуальные» просмотры при переходах без перезагрузки.
   Настройки приходят из data/integrations.json (админка → «Интеграции»). Режимы:
     optin  — аналитика включается только после «Принять» (по умолчанию, самый осторожный);
     notice — аналитика работает, пока посетитель не откажется; Вебвизор — только после «Принять»;
     off    — уведомления нет (допустимо, только если аналитики нет).
   Уведомление — небольшая карточка в верхнем углу под шапкой (внизу экрана ничего не показываем). */
(function () {
  'use strict';
  const A = window.Astreya; if (!A) return;
  const D = window.ASTREYA_DATA || {}, IT = D.integrations || {}, CS = IT.consent || {}, M = IT.metrika || null;
  const KEY = 'astreya:consent';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const state = () => { const s = read(); return !s || s.v !== CS.version ? 'unset' : (s.a === 1 ? 'granted' : 'denied'); };

  let started = false, lastUrl = location.href;
  const mayRun = () => !M ? false : (!CS.active ? true : (state() === 'granted' || (CS.mode === 'notice' && state() !== 'denied')));
  const mayRecord = () => !!(M && M.webvisor) && (!CS.active || state() === 'granted');            // Вебвизор записывает действия — только с явного согласия

  function startMetrika() {
    if (started || !M || !mayRun()) return; started = true;
    window['disableYaCounter' + M.id] = false;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date();
      for (let j = 0; j < document.scripts.length; j++) if (document.scripts[j].src === r) return;
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + M.id, 'ym');
    window.ym(Number(M.id), 'init', {ssr: true, webvisor: mayRecord(), clickmap: M.clickmap !== false, trackLinks: M.trackLinks !== false, accurateTrackBounce: M.accurateTrackBounce !== false, referrer: document.referrer, url: location.href});
    A.config.ymId = String(M.id);
  }
  /* отказ после согласия: счётчик нельзя «выгрузить», поэтому выключаем его флагом, стираем его cookie и перезагружаем страницу */
  function stopMetrika() {
    if (!M) return;
    window['disableYaCounter' + M.id] = true;
    const host = location.hostname.split('.'), domains = ['', location.hostname]; for (let i = 1; i < host.length - 1; i++) domains.push('.' + host.slice(i).join('.'));
    document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^_ym_/.test(n)).forEach(n => domains.forEach(d => { document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : ''); }));
    A.config.ymId = '';
    if (started) setTimeout(() => location.reload(), 500);
  }

  /* ---------- карточка с выбором ---------- */
  let box = null;
  function close() { if (box) { box.classList.remove('on'); const b = box; box = null; setTimeout(() => b.remove(), 300); } }
  function choose(yes) {
    const was = state();
    write({v: CS.version, a: yes ? 1 : 0, t: new Date().toISOString()});
    close(); A.toast(yes ? 'Спасибо, настройки сохранены' : 'Аналитика отключена');
    if (yes) startMetrika(); else if (was === 'granted' || started) stopMetrika();
    try { document.dispatchEvent(new CustomEvent('astreya:consent', {detail: {state: state()}})); } catch (e) {}
  }
  function open() {
    if (!CS.active || box) return;
    const el = document.createElement('div'); el.className = 'cb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'cb-t'); el.setAttribute('aria-live', 'polite');
    const t = document.createElement('b'); t.id = 'cb-t'; t.textContent = CS.title;
    const p = document.createElement('p'); p.textContent = CS.text + ' ';
    const a = document.createElement('a'); a.href = (A.ROOT || '') + 'privacy.html#cookie'; a.textContent = 'Подробнее'; p.append(a);
    const row = document.createElement('div'); row.className = 'cb-row';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'btn btn-fill btn-sm'; yes.textContent = CS.accept; yes.addEventListener('click', () => choose(true));
    const no = document.createElement('button'); no.type = 'button'; no.className = 'btn btn-ghost btn-sm'; no.textContent = CS.decline; no.addEventListener('click', () => choose(false));
    row.append(yes, no); el.append(t, p, row); document.body.append(el); box = el;
    requestAnimationFrame(() => el.classList.add('on'));
  }
  A.consent = {state, open, grant: () => choose(true), deny: () => choose(false), active: !!CS.active};
  document.addEventListener('click', e => { const b = e.target.closest ? e.target.closest('[data-act="cookie-settings"]') : null; if (b) { e.preventDefault(); open(); } });

  /* ---------- «виртуальные» просмотры: переходы без перезагрузки (motion.js) тоже считаются просмотрами ---------- */
  document.addEventListener('astreya:page', e => {
    const url = (e.detail && e.detail.url) || location.href;
    if (started && window.ym && M && !window['disableYaCounter' + M.id]) { try { window.ym(Number(M.id), 'hit', url, {title: document.title, referer: lastUrl}); } catch (x) {} }
    lastUrl = url;
  });

  function init() {
    startMetrika();
    if (CS.active && state() === 'unset') setTimeout(open, 900);                  // чуть позже заставки, чтобы не спорить с ней за внимание
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
