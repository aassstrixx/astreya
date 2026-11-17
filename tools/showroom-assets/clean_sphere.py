"""Чистка каменного шара в слое assets/showroom/layer-plant.webp: убирает «отвалившиеся» куски — глубокие трещины со сколами и «мохнатую» бахрому у края.
Метод ретушёра: для каждой области подбирается чистый участок шара (по энергии трещин и по близкому освещению), он копируется и вшивается по Пуассону (cv2.seamlessClone),
затем альфа за пределами окружности шара в области края обнуляется.  Запуск: python3 tools/showroom-assets/clean_sphere.py [--preview out.png]
Координаты областей — в пикселях слоя (1589×1375); preview-координаты (×2 от кадра (440,880)) пересчитываются функцией P()."""
import cv2, numpy as np, os, sys
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'showroom', 'layer-plant.webp')
ORIG = os.path.join(os.path.dirname(__file__), 'orig', 'layer-plant.webp')                 # исходный слой (до чистки)
im = Image.open(ORIG).convert('RGBA'); A = np.array(im); rgb = cv2.cvtColor(A[..., :3], cv2.COLOR_RGB2BGR); al = A[..., 3].copy()
H, W = al.shape

# --- окружность шара: по нижней половине маски (без стебля и веток)
sub = (al[880:, :] > 128).astype(np.uint8); cnts, _ = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cnts, key=cv2.contourArea)[:, 0, :].astype(np.float64); c[:, 1] += 880
lowhalf = c[c[:, 1] > 1120]
Am = np.c_[2 * lowhalf[:, 0], 2 * lowhalf[:, 1], np.ones(len(lowhalf))]; b = (lowhalf ** 2).sum(1)
sol = np.linalg.lstsq(Am, b, rcond=None)[0]; cx, cy = sol[0], sol[1]; R = np.sqrt(sol[2] + cx * cx + cy * cy)
print('шар: центр (%.1f, %.1f), радиус %.1f' % (cx, cy, R))
yy, xx = np.mgrid[0:H, 0:W]; rr = np.hypot(xx - cx, yy - cy)

def P(pts):                                                     # координаты preview (2× от кадра (440,880)) → пиксели слоя
    return np.array([[440 + x / 2, 880 + y / 2] for x, y in pts], np.float32)

# области: roi — полигон в координатах preview, t — порог «тёмного штриха» (blackhat), d — расширение маски, px; трещины ищутся внутри области автоматически
REGIONS = {
    'crack_left': dict(roi=[(300, 90), (520, 90), (520, 200), (430, 255), (345, 330), (305, 450), (285, 520), (150, 520), (150, 420), (205, 300), (255, 200)], t=20, d=11),
    'peel_topright': dict(roi=[(700, 150), (790, 175), (870, 225), (925, 280), (950, 360), (935, 420), (890, 410), (850, 330), (790, 255), (710, 215), (680, 180)], t=22, d=9),
}
EDGE = dict(roi=[(900, 340), (1010, 340), (1010, 700), (900, 700)], taper=40)                              # срез правой кромки: светлый «язык» и тёмные сколы за стёртым краем шара
only = [a for a in sys.argv[1:] if a in REGIONS or a == 'edge']
CORR = float(os.environ.get('CORR', '0')); EDGE_CUT = float(os.environ.get('EDGE_CUT', '13'))

g = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY).astype(np.float32)
bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))      # трещины: тёмные штрихи шире зерна
body = (al > 250).astype(np.uint8); body[:912] = 0                           # тело шара по настоящей альфе; выше — ветки и стебель не трогаем
inside = cv2.erode(body, np.ones((7, 7), np.uint8)).astype(np.float32)
def lowpass(img, s=11):
    w = inside[..., None]; return cv2.GaussianBlur(img.astype(np.float32) * w, (0, 0), s) / np.maximum(cv2.GaussianBlur(w[..., 0], (0, 0), s), 1e-3)[..., None]
lpf = lowpass(rgb)
safe = (cv2.erode(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (35, 35))) & (rr < R - 22)).astype(np.uint8)        # источник — только настоящий камень: не кромка и не светлый «язык» у правого края
def roll(a, dy, dx): return np.roll(np.roll(a, dy, 0), dx, 1)

out = rgb.astype(np.float32).copy()
for name, cfg in REGIONS.items():
    if only and name not in only: continue
    roi = np.zeros((H, W), np.uint8); cv2.fillPoly(roi, [P(cfg['roi']).astype(np.int32)], 255)
    m = ((bh > cfg['t']) & (roi > 0)).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8); keep = np.zeros_like(m)
    for k in range(1, n):
        if st[k, 4] >= 40: keep[lab == k] = 1
    m = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * cfg['d'] + 1, 2 * cfg['d'] + 1))); m = (m > 0) & (inside > 0)
    mb = m; best, bs = None, 1e18
    for dy in range(-130, 131, 4):
        for dx in range(-130, 131, 4):
            if abs(dx) + abs(dy) < 30: continue
            sm = roll(mb, dy, dx)
            if not safe[sm].all(): continue
            sc = bh[sm].mean() * 3 + np.abs(lpf[sm] - lpf[mb]).mean() * 1.6 + 0.03 * np.hypot(dx, dy)
            if sc < bs: bs, best = sc, (dx, dy)
    print(name, 'пикселей маски', int(mb.sum()), 'источник сдвиг', best, 'оценка %.2f' % bs)
    if not best: continue
    dy, dx = best[1], best[0]
    corr = np.clip(lpf - roll(lpf, -dy, -dx), -CORR, CORR) if CORR else 0                                # источник для пикселя p — пиксель p + (dx, dy)
    src = roll(out, -dy, -dx) + corr
    mf = np.clip(cv2.GaussianBlur(mb.astype(np.float32), (0, 0), 3.0)[..., None] * 1.3, 0, 1)
    out = out * (1 - mf) + src * mf

if not only or 'edge' in only:
    roi = np.zeros((H, W), np.uint8); cv2.fillPoly(roi, [P(EDGE['roi']).astype(np.int32)], 255)
    ys = np.where(roi.any(1))[0]; y0, y1 = ys.min(), ys.max()
    wy = np.clip(np.minimum(yy - y0, y1 - yy) / EDGE['taper'], 0, 1); wy = wy * wy * (3 - 2 * wy)             # срез плавно сходит на нет у границ области — без «ступенек» на кромке
    cut = (roi > 0) & (rr > R - EDGE_CUT * wy); al[cut] = 0
    edge = cv2.GaussianBlur((al > 0).astype(np.float32), (0, 0), 1.0); sel = roi > 0
    al[sel] = np.clip(edge[sel] * 1.15, 0, 1).astype(np.float32).__mul__(al[sel]).astype(np.uint8)            # мягкая кромка

res = np.dstack([cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB), al])
Image.fromarray(res, 'RGBA').save(SRC, quality=92, method=6)
print('layer-plant.webp', os.path.getsize(SRC) // 1024, 'КБ')
if '--preview' in sys.argv:
    pv = Image.alpha_composite(Image.new('RGBA', (W, H), (255, 0, 255, 255)), Image.fromarray(res, 'RGBA')).convert('RGB').crop((440, 880, 980, 1375)).resize((1080, 990), Image.LANCZOS)
    pv.save(sys.argv[sys.argv.index('--preview') + 1])
