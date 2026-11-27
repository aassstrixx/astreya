#!/usr/bin/env python3
"""Первый экран «Партнёрам»: галерея атриума (камера side, 1800×1012) с НАСТОЯЩИМИ объёмными стеллажами в арочных нишах левой стены (Blender 5 / Cycles, CPU).

Берётся сцена атриума как есть (tools/showroom-assets/atrium/atrium.py: зал, колоннада, свет, камера side — перспектива и точка схода прежние),
а в левой наружной стене вместо плоских светящихся «окон» вырезаются глубокие арочные ниши (булев EXACT, глубина 0,30 м, стена утолщена до 1,1 м):
  • ниша: рамка-обрамление из травертина (как у прежнего окна), каменное дно, мягко светящаяся задняя панель цвета тёплого молока;
  • полки: стеклянные, толщина 22 мм, латунная кромка 12 мм по фронту, тонкая тёплая полоса света под передним краем (светит вниз на упаковки);
  • упаковки: настоящие 3D-модели tools/showroom-assets/packs.py (флаконы с помпой, баночки, тубы, пипетки, коробки; 22 % — чёрные),
    масштаб k=1,3 (флакон ≈ 29 см), на полках они отбрасывают тени, отражаются в стекле и камне пола ниши.
Правая стена (в кадре её нет), потолок, колонны, пол, свет и камера не тронуты.

Запуск (из корня репозитория, python3 с модулем bpy):
  python3 tools/partners-assets/hero_scene.py preview     быстрый кадр 900×506 (HS_W, HS_SPP, HS_CROP=x0,x1,y0,y1 в долях) → HS_OUT (по умолчанию /tmp/hero_preview.png)
  python3 tools/partners-assets/hero_scene.py still       итоговый кадр 1800×1012 (HS_SPP=80) → HS_OUT (по умолчанию /tmp/hero_raw/side.png)
Дальше — tools/partners-assets/hero_post.py (цвет как у атриума «Компании» и «Обучения», WebP, кадр для телефона).
Переменные: HS_DEPTH (глубина ниши, 0,30), HS_PITCH (шаг полок, 0,40), HS_K (масштаб упаковок, 1,3), HS_BACK (яркость задней панели, 3,0), HS_LED (яркость полосы, 5,0), HS_SPREAD (шаг упаковок, 0,20)."""
import os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
ATR = os.path.abspath(os.path.join(HERE, '..', 'showroom-assets', 'atrium'))
os.environ['LKEY'] = '1.0'; os.environ.setdefault('LOOK_AT', 'AgX - Punchy'); os.environ.setdefault('AT_THREADS', '4')
sys.path.insert(0, ATR)
import bpy, bmesh
from mathutils import Matrix
import atrium as A
import packs as PK                                 # (atrium_v2 не импортируем: он подменяет build/materials/lights/cameras атриума)
AA = A.AA
E = AA.E

DEPTH = float(os.environ.get('HS_DEPTH', .30))      # глубина ниши от плоскости стены, м
PITCH = float(os.environ.get('HS_PITCH', .40))      # шаг полок по высоте, м
PK_K = float(os.environ.get('HS_K', 1.3))           # масштаб упаковок (как у стеллажей атриума v2)
FRONT = .07                                         # передний край полки отступает от плоскости стены, м
HW = 1.0                                            # полуширина ниши (как у прежнего окна)
Z0, ZT = .9, 4.0                                    # низ ниши и начало арки (верх 5,0)
FLOOR_T = .03                                       # толщина каменного дна ниши
KINDS = ['bottle', 'pump', 'tube', 'dropper', 'jar', 'box']
TALL = {'bottle': .29, 'pump': .30, 'tube': .19, 'dropper': .21, 'jar': .09, 'box': .17}   # высота при k=1,3 — для проверки зазора


_PK = {}; _TPL = {}


def put_pack(kind, Mw, noir=False, k=1.3):
    """упаковка из packs.py: шаблон строится один раз (скрыт), дальше — связанные копии с общей геометрией; Mw — положение (низ — начало координат)"""
    if 'm' not in _PK: _PK['m'] = PK.M()
    key = (kind, noir)
    if key not in _TPL:
        objs, _ = PK.build(kind, noir, _PK['m'], None); bpy.context.view_layer.update()
        for o in objs: o.hide_render = True; o.hide_viewport = True
        _TPL[key] = [(o, o.matrix_world.copy()) for o in objs]
    for o, m0 in _TPL[key]:
        c = o.copy(); bpy.context.collection.objects.link(c); c.hide_render = False; c.hide_viewport = False; c.parent = None; c.matrix_world = Mw @ Matrix.Scale(k, 4) @ m0


def mats(M):
    m = {}
    m['back'] = AA.led('hs_back', (1.0, .90, .74), float(os.environ.get('HS_BACK', 3.0)))
    m['led'] = AA.led('hs_led', (1.0, .90, .74), float(os.environ.get('HS_LED', 5.0)))
    m['glass'] = AA.glass('hs_glass', tint='#f1f6f6', rough=.02)
    return m


def chord(z):
    """ширина ниши на высоте z: прямая часть — 2·HW, выше — по дуге"""
    dz = max(0.0, z - ZT)
    return 2 * math.sqrt(max(0.0, HW * HW - dz * dz))


