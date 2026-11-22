#!/usr/bin/env python3
"""Постобработка подставки-призмы (table_glass.py, режимы TG_MODE=strip и TG_MODE=collar) → assets/news/leg-strip.webp, leg-cap.webp, leg-plinth.webp.

  python3 tools/showroom-assets/news/table3d_leg_post.py floor_raw.png strip_%02d.png cap.png plinth.png

  floor_raw.png — сырой рендер пола (из него берутся средние Lab: цвет подставки сдвигается так же, как у пола, table3d_post.py);
  strip_%02d.png — 11 ортогональных видов ножки с азимутов 105…255° (по 150×1434 RGBA, 1 px = 2/3 px страницы), склеиваются в одну полосу 1650×1434:
                   вид k занимает x = 150·k … 150·k+150 (100 px страницы), а грань призмы берёт из него центральный срез своей ширины (ствол 64, плинт 85, воротник 80 px страницы);
  cap.png / plinth.png — диски сверху: латунный воротник (R 300 px, кадр 640 px) и верх плинта (R 320 px, кадр 680 px).
Вес: полоса ≲ 450 КБ, диски — десятки КБ."""
import os, sys, io
import numpy as np, cv2
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..')); OUT = os.environ.get('T3_OUT', os.path.join(ROOT, 'assets', 'news'))
sys.path.insert(0, HERE)
import table_glass_post as PG


def read_rgba(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED); k = 65535.0 if im.dtype == np.uint16 else 255.0
    al = im[..., 3].astype(np.float32) / k if im.shape[2] == 4 else np.ones(im.shape[:2], np.float32)       # виды ствола — без альфы (центральные 100 px целиком внутри силуэта), диски — RGBA
    return im[..., 2::-1].astype(np.float32) / k, al


def to_u8(x): return (np.clip(x, 0, 1) * 255 + .5).astype(np.uint8)


def save(img, name, limit_kb, qmax=90):
    best = None
    for q in range(qmax, 55, -2):
        buf = io.BytesIO(); img.save(buf, 'WEBP', quality=q, alpha_quality=95, method=6, sns_strength=70, filter_strength=25, segments=4, exact=False); kb = len(buf.getvalue()) / 1024; best = (q, buf.getvalue(), kb)
        if kb <= limit_kb: break
    q, data, kb = best; open(os.path.join(OUT, name), 'wb').write(data); print('%-18s %dx%d q%d %.0f КБ (цель ≤ %d)' % (name, img.width, img.height, q, kb, limit_kb))


def layer(path, ref, sharp=35):
    rgb, al = read_rgba(path); g = PG.grade(rgb, ref)
    im = Image.fromarray(to_u8(g)).filter(ImageFilter.UnsharpMask(radius=1.0, percent=sharp, threshold=2)); return Image.merge('RGBA', (*im.split(), Image.fromarray(to_u8(al))))


def main():
    floor_raw, strip_pat, cap, plinth = sys.argv[1:5]; ref = PG.ref_of(PG.load(floor_raw))
    views = [layer(strip_pat % k if '%' in strip_pat else strip_pat, ref) for k in range(11)]
    w, h = views[0].size; strip = Image.new('RGBA', (w * 11, h), (0, 0, 0, 0))
    for k, v in enumerate(views): strip.paste(v, (w * k, 0))
    save(strip, 'leg-strip.webp', 450); save(layer(cap, ref), 'leg-cap.webp', 80); save(layer(plinth, ref), 'leg-plinth.webp', 80)


if __name__ == '__main__':
    main()
