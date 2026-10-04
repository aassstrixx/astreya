/* Фоновые вставки: макро-текстуры крема, нитей, капель, рельефа кожи, пипетки, бликов и молекул за содержимым страниц.
   Здесь — только разметка. apply() добавляет в начало и конец содержимого <main> декоративные полосы (top / end) и ставит атрибуты data-bd на выбранные
   блоки (mid, поиск по простому селектору). Рисует их css/backdrops.css, подгружает js/backdrops.js (лениво, по мере прокрутки).
   Настройки — data/redesign.json → backdrops. */
'use strict';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOCK = new Set(['section', 'div', 'header', 'article', 'aside', 'ul', 'form']);

/* блоки HTML-строки глубиной до maxDepth: [{start, end (конец открывающего тега), tag, attrs, depth, cls[], id}] — лёгкий разбор по вложенности; скрипты, стили и комментарии пропускаются */
function blocks(html, maxDepth = 2) {
  const out = []; let depth = 0, m;
  const re = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1>|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  while ((m = re.exec(html))) {
    if (!m[3]) continue;                                        // комментарий или script/style целиком
    const closing = m[2] === '/', tag = m[3].toLowerCase(), attrs = m[4] || '';
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    if (VOID.has(tag) || /\/\s*$/.test(attrs)) continue;
    if (depth <= maxDepth && BLOCK.has(tag)) out.push({start: m.index, end: m.index + m[0].length, tag, attrs, depth,
      cls: ((attrs.match(/\bclass="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean), id: (attrs.match(/\bid="([^"]*)"/) || [])[1] || ''});
    depth++;
  }
  return out;
}

/* простой селектор «тег.класс.класс#id» */
function matcher(sel) {
  const m = /^([a-z][\w-]*)?((?:\.[\w-]+)*)(?:#([\w-]+))?$/i.exec(sel.trim());
  if (!m) throw new Error(`backdrops: не понимаю селектор «${sel}» (допустимо: тег.класс#id)`);
  const tag = m[1] && m[1].toLowerCase(), cls = m[2].split('.').filter(Boolean), id = m[3];
  return b => (!tag || b.tag === tag) && cls.every(c => b.cls.includes(c)) && (!id || b.id === id);
}

module.exports = function backdrops(ctx) {
  const cfg = ctx.redesign && ctx.redesign.backdrops;
  const on = !!(cfg && cfg.enabled);
  const skipCls = new Set((cfg && cfg.skipClasses) || []);

  function check(it, where) {
    const tx = cfg.textures && cfg.textures[it.tex];
    if (!tx) throw new Error(`backdrops: нет текстуры «${it.tex}» (${where})`);
    return tx;
  }
  const attrs = (it, tx) => ` data-bd="${it.tex}" data-bd-pos="${it.pos || tx.pos || 'r'}"` + (it.o != null ? ` data-bd-o="${it.o}"` : '') + (it.ext ? ` data-bd-ext="${it.ext}"` : '');

  /* plan страницы: {top: {tex, pos?, o?}, end: {…}, logo: {pos?, o?}, mid: [{sel, n?, tex, pos?, o?, ext?}]}; n — какой по счёту блок, подходящий под sel (по умолчанию 0; -1 — последний) */
  function apply(P, html) {
    if (!on || !html) return html;
    if ((cfg.skipPages || []).includes(P.key)) return html;
    const plan = (cfg.pages && (cfg.pages[P.key] || cfg.pages._default)) || null;
    if (!plan) return html;
    const edits = new Map();                                    // позиция «>» открывающего тега → строка атрибутов
    const list = blocks(html).filter(b => !b.cls.some(c => skipCls.has(c)));
    for (const it of plan.mid || []) {
      const tx = check(it, `страница ${P.key}, mid ${it.sel}`);
      const n = it.n || 0, hits = list.filter(matcher(it.sel)), b = hits[n < 0 ? hits.length + n : n];
      if (!b) throw new Error(`backdrops: на странице ${P.key} нет блока «${it.sel}» №${n}`);
      if (/\bdata-bd=/.test(b.attrs) || edits.has(b.end)) continue;
      edits.set(b.end, attrs(it, tx));
    }
    for (const end of [...edits.keys()].sort((x, y) => y - x)) {                // с конца строки, чтобы не сдвигать индексы
      const at = html[end - 2] === '/' ? end - 2 : end - 1;
      html = html.slice(0, at) + edits.get(end) + html.slice(at);
    }
    const fill = (kind, it) => { const tx = check(it, `страница ${P.key}, ${kind}`); return `<div class="bd-fill bd-${kind}"${attrs(it, tx)} aria-hidden="true"></div>`; };
    /* крупный логотип «Астрея» на заднем плане (как в блоках главной): plan.logo = {pos?: c|l|r, o?: 3…12 — сотые доли непрозрачности}; лежит над полосой top, под содержимым */
    const logo = it => {
      if (P.key === 'home') throw new Error('backdrops: на главной крупный логотип задаётся блоками (rd-bgword), plan.logo там не используется');
      return `<div class="bd-logo" data-pos="${it.pos || 'c'}"${it.o != null ? ` data-lo="${it.o}"` : ''} aria-hidden="true"><svg viewBox="49.8 341.6 829.5 428.9" preserveAspectRatio="xMidYMid meet"><use href="#logo-art"/></svg></div>`;
    };
    return (plan.top ? fill('top', plan.top) + '\n' : '') + (plan.logo ? logo(plan.logo) + '\n' : '') + html + (plan.end ? '\n' + fill('end', plan.end) : '');
  }
  return {apply, on, cfg, blocks};
};
module.exports.blocks = blocks;
