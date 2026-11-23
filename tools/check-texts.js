#!/usr/bin/env node
/* Проверка реестра текстов (src/texts-registry.js): каждый ключ реестра используется в шаблонах как T('ключ'), а каждый T('ключ') в шаблонах есть в реестре;
   исходные тексты не пустые и не длиннее своего лимита; значения из data/texts.json проходят проверку (длина, теги, ссылки). Код выхода 1 — есть ошибки. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TX = require(path.join(ROOT, 'src', 'texts.js'));
const used = new Map(), errors = [];
const walk = (d, flat) => fs.readdirSync(d, {withFileTypes: true}).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!flat && e.name !== 'texts') walk(p); return; }
  if (!/\.js$/.test(e.name) || /^texts(-registry)?\.js$/.test(e.name) || (flat && !/^(build|shared|core|showroom|extras|explore|pages|gallery|news-paper|consent|pg-start|pg-search|sales|sales-pages|motion|house)\.js$/.test(e.name))) return;
  const s = fs.readFileSync(p, 'utf8'); let m; const re = /\b(?:T|TX|Traw|AT)\(\s*(['"])([A-Za-z0-9_.-]+)\1/g;
  while ((m = re.exec(s))) { (used.get(m[2]) || used.set(m[2], []).get(m[2])).push(path.relative(ROOT, p)); }
  const dflt = /\b(?:AT|T)\(\s*'([\w.]+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;         // у подписей для скриптов исходный текст стоит прямо в вызове — он должен совпадать с реестром
  while ((m = dflt.exec(s))) { const d = TX.index[m[1]], txt = m[2].replace(/\\(['\\])/g, '$1'); if (d && d.js && d.def !== txt) errors.push(`Ключ «${m[1]}»: исходный текст в ${path.relative(ROOT, p)} («${txt.slice(0, 40)}») не совпадает с реестром («${d.def.slice(0, 40)}»).`); }
  const lit = /(['"])([a-z0-9]+(?:\.[A-Za-z0-9_-]+){2,})\1/g;                       // ключ, переданный помощнику шаблона строкой (например lk('contacts.topics.docs.h'))
  while ((m = lit.exec(s))) if (TX.index[m[2]]) (used.get(m[2]) || used.set(m[2], []).get(m[2])).push(path.relative(ROOT, p));
});
walk(path.join(ROOT, 'src')); walk(path.join(ROOT, 'tools'), true); walk(path.join(ROOT, 'js'), true);
for (const [k, files] of used) if (!TX.index[k]) errors.push(`В шаблоне ${files[0]} используется неизвестный ключ «${k}».`);
const items = Object.values(TX.index);
for (const it of items) {
  if (!used.has(it.key)) errors.push(`Ключ «${it.key}» есть в реестре, но не используется в шаблонах (${it.file}).`);
  if (!it.def.trim() && !it.optional) errors.push(`Ключ «${it.key}»: пустой исходный текст.`);
  if (Array.from(it.def).length > it.max) errors.push(`Ключ «${it.key}»: исходный текст длиннее лимита (${it.max}).`);
}
let over = {}; try { over = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'texts.json'), 'utf8')).items || {}; } catch (e) { errors.push('data/texts.json: ' + e.message); }
for (const [k, v] of Object.entries(over)) TX.problems(k, v).forEach(p => errors.push('data/texts.json → ' + k + ': ' + p));
const pages = new Set(TX.registry.pages.map(p => p.id));
console.log(`Тексты страниц: страниц ${pages.size}, ключей ${items.length}, в шаблонах использовано ${[...used.keys()].filter(k => TX.index[k]).length}, правок заказчика ${Object.keys(over).length}`);
errors.forEach(e => console.log('✗ ' + e));
console.log(errors.length ? `ошибок: ${errors.length}` : 'ошибок: 0');
process.exit(errors.length ? 1 : 0);
