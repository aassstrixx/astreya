/* Реестр текстов страниц: что из зашитого в шаблоны можно править в админке («Тексты страниц»).
   Запись: [имя, подпись для редактора, исходный текст, {type, max, hint, optional}] → ключ «страница.блок.имя».
   type: line — одна строка; text — абзац; rich — абзац с <br>, <em>, <strong> и символьными ссылками (&nbsp; &mdash;); link — ссылка.
   Исходный текст — ровно то, что сайт показывал до появления редактора, поэтому без правок заказчика страницы не меняются. Значения заказчика — data/texts.json. */
'use strict';
const pages = [], index = {};
const autoType = def => /<\/?[a-z]|&[#\w]+;/i.test(def) ? 'rich' : def.length > 110 ? 'text' : 'line';
const round = n => Math.ceil(n / 10) * 10;
function page(id, title, url, file, blocks) {
  let pg = pages.find(x => x.id === id), fresh = !pg; if (fresh) pg = {id, title, url, file, blocks: []};
  blocks.forEach(([bid, btitle, items]) => {
    let b = pg.blocks.find(x => x.id === bid), nb = !b; if (nb) b = {id: bid, title: btitle, items: []};
    items.forEach(([name, label, def, o]) => {
      o = o || {}; const type = o.type || autoType(def), key = id + '.' + bid + '.' + name;
      if (index[key]) throw new Error('Повтор ключа текста: ' + key);
      const max = o.max || (type === 'link' ? 160 : type === 'text' ? Math.max(360, round(def.length * 2.5)) : Math.max(90, round(def.length * 2.5)));
      const it = {key, page: id, block: bid, name, label, type, max, def, hint: o.hint || '', optional: !!o.optional, file: o.file || file, files: [o.file || file], manual: !!o.manual, find: o.find, once: !!o.once, part: !!o.part, occ: o.occ, js: !!o.js, ph: o.ph || null};
      b.items.push(it); index[key] = it;
    });
    if (nb) pg.blocks.push(b);
  });
  if (fresh) pages.push(pg);
}

/* тот же текст в ещё одном файле шаблона: use('ключ', 'src/…js') */
function use(key, file) { if (!index[key]) throw new Error('use: нет ключа ' + key); if (!index[key].files.includes(file)) index[key].files.push(file); }

/* страницы подключаются по порядку (порядок — как в списке страниц админки); каждый файл — одна страница или группа */
['home', 'home-x', 'home-house', 'home-mag', 'home-path', 'catalog', 'showroom', 'brands', 'detail-brand', 'detail-product', 'training', 'detail-event', 'company', 'partners', 'news', 'contacts', 'messengers', 'layout', 'common', 'components', 'start', 'search', 'legal', 'notfound', 'seo', 'ui'].forEach(n => { try { require('./texts/' + n + '.js')(page, use); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes('/texts/' + n)) throw e; } });
/* ================= ВСПОМОГАТЕЛЬНОЕ ================= */
module.exports = {pages, index, page};
