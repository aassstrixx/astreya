#!/usr/bin/env python3
"""3D-модель раскрытого журнала ASTREYA для столика зала (ASTREYA HOUSE). Подключается из hall_table.py при ZONE_MAG=1.

Журнал лежит на стекле корешком вверх по кадру (верх страницы — от зрителя), разворот — страницы 2–3 настоящего журнала с сайта (текстуры tools/jar-render/mag/page-l.png и page-r.png
делает mag_tex.js из той же вёрстки, что и журнал на сайте):
  • каждая половина — стопка листов: верх — глянцевая бумага с печатью, изгиб к корешку (жёлоб у переплёта), чуть опущенные верхний и нижний края, срез листов с тонкой штриховкой;
  • под страницами — обложка (тёмно-синяя, как обложка журнала на сайте), выступающая на 3–4 мм вокруг блока;
  • левая половина чуть тоньше правой (как у журнала в руках), развернут на несколько градусов — как положили, а не выставили по линейке.
Размеры — в единицах сцены (арка 0,82 м): страница 0,12 × 0,16 для столика радиусом 0,20.
"""
import math
import os
import random

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
_f = lambda k, d: float(os.environ.get(k, d))


def _principled(nt):
    return next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')


def _set(b, key, val):
    if key in b.inputs:
        b.inputs[key].default_value = val


