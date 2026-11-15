#!/usr/bin/env python3
"""Материалы газеты (news.html, css/news-paper.css): плита каменного стола, бумага, «печатные» фото.

  python3 tools/showroom-assets/news/make_news_assets.py            # всё в assets/news/
  python3 tools/showroom-assets/news/make_news_assets.py table      # только стол (table / paper / photos)

Стол: травертин из пака CC0-текстур (travertine-ivory, зеркальная раскладка 2×2 — шов гасят свет и тень), цвет — к общему цвету сайта (Lab, hue ≈ 85°),
затем свет окна слева сверху и мягкая тень листьев (альфа слоя `assets/showroom/layer-plant.webp`, размытая, сдвинутая по лучу).
Бумага: волокна paper-white, бесшовно (зеркало 2×2), цвет газетной бумаги (тёплый кремовый, L ≈ 93).
Фото: «печатный» вид — цвет приглушён наполовину и сведён к тёплому тону сайта, чуть выше контраст; оригинал показывается при наведении и в чтении статьи."""
import os, sys
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
what = sys.argv[1] if len(sys.argv) > 1 else 'all'
sys.argv = sys.argv[:1]                                                         # grade_hall читает argv при импорте
sys.path.insert(0, os.path.join(HERE, '..', 'auditorium'))
import grade_hall as GH                                                         # lab_of / regrade / stats

TEX = os.path.join(ROOT, 'tools', 'showroom-assets', 'textures'); OUT = os.path.join(ROOT, 'assets', 'news')
os.makedirs(OUT, exist_ok=True)


