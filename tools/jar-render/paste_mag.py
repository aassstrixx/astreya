#!/usr/bin/env python3
"""Склейка кадров зала с 3D-журналом на столике.

Кадры зала (слой bg, render_zone.sh) считаются без журнала. Журнал дорисовывается отдельно, только в области столика:
    ZONE_MAG=1 python3 hall_table.py magpatch 0 59 /tmp/zone/mag_d [--res 1920x1080 --samples 16]            (телефон: --portrait)
(тот же свет, камера, число проходов и шумоподавление, что у кадров зала — вне журнала участок совпадает с кадром). Здесь участок вклеивается обратно с мягкой границей:
    python3 paste_mag.py /tmp/zone/bg_d /tmp/zone/mag_d /tmp/zone/bg_d_mag [--feather 18]
Результат — полный набор кадров (60 шт.) для encode_arch.py; кадры, где столика нет в кадре, копируются как есть; после HOLD — копии последнего кадра.
"""
import json
import math
import os
import shutil
import sys

import numpy as np
from PIL import Image

HOLD = float(os.environ.get('HALL_HOLD', .93))


def best_offset(bg, crop, x0, y0):
    """точное положение участка: граница рендера округляется по-разному — ищем сдвиг ±2 px, на котором внешнее кольцо участка совпадает с кадром"""
    h, w = crop.shape[:2]
    ring = np.ones((h, w), bool); ring[8:-8, 8:-8] = False
    best = (1e9, 0, 0)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            xs, ys = x0 + dx, y0 + dy
            if xs < 0 or ys < 0 or xs + w > bg.shape[1] or ys + h > bg.shape[0]:
                continue
            d = float(np.abs(bg[ys:ys + h, xs:xs + w][ring] - crop[ring]).mean())
            if d < best[0]:
                best = (d, dx, dy)
    return best


def main():
    a = sys.argv[1:]
    if len(a) < 3:
        print(__doc__); sys.exit(1)
    bgd, pad, outd = a[0], a[1], a[2]
    feather = int(a[a.index('--feather') + 1]) if '--feather' in a else 18
    total = int(a[a.index('--total') + 1]) if '--total' in a else 60
    os.makedirs(outd, exist_ok=True)
    hold = int(math.ceil(HOLD * (total - 1) - 1e-9))
    only = int(a[a.index('--only') + 1]) if '--only' in a else None          # проверка одного кадра
    for i in range(total):
        if only is not None and i != only:
            continue
        src = os.path.join(bgd, '%03d.png' % i); dst = os.path.join(outd, '%03d.png' % i)
        if os.path.exists(dst):
            continue
        if i > hold:
            shutil.copyfile(os.path.join(outd, '%03d.png' % hold), dst); continue
        pj, pp = os.path.join(pad, '%03d.json' % i), os.path.join(pad, '%03d.png' % i)
        if not (os.path.exists(pj) and os.path.exists(pp)):
            shutil.copyfile(src, dst); continue
        bg = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
        crop = np.asarray(Image.open(pp).convert('RGB')).astype(np.float32)
        box = json.load(open(pj))['box']
        H, W = bg.shape[:2]
        x0, y0 = int(round(box[0] * W)), int(round((box[2]) * H))
        d, dx, dy = best_offset(bg, crop, x0, y0)
        x0 += dx; y0 += dy
        h, w = crop.shape[:2]
        h = min(h, H - y0); w = min(w, W - x0)
        crop = crop[:h, :w]
        f = max(2, min(feather, w // 4, h // 4))
        ramp = lambda n: np.minimum(1.0, np.minimum(np.arange(n) + 1, np.arange(n)[::-1] + 1) / float(f))
        ax = ramp(w); ay = ramp(h)
        alpha = np.outer(ay, ax)[..., None]
        if x0 <= 0: alpha[:, :f] = 1.0                                              # у края кадра границы нет
        if y0 <= 0: alpha[:f] = 1.0
        if x0 + w >= W: alpha[:, -f:] = 1.0
        if y0 + h >= H: alpha[-f:] = 1.0
        out = bg.copy()
        out[y0:y0 + h, x0:x0 + w] = bg[y0:y0 + h, x0:x0 + w] * (1 - alpha) + crop * alpha
        Image.fromarray(np.clip(out + .5, 0, 255).astype(np.uint8)).save(dst, compress_level=3)
        print('кадр', i, 'сдвиг', (dx, dy), 'кольцо %.2f' % d, flush=True)


if __name__ == '__main__':
    main()
