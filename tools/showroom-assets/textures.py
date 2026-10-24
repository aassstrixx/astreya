#!/usr/bin/env python3
"""Текстуры сцены шоурума (бесшовные плитки): травертин для подиумов/ступеней и мелкое зерно штукатурки для стены.
   python3 tools/showroom-assets/textures.py  →  assets/showroom/travertine.webp, assets/showroom/grain.webp"""
import numpy as np, os
from scipy import ndimage as ndi
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'showroom'); os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)

def periodic_noise(n, sx, sy):
    w = rng.standard_normal((n, n)); w = ndi.gaussian_filter(w, (sy, sx), mode='wrap'); w -= w.mean(); return w / (w.std() + 1e-9)

n = 512
base = np.array([232, 220, 198], float)                                # тёплый песочный
low = periodic_noise(n, 70, 70) * 0.55 + periodic_noise(n, 26, 26) * 0.3                         # крупные пятна
veins = periodic_noise(n, 110, 2.2)                                    # горизонтальные полосы слоёв
veins2 = periodic_noise(n, 60, 1.2)
pores = periodic_noise(n, 3.2, 1.0)                                    # поры: вытянутые тёмные чёрточки
pore_mask = np.clip((pores - 1.55) * 1.6, 0, 1)
fine = periodic_noise(n, .9, .9)
lum = 1 + 0.018 * low + 0.022 * veins + 0.012 * veins2 + 0.006 * fine - 0.12 * pore_mask
warm = 1 + 0.012 * periodic_noise(n, 90, 6)
img = np.zeros((n, n, 3)); img[..., 0] = base[0] * lum * warm; img[..., 1] = base[1] * lum; img[..., 2] = base[2] * lum * (2 - warm)
img = np.clip(img, 0, 255).astype(np.uint8)
Image.fromarray(img).save(os.path.join(OUT, 'travertine.webp'), 'WEBP', quality=74, method=6)

g = 256
a = ndi.gaussian_filter(rng.standard_normal((g, g)), .7, mode='wrap'); a = a / a.std()
b = ndi.gaussian_filter(rng.standard_normal((g, g)), 2.2, mode='wrap'); b = b / b.std()
v = a * .8 + b * .6
alpha = np.clip(np.abs(v) * 15, 0, 34).astype(np.uint8)
col = np.where(v[..., None] > 0, np.array([255, 250, 238]), np.array([112, 82, 44])).astype(np.uint8)
rgba = np.dstack([col, alpha]); Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'grain.webp'), 'WEBP', lossless=True, method=6)
for f in ('travertine.webp', 'grain.webp'): print(f, os.path.getsize(os.path.join(OUT, f)))
