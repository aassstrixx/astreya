"""Экспозиция каталога по референсу заказчика (фото-образец «Астрея»): большой круглый стол из травертина с полированной столешницей; слева — каменная ваза-шар с веткой оливы и два стеклянных шара;
по центру — ступенчатые блоки и диски из травертина разной формы и высоты, на них — товары (товары — живой HTML, подиумы запечены в сцену); справа вдали — арка с тёмно-синей тканевой панелью и знаком «Астреи»,
ниша со стеклянными полками и тёплой подсветкой, низкая белая стойка с небольшими флаконами; слева — гладкая стена с пятнами солнца и тенями листьев.
Положения заданы в ПИКСЕЛЯХ ХОЛСТА 1536×1024 и глубине d (расстояние от камеры) и переводятся в мир через камеру сцены (0,−12,0,9), объектив 50 мм: X = (x − 768)·d / 2133, Y = d − 12, Z = 0,9 − (y − 512)·d / 2133.
Единицы сцены: 1 см упаковки = UCM (0,036) ед.; камера низкая — как на образце (чуть выше столешницы), верх подставки читается тонким эллипсом."""
import bpy, math, os, random
from mathutils import Vector, Matrix
import materials as MT
import realism as RL
import decor

UCM = float(os.environ.get('UCM', .036))
FX = 1536.0 * 50.0 / 36.0
CAMZ = .9
TZ = .34                                                   # высота столешницы
cm = lambda v: v * UCM

def world(cx, d, z=None):
    """холст-x и глубина d → мировые X, Y (z задаётся отдельно)"""
    return ((cx - 768.0) * d / FX, d - 12.0)

# ---------------------------------------------------------------- подиумы и места товаров
# kind, холст-x центра, глубина d центра, ширина/диаметр (см), глубина (см, только box), высота (см), z0 (см над столом: диск на диске), оттенок, поворот
PLINTHS = [
    ('box', 603, 7.70, 15.5, 13.0, 6.3, 0, (.92, .84, .70), .05),            # A: низкий передний блок слева
    ('box', 645, 8.40, 17.5, 13.5, 12.4, 0, (.88, .80, .66), -.04),          # B: высокий блок позади
    ('box', 905, 9.60, 13.0, 11.0, 15.0, 0, (.90, .82, .68), .03),           # C: высокий блок позади дисков, справа от баночки — под высокой помпой (был полоской между B и дисками)
    ('disc', 828, 7.42, 24.0, 0, 6.0, 0, (.90, .83, .70), 0),                # D1: нижний диск
    ('disc', 831, 7.52, 17.0, 0, 5.0, 6.0, (.93, .86, .73), 0),              # D2: верхний диск
    ('disc', 964, 7.55, 10.5, 0, 7.0, 0, (.91, .84, .70), 0),                # D3
    ('disc', 1056, 7.55, 10.5, 0, 7.8, 0, (.89, .82, .68), 0),               # D4
    ('box', 1168, 8.10, 12.5, 11.0, 5.2, 0, (.90, .82, .68), -.06),          # E: дальний правый блок
    ('box', 1292, 8.00, 11.0, 10.0, 4.4, 0, (.91, .83, .69), .05),           # F: малый блок справа — своя подставка для малого предмета
]
# место товара: подиум, смещение центра основания (см) по x и по глубине (+ вглубь), порядок «самых заметных» — в SLOT_RANK
SLOTS = [
    (0, -1.8, 0.0), (1, 0.0, 0.0), (2, 0.0, 0.0), (4, 0.0, 0.0), (8, 0.0, 0.0), (5, 0.0, 0.0), (6, 0.0, 0.0), (7, 0.0, 0.0),
]

def plinth_pos(i):
    k, cx, d, w, dp, h, z0, tint, yaw = PLINTHS[i]
    X, Y = world(cx, d); return X, Y

def slot_world(si):
    pi, dx, dy = SLOTS[si]; k, cx, d, w, dp, h, z0, tint, yaw = PLINTHS[pi]
    X, Y = plinth_pos(pi); return (X + cm(dx), Y + cm(dy), TZ + cm(z0 + h))


