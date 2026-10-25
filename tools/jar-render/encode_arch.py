#!/usr/bin/env python3
"""Кодирует кадры архитектурной сцены (arch_story.py) для сайта: полный набор + лёгкий набор с «запечёнными» промежуточными кадрами.

    python3 encode_arch.py <папка PNG> <вывод: …/assets/jar-arch/d> [--lite <вывод лёгкого набора: …/dm>] [--size 1600x900] [--lite-size 1120x630]
                           [--q 82] [--lite-q 74] [--end 0.92] [--grain 1.0] [--sharpen 0.5] [--knee 0.36:0.22]

• полный набор: кадры 000.webp … как отрендерены (N штук); положения p[k] = end · k/(N−1) — после `end` сцена «держит» последний кадр (хвост прокрутки — спокойный финал);
• лёгкий набор: между каждой парой соседних кадров — промежуточный (оба кадра сдвигаются к середине по оптическому потоку DIS и смешиваются), всего 2N−1;
  браузер в движении показывает его: вдвое больше кадров на тот же путь прокрутки, а каждый кадр дешевле;
• лёгкое зерно (--grain, в уровнях 8 бит) при записи: плавные световые градиенты (свечение LED, стены) без него «полосатят» после сжатия;
• p.json рядом с наборами: {"p": [...N положений...], "pb": [...2N−1 положений...]} — их кладут в data/redesign.json → jar.arch.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image


def load(path):
    return cv2.cvtColor(cv2.imread(path, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


RNG = np.random.default_rng(5)
GRAIN = [1.0]
SHARP = [0.0]


def save(arr, path, q):
    a = np.asarray(arr, dtype=np.float32)
    if GRAIN[0] > 0:
        a = a + RNG.normal(0, GRAIN[0], a.shape[:2])[..., None].astype(np.float32)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(path, 'WEBP', quality=q, method=6)


def fit(img, size):
    out = img if (img.shape[1], img.shape[0]) == size else cv2.resize(img, size, interpolation=cv2.INTER_AREA)
    if SHARP[0] > 0:                                                        # шумоподавитель смягчает камень — возвращаем резкость мелких деталей (поры, кромки), крупные плоскости не трогаем
        blur = cv2.GaussianBlur(out, (0, 0), 1.1)
        out = np.clip(out.astype(np.float32) * (1 + SHARP[0]) - blur.astype(np.float32) * SHARP[0], 0, 255).astype(np.uint8)
    return out


def main():
    a = sys.argv[1:]
    src, out = a[0], a[1]
    o = dict(lite=None, size=(1600, 900), lsize=(1120, 630), q=82, lq=74, end=0.92, grain=1.0, sharp=0.5, knee=None)
    i = 2
    while i < len(a) - 1:
        k, v = a[i], a[i + 1]
        if k == '--lite':
            o['lite'] = v
        elif k == '--size':
            o['size'] = tuple(int(x) for x in v.lower().split('x'))
        elif k == '--lite-size':
            o['lsize'] = tuple(int(x) for x in v.lower().split('x'))
        elif k == '--q':
            o['q'] = int(v)
        elif k == '--lite-q':
            o['lq'] = int(v)
        elif k == '--end':
            o['end'] = float(v)
        elif k == '--grain':
            o['grain'] = float(v)
        elif k == '--sharpen':
            o['sharp'] = float(v)
        elif k == '--knee':                                                  # «кадры:путь» — сколько пути прокрутки отдать начальной части кадров (0.36:0.22 — первые 36 % кадров за первые 22 % пути)
            o['knee'] = tuple(float(x) for x in v.split(':'))
        i += 2
    GRAIN[0] = o['grain']
    SHARP[0] = o['sharp']
    files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
    n = len(files)
    os.makedirs(out, exist_ok=True)
    if o['lite']:
        os.makedirs(o['lite'], exist_ok=True)
    def g(f):
        if not o['knee']: return f
        kf, kp = o['knee']
        return f / kf * kp if f <= kf else kp + (f - kf) / (1 - kf) * (1 - kp)
    p = [round(o['end'] * g(k / (n - 1)), 5) for k in range(n)]
    pb = []
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    prev = load(os.path.join(src, files[0]))
    w, h = o['lsize']
    for k in range(n):
        cur = prev if k == 0 else load(os.path.join(src, files[k]))
        save(fit(cur, o['size']), os.path.join(out, '%03d.webp' % k), o['q'])
        if o['lite']:
            if k == 0:
                save(fit(cur, o['lsize']), os.path.join(o['lite'], '000.webp'), o['lq'])
                pb.append(p[0])
            else:
                # поток на половинном разрешении (достаточно для плавного сдвига), затем увеличиваем до размера лёгкого набора
                g0 = cv2.cvtColor(fit(prev, (w // 2, h // 2)), cv2.COLOR_RGB2GRAY)
                g1 = cv2.cvtColor(fit(cur, (w // 2, h // 2)), cv2.COLOR_RGB2GRAY)
                fab = cv2.resize(dis.calc(g0, g1, None), (w, h), interpolation=cv2.INTER_LINEAR) * 2.0
                fba = cv2.resize(dis.calc(g1, g0, None), (w, h), interpolation=cv2.INTER_LINEAR) * 2.0
                A = fit(prev, o['lsize']).astype(np.float32)
                B = fit(cur, o['lsize']).astype(np.float32)
                gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
                Aw = cv2.remap(A, gx + fba[..., 0] * .5, gy + fba[..., 1] * .5, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
                Bw = cv2.remap(B, gx + fab[..., 0] * .5, gy + fab[..., 1] * .5, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
                save(.5 * Aw + .5 * Bw, os.path.join(o['lite'], '%03d.webp' % (2 * k - 1)), o['lq'])
                save(B, os.path.join(o['lite'], '%03d.webp' % (2 * k)), o['lq'])
                pb += [round(p[k - 1] + .5 * (p[k] - p[k - 1]), 5), p[k]]
        prev = cur
        if k % 10 == 0:
            print('кадр', k, '/', n - 1, flush=True)
    json.dump({'p': p, 'pb': pb}, open(os.path.join(os.path.dirname(os.path.abspath(out)), 'p-%s.json' % os.path.basename(os.path.abspath(out))), 'w'))
    for d in [out] + ([o['lite']] if o['lite'] else []):
        sz = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
        print(d, len(os.listdir(d)), 'кадров,', sz // 1024, 'КБ')


if __name__ == '__main__':
    main()
