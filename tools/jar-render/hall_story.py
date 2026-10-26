#!/usr/bin/env python3
"""Первый экран главной: зал с арками, нишей и подиумом + баночка «Астрея», которая по ходу анимации уходит на «полку» — опускается на подиум (Blender / Cycles).

Сцена целиком в метрах (баночка — настоящая модель из lumiere_scene.py, увеличена вдвое: она «герой» кадра). Состав зала (по референсу заказчика):
  • стена из светлого камня с большой аркой, внутри — ступенчатая ниша со светящейся линией свода (шар в нише — живой WebGL-слой на сайте, см. js/sphere.js; в кадры он не запекается);
  • огромный каменный знак «Астреи» (гора с острыми кончиками и серп, tools/decor/stone_logo.py) — стоит на месте, ничего не «достраивается»;
  • слева — проём второй арки: за ним комната со стеллажом из светлого камня и продукцией (упаковки tools/showroom-assets/packs.py) и ветка оливы на переднем плане (она же отбрасывает
    на стену и пол пятна света от листьев); справа — рифлёная пилястра, ваза с оливой; перед нишей — низкий круглый подиум из травертина и камни-обломки (tools/decor/rocks.py);
  • пол — светлый полированный камень с отражениями.
Сюжет (прогресс p от 0 до 1 = прокрутка сцены): заставка — баночка крупно по центру зала; камера мягко отъезжает по лучу на шар («наезд с отъездом», K0 = 0,88: шар стоит в кадре на одном месте и
одного размера, зал вокруг почти не «плывёт»); баночка по дуге JAR_WAY опускается и уходит на подиум, этикетка всё время смотрит на камеру; в нише разгорается свет; после HOLD (0,90) — покой.
Три слоя для сайта: кадры зала БЕЗ баночки (--layer bg; баночка невидима камере, но отбрасывает тень и отражается в полу), спрайты баночки на прозрачном фоне (--layer jar, --ss — передискретизация)
и живой шар. Рамки спрайтов и положение шара даёт `track`.

  python3 hall_story.py track out.json [--portrait] [--total 60]                  рамки баночки по кадрам, положение шара
  python3 hall_story.py still <кадр> out.png [--layer all|bg|jar] [--sphere] [--res 1600x900] [--samples 28] [--total 60] [--portrait] [--ss 1.6]
  python3 hall_story.py anim <с> <по> outdir [--layer bg|jar] [--stride N] [--samples N] [--total 60] [--portrait]    (готовые кадры пропускаются)
Кадры затем кодируют encode_arch.py (зал → assets/jar-arch/d, m и лёгкие dm, mm) и encode_jar.py (спрайты → j, jm); apply_arch.py записывает итог в data/redesign.json. Подробности — README.md."""
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
JAR_S = 2.0                                 # увеличение баночки относительно настоящей (крупнее, чем раньше: баночка — герой кадра)
JAR_FINAL = Vector((POD['x'], POD['y'], POD['h']))     # в готовом кадре баночка стоит одна, посередине подиума
JAR_CENTER_Z = .0285 * JAR_S                   # центр баночки над её основанием, м
TARGET_MAIN_L = Vector((.02, 0.0, .33))       # куда смотрит камера в главном кадре (ландшафт)
TARGET_MAIN_P = Vector((.31, 0.0, .52))       # (портрет: кадр сдвинут вправо и вверх, чтобы шар не упирался в левый край, а баночка на подиуме не уходила под панель)

