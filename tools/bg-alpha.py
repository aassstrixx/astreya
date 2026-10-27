#!/usr/bin/env python3
"""Фоновые вставки без blend-режима: из непрозрачных текстур (tools/bg-src/*.webp, светлые «на белом») делает полупрозрачные слои (assets/bg/*.webp).

Раньше слой ложился на страницу через mix-blend-mode: multiply — это тяжёлый режим для видеокарты, и при быстрой прокрутке (особенно на телефоне) плитки слоя
не успевали отрисоваться и на фоне мелькали тёмные пятна. Умножение на цвет фона B заменено обычным наложением с прозрачностью — на фоне страницы (#f5f2ec) результат тот же
с точностью до уровня:  a = 1 − min(t), C = B·(t − min(t)) / (1 − min(t)),  out = B·(1 − a) + C·a = B·t.
    python3 tools/bg-alpha.py            # пересобрать assets/bg из tools/bg-src
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(HERE, 'bg-src'), os.path.join(HERE, '..', 'assets', 'bg')
B = np.array([245, 242, 236], dtype=np.float64)                  # --milk


def convert(name):
    t = np.asarray(Image.open(os.path.join(SRC, name)).convert('RGB'), dtype=np.float64) / 255.0
    m = t.min(axis=2, keepdims=True)
    a = 1.0 - m
    c = np.where(a > 1e-6, B * (t - m) / np.maximum(a, 1e-6), B)
    rgba = np.concatenate([np.clip(c, 0, 255), np.clip(a * 255, 0, 255)], axis=2).round().astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    p = os.path.join(OUT, name)
    im.save(p, 'WEBP', quality=70, alpha_quality=60, method=6)
    # проверка по раскодированному файлу: наложение на цвет страницы совпадает с умножением (в уровнях яркости)
    d = np.asarray(Image.open(p).convert('RGBA'), dtype=np.float64)
    over = B * (1 - d[..., 3:] / 255) + d[..., :3] * (d[..., 3:] / 255)
    err = np.abs(over - B * t).mean()
    return os.path.getsize(p) // 1024, round(float(err), 2)


if __name__ == '__main__':
    for f in sorted(os.listdir(SRC)):
        if f.endswith('.webp'):
            print(f, *convert(f), flush=True)
