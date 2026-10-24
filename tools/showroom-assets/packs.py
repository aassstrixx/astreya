#!/usr/bin/env python3
"""Условные макеты упаковки для витрины-шоурума: фотореалистичный 3D-рендер (Blender/Cycles) нейтральных контейнеров БЕЗ текста, логотипов и фирменных форм.
Нужны только пока у товара нет настоящего фото (поле image в админке / data/products.json): с фото витрина показывает его, а макет не используется.
Запуск (нужен пакет bpy: pip install bpy numpy pillow):   python3 tools/showroom-assets/packs.py [тип ...]
Результат: assets/showroom/pack-<тип>[-noir].webp (прозрачный фон) и assets/showroom/packs.json (размеры, область этикетки в долях картинки).
Камера ортографическая, лёгкий наклон ≈7° (как у верхней грани подиума на сцене); свет — большой мягкий источник слева сверху, подсветка справа и тёплый градиентный купол."""
import bpy, bmesh, math, sys, os, json, addon_utils
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'showroom')
os.makedirs(OUT, exist_ok=True)
CM = 0.01
RES = int(os.environ.get('PACK_RES', 900)); SAMPLES = int(os.environ.get('PACK_SAMPLES', 64)); TARGET_H = 560

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable('cycles')
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'
    cy = sc.cycles; cy.device = 'CPU'; cy.samples = SAMPLES; cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'; cy.max_bounces = 10; cy.transmission_bounces = 8; cy.glossy_bounces = 6; cy.caustics_reflective = False; cy.caustics_refractive = False
    sc.render.film_transparent = True; sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'; sc.view_settings.exposure = float(os.environ.get('PACK_EXP', -0.15))
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
    return sc

