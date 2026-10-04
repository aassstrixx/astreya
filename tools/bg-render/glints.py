"""06 · блеск и свет: тонкие светящиеся нити-лучи, сходящиеся в узлы-звёздочки, на тёплом фоне. Рисуется кривыми (Безье) с накоплением яркости: пересечения горят ярче."""
import sys, math, numpy as np
from shade import *

def splat(acc, xs, ys, w):
    """Билинейно добавить яркость w в точки (xs, ys) массива acc."""
    ny, nx = acc.shape
    x0 = np.floor(xs).astype(int); y0 = np.floor(ys).astype(int); fx = xs - x0; fy = ys - y0
    for dx, dy, ww in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi = x0 + dx; yi = y0 + dy; ok = (xi >= 0) & (xi < nx) & (yi >= 0) & (yi < ny)
        acc += np.bincount((yi * nx + xi)[ok], weights=(w * ww)[ok], minlength=ny * nx).reshape(ny, nx)

def bezier(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

def make(W, H, seed=5, out='glints.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.10 * H); ny, nx = H + 2 * pad, W + 2 * pad; S = ny / 700.0
    thin = np.zeros((ny, nx)); soft = np.zeros((ny, nx)); star = np.zeros((ny, nx))
    ang0 = -0.62                                                      # общее направление: снизу-слева вверх-вправо
    nodes = []
    for _ in range(34):
        c = np.array([rng.uniform(0.0, nx), rng.uniform(0.0, ny)]); L = rng.uniform(0.35, 0.95) * nx
        a = ang0 + rng.normal(0, 0.28); d = np.array([math.cos(a), math.sin(a)]); nrm = np.array([-d[1], d[0]])
        p0 = c - d * L / 2; p3 = c + d * L / 2
        p1 = p0 + d * L / 3 + nrm * rng.normal(0, 0.11 * L); p2 = p3 - d * L / 3 + nrm * rng.normal(0, 0.11 * L)
        pts = bezier(p0, p1, p2, p3, int(L * 2.2)); t = np.linspace(0, 1, len(pts))
        env = np.sin(np.pi * t) ** rng.uniform(0.6, 1.6) * (0.5 + 0.5 * np.sin(t * rng.uniform(2, 7) + rng.uniform(0, 6)) ** 2)
        amp = rng.uniform(0.25, 1.0) * rng.choice([1, 1, 0.5])
        splat(thin, pts[:, 0], pts[:, 1], env * amp * 0.5)
        splat(soft, pts[:, 0], pts[:, 1], env * amp * 0.5)
        k = rng.integers(0, len(pts)); nodes.append(pts[k])
    # узлы-звёздочки: яркое ядро + тонкие лучи
    for p in [q for q in nodes if q[0] > nx * 0.35 and q[1] < ny * 0.75][:5]:
        for _ in range(rng.integers(4, 8)):
            a = rng.uniform(0, 2 * math.pi); Ln = rng.uniform(40, 220) * S; t = np.linspace(0, 1, int(Ln * 2))
            splat(star, p[0] + math.cos(a) * Ln * t, p[1] + math.sin(a) * Ln * t, (1 - t) ** 2.2 * rng.uniform(0.6, 1.4))
        splat(star, np.array([p[0]]), np.array([p[1]]), np.array([60.0]))
    thin = blur(thin, 0.9 * S); soft = blur(soft, 6.0 * S); wide = blur(soft, 22.0 * S); star = blur(star, 0.8 * S); core = blur(star, 7 * S)
    n = lambda a: a / (np.percentile(a, 99.8) + 1e-9)
    yy0, xx0 = np.mgrid[0:ny, 0:nx]; u = np.clip((xx0 / nx * 0.75 + (1 - yy0 / ny) * 0.55 - 0.25) / 1.0, 0, 1); mk = 0.12 + 0.88 * u * u * (3 - 2 * u)     # свет сгущается к верхнему правому углу
    light = mk * (0.50 * n(thin) + 0.38 * n(soft) + 0.34 * n(wide) + 0.45 * n(star) + 0.5 * n(core))
    yy, xx = np.mgrid[0:ny, 0:nx]
    base = 0.30 + 0.10 * noise(ny, nx, ny * 0.5, rng, 2) + 0.12 * (1 - xx / nx) * (yy / ny)
    img = base + light
    img = img[pad:-pad, pad:-pad]
    save8(tone(img[..., None] * np.ones(3), [(0.0, (190, 180, 167)), (0.4, (214, 205, 192)), (0.75, (238, 233, 224)), (1.0, (255, 254, 251))], 1.0, 99.7, 0.9), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:])
    w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 5)), a.get('out', 'glints.png'))
