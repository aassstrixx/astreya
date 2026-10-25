#!/usr/bin/env python3
"""Новое вступление главной: баночка «Астрея» + архитектурная ниша в одной 3D-сцене (Blender / Cycles).

Баночка — та же модель, что и в lumiere_scene.py (стекло, этикетка, крышка, крем: форма, пропорции и надписи не менялись); меняются окружение и свет:
светлая арочная ниша из известняка, подиум из травертина, тёплая LED-подсветка свода, косое окно света — те же материалы и свет, что у страницы «Бренды»
(tools/showroom-assets/materials.py, tools/brands-assets/scene.py). Единицы: сцена в метрах, баночка (модель в сантиметрах) стоит под родителем с масштабом 0,01.

Сюжет (прогресс p от 0 до 1 = прокрутка вступления):
  A  0 – 0,20   баночка на чистой светлой стене, камера медленно приближается, баночка поворачивается к зрителю, глубина резкости малая;
  B  0,20 – 0,45  камера описывает небольшую дугу, на стекле и крышке проходит блик, за баночкой проявляются тени окна и край ниши;
  C  0,45 – 0,80  камера отъезжает: раскрываются арка, подиум, LED-линия свода (свет в нише разгорается);
  D  0,80 – 1    финальная композиция — баночка на подиуме в нише справа, слева свободная стена под заголовок; кадр совпадает с первым экраном главной.

  python3 arch_story.py info
  python3 arch_story.py still <кадр> out.png [--res 1920x1080] [--samples 24] [--total 132] [--portrait]
  python3 arch_story.py anim <с> <по> outdir [--res …] [--samples …] [--total 132] [--portrait]     (готовые кадры пропускаются)
Кадры затем кодирует encode_web.py → assets/jar-arch/d, m (и лёгкие наборы). Подробности — README.md."""
import importlib.util
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'showroom-assets'))

import bpy
import numpy as np
from mathutils import Euler, Vector

import lumiere_scene as L
import materials as MT


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


BR = _load('brscene', os.path.join(HERE, '..', 'brands-assets', 'scene.py'))   # помощники ниши: булевы, ваза, ветка, свет
SC = BR.SC                                                                       # геометрия сцены каталога (box, cylinder, arch_solid, arch_frame, mat_led…)

# ---------------------------------------------------------------------------------------------------------------- параметры
NICHE = dict(rx=.13, zs=.23, depth=.11)           # м: ширина ниши 26 см, свод до 36 см, глубина 11 см
POD_H = .165                                      # высота подиума: на нём стоит баночка
JAR_Y = .045
JAR_POS = Vector((0, JAR_Y, POD_H))
TARGET0 = Vector((0, JAR_Y, POD_H + .029))        # центр баночки

# (p, az°, el°, dist м, target (x, y, z) м, focal мм, f-stop, shift_x, shift_y, yaw баночки °, свет LED 0…1)
KEYS = {
    'land': [
        (0.00, -16, 6.0, .42, (0, JAR_Y, POD_H + .030), 85, 2.6, 0.0, 0.0, -58, 0.00),
        (0.18, -17, 7.0, .33, (0, JAR_Y, POD_H + .030), 85, 2.4, 0.0, 0.0, -36, 0.00),
        (0.42, -12, 9.0, .40, (0, JAR_Y, POD_H + .033), 75, 3.2, -.02, 0.0, -15, 0.05),
        (0.62, -6, 10.0, .56, (0, JAR_Y, POD_H + .055), 60, 5.0, -.07, 0.0, -8, 0.30),
        (0.80, -2, 8.0, .72, (0, JAR_Y, .195), 50, 7.0, -.14, 0.0, -5, 0.75),
        (1.00, 0, 5.5, .80, (0, JAR_Y, .20), 46, 9.0, -.20, 0.0, -4, 1.00),
    ],
    'port': [
        (0.00, -16, 6.0, .42, (0, JAR_Y, POD_H + .030), 85, 2.6, 0.0, 0.0, -58, 0.00),
        (0.18, -17, 7.0, .33, (0, JAR_Y, POD_H + .030), 85, 2.4, 0.0, 0.0, -36, 0.00),
        (0.42, -12, 9.0, .40, (0, JAR_Y, POD_H + .033), 75, 3.2, 0.0, 0.0, -15, 0.05),
        (0.62, -6, 10.0, .54, (0, JAR_Y, POD_H + .08), 62, 5.0, 0.0, 0.0, -8, 0.30),
        (0.80, -2, 8.0, .68, (0, JAR_Y, .24), 62, 7.0, 0.0, 0.0, -5, 0.75),
        (1.00, 0, 5.0, .72, (0, JAR_Y, .28), 66, 9.0, 0.0, 0.0, -4, 1.00),
    ],
}


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def interp(keys, p):
    """кубическая интерполяция Эрмита по ключам; касательные — по соседям (плавный проезд без остановок и рывков)"""
    ps = [k[0] for k in keys]
    p = max(0.0, min(1.0, p))
    i = max(j for j in range(len(ps) - 1) if ps[j] <= p)
    a, b = keys[i], keys[i + 1]
    h = b[0] - a[0]
    s = (p - a[0]) / h

    def vec(k):
        return np.array([k[1], k[2], k[3], *k[4], k[5], k[6], k[7], k[8], k[9], k[10]], dtype=float)

    def tan(j):
        jm, jp = max(j - 1, 0), min(j + 1, len(keys) - 1)
        dt = keys[jp][0] - keys[jm][0]
        return (vec(keys[jp]) - vec(keys[jm])) / dt if dt > 0 else np.zeros(13)

    # на концах — мягкая остановка (касательная 0)
    ta, tb = tan(i) * (0 if i == 0 else 1), tan(i + 1) * (0 if i + 1 == len(keys) - 1 else 1)
    return L.hermite(vec(a), vec(b), ta * h, tb * h, s)


