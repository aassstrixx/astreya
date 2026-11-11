"""ASTREYA ACADEMY — отдельная сцена «Галерея преподавателей» (страница «Обучение», блок «Преподаватели»).

Всё внутри рендера: стена, обтянутая тёмно-синим бархатом (ворс, блеск по краю, мягко стёганые «отсеки» между латунными рейками); на ней в два ряда по четыре висят портреты восьми преподавателей:
латунная арочная рама с тёмной бронзовой каймой, кремовое паспарту, настоящее фото (улучшенное enhance_portraits.py: assets/teachers/hq2) под стеклом со слабыми бликами,
над каждой рамой — латунный софит-подсветка с тёплым конусом света; под каждым портретом — каменная табличка с латунной окантовкой (текст на ней кладёт вёрстка);
внизу — длинная травертиновая скамья с вазами и ветками оливы, стопкой книг и каменной чашей; на стене тень живой листвы от низкого солнца.
Камера ортографическая и строго фронтальная: положение любой точки стены на картинке — точная линейная функция (доли кадра = x / W, 1 − z / H), поэтому assets/academy/gallery.json
хранит для каждого портрета проём, раму и табличку в долях кадра без искажений перспективы. Вёрстка кладёт на рендер только прозрачные кнопки, подписи на таблички и карточку преподавателя.
Масштаб: 1 ед. сцены = 10 см.
  python3 tools/showroom-assets/academy_gallery.py preview     # быстрый кадр /tmp/ag_preview.png (+ _g.jpg с цветокоррекцией); AH_W — ширина, AH_SPP — сэмплы
  python3 tools/showroom-assets/academy_gallery.py layout      # только assets/academy/gallery.json
  python3 tools/showroom-assets/academy_gallery.py             # итог: assets/academy/gallery.webp (3200 px), gallery-s.webp (1600), gallery.json (AH_TILES=4 — расчёт полосами, возобновляемо)
Фото преподавателей: порядок и id берутся из data/redesign.json (teachers.items), файлы assets/teachers/hq/<id>.webp.
Переменные: AH_W, AH_SPP, AH_TILES, SUN, FILL, LAMP, WORLD, EXPO, WALLC, NAVY, AH_SAT, AH_GAMMA, AH_LIFT, AH_WARM."""
import bpy, math, os, sys, json, random
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import scene as S
import materials as MT
import decor as DC
import academy_hall as AH                                                  # общие детали: ваза с гладким силуэтом, оливковые ветки, тени листвы, травертин с прожилками, расчёт полосами
from mathutils import Vector

ROOT = os.path.join(HERE, '..', '..')
OUT = os.path.join(ROOT, 'assets', 'academy')
G = 'ac'
args = [a for a in sys.argv[1:] if not a.startswith('-')]
MODE = next((a for a in args if a in ('preview', 'layout')), 'final')
F = AH.F
Y0 = 10.0                                                                   # плоскость штукатурной стены
PAN_Y = Y0 - .55                                                            # лицо синей панели
GAL = dict(W=64.0, cols=4, pitch=13.8, apw=7.6, aph=8.14, mat=.95, fr=.5, ph=2.6, pgap=1.0, lite=2.0, z0=6.6, bench=4.4, padt=3.4)
PW = 3200
import enhance_portraits as EP                                           # улучшение исходных фото (×2, без нейросетей)


def ids():
    d = json.load(open(os.path.join(ROOT, 'data', 'redesign.json'), encoding='utf-8')); return [t['id'] for t in d['teachers']['items']]


def gal_cells():
    """раскладка (1 ед. = 10 см): две строки по четыре; для каждой ячейки — центр, нижний край проёма, центр дуги, верх рамы, табличка. Порядок — как в списке преподавателей: сверху вниз, слева направо"""
    g = GAL; ra = g['apw'] / 2; k = g['mat'] + g['fr']; oh = g['aph'] + 2 * k; z = g['z0']; rows = []
    for _ in range(2):
        pz0 = z; pz1 = z + g['ph']; fb = pz1 + g['pgap']
        rows.append(dict(pz0=pz0, pz1=pz1, fb=fb, ab=fb + k, zs=fb + k + g['aph'] - ra, ft=fb + oh)); z = fb + oh + g['lite']
    g['H'] = round(rows[-1]['ft'] + g['padt'], 2)
    return [dict(cx=g['W'] / 2 + (c - (g['cols'] - 1) / 2) * g['pitch'], **row) for row in reversed(rows) for c in range(g['cols'])]


