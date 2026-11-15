#!/usr/bin/env python3
"""ASTREYA GRAND ATRIUM — главное архитектурное пространство страницы «Компания» (Blender 5 / Cycles, CPU).

Светлый представительский атриум из натурального камня: колоннада с каннелюрами и арочная аркада вдоль центральной оси, высокие световые ниши
(клеристорий), потолок с поперечными балками и световыми щелями, полированный травертиновый пол с латунной осью-«стрелой», в глубине — большой
арочный портал со стеклянным экраном (тёмно-синие стойки), в центре — скульптура по мотивам знака «Астрея»: два скрещённых каменных клинка,
кольцо-«орбита» цвета шампань и шар из слоновой кости на двухступенчатом травертиновом основании. Знак не копируется: это архитектурная форма
с отрицательным пространством; оригинальный логотип на странице остаётся веб-слоем.

Материалы (как в ТЗ): ASTREYA_TRAVERTINE, ASTREYA_IVORY_STONE, ASTREYA_SAND_STONE, ASTREYA_NAVY_METAL, ASTREYA_BRUSHED_CHAMPAGNE, ASTREYA_ARCH_GLASS
(камень — из библиотеки CC0 tools/showroom-assets/textures, как в зале «Обучения»).
Камеры: cam_main (общий вид по оси), cam_wide (с другой стороны — финальная сцена), cam_sculpture (скульптура), cam_arch (проём), cam_side (боковая
экспозиция), cam_mobile (вертикальная композиция), cam_dolly (5–7 с: широкий план → скульптура).

Запуск (из этой папки, python3 с модулем bpy):
  python3 atrium.py preview                 быстрый кадр cam_main (/tmp/at_preview.png); AT_CAM=wide|sculpture|arch|side|mobile — другая камера
  python3 atrium.py still                   итоговый кадр выбранной камеры (AT_CAM, AT_W, AT_SPP, AT_TILES) → /tmp/at_<cam>.png
  python3 atrium.py seq                     кадры пролёта камеры AT_FROM..AT_TO из AT_FRAMES (резюмируемо) → /tmp/at_seq/<prefix>_NNN.png
  python3 atrium.py save                    сохранить ASTREYA_COMPANY_ATRIUM.blend и экспортировать assets/company/company_atrium.glb
Переменные: AT_W, AT_SPP, AT_TILES, AT_CAM, AT_FRAMES, AT_FROM, AT_TO, AT_THREADS (по умолчанию 2), EXPO, GLOW, LKEY, CROP=x0,x1,y0,y1 (доли, только preview)."""
import bpy, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); SA = os.path.join(HERE, '..'); sys.path.insert(0, os.path.join(SA, 'auditorium')); sys.path.insert(0, SA)
import random
import scene as S
import academy_auditorium as AA
import realism as RL
from mathutils import Vector

ARGS = [a for a in sys.argv[1:] if not a.startswith('-')]
MODE = ARGS[0] if ARGS else 'preview'
E = AA.E

# ───────────── размеры (метры) ─────────────
LEN = 38.0            # длина зала по Y (стена входа y=0, дальняя стена y=LEN)
NX = 6.0              # ось колоннады по X (±)
WX = 11.5             # наружная стена боковых нефов (±)
ZS = 6.4              # пята арки аркады
ZE = 10.3             # низ карниза/антаблемента
ZC = 14.2             # потолок главного нефа
ZN = 9.8              # потолок боковых нефов
COLS = [4.0, 10.0, 16.0, 22.0, 28.0, 34.0]
SY = 19.0             # скульптура по Y


