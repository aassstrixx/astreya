#!/usr/bin/env python3
"""Бесшовная «зернистость камня» для наложения поверх рендеров (assets/bg/stone-grain.webp, 512×512, RGBA).
Рендеры стен и подиумов после сжатия получаются слишком гладкими; эта плитка добавляет то, что у настоящего травертина и известняка видно глазом:
мелкие тёмные поры (чуть вытянутые по горизонтали, с мягким краем), редкие светлые крупинки и еле заметные облака тона. Накладывается обычным (непрозрачным по краям) слоем
с малой непрозрачностью, без blend-режимов; размер 1:1 (не масштабируется), поэтому зерно остаётся чётким.
   python3 tools/bg-render/stone_grain.py [seed]"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

N = 512
rng = np.random.default_rng(int(sys.argv[1]) if len(sys.argv) > 1 else 7)

def wrap_blur(a, s):
    return ndi.gaussian_filter(a, s, mode='wrap')

# облака тона: сильно размытый шум (плитка замкнута по краям — mode='wrap')
cloud = wrap_blur(rng.standard_normal((N, N)), 38); cloud = (cloud - cloud.mean()) / cloud.std()
cloud2 = wrap_blur(rng.standard_normal((N, N)), 11); cloud2 = (cloud2 - cloud2.mean()) / cloud2.std()
# поры: случайные эллипсы, сглаженные по краю; считаем «глубину» поры
pit = np.zeros((N, N), np.float32)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
for _ in range(430):
    cx, cy = rng.uniform(0, N, 2); rx = rng.choice([.7, .9, 1.2, 1.7, 2.6], p=[.34, .3, .2, .12, .04]); ry = rx * rng.uniform(.5, .85); d = rng.uniform(.4, 1.0)
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            dx = (xx - (cx + ox)) / rx; dy = (yy - (cy + oy)) / ry
            m = np.exp(-(dx * dx + dy * dy) * 1.6)
            if m.max() > .02: pit = np.maximum(pit, (m * d).astype(np.float32))
# светлые крупинки
spk = np.zeros((N, N), np.float32)
for _ in range(260):
    x, y = rng.integers(0, N, 2); spk[y, x] = rng.uniform(.3, 1.0)
spk = np.clip(ndi.gaussian_filter(spk, .7, mode='wrap') * 5.0, 0, 1)
grain = wrap_blur(rng.standard_normal((N, N)), .8); grain = grain / grain.std()

dark = np.clip(pit * .95 + np.clip(-cloud * .06, 0, .12) + np.clip(-grain * .035, 0, .08), 0, 1)
light = np.clip(spk * .6 + np.clip(cloud2 * .035, 0, .08) + np.clip(grain * .035, 0, .08), 0, 1)
a_dark = dark * 0.46; a_light = light * 0.5
alpha = np.clip(a_dark + a_light, 0, 1)
col_dark = np.array([86, 64, 38], np.float32); col_light = np.array([255, 251, 243], np.float32)
w = (a_dark / np.maximum(alpha, 1e-5))[..., None]
rgb = col_dark * w + col_light * (1 - w)
out = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'bg', 'stone-grain.webp')
Image.fromarray(out, 'RGBA').save(dst, 'WEBP', quality=78, method=6, alpha_quality=80)
print('stone-grain.webp', os.path.getsize(dst) // 1024, 'КБ')
