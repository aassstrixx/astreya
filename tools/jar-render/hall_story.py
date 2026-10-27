#!/usr/bin/env python3
"""Первый экран главной: зал с арками, нишей и подиумом + баночка «Астрея», которая раскручивается и по дуге уходит из центра кадра на подиум (Blender / Cycles).

Сцена целиком в метрах (баночка — настоящая модель из lumiere_scene.py, увеличена вдвое: она «герой» кадра). Состав зала (по референсу заказчика):
  • стена из светлого камня с большой аркой, внутри — ступенчатая ниша со светящейся линией свода и матовой стеклянной панелью в глубине; в нише на пороге — профессиональная косметика (упаковки tools/showroom-assets/packs.py);
  • огромный каменный знак «Астреи» (гора с острыми, как в логотипе, кончиками, tools/decor/stone_logo.py) — стоит на месте, ничего не «достраивается»; серпа под шаром нет;
  • каменный шар — статичная 3D-модель, запечённая в кадры: материал горы «точь в точь» (тот же объект материала), парит перед горой ничем не подпёртый; в слое баночки он «вырезает» спрайт там, где стоит перед ней;
  • слева — проём второй арки: за ним комната со стеллажом из светлого камня и продукцией и ветка оливы на переднем плане (она же отбрасывает на стену и пол пятна света от листьев); справа — рифлёная пилястра, ваза с пышным
    деревом (оливой с длинной густой листвой); перед нишей — низкий круглый подиум из травертина и камни-обломки (tools/decor/rocks.py);
  • тонкие концентрические линии — «сетка точности» (графитово-синий камень, инкрустация): на самом подиуме вокруг основания баночки и на полу вокруг подиума; пол — светлый полированный камень.
Сюжет (прогресс p от 0 до 1 = прокрутка сцены): заставка — баночка крупно по центру кадра на ровном бежевом фоне (гладкая стена слева от горы, тени листьев), камера идёт рядом с ней; баночка раскручивается (SPIN = 360°: полный оборот
вокруг оси, в конце снова лицом к зрителю) и по дуге JAR_WAY (огибает шар) уходит на подиум и опускается на него; камера плавно отъезжает от «следящего» кадра к общему плану (CAM_END_*, фокусное 36 мм);
с HOLD (0,93) сцена «держит» последний кадр (покой героя). Свет постоянный, тёплый дневной; в нише по ходу сцены разгорается светящаяся линия свода.
Два слоя для сайта: кадры зала БЕЗ баночки (--layer bg; баночка невидима камере, но отбрасывает тень и отражается в полу) и спрайты баночки на прозрачном фоне (--layer jar, --ss — передискретизация; по умолчанию «авто»:
спрайт ≈ 1200 px по ширине, в общем плане — до ×8). Рамки спрайтов и положение шара в готовом кадре даёт `track`.

  python3 hall_story.py track out.json [--portrait] [--total 60]                  рамки баночки по кадрам, положение шара
  python3 hall_story.py still <кадр> out.png [--layer all|bg|jar] [--sphere] [--res 1600x900] [--samples 28] [--total 60] [--portrait] [--ss 1.6]
  python3 hall_story.py view out.png x,y,z tx,ty,tz линза [--sphere]      произвольный ракурс для осмотра (зал целиком, знак, ветки)
  python3 hall_story.py anim <с> <по> outdir [--layer bg|jar] [--stride N] [--samples N] [--total 60] [--portrait]    (готовые кадры пропускаются)
Кадры затем кодируют encode_arch.py (зал → assets/jar-arch/d, m и лёгкие dm, mm) и encode_jar.py (спрайты → j, jm); apply_arch.py записывает итог в data/redesign.json. Подробности — README.md."""
import importlib.util
import json
import math
import os
import random
import re
import shutil
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
LOGO_Z = -.012 - float(os.environ.get('HALL_LOGO_DROP', 0.0))   # (по умолчанию знак стоит как в логотипе: ножка касается пола острым концом, серп — под шаром)  #                               # низ знака: кончик левой «ножки» чуть врезан в пол — касается его остриём, не обрезан
LOGO_DEPTH = .46
LOGO_THICK = 11.0                             # насколько «полнеют» ножки горы (кончики не трогаем — остаются острыми, как в логотипе)
SPHERE_SCREEN = {False: (.715, float(os.environ.get('HALL_SPH_Y', .335)), float(os.environ.get('HALL_SPH_D', .205))), True: (.50, .475, .44)}     # где шар стоит в готовом кадре (центр x, центр y, диаметр — доли ширины кадра): компьютер и телефон; общий план мельче прежнего, орбиты не доходят до нижней панели
SPHERE_DEPTH = {False: 1.78, True: 1.62}                                # на каком расстоянии от камеры (вдоль оси) шар парит: на 0,15–0,2 м перед горой, ничем не подпёрт

