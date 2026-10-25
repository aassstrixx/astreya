#!/usr/bin/env python3
"""Страница «Бренды»: 3D-сцены в Blender/Cycles — широкий зал для первого экрана и арочные ниши-витрины брендов.
Материалы — из tools/showroom-assets/materials.py (травертин, известняк, штукатурка, плитка), свет и цвет — как в сцене каталога (окно с косым светом, тёплая LED-подсветка арки, цветокоррекция под палитру сайта).
Товары на подиумы в нишах кладёт сайт (HTML), поэтому в нишах стоят пустые подиумы, а их «посадочные места» (где стоит товар) записываются в assets/brands/niches.json.
В зале (hero) стоят условные упаковки из tools/showroom-assets/packs.py (без логотипов и надписей).

  python3 tools/brands-assets/scene.py hero                 — первый экран: assets/brands/hero.webp (3200×900) и hero-m.webp (2200×620, для узких экранов)
  python3 tools/brands-assets/scene.py niche A [B C …]      — ниши витрин по списку id брендов (assets/brands/niche-<id>.webp, niches.json)
  python3 tools/brands-assets/scene.py niche                — ниши всех брендов из data/brands.json
Переменные: BR_SPP (сэмплов), BR_SCALE (доля от полного разрешения, 0.25 — быстрый предпросмотр), BR_OUT (папка вывода)."""
import bpy, math, os, sys, json, random, zlib, addon_utils
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, os.path.join(HERE, '..', 'showroom-assets'))
import materials as MT
import scene as SC                      # геометрические помощники сцены каталога (арки, коробки, цилиндры), grade()
import packs as PK                      # условные упаковки

OUT = os.environ.get('BR_OUT') or os.path.join(ROOT, 'assets', 'brands'); os.makedirs(OUT, exist_ok=True)
SPP = int(os.environ.get('BR_SPP', 128)); K = float(os.environ.get('BR_SCALE', 1.0))

# оттенок ниши для каждого бренда: очень лёгкий намёк на цвет бренда (стена остаётся тёплым светлым камнем), id → (tint стены, tint камня подиума, раскладка)
NICHES = {
    'dermatime': {'wall': (1.00, .98, .97), 'trav': (1.00, .97, .94), 'lay': 'A'},
    'keenwell':  {'wall': (.98, .98, 1.00), 'trav': (1.00, .98, .96), 'lay': 'B'},
    'endocare':  {'wall': (.97, .99, 1.00), 'trav': (.99, .98, .95), 'lay': 'C'},
    'neoretin':  {'wall': (.99, .97, 1.00), 'trav': (1.00, .97, .95), 'lay': 'A'},
    'heliocare': {'wall': (1.03, .98, .93), 'trav': (1.03, .96, .88), 'lay': 'B'},
    'biretix':   {'wall': (.98, 1.00, .98), 'trav': (.99, .98, .94), 'lay': 'C'},
    'iraltone':  {'wall': (.99, 1.00, .96), 'trav': (1.00, .98, .92), 'lay': 'A'},
    'eva':       {'wall': (1.02, .97, .96), 'trav': (1.02, .96, .92), 'lay': 'B'},
    'elancyl':   {'wall': (.98, 1.00, .97), 'trav': (1.00, .98, .93), 'lay': 'C'},
}
FRAME = (0.56, 0.70)                    # м: ширина и высота кадра ниши (ниша — небольшая «витрина» ≈ 37 см шириной; упаковки 6–20 см — как в жизни)

def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    SC.settings(sc, 1000, 1000, SPP); sc.cycles.max_bounces = 10; sc.cycles.glossy_bounces = 6; sc.view_settings.exposure = float(os.environ.get('BR_EXP', -.45)); sc.view_settings.look = 'AgX - Medium High Contrast'
    return sc

def mats(wall_tint=(1, 1, 1), trav_tint=(1, 1, 1), scale=1.0):
    return {'plaster': MT.plaster('plaster', (.90, .82, .70), tint=wall_tint), 'inner': MT.limestone('inner', (.94, .87, .77)), 'trav': MT.travertine('trav', trav_tint, scale), 'trav2': MT.travertine('trav2', trav_tint, scale * 1.4, .8),
            'floor': MT.floor_stone('floor', trav_tint, .6), 'led': SC.mat_led('led', 14.0, (1.0, .80, .52)), 'glass': SC.mat_glass(), 'lime': MT.limestone('lime', (1.0, .97, .92))}

