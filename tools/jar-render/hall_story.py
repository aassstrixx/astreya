#!/usr/bin/env python3
"""Первый экран главной: зал с арками, нишей и подиумом + баночка «Астрея», которая по ходу анимации уходит на «полку» — опускается на подиум (Blender / Cycles).

Сцена целиком в метрах (баночка — настоящая модель из lumiere_scene.py, увеличена в 1,35 раза, как «геройский» предмет). Состав зала (по референсу заказчика):
  • стена из светлого камня с большой аркой, внутри — ступенчатая ниша со светящейся линией свода; в нише на низком постаменте — сфера-жемчужина (бренд-символ);
  • слева — проём второй арки и ветка оливы на переднем плане (она же отбрасывает на стену и пол пятна света от листьев); справа — рифлёная пилястра, ваза с оливой;
  • перед нишей — низкий круглый подиум из травертина; на нём флакон и баночка; рядом декоративные камни-обломки (tools/decor/rocks.py);
  • пол — светлый полированный камень с отражениями.
Сюжет (прогресс p от 0 до 1 = прокрутка сцены): A 0–0,28 крупный план баночки, она поворачивается, зал за ней в размытии; B 0,28–0,80 камера отъезжает к «главному кадру»,
баночка плавной дугой переходит к подиуму и опускается на него (контактная тень, лёгкий блик), в нише разгорается свет; C 0,80–1 покой: готовый кадр первого экрана.

  python3 hall_story.py still <кадр> out.png [--res 1600x900] [--samples 28] [--total 84] [--portrait]
  python3 hall_story.py anim <с> <по> outdir [--res …] [--samples …] [--total 84] [--portrait]     (готовые кадры пропускаются)
Кадры затем кодирует encode_arch.py → assets/jar-arch/d, m (и лёгкие наборы dm, mm). Подробности — README.md."""
import importlib.util
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'showroom-assets'))
sys.path.insert(0, os.path.join(HERE, '..', 'decor'))

import bpy
import numpy as np
from mathutils import Euler, Vector

import lumiere_scene as L
import materials as MT
import packs as PK
import rocks as RK
import stone_logo as SL


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


BR = _load('brscene', os.path.join(HERE, '..', 'brands-assets', 'scene.py'))   # булевы, ваза, олива, упаковки
SC = BR.SC                                                                       # геометрия: box, cylinder, arch_solid, arch_frame, mat_led…

# ---------------------------------------------------------------------------------------------------------------- геометрия зала (метры)
BIG = dict(cx=.40, rx=.40, zs=.42)            # большая арка (по внешнему ободку)
INN = dict(cx=.40, rx=.275, zs=.42)           # ниша внутри неё
LEFT = dict(cx=-1.32, rx=.56, zs=.52)         # проём слева (виден только правый бок)
POD = dict(x=.56, y=-.30, r=.19, h=.085)     # подиум
JAR_S = 1.5                                  # увеличение баночки относительно настоящей
JAR_FINAL = Vector((.63, -.27, POD['h']))     # где баночка стоит в готовом кадре
JAR_START = Vector((.64, -.92, .27))          # где она «парит» в начале (перед залом, чуть выше пола)
JAR_CENTER_Z = .036 * JAR_S                   # центр баночки над её основанием, м
TARGET_MAIN_L = Vector((.02, 0.0, .33))       # куда смотрит камера в главном кадре (ландшафт)
TARGET_MAIN_P = Vector((.42, 0.0, .62))       # (портрет)

