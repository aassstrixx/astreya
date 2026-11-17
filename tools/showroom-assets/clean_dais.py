"""Чистка слоя assets/showroom/layer-dais.webp: нижняя половина каменного шара (запечена в слой стола) выходит за силуэт шара из слоя растений тёмной полосой скола справа и бахромой слева внизу;
при наезде камеры слои масштабируются по-разному, и эти «отвалившиеся» куски показываются рядом с шаром. Они закрашиваются (cv2.inpaint) по фону стола.
Запуск: python3 tools/showroom-assets/clean_dais.py [--preview out.png]"""
import cv2, numpy as np, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'assets', 'showroom', 'layer-dais.webp')
ORIG = os.path.join(os.path.dirname(__file__), 'orig', 'layer-dais.webp')
A = np.array(Image.open(ORIG).convert('RGBA')); rgb = cv2.cvtColor(A[..., :3], cv2.COLOR_RGB2BGR); al = A[..., 3]
H, W = al.shape
CX, CY, R = 780.1, 222.3, 227.1                                  # силуэт шара (из слоя растений: центр (707,1145) → координаты слоя стола (x + 73, y − 923))
yy, xx = np.mgrid[0:H, 0:W]; rr = np.hypot(xx - CX, yy - CY)
ZONES = [                                                        # (x0, y0, x1, y1, внешний радиус кольца): правый скол и левая нижняя бахрома
    (930, 280, 1010, 400, 18),
    (570, 360, 690, 425, 14),
]
m = np.zeros((H, W), np.uint8)
for x0, y0, x1, y1, ro in ZONES:
    z = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (rr > R - 0.5) & (rr < R + ro); m[z] = 255
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
m = cv2.dilate(m, np.ones((3, 3), np.uint8))
m[rr < R - 0.5] = 0                                              # внутрь силуэта не заходим: там шар из слоя растений
out = cv2.inpaint(rgb, m, 6, cv2.INPAINT_TELEA)
res = np.dstack([cv2.cvtColor(out, cv2.COLOR_BGR2RGB), al])
Image.fromarray(res, 'RGBA').save(SRC, quality=92, method=6); print('layer-dais.webp', os.path.getsize(SRC) // 1024, 'КБ, пикселей маски', int((m > 0).sum()))
if '--preview' in sys.argv:
    bgr = cv2.cvtColor(res[..., :3], cv2.COLOR_RGB2BGR); crop = bgr[230:480, 520:1100]; cv2.imwrite(sys.argv[sys.argv.index('--preview') + 1], cv2.resize(crop, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC))
