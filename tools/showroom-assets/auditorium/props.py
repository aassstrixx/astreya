#!/usr/bin/env python3
"""АСТРЕЯ · зал учебного центра — реквизит: хромированные вазы с белыми цветами, кафедра с микрофоном, наполнение стеклянных ниш (см. SPEC.md рядом).
Функции принимают положение в метрах (1 ед. Blender = 1 м, Z вверх) и возвращают СПИСОК корневых объектов (один Empty `aud_<name>`; все детали — его дети, поэтому двигать,
вращать и масштабировать можно корень). Сцену функции НЕ очищают; объекты пишутся в активную коллекцию (или в `collection=`), имена, меши и материалы — с префиксом `aud_`.
Материалы создаются один раз и переиспользуются (`bpy.data.materials.get`), геометрия цветков — общая (связанные копии), поэтому вызывать функции можно сколько угодно раз.
  chrome_vase_with_flowers(name, loc, scale=1.0, seed=1, collection=None) — амфора из хрома (h .55 м, Ø .38) и купол из белой гортензии/флокса (≈ .75 м над горлом, ≈ .9 м в ширину):
                                                             ~4900 связанных копий 10 вариантов цветка (4–5 тонких лепестков с subsurface .15 и малым пропусканием, центр едва зелёный),
                                                             20 шаров гортензии + 8 флоксов + 3 «выбившихся» соцветия на стеблях, ~50 листьев (`realism.leaf_mesh`); seed меняет раскладку
  orchid_vase(name, loc, seed=2, collection=None)         — хромированный цилиндр h .38 м и две изогнутые ветки белого фаленопсиса (6 и 5 цветков Ø ≈ 13 см, бутоны), 4 листа у горла
  lectern(name, loc, yaw=0.0, collection=None)            — кафедра 1.1 × .7 × .5 м из белого мрамора (`marble-white-warm`, box-mapping), скошенная столешница (фасад 1.1 м, к докладчику .1 ниже),
                                                             латунный цоколь и кант, знак «Астреи» из astreya-mark-white.svg (кривые → выдавленный меш, .172 × .165 м, латунь `brass-brushed-pale`),
                                                             микрофон на гусиной шее (≈ .40 м над столешницей), лампа-ридер; фасад со знаком смотрит в −Y при yaw = 0
  shelf_unit(name, loc, width=1.0, height=5.4, shelves=7, seed=3, depth=.24, prop_scale=1.3, collection=None)
                                                          — стеклянные полки 12 мм (торец зеленоватый) через .62 м: первая на loc.z + 1.0, последняя ≤ loc.z + 5.0 (при 7 полках 4.72), на каждой 3–6 безликих
                                                             флаконов (помпы, эйрлесс, баночки, тубы, капельницы: чёрное стекло, чёрный матовый пластик, 1–2 белых). loc = центр ниши НА СТЕНЕ (y — плоскость задней
                                                             стенки), полки и предметы выступают перед ней к −Y; prop_scale=1.3 — «выставочный» масштаб (помпы .31–.44 м), 1.0 — натуральный
  python3 props.py preview [main|close|shelf|orchid|vase|top] — мини-студия: /tmp/aud_props.png (960×540), /tmp/aud_props_closeup.png (букет + кафедра), /tmp/aud_props_shelf.png и _shelf_close.png;
                                                             без аргумента — main + close + shelf; orchid / vase / top — дополнительные ракурсы (/tmp/aud_props_orchid.png и т. д.)
Переменные окружения превью: SPP (сэмплы, ≤ 64), W (ширина кадра), BQ (плотность цветов, 1.0)."""
import bpy, bmesh, math, os, sys, random, re, time
from mathutils import Vector, Matrix, Quaternion, geometry

HERE = os.path.dirname(os.path.abspath(__file__)); PARENT = os.path.normpath(os.path.join(HERE, '..'))
TEX = os.path.join(PARENT, 'textures'); SVG_MARK = os.path.join(PARENT, 'astreya-mark-white.svg')
sys.path.insert(0, PARENT)                                                     # realism.py тянет за собой materials.py из папки выше; после импорта путь убираем
try: import realism as RL                                                      # leaf_mesh / leaf_material / orient / tint_for
finally: sys.path.remove(PARENT)

_COLL = [None]                                                                 # активная коллекция вывода (меняется параметром collection=)
UP = Vector((0, 0, 1))


# ======================================================================================================================== общие мелочи
def lin(h):
    """#rrggbb → линейный RGB"""
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)


def nm(name, part=''):
    base = name if name.startswith('aud_') else 'aud_' + name
    return base + ('_' + part if part else '')


def coll():
    return _COLL[0] or bpy.context.collection


def link(ob, parent=None):
    coll().objects.link(ob)
    if parent is not None: ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    ob = bpy.data.objects.new(nm(name), None); ob.empty_display_type = 'PLAIN_AXES'; ob.empty_display_size = .1
    ob.location = loc; ob.rotation_euler = rot; ob.scale = (scale,) * 3; coll().objects.link(ob); return ob


def bevel(ob, w, seg=2, ang=35.0):
    b = ob.modifiers.new('bev', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(ang); return ob


def smooth(me):
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons)); me.update()


def S(b, v, *names):
    """выставить первый существующий вход Principled"""
    for n in names:
        if n in b.inputs: b.inputs[n].default_value = v; return b.inputs[n]


class MB:
    """накопитель меша: вершины, грани (индекс материала на грань), UV на вершину; всё можно добавлять с матрицей"""
    def __init__(s): s.v = []; s.f = []; s.m = []; s.uv = []

    def add(s, verts, faces, mat=0, xf=None, uvs=None):
        o = len(s.v)
        if xf is not None: verts = [xf @ Vector(p) for p in verts]
        s.v += [tuple(p) for p in verts]; s.uv += (uvs if uvs is not None else [(0.0, 0.0)] * len(verts))
        for f in faces: s.f.append(tuple(i + o for i in f)); s.m.append(mat)

    def rings(s, prof, seg=48, mat=0, xf=None):
        v, f = rings(prof, seg); s.add(v, f, mat, xf)

    def mesh(s, name, mats, sm=True):
        me = bpy.data.meshes.new(name); me.from_pydata(s.v, [], s.f); me.update()
        for mt in mats: me.materials.append(mt)
        me.polygons.foreach_set('material_index', s.m)
        if sm: smooth(me)
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices: uvl.data[li].uv = s.uv[me.loops[li].vertex_index]
        return me


def rings(prof, seg=48):
    """тело вращения вокруг Z; prof — [(z, rx, ry)] снизу вверх (полюс при rx = ry = 0); внутренняя стенка — когда профиль идёт вниз; нормали наружу"""
    v = []; f = []; idx = []
    for (z, rx, ry) in prof:
        if rx < 1e-9 and ry < 1e-9: v.append((0.0, 0.0, z)); idx.append([len(v) - 1])
        else:
            b0 = len(v)
            for k in range(seg): a = 2 * math.pi * k / seg; v.append((rx * math.cos(a), ry * math.sin(a), z))
            idx.append(list(range(b0, b0 + seg)))
    for i in range(len(prof) - 1):
        A, B = idx[i], idx[i + 1]
        if len(A) == 1 and len(B) == 1: continue
        for k in range(seg):
            k2 = (k + 1) % seg
            if len(A) == 1: f.append((A[0], B[k2], B[k]))
            elif len(B) == 1: f.append((A[k], A[k2], B[0]))
            else: f.append((A[k], A[k2], B[k2], B[k]))
    return v, f


def lathe(prof_rz, seg=48):
    """профиль [(r, z)] → rings"""
    return rings([(z, r, r) for (r, z) in prof_rz], seg)


def spline2d(pts, per=5):
    """сглаживание профиля сплайном Катмулла — Рома (проходит через все точки)"""
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        for s in range(per):
            t = s / per; t2 = t * t; t3 = t2 * t
            out.append(tuple(.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(tuple(pts[-1])); return out


def fillet(pts, rad, steps=5):
    """ломаная (r, z) со скруглением в вершинах (квадратичная кривая Безье от касательных точек); rad[i] = 0 — острый угол"""
    out = [tuple(pts[0])]
    for i in range(1, len(pts) - 1):
        A, B, C = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[i + 1]); r = rad[i]
        if r <= 1e-9: out.append(tuple(B)); continue
        la, lc = (A - B).length, (C - B).length; d = min(r, .45 * la, .45 * lc); T1 = B + (A - B) / la * d; T2 = B + (C - B) / lc * d
        for k in range(steps + 1): t = k / steps; q = T1 * (1 - t) ** 2 + B * (2 * t * (1 - t)) + T2 * t * t; out.append((q.x, q.y))
    out.append(tuple(pts[-1])); return out


def box_vf(x0, x1, y0, y1, z0, z1):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    return v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def basis_xf(origin, zaxis, upref=UP):
    """матрица: локальная Z → zaxis, локальная Y — как можно ближе к upref"""
    z = Vector(zaxis).normalized(); y = (Vector(upref) - z * Vector(upref).dot(z))
    if y.length < 1e-4: y = Vector((0, 1, 0)) - z * z.y
    y.normalize(); x = y.cross(z); m = Matrix(((x.x, y.x, z.x, origin[0]), (x.y, y.y, z.y, origin[1]), (x.z, y.z, z.z, origin[2]), (0, 0, 0, 1))); return m


def cyl_xf(p0, p1):
    d = Vector(p1) - Vector(p0); return Matrix.Translation(p0) @ UP.rotation_difference(d.normalized()).to_matrix().to_4x4(), d.length


def tube_obj(name, pts, r0, r1, mat, parent=None, res=3, kind='BEZIER'):
    """тонкая трубка по кривой (стебель, шея микрофона): pts — список Vector; Безье по контрольной ломаной через Катмулла — Рома, радиус плавно меняется"""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = res; cu.use_fill_caps = True; cu.resolution_u = 6
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], p[2], 1); sp.points[i].radius = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
    cu.materials.append(mat); ob = bpy.data.objects.new(name, cu); return link(ob, parent)