LOGO_H = 1.80                                  # каменный знак-гора выше кадра: вершина уходит за верх, правая ветвь — за правый край, как гигантский знак на фоне прежнего героя
LOGO_CX = .741                                # центр знака по x: жемчужина знака совпадает с центром ниши (шар посередине арки, как на референсе)
LOGO_Y = -.42                                 # передняя грань горы (перед аркой, позади подиума)
LOGO_Z = -.012                               # низ знака: кончик левой «ножки» чуть врезан в пол — касается его остриём, не обрезан
LOGO_DEPTH = .46
LOGO_THICK = 11.0                             # насколько «полнеют» ножки горы и серп (кончики не трогаем — остаются острыми, как в логотипе)
SPHERE_TINT = (.62, .53, .41)                # каменный шар чуть темнее стен — как просил заказчик (на сайте он «живой»: вращается за курсором, см. spin)
SPHERE_3D = False                           # True — запечь каменный шар в кадры (на сайте вместо него живая жемчужина, css/home-arch.css → .ar-pearl)
SPHERE_X, SPHERE_Y, SPHERE_Z = .292, -1.10, .396              # шар парит далеко впереди горы и серпа — не «прилипает» к ним и даёт параллакс при движении камеры
SPHERE_R = .163                              # большой шар: диаметр ≈ 0.28 ширины кадра (ближе к камере — выглядит как прежний, чуть крупнее)

S = {}


def mats():
    M = {}
    M['wall'] = MT.travertine('hw_wall', (1.0, .92, .80), .55, .18, 2.6, honed=True)
    M['inner'] = MT.travertine('hw_inner', (1.04, .98, .90), 1.0, .2, 1.8, honed=True)
    M['trav'] = MT.travertine('hw_trav', (1.03, .96, .86), 1.0, 1.1, 1.3)
    M['trav2'] = MT.travertine('hw_trav2', (1.02, .95, .84), 1.5, .9, 1.0)
    M['floor'] = MT.travertine('hw_floor', (.99, .93, .84), .45, .25, 2.4, honed=True)
    fb = next(n for n in M['floor'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); fb.inputs['Roughness'].default_value = .20
    for k_, v_ in (('Coat Weight', .5), ('Coat Roughness', .05)):
        if k_ in fb.inputs: fb.inputs[k_].default_value = v_
    M['led'] = SC.mat_led('hw_led', 12.0, (1.0, .80, .52))
    M['back'] = SC.mat_simple('hw_back', (.95, .90, .80), .9)
    M['ceramic'] = SC.mat_simple('hw_ceramic', (.92, .87, .78), .34)
    return M


def build_architecture(M, portrait):
    # стена: толстая плита; вырезы — большая арка со ступенчатой нишей и проём слева
    wall = SC.box('wall', M['wall'], -3.2, 3.0, 0, .75, -.1, 2.4, 'w', 0)
    cuts = [
        SC.arch_solid('cutL', M['wall'], LEFT['cx'], LEFT['rx'], LEFT['zs'], -.1, .8, 'w', z0=-.2),               # проём слева — насквозь
        SC.arch_solid('cutB1', M['wall'], BIG['cx'], BIG['rx'], BIG['zs'], -.1, .09, 'w', z0=-.2),              # внешний ободок арки
        SC.arch_solid('cutB2', M['wall'], BIG['cx'], BIG['rx'] - .05, BIG['zs'] - .01, -.1, .20, 'w', z0=-.2),   # первая ступень
        SC.arch_solid('cutB3', M['wall'], INN['cx'], INN['rx'], INN['zs'], -.1, .46, 'w', z0=-.2),               # ниша
    ]
    for c in cuts:
        BR.boolean(wall, c)
    BR.apply_mods(wall)
    wall.data.materials.append(M['inner'])
    for pl in wall.data.polygons:                                                                               # внутри арок — известняк чуть светлее и мягче
        c = pl.center
        if c.y > .03 and abs(c.x - BIG['cx']) <= BIG['rx'] + .003 and c.z <= BIG['zs'] + BIG['rx'] + .003:
            pl.material_index = 1
    # светящаяся линия свода ниши
    S['led'] = SC.arch_frame('led', M['led'], INN['cx'], INN['rx'] - .045, INN['zs'] - .03, .008, .43, .452, 'w', z0=.0)
    # задняя стена за проёмом слева (светлее): виден «следующий зал»
    SC.box('back', M['back'], -4.0, -.3, .85, .95, -.1, 2.4, 'w', 0)
    # пол: полированный камень до самой камеры
    SC.box('floor', M['floor'], -4.0, 4.0, -8.0, 1.0, -.3, 0, 'w', 0)
    # плита-порог под нишей и ступень перед ней
    SC.box('slab', M['trav'], INN['cx'] - INN['rx'] - .06, INN['cx'] + INN['rx'] + .06, -.02, .44, 0, .028, 'w', .004)
    # постамент и каменный шар посередине арки (как на референсе); гора и волна — огромный каменный знак «Астреи» перед аркой (собирается по ходу анимации — см. logo_state)
    if SPHERE_3D:                                                                                                                              # шар теперь — живая «жемчужина» на сайте (переливается и следит за курсором), в кадры не запекается
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=96, radius=SPHERE_R, location=(SPHERE_X, SPHERE_Y, SPHERE_Z))
        sp = bpy.context.object
        sp.name = 'stone_sphere'
        bpy.ops.object.shade_smooth()
        sp.data.materials.append(SL.sphere_stone('hall_sphere', SPHERE_TINT, 1.1))
        S['sphere'] = sp
    mats = SL.materials(LOGO_H / SL.YH, .78, .45)
    S['logo'] = SL.build_logo(LOGO_H, (LOGO_CX, LOGO_Y, LOGO_Z), depth=LOGO_DEPTH, mats=mats, parts=('mountain', 'band'), thick=LOGO_THICK)
    for key in ('mountain', 'band'):
        S['logo_home_' + key] = S['logo'][key].location.copy()
    # рифлёная пилястра справа (вертикальные валики)
    for i in range(9):
        SC.cylinder('reed%d' % i, M['trav2'], .86 + i * .075, -.02, .038, 0.0, 2.2, 'w', seg=24, bev=0)
    # подиум
    SC.cylinder('podium', M['trav'], POD['x'], POD['y'], POD['r'], 0, POD['h'], 'p', seg=128, bev=.004)
    SC.cylinder('podium_step', M['trav2'], POD['x'], POD['y'], POD['r'] + .035, 0, .026, 'p', seg=128, bev=.003)