LEAF = dict(leafk=float(os.environ.get('HALL_LEAFK', 2.15)), wk=float(os.environ.get('HALL_LEAFW', 1.40)), dens=float(os.environ.get('HALL_LEAFD', 2.1)))                  # листья оливы в зале: длиннее, шире и гуще (множители к настройкам BR.olive)
LOGO_PARTS = ('mountain',) if os.environ.get('HALL_BAND') == '0' else ('mountain', 'band')       # весь знак: две ножки горы с острыми кончиками и серп (волна) — как в логотипе
LEAF_SHADOW = dict(leafk=1.3, wk=1.1, dens=1.0)             # ветки вне кадра, дающие пятна света на стене: листья чуть длиннее, но не гуще — тени остаются резными силуэтами листьев, а не мутными пятнами

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
    BR.olive((-1.12, 1.45, .46 + .04), 1.30, 36, 1.75, random.Random(31), lean=-.18, **LEAF)
    BR.olive((-1.06, 1.42, .46 + .04), 1.10, 30, 1.55, random.Random(32), lean=.14, **LEAF)
    rock = RK.ROCKS['boulder-a']
    RK.make_rock('room_rock', rock['seed'] + 7, tuple(v * .5 for v in rock['size']), rock['kind'], rock['cuts'], rock['tint'], (-2.55, 1.3, 0), 20, rough=rock['rough'])


def sphere_place(portrait):
    """мировое положение и радиус шара по тому, где он должен стоять в готовом кадре (SPHERE_SCREEN) при камере CAM_END_*: луч из камеры через нужную точку кадра, на глубине SPHERE_DEPTH"""
    pos, tgt, lens = CAM_END_P if portrait else CAM_END_L
    cx, cy, d = SPHERE_SCREEN[bool(portrait)]
    D = SPHERE_DEPTH[bool(portrait)]
    f = (tgt - pos).normalized(); r = f.cross(Vector((0, 0, 1))).normalized(); u = r.cross(f)
    aspect = 9 / 16 if portrait else 16 / 9                                          # ширина / высота кадра
    wm = D * 36.0 / lens * (aspect if portrait else 1.0)                              # ширина кадра в метрах на глубине D (36 мм — по длинной стороне кадра)
    hm = wm / aspect
    c = pos + f * D + r * ((cx - .5) * wm) + u * ((.5 - cy) * hm)
    return c.x, c.y, c.z, d * wm / 2


def sphere_material():
    """камень шара: тот же травертин, что и у горы, но с другой структурой — крупнее и чаще поры, заметнее слоистость, рельеф глубже, чуть теплее и матово-шёлковый: шар отделяется от горы и не сливается с ней"""
    t = float(os.environ.get('HALL_SPH_TONE', .90))
    m = MT.travertine('hall_sphere', (1.0 * t, .90 * t, .76 * t), float(os.environ.get('HALL_SPH_SCALE', 1.35)), float(os.environ.get('HALL_SPH_PITS', 1.3)), float(os.environ.get('HALL_SPH_BANDS', 3.0)), honed=True)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = .52
    bp = next((n for n in m.node_tree.nodes if n.type == 'BUMP'), None)
    if bp is not None:
        bp.inputs['Strength'].default_value = float(os.environ.get('HALL_SPH_BUMP', 1.1)); bp.inputs['Distance'].default_value = .009
    for key, val in (('Sheen Weight', .12), ('Sheen Roughness', .6)):
        if key in b.inputs: b.inputs[key].default_value = val
    return m


def cut_mesh_x(ob, xc):
    """убрать часть сетки правее мировой x = xc (плоскостью; объект стоит в начале координат)"""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(xc - ob.location.x, 0, 0), plane_no=(1, 0, 0), clear_outer=True)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()


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
    if os.environ.get('HALL_LED_CUT', '1') != '0':
        cut_mesh_x(S['led'], INN['cx'] + .03)           # правая половина светящейся арки (правая «ножка» ниши) приходилась ровно под шар и выглядела подставкой: шар парит ничем не подпёртый — правой ножки нет
    # задняя стена за проёмом слева (светлее): виден «следующий зал»
    build_left_room(M)
    # пол: полированный камень до самой камеры (и дальше — в комнату за левой аркой)
    SC.box('floor', M['floor'], -4.0, 4.0, -8.0, 3.0, -.3, 0, 'w', 0)
    # плита-порог под нишей и ступень перед ней
    SC.box('slab', M['trav'], INN['cx'] - INN['rx'] - .06, INN['cx'] + INN['rx'] + .06, -.02, .44, 0, .028, 'w', .004)
    # каменный шар — статичная 3D-модель (запечена в кадры): материал горы «точь в точь» (тот же узел материала, та же структура, тот же цвет); паря́ в воздухе перед горой, ничем не подпёрт
    mats = SL.materials(LOGO_H / SL.YH, .78, .45)
    sx, sy, sz, sr = sphere_place(portrait)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=96, radius=sr, location=(sx, sy, sz))
    sp = bpy.context.object
    sp.name = 'stone_sphere'
    bpy.ops.object.shade_smooth()
    sp.data.materials.append(sphere_material())
    S['sphere'] = sp
    S['sphere_xyzr'] = (sx, sy, sz, sr)
    S['logo'] = SL.build_logo(LOGO_H, (LOGO_CX, LOGO_Y, LOGO_Z), depth=LOGO_DEPTH, mats=mats, parts=LOGO_PARTS, thick=LOGO_THICK, bev_k=.22, sharp=os.environ.get('HALL_SHARP', '1') != '0')
    for key in LOGO_PARTS:
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
    dxp = .11 if portrait else 0.0                                                                     # на телефоне вазу с деревом сдвигаем вправо: в узкий кадр заходит только край кроны
    BR.vase((.98 + dxp, -.14, 0), .42, .095, M['ceramic'])                                               # ваза повыше: ствол не торчит палкой из-под серпа, крона растёт прямо из горлышка
    build_tree(random.Random(77), (.98 + dxp, -.14, .36), .39, .98, lk=1.3, per=84, nb=32)                                     # на вазе справа — пышное дерево (олива с густой длинной листвой): низкий ствол и широкая густая крона, верх уходит за край кадра
    # олива на переднем плане слева — сама в кадре и отбрасывает пятна света от листьев на стену и пол
    BR.vase((-.92, -1.10, 0), .26, .10, M['ceramic'])
    BR.olive((-.92, -1.10, .26 + .03), .52, 28, 1.12, random.Random(3), lean=.31, **LEAF)                  # ветка выглядывает у левого края кадра (как на референсе), а не прячется за ним
    BR.olive((-.86, -1.08, .26 + .03), .44, 22, .98, random.Random(12), lean=.23, **LEAF)
    BR.vase((-1.42, 1.22, 0), .26, .085, M['ceramic'])                                                    # пышное дерево в комнате за левой аркой: густая крона заполняет верх проёма за пальмовыми ветками, полки с продукцией остаются видны
    build_tree(random.Random(91), (-1.42, 1.22, .225), .425, .90, lk=1.25, per=84, nb=30)



