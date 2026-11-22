#!/usr/bin/env python3
"""Постобработка слоёв объёмного стола (table_glass.py, режимы TG_MODE=floor и TG_MODE=column) → assets/news/floor.webp, floor-m.webp, column.webp.

  python3 tools/showroom-assets/news/table3d_post.py floor.png column.png

Цвет — к гамме сайта (table_glass_post.grade: Lab, a/b к целевым, яркость к L ≈ 74–78, зелёное не уводится в жёлтое); колонна получает те же средние, что и пол (один сдвиг на оба слоя).
Пол: северные ~500 px кадра (верх картинки = дальний край плиты) плавно уходят в плоский цвет FLAT — он печатается в конце и должен совпадать с фоном .np-world и цветом плиты в css/news-table.css,
иначе виден шов. Колонна: RGBA, цвет под прозрачным не важен. Вес: floor ≲ 900 КБ, floor-m ≲ 350 КБ, column ≲ 350 КБ."""
import os, sys, io
import numpy as np, cv2
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..')); OUT = os.environ.get('T3_OUT', os.path.join(ROOT, 'assets', 'news'))
sys.path.insert(0, HERE)
import table_glass_post as PG

FADE = int(os.environ.get('T3_FADE', 520))           # px кадра пола, на которых север переходит в плоский цвет
_f = lambda k, d: float(os.environ.get(k, d))


def to_u8(rgb): return (np.clip(rgb, 0, 1) * 255 + .5).astype(np.uint8)


def sharpen(im, pct=40):
    return im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=pct, threshold=2))


def save(im, path, limit_kb, alpha=False):
    best = None
    for q in range(94, 61, -2):
        buf = io.BytesIO(); kw = dict(quality=q, method=6, sns_strength=70, filter_strength=30, segments=4)
        if alpha: kw.update(alpha_quality=96, exact=False)
        im.save(buf, 'WEBP', **kw); kb = len(buf.getvalue()) / 1024; best = (q, buf.getvalue(), kb)
        if kb <= limit_kb: break
    q, data, kb = best; open(path, 'wb').write(data); print('%-18s %dx%d q%d %.0f КБ (цель ≤ %d)' % (os.path.basename(path), im.width, im.height, q, kb, limit_kb))


def main():
    fl_path, col_path = sys.argv[1], sys.argv[2]
    raw = PG.load(fl_path); ref = PG.ref_of(raw); g = PG.grade(raw, ref); print('пол после цвета:', PG.stats(PG.lab_of(g)))
    h, w = g.shape[:2]
    # север → плоский цвет: цвет полосы в начале перехода (после лёгкого размытия), чтобы переход был мягким, а не «заливкой» чужого цвета
    band = g[FADE - 60:FADE + 20].reshape(-1, 3); flat = band.mean(0)
    y = np.arange(h, dtype=np.float32)[:, None]; t = np.clip(1 - y / FADE, 0, 1); t = (t * t * (3 - 2 * t))[..., None]
    g = g * (1 - t) + flat[None, None, :] * t
    print('плоский цвет севера: #%02x%02x%02x' % tuple(to_u8(flat)))
    rng = np.random.default_rng(7)
    for name, (tw, th, lim) in {'floor.webp': (3200, 2133, 900), 'floor-m.webp': (1600, 1067, 350)}.items():
        im = sharpen(Image.fromarray(to_u8(g)).resize((tw, th), Image.LANCZOS)); a = np.asarray(im).astype(np.float32) + rng.normal(0, .35, (th, tw, 1))
        save(Image.fromarray(np.clip(a + .5, 0, 255).astype(np.uint8)), os.path.join(OUT, name), lim)
    # колонна: RGBA, тот же сдвиг цвета, что у пола
    cr = cv2.imread(col_path, cv2.IMREAD_UNCHANGED); rgb = cr[..., 2::-1].astype(np.float32) / (65535.0 if cr.dtype == np.uint16 else 255.0); al = cr[..., 3].astype(np.float32) / (65535.0 if cr.dtype == np.uint16 else 255.0)
    gc = PG.grade(rgb, ref); im = Image.fromarray(np.dstack([to_u8(gc), to_u8(al)]), 'RGBA'); rgb_im = sharpen(im.convert('RGB'), 35); im = Image.merge('RGBA', (*rgb_im.split(), im.split()[3]))
    save(im, os.path.join(OUT, 'column.webp'), 350, alpha=True)


if __name__ == '__main__':
    main()
