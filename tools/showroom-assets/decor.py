#!/usr/bin/env python3
"""Декор фона каталога — настоящие объёмные 3D-модели (Blender/Cycles), а не плоские силуэты:
  • стеллаж из ореха: толстые боковины, полки со скошенной кромкой, глубокая тёмная задняя стенка, тёплая LED-подсветка под полками, десятки книг (разная высота, ширина, цвет, золотые полоски на корешках, наклонные стопки, горизонтальные стопки), вазы, чаша, горшок с растением, латунный глобус;
  • торшер: тяжёлое латунное основание, тонкая стойка, тканевый абажур-барабан со светящейся лампой внутри;
  • подвесные светильники: молочные стеклянные шары с латунным патроном и стержнем, купол из синей эмали с золотой «изнанкой»;
  • диван: синий бархат, мягкие скруглённые подушки, декоративные подушки, латунные ножки;
  • предметы на стеклянных полках ниши: керамика (глазурь, матовая глина), чаши, книги, латунные шары, растение.
Все предметы строятся напрямую из вершин (без bpy.ops) — сборка занимает секунды даже в сцене с 10 тысячами листьев.
Группы объектов (['grp']): 'shell' — виден во всех проходах слоёв, 'niche' — в слое ниши (см. scene.py → render_layers).
Использование: scene.py → import decor; decor.build(M). Размеры — метры, камера стоит в (0, -12, 0.9) и смотрит вдоль +Y."""
import bpy, math, random, os, sys
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import materials as MT                                    # общая библиотека материалов стиля: микроцемент, сатинированное стекло, латунь шампань, букле, известняк, травертин


# ---------------- цвет ----------------
def srgb(r, g, b):
    f = lambda c: ((c / 255 + .055) / 1.055) ** 2.4 if c / 255 > .04045 else c / 255 / 12.92
    return (f(r), f(g), f(b), 1)
