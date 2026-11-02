#!/usr/bin/env python3
"""Склейка кадров пролёта камеры с баночкой-спрайтом (hall_table.py flight с ZONE_FLIGHT_SPRITE=1).

Кадр пролёта (outdir/NNN.png) нарисован без баночки (она невидима камере, но тень и отражение в полу остались), рядом в outdir/jar/ лежат спрайты баночки (RGBA, слой «jar»: те же
лампы, экспозиция и этикетка, что у спрайтов в зале на сайте) и рамки в долях кадра. Здесь спрайт накладывается на кадр: баночка в пролёте выглядит так же, как в зале, и не тускнеет.

    python3 composite_flight.py /tmp/zone/fl_d [--out /tmp/zone/fl_d_c]       (без --out кадры перезаписываются)
"""
import json
import os
import sys

from PIL import Image


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(1)
    src = a[0]
    out = a[a.index('--out') + 1] if '--out' in a else src
    os.makedirs(out, exist_ok=True)
    meta = json.load(open(os.path.join(src, 'flight.json')))
    n = meta['n']
    for i in range(0, n + 1):                                                                # 0 — вид зала в конце сцены героя (если он считался): постер
        bp = os.path.join(src, '%03d.png' % i); jp = os.path.join(src, 'jar', '%03d.png' % i); jj = jp.replace('.png', '.json')
        if not os.path.exists(bp):
            continue
        bg = Image.open(bp).convert('RGBA')
        if os.path.exists(jp) and os.path.exists(jj):
            r = json.load(open(jj))['rect']; W, H = bg.size
            x0, y0 = int(round(r[0] * W)), int(round(r[1] * H)); w, h = max(1, int(round(r[2] * W))), max(1, int(round(r[3] * H)))
            sp = Image.open(jp).convert('RGBA').resize((w, h), Image.LANCZOS)
            bg.alpha_composite(sp, (x0, y0))
        bg.convert('RGB').save(os.path.join(out, '%03d.png' % i), compress_level=3)
        print('кадр', i, flush=True)
    if out != src:
        import shutil
        shutil.copyfile(os.path.join(src, 'flight.json'), os.path.join(out, 'flight.json'))


if __name__ == '__main__':
    main()
