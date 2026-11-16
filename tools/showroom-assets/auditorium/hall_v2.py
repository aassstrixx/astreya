#!/usr/bin/env python3
"""Зал учебного центра «Астрея» — вторая версия главного кадра страницы «Обучение» (Blender 5 / Cycles, CPU): качество и цветокор «как у атриума» (tools/showroom-assets/atrium).

Композиция прежняя (экран с логотипом по центру, стеллажи в нишах, кафедра слева от экрана, ряды синих и песочных кресел, цветы, кольца потолка, камера (0, 0,2, 1,25),
объектив 26 мм) — на неё опирается вёрстка страницы (css/academy.css .ac-hall, hall-m). Что другое, чем в academy_auditorium.py:
  * камень из пака CC0 (tools/showroom-assets/textures) с bump/roughness: травертин (стены, пол, сцена, цоколи), известняк-штукатурка (пилястры, потолок), рецепты — как у атриума;
  * пилястры и колонны — настоящие каннелюры (синус-профиль, плавное затенение), база и капитель, а не рельеф-«обманка» — читаются чёткими и объёмными;
  * окна по углам — настоящие арочные проёмы в толще стены (≈ 45 см), латунный переплёт, стекло и нейтральный светлый вид (window_view.jpg из make_view.py: небо, дымка, город, деревья) вместо синей «шторки»;
  * кресла: ткань с рисунком плетения и бампом — кремовый лён (linen-cream-weave) и тёмно-синий лён (linen-blue-ph, перекрашен в #16223e), латунные ножки как раньше;
  * свет: мягкий дневной из больших окон/сверху нейтрально-белый + тёплые акценты (кольца, ниши, прожекторы) приглушены — без жёлтого налёта; без глубины резкости (DOF), фильтр пикселя 1,0;
  * AgX «Punchy» (как у атриума), сырой кадр уходит в finish_hall.py (контраст L, regrade_site.py → a ≈ 0,8, b ≈ 10,5).
Экран с логотипом — прежний screen.png (make_screen.py), логотип и тексты не перерисовываются.

Запуск (из этой папки, python3 с модулем bpy):
  python3 hall_v2.py preview            быстрый кадр (HV_W=1280, HV_SPP=24 → /tmp/hv_preview.png); CROP=x0,x1,y0,y1 (доли кадра)
  python3 hall_v2.py still              итоговый кадр (HV_W=3840, HV_SPP=…, HV_TILES=N вертикальных полос с возобновлением → HV_RAW=/tmp/hv_raw.png)
  python3 hall_v2.py save               только сохранить ASTREYA_ACADEMY_HALL.blend (HV_BLEND)
Переменные: HV_W, HV_SPP, HV_TILES, HV_THREADS (2), EXPO (−0,55), LOOK_HV ('AgX - Punchy'), HV_SKY (дневной свет), HV_WARM (тёплые акценты), HV_WIN (яркость вида в окнах), HV_LED (кольца), HV_NICHE, SCREEN_K."""
import bpy, math, os, sys, random
HERE = os.path.dirname(os.path.abspath(__file__)); SA = os.path.join(HERE, '..'); sys.path.insert(0, HERE); sys.path.insert(0, SA)
import scene as S
import academy_auditorium as AA
from mathutils import Vector

os.environ.setdefault('SCREEN_K', '5.5')         # яркость экрана (AA.screen_mat читает SCREEN_K): под AgX «Punchy» и EXPO −0,55 экран светлый, без пересвета логотипа
ARGS = [a for a in sys.argv[1:] if not a.startswith('-')]
MODE = ARGS[0] if ARGS else 'preview'
E = AA.E
YB = AA.YB            # задняя стена (14,4)
ZC = AA.ZC            # высота потолка у стен (8,0)
VIEW = os.path.join(HERE, 'window_view.jpg')
WIN = []                                    # положения окон (центр, нормаль внутрь) — для света


# ───────────── материалы ─────────────
def seams(m, size=1.2, mortar=.007, dark=.84, var=(.985, .965, .945)):
    """швы крупноформатной плитки и лёгкий разброс тона плит (как у пола атриума): кирпичная текстура в координатах объекта умножается на цвет материала"""
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


def tone(m, sat=1.0, val=1.0):
    """Hue/Saturation/Value перед входом Base Color: приглушить насыщенность камня (травертин пака заметно жёлто-персиковый — под нейтрально-молочный тон сайта)"""
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = next(n for n in N if n.bl_idname == 'ShaderNodeBsdfPrincipled'); src = b.inputs['Base Color']
    hs = N.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = sat; hs.inputs['Value'].default_value = val
    if src.links: l = src.links[0]; L.new(l.from_socket, hs.inputs['Color']); L.remove(l)
    else: hs.inputs['Color'].default_value = src.default_value
    L.new(hs.outputs['Color'], b.inputs['Base Color']); return m


