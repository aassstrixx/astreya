#!/usr/bin/env python3
"""Сцена шоурума в 3D (Blender/Cycles): светлый зал с арками, нишей со стеклянными полками и тёплой LED-подсветкой, ступенями и платформой из травертина, диском, окном с косым светом.
Рендерится ОТДЕЛЬНЫМИ СЛОЯМИ с одной камеры (стена и пол, левая арка, ниша, ступени, платформа, диск, растение): тень и отражённый свет каждого объекта попадают во все слои, но сам объект виден только в своём.
Слои складываются на странице каталога в CSS (css/showroom.css), подиумы и товары — живой HTML поверх.
   python3 tools/showroom-assets/scene.py            — все слои в полном качестве (assets/showroom/layer-*.webp, anchors.json)
   python3 tools/showroom-assets/scene.py preview    — один быстрый кадр целиком (/tmp/scene_preview.png)
Переменные: SCENE_W (ширина, по умолчанию 1920), SCENE_SPP (сэмплов), SCENE_LAYERS (список через запятую)."""
import bpy, bmesh, math, os, sys, json, addon_utils
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'assets', 'showroom'); os.makedirs(OUT, exist_ok=True)
W = int(os.environ.get('SCENE_W', 1920)); H = round(W * 1024 / 1536); SPP = int(os.environ.get('SCENE_SPP', 128))
CANVAS = (1536, 1024)
CAM = {'loc': (0.0, -12.0, 0.9), 'lens': 50.0}

# ---------------- материалы ----------------
def mk(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL' and n.type != 'BSDF_PRINCIPLED': nt.nodes.remove(n)
    return m, nt, nt.nodes['Principled BSDF'], nt.nodes['Material Output']
def inp(b, *names):
    for n in names:
        if n in b.inputs: return b.inputs[n]
def val(b, v, *names):
    i = inp(b, *names)
    if i is not None: i.default_value = v
def ramp(nt, stops, loc=(0, 0)):
    r = nt.nodes.new('ShaderNodeValToRGB'); r.location = loc
    while len(r.color_ramp.elements) < len(stops): r.color_ramp.elements.new(.5)
    for e, (p, c) in zip(r.color_ramp.elements, stops): e.position = p; e.color = c
    return r
def tex_coord(nt, scale=(1, 1, 1), loc=(-1200, 0)):
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); return mp.outputs['Vector']