def boolean(ob, cutter, op='DIFFERENCE'):
    m = ob.modifiers.new('b', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = 'EXACT'
    cutter.hide_render = True; cutter.display_type = 'WIRE'

def apply_mods(ob):
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    for md in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)

def light_rig(sc, d=(.55, .72, -.5), energy=3.6, gobo=True, seed=1, size=1.0, center=(0, 0, .3), fill=1.0, cell=None, barw=.012, ang=1.4, U=4, V=3, leaf=None, dist=1.4, outer=True):
    """окно: солнце сквозь переплёт и ветку (оба невидимы камере, но отбрасывают мягкие тени); размер рисунка — size (м на ячейку)"""
    rnd = random.Random(seed); dirv = Vector(d).normalized(); C = Vector(center)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = energy; sun.angle = math.radians(ang); sun.color = (1.0, .93, .80)
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so); so.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler(); so.location = C - dirv * 6
    if gobo:
        mat = SC.mat_simple('gobo', (.1, .1, .1)); ex = dirv.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(dirv).normalized(); cen = C - dirv * dist
        off_u = rnd.uniform(-.2, .2) * size; off_v = rnd.uniform(-.15, .15) * size
        def bar(u0, v0, u1, v1):
            bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object; b.scale = (abs(u1 - u0), .01, abs(v1 - v0)); b.location = cen + ex * ((u0 + u1) / 2 + off_u) + ey * ((v0 + v1) / 2 + off_v)
            b.rotation_euler = __import__('mathutils').Matrix((ex, dirv, ey)).transposed().to_euler(); b.data.materials.append(mat); b.visible_camera = False
        cell = cell or .5 * size
        for i in range(-U, U + 1): bar(i * cell - barw * size, -V * cell, i * cell + barw * size, V * cell)
        for j in range(-V, V + 1): bar(-U * cell, j * cell - barw * size, U * cell, j * cell + barw * size)
        if outer:                                                      # рама окна — тень сплошным краем (в зале не нужна: переплёт дальше кадра)
            bar(-U * cell - 2, V * cell, U * cell + 2, V * cell + 2); bar(-U * cell - 2, -V * cell - 2, U * cell + 2, -V * cell); bar(-U * cell - 2, -V * cell, -U * cell, V * cell); bar(U * cell, -V * cell, U * cell + 2, V * cell)
    if leaf:                                                         # тень ветки на стене (ветка вне кадра, камере не видна)
        before = set(bpy.data.objects.keys()); olive((leaf[0], leaf[1], leaf[2]), leaf[3] * .3, 26, leaf[3], random.Random(seed))
        for k in set(bpy.data.objects.keys()) - before: bpy.data.objects[k].visible_camera = False
    # заполняющий мягкий свет из зала
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = 60 * fill * size ** 2; ar.size = 3 * size; ar.size_y = 2 * size; ar.color = (1.0, .93, .82)
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = C + Vector((-.4, -3.0, 1.2)) * size; ao.rotation_euler = (math.radians(78), 0, math.radians(6)); ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.98, .90, .78, 1); bg.inputs['Strength'].default_value = .16; sc.world = w

def camera(sc, loc, lens, target=None, rot=None):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam)
    cam.location = loc; cam.rotation_euler = rot or (math.radians(90), 0, 0); sc.camera = cam; bpy.context.view_layer.update(); return cam

def olive(base, h=.3, n=14, sc=1.0, rnd=None, grp='plant', seed=2):
    """ветка оливы: стебель-трубка и узкие листья; небольшая, как в референсе (декор, не главное)"""
    rnd = rnd or random.Random(seed); base = Vector(base)
    leaf = SC.leaf_mesh(L=.075 * sc, Wd=.016 * sc); m1 = bpy.data.materials.new('olive'); m1.use_nodes = True; b = m1.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (.34, .40, .22, 1); b.inputs['Roughness'].default_value = .5; leaf.materials.append(m1)
    ms = bpy.data.materials.new('stem'); ms.use_nodes = True; ms.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.30, .26, .17, 1)
    pts = [base, base + Vector((-.012 * sc, 0, h * .35)), base + Vector((-.03 * sc, .004, h * .7)), base + Vector((-.05 * sc, .006, h))]
    cu = bpy.data.curves.new('st', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    cu.bevel_depth = .0012 * sc; co = bpy.data.objects.new('stem', cu); cu.materials.append(ms); bpy.context.collection.objects.link(co)
    def at(t): f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i + 1], f - i)
    for i in range(1, n + 1):
        t = i / (n + 1) * .94 + .06; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
        for side in (-1, 1):
            ob = bpy.data.objects.new('lf', leaf); bpy.context.collection.objects.link(ob); ob.scale = ((1.0 - .3 * t) * (.85 + rnd.random() * .3),) * 3
            dv = (d * .5 + Vector((side * 1.0, rnd.uniform(-.2, .3), rnd.uniform(.05, .35)))).normalized(); ob.rotation_euler = dv.to_track_quat('Y', 'Z').to_euler(); ob.location = pos

