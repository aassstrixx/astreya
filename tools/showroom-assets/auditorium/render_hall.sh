#!/bin/bash
# Резюмируемый итоговый рендер зала «Обучения»: 3840×2160, 6 вертикальных полос по 2 за процесс (≈ 20–25 мин на процесс, Cycles CPU, 2 потока, OIDN); готовые полосы пропускаются.
# Результат — /tmp/hv_raw.png; дальше: python3 finish_hall.py   (в фоне: setsid nohup ./render_hall.sh > /tmp/hv_render.log 2>&1 &)
cd "$(dirname "$0")"
export HV_THREADS=2 HV_W=3840 HV_SPP=${HV_SPP:-80} HV_TILES=6 HV_RAW=${HV_RAW:-/tmp/hv_raw.png}
for grp in 0,1 2,3 4,5; do
  echo "== полосы $grp $(date +%T)"; HV_STRIPS=$grp nice python3 hall_v2.py still || exit 1
done
echo "ВСЕ ГОТОВО $(date +%T)"
