#!/usr/bin/env python3
"""Лёгкие копии упаковок для списков и ниш: assets/showroom/pack-*.webp → pack-*-s.webp высотой 480 px (журнал, ниши брендов показывают упаковку 60–110 px; 480 px вместо 800–1200).
Запуск: python3 tools/showroom-assets/small.py   (после packs.py; копии, которых нет или которые старше оригинала, пересоздаются)."""
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'showroom')
H = 480
n = 0
for f in sorted(glob.glob(os.path.join(OUT, 'pack-*.webp'))):
    if f.endswith('-s.webp'):
        continue
    s = f[:-5] + '-s.webp'
    if os.path.exists(s) and os.path.getmtime(s) >= os.path.getmtime(f):
        continue
    im = Image.open(f).convert('RGBA'); w = max(1, round(im.width * H / im.height))
    im.resize((w, H), Image.LANCZOS).save(s, 'WEBP', quality=88, method=6, alpha_quality=95); n += 1
print('копий создано:', n)
