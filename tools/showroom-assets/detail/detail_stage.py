"""Сцены страниц «Товар» и «Бренд» (страницы v2): готовые кадры-подложки без упаковок — упаковки (спрайты assets/showroom/pack-*.webp) и логотипы ставит вёрстка.

  product — макро-кадр «экспонат»: травертиновый подиум с видимой верхней гранью на полу из плитки, за ним (глубина, мягкое размытие, как у длиннофокусной оптики) стена с арочной нишей и тёплой
            подсветкой по контуру; свет — солнце сквозь оконный переплёт (мягкие диагональные «окна света»), как на стене брендов и в каталоге. Справа — свободная стена под «табличку» (вёрстка).
            Масштаб: 1 ед. сцены = 10 см (упаковка 22 см = 2,2 ед.), кадр 8,0 × 4,22 ед. (2880 × 1520 px: 360 px на ед., упаковка 22 см ≈ 790 px — запас резкости для 2× экранов).
  brand   — широкий кадр с большой резкой арочной нишей слева (как ниши стены брендов, крупнее): внутри три подставки (диск и два бруска) под упаковки бренда и место под логотип в своде арки;
            справа свободная стена. Кадр 12,6 × 6,65 ед. (2880 × 1520: 228 px на ед., упаковка 22 см ≈ 500 px).

  python3 tools/showroom-assets/detail/detail_stage.py product preview     # быстрый кадр /tmp/detail_product.png (DS_W — ширина, DS_SPP — сэмплы)
  python3 tools/showroom-assets/detail/detail_stage.py brand preview
  python3 tools/showroom-assets/detail/detail_stage.py product             # итоговый: assets/detail/stage-product.webp (2880), -s (1440), stage.json (места упаковок и подиума в долях кадра)
  python3 tools/showroom-assets/detail/detail_stage.py brand
Переменные: DS_W, DS_SPP, DS_THREADS (потоков, по умолчанию 2), FSTOP (размытие фона, меньше — сильнее), SUN, FILL, LED, EXPO, WALLC (R,G,B), BW_SAT/BW_GAMMA/BW_LIFT/BW_WARM (как у стены брендов)."""
import bpy, math, os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..'))
import scene as S
import materials as MT
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

OUT = os.path.join(HERE, '..', '..', '..', 'assets', 'detail')
PW, PH = 2880, 1520
G = 'detail'
ENVF = lambda k, d: float(os.environ.get(k, d))


# ---------------------------------------------------------------- общие части
def mats():
    wallc = S.E3('WALLC', (.97, .89, .75)); M = {}
    M['wall'] = MT.lime_plaster('wall_plaster', wallc, wave=ENVF('WAVE', 1.1), scale=ENVF('WALL_SC', 1.6), tone=.8)
    M['inner'] = MT.lime_plaster('niche_plaster', (wallc[0] * .97, wallc[1] * .94, wallc[2] * .86), wave=.6, scale=ENVF('WALL_SC', 1.6), tone=.6)
    M['frame'] = MT.limestone('niche_rim', (.97, .93, .84), scale=ENVF('STONE_SC', 1.2))
    M['base'] = MT.travertine('trav_base', (.88, .80, .66), ENVF('TRAV_SC', 1.2), 1.0, 1.3, honed=True)
    M['block'] = MT.travertine('trav_block', (.92, .85, .72), ENVF('TRAV_SC', 1.2) * 1.3, .8, 1.0, honed=True)
    M['floor'] = MT.limestone_floor('floor_tiles', (.97, .93, .84), tile=ENVF('TILE', 6.0))
    M['led'] = S.mat_led('led', ENVF('LED', 14.0), (1.0, .80, .52))
    return M


