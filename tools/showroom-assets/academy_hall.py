"""ASTREYA ACADEMY — рендеры страницы «Обучение» по макету заказчика: тёплая персиково-травертиновая аудитория с аркадой, круглым столом, вазой с оливой, флипчартом и креслами-букле.
Сцены (первый аргумент):
  hero  — первый экран: аркада (проходы в светлое помещение, ниша с полками и косметикой, арочное окно), круглый стол из травертина с вазой, бумагами и планшетом,
          флипчарт на треноге, кресла-букле, солнце с тенью оливковой листвы. Упаковки на столе в рендер НЕ запечены: их ставит вёрстка настоящими спрайтами в реальном масштабе
          по assets/academy/hall.json (места на столешнице: положение в долях кадра и «px на см»).
  mag   — раскрытый журнал на каменной плите рядом с вазой (полоса «Полезные статьи»);
  arch  — травертиновая арка с вазой и оливой на прозрачном фоне (тёмно-синий баннер внизу страницы);
  shade — тень оливковых веток на штукатурке (накладка-«дымка» для фона страницы).
Масштаб: 1 ед. сцены = 10 см.
  python3 tools/showroom-assets/academy_hall.py hero preview      # быстрый кадр /tmp/ac_hero_preview.png (AH_W — ширина, AH_SPP — сэмплы)
  python3 tools/showroom-assets/academy_hall.py hero layout       # только assets/academy/hall.json
  python3 tools/showroom-assets/academy_hall.py hero              # итог: assets/academy/hall.webp (2400 px), hall-s.webp (1200), hall.json
  python3 tools/showroom-assets/academy_hall.py mag|arch|shade    # итог: assets/academy/mag.webp | arch.webp | shade.webp
Переменные: AH_W, AH_SPP, SUN, FILL, WORLD, SKY, WARM, EXPO, WALLC, AH_SAT, AH_GAMMA, AH_LIFT, AH_WARM, CAMX/CAMY/CAMZ/TGTX/TGTZ/LENS."""
import bpy, math, os, sys, json, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import scene as S
import materials as MT
import realism as RL
import decor as DC
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

OUT = os.path.join(HERE, '..', '..', 'assets', 'academy')
G = 'ac'
args = [a for a in sys.argv[1:] if not a.startswith('-')]
SCENE = args[0] if args and args[0] in ('hero', 'mag', 'arch', 'shade') else 'hero'
MODE = next((a for a in args if a in ('preview', 'layout', 'regrade')), 'final')
SIZES = {'hero': (2800, 1100), 'mag': (1800, 1440), 'arch': (1500, 640), 'shade': (1600, 1000)}
F = lambda k, d: float(os.environ.get(k, d))
CAM_HERO = dict(loc=(F('CAMX', 16.0), F('CAMY', -46.0), F('CAMZ', 12.6)), tgt=(F('TGTX', 16.0), 0.0, F('TGTZ', 10.6)), lens=F('LENS', 27.0))
TABLE = dict(x0=11.0, x1=32.0, y0=-17.0, y1=-4.0, top=7.7)                          # массивный стол: плита 2,1 × 1,3 м со скруглённым правым торцом на каменном блоке
SUN_DIR = Vector((F('SUNX', .40), F('SUNY', .74), F('SUNZ', -.54))).normalized()      # солнце слева-спереди, невысокое: тени листвы на стене и световое пятно в дальнем помещении
W1Y, W2Y = 10.0, 40.0
AX, ARX, AZS = F('AX', 38.0), F('ARX', 13.0), F('AZS', 23.0)                             # большая арка: центр, полуширина, высота пят (верх = AZS + ARX — за кадром)
NA, NB, NC = 34.0, 47.5, 63.5                                                      # дальняя стена: центры ниши, арочного стеллажа и окна                                                               # лицо аркадной стены и дальней стены второго помещения


# ---------------- материалы и общие детали ----------------
def mats():
    M = {}
    wc = S.E3('WALLC', (.97, .89, .75))
    M['wall'] = MT.lime_plaster('wall_plaster', wc, wave=F('WAVE', 2.1), scale=.42, tone=1.15)
    M['inner'] = MT.lime_plaster('inner_plaster', (wc[0] * .985, wc[1] * .955, wc[2] * .90), wave=1.0, scale=.42, tone=.7)
    M['frame'] = MT.limestone('arch_trim', (.98, .91, .79), scale=.5)
    M['trav'] = MT.travertine('trav_top', (.95, .86, .72), .5, 1.0, 1.3, honed=True)
    M['block'] = MT.travertine('trav_block', (.92, .83, .68), .62, .9, 1.1, honed=True)
    M['ttop'] = trav_veined('trav_table_top', (.97, .90, .78), 'Y', F('VEIN', 1.0)); M['tblock'] = trav_veined('trav_table_block', (.95, .87, .74), 'Z', F('VEINB', .7))
    M['floor'] = MT.limestone_floor('hall_floor', (.70, .62, .50), tile=8.0, joint=.05, tone=.32)
    M['amber'] = glass_amber(); M['rug'] = RL.fabric_boucle('rug_wool', (.84, .76, .62), scale=F('RUGSC', 46.0), tint=.26)
    M['bronze'] = S.mat_simple('bronze', (.075, .066, .058), .42, .55)
    M['sky'] = vista_mat('vista', vista_texture('/tmp/ac_vista.png'), F('SKY', 2.6))
    M['white'] = S.mat_simple('white', (.93, .92, .90), .28)
    M['alu'] = S.mat_simple('alu', (.78, .78, .77), .35, .8)
    M['wood'] = RL.oak('shelf_oak', (.72, .56, .38), scale=1.0)
    M['glaze'] = DC.paint('vase_ceramic', (.56, .52, .46), .62, 0, 0.0, .3, bump=.6, bump_scale=14)
    M['bark'] = S.mat_simple('bark', (.21, .165, .12), .88)
    M['paper'] = S.mat_simple('paper', (.94, .93, .90), .55)
    M['navy'] = S.mat_simple('navy_cover', (.035, .075, .17), .5)
    M['pend'] = S.mat_led('pendant', F('PEND', 1.4), (1.0, .86, .68))
    M['carafe'] = DC.glass('carafe_glass', (.90, .95, .94), .06)
    return M


def trav_veined(name, tint=(1, 1, 1), axis='Z', k=1.0, sc=.5):
    """травертин стола: к обычному травертину (materials.py) добавлены выраженные слои — длинные светлые и песочные полосы вдоль распила (axis — ось, поперёк которой идут слои)"""
    m = MT.travertine(name, tint, sc, F('PITS', 1.9), 1.8, honed=True); nt = m.node_tree; L = nt.links
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    st = {'Z': (.09, .09, 1.15), 'Y': (.09, 1.15, .09), 'X': (1.15, .09, .09)}[axis]
    v1 = MT._noise(nt, MT._coord(nt, st), 2.4, 6, .62, 1.6); v2 = MT._noise(nt, MT._coord(nt, tuple(x * 2.3 for x in st)), 3.6, 5, .6, .9)
    f = MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', v1, .68), MT._math(nt, 'MULTIPLY', v2, .32))
    rp = MT._ramp(nt, [(.30, (.66, .54, .40, 1)), (.44, (.88, .80, .68, 1)), (.58, (1, 1, 1, 1)), (.72, (.90, .83, .72, 1)), (.86, (1, .98, .94, 1))]); L.new(f, rp.inputs['Fac'])
    src = b.inputs['Base Color'].links[0].from_socket
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = k
    L.new(src, mx.inputs['A']); L.new(rp.outputs['Color'], mx.inputs['B'])
    v3 = MT._noise(nt, MT._coord(nt, tuple(x * 5.0 for x in st)), 5.0, 4, .55, 2.2)                                        # тонкие прожилки: узкая «щель» в шуме, вытянутом вдоль слоёв
    ln = MT._ramp(nt, [(.470, (1, 1, 1, 1)), (.495, (.70, .60, .46, 1)), (.520, (1, 1, 1, 1))]); L.new(v3, ln.inputs['Fac'])
    m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.blend_type = 'MULTIPLY'; m2.inputs['Factor'].default_value = F('VEIN2', .8)
    L.new(mx.outputs['Result'], m2.inputs['A']); L.new(ln.outputs['Color'], m2.inputs['B']); L.new(m2.outputs['Result'], b.inputs['Base Color'])
    return m