# ---------------------------------------------------------------------------------------------------------------- сцена
S = {}


def mat_navy_lid():
    """крышка: тот же профиль, что и в оригинале; материал — глубокий тёмно-синий лак с металлическим блеском (цвет типографики сайта); на светлой сцене хром отражал бы только стены"""
    m, nt = L.new_mat('LidNavy')
    p = L.principled(nt, Base_Color=(0.024, 0.045, 0.105, 1), Metallic=0.92, Roughness=0.09)
    p.inputs['Coat Weight'].default_value = 0.55
    p.inputs['Coat Roughness'].default_value = 0.04
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


def build_architecture(portrait):
    M = BR.mats((1.0, .99, .97), (1.02, .96, .90), 1.0)
    rx, zs, dp = NICHE['rx'], NICHE['zs'], NICHE['depth']
    wall = SC.box('wall', M['plaster'], -3.0, 3.0, 0, .15, -.1, 2.2, 'w', 0)
    cut = SC.arch_solid('cut', M['plaster'], 0, rx, zs, -.1, dp, 'w', z0=-.2)
    reb = SC.arch_solid('reb', M['plaster'], 0, rx + .016, zs, -.1, .010, 'w', z0=-.2)
    BR.boolean(wall, cut)
    BR.boolean(wall, reb)
    BR.apply_mods(wall)
    wall.data.materials.append(M['inner'])
    for pl in wall.data.polygons:
        c = pl.center
        if c.y > .02 and abs(c.x) <= rx + .002 and c.z <= zs + rx + .002:
            pl.material_index = 1
    S['led'] = SC.arch_frame('led', M['led'], 0, rx - .04, zs - .027, .006, dp - .016, dp - .005, 'w', z0=.0)
    SC.box('floor', M['floor'], -3.0, 3.0, -4.0, .15, -.3, 0, 'w', 0)
    SC.box('slab', M['trav'], -rx, rx, -.07, dp, 0, .018, 'w', .002)
    SC.box('ledge', M['trav2'], -rx - .03, rx + .03, -.075, .02, -.05, .014, 'w', .002)
    # подиум-«свадебный торт»: широкий низкий цилиндр и выше — основной; на нём стоит баночка
    SC.cylinder('pod0', M['trav'], 0, JAR_Y, .106, .018, .062, 'p', seg=128, bev=.003)
    SC.cylinder('pod1', M['trav'], 0, JAR_Y, .080, .062, POD_H, 'p', seg=128, bev=.003)
    if not portrait:                                         # слева — низкий подиум с вазой и веткой: стена не пустует, но заголовок остаётся читаемым
        SC.box('bench', M['trav2'], -.47, -.31, -.06, .06, 0, .075, 'p', .004)
        BR.vase((-.40, .0, .075), .085, .028)
        BR.olive((-.40, .0, .075 + .08), .26, 15, .55, BR.random.Random(9))
    return M


def build_jar():
    label = os.path.join(HERE, 'label.png')
    if not os.path.exists(label):
        import make_label
        make_label.main(label)
    jg = bpy.data.objects.new('JarGroup', None)
    bpy.context.scene.collection.objects.link(jg)
    jg.location = JAR_POS
    jg.scale = (.01, .01, .01)
    glass = L.build_glass(label)
    cream = L.build_cream()
    cream.parent = glass
    lid = L.build_lid()
    lid.data.materials[0] = mat_navy_lid()
    for o in (glass, lid):
        o.parent = jg
    glass.location.z = 0.003
    lid.location = L.LID_CLOSED
    S['jg'] = jg


