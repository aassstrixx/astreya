#!/usr/bin/env python3
"""Заплатка «стол без нарисованного журнала» для телефона (assets/house-hall/read-m.webp, RGBA 900×1600).

Нарисованный журнал в последнем ключе пролёта (ffm/048) лежит под живой страницей; пока читатель смотрит журнал, он не должен торчать сбоку.
Заплатка — это тот же кадр 048, где журнал замазан фоном (tools/jar-render/src/read-m-plate.webp, 600×1067 — заготовка с заливкой текстурой штукатурки),
но только там, где заготовка отличается от кадра: альфа = сглаженная разница; снаружи прозрачно — картинка пролёта остаётся нетронутой (ни мягче, ни светлее).
В заготовке зерно крупнее (она в 1,5 раза мельче кадра), поэтому внутри заплатки берётся её сглаженный цвет и добавляется зерно того же размера и силы, что у кадра.
Запуск: python3 tools/jar-render/clean_patch.py   (нужны numpy, opencv-python, Pillow)"""
import os, sys
import numpy as np, cv2
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KEY = os.path.join(ROOT, 'assets/house-hall/ffm/048.webp')
PLATE = os.path.join(ROOT, 'tools/jar-render/src/read-m-plate.webp')
OUT = os.path.join(ROOT, 'assets/house-hall/read-m.webp')

K = cv2.imread(KEY).astype(np.float32)                      # BGR
H, W = K.shape[:2]
P = cv2.resize(cv2.imread(PLATE).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
D = np.abs(cv2.GaussianBlur(K, (0, 0), 5) - cv2.GaussianBlur(P, (0, 0), 5)).max(2)
core = (D > 14).astype(np.uint8)                              # где заготовка заметно отличается от кадра — там был журнал (и заливка вокруг него)
core = cv2.morphologyEx(core, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(core, 8)
pts = np.concatenate([np.argwhere(lab == i)[:, ::-1] for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 3000]).astype(np.int32)
hull = np.zeros((H, W), np.uint8)
cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)              # журнал целиком, без «дыр» там, где его картинка похожа на штукатурку (белые халаты, светлая стена)
hull = cv2.dilate(hull, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 29)))
alpha = cv2.GaussianBlur(hull.astype(np.float32), (0, 0), 9)
alpha = np.clip(alpha * 1.1, 0, 1)

def hp(a): return a - cv2.GaussianBlur(a, (0, 0), 2.0)
ref = hp(K)[1290:1450, 520:880]                               # ровная штукатурка под журналом: сила зерна кадра
sigma = float(ref.std())
rng = np.random.default_rng(48)
noise = cv2.GaussianBlur(rng.normal(0, 1, (H, W, 3)).astype(np.float32), (0, 0), 0.8)
noise *= sigma / max(float(hp(noise).std()), 1e-6)
base = cv2.GaussianBlur(P, (0, 0), 1.6)
rgb = np.clip(base + noise, 0, 255)
rgba = np.dstack([rgb[..., 2], rgb[..., 1], rgb[..., 0], alpha * 255]).astype(np.uint8)
Image.fromarray(rgba, 'RGBA').save(OUT, 'WEBP', quality=86, method=6, alpha_quality=96)
print('grain sigma', round(sigma, 2), '| alpha>0.5: %.1f%%' % ((alpha > .5).mean() * 100), '| size', os.path.getsize(OUT) // 1024, 'KB')
