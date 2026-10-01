"""Этикетка баночки «Астрея»: белая типографика (альфа-маска) на развёртке по окружности баночки.

Развёртка: u = угол / 360°, v = высота / 3.6 см. Фронт (камера смотрит с -Y) = u 0.75, тыл = u 0.25.
Тексты — только то, что уже есть на сайте (название, «профессиональная косметика», девиз «Наука. Забота. Результат.»).
Знак — тот же вектор, что и логотип сайта (js/hero-mark.js → HM.D).
Запуск: python3 make_label_astreya.py [label.png]
"""
import math
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
R_BODY = 3.65
H_TEX = 3.6
W = 8192
PX = W / (2 * math.pi * R_BODY)
H = int(round(H_TEX * PX))
J300 = os.path.join(HERE, "fonts", "Jost-300-full.ttf")
J400 = os.path.join(HERE, "fonts", "Jost-400-full.ttf")


def font(path, cap_cm):
    return ImageFont.truetype(path, int(round(cap_cm / 0.7 * PX)))      # высота прописной у Jost ≈ 0.7 em


def tracked(d, cx, cy, txt, fnt, track_em, fill=255):
    track = track_em * fnt.size
    w = sum(fnt.getlength(c) + track for c in txt) - track
    x = cx - w / 2
    for c in txt:
        d.text((x, cy), c, font=fnt, fill=fill, anchor="lm")
        x += fnt.getlength(c) + track


def mark_polys():
    """Знак «Астреи» из HM.D: два подконтура (шеврон и дуга) -> списки точек в единицах логотипа."""
    src = open(os.path.join(ROOT, "js", "hero-mark.js"), encoding="utf-8").read()
    d = re.search(r'D:"([^"]+)"', src).group(1)
    polys = []
    for sub in [s for s in d.split("Z") if s.strip()]:
        toks = re.findall(r"[MLC]|-?\d+\.?\d*", sub)
        pts, i, cur = [], 0, None
        while i < len(toks):
            t = toks[i]
            if t in "MLC":
                cmd = t
                i += 1
                continue
            if cmd in "ML":
                cur = (float(toks[i]), float(toks[i + 1]))
                pts.append(cur)
                i += 2
            else:  # C: две контрольные и конечная
                p1, p2, p3 = [(float(toks[i + k]), float(toks[i + k + 1])) for k in (0, 2, 4)]
                for s in range(1, 9):
                    u = s / 8
                    pts.append(tuple((1 - u) ** 3 * cur[j] + 3 * (1 - u) ** 2 * u * p1[j] + 3 * (1 - u) * u * u * p2[j] + u ** 3 * p3[j] for j in (0, 1)))
                cur = p3
                i += 6
        polys.append(pts)
    return polys


def draw_mark(img, cx, cy, size_cm):
    polys = mark_polys()
    xs = [p[0] for q in polys for p in q]
    ys = [p[1] for q in polys for p in q]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = size_cm * PX / max(x1 - x0, y1 - y0)
    S = 4                                                            # суперсэмплинг для гладких краёв
    layer = Image.new("L", (int((x1 - x0) * k) * S + 8, int((y1 - y0) * k) * S + 8), 0)
    dd = ImageDraw.Draw(layer)
    for q in polys:
        dd.polygon([((x - x0) * k * S + 4, (y - y0) * k * S + 4) for x, y in q], fill=255)
    layer = layer.resize((layer.width // S, layer.height // S), Image.LANCZOS)
    img.paste(255, (int(cx - layer.width / 2), int(cy - layer.height / 2)), layer)


def front(img, d):
    cx = 0.75 * W
    y = lambda z: (H_TEX - z) * PX
    draw_mark(img, cx, y(2.92), 0.56)
    tracked(d, cx, y(2.20), "АСТРЕЯ", font(J400, 0.34), 0.40)
    tracked(d, cx, y(1.76), "ПРОФЕССИОНАЛЬНАЯ КОСМЕТИКА", font(J400, 0.15), 0.20)
    tracked(d, cx, y(1.38), "НАУКА · ЗАБОТА · РЕЗУЛЬТАТ", font(J300, 0.125), 0.20)


def back(d):
    cx = 0.25 * W
    y = lambda z: (H_TEX - z) * PX
    words = "НАУКА ЗАБОТА РЕЗУЛЬТАТ ПРОФЕССИОНАЛЬНАЯ КОСМЕТИКА АСТРЕЯ ДИСТРИБЬЮТОР".split()
    import random
    rnd = random.Random(7)
    fm = font(J300, 0.085)
    for i in range(6):
        tracked(d, cx, y(2.55 - i * 0.14), " ".join(rnd.choice(words) for _ in range(rnd.randint(5, 7))), fm, 0.05, fill=200)
    for k in range(4):
        ix, iy, r = cx + (k - 1.5) * 0.62 * PX, y(1.45), 0.2 * PX
        w = max(2, int(0.02 * PX))
        d.ellipse([ix - r, iy - r, ix + r, iy + r], outline=230, width=w)
        if k == 0:
            d.polygon([(ix, iy - 0.12 * PX), (ix - 0.075 * PX, iy + 0.03 * PX), (ix + 0.075 * PX, iy + 0.03 * PX)], outline=230)
        elif k == 1:
            d.arc([ix - 0.09 * PX, iy - 0.09 * PX, ix + 0.09 * PX, iy + 0.09 * PX], 200, 20, fill=230, width=w)
        elif k == 2:
            d.ellipse([ix - 0.05 * PX, iy - 0.05 * PX, ix + 0.05 * PX, iy + 0.05 * PX], outline=230, width=w)
        else:
            d.line([ix - 0.08 * PX, iy, ix + 0.08 * PX, iy], fill=230, width=w)
            d.line([ix, iy - 0.08 * PX, ix, iy + 0.08 * PX], fill=230, width=w)
    tracked(d, cx, y(0.95), "ОФИЦИАЛЬНЫЙ ДИСТРИБЬЮТОР", font(J400, 0.11), 0.20, fill=220)


def main(out=None):
    out = out or os.path.join(HERE, "label.png")
    img = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(img)
    front(img, d)
    back(d)
    img.save(out)
    print("label ->", out, img.size, f"{PX:.1f} px/cm")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
