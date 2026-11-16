#!/usr/bin/env python3
"""ASTREYA GRAND ATRIUM v2 — второй вариант атриума «Компании» (Blender 5 / Cycles, CPU). Расширяет atrium.py (тот не тронут): зал, камеры, свет и
режимы запуска — оттуда; здесь подменяются скульптура, окна и добавляется интерьер косметологической академии / шоурума дистрибьютора.

Что нового:
  • скульптура — НАСТОЯЩИЙ знак сайта (#logo-art из src/partials/logo-defs.html; копия контуров — astreya-logo-art.svg: гора, дуга, жемчужина; надпись «Астрея» в скульптуру не входит) в рост 3 м:
    bpy.ops.import_curve.svg → кривые → экструзия (отверстия букв сохраняются) → меш с фаской; знак — глубокий тёмно-синий лак (ASTREYA_NAVY_LACQUER, ≈ #0f2247, слой лака
    отражает зал), жемчужина — латунная линза, тонкое латунное кольцо-«орбита» за знаком; знак свободно стоит на круглом трёхступенчатом подиуме (правое плечо — на каменной стойке);
  • вид за окнами: панорама (make_pano.py: небо с градиентом и облаками, дымка, холмы, два плана города, деревья, живая изгородь, терраса). Окна клеристория, арочные окна
    боковых нефов, световые щели потолка и порталы берут цвет панорамы по направлению луча (как у бесконечно удалённого вида), а не белую заливку;
  • интерьер (без диванов и ковров): стойка консультации из травертина с латунью и планшетом, подсвеченные стеллажи и стеклянные витрины с упаковками (packs.py: флаконы,
    баночки, тубы, пипетки, коробки; надписей нет), каменные подиумы с латунными пилонами-табличками, стелы с подсвеченной нишей, консультационные столики с лотками и ампулами,
    зеркала с подсветкой (арки на стенах нефов), низкие кресла и каменные банкетки у стены, ширмы-рейки, кадки с оливами и фикусами, напольные вазы с ветками.

Запуск (из этой папки): те же режимы, что у atrium.py — preview | still | seq (AT_CAM, AT_W, AT_SPP, AT_TILES …).
  python3 atrium_v2.py preview               # /tmp/at_preview.png; панорама создаётся при первом запуске (/tmp/at_pano.png)
Переменные: WINK, NICHEK, SLOTK, APSEK (яркость видов), AISLEK (свет боковых нефов), LKEY (общий свет, 0,62), V2_PLANTS=0 (без растений — быстрый макет), AT_PANO."""
import os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
PANO = os.environ.get('AT_PANO', '/tmp/at_pano.png'); os.environ.setdefault('PANO_OUT', PANO); os.environ.setdefault('LKEY', '.62')
import bpy, mathutils
import atrium as A
AA, RL, S = A.AA, A.RL, A.S
import packs as PK
from mathutils import Vector, Matrix

LEN = A.LEN; SY = A.SY; NX = A.NX; WX = A.WX; E = AA.E
LOGO_H = 3.3                                            # высота знака, м (ширина ≈ 3,4 м)
PL_TOP = .56                                            # верх подиума


# ───────────── вид за окнами ─────────────
def sky_mat(name, k):
    """эмиссия = панорама неба по направлению луча (−Incoming): окно как бесконечно удалённый вид"""
    if not os.path.exists(PANO):
        import make_pano; make_pano.main()
    img = bpy.data.images.get('at_pano') or bpy.data.images.load(PANO); img.name = 'at_pano'; img.colorspace_settings.name = 'sRGB'
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    g = N.new('ShaderNodeNewGeometry'); ng = N.new('ShaderNodeVectorMath'); ng.operation = 'SCALE'; ng.inputs['Scale'].default_value = -1.0; L.new(g.outputs['Incoming'], ng.inputs[0])
    t = N.new('ShaderNodeTexEnvironment'); t.image = img; t.interpolation = 'Linear'; L.new(ng.outputs['Vector'], t.inputs['Vector'])
    em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = k; L.new(t.outputs['Color'], em.inputs['Color'])
    o = N.new('ShaderNodeOutputMaterial'); L.new(em.outputs[0], o.inputs['Surface']); return m


_mat0 = A.materials


