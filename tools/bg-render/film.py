"""07 · прозрачные плёнки: изогнутая прозрачная плёнка с тонким светлым краем, на ней крупная капля-бусина и мелкие капельки (numpy: дуга-край, подсветка, спрайты капель)."""
import sys, math, numpy as np
from shade import *
from particles import bubble

def drop(L, cx, cy, r):
    """Крупная капля на плёнке: линза с тёмным нижним ободком, светлой верхней кромкой, бликом и отражением окна."""
    ny, nx = L.shape; x0 = int(max(0, cx - r - 3)); x1 = int(min(nx, cx + r + 4)); y0 = int(max(0, cy - r - 3)); y1 = int(min(ny, cy + r + 4))
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float); dx = (xx - cx) / r; dy = (yy - cy) / r; d = np.hypot(dx, dy)
    inside = np.clip((1.0 - d) * r, 0, 1)
    rim_dark = np.exp(-((d - 0.93) / 0.07) ** 2) * (0.5 + 0.5 * (dx * 0.5 + dy * 0.85))              # нижний ободок темнее
    rim_light = np.exp(-((d - 0.97) / 0.04) ** 2) * np.clip(-(dx * 0.6 + dy * 0.8), 0, 1)               # верхний край светлее
    caustic = np.exp(-((np.hypot(dx - 0.30, dy - 0.42) - 0.28) / 0.17) ** 2) * 0.28                      # светлое пятно-каустика у нижнего края
    window = np.exp(-((dx + 0.34) / 0.20) ** 2 - ((dy + 0.36) / 0.13) ** 2)                              # отражение окна сверху слева
    spot = np.exp(-(np.hypot(dx + 0.05, dy - 0.15) / 0.07) ** 2)
    val = L[y0:y1, x0:x1]
    new = val * (0.92 + 0.0 * d) - 0.20 * rim_dark + 0.30 * rim_light + caustic + 0.55 * window + 0.35 * spot - 0.05 * (1 - d) * (dy > 0)
    L[y0:y1, x0:x1] = val * (1 - inside) + inside * new

def make(W, H, seed=15, out='film.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.08 * H); ny, nx = H + 2 * pad, W + 2 * pad; S = ny / 700.0
    yy, xx = np.mgrid[0:ny, 0:nx].astype(float)
    # фон: холодный перламутровый градиент — светлее слева сверху, глубже справа снизу
    L = 0.78 - 0.20 * (xx / nx) * (yy / ny) * 1.6 + 0.10 * (1 - xx / nx) * (1 - yy / ny) + 0.02 * noise(ny, nx, ny * 0.5, rng, 2)
    # плёнка: дуга большого круга; край — тонкая светлая линия с мягкой тенью рядом и вторая линия чуть дальше
    cxc, cyc, R = nx * 1.15, ny * 2.05, ny * 1.72
    dist = np.hypot(xx - cxc, yy - cyc) - R                                  # <0 — внутри круга (под краем), >0 — снаружи
    side = np.clip(-dist / (ny * 0.22), 0, 1)
    L += 0.10 * side ** 1.4 * (1 - 0.5 * np.clip(dist / -ny, 0, 1))              # плёнка слегка светлит то, что под ней
    for off, w, a in ((0.0, 1.5 * S, 0.60), (11 * S, 1.1 * S, 0.28), (-6 * S, 2.6 * S, -0.16)):
        L += a * np.exp(-((dist - off) / w) ** 2)
    L += 0.16 * np.exp(-((dist + 14 * S) / (22 * S)) ** 2)                      # широкий отблеск вдоль внутренней стороны края
    # капли: крупная — в светлой зоне плёнки, мелкие — вокруг и на краю
    drop(L, nx * 0.60, ny * 0.70, 64 * S)
    for x, y, r in ((0.50, 0.82, 11), (0.74, 0.60, 8), (0.80, 0.84, 6), (0.28, 0.40, 9), (0.40, 0.26, 6), (0.66, 0.92, 5), (0.35, 0.62, 5)): bubble(L, nx * x, ny * y, r * S)
    L = L[pad:-pad, pad:-pad]
    save8(tone(L[..., None] * np.ones(3), [(0.0, (190, 193, 202)), (0.45, (224, 226, 233)), (0.8, (243, 244, 248)), (1.0, (255, 255, 253))], 0.5, 99.7, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 15)), a.get('out', 'film.png'))
