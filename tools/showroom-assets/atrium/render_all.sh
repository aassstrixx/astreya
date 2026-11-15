#!/bin/bash
# Резюмируемый рендер всех кадров атриума (Cycles CPU, 2 потока): готовые /tmp/at_raw/*.png пропускаются.
cd "$(dirname "$0")"; mkdir -p /tmp/at_raw
export AT_THREADS=2 LOOK_AT='AgX - Punchy' AT_SPP=${AT_SPP:-80}
run() { # имя камера ширина
  [ -f /tmp/at_raw/$1.png ] && { echo "пропуск $1"; return; }
  echo "== $1 $(date +%T)"; AT_CAM=$2 AT_W=$3 AT_RAW=/tmp/at_raw/$1.tmp.png nice python3 atrium.py still && mv /tmp/at_raw/$1.tmp.png /tmp/at_raw/$1.png
}
[ -f ASTREYA_COMPANY_ATRIUM.blend ] || AT_GLB=/tmp/at_raw/company_atrium.glb nice python3 atrium.py save
run main main 2400
run mobile mobile 1080
run wide wide 2400
run sculpture sculpture 1800
run arch arch 1800
run side side 1800
echo "ВСЕ ГОТОВО $(date +%T)"
