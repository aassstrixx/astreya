#!/usr/bin/env python3
"""Стена-витрина брендов (страница «Бренды») — вторая версия: качество и цветокор «как у атриума» (tools/showroom-assets/atrium, образец структуры — assets/company/atrium-side.webp).

Композиция, камера и геометрия ниш — те же, что у brands_wall.py (модуль импортируется: NICHES, LAYOUT, camera, layout_json, olive_tree) — поэтому assets/brands/wall.json не меняется;
упаковки и логотипы страница ставит поверх кадра HTML-слоями по этому файлу (src/pages/brands.js). Что другое:
  * стена — оштукатуренная поверхность из пака CC0 (plaster-light-smooth / -trowel): микрорельеф по карте высот, мягкая пятнистость тона, косое солнце и свет «окна» читают фактуру;
  * основание — полированный травертин (travertine-ivory) с волнистыми прожилками, швы плит, лак с отражением (отражаются ниши и свет), подставки в нишах — слоистый травертин, грани с фаской;
  * арки ниш — окантовка из травертина с фаской (чёткая кромка света и тени) и тонкая скрытая подсветка нейтрально-тёплого тона (без жёлтого налёта прежнего кадра);
  * рейка справа — вертикальные планки с глубиной и фаской: тень от соседней планки и блик на кромке;
  * свет: солнце сквозь переплёт (диагональные мягкие тени, как раньше), нейтральный широкий заполняющий свет, нейтральные мягкие лампы в нишах; AgX «Punchy», как у атриума;
  * рендер: без глубины резкости, фильтр пикселя 1,0, OIDN HIGH с точным предфильтром (альбедо + нормали), адаптивная выборка; итоговый кадр — вертикальными полосами с перекрытием.

Запуск (из этой папки, python3 с модулем bpy; строго 2 потока — BW_THREADS):
  python3 brands_wall_v2.py preview       быстрый кадр /tmp/bw_preview.png (BW_W=768, BW_SPP=24); CROP=x0,x1,y0,y1 — кусок кадра в долях (y сверху вниз); BW_TREE=0 — без дерева
  python3 brands_wall_v2.py still         итоговый кадр (BW_W=3072, BW_SPP=96, BW_TILES=N полос с возобновлением; BW_STRIPS=0,1 — какие полосы считать) → /tmp/bw_raw.png
  python3 brands_wall_v2.py layout        только wall.json в /tmp/bw_layout.json (проверка: файл должен совпасть с assets/brands/wall.json)
  python3 brands_wall_v2.py save          сохранить ASTREYA_BRANDS_WALL.blend
Дальше — finish_wall.py (цвет, контраст, экспорт wall.webp / wall-s.webp).
Переменные: BW_W, BW_SPP, BW_TILES, BW_THREADS, BW_RAW, EXPO (−0,55), SUN, SUN_ANGLE, FILL, WORLD, NICHE_L, NICHE_F, LEDK (подсветка контура), WALL (plaster-light-smooth | plaster-light-trowel),
WALL_BUMP / WALL_BD (рельеф штукатурки), WALL_TINT, WALL_SAT, WALL_VAL, TRAV_SAT, BASE_GLOSS, TREE_*, BARK_* (дерево, см. brands_wall.py)."""
import bpy, math, os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, 'auditorium'))
import scene as S
import brands_wall as BW
import academy_auditorium as AA
import realism as RL
from mathutils import Vector, Matrix

E = AA.E
ARGS = [a for a in sys.argv[1:] if not a.startswith('-')]
MODE = ARGS[0] if ARGS else 'preview'
NICHES, LAYOUT, PW, PH, WU, HU, BASE_Z, NICHE_DEPTH = BW.NICHES, BW.LAYOUT, BW.PW, BW.PH, BW.WU, BW.HU, BW.BASE_Z, BW.NICHE_DEPTH


# ───────────── материалы ─────────────
def _tex(nt, slug, fn, cs, vec, proj='BOX'):
    n = nt.nodes.new('ShaderNodeTexImage'); img = bpy.data.images.load(os.path.join(AA.TEX, slug, fn), check_existing=True); img.colorspace_settings.name = cs
    n.image = img; n.interpolation = 'Cubic'; n.projection = proj; n.projection_blend = .2; nt.links.new(vec, n.inputs['Vector']); return n


