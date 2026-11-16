"""Экспозиция каталога — вторая версия (16.11.2026): тот же кадр и те же подиумы, что в expo.py, но материалы и свет подтянуты к эталону «атриума» (assets/company/atrium-side.webp):
  • стол и пол — полированный слоистый травертин (travertine-ivory из пака CC0) с волнистыми прожилками и зеркальными отражениями подиумов, шаров и стены (у стола прожилки идут вглубь, как у пола атриума);
    пол — плиты 2,4 × 2,4 со своим рисунком и тонкими швами;
  • подиумы — тот же травертин, жилы горизонтальные и непрерывные вокруг углов, у дисков — вокруг окружности; фаска 0,5 см с гладкой нормалью (блик на кромках), глянец «шлифовка + лёгкий лак»;
  • стена — штукатурка с микрорельефом (plaster-light-trowel, нормаль из карты высот) и мягкой пятнистостью тона вместо «ткани»;
  • ваза-шар — колотый известняк-травертин: настоящее смещение геометрии (ячейки Вороного → грани, трещины, мелкая рябь) вместо вязкого шума;
  • арка — известняк с фаской, чёткий край света и тени; синяя замшевая панель и знак «Астреи» прежние; растение — те же ветки, листья с резкими жилками.
Положения (PLINTHS, SLOTS, world, slot_world) берутся из expo.py: геометрия подиумов, арки, ниши, стола и места товаров НЕ меняются (layers.json остаётся прежним).
Подключение: render_expo_v2.py подставляет этот модуль вместо expo в scene.py (sys.modules['expo'])."""
import bpy, math, os, random, sys
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import materials as MT
import realism as RL
import decor
import expo as X0                                              # прежняя расстановка: подиумы, места товаров, перевод пикселей холста в мир

PLINTHS, SLOTS = X0.PLINTHS, X0.SLOTS
UCM, FX, CAMZ, TZ, cm, world, plinth_pos, slot_world = X0.UCM, X0.FX, X0.CAMZ, X0.TZ, X0.cm, X0.world, X0.plinth_pos, X0.slot_world
TEX = os.path.join(HERE, 'textures')
E = lambda n, d: float(os.environ.get(n, d))
_m = MT._math