def glass_amber(name='amber_glass'):
    """тёмное янтарное стекло флаконов: настоящее преломление вместо «крашеного пластика»"""
    m, nt, b, o = S.mk(name)
    S.inp(b, 'Base Color').default_value = (.36, .13, .03, 1); S.val(b, 1.0, 'Transmission Weight', 'Transmission'); S.val(b, .04, 'Roughness'); S.val(b, 1.52, 'IOR')
    return m


def vista_mat(name, path, k):
    """даль за окном как светящаяся картинка (по габаритам плоскости: u = X, v = Z)"""
    m, nt, b, o = S.mk(name); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(path); tex.extension = 'EXTEND'
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); cb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(tc.outputs['Generated'], sp.inputs['Vector'])
    nt.links.new(sp.outputs['X'], cb.inputs['X']); nt.links.new(sp.outputs['Z'], cb.inputs['Y']); nt.links.new(cb.outputs['Vector'], tex.inputs['Vector'])
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(tex.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = k; nt.links.new(em.outputs['Emission'], o.inputs['Surface']); return m


def sky_mat(name, k):
    """вид из окна: мягкий градиент — тёплая дымка внизу, бледно-голубое небо вверху (эмиссия, чтобы не выгорало в белый)"""
    m, nt, b, o = S.mk(name)
    em = nt.nodes.new('ShaderNodeEmission'); tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); cr = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sp.inputs['Vector']); nt.links.new(sp.outputs['Z'], cr.inputs['Fac'])
    cr.color_ramp.elements[0].position = .0; cr.color_ramp.elements[0].color = (1.0, .78, .55, 1); cr.color_ramp.elements[1].position = .85; cr.color_ramp.elements[1].color = (.72, .84, .98, 1)
    e = cr.color_ramp.elements.new(.42); e.color = (1.0, .93, .82, 1)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 7.0; nz.inputs['Detail'].default_value = 6.0; nz.inputs['Roughness'].default_value = .62
    nt.links.new(tc.outputs['Generated'], nz.inputs['Vector'])
    cut = nt.nodes.new('ShaderNodeMath'); cut.operation = 'ADD'; nt.links.new(nz.outputs['Fac'], cut.inputs[0]); nt.links.new(sp.outputs['Z'], cut.inputs[1])        # z + шум — неровная кромка крон
    msk = nt.nodes.new('ShaderNodeMath'); msk.operation = 'LESS_THAN'; nt.links.new(cut.outputs[0], msk.inputs[0]); msk.inputs[1].default_value = .62
    tcol = nt.nodes.new('ShaderNodeValToRGB'); tcol.color_ramp.elements[0].color = (.07, .12, .05, 1); tcol.color_ramp.elements[1].color = (.30, .40, .17, 1); nt.links.new(nz.outputs['Fac'], tcol.inputs['Fac'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(msk.outputs[0], mx.inputs['Factor']); nt.links.new(cr.outputs['Color'], mx.inputs['A']); nt.links.new(tcol.outputs['Color'], mx.inputs['B'])
    nt.links.new(mx.outputs['Result'], em.inputs['Color']); em.inputs['Strength'].default_value = k
    nt.links.new(em.outputs['Emission'], o.inputs['Surface']); return m


def vista_texture(path, w=2000, h=1200):
    """даль за окном: небо с перистыми облаками, три гряды холмов в воздушной дымке (дальние — светлее и голубее), кипарисы и кроны на ближней гряде; слегка размыта, как фон вне фокуса"""
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np
    rnd = random.Random(17); yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    top = np.array([118, 164, 222], np.float32); hor = np.array([238, 230, 212], np.float32); sky = top + (hor - top) * np.clip(yy / .62, 0, 1) ** 1.25
    a = np.broadcast_to(sky, (h, w, 3)).copy()
    cl = Image.new('L', (w, h), 0); d = ImageDraw.Draw(cl)
    for _ in range(46):                                         # облака: вытянутые пятна, сильное размытие
        cx, cy = rnd.uniform(0, w), rnd.uniform(.05 * h, .46 * h); rx, ry = rnd.uniform(90, 330), rnd.uniform(14, 44)
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=rnd.randint(70, 190))
    cl = np.asarray(cl.filter(ImageFilter.GaussianBlur(26)), np.float32)[..., None] / 255.0
    a = a * (1 - .8 * cl) + np.array([252, 250, 246], np.float32) * (.8 * cl)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    def ridge(base, amp, col, seed, trees=0, tcol=None):
        r = random.Random(seed); ph = [r.uniform(0, 6.28) for _ in range(5)]; fr = [r.uniform(.6, 1.6) * k for k in (1, 2.3, 4.1, 7.7, 13.0)]
        prof = [base * h - amp * h * sum(math.sin(x / w * 6.283 * f + q) / (i + 1) for i, (f, q) in enumerate(zip(fr, ph))) / 1.8 for x in range(w + 1)]
        d.polygon([(0, h)] + [(x, prof[x]) for x in range(0, w + 1, 4)] + [(w, h)], fill=col)
        for _ in range(trees):
            x = r.uniform(0, w); y0 = prof[int(x)] + r.uniform(0, 26); k = r.uniform(.7, 1.5)
            if r.random() < .45: d.polygon([(x - 9 * k, y0), (x, y0 - 86 * k), (x + 9 * k, y0)], fill=tcol[0])                 # кипарис
            else:
                rr_ = r.uniform(22, 46) * k; d.ellipse([x - rr_, y0 - rr_ * 1.5, x + rr_, y0 + rr_ * .3], fill=tcol[r.randint(0, len(tcol) - 1)])
    ridge(.62, .035, (176, 192, 206), 1); ridge(.68, .045, (150, 170, 168), 2); ridge(.75, .05, (122, 146, 118), 3, 26, [(92, 116, 88), (104, 128, 92)])
    ridge(.86, .035, (104, 132, 84), 4, 34, [(58, 84, 52), (74, 102, 58), (88, 112, 62)])
    im = im.filter(ImageFilter.GaussianBlur(2.2))
    hz = Image.new('RGB', (w, h), (240, 232, 214)); m = Image.linear_gradient('L').resize((w, h)); m = m.point(lambda v: int(max(0, 70 - abs(v - 168) * 1.6)))        # лёгкая дымка у горизонта
    im = Image.composite(hz, im, m); im.save(path); return path


def grass_mat():
    m, nt, b, o = S.mk('lawn'); n = MT._noise(nt, MT._coord(nt, (1, 1, 1)), 3.0, 6, .7); r = MT._ramp(nt, [(.3, (.10, .17, .05, 1)), (.6, (.19, .28, .09, 1)), (.8, (.30, .36, .14, 1))])
    nt.links.new(n, r.inputs['Fac']); nt.links.new(r.outputs['Color'], b.inputs['Base Color']); S.val(b, .9, 'Roughness'); return m


def oliv_leaves():
    ma = RL.leaf_material('olive_leafA', (.05, .085, .035), (.16, .23, .075)); mb = RL.leaf_material('olive_leafB', (.085, .125, .05), (.23, .30, .105), under=True)
    leaves = []
    for m in (ma, mb): leaves.extend(RL.leaf_variants(.60, .082, 4, 'olive', (m,)))
    return leaves


def olive_stem(rnd, leaves, bark, pts, count, k, r0, r1, hide=False):
    """ветка: кривая со стеблем и супротивными парами листьев (realism.py); hide — не видна камере, но отбрасывает тень"""
    cu = bpy.data.curves.new('tw', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, q in enumerate(pts): sp.points[i].co = (q[0], q[1], q[2], 1); sp.points[i].radius = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
    cu.bevel_depth = 1.0; cu.bevel_resolution = 3; cu.use_fill_caps = True; cu.materials.append(bark)
    ob = bpy.data.objects.new('tw', cu); bpy.context.collection.objects.link(ob); ob['grp'] = G
    if hide: ob.visible_camera = False
    def at(t):
        f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i + 1], f - i)
    for i in range(1, count + 1):
        t = i / (count + 1) * .94 + .06; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
        for dv in RL.pair_dirs(d, i, rnd, spread=1.0, up=.20, droop=.24):
            lf = bpy.data.objects.new('lf', rnd.choice(leaves)); bpy.context.collection.objects.link(lf); lf['grp'] = G
            lf.scale = ((1.15 - .40 * t) * (.74 + rnd.random() * .56) * k,) * 3; RL.orient(lf, dv, rnd, .8, RL.tint_for(t, rnd)); lf.location = pos
            if hide: lf.visible_camera = False
    return at