def stone(name, slug, tile, tint=None, sat=1.0, val=1.0, rough=None, rmul=1.0, nstr=0.0, bump=1.0, bdist=.02, coat=0.0, coat_r=.04, spec=.4,
          rot=None, aspect=(1, 1, 1), cvar=0.0, cscale=1.0, cflat=0.0, ccon=0.0, micro=0.0, mscale=45.0, mdist=.01, rvar=0.0, rscale=.35, offset=(0, 0, 0)):
    """материал из пака CC0 (tools/showroom-assets/textures): коробочная проекция в объектных координатах (1 ед. сцены = 10 см; tile — размер повтора текстуры в ед.),
    цвет (× tint, насыщенность sat, яркость val, крупные пятна тона cvar), шероховатость из карты (× rmul), рельеф из карты высот (bump, bdist — высота в ед.) + карта нормалей (nstr), микрорельеф шумом (micro)"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new('ShaderNodeOutputMaterial'); b = N.new('ShaderNodeBsdfPrincipled'); L.new(b.outputs['BSDF'], out.inputs['Surface'])
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = tuple(a / tile for a in aspect); mp.inputs['Location'].default_value = offset
    if rot: mp.inputs['Rotation'].default_value = rot
    L.new(tc.outputs['Object'], mp.inputs['Vector']); v = mp.outputs['Vector']
    c = _tex(nt, slug, 'color.jpg', 'sRGB', v).outputs['Color']
    if cflat:                                                                           # приглушить пятна и подтёки карты цвета (рельеф остаётся): смесь с её средним цветом
        from PIL import Image; import numpy as np
        mean = np.asarray(Image.open(os.path.join(AA.TEX, slug, 'color.jpg')).convert('RGB').resize((64, 64))).astype(np.float64).reshape(-1, 3).mean(0) / 255.0
        mean = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in mean]
        fl = N.new('ShaderNodeMixRGB'); fl.inputs['Fac'].default_value = cflat; fl.inputs['Color2'].default_value = (*mean, 1); L.new(c, fl.inputs['Color1']); c = fl.outputs['Color']
    if tint:
        mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1.0; mx.inputs['Color2'].default_value = (*AA.lin(tint), 1); L.new(c, mx.inputs['Color1']); c = mx.outputs['Color']
    if ccon:                                                                            # контраст карты цвета: прожилки травертина читаются резче
        bc = N.new('ShaderNodeBrightContrast'); bc.inputs['Contrast'].default_value = ccon; L.new(c, bc.inputs['Color']); c = bc.outputs['Color']
    if sat != 1.0 or val != 1.0:
        hs = N.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = sat; hs.inputs['Value'].default_value = val; L.new(c, hs.inputs['Color']); c = hs.outputs['Color']
    if cvar:
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = cscale; nz.inputs['Detail'].default_value = 6; nz.inputs['Roughness'].default_value = .55; L.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .3; mr.inputs['From Max'].default_value = .7; mr.inputs['To Min'].default_value = 1 - cvar; mr.inputs['To Max'].default_value = 1 + cvar * .4; L.new(nz.outputs['Fac'], mr.inputs['Value'])
        mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1.0; L.new(c, mx.inputs['Color1']); L.new(mr.outputs['Result'], mx.inputs['Color2']); c = mx.outputs['Color']
    L.new(c, b.inputs['Base Color'])
    if rough is None:
        rg = _tex(nt, slug, 'rough.jpg', 'Non-Color', v); r = rg.outputs['Color']
        if rmul != 1.0:
            rm = N.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'; rm.use_clamp = True; rm.inputs[1].default_value = rmul; L.new(r, rm.inputs[0]); r = rm.outputs[0]
        if rvar:
            mp2 = N.new('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (rscale, rscale * .35, rscale); L.new(tc.outputs['Object'], mp2.inputs['Vector'])
            n3 = N.new('ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 1.0; n3.inputs['Detail'].default_value = 5; n3.inputs['Roughness'].default_value = .6; L.new(mp2.outputs[0], n3.inputs['Vector'])
            ad = N.new('ShaderNodeMath'); ad.operation = 'MULTIPLY_ADD'; ad.use_clamp = True; ad.inputs[1].default_value = rvar * 2; ad.inputs[2].default_value = -rvar; L.new(n3.outputs['Fac'], ad.inputs[0])
            ad2 = N.new('ShaderNodeMath'); ad2.operation = 'ADD'; ad2.use_clamp = True; L.new(r, ad2.inputs[0]); L.new(ad.outputs[0], ad2.inputs[1]); r = ad2.outputs[0]
        L.new(r, b.inputs['Roughness'])
    else: AA._set(b, rough, 'Roughness')
    nrm = None
    if nstr > 0:
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nstr; L.new(_tex(nt, slug, 'normal.jpg', 'Non-Color', v).outputs['Color'], nm.inputs['Color']); nrm = nm.outputs['Normal']
    if bump > 0:
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = bdist; L.new(_tex(nt, slug, 'disp.jpg', 'Non-Color', v).outputs['Color'], bp.inputs['Height'])
        if nrm is not None: L.new(nrm, bp.inputs['Normal'])
        nrm = bp.outputs['Normal']
    if micro:
        n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = mscale; n2.inputs['Detail'].default_value = 8; n2.inputs['Roughness'].default_value = .7; L.new(tc.outputs['Object'], n2.inputs['Vector'])
        b2 = N.new('ShaderNodeBump'); b2.inputs['Strength'].default_value = micro; b2.inputs['Distance'].default_value = mdist; L.new(n2.outputs['Fac'], b2.inputs['Height'])
        if nrm is not None: L.new(nrm, b2.inputs['Normal'])
        nrm = b2.outputs['Normal']
    if nrm is not None: L.new(nrm, b.inputs['Normal'])
    AA._set(b, spec, 'Specular IOR Level', 'Specular')
    if coat: AA._set(b, coat, 'Coat Weight', 'Clearcoat'); AA._set(b, coat_r, 'Coat Roughness', 'Clearcoat Roughness')
    return m


def seams(m, size=1.2, mortar=.007, dark=.80, var=(.97, .95, .93)):
    """швы крупных плит и лёгкий разброс тона плит (как у пола атриума): кирпичная текстура в объектных координатах умножается на цвет материала"""
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = next(n for n in N if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    tc = N.new('ShaderNodeTexCoord'); br = N.new('ShaderNodeTexBrick'); br.offset = 0.0
    for k, v in (('Scale', 1.0), ('Brick Width', size), ('Row Height', size), ('Mortar Size', mortar), ('Mortar Smooth', .5)): br.inputs[k].default_value = v
    br.inputs['Color1'].default_value = (1, 1, 1, 1); br.inputs['Color2'].default_value = (*var, 1); br.inputs['Mortar'].default_value = (dark, dark, dark * .97, 1)
    L.new(tc.outputs['Object'], br.inputs['Vector'])
    mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1.0; src = b.inputs['Base Color']
    if src.links: l = src.links[0]; L.new(l.from_socket, mx.inputs['Color1']); L.remove(l)
    else: mx.inputs['Color1'].default_value = src.default_value
    L.new(br.outputs['Color'], mx.inputs['Color2']); L.new(mx.outputs['Color'], b.inputs['Base Color'])
    return m


def materials():
    M = {}
    ts = E('TRAV_SAT', .72); ws = E('WALL_SAT', .6)
    # стена — штукатурка с микрорельефом; 2 м на повтор карты ≈ 10 текселей на см кадра (3072 px = 3,4 м)
    M['wall'] = stone('bw_wall', os.environ.get('WALL', 'plaster-light-trowel'), tile=E('WALL_TILE', 20.0), tint=os.environ.get('WALL_TINT', '#faeedb'), sat=ws, val=E('WALL_VAL', 1.0),
                      rough=None, rmul=E('WALL_RMUL', 1.0), bump=E('WALL_BUMP', 1.0), bdist=E('WALL_BD', .06), nstr=E('WALL_NSTR', 0.0), cvar=E('WALL_CVAR', .05), cscale=E('WALL_CSC', .45), cflat=E('WALL_CFLAT', .5), micro=E('WALL_MICRO', .5), mscale=E('WALL_MSC', 30.0), mdist=E('WALL_MD', .012), spec=.3)
    # тыл и откосы ниш: более гладкая штукатурка (светлее и ровнее — мягкое свечение подсветки, без резких бликов фактуры)
    M['inner'] = stone('bw_niche', 'plaster-light-smooth', tile=E('WALL_TILE', 20.0) * 1.3, tint=os.environ.get('INNER_TINT', '#f8f0e2'), sat=ws, val=E('INNER_VAL', 1.04), rough=None, bump=E('INNER_BUMP', 1.0), bdist=.02, cvar=.04, cscale=.5, cflat=.55, micro=.4, mscale=30, spec=.3)
    # окантовка арок и подставки — слоистый травертин с фаской
    M['frame'] = stone('bw_rim', 'travertine-ivory', tile=E('RIM_TILE', 6.0), tint='#fff6e8', sat=ts, val=1.02, rough=None, rmul=.8, bump=.6, bdist=.012, nstr=0.0, coat=.25, coat_r=.1, spec=.45, cvar=.04, cscale=.8, ccon=E('TRAV_CON', .3))
    M['block'] = stone('bw_block', 'travertine-ivory', tile=E('BLOCK_TILE', 5.0), tint='#fff6e8', sat=ts, val=1.0, rough=None, rmul=.8, bump=.8, bdist=.012, coat=.3, coat_r=.08, spec=.45, cvar=.05, cscale=.9, ccon=E('TRAV_CON', .3), offset=(.31, .17, .43))
    gl = E('BASE_GLOSS', .65)                                                           # основание — полированный травертин: лак с чёткими отражениями, волнистые прожилки
    M['base'] = seams(stone('bw_base', 'travertine-ivory', tile=E('BASE_TILE', 12.0), tint='#fff6e8', sat=ts, val=1.0, rough=None, rmul=.8, bump=.5, bdist=.02, coat=gl, coat_r=.04, spec=.5, cvar=.045, cscale=.4, rvar=.06, ccon=E('TRAV_CON', .3) * 1.3), size=E('BASE_SEAM', 14.0), mortar=.05, dark=.78)
    k = E('LEDK', 5.0); lc = tuple(float(x) for x in os.environ.get('LEDC', '1.0,.93,.82').split(','))
    M['led'] = S.mat_led('bw_led', k, lc)
    # рейка: светлый камень-штукатурка с фаской планок
    M['slat'] = stone('bw_slat', 'plaster-light-smooth', tile=10.0, tint='#f8f1e4', sat=ws, val=1.06, rough=None, rmul=.9, bump=.7, bdist=.02, cvar=.03, micro=.3, mscale=40, spec=.4)
    return M


# ───────────── геометрия (те же размеры и места, что у brands_wall.build) ─────────────
def build(sc):
    M = materials(); G = 'wall'
    S.box('base', M['base'], -22, 22, -3.2, 2.0, 0.0, BASE_Z, G, bev=.04)
    S.box('base_step', M['base'], -22, 22, -4.5, -3.2, 0.0, .55, G, bev=.04)
    wall = S.box('wall', M['wall'], -22, 22, 0.0, 2.0, BASE_Z, HU + 3, G, bev=0.0)
    wall.data.materials.append(M['inner'])
    cuts = []
    for nid, cx, w, top in NICHES:
        rx = w / 2; zs = top - rx
        cut = S.arch_solid('cut_' + nid, M['wall'], cx, rx, zs, -0.3, NICHE_DEPTH, G, z0=BASE_Z - .01); cut.hide_render = True; cut.display_type = 'WIRE'
        for p in cut.data.polygons: p.material_index = 1                                   # грани выреза (откосы и тыл ниши) получают материал «inner»
        bm = wall.modifiers.new('cut_' + nid, 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'
        if hasattr(bm, 'material_mode'): bm.material_mode = 'INDEX'
        cuts.append(cut)
    bv = wall.modifiers.new('bev', 'BEVEL'); bv.width = E('WALL_BEV', .05); bv.segments = 4; bv.limit_method = 'ANGLE'                       # фаска по кромке проёма: чёткий край света и тени
    for nid, cx, w, top in NICHES:
        rx = w / 2; zs = top - rx
        fr = S.arch_frame('rim_' + nid, M['frame'], cx, rx, zs, .20, -.10, .03, G, z0=BASE_Z); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .025; fb.segments = 4; fb.limit_method = 'ANGLE'
        S.arch_frame('led_' + nid, M['led'], cx, rx - .015, zs - .015, .028, .05, .13, G, z0=BASE_Z)
    for nid, cx, w, top in NICHES:
        for k, (kind, dx, dy, sx, sy, h) in enumerate(LAYOUT[nid]['plinths']):
            if kind == 'disc': S.cylinder('pl_%s_%d' % (nid, k), M['block'], cx + dx, dy, sx / 2, BASE_Z, BASE_Z + h, G, seg=96, bev=.03)
            else: S.box('pl_%s_%d' % (nid, k), M['block'], cx + dx - sx / 2, cx + dx + sx / 2, dy - sy / 2, dy + sy / 2, BASE_Z, BASE_Z + h, G, bev=.035)
    # вертикальная рейка справа над нишей EVA: планки с глубиной (тень от соседней, блик на кромке)
    sd = E('SLAT_D', .5)
    for i in range(14):
        x = 14.0 + i * .56; S.box('slat%d' % i, M['slat'], x, x + .30, -sd, 0.0, 8.15, HU + 3, G, bev=.05)
    if os.environ.get('BW_TREE', '1') == '1':
        orig = RL.leaf_material
        def leaf_mat(name, dark, light, under=False, **kw):
            m = orig(name, dark, light, under=under, vein_k=E('LEAF_VEIN', 1.7), **{k_: v_ for k_, v_ in kw.items() if k_ != 'vein_k'}); st = E('LEAF_SHADOW_T', .5)
            if st > 0:                                                                  # просвет листвы для теневых лучей: тень кроны на стене мягче и светлее (листья тонкие), видимые листья не меняются — читается текст страницы поверх края кроны
                nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); src = out.inputs['Surface'].links[0].from_socket
                lp = nt.nodes.new('ShaderNodeLightPath'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = st
                nt.links.new(lp.outputs['Is Shadow Ray'], k.inputs[0]); nt.links.new(k.outputs[0], mx.inputs['Fac']); nt.links.new(src, mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
            return m
        RL.leaf_material = leaf_mat
        try: BW.olive_tree(M, (BW.TREE_X, BW.TREE_Y, BASE_Z), G)
        finally: RL.leaf_material = orig
    return M


# ───────────── свет ─────────────
def lights(sc):
    # солнце слева-спереди сквозь переплёт (переплёт для камеры невидим, но даёт тень): диагональные мягкие «окна света» — как в прежнем кадре, свет нейтрально-тёплый
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = E('SUN', 6.5); sun.angle = math.radians(E('SUN_ANGLE', 1.4)); sun.color = S.E3('SUNC', (1.0, .955, .90))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    direction = Vector((.58, .66, -.48)).normalized(); so.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); so.location = (-30, -30, 30)
    mat = S.mat_simple('frame', (.1, .1, .1)); center = Vector((-9.0, 0.0, 10.5)) - direction * 26.0
    ex = direction.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(direction).normalized()

    def bar(u0, v0, u1, v1):
        bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object
        b.scale = (abs(u1 - u0), 0.15, abs(v1 - v0)); b.location = center + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2); b.rotation_euler = Matrix((ex, direction, ey)).transposed().to_euler()
        b.data.materials.append(mat); b.visible_camera = False; b['grp'] = 'gobo'
    u0_, u1_, v0_, v1_ = -11.0, 9.0, -7.0, 7.0
    for u in (u0_, -5.5, -1.0, 4.0, u1_): bar(u - .22, v0_, u + .22, v1_)
    for v in (v0_, -2.6, 2.6, v1_): bar(u0_, v - .22, u1_, v + .22)
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = E('FILL', 12500); ar.size = 40; ar.size_y = 16; ar.color = S.E3('FILLC', (1.0, .965, .93))
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = (E('FILL_X', -10.0), -40.0, 14.0); ao.rotation_euler = (math.radians(80), 0, math.radians(E('FILL_ROT', -6.0))); ao.visible_camera = False
    nc = S.E3('NICHEC', (1.0, .915, .80)); nk = E('NICHE_L', 70); nf = E('NICHE_F', 35)
    for nid, cx, wd, top in NICHES:
        a = bpy.data.lights.new('nl_' + nid, 'AREA'); a.energy = nk * (wd / 3.0); a.size = wd * .75; a.size_y = 1.0; a.color = nc
        o = bpy.data.objects.new('nl_' + nid, a); bpy.context.collection.objects.link(o); o.location = (cx, .12, top - 1.1); o.rotation_euler = (math.radians(90 - 28), 0, 0); o.visible_camera = False
        a2 = bpy.data.lights.new('nf_' + nid, 'AREA'); a2.energy = nf * (wd / 3.0); a2.size = wd * .8; a2.size_y = wd * .5; a2.color = (1.0, .94, .85)
        o2 = bpy.data.objects.new('nf_' + nid, a2); bpy.context.collection.objects.link(o2); o2.location = (cx, -2.6, BASE_Z + 3.6); o2.rotation_euler = (math.radians(90 - 8), 0, 0); o2.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.93, .925, .92)), 1); bg.inputs['Strength'].default_value = E('WORLD', .6); sc.world = w


# ───────────── сцена, рендер ─────────────
def setup(w, h, spp):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    S.settings(sc, w, h, spp); sc.view_settings.exposure = E('EXPO', -.55); sc.view_settings.look = os.environ.get('LOOK_BW', 'AgX - Punchy')
    sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ.get('BW_THREADS', 2))
    cy = sc.cycles; b = int(os.environ.get('BW_BOUNCES', 6)); cy.max_bounces = b; cy.diffuse_bounces = min(4, b); cy.glossy_bounces = min(4, b); cy.transmission_bounces = 4; cy.transparent_max_bounces = 8
    cy.sample_clamp_indirect = 5; cy.sample_clamp_direct = 0; cy.use_adaptive_sampling = True; cy.adaptive_threshold = E('BW_ADAPT', .012); cy.adaptive_min_samples = 16
    cy.denoising_prefilter = 'ACCURATE'; cy.denoising_quality = 'HIGH'; cy.filter_width = E('BW_FILTER', 1.0)
    sc.render.film_transparent = False
    return sc


def render_strips(sc, raw, n, ov=64):
    """расчёт вертикальными полосами с перекрытием (как hall_v2.render_strips); BW_STRIPS=0,1 — выбор полос; когда все полосы готовы, склеиваются по точным пикселям в raw"""
    from PIL import Image
    W_, H_ = sc.render.resolution_x, sc.render.resolution_y; parts = []; only = os.environ.get('BW_STRIPS'); only = None if not only else [int(v) for v in only.split(',')]
    sc.render.use_border = True; sc.render.use_crop_to_border = False
    for i in range(n):
        a_, b_ = round(W_ * i / n), round(W_ * (i + 1) / n); x0, x1 = max(0, a_ - ov), min(W_, b_ + ov); f = raw.replace('.png', '_t%d.png' % i); parts.append((a_, b_, f))
        if os.path.exists(f) or (only is not None and i not in only): continue
        sc.render.border_min_x = x0 / W_; sc.render.border_max_x = x1 / W_; sc.render.border_min_y = 0.0; sc.render.border_max_y = 1.0
        sc.render.filepath = f.replace('.png', '_tmp.png'); bpy.ops.render.render(write_still=True); os.replace(f.replace('.png', '_tmp.png'), f); print('полоса %d/%d готова' % (i + 1, n), flush=True)
    if all(os.path.exists(f) for _, _, f in parts):
        out = Image.new('RGBA', (W_, H_))
        for a_, b_, f in parts: out.paste(Image.open(f).convert('RGBA').crop((a_, 0, b_, H_)), (a_, 0))
        out.save(raw); print('склейка →', raw, flush=True)


def main():
    import time
    w = int(os.environ.get('BW_W', 768 if MODE == 'preview' else PW)); h = round(w * PH / PW); spp = int(os.environ.get('BW_SPP', 24 if MODE == 'preview' else 96))
    sc = setup(w, h, spp); t0 = time.time(); build(sc); lights(sc); cam = BW.camera(sc)
    print('сцена: объектов %d, кадр %dx%d, %d сэмплов, сборка %.0f с' % (len(bpy.data.objects), w, h, spp, time.time() - t0), flush=True)
    if MODE == 'layout':
        json.dump(BW.layout_json(sc, cam), open('/tmp/bw_layout.json', 'w'), ensure_ascii=False, indent=1); print('layout → /tmp/bw_layout.json'); return
    if MODE == 'save':
        out = os.environ.get('BW_BLEND', os.path.join(HERE, 'ASTREYA_BRANDS_WALL.blend')); bpy.ops.wm.save_as_mainfile(filepath=out, compress=True); print('blend →', out, os.path.getsize(out) // 1024, 'КБ'); return
    cr = os.environ.get('CROP')
    if cr and MODE == 'preview':
        x0, x1, y0, y1 = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x = x0; sc.render.border_max_x = x1; sc.render.border_min_y = 1 - y1; sc.render.border_max_y = 1 - y0
    if MODE == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/bw_preview.png'); t1 = time.time(); bpy.ops.render.render(write_still=True); print('preview done за %.0f с' % (time.time() - t1)); return
    raw = os.environ.get('BW_RAW', '/tmp/bw_raw.png'); n = int(os.environ.get('BW_TILES', 1))
    if n > 1: render_strips(sc, raw, n)
    else: sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    print('готово', raw, flush=True)


if __name__ == '__main__':
    main()
