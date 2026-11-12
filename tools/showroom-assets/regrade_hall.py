#!/usr/bin/env python3
"""Подгонка цветокоррекции зала «Обучения» (assets/academy/hall*.webp) под рендеры каталога, брендов и главной.

Зачем: измерение в Lab показало, что зал заметно «золотистее» остальных страниц — насыщенность (chroma) ≈ 20 против 12–15 у стены брендов,
слоёв каталога и зала главной, оттенок смещён к оранжевому (hue ≈ 80° против 83–89°), тени светлее. Скрипт делает частичный перенос цвета
(как перенос статистики Рейнхарда, но не до полного совпадения, чтобы сохранить свой характер сцены: янтарь флаконов, зелень):
  a: среднее → 1,3  (было ≈ 3,5), разброс × 0,95
  b: среднее → 14,8 (было ≈ 19,6), разброс × 0,78
  L: контраст × 1,08 вокруг среднего 68,6 (тени глубже, как на стене брендов; среднее почти не меняется)
Параметры считаются один раз по hall.webp и применяются ко всем размерам (hall, hall-s, hall-m), поэтому они согласованы.

Запуск:  python3 tools/showroom-assets/regrade_hall.py            (перезаписывает файлы; оригиналы — в git)
         python3 tools/showroom-assets/regrade_hall.py --stats     (только измерить)
         python3 tools/showroom-assets/regrade_hall.py --out /tmp/x (сохранить копии отдельно, не трогая сайт)
Зависимости: opencv-python, numpy, Pillow.
"""
import sys, os
import numpy as np, cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'academy')
FILES = ['hall.webp', 'hall-s.webp', 'hall-m.webp']
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else ROOT        # --out DIR — сохранить копии в другую папку (предпросмотр)
TARGET = dict(a_mean=1.3, a_std=.95, b_mean=14.8, b_std=.78, L_mean=68.6, L_contrast=1.08)


def to_lab(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)


def stats(lab):
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(A, B)
    return dict(L=L.mean(), Ls=L.std(), a=A.mean(), as_=A.std(), b=B.mean(), bs=B.std(), C=C.mean(), hue=np.degrees(np.arctan2(B.mean(), A.mean())))


def fmt(s):
    return 'L %.1f±%.1f  a %.1f±%.1f  b %.1f±%.1f  chroma %.1f  hue %.1f°' % (s['L'], s['Ls'], s['a'], s['as_'], s['b'], s['bs'], s['C'], s['hue'])


def main():
    ref = to_lab(os.path.join(ROOT, 'hall.webp'))
    s0 = stats(ref)
    print('до :', fmt(s0))
    if s0['C'] < 17.5 and '--force' not in sys.argv:       # скрипт не идемпотентен: повторный запуск по уже подогнанным файлам сдвинул бы цвет второй раз
        print('hall.webp уже подогнан (chroma < 17,5) — ничего не делаю; оригинал: git checkout assets/academy/hall*.webp, либо --force')
        return
    if '--stats' in sys.argv:
        return
    T = TARGET
    for name in FILES:
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            continue
        im = Image.open(p); size = im.size; im = im.convert('RGB')
        lab = cv2.cvtColor(np.asarray(im).astype(np.float32) / 255, cv2.COLOR_RGB2LAB)
        L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
        # параметры — по главному файлу, чтобы все размеры получили один и тот же сдвиг
        A2 = (A - s0['a']) * T['a_std'] + T['a_mean']
        B2 = (B - s0['b']) * T['b_std'] + T['b_mean']
        L2 = (L - s0['L']) * T['L_contrast'] + T['L_mean'] + (s0['L'] - T['L_mean']) * 0       # среднее L переносим к цели
        out = cv2.cvtColor(np.stack([np.clip(L2, 0, 100), np.clip(A2, -127, 127), np.clip(B2, -127, 127)], axis=-1).astype(np.float32), cv2.COLOR_LAB2RGB)
        img = Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8))
        assert img.size == size
        before = os.path.getsize(p); q = os.path.join(OUT, name); os.makedirs(OUT, exist_ok=True)
        img.save(q, 'WEBP', quality=90, method=6)
        print('%-12s %dx%d  %d → %d КБ' % (name, size[0], size[1], before // 1024, os.path.getsize(q) // 1024))
    print('после:', fmt(stats(to_lab(os.path.join(OUT, 'hall.webp')))))


if __name__ == '__main__':
    main()
