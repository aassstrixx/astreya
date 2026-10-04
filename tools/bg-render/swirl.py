"""07 · завиток крема: плотная спираль крема, как в баночке, — гладкие валики расходятся дугами от центра за краем кадра, глянцевый гребень, мягкий молочный свет (numpy)."""
import sys, math, numpy as np
from shade import *

def make(W, H, seed=31, out='swirl.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.10 * H); ny, nx = H + 2 * pad, W + 2 * pad; ar = nx / ny
    ys_, xs_ = np.mgrid[0:ny, 0:nx].astype(float); X = (xs_ / nx * 2 - 1) * ar; Y = ys_ / ny * 2 - 1
    cx, cy = 1.25 * ar, -0.25                                   # центр спирали за верхним правым краем: в кадре — широкие дуги
    dx, dy = X - cx, (Y - cy) * 1.1
    r = np.hypot(dx, dy); th = np.arctan2(dy, dx)
    warp = 0.10 * noise(ny, nx, ny * 0.4, rng, 2) + 0.035 * np.sin(3 * th + 2.0)         # лёгкая неровность — «рука» нанесла крем
    spacing = 0.30
    t = (r + warp + 0.5 * spacing * th / math.pi) / spacing                              # одна спираль: радиус растёт с углом
    fr = t - np.floor(t)
    prof = np.sin(math.pi * np.clip(fr + 0.14 * np.sin(2 * math.pi * fr), 0, 1)) ** 1.35  # круглый гребень, чуть скошенный
    env = 0.84 + 0.16 * np.sin(2 * th + 1.2 + 4.0 * r)                                      # разная высота витков (периодично по углу — без шва)
    h = blur(prof * env, ny * 0.003) * 0.11
    h += 0.05 * noise(ny, nx, ny * 0.5, rng, 2) * 0.1
    img = shade(h, k=ny * 0.9, lights=[((-0.85, -0.45, 0.50), (1, 0.96, 0.90), 0.58), ((0.8, 0.7, 0.9), (0.95, 0.97, 1.0), 0.18)], base=(0.94, 0.91, 0.86),
                ambient=(0.52, 0.50, 0.47), cavity=0.22, cav_sigma=ny * 0.03, spec_amount=0.62, spec_pow=65, sheen=0.12)
    img = img[pad:-pad, pad:-pad]
    save8(tone(img, CREAM, 0.5, 99.6, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 31)), a.get('out', 'swirl.png'))