def bez(p0, p1, p2, p3, n):
    """точки кубической кривой Безье"""
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t; out.append(Vector(p0) * u ** 3 + Vector(p1) * 3 * u * u * t + Vector(p2) * 3 * u * t * t + Vector(p3) * t ** 3)
    return out


# ======================================================================================================================== материалы
def _new(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; return m, nt, nt.nodes['Principled BSDF']


def cached(name, build):
    m = bpy.data.materials.get(name)
    return m if m is not None else build(name)


def noise_n(nt, vec, scale, detail=5, rough=.55):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
    nt.links.new(vec, n.inputs['Vector']); return n.outputs['Fac']


def map_range(nt, val, a, b, lo=0.0, hi=1.0):
    r = nt.nodes.new('ShaderNodeMapRange'); r.inputs['From Min'].default_value = lo; r.inputs['From Max'].default_value = hi; r.inputs['To Min'].default_value = a; r.inputs['To Max'].default_value = b
    nt.links.new(val, r.inputs['Value']); return r.outputs['Result']


def ramp(nt, fac, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    while len(r.color_ramp.elements) < len(stops): r.color_ramp.elements.new(.5)
    for e, (p, c) in zip(r.color_ramp.elements, stops): e.position = p; e.color = (c[0], c[1], c[2], 1)
    nt.links.new(fac, r.inputs['Fac']); return r.outputs['Color']


def mixc(nt, a, b, fac, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
    if isinstance(fac, (int, float)): n.inputs['Factor'].default_value = fac
    else: nt.links.new(fac, n.inputs['Factor'])
    for k, x in (('A', a), ('B', b)):
        if isinstance(x, tuple): n.inputs[k].default_value = (x[0], x[1], x[2], 1)
        else: nt.links.new(x, n.inputs[k])
    return n.outputs['Result']


def mul(nt, a, b):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'
    for i, x in enumerate((a, b)):
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: nt.links.new(x, n.inputs[i])
    return n.outputs[0]


def m_chrome(name='aud_chrome'):
    """полированный хром с лёгким тёплым оттенком: почти зеркало, шероховатость чуть «дышит» (микроцарапины, отпечатки)"""
    def build(nm_):
        m, nt, b = _new(nm_); L = nt.links; tc = nt.nodes.new('ShaderNodeTexCoord')
        S(b, (.93, .895, .84, 1), 'Base Color'); S(b, 1.0, 'Metallic'); S(b, .55, 'Specular IOR Level', 'Specular')
        n = noise_n(nt, tc.outputs['Object'], 160.0, 6, .6); L.new(map_range(nt, n, .016, .045), b.inputs['Roughness'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .02; bp.inputs['Distance'].default_value = .0004; L.new(n, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
        return m
    return cached(name, build)


def m_tex(name, slug, scale, tint=(1, 1, 1), metal=False, bump=.15, rough_mul=1.0, coat=0.0, coat_rough=.03, rough_min=0.0, spec=.5):
    """материал из библиотеки CC0 (docs/TEXTURES.md): box-проекция по координатам объекта (UV не нужны), шероховатость и рельеф — из карт rough / disp"""
    def build(nm_):
        m, nt, b = _new(nm_); L = nt.links; N = nt.nodes; d = os.path.join(TEX, slug)
        tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale,) * 3; L.new(tc.outputs['Object'], mp.inputs['Vector'])
        def img(fn, cs):
            t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.get('aud_%s_%s' % (slug, fn)) or bpy.data.images.load(os.path.join(d, fn), check_existing=True); t.image.name = 'aud_%s_%s' % (slug, fn); t.image.colorspace_settings.name = cs
            t.projection = 'BOX'; t.projection_blend = .25; L.new(mp.outputs['Vector'], t.inputs['Vector']); return t
        L.new(mixc(nt, img('color.jpg', 'sRGB').outputs['Color'], tint, 1.0, 'MULTIPLY'), b.inputs['Base Color'])
        r = img('rough.jpg', 'Non-Color'); rr = mul(nt, r.outputs['Color'], rough_mul)
        if rough_min:
            mx = N.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = rough_min; L.new(rr, mx.inputs[0]); rr = mx.outputs[0]
        L.new(rr, b.inputs['Roughness'])
        dp = img('disp.jpg', 'Non-Color'); bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = .002; L.new(dp.outputs['Color'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
        if metal: L.new(img('metal.jpg', 'Non-Color').outputs['Color'], b.inputs['Metallic'])
        S(b, spec, 'Specular IOR Level', 'Specular')
        if coat: S(b, coat, 'Coat Weight', 'Clearcoat'); S(b, coat_rough, 'Coat Roughness', 'Clearcoat Roughness')
        return m
    return cached(name, build)


def m_marble():
    return m_tex('aud_marble', 'marble-white-warm', 1 / .85, tint=(1.0, .975, .93), bump=.12, rough_mul=.85, coat=.55, coat_rough=.025, rough_min=.05)


def m_brass(name='aud_brass'):
    """латунь «шампань»: текстура brass-brushed-pale, цвет притушен к #c9a96a (яркая жёлтая карта → тёплая шампань), браш виден в бликах"""
    return m_tex(name, 'brass-brushed-pale', 1 / .22, tint=(.62, .65, .75), metal=True, bump=.35, rough_mul=1.5, rough_min=.14, spec=.6)


def m_black_metal(name='aud_black_metal'):
    def build(nm_):
        m, nt, b = _new(nm_); tc = nt.nodes.new('ShaderNodeTexCoord'); S(b, (.014, .014, .016, 1), 'Base Color'); S(b, .85, 'Metallic'); S(b, .45, 'Specular IOR Level', 'Specular')
        n = noise_n(nt, tc.outputs['Object'], 400.0, 4); nt.links.new(map_range(nt, n, .30, .46), b.inputs['Roughness'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .08; bp.inputs['Distance'].default_value = .0003; nt.links.new(n, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal']); return m
    return cached(name, build)


def m_black_plastic(name='aud_black_plastic'):
    """чёрный матовый soft-touch пластик: микрошероховатость и мягкий ворсистый блик"""
    def build(nm_):
        m, nt, b = _new(nm_); tc = nt.nodes.new('ShaderNodeTexCoord'); S(b, (.016, .016, .017, 1), 'Base Color'); S(b, .5, 'Specular IOR Level', 'Specular'); S(b, .3, 'Sheen Weight', 'Sheen'); S(b, .5, 'Sheen Roughness')
        n = noise_n(nt, tc.outputs['Object'], 350.0, 4); nt.links.new(map_range(nt, n, .34, .52), b.inputs['Roughness'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .12; bp.inputs['Distance'].default_value = .0003; nt.links.new(n, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal']); return m
    return cached(name, build)


def m_black_glass(name='aud_black_glass'):
    """чёрное стекло флакона: глубокий цвет, плотный лаковый блик (отражения ниши видны чётко)"""
    def build(nm_):
        m, nt, b = _new(nm_); S(b, (.006, .006, .007, 1), 'Base Color'); S(b, .028, 'Roughness'); S(b, 1.52, 'IOR'); S(b, .45, 'Specular IOR Level', 'Specular'); S(b, .3, 'Coat Weight', 'Clearcoat'); S(b, .03, 'Coat Roughness', 'Clearcoat Roughness'); return m
    return cached(name, build)


def m_white(name='aud_white', rough=.22, coat=.4):
    """жемчужно-белый глянцевый пластик / опаловое стекло"""
    def build(nm_):
        m, nt, b = _new(nm_); S(b, (.90, .89, .86, 1), 'Base Color'); S(b, rough, 'Roughness'); S(b, coat, 'Coat Weight', 'Clearcoat'); S(b, .05, 'Coat Roughness', 'Clearcoat Roughness')
        S(b, .12, 'Subsurface Weight'); S(b, (.9, .82, .7), 'Subsurface Radius'); S(b, .004, 'Subsurface Scale'); S(b, .55, 'Specular IOR Level', 'Specular'); return m
    return cached(name, build)


def m_white_matte(name='aud_white_matte'):
    def build(nm_):
        m, nt, b = _new(nm_); tc = nt.nodes.new('ShaderNodeTexCoord'); S(b, (.88, .87, .84, 1), 'Base Color'); S(b, .3, 'Sheen Weight', 'Sheen'); S(b, .5, 'Sheen Roughness'); S(b, .4, 'Specular IOR Level', 'Specular')
        n = noise_n(nt, tc.outputs['Object'], 350.0, 4); nt.links.new(map_range(nt, n, .38, .54), b.inputs['Roughness']); return m
    return cached(name, build)


def m_rubber(name='aud_rubber'):
    def build(nm_):
        m, nt, b = _new(nm_); S(b, (.012, .012, .013, 1), 'Base Color'); S(b, .34, 'Roughness'); S(b, .55, 'Specular IOR Level', 'Specular'); S(b, .2, 'Sheen Weight', 'Sheen'); return m
    return cached(name, build)


def m_metal_simple(name, col, rough=.22):
    def build(nm_):
        m, nt, b = _new(nm_); S(b, (*col, 1), 'Base Color'); S(b, 1.0, 'Metallic'); S(b, rough, 'Roughness'); return m
    return cached(name, build)


def m_emit(name, col=(1.0, .80, .52), strength=5.0):
    def build(nm_):
        m, nt, b = _new(nm_); S(b, (.02, .02, .02, 1), 'Base Color'); S(b, (*col, 1), 'Emission Color', 'Emission'); S(b, strength, 'Emission Strength'); return m
    return cached(name, build)


def m_shelf_glass(name='aud_shelf_glass'):
    """полка из стекла 12 мм: преломление, тень проходит насквозь (Is Shadow Ray → прозрачный), в толще — поглощение, из-за чего торец зеленоватый (как у настоящего стекла)"""
    def build(nm_):
        m = bpy.data.materials.new(nm_); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
        out = N.new('ShaderNodeOutputMaterial'); pr = N.new('ShaderNodeBsdfPrincipled'); S(pr, (.93, .98, .96, 1), 'Base Color'); S(pr, .012, 'Roughness'); S(pr, 1.52, 'IOR'); S(pr, 1.0, 'Transmission Weight', 'Transmission')
        tr = N.new('ShaderNodeBsdfTransparent'); lp = N.new('ShaderNodeLightPath'); mx = N.new('ShaderNodeMixShader'); L.new(lp.outputs['Is Shadow Ray'], mx.inputs['Fac']); L.new(pr.outputs[0], mx.inputs[1]); L.new(tr.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs['Surface'])
        ab = N.new('ShaderNodeVolumeAbsorption'); ab.inputs['Color'].default_value = (.56, .93, .74, 1); ab.inputs['Density'].default_value = 14.0; L.new(ab.outputs[0], out.inputs['Volume']); return m
    return cached(name, build)


def m_stem(name='aud_stem'):
    def build(nm_):
        m, nt, b = _new(nm_); tc = nt.nodes.new('ShaderNodeTexCoord'); oi = nt.nodes.new('ShaderNodeObjectInfo')
        g = ramp(nt, oi.outputs['Random'], [(0, (.07, .17, .035)), (1, (.15, .29, .07))]); S(b, .5, 'Roughness'); S(b, .3, 'Specular IOR Level', 'Specular'); nt.links.new(g, b.inputs['Base Color'])
        n = noise_n(nt, tc.outputs['Object'], 120.0, 3); bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .2; bp.inputs['Distance'].default_value = .0005; nt.links.new(n, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal']); return m
    return cached(name, build)


def m_petal(name='aud_petal', cream=None, green=(.70, .79, .48), waxy=False):
    """лепесток: кремово-белый #f6f1e6, у основания едва зеленоватый, к кончику чуть светлее и теплее; у каждого цветка свой оттенок (Object Info → Random).
    Principled: Subsurface Weight .15 + малое пропускание, плюс Translucent на просвет (контровой свет); тонкая жилковка — Bump"""
    cream = cream or lin('#f6f1e6')
    def build(nm_):
        m, nt, b = _new(nm_); L = nt.links; N = nt.nodes; tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['UV'], sp.inputs[0]); V = sp.outputs['Y']; U = sp.outputs['X']
        oi = N.new('ShaderNodeObjectInfo'); rnd = oi.outputs['Random']
        base = ramp(nt, V, [(0.0, green), (.20, (cream[0] * .94, cream[1] * .96, cream[2] * .86)), (.55, cream), (1.0, (min(1, cream[0] * 1.03), cream[1] * 1.0, cream[2] * 1.02))])
        base = mixc(nt, base, (cream[0] * .97, cream[1] * 1.0, cream[2] * .90), map_range(nt, rnd, 0.0, .5), 'MIX')                                   # у части цветков чуть зеленее
        br = map_range(nt, rnd, .93, 1.035); bc = N.new('ShaderNodeCombineColor'); [L.new(br, bc.inputs[i]) for i in range(3)]; base = mixc(nt, base, bc.outputs[0], 1.0, 'MULTIPLY')
        L.new(base, b.inputs['Base Color']); S(b, .52 if not waxy else .34, 'Roughness'); S(b, .35, 'Specular IOR Level', 'Specular'); S(b, .15, 'Subsurface Weight'); S(b, (.95, .78, .55), 'Subsurface Radius'); S(b, .0035, 'Subsurface Scale')
        S(b, .06, 'Transmission Weight', 'Transmission'); S(b, 1.4, 'IOR'); S(b, .22, 'Sheen Weight', 'Sheen'); S(b, .5, 'Sheen Roughness')
        if waxy: S(b, .12, 'Coat Weight', 'Clearcoat'); S(b, .2, 'Coat Roughness', 'Clearcoat Roughness')
        wave = N.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 16.0; wave.inputs['Distortion'].default_value = 4.0; L.new(tc.outputs['UV'], wave.inputs['Vector'])
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .22; bp.inputs['Distance'].default_value = .0004; L.new(wave.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
        tr = N.new('ShaderNodeBsdfTranslucent'); L.new(mixc(nt, base, (1.0, .96, .85), .35), tr.inputs['Color']); mx = N.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = .26
        out = next(n for n in N if n.type == 'OUTPUT_MATERIAL'); L.new(b.outputs['BSDF'], mx.inputs[1]); L.new(tr.outputs['BSDF'], mx.inputs[2]); L.new(mx.outputs['Shader'], out.inputs['Surface']); return m
    return cached(name, build)


def m_eye(name='aud_floret_eye'):
    """центр цветка: едва заметный зелёно-жёлтый"""
    def build(nm_):
        m, nt, b = _new(nm_); oi = nt.nodes.new('ShaderNodeObjectInfo'); g = ramp(nt, oi.outputs['Random'], [(0, (.52, .64, .26)), (1, (.74, .80, .42))]); nt.links.new(g, b.inputs['Base Color']); S(b, .6, 'Roughness'); return m
    return cached(name, build)


def m_core(name='aud_head_core'):
    """«сердцевина» соцветия: тёмные зелёно-кремовые бутоны в просветах между цветками (даёт глубину, а не вату)"""
    def build(nm_):
        m, nt, b = _new(nm_); tc = nt.nodes.new('ShaderNodeTexCoord'); n = noise_n(nt, tc.outputs['Object'], 60.0, 4)
        nt.links.new(ramp(nt, n, [(.25, (.07, .105, .03)), (.75, (.22, .27, .11))]), b.inputs['Base Color']); S(b, .65, 'Roughness'); return m
    return cached(name, build)


def m_leaf(name, dark, light, silver=(.30, .42, .21)):
    return cached(name, lambda n_: RL.leaf_material(n_, dark, light, silver=silver))


# ======================================================================================================================== лепестки и цветы
def petal_vf(L, W, rows=5, cols=4, p=1.5, q=.6, cup=.3, bow=.3, curl=.1, wave=.1, ph=0.0, twist=0.0, tipw=.03):
    """лепесток: основание в (0,0,0), длина вдоль +Y, нормаль +Z. Полуширина w(t) = W·sin(π·t^p)^q (p > 1 — широкий округлый кончик, клин у основания); cup — края приподняты, bow — загиб вверх вдоль длины,
    curl — кончик заворачивается вниз, wave — волнистый край, twist — кручение. Возвращает (вершины, грани, uv)"""
    V = []; UV = []; F = []
    for i in range(rows + 1):
        t = i / rows; w = max(W * math.sin(math.pi * (t ** p)) ** q, W * tipw); y = L * t; zc = bow * L * t * t - curl * L * t ** 4
        for j in range(cols + 1):
            s = -1.0 + 2.0 * j / cols; x = s * w; z = zc + cup * w * s * s + wave * w * math.sin(t * 5.2 + ph + s * 1.4) * s * s + twist * w * s * math.sin(math.pi * t)
            V.append((x, y, z)); UV.append(((s + 1) / 2, t))
    for i in range(rows):
        for j in range(cols): a = i * (cols + 1) + j; F.append((a, a + 1, a + 1 + (cols + 1), a + (cols + 1)))
    return V, F, UV


def add_petal(mb, xf, mat=0, **kw):
    v, f, uv = petal_vf(**kw); mb.add(v, f, mat, xf, uv)


def floret_mesh(name, kind, seed, mats):
    """цветок: гортензия — 4 широких округлых чашелистика (≈ Ø 4.5 см), флокс — 5 лепестков с трубкой (≈ Ø 3 см); у каждого свой разброс углов, подъёма и волны; +точка центра и тонкая цветоножка.
    Ось Z — наружу из соцветия, цветоножка уходит в −Z"""
    rnd = random.Random(seed * 977 + 5); mb = MB(); hyd = kind == 'hyd'; n = 4 if hyd else 5
    L = .0215 if hyd else .0145; W = .0140 if hyd else .0094; r0 = .0021; rot0 = rnd.uniform(0, 6.283); lift = rnd.uniform(.20, .38) if hyd else rnd.uniform(.28, .50)
    for k in range(n):
        a = rot0 + k * 2 * math.pi / n + rnd.uniform(-.14, .14); Lk = L * rnd.uniform(.88, 1.1); Wk = W * rnd.uniform(.86, 1.1); lk = lift + (.07 if k % 2 else 0) + rnd.uniform(-.06, .06)
        xf = Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, r0, 0)) @ Matrix.Rotation(lk, 4, 'X')
        add_petal(mb, xf, 0, L=Lk, W=Wk, rows=5, cols=4, p=1.5 if hyd else 1.25, q=.6 if hyd else .55, cup=rnd.uniform(.22, .42), bow=rnd.uniform(.25, .5), curl=rnd.uniform(0, .22), wave=rnd.uniform(.05, .16), ph=rnd.uniform(0, 6.28), twist=rnd.uniform(-.2, .2))
    v, f = lathe(spline2d([(0.0, -.0004), (.0020, 0.0), (.0026, .0014), (.0018, .0026), (0.0, .0030)], 3), 8); mb.add(v, f, 1)
    v, f = rings([(-.020, .0010, .0010), (-.004, .0012, .0012), (0.0006, .0014, .0014)], 6); mb.add(v, f, 2)                                       # цветоножка (трубка у флокса видна мало)
    return mb.mesh(name, mats)


def orchid_mesh(name, seed, mats):
    """цветок фаленопсиса (≈ 10 см): два широких округлых лепестка, спинной и два боковых чашелистика (белые), губа с жёлтым зевом и боковыми долями, колонка; Z — нормаль цветка, Y — «верх»
    (губа смотрит вниз, в −Y). Цветоножка — в −Z"""
    rnd = random.Random(seed * 313 + 11); mb = MB(); R = lambda a: Matrix.Rotation(a, 4, 'Z')
    for sgn in (1, -1):                                                                                                                                   # два лепестка: широкие, почти круглые, слегка вперёд
        a = sgn * math.radians(80 + rnd.uniform(-6, 6)); xf = R(a) @ Matrix.Translation((0, .004, 0)) @ Matrix.Rotation(-.10 + rnd.uniform(-.04, .04), 4, 'X')
        add_petal(mb, xf, 0, L=.046, W=.0285, rows=7, cols=6, p=1.15, q=.52, cup=.34, bow=-.10, curl=-.02, wave=.10, ph=rnd.uniform(0, 6), twist=sgn * .10, tipw=.05)
    xf = R(rnd.uniform(-.06, .06)) @ Matrix.Translation((0, .004, -.001)) @ Matrix.Rotation(.22, 4, 'X')                                                  # спинной чашелистик
    add_petal(mb, xf, 0, L=.044, W=.0165, rows=6, cols=4, p=1.0, q=.62, cup=.45, bow=.25, curl=.12, wave=.06, ph=1.0)
    for sgn in (1, -1):                                                                                                                                   # боковые чашелистики — вниз по сторонам от губы
        a = math.pi + sgn * math.radians(41 + rnd.uniform(-4, 4)); xf = R(a) @ Matrix.Translation((0, .004, -.001)) @ Matrix.Rotation(.16, 4, 'X')
        add_petal(mb, xf, 0, L=.042, W=.0155, rows=6, cols=4, p=1.0, q=.62, cup=.42, bow=.2, curl=.10, wave=.06, ph=sgn * 2.0)
    xf = R(math.pi) @ Matrix.Translation((0, .003, .0015)) @ Matrix.Rotation(.20, 4, 'X')                                                                  # губа (спинка и жёлтый зев)
    add_petal(mb, xf, 1, L=.028, W=.0090, rows=6, cols=4, p=.85, q=.7, cup=1.1, bow=.55, curl=.3, wave=.12, ph=.5, tipw=.12)
    for sgn in (1, -1):
        a = math.pi + sgn * math.radians(62); xf = R(a) @ Matrix.Translation((0, .0025, .002)) @ Matrix.Rotation(.75, 4, 'X')
        add_petal(mb, xf, 1, L=.0135, W=.0055, rows=4, cols=4, p=1.0, q=.7, cup=1.0, bow=.4, curl=.2, wave=.05, ph=sgn)
    v, f = lathe(spline2d([(0.0, -.002), (.0042, 0.0), (.0050, .005), (.0030, .0105), (.0010, .0125), (0.0, .0128)], 3), 12)
    mb.add(v, f, 0, Matrix.Translation((0, .006, .004)) @ Matrix.Rotation(-.55, 4, 'X'))                                                                    # колонка над губой
    v, f = rings([(-.034, .0016, .0016), (-.012, .0022, .0022), (.0006, .0026, .0026)], 6); mb.add(v, f, 2)                                                    # цветоножка
    return mb.mesh(name, mats)


def pool(prefix, count, kind, maker):
    """набор общих мешей цветка (создаётся один раз); связанные копии объектов делят эту геометрию"""
    out = []
    for i in range(count):
        me = bpy.data.meshes.get('aud_%s_%d' % (prefix, i)) or maker('aud_%s_%d' % (prefix, i), kind, i + 1)
        out.append(me)
    return out


def hyd_pool():
    mats = [m_petal(), m_eye(), m_stem()]
    return pool('hyd', 6, 'hyd', lambda n, k, s: floret_mesh(n, k, s, mats))


def phlox_pool():
    mats = [m_petal(), m_eye(), m_stem()]
    return pool('phlox', 4, 'phlox', lambda n, k, s: floret_mesh(n, k, s, mats))


def fib_sphere(n):
    ga = math.pi * (3 - math.sqrt(5)); out = []
    for i in range(n): z = 1 - 2 * (i + .5) / n; r = math.sqrt(max(0.0, 1 - z * z)); a = ga * i; out.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    return out


def sphere_core(name, R, mat, rnd):
    v, f = rings([(-R * math.cos(math.pi * i / 14), R * math.sin(math.pi * i / 14) if 0 < i < 14 else 0.0, R * math.sin(math.pi * i / 14) if 0 < i < 14 else 0.0) for i in range(15)], 20)
    s0 = rnd.uniform(0, 50); v = [(x * (1 + .06 * math.sin(s0 + z * 30 + y * 17)), y * (1 + .06 * math.cos(s0 + x * 21)), z) for (x, y, z) in v]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); me.materials.append(mat); smooth(me); return me


def floret_head(root, rnd, pl, c, R, nflo, size, axis_scale, tag, hemi=-.45, layers=2):
    """шаровидное соцветие: ядро + цветки на сфере (числа Фибоначчи со случайным сдвигом), каждый смотрит наружу, ±наклон; второй слой глубже и мельче заполняет просветы"""
    core_m = m_core(); core = bpy.data.objects.new(nm(tag, 'core'), sphere_core(nm(tag, 'coreMesh'), R * .70, core_m, rnd)); core.location = c; core.scale = axis_scale; link(core, root)
    cnt = 0
    for layer in range(layers):
        rr0 = R * (1.0 if layer == 0 else .87); n = nflo if layer == 0 else int(nflo * .5); sc0 = size * (1.0 if layer == 0 else .82)
        for d in fib_sphere(n):
            if d.z < hemi: continue
            if rnd.random() < .035: continue                                                                                                                 # редкие «дырки»: не все цветки распустились
            d = (d + Vector((rnd.gauss(0, .07), rnd.gauss(0, .07), rnd.gauss(0, .07)))).normalized(); rr = rr0 * (1 + rnd.uniform(-.07, .06))
            pos = c + Vector((d.x * axis_scale[0], d.y * axis_scale[1], d.z * axis_scale[2])) * rr
            nrm = (d + Vector((rnd.gauss(0, .16), rnd.gauss(0, .16), rnd.gauss(0, .16)))).normalized()
            q = UP.rotation_difference(nrm) @ Quaternion((0, 0, 1), rnd.uniform(0, 6.283)); sc = sc0 * rnd.uniform(.86, 1.16)
            ob = bpy.data.objects.new('%s_f%d' % (nm(tag), cnt), rnd.choice(pl)); ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = q; ob.location = pos; ob.scale = (sc, sc, sc); link(ob, root); cnt += 1
    return cnt


def head_layout(rnd, n_hyd, n_phl, C, A, B):
    """центры соцветий на полуэллипсоиде-куполе (a = A по горизонтали, b = B по вертикали): равномерно по высоте + золотой угол, затем «расталкивание», чтобы они касались, а не сливались"""
    N = n_hyd + n_phl; ze = math.sin(math.radians(6)); pts = []; ga = math.pi * (3 - math.sqrt(5)); a0 = rnd.uniform(0, 6.28)
    for i in range(N):
        z = 1 - (i + .5) / N * (1 - ze); r = math.sqrt(1 - z * z); az = a0 + ga * i; pts.append(Vector((A * 1.06 * r * math.cos(az), A * .94 * r * math.sin(az), B * z)))
    low = sorted(range(N), key=lambda i: pts[i].z)[:max(1, int(N * .6))]; phl = set(rnd.sample(low, n_phl)) if n_phl else set()
    Rd = [(.062 + rnd.uniform(-.006, .008)) if i in phl else (.095 + .022 * (pts[i].z / B) + rnd.uniform(-.008, .008)) for i in range(N)]
    for it in range(60):
        for i in range(N):
            for j in range(i + 1, N):
                dv = pts[j] - pts[i]; dd = dv.length; want = (Rd[i] + Rd[j]) * .92
                if 1e-6 < dd < want: push = dv / dd * (want - dd) * .35; pts[i] -= push; pts[j] += push
        for i in range(N):
            p = pts[i]; k = math.sqrt((p.x / A) ** 2 + (p.y / A) ** 2 + (p.z / B) ** 2); p = p / max(k, 1e-6); p.z = max(p.z, B * ze); pts[i] = p
    return [(C + pts[i], Rd[i], i in phl) for i in range(N)]


def orchid_leaf_mesh(L, W, seed, mat):
    me = RL.leaf_mesh(L, W, seed, 'ficus'); me.materials.append(mat); return me


# ======================================================================================================================== 1. ваза с цветами
def amphora_mesh(name, mat):
    """амфора h .55 м: низкая ножка, талия, шарообразное тулово (Ø ≈ .40), плечи, узкое горло, отогнутый венчик; стенка с внутренней поверхностью (в горло ставятся стебли)"""
    outer = [(0.0, 0.0), (.082, 0.0), (.092, .006), (.088, .017), (.066, .030), (.056, .046), (.067, .072), (.110, .118), (.158, .180), (.186, .240), (.187, .292), (.166, .342), (.126, .392), (.091, .434), (.074, .470), (.076, .506), (.098, .534), (.122, .548), (.128, .553)]
    inner = [(.124, .5565), (.119, .5545), (.112, .546), (.091, .522), (.070, .492), (.0655, .45), (.075, .40), (.0, .385)]
    pr = spline2d(outer, 5) + [(.1285, .5555)] + inner[:3] + spline2d(inner[3:], 4)
    pr = [(max(r, 0.0), z) for (r, z) in pr]; v, f = lathe(pr, 112); me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); me.materials.append(mat); smooth(me); return me


def chrome_vase_with_flowers(name, loc, scale=1.0, seed=1, collection=None):
    """большая хромированная амфора и купол из белой гортензии и флокса (≈ .75 м высотой над горлом, .9 м шириной); возвращает [корень]; центр основания вазы = loc"""
    prev = _COLL[0]; _COLL[0] = collection or prev; t0 = time.time()
    try:
        rnd = random.Random(seed * 7919 + 31); bq = float(os.environ.get('BQ', 1.0)); root = empty(name, loc, scale=scale); root['aud_kind'] = 'vase'
        link(bpy.data.objects.new(nm(name, 'vase'), amphora_mesh(nm(name, 'vaseMesh'), m_chrome())), root)
        hp = hyd_pool(); pp = phlox_pool(); stem = m_stem(); C = Vector((0, 0, .64)); A = .318; B = .56
        C = C + Vector((rnd.uniform(-.03, .03), rnd.uniform(-.03, .03), 0)); A = A * rnd.uniform(.96, 1.06); heads = head_layout(rnd, 20, 8, C, A, B); nfl = 0
        for i, (c, R, phl) in enumerate(heads):
            ax = (1 + rnd.uniform(-.06, .08), 1 + rnd.uniform(-.06, .08), (.9 if not phl else .82) + rnd.uniform(-.05, .06))                                    # соцветия слегка приплюснуты и неодинаковы
            if rnd.random() < .5: c = c + (c - C).normalized() * rnd.uniform(.0, .035)
            nfl += floret_head(root, rnd, pp if phl else hp, c, R, int((125 if phl else 175) * bq), .98 if phl else 1.08, ax, '%s_h%d' % (name, i), layers=2 if not phl else 2)
            mouth = Vector((c.x * .16 + rnd.gauss(0, .015), c.y * .16 + rnd.gauss(0, .015), .47)); dirc = (c - mouth).normalized()                                       # стебель из пучка в горле к центру соцветия
            pts = bez(mouth, mouth + Vector((c.x * .08, c.y * .08, .22)), c - dirc * .16, c, 8)
            tube_obj(nm(name, 'stem%d' % i), pts, .0052, .0045, stem, root, 2)
        for j in range(3):                                                                                                                                   # «выбившиеся» мелкие соцветия на длинных стеблях по краю купола
            az = rnd.uniform(0, 6.28); e = math.radians(rnd.uniform(14, 30)); c = C + Vector((math.cos(az) * math.cos(e) * (A + .085), math.sin(az) * math.cos(e) * (A + .085), math.sin(e) * (B + .02) * .85)); R = .052
            nfl += floret_head(root, rnd, pp, c, R, int(70 * bq), .90, (1, 1, 1), '%s_w%d' % (name, j), layers=1)
            mouth = Vector((c.x * .1, c.y * .1, .48)); dirc = (c - mouth).normalized(); tube_obj(nm(name, 'wild%d' % j), bez(mouth, mouth + Vector((c.x * .1, c.y * .1, .2)), c - dirc * .2, c, 8), .0042, .0036, stem, root, 2)
        build_leaves(root, rnd, name, C, A, B)
        print('  %s: соцветий %d, цветков (экземпляров) %d, %.1f с' % (name, len(heads) + 3, nfl, time.time() - t0), flush=True)
        return [root]
    finally:
        _COLL[0] = prev


def build_leaves(root, rnd, name, C, A, B):
    """тёмно-зелёные листья гортензии: из горловины у ободка вазы (свисают над краем) и из купола между соцветиями; черешок — общий короткий цилиндр"""
    ma = m_leaf('aud_leaf_h1', (.012, .055, .014), (.045, .135, .035)); mb_ = m_leaf('aud_leaf_h2', (.020, .075, .020), (.060, .170, .042))
    lv = []
    for i in range(9):
        me = RL.leaf_mesh(.15 * (.86 + .3 * ((i * 37) % 7) / 6.0), .050 * (.9 + .2 * ((i * 53) % 5) / 4.0), seed=i + 3, kind='ficus'); me.materials.append(ma if i % 2 == 0 else mb_); lv.append(me)
    pet = bpy.data.meshes.get('aud_petiole')
    if pet is None:
        mb = MB(); mb.rings([(0.0, .0026, .0026), (.03, .0022, .0022), (.0505, .0018, .0018)], 7, 0, Matrix.Rotation(-math.pi / 2, 4, 'X')); pet = mb.mesh('aud_petiole', [m_stem()])
    specs = []
    for i in range(16):                                                                                                                                      # нижний ярус: вокруг горла, лист вниз-наружу
        az = i * 2 * math.pi / 16 + rnd.uniform(-.2, .2); r = rnd.uniform(.07, .115); p = Vector((math.cos(az) * r, math.sin(az) * r, rnd.uniform(.52, .60)))
        dv = Vector((math.cos(az), math.sin(az), rnd.uniform(-.34, .05))); specs.append((p, dv, 1.15))
    for i in range(34):                                                                                                                                      # в куполе: между соцветиями, ближе к низу
        az = rnd.uniform(0, 6.283); e = math.radians(rnd.uniform(-2, 52)); k = rnd.uniform(.80, .96)
        p = C + Vector((A * k * math.cos(e) * math.cos(az), A * k * math.cos(e) * math.sin(az), B * k * math.sin(e)))
        dv = Vector((math.cos(az), math.sin(az), rnd.uniform(-.25, .35))); specs.append((p, dv, rnd.uniform(.85, 1.1)))
    for i, (p, dv, k) in enumerate(specs):
        dv = dv.normalized(); lf = bpy.data.objects.new('%s_leaf%d' % (nm(name), i), rnd.choice(lv)); lf.scale = (k, k, k); link(lf, root); lf.location = p + dv * .05 * k
        RL.orient(lf, dv, rnd, .6, RL.tint_for(rnd.random() * .6, rnd))
        pt = bpy.data.objects.new('%s_pet%d' % (nm(name), i), pet); pt.rotation_mode = 'QUATERNION'; pt.rotation_quaternion = dv.to_track_quat('Y', 'Z'); pt.location = p; pt.scale = (k, k, k); link(pt, root)


# ======================================================================================================================== 2. ваза с орхидеями
def orchid_vase(name, loc, seed=2, collection=None):
    """малая стройная ваза-цилиндр (h .38 м) из хрома и две изогнутые ветки белого фаленопсиса (6 и 5 цветков + бутоны), листья у горла; возвращает [корень]"""
    prev = _COLL[0]; _COLL[0] = collection or prev
    try:
        rnd = random.Random(seed * 4421 + 3); root = empty(name, loc); root['aud_kind'] = 'orchid'
        pr = fillet([(0.0, 0.0), (.046, 0.0), (.0575, .38), (.0525, .38), (.0475, .035), (0.0, .035)], [0, .006, .0015, .0015, .003, 0], 5)
        me = bpy.data.meshes.new(nm(name, 'vaseMesh')); v, f = lathe(pr, 96); me.from_pydata(v, [], f); me.update(); me.materials.append(m_chrome()); smooth(me)
        link(bpy.data.objects.new(nm(name, 'vase'), me), root)
        mats = [m_petal('aud_orchid_petal', cream=lin('#f7f4ee'), green=(.78, .86, .62), waxy=True), m_orchid_lip(), m_stem()]; om = [orchid_mesh('aud_orchid_%d' % i, i + 1, mats) for i in range(4)] if not bpy.data.meshes.get('aud_orchid_0') else [bpy.data.meshes['aud_orchid_%d' % i] for i in range(4)]
        stem = m_stem('aud_spike')
        branches = [dict(P=[(.002, 0, .30), (.018, .004, .62), (.205, .012, .84), (.395, .03, .66)], n=6, ts=(.30, .42, .55, .68, .81, .93), bud=3, sz=1.0),
                    dict(P=[(-.002, 0, .30), (-.030, .012, .56), (-.150, .018, .66), (-.285, .02, .52)], n=5, ts=(.36, .50, .64, .78, .91), bud=2, sz=.93)]
        for bi, br in enumerate(branches):
            P = [Vector(p) for p in br['P']]; tube_obj(nm(name, 'spike%d' % bi), bez(*P, 24), .0036, .0022, stem, root, 3)
            for k, t in enumerate(br['ts']):
                u = 1 - t; pos = P[0] * u ** 3 + P[1] * 3 * u * u * t + P[2] * 3 * u * t * t + P[3] * t ** 3; side = 1 if k % 2 == 0 else -1
                n = Vector((side * .52 + rnd.uniform(-.1, .1), -.83 + rnd.uniform(-.06, .06), .10 - .22 * t + rnd.uniform(-.05, .05))).normalized(); sz = 1.3 * br['sz'] * (1.0 - .46 * t ** 1.3) * rnd.uniform(.94, 1.06)
                xf = basis_xf(pos + n * .034 * sz, n); xf = xf @ Matrix.Scale(sz, 4) @ Matrix.Rotation(rnd.uniform(-.12, .12), 4, 'Z')
                ob = bpy.data.objects.new('%s_fl%d_%d' % (nm(name), bi, k), rnd.choice(om)); link(ob, root); ob.matrix_basis = xf
            for k in range(br['bud']):                                                                                                                          # бутоны на конце ветки
                t = min(1.0, br['ts'][-1] + .07 + k * .055); u = 1 - t; pos = P[0] * u ** 3 + P[1] * 3 * u * u * t + P[2] * 3 * u * t * t + P[3] * t ** 3 + (Vector((0, -.012 * (k % 2 * 2 - 1), -.004)))
                bm = MB(); r_ = .0095 - k * .0015; bm.rings([(-r_ * 1.5, 0, 0), (-r_ * 1.0, r_ * .75, r_ * .75), (0.0, r_, r_), (r_ * 1.2, r_ * .6, r_ * .6), (r_ * 2.0, 0, 0)], 10)
                tt = bez(P[0], P[1], P[2], P[3], 24); tg = (tt[min(24, int(t * 24) + 1)] - tt[max(0, int(t * 24) - 1)]).normalized()
                bob = bpy.data.objects.new('%s_bud%d_%d' % (nm(name), bi, k), bm.mesh('aud_bud_%s_%d_%d' % (name, bi, k), [mats[0]])); bob.matrix_basis = basis_xf(pos + Vector((0, -.006, .004)), tg + Vector((0, -.5, -.2))); link(bob, root)
        lm = m_leaf('aud_orchid_leaf', (.020, .075, .022), (.060, .185, .050), silver=(.42, .56, .34)); lm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .46
        for i in range(4):
            az = math.radians([-100, -10, 80, 168][i] + rnd.uniform(-18, 18)); L = rnd.uniform(.26, .33); me = orchid_leaf_mesh(L, .048, i + 20, lm); dv = Vector((math.cos(az), math.sin(az), rnd.uniform(.38, .75)))
            lf = bpy.data.objects.new('%s_leaf%d' % (nm(name), i), me); link(lf, root); lf.location = (math.cos(az) * .03, math.sin(az) * .03, .355); RL.orient(lf, dv, rnd, .35, RL.tint_for(.2, rnd))
        return [root]
    finally:
        _COLL[0] = prev


def m_orchid_lip(name='aud_orchid_lip'):
    def build(nm_):
        m, nt, b = _new(nm_); L = nt.links; tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['UV'], sp.inputs[0])
        L.new(ramp(nt, sp.outputs['Y'], [(0.0, (.98, .78, .22)), (.35, (.97, .86, .55)), (1.0, (.93, .90, .84))]), b.inputs['Base Color']); S(b, .38, 'Roughness'); S(b, .2, 'Subsurface Weight'); S(b, .004, 'Subsurface Scale'); return m
    return cached(name, build)


# ======================================================================================================================== 3. кафедра
def svg_shapes():
    """знак «Астреи» из оригинального SVG: контуры (кусочно-кубические Безье → ломаные) в плоскости, y вверх, центр габарита в (0,0), высота = 1"""
    txt = open(SVG_MARK, encoding='utf-8').read(); tx, ty = [float(x) for x in re.search(r'translate\(([-\d.]+)[ ,]+([-\d.]+)\)', txt).groups()]; polys = []
    for d in re.findall(r'<path[^>]* d="([^"]+)"', txt):
        tok = re.findall(r'[MLCZ]|-?\d*\.?\d+', d); i = 0; cmd = None; cur = None; poly = []
        while i < len(tok):
            if tok[i] in 'MLCZ': cmd = tok[i]; i += 1
            if cmd == 'Z':
                if len(poly) > 2: polys.append(poly)
                poly = []; continue
            if cmd in 'ML': cur = (float(tok[i]), float(tok[i + 1])); i += 2; poly.append(cur)
            elif cmd == 'C':
                c1 = (float(tok[i]), float(tok[i + 1])); c2 = (float(tok[i + 2]), float(tok[i + 3])); p = (float(tok[i + 4]), float(tok[i + 5])); i += 6
                for k in range(1, 9):
                    t = k / 8; u = 1 - t; poly.append(tuple(u ** 3 * cur[a] + 3 * u * u * t * c1[a] + 3 * u * t * t * c2[a] + t ** 3 * p[a] for a in (0, 1)))
                cur = p
    for cx, cy, r in re.findall(r'<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"', txt):
        cx, cy, r = float(cx), float(cy), float(r); polys.append([(cx + r * math.cos(a * math.pi / 32), cy + r * math.sin(a * math.pi / 32)) for a in range(64)])
    polys = [[(x + tx, -(y + ty)) for (x, y) in p] for p in polys]
    xs = [p[0] for pl in polys for p in pl]; ys = [p[1] for pl in polys for p in pl]; cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2; h = max(ys) - min(ys)
    return [[((x - cx) / h, (y - cy) / h) for (x, y) in p] for p in polys]


def brass_sign(height, depth, mat):
    """латунный знак: каждый контур — выдавленная плита (низ z = 0, лицо z = depth) с фаской"""
    mb = MB()
    for poly in svg_shapes():
        pts = [(x * height, y * height) for (x, y) in poly]; area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area < 0: pts = pts[::-1]
        n = len(pts); tris = geometry.tessellate_polygon([[Vector((x, y, 0)) for (x, y) in pts]]); tt = []
        for (a, b, c) in tris:
            if (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]) < 0: b, c = c, b
            tt.append((a, b, c))
        v = [(x, y, 0) for (x, y) in pts] + [(x, y, depth) for (x, y) in pts]; f = [(a + n, b + n, c + n) for (a, b, c) in tt] + [(c, b, a) for (a, b, c) in tt]
        f += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]; mb.add(v, f, 0)
    me = mb.mesh('aud_sign_mesh', [mat], sm=False); return me


def lectern(name, loc, yaw=0.0, collection=None):
    """кафедра: трапециевидный корпус из белого мрамора 1.1 × .7 × .5 м (верх шире низа), скошенная наклонная столешница (на фасаде 1.1 м, к докладчику — .1 ниже), латунный цоколь, кант и знак «Астреи» ≈ .16 м;
    микрофон на гусиной шее (h ≈ .38 м над столешницей) и лампа-ридер. Фасад — в −Y при yaw = 0. Возвращает [корень]"""
    prev = _COLL[0]; _COLL[0] = collection or prev
    try:
        root = empty(name, loc, (0, 0, yaw)); root['aud_kind'] = 'lectern'; marble = m_marble(); brass = m_brass(); bm = m_black_metal(); zb = .075; zf = 1.10; zk = 1.00
        wt, dt, wb, db = .35, .25, .27, .185                                                                                                                  # полуширины и полуглубины: верх .70 × .50, низ .54 × .37
        V = [(-wb, -db, zb), (wb, -db, zb), (wb, db, zb), (-wb, db, zb), (-wt, -dt, zf), (wt, -dt, zf), (wt, dt, zk), (-wt, dt, zk)]
        F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        me = bpy.data.meshes.new(nm(name, 'bodyMesh')); me.from_pydata(V, [], F); me.update(); me.materials.append(marble); smooth(me)
        body = link(bpy.data.objects.new(nm(name, 'body'), me), root); bevel(body, .009, 3, 30)
        def zfront(y): return zf + (zk - zf) * (y + dt) / (2 * dt)                                                                                            # высота столешницы на глубине y
        mb = MB(); v, f = box_vf(-wb + .014, wb - .014, -db + .012, db - .012, 0.0, zb + .004); mb.add(v, f, 0)
        plinth = link(bpy.data.objects.new(nm(name, 'plinth'), mb.mesh(nm(name, 'plinthMesh'), [brass], sm=False)), root); bevel(plinth, .004, 2)                # цоколь-«утопление»
        def rod(p0, p1, r, mat, tag):
            xf, ln = cyl_xf(p0, p1); mb2 = MB(); mb2.rings([(0, 0, 0), (0, r, r), (ln, r, r), (ln, 0, 0)], 10, 0, xf); ob = bpy.data.objects.new(nm(name, tag), mb2.mesh(nm(name, tag + 'M'), [mat])); return link(ob, root)
        ofs = Vector((0, 0, 0)); c = [Vector(p) for p in V[4:]]; b_ = [Vector(p) for p in V[:4]]
        for i in (0, 1):                                                                                                                                       # латунный кант: передние рёбра и периметр столешницы
            rod(b_[i] + Vector((0, -.002, 0)), c[i] + Vector((0, -.002, 0)), .0042, brass, 'edgeF%d' % i)
        for a_, b2 in ((0, 1), (1, 2), (2, 3), (3, 0)): rod(c[a_] + Vector((0, 0, .001)), c[b2] + Vector((0, 0, .001)), .0042, brass, 'top%d' % a_)
        for i in (2, 3): rod(b_[i], c[i], .0036, brass, 'edgeB%d' % i)
        fl = (c[0] - b_[0]); up = fl.normalized(); nrm = Vector((1, 0, 0)).cross(up).normalized()                                                              # плоскость фасада: локальная Z знака — наружу
        zs = .60; ys_ = -(db + (dt - db) * (zs - zb) / (zf - zb))
        sign = bpy.data.objects.new(nm(name, 'sign'), brass_sign(.165, .0045, brass)); link(sign, root); sign.matrix_basis = basis_xf((0, ys_ - .0006, zs), nrm, up); bevel(sign, .0007, 2, 40)
        for dz in (-1, 1):                                                                                                                                      # тонкая латунная рамка-инкрустация на фасаде
            zz = (.20 if dz < 0 else .98); yy = -(db + (dt - db) * (zz - zb) / (zf - zb)) - .0004; wh = wb + (wt - wb) * (zz - zb) / (zf - zb) - .06
            rod((-wh, yy, zz), (wh, yy, zz), .0016, brass, 'line%d' % (dz > 0))
        zt = zfront(.08)                                                                                                                                        # микрофон на столешнице, левее оси
        mic_at = Vector((-.115, .075, zfront(.075) + .0)); tilt = math.atan2(zf - zk, 2 * dt)
        mb = MB(); mb.rings([(0, 0, 0), (0, .031, .031), (.006, .033, .033), (.016, .028, .028), (.020, .020, .020), (.020, 0, 0)], 24); base = bpy.data.objects.new(nm(name, 'micBase'), mb.mesh(nm(name, 'micBaseM'), [bm])); link(base, root)
        base.location = mic_at + Vector((0, 0, -.004)); base.rotation_euler = (-tilt, 0, 0); bevel(base, .002, 2)
        neck = [mic_at + Vector(p) for p in bez((0, 0, .016), (0, 0, .20), (0, .035, .295), (0, .098, .335), 14)]; tube_obj(nm(name, 'micNeck'), neck, .0052, .0040, bm, root, 4)
        rod(mic_at + Vector((0, 0, .012)), mic_at + Vector((0, 0, .075)), .0085, m_metal_simple('aud_chrome_dim', (.62, .60, .58), .25), 'micSleeve')
        tg = (neck[-1] - neck[-3]).normalized(); mh = MB(); mh.rings([(-.006, 0, 0), (-.005, .012, .012), (.002, .0145, .0145), (.058, .0145, .0145), (.073, .0120, .0120), (.082, .007, .007), (.085, 0, 0)], 28)
        head = bpy.data.objects.new(nm(name, 'micHead'), mh.mesh(nm(name, 'micHeadM'), [bm])); link(head, root); head.matrix_basis = basis_xf(neck[-1] - tg * .004, tg + Vector((0, .0, .12)), UP)
        lamp_at = Vector((.235, .085, zfront(.085))); mb = MB(); mb.rings([(0, 0, 0), (0, .030, .030), (.005, .032, .032), (.014, .026, .026), (.018, .018, .018), (.018, 0, 0)], 24); lb = bpy.data.objects.new(nm(name, 'lampBase'), mb.mesh(nm(name, 'lampBaseM'), [bm])); link(lb, root)
        lb.location = lamp_at + Vector((0, 0, -.004)); lb.rotation_euler = (-tilt, 0, 0); bevel(lb, .0018, 2)
        ln = [lamp_at + Vector(p) for p in bez((0, 0, .014), (0, 0, .16), (-.01, 0, .26), (-.085, 0, .255), 14)]; tube_obj(nm(name, 'lampNeck'), ln, .0032, .0028, bm, root, 3)
        ax = Vector((-.28, 0, -1.0)).normalized()
        sh = MB(); sh.rings([(-.052, 0, 0), (-.050, .0130, .0130), (-.020, .0200, .0200), (.006, .043, .043), (.008, .0435, .0435), (.004, .0425, .0425), (-.018, .0185, .0185), (-.046, .0105, .0105), (-.048, 0, 0)], 32)
        shade = bpy.data.objects.new(nm(name, 'lampShade'), sh.mesh(nm(name, 'lampShadeM'), [brass])); link(shade, root); shade.matrix_basis = basis_xf(ln[-1] + ax * .050, ax, Vector((0, 1, 0))); bevel(shade, .0008, 1, 50)
        bulb = MB(); bulb.rings([(0, 0, 0), (0, .034, .034), (.0006, 0, 0)], 24); bo = bpy.data.objects.new(nm(name, 'lampGlow'), bulb.mesh(nm(name, 'lampGlowM'), [m_emit('aud_lamp_glow', (1.0, .78, .48), 14.0)]))
        link(bo, root); bo.matrix_basis = basis_xf(ln[-1] + ax * .052, ax, Vector((0, 1, 0)))
        return [root]
    finally:
        _COLL[0] = prev


# ======================================================================================================================== 4. стеклянные полки с флаконами
def bottle_pump(rnd, H, R, kind):
    """флакон с помпой: корпус со скруглёнными плечами и толстым дном, широкое горло с кольцом, шток и крупная головка-распылитель с носиком (повёрнута случайно)"""
    mb = MB(); hb = H * .68; rn = R * .46; GLASS, CAP, ACC = 0, 1, 2
    body = fillet([(0.0, 0.0), (R * .96, 0.0), (R, hb * .08), (R, hb * .84), (rn * 1.08, hb + R * .30), (rn, hb + H * .045), (0.0, hb + H * .045)], [0, R * .12, 0, R * .55, R * .5, 0, 0], 5)
    v, f = lathe(body, 56); mb.add(v, f, GLASS)
    zc = hb + H * .03; v, f = lathe(fillet([(rn * 1.0, zc), (rn * 1.28, zc), (rn * 1.28, zc + H * .06), (rn * 1.0, zc + H * .06)], [0, R * .03, R * .03, 0], 3), 32); mb.add(v, f, ACC)
    zt = zc + H * .06; v, f = lathe([(rn * .26, zt), (rn * .26, zt + H * .055)], 10); mb.add(v, f, ACC)
    zh = zt + H * .055; hr = rn * 1.05; yaw = rnd.uniform(0, 6.28)
    v, f = lathe(fillet([(0.0, zh), (hr, zh), (hr, zh + H * .075), (hr * .55, zh + H * .095), (0.0, zh + H * .095)], [0, R * .03, R * .08, R * .08, 0], 4), 32); mb.add(v, f, CAP)
    xf = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Translation((hr * .4, 0, zh + H * .05)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'); mb.rings([(0.0, hr * .30, hr * .30), (hr * 1.7, hr * .28, hr * .28), (hr * 1.85, hr * .14, hr * .14), (hr * 1.86, 0, 0)], 16, CAP, xf)
    return mb


def bottle_jar(rnd, H, R):
    """баночка: толстостенное тело с тёмным дном и крышка с фаской"""
    mb = MB(); hb = H * .62; v, f = lathe(fillet([(0.0, 0.0), (R * .96, 0.0), (R, hb * .12), (R, hb), (R * .96, hb), (0.0, hb)], [0, R * .1, 0, R * .04, 0, 0], 4), 56); mb.add(v, f, 0)
    v, f = lathe(fillet([(0.0, hb * .98), (R * 1.03, hb * .98), (R * 1.03, H), (0.0, H)], [0, R * .02, R * .06, 0], 4), 56); mb.add(v, f, 1)
    return mb


def bottle_tube(rnd, H, R):
    """туба на крышке: круглая у крышки, к запаянному краю сплющивается в плоский «гребень»"""
    mb = MB(); hc = H * .12
    v, f = rings([(0.0, 0, 0), (0.0, R * .78, R * .78), (hc * .08, R * .86, R * .86), (hc, R * .86, R * .86)], 40); mb.add(v, f, 1)
    pr2 = [(hc, R * .86, R * .86), (hc + H * .03, R * .99, R * .99)]; steps = 12
    for i in range(1, steps + 1):
        t = i / steps; pr2.append((hc + H * .03 + (H * .94 - hc - H * .03) * t, R * (1.0 + .18 * t ** 2), R * max(.07, 1.0 - t ** 1.7 * .95)))
    pr2 += [(H * .985, R * 1.2, R * .05), (H, R * 1.15, R * .03), (H, 0.0, 0.0)]; v, f = rings(pr2, 40); mb.add(v, f, 0); return mb


def bottle_dropper(rnd, H, R):
    """флакон-капельница: плечи, горло с кольцом и резиновая груша"""
    mb = MB(); hb = H * .58; rn = R * .45
    body = fillet([(0.0, 0.0), (R * .95, 0.0), (R, hb * .08), (R, hb * .80), (rn, hb + R * .3), (rn, hb + H * .04), (0.0, hb + H * .04)], [0, R * .14, 0, R * .5, R * .4, 0, 0], 5); v, f = lathe(body, 48); mb.add(v, f, 0)
    zc = hb + H * .02; v, f = lathe(fillet([(rn * 1.0, zc), (rn * 1.3, zc), (rn * 1.3, zc + H * .13), (rn * 1.0, zc + H * .13)], [0, R * .02, R * .02, 0], 3), 32); mb.add(v, f, 1)
    zb = zc + H * .13; v, f = lathe(spline2d([(rn * .9, zb), (rn * 1.1, zb + H * .02), (rn * .95, zb + H * .09), (rn * .6, zb + H * .16), (rn * .3, zb + H * .205), (0.0, zb + H * .215)], 3), 28); mb.add(v, f, 2); return mb


def bottle_airless(rnd, H, R):
    """тонкий цилиндрический флакон-«эйрлесс»: стакан, плечо-диск и купол-помпа"""
    mb = MB(); hb = H * .84
    v, f = lathe(fillet([(0.0, 0.0), (R, 0.0), (R, hb), (R * .96, hb + R * .06), (0.0, hb + R * .06)], [0, R * .1, R * .04, 0, 0], 4), 48); mb.add(v, f, 0)
    v, f = lathe(spline2d([(R * .94, hb + R * .06), (R * .95, hb + R * .12), (R * .85, H * .92), (R * .55, H * .985), (0.0, H)], 4), 48); mb.add(v, f, 1); return mb


def make_shelf_item(rnd, kind, color, ps):
    """один безликий флакон; color — 'glass' (чёрное стекло + чёрный пластик), 'plastic' (чёрный пластик) или 'white' (жемчужно-белый + матовый белый); возвращает (mb, mats, ширина)"""
    if color == 'white': mats = [m_white(), m_white_matte(), m_white_matte()]
    elif color == 'plastic': mats = [m_black_plastic(), m_black_plastic(), m_rubber()]
    else: mats = [m_black_glass(), m_black_plastic(), m_rubber() if kind == 'dropper' else m_metal_simple('aud_brass_plain', (.75, .60, .36), .22) if rnd.random() < .25 else m_black_plastic()]
    if kind == 'pump': H = rnd.uniform(.24, .34) * ps; R = rnd.uniform(.030, .040) * ps; mb = bottle_pump(rnd, H, R, color); w = R
    elif kind == 'airless': H = rnd.uniform(.26, .34) * ps; R = rnd.uniform(.020, .026) * ps; mb = bottle_airless(rnd, H, R); w = R
    elif kind == 'jar': H = rnd.uniform(.09, .13) * ps; R = rnd.uniform(.048, .066) * ps; mb = bottle_jar(rnd, H, R); w = R
    elif kind == 'tube': H = rnd.uniform(.20, .28) * ps; R = rnd.uniform(.020, .026) * ps; mb = bottle_tube(rnd, H, R); w = R * 1.2
    else: H = rnd.uniform(.17, .23) * ps; R = rnd.uniform(.022, .029) * ps; mb = bottle_dropper(rnd, H, R); w = R
    if kind == 'tube': mats = [mats[0] if color != 'glass' else m_black_plastic(), mats[1], mats[2]]
    return mb, mats, w


def shelf_unit(name, loc, width=1.0, height=5.4, shelves=7, seed=3, depth=.24, prop_scale=1.3, collection=None):
    """наполнение узкой ниши: стеклянные полки (12 мм, торец зеленоватый) через ≈ .62 м — первая на loc.z + 1.0, последняя не выше loc.z + 5.0 — и по 3–6 безликих флаконов на каждой
    (чёрное стекло, чёрный матовый пластик, по 1–2 белых; помпы, баночки, тубы, капельницы, эйрлесс). loc = центр ниши на стене; предметы стоят перед ней (к −Y). Возвращает [корень]"""
    prev = _COLL[0]; _COLL[0] = collection or prev
    try:
        rnd = random.Random(seed * 6007 + 17); root = empty(name, loc); root['aud_kind'] = 'shelf_unit'; gl = m_shelf_glass(); zmax = min(5.0, height - .4); pitch = min(.62, (zmax - 1.0) / max(1, shelves - 1)); th = .012
        usable = width - .10; kinds = ['pump', 'pump', 'airless', 'jar', 'tube', 'dropper', 'pump', 'jar', 'tube']
        for s in range(shelves):
            zs = 1.0 + s * pitch; w = width - .02 + rnd.uniform(-.004, .004); mb = MB(); v, f = box_vf(-w / 2, w / 2, -depth, -.012, zs - th, zs); mb.add(v, f, 0)
            sh = link(bpy.data.objects.new(nm(name, 'shelf%d' % s), mb.mesh(nm(name, 'shelfM%d' % s), [gl], sm=False)), root); bevel(sh, .0016, 2, 40)
            n = rnd.randint(3, 6); nw = rnd.choice([1, 1, 2]); cols = (['white'] * nw + [rnd.choice(['glass', 'glass', 'plastic']) for _ in range(n - nw)]); rnd.shuffle(cols); items = []
            ks = list(kinds); rnd.shuffle(ks)
            for i in range(n):
                k = ks[i % len(ks)]; items.append((k, cols[i])); 
            built = [make_shelf_item(rnd, k, c, prop_scale) for (k, c) in items]; tot = sum(2 * b[2] for b in built); gap = max(.012, (usable - tot) / max(1, len(built) - 1)); gap = min(gap, .09)
            x = -(tot + gap * (len(built) - 1)) / 2 + rnd.uniform(-.03, .03)
            for (mb2, mats, hw), (k, c) in zip(built, items):
                x += hw; ob = bpy.data.objects.new(nm(name, 'item%d_%s' % (s, k)), mb2.mesh(nm(name, 'itemM%d_%d' % (s, len(root.children))), mats)); link(ob, root)
                ob.location = (x + rnd.uniform(-.006, .006), -depth * rnd.uniform(.42, .62), zs); ob.rotation_euler = (0, 0, rnd.uniform(-.5, .5) if k in ('jar', 'pump') else rnd.uniform(-.25, .25)); bevel(ob, .0007, 1, 40); x += hw + gap
        return [root]
    finally:
        _COLL[0] = prev


# ======================================================================================================================== превью
def settings(sc, w, h, spp):
    import addon_utils
    addon_utils.enable('cycles'); sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.device = 'CPU'; cy.samples = min(64, spp); cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'; cy.use_adaptive_sampling = True
    cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 5; cy.transmission_bounces = 6; cy.transparent_max_bounces = 10; cy.caustics_reflective = False; cy.caustics_refractive = False; cy.sample_clamp_indirect = 6.0; cy.sample_clamp_direct = 40.0
    sc.render.threads_mode = 'FIXED'; sc.render.threads = 2; sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = float(os.environ.get('EXPO', -.55)); sc.render.image_settings.file_format = 'PNG'


def area(name, loc, target, size, energy, color=(1.0, .82, .60), size_y=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.size_y = size_y or size; ld.color = color; ob = bpy.data.objects.new(name, ld); bpy.context.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return ob


def plane(name, mat, x0, x1, y0, y1, z, vertical=None):
    if vertical is None: v = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
    else: v = [(x0, vertical, y0), (x1, vertical, y0), (x1, vertical, y1), (x0, vertical, y1)]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], [(0, 1, 2, 3)]); me.update(); me.materials.append(mat); ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); return ob


def look_at(cam, target):
    cam.rotation_euler = (Vector(target) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()


def studio():
    """мини-студия: пол из marble-white-warm, кремовая стена сзади, тёмно-синий щит слева (контраст для хрома), тёплые площадные источники"""
    sc = bpy.context.scene; W = int(os.environ.get('W', 960)); H = round(W * 9 / 16); settings(sc, W, H, int(os.environ.get('SPP', 64)))
    fl = m_tex('aud_floor_marble', 'marble-white-warm', 1 / 1.4, tint=(1.0, .965, .90), bump=.05, rough_mul=.8, coat=1.0, coat_rough=.03, rough_min=.04)
    plane('aud_floor', fl, -9, 9, -9, 9, 0.0)
    def pl(name, col, rough=.75):
        m, nt, b = _new(name); S(b, (*col, 1), 'Base Color'); S(b, rough, 'Roughness'); return m
    plane('aud_back', pl('aud_pv_wall', lin('#b3a283')), -9, 9, 0, 8, 0, vertical=3.6)
    plane('aud_navy', pl('aud_pv_navy', lin('#16223e'), .35), -2.6, 1.8, 0.3, 6.0, 0.0, vertical=-4.4)
    for i, (x, w) in enumerate(((-2.2, .5), (-.35, .9), (1.4, .6))): plane('aud_flag%d' % i, pl('aud_pv_flag', (.012, .012, .014), .4), x, x + w, 0.0, 3.5, 0.0, vertical=-3.8)
    sc.world = bpy.data.worlds.new('aud_world'); sc.world.use_nodes = True; bg = sc.world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*lin('#d9c3a0'), 1); bg.inputs['Strength'].default_value = .30
    area('aud_key', (-3.2, -3.4, 4.0), (-.3, .6, .9), 3.2, 520, (1.0, .83, .62), 2.2); area('aud_fill', (3.6, -3.0, 2.2), (.3, .6, .8), 3.0, 150, (1.0, .86, .68), 3.0); area('aud_rim', (.8, 3.0, 3.6), (.0, .5, 1.0), 2.4, 420, (1.0, .84, .66), 1.6)
    return sc


def cam_for(sc, loc, target, lens):
    cd = bpy.data.cameras.new('aud_cam'); cd.lens = lens; cd.sensor_width = 36; cd.clip_end = 100; cam = bpy.data.objects.new('aud_cam', cd); bpy.context.collection.objects.link(cam); cam.location = loc; look_at(cam, target); sc.camera = cam; return cam


def shot(sc, path, loc, target, lens, w=None, h=None):
    if w: sc.render.resolution_x = w; sc.render.resolution_y = h
    cam_for(sc, loc, target, lens); sc.render.filepath = path; t = time.time(); bpy.ops.render.render(write_still=True); print('  кадр %s: %.0f с' % (os.path.basename(path), time.time() - t), flush=True)
    bpy.data.objects.remove(sc.camera, do_unlink=True)


def preview(which='all'):
    from PIL import Image
    t0 = time.time(); bpy.ops.wm.read_factory_settings(use_empty=True); sc = studio()
    chrome_vase_with_flowers('vase_L', (-1.12, 1.0, 0), seed=1); orchid_vase('orchid', (-.22, .62, 0), seed=2); lectern('lectern', (.98, 1.0, 0), yaw=0.0)
    shelf_unit('shelf', (3.6, 3.55, 0), seed=3); area('aud_niche', (3.6, 3.2, 5.4), (3.6, 3.5, 2.0), 1.4, 260, (1.0, .78, .5), 2.0); area('aud_niche2', (3.6, 2.2, 2.0), (3.6, 3.5, 2.6), .8, 90, (1.0, .78, .5), 2.5)
    print('сцена собрана: %.1f с, объектов %d' % (time.time() - t0, len(bpy.data.objects)), flush=True)
    W = sc.render.resolution_x; H = sc.render.resolution_y
    if which in ('all', 'main'): shot(sc, '/tmp/aud_props.png', (0, -2.0, 1.35), (-.08, 1.0, .80), 30.0)
    if which in ('all', 'close'):
        shot(sc, '/tmp/aud_pc1.png', (-1.0, -1.0, 1.15), (-1.12, 1.0, .88), 50.0, W * 4 // 5, H); shot(sc, '/tmp/aud_pc2.png', (.62, -1.3, 1.25), (.98, 1.0, .72), 38.0, W * 4 // 5, H)
        a = Image.open('/tmp/aud_pc1.png').convert('RGB'); b = Image.open('/tmp/aud_pc2.png').convert('RGB'); im = Image.new('RGB', (a.width + b.width, a.height)); im.paste(a, (0, 0)); im.paste(b, (a.width, 0)); im.save('/tmp/aud_props_closeup.png')
    if which == 'orchid': shot(sc, '/tmp/aud_props_orchid.png', (-.1, -.7, 1.0), (-.22, .62, .66), 50.0, W * 4 // 5, H)
    if which in ('all', 'shelf'):
        shot(sc, '/tmp/aud_props_shelf.png', (3.6, -5.2, 2.6), (3.6, 3.5, 2.75), 32.0, W, H); shot(sc, '/tmp/aud_props_shelf_close.png', (3.45, -1.0, 1.95), (3.6, 3.5, 2.0), 70.0, W, H)
    if which == 'top': shot(sc, '/tmp/aud_props_lectern_top.png', (1.9, -1.3, 2.1), (.98, 1.0, 1.0), 45.0, W * 4 // 5, H)
    if which == 'vase': shot(sc, '/tmp/aud_props_vase.png', (-.6, -.45, .62), (-1.12, 1.0, .33), 50.0, W * 4 // 5, H)
    print('превью готово: %.0f с' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    if args and args[0] == 'preview': preview(args[1] if len(args) > 1 else 'all')
    else: print(__doc__)