def materials2():
    M = _mat0()
    M['win'] = sky_mat('at_window_sky', E('WINK', 1.9)); M['niche'] = sky_mat('at_niche_sky', E('NICHEK', 1.8))
    M['slot'] = sky_mat('at_slot_sky', E('SLOTK', 2.1)); M['apse'] = sky_mat('at_apse_sky', E('APSEK', 1.9))
    M['soil'] = AA.flat('at_soil', '#2b2219', rough=.96)
    M['terrazzo'] = AA.weather(AA.pbr('AT_TERRAZZO', 'terrazzo-cream', tile=.9, tint='#f7efe1', rough=.42, bump=.3), color_var=.03, cscale=.8)
    M['oak'] = RL.oak('at_oak', (.66, .49, .30), 1.0, 'Z')
    M['lacq'] = AA.flat('ASTREYA_NAVY_LACQUER', '#0f2247', rough=.12, metal=0.0, coat=1.0)               # глубокий тёмно-синий лак знака
    M['brass'] = AA.flat('at_pearl_brass', '#d9bf8e', rough=.2, metal=1.0)
    M['stela_led'] = AA.led('at_stela_back', (1.0, .90, .74), 2.6); M['strip'] = AA.led('at_stela_strip', (1.0, .92, .78), 16.0)
    M['shelf_back'] = AA.led('at_shelf_back', (1.0, .93, .80), 1.7); M['shelf_led'] = AA.led('at_shelf_led', (1.0, .92, .78), 14.0)
    M['mir_glow'] = AA.led('at_mirror_glow', (1.0, .90, .76), 1.6); M['mirror'] = AA.flat('at_mirror', '#e9e7e1', rough=.025, metal=1.0)
    M['screen'] = AA.led('at_tablet_screen', (.80, .88, 1.0), 1.1); M['tablet'] = AA.flat('at_tablet', '#07090c', rough=.08, coat=.5)
    M['vitr'] = AA.glass('at_vitrine', tint='#f3f7f7', rough=.012); M['frost'] = AA.glass('at_frost_acrylic', tint='#f6f8fa', rough=.55)
    M['f_cream'] = RL.make_mats(3.3)
    return M


# ───────────── скульптура-логотип ─────────────
def sculpture2(M):
    cx, cy = 0.0, SY
    A.disc('plinth1', M['tra'], cx, cy, 4.5, 0.0, .17); A.disc('plinth2', M['tra'], cx, cy, 4.0, .17, .18); A.disc('plinth3', M['tra'], cx, cy, 3.5, .35, PL_TOP - .35)
    AA.sweep('plinth_ring', M['navy'], cx, cy, 0.0, 4.95, 4.95, [(-.04, 0), (.04, 0), (.04, .008), (-.04, .008)], n=220)
    AA.sweep('plinth_brass', M['champ'], cx, cy, PL_TOP, 3.28, 3.28, [(-.025, 0), (.0, 0), (.0, .01), (-.025, .01)], n=180)
    before = set(bpy.data.objects); bpy.ops.import_curve.svg(filepath=os.path.join(HERE, 'astreya-logo-art.svg')); bpy.context.view_layer.update()
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']

    def pts_world(o):
        out = []
        for sp in o.data.splines:
            for bp in (sp.bezier_points if sp.type == 'BEZIER' else sp.points): out.append(o.matrix_world @ Vector(bp.co[:3]))
        return out
    info = []
    for o in parts:
        pw = pts_world(o); xs = [p.x for p in pw]; ys = [p.y for p in pw]; info.append((o, min(xs), max(xs), min(ys), max(ys), len(pw)))
    area = lambda t: (t[2] - t[1]) * (t[4] - t[3])
    big = max(info, key=area)                                                                               # гора — самый большой контур
    pearl = min([t for t in info if t[5] == 4 and t is not big], key=area)                                   # жемчужина — окружность из 4 узлов
    arc = max([t for t in info if t is not big and t is not pearl], key=area)                                # дуга — следующая по размеру
    for t in info:                                                                                          # надпись «Астрея» в скульптуре не нужна: только знак (гора, дуга, жемчужина)
        if t is not big and t is not pearl and t is not arc: bpy.data.objects.remove(t[0])
    mp = pts_world(big[0]); arcpts = pts_world(arc[0]); left = min(mp, key=lambda p: p.x)
    flip = -1.0 if left.y > sum(p.y for p in mp) / len(mp) else 1.0                                          # ножка горы внизу
    gx0, gx1, gy0, gy1 = big[1], big[2], big[3], big[4]
    s = LOGO_H / (gy1 - gy0); z_foot = PL_TOP + .02; ybase = min(p.y * flip for p in mp); XC = (gx0 + gx1) / 2
    T = lambda v: ((v.x - XC) * s, (v.y * flip - ybase) * s)
    lacq = M['lacq']; keep = []
    for t in (big, arc):
        o = t[0]; mw = o.matrix_world.copy()
        for sp in o.data.splines:
            for bp in (sp.bezier_points if sp.type == 'BEZIER' else sp.points):
                if sp.type == 'BEZIER':
                    for attr in ('co', 'handle_left', 'handle_right'):
                        X, Z = T(mw @ Vector(getattr(bp, attr)[:3])); setattr(bp, attr, (X, Z, 0.0))
                else:
                    X, Z = T(mw @ Vector(bp.co[:3])); bp.co = (X, Z, 0.0, 1.0)
        cu = o.data; cu.dimensions = '2D'; cu.fill_mode = 'BOTH'; cu.resolution_u = 14; cu.bevel_depth = 0.0
        cu.extrude = .09 if t is big else .07; cu.materials.clear(); cu.materials.append(lacq)                 # глубина 18 / 14 см
        o.parent = None; o.location = (cx, cy, z_foot); o.rotation_euler = (math.pi / 2, 0, 0); o.scale = (1, 1, 1); keep.append(o)
    pc = pts_world(pearl[0]); px = sum(p.x for p in pc) / len(pc); py = sum(p.y for p in pc) / len(pc); pr = (pearl[2] - pearl[1]) / 2 * s
    Rt = max(mp, key=lambda p: p.x)
    bpy.data.objects.remove(pearl[0]); bpy.context.view_layer.update()
    for o in keep: o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]; bpy.ops.object.convert(target='MESH')
    for o in keep:
        o.name = 'logo_part'
        for p in o.data.polygons: p.use_smooth = True
        b = o.modifiers.new('bev', 'BEVEL'); b.width = .008; b.segments = 2; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40); b.harden_normals = True
    PX = cx + (px - XC) * s; PZ = z_foot + (py * flip - ybase) * s
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=pr, location=(PX, cy, PZ)); d = bpy.context.object; d.name = 'logo_pearl'; d.scale = (1, .32, 1)
    d.data.materials.append(M['brass'])
    for p in d.data.polygons: p.use_smooth = True
    # правое плечо знака опирается на каменную стойку, левая ножка стоит на подиуме: знак свободно стоит перед кольцом
    XR = cx + (Rt.x - XC) * s; px0, px1 = XR - .50, XR - .14
    zs = [z_foot + (p.y * flip - ybase) * s for p in mp + arcpts if px0 <= cx + (p.x - XC) * s <= px1]
    ztop = (min(zs) if zs else z_foot + (Rt.y * flip - ybase) * s) + .03
    AA.box('mark_pier', M['ivory'], px0, px1, cy - .15, cy + .15, PL_TOP - .02, ztop, bevel=.015); AA.box('mark_pier_cap', M['champ'], px0 - .008, px1 + .008, cy - .158, cy + .158, ztop - .03, ztop - .012, bevel=.003)
    zc = z_foot + ((gy0 + gy1) / 2 * flip - ybase) * s; RR = 2.65
    A.ring_band('halo', M['champ'], cx, cy + 1.0, zc, RR, RR, w=.09, t=.04, tilt_x=90)
    A.ring_band('halo_in', M['navy'], cx, cy + 1.0, zc, RR, RR, w=.025, t=.047, tilt_x=90)
    print('знак: высота %.2f м, ширина %.2f м, глубина 14–18 см, жемчужина r=%.2f, центр z=%.2f, стойка до z=%.2f' % ((gy1 - gy0) * s, (gx1 - gx0) * s, pr, zc, ztop), flush=True)