# ---------- материалы ----------
def mat(name, base, rough=0.4, metal=0.0, spec=0.5, trans=0.0, ior=1.45, coat=0.0, coat_rough=0.05, emis=None, sheen=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    def setv(k, v):
        if k in b.inputs: b.inputs[k].default_value = v
    setv('Base Color', (*base, 1)); setv('Roughness', rough); setv('Metallic', metal); setv('IOR', ior)
    for k in ('Specular IOR Level', 'Specular'): setv(k, spec)
    for k in ('Transmission Weight', 'Transmission'): setv(k, trans)
    for k in ('Coat Weight', 'Clearcoat'): setv(k, coat)
    for k in ('Coat Roughness', 'Clearcoat Roughness'): setv(k, coat_rough)
    setv('Sheen Weight', sheen)
    return m
def M():
    return {
      'white': mat('white', (0.90, 0.89, 0.86), 0.38, spec=0.5, coat=0.15, coat_rough=0.25, sheen=0.3),
      'gloss': mat('gloss', (0.92, 0.91, 0.88), 0.14, spec=0.6, coat=0.5, coat_rough=0.05),
      'ivory': mat('ivory', (0.86, 0.82, 0.74), 0.34, spec=0.5, coat=0.1),
      'label': mat('label', (0.95, 0.93, 0.89), 0.55, spec=0.35),
      'gold': mat('gold', (0.97, 0.84, 0.60), 0.20, metal=0.92, spec=0.8),
      'noir': mat('noir', (0.012, 0.012, 0.013), 0.07, spec=0.7, coat=0.7, coat_rough=0.03),
      'rubber': mat('rubber', (0.02, 0.02, 0.02), 0.45, spec=0.4),
      'box': mat('box', (0.91, 0.89, 0.84), 0.5, spec=0.3),
      'frost': mat('frost', (0.93, 0.92, 0.89), 0.30, spec=0.5, trans=0.35, coat=0.2),
      'glass': mat('glass', (0.97, 0.97, 0.97), 0.03, spec=0.5, trans=1.0, ior=1.5),
    }

# ---------- геометрия: «лофт» эллипсов по высоте ----------
def loft(name, rings, mat_, seg=96, cap_top=True, cap_bottom=True, smooth=True, loc=(0, 0, 0)):
    """rings: [(z, rx, ry[, dx, dy])] в см; ряд с rx=0 — точка на оси."""
    verts, faces = [], []
    th = np.linspace(0, 2 * math.pi, seg, endpoint=False)
    for r in rings:
        z, rx, ry = r[0], r[1], r[2]; dx = r[3] if len(r) > 3 else 0; dy = r[4] if len(r) > 4 else 0
        for t in th: verts.append(((rx * math.cos(t) + dx) * CM, (ry * math.sin(t) + dy) * CM, z * CM))
    n = len(rings)
    for i in range(n - 1):
        for j in range(seg):
            a = i * seg + j; b = i * seg + (j + 1) % seg; c = (i + 1) * seg + (j + 1) % seg; d = (i + 1) * seg + j
            faces.append((a, b, c, d))
    if cap_bottom: faces.append(tuple(reversed(range(seg))))
    if cap_top: faces.append(tuple(range((n - 1) * seg, n * seg)))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob.location = loc
    ob.data.materials.append(mat_)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return ob
def rounded(r, z0, z1, rad, steps=6):
    """профиль скруглённого цилиндра: кольца для верха/низа со скруглением rad"""
    rings = []
    for i in range(steps + 1):
        a = math.pi / 2 * i / steps
        rings.append((z0 + rad * (1 - math.cos(a)), r - rad * (1 - math.sin(a)), None))
    return rings
def cyl(name, mat_, r, z0, z1, bev=0.15, seg=96, rx=None, ry=None, loc=(0, 0, 0), top_bev=None, bot_bev=None):
    """цилиндр r (или эллипс rx,ry) со скруглёнными кромками"""
    rx = rx or r; ry = ry or r; tb = bev if top_bev is None else top_bev; bb = bev if bot_bev is None else bot_bev; rings = []
    st = 5
    for i in range(st + 1):  # низ
        a = math.pi / 2 * i / st; k = 1 - (1 - math.sin(a)) * bb / max(rx, 1e-6)
        rings.append((z0 + bb * (1 - math.cos(a)), rx - bb * (1 - math.sin(a)), ry - bb * (1 - math.sin(a))))
    for i in range(st + 1):  # верх
        a = math.pi / 2 * (1 - i / st)
        rings.append((z1 - tb * (1 - math.cos(a)), rx - tb * (1 - math.sin(a)), ry - tb * (1 - math.sin(a))))
    return loft(name, rings, mat_, seg=seg, loc=loc)

def label_band(name, mat_, r, z0, z1, ry=None, seg=96, arc=1.0, eps=0.04):
    """этикетка — тонкая оболочка вокруг цилиндра; arc — доля окружности"""
    ry = ry or r; verts, faces = [], []; n = int(seg * arc)
    th = np.linspace(-math.pi * arc, math.pi * arc, n + 1) + math.pi / 2 * 0  # вокруг оси; середина — на камеру (-Y)
    th = th - math.pi / 2
    for z in (z0, z1):
        for t in th: verts.append(((r + eps) * math.cos(t) * CM, (ry + eps) * math.sin(t) * CM, z * CM))
    m = len(th)
    for j in range(m - 1): faces.append((j, j + 1, m + j + 1, m + j))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob.data.materials.append(mat_)
    for p in me.polygons: p.use_smooth = True
    return ob

def box(name, mat_, w, h, d, loc=(0, 0, 0), bev=0.12, rot=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); ob = bpy.context.object; ob.name = name
    ob.scale = (w * CM, d * CM, h * CM); bpy.ops.object.transform_apply(scale=True)
    bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bev * CM; bv.segments = 4; bv.limit_method = 'ANGLE'
    ob.data.materials.append(mat_); ob.rotation_euler = (0, 0, math.radians(rot)); bpy.ops.object.shade_smooth()
    return ob

# ---------- упаковки ----------
def build(kind, noir, m):
    objs = []; labels = []; body_m = m['noir'] if noir else m['white']; cap_m = m['gold'] if noir else m['gold']
    if kind == 'tube':        # туба на крышке: корпус с плоским швом сверху, откидная крышка
        rings = []
        H0, H1 = 2.6, 15.2
        for i in range(0, 41):
            z = H0 + (H1 - H0) * i / 40; t = i / 40
            sq = 1.0 if t < .72 else 1 - 0.93 * ((t - .72) / .28) ** 1.6      # к шву труба сплющивается
            wid = 1.0 + (0.06 * ((t - .72) / .28) if t > .72 else 0)
            rings.append((z, 1.95 * wid, 1.95 * sq))
        objs.append(loft('tube', rings, body_m if noir else m['white'], seg=96))
        objs.append(cyl('cap', m['gloss'] if not noir else m['noir'], 1.98, 0, 2.7, bev=0.28))
        objs.append(cyl('capring', m['gold'] if noir else m['white'], 2.0, 2.45, 2.75, bev=0.08))
        labels.append(label_band('label', m['label'], 1.95, 5.2, 11.4, arc=0.62, eps=0.015))
    elif kind == 'bottle':    # высокий флакон с плоской крышкой-диском
        objs.append(cyl('body', body_m, 2.9, 0, 15.2, bev=0.9, top_bev=2.2))
        objs.append(cyl('neck', body_m, 1.7, 14.6, 16.0, bev=0.1))
        objs.append(cyl('cap', m['gloss'] if not noir else m['noir'], 2.05, 15.8, 19.2, bev=0.35))
        objs.append(cyl('capgold', m['gold'], 2.08, 15.75, 16.35, bev=0.08))
        labels.append(label_band('label', m['label'], 2.9, 4.2, 11.6, arc=0.6, eps=0.02))
    elif kind == 'pump':      # флакон с помпой
        objs.append(cyl('body', body_m, 2.7, 0, 11.8, bev=0.9, top_bev=2.0))
        objs.append(cyl('collar', m['gold'], 1.55, 11.4, 12.9, bev=0.12))
        objs.append(cyl('stem', m['gloss'] if not noir else m['noir'], 0.5, 12.8, 15.1, bev=0.1))
        objs.append(cyl('head', m['gloss'] if not noir else m['noir'], 1.3, 14.9, 16.5, bev=0.3))
        objs.append(cyl('nozzle', m['gloss'] if not noir else m['noir'], 0.3, 0, 2.6, bev=0.12, loc=(0, 0, 0)))
        nz = objs[-1]; nz.rotation_euler = (0, math.radians(90), 0); nz.location = (-0.4 * CM, 0, 15.7 * CM)
        objs.append(cyl('pushtop', m['gold'], 0.9, 16.3, 16.9, bev=0.1))
        labels.append(label_band('label', m['label'], 2.7, 3.2, 9.4, arc=0.6, eps=0.02))
    elif kind == 'dropper':   # флакон с пипеткой
        objs.append(cyl('body', m['noir'] if noir else m['gloss'], 2.35, 0, 8.8, bev=0.7, top_bev=1.4))
        objs.append(cyl('neck', m['noir'] if noir else m['gloss'], 1.35, 8.4, 9.6, bev=0.1))
        objs.append(cyl('collar', m['gold'], 1.62, 9.4, 11.2, bev=0.14))
        bulb = [(11.0 + 5.4 * i / 24, (1.05 if i / 24 < .5 else 1.05 * math.sqrt(max(0.0, 1 - ((i / 24 - .5) / .5) ** 2.0))) * (0.92 + 0.12 * min(1, i / 6)) + .0001, 0) for i in range(0, 25)]
        bulb = [(z, r, r) for z, r, _ in bulb]
        objs.append(loft('bulb', bulb, m['rubber'], seg=64))
        labels.append(label_band('label', m['label'], 2.35, 2.2, 6.8, arc=0.62, eps=0.02))
    elif kind == 'jar':       # баночка с крышкой
        objs.append(cyl('body', body_m if noir else m['gloss'], 4.5, 0, 4.4, bev=0.55, top_bev=0.2))
        objs.append(cyl('lid', m['gold'], 4.72, 4.2, 6.9, bev=0.4))
        objs.append(cyl('lidtop', m['gold'], 3.6, 6.7, 7.05, bev=0.1))
        labels.append(label_band('label', m['label'], 4.5, 0.9, 3.6, arc=0.55, eps=0.02))
    elif kind == 'box':       # картонная коробка (ампулы)
        b = box('box', m['box'], 9.6, 6.4, 2.8, loc=(0, 0, 3.2 * CM), rot=-20)
        objs.append(b)
        g = box('foil', m['gold'], 9.64, 0.45, 2.84, loc=(0, 0, 5.6 * CM), rot=-20, bev=0.05); objs.append(g)
        labels = []
    elif kind == 'device':    # косметологический аппарат (ручка)
        rings = [(0, 1.3, 1.3)] + [(i * 1.0, 1.9 - 0.5 * (i / 11), 1.9 - 0.5 * (i / 11)) for i in range(1, 13)]
        objs.append(loft('handle', [(0.0, 1.3, 1.3)] + [(0.6 + 11.2 * i / 20, 1.9 - 0.45 * math.sin(math.pi * i / 20), 1.9 - 0.45 * math.sin(math.pi * i / 20)) for i in range(21)], m['gloss'], seg=96))
        objs.append(cyl('ring', m['gold'], 2.0, 11.4, 12.4, bev=0.12))
        head = [(12.2 + i * 0.4, 2.5 * math.sqrt(max(0, 1 - ((i * .4 - 2.4) / 2.5) ** 2)) + .0001, 2.5 * math.sqrt(max(0, 1 - ((i * .4 - 2.4) / 2.5) ** 2)) + .0001) for i in range(0, 13)]
        objs.append(loft('head', head, m['gloss'], seg=96))
        objs.append(cyl('btn', m['gold'], 0.55, 5.0, 5.35, bev=0.05, loc=(0, -1.88 * CM, 0)))
        objs[-1].rotation_euler = (math.radians(90), 0, 0); objs[-1].location = (0, -1.8 * CM, 7.5 * CM)
        labels = []
    return objs, labels

def setup_scene(sc, m):
    # купол с тёплым градиентом (для отражений и мягкого света); камера его не видит
    bpy.ops.mesh.primitive_uv_sphere_add(radius=4, segments=48, ring_count=24); dome = bpy.context.object; dome.name = 'dome'
    dome.scale = (1, 1, 1); bpy.ops.object.shade_smooth()
    bm = bmesh.new(); bm.from_mesh(dome.data); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(dome.data); bm.free()
    dm = bpy.data.materials.new('domem'); dm.use_nodes = True; nt = dm.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY_ADD'; mul.inputs[1].default_value = 0.125; mul.inputs[2].default_value = 0.5   # z∈[-4;4] → [0;1]
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], mul.inputs[0]); nt.links.new(mul.outputs[0], ramp.inputs[0])
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.62, 0.50, 0.37, 1)
    ramp.color_ramp.elements.new(0.55); ramp.color_ramp.elements[1].color = (0.80, 0.74, 0.66, 1)
    ramp.color_ramp.elements[2].position = 1.0; ramp.color_ramp.elements[2].color = (1.6, 1.5, 1.38, 1)
    nt.links.new(ramp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = float(os.environ.get('PACK_DOME', 0.42)); nt.links.new(em.outputs[0], out.inputs[0])
    dome.data.materials.append(dm); dome.visible_camera = False; dome.visible_shadow = False
    # мягкие источники
    def area(name, loc, size, energy, color=(1, 0.96, 0.9), shape='RECTANGLE', size_y=None):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.shape = shape; ld.color = color
        if size_y: ld.size_y = size_y
        lo = bpy.data.objects.new(name, ld); bpy.context.collection.objects.link(lo); lo.location = loc
        d = Vector((0, 0, 0.09)) - Vector(loc); lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return lo
    area('key', (-0.55, -0.7, 0.55), 0.55, float(os.environ.get('PACK_KEY', 34)), (1.0, 0.95, 0.88))
    area('rim', (0.7, 0.35, 0.35), 0.18, float(os.environ.get('PACK_RIM', 14)), (1.0, 0.98, 0.95), size_y=0.7)
    area('bounce', (0.0, -0.6, -0.25), 0.7, float(os.environ.get('PACK_BOUNCE', 9)), (1.0, 0.9, 0.72))
    area('fill', (0.5, -0.9, 0.15), 0.8, float(os.environ.get('PACK_FILL', 1.6)), (1.0, 0.97, 0.92))
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam = bpy.data.objects.new('cam', cam_d); bpy.context.collection.objects.link(cam)
    el = math.radians(7.0); dist = 2.0
    cam.location = (0, -dist * math.cos(el), 0.09 + dist * math.sin(el)); cam.rotation_euler = (math.radians(90) - el, 0, 0)
    sc.camera = cam; return cam

def render_one(kind, noir, sc, cam):
    for o in list(bpy.data.objects):
        if o.name not in ('dome', 'key', 'rim', 'fill', 'bounce', 'cam'): bpy.data.objects.remove(o, do_unlink=True)
    m = M(); objs, labels = build(kind, noir, m)
    # масштаб кадра по габариту
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]; zmin = min(p.z for p in pts); zmax = max(p.z for p in pts); xs = [p.x for p in pts]; ys = [p.y for p in pts]
    H = zmax - zmin; cam.data.ortho_scale = max(H, (max(xs) - min(xs))) * 1.25
    for o in bpy.data.objects:
        if o.name in ('dome',): o.location.z = (zmin + zmax) / 2
    cz = (zmin + zmax) / 2; el = math.radians(7.0); cam.location = (0, -2.0 * math.cos(el), cz + 2.0 * math.sin(el))
    sc.render.filepath = os.path.join('/tmp', 'pack_%s_%s.png' % (kind, 'n' if noir else 'w')); bpy.ops.render.render(write_still=True)
    # область этикетки в долях кадра
    boxes = []
    for lo in labels:
        us = [world_to_camera_view(sc, cam, lo.matrix_world @ v.co) for v in lo.data.vertices]
        boxes.append((min(u.x for u in us), 1 - max(u.y for u in us), max(u.x for u in us), 1 - min(u.y for u in us)))
    return sc.render.filepath, boxes

