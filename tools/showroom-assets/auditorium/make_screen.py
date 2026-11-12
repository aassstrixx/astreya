#!/usr/bin/env python3
"""Картинка для большого экрана зала «Астрея» (screen.png, 3840×2160, RGB).

Что делает скрипт:
  1. Процедурно рисует фон «лёгкий шёлковый атлас» (numpy + OpenCV, без сети):
     поле высот из складок → нормали → модель «сатин» (диффузия + анизотропный
     блик Варда), полупрозрачные ленты белого шёлка отдельными слоями, лёгкий
     bloom у бликов, зерно σ≈1.2 против полос. Вокруг логотипа складки спокойнее.
  2. Собирает HTML-страницу: фон + ОРИГИНАЛЬНЫЙ логотип
     tools/showroom-assets/astreya-logo-white.svg (заливка #fff → #101f37, контуры
     не трогаем) + подпись «УЧЕБНЫЙ ЦЕНТР» шрифтом Manrope сайта и две тонкие линии.
  3. Делает скриншот Chromium 3840×2160 (deviceScaleFactor 1) → screen.png.

Запуск:  nice -n 10 python3 make_screen.py            (полный размер)
         nice -n 10 python3 make_screen.py --scale 0.5 (быстрый предпросмотр, 1920×1080)
Нужно: numpy, opencv, Pillow; для растеризации — Chromium + Playwright
(python-пакет playwright, а если его нет — node с /opt/node22/lib/node_modules/playwright).
Сеть не нужна. Все временные файлы — во временной папке.
"""
import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]                                   # /home/user/astreya
LOGO_SVG = HERE.parent / "astreya-logo-white.svg"        # оригинал логотипа (белый)
FONTS = REPO / "assets" / "fonts"
OUT_PNG = HERE / "screen.png"

W, H = 3840, 2160
ASPECT = W / H

# ---------- цвета (брифинг владельца) ----------
NAVY_LOGO = "#101f37"      # логотип
NAVY_TEXT = "#16223e"      # подпись
LINE_COL = "#b8a98a"       # тонкие линии рядом с подписью
CAP_PX = 245               # потолок яркости: ни одного пикселя ярче 245/255

# Параметры раскладки (в пикселях при 3840×2160)
LOGO_W = 1010              # ширина блока «знак + слово»
CAPTION_GAP = 1.15         # расстояние от базовой линии слова до верха подписи, в высотах заглавной «А»
CAPTION_FS = 66            # кегль подписи, px
LINE_SPAN = 2650           # общая длина «линия — подпись — линия» (в референсе ≈ 69 % ширины экрана)
CAPTION_TRACK = 0.42       # трекинг, em
LOCKUP_CENTER_Y = 0.465    # центр всего блока (логотип + подпись) по высоте, доля H (чуть выше середины)


# =====================================================================
#  1. ШЁЛК
# =====================================================================
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def wave_noise(X, Y, rng, n=14, fmin=0.6, fmax=2.0):
    """Гладкий шум = сумма случайных синусоид (бесконечно гладкий, без сеточных артефактов).
    fmin/fmax — число периодов на единицу высоты кадра. Станд. отклонение ≈ 1."""
    out = np.zeros_like(X, dtype=np.float32)
    for _ in range(n):
        ang = rng.uniform(0, 2 * np.pi)
        k = rng.uniform(fmin, fmax) * 2 * np.pi
        out += rng.normal() * np.sin(k * (np.cos(ang) * X + np.sin(ang) * Y) + rng.uniform(0, 2 * np.pi))
    return out / np.sqrt(n / 2.0)


def lowres_field(rng, shape_full, fmin, fmax, n=14, small_h=270):
    """Гладкое поле на малой сетке, затем растяжка до полного размера (поля очень гладкие)."""
    h, w = shape_full
    sh = small_h
    sw = int(round(sh * w / h))
    ys, xs = np.mgrid[0:sh, 0:sw].astype(np.float32)
    X = xs / sh * (w / h)                      # единицы высоты кадра
    Y = 1.0 - ys / sh
    f = wave_noise(X, Y, rng, n, fmin, fmax)
    return cv2.resize(f, (w, h), interpolation=cv2.INTER_CUBIC)


