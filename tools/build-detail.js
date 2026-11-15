#!/usr/bin/env node
/* Сборка css/js страниц «Товар», «Бренд», «Событие» из общих частей: src/detail/shared.{css,js} + src/detail/<страница>.{css,js} → css/pg-<страница>.css, js/pg-<страница>.js.
   Готовые файлы в репозитории — результат этой сборки (правьте исходники в src/detail/, затем: node tools/build-detail.js && node tools/build.js). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'src', 'detail');
const read = f => fs.existsSync(path.join(SRC, f)) ? fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\s+$/, '') + '\n' : '';
const NOTE = n => `/* ГОТОВЫЙ ФАЙЛ: собран tools/build-detail.js из src/detail/shared.${n} и src/detail/<страница>.${n} — не правьте вручную */\n`;
for (const page of ['product', 'brand', 'event']) {
  for (const ext of ['css', 'js']) {
    const body = read('shared.' + ext) + '\n' + read(page + '.' + ext);
    fs.writeFileSync(path.join(ROOT, ext, `pg-${page}.${ext}`), NOTE(ext) + body);
  }
}
console.log('собраны css/pg-{product,brand,event}.css и js/pg-{product,brand,event}.js');