def _img(nt, slug, fn, cs):
    n = nt.nodes.new('ShaderNodeTexImage'); img = bpy.data.images.load(os.path.join(AA.TEX, slug, fn), check_existing=True); img.colorspace_settings.name = cs; n.image = img; n.interpolation = 'Cubic'; return n


def fabric(name, slug, tile, target=None, hsv_to=None, bump=.5, nstr=1.2, sheen=.4, sheen_tint=(1, .95, .88), spec=.25, rough_mul=1.0):
    """обивка с рисунком плетения: цвет, нормаль и бамп (disp) из библиотеки CC0; target — подтянуть средний цвет к #hex умножением, hsv_to — перекрасить через Hue/Sat/Value
    (как velvet в chairs.py: целевой hex → HSV). UV кресла — в метрах, tile — размер повтора текстуры (м); рисунок слегка увеличен, чтобы плетение читалось на расстоянии"""
    import colorsys
    sys.path.insert(0, HERE); import chairs as CH
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); L = nt.links; N = nt.nodes
    out = N.new('ShaderNodeOutputMaterial'); b = N.new('ShaderNodeBsdfPrincipled'); L.new(b.outputs['BSDF'], out.inputs['Surface'])
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / tile,) * 3; L.new(tc.outputs['UV'], mp.inputs['Vector'])
    col = _img(nt, slug, 'color.jpg', 'sRGB'); L.new(mp.outputs[0], col.inputs['Vector']); mean = CH._tex_mean_lin(slug)
    if hsv_to:
        hs0, ss0, vs0 = colorsys.rgb_to_hsv(*mean); ht, st, vt = colorsys.rgb_to_hsv(*CH._hex_lin(hsv_to))
        hsv = N.new('ShaderNodeHueSaturation'); hsv.inputs['Hue'].default_value = (ht - hs0 + .5) % 1.0; hsv.inputs['Saturation'].default_value = min(2.0, (st / ss0 if ss0 else 1.0) * E('HV_NAVY_SAT', 1.35)); hsv.inputs['Value'].default_value = vt / vs0 * E('HV_NAVY_V', .85)
        L.new(col.outputs['Color'], hsv.inputs['Color']); c = hsv.outputs['Color']
    else:
        ratio = tuple(t / x for t, x in zip(CH._hex_lin(target), mean)); mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1.0; mx.inputs['Color2'].default_value = (*ratio, 1)
        L.new(col.outputs['Color'], mx.inputs['Color1']); c = mx.outputs['Color']
    oi = N.new('ShaderNodeObjectInfo'); ind = N.new('ShaderNodeMapRange'); ind.inputs['To Min'].default_value = .94; ind.inputs['To Max'].default_value = 1.05; L.new(oi.outputs['Random'], ind.inputs['Value'])
    mx2 = N.new('ShaderNodeMixRGB'); mx2.blend_type = 'MULTIPLY'; mx2.inputs['Fac'].default_value = 1.0; L.new(c, mx2.inputs['Color1']); L.new(ind.outputs['Result'], mx2.inputs['Color2']); L.new(mx2.outputs['Color'], b.inputs['Base Color'])
    rg = _img(nt, slug, 'rough.jpg', 'Non-Color'); L.new(mp.outputs[0], rg.inputs['Vector'])
    rm = N.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'; rm.use_clamp = True; rm.inputs[1].default_value = rough_mul; L.new(rg.outputs['Color'], rm.inputs[0]); L.new(rm.outputs[0], b.inputs['Roughness'])
    nr = _img(nt, slug, 'normal.jpg', 'Non-Color'); L.new(mp.outputs[0], nr.inputs['Vector']); nm = N.new('ShaderNodeNormalMap'); nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = nstr; L.new(nr.outputs['Color'], nm.inputs['Color'])
    dp = _img(nt, slug, 'disp.jpg', 'Non-Color'); L.new(mp.outputs[0], dp.inputs['Vector']); bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = .002
    L.new(dp.outputs['Color'], bp.inputs['Height']); L.new(nm.outputs['Normal'], bp.inputs['Normal']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    AA._set(b, spec, 'Specular IOR Level', 'Specular'); AA._set(b, sheen, 'Sheen Weight', 'Sheen'); AA._set(b, .5, 'Sheen Roughness'); AA._set(b, (*sheen_tint, 1), 'Sheen Tint')
    return m


def materials():
    M = {}
    TRA = '#fff6e8'; SAT = E('HV_SAT', .78)
    M['wall'] = tone(AA.weather(AA.pbr('hv_wall', 'limestone-tiles-warm', tile=E('HV_WALL_TILE', 2.8), tint='#fffaf0', bump=.35), color_var=.04, cscale=.6, bump=.2, bscale=180), sat=E('HV_WALL_SAT', .55), val=1.10)     # известняк: крупные плиты со швами и порами
    M['panel'] = AA.weather(AA.pbr('hv_panel', 'plaster-light-smooth', tile=2.6, tint='#f7f2e6', rough=.34, coat=.25, bump=.10), color_var=.035, cscale=.7, bump=.25)
    M['floor'] = tone(seams(AA.weather(AA.pbr('hv_floor', 'travertine-ivory', tile=3.0, tint=TRA, coat=.75, bump=.12), color_var=.045, cscale=.4, rvar=.08, rscale=.35), size=1.2), sat=SAT)
    M['stage'] = tone(AA.weather(AA.pbr('hv_stage', 'travertine-ivory', tile=2.2, tint='#fbf1e0', coat=.45, bump=.10), color_var=.04, cscale=.6, rvar=.08, rscale=.4), sat=SAT)
    M['pil'] = AA.weather(AA.pbr('hv_pilaster', 'plaster-light-smooth', tile=2.2, tint='#faf5ea', rough=.50, bump=.14), color_var=.04, cscale=.8, bump=.35)
    M['tra'] = tone(AA.weather(AA.pbr('hv_travertine', 'travertine-ivory', tile=2.6, tint=TRA, coat=.35, bump=.18), color_var=.05, cscale=.5, rvar=.10, rscale=.35), sat=SAT)
    M['lac'] = AA.flat('hv_lacquer', '#f3ecdd', rough=.22, coat=.6)
    M['ceil'] = AA.weather(AA.pbr('hv_ceiling', 'plaster-light-smooth', tile=3.0, tint='#f3eee4', rough=.55, bump=.10), color_var=.03, cscale=.6)
    M['brass'] = tone(AA.pbr('hv_brass', 'brass-brushed-pale', tile=.6, tint='#f3e6cb', rough=.26, metal=1.0, bump=.2), sat=E('HV_BRASS_SAT', .78), val=1.04)
    M['champ'] = AA.pbr('hv_champagne', 'gold-matte-champagne', tile=.5, tint='#fff1d6', rough=.34, metal=1.0, bump=.1)
    M['gold'] = AA.flat('hv_gold', '#caa766', rough=.2, metal=1.0)
    M['seam'] = AA.flat('hv_seam', '#cfae6c', rough=.2, metal=1.0)
    M['dark'] = AA.flat('hv_dark', '#12192a', rough=.35)
    M['mirror'] = AA.flat('hv_mirror', '#c9b08c', rough=.06, metal=1.0)
    M['gl'] = AA.glass('hv_glass')
    k = E('HV_LED', 16.0)
    M['ledw'] = AA.led('hv_led', (1.0, .86, .68), k)                     # кольца потолка и карниз: тёплый белый, не оранжевый
    M['ledf'] = AA.led('hv_led_floor', (1.0, .88, .72), 4.0)
    M['ledn'] = AA.led('hv_led_niche', (1.0, .90, .76), E('HV_NICHE', 22.0))
    M['niche'] = AA.flat('hv_niche_back', '#f2e8d4', rough=.4)
    nb = M['niche'].node_tree.nodes['Principled BSDF']; AA._set(nb, (1.0, .92, .78, 1), 'Emission Color', 'Emission'); AA._set(nb, E('HV_NICHE_BACK', 1.1), 'Emission Strength')
    M['screen'] = AA.screen_mat(os.path.join(HERE, 'screen.png'))
    # вид в окнах: светящаяся плоскость с картинкой (процедурный пейзаж make_view.py)
    m = bpy.data.materials.new('hv_view'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    o = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = E('HV_WIN', 4.5); L.new(em.outputs[0], o.inputs['Surface'])
    t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(VIEW); t.image.colorspace_settings.name = 'sRGB'; t.extension = 'EXTEND'; t.interpolation = 'Cubic'; L.new(t.outputs['Color'], em.inputs['Color']); M['view'] = m
    return M


# ───────────── геометрия ─────────────
def fluted_panel(name, mat, xa, xb, y_wall, depth, z0, z1, nf, fd=.024, per=10):
    """каннелированная пилястра: фасад — синус-профиль по X (nf желобков; гребни у плоскости y_wall − depth, желобки уходят к стене на fd), гладкое затенение; сзади — стена.
    nf нечётное: по оси пилястры — гребень (латунная вставка садится на него)"""
    n = nf * per; verts = []
    for z in (z0, z1):
        for i in range(n + 1):
            g = .5 + .5 * math.cos(2 * math.pi * nf * i / n); verts.append((xa + (xb - xa) * i / n, y_wall - depth + fd * (g ** 1.6), z))
    nv = n + 1; ib = len(verts); verts += [(xa, y_wall, z0), (xb, y_wall, z0), (xa, y_wall, z1), (xb, y_wall, z1)]
    faces = [(i, i + 1, nv + i + 1, nv + i) for i in range(n)]
    faces += [(0, ib, ib + 2, nv), (n, nv + n, ib + 3, ib + 1)]                                  # торцы
    faces += [tuple([nv + i for i in range(n + 1)] + [ib + 3, ib + 2]), tuple([i for i in range(n + 1)] + [ib + 1, ib])]       # верх и низ
    ob = AA.mesh(name, verts, faces, mat)
    for p in ob.data.polygons[:n]: p.use_smooth = True
    return ob


def pilaster(s, M, xa, xb, depth, nf, tag, base_h=.34, cap_h=.30):
    """пилястра/колонна с базой и капителью (как колоннада атриума): ствол с каннелюрами, база и капитель — травертин"""
    a, b = (min(xa * s, xb * s), max(xa * s, xb * s)); zb = .35 + base_h; zt = ZC - cap_h - .35
    fluted_panel('hv_%s_shaft%d' % (tag, s), M['pil'], a + .03, b - .03, YB, depth, zb, zt, nf)
    AA.box('hv_%s_base%d' % (tag, s), M['tra'], a, b, YB - depth - .05, YB, .35, zb, bevel=.018)
    AA.box('hv_%s_cap%d' % (tag, s), M['tra'], a - .02, b + .02, YB - depth - .06, YB, zt, ZC - .35, bevel=.018)


def fix_normals(ob):
    import bmesh
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free(); ob.data.update()


def window(s, M):
    """угловое окно в скошенной стене: проём-арка 3,3 × 6,2 м в толще стены, латунный переплёт, стекло и светящаяся «улица» за ним"""
    x0, y0, x1, y1 = 7.3 * s, YB, 10.4 * s, 11.3
    ln = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / ln, (y1 - y0) / ln; nx, ny = -uy, ux; cx_, cy_ = (x0 + x1) / 2, (y0 + y1) / 2
    if nx * (0 - cx_) + ny * (6 - cy_) < 0: nx, ny = -nx, -ny                                  # нормаль внутрь зала

    def P(px, d, z): return (cx_ + ux * px + nx * d, cy_ + uy * px + ny * d, z)
    T = .45                                                                                    # толщина стены
    hw = ln / 2; H = ZC + 2
    slab = AA.mesh('hv_chamfer%d' % s, [P(-hw, 0, 0), P(hw, 0, 0), P(hw, -T, 0), P(-hw, -T, 0), P(-hw, 0, H), P(hw, 0, H), P(hw, -T, H), P(-hw, -T, H)],
                   [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], M['wall']); fix_normals(slab)
    pts = AA.arch_pts(3.3, .35, 4.9, n=40); n_ = len(pts)
    cut = AA.mesh('hv_cut%d' % s, [P(px, -T - .5, pz) for px, pz in pts] + [P(px, .3, pz) for px, pz in pts], [tuple(range(n_ - 1, -1, -1)), tuple(range(n_, 2 * n_))] + [(i, (i + 1) % n_, n_ + (i + 1) % n_, n_ + i) for i in range(n_)], None); fix_normals(cut)
    bm = slab.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'; cut.hide_render = True; cut.hide_viewport = True
    # латунная окантовка по краю проёма и тонкий LED-контур
    czm = sum(p[1] for p in pts) / n_
    for tag, mat, dd, tt, dep in (('frame', M['brass'], .06, .07, .05), ('led', M['ledw'], .075, .035, .02)):
        out = []
        for i, (px, pz) in enumerate(pts):
            qx, qz = pts[(i + 1) % n_]; rx, rz = pts[i - 1]; tx, tz = qx - rx, qz - rz; l_ = math.hypot(tx, tz) or 1; ax, az = tz / l_, -tx / l_
            if ax * px + az * (pz - czm) < 0: ax, az = -ax, -az
            out.append((px + ax * tt, pz + az * tt))
        verts = [P(px, dd, pz) for px, pz in pts] + [P(px, dd, pz) for px, pz in out] + [P(px, dd - dep, pz) for px, pz in pts] + [P(px, dd - dep, pz) for px, pz in out]
        faces = [(i, (i + 1) % n_, n_ + (i + 1) % n_, n_ + i) for i in range(n_)]
        faces += [(2 * n_ + i, 3 * n_ + i, 3 * n_ + (i + 1) % n_, 2 * n_ + (i + 1) % n_) for i in range(n_)]
        faces += [(n_ + i, n_ + (i + 1) % n_, 3 * n_ + (i + 1) % n_, 3 * n_ + i) for i in range(n_)]
        faces += [(i, (i + 1) % n_, 2 * n_ + (i + 1) % n_, 2 * n_ + i) for i in range(n_)]
        AA.mesh('hv_win_%s%d' % (tag, s), verts, faces, mat, bevel=.004 if tag == 'frame' else 0.0)
    # стекло и переплёт (латунь шампань): две вертикали и две перекладины
    AA.mesh('hv_win_glass%d' % s, [P(px, -.12, pz) for px, pz in pts], [tuple(range(n_))], M['gl'])
    R = 1.65
    for px in (-.55, .55):
        zt = 4.9 + math.sqrt(max(.01, R * R - px * px)) - .02
        bar = [P(px - .018, -.10, .38), P(px + .018, -.10, .38), P(px + .018, -.17, .38), P(px - .018, -.17, .38), P(px - .018, -.10, zt), P(px + .018, -.10, zt), P(px + .018, -.17, zt), P(px - .018, -.17, zt)]
        AA.mesh('hv_win_mull%d_%d' % (s, int(px * 100)), bar, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], M['champ'], bevel=.003)
    for zz in (2.6, 4.9):
        hh = R if zz > 4 else 1.65
        bar = [P(-hh, -.10, zz - .018), P(hh, -.10, zz - .018), P(hh, -.17, zz - .018), P(-hh, -.17, zz - .018), P(-hh, -.10, zz + .018), P(hh, -.10, zz + .018), P(hh, -.17, zz + .018), P(-hh, -.17, zz + .018)]
        AA.mesh('hv_win_trans%d_%d' % (s, int(zz * 10)), bar, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], M['champ'], bevel=.003)
    # улица: плоскость 12 × 12 м за проёмом (горизонт на высоте глаза камеры z = 1,25 м; по оси проёма), смотрит в зал
    D = 9.0; zlo, zhi = -1.0, 11.0
    q = AA.quad('hv_view%d' % s, M['view'], P(-6, -D, zlo), P(6, -D, zlo), P(6, -D, zhi), P(-6, -D, zhi))
    um = q.data.uv_layers.new(name='UVMap')
    for i, lp in enumerate(q.data.loops):
        v = q.data.vertices[lp.vertex_index].co; px = (v.x - cx_) * ux + (v.y - cy_) * uy; um.data[i].uv = ((px + 6) / 12.0, (v.z - zlo) / (zhi - zlo))
    if s == -1:                                                                                    # слева картинку зеркалим, чтобы вид не повторялся «копией»
        for d in um.data: d.uv = (1 - d.uv[0], d.uv[1])
    WIN.append((cx_, cy_, nx, ny))


