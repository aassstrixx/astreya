#!/usr/bin/env node
/* Скачивает шрифты (Fraunces, Playfair Display, Manrope) с Google Fonts и кладёт их на сам сайт: assets/fonts/*.woff2 + css/fonts.css.
   Зачем: страницы не должны обращаться к серверам Google — при каждой загрузке адрес посетителя уходил бы за рубеж (трансграничная передача, 152-ФЗ), а в России Google Fonts бывает недоступен.
   Запускать нужно один раз при смене набора шрифтов (нужен интернет): node tools/fetch-fonts.js. Готовые файлы лежат в репозитории, на сборку сайта этот скрипт не влияет. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'assets', 'fonts');
const QUERY = 'family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Playfair+Display:ital,wght@0,500;0,600;1,400;1,500&family=Manrope:wght@400;500;600;700&display=swap';
const SUBSETS = new Set(['cyrillic', 'latin', 'latin-ext']);                 // кириллица для русского текста, латиница для названий брендов и цифр
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
(async () => {
  const css = await (await fetch('https://fonts.googleapis.com/css2?' + QUERY, {headers: {'User-Agent': UA}})).text();
  const faces = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)].map(m => {
    const b = m[2], g = r => (b.match(r) || [])[1];
    return {subset: m[1], family: g(/font-family:\s*'([^']+)'/), style: g(/font-style:\s*(\w+)/), weight: +g(/font-weight:\s*(\d+)/), url: g(/url\((https:[^)]+)\)/), range: g(/unicode-range:\s*([^;]+);/)};
  }).filter(f => SUBSETS.has(f.subset) && f.url);
  // одна и та же переменная гарнитура отдаётся для нескольких начертаний — объединяем в диапазон веса
  const groups = new Map();
  for (const f of faces) { const k = [f.family, f.style, f.subset, f.url].join('|'); const g = groups.get(k) || Object.assign({}, f, {min: f.weight, max: f.weight}); g.min = Math.min(g.min, f.weight); g.max = Math.max(g.max, f.weight); groups.set(k, g); }
  fs.mkdirSync(OUT, {recursive: true});
  const files = new Map(), blocks = [];
  for (const g of groups.values()) {
    if (!files.has(g.url)) {
      const buf = Buffer.from(await (await fetch(g.url, {headers: {'User-Agent': UA}})).arrayBuffer());
      const name = g.family.toLowerCase().replace(/\s+/g, '-') + (g.style === 'italic' ? '-italic' : '') + '-' + g.subset + '-' + crypto.createHash('md5').update(buf).digest('hex').slice(0, 6) + '.woff2';
      fs.writeFileSync(path.join(OUT, name), buf); files.set(g.url, name);
    }
    blocks.push(`/* ${g.family} ${g.style} ${g.subset} */\n@font-face{font-family:'${g.family}';font-style:${g.style};font-weight:${g.min === g.max ? g.min : g.min + ' ' + g.max};font-display:swap;src:url(../assets/fonts/${files.get(g.url)}) format('woff2');unicode-range:${g.range}}`);
  }
  fs.writeFileSync(path.join(ROOT, 'css', 'fonts.css'), '/* Шрифты хранятся на сайте (tools/fetch-fonts.js): страницы не обращаются к серверам Google. */\n' + blocks.join('\n') + '\n');
  console.log('Файлов шрифтов: ' + files.size + ', правил @font-face: ' + blocks.length);
})().catch(e => { console.error(e); process.exit(1); });