def vase_with_olive(M, leaves, rnd, x, y, z, H=3.6, n=9, stem=(3.2, 5.2)):
    """керамическая ваза и пучок оливковых веток"""
    DC.vase('vase', 'amphora', M['glaze'], x, y, z, H, G, W=H * .62)
    neck = Vector((x, y, z + H * .92))
    for j in range(n):
        az = rnd.uniform(0, 6.283); el = rnd.uniform(.85, 1.35) if j else 1.5; Lb = rnd.uniform(*stem) * (1.0 if j % 2 else .8)
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))).normalized()
        pts = [neck, neck + d * Lb * .35 + Vector((0, 0, .1)), neck + d * Lb * .70 + Vector((0, 0, .18)), neck + d * Lb + Vector((0, 0, -.05 * Lb))]
        at = olive_stem(rnd, leaves, M['bark'], pts, 34, 1.0, .028, .008)
        for t in (.45, .68):
            P = at(t); az2 = az + rnd.choice((-1, 1)) * rnd.uniform(.5, .9); d2 = Vector((math.cos(az2) * math.cos(el), math.sin(az2) * math.cos(el), math.sin(el) * .8 + .15)).normalized(); L2 = Lb * rnd.uniform(.28, .4)
            olive_stem(rnd, leaves, M['bark'], [P, P + d2 * L2 * .5 + Vector((0, 0, .05)), P + d2 * L2 + Vector((0, 0, -.03))], 10, .95, .012, .006)


def potted_olive(M, leaves, rnd, x, y, H=21.0, rx=6.2, ry=4.0, rz=5.6, nb=112, lean=.5):
    """высокая олива в травертиновом кашпо (по макету — растение слева): толстый изогнутый ствол, несколько стволов-ветвей, пышная овальная крона из веток с супротивными парами листьев"""
    z0 = .30; pot_h = 3.0
    DC.lathe('pot', [(0, 0), (1.25, 0), (1.45, .15), (1.62, pot_h * .55), (1.66, pot_h), (1.55, pot_h + .25), (1.34, pot_h + .2), (0, pot_h + .2)], M['block'], G, x, y, z0, seg=96)
    DC.lathe('soil', [(0, pot_h + .1), (1.34, pot_h + .1), (1.34, pot_h + .22), (0, pot_h + .22)], S.mat_simple('soil', (.06, .045, .032), .96), G, x, y, z0, seg=48)
    V = Vector; base = V((x, y, z0 + pot_h + .15)); top = V((x + lean, y - .1, z0 + H * .66)); cz = z0 + H * .74
    cen = V((x + lean + .2, y, cz))
    def inside(q): return ((q.x - cen.x) / rx) ** 2 + ((q.y - cen.y) / ry) ** 2 + ((q.z - cen.z) / rz) ** 2 <= 1.0
    trunk = [base, base + V((.10, 0, H * .20)), base + V((lean * .5, -.08, H * .40)), base + V((lean * .85, .06, H * .56)), top]
    tr = olive_stem(rnd, leaves, M['bark'], trunk, 4, .9, .38, .20)
    limbs = []
    for sgn, k in ((-1, 0), (1, 1), (0, 2)):                           # три ветви-ствола вверх и в стороны
        e = V((top.x + sgn * rx * .55, top.y - .3 + sgn * .0, cz + (k - .6) * 1.2))
        pts = [top, top + V((sgn * .5, 0, 1.4)), top.lerp(e, .6) + V((0, -.1, .6)), e]
        limbs.append(olive_stem(rnd, leaves, M['bark'], pts, 12, .95, .17, .06))
    for j in range(nb):
        P0 = rnd.choice(limbs)(rnd.uniform(.15, 1.0))
        rad = V((P0.x - cen.x, (P0.y - cen.y) * .5, P0.z - cen.z)); rad = rad.normalized() if rad.length > .2 else V((0, 0, 1))
        d = (rad * rnd.uniform(.5, 1.0) + V((rnd.uniform(-.7, .7), rnd.uniform(-.7, .3), rnd.uniform(-.3, .7)))).normalized(); Lb = rnd.uniform(1.8, 3.2)
        for _ in range(7):
            if inside(P0 + d * Lb): break
            Lb *= .8
        else: continue
        pts = [P0, P0 + d * Lb * .3 + V((0, 0, .1)), P0 + d * Lb * .6 + V((0, 0, .12)), P0 + d * Lb + V((0, 0, -.1 * Lb))]
        at = olive_stem(rnd, leaves, M['bark'], pts, 26, 1.15, .034, .009)
        for t in (.35, .58, .78):
            P = at(t); az = rnd.uniform(0, 6.283); d2 = (d * .6 + V((math.cos(az), math.sin(az) * .4, rnd.uniform(-.3, .6)))).normalized(); L2 = Lb * rnd.uniform(.3, .45)
            olive_stem(rnd, leaves, M['bark'], [P, P + d2 * L2 * .5 + V((0, 0, .05)), P + d2 * L2 + V((0, 0, -.04))], 9, 1.05, .013, .006)


def rod(name, p0, p1, r, mat):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=r, depth=d.length, location=(p0 + p1) / 2); ob = bpy.context.object; ob.name = name
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); ob['grp'] = G; return ob


def parent_all(objs, x, y, rot, z=0.0):
    emp = bpy.data.objects.new('root', None); bpy.context.collection.objects.link(emp); emp.location = (x, y, z); emp.rotation_euler = (0, 0, rot)
    for o in objs: o.parent = emp
    return emp


def shell_mesh(R, z0, z1, t, a0, a1, drop, n=48):
    """изогнутая спинка-«ракушка»: сечение — прямоугольник толщиной t, дуга по углу, верхняя кромка опускается к концам (drop); торцы закрыты"""
    import bmesh
    bm = bmesh.new(); rings = []
    for i in range(n + 1):
        u = i / n; a = a0 + (a1 - a0) * u; ca, sa = math.cos(a), math.sin(a); zt = z1 - drop * abs(2 * u - 1) ** 2.4
        rings.append([bm.verts.new((-ca * rr, -sa * rr, zz)) for rr, zz in ((R + t, z0), (R + t, zt), (R, zt - .012), (R, z0))])
    for i in range(n):
        for k in range(4): bm.faces.new((rings[i][k], rings[i][(k + 1) % 4], rings[i + 1][(k + 1) % 4], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); me = bpy.data.meshes.new('shell'); bm.to_mesh(me); bm.free(); return me


def chair(M, x, y, rot, col=(.93, .85, .73), seed=1, tub=False):
    """кресло-букле в натуральную величину (строится в метрах и увеличивается корневым пустым ×10 — текстура петель букле остаётся настоящего размера):
    мягкая подушка сиденья со швом и прогибом, основание-рама, спинка-ракушка толщиной 7 см с закруглёнными кромками, четыре конические ножки из дуба"""
    boucle = RL.fabric_boucle('boucle%d' % seed, col, scale=F('BOUCLE', 4.2), tint=.24)                  # крупное букле: петли ≈ 1,2 см — фактура ткани читается на общем плане
    root = bpy.data.objects.new('chair', None); bpy.context.collection.objects.link(root); root.location = (x, y, 0); root.rotation_euler = (0, 0, rot); root.scale = (10, 10, 10)
    RL.cushion('ch_frame', boucle, .50, .50, .09, (.01, 0, .30), parent=root, r=.12, rz=.03, belly=.004, wrinkle=.0008, seed=seed, n=22)
    RL.cushion('ch_seat', boucle, .50, .50, .11, (.03, 0, .395), parent=root, r=.14, rz=.045, crown=.012, crown_b=.10, belly=.012, sag=.006, wrinkle=.0016, seed=seed + 4, n=28)
    back = RL._obj('ch_back', shell_mesh(.285, .33, .80, .075, math.radians(-118), math.radians(118), .13), boucle, root)
    bv = back.modifiers.new('bev', 'BEVEL'); bv.width = .024; bv.segments = 4; bv.limit_method = 'ANGLE'
    ss = back.modifiers.new('sub', 'SUBSURF'); ss.levels = 1; ss.render_levels = 2
    if tub: RL.cushion('ch_skirt', boucle, .47, .47, .29, (.01, 0, .150), parent=root, r=.13, rz=.02, belly=.004, wrinkle=.0008, seed=seed + 9, n=22)
    else:
        for sx, sy in ((.17, .17), (.17, -.17), (-.17, .17), (-.17, -.17)): RL._leg('ch_leg', M['wood'], sx, sy, 0.0, .34, .013, .021, root)
    return root


def board_texture(path, w=900, h=1300):
    """лист флипчарта: рукописные строки синим маркером на белом"""
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (248, 248, 246)); d = ImageDraw.Draw(im); rnd = random.Random(9)
    d.line([(90, 96), (470, 96)], fill=(40, 58, 110), width=7); y = 170
    while y < h - 420:
        x = 90 + (40 if rnd.random() < .25 else 0)
        while x < w - 200:
            ln = rnd.randint(50, 150)
            pts = [(x + k * 6, y + math.sin(k * 1.3 + rnd.random() * 6) * 4 + rnd.uniform(-1.5, 1.5)) for k in range(ln // 6)]
            if len(pts) > 1: d.line(pts, fill=(52 + rnd.randint(0, 24), 66, 112), width=3)
            x += ln + rnd.randint(14, 30)
            if rnd.random() < .12: break
        y += 40 + (26 if rnd.random() < .2 else 0)
    d.ellipse([w - 330, h - 380, w - 110, h - 180], outline=(52, 70, 118), width=4); d.line([(120, h - 300), (420, h - 300), (420, h - 180), (120, h - 180), (120, h - 300)], fill=(52, 70, 118), width=4)
    im.save(path); return path


def paper_texture(path, w=1400, h=1000):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (250, 249, 246)); d = ImageDraw.Draw(im); rnd = random.Random(5); y = 70
    while y < h - 60:
        x = 70
        for _ in range(rnd.randint(3, 6)):
            ln = rnd.randint(120, 380)
            if x + ln > w - 70: break
            d.rectangle([x, y, x + ln, y + 9], fill=(150 + rnd.randint(-15, 15), 155, 165)); x += ln + 24
        y += 34
    im.save(path); return path


def img_mat(name, path, rough=.45, axes=None):
    m, nt, b, o = S.mk(name); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(path); tex.image.colorspace_settings.name = 'sRGB'
    if axes:                                                   # axes='xz': u = X, v = Z объекта (0…1 по габаритам)
        tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); cb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(tc.outputs['Generated'], sp.inputs['Vector'])
        nt.links.new(sp.outputs[axes[0].upper()], cb.inputs['X']); nt.links.new(sp.outputs[axes[1].upper()], cb.inputs['Y']); nt.links.new(cb.outputs['Vector'], tex.inputs['Vector']); tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], S.inp(b, 'Base Color')); S.val(b, rough, 'Roughness'); return m