def build_decor(M, portrait):
    """камни-обломки (общие с остальным сайтом), ваза с оливой справа, олива на переднем плане слева"""
    def rock(rid, loc, rot, k=0, scale=1.0):
        s = RK.ROCKS[rid]
        size = tuple(v * scale for v in s['size'])
        return RK.make_rock('%s_%d' % (rid, k), s['seed'] + k, size, s['kind'], s['cuts'], s['tint'], loc, rot, rough=s['rough'])
    rock('boulder-c', (.42, -.70, 0), 25, 1, .55)
    rock('chunk-b', (-.05, -.74, 0), -40, 2, .60)
    rock('slab-b', (.74, -.06, 0), -6, 3, .80)
    rock('boulder-b', (.86, -.46, 0), 35, 4, .60)
    rock('pebble-a', (.36, -.52, 0), 60, 5, 1.1)
    # ваза и олива справа (как у пилястры на референсе)
    BR.vase((.98, -.14, 0), .30, .085, M['ceramic'])
    BR.olive((.98, -.14, .30 + .026), .90, 26, .78, random.Random(7), lean=-.10)
    # флакон на подиуме (слева от баночки) — на прежнем месте
    before = set(bpy.data.objects)
    BR.place_pack('bottle', False, (POD['x'] - .125, POD['y'] - .03, POD['h']), 8, .92)
    S['bottle'] = [o for o in bpy.data.objects if o not in before]
    grp = next(o for o in S['bottle'] if o.type == 'EMPTY')
    for o in S['bottle']:                                                  # этикетка и «волоски» в упаковке не привязаны к группе — без этого они остаются у начала координат
        if o.parent is None and o is not grp: o.parent = grp
    # олива на переднем плане слева — сама в кадре и отбрасывает пятна света от листьев на стену и пол
    BR.vase((-.92, -1.10, 0), .26, .10, M['ceramic'])
    BR.olive((-.92, -1.10, .26 + .03), .52, 28, 1.12, random.Random(3), lean=.31)                  # ветка выглядывает у левого края кадра (как на референсе), а не прячется за ним
    BR.olive((-.86, -1.08, .26 + .03), .44, 22, .98, random.Random(12), lean=.23)
    if portrait:                                                                                      # на телефоне камера уже и ближе: ветка заходит в кадр сверху-слева, прямо у заголовка (корни за краем кадра)
        BR.olive((.0, -.85, .64), .50, 26, 1.0, random.Random(5), lean=.31)
        BR.olive((-.02, -.83, .52), .40, 22, .9, random.Random(8), lean=.22)


