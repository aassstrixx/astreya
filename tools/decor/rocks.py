#!/usr/bin/env python3
"""Декоративные камни «Астреи»: обломки травертина и известняка (Blender / Cycles).

Те же камни стоят в 3D-сценах (зал первого экрана главной, первый экран «Брендов», витрина каталога) и лежат на фоне страниц отдельными картинками с прозрачностью
(assets/decor/rock-*.webp: глыба с тенью на подложке, без фона). Форма — процедурная: сфера с шумовым смещением, срезанная несколькими плоскостями (получаются грани скола),
затем лёгкое сглаживание рёбер; материал — травертин из tools/showroom-assets/materials.py (поры, слои) плюс крупная неровность скола.

  python3 tools/decor/rocks.py render [id …]     — прозрачные картинки в assets/decor (все варианты или перечисленные) и assets/decor/rocks.json
  python3 tools/decor/rocks.py sheet              — контрольный лист всех камней на светлом фоне (/tmp/rocks-sheet.png)
Переменные: RK_SPP (сэмплов, по умолчанию 96), RK_SCALE (доля от полного разрешения), RK_OUT (папка вывода)."""
import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, os.path.join(HERE, '..', 'showroom-assets'))
import materials as MT
import scene as SC

OUT = os.environ.get('RK_OUT') or os.path.join(ROOT, 'assets', 'decor')
SPP = int(os.environ.get('RK_SPP', 96)); K = float(os.environ.get('RK_SCALE', 1.0))

# варианты набора: id → (вид, зерно, размеры по осям в метрах (длина, ширина, высота), срезы, тон камня)
ROCKS = {
    'boulder-a': dict(kind='boulder', seed=11, size=(.46, .34, .30), cuts=3, tint=(1.04, .95, .83), rough=.30),
    'boulder-b': dict(kind='boulder', seed=23, size=(.38, .36, .26), cuts=4, tint=(1.05, .94, .81), rough=.34),
    'boulder-c': dict(kind='boulder', seed=37, size=(.30, .24, .22), cuts=3, tint=(1.03, .95, .84), rough=.28),
    'slab-a':    dict(kind='slab', seed=5, size=(.62, .38, .13), cuts=4, tint=(1.04, .95, .82), rough=.16),
    'slab-b':    dict(kind='slab', seed=9, size=(.50, .30, .10), cuts=5, tint=(1.05, .94, .81), rough=.18),
    'chunk-a':   dict(kind='chunk', seed=17, size=(.26, .20, .24), cuts=5, tint=(1.04, .94, .82), rough=.36),
    'chunk-b':   dict(kind='chunk', seed=41, size=(.20, .16, .15), cuts=4, tint=(1.02, .94, .83), rough=.32),
    'pebble-a':  dict(kind='pebble', seed=3, size=(.12, .09, .06), cuts=1, tint=(1.03, .95, .85), rough=.10),
}
# составные группы для фона страниц (id → список (камень, смещение x, y, поворот °))
GROUPS = {
    'cluster-a': [('boulder-a', 0, 0, 20), ('chunk-b', .34, .10, -30), ('pebble-a', -.30, .16, 60)],
    'cluster-b': [('slab-a', 0, 0, -8), ('boulder-c', -.18, -.08, 40), ('pebble-a', .34, .12, 10)],
    'cluster-c': [('boulder-b', 0, 0, 10), ('chunk-a', .38, .06, 35), ('pebble-a', .12, .30, -20), ('pebble-a', -.30, .20, 80)],
}


