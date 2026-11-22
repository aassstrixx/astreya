#!/usr/bin/env python3
"""Постобработка рендера стеклянного стола (table_glass.py) и выгрузка WebP для страницы «Новости».

  python3 tools/showroom-assets/news/table_glass_post.py сырой.png            → assets/news/table-glass.webp (2880×1914) и table-glass-m.webp (1500×997)
  python3 tools/showroom-assets/news/table_glass_post.py сырой.png --quick     → без подбора качества (быстрый предпросмотр, WebP q80)
  --out DIR — писать в другую папку; --png файл.png — сохранить ещё и PNG после цветокоррекции (для просмотра).

Цвет — к гамме сайта (как tools/showroom-assets/auditorium/grade_hall.py): перенос средних a, b в Lab к целевым (hue ≈ 85°, тёплый нейтральный, не жёлтый), яркость L — к целевому
среднему с мягким контрастом; зелёное стекло и бирюзовая кромка сохраняют относительное отличие от камня (сдвиг одинаковый для всех пикселей), у светлых бликов яркость не поднимается.
Затем: лёгкая нерезкая маска после масштабирования (поры и блики читаются при увеличении камерой), микрошум против бандинга (в пределах 0,35 уровня) и подбор качества WebP по весу
(цель — не больше 900 КБ у plan и 350 КБ у телефонного кадра; качество сверху вниз, пока вес не уложится, но не ниже q62; контроль — PSNR и SSIM по яркости)."""
import os, sys
import numpy as np, cv2
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
def _cli():
    a = sys.argv[1:]; opts = {}; pos = []; i = 0
    while i < len(a):
        if a[i] in ('--out', '--png'): opts[a[i]] = a[i + 1]; i += 2
        elif a[i].startswith('--'): opts[a[i]] = True; i += 1
        else: pos.append(a[i]); i += 1
    return (pos[0] if pos else '/tmp/table_glass_raw.png'), opts.get('--out', os.path.join(ROOT, 'assets', 'news')), bool(opts.get('--quick')), opts.get('--png')


SRC, OUT, QUICK, PNG = _cli() if __name__ == '__main__' else ('', '', False, None)
_f = lambda k, d: float(os.environ.get(k, d))
# целевой цвет: общий цвет сайта (зал главной, «Обучение»): hue ≈ 85°, a ≈ 0,8, b ≈ 10–11
T = dict(L_mean=_f('PG_L', 74.0), L_contrast=_f('PG_LC', 1.0), a_mean=_f('PG_A', 1.5), b_mean=_f('PG_B', 11.0), chroma_max=_f('PG_CMAX', 26.0), gain=_f('PG_GAIN', 1.0), shadow_tint=_f('PG_ST', .75), sa=_f('PG_SA', 3.2), sb=_f('PG_SB', 11.5))
SIZES = {'table-glass.webp': (2880, 1914, 900), 'table-glass-m.webp': (1500, 997, 350)}


def load(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return (im[..., ::-1].astype(np.float32) / (65535.0 if im.dtype == np.uint16 else 255.0))


def lab_of(rgb): return cv2.cvtColor(np.clip(rgb, 0, 1).astype(np.float32), cv2.COLOR_RGB2LAB)


def stats(lab):
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    return 'L %.1f±%.1f  a %.1f  b %.1f  chroma %.1f  hue %.1f°' % (L.mean(), L.std(), A.mean(), B.mean(), np.hypot(A, B).mean(), np.degrees(np.arctan2(B.mean(), A.mean())))


def smooth(x, e0, e1):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def ref_of(rgb):
    lab = lab_of(rgb); return dict(L=float(lab[..., 0].mean()), a=float(lab[..., 1].mean()), b=float(lab[..., 2].mean()))


def grade(rgb, ref=None):
    """Lab: a, b — к целевым средним (одинаковый сдвиг для всех пикселей); тени подтягиваются к тёплому нейтральному тону (без оливкового); яркость — монотонная кривая:
    сдвиг среднего к цели, сходящий на нет к белому (блик окна не клипуется и не «рвётся» на пороге)"""
    lab = lab_of(rgb); L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    ref = ref or dict(L=float(L.mean()), a=float(A.mean()), b=float(B.mean()))                       # ref — средние основного кадра (для кропов теней журнала)
    wg = np.clip(1 + (A + 1.5) / 5.0, 0, 1); wg = cv2.GaussianBlur(wg.astype(np.float32), (0, 0), 1.0)                       # зелёные пиксели (кромка стекла) не уводим в жёлтый
    A2 = A + (T['a_mean'] - ref['a']) * wg; B2 = B + (T['b_mean'] - ref['b']) * wg
    ws = smooth(L, 82, 52) * T['shadow_tint']                                                        # тени: к тёплому тону
    A2 = A2 + (T['sa'] - A2) * ws; B2 = B2 + (T['sb'] - B2) * ws
    d = T['L_mean'] - ref['L']
    L2 = ref['L'] + (L - ref['L']) * T['L_contrast'] + d * (1 - smooth(L, 84, 100))
    L2 = np.clip(L2, 0, 99.5)
    C = np.hypot(A2, B2); k = np.where(C > T['chroma_max'], T['chroma_max'] / np.maximum(C, 1e-3), 1.0)
    out = cv2.cvtColor(np.stack([L2, A2 * k, B2 * k], -1).astype(np.float32), cv2.COLOR_LAB2RGB)
    return np.clip(out * T['gain'], 0, 1)


def to_pil(rgb, w, h, sharp=True):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255 + .5).astype(np.uint8))
    if im.size != (w, h): im = im.resize((w, h), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=int(_f('PG_SHARP', 40)), threshold=2)) if sharp else im