def hexc(h):
    h = h.lstrip('#'); return srgb(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# ---------------- материалы ----------------
_MAT = {}
def _new(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; return m, nt, nt.nodes['Principled BSDF']
def _s(b, v, *names):
    for n in names:
        if n in b.inputs: b.inputs[n].default_value = v; return
def _noise_bump(nt, b, scale, strength, dist=.004, stretch=(1, 1, 1)):
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = stretch
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 6
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = strength; bp.inputs['Distance'].default_value = dist
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return nz
def paint(name, col, rough=.5, metal=0.0, coat=0.0, coat_rough=.05, spec=.5, sheen=0.0, emit=None, emit_k=0.0, bump=0.0, bump_scale=60):
    """универсальная краска: глазурь (coat), металл, ткань (sheen), свечение (emit)"""
    if name in _MAT: return _MAT[name]
    m, nt, b = _new(name); _s(b, col if len(col) == 4 else (*col, 1), 'Base Color'); _s(b, rough, 'Roughness'); _s(b, metal, 'Metallic'); _s(b, spec, 'Specular IOR Level', 'Specular')
    if coat: _s(b, coat, 'Coat Weight', 'Clearcoat'); _s(b, coat_rough, 'Coat Roughness', 'Clearcoat Roughness')
    if sheen: _s(b, sheen, 'Sheen Weight', 'Sheen'); _s(b, .5, 'Sheen Roughness')
    if emit is not None: _s(b, (*emit, 1), 'Emission Color', 'Emission'); _s(b, emit_k, 'Emission Strength')
    if bump: _noise_bump(nt, b, bump_scale, bump)
    _MAT[name] = m; return m
def led(name='dled', k=3.0, col=(1.0, .80, .52)):
    if name in _MAT: return _MAT[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']; nt.nodes.remove(b)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*col, 1); em.inputs['Strength'].default_value = k; nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs[0]); _MAT[name] = m; return m
def wood(name, dark, light, rough=.42, along='x', grain=30):
    """дерево: длинные прожилки вдоль оси along, мягкий лак"""
    if name in _MAT: return _MAT[name]
    m, nt, b = _new(name); L = nt.links
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = {'x': (.35, grain, grain), 'y': (grain, .35, grain), 'z': (grain, grain, .35)}[along]
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.4; nz.inputs['Detail'].default_value = 7; nz.inputs['Roughness'].default_value = .62; nz.inputs['Distortion'].default_value = .6
    L.new(tc.outputs['Object'], mp.inputs['Vector']); L.new(mp.outputs['Vector'], nz.inputs['Vector'])
    r = nt.nodes.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position = .3; r.color_ramp.elements[0].color = dark; r.color_ramp.elements[1].position = .75; r.color_ramp.elements[1].color = light
    L.new(nz.outputs['Fac'], r.inputs['Fac']); L.new(r.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .25; bp.inputs['Distance'].default_value = .002; L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _s(b, rough, 'Roughness'); _s(b, .45, 'Coat Weight', 'Clearcoat'); _s(b, .25, 'Coat Roughness', 'Clearcoat Roughness'); _MAT[name] = m; return m
def velvet(name, col):
    return paint(name, col, rough=.92, sheen=.35, spec=.12, bump=.3, bump_scale=140)
def brass(name='brass', col=None, rough=None):
    """единственный металл сцены — приглушённая шлифованная латунь шампань (цвет и шероховатость задаёт библиотека материалов, параметры оставлены для совместимости вызовов)"""
    if name not in _MAT: _MAT[name] = MT.brass_champagne(name)
    return _MAT[name]
def glaze(name, col, rough=.1):
    """сатиновая керамика (без глянцевого лака): rough ниже .3 подтягивается к .3"""
    return paint(name, col, rough=max(.3, rough), spec=.35)
def glass(name='glass', tint=(.93, .95, .94), rough=.4):
    """сатинированное стекло (купола, вазы): полупрозрачное, мягко рассеивает свет"""
    if name not in _MAT: _MAT[name] = MT.satin_glass(name, tint, rough)
    return _MAT[name]
def clay(name, col):
    return paint(name, col, rough=.78, spec=.2, bump=.45, bump_scale=90)


# ---------------- геометрия (без bpy.ops) ----------------
def _link(ob, grp):
    bpy.context.collection.objects.link(ob); ob['grp'] = grp; return ob
def mesh(name, verts, faces, mat, grp, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update(); me.materials.append(mat)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return _link(bpy.data.objects.new(name, me), grp)
def box(name, mat, x0, x1, y0, y1, z0, z1, grp, bev=0.0, seg=3, tilt=None, pivot=None):
    """параллелепипед из вершин; bev — скос кромки (BEVEL + WEIGHTED_NORMAL: плоские грани остаются плоскими, кромки ловят блик); tilt=(осьY, угол) с опорой pivot=(x,z) — наклонная книга"""
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = mesh(name, v, f, mat, grp, smooth=bool(bev))
    if bev:
        bm = ob.modifiers.new('bev', 'BEVEL'); bm.width = bev; bm.segments = seg; bm.limit_method = 'ANGLE'
        wn = ob.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = True
    if tilt:
        px, pz = pivot; ob.location = (px, 0, pz); ob.data.transform(Matrix.Translation((-px, 0, -pz))); ob.rotation_euler = (0, tilt, 0)
    return ob
def lathe(name, prof, mat, grp, cx=0.0, cy=0.0, z=0.0, seg=64, sx=1.0, sy=1.0, sz=1.0, smooth=True, caps=True, xf=None):
    """тело вращения вокруг вертикальной оси; prof — список (радиус, высота) снизу вверх; ненулевые крайние радиусы закрываются донышком/крышкой"""
    n = len(prof); v = []; f = []
    for (r, h) in prof:
        for k in range(seg):
            a = 2 * math.pi * k / seg; v.append((cx + sx * r * math.cos(a), cy + sy * r * math.sin(a), z + sz * h))
    for i in range(n - 1):
        for k in range(seg):
            a_ = i * seg + k; b_ = i * seg + (k + 1) % seg; f.append((a_, b_, b_ + seg, a_ + seg))
    if caps and prof[0][0] > 1e-6: f.append(tuple(reversed(range(seg))))
    if caps and prof[-1][0] > 1e-6: f.append(tuple(range((n - 1) * seg, n * seg)))
    ob = mesh(name, v, f, mat, grp, smooth=smooth)
    if xf is not None: ob.data.transform(xf)
    return ob
def sphere_prof(R, n=26):
    p = [(R * math.sin(math.pi * i / n), -R * math.cos(math.pi * i / n)) for i in range(n + 1)]; p[0] = (0.0, -R); p[-1] = (0.0, R); return p
def ball(name, mat, cx, cy, cz, R, grp, sx=1.0, sy=1.0, sz=1.0, seg=48, n=24):
    return lathe(name, [(r, h + R) for (r, h) in sphere_prof(R, n)], mat, grp, cx, cy, cz - R * sz, seg, sx, sy, sz)
def tube(name, pts, rad, mat, grp, res=4, order=4):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('NURBS'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], p[2], 1)
    sp.order_u = min(order, len(pts)); sp.use_endpoint_u = True; cu.bevel_depth = rad; cu.bevel_resolution = res; cu.use_fill_caps = True; cu.materials.append(mat)
    return _link(bpy.data.objects.new(name, cu), grp)
def leaves(name, items, mat, grp):
    """много листьев — одним мешем: items — (позиция, направление, длина, ширина); лист — выпуклая «ладья» из 9 пар вершин"""
    v = []; f = []; up = Vector((0, 0, 1))
    for (pos, d, Ln, Wd) in items:
        d = Vector(d).normalized(); u = d.cross(up)
        if u.length < .2: u = d.cross(Vector((1, 0, 0)))
        u.normalize(); w = d.cross(u); base = len(v)
        for i in range(9):
            t = i / 8; ww = Wd * math.sin(math.pi * t ** .85) * (1 - .12 * t); c = Vector(pos) + d * (Ln * t) + w * (.10 * Ln * math.sin(math.pi * t) - .06 * Ln * t * t)
            v += [tuple(c - u * ww), tuple(c + u * ww)]
        for i in range(8): f.append((base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2))
    ob = mesh(name, v, f, mat, grp, smooth=True); return ob


# ---------------- профили ваз (радиус, высота) ----------------
VASES = {
    'bottle':  [(0, 0), (.30, 0), (.34, .06), (.35, .28), (.28, .52), (.10, .70), (.085, .86), (.12, 1.0), (.0, 1.0)],
    'gourd':   [(0, 0), (.24, 0), (.40, .12), (.46, .32), (.36, .55), (.14, .72), (.10, .88), (.14, 1.0), (.0, 1.0)],
    'cyl':     [(0, 0), (.30, 0), (.32, .05), (.32, .92), (.30, 1.0), (.0, 1.0)],
    'amphora': [(0, 0), (.20, 0), (.26, .05), (.44, .40), (.42, .58), (.22, .78), (.17, .90), (.25, 1.0), (.0, 1.0)],
    'orb':     [(0, 0), (.18, 0), (.36, .08), (.5, .32), (.5, .55), (.34, .80), (.12, .92), (.14, 1.0), (.0, 1.0)],
    'cone':    [(0, 0), (.42, 0), (.44, .04), (.20, .90), (.22, 1.0), (.0, 1.0)],
    'bowl':    [(0, 0), (.30, 0), (.50, .20), (.92, .70), (1.0, 1.0), (.94, 1.0), (.84, .70), (.0, .12)],
}
def vase(name, kind, mat, x, y, z, H, grp, W=None, seg=56):
    """ваза: H — высота (м); W — ширина (по умолчанию пропорционально); профиль нормирован на высоту 1"""
    mr = max(r for r, h in VASES[kind]); sw = (W / 2 / mr) if W else H * .62
    return lathe(name, VASES[kind], mat, grp, x, y, z, seg, sx=sw, sy=sw, sz=H)


# ---------------- косметологические предметы (минимализм: белое, молочное, синее, камень) ----------------
def books_flat(cx, y, z, mats, rnd, n=3, w=.30, d=.22, grp='shell'):
    """горизонтальная стопка книг по дизайну/уходу (нейтральные корешки), каждая чуть сдвинута; возвращает верхнюю отметку"""
    for i in range(n):
        th = rnd.uniform(.026, .04); ww = w * rnd.uniform(.84, 1.0); dx = rnd.uniform(-.012, .012)
        box('flat', rnd.choice(mats), cx - ww / 2 + dx, cx + ww / 2 + dx, y - d / 2, y + d / 2, z, z + th, grp, .002, 2); z += th
    return z
PK = 1.3                                                                                          # упаковки крупнее настоящих: с пяти метров должны читаться формы
def pump_bottle(x, y, z, H, body, cap, grp='shell', r=None):
    """флакон с помпой: плечи, золотой/чёрный воротник, стойка и головка с носиком влево"""
    H *= PK; r = r or H * .17
    lathe('pump_b', [(0, 0), (r * .9, 0), (r, .02 * H), (r, .60 * H), (r * .97, .64 * H), (r * .55, .70 * H), (r * .46, .74 * H), (0, .74 * H)], body, grp, x, y, z, 48)
    lathe('pump_c', [(0, .74 * H), (r * .50, .74 * H), (r * .50, .80 * H), (r * .40, .81 * H), (0, .81 * H)], brass('champ_collar'), grp, x, y, z, 32)
    lathe('pump_s', [(0, .81 * H), (r * .16, .81 * H), (r * .16, .90 * H), (0, .90 * H)], cap, grp, x, y, z, 16)
    box('pump_h', cap, x - r * .95, x + r * .25, y - r * .17, y + r * .17, z + .90 * H, z + .97 * H, grp, .004, 3)
def dropper(x, y, z, H, glass, collar, rubber, grp='shell'):
    """сыворотка с пипеткой: стеклянный флакон, воротник, каучуковая груша"""
    H *= PK; r = H * .2
    lathe('drp_b', [(0, 0), (r * .9, 0), (r, .03 * H), (r, .52 * H), (r * .9, .60 * H), (r * .42, .64 * H), (r * .40, .68 * H), (0, .68 * H)], glass, grp, x, y, z, 40)
    lathe('drp_c', [(0, .66 * H), (r * .46, .66 * H), (r * .46, .74 * H), (r * .40, .75 * H), (0, .75 * H)], collar, grp, x, y, z, 32)
    lathe('drp_r', [(0, .74 * H), (r * .34, .74 * H), (r * .40, .80 * H), (r * .40, .92 * H), (r * .28, .99 * H), (0, H)], rubber, grp, x, y, z, 32)
def cream_jar(x, y, z, D, Hh, body, lid, grp='shell'):
    D *= PK; Hh *= PK; R = D / 2
    lathe('jar_b', [(0, 0), (R * .94, 0), (R, .04 * Hh), (R, .62 * Hh), (R * .97, .66 * Hh), (0, .66 * Hh)], body, grp, x, y, z, 48)
    lathe('jar_l', [(0, .64 * Hh), (R * 1.01, .64 * Hh), (R * 1.01, Hh * .98), (R * .97, Hh), (0, Hh)], lid, grp, x, y, z, 48)
def squeeze_tube(x, y, z, H, body, cap, grp='shell'):
    H *= PK; r = H * .13
    lathe('tub_c', [(0, 0), (r * .8, 0), (r * .8, .14 * H), (0, .14 * H)], cap, grp, x, y, z, 32)
    lathe('tub_b', [(0, .14 * H), (r, .14 * H), (r * 1.05, .2 * H), (r * 1.05, .88 * H), (r * .9, .93 * H), (0, .93 * H)], body, grp, x, y, z, 40, sy=.5)
    box('tub_t', body, x - r, x + r, y - r * .1, y + r * .1, z + .93 * H, z + H, grp, .003, 2)
def towel(x, y, z, L, r, mat, band, grp='shell'):
    """свёрнутое спа-полотенце, лежит на боку вдоль x; band — тонкая лента"""
    xf = Matrix.Translation((x - L / 2, y, z + r)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    lathe('towel', [(0, 0), (r * .97, 0), (r, .012), (r, L - .012), (r * .97, L), (0, L)], mat, grp, 0, 0, 0, 40, xf=xf)
    lathe('towel_band', [(r * .99, L * .44), (r * 1.05, L * .44), (r * 1.05, L * .56), (r * .99, L * .56)], band, grp, 0, 0, 0, 40, caps=False, xf=xf)
def candle(x, y, z, R, H, cup, wax, grp='shell'):
    lathe('cnd_cup', [(0, 0), (R * .92, 0), (R, .04 * H), (R, H), (R * .93, H), (0, H)], cup, grp, x, y, z, 40)
    lathe('cnd_wax', [(0, H), (R * .86, H), (R * .86, H * 1.01), (0, H * 1.01)], wax, grp, x, y, z, 40)
    ball('cnd_flame', led('flame', 16.0, (1.0, .82, .55)), x, y, z + H + R * .55, R * .12, grp, sz=2.4, seg=16, n=10)
def cairn(x, y, z, mat, rnd, grp='shell', n=4, R0=.05):
    """стопка гладких камней (дзен): каждый следующий меньше и чуть смещён"""
    zz = z; R = R0
    for i in range(n):
        ball('stone', mat, x + rnd.uniform(-.008, .008), y, zz + R * .5, R, grp, sx=1.0, sy=.9, sz=.5, seg=32, n=16); zz += R * .92; R *= .76
def orchid(x, y, z, H, pot, leafm, petal, stem, rnd, grp='shell'):
    """белая орхидея в керамическом горшке: широкие листья, дугой изогнутый цветонос, цветы-«бабочки» лицом к зрителю"""
    pr = H * .13; ph = H * .26
    lathe('orc_pot', [(0, 0), (.9, 0), (1, .1), (1.04, .95), (.96, 1.0), (0, .96)], pot, grp, x, y, z, 40, sx=pr, sy=pr, sz=ph)
    items = []; zb = z + ph
    for k, a in enumerate((-.9, -.35, .3, .85)):
        items.append(((x, y, zb), (math.sin(a) * 1.0, .12, .55), H * rnd.uniform(.40, .52), H * .085))
    leaves('orc_lv', items, leafm, grp)
    pts = [(x, y, zb), (x + .004, y - .01, zb + H * .42), (x + H * .06, y - .01, zb + H * .74), (x + H * .22, y - .01, zb + H * .84)]
    tube('orc_st', pts, .0026, stem, grp, 2, 4)
    verts = []; faces = []; sizes = (.11, .10, .09, .075, .06)
    for t, sz_ in zip((.52, .64, .76, .88, .98), sizes):
        f = t * 3; i = min(int(f), 2); u = f - i; q = [pts[i][c] + (pts[i + 1][c] - pts[i][c]) * u for c in range(3)]; size = H * sz_ * 1.5
        for kk in range(5):
            phi = math.pi / 2 + 2 * math.pi * kk / 5; d = (math.cos(phi), 0, math.sin(phi)); pp = (-math.sin(phi), 0, math.cos(phi)); base = len(verts)
            c = (q[0] + d[0] * size * .5, q[1], q[2] + d[2] * size * .5)
            for st in range(12):
                tt = 2 * math.pi * st / 12; ca, sa = math.cos(tt), math.sin(tt)
                verts.append((c[0] + d[0] * size * .5 * ca + pp[0] * size * .36 * sa, c[1] - size * .12 * (1 - ca), c[2] + d[2] * size * .5 * ca + pp[2] * size * .36 * sa))
            faces.append(tuple(range(base, base + 12)))
    mesh('orc_fl', verts, faces, petal, grp, smooth=True)
def grass(x, y, z, H, mat, rnd, grp='shell', n=9, spread=.12):
    """сухие злаки: тонкие длинные листья веером"""
    items = []
    for i in range(n):
        a = rnd.uniform(-1, 1); items.append(((x + rnd.uniform(-.01, .01), y + rnd.uniform(-.01, .01), z), (a * spread / .12 * .55, rnd.uniform(-.15, .15), 1.0), H * rnd.uniform(.8, 1.15), .006))
    leaves('grass', items, mat, grp)
def diffuser(x, y, z, H, bottle, reed, grp='shell'):
    lathe('dif_b', [(0, 0), (.9, 0), (1, .1), (1, .8), (.6, .9), (.3, .95), (.3, 1.0), (0, 1.0)], bottle, grp, x, y, z, 40, sx=H * .20, sy=H * .20, sz=H * .55)
    for i in range(7):
        a = (i - 3) * .09; tube('reed', [(x, y, z + H * .5), (x + a * .3, y, z + H * 1.0), (x + a, y, z + H * 1.5)], .0022, reed, grp, 2, 3)
def stone_tray(x, y, z, W, mat, rnd, pebble, grp='shell'):
    """плоская каменная чаша с галькой"""
    lathe('tray', VASES['bowl'], mat, grp, x, y, z, 56, sx=W / 2, sy=W / 2, sz=.05)
    for i in range(4):
        ball('peb', pebble, x + rnd.uniform(-.06, .06) * W / .3, y + rnd.uniform(-.04, .04), z + .028, .028 * rnd.uniform(.8, 1.2), grp, sx=1.1, sz=.6, seg=20, n=12)


def riser(x, y, z, w, h, d, mat, grp='shell'):
    """каменный куб-пьедестал: разная высота подставок делает витрину живой, как в бутике"""
    box('riser', mat, x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + h, grp, .006, 3)
def cloche(x, y, z, R, H, glassm, basem, knob, grp='shell'):
    """стеклянный купол на каменном основании (под него ставят баночку)"""
    lathe('clo_base', [(0, 0), (R * 1.10, 0), (R * 1.10, .012), (R * 1.0, .015), (0, .015)], basem, grp, x, y, z, 48)
    prof = [(R, .015), (R, H * .55)] + [(R * math.cos(i * math.pi / 20), H * .55 + H * .45 * math.sin(i * math.pi / 20)) for i in range(1, 11)]; prof[-1] = (0.0, H)
    lathe('clo_dome', prof, glassm, grp, x, y, z, 56, caps=False); ball('clo_knob', knob, x, y, z + H + .006, .011, grp)
def glass_vase(x, y, z, H, R, glassm, grp='shell'):
    lathe('gv', [(0, 0), (R * .96, 0), (R, .012), (R, H), (R - .004, H), (R - .004, .014), (0, .014)], glassm, grp, x, y, z, 48)
def eucalyptus(x, y, z, H, leaf, stem, rnd, grp='shell', n=5, spread=.10):
    """ветки эвкалипта с круглыми листьями (в стеклянной вазе)"""
    items = []
    for i in range(n):
        a = (i - (n - 1) / 2) / max(1, (n - 1) / 2); h = H * rnd.uniform(.8, 1.1); p0 = (x, y, z); p1 = (x + a * spread * .4, y, z + h * .5); p2 = (x + a * spread, y, z + h)
        tube('euc', [p0, p1, p2], .0022, stem, grp, 2, 3)
        for t in (.3, .42, .54, .66, .78, .9):
            q = tuple(p0[c] + (p2[c] - p0[c]) * t for c in range(3))
            for sg in (-1, 1): items.append((q, (sg * .9, .12, .35 + t * .3), .045, .021))
    leaves('euc_l', items, leaf, grp)
def round_mirror(x, y, z, R, frame, mir, grp='shell'):
    """круглое зеркало в тонкой латунной раме, прислонено к стене (отражает зал)"""
    xf = Matrix.Translation((x, y, z + R + .012)) @ Matrix.Rotation(math.radians(84), 4, 'X')
    lathe('mir_f', [(R, -.008), (R + .014, -.008), (R + .014, .008), (R, .008)], frame, grp, 0, 0, 0, 72, caps=False, xf=xf)
    lathe('mir_g', [(R, .003), (R * .5, .003), (0, .003)], mir, grp, 0, 0, 0, 72, xf=xf)
def wall_art(x, y, z, w, h, frame, paper, ink, grp='shell'):
    """небольшая абстрактная картина: рамка, молочный лист, тёмно-синий круг-«солнце» и тонкая линия горизонта"""
    box('art_f', frame, x - w / 2, x + w / 2, y - .012, y + .012, z, z + h, grp, .004, 2); box('art_p', paper, x - w / 2 + .018, x + w / 2 - .018, y - .0135, y - .011, z + .018, z + h - .018, grp)
    xf = Matrix.Translation((x, y - .0145, z + h * .60)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    lathe('art_s', [(w * .22, 0), (w * .11, 0), (0, 0)], ink, grp, 0, 0, 0, 48, xf=xf)
    box('art_l', ink, x - w / 2 + .05, x + w / 2 - .05, y - .0145, y - .0125, z + h * .30, z + h * .30 + .006, grp)
def soap(x, y, z, mat, grp='shell'):
    for i, (w, h) in enumerate(((.075, .026), (.07, .024), (.06, .022))):
        box('soap', mat, x - w / 2 + (i % 2) * .006, x + w / 2 + (i % 2) * .006, y - .04, y + .04, z, z + h, grp, .008, 3); z += h
def cotton_bowl(x, y, z, W, bowl, cotton, rnd, grp='shell'):
    lathe('cb', VASES['bowl'], bowl, grp, x, y, z, 56, sx=W / 2, sy=W / 2, sz=.07)
    for i in range(8):
        a = i * 2.4; r = .03 + (i % 3) * .018; ball('cot', cotton, x + math.cos(a) * r, y + math.sin(a) * r * .5, z + .05 + (i // 4) * .022, .025, grp, sz=.7, seg=20, n=12)


# ---------------- модели ----------------
def shelving(rnd, grp='shell'):
    """открытый стеллаж из светлого дуба 1,55 × 2,30 м, глубина 0,38 м: пять отсеков, глубокий синий задник, тёплая LED-подсветка; редкие косметологические предметы"""
    x0, x1, y0, y1, top = -1.95, -0.40, 0.76, 1.14, 2.30
    oak = wood('oak_v', hexc('#b98f58'), hexc('#dcb47c'), .42, 'z'); oakh = wood('oak_h', hexc('#b98f58'), hexc('#dcb47c'), .42, 'x')
    back = MT.microcement('shelf_back', (.04, .075, .17)); bl = led('shelf_led', 2.0, (1.0, .86, .62))
    gold = brass('gold', hexc('#caa968')); gold = brass('gold_cap', (.80, .64, .36, 1), .22)
    t = .04
    box('su_l', oak, x0, x0 + t, y0, y1, 0, top, grp, .006, 3); box('su_r', oak, x1 - t, x1, y0, y1, 0, top, grp, .006, 3)
    box('su_back', back, x0 + t, x1 - t, y1 - .025, y1, .06, top - .03, grp)
    box('su_plinth', oak, x0 + t, x1 - t, y0 + .05, y1 - .02, 0, .08, grp, .004, 2)
    box('su_cap', oakh, x0 - .015, x1 + .015, y0 - .015, y1 + .01, top - .03, top + .012, grp, .008, 4)
    bd = [0.08, .56, 1.04, 1.52, 1.98]
    for z in bd: box('su_b', oakh, x0 + t, x1 - t, y0 - .006, y1 - .02, z, z + .032, grp, .004, 3)
    for z in bd[1:] + [top - .03]: box('su_led', bl, x0 + t + .02, x1 - t - .02, y0 + .02, y0 + .035, z - .012, z - .004, grp)
    # материалы предметов: белая керамика, матовый белый пластик, золото, тёмная синяя эмаль, каучук, камень, стекло
    white = glaze('c_white', hexc('#f3efe6'), .12); mat_w = paint('c_matte', hexc('#f1ede4'), .5, spec=.3, bump=.1, bump_scale=120); navy = glaze('c_navy', hexc('#14264d'), .1)
    frost = paint('c_frost', hexc('#dfe6e6'), .28, coat=.5, spec=.5); rub = paint('c_rubber', hexc('#18181a'), .6); gls = glass('c_glass'); mirm = paint('c_mirror', (.92, .94, .97, 1), .02, metal=1.0, spec=1.0)
    stone = clay('c_stone', hexc('#ddd3bf')); pebb = clay('c_pebble', hexc('#cfc8b8')); towm = paint('c_towel', hexc('#f4f1ea'), .95, sheen=.5, bump=.4, bump_scale=160); cot = paint('c_cotton', hexc('#fbfaf6'), .95, sheen=.6)
    leaf = paint('c_leaf', hexc('#2e5c42'), .45, spec=.35); eleaf = paint('c_eleaf', hexc('#7f9a86'), .5, spec=.3); stem = paint('c_stem', hexc('#4a5a35'), .6); petal = paint('c_petal', hexc('#f8f5ef'), .35, spec=.4, sheen=.3); gr = paint('c_grass', hexc('#d9cfb4'), .7)
    book = [paint('bk%d' % i, hexc(c), .6, spec=.3, bump=.2, bump_scale=120) for i, c in enumerate(['#efe9dc', '#cfc4b0', '#14264d', '#f6f2ea'])]; oakf = paint('c_oakf', hexc('#c9b48c'), .45, spec=.3)
    ym = (y0 + y1) / 2 - .02; xi = x0 + t + .04
    # отсек 0: полотенца пирамидой, чаша с ватными дисками, стеклянная ваза с эвкалиптом
    z = bd[0] + .032
    towel(xi + .22, ym, z, .30, .055, towm, navy, grp); towel(xi + .22, ym, z + .11, .30, .055, towm, navy, grp)
    cotton_bowl(xi + .72, ym, z, .30, stone, cot, rnd, grp); soap(xi + 1.00, ym, z, mat_w, grp)
    glass_vase(xi + 1.28, ym, z, .30, .045, gls, grp); eucalyptus(xi + 1.28, ym, z + .02, .38, eleaf, stem, rnd, grp, 5, .13)
    # отсек 1: пьедесталы разной высоты — флаконы, пипетка, банка под стеклянным куполом, туба
    z = bd[1] + .032
    riser(xi + .17, ym, z, .20, .09, .20, stone, grp); pump_bottle(xi + .17, ym, z + .09, .22, white, mat_w, grp); pump_bottle(xi + .40, ym, z, .25, navy, mat_w, grp)
    dropper(xi + .58, ym, z, .17, frost, gold, rub, grp); riser(xi + .80, ym, z, .15, .05, .18, stone, grp); cloche(xi + .80, ym, z + .05, .068, .15, gls, stone, gold, grp); cream_jar(xi + .80, ym, z + .065, .075, .05, white, mat_w, grp)
    squeeze_tube(xi + 1.04, ym, z, .20, mat_w, gold, grp); zt = books_flat(xi + 1.30, ym, z, book, rnd, 2, .26, .20, grp); candle(xi + 1.30, ym, zt, .05, .06, white, mat_w, grp)
    # отсек 2: орхидея, круглое зеркало, диффузор, ряд банок
    z = bd[2] + .032
    orchid(xi + .26, ym, z, .46, white, leaf, petal, stem, rnd, grp); round_mirror(xi + .78, ym + .04, z, .15, gold, mirm, grp); diffuser(xi + 1.12, ym, z, .15, frost, rub, grp)
    cream_jar(xi + 1.30, ym, z, .095, .07, white, mat_w, grp); cream_jar(xi + 1.42, ym, z, .07, .055, white, navy, grp)
    # отсек 3: картина, пьедестал с пипетками, камни, помпа
    z = bd[3] + .032
    wall_art(xi + .22, ym + .10, z, .26, .34, oakf, mat_w, navy, grp)
    riser(xi + .72, ym, z, .30, .045, .18, stone, grp)
    for k, hh in enumerate((.16, .19, .14)): dropper(xi + .62 + k * .10, ym, z + .045, hh, navy if k != 1 else frost, gold, rub, grp)
    cairn(xi + 1.04, ym, z, pebb, rnd, grp, 4, .052); pump_bottle(xi + 1.36, ym, z, .27, mat_w, mat_w, grp)
    # отсек 4 (верхний, низкий): свеча, банка, камни, малая ваза
    z = bd[4] + .032
    candle(xi + .15, ym, z, .05, .07, white, mat_w, grp); cream_jar(xi + .45, ym, z, .09, .06, white, mat_w, grp); cairn(xi + .80, ym, z, pebb, rnd, grp, 3, .04); vase('c_v4', 'bottle', stone, xi + 1.25, ym, z, .20, grp)


def floor_lamp(x, y, zb=0.0, grp='shell'):
    """торшер: тонкая стойка из латуни, льняной абажур-конус с горящей лампой"""
    bras = brass(); dark = paint('lamp_foot', hexc('#1c1a17'), .35, metal=.6)
    lathe('lamp_foot', [(0, 0), (.20, 0), (.21, .012), (.21, .03), (.06, .045), (0, .045)], dark, grp, x, y, zb, 48)
    lathe('lamp_stem', [(0, .04), (.011, .04), (.011, 1.40), (.0, 1.40)], bras, grp, x, y, zb, 16)
    lathe('lamp_hub', [(0, 1.34), (.026, 1.34), (.03, 1.38), (.0, 1.40)], bras, grp, x, y, zb, 24)
    shade = paint('lamp_shade', hexc('#efe7d6'), .85, spec=.1, emit=(1.0, .86, .62), emit_k=.45)
    lathe('lamp_shade', [(0, 1.40), (.215, 1.40), (.22, 1.43), (.158, 1.77), (.15, 1.79), (.138, 1.79), (.146, 1.76), (.208, 1.43), (0, 1.43)], shade, grp, x, y, zb, 64, smooth=True, caps=False)
    ball('lamp_bulb', led('lamp_bulb', 10.0, (1.0, .84, .6)), x, y, zb + 1.58, .05, grp)


def pendants(grp='shell'):
    """три подвесных светильника над нишей (без шаров): опаловое «яйцо», купол из тёмно-синей эмали с латунью внутри, опаловый барабан"""
    bras = brass(); cord = paint('cord', hexc('#2b2620'), .5)
    opal = paint('opal', hexc('#f6efe0'), .38, spec=.3, emit=(1.0, .86, .62), emit_k=.32)
    navy = MT.microcement('dome_navy', (.04, .075, .17), .6); inner = paint('dome_in', (.80, .66, .44, 1), .45, metal=1.0, emit=(1.0, .88, .64), emit_k=1.3)
    def rod(px, z): lathe('rod', [(0, z), (.0045, z), (.0045, 7.5), (0, 7.5)], cord, grp, px, .25, 0, 8)
    def collar(px, z): lathe('collar', [(0, z), (.035, z), (.04, z + .015), (.032, z + .06), (.012, z + .085), (0, z + .085)], bras, grp, px, .25, 0, 32)
    px, z, r = 3.0, 3.30, .17                                                                            # опаловое «яйцо»: вытянутый эллипсоид
    rod(px, z + r * 1.5 + .06); ball('egg', opal, px, .25, z, r, grp, sz=1.5, seg=64, n=32); collar(px, z + r * 1.5 - .02)
    px, z, r = 3.58, 2.85, .27                                                                           # купол: открыт вниз, внутри латунь и свет
    rod(px, z + .14)
    lathe('dome', [(r, z), (r, z + .005), (r * .97, z + .05), (r * .78, z + .12), (r * .42, z + .17), (r * .14, z + .19), (0, z + .195)], navy, grp, px, .25, 0, 64, caps=False)
    lathe('dome_in', [(0, z + .18), (r * .14, z + .178), (r * .40, z + .158), (r * .76, z + .108), (r * .94, z + .045), (r * .995, z + .003)], inner, grp, px, .25, 0, 64, caps=False)
    ball('dome_bulb', led('dome_bulb', 12.0, (1.0, .88, .62)), px, .25, z + .08, .05, grp); lathe('dome_cap', [(0, z + .19), (.03, z + .19), (.035, z + .21), (0, z + .22)], bras, grp, px, .25, 0, 24)
    px, z = 4.12, 3.45                                                                                   # опаловый барабан с тонким латунным ободком
    rod(px, z + .30)
    lathe('drum', [(0, z - .13), (.11, z - .13), (.115, z - .12), (.115, z + .12), (.11, z + .13), (0, z + .13)], opal, grp, px, .25, 0, 56)
    lathe('drum_rim', [(.113, z + .115), (.119, z + .115), (.119, z + .135), (.113, z + .135)], bras, grp, px, .25, 0, 56, caps=False); lathe('drum_rim2', [(.113, z - .135), (.119, z - .135), (.119, z - .115), (.113, z - .115)], bras, grp, px, .25, 0, 56, caps=False)
    collar(px, z + .12)


def sofa(sx0, sx1, sy0, sy1, z0, grp='shell'):
    """низкий диван из молочного букле с тёмно-синими и стальными подушками (как на главной), тонкие бронзовые ножки"""
    ivo = MT.boucle('sofa_ivory', (.80, .74, .62)); ivo2 = MT.boucle('sofa_ivory2', (.86, .80, .68)); bron = paint('leg_bronze', hexc('#3a2f26'), .3, metal=1.0); w = sx1 - sx0; mid = (sx0 + sx1) / 2
    for (lx, ly) in ((sx0 + .10, sy0 + .08), (sx1 - .10, sy0 + .08), (sx0 + .10, sy1 - .10), (sx1 - .10, sy1 - .10)):
        lathe('leg', [(0, 0), (.016, 0), (.024, .13), (0, .13)], bron, grp, lx, ly, z0 - .13, 16)
    box('s_base', ivo, sx0, sx1, sy0, sy1, z0, z0 + .16, grp, .05, 6)
    box('s_back', ivo, sx0 + .05, sx1 - .05, sy1 - .24, sy1, z0 + .16, z0 + .72, grp, .09, 7)
    box('s_arm', ivo, sx0 - .02, sx0 + .20, sy0, sy1, z0 + .16, z0 + .50, grp, .09, 7); box('s_arm', ivo, sx1 - .20, sx1 + .02, sy0, sy1, z0 + .16, z0 + .50, grp, .09, 7)
    box('s_seat', ivo2, sx0 + .22, mid - .005, sy0 + .02, sy1 - .22, z0 + .16, z0 + .34, grp, .08, 7); box('s_seat', ivo2, mid + .005, sx1 - .22, sy0 + .02, sy1 - .22, z0 + .16, z0 + .34, grp, .08, 7)
    for (px, col, a) in ((sx0 + .42, '#14264d', .18), (sx0 + .80, '#5d78a6', -.12), (sx1 - .50, '#14264d', .14)):
        box('pillow', velvet('pil' + col, hexc(col)), px - .21, px + .21, sy1 - .50, sy1 - .27, z0 + .34, z0 + .70, grp, .07, 7, tilt=a, pivot=(px, z0 + .34))


def niche_props(rnd, grp='niche'):
    """ниша: на стеклянных полках (z=0,62; 1,42; 2,22; y 1,05…2,55) предметы разной высоты на каменных подставках, стеклянные купол и ваза, зеркало, картина"""
    y = 1.78; gold = brass('gold_cap', (.80, .64, .36, 1), .22)
    white = glaze('n_white', hexc('#f3efe6'), .12); mat_w = paint('n_matte', hexc('#f1ede4'), .5, spec=.3, bump=.1, bump_scale=120); navy = glaze('n_navy', hexc('#14264d'), .1)
    frost = paint('n_frost', hexc('#dfe6e6'), .28, coat=.5, spec=.5); rub = paint('n_rubber', hexc('#18181a'), .6); gls = glass('n_glass'); mirm = paint('n_mirror', (.92, .94, .97, 1), .02, metal=1.0, spec=1.0)
    stone = clay('n_stone', hexc('#ddd3bf')); pebb = clay('n_pebble', hexc('#cfc8b8')); towm = paint('n_towel', hexc('#f4f1ea'), .95, sheen=.5, bump=.4, bump_scale=160); cot = paint('n_cotton', hexc('#fbfaf6'), .95, sheen=.6)
    leaf = paint('n_leaf', hexc('#2e5c42'), .45, spec=.35); eleaf = paint('n_eleaf', hexc('#7f9a86'), .5, spec=.3); stem = paint('n_stem', hexc('#4a5a35'), .6); petal = paint('n_petal', hexc('#f8f5ef'), .35, spec=.4, sheen=.3); gr = paint('n_grass', hexc('#d9cfb4'), .7)
    oakf = paint('n_oakf', hexc('#c9b48c'), .45, spec=.3)
    zs = (0.62 + .04, 1.42 + .04, 2.22 + .04)
    z = zs[0]; vase('nv0a', 'bottle', stone, 2.55, y, z, .52, grp); grass(2.55, y, z + .52, .40, gr, rnd, grp, 11, .16)
    towel(3.25, y, z, .34, .06, towm, navy, grp); towel(3.25, y, z + .12, .34, .06, towm, navy, grp); towel(3.25, y, z + .24, .34, .06, towm, navy, grp)
    riser(3.95, y, z, .34, .12, .26, stone, grp); cream_jar(3.95, y, z + .12, .15, .09, white, mat_w, grp); cream_jar(3.95, y, z + .21, .11, .07, white, navy, grp)
    candle(4.50, y, z, .07, .09, white, mat_w, grp); soap(4.95, y, z, mat_w, grp)
    z = zs[1]; orchid(2.68, y, z, .60, white, leaf, petal, stem, rnd, grp); stone_tray(3.45, y, z, .42, stone, rnd, pebb, grp)
    riser(4.12, y, z, .28, .10, .24, stone, grp); pump_bottle(4.12, y, z + .10, .28, white, mat_w, grp); pump_bottle(4.46, y, z, .26, navy, mat_w, grp); cloche(4.84, y, z, .09, .20, gls, stone, gold, grp); cream_jar(4.84, y, z + .015, .10, .07, white, mat_w, grp)
    z = zs[2]; glass_vase(2.55, y, z, .40, .06, gls, grp); eucalyptus(2.55, y, z + .02, .55, eleaf, stem, rnd, grp, 6, .20)
    riser(3.35, y, z, .40, .06, .24, stone, grp)
    for k, hh in enumerate((.20, .24, .18)): dropper(3.22 + k * .15, y, z + .06, hh, navy if k != 1 else frost, gold, rub, grp)
    round_mirror(4.05, y + .35, z, .20, gold, mirm, grp); cairn(4.65, y, z, pebb, rnd, grp, 4, .07); vase('nv2d', 'amphora', stone, 5.0, y, z, .30, grp)


def build(M, floor_z=0.30):
    """вся расстановка; вызывать ДО растения (в сцене ещё мало объектов)"""
    rnd = random.Random(11)
    shelving(rnd); floor_lamp(-0.18, 0.46, 0.30); pendants(); sofa(0.28, 2.10, 0.02, 0.62, 0.30 + .13); niche_props(random.Random(5))