def normalize(v):
    n = np.sqrt(sum(c * c for c in v)) + 1e-9
    return [c / n for c in v]


def ward_shade(nx, ny, nz, tx0, ty0, L, ax, ay):
    """Анизотропный блик Варда: нити ткани идут вдоль поля касательных (tx0,ty0),
    блик вытянут вдоль складок и узок поперёк."""
    Hh = normalize([L[0], L[1], L[2] + 1.0])             # полувектор, взгляд V=(0,0,1)
    tdn = tx0 * nx + ty0 * ny
    tx, ty, tz = tx0 - tdn * nx, ty0 - tdn * ny, -tdn * nz
    tl = np.sqrt(tx * tx + ty * ty + tz * tz) + 1e-9
    tx, ty, tz = tx / tl, ty / tl, tz / tl
    bx = ny * tz - nz * ty                                 # B = n × T
    by = nz * tx - nx * tz
    bz = nx * ty - ny * tx
    ht = Hh[0] * tx + Hh[1] * ty + Hh[2] * tz
    hb = Hh[0] * bx + Hh[1] * by + Hh[2] * bz
    hn = np.clip(Hh[0] * nx + Hh[1] * ny + Hh[2] * nz, 1e-3, 1.0)
    e = -((ht / ax) ** 2 + (hb / ay) ** 2) / (hn * hn)
    return np.exp(e)


def surface_light(hx, hy, tx0, ty0, lights, ambient, wrap=0.55):
    """hx, hy — наклоны (dh/dX, dh/dY, Y вверх). Возвращает (diffuse, specular)."""
    nz = 1.0 / np.sqrt(1.0 + hx * hx + hy * hy)
    nx, ny = -hx * nz, -hy * nz
    diff = np.full_like(hx, ambient, dtype=np.float32)
    spec = np.zeros_like(hx, dtype=np.float32)
    for (Ld, kd, ks, ax, ay) in lights:
        L = normalize(Ld)
        ndl = nx * L[0] + ny * L[1] + nz * L[2]
        diff += kd * np.clip((ndl + wrap) / (1.0 + wrap), 0, 1) ** 1.3
        spec += ks * ward_shade(nx, ny, nz, tx0, ty0, L, ax, ay) * np.clip(ndl, 0, 1)
    return diff, spec


