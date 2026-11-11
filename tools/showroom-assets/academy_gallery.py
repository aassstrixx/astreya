"""ASTREYA ACADEMY — отдельная сцена «Кафедра красоты»: витрина преподавателей косметологической академии (страница «Обучение», блок «Преподаватели»).

Светлый стеллаж-кабинет из известняка и травертина, как в бутике или клинике эстетической медицины: сетка 5 × 2 глубоких прямоугольных ниш с мягкой тёплой подсветкой сверху.
В восьми нишах — портреты преподавателей БЕЗ РАМ: крупная фотопечать (настоящее фото, глянцевая поверхность) парит над рифлёной панелью на четырёх латунных стойках, под ней — известняковая табличка-этикетка (текст на ней кладёт вёрстка).
Фон — рифлёные панели: тёплый травертин в нишах с портретами и рифлёный тёмно-синий лак в нишах с косметикой; по перегородкам и цоколю — латунные вставки.
В двух нишах по диагонали — косметологические витрины со стеклянными полками: флаконы с помпой и пипеткой, баночки кремов, тубы, ампулы в штативе, круглое зеркало, скрученные и сложенные спа-полотенца, чаша с ватными дисками,
нефритовый роллер и пластина гуаша из розового кварца, стопка гладких камней, свеча, веточка оливы, книги. Внизу — цоколь из слоистого травертина. Свет — дневной слева с тенью листвы + линейная подсветка каждой ниши.
Масштаб: 1 ед. сцены = 5 см (фотопечать ≈ 40 × 43 см, флакон сыворотки ≈ 15 см). Камера строго фронтальная и слегка перспективная (объектив 75 мм): рамы лежат в плоскостях, параллельных кадру, поэтому
положение любой фотопечати и таблички — точный прямоугольник; assets/academy/gallery.json хранит для каждого портрета фото (ap = frame) и табличку (plaque) в долях кадра.
Вёрстка кладёт на рендер только прозрачные кнопки, подписи на таблички и карточку преподавателя.
  python3 tools/showroom-assets/academy_gallery.py preview     # быстрый кадр /tmp/ag_preview.png (+ _g.jpg с цветокоррекцией); AH_W — ширина, AH_SPP — сэмплы, CROP=x0,x1,y0,y1 — часть кадра
  python3 tools/showroom-assets/academy_gallery.py layout      # только assets/academy/gallery.json
  python3 tools/showroom-assets/academy_gallery.py             # итог: assets/academy/gallery.webp (3200 px), gallery-s.webp (1600), gallery.json (AH_TILES=4 — расчёт полосами, возобновляемо)
Фото преподавателей: порядок и id — из data/redesign.json (teachers.items); исходники улучшает enhance_portraits.py (→ assets/teachers/hq2).
Переменные: AH_W, AH_SPP, AH_TILES, SUN, FILL, LED, LEDL, WORLD, EXPO, AH_SAT, AH_GAMMA, AH_LIFT, AH_WARM."""
import bpy, math, os, sys, json, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import scene as S
import materials as MT
import realism as RL
import decor as DC
import academy_hall as AH                                                  # общие детали: флаконы, оливковые ветки, тени листвы, травертин с прожилками, расчёт полосами
import enhance_portraits as EP                                             # улучшение исходных фото (×2, без нейросетей)
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ROOT = os.path.join(HERE, '..', '..')
OUT = os.path.join(ROOT, 'assets', 'academy')
G = 'ac'
args = [a for a in sys.argv[1:] if not a.startswith('-')]
MODE = next((a for a in args if a in ('preview', 'layout')), 'final')
F = AH.F
Y0 = 10.0                                                                   # задняя стенка ниш
DEPTH = 4.4                                                                 # глубина ниш (22 см)
YF = Y0 - DEPTH                                                             # лицевая плоскость стеллажа
PAN_Y = Y0 - .5                                                             # плоскость, на которой висят рамы
GAL = dict(W=64.0, cols=5, mx=1.6, bw=1.0, apw=8.0, aph=8.57, mat=0.0, fr=0.0, plq_h=2.4, plq_gap=.9, padb=1.0, padt=1.5, plinth=2.8, top=2.0, lens=75.0)
PW = 3200


def ids():
    d = json.load(open(os.path.join(ROOT, 'data', 'redesign.json'), encoding='utf-8')); return [t['id'] for t in d['teachers']['items']]


