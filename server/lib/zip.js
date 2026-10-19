/* ZIP-архив собранного сайта для загрузки на обычный хостинг (FTP / файловый менеджер): страницы, стили, скрипты, картинки, sitemap, robots. Исходные данные (data/), сервер и шаблоны не включаются.
   Без зависимостей: записи сжимаются deflate (картинки — без сжатия, они уже сжаты), архив отдаётся потоком, в памяти одновременно — один файл. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const C = require('./config');

const TOP = ['assets', 'css', 'js', 'brands', 'products', 'training', 'news', 'pages', '.well-known'];
const FILES = /^[^/]+\.(html|xml|txt|webmanifest|ico)$/;
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const dos = d => ({time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()});

function list() {
  const out = [];
  const walk = (rel) => { for (const e of fs.readdirSync(path.join(C.ROOT, rel), {withFileTypes: true})) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(r); else if (e.isFile() && !e.name.startsWith('.DS')) out.push(r); } };
  for (const e of fs.readdirSync(C.ROOT, {withFileTypes: true})) { if (e.isFile() && FILES.test(e.name)) out.push(e.name); else if (e.isDirectory() && TOP.includes(e.name)) walk(e.name); }
  return out.sort();
}
/* пишет архив в writable-поток (HTTP-ответ); возвращает {files, bytes} */
async function stream(out) {
  const names = list(), central = []; let offset = 0, bytes = 0;
  let failed = null; out.on('error', e => { failed = e; });
  const write = buf => new Promise((res, rej) => { if (failed) return rej(failed); offset += buf.length; if (out.write(buf)) res(); else out.once('drain', res); });
  for (const rel of names) {
    const file = path.join(C.ROOT, rel), st = fs.statSync(file), data = fs.readFileSync(file), name = Buffer.from(rel, 'utf8'), packed = /\.(webp|png|jpe?g|gif|woff2)$/i.test(rel) || data.length < 64;
    const body = packed ? data : zlib.deflateRawSync(data, {level: 6}), method = packed || body.length >= data.length ? 0 : 8, payload = method === 8 ? body : data, crc = crc32(data), {time, date} = dos(st.mtime);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(payload.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    central.push({name, method, time, date, crc, csize: payload.length, usize: data.length, offset});
    await write(Buffer.concat([lh, name, payload])); bytes += data.length;
  }
  const cdStart = offset; let cdSize = 0;
  for (const e of central) {
    const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(e.method, 10); h.writeUInt16LE(e.time, 12); h.writeUInt16LE(e.date, 14); h.writeUInt32LE(e.crc, 16); h.writeUInt32LE(e.csize, 20); h.writeUInt32LE(e.usize, 24); h.writeUInt16LE(e.name.length, 28); h.writeUInt32LE(e.offset, 42);
    const b = Buffer.concat([h, e.name]); cdSize += b.length; await write(b);
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(cdStart, 16); await write(end);
  return {files: names.length, bytes};
}
module.exports = {list, stream, crc32};
