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
MODE = next((a for a in args if a in ('preview', 'layout')), 'final')
SIZES = {'hero': (2400, 1400), 'mag': (1500, 960), 'arch': (1300, 800), 'shade': (1600, 1000)}
F = lambda k, d: float(os.environ.get(k, d))
CAM_HERO = dict(loc=(F('CAMX', -21.0), F('CAMY', -62.0), F('CAMZ', 14.0)), tgt=(F('TGTX', 10.0), 0.0, F('TGTZ', 16.2)), lens=F('LENS', 22.0))
TABLE = dict(cx=F('TBX', 9.0), cy=F('TBY', -25.0), r=F('TBR', 11.5), top=7.6)       # круглая столешница диаметром 2,3 м, верх 76 см
# места упаковок на столе (x, y) — «кучкой» у передней кромки, мелкие ближе к зрителю; k — высотный коэффициент
SLOTS = [(1.0, -28.4, 1.0), (3.9, -27.0, .95), (6.9, -28.6, 1.0), (9.9, -27.2, .9), (12.9, -28.5, 1.0), (15.6, -27.2, .85), (5.4, -31.0, .6), (11.4, -31.2, .6)]


# ---------------- материалы и общие детали ----------------
def mats():
    M = {}
    wc = S.E3('WALLC', (.99, .83, .66))
    M['wall'] = MT.lime_plaster('wall_plaster', wc, wave=F('WAVE', 1.0), scale=.42, tone=.8)
    M['inner'] = MT.lime_plaster('inner_plaster', (wc[0] * .98, wc[1] * .93, wc[2] * .85), wave=.5, scale=.42, tone=.6)
    M['frame'] = MT.limestone('arch_trim', (.98, .91, .79), scale=.5)
    M['trav'] = MT.travertine('trav_top', (.95, .86, .72), .5, 1.0, 1.3, honed=True)
    M['block'] = MT.travertine('trav_block', (.92, .83, .68), .62, .9, 1.1, honed=True)
    M['floor'] = MT.limestone_floor('hall_floor', (.97, .88, .76), tile=7.0, joint=.028, tone=.11)
    M['bronze'] = S.mat_simple('bronze', (.075, .066, .058), .42, .55)
    M['sky'] = sky_mat('sky', F('SKY', 3.2))
    M['white'] = S.mat_simple('white', (.93, .92, .90), .28)
    M['alu'] = S.mat_simple('alu', (.78, .78, .77), .35, .8)
    M['wood'] = RL.oak('shelf_oak', (.72, .56, .38), scale=1.0)
    M['glaze'] = DC.glaze('vase_glaze', (.82, .78, .72), .22)
    M['bark'] = S.mat_simple('bark', (.21, .165, .12), .88)
    M['rug'] = RL.fabric_boucle('rug_wool', (.93, .86, .74), scale=10.0, tint=.10)                 # шерстяной ковёр: сцена в единицах по 10 см, поэтому масштаб текстуры ×10
    M['paper'] = S.mat_simple('paper', (.94, .93, .90), .55)
    M['navy'] = S.mat_simple('navy_cover', (.035, .075, .17), .5)
    M['pend'] = S.mat_led('pendant', F('PEND', 1.4), (1.0, .86, .68))
    M['carafe'] = DC.glass('carafe_glass', (.90, .95, .94), .06)
    return M


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


