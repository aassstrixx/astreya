#!/usr/bin/env python3
"""Сцена шоурума каталога в 3D (Blender/Cycles) по образцу заказчика — геометрия и расстановка в expo.py: большой овальный стол из травертина с полированной столешницей, ступенчатые блоки и диски (подиумы запечены в сцену),
ваза-шар из пористого камня с веткой оливы, стеклянные шары, гладкая стена с пятнами солнца и тенями листьев, пилястра, дальняя арка с тёмно-синей тканевой панелью и знаком «Астреи» (без надписи), ниша со стеклянными полками;
лёгкая дымка в воздухе и размытая ветка на переднем плане дают глубину. Товары — живой HTML поверх сцены: места товаров (x, y основания, px на см, глубина) записываются в layers.json → anchors.slots.
Рендерится ОТДЕЛЬНЫМИ СЛОЯМИ разной глубины с одной камеры (shell — стена, арка, панель, пол; niche — полки и флаконы; ring — пилястра и рама арки; dais — стол, подиумы, шары; plant — ваза и ветка): тень и отражённый свет каждого объекта попадают во все слои,
но сам объект виден только в своём. На странице (css/showroom.css) слои двигаются с разной скоростью — параллакс курсора и «наезд» камеры при выборе товара.
   python3 tools/showroom-assets/scene.py            — все слои в полном качестве (assets/showroom/layer-*.webp, layers.json)
   python3 tools/showroom-assets/scene.py preview    — один быстрый кадр целиком (/tmp/scene_preview.png; CROP=0,0,1,0.72 — видимая часть, SCENE_W — ширина)
Переменные: SCENE_W (ширина, по умолчанию 1920), SCENE_SPP (сэмплов), SCENE_LAYERS (список через запятую), VOL (плотность дымки, .003), MARK_E/MARK_W/MARK_Z (знак на панели), FORE (ветка на переднем плане, 1/0), UCM (ед. сцены на см), TBL_ROUGH, WALLC, INSC."""
import bpy, bmesh, math, os, sys, json, addon_utils
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import materials as MT                                    # общая библиотека камня: травертин, известняк, штукатурка, плитка (см. materials.py)
import decor                                              # объёмный декор фона: светильники, вазы (см. decor.py)
import realism as RL                                      # настоящие листья (складка по жилке, серебристая изнанка), ткани, мебель — общая с главной
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'assets', 'showroom'); os.makedirs(OUT, exist_ok=True)
W = int(os.environ.get('SCENE_W', 1920)); H = round(W * 1024 / 1536); SPP = int(os.environ.get('SCENE_SPP', 128))
CANVAS = (1536, 1024)
CAM = {'loc': (0.0, -12.0, float(os.environ.get('CAMZ', 1.4))), 'lens': 50.0, 'shift_y': float(os.environ.get('CAM_SHIFT', -140.0)) / 1536.0}      # камера выше столешницы (верх подиумов виден овалом, ≈ 5–6° — как наклон спрайтов упаковок и как на образце); сдвиг объектива возвращает композицию на прежние строки холста

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
    cd = bpy.data.cameras.new('cam'); cd.lens = lens or CAM['lens']; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.shift_y = CAM.get('shift_y', 0.0) if loc is None else 0.0; cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam)
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
    """экспозиция по образцу заказчика (expo.py): круглый стол, подиумы-блоки и диски, ваза с оливой, шары, арка с синей панелью, ниша и стойка"""
    import expo
    M = {}; expo.build(sys.modules[__name__], sc, M); return M

TABLE_Z = float(os.environ.get('TABLE_Z', .34)); TABLE_Y = (-5.6, -0.45)
_VOL = [None]
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
    vol = float(os.environ.get('VOL', .003))
    if vol > 0:                                                                                              # лёгкая дымка в воздухе (объём-куб между камерой и стеной): лучи солнца через тени листьев и воздушная перспектива; мировой объём гасил весь свет, поэтому куб
        hm = bpy.data.materials.new('haze'); hm.use_nodes = True; nt_ = hm.node_tree; nt_.nodes.clear(); vs = nt_.nodes.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = vol; vs.inputs['Anisotropy'].default_value = float(os.environ.get('VOL_G', .55)); vs.inputs['Color'].default_value = (1.0, .93, .80, 1)
        ot = nt_.nodes.new('ShaderNodeOutputMaterial'); nt_.links.new(vs.outputs['Volume'], ot.inputs['Volume']); _VOL[0] = vs
        bpy.ops.mesh.primitive_cube_add(size=1); hz = bpy.context.object; hz.name = 'haze'; hz.scale = (30, 16.0, 11.0); hz.location = (0, -2.6, 3.5); hz.data.materials.append(hm); hz['grp'] = 'shell'
        hz.visible_shadow = False; sc.cycles.volume_bounces = 1; sc.cycles.volume_step_rate = float(os.environ.get('VOL_STEP', 1.5))
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
    sc.view_settings.view_transform = os.environ.get('VT', 'AgX'); sc.view_settings.look = os.environ.get('LOOK', 'AgX - Punchy' if os.environ.get('VT', 'AgX') == 'AgX' else 'None'); sc.view_settings.exposure = float(os.environ.get('EXPO', -0.85))
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'