# ───────────── детали интерьера ─────────────
def grp(x, y, yaw=0.0):
    r = bpy.data.objects.new('grp', None); bpy.context.collection.objects.link(r); r.location = (x, y, 0); r.rotation_euler = (0, 0, math.radians(yaw)); return r


def wmat(root): return Matrix.Translation(root.location) @ Matrix.Rotation(root.rotation_euler.z, 4, 'Z')


def box_p(root, name, mat, x0, x1, y0, y1, z0, z1, bevel=.01):
    o = AA.box(name, mat, x0, x1, y0, y1, z0, z1, bevel=bevel); o.parent = root; return o


FACE = {'+x': 90.0, '-x': -90.0, '+y': 180.0, '-y': 0.0}     # куда «смотрит» перед предмета (модели строятся лицом к −Y)
KINDS = ['bottle', 'jar', 'box', 'tube', 'pump', 'dropper']
_PK = {}; _TPL = {}


def pm():
    if 'm' not in _PK: _PK['m'] = PK.M()
    return _PK['m']


def pack_tpl(kind, noir=False):
    """шаблон упаковки (один раз), дальше — связанные копии (общая геометрия)"""
    key = (kind, noir)
    if key not in _TPL:
        objs, _ = PK.build(kind, noir, pm(), None); bpy.context.view_layer.update()
        for o in objs: o.hide_render = True; o.hide_viewport = True
        _TPL[key] = [(o, o.matrix_world.copy()) for o in objs]
    return _TPL[key]


def put_pack(kind, Mw, noir=False, k=1.3):
    """Mw — положение упаковки в мире (низ — начало координат)"""
    for o, m0 in pack_tpl(kind, noir):
        c = o.copy(); bpy.context.collection.objects.link(c); c.hide_render = False; c.hide_viewport = False; c.parent = None; c.matrix_world = Mw @ Matrix.Scale(k, 4) @ m0


