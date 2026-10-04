"""04 · линии и сетка: перекручивающаяся лента из тончайших линий — шёлковая волна графики; сгущения линий дают объём (numpy, мягкое наложение линий)."""
import sys, math, numpy as np
from shade import *

def splat(acc, xs, ys, w):
    ny, nx = acc.shape
    x0 = np.floor(xs).astype(int); y0 = np.floor(ys).astype(int); fx = xs - x0; fy = ys - y0
    for dx, dy, ww in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi = x0 + dx; yi = y0 + dy; ok = (xi >= 0) & (xi < nx) & (yi >= 0) & (yi < ny)
        acc += np.bincount((yi * nx + xi)[ok], weights=(w * ww)[ok] if np.ndim(w) else np.full(ok.sum(), w) * ww[ok], minlength=ny * nx).reshape(ny, nx)

def ribbon(acc, nx, ny, rng, y0, amp, freq, phase, width, tw_freq, tw_phase, lines=170, slope=0.0, x_shift=0.0, strength=0.07):
    """Лента: центр — синусоида, поперечные линии v ∈ [-1, 1] сходятся там, где cos(скручивание) = 0."""
    S = ny / 700.0; n = int(nx * 2.6); u = np.linspace(-0.2, 1.2, n)
    x = u * nx + x_shift
    centre = y0 * ny + slope * (u - 0.5) * ny + amp * ny * np.sin(2 * math.pi * freq * u + phase)
    env = 0.35 + 0.65 * np.sin(np.clip((u + 0.2) / 1.4, 0, 1) * math.pi) ** 0.7          # лента сужается к концам
    wid = width * ny * env * np.cos(2 * math.pi * tw_freq * u + tw_phase)
    for v in np.linspace(-1, 1, lines):
        y = centre + v * wid
        splat(acc, x, y, strength * (0.55 + 0.45 * np.abs(np.cos(2 * math.pi * tw_freq * u + tw_phase))))

def make(W, H, seed=12, out='ribbon.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.10 * H); ny, nx = H + 2 * pad, W + 2 * pad
    acc = np.zeros((ny, nx)); soft = np.zeros((ny, nx))
    # три ленты разной амплитуды, идут слева направо и вверх (содержимое — справа)
    ribbon(acc, nx, ny, rng, 0.62, 0.11, 0.85, 0.3, 0.20, 0.9, 0.4, lines=56, slope=-0.35, strength=0.55)
    ribbon(acc, nx, ny, rng, 0.52, 0.09, 1.05, 1.6, 0.15, 1.3, 2.2, lines=44, slope=-0.30, x_shift=nx * 0.05, strength=0.48)
    ribbon(acc, nx, ny, rng, 0.70, 0.07, 0.7, 2.8, 0.08, 0.8, 1.0, lines=34, slope=-0.40, x_shift=-nx * 0.04, strength=0.42)
    soft = blur(acc, 5.0 * ny / 700)
    acc = blur(acc, 0.45 * ny / 700)
    d = np.clip(acc * 1.0 + soft * 0.9, 0, None)
    # фон: мягкий молочный градиент; линии — тёплая серо-коричневая тушь (чем гуще линии, тем темнее и «объёмнее»)
    yy, xx = np.mgrid[0:ny, 0:nx]; bgv = 0.82 + 0.10 * (xx / nx) - 0.06 * (yy / ny)
    img = bgv - 0.62 * (1 - np.exp(-d * 0.9))
    img = img[pad:-pad, pad:-pad]
    save8(tone(img[..., None] * np.ones(3), [(0.0, (203, 195, 183)), (0.5, (233, 227, 217)), (0.85, (248, 245, 239)), (1.0, (255, 254, 251))], 0.3, 99.8, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 12)), a.get('out', 'ribbon.png'))