LOGO_H = 1.80                                  # каменный знак-гора выше кадра: вершина уходит за верх, правая ветвь — за правый край, как гигантский знак на фоне прежнего героя
LOGO_CX = .741                                # центр знака по x: жемчужина знака совпадает с центром ниши (шар посередине арки, как на референсе)
LOGO_Y = -.42                                 # передняя грань горы (перед аркой, позади подиума)
LOGO_Z = -.012                               # низ знака: кончик левой «ножки» чуть врезан в пол — касается его остриём, не обрезан
LOGO_DEPTH = .46
LOGO_THICK = 11.0                             # насколько «полнеют» ножки горы и серп (кончики не трогаем — остаются острыми, как в логотипе)
SPHERE_TINT = (.62, .53, .41)                # каменный шар чуть темнее стен — как просил заказчик (на сайте он «живой»: вращается за курсором, см. spin)
SPHERE_3D = False                           # True — запечь каменный шар в кадры (на сайте вместо него живая жемчужина, css/home-arch.css → .ar-pearl)
SPHERE_X, SPHERE_Y, SPHERE_Z = .292, -1.10, .456              # шар парит далеко впереди горы и серпа — не «прилипает» к ним; выше прежнего, чтобы баночка на подиуме не касалась его края
SPHERE_R = .163                              # большой шар: диаметр ≈ 0.28 ширины кадра (ближе к камере — выглядит как прежний, чуть крупнее)

S = {}


def mats():
    M = {}
    M['wall'] = MT.travertine('hw_wall', (1.0, .92, .80), .55, .45, 2.6, honed=True)
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


ROOM_X = -1.83                                 # центр ниши и стеллажа в комнате за левой аркой: в кадр попадает узкая полоса задней стены (примерно от x = −2,16 до −1,5)
SHELF = dict(w=.60, d=.30, boards=(.10, .44, .78, 1.12), t=.03, post=.03)
# что стоит на полках: (вид упаковки из tools/showroom-assets/packs.py, тёмный вариант, смещение по x от центра, поворот°); на полке три предмета
SHELF_ITEMS = [
    [('bottle', False, -.17, 8), ('jar', False, .0, 12), ('pump', True, .17, -6)],
    [('dropper', True, -.18, 0), ('box', False, -.01, 0), ('bottle', True, .16, 4)],
    [('jar', True, -.17, -8), ('pump', False, .0, 0), ('tube', False, .17, 14)],
    [('bottle', False, -.16, -6), ('dropper', False, .02, 0), ('jar', False, .18, 10)],
]
PACK_K = 1.3                                   # упаковки чуть крупнее настоящих: с пяти метров на стеллаже должны читаться формы


def build_shelf(M, yb):
    """стеллаж у задней стены: две стойки, цоколь и четыре полки из светлого камня; на каждой три упаковки (флаконы, баночки, помпы, пипетки, тубы, коробка)"""
    x0, x1 = ROOM_X - SHELF['w'] / 2, ROOM_X + SHELF['w'] / 2
    y1 = yb - .06
    y0 = y1 - SHELF['d']
    pw = SHELF['post']
    top = SHELF['boards'][-1] + SHELF['t']
    SC.box('shelf_plinth', M['wall'], x0, x1, y0, y1, 0, .07, 'p', .004)
    SC.box('shelf_l', M['wall'], x0, x0 + pw, y0, y1, .07, top, 'p', .004)
    SC.box('shelf_r', M['wall'], x1 - pw, x1, y0, y1, .07, top, 'p', .004)
    pm = PK.M()
    for bi, z in enumerate(SHELF['boards']):
        SC.box('shelf_b%d' % bi, M['wall'], x0 + pw, x1 - pw, y0, y1, z, z + SHELF['t'], 'p', .004)
        for ki, (kind, noir, dx, rot) in enumerate(SHELF_ITEMS[bi]):
            objs, _ = PK.build(kind, noir, pm)
            g = bpy.data.objects.new('shelf_%s_%d_%d' % (kind, bi, ki), None)
            bpy.context.collection.objects.link(g)
            for o in objs:
                o.parent = g
            g.location = (ROOM_X + dx, (y0 + y1) / 2 + .03, z + SHELF['t'])
            g.rotation_euler = (0, 0, math.radians(rot))
            g.scale = (PACK_K,) * 3