def products(M, root, x, y, z, kinds, rnd, spread=.13, k=1.3):
    n = len(kinds); R = wmat(root)
    for i, kd in enumerate(kinds):
        kk = kd if isinstance(kd, tuple) else (kd, False); lx = x + (i - (n - 1) / 2) * spread; ly = y + rnd.uniform(-.012, .012)
        put_pack(kk[0], R @ Matrix.Translation((lx, ly, z)) @ Matrix.Rotation(rnd.uniform(-.3, .3), 4, 'Z'), kk[1], k)


def ampoules(R, x, y, z, n=5, step=.056):
    """ампулы на лотке: стеклянные капсулы (прозрачное и дымчатое стекло)"""
    for i in range(n):
        p = R @ Vector((x + i * step, y + (.03 if i % 2 else -.02), z))
        A.lathe('ampoule', pm()['smoke_clear'] if i % 2 else pm()['glass'], [(0, 0), (1, 0), (1, .56), (.42, .70), (.36, 1.0), (0, 1.0)], p.x, p.y, p.z, .010, .075, seg=20)


def planter(M, x, y, r=.5, H=.85, mat='terrazzo'):
    A.lathe('planter', M[mat], [(0, 0), (.78, 0), (.95, .04), (1.0, .13), (1.0, .93), (.97, .985), (.90, 1.0), (.84, .985), (.82, .93), (0, .93)], x, y, 0.0, r, H)
    A.disc('soil', M['soil'], x, y, r * .83, H * .915, H * .03, n=64, bevel=0); return Vector((x, y, H * .94))


def slat_screen(M, along, c, a0, a1, h=2.35, pitch=.095, w=.04, d=.05):
    n = int((a1 - a0) / pitch)
    for i in range(n + 1):
        t = a0 + i * pitch + (a1 - a0 - n * pitch) / 2
        if along == 'x': AA.box('slat', M['oak'], t - w / 2, t + w / 2, c - d / 2, c + d / 2, .06, h - .05, bevel=.004)
        else: AA.box('slat', M['oak'], c - d / 2, c + d / 2, t - w / 2, t + w / 2, .06, h - .05, bevel=.004)
    for z0, z1 in ((.0, .06), (h - .05, h)):
        if along == 'x': AA.box('rail', M['champ'], a0 - .02, a1 + .02, c - d / 2 - .01, c + d / 2 + .01, z0, z1, bevel=.004)
        else: AA.box('rail', M['champ'], c - d / 2 - .01, c + d / 2 + .01, a0 - .02, a1 + .02, z0, z1, bevel=.004)


def shelving(M, x, y, face, rnd, w=3.0, h=2.45, rows=4):
    """подсвеченный стеллаж: каменные боковины, светящаяся задняя панель, стеклянные полки с латунной кромкой и полосой света, упаковки"""
    r = grp(x, y, FACE[face]); st = M['tra']
    box_p(r, 'sh_l', st, -w / 2 - .06, -w / 2, -.20, .18, 0.0, h, bevel=.01); box_p(r, 'sh_r', st, w / 2, w / 2 + .06, -.20, .18, 0.0, h, bevel=.01)
    box_p(r, 'sh_t', st, -w / 2 - .06, w / 2 + .06, -.20, .18, h, h + .07, bevel=.01); box_p(r, 'sh_b', st, -w / 2 - .06, w / 2 + .06, -.20, .18, 0.0, .10, bevel=.01)
    box_p(r, 'sh_back', M['shelf_back'], -w / 2, w / 2, .16, .17, .10, h, bevel=0)
    zs = [.10 + (h - .10) * (i + .42) / rows for i in range(rows)]; zs[0] = .34
    for z in zs:
        box_p(r, 'sh_glass', M['vitr'], -w / 2, w / 2, -.16, .15, z - .008, z, bevel=0); box_p(r, 'sh_edge', M['champ'], -w / 2, w / 2, -.165, -.15, z - .014, z + .002, bevel=.002)
        box_p(r, 'sh_led', M['shelf_led'], -w / 2 + .02, w / 2 - .02, -.12, -.10, z - .02, z - .012, bevel=0)
        n = int(w / .24); products(M, r, 0.0, -.01, z, [(rnd.choice(KINDS), rnd.random() < .22) for _ in range(n)], rnd, spread=w / n)
    return r