# ───────────── материалы ─────────────
def materials():
    M = {}
    M['tra'] = AA.weather(AA.pbr('ASTREYA_TRAVERTINE', 'travertine-ivory', tile=2.6, tint='#fff6e8', coat=.35, bump=.18), color_var=.05, cscale=.5, rvar=.10, rscale=.35)
    M['floor'] = seams(AA.weather(AA.pbr('ASTREYA_TRAVERTINE_FLOOR', 'travertine-ivory', tile=3.2, tint='#fff6e8', coat=.35, bump=.14), color_var=.045, cscale=.4, rvar=.10, rscale=.35), size=2.4)
    M['ivory'] = AA.weather(AA.pbr('ASTREYA_IVORY_STONE', 'plaster-light-smooth', tile=3.0, tint='#fbf4e6', rough=.72, bump=.12), color_var=.045, cscale=.55, bump=.35)
    M['sand'] = AA.weather(AA.pbr('ASTREYA_SAND_STONE', 'travertine-sand', tile=2.4, tint='#f6e6cb', rough=.62, bump=.2), color_var=.05, cscale=.6)
    M['navy'] = AA.flat('ASTREYA_NAVY_METAL', '#10214b', rough=.42, metal=.82)
    M['champ'] = AA.pbr('ASTREYA_BRUSHED_CHAMPAGNE', 'gold-matte-champagne', tile=.5, tint='#fff1d6', rough=.34, metal=1.0, bump=.1)
    M['glass'] = AA.glass('ASTREYA_ARCH_GLASS', tint='#f1f6f7', rough=.03)
    M['flute'] = AA.fluted('ASTREYA_FLUTED_PANEL', '#eadfca', pitch=.16, depth=.8, rough=.4)
    M['sphere'] = AA.flat('ASTREYA_IVORY_POLISHED', '#f3ead9', rough=.16, coat=.5)
    k = float(os.environ.get('GLOW', 9.0))
    M['win'] = AA.led('at_window', (1.0, .93, .82), k)               # световые ниши клеристория (мягкий дневной, не жёлтый)
    M['slot'] = AA.led('at_slot', (1.0, .94, .85), k * .55)           # световые щели потолка
    M['apse'] = AA.led('at_apse', (1.0, .90, .78), k * .62)           # светящийся задник за порталом и окна входа
    M['led'] = AA.led('at_led', (1.0, .80, .55), 5.0)                 # тонкие «световые линии» у основания
    M['vase'] = AA.flat('ASTREYA_CERAMIC_IVORY', '#eee4d3', rough=.3, coat=.45); M['bark'] = AA.flat('at_bark', '#4a3b2d', rough=.8)
    M['niche'] = AA.led('at_niche', (1.0, .88, .70), k * .42)         # ниши боковых нефов
    return M