def vase(loc, h=.075, r=.028, mat=None):
    prof = [(0, 0), (.55 * r, 0), (.9 * r, .1 * h), (r, .38 * h), (.78 * r, .7 * h), (.42 * r, .88 * h), (.4 * r, h), (.52 * r, 1.05 * h), (0, 1.05 * h)]
    seg = 64; verts, faces = [], []
    for (rr, z) in prof:
        for k in range(seg): a = 2 * math.pi * k / seg; verts.append((rr * math.cos(a) + loc[0], rr * math.sin(a) + loc[1], z + loc[2]))
    for i in range(len(prof) - 1):
        for k in range(seg): faces.append((i * seg + k, i * seg + (k + 1) % seg, (i + 1) * seg + (k + 1) % seg, (i + 1) * seg + k))
    me = bpy.data.meshes.new('vase'); me.from_pydata(verts, [], faces); me.update(); ob = bpy.data.objects.new('vase', me); bpy.context.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    m = mat or SC.mat_simple('ceramic', (.93, .90, .84), .3); ob.data.materials.append(m); return ob

# ---------------------------------------------------------------------------------------------------------------- НИШИ
def niche_scene(bid):
    cfg = NICHES.get(bid, NICHES['dermatime']); sc = fresh(); M = mats(cfg['wall'], cfg['trav'], 1.0)
    W_, H_ = FRAME; rx, zs, depth = .185, .30, .125; thick = .15
    wall = SC.box('wall', M['plaster'], -.9, .9, 0, thick, -.1, 1.4, 'w', 0)
    cut = SC.arch_solid('cut', M['plaster'], 0, rx, zs, -.1, depth, 'w', z0=-.2); reb = SC.arch_solid('reb', M['plaster'], 0, rx + .02, zs, -.1, .012, 'w', z0=-.2)
    boolean(wall, cut); boolean(wall, reb); apply_mods(wall)
    wall.data.materials.append(M['inner'])                             # внутренняя поверхность ниши — чуть другой камень (светлее, мягче)
    for p in wall.data.polygons:
        c = p.center
        if c.y > .02 and abs(c.x) <= rx + .002 and c.z <= zs + rx + .002: p.material_index = 1
    # LED-подсветка: тонкая арочная линия у задней стенки по контуру свода
    SC.arch_frame('led', M['led'], 0, rx - .045, zs - .03, .006, depth - .018, depth - .006, 'w', z0=.0)
    # пол ниши: плита из травертина и два каменных «карниза» перед проёмом
    SC.box('slab', M['trav'], -rx, rx, -.07, depth, 0, .018, 'w', .002)
    SC.box('ledge', M['trav2'], -rx - .03, rx + .03, -.075, .02, -.05, .014, 'w', .002)
    L = cfg['lay']; slots = []
    def cylp(name, cx, cy, r, z1, z0=.018): SC.cylinder(name, M['trav'], cx, cy, r, z0, z1, 'p', seg=96, bev=.002); return (cx, cy, z1, r * 2)
    def blk(name, cx, cy, w, d, z1, z0=.018): SC.box(name, M['trav2'], cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, z0, z1, 'p', .003); return (cx, cy, z1, w)
    if L == 'A':      # главный цилиндр + низкий цилиндр спереди слева + малый блок справа
        slots += [cylp('p1', .0, .05, .090, .165), cylp('p2', -.105, -.04, .060, .088), blk('p3', .115, -.03, .095, .075, .062)]
    elif L == 'B':    # ступенчатый блок: широкое основание и высокий постамент справа + малый цилиндр слева
        blk('base', 0.0, .03, .30, .115, .075); slots += [blk('p1', .075, .02, .110, .090, .150, .075), (-.065, .03, .075, .09), cylp('p3', -.115, -.045, .042, .052)]
    else:             # низкая широкая «чаша» + цилиндр на ней + малый блок
        cylp('p1', .0, .04, .120, .090); cylp('p2', -.04, .03, .055, .160, .090); blk('p3', -.125, -.045, .075, .06, .050)
        slots += [(-.04, .03, .160, .11), (.075, .05, .090, .07), (-.125, -.045, .050, .075)]
    deco = bid in ('dermatime', 'biretix', 'eva')                    # декор — не в каждой нише (3 из 9)
    if deco:
        vase((.15, .075, .018), .075, .027); olive((.15, .075, .018 + .07), .26, 14, 1.0, random.Random(zlib.crc32(bid.encode()) & 255))
    light_rig(sc, seed=zlib.crc32(bid.encode()) % 997, size=.26, center=(0, 0, .28), energy=6.0, fill=1.0)
    cam = camera(sc, (0, -1.34, .35), 85)
    return sc, cam, slots, deco