def build_left_room(M):
    """комната за левой аркой (справа от неё виден кусок): задняя стена с высокой аркой-нишей, в нише — стеллаж из травертина с продукцией, большое оливковое дерево в вазе — на светлом камне видны фактура и тени, пустого белого экрана нет"""
    yb = 2.3
    back = SC.box('back', M['wall'], -4.0, -.1, yb, yb + .25, -.1, 2.6, 'w', 0)
    cuts = [SC.arch_solid('cutN1', M['wall'], ROOM_X, .60, .85, yb - .02, yb + .09, 'w', z0=-.2), SC.arch_solid('cutN2', M['wall'], ROOM_X, .48, .85, yb - .02, yb + .17, 'w', z0=-.2)]
    for c in cuts:
        BR.boolean(back, c)
    BR.apply_mods(back)
    back.data.materials.append(M['inner'])
    for pl in back.data.polygons:
        if pl.center.y > yb + .01 and abs(pl.center.x - ROOM_X) < .65 and pl.center.z < 1.95:
            pl.material_index = 1
    build_shelf(M, yb)
    BR.vase((-1.12, 1.45, 0), .46, .13, M['ceramic'])                                                # ваза и высокая олива у проёма, чтобы дерево было видно сквозь арку
    BR.olive((-1.12, 1.45, .46 + .04), 1.30, 36, 1.75, random.Random(31), lean=-.18)
    BR.olive((-1.06, 1.42, .46 + .04), 1.10, 30, 1.55, random.Random(32), lean=.14)
    rock = RK.ROCKS['boulder-a']
    RK.make_rock('room_rock', rock['seed'] + 7, tuple(v * .5 for v in rock['size']), rock['kind'], rock['cuts'], rock['tint'], (-2.55, 1.3, 0), 20, rough=rock['rough'])


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
    build_left_room(M)
    # пол: полированный камень до самой камеры (и дальше — в комнату за левой аркой)
    SC.box('floor', M['floor'], -4.0, 4.0, -8.0, 3.0, -.3, 0, 'w', 0)
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
    rock('boulder-c', (.84, -.88, 0), 25, 1, .55)
    rock('chunk-b', (-.05, -.74, 0), -40, 2, .60)
    rock('slab-b', (.74, -.06, 0), -6, 3, .80)
    rock('boulder-b', (.86, -.46, 0), 35, 4, .60)
    rock('pebble-a', (.72, -.72, 0), 60, 5, 1.1)
    # ваза и олива справа (как у пилястры на референсе)
    BR.vase((.98, -.14, 0), .30, .085, M['ceramic'])
    BR.olive((.98, -.14, .30 + .026), .90, 26, .78, random.Random(7), lean=-.10)
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
    S['jar_objs'] = [jg] + list(jg.children_recursive)


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
    cd.dof.use_dof = False                                                    # никакого размытия: все текстуры зала резкие, как на референсе
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
    S['vis0'] = {ob.name: ob.visible_camera for ob in bpy.data.objects}                  # исходная видимость для камеры (софтбоксы и заполняющие поверхности камере не видны)
    return sc


# ---------------------------------------------------------------------------------------------------------------- движение
def sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def lerp(a, b, t):
    return a + (b - a) * t


def bez(pts, t):
    """плавная кривая через точки (Catmull–Rom): путь баночки"""
    n = len(pts) - 1
    f = max(0.0, min(1.0, t)) * n
    i = min(int(f), n - 1)
    u = f - i
    p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(n, i + 2)]
    return Vector([.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u ** 3) for k in range(3)])


# «Шар неподвижен в сценарии»: камера отъезжает ПО ЛУЧУ К ШАРУ с одновременным увеличением фокусного (эффект «наезд с отъездом»): шар остаётся на том же месте экрана и того же
# размера (на сайте это живой слой, он не участвует в прокрутке), а зал вокруг него «раскрывается». Баночка — отдельный слой; в начале стоит по центру, в конце — одна посередине подиума.
CAM_END_L = (Vector((.02, -2.55, .36)), TARGET_MAIN_L, 40.0)                         # главный кадр (точка, цель, фокусное)
CAM_END_P = (Vector((.31, -2.10, .40)), TARGET_MAIN_P, 40.0)
K0 = {False: .88, True: .85}                                                         # во сколько раз камера ближе к шару в начале (фокусное — во столько же короче): наезд мягкий, чтобы зал вокруг шара почти не «плыл» — движется только баночка
JAR_START_SCREEN = {False: (.50, .52, .50), True: (.50, .56, .46)}                   # где баночка в заставке: доля x, доля y кадра, расстояние от камеры, м
JAR_WAY = {False: [Vector((.22, -1.30, .075)), Vector((.46, -.80, .075))],      # путь баночки в мире (основание, м): из заставки вниз и вперёд, под шаром (шар парит на высоте .29 над полом) и к подиуму — сквозь шар и камни не проходит (проверка: README.md → «Проверка пути»)
           True: [Vector((.36, -1.22, .10)), Vector((.50, -.78, .09))]}        # у телефона камера смотрит ровно вперёд, путь идёт почти по центру кадраа пути»)

