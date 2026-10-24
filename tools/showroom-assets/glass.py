#!/usr/bin/env python3
"""Матовое стекло для панелей витрины (без backdrop-filter): размытая копия архитектуры сцены (подложка + ниша + арка + платформа + растение), которую панель рисует
как фон со смещением, равным её положению на холсте 1536×1024, — получается «стекло», за которым сцена в мягком фокусе, а страница ничего не пересчитывает при прокрутке.
   python3 tools/showroom-assets/glass.py        → assets/showroom/glass.webp (768×512)
Запускать после scene.py (слои должны лежать в assets/showroom/)."""
import json, os
from PIL import Image, ImageFilter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'assets', 'showroom')
W, H = 1536, 1024; K = 2                                                # итоговая картинка вдвое меньше холста: она всё равно размыта
L = json.load(open(os.path.join(OUT, 'layers.json')))
base = Image.open(os.path.join(OUT, 'layer-shell.webp')).convert('RGBA').resize((W // K, H // K), Image.LANCZOS)
for k in ('niche', 'ring', 'dais', 'plant'):
    b = L.get(k)
    if not b: continue
    im = Image.open(os.path.join(OUT, os.path.basename(b['file']))).convert('RGBA'); im = im.resize((max(1, round(b['w'] / K)), max(1, round(b['h'] / K))), Image.LANCZOS)
    base.alpha_composite(im, (round(b['x'] / K), round(b['y'] / K)))
img = base.convert('RGB').filter(ImageFilter.GaussianBlur(float(os.environ.get('GLASS_BLUR', 9))))      # ≈18 px на холсте
a = np.asarray(img).astype(np.float32)
ivory = np.array([250, 246, 237], np.float32); a = a * (1 - .30) + ivory * .30                        # молочная дымка матового стекла
rng = np.random.default_rng(3); a += rng.normal(0, 1.6, a.shape[:2])[..., None]                      # мелкое зерно, чтобы стекло не выглядело плоским
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'glass.webp'), 'WEBP', quality=82, method=6)
print('glass', os.path.getsize(os.path.join(OUT, 'glass.webp')) // 1024, 'КБ')