def build_shadow_branches():
    """ветки оливы вне кадра (камере не видны): отбрасывают пятна света от листьев на стену слева и пол — как на референсе"""
    before = set(bpy.data.objects.keys())
    BR.olive((-1.05, -1.30, .50), .55, 24, 1.15, random.Random(21), lean=.35)
    BR.olive((-.20, -1.40, .60), .50, 22, 1.0, random.Random(33), lean=-.20)
    BR.olive((-1.60, -1.10, .30), .60, 24, 1.2, random.Random(44), lean=.40)
    for k in set(bpy.data.objects.keys()) - before:
        bpy.data.objects[k].visible_camera = False


def mat_navy_lid():
    """крышка: тот же профиль, что и в оригинале; материал — глубокий тёмно-синий лак с металлическим блеском (цвет типографики сайта); на светлой сцене хром отражал бы только стены"""
    m, nt = L.new_mat('LidNavy')
    p = L.principled(nt, Base_Color=(0.024, 0.045, 0.105, 1), Metallic=0.92, Roughness=0.09)
    p.inputs['Coat Weight'].default_value = 0.55
    p.inputs['Coat Roughness'].default_value = 0.04
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


def build_jar():
    label = os.path.join(HERE, 'label.png')
    if not os.path.exists(label):
        import make_label
        make_label.main(label)
    jg = bpy.data.objects.new('JarGroup', None)
    bpy.context.scene.collection.objects.link(jg)
    jg.scale = (.01 * JAR_S,) * 3
    glass = L.build_glass(label)
    cream = L.build_cream()
    cream.parent = glass
    lid = L.build_lid()
    lid.data.materials[0] = mat_navy_lid()
    for o in (glass, lid):
        o.parent = jg
    glass.location.z = 0.003
    lid.location = L.LID_CLOSED
    S['jg'] = jg