def chair(M, x, y, rot, col=(.93, .85, .73), seed=1):
    """кресло-букле в натуральную величину (строится в метрах и увеличивается корневым пустым ×10 — текстура петель букле остаётся настоящего размера):
    мягкая подушка сиденья со швом и прогибом, основание-рама, спинка-ракушка толщиной 7 см с закруглёнными кромками, четыре конические ножки из дуба"""
    boucle = RL.fabric_boucle('boucle%d' % seed, col, scale=1.0, tint=.15)
    root = bpy.data.objects.new('chair', None); bpy.context.collection.objects.link(root); root.location = (x, y, 0); root.rotation_euler = (0, 0, rot); root.scale = (10, 10, 10)
    RL.cushion('ch_frame', boucle, .50, .50, .09, (.01, 0, .30), parent=root, r=.12, rz=.03, belly=.004, wrinkle=.0008, seed=seed, n=22)
    RL.cushion('ch_seat', boucle, .50, .50, .11, (.03, 0, .395), parent=root, r=.14, rz=.045, crown=.012, crown_b=.10, belly=.012, sag=.006, wrinkle=.0016, seed=seed + 4, n=28)
    back = RL._obj('ch_back', shell_mesh(.285, .33, .80, .075, math.radians(-118), math.radians(118), .13), boucle, root)
    bv = back.modifiers.new('bev', 'BEVEL'); bv.width = .024; bv.segments = 4; bv.limit_method = 'ANGLE'
    ss = back.modifiers.new('sub', 'SUBSURF'); ss.levels = 1; ss.render_levels = 2
    for sx, sy in ((.17, .17), (.17, -.17), (-.17, .17), (-.17, -.17)): RL._leg('ch_leg', M['wood'], sx, sy, 0.0, .34, .013, .021, root)
    return root