def ramp(s, stops):
    """Кусочно-линейная цветовая шкала: s∈[0,1] → RGB (0..255)."""
    xs = np.array([p for p, _ in stops], dtype=np.float32)
    out = np.empty(s.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(s, xs, np.array([col[c] for _, col in stops], dtype=np.float32))
    return out


def shoulder(s, knee=0.80, top=1.0):
    """Мягкое плечо: значения выше knee плавно прижимаются к top (без выжженных пятен)."""
    k = (top - knee)
    return np.where(s < knee, s, knee + k * np.tanh((s - knee) / k))


def grad_xy(h, scale_px):
    """Производные поля h по X и Y (Y вверх) в единицах 'на высоту кадра'."""
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = -cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    return gx * scale_px, gy * scale_px


def build_silk(w, h, seed=7, verbose=True, dbg=None):
    """Возвращает float32 RGB (0..255) без зерна. w×h — рабочий размер."""
    rng = np.random.default_rng(seed)
    px = h / 2160.0                                        # масштаб пиксельных радиусов
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    X = xs / h                                              # единицы высоты кадра, X∈[0,16/9]
    Y = 1.0 - ys / h                                        # Y вверх, ∈[0,1]
    log = (lambda *a: print(*a, flush=True)) if verbose else (lambda *a: None)

    # ----- зона покоя вокруг логотипа (≈38 % × 45 % по ширине/высоте) -----
    cx, cy = 0.5 * ASPECT, 1.0 - LOCKUP_CENTER_Y
    rx, ry = 0.19 * ASPECT, 0.225
    d = (np.abs((X - cx) / rx) ** 3.0 + np.abs((Y - cy) / ry) ** 3.0) ** (1 / 3.0)
    calm = (1.0 - smoothstep(1.0, 1.55, d)).astype(np.float32)   # 1 в центре → 0 вдали

    # ----- поле высот: складки, идущие слева направо снизу вверх -----
    th0 = np.deg2rad(24.0)
    wx = lowres_field(rng, (h, w), 0.35, 0.9)
    wy = lowres_field(rng, (h, w), 0.35, 0.9)
    wx2 = lowres_field(rng, (h, w), 1.0, 2.2, n=10)
    wy2 = lowres_field(rng, (h, w), 1.0, 2.2, n=10)
    Xw = X + 0.055 * wx + 0.016 * wx2
    Yw = Y + 0.050 * wy + 0.016 * wy2

    fams = [  # (направление°, длина волны, амплитуда, мин.огибающая, гармоника, «заломы»)
        (30.0, 0.46, 1.00, 0.55, 0.30, 0.00),
        (27.0, 0.29, 0.80, 0.15, 0.35, 0.30),
        (36.0, 0.19, 0.45, 0.04, 0.30, 0.35),
        (21.0, 0.115, 0.30, 0.00, 0.25, 0.25),
        (32.0, 0.065, 0.11, 0.00, 0.10, 0.20),
    ]
    height = np.zeros((h, w), np.float32)
    s_main = None
    for i, (ang, lam, amp, emin, harm, cusp) in enumerate(fams):
        a = np.deg2rad(ang)
        s = -np.sin(a) * Xw + np.cos(a) * Yw                    # координата поперёк складок
        if s_main is None:
            s_main = s
        env = lowres_field(rng, (h, w), 0.4, 1.1, n=8)
        env = emin + (1 - emin) * smoothstep(-1.1, 1.0, env)    # складки то нарастают, то стихают
        ph = 2 * np.pi * s / lam + rng.uniform(0, 2 * np.pi)
        f = np.sin(ph) + harm * np.sin(2 * ph + 1.3) + cusp * (2.0 * np.abs(np.sin(ph / 2)) - 1.27)
        height += (amp * env * f).astype(np.float32)
        log("  складки", i + 1, "из", len(fams))

    # крупные плавные «вздутия» ткани
    height += 0.7 * lowres_field(rng, (h, w), 0.25, 0.6, n=8)

    # направление нитей: вдоль складок (касательная к линиям уровня s_main)
    sg_x, sg_y = grad_xy(cv2.GaussianBlur(s_main, (0, 0), 6 * px), 1.0 / px)
    sg_l = np.sqrt(sg_x ** 2 + sg_y ** 2) + 1e-6
    tx0, ty0 = -sg_y / sg_l, sg_x / sg_l

    hx, hy = grad_xy(cv2.GaussianBlur(height, (0, 0), 2.2 * px), 1.0)
    # калибровка наклонов: 99-й перцентиль ≈ tan(38°)
    g99 = np.percentile(np.sqrt(hx * hx + hy * hy)[::4, ::4], 99)
    kappa = np.tan(np.deg2rad(44.0)) / g99
    hx, hy = hx * kappa, hy * kappa
    quiet = (1.0 - 0.84 * calm)
    hx, hy = hx * quiet, hy * quiet

    # ----- освещение «сатин» -----
    lights = [
        ((-0.58, 0.46, 0.68), 0.36, 0.95, 0.60, 0.10),     # главный: сверху-слева-спереди
        ((-0.58, 0.46, 0.68), 0.00, 0.30, 0.90, 0.38),     # широкий шёлковый отлив того же света
        ((0.70, -0.25, 0.66), 0.14, 0.30, 0.55, 0.14),     # мягкий контр с правой-нижней стороны
    ]
    diff, spec = surface_light(hx, hy, tx0, ty0, lights, ambient=0.40)
    d_flat, _ = surface_light(np.zeros((1, 1), np.float32), np.zeros((1, 1), np.float32),
                              np.ones((1, 1), np.float32), np.zeros((1, 1), np.float32), lights, ambient=0.40)
    d_flat = float(d_flat[0, 0])
    hi, lo = np.percentile(diff[::3, ::3], [97, 3])
    dsn = np.where(diff >= d_flat, (diff - d_flat) / (hi - d_flat), (diff - d_flat) / (d_flat - lo))
    dsn = np.clip(dsn, -1.3, 1.3)                          # −1…+1: тень…свет относительно ровного полотна
    cav = cv2.GaussianBlur(height, (0, 0), 38 * px) - height     # впадины темнее (контактная тень)
    cav = np.clip(cav / (np.std(cav) + 1e-6), -2, 3)
    cav *= (1.0 - 0.6 * calm)
    if dbg is not None:
        dbg.update(diff=diff, spec=spec, height=height, hx=hx, hy=hy, cav=cav, calm=calm, dsn=dsn)
    s_base = 0.62 + 0.30 * dsn + 0.62 * spec - 0.04 * np.clip(cav, 0, 3) + 0.015 * np.clip(cav, -2, 0)

    # bloom у бликов
    bl = cv2.GaussianBlur(spec, (0, 0), 24 * px) * 0.5 + cv2.GaussianBlur(spec, (0, 0), 80 * px) * 0.5
    s_base += 0.30 * bl
    # общий мягкий градиент света и «свечение» за логотипом
    glow = np.exp(-(((X - cx) / 0.55) ** 2 + ((Y - cy) / 0.45) ** 2))
    s_base += 0.05 * glow + 0.035 * (X / ASPECT - 0.5) + 0.03 * (Y - 0.5)
    s_base = shoulder(s_base, 0.84, 1.0)

    stops = [
        (0.00, (200, 183, 150)),
        (0.25, (222, 208, 182)),
        (0.50, (233, 224, 205)),
        (0.68, (239, 231, 214)),
        (0.85, (243, 238, 226)),
        (1.00, (245, 243, 236)),
    ]
    img = ramp(np.clip(s_base, 0, 1), stops)

    # ----- полупрозрачные ленты белого шёлка -----
    ribbons = [  # (y0, наклон, амплитуда S-изгиба, длина S, фаза, ширина, фаза скрутки, альфа)
        (-0.12, 0.40, 0.050, 2.2, 0.6, 0.17, 0.4, 0.78),
        (0.30, 0.46, 0.060, 2.6, 2.2, 0.23, 2.0, 0.72),
        (0.68, 0.38, 0.045, 2.0, 4.1, 0.13, 3.3, 0.68),
    ]
    for ri, (y0, m, am, lam, ph, wid, tph, alp) in enumerate(ribbons):
        xr = X
        yc = y0 + m * xr + am * np.sin(2 * np.pi * xr / lam + ph) + 0.03 * lowres_field(rng, (h, w), 0.3, 0.7, n=6)
        wd = wid * (0.72 + 0.28 * np.sin(2 * np.pi * xr / (lam * 1.3) + tph))
        t = (Y - yc) / wd                                      # поперечная координата ленты [-1..1]
        tc = np.clip(t, -1.15, 1.15)
        twist = np.sin(2 * np.pi * xr / (lam * 0.9) + tph)
        rip = 0.10 * np.sin(2 * np.pi * xr / 0.21 + 3.0 * t + tph)
        hr = wd * (0.55 * np.cos(np.pi * np.clip(tc, -1, 1) / 2) + 0.42 * twist * tc + rip)
        hrx, hry = grad_xy(cv2.GaussianBlur(hr.astype(np.float32), (0, 0), 1.2 * px), 1.0)
        # наклоны ленты — ее собственные, калибруем в диапазон ≈ 34°
        k2 = np.tan(np.deg2rad(34.0)) / (np.percentile(np.sqrt(hrx ** 2 + hry ** 2)[::4, ::4], 98) + 1e-6)
        hrx, hry = hrx * k2, hry * k2
        # касательная ленты: вдоль её оси
        ang = np.arctan(m + am * (2 * np.pi / lam) * np.cos(2 * np.pi * xr / lam + ph))
        dr, sr = surface_light(hrx, hry, np.cos(ang), np.sin(ang), lights, ambient=0.45)
        sr = dr + 0.8 * sr + 0.25 * cv2.GaussianBlur(sr, (0, 0), 20 * px)
        sr = shoulder(sr + 0.04 * glow, 0.84, 1.0)
        rib_col = ramp(np.clip(sr, 0, 1), [
            (0.00, (210, 203, 190)), (0.30, (228, 222, 210)), (0.60, (240, 236, 227)), (1.00, (245, 244, 240)),
        ])
        edge = smoothstep(1.0, 0.72, np.abs(t))                 # мягкий край ленты
        body = 0.62 + 0.38 * np.clip(np.abs(t), 0, 1) ** 1.6    # вуаль: к краям плотнее, в середине прозрачнее
        a = (alp * edge * body * (1.0 - 0.88 * calm)).astype(np.float32)
        # мягкая тень ленты на ткани под ней
        sh = cv2.GaussianBlur(edge.astype(np.float32), (0, 0), 16 * px)
        M = np.float32([[1, 0, 10 * px], [0, 1, 18 * px]])
        sh = cv2.warpAffine(sh, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
        img *= (1.0 - 0.13 * sh * (1.0 - 0.8 * calm))[..., None]
        img = img * (1 - a[..., None]) + rib_col * a[..., None]
        log("  лента", ri + 1, "из", len(ribbons))

    # виньетка (очень мягкая) — лёгкое затемнение углов
    vg = np.clip(((X - cx) / (0.62 * ASPECT)) ** 2 + ((Y - 0.5) / 0.75) ** 2, 0, 2)
    img *= (1.0 - 0.035 * vg)[..., None]
    return img


SILK_CONTRAST = 1.45       # в референсе складки шёлка читаются отчётливо: контраст относительно среднего


def shape_silk(img):
    """контраст складок, тёплый тон и мягкий «конус света» проектора (центр светлее, края темнее) — как на экране референса"""
    f = img.astype(np.float32); m = f.mean()
    f = m + (f - m) * SILK_CONTRAST + 2.0
    f *= np.array([1.0, .988, .955], np.float32)
    h, w = f.shape[:2]; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.hypot((xx / w - .5) * 1.1, (yy / h - .40) * 1.0)
    f *= (1.03 - .13 * np.clip(r / .75, 0, 1) ** 1.8)[..., None]
    return np.clip(f, 0, 255)


def finalize(img, seed=11):
    """Зерно σ≈1.2 (в основном яркостное), потолок 245, 8 бит."""
    h, w = img.shape[:2]
    rng = np.random.default_rng(seed)
    g = rng.standard_normal((h, w, 3)).astype(np.float32)
    lum = rng.standard_normal((h, w)).astype(np.float32)
    g = 0.8 * lum[..., None] + 0.6 * g                      # яркостное + немного цветного
    g = cv2.GaussianBlur(g, (0, 0), 0.55)
    g *= 1.2 / g.std()
    out = np.clip(img + g, 0, CAP_PX)
    return np.rint(out).astype(np.uint8)


# =====================================================================
#  2. СТРАНИЦА И РАСТЕРИЗАЦИЯ
# =====================================================================
def logo_svg_markup():
    """Оригинальный SVG логотипа: меняем только цвет заливки #fff → #101f37."""
    s = LOGO_SVG.read_text(encoding="utf-8")
    s = re.sub(r'fill="#fff(?:fff)?"', f'fill="{NAVY_LOGO}"', s, flags=re.I)
    assert "#fff" not in s.lower(), "в SVG остались белые заливки"
    # обернуть содержимое в <g id="all"> и отдельно пометить «знак» и «слово»
    m = re.match(r'(<svg[^>]*>)(.*)(</svg>)\s*$', s, flags=re.S)
    head, body, tail = m.groups()
    groups = re.findall(r'<g\b.*?</g>', body, flags=re.S)
    assert len(groups) == 2, "ожидались две группы: знак и слово"
    mark = groups[0].replace('<g ', '<g id="mark" ', 1)
    word = groups[1].replace('<g ', '<g id="word" ', 1)
    head = head.replace('<svg ', '<svg id="logo" ', 1)
    return f'{head}<g id="all">{mark}{word}</g>{tail}'


def page_html(bg_name):
    fonts = ""
    for fname, rng_ in (
        ("manrope-cyrillic-e58feb.woff2", "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116"),
        ("manrope-latin-938c6e.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122"),
    ):
        fonts += (f"@font-face{{font-family:'Manrope';font-weight:400 700;font-style:normal;"
                  f"src:url('{(FONTS / fname).as_uri()}') format('woff2');unicode-range:{rng_}}}\n")
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
{fonts}
html,body{{margin:0;padding:0;background:#efe6d2}}
#stage{{position:relative;width:{W}px;height:{H}px;overflow:hidden;background:url('{bg_name}') 0 0/{W}px {H}px no-repeat}}
#logo{{position:absolute;display:block;width:{LOGO_W}px}}
#cap{{position:absolute;left:0;top:0;white-space:nowrap;font:500 {CAPTION_FS}px/1 'Manrope',sans-serif;
  letter-spacing:{CAPTION_TRACK}em;color:{NAVY_TEXT};text-transform:uppercase;font-kerning:normal}}
#cap i{{display:inline-block;width:0;height:0}}
.rule{{position:absolute;height:2px;background:{LINE_COL};border-radius:1px}}
</style></head>
<body><div id="stage">
{logo_svg_markup()}
<div id="cap">Учебный центр<i id="bl"></i></div>
<div class="rule" id="rl"></div><div class="rule" id="rr"></div>
</div>
<script>
(async () => {{
  await document.fonts.load("500 {CAPTION_FS}px Manrope", "УЧЕБНЫЙ ЦЕНТР");
  await document.fonts.ready;
  const stage = document.getElementById('stage').getBoundingClientRect();
  const svg = document.getElementById('logo');
  const cap = document.getElementById('cap');
  const cx = {W} / 2;

  // 1) логотип: viewBox по реальным границам контуров, ширина блока = LOGO_W
  const bb = document.getElementById('all').getBBox();
  svg.setAttribute('viewBox', `${{bb.x}} ${{bb.y}} ${{bb.width}} ${{bb.height}}`);
  const logoH = {LOGO_W} * bb.height / bb.width;
  svg.style.height = logoH + 'px';
  svg.style.left = '0px'; svg.style.top = '0px';

  // 2) «А» — первая буква слова: её высота = высота заглавной, низ = базовая линия слова
  const aRect = document.querySelector('#word path').getBoundingClientRect();
  const capH = aRect.height;
  const baseRel = aRect.bottom - stage.top;                 // базовая линия слова от верха svg

  // 3) подпись: высота заглавных Manrope и ширина без хвостового трекинга
  const cv = document.createElement('canvas').getContext('2d');
  cv.font = "500 {CAPTION_FS}px Manrope";
  const capAsc = cv.measureText('Н').actualBoundingBoxAscent;
  const visW = cap.getBoundingClientRect().width - {CAPTION_TRACK} * {CAPTION_FS};

  // 4) раскладка по вертикали: верх подписи = базовая линия слова + CAPTION_GAP × высота «А»
  const capTopRel = baseRel + {CAPTION_GAP} * capH;
  const lockH = capTopRel + capAsc;
  const topY = {H} * {LOCKUP_CENTER_Y} - lockH / 2;
  const leftX = cx - {LOGO_W} / 2;
  svg.style.left = leftX + 'px';
  svg.style.top = topY + 'px';

  const blY = topY + capTopRel + capAsc;                    // базовая линия подписи
  cap.style.left = (cx - visW / 2) + 'px';
  cap.style.top = '0px';
  const mark = document.getElementById('bl').getBoundingClientRect().bottom - stage.top;
  cap.style.top = (blY - mark) + 'px';

  // 5) две тонкие линии на уровне середины заглавных, от краёв блока до подписи
  const midY = blY - capAsc / 2 - 1;
  const gapX = {CAPTION_FS} * 1.15;
  const textL = cx - visW / 2, textR = cx + visW / 2;
  const rl = document.getElementById('rl'), rr = document.getElementById('rr');
  const spanL = cx - {LINE_SPAN} / 2, spanR = cx + {LINE_SPAN} / 2;
  rl.style.left = spanL + 'px'; rl.style.width = (textL - gapX - spanL) + 'px'; rl.style.top = midY + 'px';
  rr.style.left = (textR + gapX) + 'px'; rr.style.width = (spanR - textR - gapX) + 'px'; rr.style.top = midY + 'px';

  window.__layout = {{ topY, logoH, capH, baseline: topY + baseRel, capTop: topY + capTopRel, blY, textL, textR, midY, lockH }};
  window.__ready = true;
}})();
</script></body></html>"""


NODE_SHOT = r"""
const { chromium } = require(process.env.PW_NODE || '/opt/node22/lib/node_modules/playwright');
(async () => {
  const [url, out, w, h] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await p.goto(url);
  await p.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  console.log(JSON.stringify(await p.evaluate('window.__layout')));
  await p.screenshot({ path: out, clip: { x: 0, y: 0, width: +w, height: +h } });
  await b.close();
})();
"""


def screenshot(url, out_png):
    """Скриншот страницы: сначала python-playwright, если нет — node-playwright."""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_function("window.__ready === true", timeout=60000)
            lay = pg.evaluate("window.__layout")
            pg.screenshot(path=str(out_png), clip={"x": 0, "y": 0, "width": W, "height": H})
            b.close()
            return lay
    except ImportError:
        pass
    js = Path(out_png).with_suffix(".shot.js")
    js.write_text(NODE_SHOT, encoding="utf-8")
    r = subprocess.run(["node", str(js), url, str(out_png), str(W), str(H)],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout.strip().splitlines()[-1])


def main():
    global W, H, ASPECT, LOGO_W, CAPTION_FS
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=1.0, help="масштаб рабочего размера (0.5 → 1920×1080)")
    ap.add_argument("--bg-only", action="store_true", help="только фон (silk_bg.png рядом с --out)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=str(OUT_PNG))
    a = ap.parse_args()

    sc = a.scale
    if sc != 1.0:                                   # предпросмотр: всё пропорционально
        W, H = int(round(3840 * sc)), int(round(2160 * sc))
        LOGO_W = int(round(LOGO_W * sc))
        CAPTION_FS = CAPTION_FS * sc
    ASPECT = W / H

    tmp = Path(tempfile.mkdtemp(prefix="astreya_screen_"))
    try:
        print("Шёлк…", flush=True)
        silk = finalize(shape_silk(build_silk(W, H, seed=a.seed)))
        bg = tmp / "silk.png"
        Image.fromarray(silk, "RGB").save(bg, optimize=False)
        if a.bg_only:
            shutil.copy(bg, Path(a.out).with_name("silk_bg.png"))
            return
        html = tmp / "screen.html"
        html.write_text(page_html("silk.png"), encoding="utf-8")
        print("Логотип и подпись (Chromium)…", flush=True)
        shot = tmp / "shot.png"
        lay = screenshot(html.as_uri(), shot)
        print("layout:", lay)
        im = Image.open(shot).convert("RGB")
        assert im.size == (W, H), im.size
        im.save(a.out)
        print("готово:", a.out, im.size)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