def seams(m, size=2.4, mortar=.010, dark=.80, var=(.975, .955, .93)):
    """швы крупноформатной плитки и лёгкий разброс тона плит: кирпичная текстура в координатах объекта умножается на цвет материала (тон плиты — Color1…Color2)"""
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = next(n for n in N if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    tc = N.new('ShaderNodeTexCoord'); br = N.new('ShaderNodeTexBrick'); br.offset = 0.0
    for k, v in (('Scale', 1.0), ('Brick Width', size), ('Row Height', size), ('Mortar Size', mortar), ('Mortar Smooth', .6)): br.inputs[k].default_value = v
    br.inputs['Color1'].default_value = (1, 1, 1, 1); br.inputs['Color2'].default_value = (*var, 1); br.inputs['Mortar'].default_value = (dark, dark, dark * .97, 1)
    L.new(tc.outputs['Object'], br.inputs['Vector'])
    mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1.0; src = b.inputs['Base Color']
    if src.links: l = src.links[0]; L.new(l.from_socket, mx.inputs['Color1']); L.remove(l)
    else: mx.inputs['Color1'].default_value = src.default_value
    L.new(br.outputs['Color'], mx.inputs['Color2']); L.new(mx.outputs['Color'], b.inputs['Base Color'])
    return m


# ───────────── геометрия ─────────────
def prism_yz(name, mat, pts_yz, x0, x1, bevel=0.0):
    """прямая призма: контур в плоскости YZ, толщина по X"""
    n = len(pts_yz); v = [(x0, y, z) for y, z in pts_yz] + [(x1, y, z) for y, z in pts_yz]
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return AA.mesh(name, v, f, mat, bevel=bevel)


def ring_yz(name, mat, outer, inner, x0, x1):
    """рамка вдоль «∩»-контура: между внешней и внутренней ломаными (одинаковое число точек), толщина по X — это окантовка проёма, а не сплошная пластина"""
    n = len(outer); v = [(x0, y, z) for y, z in outer] + [(x0, y, z) for y, z in inner] + [(x1, y, z) for y, z in outer] + [(x1, y, z) for y, z in inner]; f = []
    for i in range(n - 1):
        f += [(2 * n + i, 2 * n + i + 1, 3 * n + i + 1, 3 * n + i), (i, n + i, n + i + 1, i + 1), (i, i + 1, 2 * n + i + 1, 2 * n + i), (n + i, 3 * n + i, 3 * n + i + 1, n + i + 1)]
    f += [(0, 2 * n, 3 * n, n), (n - 1, 2 * n - 1, 4 * n - 1, 3 * n - 1)]
    return AA.mesh(name, v, f, mat)


def column(name, mat, cx, cy, r, z0, z1, flutes=24, depth=.045, per=5):
    """колонна с настоящими каннелюрами (профиль r(θ) — синус), гладкое затенение"""
    n = flutes * per; verts = []; faces = []
    for z in (z0, z1):
        for i in range(n):
            t = 2 * math.pi * i / n; g = .5 + .5 * math.cos(flutes * t); rr = r - depth * (g ** 1.6)
            verts.append((cx + rr * math.cos(t), cy + rr * math.sin(t), z))
    for i in range(n): j = (i + 1) % n; faces.append((i, j, n + j, n + i))
    return AA.mesh(name, verts, faces, mat, smooth=True)


def arch_yz(y_a, y_b, zs, steps=24):
    """полуциркульная арка в плоскости YZ: точки (y, z) от (y_a, zs) по дуге до (y_b, zs)"""
    r = (y_b - y_a) / 2; cy = (y_a + y_b) / 2
    return [(cy - r * math.cos(math.pi * i / steps), zs + r * math.sin(math.pi * i / steps)) for i in range(steps + 1)]


def arch_xz(x_a, x_b, zs, steps=28):
    r = (x_b - x_a) / 2; cx = (x_a + x_b) / 2
    return [(cx - r * math.cos(math.pi * i / steps), zs + r * math.sin(math.pi * i / steps)) for i in range(steps + 1)]


def ring_band(name, mat, cx, cy, cz, a, b, w=.16, t=.03, tilt_y=0.0, tilt_x=0.0, n=220):
    ob = AA.sweep(name, mat, 0, 0, 0, a, b, [(-w / 2, 0), (w / 2, 0), (w / 2, t), (-w / 2, t)], n=n, bevel=.004)
    ob.rotation_euler = (math.radians(tilt_x), math.radians(tilt_y), 0); ob.location = (cx, cy, cz); return ob


def disc(name, mat, cx, cy, rr, z0, h, n=160, bevel=.012):
    v = []; f = []
    for z in (z0, z0 + h):
        for i in range(n): t = 2 * math.pi * i / n; v.append((cx + rr * math.cos(t), cy + rr * math.sin(t), z))
    v += [(cx, cy, z0), (cx, cy, z0 + h)]
    for i in range(n): j = (i + 1) % n; f.append((i, j, n + j, n + i)); f.append((2 * n, j, i)); f.append((2 * n + 1, n + i, n + j))
    return AA.mesh(name, v, f, mat, smooth=False, bevel=bevel)


# ───────────── растения: ваза и тонкие ветки оливы (листья — из общей библиотеки realism.py) ─────────────
VASE_P = [(0, 0), (.20, 0), (.27, .035), (.395, .21), (.45, .41), (.405, .60), (.27, .76), (.175, .86), (.165, .93), (.215, .995), (.19, 1.0), (.15, .94), (.0, .90)]


def lathe(name, mat, prof, cx, cy, z0, sx, sz, seg=96):
    n = len(prof); v = []; f = []
    for r, h in prof:
        for k in range(seg): a = 2 * math.pi * k / seg; v.append((cx + sx * r * math.cos(a), cy + sx * r * math.sin(a), z0 + sz * h))
    for i in range(n - 1):
        for k in range(seg): a_ = i * seg + k; b_ = i * seg + (k + 1) % seg; f.append((a_, b_, b_ + seg, a_ + seg))
    f.append(tuple(reversed(range(seg))))
    return AA.mesh(name, v, f, mat, smooth=True)


def olive_leaves():
    ma = RL.leaf_material('olive_leafA', (.05, .085, .035), (.16, .23, .075)); mb = RL.leaf_material('olive_leafB', (.085, .125, .05), (.23, .30, .105), under=True)
    out = []
    for m in (ma, mb): out.extend(RL.leaf_variants(.07, .0105, 4, 'olive', (m,)))
    return out


def twig(rnd, leaves, bark, pts, count, r0, r1, k=1.0):
    cu = bpy.data.curves.new('tw', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, q in enumerate(pts): sp.points[i].co = (q[0], q[1], q[2], 1); sp.points[i].radius = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
    cu.bevel_depth = 1.0; cu.bevel_resolution = 2; cu.use_fill_caps = True; cu.materials.append(bark)
    AA.link(bpy.data.objects.new('tw', cu))

    def at(t):
        f = t * (len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i + 1], f - i)
    for i in range(1, count + 1):
        t = i / (count + 1) * .94 + .06; pos = at(t); d = (at(min(1, t + .03)) - pos).normalized()
        for dv in RL.pair_dirs(d, i, rnd, spread=1.0, up=.20, droop=.24):
            lf = AA.link(bpy.data.objects.new('lf', rnd.choice(leaves))); lf.scale = ((1.15 - .40 * t) * (.74 + rnd.random() * .56) * k,) * 3; RL.orient(lf, dv, rnd, .8, RL.tint_for(t, rnd)); lf.location = pos
    return at


def olive_vase(M, leaves, rnd, x, y, H=1.05, n=8):
    lathe('plant_vase', M['vase'], VASE_P, x, y, 0.0, H * .62, H)
    neck = Vector((x, y, H * .93))
    for j in range(n):
        az = rnd.uniform(0, 6.283); el = rnd.uniform(1.15, 1.5) if j else 1.55; Lb = rnd.uniform(1.5, 2.5) * (1.0 if j % 2 else .85)
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))).normalized()
        pts = [neck, neck + d * Lb * .35 + Vector((0, 0, .06)), neck + d * Lb * .7 + Vector((0, 0, .1)), neck + d * Lb + Vector((0, 0, -.06 * Lb))]
        at = twig(rnd, leaves, M['bark'], pts, 36, .011, .004)
        for t in (.45, .68):
            P = at(t); az2 = az + rnd.choice((-1, 1)) * rnd.uniform(.5, .9); d2 = Vector((math.cos(az2) * math.cos(el), math.sin(az2) * math.cos(el), math.sin(el) * .8 + .15)).normalized(); L2 = Lb * rnd.uniform(.28, .4)
            twig(rnd, leaves, M['bark'], [P, P + d2 * L2 * .5 + Vector((0, 0, .03)), P + d2 * L2 + Vector((0, 0, -.02))], 12, .006, .003, .95)