class Solids:
    """твёрдые тела сцены (знак, стены, шар, пилястра, плита): по ним листья деревьев проверяются на прохождение сквозь камень — лист, который протыкает поверхность, не создаётся, ветка упирается и не заходит в камень"""
    def __init__(self):
        from mathutils.bvhtree import BVHTree
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        names = ['wall', 'back', 'stone_sphere', 'slab', 'podium'] + ['reed%d' % i for i in range(9)]
        obs = [bpy.data.objects.get(n) for n in names] + [S.get('logo', {}).get(k) for k in ('mountain', 'band')]
        self.items = []
        for ob in obs:
            if ob is None or ob.type != 'MESH':
                continue
            self.items.append((ob.matrix_world.inverted(), BVHTree.FromObject(ob, dg)))

    def hit(self, p0, p1):
        """отрезок p0→p1 пересекает поверхность какого-либо тела; возвращает расстояние до первого пересечения (или None)"""
        best = None
        d = p1 - p0; ln = d.length
        if ln < 1e-6:
            return None
        for inv, t in self.items:
            o = inv @ p0; dl = (inv.to_3x3() @ d).normalized()
            loc, nrm, idx, dist = t.ray_cast(o, dl, ln)
            if loc is not None and (best is None or dist < best):
                best = dist
        return best

    def inside(self, p):
        """точка внутри какого-либо тела (чётное/нечётное число пересечений луча вверх)"""
        for inv, t in self.items:
            o = inv @ p; n = 0
            for _ in range(16):
                loc, nrm, idx, dist = t.ray_cast(o, Vector((0, 0, 1)))
                if loc is None:
                    break
                n += 1; o = loc + Vector((0, 0, 1e-4))
            if n % 2 == 1:
                return True
        return False


