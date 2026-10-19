/* QR-код для подключения двухфакторного входа: строится прямо в браузере, без библиотек и без отправки секрета куда-либо ещё.
   Байтовый режим, уровень коррекции M, версии 1–10 (до 213 байт) — для адреса otpauth:// этого достаточно. Реализация по спецификации ISO/IEC 18004. */
(function (root) {
  'use strict';
  const ECC = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];        // уровень M: байт коррекции на блок и число блоков по версиям 1..10
  const rawModules = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  function rsDivisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); } return r; }
  function rsRemainder(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); } return r; }
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let ver = 1; for (; ver <= 10; ver++) { const cap = Math.floor(rawModules(ver) / 8) - ECC[ver - 1] * BLOCKS[ver - 1]; if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) break; }
    if (ver > 10) throw new Error('Текст для QR-кода слишком длинный');
    const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = Math.floor(rawModules(ver) / 8) - ECC[ver - 1] * BLOCKS[ver - 1];
    put(0, Math.min(4, cap * 8 - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap * 8; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // блоки с кодами коррекции и чередование
    const nb = BLOCKS[ver - 1], el = ECC[ver - 1], rawCw = Math.floor(rawModules(ver) / 8), nShort = nb - rawCw % nb, shortLen = Math.floor(rawCw / nb), div = rsDivisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length; const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc)); }
    const out = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) out.push(b[i]); });
    return {ver, codewords: out};
  }
  function matrix(text) {
    const {ver, codewords} = encode(text), size = ver * 4 + 17, mod = Array.from({length: size}, () => new Array(size).fill(false)), fn = Array.from({length: size}, () => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const n = ver === 1 ? 0 : Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, pos = n ? [6] : []; for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    pos.forEach((cx, i) => pos.forEach((cy, j) => { if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const format = mask => {                                     // уровень M = 0b00
      const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const bits = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i)); set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i)); set(8, size - 8, true);
    };
    format(0);
    if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const bits = (ver << 12) | r; for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, bit(bits, i)); set(b, a, bit(bits, i)); } }
    // размещение данных зигзагом
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v; if (!fn[y][x] && k < codewords.length * 8) { mod[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; } } }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0;
      for (let t = 0; t < 2; t++) for (let a = 0; a < size; a++) { let run = 1, prev = null; for (let b = 0; b < size; b++) { const c = t ? mod[b][a] : mod[a][b]; if (c === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { run = 1; prev = c; } } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      const pat = [true, false, true, true, true, false, true];
      for (let t = 0; t < 2; t++) for (let a = 0; a < size; a++) for (let b = 0; b + 7 <= size; b++) { let ok = true; for (let i = 0; i < 7 && ok; i++) ok = (t ? mod[b + i][a] : mod[a][b + i]) === pat[i]; if (!ok) continue; const light = (s, e) => { for (let i = s; i < e; i++) { if (i < 0 || i >= size) continue; if (t ? mod[i][a] : mod[a][i]) return false; } return true; }; if (light(b - 4, b) || light(b + 7, b + 11)) p += 40; }
      let dark = 0; mod.forEach(r => r.forEach(c => { if (c) dark++; })); p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { apply(m); format(m); const p = penalty(); if (p < bestP) { best = m; bestP = p; } apply(m); }
    apply(best); format(best);
    return {size, modules: mod};
  }
  /* SVG-элемент для вставки на страницу (узлы создаются через DOM, без innerHTML) */
  function svg(text, px) {
    const q = matrix(text), quiet = 4, n = q.size + quiet * 2, NS = 'http://www.w3.org/2000/svg', el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', `0 0 ${n} ${n}`); el.setAttribute('width', String(px || 200)); el.setAttribute('height', String(px || 200)); el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'QR-код для приложения-аутентификатора'); el.setAttribute('shape-rendering', 'crispEdges');
    const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', String(n)); bg.setAttribute('height', String(n)); bg.setAttribute('fill', '#fff'); el.append(bg);
    let d = ''; q.modules.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); path.setAttribute('fill', '#000'); el.append(path); return el;
  }
  const api = {matrix, svg};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QR = api;
})(typeof window !== 'undefined' ? window : globalThis);
