/* Автономная сборка (один HTML): все страницы лежат в <script id="astreya-pages">, переходы делает этот маленький роутер.
   Основной сайт в нём не нужен — это режим для предпросмотра и публикации в средах, где нет обычных файлов/адресов. */
(function () {
  'use strict';
  const A = window.Astreya, M = A.motion, $ = A.$;
  const PAGES = JSON.parse(document.getElementById('astreya-pages').textContent);
  const ASSETS = JSON.parse(document.getElementById('astreya-assets').textContent);
  A.assets = ASSETS;
  const fixAssets = root => root.querySelectorAll('img[data-asset]').forEach(i => { const a = ASSETS[i.getAttribute('data-asset')]; if (a) i.src = a; i.removeAttribute('data-asset'); });
  fixAssets(document);
  let cur = 'index.html', vq = '', busy = false;
  const dirOf = p => p.indexOf('/') > -1 ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  const resolve = (href, from) => { const u = new URL(href, 'http://x/' + dirOf(from)); return {path: u.pathname.replace(/^\//, '') || 'index.html', query: u.search, hash: u.hash}; };
  A.query = () => new URLSearchParams(vq);
  A.writeQuery = p => { vq = p.toString(); };

  function scrollToHash(h) { const el = h && document.getElementById(h.slice(1)); if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'}); }
  async function show(path, query, hash, push, quiet) {
    const pg = PAGES[path]; if (!pg || busy) return;
    if (path === cur && query === (vq ? '?' + vq : '')) { if (hash) scrollToHash(hash); else { A.closeMenu(); if (path === 'index.html') M.scrollHome(); else window.scrollTo({top: 0, behavior: 'smooth'}); } return; }
    busy = true;
    const curtain = $('#curtain'), main = $('#main');
    if (!quiet) { M.curtainLabelFor(new URL(path, 'http://x/' + dirOf(cur)).href); curtain.classList.remove('out'); curtain.classList.add('in'); await A.wait(820); }          // quiet — поиск: без шторки
    main.innerHTML = pg.main; fixAssets(main); cur = path; vq = (query || '').replace(/^\?/, '');
    document.title = pg.title;
    document.body.setAttribute('data-page', pg.key); document.body.setAttribute('data-nav', pg.nav || ''); main.setAttribute('data-page', pg.key);
    A.$$('#nav .nl').forEach(a => { const on = a.getAttribute('data-nav') === pg.nav; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
    A.closeMenu(); A.closeSearch(); A.closeModal();
    window.scrollTo({top: 0, left: 0, behavior: 'instant'}); if (M.cancelSmooth) M.cancelSmooth();
    const hdr = $('#hdr'); if (hdr) hdr.classList.remove('hide');
    if (path === 'index.html' && !hash && M.heroTop() > 0) window.scrollTo({top: M.heroTop(), left: 0, behavior: 'instant'});          // главная по лого/ссылке — героем; вступление выше, до него можно долистать
    A.initPage(document); M.scan(main, quiet ? 40 : 470);
    if (quiet) { main.classList.remove('qfade'); void main.offsetWidth; main.classList.add('qfade'); } else { curtain.classList.remove('in'); curtain.classList.add('out'); }
    if (push) { try { history.pushState({p: path, q: query || ''}, '', '#/' + path + (query || '')); } catch (e) {} }
    if (!quiet) { await A.wait(700); curtain.classList.remove('out'); } busy = false;
    if (hash) scrollToHash(hash);
  }
  A.showPage = show;

  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href'); if (!href || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return;
    const r = resolve(href, a.closest('#main') ? cur : 'index.html');
    if (!PAGES[r.path]) return;
    e.preventDefault();
    show(r.path, r.query, r.hash, true, r.path === 'search.html');
  }, true);
  document.addEventListener('submit', e => {                       // формы поиска (GET → search.html)
    const f = e.target, act = f.getAttribute && f.getAttribute('action');
    if (!act || !/search\.html$/.test(act)) return;
    e.preventDefault();
    const q = (new FormData(f).get('q') || '').toString().trim();
    show('search.html', q ? '?q=' + encodeURIComponent(q) : '', '', true, true);
  }, true);
  addEventListener('popstate', e => { if (e.state && e.state.p) show(e.state.p, e.state.q, '', false); });
})();
