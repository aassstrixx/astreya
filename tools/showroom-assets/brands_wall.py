"""Единая стена-витрина брендов (страница «Бренды»): светлая известняковая стена, девять арочных ниш разной ширины и высоты (по референсу заказчика), общее низкое травертиновое основание, скрытая тёплая
подсветка ниш, солнце сквозь окно (мягкие диагональные тени), вертикальная рейка справа. Товары и логотипы в ниши ставит вёрстка (src/pages/brands.js) поверх этого кадра — по wall.json (доли кадра).

Масштаб: 1 ед. сцены = 10 см (упаковка 22 см — 2,2 ед.), кадр 34 × 15,38 ед. (3072 × 1390 px: 9,04 px на сантиметр). Камера — длиннофокусная (68 мм с 64 ед.), почти фронтальная: боковые откосы ниш чуть видны, как в жизни.
Результат: assets/brands/wall.webp (3072), wall-s.webp (1800, планшеты и телефоны), wall.json (положение ниш, логотипов и мест товаров в долях кадра, масштаб «px на см»).

  python3 tools/showroom-assets/brands_wall.py preview      # быстрый кадр /tmp/wall_preview.png (BW_W — ширина, BW_SPP — сэмплы)
  python3 tools/showroom-assets/brands_wall.py layout       # только wall.json (без рендера)
  python3 tools/showroom-assets/brands_wall.py regrade      # только цветокоррекция кадра /tmp/wall_full.png (BW_SAT, BW_GAMMA, BW_LIFT, BW_WARM)
  python3 tools/showroom-assets/brands_wall.py              # итоговый рендер (3072 px, BW_SPP=56 по умолчанию) → assets/brands/
Переменные: BW_W, BW_SPP, SUN, FILL, LED, EXPO, WALLC (R,G,B)."""
import bpy, bmesh, math, os, sys, json, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import scene as S
import materials as MT
import realism as RL
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

PW, PH = 3072, 1390                                   # кадр, px
WU = 34.0; HU = WU * PH / PW                          # ширина и высота кадра, ед.
BASE_Z = 1.5                                          # верх общего основания (15 см)
CAM = (0.0, -64.0, HU / 2); LENS = 18.0 * 64.0 / (WU / 2)
OUT = os.path.join(HERE, '..', '..', 'assets', 'brands')

# ниши: id, центр x, ширина, верх (z вершины арки); по референсу «Галерея брендов ASTREYA»
NICHES = [('keenwell', -13.14, 3.35, 7.82), ('endocare', -9.57, 2.84, 7.46), ('dermatime', -4.76, 5.90, 8.46), ('neoretin', 0.06, 2.90, 7.41), ('heliocare', 3.31, 2.84, 7.41),
          ('biretix', 6.28, 2.40, 7.15), ('iraltone', 9.06, 2.40, 6.95), ('elancyl', 11.73, 2.13, 6.95), ('eva', 15.06, 3.00, 7.82)]
# низкие подставки в нишах: (вид, dx, глубина y, размер x, размер y, высота); места товаров: (dx, глубина y, высота подставки под ними). Первое место — самому высокому товару.
LAYOUT = {
    'dermatime': dict(plinths=[('disc', 0.0, .85, 1.05, 1.05, .50), ('box', -1.9, .80, 1.5, 1.1, .28), ('box', 1.85, .80, 1.3, 1.0, .18)], slots=[(0.0, .85, .50), (-1.9, .80, .28), (1.85, .80, .18), (-.85, .35, 0), (.95, .30, 0)]),
    'keenwell': dict(plinths=[('box', .45, .85, 1.5, 1.0, .50)], slots=[(.45, .85, .50), (-.9, .80, 0), (-.15, .38, 0), (1.15, .45, 0)]),
    'endocare': dict(plinths=[('disc', .25, .80, .78, .78, .40)], slots=[(.25, .80, .40), (-.64, .75, 0), (.80, .30, 0)]),
    'neoretin': dict(plinths=[('box', -.2, .80, 1.3, .90, .35)], slots=[(-.2, .80, .35), (.85, .55, 0), (-1.0, .40, 0)]),
    'heliocare': dict(plinths=[('disc', -.1, .80, .74, .74, .45)], slots=[(-.1, .80, .45), (.84, .55, 0), (-.88, .45, 0)]),
    'biretix': dict(plinths=[('box', .1, .80, 1.1, .80, .30)], slots=[(.1, .80, .30), (-.74, .50, 0), (.80, .40, 0)]),
    'iraltone': dict(plinths=[('disc', 0.0, .80, .68, .68, .38)], slots=[(0.0, .80, .38), (-.66, .45, 0), (.68, .40, 0)]),
    'elancyl': dict(plinths=[('box', .1, .80, .95, .70, .30)], slots=[(.1, .80, .30), (-.58, .45, 0), (.62, .40, 0)]),
    'eva': dict(plinths=[('disc', 0.0, .85, 1.05, 1.05, .60), ('disc', 0.0, .85, 1.3, 1.3, .22)], slots=[(0.0, .85, .60)]),
}
NICHE_DEPTH = 1.55