def cast_branches(M, leaves, rnd, clusters, per=10, count=40, k=1.35, s0=18.0, s1=28.0, wall_y=0.0, d=None):
    """невидимые для камеры ветки между солнцем и стеной: на штукатурке остаётся живая тень листвы. clusters — центры теней на стене (x, z)"""
    d = d or Vector((.52, .62, -.52)).normalized()
    for (cx, cz) in clusters:
        for _ in range(per):
            tx, tz = cx + rnd.uniform(-8, 8), cz + rnd.uniform(-6, 6); s = rnd.uniform(s0, s1); P = Vector((tx, wall_y, tz)) - d * s
            a = rnd.uniform(-.5, .5); u = Vector((math.cos(a), 0.0, math.sin(a))); Lb = rnd.uniform(4.5, 7.5)
            pts = [P, P + u * Lb * .33 + Vector((0, 0, .3)), P + u * Lb * .66, P + u * Lb + Vector((0, 0, -.5))]
            olive_stem(rnd, leaves, M['bark'], pts, count, k, .04, .01, hide=True)


# ---------------- hero ----------------
def smooth_by_angle(ob, deg=40):
    try:
        bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.shade_auto_smooth(angle=math.radians(deg)); ob.select_set(False)
    except Exception: pass


def slab(name, mat, x0, x1, y0, y1, z0, z1, rl=1.0, bev=.07):
    """плита стола: левый торец прямой со скруглёнными углами, правый — полукруг"""
    import bmesh
    bm = bmesh.new(); cy = (y0 + y1) / 2; R = (y1 - y0) / 2; pts = []; n = 10; m = 56
    for i in range(n + 1): a = math.pi + (math.pi / 2) * i / n; pts.append((x0 + rl + rl * math.cos(a), y0 + rl + rl * math.sin(a)))
    for i in range(m + 1): a = -math.pi / 2 + math.pi * i / m; pts.append((x1 - R + R * math.cos(a), cy + R * math.sin(a)))
    for i in range(n + 1): a = math.pi / 2 + (math.pi / 2) * i / n; pts.append((x0 + rl + rl * math.cos(a), y1 - rl + rl * math.sin(a)))
    vb = [bm.verts.new((x, y, z0)) for x, y in pts]; vt = [bm.verts.new((x, y, z1)) for x, y in pts]; k = len(pts)
    bm.faces.new(vb[::-1]); bm.faces.new(vt)
    for i in range(k): bm.faces.new((vb[i], vb[(i + 1) % k], vt[(i + 1) % k], vt[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob['grp'] = G
    bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bev; bv.segments = 4; bv.limit_method = 'ANGLE'
    smooth_by_angle(ob); return ob


def books(x, y, z, M, rnd, cols):
    """стопка из трёх книг в тканевых обложках (сцена в единицах по 10 см)"""
    for i in range(3):
        w = rnd.uniform(2.3, 2.8); d = w * .74; th = rnd.uniform(.28, .42); dx = rnd.uniform(-.12, .12)
        S.box('book', cols[i % len(cols)], x - w / 2 + dx, x + w / 2 + dx, y - d / 2, y + d / 2, z, z + th, G, bev=.03)
        S.box('pages', M['paper'], x - w / 2 + dx + .06, x + w / 2 + dx, y - d / 2 + .04, y + d / 2 - .04, z + .04, z + th - .04, G); z += th
    return z


def bottle(kind, x, y, z, H, body, cap, label=None):
    """флакон на столе (размеры — в единицах сцены, 1 = 10 см): помпа, пипетка, туба или баночка; label — светлая этикетка-поясок"""
    k = DC.PK
    if kind == 'pump':
        DC.pump_bottle(x, y, z, H / k, body, cap); r = H * .17
        if label: DC.lathe('lbl', [(r * 1.012, .16 * H), (r * 1.012, .50 * H)], label, G, x, y, z, 48, caps=False)
    elif kind == 'drop':
        DC.dropper(x, y, z, H / k, body, DC.brass('champ_collar2'), cap); r = H * .2
        if label: DC.lathe('lbl', [(r * 1.012, .12 * H), (r * 1.012, .40 * H)], label, G, x, y, z, 48, caps=False)
    elif kind == 'tube': DC.squeeze_tube(x, y, z, H / k, body, cap)
    elif kind == 'jar': DC.cream_jar(x, y, z, H * 1.25 / k, H / k, body, cap)
    else: S.box('pbox', body, x - H * .26, x + H * .26, y - H * .2, y + H * .2, z, z + H, G, bev=.04)


def shelf_row(cx, y, z, w, rr, pal, n=5, hk=1.0):
    """ряд косметики на полке: n предметов по ширине w, случайные формы и высоты"""
    kinds = ('pump', 'drop', 'jar', 'tube', 'pump', 'box', 'drop')
    for i in range(n):
        x = cx - w / 2 + w * (i + .5) / n + rr.uniform(-.12, .12); kd = kinds[(i + rr.randint(0, 6)) % len(kinds)]
        body, cap = rr.choice(pal); H = {'pump': 1.9, 'drop': 1.3, 'jar': .7, 'tube': 1.5, 'box': 1.3}[kd] * rr.uniform(.85, 1.1) * hk
        bottle(kd, x, y + rr.uniform(-.12, .12), z, H, body, cap)


def build_hero(sc):
    """первый экран по макету: слева — тёплая штукатурная стена с тенью листвы (под текст), по центру-справа — массивный травертиновый стол с вазой и флаконами,
    за ним большая арка в соседнее помещение: ниша с полками, арочный стеллаж с тумбой, окно, флипчарт; кресла-букле"""
    M = mats(); rnd = random.Random(21); leaves = oliv_leaves(); T = TABLE
    S.box('floor', M['floor'], -300, 300, -250, 80.0, -0.5, 0.0, G)
    # --- аркадная стена: большая арка справа, слева — гладь под текст ---
    w1 = S.box('wall1', M['wall'], -260, 260, W1Y, W1Y + 6.0, 0.0, 46.0, G)
    cut = S.arch_solid('cut1', M['wall'], AX, ARX, AZS, W1Y - .6, W1Y + 6.6, G, z0=-.05); cut.hide_render = True; cut.display_type = 'WIRE'
    bm = w1.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'
    bv = w1.modifiers.new('bev', 'BEVEL'); bv.width = .14; bv.segments = 4; bv.limit_method = 'ANGLE'
    rim = S.arch_frame('rim1', M['frame'], AX, ARX, AZS, 1.5, W1Y - .28, W1Y + .1, G, n=160, z0=0.0); rb = rim.modifiers.new('bev', 'BEVEL'); rb.width = .07; rb.segments = 3; rb.limit_method = 'ANGLE'          # каменное обрамление большой арки
    # --- второе помещение: дальняя стена с нишей, арочным стеллажом и окном; боковые стены и потолок (свет — через арку и окно) ---
    w2 = S.box('wall2', M['inner'], -40, 120, W2Y, W2Y + 4.0, 0.0, 46.0, G)
    cuts = [('nA', NA, 3.2, 17.5, 3.5, W2Y + 2.2), ('nB', NB, 7.6, 15.5, -.05, W2Y + 3.0), ('nC', NC, 4.7, 19.2, -.05, W2Y + 2.7)]
    for nm, cx, rx, zs, z0, y1 in cuts:
        c = S.arch_solid('cut' + nm, M['inner'], cx, rx, zs, W2Y - .6, y1, G, z0=z0); c.hide_render = True; c.display_type = 'WIRE'
        b2 = w2.modifiers.new('cut' + nm, 'BOOLEAN'); b2.operation = 'DIFFERENCE'; b2.object = c; b2.solver = 'EXACT'
    bv = w2.modifiers.new('bev', 'BEVEL'); bv.width = .10; bv.segments = 3; bv.limit_method = 'ANGLE'
    for nm, cx, rx, zs, z0, y1 in cuts:                         # обрамления ниши, стеллажа и окна
        fr = S.arch_frame('rim' + nm, M['frame'], cx, rx, zs, .55, W2Y - .2, W2Y + .08, G, n=96, z0=max(0.0, z0)); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .04; fb.segments = 3; fb.limit_method = 'ANGLE'
    S.box('side_l', M['inner'], 16.0, 20.0, W1Y + 6.0, W2Y, 0.0, 46.0, G); S.box('side_r', M['inner'], 73.0, 77.0, W1Y + 6.0, W2Y, 0.0, 46.0, G)
    S.box('ceil', M['inner'], 16.0, 77.0, W1Y, W2Y + 4.0, 46.0, 47.0, G)
    pal_w = DC.paint('pb_white', (.92, .91, .88), .40, 0, .15, .08); pal_d = DC.paint('pb_dark', (.022, .020, .022), .30, 0, .3, .1); pal_s = DC.paint('pb_sand', (.80, .68, .52), .5, 0, .1, .1)
    amber = M['amber']; paperw = DC.paint('lbl_paper', (.95, .94, .91), .55)
    pal = [(pal_w, pal_d), (pal_w, pal_w), (pal_s, pal_w), (amber, pal_d), (pal_w, pal_s)]
    rr = random.Random(4)
    # ниша A: четыре травертиновые полки с косметикой
    for zz in (7.0, 10.4, 13.8, 17.0): S.box('shA', M['trav'], NA - 3.2, NA + 3.2, W2Y + .15, W2Y + 2.2, zz, zz + .35, G, bev=.04)
    for zz in (3.5, 7.35, 10.75, 14.15): shelf_row(NA, W2Y + 1.2, zz, 5.2, rr, pal, n=4)
    DC.vase('nvA', 'gourd', M['glaze'], NA, W2Y + 1.2, 17.35, 1.9, G, W=1.3)
    # арочный стеллаж B: дубовая тумба с каменной столешницей, две полки, полотенца, ваза с эвкалиптом
    S.box('cab', M['wood'], NB - 7.0, NB + 7.0, W2Y + .5, W2Y + 3.0, 0.0, 7.4, G, bev=.05); S.box('cab_top', M['trav'], NB - 7.3, NB + 7.3, W2Y + .2, W2Y + 3.0, 7.4, 7.9, G, bev=.05)
    for dx in (-3.5, 0.0, 3.5): S.box('cab_gap', pal_d, NB + dx - .03, NB + dx + .03, W2Y + .46, W2Y + .52, .4, 7.2, G)
    for zz in (12.6, 17.6): S.box('shB', M['trav'], NB - 7.4, NB + 7.4, W2Y + .3, W2Y + 3.0, zz, zz + .4, G, bev=.04)
    shelf_row(NB - 2.6, W2Y + 1.6, 7.9, 7.4, rr, pal, n=5, hk=1.1); shelf_row(NB, W2Y + 1.7, 13.0, 12.0, rr, pal, n=8); shelf_row(NB - 1.6, W2Y + 1.7, 18.0, 8.4, rr, pal, n=5)
    lin = RL.fabric_linen('nlinen', (.93, .89, .81), scale=10.0)
    for i in range(3): S.box('towel', lin, NB + 3.2, NB + 6.0, W2Y + .8, W2Y + 2.7, 7.9 + i * .36, 7.9 + i * .36 + .32, G, bev=.09)
    DC.vase('nvB', 'amphora', M['glaze'], NB + 5.0, W2Y + 1.7, 18.0, 2.2, G, W=1.4)
    DC.eucalyptus(NB + 5.0, W2Y + 1.7, 19.9, 3.2, DC.paint('euc_leaf', (.40, .48, .38), .5, 0, .05, .1), M['bark'], rr, G, n=5, spread=.9)
    # ниша C (на месте прежнего окна): тёплая подсветка сверху, травертиновый постамент, высокая керамическая ваза с ветками, внизу — стопка камней
    S.cylinder('ped_c', M['tblock'], NC, W2Y + 1.35, 1.75, 0.0, 6.4, G, seg=96, bev=.07)
    DC.vase('nvC', 'amphora', M['glaze'], NC, W2Y + 1.35, 6.4, 4.2, G, W=2.5)
    rc = random.Random(11)
    for j in range(7):
        az = rc.uniform(0, 6.283); el = rc.uniform(1.0, 1.45); Lb = rc.uniform(4.0, 7.0); nk = Vector((NC, W2Y + 1.35, 6.4 + 4.2 * .92))
        dv = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el) * .5 - .1, math.sin(el))).normalized()
        olive_stem(rc, leaves, M['bark'], [nk, nk + dv * Lb * .35 + Vector((0, 0, .1)), nk + dv * Lb * .7 + Vector((0, 0, .15)), nk + dv * Lb], 26, .95, .03, .008)
    cl = bpy.data.lights.new('niche_c', 'AREA'); cl.energy = F('NICHE', 520); cl.size = 6.0; cl.size_y = 1.6; cl.color = (1.0, .84, .62)
    co = bpy.data.objects.new('niche_c', cl); bpy.context.collection.objects.link(co); co.location = (NC, W2Y + 1.0, 22.6); co.rotation_euler = (math.radians(128), 0, 0); co.visible_camera = False
    # флипчарт на треноге
    bm_ = img_mat('flip', board_texture('/tmp/ac_board.png'), .35, axes='xz'); out = []
    out.append(S.box('board', bm_, -3.1, 3.1, -.06, .06, 10.2, 18.8, G))
    for nm2, x0, x1, z0, z1 in (('fr_l', -3.25, -3.1, 10.0, 19.0), ('fr_r', 3.1, 3.25, 10.0, 19.0), ('fr_t', -3.3, 3.3, 18.8, 19.1), ('fr_b', -3.3, 3.3, 9.9, 10.2)): out.append(S.box(nm2, M['alu'], x0, x1, -.22, .22, z0, z1, G, bev=.015))
    out.append(S.box('tray', M['alu'], -3.0, 3.0, -.7, .1, 9.7, 9.9, G, bev=.02))
    for sx, sy in ((-3.0, -2.6), (3.0, -2.6), (0, 2.8)): out.append(rod('leg', (sx, sy, 0), (sx * .2, sy * .1, 10.2), .13, M['alu']))
    parent_all(out, F('FLX', 47.6), F('FLY', 23.0), math.radians(F('FLR', -18)))
    # --- стол: каменный блок и плита со скруглённым торцом ---
    S.box('table_block', M['tblock'], T['x0'] + 2.4, T['x1'] - 5.2, T['y0'] + 1.5, T['y1'] - 1.5, 0.0, T['top'] - 1.1, G, bev=.10)
    for k in range(int((T['x1'] - 5.2 - T['x0'] - 2.4) / .72)):                                   # каннелюры на лицевой стороне основания: ряд вертикальных полуколонок
        S.cylinder('flute', M['tblock'], T['x0'] + 2.4 + .36 + k * .72, T['y0'] + 1.5, .33, 0.0, T['top'] - 1.1, G, seg=20, bev=0)
    for k in range(int((T['y1'] - T['y0'] - 3.0) / .72)): S.cylinder('flute_l', M['tblock'], T['x0'] + 2.4, T['y0'] + 1.5 + .36 + k * .72, .33, 0.0, T['top'] - 1.1, G, seg=20, bev=0)
    slab('table_top', M['ttop'], T['x0'], T['x1'], T['y0'], T['y1'], T['top'] - 1.1, T['top'], rl=.9, bev=.09)
    th_ = T['top']
    # на столе: ваза с ветками, флаконы (тёмное стекло с чёрными крышками, белые), журналы и бумаги
    vase_with_olive(M, leaves, rnd, F('VX', 15.6), F('VY', -10.0), th_, H=F('VH', 3.3), n=14, stem=(5.0, 8.6))
    for kd, x, y, H, body, cap, lb in (('tube', 18.1, -12.6, 1.7, pal_w, pal_w, None), ('pump', 19.5, -11.4, 2.2, amber, pal_d, paperw), ('drop', 20.9, -12.9, 1.55, amber, pal_d, paperw),
                                       ('pump', 22.3, -11.2, 1.9, amber, pal_d, paperw), ('drop', 23.6, -12.6, 1.3, amber, pal_d, paperw), ('jar', 21.9, -14.3, .62, pal_w, pal_w, None), ('pump', 17.4, -10.6, 2.0, pal_w, pal_w, None)):
        bottle(kd, x, y, th_ + (.14 if (x - 21.0) ** 2 + (y + 12.6) ** 2 < 3.3 ** 2 else 0.0), H, body, cap, lb)
    DC.lathe('tray', [(0, 0), (3.5, 0), (3.62, .05), (3.62, .2), (3.5, .24), (3.36, .14), (0, .14)], M['block'], G, 21.0, -12.6, th_, seg=96)          # каменный поднос под флаконами
    DC.lathe('carafe', [(0, 0), (.62, 0), (.68, .08), (.70, 1.10), (.60, 1.60), (.30, 1.90), (.28, 2.60), (.40, 2.78), (.0, 2.78)], M['carafe'], G, 26.6, -6.4, th_, seg=48)
    for gx, gy in ((28.1, -6.9), (27.6, -5.4)): DC.lathe('glass', [(0, 0), (.30, 0), (.34, .06), (.42, .85), (.0, .85)], M['carafe'], G, gx, gy, th_, seg=40)
    pg = img_mat('page', paper_texture('/tmp/ac_page.png'), .5)
    S.box('mag1', pg, 25.6, 28.6, -12.4, -8.4, th_, th_ + .07, G).rotation_euler = (0, 0, math.radians(-8))
    S.box('mag2', M['paper'], 26.3, 29.5, -11.6, -7.5, th_ + .07, th_ + .13, G).rotation_euler = (0, 0, math.radians(6))
    S.box('notebook', M['navy'], 29.3, 31.0, -9.6, -7.3, th_, th_ + .16, G, bev=.03)
    S.box('rug', M['rug'], 3.0, 41.0, -27.0, 5.5, 0.0, .14, G, bev=.06)                                   # шерстяной ковёр под столом и креслами
    S.box('skirt_l', M['frame'], -260, AX - ARX - .05, W1Y - .22, W1Y, 0.0, .95, G, bev=.04); S.box('skirt_r', M['frame'], AX + ARX + .05, 260, W1Y - .22, W1Y, 0.0, .95, G, bev=.04)          # плинтус из известняка
    # кресла-букле: слева за столом, за столом и справа на переднем плане
    for i, (x, y, j) in enumerate(((F('C1X', 7.6), F('C1Y', -3.0), .0), (F('C2X', 24.5), F('C2Y', 1.2), .0), (F('C3X', 31.0), F('C3Y', -19.0), -.25))):
        chair(M, x, y, math.atan2(-10.0 - y, 20.0 - x) + j, col=(.94, .88, .78), seed=i + 1, tub=True)
    # тени листвы на левой стене (ветки камере не видны)
    cast_branches(M, leaves, rnd, [(-12, 20), (0, 24), (8, 15)], per=14, count=44, wall_y=W1Y, d=SUN_DIR)
    if F('GOBO', 1):
        gc = Vector((16.0, 0.0, 14.0)) - SUN_DIR * 78.0; q = SUN_DIR.to_track_quat('Z', 'Y'); gx = q @ Vector((1, 0, 0)); gy = q @ Vector((0, 1, 0)); tl = math.radians(F('GOBO_TILT', 16))
        ux = gx * math.cos(tl) + gy * math.sin(tl); uy = gy * math.cos(tl) - gx * math.sin(tl); blk = S.mat_simple('gobo', (.02, .02, .02), .9)
        def bar(cu, cv, wu, wv):
            bpy.ops.mesh.primitive_cube_add(size=1); ob = bpy.context.object; ob.name = 'gobo'; ob.scale = (wu, wv, .3); ob.location = gc + ux * cu + uy * cv
            ob.rotation_euler = (q @ __import__('mathutils').Quaternion((0, 0, 1), tl)).to_euler(); ob.data.materials.append(blk); ob.visible_camera = False; ob['grp'] = G
            try: ob.visible_glossy = False; ob.visible_diffuse = False; ob.visible_transmission = False
            except Exception: pass
        step = F('GOBO_STEP', 30.0); wb = F('GOBO_BAR', 7.0)
        for i in range(-4, 6): bar(i * step + F('GOBO_OFF', 6.0), 0.0, wb, 260.0)
        for hv in (F('GOBO_H', 30.0), F('GOBO_H2', 2.0), F('GOBO_H3', -26.0)): bar(0.0, hv, 400.0, F('GOBO_HB', 3.4))
    # мягкий тёплый заполняющий свет второго помещения (камере не виден)
    bl = bpy.data.lights.new('back_fill', 'AREA'); bl.energy = F('BACK', 2600); bl.size = 40; bl.size_y = 18; bl.color = (1.0, .88, .72)
    bo = bpy.data.objects.new('back_fill', bl); bpy.context.collection.objects.link(bo); bo.location = (47, 26, 44.5); bo.rotation_euler = (0, 0, 0); bo.visible_camera = False
    return M


