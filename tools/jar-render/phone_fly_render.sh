#!/bin/bash
# Пролёт камеры к журналу для телефона (портретный кадр 900×1600): расписание, дорожка камеры, углы журнала, цвет и глубина 48 ключей.
# Тот же конвейер, что у ПК (hall_table.py flykeys …, см. README «Пролёт камеры к журналу»), но с флагом --portrait; камера заканчивает над левой страницей разворота
# (страница ≈ 72 % ширины кадра — ZONE_FLIGHT_W_P). Готовые ключи пропускаются: после сбоя скрипт просто запускают ещё раз.
#   OUT=/tmp/zone/pff bash phone_fly_render.sh
cd "$(dirname "$0")" || exit 1
O=${OUT:-/tmp/zone/pff}; S=${SAMPLES:-16}
T="nice -n 5 python3 hall_table.py"
mkdir -p "$O"
export ZONE_FLIGHT_W_P=${ZONE_FLIGHT_W_P:-.72}
export FLY_HIDE=label.011,label.012,label.013,labelh.022,labelh.023,labelh.024,labelh.025,labelh.026,labelh.027,labelm.011,labelm.012,labelm.013     # лишние этикетки (как у ПК)
export ZONE_GLASS_TR=.90 ZONE_GLASS_TG=.97 ZONE_GLASS_TB=.93 ZONE_GLASS_MINR=.08 ZONE_GLASS_ROUGH=.004                                              # стекло стола (как у ПК, v4)
[ -s "$O/sched.json" ]  || $T flykeys sched 49 1 "$O/sched.json" --portrait --res 900x1600 --samples 1
[ -s "$O/cam-f.json" ]  || $T flykeys track 72 3 "$O/cam-f.json" --portrait --res 450x800 --samples 1
[ -s "$O/book.json" ]   || $T flykeys bookq 1 1 "$O/book.json" --portrait --res 270x480 --samples 1
export FLY_WS="$O/sched.json"
$T flykeys color 49 1 "$O/c" --portrait --res 900x1600 --samples "$S"
$T flykeys z 49 1 "$O/z" --portrait --res 450x800
echo "ГОТОВО phone_fly $(date)"