def podium(M, x, y, face, rnd, r_=.58, h=.62, kinds=('bottle', 'jar', 'tube', 'pump')):
    """каменный подиум со стенд-упаковками и тонким латунным пилоном-табличкой (без надписей)"""
    r = grp(x, y, FACE[face]); A.disc('pod', M['tra'], x, y, r_, 0.0, h, n=96, bevel=.016); A.disc('pod_cap', M['champ'], x, y, r_ * .985, h, .008, n=96, bevel=0)
    n = len(kinds)
    for i, kd in enumerate(kinds):
        ang = math.radians(-70 + 140 * i / max(1, n - 1)); px = math.sin(ang) * r_ * .5; py = -math.cos(ang) * r_ * .18 + (.05 if i % 2 else -.04)
        put_pack(kd, wmat(r) @ Matrix.Translation((px, py, h + .008)) @ Matrix.Rotation(rnd.uniform(-.4, .4), 4, 'Z'), rnd.random() < .2, 1.4)
    box_p(r, 'pyl', M['champ'], -.09, .09, r_ * .55 - .010, r_ * .55 + .010, h + .008, h + .90, bevel=.003); box_p(r, 'pyl_plate', M['champ'], -.12, .12, r_ * .55 - .018, r_ * .55 + .004, h + .66, h + .88, bevel=.004)
    return r


def stela(M, x, y, face, rnd, kinds=('bottle', 'jar', 'box'), H=2.6, mat='tra'):
    r = grp(x, y, FACE[face]); st = M[mat]
    box_p(r, 'st_foot', st, -.60, .60, -.23, .23, 0.0, .10, bevel=.012)
    box_p(r, 'st_l', st, -.55, -.42, -.18, .18, .10, H, bevel=.01); box_p(r, 'st_r', st, .42, .55, -.18, .18, .10, H, bevel=.01)
    box_p(r, 'st_b', st, -.42, .42, -.18, .18, .10, .62, bevel=.01); box_p(r, 'st_t', st, -.42, .42, -.18, .18, 2.22, H, bevel=.01)
    box_p(r, 'st_back', M['stela_led'], -.42, .42, .03, .04, .62, 2.22, bevel=0); box_p(r, 'st_strip', M['strip'], -.40, .40, -.15, -.02, 2.205, 2.22, bevel=0)
    box_p(r, 'st_shelf', M['champ'], -.41, .41, -.14, .03, 1.38, 1.395, bevel=.003)
    products(M, r, 0.0, -.06, .62, [(k, False) for k in kinds[:3]], rnd, .20); products(M, r, 0.0, -.06, 1.395, [(k, False) for k in kinds[:2]], rnd, .24)
    return r


def vitrine(M, x, y, rnd, face='-y', kinds=('pump', 'bottle', 'jar', 'tube')):
    r = grp(x, y, FACE[face]); box_p(r, 'vt_base', M['tra'], -.48, .48, -.48, .48, 0.0, .95, bevel=.014); box_p(r, 'vt_top', M['champ'], -.49, .49, -.49, .49, .95, .965, bevel=.004)
    box_p(r, 'vt_step', M['ivory'], -.30, .30, -.10, .26, .965, 1.045, bevel=.006)
    products(M, r, 0.0, -.26, .965, [(k, False) for k in kinds[:3]], rnd, .17); products(M, r, 0.0, .08, 1.045, [(k, rnd.random() < .3) for k in kinds[1:4]], rnd, .15)
    for sx in (-1, 1):
        for sy in (-1, 1): box_p(r, 'vt_post', M['champ'], sx * .44 - .01, sx * .44 + .01, sy * .44 - .01, sy * .44 + .01, .965, 1.74, bevel=.002)
    box_p(r, 'vt_roof', M['champ'], -.46, .46, -.46, .46, 1.74, 1.76, bevel=.004)
    for sy in (-1, 1): box_p(r, 'vt_g', M['vitr'], -.43, .43, sy * .44 - .004, sy * .44 + .004, .965, 1.74, bevel=0)
    for sx in (-1, 1): box_p(r, 'vt_g', M['vitr'], sx * .44 - .004, sx * .44 + .004, -.43, .43, .965, 1.74, bevel=0)
    box_p(r, 'vt_led', M['strip'], -.40, .40, -.40, .40, 1.735, 1.74, bevel=0)
    return r


