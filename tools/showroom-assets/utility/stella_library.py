#!/usr/bin/env python3
"""«Кабинет Стеллы» — фон страницы «Старт со Стеллой» (assets/utility/stella-bg.webp): консультационный кабинет-шоурум профессиональной косметики, реалистичный рендер.
Композиция и камера те же, что у комнаты «Редакция» (assets/house/room-editorial.webp, tools/jar-render/house_rooms.py): два стеллажа, арка-ниша по центру, низкий круглый
стол, диагональное солнце через переплёт. Модель в метрах, свои материалы (не мультяшные): стеллажи — светлый дуб со стеклянными полками, латунной окантовкой и подсветкой
под каждой полкой; на полках упаковки косметики без надписей (tools/showroom-assets/packs.py: флаконы с помпой, баночки, тубы, пипетки, коробки — шаблон строится один раз и
размножается связанными копиями); в арке — зеркало в латунной раме с подсветкой; над аркой — лайтбокс и стеклянная полка с флаконами; стол из слоистого травертина с
консультационным набором (планшет, лоток с ампулами, лоток с пипетками, образцы, раскрытый каталог с цветовыми образцами, стакан воды); два консультационных кресла (лён, латунь),
табурет эстетиста, витринная тумба, растения, штора у окна; пол — полированный травертин с отражениями. Текстуры — пак CC0 tools/showroom-assets/textures.

  python3 stella_library.py render OUT.png [--res 2880x1620] [--samples 96] [--threads 2] [--strips 6] [--crop x0,x1,y0,y1]   # Blender (bpy), Cycles CPU + OIDN
  python3 stella_library.py finish RAW.png [--a 0.8] [--b 9.5] [--lc 1.25] [--out assets/utility/stella-bg.webp]            # чёрная точка, контраст L, regrade_site.py, WebP <= 450 КБ
Переменные: STELLA_EXPO (экспозиция), STELLA_HAZE (плотность дымки), STELLA_FSTOP (диафрагма, 0 — без DOF), STELLA_LED (подсветка полок), STELLA_LBOX (лайтбокс), STELLA_SUN."""
import bpy, bmesh, math, os, random, subprocess, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__)); SA = os.path.join(HERE, '..'); ROOT = os.path.abspath(os.path.join(SA, '..', '..'))
sys.path.insert(0, os.path.join(SA, 'auditorium')); sys.path.insert(0, SA)
import scene as S
import academy_auditorium as AA
import realism as RL

D = 2.6                                   # y задней стены
lin, link = AA.lin, AA.link
def E(n, d): return float(os.environ.get(n, d))


# ═════════════════════════════════════════════════════════════ узлы материалов
class NB:
    """мелкий конструктор нодов: math/mix/noise возвращают сокеты, числа и цвета подставляются как значения"""
    def __init__(s, m):
        m.use_nodes = True; s.m = m; s.nt = m.node_tree; s.N = s.nt.nodes; s.L = s.nt.links
    def n(s, t, **kw):
        nd = s.N.new(t)
        for k, v in kw.items(): setattr(nd, k, v)
        return nd
    def put(s, nd, i, v):
        if v is None: return
        if isinstance(v, bpy.types.NodeSocket): s.L.new(v, nd.inputs[i])
        else:
            if isinstance(v, (tuple, list)) and len(v) == 3: v = (*v, 1.0)
            nd.inputs[i].default_value = v
    def math(s, op, a, b=None, c=None):
        nd = s.n('ShaderNodeMath', operation=op); s.put(nd, 0, a); s.put(nd, 1, b); s.put(nd, 2, c); return nd.outputs[0]
    def mix(s, fac, a, b, blend='MIX'):
        nd = s.n('ShaderNodeMixRGB', blend_type=blend); s.put(nd, 0, fac); s.put(nd, 1, a); s.put(nd, 2, b); return nd.outputs[0]
    def noise(s, vec, scale, detail=4, rough=.55):
        nd = s.n('ShaderNodeTexNoise'); nd.inputs['Scale'].default_value = scale; nd.inputs['Detail'].default_value = detail; nd.inputs['Roughness'].default_value = rough
        s.L.new(vec, nd.inputs['Vector']); return nd.outputs['Fac']
    def bump(s, h, strength, dist, b):
        nd = s.n('ShaderNodeBump'); nd.inputs['Strength'].default_value = strength; nd.inputs['Distance'].default_value = dist; s.L.new(h, nd.inputs['Height'])
        if b.inputs['Normal'].links: s.L.new(b.inputs['Normal'].links[0].from_socket, nd.inputs['Normal'])
        s.L.new(nd.outputs['Normal'], b.inputs['Normal'])
    def sep(s, vec):
        nd = s.n('ShaderNodeSeparateXYZ'); s.L.new(vec, nd.inputs[0]); return nd.outputs['X'], nd.outputs['Y'], nd.outputs['Z']
    def bsdf(s): return next(n for n in s.N if n.bl_idname == 'ShaderNodeBsdfPrincipled')


def pbr(name, slug, tile=1.2, tint=None, rough=None, rmul=1.0, coat=0.0, bump=.4, rot=(0, 0, 0), sheen=0.0, metal=None, sat=1.0, val=1.0, flat=0.0, flat_col='#eadfca', nmap=True):
    """материал из пака CC0: box-проекция в координатах объекта (все крупные объекты имеют начало в 0), rot — поворот рисунка (волокна дуба вдоль нужной оси)"""
    m = bpy.data.materials.new(name); nb = NB(m); b = nb.bsdf(); N, L = nb.N, nb.L
    tc = nb.n('ShaderNodeTexCoord'); mp = nb.n('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / tile,) * 3; mp.inputs['Rotation'].default_value = rot; L.new(tc.outputs['Object'], mp.inputs['Vector'])
    def img(fn, cs):
        p = os.path.join(AA.TEX, slug, fn)
        if not os.path.exists(p): return None
        t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p); t.image.colorspace_settings.name = cs; t.projection = 'BOX'; t.projection_blend = .2; L.new(mp.outputs[0], t.inputs['Vector']); return t
    c = img('color.jpg', 'sRGB')
    if c:
        col = nb.mix(1.0, c.outputs['Color'], lin(tint), 'MULTIPLY') if tint else c.outputs['Color']
        if sat != 1.0 or val != 1.0:
            hs = nb.n('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = sat; hs.inputs['Value'].default_value = val; L.new(col, hs.inputs['Color']); col = hs.outputs['Color']
        if flat: col = nb.mix(flat, col, lin(flat_col))
        L.new(col, b.inputs['Base Color'])
    if rough is None:
        r = img('rough.jpg', 'Non-Color')
        if r: L.new(nb.math('MULTIPLY', r.outputs['Color'], rmul) if rmul != 1.0 else r.outputs['Color'], b.inputs['Roughness'])
    else: AA._set(b, rough, 'Roughness')
    n = img('normal.jpg', 'Non-Color') if nmap else None
    if n:
        nm = nb.n('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = bump; L.new(n.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    if metal is not None: AA._set(b, metal, 'Metallic')
    if coat: AA._set(b, coat, 'Coat Weight', 'Clearcoat'); AA._set(b, .06, 'Coat Roughness', 'Clearcoat Roughness')
    if sheen: AA._set(b, sheen, 'Sheen Weight', 'Sheen'); AA._set(b, .5, 'Sheen Roughness')
    return m


def seams(m, w=1.2, h=.6, mortar=.005):
    """швы плит пола и разный тон плит"""
    nb = NB(m); b = nb.bsdf(); tc = nb.n('ShaderNodeTexCoord'); br = nb.n('ShaderNodeTexBrick'); br.offset = .5
    for k, v in (('Scale', 1.0), ('Brick Width', w), ('Row Height', h), ('Mortar Size', mortar), ('Mortar Smooth', .5)): br.inputs[k].default_value = v
    br.inputs['Color1'].default_value = (1, 1, 1, 1); br.inputs['Color2'].default_value = (.972, .955, .93, 1); br.inputs['Mortar'].default_value = (.74, .72, .68, 1)
    nb.L.new(tc.outputs['Object'], br.inputs['Vector']); src = b.inputs['Base Color']
    c1 = src.links[0].from_socket if src.links else None
    nb.L.new(nb.mix(1.0, c1 if c1 else tuple(src.default_value[:3]), br.outputs['Color'], 'MULTIPLY'), src)
    return m


# ═════════════════════════════════════════════════════════════ геометрия
def prism(name, pts, y0, y1, mat=None, bev=0.0):
    """призма: контур (x, z) по оси Y"""
    bm = bmesh.new(); vs = [bm.verts.new((x, y0, z)) for x, z in pts]; f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); nv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, y1 - y0, 0), verts=nv); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    if bev: b = ob.modifiers.new('bev', 'BEVEL'); b.width = bev; b.segments = 3; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(35)
    return ob