def outline(ymid, hw, z0, zt):
    return [(ymid - hw, z0), (ymid - hw, zt)] + A.arch_yz(ymid - hw, ymid + hw, zt, steps=24)[1:] + [(ymid + hw, z0)]


def cut_walls(M):
    """утолщённая стена + булев вырез пяти ниш, рамки-обрамления (в старых местах)"""
    xo = -A.WX; D = DEPTH
    for o in list(bpy.data.objects):
        if o.name.startswith(('niche_-1_', 'nichef_-1_', 'aisle_wall_-1')): bpy.data.objects.remove(o, do_unlink=True)
    wall = AA.box('aisle_wall_-1', M['ivory'], xo - 1.1, xo, -.9, A.LEN + 2.2, 0, A.ZN + .4, bevel=0)
    for i in range(len(A.COLS) - 1):
        ymid = (A.COLS[i] + A.COLS[i + 1]) / 2
        cut = A.prism_yz('hs_cut_%d' % i, M['ivory'], outline(ymid, HW, Z0, ZT), xo - D, xo + .3); cut.hide_render = True; cut.display_type = 'WIRE'
        bm_ = bmesh.new(); bm_.from_mesh(cut.data); bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces); bm_.to_mesh(cut.data); bm_.free()      # булеву нужен замкнутый объём с наружными нормалями
        bm = wall.modifiers.new('cut%d' % i, 'BOOLEAN'); bm.operation = 'DIFFERENCE'; bm.solver = 'EXACT'; bm.object = cut
        # рамка-обрамление: тот же контур, что у прежнего окна (на .1 шире), выступает на 14 мм
        o_ = outline(ymid, HW + .1, Z0 - .08, ZT); i_ = outline(ymid, HW, Z0, ZT)
        A.ring_yz('hs_frame_%d' % i, M['tra'], o_, i_, xo - .002, xo + .014)


def niche(i, M, N, rnd):
    xo = -A.WX; D = DEPTH; ymid = (A.COLS[i] + A.COLS[i + 1]) / 2
    # светящаяся задняя панель по контуру ниши
    A.prism_yz('hs_back_%d' % i, N['back'], outline(ymid, HW, Z0, ZT), xo - D, xo - D + .004)
    # каменное дно (травертин) вровень с передним краем стены
    AA.box('hs_floor_%d' % i, M['tra'], xo - D, xo - .004, ymid - HW, ymid + HW, Z0 - .002, Z0 + FLOOR_T, bevel=.004)
    zs = [Z0 + FLOOR_T + k * PITCH for k in range(0, 9)]             # поверхности: дно и 8 стеклянных полок
    prev = None
    for k, z in enumerate(zs):
        if k > 0:
            w = chord(z) - .006; x0 = xo - (D - .004); x1 = xo - FRONT
            AA.box('hs_sh_%d_%d' % (i, k), N['glass'], x0, x1, ymid - w / 2, ymid + w / 2, z - .022, z, bevel=0)
            AA.box('hs_lip_%d_%d' % (i, k), M['champ'], xo - FRONT - .012, xo - FRONT, ymid - w / 2, ymid + w / 2, z - .026, z + .004, bevel=.002)
            AA.box('hs_led_%d_%d' % (i, k), N['led'], x0 + .02, xo - FRONT - .02, ymid - w / 2 + .02, ymid + w / 2 - .02, z - .030, z - .023, bevel=0)
        # упаковки: ряд по ширине хорды на высоте верха самых высоких предметов, без повторов подряд
        cw = chord(z + .26) - .20; spread = float(os.environ.get('HS_SPREAD', .20)); n = int(cw / spread)
        if n < 1: continue
        last = None; xc = xo - (FRONT + (D - FRONT) * .5)
        for j in range(n):
            kind = rnd.choice([c for c in KINDS if c != last]); last = kind
            if kind == 'jar' and rnd.random() < .5: kind = 'jar'
            y = ymid + (j - (n - 1) / 2) * spread + rnd.uniform(-.012, .012)
            yaw = math.radians(90 + rnd.uniform(-14, 14))
            put_pack(kind, Matrix.Translation((xc + rnd.uniform(-.015, .015), y, z + .001)) @ Matrix.Rotation(yaw, 4, 'Z'), rnd.random() < .22, PK_K)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'preview'
    w = int(os.environ.get('HS_W', 900 if mode == 'preview' else 1800)); h = round(w * 9 / 16)
    spp = int(os.environ.get('HS_SPP', 24 if mode == 'preview' else 80))
    sc = A.setup(w, h, spp); M = A.build(); A.lights(); cams = A.cameras()
    N = mats(M); cut_walls(M); rnd = random.Random(7)
    for i in range(len(A.COLS) - 1): niche(i, M, N, rnd)
    cr = os.environ.get('HS_CROP')
    if cr and mode == 'preview':
        x0, x1, y0, y1 = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x = x0; sc.render.border_max_x = x1; sc.render.border_min_y = y0; sc.render.border_max_y = y1
    print('сцена: объектов %d, кадр %dx%d, %d сэмплов' % (len(bpy.data.objects), w, h, spp), flush=True)
    sc.camera = cams['side']
    out = os.environ.get('HS_OUT', '/tmp/hero_preview.png' if mode == 'preview' else '/tmp/hero_raw/side.png'); os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('готово', out, flush=True)


if __name__ == '__main__':
    main()