def cells():
    """ячейки 5 × 2: у каждой центр, границы, рама, табличка; тип P — портрет, A/B — косметологические витрины (по диагонали: справа вверху и слева внизу). Порядок портретов — как у преподавателей: сверху вниз, слева направо"""
    g = GAL; k = g['mat'] + g['fr']; ow = g['apw'] + 2 * k; oh = g['aph'] + 2 * k
    cw = (g['W'] - 2 * g['mx'] - (g['cols'] - 1) * g['bw']) / g['cols']; ch = g['padb'] + g['plq_h'] + g['plq_gap'] + oh + g['padt']
    g['cw'], g['ch'], g['ow'], g['oh'] = cw, ch, ow, oh; g['H'] = round(g['plinth'] + 2 * ch + g['bw'] + g['top'], 2); out = []
    for r in range(2):
        z0 = g['plinth'] + (1 - r) * (ch + g['bw'])
        for c in range(g['cols']):
            x0 = g['mx'] + c * (cw + g['bw']); kind = 'A' if (r == 0 and c == g['cols'] - 1) else 'B' if (r == 1 and c == 0) else 'P'
            d = dict(r=r, c=c, x0=x0, x1=x0 + cw, z0=z0, z1=z0 + ch, cx=x0 + cw / 2, kind=kind)
            if kind == 'P':
                pz0 = z0 + g['padb']; fb = pz0 + g['plq_h'] + g['plq_gap']; d.update(pz0=pz0, pz1=pz0 + g['plq_h'], fb=fb, ft=fb + oh, ab=fb + k, at=fb + k + g['aph'])
            out.append(d)
    return out


# ---------------- материалы ----------------
def photo_mat(name, path):
    m, nt, b, o = S.mk(name); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(path); tex.image.colorspace_settings.name = 'sRGB'; tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], S.inp(b, 'Base Color')); S.val(b, F('PHR', .34), 'Roughness'); S.val(b, F('PHS', .30), 'Specular IOR Level', 'Specular'); return m


def pane_mat(name='g_pane'):
    """стекло рамы: прозрачное, на скользящих углах отражает (Френель), едва заметная волнистость; поверх — мягкие диагональные блики «окна за спиной зрителя»"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new('ShaderNodeOutputMaterial'); tr = N.new('ShaderNodeBsdfTransparent'); gl = N.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = .03
    fr = N.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.5; mx = N.new('ShaderNodeMixShader')
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .35; nz.inputs['Detail'].default_value = 1.0; bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = F('WAVY', .05); bp.inputs['Distance'].default_value = .5
    L.new(tc.outputs['Object'], nz.inputs['Vector']); L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], gl.inputs['Normal']); L.new(bp.outputs['Normal'], fr.inputs['Normal'])
    L.new(fr.outputs['Fac'], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(gl.outputs[0], mx.inputs[2])
    mp = N.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, math.radians(35), 0); L.new(tc.outputs['Object'], mp.inputs['Vector'])
    sx = N.new('ShaderNodeSeparateXYZ'); L.new(mp.outputs[0], sx.inputs[0]); wv = N.new('ShaderNodeMath'); wv.operation = 'SINE'; sc_ = N.new('ShaderNodeMath'); sc_.operation = 'MULTIPLY'; sc_.inputs[1].default_value = .26
    L.new(sx.outputs['X'], sc_.inputs[0]); L.new(sc_.outputs[0], wv.inputs[0])
    rp = N.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].position = .55; rp.color_ramp.elements[0].color = (0, 0, 0, 1); rp.color_ramp.elements[1].position = .92; rp.color_ramp.elements[1].color = (1, 1, 1, 1); L.new(wv.outputs[0], rp.inputs['Fac'])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, .97, .90, 1); em.inputs['Strength'].default_value = F('GLARE_K', .22)
    mk = N.new('ShaderNodeMixShader'); L.new(rp.outputs['Color'], mk.inputs['Fac']); tr2 = N.new('ShaderNodeBsdfTransparent'); L.new(tr2.outputs[0], mk.inputs[1]); L.new(em.outputs[0], mk.inputs[2])
    ad = N.new('ShaderNodeAddShader'); L.new(mx.outputs[0], ad.inputs[0]); L.new(mk.outputs[0], ad.inputs[1]); L.new(ad.outputs[0], out.inputs['Surface']); return m


def clear_glass(name, tint=(.96, .985, .975), ior=1.46, rough=.02):
    """стекло: преломление, но тень проходит насквозь (Is Shadow Ray → прозрачный), иначе стекло в рендере «чернеет»"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new('ShaderNodeOutputMaterial'); pr = N.new('ShaderNodeBsdfPrincipled'); pr.inputs['Base Color'].default_value = (*tint, 1); pr.inputs['Roughness'].default_value = rough; pr.inputs['IOR'].default_value = ior
    for nm in ('Transmission Weight', 'Transmission'):
        if nm in pr.inputs: pr.inputs[nm].default_value = 1.0; break
    tr = N.new('ShaderNodeBsdfTransparent'); lp = N.new('ShaderNodeLightPath'); mx = N.new('ShaderNodeMixShader'); L.new(lp.outputs['Is Shadow Ray'], mx.inputs['Fac']); L.new(pr.outputs[0], mx.inputs[1]); L.new(tr.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs['Surface']); return m


