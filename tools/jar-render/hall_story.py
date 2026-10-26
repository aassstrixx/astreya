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
TARGET_MAIN_P = Vector((.292, 0.0, .52))      # (портрет: шар по центру кадра, кадр сдвинут вверх, чтобы баночка на подиуме не уходила под панель)

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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=96, radius=SPHERE_R, location=(SPHERE_X, SPHERE_Y, SPHERE_Z))                # шар на сайте — живой слой (js/sphere.js), в кадры он не запекается; здесь он невидим камере,
    sp = bpy.context.object                                                                                                                       # но отбрасывает тень на пол и стены и отражается в полу, как настоящий (--sphere рисует его для просмотра)
    sp.name = 'stone_sphere'
    bpy.ops.object.shade_smooth()
    sp.data.materials.append(SL.sphere_stone('hall_sphere', SPHERE_TINT, 1.1))
    sp.visible_camera = bool(SPHERE_3D)
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
    S['scal'] = [(sun, 'energy', sun.energy)]                                 # всё, что светлеет по ходу сцены: (источник, свойство, полная яркость) — см. apply_light
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
        S['scal'].append((ar, 'energy', ar.energy))
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
    S['scal'].append((wn, 'energy', wn.energy))
    wo = bpy.data.objects.new('window', wn)
    bpy.context.collection.objects.link(wo)
    wo.location = (-1.9, -1.7, 1.0)
    wo.rotation_euler = (Vector((.1, 0, .4)) - Vector(wo.location)).to_track_quat('-Z', 'Y').to_euler()
    wo.visible_camera = False
    # мягкие блики на стекле и крышке баночки
    for sb in (PK.softbox('strip_l', (-.35, -1.2, .40), .10, .40, 24, (1, .95, .88), aim=(.5, -.35, .1)),
               PK.softbox('strip_r', (1.25, -.9, .35), .07, .36, 24, (1, .97, .94), feather=.4, aim=(.5, -.35, .1)),
               PK.softbox('front', (.45, -1.5, .5), .6, .4, 5.0, (1, .97, .93), aim=(.5, -.35, .1))):
        em = next(n for n in sb.data.materials[0].node_tree.nodes if n.type == 'EMISSION')
        sk = em.inputs['Strength'].links[0].from_node.inputs[1]                  # сила софтбокса — второй вход узла умножения
        S['scal'].append((sk, 'default_value', sk.default_value))
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.98, .90, .78, 1)
    bg.inputs['Strength'].default_value = .12
    S['scal'].append((bg.inputs['Strength'], 'default_value', .12))
    sc.world = w


def mat_ring():
    """тонкая линия-инкрустация: приглушённый графитово-синий камень (цвет типографики сайта, но тише), не блестит"""
    m = bpy.data.materials.new('hw_ring')
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (.30, .34, .44, 1)
    b.inputs['Roughness'].default_value = .55
    return m


def mat_frost():
    """матовое стекло: молочное, с мягким рассеянием; тень от него пропускает свет (иначе панель была бы чёрной тенью на полу)"""
    m = bpy.data.materials.new('hw_frost')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    g = nt.nodes.new('ShaderNodeBsdfPrincipled')
    g.inputs['Base Color'].default_value = (.99, .92, .80, 1)
    g.inputs['Roughness'].default_value = .34
    g.inputs['IOR'].default_value = 1.45
    for k, v in (('Transmission Weight', 1.0), ('Specular IOR Level', .35), ('Emission Strength', float(os.environ.get('HALL_GLOW', .08)))):
        if k in g.inputs:
            g.inputs[k].default_value = v
    if 'Emission Color' in g.inputs:
        g.inputs['Emission Color'].default_value = (1.0, .86, .62, 1)                  # панель подсвечена изнутри тёплым светом: «световая» нота первого кадра
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    lp = nt.nodes.new('ShaderNodeLightPath')
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mx.inputs['Fac'])
    nt.links.new(g.outputs['BSDF'], mx.inputs[1])
    nt.links.new(tr.outputs['BSDF'], mx.inputs[2])
    nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    return m


def ring(name, cx, cy, z, R, w, mat, flat=.45):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=w, major_segments=256, minor_segments=8, location=(cx, cy, z))
    ob = bpy.context.object
    ob.name = name
    ob.scale.z = flat
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(mat)
    return ob


LAB_RINGS_FLOOR = (.30, .40, .54, .72, .98, 1.32)                          # радиусы линий на полу вокруг подиума, м (шаг растёт — как сетка точности)
LAB_RINGS_TOP = (.118, .152)                                              # линии на самом подиуме вокруг основания баночки
LAB_PACKS = [('bottle', False, .205, .24, 12), ('dropper', True, .285, .30, -8), ('jar', False, .365, .22, 20)]      # упаковки на пороге ниши: профессиональная косметика «в нише»
LAB_GLASS = ((.17, .63, .385, .40, .03, .60),)                          # матовая стеклянная панель в глубине ниши (x0, x1, y0, y1, z0, z1): за баночкой и упаковками, перед светящейся линией свода


