"""08 · молочный шёлк: плавные складки молока или шёлка с перламутровым блеском — спокойная текстура без узора (numpy: многократно искажённый шум + шёлковый шейдинг)."""
import sys, numpy as np
from shade import *

def warped(ny, nx, rng, scale, depth=3, amt=1.5):
    """Шум, несколько раз сдвинутый самим собой: получаются крупные плавные складки (как дым молока в воде)."""
    n = lambda sc, oc=4: noise(ny, nx, sc, rng, oc, 0.5)
    f = n(scale); gy, gx = np.mgrid[0:ny, 0:nx].astype(float)
    for _ in range(depth):
        wx = n(scale * 0.9); wy = n(scale * 0.9)
        xs = np.clip(gx + amt * scale * 0.35 * wx, 0, nx - 1).astype(int); ys = np.clip(gy + amt * scale * 0.35 * wy, 0, ny - 1).astype(int)
        f = f[ys, xs] * 0.7 + n(scale) * 0.3
    return f

def make(W, H, seed=21, out='silk.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.08 * H); ny, nx = H + 2 * pad, W + 2 * pad
    f = blur(warped(ny, nx, rng, ny * 0.32, 3, 1.5), ny * 0.006)
    h = f * 0.075
    img = shade(h, k=ny * 1.1, lights=[((-0.8, -0.5, 0.5), (1, 0.97, 0.92), 0.5), ((0.9, 0.6, 0.8), (0.95, 0.97, 1.0), 0.2)], base=(0.94, 0.91, 0.87),
                ambient=(0.52, 0.5, 0.48), cavity=0.12, cav_sigma=ny * 0.05, spec_amount=0.42, spec_pow=38, sheen=0.14)
    img = img[pad:-pad, pad:-pad]
    save8(tone(img, CREAM, 1, 99.6, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 21)), a.get('out', 'silk.png'))
