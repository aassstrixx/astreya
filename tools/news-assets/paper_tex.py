"""Бесшовная текстура газетной бумаги для страниц «Новостей» (assets/news/paper.webp, 1024×1024, плитка 512 CSS px = 2× чёткость).
Слои: пятнистость, волокна (светлые и тёмные, с обёрткой по краям), мелкое зерно, редкие крапинки типографской бумаги.
Запуск: python3 tools/news-assets/paper_tex.py"""
import numpy as np, cv2, os
from PIL import Image

N = 1024
rng = np.random.default_rng(5)
base = np.array([241, 234, 217], np.float32) / 255.0

def wblur(a, s):                                                   # размытие с обёрткой по краям (плитка без швов)
    pad = int(s * 4) + 2
    q = cv2.GaussianBlur(np.pad(a, ((pad, pad), (pad, pad)), mode='wrap'), (0, 0), s)
    return q[pad:-pad, pad:-pad]

def noise(s, seed):
    r = np.random.default_rng(seed).standard_normal((N, N)).astype(np.float32)
    r = wblur(r, s); r -= r.mean(); r /= (r.std() + 1e-6); return r

# 1. пятнистость (низкая частота) и «облачка» помола
mott = 0.010 * noise(60, 1) + 0.007 * noise(22, 2) + 0.005 * noise(9, 3)

# 2. волокна: короткие слегка изогнутые штрихи, светлые и тёмные; рисуем с обёрткой (смещения ±N)
light = np.zeros((N, N), np.float32); dark = np.zeros((N, N), np.float32)
def fibre(layer, x, y, ang, ln, curve, val):
    pts = []
    for t in np.linspace(0, 1, 9):
        a = ang + curve * (t - .5)
        pts.append((x + np.cos(a) * ln * (t - .5), y + np.sin(a) * ln * (t - .5)))
    pts = np.array(pts, np.float32)
    for dx in (-N, 0, N):
        for dy in (-N, 0, N):
            if (dx and not (x < 80 or x > N - 80)) or (dy and not (y < 80 or y > N - 80)):
                continue
            cv2.polylines(layer, [np.round((pts + (dx, dy)) * 4).astype(np.int32)], False, val, 1, cv2.LINE_AA, shift=2)
for _ in range(5200):
    fibre(light, rng.uniform(0, N), rng.uniform(0, N), rng.uniform(0, np.pi), rng.uniform(10, 46), rng.uniform(-.9, .9), 1.0)
for _ in range(3600):
    fibre(dark, rng.uniform(0, N), rng.uniform(0, N), rng.uniform(0, np.pi), rng.uniform(8, 36), rng.uniform(-.9, .9), 1.0)
light = wblur(light, 0.55); dark = wblur(dark, 0.5)

# 3. зерно
grain = wblur(rng.standard_normal((N, N)).astype(np.float32), 0.7); grain = grain / grain.std() * 0.016

# 4. крапинки (щепки, примеси): редкие, мелкие, тёмно-коричневые
fl = np.zeros((N, N), np.float32)
for _ in range(160):
    x, y = int(rng.integers(0, N)), int(rng.integers(0, N)); r = float(rng.uniform(0.6, 1.9)); v = float(rng.uniform(0.35, 0.9))
    for dx in (-N, 0, N):
        for dy in (-N, 0, N):
            if abs(dx) + abs(dy) and not (x < 8 or x > N - 8 or y < 8 or y > N - 8): continue
            cv2.ellipse(fl, (x + dx, y + dy), (max(1, int(r * 1.3)), max(1, int(r))), float(rng.uniform(0, 180)), 0, 360, v, -1, cv2.LINE_AA)
fl = wblur(fl, 0.5)

lum = 1.035 + mott + grain + 0.05 * light - 0.034 * dark - 0.20 * fl
img = np.clip(base[None, None, :] * lum[..., None], 0, 1)
# лёгкая тёплая окраска в тенях (волокна и крапинки чуть бурее)
img[..., 2] = np.clip(img[..., 2] - 0.03 * (dark + fl), 0, 1)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'news', 'paper.webp')
Image.fromarray((img * 255 + .5).astype(np.uint8)).save(out, quality=88, method=6)
print('paper.webp', os.path.getsize(out) // 1024, 'КБ')