def build(S, sc, M):
    """S — модуль scene (общие помощники: mk, box, cylinder, mesh_obj, arch_solid, arch_frame, link, E3, val, mat_simple, mat_led)"""
    import time; t0 = [time.time()]
    def T(l): print('  [expo] %s +%.1f с' % (l, time.time() - t0[0]), flush=True); t0[0] = time.time()
    E3 = S.E3; link = S.link; mesh_obj = S.mesh_obj
    wallc = E3('WALLC', (.86, .69, .48)); wave = float(os.environ.get('WAVE', 2.0))
    # ---------- материалы
    M['wall'] = MT.lime_plaster('wall_plaster', wallc, wave=wave)
    M['wall2'] = MT.lime_plaster('wall_back', E3('BACKC', (.78, .66, .49)), wave=wave)
    M['frame'] = MT.limestone('arch_frame', (.97, .92, .82))
    M['white'] = S.mat_simple('counter_white', (.94, .92, .87), .28)
    M['floor'] = MT.limestone_floor('floor', E3('FLOORT', (.50, .39, .28)), 2.4, rough=.30)                         # пол в нише тёмный, тёплый и с блеском: читается как пол, а не как белая стойка
    M['led'] = S.mat_led('led', float(os.environ.get('LED', 26.0))); M['glass'] = MT.satin_glass('niche_glass')
    tsd = MT.travertine('tbl_side', E3('TBLC', (.80, .66, .46)), 1.0, .9, 2.6, honed=True)
    ttp = MT.travertine('tbl_top', E3('TBLC', (.80, .66, .46)), 1.0, .5, 1.6, honed=False)
    b_ = next(n for n in ttp.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b_.inputs['Roughness'].default_value = float(os.environ.get('TBL_ROUGH', .07))
    for k_, v_ in (('Coat Weight', .55), ('Coat Roughness', .035)):
        if k_ in b_.inputs: b_.inputs[k_].default_value = v_
    # --- пол, стена с аркой, пилястра, задняя стена
    S.box('floor', M['floor'], -16, 16, -16, 8, -0.5, 0.0, 'shell')
    wall = S.box('wall', M['wall'], -10, 10, 1.15, 1.6, 0.0, 8.0, 'shell')
    d_w = 13.3
    BZ = float(os.environ.get('BGZ', -.40))                                                                  # камера поднялась на .5 — дальние объекты сдвинуты вниз, чтобы арка и панель остались на прежних строках холста
    AR = {'cx': 2.45, 'rx': 1.24, 'zs': 2.30 + BZ}
    cut = S.arch_solid('cut1', M['wall'], AR['cx'], AR['rx'], AR['zs'], 1.0, 1.8, 'shell', z0=-.1)
    bm = wall.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'; cut.hide_render = True; cut.display_type = 'WIRE'
    bv = wall.modifiers.new('bev', 'BEVEL'); bv.width = .012; bv.segments = 3; bv.limit_method = 'ANGLE'
    S.box('back', M['wall2'], -2.0, 9.0, 3.8, 4.2, 0.0, 7.0, 'shell')
    # пилястра у края ниши (светлый вертикальный брус, ловит солнце) и цоколь
    S.box('pilaster', M['frame'], 0.18, 0.74, .86, 1.16, 0.0, 8.0, 'ring', bev=.01)
    base_ = S.box('plinth', MT.travertine('trav_base', (.86, .77, .63), 1.1, 1.0), -10, 10, .98, 1.16, 0.0, .40, 'shell', bev=.01)
    cut2 = S.arch_solid('cut2', M['wall'], AR['cx'], AR['rx'], AR['zs'], .90, 1.8, 'shell', z0=-.1)                  # цоколь стены тоже прорезан аркой: без белой «ступени» в проёме
    bmp = base_.modifiers.new('cut', 'BOOLEAN'); bmp.operation = 'DIFFERENCE'; bmp.object = cut2; bmp.solver = 'EXACT'; cut2.hide_render = True; cut2.display_type = 'WIRE'
    # толстая арочная рама с тёплой светодиодной кромкой по внутреннему контуру
    fr = S.arch_frame('arc_frame', M['frame'], AR['cx'], AR['rx'], AR['zs'], .30, .70, 1.16, 'ring'); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .012; fb.segments = 3; fb.limit_method = 'ANGLE'
    S.arch_frame('arc_led', M['led'], AR['cx'], AR['rx'] - .03, AR['zs'] - .03, .028, 1.12, 1.16, 'ring')
    T('стена, арка, пилястра')
    # --- синяя тканевая панель в дальней арке: замша, знак «Астреи» (без надписи) белой печатью, тонкая рама-обод
    PN = {'cx': 3.40, 'rx': .78, 'zs': 2.80 + BZ}
    fab = RL.fabric_suede('insert_navy', E3('INSC', (.022, .050, .150)), float(os.environ.get('INS_K', 14.0)))
    S.arch_solid('panel', fab, PN['cx'], PN['rx'], PN['zs'], 3.72, 3.76, 'shell', z0=-.3)
    rim = S.arch_frame('panel_rim', M['frame'], PN['cx'], PN['rx'], PN['zs'], .30, 3.52, 3.78, 'shell', z0=-.3); rb = rim.modifiers.new('bev', 'BEVEL'); rb.width = .01; rb.segments = 3; rb.limit_method = 'ANGLE'
    S.arch_frame('panel_led', M['led'], PN['cx'], PN['rx'] + .006, PN['zs'] + .006, .02, 3.70, 3.78, 'shell', z0=-.3)
    lg = bpy.data.materials.new('insert_mark'); lg.use_nodes = True; nt = lg.node_tree; bs = nt.nodes['Principled BSDF']; tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = bpy.data.images.load(os.path.join(S.HERE, 'astreya-mark-white.png')); tx.interpolation = 'Cubic'; tx.extension = 'CLIP'
    nt.links.new(tx.outputs['Color'], bs.inputs['Base Color']); nt.links.new(tx.outputs['Alpha'], bs.inputs['Alpha']); S.val(bs, .78, 'Roughness'); S.val(bs, .0, 'Specular IOR Level', 'Specular'); S.val(bs, .4, 'Sheen Weight')
    S.val(bs, float(os.environ.get('MARK_E', .9)), 'Emission Strength'); bs.inputs['Emission Color'].default_value = (1, 1, 1, 1)
    mw = float(os.environ.get('MARK_W', .66)); mh = mw * 1202 / 1261; mz = float(os.environ.get('MARK_Z', 2.10)) + BZ; mx = PN['cx']
    mk = mesh_obj('panel_mark', [(mx - mw / 2, 3.70, mz), (mx + mw / 2, 3.70, mz), (mx + mw / 2, 3.70, mz + mh), (mx - mw / 2, 3.70, mz + mh)], [(0, 1, 2, 3)], lg, 'shell')
    uv = mk.data.uv_layers.new(name='UVMap')
    for poly in mk.data.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices): uv.data[li].uv = ((0, 0), (1, 0), (1, 1), (0, 1))[vi]
    # --- ниша слева от панели: стеклянные полки с подсветкой и небольшие флаконы (фон спокойный)
    shz = (.74 + BZ, 1.54 + BZ, 2.28 + BZ); nx0, nx1 = 1.26, 2.06
    for k, z in enumerate(shz):
        S.box('shelf%d' % k, M['glass'], nx0, nx1, 3.42, 3.74, z, z + .035, 'niche')
        S.box('shled%d' % k, M['led'], nx0 + .02, nx1 - .02, 3.70, 3.74, z - .018, z - .002, 'niche')
    S.box('niche_back', M['wall2'], nx0 - .03, nx1 + .03, 3.76, 3.80, -.3, 2.9 + BZ, 'niche')
    import packs as PK
    pm = PK.M(); rnd = random.Random(11)
    def mini(kind, brand, x, y, z, k, yaw=0.0, grp='niche'):
        objs, _ = PK.build(kind, False, pm, brand); root = bpy.data.objects.new('pk_' + kind, None); bpy.context.collection.objects.link(root); root['grp'] = grp
        root.location = (x, y, z); root.rotation_euler = (0, 0, yaw); root.scale = (k, k, k)
        for o in objs: o.parent = root; o['grp'] = grp
    nk = float(os.environ.get('NICHE_K', 1.7))
    for (kind, br, x, yw) in (('pump', 'dermatime', 1.45, .3), ('jar', 'endocare', 1.78, -.2)): mini(kind, br, x, 3.58, shz[0] + .035, nk, yw)
    for (kind, br, x, yw) in (('bottle', 'heliocare', 1.40, .2), ('dropper', 'endocare', 1.72, .1), ('bottle', 'dermatime', 1.95, -.3)): mini(kind, br, x, 3.58, shz[1] + .035, nk, yw)
    for (kind, br, x, yw) in (('dropper', 'neoretin', 1.45, .1), ('pump', 'biretix', 1.75, -.25), ('box', 'dermatime', 1.98, .0)): mini(kind, br, x, 3.58, shz[2] + .035, nk, yw)
    T('панель и ниша')
    # --- большой овальный стол (вид спереди — широкая дуга): полированная столешница с мягким скруглением кромки и массивный барабан из травертина
    RX = float(os.environ.get('TABLE_RX', 4.6)); RY = float(os.environ.get('TABLE_RY', 2.25)); tcx = float(os.environ.get('TABLE_CX', 0.9)); tcy = -5.6 + RY; k_ = RY / RX
    nt2 = ttp.node_tree
    for n_ in nt2.nodes:
        if n_.type == 'BUMP': n_.inputs['Strength'].default_value = float(os.environ.get('TBL_BUMP', .10))                                              # полированный камень: микрорельеф почти не рассеивает отражения
    drum = [(0.0, -.5), (RX - .02, -.5), (RX - .02, TZ - .11), (0.0, TZ - .11)]
    top = [(0.0, TZ - .11), (RX, TZ - .11), (RX, TZ - .05), (RX - .022, TZ - .016), (RX - .06, TZ), (0.0, TZ)]
    decor.lathe('tbl_drum', drum, tsd, 'dais', cx=tcx, cy=tcy, z=0.0, seg=256, sy=k_, smooth=True)
    decor.lathe('tbl_top', top, ttp, 'dais', cx=tcx, cy=tcy, z=0.0, seg=256, sy=k_, smooth=True)
    T('стол')
    # --- подиумы: блоки с фасками (края камня слегка сколоты — фаска неровная) и диски; своя фактура у каждого
    for i, (kind, cx, d, w, dp, h, z0, tint, yaw) in enumerate(PLINTHS):
        X, Y = plinth_pos(i); mat = MT.travertine('pl_stone%d' % i, (tint[0] * .84, tint[1] * .72, tint[2] * .54), .8 + .15 * (i % 3), 1.5, 1.8 + .3 * (i % 2), honed=True)
        z_lo = TZ + cm(z0); z_hi = TZ + cm(z0 + h)
        if kind == 'box':
            ob = S.box('plinth%d' % i, mat, -cm(w) / 2, cm(w) / 2, -cm(dp) / 2, cm(dp) / 2, 0.0, cm(h), 'dais', bev=cm(.35)); ob.location = (X, Y, z_lo); ob.rotation_euler = (0, 0, yaw)
        else:
            ob = S.cylinder('plinth%d' % i, mat, X, Y, cm(w) / 2, z_lo, z_hi, 'dais', seg=160, bev=cm(.35))
    T('подиумы')
    # --- стеклянные шары на столе (чистое стекло с преломлением)
    gm = bpy.data.materials.new('crystal'); gm.use_nodes = True; gb = gm.node_tree.nodes['Principled BSDF']
    S.val(gb, (1, 1, 1, 1), 'Base Color'); S.val(gb, 0.0, 'Roughness'); S.val(gb, 1.0, 'Transmission Weight', 'Transmission'); S.val(gb, 1.5, 'IOR'); S.val(gb, 0.5, 'Specular IOR Level', 'Specular')
    for (nm, cx, d, R) in (('ball1', 532, 6.85, 3.6), ('ball2', 1052, 6.85, 2.6)):
        X, Y = world(cx, d); ob = decor.ball(nm, gm, X, Y, TZ + cm(R), cm(R), 'dais', seg=96, n=48)
    T('шары')
    # --- ваза-шар из пористого травертина и ветка оливы
    vx, vy = world(392, 7.25); VR = float(os.environ.get('VASE_R', .38)); vz = TZ + VR * .93
    vm = MT.travertine('vase_stone', (.94, .84, .68), .45, 2.8, 1.8, honed=False)
    nt_ = vm.node_tree; pb = nt_.nodes['Principled BSDF']; tcn = nt_.nodes.new('ShaderNodeTexCoord'); nz1 = nt_.nodes.new('ShaderNodeTexNoise'); nz1.inputs['Scale'].default_value = 26.0; nz1.inputs['Detail'].default_value = 9.0; nz1.inputs['Roughness'].default_value = .68
    nz2 = nt_.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 7.0; nz2.inputs['Detail'].default_value = 5.0
    nt_.links.new(tcn.outputs['Object'], nz1.inputs['Vector']); nt_.links.new(tcn.outputs['Object'], nz2.inputs['Vector'])
    hh = MT._math(nt_, 'ADD', MT._math(nt_, 'MULTIPLY', nz1.outputs['Fac'], .75), MT._math(nt_, 'MULTIPLY', nz2.outputs['Fac'], .55)); bp2 = nt_.nodes.new('ShaderNodeBump'); bp2.inputs['Strength'].default_value = 1.2; bp2.inputs['Distance'].default_value = .028
    nt_.links.new(hh, bp2.inputs['Height'])
    if pb.inputs['Normal'].links: nt_.links.new(pb.inputs['Normal'].links[0].from_socket, bp2.inputs['Normal'])
    nt_.links.new(bp2.outputs['Normal'], pb.inputs['Normal'])
    prof = [(0.0, -VR)]
    n = 40
    for i in range(1, n):
        a = -math.pi / 2 + math.pi * i / n * .925; prof.append((VR * math.cos(a), VR * math.sin(a)))
    a_end = -math.pi / 2 + math.pi * .925; neck = VR * math.cos(a_end); zt = VR * math.sin(a_end)
    prof += [(neck * .96, zt + .012), (neck * .72, zt + .02), (neck * .55, zt + .0), (neck * .52, zt - .12), (0.0, zt - .12)]
    vase = decor.lathe('vase', prof, vm, 'plant', cx=vx, cy=vy, z=vz, seg=96, smooth=True)
    sub = vase.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2                                                          # сначала сглаживание, затем неровность: силуэт шара чуть «рубленый», как у настоящего камня
    dm = vase.modifiers.new('rough', 'DISPLACE'); tx_ = bpy.data.textures.new('vase_dsp', 'CLOUDS'); tx_.noise_scale = .10; tx_.noise_depth = 3; dm.texture = tx_; dm.strength = .02; dm.mid_level = .5
    T('ваза')
    olive(S, Vector((vx, vy, vz + zt - .02)), 'plant')
    # --- тени листьев на стене и столе: ветки вне кадра на пути луча солнца
    gobo(S)
    T('ветки')


