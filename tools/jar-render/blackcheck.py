#!/usr/bin/env python3
"""Проверка кадров зала после рендера: доля почти чёрных пикселей (яркость < 18).

В нормальном кадре таких пикселей ≈ 0,2–0,5 % (щель между плитами, тёмный флакон). Иногда один проход рендера (процесс Blender) даёт кадры, где часть поверхностей в нише чёрная
(дефект построения сцены в этом процессе: соседний проход тех же кадров чистый) — доля чёрного тогда 3–15 %, а карты глубины и спрайты в порядке. Такие кадры нужно перерисовать в новом процессе.

    python3 blackcheck.py <папка с PNG> [с] [по]     →  печатает номера плохих кадров (доля чёрного > 1 %) или пустую строку
"""
import sys

import numpy as np
from PIL import Image


def main():
    d = sys.argv[1]
    a = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    b = int(sys.argv[3]) if len(sys.argv) > 3 else 59
    bad = []
    for f in range(a, b + 1):
        try:
            im = np.asarray(Image.open('%s/%03d.png' % (d, f)).convert('L').resize((225, 400)))
        except Exception:
            bad.append(f)
            continue
        if float((im < 18).mean()) > 0.01:
            bad.append(f)
    print(' '.join(map(str, bad)))


if __name__ == '__main__':
    main()
