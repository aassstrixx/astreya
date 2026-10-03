"""PNG-кадры рендера → WebP-последовательность для сайта (assets/jar/*).

    python3 encode_web.py <папка_кадров> <папка_вывода> [--size 1920x1080] [--q 90] [--grain 0.7] [--fill 130]

План кадров (неравномерная сетка, plan_frames.py):
    python3 encode_web.py --plan plan.json <старые_кадры> <новые_кадры> <папка_вывода> [--size …] [--q …] [--grain …]
собирает последовательность по порядку плана: старые f00000.png и новые n00000.png → 000.webp … (по номеру кадра плана).

Кадры f00000.png … → 000.webp …  --grain — лёгкое зерно (σ в уровнях яркости): тёмные градиенты фона иначе дают бандинг
после сжатия. --fill N — для отладки: недостающие кадры до N копируются с ближайшего готового (в репозиторий такое не кладут).
"""
import glob
import os
import shutil
import sys

import numpy as np
from PIL import Image


def encode_plan(a):
    import json
    plan = json.load(open(a[0]))["frames"]
    old_dir, new_dir, dst = a[1], a[2], a[3]
    opt = {"--size": "1920x1080", "--q": "90", "--grain": "0.7"}
    for i in range(4, len(a) - 1, 2):
        opt[a[i]] = a[i + 1]
    w, h = [int(x) for x in opt["--size"].lower().split("x")]
    q, grain = int(opt["--q"]), float(opt["--grain"])
    os.makedirs(dst, exist_ok=True)
    rng = np.random.default_rng(11)
    total = 0
    for e in plan:
        f = os.path.join(old_dir, f"f{e['old']:05d}.png") if e["old"] is not None else os.path.join(new_dir, f"n{e['k']:05d}.png")
        out = os.path.join(dst, f"{e['k']:03d}.webp")
        im = Image.open(f).convert("RGB")
        if im.size != (w, h):
            im = im.resize((w, h), Image.LANCZOS)
        if grain > 0:
            arr = np.asarray(im).astype(np.float32) + rng.normal(0, grain, (h, w, 1)).astype(np.float32)
            im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        im.save(out, "WEBP", quality=q, method=6)
        total += os.path.getsize(out)
    print(f"{len(plan)} кадров плана → {dst}: {total / 1024:.0f} КБ ({total / len(plan) / 1024:.1f} КБ/кадр)")


def main():
    a = sys.argv[1:]
    if a and a[0] == "--plan":
        return encode_plan(a[1:])
    src, dst = a[0], a[1]
    opt = {"--size": "1920x1080", "--q": "90", "--grain": "0.7", "--fill": "0"}
    for i in range(2, len(a) - 1, 2):
        opt[a[i]] = a[i + 1]
    w, h = [int(x) for x in opt["--size"].lower().split("x")]
    q, grain, fill = int(opt["--q"]), float(opt["--grain"]), int(opt["--fill"])
    os.makedirs(dst, exist_ok=True)
    rng = np.random.default_rng(11)
    files = sorted(glob.glob(os.path.join(src, "f*.png")))
    total = 0
    for f in files:
        n = int(os.path.basename(f)[1:6])
        out = os.path.join(dst, f"{n:03d}.webp")
        im = Image.open(f).convert("RGB")
        if im.size != (w, h):
            im = im.resize((w, h), Image.LANCZOS)
        if grain > 0:
            arr = np.asarray(im).astype(np.float32) + rng.normal(0, grain, (h, w, 1)).astype(np.float32)   # одинаковое зерно по каналам — без цветного шума
            im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        im.save(out, "WEBP", quality=q, method=6)
        total += os.path.getsize(out)
    have = sorted(int(os.path.basename(p)[:3]) for p in glob.glob(os.path.join(dst, "[0-9][0-9][0-9].webp")))
    if fill and have:
        for n in range(fill):
            p = os.path.join(dst, f"{n:03d}.webp")
            if not os.path.exists(p):
                shutil.copyfile(os.path.join(dst, f"{min(have, key=lambda k: abs(k - n)):03d}.webp"), p)
    print(f"{len(files)} кадров → {dst}: {total / 1024:.0f} КБ ({total / max(1, len(files)) / 1024:.1f} КБ/кадр)")


if __name__ == "__main__":
    main()
