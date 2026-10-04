"""Шейдинг карты высот на numpy без шума: мягкий диффузный свет, шёлковый блик, каверны. Для кремовых и кожных текстур (без Blender)."""
import numpy as np
from numpy.fft import rfft2, irfft2, rfftfreq, fftfreq

def blur(a, sigma):
    ny, nx = a.shape; fy = fftfreq(ny)[:, None]; fx = rfftfreq(nx)[None, :]
    return irfft2(rfft2(a) * np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2)), s=(ny, nx))

def noise(ny, nx, scale, rng, octaves=3, persistence=0.5):
    out = np.zeros((ny, nx)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        g = blur(rng.standard_normal((ny, nx)), max(scale / (2 ** o), 0.8)); g /= g.std() + 1e-9
        out += amp * g; tot += amp; amp *= persistence
    return out / tot

def normals(h, k):
    gy, gx = np.gradient(h)
    n = np.stack([-gx * k, -gy * k, np.ones_like(h)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

def unit(v):
    v = np.array(v, float); return v / np.linalg.norm(v)

def shade(h, k, lights, base, ambient=(0.55, 0.52, 0.48), cavity=0.0, cav_sigma=18, spec_amount=0.0, spec_pow=60, sheen=0.0, view=(0, 0, 1)):
    """lights: список (направление, цвет, сила). Возвращает float-картинку (ny, nx, 3) в 0..1+."""
    n = normals(h, k); v = unit(view); base = np.array(base, float)
    col = np.zeros(h.shape + (3,)) + np.array(ambient)
    spec = np.zeros(h.shape)
    for d, c, s in lights:
        l = unit(d); ndl = n @ l
        wrap = np.clip((ndl + 0.35) / 1.35, 0, None)                      # мягкая «обёртка» света: тени не чернеют, как в креме
        col += wrap[..., None] * np.array(c) * s
        hv = unit(l + v); nh = np.clip(n @ hv, 0, 1)
        spec += s * nh ** spec_pow
    img = col * base
    if cavity:
        cav = blur(h, cav_sigma) - h                                       # впадины темнее, гребни светлее
        img *= (1 - cavity * np.clip(cav / (np.abs(cav).max() + 1e-9), -1, 1))[..., None]
    img += spec_amount * spec[..., None] * np.array([1.0, 0.98, 0.94])
    if sheen:
        fr = (1 - np.clip(n @ v, 0, 1)) ** 2
        img += sheen * fr[..., None] * np.array([1.0, 0.97, 0.92])
    return img

def save(img, path, exposure=1.0, gamma=1.0):
    from PIL import Image
    a = np.clip(img * exposure, 0, 1) ** (1 / gamma)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(path)

def tone(img, stops, lo=1.0, hi=99.0, gamma=1.0):
    """Гоним яркость через цветовую шкалу сайта: stops — список (позиция 0..1, (r,g,b) 0..255); возвращает uint8-картинку."""
    L = img.mean(-1) if img.ndim == 3 else img
    a, b = np.percentile(L, [lo, hi]); t = np.clip((L - a) / (b - a + 1e-9), 0, 1) ** gamma
    pos = np.array([p for p, _ in stops]); cols = np.array([c for _, c in stops], float)
    out = np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], -1)
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)

def save8(a, path):
    from PIL import Image
    Image.fromarray(a).save(path)

# шкалы тона в палитре сайта (молочный #f5f2ec, жемчужный #e5ebf5, серебро #b9c2d0)
CREAM = [(0.0, (203, 193, 180)), (0.35, (226, 218, 205)), (0.7, (241, 236, 227)), (1.0, (252, 250, 246))]
PEARL = [(0.0, (196, 205, 220)), (0.4, (222, 229, 240)), (0.75, (238, 242, 249)), (1.0, (251, 252, 254))]