def mat_travertine(name='travertine', tint=(1, 1, 1), scale=1.0, pits=1.0):
    m, nt, b, out = mk(name); L = nt.links
    v = tex_coord(nt, (1.2 * scale, 1.2 * scale, 4.0 * scale))
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 2.2; n1.inputs['Detail'].default_value = 7; n1.inputs['Roughness'].default_value = .62; L.new(v, n1.inputs['Vector']) if hasattr(L, 'new') else None
    L.new(v, n1.inputs['Vector'])
    band = ramp(nt, [(.35, (.80 * tint[0], .72 * tint[1], .58 * tint[2], 1)), (.62, (.90 * tint[0], .83 * tint[1], .70 * tint[2], 1))]); L.new(n1.outputs['Fac'], band.inputs['Fac'])
    v2 = tex_coord(nt, (9 * scale, 9 * scale, 14 * scale)); vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 3.0; vo.inputs['Randomness'].default_value = 1.0; L.new(v2, vo.inputs['Vector'])
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 4; n2.inputs['Detail'].default_value = 4; L.new(v2, n2.inputs['Vector'])
    pit = ramp(nt, [(.0, (0, 0, 0, 1)), (.06, (1, 1, 1, 1))]); pit.color_ramp.interpolation = 'LINEAR'
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L.new(vo.outputs['Distance'], inv.inputs[1])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; L.new(inv.outputs[0], mul.inputs[0]); L.new(n2.outputs['Fac'], mul.inputs[1])
    thr = nt.nodes.new('ShaderNodeMath'); thr.operation = 'GREATER_THAN'; thr.inputs[1].default_value = 1.0 - 0.17 * pits; L.new(inv.outputs[0], thr.inputs[0])
    pit_mask = nt.nodes.new('ShaderNodeMath'); pit_mask.operation = 'MULTIPLY'; L.new(thr.outputs[0], pit_mask.inputs[0]); pit_mask.inputs[1].default_value = 1.0
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['B'].default_value = (.46 * tint[0], .38 * tint[1], .27 * tint[2], 1); L.new(band.outputs['Color'], mix.inputs['A']); L.new(pit_mask.outputs[0], mix.inputs['Factor'])
    L.new(mix.outputs['Result'], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .5; bump.inputs['Distance'].default_value = .01
    bs = nt.nodes.new('ShaderNodeMath'); bs.operation = 'ADD'; L.new(n2.outputs['Fac'], bs.inputs[0]); L.new(pit_mask.outputs[0], bs.inputs[1]); bs.inputs[1].default_value = 0
    bsub = nt.nodes.new('ShaderNodeMath'); bsub.operation = 'SUBTRACT'; L.new(n2.outputs['Fac'], bsub.inputs[0]); L.new(pit_mask.outputs[0], bsub.inputs[1])
    L.new(bsub.outputs[0], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    val(b, .62, 'Roughness'); val(b, .35, 'Specular IOR Level', 'Specular')
    return m
def mat_plaster(name='plaster', col=(.90, .85, .76), rough=.8):
    m, nt, b, out = mk(name); L = nt.links
    v = tex_coord(nt, (1, 1, 1)); n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 1.8; n.inputs['Detail'].default_value = 3; L.new(v, n.inputs['Vector'])
    c = ramp(nt, [(.3, (col[0] * .965, col[1] * .965, col[2] * .96, 1)), (.7, (col[0] * 1.02, col[1] * 1.02, col[2] * 1.02, 1))]); L.new(n.outputs['Fac'], c.inputs['Fac']); L.new(c.outputs['Color'], b.inputs['Base Color'])
    v2 = tex_coord(nt, (60, 60, 60)); n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 3; n2.inputs['Detail'].default_value = 10; L.new(v2, n2.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .18; bp.inputs['Distance'].default_value = .004; L.new(n2.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    val(b, rough, 'Roughness'); val(b, .25, 'Specular IOR Level', 'Specular')
    return m
def mat_floor(name='floor'):
    m, nt, b, out = mk(name); L = nt.links
    v = tex_coord(nt, (.35, .35, .35)); n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 1.4; n.inputs['Detail'].default_value = 6; L.new(v, n.inputs['Vector'])
    c = ramp(nt, [(.3, (.80, .70, .56, 1)), (.7, (.90, .81, .68, 1))]); L.new(n.outputs['Fac'], c.inputs['Fac']); L.new(c.outputs['Color'], b.inputs['Base Color'])
    val(b, .16, 'Roughness'); val(b, .35, 'Coat Weight', 'Clearcoat'); val(b, .05, 'Coat Roughness', 'Clearcoat Roughness'); val(b, .6, 'Specular IOR Level', 'Specular')
    return m
def mat_led(name='led', strength=22.0, col=(1.0, .78, .46)):
    m, nt, b, out = mk(name); nt.nodes.remove(b)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*col, 1); em.inputs['Strength'].default_value = strength; nt.links.new(em.outputs[0], out.inputs[0]); return m
def mat_glass(name='glass', col=(.93, .90, .84), rough=.12, a=.55):
    m, nt, b, out = mk(name); val(b, (*col, 1), 'Base Color'); val(b, rough, 'Roughness'); val(b, .9, 'Transmission Weight', 'Transmission'); val(b, 1.45, 'IOR'); return m
def mat_simple(name, col, rough=.5, metal=0.0):
    m, nt, b, out = mk(name); val(b, (*col, 1), 'Base Color'); val(b, rough, 'Roughness'); val(b, metal, 'Metallic'); return m

# ---------------- геометрия ----------------
def link(ob, grp):
    bpy.context.collection.objects.link(ob); ob['grp'] = grp; return ob
def mesh_obj(name, verts, faces, mat, grp, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update(); ob = bpy.data.objects.new(name, me); me.materials.append(mat)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return link(ob, grp)
def box(name, mat, x0, x1, y0, y1, z0, z1, grp, bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1); ob = bpy.context.object; ob.name = name
    ob.scale = (x1 - x0, y1 - y0, z1 - z0); ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); bpy.ops.object.transform_apply(location=True, scale=True)
    if bev:
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bev; bv.segments = 3; bv.limit_method = 'ANGLE'
    ob.data.materials.append(mat); ob['grp'] = grp; return ob
def cylinder(name, mat, cx, cy, r, z0, z1, grp, seg=128, bev=0.02):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=z1 - z0, location=(cx, cy, (z0 + z1) / 2)); ob = bpy.context.object; ob.name = name
    if bev:
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bev; bv.segments = 4; bv.limit_method = 'ANGLE'
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(mat); ob['grp'] = grp; return ob
def arch_path(cx, rx, zs, n=72, leg0=0.0):
    """контур арки: левая нога вверх, полуэллипс, правая нога вниз (x,z)"""
    pts = [(cx - rx, leg0)]
    for i in range(n + 1):
        a = math.pi - math.pi * i / n; pts.append((cx + rx * math.cos(a), zs + rx * math.sin(a)))
    pts.append((cx + rx, leg0)); return pts
def arch_solid(name, mat, cx, rx, zs, y0, y1, grp, z0=-0.05):
    """сплошное тело арочного окна (для выреза): прямоугольник + полукруг"""
    pts = arch_path(cx, rx, zs, leg0=z0)
    verts = [(x, y0, z) for x, z in pts] + [(x, y1, z) for x, z in pts]; n = len(pts)
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    ob = mesh_obj(name, verts, faces, mat, grp); return ob
def arch_frame(name, mat, cx, rx, zs, t, y0, y1, grp, n=96, z0=0.0):
    """толстая арочная рама: внешний и внутренний контуры, лицо, откосы"""
    po = arch_path(cx, rx + t, zs, n, z0); pi = arch_path(cx, rx, zs, n, z0)
    # внешний контур: сдвиг по нормали — для эллипса достаточно увеличить радиус; ноги — по x
    verts, faces = [], []; m = len(po)
    for y in (y0, y1):
        for p in po: verts.append((p[0], y, p[1]))
        for p in pi: verts.append((p[0], y, p[1]))
    def idx(layer, ring, i): return layer * 2 * m + ring * m + i
    for i in range(m - 1):
        faces.append((idx(0, 0, i), idx(0, 0, i + 1), idx(0, 1, i + 1), idx(0, 1, i)))                       # лицо (перед)
        faces.append((idx(1, 1, i), idx(1, 1, i + 1), idx(1, 0, i + 1), idx(1, 0, i)))                       # зад
        faces.append((idx(0, 1, i), idx(0, 1, i + 1), idx(1, 1, i + 1), idx(1, 1, i)))                       # внутренний откос
        faces.append((idx(1, 0, i), idx(1, 0, i + 1), idx(0, 0, i + 1), idx(0, 0, i)))                       # внешняя боковая
    faces.append((idx(0, 0, 0), idx(0, 1, 0), idx(1, 1, 0), idx(1, 0, 0))); faces.append((idx(0, 1, m - 1), idx(0, 0, m - 1), idx(1, 0, m - 1), idx(1, 1, m - 1)))
    return mesh_obj(name, verts, faces, mat, grp, smooth=False)

def set_cam(sc, loc=None, lens=None, pitch=0.0):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens or CAM['lens']; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam)
    cam.location = loc or CAM['loc']; cam.rotation_euler = (math.radians(90 - pitch), 0, 0); sc.camera = cam; return cam

def build(sc):
    M = {'plaster': mat_plaster('plaster', (.89, .79, .65)), 'plaster2': mat_plaster('plaster2', (.94, .87, .76), .7), 'trav': mat_travertine('trav', (1.02, .94, .82)), 'trav2': mat_travertine('trav2', (1.04, .97, .86), 1.4, .7), 'floor': mat_floor(),
         'led': mat_led(), 'glass': mat_glass(), 'back': mat_plaster('back', (.95, .87, .73), .85), 'ring': mat_plaster('ring', (.97, .92, .83), .5), 'white': mat_simple('white', (.95, .93, .88), .35), 'dark': mat_simple('dark', (.05, .045, .04), .25)}
    ob = []
    # --- пол и стены
    floor = box('floor', M['floor'], -14, 14, -16, 6, -0.4, 0.0, 'shell')
    # стена с вырезами (булевы операции)
    wall = box('wall', M['plaster'], -9, 9, 0.0, 0.45, 0.0, 7.0, 'shell')
    LA = {'cx': 0.95, 'rx': 3.2, 'zs': 1.25}
    NI = {'cx': 3.6, 'rx': 1.55, 'zs': 2.3}
    cut1 = arch_solid('cut1', M['plaster'], LA['cx'], LA['rx'], LA['zs'], -0.3, 0.8, 'shell'); cut2 = arch_solid('cut2', M['plaster'], NI['cx'], NI['rx'], NI['zs'], -0.3, 2.9, 'shell')
    for c in (cut1, cut2):
        bm = wall.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = c; bm.solver = 'EXACT'
    for c in (cut1, cut2): c.hide_render = True; c.display_type = 'WIRE'
    # светлая панель за левой аркой и задняя стена ниши
    back1 = box('back1', M['back'], -4.5, 7.5, 1.15, 1.6, 0.0, 6.0, 'shell')
    bm1 = back1.modifiers.new('cut', 'BOOLEAN'); bm1.operation = 'DIFFERENCE'; bm1.object = cut2; bm1.solver = 'EXACT'
    back2 = box('back2', M['back'], NI['cx'] - NI['rx'] - .1, NI['cx'] + NI['rx'] + .1, 2.6, 3.05, 0.0, 5.0, 'niche')
    # --- левая арка-рама (толстая, матовое стекло / камень), выступает вперёд
    ring = arch_frame('ring', M['ring'], LA['cx'], LA['rx'], LA['zs'], .34, -0.55, 0.02, 'ring')
    clipb = box('clipb', M['plaster'], 1.25, 9.0, -2.0, 1.0, -1.0, 9.0, 'x'); clipb.hide_render = True; clipb.display_type = 'WIRE'
    bmr = ring.modifiers.new('clip', 'BOOLEAN'); bmr.operation = 'DIFFERENCE'; bmr.object = clipb; bmr.solver = 'EXACT'
    # --- ниша справа: тонкая рама и три стеклянные полки с тёплой подсветкой; вторая, внутренняя ниша
    nring = arch_frame('nring', M['plaster2'], NI['cx'], NI['rx'], NI['zs'], .14, -0.1, 0.02, 'niche')
    for k, z in enumerate((0.62, 1.42, 2.22)):
        box('shelf%d' % k, M['glass'], NI['cx'] - NI['rx'], NI['cx'] + NI['rx'], 1.05, 2.55, z, z + .04, 'niche')
        box('led%d' % k, M['led'], NI['cx'] - NI['rx'] + .02, NI['cx'] + NI['rx'] - .02, 2.50, 2.56, z - .02, z + .0, 'niche')
    nled = arch_frame('nled', M['led'], NI['cx'], NI['rx'] - .05, NI['zs'] - .05, .035, 2.45, 2.5, 'niche')
    # --- платформа и ступени (травертин)
    dais = cylinder('dais', M['trav'], 0.95, -2.35, 3.15, 0.0, 0.30, 'dais', bev=0.03)
    stepl = cylinder('stepl', M['trav'], -1.9, -0.7, 1.55, 0.0, 0.55, 'steps', bev=0.025)
    stepr = cylinder('stepr', M['trav'], 4.1, -0.9, 2.1, 0.0, 0.42, 'steps', bev=0.03)
    for st_ in (stepl, stepr):                                              # платформа и ступени — одно тело (объединение): без скрытых внутренних граней
        bmd = dais.modifiers.new('uni', 'BOOLEAN'); bmd.operation = 'UNION'; bmd.object = st_; bmd.solver = 'EXACT'; st_.hide_render = True; st_.display_type = 'WIRE'
    pod = cylinder('pod', M['trav2'], 0.2, -6.8, 1.0, 0.0, 1.0, 'pod', seg=160, bev=0.0)
    plant(M)
    return M

def leaf_mesh(L=.17, Wd=.05):
    n = 8; verts = []; faces = []
    for i in range(n + 1):
        t = i / n; w = Wd * math.sin(math.pi * (t ** .8)) * (1 - .15 * t); y = L * t; z = .014 * math.sin(math.pi * t) - .012 * (t ** 2)
        verts += [(-w, y, z + .006), (w, y, z + .006)]
    for i in range(n): faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    me = bpy.data.meshes.new('leaf'); me.from_pydata(verts, [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    return me

def plant(M):
    import random; rnd = random.Random(5)
    m1 = mk('leafA'); nt = m1[1]; b = m1[2]; val(b, (.30, .38, .19, 1), 'Base Color'); val(b, .5, 'Roughness'); val(b, .25, 'Transmission Weight', 'Transmission'); val(b, .3, 'Subsurface Weight'); val(b, (.45, .5, .26), 'Subsurface Radius') if False else None
    m2 = mk('leafU'); val(m2[2], (.66, .70, .54, 1), 'Base Color'); val(m2[2], .55, 'Roughness')
    stem = mk('stem'); val(stem[2], (.30, .26, .16, 1), 'Base Color'); val(stem[2], .6, 'Roughness')
    me = leaf_mesh(); me.materials.append(m1[0]); me2 = leaf_mesh(); me2.materials.append(m2[0])
    vase_m = mat_simple('vase', (.95, .91, .84), .22)
    # ваза на левой ступени
    prof = [(0.0, 0.0), (.055, 0.0), (.085, .03), (.105, .09), (.11, .15), (.09, .22), (.05, .27), (.04, .30), (.05, .33), (0, .33)]
    rings = []
    verts, faces = [], []; seg = 64
    for (r, z) in prof:
        for k in range(seg): a = 2 * math.pi * k / seg; verts.append((r * math.cos(a), r * math.sin(a), z))
    for i in range(len(prof) - 1):
        for k in range(seg): faces.append((i * seg + k, i * seg + (k + 1) % seg, (i + 1) * seg + (k + 1) % seg, (i + 1) * seg + k))
    vase = mesh_obj('vase', verts, faces, vase_m, 'plant', smooth=True); vase.location = (-1.9, -0.7, 0.55); vase.scale = (1.5, 1.5, 1.5)
    def branch(base, pts, n, sc=1.0, grp='plant'):
        # pts — контрольные точки (x,y,z), кривая Катмулла–Рома упрощённо ломаной
        P = [Vector(base) + Vector(p) for p in pts]
        verts, edges = [], []
        # стебель: трубка
        curve = bpy.data.curves.new('st', 'CURVE'); curve.dimensions = '3D'; sp = curve.splines.new('POLY'); sp.points.add(len(P) - 1)
        for i, p in enumerate(P): sp.points[i].co = (*p, 1)
        curve.bevel_depth = .0028 * sc; curve.bevel_resolution = 2
        co = bpy.data.objects.new('stem', curve); curve.materials.append(stem[0]); link(co, grp)
        def at(t):
            f = t * (len(P) - 1); i = min(int(f), len(P) - 2); u = f - i; return P[i].lerp(P[i + 1], u)
        for i in range(1, n + 1):
            t = i / (n + 1) * .96 + .04; pos = at(t); nxt = at(min(1, t + .03)); d = (nxt - pos).normalized()
            for side in (-1, 1):
                ob = bpy.data.objects.new('lf', me if rnd.random() > .28 else me2); link(ob, grp)
                ob.scale = (sc * (1.0 - .35 * t) * (.85 + rnd.random() * .3),) * 3
                # ориентируем лист: ось +Y листа — по направлению от стебля в сторону side с наклоном вперёд по d
                dirv = (d * .55 + Vector((side * 1.0, rnd.uniform(-.25, .35), rnd.uniform(.05, .35)))).normalized()
                ob.rotation_euler = dirv.to_track_quat('Y', 'Z').to_euler(); ob.location = pos
        # верхний листок
        ob = bpy.data.objects.new('lf', me); link(ob, grp); ob.scale = (sc * .7,) * 3; ob.rotation_euler = at(1.0).__sub__(at(.97)).normalized().to_track_quat('Y', 'Z').to_euler(); ob.location = at(1.0)
    base = (-1.9, -0.7, 0.55 + .48)
    branch(base, [(0, 0, 0), (-.06, 0, .5), (-.18, .02, 1.0), (-.36, .04, 1.45)], 22, 1.7)
    branch(base, [(0, 0, 0), (.14, 0, .38), (.46, -.02, .72), (.88, -.05, .88)], 22, 1.6)
    branch(base, [(0, 0, 0), (-.1, .02, .3), (-.34, 0, .56), (-.68, -.03, .66)], 18, 1.5)
    branch(base, [(0, 0, 0), (.03, 0, .55), (.16, .01, 1.1), (.24, .02, 1.58)], 22, 1.6)
    branch(base, [(0, 0, 0), (.1, 0, .3), (.3, .03, .62), (.5, .03, 1.08)], 16, 1.4)
    # ветка в нише (справа внизу)
    branch((5.0, 1.5, 0.0), [(0, 0, 0), (0, 0, .5), (-.06, 0, 1.05), (-.2, 0, 1.55)], 20, 1.2, 'plant')

def lights(sc):
    # окно: солнце сквозь переплёт (переплёт невидим для камеры, но отбрасывает тень)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = float(os.environ.get('SUN', 4.0)); sun.angle = math.radians(1.6); sun.color = (1.0, .93, .80)
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    direction = Vector((.62, .72, -.55)).normalized(); so.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); so.location = (-6, -9, 7)
    mat = mat_simple('frame', (.1, .1, .1))
    # переплёт: рама 2×3 клетки, лежит в плоскости, перпендикулярной лучу, на расстоянии от сцены
    center = Vector((-1.5, -1.5, 2.0)) - direction * 9.0
    ex = direction.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(direction).normalized()
    bars = []
    def bar(u0, v0, u1, v1):
        o = Vector((0, 0, 0)); bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object
        b.scale = (abs(u1 - u0) * 1.0, 0.05, abs(v1 - v0) * 1.0); b.location = center + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2); b.rotation_euler = Matrix((ex, direction, ey)).transposed().to_euler()
        b.data.materials.append(mat); b.visible_camera = False; b['grp'] = 'gobo'; bars.append(b)
    u_min, u_max, v_min, v_max = -6.0, 6.0, -3.2, 3.2
    for u in np.linspace(u_min, u_max, 5): bar(u - .06, v_min, u + .06, v_max)
    for v in np.linspace(v_min, v_max, 4): bar(u_min, v - .06, u_max, v + .06)
    bar(u_min - 4, v_max, u_max + 4, v_max + 4); bar(u_min - 4, v_min - 4, u_max + 4, v_min); bar(u_min - 4, v_min, u_min, v_max); bar(u_max, v_min, u_max + 4, v_max)
    # мягкий заполняющий свет «из зала»
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = float(os.environ.get('FILL', 380)); ar.size = 9; ar.size_y = 5; ar.color = (1.0, .93, .82)
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = (-2.5, -11.0, 5.5); ao.rotation_euler = (math.radians(70), 0, math.radians(8))
    ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.98, .90, .78, 1); bg.inputs['Strength'].default_value = float(os.environ.get('WORLD', 0.30)); sc.world = w