def arch_pts(cx, rx, zs, z0, n=32):
    pts = [(cx - rx, z0), (cx - rx, zs)]
    for i in range(1, n): a = math.pi * i / n; pts.append((cx - rx * math.cos(a), zs + rx * math.sin(a)))
    return pts + [(cx + rx, zs), (cx + rx, z0)]


def boolean(ob, cutter, op='DIFFERENCE'):
    m = ob.modifiers.new('bl', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = 'EXACT'
    bpy.context.view_layer.update(); ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.remove(m); old = ob.data; ob.data = me; bpy.data.meshes.remove(old); bpy.data.objects.remove(cutter, do_unlink=True)
    return ob


def arch_ring(name, cx, r_in, r_out, zs, y0, y1, mat, bev=.003):
    o = prism(name, arch_pts(cx, r_out, zs, 0.0), y0, y1, mat, 0.0); c = prism('c', arch_pts(cx, r_in, zs, -.1), y0 - .05, y1 + .05)
    boolean(o, c); b = o.modifiers.new('bev', 'BEVEL'); b.width = bev; b.segments = 2; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(35); return o


def lathe(name, prof, mat, x=0.0, y=0.0, z=0.0, seg=72, sc=1.0, smooth=True):
    """тело вращения вокруг вертикали; prof — [(r, z)] снизу вверх по наружной стенке и обратно внутрь (повтор точки = резкое ребро)"""
    bm = bmesh.new(); rings = []
    for r, zz in prof:
        if r * sc < 1e-6: rings.append([bm.verts.new((x, y, z + zz * sc))] * seg)
        else: rings.append([bm.verts.new((x + r * sc * math.cos(2 * math.pi * j / seg), y + r * sc * math.sin(2 * math.pi * j / seg), z + zz * sc)) for j in range(seg)])
    for i in range(len(prof) - 1):
        for j in range(seg):
            j1 = (j + 1) % seg; q = [rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]]; u = []
            for v in q:
                if not u or u[-1] is not v: u.append(v)
            if len(u) > 1 and u[0] is u[-1]: u.pop()
            if len(u) >= 3:
                try: f = bm.faces.new(u); f.smooth = smooth
                except ValueError: pass
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    return link(bpy.data.objects.new(name, me))


def cr(pts, per=6):
    """Catmull-Rom по контрольным точкам профиля"""
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            t = k / per; t2 = t * t; t3 = t2 * t
            out.append(tuple(.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    return out + [pts[-1]]


def disc_prof(r, z0, z1, b=.004):
    pr = [(0, z0), (r - b, z0), (r - b, z0)]
    pr += [(r - b + b * math.sin(t), z0 + b * (1 - math.cos(t))) for t in (.4, .8, 1.2)] + [(r, z0 + b), (r, z0 + b)]
    pr += [(r, z1 - b), (r, z1 - b)] + [(r - b + b * math.cos(t), z1 - b + b * math.sin(t)) for t in (.4, .8, 1.2)] + [(r - b, z1), (r - b, z1), (0, z1)]
    return pr


def disc(name, mat, cx, cy, r, z0, z1, b=.004, seg=96): return lathe(name, disc_prof(r, z0, z1, b), mat, cx, cy, 0, seg)


# ═════════════════════════════════════════════════════════════ материалы
def make_materials():
    M = {}
    M['wall'] = AA.weather(pbr('st_wall', 'plaster-light-smooth', tile=1.5, tint='#f6ebd6', rough=.82, bump=.3, val=1.12), color_var=.06, cscale=.4, bump=.05, bscale=420)
    M['inner'] = AA.weather(pbr('st_inner', 'plaster-light-smooth', tile=1.5, tint='#fbf4e4', rough=.8, bump=.2), color_var=.03, cscale=.7)
    M['floor'] = seams(AA.weather(pbr('st_floor', 'travertine-ivory', tile=3.0, tint='#fff6e6', rough=.14, coat=.5, bump=.14, sat=.55, val=1.12, flat=.5), color_var=.04, cscale=.4, rvar=.08, rscale=.35, rstretch=.6))
    M['trav'] = AA.weather(pbr('st_trav', 'travertine-ivory', tile=.9, tint='#fff6e8', rough=.30, coat=.2, bump=.3, sat=.5, val=1.1), color_var=.04, cscale=.8)
    M['trav_c'] = AA.weather(pbr('st_trav_c', 'travertine-ivory', tile=.9, tint='#fff6e8', rough=.30, coat=.2, bump=0, sat=.5, val=1.1, nmap=False), color_var=.04, cscale=.8, bump=.04, bscale=500)
    M['trav_c2'] = AA.weather(pbr('st_trav_c2', 'travertine-ivory', tile=.6, tint='#f6e8d2', rough=.34, coat=.15, bump=0, sat=.55, val=1.05, nmap=False), color_var=.05, cscale=1.2, bump=.04, bscale=500)
    M['trav_h'] = AA.weather(pbr('st_trav_h', 'travertine-ivory', tile=.6, tint='#fbf0de', rough=.34, coat=.15, bump=.35, sat=.55, val=1.05), color_var=.05, cscale=1.2)
    M['wood_h'] = AA.weather(pbr('st_oak_h', 'oak-light', tile=.55, tint='#eed7b2', rough=.40, coat=.18, bump=.55, sat=.85), color_var=.06, cscale=2.0)
    M['wood_v'] = AA.weather(pbr('st_oak_v', 'oak-light', tile=.55, tint='#eed7b2', rough=.40, coat=.18, bump=.55, rot=(0, math.pi / 2, 0), sat=.85), color_var=.06, cscale=2.0)
    M['wood_back'] = AA.weather(pbr('st_oak_back', 'oak-light', tile=.8, tint='#d9b88a', rough=.5, bump=.4), color_var=.05, cscale=1.5)
    M['brass'] = AA.flat('st_brass', '#dcb978', rough=.28, metal=1.0)
    M['bark'] = AA.flat('st_bark', '#4b3b2c', rough=.8)
    M['pages'] = pages_mat()
    M['soil'] = AA.flat('st_soil', '#2a2119', rough=.95)
    M['gobo'] = AA.flat('st_gobo', '#1a1a1a', rough=1.0)
    return M


def pages_mat(axis='x', period=.0030, name='st_pages'):
    """торец блока страниц: тонкие полосы листов (вдоль оси axis), лёгкая желтизна у каждой книги, шероховатая бумага"""
    m = bpy.data.materials.new(name); nb = NB(m); b = nb.bsdf(); tc = nb.n('ShaderNodeTexCoord'); oi = nb.n('ShaderNodeObjectInfo')
    x, y, z = nb.sep(tc.outputs['Object']); s = nb.math('SINE', nb.math('MULTIPLY', x if axis == 'x' else z, 2 * math.pi / period))
    tone = nb.math('MULTIPLY_ADD', s, .03, .94); nz = nb.noise(tc.outputs['Object'], 120, 4); yel = nb.math('MULTIPLY_ADD', oi.outputs['Random'], .07, .93)
    col = nb.mix(1.0, (.93, .89, .79), nb.math('MULTIPLY', nb.math('MULTIPLY', tone, nb.math('MULTIPLY_ADD', nz, .14, .90)), yel), 'MULTIPLY')
    nb.L.new(col, b.inputs['Base Color']); AA._set(b, .86, 'Roughness'); nb.bump(nb.math('ADD', s, nb.math('MULTIPLY', nz, 2.0)), .35, .0004, b); return m


# ═════════════════════════════════════════════════════════════ сцена: оболочка, арка, стеллажи


# ═════════════════════════════════════════════════════════════ декор, растения
DM = {}; BARK = None; OLV = []; FIC = []


def sphere(name, r, x, y, z, mat, seg=64):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=(x, y, z)); ob = bpy.context.object; ob.name = name; bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); return ob


