#!/usr/bin/env python3
"""Суперсэмплинг кадров зала: рендер идёт КРУПНЕЕ (×1,5), затем кадры уменьшаются до размера, который ждёт остальная сборка (bake_jar, apply_fly, encode_arch).
Мелкие предметы (флаконы на полках, баночки на столике) получают чистые края и меньше шума: проверено на кадре 30 — край помпы и пипетки чёткий, при том же итоговом размере 1920×1080.
   python3 downscale.py <папка с PNG> <ШxВ>      — уменьшает на месте только те PNG, размер которых отличается (повторный запуск безопасен)"""
import glob, os, sys
from PIL import Image

d, size = sys.argv[1], tuple(int(v) for v in sys.argv[2].lower().split('x'))
n = 0
for f in sorted(glob.glob(os.path.join(d, '*.png'))):
    im = Image.open(f)
    if im.size == size:
        continue
    im = im.convert('RGB'); im.resize(size, Image.LANCZOS).save(f, optimize=False); n += 1
print('уменьшено кадров:', n, '→', size[0], 'x', size[1], flush=True)