def build_lights(M):
    sc = bpy.context.scene
    d = Vector((.40, .86, -.30))
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 13.0
    sun.angle = math.radians(1.1)
    sun.color = (1.0, .92, .78)
    so = bpy.data.objects.new('sun', sun)
    bpy.context.collection.objects.link(so)
    so.rotation_euler = d.normalized().to_track_quat('-Z', 'Y').to_euler()
    so.location = (-6, -6, 6)
    # заполняющий мягкий свет из зала + контровой над подиумом
    for name, loc, rot, en, size in (('fill', (-1.0, -3.4, 1.6), (math.radians(78), 0, math.radians(8)), 55, 3.2), ('top', (.5, -1.2, 1.6), (math.radians(8), 0, 0), 30, 1.6)):
        ar = bpy.data.lights.new(name, 'AREA')
        ar.energy = en
        ar.size = size
        ar.size_y = size * .7
        ar.color = (1.0, .94, .84)
        ao = bpy.data.objects.new(name, ar)
        bpy.context.collection.objects.link(ao)
        ao.location = loc
        ao.rotation_euler = rot
        ao.visible_camera = False
    # тёплое «окно» слева: широкий мягкий свет, из-за которого стена слева светлее, а к нише тон мягко темнеет (как на референсе)
    wn = bpy.data.lights.new('window', 'AREA')
    wn.energy = float(os.environ.get('HALL_WIN', 260))
    wn.size = 2.2
    wn.size_y = 1.6
    wn.color = (1.0, .86, .64)
    wo = bpy.data.objects.new('window', wn)
    bpy.context.collection.objects.link(wo)
    wo.location = (-1.9, -1.7, 1.0)
    wo.rotation_euler = (Vector((.1, 0, .4)) - Vector(wo.location)).to_track_quat('-Z', 'Y').to_euler()
    wo.visible_camera = False
    # мягкие блики на стекле и крышке баночки
    PK.softbox('strip_l', (-.35, -1.2, .40), .10, .40, 24, (1, .95, .88), aim=(.5, -.35, .1))
    PK.softbox('strip_r', (1.25, -.9, .35), .07, .36, 24, (1, .97, .94), feather=.4, aim=(.5, -.35, .1))
    PK.softbox('front', (.45, -1.5, .5), .6, .4, 5.0, (1, .97, .93), aim=(.5, -.35, .1))
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.98, .90, .78, 1)
    bg.inputs['Strength'].default_value = .12
    sc.world = w


def build_camera():
    cd = bpy.data.cameras.new('Cam')
    cd.sensor_width = 36
    cd.dof.use_dof = True
    cam = bpy.data.objects.new('Camera', cd)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    S['cam'] = cam


def build_scene(res, samples, portrait):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    SC.settings(sc, res[0], res[1], samples)
    cy = sc.cycles
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.015
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.max_bounces = 10
    cy.transmission_bounces = 10
    cy.glossy_bounces = 6
    cy.sample_clamp_indirect = 4.0
    sc.view_settings.exposure = float(os.environ.get('HALL_EXP', -.85))
    sc.view_settings.look = os.environ.get('HALL_LOOK', 'AgX - Punchy')
    sc.render.film_transparent = False
    sc.render.use_persistent_data = True
    cy.filter_width = 1.05
    M = mats()
    build_architecture(M, portrait)
    build_decor(M, portrait)
    build_shadow_branches()
    build_jar()
    build_lights(M)
    build_camera()
    return sc


# ---------------------------------------------------------------------------------------------------------------- движение
def sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def lerp(a, b, t):
    return a + (b - a) * t


def frame_state(p, portrait):
    """состояние сцены при прогрессе p: положение и поворот баночки, камера (точка, цель, фокусное, диафрагма), свет в нише"""
    # баночка: парит и поворачивается, затем дугой переходит к подиуму и опускается на него
    q = sm((p - .28) / .62)
    arc = .16 * math.sin(math.pi * q)
    jar = JAR_START.lerp(JAR_FINAL, q) + Vector((0, 0, arc))
    yaw = lerp(-58, -34, sm(p / .28)) if p < .28 else lerp(-34, -6, sm((p - .28) / .62))
    # «следящая» камера рядом с баночкой: на старте крупный план, потом чуть шире
    near = lerp(.54, .70, sm(p / .5))
    az = math.radians(lerp(-16, -9, sm(p / .5)))
    el = math.radians(lerp(6, 9, sm(p / .5)))
    ctr = jar + Vector((0, 0, JAR_CENTER_Z))
    follow_pos = ctr + near * Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    follow_tgt = ctr
    # главный кадр
    if portrait:
        main_pos, main_tgt, main_lens = Vector((.42, -2.10, .50)), TARGET_MAIN_P, 40.0
    else:
        main_pos, main_tgt, main_lens = Vector((.02, -2.55, .36)), TARGET_MAIN_L, 40.0
    w = sm((p - .22) / .76)
    pos = follow_pos.lerp(main_pos, w)
    tgt = follow_tgt.lerp(main_tgt, w)
    lens = math.exp(lerp(math.log(85.0), math.log(main_lens), w))
    fstop = lerp(5.0, 9.0, w)
    glow = sm((p - .40) / .50)
    return dict(jar=jar, yaw=yaw, pos=pos, tgt=tgt, lens=lens, fstop=fstop, glow=glow, center=ctr)


