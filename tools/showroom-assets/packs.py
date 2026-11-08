#!/usr/bin/env python3
"""Условные макеты упаковки для витрины-шоурума: фотореалистичный 3D-рендер (Blender/Cycles) нейтральных контейнеров БЕЗ текста, логотипов и фирменных форм.
Нужны только пока у товара нет настоящего фото (поле image в админке / data/products.json): с фото витрина показывает его, а макет не используется.
Запуск (нужен пакет bpy: pip install bpy numpy pillow):   python3 tools/showroom-assets/packs.py [тип ...]
Результат: assets/showroom/pack-<тип>[-noir].webp (прозрачный фон) и assets/showroom/packs.json (размеры, область этикетки в долях картинки).

Что делает макеты «настоящими» (а не мультяшными):
  • формы заданы профилем (радиус — высота) с точными скруглениями кромок, а не цилиндрами: плечи флаконов, резьба горлышка, торцевые фаски, шов тубы;
  • материалы — как в производстве: опаловое/тёмное стекло с коротким «лаком», матовый soft-touch пластик с микрошероховатостью, сатиновый шампань-алюминий
    (круговая анизотропия, рифление крышки), каучук пипетки, бумажная этикетка с волокном и тонкой кромкой, картон с зерном и фольга;
  • свет — студия из мягких софтбоксов (длинная вертикальная полоса слева даёт те самые «живые» блики, верхняя панель, тонкий контровой свет справа, тёплый отскок снизу),
    а не равномерный купол; камера — объектив 100 мм (лёгкая перспектива) с наклоном ≈ 6°;
  • блики и тени не «запекаются» чёрным: экспозиция AgX, умеренный контраст.
Переменные: PACK_OUT (папка вывода), PACK_RES (сторона кадра), PACK_SAMPLES, PACK_H (высота итоговой картинки, px)."""
import bpy, math, sys, os, json, addon_utils
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('PACK_OUT') or os.path.join(HERE, '..', '..', 'assets', 'showroom')
os.makedirs(OUT, exist_ok=True)
CM = 0.01
RES = int(os.environ.get('PACK_RES', 1600)); SAMPLES = int(os.environ.get('PACK_SAMPLES', 192)); TARGET_H = int(os.environ.get('PACK_H', 900))
ELEV = math.radians(float(os.environ.get('PACK_ELEV', 6.0)))

# ---------- сцена ----------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable('cycles')
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'
    cy = sc.cycles; cy.device = 'CPU'; cy.samples = SAMPLES; cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
    cy.max_bounces = 14; cy.transmission_bounces = 12; cy.glossy_bounces = 8; cy.diffuse_bounces = 4; cy.transparent_max_bounces = 16
    cy.caustics_reflective = False; cy.caustics_refractive = False; cy.sample_clamp_indirect = 8.0
    sc.render.film_transparent = True; sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = os.environ.get('PACK_LOOK', 'AgX - Medium High Contrast'); sc.view_settings.exposure = float(os.environ.get('PACK_EXP', -0.15))
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
    return sc

# ---------- материалы ----------
def _in(b, *names):
    for n in names:
        if n in b.inputs: return b.inputs[n]
def _set(b, v, *names):
    i = _in(b, *names)
    if i is not None: i.default_value = v
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF'], nt.nodes['Material Output']
def micro(nt, b, base_rough, amp=0.07, scale=140.0, bump=0.0):
    """микрошероховатость: шероховатость слегка «дышит» по поверхности, у матовых материалов — ещё и микрорельеф"""
    tc = nt.nodes.new('ShaderNodeTexCoord'); n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 5; n.inputs['Roughness'].default_value = .6
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = max(0.0, base_rough - amp); mr.inputs['To Max'].default_value = min(1.0, base_rough + amp)
    nt.links.new(n.outputs['Fac'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
    if bump:
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.0006
        nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return n
def mat_plastic(name, col, rough=.42, coat=0.0, sheen=0.25, sss=0.0, spec=.5, bump=0.12):
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, spec, 'Specular IOR Level', 'Specular'); _set(b, coat, 'Coat Weight', 'Clearcoat'); _set(b, .08, 'Coat Roughness', 'Clearcoat Roughness')
    _set(b, sheen, 'Sheen Weight'); _set(b, .5, 'Sheen Roughness'); _set(b, sss, 'Subsurface Weight'); _set(b, (.8, .7, .55), 'Subsurface Radius'); _set(b, .04, 'Subsurface Scale')
    micro(nt, b, rough, .06, 160, bump); return m
def mat_opal(name='opal', col=(.90, .89, .85)):
    """опаловое белое стекло: гладкое, глубокое, чуть просвечивает на кромках"""
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, .13, 'Roughness'); _set(b, .55, 'Coat Weight', 'Clearcoat'); _set(b, .03, 'Coat Roughness', 'Clearcoat Roughness')
    _set(b, .35, 'Subsurface Weight'); _set(b, (.9, .82, .7), 'Subsurface Radius'); _set(b, .05, 'Subsurface Scale'); _set(b, 1.5, 'IOR'); _set(b, .6, 'Specular IOR Level', 'Specular'); return m
def mat_noir_glass(name='noirglass'):
    """тёмное (почти чёрное) стекло: глубокий цвет, чёткие, но не «выжженные» блики"""
    m, nt, b, o = new_mat(name); _set(b, (.018, .016, .015, 1), 'Base Color'); _set(b, .06, 'Roughness'); _set(b, .6, 'Coat Weight', 'Clearcoat'); _set(b, .02, 'Coat Roughness', 'Clearcoat Roughness'); _set(b, .7, 'Specular IOR Level', 'Specular'); return m
