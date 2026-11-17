"""Чистка стены в слое assets/showroom/layer-shell.webp: убирает две тонкие тёмные дуги-«волоски» на штукатурке (след рендера) слева над плинтусом.
Дуга ведётся по контрольным точкам, уточняется по минимуму яркости поперёк линии, затем закрашивается: низкие частоты — cv2.inpaint, зерно штукатурки — из соседнего участка.
Запуск: python3 tools/showroom-assets/clean_wall.py [--preview out.png]"""
import cv2, numpy as np, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'assets', 'showroom', 'layer-shell.webp')
ORIG = os.path.join(os.path.dirname(__file__), 'orig', 'layer-shell.webp')
img = cv2.cvtColor(np.array(Image.open(ORIG).convert('RGB')), cv2.COLOR_RGB2BGR); H, W = img.shape[:2]
g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)

# контрольные точки дуг (пиксели слоя 3072×2048) и сдвиг, из которого берётся зерно (перпендикулярно дуге, 24 px)
ARCS = {
    'left': dict(pts=[(565, 1072), (580, 1035), (602, 1011), (631, 984), (651, 969), (670, 956), (691, 945)], shift=(14, 20)),
    'right': dict(pts=[(803, 924), (840, 934), (870, 945), (905, 965), (940, 995), (965, 1020), (986, 1044)], shift=(-11, 21)),
}

def refine(pts, rad=6):
    """точки вдоль ломаной с шагом 2 px; каждая сдвигается по нормали к минимуму яркости (±rad), смещения сглаживаются"""
    pts = np.array(pts, np.float64); seg = np.hypot(*np.diff(pts, axis=0).T); L = np.r_[0, np.cumsum(seg)]
    t = np.arange(0, L[-1], 2.0); x = np.interp(t, L, pts[:, 0]); y = np.interp(t, L, pts[:, 1])
    dx, dy = np.gradient(x), np.gradient(y); n = np.hypot(dx, dy); nx, ny = -dy / n, dx / n
    off = np.zeros(len(t))
    for i in range(len(t)):
        best, bv = 0, 1e9
        for o in np.arange(-rad, rad + .1, .5):
            px, py = x[i] + nx[i] * o, y[i] + ny[i] * o
            v = cv2.getRectSubPix(g, (1, 1), (float(px), float(py)))[0, 0]
            if v < bv: bv, best = v, o
        off[i] = best
    off = cv2.GaussianBlur(off.reshape(-1, 1).astype(np.float32), (1, 0), sigmaX=0.1, sigmaY=6).ravel()      # сглаживание вдоль дуги
    return np.c_[x + nx * off, y + ny * off]

work = img.astype(np.float32).copy()
for name, cfg in ARCS.items():
    line = refine(cfg['pts']); m = np.zeros((H, W), np.uint8)
    cv2.polylines(m, [np.round(line).astype(np.int32).reshape(-1, 1, 2)], False, 255, 7, cv2.LINE_AA)
    m = (m > 0).astype(np.uint8)
    low = cv2.inpaint(img, cv2.dilate(m, np.ones((3, 3), np.uint8)) * 255, 6, cv2.INPAINT_TELEA).astype(np.float32)
    lowb = cv2.GaussianBlur(low, (0, 0), 2.4)
    hf = img.astype(np.float32) - cv2.GaussianBlur(img.astype(np.float32), (0, 0), 2.4)                       # зерно штукатурки
    dx, dy = cfg['shift']; hfs = np.roll(np.roll(hf, -dy, 0), -dx, 1)
    fill = lowb + hfs
    mf = np.clip(cv2.GaussianBlur(cv2.dilate(m, np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 1.6)[..., None] * 1.3, 0, 1)
    work = work * (1 - mf) + fill * mf
    print(name, 'точек', len(line), 'пикселей маски', int(m.sum()))
out = cv2.cvtColor(np.clip(work, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB)
Image.fromarray(out).save(SRC, quality=90, method=6); print('layer-shell.webp', os.path.getsize(SRC) // 1024, 'КБ')
if '--preview' in sys.argv:
    from PIL import ImageEnhance
    c = Image.fromarray(out).crop((560, 880, 1060, 1180)); c = ImageEnhance.Contrast(c).enhance(2.2).resize((1000, 600), Image.LANCZOS); c.save(sys.argv[sys.argv.index('--preview') + 1])