def ease(p, a, b):
    return sm((p - a) / (b - a))


def logo_state(p):
    """сборка каменного знака: гора поднимается из пола, волна выезжает справа и встаёт перед горой (готовый знак — к концу сюжета)"""
    mt = ease(p, .28, .62); bd = ease(p, .46, .74)
    return {'mountain_off': Vector((0, 0, -(LOGO_H * 1.02) * (1 - mt))), 'band_off': Vector((1.1 * (1 - bd), 0, -.15 * (1 - bd)))}


def apply_frame(i, total, portrait):
    p = i / max(1, total - 1)
    st = frame_state(p, portrait)
    cam = S['cam']
    cam.location = st['pos']
    cam.rotation_euler = (st['tgt'] - st['pos']).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = st['lens']
    cam.data.dof.use_dof = True
    cam.data.dof.focus_object = None
    cam.data.dof.focus_distance = max(.05, (st['pos'] - st['center']).length - .0365 * JAR_S)       # резко — этикетка баночки
    cam.data.dof.aperture_fstop = st['fstop']
    S['jg'].location = st['jar']
    S['jg'].rotation_euler = Euler((0, 0, math.radians(st['yaw'])), 'XYZ')
    lg = logo_state(i / max(1, total - 1))
    for key in ('mountain', 'band'):
        S['logo'][key].location = S['logo_home_' + key] + lg[key + '_off']
    mat = S['led'].data.materials[0] if S['led'].data.materials else None
    if mat:
        for n in mat.node_tree.nodes:
            if n.type == 'EMISSION':
                n.inputs['Strength'].default_value = 3.0 + 12.0 * st['glow']


def render_frame(i, total, out, portrait):
    apply_frame(i, total, portrait)
    sc = bpy.context.scene
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def render_matte(i, total, out, portrait, what='bottle'):
    """прозрачный слой «только флакон» в положении кадра i: всё остальное невидимо для камеры, но по-прежнему отражается и отбрасывает свет — флакон выглядит точно как в кадре.
    На сайте он кладётся поверх живой жемчужины (css/home-arch.css → .ar-fg), и жемчужина оказывается позади флакона, как шар в нише на референсе."""
    apply_frame(i, total, portrait)
    sc = bpy.context.scene
    keep = set(S['bottle']) if what == 'bottle' else set([S['jg']] + list(S['jg'].children_recursive))          # bottle — флакон на подиуме, jar — баночка (в финальной позе)
    for ob in bpy.data.objects:
        if ob.type in ('MESH', 'CURVE', 'SURFACE', 'FONT', 'META') and ob not in keep: ob.visible_camera = False
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def render_spin(outdir, n, px):
    """кадры «живого» каменного шара: он делает полный оборот вокруг вертикальной оси (n кадров), свет и камера — как в финальном кадре зала.
    Всё остальное невидимо для камеры, но отражает и затеняет — шар лежит в зале так же, как если бы был запечён. Кадры обрезаны по рамке шара; spin.json — его положение в кадре (в % сцены)."""
    from bpy_extras.object_utils import world_to_camera_view
    apply_frame(83, 84, False)
    sc = bpy.context.scene; cam = S['cam']; sp = S['sphere']
    for ob in bpy.data.objects:
        if ob.type in ('MESH', 'CURVE', 'SURFACE', 'FONT', 'META') and ob is not sp: ob.visible_camera = False
    PK.softbox('spin_key', (-.55, -2.1, 1.25), .8, .8, 45, (1, .94, .85), aim=tuple(sp.location))                    # мягкий ключевой свет слева-сверху: объём шара читается как у остальных тел зала
    bpy.context.view_layer.update()
    c = world_to_camera_view(sc, cam, sp.location)
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    e = world_to_camera_view(sc, cam, sp.location + right * SPHERE_R)
    rx = abs(e.x - c.x)                                                    # радиус шара в долях ширины кадра
    full_w = px / (2 * rx * 1.06)                                          # разрешение «целого» кадра, при котором шар занимает ≈px пикселей
    W = int(round(full_w)); Hh = int(round(full_w * 9 / 16)); sc.render.resolution_x = W; sc.render.resolution_y = Hh
    ry = rx * W / Hh
    m = 1.06
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x = c.x - rx * m; sc.render.border_max_x = c.x + rx * m; sc.render.border_min_y = c.y - ry * m; sc.render.border_max_y = c.y + ry * m
    sc.view_settings.exposure -= float(os.environ.get('SPIN_DARK', .5))                                  # шар чуть темнее окружения (он — каменная «ступень» тона между светлыми стенами и подиумом)
    sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
    os.makedirs(outdir, exist_ok=True)
    for k in range(n):
        sp.rotation_euler = Euler((0, 0, math.radians(360.0 * k / n)), 'XYZ')
        sc.render.filepath = os.path.join(outdir, '%02d.png' % k)
        bpy.ops.render.render(write_still=True); print('шар', k, flush=True)
    meta = {'n': n, 'cx': round(c.x * 100, 3), 'cy': round((1 - c.y) * 100, 3), 'd': round(2 * rx * 100, 3), 'crop': round(2 * rx * m * 100, 3), 'px': int(round(2 * rx * m * W))}
    json.dump(meta, open(os.path.join(outdir, 'spin.json'), 'w')); print(meta)