def render_niche(bid, ids):
    sc, cam, slots, deco = niche_scene(bid); w, h = round(720 * K), round(900 * K)
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.film_transparent = False
    sc.render.filepath = '/tmp/br_niche_%s.png' % bid; bpy.ops.render.render(write_still=True)
    im = np.asarray(Image.open(sc.render.filepath).convert('RGB')).astype(np.float32); im = SC.grade(im, lift=.035)
    name = 'niche-%s.webp' % bid; Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name), 'WEBP', quality=84, method=6)
    sl = []
    for (x, y, z, wd) in slots:
        p = world_to_camera_view(sc, cam, Vector((x, y, z))); q = world_to_camera_view(sc, cam, Vector((x + wd / 2, y, z)))
        sl.append({'x': round(p.x, 4), 'y': round(1 - p.y, 4), 'w': round(abs(q.x - p.x) * 2, 4)})
    return name, sl, deco

# ---------------------------------------------------------------------------------------------------------------- HERO
def place_pack(kind, noir, loc, rotz=0.0, scale=2.0):
    m = PK.M(); objs, _ = PK.build(kind, noir, m); g = bpy.data.objects.new('pk_' + kind, None); bpy.context.collection.objects.link(g)
    for o in objs: o.parent = g
    g.location = loc; g.rotation_euler = (0, 0, math.radians(rotz)); g.scale = (scale,) * 3