def build():
    M = materials()
    sx, sz0, sz1 = 8.0, 1.2, 5.7                                                     # экран 8 × 4.5 м
    AA.box('aud_floor', M['floor'], -10.7, 10.7, -8, YB + .3, -0.2, 0.0, 0)
    AA.box('aud_stage', M['stage'], -9.6, 9.6, 10.2, YB, 0.0, .35, .012)
    AA.box('aud_step', M['lac'], -9.9, 9.9, 9.55, 10.2, 0.0, .17, .01)
    AA.box('aud_stage_led', M['ledf'], -9.6, 9.6, 10.18, 10.2, .34, .345, 0)
    AA.box('aud_step_led', M['ledf'], -9.9, 9.9, 9.53, 9.55, .15, .155, 0)
    AA.box('aud_back', M['wall'], -7.45, 7.45, YB, YB + .3, 0, ZC + 2, 0)
    for s in (-1, 1):
        AA.box('aud_wall_side%d' % s, M['wall'], min(10.4 * s, 10.7 * s), max(10.4 * s, 10.7 * s), -8, 11.4, 0, ZC + 2, 0)
        window(s, M)
    # латунные швы пола (по стыкам плит 1,2 м)
    for i in range(-8, 9): AA.box('aud_seam_x%d' % i, M['seam'], i * 1.2 - .006, i * 1.2 + .006, -8, 9.55, .0, .0024, 0)
    for j in range(-6, 8): AA.box('aud_seam_y%d' % j, M['seam'], -10.7, 10.7, j * 1.2 - .006, j * 1.2 + .006, .0, .0024, 0)
    # панель за экраном, экран, рамка
    AA.box('aud_back_panel', M['panel'], -4.5, 4.5, YB - .12, YB, .35, 6.6, .02)
    fw = .07; yy0, yy1 = YB - .30, YB - .16
    AA.box('aud_scr_fr_top', M['dark'], -sx / 2 - fw, sx / 2 + fw, yy0, yy1, sz1, sz1 + fw, .006); AA.box('aud_scr_fr_bot', M['dark'], -sx / 2 - fw, sx / 2 + fw, yy0, yy1, sz0 - fw, sz0, .006)
    AA.box('aud_scr_fr_l', M['dark'], -sx / 2 - fw, -sx / 2, yy0, yy1, sz0, sz1, .006); AA.box('aud_scr_fr_r', M['dark'], sx / 2, sx / 2 + fw, yy0, yy1, sz0, sz1, .006)
    AA.quad('aud_screen', M['screen'], (-sx / 2, YB - .19, sz0), (sx / 2, YB - .19, sz0), (sx / 2, YB - .19, sz1), (-sx / 2, YB - .19, sz1))
    sc_ob = bpy.data.objects['aud_screen']; um = sc_ob.data.uv_layers.new(name='UVMap')
    for i, lp in enumerate(sc_ob.data.loops):
        v = sc_ob.data.vertices[lp.vertex_index].co; um.data[i].uv = ((v.x + sx / 2) / sx, (v.z - sz0) / (sz1 - sz0))
    # пилястры, колонны (настоящие каннелюры), латунные вставки, ниши с полками (зеркально по x)
    for s in (-1, 1):
        def X(a, b): return (min(a * s, b * s), max(a * s, b * s))
        pilaster(s, M, 3.98, 4.62, .42, 5, 'pil')
        pilaster(s, M, 5.9, 6.95, .62, 7, 'col')
        for xb, w in ((4.3, .014), (6.42, .018)):
            x0, x1 = X(xb - w, xb + w); AA.box('aud_inlay%d_%.0f' % (s, xb * 10), M['brass'], x0, x1, YB - (.432 if xb < 5 else .632), YB - (.416 if xb < 5 else .616), .75, ZC - .8, 0)
        nx_c = 5.4 * s; pts = [(x + nx_c, z) for x, z in AA.lancet(1.05, .55, 5.0, 6.35)]
        AA.prism('aud_niche_back%d' % s, M['niche'], pts, YB - .06, YB - .04)
        AA.outline('aud_niche_frame%d' % s, M['brass'], pts, YB - .32, YB - .06, t=.045, bevel=.006)
        for sd in (-1, 1):
            xs = nx_c + sd * .525; AA.box('aud_niche_side%d_%d' % (s, sd), M['niche'], xs - .012, xs + .012, YB - .32, YB - .06, .55, 5.0, 0)
        AA.box('aud_niche_base%d' % s, M['lac'], nx_c - .56, nx_c + .56, YB - .34, YB - .04, .35, .55, .01)
        for sd in (-1, 1): AA.box('aud_niche_led_v%d_%d' % (s, sd), M['ledn'], nx_c + sd * .455 - .022, nx_c + sd * .455 + .022, YB - .305, YB - .285, .6, 5.1, 0)
        for k in range(7):
            zz = 1.0 + k * .62
            AA.box('aud_niche_led_f%d_%d' % (s, k), M['ledn'], nx_c - .46, nx_c + .46, YB - .318, YB - .292, zz - .032, zz - .014, 0)
            AA.box('aud_niche_led_b%d_%d' % (s, k), M['ledn'], nx_c - .46, nx_c + .46, YB - .105, YB - .078, zz - .05, zz - .014, 0)
        pm = [(x + nx_c, z) for x, z in AA.lancet(.84, 5.22, 5.3, 6.12)]
        AA.prism('aud_niche_mirror%d' % s, M['mirror'], pm, YB - .075, YB - .062)
    AA.box('aud_cornice', M['lac'], -9.0, 9.0, YB - .9, YB, ZC - .35, ZC, .03)
    AA.box('aud_cornice_led', M['ledw'], -9.0, 9.0, YB - .86, YB - .76, ZC - .37, ZC - .35, 0)
    AA.box('aud_cornice_brass', M['brass'], -9.0, 9.0, YB - .90, YB - .87, ZC - .35, ZC - .31, 0)
    # потолок и кольца
    AA.box('aud_ceiling', M['ceil'], -10.7, 10.7, -6, YB + .3, ZC + .4, ZC + .6, 0)
    cx, cy = 0.0, E('RING_CY', 5.5)
    rings = [(13.4, 9.6, ZC - 1.55), (11.4, 8.2, ZC - 1.22), (9.5, 6.9, ZC - .92), (7.7, 5.5, ZC - .6), (5.8, 4.0, ZC - .3), (4.0, 2.7, ZC - .02)]
    for i, (a, b, z) in enumerate(rings):
        AA.sweep('aud_ring%d' % i, M['lac'], cx, cy, z, a, b, [(-.12, 0), (.12, 0), (.12, -.30), (.05, -.42), (-.05, -.42), (-.12, -.30)], n=260, bevel=.008)
        AA.sweep('aud_ring_brass%d' % i, M['brass'], cx, cy, z, a, b, [(-.128, -.30), (-.05, -.425), (.05, -.425), (.128, -.30), (.128, -.28), (-.128, -.28)], n=260)
        AA.sweep('aud_ring_led%d' % i, M['ledw'], cx, cy, z, a - .06, b - .05, [(.14, .02), (.5, .02)], n=260)
        AA.sweep('aud_ring_ledlow%d' % i, M['ledw'], cx, cy, z, a, b, [(-.04, -.435), (.04, -.435)], n=260)
    AA.sweep('aud_dome_ring', M['gold'], cx, cy, ZC + .28, 2.2, 1.5, [(-.05, 0), (.05, 0), (.05, -.08), (-.05, -.08)], n=120)
    for i in range(22):
        t = 2 * math.pi * i / 22; bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.075, depth=.03, location=(cx + 3.6 * math.cos(t), cy + 2.4 * math.sin(t), ZC + .37)); o = bpy.context.object; o.name = 'aud_spot%d' % i; o.data.materials.append(M['ledw'])
    # кресла (ткань с плетением — материалы под именами, которые ищет chairs.py), кафедра, цветы, стеллажи
    fabric('aud_chair_boucle_cream', 'linen-cream-weave', tile=E('HV_WEAVE', .42), target=(0xde, 0xd4, 0xc2), bump=E('HV_WBUMP', .45), nstr=.9, sheen=.40, spec=.20)
    fabric('aud_chair_velvet_navy', 'linen-blue-ph', tile=E('HV_WEAVE_N', .95), hsv_to=(0x16, 0x22, 0x3e), bump=E('HV_WBUMP', .55) * .8, nstr=1.0, sheen=.22, sheen_tint=(.22, .34, .75), spec=.22, rough_mul=.9)
    import props as PR, chairs as CH
    lc = PR.lectern('aud_lectern', (-E('LECT_X', 2.75), 12.4, 0.35), yaw=math.radians(10))
    for o in (lc if isinstance(lc, (list, tuple)) else [lc]):
        if o is not None: o.scale = (1.3, 1.3, 1.3)
    PR.chrome_vase_with_flowers('aud_vase_L', (-E('VASE_X', 5.7), 10.7, .35), scale=E('VASE_S', 1.3), seed=1); PR.chrome_vase_with_flowers('aud_vase_R', (E('VASE_X', 5.7), 10.7, .35), scale=E('VASE_S', 1.3), seed=2)
    PR.orchid_vase('aud_orchid', (-4.55, 12.2, .35), seed=3)
    for s in (-1, 1): PR.shelf_unit('aud_shelf%d' % s, (5.4 * s, YB - .07, 0), width=.98, height=5.0, shelves=7, seed=4 + s, prop_scale=E('PROP_S', 1.9))
    CH.place_rows(rows_y=[float(v) for v in os.environ.get('ROWS_Y', '1.8,2.8,3.8,4.8,5.8,6.8,7.8,8.8').split(',')], x_ranges=[(-8.3, -1.05), (1.05, 8.3)], step_x=.66, seed=7)
    return M


