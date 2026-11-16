#!/bin/bash
# Пробные кадры всех камер в 1/4 размера (Cycles CPU, 2 потока): /tmp/at_trial/<камера>.png; резюмируемо (готовые пропускаются)
cd "$(dirname "$0")"; mkdir -p /tmp/at_trial
export AT_THREADS=2 LOOK_AT='AgX - Punchy' AT_SPP=${AT_SPP:-32}
run() { [ -f /tmp/at_trial/$1.png ] && return; echo "== $1 $(date +%T)"; AT_CAM=$1 AT_W=$2 PREVIEW_OUT=/tmp/at_trial/$1.tmp.png nice python3 atrium_v2.py preview > /tmp/at_trial/$1.log 2>&1 && mv /tmp/at_trial/$1.tmp.png /tmp/at_trial/$1.png; }
run main 600; run mobile 270
echo "ВСЕ ГОТОВО $(date +%T)"; touch /tmp/at_trial/done