def build_lab(M):
    """«световая лаборатория»: линии точности на подиуме и полу, матовые стеклянные панели за подиумом (позади баночки — перед ней стекла нет), упаковки в нише, узкий луч света"""
    mr = mat_ring()
    for i, r in enumerate(LAB_RINGS_FLOOR):
        ring('ring_f%d' % i, POD['x'], POD['y'], .0016, r, .0014, mr)
    for i, r in enumerate(LAB_RINGS_TOP):
        ring('ring_t%d' % i, POD['x'], POD['y'], POD['h'] + .0007, r, .0011, mr, flat=.4)
    fm = mat_frost()
    for i, (x0, x1, y0, y1, z0, z1) in enumerate(LAB_GLASS):
        SC.box('glass%d' % i, fm, x0, x1, y0, y1, z0, z1, 'p', .002)
    pm = PK.M()
    for i, (kind, noir, x, y, rot) in enumerate(LAB_PACKS):
        objs, _ = PK.build(kind, noir, pm)
        g = bpy.data.objects.new('lab_%s_%d' % (kind, i), None)
        bpy.context.collection.objects.link(g)
        for o in objs:
            o.parent = g
        g.location = (x, y, .028)
        g.rotation_euler = (0, 0, math.radians(rot))
        g.scale = (1.25,) * 3
    # узкий луч: тёплый прожектор сверху-спереди; в начале он главный источник света на баночке и подиуме, по ходу сцены уступает мягкому свету зала
    bm = bpy.data.lights.new('beam', 'SPOT')
    bm.energy = float(os.environ.get('HALL_BEAM', 700))
    bm.spot_size = math.radians(float(os.environ.get('HALL_BEAM_ANG', 26)))
    bm.spot_blend = .85
    bm.shadow_soft_size = .035
    bm.color = (1.0, .90, .72)
    bo = bpy.data.objects.new('beam', bm)
    bpy.context.collection.objects.link(bo)
    bo.visible_camera = False
    S['beam'] = (bo, bm)


def lit_of(p):
    """насколько зал освещён мягким светом: от полумрака с узким лучом (p = 0) до тёплого дневного света главного экрана (p ≥ 0,7)"""
    return LIT0 + (1 - LIT0) * sm((p - .03) / .70)


def beam_of(p):
    """яркость луча: сильный в начале, к главному кадру остаётся лёгкой подсветкой баночки"""
    return 1.0 - .80 * sm((p - .10) / .62)


def apply_light(p):
    k = lit_of(p)
    for tgt, attr, base in S['scal']:
        setattr(tgt, attr, base * k)
    bo, bm = S['beam']
    bm.energy = float(os.environ.get('HALL_BEAM', 700)) * beam_of(p)
    t = sm(p / .60)                                                          # луч медленно «ведёт» по баночке: блик ползёт по крышке, тень на подиуме поворачивается
    bo.location = (lerp(-.06, .30, t), lerp(-1.02, -1.10, t), lerp(.95, 1.05, t))
    aim = Vector((JAR_FINAL.x, JAR_FINAL.y, JAR_FINAL.z + .05))
    bo.rotation_euler = (aim - Vector(bo.location)).to_track_quat('-Z', 'Y').to_euler()



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
    build_lab(M)
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


# Сценарий: баночка ВСЕГДА стоит на подиуме (JAR_FINAL) — ни полёта, ни парения. Движется только камера: начинается у самой баночки (предметная съёмка, подиум виден под всей её опорой),
# чуть приближается и смещается в сторону, затем плавно отъезжает по дуге влево-назад к широкому кадру первого экрана; пространство (арка, диагональная плита, стеллаж, шар) раскрывается за счёт
# настоящего параллакса. Шар на сайте — живой слой, но привязан к миру: его положение и размер в каждом кадре даёт та же камера (sphere_track), поэтому он не «плывёт» относительно арки.
CAM_END_L = (Vector((.02, -2.55, .36)), TARGET_MAIN_L, 40.0)                          # главный кадр (точка, цель, фокусное)
CAM_END_P = (Vector((.292, -2.31, .40)), TARGET_MAIN_P, 40.0)
# ключевые положения камеры: (доля пути до HOLD, точка, цель, фокусное мм); между ними — плавная кривая (Catmull–Rom), фокусное меняется по логарифму
CAM0_L = tuple(float(v) for v in os.environ.get('HALL_CAM0', '.78,-1.14,.26').split(','))      # старт: правее баночки, чтобы за ней оказались арка и ниша
CAM1_L = tuple(float(v) for v in os.environ.get('HALL_CAM1', '.72,-1.02,.25').split(','))
CAM_KEYS = {
    False: [(0.00, CAM0_L, (.52, -.30, .165), 58.0),                                 # заставка: баночка крупно, на широком подиуме; за ней видна часть арки
            (0.18, CAM1_L, (.52, -.30, .165), 58.0),                                  # медленное приближение и лёгкий сдвиг в сторону
            (0.40, (.34, -1.55, .27), (.50, -.30, .17), 50.0),                        # отъезд: видны края подиума, диагональная плита, ниша
            (0.68, (.17, -2.05, .31), (.30, -.15, .26), 44.0),                        # открывается шар и стеллаж слева
            (1.00, (.02, -2.55, .36), (.02, 0.0, .33), 40.0)],                        # широкий кадр главной
    True: [(0.00, (.50, -1.30, .27), (.56, -.30, .16), 55.0),
           (0.18, (.47, -1.18, .26), (.56, -.30, .16), 55.0),
           (0.40, (.38, -1.65, .31), (.46, -.30, .22), 48.0),
           (0.68, (.32, -2.05, .36), (.35, -.20, .40), 42.0),
           (1.00, (.292, -2.31, .40), (.292, 0.0, .52), 40.0)]}
