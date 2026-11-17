"""Чистка стены в слое assets/showroom/layer-shell.webp: убирает тонкое тёмное кольцо-«волосок» вокруг места, где в рендере стояла ваза-шар (контур убранного объекта, радиус ≈ 233 px слоя, центр ≈ (780, 1160)).
Кольцо не двигается вместе с шаром при наезде камеры (слой стены масштабируется меньше), поэтому «волосики» отрывались от шара. Закрашивается весь видимый на стене дуговой участок:
низкие частоты — cv2.inpaint, зерно штукатурки — из соседнего участка (радиальный сдвиг 22 px).  Запуск: python3 tools/showroom-assets/clean_wall.py [--preview out.png]"""
import cv2, numpy as np, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'assets', 'showroom', 'layer-shell.webp')
ORIG = os.path.join(os.path.dirname(__file__), 'orig', 'layer-shell.webp')
img = cv2.cvtColor(np.array(Image.open(ORIG).convert('RGB')), cv2.COLOR_RGB2BGR); H, W = img.shape[:2]
g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
CX, CY, R = 780.43, 1160.40, 233.17                              # кольцо: подгонка окружности по двум видимым дугам
TH0, TH1 = 170, 352                                              # углы (градусы, ось y вниз), где кольцо видно на стене/плинтусе (ниже — пол в тенях, там это не «волосок»)

th = np.deg2rad(np.arange(TH0, TH1 + .01, .25)); rad = np.zeros(len(th))
for i, a in enumerate(th):                                       # радиус кольца в каждом угле: минимум яркости поперёк
    nx, ny = np.cos(a), np.sin(a); best, bv = 0.0, 1e9
    for o in np.arange(-6, 6.1, .5):
        v = cv2.getRectSubPix(g, (1, 1), (float(CX + (R + o) * nx), float(CY + (R + o) * ny)))[0, 0]
        if v < bv: bv, best = v, o
    rad[i] = best
k = 25; pad = np.pad(rad, k // 2, mode='edge'); rad = np.array([np.median(pad[i:i + k]) for i in range(len(rad))])      # медиана — устойчиво к зерну
rad = np.convolve(np.pad(rad, 8, mode='edge'), np.ones(17) / 17, mode='valid')                                         # плавная кривая
line = np.c_[CX + (R + rad) * np.cos(th), CY + (R + rad) * np.sin(th)]
m = np.zeros((H, W), np.uint8); cv2.polylines(m, [np.round(line).astype(np.int32).reshape(-1, 1, 2)], False, 255, 7, cv2.LINE_AA); m = (m > 0).astype(np.uint8)
low = cv2.inpaint(img, cv2.dilate(m, np.ones((3, 3), np.uint8)) * 255, 6, cv2.INPAINT_TELEA).astype(np.float32)
lowb = cv2.GaussianBlur(low, (0, 0), 2.4)
f = img.astype(np.float32); hf = f - cv2.GaussianBlur(f, (0, 0), 2.4)                                                   # зерно штукатурки
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); dx, dy = xx - CX, yy - CY; n = np.maximum(np.hypot(dx, dy), 1)
hfs = cv2.remap(hf, xx + 22 * dx / n, yy + 22 * dy / n, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)               # источник зерна — на 22 px дальше от центра, вне кольца
mf = np.clip(cv2.GaussianBlur(cv2.dilate(m, np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 1.6)[..., None] * 1.3, 0, 1)
work = f * (1 - mf) + (lowb + hfs) * mf
print('кольцо: точек', len(line), 'пикселей маски', int(m.sum()))
out = cv2.cvtColor(np.clip(work, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB)
Image.fromarray(out).save(SRC, quality=90, method=6); print('layer-shell.webp', os.path.getsize(SRC) // 1024, 'КБ')
if '--preview' in sys.argv:
    from PIL import ImageEnhance
    c = Image.fromarray(out).crop((520, 880, 1060, 1200)); c = ImageEnhance.Contrast(c).enhance(2.4).resize((1080, 640), Image.LANCZOS); c.save(sys.argv[sys.argv.index('--preview') + 1])
