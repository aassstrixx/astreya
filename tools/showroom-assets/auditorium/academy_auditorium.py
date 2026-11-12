#!/usr/bin/env python3
"""Зал учебного центра «Астрея» — главная картинка страницы «Обучение» (Blender 5 / Cycles, CPU).

Повторяет референс владельца: светлый зал с концентрическими потолочными кольцами и тёплой LED-подсветкой, большой экран с нашим логотипом,
по бокам экрана — каннелированные белые пилястры с латунными вставками и узкие стрельчатые ниши со стеклянными полками и флаконами,
сзади по углам — арки с тёмно-синим стеклом, кафедра с микрофоном, хромированные вазы с белыми цветами, ряды кресел (тёмно-синие и кремовые,
латунные ножки), глянцевый кремовый пол. Материалы — из библиотеки CC0 (tools/showroom-assets/textures), кресла/реквизит/экран — модули рядом.

Запуск:  python3 academy_auditorium.py preview     (быстрый кадр 1280 px, /tmp/aud_preview.png)
         python3 academy_auditorium.py             (итог: AUD_W=3200, AUD_SPP=96, AUD_TILES=4 — полосы с возобновлением → /tmp/aud_full.png)
Переменные: AUD_W, AUD_SPP, AUD_TILES, CROP=x0,x1,y0,y1 (доли кадра, только preview), AUD_NOMOD=1 (без модулей кресел/реквизита), LENS, CAMY, CAMZ, PITCH, EXPO.
"""
import bpy, bmesh, math, os, sys, random
HERE = os.path.dirname(os.path.abspath(__file__)); SA = os.path.join(HERE, '..'); sys.path.insert(0, HERE); sys.path.insert(0, SA)
import scene as S
from mathutils import Vector

TEX = os.path.join(SA, 'textures')
ARGS = sys.argv[1:]; MODE = 'preview' if 'preview' in ARGS else 'final'


def E(n, d): return float(os.environ.get(n, d))


def lin(h):
    """#rrggbb → линейный RGB"""
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)


# ───────────────────────── материалы ─────────────────────────
def _pr(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']; return m, nt, b


def _set(b, val, *names):
    for n in names:
        if n in b.inputs:
            b.inputs[n].default_value = val; return


def flat(name, hexcol, rough=.4, metal=0.0, coat=0.0, ior=1.45, sheen=0.0):
    m, nt, b = _pr(name); _set(b, (*lin(hexcol), 1), 'Base Color'); _set(b, rough, 'Roughness'); _set(b, metal, 'Metallic'); _set(b, ior, 'IOR')
    if coat: _set(b, coat, 'Coat Weight', 'Clearcoat'); _set(b, .06, 'Coat Roughness', 'Clearcoat Roughness')
    if sheen: _set(b, sheen, 'Sheen Weight', 'Sheen')
    return m


def pbr(name, slug, tile=1.2, tint=None, rough=None, metal=None, coat=0.0, bump=.25, mix=1.0):
    """материал из библиотеки CC0: box-проекция в мировых координатах (все объекты имеют начало в 0), tile — размер плитки в метрах"""
    m, nt, b = _pr(name); N = nt.nodes; L = nt.links
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / tile,) * 3; L.new(tc.outputs['Object'], mp.inputs['Vector'])

    def img(fn, cs):
        p = os.path.join(TEX, slug, fn)
        if not os.path.exists(p): return None
        t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p); t.image.colorspace_settings.name = cs; t.projection = 'BOX'; t.projection_blend = .25; L.new(mp.outputs[0], t.inputs['Vector']); return t
    c = img('color.jpg', 'sRGB')
    if c:
        if tint is not None:
            mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = mix; mx.inputs['Color2'].default_value = (*lin(tint), 1); L.new(c.outputs['Color'], mx.inputs['Color1']); L.new(mx.outputs['Color'], b.inputs['Base Color'])
        else: L.new(c.outputs['Color'], b.inputs['Base Color'])
    if rough is None:
        r = img('rough.jpg', 'Non-Color')
        if r: L.new(r.outputs['Color'], b.inputs['Roughness'])
    else: _set(b, rough, 'Roughness')
    n = img('normal.jpg', 'Non-Color')
    if n:
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = bump; L.new(n.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    if metal is not None: _set(b, metal, 'Metallic')
    if coat: _set(b, coat, 'Coat Weight', 'Clearcoat'); _set(b, .05, 'Coat Roughness', 'Clearcoat Roughness')
    return m


def weather(m, color_var=0.0, cscale=1.3, bump=0.0, bscale=260.0, rvar=0.0, rscale=1.0, rstretch=.35):
    """«живость» поверхности: крупные неоднородности цвета (±color_var), микрорельеф штукатурки/камня (bump) и разводы глянца пола (roughness ± rvar,
    вытянуты вдоль зала — так выглядят следы мытья). Всё в мировых/объектных координатах, поверх существующих карт библиотеки CC0."""
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = next(n for n in N if n.bl_idname == 'ShaderNodeBsdfPrincipled'); tc = N.new('ShaderNodeTexCoord')
    if color_var:
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = cscale; nz.inputs['Detail'].default_value = 6; nz.inputs['Roughness'].default_value = .55; L.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .3; mr.inputs['From Max'].default_value = .7; mr.inputs['To Min'].default_value = 1 - color_var; mr.inputs['To Max'].default_value = 1 + color_var * .35; L.new(nz.outputs['Fac'], mr.inputs['Value'])
        mx = N.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1.0; src = b.inputs['Base Color']
        if src.links: l = src.links[0]; L.new(l.from_socket, mx.inputs['Color1']); L.remove(l)
        else: mx.inputs['Color1'].default_value = src.default_value
        L.new(mr.outputs['Result'], mx.inputs['Color2']); L.new(mx.outputs['Color'], b.inputs['Base Color'])
    if bump:
        n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = bscale; n2.inputs['Detail'].default_value = 8; n2.inputs['Roughness'].default_value = .7; L.new(tc.outputs['Object'], n2.inputs['Vector'])
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = .002; L.new(n2.outputs['Fac'], bp.inputs['Height']); nin = b.inputs['Normal']
        if nin.links: l = nin.links[0]; L.new(l.from_socket, bp.inputs['Normal']); L.remove(l)
        L.new(bp.outputs['Normal'], nin)
    if rvar:
        r0 = b.inputs['Roughness'].default_value; mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (rscale, rscale * rstretch, rscale); L.new(tc.outputs['Object'], mp.inputs['Vector'])
        n3 = N.new('ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 1.0; n3.inputs['Detail'].default_value = 5; n3.inputs['Roughness'].default_value = .6; L.new(mp.outputs[0], n3.inputs['Vector'])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .3; mr.inputs['From Max'].default_value = .7; mr.inputs['To Min'].default_value = max(.0, r0 - rvar * .7); mr.inputs['To Max'].default_value = r0 + rvar; L.new(n3.outputs['Fac'], mr.inputs['Value']); L.new(mr.outputs['Result'], b.inputs['Roughness'])
    return m


def led(name, rgb=(1.0, .72, .42), k=10.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*rgb, 1); em.inputs['Strength'].default_value = k
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], o.inputs['Surface']); return m


