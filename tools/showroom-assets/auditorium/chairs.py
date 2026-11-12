#!/usr/bin/env python3
"""Кресла зала учебного центра «Астрея» (Blender 5.0, Cycles) и их расстановка рядами.

Кресло — мягкое «бочкообразное», без подлокотников: высокая (0.88 м) широкая спинка со скруглёнными плечами и кромкой, изогнутая по ширине (обнимает сидящего)
и слегка откинутая; сиденье — мягкая подушка с «шапкой» по краю и провисанием в центре (высота 0.46 м); между спинкой и сиденьем — тёмный «канал»-шов;
под сиденьем — обитая рама и четыре тонкие конические ножки из матового золота «шампань» (Ø18 → 12 мм, наклон наружу 6°, на каждой накладка-розетка).
Ширина 0.58 м, глубина ≈ 0.55 м, высота спинки 0.88 м; ≈ 45 тыс. полигонов на кресло (запечённый Subsurf + кант-шнуры по швам, 4 части: спинка, сиденье, рама, ножки). Начало координат — на полу между ножками; лицо (сиденье) смотрит в +Y, спинка — при меньших y (зритель сзади видит спинки).
Обивка: 'navy' — тёмно-синий бархат (#16223e): `velvet-velour-red` из библиотеки, перекрашенный нодой Hue/Saturation/Value (color.jpg на диске не тронут), sheen, «замятый» ворс;
'cream' — кремовое букле/шерсть (#d9cdb8): `boucle-cream-teddy` (петли-кудри, нормали + бамп, AO), пушистый блик по краям.

  make_chair(kind, name, variant=None, seed=None, collection=None) → корневой Empty `aud_chair_<kind>_…` (дети: _back, _seat, _base, _legs); kind — 'navy' | 'cream'.
        variant=None — кресло с собственными мешами; variant=N — меши общие для всех кресел этого варианта (linked duplicates: геометрия и BVH в Cycles одни на все копии).
        У каждого кресла свои лёгкие случайности: поворот корня ±2° (и ≤ .5° наклона), высота подушки ±3 %, наклон/поворот спинки и подушки, оттенок ткани (Object Info → Random).
  place_rows(rows_y=None, x_ranges=None, step_x=0.66, seed=7) → список корневых объектов (≈ 140 штук): блоки кресел, «шахматный» navy/cream с нарушениями (в первых рядах ≈ 60 % navy),
        смещение ±1.5 см и поворот ±2° у каждого; меши — 4 варианта формы (общие), поэтому сцена остаётся лёгкой.
  chair_stats(root) → {'polys': …, 'verts': …, 'parts': …} — число полигонов кресла (запечённая геометрия, как в рендере).
  python3 chairs.py preview — мини-студия: пол marble-white-warm, один тёплый area-свет + мягкий фон, камера (0, −1.5, 1.25) → +Y, 2 ряда, /tmp/aud_chairs.png (960×540)
                              и крупный план navy + cream /tmp/aud_chair_closeup.png (Cycles CPU, 64 сэмпла, OIDN, threads=2; запускать через `nice -n 10`).
Переменные окружения превью: AUD_SPP (сэмплы, по умолчанию 64), AUD_W (ширина кадра, 960), AUD_ROWS (число рядов, 2)."""
import bpy, bmesh, math, os, sys, random, time, colorsys, zlib
from mathutils import Vector, Matrix, noise

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.normpath(os.path.join(HERE, '..', 'textures'))                      # библиотека CC0-текстур: tools/showroom-assets/textures/<slug>/
PFX = 'aud_chair_'
COL_NAME = 'aud_chairs'

# ---------------- размеры (метры) ----------------
W = .58                      # ширина
D = .55                      # глубина (общая, по ножкам и спинке ≈ .55–.56)
SEAT_TOP = .46               # высота сиденья
BACK_TOP = .88               # высота спинки от пола
LEG_TOP_Z = .276             # низ накладки ножки (= низ рамы)
BASE_Z0, BASE_Z1 = .280, .340
BACK_Z0 = .320               # низ спинки
BACK_Y = -.200               # центральная плоскость спинки (у низа)
SEAT_Z0 = .335               # низ подушки
SEAT_Y0, SEAT_Y1 = -.170, .256
LEG_TILT = math.radians(6.0)
N_VARIANTS = 4

KINDS = ('navy', 'cream')


# ---------------------------------------------------------------------------------------------------------------------------- вспомогательное
def _collection(name=COL_NAME):
    """коллекция для кресел (создаётся при необходимости и подключается к сцене)"""
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    sc = bpy.context.scene
    if c.name not in [x.name for x in sc.collection.children_recursive]:
        sc.collection.children.link(c)
    return c


def _cl(t, k):
    """сгущение узлов сетки к краю (|t|→1): больше точек на скруглениях"""
    return math.copysign(1.0 - (1.0 - abs(t)) ** k, t) if t else 0.0


