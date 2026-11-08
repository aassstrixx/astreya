#!/usr/bin/env python3
"""Реалистичные модели «как в жизни» для Blender/Cycles: мягкая мебель, листья, ткани, дуб (общая для главной, каталога и ниш).

Принцип: форма — настоящая геометрия (мягкие подушки с выпуклой «шапкой», прогибом и складками, швы-канавки, подушки с угловыми «ушками», листья со складкой
по жилке, волнистым краем и изгибом), а не коробки со скруглением; поверхность — физические ткани (букле с петлями, лён с переплетением, синий замш с ворсом).
  • cushion()      — мягкий короб: сиденье / спинка / подлокотник (скруглённая форма, «шапка», прогиб, складки, канавка шва по кромке)
  • pillow()       — диванная подушка: два полотна, сшитых по периметру, «ушки» по углам, вмятина посередине, складки
  • sofa()         — диван: ножки из дуба, обивка-основание, спинка, подлокотники, сидения, спинные подушки, декоративные подушки
  • leaf_mesh()    — лист: 17 рядов × 8 колонок, складка по центральной жилке, волнистый край, изгиб и кручение (вместо ленты из трёх вершин)
  • leaf_material  — лист: цвет по длине, жилки, серебристая изнанка (по обратной стороне полигона), просвет, свой оттенок у каждого листа
  • fabric_boucle / fabric_linen / fabric_suede / oak — материалы
Использование: import realism as RL (внутри Blender); sofa() ждёт в M материалы 'fabric', 'suede', 'linen', 'oak' — их создаёт make_mats()."""
import math
import random

import bmesh
import bpy
from mathutils import Vector, noise

import materials as MT


# ---------------------------------------------------------------------------------------------------------------------------- материалы
def _tc(nt):
    return nt.nodes.new('ShaderNodeTexCoord')


