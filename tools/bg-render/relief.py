"""04 · микро-рельеф кожи: тончайшая сетка-ячейка поверх мягких складок, глубина резкости (numpy, ячейки Вороного вдоль складок)."""
import sys, math, numpy as np
from shade import *
from cream import stroke

def hash2(ix, iy, seed, k):
    h = (ix.astype(np.uint64) * np.uint64(374761393) + iy.astype(np.uint64) * np.uint64(668265263) + np.uint64(seed * 1442695041 + k * 2654435761)) & np.uint64(0xFFFFFFFF)
    h = ((h ^ (h >> np.uint64(13))) * np.uint64(1274126177)) & np.uint64(0xFFFFFFFF)
    h = h ^ (h >> np.uint64(16))
    return (h & np.uint64(0xFFFF)).astype(np.float64) / 65535.0

def voronoi(gx, gy, seed):
    """Расстояния до двух ближайших точек (F1, F2) на кадре с дрожащей сеткой."""
    ix = np.floor(gx); iy = np.floor(gy); d1 = np.full(gx.shape, 9.0); d2 = np.full(gx.shape, 9.0)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx = ix + dx; cy = iy + dy
            px = cx + 0.15 + 0.7 * hash2(cx, cy, seed, 1); py = cy + 0.15 + 0.7 * hash2(cx, cy, seed, 2)
            d = np.hypot(gx - px, gy - py)
            m = d < d1; d2 = np.where(m, d1, np.minimum(d2, d)); d1 = np.where(m, d, d1)
    return d1, d2

def make(W, H, seed=11, out='relief.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.08 * H); ny, nx = H + 2 * pad, W + 2 * pad; ar = nx / ny
    xs = np.linspace(-ar, ar, nx); ys = np.linspace(-1, 1, ny); X, Y = np.meshgrid(xs, ys)
    # крупные мягкие складки полотна
    F = np.zeros((ny, nx))
    for amp, w, ang, off, bend, ends in [(0.30, 0.34, -0.55, 0.15, 0.5, (-0.1, 1.0)), (0.22, 0.26, -0.48, -0.45, 0.45, (0.0, 1.1)), (0.18, 0.40, -0.6, 0.7, 0.4, (-0.1, 1.0))]:
        F += stroke(X, Y, rng, amp, w, ang, off, bend, ends)
    F = blur(F, ny * 0.012) + 0.05 * noise(ny, nx, ny * 0.3, rng, 2)
    gy_, gx_ = np.gradient(F, ys, xs)
    # ячейки сети: мельче вдали (верх), крупнее вблизи (низ); сетка «стекает» по складкам
    v = (Y + 1) / 2
    sc = 38 + 34 * (1 - v)
    wx = X + 0.55 * gx_ * 0.2 + 0.03 * noise(ny, nx, ny * 0.04, rng, 2)
    wy = Y + 0.55 * gy_ * 0.2 + 0.03 * noise(ny, nx, ny * 0.04, rng, 2)
    d1, d2 = voronoi(wx * sc, wy * sc, seed)
    e = d2 - d1                                       # ≈ 0 на границах ячеек
    thread = np.exp(-(e / 0.11) ** 2)                 # нити по границам
    pillow = np.clip(1 - d1 / 0.8, 0, 1) ** 0.8       # купол ячейки
    focus = np.exp(-((Y - 0.35) / 0.65) ** 2) * (0.35 + 0.65 * np.clip((X + 0.2) / 1.2, 0, 1) ** 0.7)   # сеть заметнее в нижней части и правее
    hf = (0.55 * pillow - 0.45 * thread) * 0.0024 * focus
    h = F * 0.35 + hf
    k = ny * 0.9
    img = shade(h, k=k, lights=[((-0.8, -0.5, 0.45), (1, 0.96, 0.9), 0.52), ((0.9, 0.6, 0.7), (0.95, 0.97, 1.0), 0.18)], base=(0.93, 0.90, 0.85), ambient=(0.52, 0.50, 0.47),
                cavity=0.15, cav_sigma=ny * 0.03, spec_amount=0.45, spec_pow=50, sheen=0.08)
    # нити блестят: тонкие светлые линии вдоль границ ячеек, сильнее на гребне складки
    ridge = np.clip(blur(F, ny * 0.01) / (F.max() + 1e-9), 0, 1)
    img += (thread * focus * (0.10 + 0.22 * ridge))[..., None] * np.array([1.0, 0.98, 0.94])
    # глубина резкости: резко в нижней-правой части, размыто к верху-левому углу
    soft = blur(img.mean(-1), ny * 0.012)[..., None] * np.ones(3) if False else None
    bl = np.stack([blur(img[..., c], ny * 0.010) for c in range(3)], -1)
    m = np.clip(0.2 + 0.9 * (1 - focus), 0, 1)[..., None]
    img = img * (1 - m * 0.75) + bl * (m * 0.75)
    img = img[pad:-pad, pad:-pad]
    save8(tone(img, CREAM), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:])
    w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 11)), a.get('out', 'relief.png'))
