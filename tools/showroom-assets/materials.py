#!/usr/bin/env python3
"""Библиотека каменных материалов «Астрея» для Blender/Cycles (общая для сцены каталога, подиумов и ниш страницы «Бренды»).

  • travertine  — травертин: слои (полосы) разной плотности по высоте с лёгкой волной, вытянутые горизонтальные поры, мелкое зерно, матовая поверхность;
  • limestone   — известняк: ровный, пыльно-светлый, мягкие облачные перепады, редкие микропоры (стены, широкие плоскости);
  • plaster     — минеральная штукатурка: крупное «облако» тона и мелкая шероховатость (основной фон пространства);
  • floor_stone — полированная каменная плитка с чуть заметными швами и мягким отражением.
Цвет всех материалов тянется к палитре сайта (светлые бежево-молочные тона); параметр tint (r, g, b) слегка смещает оттенок, например под бренд.
Использование: from materials import travertine, limestone, plaster, floor_stone — внутри сцены Blender (bpy)."""
import bpy


def _mk(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'): nt.nodes.remove(n)
    return m, nt, nt.nodes['Principled BSDF']


def _in(b, *names):
    for n in names:
        if n in b.inputs: return b.inputs[n]


def _val(b, v, *names):
    i = _in(b, *names)
    if i is not None: i.default_value = v


def _ramp(nt, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    while len(r.color_ramp.elements) < len(stops): r.color_ramp.elements.new(.5)
    for e, (p, c) in zip(r.color_ramp.elements, stops): e.position = p; e.color = c
    return r


def _coord(nt, scale=(1, 1, 1), rot=None):
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); return mp.outputs['Vector']


def _noise(nt, vec, scale, detail=5, rough=.55, distort=0.0):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
    if 'Distortion' in n.inputs: n.inputs['Distortion'].default_value = distort
    nt.links.new(vec, n.inputs['Vector']); return n.outputs['Fac']


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None: continue
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: nt.links.new(x, n.inputs[i])
    return n.outputs[0]


def _t(c, tint): return (c[0] * tint[0], c[1] * tint[1], c[2] * tint[2], 1)


def travertine(name='travertine', tint=(1, 1, 1), scale=1.0, pits=1.0, bands=1.0, honed=True):
    """травертин (как на референсе): тёплое кремовое тело с облаками песочного тона, еле заметные слои, россыпь мелких вытянутых пор разного размера и мелкое зерно;
    scale — масштаб рисунка (больше — мельче), pits — сколько пор, bands — заметность слоёв."""
    m, nt, b = _mk(name); L = nt.links
    # облака тона: два масштаба; вдоль Z чуть растянуты — отсюда слабая слоистость
    cl_big = _noise(nt, _coord(nt, (.55 * scale, .55 * scale, 1.6 * scale)), 2.2, 6, .6, .8)
    cl_mid = _noise(nt, _coord(nt, (1.3 * scale, 1.3 * scale, 5.0 * scale)), 5.0, 5, .6, .5)
    lay = _noise(nt, _coord(nt, (.8 * scale, .8 * scale, 14 * scale)), 2.0, 3, .5, .6)
    tone = _math(nt, 'ADD', _math(nt, 'MULTIPLY', cl_big, .55), _math(nt, 'ADD', _math(nt, 'MULTIPLY', cl_mid, .25), _math(nt, 'MULTIPLY', lay, .20 * bands)))
    col = _ramp(nt, [(.25, _t((.82, .74, .60, 1), tint)), (.50, _t((.91, .85, .73, 1), tint)), (.78, _t((.96, .92, .82, 1), tint))]); L.new(tone, col.inputs['Fac'])
    # поры: два размера (крупные редкие, мелкие частые), лёгкая вытянутость по горизонтали
    def pores(sc_, z_stretch, thr_, rare):
        vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = sc_; vo.inputs['Randomness'].default_value = 1.0
        L.new(_coord(nt, (1.0 * scale, 1.0 * scale, z_stretch * scale)), vo.inputs['Vector'])
        inv = _math(nt, 'SUBTRACT', 1.0, vo.outputs['Distance']); hit = _math(nt, 'GREATER_THAN', inv, thr_)
        gate = _noise(nt, _coord(nt, (.9 * scale, .9 * scale, 2.0 * scale)), 2.6, 3)
        return _math(nt, 'MULTIPLY', hit, _math(nt, 'GREATER_THAN', gate, rare))
    big = pores(9.0, 2.4, 1.0 - .075 * pits, .52); small = pores(42.0, 1.8, 1.0 - .115 * pits, .36)
    pit = _math(nt, 'MAXIMUM', _math(nt, 'MULTIPLY', big, .95), _math(nt, 'MULTIPLY', small, .75))
    grain = _noise(nt, _coord(nt, (1, 1, 1)), 110 * scale, 5, .65)
    base = nt.nodes.new('ShaderNodeMix'); base.data_type = 'RGBA'; base.inputs['B'].default_value = _t((.52, .43, .31, 1), tint); L.new(col.outputs['Color'], base.inputs['A']); L.new(pit, base.inputs['Factor'])
    lum = nt.nodes.new('ShaderNodeMix'); lum.data_type = 'RGBA'; lum.inputs['B'].default_value = _t((.82, .78, .70, 1), tint); L.new(base.outputs['Result'], lum.inputs['A']); L.new(_math(nt, 'MULTIPLY', _math(nt, 'GREATER_THAN', grain, .62), .22), lum.inputs['Factor'])
    L.new(lum.outputs['Result'], b.inputs['Base Color'])
    h = _math(nt, 'SUBTRACT', _math(nt, 'MULTIPLY', grain, .5), _math(nt, 'MULTIPLY', pit, 1.8))
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .9; bp.inputs['Distance'].default_value = .006; L.new(h, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _val(b, .66 if honed else .38, 'Roughness'); _val(b, .28, 'Specular IOR Level', 'Specular')
    return m


def limestone(name='limestone', tint=(1, 1, 1), scale=1.0):
    m, nt, b = _mk(name); L = nt.links
    cloud = _noise(nt, _coord(nt, (.5, .5, .5)), 1.4 * scale, 4, .5, .4)
    fine = _noise(nt, _coord(nt, (1, 1, 1)), 120 * scale, 6, .7)
    col = _ramp(nt, [(.28, _t((.88, .84, .75, 1), tint)), (.72, _t((.94, .91, .83, 1), tint))]); L.new(cloud, col.inputs['Fac'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['B'].default_value = _t((.80, .75, .66, 1), tint); L.new(col.outputs['Color'], mx.inputs['A']); L.new(_math(nt, 'MULTIPLY', _math(nt, 'GREATER_THAN', fine, .66), .35), mx.inputs['Factor'])
    L.new(mx.outputs['Result'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .22; bp.inputs['Distance'].default_value = .004; L.new(fine, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _val(b, .78, 'Roughness'); _val(b, .22, 'Specular IOR Level', 'Specular'); return m


def plaster(name='plaster', col=(.92, .86, .76), tint=(1, 1, 1), rough=.82):
    m, nt, b = _mk(name); L = nt.links
    cloud = _noise(nt, _coord(nt, (.35, .35, .35)), 1.1, 4, .5, .5)
    mid = _noise(nt, _coord(nt, (1, 1, 1)), 6, 4, .55)
    fine = _noise(nt, _coord(nt, (1, 1, 1)), 140, 8, .7)
    c = _ramp(nt, [(.25, _t((col[0] * .95, col[1] * .95, col[2] * .94, 1), tint)), (.75, _t((col[0] * 1.03, col[1] * 1.03, col[2] * 1.03, 1), tint))]); L.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', cloud, .75), _math(nt, 'MULTIPLY', mid, .25)), c.inputs['Fac'])
    L.new(c.outputs['Color'], b.inputs['Base Color'])
    trowel = _noise(nt, _coord(nt, (.4, .4, .4)), 9, 3, .5, 1.5)
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .85; bp.inputs['Distance'].default_value = .006; L.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', fine, .55), _math(nt, 'ADD', _math(nt, 'MULTIPLY', mid, .25), _math(nt, 'MULTIPLY', trowel, .35))), bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _val(b, rough, 'Roughness'); _val(b, .22, 'Specular IOR Level', 'Specular'); return m


def floor_stone(name='floor', tint=(1, 1, 1), tile=1.2):
    m, nt, b = _mk(name); L = nt.links
    n = _noise(nt, _coord(nt, (.35, .35, .35)), 1.4, 6)
    c = _ramp(nt, [(.3, _t((.80, .72, .58, 1), tint)), (.7, _t((.90, .82, .69, 1), tint))]); L.new(n, c.inputs['Fac'])
    # швы плитки: тонкие тёмные линии по сетке tile × tile
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sp.inputs[0])
    def line(axis):
        fr = _math(nt, 'FRACT', _math(nt, 'DIVIDE', sp.outputs[axis], tile)); d = _math(nt, 'MINIMUM', fr, _math(nt, 'SUBTRACT', 1.0, fr))
        return _math(nt, 'LESS_THAN', d, .0035)
    seam = _math(nt, 'MAXIMUM', line('X'), line('Y'))
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['B'].default_value = _t((.62, .54, .42, 1), tint); L.new(c.outputs['Color'], mx.inputs['A']); L.new(_math(nt, 'MULTIPLY', seam, .5), mx.inputs['Factor'])
    L.new(mx.outputs['Result'], b.inputs['Base Color'])
    _val(b, .18, 'Roughness'); _val(b, .3, 'Coat Weight', 'Clearcoat'); _val(b, .05, 'Coat Roughness', 'Clearcoat Roughness'); _val(b, .55, 'Specular IOR Level', 'Specular'); return m


# ---------- материалы фирменного стиля (по таблице «Как использовать материалы на сайте») ----------
def microcement(name='microcement', col=(.045, .08, .17), rough=.84, scale=1.0):
    """глубокий синий матовый микроцемент (акцентные ниши, задники витрин, пространство Стеллы): облака тона, мазки шпателя (вытянутый шум), мелкое зерно, без блеска"""
    m, nt, b = _mk(name); L = nt.links
    cloud = _noise(nt, _coord(nt, (.45 * scale,) * 3), 1.1, 4, .5, .7); trowel = _noise(nt, _coord(nt, (.5 * scale, 3.0 * scale, .5 * scale)), 5.0, 3, .5, 1.3); fine = _noise(nt, _coord(nt, (scale,) * 3), 170, 6, .7)
    c = _ramp(nt, [(.25, (col[0] * .8, col[1] * .8, col[2] * .85, 1)), (.75, (col[0] * 1.25, col[1] * 1.25, col[2] * 1.2, 1))])
    L.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', cloud, .6), _math(nt, 'MULTIPLY', trowel, .4)), c.inputs['Fac']); L.new(c.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .55; bp.inputs['Distance'].default_value = .004 / scale
    L.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', fine, .35), _math(nt, 'MULTIPLY', trowel, .65)), bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _val(b, rough, 'Roughness'); _val(b, .2, 'Specular IOR Level', 'Specular'); return m


def limestone_floor(name='limestone_floor', tint=(1, 1, 1), tile=2.4, joint=.0026, tone=.05, tex=1.6):
    """пол — крупноформатный известняк (плиты tile × tile м): ровный пыльный тон с облаками и редкими мелкими порами, тонкие швы, каждая плита чуть светлее или темнее соседних; матовая шлифовка — отражение минимальное"""
    m = limestone(name, tint, tex); nt = m.node_tree; L = nt.links; b = nt.nodes['Principled BSDF']
    prev_col = b.inputs['Base Color'].links[0].from_socket; prev_nrm = b.inputs['Normal'].links[0].from_socket if b.inputs['Normal'].links else None
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sp.inputs[0])
    def line(v):
        fr = _math(nt, 'FRACT', _math(nt, 'DIVIDE', v, tile)); d = _math(nt, 'MULTIPLY', _math(nt, 'MINIMUM', fr, _math(nt, 'SUBTRACT', 1.0, fr)), tile)
        return _math(nt, 'LESS_THAN', d, joint)
    seam = _math(nt, 'MAXIMUM', line(sp.outputs['X']), line(sp.outputs['Y']))
    cmb = nt.nodes.new('ShaderNodeCombineXYZ'); L.new(_math(nt, 'FLOOR', _math(nt, 'DIVIDE', sp.outputs['X'], tile)), cmb.inputs['X']); L.new(_math(nt, 'FLOOR', _math(nt, 'DIVIDE', sp.outputs['Y'], tile)), cmb.inputs['Y'])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L.new(cmb.outputs[0], wn.inputs['Vector'])
    k = _math(nt, 'ADD', 1.0 - tone / 2, _math(nt, 'MULTIPLY', wn.outputs['Value'], tone))
    kc = nt.nodes.new('ShaderNodeCombineColor'); L.new(k, kc.inputs[0]); L.new(k, kc.inputs[1]); L.new(k, kc.inputs[2])
    tm = nt.nodes.new('ShaderNodeMix'); tm.data_type = 'RGBA'; tm.blend_type = 'MULTIPLY'; tm.inputs['Factor'].default_value = 1.0; L.new(prev_col, tm.inputs['A']); L.new(kc.outputs[0], tm.inputs['B'])
    sm = nt.nodes.new('ShaderNodeMix'); sm.data_type = 'RGBA'; sm.inputs['B'].default_value = _t((.50, .45, .37, 1), tint); L.new(tm.outputs['Result'], sm.inputs['A']); L.new(_math(nt, 'MULTIPLY', seam, .75), sm.inputs['Factor'])
    L.new(sm.outputs['Result'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .8; bp.inputs['Distance'].default_value = .003; L.new(_math(nt, 'SUBTRACT', 1.0, seam), bp.inputs['Height'])
    if prev_nrm is not None: L.new(prev_nrm, bp.inputs['Normal'])
    L.new(bp.outputs['Normal'], b.inputs['Normal'])
    _val(b, .56, 'Roughness'); return m


def satin_glass(name='satin_glass', tint=(.93, .95, .94), rough=.4):
    """сатинированное стекло (витрины, перегородки, вставки): полупрозрачное, мягко рассеивает свет"""
    m, nt, b = _mk(name); _val(b, (*tint, 1), 'Base Color'); _val(b, 1.0, 'Transmission Weight', 'Transmission'); _val(b, rough, 'Roughness'); _val(b, 1.45, 'IOR'); _val(b, .35, 'Specular IOR Level', 'Specular'); return m


def brass_champagne(name='champagne', col=(.80, .66, .44, 1), rough=.44):
    """приглушённая шлифованная латунь оттенка шампань (тонкие профили, воротники, ручки): матовая, с еле заметной штриховкой"""
    m, nt, b = _mk(name); L = nt.links; _val(b, col, 'Base Color'); _val(b, 1.0, 'Metallic'); _val(b, rough, 'Roughness'); _val(b, .6, 'Specular IOR Level', 'Specular')
    br = _noise(nt, _coord(nt, (1, 60, 1)), 3.0, 3, .5); bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .12; bp.inputs['Distance'].default_value = .0008; L.new(br, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal']); return m


def boucle(name='boucle', col=(.90, .85, .75)):
    """кремовая фактурная ткань (диваны, пуфы): крупное плетение-«букле» через рельеф, матовая, мягкий ворсовой блеск"""
    m, nt, b = _mk(name); L = nt.links; _val(b, (*col, 1), 'Base Color'); _val(b, .95, 'Roughness'); _val(b, .5, 'Sheen Weight', 'Sheen'); _val(b, .6, 'Sheen Roughness')
    n1 = _noise(nt, _coord(nt, (1, 1, 1)), 240, 8, .75); n2 = _noise(nt, _coord(nt, (1, 1, 1)), 70, 5, .6)
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .85; bp.inputs['Distance'].default_value = .005; L.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', n1, .6), _math(nt, 'MULTIPLY', n2, .4)), bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal']); return m


def lime_plaster(name='lime_plaster', col=(.93, .88, .78), rough=.92, wave=1.0, scale=1.0):
    """матовая известковая штукатурка цвета молочного песка (основной фон комнат): неровности видны под косым солнцем — пологие «волны» стены (≈ 0,5 м), мазки шпателя в разных направлениях, пятна нанесения (≈ 30 см), облака тона и мелкое зерно; блеска нет.
    wave — множитель заметности волн и мазков."""
    m, nt, b = _mk(name); L = nt.links
    cloud = _noise(nt, _coord(nt, (.30 * scale,) * 3), 1.0, 5, .55, .8); patch = _noise(nt, _coord(nt, (.9 * scale,) * 3), 3.4, 4, .5, .7)
    c = _ramp(nt, [(.2, (col[0] * .90, col[1] * .90, col[2] * .89, 1)), (.5, (col[0], col[1], col[2], 1)), (.8, (min(1, col[0] * 1.03), min(1, col[1] * 1.03), min(1, col[2] * 1.03), 1))])
    L.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', cloud, .55), _math(nt, 'MULTIPLY', patch, .45)), c.inputs['Fac']); L.new(c.outputs['Color'], b.inputs['Base Color'])
    undul = _noise(nt, _coord(nt, (.55 * scale,) * 3), 1.7, 3, .5, 1.1)                                                          # пологие волны стены
    strokeH = _noise(nt, _coord(nt, (.35 * scale, 3.2 * scale, .35 * scale)), 6.5, 3, .5, 1.9); strokeV = _noise(nt, _coord(nt, (3.2 * scale, .35 * scale, .35 * scale)), 5.5, 3, .5, 1.9)     # мазки шпателя: широкие, вытянутые, в двух направлениях
    grain = _noise(nt, _coord(nt, (scale,) * 3), 150, 8, .72)
    b1 = nt.nodes.new('ShaderNodeBump'); b1.inputs['Strength'].default_value = min(1.0, .8 * wave); b1.inputs['Distance'].default_value = .06 * wave / scale; L.new(undul, b1.inputs['Height'])
    b2 = nt.nodes.new('ShaderNodeBump'); b2.inputs['Strength'].default_value = min(1.0, .95 * wave); b2.inputs['Distance'].default_value = .012 * wave / scale
    L.new(_math(nt, 'ADD', _math(nt, 'ADD', _math(nt, 'MULTIPLY', strokeH, .45), _math(nt, 'MULTIPLY', strokeV, .30)), _math(nt, 'MULTIPLY', grain, .25)), b2.inputs['Height']); L.new(b1.outputs['Normal'], b2.inputs['Normal'])
    L.new(b2.outputs['Normal'], b.inputs['Normal']); _val(b, rough, 'Roughness'); _val(b, .18, 'Specular IOR Level', 'Specular'); return m
