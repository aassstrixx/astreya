"""01 · текстура крема: длинные шёлковые мазки с мягким гребнем. Карта высот из нескольких кривых + шейдинг на numpy (без шума, любое разрешение)."""
import sys, math, numpy as np
from shade import *

def stroke(X, Y, rng, amp, w, ang, off, bend, ends=(0.0, 1.0)):
    """Один мазок: гребень вдоль плавной кривой, асимметричный профиль (круче с одной стороны, длинный спад с другой), сужение к концам."""
    c, s = math.cos(ang), math.sin(ang)
    u = X * c + Y * s; v = -X * s + Y * c
    t = (u - u.min()) / (u.max() - u.min())
    k = [rng.uniform(-1, 1) for _ in range(3)]
    curve = bend * (k[0] * np.sin(1.7 * t + k[1] * 2) + 0.5 * k[2] * np.sin(3.1 * t + k[0] * 3)) + off
    wv = w * (0.65 + 0.7 * np.sin(math.pi * t) ** 0.8) * (0.85 + 0.3 * np.sin(2.2 * t + k[1] * 4))
    d = (v - curve) / wv
    prof = np.where(d < 0, np.exp(-(np.clip(-d, 0, None) * 2.1) ** 2), np.exp(-(np.clip(d, 0, None) * 0.5) ** 2))
    a, b = ends
    env = np.clip((t - a) / 0.22, 0, 1) * np.clip((b - t) / 0.28, 0, 1)
    env = env * env * (3 - 2 * env)
    return amp * prof * env

def make(W, H, seed=7, out='cream.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.08 * H); ny, nx = H + 2 * pad, W + 2 * pad; ar = nx / ny
    xs = np.linspace(-ar, ar, nx); ys = np.linspace(-1, 1, ny); X, Y = np.meshgrid(xs, ys)
    h = np.zeros((ny, nx))
    specs = [(0.055, 0.15, -0.42, 0.62, 0.55, (-0.1, 1.0)), (0.050, 0.13, -0.36, 0.08, 0.62, (0.0, 1.05)), (0.055, 0.17, -0.30, -0.50, 0.50, (-0.05, 0.95)),
             (0.036, 0.09, -0.46, 1.00, 0.50, (0.1, 1.1)), (0.034, 0.08, -0.26, -0.95, 0.45, (-0.1, 0.9)), (0.028, 0.24, -0.40, 0.33, 0.38, (0.0, 1.0))]
    for amp, w, ang, off, bend, ends in specs:
        h += stroke(X, Y, rng, amp, w, ang + rng.uniform(-0.04, 0.04), off + rng.uniform(-0.06, 0.06), bend, ends)
    h = blur(h, ny * 0.0028)
    h += 0.0012 * noise(ny, nx, ny * 0.05, rng, 2)
    img = shade(h, k=ny * 0.9, lights=[((-0.9, -0.45, 0.55), (1, 0.96, 0.9), 0.55), ((0.8, 0.7, 0.9), (0.95, 0.97, 1.0), 0.18)], base=(0.93, 0.89, 0.83),
                ambient=(0.52, 0.50, 0.47), cavity=0.18, cav_sigma=ny * 0.035, spec_amount=0.55, spec_pow=70, sheen=0.10)
    img = img[pad:-pad, pad:-pad]
    save8(tone(img, CREAM), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:])
    w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 7)), a.get('out', 'cream.png'))