def build(sc):
    wallc = S.E3('WALLC', (.97, .89, .75))
    M = {}
    M['wall'] = MT.lime_plaster('wall_plaster', wallc, wave=float(os.environ.get('WAVE', 1.8)), scale=float(os.environ.get('WALL_SC', .42)), tone=.8)
    M['inner'] = MT.lime_plaster('niche_plaster', (wallc[0] * .97, wallc[1] * .94, wallc[2] * .86), wave=.6, scale=float(os.environ.get('WALL_SC', .42)), tone=.6)
    M['frame'] = MT.limestone('niche_rim', (.97, .93, .84), scale=float(os.environ.get('STONE_SC', .5)))
    M['base'] = MT.travertine('trav_base', (.88, .80, .66), float(os.environ.get('TRAV_SC', .5)), 1.0, 1.3, honed=True)
    M['block'] = MT.travertine('trav_block', (.92, .85, .72), float(os.environ.get('TRAV_SC', .5)) * 1.3, .8, 1.0, honed=True)
    M['led'] = S.mat_led('led', float(os.environ.get('LED', 8.0)), (1.0, .80, .52))
    M['slat'] = MT.limestone('wall_slat', (.94, .89, .79), scale=.6)
    G = 'wall'
    # общее основание: длинная низкая плита (верх продолжается внутрь ниш — товары стоят на нём), лёгкий ступенчатый цоколь спереди
    S.box('base', M['base'], -22, 22, -3.2, 2.0, 0.0, BASE_Z, G, bev=.03)
    S.box('base_step', M['base'], -22, 22, -4.5, -3.2, 0.0, .55, G, bev=.03)
    # стена с нишами
    wall = S.box('wall', M['wall'], -22, 22, 0.0, 2.0, BASE_Z, HU + 3, G, bev=0.0)
    for nid, cx, w, top in NICHES:
        rx = w / 2; zs = top - rx
        cut = S.arch_solid('cut_' + nid, M['wall'], cx, rx, zs, -0.3, NICHE_DEPTH, G, z0=BASE_Z - .01); cut.hide_render = True; cut.display_type = 'WIRE'
        bm = wall.modifiers.new('cut_' + nid, 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'
    bv = wall.modifiers.new('bev', 'BEVEL'); bv.width = .035; bv.segments = 3; bv.limit_method = 'ANGLE'
    # скос-«рамка» по контуру проёма и скрытая подсветка по контуру (тонкая тёплая полоса на откосе); задняя стенка ниши — сама стена (булева выемка)
    for nid, cx, w, top in NICHES:
        rx = w / 2; zs = top - rx
        fr = S.arch_frame('rim_' + nid, M['frame'], cx, rx, zs, .20, -.10, .03, G, z0=BASE_Z); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .02; fb.segments = 3; fb.limit_method = 'ANGLE'
        S.arch_frame('led_' + nid, M['led'], cx, rx - .015, zs - .015, .028, .05, .13, G, z0=BASE_Z)
        # откосы (боковые стенки ниши) — штукатурка той же стены: булева выемка уже даёт их
    # подставки в нишах
    for nid, cx, w, top in NICHES:
        for k, (kind, dx, dy, sx, sy, h) in enumerate(LAYOUT[nid]['plinths']):
            if kind == 'disc': S.cylinder('pl_%s_%d' % (nid, k), M['block'], cx + dx, dy, sx / 2, BASE_Z, BASE_Z + h, G, seg=96, bev=.025)
            else: S.box('pl_%s_%d' % (nid, k), M['block'], cx + dx - sx / 2, cx + dx + sx / 2, dy - sy / 2, dy + sy / 2, BASE_Z, BASE_Z + h, G, bev=.03)
    # вертикальная рейка справа над нишей EVA (как на референсе)
    for i in range(14):
        x = 14.0 + i * .56; S.box('slat%d' % i, M['slat'], x, x + .30, -.45, 0.0, 8.15, HU + 3, G, bev=.04)
    olive_tree(M, (TREE_X, TREE_Y, BASE_Z), G)
    return M


# высокое оливковое дерево в каменном горшке слева от ниши Keenwell (по просьбе заказчика: высокое, толстый ствол, пышная крона сверху).
# Крона — широкий овал по эскизу заказчика (TREE_ENV): от левого края кадра до x ≈ -7,7 и от верха кадра до z ≈ 9; листья ниже TREE_ZMIN (верх самой высокой арки ≈ 8,5) и вне овала не создаются — ни один бренд листвой не закрыт.
TREE_X, TREE_Y = float(os.environ.get('TREE_X', -16.3)), float(os.environ.get('TREE_Y', -1.0))
TREE_ZMIN = float(os.environ.get('TREE_ZMIN', 9.0))                               # листья не ниже этой высоты (верх самой высокой арки Keenwell ≈ 8,5)
TREE_ENV = dict(ex=float(os.environ.get('TREE_EX', -13.0)), rx=float(os.environ.get('TREE_RX', 5.3)), ez=float(os.environ.get('TREE_EZ', 12.0)), rz=float(os.environ.get('TREE_RZ', 3.3)), p=2.5)   # суперэллипс кроны (x, z в единицах стены)
def olive_tree(M, base, G):
    rnd = random.Random(int(os.environ.get('TREE_SEED', 7))); bx, by, bz = base; up = Vector((0, 0, 1))
    # горшок: тело вращения из травертина, тёмная земля, галька сверху
    import decor as DC
    pot = [(0.0, 0.0), (.70, 0.0), (.80, .06), (.94, .66), (.97, 1.0), (.92, 1.42), (.86, 1.48), (.80, 1.44), (.0, 1.44)]
    DC.lathe('pot', pot, M['block'], G, bx, by, bz, seg=96, caps=True)
    soil = S.mat_simple('soil', (.055, .042, .03), .96)
    DC.lathe('soil', [(0.0, 1.26), (.78, 1.26), (.80, 1.30), (0.0, 1.32)], soil, G, bx, by, bz, seg=64)
    for k in range(10):
        a = rnd.uniform(0, 6.283); r = rnd.uniform(.14, .68); S.cylinder('peb%d' % k, M['frame'], bx + math.cos(a) * r, by + math.sin(a) * r, rnd.uniform(.05, .09), bz + 1.30, bz + 1.35, G, seg=12, bev=.015)
    ma = RL.leaf_material('olive_leafA', (.05, .085, .035), (.16, .23, .075)); mb = RL.leaf_material('olive_leafB', (.085, .125, .05), (.23, .30, .105), under=True)
    leaves = []
    for m in (ma, mb): leaves.extend(RL.leaf_variants(.62, .085, 4, 'olive', (m,)))
    bark = S.mat_simple('bark', (.21, .165, .12), .88)
    def curve(pts, r0, r1):
        cu = bpy.data.curves.new('tw', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, q in enumerate(pts): sp.points[i].co = (q[0], q[1], q[2], 1); sp.points[i].radius = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
        cu.bevel_depth = 1.0; cu.bevel_resolution = 4; cu.use_fill_caps = True; cu.materials.append(bark)
        ob = bpy.data.objects.new('tw', cu); bpy.context.collection.objects.link(ob); ob['grp'] = G
    def at_factory(pts):
        def at(t):
            f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i + 1], f - i)
        return at
    E = TREE_ENV
    def inside(q, k=1.0):
        return (abs((q.x - E['ex']) / (E['rx'] * k)) ** E['p'] + abs((q.z - E['ez']) / (E['rz'] * k)) ** E['p']) <= 1.0
    def ok(pos, dv):                                                   # и корень листа, и его кончик внутри кроны, выше арок и не в стене
        tip = pos + dv * .55
        return pos.z >= TREE_ZMIN - .05 and tip.z >= TREE_ZMIN - .05 and inside(pos, 1.03) and inside(tip, 1.05) and tip.y <= -.12 and pos.y <= -.12
    def leafy(pts, count, k, r0, r1):
        curve(pts, r0, r1); at = at_factory(pts)
        for i in range(1, count + 1):
            t = i / (count + 1) * .94 + .06; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
            for dv in RL.pair_dirs(d, i, rnd, spread=1.0, up=.20, droop=.24):
                if dv.y > .2: dv.y *= .25; dv.normalize()
                if not ok(pos, dv): continue
                ob = bpy.data.objects.new('lf', rnd.choice(leaves)); bpy.context.collection.objects.link(ob); ob['grp'] = G
                ob.scale = ((1.15 - .40 * t) * (.74 + rnd.random() * .56) * k,) * 3
                RL.orient(ob, dv, rnd, .8, RL.tint_for(t, rnd)); ob.location = pos
        e = at(1); ed = (at(1) - at(.9)).normalized()
        if ok(e, ed):
            tip = bpy.data.objects.new('lf', leaves[0]); bpy.context.collection.objects.link(tip); tip['grp'] = G
            tip.scale = (k,) * 3; tip.rotation_euler = ed.to_track_quat('Y', 'Z').to_euler(); tip.location = e
        return at
    root = Vector((bx, by, bz + 1.28)); topz = float(os.environ.get('TREE_TOPZ', 9.8)); H = topz - root.z
    ytw = by + .02
    trunk = [root, root + Vector((.10, .02, H * .20)), root + Vector((.34, -.05, H * .46)), root + Vector((.62, .04, H * .74)), Vector((bx + .95, ytw, topz))]
    tr = leafy(trunk, 8, .9, float(os.environ.get('TREE_R0', .42)), .24)       # толстый ствол
    for sgn in (-1, 1):                                                # два боковых ствола: сращены с основным и уходят в крону (не обрываются голой палкой)
        o = lambda t_, sx_, sy_, sz_: tr(t_) + Vector((sx_ * sgn, sy_ * sgn, sz_))
        st = [root + Vector((.22 * sgn, .08 * sgn, 0)), o(.34, .30, .06, 0), o(.68, .27, .04, 0), o(.97, .20, .02, .15), Vector((bx + .95 + .30 * sgn, ytw + .02 * sgn, topz + .75))]
        leafy(st, 14, .95, .17, .10)
    top = Vector((bx + .95, ytw, topz))
    def limb(pts, r0, r1):
        return leafy(pts, 20, .95, r0, r1)
    V = Vector
    limbs = [limb([top, V((-15.2, ytw - .1, 11.6)), V((-14.4, ytw - .2, 13.2)), V((-13.6, ytw - .2, 14.5))], .21, .06),
             limb([top, V((-14.2, ytw - .1, 10.7)), V((-12.5, ytw - .3, 12.0)), V((-10.9, ytw - .4, 12.9))], .20, .06),
             limb([tr(.92), V((-13.9, ytw - .2, 10.1)), V((-11.9, ytw - .5, 10.7)), V((-9.7, ytw - .6, 11.5))], .17, .05),
             limb([top, V((-16.2, ytw - .1, 11.5)), V((-16.9, ytw - .2, 13.2)), V((-16.3, ytw - .3, 14.8))], .18, .05),
             limb([tr(.97), V((-14.8, ytw - .3, 11.2)), V((-13.0, ytw - .8, 13.2)), V((-11.5, ytw - .8, 14.4))], .15, .05)]
    nb = int(os.environ.get('TREE_NB', 140)); LBk = float(os.environ.get('TREE_LB', 1.0)); cen = V((E['ex'], 0, E['ez']))
    for j in range(nb):                                                # ветки отходят от ветвей наружу от центра кроны: заполняют весь контур
        at0 = rnd.choice(limbs); P0 = at0(rnd.uniform(.12, 1.0))
        rad = V((P0.x - cen.x, 0, P0.z - cen.z)); rad = rad.normalized() if rad.length > .2 else V((0, 0, 1))
        if j % 3 == 2: d = (rad * -rnd.uniform(.2, .6) + V((rnd.uniform(-.8, .8), rnd.uniform(-.6, .1), rnd.uniform(-.7, .25)))).normalized()      # каждая третья — внутрь и вниз: закрывает просветы
        else: d = (rad * rnd.uniform(.55, 1.0) + V((rnd.uniform(-.7, .7), rnd.uniform(-.55, .25), rnd.uniform(-.25, .7)))).normalized()
        Lb = rnd.uniform(1.0, 2.1) * LBk
        for _ in range(7):                                             # укоротить, пока кончик не окажется в контуре кроны
            if inside(P0 + d * Lb, 1.0): break
            Lb *= .8
        else: continue
        mid = P0 + d * Lb * .5 + V((0, 0, .10 * Lb))
        pts = [P0, P0 + d * Lb * .30 + V((0, 0, .08)), mid, P0 + d * Lb * .78 + V((0, 0, .02 * Lb)), P0 + d * Lb + V((0, 0, -.08 * Lb))]
        at = leafy(pts, 30, 1.0, .030, .008)
        for t in (.34, .56, .76):
            P = at(t); az2 = rnd.uniform(0, 6.283); d2 = (d * .6 + V((math.cos(az2), math.sin(az2) * .35, rnd.uniform(-.3, .6)))).normalized(); L2 = Lb * rnd.uniform(.30, .46)
            leafy([P, P + d2 * L2 * .5 + V((0, 0, .04)), P + d2 * L2 + V((0, 0, -.03))], 10, .95, .012, .006)



