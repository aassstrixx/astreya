#!/usr/bin/env python3
"""Ассеты страниц «Партнёрам» и «Контакты» (стиль «Страницы v2»): всё считается из готовых изображений сайта и процедурно, без внешних материалов.

  python3 tools/showroom-assets/partners/make_pages_assets.py            # все три набора
  python3 tools/showroom-assets/partners/make_pages_assets.py door       # только дверь (кадры героя «Партнёрам»)
  python3 tools/showroom-assets/partners/make_pages_assets.py stone      # только плитка травертина
  python3 tools/showroom-assets/partners/make_pages_assets.py relief     # только рельефная карта

Результат — assets/showroom/pg-*.webp (папка входит в хэш ресурсов сборки, поэтому лежит рядом со слоями каталога):
  pg-door.webp / pg-door-m.webp   — стена с аркой и тёмно-синей дверью (тот же рендер, что слой-оболочка каталога) для первого экрана «Партнёрам»: ПК 2400 px и телефон-портрет
  pg-wall.webp                    — левая часть той же стены (тени листьев и оконных переплётов): задник «приёмной» на странице «Контакты»
  pg-travertine.webp              — бесшовная плитка травертина 512 px: поры, горизонтальные прожилки, зерно; на ней стоят плиты, подиумы и таблички страниц
  pg-relief.webp                  — рельефная карта-схема 2400×1290: холмы, горизонтали, свет сверху-слева (как на всех сценах сайта); метки городов рисует вёрстка (SVG), карта без береговых линий
Цвет сцен — единый (hue 83–89°); перед записью считается статистика Lab и печатается рядом с целью (tools/showroom-assets/regrade_site.py --stats)."""
import os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'showroom')
SHELL = os.path.join(OUT, 'layer-shell.webp')
rng = np.random.default_rng(7)


def save(im, name, q=84, method=6):
    p = os.path.join(OUT, name); im.save(p, quality=q, method=method)
    print('%-22s %5d КБ  %s' % (name, os.path.getsize(p) // 1024, im.size))


def lab_stats(rgb, tag):
    import cv2
    lab = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0] * 100 / 255; a = lab[..., 1] - 128; b = lab[..., 2] - 128
    h = np.degrees(np.arctan2(b.mean(), a.mean())) % 360
    print('   Lab %-12s L %.1f σ%.1f  a %.2f  b %.2f  hue %.1f°' % (tag, L.mean(), L.std(), a.mean(), b.mean(), h))


def door():
    im = Image.open(SHELL).convert('RGB'); W, H = im.size           # 3072×2048
    a = im.resize((2400, round(2400 * H / W)), Image.LANCZOS); save(a, 'pg-door.webp', 80)
    # портрет для телефона: дверь и арка (правая часть) — 4:5
    x0, x1, y0, y1 = int(W * .43), W, int(H * .0), int(H * .74)
    b = im.crop((x0, y0, x1, y1)); b = b.resize((1000, round(1000 * b.size[1] / b.size[0])), Image.LANCZOS); save(b, 'pg-door-m.webp', 80)
    # задник «приёмной»: левая стена с тенями
    c = im.crop((0, 0, int(W * .66), int(H * .56))); c = c.resize((1800, round(1800 * c.size[1] / c.size[0])), Image.LANCZOS); save(c, 'pg-wall.webp', 80)
    lab_stats(np.asarray(a), 'door')


def fft_noise(h, w, sx, sy, seed):
    """Периодический шум: белый шум в частотной области × гауссов фильтр (σx, σy — в пикселях) → бесшовная плитка"""
    r = np.random.default_rng(seed); n = r.standard_normal((h, w))
    F = np.fft.fft2(n); fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * ((fx * sx) ** 2 + (fy * sy) ** 2)); o = np.real(np.fft.ifft2(F * g))
    return (o - o.mean()) / (o.std() + 1e-9)