def build():
    M = materials(); X = NX
    # пол: полированный травертин; латунная осевая «стрела» и тёмно-синие вставки в уровень пола
    AA.box('floor', M['floor'], -WX - .3, WX + .3, -1.0, LEN + 2.2, -.4, 0.0, bevel=0)
    AA.box('axis_line', M['champ'], -.035, .035, 1.0, SY - 3.9, 0.0, .004, bevel=0)
    AA.box('axis_line2', M['champ'], -.035, .035, SY + 3.9, LEN - 1.0, 0.0, .004, bevel=0)
    for sx in (-1, 1):
        AA.box('floor_navy_%d' % sx, M['navy'], sx * (X - 1.35) - .03, sx * (X - 1.35) + .03, 1.0, LEN - 1.0, 0.0, .004, bevel=0)
    # колоннада: база, каннелированный ствол, капитель
    for sx in (-1, 1):
        for i, y in enumerate(COLS):
            x = sx * X
            AA.box('cbase_%d_%d' % (sx, i), M['tra'], x - .78, x + .78, y - .78, y + .78, 0, .5, bevel=.03)
            column('col_%d_%d' % (sx, i), M['flute'], x, y, .62, .5, ZE - .45)
            AA.box('ccap_%d_%d' % (sx, i), M['ivory'], x - .85, x + .85, y - .85, y + .85, ZE - .45, ZE + .05, bevel=.025)
    # аркада (спандрели), клеристорий со световыми нишами, карниз
    for sx in (-1, 1):
        xa, xb = sorted((sx * (X - .32), sx * (X + .32)))
        inner = sx * (X - .32)
        for i in range(len(COLS) - 1):
            ya, yb = COLS[i] + .85, COLS[i + 1] - .85
            prism_yz('arc_%d_%d' % (sx, i), M['ivory'], arch_yz(ya, yb, ZS) + [(yb, ZE), (ya, ZE)], xa, xb, bevel=.012)
            AA.box('clr_%d_%d' % (sx, i), M['ivory'], xa, xb, COLS[i] - .85, COLS[i + 1] + .85, ZE, ZC, bevel=.01)
            ymid = (COLS[i] + COLS[i + 1]) / 2; hw = 1.55; zt = ZE + 1.8
            win = [(ymid - hw, ZE + .55)] + arch_yz(ymid - hw, ymid + hw, zt, steps=18) + [(ymid + hw, ZE + .55)]
            xf = inner - sx * .004
            prism_yz('winl_%d_%d' % (sx, i), M['win'], win, min(xf, xf - sx * .01), max(xf, xf - sx * .01))
            o = [(ymid - hw - .1, ZE + .45)] + arch_yz(ymid - hw - .1, ymid + hw + .1, zt, steps=18) + [(ymid + hw + .1, ZE + .45)]
            i_ = [(ymid - hw, ZE + .55)] + arch_yz(ymid - hw, ymid + hw, zt, steps=18) + [(ymid + hw, ZE + .55)]
            ring_yz('winf_%d_%d' % (sx, i), M['champ'], o, i_, min(xf - sx * .03, xf + sx * .0), max(xf - sx * .03, xf + sx * .0))
        AA.box('corn_%d' % sx, M['tra'], min(inner - sx * .1, inner + sx * .9), max(inner - sx * .1, inner + sx * .9), 0.5, LEN - .2, ZE - .05, ZE + .38, bevel=.02)
    # потолок главного нефа: плита, поперечные балки, световые щели между ними
    AA.box('ceil', M['ivory'], -X - .4, X + .4, -.9, LEN + 2.2, ZC, ZC + .5, bevel=0)
    bys = [2.0] + COLS + [LEN - 1.4]
    for i, y in enumerate(bys):
        AA.box('beam_%d' % i, M['tra'], -X - .4, X + .4, y - .38, y + .38, ZC - 1.1, ZC, bevel=.03)
    for i in range(len(bys) - 1):
        for xs in (-3.1, 0.0, 3.1):
            AA.box('slot_%d_%d' % (i, int(xs * 10)), M['slot'], xs - 1.05, xs + 1.05, bys[i] + .55, bys[i + 1] - .55, ZC - .02, ZC - .005, bevel=0)
    # боковые нефы: потолок, наружная стена, ниши с подиумами
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (X + .3), sx * WX)); AA.box('aisle_ceil_%d' % sx, M['ivory'], x0, x1, -.9, LEN + 2.2, ZN, ZN + .4, bevel=0)
        xo = sx * WX; xw0, xw1 = sorted((xo, xo + sx * .6)); AA.box('aisle_wall_%d' % sx, M['ivory'], xw0, xw1, -.9, LEN + 2.2, 0, ZN + .4, bevel=0)
        for i in range(len(COLS) - 1):
            ymid = (COLS[i] + COLS[i + 1]) / 2; hw = 1.0
            pts = [(ymid - hw, .9), (ymid - hw, 4.0)] + arch_yz(ymid - hw, ymid + hw, 4.0, steps=16) + [(ymid + hw, .9)]
            xn = xo - sx * .012
            prism_yz('niche_%d_%d' % (sx, i), M['niche'], pts, min(xn, xn - sx * .01), max(xn, xn - sx * .01))
            pts3 = [(ymid - hw - .1, .82), (ymid - hw - .1, 4.0)] + arch_yz(ymid - hw - .1, ymid + hw + .1, 4.0, steps=16) + [(ymid + hw + .1, .82)]
            prism_yz('nichef_%d_%d' % (sx, i), M['tra'], pts3, min(xn + sx * .004, xn + sx * .05), max(xn + sx * .004, xn + sx * .05), bevel=.01)
            x_c = xo - sx * .55; AA.box('nplinth_%d_%d' % (sx, i), M['tra'], x_c - .42, x_c + .42, ymid - .75, ymid + .75, 0, .5, bevel=.03)
    # стена входа (y=0): три высокие светящиеся арки; стойки — тёмно-синий металл
    AA.box('entry_wall', M['ivory'], -WX - .6, WX + .6, -.9, 0.0, 0, ZC + .5, bevel=0)
    for k, cx in enumerate((-6.6, 0.0, 6.6)):
        w2 = 2.0 if k != 1 else 2.6
        pts = [(cx - w2, 0.0), (cx - w2, 6.2)] + arch_xz(cx - w2, cx + w2, 6.2)[1:] + [(cx + w2, 0.0)]
        AA.prism('entry_glow_%d' % k, M['apse'], pts, .002, .01)
        for j in range(-2, 3):
            xm = cx + j * w2 / 2.5
            AA.box('entry_mull_%d_%d' % (k, j), M['navy'], xm - .02, xm + .02, .0, .05, 0.0, 6.2 + math.sqrt(max(0.0, w2 * w2 - (j * w2 / 2.5) ** 2)), bevel=.004)
        AA.box('entry_sill_%d' % k, M['tra'], cx - w2 - .1, cx + w2 + .1, .0, .35, 0, .18, bevel=.02)
    # дальняя стена: массивные блоки, портал, глубокая светящаяся камера и стеклянный экран с синими стойками
    yw = LEN; PW = 4.1; PZ = 7.6
    AA.box('far_l', M['ivory'], -WX - .6, -PW, yw, yw + .35, 0, ZC + .5, bevel=0)
    AA.box('far_r', M['ivory'], PW, WX + .6, yw, yw + .35, 0, ZC + .5, bevel=0)
    AA.prism('far_top', M['ivory'], arch_xz(-PW, PW, PZ) + [(PW, ZC + .5), (-PW, ZC + .5)], yw, yw + .35)
    AA.box('apse_back', M['apse'], -PW - .3, PW + .3, yw + 7.0, yw + 7.1, 0, PZ + PW + .6, bevel=0)
    AA.box('apse_floor', M['floor'], -PW - .3, PW + .3, yw, yw + 7.1, -.4, 0.0, bevel=0)
    AA.box('apse_l', M['flute'], -PW - .3, -PW, yw + .36, yw + 7.1, 0, PZ + PW + .6, bevel=0)
    AA.box('apse_r', M['flute'], PW, PW + .3, yw + .36, yw + 7.1, 0, PZ + PW + .6, bevel=0)
    AA.prism('apse_top', M['ivory'], arch_xz(-PW, PW, PZ) + [(PW, PZ + PW + .6), (-PW, PZ + PW + .6)], yw + .36, yw + 7.1)
    if not os.environ.get('NOGLASS'): AA.prism('portal_glass', M['glass'], [(-PW, 0.0)] + arch_xz(-PW, PW, PZ) + [(PW, 0.0)], yw + .12, yw + .16)
    for j in range(-9, 10):
        x = j * PW / 9.4
        AA.box('pm_%d' % j, M['navy'], x - .018, x + .018, yw + .08, yw + .2, 0.0, PZ + math.sqrt(max(.1, PW * PW - x * x)) - .05, bevel=.004)
    AA.box('pm_rail', M['navy'], -PW, PW, yw + .08, yw + .2, 3.2, 3.26, bevel=.004)
    for sx in (-1, 1):
        AA.box('led_base_%d' % sx, M['led'], sx * (X - 1.05) - .02, sx * (X - 1.05) + .02, 1.4, LEN - 1.4, .02, .045, bevel=0)
    # рифлёные архитектурные панели на торцевых стенах
    for x0, x1 in ((-10.9, -5.0), (5.0, 10.9)): AA.box('far_panel_%d' % x0, M['flute'], x0, x1, yw - .06, yw, .5, 11.8, bevel=.006)
    for x0, x1 in ((-11.0, -8.9), (8.9, 11.0), (-4.45, -2.85), (2.85, 4.45)): AA.box('entry_panel_%d' % int(x0 * 10), M['flute'], x0, x1, 0.0, .06, .5, 11.8, bevel=.006)
    sculpture(M)
    rnd = random.Random(21); lv = olive_leaves()
    for sx in (-1, 1): olive_vase(M, lv, rnd, sx * 4.9, LEN - 2.3)
    return M


