#!/bin/bash
# Резюмируемый рендер всех кадров атриума v2 (Cycles CPU, 2 потока, полосами по AT_TILES): готовые /tmp/at_raw2/*.png пропускаются,
# готовые полосы (<имя>.tmp_tN.png) после перезапуска не пересчитываются. После каждого кадра — доводка (finish.py) в assets/company/.
#   setsid nohup ./render_all_v2.sh > /tmp/atrium2.log 2>&1 &
cd "$(dirname "$0")"; mkdir -p /tmp/at_raw2
export AT_THREADS=2 LOOK_AT='AgX - Punchy' AT_SPP=${AT_SPP:-80} AT_TILES=${AT_TILES:-3} FIN_RAW=/tmp/at_raw2 FIN_SUFFIX=-v2 FIN_LC=${FIN_LC:-1.55}
run() { # имя камера ширина
  [ -f /tmp/at_raw2/$1.png ] && { echo "пропуск $1"; return; }
  echo "== $1 $(date +%T)"; AT_CAM=$2 AT_W=$3 AT_RAW=/tmp/at_raw2/$1.tmp.png nice python3 atrium_v2.py still && mv /tmp/at_raw2/$1.tmp.png /tmp/at_raw2/$1.png
  [ -f /tmp/at_raw2/$1.png ] && python3 finish.py $1 > /tmp/at_raw2/$1.finish.log 2>&1; echo "== $1 готов $(date +%T)"
}
run main main 2400
run mobile mobile 1080
echo "ВСЕ ГОТОВО $(date +%T)"; touch /tmp/at_raw2/done
