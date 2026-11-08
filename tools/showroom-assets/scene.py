#!/usr/bin/env python3
"""Сцена шоурума в 3D (Blender/Cycles): светлый зал с арками, нишей со стеклянными полками и тёплой LED-подсветкой, ступенями и платформой из травертина, диском, окном с косым светом.
Рендерится ОТДЕЛЬНЫМИ СЛОЯМИ с одной камеры (стена и пол, левая арка, ниша, ступени, платформа, диск, растение): тень и отражённый свет каждого объекта попадают во все слои, но сам объект виден только в своём.
Слои складываются на странице каталога в CSS (css/showroom.css), подиумы и товары — живой HTML поверх.
   python3 tools/showroom-assets/scene.py            — все слои в полном качестве (assets/showroom/layer-*.webp, anchors.json)
   python3 tools/showroom-assets/scene.py preview    — один быстрый кадр целиком (/tmp/scene_preview.png)
Переменные: SCENE_W (ширина, по умолчанию 1920), SCENE_SPP (сэмплов), SCENE_LAYERS (список через запятую)."""
import bpy, bmesh, math, os, sys, json, addon_utils
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import materials as MT                                    # общая библиотека камня: травертин, известняк, штукатурка, плитка (см. materials.py)
import decor                                              # объёмный декор фона: стеллаж с книгами, торшер, светильники, диван, вазы (см. decor.py)
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image, ImageFilter

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
    cam.location = loc or CAM['loc']; cam.rotation_euler = (math.radians(90 - pitch), 0, 0); sc.camera = cam; bpy.context.view_layer.update(); return cam

def add_flutes(mat, n, k):
    """вертикальные канавки по боковой стенке тела вращения (bump: sin(n·угол) вокруг оси объекта, только на вертикальных гранях; верх остаётся ровным камнем)"""
    nt_ = mat.node_tree; pb = nt_.nodes['Principled BSDF']; prev = pb.inputs['Normal'].links[0].from_socket if pb.inputs['Normal'].links else None
    tc_ = nt_.nodes.new('ShaderNodeTexCoord'); sp_ = nt_.nodes.new('ShaderNodeSeparateXYZ'); at_ = nt_.nodes.new('ShaderNodeMath'); at_.operation = 'ARCTAN2'
    nt_.links.new(tc_.outputs['Object'], sp_.inputs[0]); nt_.links.new(sp_.outputs['Y'], at_.inputs[0]); nt_.links.new(sp_.outputs['X'], at_.inputs[1])
    mu_ = nt_.nodes.new('ShaderNodeMath'); mu_.operation = 'MULTIPLY'; mu_.inputs[1].default_value = n; nt_.links.new(at_.outputs[0], mu_.inputs[0])
    sn_ = nt_.nodes.new('ShaderNodeMath'); sn_.operation = 'SINE'; nt_.links.new(mu_.outputs[0], sn_.inputs[0])
    gn_ = nt_.nodes.new('ShaderNodeNewGeometry'); sep2_ = nt_.nodes.new('ShaderNodeSeparateXYZ'); nt_.links.new(gn_.outputs['Normal'], sep2_.inputs[0])
    ab_ = nt_.nodes.new('ShaderNodeMath'); ab_.operation = 'ABSOLUTE'; nt_.links.new(sep2_.outputs['Z'], ab_.inputs[0])
    sd_ = nt_.nodes.new('ShaderNodeMath'); sd_.operation = 'LESS_THAN'; sd_.inputs[1].default_value = .35; nt_.links.new(ab_.outputs[0], sd_.inputs[0])
    hh_ = nt_.nodes.new('ShaderNodeMath'); hh_.operation = 'MULTIPLY'; nt_.links.new(sn_.outputs[0], hh_.inputs[0]); nt_.links.new(sd_.outputs[0], hh_.inputs[1])
    bp_ = nt_.nodes.new('ShaderNodeBump'); bp_.inputs['Strength'].default_value = k; bp_.inputs['Distance'].default_value = .02
    nt_.links.new(hh_.outputs[0], bp_.inputs['Height'])
    if prev is not None: nt_.links.new(prev, bp_.inputs['Normal'])
    nt_.links.new(bp_.outputs['Normal'], pb.inputs['Normal'])

def E3(name, default):
    v = os.environ.get(name); return tuple(float(x) for x in v.split(',')) if v else default

