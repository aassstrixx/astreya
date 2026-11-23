/* Читаемое сравнение двух JSON-значений: «что изменилось» — путь с названиями записей, было и стало. Служебные поля (id, slug и т. п.) тоже сравниваются. */
'use strict';
const LABELS = ['name', 'title', 'label', 'city', 'q', 'tag'];
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const short = v => { const s = v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v); return s.length > 140 ? s.slice(0, 137) + '…' : s; };
/* подпись записи списка: name/title/…; иначе номер */
const labelOf = (v, i) => { if (isObj(v)) { for (const k of LABELS) if (typeof v[k] === 'string' && v[k].trim()) return '«' + v[k].slice(0, 40) + '»'; if (typeof v.first === 'string') return '«' + (v.first + ' ' + (v.last || '')).trim() + '»'; if (v.id !== undefined) return '«' + String(v.id).slice(0, 30) + '»'; } return '№' + (i + 1); };
function diff(a, b, opts) {
  const out = [], max = (opts && opts.max) || 200;
  const push = (path, kind, from, to) => { if (out.length < max) out.push({path: path.join(' › '), kind, from: short(from), to: short(to)}); else out.overflow = (out.overflow || 0) + 1; };
  const walk = (x, y, path) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (Array.isArray(x) && Array.isArray(y)) {
      const idKey = (x.concat(y)).every(v => isObj(v) && v.id !== undefined) ? 'id' : (x.concat(y)).every(v => isObj(v) && v.slug !== undefined) ? 'slug' : null;
      if (idKey) {                                              // списки записей сравниваем по id: перестановка не считается правкой содержимого
        const mx = new Map(x.map(v => [v[idKey], v])), my = new Map(y.map(v => [v[idKey], v]));
        y.forEach((v, i) => { const p = path.concat(labelOf(v, i)); if (!mx.has(v[idKey])) push(p, 'добавлено', undefined, v.title || v.name || v.id); else walk(mx.get(v[idKey]), v, p); });
        x.forEach((v, i) => { if (!my.has(v[idKey])) push(path.concat(labelOf(v, i)), 'удалено', v.title || v.name || v.id, undefined); });
        if (x.map(v => v[idKey]).filter(k => my.has(k)).join() !== y.map(v => v[idKey]).filter(k => mx.has(k)).join()) push(path.concat('порядок'), 'изменено', 'прежний порядок', 'новый порядок');
        return;
      }
      const n = Math.max(x.length, y.length);
      for (let i = 0; i < n; i++) { const p = path.concat(i < y.length ? labelOf(y[i], i) : labelOf(x[i], i)); if (i >= x.length) push(p, 'добавлено', undefined, y[i]); else if (i >= y.length) push(p, 'удалено', x[i], undefined); else walk(x[i], y[i], p); }
      return;
    }
    if (isObj(x) && isObj(y)) { new Set([...Object.keys(x), ...Object.keys(y)]).forEach(k => { if (k[0] === '_' ) return; if (!(k in x)) push(path.concat(k), 'добавлено', undefined, y[k]); else if (!(k in y)) push(path.concat(k), 'удалено', x[k], undefined); else walk(x[k], y[k], path.concat(k)); }); return; }
    push(path, 'изменено', x, y);
  };
  walk(a, b, []);
  return {changes: out, more: out.overflow || 0};
}
module.exports = {diff};
