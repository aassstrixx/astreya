"""Промежуточные кадры «запечённые» заранее: между каждой парой соседних кадров (k, k+1) строится кадр на середине по карте оптического потока
(оба кадра сдвигаются к середине по потоку и смешиваются; офлайн, в полном разрешении). Получается последовательность вдвое плотнее —
браузеру остаётся просто показывать готовые картинки (никакой работы на видеокарте и в основном потоке).

    python3 bake_mid.py <plan.json> <папка_старых_кадров> <папка_новых_кадров> <кэш_потока> <вывод> [--size 1920x1080] [--q 80] [--grain 0.7] [--t 0.5] [--also WxH:q:папка ...]

--also — дополнительные наборы из тех же кадров (например, --also 480x270:62:../../assets/jar/dx — «совсем лёгкий» уровень):
складывать запечённое сразу в несколько разрешений, не пересчитывая сдвиг заново.

Вывод: 000.webp … — кадры 2k (реальные) и 2k+1 (запечённые), всего 2N-1. Положения: p[2k] = p[k], p[2k+1] = p[k] + t·(p[k+1]-p[k]).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image


def load(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return cv2.cvtColor(im[:, :, :3], cv2.COLOR_BGR2RGB)


def main():
    a = sys.argv[1:]
    plan = json.load(open(a[0]))["frames"]
    old_dir, new_dir, cache, out = a[1:5]
    size, q, grain, tt, extras = (1920, 1080), 80, 0.7, 0.5, []
    i = 5
    while i < len(a) - 1:
        if a[i] == "--size":
            size = tuple(int(x) for x in a[i + 1].split("x"))
        elif a[i] == "--q":
            q = int(a[i + 1])
        elif a[i] == "--grain":
            grain = float(a[i + 1])
        elif a[i] == "--t":
            tt = float(a[i + 1])
        elif a[i] == "--also":
            sz, qq, dd = a[i + 1].split(":", 2)
            extras.append((tuple(int(x) for x in sz.split("x")), int(qq), dd))
        i += 2
    outs = [(size, q, out)] + extras
    for _, _, d in outs:
        os.makedirs(d, exist_ok=True)
    src = [os.path.join(old_dir, f"f{e['old']:05d}.png") if e["old"] is not None else os.path.join(new_dir, f"n{e['k']:05d}.png") for e in plan]
    rng = np.random.default_rng(5)

    def save(img, name, extra_grain=0.0):
        for (w, h), qq, d in outs:
            im = img if img.shape[1] == w else cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
            arr = im.astype(np.float32)
            g = grain if extra_grain == 0 else extra_grain
            if g > 0:
                arr = arr + rng.normal(0, g, (h, w, 1)).astype(np.float32)
            Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(d, name), "WEBP", quality=qq, method=6)

    prev = load(src[0])
    save(prev, "000.webp")
    gx = gy = None
    for k in range(len(src) - 1):
        nxt = load(src[k + 1])
        c = np.load(os.path.join(cache, f"{k:03d}.npy")).astype(np.float32)      # (2, H/4, W/4, 2): вперёд, назад (px полного кадра)
        H0, W0 = prev.shape[:2]
        if gx is None:
            gx, gy = np.meshgrid(np.arange(W0, dtype=np.float32), np.arange(H0, dtype=np.float32))
        fab = cv2.resize(c[0], (W0, H0), interpolation=cv2.INTER_LINEAR)
        fba = cv2.resize(c[1], (W0, H0), interpolation=cv2.INTER_LINEAR)
        A = cv2.remap(prev, gx + fba[..., 0] * tt, gy + fba[..., 1] * tt, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        B = cv2.remap(nxt, gx + fab[..., 0] * (1 - tt), gy + fab[..., 1] * (1 - tt), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        mid = np.clip(A.astype(np.float32) * (1 - tt) + B.astype(np.float32) * tt, 0, 255)
        save(mid, f"{2 * k + 1:03d}.webp", extra_grain=grain * 0.8)       # усреднение гасит зерно — подшумливаем, чтобы не мерцало
        save(nxt, f"{2 * k + 2:03d}.webp")
        prev = nxt
        if k % 20 == 0:
            print(f"пара {k}/{len(src) - 1}", flush=True)
    ps = []
    for k, e in enumerate(plan):
        ps.append(e["p"])
        if k < len(plan) - 1:
            ps.append(e["p"] + tt * (plan[k + 1]["p"] - e["p"]))
    json.dump({"p": ps}, open(os.path.join(out, "p.json"), "w"))
    print(f"готово: {len(ps)} кадров → {out}")


if __name__ == "__main__":
    main()
