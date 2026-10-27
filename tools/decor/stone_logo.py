#!/usr/bin/env python3
"""Каменный логотип «Астреи» (Blender / Cycles): знак без букв, собранный из трёх каменных тел.

Знак — «гора и жемчужина» (assets/favicon.svg): остроконечная гора, пологая дуга-«волна» у её подножия и круглая жемчужина. В 3D:
  • гора — плита из травертина (контур знака, выдавленный по глубине, фаски по кромке);
  • волна — тонкий серпообразный камень перед горой, из того же травертина, но чуть темнее;
  • жемчужина — гладкий шар из светлого известняка с лёгким глянцем, лежит на волне.
Контуры берутся из векторного знака (те же координаты), поэтому пропорции совпадают с логотипом. Тот же знак стоит в зале первого экрана главной (tools/jar-render/hall_story.py),
а отдельные прозрачные рендеры (гора, шар, знак целиком, знак анфас) лежат в assets/decor и используются на страницах.

  python3 tools/decor/stone_logo.py render [sphere|mountain|logo|front …]     — прозрачные картинки с тенью в assets/decor (stone-*.webp) и assets/decor/stone.json
Переменные: RK_SPP, RK_SCALE, RK_OUT (как у rocks.py)."""
import bpy, bmesh, math, os, sys, json, re
from mathutils import Vector, geometry

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'showroom-assets'))
import materials as MT
import rocks as RK

# контуры знака в координатах SVG (assets/favicon.svg: viewBox 36 330 424 424)
MOUNTAIN = [(49.8, 718.9), (187.6, 341.6), (443.1, 653.7), (207.6, 444.7)]
BAND_D = ("M97.5 667C105 660.5 112.4 654.8 119.9 649.6C127.4 644.5 134.8 640 142.3 635.9C149.7 631.8 157.2 628.2 164.7 624.8C172.1 621.4 179.6 618.4 187.1 615.5C194.5 612.7 202 610.1 209.4 607.6"
          "C216.9 605.1 224.4 602.8 231.8 600.6C239.3 598.4 246.8 596.4 254.2 594.5C261.7 592.6 269.1 590.8 276.6 589.2C284.1 587.6 291.5 586.3 299 585.1C306.5 584 313.9 583.1 321.4 582.6"
          "C328.8 582.2 336.3 582.1 343.8 582.5C351.2 582.9 358.7 583.8 366.2 585.5L369.2 585.5L442 652L440 652C431.8 647.1 423.7 643 415.5 639.4C407.4 635.8 399.2 632.8 391.1 630.2"
          "C382.9 627.7 374.8 625.6 366.6 623.9C358.5 622.2 350.3 620.9 342.1 619.9C334 618.9 325.8 618.3 317.7 617.9C309.5 617.5 301.4 617.4 293.2 617.5C285.1 617.6 276.9 618 268.8 618.7"
          "C260.6 619.3 252.4 620.2 244.3 621.4C236.1 622.5 228 623.9 219.8 625.5C211.7 627.2 203.5 629 195.4 631.2C187.2 633.3 179 635.6 170.9 638.2C162.7 640.8 154.6 643.6 146.4 646.6"
          "C138.3 649.7 130.1 652.9 122 656.3C113.8 659.7 105.7 663.3 97.5 667Z")
PEARL = (175.0, 625.7, 42.3)
X0, Y0, XW, YH = 246.5, 718.9, 393.3, 377.3          # центр по x, низ знака, его ширина и высота (по горе)


def band_points():
    pts = []
    for tok in re.findall(r'[MLC][^MLCZ]*', BAND_D):
        nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', tok)]
        pts.append((nums[-2], nums[-1]))
    if len(pts) > 1 and pts[0] == pts[-1]: pts.pop()                      # замыкающая точка совпадает с первой
    return pts


def grow_poly(pts, d, miter=4.0, w=None):
    """контур, раздутый наружу на d (единицы SVG): каждая вершина сдвигается по биссектрисе соседних нормалей (острые углы ограничены miter·d);
    w — вес вершины 0…1 (0 — вершина остаётся на месте: так кончики знака не «раздуваются» и не врезаются в пол, а остаются острыми, как в логотипе)"""
    n = len(pts); area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2.0
    sgn = 1.0 if area > 0 else -1.0                           # SVG: y вниз; нормаль наружу зависит от обхода
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        def nrm(a, b):
            dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1.0
            return (sgn * dy / l, -sgn * dx / l)
        n1, n2 = nrm(p0, p1), nrm(p1, p2)
        k = 1.0 + n1[0] * n2[0] + n1[1] * n2[1]
        vx, vy = (n1[0] + n2[0]) / max(k, 1e-3), (n1[1] + n2[1]) / max(k, 1e-3)
        L = math.hypot(vx, vy); lim = miter
        if L > lim: vx, vy = vx * lim / L, vy * lim / L
        dd = d * (1.0 if w is None else w[i])
        out.append((p1[0] + vx * dd, p1[1] + vy * dd))
    return out