def stone():
    N = 512
    base = np.array([232, 221, 197], np.float32)                      # травертин сайта (--ax-travertine ≈ #e6d8bd, чуть светлее: плитка идёт под лёгким слоем)
    band = fft_noise(N, N, 160, 5.5, 1) * .55 + fft_noise(N, N, 60, 3.2, 2) * .3             # горизонтальные прожилки (слои породы)
    mott = fft_noise(N, N, 22, 22, 3) * .5 + fft_noise(N, N, 7, 7, 4) * .25                     # пятнистость
    vein = np.clip(fft_noise(N, N, 220, 1.6, 5), 0, None) ** 1.5       # тонкие тёмные прожилки
    sand = fft_noise(N, N, 1.8, 1.8, 6)                                  # песчаное зерно: камень, а не дерево
    lum = band * 2.1 + mott * 4.6 - vein * 1.3 + sand * 1.5
    # поры: вытянутые вдоль слоёв тёмные эллипсы с мягким светлым краем
    pores = np.zeros((N, N), np.float32); r = np.random.default_rng(11)
    for _ in range(560):
        cy, cx = r.integers(0, N, 2); ry = r.uniform(.6, 2.1); rx = ry * r.uniform(2.2, 6.5); d = r.uniform(.35, 1)
        yy, xx = np.ogrid[-6:7, -22:23]; m = np.exp(-((yy / ry) ** 2 + (xx / rx) ** 2) * 1.6) * d
        ys = (cy + np.arange(-6, 7)) % N; xs = (cx + np.arange(-22, 23)) % N
        pores[np.ix_(ys, xs)] = np.maximum(pores[np.ix_(ys, xs)], m)
    pores = gaussian_filter(pores, .45)
    rim = np.roll(pores, -1, 0) - pores                                # чуть света на нижней кромке поры (объём)
    img = base[None, None, :] + lum[..., None] * np.array([1, 1, 1.05], np.float32)
    img -= pores[..., None] * np.array([38, 43, 50], np.float32)
    img += np.clip(rim, 0, 1)[..., None] * 16
    img += rng.standard_normal((N, N, 1)) * 1.6                       # мелкое зерно
    rgb = np.clip(img, 0, 255).astype(np.uint8)
    save(Image.fromarray(rgb), 'pg-travertine.webp', 86); lab_stats(rgb, 'travertine')


def relief():
    W, H = 2400, 1290
    # рельеф: широкие холмы + складки; без береговых линий и рек — карта-схема, не география
    h = np.zeros((H, W), np.float32)
    for s, a, sd in [(520, 1.0, 21), (260, .62, 22), (130, .36, 23), (62, .18, 24), (30, .08, 25)]:
        n = np.random.default_rng(sd).standard_normal((H // 4 + 2, W // 4 + 2)).astype(np.float32)
        n = gaussian_filter(n, s / 4, mode='wrap'); n = (n - n.mean()) / n.std()
        h += a * np.asarray(Image.fromarray(n).resize((W, H), Image.BICUBIC))
    ridge = 1 - np.abs(h * .5)                                         # гребни: ложбины складываются в «хребты»
    h = h * .72 + ridge * .5
    h = (h - h.min()) / (h.max() - h.min())
    # свет: окно сверху-слева (азимут 315°, высота 36°), вертикальное преувеличение подобрано глазом
    gy, gx = np.gradient(gaussian_filter(h, 1.1)); z = 105.0
    nx, ny, nz = -gx * z, -gy * z, np.ones_like(h); nl = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    az, al = np.radians(315), np.radians(36); lx, ly, lz = np.cos(al) * np.sin(az), -np.cos(al) * np.cos(az), np.sin(al)
    shade = np.clip((nx * lx + ny * ly + nz * lz) / nl, 0, 1); shade = (shade - shade.min()) / (shade.max() - shade.min())
    ao = gaussian_filter(h, 28) - h; ao = np.clip(ao * 3.2, 0, 1)      # мягкое затенение ложбин
    # цвет: по высоте от песочного к светлому травертину; тень — тёплая (не серая и не синяя)
    lo, hi = np.array([214, 198, 166], np.float32), np.array([240, 232, 214], np.float32)
    col = lo[None, None] + (hi - lo)[None, None] * (h ** .85)[..., None]
    sh = (.58 + .62 * shade)[..., None]; warm = np.array([1.0, .965, .90], np.float32)[None, None]
    col = col * sh * (1 - (1 - warm) * (1 - shade)[..., None] * 1.6) * (1 - .12 * ao[..., None])
    # горизонтали: каждые .03 по высоте, каждая пятая — «индексная»
    lev = h / .03; fr = np.abs(lev - np.round(lev)); wd = np.clip(.5 * (np.abs(np.gradient(gaussian_filter(lev, 1.2), axis=0)) + np.abs(np.gradient(gaussian_filter(lev, 1.2), axis=1))), .35, 1.5)
    line = np.clip(1 - fr / (.5 * wd + .02) * 1.0, 0, 1) ** 1.6
    idx = (np.round(lev) % 5 == 0).astype(np.float32); line = line * (.34 + .34 * idx)
    col = col * (1 - line[..., None] * np.array([.30, .36, .46], np.float32)[None, None])
    # зерно камня + виньетка; светлая кромка сверху-слева даёт «вырезанную» плиту
    col += rng.standard_normal((H, W, 1)).astype(np.float32) * 2.1
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); vg = 1 - .08 * (((xx / W - .5) * 1.5) ** 2 + ((yy / H - .5) * 1.5) ** 2)
    col *= vg[..., None]
    rgb = np.clip(col, 0, 255).astype(np.uint8)
    save(Image.fromarray(rgb), 'pg-relief.webp', 80); lab_stats(rgb, 'relief')


if __name__ == '__main__':
    what = sys.argv[1:] or ['door', 'stone', 'relief']
    for w in what: {'door': door, 'stone': stone, 'relief': relief}[w]()