def glass(name, tint='#f4fbf8', rough=.02):
    """стекло: преломление, но тень проходит насквозь (иначе стекло в рендере «чернеет»)"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    o = N.new('ShaderNodeOutputMaterial'); pr = N.new('ShaderNodeBsdfPrincipled'); _set(pr, (*lin(tint), 1), 'Base Color'); _set(pr, rough, 'Roughness'); _set(pr, 1.0, 'Transmission Weight', 'Transmission'); _set(pr, 1.46, 'IOR')
    tr = N.new('ShaderNodeBsdfTransparent'); lp = N.new('ShaderNodeLightPath'); mx = N.new('ShaderNodeMixShader'); L.new(lp.outputs['Is Shadow Ray'], mx.inputs['Fac']); L.new(pr.outputs[0], mx.inputs[1]); L.new(tr.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], o.inputs['Surface'])
    return m


def screen_mat(path):
    m = bpy.data.materials.new('aud_screen'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    o = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = E('SCREEN_K', 4.0); L.new(em.outputs[0], o.inputs['Surface'])
    if os.path.exists(path):
        t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path); t.image.colorspace_settings.name = 'sRGB'; t.extension = 'EXTEND'; L.new(t.outputs['Color'], em.inputs['Color'])
    else: em.inputs['Color'].default_value = (.95, .92, .85, 1)
    return m


def fluted(name, hexcol, pitch=.14, depth=.9, rough=.28):
    """каннелюры: синус по оси X → рельеф (bump) и мягкая светотень гребней; база — слоновая кость, лак"""
    m, nt, b = _pr(name); N = nt.nodes; L = nt.links; _set(b, (*lin(hexcol), 1), 'Base Color'); _set(b, rough, 'Roughness'); _set(b, .55, 'Coat Weight', 'Clearcoat'); _set(b, .08, 'Coat Roughness', 'Clearcoat Roughness')
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sp.inputs[0])
    ph = N.new('ShaderNodeMath'); ph.operation = 'MULTIPLY'; ph.inputs[1].default_value = 2 * math.pi / pitch; L.new(sp.outputs['X'], ph.inputs[0])
    sn = N.new('ShaderNodeMath'); sn.operation = 'SINE'; L.new(ph.outputs[0], sn.inputs[0])
    bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = depth; bp.inputs['Distance'].default_value = .02; L.new(sn.outputs[0], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def curtain(name, hexcol, pitch=.45):
    """тёмно-синее стекло-«шторка» за аркой: матовое, слегка подсвеченное изнутри синим, мягкие вертикальные складки; почти без зеркальности,
    чтобы тёплый свет зала не «серил» цвет (глубокий синий, как в референсе)"""
    m = fluted(name, hexcol, pitch=pitch, depth=.22, rough=.38); b = m.node_tree.nodes['Principled BSDF']
    _set(b, 0.0, 'Coat Weight', 'Clearcoat'); _set(b, .12, 'Specular IOR Level', 'Specular'); _set(b, (.015, .05, .18, 1), 'Emission Color', 'Emission'); _set(b, E('NAVY_GLOW', .22), 'Emission Strength'); return m


# ───────────────────────── геометрия ─────────────────────────
def link(ob):
    bpy.context.collection.objects.link(ob); return ob


def mesh(name, verts, faces, mat=None, smooth=False, bevel=0.0, seg=2):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    if mat: me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if bevel:
        b = ob.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(35)
    return ob


def box(name, mat, x0, x1, y0, y1, z0, z1, bevel=.01):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh(name, v, f, mat, bevel=bevel)


def quad(name, mat, p0, p1, p2, p3):
    return mesh(name, [p0, p1, p2, p3], [(0, 1, 2, 3)], mat)


def sweep(name, mat, cx, cy, z, a, b, prof, n=200, bevel=0.0):
    """профиль prof=[(dr,dz),…] (dr — смещение наружу от эллипса, dz — по высоте), замкнутый обход эллипса (a, b) с центром (cx, cy) на высоте z"""
    verts = []; k = len(prof)
    for i in range(n):
        t = 2 * math.pi * i / n; px, py = cx + a * math.cos(t), cy + b * math.sin(t); nx, ny = math.cos(t) / a, math.sin(t) / b; ln = math.hypot(nx, ny); nx, ny = nx / ln, ny / ln
        for dr, dz in prof: verts.append((px + nx * dr, py + ny * dr, z + dz))
    faces = []
    for i in range(n):
        j = (i + 1) % n
        for q in range(k - 1): faces.append((i * k + q, j * k + q, j * k + q + 1, i * k + q + 1))
        faces.append((i * k + k - 1, j * k + k - 1, j * k, i * k))
    ob = mesh(name, verts, faces, mat, smooth=True)
    if bevel:
        b_ = ob.modifiers.new('bev', 'BEVEL'); b_.width = bevel; b_.segments = 2; b_.limit_method = 'ANGLE'
    return ob


def lancet(w, z0, zs, apex, n=18):
    """контур стрельчатой ниши (x,z): прямые стороны до zs, затем две дуги, сходящиеся в остриё на высоте apex; центр по x=0"""
    hw = w / 2; h = apex - zs; R = (hw * hw + h * h) / (2 * hw)          # радиус дуг, проходящих через (±hw, zs) и (0, apex)
    pts = [(-hw, z0), (hw, z0), (hw, zs)]
    # правая сторона: дуга с центром (−(R−hw), zs) от (hw, zs) до (0, apex)
    cx = hw - R; a0 = 0.0; a1 = math.atan2(h, -cx)
    for i in range(1, n + 1):
        a = a0 + (a1 - a0) * i / n; pts.append((cx + R * math.cos(a), zs + R * math.sin(a)))
    left = [(-x, z) for x, z in reversed(pts[3:-1])]
    return pts + left + [(-hw, zs)]


def prism(name, mat, pts_xz, y0, y1, bevel=.0, smooth=False):
    """прямая призма: контур в плоскости XZ, толщина по Y"""
    n = len(pts_xz); v = [(x, y0, z) for x, z in pts_xz] + [(x, y1, z) for x, z in pts_xz]
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh(name, v, f, mat, smooth=smooth, bevel=bevel)


def outline(name, mat, pts_xz, y0, y1, t=.03, bevel=.004):
    """рамка вдоль контура (внешняя — смещение контура наружу на t)"""
    n = len(pts_xz); cxm = sum(p[0] for p in pts_xz) / n; czm = sum(p[1] for p in pts_xz) / n; out = []
    for i, (x, z) in enumerate(pts_xz):
        px, pz = pts_xz[i - 1]; qx, qz = pts_xz[(i + 1) % n]; tx, tz = qx - px, qz - pz; ln = math.hypot(tx, tz) or 1; nx, nz = tz / ln, -tx / ln
        if nx * (x - cxm) + nz * (z - czm) < 0: nx, nz = -nx, -nz
        out.append((x + nx * t, z + nz * t))
    verts = [(x, y0, z) for x, z in pts_xz] + [(x, y0, z) for x, z in out] + [(x, y1, z) for x, z in pts_xz] + [(x, y1, z) for x, z in out]; faces = []
    for i in range(n):
        j = (i + 1) % n; faces += [(i, j, n + j, n + i), (2 * n + i, 3 * n + i, 3 * n + j, 2 * n + j), (n + i, n + j, 3 * n + j, 3 * n + i), (i, 2 * n + i, 2 * n + j, j)]
    return mesh(name, verts, faces, mat, bevel=bevel)


def arch_pts(w, z0, zs, n=24):
    """полуциркульная арка: прямые стороны до zs, затем полуокружность радиуса w/2"""
    hw = w / 2; pts = [(-hw, z0), (hw, z0)]
    for i in range(n + 1): a = math.pi * i / n; pts.append((hw * math.cos(a), zs + hw * math.sin(a)))
    return pts


def spot(name, loc, target, energy, size_deg=75, blend=.6, rgb=(1, .82, .62), radius=.05):
    d = bpy.data.lights.new(name, 'SPOT'); d.energy = energy; d.spot_size = math.radians(size_deg); d.spot_blend = blend; d.color = rgb; d.shadow_soft_size = radius
    o = link(bpy.data.objects.new(name, d)); o.location = loc; o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o


def area(name, loc, target, energy, sx, sy, rgb=(1, .84, .66)):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.shape = 'RECTANGLE'; d.size = sx; d.size_y = sy; d.color = rgb
    o = link(bpy.data.objects.new(name, d)); o.location = loc; o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o


# ───────────────────────── сборка ─────────────────────────
YB = 14.4                      # задняя стена
ZC = 8.0                       # условная высота потолка у стен


def build():
    M = dict(
        wall=pbr('aud_wall', 'plaster-light-smooth', 2.4, tint='#f6efe2', rough=.55, bump=.12),
        floor=pbr('aud_floor', 'marble-white-warm', 1.4, tint='#c2b192', rough=.022, coat=1.0, bump=.06),
        stage=pbr('aud_stage', 'marble-beige-veined', 1.6, tint='#f2e8d3', rough=.10, coat=.5, bump=.08),
        lac=flat('aud_lacquer', '#f4ecdc', rough=.2, coat=.7), lac2=flat('aud_lacquer2', '#ede3cf', rough=.28, coat=.5),
        ceil=flat('aud_ceiling', '#e9dec8', rough=.5),
        brass=pbr('aud_brass', 'brass-brushed-pale', 0.6, tint='#f7e6c0', rough=.22, metal=1.0, bump=.2),
        gold=flat('aud_gold', '#caa766', rough=.18, metal=1.0),
        navy=curtain('aud_navy', '#070f26'), navy_gl=flat('aud_navy_glass', '#1c2d55', rough=.10, metal=.55, coat=.6), navy2=flat('aud_navy_lac', '#16223e', rough=.12, coat=.6),
        dark=flat('aud_dark', '#0d1526', rough=.35),
        ledw=led('aud_led', (1.0, .73, .45), E('LED_K', 42.0)), ledf=led('aud_led_floor', (1.0, .76, .5), 6.0), ledn=led('aud_led_niche', (1.0, .80, .58), E('NICHE_K', 36.0)),
        niche=flat('aud_niche_back', '#e6d6b6', rough=.4), gl=glass('aud_glass'),
        fl_cols=fluted('aud_flute', '#f3ebdb', pitch=.16, depth=1.1), fl_pil=fluted('aud_flute2', '#f3ebdb', pitch=.11, depth=.9),
        screen=screen_mat(os.path.join(HERE, 'screen.png')))
    if not os.environ.get('NOWEATHER'):
        weather(M['wall'], color_var=.07, cscale=.8, bump=1.3, bscale=120)
        weather(M['floor'], color_var=.05, cscale=.5, bump=.12, bscale=120, rvar=.06, rscale=1.0)
        weather(M['stage'], color_var=.04, cscale=.7, bump=.12, bscale=160, rvar=.04, rscale=1.4)
        weather(M['fl_cols'], color_var=.035, cscale=2.2, bump=.18, bscale=420); weather(M['fl_pil'], color_var=.035, cscale=2.2, bump=.18, bscale=420)
    sx, sz0, sz1 = 8.0, 1.2, 5.7                                                         # экран 8 × 4.5 м (ширина × высота)
    # ── пол, сцена, стены
    box('aud_floor', M['floor'], -15, 15, -8, 16, -0.2, 0.0, .0)
    box('aud_stage', M['stage'], -9.6, 9.6, 10.2, YB, 0.0, .35, .012)
    box('aud_step', M['lac'], -9.9, 9.9, 9.55, 10.2, 0.0, .17, .01)                    # нижняя ступень
    box('aud_stage_led', M['ledf'], -9.6, 9.6, 10.18, 10.2, .34, .345, 0)               # линия света по краю сцены
    box('aud_step_led', M['ledf'], -9.9, 9.9, 9.53, 9.55, .15, .155, 0)
    box('aud_back', M['wall'], -10.6, 10.6, YB, YB + .3, 0, ZC + 2, 0)
    for s in (-1, 1):                                                                     # скошенные углы с арками из тёмно-синего стекла + боковые стены
        x0, y0, x1, y1 = 7.3 * s, YB, 10.4 * s, 11.3
        box('aud_wall_side%d' % s, M['wall'], min(10.4 * s, 10.7 * s), max(10.4 * s, 10.7 * s), -8, 11.4, 0, ZC + 2, 0)
        quad('aud_chamfer%d' % s, M['wall'], (x0, y0, 0), (x1, y1, 0), (x1, y1, ZC + 2), (x0, y0, ZC + 2))
        ln = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / ln, (y1 - y0) / ln; nx, ny = -uy, ux
        cx_, cy_ = (x0 + x1) / 2, (y0 + y1) / 2
        if nx * (0 - cx_) + ny * (6 - cy_) < 0: nx, ny = -nx, -ny                       # нормаль внутрь зала
        pts = arch_pts(3.3, 0.35, 4.9); n_ = len(pts)
        def Pw(px, pz, d): return (cx_ + ux * px + nx * d, cy_ + uy * px + ny * d, pz)
        mesh('aud_arch_glass%d' % s, [Pw(px, pz, .03) for px, pz in pts], [tuple(range(n_))], M['navy_gl'] if os.environ.get('NAVYGLASS', '1') == '1' else M['navy'])
        czm = sum(p[1] for p in pts) / n_
        for tag, mat, dd, tt in (('frame', M['brass'], .07, .09), ('led', M['ledw'], .085, .045)):
            out = []
            for i, (px, pz) in enumerate(pts):
                qx, qz = pts[(i + 1) % n_]; rx, rz = pts[i - 1]; tx, tz = qx - rx, qz - rz; l_ = math.hypot(tx, tz) or 1; ax, az = tz / l_, -tx / l_
                if ax * px + az * (pz - czm) < 0: ax, az = -ax, -az
                out.append((px + ax * tt, pz + az * tt))
            verts = [Pw(px, pz, dd) for px, pz in pts] + [Pw(px, pz, dd) for px, pz in out]; faces = [(i, (i + 1) % n_, n_ + (i + 1) % n_, n_ + i) for i in range(n_)]
            mesh('aud_arch_%s%d' % (tag, s), verts, faces, mat)
    seam = flat('aud_seam', '#d2ac62', rough=.22, metal=1.0)                                   # латунные швы пола, как в референсе
    for i in range(-12, 13): box('aud_seam_x%d' % i, seam, i * 1.2 - .007, i * 1.2 + .007, -8, 9.55, .0, .0022, 0)
    for j in range(-6, 9): box('aud_seam_y%d' % j, seam, -15, 15, j * 1.2 - .007, j * 1.2 + .007, .0, .0022, 0)
    # ── панель за экраном, экран, рамка
    box('aud_back_panel', M['lac2'], -4.5, 4.5, YB - .12, YB, .35, 6.6, .02)
    fw = .07; yy0, yy1 = YB - .30, YB - .16
    box('aud_scr_fr_top', M['dark'], -sx / 2 - fw, sx / 2 + fw, yy0, yy1, sz1, sz1 + fw, .006); box('aud_scr_fr_bot', M['dark'], -sx / 2 - fw, sx / 2 + fw, yy0, yy1, sz0 - fw, sz0, .006)
    box('aud_scr_fr_l', M['dark'], -sx / 2 - fw, -sx / 2, yy0, yy1, sz0, sz1, .006); box('aud_scr_fr_r', M['dark'], sx / 2, sx / 2 + fw, yy0, yy1, sz0, sz1, .006)
    quad('aud_screen', M['screen'], (-sx / 2, YB - .19, sz0), (sx / 2, YB - .19, sz0), (sx / 2, YB - .19, sz1), (-sx / 2, YB - .19, sz1))
    sc_ob = bpy.data.objects['aud_screen']; um = sc_ob.data.uv_layers.new(name='UVMap')
    for i, lp in enumerate(sc_ob.data.loops):
        v = sc_ob.data.vertices[lp.vertex_index].co; um.data[i].uv = ((v.x + sx / 2) / sx, (v.z - sz0) / (sz1 - sz0))
    # ── пилястры, колонны, ниши (зеркально по x)
    for s in (-1, 1):
        def X(a, b): return (min(a * s, b * s), max(a * s, b * s))
        x0, x1 = X(3.98, 4.62); box('aud_pil_in%d' % s, M['fl_pil'], x0, x1, YB - .42, YB, 0, ZC, .012)
        x0, x1 = X(5.9, 6.95); box('aud_col_out%d' % s, M['fl_cols'], x0, x1, YB - .62, YB, 0, ZC, .02)
        for xb, w in ((4.3, .014), (6.42, .018)):                                         # латунные вставки по осям
            x0, x1 = X(xb - w, xb + w); box('aud_inlay%d_%.0f' % (s, xb * 10), M['brass'], x0, x1, YB - (.425 if xb < 5 else .625), YB - (.41 if xb < 5 else .61), .3, ZC - .2, 0)
        x0, x1 = X(5.05, 5.12); box('aud_inlay_n1%d' % s, M['brass'], x0, x1, YB - .30, YB - .28, .3, ZC - .2, 0)
        # ниша: стрельчатая, глубина .30 м, с рамкой и тёплой подсветкой
        nx_c = 5.4 * s; pts = [(x + nx_c, z) for x, z in lancet(1.05, .55, 5.0, 6.35)]
        prism('aud_niche_back%d' % s, M['niche'], pts, YB - .06, YB - .04)
        outline('aud_niche_frame%d' % s, M['brass'], pts, YB - .32, YB - .06, t=.045, bevel=.006)
        # боковые стенки ниши (светлые) и верх
        for sd in (-1, 1):
            xs = nx_c + sd * .525; box('aud_niche_side%d_%d' % (s, sd), M['niche'], xs - .012, xs + .012, YB - .32, YB - .06, .55, 5.0, 0)
        box('aud_niche_base%d' % s, M['lac'], nx_c - .56, nx_c + .56, YB - .34, YB - .04, .35, .55, .01)
        # LED-полоски под полками (6 шт.): тёплое свечение внутри ниши
        for k in range(7): zz = 1.0 + k * .62; box('aud_niche_led%d_%d' % (s, k), M['ledn'], nx_c - .5, nx_c + .5, YB - .33, YB - .27, zz - .035, zz - .02, 0)
        box('aud_niche_led_v%d' % s, M['ledn'], nx_c - .53, nx_c - .515, YB - .33, YB - .20, .6, 5.0, 0)
        box('aud_niche_led_v2%d' % s, M['ledn'], nx_c + .515, nx_c + .53, YB - .33, YB - .20, .6, 5.0, 0)
        # карниз-подсветка над экраном и колоннами
    box('aud_cornice', M['lac'], -9.0, 9.0, YB - .9, YB, ZC - .35, ZC, .03)
    box('aud_cornice_led', M['ledw'], -9.0, 9.0, YB - .86, YB - .76, ZC - .37, ZC - .35, 0)
    box('aud_cornice_brass', M['brass'], -9.0, 9.0, YB - .90, YB - .87, ZC - .35, ZC - .31, 0)
    # ── потолок и кольца
    box('aud_ceiling', M['ceil'], -12.5, 12.5, -6, YB + .3, ZC + .4, ZC + .6, 0)
    cx, cy = 0.0, E('RING_CY', 5.5)
    rings = [(13.4, 9.6, ZC - 1.55), (11.4, 8.2, ZC - 1.22), (9.5, 6.9, ZC - .92), (7.7, 5.5, ZC - .6), (5.8, 4.0, ZC - .3), (4.0, 2.7, ZC - .02)]
    for i, (a, b, z) in enumerate(rings):
        sweep('aud_ring%d' % i, M['lac'], cx, cy, z, a, b, [(-.12, 0), (.12, 0), (.12, -.30), (.05, -.42), (-.05, -.42), (-.12, -.30)], n=220, bevel=.008)
        sweep('aud_ring_brass%d' % i, M['brass'], cx, cy, z, a, b, [(-.128, -.30), (-.05, -.425), (.05, -.425), (.128, -.30), (.128, -.28), (-.128, -.28)], n=220)
        sweep('aud_ring_led%d' % i, M['ledw'], cx, cy, z, a - .06, b - .05, [(.14, .02), (.5, .02)], n=220)             # скрытая подсветка потолка за кольцом
        sweep('aud_ring_ledlow%d' % i, M['ledw'], cx, cy, z, a, b, [(-.04, -.435), (.04, -.435)], n=220)                    # тонкая светящаяся нить по нижней кромке
    # центральный купол: диск с кольцом и точечными светильниками
    sweep('aud_dome_ring', M['gold'], cx, cy, ZC + .28, 2.2, 1.5, [(-.05, 0), (.05, 0), (.05, -.08), (-.05, -.08)], n=120)
    for i in range(22):
        t = 2 * math.pi * i / 22; bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.075, depth=.03, location=(cx + 3.6 * math.cos(t), cy + 2.4 * math.sin(t), ZC + .37)); o = bpy.context.object; o.name = 'aud_spot%d' % i; o.data.materials.append(M['ledw'])
    # ── кафедра, вазы, кресла, ниши-полки: модули (если есть)
    if not os.environ.get('AUD_NOMOD'):
        try:
            import props as PR
            lc = PR.lectern('aud_lectern', (3.9, 12.4, 0.35), yaw=math.radians(-10))
            for o in (lc if isinstance(lc, (list, tuple)) else [lc]):
                if o is not None: o.scale = (1.3, 1.3, 1.3)
            PR.chrome_vase_with_flowers('aud_vase_L', (-E('VASE_X', 5.7), 10.7, .35), scale=E('VASE_S', 1.3), seed=1); PR.chrome_vase_with_flowers('aud_vase_R', (E('VASE_X', 5.7), 10.7, .35), scale=E('VASE_S', 1.3), seed=2)
            PR.orchid_vase('aud_orchid', (-3.7, 12.4, .35), seed=3)
            for s in (-1, 1): PR.shelf_unit('aud_shelf%d' % s, (5.4 * s, YB - .30, 0), width=.98, height=5.0, shelves=7, seed=4 + s)
        except Exception as e: print('props skipped:', e)
        try:
            import chairs as CH
            CH.place_rows(rows_y=[float(v) for v in os.environ.get('ROWS_Y', '1.8,2.8,3.8,4.8,5.8,6.8,7.8,8.8').split(',')], x_ranges=[(-8.3, -1.05), (1.05, 8.3)], step_x=.66, seed=7)
            tune_chairs()
        except Exception as e: print('chairs skipped:', e)
    return M


def tune_chairs():
    """тёмно-синий бархат кресел: светлый «синий» давал блик-sheen (вес 1, тон .3/.45/.85) — делаем глубже, как у референса"""
    for m in bpy.data.materials:
        if 'navy' in m.name.lower() and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.bl_idname == 'ShaderNodeBsdfPrincipled':
                    _set(n, E('NAVY_SHEEN', .10), 'Sheen Weight', 'Sheen'); _set(n, (.07, .12, .30, 1), 'Sheen Tint')
                if n.bl_idname == 'ShaderNodeHueSaturation': n.inputs['Value'].default_value *= E('NAVY_V', .38)
        elif 'boucle' in m.name.lower() and m.use_nodes:                                # кремовое букле в референсе — серо-бежевое (greige), не белое
            b = next((n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
            if b is not None:
                N_, L_ = m.node_tree.nodes, m.node_tree.links; src = b.inputs['Base Color']; mx = N_.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1.0
                mx.inputs['Color2'].default_value = (E('CREAM_R', .80), E('CREAM_G', .76), E('CREAM_B', .70), 1)
                if src.links: l = src.links[0]; L_.new(l.from_socket, mx.inputs['Color1']); L_.remove(l)
                else: mx.inputs['Color1'].default_value = src.default_value
                L_.new(mx.outputs['Color'], b.inputs['Base Color'])


def lights(M):
    # мягкая тёплая заливка зала сверху (как рассеянный свет колец) и тёплые «потолочные» прожекторы на сцену и проход
    area('aud_fill_hall', (0, 5, ZC - 1.0), (0, 6, 0), E('FILL_HALL', 600), 16, 11, (1.0, .86, .70))
    area('aud_fill_stage', (0, 10.8, ZC - .6), (0, 13.5, 1.5), E('FILL_STAGE', 900), 14, 3, (1.0, .86, .70))
    spot('aud_spot_screen', (0, 8.5, ZC - .2), (0, 14.1, 3.4), E('SPOT_SCREEN', 2400), 60, .8)
    for ix, x in enumerate((-6.4, -3.3, 3.3, 6.4)):                  # потолочные «даунлайты» над рядами: дают читаемые мягкие тени кресел на глянцевом полу
        for iy, y in enumerate((1.2, 4.4, 7.6)):
            spot('aud_down_%d_%d' % (ix, iy), (x, y, ZC - 1.7), (x * .86, y + 1.4, 0.0), E('DOWN_K', 1500), E('DOWN_ANG', 64), .75, (1.0, .84, .64), radius=.22)
    for s in (-1, 1):
        spot('aud_spot_vase%d' % s, (6.0 * s, 8.5, ZC - .3), (7.3 * s, 11.4, .9), 1200, 38, .7)
        spot('aud_spot_lect', (3.0 * s, 9.0, ZC - .3), (4.0 * s, 12.6, 1.3), 600, 32, .7)
    w = bpy.data.worlds.new('aud_w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.95, .86, .72, 1); bg.inputs['Strength'].default_value = E('WORLD', .05); bpy.context.scene.world = w


def camera(sc):
    cd = bpy.data.cameras.new('aud_cam'); cd.lens = E('LENS', 26); cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 400
    if E('FSTOP', 5.6) > 0: cd.dof.use_dof = True; cd.dof.focus_distance = E('FOCUS', 9.0); cd.dof.aperture_fstop = E('FSTOP', 5.6)
    cam = link(bpy.data.objects.new('aud_cam', cd)); cam.location = (E('CAMX', 0.0), E('CAMY', .2), E('CAMZ', 1.25)); cam.rotation_euler = (math.radians(90 + E('PITCH', 5.5)), 0, 0); sc.camera = cam; return cam


def finish(g8):
    """«фотографическая» доводка: мягкое свечение вокруг самых ярких мест (LED-кольца, кромки экрана), лёгкая виньетка, мелкое зерно матрицы"""
    import numpy as np, cv2
    f = g8.astype(np.float32) / 255; h, w = f.shape[:2]
    bl, vg, gr = E('BLOOM', .20), E('VIG', .12), E('GRAIN', 1.3)
    if bl:
        hi = np.clip((f - .90) / .10, 0, 1)
        glow = cv2.GaussianBlur(hi, (0, 0), w * .003) * .55 + cv2.GaussianBlur(hi, (0, 0), w * .014) * .45
        f = 1 - (1 - f) * (1 - np.clip(glow * bl * 2.2, 0, .6))
    if vg:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); r = np.hypot((xx / w - .5) * 1.15, (yy / h - .5) * .95)
        f *= (1 - vg * np.clip((r - .30) / .55, 0, 1) ** 1.6)[..., None] * np.array([1, .995, .98], np.float32)
    if gr:
        rng = np.random.default_rng(11); n = rng.normal(0, gr / 255, (h, w)).astype(np.float32); n = cv2.GaussianBlur(n, (0, 0), .55) * 1.4
        f += (n * (.55 + .45 * (1 - f.mean(axis=2))))[..., None]
    return (np.clip(f, 0, 1) * 255 + .5).astype(np.uint8)


def export(raw):
    """цветокоррекция как у каталога и брендов: тёплый травертиновый тон, мягкий контраст; итог — /tmp и assets/academy (hall-new.webp)"""
    from PIL import Image
    import numpy as np
    img = np.asarray(Image.open(raw).convert('RGB'))
    g = S.grade(img, sat=E('AUD_SAT', 1.08), gamma=E('AUD_GAMMA', 1.0), lift=E('AUD_LIFT', .0)); g = np.clip(g * np.array([1.0, .99, .965], np.float32), 0, 255).astype(np.uint8)
    g = finish(g)
    out = os.environ.get('AUD_OUT', '/tmp/aud_graded.png'); Image.fromarray(g).save(out); print('цветокоррекция →', out)


def main():
    w = int(os.environ.get('AUD_W', 1280 if MODE == 'preview' else 3200)); h = round(w * 9 / 16); spp = int(os.environ.get('AUD_SPP', 24 if MODE == 'preview' else 96))
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; S.settings(sc, w, h, spp); sc.view_settings.exposure = E('EXPO', -.55); sc.view_settings.look = os.environ.get('LOOK_AUD', 'None')
    cr = os.environ.get('CROP')
    if cr and MODE == 'preview':
        x0, x1, y0, y1 = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.use_crop_to_border = True; sc.render.border_min_x = x0; sc.render.border_max_x = x1; sc.render.border_min_y = y0; sc.render.border_max_y = y1
    M = build(); lights(M); camera(sc); print('сцена: объектов %d, кадр %dx%d, %d сэмплов' % (len(bpy.data.objects), w, h, spp), flush=True)
    if MODE == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/aud_preview.png'); bpy.ops.render.render(write_still=True); print('preview done'); return
    raw = '/tmp/aud_full.png'; n = int(os.environ.get('AUD_TILES', 1))
    if n > 1:
        import academy_hall as AH
        AH.render_tiles(sc, raw, n)
    else: sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    export(raw); print('готово', flush=True)


if __name__ == '__main__':
    main()