def lights(sc):
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = F('SUN', 18.0 if SCENE == 'hero' else 13.0); sun.angle = math.radians(F('SUN_ANGLE', 2.2 if SCENE == 'hero' else 1.8)); sun.color = S.E3('SUNC', (1.0, .90, .76))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    d = SUN_DIR if SCENE in ('hero', 'mag') else Vector((F('SUNX', .58), F('SUNY', .60), F('SUNZ', -.55))).normalized(); so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); so.location = (-70, -70, 60)
    fl = bpy.data.lights.new('fill', 'AREA'); fl.energy = F('FILL', 2600 if SCENE == 'hero' else 11000); fl.size = 90; fl.size_y = 34; fl.color = S.E3('FILLC', (1.0, .88, .74))
    fo = bpy.data.objects.new('fill', fl); bpy.context.collection.objects.link(fo); fo.location = (-30, -120, 40); fo.rotation_euler = (math.radians(78), 0, math.radians(-14)); fo.visible_camera = False
    if SCENE == 'hero':                                        # мягкий «оконный» свет слева-спереди: объём и собственные тени вместо ровной заливки небом
        fl.energy = F('FILL', 7500); fl.size = 70; fl.size_y = 44; fo.location = (-75, -70, 46); fo.rotation_euler = (Vector((16, -6, 8)) - Vector(fo.location)).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.98, .84, .68)), 1); bg.inputs['Strength'].default_value = F('WORLD', .13 if SCENE == 'hero' else .26); sc.world = w