def build_tree(rnd, loc, H, R, lk=1.0, per=56, nb=22):
    """пышное дерево в вазе справа: изогнутый ствол и ярус ветвей веером (длинные дуги), на каждой — густые длинные листья двух оттенков; веточки-ответвления добавляют объём.
    Листья расходятся в стороны от ветки (в плоскости, перпендикулярной ей), поэтому крона читается объёмной с любой стороны. Параметры — TREE"""
    bx, by, bz = loc
    ma = bpy.data.materials.new('tree_leafA'); ma.use_nodes = True; b = ma.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (.36, .42, .25, 1); b.inputs['Roughness'].default_value = .5
    mb = bpy.data.materials.new('tree_leafB'); mb.use_nodes = True; b = mb.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (.50, .55, .36, 1); b.inputs['Roughness'].default_value = .5
    ms = bpy.data.materials.new('tree_stem'); ms.use_nodes = True; ms.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.30, .25, .16, 1)
    leaves = []
    for m in (ma, mb):
        me = SC.leaf_mesh(L=.082 * 1.9 * lk, Wd=.024 * 1.45 * (1 + .6 * (lk - 1))); me.materials.append(m); leaves.append(me)
    up = Vector((0, 0, 1))
    solids = Solids()
    Lleaf = max(v.co.y for v in leaves[0].vertices); Wleaf = max(v.co.x for v in leaves[0].vertices)
    mods = S.setdefault('tree_mods', [])

    def blocked(ob):
        """лист (объект) протыкает камень: ось, поперечник или кончик/середина внутри тела"""
        R3 = ob.rotation_euler.to_matrix(); sc = ob.scale.x; ax = R3 @ Vector((0, 1, 0)); sd = R3 @ Vector((1, 0, 0))
        base = ob.location.copy(); tip = base + ax * Lleaf * sc; mid = base + ax * Lleaf * sc * .55; wd = sd * Wleaf * sc
        if solids.hit(base, tip) is not None or solids.hit(mid - wd, mid + wd) is not None:
            return True
        return solids.inside(tip) or solids.inside(mid) or solids.inside(base)

    def limb(pts, count, k, bevel):
        cu = bpy.data.curves.new('tl', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (*p, 1)
        cu.bevel_depth = bevel; cu.materials.append(ms)
        bpy.context.collection.objects.link(bpy.data.objects.new('tl', cu))
        def at(t):
            f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i + 1], f - i)
        for i in range(1, count + 1):
            t = i / (count + 1) * .93 + .07; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
            u = d.cross(up)
            if u.length < .2:
                u = d.cross(Vector((1, 0, 0)))
            u.normalize(); v = d.cross(u); phi = rnd.uniform(0, 6.283)
            for side in (0, 1):
                a = phi + side * 3.1416 + rnd.uniform(-.5, .5)
                dv = d * .55 + (u * math.cos(a) + v * math.sin(a)) * 1.0 + Vector((0, 0, rnd.uniform(-.1, .3)))
                ob = bpy.data.objects.new('lf', rnd.choice(leaves)); bpy.context.collection.objects.link(ob)
                ob.scale = ((1.1 - .4 * t) * (.8 + rnd.random() * .4) * k,) * 3
                ob.rotation_euler = dv.normalized().to_track_quat('Y', 'Z').to_euler(); ob.location = pos
                if blocked(ob):                                                                 # лист задел бы камень — не создаём (случайные числа уже израсходованы: остальная крона не меняется)
                    mods.append(tuple(pos)); bpy.data.objects.remove(ob)
        ob = bpy.data.objects.new('lf', leaves[0]); bpy.context.collection.objects.link(ob)                         # верхушечный листок
        ob.scale = (k,) * 3; ob.rotation_euler = (at(1) - at(.9)).normalized().to_track_quat('Y', 'Z').to_euler(); ob.location = at(1)
        if blocked(ob):                                                                       # верхушечный листок задел бы камень — убираем
            mods.append(tuple(ob.location)); bpy.data.objects.remove(ob)
        return at

    base = Vector((bx, by, bz))
    trunk = limb([base, base + Vector((-.02, 0, H * .35)), base + Vector((.02, 0, H * .7)), base + Vector((-.04, 0, H))], 4, .9, .026)
    mods.extend(tuple(base + Vector((0, 0, H * f))) for f in (-.2, 0, .3, .6, 1.0))                   # ствол и горлышко вазы: положение ствола в вазе поменялось
    for j in range(nb):                                                                  # ярус ветвей веером вокруг верхней части ствола
        az = 6.283 * (j + rnd.random() * .7) / nb; el = rnd.uniform(.5, 1.3)
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        P0 = trunk(rnd.uniform(.45, 1.0)); Lb = R * rnd.uniform(.8, 1.2)
        hd = solids.hit(P0, P0 + d * Lb)
        if hd is not None:                                                                # ветка упирается в камень — укорачиваем, чтобы не заходила внутрь
            mods.extend(tuple(P0 + d * Lb * f) for f in (.25, .5, .75, 1.0)); Lb = max(.10, hd - .05)
        pts = [P0, P0 + d * Lb * .34 + Vector((0, 0, .04)), P0 + d * Lb * .68 + Vector((0, 0, .07 * Lb)), P0 + d * Lb + Vector((0, 0, -.1 * Lb * (1.1 - math.sin(el))))]
        at = limb(pts, per, 1.0, .007)
        for t in (.30, .46, .62, .78):                                                        # веточки-ответвления
            P = at(t); az2 = az + rnd.choice((-1, 1)) * rnd.uniform(.5, .9); d2 = Vector((math.cos(az2) * math.cos(el), math.sin(az2) * math.cos(el), math.sin(el) * .8 + .15)).normalized()
            L2 = Lb * rnd.uniform(.3, .45)
            limb([P, P + d2 * L2 * .5 + Vector((0, 0, .03)), P + d2 * L2 + Vector((0, 0, -.02))], max(20, per // 3), .92, .0045)



def build_shadow_branches():
    """ветки оливы вне кадра (камере не видны): отбрасывают пятна света от листьев на стену слева и пол — как на референсе"""
    before = set(bpy.data.objects.keys())
    BR.olive((-1.05, -1.30, .50), .55, 24, 1.15, random.Random(21), lean=.35, **LEAF_SHADOW)
    BR.olive((-.20, -1.40, .60), .50, 22, 1.0, random.Random(33), lean=-.20, **LEAF_SHADOW)
    BR.olive((-1.60, -1.10, .30), .60, 24, 1.2, random.Random(44), lean=.40, **LEAF_SHADOW)
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
    S['label_link'] = None
    for n in glass.data.materials[0].node_tree.nodes:                                  # смешивание «стекло / чернила» по маске этикетки — им управляет set_jar_label
        if n.type == 'MIX_SHADER':
            S['label_mix'] = n
            S['label_link'] = [(l.from_socket, l.to_socket) for l in n.inputs['Fac'].links][0]


def set_jar_label(on):
    """этикетка: вкл — как в настоящей баночке (чернила по маске label.png); выкл — чистое матовое стекло (спрайт без надписей: этикетку на сайте рисует и вращает WebGL)"""
    n = S.get('label_mix')
    if n is None or S.get('label_link') is None:
        return
    nt = n.id_data
    for l in list(n.inputs['Fac'].links):
        nt.links.remove(l)
    if on:
        nt.links.new(S['label_link'][0], n.inputs['Fac'])
    else:
        n.inputs['Fac'].default_value = 0.0


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
LAB_GLASS = () if os.environ.get('HALL_GLASS', '0') != '1' else ((.27, .53, .385, .40, .03, .50),)                          # матовая стеклянная панель в глубине ниши (x0, x1, y0, y1, z0, z1): за баночкой и упаковками, между боковыми светящимися линиями свода (светящиеся линии стекло не закрывает — иначе оно размывало их в белую «дымку»)


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
    cy.adaptive_threshold = float(os.environ.get('HALL_ADAPT', 0.015))
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.max_bounces = int(os.environ.get('HALL_BOUNCE', 10))
    cy.transmission_bounces = int(os.environ.get('HALL_TBOUNCE', 10))
    cy.glossy_bounces = int(os.environ.get('HALL_GBOUNCE', 6))
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
    for ob in list(bpy.data.objects):                                                  # «лишние» полоски-этикетки упаковок (label, labelh, labelm без родителя) лежали в начале координат — в левом углу ниши они выглядели колонной с чёрным швом
        if ob.parent is None and re.match(r'label[hm]?(\.\d+)?$', ob.name) and os.environ.get('HALL_KEEP_STRAYS') != '1':
            bpy.data.objects.remove(ob, do_unlink=True)
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


# Сценарий («как раньше», доработанный): заставка — баночка крупно в центре кадра на ровном бежевом фоне (стена-плита знака), внизу «Листайте»; по прокрутке она раскручивается вокруг своей оси
# (полный оборот, этикетка снова смотрит на камеру) и дугой уходит к подиуму, а камера, которая шла рядом с ней, плавно отъезжает к общему плану; шар — статичная 3D-модель из того же камня, что
# и гора (запечён в кадры, ничем не управляется). После HOLD сцена «держит» последний кадр (покой героя).
JAR_START = Vector((float(os.environ.get('HALL_JX', -.08)), -.95, .46))          # где баночка «парит» в начале: на уровне глаз перед ровной гладкой стеной слева от горы (за ней — только бежевая штукатурка с лёгкими тенями листьев)
JAR_WAY = [JAR_START, Vector((.12, -1.12, .40)), Vector((.46, -1.06, .27)), Vector((.68, -.76, .18)), Vector((.62, -.46, .13)), JAR_FINAL]        # путь баночки: огибает шар спереди и справа-снизу (в него не входит), к подиуму подходит сбоку и опускается на него
CAM_END_L = (Vector((.02, -2.55, .36)), TARGET_MAIN_L, float(os.environ.get('HALL_LENS_L', 36.0)))     # общий план: фокусное 36 вместо 40 — кадр чуть шире, шар и орбиты мельче и не доходят до нижней панели
CAM_END_P = (Vector((.292, -2.31, .40)), TARGET_MAIN_P, float(os.environ.get('HALL_LENS_P', 36.0)))
LIT0 = 1.0                                                                           # свет зала постоянный: яркий, тёплый (полумрака и луча нет)
SHADOW_FROM = int(os.environ.get('HALL_SHADOW_FROM', 49))                            # с этого кадра баночка уже стоит на подиуме: её тень запечена в кадры, а до него — живая тень на сайте (js/jar-gl.js)
HOLD = float(os.environ.get('HALL_HOLD', .93))                                       # с этого положения сцена «держит» последний кадр (покой героя)
SPIN = float(os.environ.get('HALL_SPIN', 360.0))                                     # на сколько градусов баночка раскручивается по пути (полный оборот — и этикетка снова смотрит на нас)
# Вертикальный кадр (телефон) узкий: при том же фокусном баночка занимает вдвое больше его ширины, чем на компьютере, и на середине пути уходит за правый край. Поэтому на телефоне камера на старте дальше
# (NEAR_P — во сколько раз), а затем плавно доворачивается вокруг вертикали, так что баночка идёт по кадру внутри границ FRAME_LO…FRAME_HI (доли ширины кадра) и заканчивает путь на своём месте у подиума.
NEAR_P = float(os.environ.get('HALL_NEAR_P', 1.6))
NEAR_P_END = float(os.environ.get('HALL_NEAR_P_END', .80))                          # до какой доли пути «следящая» дистанция остаётся увеличенной
FRAME_LO, FRAME_HI = float(os.environ.get('HALL_FRAME_LO', .17)), float(os.environ.get('HALL_FRAME_HI', .83))
JAR_R = .0365 * JAR_S * 1.12                                                            # радиус баночки с запасом на крышку, м


def spline(keys, s):
    """плавная кривая по ключам (время, значение-вектор): Catmull–Rom с неравными шагами"""
    ts = [k[0] for k in keys]
    s = max(ts[0], min(ts[-1], s))
    i = max(0, min(len(keys) - 2, max(j for j in range(len(keys) - 1) if ts[j] <= s)))
    u = (s - ts[i]) / (ts[i + 1] - ts[i])
    p0, p1, p2, p3 = keys[max(0, i - 1)][1], keys[i][1], keys[i + 1][1], keys[min(len(keys) - 1, i + 2)][1]
    return Vector([.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u ** 3) for k in range(3)])


def place_camera(pos, tgt, lens, portrait=False):
    cam = S['cam']
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.shift_x = cam.data.shift_y = 0.0
    bpy.context.view_layer.update()


def jar_pose(p):
    """положение баночки: стоит в воздухе перед плитой, затем дугой (с лёгким подъёмом в начале) уходит на подиум и опускается на него"""
    q = sm((min(p, HOLD) / HOLD - .20) / .68)
    return bez(JAR_WAY, q), q


def jar_x(pos, tgt, lens, ctr):
    """где баночка стоит в вертикальном кадре по ширине (центр, половина ширины — доли кадра) при заданной камере"""
    sc = bpy.context.scene
    place_camera(pos, tgt, lens, True)
    cam = S['cam']
    x, _ = proj(sc, cam, ctr)
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    x1, _ = proj(sc, cam, ctr + right * JAR_R)
    return x, abs(x1 - x)


def soft_clamp(x, lo, hi, k=36.0):
    """сглаженное ограничение x в [lo, hi]: без излома, чтобы камера не дёргалась в момент, когда доворот включается"""
    if lo >= hi:
        return .5 * (lo + hi)
    a = -math.log(math.exp(-k * x) + math.exp(-k * hi)) / k                              # мягкий min(x, hi)
    return math.log(math.exp(k * a) + math.exp(k * lo)) / k                              # мягкий max(·, lo)


def keep_in_frame(pos, tgt, lens, ctr):
    """телефон: доворот камеры вокруг вертикали (положение камеры не меняется), чтобы баночка целиком оставалась в границах FRAME_LO…FRAME_HI; в конце пути доворот равен нулю"""
    x0, hw = jar_x(pos, tgt, lens, ctr)
    xt = soft_clamp(x0, FRAME_LO + hw, FRAME_HI - hw)
    if abs(x0 - xt) < 1e-5:
        return tgt
    d = tgt - pos
    sw = 36.0 * 9 / 16                                                                   # ширина матрицы вертикального кадра, мм
    rot = lambda a: pos + Euler((0, 0, a), 'XYZ').to_matrix() @ d
    a0, x_a = 0.0, x0
    a1 = -(x0 - xt) * sw / lens
    for _ in range(5):
        x_b, _ = jar_x(pos, rot(a1), lens, ctr)
        err = x_b - xt
        if abs(err) < 2e-5:
            break
        if abs(x_b - x_a) < 1e-9:
            break
        a2 = a1 - err * (a1 - a0) / (x_b - x_a)
        a0, x_a, a1 = a1, x_b, a2
    return rot(a1)


def frame_state(p, portrait):
    """состояние сцены при прогрессе p: положение и поворот баночки, камера, свет в нише"""
    pp = min(p, HOLD) / HOLD                                                         # с HOLD всё замирает
    jar, q = jar_pose(p)
    ctr = jar + Vector((0, 0, JAR_CENTER_Z))
    # «следящая» камера рядом с баночкой: на старте крупный план (фокусное 85), потом всё дальше
    near = lerp(float(os.environ.get('HALL_NEAR', .80)), 1.0, sm(pp / .5))
    if portrait:
        near *= lerp(NEAR_P, 1.0, sm(pp / NEAR_P_END))
    az = math.radians(lerp(float(os.environ.get('HALL_AZ', 11)), -6, sm(pp / .55)))                  # в начале камера чуть правее баночки и смотрит влево — на ровную стену; потом уходит влево
    el = math.radians(lerp(2, 8, sm(pp / .5)))
    follow_pos = ctr + near * Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    follow_tgt = ctr
    main_pos, main_tgt, main_lens = CAM_END_P if portrait else CAM_END_L
    w = sm((pp - .20) / .78)
    pos = follow_pos.lerp(main_pos, w)
    tgt = follow_tgt.lerp(main_tgt, w)
    lens = math.exp(lerp(math.log(85.0), math.log(main_lens), w))
    if portrait:
        tgt = keep_in_frame(pos, tgt, lens, ctr)
    face = float(os.environ.get('HALL_FACE', -3.5)) + math.degrees(math.atan2(pos.x - jar.x, jar.y - pos.y))              # этикетка смотрит на камеру («на нас»)
    yaw = face + SPIN * sm((pp - .06) / .56)                                          # раскручивается: за первые две трети пути — полный оборот, и снова лицом к нам
    glow = sm((pp - .30) / .55)
    return dict(jar=jar, yaw=yaw, pos=pos, tgt=tgt, lens=lens, glow=glow)


def apply_frame(i, total, portrait):
    p = i / max(1, total - 1)
    S['frame_i'] = i
    st = frame_state(p, portrait)
    place_camera(st['pos'], st['tgt'], st['lens'], portrait)
    S['jg'].location = st['jar']
    S['jg'].rotation_euler = Euler((0, 0, math.radians(st['yaw'])), 'XYZ')
    mat = S['led'].data.materials[0] if S['led'].data.materials else None
    if mat:
        for n in mat.node_tree.nodes:
            if n.type == 'EMISSION':
                n.inputs['Strength'].default_value = 2.0 + 7.0 * st['glow']
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
            if ob in jar:                                                            # тень баночки: пока она летит, в кадры не запекается — сайт рисует её сам по текущему положению (плавно); когда баночка встала на подиум, тень запечена в кадр
                ob.visible_shadow = S.get('frame_i', 0) >= SHADOW_FROM
        elif layer == 'jar':
            ob.visible_camera = ob in jar
        else:
            ob.visible_camera = was
    set_jar_label(layer != 'jar' or os.environ.get('HALL_JAR_LABEL', '0') == '1')    # спрайт баночки — без этикетки (см. set_jar_label)
    sp = S.get('sphere')
    if sp is not None:                                                               # шар: в слое баночки — вырез (holdout): где он стоит перед баночкой, спрайт не рисуется, и она не «просвечивает» сквозь шар
        sp.visible_camera = True
        sp.is_holdout = layer == 'jar'
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


def sphere_final():
    """шар в готовом кадре (орбиты логотипов на сайте стоят вокруг него): центр и диаметр в долях ширины кадра"""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    cam = S['cam']
    sx, sy, sz, sr = S['sphere_xyzr']
    c = Vector((sx, sy, sz))
    v = world_to_camera_view(sc, cam, c)
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    x1, _ = proj(sc, cam, c + right * sr)
    return [round(v.x, 5), round(1.0 - v.y, 5), round(2 * abs(x1 - v.x), 5)]


def info(total, portrait):
    """дорожки для сайта: рамка баночки по кадрам и положение шара в готовом кадре"""
    out = {'rects': [], 'sphere': None}
    for i in range(total):
        apply_frame(i, total, portrait)
        out['rects'].append(jar_rect())
    out['sphere'] = sphere_final()
    return out


DEPTH_DISP = (0.08, 4.0)                                    # диапазон обратной глубины 1/z, 1/м (от 12,5 м до 25 см): кодируется в 16 бит (R — старший байт, G — младший)


def setup_depth():
    """режим карты глубины: каждый материал заменяется излучением, цвет которого — 16-битная обратная глубина по оси камеры (View Z Depth); один проход без шумоподавления,
    без сглаживания краёв (иначе на кромках предметов получаются «средние» глубины), без тонового преобразования — значения пишутся в PNG как есть"""
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    mat = bpy.data.materials.new('DepthOut')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)

    def mth(op, a=None, b=None, clamp=False):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        for k, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[k].default_value = v
            else:
                nt.links.new(v, n.inputs[k])
        return n.outputs['Value']
    cd = nt.nodes.new('ShaderNodeCameraData')
    disp = mth('DIVIDE', 1.0, mth('MAXIMUM', cd.outputs['View Z Depth'], 1e-3))
    dn = mth('DIVIDE', mth('SUBTRACT', disp, DEPTH_DISP[0]), DEPTH_DISP[1] - DEPTH_DISP[0], True)
    v = mth('MULTIPLY', dn, 65535.0)
    hi = mth('FLOOR', mth('DIVIDE', v, 256.0))
    lo = mth('SUBTRACT', v, mth('MULTIPLY', hi, 256.0))
    cc = nt.nodes.new('ShaderNodeCombineColor')
    nt.links.new(mth('DIVIDE', hi, 255.0), cc.inputs['Red'])
    nt.links.new(mth('DIVIDE', lo, 255.0), cc.inputs['Green'])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(cc.outputs['Color'], em.inputs['Color'])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    vl.material_override = mat
    for n in sc.world.node_tree.nodes:                                               # небо чёрное: «бесконечность» = обратная глубина 0
        if n.type == 'BACKGROUND':
            n.inputs['Strength'].default_value = 0.0
    sc.view_settings.view_transform = 'Raw'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.render.dither_intensity = 0.0
    sc.cycles.samples = 1
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.use_denoising = False
    sc.cycles.filter_width = 0.01
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.color_depth = '8'


