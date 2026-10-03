"""Скорость самой быстрой точки баночки на экране вдоль сюжета (px на шаг) — чтобы решить, где нужно больше кадров (plan_frames.py).

    python3 motion_analysis.py            # горизонтальный кадр 1920x1080 → motion_d.json
    python3 motion_analysis.py portrait   # вертикальный 810x1440 → motion_m.json
Следит за точками этикетки (на видимой стороне), крышки и поверхности крема. Кадры не рендерит — считает только положение объектов.
"""
import math, os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, bpy
import lumiere_scene as L
import story_render as SR
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

W, H = 1920, 1080
L.HERE = HERE
L.camera_keys = lambda lean: SR.story_keys(lean)
sc = L.build_scene((W, H), 1)
SR.recolor()
lean = L.solve_lean_pose()
cam = L.S['cam']
SR.PORTRAIT = (len(sys.argv) > 1 and sys.argv[1] == 'portrait')
if SR.PORTRAIT:
    W, H = 810, 1440
    sc.render.resolution_x, sc.render.resolution_y = W, H
    L.camera_keys = lambda lean: SR.story_keys(lean)

glass, lid, cream = L.S['glass'], L.S['lid'], L.S['cream']
R = L.R_BODY
lab = [Vector((R * math.cos(a), R * math.sin(a), z)) for a in np.linspace(0, 2 * math.pi, 48, endpoint=False) for z in (1.3, 2.2, 2.9)]
lidpts = [Vector(v) for v in L.lid_local_points()[::7]]
crm = [Vector((r * math.cos(a), r * math.sin(a), L.Z_CREAM + 0.6)) for r in (0.4, 1.0, 1.8, 2.6) for a in np.linspace(0, 2 * math.pi, 12, endpoint=False)]

def state(p):
    t = SR.story_time(p)
    L.apply_state(t * L.FPS, lean)
    bpy.context.view_layer.update()

def project(co):
    v = world_to_camera_view(sc, cam, co)
    return np.array([v.x * W, (1 - v.y) * H]), v.z

def pts(p):
    state(p)
    out = {}
    mg, ml, mc = glass.matrix_world, lid.matrix_world, cream.matrix_world
    camp = cam.matrix_world.translation
    A = []
    for c in lab:
        w = mg @ c
        n = (mg.to_3x3() @ Vector((c.x, c.y, 0))).normalized()
        if n.dot((camp - w).normalized()) > 0.2:
            xy, z = project(w); A.append(xy)
        else:
            A.append(None)
    B = [project(ml @ c)[0] for c in lidpts]
    C = [project(mc @ c)[0] for c in crm]
    return A, B, C

N = 2400
P = np.linspace(0, 1, N + 1)
prev = None
speed = np.zeros((N + 1, 3))
for i, p in enumerate(P):
    cur = pts(p)
    if prev is not None:
        for k in range(3):
            m = 0.0
            for a, b in zip(prev[k], cur[k]):
                if a is None or b is None: continue
                if not (-0.1 * W < b[0] < 1.1 * W and -0.1 * H < b[1] < 1.1 * H): continue
                m = max(m, float(np.hypot(*(b - a))))
            speed[i, k] = m
    prev = cur
dp = 1.0 / N
sp = speed.max(axis=1)
out = {'p': P.tolist(), 'speed_label': speed[:, 0].tolist(), 'speed_lid': speed[:, 1].tolist(), 'speed_cream': speed[:, 2].tolist(), 'speed': sp.tolist()}
json.dump(out, open('motion_%s.json' % ('m' if SR.PORTRAIT else 'd'), 'w'))
# px per frame at N=180: speed per dp * (1/179)
per = sp * (1.0 / 179) / dp
print('peak px/frame (N=180):', per.max().round(1), ' at p=', P[per.argmax()].round(3))
for lo, hi in ((0, .0375), (.0375, .30), (.30, .48), (.48, .60), (.60, .80), (.80, 1.0)):
    m = (P >= lo) & (P <= hi)
    print(f'p {lo:.3f}-{hi:.3f}: mean {per[m].mean():6.1f}  max {per[m].max():6.1f} px/frame; path {sp[m].sum() * 0 + (sp[m] * 1.0).sum() / 1:.0f} px(sum of steps)')
tot = sp.sum()
for M in (8, 10, 12, 16, 24):
    print('M=%d px -> frames needed ~%d' % (M, int(np.ceil(tot / M))))
