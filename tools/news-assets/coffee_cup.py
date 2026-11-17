"""Чашка кофе для стола на странице «Новости»: вид сверху (как газета — лежит на столе), блюдце, ложка, кофе с кремой,
мягкая тень (shadow catcher) в прозрачном фоне. Результат: assets/news/coffee.webp (RGBA).
Запуск: python3 tools/news-assets/coffee_cup.py [выходной.png]   (нужен bpy: pip install bpy)"""
import bpy, bmesh, math, sys, os
from mathutils import Vector

OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else '/tmp/coffee_raw.png'
RES = int(os.environ.get('CUP_RES', '1400'))
SAMPLES = int(os.environ.get('CUP_SPP', '96'))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = SAMPLES
sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ.get('CUP_THREADS', '2'))
sc.render.resolution_x = sc.render.resolution_y = RES
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
try:
    sc.cycles.use_denoising = True
except Exception:
    pass
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = -0.25

def mat(name, base, rough=0.3, metal=0.0, spec=0.5, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    for k in ('Specular IOR Level', 'Specular'):
        if k in b.inputs: b.inputs[k].default_value = spec; break
    for k in ('Coat Weight', 'Clearcoat'):
        if k in b.inputs: b.inputs[k].default_value = coat; break
    return m

def lathe(name, profile, segs=128, material=None, smooth=True):
    """тело вращения вокруг оси Z по профилю [(r, z), ...]"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)]
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if material: ob.data.materials.append(material)
    return ob

# --- материалы: тёплая белая керамика, кофе с кремой, сталь
ceramic = mat('ceramic', (0.90, 0.85, 0.76), rough=0.2, spec=0.5, coat=0.35)
steel = mat('steel', (0.55, 0.55, 0.57), rough=0.34, metal=1.0)
coffee = bpy.data.materials.new('coffee'); coffee.use_nodes = True
nt = coffee.node_tree; nodes, links = nt.nodes, nt.links
bsdf = nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.12
tc = nodes.new('ShaderNodeTexCoord'); mp = nodes.new('ShaderNodeMapping')
mp.inputs['Scale'].default_value = (1, 1, 1)
grad = nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 5.5; noise.inputs['Detail'].default_value = 6
wave = nodes.new('ShaderNodeTexWave'); wave.wave_type = 'RINGS'; wave.inputs['Scale'].default_value = 3.2; wave.inputs['Distortion'].default_value = 9; wave.inputs['Detail'].default_value = 3
mixn = nodes.new('ShaderNodeMath'); mixn.operation = 'ADD'
ramp = nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.30; ramp.color_ramp.elements[0].color = (0.028, 0.012, 0.006, 1)
ramp.color_ramp.elements[1].position = 0.86; ramp.color_ramp.elements[1].color = (0.36, 0.18, 0.08, 1)
e = ramp.color_ramp.elements.new(0.58); e.color = (0.12, 0.055, 0.024, 1)
links.new(tc.outputs['Object'], mp.inputs['Vector']); links.new(mp.outputs['Vector'], noise.inputs['Vector']); links.new(mp.outputs['Vector'], wave.inputs['Vector']); links.new(mp.outputs['Vector'], grad.inputs['Vector'])
mulg = nodes.new('ShaderNodeMath'); mulg.operation = 'MULTIPLY'; mulg.inputs[1].default_value = 0.8
links.new(grad.outputs['Fac'], mulg.inputs[0])
add1 = nodes.new('ShaderNodeMath'); add1.operation = 'ADD'; add1.inputs[1].default_value = 0.0
mulw = nodes.new('ShaderNodeMath'); mulw.operation = 'MULTIPLY'; mulw.inputs[1].default_value = 0.22
links.new(wave.outputs['Fac'], mulw.inputs[0])
mulnz = nodes.new('ShaderNodeMath'); mulnz.operation = 'MULTIPLY'; mulnz.inputs[1].default_value = 0.35
links.new(noise.outputs['Fac'], mulnz.inputs[0])
links.new(mulg.outputs['Value'], add1.inputs[0])
add2 = nodes.new('ShaderNodeMath'); add2.operation = 'ADD'
links.new(add1.outputs['Value'], add2.inputs[0]); links.new(mulw.outputs['Value'], add2.inputs[1])
add3 = nodes.new('ShaderNodeMath'); add3.operation = 'ADD'
links.new(add2.outputs['Value'], add3.inputs[0]); links.new(mulnz.outputs['Value'], add3.inputs[1])
links.new(add3.outputs['Value'], ramp.inputs['Fac']); links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

# --- блюдце (радиус ≈ 0,80)
saucer = lathe('saucer', [(0.0, 0.0), (0.36, 0.0), (0.60, 0.028), (0.78, 0.095), (0.805, 0.118), (0.79, 0.126), (0.77, 0.108), (0.60, 0.050), (0.30, 0.040), (0.0, 0.040)], material=ceramic)
# --- чашка: наружная стенка, венчик, внутренняя стенка, дно
cup_prof = [(0.0, 0.030), (0.20, 0.030), (0.27, 0.045), (0.36, 0.140), (0.43, 0.270), (0.475, 0.405), (0.482, 0.425), (0.470, 0.440), (0.445, 0.430), (0.440, 0.400), (0.40, 0.270), (0.33, 0.130), (0.22, 0.075), (0.0, 0.070)]
cup = lathe('cup', cup_prof, material=ceramic)
# --- кофе
cof_prof = [(0.0, 0.342), (0.20, 0.343), (0.36, 0.345), (0.425, 0.350), (0.43, 0.358)]
cof = lathe('coffee', cof_prof, material=coffee)
# --- ручка: полукольцо справа (по оси +X)
bpy.ops.mesh.primitive_torus_add(major_radius=0.135, minor_radius=0.033, major_segments=64, minor_segments=24, location=(0.545, 0, 0.255), rotation=(math.radians(90), 0, 0))
handle = bpy.context.active_object; handle.scale = (1.0, 1.0, 1.15); handle.data.materials.append(ceramic)
for p in handle.data.polygons: p.use_smooth = True
# --- ложка на блюдце: чаша и ручка на одной оси (пустышка задаёт поворот), ручка слегка приподнята на ободок блюдца
spoon = bpy.data.objects.new('spoon', None); sc.collection.objects.link(spoon)
spoon.location = (0.04, -0.57, 0.080); spoon.rotation_euler = (0, -math.radians(6), math.radians(-14))
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=64, ring_count=32, location=(0, 0, 0))
sb = bpy.context.active_object; sb.scale = (0.135, 0.092, 0.020); sb.data.materials.append(steel); sb.parent = spoon
for p_ in sb.data.polygons: p_.use_smooth = True
bpy.ops.mesh.primitive_cylinder_add(radius=0.0115, depth=0.50, vertices=32, location=(0.135 + 0.25, 0, -0.004), rotation=(0, math.radians(90), 0))
sh = bpy.context.active_object; sh.data.materials.append(steel); sh.parent = spoon
for p_ in sh.data.polygons: p_.use_smooth = True
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=32, ring_count=16, location=(0.135 + 0.50, 0, -0.004))
se = bpy.context.active_object; se.scale = (0.036, 0.024, 0.010); se.data.materials.append(steel); se.parent = spoon
for p_ in se.data.polygons: p_.use_smooth = True
# --- пара зёрен кофе на столе рядом с блюдцем
bean_mat = mat('bean', (0.16, 0.08, 0.035), rough=0.35, spec=0.4)
for (bx, by, ang) in [(-0.95, -0.55, 25), (-0.80, -0.78, -40), (-1.02, -0.72, 70)]:
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=32, ring_count=16, location=(bx, by, 0.034))
    bn = bpy.context.active_object; bn.scale = (0.060, 0.042, 0.032); bn.rotation_euler = (0, 0, math.radians(ang)); bn.data.materials.append(bean_mat)
    for p in bn.data.polygons: p.use_smooth = True
    # бороздка
    bpy.ops.mesh.primitive_cube_add(size=1, location=(bx, by, 0.060), rotation=(0, 0, math.radians(ang)))
    cr = bpy.context.active_object; cr.scale = (0.055, 0.004, 0.003); cr.data.materials.append(mat('crease' + str(ang), (0.04, 0.02, 0.01), rough=0.6))

# --- ловец теней
bpy.ops.mesh.primitive_plane_add(size=9, location=(0, 0, -0.0005))
ground = bpy.context.active_object; ground.is_shadow_catcher = True

# --- свет: мягкий из левого верхнего угла (тень вправо-вниз), нейтральный тёплый мир
bpy.ops.object.light_add(type='AREA', location=(-2.3, 2.3, 2.5))
L = bpy.context.active_object; L.data.energy = 150; L.data.size = 1.6
L.rotation_euler = (math.radians(24), math.radians(-18), 0)
bpy.ops.object.light_add(type='AREA', location=(2.2, -1.0, 2.0)); L2 = bpy.context.active_object; L2.data.energy = 22; L2.data.size = 3.2
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (1.0, 0.96, 0.9, 1); bg.inputs['Strength'].default_value = 0.30

# --- камера: сверху, ортографическая
bpy.ops.object.camera_add(location=(0.12, -0.05, 6.0), rotation=(0, 0, 0))
cam = bpy.context.active_object; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.45
sc.camera = cam
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('готово', OUT)
