#!/usr/bin/env python3
"""«Консьерж-салон» для страницы «Старт со Стеллой» (assets/utility/salon-wide.webp): круглая каменная стойка с образцами слева, две арочные ниши со стеллажами за ней,
рифлёные пилястры, широкая стена — справа свободно (там лежит «лист» диалога), на самом правом краю — вторая ниша и олива. Те же материалы, свет и масштаб, что у комнат главной
(tools/jar-render/house_rooms.py — комната finder), но кадр шире и сдвинут: стойка стоит на ≈ 26 % ширины кадра.

  python3 tools/showroom-assets/utility/salon.py out.png [--res 2880x1620] [--samples 48] [--threads 2]
Цвет после рендера подгоняется под общий цвет сайта: tools/showroom-assets/regrade_site.py out.png --a 0.9 --b 11.2 (см. docs/PAGE-UTILITY.md)."""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'jar-render'))
sys.path.insert(0, os.path.join(HERE, '..'))
import house_rooms as R
from house_rooms import H, M, SC, bpy, pack, olive, pouf, reeds, frames, shell, cam


def salon():
    D = 2.7; dx = -1.55                      # сдвиг композиции комнаты finder влево: стойка на x = dx
    arches = [dict(cx=cx, rx=.46, zs=.75, depth=.34) for cx in (dx - 1.0, dx + 1.0, 2.35)]
    shell(8.4, D, wall_h=3.8, arches=arches)
    frames(arches, D); reeds(dx - .35, 5, D); reeds(dx - 2.05, 3, D); reeds(dx + 1.83, 3, D); reeds(.95, 2, D); reeds(3.25, 3, D)
    for cx in (dx - 1.0, dx + 1.0, 2.35):
        H.ROOM_X = cx; H.SHELF = dict(w=.64, d=.28, boards=(.10, .42, .74, 1.06), t=.03, post=.03)
        H.build_shelf(M, D + .3)
    ob = SC.cylinder('table', M['trav'], dx, 1.05, .70, 0, .34, 'p', seg=96, bev=.012); ob.scale.y = .62
    SC.cylinder('tbl_top', M['trav2'], dx, 1.05, .72, .34, .365, 'p', seg=96, bev=.008).scale.y = .62
    for k, noir, ox, oy, rot in (('bottle', False, -.40, .08, 10), ('dropper', True, -.18, -.12, -8), ('jar', False, .02, .06, 25), ('pump', True, .24, -.08, 0), ('tube', False, .42, .10, 14), ('box', False, -.05, -.22, 6)):
        pack(k, noir, dx + ox, 1.05 + oy, .365, rot, 1.4)
    pouf('pf1', dx - 1.35, .55, .15, .15); pouf('pf2', dx + 1.45, .62, .14, .13)
    olive(1.0, 1.5, .55, 26, 1.0, 14, .2, .30)
    cam((dx + .85, -1.9, .80), (dx + .85, D, .52), 30)
    bpy.context.scene.camera.data.shift_y = float(os.environ.get('SALON_SHIFT', .12))          # кадр поднят: сверху — пустая стена под заголовок, ниши и стойка — в нижней половине


def main():
    a = sys.argv[1:]
    out = os.path.abspath(a[0]); res = (2880, 1620); samples = 48
    if '--res' in a: w, h = a[a.index('--res') + 1].lower().split('x'); res = (int(w), int(h))
    if '--samples' in a: samples = int(a[a.index('--samples') + 1])
    sc = R.fresh(res, samples)
    if '--threads' in a:
        sc.render.threads_mode = 'FIXED'; sc.render.threads = int(a[a.index('--threads') + 1])
    R.lights(center=(dx_center(), 1.2, .5))
    salon()
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('салон', out)


def dx_center():
    return -1.0


if __name__ == '__main__':
    main()