# ---------------- материалы ----------------
def photo_mat(name, path):
    m, nt, b, o = S.mk(name); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(path); tex.image.colorspace_settings.name = 'sRGB'; tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], S.inp(b, 'Base Color')); S.val(b, F('PHR', .62), 'Roughness'); S.val(b, F('PHS', .05), 'Specular IOR Level', 'Specular'); return m


def pane_mat(name='g_pane'):
    """стекло рамы: прозрачное, на скользящих углах отражает (Френель), едва заметная волнистость; поверх — мягкие диагональные блики «окна за спиной зрителя» (свой сдвиг на каждую раму через координаты объекта)"""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new('ShaderNodeOutputMaterial'); tr = N.new('ShaderNodeBsdfTransparent'); gl = N.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = .03
    fr = N.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.5; mx = N.new('ShaderNodeMixShader')
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .35; nz.inputs['Detail'].default_value = 1.0; bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = F('WAVY', .06); bp.inputs['Distance'].default_value = .5
    L.new(tc.outputs['Object'], nz.inputs['Vector']); L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], gl.inputs['Normal']); L.new(bp.outputs['Normal'], fr.inputs['Normal'])
    L.new(fr.outputs['Fac'], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(gl.outputs[0], mx.inputs[2])
    # блик: наклонная полоса (градиент по диагонали x+z) с мягкими краями, тонкая вторая полоса рядом; шум сдвигает кромку
    mp = N.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, math.radians(35), 0); L.new(tc.outputs['Object'], mp.inputs['Vector'])
    sx = N.new('ShaderNodeSeparateXYZ'); L.new(mp.outputs[0], sx.inputs[0])
    wv = N.new('ShaderNodeMath'); wv.operation = 'SINE'; sc_ = N.new('ShaderNodeMath'); sc_.operation = 'MULTIPLY'; sc_.inputs[1].default_value = .21; L.new(sx.outputs['X'], sc_.inputs[0]); L.new(sc_.outputs[0], wv.inputs[0])
    rp = N.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].position = .55; rp.color_ramp.elements[0].color = (0, 0, 0, 1); rp.color_ramp.elements[1].position = .92; rp.color_ramp.elements[1].color = (1, 1, 1, 1); L.new(wv.outputs[0], rp.inputs['Fac'])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, .95, .86, 1); em.inputs['Strength'].default_value = F('GLARE_K', .50)
    mk = N.new('ShaderNodeMixShader'); L.new(rp.outputs['Color'], mk.inputs['Fac']); tr2 = N.new('ShaderNodeBsdfTransparent'); L.new(tr2.outputs[0], mk.inputs[1]); L.new(em.outputs[0], mk.inputs[2])
    ad = N.new('ShaderNodeAddShader'); L.new(mx.outputs[0], ad.inputs[0]); L.new(mk.outputs[0], ad.inputs[1]); L.new(ad.outputs[0], out.inputs['Surface']); return m