def band_weights(pts, ramp=120.0):
    """вес роста вдоль серпа: у обоих кончиков 0 (остаются острыми), к середине плавно растёт до 1 (на расстоянии ramp по контуру)"""
    n = len(pts)
    tips = [0, max(range(n), key=lambda i: pts[i][0])]                     # левый кончик и самая правая точка (хвост серпа)
    cum = [0.0]
    for i in range(1, n): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = cum[-1] + math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
    out = []
    for i in range(n):
        s = min(min(abs(cum[i] - cum[t]), total - abs(cum[i] - cum[t])) for t in tips)
        x = max(0.0, min(1.0, s / ramp)); out.append(x * x * (3 - 2 * x))
    return out


def subdivide(pts, seg):
    """каждое ребро контура делится на seg частей (чтобы толщина плиты могла плавно сходить на нет у кончика); возвращает новые точки и номера прежних вершин в них"""
    out, idx, n = [], [], len(pts)
    for i in range(n):
        idx.append(len(out)); out.append(pts[i])
        p, q = pts[i], pts[(i + 1) % n]
        for j in range(1, seg):
            out.append((p[0] + (q[0] - p[0]) * j / seg, p[1] + (q[1] - p[1]) * j / seg))
    return out, idx


def taper_factors(pts, tips, ramp):
    """толщина плиты у каждой вершины контура в долях полной: 0 в кончике, линейно растёт до 1 на расстоянии ramp (единицы SVG) вдоль контура — кончик получается клином-лезвием, а не плоским торцом"""
    n = len(pts); cum = [0.0]
    for i in range(1, n): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = cum[-1] + math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
    out = []
    for i in range(n):
        s = min(min(abs(cum[i] - cum[t]), total - abs(cum[i] - cum[t])) for t in tips)
        out.append(max(0.0, min(1.0, s / ramp)))
    return out


def poly_mesh(name, pts, k, depth, y0, mat, bev=.0025, sink=0.0, grow=0.0, gw=None, tips=None, ramp=0.0, seg=1):
    """плита по контуру знака: pts — точки в координатах SVG; k — метров на единицу SVG; depth — толщина по y; y0 — передняя грань; sink — на сколько опустить вниз;
    tips — номера вершин-кончиков в pts (после роста), ramp — на каком расстоянии вдоль контура толщина плиты сходит на нет к кончику (0 — плита везде одинаковой толщины), seg — на сколько частей делить рёбра"""
    if grow: pts = grow_poly(pts, grow, w=gw)
    fac = None
    if tips is not None and ramp:
        pts, idx = subdivide(pts, seg)
        fac = taper_factors(pts, [idx[t] for t in tips], ramp)
    P = [Vector(((x - X0) * k, 0, (Y0 - y) * k - sink)) for x, y in pts]
    tris = geometry.tessellate_polygon([[Vector((p.x, p.z, 0)) for p in P]])
    n = len(P); verts = [(p.x, y0, p.z) for p in P] + [(p.x, y0 + depth * (1.0 if fac is None else fac[i]), p.z) for i, p in enumerate(P)]
    faces = [(a, c, b) for a, b, c in tris] + [(a + n, b + n, c + n) for a, b, c in tris] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update(); me.validate()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if bev > 0:                                              # без фаски у тонких серпов: на остром хвосте фаска расходится и оставляет чёрную щель
        bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bev; bv.segments = 3; bv.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    except Exception: bpy.ops.object.shade_smooth()
    ob.select_set(False)
    return ob


