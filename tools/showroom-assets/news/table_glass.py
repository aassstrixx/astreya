#!/usr/bin/env python3
"""Стеклянный круглый стол для страницы «Новости» (news.html, css/news-table.css): вид строго сверху на толстую круглую столешницу из прозрачного стекла
и светлый каменный пол вокруг. Журнал рисует HTML поверх картинки, поэтому здесь его нет; на стекле под ним оставлен спокойный нейтральный участок.

Сцена (Blender / Cycles, CPU, OIDN), масштаб как в остальных сценах сайта — миниатюра: 1 ед. = 10 см (стекло Ø 90 см = 9 ед.):
  • стекло: диск Ø 9 ед., толщина 1,6 см, закруглённые (полированные) кромки; настоящее преломление и отражение (Glass BSDF), лёгкое поглощение в толще — холодно-зелёный торец,
    тонкие микроцарапины и пыль (процедурная карта → шероховатость и слабое рассеяние), для теневых лучей стекло «полупрозрачная плёнка» (приём проекта: иначе свет не проходит к полу);
  • основание: каменный барабан (травертин) под центром стекла — виден сквозь стекло и прячется под журналом;
  • пол: плиты травертина 1,2×0,6 м вразбежку (пак CC0 travertine-ivory: цвет и жилы), швы, разный рисунок у каждой плиты, процедурные поры и микрозерно, матовая шлифовка;
  • свет: мягкое окно слева сверху (как в зале главной), холодный заполняющий свет неба; отражение «светового окна» в стекле — невидимая камере панель над столом (видна только отражениям);
  • камера: перспектива с длинным объективом на высоте 3 м прямо над центром, кадр = плоскость 3400×2260 px страницы (1 px страницы = 0,5 мм на уровне столешницы).

Параметры на плоскости страницы 3400×2260 (центр = центр стола): стекло R = 900 px, барабан R ≈ 260 px; граница стекла — окружность радиуса 900 px от (1700, 1130).

Запуск (нужен bpy):  python3 tools/showroom-assets/news/table_glass.py [выход.png]
Переменные: TG_W (ширина, 2880), TG_SPP (сэмплов, 192), TG_CROP (x0,y0,x1,y1 — доли кадра, пробный участок), TG_EXP (экспозиция), TG_KEY (сила окна), TG_SKY (сила неба), TG_WIN (сила отражаемой панели),
TG_SCR (заметность царапин), TG_THREADS (4), TG_TMP (куда класть процедурные текстуры). Постобработка и WebP — table_glass_post.py."""
import bpy, bmesh, math, os, sys
import numpy as np
import cv2
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
TEXD = os.path.join(ROOT, 'tools', 'showroom-assets', 'textures')
_f = lambda k, d: float(os.environ.get(k, d))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.environ.get('TG_TMP', '/tmp'), 'table_glass_raw.png')
TMP = os.environ.get('TG_TMP', '/tmp'); os.makedirs(TMP, exist_ok=True)
RW = int(_f('TG_W', 2880)); RH = round(RW * 2260 / 3400); SPP = int(_f('TG_SPP', 192))

# ---------------------------------------------------------------------------------------------------------------- размеры (1 ед. = 10 см)
U = 10.0                                  # ед. на метр
PLANE_W = 17.0                            # ширина кадра на уровне столешницы (3400 px × 0,5 мм)
PX = PLANE_W / 3400.0                     # ед. на px страницы
R_GLASS = 900 * PX                        # радиус стекла 4,5 ед. (45 см)
T_GLASS = .20                             # толщина 2 см
Z_TOP = 4.0                               # верх стекла над полом (40 см)
Z_BOT = Z_TOP - T_GLASS
ARRIS = _f('TG_ARRIS', .06)               # радиус закругления кромки 6 мм
R_DRUM = 260 * PX                         # радиус барабана 1,3 ед.
CAM_D = 30.0                              # высота камеры над столешницей (3 м)
LENS = 36.0 * CAM_D / PLANE_W             # мм: кадр шириной PLANE_W на уровне столешницы