def sculpture(M):
    cx, cy = 0.0, SY
    disc('plinth1', M['tra'], cx, cy, 3.5, 0.0, .24); disc('plinth2', M['tra'], cx, cy, 2.85, .24, .28)
    AA.sweep('plinth_ring', M['navy'], cx, cy, 0.0, 3.85, 3.85, [(-.04, 0), (.04, 0), (.04, .008), (-.04, .008)], n=200)
    AA.sweep('plinth_brass', M['champ'], cx, cy, .52, 2.85, 2.85, [(-.025, 0), (.0, 0), (.0, .01), (-.025, .01)], n=160)
    z0 = .52
    # два каменных клинка скрещиваются у вершины, смещены по Y — между ними остаётся узкая щель (отрицательное пространство)
    L = [(-2.15, z0), (-.95, z0), (.16, 7.75)]
    R = [(.95, z0), (2.1, z0), (-.14, 6.55)]
    for nm, pts, y0, y1, mat in (('blade_L', L, cy - .5, cy - .08, M['tra']), ('blade_R', R, cy + .08, cy + .5, M['ivory'])):
        AA.prism(nm, mat, [(cx + x, z) for x, z in pts], y0, y1, bevel=.018)
    # кольцо-«орбита»: лента цвета шампань с тонкой синей линией, охватывает оба клинка
    ring_band('orbit', M['champ'], cx, cy, 3.05, 3.15, 1.65, w=.3, t=.07, tilt_y=14)
    ring_band('orbit_in', M['navy'], cx, cy, 3.05, 3.15, 1.65, w=.07, t=.085, tilt_y=14)
    # шар из слоновой кости слева на основании (круг знака)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=.5, location=(cx - 2.2, cy + 1.35, z0 + .5)); sp = bpy.context.object; sp.name = 'sphere'; sp.data.materials.append(M['sphere'])
    for p in sp.data.polygons: p.use_smooth = True


