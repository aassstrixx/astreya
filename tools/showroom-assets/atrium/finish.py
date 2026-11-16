#!/usr/bin/env python3
"""Доводка сырых кадров атриума (/tmp/at_raw/<имя>.png из render_all.sh) в WebP сайта: цвет под общий цвет сайта (regrade_site.py, hue 83–89°, a ≈ 0,3–1,1, b ≈ 8–13),
лёгкая нерезкая маска после уменьшения, качество подбирается так, чтобы кадр был ≤ 480 КБ.
  python3 finish.py main            → assets/company/atrium.webp (2400) и atrium-s.webp (1200); с FIN_SUFFIX=-v2 — atrium-v2.webp, atrium-v2-s.webp, atrium-v2-m.webp
  python3 finish.py mobile|wide|arch|side|sculpture   → atrium-m.webp | atrium-wide.webp | atrium-arch.webp | atrium-side.webp | atrium-sculpture.webp
Переменные: FIN_A (0.8), FIN_B (10.5) — целевые a/b; FIN_LC (1.7) — контраст L; FIN_RAW (папка сырых кадров, по умолчанию /tmp/at_raw)."""
import os, subprocess, sys, shutil
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..', '..'); OUT = os.path.join(ROOT, 'assets', 'company')
RAW = os.environ.get('FIN_RAW', '/tmp/at_raw'); TMP = '/tmp/at_fin'; SUF = os.environ.get('FIN_SUFFIX', '')       # FIN_SUFFIX=-v2 → atrium-v2.webp, atrium-v2-s.webp, atrium-v2-m.webp (v1 не трогается)
TARGETS = {'main': [('atrium.webp', 2400), ('atrium-s.webp', 1200)], 'mobile': [('atrium-m.webp', 1080)], 'wide': [('atrium-wide.webp', 1800)],
           'arch': [('atrium-arch.webp', 1800)], 'side': [('atrium-side.webp', 1800)], 'sculpture': [('atrium-sculpture.webp', 1800)]}


def save_fit(im, dst, limit=480 * 1024):
    for q in (86, 82, 78, 74, 70, 66, 62):
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= limit: break
    print('  %s  %dx%d  q%d  %d КБ' % (os.path.basename(dst), im.width, im.height, q, os.path.getsize(dst) // 1024))


def main():
    name = sys.argv[1]; os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    src = os.path.join(TMP, name + '.png'); shutil.copy(os.path.join(RAW, name + '.png'), src)
    lc = float(os.environ.get('FIN_LC', 1.7))                  # контраст по яркости L вокруг среднего (сцены сайта — L ±17–20, сырой кадр ±9)
    if lc != 1.0:
        import numpy as np, cv2
        lab = cv2.cvtColor(np.asarray(Image.open(src).convert('RGB')), cv2.COLOR_RGB2LAB).astype(np.float32); L = lab[..., 0]; m = L.mean()
        lab[..., 0] = np.clip(m + (L - m) * lc, 0, 255); Image.fromarray(cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2RGB)).save(src)
    rg = os.path.join(HERE, '..', 'regrade_site.py'); a, b = os.environ.get('FIN_A', '0.8'), os.environ.get('FIN_B', '10.5')
    subprocess.run([sys.executable, rg, src, '--stats'], check=True)
    subprocess.run([sys.executable, rg, src, '--a', a, '--b', b], check=True)
    big = Image.open(src).convert('RGB')
    for fn, w in TARGETS[name]:
        im = big if w >= big.width else big.resize((w, round(big.height * w / big.width)), Image.LANCZOS)
        if w < big.width: im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=2))
        save_fit(im, os.path.join(OUT, fn.replace('atrium', 'atrium' + SUF, 1)))


if __name__ == '__main__':
    main()