def mat_champagne(name='champagne', col=(.80, .67, .50), rough=.30, ribs=0):
    """сатиновый анодированный алюминий цвета шампань: круговая анизотропия; при ribs>0 — рифление боковой поверхности (регулярные канавки)"""
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, 1.0, 'Metallic'); _set(b, rough, 'Roughness'); _set(b, .55, 'Anisotropic'); _set(b, .4, 'Specular IOR Level', 'Specular')
    tg = nt.nodes.new('ShaderNodeTangent'); tg.direction_type = 'RADIAL'; tg.axis = 'Z'; nt.links.new(tg.outputs['Tangent'], b.inputs['Tangent'])
    n = micro(nt, b, rough, .05, 220, 0.05)
    if ribs:
        tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); at = nt.nodes.new('ShaderNodeMath'); at.operation = 'ARCTAN2'
        mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = float(ribs); sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .55; bp.inputs['Distance'].default_value = 0.0007
        nt.links.new(tc.outputs['Object'], sp.inputs[0]); nt.links.new(sp.outputs['Y'], at.inputs[0]); nt.links.new(sp.outputs['X'], at.inputs[1]); nt.links.new(at.outputs[0], mu.inputs[0]); nt.links.new(mu.outputs[0], sn.inputs[0])
        nt.links.new(sn.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m
def mat_paper(name='paper', col=(.94, .92, .87)):
    """бумажная этикетка: волокно, лёгкая шероховатость, тёплый белый"""
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, .55, 'Roughness'); _set(b, .25, 'Specular IOR Level', 'Specular'); _set(b, .15, 'Sheen Weight')
    tc = nt.nodes.new('ShaderNodeTexCoord'); n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 420; n1.inputs['Detail'].default_value = 8; n1.inputs['Roughness'].default_value = .7
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 90; n2.inputs['Detail'].default_value = 4
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 6)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], n1.inputs['Vector']); nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'; nt.links.new(n1.outputs['Fac'], add.inputs[0]); nt.links.new(n2.outputs['Fac'], add.inputs[1])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .35; bp.inputs['Distance'].default_value = 0.0004; nt.links.new(add.outputs[0], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = (*col, 1); mix.inputs['B'].default_value = (col[0] * .93, col[1] * .93, col[2] * .92, 1)
    nt.links.new(n2.outputs['Fac'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], b.inputs['Base Color']); return m
def mat_ink(name='ink', col=(.55, .48, .38), rough=.5):
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, rough, 'Roughness'); _set(b, .3, 'Specular IOR Level', 'Specular'); return m
def mat_foil(name='foil'):
    m, nt, b, o = new_mat(name); _set(b, (.86, .72, .52, 1), 'Base Color'); _set(b, 1.0, 'Metallic'); _set(b, .22, 'Roughness'); micro(nt, b, .22, .04, 260, .15); return m
def mat_rubber(name='rubber'):
    m, nt, b, o = new_mat(name); _set(b, (.018, .018, .019, 1), 'Base Color'); _set(b, .5, 'Roughness'); _set(b, .35, 'Specular IOR Level', 'Specular'); _set(b, .2, 'Sheen Weight'); micro(nt, b, .5, .08, 90, .25); return m
def mat_carton(name='carton', col=(.92, .90, .85)):
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, .62, 'Roughness'); _set(b, .22, 'Specular IOR Level', 'Specular'); _set(b, .2, 'Sheen Weight')
    n = micro(nt, b, .62, .06, 300, .4); return m
def mat_liquid(name='serum', col=(.93, .80, .45)):
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, 1.0, 'Transmission Weight', 'Transmission'); _set(b, .01, 'Roughness'); _set(b, 1.34, 'IOR'); return m
def mat_clear_glass(name='glass', tint=(.90, .95, .92)):
    m, nt, b, o = new_mat(name); _set(b, (*tint, 1), 'Base Color'); _set(b, 1.0, 'Transmission Weight', 'Transmission'); _set(b, .012, 'Roughness'); _set(b, 1.5, 'IOR'); _set(b, .7, 'Specular IOR Level', 'Specular'); return m

def mat_pearl(name='pearl', col=(.93, .925, .91), rough=.30):
    """глянцево-жемчужный белый пластик (как на образце): мягкий градиент, широкий блик студии, тонкий лаковый слой, лёгкий свет изнутри"""
    return mat_plastic(name, col, rough=rough, coat=.5, sheen=.12, sss=.12, spec=.55, bump=.03)
def mat_accent(name, col, rough=.28):
    m = mat_plastic(name, col, rough=rough, coat=.5, sheen=.08, sss=.05, spec=.55, bump=.03); return m
def mat_color_glass(name, col, rough=.018, ior=1.52):
    """цветное стекло флакона: глубокий насыщенный цвет, чёткие блики студии"""
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, 1.0, 'Transmission Weight', 'Transmission'); _set(b, rough, 'Roughness'); _set(b, ior, 'IOR'); _set(b, .7, 'Specular IOR Level', 'Specular'); return m
def mat_lacquer(name, col, rough=.09, coat=.75):
    """глянцевый лак (баночка): глубокий цвет под прозрачным слоем"""
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, rough, 'Roughness'); _set(b, coat, 'Coat Weight', 'Clearcoat'); _set(b, .03, 'Coat Roughness', 'Clearcoat Roughness'); _set(b, .55, 'Specular IOR Level', 'Specular'); return m
def mat_chrome(name='chrome', col=(.82, .80, .76), rough=.14):
    m, nt, b, o = new_mat(name); _set(b, (*col, 1), 'Base Color'); _set(b, 1.0, 'Metallic'); _set(b, rough, 'Roughness'); micro(nt, b, rough, .03, 300, .04); return m
def add_ribs(m, n, k=.4):
    """вертикальные рёбра по боковой поверхности (bump sin(n·угол))"""
    nt = m.node_tree; pb = nt.nodes['Principled BSDF']; prev = pb.inputs['Normal'].links[0].from_socket if pb.inputs['Normal'].links else None
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); at = nt.nodes.new('ShaderNodeMath'); at.operation = 'ARCTAN2'
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = float(n); sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = k; bp.inputs['Distance'].default_value = 0.0006
    nt.links.new(tc.outputs['Object'], sp.inputs[0]); nt.links.new(sp.outputs['Y'], at.inputs[0]); nt.links.new(sp.outputs['X'], at.inputs[1]); nt.links.new(at.outputs[0], mu.inputs[0]); nt.links.new(mu.outputs[0], sn.inputs[0])
    nt.links.new(sn.outputs[0], bp.inputs['Height'])
    if prev is not None: nt.links.new(prev, bp.inputs['Normal'])
    nt.links.new(bp.outputs['Normal'], pb.inputs['Normal']); return m