def _rbox(hx, hy, hz, rx, ry, rz, nx, ny, nz, k=1.7):
    """скруглённый параллелепипед (полуразмеры hx, hy, hz; радиусы скруглений rx, ry, rz; сетка nx×ny×nz на грань) → (bmesh, список единичных нормалей по вершинам).
    Нормаль нужна для смещений вдоль поверхности (шов, складки) и как признак положения на скруглении: шов — там, где |n·ось грани| = .707"""
    ts = lambda n: [_cl(-1 + 2.0 * i / n, k) for i in range(n + 1)]
    tx, ty, tz = ts(nx), ts(ny), ts(nz)
    idx = {}; pts = []
    for i in range(nx + 1):
        for j in range(ny + 1):
            for l in range(nz + 1):
                if i in (0, nx) or j in (0, ny) or l in (0, nz):
                    idx[(i, j, l)] = len(pts); pts.append((i, j, l))
    bm = bmesh.new(); E = []
    ix, iy, iz = hx - rx, hy - ry, hz - rz
    verts = []
    for (i, j, l) in pts:
        q = Vector((tx[i] * hx, ty[j] * hy, tz[l] * hz))
        c = Vector((max(-ix, min(ix, q.x)), max(-iy, min(iy, q.y)), max(-iz, min(iz, q.z))))
        dv = q - c
        e = Vector((dv.x / rx, dv.y / ry, dv.z / rz)); e.normalize()
        q = c + Vector((e.x * rx, e.y * ry, e.z * rz))
        n = Vector((e.x / rx, e.y / ry, e.z / rz)); n.normalize(); E.append(n)
        verts.append(bm.verts.new(q))
    bm.verts.ensure_lookup_table()
    def quad(a, b, c, d):
        vs = [verts[idx[a]], verts[idx[b]], verts[idx[c]], verts[idx[d]]]
        cen = sum((v.co for v in vs), Vector()) / 4.0; nrm = (vs[1].co - vs[0].co).cross(vs[3].co - vs[0].co)
        if nrm.dot(cen) < 0: vs.reverse()
        bm.faces.new(vs)
    for i in (0, nx):
        for j in range(ny):
            for l in range(nz): quad((i, j, l), (i, j + 1, l), (i, j + 1, l + 1), (i, j, l + 1))
    for j in (0, ny):
        for i in range(nx):
            for l in range(nz): quad((i, j, l), (i + 1, j, l), (i + 1, j, l + 1), (i, j, l + 1))
    for l in (0, nz):
        for i in range(nx):
            for j in range(ny): quad((i, j, l), (i + 1, j, l), (i + 1, j + 1, l), (i, j + 1, l))
    return bm, E


def _uv_box(me):
    """UV «по доминирующей оси грани» (метры): для мелкой ткани швы проекций не видны, а касательные нормалей получаются правильными"""
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal; a = max(range(3), key=lambda i: abs(n[i])); sg = 1.0 if n[a] > 0 else -1.0
        for lp in f.loops:
            c = lp.vert.co
            lp[uvl].uv = (c.y * sg, c.z) if a == 0 else ((-c.x * sg, c.z) if a == 1 else (c.x * sg, c.y))
        f.smooth = True
    bm.to_mesh(me); bm.free()


def _outline(na, h, r, lat=45.0, ds=.006):
    """замкнутые линии кантов на скруглённом блоке: na — ось «лица» (0/1/2), h — полуразмеры, r — радиусы скруглений, lat — угол от оси лица (45° = линия шва).
    Возвращает по линии на каждую из двух граней: [(точки q, нормали e)] — те же q, e, что у вершин блока, поэтому линия после деформации ложится точно на поверхность"""
    pa, pb = [i for i in range(3) if i != na]; ca, cb, cn = h[pa] - r[pa], h[pb] - r[pb], h[na] - r[na]
    cl, sl = math.cos(math.radians(lat)), math.sin(math.radians(lat)); res = []
    for sgn in (1, -1):
        pts = []
        def add(ca_, cb_, dx, dy):                                                                # опорная точка ядра (ca_, cb_) и направление наружу (dx, dy) в плоскости
            q = [0.0, 0.0, 0.0]; e = [0.0, 0.0, 0.0]
            q[pa] = ca_ + r[pa] * cl * dx; q[pb] = cb_ + r[pb] * cl * dy; q[na] = sgn * (cn + r[na] * sl)
            e[pa] = cl * dx; e[pb] = cl * dy; e[na] = sgn * sl; pts.append((Vector(q), Vector(e)))
        corners = ((1, 1), (-1, 1), (-1, -1), (1, -1))                                            # обход против часовой стрелки: углы и прямые между ними
        for k in range(4):
            sa, sb = corners[k]; n_arc = max(6, int(.5 * math.pi * max(r[pa], r[pb]) * cl / ds))
            for i in range(n_arc):
                th = math.pi / 2 * k + math.pi / 2 * i / n_arc
                add(sa * ca, sb * cb, math.cos(th), math.sin(th))
            sa2, sb2 = corners[(k + 1) % 4]; n_ln = max(1, int((2 * ca if k % 2 == 0 else 2 * cb) / ds))
            dx, dy = round(math.cos(math.pi / 2 * (k + 1))), round(math.sin(math.pi / 2 * (k + 1)))
            for i in range(0, n_ln):
                f = i / float(n_ln); add(sa * ca + (sa2 * ca - sa * ca) * f, sb * cb + (sb2 * cb - sb * cb) * f, dx, dy)
        res.append(pts)
    return res


