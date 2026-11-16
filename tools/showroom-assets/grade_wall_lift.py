#!/usr/bin/env python3
"""Подъём экспозиции стены брендов (assets/brands/wall.webp, wall-s.webp) без перерендера: гамма по яркости L в Lab (средние тона светлее, чёрная и белая точки на месте).
  python3 grade_wall_lift.py [GAMMA=0.86] [--src assets/brands/_backup-wall-v2-2026-11-16] — берёт исходники из резерва и пишет результат в assets/brands/.
Цвет (a, b) не трогается; результат подгоняйте проверкой regrade_site.py --stats. Резерв: assets/brands/_backup-wall-v2-2026-11-16 (опубликованная версия до подъёма)."""
import os, sys, numpy as np, cv2
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'brands')
args = [a for a in sys.argv[1:] if not a.startswith('--')]; G = float(args[0]) if args else 0.86
SRC = os.path.join(ROOT, '_backup-wall-v2-2026-11-16')
def lift(im):
    lab = cv2.cvtColor(np.asarray(im.convert('RGB')), cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0] / 255.0; lab[..., 0] = np.clip(255.0 * np.power(L, G), 0, 255)
    return Image.fromarray(cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2RGB))
for fn, limit in (('wall.webp', 500 * 1024), ('wall-s.webp', 230 * 1024)):
    im = lift(Image.open(os.path.join(SRC, fn))); dst = os.path.join(ROOT, fn)
    for q in (90, 86, 82, 78, 74, 70):
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= limit: break
    print(fn, im.size, 'q%d' % q, os.path.getsize(dst) // 1024, 'КБ')
