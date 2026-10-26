#!/usr/bin/env python3
"""Кодирует спрайты баночки (hall_story.py anim --layer jar: PNG с прозрачным фоном) для сайта: WebP с альфой.

    python3 encode_jar.py <папка PNG> <вывод: …/assets/jar-arch/j> [--q 90] [--scale 1.0]

• файлы 000.webp … по числу кадров сценария; рамка каждого спрайта в кадре лежит в data/redesign.json (jar.arch.jar.*.rects, их пишет apply_arch.py из hall_story.py track);
• цвет в полностью прозрачных пикселях обнуляется (иначе кромка «светится» при масштабировании), альфа кодируется без потерь (alpha_quality=100) — край баночки остаётся чистым;
• --scale < 1 уменьшает спрайт (для лёгкого набора телефона): рамка не меняется, меняется только число пикселей."""
import os
import sys

import numpy as np
from PIL import Image


def main():
    a = sys.argv[1:]
    src, out = a[0], a[1]
    q, sc = 90, 1.0
    i = 2
    while i < len(a) - 1:
        if a[i] == '--q':
            q = int(a[i + 1])
        elif a[i] == '--scale':
            sc = float(a[i + 1])
        i += 2
    os.makedirs(out, exist_ok=True)
    names = sorted(f for f in os.listdir(src) if f.endswith('.png'))
    total = 0
    for f in names:
        im = Image.open(os.path.join(src, f)).convert('RGBA')
        if sc != 1.0:
            im = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.LANCZOS)
        arr = np.array(im)
        arr[arr[:, :, 3] == 0, :3] = 0
        dst = os.path.join(out, f.replace('.png', '.webp'))
        Image.fromarray(arr, 'RGBA').save(dst, 'WEBP', quality=q, alpha_quality=100, method=6)
        total += os.path.getsize(dst)
    print('спрайтов: %d, всего %.2f МБ, средний %.0f КБ' % (len(names), total / 1048576, total / max(1, len(names)) / 1024))


if __name__ == '__main__':
    main()