def torus(name, R, r, loc, rot, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=12, location=loc, rotation=rot); ob = bpy.context.object; ob.name = name; bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); return ob


def vase_prof(ctrl, wall=.004):
    r0 = ctrl[0][0]; lip = ctrl[-1]; mid = ctrl[len(ctrl) // 2]
    return [(0, 0), (r0, 0), (r0, 0)] + cr(ctrl, 5) + [(lip[0] - wall, lip[1]), (lip[0] - wall, lip[1]), (ctrl[-2][0] - wall, ctrl[-2][1]), (mid[0] - wall, mid[1]), (ctrl[1][0] * .8, ctrl[1][1] + .01), (0, ctrl[1][1] + .008)]


VASE1 = [(.05, 0), (.075, .05), (.085, .12), (.07, .20), (.036, .27), (.03, .30), (.04, .32)]
VASE2 = [(.045, 0), (.07, .04), (.078, .10), (.06, .17), (.034, .21), (.038, .23)]


def olive_leaves():
    ma = RL.leaf_material('olive_leafA', (.05, .085, .035), (.16, .23, .075)); mb = RL.leaf_material('olive_leafB', (.085, .125, .05), (.23, .30, .105), under=True); out = []
    for m in (ma, mb): out.extend(RL.leaf_variants(.07, .0105, 4, 'olive', (m,)))
    return out


def ficus_leaves():
    ma = RL.leaf_material('ficus_a', (.03, .07, .025), (.10, .20, .05)); mb = RL.leaf_material('ficus_b', (.05, .09, .03), (.14, .25, .07), under=True); out = []
    for m in (ma, mb): out.extend(RL.leaf_variants(.15, .065, 3, 'ficus', (m,)))
    return out


def twig(rnd, leaves, pts, count, r0, r1, k=1.0):
    cu = bpy.data.curves.new('tw', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, q in enumerate(pts): sp.points[i].co = (q[0], q[1], q[2], 1); sp.points[i].radius = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
    cu.bevel_depth = 1.0; cu.bevel_resolution = 2; cu.use_fill_caps = True; cu.materials.append(BARK); link(bpy.data.objects.new('tw', cu))
    def at(t):
        f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i + 1], f - i)
    for i in range(1, count + 1):
        t = i / (count + 1) * .94 + .06; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
        for dv in RL.pair_dirs(d, i, rnd, spread=1.0, up=.20, droop=.24):
            lf = link(bpy.data.objects.new('lf', rnd.choice(leaves))); lf.scale = ((1.15 - .40 * t) * (.74 + rnd.random() * .56) * k,) * 3; RL.orient(lf, dv, rnd, .8, RL.tint_for(t, rnd)); lf.location = pos
    return at


def tree(x, y, z0, H, rnd, leaves, nbr=8, cnt=26, k=1.0, r0=.012, spread=1.0):
    base = Vector((x, y, z0)); top = Vector((x + rnd.uniform(-.06, .06), y + rnd.uniform(-.06, .06), z0 + H))
    at = twig(rnd, leaves, [base, base.lerp(top, .33) + Vector((.03, 0, 0)), base.lerp(top, .66) + Vector((-.03, .02, 0)), top], cnt, r0, r0 * .35, k)
    for j in range(nbr):
        t = .30 + .62 * (j + .5) / nbr; P = at(t); az = rnd.uniform(0, 6.283); L = H * rnd.uniform(.22, .36) * (1.15 - .55 * t) * spread; d = Vector((math.cos(az) * .85, math.sin(az) * .85, .5)).normalized()
        twig(rnd, leaves, [P, P + d * L * .5 + Vector((0, 0, .04)), P + d * L + Vector((0, 0, -.04 * L / .3))], max(5, int(cnt * .7)), r0 * .45, .003, k)


def pot(x, y, r, h, mat, z=0.0):
    prof = [(r * .68, 0), (r * .68, 0)] + cr([(r * .70, .004), (r * .9, h * .4), (r, h * .85), (r * 1.02, h)], 4) + [(r * .94, h), (r * .94, h), (r * .93, h * .9), (0, h * .9)]
    lathe('pot', prof, mat, x, y, z); lathe('soil', [(0, h * .84), (r * .93, h * .86), (r * .93, h * .87), (0, h * .89)], DM_SOIL, x, y, z)


def it_vase(prof, mat): return lambda M, x, y, z: lathe('vase', vase_prof(prof), DM[mat], x, y, z)


def it_sphere(M, x, y, z):
    disc('stand', M['trav'], x, y, .048, z, z + .028, .003, 64); sphere('pearl', .055, x, y, z + .028 + .054, DM['pearl'])


def it_olive_vase(M, x, y, z):
    lathe('vase', vase_prof(VASE1), DM['cream'], x, y, z); rnd = random.Random(int(x * 100))
    for j in range(3):
        az = rnd.uniform(0, 6.28); d = Vector((math.cos(az) * .45, math.sin(az) * .45, 1)).normalized(); P = Vector((x, y, z + .30)); L = rnd.uniform(.38, .55)
        twig(rnd, OLV, [P, P + d * L * .4, P + d * L * .75 + Vector((0, 0, .03)), P + d * L + Vector((math.cos(az) * .06, math.sin(az) * .06, -.04))], 20, .005, .0025, .85)


def it_plant(M, x, y, z):
    rnd = random.Random(int(x * 1000)); pot(x, y, .048, .09, DM['terra'] if x < 0 else DM['cream'], z); tree(x, y, z + .085, .17, rnd, OLV, nbr=4, cnt=8, k=.55, r0=.004, spread=.9)