# ───────────── свет ─────────────
def lights():
    k = float(os.environ.get('LKEY', 1.0))
    AA.area('at_sky', (0, LEN * .5, ZC - .4), (0, LEN * .5, 0), 3200 * k, 11, 30, (1.0, .95, .88))             # мягкий дневной свет сверху
    AA.area('at_back', (0, LEN - 3.0, 9.5), (0, SY, 1.5), 900 * k, 7, 6, (1.0, .92, .80))                       # контровой свет от портала
    AA.spot('at_sp_l', (-7.0, SY - 8.0, 12.5), (0.0, SY, 3.2), 5200 * k, 22, .65, (1.0, .93, .82), radius=.2)   # акценты на скульптуру
    AA.spot('at_sp_r', (7.0, SY - 9.0, 12.5), (0.0, SY, 3.2), 3600 * k, 22, .65, (1.0, .93, .82), radius=.2)
    AA.spot('at_sp_back', (0.0, SY + 9.5, 12.8), (0.0, SY, 3.0), 2600 * k, 28, .7, (1.0, .95, .86), radius=.25)
    AA.area('at_cl_l', (-5.1, 12.0, 13.4), (4.0, 15.0, 0.0), 5200 * k, 1.6, 18, (1.0, .94, .84))              # косой мягкий свет от клеристория слева — тени колонн на полу
    AA.area('at_cl_r', (5.1, 24.0, 13.4), (-4.0, 22.0, 0.0), 2600 * k, 1.6, 18, (1.0, .94, .84))
    AA.area('at_apse', (0.0, LEN + 3.6, 12.5), (0.0, LEN + 3.6, 0.0), 1800 * k, 7, 6, (1.0, .93, .82))        # камера за порталом: боковые стены и свод не чёрные
    AA.area('at_apse2', (0.0, LEN + 1.8, 2.0), (0.0, LEN + 5.0, 3.0), 500 * k, 6, 4, (1.0, .93, .82))
    w = bpy.data.worlds.new('at_w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.95, .90, .82, 1); bg.inputs['Strength'].default_value = float(os.environ.get('WORLD', .05)); bpy.context.scene.world = w


# ───────────── камеры ─────────────
CAMS = {
    'main': dict(loc=(0.0, 1.0, 1.7), rot=(2.5, 0, 0), lens=24),
    'wide': dict(loc=(0.0, LEN - 2.6, 2.4), rot=(1.5, 0, 180), lens=22),
    'sculpture': dict(loc=(2.2, SY - 9.2, 1.6), rot=(10.0, 0, 3), lens=42),
    'arch': dict(loc=(-3.2, 9.5, 1.5), rot=(5.0, 0, -38), lens=30),
    'side': dict(loc=(-7.4, 14.0, 1.6), rot=(1.0, 0, -76), lens=26),
    'mobile': dict(loc=(0.0, 6.0, 1.7), rot=(7.0, 0, 0), lens=20),
}


def make_cam(name, loc, rot, lens):
    cd = bpy.data.cameras.new('cam_' + name); cd.lens = lens; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 400
    ob = AA.link(bpy.data.objects.new('cam_' + name, cd)); ob.location = loc; ob.rotation_euler = (math.radians(90 + rot[0]), math.radians(rot[1]), math.radians(rot[2])); return ob


def cameras():
    cams = {k: make_cam(k, v['loc'], v['rot'], v['lens']) for k, v in CAMS.items()}
    cams['dolly'] = make_cam('dolly', CAMS['main']['loc'], CAMS['main']['rot'], CAMS['main']['lens'])         # пролёт 5–7 с: широкий план → скульптура
    return cams


def dolly_pose(t):
    """t 0..1 → положение, наклон, фокус (S-образная кривая); конец — ось по центру скульптуры"""
    u = t * t * t * (t * (t * 6 - 15) + 10)
    return (0.0, 1.0 + (7.2 - 1.0) * u, 1.7 + .3 * u), (2.5 + 2.5 * u, 0, 0), 24 + 6 * u


def set_dolly(cams, t):
    loc, rot, lens = dolly_pose(t); c = cams['dolly']; c.location = loc; c.rotation_euler = (math.radians(90 + rot[0]), 0, 0); c.data.lens = lens


def setup(w, h, spp):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    S.settings(sc, w, h, spp); sc.view_settings.exposure = E('EXPO', -.55); sc.view_settings.look = os.environ.get('LOOK_AT', 'None')
    sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ.get('AT_THREADS', 2))
    cy = sc.cycles; b = int(os.environ.get('AT_BOUNCES', 6)); cy.max_bounces = b; cy.diffuse_bounces = min(4, b); cy.glossy_bounces = min(3, b); cy.transmission_bounces = 4; cy.transparent_max_bounces = 8
    cy.sample_clamp_indirect = 5; cy.sample_clamp_direct = 0; cy.use_adaptive_sampling = True; cy.adaptive_threshold = float(os.environ.get('AT_ADAPT', .02)); cy.adaptive_min_samples = 8; cy.denoising_prefilter = 'FAST'
    return sc