def reception(M, x, y, rnd, face='-y', w=3.5):
    """стойка консультации: травертин, рифлёная передняя панель, латунные пояс и цоколь, планшет, лоток с ампулами; за ней — подсвеченный стеллаж"""
    r = grp(x, y, FACE[face]); hw = w / 2; R = wmat(r)
    box_p(r, 'rc_body', M['tra'], -hw, hw, -.38, .38, .07, 1.04, bevel=.012); box_p(r, 'rc_kick', M['champ'], -hw + .04, hw - .04, -.36, .34, 0.0, .07, bevel=.004)
    box_p(r, 'rc_flute', M['flute'], -hw + .10, hw - .10, -.40, -.375, .20, .94, bevel=.004); box_p(r, 'rc_band', M['champ'], -hw, hw, -.395, -.37, .96, .985, bevel=.004)
    box_p(r, 'rc_top', M['ivory'], -hw - .05, hw + .05, -.46, .46, 1.04, 1.10, bevel=.012); box_p(r, 'rc_inlay', M['champ'], -hw - .04, hw + .04, -.452, -.44, 1.098, 1.103, bevel=.001)
    tb = box_p(r, 'tablet', M['tablet'], -.15, .15, -.007, .007, -.11, .11, bevel=.004); tb.rotation_euler = (math.radians(-18), 0, math.radians(8)); tb.location = (.7, -.12, 1.215)
    sc = box_p(r, 'tablet_screen', M['screen'], -.14, .14, -.0085, -.0075, -.10, .10, bevel=0); sc.rotation_euler = tb.rotation_euler; sc.location = tb.location
    box_p(r, 'tablet_stand', M['champ'], -.04, .04, -.04, .04, 0.0, .018, bevel=.003).location = (.7, -.05, 1.10)
    box_p(r, 'tray', M['champ'], -.65, -.30, -.22, -.02, 1.10, 1.108, bevel=.002); ampoules(R, -.58, -.12, 1.108, 5, .062)
    products(M, r, -.05, .16, 1.10, [('jar', False), ('box', False)], rnd, .26, 1.2)
    shelving(M, x + (1.25 * math.sin(r.rotation_euler.z) * -1), y + 1.25 * math.cos(r.rotation_euler.z), face, rnd, w=w - .3, h=2.35, rows=4)
    return r


def consult(M, x, y, rnd, along='y'):
    """консультационный столик: дубовая столешница на латунной ножке, лоток с ампулами, баночки, два низких кресла напротив друг друга"""
    A.disc('ct_foot', M['champ'], x, y, .24, 0.0, .02, n=64, bevel=.004); A.lathe('ct_leg', M['champ'], [(0, 0), (1, 0), (1, 1), (0, 1)], x, y, .02, .03, .70, seg=24)
    A.disc('ct_top', M['oak'], x, y, .52, .72, .04, n=96, bevel=.012); AA.box('ct_tray', M['champ'], x - .20, x + .12, y - .14, y + .08, .76, .766, bevel=.002)
    ampoules(Matrix.Translation((x, y, 0)), -.17, -.04, .766, 5, .056)
    put_pack('jar', Matrix.Translation((x + .26, y - .20, .76)) @ Matrix.Rotation(.4, 4, 'Z'), False, 1.1); put_pack('bottle', Matrix.Translation((x + .30, y + .16, .76)), False, 1.0)
    for sgn, face in ((-1, '+y' if along == 'y' else '+x'), (1, '-y' if along == 'y' else '-x')):
        ch = RL.sofa('chair', M['f_cream'], x + (0 if along == 'y' else sgn * 1.0), y + (sgn * 1.0 if along == 'y' else 0), math.radians(FACE[face]), w=.40, d=.30, hk=1.0, seed=5 + sgn, pillows=False); ch.scale = (2.8, 2.8, 2.8)


def banquette(M, x, y, face, L=2.6):
    """каменная банкетка у стены со светлой льняной подушкой"""
    r = grp(x, y, FACE[face]); box_p(r, 'bq_base', M['tra'], -L / 2, L / 2, -.27, .27, .05, .36, bevel=.02); box_p(r, 'bq_kick', M['champ'], -L / 2 + .06, L / 2 - .06, -.24, .24, 0.0, .05, bevel=.003)
    RL.cushion('bq_cush', M['f_cream']['linen'], L - .06, .52, .10, (0, 0, .41), parent=r, r=.03, rz=.035, crown=.012, belly=.008, wrinkle=.0015, seed=4, n=30)
    return r


def wall_mirror(M, sx, yc, w=1.3, z0=.55, zs=2.2):
    """зеркало-арка с подсветкой на внутренней стороне наружной стены нефа: светящаяся арка чуть больше зеркала даёт мягкий контур"""
    inner = sx * WX

    def arch(wd, zb, zsp): return [(yc - wd / 2, zb)] + A.arch_yz(yc - wd / 2, yc + wd / 2, zsp, steps=24) + [(yc + wd / 2, zb)]
    xa = inner - sx * .016; xb = inner - sx * .030; xc = inner - sx * .062
    A.prism_yz('mir_glow', M['mir_glow'], arch(w + .22, z0 - .11, zs), min(xa, xb), max(xa, xb)); A.prism_yz('mirror', M['mirror'], arch(w, z0, zs), min(xb, xc), max(xb, xc), bevel=.004)