def velvet_navy(name, col):
    """тёмно-синий бархат: ворс даёт длинные мазки тона вдоль вертикали (направление ворса) и облака, мелкое зерно ворса через рельеф; почти без зеркального блеска,
    зато ярко выраженный «бархатный» блеск Sheen по касательной — свет от софитов и солнца вспыхивает на краях складок и по кромке конуса света"""
    m, nt, b, o = S.mk(name); L = nt.links
    nap = MT._noise(nt, MT._coord(nt, (.8, .8, .14)), 4.5, 6, .62, .55); cloud = MT._noise(nt, MT._coord(nt, (.5, .5, .5)), 1.3, 3, .5, .5)
    c = MT._ramp(nt, [(.20, (col[0] * .58, col[1] * .60, col[2] * .68, 1)), (.82, (col[0] * 1.65, col[1] * 1.55, col[2] * 1.40, 1))])
    L.new(MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', nap, .62), MT._math(nt, 'MULTIPLY', cloud, .38)), c.inputs['Fac']); L.new(c.outputs['Color'], b.inputs['Base Color'])
    pile = MT._noise(nt, MT._coord(nt, (1, 1, 1)), 70.0, 4, .62); pile2 = MT._noise(nt, MT._coord(nt, (1, 1, 1)), 16.0, 3, .55)
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .30; bp.inputs['Distance'].default_value = .002
    L.new(MT._math(nt, 'ADD', MT._math(nt, 'MULTIPLY', pile, .6), MT._math(nt, 'MULTIPLY', pile2, .4)), bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    MT._val(b, .95, 'Roughness'); MT._val(b, .05, 'Specular IOR Level', 'Specular'); MT._val(b, F('SHEEN', 1.0), 'Sheen Weight', 'Sheen'); MT._val(b, F('SHEENR', .28), 'Sheen Roughness'); MT._val(b, (*S.E3('SHEENC', (.45, .62, 1.0)), 1), 'Sheen Tint')
    return m


def mats():
    M = {}; wc = S.E3('WALLC', (.97, .89, .75))
    M['wall'] = MT.lime_plaster('g_plaster', wc, wave=F('WAVE', 1.5), scale=.42, tone=1.1)
    M['navy'] = velvet_navy('g_velvet', S.E3('NAVY', (.010, .020, .058)))
    M['frame'] = MT.limestone('g_limestone', (.98, .91, .79), scale=.5); M['stone'] = MT.limestone('g_plaque', (.99, .96, .90), .6)
    M['trav'] = MT.travertine('g_trav', (.95, .86, .72), .5, 1.0, 1.3, honed=True); M['bench'] = AH.trav_veined('g_bench', (.93, .82, .66), 'Z', F('VEINB', 2.2), sc=F('BSC', .8))
    M['brass'] = DC.brass('g_brass'); M['bronze'] = S.mat_simple('g_bronze', (.075, .066, .058), .42, .55)
    M['mat'] = S.mat_simple('g_mat', S.E3('MATC', (.72, .68, .58)), .88); M['glaze'] = DC.paint('g_ceramic', (.56, .52, .46), .62, 0, 0.0, .3, bump=.6, bump_scale=14)
    M['bark'] = S.mat_simple('g_bark', (.21, .165, .12), .88); M['led'] = S.mat_led('g_led', F('LED', 7.0), (1.0, .82, .55)); M['pane'] = pane_mat()
    M['b1'] = S.mat_simple('g_book1', (.035, .075, .17), .6); M['b2'] = S.mat_simple('g_book2', (.90, .86, .76), .7); M['b3'] = S.mat_simple('g_book3', (.30, .34, .22), .65)
    return M


# ---------------- геометрия ----------------
def arch_plane(name, mat, cx, R, zs, zb, y, grp, n=72):
    """плоский арочный лист (фото, стекло): контур арки с ногами от zb; UV — по габаритам листа, 0…1"""
    pts = S.arch_path(cx, R, zs, n, zb); verts = [(x, y, z) for x, z in pts]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], [tuple(range(len(verts)))]); me.update(); uv = me.uv_layers.new(name='UVMap'); x0, x1, z0, z1 = cx - R, cx + R, zb, zs + R
    for i, lp in enumerate(me.loops): x, _, z = verts[lp.vertex_index]; uv.data[i].uv = ((x - x0) / (x1 - x0), (z - z0) / (z1 - z0))
    me.materials.append(mat); return S.link(bpy.data.objects.new(name, me), grp)


def velvet_bay(name, mat, xa, xb, z0, z1, A, nx=34, nz=210):
    """отсек бархатной обивки: сетка с мягким выпуклым валиком (A — высота в центре), у реек и у верха/низа сходит на нет"""
    verts, faces = [], []
    for j in range(nz + 1):
        z = z0 + (z1 - z0) * j / nz; t = max(0.0, min(1.0, min(z - z0, z1 - z) / 2.5)); t = t * t * (3 - 2 * t)
        for i in range(nx + 1):
            u = i / nx; verts.append((xa + (xb - xa) * u, Y0 - A * math.sin(math.pi * u) ** .7 * (.35 + .65 * t), z))
    for j in range(nz):
        for i in range(nx): a = j * (nx + 1) + i; faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    return S.mesh_obj(name, verts, faces, mat, G, smooth=True)


def bev(ob, w=.03, seg=2):
    b = ob.modifiers.new('bev', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'; return ob


def ycyl(name, mat, x, z, y0, y1, r, seg=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=y1 - y0, location=(x, (y0 + y1) / 2, z), rotation=(math.pi / 2, 0, 0)); ob = bpy.context.object; ob.name = name
    bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); ob['grp'] = G; return ob


