/* Общие помощники для картинок: сжатие в браузере (WebP, ограничение размера), загрузка на сервер и окно «выбрать картинку» (загрузить новую или взять из библиотеки).
   Сервер внешних библиотек для картинок не использует, поэтому конвертация идёт здесь, через canvas. Содержимое файлов проверяет сервер (подпись PNG/JPG/WebP/GIF, не больше 6 МБ). */
(function () {
  'use strict';
  const {h} = AD;
  const IMG = /\.(png|jpe?g|webp|gif)$/i, RASTER_IN = /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i;
  const stem = n => String(n || 'image').replace(/\.[^.]+$/, '');
  const asBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Не удалось прочитать файл.')); r.readAsDataURL(blob); });
  const media = AD.media = {};
  let libCache = null;

  /* Файл → WebP (или как есть, если браузер не умеет): длинная сторона не больше max, качество quality. GIF не трогаем (анимация). */
  media.convert = async function (file, o) {
    o = o || {}; const max = o.max || 1600, q = o.quality || 0.86;
    if (!RASTER_IN.test(file.type) && !IMG.test(file.name)) throw new Error('Допустимы картинки PNG, JPG, WebP и GIF. SVG и другие форматы загружать нельзя.');
    if (file.size > 25 * 1048576) throw new Error('Файл «' + file.name + '» больше 25 МБ — уменьшите его перед загрузкой.');
    if (/gif$/i.test(file.type) || /\.gif$/i.test(file.name)) return {blob: file, ext: 'gif', w: 0, h: 0, kept: true};
    let bmp; try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('Файл «' + file.name + '» не открывается как картинка.'); }
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), hh = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0, w, hh); if (bmp.close) bmp.close();
    const blob = await new Promise(res => cv.toBlob(res, 'image/webp', q));
    if (blob && blob.type === 'image/webp' && blob.size < file.size * 1.1) return {blob, ext: 'webp', w, h: hh};
    if (blob && blob.type === 'image/webp' && file.size > 6 * 1048576) return {blob, ext: 'webp', w, h: hh};
    return {blob: file, ext: /png$/i.test(file.type) ? 'png' : /jpe?g$/i.test(file.type) ? 'jpg' : /webp$/i.test(file.type) ? 'webp' : 'png', w, h: hh, kept: true};
  };
  /* сжать и загрузить в папку dir; name — желаемое имя без расширения */
  media.upload = async function (dir, file, o) {
    o = o || {}; const c = await media.convert(file, o);
    const name = (o.name || stem(file.name)) + '-' + Date.now().toString(36).slice(-4) + '.' + c.ext;
    if (c.blob.size > 6 * 1048576) throw new Error('После сжатия файл «' + file.name + '» всё ещё больше 6 МБ — уменьшите разрешение.');
    const r = await AD.post('/api/files', {dir, name, data: await asBase64(c.blob)}); libCache = null;
    return Object.assign(r, {w: c.w, h: c.h, before: file.size});
  };
  media.library = async function (force) {
    if (!libCache || force) libCache = (await AD.get('/api/files')).dirs;
    return libCache;
  };
  media.invalidate = () => { libCache = null; };
  media.src = p => '/' + String(p || '').replace(/^\/+/, '');

  /* Окно выбора: вкладка «Загрузить» (перетащить или выбрать файлы) и «Библиотека» (поиск по папкам). onPick(path) вызывается при выборе. */
  media.pick = function (o) {
    o = o || {}; const dir = o.dir || 'assets/uploads', msg = h('div', {}), grid = h('div', {class: 'files mp-grid'}), search = h('input', {type: 'search', placeholder: 'Найти по имени…', 'aria-label': 'Поиск по картинкам', class: 'grow'});
    let dirs = [], only = o.onlyDir || '', box;
    const input = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: !!o.multiple, hidden: true});
    const drop = h('div', {class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Загрузить картинку'}, h('b', {}, 'Перетащите картинку сюда или нажмите, чтобы выбрать'), h('div', {class: 'small'}, 'PNG, JPG, WebP или GIF. Картинка будет сжата в WebP (до ' + (o.max || 1600) + ' px по длинной стороне).'));
    const take = p => { m.close(true); if (o.onPick) o.onPick(p); };
    async function files(list) {
      msg.replaceChildren(); const ok = [];
      for (const f of Array.from(list)) {
        const st = h('div', {class: 'small muted'}, 'Загрузка «' + f.name + '»…'); msg.append(st);
        try { const r = await media.upload(dir, f, {name: o.name, max: o.max, quality: o.quality}); st.textContent = '«' + f.name + '» загружено: ' + AD.size(r.size) + (r.before ? ' (было ' + AD.size(r.before) + ')' : ''); ok.push(r.path); }
        catch (e) { st.replaceChildren(AD.alertBox('err', e.message)); }
      }
      if (ok.length && !o.multiple) take(ok[0]); else if (ok.length) { await load(true); paint(); }
    }
    drop.addEventListener('click', () => input.click()); drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files.length) files(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); })); ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) files(e.dataTransfer.files); });
    async function load(force) { try { dirs = (await media.library(force)).filter(d => !d.readonly); } catch (e) { msg.replaceChildren(AD.errBox(e)); } }
    function paint() {
      const q = search.value.trim().toLowerCase(), all = [];
      dirs.forEach(d => { if (only && d.dir !== only) return; (d.files || []).forEach(f => { if (IMG.test(f.name) && (!q || f.name.toLowerCase().includes(q))) all.push([d, f]); }); });
      all.sort((a, b) => String(b[1].mtime).localeCompare(String(a[1].mtime)));
      AD.fill(grid, all.length ? all.slice(0, 120).map(([d, f]) => h('div', {class: 'file'}, h('button', {class: 'pick-btn', type: 'button', title: f.path, onclick: () => take(f.path)}, h('div', {class: 'th', style: {backgroundImage: 'url("' + media.src(f.path) + '")'}}), h('div', {class: 'nm'}, f.name), h('div', {class: 'muted'}, AD.size(f.size))))) : h('div', {class: 'empty'}, h('b', {}, 'Картинок нет'), 'Загрузите первую на вкладке слева или измените поиск.'));
    }
    const dirSel = h('select', {'aria-label': 'Папка', onchange: () => { only = dirSel.value; paint(); }}, h('option', {value: ''}, 'Все папки'));
    search.addEventListener('input', paint);
    box = h('div', {class: 'mp'}, msg, drop, input, h('div', {class: 'group-h'}, 'Или выберите из библиотеки'), h('div', {class: 'toolbar'}, search, dirSel), grid);
    const m = AD.modal({title: o.title || 'Выбрать картинку', body: box, cls: 'wide', footer: [o.current ? h('button', {class: 'btn danger', type: 'button', style: {marginRight: 'auto'}, onclick: () => take('')}, 'Убрать картинку') : null, h('button', {class: 'btn', type: 'button', onclick: () => m.close()}, 'Закрыть')]});
    load().then(() => { dirs.forEach(d => dirSel.append(h('option', {value: d.dir}, d.title))); dirSel.value = only; paint(); });
    return m;
  };
})();
