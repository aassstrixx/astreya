/* Astreya — ядро: утилиты, аналитика, меню, поиск, формы (модальное окно и встроенные). Классический скрипт, без зависимостей. */
(function () {
  'use strict';
  const A = window.Astreya = window.Astreya || {};
  const D = window.ASTREYA_DATA || {site: {contacts: {}, discounts: []}, brands: [], products: [], events: [], index: []};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = A.esc, I = A.I;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ROOT = window.__ASTREYA_BUNDLE ? '' : (function () { try { return new URL(document.body.getAttribute('data-root') || './', location.href).href; } catch (e) { return document.body.getAttribute('data-root') || ''; } })();   // абсолютный адрес корня сайта: не меняется при подмене страниц
  Object.assign(A, {$, $$, wait, D, ROOT});
  A.assetUrl = p => window.__ASTREYA_BUNDLE ? ((A.assets || {})[p] || '') : ROOT + p;     // путь к картинке из data/ (в автономной сборке — data:-адрес)

  /* ---------- конфигурация: сюда подключаются форма и аналитика ---------- */
  A.config = {
    formEndpoint: window.__ASTREYA_BUNDLE ? '' : ((D.site && D.site.formEndpoint) || ''),   // куда уходят заявки (POST JSON): по умолчанию /api/lead — сервер из папки server/, заявки видны в админке; пусто — режим письма mailto. В автономном файле-предпросмотре сервера нет
    ymId: '',                                              // номер счётчика Яндекс.Метрики (когда появится)
    gtagId: ''                                             // идентификатор Google Analytics (когда появится)
  };
  A.pages = {};                                            // page-инициализаторы: A.pages.catalog = root => {...}

  /* ---------- аналитика: dataLayer + хуки gtag / ym; без реальных идентификаторов ---------- */
  A.track = function (name, params) {
    params = params || {};
    const evt = Object.assign({event: name, page_path: location.pathname, page_type: document.body.getAttribute('data-page')}, params);
    try { (window.dataLayer = window.dataLayer || []).push(evt); } catch (e) {}
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch (e) {}
    try { if (typeof window.ym === 'function' && A.config.ymId) window.ym(A.config.ymId, 'reachGoal', name, params); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('astreya:track', {detail: evt})); } catch (e) {}
  };

  /* ---------- тост ---------- */
  let toastT;
  A.toast = msg => { const el = $('#toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3600); };

  /* ---------- меню (мобильный ящик) ---------- */
  A.toggleMenu = function (force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('menu-open');
    if (open) A.closeSearch();
    document.body.classList.toggle('menu-open', open);
    document.body.classList.toggle('locked', open);
    const b = $('#burger'); if (b) b.setAttribute('aria-expanded', String(open));
  };
  A.closeMenu = () => { if (document.body.classList.contains('menu-open')) A.toggleMenu(false); };
  addEventListener('resize', () => { if (innerWidth > 900) A.closeMenu(); });

  /* ---------- поиск ---------- */
  const TYPE_LABEL = {product: 'Товар', brand: 'Бренд', news: 'Новость', event: 'Обучение', page: 'Страница'};
  const TYPE_ORDER = ['product', 'brand', 'event', 'news', 'page'];
  A.search = function (q) {
    const toks = A.tokens(q); if (!toks.length) return [];
    const nq = A.norm(q).trim();
    const out = [];
    D.index.forEach(it => {
      if (!toks.every(t => it.q.indexOf(t) !== -1)) return;
      const nt = A.norm(it.title);
      let s = toks.reduce((a, t) => a + (nt.indexOf(t) !== -1 ? 6 : 1), 0);
      if (nt === nq) s += 20; else if (nt.indexOf(nq) === 0) s += 8;
      out.push(Object.assign({score: s + (it.t === 'brand' ? 2 : it.t === 'product' ? 1 : 0)}, it));
    });
    return out.sort((a, b) => b.score - a.score || TYPE_ORDER.indexOf(a.t) - TYPE_ORDER.indexOf(b.t));
  };
  const resHTML = it => `<a class="sr-item" href="${ROOT}${it.url}" data-track="search_result_click" data-type="${it.t}"><span class="sr-type">${TYPE_LABEL[it.t]}</span><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></a>`;
  A.resHTML = resHTML; A.TYPE_LABEL = TYPE_LABEL; A.TYPE_ORDER = TYPE_ORDER;

  A.openSearch = function () {
    const p = $('#srch'); if (!p) return;
    A.closeMenu();
    A.lastFocus = document.activeElement;
    p.hidden = false; document.body.classList.add('search-open');
    $$('[data-act="search"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    requestAnimationFrame(() => { p.classList.add('open'); const i = $('#srch-q'); if (i) i.focus(); });
    A.track('search_open');
  };
  A.closeSearch = function () {
    const p = $('#srch'); if (!p || p.hidden) return;
    p.classList.remove('open'); document.body.classList.remove('search-open');
    $$('[data-act="search"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    setTimeout(() => { p.hidden = true; }, 260);
    if (A.lastFocus && A.lastFocus.focus) A.lastFocus.focus();
  };
  function suggest() {
    const q = $('#srch-q').value.trim(), out = $('#srch-out'), hints = $('#srch-hints');
    if (q.length < 2) { out.innerHTML = ''; hints.hidden = false; return; }
    hints.hidden = true;
    const res = A.search(q);
    if (!res.length) { out.innerHTML = `<p class="muted srch-empty">По запросу «${esc(q)}» ничего не найдено. Попробуйте название бренда или продукта.</p>`; return; }
    out.innerHTML = `<div class="sr-list">${res.slice(0, 7).map(resHTML).join('')}</div>
      <a class="lnk sr-all" href="${ROOT}search.html?q=${encodeURIComponent(q)}">Все результаты (${res.length}) ${I.arrow}</a>`;
  }
  document.addEventListener('input', e => { if (e.target && e.target.id === 'srch-q') suggest(); });

  /* ---------- формы ---------- */
  const FT = A.FORM_TYPES;
  let mailDraft = '', lastFocus = null;
  const modal = () => $('#modal');
  const dl = iso => A.dparts(iso).full;

  function context(type, ref) {
    if (!ref) return '';
    if (type === 'seminar') { const e = D.events.find(x => x.id === ref || x.slug === ref); if (e) return `${e.title} — ${dl(e.date)}, ${e.city}`; }
    if (type === 'product') { const p = D.products.find(x => x.id === ref || x.slug === ref); if (p) { const b = D.brands.find(x => x.id === p.brand); return `${b ? b.name : ''} · ${p.name}`; } }
    return ref;
  }

  A.openForm = function (type, ref) {
    const ft = FT[type] || FT.question, m = modal(); if (!m) return;
    const ctxText = context(type, ref);
    lastFocus = document.activeElement;
    m.classList.remove('closing');
    m.innerHTML = `<div class="dlg" role="document">
      <button class="x" type="button" data-act="close" aria-label="Закрыть">${I.close}</button>
      <span class="eyebrow in">Заявка</span>
      <h2 id="m-title">${ft.title}</h2>
      <p class="muted">${ft.lead}</p>
      ${ctxText ? `<span class="ctx">${esc(ctxText)}</span>` : ''}
      <div class="form-host">${A.formHTML(type, {root: ROOT, uid: 'm', ref: ctxText || '', cancel: true})}</div>
    </div>`;
    const f = $('form', m); if (f) f.setAttribute('data-ctx', ctxText);
    m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); m.setAttribute('aria-labelledby', 'm-title');
    document.body.classList.add('locked');
    A.track('form_open', {form_type: type, ref: ref || ''});
    setTimeout(() => { const i = $('input', m); if (i) i.focus(); }, 40);
  };
  A.closeModal = function () {
    const m = modal(); if (!m || !m.classList.contains('open') || m.classList.contains('closing')) return;
    m.classList.add('closing');
    setTimeout(() => {
      m.classList.remove('open', 'closing'); m.innerHTML = ''; m.setAttribute('aria-hidden', 'true');
      if (!document.body.classList.contains('menu-open') && !document.body.classList.contains('search-open')) document.body.classList.remove('locked');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 300);
  };

  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  function validate(form) {
    let first = null, bad = false;
    $$('.fld', form).forEach(f => {
      const el = $('input,textarea,select', f); if (!el) return;
      const v = el.value.trim(), digits = v.replace(/\D/g, '');
      let err = false;
      if (el.required && !v) err = true;
      else if (el.type === 'email' && v && !emailOk(v)) err = true;
      else if (el.type === 'tel' && v && (digits.length < 10 || digits.length > 15)) err = true;
      f.classList.toggle('bad', err);
      el.setAttribute('aria-invalid', err ? 'true' : 'false');
      if (err) { bad = true; if (!first) first = el; }
    });
    const ag = $('.agree', form), cb = form.elements.agree, agBad = !!cb && !cb.checked;
    if (ag) ag.classList.toggle('bad', agBad);
    if (agBad && !first) first = cb;
    if (first) first.focus();
    return !bad && !agBad;
  }
  function payloadOf(form) {
    const o = {type: form.getAttribute('data-form'), context: form.getAttribute('data-ctx') || form.getAttribute('data-ref') || '', page: location.href, sent_at: new Date().toISOString(), consent: true};
    ['name', 'phone', 'email', 'city', 'org', 'spec', 'msg'].forEach(k => { const el = form.elements[k]; if (el) o[k] = el.value.trim(); });
    if (form._t0) o.fill_ms = Math.round(performance.now() - form._t0);       // сколько форму заполняли: бот отправляет мгновенно
    return o;
  }
  function letterOf(pl) {
    const ft = FT[pl.type] || FT.question, subject = ft.subject + (pl.context ? ': ' + pl.context : '');
    const L = [pl.context ? 'Тема: ' + pl.context : null, 'Имя: ' + pl.name, pl.city ? 'Город: ' + pl.city : null, pl.org ? 'Организация: ' + pl.org : null, pl.spec ? 'Специализация: ' + pl.spec : null,
      'Email: ' + (pl.email || '—'), 'Телефон: ' + (pl.phone || '—'), '', 'Сообщение: ' + (pl.msg || '—'), '', 'Согласие на обработку персональных данных: да', 'Отправлено с сайта «Астрея».'].filter(x => x !== null);
    return {subject, body: L.join('\r\n'), href: 'mailto:' + D.site.contacts.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(L.join('\r\n'))};
  }
  function setStatus(form, kind, html) {
    const s = $('.form-status', form); if (!s) return;
    s.hidden = !html; s.className = 'form-status' + (kind ? ' ' + kind : ''); s.innerHTML = html || '';
  }
  function setBusy(form, busy) {
    const b = $('button[type="submit"]', form); if (!b) return;
    b.disabled = busy; b.classList.toggle('is-loading', busy); b.setAttribute('aria-busy', String(busy));
    const l = $('.lbl', b); if (l) { if (busy) { l.dataset.t = l.textContent; l.textContent = 'Отправка…'; } else if (l.dataset.t) l.textContent = l.dataset.t; }
    $$('input,textarea,select', form).forEach(x => { x.readOnly = busy && x.type !== 'checkbox'; });
  }
  function showDone(form, mode, letter) {
    const host = form.parentNode, c = D.site.contacts, wrapEl = document.createElement('div');
    wrapEl.className = 'ok'; wrapEl.setAttribute('role', 'status');
    if (mode === 'sent') {
      wrapEl.innerHTML = `<div class="tick">${I.check}</div><h3>Заявка отправлена</h3><p>Спасибо! Мы свяжемся с вами в рабочее время (${esc(c.hours)}).</p>
        <div class="row" style="justify-content:center;margin-top:18px"><button class="btn btn-ghost" type="button" data-act="form-again">Отправить ещё одну</button></div>`;
    } else {
      wrapEl.innerHTML = `<div class="tick">${I.check}</div><h3>Заявка подготовлена</h3>
        <p>Письмо ещё не отправлено. Отправьте его на <b>${esc(c.email)}</b>: откройте почтовую программу кнопкой ниже или скопируйте текст.</p>
        <div class="copy-box" id="mail-text" tabindex="0">${esc(mailDraft)}</div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <a class="btn btn-fill" href="${esc(letter.href)}">Открыть в почтовой программе</a>
          <button class="btn btn-ghost" type="button" data-act="copy" data-what="letter">Скопировать письмо</button>
          <button class="btn btn-lnk" type="button" data-act="copy" data-what="address">Скопировать адрес</button>
        </div>
        <p class="muted small" style="margin-top:16px">Или позвоните: <a href="tel:${c.phoneRaw}">${esc(c.phone)}</a></p>`;
    }
    form.hidden = true; host.insertBefore(wrapEl, form);
    const h = $('h3', wrapEl); if (h) { h.tabIndex = -1; h.focus(); }
  }
  A.submitForm = async function (form) {
    if (form.dataset.busy) return;
    if (!validate(form)) { setStatus(form, 'err', `${I.alert}<span>Проверьте поля, отмеченные красным.</span>`); return; }
    setStatus(form, '', '');
    if (form.elements.company_site && form.elements.company_site.value) { showDone(form, 'sent'); return; }   // ловушка для ботов
    const pl = payloadOf(form), type = pl.type;
    form.dataset.busy = '1'; setBusy(form, true); setStatus(form, 'busy', `<i class="spin dark" aria-hidden="true"></i><span>Отправляем заявку…</span>`);
    try {
      if (A.config.formEndpoint) {
        // credentials: 'omit' — заявка уходит без cookie; сервер принимает JSON от разрешённых сайтов (CORS)
        const r = await fetch(A.config.formEndpoint, {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: JSON.stringify(pl)});
        let j = null; try { j = await r.json(); } catch (e) {}
        if (r.status === 422 && j && j.errors) {                    // сервер не принял поля: подсвечиваем их, данные остаются в форме
          setBusy(form, false); delete form.dataset.busy;
          let first = null; Object.keys(j.errors).forEach(k => { const f = $('.fld[data-f="' + k + '"]', form); if (f) { f.classList.add('bad'); const el = $('input,textarea,select', f); if (el) { el.setAttribute('aria-invalid', 'true'); if (!first) first = el; } } });
          setStatus(form, 'err', `${I.alert}<span>${esc(j.errors.consent || j.errors.contact || 'Проверьте поля, отмеченные красным.')}</span>`); if (first) first.focus();
          A.track('form_error', {form_type: type, message: 'invalid'}); return;
        }
        if (r.status === 429) {
          setBusy(form, false); delete form.dataset.busy; const c = D.site.contacts;
          setStatus(form, 'err', `${I.alert}<div><b>Слишком много заявок с вашего адреса.</b> Попробуйте чуть позже или позвоните нам: <a href="tel:${c.phoneRaw}">${esc(c.phone)}</a></div>`);
          A.track('form_error', {form_type: type, message: 'rate_limited'}); return;
        }
        if (!r.ok || (j && j.ok === false)) throw new Error('HTTP ' + r.status);
        A.track('form_submit', {form_type: type, mode: 'endpoint', context: pl.context});
        setBusy(form, false); delete form.dataset.busy; setStatus(form, '', ''); showDone(form, 'sent');
      } else {
        await wait(650);
        const letter = letterOf(pl);
        mailDraft = 'Кому: ' + D.site.contacts.email + '\nТема: ' + letter.subject + '\n\n' + letter.body.replace(/\r\n/g, '\n');
        try { const a = document.createElement('a'); a.href = letter.href; document.body.appendChild(a); a.click(); a.remove(); } catch (e) {}
        A.track('form_submit', {form_type: type, mode: 'mailto', context: pl.context});
        setBusy(form, false); delete form.dataset.busy; setStatus(form, '', ''); showDone(form, 'draft', letter);
      }
    } catch (err) {
      setBusy(form, false); delete form.dataset.busy;
      const letter = letterOf(pl), c = D.site.contacts;
      A.track('form_error', {form_type: type, message: String(err && err.message || err)});
      setStatus(form, 'err', `${I.alert}<div><b>Не удалось отправить заявку.</b> Проверьте соединение и попробуйте ещё раз — введённые данные сохранены.
        <div class="fs-links">Или свяжитесь с нами: <a href="tel:${c.phoneRaw}">${esc(c.phone)}</a> · <a href="${esc(letter.href)}">написать письмом</a></div></div>`);
    }
  };
  document.addEventListener('submit', e => { const f = e.target; if (f && f.classList && f.classList.contains('lead-form')) { e.preventDefault(); A.submitForm(f); } });
  document.addEventListener('focusin', e => { const f = e.target && e.target.closest ? e.target.closest('.lead-form') : null; if (f && !f._t0) f._t0 = performance.now(); });
  document.addEventListener('input', e => { const f = e.target && e.target.closest ? e.target.closest('.fld.bad') : null; if (f) { f.classList.remove('bad'); const i = $('input,textarea,select', f); if (i) i.setAttribute('aria-invalid', 'false'); } });
  document.addEventListener('change', e => { const t = e.target; if (t && t.name === 'agree') { const a = t.closest('.agree'); if (a) a.classList.remove('bad'); } });

  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); A.toast(msg); return; } catch (e) {}
    const box = $('#mail-text');                          // запасной вариант: выделить текст для Ctrl+C
    if (box) { const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    A.toast('Текст выделен — нажмите Ctrl+C или ⌘C');
  }

  /* ---------- делегирование кликов: действия и аналитика ---------- */
  document.addEventListener('click', e => {
    const m = modal();
    if (m && e.target === m) { A.closeModal(); return; }
    const srch = $('#srch');
    if (srch && !srch.hidden && e.target === srch) { A.closeSearch(); return; }

    const t = e.target.closest ? e.target.closest('[data-act], [data-track], a[href^="tel:"], a[href^="mailto:"]') : null;
    if (!t) return;
    /* аналитика */
    if (t.hasAttribute('data-track')) {
      const p = {}; ['place', 'product', 'brand', 'type'].forEach(k => { const v = t.getAttribute('data-' + k); if (v) p[k] = v; });
      A.track(t.getAttribute('data-track'), p);
    } else if (t.tagName === 'A') {
      const h = t.getAttribute('href') || '';
      if (h.indexOf('tel:') === 0) A.track('phone_click', {phone: h.slice(4)});
      else if (h.indexOf('mailto:') === 0) A.track('email_click', {email: h.slice(7).split('?')[0]});
    }
    /* действия */
    const act = t.getAttribute('data-act'); if (!act) return;
    const id = t.getAttribute('data-id');
    switch (act) {
      case 'menu': A.toggleMenu(); break;
      case 'search': A.openSearch(); break;
      case 'search-close': A.closeSearch(); break;
      case 'form': A.openForm(t.getAttribute('data-type'), t.getAttribute('data-ref')); break;
      case 'close': A.closeModal(); break;
      case 'copy': t.getAttribute('data-what') === 'address' ? copyText(D.site.contacts.email, 'Адрес скопирован') : copyText(mailDraft, 'Письмо скопировано'); break;
      case 'form-again': { const host = t.closest('.ok').parentNode, f = $('form', host); t.closest('.ok').remove(); if (f) { f.hidden = false; f.reset(); f._t0 = 0; setStatus(f, '', ''); } break; }
      case 'faq': { const it = t.closest('.faq-item'), open = it.classList.toggle('open'); t.setAttribute('aria-expanded', String(open)); break; }
      case 'scroll': { const el = document.getElementById(t.getAttribute('data-target')); if (el) { e.preventDefault(); el.scrollIntoView({behavior: 'smooth', block: 'start'}); } break; }
      default: if (A.actions && A.actions[act]) A.actions[act](t, id, e);
    }
  });
  A.actions = A.actions || {};

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const m = modal();
      if (m && m.classList.contains('open')) A.closeModal();
      else if (document.body.classList.contains('search-open')) A.closeSearch();
      else A.closeMenu();
      return;
    }
    if (e.key === 'Tab') {                                 // ловушка фокуса: модальное окно и поиск
      const m = modal(), s = $('#srch');
      const box = m && m.classList.contains('open') ? m : (s && !s.hidden ? s : null);
      if (!box) return;
      const f = $$('button, input, textarea, select, a[href]', box).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- запуск page-инициализаторов ---------- */
  A.initPage = function (root) {
    root = root || document;
    const key = document.body.getAttribute('data-page');
    if (A.pages[key]) A.pages[key](root);
    if (A.pages._all) A.pages._all(root);
    const track = {catalog: 'catalog_view', product: 'product_view', partners: 'partner_page_view'}[key];
    if (track) A.track(track, key === 'product' ? {product: (root.querySelector('[data-product]') || {getAttribute: () => ''}).getAttribute('data-product')} : {});
  };
})();
