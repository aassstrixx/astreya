#!/usr/bin/env python3
"""Подготовка фото товара для витрины: убирает однородный фон (обычно белый у каталожных снимков), обрезает по контуру, сохраняет WebP с прозрачностью.

  python3 tools/product-photo.py снимок.jpg assets/products/ir-shampoo.webp
  python3 tools/product-photo.py --dir исходники/ --out assets/products/        (все снимки папки; имя файла сохраняется)

Как работает: цвет фона берётся по рамке снимка; «фоном» считается только то, что с этим цветом связано от края (заливкой) и мало от него отличается, — поэтому белая крышка или
белый флакон внутри контура остаются нетронутыми. Край делается мягким (полупрозрачным), цвет края очищается от фона (чтобы не было белой «каймы» на тёмной подложке).
Серая тень под упаковкой убирается, если она связана с фоном (--shadow); без этого флага остаётся как есть (витрина рисует свою мягкую тень под товаром).
Если снимок уже с прозрачностью — только обрезка и уменьшение. Предупреждает, если фон неоднородный (вырезание ненадёжно) или контур «протёк» (вырезано слишком много).
Нужны: pip install pillow numpy scipy. Фото кладутся в assets/products/ и указываются в админке («Товары по брендам») или в data/products.json → image."""
import argparse, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def cutout(im, tol=14, soft=22, shadow=False, verbose=True):
    """im — PIL.Image; возвращает RGBA и список предупреждений."""
    warns = []
    rgba = im.convert('RGBA')
    a0 = np.asarray(rgba.getchannel('A'))
    if a0.min() < 250 and (a0 < 250).mean() > 0.02:                       # уже есть прозрачность
        return rgba, warns
    rgb = np.asarray(rgba.convert('RGB')).astype(np.float32)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0, :], rgb[-1, :], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    if border.std(axis=0).max() > 14:
        warns.append('фон по краям неоднородный (σ=%.0f): вырезание может быть неточным — лучше снимок на ровном белом фоне' % border.std(axis=0).max())
    d = np.abs(rgb - bg).max(axis=2)                                          # насколько пиксель отличается от фона
    lo, hi = float(tol), float(tol + soft)
    bgmask = d <= lo                                                           # точно фон (по цвету)
    lab, n = ndi.label(bgmask)
    edge_labels = np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))
    edge_labels = edge_labels[edge_labels > 0]
    bgc = np.isin(lab, edge_labels)                                            # фон, связанный с краем снимка
    if shadow:                                                                 # пологая серая тень, связанная с фоном: малая насыщенность, не темнее 60 %
        mx, mn = rgb.max(axis=2), rgb.min(axis=2)
        gray = ((mx - mn) < 14) & (mx > 0.6 * bg.max())
        lab2, _ = ndi.label(gray | bgc)
        keep = np.unique(lab2[bgc]); keep = keep[keep > 0]
        bgc = np.isin(lab2, keep) & (gray | bgc)
    fg = ~bgc
    fg = ndi.binary_opening(fg, iterations=1) | ndi.binary_erosion(fg, iterations=2)    # мелкий мусор по краю
    lab3, n3 = ndi.label(fg)
    if n3 > 1:                                                                 # оставляем самую большую связную часть (товар), мелочь — шум
        sizes = ndi.sum(fg, lab3, range(1, n3 + 1)); fg = lab3 == (1 + int(np.argmax(sizes)))
    fg = ndi.binary_fill_holes(fg)
    ratio = fg.mean()
    if ratio < 0.04: warns.append('товар занимает всего %.0f%% кадра — вырезание «съело» его (светлая упаковка на белом?): уменьшите --tol' % (100 * ratio))
    if ratio > 0.85: warns.append('контур не найден (%.0f%% кадра — «товар»): фон не белый/однородный?' % (100 * ratio))
    # мягкий край: у границы альфа плавно растёт от 0 до 1 по расстоянию цвета от фона
    dist_out = ndi.distance_transform_edt(~fg)                                 # расстояние от товара наружу
    dist_in = ndi.distance_transform_edt(fg)
    band = (dist_out <= 2) | (dist_in <= 2)
    soft_a = np.clip((d - lo) / max(1.0, hi - lo), 0, 1)
    alpha = np.where(fg, 1.0, 0.0)
    edge = band & (dist_in <= 2)
    alpha = np.where(edge, np.maximum(soft_a, 0.35 * np.clip(dist_in / 2.0, 0, 1) + 0.0), alpha)
    alpha = ndi.gaussian_filter(alpha, 0.6) * (dist_out <= 1.5)  if False else ndi.gaussian_filter(alpha, 0.6)
    alpha = np.where(dist_out > 2, 0.0, np.where(dist_in > 2, 1.0, alpha))
    # очистка цвета края от фона: F = (I − (1−α)·B) / α
    a3 = np.clip(alpha, 0.001, 1.0)[..., None]
    f = np.where((alpha[..., None] < 0.98) & (alpha[..., None] > 0.01), (rgb - (1 - a3) * bg) / a3, rgb)
    out = np.dstack([np.clip(f, 0, 255), np.clip(alpha, 0, 1) * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA'), warns


def trim_resize(im, pad=0.02, max_h=1400):
    bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        l, t, r, b = bbox; pw, ph = int((r - l) * pad) + 1, int((b - t) * pad) + 1
        im = im.crop((max(0, l - pw), max(0, t - ph), min(im.width, r + pw), min(im.height, b + ph)))
    if im.height > max_h:
        im = im.resize((round(im.width * max_h / im.height), max_h), Image.LANCZOS)
    return im


def process(src, dst, **kw):
    im = Image.open(src)
    out, warns = cutout(im, tol=kw.get('tol', 14), soft=kw.get('soft', 22), shadow=kw.get('shadow', False))
    out = trim_resize(out)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    out.save(dst, 'WEBP', quality=90, method=6, alpha_quality=95)
    print('✓ %s → %s  %dx%d, %d КБ' % (src, dst, out.width, out.height, os.path.getsize(dst) // 1024))
    for w in warns: print('  ⚠', w)
    return out, warns


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', nargs='?'); ap.add_argument('dst', nargs='?')
    ap.add_argument('--dir'); ap.add_argument('--out', default='assets/products')
    ap.add_argument('--tol', type=int, default=14, help='допуск цвета фона (0–255), по умолчанию 14')
    ap.add_argument('--soft', type=int, default=22, help='ширина мягкого края (по цвету), по умолчанию 22')
    ap.add_argument('--shadow', action='store_true', help='убрать серую тень под упаковкой, если она связана с фоном')
    a = ap.parse_args()
    if a.dir:
        for f in sorted(os.listdir(a.dir)):
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                process(os.path.join(a.dir, f), os.path.join(a.out, os.path.splitext(f)[0] + '.webp'), tol=a.tol, soft=a.soft, shadow=a.shadow)
    elif a.src and a.dst:
        process(a.src, a.dst, tol=a.tol, soft=a.soft, shadow=a.shadow)
    else:
        ap.print_help(); sys.exit(1)