STYLES = {          # бренды-партнёры: гарнитура названия, цвет акцента и отделки — по образцу заказчика (белый жемчужный пластик, бирюзовое стекло Endocare, оранжевая полоса Heliocare, фиолетовый колпачок Neoretin); синего нет
    'dermatime': dict(name='Dermatime', body='pearl', cap='pearl', ring='chrome', ink=(24, 24, 26), accent=None, glass='opal', font='serif', case='title', track=.03),
    'keenwell': dict(name='Keenwell', body='noir', cap='noir', ring='champ', ink=(208, 182, 138), accent=None, glass='smoke', font='light', case='upper', track=.24),
    'endocare': dict(name='Endocare', body='pearl', cap='pearl', ring='chrome', ink=(24, 24, 26), accent=(20, 112, 120), glass='teal', font='bold', case='upper', track=.06, gink=(244, 244, 240)),
    'neoretin': dict(name='Neoretin', body='pearl', cap='accent', ring='chrome', ink=(34, 28, 44), accent=(96, 62, 138), glass='opal', font='semibold', case='upper', track=.12),
    'heliocare': dict(name='Heliocare', body='pearl', cap='accent', ring='chrome', ink=(30, 30, 32), accent=(226, 98, 34), glass='opal', font='bold', case='upper', track=.05, band=(.30, .385)),
    'biretix': dict(name='Biretix', body='pearl', cap='accent', ring='chrome', ink=(26, 44, 42), accent=(47, 127, 122), glass='opal', font='medium', case='lower', track=.04),
    'iraltone': dict(name='Iraltone', body='pearl', cap='pearl', ring='champ', ink=(34, 42, 28), accent=(91, 107, 74), glass='amber', font='serifb', case='upper', track=.14),
    'eva': dict(name='EVA', body='pearl', cap='pearl', ring='champ', ink=(70, 34, 46), accent=(162, 90, 110), glass='opal', font='xlight', case='upper', track=.30),
    'elancyl': dict(name='Elancyl', body='pearl', cap='accent', ring='chrome', ink=(30, 46, 24), accent=(93, 156, 47), glass='opal', font='bold', case='lower', track=.03),
}
def style_mats(st, m, noir=False):
    """материалы отделки бренда: корпус, колпачок, кольцо, стекло (+жидкость), печать"""
    n = st['name'].lower(); acc = tuple(c / 255.0 for c in st['accent']) if st.get('accent') else None; lin = lambda c: tuple((x / 255.0) ** 2.2 for x in c) if c else None
    body = m['noirsoft'] if (st['body'] == 'noir' or noir) else mat_pearl('pearl_' + n)
    cap = m['noirsoft'] if st['cap'] == 'noir' or noir else (mat_accent('cap_' + n, lin(st['accent'])) if st['cap'] == 'accent' and st.get('accent') else body)
    ring = m['champ'] if st['ring'] == 'champ' else m['chrome']
    g = st['glass']
    glass = {'opal': m['opal'], 'smoke': m['smoke'], 'amber': mat_color_glass('amber_' + n, (.30, .13, .02)), 'teal': mat_color_glass('teal_' + n, (.02, .24, .25))}[g]
    liq = {'opal': None, 'smoke': m['smoke_liq'], 'amber': mat_color_glass('amberl_' + n, (.20, .08, .01), rough=.01), 'teal': mat_color_glass('teall_' + n, (.01, .16, .17), rough=.01)}[g]
    return dict(body=body, cap=cap, ring=ring, glass=glass, liq=liq, collar=(m['champ_rib'] if st['ring'] == 'champ' or noir else m['white_rib']), clear=(m['smoke_clear'] if noir else m['clear']))

def M():
    wr = mat_plastic('softtouch_rib', (.90, .89, .86), rough=.5, coat=0.0, sheen=.3, sss=.08, bump=.12); add_ribs(wr, 90, .45)
    return {
      'white': mat_plastic('softtouch', (.91, .90, .87), rough=.5, coat=0.0, sheen=.3, sss=.08, bump=.12), 'white_rib': wr,
      'gloss': mat_plastic('glosspl', (.92, .91, .88), rough=.2, coat=.4, sheen=.1, sss=.08, bump=.0),
      'opal': mat_opal(), 'noirglass': mat_noir_glass(),
      'noirsoft': mat_plastic('noirsoft', (.024, .023, .022), rough=.44, coat=.0, sheen=.2, spec=.45, bump=.15),
      'champ': mat_champagne(), 'champ_rib': mat_champagne('champ_rib', ribs=84), 'champ_lid': mat_champagne('champ_lid', rough=.34, ribs=96),
      'paper': mat_paper(), 'foil': mat_foil(), 'rubber': mat_rubber(), 'carton': mat_carton(), 'serum': mat_liquid(), 'glass': mat_clear_glass(),
      'ink': mat_ink('ink', (.80, .76, .68), .55), 'inkdark': mat_ink('inkdark', (.20, .18, .16), .45),
      'cobalt': mat_color_glass('cobalt', (.012, .085, .27)), 'cobalt_liq': mat_color_glass('cobalt_liq', (.006, .05, .17), rough=.01),
      'smoke': mat_color_glass('smoke', (.075, .05, .03)), 'smoke_liq': mat_color_glass('smoke_liq', (.04, .026, .016), rough=.01),
      'clear': mat_clear_glass('clear_cap', (.98, .985, .985)), 'smoke_clear': mat_color_glass('smoke_clear', (.30, .28, .26), rough=.03),
      'lacquer': mat_lacquer('lacquer_blue', (.014, .05, .17)), 'lacquer_noir': mat_lacquer('lacquer_noir', (.018, .017, .016)), 'chrome': mat_chrome(),
    }