def board_texture(path, w=900, h=1300):
    """лист флипчарта: рукописные строки синим маркером на белом"""
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (248, 248, 246)); d = ImageDraw.Draw(im); rnd = random.Random(9)
    d.rectangle([90, 80, 560, 108], fill=(52, 72, 130)); y = 160
    while y < h - 200:
        x = 90
        while x < w - 120:
            ln = rnd.randint(60, 220)
            pts = [(x + k * 8, y + math.sin(k * .9 + rnd.random()) * 5 + rnd.uniform(-2, 2)) for k in range(ln // 8)]
            if len(pts) > 1: d.line(pts, fill=(58 + rnd.randint(0, 20), 78, 140), width=4)
            x += ln + rnd.randint(18, 40)
        y += 54
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


def img_mat(name, path, rough=.45):
    m, nt, b, o = S.mk(name); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(path); tex.image.colorspace_settings.name = 'sRGB'
    nt.links.new(tex.outputs['Color'], S.inp(b, 'Base Color')); S.val(b, rough, 'Roughness'); return m


def cast_branches(M, leaves, rnd, clusters, per=10, count=40, k=1.35, s0=18.0, s1=28.0):
    """невидимые для камеры ветки между солнцем и стеной: на штукатурке остаётся живая тень листвы. clusters — центры теней на стене (x, z)"""
    d = Vector((.52, .62, -.52)).normalized()
    for (cx, cz) in clusters:
        for _ in range(per):
            tx, tz = cx + rnd.uniform(-8, 8), cz + rnd.uniform(-6, 6); s = rnd.uniform(s0, s1); P = Vector((tx, 0.0, tz)) - d * s
            a = rnd.uniform(-.5, .5); u = Vector((math.cos(a), 0.0, math.sin(a))); Lb = rnd.uniform(4.5, 7.5)
            pts = [P, P + u * Lb * .33 + Vector((0, 0, .3)), P + u * Lb * .66, P + u * Lb + Vector((0, 0, -.5))]
            olive_stem(rnd, leaves, M['bark'], pts, count, k, .04, .01, hide=True)


# ---------------- hero ----------------
ARCH = [('A', -24.0, 15.0, 46.0, 'window'), ('B', 1.0, 13.0, 42.0, 'niche'), ('C', 25.5, 13.5, 43.0, 'window'), ('D', 49.0, 15.0, 46.0, 'window')]


def books(x, y, z, M, rnd, cols):
    """стопка из трёх книг в тканевых обложках (сцена в единицах по 10 см)"""
    for i in range(3):
        w = rnd.uniform(2.3, 2.8); d = w * .74; th = rnd.uniform(.28, .42); dx = rnd.uniform(-.12, .12)
        S.box('book', cols[i % len(cols)], x - w / 2 + dx, x + w / 2 + dx, y - d / 2, y + d / 2, z, z + th, G, bev=.03)
        S.box('pages', M['paper'], x - w / 2 + dx + .06, x + w / 2 + dx, y - d / 2 + .04, y + d / 2 - .04, z + .04, z + th - .04, G); z += th
    return z


def build_hero(sc):
    M = mats(); rnd = random.Random(21); leaves = oliv_leaves(); T = TABLE
    S.box('floor', M['floor'], -300, 300, -250, 0.0, -0.5, 0.0, G)
    wall = S.box('wall', M['wall'], -300, 300, 0.0, 3.2, 0.0, 200.0, G)
    for nm, cx, w, top, kind in ARCH:
        rx = w / 2; zs = top - rx; z0 = {'niche': 4.6, 'window': 10.0}[kind]; y1 = {'niche': 2.3, 'window': 4.0}[kind]
        cut = S.arch_solid('cut' + nm, M['wall'], cx, rx, zs, -.6, y1, G, z0=z0); cut.hide_render = True; cut.display_type = 'WIRE'
        bm = wall.modifiers.new('cut' + nm, 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'
    bv = wall.modifiers.new('bev', 'BEVEL'); bv.width = .06; bv.segments = 3; bv.limit_method = 'ANGLE'
    for nm, cx, w, top, kind in ARCH:
        rx = w / 2; zs = top - rx; z0 = {'niche': 4.6, 'window': 10.0}[kind]
        fr = S.arch_frame('rim' + nm, M['frame'], cx, rx, zs, .6, -.32, .15, G, z0=z0); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .035; fb.segments = 3; fb.limit_method = 'ANGLE'
        if kind == 'window':                                   # стальное окно: рама по контуру арки, импосты, вид на сад (градиент и далёкие кроны), подоконник
            S.box('sky' + nm, M['sky'], cx - rx - 1, cx + rx + 1, 8.0, 8.2, 9.5, top + 2, G).visible_shadow = False
            wf = S.arch_frame('wf' + nm, M['bronze'], cx, rx - .20, zs, .20, .85, 1.40, G, z0=z0); wb = wf.modifiers.new('bev', 'BEVEL'); wb.width = .02; wb.segments = 2; wb.limit_method = 'ANGLE'
            for zz in ((z0 + 8.0, z0 + 17.0) if nm != 'D' else (z0 + 12.0,)): S.box('mh%s%d' % (nm, int(zz)), M['bronze'], cx - rx, cx + rx, .95, 1.30, zz - .09, zz + .09, G, bev=.015)
            for dx in ((0.0,) if nm != 'A' else (-rx / 2, rx / 2)): S.box('mv%s%d' % (nm, int(dx * 10)), M['bronze'], cx + dx - .09, cx + dx + .09, .95, 1.30, z0, zs, G, bev=.015)
            S.box('sill' + nm, M['frame'], cx - rx - .6, cx + rx + .6, -.62, 1.9, z0 - .9, z0, G, bev=.05)
        if kind == 'niche':                                    # ниша: три травертиновые полки; книги, ваза, полотенца, свеча, камни и косметика
            S.box('nback' + nm, M['inner'], cx - rx, cx + rx, 2.2, 2.35, z0, top, G)
            for kk, zz in enumerate((11.5, 20.5, 29.5)): S.box('shelf%d' % kk, M['trav'], cx - rx, cx + rx, .35, 2.2, zz, zz + .5, G, bev=.05)
            pb = DC.paint('pb_white', (.90, .89, .86), .45, 0, .1, .08); pb2 = DC.paint('pb_dark', (.045, .04, .04), .35, 0, .25, .1); pb3 = DC.paint('pb_sand', (.78, .66, .50), .5, 0, .1, .1)
            rr = random.Random(4); lin = RL.fabric_linen('nlinen', (.92, .88, .80), scale=10.0); bk = [M['navy'], DC.paint('bk_sand', (.80, .70, .52), .6, 0, .05, .1), DC.paint('bk_gray', (.55, .56, .55), .6, 0, .05, .1)]
            z = 11.5 + .5; books(cx - 3.6, 1.35, z, M, rr, bk); DC.vase('nv', 'gourd', M['glaze'], cx + 3.0, 1.2, z, 2.6, G, W=1.6); DC.eucalyptus(cx + 3.0, 1.2, z + 2.3, 3.4, DC.paint('euc_leaf', (.42, .50, .40), .5, 0, .05, .1), M['bark'], rr, G, n=5, spread=.9)
            z = 20.5 + .5
            for i, (kd, off) in enumerate((('pump', -4.0), ('drop', -2.4), ('jar', -.9), ('tube', .6), ('pump', 2.2), ('box', 3.8))):
                x = cx + off; y = 1.35 + rr.uniform(-.15, .15); body = rr.choice((pb, pb3, pb)); H = rr.uniform(1.4, 1.9)
                if kd == 'pump': DC.pump_bottle(x, y, z, H / 1.3, body, pb2)
                elif kd == 'drop': DC.dropper(x, y, z, H / 1.4, DC.glass('serum_glass'), DC.brass('champ_collar2'), pb2)
                elif kd == 'jar': DC.cream_jar(x, y, z, 1.5 / 1.3, .9 / 1.3, body, pb)
                elif kd == 'tube': DC.squeeze_tube(x, y, z, H / 1.3, body, pb2)
                else: S.box('pbox', body, x - .5, x + .5, y - .4, y + .4, z, z + 1.3, G, bev=.04)
            z = 29.5 + .5
            for i in range(3): S.box('towel', lin, cx - 4.6, cx - 2.2, .9, 2.0, z + i * .34, z + i * .34 + .30, G, bev=.08)
            DC.candle(cx + .6, 1.3, z, .95, 1.4, DC.paint('cup', (.86, .82, .74), .5, 0, .05, .1), DC.paint('wax', (.97, .94, .86), .5, 0, .0, .1))
            DC.cairn(cx + 3.6, 1.3, z, M['block'], rr, G, n=4, R0=.75)
            nl = bpy.data.lights.new('nlit', 'AREA'); nl.energy = 320; nl.size = 2 * rx * .8; nl.size_y = 1.4; nl.color = (1.0, .84, .62)
            no = bpy.data.objects.new('nlit', nl); bpy.context.collection.objects.link(no); no.location = (cx, .9, top - 4); no.rotation_euler = (math.radians(130), 0, 0); no.visible_camera = False
    S.box('base', M['frame'], -300, 300, -.34, .3, 0.0, 1.2, G, bev=.03)
    # ковёр: круглый шерстяной, под столом и креслами
    DC.lathe('rug', [(0, 0), (T['r'] + 5.4, 0), (T['r'] + 5.6, .06), (T['r'] + 5.62, .22), (T['r'] + 5.5, .30), (0, .30)], M['rug'], G, T['cx'], T['cy'], 0, seg=160)
    # круглый стол из травертина: толстая плита с фаской и барабан-основание с «талией»
    R_, th_ = T['r'], T['top']
    DC.lathe('table_top', [(0, th_ - .95), (R_ * .985, th_ - .95), (R_, th_ - .80), (R_, th_ - .14), (R_ * .993, th_ - .03), (R_ * .975, th_), (0, th_)], M['trav'], G, T['cx'], T['cy'], 0, seg=192)
    DC.lathe('table_ped', [(0, .30), (R_ * .50, .30), (R_ * .53, .60), (R_ * .50, (th_ - .95) * .5), (R_ * .53, (th_ - .95) * .85), (R_ * .55, th_ - .95), (0, th_ - .95)], M['block'], G, T['cx'], T['cy'], 0, seg=160)
    for o in bpy.context.scene.objects:
        if o.name.startswith('table_'): bv2 = o.modifiers.new('bev', 'BEVEL'); bv2.width = .06; bv2.segments = 4; bv2.limit_method = 'ANGLE'
    # на столе: ваза с оливой, графин и стаканы, блокнот и ручка, бумаги, планшет (упаковки — спрайтами поверх)
    vase_with_olive(M, leaves, rnd, T['cx'] - 6.8, T['cy'] + .8, th_, H=3.8, n=12)
    DC.lathe('carafe', [(0, 0), (.62, 0), (.68, .08), (.70, 1.10), (.60, 1.60), (.30, 1.90), (.28, 2.60), (.40, 2.78), (.0, 2.78)], M['carafe'], G, T['cx'] - 3.2, T['cy'] + 3.4, th_, seg=48)
    for gx, gy in ((-1.8, 4.4), (-.7, 5.0)): DC.lathe('glass', [(0, 0), (.30, 0), (.34, .06), (.42, .85), (.0, .85)], M['carafe'], G, T['cx'] + gx - 3.2, T['cy'] + gy, th_, seg=40)
    S.box('paper1', M['paper'], T['cx'] + 3.4, T['cx'] + 6.2, T['cy'] + .6, T['cy'] + 2.8, th_, th_ + .06, G)
    S.box('paper2', M['paper'], T['cx'] + 3.9, T['cx'] + 6.7, T['cy'] + 1.1, T['cy'] + 3.3, th_ + .06, th_ + .12, G)
    DC.lathe('pen', [(0, 0), (.035, 0), (.035, 1.4), (.0, 1.5)], M['navy'], G, T['cx'] + 4.9, T['cy'] + 2.0, th_ + .14, seg=12)
    S.box('tablet', S.mat_simple('tablet', (.04, .04, .045), .2), T['cx'] + 7.9, T['cx'] + 10.1, T['cy'] + .9, T['cy'] + 3.0, th_, th_ + .09, G, bev=.04)
    S.box('notebook', M['navy'], T['cx'] + 11.2, T['cx'] + 13.4, T['cy'] + 1.4, T['cy'] + 3.6, th_, th_ + .22, G, bev=.04)
    # флипчарт на треноге: лист с записями, лоток для маркеров, верхняя планка, алюминиевая стойка и тренога
    bm_ = img_mat('flip', board_texture('/tmp/ac_board.png'), .35); out = []
    out.append(S.box('board', bm_, -3.1, 3.1, -.06, .06, 10.2, 18.8, G, bev=.01))
    for nm2, x0, x1, z0, z1 in (('fr_l', -3.25, -3.1, 10.0, 19.0), ('fr_r', 3.1, 3.25, 10.0, 19.0), ('fr_t', -3.3, 3.3, 18.8, 19.1), ('fr_b', -3.3, 3.3, 9.9, 10.2)): out.append(S.box(nm2, M['alu'], x0, x1, -.22, .22, z0, z1, G, bev=.015))
    out.append(S.box('tray', M['alu'], -3.0, 3.0, -.7, .1, 9.7, 9.9, G, bev=.02))
    for sx, sy in ((-3.0, -2.6), (3.0, -2.6), (0, 2.8)): out.append(rod('leg', (sx, sy, 0), (sx * .2, sy * .1, 10.2), .13, M['alu']))
    parent_all(out, 40.0, -8.0, math.radians(-24))
    # кресла вокруг стола, лицом к центру
    for i, (x, y, j) in enumerate(((-6.0, -21.0, .10), (25.5, -31.0, -.15), (14.0, -9.8, .1))):
        chair(M, x, y, math.atan2(T['cy'] - y, T['cx'] - x) + j, seed=i + 1)
    potted_olive(M, leaves, rnd, F('PLX', -11.5), F('PLY', -5.5), H=F('PLH', 23.0))
    potted_olive(M, leaves, rnd, 52.0, -9.0, H=13.5, rx=3.6, ry=2.6, rz=3.0, nb=30, lean=-.3)
    cast_branches(M, leaves, rnd, [(-14, 30), (10, 36), (36, 28)], per=16, count=44)
    return M


def lights(sc):
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = F('SUN', 10.0); sun.angle = math.radians(F('SUN_ANGLE', 1.8)); sun.color = S.E3('SUNC', (1.0, .90, .76))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    d = Vector((.52, .62, -.52)).normalized(); so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); so.location = (-70, -70, 60)
    fl = bpy.data.lights.new('fill', 'AREA'); fl.energy = F('FILL', 11000); fl.size = 90; fl.size_y = 34; fl.color = S.E3('FILLC', (1.0, .88, .74))
    fo = bpy.data.objects.new('fill', fl); bpy.context.collection.objects.link(fo); fo.location = (-30, -120, 40); fo.rotation_euler = (math.radians(78), 0, math.radians(-14)); fo.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.98, .84, .68)), 1); bg.inputs['Strength'].default_value = F('WORLD', .42); sc.world = w