def hero_scene():
    sc = fresh(); M = mats((1.0, .99, .97), (1.02, .96, .90), 1.0); L = SC
    wall = L.box('wall', M['plaster'], -9, 11, 0, .9, 0, 5.0, 'w', 0)
    A = {'cx': 2.55, 'rx': 1.12, 'zs': 1.45}; B = {'cx': 4.95, 'rx': .62, 'zs': 1.60}; depth_a, depth_b = .8, .55
    C0 = {'cx': -3.25, 'rx': .74, 'zs': 1.32}; depth_c = .6                                  # высокая узкая ниша у левого края кадра: заполняет пустую стену слева от заголовка
    cutA = L.arch_solid('cutA', M['plaster'], A['cx'], A['rx'], A['zs'], -.2, depth_a, 'w', z0=-.2); cutB = L.arch_solid('cutB', M['plaster'], B['cx'], B['rx'], B['zs'], -.2, depth_b, 'w', z0=.35)
    rebA = L.arch_solid('rebA', M['plaster'], A['cx'], A['rx'] + .06, A['zs'], -.2, .05, 'w', z0=-.2)
    cutC = L.arch_solid('cutC', M['plaster'], C0['cx'], C0['rx'], C0['zs'], -.2, depth_c, 'w', z0=.35); rebC = L.arch_solid('rebC', M['plaster'], C0['cx'], C0['rx'] + .05, C0['zs'], -.2, .04, 'w', z0=.30)
    for c in (cutA, cutB, rebA, cutC, rebC): boolean(wall, c)
    apply_mods(wall); wall.data.materials.append(M['inner'])
    for p in wall.data.polygons:
        c = p.center
        if c.y > .06 and ((abs(c.x - A['cx']) <= A['rx'] + .003 and c.z <= A['zs'] + A['rx'] + .003) or (abs(c.x - B['cx']) <= B['rx'] + .003 and c.z <= B['zs'] + B['rx'] + .003 and c.z > .33) or (abs(c.x - C0['cx']) <= C0['rx'] + .003 and c.z <= C0['zs'] + C0['rx'] + .003 and c.z > .33)): p.material_index = 1
    # цоколь из травертина вдоль стены и рифлёная пилястра между левой частью и аркой
    L.box('plinth', M['trav2'], -9, A['cx'] - A['rx'] - .06, -.03, 0, 0, .12, 'w', .006); L.box('plinthR', M['trav2'], A['cx'] + A['rx'] + .06, 11, -.03, 0, 0, .12, 'w', .006)
    for i in range(9): L.cylinder('reed%d' % i, M['trav2'], .62 + i * .066, -.02, .029, 0.0, 4.2, 'w', seg=24, bev=0)
    # LED-линии: свод большой арки и малой ниши
    L.arch_frame('ledA', M['led'], A['cx'], A['rx'] - .1, A['zs'] - .1, .035, depth_a - .06, depth_a - .02, 'w', z0=.0)
    L.arch_frame('ledB', M['led'], B['cx'], B['rx'] - .07, B['zs'] - .07, .028, depth_b - .05, depth_b - .02, 'w', z0=.45)
    L.arch_frame('ledC', M['led'], C0['cx'], C0['rx'] - .07, C0['zs'] - .07, .026, depth_c - .05, depth_c - .02, 'w', z0=.45)
    # пол: полированный камень во всю ширину
    L.box('floor', M['floor'], -12, 14, -9, .9, -.3, 0, 'w', 0)
    # внутри большой арки: плита, круглый подиум с вазой и ветвью оливы
    L.box('slabA', M['trav'], A['cx'] - A['rx'], A['cx'] + A['rx'], -.06, depth_a, 0, .06, 'w', .006)
    L.cylinder('podA', M['trav'], A['cx'], .38, .56, .06, .52, 'p', seg=128, bev=.012)
    L.cylinder('podA2', M['trav2'], A['cx'] - .62, .30, .26, .06, .26, 'p', seg=96, bev=.008)
    # малая ниша: три каменные полки
    shelves = [(.92, 'sh1'), (1.52, 'sh2')]
    for z, nm in shelves: L.box(nm, M['trav'], B['cx'] - B['rx'], B['cx'] + B['rx'], .0, depth_b, z, z + .035, 'p', .004)
    # передний план: круглый и ступенчатый подиумы
    L.cylinder('podF', M['trav'], 1.05, -1.25, .52, 0, .66, 'p', seg=128, bev=.012)
    L.box('stp1', M['trav2'], 3.15, 4.05, -1.55, -.85, 0, .34, 'p', .012); L.box('stp2', M['trav2'], 3.55, 4.05, -1.35, -.85, .34, .72, 'p', .012)
    L.cylinder('podL', M['trav'], -.35, -.95, .30, 0, .30, 'p', seg=96, bev=.008)
    # левая ниша: плита и две каменные полки
    L.box('slabC', M['trav'], C0['cx'] - C0['rx'], C0['cx'] + C0['rx'], -.05, depth_c, .35, .41, 'w', .006)
    for z, nm in ((.88, 'shC1'), (1.42, 'shC2')): L.box(nm, M['trav'], C0['cx'] - C0['rx'], C0['cx'] + C0['rx'], .0, depth_c, z, z + .035, 'p', .004)
    # передний план слева: высокий цилиндрический подиум с вазой и веткой, низкая скамья с каменной чашей
    L.cylinder('podV', M['trav'], -2.95, -1.45, .46, 0, .46, 'p', seg=128, bev=.012)
    L.box('bench', M['trav2'], -1.95, -.85, -1.3, -.78, 0, .3, 'p', .012)
    bowl = PK.revolve('bowl', PK.fillet([(0, 0), (5.5, 0), (10.5, 2.2), (11.5, 5.8), (10.8, 5.8), (9.6, 3.0), (5.0, 1.2), (0, 1.2)], [0, .3, 1.5, .25, .25, 1.2, .3, 0], 6), M['trav'], seg=96)
    bg = bpy.data.objects.new('bowlg', None); bpy.context.collection.objects.link(bg); bowl.parent = bg; bg.location = (-1.55, -1.04, .3); bg.scale = (2.6,) * 3
    # декор и упаковки (мелкие, как на референсе)
    vase((A['cx'] + .05, .36, .52), .26, .09); olive((A['cx'] + .05, .36, .52 + .26), .85, 24, 2.6, random.Random(5))
    place_pack('jar', False, (A['cx'] - .22, .30, .52), 8); place_pack('bottle', False, (A['cx'] - .38, .40, .52), 0, 1.0); place_pack('pump', True, (A['cx'] + .30, .22, .52), -6)
    place_pack('dropper', False, (A['cx'] - .62, .30, .26), 0); place_pack('tube', False, (A['cx'] - .50, .22, .26), 12)
    place_pack('bottle', True, (B['cx'] - .18, .22, 1.52 + .035), 0, 1.0); place_pack('jar', False, (B['cx'] + .16, .20, 1.52 + .035), 0); place_pack('dropper', True, (B['cx'], .30, .92 + .035), 0); place_pack('pump', False, (B['cx'] + .24, .22, .92 + .035), 8)
    place_pack('bottle', False, (1.05 - .15, -1.25, .66), 0); place_pack('jar', False, (1.05 + .2, -1.18, .66), 10); place_pack('tube', False, (1.05 + .03, -1.40, .66), -10)
    place_pack('pump', False, (3.8, -1.2, .72), 0); place_pack('dropper', True, (3.4, -1.25, .34), 0); place_pack('jar', False, (3.62, -1.0, .34), 0)
    place_pack('bottle', True, (-.35, -.95, .30), 0)
    vase((-2.95, -1.45, .46), .26, .09); olive((-2.95, -1.45, .46 + .26), .85, 24, 2.5, random.Random(8))
    place_pack('jar', False, (-1.2, -1.02, .3), 8); place_pack('tube', False, (-1.02, -.98, .3), -8)
    place_pack('bottle', False, (C0['cx'] - .28, .3, .88 + .035), 0); place_pack('pump', True, (C0['cx'] + .08, .25, .88 + .035), 0); place_pack('jar', False, (C0['cx'] + .42, .28, .88 + .035), 12)
    place_pack('dropper', False, (C0['cx'] - .3, .28, 1.42 + .035), 0); place_pack('bottle', True, (C0['cx'] + .05, .28, 1.42 + .035), 0); place_pack('tube', False, (C0['cx'] + .36, .25, 1.42 + .035), 6)
    place_pack('dropper', True, (C0['cx'] - .1, .32, .41), 0); place_pack('jar', False, (C0['cx'] + .24, .3, .41), 0)
    # свет: окно слева, мягкая диагональ по левой стене и полу
    light_rig(sc, d=(.62, .72, -.42), seed=3, size=1.7, center=(.4, 0, 1.4), energy=3.9, fill=1.6, cell=2.6, barw=.085, ang=2.4, U=9, V=5, dist=11.0, outer=False)
    cam = camera(sc, (.7, -10.0, 1.05), 38); cam.data.shift_y = .0158
    return sc, cam