def parse(argv):
    o = dict(res=(1600, 900), samples=28, total=84, portrait=False, stride=1)
    rest = []
    k = 0
    while k < len(argv):
        a = argv[k]
        if a == '--res':
            w, h = argv[k + 1].lower().split('x')
            o['res'] = (int(w), int(h))
            k += 2
        elif a == '--samples':
            o['samples'] = int(argv[k + 1])
            k += 2
        elif a == '--total':
            o['total'] = int(argv[k + 1])
            k += 2
        elif a == '--stride':                                # каждый N-й кадр (первый проход — «черновик» для просмотра, второй добирает остальные)
            o['stride'] = int(argv[k + 1])
            k += 2
        elif a == '--portrait':
            o['portrait'] = True
            k += 1
        else:
            rest.append(a)
            k += 1
    return rest, o


def main():
    argv = sys.argv[1:]
    if argv and argv[0] == '--':
        argv = argv[1:]
    rest, o = parse(argv)
    cmd = rest[0] if rest else 'info'
    if cmd == 'info':
        print(__doc__)
        return
    if o['portrait'] and o['res'] == (1600, 900):
        o['res'] = (720, 1280)
    if cmd == 'spin':
        globals()['SPHERE_3D'] = True
    build_scene(o['res'], o['samples'], o['portrait'])
    if cmd == 'spin':
        render_spin(os.path.abspath(rest[1]), int(rest[2]) if len(rest) > 2 else 24, int(rest[3]) if len(rest) > 3 else 560)
    elif cmd == 'matte':
        render_matte(int(rest[1]), o['total'], os.path.abspath(rest[2]), o['portrait'], rest[3] if len(rest) > 3 else 'bottle')
    elif cmd == 'still':
        render_frame(int(rest[1]), o['total'], os.path.abspath(rest[2]), o['portrait'])
    elif cmd == 'anim':
        a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
        os.makedirs(outdir, exist_ok=True)
        for i in range(a, b + 1, o['stride']):
            path = os.path.join(outdir, '%03d.png' % i)
            if os.path.exists(path):
                continue
            render_frame(i, o['total'], os.path.abspath(path), o['portrait'])
            print('кадр', i, flush=True)


if __name__ == '__main__':
    main()