# ---------------------------------------------------------------------------------------------------------------------------- материалы камня из пака CC0
def stone(name, slug='travertine-ivory', tile=.9, mode='box', tint=(1, 1, 1), sat=.85, val=1.0, off=(0., 0.), rough=None, rough_mul=1.0, rough_add=0.0,
          coat=0.0, coat_rough=.04, spec=.5, bump=0.0, bump_dist=.003, cvar=0.0, cscale=1.6, ctr=(0., 0.), R=1.0, ky=1.0, top_swap=False, top_rot=0.0,
          slab=0.0, slab_tone=0.0, joint=0.0, grain=0.0, grain_scale=300.0, contrast=0.0):
    """камень из текстуры пака: проекция строится вручную, чтобы жилы не рвались на углах.
    mode 'box'  — боковые грани: u = x + y, v = z (жилы горизонтальные и переходят через угол без стыка), верх: u, v = x, y (с поворотом top_rot, обмен осей top_swap);
    mode 'cyl'  — стенки вращения вокруг вертикали: u — длина дуги вокруг центра ctr (радиус R, сжатие по y — ky), v = z; верх — как в 'box';
    mode 'top'  — только плоскость x, y (пол, столешница); slab > 0 — плиты slab × slab со своим сдвигом рисунка, слегка разным тоном и швом шириной joint.
    tile — размер повтора текстуры в единицах сцены; tint, sat, val — оттенок камня; rough_mul/rough_add — карта шероховатости пака × k + c; bump — рельеф из карты высот;
    cvar — крупная пятнистость тона; grain — мелкое зерно (рельеф) для штукатурки."""
    m, nt, b = MT._mk(name); L = nt.links; N = nt.nodes
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sp.inputs[0]); gn = N.new('ShaderNodeNewGeometry'); nrm = N.new('ShaderNodeSeparateXYZ'); L.new(gn.outputs['True Normal'], nrm.inputs[0])      # грань, а не сглаженная нормаль: стенки вращения не «текут» в верхнюю проекцию
    X, Y, Z = sp.outputs['X'], sp.outputs['Y'], sp.outputs['Z']
    if top_rot:
        c_, s_ = math.cos(top_rot), math.sin(top_rot); Xr = _m(nt, 'SUBTRACT', _m(nt, 'MULTIPLY', X, c_), _m(nt, 'MULTIPLY', Y, s_)); Yr = _m(nt, 'ADD', _m(nt, 'MULTIPLY', X, s_), _m(nt, 'MULTIPLY', Y, c_))
    else: Xr, Yr = X, Y
    tu, tv = (Yr, Xr) if top_swap else (Xr, Yr)
    inv = 1.0 / tile
    if mode == 'top': u, v = tu, tv
    else:
        if mode == 'cyl':
            n_ = max(1, round(2 * math.pi * R / tile)); inv = n_ / (2 * math.pi * R)
            ang = _m(nt, 'ARCTAN2', _m(nt, 'DIVIDE', _m(nt, 'SUBTRACT', Y, ctr[1]), ky), _m(nt, 'SUBTRACT', X, ctr[0])); su, sv = _m(nt, 'MULTIPLY', ang, R), Z
        else: su, sv = _m(nt, 'ADD', X, Y), Z
        top = _m(nt, 'GREATER_THAN', _m(nt, 'ABSOLUTE', nrm.outputs['Z']), .62)
        u = _m(nt, 'ADD', su, _m(nt, 'MULTIPLY', _m(nt, 'SUBTRACT', tu, su), top)); v = _m(nt, 'ADD', sv, _m(nt, 'MULTIPLY', _m(nt, 'SUBTRACT', tv, sv), top))
    seam = None; tone = None
    if slab:
        ix = _m(nt, 'FLOOR', _m(nt, 'DIVIDE', X, slab)); iy = _m(nt, 'FLOOR', _m(nt, 'DIVIDE', Y, slab)); cb = N.new('ShaderNodeCombineXYZ'); L.new(ix, cb.inputs['X']); L.new(iy, cb.inputs['Y'])
        wn = N.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L.new(cb.outputs[0], wn.inputs['Vector']); sc_ = N.new('ShaderNodeSeparateColor'); L.new(wn.outputs['Color'], sc_.inputs[0])
        u = _m(nt, 'ADD', u, _m(nt, 'MULTIPLY', sc_.outputs['Red'], 7.31 * tile)); v = _m(nt, 'ADD', v, _m(nt, 'MULTIPLY', sc_.outputs['Green'], 5.77 * tile))
        tone = _m(nt, 'ADD', 1.0 - slab_tone / 2, _m(nt, 'MULTIPLY', sc_.outputs['Blue'], slab_tone))
        if joint:
            def edge(w): fr = _m(nt, 'FRACT', _m(nt, 'DIVIDE', w, slab)); return _m(nt, 'MULTIPLY', _m(nt, 'MINIMUM', fr, _m(nt, 'SUBTRACT', 1.0, fr)), slab)
            seam = _m(nt, 'LESS_THAN', _m(nt, 'MINIMUM', edge(X), edge(Y)), joint)
    cu = N.new('ShaderNodeCombineXYZ'); L.new(_m(nt, 'MULTIPLY', u, inv), cu.inputs['X']); L.new(_m(nt, 'MULTIPLY', v, inv), cu.inputs['Y'])
    def img(fn, cs):
        t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEX, slug, fn), check_existing=True); t.image.colorspace_settings.name = cs; t.interpolation = 'Cubic'; t.projection = 'FLAT'; t.extension = 'REPEAT'
        L.new(cu.outputs[0], t.inputs['Vector']); return t
    col = img('color.jpg', 'sRGB').outputs['Color']
    if contrast:                                                                              # жилы читаются ярче: контраст карты цвета до оттенка
        bc = N.new('ShaderNodeBrightContrast'); bc.inputs['Contrast'].default_value = contrast; bc.inputs['Bright'].default_value = -contrast * .06; L.new(col, bc.inputs['Color']); col = bc.outputs['Color']
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0; L.new(col, mx.inputs['A']); mx.inputs['B'].default_value = (tint[0], tint[1], tint[2], 1); c = mx.outputs['Result']
    hs = N.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = sat; hs.inputs['Value'].default_value = val; L.new(c, hs.inputs['Color']); c = hs.outputs['Color']
    if tone is not None:
        t2 = N.new('ShaderNodeMix'); t2.data_type = 'RGBA'; t2.blend_type = 'MULTIPLY'; t2.inputs['Factor'].default_value = 1.0; L.new(c, t2.inputs['A'])
        kc = N.new('ShaderNodeCombineColor'); [L.new(tone, kc.inputs[i]) for i in range(3)]; L.new(kc.outputs[0], t2.inputs['B']); c = t2.outputs['Result']
    if cvar:                                                                                  # крупные и средние пятна тона (неоднородность штукатурки, плит)
        tcv = N.new('ShaderNodeMapping'); tcv.inputs['Scale'].default_value = (1, 1, 1); L.new(tc.outputs['Object'], tcv.inputs['Vector'])
        n1 = N.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = cscale; n1.inputs['Detail'].default_value = 6; n1.inputs['Roughness'].default_value = .55; L.new(tcv.outputs[0], n1.inputs['Vector'])
        n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = cscale * 4.3; n2.inputs['Detail'].default_value = 5; n2.inputs['Roughness'].default_value = .6; L.new(tcv.outputs[0], n2.inputs['Vector'])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .30; mr.inputs['From Max'].default_value = .70; mr.inputs['To Min'].default_value = 1 - cvar; mr.inputs['To Max'].default_value = 1 + cvar * .45
        L.new(_m(nt, 'ADD', _m(nt, 'MULTIPLY', n1.outputs['Fac'], .72), _m(nt, 'MULTIPLY', n2.outputs['Fac'], .28)), mr.inputs['Value'])
        kc = N.new('ShaderNodeCombineColor'); [L.new(mr.outputs['Result'], kc.inputs[i]) for i in range(3)]
        t3 = N.new('ShaderNodeMix'); t3.data_type = 'RGBA'; t3.blend_type = 'MULTIPLY'; t3.inputs['Factor'].default_value = 1.0; L.new(c, t3.inputs['A']); L.new(kc.outputs[0], t3.inputs['B']); c = t3.outputs['Result']
    if seam is not None:
        sm = N.new('ShaderNodeMix'); sm.data_type = 'RGBA'; L.new(c, sm.inputs['A']); sm.inputs['B'].default_value = (.46, .40, .32, 1); L.new(_m(nt, 'MULTIPLY', seam, .7), sm.inputs['Factor']); c = sm.outputs['Result']
    L.new(c, b.inputs['Base Color'])
    if rough is None:
        r_ = img('rough.jpg', 'Non-Color').outputs['Color']; L.new(_m(nt, 'MAXIMUM', _m(nt, 'ADD', _m(nt, 'MULTIPLY', r_, rough_mul), rough_add), .02), b.inputs['Roughness'])
    else: MT._val(b, rough, 'Roughness')
    hts = []
    if bump:
        d_ = img('disp.jpg', 'Non-Color').outputs['Color']; hts.append(_m(nt, 'MULTIPLY', d_, 1.0))
    if grain:
        gt = N.new('ShaderNodeTexNoise'); gt.inputs['Scale'].default_value = grain_scale; gt.inputs['Detail'].default_value = 8; gt.inputs['Roughness'].default_value = .72; L.new(tc.outputs['Object'], gt.inputs['Vector'])
        gb = N.new('ShaderNodeBump'); gb.inputs['Strength'].default_value = grain; gb.inputs['Distance'].default_value = .0015; L.new(gt.outputs['Fac'], gb.inputs['Height']); gnrm = gb.outputs['Normal']
    else: gnrm = None
    if bump:
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = bump_dist; L.new(hts[0], bp.inputs['Height'])
        if gnrm is not None: L.new(gnrm, bp.inputs['Normal'])
        L.new(bp.outputs['Normal'], b.inputs['Normal'])
    elif gnrm is not None: L.new(gnrm, b.inputs['Normal'])
    MT._val(b, spec, 'Specular IOR Level', 'Specular')
    if coat: MT._val(b, coat, 'Coat Weight', 'Clearcoat'); MT._val(b, coat_rough, 'Coat Roughness', 'Clearcoat Roughness')
    return m


