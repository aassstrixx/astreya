#!/usr/bin/env python3
"""Доводка сырого кадра стены «Брендов» (brands_wall_v2.py → /tmp/bw_raw.png) в WebP сайта — тот же приём, что finish_hall.py / atrium/finish.py:
экспозиция (при FIN_LMEAN — подбирается так, чтобы среднее L совпало с целью) → контраст по яркости L вокруг среднего (FIN_LC) и лёгкий подъём чёрной точки (FIN_TOE) →
regrade_site.py (среднее a/b → 0,8 / 10,5) со вторым проходом, который подбирает --a/--b так, чтобы итоговое среднее попало в цель → нерезкая маска → подбор качества WebP под предел размера.

  python3 finish_wall.py                       → assets/brands/wall.webp (3072×1390), wall-s.webp (1800 px)
  FIN_OUT=/tmp/x python3 finish_wall.py        → в другую папку (предпросмотр, сайт не трогаем)
Переменные: FIN_RAW (вход, /tmp/bw_raw.png), FIN_A (0.8), FIN_B (10.5) — целевые a/b; FIN_LMEAN (средняя яркость L после доводки, по умолчанию 68,3 — как у атриума; 0 — не подбирать, брать FIN_EV);
FIN_EV (экспозиция, стопов); FIN_LC (1.15) — контраст L; FIN_TOE (0) — подъём чёрной точки по L; FIN_LIM (КБ для wall.webp, 490), FIN_LIM_S (215),
FIN_USM (40) — нерезкая маска после уменьшения (wall-s), FIN_USM_BIG (22) — для wall.webp 3072."""
import os, subprocess, sys, shutil
import numpy as np, cv2
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
OUT = os.environ.get('FIN_OUT', os.path.join(ROOT, 'assets', 'brands')); RAW = os.environ.get('FIN_RAW', '/tmp/bw_raw.png'); TMP = '/tmp/bw_fin'
sys.path.insert(0, os.path.join(HERE, 'auditorium'))
import grade_hall as GH
PW, PH = 3072, 1390


def save_fit(im, dst, limit_kb, qs=(90, 88, 86, 84, 82, 80, 78, 76, 74, 72, 70, 66, 62, 58)):
    for q in qs:
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= limit_kb * 1024: break
    print('  %-12s %dx%d  q%d  %d КБ (предел %d)' % (os.path.basename(dst), im.width, im.height, q, os.path.getsize(dst) // 1024, limit_kb), flush=True)


def tone(rgb, ev, lc, toe):
    f = rgb.astype(np.float32) / 255
    if ev:                                                             # экспозиция в линейном свете
        lin = np.where(f <= .04045, f / 12.92, ((f + .055) / 1.055) ** 2.4) * 2 ** ev
        f = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 1e-9, None), 1 / 2.4) - .055).astype(np.float32)
    lab = cv2.cvtColor(np.clip(f, 0, 1), cv2.COLOR_RGB2LAB); L = lab[..., 0]; m = L.mean(); L1 = np.clip(m + (L - m) * lc, 0, 100)
    lab[..., 0] = np.clip(L1 + toe * np.clip(1 - L1 / 40.0, 0, 1) ** 1.5, 0, 100)
    return (np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB), 0, 1) * 255 + .5).astype(np.uint8)


def main():
    os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    src = os.path.join(TMP, 'wall.png'); rgb = np.asarray(Image.open(RAW).convert('RGB'))
    if rgb.shape[1] != PW: rgb = np.asarray(Image.fromarray(rgb).resize((PW, PH), Image.LANCZOS))
    print('сырой кадр:', GH.stats(GH.lab_of(rgb)))
    lc = float(os.environ.get('FIN_LC', 1.15)); toe = float(os.environ.get('FIN_TOE', 0)); lm = float(os.environ.get('FIN_LMEAN', 68.3)); ev = float(os.environ.get('FIN_EV', 0))
    if lm:                                                             # подбор экспозиции: среднее L после контраста = цель (бисекция по стопам)
        lo, hi = -2.0, 2.0
        for _ in range(9):
            ev = (lo + hi) / 2; cur = GH.lab_of(tone(rgb, ev, lc, toe))[..., 0].mean()
            if cur < lm: lo = ev
            else: hi = ev
    out = tone(rgb, ev, lc, toe); Image.fromarray(out).save(src); print('после EV %+.2f, контраста ×%.2f, чёрной точки %.0f:' % (ev, lc, toe), GH.stats(GH.lab_of(out)))
    rg = os.path.join(HERE, 'regrade_site.py'); ta, tb = float(os.environ.get('FIN_A', .8)), float(os.environ.get('FIN_B', 10.5)); a, b = ta, tb
    usm = lambda im, p: im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=p, threshold=2))
    subprocess.run([sys.executable, rg, src, '--stats'], check=True)
    for it in range(3 if os.environ.get('FIN_EXACT', '1') == '1' else 1):        # подбор --a/--b: итоговое среднее ИМЕННО в файле wall.webp (после сжатия) должно попасть в цель (синие пиксели почти не двигаются, WebP сдвигает a на ≈ −0,1)
        Image.fromarray(out).save(os.path.join(TMP, 'pass.png'))
        subprocess.run([sys.executable, rg, os.path.join(TMP, 'pass.png'), '--a', '%.3f' % a, '--b', '%.3f' % b], check=True)
        big = usm(Image.open(os.path.join(TMP, 'pass.png')).convert('RGB'), int(os.environ.get('FIN_USM_BIG', 22)))
        save_fit(big, os.path.join(OUT, 'wall.webp'), int(os.environ.get('FIN_LIM', 490)))
        got = GH.lab_of(np.asarray(Image.open(os.path.join(OUT, 'wall.webp')).convert('RGB'))); ga, gb = got[..., 1].mean(), got[..., 2].mean()
        da, db = ta - ga, tb - gb
        if abs(da) <= .06 and abs(db) <= .10: break
        a += da; b += db; print('подбор: итог a %.2f b %.2f → следующий проход --a %.3f --b %.3f' % (ga, gb, a, b))
    sm = usm(big.resize((1800, round(1800 * PH / PW)), Image.LANCZOS), int(os.environ.get('FIN_USM', 40))); save_fit(sm, os.path.join(OUT, 'wall-s.webp'), int(os.environ.get('FIN_LIM_S', 215)))
    for n in ('wall.webp', 'wall-s.webp'):
        print('итог %-12s' % n, GH.stats(GH.lab_of(np.asarray(Image.open(os.path.join(OUT, n)).convert('RGB')))))


if __name__ == '__main__':
    main()