def liquid(name, col, ior=1.33):
    m, nt, b, o = S.mk(name); S.val(b, (*col, 1), 'Base Color'); S.val(b, 1.0, 'Transmission Weight', 'Transmission'); S.val(b, 0.0, 'Roughness'); S.val(b, ior, 'IOR'); return m


def fluted(name, col, rough, coat=0.0, pitch=.9, depth=.55, tone=.10, noise=.08):
    """рифлёная панель: вертикальные полуцилиндры шагом pitch (синус от координаты X → рельеф и подсветка гребней), облака тона и мелкое зерно"""
    m, nt, b, o = S.mk(name); L = nt.links
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sp.inputs[0])
    ph = nt.nodes.new('ShaderNodeMath'); ph.operation = 'MULTIPLY'; ph.inputs[1].default_value = 2 * math.pi / pitch; L.new(sp.outputs['X'], ph.inputs[0])
    sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'; L.new(ph.outputs[0], sn.inputs[0])
    hh = nt.nodes.new('ShaderNodeMath'); hh.operation = 'MULTIPLY_ADD'; hh.inputs[1].default_value = .5; hh.inputs[2].default_value = .5; L.new(sn.outputs[0], hh.inputs[0])
    cl = MT._noise(nt, MT._coord(nt, (.5, .5, .5)), 1.2, 4, .55, .5); gr = MT._noise(nt, MT._coord(nt, (1, 1, 1)), 90.0, 5, .7)
    f = MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', cl, .6), MT._math(nt, 'MULTIPLY', hh.outputs[0], .4 * tone / .10))
    c = MT._ramp(nt, [(.25, (col[0] * (1 - tone * 1.6), col[1] * (1 - tone * 1.6), col[2] * (1 - tone * 1.5), 1)), (.85, (min(1, col[0] * (1 + tone)), min(1, col[1] * (1 + tone)), min(1, col[2] * (1 + tone * .9)), 1))]); L.new(f, c.inputs['Fac']); L.new(c.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = depth; bp.inputs['Distance'].default_value = .18
    L.new(MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', hh.outputs[0], .93), MT._math(nt, 'MULTIPLY', gr, noise)), bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, rough, 'Roughness'); MT._val(b, .35, 'Specular IOR Level', 'Specular')
    if coat: MT._val(b, coat, 'Coat Weight', 'Clearcoat'); MT._val(b, .18, 'Coat Roughness', 'Clearcoat Roughness')
    return m


def mats():
    M = {}
    M['wall'] = MT.lime_plaster('g_back', S.E3('BACKC', (.90, .82, .72)), wave=F('WAVE', 1.0), scale=.4, tone=.8)
    M['flute'] = fluted('g_flute', S.E3('FLUTEC', (.80, .68, .54)), .46, .15, tone=.10)
    M['flute_navy'] = fluted('g_flute_navy', S.E3('FLUTEN', (.030, .058, .150)), .30, .55, tone=.30, depth=.6, noise=.04)
    M['frame'] = MT.limestone('g_limestone', S.E3('LIMEC', (.98, .94, .87)), scale=.5)
    M['plinth'] = AH.trav_veined('g_plinth', (.95, .86, .72), 'Z', F('VEINB', 1.8), sc=F('BSC', .8))
    M['navy'] = S.mat_simple('g_navy_metal', S.E3('NAVYM', (.016, .034, .092)), F('NAVYR', .36), .82); M['brass'] = DC.brass('g_brass')
    M['stone'] = MT.limestone('g_plaque', (1.0, .98, .94), .6)
    M['white'] = S.mat_simple('g_white', (.93, .92, .89), .32); M['black'] = S.mat_simple('g_black', (.018, .018, .02), .3); M['chrome'] = S.mat_simple('g_chrome', (.78, .78, .80), .2, .95)
    M['rubber'] = S.mat_simple('g_rubber', (.012, .012, .014), .6); M['paper'] = S.mat_simple('g_paper', (.96, .95, .92), .6)
    M['milk'] = DC.paint('g_milk', (.93, .92, .88), .3, 0, .25, .12, .5); M['navy_gl'] = DC.paint('g_navy_gl', (.022, .045, .115), .2, 0, .45, .08, .6); M['sand_gl'] = DC.paint('g_sand_gl', (.80, .70, .56), .25, 0, .3, .1, .5)
    M['pane'] = pane_mat(); M['glass'] = clear_glass('g_glass'); M['shelf'] = clear_glass('g_shelf', (.90, .96, .95), 1.5, .04); M['mirror'] = S.mat_simple('g_mirror', (.62, .63, .66), .30, 1.0)
    M['aqua'] = liquid('g_aqua', (.60, .86, .90)); M['rose'] = liquid('g_rose', (.96, .66, .70)); M['straw'] = liquid('g_straw', (.95, .84, .50)); M['amber'] = AH.glass_amber('g_amber')
    M['jade'] = S.mat_simple('g_jade', (.46, .68, .53), .16); M['quartz'] = S.mat_simple('g_quartz', (.90, .62, .66), .14); M['stone_s'] = MT.limestone('g_pebble', (.92, .86, .76), .8)
    M['cotton'] = S.mat_simple('g_cotton', (.95, .94, .91), .95); M['towel'] = RL.fabric_linen('g_towel', (.93, .92, .89), scale=40.0); M['towel_n'] = S.mat_simple('g_towel_band', (.04, .08, .19), .8)
    M['wax'] = S.mat_simple('g_wax', (.96, .93, .86), .5); M['cup'] = DC.paint('g_cup', (.20, .22, .28), .3, 0, .2, .1, .5)
    M['led'] = S.mat_led('g_led', F('LED', 9.0), (1.0, .94, .84)); M['bark'] = S.mat_simple('g_bark', (.21, .165, .12), .88); M['label'] = M['paper']
    for i, c in enumerate(((.035, .075, .17), (.90, .86, .76), (.28, .33, .22), (.55, .20, .16), (.12, .22, .38))): M['book%d' % i] = S.mat_simple('g_book%d' % i, c, .62)
    return M


# ---------------- геометрия ----------------
def rect_plane(name, mat, x0, x1, z0, z1, y, uv=False):
    verts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]; me = bpy.data.meshes.new(name); me.from_pydata(verts, [], [(0, 1, 2, 3)]); me.update()
    if uv:
        u = me.uv_layers.new(name='UVMap')
        for i, lp in enumerate(me.loops): u.data[i].uv = ((verts[lp.vertex_index][0] - x0) / (x1 - x0), (verts[lp.vertex_index][2] - z0) / (z1 - z0))
    me.materials.append(mat); return S.link(bpy.data.objects.new(name, me), G)


def bev(ob, w=.03, seg=2):
    b = ob.modifiers.new('bev', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'; return ob


def xcyl(name, mat, x0, x1, y, z, r, seg=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=x1 - x0, location=((x0 + x1) / 2, y, z), rotation=(0, math.pi / 2, 0)); ob = bpy.context.object; ob.name = name
    bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); ob['grp'] = G; return ob


def zcyl(name, mat, x, y, z0, z1, r, seg=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2)); ob = bpy.context.object; ob.name = name
    bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); ob['grp'] = G; return ob


