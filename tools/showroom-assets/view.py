"""Два больших вытянутых арочных окна на левой стене каталога и живописный вид за ними.
Окно собрано как настоящее: арочный проём в стене с глубоким откосом, каменный наличник, каменный подоконник, бронзовая рама с импостами (вертикальная перемычка, четыре поперечины и веерная часть), стекло с преломлением.
Вид — «матовая картина» горной долины с озером (landscape.py: рендер высотного поля в камере каталога, с настоящими тенями гор, дымкой, облаками и отражением в воде). Она лежит на плоскости за стеной, видна только лучам камеры
и лучам, прошедшим стекло (на освещение зала не влияет — стена и пол получают свет от неба, как раньше). Файл landscape.png можно заменить собственной фотографией тех же пропорций (840×520 холст-px).
Положение окон — холст-пиксели (стена на глубине ≈ 13,15 от камеры): WIN = [(центр x, ширина, верх y, низ y)]; перевод в мир — через камеру сцены."""
import bpy, math, os
import materials as MT

CAMZ_ = float(os.environ.get('CAMZ', 1.4)); SHIFT_ = float(os.environ.get('CAM_SHIFT', -140.0)); FX = 1536.0 * 50.0 / 36.0
WALL_D = 13.15                                                     # дистанция до лицевой плоскости стены (y = 1,15)
BD = 15.0                                                          # плоскость картины (y = 3,0): сразу за стеной — резкость как у стены при той же диафрагме
CW, CH = 840.0, 520.0                                              # область холста, которую покрывает картина (как в landscape.py)
WIN = [(175.0, 214.0, 41.0, 488.0), (600.0, 214.0, 41.0, 488.0)]   # центр x, ширина, верх y, низ y (холст 1536×1024): вытянутые окна


def win_world(cx, w, y_top, y_bot):
    """холст → мир на плоскости стены: центр X, полуширина, z верха, z низа (y_img = 512 + FX·(CAMZ − z)/d + CAM_SHIFT)"""
    k = WALL_D / FX
    return (cx - 768.0) * k, w / 2 * k, CAMZ_ - (y_top - SHIFT_ - 512.0) * k, CAMZ_ - (y_bot - SHIFT_ - 512.0) * k


def backdrop(S, grp):
    """плоскость с картиной: эмиссия, видна лучам камеры и пропускания (через стекло), не даёт теней и света"""
    k = BD / FX; hz = SHIFT_ + 512.0                              # строка горизонта на холсте
    x0, x1 = (0.0 - 768.0) * k, (CW - 768.0) * k; z0, z1 = CAMZ_ - (CH - hz) * k, CAMZ_ - (0.0 - hz) * k
    m = bpy.data.materials.new('view_land'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); cb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(tc.outputs['Generated'], sp.inputs[0]); nt.links.new(sp.outputs['X'], cb.inputs['X']); nt.links.new(sp.outputs['Z'], cb.inputs['Y'])
    im = nt.nodes.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(os.path.join(S.HERE, 'landscape.png')); im.interpolation = 'Cubic'; im.extension = 'EXTEND'
    nt.links.new(cb.outputs['Vector'], im.inputs['Vector'])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = float(os.environ.get('VIEW_STR', 1.0)); nt.links.new(im.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    y = 1.15 + (BD - WALL_D)
    ob = S.mesh_obj('view_land', [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], [(0, 1, 2, 3)], m, grp)
    ob.visible_diffuse = False; ob.visible_glossy = False; ob.visible_shadow = False; ob.visible_volume_scatter = False
    return ob


def build(S, M, grp='shell'):
    backdrop(S, grp)
    bronze = bpy.data.materials.new('win_bronze'); bronze.use_nodes = True; bbs = bronze.node_tree.nodes['Principled BSDF']
    S.val(bbs, (.055, .048, .042, 1), 'Base Color'); S.val(bbs, .9, 'Metallic'); S.val(bbs, .32, 'Roughness')
    glass = bpy.data.materials.new('win_glass'); glass.use_nodes = True; gb = glass.node_tree.nodes['Principled BSDF']
    S.val(gb, (1, 1, 1, 1), 'Base Color'); S.val(gb, .01, 'Roughness'); S.val(gb, 1.0, 'Transmission Weight', 'Transmission'); S.val(gb, 1.12, 'IOR'); S.val(gb, .35, 'Specular IOR Level', 'Specular')
    sill_m = MT.travertine('win_sill', (.84, .72, .55), .7, 1.1, 1.8, honed=True)
    for wi, (cxp, wpx, yt, yb) in enumerate(WIN):
        cx, rx, zt, zb = win_world(cxp, wpx, yt, yb); zs = zt - rx
        cut = S.arch_solid('cutW%d' % wi, M['wall'], cx, rx, zs, .90, 1.80, 'shell', z0=zb); cut.hide_render = True; cut.display_type = 'WIRE'
        wall = bpy.data.objects['wall']; bm_ = wall.modifiers.new('cutW%d' % wi, 'BOOLEAN'); bm_.operation = 'DIFFERENCE'; bm_.object = cut; bm_.solver = 'EXACT'
        fr = S.arch_frame('win_arch%d' % wi, M['frame'], cx, rx, zs, .20, .88, 1.16, grp, z0=zb - .02); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .012; fb.segments = 3; fb.limit_method = 'ANGLE'
        S.box('win_sill%d' % wi, sill_m, cx - rx - .26, cx + rx + .26, .70, 1.62, zb - .09, zb + .015, grp, bev=.014)
        r_in = rx - .015
        S.arch_frame('win_sash%d' % wi, bronze, cx, r_in, zs, .07, 1.36, 1.46, grp, z0=zb)
        bw = .04
        S.box('win_vbar%d' % wi, bronze, cx - bw / 2, cx + bw / 2, 1.37, 1.45, zb, zt - .01, grp, bev=.006)
        for fz in [zb + (zs - zb) * q for q in (.22, .43, .64, .83)] + [zs]:                              # поперечины высокого окна + линия пят арки
            S.box('win_hbar%d_%.2f' % (wi, fz), bronze, cx - r_in, cx + r_in, 1.375, 1.445, fz - bw / 2, fz + bw / 2, grp, bev=.006)
        for ang in (30, 60, 120, 150):                                                                      # веерные лучи верхней части
            a = math.radians(ang); L = r_in * .98; bx = cx + L * math.cos(a) / 2; bz = zs + L * math.sin(a) / 2
            ob = S.box('win_ray%d_%d' % (wi, ang), bronze, -L / 2, L / 2, 1.376, 1.444, -bw / 2, bw / 2, grp, bev=.005); ob.location = (bx, 0, bz); ob.rotation_euler = (0, -a, 0)
        gl = S.arch_solid('win_glass%d' % wi, glass, cx, r_in, zs, 1.405, 1.411, grp, z0=zb)
    print('  [view] окна и картина собраны', flush=True)
