#!/usr/bin/env python3
"""Карты глубины и этикетка для сайта (новый движок js/jar-gl.js).

    python3 encode_depth.py depth <папка PNG от «hall_story.py anim --layer z»> <вывод: …/assets/jar-arch/zd>     # без потерь: R/G — 16-битная обратная глубина
    python3 encode_depth.py label label.png <вывод: …/assets/jar-arch/label.webp> [--width 4096]                  # маска надписей этикетки (белое — чернила)

Глубина кодируется без потерь (WebP lossless): любая ошибка в ней — это сдвиг пикселей при перепроекции, а не просто шум. Маска этикетки — тоже без потерь (чёткие тонкие надписи).
"""
import os
import sys

import numpy as np
from PIL import Image


def depth(src, out):
    os.makedirs(out, exist_ok=True)
    files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
    tot = 0
    for f in files:
        im = Image.open(os.path.join(src, f)).convert('RGB')
        a = np.asarray(im)
        a = np.dstack([a[..., 0], a[..., 1], np.zeros_like(a[..., 0])])           # B не используется — нули лучше сжимаются
        dst = os.path.join(out, f.replace('.png', '.webp'))
        Image.fromarray(a).save(dst, 'WEBP', lossless=True, quality=100, method=6)
        tot += os.path.getsize(dst)
    print(out, len(files), 'кадров,', tot // 1024, 'КБ')


def label(src, out, width=4096):
    im = Image.open(src).convert('L')
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS).convert('RGB')
    im.save(out, 'WEBP', lossless=True, quality=100, method=6)
    print(out, im.size, os.path.getsize(out) // 1024, 'КБ')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'depth':
        depth(a[1], a[2])
    elif a[0] == 'label':
        w = int(a[a.index('--width') + 1]) if '--width' in a else 4096
        label(a[1], a[2], w)
    else:
        print(__doc__)
