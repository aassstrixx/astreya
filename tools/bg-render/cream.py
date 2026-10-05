"""01 · текстура крема: параллельные плавные волны-валики с глянцевым гребнем (numpy: карта высот + шёлковый шейдинг, без шума)."""
import sys, math, numpy as np
from shade import *

def make(W, H, seed=7, out='cream.png', ang=-0.50, sp=0.50, amp=1.0):
    rng = np.random.default_rng(seed)
    pad = int(0.10 * H); ny, nx = H + 2 * pad, W + 2 * pad; ar = nx / ny
    ys_, xs_ = np.mgrid[0:ny, 0:nx].astype(float); X = (xs_ / nx * 2 - 1) * ar; Y = ys_ / ny * 2 - 1
    # волнистая ось: поперечная координата u смещается синусами по X — получаются S-образные валики, идущие по диагонали
    c, s = math.cos(ang), math.sin(ang)
    U = X * s * -1 + Y * c; V = X * c + Y * s                      # U — поперёк валиков, V — вдоль
    warp = amp * (0.42 * np.sin(1.35 * V + 0.6) + 0.17 * np.sin(2.9 * V + 2.1)) + 0.06 * noise(ny, nx, ny * 0.5, rng, 2)
    spacing = sp * (1.0 + 0.18 * np.sin(0.9 * V + 1.0))        # шаг валиков плавно меняется вдоль
    t = (U + warp) / spacing
    fr = t - np.floor(t)
    prof = np.sin(math.pi * np.clip(fr + 0.10 * np.sin(2 * math.pi * fr), 0, 1)) ** 1.5      # круглый гребень с лёгким перекосом
    env = 0.75 + 0.25 * np.sin(0.7 * V + 2.4 + 1.3 * np.floor(t))                              # высота разных валиков чуть разная
    h = prof * env
    h = blur(h, ny * 0.0035) * 0.10
    img = shade(h, k=ny * 0.85, lights=[((-0.85, -0.45, 0.50), (1, 0.96, 0.90), 0.58), ((0.8, 0.7, 0.9), (0.95, 0.97, 1.0), 0.18)], base=(0.94, 0.91, 0.86),
                ambient=(0.52, 0.50, 0.47), cavity=0.20, cav_sigma=ny * 0.03, spec_amount=0.65, spec_pow=70, sheen=0.12)
    img = img[pad:-pad, pad:-pad]
    save8(tone(img, CREAM, 0.5, 99.6, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 7)), a.get('out', 'cream.png'), float(a.get('ang', -0.5)), float(a.get('sp', 0.5)), float(a.get('amp', 1.0)))