def rock_material(name, tint, seed, size):
    """травертин + неровность скола: поры и слои из общей библиотеки, поверх — крупный шум рельефа (грубая поверхность излома)"""
    m = MT.travertine(name, tint, 1.0 / max(.25, max(size) * 2.4), 1.7, 2.6, honed=False)
    nt = m.node_tree; L = nt.links
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = .78
    bump = next(n for n in nt.nodes if n.type == 'BUMP')
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (seed * .37, seed * .21, seed * .13); L.new(tc.outputs['Object'], mp.inputs['Vector'])
    rough = nt.nodes.new('ShaderNodeTexNoise'); rough.inputs['Scale'].default_value = 16.0 / max(.2, max(size) * 1.8); rough.inputs['Detail'].default_value = 7.0; rough.inputs['Roughness'].default_value = .62; L.new(mp.outputs['Vector'], rough.inputs['Vector'])
    vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 7.0 / max(.2, max(size)); L.new(mp.outputs['Vector'], vor.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMath'); mix.operation = 'ADD'; L.new(rough.outputs['Fac'], mix.inputs[0]); L.new(vor.outputs['Distance'], mix.inputs[1])
    b2 = nt.nodes.new('ShaderNodeBump'); b2.inputs['Strength'].default_value = 1.4; b2.inputs['Distance'].default_value = .02 * max(size) * 3; L.new(mix.outputs['Value'], b2.inputs['Height'])
    L.new(b2.outputs['Normal'], bump.inputs['Normal'])
    return m


def make_rock(name, seed, size, kind='boulder', cuts=3, tint=(1, 1, 1), loc=(0, 0, 0), rot=0.0, mat=None, rough=.3, ground=True):
    """камень-обломок: возвращает объект Blender. loc — точка, на которую он опирается (низ камня ложится на z = loc.z); rot — поворот вокруг вертикали, градусы"""
    rnd = random.Random(seed)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.0)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
    amp = {'boulder': .20, 'slab': .09, 'chunk': .26, 'pebble': .12}.get(kind, .2)
    # 1) неправильная «картошка»: крупный шум + мелкий
    for v in bm.verts:
        p = v.co.copy(); n1 = noise.fractal(p * 1.1 + off, .5, 2.0, 4); n2 = noise.fractal(p * 3.4 + off * 1.7, .6, 2.0, 3)
        v.co = p * (1.0 + amp * n1 + amp * .35 * n2)
    # 2) срезы плоскостями: вершины за плоскостью прижимаются к ней — грани скола. У плиты — обязательно плоские верх и низ
    planes = []
    if kind == 'slab':
        planes += [(Vector((0, 0, 1)), .42 + rnd.uniform(-.04, .04)), (Vector((0, 0, -1)), .42 + rnd.uniform(-.04, .04))]
    for _ in range(cuts):
        nrm = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-.6, 1) if kind != 'slab' else rnd.uniform(-.25, .25))).normalized(); planes.append((nrm, rnd.uniform(.44, .70) if kind != 'pebble' else rnd.uniform(.7, .85)))
    if kind in ('boulder', 'chunk'):
        planes.append((Vector((0, 0, -1)), .50))            # плоское основание: камень лежит устойчиво
    for nrm, d in planes:
        for v in bm.verts:
            t = v.co.dot(nrm) - d
            if t > 0: v.co = v.co - nrm * t
    # 3) лёгкое сглаживание — рёбра сколов не острые, как у живого камня
    for _ in range(1): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm.verts:                                      # и мелкая «зернистость» формы
        p = v.co; v.co = p + p.normalized() * (.012 * noise.noise(p * 9.0 + off))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for pl in me.polygons: pl.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob.scale = (size[0] / 2, size[1] / 2, size[2] / 2)      # unit-сфера радиусом 1 → заданные габариты
    bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_basis); ob.scale = (1, 1, 1)
    zmin = min(v.co.z for v in ob.data.vertices)            # опускаем так, чтобы низ касался нулевого уровня
    ob.data.transform(__import__('mathutils').Matrix.Translation((0, 0, -zmin)))
    ob.rotation_euler = (0, 0, math.radians(rot)); ob.location = loc
    if mat is None: mat = rock_material(name + '_m', tint, seed, size)
    ob.data.materials.append(mat)
    return ob


# ---------------------------------------------------------------------------------------------------------------- прозрачные картинки
def studio(res):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    SC.settings(sc, res[0], res[1], SPP); sc.cycles.max_bounces = 8; sc.cycles.film_exposure = 1.0
    sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = float(os.environ.get('RK_EXP', -.65))
    sc.render.film_transparent = True
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 5.2; sun.angle = math.radians(2.2); sun.color = (1.0, .93, .80)
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so); so.rotation_euler = Vector((.88, .30, -.52)).normalized().to_track_quat('-Z', 'Y').to_euler()
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = 90; ar.size = 3; ar.color = (1.0, .94, .84)
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = (-.6, -2.2, 1.2); ao.rotation_euler = (math.radians(70), 0, math.radians(-14)); ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.98, .90, .78, 1); bg.inputs['Strength'].default_value = .38; sc.world = w
    # «пол»: ловит только тень — на странице камень лежит с мягкой контактной тенью, без прямоугольной подложки
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0)); fl = bpy.context.object; fl.is_shadow_catcher = True
    sc['floor'] = fl.name
    cd = bpy.data.cameras.new('cam'); cd.lens = 78; cd.sensor_width = 36; cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); sc.camera = cam
    return sc, cam