def render_depth(i, total, out, portrait):
    apply_frame(i, total, portrait)
    set_layer('bg')
    sc = bpy.context.scene
    sc.render.use_border = False
    sc.render.film_transparent = False
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def cam_track(n, portrait):
    """плотная дорожка камеры и баночки по сценарию (n отсчётов, p = j / (n − 1)): по ней сайт строит вид из любой точки прокрутки"""
    out = {'p': [], 'pos': [], 'tgt': [], 'lens': [], 'jar': [], 'yaw': [], 'glow': []}
    for j in range(n):
        p = j / (n - 1)
        st = frame_state(p, portrait)
        out['p'].append(round(p, 6))
        out['pos'].append([round(v, 5) for v in st['pos']])
        out['tgt'].append([round(v, 5) for v in st['tgt']])
        out['lens'].append(round(st['lens'], 4))
        out['jar'].append([round(v, 5) for v in st['jar']])
        out['yaw'].append(round(st['yaw'], 4))
        out['glow'].append(round(st['glow'], 5))
    out['jarScale'] = .01 * JAR_S                                                    # метров в одном «сантиметре» модели баночки
    out['jarCenterZ'] = JAR_CENTER_Z
    out['dispRange'] = list(DEPTH_DISP)
    return out


def render_bg(i, total, out, portrait):
    apply_frame(i, total, portrait)
    set_layer('bg')
    sc = bpy.context.scene
    sc.render.use_border = False
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def render_bg_crop(i, total, out, portrait, box):
    """перерисовка только участка кадра box = (x0, x1, y0, y1) в долях кадра (y сверху вниз): результат — картинка размером с участок; для правки готовых кадров без полной перерисовки"""
    apply_frame(i, total, portrait)
    set_layer('bg')
    sc = bpy.context.scene
    sc.render.use_border = True
    sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = box[0], box[1]
    sc.render.border_min_y, sc.render.border_max_y = 1 - box[3], 1 - box[2]
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
    if not ss:                                                                       # auto: спрайт ≈ 1200 px по ширине при любом размере баночки в кадре (в готовом кадре она мелкая — передискретизация там до ×8), чётко и на экранах с удвоенной плотностью
        ss = max(2.0, min(8.0, 1200.0 / max(1.0, w * base[0])))
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
    o = dict(res=(1920, 1080), samples=18, total=60, portrait=False, stride=1, layer='bg', ss=0.0)
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
        elif a == '--boxes':                                 # patch: файл с рамками участков по кадрам
            o['boxes'] = argv[k + 1]
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
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    build_scene(o['res'], o['samples'], o['portrait'])
    if cmd == 'track':                                          # track out.json — рамки баночки и положение шара по кадрам
        json.dump(info(o['total'], o['portrait']), open(rest[1], 'w'))
        print('дорожки записаны', rest[1])
    elif cmd == 'camtrack':                                     # camtrack out.json [--n 591] — плотная дорожка камеры и баночки (для сайта)
        n = int(os.environ.get('HALL_CAMN', 591))
        json.dump(cam_track(n, o['portrait']), open(rest[1], 'w'))
        print('дорожка камеры записана', rest[1], n)
    elif cmd == 'still':                                        # still <кадр> out.png [--layer all|bg|jar|z]
        i, out = int(rest[1]), os.path.abspath(rest[2])
        if o['layer'] == 'jar':
            print(render_jar(i, o['total'], out, o['portrait'], o['res'], o['ss']))
        elif o['layer'] == 'z':
            setup_depth()
            render_depth(i, o['total'], out, o['portrait'])
        elif o['layer'] == 'all':
            render_all(i, o['total'], out, o['portrait'])
        else:
            render_bg(i, o['total'], out, o['portrait'])
    elif cmd == 'view':                                         # view out.png x,y,z tx,ty,tz линза — произвольный ракурс для осмотра зала (свет — как в кадре HALL_VF, по умолчанию 59)
        out = os.path.abspath(rest[1])
        apply_frame(int(os.environ.get('HALL_VF', 59)), o['total'], o['portrait'])
        place_camera(Vector([float(v) for v in rest[2].split(',')]), Vector([float(v) for v in rest[3].split(',')]), float(rest[4]))
        set_layer(o['layer'] if o['layer'] != 'bg' else 'all')
        sc = bpy.context.scene
        sc.render.use_border = False
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
    elif cmd == 'patch':                                        # patch <с> <по> outdir --boxes boxes.json — перерисовать только участки кадров (рамки: кадр → x0, x1, y0, y1 в долях кадра)
        a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
        os.makedirs(outdir, exist_ok=True)
        boxes = json.load(open(o['boxes']))
        for i in range(a, b + 1):
            x0, x1, y0, y1 = boxes[str(i)]
            if x1 <= 0 or x0 >= 1 or y1 <= 0 or y0 >= 1:
                continue
            path = os.path.join(outdir, '%03d.png' % i)
            if os.path.exists(path):
                continue
            h = y1 - y0
            box = (max(0.0, x0 - .04), min(1.0, x1 + .04), max(0.0, y0 - .04), min(1.0, y1 + h * 1.6 + .04))
            render_bg_crop(i, o['total'], os.path.abspath(path), o['portrait'], box)
            json.dump({'box': box, 'res': list(o['res'])}, open(path.replace('.png', '.json'), 'w'))
            print('участок кадра', i, flush=True)
    elif cmd == 'anim':                                         # anim <с> <по> outdir [--layer bg|jar]
        a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
        os.makedirs(outdir, exist_ok=True)
        hold_i = int(math.ceil(HOLD * (o['total'] - 1) - 1e-9))                         # с этого кадра сцена «держит» последний кадр: следующие — точные копии (не считаем заново)
        for i in range(a, b + 1, o['stride']):
            path = os.path.join(outdir, '%03d.png' % i)
            if os.path.exists(path):
                continue
            ref = os.path.join(outdir, '%03d.png' % hold_i)
            if i > hold_i and os.path.exists(ref):
                shutil.copyfile(ref, path)
                print('кадр', i, '= копия', hold_i, flush=True)
                continue
            if o['layer'] == 'jar':
                render_jar(i, o['total'], os.path.abspath(path), o['portrait'], o['res'], o['ss'])
            elif o['layer'] == 'z':
                if not S.get('depth_ready'):
                    setup_depth()
                    S['depth_ready'] = True
                render_depth(i, o['total'], os.path.abspath(path), o['portrait'])
            else:
                render_bg(i, o['total'], os.path.abspath(path), o['portrait'])
            print('кадр', i, flush=True)


if __name__ == '__main__':
    main()