def xcyl(name, mat, x0, x1, y, z, r, seg=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=x1 - x0, location=((x0 + x1) / 2, y, z), rotation=(0, math.pi / 2, 0)); ob = bpy.context.object; ob.name = name
    bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); ob['grp'] = G; return ob


def picture_light(M, cx, zt, zc, name):
    """латунный софит над рамой: круглая планка на стене, вылет, цилиндрический плафон со светящейся щелью; свет — прожектор на портрет"""
    zl = zt + .95; y1 = PAN_Y - 2.3
    ycyl(name + '_plate', M['brass'], cx, zl, PAN_Y - .16, PAN_Y, .55); ycyl(name + '_arm', M['brass'], cx, zl, y1, PAN_Y - .1, .11)
    xcyl(name + '_shade', M['brass'], cx - 2.4, cx + 2.4, y1, zl, .34); S.box(name + '_led', M['led'], cx - 2.2, cx + 2.2, y1 - .20, y1 + .20, zl - .37, zl - .31, G)
    sp = bpy.data.lights.new(name, 'SPOT'); sp.energy = F('LAMP', 3800.0); sp.spot_size = math.radians(F('LAMPA', 82.0)); sp.spot_blend = .9; sp.shadow_soft_size = .25; sp.color = S.E3('LAMPC', (1.0, .80, .58))
    so = bpy.data.objects.new(name, sp); bpy.context.collection.objects.link(so); so.location = (cx, y1 - .05, zl - .45)
    so.rotation_euler = (Vector((cx, PAN_Y, zc + .8)) - so.location).to_track_quat('-Z', 'Y').to_euler(); so.visible_camera = False