def camera(sc, loc, tgt, lens, focus=None, fstop=None):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 5000.0
    if focus:                                                  # сцена в единицах по 10 см, оптика Blender считает 1 ед. = 1 м → число диафрагмы делим на 10
        cd.dof.use_dof = True; cd.dof.aperture_fstop = (fstop or F('FSTOP', 1.6)) / 10.0; cd.dof.focus_distance = (Vector(focus) - Vector(loc)).length
    cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); cam.location = loc
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam; bpy.context.view_layer.update(); return cam


def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (round(v.x, 5), round(1 - v.y, 5))


def layout_hero(sc, cam, PW, PH):
    out = {'plate': {'w': PW, 'h': PH}, 'unit_cm': 10, 'table_z': TABLE['top'], 'slots': []}
    for (x, y, hk) in SLOTS:
        px, py = proj(sc, cam, (x, y, TABLE['top'])); _, py2 = proj(sc, cam, (x, y, TABLE['top'] + 1.0))
        out['slots'].append({'x': px, 'y': py, 'pxcm': round((py - py2) * PH / 10.0, 3), 'k': hk})
    return out


# ---------------- остальные сцены ----------------
def build_mag(sc):
    M = mats(); rnd = random.Random(8); leaves = oliv_leaves()
    S.box('wall', M['wall'], -60, 60, 6.0, 8.0, -10, 40, G)
    S.box('slab', M['trav'], -40, 40, -14, 7.0, 0.0, 1.0, G, bev=.06)
    pm = img_mat('page', paper_texture('/tmp/ac_page.png'), .5)
    for sgn in (-1, 1):                                    # две страницы с лёгким изгибом к корешку
        n = 14; v = []; f = []; x0, x1 = (-5.8, 0.0) if sgn < 0 else (0.0, 5.8)
        for i in range(n + 1):
            u = i / n; x = x0 + (x1 - x0) * u; z = 1.06 + (.55 * u ** 2 if sgn < 0 else .55 * (1 - u) ** 2); v += [(x, -3.2, z), (x, 3.2, z)]
        for i in range(n): a = i * 2; f.append((a, a + 1, a + 3, a + 2))
        S.mesh_obj('pg', v, f, pm, G, smooth=True)
    S.box('cover', M['white'], -5.9, 5.9, -3.3, 3.3, 1.0, 1.04, G)
    vase_with_olive(M, leaves, rnd, -13.0, 1.0, 1.0, H=5.0, n=11, stem=(4.5, 7.0))
    return M


