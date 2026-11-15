/* «Контакты» (страница v2): поведение поверх разметки src/pages/contacts.js. Здесь: шапка прозрачна над первым экраном; список представительств раскрывается по одному (без JS все раскрыты),
   метки на карте и плиты списка связаны (наведение, выбор, клавиатура), маршрут из Москвы к выбранному городу «бежит» пунктиром; адрес #office-… открывает нужный город.
   Статус «на связи», подсказку «что указать» и форму ведут прежние скрипты (js/sales-pages.js, js/core.js). Всё идемпотентно, глобальных слушателей — один. */
(function () {
  'use strict';
  const A = window.Astreya; if (!A || !A.pages) return;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  let watching = false;

  const headerNow = () => { const hero = $('.cp-hero'); document.documentElement.classList.toggle('cp-scrolled', !!hero && hero.getBoundingClientRect().bottom < 90); };
  function watchHeader() {
    if (watching) return; watching = true; let raf = 0;
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; headerNow(); }); }, {passive: true}); window.addEventListener('resize', headerNow);
  }

  /* представительства ↔ карта */
  function offices(cp) {
    const box = $('[data-cp-offices]', cp); if (!box || box.getAttribute('data-cp-bound')) return; box.setAttribute('data-cp-bound', '1');
    const list = $$('.cp-office', box), pins = $$('.cp-pin', cp), routes = $$('.cp-rt', cp), still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const byCity = c => list.filter(o => o.getAttribute('data-city') === c)[0];
    function select(city, o) {
      const prev = list.filter(x => x.classList.contains('is-on'))[0];
      list.forEach(x => { const on = x.getAttribute('data-city') === city; x.classList.toggle('is-on', on); const b = $('.cp-ob-t', x); if (b) b.setAttribute('aria-expanded', String(on)); });
      pins.forEach(p => { const on = p.getAttribute('data-city') === city; p.classList.toggle('is-on', on); p.setAttribute('aria-pressed', String(on)); });
      routes.forEach(r => r.classList.toggle('is-on', r.getAttribute('data-city') === city));
      if (o && o.scroll && prev !== byCity(city)) { const t = byCity(city); if (t && innerWidth < 1100) setTimeout(() => t.scrollIntoView({behavior: still ? 'auto' : 'smooth', block: 'nearest'}), 120); }
    }
    box.classList.add('is-js');
    const hash = (location.hash.match(/^#office-([\w-]+)/) || [])[1], fromHash = hash && list.filter(x => x.id === 'office-' + hash)[0];
    select((fromHash || list[0]).getAttribute('data-city'));
    box.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.cp-ob-t'); if (!b) return; const o = b.closest('.cp-office');
      if (o.classList.contains('is-on')) { return; }                                                            // открытый город не закрываем: одна плита всегда раскрыта
      select(o.getAttribute('data-city'), {}); if (A.track) A.track('contacts_office', {city: o.getAttribute('data-city'), via: 'list'});
    });
    pins.forEach(p => p.addEventListener('click', () => { select(p.getAttribute('data-city'), {scroll: true}); if (A.track) A.track('contacts_office', {city: p.getAttribute('data-city'), via: 'map'}); }));
    list.forEach(o => { o.addEventListener('mouseenter', () => { const c = o.getAttribute('data-city'); pins.forEach(p => p.classList.toggle('is-hot', p.getAttribute('data-city') === c)); }); o.addEventListener('mouseleave', () => pins.forEach(p => p.classList.remove('is-hot'))); });
  }

  const prev = A.pages.contacts;
  A.pages.contacts = function () {
    if (prev) prev.apply(this, arguments);
    const cp = $('[data-cp]'); if (!cp) return;
    watchHeader(); headerNow(); offices(cp);
  };
})();
