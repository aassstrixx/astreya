"""Сцены страниц «Товар» и «Бренд» (страницы v2): готовые кадры-подложки без упаковок — упаковки (спрайты assets/showroom/pack-*.webp) и логотипы ставит вёрстка.

  product — макро-кадр «экспонат»: травертиновый подиум с видимой верхней гранью на полу из плитки, за ним (глубина, мягкое размытие, как у длиннофокусной оптики) стена с арочной нишей и тёплой
            подсветкой по контуру; свет — солнце сквозь оконный переплёт (мягкие диагональные «окна света»), как на стене брендов и в каталоге. Справа — свободная стена под «табличку» (вёрстка).
            Масштаб: 1 ед. сцены = 10 см (упаковка 22 см = 2,2 ед.), кадр 8,0 × 4,22 ед. (2880 × 1520 px: 360 px на ед., упаковка 22 см ≈ 790 px — запас резкости для 2× экранов).
  brand   — широкий кадр с большой резкой арочной нишей слева (как ниши стены брендов, крупнее): внутри три подставки (диск и два бруска) под упаковки бренда и место под логотип в своде арки;
            справа свободная стена. Кадр 12,6 × 6,65 ед. (2880 × 1520: 228 px на ед., упаковка 22 см ≈ 500 px).

  python3 tools/showroom-assets/detail/detail_stage.py product preview     # быстрый кадр /tmp/detail_product.png (DS_W — ширина, DS_SPP — сэмплы)
  python3 tools/showroom-assets/detail/detail_stage.py brand preview
  python3 tools/showroom-assets/detail/detail_stage.py product             # итоговый: assets/detail/stage-product.webp (2880), -s (1440), stage.json (места упаковок и подиума в долях кадра)
  python3 tools/showroom-assets/detail/detail_stage.py brand
Переменные: DS_W, DS_SPP, DS_THREADS (потоков, по умолчанию 2), FSTOP (размытие фона, меньше — сильнее), SUN, FILL, LED, EXPO, WALLC (R,G,B), BW_SAT/BW_GAMMA/BW_LIFT/BW_WARM (как у стены брендов)."""
import bpy, math, os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..'))
import scene as S
import materials as MT
import realism as RL
import random
sys.path.insert(0, os.path.join(HERE, '..', 'news'))
import table_glass as TG                                   # травертин из пака CC0 (жилы, поры, фаски) — тот же материал, что у пола стола на странице «Новости»
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

OUT = os.path.join(HERE, '..', '..', '..', 'assets', 'detail')
PW, PH = 2880, 1520
G = 'detail'
ENVF = lambda k, d: float(os.environ.get(k, d))


# ---------------------------------------------------------------- общие части
def mats():
    wallc = S.E3('WALLC', (.97, .89, .75)); M = {}
    M['wall'] = MT.lime_plaster('wall_plaster', wallc, wave=ENVF('WAVE', 1.1), scale=ENVF('WALL_SC', 1.6), tone=.8)
    M['inner'] = MT.lime_plaster('niche_plaster', (wallc[0] * .97, wallc[1] * .94, wallc[2] * .86), wave=.6, scale=ENVF('WALL_SC', 1.6), tone=.6)
    M['frame'] = MT.limestone('niche_rim', (.97, .93, .84), scale=ENVF('STONE_SC', 1.2))
    M['base'] = MT.travertine('trav_base', (.88, .80, .66), ENVF('TRAV_SC', 1.2), 1.0, 1.3, honed=True)
    M['block'] = MT.travertine('trav_block', (.92, .85, .72), ENVF('TRAV_SC', 1.2) * 1.3, .8, 1.0, honed=True)
    M['floor'] = MT.limestone_floor('floor_tiles', (.97, .93, .84), tile=ENVF('TILE', 6.0))
    M['led'] = S.mat_led('led', ENVF('LED', 14.0), (1.0, .80, .52))
    return M


def sun_and_fill(center, spread, fill_at, fill_energy):
    """солнце слева-спереди через невидимый переплёт (даёт диагональные окна света) + широкая заполняющая подсветка"""
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = ENVF('SUN', 7.0); sun.angle = math.radians(ENVF('SUN_ANGLE', 1.6)); sun.color = S.E3('SUNC', (1.0, .93, .82))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    direction = Vector((.58, .66, -.48)).normalized(); so.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); so.location = (-30, -30, 30)
    mat = S.mat_simple('frame', (.1, .1, .1)); c0 = Vector(center) - direction * 26.0
    ex = direction.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(direction).normalized()
    def bar(u0, v0, u1, v1):
        bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object
        b.scale = (abs(u1 - u0), 0.15, abs(v1 - v0)); b.location = c0 + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2); b.rotation_euler = Matrix((ex, direction, ey)).transposed().to_euler()
        b.data.materials.append(mat); b.visible_camera = False; b['grp'] = 'gobo'
    u0_, u1_, v0_, v1_ = -spread, spread, -spread * .7, spread * .7
    for k in range(5): u = u0_ + (u1_ - u0_) * k / 4; bar(u - .22 * spread / 10, v0_, u + .22 * spread / 10, v1_)
    for k in range(4): v = v0_ + (v1_ - v0_) * k / 3; bar(u0_, v - .22 * spread / 10, u1_, v + .22 * spread / 10)
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = fill_energy; ar.size = 40; ar.size_y = 16; ar.color = S.E3('FILLC', (1.0, .93, .82))
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = fill_at; ao.rotation_euler = (math.radians(80), 0, 0); ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.96, .88, .78)), 1); bg.inputs['Strength'].default_value = ENVF('WORLD', .6); bpy.context.scene.world = w