HOLD = .90                                                                           # с этого положения сцена «держит» последний кадр (покой героя)


def cam_state(p, portrait):
    c1, tgt1, f1 = CAM_END_P if portrait else CAM_END_L
    s = Vector((SPHERE_X, SPHERE_Y, SPHERE_Z))
    t = sm(p / HOLD)
    k = lerp(K0[portrait], 1.0, t)
    pos = s + (c1 - s) * k
    return pos, pos + (tgt1 - c1), f1 * k


def view_of(co):
    """положение точки мира в кадре текущей камеры: доли (x слева направо, y снизу вверх)"""
    from bpy_extras.object_utils import world_to_camera_view
    v = world_to_camera_view(bpy.context.scene, S['cam'], Vector(co))
    return v.x, v.y


def sphere_ref(portrait):
    """где шар в главном кадре (без сдвига): к этому месту кадра он приводится при любом положении камеры"""
    key = 'sph1_%d' % portrait
    if key not in S:
        c1, tgt1, f1 = CAM_END_P if portrait else CAM_END_L
        cam = S['cam']
        cam.location = c1
        cam.rotation_euler = (tgt1 - c1).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = f1
        cam.data.shift_x = cam.data.shift_y = 0.0
        bpy.context.view_layer.update()
        S[key] = view_of(Vector((SPHERE_X, SPHERE_Y, SPHERE_Z)))
    return S[key]


def place_camera(pos, tgt, lens, portrait):
    """ставит камеру; сдвиг кадра (shift) подбирается так, чтобы шар стоял в кадре на том же месте, что в главном кадре — при любом положении камеры на луче к шару"""
    tx, ty = sphere_ref(portrait)
    cam = S['cam']
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.shift_x = cam.data.shift_y = 0.0
    bpy.context.view_layer.update()
    sph = Vector((SPHERE_X, SPHERE_Y, SPHERE_Z))
    x, y = view_of(sph)
    cam.data.shift_x, cam.data.shift_y = .05, 0.0
    bpy.context.view_layer.update()
    x1, _ = view_of(sph)
    cam.data.shift_x, cam.data.shift_y = 0.0, .05
    bpy.context.view_layer.update()
    _, y1 = view_of(sph)
    ax, ay = (x1 - x) / .05, (y1 - y) / .05
    cam.data.shift_x, cam.data.shift_y = ((tx - x) / ax if abs(ax) > 1e-9 else 0.0), ((ty - y) / ay if abs(ay) > 1e-9 else 0.0)
    bpy.context.view_layer.update()


def screen_ray_point(pos, tgt, lens, portrait, sx, sy, dist):
    """точка мира на расстоянии dist от камеры, которая попадает в долю экрана (sx, sy сверху вниз); учитывает сдвиг кадра (итерации по проекции)"""
    place_camera(pos, tgt, lens, portrait)
    f = (tgt - pos).normalized()
    r = f.cross(Vector((0, 0, 1))).normalized()
    u = r.cross(f).normalized()
    w, hh = (720, 1280) if portrait else (16, 9)
    half_h = dist * 18.0 / lens * (w / max(w, hh))
    half_v = dist * 18.0 / lens * (hh / max(w, hh))
    p = pos + f * dist
    for _ in range(4):
        x, y = view_of(p)
        p = p + r * ((sx - x) * 2 * half_h) + u * (((1 - sy) - y) * 2 * half_v)
    return p


