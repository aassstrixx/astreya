"""11 · круги на воде: расходящиеся кольца от капель на глади воды, свет собирается в тонкие блики (numpy; холодный перламутровый тон — под цвет «воды» сайта)."""
import sys, math, numpy as np
from shade import *

PEARL_W = [(0.0, (194, 202, 214)), (0.42, (224, 229, 238)), (0.80, (244, 246, 250)), (1.0, (255, 255, 254))]

def make(W, H, seed=44, out='ripples.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.06 * H); ny, nx = H + 2 * pad, W + 2 * pad; ar = nx / ny
    ys_, xs_ = np.mgrid[0:ny, 0:nx].astype(float); X = (xs_ / nx * 2 - 1) * ar; Y = ys_ / ny * 2 - 1
    h = np.zeros((ny, nx))
    # три капли: центр, длина волны, затухание, фаза
    for cx, cy, wl, decay, amp in [(0.85 * ar, -0.15, 0.115, 0.95, 1.0), (0.35 * ar, 0.45, 0.095, 0.65, 0.7), (1.35 * ar, 0.55, 0.085, 0.5, 0.5)]:
        r = np.hypot(X - cx, (Y - cy) * 1.15)
        front = np.clip((r - 0.0) / 0.02, 0, 1)
        h += amp * np.sin(2 * math.pi * r / wl - rng.uniform(0, 6)) * np.exp(-r / decay * 2.2) * front / (0.25 + r * 3)
    h += 0.03 * noise(ny, nx, ny * 0.25, rng, 2)               # едва заметная общая зыбь
    h = blur(h, ny * 0.0012) * 0.012
    lap = blur(h, 2.0) * 4 - np.roll(h, 1, 0) - np.roll(h, -1, 0) - np.roll(h, 1, 1) - np.roll(h, -1, 1)          # кривизна: где поверхность собирает свет
    img = shade(h, k=ny * 14, lights=[((-0.7, -0.6, 0.6), (1, 0.98, 0.94), 0.5), ((0.8, 0.5, 0.9), (0.95, 0.97, 1.0), 0.25)], base=(0.93, 0.94, 0.96),
                ambient=(0.5, 0.5, 0.51), cavity=0.0, spec_amount=0.9, spec_pow=90, sheen=0.1)
    img = img + (np.clip(lap / (np.abs(lap).max() + 1e-9), -1, 1) * 0.18)[..., None]
    img = img[pad:-pad, pad:-pad]
    save8(tone(img, PEARL_W, 1, 99.7, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 44)), a.get('out', 'ripples.png'))