def settings(sc, w=W, h=H, spp=SPP):
    addon_utils.enable('cycles'); sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.device = 'CPU'; cy.samples = spp; cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
    cy.max_bounces = 8; cy.diffuse_bounces = 5; cy.glossy_bounces = 4; cy.transmission_bounces = 6; cy.transparent_max_bounces = 12; cy.caustics_reflective = False; cy.caustics_refractive = False
    cy.sample_clamp_indirect = 8
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'; sc.view_settings.exposure = float(os.environ.get('EXPO', -0.1))
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'

LAYERS = ['shell', 'niche', 'ring', 'dais', 'plant', 'pod']
def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (v.x * CANVAS[0], (1 - v.y) * CANVAS[1])

def anchors(sc, cam):
    out = {}
    def rim(cx, cy, r, z):
        pts = [proj(sc, cam, (cx + r * math.cos(a), cy + r * math.sin(a), z)) for a in np.linspace(0, 2 * math.pi, 72, endpoint=False)]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; return {'cx': round((min(xs) + max(xs)) / 2, 1), 'cy': round((min(ys) + max(ys)) / 2, 1), 'rx': round((max(xs) - min(xs)) / 2, 1), 'ry': round((max(ys) - min(ys)) / 2, 1)}
    out['dais'] = rim(0.95, -2.35, 3.15, 0.30); out['stepl'] = rim(-1.9, -0.7, 1.55, 0.55); out['stepr'] = rim(4.1, -0.9, 2.1, 0.42)
    out['shelves'] = [{'y': round(proj(sc, cam, (3.6, 1.8, z + .04))[1], 1), 'x0': round(proj(sc, cam, (2.15, 1.8, z))[0], 1), 'x1': round(proj(sc, cam, (5.0, 1.8, z))[0], 1)} for z in (0.62, 1.42, 2.22)]
    out['vase'] = {'x': round(proj(sc, cam, (-1.9, -0.7, 0.55))[0], 1), 'y': round(proj(sc, cam, (-1.9, -0.7, 0.55))[1], 1)}
    return out

