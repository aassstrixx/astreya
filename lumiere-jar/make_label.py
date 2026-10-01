"""Текстура этикетки баночки LUMIÈRE: чёрная типографика на прозрачном фоне.

Развёртка по окружности баночки: u = угол / 360°, v = высота / 3.6 см.
Фронт (камера смотрит с -Y) = u 0.75, тыл = u 0.25.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
R_BODY = 3.65                      # радиус корпуса, см
H_TEX = 3.6                        # высота развёртки, см
W = 8192
PX = W / (2 * math.pi * R_BODY)    # пикселей на см
H = int(round(H_TEX * PX))

J300 = os.path.join(HERE, "fonts", "Jost-300.ttf")
J400 = os.path.join(HERE, "fonts", "Jost-400.ttf")
SYMBOL_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"   # для знака ℮


def font(path, cap_cm):
    # у Jost высота прописной ≈ 0.7 em
    return ImageFont.truetype(path, int(round(cap_cm / 0.7 * PX)))


def text_width(txt, fnt, track_px):
    return sum(fnt.getlength(c) + track_px for c in txt) - track_px


def draw_tracked(d, cx_px, cy_px, txt, fnt, track_em, fill=255):
    """Текст с разрядкой, центр по (cx, cy)."""
    track_px = track_em * fnt.size
    w = text_width(txt, fnt, track_px)
    x = cx_px - w / 2
    for c in txt:
        d.text((x, cy_px), c, font=fnt, fill=fill, anchor="lm")
        x += fnt.getlength(c) + track_px
    return w


def front(d):
    cx = 0.75 * W
    y = lambda z: (H_TEX - z) * PX
    draw_tracked(d, cx, y(2.42), "LUMIÈRE", font(J400, 0.36), 0.42)
    draw_tracked(d, cx, y(1.95), "SKIN RENEWAL CREAM", font(J400, 0.19), 0.30)
    draw_tracked(d, cx, y(1.57), "REJUVENATE · HYDRATE · PROTECT", font(J300, 0.135), 0.16)
    # «50 ml ℮ 1.7 FL.OZ.»
    f = font(J400, 0.17)
    fs = ImageFont.truetype(SYMBOL_FONT, int(f.size * 1.05))
    parts = [("50 ml", f), ("℮", fs), ("1.7 FL.OZ.", f)]
    gap = 0.9 * f.size * 0.45
    total = sum(p[1].getlength(p[0]) + len(p[0]) * 0.06 * f.size for p in parts) + 2 * gap
    x = cx - total / 2
    yy = y(0.98)
    for txt, fn in parts:
        for c in txt:
            d.text((x, yy), c, font=fn, fill=255, anchor="lm")
            x += fn.getlength(c) + 0.06 * f.size
        x += gap


def back(d):
    """Тыл: микротекст и четыре значка (как на референсе). Слова — только из надписей фронта."""
    cx = 0.25 * W
    y = lambda z: (H_TEX - z) * PX
    words = "SKIN RENEWAL CREAM REJUVENATE HYDRATE PROTECT LUMIÈRE 50 ml 1.7 FL.OZ.".split()
    rnd = random.Random(7)
    fm = font(J300, 0.085)
    for i in range(6):
        line = " ".join(rnd.choice(words) for _ in range(rnd.randint(7, 9)))
        draw_tracked(d, cx, y(2.55 - i * 0.14), line, fm, 0.05, fill=200)
    # значки
    for k in range(4):
        ix = cx + (k - 1.5) * 0.62 * PX
        iy = y(1.45)
        r = 0.2 * PX
        d.ellipse([ix - r, iy - r, ix + r, iy + r], outline=230, width=max(2, int(0.02 * PX)))
        if k == 0:    # капля
            d.polygon([(ix, iy - 0.12 * PX), (ix - 0.075 * PX, iy + 0.03 * PX), (ix + 0.075 * PX, iy + 0.03 * PX)], outline=230)
        elif k == 1:  # листок
            d.arc([ix - 0.09 * PX, iy - 0.09 * PX, ix + 0.09 * PX, iy + 0.09 * PX], 200, 20, fill=230, width=max(2, int(0.02 * PX)))
        elif k == 2:  # солнце
            d.ellipse([ix - 0.05 * PX, iy - 0.05 * PX, ix + 0.05 * PX, iy + 0.05 * PX], outline=230, width=max(2, int(0.02 * PX)))
        else:         # плюс
            d.line([ix - 0.08 * PX, iy, ix + 0.08 * PX, iy], fill=230, width=max(2, int(0.02 * PX)))
            d.line([ix, iy - 0.08 * PX, ix, iy + 0.08 * PX], fill=230, width=max(2, int(0.02 * PX)))
    draw_tracked(d, cx, y(0.95), "50 ml   1.7 FL.OZ.", font(J400, 0.12), 0.2, fill=220)


def main(out=None):
    out = out or os.path.join(HERE, "label.png")
    img = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(img)
    front(d)
    back(d)
    img.save(out)
    print("label ->", out, img.size, f"{PX:.1f} px/cm")


if __name__ == "__main__":
    main()
