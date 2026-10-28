#!/usr/bin/env python3
"""ASTREYA HOUSE: центральный зал (Blender / Cycles) — надстройка над hall_story.py (кадры, слои bg/jar/z, карты глубины, дорожки — тот же конвейер для сайта; здесь только сцена и сюжет).

Состав зала (метры; баночка, как и раньше, вдвое крупнее настоящей — герой кадра):
  • высокая стена из светлого травертина с тремя арочными проёмами: слева — комната с каменным стеллажом и продукцией (Бренды), в центре — большая арка с глубокой светлой комнатой и светящимся окном (Подбор), справа — тёмно-синий проём
    (Учебный центр); между проёмами — рифлёная пилястра; на стену падают диагональные тени окна и листьев;
  • перед стеной — низкий круглый стеклянный столик на каменном барабане: на нём баночка Астрея (она остаётся героем кадра) и раскрытый журнал (журнал — настоящий HTML на сайте, лежит поверх кадра на столике);
  • два мягких пуфа из букле, каменный постамент со скульптурой-шаром (память о знаке), ваза с пышным деревом, камни; пол — полированный травертин с отражением.
Сюжет (прогресс p 0…1 = прокрутка): баночка стоит на столике и раскручивается (полный оборот), камера идёт рядом с ней и плавно отъезжает, раскрывая арки и зал; с HOLD сцена держит последний кадр.
Команды те же, что у hall_story.py:
  python3 house_story.py still <кадр> out.png [--layer all|bg|jar|z] [--res 1600x900] [--samples 28] [--total 60] [--portrait]
  python3 house_story.py view out.png x,y,z tx,ty,tz линза            произвольный ракурс (осмотр зала)
  python3 house_story.py track out.json | camtrack out.json | anim <с> <по> outdir [--layer bg|jar|z]
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hall_story as H
from hall_story import BR, L, MT, PK, RK, S, SC, Vector, Euler, bpy

_f = lambda k, d: float(os.environ.get(k, d))
for _k, _v in (('HOUSE_FILLK', '.3'), ('HOUSE_WORLD', '.05'), ('HOUSE_SUN', '30'), ('HOUSE_SUNANG', '1.0'), ('HALL_EXP', '-1.25'), ('HOUSE_VX', '1.28'), ('HOUSE_VY', '1.0'),
               ('HALL_BOUNCE', '6'), ('HALL_TBOUNCE', '6'), ('HALL_GBOUNCE', '4'), ('HALL_ADAPT', '.03'), ('HALL_SHADOW_FROM', '0')):          # принятые значения света и качества (можно переопределить переменными окружения)
    os.environ.setdefault(_k, _v)
os.environ.setdefault('HALL_KEEP_STRAYS', '0')                  # «лишние» полоски-этикетки упаковок лежали в начале координат — здесь это перед столиком

# ---------------------------------------------------------------------------------------------------------------- геометрия зала (метры)
WALL_Y0, WALL_Y1 = 1.55, 1.90                      # стена: передняя и задняя грани
CEN = dict(cx=_f('HOUSE_CX', .42), rx=.42, zs=.54)       # большая арка (центр)
LFT = dict(cx=-1.12, rx=.32, zs=.48)                     # проход слева (Бренды)
RGT = dict(cx=1.98, rx=.32, zs=.48)                      # проход справа (Учебный центр)
TBL = dict(x=_f('HOUSE_TX', .62), y=_f('HOUSE_TY', -.14), r=.34, base_r=.13, top=.215, glass=.020)   # столик: центр, радиус стекла, радиус каменного барабана, высота верха стекла, толщина стекла
JAR_FINAL = Vector((TBL['x'] - .115, TBL['y'] + .035, TBL['top']))
H.JAR_S = 2.0
H.JAR_FINAL = JAR_FINAL
H.JAR_CENTER_Z = .0285 * H.JAR_S
H.POD = dict(x=TBL['x'], y=TBL['y'], r=TBL['r'], h=TBL['top'])
H.HOLD = _f('HALL_HOLD', .93)
CAM_END_L = (Vector((_f('HOUSE_CAMX', .46), _f('HOUSE_CAMY', -1.95), _f('HOUSE_CAMZ', .85))), Vector((_f('HOUSE_TGX', .40), 0.0, _f('HOUSE_TGZ', .46))), _f('HALL_LENS_L', 32.0))      # камера выше столика (~16° вниз): стекло читается эллипсом, на нём лежит журнал
CAM_END_P = (Vector((_f('HOUSE_PCX', .62), _f('HOUSE_PCY', -1.30), _f('HOUSE_PCZ', .95))), Vector((_f('HOUSE_PTX', .62), 0.0, _f('HOUSE_PTZ', .42))), _f('HALL_LENS_P', 26.0))
H.CAM_END_L, H.CAM_END_P = CAM_END_L, CAM_END_P
H.NEAR_P = _f('HALL_NEAR_P', 1.2)


def house_mats():
    M = _orig_mats()
    # мягкая ткань букле (пуфы): светлая, матовая, с крупным рельефом
    f = bpy.data.materials.new('hs_fabric'); f.use_nodes = True; nt = f.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (.93, .88, .79, 1); b.inputs['Roughness'].default_value = .97
    for k, v in (('Sheen Weight', .5), ('Sheen Roughness', .5)):
        if k in b.inputs: b.inputs[k].default_value = v
    tc = nt.nodes.new('ShaderNodeTexCoord'); ns = nt.nodes.new('ShaderNodeTexNoise'); ns.inputs['Scale'].default_value = 520.0; ns.inputs['Detail'].default_value = 3.0
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = .55; bm.inputs['Distance'].default_value = .004
    nt.links.new(tc.outputs['Object'], ns.inputs['Vector']); nt.links.new(ns.outputs['Fac'], bm.inputs['Height']); nt.links.new(bm.outputs['Normal'], b.inputs['Normal'])
    for n in M['floor'].node_tree.nodes:                                                                       # пол: без «водной ряби» — рельеф почти плоский, остаётся лёгкая шероховатость камня
        if n.type == 'BUMP':
            n.inputs['Strength'].default_value = _f('HOUSE_FLOOR_BUMP', .06)
    fb = next(n for n in M['floor'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    fb.inputs['Roughness'].default_value = _f('HOUSE_FLOOR_R', .30)
    for k_, v_ in (('Coat Weight', _f('HOUSE_FLOOR_COAT', .22)), ('Coat Roughness', .12)):
        if k_ in fb.inputs: fb.inputs[k_].default_value = v_
    M['fabric'] = f
    # стекло столика: прозрачное, чуть зеленоватый торец (толстое стекло), гладкое
    g = bpy.data.materials.new('hs_glass'); g.use_nodes = True; nt = g.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); gl = nt.nodes.new('ShaderNodeBsdfGlass'); gl.inputs['Color'].default_value = (.93, .98, .95, 1); gl.inputs['Roughness'].default_value = .02; gl.inputs['IOR'].default_value = 1.5
    tr_ = nt.nodes.new('ShaderNodeBsdfTransparent'); lp_ = nt.nodes.new('ShaderNodeLightPath'); mx_ = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp_.outputs['Is Shadow Ray'], mx_.inputs['Fac']); nt.links.new(gl.outputs['BSDF'], mx_.inputs[1]); nt.links.new(tr_.outputs['BSDF'], mx_.inputs[2]); nt.links.new(mx_.outputs['Shader'], out.inputs['Surface']); M['glass'] = g
    # тёмно-синяя штукатурка (проём справа)
    n_ = bpy.data.materials.new('hs_navy'); n_.use_nodes = True; b = next(n for n in n_.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (.060, .100, .190, 1); b.inputs['Roughness'].default_value = .62; M['navy'] = n_
    return M


_orig_mats = H.mats
H.mats = house_mats


def _arch_cut(wall, M, spec, depth_extra=.0):
    cut = SC.arch_solid('cut_%d' % int(spec['cx'] * 100), M['wall'], spec['cx'], spec['rx'], spec['zs'], WALL_Y0 - .05, WALL_Y1 + .05, 'w', z0=-.3)
    BR.boolean(wall, cut)


def build_room_left(M):
    """комната за левым проходом: задняя стена со стеллажом и продукцией (как раньше — те же упаковки), мягкий свет сверху"""
    yb = WALL_Y1 + 1.05
    back = SC.box('l_back', M['wall'], -2.9, -.45, yb, yb + .25, -.1, 2.4, 'w', 0)
    SC.box('l_sidew', M['inner'], -.45, -.30, WALL_Y1, yb + .25, -.1, 2.4, 'w', 0)
    SC.box('l_sidew2', M['inner'], -2.9, -2.75, WALL_Y1, yb + .25, -.1, 2.4, 'w', 0)
    H.ROOM_X = LFT['cx']
    H.build_shelf(M, yb)


def build_room_center(M):
    """глубокая светлая комната за большой аркой: боковые стены, задняя стена с аркой-окном, светящееся матовое стекло — «дневной свет в глубине»"""
    yb = WALL_Y1 + 2.0
    SC.box('c_back', M['inner'], -.55, 1.40, yb, yb + .25, -.1, 2.4, 'w', 0)
    SC.box('c_sidel', M['inner'], -.55, -.40, WALL_Y1, yb + .25, -.1, 2.4, 'w', 0)
    SC.box('c_sider', M['inner'], 1.25, 1.40, WALL_Y1, yb + .25, -.1, 2.4, 'w', 0)
    # окно-арка в глубине: матовое светящееся стекло
    fm = H.mat_frost()
    glass = SC.arch_solid('c_win', fm, CEN['cx'], .30, .50, yb - .01, yb + .02, 'p', z0=.0)
    for ob in (glass,):
        ob.visible_shadow = False
    g_ = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    g_.inputs['Emission Strength'].default_value = _f('HOUSE_GLOW', 2.6)
    S['c_glow'] = fm
    em = SC.mat_led('hs_c_led', 10.0, (1.0, .80, .52))
    SC.arch_frame('c_led', em, CEN['cx'], .30, .50, .014, yb - .015, yb - .006, 'w', z0=.0)
    # низкая каменная скамья и ваза у задней стены — «обжитая» глубина
    SC.box('c_bench', M['trav'], CEN['cx'] - .38, CEN['cx'] + .38, yb - .34, yb - .04, 0, .16, 'w', .01)
    BR.vase((CEN['cx'] + .30, yb - .22, .16), .26, .07, M['ceramic'])
    BR.olive((CEN['cx'] + .30, yb - .22, .16 + .26 + .02), .60, 22, .9, random.Random(41), lean=.10, **H.LEAF)


def build_room_right(M):
    """комната за правым проходом: тёмно-синяя стена (фирменный акцент) и тихий свет, консоль с вазой"""
    yb = WALL_Y1 + 1.1
    SC.box('r_back', M['navy'], 1.45, 3.4, yb, yb + .25, -.1, 2.4, 'w', 0)
    SC.box('r_sidel', M['navy'], 1.45, 1.60, WALL_Y1, yb + .25, -.1, 2.4, 'w', 0)
    SC.box('r_sider', M['navy'], 3.25, 3.40, WALL_Y1, yb + .25, -.1, 2.4, 'w', 0)
    led = SC.mat_led('hs_r_led', 6.0, (1.0, .78, .48))
    SC.arch_frame('r_led', led, RGT['cx'], RGT['rx'] - .05, RGT['zs'] - .03, .010, yb - .02, yb - .008, 'w', z0=.0)
    SC.box('r_console', M['trav'], RGT['cx'] - .26, RGT['cx'] + .26, yb - .30, yb - .04, 0, .20, 'w', .01)
    BR.vase((RGT['cx'] - .12, yb - .17, .20), .22, .06, M['ceramic'])


def house_architecture(M, portrait):
    wall = SC.box('wall', M['wall'], -3.4, 3.4, WALL_Y0, WALL_Y1, -.1, 2.6, 'w', 0)
    for spec in (LFT, CEN, RGT):
        _arch_cut(wall, M, spec)
    BR.apply_mods(wall)
    wall.data.materials.append(M['inner'])
    for pl in wall.data.polygons:                                                                          # внутри проёмов — известняк светлее и мягче
        c = pl.center
        for spec in (LFT, CEN, RGT):
            if abs(c.x - spec['cx']) <= spec['rx'] + .004 and c.z <= spec['zs'] + spec['rx'] + .004 and WALL_Y0 + .01 < c.y < WALL_Y1 - .01:
                pl.material_index = 1
    # арочные обрамления (узкий каменный ободок на лицевой стороне)
    for spec in (LFT, CEN, RGT):
        SC.arch_frame('frame_%d' % int(spec['cx'] * 100), M['trav'], spec['cx'], spec['rx'], spec['zs'], .035, WALL_Y0 - .03, WALL_Y0 + .005, 'w', z0=.0)
    SC.box('floor', M['floor'], -6.0, 6.0, -9.0, 5.5, -.3, 0, 'w', 0)
    build_room_left(M); build_room_center(M); build_room_right(M)
    # рифлёная пилястра между левым проходом и большой аркой, ещё одна — между аркой и правым проходом (вертикальные валики)
    for k, x0 in enumerate((-.62, 1.06)):
        for i in range(7):
            SC.cylinder('reed%d_%d' % (k, i), M['trav2'], x0 + i * .075, WALL_Y0 - .02, .036, 0.0, 1.9, 'w', seg=24, bev=0)
    S['led'] = None


def house_decor(M, portrait):
    """столик, пуфы, ваза с деревом, скульптура-шар на постаменте, камни, ветка слева (даёт пятна света от листьев)"""
    tx, ty = TBL['x'], TBL['y']
    SC.cylinder('tbl_base', M['trav'], tx, ty, TBL['base_r'], 0, TBL['top'] - TBL['glass'] - .004, 'p', seg=96, bev=.012)
    SC.cylinder('tbl_foot', M['trav2'], tx, ty, TBL['base_r'] + .035, 0, .022, 'p', seg=96, bev=.006)
    SC.cylinder('tbl_glass', M['glass'], tx, ty, TBL['r'], TBL['top'] - TBL['glass'], TBL['top'], 'p', seg=160, bev=.0035)
    # пуфы из букле
    for nm, (x, y, r, h) in (('pouf1', (-.18, -.62, .17, .15)), ('pouf2', (1.30, -.58, .14, .13))):
        ob = SC.cylinder(nm, M['fabric'], x, y, r, 0, h, 'p', seg=64, bev=.045)
        sub = ob.modifiers.new('ss', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    # постамент со скульптурой-шаром (знак «шара» не парит над баночкой, а стоит на камне)
    SC.box('sculpt_plinth', M['trav'], -.50, -.20, .80, 1.10, 0, .20, 'w', .008)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=.115, location=(-.35, .95, .20 + .115)); sp = bpy.context.object; sp.name = 'sculpt_sphere'
    bpy.ops.object.shade_smooth(); sp.data.materials.append(H.sphere_material())
    # камни-обломки (общие с остальным сайтом)
    def rock(rid, loc, rot, k=0, scale=1.0):
        s = RK.ROCKS[rid]; size = tuple(v * scale for v in s['size'])
        return RK.make_rock('%s_%d' % (rid, k), s['seed'] + k, size, s['kind'], s['cuts'], s['tint'], loc, rot, rough=s['rough'])
    rock('boulder-c', (1.42, -.95, 0), 25, 1, .50)
    rock('chunk-b', (-.62, -.34, 0), -40, 2, .55)
    # ваза с пышным деревом справа (то же дерево, что на главной: ствол виден от горлышка, листья не задевают камень) — у правого проёма
    vx, vy = _f('HOUSE_VX', 1.30), _f('HOUSE_VY', .42)
    BR.vase((vx, vy, 0), .42, .095, M['ceramic'])
    H.TXY = (vx, vy)
    H.build_tree(random.Random(77), (vx, vy, .36), H.TH, _f('HOUSE_TCR', .42), lk=1.3, per=84, nb=32)
    # ветка слева у края кадра
    BR.vase((-.95, -.95, 0), .26, .10, M['ceramic'])
    BR.olive((-.95, -.95, .26 + .03), .52, 28, 1.12, random.Random(3), lean=.31, **H.LEAF)


class HouseSolids(H.Solids):
    """твёрдые тела зала: по ним листья дерева проверяются на прохождение сквозь камень и стекло"""
    def __init__(self):
        from mathutils.bvhtree import BVHTree
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        names = ['wall', 'l_back', 'c_back', 'r_back', 'sculpt_plinth', 'sculpt_sphere', 'tbl_base', 'tbl_glass', 'pouf1', 'pouf2'] + ['reed%d_%d' % (k, i) for k in range(2) for i in range(7)]
        self.items = []
        for ob in (bpy.data.objects.get(n) for n in names):
            if ob is None or ob.type != 'MESH':
                continue
            self.items.append((ob.matrix_world.inverted(), BVHTree.FromObject(ob, dg)))


def apply_house_frame(i, total, portrait):
    p = i / max(1, total - 1)
    S['frame_i'] = i
    st = H.frame_state(p, portrait)
    H.place_camera(st['pos'], st['tgt'], st['lens'], portrait)
    S['jg'].location = st['jar']
    S['jg'].rotation_euler = Euler((0, 0, math.radians(st['yaw'])), 'XYZ')
    ctr = st['jar'] + Vector((0, 0, H.JAR_CENTER_Z))
    to_cam = (st['pos'] - ctr).normalized(); right = to_cam.cross(Vector((0, 0, 1))).normalized()
    for name, loc in (('jar_fill', ctr + to_cam * .75 - right * .30 + Vector((0, 0, .32))), ('jar_rim', ctr - to_cam * .55 + right * .15 + Vector((0, 0, .55)))):
        lo = S.get(name)
        if lo is not None:
            lo.location = loc; lo.rotation_euler = (ctr - loc).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()


def house_frame_state(p, portrait):
    """баночка неподвижна на столике и раскручивается; камера идёт рядом и плавно отъезжает к общему плану (раскрывает арки и зал)"""
    sm, lerp = H.sm, H.lerp
    pp = min(p, H.HOLD) / H.HOLD
    jar = JAR_FINAL.copy(); ctr = jar + Vector((0, 0, H.JAR_CENTER_Z))
    near = lerp(_f('HOUSE_NEAR0', 1.25), 1.0, sm(pp / .5))
    if portrait:
        near *= lerp(H.NEAR_P, 1.0, sm(pp / H.NEAR_P_END))
    az = math.radians(lerp(_f('HOUSE_AZ0', 34), _f('HOUSE_AZ1', 0), sm(pp / .62)))
    el = math.radians(lerp(_f('HOUSE_EL0', 4), 8, sm(pp / .5)))
    follow_pos = ctr + near * Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    main_pos, main_tgt, main_lens = CAM_END_P if portrait else CAM_END_L
    w = sm((pp - .16) / .82)
    pos = follow_pos.lerp(main_pos, w); tgt = ctr.lerp(main_tgt, w)
    lens = math.exp(lerp(math.log(85.0), math.log(main_lens), w))
    if portrait:
        tgt = H.keep_in_frame(pos, tgt, lens, ctr)
    face = _f('HALL_FACE', -3.5) + math.degrees(math.atan2(pos.x - jar.x, jar.y - pos.y))
    yaw = face + H.SPIN * sm((pp - .06) / .56)
    return dict(jar=jar, yaw=yaw, pos=pos, tgt=tgt, lens=lens, glow=sm((pp - .30) / .55))


def house_cam_track(n, portrait):
    out = {'p': [], 'pos': [], 'tgt': [], 'lens': [], 'jar': [], 'yaw': [], 'glow': []}
    for j in range(n):
        p = j / (n - 1); st = H.frame_state(p, portrait)
        out['p'].append(round(p, 6)); out['pos'].append([round(v, 5) for v in st['pos']]); out['tgt'].append([round(v, 5) for v in st['tgt']])
        out['lens'].append(round(st['lens'], 4)); out['jar'].append([round(v, 5) for v in st['jar']]); out['yaw'].append(round(st['yaw'], 4)); out['glow'].append(round(st['glow'], 5))
    out['jarScale'] = .01 * H.JAR_S; out['jarCenterZ'] = H.JAR_CENTER_Z; out['dispRange'] = list(H.DEPTH_DISP)
    return out


def house_info(total, portrait):
    """дорожки для сайта: рамки баночки по кадрам, положение стеклянного столика и проходов в готовом кадре (доли кадра) — по ним на сайте лежат журнал и кнопки-проходы"""
    out = {'rects': [], 'sphere': [.5, .5, 0.0], 'table': None, 'doors': {}}
    for i in range(total):
        H.apply_frame(i, total, portrait); out['rects'].append(H.jar_rect())
    sc = bpy.context.scene; cam = S['cam']
    c = Vector((TBL['x'], TBL['y'], TBL['top'])); x, y = H.proj(sc, cam, c); right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)); x1, _ = H.proj(sc, cam, c + right * TBL['r'])
    out['table'] = [round(x, 5), round(y, 5), round(2 * abs(x1 - x), 5)]                      # центр стекла столика и диаметр — доли кадра (по нему на сайте лежит журнал)
    for key, spec in (('brands', LFT), ('finder', CEN), ('academy', RGT)):
        pts = [(spec['cx'] - spec['rx'], 0.0), (spec['cx'] + spec['rx'], 0.0), (spec['cx'], spec['zs'] + spec['rx']), (spec['cx'] - spec['rx'], spec['zs']), (spec['cx'] + spec['rx'], spec['zs'])]
        xs, ys = zip(*[H.proj(sc, cam, Vector((px, WALL_Y0, pz))) for px, pz in pts])
        l, r, t, b = min(xs), max(xs), min(ys), max(ys)
        out['doors'][key] = [round(l, 4), round(t, 4), round(r - l, 4), round(b - t, 4)]
    return out


def _noop_shadow_branches():
    """ветки вне кадра, дающие пятна света от листьев на стене (как раньше) — слева-спереди от стены"""
    for loc, h, n, sc_, seed, lean in (((-1.9, .20, .0), .9, 30, 1.9, 21, .5), ((-2.4, -.4, .0), .8, 26, 1.7, 22, .6)):
        BR.olive(loc, h, n, sc_, random.Random(seed), lean=lean, **H.LEAF_SHADOW)
        for ob in bpy.data.objects:
            pass


def house_lights(M):
    """свет как в предыдущем зале (солнце, заполняющий, окно, софтбоксы баночки) + переплёт окна: диагональные тени на стене и полу, как на странице каталога"""
    _orig_lights(M)
    sun = bpy.data.objects.get('sun')
    d = Vector((_f('HOUSE_SUNX', .58), _f('HOUSE_SUNY', .70), _f('HOUSE_SUNZ', -.42))).normalized()
    sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sun.location = Vector((.4, .5, .5)) - d * 9.0
    sun.data.energy = _f('HOUSE_SUN', 16.0); sun.data.angle = math.radians(_f('HOUSE_SUNANG', 1.6))
    for lo in bpy.data.objects:
        if lo.type == 'LIGHT' and lo.name in ('fill', 'window', 'top'):
            lo.data.energy *= _f('HOUSE_FILLK', .55)
    bg_ = bpy.context.scene.world.node_tree.nodes['Background']; bg_.inputs['Strength'].default_value = _f('HOUSE_WORLD', .08)
    # светлый «потолок» над залом (камере и теням не виден): мягкий верхний свет и светлые отражения в стекле столика и полированном полу (без него стекло отражало чёрное небо)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(.4, .4, 3.4)); ce = bpy.context.object; ce.name = 'hs_ceiling'; ce.scale = (14, 14, 1)
    cm = bpy.data.materials.new('hs_ceiling'); cm.use_nodes = True; nt = cm.node_tree; nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, .93, .80, 1); em.inputs['Strength'].default_value = _f('HOUSE_CEIL', 1.1)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs['Emission'], out.inputs['Surface']); ce.data.materials.append(cm)
    ce.visible_camera = False; ce.visible_shadow = False
    if os.environ.get('HOUSE_GOBO', '1') == '1':
        center = Vector((_f('HOUSE_WX', .30), _f('HOUSE_WY', .50), _f('HOUSE_WZ', .45))) - d * 7.0
        ex = d.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(d).normalized()
        mat = SC.mat_simple('hs_frame', (.1, .1, .1))
        def bar(u0, v0, u1, v1):
            bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object
            b.scale = (abs(u1 - u0), 0.05, abs(v1 - v0)); b.location = center + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2)
            b.rotation_euler = __import__('mathutils').Matrix((ex, d, ey)).transposed().to_euler(); b.data.materials.append(mat); b.visible_camera = False; b.visible_glossy = False; b.visible_transmission = False
        u_min, u_max, v_min, v_max = -_f('HOUSE_WU', 2.2), _f('HOUSE_WU', 2.2), -_f('HOUSE_WV', 1.2), _f('HOUSE_WV', 1.2)
        import numpy as np
        for u in np.linspace(u_min, u_max, int(_f('HOUSE_NU', 4))): bar(u - .06, v_min, u + .06, v_max)
        for v in np.linspace(v_min, v_max, 3): bar(u_min, v - .06, u_max, v + .06)
        bar(u_min - 4, v_max, u_max + 4, v_max + 4); bar(u_min - 4, v_min - 4, u_max + 4, v_min); bar(u_min - 4, v_min, u_min, v_max); bar(u_max, v_min, u_max + 4, v_max)


_orig_lights = H.build_lights
H.build_lights = house_lights
H.build_architecture = house_architecture
H.build_decor = house_decor
H.apply_frame = apply_house_frame
H.frame_state = house_frame_state
H.cam_track = house_cam_track
H.info = house_info
H.Solids = HouseSolids


if __name__ == '__main__':
    H.main()