def lights(sc):
    # солнце слева-спереди сквозь оконный переплёт (переплёт для камеры невидим, но даёт тень): мягкие диагональные «окна света» на верхней части стены
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = float(os.environ.get('SUN', 5.0)); sun.angle = math.radians(float(os.environ.get('SUN_ANGLE', 1.6))); sun.color = S.E3('SUNC', (1.0, .93, .82))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    direction = Vector((.58, .66, -.48)).normalized(); so.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); so.location = (-30, -30, 30)
    mat = S.mat_simple('frame', (.1, .1, .1)); center = Vector((-9.0, 0.0, 10.5)) - direction * 26.0
    ex = direction.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(direction).normalized()
    def bar(u0, v0, u1, v1):
        bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object
        b.scale = (abs(u1 - u0), 0.15, abs(v1 - v0)); b.location = center + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2); b.rotation_euler = Matrix((ex, direction, ey)).transposed().to_euler()
        b.data.materials.append(mat); b.visible_camera = False; b['grp'] = 'gobo'
    u0_, u1_, v0_, v1_ = -11.0, 9.0, -7.0, 7.0                                              # переплёт без «глухих» полей: солнце освещает всю стену, а переплёт даёт решётку теней слева
    for u in (u0_, -5.5, -1.0, 4.0, u1_): bar(u - .22, v0_, u + .22, v1_)
    for v in (v0_, -2.6, 2.6, v1_): bar(u0_, v - .22, u1_, v + .22)
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = float(os.environ.get('FILL', 12000)); ar.size = 40; ar.size_y = 16; ar.color = S.E3('FILLC', (1.0, .93, .82))
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = (-4.0, -40.0, 14.0); ao.rotation_euler = (math.radians(80), 0, 0); ao.visible_camera = False
    for nid, cx, wd, top in NICHES:
        a = bpy.data.lights.new('nl_' + nid, 'AREA'); a.energy = float(os.environ.get('NICHE_L', 190)) * (wd / 3.0); a.size = wd * .75; a.size_y = 1.0; a.color = (1.0, .84, .62)
        o = bpy.data.objects.new('nl_' + nid, a); bpy.context.collection.objects.link(o); o.location = (cx, .12, top - 1.1); o.rotation_euler = (math.radians(90 - 28), 0, 0); o.visible_camera = False
        a2 = bpy.data.lights.new('nf_' + nid, 'AREA'); a2.energy = float(os.environ.get('NICHE_F', 110)) * (wd / 3.0); a2.size = wd * .8; a2.size_y = wd * .5; a2.color = (1.0, .90, .76)
        o2 = bpy.data.objects.new('nf_' + nid, a2); bpy.context.collection.objects.link(o2); o2.location = (cx, -2.6, BASE_Z + 3.6); o2.rotation_euler = (math.radians(90 - 8), 0, 0); o2.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.96, .88, .78)), 1); bg.inputs['Strength'].default_value = float(os.environ.get('WORLD', .6)); sc.world = w