def build(sc):
    M = {'plaster': MT.lime_plaster('wall_plaster', E3('WALLC', (.93, .86, .72)), wave=float(os.environ.get('WAVE', 2.0))), 'plaster2': MT.limestone('plaster2', (.95, .90, .80)), 'trav': MT.travertine('trav', (1.02, .94, .82)), 'trav2': MT.travertine('trav2', (.86, .77, .63), 1.1, 1.0), 'trav_pod': MT.travertine('pod_stone', E3('PODT', (.86, .76, .62)), .5, 1.5), 'floor': MT.limestone_floor('floor', E3('FLOORT', (.86, .78, .64)), 2.4), 'trav_dais': MT.travertine('dais_stone', E3('DAISC', (.80, .70, .57)), .32, 1.7, honed=False),
         'led': mat_led(), 'glass': MT.satin_glass('niche_glass'), 'back': MT.lime_plaster('back_plaster', E3('BACKC', (.89, .81, .67)), wave=float(os.environ.get('WAVE', 2.0))), 'ring': MT.limestone('ring', (.94, .88, .77)), 'white': mat_simple('white', (.95, .93, .88), .35), 'dark': mat_simple('dark', (.05, .045, .04), .25)}
    import time; _t=[time.time()]
    def T(l): print('  [build] %s +%.1f с' % (l, time.time()-_t[0]), flush=True); _t[0]=time.time()
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
    bvw = wall.modifiers.new('bev', 'BEVEL'); bvw.width = .014; bvw.segments = 3; bvw.limit_method = 'ANGLE'          # кромки проёмов чуть скруглены — ловят свет, как у настоящей штукатурки
    T('стена+вырезы')
    # светлая панель за левой аркой и задняя стена ниши
    back1 = box('back1', M['back'], -4.5, 7.5, 1.15, 1.6, 0.0, 6.0, 'shell')
    bm1 = back1.modifiers.new('cut', 'BOOLEAN'); bm1.operation = 'DIFFERENCE'; bm1.object = cut2; bm1.solver = 'EXACT'
    # цоколь из травертина вдоль стены (с теми же вырезами) и рифлёная каменная пилястра между аркой и нишей — второй материал и вертикальный ритм на фоне
    plinth = box('plinth', M['trav2'], -9, 9, -0.05, 0.0, 0.0, 0.46, 'shell', bev=0.012)
    for c in (cut1, cut2):
        bmp = plinth.modifiers.new('cut', 'BOOLEAN'); bmp.operation = 'DIFFERENCE'; bmp.object = c; bmp.solver = 'EXACT'
    for i in range(9): cylinder('reed%d' % i, M['trav2'], 1.32 + i * .062, -0.03, .028, 0.0, float(os.environ.get('REED_H', 5.6)), 'shell', seg=24, bev=0)
    back2 = box('back2', M['back'], NI['cx'] - NI['rx'] - .1, NI['cx'] + NI['rx'] + .1, 2.6, 3.05, 0.0, 5.0, 'niche')
    # --- левая арка-рама (толстая, матовое стекло / камень), выступает вперёд
    ring = arch_frame('ring', M['ring'], LA['cx'], LA['rx'], LA['zs'], .34, -0.55, 0.02, 'ring')
    clipb = box('clipb', M['plaster'], 1.25, 9.0, -2.0, 1.0, -1.0, 9.0, 'x'); clipb.hide_render = True; clipb.display_type = 'WIRE'
    bmr = ring.modifiers.new('clip', 'BOOLEAN'); bmr.operation = 'DIFFERENCE'; bmr.object = clipb; bmr.solver = 'EXACT'
    bvr = ring.modifiers.new('bev', 'BEVEL'); bvr.width = .016; bvr.segments = 4; bvr.limit_method = 'ANGLE'
    # --- ниша справа: тонкая рама и три стеклянные полки с тёплой подсветкой; вторая, внутренняя ниша
    nring = arch_frame('nring', M['plaster2'], NI['cx'], NI['rx'], NI['zs'], .14, -0.1, 0.02, 'niche'); bvn = nring.modifiers.new('bev', 'BEVEL'); bvn.width = .008; bvn.segments = 3; bvn.limit_method = 'ANGLE'
    for k, z in enumerate((0.62, 1.42, 2.22)):
        box('shelf%d' % k, M['glass'], NI['cx'] - NI['rx'], NI['cx'] + NI['rx'], 1.05, 2.55, z, z + .04, 'niche')
        box('led%d' % k, M['led'], NI['cx'] - NI['rx'] + .02, NI['cx'] + NI['rx'] - .02, 2.50, 2.56, z - .02, z + .0, 'niche')
    nled = arch_frame('nled', M['led'], NI['cx'], NI['rx'] - .05, NI['zs'] - .05, .035, 2.45, 2.5, 'niche')
    T('арки+ниша')
    # --- платформа и ступени (травертин)
    dais = cylinder('dais', M['trav_dais'], 0.95, -2.35, 3.15, 0.0, 0.30, 'dais', bev=0.03)
    add_flutes(M['trav_dais'], float(os.environ.get('FLUTES', 96)), float(os.environ.get('FLUTE_K', .55)))          # вертикальные канавки по стенке платформы и ступеней: объём и ритм, как у рифлёной пилястры
    ledm = decor.led('base_led', float(os.environ.get('BASE_LED', 5.0)), (1.0, .82, .56))
    for (cx_, cy_, r_) in ((0.95, -2.35, 3.15), (PLANT_X + .2, -0.7, 1.5), (4.1, -0.9, 2.1)): decor.lathe('base_led', [(r_ + .004, .0), (r_ + .004, .02), (r_ + .05, .02), (r_ + .05, .0)], ledm, 'dais', cx_, cy_, 0, 256, caps=False)
    stepl = cylinder('stepl', M['trav'], PLANT_X + .2, -0.7, 1.5, 0.0, 0.55, 'steps', bev=0.025)
    stepr = cylinder('stepr', M['trav'], 4.1, -0.9, 2.1, 0.0, 0.42, 'steps', bev=0.03)
    for st_ in (stepl, stepr):                                              # платформа и ступени — одно тело (объединение): без скрытых внутренних граней
        bmd = dais.modifiers.new('uni', 'BOOLEAN'); bmd.operation = 'UNION'; bmd.object = st_; bmd.solver = 'EXACT'; st_.hide_render = True; st_.display_type = 'WIRE'

    T('платформа')
    add_flutes(M['trav_pod'], float(os.environ.get('POD_FLUTES', 20)), float(os.environ.get('POD_FLUTE_K', .45)))      # подиумы-колонны: мягкие вертикальные канавки (растягиваются по высоте вместе со спрайтом)
    pod = cylinder('pod', M['trav_pod'], 0.2, -6.8, 1.0, 0.0, 1.0, 'pod', seg=160, bev=0.03)          # скруглённая кромка подиума
    os.environ.setdefault('TREE_R', '.95'); os.environ.setdefault('TREE_H', '.40')
    if os.environ.get('DECOR', '1') == '1': decor.build(M)
    T('декор')
    if os.environ.get('PLANT', '1') == '1': plant(M)
    T('растение')
    return M