def marble(name='sl_marble', tint=(1.0, .98, .94), rough=.40, veins=1.0):
    """белый мрамор с тонкими бежево-серыми прожилками: шар-«жемчужина» как каменная фигурка (а не глянцевый пластик)"""
    m, nt, b = MT._mk(name); L = nt.links
    tc = MT._coord(nt, (1, 1, 1))
    warp = MT._noise(nt, tc, 2.4, 5, .55, 1.4)
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'DIAGONAL'; wv.inputs['Scale'].default_value = 4.0; wv.inputs['Distortion'].default_value = 9.0; wv.inputs['Detail'].default_value = 3.0; wv.inputs['Detail Scale'].default_value = 1.2
    L.new(tc, wv.inputs['Vector']); L.new(warp, wv.inputs['Phase Offset'])
    line = MT._ramp(nt, [(.46, (0, 0, 0, 1)), (.492, (1, 1, 1, 1)), (.53, (0, 0, 0, 1))]); L.new(wv.outputs['Fac'], line.inputs['Fac'])
    cloud = MT._noise(nt, tc, 1.3, 4, .5, .4)
    base = MT._ramp(nt, [(.25, (.90 * tint[0], .86 * tint[1], .80 * tint[2], 1)), (.75, (.97 * tint[0], .95 * tint[1], .91 * tint[2], 1))]); L.new(cloud, base.inputs['Fac'])
    vein = nt.nodes.new('ShaderNodeMix'); vein.data_type = 'RGBA'; vein.inputs['B'].default_value = (.60, .55, .48, 1)
    L.new(base.outputs['Color'], vein.inputs['A']); L.new(MT._math(nt, 'MULTIPLY', line.outputs['Color'], .5 * veins), vein.inputs['Factor'])
    L.new(vein.outputs['Result'], b.inputs['Base Color'])
    fine = MT._noise(nt, tc, 160, 6, .7); bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .12; bp.inputs['Distance'].default_value = .002; L.new(fine, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, rough, 'Roughness'); MT._val(b, .30, 'Specular IOR Level', 'Specular')
    for key, val in (('Coat Weight', .12), ('Coat Roughness', .25)):
        if key in b.inputs: b.inputs[key].default_value = val
    return m


def sphere_stone(name='sl_sphere', tint=(1.06, 1.0, .91), scale=1.1):
    """каменный шар (а не жемчужина): светлый травертин-известняк, шлифованный до матового шёлка — видны поры, тонкая слоистость и тёплые облака тона"""
    m = MT.travertine(name, tint, scale, .9, 1.9, honed=True)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = .50
    for key, val in (('Coat Weight', .06), ('Coat Roughness', .30)):
        if key in b.inputs: b.inputs[key].default_value = val
    return m


def sphere_satin(name='sl_satin', scale=1.0):
    """шар как на референсе главной: цельный шлифованный камень (алебастр / полированный известняк) — гладкий, матово-шёлковый, без пор и ямок;
    мягкий перелив от светлого сверху-слева к тёплому серому снизу-справа, едва заметное зерно и тихий шёлковый блеск по краю"""
    m, nt, b = MT._mk(name); L = nt.links
    tc = MT._coord(nt, (1, 1, 1))
    cloud = MT._noise(nt, tc, 5.0 * scale, 3, .45, .35)
    base = MT._ramp(nt, [(.25, (.76, .735, .70, 1)), (.75, (.86, .835, .79, 1))]); L.new(cloud, base.inputs['Fac']); L.new(base.outputs['Color'], b.inputs['Base Color'])
    fine = MT._noise(nt, tc, 420 * scale, 3, .6); bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .05; bp.inputs['Distance'].default_value = .0006
    L.new(fine, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, .44, 'Roughness'); MT._val(b, .38, 'Specular IOR Level', 'Specular')
    for key, val in (('Coat Weight', .16), ('Coat Roughness', .38), ('Sheen Weight', .28), ('Sheen Roughness', .5), ('Subsurface Weight', .10)):
        if key in b.inputs: b.inputs[key].default_value = val
    if 'Subsurface Radius' in b.inputs: b.inputs['Subsurface Radius'].default_value = (.9, .75, .55)
    if 'Subsurface Scale' in b.inputs: b.inputs['Subsurface Scale'].default_value = .02
    return m


def materials(k, tone=1.0, texscale=1.0):
    """три камня: гора (травертин, тёплый, шлифованный), волна (тот же камень, темнее), шар (травертин с порами — как шар в зале на главной)"""
    mt = MT.travertine('sl_mountain', (1.04 * tone, .95 * tone, .83 * tone), 2.6 * texscale, 1.0 if texscale < .8 else 1.7, 2.4, honed=True)
    bd = MT.travertine('sl_band', (.93 * tone, .82 * tone, .66 * tone), 3.0 * texscale, 1.2, 1.6, honed=True)
    for m, r in ((mt, .56), (bd, .42)):
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = r
    return mt, bd, sphere_stone('sl_sphere', (.80, .70, .56), 1.1)               # шар — тот же травертин, что в зале на главной (поры, слоистость), чуть темнее стен


