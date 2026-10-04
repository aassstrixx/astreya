"""09 · микрочастицы: веер тончайших стеклянных нитей-дуг и россыпь мелких пузырьков на тёплом фоне (numpy: линии с накоплением блеска + спрайты пузырьков)."""
import sys, math, numpy as np
from shade import *
from ribbon import splat

def arcs(acc, hi, nx, ny, rng, cx, cy, r0, r1, a0, a1, count, wob, strength, hi_strength):
    """Пучок дуг: радиус растёт от r0 до r1, угол от a0 до a1; нити слегка «дышат» (wob) — получается веер, как перо или раковина."""
    n = 2600; a = np.linspace(a0, a1, n)
    for k in range(count):
        t = k / (count - 1); R = r0 + (r1 - r0) * t ** 1.05
        ph = rng.uniform(0, 6.28)
        Rk = R * (1 + wob * np.sin(a * 2.2 + ph + 3 * t)) + 0.0
        env = np.clip(np.sin(np.clip((a - a0) / (a1 - a0), 0, 1) * math.pi) * 2.2, 0, 1) ** 0.8
        x = cx + Rk * np.cos(a); y = cy + Rk * np.sin(a)
        m = (x > -5) & (x < nx + 5) & (y > -5) & (y < ny + 5)
        splat(acc, x[m], y[m], strength * env[m] * (0.6 + 0.4 * np.sin(a[m] * 5 + ph) ** 2))
        splat(hi, x[m], y[m] + 1.2, hi_strength * env[m] * (0.3 + 0.7 * np.abs(np.sin(a[m] * 3.1 + t * 9))))

def bubble(L, cx, cy, r):
    """Пузырёк-спрайт на яркостной карте: светлая середина, тёмный ободок, блик и рефлекс."""
    ny, nx = L.shape; x0 = int(max(0, cx - r - 2)); x1 = int(min(nx, cx + r + 3)); y0 = int(max(0, cy - r - 2)); y1 = int(min(ny, cy + r + 3))
    if x1 <= x0 or y1 <= y0: return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float); d = np.hypot(xx - cx, yy - cy) / r
    inside = np.clip((1.0 - d) * r, 0, 1)                                           # мягкий край в 1 пиксель
    rim = np.exp(-((d - 0.9) / 0.1) ** 2)                                           # тёмный ободок
    refl = np.exp(-((np.hypot(xx - (cx + 0.38 * r), yy - (cy + 0.38 * r)) / r - 0.0) / 0.34) ** 2)       # светлый рефлекс снизу справа
    spec = np.exp(-(np.hypot(xx - (cx - 0.38 * r), yy - (cy - 0.42 * r)) / (0.17 * r)) ** 2)             # блик сверху слева
    body = 0.12 * np.exp(-((d - 0.55) / 0.5) ** 2)
    val = L[y0:y1, x0:x1]
    val = val * (1 - 0.9 * inside) + inside * (val * 0.94 + body + 0.17 * refl - 0.20 * rim + 0.55 * spec)
    L[y0:y1, x0:x1] = val

def make(W, H, seed=9, out='particles.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.08 * H); ny, nx = H + 2 * pad, W + 2 * pad; S = ny / 700.0
    acc = np.zeros((ny, nx)); hi = np.zeros((ny, nx))
    # два почти параллельных пучка с лёгким смещением центров: даёт плавные муаровые переливы, а не хаос
    arcs(acc, hi, nx, ny, rng, nx * 1.05, -ny * 0.05, ny * 0.30, ny * 1.15, math.radians(86), math.radians(206), 300, 0.018, 0.12, 0.30)
    arcs(acc, hi, nx, ny, rng, nx * 1.09, -ny * 0.02, ny * 0.34, ny * 1.12, math.radians(92), math.radians(200), 220, 0.022, 0.10, 0.26)
    acc = blur(acc, 0.5 * S); hi = blur(hi, 0.55 * S); glow = blur(hi, 6 * S)
    yy, xx = np.mgrid[0:ny, 0:nx]
    bg = 0.60 + 0.18 * (xx / nx) - 0.14 * (yy / ny) + 0.05 * noise(ny, nx, ny * 0.6, rng, 2)
    L = bg - 0.55 * (1 - np.exp(-acc * 1.0)) + 0.70 * (1 - np.exp(-hi * 1.1)) + 0.35 * glow
    # пузырьки: у границы пучка и россыпью
    pts = []
    for _ in range(95):
        r = 3 + abs(rng.normal(0, 5.5)); 
        while True:
            x = rng.uniform(0.35, 1.0) * nx; y = rng.uniform(0.0, 0.85) * ny
            if np.hypot(x - nx * 1.02, y) > ny * 0.3: break
        pts.append((x, y, r * S))
    for k in range(4): pts.append((rng.uniform(0.55, 0.95) * nx, rng.uniform(0.1, 0.7) * ny, rng.uniform(18, 30) * S))
    for x, y, r in sorted(pts, key=lambda p: p[2]): bubble(L, x, y, r)
    L = L[pad:-pad, pad:-pad]
    save8(tone(L[..., None] * np.ones(3), [(0.0, (190, 181, 168)), (0.45, (226, 219, 207)), (0.8, (245, 241, 233)), (1.0, (255, 254, 251))], 0.5, 99.7, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 9)), a.get('out', 'particles.png'))