PLANT_X = float(os.environ.get('PLANT_X', -3.2))                                   # дерево с вазой стоит левее и меньше прежнего: крона не заходит под заголовок страницы (x холста > 450)

def leaf_mesh(L=.17, Wd=.05):
    """лист: три вершины в ряду (край, середина, край) — середина чуть ниже краёв, получается складка по центральной жилке; изгиб по длине; развёртка UV (u — поперёк, v — вдоль) для рисунка жилок"""
    n = 9; verts = []; faces = []
    for i in range(n + 1):
        t = i / n; w = Wd * (math.sin(math.pi * (t ** .8)) ** .8) * (1 - .15 * t); y = L * t; z = .014 * math.sin(math.pi * t) - .012 * (t ** 2); fold = .22 * w
        verts += [(-w, y, z + .006 + fold), (0.0, y, z + .006 - fold * .35), (w, y, z + .006 + fold)]
    for i in range(n):
        a = 3 * i; faces += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
    me = bpy.data.meshes.new('leaf'); me.from_pydata(verts, [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices): uv.data[li].uv = ((vi % 3) / 2.0, (vi // 3) / n)
    return me
def leaf_material(name, dark, light, under=False):
    """лист оливы/дерева: цвет по длине (темнее у черенка, светлее к кончику), светлая центральная жилка и боковые прожилки, оттенок и яркость каждого листа чуть свои (случайное число объекта), просвет на свет, мягкий блеск"""
    m, nt, b, out = mk(name); L = nt.links
    uvc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(uvc.outputs['UV'], sp.inputs[0])
    gr = ramp(nt, [(0.0, (*dark, 1)), (1.0, (*light, 1))]); L.new(sp.outputs['Y'], gr.inputs['Fac'])
    ab = nt.nodes.new('ShaderNodeMath'); ab.operation = 'SUBTRACT'; ab.inputs[1].default_value = .5; L.new(sp.outputs['X'], ab.inputs[0]); ab2 = nt.nodes.new('ShaderNodeMath'); ab2.operation = 'ABSOLUTE'; L.new(ab.outputs[0], ab2.inputs[0])
    rib = nt.nodes.new('ShaderNodeMath'); rib.operation = 'LESS_THAN'; rib.inputs[1].default_value = .035; L.new(ab2.outputs[0], rib.inputs[0])                      # центральная жилка
    sid = nt.nodes.new('ShaderNodeMath'); sid.operation = 'MULTIPLY'; L.new(sp.outputs['Y'], sid.inputs[0]); sid.inputs[1].default_value = 26.0
    sin = nt.nodes.new('ShaderNodeMath'); sin.operation = 'SINE'; L.new(sid.outputs[0], sin.inputs[0]); sab = nt.nodes.new('ShaderNodeMath'); sab.operation = 'ABSOLUTE'; L.new(sin.outputs[0], sab.inputs[0])
    sth = nt.nodes.new('ShaderNodeMath'); sth.operation = 'GREATER_THAN'; sth.inputs[1].default_value = .93; L.new(sab.outputs[0], sth.inputs[0])
    vein = nt.nodes.new('ShaderNodeMath'); vein.operation = 'MAXIMUM'; L.new(rib.outputs[0], vein.inputs[0]); L.new(sth.outputs[0], vein.inputs[1])
    oi = nt.nodes.new('ShaderNodeObjectInfo'); rv = nt.nodes.new('ShaderNodeMapRange'); rv.inputs['To Min'].default_value = .78; rv.inputs['To Max'].default_value = 1.22; L.new(oi.outputs['Random'], rv.inputs['Value'])
    vc = nt.nodes.new('ShaderNodeMix'); vc.data_type = 'RGBA'; vc.blend_type = 'MULTIPLY'; vc.inputs['Factor'].default_value = 1.0; L.new(gr.outputs['Color'], vc.inputs['A']); rc = nt.nodes.new('ShaderNodeCombineColor'); L.new(rv.outputs['Result'], rc.inputs[0]); L.new(rv.outputs['Result'], rc.inputs[1]); L.new(rv.outputs['Result'], rc.inputs[2]); L.new(rc.outputs[0], vc.inputs['B'])
    lv = nt.nodes.new('ShaderNodeMix'); lv.data_type = 'RGBA'; lv.inputs['B'].default_value = (.55, .62, .38, 1) if not under else (.80, .83, .66, 1); L.new(vc.outputs['Result'], lv.inputs['A']); mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = .55; L.new(vein.outputs[0], mul.inputs[0]); L.new(mul.outputs[0], lv.inputs['Factor'])
    L.new(lv.outputs['Result'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .5; bp.inputs['Distance'].default_value = .0008; L.new(vein.outputs[0], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    val(b, .42, 'Roughness'); val(b, .22, 'Transmission Weight', 'Transmission'); val(b, .25, 'Subsurface Weight'); val(b, .4, 'Specular IOR Level', 'Specular'); return m

def lush_tree(base, me, me2, stem_m):
    """пышное дерево в вазе (то же построение, что build_tree на главной, hall_story.py): изогнутый ствол и ярус ветвей веером — длинные дуги с густыми парами листьев; ветви не уходят назад в стену и раму арки"""
    import random; rnd = random.Random(77)
    H = float(os.environ.get('TREE_H', .46)); R = float(os.environ.get('TREE_R', 1.25)); nb = int(os.environ.get('TREE_NB', 36)); per = int(os.environ.get('TREE_PER', 60)); lk = float(os.environ.get('TREE_LK', 1.7)); el0, el1 = (float(v) for v in os.environ.get('TREE_EL', '.3,1.1').split(','))
    up = Vector((0, 0, 1)); grp = 'plant'
    def limb(pts, count, k, bevel):
        cu = bpy.data.curves.new('tl', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
        cu.bevel_depth = bevel; cu.bevel_resolution = 2; cu.materials.append(stem_m)
        link(bpy.data.objects.new('tl', cu), grp)
        def at(t):
            f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i + 1], f - i)
        for i in range(1, count + 1):
            t = i / (count + 1) * .93 + .07; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
            u = d.cross(up)
            if u.length < .2: u = d.cross(Vector((1, 0, 0)))
            u.normalize(); v = d.cross(u); phi = rnd.uniform(0, 6.283)
            for side in (0, 1):
                a = phi + side * 3.1416 + rnd.uniform(-.5, .5)
                dv = d * .55 + (u * math.cos(a) + v * math.sin(a)) * 1.0 + Vector((0, 0, rnd.uniform(-.1, .3)))
                if dv.y > .35: dv.y = .35                                                              # листья не лезут назад, в стену
                ob = bpy.data.objects.new('lf', me if rnd.random() > .3 else me2); link(ob, grp)
                ob.scale = ((1.1 - .4 * t) * (.8 + rnd.random() * .4) * lk,) * 3
                ob.rotation_euler = dv.normalized().to_track_quat('Y', 'Z').to_euler(); ob.location = pos
        ob = bpy.data.objects.new('lf', me); link(ob, grp); ob.scale = (lk,) * 3
        ob.rotation_euler = (at(1) - at(.9)).normalized().to_track_quat('Y', 'Z').to_euler(); ob.location = at(1)
        return at
    b = Vector(base)
    trunk = limb([b, b + Vector((-.03, -.02, H * .35)), b + Vector((.03, -.03, H * .7)), b + Vector((-.05, -.04, H))], 4, .9, .03)
    for j in range(nb):
        az = 6.283 * (j + rnd.random() * .7) / nb; el = rnd.uniform(el0, el1)
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        if d.y > .25: d.y = .25; d.normalize()                                                         # ветви веером вперёд, вбок и вверх — не в стену
        P0 = trunk(rnd.uniform(.45, 1.0)); Lb = R * rnd.uniform(.8, 1.2)
        pts = [P0, P0 + d * Lb * .34 + Vector((0, 0, .06)), P0 + d * Lb * .68 + Vector((0, 0, .10 * Lb)), P0 + d * Lb + Vector((0, 0, -.12 * Lb * (1.1 - math.sin(el))))]
        at = limb(pts, per, 1.0, .009)
        for t in (.30, .46, .62, .78):
            P = at(t); az2 = az + rnd.choice((-1, 1)) * rnd.uniform(.5, .9); d2 = Vector((math.cos(az2) * math.cos(el), math.sin(az2) * math.cos(el), math.sin(el) * .8 + .15))
            if d2.y > .25: d2.y = .25
            d2.normalize(); L2 = Lb * rnd.uniform(.3, .45)
            limb([P, P + d2 * L2 * .5 + Vector((0, 0, .04)), P + d2 * L2 + Vector((0, 0, -.03))], max(18, per // 3), .92, .006)

def plant(M):
    import random; rnd = random.Random(5)
    m1 = (leaf_material('leafA', (.10, .17, .05), (.27, .38, .12)),); m2 = (leaf_material('leafU', (.30, .38, .18), (.52, .58, .34), under=True),)
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
    vase = mesh_obj('vase', verts, faces, vase_m, 'plant', smooth=True); vase.location = (PLANT_X, -0.7, 0.55); vase.scale = (1.5, 1.5, 1.5)
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
    base = (PLANT_X, -0.7, 0.55 + .48)
    if os.environ.get('LUSH', '1') == '1':
        lush_tree(base, me, me2, stem[0])                                                                   # пышное дерево, как на главной (веер длинных дуг с густыми листьями)
    else:
        branch(base, [(0, 0, 0), (-.06, 0, .5), (-.18, .02, 1.0), (-.36, .04, 1.45)], 22, 1.7)
        branch(base, [(0, 0, 0), (.14, 0, .38), (.46, -.02, .72), (.88, -.05, .88)], 22, 1.6)
        branch(base, [(0, 0, 0), (-.1, .02, .3), (-.34, 0, .56), (-.68, -.03, .66)], 18, 1.5)
        branch(base, [(0, 0, 0), (.03, 0, .55), (.16, .01, 1.1), (.24, .02, 1.58)], 22, 1.6)
        branch(base, [(0, 0, 0), (.1, 0, .3), (.3, .03, .62), (.5, .03, 1.08)], 16, 1.4)
    # ветка в нише (справа внизу)
    branch((5.0, 1.5, 0.0), [(0, 0, 0), (0, 0, .5), (-.06, 0, 1.05), (-.2, 0, 1.55)], 20, 1.2, 'plant')
    # тени листьев на стене: ветки висят вне кадра на пути солнечного луча и невидимы камере, но отбрасывают чёткие тени
    d = Vector((.62, .72, -.55)).normalized()
    for (tx, tz, rot, k) in ((0.4, 2.0, 0.0, 1.0), (-1.9, 3.1, 0.7, .85), (3.3, 4.6, -0.5, .9)):
        tgt = Vector((tx, 0.0, tz)); loc = tgt - d * 7.5
        ex = d.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(d).normalized()
        mk_pts = lambda pts: [tuple(ex * (p[0] * math.cos(rot) - p[2] * math.sin(rot)) * 1.0 + ey * (p[0] * math.sin(rot) + p[2] * math.cos(rot)) + d * p[1]) for p in pts]
        branch(tuple(loc), mk_pts([(0, 0, 0), (-.1 * 2.2, 0, .5 * 2.2), (-.3 * 2.2, .02, 1.0 * 2.2), (-.6 * 2.2, .04, 1.45 * 2.2)]), 24, 3.0 * k, 'gobo')
        branch(tuple(loc), mk_pts([(0, 0, 0), (.14 * 2.2, 0, .4 * 2.2), (.46 * 2.2, -.02, .72 * 2.2), (.9 * 2.2, -.05, .9 * 2.2)]), 22, 2.8 * k, 'gobo')

def lights(sc):
    # окно: солнце сквозь переплёт (переплёт невидим для камеры, но отбрасывает тень)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = float(os.environ.get('SUN', 14.0)); sun.angle = math.radians(float(os.environ.get('SUN_ANGLE', 0.35))); sun.color = E3('SUNC', (1.0, .94, .84))
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
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = float(os.environ.get('FILL', 110)); ar.size = 9; ar.size_y = 5; ar.color = E3('FILLC', (1.0, .97, .92))
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = (-2.5, -11.0, 5.5); ao.rotation_euler = (math.radians(70), 0, math.radians(8))
    ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*E3('WORLDC', (.80, .88, 1.0)), 1); bg.inputs['Strength'].default_value = float(os.environ.get('WORLD', 0.22)); sc.world = w
    if os.environ.get('SKY', '1') == '1':                                                                  # физическое небо Blender (многократное рассеяние — дневной свет): солнце — отдельная лампа (даёт тени переплёта и листьев), небо — прохладный рассеянный свет, отсюда голубоватые тени и тёплые пятна света, как на архитектурных снимках
        try:
            sk = w.node_tree.nodes.new('ShaderNodeTexSky'); sk.sky_type = 'MULTIPLE_SCATTERING'; sk.sun_disc = False; sk.sun_elevation = math.radians(float(os.environ.get('SKY_EL', 32))); sk.sun_rotation = math.radians(float(os.environ.get('SKY_ROT', 210))); sk.air_density = 1.0; sk.aerosol_density = float(os.environ.get('SKY_DUST', 1.2)); sk.altitude = 0
            wm = w.node_tree.nodes.new('ShaderNodeMix'); wm.data_type = 'RGBA'; wm.blend_type = 'MULTIPLY'; wm.inputs['Factor'].default_value = 1.0; wm.inputs['B'].default_value = (*E3('SKYTINT', (1.0, .85, .66)), 1)      # отражённый от тёплых стен свет: небо в интерьере не бывает чисто голубым
            w.node_tree.links.new(sk.outputs['Color'], wm.inputs['A']); w.node_tree.links.new(wm.outputs['Result'], bg.inputs['Color'])
        except Exception as e: print('небо Нишита недоступно:', e)

def settings(sc, w=W, h=H, spp=SPP):
    addon_utils.enable('cycles'); sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.device = 'CPU'; cy.samples = spp; cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
    cy.max_bounces = 8; cy.diffuse_bounces = 5; cy.glossy_bounces = 4; cy.transmission_bounces = 6; cy.transparent_max_bounces = 12; cy.caustics_reflective = False; cy.caustics_refractive = False
    cy.sample_clamp_indirect = 8
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = os.environ.get('VT', 'AgX'); sc.view_settings.look = os.environ.get('LOOK', 'AgX - Medium High Contrast' if os.environ.get('VT', 'AgX') == 'AgX' else 'None'); sc.view_settings.exposure = float(os.environ.get('EXPO', -0.3))
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'

LAYERS = ['shell', 'niche', 'ring', 'dais', 'plant', 'pod']
def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (v.x * CANVAS[0], (1 - v.y) * CANVAS[1])

def anchors(sc, cam):
    out = {}
    def rim(cx, cy, r, z):
        pts = [proj(sc, cam, (cx + r * math.cos(a), cy + r * math.sin(a), z)) for a in np.linspace(0, 2 * math.pi, 72, endpoint=False)]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; return {'cx': round((min(xs) + max(xs)) / 2, 1), 'cy': round((min(ys) + max(ys)) / 2, 1), 'rx': round((max(xs) - min(xs)) / 2, 1), 'ry': round((max(ys) - min(ys)) / 2, 1)}
    out['dais'] = rim(0.95, -2.35, 3.15, 0.30); out['stepl'] = rim(PLANT_X + .2, -0.7, 1.5, 0.55); out['stepr'] = rim(4.1, -0.9, 2.1, 0.42)
    out['shelves'] = [{'y': round(proj(sc, cam, (3.6, 1.8, z + .04))[1], 1), 'x0': round(proj(sc, cam, (2.15, 1.8, z))[0], 1), 'x1': round(proj(sc, cam, (5.0, 1.8, z))[0], 1)} for z in (0.62, 1.42, 2.22)]
    out['vase'] = {'x': round(proj(sc, cam, (PLANT_X, -0.7, 0.55))[0], 1), 'y': round(proj(sc, cam, (PLANT_X, -0.7, 0.55))[1], 1)}
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
    def g(im_):
        im_ = ImageEnhance.Brightness(im_).enhance(float(os.environ.get('POD_GAIN', 1.0)))
        return Image.fromarray(grade(np.asarray(im_)).astype(np.uint8)) if os.environ.get('GRADE', '1') == '1' else im_             # подиумы — в той же палитре, что и фон
    w_ = body.width; body = body.crop((int(w_ * .018), 0, int(w_ * .982), body.height))                       # без тёмной кромки силуэта
    cap_rgb = g(cap.convert('RGB')); cap = Image.merge('RGBA', (*cap_rgb.split(), cap.getchannel('A'))); body = g(body)
    cap.save(os.path.join(OUT, 'pod-cap.webp'), 'WEBP', quality=90, method=6, alpha_quality=95); body.save(os.path.join(OUT, 'pod-body.webp'), 'WEBP', quality=88, method=6)
    meta['pod'] = {'cap': 'assets/showroom/pod-cap.webp', 'body': 'assets/showroom/pod-body.webp', 'capRatio': round(cap.height / cap.width, 4), 'bodyRatio': round(body.height / body.width, 4), 'capW': cap.width, 'bodyH': body.height}
    print('pod', meta['pod'], flush=True)

def grade(a, sat=None, lift=None, cool=None, gamma=None):
    """цветокоррекция слоёв и «фотографическая» обработка: гамма (.84 по умолчанию), едва заметная виньетка и плёночное зерно (после шумоподавления Cycles картинка слишком гладкая — «пластик»), лёгкое возвращение резкости. Применяется ко всем слоям одинаково (кадр целиком)."""
    sat = float(os.environ.get('GRADE_SAT', 1.0)) if sat is None else sat; lift = float(os.environ.get('GRADE_LIFT', 0.0)) if lift is None else lift
    cool = float(os.environ.get('GRADE_COOL', 0.0)) if cool is None else cool; gamma = float(os.environ.get('GRADE_GAMMA', .90)) if gamma is None else gamma
    a = a.astype(np.float32); L = ((a @ np.array([.299, .587, .114], np.float32)) / 255.0)[..., None]
    a = a * sat + (L * 255.0) * (1 - sat)
    k = lift * (.35 + .65 * L); a = a * (1 - k) + np.array([250, 246, 237], np.float32) * k
    a = a + ((1 - L) ** 2.2) * np.array([-9, -4, 12], np.float32) * cool
    a = np.clip(255.0 * np.power(np.clip(a, 0, 255) / 255.0, gamma), 0, 255)
    h, w = a.shape[:2]
    sh = float(os.environ.get('SHARP', 40))
    if sh > 0:
        im = Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=1.4, percent=int(sh), threshold=2)); a = np.asarray(im).astype(np.float32)
    vg = float(os.environ.get('VIG', .10))
    if vg > 0:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); r2 = ((xx / w - .5) ** 2 * 1.2 + (yy / h - .5) ** 2) * 1.6; a = a * (1 - vg * np.clip(r2, 0, 1))[..., None]
    gn = float(os.environ.get('GRAIN', 1.6))
    if gn > 0:
        rng = np.random.default_rng(7); n = rng.normal(0, gn, (h, w)).astype(np.float32); a = a + (n * (.6 + .8 * (1 - L[..., 0])))[..., None]
    return np.clip(a, 0, 255)

def fix_sliver(plate, px):
    """тонкая светлая «щель» (≈9×70 px холста) на стыке вырезов стены и задней панели — лечим интерполяцией между соседними столбцами; px — пикселей картинки на пиксель холста"""
    x0, x1, y0, y1 = int(1038.4 * px), int(1051.2 * px), int(102.4 * px), int(169.6 * px)
    a, b = plate[y0:y1, x0 - 2], plate[y0:y1, x1 + 2]
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    plate[y0:y1, x0:x1] = a[:, None, :] * (1 - t) + b[:, None, :] * t
    return plate

def render_layers(sc, cam0, names):
    """Слои из ОДНОЙ полной отрисовки R2 (все объекты, общий свет и тени) + чистая «подложка» R1 (только стена, пол и задник — без остальных объектов) + маски объектов по группам:
       • слой группы = пиксели R2 с альфой-маской этой группы (объекты видны в своём слое, тени и отражения — настоящие);
       • подложка = R2 вне объектов и R1 под ними (под любым слоем есть «что-то», швов и дыр нет)."""
    objs = [o for o in bpy.data.objects if 'grp' in o.keys() and o['grp'] != 'gobo' and o.name not in ('cut1', 'cut2', 'clipb', 'stepl', 'stepr') and o.type in ('MESH', 'CURVE')]      # «резаки» булевых операций остаются скрытыми всегда
    groups = ['niche', 'ring', 'dais', 'plant']; mp = os.path.join(OUT, 'layers.json'); old = json.load(open(mp)) if os.path.exists(mp) else {}
    def show(gs):
        for o in objs: o.hide_render = o['grp'] not in gs; o.visible_camera = True
    sc.camera = cam0; sc.render.film_transparent = False; ONLY = os.environ.get('SCENE_COMPOSE_ONLY') == '1'                      # SCENE_COMPOSE_ONLY=1: без рендера — только сборка слоёв из готовых /tmp/R1.png, R2.png, M_*.png (цветокоррекция, подбор параметров)
    def shoot(path):
        if not ONLY: sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    if 'shell' in names or any(g in names for g in groups):
        show(['shell', 'niche', 'ring', 'dais', 'plant']); shoot('/tmp/R2.png')                      # полная сцена
        show(['shell']); shoot('/tmp/R1.png')                                                          # подложка
        ov = bpy.data.materials.new('mask'); ov.use_nodes = True; nt = ov.node_tree; nt.nodes.clear(); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0; out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], out.inputs[0])
        vl = bpy.context.view_layer; vl.material_override = ov; vt = sc.view_settings.view_transform; lk = sc.view_settings.look; ex = sc.view_settings.exposure; sc.view_settings.view_transform = 'Standard'; sc.view_settings.exposure = 0; sc.view_settings.look = 'None'
        bgn = sc.world.node_tree.nodes['Background']; w0 = bgn.inputs['Strength'].default_value; bgn.inputs['Strength'].default_value = 0.0; spp0 = sc.cycles.samples; sc.cycles.samples = 16; sc.cycles.use_denoising = False
        for g in groups:
            show([g]); shoot('/tmp/M_%s.png' % g)
        vl.material_override = None; sc.view_settings.view_transform = vt; sc.view_settings.look = lk; sc.view_settings.exposure = ex; bgn.inputs['Strength'].default_value = w0; sc.cycles.samples = spp0; sc.cycles.use_denoising = True
        R2 = np.asarray(Image.open('/tmp/R2.png').convert('RGB')).astype(np.float32); R1 = np.asarray(Image.open('/tmp/R1.png').convert('RGB')).astype(np.float32)
        M = {g: np.asarray(Image.open('/tmp/M_%s.png' % g).convert('L')).astype(np.float32) / 255.0 for g in groups}
        from scipy import ndimage as ndi
        allm = np.maximum.reduce(list(M.values())); dil = ndi.maximum_filter(allm, size=2 * round(R2.shape[1] / 768) + 1); dil = ndi.gaussian_filter(dil, .8); dil = np.clip(dil * 1.6, 0, 1)
        plate = R2 * (1 - dil[..., None]) + R1 * dil[..., None]
        if os.environ.get('GRADE', '1') == '1': plate = grade(plate); R2 = grade(R2)
        if os.environ.get('FIX_SLIVER') == '1': plate = fix_sliver(plate, R2.shape[1] / CANVAS[0])
        k = CANVAS[0] / R2.shape[1]; q = int(os.environ.get('SCENE_Q', 84))
        Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'layer-shell.webp'), 'WEBP', quality=q, method=6)
        old['shell'] = {'file': 'assets/showroom/layer-shell.webp', 'x': 0.0, 'y': 0.0, 'w': float(CANVAS[0]), 'h': float(CANVAS[1])}; print('layer shell', os.path.getsize(os.path.join(OUT, 'layer-shell.webp')) // 1024, 'КБ', flush=True)
        for g in groups:
            m = M[g]; ys, xs = np.where(m > .01)
            if not len(xs): continue
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            rgba = np.dstack([R2, m * 255.0])[y0:y1, x0:x1]; name = 'layer-%s.webp' % g
            Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, name), 'WEBP', quality=q, method=6, alpha_quality=92)
            old[g] = {'file': 'assets/showroom/' + name, 'x': round(x0 * k, 2), 'y': round(y0 * k, 2), 'w': round((x1 - x0) * k, 2), 'h': round((y1 - y0) * k, 2)}
            print('layer', g, old[g], os.path.getsize(os.path.join(OUT, name)) // 1024, 'КБ', flush=True)
    if 'pod' in names:
        for o in objs: o.hide_render = o['grp'] != 'pod'; o.visible_camera = True
        for o in bpy.data.objects:
            if o.get('grp') == 'gobo': o.hide_render = True                                                                  # подиумы — спрайты, которые тянутся и повторяются: тень переплёта на каждом была бы одинаковой и выдавала бы подделку
        wn_ = sc.world.node_tree; bgp = wn_.nodes['Background']
        for l_ in list(bgp.inputs['Color'].links): wn_.links.remove(l_)
        bgp.inputs['Color'].default_value = (*E3('PODWORLD', (1.0, .90, .76)), 1); bgp.inputs['Strength'].default_value = float(os.environ.get('POD_WORLD', .55))      # тёплый рассеянный свет вместо голубого неба: тени подиума тёплые
        sc.render.film_transparent = True; cam2 = set_cam(sc, (0.0, -12.0, 1.52), pitch=11.0)                         # подиум снимается чуть сверху: верхняя грань читается эллипсом ≈1:10
        shoot('/tmp/layer_pod.png'); pod_sprites(sc, cam2, '/tmp/layer_pod.png', old); sc.camera = cam0
    old['anchors'] = anchors(sc, cam0); json.dump(old, open(mp, 'w'), indent=1, ensure_ascii=False)

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    if mode == 'preview': pw = int(os.environ.get('SCENE_W', 960)); settings(sc, pw, round(pw * 640 / 960), int(os.environ.get('SCENE_SPP', 24)))      # SCENE_W — ширина кадра предпросмотра (с CROP — крупные врезки)
    else: settings(sc)
    import time; t0 = time.time()
    M = build(sc); lights(sc); cam = set_cam(sc); print('сцена собрана за %.0f с, объектов %d' % (time.time() - t0, len(bpy.data.objects)), flush=True)
    if mode == 'preview':
        for o in bpy.data.objects:
            if o.get('grp') == 'pod': o.hide_render = True
        if os.environ.get('CROP'):
            c_ = [float(v) for v in os.environ['CROP'].split(',')]; sc.render.use_border = True; sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = c_[0], 1 - c_[3], c_[2], 1 - c_[1]; sc.render.use_crop_to_border = True
        sc.render.film_transparent = False; sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/scene_preview.png'); bpy.ops.render.render(write_still=True); print('preview done'); print(json.dumps(anchors(sc, cam))); return
    names = [n for n in os.environ.get('SCENE_LAYERS', ','.join(LAYERS)).split(',') if n]
    render_layers(sc, cam, names)

if __name__ == '__main__':
    main()
