/* stella-policy.js — «рамки» Стеллы, общие для браузера и сервера (UMD, без DOM).

   Здесь то, что нельзя оставлять на усмотрение модели: что бы ни написал ИИ (даже если сервис ИИ сам ходит в интернет), посетитель увидит
   1) только ссылки на ЭТОТ сайт — внешние адреса и markdown-ссылки вырезаются (stripExternal);
   2) названия товаров и брендов из каталога — ссылками на наши страницы (linkify), а упомянутые товары — карточками с нашей ссылкой (mentionedProducts);
   3) под объяснениями о коже, уходе и косметологии — плашку «справочная информация, не медицинская рекомендация» (needsDisclaimer / DISCLAIMER).
   Те же правила словами записаны в серверной инструкции Стеллы (server/lib/stella-prompt.js); здесь они продублированы кодом — на случай, если модель их нарушит. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Astreya = root.Astreya || {}; root.Astreya.policy = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DISCLAIMER = {
    title: 'Справочная информация',
    text: 'Это общая справочная информация, а не медицинская рекомендация. Подбор ухода и применение средств определяет специалист по результатам консультации.',
    short: 'Не является медицинской рекомендацией'
  };

  /* о чём ответ: кожа, уход, косметология, ингредиенты, процедуры, здоровье — тут обязательна плашка. Слова ищутся только С НАЧАЛА слова
     (иначе «столица» сработала бы на «лица»), у коротких слов окончания перечислены явно (иначе «Кремль» сработал бы на «крем») */
  const STEMS = ['кож(?:а|е|и|у|ей|ы|ей|ами|ах|ный|ная|ное|ные)(?![а-яё])', 'лиц(?:о|а|е|у|ом)(?![а-яё])', 'косметик', 'косметолог', 'космецевтик', 'пилинг', 'ретин', 'spf', 'солнцезащит', 'фотозащит', 'загар', 'ожог', 'акне', 'прыщ',
    'угр(?:и|ей|ями|ям|ях|я)(?![а-яё])', 'пигмент', 'веснушк', 'морщин', 'антивозраст', 'старени', 'увлажн', 'сыворотк', 'крем(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?![а-яё])', 'гел(?:ь|я|ем|ю|и|ей)(?![а-яё])', 'маск(?:а|и|е|у|ой|ам|ами|ах)(?![а-яё])',
    'процедур', 'протокол', 'компонент', 'ингредиент', 'кислот', 'витамин', 'аллерг', 'раздраж', 'покраснен', 'шелуш', 'воспал', 'дерматит', 'купероз', 'рубц', 'постакне', 'беремен', 'лактац', 'противопоказ', 'показани(?:е|я|й|ям|ях)(?![а-яё])',
    'лечен', 'лечить', 'препарат', 'диагноз', 'симптом', 'выпадени', 'волос', 'гиалурон', 'пептид', 'коллаген', 'мезотерап', 'биоревитал', 'инъекц', 'ботулин', 'филлер', 'целлюлит', 'растяжк', 'здоровь', 'самочувств', 'болезн', 'болит', 'врач', 'дерматолог',
    'уход(?:а|у|ом|е)?(?![а-яё])', 'уходов', 'питани', 'диет'];
  const HEALTH_RE = new RegExp('(?:^|[^а-яёa-z0-9])(?:' + STEMS.join('|') + ')', 'i');
  const needsDisclaimer = (text, forced) => !!forced || HEALTH_RE.test(String(text || ''));

  /* ---------- внешние ссылки ---------- */
  const TLD = 'com|ru|org|net|io|me|info|biz|su|ua|by|kz|рф|shop|store|online|site|app|dev|ai|co|uk|de|fr|es|it|cn|tv|ly|to|cc|xyz';
  const stripExternal = text => {
    let s = String(text == null ? '' : text), n = 0; const hit = () => { n++; return ''; };
    s = s.replace(/\[([^\]\n]{1,200})\]\(\s*(?:https?:\/\/|www\.|\/\/)[^)\s]*\s*\)/gi, (m, label) => { n++; return label; });                      // [текст](https://…) → текст
    s = s.replace(/<a\s[^>]*>([\s\S]*?)<\/a>/gi, (m, label) => { n++; return label; });
    s = s.replace(/\b(?:https?:\/\/|www\.)[^\s<>()[\]«»"']+/gi, hit);                                                                                   // голые адреса
    s = s.replace(new RegExp('(^|[^@\\w.\\-/])((?:[a-z0-9-]+\\.)+(?:' + TLD + ')(?![a-z0-9-])(?:\\/[^\\s<>()\\[\\]«»"\']*)?)', 'gi'), (m, pre) => { n++; return pre; });  // example.com/…; адреса почты (после @) не трогаем
    if (n) s = s.replace(/\(\s*\)/g, '').replace(/[ \t]+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/(^|\n)\s*[-–—•*]\s*(?=\n|$)/g, '$1');
    return {text: s, removed: n};
  };
  const hasExternal = text => stripExternal(text).removed > 0;

  /* ---------- товары и бренды из текста → наши страницы ---------- */
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const BOUND = '(^|[^а-яёa-z0-9®])', END = '(?![а-яёa-z0-9])';
  /* распознаваемые «имена»: у товара — название, если оно «собственное» (есть латиница: Elastense, Acidcure, EVA, SCA® Biorepair) или стоит сразу после названия бренда
     («Keenwell Сыворотка для лица»); просто «шампунь» или «корректор» товаром не считаем — это обычные слова */
  function names(D) {
    const out = [], B = {}; (D.brands || []).forEach(b => { B[b.id] = b; });
    (D.products || []).forEach(p => {
      const b = B[p.brand] || {}, nm = String(p.name || ''); if (!nm) return;
      const full = (b.name ? b.name + ' ' : '') + nm; out.push({k: norm(full), id: p.id, kind: 'p'});
      if (b.name) { out.push({k: norm(b.name + ' · ' + nm), id: p.id, kind: 'p'}); out.push({k: norm(b.name + ' — ' + nm), id: p.id, kind: 'p'}); }
      if (/[A-Za-z]/.test(nm) && nm.length >= 4) out.push({k: norm(nm), id: p.id, kind: 'p'});
    });
    (D.brands || []).forEach(b => { if (b.name) out.push({k: norm(b.name), id: b.id, kind: 'b'}); });
    return out.sort((a, b) => b.k.length - a.k.length);
  }
  function matcher(D) {
    if (D.__spn) return D.__spn;
    const list = names(D), map = {}; list.forEach(x => { if (!map[x.k]) map[x.k] = x; });
    const re = list.length ? new RegExp(BOUND + '(' + list.map(x => esc(x.k)).join('|') + ')' + END, 'gi') : null;
    try { Object.defineProperty(D, '__spn', {value: {re, map}, enumerable: false}); } catch (e) {}
    return {re, map};
  }
  /* упомянутые в тексте товары (id), в порядке появления; бренд сам по себе товаром не считается */
  function mentionedProducts(text, D, max) {
    const M = matcher(D), t = norm(text), out = []; if (!M.re) return out; M.re.lastIndex = 0; let m;
    while ((m = M.re.exec(t))) { const x = M.map[m[2]]; if (x && x.kind === 'p' && out.indexOf(x.id) < 0) out.push(x.id); if (out.length >= (max || 3)) break; }
    return out;
  }
  /* готовый HTML ответа → названия превращаются в ссылки на страницы товаров и брендов этого сайта (внутри тегов не трогаем) */
  function linkify(html, D, urlOf) {
    const M = matcher(D); if (!M.re || !urlOf) return html; const seen = {};
    return String(html).split(/(<[^>]+>)/).map(part => {
      if (!part || part.charAt(0) === '<') return part;
      return part.replace(M.re, (m, pre, name) => {
        const x = M.map[norm(name)]; if (!x) return m; const href = urlOf(x); if (!href) return m;
        const key = x.kind + x.id; if (seen[key] && seen[key] >= 2) return m; seen[key] = (seen[key] || 0) + 1;
        return pre + '<a class="asst-pl" href="' + href + '" data-track="assistant_name_link">' + name + '</a>';
      });
    }).join('');
  }

  /* ---------- общий прогон ответа ИИ: что показывать посетителю ---------- */
  function clean(text, D) {
    const s = stripExternal(text);
    return {text: s.text, removedLinks: s.removed, products: D ? mentionedProducts(s.text, D) : [], disclaimer: needsDisclaimer(s.text)};
  }

  return {DISCLAIMER, HEALTH_RE, needsDisclaimer, stripExternal, hasExternal, mentionedProducts, linkify, clean};
});