def _page_mat(name, path):
    """глянцевая бумага: напечатанная страница (текстура), лёгкий лаковый блеск"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = _principled(nt)
    im = bpy.data.images.load(path); im.name = name + '_img'; im.colorspace_settings.name = 'sRGB'
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im; tx.interpolation = 'Linear'; tx.extension = 'EXTEND'
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    k = _f('ZONE_MAG_ALBEDO', .86)                                         # бумага чуть темнее текстуры: под светом зала белое выгорает
    mul.inputs[7].default_value = (k, k, k, 1)
    nt.links.new(tx.outputs['Color'], mul.inputs[6]); nt.links.new(mul.outputs[2], b.inputs['Base Color'])
    _set(b, 'Roughness', _f('ZONE_MAG_ROUGH', .46))
    _set(b, 'Specular IOR Level', .32)
    _set(b, 'Coat Weight', _f('ZONE_MAG_COAT', .16)); _set(b, 'Coat Roughness', .22)
    _set(b, 'Sheen Weight', .12); _set(b, 'Sheen Roughness', .5)
    return m


def _edge_png(path):
    """срез листов: пачки листов, разделённые тёмными щелями (на сайте торец журнала — всего ~14 px, мелкая штриховка слилась бы в белое), у низа блока — темнее (затенение у стекла).
    PNG 8×270: пачка = 30 строк, щель = 3; строка файла 0 — верх блока"""
    from PIL import Image
    rnd = random.Random(7)
    W, H, BAND, GAP = 8, 270, 30, 3
    im = Image.new('RGB', (W, H))
    for j in range(H):                                                     # j = 0 — низ блока (v = 0)
        pos = j % BAND
        if pos < GAP:
            g = .46 + .06 * rnd.random()                                   # щель между пачками листов
        else:
            g = .90 + .06 * (pos / BAND) - .07 * (1.0 - j / H)             # внутри пачки: сверху светлее, к низу блока темнее
            if pos % 7 == 0:
                g -= .05                                                   # тонкая линия между отдельными листами
        for i in range(W):
            n = 1.0 + (rnd.random() - .5) * .03
            im.putpixel((i, H - 1 - j), tuple(int(min(1.0, g * n * k) * 255 + .5) for k in (.985, .955, .88)))      # тёплый кремовый срез
    im.save(path)


def _edge_mat():
    path = os.path.join(HERE, 'mag', 'edge.png')
    if not os.path.exists(path):
        _edge_png(path)
    m = bpy.data.materials.new('mag_edge_m'); m.use_nodes = True; nt = m.node_tree; b = _principled(nt)
    im = bpy.data.images.load(path); im.name = 'mag_edge'; im.colorspace_settings.name = 'sRGB'
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im; tx.interpolation = 'Linear'; tx.extension = 'EXTEND'
    nt.links.new(tx.outputs['Color'], b.inputs['Base Color'])
    _set(b, 'Roughness', .78); _set(b, 'Specular IOR Level', .2)
    return m


def _cover_mat():
    m = bpy.data.materials.new('mag_cover'); m.use_nodes = True; b = _principled(m.node_tree)
    b.inputs['Base Color'].default_value = (.020, .040, .105, 1)               # тёмно-синий — как обложка журнала на сайте
    _set(b, 'Roughness', .34); _set(b, 'Specular IOR Level', .5); _set(b, 'Coat Weight', .25); _set(b, 'Coat Roughness', .12)
    return m


def build_magazine(cx, cy, z, pw, yaw_deg=7.0, grp='p'):
    """журнал с центром разворота (cx, cy) на плоскости z; pw — ширина одной страницы; возвращает список объектов"""
    ph = pw * 4.0 / 3.0                                                    # формат страницы журнала на сайте 3:4
    sc = pw / .12
    T = _f('ZONE_MAG_T', .0092) * sc                                       # толщина правого блока у края (≈ 50 листов)
    TL = T * .93                                                           # левый чуть тоньше
    cT = .0010 * sc                                                        # обложка
    ov = .0028 * sc                                                        # выступ обложки за блок
    vz = .34 * T                                                           # высота дна жёлоба у корешка
    zb = z + .0003 + cT                                                    # низ блока
    yaw = math.radians(yaw_deg); ca, sa = math.cos(yaw), math.sin(yaw)
    nu, nv = 56, 30

    def W(x, y, zz):                                                       # в мировые координаты (поворот вокруг вертикали + сдвиг)
        return (cx + x * ca - y * sa, cy + x * sa + y * ca, zz)

    def ztop(u, v, Th):
        prof = vz + (Th - vz) * (1.0 - math.exp(-u / .13))                 # жёлоб у корешка и плавный подъём к краю
        prof -= Th * .09 * u * u                                           # к срезу листы слегка опускаются
        edge = abs(2.0 * v - 1.0)
        prof -= .0011 * sc * (edge ** 3) * (.35 + .65 * u)                 # верхний и нижний края чуть оседают
        return zb + prof

    mats = {'l': _page_mat('mag_page_l', os.path.join(HERE, 'mag', 'page-l.png')), 'r': _page_mat('mag_page_r', os.path.join(HERE, 'mag', 'page-r.png'))}
    edge = _edge_mat(); cover = _cover_mat()
    objs = []

    def half(side):
        sgn = 1.0 if side == 'r' else -1.0
        Th = T if side == 'r' else TL
        verts, faces, uvs, midx = [], [], [], []

        def vtx(p):
            verts.append(p); return len(verts) - 1

        def quad(ids, uv, mi):
            faces.append(ids); uvs.append(uv); midx.append(mi)

        us = [(i / nu) ** 1.55 for i in range(nu + 1)]                     # гуще у корешка — там изгиб
        vs = [j / nv for j in range(nv + 1)]
        grid = [[vtx(W(sgn * us[i] * pw, (vs[j] - .5) * ph, ztop(us[i], vs[j], Th))) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]
                uv = [(us[i] if sgn > 0 else 1 - us[i], vs[j]), (us[i + 1] if sgn > 0 else 1 - us[i + 1], vs[j]), (us[i + 1] if sgn > 0 else 1 - us[i + 1], vs[j + 1]), (us[i] if sgn > 0 else 1 - us[i], vs[j + 1])]
                if sgn > 0:
                    quad([a, b, c, d], uv, 0)
                else:
                    quad([d, c, b, a], uv[::-1], 0)
        hmax = Th
        # срез: у края листов (u=1) и у верхнего и нижнего краёв (v=1 и v=0) — полосы от верха блока вниз до обложки
        def strip(points_top, normal_sign, key):
            """points_top — вершины верхней кромки (x, y, zt); низ — на zb; полоса из квадов; v текстуры — по высоте"""
            pr = []
            for (x, y, zt) in points_top:
                pr.append((vtx(W(x, y, zt)), vtx(W(x, y, zb)), (zt - zb) / hmax))
            for k in range(len(pr) - 1):
                t0, b0, h0 = pr[k]; t1, b1, h1 = pr[k + 1]
                u0, u1 = k / (len(pr) - 1), (k + 1) / (len(pr) - 1)
                ids, uv = [b0, b1, t1, t0], [(u0, 0.0), (u1, 0.0), (u1, h1), (u0, h0)]
                if normal_sign < 0:
                    ids, uv = ids[::-1], uv[::-1]
                quad(ids, uv, 1)
        strip([(sgn * pw, (vs[j] - .5) * ph, ztop(1.0, vs[j], Th)) for j in range(nv + 1)], 1 if sgn > 0 else -1, 'fore')
        strip([(sgn * us[i] * pw, ph / 2, ztop(us[i], 1.0, Th)) for i in range(nu + 1)], -1 if sgn > 0 else 1, 'head')
        strip([(sgn * us[i] * pw, -ph / 2, ztop(us[i], 0.0, Th)) for i in range(nu + 1)], 1 if sgn > 0 else -1, 'tail')
        me = bpy.data.meshes.new('mag_pg_' + side); me.from_pydata(verts, [], faces); me.update()
        me.materials.append(mats[side]); me.materials.append(edge)        # слоты — до индексов граней: без слотов Blender сбрасывает material_index в 0
        uvl = me.uv_layers.new(name='UVMap')
        for pi, poly in enumerate(me.polygons):
            poly.use_smooth = True; poly.material_index = midx[pi]
            for k, li in enumerate(poly.loop_indices):
                uvl.data[li].uv = uvs[pi][k]
        ob = bpy.data.objects.new('mag_pg_' + side, me); bpy.context.scene.collection.objects.link(ob); ob['grp'] = grp
        objs.append(ob)

    def board(side):
        sgn = 1.0 if side == 'r' else -1.0
        x0, x1 = 0.0, sgn * (pw + ov)
        y0, y1 = -ph / 2 - ov, ph / 2 + ov
        z0, z1 = z + .0003, z + .0003 + cT
        p = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        v = [W(*q) for q in p]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        me = bpy.data.meshes.new('mag_cv_' + side); me.from_pydata(v, [], f); me.update()
        import bmesh
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=.0005 * sc, segments=2, affect='EDGES')
        bm.to_mesh(me); bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        me.materials.append(cover)
        ob = bpy.data.objects.new('mag_cv_' + side, me); bpy.context.scene.collection.objects.link(ob); ob['grp'] = grp
        objs.append(ob)

    for s in ('l', 'r'):
        half(s); board(s)
    import bmesh
    for ob in objs:                                                        # нормали наружу — только у замкнутых обложек; у незамкнутых лент блока листов порядок вершин уже задан явно (пересчёт переворачивает их)
        me = ob.data; me.validate()
        if ob.name.startswith('mag_cv_'):
            bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    return objs
