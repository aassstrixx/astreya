/* Реестр текстов для админки: страницы → блоки → поля (подпись, тип, лимит, исходный текст) и адрес страницы для предпросмотра. */
'use strict';
const path = require('path');
const C = require('./config');
const {readJSON} = require('./util');
const TX = require(path.join(C.ROOT, 'src', 'texts.js'));

/* страницы-шаблоны (карточка бренда, товара, мероприятия) показываем на первой подходящей записи */
function previewUrl(pg) {
  const d = n => readJSON(path.join(C.ROOT, 'data', n + '.json'), null);
  try {
    if (pg.id === 'brand') { const b = d('brands'); return b && b[0] ? 'brands/' + b[0].id + '.html' : 'brands.html'; }
    if (pg.id === 'product') { const b = d('products'); return b && b[0] ? 'products/' + b[0].slug + '.html' : 'catalog.html'; }
    if (pg.id === 'event') { const b = d('events'); return b && b[0] ? 'training/' + b[0].slug + '.html' : 'training.html'; }
  } catch (e) {}
  return pg.url;
}
function registry() {
  return {
    pages: TX.registry.pages.map(pg => ({id: pg.id, title: pg.title, url: previewUrl(pg), blocks: pg.blocks.map(b => ({id: b.id, title: b.title, items: b.items.map(i => ({key: i.key, label: i.label, type: i.type, max: i.max, def: i.def, hint: i.hint, optional: i.optional}))}))})),
    total: Object.keys(TX.index).length
  };
}
/* схема газеты (src/news-layout.js): слоты по умолчанию, подписи, страницы */
function newsLayout() {
  const NL = require(path.join(C.ROOT, 'src', 'news-layout.js'));
  return {defaults: NL.DEFAULT_SLOT, where: NL.WHERE, info: NL.SLOT_INFO, pages: NL.PAGES};
}
module.exports = {registry, newsLayout};
