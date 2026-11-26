/* Плашка-приглашение «Спросите Стеллу…» на страницах (данные — data/stella/guide.json → entry, в страницу попадают как D.stellaEntry; стили — css/entry.css).
   Работает, когда навигатор (extras.navigator, js/guide.js) выключен: экскурсии по сайту, подсветки и приветственного пузыря нет, остаётся только сама плашка с вопросами-подсказками и кнопкой «Спросить Стеллу».
   Если навигатор включён, плашки ставит он, а этот файл ничего не делает. */
(function () {
  'use strict';
  const A = window.Astreya, D = window.ASTREYA_DATA;
  if (!A || !D || D.guide || !D.stellaEntry || !D.extras || !D.extras.assistant) return;
  const E = D.stellaEntry, esc = A.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const pickV = v => Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
  const chipsHTML = (list, n) => (A.planChip ? A.planChip.list(list) : (list || [])).slice(0, n).map(c => (A.planChip && A.planChip.html(c)) || '<button class="chip" type="button" data-act="g-chip" data-q="' + esc(c) + '">' + esc(c) + '</button>').join('');
  A.actions = A.actions || {};
  A.actions['g-chip'] = t => { const S = A.stella || {}; if (S.ask) S.ask(t.getAttribute('data-q') || ''); };
  function mount() {
    const key = document.body.getAttribute('data-page') || '', cfg = E.pages && E.pages[key];
    if (!cfg || $('.g-entry') || $('[data-no-entry]')) return;          // data-no-entry: страница сама решает, где её единственная кнопка Стеллы (стена брендов)
    let a = null; try { a = $(cfg.anchor); } catch (e) {} if (!a) return;
    if (key === 'home' && $('.arch-story.is-house')) a = document.getElementById('house-end') || a;          // главная-дом: плашка идёт после журнала, а не между героем и журналом
    const el = document.createElement('aside'); el.className = 'g-entry'; el.setAttribute('aria-label', 'Помощник Стелла'); el.setAttribute('data-style', E.style || 'strip');
    el.innerHTML = '<span class="g-e-pe" aria-hidden="true">' + (A.pearl ? A.pearl('happy', true) : '') + '</span><div class="g-e-t"><b>' + esc(pickV(cfg.title)) + '</b><p>' + esc(pickV(cfg.text)) + '</p></div>' +
      '<div class="g-e-ch">' + chipsHTML(cfg.chips, 4) + '</div>' +
      '<button class="btn btn-fill btn-sm g-e-b" type="button" data-act="asst-open" data-track="guide_entry">Спросить Стеллу</button>';
    const pos = cfg.pos || 'after';
    if (pos === 'after') a.insertAdjacentElement('afterend', el);
    else if (pos === 'beforeSection') { const sec = a.closest('section'); (sec || a).insertAdjacentElement('beforebegin', el); }
    else a.insertAdjacentElement('beforebegin', el);
    requestAnimationFrame(() => el.classList.add('on'));
  }
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); mount(); };
})();
