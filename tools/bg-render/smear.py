"""07 · мазок крема: широкий густой мазок крема на гладкой поверхности — как образец-«свотч» в косметической рекламе. Округлая «головка», мазок уходит дугой вверх,
по краям мягкие бортики, вдоль движения руки — частые тонкие бороздки; рядом мягкая тень (numpy: расстояние до кривой → профиль толщины → шейдинг)."""
import sys, math, numpy as np
from PIL import Image
from shade import *

def bez(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

def up(a, shape):
    return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((shape[1], shape[0]), Image.BICUBIC), float)

def spline(pts, n=600):
    """Гладкая кривая Катмулла — Рома через опорные точки."""
    P = np.array(pts, float); P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]]); out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]; t = np.linspace(0, 1, n // (len(P) - 3), endpoint=False)[:, None]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2][None, :]); return np.vstack(out)

def smooth01(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t)

def stroke(xs, ys, path, wfun, tail_from, seed, shape):
    """Толщина мазка вдоль кривой path: ширина wfun(s), округлое начало, бортики, бороздки вдоль движения. xs, ys — сетка (в единицах высоты кадра)."""
    ny, nx = shape
    seg = np.hypot(*np.diff(path, axis=0).T); sarc = np.concatenate([[0], np.cumsum(seg)]); sarc /= sarc[-1]
    tan = np.gradient(path, axis=0); tan /= np.linalg.norm(tan, axis=1, keepdims=True); nor = np.stack([-tan[:, 1], tan[:, 0]], 1)
    my, mx = xs.shape; P = np.stack([xs, ys], -1).reshape(-1, 2); best = np.zeros(len(P), int); bd = np.full(len(P), 1e9)
    for a in range(0, len(path), 40):
        d2 = ((P[:, None, :] - path[None, a:a + 40, :]) ** 2).sum(-1); k = d2.argmin(1); v = d2[np.arange(len(P)), k]
        m = v < bd; bd[m] = v[m]; best[m] = a + k[m]
    s = sarc[best].reshape(my, mx); dist = np.sqrt(bd).reshape(my, mx)
    side = (((P - path[best]) * nor[best]).sum(-1)).reshape(my, mx)
    along = (((P - path[best]) * tan[best]).sum(-1)).reshape(my, mx)                                    # у круглого начала мазка отрицательно: продолжает координату вдоль пути «назад»
    length = np.hypot(*np.diff(path, axis=0).T).sum()
    lpath = s * length + along
    s, dist, side, lpath = up(s, shape), up(dist, shape), up(side, shape), up(lpath, shape)                                       # непрерывные поля растягиваем по отдельности; знак ставим уже на полном размере
    w = wfun(s)
    u = np.where(side >= 0, 1, -1) * dist / w                                                          # со знаком; за началом пути — круглая шапка
    inside = np.clip((1 - np.abs(u)) * 6, 0, 1)
    body = np.clip(1 - u ** 2, 0, 1) ** 0.6
    berm = 0.15 * np.exp(-((np.abs(u) - 0.85) / 0.09) ** 2)
    head = 1 + 0.45 * np.exp(-(np.clip(lpath, 0, None) / 0.16) ** 2)                                  # утолщение в начале мазка, плавно (без излома там, где кончается круглая шапка)
    r2 = np.random.default_rng(seed); K = 320
    def line(sigma):
        g = blur(r2.standard_normal((8, K)), sigma)[0]; return g / (g.std() + 1e-9)
    lines = [line(s_) for s_ in (5.0, 2.2, 1.2)]
    us = np.clip(side / w, -1, 1)                                                                       # бороздки идут параллельно пути и в круглой шапке тоже
    pos = (us * 0.5 + 0.5) * 0.999 * (K - 1)
    drift = 0.5 * blur(r2.standard_normal((8, 2048)), 120)[0]; drift /= np.abs(drift).max() + 1e-9
    off = np.interp(s * 2047, np.arange(2048), drift) * 6                                               # линии чуть плывут вдоль мазка
    rid = sum(a * np.interp(np.clip(pos + off, 0, K - 1), np.arange(K), ln) for a, ln in zip((1.0, 0.7, 0.45), lines))
    rid /= (np.abs(rid).max() + 1e-9)
    amp = (0.075 * smooth01(lpath, 0.05, 1.2)) * (0.35 + 0.65 * np.abs(u) ** 0.8)
    T = (body * head + berm + rid * amp) * inside
    return T, s

def make(W, H, seed=21, out='smear.png'):
    rng = np.random.default_rng(seed)
    pad = int(0.10 * H); ny, nx = H + 2 * pad, W + 2 * pad; asp = nx / ny
    f = 3; my, mx = ny // f, nx // f
    ys, xs = np.mgrid[0:my, 0:mx].astype(float); xs = (xs + 0.5) * f / ny; ys = (ys + 0.5) * f / ny      # единицы — высота кадра
    # главный мазок: широкий, идёт по правой стороне кадра снизу вверх; густая округлая «головка» внизу, к хвосту — бороздки; так тело крема есть и у верхнего, и у нижнего правого угла
    p1 = spline([(0.64 * asp, 0.93), (0.70 * asp, 0.78), (0.74 * asp, 0.58), (0.82 * asp, 0.36), (0.93 * asp, 0.14), (1.06 * asp, -0.06), (1.16 * asp, -0.22)])
    T1, s1 = stroke(xs, ys, p1, lambda s: 0.235 - 0.050 * smooth01(s, 0.0, 0.9), 0.5, 11, (ny, nx))
    T = T1
    T += 0.012 * noise(ny, nx, ny * 0.6, rng, 2) * (T > 0.02)
    h = blur(T, ny * 0.0020) * 0.17
    img = shade(h, k=ny * 0.75, lights=[((-0.75, -0.55, 0.55), (1, 0.96, 0.90), 0.60), ((0.85, 0.60, 0.85), (0.93, 0.96, 1.0), 0.16)], base=(0.96, 0.93, 0.88),
                ambient=(0.54, 0.52, 0.49), cavity=0.14, cav_sigma=ny * 0.016, spec_amount=0.55, spec_pow=55, sheen=0.10)
    mask = (T > 0.02).astype(float); m0 = np.clip(blur(mask, ny * 0.002), 0, 1)
    sh = blur(np.roll(np.roll(mask, int(0.020 * ny), 0), int(0.016 * ny), 1), ny * 0.012) * (1 - m0)
    sh2 = blur(np.roll(np.roll(mask, int(0.006 * ny), 0), int(0.005 * ny), 1), ny * 0.004) * (1 - m0)
    img *= (1 - 0.20 * sh - 0.10 * sh2)[..., None]
    g = 0.97 + 0.03 * blur(rng.standard_normal((ny, nx)), ny * 0.35) / 0.5
    img *= np.clip(g, 0.95, 1.03)[..., None]
    img = img[pad:-pad, pad:-pad]
    save8(tone(img, CREAM, 0.5, 99.6, 1.0), out)

if __name__ == '__main__':
    a = dict(x.split('=') for x in sys.argv[1:]); w, h = [int(v) for v in a.get('res', '960x660').split('x')]
    make(w, h, int(a.get('seed', 21)), a.get('out', 'smear.png'))