def build_logo(height=.40, loc=(0, 0, 0), sphere_scale=1.35, depth=.14, parts=('mountain', 'band', 'sphere'), mats=None, sphere_dy=None, sphere_dz=0.0, thick=0.0, bev_k=1.0, sharp=False):
    """знак высотой height (м); loc — точка под центром основания (низ горы). Возвращает словарь тел {'mountain', 'band', 'sphere'};
    sharp — толщина плит сходит на нет к каждому кончику (клин-лезвие): сбоку не виден плоский торец, кончики острые, как в логотипе"""
    k = height / YH
    mt, bd, sp = mats or materials(k)
    out = {}
    # толще — но кончики остаются острыми, как в логотипе: у горы сдвигается только внутренняя вершина (ножки полнеют), у серпа рост сходит на нет к обоим кончикам
    if 'mountain' in parts:
        out['mountain'] = poly_mesh('sl_mountain', MOUNTAIN, k, depth, 0.0, mt, bev=.0011 * height / .4 * bev_k, grow=thick * 1.9, gw=[0, 0, 0, 1],
                                    tips=[0, 1, 2] if sharp else None, ramp=115.0 if sharp else 0.0, seg=24 if sharp else 1)          # три кончика горы: левая ножка, вершина, правая ножка
    if 'band' in parts:
        bp = band_points()
        out['band'] = poly_mesh('sl_band', bp, k, depth * .80, -depth * .34, bd, bev=0, grow=thick * .8, gw=band_weights(bp),
                                tips=[0, max(range(len(bp)), key=lambda i: bp[i][0])] if sharp else None, ramp=85.0 if sharp else 0.0)   # без фаски: на остром хвосте она оставляет щель; оба кончика серпа — клином
    if 'sphere' in parts:
        r = PEARL[2] * k * sphere_scale
        cx, cz = (PEARL[0] - X0) * k, (Y0 - PEARL[1]) * k
        bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=r, location=(cx, -depth * .50 if sphere_dy is None else sphere_dy, cz + sphere_dz)); ob = bpy.context.object; ob.name = 'sl_sphere'
        bpy.ops.object.shade_smooth(); ob.data.materials.append(sp); out['sphere'] = ob
        out['sphere_r'] = r
    for key, ob in out.items():
        if key != 'sphere_r': ob.location = (ob.location.x + loc[0], ob.location.y + loc[1], ob.location.z + loc[2])
    return out


def render_asset(kind, path):
    """прозрачная картинка с тенью: kind — sphere | mountain | logo | front"""
    res = (round(1400 * RK.K), round(1100 * RK.K))
    sc, cam = RK.studio(res)
    H = .40
    if kind == 'sphere':
        mats = materials(H / YH); r = PEARL[2] * (H / YH) * 1.6
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=96, radius=r, location=(0, 0, r)); ob = bpy.context.object; bpy.ops.object.shade_smooth(); ob.data.materials.append(mats[2])
        tgt, ext = (0, 0, r), r * 2
        RK.aim(cam, tgt, 4.0, -22, 20)
    elif kind == 'mountain':
        o = build_logo(H, (0, 0, 0), parts=('mountain',), thick=11.0); o['mountain'].rotation_euler = (0, 0, math.radians(-20))
        tgt, ext = (0, 0, H * .48), H * 1.2
        RK.aim(cam, tgt, 4.0, -28, 14)
    elif kind == 'front':
        o = build_logo(H, (0, 0, 0), thick=11.0); tgt, ext = (0, 0, H * .48), H * 1.25
        RK.aim(cam, tgt, 4.0, 0, 3)
    else:
        o = build_logo(H, (0, 0, 0), thick=11.0); g = bpy.data.objects.new('grp', None); bpy.context.collection.objects.link(g)
        for v in o.values():
            if hasattr(v, 'parent'): v.parent = g
        g.rotation_euler = (0, 0, math.radians(-24))
        tgt, ext = (0, 0, H * .48), H * 1.3
        RK.aim(cam, tgt, 4.0, -26, 12)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ext * 1.55 * (res[0] / res[1]) / 1.15
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    bpy.data.objects[sc['floor']].hide_render = True; sc.render.filepath = path.replace('.png', '-rock.png'); bpy.ops.render.render(write_still=True)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'render'
    kinds = sys.argv[2:] or ['sphere', 'mountain', 'logo', 'front']
    meta_p = os.path.join(RK.OUT, 'stone.json'); meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    for kd in kinds:
        png = '/tmp/stone_%s.png' % kd; render_asset(kd, png); meta[kd] = RK.to_webp(png, 'stone-' + kd); print(kd, meta[kd], flush=True)
        json.dump(meta, open(meta_p, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