# ---------- геометрия: профили вращения со скруглениями ----------
def fillet(pts, radii, steps=6):
    """ломаная (r,z) → гладкая: в вершине i скругление радиусом radii[i] (0 — острый угол)"""
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        r = radii[i]; A = np.array(pts[i - 1], float); B = np.array(pts[i], float); C = np.array(pts[i + 1], float)
        if r <= 1e-6: out.append(tuple(B)); continue
        u = (A - B) / np.linalg.norm(A - B); v = (C - B) / np.linalg.norm(C - B)
        th = math.acos(np.clip(np.dot(u, v), -1, 1))
        if th < 1e-3 or abs(th - math.pi) < 1e-3: out.append(tuple(B)); continue
        d = r / math.tan(th / 2); d = min(d, np.linalg.norm(A - B) * .5, np.linalg.norm(C - B) * .5); r2 = d * math.tan(th / 2)
        T1 = B + u * d; T2 = B + v * d; bis = (u + v); bis = bis / np.linalg.norm(bis); Cc = B + bis * (r2 / math.sin(th / 2))
        a1 = math.atan2(*(T1 - Cc)[::-1]); a2 = math.atan2(*(T2 - Cc)[::-1]); da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        for k in range(steps + 1):
            a = a1 + da * k / steps; out.append((Cc[0] + r2 * math.cos(a), Cc[1] + r2 * math.sin(a)))
    out.append(pts[-1]); return out
def revolve(name, prof, mat_, seg=128, loc=(0, 0, 0), ry=None, cap=True, smooth=True):
    """тело вращения по профилю [(r, z)] в см; ry — отношение осей эллипса (для сплюснутых форм)"""
    verts, faces = [], []; th = np.linspace(0, 2 * math.pi, seg, endpoint=False); k = ry or 1.0
    for (r, z) in prof:
        for t in th: verts.append((r * math.cos(t) * CM, r * k * math.sin(t) * CM, z * CM))
    n = len(prof)
    for i in range(n - 1):
        for j in range(seg):
            a = i * seg + j; b = i * seg + (j + 1) % seg; c = (i + 1) * seg + (j + 1) % seg; d = (i + 1) * seg + j; faces.append((a, b, c, d))
    if cap:
        if prof[0][0] > 1e-6: faces.append(tuple(reversed(range(seg))))
        if prof[-1][0] > 1e-6: faces.append(tuple(range((n - 1) * seg, n * seg)))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob.location = loc; ob.data.materials.append(mat_)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return ob
def body(name, corners, radii, mat_, **kw):
    """корпус по ломаной углов [(r,z)…] и радиусам скруглений в них"""
    return revolve(name, fillet(corners, radii), mat_, **kw)
def block(name, mat_, w, h, d, loc=(0, 0, 0), bev=0.1, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); ob = bpy.context.object; ob.name = name
    ob.scale = (w * CM, d * CM, h * CM); bpy.ops.object.transform_apply(scale=True)
    bv = ob.modifiers.new('bev', 'BEVEL'); bv.width = bev * CM; bv.segments = 5; bv.limit_method = 'ANGLE'
    ob.data.materials.append(mat_); ob.rotation_euler = (0, 0, math.radians(rot)); bpy.ops.object.shade_smooth(); return ob

def ring_teeth(name, r, z0, z1, mat_, n=3, gap=.22, w=.1, seg=96):
    """резьба горлышка: несколько тонких колец"""
    out = []
    for i in range(n):
        z = z0 + (z1 - z0) * i / max(1, n - 1)
        out.append(body(name + str(i), [(0, z - w), (r + .07, z - w), (r + .07, z + w), (0, z + w)], [0, .05, .05, 0], mat_, seg=seg, cap=False))
    return out