def psnr_ssim(a, b):
    ya = cv2.cvtColor(np.asarray(a), cv2.COLOR_RGB2GRAY).astype(np.float32); yb = cv2.cvtColor(np.asarray(b), cv2.COLOR_RGB2GRAY).astype(np.float32)
    mse = float(((ya - yb) ** 2).mean()); ps = 99.0 if mse < 1e-9 else 10 * np.log10(255 ** 2 / mse)
    c1, c2 = (.01 * 255) ** 2, (.03 * 255) ** 2; mu_a = cv2.GaussianBlur(ya, (0, 0), 1.5); mu_b = cv2.GaussianBlur(yb, (0, 0), 1.5)
    sa = cv2.GaussianBlur(ya * ya, (0, 0), 1.5) - mu_a ** 2; sb = cv2.GaussianBlur(yb * yb, (0, 0), 1.5) - mu_b ** 2; sab = cv2.GaussianBlur(ya * yb, (0, 0), 1.5) - mu_a * mu_b
    ss = float((((2 * mu_a * mu_b + c1) * (2 * sab + c2)) / ((mu_a ** 2 + mu_b ** 2 + c1) * (sa + sb + c2))).mean()); return ps, ss


def encode(im, path, limit_kb):
    import io
    best = None
    qs = [80] if QUICK else list(range(94, 61, -2))
    for q in qs:
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=q, method=6, sns_strength=int(_f('PG_SNS', 70)), filter_strength=int(_f('PG_FILT', 30)), filter_sharpness=0, segments=4, exact=False)
        kb = len(buf.getvalue()) / 1024; best = (q, buf.getvalue(), kb)
        if kb <= limit_kb: break
    q, data, kb = best; open(path, 'wb').write(data)
    dec = Image.open(io.BytesIO(data)).convert('RGB'); ps, ss = psnr_ssim(im.convert('RGB'), dec)
    print('%-20s %dx%d  q%d  %.0f КБ (цель ≤ %d)  PSNR %.1f дБ  SSIM %.4f' % (os.path.basename(path), im.width, im.height, q, kb, limit_kb, ps, ss))


def main():
    raw = load(SRC); print('сырой:', stats(lab_of(raw)), '%dx%d' % (raw.shape[1], raw.shape[0]))
    g = grade(raw); print('после:', stats(lab_of(g)))
    if PNG: cv2.imwrite(PNG, (g[..., ::-1] * 255 + .5).astype(np.uint8))
    rng = np.random.default_rng(5); os.makedirs(OUT, exist_ok=True)
    for name, (w, h, lim) in SIZES.items():
        im = to_pil(g, w, h)
        a = np.asarray(im).astype(np.float32) + rng.normal(0, .35, (h, w, 1)).astype(np.float32); im = Image.fromarray(np.clip(a + .5, 0, 255).astype(np.uint8))
        encode(im, os.path.join(OUT, name), lim)


if __name__ == '__main__':
    main()