# ───────────── растения ─────────────
def vase_branch(M, lv, rnd, x, y, z0, H=.45, n=3, reach=.9, prof=None):
    A.lathe('vase', M['vase'], prof or A.VASE_P, x, y, z0, H * .62, H)
    neck = Vector((x, y, z0 + H * .93))
    for j in range(n):
        az = rnd.uniform(0, 6.283); el = rnd.uniform(1.15, 1.5) if j else 1.55; Lb = rnd.uniform(.7, 1.0) * reach
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))).normalized()
        pts = [neck, neck + d * Lb * .35 + Vector((0, 0, .05)), neck + d * Lb * .7 + Vector((0, 0, .08)), neck + d * Lb + Vector((0, 0, -.05 * Lb))]
        A.twig(rnd, lv, M['bark'], pts, 30, .008, .003, 1.5)


def plant_tree(M, leaves, rnd, x, y, kind='olive', H=2.6, pot=.55, pot_h=.85, mat='terrazzo', nb=9, count=34, lk=1.0, spread=1.2):
    top = planter(M, x, y, pot, pot_h, mat); th = max(.5, H - pot_h - 1.1 * spread)
    for st in range(rnd.choice((1, 2, 3))):
        dx, dy = rnd.uniform(-.12, .12) * (st > 0), rnd.uniform(-.12, .12) * (st > 0); b = Vector((x + dx * .4, y + dy * .4, top.z - .02))
        pts = [b, b + Vector((dx * .5, dy * .5, th * .35)), b + Vector((dx * 1.1, dy * 1.1, th * .7)), b + Vector((dx * 1.5, dy * 1.5, th))]
        A.twig(rnd, leaves, M['bark'], pts, 0, .042 - .008 * st, .016)
        tp = pts[-1]
        for j in range(nb // 2 + 2):
            az = rnd.uniform(0, 6.283); el = rnd.uniform(.5, 1.3); Lb = rnd.uniform(.75, 1.25) * spread; d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))).normalized()
            s0 = tp + Vector((0, 0, -rnd.uniform(0, th * .22)))
            q = [s0, s0 + d * Lb * .35 + Vector((0, 0, .05)), s0 + d * Lb * .7 + Vector((0, 0, .08)), s0 + d * Lb + Vector((0, 0, -.07 * Lb))]
            at = A.twig(rnd, leaves, M['bark'], q, count, .013, .005, lk)
            for t in (.4, .62, .82):
                P = at(t); az2 = az + rnd.choice((-1, 1)) * rnd.uniform(.5, 1.0); d2 = Vector((math.cos(az2) * math.cos(el), math.sin(az2) * math.cos(el), math.sin(el) * .7 + .12)).normalized(); L2 = Lb * rnd.uniform(.3, .45)
                A.twig(rnd, leaves, M['bark'], [P, P + d2 * L2 * .5 + Vector((0, 0, .03)), P + d2 * L2 + Vector((0, 0, -.03))], max(8, count // 3), .007, .003, lk * .95)


def leaf_sets():
    ol = A.olive_leaves()
    fa = RL.leaf_material('fic_leafA', (.030, .062, .026), (.105, .200, .062)); fb = RL.leaf_material('fic_leafB', (.050, .090, .035), (.140, .245, .080), under=True); fl = []
    for m in (fa, fb): fl.extend(RL.leaf_variants(.17, .074, 4, 'ficus', (m,)))
    return ol, fl


# ───────────── расстановка ─────────────
def extras(M):
    rnd = random.Random(33); ol, fl = leaf_sets(); P = os.environ.get('V2_PLANTS', '1') != '0'

    def tree(kind, x, y, **k):
        if P: plant_tree(M, fl if kind == 'ficus' else ol, rnd, x, y, kind, **k)
        else: planter(M, x, y, k.get('pot', .55), k.get('pot_h', .85), k.get('mat', 'terrazzo'))
    # — главный неф, передний план: стойка консультации справа с подсвеченным стеллажом за ней; слева — спокойно
    reception(M, 1.45, 9.4, rnd, '-y', w=2.3); podium(M, 3.4, 12.0, '-y', rnd, .55, .60, ('bottle', 'jar', 'pump'))
    tree('ficus', 4.7, 14.6, H=2.5, pot=.5, pot_h=.8, mat='tra', nb=9, count=17, lk=1.25, spread=1.0)
    # — дальний салон главного нефа (виден с камеры wide): стеллажи вдоль стен, подиумы, консультационный столик, витрина, стела
    shelving(M, -5.38, 29.3, '+x', rnd, w=3.2); shelving(M, 5.38, 29.3, '-x', rnd, w=3.2)
    podium(M, -3.1, 26.8, '-y', rnd, .58, .62, ('jar', 'bottle', 'tube', 'dropper')); podium(M, 3.1, 26.8, '-y', rnd, .58, .62, ('pump', 'jar', 'box', 'bottle'))
    consult(M, -3.4, 30.6, rnd, 'x'); vitrine(M, 4.3, 28.3, rnd, '+y')
    tree('ficus', -5.1, 33.4, H=2.6, pot=.52, pot_h=.8, mat='terrazzo', nb=9, count=17, lk=1.25, spread=1.0)
    tree('olive', 5.1, 24.6, H=2.9, pot=.55, pot_h=.9, mat='tra', nb=9, count=44, lk=1.9, spread=1.2)
    # — левый боковой неф: банкетка под зеркалом, подиум, стеллаж, ширма
    banquette(M, -10.85, 10.0, '+x', 2.6); wall_mirror(M, -1, 10.0); wall_mirror(M, -1, 16.0); podium(M, -9.6, 16.0, '+x', rnd, .6, .62, ('bottle', 'pump', 'jar', 'tube'))
    shelving(M, -11.2, 22.0, '+x', rnd, w=3.0); stela(M, -10.8, 27.9, '+x', rnd, ('box', 'pump', 'jar'), mat='ivory')
    tree('ficus', -9.7, 13.4, H=2.5, pot=.5, pot_h=.8, mat='terrazzo', nb=9, count=17, lk=1.25, spread=1.0)
    tree('olive', -8.3, 24.4, H=2.8, pot=.52, pot_h=.85, mat='tra', nb=8, count=40, lk=1.9, spread=1.15)
    if P:
        for yy in (13.0, 19.0, 31.0): vase_branch(M, ol, rnd, -10.95, yy, .5, H=.55, n=4, reach=1.2)
    # — правый боковой неф: консультационный столик, зеркала, банкетка, витрина, подиум, стеллаж, ширма
    consult(M, 9.0, 13.2, rnd, 'y'); wall_mirror(M, 1, 16.0); wall_mirror(M, 1, 22.6); banquette(M, 10.85, 22.6, '-x', 2.6); podium(M, 9.4, 16.8, '-x', rnd, .6, .62, ('jar', 'bottle', 'dropper', 'pump'))
    slat_screen(M, 'x', 20.3, 7.85, 10.95); vitrine(M, 9.0, 18.4, rnd, '-x', ('jar', 'bottle', 'tube', 'box')); shelving(M, 11.2, 27.8, '-x', rnd, w=3.0)
    tree('ficus', 9.2, 6.2, H=2.6, pot=.5, pot_h=.8, mat='tra', nb=9, count=17, lk=1.25, spread=1.0)
    tree('olive', 8.2, 25.2, H=2.9, pot=.55, pot_h=.9, mat='terrazzo', nb=9, count=44, lk=1.9, spread=1.2)
    if P:
        for yy in (7.0, 13.0, 25.0): vase_branch(M, ol, rnd, 10.95, yy, .5, H=.55, n=4, reach=1.2)


_b0 = A.build


def build2():
    M = _b0()
    for n in ('led_base_-1', 'floor_navy_-1'):                       # левая треть кадра main спокойная: без светящейся и тёмной линий вдоль пола слева
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n])
    extras(M); return M


