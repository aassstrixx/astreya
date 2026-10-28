#!/usr/bin/env python3
"""ASTREYA HOUSE: интерьеры комнат (Blender / Cycles) — фоны комнат главной-дома (assets/house/room-*.webp).

Те же материалы, свет и масштаб «макета», что у центрального зала (house_story.py): тёплый травертин и известняк, арки со скруглёнными проёмами, ниши с мягкой подсветкой, диагональное солнце
через переплёт окна, тёмно-синий акцент. Каждая комната — свой маленький набор из общих деталей (стена с арками, стол, полки, диван, книги), камера — прямо на задник, чуть сверху.

  python3 house_rooms.py about out.png [--res 1600x900] [--samples 14]
  комнаты: about (01), finder (03), expertise (04), academy (05), partners (06), editorial (07); «галерея брендов» (02) — готовый рендер assets/brands/hero.webp.
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import house_story as HS
import hall_story as H
from hall_story import BR, MT, PK, RK, S, SC, Vector, bpy

_f = HS._f
M = {}


def fresh(res, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    SC.settings(sc, res[0], res[1], samples)
    cy = sc.cycles
    cy.use_adaptive_sampling = True; cy.adaptive_threshold = _f('HALL_ADAPT', .03)
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.max_bounces = 6; cy.transmission_bounces = 6; cy.glossy_bounces = 4; cy.sample_clamp_indirect = 4.0
    sc.view_settings.exposure = _f('ROOM_EXP', -1.5); sc.view_settings.look = 'AgX - Punchy'
    sc.render.film_transparent = False
    M.clear(); M.update(HS.house_mats())
    S.clear()
    return sc


def lights(sun_dir=(.58, .70, -.42), center=(0, 1.2, .5), sun=32.0):
    """солнце с переплётом окна + мягкий верхний «потолок» + заполняющий — как в зале; без света баночки и софтбоксов"""
    d = Vector(sun_dir).normalized()
    sn = bpy.data.lights.new('sun', 'SUN'); sn.energy = sun; sn.angle = math.radians(1.1); sn.color = (1.0, .92, .78)
    so = bpy.data.objects.new('sun', sn); bpy.context.collection.objects.link(so); so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = 45; ar.size = 3.0; ar.size_y = 2.0; ar.color = (1.0, .93, .82)
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = (-1.0, -3.0, 1.6); ao.rotation_euler = (math.radians(78), 0, math.radians(8)); ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (.98, .90, .78, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = .06
    bpy.context.scene.world = w
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 1.0, 3.4)); ce = bpy.context.object; ce.scale = (14, 14, 1)
    cm = bpy.data.materials.new('ceil'); cm.use_nodes = True; nt = cm.node_tree; nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, .93, .80, 1); em.inputs['Strength'].default_value = _f('ROOM_CEIL', 1.1)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs['Emission'], out.inputs['Surface']); ce.data.materials.append(cm); ce.visible_camera = False; ce.visible_shadow = False
    # переплёт окна: диагональные пятна света
    t = Vector(center) - d * 7.0
    ex = d.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(d).normalized()
    gm = SC.mat_simple('gobo', (.1, .1, .1))
    import numpy as np
    from mathutils import Matrix
    def bar(u0, v0, u1, v1):
        bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object
        b.scale = (abs(u1 - u0), .05, abs(v1 - v0)); b.location = t + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2); b.rotation_euler = Matrix((ex, d, ey)).transposed().to_euler()
        b.data.materials.append(gm); b.visible_camera = False; b.visible_glossy = False; b.visible_transmission = False
    U, V = _f('ROOM_WU', 2.2), _f('ROOM_WV', 1.2)
    for u in np.linspace(-U, U, 4): bar(u - .06, -V, u + .06, V)
    for v in np.linspace(-V, V, 3): bar(-U, v - .06, U, v + .06)
    bar(-U - 4, V, U + 4, V + 4); bar(-U - 4, -V - 4, U + 4, -V); bar(-U - 4, -V, -U, V); bar(U, -V, U + 4, V)


def cam(pos, tgt, lens=30.0):
    cd = bpy.data.cameras.new('Cam'); cd.sensor_width = 36; cd.dof.use_dof = False
    c = bpy.data.objects.new('Camera', cd); bpy.context.scene.collection.objects.link(c); bpy.context.scene.camera = c
    c.location = Vector(pos); c.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler(); cd.lens = lens


def shell(W=4.6, D=2.6, wall_h=2.6, arches=(), left=True, right=True, mat='wall'):
    """пол, задняя стена с арочными проёмами (если есть) и боковые стены"""
    SC.box('floor', M['floor'], -7, 7, -9, D + 3, -.3, 0, 'w', 0)
    back = SC.box('back', M[mat], -W / 2 - .3, W / 2 + .3, D, D + .35, -.1, wall_h, 'w', 0)
    for i, a in enumerate(arches):
        c = SC.arch_solid('cut%d' % i, M['wall'], a['cx'], a['rx'], a['zs'], D - .05, D + a.get('depth', .12), 'w', z0=a.get('z0', -.2))
        BR.boolean(back, c)
    BR.apply_mods(back)
    back.data.materials.append(M['inner'])
    for pl in back.data.polygons:
        c = pl.center
        for a in arches:
            if abs(c.x - a['cx']) <= a['rx'] + .004 and c.z <= a['zs'] + a['rx'] + .004 and D + .005 < c.y < D + a.get('depth', .12) - .005:
                pl.material_index = 1
    if left: SC.box('wl', M['inner'], -W / 2 - .3, -W / 2 - .15, -2.0, D + .35, -.1, wall_h, 'w', 0)
    if right: SC.box('wr', M['inner'], W / 2 + .15, W / 2 + .3, -2.0, D + .35, -.1, wall_h, 'w', 0)
    SC.box('plinth_b', M['trav2'], -W / 2, W / 2, D - .035, D, 0, .06, 'w', .004)
    return back


def glow_arch(cx, rx, zs, y, depth=.12, strength=2.4, col=(1.0, .88, .66)):
    """светящееся матовое окно-ниша в стене (как «картина» или дневной свет) + тонкая светящаяся линия свода"""
    fm = H.mat_frost(); g = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); g.inputs['Emission Strength'].default_value = strength; g.inputs['Emission Color'].default_value = (*col, 1)
    ob = SC.arch_solid('glow', fm, cx, rx - .012, zs - .01, y + depth - .03, y + depth - .005, 'p', z0=.0); ob.visible_shadow = False
    led = SC.mat_led('led', 7.0, (1.0, .80, .52))
    SC.arch_frame('ledf', led, cx, rx - .012, zs - .01, .008, y + depth - .04, y + depth - .03, 'w', z0=.0)


def reeds(x0, n, y, z1=1.9, step=.075, r=.036):
    """рифлёная пилястра: n вертикальных валиков от x0"""
    for i in range(n):
        SC.cylinder('reed', M['trav2'], x0 + i * step, y - .02, r, 0.0, z1, 'w', seg=24, bev=0)


def frames(arches, D, t=.035):
    for a in arches:
        SC.arch_frame('frame', M['trav'], a['cx'], a['rx'], a['zs'], t, D - .03, D + .005, 'w', z0=.0)


def pouf(name, x, y, r, h, k=.04):
    ob = SC.cylinder(name, M['fabric'], x, y, r, 0, h, 'p', seg=64, bev=k)
    sub = ob.modifiers.new('ss', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    return ob


def rblock(name, mat, x0, x1, y0, y1, z0, z1, bev=.03):
    ob = SC.box(name, mat, x0, x1, y0, y1, z0, z1, 'p', bev)
    bv = ob.modifiers['bev']; bv.segments = 5; bv.width = bev
    return ob


def mat_color(name, rgb, rough=.7):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m


PALETTE = [(.93, .88, .78), (.82, .72, .56), (.06, .10, .19), (.62, .42, .32), (.45, .47, .32), (.90, .84, .70), (.30, .38, .52)]


def books(x0, x1, y, z, hmin=.10, hmax=.16, seed=1, gap=.002, depth=.09):
    """ряд книг/журналов, стоящих на полке: тонкие коробки разной высоты и цвета"""
    rnd = random.Random(seed); x = x0; mats = [mat_color('bk%d' % i, c, .6) for i, c in enumerate(PALETTE)]
    while x < x1 - .02:
        w = rnd.uniform(.014, .034); h = rnd.uniform(hmin, hmax)
        if x + w > x1: break
        SC.box('book', rnd.choice(mats), x, x + w, y - depth / 2, y + depth / 2, z, z + h, 'p', .001); x += w + gap


def shelf_unit(x0, x1, y, depth, boards, plank=.025):
    """открытый каменный стеллаж: две стойки и доски"""
    top = boards[-1] + plank
    SC.box('su_l', M['wall'], x0, x0 + .03, y - depth, y, 0, top, 'p', .003); SC.box('su_r', M['wall'], x1 - .03, x1, y - depth, y, 0, top, 'p', .003)
    for z in boards: SC.box('su_b', M['wall'], x0, x1, y - depth, y, z, z + plank, 'p', .003)


def pack(kind, noir, x, y, z, rot=0, k=1.3):
    pm = PK.M() if 'pm' not in S else S['pm']; S['pm'] = pm
    objs, _ = PK.build(kind, noir, pm)
    g = bpy.data.objects.new('pk_%s' % kind, None); bpy.context.collection.objects.link(g)
    for o in objs: o.parent = g
    g.location = (x, y, z); g.rotation_euler = (0, 0, math.radians(rot)); g.scale = (k,) * 3


def olive(x, y, h=.5, n=26, sc=1.0, seed=3, lean=.2, vase_h=.30):
    BR.vase((x, y, 0), vase_h, .09, M['ceramic'])
    BR.olive((x, y, vase_h + .03), h, n, sc, random.Random(seed), lean=lean, **H.LEAF)


def sphere_on_plinth(x, y, r=.11, ph=.20, pw=.30):
    SC.box('plinth', M['trav'], x - pw / 2, x + pw / 2, y - pw / 2, y + pw / 2, 0, ph, 'w', .008)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=r, location=(x, y, ph + r)); sp = bpy.context.object; bpy.ops.object.shade_smooth(); sp.data.materials.append(H.sphere_material())


# ---------------------------------------------------------------------------------------------------------------- комнаты
def room_about():
    """01 Галерея доверия: три высоких арочных «окна-картины» с мягким светом, длинная каменная скамья, скульптура-шар, ваза с деревом"""
    D = 2.6
    arches = [dict(cx=cx, rx=.36, zs=.62, depth=.14) for cx in (-1.15, 0.0, 1.15)]
    shell(4.6, D, arches=arches)
    for a in arches: glow_arch(a['cx'], a['rx'], a['zs'], D, a['depth'], strength=1.05)
    frames(arches, D); reeds(-.62, 1, D); reeds(.55, 1, D); reeds(-1.95, 4, D); reeds(1.67, 4, D)
    rblock('bench', M['trav'], -1.8, 1.8, D - .62, D - .12, 0, .17, .012)
    rblock('cush', M['navy'], -.9, -.1, D - .56, D - .20, .17, .21, .02); rblock('cush2', M['navy'], .35, 1.15, D - .56, D - .20, .17, .21, .02)
    pouf('pf1', -.7, 1.3, .15, .14); pouf('pf2', .65, 1.15, .13, .12)
    sphere_on_plinth(-1.75, 1.7, .12, .22, .32)
    olive(1.8, 1.55, .55, 28, 1.1, 5, .25, .32)
    cam((.0, -1.9, .78), (.0, D, .50), 30)


def room_finder():
    """03 Кабинет подбора: центральный овальный каменный стол с образцами, две ниши со стеллажами и продукцией, пуфы"""
    D = 2.7
    arches = [dict(cx=cx, rx=.46, zs=.75, depth=.34) for cx in (-1.0, 1.0)]
    shell(4.6, D, arches=arches)
    frames(arches, D); reeds(-.35, 5, D); reeds(-2.05, 3, D); reeds(1.83, 3, D)
    for cx in (-1.0, 1.0):
        H.ROOM_X = cx; H.SHELF = dict(w=.64, d=.28, boards=(.10, .42, .74, 1.06), t=.03, post=.03)
        H.build_shelf(M, D + .3)
    ob = SC.cylinder('table', M['trav'], 0, 1.05, .70, 0, .34, 'p', seg=96, bev=.012); ob.scale.y = .62
    SC.cylinder('tbl_top', M['trav2'], 0, 1.05, .72, .34, .365, 'p', seg=96, bev=.008).scale.y = .62
    for i, (k, noir, dx, dy, rot) in enumerate((('bottle', False, -.40, .08, 10), ('dropper', True, -.18, -.12, -8), ('jar', False, .02, .06, 25), ('pump', True, .24, -.08, 0), ('tube', False, .42, .10, 14), ('box', False, -.05, -.22, 0))):
        pack(k, noir, dx, 1.05 + dy, .365, rot, 1.4)
    pouf('pf1', -1.35, .55, .15, .15); pouf('pf2', 1.35, .6, .14, .13)
    olive(-1.9, 1.7, .5, 26, 1.0, 9, .2, .30)
    cam((.0, -1.9, .80), (.0, D, .52), 30)


def room_expertise():
    """04 Кабинет специалиста: письменный стол с лампой, книгами и материалами, кресло, нишевые полки с книгами, тёмно-синяя панель"""
    D = 2.5
    arches = [dict(cx=-1.2, rx=.45, zs=.72, depth=.30)]
    shell(4.6, D, arches=arches)
    frames(arches, D); reeds(-.45, 4, D); reeds(2.0, 3, D)
    shelf_unit(-1.65, -.75, D + .28, .27, (.10, .42, .74, 1.06))
    for z in (.125, .445, .765, 1.085): books(-1.62, -.78, D + .16, z, .11, .24 if z < 1 else .16, 11 + int(z * 10))
    SC.box('panel', M['navy'], .0, 1.9, D - .01, D + .02, .05, 1.32, 'w', 0)
    led = SC.mat_led('led', 5.0, (1.0, .78, .5)); SC.box('panel_led', led, .0, 1.9, D - .012, D - .004, 1.30, 1.315, 'w', 0)
    # стол и стул
    rblock('desk_top', M['trav2'], .15, 1.85, 1.30, 2.05, .34, .375, .008)
    for x in (.22, 1.78):
        SC.box('desk_leg', M['trav'], x - .03, x + .03, 1.38, 1.98, 0, .34, 'p', .004)
    for i, c in enumerate(((.93, .88, .78), (.06, .10, .19), (.82, .72, .56))):
        SC.box('stack', mat_color('st%d' % i, c, .6), .30, .62, 1.55 + i * .01, 1.82, .375 + i * .02, .395 + i * .02, 'p', .002)
    # лампа
    SC.cylinder('lamp_s', M['trav'], 1.55, 1.75, .012, .375, .62, 'p', seg=24, bev=0)
    lm = SC.mat_led('lamp_h', 14.0, (1.0, .80, .55)); bpy.ops.mesh.primitive_uv_sphere_add(radius=.07, location=(1.55, 1.75, .66)); lo = bpy.context.object; lo.scale.z = .7; lo.data.materials.append(lm)
    for i, (dx, dz) in enumerate(((.8, 0), (1.05, 0), (1.3, 0))):
        pack(('bottle', 'jar', 'dropper')[i], i == 2, dx, 1.62, .375, 12 * i, 1.2)
    rblock('chair_seat', M['fabric'], .55, 1.05, .70, 1.15, .13, .21, .03); rblock('chair_back', M['fabric'], .55, 1.05, .62, .72, .20, .46, .03)
    for x in (.62, .98):
        for y in (.75, 1.10): SC.box('ch_leg', M['trav'], x - .015, x + .015, y - .015, y + .015, 0, .13, 'p', .002)
    olive(1.95, 1.0, .5, 26, 1.0, 13, .2, .30)
    cam((.1, -1.9, .82), (.15, D, .50), 30)


def room_academy():
    """05 Учебный центр: длинный стол с образцами, лёгкие стулья, стеллажи с продукцией, тёмная панель-экран, мягкий свет"""
    D = 2.6
    arches = [dict(cx=-1.3, rx=.40, zs=.70, depth=.30), dict(cx=1.3, rx=.40, zs=.70, depth=.30)]
    shell(4.6, D, arches=arches)
    frames(arches, D); reeds(-2.05, 3, D); reeds(1.83, 3, D)
    for cx in (-1.3, 1.3):
        H.ROOM_X = cx; H.SHELF = dict(w=.58, d=.26, boards=(.10, .42, .74, 1.04), t=.03, post=.03); H.build_shelf(M, D + .28)
    scr = SC.mat_led('screen', 2.6, (.92, .93, .98)); SC.box('screen', scr, -.62, .62, D - .012, D - .004, .46, 1.12, 'w', 0)
    SC.box('screen_fr', M['navy'], -.66, .66, D - .016, D - .006, .42, 1.16, 'w', 0)
    rblock('long_top', M['trav2'], -1.55, 1.55, .95, 1.55, .34, .37, .008)
    for x in (-1.45, 0, 1.45): SC.box('lt_leg', M['trav'], x - .05, x + .05, 1.05, 1.45, 0, .34, 'p', .004)
    for i in range(9):
        x = -1.35 + i * .34
        pack(('bottle', 'jar', 'tube', 'dropper', 'pump')[i % 5], i % 3 == 0, x, 1.25 + (.06 if i % 2 else -.06), .37, (i * 23) % 40 - 20, 1.15)
    for x in (-1.0, -.3, .4, 1.1):
        pouf('st%d' % int(x * 10), x, .45, .11, .22, .03)
    olive(1.95, 1.7, .5, 24, 1.0, 17, .2, .30)
    cam((.0, -1.9, .82), (.0, D, .50), 30)


def room_partners():
    """06 Партнёрская гостиная: диван из мягких блоков, круглый журнальный столик, ковёр, торшер, арочное окно с дневным светом"""
    D = 2.6
    arches = [dict(cx=.0, rx=.62, zs=.60, depth=.16)]
    shell(4.6, D, arches=arches)
    glow_arch(.0, .62, .60, D, .16, strength=1.3)
    frames(arches, D); reeds(-1.9, 4, D); reeds(1.67, 4, D)
    SC.cylinder('rug', M['fabric'], .0, 1.05, 1.25, 0, .012, 'p', seg=96, bev=.004).scale.y = .66
    # диван
    rblock('sofa_base', M['fabric'], -1.05, 1.05, 1.62, 2.25, .0, .12, .04)
    rblock('sofa_seat1', M['fabric'], -1.0, .0, 1.66, 2.12, .12, .22, .05); rblock('sofa_seat2', M['fabric'], .0, 1.0, 1.66, 2.12, .12, .22, .05)
    rblock('sofa_back', M['fabric'], -1.05, 1.05, 2.12, 2.30, .12, .50, .05)
    rblock('arm_l', M['fabric'], -1.12, -.98, 1.62, 2.30, .12, .34, .04); rblock('arm_r', M['fabric'], .98, 1.12, 1.62, 2.30, .12, .34, .04)
    # столик
    SC.cylinder('ct_base', M['trav'], .0, .95, .27, 0, .15, 'p', seg=64, bev=.012); SC.cylinder('ct_top', M['trav2'], .0, .95, .34, .15, .175, 'p', seg=64, bev=.01)
    pack('jar', False, -.08, .95, .175, 20, 1.2); pack('bottle', True, .12, .98, .175, 0, 1.2)
    rblock('cu1', M['navy'], -.82, -.42, 1.70, 1.98, .22, .40, .05); rblock('cu2', M['navy'], .50, .90, 1.70, 1.98, .22, .40, .05)
    pouf('pf', 1.55, .75, .17, .16)
    # торшер
    SC.cylinder('fl_s', M['trav'], -1.65, 1.9, .012, 0, .78, 'p', seg=24, bev=0)
    lm = SC.mat_led('fl_h', 12.0, (1.0, .82, .58)); bpy.ops.mesh.primitive_uv_sphere_add(radius=.10, location=(-1.65, 1.9, .86)); lo = bpy.context.object; lo.scale.z = .8; lo.data.materials.append(lm)
    olive(1.75, 1.8, .5, 26, 1.0, 21, .25, .30)
    cam((.0, -1.9, .78), (.0, D, .46), 30)


def room_editorial():
    """07 Редакция: библиотека — стеллажи с журналами и книгами, каменный столик с раскрытым выпуском, стойка с обложками, скульптура"""
    D = 2.6
    arches = [dict(cx=.0, rx=.42, zs=.70, depth=.14)]
    shell(4.6, D, arches=arches)
    glow_arch(.0, .42, .70, D, .14, strength=1.05)
    frames(arches, D)
    for x0, x1, sd in ((-2.0, -.66, 31), (.66, 2.0, 41)):
        shelf_unit(x0, x1, D - .02, .32, (.10, .42, .74, 1.06, 1.38))
        for z in (.125, .445, .765, 1.085, 1.405): books(x0 + .04, x1 - .04, D - .16, z, .12, .27 if z < 1.3 else .2, sd + int(z * 10))
    # столик с раскрытым журналом
    SC.cylinder('et_base', M['trav'], .0, 1.0, .14, 0, .27, 'p', seg=64, bev=.01); SC.cylinder('et_top', M['trav2'], .0, 1.0, .46, .27, .30, 'p', seg=96, bev=.01)
    pgm = mat_color('pg', (.96, .94, .90), .8)
    pl = SC.box('page_l', pgm, -.20, -.005, .90, 1.12, .30, .306, 'p', .001); pr = SC.box('page_r', pgm, .005, .20, .90, 1.12, .30, .306, 'p', .001)
    pl.rotation_euler = (0, math.radians(2.5), 0); pr.rotation_euler = (0, math.radians(-2.5), 0)
    SC.box('spine', mat_color('sp', (.20, .18, .14), .6), -.006, .006, .90, 1.12, .30, .308, 'p', 0)
    for i in range(3): SC.box('mag%d' % i, mat_color('mg%d' % i, PALETTE[i + 1], .6), .28, .50, .80 + i * .004, 1.0 + i * .004, .30 + i * .012, .312 + i * .012, 'p', .001)
    sphere_on_plinth(-1.9, .9, .10, .20, .28)
    olive(1.9, 1.0, .5, 26, 1.0, 51, .25, .30)
    pouf('pf', -.95, .6, .15, .14)
    cam((.0, -1.9, .86), (.0, D, .52), 30)


ROOMS = dict(about=room_about, finder=room_finder, expertise=room_expertise, academy=room_academy, partners=room_partners, editorial=room_editorial)


def main():
    a = sys.argv[1:]
    name, out = a[0], os.path.abspath(a[1])
    res = (1600, 900); samples = 14
    if '--res' in a: w, h = a[a.index('--res') + 1].lower().split('x'); res = (int(w), int(h))
    if '--samples' in a: samples = int(a[a.index('--samples') + 1])
    sc = fresh(res, samples)
    lights()
    ROOMS[name]()
    import re
    for ob in list(bpy.data.objects):                                                  # «лишние» полоски-этикетки упаковок без родителя лежат в начале координат — убираем
        if ob.parent is None and re.match(r'label[hm]?(\.\d+)?$', ob.name): bpy.data.objects.remove(ob, do_unlink=True)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('комната', name, out)


if __name__ == '__main__':
    main()