def _tube(bm, pts, ups, r=.0033, seg=10):
    """трубка-кант вдоль замкнутой линии (шнур в шве): круглое сечение, гладкая"""
    n = len(pts); rings = []
    for i in range(n):
        t = pts[(i + 1) % n] - pts[i - 1]; t.normalize(); u = ups[i] - t * ups[i].dot(t); u.normalize(); w = t.cross(u)
        rings.append([bm.verts.new(pts[i] + (u * math.cos(2 * math.pi * k / seg) + w * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for i in range(n):
        for k in range(seg):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[(i + 1) % n][(k + 1) % seg], rings[(i + 1) % n][k])); f.smooth = True


def _bake(bm, name, levels=1, pipes=()):
    """bmesh → Mesh; Subdivision Surface применяется один раз (запекается), чтобы копии с общим мешем были настоящими instance-ами в Cycles; кант-шнуры (pipes) добавляются после"""
    me = bpy.data.meshes.new(name + '_src'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    if levels:
        tmp = bpy.data.objects.new(name + '_tmp', me); bpy.context.scene.collection.objects.link(tmp)
        md = tmp.modifiers.new('sub', 'SUBSURF'); md.levels = levels; md.render_levels = levels; md.quality = 3
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        out = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), depsgraph=dg)
        bpy.data.objects.remove(tmp); bpy.data.meshes.remove(me)
    else:
        out = me
    out.name = name
    if pipes:
        b2 = bmesh.new(); b2.from_mesh(out)
        for pts, ups, rad in pipes: _tube(b2, pts, ups, rad)
        b2.to_mesh(out); b2.free()
    _uv_box(out)
    return out


def _clamp(x, a=0.0, b=1.0): return a if x < a else (b if x > b else x)


# ---------------------------------------------------------------------------------------------------------------------------- геометрия частей
def _back_mesh(name, rv):
    """спинка: скруглённый блок, потом «арка» плеч (высота колонки зависит от x), изгиб по ширине (обнимает), откат назад, бугор сзади и вмятина спереди,
    микроскладки (шум), складки сжатия у нижнего края (где ткань собирается у сиденья) и кант-шнур по шву лица и кромки (спереди и сзади). Начало — низ-центр блока."""
    hx = .284 * (1 + rv.uniform(-.012, .012)); hy = .048; hz = .280; rr = (.052, .046, .052)
    s0 = rv.uniform(0, 100); Rc = .170 + rv.uniform(-.012, .012); ne = 2.4; dome = .016 + rv.uniform(-.004, .004)
    c0 = .045 + rv.uniform(-.004, .004); c1 = .050 + rv.uniform(-.005, .005)
    lean = math.tan(math.radians(4.0 + rv.uniform(-.5, .5))); skew = rv.uniform(-.014, .014); asym = rv.uniform(-.006, .006)
    crown = .010 + rv.uniform(-.002, .003); dish = .008 + rv.uniform(-.001, .002); wr = 1.0 + rv.uniform(-.2, .3)
    def deform(q, e):
        q = q.copy(); u = q.x / hx; t0 = (q.z + hz) / (2 * hz); w = q.y / hy
        f1 = noise.fractal(Vector((q.x * 20 + s0, q.y * 20, q.z * 20 - s0)), .55, 2.0, 4)
        f2 = noise.fractal(Vector((q.x * 58 + s0 * 1.7, q.z * 58, q.y * 58)), .5, 2.0, 2)
        q += e * ((f1 * .0016 + f2 * .0005) * wr)                                                                    # мягкая неровность ткани
        if e.y > .25:                                                                                                # складки сжатия у низа лица (там, где ткань уходит к сиденью)
            fz = math.exp(-t0 / .09) * max(0.0, 1 - u * u * .8)
            q += e * (.0022 * math.sin(u * 44 + f1 * 3.2 + s0) * fz * wr)
        s = _clamp((abs(q.x) - (hx - Rc)) / Rc)
        drop = Rc * (1 - (1 - s ** ne) ** (1 / ne)) + dome * u * u + asym * u                                         # скруглённые плечи, купол и неидеальная симметрия
        zl = (q.z + hz) * (2 * hz - drop) / (2 * hz)
        env = max(0.0, 1 - u * u) ** .8 * max(0.0, 4 * t0 * (1 - t0)) ** .5
        q.y -= (crown * max(-w, 0.0) + dish * max(w, 0.0)) * env                                                     # сзади бугор, спереди вмятина под спину
        q.y += (c0 + c1 * t0) * (u * u)                                                                              # изгиб по ширине: края идут вперёд
        q.y -= lean * zl                                                                                             # откат назад
        q.x += skew * t0 * t0
        q.z = zl
        return q
    bm, E = _rbox(hx, hy, hz, rr[0], rr[1], rr[2], 34, 14, 32)
    for v, e in zip(bm.verts, E): v.co = deform(v.co, e)
    pipes = []
    for pts in _outline(1, (hx, hy, hz), rr, 45.0):
        P = [deform(q, e) + e * .0011 for q, e in pts]; pipes.append((P, [e for q, e in pts], .0032))
    return _bake(bm, name, 1, pipes)


def _seat_mesh(name, rv):
    """подушка сиденья: «шапка» по краю (выпуклость), провисание в центре, выпуклый передний край, задняя кромка огибает изгиб спинки, кант-шнур по верхнему и нижнему шву,
    складки у задней кромки и «ушки»-сборки в передних углах. Начало — низ-центр блока."""
    hx = .265 * (1 + rv.uniform(-.015, .015)); L = SEAT_Y1 - SEAT_Y0; hy = L / 2; hz = .060 + rv.uniform(-.003, .004); rr = (.090, .090, .042)
    s0 = rv.uniform(0, 100); crown = .017 + rv.uniform(-.003, .003); sag = .017 + rv.uniform(-.004, .004); wr = 1.0 + rv.uniform(-.2, .3)
    rear_c = .044 + rv.uniform(-.004, .004); asym = rv.uniform(-.006, .006)
    def deform(q, e):
        q = q.copy(); u = q.x / hx; w = q.y / hy; zz = q.z / hz; top = max(0.0, zz)
        f1 = noise.fractal(Vector((q.x * 22 + s0, q.y * 22, q.z * 22 + s0 * .6)), .55, 2.0, 4)
        f2 = noise.fractal(Vector((q.x * 62 + s0 * 1.3, q.y * 62, q.z * 62)), .5, 2.0, 2)
        q += e * ((f1 * .0018 + f2 * .0006) * wr * (.6 + .4 * abs(e.z)))
        if e.z > .2 and w < -.35:                                                                                    # складки у задней кромки (подушка поджата спинкой)
            fz = _clamp((-w - .35) / .65) * max(0.0, 1 - u * u * .6)
            q += e * (.0024 * math.sin(u * 40 + f1 * 3.0 + s0) * fz * wr)
        if e.z > .15 and w > .25:                                                                                    # сборки в передних углах: лучевые складки вокруг скругления
            ang = math.atan2(abs(w) - .55, abs(u) - .55)
            cz = _clamp((abs(u) - .55) * 3.0) * _clamp((w - .25) * 3.0)
            q += e * (.0011 * math.sin(ang * 11 + s0 * .3 + (1 if u > 0 else 0) * 2.1) * cz * wr)
        rho = (abs(u) ** 3 + abs(w) ** 3) ** (1 / 3.0)
        q.z += crown * max(0.0, 1 - ((rho - .80) / .38) ** 2) * top                                                  # «шапка»: набитый валик у кромки
        q.z -= sag * math.exp(-((rho / .55) ** 2)) * top * top                                                       # провисание в центре
        q.z += .004 * max(0.0, 1 - rho * rho) * top
        q.z -= .007 * max(0.0, -w) * top                                                                              # сиденье чуть наклонено назад
        bl = 1.0 - zz * zz
        q.x *= 1.0 + .026 * bl
        if w > 0: q.y += .011 * (1 - u * u) * w * (.4 + .6 * top)                                                      # передний край выпуклый
        q.y += rear_c * u * u * max(0.0, -w) ** 1.3                                                                  # задняя кромка огибает изгиб спинки
        q.x += asym * (zz + 1) * .5
        q.z += hz
        return q
    bm, E = _rbox(hx, hy, hz, rr[0], rr[1], rr[2], 32, 30, 10)
    for v, e in zip(bm.verts, E): v.co = deform(v.co, e)
    pipes = []
    for pts in _outline(2, (hx, hy, hz), rr, 45.0):
        P = [deform(q, e) + e * .0012 for q, e in pts]; pipes.append((P, [e for q, e in pts], .0034))
    return _bake(bm, name, 1, pipes)


def _base_mesh(name, rv):
    """обитая рама под подушкой (видна как тень под сиденьем): низкий мягкий блок"""
    bm, E = _rbox(.236, .194, .030, .022, .022, .014, 14, 14, 4)
    s0 = rv.uniform(0, 100)
    for v, e in zip(bm.verts, E):
        q = v.co.copy(); q += e * (noise.fractal(Vector((q.x * 18 + s0, q.y * 18, q.z * 18)), .55, 2.0, 3) * .0012); q.z += .030; v.co = q
    return _bake(bm, name, 1)


def _sweep(bm, rings, seg, cap0=True, cap1=True):
    """поверхность вращения по кольцам: rings = [(центр, радиус, a1, a2)]; боковые грани гладкие, торцы плоские"""
    vs = []
    for (c, r, a1, a2) in rings:
        vs.append([bm.verts.new(c + (a1 * math.cos(2 * math.pi * k / seg) + a2 * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for i in range(len(vs) - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            f = bm.faces.new((vs[i][k], vs[i][k2], vs[i + 1][k2], vs[i + 1][k])); f.smooth = True
    if cap0: bm.faces.new(vs[0][::-1]).smooth = False
    if cap1: bm.faces.new(vs[-1]).smooth = False


def _legs_mesh(name, rv):
    """четыре тонкие конические ножки Ø18 → 12 мм, наклон наружу 6° (по диагонали), закруглённая пятка; сверху латунная накладка-розетка Ø44 мм с фаской"""
    bm = bmesh.new(); seg = 24; r0, r1 = .009, .006
    for sx in (-1, 1):
        for sy in (-1, 1):
            jx = rv.uniform(-.0015, .0015); jy = rv.uniform(-.0015, .0015)
            px = sx * .206 + jx; py = (-.150 if sy < 0 else .184) + jy; zt = LEG_TOP_Z
            out = Vector((sx * .62, sy * .78, 0)).normalized(); tl = LEG_TILT + rv.uniform(-.004, .004)
            ax = Vector((out.x * math.sin(tl), out.y * math.sin(tl), -math.cos(tl)))
            a1 = ax.cross(Vector((0, 1, 0))); a1.normalize(); a2 = ax.cross(a1); a2.normalize()
            top = Vector((px, py, zt)); Lp = (zt - r1) / math.cos(tl)
            rings = []
            for i in range(0, 13):                                                                                   # конус с лёгким расширением у накладки
                s = i / 12.0; r = r0 + (r1 - r0) * s; r *= 1 + .22 * math.exp(-s * 22)
                rings.append((top + ax * (Lp * s), r, a1, a2))
            C = top + ax * Lp
            for ph in (22, 45, 64, 78, 88):                                                                          # полусфера-пятка
                a = math.radians(ph); rings.append((C + ax * (r1 * math.sin(a)), r1 * math.cos(a), a1, a2))
            _sweep(bm, rings, seg, cap0=False, cap1=True)
            zd = Vector((0, 0, -1)); b1 = Vector((1, 0, 0)); b2 = Vector((0, 1, 0))                                  # накладка: диск с фасками
            prof = ((0.0, .0185), (.0007, .0213), (.0030, .0222), (.0052, .0213), (.0059, .0188))
            pr = [(Vector((px, py, zt + .0059)) + zd * d, r, b1, b2) for d, r in prof]
            _sweep(bm, pr, 28, cap0=True, cap1=True)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = (len(p.vertices) == 4)
    _uv_box(me)
    for p in me.polygons: p.use_smooth = (len(p.vertices) == 4)
    return me


# ---------------------------------------------------------------------------------------------------------------------------- материалы
def _img(nt, slug, fn, cs):
    n = nt.nodes.new('ShaderNodeTexImage')
    img = bpy.data.images.load(os.path.join(TEX, slug, fn), check_existing=True); img.colorspace_settings.name = cs
    n.image = img; n.interpolation = 'Cubic'; return n


def _sock(node, ident, kind='in'):
    for s in (node.inputs if kind == 'in' else node.outputs):
        if s.identifier == ident: return s


def _mix(nt, a, b, fac=1.0, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend; L = nt.links
    for ident, x in (('A_Color', a), ('B_Color', b)):
        if isinstance(x, tuple): _sock(n, ident).default_value = (x[0], x[1], x[2], 1.0)
        else: L.new(x, _sock(n, ident))
    f = _sock(n, 'Factor_Float')
    if isinstance(fac, (int, float)): f.default_value = fac
    else: L.new(fac, f)
    return _sock(n, 'Result_Color', 'out')


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp; L = nt.links
    for i, x in enumerate((a, b)):
        if x is None: continue
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: L.new(x, n.inputs[i])
    return n.outputs[0]


def _ramp(nt, fac, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    while len(r.color_ramp.elements) < len(stops): r.color_ramp.elements.new(.5)
    for e, (p, c) in zip(r.color_ramp.elements, stops): e.position = p; e.color = c
    nt.links.new(fac, r.inputs['Fac']); return r.outputs['Color']


def _noise(nt, vec, scale, detail=3.0, rough=.55, dist=0.0):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough; n.inputs['Distortion'].default_value = dist; nt.links.new(vec, n.inputs['Vector']); return n.outputs['Fac']


def _mapping(nt, vec, scale, loc=None):
    m = nt.nodes.new('ShaderNodeMapping'); m.inputs['Scale'].default_value = scale; nt.links.new(vec, m.inputs['Vector'])
    if loc is not None: nt.links.new(loc, m.inputs['Location'])
    return m.outputs['Vector']


def _val(b, v, *names):
    for n in names:
        if n in b.inputs: b.inputs[n].default_value = v; return


def _srgb2lin(c):
    c = c / 255.0
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def _hex_lin(h): return tuple(_srgb2lin(c) for c in h)


def _tex_mean_lin(slug, fn='color.jpg'):
    """средний линейный цвет текстуры (для подгонки оттенка под заданный hex)"""
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(os.path.join(TEX, slug, fn)).convert('RGB').resize((64, 64), Image.BILINEAR), dtype=np.float64) / 255.0
    lin = np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
    return tuple(float(x) for x in lin.reshape(-1, 3).mean(0))


def _base_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m, nt, b


def mat_velvet(name=PFX + 'velvet_navy', target=(0x16, 0x22, 0x3e), slug='velvet-velour-red', tile=.22):
    """тёмно-синий бархат: библиотечная `velvet-velour-red` → нода Hue/Saturation/Value (красный → тёмно-синий, параметры считаются по среднему цвету текстуры),
    «замятый» ворс (вытянутый шум, свой у каждого кресла по Object Info Random), sheen и подсветка волокон по краям силуэта"""
    m = bpy.data.materials.get(name)
    if m is not None: return m
    m, nt, b = _base_mat(name); L = nt.links
    mean = _tex_mean_lin(slug); hs0, ss0, vs0 = colorsys.rgb_to_hsv(*mean); ht, st, vt = colorsys.rgb_to_hsv(*_hex_lin(target))
    tc = nt.nodes.new('ShaderNodeTexCoord'); uvm = _mapping(nt, tc.outputs['UV'], (1 / tile, 1 / tile, 1 / tile))
    col = _img(nt, slug, 'color.jpg', 'sRGB'); L.new(uvm, col.inputs['Vector'])
    hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.inputs['Hue'].default_value = (ht - hs0 + .5) % 1.0; hsv.inputs['Saturation'].default_value = st / ss0 if ss0 else 1.0
    hsv.inputs['Value'].default_value = vt / vs0; hsv.inputs['Fac'].default_value = 1.0; L.new(col.outputs['Color'], hsv.inputs['Color'])
    oi = nt.nodes.new('ShaderNodeObjectInfo'); r = oi.outputs['Random']
    cx = nt.nodes.new('ShaderNodeCombineXYZ'); L.new(_math(nt, 'MULTIPLY', r, 41.0), cx.inputs['X']); L.new(_math(nt, 'MULTIPLY', r, 67.0), cx.inputs['Y']); L.new(_math(nt, 'MULTIPLY', r, 23.0), cx.inputs['Z'])
    ob = tc.outputs['Object']
    n1 = _noise(nt, _mapping(nt, ob, (7.0, 7.0, 2.2), cx.outputs['Vector']), 1.0, 4.0, .6)                           # «ворс по направлению»: вытянутые вдоль z пятна светлее/темнее
    n2 = _noise(nt, _mapping(nt, ob, (2.4, 2.4, 1.1), cx.outputs['Vector']), 1.0, 3.0, .5)
    crush = _ramp(nt, _math(nt, 'ADD', _math(nt, 'MULTIPLY', n1, .6), _math(nt, 'MULTIPLY', n2, .4)), [(.28, (.62, .62, .62, 1)), (.72, (1.50, 1.50, 1.50, 1))])
    ind = _ramp(nt, r, [(0.0, (.93, .93, .93, 1)), (1.0, (1.08, 1.08, 1.08, 1))])
    nap = _noise(nt, _mapping(nt, ob, (260.0, 260.0, 260.0), cx.outputs['Vector']), 1.0, 2.0, .6)                       # мелкий ворс
    grain = _ramp(nt, nap, [(.30, (.78, .78, .78, 1)), (.70, (1.22, 1.22, 1.22, 1))])
    c1 = _mix(nt, _mix(nt, _mix(nt, hsv.outputs['Color'], crush, 1.0, 'MULTIPLY'), ind, 1.0, 'MULTIPLY'), grain, 1.0, 'MULTIPLY')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .5
    rim = _math(nt, 'MULTIPLY', _math(nt, 'POWER', _math(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'], True), 2.6), .50)
    L.new(_mix(nt, c1, (.06, .10, .26), rim), b.inputs['Base Color'])
    rg = _img(nt, slug, 'rough.jpg', 'Non-Color'); L.new(uvm, rg.inputs['Vector']); L.new(_math(nt, 'MULTIPLY', rg.outputs['Color'], 1.3, True), b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 1.6
    nr = _img(nt, slug, 'normal.jpg', 'Non-Color'); L.new(uvm, nr.inputs['Vector']); L.new(nr.outputs['Color'], nm.inputs['Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .30; bp.inputs['Distance'].default_value = .0008; L.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', n1, .4), _math(nt, 'MULTIPLY', nap, .6)), bp.inputs['Height']); L.new(nm.outputs['Normal'], bp.inputs['Normal'])
    L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _val(b, .06, 'Specular IOR Level', 'Specular'); _val(b, 1.0, 'Sheen Weight', 'Sheen'); _val(b, .42, 'Sheen Roughness')
    if 'Sheen Tint' in b.inputs: b.inputs['Sheen Tint'].default_value = (.30, .45, .85, 1)
    return m


def mat_boucle(name=PFX + 'boucle_cream', target=(0xd9, 0xcd, 0xb8), slug='boucle-cream-teddy', tile=.13):
    """кремовое букле: библиотечная `boucle-cream-teddy` (петли-кудри), цвет подтянут к #d9cdb8 умножением на target/среднее, AO в глубине петель, нормали + бамп по disp,
    дрейф тона по объекту, мягкий пушистый блик по краю, sheen"""
    m = bpy.data.materials.get(name)
    if m is not None: return m
    m, nt, b = _base_mat(name); L = nt.links
    mean = _tex_mean_lin(slug); tl = _hex_lin(target); ratio = tuple(t / x for t, x in zip(tl, mean))
    tc = nt.nodes.new('ShaderNodeTexCoord'); uvm = _mapping(nt, tc.outputs['UV'], (1 / tile, 1 / tile, 1 / tile))
    col = _img(nt, slug, 'color.jpg', 'sRGB'); L.new(uvm, col.inputs['Vector'])
    ao = _img(nt, slug, 'ao.jpg', 'Non-Color'); L.new(uvm, ao.inputs['Vector'])
    c1 = _mix(nt, col.outputs['Color'], ratio, 1.0, 'MULTIPLY')
    c2 = _mix(nt, c1, ao.outputs['Color'], .75, 'MULTIPLY')
    oi = nt.nodes.new('ShaderNodeObjectInfo'); r = oi.outputs['Random']
    cx = nt.nodes.new('ShaderNodeCombineXYZ'); L.new(_math(nt, 'MULTIPLY', r, 37.0), cx.inputs['X']); L.new(_math(nt, 'MULTIPLY', r, 59.0), cx.inputs['Y']); L.new(_math(nt, 'MULTIPLY', r, 17.0), cx.inputs['Z'])
    drift = _noise(nt, _mapping(nt, tc.outputs['Object'], (3.2, 3.2, 3.2), cx.outputs['Vector']), 1.0, 3.0, .5)
    tone = _ramp(nt, drift, [(.25, (.93, .93, .925, 1)), (.75, (1.04, 1.04, 1.03, 1))])
    ind = _ramp(nt, r, [(0.0, (.96, .96, .96, 1)), (1.0, (1.03, 1.03, 1.02, 1))])
    c3 = _mix(nt, _mix(nt, c2, tone, 1.0, 'MULTIPLY'), ind, 1.0, 'MULTIPLY')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .4
    fz = _math(nt, 'MULTIPLY', _math(nt, 'POWER', _math(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'], True), 2.0), .22)
    L.new(_mix(nt, c3, (.95, .90, .80), fz), b.inputs['Base Color'])
    rg = _img(nt, slug, 'rough.jpg', 'Non-Color'); L.new(uvm, rg.inputs['Vector']); L.new(_math(nt, 'MULTIPLY', rg.outputs['Color'], 1.3, True), b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 1.5
    nr = _img(nt, slug, 'normal.jpg', 'Non-Color'); L.new(uvm, nr.inputs['Vector']); L.new(nr.outputs['Color'], nm.inputs['Color'])
    dp = _img(nt, slug, 'disp.jpg', 'Non-Color'); L.new(uvm, dp.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .5; bp.inputs['Distance'].default_value = .003; L.new(dp.outputs['Color'], bp.inputs['Height']); L.new(nm.outputs['Normal'], bp.inputs['Normal'])
    L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _val(b, .20, 'Specular IOR Level', 'Specular'); _val(b, .6, 'Sheen Weight', 'Sheen'); _val(b, .5, 'Sheen Roughness')
    if 'Sheen Tint' in b.inputs: b.inputs['Sheen Tint'].default_value = (1.0, .93, .82, 1)
    return m


def mat_brass(name=PFX + 'brass_champagne', target=(0xd6, 0xc0, 0x96), slug='gold-matte-champagne', tile=.20):
    """матовое золото «шампань»: металл, цвет из библиотечной `gold-matte-champagne`, подтянутый к #c9a96a; шероховатость .30, едва заметный бамп (матовая фактура)"""
    m = bpy.data.materials.get(name)
    if m is not None: return m
    m, nt, b = _base_mat(name); L = nt.links
    mean = _tex_mean_lin(slug); ratio = tuple(t / x for t, x in zip(_hex_lin(target), mean))
    tc = nt.nodes.new('ShaderNodeTexCoord'); uvm = _mapping(nt, tc.outputs['UV'], (1 / tile, 1 / tile, 1 / tile))
    col = _img(nt, slug, 'color.jpg', 'sRGB'); L.new(uvm, col.inputs['Vector'])
    L.new(_mix(nt, col.outputs['Color'], ratio, 1.0, 'MULTIPLY'), b.inputs['Base Color'])
    mt = _img(nt, slug, 'metal.jpg', 'Non-Color'); L.new(uvm, mt.inputs['Vector']); L.new(mt.outputs['Color'], b.inputs['Metallic'])
    rg = _img(nt, slug, 'rough.jpg', 'Non-Color'); L.new(uvm, rg.inputs['Vector'])
    L.new(_math(nt, 'ADD', .34, _math(nt, 'MULTIPLY', rg.outputs['Color'], .35)), b.inputs['Roughness'])
    dp = _img(nt, slug, 'disp.jpg', 'Non-Color'); L.new(uvm, dp.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .08; bp.inputs['Distance'].default_value = .0005; L.new(dp.outputs['Color'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def chair_materials():
    return {'navy': mat_velvet(), 'cream': mat_boucle(), 'brass': mat_brass()}


# ---------------------------------------------------------------------------------------------------------------------------- кресло
def _meshes(kind, variant, uniq, rv, M):
    """меши частей. variant=N: форма строится один раз (`aud_chair_v<N>_…`), для каждого цвета — своя копия с материалом ткани (`aud_chair_<kind>_v<N>_…`), ножки общие на все кресла;
    variant=None: собственные меши кресла (uniq — его имя)"""
    out = {}
    fns = (('back', _back_mesh), ('seat', _seat_mesh), ('base', _base_mesh), ('legs', _legs_mesh))
    for part, fn in fns:
        if variant is None:
            me = fn('%s%s_%s' % (PFX, uniq, part), rv)
        elif part == 'legs':
            me = bpy.data.meshes.get('%sv%d_legs' % (PFX, variant)) or fn('%sv%d_legs' % (PFX, variant), rv)
        else:
            kn = '%s%s_v%d_%s' % (PFX, kind, variant, part); me = bpy.data.meshes.get(kn)
            if me is None:
                shape = bpy.data.meshes.get('%sv%d_%s' % (PFX, variant, part)) or fn('%sv%d_%s' % (PFX, variant, part), rv)
                me = shape.copy(); me.name = kn
            me.materials.clear(); me.materials.append(M[kind])
        if part == 'legs' and not me.materials: me.materials.append(M['brass'])
        if part != 'legs' and variant is None: me.materials.clear(); me.materials.append(M[kind])
        out[part] = me
    return out


def make_chair(kind, name, variant=None, seed=None, collection=None):
    """кресло kind ('navy' | 'cream') → корневой Empty `name` (в начале координат, на полу между ножками, лицом к +Y). variant — номер общей формы (linked duplicates), None — своя."""
    if kind not in KINDS: raise ValueError("kind должен быть 'navy' или 'cream'")
    col = collection or _collection(); M = chair_materials()
    rnd = random.Random(seed if seed is not None else zlib.crc32(name.encode('utf-8')))
    rv = random.Random(1000 + 77 * variant if variant is not None else rnd.randrange(1 << 30))
    me = _meshes(kind, variant, name, rv, M)
    root = bpy.data.objects.new('%s%s_%s' % (PFX, kind, name) if not name.startswith(PFX) else name, None); root.empty_display_type = 'PLAIN_AXES'; root.empty_display_size = .25
    col.objects.link(root); root['aud_kind'] = kind
    root.rotation_euler = (math.radians(rnd.uniform(-.5, .5)), math.radians(rnd.uniform(-.5, .5)), math.radians(rnd.uniform(-2.0, 2.0)))
    fab = M[kind]; parts = {}
    def part(role, mesh, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        ob = bpy.data.objects.new('%s_%s' % (root.name, role), mesh); ob.parent = root; ob.location = loc; ob.rotation_euler = rot; ob.scale = scale
        col.objects.link(ob); parts[role] = ob; return ob
    d2r = math.radians
    part('back', me['back'], fab, (rnd.uniform(-.002, .002), BACK_Y + rnd.uniform(-.002, .002), BACK_Z0), (d2r(rnd.uniform(-.7, .7)), d2r(rnd.uniform(-.5, .5)), d2r(rnd.uniform(-.6, .6))))
    part('seat', me['seat'], fab, (rnd.uniform(-.003, .003), (SEAT_Y0 + SEAT_Y1) / 2 + rnd.uniform(-.003, .003), SEAT_Z0), (d2r(rnd.uniform(-.5, .5)), d2r(rnd.uniform(-.5, .5)), d2r(rnd.uniform(-.8, .8))),
         (1.0, 1.0, rnd.uniform(.97, 1.045)))                                                                                                  # высота подушки у каждого кресла чуть своя
    part('base', me['base'], fab, (0, .02, BASE_Z0))
    part('legs', me['legs'], M['brass'])
    return root


def chair_objects(root):
    """корень + все его части"""
    return [root] + list(root.children_recursive)


def chair_stats(root):
    polys = verts = 0; n = 0
    for ob in root.children_recursive:
        if ob.type == 'MESH': polys += len(ob.data.polygons); verts += len(ob.data.vertices); n += 1
    return {'polys': polys, 'verts': verts, 'parts': n}


# ---------------------------------------------------------------------------------------------------------------------------- расстановка
def place_rows(rows_y=None, x_ranges=None, step_x=0.66, seed=7):
    """блоки кресел: ряды по y, в каждом блоке (x0, x1) — int((x1−x0)/step_x) кресел с шагом step_x, ряд по центру блока.
    Цвет — «шахматка» navy/cream с нарушениями (в первых рядах ≈ 60 % navy, дальше ближе к 50/50); у каждого кресла смещение ±1.5 см и поворот ±2° (внутри make_chair),
    форма — один из N_VARIANTS общих вариантов (instance-ы). Возвращает список корневых объектов-кресел (части — root.children)."""
    rows_y = list(rows_y) if rows_y is not None else [1.5, 2.6, 3.7, 4.8, 5.9, 7.0, 8.2]
    x_ranges = list(x_ranges) if x_ranges is not None else [(-8.2, -1.4), (1.4, 8.2)]
    rng = random.Random(seed); col = _collection(); out = []; k = 0
    for r, y in enumerate(rows_y):
        up, down = (.30, .07) if r < 3 else (.16, .10)                                                           # вероятности «нарушить шахматку»: cream → navy, navy → cream
        for bi, (x0, x1) in enumerate(x_ranges):
            n = int((x1 - x0) / step_x + 1e-6); start = x0 + ((x1 - x0) - (n - 1) * step_x) / 2.0
            for i in range(n):
                navy = ((i + r + bi) % 2 == 0)
                if navy and rng.random() < down: navy = False
                elif not navy and rng.random() < up: navy = True
                kind = 'navy' if navy else 'cream'; k += 1
                ob = make_chair(kind, '%03d' % k, variant=rng.randrange(N_VARIANTS), seed=rng.randrange(1 << 30), collection=col)
                ob.location = (start + i * step_x + rng.uniform(-.015, .015), y + rng.uniform(-.015, .015), 0.0)
                out.append(ob)
    return out


# ---------------------------------------------------------------------------------------------------------------------------- превью
def _floor(mat_slug='marble-white-warm', tile=1.2, size=60.0):
    me = bpy.data.meshes.new('aud_chair_floor'); h = size / 2
    me.from_pydata([(-h, -h + 14, 0), (h, -h + 14, 0), (h, h + 14, 0), (-h, h + 14, 0)], [], [(0, 1, 2, 3)]); me.update()
    uv = me.uv_layers.new(name='UVMap')
    for lp in me.loops:
        c = me.vertices[lp.vertex_index].co; uv.data[lp.index].uv = (c.x / tile, c.y / tile)
    m, nt, b = _base_mat('aud_chair_floor_marble'); L = nt.links
    col = _img(nt, mat_slug, 'color.jpg', 'sRGB'); rg = _img(nt, mat_slug, 'rough.jpg', 'Non-Color'); nr = _img(nt, mat_slug, 'normal.jpg', 'Non-Color')
    L.new(col.outputs['Color'], b.inputs['Base Color']); L.new(_math(nt, 'MULTIPLY', rg.outputs['Color'], .7, True), b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'UVMap'; L.new(nr.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    _val(b, .5, 'Specular IOR Level', 'Specular')
    me.materials.append(m); ob = bpy.data.objects.new('aud_chair_floor', me); bpy.context.scene.collection.objects.link(ob)
    return ob


def _backdrop():
    m, nt, b = _base_mat('aud_chair_backdrop'); b.inputs['Base Color'].default_value = (.90, .83, .72, 1); b.inputs['Roughness'].default_value = .85
    me = bpy.data.meshes.new('aud_chair_backdrop'); me.from_pydata([(-30, 15, -1), (30, 15, -1), (30, 15, 10), (-30, 15, 10)], [], [(0, 1, 2, 3)]); me.update(); me.materials.append(m)
    ob = bpy.data.objects.new('aud_chair_backdrop', me); bpy.context.scene.collection.objects.link(ob); return ob


def _area(name, loc, target, size, size_y, energy, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.size_y = size_y; ld.color = color
    ob = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return ob


def _camera(loc, target, lens, name='aud_chair_cam'):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36; cd.clip_end = 200
    ob = bpy.data.objects.new(name, cd); bpy.context.scene.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); bpy.context.scene.camera = ob; return ob


def _render_settings(sc, w, h, spp):
    try:
        import addon_utils; addon_utils.enable('cycles')
    except Exception: pass
    sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.device = 'CPU'; cy.samples = spp; cy.use_adaptive_sampling = True; cy.adaptive_threshold = .02
    cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'; cy.max_bounces = 7; cy.diffuse_bounces = 4; cy.glossy_bounces = 4; cy.transmission_bounces = 2
    cy.caustics_reflective = False; cy.caustics_refractive = False; cy.sample_clamp_indirect = 6; cy.sample_clamp_direct = 0
    sc.render.threads_mode = 'FIXED'; sc.render.threads = 2
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'; sc.render.image_settings.color_depth = '8'
    sc.view_settings.view_transform = 'AgX'
    for look in ('AgX - Punchy', 'Punchy'):
        try: sc.view_settings.look = look; break
        except TypeError: pass
    sc.view_settings.exposure = float(os.environ.get('AUD_EXPO', 0.0))


def preview():
    t_all = time.time(); w = int(os.environ.get('AUD_W', 960)); h = round(w * 9 / 16); spp = min(int(os.environ.get('AUD_SPP', 64)), 64); nrows = int(os.environ.get('AUD_ROWS', 2))
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; _render_settings(sc, w, h, spp)
    wd = bpy.data.worlds.new('aud_chair_world'); wd.use_nodes = True; bg = wd.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (1.0, .82, .62, 1); bg.inputs['Strength'].default_value = .55; sc.world = wd
    _floor(); _backdrop()
    key = _area('aud_chair_key', (-3.4, .4, 3.7), (.3, 3.4, .35), 3.4, 3.0, 560.0, (1.0, .78, .55))             # единственный тёплый ключ (≈ 3500 K) — над рядами, чуть впереди
    t0 = time.time(); chairs = place_rows(rows_y=[1.5, 2.6, 3.7][:nrows]); print('расстановка: %d кресел за %.1f с' % (len(chairs), time.time() - t0), flush=True)
    st = chair_stats(chairs[0]); print('полигонов у кресла:', st, flush=True)
    _camera((0, -1.5, 1.25), (0, 5.0, .12), 20.0)
    sc.render.filepath = '/tmp/aud_chairs.png'; t0 = time.time(); bpy.ops.render.render(write_still=True); print('кадр 1: %.1f с -> %s' % (time.time() - t0, sc.render.filepath), flush=True)
    # крупный план: по одному креслу каждого цвета, вид «три четверти» спереди
    cx, cy_ = 0.0, -7.0
    a = make_chair('navy', 'closeup_navy', variant=0, seed=11); a.location = (cx - .36, cy_, 0); a.rotation_euler = (0, 0, math.radians(-14))
    c = make_chair('cream', 'closeup_cream', variant=1, seed=12); c.location = (cx + .36, cy_ + .05, 0); c.rotation_euler = (0, 0, math.radians(11))
    key.location = (-1.6, cy_ + 2.4, 2.9); key.rotation_euler = (Vector((cx, cy_, .4)) - key.location).to_track_quat('-Z', 'Y').to_euler(); key.data.energy = 330.0; key.data.size = 2.4; key.data.size_y = 1.6
    _camera((1.15, cy_ + 2.05, 1.12), (cx, cy_ - .02, .46), 42.0, 'aud_chair_cam2')
    sc.render.filepath = '/tmp/aud_chair_closeup.png'; t0 = time.time(); bpy.ops.render.render(write_still=True); print('кадр 2: %.1f с -> %s' % (time.time() - t0, sc.render.filepath), flush=True)
    print('всего: %.1f с' % (time.time() - t_all), flush=True)


def main():
    if 'preview' in [a for a in sys.argv[1:] if not a.startswith('-')]: preview()
    else: print(__doc__)


if __name__ == '__main__':
    main()
