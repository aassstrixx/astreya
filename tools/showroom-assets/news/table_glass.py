#!/usr/bin/env python3
"""Стеклянный круглый стол для страницы «Новости» (news.html, css/news-table.css): вид сверху на толстую круглую столешницу из прозрачного стекла и светлый каменный пол вокруг.
Журнал рисует HTML поверх картинки, поэтому здесь его нет; под ним на стекле оставлен спокойный участок (отражение окна лежит у левого края стекла, царапины — тонкие и слабые).

Сцена (Blender / Cycles, CPU, OIDN), масштаб как в остальных сценах сайта — миниатюра: 1 ед. = 10 см (стекло Ø 90 см = 9 ед.):
  • стекло: диск Ø 9 ед., толщина 2 см; верхняя кромка — полированная фаска 11×9 мм, углы скруглены; настоящее преломление и отражение (Glass BSDF, IOR 1,52), поглощение в толще — зеленоватая кромка;
    микроцарапины и пылинки (процедурная карта → шероховатость и широкий блестящий лобус: царапина «зажигается» рядом с отражением окна, на тёмном фоне почти не видна);
    для теневых лучей стекло — прозрачная плёнка с тоном (приём проекта: иначе свет не проходит к полу), его тень на полу мягкая и слабая; кромка — стекло с лёгким рассеянием,
    чтобы свет не застревал в толще (чёрная кайма от полного внутреннего отражения);
  • основание: низкий каменный барабан (травертин, темнее пола) под центром стекла с латунной шайбой по краю — виден сквозь стекло, отбрасывает тень вправо-вниз, прячется под журналом;
  • пол: плиты травертина 1,2×0,6 м вразбежку (пак CC0 travertine-ivory: цвет и жилы, контраст усилен, жёлтый приглушён), швы с фасками, у каждой плиты свой кусок рисунка и тон,
    процедурные поры трёх размеров (вытянуты вдоль слоёв) и микрозерно, матовая шлифовка;
  • свет: окно слева сверху (прямоугольный источник, 40° над горизонтом, тёплый) + узкое «солнце» с тем же направлением (чёткие тени барабана и листвы) + мягкий свет неба; тень листвы — ветка
    из assets/showroom/layer-plant.webp между окном и полом (ветка камере не видна), падает в правый верхний угол кадра, как тени оливы в зале главной; два невидимых камере и полу «экрана» над столом
    видны только отражениям: высокое окно с переплётами (ложится на левый край стекла) и широкая светлая вуаль потолка (отличает стекло от камня вокруг);
  • камера: перспектива, объектив 63 мм на высоте 3 м прямо над центром; кадр = плоскость страницы 3400×2260 px (1 px страницы = 0,5 мм на уровне столешницы).

Параметры на плоскости страницы 3400×2260 (центр стола = центр плоскости (1700, 1130)): стекло R = 900 px (фаска — внешние 22 px), барабан R = 240 px (шайба до R ≈ 256 px), пол — всё остальное;
тень барабана, журнала и листвы падает вправо-вниз (стекло на высоте 40 см: смещение тени на полу ≈ (+800; +520) px).

Режимы для слоёв теней журнала (см. table_glass_shadows.py): TG_SIMPLE=1 — без стекла, барабана, листвы и экранов, ровный пол; TG_BOOK=closed|open — журнал (камере невидим) лежит на стекле; TG_CROP — участок кадра.

Запуск (нужен bpy; ≈ 30 мин на 4 ядрах при 128 сэмплах):
  python3 tools/showroom-assets/news/table_glass.py /tmp/table_glass_raw.png          # 2880×1914, 16-битный PNG (TG_SPP=128 — как в боевом кадре)
  python3 tools/showroom-assets/news/table_glass_post.py /tmp/table_glass_raw.png     # цвет + assets/news/table-glass.webp и table-glass-m.webp
Быстрый пробный кадр: TG_W=960 TG_SPP=32 …; участок кадра в полном размере: TG_CROP=x0,y0,x1,y1 (доли кадра).
Переменные: TG_W (ширина, 2880), TG_SPP (сэмплов, 112), TG_EXP (экспозиция, −0,4), TG_KEY / TG_SUN / TG_SKY (окно, солнце, небо), TG_WIN / TG_WX / TG_WW (яркость, положение и ширина отражаемого окна),
TG_SHEEN (вуаль потолка), TG_SCR (заметность царапин), TG_ABD (поглощение в толще стекла), TG_CHW / TG_CHH (фаска), TG_LEAF=0 (без тени листвы), TG_RING=0 (без латунной шайбы),
TG_THREADS (4), TG_TMP (куда класть процедурные карты)."""
import bpy, bmesh, math, os, sys
import numpy as np
import cv2
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
TEXD = os.path.join(ROOT, 'tools', 'showroom-assets', 'textures')
_f = lambda k, d: float(os.environ.get(k, d))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.environ.get('TG_TMP', '/tmp'), 'table_glass_raw.png')
TMP = os.environ.get('TG_TMP', '/tmp'); os.makedirs(TMP, exist_ok=True)
SIMPLE = os.environ.get('TG_SIMPLE') == '1'               # упрощённая сцена для слоёв теней: без стекла, барабана, листвы и экранов отражений, ровный пол — в слое остаётся только тень журнала
BOOK = os.environ.get('TG_BOOK', '')                       # '' — обычный кадр; 'closed' / 'open' — слой тени журнала (см. table_glass_shadows.py): журнал камере невидим, отбрасывает тень и подсвечивает пол
RW = int(_f('TG_W', 2880)); RH = round(RW * 2260 / 3400); SPP = int(_f('TG_SPP', 112))

