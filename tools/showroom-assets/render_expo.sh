#!/bin/bash
# Итоговый рендер слоёв фона каталога (Cycles CPU, строго 2 потока, OIDN HIGH, без DOF): R2 четырьмя полосами по две за процесс (≈ 20 мин на процесс при 64 сэмплах), затем R1 (подложка) и маски.
# Готовые полосы и проходы пропускаются. Результат — $EXPO_RAW (/tmp/expo_raw); дальше: python3 finish_expo.py layers && python3 glass.py
# В фоне:  setsid nohup ./render_expo.sh > /tmp/expo_render.log 2>&1 &
cd "$(dirname "$0")"
export EXPO_THREADS=2 SCENE_W=${SCENE_W:-3072} SCENE_SPP=${SCENE_SPP:-64} EXPO_TILES=4 EXPO_RAW=${EXPO_RAW:-/tmp/expo_raw}
for grp in 0,1 2,3; do
  echo "== R2 полосы $grp $(date +%T)"; EXPO_DO=r2 EXPO_STRIPS=$grp nice python3 render_expo_v2.py layers || exit 1
done
echo "== R1 и маски $(date +%T)"; EXPO_DO=r1,m nice python3 render_expo_v2.py layers || exit 1
echo "ВСЕ ГОТОВО $(date +%T)"
