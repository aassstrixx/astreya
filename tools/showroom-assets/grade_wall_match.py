#!/usr/bin/env python3
"""Цветокор стены брендов «как в каталоге» без перерендера: assets/brands/wall.webp, wall-s.webp.
Каталог (layer-shell + подиумы): L ≈ 65,5±19, a ≈ 0,9–1,2, b ≈ 12,6, солнечный тёплый тон. Стена брендов после перерисовки была холоднее и мягче (L 68±15, b 10,5).
Приём (Lab, 8 бит): контраст по L вокруг среднего ×C, гамма G, лёгкая тёплая прибавка к a и b (a·A + da, b·B + db).
  python3 grade_wall_match.py [C=1.2] [G=0.92] [B=1.2] [DB=0.4] [DA=0.35]   — берёт исходники из assets/brands/_backup-wall-v2-2026-11-16 (версия до подъёма яркости).
Проверка: python3 tools/showroom-assets/regrade_site.py assets/brands/wall.webp --stats"""
import os, sys, numpy as np, cv2
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'brands')
SRC = os.path.join(ROOT, '_backup-wall-v2-2026-11-16')
v = [float(x) for x in sys.argv[1:]] + [None] * 5
C, G, B, DB, DA = (v[0] or 1.2), (v[1] or .92), (v[2] or 1.2), (v[3] if v[3] is not None else .4), (v[4] if v[4] is not None else .35)

def grade(im):
    lab = cv2.cvtColor(np.asarray(im.convert('RGB')), cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0]; m = L.mean()
    L = np.clip(m + (L - m) * C, 0, 255) / 255.0
    lab[..., 0] = np.clip(255.0 * np.power(L, G), 0, 255)
    lab[..., 1] = np.clip(128 + (lab[..., 1] - 128) * B + DA, 0, 255)
    lab[..., 2] = np.clip(128 + (lab[..., 2] - 128) * B + DB, 0, 255)
    return Image.fromarray(cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2RGB))

for fn, limit in (('wall.webp', 500 * 1024), ('wall-s.webp', 230 * 1024)):
    im = grade(Image.open(os.path.join(SRC, fn))); dst = os.path.join(ROOT, fn)
    for q in (90, 86, 82, 78, 74, 70):
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= limit: break
    print(fn, im.size, 'q%d' % q, os.path.getsize(dst) // 1024, 'КБ')