def sun_and_fill(center, spread, fill_at, fill_energy):
    """солнце слева-спереди через невидимый переплёт (даёт диагональные окна света) + широкая заполняющая подсветка"""
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = ENVF('SUN', 6.0 if os.environ.get('DS_WHICH') == 'product' else 5.0); sun.angle = math.radians(ENVF('SUN_ANGLE', 1.6)); sun.color = S.E3('SUNC', (1.0, .93, .82))
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    direction = Vector((.58, .66, -.48)).normalized(); so.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); so.location = (-30, -30, 30)
    mat = S.mat_simple('frame', (.1, .1, .1)); c0 = Vector(center) - direction * 26.0
    ex = direction.cross(Vector((0, 0, 1))).normalized(); ey = ex.cross(direction).normalized()
    def bar(u0, v0, u1, v1):
        bpy.ops.mesh.primitive_cube_add(size=1); b = bpy.context.object
        b.scale = (abs(u1 - u0), 0.15, abs(v1 - v0)); b.location = c0 + ex * ((u0 + u1) / 2) + ey * ((v0 + v1) / 2); b.rotation_euler = Matrix((ex, direction, ey)).transposed().to_euler()
        b.data.materials.append(mat); b.visible_camera = False; b['grp'] = 'gobo'
    u0_, u1_, v0_, v1_ = -spread, spread, -spread * .7, spread * .7
    for k in range(5): u = u0_ + (u1_ - u0_) * k / 4; bar(u - .22 * spread / 10, v0_, u + .22 * spread / 10, v1_)
    for k in range(4): v = v0_ + (v1_ - v0_) * k / 3; bar(u0_, v - .22 * spread / 10, u1_, v + .22 * spread / 10)
    ar = bpy.data.lights.new('fill', 'AREA'); ar.energy = fill_energy; ar.size = 40; ar.size_y = 16; ar.color = S.E3('FILLC', (1.0, .93, .82))
    ao = bpy.data.objects.new('fill', ar); bpy.context.collection.objects.link(ao); ao.location = fill_at; ao.rotation_euler = (math.radians(80), 0, 0); ao.visible_camera = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*S.E3('WORLDC', (.96, .88, .78)), 1); bg.inputs['Strength'].default_value = ENVF('WORLD', .6); bpy.context.scene.world = w


def niche_lights(cx, wd, top, y_wall, zfloor):
    a = bpy.data.lights.new('nl', 'AREA'); a.energy = ENVF('NICHE_L', 190) * (wd / 3.0); a.size = wd * .75; a.size_y = 1.0; a.color = (1.0, .84, .62)
    o = bpy.data.objects.new('nl', a); bpy.context.collection.objects.link(o); o.location = (cx, y_wall + .12, top - 1.1); o.rotation_euler = (math.radians(90 - 28), 0, 0); o.visible_camera = False
    a2 = bpy.data.lights.new('nf', 'AREA'); a2.energy = ENVF('NICHE_F', 110) * (wd / 3.0); a2.size = wd * .8; a2.size_y = wd * .5; a2.color = (1.0, .90, .76)
    o2 = bpy.data.objects.new('nf', a2); bpy.context.collection.objects.link(o2); o2.location = (cx, y_wall - 2.6, zfloor + 3.6); o2.rotation_euler = (math.radians(90 - 8), 0, 0); o2.visible_camera = False


def wall_with_niche(M, cx, rx, top, y0, thick, depth, z0):
    wall = S.box('wall', M['wall'], -60, 60, y0, y0 + thick, z0, 24, G, bev=0.0)
    zs = top - rx
    cut = S.arch_solid('cut', M['wall'], cx, rx, zs, y0 - .3, y0 - .3 + depth, G, z0=z0 - .01); cut.hide_render = True; cut.display_type = 'WIRE'
    bm = wall.modifiers.new('cut', 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.object = cut; bm.solver = 'EXACT'
    bv = wall.modifiers.new('bev', 'BEVEL'); bv.width = .035; bv.segments = 3; bv.limit_method = 'ANGLE'
    fr = S.arch_frame('rim', M['frame'], cx, rx, zs, .20, y0 - .10, y0 + .03 - .0, G, z0=z0); fb = fr.modifiers.new('bev', 'BEVEL'); fb.width = .02; fb.segments = 3; fb.limit_method = 'ANGLE'
    S.arch_frame('led', M['led'], cx, rx - .015, zs - .015, .028, y0 + .05 - .0, y0 + .13, G, z0=z0)
    return zs


def camera(sc, loc, lens, pitch, dof_dist=None, fstop=None):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_width = 36; cd.sensor_fit = 'HORIZONTAL'; cd.clip_end = 5000.0
    if dof_dist:
        cd.dof.use_dof = True; cd.dof.focus_distance = dof_dist; cd.dof.aperture_fstop = fstop
    cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); cam.location = loc; cam.rotation_euler = (math.radians(90 - pitch), 0, 0); sc.camera = cam
    bpy.context.view_layer.update(); return cam