def niche_lights(cx, wd, top, y_wall, zfloor):
    a = bpy.data.lights.new('nl', 'AREA'); a.energy = ENVF('NICHE_L', 190 if os.environ.get('DS_WHICH') != 'brand' else 45) * (wd / 3.0); a.size = wd * .75; a.size_y = 1.0; a.color = S.E3('NLC', (1.0, .84, .62) if os.environ.get('DS_WHICH') != 'brand' else (1.0, .90, .74))
    o = bpy.data.objects.new('nl', a); bpy.context.collection.objects.link(o); o.location = (cx, y_wall + .12, top - 1.1); o.rotation_euler = (math.radians(90 - 28), 0, 0); o.visible_camera = False
    a2 = bpy.data.lights.new('nf', 'AREA'); a2.energy = ENVF('NICHE_F', 110 if os.environ.get('DS_WHICH') != 'brand' else 20) * (wd / 3.0); a2.size = wd * .8; a2.size_y = wd * .5; a2.color = (1.0, .90, .76)
    o2 = bpy.data.objects.new('nf', a2); bpy.context.collection.objects.link(o2); o2.location = (cx, y_wall - 2.6, zfloor + 3.6); o2.rotation_euler = (math.radians(90 - 8), 0, 0); o2.visible_camera = False


def wall_with_niche(M, cx, rx, top, y0, thick, depth, z0, cutmat=None):
    wall = S.box('wall', M['wall'], -60, 60, y0, y0 + thick, z0, 24, G, bev=0.0)
    zs = top - rx
    cut = S.arch_solid('cut', cutmat or M['wall'], cx, rx, zs, y0 - .3, y0 - .3 + depth, G, z0=z0 - .01); cut.hide_render = True; cut.display_type = 'WIRE'
    bm = wall.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'
    bv = wall.modifiers.new('bev', 'BEVEL'); bv.width = .035; bv.segments = 3; bv.limit_method = 'ANGLE'
    fr = S.arch_frame('rim', M['frame'], cx, rx, zs, .20, y0 - .10, y0 + .03 - .0, G, z0=z0); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .02; fb.segments = 3; fb.limit_method = 'ANGLE'
    S.arch_frame('led', M['led'], cx, rx - .015, zs - .015, .028, y0 + .05 - .0, y0 + .13, G, z0=z0)
    return zs


def camera(sc, loc, lens, pitch, dof_dist=None, fstop=None):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 5000.0
    if dof_dist:
        cd.dof.use_dof = True; cd.dof.focus_distance = dof_dist; cd.dof.aperture_fstop = fstop
    cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); cam.location = loc; cam.rotation_euler = (math.radians(90 - pitch), 0, 0); sc.camera = cam
    bpy.context.view_layer.update(); return cam


def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (round(v.x, 5), round(1 - v.y, 5))


def unglass(g):
    """стекло и латунь в кадре «Бренд» после цветокоррекции уходят в оливково-зелёный (hue > 95°): возвращаем такие пиксели к тёплому тону сайта (hue ≈ 86°) и немного приглушаем — кромка стекла остаётся светлой, но не грязной"""
    import numpy as np, cv2
    lab = cv2.cvtColor(np.clip(g, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32); a, b = lab[..., 1] - 128, lab[..., 2] - 128
    hue = np.degrees(np.arctan2(b, a)); ch = np.hypot(a, b); t = np.clip((hue - 92.0) / 28.0, 0, 1); w = t * t * (3 - 2 * t) * (ch > 4)
    hue2 = hue - w * (hue - 84.0) * .85; ch2 = ch * (1 - .30 * w)
    lab[..., 1] = ch2 * np.cos(np.radians(hue2)) + 128; lab[..., 2] = ch2 * np.sin(np.radians(hue2)) + 128
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)


def export(im, name):
    """цветокоррекция как у стены брендов (одна гамма на сайте): насыщеннее и теплее сырого рендера; затем регрейд под цвет сцен сайта (tools/showroom-assets/regrade_site.py --stats).
    Кадр «Бренд» (витрина) — мягче: насыщенность 1,1, гамма .92, без молочной вуали (lift 0): иначе глубина ниши и свет светильников растворяются в кремовом"""
    from PIL import Image
    import numpy as np
    brand = name in ('brand', 'product')
    g = S.grade(np.asarray(im), sat=ENVF('BW_SAT', 1.10 if brand else 1.38), gamma=ENVF('BW_GAMMA', .92 if brand else .85), lift=ENVF('BW_LIFT', 0.0 if brand else .05))
    g = np.clip(g * np.array([float(x) for x in os.environ.get('BW_WARM', '1.0,.99,.955').split(',')], np.float32), 0, 255)
    if brand: g = unglass(g)
    im2 = Image.fromarray(g.astype(np.uint8)); os.makedirs(OUT, exist_ok=True)
    im2.save(os.path.join(OUT, 'stage-%s.webp' % name), quality=int(ENVF('Q', 76 if brand else 90)), method=6)
    sw = 1600 if brand else 1440; im2.resize((sw, round(sw * PH / PW)), Image.LANCZOS).save(os.path.join(OUT, 'stage-%s-s.webp' % name), quality=int(ENVF('QS', 72 if brand else 88)), method=6)


# ---------------------------------------------------------------- товар
P_WU = ENVF('PWU', 7.6); P_HU = P_WU * PH / PW; P_PITCH = ENVF('PITCH', 5.0); P_XS = ENVF('XS', -1.25); P_TOP = ENVF('PTOP', .55); P_DIST = 64.0; P_WY = ENVF('WALLY', 8.0)
P_NRX = ENVF('NRX', 1.7); P_NTOP = ENVF('NTOP', 3.0)


