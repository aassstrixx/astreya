#!/usr/bin/env node
/* Включает/выключает слой доработок (data/site.json → redesign) и пересобирает сайт.
   node tools/redesign.js off   — вернуть прежний вид (карточки брендов остаются как есть)
   node tools/redesign.js on    — снова включить слой доработок */
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const mode = process.argv[2];
if (mode !== 'on' && mode !== 'off') { console.error('Использование: node tools/redesign.js on|off'); process.exit(1); }
const f = path.join(__dirname, '..', 'data', 'site.json');
const src = fs.readFileSync(f, 'utf8');
const next = /"redesign":\s*(true|false)/.test(src)
  ? src.replace(/"redesign":\s*(true|false)/, `"redesign": ${mode === 'on'}`)
  : src.replace(/("year":\s*\d+,)/, `$1\n  "redesign": ${mode === 'on'}`);
fs.writeFileSync(f, next);
console.log(`Слой доработок: ${mode === 'on' ? 'ВКЛЮЧЁН' : 'ВЫКЛЮЧЕН'} (data/site.json → redesign)`);
execFileSync(process.execPath, [path.join(__dirname, 'build.js')], {stdio: 'inherit'});
execFileSync(process.execPath, [path.join(__dirname, 'check.js')], {stdio: 'inherit'});
