#!/bin/bash
# Расчёт кадров зала для телефона (900×1600) в итоговом состоянии сцены, одним проходом (без дорисовки участков): журнал на столике, упаковки на пороге ниши,
# лишние этикетки скрыты (по умолчанию), ваза с деревом правее (HALL_DXP_P .15: баночка не проходит сквозь вазу — проверка hall_table.py jarvase --portrait), листва выше (HALL_TREE_H .50).
#   OUT=/tmp/zone/pf bash phone_render.sh
# Готовые кадры пропускаются: после сбоя скрипт просто запускают ещё раз. Дальше: phone_build.sh (кодирование в assets/house-hall и блок house.arch).
cd "$(dirname "$0")" || exit 1
O=${OUT:-/tmp/zone/pf}; S=${SAMPLES:-16}
export ZONE_MAG=1 HALL_LAB=1 HALL_LAB_PARTS=packs
T="nice -n 5 python3 hall_table.py"
mkdir -p "$O"
[ -s "$O/track-p.json" ] || $T track "$O/track-p.json" --total 60 --portrait
[ -s "$O/cam-p.json" ]   || $T camtrack "$O/cam-p.json" --total 60 --portrait
echo "ДОРОЖКИ $(date)"
$T anim 0 59 "$O/bg_p" --stride 6 --samples "$S" --total 60 --portrait                 # черновик: каждый 6-й кадр — оценить вид сцены
echo "ЧЕРНОВИК bg_p $(date)"
$T anim 0 59 "$O/z_p"   --layer z   --res 450x800 --total 60 --portrait
echo "ГЛУБИНА z_p $(date)"
$T anim 0 59 "$O/jar_p" --layer jar --samples 20 --total 60 --portrait
echo "СПРАЙТЫ jar_p $(date)"
$T anim 0 59 "$O/bg_p"  --samples "$S" --total 60 --portrait
echo "ГОТОВО bg_p $(date)"