def render_hero():
    sc, cam = hero_scene(); w, h = round(3200 * K), round(900 * K); sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.film_transparent = False
    sc.render.filepath = '/tmp/br_hero.png'; bpy.ops.render.render(write_still=True)
    im = np.asarray(Image.open(sc.render.filepath).convert('RGB')).astype(np.float32); im = Image.fromarray(np.clip(SC.grade(im, lift=.07), 0, 255).astype(np.uint8))
    im.save(os.path.join(OUT, 'hero.webp'), 'WEBP', quality=82, method=6); im.resize((round(w * .69), round(h * .69)), Image.LANCZOS).save(os.path.join(OUT, 'hero-m.webp'), 'WEBP', quality=80, method=6)
    print('hero', os.path.getsize(os.path.join(OUT, 'hero.webp')) // 1024, 'КБ', flush=True)

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'hero'
    if mode == 'hero': render_hero()
    else:
        ids = sys.argv[2:] or [b['id'] for b in json.load(open(os.path.join(ROOT, 'data', 'brands.json')))]
        mp = os.path.join(OUT, 'niches.json'); meta = json.load(open(mp)) if os.path.exists(mp) else {}
        for bid in ids:
            name, sl, deco = render_niche(bid, ids); meta[bid] = {'file': 'assets/brands/' + name, 'slots': sl, 'frame': list(FRAME), 'deco': deco}
            print(bid, name, sl, flush=True); json.dump(meta, open(mp, 'w'), indent=1, ensure_ascii=False)