# ---------------------------------------------------------------------------------------------------------------- узлы
def nodes_of(m):
    m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    return nt


def N(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        if k in n.inputs: n.inputs[k].default_value = v
        else: setattr(n, k, v)
    return n


def link(nt, a, b): nt.links.new(a, b)


def math_(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None: continue
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: nt.links.new(x, n.inputs[i])
    return n.outputs[0]


def mix_(nt, a, b, fac, kind='RGBA', blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = kind; n.blend_type = blend
    for i, (nm, x) in enumerate((('A', a), ('B', b), ('Factor', fac))):
        if isinstance(x, (int, float, tuple, list)): n.inputs[nm].default_value = x
        else: nt.links.new(x, n.inputs[nm])
    return n.outputs['Result']


def img_tex(nt, path, cs, vec, interp='Cubic'):
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path); t.image.colorspace_settings.name = cs
    t.interpolation = interp; t.extension = 'REPEAT'; nt.links.new(vec, t.inputs['Vector']); return t


def noise_(nt, vec, scale, detail=5, rough=.55, distort=0.0):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
    n.inputs['Distortion'].default_value = distort; nt.links.new(vec, n.inputs['Vector']); return n.outputs['Fac']


def smooth_(nt, x, e0, e1):
    """smoothstep через MapRange (Smooth Step)"""
    n = nt.nodes.new('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP'; n.clamp = True
    n.inputs['From Min'].default_value = e0; n.inputs['From Max'].default_value = e1; nt.links.new(x, n.inputs['Value']); return n.outputs['Result']


def tint_(rgb, k): return tuple(c * k for c in rgb) + (1.0,)


# ---------------------------------------------------------------------------------------------------------------- процедурная карта микроцарапин и пыли
def make_dust_map(path, S=4096):
    """карта стекла 4096² на диск Ø 9 ед. (0,22 мм/px): тонкие волосяные царапины (дуги и прямые), широкие следы протирания (едва заметные), пылинки; значения 0…1 (1 — рассеивающий дефект).
    Всё слабое: стекло чистое, дефекты видны только там, где их ловит блик окна."""
    rng = np.random.default_rng(11)
    a = np.zeros((S, S), np.float32); yy, xx = np.mgrid[0:S, 0:S].astype(np.float32); c = S / 2
    inside = (np.hypot(xx - c, yy - c) < S / 2 * .985).astype(np.float32)

    def stroke(canvas, pts, th, val):
        cv2.polylines(canvas, [np.round(np.array(pts) * 16).astype(np.int32)], False, float(val), th, cv2.LINE_AA, 4)
    # волосяные царапины: короткие прямые и пологие дуги, чаще в средней зоне (там двигали предметы)
    sc = np.zeros((S, S), np.float32)
    for i in range(520):
        r = abs(rng.normal(0, .42)) * c; ang = rng.uniform(0, 2 * math.pi); x0, y0 = c + r * math.cos(ang), c + r * math.sin(ang)
        L = rng.uniform(40, 520) * (3.0 if rng.random() < .06 else 1.0); th0 = rng.uniform(0, 2 * math.pi); curv = rng.normal(0, .0016)
        pts = []; x, y, t = x0, y0, th0
        for k in range(14):
            pts.append((x, y)); x += math.cos(t) * L / 14; y += math.sin(t) * L / 14; t += curv * L / 14 * 8
        stroke(sc, pts, 1 if rng.random() < .75 else 2, rng.uniform(.25, 1.0))
    # длинные редкие дуги — следы протирания тканью
    sw = np.zeros((S, S), np.float32)
    for i in range(34):
        R = rng.uniform(.25, 1.6) * S; ang0 = rng.uniform(0, 2 * math.pi); span = rng.uniform(.15, .55); cx0 = c + R * math.cos(ang0 + math.pi); cy0 = c + R * math.sin(ang0 + math.pi)
        a0 = ang0 - span / 2; pts = [(cx0 + R * math.cos(a0 + span * k / 40), cy0 + R * math.sin(a0 + span * k / 40)) for k in range(41)]
        stroke(sw, pts, 3, rng.uniform(.15, .5))
    sw = cv2.GaussianBlur(sw, (0, 0), 2.2)
    # пылинки и точки: редкие, мелкие, чуть разной яркости, кучками
    du = np.zeros((S, S), np.float32)
    for i in range(1500):
        x, y = rng.uniform(0, S, 2); r = rng.choice([1, 1, 1, 2, 2, 3]); cv2.circle(du, (int(x * 16), int(y * 16)), int(r * 16 / 2 + 8), float(rng.uniform(.25, .9)), -1, cv2.LINE_AA, 4)
    for i in range(70):
        x, y = rng.uniform(0, S, 2); n = rng.integers(8, 40)
        for k in range(n):
            xx_, yy_ = x + rng.normal(0, 40), y + rng.normal(0, 40); cv2.circle(du, (int(xx_ * 16), int(yy_ * 16)), int(rng.choice([1, 2]) * 8 + 4), float(rng.uniform(.2, .7)), -1, cv2.LINE_AA, 4)
    a = np.clip(sc * .9 + sw * .55 + du * .85, 0, 1) * inside
    cv2.imwrite(path, (a * 65535).astype(np.uint16))
    return path


# ---------------------------------------------------------------------------------------------------------------- материалы
def stone_mat(name, tile_units=12.0, slab=(12.0, 6.0), joints=True, albedo=(.83, .79, .72), chroma=.42, honed=.40, pits=1.0, seed=1):
    """травертин: цвет и жилы — из пака CC0 (travertine-ivory), приглушён к нейтрально-тёплому тону (chroma — доля исходной насыщенности), плиты slab вразбежку, у каждой свой кусок рисунка,
    швы, процедурные поры (вытянутые вдоль слоёв) и микрозерно; матовая шлифовка"""
    m = bpy.data.materials.new(name); nt = nodes_of(m)
    out = N(nt, 'ShaderNodeOutputMaterial'); b = N(nt, 'ShaderNodeBsdfPrincipled'); link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    tc = N(nt, 'ShaderNodeTexCoord'); sp = N(nt, 'ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Object'], sp.inputs[0]); X, Y = sp.outputs['X'], sp.outputs['Y']
    SW, SH = slab
    if joints:
        row = math_(nt, 'FLOOR', math_(nt, 'DIVIDE', Y, SH)); xs = math_(nt, 'SUBTRACT', X, math_(nt, 'MULTIPLY', row, SW * .43))        # ряды вразбежку: сдвиг 0,43 длины плиты
        col = math_(nt, 'FLOOR', math_(nt, 'DIVIDE', xs, SW)); fx = math_(nt, 'SUBTRACT', xs, math_(nt, 'MULTIPLY', col, SW)); fy = math_(nt, 'SUBTRACT', Y, math_(nt, 'MULTIPLY', row, SH))
        dj = math_(nt, 'MINIMUM', math_(nt, 'MINIMUM', fx, math_(nt, 'SUBTRACT', SW, fx)), math_(nt, 'MINIMUM', fy, math_(nt, 'SUBTRACT', SH, fy)))        # расстояние до ближайшего шва, ед.
        idv = N(nt, 'ShaderNodeCombineXYZ'); link(nt, col, idv.inputs['X']); link(nt, math_(nt, 'ADD', row, seed * 7.0), idv.inputs['Y'])
        wn = N(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='3D'); link(nt, idv.outputs[0], wn.inputs['Vector'])
        sep2 = N(nt, 'ShaderNodeSeparateColor'); link(nt, wn.outputs['Color'], sep2.inputs['Color'])
        off = N(nt, 'ShaderNodeCombineXYZ'); link(nt, sep2.outputs['Red'], off.inputs['X']); link(nt, sep2.outputs['Green'], off.inputs['Y'])
        tone = math_(nt, 'ADD', .965, math_(nt, 'MULTIPLY', sep2.outputs['Blue'], .07))                        # каждая плита чуть светлее или темнее соседних (±3,5%)
        vec = N(nt, 'ShaderNodeVectorMath', operation='ADD'); link(nt, tc.outputs['Object'], vec.inputs[0]); sc_ = N(nt, 'ShaderNodeVectorMath', operation='SCALE'); sc_.inputs['Scale'].default_value = tile_units
        link(nt, off.outputs[0], sc_.inputs[0]); link(nt, sc_.outputs[0], vec.inputs[1])
        base_vec = vec.outputs[0]
    else:
        tone = 1.0; base_vec = tc.outputs['Object']
    mp = N(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / tile_units,) * 3; link(nt, base_vec, mp.inputs['Vector'])
    col_t = img_tex(nt, os.path.join(TEXD, 'travertine-ivory', 'color.jpg'), 'sRGB', mp.outputs['Vector'])
    # приглушение жёлтого: смесь исходного цвета с его яркостью, затем целевой средний цвет (albedo / среднее пака)
    lum = N(nt, 'ShaderNodeRGBToBW'); link(nt, col_t.outputs['Color'], lum.inputs['Color'])
    gray = N(nt, 'ShaderNodeCombineColor'); [link(nt, lum.outputs['Val'], gray.inputs[i]) for i in range(3)]
    dull = mix_(nt, gray.outputs['Color'], col_t.outputs['Color'], chroma)
    mean = np.array([.737, .603, .418]); lm = float(mean @ [.2126, .7152, .0722])               # линейное среднее цвета пака (223,203,172) и его яркость
    dmean = lm + chroma * (mean - lm)                                                        # среднее после приглушения
    k = tuple(float(albedo[i] / dmean[i]) for i in range(3))                                 # множитель, при котором средний цвет плит = albedo
    col = mix_(nt, dull, (*k, 1.0), 1.0, blend='MULTIPLY')
    # мелкие поры: вытянутый Вороной, неровный край, гейт по облаку (поры кучками)
    mpp = N(nt, 'ShaderNodeMapping'); mpp.inputs['Scale'].default_value = (1.0, 2.6, 1.0); link(nt, tc.outputs['Object'], mpp.inputs['Vector'])

    def pores(scale, thr, gate_scale, gate_thr):
        vo = N(nt, 'ShaderNodeTexVoronoi', feature='F1'); vo.inputs['Scale'].default_value = scale; vo.inputs['Randomness'].default_value = 1.0; link(nt, mpp.outputs[0], vo.inputs['Vector'])
        jit = noise_(nt, tc.outputs['Object'], scale * 2.3, 3)
        d = math_(nt, 'ADD', math_(nt, 'SUBTRACT', 1.0, vo.outputs['Distance']), math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', jit, .5), .30))
        hit = math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', d, thr - .05), 8.0, clamp=True)
        gate = smooth_(nt, noise_(nt, tc.outputs['Object'], gate_scale, 3), gate_thr - .04, gate_thr + .04)
        return math_(nt, 'MULTIPLY', hit, gate)
    p1 = pores(2.6, 1 - .075 * pits, .42, .46); p2 = pores(9.0, 1 - .11 * pits, .55, .36)
    pit = math_(nt, 'MAXIMUM', math_(nt, 'MULTIPLY', p1, .85), math_(nt, 'MULTIPLY', p2, .70))
    fine = noise_(nt, tc.outputs['Object'], 70.0, 6, .62)
    col = mix_(nt, col, (.50 * albedo[0] / .8, .44 * albedo[1] / .8, .35 * albedo[2] / .8, 1.0), math_(nt, 'MULTIPLY', pit, .75))          # поры темнее камня
    if joints:
        jm = math_(nt, 'SUBTRACT', 1.0, smooth_(nt, dj, .012, .05))                                                             # шов шириной ~1 мм (на плоскости ≈ 2 px) с мягким краем
        col = mix_(nt, col, (.55 * albedo[0] / .8, .50 * albedo[1] / .8, .43 * albedo[2] / .8, 1.0), math_(nt, 'MULTIPLY', jm, .85))
        cc = N(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); cc.inputs['Factor'].default_value = 1.0; link(nt, col, cc.inputs['A'])
        tn = N(nt, 'ShaderNodeCombineColor'); [link(nt, tone, tn.inputs[i]) for i in range(3)]; link(nt, tn.outputs['Color'], cc.inputs['B']); col = cc.outputs['Result']
    link(nt, col, b.inputs['Base Color'])
    # рельеф: микрозерно + поры (внутрь) + шов (внутрь); нормали пака плоские, поэтому рельеф процедурный
    h = math_(nt, 'SUBTRACT', math_(nt, 'MULTIPLY', fine, .35), math_(nt, 'MULTIPLY', pit, 1.1))
    if joints: h = math_(nt, 'SUBTRACT', h, math_(nt, 'MULTIPLY', jm, 1.4))
    bp = N(nt, 'ShaderNodeBump'); bp.inputs['Strength'].default_value = .85; bp.inputs['Distance'].default_value = .02; link(nt, h, bp.inputs['Height']); link(nt, bp.outputs['Normal'], b.inputs['Normal'])
    rg = math_(nt, 'ADD', honed, math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', fine, .5), .16))
    link(nt, math_(nt, 'ADD', rg, math_(nt, 'MULTIPLY', pit, .25), clamp=True), b.inputs['Roughness'])
    for kk, vv in (('Specular IOR Level', .42), ('Specular', .42)):
        if kk in b.inputs: b.inputs[kk].default_value = vv
    return m


def glass_mat(dust_path):
    """толстое стекло: Glass BSDF (IOR 1,52), шероховатость и рассеяние — по карте царапин; в толще — поглощение (холодно-зелёное, заметное лишь на торце);
    для теневых лучей — прозрачная плёнка с лёгким тоном (свет доходит до пола, тень от стекла мягкая и слабая)"""
    m = bpy.data.materials.new('tg_glass'); nt = nodes_of(m)
    out = N(nt, 'ShaderNodeOutputMaterial')
    tc = N(nt, 'ShaderNodeTexCoord'); mp = N(nt, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / (2 * R_GLASS / .985 * 1.0),) * 2 + (1,); mp.inputs['Location'].default_value = (.5, .5, 0); link(nt, tc.outputs['Object'], mp.inputs['Vector'])
    dt = img_tex(nt, dust_path, 'Non-Color', mp.outputs['Vector'], 'Linear'); dm = dt.outputs['Color']
    dmask = N(nt, 'ShaderNodeRGBToBW'); link(nt, dm, dmask.inputs['Color']); dv = dmask.outputs['Val']
    scr = _f('TG_SCR', 1.0)
    # низкочастотная волнистость поверхности: настоящее флоат-стекло чуть «играет» в отражении — мягкие полосы вместо однотонной пелены
    wave = noise_(nt, tc.outputs['Object'], .42, 2, .5, .5)
    rough = math_(nt, 'ADD', .004, math_(nt, 'MULTIPLY', dv, .10 * scr), clamp=True)
    gl = N(nt, 'ShaderNodeBsdfGlass', distribution='MULTI_GGX'); gl.inputs['IOR'].default_value = 1.52; gl.inputs['Color'].default_value = (.985, 1.0, .99, 1); link(nt, rough, gl.inputs['Roughness'])
    bpn = N(nt, 'ShaderNodeBump'); bpn.inputs['Strength'].default_value = .05; bpn.inputs['Distance'].default_value = .004; link(nt, wave, bpn.inputs['Height']); link(nt, bpn.outputs['Normal'], gl.inputs['Normal'])
    # рассеяние света на царапинах и пыли (ловят общий свет и блик): слабое молочное
    df = N(nt, 'ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (.96, .97, .96, 1)
    sc_mix = N(nt, 'ShaderNodeMixShader'); link(nt, math_(nt, 'MULTIPLY', dv, .12 * scr, clamp=True), sc_mix.inputs['Fac']); link(nt, gl.outputs['BSDF'], sc_mix.inputs[1]); link(nt, df.outputs['BSDF'], sc_mix.inputs[2])
    # теневые лучи: плёнка с тоном стекла
    tr = N(nt, 'ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (_f('TG_SHR', .86), _f('TG_SHG', .93), _f('TG_SHB', .89), 1)
    lp = N(nt, 'ShaderNodeLightPath'); fin = N(nt, 'ShaderNodeMixShader'); link(nt, lp.outputs['Is Shadow Ray'], fin.inputs['Fac']); link(nt, sc_mix.outputs['Shader'], fin.inputs[1]); link(nt, tr.outputs['BSDF'], fin.inputs[2])
    link(nt, fin.outputs['Shader'], out.inputs['Surface'])
    ab = N(nt, 'ShaderNodeVolumeAbsorption'); ab.inputs['Color'].default_value = (_f('TG_ABR', .90), _f('TG_ABG', .985), _f('TG_ABB', .94), 1); ab.inputs['Density'].default_value = _f('TG_ABD', 6.0); link(nt, ab.outputs['Volume'], out.inputs['Volume'])
    return m


def glass_edge_mat():
    """торец и закругление кромки: полированное толстое стекло видно сверху светло-зелёной полосой; чтобы свет не застревал в толще (чёрная кайма от полного внутреннего отражения),
    к стеклу подмешано мягкое рассеяние — как в настоящей кромке с микрошероховатостью"""
    m = bpy.data.materials.new('tg_glass_edge'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial')
    gl = N(nt, 'ShaderNodeBsdfGlass'); gl.inputs['IOR'].default_value = 1.52; gl.inputs['Roughness'].default_value = .03; gl.inputs['Color'].default_value = (.80, .96, .88, 1)
    tl = N(nt, 'ShaderNodeBsdfTranslucent'); tl.inputs['Color'].default_value = (.62, .85, .74, 1)
    mx = N(nt, 'ShaderNodeMixShader'); mx.inputs['Fac'].default_value = _f('TG_EDGE', .55); link(nt, gl.outputs['BSDF'], mx.inputs[1]); link(nt, tl.outputs['BSDF'], mx.inputs[2])
    tr = N(nt, 'ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (.80, .90, .85, 1)
    lp = N(nt, 'ShaderNodeLightPath'); fin = N(nt, 'ShaderNodeMixShader'); link(nt, lp.outputs['Is Shadow Ray'], fin.inputs['Fac']); link(nt, mx.outputs['Shader'], fin.inputs[1]); link(nt, tr.outputs['BSDF'], fin.inputs[2]); link(nt, fin.outputs['Shader'], out.inputs['Surface'])
    return m


def brass_mat():
    m = bpy.data.materials.new('tg_brass'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial'); b = N(nt, 'ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (.78, .60, .33, 1); b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = .34; link(nt, b.outputs['BSDF'], out.inputs['Surface']); return m


def window_panel_mat(s_win):
    """светлое окно, видимое только отражениям: мягкий край, переплёт-крест, тёплый белый, к краям слабее"""
    m = bpy.data.materials.new('tg_window'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial'); em = N(nt, 'ShaderNodeEmission')
    tc = N(nt, 'ShaderNodeTexCoord'); sp = N(nt, 'ShaderNodeSeparateXYZ'); link(nt, tc.outputs['UV'], sp.inputs[0]); u, v = sp.outputs['X'], sp.outputs['Y']
    eu = math_(nt, 'MINIMUM', u, math_(nt, 'SUBTRACT', 1.0, u)); ev = math_(nt, 'MINIMUM', v, math_(nt, 'SUBTRACT', 1.0, v))
    edge = math_(nt, 'MULTIPLY', smooth_(nt, eu, .0, .10), smooth_(nt, ev, .0, .10))
    bar_u = smooth_(nt, math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', u, .5)), .012, .028); bar_v = smooth_(nt, math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', v, .5)), .012, .028)
    bars = math_(nt, 'MULTIPLY', bar_u, bar_v)
    grad = math_(nt, 'ADD', .55, math_(nt, 'MULTIPLY', u, .45))                                  # к «улице» (левому краю) ярче
    st = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', edge, bars), math_(nt, 'MULTIPLY', grad, s_win))
    em.inputs['Color'].default_value = (1.0, .97, .92, 1); link(nt, st, em.inputs['Strength']); link(nt, em.outputs['Emission'], out.inputs['Surface']); return m


# ---------------------------------------------------------------------------------------------------------------- геометрия
def lathe(name, profile, segs, mat, side_mat=None):
    """тело вращения вокруг оси Z по профилю [(r, z), …] от нижней оси к верхней; крышки — отдельные плоские n-угольники"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    pts = profile
    rings = []
    for r, z in pts[1:-1]:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs; f = bm.faces.new((a[i], a[j], b[j], b[i])); f.smooth = True; f.material_index = 1 if side_mat else 0
    # крышки на отдельных вершинах (чтобы их нормали были строго плоскими)
    for ring, z, up in ((rings[0], pts[0][1], False), (rings[-1], pts[-1][1], True)):
        r = math.hypot(ring[0].co.x, ring[0].co.y); zc = ring[0].co.z
        cap = [bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), zc)) for i in range(segs)]
        f = bm.faces.new(cap if up else cap[::-1]); f.smooth = False
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.data.materials.append(mat)
    if side_mat: ob.data.materials.append(side_mat)
    return ob


def glass_profile():
    c = ARRIS; R = R_GLASS; steps = 7
    prof = [(0, Z_BOT)]
    for k in range(steps + 1):                                    # нижнее закругление
        a = math.pi / 2 * k / steps; prof.append((R - c + c * math.sin(a), Z_BOT + c - c * math.cos(a)))
    for k in range(steps + 1):                                    # верхнее закругление
        a = math.pi / 2 * k / steps; prof.append((R - c + c * math.cos(a), Z_TOP - c + c * math.sin(a)))
    prof.append((0, Z_TOP))
    # убираем дубль точки (R, Z_BOT + c) / (R, Z_TOP − c) — они разные, но на боковой грани нужен только один отрезок между ними
    return prof


def build(sc):
    # ---- пол
    floor_m = stone_mat('tg_floor', joints=True, albedo=(_f('TG_FR', .86), _f('TG_FG', .81), _f('TG_FB', .73)), chroma=_f('TG_FCH', .45))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0)); fl = bpy.context.object; fl.name = 'floor'; fl.scale = (60, 44, 1); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); fl.data.materials.append(floor_m)
    # ---- стекло
    dust = make_dust_map(os.path.join(TMP, 'tg_dust.png'))
    gm = glass_mat(dust)
    g = lathe('glass', glass_profile(), 360, gm, glass_edge_mat())
    # ---- барабан-основание
    dm = stone_mat('tg_drum', joints=False, albedo=(.84, .80, .73), chroma=_f('TG_FCH', .45), honed=.5)
    drum_top = Z_BOT - .035
    d = lathe('drum', [(0, 0), (R_DRUM, 0), (R_DRUM, drum_top * .15), (R_DRUM, drum_top - .06), (R_DRUM - .05, drum_top), (0, drum_top)], 160, dm)
    # ---- свет
    key = bpy.data.lights.new('key', 'AREA'); key.shape = 'RECTANGLE'; key.size = _f('TG_KS', 9.0); key.size_y = _f('TG_KS', 9.0) * 1.15
    key.energy = _f('TG_KEY', 26000.0); key.color = (1.0, .92, .80)
    ko = bpy.data.objects.new('key', key); sc.collection.objects.link(ko); ko.location = Vector((_f('TG_KX', -17.0), _f('TG_KY', 11.0), _f('TG_KZ', 25.0)))
    ko.rotation_euler = (Vector((2.0, -1.0, Z_TOP)) - ko.location).to_track_quat('-Z', 'Y').to_euler()
    ko.visible_camera = False; ko.visible_glossy = False
    # мягкий контровой свет справа-сверху (отражённый от стен), слабый
    rf = bpy.data.lights.new('rim', 'AREA'); rf.shape = 'RECTANGLE'; rf.size = 16; rf.size_y = 12; rf.energy = _f('TG_RIM', 5500.0); rf.color = (.90, .94, 1.0)
    ro = bpy.data.objects.new('rim', rf); sc.collection.objects.link(ro); ro.location = Vector((19.0, -9.0, 24.0)); ro.rotation_euler = (Vector((0, 0, Z_TOP)) - ro.location).to_track_quat('-Z', 'Y').to_euler(); ro.visible_camera = False; ro.visible_glossy = False
    # ---- мир: холодный мягкий свет потолка и неба
    w = bpy.data.worlds.new('w'); w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
    bg.inputs['Color'].default_value = (.90, .94, 1.0, 1); bg.inputs['Strength'].default_value = _f('TG_SKY', .55); sc.world = w
    # ---- отражаемое окно: панель над столом, камере невидима, освещения не даёт
    pm = window_panel_mat(_f('TG_WIN', 7.0))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(_f('TG_WX', -5.2), _f('TG_WY', 5.0), Z_TOP + _f('TG_WZ', 13.0))); wp = bpy.context.object; wp.name = 'window'
    wp.scale = (_f('TG_WW', 11.0), _f('TG_WH', 9.0), 1); wp.rotation_euler = (math.pi, 0, math.radians(_f('TG_WR', 0.0))); wp.data.materials.append(pm)
    wp.visible_camera = False; wp.visible_diffuse = False; wp.visible_shadow = False; wp.visible_transmission = False
    # ---- камера: строго сверху
    cd = bpy.data.cameras.new('cam'); cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.lens = LENS; cd.dof.use_dof = False
    co = bpy.data.objects.new('cam', cd); sc.collection.objects.link(co); co.location = (0, 0, Z_TOP + CAM_D); co.rotation_euler = (0, 0, 0); sc.camera = co


def settings(sc):
    r = sc.render; r.engine = 'CYCLES'; r.resolution_x = RW; r.resolution_y = RH; r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'; r.image_settings.color_depth = '16'; r.image_settings.color_mode = 'RGB'
    r.threads_mode = 'FIXED'; r.threads = int(_f('TG_THREADS', 4)); r.use_persistent_data = False; r.film_transparent = False
    cy = sc.cycles; cy.device = 'CPU'; cy.samples = SPP; cy.use_adaptive_sampling = True; cy.adaptive_threshold = .006; cy.adaptive_min_samples = 24
    cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'; cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'; cy.denoising_prefilter = 'ACCURATE'
    cy.max_bounces = 16; cy.transmission_bounces = 14; cy.glossy_bounces = 10; cy.diffuse_bounces = 4; cy.volume_bounces = 0; cy.transparent_max_bounces = 16
    cy.sample_clamp_indirect = 6.0; cy.sample_clamp_direct = 0.0; cy.filter_width = 1.1; cy.caustics_reflective = False; cy.caustics_refractive = False
    vs = sc.view_settings; vs.view_transform = os.environ.get('TG_VT', 'AgX'); vs.look = os.environ.get('TG_LOOK', 'None'); vs.exposure = _f('TG_EXP', 0.0)
    if os.environ.get('TG_CROP'):
        x0, y0, x1, y1 = [float(v) for v in os.environ['TG_CROP'].split(',')]; r.use_border = True; r.use_crop_to_border = True
        r.border_min_x, r.border_max_x = x0, x1; r.border_min_y, r.border_max_y = 1 - y1, 1 - y0


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    settings(sc); build(sc)
    sc.render.filepath = OUT
    import time; t = time.time(); bpy.ops.render.render(write_still=True); print('готово: %s  %.0f с  %dx%d  %d spp' % (OUT, time.time() - t, RW, RH, SPP))


if __name__ == '__main__':
    main()