def hollow(name, mat, x, y, z, outer, inner, seg=64):
    return DC.lathe(name, outer + inner, mat, G, x, y, z, seg)


def bottle(kind, x, y, z, H, body, cap, label=None): AH.bottle(kind, x, y, z, H, body, cap, label)


def flask(M, x, y, z, fill):
    """круглая колба-вазочка (для ветки оливы)"""
    hollow('rflask', M['glass'], x, y, z, [(0, 0), (.55, 0), (1.12, .50), (1.45, 1.35), (1.28, 2.25), (.62, 2.95), (.50, 3.6), (.60, 3.72)], [(.46, 3.62), (.50, 3.5), (.58, 2.95), (1.18, 2.22), (1.34, 1.35), (1.02, .55), (.5, .12), (0, .1)])
    if fill: DC.lathe('rflask_liq', [(0, .12), (.5, .14), (1.0, .55), (1.28, 1.35), (1.3, 1.6), (0, 1.6)], fill, G, x, y, z, 48)


def ampoules(M, x, y, z):
    """штатив с ампулами для мезотерапии: белая планка с гнёздами и восемь стеклянных ампул с цветным содержимым"""
    S.box('amp_rack', M['white'], x - 2.3, x + 2.3, y - .7, y + .7, z, z + .55, G, bev=.06)
    liqs = (M['aqua'], M['rose'], M['straw'], M['aqua'], M['rose'], None, M['straw'], M['aqua'])
    for i in range(8):
        ax = x - 2.0 + i * .575; hh = 2.2 + (i % 3) * .1
        hollow('amp', M['glass'], ax, y, z + .5, [(0, 0), (.19, 0), (.26, .10), (.26, hh * .55), (.13, hh * .72), (.08, hh * .86), (.07, hh)], [(.05, hh - .04), (.06, hh * .86), (.11, hh * .72), (.21, hh * .55), (.21, .12), (0, .08)], 28)
        if liqs[i]: DC.lathe('amp_liq', [(0, .1), (.20, .13), (.205, .45), (.205, hh * .50), (0, hh * .50)], liqs[i], G, ax, y, z + .5, 20)
        DC.lathe('amp_band', [(.265, hh * .20), (.265, hh * .34)], M['navy_gl'] if i % 2 == 0 else M['brass'], G, ax, y, z + .5, 24, caps=False)


def rolled_towel(M, x, y, z, L=5.0, r=1.0):
    DC.towel(x, y, z, L, r, M['towel'], M['towel_n'])