def main():
    cam = os.environ.get('AT_CAM', 'main'); mobile = cam == 'mobile'
    w = int(os.environ.get('AT_W', 960 if MODE == 'preview' else 2400)); h = int(os.environ['AT_H']) if os.environ.get('AT_H') else round(w * (3 / 2 if mobile else 9 / 16))
    spp = int(os.environ.get('AT_SPP', 24 if MODE == 'preview' else 96))
    sc = setup(w, h, spp); build(); lights(); cams = cameras()
    cr = os.environ.get('CROP')
    if cr and MODE == 'preview':
        x0, x1, y0, y1 = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.use_crop_to_border = True; sc.render.border_min_x = x0; sc.render.border_max_x = x1; sc.render.border_min_y = y0; sc.render.border_max_y = y1
    print('сцена: объектов %d, кадр %dx%d, %d сэмплов, камера %s' % (len(bpy.data.objects), w, h, spp, cam), flush=True)
    if MODE == 'preview':
        sc.camera = cams[cam]; sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/at_preview.png'); bpy.ops.render.render(write_still=True); print('preview done'); return
    if MODE == 'still':
        sc.camera = cams[cam]; raw = os.environ.get('AT_RAW', '/tmp/at_%s.png' % cam); n = int(os.environ.get('AT_TILES', 1))
        if n > 1:
            import academy_hall as AH
            AH.render_tiles(sc, raw, n)
        else: sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
        print('готово', raw, flush=True); return
    if MODE == 'seq':
        n = int(os.environ.get('AT_FRAMES', 40)); a = int(os.environ.get('AT_FROM', 0)); b = int(os.environ.get('AT_TO', n - 1)); out = os.environ.get('AT_SEQDIR', '/tmp/at_seq'); os.makedirs(out, exist_ok=True)
        pre = os.environ.get('AT_PREFIX', 'main'); sc.camera = cams['dolly']; sc.cycles.seed = 7; sc.cycles.use_animated_seed = False
        for i in range(a, b + 1):
            f = os.path.join(out, '%s_%03d.png' % (pre, i))
            if os.path.exists(f): continue
            set_dolly(cams, i / (n - 1)); sc.render.filepath = f + '.tmp.png'; bpy.ops.render.render(write_still=True); os.replace(f + '.tmp.png', f); print('кадр %d/%d готов' % (i + 1, n), flush=True)
        return
    if MODE == 'save':
        save_blend(sc, cams)