def build(sc):
    EP.main(); g = GAL; M = mats(); rnd = random.Random(52); leaves = AH.oliv_leaves(); cells = gal_cells(); W = g['W']; ra = g['apw'] / 2; k = g['mat'] + g['fr']; ow = g['apw'] + 2 * k
    S.box('floor', S.mat_floor('g_floor'), -60, 130, Y0 - 60.0, Y0 + 6.0, -2.0, 0.0, G)
    S.box('wall', M['wall'], -40, 104, Y0, Y0 + 6.0, -3.0, g['H'] + 30, G)
    # стена, обтянутая бархатом: у каждого портрета свой слегка стёганый отсек, между отсеками — латунные рейки; сверху — известняковый карниз с латунным кантом
    bx = [(cells[0]['cx'] - g['pitch'] / 2) + g['pitch'] * j for j in range(g['cols'] + 1)]; edges = [0.0] + bx + [W]; H = g['H']
    for j in range(len(edges) - 1): velvet_bay('bay%d' % j, M['navy'], edges[j] + .25, edges[j + 1] - .25, 0.0, H, F('PUFF', .45))
    for j, x in enumerate(bx): bev(S.box('batten%d' % j, M['brass'], x - .30, x + .30, Y0 - .66, Y0, 0.0, H, G), .06, 3)
    bev(S.box('cornice', M['frame'], -2, W + 2, Y0 - 1.15, Y0, H - 1.25, H + 2, G), .06, 3); S.box('cornice_f', M['brass'], -2, W + 2, Y0 - 1.22, Y0 - 1.0, H - 1.42, H - 1.25, G)
    paths = ids()
    for i, c in enumerate(cells):
        cx = c['cx']; zs = c['zs']; ab = c['ab']; ph = photo_mat('g_photo%d' % i, '/tmp/ag_%s.png' % paths[i])
        arch_plane('photo%d' % i, ph, cx, ra + .15, zs, ab - .15, PAN_Y - .03, G)                                                                               # фото чуть больше проёма: края прячутся за паспарту
        mr = S.arch_frame('mat%d' % i, M['mat'], cx, ra, zs, g['mat'], PAN_Y - .36, PAN_Y - .26, G, n=96, z0=ab); bev(mr, .015, 1)
        S.box('matb%d' % i, M['mat'], cx - ra - g['mat'], cx + ra + g['mat'], PAN_Y - .36, PAN_Y - .26, ab - g['mat'], ab, G)
        fr = S.arch_frame('frm%d' % i, M['brass'], cx, ra + g['mat'], zs, g['fr'], PAN_Y - .82, PAN_Y, G, n=96, z0=ab - g['mat']); bev(fr, .05, 3)
        bev(S.box('frmb%d' % i, M['brass'], cx - ra - k, cx + ra + k, PAN_Y - .82, PAN_Y, ab - k, ab - g['mat'], G), .05, 3)
        bd = S.arch_frame('bead%d' % i, M['bronze'], cx, ra + g['mat'], zs, .13, PAN_Y - .93, PAN_Y - .66, G, n=96, z0=ab - g['mat']); bev(bd, .02, 2)
        bev(S.box('beadb%d' % i, M['bronze'], cx - ra - g['mat'] - .13, cx + ra + g['mat'] + .13, PAN_Y - .93, PAN_Y - .66, ab - g['mat'] - .13, ab - g['mat'], G), .02, 2)
        arch_plane('glass%d' % i, M['pane'], cx, ra + g['mat'] + .04, zs, ab - g['mat'] - .04, PAN_Y - .60, G)
        # табличка под портретом: известняк с латунной окантовкой
        bev(S.box('plq%d' % i, M['stone'], cx - ow / 2, cx + ow / 2, PAN_Y - .34, PAN_Y, c['pz0'], c['pz1'], G), .06, 3)
        for (x0, x1, z0, z1) in ((cx - ow / 2 + .22, cx + ow / 2 - .22, c['pz0'] + .22, c['pz0'] + .245), (cx - ow / 2 + .22, cx + ow / 2 - .22, c['pz1'] - .245, c['pz1'] - .22),
                                 (cx - ow / 2 + .22, cx - ow / 2 + .245, c['pz0'] + .22, c['pz1'] - .22), (cx + ow / 2 - .245, cx + ow / 2 - .22, c['pz0'] + .22, c['pz1'] - .22)):
            S.box('plq_line', M['brass'], x0, x1, PAN_Y - .36, PAN_Y - .33, z0, z1, G)
        picture_light(M, cx, c['ft'], (c['ab'] + c['zs'] + ra) / 2, 'lamp%d' % i)
    # скамья: толстая плита с переходом на узкое основание, слои травертина горизонтальны
    zb = g['bench']
    S.box('bench_top', M['bench'], -8, 72, Y0 - 5.9, Y0 - .05, zb - .9, zb, G, bev=.10); S.box('bench_body', M['bench'], -8, 72, Y0 - 5.3, Y0 - .05, 0.0, zb - .9, G, bev=.06)
    yb = Y0 - 2.9; vz = zb
    for vx, sgn in ((1.7, 1), (W - 1.7, -1)):
        AH.fine_vase('vase', M['glaze'], vx, yb, vz, 8.2, W=3.1)
        for j in range(11):
            nk = Vector((vx, yb, vz + 8.2 * .92)); az = rnd.uniform(0, 6.283); el = rnd.uniform(1.0, 1.5); Lb = rnd.uniform(3.4, 6.2)
            dv = Vector((math.cos(az) * math.cos(el) * .6 + .08 * sgn, math.sin(az) * math.cos(el) * .5, math.sin(el))).normalized()
            AH.olive_stem(rnd, leaves, M['bark'], [nk, nk + dv * Lb * .35 + Vector((0, 0, .1)), nk + dv * Lb * .7 + Vector((0, 0, .15)), nk + dv * Lb], 26, .9, .03, .008)
    # стопка книг и каменная чаша на скамье
    bx = 22.2
    for j, (mk_, w_, d_, h_, rot) in enumerate((('b1', 3.4, 2.5, .55, 4), ('b2', 3.0, 2.3, .45, -6), ('b3', 2.6, 2.0, .40, 9))):
        z_ = zb + sum((.55, .45, .40)[:j]); ob = S.box('book%d' % j, M[mk_], bx - w_ / 2, bx + w_ / 2, yb - d_ / 2, yb + d_ / 2, z_, z_ + h_, G, bev=.03); ob.rotation_euler = (0, 0, math.radians(rot))
        ob.location = (ob.location.x, ob.location.y, ob.location.z)
    DC.lathe('bowl', [(0, 0), (.9, 0), (1.6, .42), (1.95, 1.05), (1.85, 1.12), (1.5, .62), (.9, .22), (0, .2)], M['trav'], G, 44.0, yb, zb, seg=72)
    for a in range(7):                                                                                                                                                # камешки в чаше
        r = rnd.uniform(.28, .42); DC.ball('pebble%d' % a, DC.paint('g_pebble%d' % a, (.80 + rnd.uniform(-.06, .06), .74 + rnd.uniform(-.05, .05), .64, 1), .7), 44.0 + rnd.uniform(-.8, .8), yb + rnd.uniform(-.7, .7), zb + .5, r, G, sz=.7)
    AH.cast_branches(M, leaves, rnd, [(5, g['H'] - 3), (30, g['H'] - 1), (59, g['H'] - 6), (61, 18), (3, 14)], per=8, count=40, k=1.3, s0=16.0, s1=26.0, wall_y=Y0, d=AH.SUN_DIR)
    return M