def olive(S, base, grp='plant'):
    """ветка оливы по образцу: тонкие дуги от горлышка вазы — влево и вверх, вверх и вправо над композицией, пары узких серебристо-зелёных листьев (RL.leaf_mesh) с поворотом пары на 90° от узла к узлу"""
    rnd = random.Random(21)
    mats = [RL.leaf_material('olA', (.055, .105, .028), (.19, .29, .07), silver=(.50, .56, .42)), RL.leaf_material('olB', (.075, .125, .035), (.24, .34, .09), silver=(.52, .58, .44))]
    lk = float(os.environ.get('LEAF_K', 1.0)); LV = RL.leaf_variants(.120 * lk, .038 * lk, 6, 'olive', mats)
    stem = S.mk('stem'); S.val(stem[2], (.30, .25, .16, 1), 'Base Color'); S.val(stem[2], .62, 'Roughness')
    def cr(P, n=60):
        out = []
        for i in range(n + 1):
            t = i / n * (len(P) - 1); k = min(int(t), len(P) - 2); u = t - k
            p0, p1, p2, p3 = P[max(k - 1, 0)], P[k], P[k + 1], P[min(k + 2, len(P) - 1)]
            out.append(.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
        return out
    def stem_leaves(P, pairs, rad, scale=1.0, tip=True, off=.10, shadow=True):
        pts = cr(P); cu = bpy.data.curves.new('st', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
        cu.bevel_depth = rad; cu.bevel_resolution = 2; cu.materials.append(stem[0]); so_ = S.link(bpy.data.objects.new('st', cu), grp); so_.visible_shadow = shadow
        n = len(pts) - 1
        for i in range(pairs):
            t = off + (1 - off) * i / max(1, pairs - 1); k = min(int(t * n), n - 1); pos = pts[k].lerp(pts[k + 1], t * n - k); d = (pts[min(k + 2, n)] - pts[k]).normalized()
            for dv in RL.pair_dirs(d, i, rnd):
                ob = bpy.data.objects.new('lf', rnd.choice(LV)); S.link(ob, grp); ob.visible_shadow = shadow; s = scale * (1.12 - .45 * t) * (.82 + rnd.random() * .34); ob.scale = (s,) * 3; ob.location = pos
                RL.orient(ob, dv, rnd, tint=RL.tint_for(t, rnd))
        if tip:
            ob = bpy.data.objects.new('lf', LV[0]); S.link(ob, grp); ob.scale = (.8 * scale,) * 3; ob.location = pts[-1]; RL.orient(ob, (pts[-1] - pts[-3]).normalized(), rnd, roll=.2, tint=RL.tint_for(1, rnd))
        return pts
    B = base; V = lambda x, y, z: B + Vector((x, y, z))
    heights = float(os.environ.get('OLIVE_H', 1.0)); spread = float(os.environ.get('OLIVE_W', .92))
    shoots = [
        # (контрольные точки, число пар, толщина)
        ([V(0, 0, 0), V(-.07, .00, .30 * heights), V(-.30 * spread, .04, .70 * heights), V(-.62 * spread, .08, 1.02 * heights), V(-.98 * spread, .14, 1.12 * heights)], 40, .0075),
        ([V(0, 0, 0), V(-.02, .0, .35 * heights), V(-.12 * spread, .03, .80 * heights), V(-.26 * spread, .08, 1.20 * heights), V(-.34 * spread, .12, 1.48 * heights)], 42, .007),
        ([V(0, 0, 0), V(.03, .0, .30 * heights), V(.06, .03, .72 * heights), V(.20 * spread, .07, 1.08 * heights), V(.46 * spread, .11, 1.32 * heights)], 42, .007),
        ([V(0, 0, 0), V(.06, .0, .24 * heights), V(.30 * spread, .02, .62 * heights), V(.72 * spread, .06, .96 * heights), V(1.18 * spread, .10, 1.04 * heights), V(1.52 * spread, .14, .86 * heights)], 52, .0075),
        ([V(0, 0, 0), V(.02, .0, .22 * heights), V(.20 * spread, .04, .58 * heights), V(.52 * spread, .09, .80 * heights), V(.86 * spread, .12, .76 * heights), V(1.08 * spread, .15, .58 * heights)], 28, .0065),
        ([V(0, 0, 0), V(-.04, .0, .20 * heights), V(-.22 * spread, .05, .50 * heights), V(-.52 * spread, .09, .64 * heights), V(-.86 * spread, .13, .58 * heights), V(-1.05 * spread, .16, .38 * heights)], 28, .0065),
        ([V(0, 0, 0), V(.02, .0, .38 * heights), V(-.04, .06, .86 * heights), V(-.02, .10, 1.28 * heights), V(.08 * spread, .14, 1.52 * heights)], 28, .0065),
    ]
    for P, pairs, rad in shoots:
        pts = stem_leaves(P, pairs, rad)
        for fr_ in (.45, .62, .78):                                                                                   # боковые веточки
            k = int(fr_ * (len(pts) - 1)); p = pts[k]; d = (pts[min(k + 3, len(pts) - 1)] - pts[k]).normalized(); side = Vector((d.y, -d.x, 0)).normalized() * rnd.choice((-1, 1)) if (d.x or d.y) else Vector((1, 0, 0))
            tw = [p, p + d * .12 + side * .10 + Vector((0, .0, .05)), p + d * .26 + side * .22 + Vector((0, .02, .02)), p + d * .38 + side * .30 + Vector((0, .04, -.06))]
            stem_leaves(tw, 9, .004, .92, off=.08)


    if os.environ.get('FORE', '1') == '1':                                                                          # ветка на переднем плане у самой камеры: сильно размыта (малая глубина резкости) — слои глубины, как в фотографии
        Fb = Vector((float(os.environ.get('FORE_X', -1.25)), -8.3, float(os.environ.get('FORE_Z', 1.78)))); fv = lambda x, y, z: Fb + Vector((x, y, z))
        stem_leaves([fv(0, 0, 0), fv(.14, .0, -.04), fv(.30, .04, -.16), fv(.40, .07, -.26), fv(.50, .09, -.42)], 13, .011, scale=1.2, shadow=False)
        stem_leaves([fv(.05, .0, -.02), fv(.10, .02, -.18), fv(.14, .05, -.30), fv(.12, .08, -.50)], 9, .009, scale=1.05, shadow=False)


def gobo(S):
    """ветки-«гобо» вне кадра на пути солнца: чёткие тени листьев ложатся на стену и столешницу (ветки невидимы камере по положению)"""
    rnd = random.Random(33)
    mats = [RL.leaf_material('goA', (.09, .15, .045), (.27, .38, .11))]; LV = RL.leaf_variants(.118, .031, 3, 'olive', mats)
    stem = S.mk('gstem'); S.val(stem[2], (.30, .25, .16, 1), 'Base Color')
    d = Vector((.62, .72, -.55)).normalized(); ex = d.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(d).normalized()
    targets = [(-1.55, 2.55, .2, 1.0), (-.55, 1.35, -.5, .9), (.05, 3.05, .8, .85), (-2.1, 1.2, -.2, .9), (-2.5, 3.0, .6, .8)]
    for (tx, tz, rot, k) in targets:
        tgt = Vector((tx, 1.15, tz)); loc = tgt - d * 7.5
        for sgn in (1, -1):
            pts_ = [(0, 0, 0), (-.1 * 2.2, 0, .5 * 2.2), (-.3 * 2.2 * sgn, .02, 1.0 * 2.2), (-.6 * 2.2 * sgn, .04, 1.45 * 2.2)]
            P = [loc + ex * (p[0] * math.cos(rot) - p[2] * math.sin(rot)) + ey * (p[0] * math.sin(rot) + p[2] * math.cos(rot)) + d * p[1] for p in pts_]
            cu = bpy.data.curves.new('gs', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(P) - 1)
            for i, p in enumerate(P): sp.points[i].co = (*p, 1)
            cu.bevel_depth = .006 * 3.0 * k; cu.materials.append(stem[0]); S.link(bpy.data.objects.new('gs', cu), 'gobo')
            def at(t):
                f = t * (len(P) - 1); i = min(int(f), len(P) - 2); return P[i].lerp(P[i + 1], f - i)
            for i in range(1, 26):
                t = i / 27 * .94 + .05; pos = at(t); dd = (at(min(1, t + .03)) - pos).normalized()
                for dv in RL.pair_dirs(dd, i, rnd):
                    ob = bpy.data.objects.new('lf', rnd.choice(LV)); S.link(ob, 'gobo'); s = 3.0 * k * (1.0 - .35 * t) * (.85 + rnd.random() * .3); ob.scale = (s,) * 3; ob.location = pos; RL.orient(ob, dv, rnd, tint=RL.tint_for(t, rnd))