# ───────────── свет ─────────────
def lights(M):
    k = E('HV_SKY', 1.3); wk = E('HV_WARM', .55)
    AA.area('hv_sky', (0, 5.5, ZC - 1.0), (0, 6, 0), 900 * k, 16, 11, (1.0, .965, .91))                  # мягкий дневной свет (большое окно-фонарь над залом)
    AA.area('hv_stage', (0, 10.8, ZC - .6), (0, 13.5, 1.5), 620 * k, 14, 3, (1.0, .96, .90))             # заливка сцены и стены за экраном
    for i, (wx, wy, nx, ny) in enumerate(WIN):
        AA.area('hv_win_l%d' % i, (wx + nx * .9, wy + ny * .9, 3.4), (wx + nx * 6.0, wy + ny * 6.0, 1.2), E('HV_WINL', 1700) * k, 3.0, 5.0, (1.0, .975, .94))   # дневной свет из угловых окон: мягкие косые тени колонн/кресел
    AA.spot('hv_spot_screen', (0, 8.5, ZC - .2), (0, 14.1, 3.4), E('SPOT_SCREEN', 1500) * wk, 60, .8, (1.0, .95, .88))
    for ix, x in enumerate((-6.4, -3.3, 3.3, 6.4)):                                                       # потолочные даунлайты: тёплые акценты и читаемые тени кресел на полированном полу
        for iy, y in enumerate((1.2, 4.4, 7.6)):
            AA.spot('hv_down_%d_%d' % (ix, iy), (x, y, ZC - 1.7), (x * .86, y + 1.4, 0.0), E('DOWN_K', 950) * wk, E('DOWN_ANG', 62), .72, (1.0, .94, .86), radius=.16)
    for s in (-1, 1):
        AA.spot('hv_spot_vase%d' % s, (6.0 * s, 8.5, ZC - .3), (7.3 * s, 11.4, .9), 900 * wk, 38, .7, (1.0, .93, .84))
        AA.spot('hv_spot_lect%d' % s, (3.0 * s, 9.0, ZC - .3), (3.2 * s, 12.6, 1.3), 520 * wk, 32, .7, (1.0, .93, .84))
    w = bpy.data.worlds.new('hv_w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.93, .92, .90, 1); bg.inputs['Strength'].default_value = E('WORLD', .05); bpy.context.scene.world = w
    for o in bpy.data.objects:
        if o.type == 'LIGHT': o.visible_camera = False                                                   # световые прямоугольники не должны попадать в кадр


def camera(sc):
    cd = bpy.data.cameras.new('hv_cam'); cd.lens = E('LENS', 26); cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 400
    cam = AA.link(bpy.data.objects.new('hv_cam', cd)); cam.location = (E('CAMX', 0.0), E('CAMY', .2), E('CAMZ', 1.25)); cam.rotation_euler = (math.radians(90 + E('PITCH', 5.5)), 0, 0); sc.camera = cam; return cam


def setup(w, h, spp):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    S.settings(sc, w, h, spp); sc.view_settings.exposure = E('EXPO', -.55); sc.view_settings.look = os.environ.get('LOOK_HV', 'AgX - Punchy')
    sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ.get('HV_THREADS', 2))
    cy = sc.cycles; b = int(os.environ.get('HV_BOUNCES', 6)); cy.max_bounces = b; cy.diffuse_bounces = min(4, b); cy.glossy_bounces = min(3, b); cy.transmission_bounces = 4; cy.transparent_max_bounces = 8
    cy.sample_clamp_indirect = 5; cy.sample_clamp_direct = 0; cy.use_adaptive_sampling = True; cy.adaptive_threshold = float(os.environ.get('HV_ADAPT', .015)); cy.adaptive_min_samples = 16
    cy.denoising_prefilter = 'ACCURATE'; cy.denoising_quality = 'HIGH'; cy.filter_width = float(os.environ.get('HV_FILTER', 1.0))                # чистое OIDN (альбедо + нормали, точный предфильтр), пиксельный фильтр уже, чем по умолчанию — резче поры камня
    return sc