def folded_towels(M, x, y, z, n=4, rnd=None):
    zz = z
    for i in range(n):
        h = .62; w = 5.2 - .1 * (i % 2); d = 3.4; off = (rnd.uniform(-.12, .12) if rnd else 0)
        bev(S.box('ftowel', M['towel'], x - w / 2 + off, x + w / 2 + off, y - d / 2, y + d / 2, zz, zz + h, G), .14, 3)
        if i == n - 1: S.box('ftowel_band', M['towel_n'], x - .35, x + .35, y - d / 2 - .02, y + d / 2 + .02, zz - .02, zz + h + .03, G)
        zz += h
    return zz


def cotton_bowl(M, x, y, z, rnd):
    DC.lathe('cbowl', [(0, 0), (1.2, 0), (1.9, .55), (2.15, 1.0), (2.05, 1.06), (1.75, .62), (1.0, .22), (0, .2)], M['milk'], G, x, y, z, 56)
    for i in range(9):
        a = i * 2.4; r = .5 + (i % 3) * .35; DC.ball('cotton', M['cotton'], x + math.cos(a) * r, y + math.sin(a) * r * .45, z + .75 + (i // 5) * .45, .52, G, sz=.62, seg=20, n=12)


def cotton_pads(M, x, y, z, n=6):
    for i in range(n): zcyl('pad', M['cotton'], x + (.06 if i % 2 else -.06), y, z + i * .15, z + i * .15 + .13, .95, 40)


def mirror(M, x, y, z, R):
    xf = Matrix.Translation((x, y, z + R)) @ Matrix.Rotation(math.radians(86), 4, 'X')
    DC.lathe('mir_f', [(R, -.14), (R + .28, -.14), (R + .28, .14), (R, .14)], M['brass'], G, 0, 0, 0, 80, caps=False, xf=xf)
    DC.lathe('mir_g', [(R, .02), (R * .5, .02), (0, .02)], M['mirror'], G, 0, 0, 0, 80, xf=xf)


def jade_roller(M, x, y, z):
    zcyl('jr_handle', M['chrome'], x, y, z, z + 3.9, .13, 20)
    xcyl('jr_big', M['jade'], x - .85, x + .85, y, z + 4.2, .78, 36); xcyl('jr_axle', M['chrome'], x - 1.0, x + 1.0, y, z + 4.2, .09, 16)
    xcyl('jr_small', M['jade'], x - .5, x + .5, y, z + .45, .46, 32)


def gua_sha(M, x, y, z):
    ob = DC.ball('guasha', M['quartz'], x, y, z + 1.35, 1.0, G, sx=1.95, sy=.18, sz=1.35, seg=36, n=18); return ob


def candle(M, x, y, z):
    DC.candle(x, y, z, 1.25, 1.5, M['cup'], M['wax'], G)


def olive_vase(M, rnd, leaves, x, y, z, n=3):
    flask(M, x, y, z, M['aqua'])
    for j in range(n):
        nk = Vector((x, y, z + 3.7)); az = rnd.uniform(-.6, .6) + (j - (n - 1) / 2) * .55; el = rnd.uniform(1.1, 1.4); Lb = rnd.uniform(3.0, 4.2)
        dv = Vector((math.sin(az) * math.cos(el) * 1.3, math.cos(az) * math.cos(el) * .4, math.sin(el))).normalized()
        AH.olive_stem(rnd, leaves, M['bark'], [nk, nk + dv * Lb * .35 + Vector((0, 0, .1)), nk + dv * Lb * .7 + Vector((0, 0, .12)), nk + dv * Lb], 18, .85, .03, .008)


def standing_books(M, x0, y, z, ks, d=2.4):
    x = x0
    for i, k in enumerate(ks):
        wd = .42 + .12 * (i % 3); h = 3.3 + .35 * ((i * 5) % 3); S.box('sbook', M['book%d' % k], x, x + wd, y - d / 2, y + d / 2, z, z + h, G, bev=.03)
        S.box('sbook_band', M['paper'], x + .02, x + wd - .02, y - d / 2 - .01, y - d / 2 + .02, z + h * .55, z + h * .57, G); x += wd


def stones(M, rnd, x, y, z):
    DC.cairn(x, y, z, M['stone_s'], rnd, G, 4, 1.25)


# ---------------- сцена ----------------
def build(sc):
    EP.main(); g = GAL; M = mats(); rnd = random.Random(52); leaves = AH.oliv_leaves(); cl = cells(); W = g['W']; H = g['H']; cw = g['cw']; ow = g['ow']
    S.box('floor', S.mat_floor('g_floor'), -60, 130, Y0 - 60.0, Y0 + 6.0, -2.0, 0.0, G)
    S.box('back', M['wall'], -40, 104, Y0, Y0 + 3.0, -3.0, H + 30, G)                                                                                        # задняя стенка ниш: светлая штукатурка
    for c in range(g['cols'] + 1):                                                                                                                              # вертикальные перегородки известняка на всю глубину
        xa = 0.0 if c == 0 else (W - g['mx'] if c == g['cols'] else g['mx'] + c * (cw + g['bw']) - g['bw']); xb = g['mx'] if c == 0 else (W if c == g['cols'] else xa + g['bw'])
        bev(S.box('vbar%d' % c, M['frame'], xa, xb, YF, Y0, 0.0, H, G), .07, 3)
    for nm, (za, zb) in {'hmid': (cl[5]['z1'], cl[0]['z0']), 'htop': (cl[0]['z1'], H)}.items(): bev(S.box(nm, M['frame'], 0.0, W, YF + .03, Y0, za, zb, G), .07, 3)
    bev(S.box('plinth', M['plinth'], 0.0, W, YF - .5, Y0, 0.0, g['plinth'], G), .09, 3); bev(S.box('cornice', M['frame'], -1.0, W + 1.0, YF - .45, Y0, H - .85, H, G), .06, 3)
    for c_ in range(g['cols'] + 1): pass
    paths = ids(); pi = 0
    for c in cl:                                                                                                                                                   # рифлёная панель в каждой нише: травертин у портретов, синий лак у косметики
        S.box('bp', M['flute'] if c['kind'] == 'P' else M['flute_navy'], c['x0'], c['x1'], Y0 - .06, Y0 + .02, c['z0'], c['z1'], G)
        for xx in (c['x0'] + .02, c['x1'] - .16): S.box('inlay', M['brass'], xx, xx + .14, Y0 - .16, Y0 - .06, c['z0'], c['z1'], G)                                 # латунные вставки по краям ниши
    for c_ in range(1, g['cols']):                                                                                                                                 # латунная линия по центру каждой вертикальной перегородки
        xx = g['mx'] + c_ * (cw + g['bw']) - g['bw'] / 2; S.box('vline', M['brass'], xx - .07, xx + .07, YF - .035, YF + .01, g['plinth'], H - .85, G)
    for za, zb_ in ((cl[5]['z1'], cl[0]['z0']),): S.box('hline', M['brass'], 0.4, W - .4, YF - .01, YF + .03, (za + zb_) / 2 - .07, (za + zb_) / 2 + .07, G)
    S.box('plinth_line', M['brass'], 0.0, W, YF - .55, YF - .45, g['plinth'] - .22, g['plinth'] - .10, G)
    for c in cl:
        cx = c['cx']; z1 = c['z1']
        S.box('led', M['led'], cx - cw / 2 + .45, cx + cw / 2 - .45, YF + .25, YF + .75, z1 - .12, z1 - .02, G)                                                  # подсветка ниши: светящаяся планка под верхней перегородкой + мягкий свет вниз
        al = bpy.data.lights.new('niche', 'AREA'); al.energy = F('LEDL', 520.0); al.size = cw - 1.0; al.size_y = 1.6; al.color = S.E3('LEDC', (1.0, .92, .80))
        ao = bpy.data.objects.new('niche', al); bpy.context.collection.objects.link(ao); ao.location = (cx, YF + 1.0, z1 - .25); ao.rotation_euler = (math.radians(24), 0, 0); ao.visible_camera = False
        if c['kind'] == 'P':
            i = pi; pi += 1; ab = c['ab']; at = c['at']; ap0, ap1 = cx - g['apw'] / 2, cx + g['apw'] / 2; fb = c['fb']; yp = PAN_Y - .55                                         # фотопечать парит на .55 ед. над панелью
            rect_plane('photo%d' % i, photo_mat('g_photo%d' % i, '/tmp/ag_%s.png' % paths[i]), ap0, ap1, ab, at, yp - .24 - F('PHOFF', .05), uv=True)                                       # поверхность печати (глянцевая)
            bev(S.box('print%d' % i, M['white'], ap0 + .01, ap1 - .01, yp - .24, yp, ab + .01, at - .01, G), .07, 2)                                                     # основа печати 1,2 см — тонкий белый торец, без рамы
            for sx_, sz_ in ((ap0 + .55, ab + .55), (ap1 - .55, ab + .55), (ap0 + .55, at - .55), (ap1 - .55, at - .55)):                                                 # четыре латунные стойки с шляпками
                bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.15, depth=.56, location=(sx_, yp + .28, sz_), rotation=(math.pi / 2, 0, 0)); st = bpy.context.object; st.name = 'standoff'; st.data.materials.append(M['brass']); bpy.ops.object.shade_smooth(); st['grp'] = G
                bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.26, depth=.10, location=(sx_, yp - .29, sz_), rotation=(math.pi / 2, 0, 0)); cp = bpy.context.object; cp.name = 'standoff_cap'; cp.data.materials.append(M['brass']); bpy.ops.object.shade_smooth(); cp['grp'] = G
            ow_ = g['ow']; bev(S.box('plq%d' % i, M['stone'], cx - ow_ / 2, cx + ow_ / 2, PAN_Y - .30, PAN_Y, c['pz0'], c['pz1'], G), .05, 2); S.box('plq_line', M['brass'], cx - ow_ / 2 + .18, cx + ow_ / 2 - .18, PAN_Y - .32, PAN_Y - .29, c['pz1'] - .26, c['pz1'] - .23, G)
        else:
            z0 = c['z0']; yb = Y0 - 2.2; x0c = c['x0']
            sh = [z0 + 7.6] if c['kind'] == 'A' else [z0 + 4.95, z0 + 9.9]
            for zs in sh: bev(S.box('shelf', M['shelf'], c['x0'] + .05, c['x1'] - .05, Y0 - 3.5, Y0 - .05, zs - .13, zs + .13, G), .02, 1)
            if c['kind'] == 'A':                                                                                                                               # уход за кожей: флаконы, кремы, туба, зеркало, свеча / полотенца, чаша с ватой, веточка
                mirror(M, x0c + 8.6, Y0 - .9, z0, 3.3)
                bottle('pump', x0c + 1.7, yb, z0, 5.4, M['navy_gl'], M['black'], M['label']); bottle('drop', x0c + 3.3, yb + .1, z0, 3.7, M['amber'], M['black'], M['label']); bottle('jar', x0c + 5.1, yb + .2, z0, 1.8, M['milk'], M['brass'])
                bottle('tube', x0c + 6.7, yb, z0, 4.2, M['white'], M['navy_gl']); candle(M, x0c + 9.7, yb + .3, z0)
                zt = sh[0] + .13; rolled_towel(M, x0c + 3.0, yb - .1, zt, 5.0, 1.0); rolled_towel(M, x0c + 3.0, yb + .15, zt + 2.0, 5.0, 1.0)
                cotton_bowl(M, x0c + 7.0, yb, zt, rnd); olive_vase(M, rnd, leaves, x0c + 10.2, yb, zt, 2)
            else:                                                                                                                                              # спа и инъекционная косметология: полотенца, гуаша, камни, ампулы, пипетки, ватные диски, роллер, книги, кремы
                folded_towels(M, x0c + 3.0, yb, z0, 4, rnd); gua_sha(M, x0c + 6.3, yb, z0); stones(M, rnd, x0c + 8.2, yb, z0); olive_vase(M, rnd, leaves, x0c + 10.2, yb, z0, 2)
                z1_ = sh[0] + .13; ampoules(M, x0c + 2.9, yb, z1_)
                for bx, H_, r_ in ((5.8, 2.3, .62), (7.0, 2.0, .55), (8.1, 2.4, .6)): bottle('drop', x0c + bx, yb, z1_, H_, M['amber'], M['black'], M['label'])
                cotton_pads(M, x0c + 10.0, yb, z1_)
                z2_ = sh[1] + .13; jade_roller(M, x0c + 1.5, yb, z2_); standing_books(M, x0c + 3.4, yb, z2_, [4, 1, 0, 3, 2, 1], 2.4)
                bottle('jar', x0c + 8.8, yb, z2_, 1.7, M['milk'], M['brass']); bottle('jar', x0c + 10.5, yb + .2, z2_, 1.3, M['sand_gl'], M['black'])
    n0 = len(bpy.data.objects)
    AH.cast_branches(M, leaves, rnd, [(6, H - 4), (30, H - 2), (58, H - 6), (62, 14)], per=7, count=36, k=1.25, s0=16.0, s1=26.0, wall_y=YF, d=AH.SUN_DIR)
    for ob in bpy.data.objects:
        if not ob.visible_camera and ob.type != 'LIGHT': ob.visible_glossy = False; ob.visible_transmission = False
    return M