def save(img, name, q=84):
    p = os.path.join(OUT, name); Image.fromarray(img).save(p, quality=q, method=6); print('%-18s %5d КБ  %s' % (name, os.path.getsize(p) // 1024, 'x'.join(map(str, img.shape[1::-1]))))


def table():
    tex = np.asarray(Image.open(os.path.join(TEX, 'travertine-ivory', 'color.jpg')).convert('RGB'))
    W, H = 2560, 1700
    big = cv2.resize(tex, (2700, 2700), interpolation=cv2.INTER_CUBIC)                                            # одна плита без швов: текстура чуть крупнее (×1,32), кроп из неё
    ox, oy = 70, 500
    crop = big[oy:oy + H, ox:ox + W].copy()
    lab = GH.lab_of(crop); ref = dict(L=lab[..., 0].mean(), a=lab[..., 1].mean(), b=lab[..., 2].mean())
    GH.T.update(L_mean=70.0, L_contrast=1.10, clarity=0.0, a_mean=1.0, b_mean=12.6, chroma_max=24)
    img = GH.regrade(crop, ref).astype(np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); u, v = xx / W, yy / H
    # свет окна слева сверху: мягкий градиент + блик на камне
    light = 1.08 - .24 * np.clip((u * .62 + v * .55), 0, 1.4)
    light *= 1 + .10 * np.exp(-(((u - .22) / .30) ** 2 + ((v - .18) / .26) ** 2))
    # тень листьев (слой с альфой): масштаб, поворот, наклон по лучу света, размытие — полутень
    pl = Image.open(os.path.join(ROOT, 'assets', 'showroom', 'layer-plant.webp')).convert('RGBA'); a = np.asarray(pl)[..., 3].astype(np.float32)[:int(pl.height * .62)] / 255                       # только листья — без вазы-шара

    def leaf_shadow(scale, ang, shear, cx, cy, blur):
        h0, w0 = a.shape; s = cv2.resize(a, (int(w0 * scale), int(h0 * scale)), interpolation=cv2.INTER_AREA)
        M = cv2.getRotationMatrix2D((s.shape[1] / 2, s.shape[0] / 2), ang, 1.0); M[0, 1] += shear
        s = cv2.warpAffine(s, M, (s.shape[1], s.shape[0]), flags=cv2.INTER_LINEAR)
        canvas = np.zeros((H, W), np.float32); x0, y0 = int(cx - s.shape[1] / 2), int(cy - s.shape[0] / 2)
        xs0, ys0 = max(0, -x0), max(0, -y0); xe, ye = min(s.shape[1], W - x0), min(s.shape[0], H - y0)
        if xe > xs0 and ye > ys0: canvas[y0 + ys0:y0 + ye, x0 + xs0:x0 + xe] = s[ys0:ye, xs0:xe]
        return cv2.GaussianBlur(canvas, (0, 0), blur)
    sh = leaf_shadow(1.45, 24, .22, W * .86, H * .26, 7) * .36 + leaf_shadow(1.0, -18, -.2, W * .06, H * .92, 11) * .22 + leaf_shadow(.7, 40, .15, W * .62, H * .98, 14) * .14
    img = img * light[..., None] * (1 - np.clip(sh, 0, .5)[..., None] * np.array([.80, .84, .90], np.float32))          # тень чуть теплее/голубее света — как в сцене
    # виньетка и тонкое зерно (скрывает зеркальный шов)
    vg = 1 - .26 * np.clip(np.hypot((u - .5) * 1.25, (v - .5) * 1.1) - .35, 0, 1)
    rng = np.random.default_rng(7); img = img * vg[..., None] + rng.normal(0, .006, img.shape[:2])[..., None]
    out = (np.clip(img, 0, 1) * 255 + .5).astype(np.uint8)
    print('стол:', GH.stats(GH.lab_of(out)))
    save(out, 'table.webp', 82)
    save(cv2.resize(out, (1500, 996), interpolation=cv2.INTER_AREA), 'table-s.webp', 80)


def paper():
    src = np.asarray(Image.open(os.path.join(TEX, 'paper-white', 'color.jpg')).convert('RGB')).astype(np.float32)
    t = src[44:556, 120:632]; g = t.mean(2); g = (g - g.mean()) / (g.std() + 1e-3)                              # только волокна
    tile = np.concatenate([np.concatenate([g, g[:, ::-1]], 1), np.concatenate([g[::-1], g[::-1, ::-1]], 1)], 0)
    base = np.array([244, 238, 222], np.float32)                                                                   # газетная бумага: тёплый кремовый
    img = base[None, None] * (1 + tile[..., None] * .012)
    img += np.random.default_rng(3).normal(0, 1.1, img.shape[:2])[..., None]
    out = np.clip(img, 0, 255).astype(np.uint8); print('бумага:', GH.stats(GH.lab_of(out)))
    save(out, 'paper.webp', 78)


def print_look(rgb, chroma=.52, contrast=1.07, warm=(.5, 4.5)):
    lab = GH.lab_of(rgb); L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    A2 = A * chroma + warm[0]; B2 = B * chroma + warm[1]
    L2 = (L - 52) * contrast + 54
    o = cv2.cvtColor(np.stack([np.clip(L2, 0, 99), A2, B2], -1).astype(np.float32), cv2.COLOR_LAB2RGB)
    o = (np.clip(o, 0, 1) * 255 + .5).astype(np.uint8)
    bl = cv2.GaussianBlur(o, (0, 0), 1.1); return cv2.addWeighted(o, 1.35, bl, -.35, 0)                              # лёгкая резкость печати


def photos():
    jobs = [('assets/academy/video-2.webp', 'ph-seminar-a.webp', (0, 0, 1280, 720), 960), ('assets/academy/video-3.webp', 'ph-seminar-b.webp', (0, 0, 1280, 720), 960),
            ('assets/academy/video-4.webp', 'ph-presenter.webp', (370, 0, 910, 720), 560), ('assets/photos/photo-02-about.webp', 'ph-team.webp', None, 800),
            ('assets/photos/photo-05-expertise.webp', 'ph-care.webp', None, 600)]
    for src, name, box, w in jobs:
        im = Image.open(os.path.join(ROOT, src)).convert('RGB')
        if box: im = im.crop(box)
        if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        save(print_look(np.asarray(im), chroma=.38 if 'seminar' in name else .52), name, 80)


if what in ('all', 'table'): table()
if what in ('all', 'paper'): paper()
if what in ('all', 'photos'): photos()