def build_arch(sc):
    M = mats(); rnd = random.Random(12); leaves = oliv_leaves()
    S.box('floor', M['floor'], -60, 60, -30, 20, -.5, 0.0, G)
    S.arch_frame('ring1', M['trav'], 6.0, 10.0, 12.0, 2.2, -1.5, 1.5, G, z0=0.0)
    S.arch_frame('ring2', M['frame'], 6.0, 6.2, 12.0, 1.4, -1.0, 1.0, G, z0=0.0)
    S.cylinder('plinth', M['block'], 16.5, -3.0, 2.6, 0.0, 3.0, G, seg=96, bev=.06)
    vase_with_olive(M, leaves, rnd, 16.5, -3.0, 3.0, H=4.2, n=12, stem=(4.5, 7.0))
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
        build_hero(sc); lights(sc); c = CAM_HERO; cam = camera(sc, c['loc'], c['tgt'], c['lens'], focus=(TABLE['cx'], TABLE['cy'], TABLE['top']))
    elif SCENE == 'mag':
        build_mag(sc); lights(sc); cam = camera(sc, (-6.0, -34.0, 20.0), (-3.0, 0.0, 3.0), 38.0)
    elif SCENE == 'arch':
        build_arch(sc); lights(sc); cam = camera(sc, (4.0, -62.0, 14.0), (8.0, 0.0, 12.0), 40.0)
    else:
        build_shade(sc); lights(sc); cam = camera(sc, (0.0, -60.0, 20.0), (0.0, 0.0, 22.0), 30.0)
    sc.render.film_transparent = (SCENE == 'arch')
    print('сцена собрана, объектов %d' % len(bpy.data.objects), flush=True)
    if MODE == 'layout':
        if SCENE == 'hero': os.makedirs(OUT, exist_ok=True); json.dump(layout_hero(sc, cam, PW, PH), open(os.path.join(OUT, 'hall.json'), 'w'), ensure_ascii=False, indent=1)
        print('layout done'); return
    if MODE == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/ac_%s_preview.png' % SCENE); bpy.ops.render.render(write_still=True); print('preview done'); return
    os.makedirs(OUT, exist_ok=True)
    raw = '/tmp/ac_%s_full.png' % SCENE; sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    if SCENE == 'hero': json.dump(layout_hero(sc, cam, PW, PH), open(os.path.join(OUT, 'hall.json'), 'w'), ensure_ascii=False, indent=1)
    export(SCENE, raw)
    print('готово →', OUT, flush=True)