def jar_path(q, portrait):
    """путь баночки по доле q: из центра заставки к подиуму через точки JAR_WAY (плавная кривая Catmull–Rom)"""
    key = 'jstart_%d' % portrait
    if key not in S:
        pos0, tgt0, f0 = cam_state(0.0, portrait)
        sx, sy, dist = JAR_START_SCREEN[portrait]
        S[key] = screen_ray_point(pos0, tgt0, f0, portrait, sx, sy, dist) - Vector((0, 0, JAR_CENTER_Z))        # точка пути — основание баночки, середина баночки выше на JAR_CENTER_Z
    start = S[key]
    pts = [start] + list(JAR_WAY[bool(portrait)]) + [JAR_FINAL]
    return bez(pts, q)


def frame_state(p, portrait):
    """состояние сцены при прогрессе p: положение и поворот баночки, камера (точка, цель, фокусное), свет в нише"""
    pos, tgt, lens = cam_state(p, portrait)
    q = sm((p - .04) / (HOLD - .04))
    jar = jar_path(q, portrait) + Vector((0, 0, .02 * math.sin(math.pi * q)))
    glow = sm((p - .30) / .55)
    yaw = 10.0 + math.degrees(math.atan2(pos.x - jar.x, jar.y - pos.y)) + 2.5 * math.sin(math.pi * 2 * p)      # этикетка всегда смотрит на камеру («на нас»), плюс лёгкое покачивание
    return dict(jar=jar, yaw=yaw, pos=pos, tgt=tgt, lens=lens, glow=glow)


def apply_frame(i, total, portrait):
    p = i / max(1, total - 1)
    st = frame_state(p, portrait)
    place_camera(st['pos'], st['tgt'], st['lens'], portrait)
    S['jg'].location = st['jar']
    S['jg'].rotation_euler = Euler((0, 0, math.radians(st['yaw'])), 'XYZ')
    mat = S['led'].data.materials[0] if S['led'].data.materials else None
    if mat:
        for n in mat.node_tree.nodes:
            if n.type == 'EMISSION':
                n.inputs['Strength'].default_value = 3.0 + 12.0 * st['glow']
    bpy.context.view_layer.update()


MESHY = ('MESH', 'CURVE', 'SURFACE', 'FONT', 'META')


def set_layer(layer):
    """слои кадра: all — всё; bg — зал без баночки (баночка невидима для камеры, но по-прежнему отбрасывает тень и отражается в полу);
    jar — только баночка на прозрачном фоне (зал невидим для камеры, но затеняет и освещает её) — отдельный слой для сайта"""
    jar = set(S['jar_objs'])
    for ob in bpy.data.objects:
        if ob.type not in MESHY:
            continue
        was = S['vis0'].get(ob.name, True)
        if layer == 'bg':
            ob.visible_camera = was and ob not in jar
        elif layer == 'jar':
            ob.visible_camera = ob in jar
        else:
            ob.visible_camera = was
    sc = bpy.context.scene
    sc.render.film_transparent = layer == 'jar'
    sc.render.image_settings.color_mode = 'RGBA' if layer == 'jar' else 'RGB'


def proj(sc, cam, co):
    from bpy_extras.object_utils import world_to_camera_view
    v = world_to_camera_view(sc, cam, Vector(co))
    return v.x, 1.0 - v.y                                   # доли кадра: слева направо, сверху вниз


def jar_rect(margin=.02):
    """рамка баночки в долях кадра (l, t, w, h) — по восьми углам габаритов каждой части"""
    sc = bpy.context.scene
    cam = S['cam']
    xs, ys = [], []
    for ob in S['jar_objs']:
        if ob.type not in MESHY:
            continue
        for c in ob.bound_box:
            x, y = proj(sc, cam, ob.matrix_world @ Vector(c))
            xs.append(x)
            ys.append(y)
    l, r, t, b = min(xs), max(xs), min(ys), max(ys)
    mw, mh = (r - l) * margin + .002, (b - t) * margin + .002
    l, r, t, b = max(0, l - mw), min(1, r + mw), max(0, t - mh), min(1, b + mh)
    return [round(l, 5), round(t, 5), round(r - l, 5), round(b - t, 5)]