TURN0 = float(os.environ.get('HALL_TURN', -8.0))                                       # на сколько градусов баночка довёрнута в самом начале (разворачивается к зрителю за первые 16 % пути; сама остаётся на подиуме)
LIT0 = float(os.environ.get('HALL_LIT0', .20))                                         # доля мягкого света зала в первом кадре (остальное — узкий луч)
HOLD = .90                                                                           # с этого положения сцена «держит» последний кадр (покой героя)


def spline(keys, s):
    """плавная кривая по ключам (время, значение-вектор): Catmull–Rom с неравными шагами"""
    ts = [k[0] for k in keys]
    s = max(ts[0], min(ts[-1], s))
    i = max(0, min(len(keys) - 2, max(j for j in range(len(keys) - 1) if ts[j] <= s)))
    u = (s - ts[i]) / (ts[i + 1] - ts[i])
    p0, p1, p2, p3 = keys[max(0, i - 1)][1], keys[i][1], keys[i + 1][1], keys[min(len(keys) - 1, i + 2)][1]
    return Vector([.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u ** 3) for k in range(3)])


def cam_state(p, portrait):
    """точка, цель и фокусное камеры при прогрессе p"""
    ks = CAM_KEYS[bool(portrait)]
    s = sm(p / HOLD) if p < HOLD else 1.0
    pos = spline([(k[0], Vector(k[1])) for k in ks], s)
    tgt = spline([(k[0], Vector(k[2])) for k in ks], s)
    lens = math.exp(spline([(k[0], Vector((math.log(k[3]), 0, 0))) for k in ks], s)[0])
    return pos, tgt, lens


def place_camera(pos, tgt, lens, portrait=False):
    cam = S['cam']
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.shift_x = cam.data.shift_y = 0.0
    bpy.context.view_layer.update()


def frame_state(p, portrait):
    """состояние сцены при прогрессе p: камера и поворот баночки (она стоит на месте), свет в нише"""
    pos, tgt, lens = cam_state(p, portrait)
    glow = sm((p - .30) / .55)
    yaw = 10.0 + math.degrees(math.atan2(pos.x - JAR_FINAL.x, JAR_FINAL.y - pos.y)) + TURN0 * (1 - sm(p / .16))      # этикетка смотрит на камеру («на нас»); в самом начале чуть довёрнута и разворачивается к зрителю
    return dict(jar=JAR_FINAL.copy(), yaw=yaw, pos=pos, tgt=tgt, lens=lens, glow=glow)


def apply_frame(i, total, portrait):
    p = i / max(1, total - 1)
    st = frame_state(p, portrait)
    place_camera(st['pos'], st['tgt'], st['lens'], portrait)
    apply_light(p)
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


SPH_SUB = 4                                    # во сколько раз положение шара посчитано чаще, чем кадры


def sphere_track():
    """шар (живой слой на сайте, привязан к миру): центр и диаметр в долях ширины кадра для текущего положения камеры; [0, 0, 0] — шар за камерой"""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    cam = S['cam']
    c = Vector((SPHERE_X, SPHERE_Y, SPHERE_Z))
    v = world_to_camera_view(sc, cam, c)
    if v.z < .12:
        return [0, 0, 0]
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    x1, _ = proj(sc, cam, c + right * SPHERE_R)
    return [round(v.x, 5), round(1.0 - v.y, 5), round(2 * abs(x1 - v.x), 5)]


def info(total, portrait):
    """дорожки для сайта по всем кадрам: рамка баночки и положение шара"""
    out = {'rects': [], 'sphere': [], 'lit': [], 'sub': SPH_SUB}
    for i in range(total):
        apply_frame(i, total, portrait)
        out['rects'].append(jar_rect())
        out['lit'].append(round(lit_of(i / max(1, total - 1)), 4))
    for j in range((total - 1) * SPH_SUB + 1):                                # шар — чаще, чем кадры: камера проходит рядом с ним, и между кадрами его путь по экрану заметно не прямой
        apply_frame(j / SPH_SUB, total, portrait)
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
