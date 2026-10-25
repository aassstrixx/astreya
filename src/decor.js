/* Декоративные камни на фоне страниц (главная, каталог, бренды): обломки травертина и известняка с мягкой тенью — прозрачные картинки assets/decor/rock-*.webp
   (рендер: tools/decor/rocks.py). Здесь — только разметка: apply() ищет блоки страницы по простому селектору (как в src/backdrops.js), ставит на блок атрибут data-rk
   и кладёт в его начало <img class="rk">. Положение и размер — переменные --w (ширина), --t (сверху), --l / --r (сбоку), --rot (поворот), --fx (-1 — зеркально);
   рисует css/decor.css. Камни не интерактивны, не мешают прокрутке и кликам (pointer-events:none), лежат под содержимым блока.
   Настройки — data/redesign.json → decor: {enabled, pages: {<ключ страницы>: [{sel, n?, rock, side: l|r, t, w, off?, rot?, flip?}]}}. */
'use strict';
const fs = require('fs');
const path = require('path');
const {blocks} = require('./backdrops.js');

function matcher(sel) {
  const m = /^([a-z][\w-]*)?((?:\.[\w-]+)*)(?:#([\w-]+))?$/i.exec(sel.trim());
  if (!m) throw new Error(`decor: не понимаю селектор «${sel}» (допустимо: тег.класс#id)`);
  const tag = m[1] && m[1].toLowerCase(), cls = m[2].split('.').filter(Boolean), id = m[3];
  return b => (!tag || b.tag === tag) && cls.every(c => b.cls.includes(c)) && (!id || b.id === id);
}

module.exports = function decor(ctx, C) {
  const cfg = ctx.redesign && ctx.redesign.decor, on = !!(cfg && cfg.enabled);
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'decor', 'rocks.json'), 'utf8')); } catch (e) { /* набор ещё не отрисован */ }
  function apply(P, html) {
    if (!on || !html || !cfg.pages) return html;
    const plan = cfg.pages[P.key]; if (!plan || !plan.length) return html;
    const edits = new Map();                                    // позиция «>» открывающего тега блока → [атрибут, картинки]
    const list = blocks(html, 3);
    for (const it of plan) {
      const m = meta[it.rock]; if (!m) throw new Error(`decor: нет камня «${it.rock}» в assets/decor/rocks.json (страница ${P.key})`);
      const hits = list.filter(matcher(it.sel)), n = it.n || 0, b = hits[n < 0 ? hits.length + n : n];
      if (!b) throw new Error(`decor: на странице ${P.key} нет блока «${it.sel}» №${n}`);
      const side = it.side === 'l' ? 'left' : 'right', style = `--w:${it.w};--t:${it.t};--${side === 'left' ? 'l' : 'r'}:${it.off != null ? it.off : '-2%'}${it.rot ? `;--rot:${it.rot}deg` : ''}${it.flip ? ';--fx:-1' : ''}`;
      const img = `<img class="rk" src="${C.u(P, m.file)}" alt="" aria-hidden="true" width="${m.w}" height="${m.h}" loading="lazy" decoding="async" style="${style}">`;
      const e = edits.get(b.end) || {img: ''}; e.img += img; edits.set(b.end, e);
    }
    for (const end of [...edits.keys()].sort((x, y) => y - x)) {                 // с конца строки, чтобы не сдвигать индексы
      const e = edits.get(end), tagEnd = html[end - 2] === '/' ? end - 2 : end - 1;
      const open = html.slice(0, tagEnd);
      const withAttr = /\bdata-rk\b/.test(html.slice(html.lastIndexOf('<', tagEnd), tagEnd)) ? '' : ' data-rk';
      html = open + withAttr + html.slice(tagEnd, end) + e.img + html.slice(end);
    }
    return html;
  }
  return {apply, on};
};
