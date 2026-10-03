"""Оптический поток между соседними кадрами вступления — основа для «запекания» промежуточных кадров (bake_mid.py).

    pip install opencv-python-headless pillow numpy
    python3 make_flow.py <plan.json> <папка_старых_кадров> <папка_новых_кадров> <папка_вывода> [--reduce 8] [--range 96] [--blur 1.0] [--lite-out <папка> --lite-reduce 16] [--cache <папка>]

Для пары кадров k → k+1 считается поток DIS (в обе стороны), сглаживается (уменьшение в --reduce раз), квантуется в 8 бит
(0…255, 128 = нет сдвига, ±127 = ±range пикселей исходного кадра) и сохраняется одним RGB-файлом без потерь:
левая половина — поток вперёд (k → k+1), правая — назад (k+1 → k); R = сдвиг по x, G = по y(B не используется).
Прежде карты отдавались браузеру (WebGL-шейдер дорисовывал движение), но на практике это нагружало основной поток и давало лаги — см. tools/jar-bench; теперь
нужен в основном кэш (--cache), по которому bake_mid.py строит промежуточные кадры заранее.
--cache — папка, где хранится «сырой» поток (float16, в 4 раза меньше кадра): повторный запуск с другими --reduce/--blur не пересчитывает DIS.
Одни и те же файлы годятся для полных кадров и для облегчённых (-lite): сдвиг выражен в пикселях ПОЛНОГО кадра.
"""
import json
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image


def load(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return cv2.cvtColor(im[:, :, :3], cv2.COLOR_BGR2RGB)


def flow(a, b):
    d = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    d.setFinestScale(0)
    d.setPatchSize(12)
    d.setPatchStride(4)
    d.setGradientDescentIterations(25)
    d.setVariationalRefinementIterations(8)
    return d.calc(cv2.cvtColor(a, cv2.COLOR_RGB2GRAY), cv2.cvtColor(b, cv2.COLOR_RGB2GRAY), None)


def pack(fl, red, rng, blur=0.0):
    h, w = fl.shape[:2]
    fl = cv2.resize(fl, (w // red, h // red), interpolation=cv2.INTER_AREA)
    if blur > 0:
        fl = cv2.GaussianBlur(fl, (0, 0), blur)       # шумный поток на гладких участках плохо сжимается и ничего не даёт
    return np.clip(np.round(fl / rng * 127), -127, 127).astype(np.int16) + 128


def main():
    a = sys.argv[1:]
    plan = json.load(open(a[0]))["frames"]
    old_dir, new_dir, out = a[1], a[2], a[3]
    red, rng, lite_out, lite_red, blur, cache = 8, 96.0, None, 16, 1.0, None
    for i in range(4, len(a) - 1, 2):
        if a[i] == "--reduce":
            red = int(a[i + 1])
        elif a[i] == "--range":
            rng = float(a[i + 1])
        elif a[i] == "--blur":
            blur = float(a[i + 1])
        elif a[i] == "--cache":
            cache = a[i + 1]
        elif a[i] == "--lite-out":
            lite_out = a[i + 1]
        elif a[i] == "--lite-reduce":
            lite_red = int(a[i + 1])
    os.makedirs(out, exist_ok=True)
    if lite_out:
        os.makedirs(lite_out, exist_ok=True)
    if cache:
        os.makedirs(cache, exist_ok=True)
    src = [os.path.join(old_dir, f"f{e['old']:05d}.png") if e["old"] is not None else os.path.join(new_dir, f"n{e['k']:05d}.png") for e in plan]
    total, t0, mx = 0, time.time(), 0.0
    prev = load(src[0])
    for k in range(len(src) - 1):
        nxt = load(src[k + 1])
        cp_ = os.path.join(cache, f"{k:03d}.npy") if cache else None
        if cp_ and os.path.exists(cp_):
            c4 = np.load(cp_).astype(np.float32)
            f_ab, f_ba = c4[0], c4[1]                       # уже уменьшено в 4 раза (значения — в px полного кадра)
        else:
            f_ab, f_ba = flow(prev, nxt), flow(nxt, prev)
            if cp_:
                h0, w0 = f_ab.shape[:2]
                np.save(cp_, np.stack([cv2.resize(f_ab, (w0 // 4, h0 // 4), interpolation=cv2.INTER_AREA), cv2.resize(f_ba, (w0 // 4, h0 // 4), interpolation=cv2.INTER_AREA)]).astype(np.float16))
        mx = max(mx, float(np.abs(f_ab).max()), float(np.abs(f_ba).max()))
        for r_, o_ in ((red, out), (lite_red, lite_out)):
            if not o_:
                continue
            r2 = r_ if f_ab.shape[0] > 400 else max(1, r_ // 4)           # из кэша поток уже уменьшен в 4 раза
            pa, pb = pack(f_ab, r2, rng, blur), pack(f_ba, r2, rng, blur)
            h, w = pa.shape[:2]
            img = np.full((h, w * 2, 3), 128, np.uint8)
            img[:, :w, 0], img[:, :w, 1] = pa[..., 0], pa[..., 1]
            img[:, w:, 0], img[:, w:, 1] = pb[..., 0], pb[..., 1]
            p = os.path.join(o_, f"{k:03d}.webp")
            Image.fromarray(img).save(p, "WEBP", lossless=True, method=6)
            if o_ == out:
                total += os.path.getsize(p)
        prev = nxt
        if k % 20 == 0:
            print(f"пара {k}/{len(src) - 1}  {time.time() - t0:.0f} с", flush=True)
    print(f"{len(src) - 1} карт потока → {out}: {total / 1024:.0f} КБ ({total / max(1, len(src) - 1) / 1024:.1f} КБ/пара); максимальный сдвиг {mx:.1f} px (range {rng:g})")


if __name__ == "__main__":
    main()