def build_lights(portrait):
    BR.light_rig(bpy.context.scene, d=(.58, .74, -.46), energy=5.2, seed=11, size=.26, center=(0, 0, .22), fill=.9,
                 cell=.16, barw=.020, ang=1.5, U=7, V=5, dist=1.4, outer=False)
    # мягкие вертикальные полосы-отражения на стекле и крышке (камере не видны)
    import packs as PK
    PK.softbox('strip_l', (-.50, -.42, .26), .10, .42, 20, (1, .95, .88), aim=(0, .05, .2))
    PK.softbox('strip_r', (.46, .10, .22), .06, .36, 28, (1, .97, .94), feather=.4, aim=(0, .05, .2))
    PK.softbox('top', (-.05, -.18, .72), .5, .5, 5.0, (1, .97, .92), aim=(0, .05, .2))
    PK.softbox('front', (.12, -.60, .24), .55, .35, 3.2, (1, .97, .93), aim=(0, .05, .2))        # мягкий свет спереди: этикетка читается


def build_camera():
    cd = bpy.data.cameras.new('Cam')
    cd.sensor_width = 36
    cd.dof.use_dof = True
    cam = bpy.data.objects.new('Camera', cd)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    focus = bpy.data.objects.new('Focus', None)
    bpy.context.scene.collection.objects.link(focus)
    c = cam.constraints.new('TRACK_TO')
    c.target = focus
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    cd.dof.focus_object = focus
    S['cam'], S['focus'] = cam, focus


def build_scene(res, samples, portrait):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    SC.settings(sc, res[0], res[1], samples)
    cy = sc.cycles
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.max_bounces = 12
    cy.transmission_bounces = 10
    cy.glossy_bounces = 6
    cy.sample_clamp_indirect = 4.0
    sc.view_settings.exposure = float(os.environ.get('ARCH_EXP', -.12))
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.film_transparent = False
    build_architecture(portrait)
    build_jar()
    build_lights(portrait)
    build_camera()
    return sc


def apply_frame(i, total, portrait):
    p = i / max(1, total - 1)
    v = interp(KEYS['port' if portrait else 'land'], p)
    az, el, dist = math.radians(v[0]), math.radians(v[1]), float(v[2])
    tgt = Vector((float(v[3]), float(v[4]), float(v[5])))
    pos = tgt + dist * Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    cam = S['cam']
    cam.location = pos
    S['focus'].location = Vector((0, JAR_Y, POD_H + .03))                      # фокус всегда на баночке
    cam.data.lens = float(v[6])
    cam.data.dof.aperture_fstop = float(v[7])
    cam.data.shift_x = float(v[8])
    cam.data.shift_y = float(v[9])
    S['jg'].rotation_euler = Euler((0, 0, math.radians(float(v[10]))), 'XYZ')
    # LED-подсветка свода разгорается к финалу
    led = float(v[11])
    mat = S['led'].data.materials[0] if S['led'].data.materials else None
    if mat:
        for n in mat.node_tree.nodes:
            if n.type == 'EMISSION':
                n.inputs['Strength'].default_value = 3.0 + 12.0 * smooth(led)


def render_frame(i, total, out, portrait):
    apply_frame(i, total, portrait)
    sc = bpy.context.scene
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def parse(argv):
    o = dict(res=(1920, 1080), samples=24, total=132, portrait=False)
    rest = []
    k = 0
    while k < len(argv):
        a = argv[k]
        if a == '--res':
            w, h = argv[k + 1].lower().split('x')
            o['res'] = (int(w), int(h))
            k += 2
        elif a == '--samples':
            o['samples'] = int(argv[k + 1])
            k += 2
        elif a == '--total':
            o['total'] = int(argv[k + 1])
            k += 2
        elif a == '--portrait':
            o['portrait'] = True
            k += 1
        else:
            rest.append(a)
            k += 1
    return rest, o


def main():
    argv = sys.argv[1:]
    if argv and argv[0] == '--':
        argv = argv[1:]
    rest, o = parse(argv)
    cmd = rest[0] if rest else 'info'
    if cmd == 'info':
        print(__doc__)
        return
    if o['portrait'] and o['res'] == (1920, 1080):
        o['res'] = (810, 1440)
    build_scene(o['res'], o['samples'], o['portrait'])
    if cmd == 'still':
        render_frame(int(rest[1]), o['total'], os.path.abspath(rest[2]), o['portrait'])
    elif cmd == 'anim':
        a, b, outdir = int(rest[1]), int(rest[2]), rest[3]
        os.makedirs(outdir, exist_ok=True)
        for i in range(a, b + 1):
            path = os.path.join(outdir, '%03d.png' % i)
            if os.path.exists(path):
                continue
            render_frame(i, o['total'], os.path.abspath(path), o['portrait'])
            print('кадр', i, flush=True)


if __name__ == '__main__':
    main()