def shell(name, outer, t, mat_, seg=128):
    """полый колпак (толщина стенки t), открытый снизу: профиль идёт по наружной стенке вверх и по внутренней — вниз"""
    out = fillet(outer, [0] + [min(.5, t * 3)] * (len(outer) - 2) + [0], 6); inn = [(max(0.0, r - t), z - (t if k > len(out) // 2 else 0)) for k, (r, z) in enumerate(out)]
    prof = out + list(reversed(inn)); return revolve(name, prof, mat_, seg=seg, cap=False)
# ---------- упаковки ----------
def build(kind, noir, m, brand=None):
    """реалистичные макеты по образцам из фото заказчика: стройные флаконы с помпой из жемчужного глянцевого пластика, цветное стекло с чёрной пипеткой, баночка с белой крышкой и хромовым кольцом, флакон с прозрачным колпачком; печать брендов — настоящим шрифтом прямо на корпусе (decal)"""
    objs = []; labels = []                                 # надписей и этикеток нет: форма, материал и цвет самих деталей (по просьбе заказчика)
    st = STYLES.get(brand) if brand else None; sm = style_mats(st or STYLES['dermatime'], m, noir)
    plastic = sm['body']; cap_m = sm['cap']; collar_m = sm['collar']
    if kind == 'tube':                                     # туба стоит на крышке; верх — плоский обжатый шов с поперечным рифлением
        rings = []
        for i in range(0, 81):
            t = i / 80; z = 2.9 + (14.4 - 2.9) * t
            if t < .70: rx, ry = 1.92, 1.92
            else:
                u = (t - .70) / .30; k = (3 * u * u - 2 * u ** 3); rx = 1.92 + .32 * k; ry = 1.92 * (1 - .945 * k)
            rings.append((z, rx, ry))
        verts, faces = [], []; seg = 128; thh = np.linspace(0, 2 * math.pi, seg, endpoint=False)
        for z, rx, ry in rings:
            for t in thh: verts.append((rx * math.cos(t) * CM, ry * math.sin(t) * CM, z * CM))
        for i in range(len(rings) - 1):
            for j in range(seg): faces.append((i * seg + j, i * seg + (j + 1) % seg, (i + 1) * seg + (j + 1) % seg, (i + 1) * seg + j))
        faces.append(tuple(range((len(rings) - 1) * seg, len(rings) * seg))); faces.append(tuple(reversed(range(seg))))
        me = bpy.data.meshes.new('tube'); me.from_pydata(verts, [], faces); me.update(); tb = bpy.data.objects.new('tube', me); bpy.context.collection.objects.link(tb); tb.data.materials.append(plastic)
        for p in me.polygons: p.use_smooth = True
        objs.append(tb)
        for k in range(18):                                # шов: тонкие поперечные рёбра на обеих сторонах
            for sgn in (-1, 1):
                objs.append(block('seal%d_%d' % (k, sgn), plastic, 4.5, .07, .07, loc=(0, sgn * .125 * CM, (13.6 + k * .045) * CM), bev=.012))
        objs.append(body('cap', [(0, 0), (1.98, 0), (1.98, 2.7), (1.8, 3.0), (0, 3.0)], [0, .22, .22, .12, 0], cap_m, seg=128))
        objs.append(body('capline', [(0, 2.74), (2.0, 2.74), (2.0, 2.82), (0, 2.82)], [0, 0, 0, 0], sm['ring'], seg=128, cap=False))
    elif kind == 'bottle':                                 # флакон с помпой под прозрачным колпачком (средство от солнца): овальное сечение, цветная полоса печатью
        objs.append(revolve('body', fillet([(0, 0), (3.0, 0), (3.0, 12.6), (2.75, 13.7), (1.75, 14.45), (1.75, 14.9), (0, 14.9)], [0, .5, 1.6, 1.3, .2, 0, 0], 6), plastic, seg=128, ry=.68))
        objs.append(body('collar', [(1.2, 14.6), (1.55, 14.6), (1.55, 15.5), (1.2, 15.5)], [0, .06, .06, 0], collar_m, seg=96, cap=False))
        objs.append(body('stem', [(0, 15.4), (.5, 15.4), (.5, 16.4), (0, 16.4)], [0, 0, 0, 0], plastic, seg=48))
        objs.append(body('head', [(0, 16.2), (1.25, 16.2), (1.25, 17.7), (1.05, 18.0), (0, 18.0)], [0, .12, .35, .25, 0], cap_m if (st and st.get('accent')) else plastic, seg=96))
        sp = body('spout', [(0, 0), (.34, 0), (.34, 1.3), (.25, 1.5), (0, 1.5)], [0, .06, .1, .12, 0], cap_m if (st and st.get('accent')) else plastic, seg=48); sp.rotation_euler = (0, math.radians(-90), 0); sp.location = (-.2 * CM, 0, 17.3 * CM)      # носик целиком внутри колпачка (внутренний радиус 2,2 см; кончик на 1,7 см от оси); objs.append(sp)
        objs.append(shell('overcap', [(2.34, 13.55), (2.34, 20.6), (2.05, 21.4), (1.05, 21.8), (0, 21.9)], .14, sm['clear'], seg=128))
    elif kind == 'pump':                                   # высокий флакон 200 мл с дозатором-помпой: жемчужный пластик, рифлёное кольцо, высокая головка
        objs.append(body('body', [(0, 0), (2.62, 0), (2.62, 14.4), (2.4, 15.6), (1.62, 16.3), (1.62, 16.8), (0, 16.8)], [0, .5, 1.7, 1.5, .25, 0, 0], plastic, seg=128))
        objs.append(body('collar', [(1.5, 16.5), (1.9, 16.5), (1.9, 18.0), (1.5, 18.0)], [0, .08, .08, 0], collar_m, seg=128, cap=False))
        objs.append(body('collartop', [(0, 17.95), (1.9, 17.95), (1.9, 18.12), (1.0, 18.32), (0, 18.32)], [0, .05, .08, 0, 0], plastic if not noir else sm['ring'], seg=128))
        objs.append(body('stem', [(0, 18.2), (.58, 18.2), (.58, 19.6), (0, 19.6)], [0, 0, 0, 0], plastic, seg=48))
        objs.append(body('head', [(0, 19.3), (1.5, 19.3), (1.5, 22.4), (1.3, 22.8), (0, 22.85)], [0, .14, .45, .4, 0], cap_m, seg=112))
        sp = body('spout', [(0, 0), (.34, 0), (.34, 1.25), (.25, 1.45), (0, 1.45)], [0, .06, .1, .12, 0], cap_m, seg=48); sp.rotation_euler = (0, math.radians(-90), 0); sp.location = (-1.1 * CM, 0, 21.9 * CM); objs.append(sp)
    elif kind == 'dropper':                                # флакон 30 мл с пипеткой: стекло цвета бренда, чёрный воротник, каучуковая груша
        gl = sm['glass']; lq = sm['liq']; gink = (st or {}).get('gink')
        objs.append(body('body', [(0, 0), (1.72, 0), (1.72, 6.6), (1.45, 7.7), (1.02, 8.2), (1.02, 8.6), (0, 8.6)], [0, .35, .9, 1.0, .1, 0, 0], gl, seg=112))
        if lq is not None: objs.append(body('liquid', [(0, .42), (1.5, .42), (1.5, 5.4), (1.38, 5.8), (0, 5.85)], [0, .3, .3, .3, 0], lq, seg=96))
        objs += ring_teeth('thr', 1.02, 8.1, 8.45, gl, n=2, seg=64)
        objs.append(body('collar', [(1.06, 8.4), (1.5, 8.4), (1.5, 10.7), (1.06, 10.7)], [0, .06, .06, 0], m['noirsoft'] if not (st and st['cap'] == 'accent') else cap_m, seg=112, cap=False))
        objs.append(body('collarring', [(1.47, 8.36), (1.58, 8.36), (1.58, 8.78), (1.47, 8.78)], [0, .03, .03, 0], sm['ring'], seg=112, cap=False))
        objs.append(body('collartop', [(0, 10.65), (1.5, 10.65), (1.5, 10.82), (.9, 10.95), (0, 10.95)], [0, .04, .06, 0, 0], m['noirsoft'] if not (st and st['cap'] == 'accent') else cap_m, seg=112))
        bulb = [(0, 10.9), (.92, 10.9), (.98, 11.35), (1.1, 12.1), (1.22, 13.0), (1.22, 13.9), (1.0, 14.8), (.58, 15.45), (0, 15.6)]
        objs.append(revolve('bulb', fillet(bulb, [0, .08, .5, .9, 1.2, 1.3, 1.2, .9, 0], 6), m['rubber'], seg=112))
    elif kind == 'jar':                                    # баночка 50 мл по образцу: плоская белая крышка, тонкое хромовое кольцо, глянцевый корпус цвета бренда, кольцо у основания
        wj = mat_pearl('pearl_jar'); body_m = wj; cap_m = wj            # баночка — всегда белая (глянцево-жемчужный пластик), хромовые кольца
        objs.append(body('jar', [(0, 0), (3.82, 0), (3.82, 4.0), (3.72, 4.1), (0, 4.1)], [0, .55, .2, .1, 0], body_m, seg=160))
        objs.append(body('ringlo', [(3.80, .12), (3.90, .12), (3.90, .52), (3.80, .52)], [0, .03, .03, 0], sm['ring'], seg=160, cap=False))
        objs.append(body('ring', [(3.80, 3.72), (3.92, 3.72), (3.92, 4.22), (3.80, 4.22)], [0, .04, .04, 0], sm['ring'], seg=160, cap=False))
        objs.append(body('lid', [(0, 4.2), (3.9, 4.2), (3.9, 5.7), (3.74, 5.95), (2.6, 6.02), (0, 6.04)], [0, .1, .35, .8, .3, 0], cap_m, seg=160))
        objs.append(body('gap', [(0, 4.18), (3.92, 4.18), (3.92, 4.27), (0, 4.27)], [0, 0, 0, 0], m['inkdark'], seg=160, cap=False))
    elif kind == 'box':                                    # картонная коробка (ампулы): вертикальная, с печатью
        rot = -14
        objs.append(block('box', m['carton'], 5.4, 13.0, 3.6, loc=(0, 0, 6.5 * CM), bev=.12, rot=rot))
        objs.append(block('foil', m['foil'], 5.44, .22, 3.64, loc=(0, 0, 12.0 * CM), bev=.04, rot=rot)); objs.append(block('foil2', m['foil'], 5.44, .1, 3.64, loc=(0, 0, 1.0 * CM), bev=.02, rot=rot))
    elif kind == 'device':                                 # косметологическая «ручка»
        handle = [(0, 0), (1.15, 0), (1.35, 3.0), (1.9, 7.2), (1.75, 10.8), (1.5, 11.5), (0, 11.5)]
        objs.append(revolve('handle', fillet(handle, [0, .45, 1.0, 2.5, 1.0, .1, 0], 6), plastic, seg=128))
        objs.append(body('ring', [(1.45, 11.3), (2.05, 11.3), (2.05, 12.35), (1.45, 12.35)], [0, .1, .1, 0], m['champ_rib'], seg=128, cap=False))
        head = [(0, 12.3), (1.85, 12.3), (2.55, 13.4), (2.55, 14.6), (1.85, 15.5), (0, 15.6)]
        objs.append(revolve('head', fillet(head, [0, .3, 1.2, 1.2, 1.0, 0], 8), plastic, seg=128))
        btn = body('btn', [(0, 0), (.55, 0), (.55, .35), (0, .35)], [0, .06, .06, 0], m['champ'], seg=48); btn.rotation_euler = (math.radians(90), 0, 0); btn.location = (0, -1.78 * CM, 7.0 * CM); objs.append(btn)
    return objs, labels

def softbox(name, loc, sx, sy, strength, color=(1, .96, .9), feather=.28, aim=(0, 0, .09)):
    """мягкий софтбокс: плоскость-излучатель с растушёванными краями (виден в отражениях как плавная полоса), камере не виден"""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc); ob = bpy.context.object; ob.name = name; ob.scale = (sx, sy, 1)
    d = Vector(aim) - Vector(loc); ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); L = nt.links
    o = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['UV'], sp.inputs[0]); fs = []
    for ax in ('X', 'Y'):
        a = nt.nodes.new('ShaderNodeMath'); a.operation = 'SUBTRACT'; a.inputs[0].default_value = 1.0; L.new(sp.outputs[ax], a.inputs[1])
        mn = nt.nodes.new('ShaderNodeMath'); mn.operation = 'MINIMUM'; L.new(sp.outputs[ax], mn.inputs[0]); L.new(a.outputs[0], mn.inputs[1])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'; mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = feather; L.new(mn.outputs[0], mr.inputs['Value']); fs.append(mr.outputs['Result'])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; L.new(fs[0], mul.inputs[0]); L.new(fs[1], mul.inputs[1])
    st = nt.nodes.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = strength; L.new(mul.outputs[0], st.inputs[0])
    em.inputs['Color'].default_value = (*color, 1); L.new(st.outputs[0], em.inputs['Strength']); L.new(em.outputs[0], o.inputs[0]); ob.data.materials.append(m)
    ob.visible_camera = False; ob.visible_shadow = False; ob['bz'] = loc[2]; return ob