def pod_sprites(sc, cam, f, meta):
    """спрайты подиума-цилиндра: верхняя грань (эллипс) и боковая стенка (прямоугольник между центрами верхней и нижней окружностей); сайт тянет их под любой размер подиума"""
    from PIL import ImageDraw
    im = Image.open(f).convert('RGBA'); k = im.width / CANVAS[0]
    def P(a, z): x, y = proj(sc, cam, (0.2 + math.cos(a), -6.8 + math.sin(a), z)); return x * k, y * k
    top = [P(a, 1.0) for a in np.linspace(0, 2 * math.pi, 180, endpoint=False)]; bot = [P(a, 0.0) for a in np.linspace(0, 2 * math.pi, 180, endpoint=False)]
    tx = [p[0] for p in top]; ty = [p[1] for p in top]; by = [p[1] for p in bot]
    cx0, cx1, cy0, cy1 = min(tx), max(tx), min(ty), max(ty)
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).polygon(top, fill=255)
    cap = Image.composite(im, Image.new('RGBA', im.size, (0, 0, 0, 0)), mask).crop((int(cx0), int(cy0), int(cx1) + 1, int(cy1) + 1))
    y_a = (cy0 + cy1) / 2; y_b = (min(by) + max(by)) / 2
    body = im.crop((int(cx0), int(y_a), int(cx1) + 1, int(y_b))).convert('RGB')
    from PIL import ImageEnhance
    g = lambda im_: ImageEnhance.Brightness(im_).enhance(float(os.environ.get('POD_GAIN', 1.16)))
    w_ = body.width; body = body.crop((int(w_ * .018), 0, int(w_ * .982), body.height))                       # без тёмной кромки силуэта
    cap_rgb = g(cap.convert('RGB')); cap = Image.merge('RGBA', (*cap_rgb.split(), cap.getchannel('A'))); body = g(body)
    cap.save(os.path.join(OUT, 'pod-cap.webp'), 'WEBP', quality=90, method=6, alpha_quality=95); body.save(os.path.join(OUT, 'pod-body.webp'), 'WEBP', quality=88, method=6)
    meta['pod'] = {'cap': 'assets/showroom/pod-cap.webp', 'body': 'assets/showroom/pod-body.webp', 'capRatio': round(cap.height / cap.width, 4), 'bodyRatio': round(body.height / body.width, 4), 'capW': cap.width, 'bodyH': body.height}
    print('pod', meta['pod'], flush=True)

