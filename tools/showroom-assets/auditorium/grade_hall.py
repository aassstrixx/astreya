#!/usr/bin/env python3
"""Финальная цветокоррекция рендера зала «Обучения» под гамму сайта и выгрузка hall*.webp.

Вход:  /tmp/aud_graded.png (результат academy_auditorium.py, уже прошёл S.grade) либо путь первым аргументом.
Выход: assets/academy/hall.webp (2880×1620), hall-s.webp (1500 px), hall-m.webp (кроп для телефона 1,28:1, 1200 px);
       --out DIR — писать в другую папку (предпросмотр, сайт не трогаем).

Зачем отдельный шаг: рендер зала светлее и «белее» других страниц (L ≈ 78 против 68–70, chroma ≈ 11 против 15, hue 76° против 85–89° у стены брендов
и зала главной). Делаем частичный перенос цвета в Lab (не до полного совпадения — зал белый по задумке владельца):
  a, b — перенос к целевым средним, но с ВЕСОМ, который гасит правку у синих пикселей (кресла, арки, логотип): w = clip(1 + b/14, 0..1),
         поэтому тёмно-синий остаётся тёмно-синим, а кремовые стены/пол/латунь уходят в тёплый «травертиновый» тон сайта;
  L  — среднее → TARGET_L (67,5: зал чуть темнее, как просил заказчик), контраст × 1.09 вокруг среднего + мягкий локальный контраст CLAHE (clarity 0,32) — структура материалов и тени.
Параметры считаются по самому рендеру, поэтому все размеры получают один и тот же сдвиг.
"""
import sys, os
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..', '..', 'assets', 'academy')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC = args[0] if args else '/tmp/aud_graded.png'
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else ROOT
if '--out' in sys.argv and OUT in args: args.remove(OUT); SRC = args[0] if args else '/tmp/aud_graded.png'

T = dict(L_mean=float(os.environ.get('G_L', 67.5)), L_contrast=float(os.environ.get('G_LC', 1.09)), clarity=float(os.environ.get('G_CLARITY', .32)),
         a_mean=float(os.environ.get('G_A', 1.6)), b_mean=float(os.environ.get('G_B', 13.2)), chroma_max=float(os.environ.get('G_CMAX', 30)))


def lab_of(rgb8):
    return cv2.cvtColor(rgb8.astype(np.float32) / 255, cv2.COLOR_RGB2LAB)


def stats(lab):
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    return 'L %.1f±%.1f  a %.1f  b %.1f  chroma %.1f  hue %.1f°' % (L.mean(), L.std(), A.mean(), B.mean(), np.hypot(A, B).mean(), np.degrees(np.arctan2(B.mean(), A.mean())))


def regrade(img8, ref):
    """ref — Lab-статистика исходного кадра (чтобы все размеры сдвигались одинаково)"""
    lab = lab_of(img8); L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    w = np.clip(1 + B / 14.0, 0, 1)                         # 1 — нейтральные/тёплые, 0 — насыщенно-синие
    w = cv2.GaussianBlur(w, (0, 0), 1.2)                    # без «ореолов» на кромках кресел и букв
    A2 = A + (T['a_mean'] - ref['a']) * w
    B2 = B + (T['b_mean'] - ref['b']) * w
    L2 = (L - ref['L']) * T['L_contrast'] + T['L_mean']
    # на самых светлых местах (экран, блики) не сдвигаем L вверх — иначе пересвет
    L2 = np.where(L > 94, np.minimum(L, 99), np.clip(L2, 0, 98.5))
    if T['clarity']:                                         # «живая» структура: мягкий локальный контраст (CLAHE по яркости) — штукатурка, ткань, камень читаются, тени глубже
        h_, w_ = L2.shape; L16 = np.clip(L2 / 100 * 65535, 0, 65535).astype(np.uint16)
        cl = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(max(4, w_ // 360), max(3, h_ // 360))).apply(L16).astype(np.float32) / 65535 * 100
        L2 = L2 * (1 - T['clarity']) + cl * T['clarity']
    C = np.hypot(A2, B2); k = np.where(C > T['chroma_max'], T['chroma_max'] / np.maximum(C, 1e-3), 1.0)
    out = cv2.cvtColor(np.stack([L2, A2 * k, B2 * k], -1).astype(np.float32), cv2.COLOR_LAB2RGB)
    return (np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)


def main():
    src = np.asarray(Image.open(SRC).convert('RGB'))
    lab = lab_of(src); ref = dict(L=lab[..., 0].mean(), a=lab[..., 1].mean(), b=lab[..., 2].mean())
    print('до :', stats(lab))
    full = regrade(src, ref)
    print('после:', stats(lab_of(full)))
    H, W = full.shape[:2]
    os.makedirs(OUT, exist_ok=True)
    big = Image.fromarray(full); tw = 2880
    if W != tw: big = big.resize((tw, round(tw * H / W)), Image.LANCZOS)
    big.save(os.path.join(OUT, 'hall.webp'), 'WEBP', quality=88, method=6)
    sm = big.resize((1500, round(1500 * big.height / big.width)), Image.LANCZOS); sm.save(os.path.join(OUT, 'hall-s.webp'), 'WEBP', quality=88, method=6)
    # телефон: кроп 1,28:1 вокруг экрана и первых рядов (весь кадр по высоте, центр по ширине)
    cw = round(big.height * 1.28); x0 = (big.width - cw) // 2
    mob = big.crop((x0, 0, x0 + cw, big.height)); mob = mob.resize((1200, round(1200 * mob.height / mob.width)), Image.LANCZOS)
    mob.save(os.path.join(OUT, 'hall-m.webp'), 'WEBP', quality=86, method=6)
    for n in ('hall.webp', 'hall-s.webp', 'hall-m.webp'):
        p = os.path.join(OUT, n); print('%-12s %s  %d КБ' % (n, Image.open(p).size, os.path.getsize(p) // 1024))


if __name__ == '__main__':
    main()