def proj(sc, cam, co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (round(v.x, 5), round(1 - v.y, 5))


def export(im, name):
    """цветокоррекция как у стены брендов (одна гамма на сайте): насыщеннее и теплее сырого рендера; затем регрейд под цвет сцен сайта (tools/showroom-assets/regrade_site.py --stats)"""
    from PIL import Image
    import numpy as np
    g = S.grade(np.asarray(im), sat=ENVF('BW_SAT', 1.38), gamma=ENVF('BW_GAMMA', .85), lift=ENVF('BW_LIFT', .05))
    g = np.clip(g * np.array([float(x) for x in os.environ.get('BW_WARM', '1.0,.99,.955').split(',')], np.float32), 0, 255)
    im2 = Image.fromarray(g.astype(np.uint8)); os.makedirs(OUT, exist_ok=True)
    im2.save(os.path.join(OUT, 'stage-%s.webp' % name), quality=90, method=6)
    im2.resize((1440, round(1440 * PH / PW)), Image.LANCZOS).save(os.path.join(OUT, 'stage-%s-s.webp' % name), quality=88, method=6)


# ---------------------------------------------------------------- товар
P_WU = 8.0; P_HU = P_WU * PH / PW; P_PITCH = ENVF('PITCH', 6.5); P_XS = ENVF('XS', -1.25); P_TOP = .95; P_DIST = 64.0


def build_product(sc):
    M = mats()
    S.box('floor', M['floor'], -60, 60, -12, 40, -1.0, 0.0, G, bev=0.0)
    wy = ENVF('WALLY', 8.0)
    wall_with_niche(M, P_XS, ENVF('NRX', 2.0), ENVF('NTOP', 4.3), wy, 2.0, 1.55, 0.0)
    S.cylinder('pl_base', M['block'], P_XS, 0, 1.95, 0.0, .20, G, seg=160, bev=.03)
    S.cylinder('pl_main', M['block'], P_XS, 0, 1.55, .20, P_TOP, G, seg=160, bev=.035)
    niche_lights(P_XS, 2 * ENVF('NRX', 2.0), ENVF('NTOP', 4.3), wy, 0.0)
    sun_and_fill((0, wy, 3.0), 9.0, (-1.0, -40.0, 8.0), ENVF('FILL', 6500))
    zc = P_HU / 2 + .0
    cz = zc + P_DIST * math.tan(math.radians(P_PITCH))
    cam = camera(sc, (0.0, -P_DIST, cz), 18.0 * 64.0 / (P_WU / 2), P_PITCH, dof_dist=P_DIST / math.cos(math.radians(P_PITCH)), fstop=ENVF('FSTOP', .6))
    return cam


def layout_product(sc, cam):
    x, y = proj(sc, cam, (P_XS, 0.0, P_TOP)); x1, _ = proj(sc, cam, (P_XS + 1.55, 0.0, P_TOP)); _, yf = proj(sc, cam, (P_XS, 1.55, P_TOP)); _, yn = proj(sc, cam, (P_XS, -1.55, P_TOP))
    _, y2 = proj(sc, cam, (P_XS, 0.0, P_TOP + 1.0))
    return {'plate': {'w': PW, 'h': PH}, 'unit_cm': 10, 'px_per_cm': round(PW / (P_WU * 10), 3), 'plinth': {'x': x, 'y': y, 'rx': round(x1 - x, 5), 'ry': round((yn - yf) / 2, 5)}, 'px_per_unit': round((y - y2) * PH, 2)}


# ---------------------------------------------------------------- бренд
B_WU = 12.6; B_HU = B_WU * PH / PW; B_BASE = .6; B_CX = ENVF('BCX', -3.15); B_RX = ENVF('BRX', 2.3); B_TOP = ENVF('BTOP', 5.9)
B_PLINTHS = [('disc', 0.0, .85, 1.7, 1.7, .55), ('box', -1.95, .80, 2.0, 1.3, .30), ('box', 1.85, .80, 1.7, 1.2, .20)]
B_SLOTS = [(0.0, .85, .55), (-1.95, .80, .30), (1.85, .80, .20), (-.85, .35, 0), (.95, .30, 0)]


def build_brand(sc):
    M = mats()
    S.box('base', M['base'], -60, 60, -3.2, 2.0, 0.0, B_BASE, G, bev=.03)
    S.box('base_step', M['base'], -60, 60, -4.5, -3.2, 0.0, .25, G, bev=.03)
    wall_with_niche(M, B_CX, B_RX, B_TOP, 0.0, 2.0, 1.55, B_BASE)
    for k, (kind, dx, dy, sx, sy, h) in enumerate(B_PLINTHS):
        if kind == 'disc': S.cylinder('pl%d' % k, M['block'], B_CX + dx, dy, sx / 2, B_BASE, B_BASE + h, G, seg=96, bev=.025)
        else: S.box('pl%d' % k, M['block'], B_CX + dx - sx / 2, B_CX + dx + sx / 2, dy - sy / 2, dy + sy / 2, B_BASE, B_BASE + h, G, bev=.03)
    niche_lights(B_CX, 2 * B_RX, B_TOP, 0.0, B_BASE)
    sun_and_fill((-2.0, 0.0, 4.0), 11.0, (-2.0, -40.0, 8.0), ENVF('FILL', 12000))
    return camera(sc, (0.0, -64.0, B_HU / 2), 18.0 * 64.0 / (B_WU / 2), 0.0)


def layout_brand(sc, cam):
    out = {'plate': {'w': PW, 'h': PH}, 'unit_cm': 10, 'px_per_cm': round(PW / (B_WU * 10), 3), 'base_z': B_BASE, 'slots': []}
    for dx, dy, hp in B_SLOTS:
        px, py = proj(sc, cam, (B_CX + dx, dy, B_BASE + hp)); _, py2 = proj(sc, cam, (B_CX + dx, dy, B_BASE + hp + 1.0)); out['slots'].append({'x': px, 'y': py, 'pxcm': round((py - py2) * PH / 10.0, 3), 'dy': dy, 'hp': hp})
    xc, ytop = proj(sc, cam, (B_CX, 0.0, B_TOP)); x0, _ = proj(sc, cam, (B_CX - B_RX, 0.0, B_TOP)); x1, _ = proj(sc, cam, (B_CX + B_RX, 0.0, B_TOP)); _, ybot = proj(sc, cam, (B_CX, 0.0, B_BASE))
    out['niche'] = {'cx': xc, 'x0': round(x0, 5), 'x1': round(x1, 5), 'top': ytop, 'bottom': ybot}
    return out


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'product'; os.environ['DS_WHICH'] = which; mode = sys.argv[2] if len(sys.argv) > 2 else 'all'
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    pw = int(os.environ.get('DS_W', 1280 if mode == 'preview' else PW)); spp = int(os.environ.get('DS_SPP', 20 if mode == 'preview' else 72))
    S.settings(sc, pw, round(pw * PH / PW), spp)
    sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ.get('DS_THREADS', 2))
    sc.view_settings.exposure = ENVF('EXPO', -1.0 if which == 'product' else -0.85)
    cam = (build_product if which == 'product' else build_brand)(sc)
    sc.render.film_transparent = False
    print('сцена собрана:', which, 'объектов', len(bpy.data.objects), flush=True)
    if mode == 'preview':
        sc.render.filepath = '/tmp/detail_%s.png' % which; bpy.ops.render.render(write_still=True); print('preview done'); return
    sc.render.filepath = '/tmp/detail_%s_full.png' % which; bpy.ops.render.render(write_still=True)
    lay = (layout_product if which == 'product' else layout_brand)(sc, cam)
    os.makedirs(OUT, exist_ok=True); jp = os.path.join(OUT, 'stage.json')
    d = json.load(open(jp)) if os.path.exists(jp) else {}; d[which] = lay; json.dump(d, open(jp, 'w'), ensure_ascii=False, indent=1)
    from PIL import Image
    export(Image.open('/tmp/detail_%s_full.png' % which).convert('RGB'), which); print('готово →', OUT, flush=True)


if __name__ == '__main__':
    main()