def camera(sc):
    cd = bpy.data.cameras.new('cam'); cd.lens = LENS; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 5000.0
    cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); cam.location = CAM; cam.rotation_euler = (math.radians(90), 0, 0); sc.camera = cam
    bpy.context.view_layer.update(); return cam


def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (round(v.x, 5), round(1 - v.y, 5))


def layout_json(sc, cam):
    out = {'plate': {'w': PW, 'h': PH}, 'unit_cm': 10, 'px_per_cm': round(PW / (WU * 10), 3), 'base_z': BASE_Z, 'niches': {}}
    for nid, cx, w, top in NICHES:
        x0, y_top = proj(sc, cam, (cx - w / 2, 0.0, top)); x1, _ = proj(sc, cam, (cx + w / 2, 0.0, top)); xc, ytop = proj(sc, cam, (cx, 0.0, top)); _, ybot = proj(sc, cam, (cx, 0.0, BASE_Z))
        slots = []
        for dx, dy, hp in LAYOUT[nid]['slots']:
            px, py = proj(sc, cam, (cx + dx, dy, BASE_Z + hp)); _, py2 = proj(sc, cam, (cx + dx, dy, BASE_Z + hp + 1.0)); slots.append({'x': px, 'y': py, 'pxcm': round((py - py2) * PH / 10.0, 3), 'dy': dy, 'hp': hp})
        out['niches'][nid] = {'cx': xc, 'x0': round(x0, 5), 'x1': round(x1, 5), 'top': ytop, 'bottom': ybot, 'w_u': w, 'slots': slots}
    return out