def aim(cam, target, dist, az=-18, el=24):
    a, e = math.radians(az), math.radians(el); t = Vector(target)
    cam.location = t + dist * Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()


def render_png(items, path, res=(1400, 1000), az=-18, el=24):
    """items: список (id камня, x, y, поворот°); один кадр с тенью на прозрачном фоне → PNG"""
    sc, cam = studio((round(res[0] * K), round(res[1] * K)))
    obs = []
    for k, (rid, x, y, rot) in enumerate(items):
        s = ROCKS[rid]; obs.append(make_rock('%s_%d' % (rid, k), s['seed'] + k, s['size'], s['kind'], s['cuts'], s['tint'], (x, y, 0), rot, rough=s['rough']))
    xs = [o.location.x for o in obs]; ys = [o.location.y for o in obs]
    ext = max(max(o.dimensions) for o in obs)
    tgt = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, ext * .22); span = (max(xs) - min(xs)) + ext * 1.25
    aim(cam, tgt, 4.0, az, el); cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(span * 1.15, ext * 1.9) * (res[0] / res[1]) / 1.4
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)                      # камень + тень на прозрачном фоне
    bpy.data.objects[sc['floor']].hide_render = True; sc.render.filepath = path.replace('.png', '-rock.png'); bpy.ops.render.render(write_still=True)          # только камень (без тени)


def to_webp(png, name, pad=18):
    """камень (непрозрачный) + мягкая тёплая тень под ним: тень берётся как разность прозрачностей двух кадров и красится в тёплый коричневый тон страницы"""
    import numpy as np
    from PIL import Image
    allr = np.asarray(Image.open(png).convert('RGBA')).astype(np.float32); rock = np.asarray(Image.open(png.replace('.png', '-rock.png')).convert('RGBA')).astype(np.float32)
    a_r = rock[..., 3] / 255.0; a_all = allr[..., 3] / 255.0; a_sh = np.clip(a_all - a_r, 0, 1) * .92
    sh = np.array([62, 42, 22], np.float32)
    a_out = a_r + a_sh * (1 - a_r)
    rgb = (rock[..., :3] * a_r[..., None] + sh * (a_sh * (1 - a_r))[..., None]) / np.maximum(a_out, 1e-4)[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), a_out * 255]).astype(np.uint8); im = Image.fromarray(out, 'RGBA'); ys, xs = np.where(out[..., 3] > 6)
    im = im.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad), min(im.height, ys.max() + pad)))
    dst = os.path.join(OUT, name + '.webp'); im.save(dst, 'WEBP', quality=88, method=6, alpha_quality=92)
    return {'file': 'assets/decor/' + name + '.webp', 'w': im.width, 'h': im.height, 'kb': os.path.getsize(dst) // 1024}


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'render'
    os.makedirs(OUT, exist_ok=True)
    if cmd == 'render':
        ids = sys.argv[2:] or list(ROCKS) + list(GROUPS); meta_p = os.path.join(OUT, 'rocks.json')
        meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
        for rid in ids:
            items = [(rid, 0, 0, 0)] if rid in ROCKS else [(r, x, y, a) for r, x, y, a in GROUPS[rid]]
            png = '/tmp/rock_%s.png' % rid; render_png(items, png)
            meta[rid] = to_webp(png, 'rock-' + rid); print(rid, meta[rid], flush=True)
            json.dump(meta, open(meta_p, 'w'), indent=1, ensure_ascii=False)
    elif cmd == 'sheet':
        from PIL import Image
        meta = json.load(open(os.path.join(OUT, 'rocks.json'))); ims = [Image.open(os.path.join(ROOT, m['file'])).convert('RGBA') for m in meta.values()]
        W = 1800; S = Image.new('RGBA', (W, 1100), (244, 240, 232, 255)); x = y = 20; rh = 0
        for im in ims:
            im = im.resize((int(im.width * .5), int(im.height * .5)))
            if x + im.width > W - 20: x = 20; y += rh + 20; rh = 0
            S.alpha_composite(im, (x, y)); x += im.width + 20; rh = max(rh, im.height)
        S.convert('RGB').save('/tmp/rocks-sheet.png'); print('/tmp/rocks-sheet.png')


if __name__ == '__main__':
    main()