def render_strips(sc, raw, n, ov=64):
    """расчёт вертикальными полосами с перекрытием (как academy_hall.render_tiles) и выбором полос HV_STRIPS=0,1 — длинный рендер режется на процессы ≤ 20–25 мин; готовые полосы пропускаются,
    когда все n полос лежат на диске, они склеиваются по точным пикселям в raw"""
    from PIL import Image
    W_, H_ = sc.render.resolution_x, sc.render.resolution_y; parts = []; only = os.environ.get('HV_STRIPS'); only = None if not only else [int(v) for v in only.split(',')]
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
    w = int(os.environ.get('HV_W', 1280 if MODE == 'preview' else 3840)); h = round(w * 9 / 16); spp = int(os.environ.get('HV_SPP', 24 if MODE == 'preview' else 96))
    sc = setup(w, h, spp); M = build(); lights(M); camera(sc)
    cr = os.environ.get('CROP')
    if cr and MODE == 'preview':
        x0, x1, y0, y1 = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.use_crop_to_border = True; sc.render.border_min_x = x0; sc.render.border_max_x = x1; sc.render.border_min_y = y0; sc.render.border_max_y = y1
    print('сцена: объектов %d, кадр %dx%d, %d сэмплов' % (len(bpy.data.objects), w, h, spp), flush=True)
    if MODE == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/hv_preview.png'); bpy.ops.render.render(write_still=True); print('preview done'); return
    if MODE == 'save':
        out = os.environ.get('HV_BLEND', os.path.join(HERE, 'ASTREYA_ACADEMY_HALL.blend')); bpy.ops.wm.save_as_mainfile(filepath=out, compress=True); print('blend →', out, os.path.getsize(out) // 1024, 'КБ'); return
    raw = os.environ.get('HV_RAW', '/tmp/hv_raw.png'); n = int(os.environ.get('HV_TILES', 1))
    if n > 1: render_strips(sc, raw, n)
    else: sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    print('готово', raw, flush=True)


if __name__ == '__main__':
    main()