# ---------------------------------------------------------------------------------------------------------------- размеры (1 ед. = 10 см)
U = 10.0                                  # ед. на метр
PLANE_W = 17.0                            # ширина кадра на уровне столешницы (3400 px × 0,5 мм)
PX = PLANE_W / 3400.0                     # ед. на px страницы
R_GLASS = 900 * PX                        # радиус стекла 4,5 ед. (45 см)
T_GLASS = .20                             # толщина 2 см
Z_TOP = 4.0                               # верх стекла над полом (40 см)
Z_BOT = Z_TOP - T_GLASS
ARRIS = _f('TG_ARRIS', .09)               # радиус закругления кромки 9 мм
R_DRUM = _f('TG_RD', 240) * PX            # радиус барабана 1,2 ед. (≈ 240 px страницы)
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
    # волосяные царапины: короткие, почти прямые, чуть изогнутые; по всему диску равномерно, без «трещин» из центра
    sc = np.zeros((S, S), np.float32)
    for i in range(330):
        r = math.sqrt(rng.uniform(0, 1)) * c * .96; ang = rng.uniform(0, 2 * math.pi); x0, y0 = c + r * math.cos(ang), c + r * math.sin(ang)
        L = rng.uniform(40, 300) * (3.5 if rng.random() < .06 else 1.0); th0 = rng.uniform(0, 2 * math.pi); turn = rng.normal(0, .22)
        pts = [(x0 + math.cos(th0 + turn * k / 14) * L * k / 14, y0 + math.sin(th0 + turn * k / 14) * L * k / 14) for k in range(15)]
        stroke(sc, pts, 1, rng.uniform(.14, .55))
    # длинные редкие дуги — следы протирания тканью (по всему диску, не сходятся в центре)
    sw = np.zeros((S, S), np.float32)
    for i in range(14):
        r = math.sqrt(rng.uniform(0, 1)) * c * .9; ang = rng.uniform(0, 2 * math.pi); x, y = c + r * math.cos(ang), c + r * math.sin(ang)
        t = rng.uniform(0, 2 * math.pi); turn = rng.choice([-1, 1]) * rng.uniform(.0002, .0007); step = rng.uniform(.5, 1.6) * S / 70; pts = []
        for k in range(60):
            pts.append((x, y)); x += math.cos(t) * step; y += math.sin(t) * step; t += turn * step
        stroke(sw, pts, 3, rng.uniform(.10, .30))
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
def stone_mat(name, tile_units=12.0, slab=(12.0, 6.0), joints=True, albedo=(.83, .79, .72), chroma=.42, honed=.34, pits=1.0, seed=1, cboost=2.1):
    """травертин: цвет и жилы — из пака CC0 (travertine-ivory), приглушён к нейтрально-тёплому тону (chroma — доля исходной насыщенности), плиты slab вразбежку, у каждой свой кусок рисунка,
    швы, процедурные поры (вытянутые вдоль слоёв) и микрозерно; матовая шлифовка"""
    m = bpy.data.materials.new(name); nt = nodes_of(m)
    out = N(nt, 'ShaderNodeOutputMaterial'); b = N(nt, 'ShaderNodeBsdfPrincipled'); link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    tc = N(nt, 'ShaderNodeTexCoord'); sp = N(nt, 'ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Object'], sp.inputs[0]); X, Y = sp.outputs['X'], sp.outputs['Y']
    SW, SH = slab
    if joints:
        X = math_(nt, 'ADD', X, _f('TG_JX', 4.3)); Y = math_(nt, 'ADD', Y, _f('TG_JY', 2.1))                                 # сетка швов сдвинута: шов не проходит через центр стола
        row = math_(nt, 'FLOOR', math_(nt, 'DIVIDE', Y, SH)); xs = math_(nt, 'SUBTRACT', X, math_(nt, 'MULTIPLY', row, SW * .43))        # ряды вразбежку: сдвиг 0,43 длины плиты
        col = math_(nt, 'FLOOR', math_(nt, 'DIVIDE', xs, SW)); fx = math_(nt, 'SUBTRACT', xs, math_(nt, 'MULTIPLY', col, SW)); fy = math_(nt, 'SUBTRACT', Y, math_(nt, 'MULTIPLY', row, SH))
        dj = math_(nt, 'MINIMUM', math_(nt, 'MINIMUM', fx, math_(nt, 'SUBTRACT', SW, fx)), math_(nt, 'MINIMUM', fy, math_(nt, 'SUBTRACT', SH, fy)))        # расстояние до ближайшего шва, ед.
        idv = N(nt, 'ShaderNodeCombineXYZ'); link(nt, col, idv.inputs['X']); link(nt, math_(nt, 'ADD', row, seed * 7.0), idv.inputs['Y'])
        wn = N(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='3D'); link(nt, idv.outputs[0], wn.inputs['Vector'])
        sep2 = N(nt, 'ShaderNodeSeparateColor'); link(nt, wn.outputs['Color'], sep2.inputs['Color'])
        off = N(nt, 'ShaderNodeCombineXYZ'); link(nt, sep2.outputs['Red'], off.inputs['X']); link(nt, sep2.outputs['Green'], off.inputs['Y'])
        tone = math_(nt, 'ADD', .94, math_(nt, 'MULTIPLY', sep2.outputs['Blue'], .12))                         # каждая плита чуть светлее или темнее соседних (±6%)
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
    mean_c = (.737, .603, .418, 1.0); lm0 = float(np.array(mean_c[:3]) @ [.2126, .7152, .0722])
    dmean0 = tuple(lm0 + chroma * (mc - lm0) for mc in mean_c[:3]) + (1.0,)
    bst = nt.nodes.new('ShaderNodeMix'); bst.data_type = 'RGBA'; bst.clamp_factor = False; bst.clamp_result = True; bst.inputs['A'].default_value = dmean0; bst.inputs['Factor'].default_value = cboost
    link(nt, dull, bst.inputs['B']); dull = bst.outputs['Result']                                                  # контраст жил и пятен: исходный пак очень ровный (σ ≈ 3 %), на экране он «исчезает»
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
    p0 = pores(1.35, 1 - .075 * pits, .30, .60); p1 = pores(2.4, 1 - .105 * pits, .42, .50); p2 = pores(8.0, 1 - .15 * pits, .55, .42)
    pit = math_(nt, 'MAXIMUM', math_(nt, 'MAXIMUM', math_(nt, 'MULTIPLY', p0, .95), math_(nt, 'MULTIPLY', p1, .85)), math_(nt, 'MULTIPLY', p2, .70))
    fine = noise_(nt, tc.outputs['Object'], 70.0, 6, .62)
    col = mix_(nt, col, (.40 * albedo[0] / .8, .35 * albedo[1] / .8, .28 * albedo[2] / .8, 1.0), math_(nt, 'MULTIPLY', pit, .85))          # поры темнее камня
    gr = noise_(nt, tc.outputs['Object'], 320.0, 3, .5)                                                                       # микрозерно в цвете (переживает шумоподавление через альбедо-проход)
    gc = N(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); gc.inputs['Factor'].default_value = 1.0; link(nt, col, gc.inputs['A'])
    gk = N(nt, 'ShaderNodeCombineColor'); [link(nt, math_(nt, 'ADD', .95, math_(nt, 'MULTIPLY', gr, .10)), gk.inputs[i]) for i in range(3)]; link(nt, gk.outputs['Color'], gc.inputs['B']); col = gc.outputs['Result']
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
    scr = _f('TG_SCR', .55)
    # низкочастотная волнистость поверхности: настоящее флоат-стекло чуть «играет» в отражении — мягкие полосы вместо однотонной пелены
    wave = noise_(nt, tc.outputs['Object'], .42, 2, .5, .5)
    rough = math_(nt, 'ADD', .004, math_(nt, 'MULTIPLY', dv, .10 * scr), clamp=True)
    gl = N(nt, 'ShaderNodeBsdfGlass', distribution='MULTI_GGX'); gl.inputs['IOR'].default_value = 1.52; gl.inputs['Color'].default_value = (.985, 1.0, .99, 1); link(nt, rough, gl.inputs['Roughness'])
    bpn = N(nt, 'ShaderNodeBump'); bpn.inputs['Strength'].default_value = .05; bpn.inputs['Distance'].default_value = .004; link(nt, wave, bpn.inputs['Height']); link(nt, bpn.outputs['Normal'], gl.inputs['Normal'])
    # рассеяние света на царапинах и пыли: широкий блестящий лобус — царапина «зажигается», когда рядом в отражении окно (как у настоящего стекла), на тёмном фоне почти не видна
    gs = N(nt, 'ShaderNodeBsdfGlossy', distribution='MULTI_GGX'); gs.inputs['Roughness'].default_value = _f('TG_SCRR', .42); gs.inputs['Color'].default_value = (.96, .97, .96, 1)
    df = N(nt, 'ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (.95, .96, .95, 1)
    dg = N(nt, 'ShaderNodeMixShader'); dg.inputs['Fac'].default_value = .12; link(nt, gs.outputs['BSDF'], dg.inputs[1]); link(nt, df.outputs['BSDF'], dg.inputs[2])
    sc_mix = N(nt, 'ShaderNodeMixShader'); link(nt, math_(nt, 'MULTIPLY', dv, .55 * scr, clamp=True), sc_mix.inputs['Fac']); link(nt, gl.outputs['BSDF'], sc_mix.inputs[1]); link(nt, dg.outputs['Shader'], sc_mix.inputs[2])
    # теневые лучи: плёнка с тоном стекла
    tr = N(nt, 'ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (_f('TG_SHR', .90), _f('TG_SHG', .92), _f('TG_SHB', .90), 1)
    lp = N(nt, 'ShaderNodeLightPath'); fin = N(nt, 'ShaderNodeMixShader'); link(nt, lp.outputs['Is Shadow Ray'], fin.inputs['Fac']); link(nt, sc_mix.outputs['Shader'], fin.inputs[1]); link(nt, tr.outputs['BSDF'], fin.inputs[2])
    link(nt, fin.outputs['Shader'], out.inputs['Surface'])
    ab = N(nt, 'ShaderNodeVolumeAbsorption'); ab.inputs['Color'].default_value = (_f('TG_ABR', .92), _f('TG_ABG', .975), _f('TG_ABB', .945), 1); ab.inputs['Density'].default_value = _f('TG_ABD', 5.0); link(nt, ab.outputs['Volume'], out.inputs['Volume'])
    return m


def glass_edge_mat():
    """торец и закругление кромки: полированное толстое стекло видно сверху светло-зелёной полосой; чтобы свет не застревал в толще (чёрная кайма от полного внутреннего отражения),
    к стеклу подмешано мягкое рассеяние — как в настоящей кромке с микрошероховатостью"""
    m = bpy.data.materials.new('tg_glass_edge'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial')
    gl = N(nt, 'ShaderNodeBsdfGlass'); gl.inputs['IOR'].default_value = 1.52; gl.inputs['Roughness'].default_value = .03; gl.inputs['Color'].default_value = (.80, .96, .88, 1)
    tl = N(nt, 'ShaderNodeBsdfTranslucent'); tl.inputs['Color'].default_value = (.62, .85, .74, 1)
    mx = N(nt, 'ShaderNodeMixShader'); mx.inputs['Fac'].default_value = _f('TG_EDGE', .25); link(nt, gl.outputs['BSDF'], mx.inputs[1]); link(nt, tl.outputs['BSDF'], mx.inputs[2])
    tr = N(nt, 'ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (.80, .90, .85, 1)
    lp = N(nt, 'ShaderNodeLightPath'); fin = N(nt, 'ShaderNodeMixShader'); link(nt, lp.outputs['Is Shadow Ray'], fin.inputs['Fac']); link(nt, mx.outputs['Shader'], fin.inputs[1]); link(nt, tr.outputs['BSDF'], fin.inputs[2]); link(nt, fin.outputs['Shader'], out.inputs['Surface'])
    return m


def sheen_panel_mat(s_sh):
    """«потолок» над столом, видимый только отражениям: широкий мягкий градиент (светлее у окна — слева сверху), даёт на стекле лёгкую светлую вуаль и отличает его от камня вокруг"""
    m = bpy.data.materials.new('tg_sheen'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial'); em = N(nt, 'ShaderNodeEmission')
    tc = N(nt, 'ShaderNodeTexCoord'); sp = N(nt, 'ShaderNodeSeparateXYZ'); link(nt, tc.outputs['UV'], sp.inputs[0]); u, v = sp.outputs['X'], sp.outputs['Y']
    t = math_(nt, 'ADD', math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', 1.0, u), .62), math_(nt, 'MULTIPLY', v, .38))             # 1 — левый верх, 0 — правый низ
    st = math_(nt, 'MULTIPLY', math_(nt, 'ADD', .22, math_(nt, 'MULTIPLY', smooth_(nt, t, .15, .95), .78)), s_sh)
    em.inputs['Color'].default_value = (1.0, .985, .955, 1); link(nt, st, em.inputs['Strength']); link(nt, em.outputs['Emission'], out.inputs['Surface'])
    m.cycles.emission_sampling = 'NONE'
    return m


def plain_mat():
    m = bpy.data.materials.new('tg_plain'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial'); b = N(nt, 'ShaderNodeBsdfPrincipled'); link(nt, b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Base Color'].default_value = (.62, .55, .44, 1); b.inputs['Roughness'].default_value = .9; return m


def brass_mat():
    m = bpy.data.materials.new('tg_brass'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial'); b = N(nt, 'ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (.86, .65, .35, 1); b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = .27; link(nt, b.outputs['BSDF'], out.inputs['Surface']); return m


def window_panel_mat(s_win):
    """светлое окно, видимое только отражениям: высокая створка с горизонтальными переплётами, мягкая яркость — сильнее у левого края («улица»), к столу слабее"""
    m = bpy.data.materials.new('tg_window'); nt = nodes_of(m); out = N(nt, 'ShaderNodeOutputMaterial'); em = N(nt, 'ShaderNodeEmission')
    tc = N(nt, 'ShaderNodeTexCoord'); sp = N(nt, 'ShaderNodeSeparateXYZ'); link(nt, tc.outputs['UV'], sp.inputs[0]); u, v = sp.outputs['X'], sp.outputs['Y']
    eu = math_(nt, 'MINIMUM', u, math_(nt, 'SUBTRACT', 1.0, u)); ev = math_(nt, 'MINIMUM', v, math_(nt, 'SUBTRACT', 1.0, v))
    edge = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', smooth_(nt, u, .0, .03), smooth_(nt, math_(nt, 'SUBTRACT', 1.0, u), .0, _f('TG_WSOFT', .45))), smooth_(nt, ev, .0, .020))
    rows = int(_f('TG_WROWS', 3)); cols = int(_f('TG_WCOLS', 2)); bars = 1.0
    for k in range(1, cols):
        bars = math_(nt, 'MULTIPLY', bars, smooth_(nt, math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', u, k / cols)), .007, .014))
    for k in range(1, rows):
        bars = math_(nt, 'MULTIPLY', bars, smooth_(nt, math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', v, k / rows)), .008, .016))
    grad = math_(nt, 'ADD', .78, math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', 1.0, u), .22))
    st = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', edge, bars), math_(nt, 'MULTIPLY', grad, s_win))
    em.inputs['Color'].default_value = (1.0, .97, .92, 1); link(nt, st, em.inputs['Strength']); link(nt, em.outputs['Emission'], out.inputs['Surface'])
    m.cycles.emission_sampling = 'NONE'                                                       # не источник света для NEE: стол освещает только «окно» key, панель лишь отражается в стекле
    return m


# ---------------------------------------------------------------------------------------------------------------- геометрия
def lathe(name, profile, segs, mat, side_mat=None):
    """тело вращения вокруг оси Z по профилю [(r, z), …] от нижней оси к верхней. У каждого отрезка профиля свои кольца вершин: нормали сглаживаются только по окружности,
    поэтому плоские грани (боковая, фаска) остаются строго плоскими вдоль профиля и не «заплывают» около скруглений; крышки — отдельные плоские n-угольники"""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); pts = profile
    ring = lambda r, z: [bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)]
    inner = pts[1:-1]
    for (r0, z0), (r1, z1) in zip(inner[:-1], inner[1:]):
        a, b = ring(r0, z0), ring(r1, z1)
        for i in range(segs):
            j = (i + 1) % segs; f = bm.faces.new((a[i], a[j], b[j], b[i])); f.smooth = True; f.material_index = 1 if side_mat else 0
    for (r, z), up in ((inner[0], False), (inner[-1], True)):
        cap = ring(r, z); f = bm.faces.new(cap if up else cap[::-1]); f.smooth = False
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.data.materials.append(mat)
    if side_mat: ob.data.materials.append(side_mat)
    return ob


def rounded(points, radii, n=5):
    """ломаная с круглением углов: на каждом внутреннем углу отрезок заменяется квадратичной кривой Безье (радиус — отступ вдоль сторон)"""
    out = [points[0]]
    for k in range(1, len(points) - 1):
        p0, c, p1 = Vector(points[k - 1]), Vector(points[k]), Vector(points[k + 1]); d = radii[k - 1]
        u0 = (p0 - c).normalized() * min(d, (p0 - c).length * .45); u1 = (p1 - c).normalized() * min(d, (p1 - c).length * .45); a, b = c + u0, c + u1
        for t in [i / n for i in range(n + 1)]:
            q = (1 - t) ** 2 * a + 2 * t * (1 - t) * c + t * t * b; out.append((q.x, q.y))
    out.append(points[-1]); return out


def annulus(name, r0, r1, z0, z1, segs, mat):
    """плоское кольцо (шайба): верх, низ, внешняя и внутренняя боковые грани"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    ring = lambda r, z: [bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)]
    def strip(a, b, flip, smooth):
        for i in range(segs):
            j = (i + 1) % segs; f = bm.faces.new((a[i], a[j], b[j], b[i]) if not flip else (b[i], b[j], a[j], a[i])); f.smooth = smooth
    strip(ring(r0, z1), ring(r1, z1), True, False); strip(ring(r0, z0), ring(r1, z0), False, False)          # верх (нормаль вверх), низ
    strip(ring(r1, z0), ring(r1, z1), False, True); strip(ring(r0, z0), ring(r0, z1), True, True)             # внешняя, внутренняя
    bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.data.materials.append(mat); return ob


CHW, CHH = _f('TG_CHW', .11), _f('TG_CHH', .09)          # фаска по верхней кромке: 11 мм по горизонтали и 9 мм по вертикали (≈ 40°) — полированная фаска толстого стекла


def glass_profile():
    """профиль стекла: плоское дно, боковая грань, наклонная полированная фаска сверху, плоский верх; углы скруглены (0,3–0,5 мм) — кромки ловят свет, а не режут бритвой"""
    R = R_GLASS
    return rounded([(0, Z_BOT), (R, Z_BOT), (R, Z_TOP - CHH), (R - CHW, Z_TOP), (0, Z_TOP)], [.025, .035, .035], 4)


def leaf_alpha_png(path):
    """маска листвы: верхняя часть assets/showroom/layer-plant.webp (ветка без вазы-шара), только альфа; лёгкое размытие 0,8 px"""
    from PIL import Image
    im = Image.open(os.path.join(ROOT, 'assets', 'showroom', 'layer-plant.webp')).convert('RGBA'); a = np.asarray(im)[..., 3].astype(np.float32)[:853] / 255.0
    a = cv2.GaussianBlur(a, (0, 0), .8); out = np.dstack([np.ones_like(a)] * 3 + [a]); cv2.imwrite(path, (out[..., [2, 1, 0, 3]] * 255).astype(np.uint8)); return path


def build(sc):
    # ---- пол
    floor_m = plain_mat() if SIMPLE else stone_mat('tg_floor', joints=True, albedo=(_f('TG_FR', .80), _f('TG_FG', .72), _f('TG_FB', .60)), chroma=_f('TG_FCH', .62))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0)); fl = bpy.context.object; fl.name = 'floor'; fl.scale = (60, 44, 1); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); fl.data.materials.append(floor_m)
    if not SIMPLE:
        # ---- стекло
        dust = make_dust_map(os.path.join(TMP, 'tg_dust.png'))
        gm = glass_mat(dust)
        g = lathe('glass', glass_profile(), 360, gm, glass_edge_mat())
        # ---- барабан-основание
        dm = stone_mat('tg_drum', joints=False, albedo=(_f('TG_DR', .60), _f('TG_DG', .51), _f('TG_DB', .42)), chroma=_f('TG_FCH', .62), honed=.55, cboost=1.4)
        drum_top = Z_BOT - .075
        d = lathe('drum', rounded([(0, 0), (R_DRUM, 0), (R_DRUM, drum_top), (0, drum_top)], [.03, .045], 4), 200, dm)
        # латунное кольцо-прокладка между барабаном и стеклом: тонкая линия фирменной латуни, видна сквозь стекло по кромке барабана
        if os.environ.get('TG_RING', '1') == '1':
            annulus('collar', R_DRUM - .03, R_DRUM + .08, drum_top, drum_top + .03, 200, brass_mat())
    # ---- свет
    key = bpy.data.lights.new('key', 'AREA'); key.shape = 'RECTANGLE'; key.size = _f('TG_KS', 6.0); key.size_y = _f('TG_KS', 6.0) * 1.35
    key.energy = _f('TG_KEY', 20000.0); key.color = (1.0, .92, .80)
    ko = bpy.data.objects.new('key', key); sc.collection.objects.link(ko); ko.location = Vector((_f('TG_KX', -15.0), _f('TG_KY', 10.0), _f('TG_KZ', 21.0)))
    ko.rotation_euler = (Vector((2.0, -1.0, Z_TOP)) - ko.location).to_track_quat('-Z', 'Y').to_euler()
    ko.visible_camera = False
    # мягкий контровой свет справа-сверху (отражённый от стен), слабый
    rf = bpy.data.lights.new('rim', 'AREA'); rf.shape = 'RECTANGLE'; rf.size = 16; rf.size_y = 12; rf.energy = _f('TG_RIM', 5500.0); rf.color = (.90, .94, 1.0)
    ro = bpy.data.objects.new('rim', rf); sc.collection.objects.link(ro); ro.location = Vector((19.0, -9.0, 24.0)); ro.rotation_euler = (Vector((0, 0, Z_TOP)) - ro.location).to_track_quat('-Z', 'Y').to_euler(); ro.visible_camera = False; ro.visible_glossy = False
    # ---- тень листвы: ветка с листьями (тот же рисунок, что в зале и в витрине каталога) между окном и полом отбрасывает мягкую тень в верхний правый угол кадра — как тени оливы в зале главной;
    #      сама ветка камере, отражениям и диффузному свету не видна (только тень); добавлен узкий солнечный свет: даёт тени листьев чёткий рисунок под мягким светом окна
    if _f('TG_LEAF', 1.0) > 0 and not SIMPLE:
        lp = leaf_alpha_png(os.path.join(TMP, 'tg_leaf.png'))
        lm = bpy.data.materials.new('tg_leaf'); nt = nodes_of(lm); out = N(nt, 'ShaderNodeOutputMaterial'); pb = N(nt, 'ShaderNodeBsdfPrincipled'); link(nt, pb.outputs['BSDF'], out.inputs['Surface'])
        tx = img_tex(nt, lp, 'Non-Color', N(nt, 'ShaderNodeTexCoord').outputs['UV'], 'Linear'); link(nt, tx.outputs['Alpha'], pb.inputs['Alpha'])
        Sx, Sy = _f('TG_LX', 6.0), _f('TG_LY', 2.6); Lp = Vector((_f('TG_KX', -15.0), _f('TG_KY', 10.0), _f('TG_KZ', 21.0))); T0 = Vector((2.0, -1.0, Z_TOP))
        dh = (T0 - Lp).normalized(); Sp = Vector((Sx, Sy, 0.0)); pos = Sp - dh * (_f('TG_LH', 5.0) / -dh.z)            # ветка стоит на обратном луче солнца над точкой тени
        bpy.ops.mesh.primitive_plane_add(size=1, location=pos); lf = bpy.context.object; lf.name = 'leaves'; lf.scale = (_f('TG_LW', 9.0), _f('TG_LW', 9.0) * 853 / 1589, 1)
        lf.rotation_euler = (-dh).to_track_quat('Z', 'Y').to_euler(); lf.rotation_euler.rotate_axis('Z', math.radians(_f('TG_LR', 20.0))); lf.data.materials.append(lm)
        lf.visible_camera = bool(os.environ.get('TG_LEAFDBG')); lf.visible_diffuse = False; lf.visible_glossy = False; lf.visible_transmission = False; lf.visible_volume_scatter = False
    T0 = Vector((2.0, -1.0, Z_TOP)); Lp = Vector((_f('TG_KX', -15.0), _f('TG_KY', 10.0), _f('TG_KZ', 21.0))); dh = (T0 - Lp).normalized()
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = _f('TG_SUN', 7.0); sun.angle = math.radians(_f('TG_SUNA', .7)); sun.color = (1.0, .93, .82)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = dh.to_track_quat('-Z', 'Y').to_euler(); so.visible_glossy = False
    # ---- мир: холодный мягкий свет потолка и неба
    w = bpy.data.worlds.new('w'); w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
    bg.inputs['Color'].default_value = (1.0, .975, .94, 1); bg.inputs['Strength'].default_value = _f('TG_SKY', .45); sc.world = w
    if not SIMPLE:
        # ---- отражаемое окно: панель над столом, камере невидима, освещения не даёт
        pm = window_panel_mat(_f('TG_WIN', 125.0))
        bpy.ops.mesh.primitive_plane_add(size=1, location=(_f('TG_WX', -5.2), _f('TG_WY', .8), Z_TOP + _f('TG_WZ', 13.0))); wp = bpy.context.object; wp.name = 'window'
        wp.scale = (_f('TG_WW', 4.4), _f('TG_WH', 9.0), 1); wp.rotation_euler = (math.pi, 0, math.radians(_f('TG_WR', 0.0))); wp.data.materials.append(pm)
        wp.visible_camera = False; wp.visible_diffuse = False; wp.visible_shadow = False; wp.visible_transmission = False
        # ---- «потолок»-вуаль: только для отражений в стекле
        sm = sheen_panel_mat(_f('TG_SHEEN', 5.5))
        bpy.ops.mesh.primitive_plane_add(size=1, location=(_f('TG_SX', -2.0), _f('TG_SY', 1.5), Z_TOP + _f('TG_SZ', 16.0))); sp_ = bpy.context.object; sp_.name = 'sheen'
        sp_.scale = (_f('TG_SW', 26.0), _f('TG_SH', 20.0), 1); sp_.rotation_euler = (math.pi, 0, 0); sp_.data.materials.append(sm)
        sp_.visible_camera = False; sp_.visible_diffuse = False; sp_.visible_shadow = False; sp_.visible_transmission = False
    # ---- журнал (только для слоёв теней): закрытая обложка 500×676 px страницы = 2,5×3,38 ед. (25×33,8 см) либо разворот вдвое шире; лежит на стекле, толщина 3 мм
    if BOOK in ('closed', 'open'):
        pw, ph = 500 * PX, 676 * PX; w = pw if BOOK == 'closed' else 2 * pw; th = .03 if BOOK == 'closed' else .026
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, Z_TOP + th / 2)); bk = bpy.context.object; bk.name = 'magazine'; bk.scale = (w, ph, th)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bv = bk.modifiers.new('bev', 'BEVEL'); bv.width = .012; bv.segments = 2; bv.limit_method = 'ANGLE'
        pm_ = bpy.data.materials.new('tg_paper'); nt = nodes_of(pm_); out = N(nt, 'ShaderNodeOutputMaterial'); pb = N(nt, 'ShaderNodeBsdfPrincipled'); link(nt, pb.outputs['BSDF'], out.inputs['Surface'])
        pb.inputs['Base Color'].default_value = (.86, .80, .66, 1); pb.inputs['Roughness'].default_value = .85; bk.data.materials.append(pm_)
        bk.visible_camera = False; bk.visible_glossy = False                                # в кадре не виден (его рисует HTML), но закрывает свет и подсвечивает стекло и пол отражённым светом
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
    vs = sc.view_settings; vs.view_transform = os.environ.get('TG_VT', 'AgX'); vs.look = os.environ.get('TG_LOOK', 'AgX - Medium High Contrast'); vs.exposure = _f('TG_EXP', -.4)
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