LAYERS = ['shell', 'niche', 'ring', 'dais', 'plant']
def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (v.x * CANVAS[0], (1 - v.y) * CANVAS[1])

def anchors(sc, cam):
    """места товаров (холст 1536×1024): x, y основания, px на см упаковки на этой глубине, глубина; край стола — для тени и отражения"""
    import expo
    out = {'slots': []}
    for si in range(len(expo.SLOTS)):
        X, Y, Z = expo.slot_world(si); p0 = proj(sc, cam, (X, Y, Z)); p1 = proj(sc, cam, (X, Y, Z + expo.cm(10.0)))
        out['slots'].append({'x': round(p0[0], 1), 'y': round(p0[1], 1), 'pxcm': round((p0[1] - p1[1]) / 10.0, 3), 'd': round(Y + 12.0, 2), 'plinth': expo.SLOTS[si][0]})
    out['table'] = {'front': round(proj(sc, cam, (expo.world(768, 6.4)[0], -5.6, TABLE_Z))[1], 1), 'z': TABLE_Z}
    return out

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
    objs = [o for o in bpy.data.objects if 'grp' in o.keys() and o['grp'] != 'gobo' and o.name not in ('cut1', 'cut2', 'clipb', 'stepl', 'stepr', 'tbl_clip') and not o.name.startswith('cutR') and o.type in ('MESH', 'CURVE')]      # «резаки» булевых операций остаются скрытыми всегда
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
        v0 = _VOL[0].inputs['Density'].default_value if _VOL[0] else 0.0
        if _VOL[0]: _VOL[0].inputs['Density'].default_value = 0.0                                                # маски без дымки
        bgn = sc.world.node_tree.nodes['Background']; w0 = bgn.inputs['Strength'].default_value; bgn.inputs['Strength'].default_value = 0.0; spp0 = sc.cycles.samples; sc.cycles.samples = 16; sc.cycles.use_denoising = False
        for g in groups:
            show([g]); shoot('/tmp/M_%s.png' % g)
        vl.material_override = None
        if _VOL[0]: _VOL[0].inputs['Density'].default_value = v0
        sc.view_settings.view_transform = vt; sc.view_settings.look = lk; sc.view_settings.exposure = ex; bgn.inputs['Strength'].default_value = w0; sc.cycles.samples = spp0; sc.cycles.use_denoising = True
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
    old.pop('pod', None); old['anchors'] = anchors(sc, cam0); json.dump(old, open(mp, 'w'), indent=1, ensure_ascii=False)

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    if mode == 'preview': pw = int(os.environ.get('SCENE_W', 960)); settings(sc, pw, round(pw * 640 / 960), int(os.environ.get('SCENE_SPP', 24)))      # SCENE_W — ширина кадра предпросмотра (с CROP — крупные врезки)
    else: settings(sc)
    import time; t0 = time.time()
    M = build(sc); lights(sc); cam = set_cam(sc); dof = float(os.environ.get('DOF', 1.1))
    if dof > 0: cam.data.dof.use_dof = True; cam.data.dof.focus_distance = float(os.environ.get('DOF_DIST', 7.7)); cam.data.dof.aperture_fstop = dof                      # фон мягко размыт, стол и упаковки — в фокусе (как на фото-образце)
    print('сцена собрана за %.0f с, объектов %d' % (time.time() - t0, len(bpy.data.objects)), flush=True)
    if mode == 'preview':
        if os.environ.get('CROP'):
            c_ = [float(v) for v in os.environ['CROP'].split(',')]; sc.render.use_border = True; sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = c_[0], 1 - c_[3], c_[2], 1 - c_[1]; sc.render.use_crop_to_border = True
        sc.render.film_transparent = False; sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/scene_preview.png'); bpy.ops.render.render(write_still=True); print('preview done'); print(json.dumps(anchors(sc, cam))); return
    names = [n for n in os.environ.get('SCENE_LAYERS', ','.join(LAYERS)).split(',') if n]
    render_layers(sc, cam, names)

if __name__ == '__main__':
    main()