def setup_scene(sc):
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (.74, .66, .55, 1); bg.inputs[1].default_value = float(os.environ.get('PACK_WORLD', .16)); sc.world = w
    # студия: длинная вертикальная полоса слева (главный «живой» блик), верхняя панель, тонкая контровая полоса справа, тёплый отскок снизу и большой слабый заполняющий свет спереди
    softbox('strip_l', (-.55, -.45, .12), .17, .9, float(os.environ.get('PACK_STRIP', 38)), (1, .95, .87))
    softbox('top', (-.08, -.2, .85), .8, .8, float(os.environ.get('PACK_TOP', 9)), (1, .97, .92))
    softbox('rim_r', (.62, .32, .1), .10, .85, float(os.environ.get('PACK_RIM', 26)), (1, .98, .96), feather=.4)
    softbox('front', (.35, -.95, .05), .7, .7, float(os.environ.get('PACK_FILL', 1.0)), (1, .97, .93))
    softbox('floor', (0, -.3, -.28), .8, .6, float(os.environ.get('PACK_BOUNCE', 3.2)), (1, .86, .66))
    cd = bpy.data.cameras.new('cam'); cd.lens = float(os.environ.get('PACK_LENS', 100)); cd.sensor_width = 36; cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); sc.camera = cam
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, .42, .09)); cd_ = bpy.context.object; cd_.name = 'card'; cd_.scale = (1.4, 1, 1.2); cd_.rotation_euler = (math.radians(90), 0, 0)
    cm_ = bpy.data.materials.new('card'); cm_.use_nodes = True; nt_ = cm_.node_tree; nt_.nodes.clear(); o_ = nt_.nodes.new('ShaderNodeOutputMaterial'); e_ = nt_.nodes.new('ShaderNodeEmission'); e_.inputs['Color'].default_value = (.86, .74, .56, 1); e_.inputs['Strength'].default_value = float(os.environ.get('PACK_CARD', .9)); nt_.links.new(e_.outputs[0], o_.inputs[0]); cd_.data.materials.append(cm_)
    cd_.visible_camera = False; cd_['bz'] = .09                                   # тёплая карточка за предметом: её видят только преломлённые лучи — цветное стекло не чернеет
    return cam