def export(im):
    """Цветокоррекция под гамму каталога и главной (стена теплее и насыщеннее: B/R ≈ 0,82, насыщенность ≈ 0,18 — как у стены витрины каталога assets/showroom/layer-shell.webp и кадров главной) и запись webp.
    Переменные: BW_SAT, BW_GAMMA, BW_LIFT, BW_WARM (множители R,G,B)."""
    from PIL import Image
    import numpy as np
    g = S.grade(np.asarray(im), sat=float(os.environ.get('BW_SAT', 1.38)), gamma=float(os.environ.get('BW_GAMMA', .85)), lift=float(os.environ.get('BW_LIFT', .05)))
    g = np.clip(g * np.array([float(x) for x in os.environ.get('BW_WARM', '1.0,.99,.955').split(',')], np.float32), 0, 255)
    im2 = Image.fromarray(g.astype(np.uint8)); os.makedirs(OUT, exist_ok=True)
    im2.save(os.path.join(OUT, 'wall.webp'), quality=92, method=6)
    im2.resize((1800, round(1800 * PH / PW)), Image.LANCZOS).save(os.path.join(OUT, 'wall-s.webp'), quality=90, method=6)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if mode == 'regrade':                                                     # только цветокоррекция уже посчитанного кадра /tmp/wall_full.png (без рендера)
        from PIL import Image
        export(Image.open('/tmp/wall_full.png').convert('RGB')); print('regrade done'); return
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    pw = int(os.environ.get('BW_W', 1536 if mode == 'preview' else PW)); spp = int(os.environ.get('BW_SPP', 24 if mode == 'preview' else 56))
    S.settings(sc, pw, round(pw * PH / PW), spp)
    sc.view_settings.exposure = float(os.environ.get('EXPO', -0.85))
    build(sc); lights(sc); cam = camera(sc)
    print('сцена собрана, объектов %d' % len(bpy.data.objects), flush=True)
    sc.render.film_transparent = False
    if mode == 'layout':
        os.makedirs(OUT, exist_ok=True); json.dump(layout_json(sc, cam), open(os.path.join(OUT, 'wall.json'), 'w'), ensure_ascii=False, indent=1); print('layout done'); return
    if mode == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/wall_preview.png'); bpy.ops.render.render(write_still=True); print('preview done'); return
    os.makedirs(OUT, exist_ok=True)
    sc.render.filepath = '/tmp/wall_full.png'; bpy.ops.render.render(write_still=True)
    json.dump(layout_json(sc, cam), open(os.path.join(OUT, 'wall.json'), 'w'), ensure_ascii=False, indent=1)
    from PIL import Image
    import numpy as np
    export(Image.open('/tmp/wall_full.png').convert('RGB'))
    print('готово →', OUT, flush=True)


if __name__ == '__main__':
    main()