def lights(sc):
    g = GAL; sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = F('SUN', 5.0); sun.angle = math.radians(F('SUN_ANGLE', 2.0)); sun.color = S.E3('SUNC', (1.0, .90, .76))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so); so.rotation_euler = AH.SUN_DIR.to_track_quat('-Z', 'Y').to_euler(); so.location = (-70, -70, 60)
    fl = bpy.data.lights.new('fill', 'AREA'); fl.energy = F('FILL', 2400.0); fl.size = 90; fl.size_y = 40; fl.color = S.E3('FILLC', (1.0, .90, .78))
    fo = bpy.data.objects.new('fill', fl); bpy.context.collection.objects.link(fo); fo.location = (-50, -90, 50); fo.rotation_euler = (Vector((32, Y0, g['H'] / 2)) - Vector(fo.location)).to_track_quat('-Z', 'Y').to_euler(); fo.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.98, .88, .76)), 1); bg.inputs['Strength'].default_value = F('WORLD', .22); sc.world = w


def camera(sc):
    g = GAL; lens = g['lens']; df = g['W'] * lens / 36.0
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 5000.0
    cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); cam.location = (g['W'] / 2, YF - df, g['H'] / 2); cam.rotation_euler = (math.pi / 2, 0, 0); sc.camera = cam
    bpy.context.view_layer.update(); return cam


