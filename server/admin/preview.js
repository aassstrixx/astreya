/* Раздел «Предпросмотр»: любая страница сайта в рамке нужной ширины (телефон, планшет, ноутбук, широкий экран) — проверить, как выглядят правки, не открывая сайт. */
(function () {
  'use strict';
  const {h} = AD;
  const DEV = [['phone', 'Телефон', 390, 'M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM11 18h2'], ['tablet', 'Планшет', 820], ['laptop', 'Ноутбук', 1280], ['wide', 'Широкий', 1600]];

  AD.views.preview = {
    async mount(root, parts) {
      const inst = {initial: true};
      let pages = AD._sitePages; if (!pages) { try { pages = AD._sitePages = (await AD.get('/api/site-pages')).pages; } catch (e) { pages = []; } }
      let path = parts[0] ? decodeURIComponent(parts[0]) : 'index.html', dev = 'laptop'; try { dev = localStorage.getItem('ad.pv.dev') || 'laptop'; } catch (e) {}
      if (!DEV.some(d => d[0] === dev)) dev = 'laptop';
      const groups = [...new Set(pages.map(p => p.group))];
      const sel = h('select', {id: 'pv-page', 'aria-label': 'Страница', onchange: () => AD.go('#/preview/' + encodeURIComponent(sel.value))}, !pages.some(p => p.path === path) ? h('option', {value: path}, path) : null, groups.map(g => h('optgroup', {label: g}, pages.filter(p => p.group === g).map(p => h('option', {value: p.path}, p.title + ' — ' + p.path)))));
      const btns = DEV.map(([id, title, w]) => h('button', {type: 'button', 'aria-pressed': String(id === dev), dataset: {id}, onclick: () => { dev = id; try { localStorage.setItem('ad.pv.dev', id); } catch (e) {} btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id))); fit(); }}, title + ' · ' + w));
      const frame = h('iframe', {title: 'Предпросмотр страницы сайта', src: 'about:blank'}), dev$ = h('div', {class: 'dev'}, frame), holder = h('div', {style: {flex: 'none'}}, dev$), stage = h('div', {class: 'pv-stage'}, holder), note = h('span', {class: 'muted small'});
      const open = h('a', {class: 'btn', href: '/' + path, target: '_blank', rel: 'noopener'}, 'Открыть в новой вкладке');
      function fit() {
        const w = DEV.find(d => d[0] === dev)[2], avail = Math.max(280, stage.clientWidth - 32), k = Math.min(1, avail / w), vh = Math.max(480, Math.round(window.innerHeight * 0.74));
        dev$.style.width = w + 'px'; dev$.style.height = Math.round(vh / k) + 'px'; dev$.style.transformOrigin = 'top left'; dev$.style.transform = k < 1 ? 'scale(' + k.toFixed(4) + ')' : '';
        holder.style.width = Math.round(w * k) + 'px'; holder.style.height = vh + 'px'; note.textContent = 'Ширина ' + w + ' px' + (k < 1 ? ', показано в масштабе ' + Math.round(k * 100) + '%' : '');
      }
      const load = () => { sel.value = path; open.href = '/' + path; frame.src = '/' + path + (path.includes('?') ? '&' : '?') + 'pv=' + Date.now(); };
      root.append(AD.pageHead('Предпросмотр', 'Как выглядит сайт на разных экранах — с последними сохранёнными правками.'),
        h('div', {class: 'pv-bar'}, h('label', {class: 'sr', for: 'pv-page'}, 'Страница'), sel, h('span', {class: 'pv-dev row gap-s', role: 'group', 'aria-label': 'Ширина экрана'}, btns), h('button', {class: 'btn', type: 'button', onclick: load}, 'Обновить'), open, h('span', {class: 'right'}, note)), stage);
      const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; if (ro) ro.observe(stage); window.addEventListener('resize', fit);
      inst.onRoute = p => { path = p[0] ? decodeURIComponent(p[0]) : 'index.html'; load(); };
      inst.destroy = () => { if (ro) ro.disconnect(); window.removeEventListener('resize', fit); };
      fit(); load(); return inst;
    }
  };
})();
