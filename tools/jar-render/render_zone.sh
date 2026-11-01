#!/bin/bash
# Полный расчёт кадров зала с «зоной ожидания» (hall_table.py): дорожки, карты глубины, спрайты баночки, ключевые кадры зала — ПК (1920×1080) и телефон (900×1600).
# Готовые кадры пропускаются: после сбоя скрипт просто запускают ещё раз. Результат — PNG в $OUT (по умолчанию /tmp/zone); кодирование — encode_*.py (см. docs/ASTREYA-HOUSE.md).
#   OUT=/tmp/zone bash render_zone.sh
cd "$(dirname "$0")" || exit 1
O=${OUT:-/tmp/zone}
S=${SAMPLES:-16}
T="python3 hall_table.py"
mkdir -p "$O"
[ -s "$O/track-d.json" ]  || $T track "$O/track-d.json" --total 60
[ -s "$O/track-p.json" ]  || $T track "$O/track-p.json" --total 60 --portrait
[ -s "$O/cam-d.json" ]    || $T camtrack "$O/cam-d.json" --total 60
[ -s "$O/cam-p.json" ]    || $T camtrack "$O/cam-p.json" --total 60 --portrait
$T anim 0 59 "$O/z_d"   --layer z   --res 960x540 --total 60
$T anim 0 59 "$O/jar_d" --layer jar --samples 20 --total 60
$T anim 0 59 "$O/bg_d"  --samples "$S" --total 60
$T anim 0 59 "$O/z_p"   --layer z   --res 450x800 --total 60 --portrait
$T anim 0 59 "$O/jar_p" --layer jar --samples 20 --total 60 --portrait
$T anim 0 59 "$O/bg_p"  --samples "$S" --total 60 --portrait
echo "ГОТОВО $(date)"