def layout(sc, cam, pw, ph):
    """gallery.json: доли кадра для каждого портрета (по порядку преподавателей): проём (ap), рама (frame), табличка (plaque); проекция — настоящая камера сцены"""
    g = GAL; r5 = lambda v: round(v, 5)
    def rect(x0, x1, z0, z1, y):
        a = world_to_camera_view(sc, cam, Vector((x0, y, z1))); b = world_to_camera_view(sc, cam, Vector((x1, y, z0))); return {'x': r5(a.x), 'y': r5(1 - a.y), 'w': r5(b.x - a.x), 'h': r5((1 - b.y) - (1 - a.y))}
    out = {'plate': {'w': pw, 'h': ph}, 'unit_cm': 5, 'ids': ids(), 'cols': g['cols'], 'cells': []}
    for c in cells():
        if c['kind'] != 'P': continue
        cx = c['cx']; ow = g['ow']
        out['cells'].append({'cx': r5(world_to_camera_view(sc, cam, Vector((cx, PAN_Y, c['ab']))).x), 'ap': rect(cx - g['apw'] / 2, cx + g['apw'] / 2, c['ab'], c['at'], PAN_Y - .79), 'frame': rect(cx - g['apw'] / 2, cx + g['apw'] / 2, c['ab'], c['at'], PAN_Y - .79),
                             'plaque': rect(cx - ow / 2, cx + ow / 2, c['pz0'], c['pz1'], PAN_Y - .30)})
    return out