def render_layers(sc, cam0, names):
    cam = cam0
    objs = [o for o in bpy.data.objects if 'grp' in o.keys() and o['grp'] != 'gobo' and o.type in ('MESH', 'CURVE')]
    sc.render.film_transparent = True; meta = {}
    mp = os.path.join(OUT, 'layers.json'); old = json.load(open(mp)) if os.path.exists(mp) else {}
    for L in names:
        for o in objs:
            o.visible_camera = (o['grp'] == L); o.hide_render = (o['grp'] == 'pod' and L != 'pod')          # подиум-образец виден и отбрасывает тень только в своём проходе
        if L == 'pod':                                                       # подиум снимается чуть сверху, чтобы верхняя грань читалась эллипсом (≈1:10)
            cam2 = set_cam(sc, (0.0, -12.0, 1.52), pitch=11.0); cam = cam2
        f = '/tmp/layer_%s.png' % L; sc.render.filepath = f; bpy.ops.render.render(write_still=True)
        if L == 'pod': pod_sprites(sc, cam, f, meta); sc.camera = cam0; cam = cam0; continue
        im = Image.open(f).convert('RGBA'); a = np.asarray(im.getchannel('A')); ys, xs = np.where(a > 3)
        if not len(xs): print('layer', L, 'empty'); continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1; k = CANVAS[0] / im.width
        if L == 'shell': x0, y0, x1, y1 = 0, 0, im.width, im.height
        c = im.crop((x0, y0, x1, y1)); name = 'layer-%s.webp' % L
        c.save(os.path.join(OUT, name), 'WEBP', quality=int(os.environ.get('SCENE_Q', 84)), method=6, alpha_quality=92)
        old[L] = {'file': 'assets/showroom/' + name, 'x': round(x0 * k, 2), 'y': round(y0 * k, 2), 'w': round((x1 - x0) * k, 2), 'h': round((y1 - y0) * k, 2)}
        print('layer', L, old[L], os.path.getsize(os.path.join(OUT, name)) // 1024, 'КБ', flush=True)
    old['anchors'] = anchors(sc, cam); json.dump(old, open(mp, 'w'), indent=1, ensure_ascii=False)

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    if mode == 'preview': settings(sc, 960, 640, int(os.environ.get('SCENE_SPP', 24)))
    else: settings(sc)
    M = build(sc); lights(sc); cam = set_cam(sc)
    if mode == 'preview':
        sc.render.film_transparent = False; sc.render.filepath = '/tmp/scene_preview.png'; bpy.ops.render.render(write_still=True); print('preview done'); print(json.dumps(anchors(sc, cam))); return
    names = [n for n in os.environ.get('SCENE_LAYERS', ','.join(LAYERS)).split(',') if n]
    render_layers(sc, cam, names)

if __name__ == '__main__':
    main()
