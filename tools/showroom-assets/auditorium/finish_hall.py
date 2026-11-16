#!/usr/bin/env python3
"""Доводка сырого кадра зала «Обучения» (hall_v2.py → /tmp/hv_raw.png) в WebP сайта — тот же приём, что atrium/finish.py:
контраст по яркости L вокруг среднего (FIN_LC) → regrade_site.py (среднее a/b → 0,8 / 10,5, синие кресла почти не затрагиваются) → уменьшение + нерезкая маска → подбор качества WebP под предел размера.

  python3 finish_hall.py                       → assets/academy/hall.webp (3840×2160), hall-s.webp (1920×1080), hall-m.webp (1500×1172, кадр для телефона = центральный кроп 1,28:1)
  FIN_OUT=/tmp/x python3 finish_hall.py        → в другую папку (предпросмотр, сайт не трогаем)
Отличия от atrium/finish.py: перед контрастом кадр чуть притемняется (FIN_EV, в стопах: светлый кремовый зал после AgX имел медиану L ≈ 80 против 72 у атриума), а контраст L мягче (1,2 вместо 1,7: в кадре уже есть
тёмно-синие кресла и светлый экран, std L ≈ 21 — у атриума 14); синие кресла почти не затрагиваются regrade_site.py, поэтому среднее a/b после одного прохода выходит чуть мимо цели —
второй проход подбирает аргументы --a/--b так, чтобы итоговое среднее совпало с целью (FIN_EXACT=0 — отключить).
Переменные: FIN_RAW (вход, /tmp/hv_raw.png), FIN_A (0.8), FIN_B (10.5) — целевые a/b; FIN_EV (-0.35) — экспозиция, стопов; FIN_LC (1.2) — контраст L; FIN_TOE (11) — подъём чёрной точки по L (тёмно-синие кресла не «чернеют»); FIN_LIM (КБ для hall.webp, 690), FIN_LIM_S (300), FIN_LIM_M (190), FIN_USM (45) — сила нерезкой маски после уменьшения."""
import os, subprocess, sys, shutil
import numpy as np, cv2
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..', '..')
OUT = os.environ.get('FIN_OUT', os.path.join(ROOT, 'assets', 'academy')); RAW = os.environ.get('FIN_RAW', '/tmp/hv_raw.png'); TMP = '/tmp/hv_fin'
sys.path.insert(0, HERE)
import grade_hall as GH


def save_fit(im, dst, limit_kb, qs=(90, 88, 86, 84, 82, 80, 78, 76, 74, 72, 70, 66, 62)):
    for q in qs:
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= limit_kb * 1024: break
    print('  %-12s %dx%d  q%d  %d КБ (предел %d)' % (os.path.basename(dst), im.width, im.height, q, os.path.getsize(dst) // 1024, limit_kb), flush=True)


def main():
    os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    src = os.path.join(TMP, 'hall.png'); rgb = np.asarray(Image.open(RAW).convert('RGB'))
    print('сырой кадр:', GH.stats(GH.lab_of(rgb)))
    ev = float(os.environ.get('FIN_EV', -.35)); lc = float(os.environ.get('FIN_LC', 1.2))
    f = rgb.astype(np.float32) / 255
    if ev:                                                             # экспозиция в линейном свете (тени пропорционально, синие кресла не «чернеют»)
        lin = np.where(f <= .04045, f / 12.92, ((f + .055) / 1.055) ** 2.4) * 2 ** ev; f = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 1e-9, None), 1 / 2.4) - .055).astype(np.float32)
    toe = float(os.environ.get('FIN_TOE', 11))
    if lc != 1.0 or toe:                                               # контраст по L вокруг среднего + подъём чёрной точки («toe»): иначе контраст ×1,2 давит тёмно-синие кресла в почти чёрное (L ≈ 4 вместо ≈ 14 у #16223e)
        lab = cv2.cvtColor(np.clip(f, 0, 1), cv2.COLOR_RGB2LAB); L = lab[..., 0]; m = L.mean(); L1 = np.clip(m + (L - m) * lc, 0, 100)
        lab[..., 0] = np.clip(L1 + toe * np.clip(1 - L1 / 40.0, 0, 1) ** 1.5, 0, 100); f = np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB), 0, 1)
    rgb = (np.clip(f, 0, 1) * 255 + .5).astype(np.uint8); Image.fromarray(rgb).save(src); print('после EV %+.2f и контраста ×%.2f:' % (ev, lc), GH.stats(GH.lab_of(rgb)))
    rg = os.path.join(HERE, '..', 'regrade_site.py'); ta, tb = float(os.environ.get('FIN_A', .8)), float(os.environ.get('FIN_B', 10.5))
    subprocess.run([sys.executable, rg, src, '--stats'], check=True)
    ref = GH.lab_of(rgb); ra, rb = ref[..., 1].mean(), ref[..., 2].mean(); a, b = ta, tb
    for it in range(2 if os.environ.get('FIN_EXACT', '1') == '1' else 1):
        shutil.copy(os.path.join(TMP, 'hall.png'), os.path.join(TMP, 'pass.png')); Image.fromarray(rgb).save(os.path.join(TMP, 'pass.png'))
        subprocess.run([sys.executable, rg, os.path.join(TMP, 'pass.png'), '--a', '%.3f' % a, '--b', '%.3f' % b], check=True)
        got = GH.lab_of(np.asarray(Image.open(os.path.join(TMP, 'pass.png')).convert('RGB'))); ga, gb = got[..., 1].mean(), got[..., 2].mean()
        if it == 0 and (abs(ga - ta) > .03 or abs(gb - tb) > .06):                       # доля, с которой сдвиг дошёл до цели (синие пиксели почти не двигаются) → подправить аргументы
            ka = (ga - ra) / (a - ra) if abs(a - ra) > 1e-3 else 1.0; kb = (gb - rb) / (b - rb) if abs(b - rb) > 1e-3 else 1.0
            a = ra + (ta - ra) / max(ka, .3); b = rb + (tb - rb) / max(kb, .3); print('второй проход: --a %.3f --b %.3f (доля сдвига a %.2f, b %.2f)' % (a, b, ka, kb))
        else: break
    shutil.copy(os.path.join(TMP, 'pass.png'), src)
    big = Image.open(src).convert('RGB'); W, H = big.size
    usm = lambda im: im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=int(os.environ.get('FIN_USM', 45)), threshold=2))
    if W != 3840: big = big.resize((3840, round(3840 * H / W)), Image.LANCZOS); W, H = big.size
    save_fit(big, os.path.join(OUT, 'hall.webp'), int(os.environ.get('FIN_LIM', 690)))
    sm = usm(big.resize((1920, round(1920 * H / W)), Image.LANCZOS)); save_fit(sm, os.path.join(OUT, 'hall-s.webp'), int(os.environ.get('FIN_LIM_S', 300)))
    cw = round(H * 1.28); x0 = (W - cw) // 2                          # телефон: весь кадр по высоте, центр по ширине (как раньше)
    mob = big.crop((x0, 0, x0 + cw, H)); mob = usm(mob.resize((1500, round(1500 * mob.height / mob.width)), Image.LANCZOS)); save_fit(mob, os.path.join(OUT, 'hall-m.webp'), int(os.environ.get('FIN_LIM_M', 190)))
    for n in ('hall.webp', 'hall-s.webp', 'hall-m.webp'):
        print('итог %-12s' % n, GH.stats(GH.lab_of(np.asarray(Image.open(os.path.join(OUT, n)).convert('RGB')))))


if __name__ == '__main__':
    main()