def camera(sc, loc, tgt, lens, focus=None, fstop=None):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 5000.0
    if focus:                                                  # сцена в единицах по 10 см, оптика Blender считает 1 ед. = 1 м → число диафрагмы делим на 10
        cd.dof.use_dof = True; cd.dof.aperture_fstop = (fstop or F('FSTOP', 1.6)) / 10.0; cd.dof.focus_distance = (Vector(focus) - Vector(loc)).length
    cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); cam.location = loc
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam; bpy.context.view_layer.update(); return cam


def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (round(v.x, 5), round(1 - v.y, 5))


def layout_hero(sc, cam, PW, PH):
    """hall.json: размер кадра и опорные точки (доли кадра) — край стены под текст, центр стола; вёрстка по ним выбирает кадрирование"""
    T = TABLE; tx, ty = proj(sc, cam, ((T['x0'] + T['x1']) / 2, (T['y0'] + T['y1']) / 2, T['top'])); ax, _ = proj(sc, cam, (14.0, W1Y, 12.0))
    return {'plate': {'w': PW, 'h': PH}, 'unit_cm': 10, 'table': {'x': tx, 'y': ty}, 'arch_left': ax, 'slots': []}


# ---------------- остальные сцены ----------------
def mag_page(path, side, w=1650, h=2175):
    """страница журнала для сцены «Полезные статьи»: настоящие фото сайта (assets/photos), заголовок-плашки и колонки «текста» (серые строки — мелкий текст с расстояния не читается)"""
    from PIL import Image, ImageDraw, ImageOps
    im = Image.new('RGB', (w, h), (250, 247, 241)); d = ImageDraw.Draw(im); rnd = random.Random(31 + side)
    PH = os.path.join(HERE, '..', '..', 'assets', 'photos')
    def photo(name, box, focus=(.5, .3)):
        f = os.path.join(PH, name)
        if not os.path.exists(f): d.rectangle(box, fill=(214, 196, 176)); return
        ph = Image.open(f).convert('RGB'); bw, bh = box[2] - box[0], box[3] - box[1]
        im.paste(ImageOps.fit(ph, (bw, bh), Image.LANCZOS, centering=focus), (box[0], box[1]))
    def lines(x0, x1, y0, y1, step=22, th=7, col=(150, 146, 140)):
        y = y0
        while y < y1:
            xe = x1 - (rnd.randint(40, 160) if rnd.random() < .22 else rnd.randint(0, 18)); d.rectangle([x0, y, xe, y + th], fill=col); y += step
    m = 126; k = 1.5
    def lines(x0, x1, y0, y1, step=33, th=10, col=(132, 128, 122)):
        y = y0
        while y < y1:
            xe = x1 - (rnd.randint(60, 240) if rnd.random() < .22 else rnd.randint(0, 26)); d.rectangle([x0, y, xe, y + th], fill=col); y += step
    if side == 0:                                              # левая страница: крупный портрет, подпись, две колонки
        photo('photo-01-hero.webp', (m, m, w - m, 1200), (.5, .35))
        d.rectangle([m, 1275, m + 630, 1302], fill=(28, 40, 70)); d.rectangle([m, 1326, m + 450, 1344], fill=(120, 100, 76))
        lines(m, w // 2 - 36, 1410, h - m); lines(w // 2 + 36, w - m, 1410, h - m)
    else:                                                      # правая страница: заголовок, вводка, фото процедуры и фото команды, колонки
        d.rectangle([m, m + 9, m + 840, m + 51], fill=(28, 40, 70)); d.rectangle([m, m + 81, m + 630, m + 117], fill=(28, 40, 70))
        lines(m, w - m, m + 180, m + 375, 36, 12, (112, 108, 102))
        photo('photo-05-expertise.webp', (m, 570, w // 2 - 30, 1350), (.5, .3)); photo('photo-02b-about.webp', (w // 2 + 30, 570, w - m, 960), (.5, .3))
        lines(w // 2 + 30, w - m, 1020, 1350); lines(m, w // 2 - 36, 1425, h - m); lines(w // 2 + 36, w - m, 1425, h - m)
        d.rectangle([w - m - 90, h - 84, w - m, h - 72], fill=(150, 146, 140))
    im.save(path); return path


def build_mag(sc):
    """«Полезные статьи»: раскрытый журнал на каменной плите, рядом ваза с оливковыми ветками, очки и стопка книг; тёплая стена с мягкой тенью листвы (сцена в единицах по 10 см)"""
    M = mats(); rnd = random.Random(8); leaves = oliv_leaves()
    S.box('wall', M['wall'], -80, 80, 9.0, 12.0, -10, 60, G)
    S.box('slab', trav_veined('mag_slab', (.95, .88, .76), 'Z', F('MVEIN', .9), sc=F('MSC', 1.2)), -60, 60, -16, 9.0, -1.0, 0.0, G, bev=.06)
    root = bpy.data.objects.new('mag', None); bpy.context.collection.objects.link(root); root.location = (F('MGX', -1.2), F('MGY', -1.6), 0.0); root.rotation_euler = (0, 0, math.radians(F('MGR', 13)))
    PW, PD = 2.2, 2.95
    for side in (0, 1):                                        # две страницы с изгибом к корешку и приподнятым внешним краем
        pm = img_mat('page%d' % side, mag_page('/tmp/ac_magpage%d.png' % side, side), .5, axes='xy')
        n = 22; v = []; f = []; x0, x1 = (-PW, 0.0) if side == 0 else (0.0, PW)
        for i in range(n + 1):
            u = i / n; x = x0 + (x1 - x0) * u; t = (1 - u) if side == 0 else u                      # t: 0 у корешка, 1 у внешнего края
            z = .05 + .26 * math.sin(min(1.0, t * 2.2) * math.pi / 2) * (1 - .55 * t) + .05 * t ** 3
            v += [(x, -PD / 2, z), (x, PD / 2, z)]
        for i in range(n): a_ = i * 2; f.append((a_, a_ + 1, a_ + 3, a_ + 2))
        ob = S.mesh_obj('pg%d' % side, v, f, pm, G, smooth=True); ob.parent = root
        sd = ob.modifiers.new('sol', 'SOLIDIFY'); sd.thickness = .012
    blockp = S.box('pages_block', M['paper'], -PW * .985, PW * .985, -PD / 2 + .02, PD / 2 - .02, 0.0, .07, G, bev=.02); blockp.parent = root
    cov = S.box('cover', M['navy'], -PW - .04, PW + .04, -PD / 2 - .03, PD / 2 + .03, 0.0, .03, G, bev=.01); cov.parent = root
    vase_with_olive(M, leaves, rnd, F('MVX', 3.7), F('MVY', 2.4), 0.0, H=F('MVH', 2.8), n=13, stem=(3.4, 5.6))
    bk = [M['navy'], DC.paint('bk_sand', (.80, .70, .52), .6, 0, .05, .1), DC.paint('bk_gray', (.62, .60, .56), .6, 0, .05, .1)]
    books(-4.4, 2.6, 0.0, M, random.Random(3), bk)
    DC.cream_jar(-4.2, 2.5, 1.0, .9, .6, DC.paint('pb_white', (.92, .91, .88), .40, 0, .15, .08), DC.paint('pb_white2', (.90, .88, .84), .40, 0, .15, .08))
    S.box('pencil', DC.paint('pencil', (.10, .16, .30), .4), 2.7, 4.3, -3.3, -3.22, 0.0, .08, G, bev=.02).rotation_euler = (0, 0, math.radians(-24))
    wht = DC.paint('cup_white', (.93, .92, .89), .22, 0, .6, .06)
    DC.lathe('saucer', [(0, 0), (.42, 0), (.74, .07), (.78, .12), (.70, .12), (.40, .06), (0, .06)], wht, G, F('CUPX', -4.3), F('CUPY', -1.2), 0.0, seg=64)                     # чашка чая на блюдце
    DC.lathe('cup', [(0, .06), (.26, .06), (.40, .30), (.44, .62), (.41, .62), (.37, .32), (.24, .12), (0, .12)], wht, G, F('CUPX', -4.3), F('CUPY', -1.2), 0.0, seg=64)
    DC.lathe('tea', [(0, .52), (.405, .52), (.405, .53), (0, .53)], DC.paint('tea', (.36, .17, .05), .08, 0, 1.0, .03), G, F('CUPX', -4.3), F('CUPY', -1.2), 0.0, seg=48)
    DC.lathe('mtray', [(0, 0), (1.25, 0), (1.31, .04), (1.31, .14), (1.23, .17), (1.15, .09), (0, .09)], M['block'], G, 2.75, -2.9, 0.0, seg=96)                                      # каменный поднос с пипеткой и баночкой
    bottle('drop', 2.5, -2.7, .09, 1.25, M['amber'], DC.paint('pb_dark', (.022, .020, .022), .30, 0, .3, .1), DC.paint('lbl_paper', (.95, .94, .91), .55))
    bottle('jar', 3.2, -3.3, .09, .5, wht, wht)
    cast_branches(M, leaves, rnd, [(-10, 12), (4, 16), (16, 10)], per=10, count=40, k=1.0, s0=14.0, s1=22.0, wall_y=9.0, d=SUN_DIR)
    return M


def build_arch(sc):
    """финальная панель: штукатурная арка (видна верхняя левая часть дуги) с тёплым просветом и вазой с ветками; фон прозрачный — в вёрстке под ним тёмно-синяя панель"""
    M = mats(); rnd = random.Random(12); leaves = oliv_leaves()
    cx, rx, zs, t = F('ARCX', 9.0), F('ARCR', 13.0), F('ARCZ', -3.0), F('ARCT', 5.2)
    ring = S.arch_frame('ring', M['wall'], cx, rx, zs, t, -2.6, 2.6, G, n=160, z0=-30.0); smooth_by_angle(ring, 50)
    bv = ring.modifiers.new('bev', 'BEVEL'); bv.width = .16; bv.segments = 4; bv.limit_method = 'ANGLE'
    back = S.arch_solid('back', M['inner'], cx, rx + .4, zs, 2.2, 2.6, G, z0=-30.0)                   # просвет арки: тёплая стена в глубине
    S.cylinder('plinth', M['tblock'], F('APX', 17.5), -4.4, 2.3, -30.0, -1.0, G, seg=96, bev=.06)
    vase_with_olive(M, leaves, rnd, F('APX', 17.5), -4.4, -1.0, H=F('AVH', 4.6), n=14, stem=(5.0, 9.0))
    return M


def build_shade(sc):
    M = mats(); rnd = random.Random(33); leaves = oliv_leaves()
    S.box('wall', M['wall'], -80, 80, 0.0, 3.0, -10, 70, G)
    cast_branches(M, leaves, rnd, [(-20, 20), (0, 30), (22, 16)], per=14, count=44, k=1.5)
    return M


def main():
    PW, PH = SIZES[SCENE]; pw = int(os.environ.get('AH_W', 1200 if MODE == 'preview' else PW)); ph = round(pw * PH / PW); spp = int(os.environ.get('AH_SPP', 20 if MODE == 'preview' else 64))
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    S.settings(sc, pw, ph, spp); sc.view_settings.exposure = F('EXPO', -0.7)
    if SCENE == 'hero':
        build_hero(sc); lights(sc); c = CAM_HERO; cam = camera(sc, c['loc'], c['tgt'], c['lens'], focus=(F('VX', 15.6), F('VY', -10.0), 10.0), fstop=F('FSTOP', 11.0))
    elif SCENE == 'mag':
        build_mag(sc); lights(sc); cam = camera(sc, (F('CAMX', -1.5), F('CAMY', -10.6), F('CAMZ', 7.2)), (F('TGTX', -1.4), 1.0, F('TGTZ', 1.7)), F('LENS', 36.0), focus=(-1.2, -1.6, .2), fstop=F('FSTOP', 22.0))
    elif SCENE == 'arch':
        build_arch(sc); lights(sc); cam = camera(sc, (F('CAMX', 2.0), F('CAMY', -120.0), F('CAMZ', 7.5)), (F('TGTX', 2.0), 0.0, F('TGTZ', 7.5)), F('LENS', 105.0))
    else:
        build_shade(sc); lights(sc); cam = camera(sc, (0.0, -60.0, 20.0), (0.0, 0.0, 22.0), 30.0)
    sc.render.film_transparent = (SCENE == 'arch')
    if SCENE == 'mag': sc.view_settings.exposure = F('EXPO', -0.85)
    print('сцена собрана, объектов %d' % len(bpy.data.objects), flush=True)
    if MODE == 'regrade':
        export(SCENE, '/tmp/ac_%s_full.png' % SCENE); print('regrade done'); return
    if MODE == 'layout':
        if SCENE == 'hero': os.makedirs(OUT, exist_ok=True); json.dump(layout_hero(sc, cam, PW, PH), open(os.path.join(OUT, 'hall.json'), 'w'), ensure_ascii=False, indent=1)
        print('layout done'); return
    if MODE == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/ac_%s_preview.png' % SCENE); bpy.ops.render.render(write_still=True)
        try:
            from PIL import Image
            import numpy as np
            g = S.grade(np.asarray(Image.open(sc.render.filepath).convert('RGB')), sat=F('AH_SAT', 1.30), gamma=F('AH_GAMMA', .85), lift=F('AH_LIFT', .05))
            g = np.clip(g * np.array([float(x) for x in os.environ.get('AH_WARM', '1.0,.985,.95').split(',')], np.float32), 0, 255).astype(np.uint8); Image.fromarray(g).save(sc.render.filepath.replace('.png', '_g.jpg'), quality=92)
        except Exception as e: print('grade skipped', e)
        print('preview done'); return
    os.makedirs(OUT, exist_ok=True)
    raw = '/tmp/ac_%s_full.png' % SCENE; nt_ = int(os.environ.get('AH_TILES', 1))
    if nt_ > 1: render_tiles(sc, raw, nt_)
    else: sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    if SCENE == 'hero': json.dump(layout_hero(sc, cam, PW, PH), open(os.path.join(OUT, 'hall.json'), 'w'), ensure_ascii=False, indent=1)
    export(SCENE, raw)
    print('готово →', OUT, flush=True)


def render_tiles(sc, raw, n, ov=64):
    """расчёт вертикальными полосами с перекрытием: каждая полоса сохраняется отдельно, после перезапуска готовые пропускаются; в конце полосы склеиваются по точным пикселям"""
    from PIL import Image
    W_, H_ = sc.render.resolution_x, sc.render.resolution_y; parts = []
    sc.render.use_border = True; sc.render.use_crop_to_border = False
    for i in range(n):
        a_, b_ = round(W_ * i / n), round(W_ * (i + 1) / n); x0, x1 = max(0, a_ - ov), min(W_, b_ + ov); f = raw.replace('.png', '_t%d.png' % i)
        if not os.path.exists(f):
            sc.render.border_min_x = x0 / W_; sc.render.border_max_x = x1 / W_; sc.render.border_min_y = 0.0; sc.render.border_max_y = 1.0
            sc.render.filepath = f.replace('.png', '_tmp.png'); bpy.ops.render.render(write_still=True); os.replace(f.replace('.png', '_tmp.png'), f); print('полоса %d/%d готова' % (i + 1, n), flush=True)
        parts.append((a_, b_, f))
    out = Image.new('RGBA', (W_, H_))
    for a_, b_, f in parts: out.paste(Image.open(f).convert('RGBA').crop((a_, 0, b_, H_)), (a_, 0))
    out.save(raw); sc.render.use_border = False


def export(scene, raw):
    from PIL import Image, ImageFilter
    import numpy as np
    im = Image.open(raw)
    if scene == 'arch':
        a = np.asarray(im.convert('RGBA')).astype(np.float32); rgb = S.grade(a[..., :3], sat=F('AH_SAT', 1.30), gamma=F('AH_GAMMA', .86), lift=F('AH_LIFT', .04))
        Image.fromarray(np.clip(np.dstack([rgb, a[..., 3]]), 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'arch.webp'), quality=90, method=6); return
    rgb = np.asarray(im.convert('RGB'))
    if scene == 'shade':                                   # накладка: чем темнее тень на стене, тем непрозрачнее тёплый коричневый слой
        L = rgb.astype(np.float32) @ np.array([.299, .587, .114], np.float32); hi = np.percentile(L, 92); sh = np.clip((hi - L) / max(hi, 1), 0, 1) ** 1.2
        al = Image.fromarray(np.clip(sh * 255 * .9, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
        base = Image.new('RGBA', al.size, (92, 62, 40, 0)); base.putalpha(al); base.save(os.path.join(OUT, 'shade.webp'), quality=80, method=6); return
    g = S.grade(rgb, sat=F('AH_SAT', 1.30), gamma=F('AH_GAMMA', .85), lift=F('AH_LIFT', .05))
    g = np.clip(g * np.array([float(x) for x in os.environ.get('AH_WARM', '1.0,.985,.95').split(',')], np.float32), 0, 255).astype(np.uint8)
    im2 = Image.fromarray(g)
    if scene == 'hero':
        im2.save(os.path.join(OUT, 'hall.webp'), quality=90, method=6); im2.resize((1200, round(1200 * im2.height / im2.width)), Image.LANCZOS).save(os.path.join(OUT, 'hall-s.webp'), quality=88, method=6)
    else:
        im2.save(os.path.join(OUT, scene + '.webp'), quality=90, method=6)


if __name__ == '__main__':
    main()