def it_bowl(M, x, y, z): lathe('bowl', [(0, 0), (.04, 0), (.04, 0)] + cr([(.04, .002), (.07, .012), (.098, .036), (.104, .05)], 4) + [(.101, .05), (.095, .036), (.066, .014), (.036, .006), (0, .006)], M['brass'], x, y, z, 64)


DM_SOIL = None


# ═════════════════════════════════════════════════════════════ мебель, ковёр, стол


def open_book(M, x, y, z):
    pt = page_top_mat(y); pe = pages_mat('z', .0016, 'ob_edge'); w, dd, hh, nx, ny = .195, .22, .014, 24, 2; hz = lambda u: hh * (1 - .55 * (1 - u) ** 2.5) * (1 - .06 * u * u)
    for s in (-1, 1):
        bm = bmesh.new(); T = [[bm.verts.new((x + s * (.004 + w * i / nx), y - dd / 2 + dd * j / ny, z + .004 + hz(i / nx))) for j in range(ny + 1)] for i in range(nx + 1)]
        Bv = [[bm.verts.new((v.co.x, v.co.y, z + .004)) for v in col] for col in T]
        def F(vs, mi, sm=False): f = bm.faces.new(vs); f.material_index = mi; f.smooth = sm
        for i in range(nx):
            for j in range(ny):
                F([T[i][j], T[i + 1][j], T[i + 1][j + 1], T[i][j + 1]], 0, True); F([Bv[i][j], Bv[i][j + 1], Bv[i + 1][j + 1], Bv[i + 1][j]], 1)
            F([T[i][0], Bv[i][0], Bv[i + 1][0], T[i + 1][0]], 1); F([T[i][ny], T[i + 1][ny], Bv[i + 1][ny], Bv[i][ny]], 1)
        for j in range(ny): F([T[nx][j], T[nx][j + 1], Bv[nx][j + 1], Bv[nx][j]], 1); F([T[0][j], Bv[0][j], Bv[0][j + 1], T[0][j + 1]], 1)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); me = bpy.data.meshes.new('pages'); bm.to_mesh(me); bm.free(); me.materials.append(pt); me.materials.append(pe); link(bpy.data.objects.new('pages', me))
        AA.box('cover', DM['navy'], min(x, x + s * (w + .007)), max(x, x + s * (w + .007)), y - dd / 2 - .003, y + dd / 2 + .003, z, z + .004, .0015)
    AA.box('spine', DM['navy'], x - .004, x + .004, y - dd / 2 - .003, y + dd / 2 + .003, z, z + .0045, .001)