def save_blend(sc, cams):
    """ASTREYA_COMPANY_ATRIUM.blend (камеры + анимация пролёта, 150 кадров при 24 к/с) и company_atrium.glb"""
    sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = 150
    c = cams['dolly']; frames = list(range(1, 150, 6)) + [150]
    for fr in frames:
        set_dolly(cams, (fr - 1) / 149); c.keyframe_insert('location', frame=fr); c.keyframe_insert('rotation_euler', frame=fr); c.data.keyframe_insert('lens', frame=fr)
    sc.frame_set(1); sc.camera = cams['main']
    out = os.environ.get('AT_BLEND', os.path.join(HERE, 'ASTREYA_COMPANY_ATRIUM.blend')); bpy.ops.wm.save_as_mainfile(filepath=out, compress=True); print('blend →', out, os.path.getsize(out) // 1024, 'КБ')
    glb = os.environ.get('AT_GLB', os.path.join(HERE, '..', '..', '..', 'assets', 'company', 'company_atrium.glb')); os.makedirs(os.path.dirname(glb), exist_ok=True)
    kw = dict(filepath=glb, export_format='GLB', export_apply=True, export_cameras=False, export_lights=False, export_image_format='JPEG', export_jpeg_quality=80)
    try: bpy.ops.export_scene.gltf(**kw, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    except Exception as e:
        print('draco недоступно:', e); bpy.ops.export_scene.gltf(**kw)
    print('glb →', glb, os.path.getsize(glb) // 1024, 'КБ')


if __name__ == '__main__':
    main()
