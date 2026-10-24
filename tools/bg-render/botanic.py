"""Фоновая текстура «чистая вода»: водные блики-каустики на тёплой песочной глади (тени растения — в plant.py).
Чистый numpy + Pillow (секунды, Blender не нужен). Рисуются на белом: страница накладывает их умножением (mix-blend-mode:multiply), поэтому белое фон не меняет,
а блики ложатся тёплым песочным тоном в палитре сайта.
Запуск: python3 botanic.py [out=../../assets/bg] [seed=7]  → water.webp (+ water-m.webp для телефона) и water-a.webp (с прозрачностью)"""
import math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1600, 1100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'bg')
SEED = 7
for a in sys.argv[1:]:
    if a.startswith('out='): OUT = a[4:]
    if a.startswith('seed='): SEED = int(a[5:])
rnd = random.Random(SEED); nrng = np.random.default_rng(SEED)

def smooth(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
def save_alpha(name, rgb, alpha):
    """Версия с прозрачностью для блоков, где нельзя полагаться на multiply (большой каталог): цвет + альфа, лёгкий WebP."""
    a = np.clip(alpha, 0, 1)[..., None]; col = np.where(a > 0, rgb, 255)
    im = Image.fromarray(np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8), 'RGBA').resize((1200, 825), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), quality=80, method=6, alpha_quality=55)
    print(name, os.path.getsize(os.path.join(OUT, name + '.webp')) // 1024, 'КБ')
def save(name, rgb, focus):
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    im.save(os.path.join(OUT, name + '.webp'), quality=92, method=6)
    mw, mh = 720, 1000; cx, cy = int(focus[0] * W), int(focus[1] * H)
    x0 = min(max(0, cx - mw // 2), W - mw); y0 = min(max(0, cy - mh // 2), H - mh)
    im.crop((x0, y0, x0 + mw, y0 + mh)).save(os.path.join(OUT, name + '-m.webp'), quality=90, method=6)
    print(name, os.path.getsize(os.path.join(OUT, name + '.webp')) // 1024, 'КБ')

# ---------- вода: сеть бликов-каустиков на светло-голубой глади ----------
def vnoise(cells_x, cells_y, seed):
    g = np.random.default_rng(seed).random((cells_y + 1, cells_x + 1)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return np.asarray(im, np.float32) / 255

def water():
    yy, xx = np.mgrid[0:H, 0:W]
    webs = []
    for s in range(3):
        n = vnoise(7 + 2 * s, 5 + 2 * s, SEED * 10 + s) + .5 * vnoise(15 + 3 * s, 11 + 3 * s, SEED * 20 + s)
        n = n / 1.5; ridge = 1 - np.abs(2 * n - 1); webs.append(ridge ** 9)
    web = np.clip(np.max(webs, 0) * 1.25, 0, 1)
    big = vnoise(3, 3, SEED + 99)
    depth = .55 + .45 * big
    base = np.array([226, 216, 198], float)
    side = smooth(xx / W * 1.15 - .08) * smooth((1.04 - yy / H) / .6)
    f = np.clip(side[..., None] * depth[..., None], 0, 1)
    field = 255 - (255 - base) * f
    rgb = field + (255 - field) * (web[..., None] * .96)
    save('water', rgb, (.7, .5))
    save_alpha('water-a', np.broadcast_to(base, (H, W, 3)), f[..., 0] * (1 - web * .96))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    water()