def lights(sc):
    g = GAL; sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = F('SUN', 6.0); sun.angle = math.radians(F('SUN_ANGLE', 2.0)); sun.color = S.E3('SUNC', (1.0, .90, .76))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so); so.rotation_euler = AH.SUN_DIR.to_track_quat('-Z', 'Y').to_euler(); so.location = (-70, -70, 60)
    fl = bpy.data.lights.new('fill', 'AREA'); fl.energy = F('FILL', 900.0); fl.size = 90; fl.size_y = 40; fl.color = S.E3('FILLC', (1.0, .88, .74))
    fo = bpy.data.objects.new('fill', fl); bpy.context.collection.objects.link(fo); fo.location = (-60, -80, 40); fo.rotation_euler = (Vector((32, Y0, g['H'] / 2)) - Vector(fo.location)).to_track_quat('-Z', 'Y').to_euler(); fo.visible_camera = False
    wl = bpy.data.lights.new('wash', 'AREA'); wl.energy = F('WASH', 2600.0); wl.size = g['W']; wl.size_y = 1.4; wl.color = S.E3('WASHC', (1.0, .84, .62)); wl.spread = math.radians(F('WASHS', 110.0))
    wo = bpy.data.objects.new('wash', wl); bpy.context.collection.objects.link(wo); wo.location = (g['W'] / 2, Y0 - 3.4, g['H'] - .3); wo.rotation_euler = (math.radians(F('WASHR', 168.0)), 0, 0); wo.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.98, .84, .68)), 1); bg.inputs['Strength'].default_value = F('WORLD', .07); sc.world = w
    # «окно за спиной камеры»: только для отражённых лучей мир светлеет в полосе направлений чуть выше горизонта — на стекле рам, латуни и камне появляются мягкие блики, а освещение сцены не меняется
    if F('GLARE', 0.0) <= 0: return
    nt = w.node_tree; N = nt.nodes; Lk = nt.links; tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Generated'], sp.inputs[0])
    rz = N.new('ShaderNodeMapRange'); rz.inputs['From Min'].default_value = -.05; rz.inputs['From Max'].default_value = .09; Lk.new(sp.outputs['Z'], rz.inputs['Value'])
    rx = N.new('ShaderNodeMapRange'); rx.inputs['From Min'].default_value = -.35; rx.inputs['From Max'].default_value = .25; rx.inputs['To Min'].default_value = .35; rx.inputs['To Max'].default_value = 1.0; Lk.new(sp.outputs['X'], rx.inputs['Value'])
    mu = N.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; Lk.new(rz.outputs[0], mu.inputs[0]); Lk.new(rx.outputs[0], mu.inputs[1])
    gk = N.new('ShaderNodeMath'); gk.operation = 'MULTIPLY'; gk.inputs[1].default_value = F('GLARE', 14.0); Lk.new(mu.outputs[0], gk.inputs[0])
    gb = N.new('ShaderNodeBackground'); gb.inputs['Color'].default_value = (1.0, .93, .82, 1); Lk.new(gk.outputs[0], gb.inputs['Strength'])
    lp = N.new('ShaderNodeLightPath'); mx = N.new('ShaderNodeMixShader'); Lk.new(lp.outputs['Is Glossy Ray'], mx.inputs['Fac']); Lk.new(bg.outputs[0], mx.inputs[1]); Lk.new(gb.outputs[0], mx.inputs[2]); Lk.new(mx.outputs[0], N['World Output'].inputs['Surface'])


def camera(sc):
    g = GAL; cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = g['W']; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 5000.0
    cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); cam.location = (g['W'] / 2, Y0 - 100.0, g['H'] / 2); cam.rotation_euler = (math.pi / 2, 0, 0); sc.camera = cam
    bpy.context.view_layer.update(); return cam