def sphere_track():
    """шар в нише (живой слой на сайте): центр и диаметр в долях кадра для текущего положения камеры"""
    sc = bpy.context.scene
    cam = S['cam']
    c = Vector((SPHERE_X, SPHERE_Y, SPHERE_Z))
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    x0, y0 = proj(sc, cam, c)
    x1, _ = proj(sc, cam, c + right * SPHERE_R)
    return [round(x0, 5), round(y0, 5), round(2 * abs(x1 - x0), 5)]


def info(total, portrait):
    """дорожки для сайта по всем кадрам: рамка баночки и положение шара"""
    out = {'rects': [], 'sphere': []}
    for i in range(total):
        apply_frame(i, total, portrait)
        out['rects'].append(jar_rect())
        out['sphere'].append(sphere_track())
    return out


def render_bg(i, total, out, portrait):
    apply_frame(i, total, portrait)
    set_layer('bg')
    sc = bpy.context.scene
    sc.render.use_border = False
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def render_all(i, total, out, portrait):
    apply_frame(i, total, portrait)
    set_layer('all')
    sc = bpy.context.scene
    sc.render.use_border = False
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def render_jar(i, total, out, portrait, base, ss=2.0):
    """спрайт баночки: только она, на прозрачном фоне, с передискретизацией ss; рисуется только внутри своей рамки (render border + crop) — файл содержит ровно рамку"""
    apply_frame(i, total, portrait)
    set_layer('jar')
    sc = bpy.context.scene
    rect = jar_rect()
    l, t, w, h = rect
    sc.render.resolution_x = int(round(base[0] * ss))
    sc.render.resolution_y = int(round(base[1] * ss))
    sc.render.use_border = True
    sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = l, l + w
    sc.render.border_min_y, sc.render.border_max_y = 1 - (t + h), 1 - t
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    return rect


def parse(argv):
    o = dict(res=(1920, 1080), samples=18, total=60, portrait=False, stride=1, layer='bg', ss=2.0)
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
        elif a == '--stride':
            o['stride'] = int(argv[k + 1])
            k += 2
        elif a == '--layer':
            o['layer'] = argv[k + 1]
            k += 2
        elif a == '--ss':
            o['ss'] = float(argv[k + 1])
            k += 2
        elif a == '--sphere':                                # только для просмотра: нарисовать шар (на сайте он живой слой)
            globals()['SPHERE_3D'] = True
            k += 1
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
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    build_scene(o['res'], o['samples'], o['portrait'])
    if cmd == 'track':                                          # track out.json — рамки баночки и положение шара по кадрам
        json.dump(info(o['total'], o['portrait']), open(rest[1], 'w'))
        print('дорожки записаны', rest[1])
    elif cmd == 'still':                                        # still <кадр> out.png [--layer all|bg|jar]
        i, out = int(rest[1]), os.path.abspath(rest[2])
        if o['layer'] == 'jar':
            print(render_jar(i, o['total'], out, o['portrait'], o['res'], o['ss']))
        elif o['layer'] == 'all':
            render_all(i, o['total'], out, o['portrait'])
        else:
            render_bg(i, o['total'], out, o['portrait'])
    elif cmd == 'anim':                                         # anim <с> <по> outdir [--layer bg|jar]
        a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
        os.makedirs(outdir, exist_ok=True)
        for i in range(a, b + 1, o['stride']):
            path = os.path.join(outdir, '%03d.png' % i)
            if os.path.exists(path):
                continue
            if o['layer'] == 'jar':
                render_jar(i, o['total'], os.path.abspath(path), o['portrait'], o['res'], o['ss'])
            else:
                render_bg(i, o['total'], os.path.abspath(path), o['portrait'])
            print('кадр', i, flush=True)


if __name__ == '__main__':
    main()