def window_curtain(M):
    x0, x1, z0, z1 = 2.04, 2.42, .30, 2.30; AA.box('win', AA.led('st_win', (1.0, .96, .88), E('STELLA_WIN', 7.0)), x0, x1, D - .012, D - .004, z0, z1, 0)
    for xa, xb, za, zb in ((x0 - .03, x0, z0 - .03, z1 + .03), (x1, x1 + .03, z0 - .03, z1 + .03), (x0, x1, z0 - .03, z0), (x0, x1, z1, z1 + .03), (x0, x1, 1.28, 1.31)): AA.box('wf', M['inner'], xa, xb, D - .03, D - .002, za, zb, .002)
    m = bpy.data.materials.new('curtain'); nb = NB(m); b = nb.bsdf(); AA._set(b, (.95, .91, .83, 1), 'Base Color'); AA._set(b, .92, 'Roughness'); tr = nb.n('ShaderNodeBsdfTranslucent'); tr.inputs['Color'].default_value = (.95, .88, .75, 1)
    mx = nb.n('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = .6; out = next(n for n in nb.N if n.type == 'OUTPUT_MATERIAL'); nb.L.new(b.outputs['BSDF'], mx.inputs[1]); nb.L.new(tr.outputs['BSDF'], mx.inputs[2]); nb.L.new(mx.outputs['Shader'], out.inputs['Surface'])
    bm = bmesh.new(); nx = 60; rows = [bm.verts.new((2.0 + .50 * i / nx, D - .06 - .024 * math.sin(2 * math.pi * (.50 * i / nx) / .085 + .4) * (1 - .3 * z), z)) for z in (0.0, 2.45) for i in range(nx + 1)] if False else None
    cols = [[bm.verts.new((2.0 + .50 * i / nx, D - .06 - .024 * math.sin(2 * math.pi * (.50 * i / nx) / .085 + .4), zz)) for zz in (.0, 1.2, 2.45)] for i in range(nx + 1)]
    for i in range(nx):
        for j in range(2): f = bm.faces.new([cols[i][j], cols[i + 1][j], cols[i + 1][j + 1], cols[i][j + 1]]); f.smooth = True
    me = bpy.data.meshes.new('curtain'); bm.to_mesh(me); bm.free(); me.materials.append(m); link(bpy.data.objects.new('curtain', me))


# ═════════════════════════════════════════════════════════════ свет, камера, сборка
def lights():
    d = Vector((.58, .70, -.42)).normalized(); center = Vector((0, 1.2, .5))
    sn = bpy.data.lights.new('sun', 'SUN'); sn.energy = E('STELLA_SUN', 32.0); sn.angle = math.radians(E('STELLA_SUNANG', 1.7)); sn.color = (1.0, .92, .78)
    so = bpy.data.objects.new('sun', sn); link(so); so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = 80; ar.size = 3.0; ar.size_y = 2.0; ar.color = (1.0, .95, .88); ao = bpy.data.objects.new('fill', ar); link(ao); ao.location = (-1.0, -3.0, 1.6)
    ao.rotation_euler = (math.radians(78), 0, math.radians(8)); ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (.96, .94, .90, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = .12; bpy.context.scene.world = w
    cm = AA.led('ceil', (1.0, .93, .80), E('STELLA_CEIL', 2.0)); ce = AA.box('ceil', cm, -7, 7, -6, 8, 3.4, 3.41, 0); ce.visible_camera = False; ce.visible_shadow = False
    t = center - d * 7.0; ex = d.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(d).normalized(); gm = DM_GOBO
    def bar(u0, v0, u1, v1):
        b = AA.box('gobo', gm, -.5, .5, -.5, .5, -.5, .5, 0); b.scale = (abs(u1 - u0), .05, abs(v1 - v0)); b.location = t + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2)
        b.rotation_euler = Matrix((ex, d, ey)).transposed().to_euler(); b.visible_camera = False; b.visible_glossy = False; b.visible_transmission = False
    U, V = 2.2, 1.2
    for u in (-U, -U / 3, U / 3, U): bar(u - .06, -V, u + .06, V)
    for v in (-V, 0, V): bar(-U, v - .06, U, v + .06)
    bar(-U - 4, V, U + 4, V + 4); bar(-U - 4, -V - 4, U + 4, -V); bar(-U - 4, -V, -U, V); bar(U, -V, U + 4, V)
    hz = E('STELLA_HAZE', .012)
    if hz > 0:
        m = bpy.data.materials.new('haze'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); vs = nt.nodes.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = hz; vs.inputs['Anisotropy'].default_value = .55; vs.inputs['Color'].default_value = (1.0, .96, .88, 1)
        o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(vs.outputs[0], o.inputs['Volume']); hb = AA.box('haze', m, -2.44, 2.44, -1.98, D - .002, .002, 2.6, 0); hb.visible_shadow = False


def camera():
    cd = bpy.data.cameras.new('Cam'); cd.sensor_width = 36; cd.lens = 30; cd.dof.use_dof = E('STELLA_FSTOP', 5.6) > 0; cd.dof.focus_distance = E('STELLA_FOCUS', 4.25); cd.dof.aperture_fstop = max(.5, E('STELLA_FSTOP', 5.6))
    c = bpy.data.objects.new('Camera', cd); link(c); bpy.context.scene.camera = c; c.location = Vector((0, -1.9, .86)); c.rotation_euler = (Vector((0, D, .52)) - c.location).to_track_quat('-Z', 'Y').to_euler()


def setup(w, h, spp, threads=2):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; S.settings(sc, w, h, spp)
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'; sc.view_settings.exposure = E('STELLA_EXPO', -.70)
    sc.render.image_settings.color_mode = 'RGB'; sc.render.image_settings.color_depth = '8'; sc.render.dither_intensity = 1.0; sc.render.threads_mode = 'FIXED'; sc.render.threads = threads
    cy = sc.cycles; cy.max_bounces = 7; cy.diffuse_bounces = 4; cy.glossy_bounces = 4; cy.transmission_bounces = 6; cy.volume_bounces = 1; cy.sample_clamp_indirect = 4.0; cy.sample_clamp_direct = 0
    cy.use_adaptive_sampling = True; cy.adaptive_threshold = E('STELLA_ADAPT', .02); cy.adaptive_min_samples = 16; cy.denoiser = 'OPENIMAGEDENOISE'; cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.denoising_prefilter = 'ACCURATE'; cy.filter_width = 1.0
    try: cy.denoising_quality = 'HIGH'
    except Exception: pass
    return sc


def render_strips(sc, out, n, ov=64):
    from PIL import Image
    W_, H_ = sc.render.resolution_x, sc.render.resolution_y; parts = []; sc.render.use_border = True; sc.render.use_crop_to_border = False
    for i in range(n):
        a_, b_ = round(W_ * i / n), round(W_ * (i + 1) / n); x0, x1 = max(0, a_ - ov), min(W_, b_ + ov); f = out.replace('.png', '_t%d.png' % i)
        if not os.path.exists(f):
            sc.render.border_min_x = x0 / W_; sc.render.border_max_x = x1 / W_; sc.render.border_min_y = 0.0; sc.render.border_max_y = 1.0
            sc.render.filepath = f.replace('.png', '_tmp.png'); bpy.ops.render.render(write_still=True); os.replace(f.replace('.png', '_tmp.png'), f); print('полоса %d/%d готова' % (i + 1, n), flush=True)
        parts.append((a_, b_, f))
    im = Image.new('RGB', (W_, H_))
    for a_, b_, f in parts: im.paste(Image.open(f).convert('RGB').crop((a_, 0, b_, H_)), (a_, 0))
    im.save(out); sc.render.use_border = False; print('собрано', out, flush=True)


def finish(raw, a=.8, b=9.5, lc=1.25, out=None, limit=450 * 1024):
    import numpy as np, cv2
    from PIL import Image, ImageFilter
    out = out or os.path.join(ROOT, 'assets', 'utility', 'stella-bg.webp'); tmp = '/tmp/stella_fin.png'
    rgb = np.asarray(Image.open(raw).convert('RGB')); lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32); L = lab[..., 0]; m = L.mean(); p = float(np.percentile(L, .15)); t = 6.0
    if p > t: L = (L - p) * (255 - t) / (255 - p) + t                                                                # чёрная точка
    lab[..., 0] = np.clip(m + (L - m) * lc, 0, 255); Image.fromarray(cv2.cvtColor(lab.round().astype(np.uint8), cv2.COLOR_LAB2RGB)).save(tmp)
    rg = os.path.join(SA, 'regrade_site.py'); subprocess.run([sys.executable, rg, tmp, '--stats'], check=True); subprocess.run([sys.executable, rg, tmp, '--a', str(a), '--b', str(b)], check=True)
    im = Image.open(tmp).convert('RGB').filter(ImageFilter.UnsharpMask(radius=1.0, percent=30, threshold=2))
    for q in (88, 84, 80, 76, 72, 68, 64, 60, 56, 52):
        im.save(out, 'WEBP', quality=q, method=6)
        if os.path.getsize(out) <= limit: break
    print('%s  %dx%d  q%d  %d КБ' % (out, im.width, im.height, q, os.path.getsize(out) // 1024)); im.save('/tmp/stella_final.png')


def arg(name, d=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a else d


def main():
    mode = sys.argv[1]
    if mode == 'finish':
        finish(os.path.abspath(sys.argv[2]), float(arg('--a', .8)), float(arg('--b', 9.5)), float(arg('--lc', 1.25)), arg('--out')); return
    out = os.path.abspath(sys.argv[2]); w, h = (int(v) for v in arg('--res', '2880x1620').lower().split('x')); spp = int(arg('--samples', 96)); strips = int(arg('--strips', 1))
    sc = setup(w, h, spp, int(arg('--threads', 2))); build(); lights(); camera()
    if arg('--crop'):
        x0, x1, y0, y1 = (float(v) for v in arg('--crop').split(',')); sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = x0, x1, y0, y1
    if strips > 1: render_strips(sc, out, strips)
    else: sc.render.filepath = out; bpy.ops.render.render(write_still=True)
    print('готово', out, flush=True)


# ═════════════════════════════════════════════════════════════ материалы декора и свет полок
import packs as PK
PKM = None; PKT = {}


def ramp(nb, fac, stops, const=True):
    r = nb.n('ShaderNodeValToRGB'); e = r.color_ramp.elements; r.color_ramp.interpolation = 'CONSTANT' if const else 'LINEAR'
    e[0].position, e[0].color = stops[0][0], (*lin(stops[0][1]), 1); e[1].position, e[1].color = stops[-1][0], (*lin(stops[-1][1]), 1)
    for p, c in stops[1:-1]: el = e.new(p); el.color = (*lin(c), 1)
    nb.L.new(fac, r.inputs['Fac']); return r.outputs['Color']


def screen_mat():
    """экран планшета: тёмное стекло, на нём светящееся кольцо-«анализ» и полосы (без текста)"""
    m = bpy.data.materials.new('d_screen'); nb = NB(m); b = nb.bsdf(); tc = nb.n('ShaderNodeTexCoord'); u, v, z = nb.sep(tc.outputs['Object']); mx = nb.math('MULTIPLY', u, .233); my = nb.math('MULTIPLY', v, .158)
    r = nb.math('SQRT', nb.math('ADD', nb.math('POWER', mx, 2), nb.math('POWER', nb.math('SUBTRACT', my, -.01), 2))); ring = nb.math('LESS_THAN', nb.math('ABSOLUTE', nb.math('SUBTRACT', r, .042)), .0032)
    bar = nb.math('MULTIPLY', nb.math('MULTIPLY', nb.math('GREATER_THAN', mx, .07), nb.math('LESS_THAN', mx, .108)), nb.math('LESS_THAN', nb.math('ABSOLUTE', nb.math('SUBTRACT', nb.math('FRACT', nb.math('MULTIPLY', my, 36)), .5)), .12))
    dot = nb.math('LESS_THAN', nb.math('ADD', nb.math('POWER', nb.math('SUBTRACT', mx, 0), 2), nb.math('POWER', nb.math('SUBTRACT', my, -.01), 2)), .0000025)
    ui = nb.math('MAXIMUM', nb.math('MAXIMUM', ring, bar), dot); AA._set(b, (.012, .014, .02, 1), 'Base Color'); AA._set(b, .05, 'Roughness'); AA._set(b, E('STELLA_SCREEN', 1.5), 'Emission Strength')
    nb.L.new(nb.mix(ui, lin('#0b1628'), lin('#9fd0ff')), b.inputs['Emission Color']); return m


def decor_mats():
    def cer(n, h, rough=.3, coat=.25, var=.035): return AA.weather(AA.flat(n, h, rough=rough, coat=coat), color_var=var, cscale=4.0)
    DM.update(cream=cer('d_cream', '#ebe2d0'), sage=cer('d_sage', '#97a58b', .34), terra=cer('d_terra', '#b5694c', .66, 0, .06), white=cer('d_white', '#f1ede4', .24, .35, .02),
              slate=cer('d_slate', '#7a8fa4', .36), sand=AA.flat('d_sand', '#d9c49a', rough=.9), glass=AA.glass('d_glass', '#f4fbf8', .02), glass_sh=AA.glass('d_gsh', '#e0efe9', .012),
              amber=AA.glass('d_amber', '#e2a857', .01), water=AA.glass('d_water', '#f6fbff', .0), navy=AA.flat('d_navy', '#2b4166', rough=.6), alu=AA.flat('d_alu', '#cfcfcb', rough=.32, metal=.9),
              mirror=AA.flat('d_mirror', '#d9cfbd', rough=.035, metal=1.0), led=AA.led('d_led', (1.0, .80, .52), E('STELLA_LED', 5.0)), lightbox=AA.led('d_lbox', (1.0, .93, .82), E('STELLA_LBOX', 8.0)),
              screen=screen_mat(), chair=pbr('d_chair', 'linen-blue-ph', tile=.5, tint='#e8edf3', rough=None, bump=.9, sheen=.5, sat=.7, val=1.08))
    DM['pearl'] = AA.flat('d_pearl', '#f4efe6', rough=.12, coat=1.0); b = DM['pearl'].node_tree.nodes['Principled BSDF']; AA._set(b, 380.0, 'Thin Film Thickness'); AA._set(b, 1.45, 'Thin Film IOR')
    return DM


# ═════════════════════════════════════════════════════════════ упаковки (шаблон строится один раз, дальше — связанные копии)
FOOT = dict(bottle=.062, pump=.056, dropper=.040, jar=.082, tube=.047, box=.064)


def pack(kind, brand, x, y, z, rot=0.0, k=1.0, lie=False):
    key = (kind, brand)
    if key not in PKT:
        objs, _ = PK.build(kind, False, PKM, brand)
        for o in objs: bpy.context.collection.objects.unlink(o)
        PKT[key] = objs
    g = bpy.data.objects.new('pk_' + kind, None); link(g); g.location = (x, y, z); g.rotation_euler = (0, math.radians(90) if lie else 0, math.radians(rot)); g.scale = (k,) * 3
    for o in PKT[key]: c = o.copy(); c.parent = g; link(c)
    return g


# ═════════════════════════════════════════════════════════════ оболочка, арка с зеркалом, стеллажи-витрины
BOARDS = (.10, .42, .74, 1.06, 1.38); BT = (.025, .012, .012, .012, .025); SY0, SY1 = D - .34, D - .02


def shell(M):
    AA.box('floor', M['floor'], -7, 7, -9, D + 3, -.3, 0, 0)
    back = AA.box('back', M['wall'], -2.6, 2.6, D, D + .35, -.1, 2.6, 0)
    boolean(back, prism('cut', arch_pts(0, .42, .70, -.2), D - .05, D + .14)); back.data.materials.append(M['inner'])
    for pl in back.data.polygons:
        c = pl.center
        if abs(c.x) <= .424 and c.z <= 1.124 and D + .005 < c.y < D + .135: pl.material_index = 1
    AA.box('wl', M['wall'], -2.6, -2.45, -2.0, D + .35, -.1, 2.6, 0); AA.box('wr', M['wall'], 2.45, 2.6, -2.0, D + .35, -.1, 2.6, 0)
    for x0, x1 in ((-2.45, -.455), (.455, 2.45)): AA.box('skirt', M['trav'], x0, x1, D - .028, D, 0, .075, .004)
    AA.box('skirt_l', M['trav'], -2.45, -2.45 + .028, -2.0, D - .028, 0, .075, .004); AA.box('skirt_r', M['trav'], 2.45 - .028, 2.45, -2.0, D - .028, 0, .075, .004)
    arch_ring('frame', 0, .42, .46, .70, D - .03, D + .004, M['trav'], .004)                                       # травертиновая рама арки
    arch_ring('brass_in', 0, .42, .428, .70, D - .034, D - .028, M['brass'], .0012)                                   # тонкая латунная линия по кромке
    led = AA.led('st_niche_led', (1.0, .80, .55), E('STELLA_NICHE', 2.5)); arch_ring('niche_led', 0, .405, .418, .70, D + .004, D + .016, led, 0.0).visible_shadow = False
    prism('mirror', arch_pts(0, .40, .70, .045), D + .118, D + .128, DM['mirror'])                                    # зеркало в нише
    arch_ring('mirror_frame', 0, .40, .413, .70, D + .104, D + .134, M['brass'], .001)                                # тонкая латунная рама зеркала


def shelf_frame(M, x0, x1):
    top = BOARDS[-1] + BT[-1]
    for xa, xb in ((x0, x0 + .03), (x1 - .03, x1)): AA.box('post', M['wood_v'], xa, xb, SY0, SY1, 0, top, .0035)
    for z, t in zip(BOARDS, BT):
        if t > .02: AA.box('board', M['wood_h'], x0 + .027, x1 - .027, SY0, SY1, z, z + t, .0035)
        else:
            AA.box('glass', DM['glass_sh'], x0 + .027, x1 - .027, SY0 + .004, SY1, z, z + t, .0015); AA.box('apron', M['brass'], x0 + .03, x1 - .03, SY0, SY0 + .004, z - .010, z + t + .004, .0012)
        if z > BOARDS[0]: AA.box('led', DM['led'], x0 + .03, x1 - .03, SY0 + .012, SY0 + .026, z - .007, z - .001, 0).visible_shadow = False        # подсветка под полкой
    AA.box('back', M['inner'], x0 + .03, x1 - .03, SY1, SY1 + .006, BOARDS[0] + BT[0], top, 0); AA.box('toe', M['wood_h'], x0 + .03, x1 - .03, SY0 + .02, SY0 + .032, 0, BOARDS[0], .002)
    for xa, xb in ((x0 + .027, x0 + .03), (x1 - .03, x1 - .027)): AA.box('trim', M['brass'], xa, xb, SY0 - .001, SY0 + .008, BOARDS[0] + BT[0], BOARDS[-1], 0)   # латунные вставки по кромке стоек


def fill_row(rnd, xa, xb, zb, y, mix, brands, nodrop=False):
    x = xa + .02; kinds = [k for k in mix if not (nodrop and k == 'dropper')]; wts = [mix[k] for k in kinds]; n_tube = 0
    while True:
        kind = rnd.choices(kinds, wts)[0]; br = rnd.choice(brands); n = rnd.choice((1, 2, 2, 3, 3, 4)); k = rnd.uniform(.98, 1.08)
        if kind == 'tube':
            if n_tube >= 3: continue
            n_tube += 1
        for i in range(n):
            w = FOOT[kind] * k
            if x + w > xb - .02: return x
            pack(kind, br, x + w / 2, y + rnd.uniform(-.012, .012), zb, rnd.uniform(-8, 8) if kind != 'box' else rnd.uniform(0, 1), k); x += w + rnd.uniform(.010, .022)
        x += rnd.choice((0, 0, .02, .05))


def build_shelves(M):
    MIX = dict(a=dict(jar=5, box=3, tube=1), b=dict(pump=3, bottle=3, dropper=2), c=dict(dropper=3, jar=2, box=2, bottle=2), d=dict(pump=3, bottle=3, dropper=2), top=dict(pump=2, bottle=2, dropper=1))
    for side, x0, x1, brands, seed in (('L', -2.0, -.66, ('dermatime', 'eva', 'biretix', 'dermatime'), 31), ('R', .66, 2.0, ('dermatime', 'endocare', 'biretix', 'iraltone', 'keenwell', 'eva'), 47)):
        shelf_frame(M, x0, x1); rnd = random.Random(seed); xa, xb = x0 + .04, x1 - .04; rows = [b + t for b, t in zip(BOARDS, BT)]; y = SY0 + .105; items = []
        plans = ({'L': [[('f', 'a')], [('f', 'b', .55), ('g', .24, 'sphere'), ('f', 'b')], [('f', 'c', .40), ('g', .22, 'plant'), ('f', 'c')], [('f', 'd')], [('g', .30, 'vase1w'), ('f', 'top', .45), ('g', .22, 'sphere')]],
                  'R': [[('f', 'a', .80), ('g', .24, 'bowl'), ('f', 'a')], [('f', 'b')], [('f', 'c', .50), ('g', .22, 'sphere'), ('f', 'c')], [('f', 'd', .60), ('g', .24, 'plant'), ('f', 'd')],
                        [('g', .32, 'olive_vase'), ('f', 'top', .40), ('g', .22, 'plant')]]})[side]
        for i, plan in enumerate(plans):
            x = xa
            for tk in plan:
                if tk[0] == 'f':
                    xe = xb if len(tk) < 3 else min(xb, x + tk[2])
                    if i < 4: fill_row(random.Random(seed * 7 + i * 13 + int(x * 100)), x + .03, xe, rows[i], SY0 + .205, MIX[tk[1]], brands, side == 'L')             # второй ряд упаковок глубже
                    x = fill_row(rnd, x, xe, rows[i], y, MIX[tk[1]], brands, side == 'L')
                else: items.append((tk[2], x + tk[1] / 2, SY0 + .15, rows[i])); x += tk[1]
        for kind, x, yy, z in items: ITEMS[kind](M, x, yy, z)
        print('стеллаж %s: упаковок %d' % (side, sum(1 for o in bpy.data.objects if o.name.startswith('pk_'))), flush=True)


def it_vase(prof, mat): return lambda M, x, y, z: lathe('vase', vase_prof(prof), DM[mat], x, y, z)


ITEMS = dict(vase1w=it_vase(VASE1, 'cream'), vase2=it_vase(VASE2, 'sage'), sphere=it_sphere, olive_vase=it_olive_vase, plant=it_plant, bowl=it_bowl)


# ═════════════════════════════════════════════════════════════ консультационный стол, кресла, табурет, лайтбокс
def page_top_mat(cy):
    m = bpy.data.materials.new('ob_top'); nb = NB(m); b = nb.bsdf(); tc = nb.n('ShaderNodeTexCoord'); x, y, z = nb.sep(tc.outputs['Object']); ax = nb.math('ABSOLUTE', x)
    ln = nb.math('LESS_THAN', nb.math('FRACT', nb.math('DIVIDE', y, .0058)), .34); wd = nb.math('GREATER_THAN', nb.noise(tc.outputs['Object'], 170.0, 1, .5), .44)
    rect = nb.math('MULTIPLY', nb.math('MULTIPLY', nb.math('GREATER_THAN', x, .024), nb.math('LESS_THAN', x, .182)), nb.math('LESS_THAN', nb.math('ABSOLUTE', nb.math('SUBTRACT', y, cy)), .088))
    txt = nb.math('MULTIPLY', nb.math('MULTIPLY', ln, wd), rect); shade = nb.math('MULTIPLY_ADD', nb.math('MINIMUM', nb.math('DIVIDE', ax, .07), 1.0), .28, .72)
    c = nb.mix(nb.math('MULTIPLY', txt, .55), lin('#f2ede1'), lin('#4f4c48'))
    gx = nb.math('DIVIDE', nb.math('ADD', x, .18), .052); gy = nb.math('DIVIDE', nb.math('SUBTRACT', y, cy - .075), .075); fx = nb.math('FRACT', gx); fy = nb.math('FRACT', gy)       # цветовые образцы на левой странице
    cell = nb.math('MULTIPLY', nb.math('MULTIPLY', nb.math('GREATER_THAN', fx, .1), nb.math('LESS_THAN', fx, .9)), nb.math('MULTIPLY', nb.math('GREATER_THAN', fy, .12), nb.math('LESS_THAN', fy, .88)))
    area = nb.math('MULTIPLY', nb.math('MULTIPLY', nb.math('GREATER_THAN', x, -.182), nb.math('LESS_THAN', x, -.026)), nb.math('MULTIPLY', nb.math('GREATER_THAN', gy, 0), nb.math('LESS_THAN', gy, 2)))
    idx = nb.math('ADD', nb.math('FLOOR', gx), nb.math('MULTIPLY', nb.math('FLOOR', gy), 3)); sw = ramp(nb, nb.math('FRACT', nb.math('MULTIPLY_ADD', idx, .37, .13)),
        [(0, '#e8d3c4'), (.17, '#d7b9a0'), (.34, '#c99690'), (.5, '#a98b7c'), (.67, '#e6cfa9'), (.84, '#efe3d2')]); c = nb.mix(nb.math('MULTIPLY', cell, area), c, sw)
    nb.L.new(nb.mix(1.0, c, shade, 'MULTIPLY'), b.inputs['Base Color']); AA._set(b, .8, 'Roughness'); return m


def local_box(name, mat, w, d, h, loc, rot=(0, 0, 0)):
    b = AA.box(name, mat, -.5, .5, -.5, .5, 0, 1, 0); b.scale = (w, d, h); b.location = loc; b.rotation_euler = rot; return b


def tray(x, y, z, w, d, yaw, nam):
    root = bpy.data.objects.new(nam, None); link(root); root.location = (x, y, z); root.rotation_euler = (0, 0, math.radians(yaw))
    AA.box('tray', DM['white'], -w / 2, w / 2, -d / 2, d / 2, 0, .007, .0025).parent = root
    for a, b_, c, e in ((-w / 2, w / 2, -d / 2, -d / 2 + .004), (-w / 2, w / 2, d / 2 - .004, d / 2), (-w / 2, -w / 2 + .004, -d / 2, d / 2), (w / 2 - .004, w / 2, -d / 2, d / 2)): AA.box('rim', DM_BRASS, a, b_, c, e, .007, .0125, .0008).parent = root
    return root


def ampoule(x, y, z):
    lathe('amp', [(0, 0), (.0085, 0), (.0085, .036), (.0036, .050), (.0036, .063), (.0001, .065)], DM['glass'], x, y, z, 24); lathe('amp_l', [(0, .004), (.0072, .004), (.0072, .033), (.003, .043), (0, .043)], DM['amber'], x, y, z, 24)


def table_set(M):
    global DM_BRASS
    DM_BRASS = M['brass']; cx, cy = 0.0, 1.0
    for i, (z0, z1, r) in enumerate(((0, .09, .150), (.09, .18, .145), (.18, .27, .152))): disc('ped%d' % i, M['trav_c'] if i != 1 else M['trav_c2'], cx, cy, r, z0 + .001 * i, z1, .003)
    disc('top', M['trav'], cx, cy, .46, .27, .305, .006); zt = .305
    open_book(M, cx - .14, cy + .14, zt)                                                                                                        # раскрытый каталог с цветовыми образцами
    tb = local_box('tab', DM['alu'], .245, .170, .008, (cx - .09, cy - .13, zt), (math.radians(-2), 0, math.radians(7))); local_box('tab_s', DM['screen'], .233, .158, .0004, (cx - .09, cy - .13, zt + .0082), (math.radians(-2), 0, math.radians(7)))
    tray(cx + .19, cy - .10, zt, .30, .17, -8, 'tray1')
    for i in range(8):
        a = math.radians(-8); lx = -.119 + i * .034; ampoule(cx + .19 + lx * math.cos(a), cy - .10 + lx * math.sin(a), zt + .007)
    tray(cx + .22, cy + .10, zt, .22, .12, 4, 'tray2'); pack('dropper', 'dermatime', cx + .13, cy + .115, zt + .007 + .017 * .8, -4, .8, True); pack('dropper', 'endocare', cx + .13, cy + .085, zt + .007 + .017 * .8, 3, .8, True)
    for i, (dx, dy) in enumerate(((.02, .30), (.09, .33), (.05, .24))): pack('jar', 'dermatime' if i != 1 else 'eva', cx + dx, cy + dy, zt, i * 40, .42)                               # образцы
    pack('tube', 'biretix', cx + .31, cy + .24, zt + .0085, 20, .5, True); pack('box', None, cx + .36, cy + .12, zt, 12, .55)
    gx, gy = cx + .30, cy + .22; lathe('wglass', [(0, 0), (.029, 0), (.029, 0), (.0345, .10), (.0315, .10), (.0265, .006), (0, .006)], DM['glass'], gx, gy, zt, 56); lathe('water', [(0, .007), (.0265, .007), (.0325, .072), (0, .072)], DM['water'], gx, gy, zt, 56)


def chair(M, x, y, yaw):
    root = bpy.data.objects.new('chair', None); link(root); root.location = (x, y, 0); root.rotation_euler = (0, 0, math.radians(yaw)); root.scale = (.82,) * 3; f = DM['chair']
    for sx in (-.21, .21):
        for sy in (-.19, .19): lathe('leg', [(.012, 0), (.012, 0), (.0075, .30), (0.0001, .30)], M['brass'], sx, sy, 0, 24).parent = root
    RL.cushion('cb', f, .56, .52, .08, (0, 0, .305), parent=root, r=.02, rz=.025, belly=.003, wrinkle=.0005, seed=1, n=22)
    RL.cushion('cs', f, .50, .46, .07, (0, -.02, .378), parent=root, r=.02, rz=.03, crown=.012, crown_b=.15, belly=.006, sag=.003, wrinkle=.0012, seed=2, n=28)
    RL.cushion('cbk', f, .56, .09, .44, (0, .235, .60), rot=(math.radians(-7), 0, 0), parent=root, r=.025, rz=.03, crown=.010, belly=.006, wrinkle=.001, seed=3, n=28)


def stool(M, x, y):
    m = RL.fabric_boucle('d_stool', (.93, .89, .80), 1.25); lathe('stool_seat', [(0, .40)] + cr([(.0001, .40), (.14, .395), (.168, .41), (.17, .44), (.15, .465), (.08, .475)], 5) + [(0, .477)], m, x, y, 0, 80)
    disc('stool_col', M['brass'], x, y, .016, .012, .40, .002, 32); disc('stool_base', M['brass'], x, y, .15, 0, .012, .003, 64); torus('stool_ring', .115, .0045, (x, y, .20), (0, 0, 0), M['brass'])
    for a in (.4, 2.5, 4.6): disc('stool_arm', M['brass'], x + .06 * math.cos(a), y + .06 * math.sin(a), .004, .012, .2, .0008, 12)


def column(M, x, y):
    disc('col', M['trav_c'], x, y, .16, 0, .62, .005, 80); disc('col_cap', M['trav_h'], x, y, .17, .62, .635, .003, 80); sphere('col_pearl', .06, x - .03, y, .635 + .058, DM['pearl'])
    pack('pump', 'dermatime', x + .09, y + .02, .635, 5, .9); pack('jar', 'eva', x + .03, y - .09, .635, 30, .7)


def wall_display(M):
    cz = 1.55; AA.box('lbox', DM['lightbox'], -.30, .30, D - .026, D - .014, cz - .30, cz + .30, 0).visible_shadow = False
    for a, b_, c, e in ((-.31, .31, cz - .31, cz - .30), (-.31, .31, cz + .30, cz + .31), (-.31, -.30, cz - .31, cz + .31), (.30, .31, cz - .31, cz + .31)): AA.box('lb_f', M['brass'], a, b_, D - .03, D - .012, c, e, .0008)
    zs = cz - .27; AA.box('wsh', DM['glass_sh'], -.27, .27, D - .13, D - .016, zs, zs + .012, .0015); AA.box('wsh_f', M['brass'], -.27, .27, D - .13, D - .125, zs - .004, zs + .016, .001)
    for i, (kd, br, dx) in enumerate((('dropper', 'dermatime', -.20), ('jar', 'eva', -.11), ('bottle', 'endocare', -.01), ('pump', 'dermatime', .09), ('dropper', 'biretix', .17), ('jar', 'dermatime', .23))): pack(kd, br, dx, D - .075, zs + .012, i * 20, .92)


def build():
    global BARK, DM_SOIL, DM_GOBO, OLV, FIC, PKM
    M = make_materials(); decor_mats(); BARK = M['bark']; DM_SOIL = M['soil']; DM_GOBO = M['gobo']; OLV = olive_leaves(); FIC = ficus_leaves(); PKM = PK.M()
    shell(M); build_shelves(M); table_set(M); chair(M, -1.12, 1.55, 58); chair(M, 1.0, 1.12, -68)    # левый нижний угол кадра остаётся чистым: под шар-Стеллу страницы; stool(M, 1.50, 1.45); column(M, .78, 1.98); wall_display(M)
    pot(2.18, 2.02, .16, .30, DM['white']); tree(2.18, 2.02, .29, 1.15, random.Random(11), OLV, nbr=9, cnt=30, k=1.25, r0=.014)                       # высокая олива в углу справа
    pot(1.93, 1.02, .15, .27, DM['terra']); tree(1.93, 1.02, .26, .95, random.Random(13), FIC, nbr=7, cnt=12, k=1.0, r0=.013)                            # фикус
    window_curtain(M)
    print('сцена: объектов %d' % len(bpy.data.objects), flush=True)


if __name__ == '__main__':
    main()