def hewn_stone(name, R, tint=(1, 1, 1), seed=3.0):
    """колотый камень для вазы-шара: слои травертина (3D-волна с искажением, без швов проекции), смещение геометрии — грани-ячейки Вороного с трещинами между ними и мелкой рябью (резкий рельеф, не «вязкий»).
    Нужен Subsurf с render_levels ≥ 4 на объекте: смещение двигает вершины (displacement_method BOTH)."""
    m, nt, b = MT._mk(name); L = nt.links; N = nt.nodes; mth = lambda *a, **k: _m(nt, *a, **k)
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (seed, seed * .7, seed * 1.3); L.new(tc.outputs['Object'], mp.inputs['Vector']); vec = mp.outputs[0]
    # слои: волна по Z, искажённая шумом
    wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'; wv.wave_profile = 'SIN'; wv.inputs['Scale'].default_value = E('VASE_BAND', 6.0) * .38 / R; wv.inputs['Distortion'].default_value = 6.0; wv.inputs['Detail'].default_value = 4.0; wv.inputs['Detail Scale'].default_value = 1.6; wv.inputs['Detail Roughness'].default_value = .6
    L.new(vec, wv.inputs['Vector'])
    w2 = N.new('ShaderNodeTexWave'); w2.wave_type = 'BANDS'; w2.bands_direction = 'Z'; w2.wave_profile = 'SIN'; w2.inputs['Scale'].default_value = E('VASE_BAND', 6.0) * .38 / R * 2.6; w2.inputs['Distortion'].default_value = 9.0; w2.inputs['Detail'].default_value = 3.0; L.new(vec, w2.inputs['Vector'])
    sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 3.0; sn.inputs['Detail'].default_value = 5; L.new(vec, sn.inputs['Vector'])
    cr = MT._ramp(nt, [(.22, (.60, .48, .33, 1)), (.55, (.77, .66, .49, 1)), (.90, (.89, .80, .64, 1))]); L.new(mth('ADD', mth('ADD', mth('MULTIPLY', wv.outputs['Fac'], .45), mth('MULTIPLY', w2.outputs['Fac'], .25)), mth('MULTIPLY', sn.outputs['Fac'], .30)), cr.inputs['Fac'])
    # ячейки-грани и трещины
    warp = N.new('ShaderNodeTexNoise'); warp.inputs['Scale'].default_value = 4.0; warp.inputs['Detail'].default_value = 3; L.new(vec, warp.inputs['Vector'])
    wv_ = N.new('ShaderNodeMix'); wv_.data_type = 'VECTOR'; wv_.inputs['Factor'].default_value = .16; L.new(vec, wv_.inputs[4]); L.new(warp.outputs['Color'], wv_.inputs[5])
    ve = N.new('ShaderNodeTexVoronoi'); ve.voronoi_dimensions = '3D'; ve.feature = 'DISTANCE_TO_EDGE'; ve.inputs['Scale'].default_value = E('VASE_CELL', 5.0) * .38 / R; L.new(wv_.outputs[1], ve.inputs['Vector'])
    vc = N.new('ShaderNodeTexVoronoi'); vc.voronoi_dimensions = '3D'; vc.feature = 'F1'; vc.inputs['Scale'].default_value = E('VASE_CELL', 5.0) * .38 / R; L.new(wv_.outputs[1], vc.inputs['Vector'])
    cell = N.new('ShaderNodeSeparateColor'); L.new(vc.outputs['Color'], cell.inputs[0])
    cw = E('VASE_CW', .05); crack = mth('SUBTRACT', 1.0, mth('MULTIPLY', mth('MINIMUM', ve.outputs['Distance'], cw), 1 / cw))                          # 1 в трещине, 0 на грани
    fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 46.0; fine.inputs['Detail'].default_value = 8; fine.inputs['Roughness'].default_value = .62; L.new(vec, fine.inputs['Vector'])
    pm_ = N.new('ShaderNodeMapping'); pm_.inputs['Scale'].default_value = (1.0, 1.0, 3.2); L.new(vec, pm_.inputs['Vector'])                              # поры вытянуты по слоям (горизонтально)
    pits = N.new('ShaderNodeTexVoronoi'); pits.inputs['Scale'].default_value = 95.0; pits.inputs['Randomness'].default_value = 1.0; pits.voronoi_dimensions = '3D'; L.new(pm_.outputs[0], pits.inputs['Vector'])
    pit = mth('GREATER_THAN', mth('SUBTRACT', 1.0, pits.outputs['Distance']), E('VASE_PIT', .80))
    H = mth('ADD', mth('ADD', mth('MULTIPLY', cell.outputs['Red'], E('VASE_FACET', .95)), mth('MULTIPLY', fine.outputs['Fac'], .25)), mth('SUBTRACT', 0.0, mth('MULTIPLY', crack, E('VASE_CRACK', .12))))
    H = mth('SUBTRACT', H, mth('MULTIPLY', pit, .18))
    dis = N.new('ShaderNodeDisplacement'); dis.inputs['Midlevel'].default_value = .45; dis.inputs['Scale'].default_value = E('VASE_DISP', .040); L.new(H, dis.inputs['Height'])
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL'); L.new(dis.outputs['Displacement'], out.inputs['Displacement'])
    m.displacement_method = 'BOTH'
    # цвет: слои × грани чуть разного тона, трещины и поры темнее
    ck = mth('ADD', .93, mth('MULTIPLY', cell.outputs['Green'], .12))
    kc = N.new('ShaderNodeCombineColor'); [L.new(ck, kc.inputs[i]) for i in range(3)]
    c1 = N.new('ShaderNodeMix'); c1.data_type = 'RGBA'; c1.blend_type = 'MULTIPLY'; c1.inputs['Factor'].default_value = 1.0; L.new(cr.outputs['Color'], c1.inputs['A']); L.new(kc.outputs[0], c1.inputs['B'])
    c2 = N.new('ShaderNodeMix'); c2.data_type = 'RGBA'; L.new(c1.outputs['Result'], c2.inputs['A']); c2.inputs['B'].default_value = (.36, .28, .19, 1); L.new(mth('MAXIMUM', mth('MULTIPLY', crack, E('VASE_CRACKC', .30)), mth('MULTIPLY', pit, .6)), c2.inputs['Factor'])
    c3 = N.new('ShaderNodeMix'); c3.data_type = 'RGBA'; c3.blend_type = 'MULTIPLY'; c3.inputs['Factor'].default_value = 1.0; L.new(c2.outputs['Result'], c3.inputs['A']); c3.inputs['B'].default_value = (tint[0], tint[1], tint[2], 1)
    L.new(c3.outputs['Result'], b.inputs['Base Color'])
    bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 1.0; bp.inputs['Distance'].default_value = .006; L.new(H, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, .52, 'Roughness'); MT._val(b, .32, 'Specular IOR Level', 'Specular')
    return m