def export(raw):
    from PIL import Image
    import numpy as np
    im = Image.open(raw); rgb = np.asarray(im.convert('RGB')); g = S.grade(rgb, sat=F('AH_SAT', 1.22), gamma=F('AH_GAMMA', .90), lift=F('AH_LIFT', .02))
    g = np.clip(g * np.array([float(x) for x in os.environ.get('AH_WARM', '1.0,.99,.96').split(',')], np.float32), 0, 255).astype(np.uint8); im2 = Image.fromarray(g)
    im2.save(os.path.join(OUT, 'gallery.webp'), quality=90, method=6); im2.resize((1600, round(1600 * im2.height / im2.width)), Image.LANCZOS).save(os.path.join(OUT, 'gallery-s.webp'), quality=88, method=6)


def main():
    cells(); H = GAL['H']; pw = int(os.environ.get('AH_W', 1280 if MODE == 'preview' else PW)); ph = round(pw * H / GAL['W']); spp = int(os.environ.get('AH_SPP', 24 if MODE == 'preview' else 96))
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; S.settings(sc, pw, ph, spp); sc.view_settings.exposure = F('EXPO', -0.8)
    cr = os.environ.get('CROP')
    if cr and MODE == 'preview':
        x0, x1, y0, y1 = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.use_crop_to_border = True; sc.render.border_min_x, sc.render.border_max_x = x0, x1; sc.render.border_min_y, sc.render.border_max_y = 1 - y1, 1 - y0
    build(sc); lights(sc); cam = camera(sc); print('сцена собрана: объектов %d, кадр %dx%d, стена %.0fx%.1f ед.' % (len(bpy.data.objects), pw, ph, GAL['W'], H), flush=True)
    os.makedirs(OUT, exist_ok=True)
    if MODE == 'layout':
        json.dump(layout(sc, cam, pw, ph), open(os.path.join(OUT, 'gallery.json'), 'w'), ensure_ascii=False, indent=1); print('layout done'); return
    if MODE == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/ag_preview.png'); bpy.ops.render.render(write_still=True)
        try:
            from PIL import Image
            import numpy as np
            g = S.grade(np.asarray(Image.open(sc.render.filepath).convert('RGB')), sat=F('AH_SAT', 1.22), gamma=F('AH_GAMMA', .90), lift=F('AH_LIFT', .02))
            g = np.clip(g * np.array([float(x) for x in os.environ.get('AH_WARM', '1.0,.99,.96').split(',')], np.float32), 0, 255).astype(np.uint8); Image.fromarray(g).save(sc.render.filepath.replace('.png', '_g.jpg'), quality=92)
        except Exception as e: print('grade skipped', e)
        print('preview done'); return
    raw = '/tmp/ag_full.png'; nt_ = int(os.environ.get('AH_TILES', 1))
    if nt_ > 1: AH.render_tiles(sc, raw, nt_)
    else: sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    json.dump(layout(sc, cam, pw, ph), open(os.path.join(OUT, 'gallery.json'), 'w'), ensure_ascii=False, indent=1); export(raw); print('готово →', OUT, flush=True)


if __name__ == '__main__':
    main()