def _mix(nt, a, b, fac, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
    if isinstance(fac, (int, float)): n.inputs['Factor'].default_value = fac
    else: nt.links.new(fac, n.inputs['Factor'])
    for k, x in (('A', a), ('B', b)):
        if isinstance(x, tuple): n.inputs[k].default_value = (x[0], x[1], x[2], 1)
        else: nt.links.new(x, n.inputs[k])
    return n.outputs['Result']


def _mapping(nt, vec, scale):
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale; nt.links.new(vec, mp.inputs['Vector']); return mp.outputs['Vector']


def fabric_boucle(name, col, scale=1.0, tint=.18):
    """букле: петли пряжи (сглаженная ячейка Вороного → рельеф), тёмные «щели» между петлями, плавный дрейф тона, мягкий ворсистый блик по краям"""
    m, nt, b = MT._mk(name); L = nt.links; tc = _tc(nt)
    vec = tc.outputs['Object']
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.feature = 'SMOOTH_F1'; vo.inputs['Scale'].default_value = 330.0 / scale; vo.inputs['Smoothness'].default_value = .65; vo.inputs['Randomness'].default_value = 1.0
    L.new(vec, vo.inputs['Vector'])
    v2 = nt.nodes.new('ShaderNodeTexVoronoi'); v2.feature = 'SMOOTH_F1'; v2.inputs['Scale'].default_value = 780.0 / scale; v2.inputs['Smoothness'].default_value = .5
    L.new(vec, v2.inputs['Vector'])
    cav = MT._ramp(nt, [(0.0, (1, 1, 1, 1)), (1.0, (.52, .50, .46, 1))]); L.new(vo.outputs['Distance'], cav.inputs['Fac'])
    drift = MT._noise(nt, vec, 28.0 / scale, 4, .6); tone = MT._ramp(nt, [(0.0, (1.0 - tint, 1.0 - tint, 1.0 - tint, 1)), (1.0, (1.0, 1.0, 1.0, 1))]); L.new(drift, tone.inputs['Fac'])
    big = MT._noise(nt, vec, 5.0 / scale, 3, .5); bt = MT._ramp(nt, [(0.0, (.95, .94, .92, 1)), (1.0, (1.03, 1.02, 1.0, 1))]); L.new(big, bt.inputs['Fac'])
    c1 = _mix(nt, (col[0], col[1], col[2]), cav.outputs['Color'], 1.0, 'MULTIPLY')
    c2 = _mix(nt, c1, tone.outputs['Color'], 1.0, 'MULTIPLY'); c3 = _mix(nt, c2, bt.outputs['Color'], 1.0, 'MULTIPLY')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .35
    fz = MT._math(nt, 'MULTIPLY', lw.outputs['Facing'], -1.0); fz = MT._math(nt, 'ADD', fz, 1.0); fz = MT._math(nt, 'MULTIPLY', fz, .14)
    L.new(_mix(nt, c3, (1.0, .97, .90), fz), b.inputs['Base Color'])
    h = MT._math(nt, 'ADD', MT._math(nt, 'SUBTRACT', 1.0, vo.outputs['Distance']), MT._math(nt, 'MULTIPLY', MT._math(nt, 'SUBTRACT', 1.0, v2.outputs['Distance']), .5))
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 1.1; bp.inputs['Distance'].default_value = .0012 * scale; L.new(h, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, 1.0, 'Roughness'); MT._val(b, .75, 'Sheen Weight', 'Sheen'); MT._val(b, .55, 'Sheen Roughness'); MT._val(b, .0, 'Specular IOR Level', 'Specular')
    return m


def fabric_linen(name, col, scale=1.0):
    """лён: переплетение нитей (две синусоиды в шахматном порядке), неровная толщина нити (вытянутый шум) и мягкие складчатые перепады тона"""
    m, nt, b = MT._mk(name); L = nt.links; tc = _tc(nt); vec = tc.outputs['Object']
    k = 2 * math.pi / (.0034 * scale)
    sx = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(vec, sx.inputs[0])
    a = MT._math(nt, 'SINE', MT._math(nt, 'MULTIPLY', sx.outputs['X'], k)); c = MT._math(nt, 'SINE', MT._math(nt, 'MULTIPLY', sx.outputs['Y'], k))
    d = MT._math(nt, 'SINE', MT._math(nt, 'MULTIPLY', sx.outputs['Z'], k))
    over = MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', a, c), MT._math(nt, 'MULTIPLY', d, c))
    slub1 = MT._noise(nt, _mapping(nt, vec, (1.0, 1.0, 1.0)), 90.0 / scale, 3, .6)
    slub2 = MT._noise(nt, _mapping(nt, vec, (1.0, 14.0, 1.0)), 140.0 / scale, 2, .6)
    drift = MT._noise(nt, vec, 10.0 / scale, 4, .55)
    cr = MT._ramp(nt, [(0.0, (col[0] * .86, col[1] * .86, col[2] * .85, 1)), (1.0, (col[0] * 1.03, col[1] * 1.03, col[2] * 1.02, 1))]); L.new(MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', drift, .6), MT._math(nt, 'MULTIPLY', slub2, .4)), cr.inputs['Fac'])
    thr = MT._math(nt, 'MULTIPLY', MT._math(nt, 'ADD', over, 1.0), .5)
    L.new(_mix(nt, cr.outputs['Color'], (col[0] * .80, col[1] * .80, col[2] * .78), MT._math(nt, 'MULTIPLY', thr, .18)), b.inputs['Base Color'])
    h = MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', thr, 1.0), MT._math(nt, 'MULTIPLY', slub1, .8))
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .38; bp.inputs['Distance'].default_value = .0006 * scale; L.new(h, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, .92, 'Roughness'); MT._val(b, .5, 'Sheen Weight', 'Sheen'); MT._val(b, .6, 'Sheen Roughness'); MT._val(b, .0, 'Specular IOR Level', 'Specular')
    return m


def fabric_suede(name, col, scale=1.0):
    """синий замш: плотный короткий ворс (мелкий рельеф), «затёртость» по направлению ворса (вытянутый шум меняет светлоту), ворсистый блик по краям"""
    m, nt, b = MT._mk(name); L = nt.links; tc = _tc(nt); vec = tc.outputs['Object']
    nap = MT._noise(nt, vec, 1100.0 / scale, 3, .65)
    rub = MT._noise(nt, _mapping(nt, vec, (1.0, 5.0, 1.0)), 38.0 / scale, 4, .55)
    big = MT._noise(nt, vec, 7.0 / scale, 3, .5)
    tr = MT._ramp(nt, [(0.0, (.80, .80, .80, 1)), (1.0, (1.28, 1.28, 1.28, 1))]); L.new(MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', rub, .75), MT._math(nt, 'MULTIPLY', big, .25)), tr.inputs['Fac'])
    base = _mix(nt, (col[0], col[1], col[2]), tr.outputs['Color'], 1.0, 'MULTIPLY')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .45
    fz = MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', lw.outputs['Facing'], -1.0), 1.0); fz = MT._math(nt, 'MULTIPLY', MT._math(nt, 'POWER', fz, 2.0), .55)
    L.new(_mix(nt, base, (min(1, col[0] * 2.2 + .012), min(1, col[1] * 2.2 + .02), min(1, col[2] * 1.7 + .04)), MT._math(nt, 'MULTIPLY', fz, .55)), b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .5; bp.inputs['Distance'].default_value = .0006 * scale; L.new(nap, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, .70, 'Roughness'); MT._val(b, .30, 'Sheen Weight', 'Sheen'); MT._val(b, .45, 'Sheen Roughness'); MT._val(b, .0, 'Specular IOR Level', 'Specular')
    if 'Sheen Tint' in b.inputs: b.inputs['Sheen Tint'].default_value = (.20, .30, .60, 1)
    return m


def oak(name='oak', col=(.64, .47, .28), scale=1.0, axis='Z'):
    """светлый натуральный дуб: годовые кольца (волна, искажённая шумом), поры вдоль волокон, шелковисто-матовое масло"""
    m, nt, b = MT._mk(name); L = nt.links; tc = _tc(nt)
    vec = tc.outputs['Object']
    sc = (1.0, 1.0, .04) if axis == 'Z' else ((.04, 1.0, 1.0) if axis == 'X' else (1.0, .04, 1.0))        # волокна вдоль оси: по ней рисунок растянут
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'X' if axis != 'X' else 'Y'; wv.wave_profile = 'SIN'
    wv.inputs['Scale'].default_value = 26.0 / scale; wv.inputs['Distortion'].default_value = 5.5; wv.inputs['Detail'].default_value = 3.0; wv.inputs['Detail Scale'].default_value = 1.4
    L.new(_mapping(nt, vec, tuple(1.0 / s if s > .1 else 1.0 for s in sc)), wv.inputs['Vector'])
    pores = MT._noise(nt, _mapping(nt, vec, tuple(1.0 if s > .1 else 40.0 for s in sc)), 420.0 / scale, 3, .7)
    fl = MT._noise(nt, vec, 9.0 / scale, 3, .55)
    cr = MT._ramp(nt, [(0.0, (col[0] * .78, col[1] * .76, col[2] * .72, 1)), (.55, (col[0] * .98, col[1] * .97, col[2] * .94, 1)), (1.0, (col[0] * 1.16, col[1] * 1.13, col[2] * 1.07, 1))]); L.new(wv.outputs['Fac'], cr.inputs['Fac'])
    c2 = _mix(nt, cr.outputs['Color'], (col[0] * .70, col[1] * .66, col[2] * .60), MT._math(nt, 'MULTIPLY', pores, .45))
    L.new(_mix(nt, c2, (col[0] * 1.08, col[1] * 1.05, col[2] * 1.0), MT._math(nt, 'MULTIPLY', fl, .25)), b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .35; bp.inputs['Distance'].default_value = .0006 * scale; L.new(MT._math(nt, 'ADD', pores, wv.outputs['Fac']), bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, .46, 'Roughness'); MT._val(b, .08, 'Coat Weight', 'Clearcoat'); MT._val(b, .35, 'Coat Roughness', 'Clearcoat Roughness')
    return m


def leaf_material(name, dark, light, under=False, silver=(.66, .71, .58), vein_k=1.0):
    """лист: цвет вдоль листа, светлая центральная жилка и тонкие боковые жилки «ёлочкой», серебристо-светлая изнанка (обратная сторона полигона), просвет, свой оттенок у каждого листа"""
    m, nt, b = MT._mk(name); L = nt.links
    uvc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(uvc.outputs['UV'], sp.inputs[0])
    U, V = sp.outputs['X'], sp.outputs['Y']
    au = MT._math(nt, 'ABSOLUTE', MT._math(nt, 'SUBTRACT', U, .5))
    gr = MT._ramp(nt, [(0.0, (*dark, 1)), (1.0, (*light, 1))]); L.new(V, gr.inputs['Fac'])
    edge = MT._math(nt, 'MULTIPLY', MT._math(nt, 'POWER', MT._math(nt, 'MULTIPLY', au, 2.0), 2.2), .10)                       # к краю листа чуть светлее-желтее
    rib = MT._math(nt, 'LESS_THAN', au, MT._math(nt, 'ADD', .020, MT._math(nt, 'MULTIPLY', MT._math(nt, 'SUBTRACT', 1.0, V), .030)))
    lat = MT._math(nt, 'ABSOLUTE', MT._math(nt, 'SINE', MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', V, 34.0), MT._math(nt, 'MULTIPLY', au, -26.0))))
    latm = MT._math(nt, 'MULTIPLY', MT._math(nt, 'GREATER_THAN', lat, .90), MT._math(nt, 'LESS_THAN', au, .42))
    vein = MT._math(nt, 'MAXIMUM', rib, MT._math(nt, 'MULTIPLY', latm, .55))
    oi = nt.nodes.new('ShaderNodeObjectInfo'); rv = nt.nodes.new('ShaderNodeMapRange'); rv.inputs['To Min'].default_value = .78; rv.inputs['To Max'].default_value = 1.22; L.new(oi.outputs['Random'], rv.inputs['Value'])
    shift = MT._noise(nt, uvc.outputs['UV'], 7.0, 3, .5)
    top = _mix(nt, gr.outputs['Color'], (min(1, light[0] * 1.5), min(1, light[1] * 1.45), light[2] * .9), MT._math(nt, 'ADD', edge, MT._math(nt, 'MULTIPLY', vein, .55 * vein_k)))
    rc = nt.nodes.new('ShaderNodeCombineColor'); L.new(rv.outputs['Result'], rc.inputs[0]); L.new(rv.outputs['Result'], rc.inputs[1]); L.new(rv.outputs['Result'], rc.inputs[2])
    top = _mix(nt, top, rc.outputs[0], 1.0, 'MULTIPLY')
    top = _mix(nt, top, oi.outputs['Color'], 1.0, 'MULTIPLY')                                            # цвет объекта-листа: молодые листья светлее и желтее, старые темнее
    top = _mix(nt, top, (light[0] * .8, light[1] * 1.05, light[2] * .7), MT._math(nt, 'MULTIPLY', shift, .35))
    gm = nt.nodes.new('ShaderNodeNewGeometry')
    bot = _mix(nt, (silver[0], silver[1], silver[2]), (silver[0] * .85, silver[1] * .88, silver[2] * .78), MT._math(nt, 'MULTIPLY', vein, .8))
    L.new(_mix(nt, top, bot, gm.outputs['Backfacing']), b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .65; bp.inputs['Distance'].default_value = .0007; L.new(vein, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, .42, 'Roughness'); MT._val(b, .45, 'Specular IOR Level', 'Specular'); MT._val(b, .10, 'Coat Weight', 'Clearcoat'); MT._val(b, .32, 'Coat Roughness', 'Clearcoat Roughness')
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent')                                                               # свет сквозь тонкий лист: тёплый жёлто-зелёный просвет (как на контровом свете)
    L.new(_mix(nt, (light[0] * 1.15, light[1] * 1.25, light[2] * .55), (silver[0] * .9, silver[1] * 1.0, silver[2] * .6), gm.outputs['Backfacing']), tr.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = .22
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    L.new(b.outputs['BSDF'], mx.inputs[1]); L.new(tr.outputs['BSDF'], mx.inputs[2]); L.new(mx.outputs['Shader'], out.inputs['Surface'])
    return m


def make_mats(hs=1.0):
    """материалы мебели: букле молочный песок, лён, синий замш, дуб"""
    return dict(fabric=fabric_boucle('rl_boucle', (.93, .88, .78), hs), suede=fabric_suede('rl_suede', (.013, .024, .066), hs),
                linen=fabric_linen('rl_linen', (.90, .85, .74), hs), oak=oak('rl_oak', (.66, .49, .30), hs, 'Z'))


# ---------------------------------------------------------------------------------------------------------------------------- геометрия
def _obj(name, me, mat, parent=None, smooth=True):
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if parent is not None: ob.parent = parent
    return ob


def _clust(t, k=1.8):
    return math.copysign(1.0 - (1.0 - abs(t)) ** k, t) if t else 0.0


def cushion_mesh(w, d, h, r=.012, crown=.0, belly=.0, sag=.0, wrinkle=.0, groove=.0007, seed=1, n=26, rz=None, crown_b=.25, lean=0.0):
    """мягкий короб: скруглённый параллелепипед w×d×h (центр в начале координат), сверху «шапка» (crown), по бокам «пузо» (belly), прогиб сиденья (sag), складки шума (wrinkle) и узкая канавка шва по дуге кромки (groove)"""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=n - 1, use_grid_fill=True)
    hx, hy, hz = w / 2, d / 2, h / 2; r = min(r, hx * .45, hy * .45, hz * .9)
    rz = r if rz is None else min(rz, hz * .9)
    ix, iy, iz = hx - r, hy - r, hz - rz
    s0 = seed * 17.3
    for v in bm.verts:
        x, y, z = (_clust(v.co.x), _clust(v.co.y), _clust(v.co.z))
        q = Vector((x * hx, y * hy, z * hz))
        c = Vector((max(-ix, min(ix, q.x)), max(-iy, min(iy, q.y)), max(-iz, min(iz, q.z))))
        dv = q - c
        if dv.length > 1e-9:                                                           # проекция на дугу: радиус r по x, y и rz по z
            e = Vector((dv.x / r, dv.y / r, dv.z / rz)); e.normalize(); q = c + Vector((e.x * r, e.y * r, e.z * rz))
        v.co = q
    bm.normal_update()
    for v in bm.verts:
        q = v.co.copy(); u = q.x / hx; vv = q.y / hy; zz = q.z / hz
        top = max(0.0, zz)
        wgt = max(0.0, 1.0 - u * u) ** .8 * max(0.0, 1.0 - vv * vv) ** .8                                   # «шапка»: максимум в центре крышки, к кромке сходит на нет
        q.z += crown * wgt * (top if zz > 0 else -crown_b * max(0.0, -zz))
        q.z -= sag * math.exp(-(u * u + vv * vv) * 2.2) * (top ** 2)                                         # прогиб сидения
        bl = 1.0 - zz * zz
        q.x *= 1.0 + belly * bl; q.y *= 1.0 + belly * bl                                                      # пузо по боку
        if lean: q.y += lean * (zz + 1.0) * .5                                                                # наклон (спинная подушка)
        nrm = v.normal
        if wrinkle:
            f = noise.fractal(Vector((q.x * 38 + s0, q.y * 38 + s0 * .7, q.z * 38)), .55, 2.0, 4)
            f2 = noise.fractal(Vector((q.x * 11 + s0 * 1.7, q.y * 11, q.z * 11 + s0)), .5, 2.0, 3)
            edge = min(1.0, (abs(zz) ** 6) * .7 + (abs(u) ** 6) * .5 + (abs(vv) ** 6) * .5 + .35)
            q += nrm * wrinkle * (f * .45 + f2 * .55) * edge
        if groove:
            dz = abs(q.z) - iz
            if dz > 0:
                ax = max(abs(q.x) - ix, abs(q.y) - iy, 0.0)
                if ax > 0:
                    ang = math.atan2(dz, ax)
                    q -= nrm * groove * math.exp(-((ang - .785) / .10) ** 2)
        v.co = q
    me = bpy.data.meshes.new('cushion'); bm.to_mesh(me); bm.free()
    return me


def cushion(name, mat, w, d, h, loc, rot=(0, 0, 0), parent=None, **kw):
    me = cushion_mesh(w, d, h, **kw)
    ob = _obj(name, me, mat, parent)
    ob.location = loc; ob.rotation_euler = rot
    md = ob.modifiers.new('sub', 'SUBSURF'); md.levels = 1; md.render_levels = 2
    return ob


def pillow_mesh(w, h, T, seed=1, ear=.20, dent=.0, crease=.0, n=34, wrinkle=.0026, edge_p=2.0, roundness=.46, diag=.0, bow=.06):
    """диванная подушка w×h толщиной T (плоская, лежит в xy): два полотна, сшитых по периметру; «ушки» по углам, вмятина посередине, складки; шов — острая кромка"""
    rnd = random.Random(seed); s0 = rnd.uniform(0, 100)
    N = n; ts = [_clust(-1 + 2 * i / N, 1.5) for i in range(N + 1)]
    verts = []; idx = {}
    def pt(i, j, side):
        u, v = ts[i], ts[j]
        s = max(0.0, (1 - abs(u) ** edge_p) * (1 - abs(v) ** edge_p))
        z = side * T / 2 * (s ** roundness)
        c = abs(u) * abs(v)
        k = 1.0 + ear * (c ** 3)                                                            # «ушко»: угол вытягивается по диагонали
        x = u * w / 2 * k * (1.0 + bow * (1 - v * v) * (abs(u) ** 1.5)); y = v * h / 2 * k * (1.0 + bow * (1 - u * u) * (abs(v) ** 1.5))      # края выгнуты наружу (набивка), углы — «ушки»
        z -= side * T * .5 * ear * (c ** 3) * 1.6                                          # угол «провисает» — подушка на углах тоньше
        z -= side * dent * math.exp(-((u * u) + (v * v)) * 3.0) * (s ** .5)
        if crease: z -= side * crease * math.exp(-(u / .16) ** 2) * (1 - abs(v)) * .8
        if diag: z -= side * diag * (math.exp(-((abs(u) - abs(v)) / .10) ** 2)) * (c ** .7) * (s ** .4)     # складки-«тяги» от углов к центру
        f = noise.fractal(Vector((x * 30 + s0, y * 30, side * 3.1)), .55, 2.0, 4)
        z += side * wrinkle * f * (s ** .5 + .15)
        return (x, y, z)
    for side in (1, -1):
        for i in range(N + 1):
            for j in range(N + 1):
                edge = (i in (0, N)) or (j in (0, N))
                key = (i, j, 0) if edge else (i, j, side)
                if key not in idx:
                    idx[key] = len(verts); verts.append(pt(i, j, side))
    faces = []
    for side in (1, -1):
        for i in range(N):
            for j in range(N):
                def g(a, b): return idx[(a, b, 0)] if (a in (0, N) or b in (0, N)) else idx[(a, b, side)]
                f = (g(i, j), g(i + 1, j), g(i + 1, j + 1), g(i, j + 1))
                faces.append(f if side == 1 else f[::-1])
    me = bpy.data.meshes.new('pillow'); me.from_pydata(verts, [], faces); me.update()
    return me


def pillow(name, mat, w, h, T, loc, rot=(0, 0, 0), parent=None, **kw):
    ob = _obj(name, pillow_mesh(w, h, T, **kw), mat, parent)
    ob.location = loc; ob.rotation_euler = rot
    md = ob.modifiers.new('sub', 'SUBSURF'); md.levels = 1; md.render_levels = 1
    return ob


def _leg(name, mat, x, y, z0, z1, r0, r1, parent, tilt=(0, 0)):
    seg = 28; verts = []; faces = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        verts.append((x + r0 * math.cos(a), y + r0 * math.sin(a), z0)); verts.append((x + r1 * math.cos(a), y + r1 * math.sin(a), z1))
    for k in range(seg):
        k2 = (k + 1) % seg; faces.append((2 * k, 2 * k2, 2 * k2 + 1, 2 * k + 1))
    verts.append((x, y, z0)); verts.append((x, y, z1)); faces += [tuple(2 * k for k in reversed(range(seg))), tuple(2 * k + 1 for k in range(seg))]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = _obj(name, me, mat, parent)
    bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = .0012; bv.segments = 2; bv.limit_method = 'ANGLE'
    return ob


def sofa(name, M, cx, cy, yaw, w=.66, d=.30, hk=1.0, seed=3, pillows=True):
    """диван: 4 ножки из дуба, обивка-основание, спинка, два подлокотника с «пузом», сиденья, спинные подушки, декоративные подушки (синий замш, лён); фронт — в сторону −y при yaw = 0; размеры подобраны для сцены-миниатюры (диван 2 м ↔ .66 м)"""
    rnd = random.Random(seed)
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    root.location = (cx, cy, 0); root.rotation_euler = (0, 0, yaw); root.scale = (1, 1, hk)
    bpy.context.view_layer.update()
    k = w / .66; x0, x1, y0, y1 = -w / 2, w / 2, -d / 2, d / 2
    fab, sue, lin, ok = M['fabric'], M['suede'], M['linen'], M['oak']
    leg_h = .038 * (.5 + .5 * k)
    for sx in (x0 + .045, x1 - .045):
        for sy in (y0 + .040, y1 - .040):
            _leg('%s_leg' % name, ok, sx, sy, 0.0, leg_h + .003, .0075, .0105, root)
    z_f = leg_h; zb = z_f + .052                                                         # рама-основание под сиденьями
    cushion(name + '_frame', fab, w - .004, d - .004, zb - z_f, (0, 0, (z_f + zb) / 2), parent=root, r=.011, belly=.004, wrinkle=.0006, seed=1, n=22)
    arm = .070 * (.65 + .35 * k)
    ah = .108                                                                             # подлокотники: мягкие, с широкой закруглённой верхней гранью
    for sgn in (-1, 1):
        cushion('%s_arm' % name, fab, arm, d - .004, ah, (sgn * (w / 2 - arm / 2), 0, zb + ah / 2 - .004), parent=root, r=.026, rz=.032, crown=.006, belly=.007, wrinkle=.0012, seed=5 + sgn, n=26)
    bk_h = .150
    cushion(name + '_back', fab, w - 2 * arm + .006, .066, bk_h, (0, y1 - .033, zb + bk_h / 2 - .004), parent=root, r=.016, rz=.026, crown=.004, belly=.004, wrinkle=.001, seed=9, n=24)
    inner = w - 2 * arm; ns = 2 if w < .95 else 3
    gap = .003; sw = (inner - gap * (ns - 1)) / ns; sd = d - .066 - .004; sth = .060
    for i in range(ns):
        sx = -inner / 2 + sw / 2 + i * (sw + gap)
        cushion('%s_seat' % name, fab, sw, sd, sth, (sx, y0 + sd / 2 + .002, zb + sth / 2 - .001), rot=(0, 0, rnd.uniform(-.008, .008)), parent=root, r=.016, rz=.022, crown=.011, crown_b=.12, belly=.009, sag=.0035, wrinkle=.0016, seed=11 + i, n=30)
    bh = .108; bth = .052                                                                  # спинные подушки: опираются на спинку, чуть наклонены назад, верх «шапкой»
    for i in range(ns):
        sx = -inner / 2 + sw / 2 + i * (sw + gap)
        cushion('%s_bk' % name, fab, sw - .004, bth, bh, (sx, y1 - .066 - bth / 2 + .002, zb + sth + bh / 2 - .003), rot=(math.radians(-10), 0, rnd.uniform(-.01, .01)), parent=root, r=.015, rz=.022, crown=.008, belly=.010, sag=.0, wrinkle=.0017, seed=21 + i, n=26)
    if pillows:
        zp = zb + sth + .001
        pw = .112 * (.6 + .4 * k)
        xs = (-inner / 2 + pw * .62 + .006, inner / 2 - pw * .62 - .006) if ns == 2 else (-inner / 2 + pw * .62, inner / 2 - pw * .62)
        for i, px in enumerate(xs):
            yy = y1 - .066 - bth - .004
            pillow('%s_pil' % name, sue, pw, pw * .94, .064 * (.8 + .2 * k), (px, yy - pw * .36, zp + pw * .44), rot=(math.radians(70 + rnd.uniform(-4, 4)), math.radians(rnd.uniform(-6, 6)), math.radians((-1) ** i * (8 + rnd.uniform(0, 8)))), parent=root, seed=31 + i, ear=.20, dent=.008, crease=.004, diag=.005)
        if k > .8:
            pillow('%s_lum' % name, lin, pw * 1.18, pw * .62, .052, (0.02, y1 - .066 - bth - .020, zp + .046), rot=(math.radians(62), 0, math.radians(-4)), parent=root, seed=41, ear=.14, dent=.004, crease=.0025)
    return root


# ---------------------------------------------------------------------------------------------------------------------------- листья
def leaf_mesh(L=.17, Wd=.05, seed=0, kind='olive', n=17, m=8):
    """лист: n рядов × (m+1) колонок. Ширина — по профилю (ланцетный: острый кончик и клин у черенка), складка по центральной жилке (края выше), волнистый край, продольный изгиб, кручение и загиб кончика; у каждого листа свой набор параметров (seed)"""
    rnd = random.Random(seed * 7919 + 13)
    wob = rnd.uniform(0, 6.283); tw = rnd.uniform(-.55, .55); curl = rnd.uniform(.15, 1.7); fold = rnd.uniform(.30, .62); wav = rnd.uniform(.04, .11) * (1.4 if kind == 'ficus' else 1.0)
    verts = []; faces = []
    for i in range(n + 1):
        t = i / n
        if kind == 'olive':
            w = Wd * (math.sin(math.pi * (t ** .70)) ** .78) * (1.0 - .12 * t)
        else:
            w = Wd * (math.sin(math.pi * (t ** .85)) ** .72)
        w = max(w, Wd * .012)
        y = L * t
        zc = L * (.060 * math.sin(math.pi * min(1.0, t * 1.15)) - .105 * t * t * curl)
        for j in range(m + 1):
            s = -1.0 + 2.0 * j / m; a = abs(s)
            x = s * w
            z = zc + fold * w * (a ** .9) - .010 * w * (1 - a * a)                     # V-складка по жилке; жилка чуть утоплена
            z += wav * w * math.sin(t * 6.283 * 2.6 + wob + s * 1.2) * (a ** 2)       # волнистый край
            z += tw * w * s * math.sin(math.pi * t)                                    # кручение (одна половина выше другой)
            z -= .22 * w * (t ** 4) * (1.0 - a)                                        # кончик слегка загнут вниз
            verts.append((x, y, z + .004 * L))
    W_ = m + 1
    for i in range(n):
        for j in range(m):
            a = i * W_ + j; faces.append((a, a + 1, a + 1 + W_, a + W_))
    me = bpy.data.meshes.new('leaf'); me.from_pydata(verts, [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices): uv.data[li].uv = ((vi % W_) / float(m), (vi // W_) / float(n))
    return me


def leaf_variants(L, Wd, count=4, kind='olive', mats=None):
    out = []
    for i in range(count):
        me = leaf_mesh(L * (.92 + .16 * ((i * 37) % 7) / 6.0), Wd * (.90 + .20 * ((i * 53) % 5) / 4.0), seed=i + 1, kind=kind)
        if mats is not None: me.materials.append(mats[i % len(mats)])
        out.append(me)
    return out


def pair_dirs(d, i, rnd, spread=.95, up=.25, droop=.25):
    """два листа в узле оливковой ветки: противоположные (супротивные), с поворотом пары на 90° от узла к узлу; угол к побегу ~ 50°, лёгкий подъём и провисание под весом. Возвращает два вектора направления листа"""
    d = d.normalized(); u = d.cross(Vector((0, 0, 1)))
    if u.length < .25: u = d.cross(Vector((1, 0, 0)))
    u.normalize(); v = d.cross(u)
    ang = (i % 2) * math.pi / 2 + rnd.uniform(-.25, .25)
    out = []
    for side in (1, -1):
        s = (u * math.cos(ang) + v * math.sin(ang)) * side
        dv = d * (.62 + rnd.uniform(-.1, .12)) + s * spread + Vector((0, 0, up * rnd.uniform(.2, 1.0) - droop * rnd.random()))
        out.append(dv.normalized())
    return out


def orient(ob, dv, rnd, roll=.7, tint=None):
    """поставить лист-объект: ось листа вдоль dv, верх — вверх, затем поворот вокруг собственной оси (листья висят и лежат по-разному); tint — цвет объекта (множитель цвета листа)"""
    from mathutils import Quaternion
    q = dv.normalized().to_track_quat('Y', 'Z')
    q = q @ Quaternion((0.0, 1.0, 0.0), rnd.uniform(-roll, roll))
    ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = q
    if tint is not None: ob.color = (tint[0], tint[1], tint[2], 1.0)


def tint_for(t, rnd):
    """оттенок листа вдоль побега: к кончику (t→1) — молодая светло-жёлтая зелень, у основания — тёмная, плюс случайный разброс"""
    g = 1.0 + .22 * (t ** 1.5) + rnd.uniform(-.07, .07)
    return (g * 1.04, g * 1.06, g * (.86 if t > .7 else .96))
