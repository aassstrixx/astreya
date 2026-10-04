"""10 · топография кожи: тонкие изолинии плавного поля — как карта рельефа или папиллярный узор; спокойная научная графика (numpy)."""
import sys, numpy as np
from shade import *

def make(W, H, seed=33, out='contours.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.05 * H); ny, nx = H + 2 * pad, W + 2 * pad
    gy, gx = np.mgrid[0:ny, 0:nx].astype(float)
    # поле: крупные холмы + искажение; изолинии — места, где поле кратно шагу
    f = noise(ny, nx, ny * 0.5, rng, 3, 0.45) * 1.0
    w1 = noise(ny, nx, ny * 0.35, rng, 2); w2 = noise(ny, nx, ny * 0.35, rng, 2)
    xs = np.clip(gx + 0.12 * ny * w1, 0, nx - 1).astype(int); ys = np.clip(gy + 0.12 * ny * w2, 0, ny - 1).astype(int)
    f = f[ys, xs]; f = blur(f / f.std(), 1.2)                        # лёгкое сглаживание: ровные линии без «лесенки»
    gy_, gx_ = np.gradient(f); mag = np.hypot(gx_, gy_) + 1e-6
    step = 0.16
    q = f / step; fr = q - np.floor(q)                                   # 0..1 внутри промежутка
    d = np.minimum(fr, 1 - fr) * step / mag                              # расстояние до ближайшей изолинии в пикселях
    line = np.exp(-(d / (0.9 * ny / 700 + 0.35)) ** 2)
    idx = (np.round(q) % 5 == 0)                                         # каждая пятая — основная, толще и темнее
    d5 = np.abs(q - np.round(q / 5) * 5) * step / mag
    main = np.exp(-(d5 / (1.8 * ny / 700 + 0.5)) ** 2)
    shade_f = 0.5 + 0.12 * blur(f, ny * 0.02) / (np.abs(blur(f, ny * 0.02)).max() + 1e-9)       # едва заметный перепад яркости по высоте
    img = shade_f - blur(0.40 * line + 0.55 * main, 0.6)
    img = img[pad:-pad, pad:-pad]
    save8(tone(img[..., None] * np.ones(3), [(0.0, (196, 188, 176)), (0.45, (231, 225, 215)), (0.8, (246, 242, 235)), (1.0, (253, 251, 247))], 0.5, 99.5, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 33)), a.get('out', 'contours.png'))