_l0 = A.lights


def lights2():
    _l0(); k = float(os.environ.get('LKEY', 1.0)); ak = float(os.environ.get('AISLEK', 1.0))
    for sx in (-1, 1):
        for yy in (8.0, 20.0, 31.0): AA.area('v2_aisle_%d_%d' % (sx, yy), (sx * 8.9, yy, A.ZN - .35), (sx * 8.9, yy, 0.0), 1500 * ak * k, 3.6, 9.0, (1.0, .94, .85))
    AA.area('v2_fill_fore', (0.0, 5.0, 11.5), (0.0, 10.0, 0.0), 1700 * k, 9, 8, (1.0, .95, .88))
    AA.area('v2_fill_far', (0.0, 30.0, 11.5), (0.0, 29.0, 0.0), 1700 * k, 9, 8, (1.0, .95, .88))
    AA.area('v2_logo', (0.0, SY - 10.0, 7.5), (0.0, SY, 2.1), 1300 * k, 6, 3, (1.0, .95, .88))                   # мягкий свет на лак знака (отражения, без провала в чёрное)


A.CAMS['main'] = dict(loc=(-1.8, 3.0, 1.7), rot=(2.5, 0, 0), lens=26); A.CAMS['mobile'] = dict(loc=(-1.0, 10.0, 1.7), rot=(6.0, 0, 0), lens=20)
_c0 = A.cameras


def cameras2():
    cams = _c0(); cams['main'].data.shift_x = float(os.environ.get('SHIFTX', -.04)); return cams


A.materials = materials2; A.sculpture = sculpture2; A.build = build2; A.lights = lights2; A.cameras = cameras2

if __name__ == '__main__':
    A.main()