def leaf_sharp(name, dark, light, silver):
    """лист оливы: материал из realism (серебристая изнанка, жилки, просвет) с более заметной центральной жилкой, жилками и восковым бликом: рельеф жилок сильнее, шероховатость ниже"""
    m = RL.leaf_material(name, dark, light, silver=silver, vein_k=1.7); b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for n in m.node_tree.nodes:
        if n.type == 'BUMP': n.inputs['Strength'].default_value = E('LEAF_BUMP', 1.0); n.inputs['Distance'].default_value = .0012
    MT._val(b, E('LEAF_ROUGH', .30), 'Roughness'); MT._val(b, E('LEAF_COAT', .30), 'Coat Weight', 'Clearcoat'); MT._val(b, .22, 'Coat Roughness', 'Clearcoat Roughness'); return m


# ---------------------------------------------------------------------------------------------------------------------------- геометрия
def disc(S, name, mat, cx, cy, r, z0, z1, grp, b=.0126, seg=160, nb=5):
    """диск-подиум: тело вращения со скруглённой фаской радиуса b; ступенька профиля раздвоена, плоские торцы остаются плоскими, а кромка плавно ловит блик"""
    prof = [(0.0, z0), (r - b, z0)]
    for i in range(1, nb + 1): a = -math.pi / 2 + (math.pi / 2) * i / nb; prof.append((r - b + b * math.cos(a), z0 + b + b * math.sin(a)))
    for i in range(nb + 1): a = (math.pi / 2) * i / nb; prof.append((r - b + b * math.cos(a), z1 - b + b * math.sin(a)))
    prof.append((r - b, z1)); prof.append((0.0, z1))
    ob = decor.lathe(name, prof, mat, grp, cx=cx, cy=cy, z=0.0, seg=seg, smooth=True); return ob