OBJ_KEEP = ('strip_l', 'top', 'rim_r', 'front', 'floor', 'card', 'cam')
def render_one(kind, noir, sc, cam, brand=None, tag=None):
    for o in list(bpy.data.objects):
        if o.name not in OBJ_KEEP: bpy.data.objects.remove(o, do_unlink=True)
    m = M(); objs, labels = build(kind, noir, m, brand)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]; zmin = min(p.z for p in pts); zmax = max(p.z for p in pts); xs = [p.x for p in pts]
    H = zmax - zmin; W_ = max(xs) - min(xs); cz = (zmin + zmax) / 2
    # камера: перспектива 100 мм; расстояние подбирается так, чтобы предмет занимал ≈ 80 % кадра
    fov = 2 * math.atan(36 / (2 * cam.data.lens)); dist = max(H, W_) * 1.28 / (2 * math.tan(fov / 2))
    cam.location = (0, -dist * math.cos(ELEV), cz + dist * math.sin(ELEV)); cam.rotation_euler = (math.radians(90) - ELEV, 0, 0)
    # софтбоксы привязаны к предмету (центр кадра по высоте), масштаб — по габариту
    for o in bpy.data.objects:
        if o.name in OBJ_KEEP[:-1]:
            o.location.z = o['bz'] + cz; o.rotation_euler = (Vector((0, 0, cz)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join('/tmp', 'pack_%s_%s.png' % (tag or kind, 'n' if noir else 'w')); bpy.context.view_layer.update(); bpy.ops.render.render(write_still=True)
    boxes = []
    for lo in labels:
        us = [world_to_camera_view(sc, cam, lo.matrix_world @ v.co) for v in lo.data.vertices]
        boxes.append((min(u.x for u in us), 1 - max(u.y for u in us), max(u.x for u in us), 1 - min(u.y for u in us)))
    return sc.render.filepath, boxes

def finish(png, boxes, name):
    im = Image.open(png).convert('RGBA'); W, Hh = im.size
    a = np.asarray(im.getchannel('A')); ys, xs = np.where(a > 6); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = 6; x0 = max(0, x0 - pad); y0 = max(0, y0 - pad); x1 = min(W, x1 + pad); y1 = min(Hh, y1 + pad)
    c = im.crop((x0, y0, x1, y1)); s = TARGET_H / c.height
    c = c.resize((max(1, round(c.width * s)), TARGET_H), Image.LANCZOS)
    r, g, b, al = c.split(); rgb = Image.merge('RGB', (r, g, b)).filter(ImageFilter.UnsharpMask(radius=1.0, percent=int(os.environ.get('PACK_SHARP', 55)), threshold=2)); c = Image.merge('RGBA', (*rgb.split(), al))
    info = {'file': 'assets/showroom/%s.webp' % name, 'w': c.width, 'h': c.height}
    if boxes:
        bx = boxes[0]; px = lambda u: (u * W - x0) / (x1 - x0); py = lambda v: (v * Hh - y0) / (y1 - y0)
        info['label'] = [round(px(bx[0]), 4), round(py(bx[1]), 4), round(px(bx[2]) - px(bx[0]), 4), round(py(bx[3]) - py(bx[1]), 4)]
    c.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=92, method=6, alpha_quality=98)
    return info


SPIN_N = int(os.environ.get('PACK_SPIN', 0))                                   # число кадров оборота (0 — только статичные спрайты); 36 кадров = шаг 10°
SPIN_H = int(os.environ.get('PACK_SPIN_H', 560))                               # высота кадра оборота, px
SPIN_COLS = int(os.environ.get('PACK_SPIN_COLS', 6))
def render_spin(kind, noir, sc, cam, n):
    """оборот упаковки вокруг вертикальной оси: камера, свет и размер те же, что у статичного спрайта; кадр 0 совпадает со спрайтом. Все объекты привязаны к «пустышке» в нуле, поворачивается она"""
    for o in list(bpy.data.objects):
        if o.name not in OBJ_KEEP: bpy.data.objects.remove(o, do_unlink=True)
    m = M(); objs, labels = build(kind, noir, m); bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]; zmin = min(p.z for p in pts); zmax = max(p.z for p in pts); xs = [p.x for p in pts]
    H = zmax - zmin; W_ = max(xs) - min(xs); cz = (zmin + zmax) / 2
    fov = 2 * math.atan(36 / (2 * cam.data.lens)); dist = max(H, W_) * 1.28 / (2 * math.tan(fov / 2))
    cam.location = (0, -dist * math.cos(ELEV), cz + dist * math.sin(ELEV)); cam.rotation_euler = (math.radians(90) - ELEV, 0, 0)
    for o in bpy.data.objects:
        if o.name in OBJ_KEEP[:-1]:
            o.location.z = o['bz'] + cz; o.rotation_euler = (Vector((0, 0, cz)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    root = bpy.data.objects.new('spin_root', None); bpy.context.collection.objects.link(root)
    for o in bpy.data.objects:
        if o.name not in OBJ_KEEP and o is not root and o.parent is None: o.parent = root
    paths = []
    for i in range(n):
        root.rotation_euler = (0, 0, 2 * math.pi * i / n); bpy.context.view_layer.update()
        sc.render.filepath = '/tmp/spin_%s_%s_%02d.png' % (kind, 'n' if noir else 'w', i); bpy.ops.render.render(write_still=True); paths.append(sc.render.filepath)
        print('  оборот', kind, i + 1, '/', n, flush=True)
    return paths

def finish_spin(paths, name, static_box=None):
    """общая рамка по всем кадрам, уменьшение, сборка в одну картинку-атлас SPIN_COLS × строки; возвращает описание"""
    ims = [Image.open(p).convert('RGBA') for p in paths]; W, Hh = ims[0].size
    x0 = y0 = 10 ** 9; x1 = y1 = 0
    for im in ims:
        a = np.asarray(im.getchannel('A')); ys, xs = np.where(a > 6)
        x0 = min(x0, xs.min()); x1 = max(x1, xs.max() + 1); y0 = min(y0, ys.min()); y1 = max(y1, ys.max() + 1)
    pad = 4; x0 = max(0, x0 - pad); y0 = max(0, y0 - pad); x1 = min(W, x1 + pad); y1 = min(Hh, y1 + pad)
    # рамка статичного спрайта (кадр 0, тот же отступ, что в finish(), пересчитанный на разрешение оборота): сайт по ней совмещает кадр 0 со спрайтом
    a0 = np.asarray(ims[0].getchannel('A')); ys0, xs0 = np.where(a0 > 6); k0 = W / float(os.environ.get('PACK_STATIC_RES', 1600)); p0 = 6 * k0
    sx0 = max(0, xs0.min() - p0); sx1 = min(W, xs0.max() + 1 + p0); sy0 = max(0, ys0.min() - p0); sy1 = min(Hh, ys0.max() + 1 + p0)
    fw0, fh0 = x1 - x0, y1 - y0; fh = SPIN_H
    while True:                                                                      # атлас не больше 4096 px по любой стороне (предел текстуры на телефонах)
        fw = max(1, round(fw0 * fh / fh0)); cols = max(1, min(len(ims), 4096 // fw)); rows = (len(ims) + cols - 1) // cols
        if rows * fh <= 4096: break
        fh = int(fh * .94)
    atlas = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        c = im.crop((x0, y0, x1, y1)).resize((fw, fh), Image.LANCZOS)
        r, g, b, al = c.split(); rgb = Image.merge('RGB', (r, g, b)).filter(ImageFilter.UnsharpMask(radius=1.0, percent=40, threshold=2)); c = Image.merge('RGBA', (*rgb.split(), al))
        atlas.paste(c, ((i % cols) * fw, (i // cols) * fh))
    out = 'spin-%s.webp' % name; atlas.save(os.path.join(OUT, out), 'WEBP', quality=int(os.environ.get('PACK_SPIN_Q', 84)), method=6, alpha_quality=90)
    return {'file': 'assets/showroom/' + out, 'n': len(ims), 'cols': cols, 'rows': rows, 'fw': fw, 'fh': fh,
            'box': [round((sx0 - x0) / fw0, 4), round((sy0 - y0) / fh0, 4), round((sx1 - sx0) / fw0, 4), round((sy1 - sy0) / fh0, 4)]}

def product_jobs():
    """по одной упаковке на сочетание «бренд + вид» из data/products.json: отделка и цвет бренда, без надписей; файл pack-<бренд>-<вид>.webp"""
    root = os.path.join(HERE, '..', '..'); ps = json.load(open(os.path.join(root, 'data', 'products.json'), encoding='utf8')); ps = ps if isinstance(ps, list) else ps.get('products', [])
    out = []; seen = set()
    for p in ps:
        k = (p['brand'], p['type'])
        if k in seen or p['brand'] not in STYLES: continue
        seen.add(k); out.append((p['type'], False, p['brand'], None, '%s-%s' % k))
    return out

if __name__ == '__main__':
    jobs = [(k, n, None, None, None) for k, n in [('tube', False), ('bottle', False), ('bottle', True), ('pump', False), ('pump', True), ('dropper', False), ('dropper', True), ('jar', False), ('box', False), ('device', False)]]
    want = sys.argv[1:]
    if want == ['products']: jobs = product_jobs()
    elif want and want[0] == 'product': jobs = [j for j in product_jobs() if j[4] in want[1:]]
    elif want: jobs = [j for j in jobs if j[0] in want or ('%s-noir' % j[0]) in want]
    meta_path = os.path.join(OUT, 'packs.json'); meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for kind, noir, brand, prod, pid in jobs:
        sc = reset(); cam = setup_scene(sc)
        if SPIN_N and not pid:
            name = 'pack-%s%s' % (kind, '-noir' if noir else ''); paths = render_spin(kind, noir, sc, cam, SPIN_N)
            meta.setdefault(name, {})['spin'] = finish_spin(paths, name[5:]); print(name, meta[name]['spin'], flush=True); json.dump(meta, open(meta_path, 'w'), indent=1, ensure_ascii=False); continue
        png, boxes = render_one(kind, noir, sc, cam, brand, pid)
        name = 'pack-%s' % pid if pid else 'pack-%s%s' % (kind, '-noir' if noir else ''); meta[name] = finish(png, boxes, name); meta[name]['kind'] = kind; print(name, meta[name], flush=True)
        json.dump(meta, open(meta_path, 'w'), indent=1, ensure_ascii=False)