def build_product(sc):
    """Общий кадр страницы товара («витрина»): стена из плит травертина (та же облицовка, что на странице бренда), арочная ниша с латунным контуром и травертиновой глубиной, подиум с латунным поясом,
    точечный тёплый свет сверху, глянцевый пол с отражением, тени веток оливы на стене (сами ветки камере не видны), камень и стеклянная сфера на полу; длиннофокусная оптика мягко размывает стену.
    Кадр бренд-нейтральный; цвет бренда HTML добавляет тонким акцентом."""
    M = mats(); M['wall'] = S.mat_simple('wall_back', (.27, .23, .17), .9); br = MT.brass_champagne('brass', col=(.74, .54, .27, 1), rough=.30)
    gf = MT.limestone_floor('floor_gloss', (.97, .93, .84), tile=ENVF('TILE', 6.0), rough=ENVF('FLOOR_R', .20)); nb = next(n for n in gf.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k_, v_ in (('Coat Weight', ENVF('FLOOR_COAT', .30)), ('Coat Roughness', .05)):
        if k_ in nb.inputs: nb.inputs[k_].default_value = v_
    S.box('floor', gf, -60, 60, -12, 40, -1.0, 0.0, G, bev=0.0)
    tb = TG.stone_mat('trav_back', tile_units=5.0, joints=False, albedo=tuple(float(v) for v in os.environ.get('BACKT', '.62,.54,.43').split(',')), chroma=.55, honed=.45, pits=.5, seed=9, cboost=1.2, box=True)
    wall_with_niche(M, P_XS, P_NRX, P_NTOP, P_WY, 2.0, 1.55, 0.0, cutmat=tb)
    cladding(P_NTOP - P_NRX, P_XS, P_NRX, P_NTOP, 0.0, y0=P_WY)
    S.arch_solid('back', tb, P_XS, P_NRX - .01, P_NTOP - P_NRX, P_WY + 1.4, P_WY + 1.6, G, z0=0.0)
    S.arch_frame('brass_arch', br, P_XS, P_NRX - .02, P_NTOP - P_NRX, .03, P_WY - .13, P_WY - .045, G, z0=0.0)
    # подиум: два яруса травертина и латунный пояс
    S.cylinder('pl_base', M['block'], P_XS, 0, 1.75, 0.0, .16, G, seg=160, bev=.03)
    S.cylinder('pl_main', M['block'], P_XS, 0, 1.38, .16, P_TOP, G, seg=160, bev=.035)
    S.cylinder('pl_band', br, P_XS, 0, 1.395, .30, .335, G, seg=160, bev=.006)
    # мелочи на полу: камень слева у ниши и стеклянная сфера справа (вне зоны таблички)
    gm = bpy.data.materials.new('glass_sphere'); gm.use_nodes = True; b_ = gm.node_tree.nodes['Principled BSDF']
    for k_, v_ in (('Transmission Weight', 1.0), ('Transmission', 1.0)):
        if k_ in b_.inputs: b_.inputs[k_].default_value = v_
    b_.inputs['Base Color'].default_value = (.93, .98, .95, 1); b_.inputs['Roughness'].default_value = .02; b_.inputs['IOR'].default_value = 1.5
    S.decor.ball('stone', M['block'], P_XS - 2.65, -.9, 0.30, .55, G, sx=1.2, sy=.95, sz=.55, seg=64, n=32)
    S.decor.ball('sph', gm, P_XS + 2.2, -1.3, .34, .34, G, seg=64, n=32)
    # тени веток оливы: ветка стоит перед стеной на обратном луче солнца над нужной точкой тени (камере не видна)
    d = Vector((.58, .66, -.48)); dist = 1.6; sh = lambda X, Z: (X - d.x / d.y * dist, P_WY - dist, Z + (-d.z) / d.y * dist)
    plants([([sh(4.1, 3.3), sh(3.1, 2.95), sh(2.1, 2.65), sh(1.1, 2.8)], 20, 1.0), ([sh(-3.7, 3.3), sh(-3.6, 2.6), sh(-3.4, 1.9)], 11, .85)], camvis=False)
    niche_lights(P_XS, 2 * P_NRX, P_NTOP, P_WY, 0.0)
    for k, (dx, dy) in enumerate(((-.2, -.2),)):
        sp = bpy.data.lights.new('spot%d' % k, 'SPOT'); sp.energy = ENVF('SPOT', 3200.0); sp.spot_size = math.radians(ENVF('SPOT_A', 34)); sp.spot_blend = .8; sp.shadow_soft_size = .15; sp.color = S.E3('SPOTC', (1.0, .91, .78))
        so = bpy.data.objects.new('spot%d' % k, sp); bpy.context.collection.objects.link(so); so.location = (P_XS + dx + .6, -2.6, 5.6)
        so.rotation_euler = (Vector((P_XS + dx, dy, P_TOP + 1.2)) - so.location).to_track_quat('-Z', 'Y').to_euler(); so.visible_camera = False
    sun_and_fill((0, P_WY, 3.0), 9.0, (-1.0, -40.0, 8.0), ENVF('FILL', 6500))
    zc = P_TOP + .30 * P_HU
    cz = zc + P_DIST * math.tan(math.radians(P_PITCH))
    cam = camera(sc, (0.0, -P_DIST, cz), 18.0 * 64.0 / (P_WU / 2), P_PITCH, dof_dist=P_DIST / math.cos(math.radians(P_PITCH)), fstop=ENVF('FSTOP', 1.4))
    return cam


def layout_product(sc, cam):
    x, y = proj(sc, cam, (P_XS, 0.0, P_TOP)); x1, _ = proj(sc, cam, (P_XS + 1.55, 0.0, P_TOP)); _, yf = proj(sc, cam, (P_XS, 1.55, P_TOP)); _, yn = proj(sc, cam, (P_XS, -1.55, P_TOP))
    _, y2 = proj(sc, cam, (P_XS, 0.0, P_TOP + 1.0))
    return {'plate': {'w': PW, 'h': PH}, 'unit_cm': 10, 'px_per_cm': round(PW / (P_WU * 10), 3), 'plinth': {'x': x, 'y': y, 'rx': round(x1 - x, 5), 'ry': round((yn - yf) / 2, 5)}, 'px_per_unit': round((y - y2) * PH, 2)}


# ---------------------------------------------------------------- бренд («витрина»)
# Арочная ниша стала витриной-кабинетом: подсвеченное матовое стекло «полумесяц» за логотипом, стеклянная полка с латунной кромкой над упаковками, точечные светильники под полкой,
# три травертиновые подставки на глянцевом полу, низкая консоль со стеклянной столешницей спереди (для 4-й…6-й упаковок), тонкое стекло-витрина по контуру арки с отражением окна.
# Кадр бренд-нейтральный (тёплый светлый); цвет бренда HTML накладывает слоем stage-brand-glow.webp (маска «полумесяца» и ореола).
B_WU = 12.6; B_HU = B_WU * PH / PW; B_BASE = .6; B_CX = ENVF('BCX', -3.15); B_RX = ENVF('BRX', 2.6); B_TOP = ENVF('BTOP', 5.9); B_PITCH = ENVF('BPITCH', 4.0)
B_SHELF_Z = 3.70; B_SHELF_T = .12; B_MOON_R = ENVF('MOONR', 1.9); B_CON_TOP = B_BASE + .30
B_PLINTHS = [('disc', 0.0, .85, 1.7, 1.7, .48), ('box', -1.85, .85, 1.3, 1.2, .30), ('box', 1.9, .85, 1.3, 1.1, .18)]
# слоты в порядке заполнения: (dx от оси ниши, глубина y, абсолютная высота опоры z) — три главных на подставках, три дополнительных на консоли впереди
_MOON = []
B_SLOTS = [(0.0, .85, B_BASE + .48), (-1.85, .85, B_BASE + .30), (1.9, .85, B_BASE + .18), (-.95, -3.0, B_CON_TOP), (.95, -3.0, B_CON_TOP), (3.35, -3.0, B_CON_TOP)]


def _nodes(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')


def glass_thin(name, tint=(.86, .94, .90), minr=.05, rough=.012):
    """тонкое стекло без преломления: прозрачная плёнка + отражение по Френелю; для теневых лучей и изнанки — полностью прозрачно (свет проходит, чёрных кают нет)"""
    m, nt, out = _nodes(name); N = nt.nodes; L = nt.links
    tr = N.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (*tint, 1)
    gs = N.new('ShaderNodeBsdfGlossy'); gs.inputs['Roughness'].default_value = rough; gs.inputs['Color'].default_value = (.98, 1.0, .98, 1)
    fr = N.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.5
    mx = N.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = minr; L.new(fr.outputs['Fac'], mx.inputs[0])
    m1 = N.new('ShaderNodeMixShader'); L.new(mx.outputs[0], m1.inputs['Fac']); L.new(tr.outputs[0], m1.inputs[1]); L.new(gs.outputs[0], m1.inputs[2])
    gm = N.new('ShaderNodeNewGeometry'); t2 = N.new('ShaderNodeBsdfTransparent'); m2 = N.new('ShaderNodeMixShader'); L.new(gm.outputs['Backfacing'], m2.inputs['Fac']); L.new(m1.outputs[0], m2.inputs[1]); L.new(t2.outputs[0], m2.inputs[2])
    lp = N.new('ShaderNodeLightPath'); t3 = N.new('ShaderNodeBsdfTransparent'); m3 = N.new('ShaderNodeMixShader'); L.new(lp.outputs['Is Shadow Ray'], m3.inputs['Fac']); L.new(m2.outputs[0], m3.inputs[1]); L.new(t3.outputs[0], m3.inputs[2])
    L.new(m3.outputs[0], out.inputs['Surface']); return m


def glass_edge(name):
    """торец и фаска толстого стекла: Glass BSDF со светло-зелёным тоном и лёгким рассеянием (свет не застревает в толще); для теневых лучей — прозрачно"""
    m, nt, out = _nodes(name); N = nt.nodes; L = nt.links
    gl = N.new('ShaderNodeBsdfGlass'); gl.inputs['IOR'].default_value = 1.52; gl.inputs['Roughness'].default_value = .03; gl.inputs['Color'].default_value = (.80, .96, .88, 1)
    tl = N.new('ShaderNodeBsdfTranslucent'); tl.inputs['Color'].default_value = (.66, .88, .78, 1)
    mx = N.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = .30; L.new(gl.outputs[0], mx.inputs[1]); L.new(tl.outputs[0], mx.inputs[2])
    tr = N.new('ShaderNodeBsdfTransparent'); lp = N.new('ShaderNodeLightPath'); fin = N.new('ShaderNodeMixShader'); L.new(lp.outputs['Is Shadow Ray'], fin.inputs['Fac']); L.new(mx.outputs[0], fin.inputs[1]); L.new(tr.outputs[0], fin.inputs[2]); L.new(fin.outputs[0], out.inputs['Surface'])
    return m


def glass_slab(name, x0, x1, y0, y1, z0, z1, face, edge):
    """плита стекла: верх и низ — тонкое стекло (отражения), боковые грани — толстый торец"""
    ob = S.box(name, face, x0, x1, y0, y1, z0, z1, G, bev=.012); ob.data.materials.append(edge)
    for p in ob.data.polygons: p.material_index = 1 if abs(p.normal.z) < .5 else 0
    return ob


def panel_mat(cx, z0, r, strength):
    """матовое стекло «полумесяц» с подсветкой сзади: тёплый белый, к краю и вверх мягко темнее, лёгкая «молочная» неоднородность"""
    m, nt, out = _nodes('moon_glass'); N = nt.nodes; L = nt.links
    tc = N.new('ShaderNodeTexCoord'); vm = N.new('ShaderNodeVectorMath'); vm.operation = 'DISTANCE'; vm.inputs[1].default_value = (cx, 1.4, z0); L.new(tc.outputs['Object'], vm.inputs[0])
    dv = N.new('ShaderNodeMath'); dv.operation = 'DIVIDE'; dv.inputs[1].default_value = r; L.new(vm.outputs['Value'], dv.inputs[0])
    rp = N.new('ShaderNodeMapRange'); rp.inputs['From Min'].default_value = .0; rp.inputs['From Max'].default_value = 1.0; rp.inputs['To Min'].default_value = 1.0; rp.inputs['To Max'].default_value = .62; rp.clamp = True; L.new(dv.outputs[0], rp.inputs['Value'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.2; nz.inputs['Detail'].default_value = 3; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    nm = N.new('ShaderNodeMapRange'); nm.inputs['To Min'].default_value = .92; nm.inputs['To Max'].default_value = 1.06; L.new(nz.outputs['Fac'], nm.inputs['Value'])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; L.new(rp.outputs['Result'], mu.inputs[0]); L.new(nm.outputs['Result'], mu.inputs[1])
    sc_ = N.new('ShaderNodeMath'); sc_.operation = 'MULTIPLY'; sc_.inputs[1].default_value = strength; L.new(mu.outputs[0], sc_.inputs[0])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, .76, .46, 1); L.new(sc_.outputs[0], em.inputs['Strength']); L.new(em.outputs[0], out.inputs['Surface']); return m


def half_moon(name, mat, cx, r, z0, y0, y1, n=120):
    """плоский полудиск (диаметр внизу, z0) толщиной y0…y1"""
    pts = [(cx + r * math.cos(math.pi - math.pi * i / n), z0 + r * math.sin(math.pi - math.pi * i / n)) for i in range(n + 1)]
    verts = [(x, y0, z) for x, z in pts] + [(x, y1, z) for x, z in pts]; m = len(pts)
    faces = [tuple(range(m)), tuple(range(2 * m - 1, m - 1, -1))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    return S.mesh_obj(name, verts, faces, mat, G), pts


def window_panel(strength):
    """светлое окно позади камеры (камере не видно): отражается в витринном стекле мягкими диагональными полосами"""
    m, nt, out = _nodes('window_refl'); N = nt.nodes; L = nt.links
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['UV'], sp.inputs[0])
    d = N.new('ShaderNodeMath'); d.operation = 'ADD'; L.new(sp.outputs['X'], d.inputs[0]); mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = .55; L.new(sp.outputs['Y'], mm.inputs[0]); L.new(mm.outputs[0], d.inputs[1])
    wv = N.new('ShaderNodeMath'); wv.operation = 'MULTIPLY'; wv.inputs[1].default_value = 1.7 * math.pi; L.new(d.outputs[0], wv.inputs[0]); sn = N.new('ShaderNodeMath'); sn.operation = 'SINE'; L.new(wv.outputs[0], sn.inputs[0])
    ss = N.new('ShaderNodeMapRange'); ss.inputs['From Min'].default_value = .45; ss.inputs['From Max'].default_value = .85; ss.inputs['To Min'].default_value = .05; ss.inputs['To Max'].default_value = 1.0; ss.clamp = True; L.new(sn.outputs[0], ss.inputs['Value'])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = strength; L.new(ss.outputs['Result'], st.inputs[0])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, .96, .88, 1); L.new(st.outputs[0], em.inputs['Strength']); L.new(em.outputs[0], out.inputs['Surface']); return m


def cladding(zs, cx=None, rx=None, top=None, base=None, y0=0.0):
    """облицовка стены травертином (плиты 40×20 см «вразбежку», швы 2 мм, три близких оттенка): вместо ровной бежевой штукатурки — живая фактура, жилы и глубина; в нише плиты вырезаются по арке"""
    cx = B_CX if cx is None else cx; rx = B_RX if rx is None else rx; top = B_TOP if top is None else top; base = B_BASE if base is None else base
    SW, SH, GAP, T = 4.0, 2.0, .018, .09; rnd = random.Random(11)
    mats = [TG.stone_mat('trav_wall%d' % i, tile_units=ENVF('WALL_TILE', 7.0), joints=False, albedo=tuple(c * ENVF('WALL_K', 1.0) for c in tt), chroma=.55, honed=.40, pits=ENVF('WALL_PITS', .55), seed=i + 1, cboost=ENVF('WALL_CB', 1.8), box=True) for i, tt in enumerate(((.80, .72, .60), (.84, .76, .63), (.77, .69, .58)))]
    cut = S.arch_solid('ccut', mats[0], cx, rx, zs, y0 - .6, y0 + .6, G, z0=base - .02); cut.hide_render = True; cut.display_type = 'WIRE'
    for row in range(0, 5):
        z0 = base + row * SH; off = (row % 2) * SW / 2
        for col in range(-4, 4):
            x0 = col * SW - off - 2.0
            if x0 + SW < -9 or x0 > 9: continue
            sb = S.box('slab', rnd.choice(mats), x0 + GAP / 2, x0 + SW - GAP / 2, y0 - T, y0 - .005, z0 + GAP / 2, z0 + SH - GAP / 2, G, bev=.012)
            if x0 < cx + rx and x0 + SW > cx - rx and z0 < top + .1:
                bm = sb.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'


def olive_limb(pts, nodes, k, rnd, leaves, ms, bevel=.03, camvis=True):
    """ветка оливы по ломаной pts (мировые координаты): стебель-кривая и супротивные пары листьев (цвет по длине, поворот пары на 90° от узла к узлу) — те же листья, что у дерева на главной"""
    cu = bpy.data.curves.new('lb', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    cu.bevel_depth = bevel; cu.materials.append(ms); ob0 = bpy.data.objects.new('lb', cu); bpy.context.collection.objects.link(ob0); ob0['grp'] = G; ob0.visible_camera = camvis
    P = [Vector(p) for p in pts]
    def at(t):
        f = t * (len(P) - 1); i = min(int(f), len(P) - 2); return P[i].lerp(P[i + 1], f - i)
    for i in range(1, nodes + 1):
        t = i / (nodes + 1) * .90 + .08; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
        for side, dv in enumerate(RL.pair_dirs(d, i, rnd, spread=1.0, up=.12, droop=.34)):
            ob = bpy.data.objects.new('lf', rnd.choice(leaves)); bpy.context.collection.objects.link(ob); ob['grp'] = G
            ob.scale = ((1.15 - .45 * t) * (.75 + rnd.random() * .5) * k,) * 3; RL.orient(ob, dv, rnd, .8, RL.tint_for(t, rnd)); ob.location = pos; ob.visible_camera = camvis
    ob = bpy.data.objects.new('lf', leaves[0]); bpy.context.collection.objects.link(ob); ob['grp'] = G; ob.visible_camera = camvis
    ob.scale = (k,) * 3; ob.rotation_euler = (at(1) - at(.92)).normalized().to_track_quat('Y', 'Z').to_euler(); ob.location = at(1)


def plants(sets=None, camvis=True):
    """три ветки оливы свисают сверху (из-под шапки сайта): две справа над табличкой, одна слева у свода — мягкие тени листьев ложатся на каменную стену по лучу окна; ветки не заходят на логотип, упаковки и табличку"""
    rnd = random.Random(5)
    ma = RL.leaf_material('olA', (.05, .085, .035), (.17, .24, .08)); mb = RL.leaf_material('olB', (.09, .14, .055), (.25, .33, .12), under=True)
    ms = bpy.data.materials.new('olStem'); ms.use_nodes = True; ms.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.30, .25, .16, 1)
    leaves = []
    for m in (ma, mb): leaves.extend(RL.leaf_variants(.80, .115, 4, 'olive', (m,)))
    sets = sets or [([(3.9, -1.2, 8.8), (3.5, -1.25, 7.5), (2.7, -1.35, 6.6), (1.8, -1.45, 6.0), (.8, -1.55, 5.6), (-.1, -1.6, 5.5)], 22, 1.0), ([(5.4, -1.1, 8.6), (5.1, -1.2, 7.2), (4.5, -1.3, 6.3), (3.9, -1.4, 5.9)], 13, .85), ([(-5.95, -1.0, 8.6), (-5.85, -1.1, 7.2), (-5.7, -1.15, 6.3), (-5.4, -1.2, 5.7)], 12, .85)]
    for pts, nodes, k in sets: olive_limb(pts, nodes, k, rnd, leaves, ms, camvis=camvis)


def decor(M, gt, br):
    """мелочи: стеклянная сфера и травертиновый камень по краям стеклянной полки (вне «полумесяца» с логотипом), два гальки на левом краю консоли"""
    z = B_SHELF_Z + B_SHELF_T
    gm = bpy.data.materials.new('glass_sphere'); gm.use_nodes = True; b = gm.node_tree.nodes['Principled BSDF']
    for k_, v_ in (('Transmission Weight', 1.0), ('Transmission', 1.0)):
        if k_ in b.inputs: b.inputs[k_].default_value = v_
    b.inputs['Base Color'].default_value = (.93, .98, .95, 1); b.inputs['Roughness'].default_value = .02; b.inputs['IOR'].default_value = 1.5
    S.decor.ball('sph', gm, B_CX - 2.05, .75, z + .40, .40, G, seg=64, n=32)
    S.decor.ball('stone1', M['block'], B_CX + 2.0, .8, z + .26, .50, G, sx=1.15, sy=.9, sz=.55, seg=64, n=32)
    S.decor.ball('stone2', M['block'], B_CX - 2.75, -3.2, B_CON_TOP + .20, .42, G, sx=1.2, sy=.95, sz=.5, seg=64, n=32)
    S.decor.ball('stone3', M['block'], B_CX - 2.3, -2.75, B_CON_TOP + .12, .26, G, sx=1.1, sy=.9, sz=.5, seg=48, n=24)


def build_brand(sc):
    M = mats(); M['wall'] = S.mat_simple('wall_back', (.27, .23, .17), .9); br = MT.brass_champagne('brass', col=(.74, .54, .27, 1), rough=.30); gt = glass_thin('glass_thin'); ge = glass_edge('glass_edge')
    gf = MT.limestone_floor('floor_gloss', (.97, .93, .84), tile=ENVF('TILE', 6.0), rough=ENVF('FLOOR_R', .20)); nb = next(n for n in gf.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k_, v_ in (('Coat Weight', ENVF('FLOOR_COAT', .30)), ('Coat Roughness', .05)):
        if k_ in nb.inputs: nb.inputs[k_].default_value = v_
    S.box('base', gf, -60, 60, -4.2, 2.0, 0.0, B_BASE, G, bev=.03)
    S.box('base_step', M['base'], -60, 60, -5.5, -4.2, 0.0, .25, G, bev=.03)
    # внутренность ниши (задняя стенка, откосы, свод) — травертин honed: темнее и глубже штукатурки, на нём белые упаковки читаются, а пятна света точечных светильников дают «сцену»
    tb = TG.stone_mat('trav_back', tile_units=5.0, joints=False, albedo=tuple(float(v) for v in os.environ.get('BACKT', '.62,.54,.43').split(',')), chroma=.55, honed=.45, pits=.5, seed=9, cboost=1.2, box=True)
    wall_with_niche(M, B_CX, B_RX, B_TOP, 0.0, 3.0, 2.05, B_BASE, cutmat=tb)
    cladding(B_TOP - B_RX); plants()
    S.arch_solid('back', tb, B_CX, B_RX - .01, B_TOP - B_RX, 1.55, 1.74, G, z0=B_BASE)
    # подставки «парят»: травертиновое тело приподнято на 6 мм, под ним тёплая подсветка (светится по полу, отражается в глянце)
    UG = .06
    for k, (kind, dx, dy, sx, sy, h) in enumerate(B_PLINTHS):
        if kind == 'disc':
            S.cylinder('pl%d' % k, M['block'], B_CX + dx, dy, sx / 2, B_BASE + UG, B_BASE + h, G, seg=128, bev=.025); S.cylinder('pk%d' % k, M['led'], B_CX + dx, dy, sx / 2 - .06, B_BASE + .005, B_BASE + UG + .005, G, seg=128, bev=.0)
        else:
            S.box('pl%d' % k, M['block'], B_CX + dx - sx / 2, B_CX + dx + sx / 2, dy - sy / 2, dy + sy / 2, B_BASE + UG, B_BASE + h, G, bev=.03); S.box('pk%d' % k, M['led'], B_CX + dx - sx / 2 + .06, B_CX + dx + sx / 2 - .06, dy - sy / 2 + .06, dy + sy / 2 - .06, B_BASE + .005, B_BASE + UG + .005, G, bev=0.0)
    decor(M, gt, br)
    # полка: стекло 12 мм, латунный профиль по передней кромке, светодиодная лента снизу
    sw = math.sqrt(B_RX ** 2 - (B_SHELF_Z - (B_TOP - B_RX)) ** 2) - .02
    glass_slab('shelf', B_CX - sw, B_CX + sw, -.06, 1.72, B_SHELF_Z, B_SHELF_Z + B_SHELF_T, gt, ge)
    S.box('shelf_rail', br, B_CX - sw - .01, B_CX + sw + .01, -.115, -.06, B_SHELF_Z - .03, B_SHELF_Z + B_SHELF_T + .02, G, bev=.012)
    S.box('shelf_led', M['led'], B_CX - sw + .1, B_CX + sw - .1, .05, .13, B_SHELF_Z - .035, B_SHELF_Z - .005, G, bev=0.0)
    # матовое стекло «полумесяц» с подсветкой, латунная рамка
    global _MOON
    pm = panel_mat(B_CX, B_SHELF_Z + B_SHELF_T, B_MOON_R, ENVF('MOON', 7.0)); moon, pts = half_moon('moon', pm, B_CX, B_MOON_R, B_SHELF_Z + B_SHELF_T, 1.42, 1.50)
    S.arch_frame('moon_rim', br, B_CX, B_MOON_R, B_SHELF_Z + B_SHELF_T, .045, 1.30, 1.52, G, z0=B_SHELF_Z + B_SHELF_T)
    # консоль впереди: травертиновое тело, латунная линия, стеклянная столешница
    cx0, cx1, cy0, cy1 = B_CX - 2.95, B_CX + 3.85, -3.9, -2.1
    S.box('con_body', M['block'], cx0, cx1, cy0, cy1, B_BASE, B_CON_TOP - .09, G, bev=.03); S.box('con_brass', br, cx0 - .01, cx1 + .01, cy0 - .01, cy1 + .01, B_CON_TOP - .09, B_CON_TOP - .075, G, bev=.006)
    glass_slab('con_top', cx0 - .02, cx1 + .02, cy0 - .02, cy1 + .02, B_CON_TOP - .075, B_CON_TOP, gt, ge)
    # латунная рамка витрины по контуру арки (тонкий профиль) и витринное стекло внутри неё
    S.arch_frame('brass_arch', br, B_CX, B_RX - .02, B_TOP - B_RX, .035, -.13, -.045, G, z0=B_BASE)
    if os.environ.get('PANE', '1') == '1':
        S.arch_solid('pane', glass_thin('glass_pane', tint=(.975, .99, .98), minr=ENVF('PANE_R', .035)), B_CX, B_RX - .02, B_TOP - B_RX, -.085, -.065, G, z0=B_BASE)
        bpy.ops.mesh.primitive_plane_add(size=1, location=(B_CX - 1.0, -45.0, 3.5)); w = bpy.context.object; w.name = 'window'; w.scale = (16.0, 1, 9.0); w.rotation_euler = (math.pi / 2, 0, 0)
        w.data.materials.append(window_panel(ENVF('WINDOW', 30.0))); w.visible_camera = False; w.visible_diffuse = False; w.visible_shadow = False; w['grp'] = G
    # свет: контур ниши и заполнение, точечные светильники под полкой
    niche_lights(B_CX, 2 * B_RX, B_TOP, 0.0, B_BASE)
    for k, (kind, dx, dy, sx, sy, h) in enumerate(B_PLINTHS):
        sp = bpy.data.lights.new('spot%d' % k, 'SPOT'); sp.energy = ENVF('SPOT', 2200.0); sp.spot_size = math.radians(ENVF('SPOT_A', 40)); sp.spot_blend = .85; sp.shadow_soft_size = .08; sp.color = S.E3('SPOTC', (1.0, .91, .78))
        so = bpy.data.objects.new('spot%d' % k, sp); bpy.context.collection.objects.link(so); so.location = (B_CX + dx - .15, .3, B_SHELF_Z - .08)
        so.rotation_euler = (Vector((B_CX + dx, 1.3, B_BASE + h)) - so.location).to_track_quat('-Z', 'Y').to_euler(); so.visible_camera = False
    ml = bpy.data.lights.new('moonl', 'AREA'); ml.energy = ENVF('MOON_L', 260.0); ml.size = B_MOON_R * 1.6; ml.size_y = B_MOON_R * .8; ml.color = (1.0, .90, .74)
    mo = bpy.data.objects.new('moonl', ml); bpy.context.collection.objects.link(mo); mo.location = (B_CX, .9, B_SHELF_Z + B_MOON_R * .6); mo.rotation_euler = (math.radians(100), 0, 0); mo.visible_camera = False
    sun_and_fill((-2.0, 0.0, 4.0), 11.0, (-2.0, -40.0, 8.0), ENVF('FILL', 6500))
    zc = ENVF('BZC', B_HU / 2 - .05); cz = zc + 64.0 * math.tan(math.radians(B_PITCH))
    cam = camera(sc, (0.0, -64.0, cz), 18.0 * 64.0 / (B_WU / 2), B_PITCH)
    _MOON = pts; return cam


def layout_brand(sc, cam):
    out = {'plate': {'w': PW, 'h': PH}, 'unit_cm': 10, 'px_per_cm': round(PW / (B_WU * 10), 3), 'base_z': B_BASE, 'pitch': B_PITCH, 'slots': []}
    for dx, dy, zt in B_SLOTS:
        px, py = proj(sc, cam, (B_CX + dx, dy, zt)); _, py2 = proj(sc, cam, (B_CX + dx, dy, zt + 1.0)); out['slots'].append({'x': px, 'y': py, 'pxcm': round((py - py2) * PH / 10.0, 3), 'dy': dy, 'hp': round(zt - B_BASE, 3)})
    xc, ytop = proj(sc, cam, (B_CX, 0.0, B_TOP)); x0, _ = proj(sc, cam, (B_CX - B_RX, 0.0, B_TOP)); x1, _ = proj(sc, cam, (B_CX + B_RX, 0.0, B_TOP)); _, ybot = proj(sc, cam, (B_CX, 0.0, B_BASE))
    out['niche'] = {'cx': xc, 'x0': round(x0, 5), 'x1': round(x1, 5), 'top': ytop, 'bottom': ybot}
    mp = [proj(sc, cam, (x, 1.45, z)) for x, z in _MOON]; ys = [p[1] for p in mp]; xs = [p[0] for p in mp]
    out['moon'] = {'r_px': round(B_MOON_R * PW / (B_WU), 1), 'pts': [list(p) for p in mp[::4]], 'cx': round((min(xs) + max(xs)) / 2, 5), 'cy': round((min(ys) + max(ys)) / 2, 5), 'w': round(max(xs) - min(xs), 5), 'h': round(max(ys) - min(ys), 5)}
    out['shelf'] = {'y': proj(sc, cam, (B_CX, -.06, B_SHELF_Z))[1]}
    return out


def make_glow(lay):
    """слой подсветки для цвета бренда (assets/detail/stage-brand-glow.webp, 1440×760, белый с альфой): маска светящегося «полумесяца» + мягкий ореол вокруг него и тонкая линия светодиодов под полкой.
    HTML заливает слой цветом бренда (mask-image + background: var(--c2), mix-blend-mode: multiply) — подсветка за стеклом окрашивается, камень и упаковки остаются нейтральными"""
    from PIL import Image
    import numpy as np, cv2
    W, H = 1440, round(1440 * PH / PW); pts = np.array([[x * W, y * H] for x, y in lay['moon']['pts']], np.float32)
    m = np.zeros((H, W), np.float32); cv2.fillPoly(m, [np.round(pts * 8).astype(np.int32)], 1.0, cv2.LINE_AA, 3)
    core = cv2.GaussianBlur(m, (0, 0), 2.0); halo = cv2.GaussianBlur(m, (0, 0), 38.0) * .78; halo2 = cv2.GaussianBlur(m, (0, 0), 90.0) * .55
    a = np.clip(np.maximum(core, np.maximum(halo, halo2)), 0, 1)
    ys = int(lay['shelf']['y'] * H); xs0, xs1 = int(pts[:, 0].min() - 60), int(pts[:, 0].max() + 60); line = np.zeros((H, W), np.float32); line[ys - 1:ys + 2, xs0:xs1] = 1.0
    a = np.clip(np.maximum(a, cv2.GaussianBlur(line, (0, 0), 5.0) * .7), 0, 1)
    rgba = np.dstack([np.full((H, W, 3), 255, np.uint8), (a * 255 + .5).astype(np.uint8)]); Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'stage-brand-glow.webp'), quality=82, method=6, alpha_quality=90)


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'product'; os.environ['DS_WHICH'] = which; mode = sys.argv[2] if len(sys.argv) > 2 else 'all'
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    pw = int(os.environ.get('DS_W', 1280 if mode == 'preview' else PW)); spp = int(os.environ.get('DS_SPP', 20 if mode == 'preview' else 72))
    S.settings(sc, pw, round(pw * PH / PW), spp)
    sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ.get('DS_THREADS', 4))
    sc.view_settings.exposure = ENVF('EXPO', -0.85)
    cam = (build_product if which == 'product' else build_brand)(sc)
    sc.render.film_transparent = False
    print('сцена собрана:', which, 'объектов', len(bpy.data.objects), flush=True)
    if mode == 'preview':
        sc.render.filepath = '/tmp/detail_%s.png' % which; bpy.ops.render.render(write_still=True)
        json.dump((layout_product if which == 'product' else layout_brand)(sc, cam), open('/tmp/detail_%s_layout.json' % which, 'w')); print('preview done'); return
    sc.render.filepath = '/tmp/detail_%s_full.png' % which; bpy.ops.render.render(write_still=True)
    lay = (layout_product if which == 'product' else layout_brand)(sc, cam)
    os.makedirs(OUT, exist_ok=True); jp = os.path.join(OUT, 'stage.json')
    d = json.load(open(jp)) if os.path.exists(jp) else {}; d[which] = lay; json.dump(d, open(jp, 'w'), ensure_ascii=False, indent=1)
    from PIL import Image
    export(Image.open('/tmp/detail_%s_full.png' % which).convert('RGB'), which)
    if which == 'brand': make_glow(lay)
    print('готово →', OUT, flush=True)


if __name__ == '__main__':
    main()