def export(scene, raw):
    from PIL import Image, ImageFilter
    import numpy as np
    im = Image.open(raw)
    if scene == 'arch':
        a = np.asarray(im.convert('RGBA')).astype(np.float32); rgb = S.grade(a[..., :3], sat=1.25, gamma=.88, lift=.04)
        Image.fromarray(np.clip(np.dstack([rgb, a[..., 3]]), 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'arch.webp'), quality=90, method=6); return
    rgb = np.asarray(im.convert('RGB'))
    if scene == 'shade':                                   # накладка: чем темнее тень на стене, тем непрозрачнее тёплый коричневый слой
        L = rgb.astype(np.float32) @ np.array([.299, .587, .114], np.float32); hi = np.percentile(L, 92); sh = np.clip((hi - L) / max(hi, 1), 0, 1) ** 1.2
        al = Image.fromarray(np.clip(sh * 255 * .9, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
        base = Image.new('RGBA', al.size, (92, 62, 40, 0)); base.putalpha(al); base.save(os.path.join(OUT, 'shade.webp'), quality=80, method=6); return
    g = S.grade(rgb, sat=F('AH_SAT', 1.22), gamma=F('AH_GAMMA', .88), lift=F('AH_LIFT', .06))
    g = np.clip(g * np.array([float(x) for x in os.environ.get('AH_WARM', '1.0,.985,.95').split(',')], np.float32), 0, 255).astype(np.uint8)
    im2 = Image.fromarray(g)
    if scene == 'hero':
        im2.save(os.path.join(OUT, 'hall.webp'), quality=90, method=6); im2.resize((1200, round(1200 * im2.height / im2.width)), Image.LANCZOS).save(os.path.join(OUT, 'hall-s.webp'), quality=88, method=6)
    else:
        im2.save(os.path.join(OUT, scene + '.webp'), quality=90, method=6)


if __name__ == '__main__':
    main()