def layout(pw, ph):
    """gallery.json: доли кадра для каждого портрета (по порядку преподавателей): проём (x, y, w, h, r — радиус дуги по ширине кадра), внешний габарит рамы, табличка"""
    g = GAL; W, H = g['W'], g['H']; ra = g['apw'] / 2; k = g['mat'] + g['fr']; ow = g['apw'] + 2 * k; oh = g['aph'] + 2 * k; r5 = lambda v: round(v, 5)
    out = {'plate': {'w': pw, 'h': ph}, 'unit_cm': 10, 'ids': ids(), 'cells': []}
    for c in gal_cells():
        cx = c['cx']; ab = c['ab']
        out['cells'].append({'cx': r5(cx / W), 'ap': {'x': r5((cx - ra) / W), 'y': r5(1 - (ab + g['aph']) / H), 'w': r5(2 * ra / W), 'h': r5(g['aph'] / H), 'r': r5(ra / W)},
                             'frame': {'x': r5((cx - ow / 2) / W), 'y': r5(1 - c['ft'] / H), 'w': r5(ow / W), 'h': r5(oh / H)},
                             'plaque': {'x': r5((cx - ow / 2) / W), 'y': r5(1 - c['pz1'] / H), 'w': r5(ow / W), 'h': r5((c['pz1'] - c['pz0']) / H)}})
    return out


def export(raw):
    from PIL import Image
    import numpy as np
    S_ = AH.S; im = Image.open(raw); rgb = np.asarray(im.convert('RGB'))
    g = S_.grade(rgb, sat=F('AH_SAT', 1.25), gamma=F('AH_GAMMA', .88), lift=F('AH_LIFT', .02))
    g = np.clip(g * np.array([float(x) for x in os.environ.get('AH_WARM', '1.0,.985,.95').split(',')], np.float32), 0, 255).astype(np.uint8); im2 = Image.fromarray(g)
    im2.save(os.path.join(OUT, 'gallery.webp'), quality=90, method=6); im2.resize((1600, round(1600 * im2.height / im2.width)), Image.LANCZOS).save(os.path.join(OUT, 'gallery-s.webp'), quality=88, method=6)


def main():
    gal_cells(); H = GAL['H']; pw = int(os.environ.get('AH_W', 1280 if MODE == 'preview' else PW)); ph = round(pw * H / GAL['W']); spp = int(os.environ.get('AH_SPP', 24 if MODE == 'preview' else 96))
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; S.settings(sc, pw, ph, spp); sc.view_settings.exposure = F('EXPO', -0.7)
    cr = os.environ.get('CROP')
    if cr and MODE == 'preview':
        x0, x1, y0, y1 = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.use_crop_to_border = True; sc.render.border_min_x, sc.render.border_max_x = x0, x1; sc.render.border_min_y, sc.render.border_max_y = 1 - y1, 1 - y0
    build(sc); lights(sc); camera(sc); print('сцена собрана: объектов %d, кадр %dx%d, стена %.0fx%.1f ед.' % (len(bpy.data.objects), pw, ph, GAL['W'], H), flush=True)
    os.makedirs(OUT, exist_ok=True)
    if MODE == 'layout':
        json.dump(layout(pw, ph), open(os.path.join(OUT, 'gallery.json'), 'w'), ensure_ascii=False, indent=1); print('layout done'); return
    if MODE == 'preview':
        sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/ag_preview.png'); bpy.ops.render.render(write_still=True)
        try:
            from PIL import Image
            import numpy as np
            g = S.grade(np.asarray(Image.open(sc.render.filepath).convert('RGB')), sat=F('AH_SAT', 1.25), gamma=F('AH_GAMMA', .88), lift=F('AH_LIFT', .02))
            g = np.clip(g * np.array([float(x) for x in os.environ.get('AH_WARM', '1.0,.985,.95').split(',')], np.float32), 0, 255).astype(np.uint8); Image.fromarray(g).save(sc.render.filepath.replace('.png', '_g.jpg'), quality=92)
        except Exception as e: print('grade skipped', e)
        print('preview done'); return
    raw = '/tmp/ag_full.png'; nt_ = int(os.environ.get('AH_TILES', 1))
    if nt_ > 1: AH.render_tiles(sc, raw, nt_)
    else: sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    json.dump(layout(pw, ph), open(os.path.join(OUT, 'gallery.json'), 'w'), ensure_ascii=False, indent=1); export(raw); print('готово →', OUT, flush=True)


if __name__ == '__main__':
    main()
