#!/usr/bin/env python3
"""Обрезает прозрачный слой флакона (hall_story.py matte …) до рамки предмета и печатает его положение в % сцены — для data/redesign.json → jar.arch.fg.

    python3 crop_matte.py <matte.png> <вывод.webp> [--pad 6]
"""
import sys

import numpy as np
from PIL import Image


def main():
    a = sys.argv[1:]
    src, out = a[0], a[1]
    pad = int(a[a.index('--pad') + 1]) if '--pad' in a else 6
    im = Image.open(src).convert('RGBA')
    W, H = im.size
    al = np.asarray(im)[..., 3]
    ys, xs = np.where(al > 8)
    x0, x1, y0, y1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1), max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    im.crop((x0, y0, x1, y1)).save(out, 'WEBP', quality=92, method=6)
    print('{"src": "%s", "l": %.3f, "t": %.3f, "w": %.3f}' % (out, 100 * x0 / W, 100 * y0 / H, 100 * (x1 - x0) / W))


if __name__ == '__main__':
    main()