def build(S, sc, M):
    """S — модуль scene (общие помощники: box, arch_solid, arch_frame, link, mesh_obj, E3, val, mat_simple, mat_led)"""
    import time; t0 = [time.time()]
    def T(l): print('  [expo2] %s +%.1f с' % (l, time.time() - t0[0]), flush=True); t0[0] = time.time()
    E3 = S.E3; mesh_obj = S.mesh_obj
    tw = E3('WALLT', (1.0, .88, .70)); bk = E3('BACKT', (.90, .81, .66)); stn = E3('STONET', (1.0, .92, .80)); ssat = E('STONE_SAT', 1.05)
    # ---------- материалы
    M['wall'] = stone('wall_plaster', 'plaster-light-trowel', tile=E('WALL_TILE', 1.5), tint=tw, sat=1.0, rough=None, rough_mul=1.0, bump=E('WALL_BUMP', .5), bump_dist=.010, cvar=E('WALL_CVAR', .09), cscale=.42, grain=.35)
    M['wall2'] = stone('wall_back', 'plaster-light-trowel', tile=E('WALL_TILE', 1.5) * 1.3, tint=bk, sat=1.0, bump=.6, bump_dist=.010, cvar=.07, cscale=.6, grain=.3)
    M['frame'] = stone('arch_frame', 'plaster-light-smooth', tile=2.2, tint=(1.0, .96, .88), sat=.9, rough_mul=.85, bump=.5, bump_dist=.004, cvar=.025, cscale=.9, grain=.15)
    M['white'] = S.mat_simple('counter_white', (.94, .92, .87), .28)
    M['floor'] = stone('floor', 'travertine-ivory', tile=E('FLOOR_TILE', 1.5), mode='top', tint=E3('FLOORT', stn), sat=ssat, rough_mul=1.0, rough_add=E('FLOOR_ROUGH', .035), coat=.0, spec=.55, slab=2.4, slab_tone=.05, joint=.0045, cvar=.04, cscale=.5, top_swap=True, contrast=E('VEIN_C', .45))
    M['led'] = S.mat_led('led', float(os.environ.get('LED', 26.0))); M['glass'] = MT.satin_glass('niche_glass')
    tsd = stone('tbl_side', tile=E('TBL_TILE', 1.2), mode='cyl', R=4.6, ctr=(E('TABLE_CX', .9), -5.6 + E('TABLE_RY', 2.25)), ky=E('TABLE_RY', 2.25) / E('TABLE_RX', 4.6), tint=stn, sat=ssat, rough_mul=3.0, rough_add=.02, coat=.30, coat_rough=.05, spec=.5, contrast=E('VEIN_C', .45) * .7)
    ttp = stone('tbl_top', tile=E('TBL_TILE', 1.2), mode='cyl', R=4.6, ctr=(E('TABLE_CX', .9), -5.6 + E('TABLE_RY', 2.25)), ky=E('TABLE_RY', 2.25) / E('TABLE_RX', 4.6), tint=stn, sat=ssat, rough_mul=1.0, rough_add=E('TBL_ROUGH', .03), coat=E('TBL_COAT', .25), coat_rough=.02, spec=.55, top_swap=True, cvar=.03, cscale=.8, contrast=E('VEIN_C', .45) * 1.5)
    # --- пол, стена с аркой, пилястра, задняя стена
    S.box('floor', M['floor'], -16, 16, -16, 8, -0.5, 0.0, 'shell')
    wall = S.box('wall', M['wall'], -10, 10, 1.15, 1.6, 0.0, 8.0, 'shell')
    d_w = 13.3
    BZ = float(os.environ.get('BGZ', -.40))
    AR = {'cx': 2.45, 'rx': 1.24, 'zs': 2.30 + BZ}
    cut = S.arch_solid('cut1', M['wall'], AR['cx'], AR['rx'], AR['zs'], 1.0, 1.8, 'shell', z0=-.1)
    bm = wall.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'; cut.hide_render = True; cut.display_type = 'WIRE'
    bv = wall.modifiers.new('bev', 'BEVEL'); bv.width = E('WALL_BEV', .022); bv.segments = 4; bv.limit_method = 'ANGLE'
    S.box('back', M['wall2'], 0.8, 9.0, 3.8, 4.2, 0.0, 7.0, 'shell')
    S.box('pilaster', M['frame'], 0.18, 0.74, .86, 1.16, 0.0, 8.0, 'ring', bev=.016)
    base_ = S.box('plinth', stone('trav_base', tile=1.3, mode='box', tint=stn, sat=ssat, rough_mul=4.0, rough_add=.02, coat=.30, coat_rough=.05, off=(.3, .1)), -10, 10, .98, 1.16, 0.0, .40, 'shell', bev=.012)
    cut2 = S.arch_solid('cut2', M['wall'], AR['cx'], AR['rx'], AR['zs'], .90, 1.8, 'shell', z0=-.1)
    bmp = base_.modifiers.new('cut', 'BOOLEAN'); bmp.operation = 'DIFFERENCE'; bmp.object = cut2; bmp.solver = 'EXACT'; cut2.hide_render = True; cut2.display_type = 'WIRE'
    fr = S.arch_frame('arc_frame', M['frame'], AR['cx'], AR['rx'], AR['zs'], .30, .70, 1.16, 'ring')
    for p in fr.data.polygons: p.use_smooth = True
    fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = E('ARCH_BEV', .024); fb.segments = 5; fb.limit_method = 'ANGLE'; fb.angle_limit = math.radians(40)
    wn_ = fr.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn_.keep_sharp = True; wn_.weight = 60
    S.arch_frame('arc_led', M['led'], AR['cx'], AR['rx'] - .03, AR['zs'] - .03, .028, 1.12, 1.16, 'ring')
    T('стена, арка, пилястра')
    # --- синяя тканевая панель (прежняя) со знаком «Астреи»
    PN = {'cx': 3.40, 'rx': .78, 'zs': 2.80 + BZ}
    fab = RL.fabric_suede('insert_navy', E3('INSC', (.022, .050, .150)), float(os.environ.get('INS_K', 14.0)))
    S.arch_solid('panel', fab, PN['cx'], PN['rx'], PN['zs'], 3.72, 3.76, 'shell', z0=-.3)
    rim = S.arch_frame('panel_rim', M['frame'], PN['cx'], PN['rx'], PN['zs'], .30, 3.52, 3.78, 'shell', z0=-.3)
    for p in rim.data.polygons: p.use_smooth = True
    rb = rim.modifiers.new('bev', 'BEVEL'); rb.width = .014; rb.segments = 4; rb.limit_method = 'ANGLE'; rb.angle_limit = math.radians(40)
    rn_ = rim.modifiers.new('wn', 'WEIGHTED_NORMAL'); rn_.keep_sharp = True
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
    # --- ниша со стеклянными полками и флаконами (прежняя)
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
    # --- большой овальный стол: полированная столешница (жилы вглубь, зеркальные отражения) и барабан из слоистого травертина
    RX = float(os.environ.get('TABLE_RX', 4.6)); RY = float(os.environ.get('TABLE_RY', 2.25)); tcx = float(os.environ.get('TABLE_CX', 0.9)); tcy = -5.6 + RY; k_ = RY / RX
    drum = [(0.0, -.5), (RX - .02, -.5), (RX - .02, -.47), (RX - .02, TZ - .14), (RX - .02, TZ - .11), (0.0, TZ - .11)]
    top = [(0.0, TZ - .11), (RX - .02, TZ - .11), (RX, TZ - .105), (RX, TZ - .05), (RX - .022, TZ - .016), (RX - .05, TZ - .0015), (RX - .09, TZ), (RX - .40, TZ), (RX * .5, TZ), (0.0, TZ)]
    decor.lathe('tbl_drum', drum, tsd, 'dais', cx=tcx, cy=tcy, z=0.0, seg=256, sy=k_, smooth=True)
    decor.lathe('tbl_top', top, ttp, 'dais', cx=tcx, cy=tcy, z=0.0, seg=256, sy=k_, smooth=True)
    T('стол')
    # --- подиумы: слоистый травертин, фаска 0,5 см с гладкой нормалью, глянцевая шлифовка
    rg = random.Random(5); bv_ = cm(E('PL_BEV', .5))
    for i, (kind, cx, d, w, dp, h, z0, tint, yaw) in enumerate(PLINTHS):
        X, Y = plinth_pos(i); z_lo = TZ + cm(z0); z_hi = TZ + cm(z0 + h); k = .96 + .06 * ((i * 37) % 5) / 4
        tn = (stn[0] * k, stn[1] * k * (1 + .01 * ((i % 3) - 1)), stn[2] * k)
        common = dict(tile=E('PL_TILE', .8) * (.9 + .15 * (i % 3)), tint=tn, sat=ssat, rough_mul=E('PL_RM', 6.0), rough_add=.02, coat=E('PL_COAT', .35), coat_rough=.06, spec=.5, contrast=E('VEIN_C', .45) * .8)
        if kind == 'box':
            mat = stone('pl_stone%d' % i, mode='box', off=(rg.uniform(0, 5), rg.uniform(0, 5)), **common)
            ob = decor.box('plinth%d' % i, mat, -cm(w) / 2, cm(w) / 2, -cm(dp) / 2, cm(dp) / 2, 0.0, cm(h), 'dais', bev=bv_, seg=5); ob.location = (X, Y, z_lo); ob.rotation_euler = (0, 0, yaw)
        else:
            mat = stone('pl_stone%d' % i, mode='cyl', R=cm(w) / 2, ctr=(X, Y), off=(rg.uniform(0, 5), rg.uniform(0, 5)), **common)
            disc(S, 'plinth%d' % i, mat, X, Y, cm(w) / 2, z_lo, z_hi, 'dais', b=bv_)
    T('подиумы')
    # --- стеклянные шары на столе (прежние)
    gm = bpy.data.materials.new('crystal'); gm.use_nodes = True; gb = gm.node_tree.nodes['Principled BSDF']
    S.val(gb, (1, 1, 1, 1), 'Base Color'); S.val(gb, 0.0, 'Roughness'); S.val(gb, 1.0, 'Transmission Weight', 'Transmission'); S.val(gb, 1.5, 'IOR'); S.val(gb, 0.5, 'Specular IOR Level', 'Specular')
    for (nm, cx, d, R) in (('ball1', 532, 6.85, 3.6), ('ball2', 1052, 6.85, 2.6)):
        X, Y = world(cx, d); decor.ball(nm, gm, X, Y, TZ + cm(R), cm(R), 'dais', seg=96, n=48)
    T('шары')
    # --- ваза-шар из колотого известняка-травертина и ветка оливы
    vx, vy = world(392, 7.25); VR = float(os.environ.get('VASE_R', .38)); vz = TZ + VR * .93
    vm = hewn_stone('vase_stone', VR, tint=E3('VASET', (1.0, .96, .88)))
    prof = [(0.0, -VR)]; n = 40
    for i in range(1, n):
        a = -math.pi / 2 + math.pi * i / n * .925; prof.append((VR * math.cos(a), VR * math.sin(a)))
    a_end = -math.pi / 2 + math.pi * .925; neck = VR * math.cos(a_end); zt = VR * math.sin(a_end)
    prof += [(neck * .96, zt + .012), (neck * .72, zt + .02), (neck * .55, zt + .0), (neck * .52, zt - .12), (0.0, zt - .12)]
    vase = decor.lathe('vase', prof, vm, 'plant', cx=vx, cy=vy, z=vz, seg=128, smooth=True)
    sub = vase.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = int(E('VASE_SUB', 4))
    T('ваза')
    olive(S, Vector((vx, vy, vz + zt - .02)), 'plant')
    X0.gobo(S)
    T('ветки')


def olive(S, base, grp='plant'):
    """ветка оливы — те же побеги, листья и случайные числа, что в expo.py (контур слоя не меняется), но листья с резкими жилками (leaf_sharp)"""
    orig = RL.leaf_material
    def lm(name, dark, light, under=False, silver=(.66, .71, .58), vein_k=1.0):
        return orig(name, dark, light, under=under, silver=silver, vein_k=1.7)
    RL.leaf_material = lm
    try: X0.olive(S, base, grp)
    finally: RL.leaf_material = orig
    for m in bpy.data.materials:
        if m.name.startswith('olA') or m.name.startswith('olB'):
            b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            for n in m.node_tree.nodes:
                if n.type == 'BUMP': n.inputs['Strength'].default_value = E('LEAF_BUMP', 1.0); n.inputs['Distance'].default_value = .0012
            MT._val(b, E('LEAF_ROUGH', .30), 'Roughness'); MT._val(b, E('LEAF_COAT', .30), 'Coat Weight', 'Clearcoat'); MT._val(b, .22, 'Coat Roughness', 'Clearcoat Roughness')


gobo = X0.gobo