def finish(png, boxes, name):
    im = Image.open(png).convert('RGBA'); W, Hh = im.size
    a = np.asarray(im.getchannel('A')); ys, xs = np.where(a > 6); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 6; x0 = max(0, x0 - pad); y0 = max(0, y0 - pad); x1 = min(W, x1 + pad); y1 = min(Hh, y1 + pad)
    c = im.crop((x0, y0, x1, y1)); s = TARGET_H / c.height
    c = c.resize((max(1, round(c.width * s)), TARGET_H), Image.LANCZOS)
    info = {'file': 'assets/showroom/%s.webp' % name, 'w': c.width, 'h': c.height}
    if boxes:
        bx = boxes[0]; px = lambda u: (u * W - x0) / (x1 - x0); py = lambda v: (v * Hh - y0) / (y1 - y0)
        info['label'] = [round(px(bx[0]), 4), round(py(bx[1]), 4), round(px(bx[2]) - px(bx[0]), 4), round(py(bx[3]) - py(bx[1]), 4)]
    c.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6, alpha_quality=96)
    return info

if __name__ == '__main__':
    jobs = [('tube', False), ('bottle', False), ('bottle', True), ('pump', False), ('pump', True), ('dropper', False), ('dropper', True), ('jar', False), ('box', False), ('device', False)]
    want = sys.argv[1:]
    if want: jobs = [j for j in jobs if j[0] in want or ('%s-noir' % j[0]) in want]
    meta_path = os.path.join(OUT, 'packs.json'); meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for kind, noir in jobs:
        sc = reset(); m = M(); cam = setup_scene(sc, m)
        png, boxes = render_one(kind, noir, sc, cam)
        name = 'pack-%s%s' % (kind, '-noir' if noir else ''); meta[name] = finish(png, boxes, name); print(name, meta[name], flush=True)
        json.dump(meta, open(meta_path, 'w'), indent=1, ensure_ascii=False)
