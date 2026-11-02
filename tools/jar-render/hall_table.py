#!/usr/bin/env python3
"""ASTREYA HOUSE, зал на прежней сцене: тот же зал, что в hall_story.py (арка, ниша, каменный знак и шар, комната со стеллажом, олива, ваза с деревом, камни, пол, свет, камера, сценарий, каменный подиум с баночкой — всё как
было, ничего из этого не тронуто), к которому добавлена «зона ожидания» на переднем плане:
  • стеклянный столик (тонкое светлое стекло на низком каменном барабане) — на нём на сайте лежит журнал ASTREYA (настоящий HTML поверх кадра; положение столика в кадре даёт `track`);
  • два диванчика (светлое букле, тёмно-синие подушки): один у стены за столиком, другой слева, повёрнут к столику;
  • (надпись ASTREYA на стене по просьбе заказчика убрана; код оставлен: ZONE_TEXT_ON=1 включает её обратно).
Места задаёт заказчик долями кадра (эскиз «столик — 2, диванчики — 3 и 4, надпись — 5»): ниже они переводятся лучом камеры общего плана в метры на полу, поэтому в готовом кадре всё стоит там, где нарисовано.
Лампы света баночки (сила 0 в слое зала) и ветки вне кадра скрыты от отражений и преломлений: иначе в стекле они отражались чёрными пятнами (см. docs/ASTREYA-HOUSE.md).
Команды те же, что у hall_story.py (track, camtrack, still, anim …); `where` печатает, куда в метрах попали места из эскиза.
  python3 hall_table.py still <кадр> out.png [--layer all|bg|jar|z] [--res 1600x900] [--samples 28] [--total 60] [--portrait]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# кадр — как на сайте сейчас (боевые кадры): шар выше и меньше, общий план 36 мм — под шаром баночка стоит свободно, не уходит за него вглубь
for _k, _v in (('HALL_SPH_X', '.715'), ('HALL_SPH_Y', '.335'), ('HALL_SPH_D', '.205'), ('HALL_LENS_L', '36'), ('HALL_TREE_H', '.50')):          # HALL_TREE_H: высота ствола над горлышком вазы — листва стоит высоко, у верхнего края, как на сайте сейчас
    os.environ.setdefault(_k, _v)
import hall_story as H
from hall_story import SC, S, Vector, bpy

_f = lambda k, d: float(os.environ.get(k, d))
_xy = lambda k, d: tuple(float(v) for v in os.environ.get(k, d).split(','))

# ---------------------------------------------------------------------------------------------------------------- места из эскиза (доли кадра: x, y)
# ПК: положение — точка, где предмет касается пола (для надписи — центр на стене)
SPOT = {
    False: dict(table=_xy('ZONE_TABLE', '.40,.935'), sofa_back_x=_f('ZONE_SOFA_BACK_X', .335), sofa_left=_xy('ZONE_SOFA_LEFT', '.10,.89'), text=_xy('ZONE_TEXT', '.31,.155')),
    True: dict(table=_xy('ZONE_TABLE_P', '.34,.985'), sofa_back_x=_f('ZONE_SOFA_BACK_X_P', .34), sofa_left=_xy('ZONE_SOFA_LEFT_P', '.10,.93'), text=_xy('ZONE_TEXT_P', '.46,.10')),
}
SOFA_BACK = {False: dict(xy=_xy('ZONE_SOFA_BACK_XY', '-.28,-.585'), w=_f('ZONE_SOFA_BACK_W', .56), yaw=_f('ZONE_SOFA_BACK_YAW', .30), hk=1.0),            # ПК: перед ножкой горы (гора стоит на y = −0,42), спинкой к ней, лицом к столику и зрителю
             True: dict(xy=_xy('ZONE_SOFA_BACK_XY_P', '.54,-1.1'), w=_f('ZONE_SOFA_BACK_W_P', .32), yaw=_f('ZONE_SOFA_BACK_YAW_P', .35), hk=_f('ZONE_SOFA_BACK_HK_P', .7))}     # телефон: перед вазой с деревом
TABLE_R_P = _f('ZONE_TABLE_R_P', .14)
os.environ.setdefault('HALL_DXP_P', '.10')                                                                                               # на телефоне вазу с деревом чуть вправо: прежняя (−0,15) стояла ровно перед подиумом и закрывала баночку
TEXT_W = {False: _f('ZONE_TEXT_W', .24), True: _f('ZONE_TEXT_W_P', .46)}            # ширина надписи, доли ширины кадра
TABLE_TOP = _f('ZONE_TABLE_TOP', .105)                                               # высота стекла над полом, м
TABLE_R = _f('ZONE_TABLE_R', .20)                                                    # радиус стекла, м
SOFA_W = _f('ZONE_SOFA_W', .66)                                                      # длина дивана, м (сцена примерно втрое меньше жизни: арка 0,82 м)
SOFA_D = _f('ZONE_SOFA_D', .30)
GLASS_T = .018
ROCK_SHIFT = _xy('ZONE_ROCK_SHIFT', '.34,-.10')                                      # камень «chunk-b» стоял ровно на месте столика: сдвигаем его правее и дальше (вне пути баночки)


def cam_basis(portrait):
    pos, tgt, lens = H.CAM_END_P if portrait else H.CAM_END_L
    f = (tgt - pos).normalized(); r = f.cross(Vector((0, 0, 1))).normalized(); u = r.cross(f)
    aspect = 9 / 16 if portrait else 16 / 9
    thw = (18.0 * (aspect if portrait else 1.0)) / lens                              # половина ширины кадра на единице глубины
    return pos, f, r, u, thw, thw / aspect


def ray(fx, fy, portrait=False):
    pos, f, r, u, thw, thh = cam_basis(portrait)
    return pos, (f + r * ((fx - .5) * 2 * thw) + u * ((.5 - fy) * 2 * thh)).normalized()


def floor_point(fx, fy, h=0.0, portrait=False):
    """точка плоскости z = h, на которую при камере общего плана смотрит пиксель (fx, fy) кадра"""
    pos, d = ray(fx, fy, portrait)
    return pos + d * ((h - pos.z) / d.z)


def plane_y_x(fx, fy, y, portrait=False):
    """x точки, где луч через (fx, fy) пересекает плоскость y = const"""
    pos, d = ray(fx, fy, portrait)
    return (pos + d * ((y - pos.y) / d.y)).x


def meters_per_frame(depth, portrait=False):
    pos, f, r, u, thw, thh = cam_basis(portrait)
    return depth * 2 * thw


# ---------------------------------------------------------------------------------------------------------------- материалы
_orig_mats = H.mats


def zone_mats():
    M = _orig_mats()
    g = bpy.data.materials.new('zt_glass'); g.use_nodes = True; nt = g.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tr1 = nt.nodes.new('ShaderNodeBsdfTransparent'); tr1.inputs['Color'].default_value = (_f('ZONE_GLASS_TR', .86), _f('ZONE_GLASS_TG', .95), _f('ZONE_GLASS_TB', .90), 1)
    gs = nt.nodes.new('ShaderNodeBsdfGlossy'); gs.inputs['Roughness'].default_value = .015; gs.inputs['Color'].default_value = (.97, 1.0, .98, 1)
    fr = nt.nodes.new('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.5
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; mx.inputs[1].default_value = _f('ZONE_GLASS_MINR', .16)
    nt.links.new(fr.outputs['Fac'], mx.inputs[0])
    m1 = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(mx.outputs['Value'], m1.inputs['Fac']); nt.links.new(tr1.outputs['BSDF'], m1.inputs[1]); nt.links.new(gs.outputs['BSDF'], m1.inputs[2])
    # изнутри (задняя грань) — прозрачно: иначе Френель при выходе из пластины даёт полное внутреннее отражение, свет застревает внутри, и стекло чернеет
    gm = nt.nodes.new('ShaderNodeNewGeometry'); tr3 = nt.nodes.new('ShaderNodeBsdfTransparent'); m3 = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(gm.outputs['Backfacing'], m3.inputs['Fac']); nt.links.new(m1.outputs['Shader'], m3.inputs[1]); nt.links.new(tr3.outputs['BSDF'], m3.inputs[2])
    tr2 = nt.nodes.new('ShaderNodeBsdfTransparent'); lp = nt.nodes.new('ShaderNodeLightPath'); m2 = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], m2.inputs['Fac']); nt.links.new(m3.outputs['Shader'], m2.inputs[1]); nt.links.new(tr2.outputs['BSDF'], m2.inputs[2]); nt.links.new(m2.outputs['Shader'], out.inputs['Surface'])
    M['glass'] = g
    ge = bpy.data.materials.new('zt_glass_edge'); ge.use_nodes = True; nte = ge.node_tree; nte.nodes.clear()      # торец: настоящее толстое стекло (светло-зелёная кромка)
    oe = nte.nodes.new('ShaderNodeOutputMaterial'); gl = nte.nodes.new('ShaderNodeBsdfGlass'); gl.inputs['Color'].default_value = (.80, .96, .88, 1); gl.inputs['Roughness'].default_value = .03; gl.inputs['IOR'].default_value = 1.5
    te = nte.nodes.new('ShaderNodeBsdfTransparent'); le = nte.nodes.new('ShaderNodeLightPath'); me = nte.nodes.new('ShaderNodeMixShader')
    nte.links.new(le.outputs['Is Shadow Ray'], me.inputs['Fac']); nte.links.new(gl.outputs['BSDF'], me.inputs[1]); nte.links.new(te.outputs['BSDF'], me.inputs[2]); nte.links.new(me.outputs['Shader'], oe.inputs['Surface'])
    M['glass_edge'] = ge
    # мягкая ткань букле (диваны): светлая, матовая, с мелкой неоднородностью цвета; тёмно-синие подушки — фирменный акцент
    for key, col in (('fabric', (.93, .87, .76)), ('navy', (.018, .03, .075))):
        f = bpy.data.materials.new('zt_' + key); f.use_nodes = True; nt = f.node_tree
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Roughness'].default_value = .95
        for k, v in (('Sheen Weight', .35), ('Sheen Roughness', .6)):
            if k in b.inputs:
                b.inputs[k].default_value = v
        tc = nt.nodes.new('ShaderNodeTexCoord'); ns = nt.nodes.new('ShaderNodeTexNoise'); ns.inputs['Scale'].default_value = 260.0; ns.inputs['Detail'].default_value = 4.0
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs[6].default_value = (col[0] * .90, col[1] * .90, col[2] * .90, 1); mx.inputs[7].default_value = (*col, 1)
        nt.links.new(tc.outputs['Object'], ns.inputs['Vector']); nt.links.new(ns.outputs['Fac'], mx.inputs['Factor']); nt.links.new(mx.outputs[2], b.inputs['Base Color'])
        M['sofa_' + key] = f
    t = bpy.data.materials.new('zt_ink'); t.use_nodes = True                                              # надпись на стене: тёмно-синяя матовая инкрустация
    b = next(n for n in t.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (.012, .022, .06, 1); b.inputs['Roughness'].default_value = .75
    M['ink'] = t
    return M


H.mats = zone_mats


# ---------------------------------------------------------------------------------------------------------------- геометрия зоны ожидания
def _crisp(ob, deg=38.0):
    """плоская чёткая крышка: фаска применяется, затем сглаживание только там, где угол между гранями мал — иначе нормали огромной крышки «вспучиваются» к ободу, и стекло отражает зал как выпуклое зеркало"""
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    for md in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
    except Exception:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(deg))


def build_sofa(name, M, cx, cy, yaw, w=SOFA_W, d=SOFA_D, hk=1.0):
    """диванчик из светлого букле: основание на ножках, два сиденья, спинка из двух подушек, подлокотники, две тёмно-синие подушки; фронт — в сторону −y при yaw = 0"""
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    root.location = (cx, cy, 0); root.rotation_euler = (0, 0, yaw); root.scale = (1, 1, hk)
    bpy.context.view_layer.update()
    x0, x1, y0, y1 = -w / 2, w / 2, -d / 2, d / 2
    fab, navy = M['sofa_fabric'], M['sofa_navy']
    parts = [SC.box(name + '_base', fab, x0, x1, y0, y1, .035, .105, 'p', .018),
             SC.box(name + '_back', fab, x0, x1, y1 - .075, y1, .105, .255, 'p', .02)]
    for sgn in (-1, 1):                                                                                 # подлокотники
        ax0, ax1 = (x0, x0 + .06) if sgn < 0 else (x1 - .06, x1)
        parts.append(SC.box('%s_arm%d' % (name, sgn), fab, ax0, ax1, y0, y1 - .02, .105, .185, 'p', .02))
    mid = (x0 + .06 + x1 - .06) / 2
    for k, (sx0, sx1) in enumerate(((x0 + .06, mid - .004), (mid + .004, x1 - .06))):                  # сиденья и спинки-подушки
        parts.append(SC.box('%s_seat%d' % (name, k), fab, sx0, sx1, y0 + .012, y1 - .08, .105, .145, 'p', .016))
        parts.append(SC.box('%s_bk%d' % (name, k), fab, sx0 + .01, sx1 - .01, y1 - .125, y1 - .072, .145, .245, 'p', .018))
    for k, px in enumerate((x0 + .16, x1 - .15)):                                                       # подушки: тёмно-синие
        parts.append(SC.box('%s_pil%d' % (name, k), navy, px - .045, px + .045, y1 - .15, y1 - .085, .145, .22, 'p', .016))
    for sx in (x0 + .05, x1 - .05):                                                                     # ножки
        for sy in (y0 + .04, y1 - .04):
            parts.append(SC.cylinder('%s_leg%d' % (name, len(parts)), M['trav2'], sx, sy, .012, 0, .038, 'p', seg=24, bev=0))
    for ob in parts:                                                                                    # геометрия задана в осях дивана: единичная обратная матрица родителя — диван встаёт на место и поворачивается вместе с корнем
        ob.parent = root
    return root


_orig_arch = H.build_architecture


TREE_XY_D = _xy('ZONE_TREE_XY', '.82,-.52')                                                               # ПК: ваза с деревом правее и глубже прежней (.70, −.52): на прежнем месте путь баночки проходил сквозь вазу; телефон — прежнее место


def zone_architecture(M, portrait):
    if not portrait:
        H.TXY = TREE_XY_D
    _orig_arch(M, portrait)
    sp = SPOT[bool(portrait)]
    zone = {}
    # стеклянный столик: основание + барабан + стекло с зелёной кромкой
    if portrait:                                                                                             # телефон: места в метрах (кадр узкий, диван перед вазой, столик — слева внизу)
        tx, ty = _xy('ZONE_TABLE_XY_P', '.22,-1.2')
    else:
        tp = floor_point(*sp['table'], portrait=portrait)
        tx, ty = tp.x, tp.y
    SC.cylinder('tbl_foot', M['trav2'], tx, ty, .085, 0, .02, 'p', seg=96, bev=.004)
    SC.cylinder('tbl_drum', M['inner'], tx, ty, .06, 0, TABLE_TOP - GLASS_T - .003, 'p', seg=96, bev=.006)
    tr = TABLE_R_P if portrait else TABLE_R
    SC.cylinder('tbl_glass', M['glass'], tx, ty, tr, TABLE_TOP - GLASS_T, TABLE_TOP, 'p', seg=160, bev=.003)
    for nm in ('tbl_foot', 'tbl_drum', 'tbl_glass'):
        _crisp(bpy.data.objects[nm])
    gob = bpy.data.objects['tbl_glass']; gob.data.materials.append(M['glass_edge'])
    for pl in gob.data.polygons:
        if abs(pl.normal.z) < .6:
            pl.material_index = 1
    S['table_xyr'] = (tx, ty, tr)
    zone['table'] = (tx, ty)
    if os.environ.get('ZONE_KEEP_STRAY') != '1':                                                            # этикетки упаковок без родителя остались в нулевой точке сцены и слиплись в «цилиндр со швом и диском» (виден из-за дивана): не рисуем
        S['stray'] = [ob for ob in bpy.data.objects if ob.type == 'MESH' and ob.parent is None and ob.name.split('.')[0] in ('label', 'labelh', 'labelm')]
        for ob in S['stray']:
            ob.hide_render = True
    if os.environ.get('ZONE_MAG') == '1':                                                                   # 3D-журнал на стекле (mag_model.py): без этой переменной сцена прежняя
        from mag_model import build_magazine
        mc = (tx + _f('ZONE_MAG_DX', 0.0), ty + _f('ZONE_MAG_DY', 0.0))
        S['mag_objs'] = build_magazine(mc[0], mc[1], TABLE_TOP, _f('ZONE_MAG_PW_K', .72) * tr, _f('ZONE_MAG_YAW', 7.0))
        zone['magazine'] = mc
    # диван позади столика: на ПК — перед ножкой горы, на телефоне — перед вазой; лицом к зрителю и чуть к столику
    sb = SOFA_BACK[bool(portrait)]
    sx, sy = sb['xy']
    build_sofa('sofa_back', M, sx, sy, math.atan2(tx - sx, -(ty - sy)) * sb['yaw'], w=sb['w'], hk=sb['hk'])
    zone['sofa_back'] = (sx, sy)
    # диван слева: лицом к столику (на ПК — сдвинут влево и вперёд, чтобы не стоять в одном месте с диваном перед горой)
    if portrait:
        lx, ly = _xy('ZONE_SOFA_LEFT_XY_P', '-.03,-1.05')
    else:
        lx, ly = _xy('ZONE_SOFA_LEFT_XY', '-.64,-1.0')
    build_sofa('sofa_left', M, lx, ly, math.atan2(tx - lx, -(ty - ly)) * _f('ZONE_SOFA_LEFT_YAW', .85), w=SOFA_W * _f('ZONE_SOFA_LEFT_K_P' if portrait else 'ZONE_SOFA_LEFT_K', .5 if portrait else .72), hk=_f('ZONE_SOFA_LEFT_HK_P', .7) if portrait else 1.0)
    zone['sofa_left'] = (lx, ly)
    S['zone_xy'] = zone
    # камень «chunk-b» стоял на месте столика
    for ob in bpy.data.objects:
        if ob.name.startswith('chunk-b'):
            ob.location.x += ROCK_SHIFT[0]; ob.location.y += ROCK_SHIFT[1]
    if os.environ.get('ZONE_TEXT_ON') == '1':                                                              # надпись на стене по просьбе заказчика убрана (везде): включается только явно
        build_wall_text(M, portrait)


def build_wall_text(M, portrait):
    """надпись на большой гладкой стене: луч из камеры общего плана через точку из эскиза находит плоскость стены, буквы ложатся на неё (тёмно-синяя инкрустация)"""
    from mathutils import Matrix
    sc = bpy.context.scene
    sp = SPOT[bool(portrait)]
    pos, d = ray(*sp['text'], portrait)
    bpy.context.view_layer.update()
    hit, loc, nrm, _, obj, _ = sc.ray_cast(bpy.context.evaluated_depsgraph_get(), pos, d)
    if not hit:
        print('надпись: луч не попал в стену'); S['wall_text'] = None; return
    if nrm.dot(-d) < 0:
        nrm = -nrm
    z = nrm.normalized(); y = Vector((0, 0, 1)) - z * z.z; y = y.normalized() if y.length > 1e-4 else Vector((0, 1, 0)); x = y.cross(z)
    bpy.ops.object.text_add(location=(0, 0, 0))
    t = bpy.context.object; t.name = 'wall_text'
    t.data.body = os.environ.get('ZONE_TEXT_BODY', 'ASTREYA')
    t.data.font = bpy.data.fonts.load(os.path.join(HERE, 'fonts', os.environ.get('ZONE_TEXT_FONT', 'Jost-400.ttf')))
    t.data.extrude = .06; t.data.space_character = _f('ZONE_TEXT_TRACK', 1.5)
    t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    t.data.materials.append(M['ink'])
    bpy.context.view_layer.update()
    f = (S['cam'].matrix_world.to_3x3() @ Vector((0, 0, -1))) if S.get('cam') else (H.CAM_END_L[1] - pos).normalized()
    width_target = meters_per_frame(max(.5, (loc - pos).length), portrait) * TEXT_W[bool(portrait)]
    k = width_target / max(1e-6, t.dimensions.x)
    org = loc + z * .0015
    t.matrix_world = Matrix(((x.x, y.x, z.x, org.x), (x.y, y.y, z.y, org.y), (x.z, y.z, z.z, org.z), (0, 0, 0, 1))) @ Matrix.Diagonal((k, k, k * .5, 1))
    S['wall_text'] = {'wall_obj': obj.name, 'loc': [round(v, 3) for v in loc], 'normal': [round(v, 3) for v in z], 'width_m': round(width_target, 3)}


H.build_architecture = zone_architecture

# ---------------------------------------------------------------------------------------------------------------- отражения
_orig_branches = H.build_shadow_branches


def zone_branches():
    """ветки вне кадра дают пятна света от листьев, но лежат между камерой и сценой — в стекле они отражались тёмной массой: прячем их от отражений и преломлений (тень остаётся)"""
    before = set(bpy.data.objects.keys())
    _orig_branches()
    for k in set(bpy.data.objects.keys()) - before:
        ob = bpy.data.objects[k]
        ob.visible_glossy = False; ob.visible_transmission = False


H.build_shadow_branches = zone_branches
_orig_set_layer = H.set_layer


def zone_set_layer(layer):
    """в слое зала свет баночки выключен (сила 0), но площадные лампы видны в отражениях чёрными прямоугольниками: скрываем их от отражений и преломлений"""
    _orig_set_layer(layer)
    for ob in bpy.data.objects:                                                                              # в слое баночки вазы и диваны — вырезы (holdout), как шар: где они стоят перед баночкой на подлёте (кадры 35–37 ПК), спрайт не рисуется; иначе часть баночки за вазой оставалась неосвещённой и рисовалась чёрной поверх вазы
        if ob.type in H.MESHY and (ob.name.split('.')[0] == 'vase' or ob.name.startswith('sofa_')):
            if layer == 'jar':
                ob.visible_camera = True
            ob.is_holdout = layer == 'jar'
    for name in ('jar_fill', 'jar_rim'):
        lo = S.get(name)
        if lo is not None:
            on = layer == 'jar'
            lo.visible_glossy = on; lo.visible_transmission = on; lo.visible_diffuse = on


H.set_layer = zone_set_layer

# ---------------------------------------------------------------------------------------------------------------- дорожки для сайта
_orig_info = H.info


def zone_info(total, portrait):
    """как в hall_story.info + в готовом кадре: столик (центр стекла и диаметр, доли кадра — по ним на сайте лежит журнал), надпись, диваны и проёмы-проходы в комнаты"""
    out = _orig_info(total, portrait)
    H.apply_frame(total - 1, total, portrait)
    sc = bpy.context.scene; cam = S['cam']
    tx, ty, tr = S['table_xyr']
    c = Vector((tx, ty, TABLE_TOP)); x, y = H.proj(sc, cam, c); right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)); x1, _ = H.proj(sc, cam, c + right * tr)
    out['table'] = [round(x, 5), round(y, 5), round(2 * abs(x1 - x), 5)]
    doors = {}
    for key, spec, y0 in (('brands', H.LEFT, 0.0), ('finder', H.INN, .43)):
        pts = [(spec['cx'] - spec['rx'], 0.0), (spec['cx'] + spec['rx'], 0.0), (spec['cx'], spec['zs'] + spec['rx']), (spec['cx'] - spec['rx'], spec['zs']), (spec['cx'] + spec['rx'], spec['zs'])]
        xs, ys = zip(*[H.proj(sc, cam, Vector((px, y0, pz))) for px, pz in pts])
        l, r_, t_, b_ = max(0.0, min(xs)), min(1.0, max(xs)), max(0.0, min(ys)), min(1.0, max(ys))
        doors[key] = [round(l, 4), round(t_, 4), round(r_ - l, 4), round(b_ - t_, 4)]
    out['doors'] = doors
    return out


H.info = zone_info


# ---------------------------------------------------------------------------------------------------------------- траектория баночки в обход вазы
# путь баночки (JAR_WAY) на кадрах 32–38 проходил сквозь вазу с деревом (расстояние до оси вазы 0,07–0,10 при радиусе вазы 0,095): баночка «заходила внутрь вазы».
# Отвод баночки (ZONE_JAR_DEFL) оказался слишком «закрученным» — по просьбе заказчика путь прежний (отвод выключен), а вазу с деревом сдвигаем вправо (HALL_TREE_XY ниже).
JAR_DEFL = {'a': _f('ZONE_JAR_DEFL', .0), 'f': _f('ZONE_JAR_DEFL_F', 35.0), 's': _f('ZONE_JAR_DEFL_S', 3.2)}
_orig_fs = H.frame_state


def zone_frame_state(p, portrait):
    st = _orig_fs(p, portrait)
    a = JAR_DEFL['a'] * math.exp(-.5 * ((p * 59.0 - JAR_DEFL['f']) / JAR_DEFL['s']) ** 2)
    if a > 1e-4:
        st['jar'] = st['jar'] + Vector((-a, 0.0, 0.0))
    return st


H.frame_state = zone_frame_state

def table_box(portrait):
    """область кадра, где столик и журнал: диск стекла, барабан, основание — по ним в кадрах дорисовывается журнал (доли кадра x0, x1, y0, y1; y сверху вниз), поля 2,5 %"""
    sc = bpy.context.scene; cam = S['cam']
    tx, ty, tr = S['table_xyr']
    pts = []
    for k in range(48):
        a = 2 * math.pi * k / 48
        pts.append((tx + tr * math.cos(a), ty + tr * math.sin(a), TABLE_TOP + .02))
        pts.append((tx + .085 * math.cos(a), ty + .085 * math.sin(a), 0.0))
    xy = [H.proj(sc, cam, Vector(q)) for q in pts]
    xs, ys = [q[0] for q in xy], [q[1] for q in xy]
    return (min(xs) - .025, max(xs) + .025, min(ys) - .03, max(ys) + .025)


def mag_patch(argv):
    """magpatch <с> <по> outdir [--res WxH] [--samples N] [--portrait] — дорисовать область столика с 3D-журналом (ZONE_MAG=1) в кадрах зала: PNG участка + json с рамкой в outdir; кадры, где столика нет в кадре, пропускаются.
    Склейку с готовыми кадрами делает paste_mag.py."""
    rest, o = H.parse(argv)
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    os.environ['ZONE_MAG'] = '1'
    a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
    os.makedirs(outdir, exist_ok=True)
    H.build_scene(o['res'], o['samples'], o['portrait'])
    hold_i = int(math.ceil(H.HOLD * (o['total'] - 1) - 1e-9))
    for i in range(a, min(b, hold_i) + 1):
        path = os.path.abspath(os.path.join(outdir, '%03d.png' % i))
        if os.path.exists(path):
            continue
        H.apply_frame(i, o['total'], o['portrait'])
        box = table_box(o['portrait'])
        if box[1] <= 0 or box[0] >= 1 or box[3] <= 0 or box[2] >= 1:
            continue
        box = tuple(min(1.0, max(0.0, v)) for v in box)
        H.render_bg_crop(i, o['total'], path, o['portrait'], box)
        json.dump({'box': box, 'res': list(o['res'])}, open(path.replace('.png', '.json'), 'w'))
        print('участок кадра', i, [round(v, 3) for v in box], flush=True)


def stray_box():
    """область кадра (x0, x1, y0, y1), где видны лишние этикетки в нулевой точке сцены, с полями"""
    sc = bpy.context.scene; cam = S['cam']; xs, ys = [], []
    for ob in S.get('stray', []):
        for c in ob.bound_box:
            q = H.proj(sc, cam, ob.matrix_world @ Vector(c)); xs.append(q[0]); ys.append(q[1])
    if not xs:
        return None
    return (min(xs) - .035, max(xs) + .035, min(ys) - .05, max(ys) + .05)


def fix_patch(argv):
    """fixpatch <с> <по> outdir [--res WxH] [--samples N] [--portrait] — дорисовать (уже без лишних этикеток) область, где они были видны, в кадрах зала: те же файлы, что у magpatch; склейка — paste_mag.py"""
    rest, o = H.parse(argv)
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    os.environ['ZONE_MAG'] = '1'
    a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
    os.makedirs(outdir, exist_ok=True)
    H.build_scene(o['res'], o['samples'], o['portrait'])
    hold_i = int(math.ceil(H.HOLD * (o['total'] - 1) - 1e-9))
    for i in range(a, min(b, hold_i) + 1):
        path = os.path.abspath(os.path.join(outdir, '%03d.png' % i))
        if os.path.exists(path):
            continue
        H.apply_frame(i, o['total'], o['portrait'])
        box = stray_box()
        if box is None or box[1] <= 0 or box[0] >= 1 or box[3] <= 0 or box[2] >= 1:
            continue
        box = tuple(min(1.0, max(0.0, v)) for v in box)
        H.render_bg_crop(i, o['total'], path, o['portrait'], box)
        json.dump({'box': box, 'res': list(o['res'])}, open(path.replace('.png', '.json'), 'w'))
        print('участок кадра', i, [round(v, 3) for v in box], flush=True)


def lamp_block(argv):
    """lampblock <кадр> — что стоит между лампами света баночки и самой баночкой (первое пересечение луча от лампы к центру баночки)"""
    rest, o = H.parse(argv)
    os.environ['ZONE_MAG'] = '1'
    H.build_scene((480, 270), 4, False)
    i = int(rest[1]); H.apply_frame(i, o['total'], False); H.set_layer('jar')
    dg = bpy.context.evaluated_depsgraph_get(); jar = set(S['jar_objs'])
    st = H.frame_state(i / float(max(1, o['total'] - 1)), False); ctr = st['jar'] + Vector((0, 0, H.JAR_CENTER_Z))
    for nm in ('jar_fill', 'jar_rim'):
        lo = S.get(nm); lp = lo.matrix_world.translation; d = (ctr - lp); dist = d.length; d.normalize(); org = lp.copy(); hits = []
        for _ in range(6):
            ok, loc, nrm, idx, hob, mt = bpy.context.scene.ray_cast(dg, org, d, distance=dist - (org - lp).length)
            if not ok:
                break
            if hob in jar or hob.name in S.get('stray_names', ()):
                break
            hits.append((hob.name, round((loc - lp).length, 3), hob.visible_shadow)); org = loc + d * 1e-4
        print('ЛАМПА', nm, [round(v, 3) for v in lp], 'до баночки', round(dist, 3), 'на пути:', hits)
    print('БАНОЧКА', [round(v, 3) for v in ctr], 'кадр', i)


def jar_vs_vase(argv):
    """jarvase — габариты ваз и положение баночки по кадрам: заходит ли баночка в вазу (расстояние в плане и по высоте)"""
    rest, o = H.parse(argv)
    H.build_scene((480, 270), 4, o['portrait'])
    vs = []
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name.split('.')[0] == 'vase':
            c = [ob.matrix_world @ Vector(v) for v in ob.bound_box]
            vs.append((ob.name, [round(min(q[k] for q in c), 3) for k in range(3)], [round(max(q[k] for q in c), 3) for k in range(3)]))
    for v in vs:
        print('ВАЗА', v)
    v1 = next(v for v in vs if v[0] == 'vase.001'); cx, cy = (v1[1][0] + v1[2][0]) / 2, (v1[1][1] + v1[2][1]) / 2; r = (v1[2][0] - v1[1][0]) / 2
    for i in range(24, 60, 2):
        st = H.frame_state(i / float(o['total'] - 1), o['portrait'])
        j = st['jar']; d = math.hypot(j.x - cx, j.y - cy)
        print('кадр', i, 'баночка', [round(v, 3) for v in j], 'до оси вазы %.3f' % d, 'радиус вазы ~%.3f' % r, 'ВНУТРИ' if d < r + .06 else '')


PORTRAIT_PATCH = False


def vase_box():
    """область кадра (x0, x1, y0, y1), где видна ваза с деревом на прежнем (.70, −.52) и новом месте с кроной (ограничивающие параллелепипеды с запасом), с полями"""
    sc = bpy.context.scene; cam = S['cam']; xs, ys = [], []
    for cx, cy in (((.70, -.52), TREE_XY_D) if not PORTRAIT_PATCH else ((.80, -.52),)):
        for dx in (-.58, .58):
            for dy in (-.58, .58):
                for z in (0.0, 1.9):
                    q = H.proj(sc, cam, Vector((cx + dx, cy + dy, z))); xs.append(q[0]); ys.append(q[1])
    return (min(xs) - .02, max(xs) + .02, min(ys) - .02, max(ys) + .02)


def vase_patch(argv):
    """vasepatch <с> <по> outdir [--res WxH] [--samples N] — дорисовать область вазы с деревом (после переноса вазы вправо на ПК); те же файлы, что у magpatch; склейка — paste_mag.py"""
    rest, o = H.parse(argv)
    os.environ['ZONE_MAG'] = '1'
    a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
    os.makedirs(outdir, exist_ok=True)
    global PORTRAIT_PATCH
    PORTRAIT_PATCH = bool(o['portrait'])
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    H.build_scene(o['res'], o['samples'], o['portrait'])
    hold_i = int(math.ceil(H.HOLD * (o['total'] - 1) - 1e-9))
    for i in range(a, min(b, hold_i) + 1):
        path = os.path.abspath(os.path.join(outdir, '%03d.png' % i))
        if os.path.exists(path):
            continue
        H.apply_frame(i, o['total'], o['portrait'])
        box = vase_box()
        if box[1] <= 0 or box[0] >= 1 or box[3] <= 0 or box[2] >= 1:
            continue
        box = tuple(min(1.0, max(0.0, v)) for v in box)
        H.render_bg_crop(i, o['total'], path, o['portrait'], box)
        json.dump({'box': box, 'res': list(o['res'])}, open(path.replace('.png', '.json'), 'w'))
        print('участок кадра', i, [round(v, 3) for v in box], flush=True)


def lab_box():
    """область кадра (x0, x1, y0, y1), где видны упаковки на пороге ниши (бутылка, флакон с пипеткой, баночка): ограничивающие параллелепипеды с запасом"""
    sc = bpy.context.scene; cam = S['cam']; xs, ys = [], []
    for kind, noir, x, y, rot in H.LAB_PACKS:
        for dx in (-.11, .11):
            for dy in (-.11, .11):
                for z in (.0, .34):
                    q = H.proj(sc, cam, Vector((x + dx, y + dy, z))); xs.append(q[0]); ys.append(q[1])
    return (min(xs) - .02, max(xs) + .02, min(ys) - .03, max(ys) + .02)


def lab_patch(argv):
    """labpatch <с> <по> outdir [--res WxH] [--samples N] [--portrait] — вернуть в кадры зала упаковки на пороге ниши (бутылка, флакон, баночка из «световой лаборатории» прежней версии; линий на полу и стеклянной панели нет): дорисовать их область, те же файлы, что у magpatch; склейка — paste_mag.py"""
    rest, o = H.parse(argv)
    os.environ['ZONE_MAG'] = '1'
    os.environ['HALL_LAB_PARTS'] = 'packs'
    H.LAB = True
    a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
    os.makedirs(outdir, exist_ok=True)
    global PORTRAIT_PATCH
    PORTRAIT_PATCH = bool(o['portrait'])
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    H.build_scene(o['res'], o['samples'], o['portrait'])
    hold_i = int(math.ceil(H.HOLD * (o['total'] - 1) - 1e-9))
    for i in range(a, min(b, hold_i) + 1):
        path = os.path.abspath(os.path.join(outdir, '%03d.png' % i))
        if os.path.exists(path):
            continue
        H.apply_frame(i, o['total'], o['portrait'])
        box = lab_box()
        if box[1] <= 0 or box[0] >= 1 or box[3] <= 0 or box[2] >= 1:
            continue
        box = tuple(min(1.0, max(0.0, v)) for v in box)
        H.render_bg_crop(i, o['total'], path, o['portrait'], box)
        json.dump({'box': box, 'res': list(o['res'])}, open(path.replace('.png', '.json'), 'w'))
        print('участок кадра', i, [round(v, 3) for v in box], flush=True)


def find_objs(argv):
    """objs <кадр> x,y [--portrait] — какие объекты сцены стоят в точке кадра (доли кадра x, y сверху вниз): имя, размеры, положение, материалы — чтобы найти лишний предмет"""
    rest, o = H.parse(argv)
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    os.environ['ZONE_MAG'] = '1'
    H.build_scene((480, 270) if not o['portrait'] else (270, 480), 4, o['portrait'])
    i = int(rest[1]); px, py = [float(v) for v in rest[2].split(',')]
    H.apply_frame(i, o['total'], o['portrait'])
    sc = bpy.context.scene; cam = S['cam']
    out = []
    for ob in bpy.data.objects:
        if ob.type not in H.MESHY or not ob.visible_get():
            continue
        pts = [H.proj(sc, cam, ob.matrix_world @ Vector(c)) for c in ob.bound_box]
        xs, ys = [q[0] for q in pts], [q[1] for q in pts]
        if min(xs) - .01 <= px <= max(xs) + .01 and min(ys) - .01 <= py <= max(ys) + .01:
            d = ob.dimensions
            out.append((round((max(xs) - min(xs)) * (max(ys) - min(ys)), 5), ob.name, (ob.parent.name if ob.parent else None, [round(v, 3) for v in ob.parent.matrix_world.translation] if ob.parent else None), [round(v, 3) for v in ob.location], [round(v, 3) for v in d], [m.name for m in ob.data.materials if m], [round(min(xs), 3), round(max(xs), 3), round(min(ys), 3), round(max(ys), 3)]))
    for r in sorted(out)[:25]:
        print('ОБЪЕКТ', r)
    cm = cam.matrix_world; lens = cam.data.lens; W, Hh = o['res'] if o['res'] != (1920, 1080) else (480, 270)
    tanh = 18.0 / lens * (1.0 if W >= Hh else W / float(Hh)); dg = bpy.context.evaluated_depsgraph_get(); hits = {}
    for gx in range(-12, 13):
        for gy in range(-24, 25):
            fx, fy = px + gx * .001, py + gy * .002
            d = cm.to_3x3() @ Vector(((fx - .5) * 2 * tanh, (.5 - fy) * 2 * tanh * Hh / W, -1.0)); d.normalize()
            ok, loc, nrm, idx, hob, mt = bpy.context.scene.ray_cast(dg, cm.translation, d)
            if ok:
                hits.setdefault(hob.name, []).append((round(fx, 3), round(fy, 3)))
    for nm, pts in sorted(hits.items(), key=lambda kv: len(kv[1])):
        ob = bpy.data.objects[nm]
        print('ЛУЧ', nm, len(pts), 'родитель', ob.parent.name if ob.parent else None, 'точки', pts[:2], [round(v, 3) for v in ob.dimensions])
    import collections
    pref = collections.Counter(ob.name.split('.')[0].rstrip('0123456789_') for ob in bpy.data.objects if ob.type == 'EMPTY')
    print('ПУСТЫШКИ', dict(pref))
    for ob in bpy.data.objects:
        if ob.type == 'EMPTY' and (ob.name.startswith('lab') or ob.name.startswith('pk') or ob.name.startswith('shelf') or ob.name.startswith('pack')):
            q = H.proj(sc, cam, ob.matrix_world.translation)
            print('ГРУППА', ob.name, [round(v, 3) for v in ob.matrix_world.translation], [round(v, 3) for v in q], 'детей', len(ob.children))
    for ob in bpy.data.objects:                                                        # пустышки-группы (упаковки, баночки) и их положение в кадре
        if ob.type == 'EMPTY':
            q = H.proj(sc, cam, ob.matrix_world.translation)
            if .40 <= q[0] <= .60 and .50 <= q[1] <= .85:
                print('ГРУППА', ob.name, [round(v, 3) for v in ob.matrix_world.translation], [round(v, 3) for v in q], 'детей', len(ob.children), [c.name for c in ob.children][:4])
    for ob in bpy.data.objects:                                                        # вазы и керамика: где в кадре
        if ob.type in H.MESHY and (ob.name.lower().startswith('vase') or any(m and 'ceramic' in m.name for m in ob.data.materials)):
            pts = [H.proj(sc, cam, ob.matrix_world @ Vector(c)) for c in ob.bound_box]
            print('КЕРАМИКА', ob.name, [round(v, 3) for v in ob.matrix_world.translation], [round(v, 3) for v in ob.dimensions], [round(min(q[0] for q in pts), 3), round(max(q[0] for q in pts), 3), round(min(q[1] for q in pts), 3), round(max(q[1] for q in pts), 3)])


def flight(argv):
    """flight <n> outdir [--res WxH] [--samples N] [--portrait] — пролёт камеры от кадра зала к журналу на столике: n кадров от следующего за кадром зала до вида строго сверху,
    где журнал стоит прямо (верх страницы вверху экрана) и занимает столько же места, сколько живой журнал на сайте. ПК — виден весь разворот, телефон — левая страница (на телефоне журнал показывает одну страницу).
    Рядом пишется flight.json: число кадров и рамка журнала в последнем кадре (доли кадра) — по ней страница совмещает живой журнал с нарисованным."""
    import mag_model
    rest, o = H.parse(argv)
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (900, 1600)
    os.environ['ZONE_MAG'] = '1'
    n, outdir = int(rest[1]), rest[2]
    os.makedirs(outdir, exist_ok=True)
    port = o['portrait']
    lab = os.environ.get('ZONE_FLIGHT_LAB') == '1'                                                    # дорисовать в готовых кадрах пролёта только область с упаковками на пороге ниши (labpatch для кадров зала)
    sprite = os.environ.get('ZONE_FLIGHT_SPRITE') == '1'                                              # баночка — отдельным слоем-спрайтом (как на сайте в зале: те же лампы, экспозиция и этикетка), кадр — без неё: баночка в пролёте не тускнеет; композит — composite_flight.py
    if lab or sprite or os.environ.get('ZONE_FLIGHT_PACKS') == '1':
        os.environ['HALL_LAB_PARTS'] = 'packs'; H.LAB = True                                         # упаковки на пороге ниши (как в живой версии)
    if sprite:
        os.environ['HALL_JAR_LABEL'] = '1'
        os.makedirs(os.path.join(outdir, 'jar'), exist_ok=True)
    H.build_scene(o['res'], o['samples'], port)
    H.apply_frame(o['total'] - 1, o['total'], port)
    st = H.frame_state(1.0, port); pos0, tgt0, lens = st['pos'].copy(), st['tgt'].copy(), st['lens']
    cx, cy = S['zone_xy']['magazine']
    tr = S['table_xyr'][2]
    pw = _f('ZONE_MAG_PW_K', .72) * tr; ph = pw * 4.0 / 3.0
    yaw = math.radians(_f('ZONE_MAG_YAW', 7.0)); ca, sa = math.cos(yaw), math.sin(yaw)
    rot = lambda x, y: (cx + x * ca - y * sa, cy + x * sa + y * ca)
    w_px, h_px = o['res']
    tanh = 18.0 / lens * (1.0 if w_px >= h_px else w_px / float(h_px))              # половина ширины вида на единицу расстояния (датчик 36 мм по большей стороне)
    if port:                                                                           # телефон: левая страница журнала (ширина страницы — .86 ширины кадра)
        ex, ey = rot(-pw / 2, 0.0); dist = pw / (_f('ZONE_FLIGHT_W_P', .86) * 2 * tanh)
    else:                                                                              # ПК: весь разворот (ширина — .62 ширины кадра)
        ex, ey = cx, cy; dist = 2 * pw / (_f('ZONE_FLIGHT_W', .62) * 2 * tanh)
    z0 = TABLE_TOP + .004
    pos1 = Vector((ex, ey, z0 + dist)); tgt1 = Vector((ex, ey, z0))
    up_mag = Vector((-sa, ca, 0.0)); zup = Vector((0.0, 0.0, 1.0))
    sm = lambda x: x * x * (3 - 2 * x)
    cam = S['cam']; sc = bpy.context.scene
    from mathutils import Matrix
    H.set_layer('all'); sc.render.use_border = False
    for i in range(int(os.environ.get('ZONE_FLIGHT_START', 1)), n + 1):                              # ZONE_FLIGHT_START=0 — ещё и нулевой кадр (вид зала в конце сцены героя): из него собирается постер
        path = os.path.abspath(os.path.join(outdir, '%03d.png' % i))
        w = i / float(n); e = sm(w)
        if os.path.exists(path) and i < n:
            continue
        if i > int(os.environ.get('ZONE_FLIGHT_MAX', n)) and (i < n or os.environ.get('ZONE_FLIGHT_NO_LAST') == '1'):                                    # перерисовка только начала пролёта (где видна ваза)
            continue
        pos = pos0.lerp(pos1, e)

        tw = sm(min(1.0, e / .72))                                                       # точка, на которую смотрит камера, к 72 % пути уже на журнале: он не уходит из кадра
        f = ((tgt0.lerp(tgt1, tw)) - pos).normalized()
        ew = sm(min(1.0, max(0.0, (e - .30) / .62)))                                     # к концу «верх» кадра совмещается с верхом страниц журнала
        up = zup.lerp(up_mag, ew)
        up = (up - f * up.dot(f)).normalized()
        right = f.cross(up).normalized(); up = right.cross(f).normalized()
        m3 = Matrix((right, up, -f)).transposed()
        cam.matrix_world = Matrix.Translation(pos) @ m3.to_4x4()
        cam.data.lens = lens; cam.data.shift_x = cam.data.shift_y = 0.0
        bpy.context.view_layer.update()
        sc.render.filepath = path
        if lab:
            box = lab_box()
            if box[1] <= 0 or box[0] >= 1 or box[3] <= 0 or box[2] >= 1:
                continue
            box = tuple(min(1.0, max(0.0, v)) for v in box)
            sc.render.use_border = True; sc.render.use_crop_to_border = True
            sc.render.border_min_x, sc.render.border_max_x = box[0], box[1]
            sc.render.border_min_y, sc.render.border_max_y = 1 - box[3], 1 - box[2]
            bpy.ops.render.render(write_still=True)
            json.dump({'box': box, 'res': list(o['res'])}, open(path.replace('.png', '.json'), 'w'))
            print('участок кадра пролёта', i, [round(v, 3) for v in box], flush=True)
            continue
        if sprite:
            H.set_layer('all')
            for ob in S['jar_objs']:
                if ob.type in H.MESHY:
                    ob.visible_camera = False                                                        # баночка невидима камере, но отбрасывает тень и отражается в полу
            bpy.ops.render.render(write_still=True)
            rect = H.jar_rect()                                                                      # спрайт: слой баночки, экспозиция и ss как у кадров зала
            if rect[2] * o['res'][0] < 4 or rect[3] * o['res'][1] < 4:                                # баночка вышла из кадра (камера опустилась к столику): спрайта нет
                print('кадр пролёта (баночки в кадре нет)', i, '/', n, flush=True)
                H.set_layer('all')
                continue
            H.set_layer('jar')
            sc.view_settings.exposure = float(os.environ.get('HALL_EXP', -.85)) + H.JAR_EXP
            ss = max(2.0, min(6.0, 1000.0 / max(1.0, rect[2] * o['res'][0])))
            sc.render.resolution_x = int(round(o['res'][0] * ss)); sc.render.resolution_y = int(round(o['res'][1] * ss))
            sc.render.use_border = True; sc.render.use_crop_to_border = True
            sc.render.border_min_x, sc.render.border_max_x = rect[0], rect[0] + rect[2]
            sc.render.border_min_y, sc.render.border_max_y = 1 - (rect[1] + rect[3]), 1 - rect[1]
            sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
            jp = os.path.abspath(os.path.join(outdir, 'jar', '%03d.png' % i)); sc.render.filepath = jp
            bpy.ops.render.render(write_still=True)
            json.dump({'rect': rect, 'ss': ss}, open(jp.replace('.png', '.json'), 'w'))
            sc.render.resolution_x, sc.render.resolution_y = o['res']                                # обратно к кадру
            sc.render.use_border = False; sc.render.use_crop_to_border = False
            sc.view_settings.exposure = float(os.environ.get('HALL_EXP', -.85))
            sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
            H.set_layer('all')
            print('кадр пролёта (с отдельной баночкой)', i, '/', n, flush=True)
        else:
            bpy.ops.render.render(write_still=True)
            print('кадр пролёта', i, '/', n, flush=True)
        if i == n:                                                                       # рамка журнала (ПК — разворот, телефон — левая страница) в последнем кадре
            corners = [(-pw, -ph / 2), (pw, -ph / 2), (pw, ph / 2), (-pw, ph / 2)] if not port else [(-pw, -ph / 2), (0.0, -ph / 2), (0.0, ph / 2), (-pw, ph / 2)]
            pts = [H.proj(sc, cam, Vector((rot(x, y)[0], rot(x, y)[1], z0 + .012))) for x, y in corners]
            xs, ys = [q[0] for q in pts], [q[1] for q in pts]
            json.dump({'n': n, 'res': list(o['res']), 'rect': [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)], 'pw': round(pw, 4)}, open(os.path.join(outdir, 'flight.json'), 'w'))
            print('рамка журнала', [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)])


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'where':
        port = '--portrait' in sys.argv
        H.build_scene((480, 270) if not port else (270, 480), 4, port)
        print(json.dumps({'zone': {k: [round(v, 3) for v in xy] for k, xy in S['zone_xy'].items()}, 'wall_text': S.get('wall_text')}, ensure_ascii=False))
    elif len(sys.argv) > 1 and sys.argv[1] == 'magpatch':
        mag_patch(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == 'flight':
        flight(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == 'objs':
        find_objs(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == 'labpatch':
        lab_patch(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == 'vasepatch':
        vase_patch(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == 'jarvase':
        jar_vs_vase(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == 'lampblock':
        lamp_block(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == 'fixpatch':
        fix_patch(sys.argv[1:])
    else:
        H.main()
