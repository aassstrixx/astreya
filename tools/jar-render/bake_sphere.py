#!/usr/bin/env python3
"""Запекает каменный шар для сайта (js/sphere.js, WebGL) в две развёртки 2048×1024: цвет (sphere-a.webp) и тангенциальные нормали (sphere-n.webp).
Шар крутится в браузере, свет двигается за курсором — по этим картам. Материал — травертин «по-настоящему», а не пятнистая заливка:
  • слоистость: тонкие неровные полосы тона вдоль экватора (волнистые, с искажением), поверх — крупные «облака» тёплых и холодных оттенков;
  • поры: вытянутые вдоль слоёв раковины трёх размеров (редкие крупные, средние, мелкие) — внутри темнее и с глубиной в карте нормалей; мелкая «булавочная» россыпь;
  • зерно: мелкий шум в цвете и в рельефе (шлифованный камень не бывает идеально гладким).
Всё считается трёхмерными шумами по координатам объекта — шва на развёртке нет.

    python3 bake_sphere.py ../../assets/jar-arch
"""
import os
import sys

import bpy
from PIL import Image

R = .163                                                                 # радиус шара в зале, м
W, H = 2048, 1024


def lin(c):                                                              # sRGB 0–255 → линейный цвет Blender
    f = lambda v: ((v / 255 + .055) / 1.055) ** 2.4 if v / 255 > .04045 else v / 255 / 12.92
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def stone_material():
    m = bpy.data.materials.new('sphere_travertine')
    m.use_nodes = True
    nt = m.node_tree
    nd, L = nt.nodes, nt.links
    nd.clear()
    out = nd.new('ShaderNodeOutputMaterial')
    b = nd.new('ShaderNodeBsdfPrincipled')
    L.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Roughness'].default_value = .62

    def new(kind, **kw):
        n = nd.new(kind)
        for k, v in kw.items():
            setattr(n, k, v)
        return n

    def inp(n, name, v):
        n.inputs[name].default_value = v

    def src(x):                                                           # узел или (узел, имя выхода) → гнездо-источник
        return x[0].outputs[x[1]] if isinstance(x, tuple) else x.outputs[0]

    def link(x, n, i=0):
        L.new(src(x), n.inputs[i])

    def math(op, a, b_=None, clamp=False):
        n = new('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b_)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                link(v, n, i)
        return n

    def ramp(fac, stops):
        r = new('ShaderNodeValToRGB')
        el = r.color_ramp.elements
        el[0].position, el[0].color = stops[0]
        el[1].position, el[1].color = stops[-1]
        for p, c in stops[1:-1]:
            el.new(p).color = c
        link(fac, r, 'Fac')
        return r

    G, W1 = (0, 0, 0, 1), (1, 1, 1, 1)
    tc = new('ShaderNodeTexCoord')
    mp = new('ShaderNodeMapping')                                         # координаты объекта → единичная сфера
    inp(mp, 'Scale', (1 / R, 1 / R, 1 / R))
    link((tc, 'Object'), mp, 'Vector')
    stretch = new('ShaderNodeMapping')                                    # поры вытянуты вдоль слоёв: по вертикали частота выше, значит, раковины шире, чем высокие
    inp(stretch, 'Scale', (1.0, 1.0, 2.8))
    link(mp, stretch, 'Vector')

    # --- слоистость и облака тона ---
    wave = new('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z', wave_profile='SIN')
    inp(wave, 'Scale', 2.2); inp(wave, 'Distortion', 6.0); inp(wave, 'Detail', 4.0); inp(wave, 'Detail Scale', 2.6); inp(wave, 'Detail Roughness', .66)
    tilt = new('ShaderNodeMapping')                                       # слои идут не строго по экватору, как полосы на планете, а чуть наклонно
    inp(tilt, 'Rotation', (0.55, 0.25, 0.0))
    link(mp, tilt, 'Vector')
    link(tilt, wave, 'Vector')
    strata = ramp((wave, 'Fac'), [(.25, G), (.75, W1)])
    cloud = new('ShaderNodeTexNoise', noise_dimensions='3D')
    inp(cloud, 'Scale', 1.9); inp(cloud, 'Detail', 5.0); inp(cloud, 'Roughness', .55); inp(cloud, 'Distortion', .5)
    link(mp, cloud, 'Vector')
    cloud2 = new('ShaderNodeTexNoise', noise_dimensions='3D')
    inp(cloud2, 'Scale', 7.0); inp(cloud2, 'Detail', 4.0); inp(cloud2, 'Roughness', .6)
    link(mp, cloud2, 'Vector')

    # --- поры: крупные редкие, средние, мелкие + булавочная россыпь ---
    def pores(scale, keep, radius, soft):
        dens = ramp((cloud2, 'Fac'), [(.36, G), (.60, W1)])                # поры собираются гнёздами, а не ровной россыпью
        v = new('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature='F1')
        inp(v, 'Scale', scale); inp(v, 'Randomness', 1.0)
        link(stretch, v, 'Vector')
        sep = new('ShaderNodeSeparateColor')
        link((v, 'Color'), sep, 'Color')                                  # случайный цвет ячейки → выбрана ли ячейка (берём малую долю)
        pick = math('GREATER_THAN', (sep, 'Red'), keep)
        d = ramp((v, 'Distance'), [(0.0, W1), (radius, W1), (radius + soft, G)])
        return math('MULTIPLY', math('MULTIPLY', pick, d), dens)

    big = pores(8.0, .93, .26, .20)
    mid = pores(26.0, .74, .26, .20)
    small = pores(80.0, .55, .30, .20)
    pins = new('ShaderNodeTexNoise', noise_dimensions='3D')
    inp(pins, 'Scale', 480.0); inp(pins, 'Detail', 1.0); inp(pins, 'Roughness', .8)
    link(mp, pins, 'Vector')
    pin = ramp((pins, 'Fac'), [(.62, G), (.70, W1)])

    # --- цвет ---
    tone = math('ADD', math('MULTIPLY', strata, .12), math('MULTIPLY', (cloud, 'Fac'), .88))
    col = ramp(tone, [(.25, lin((205, 186, 157))), (.60, lin((198, 179, 150))), (.92, lin((190, 171, 142)))])
    fine = ramp((cloud2, 'Fac'), [(.30, (.965, .965, .965, 1)), (.70, (1.03, 1.03, 1.03, 1))])
    mix1 = new('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    inp(mix1, 'Factor', 1.0)
    L.new(src(col), mix1.inputs[6]); L.new(src(fine), mix1.inputs[7])
    allp = math('ADD', math('ADD', big, math('MULTIPLY', mid, .85)), math('ADD', math('MULTIPLY', small, .6), math('MULTIPLY', pin, .30)), clamp=True)
    dark = ramp(allp, [(0.0, W1), (1.0, lin((178, 156, 128)))])           # внутри пор камень темнее и теплее
    mix2 = new('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    inp(mix2, 'Factor', 1.0)
    L.new(mix1.outputs[2], mix2.inputs[6]); L.new(src(dark), mix2.inputs[7])
    L.new(mix2.outputs[2], b.inputs['Base Color'])

    # --- рельеф: поры вдавлены, слои еле заметны, мелкое зерно ---
    grain = new('ShaderNodeTexNoise', noise_dimensions='3D')
    inp(grain, 'Scale', 650.0); inp(grain, 'Detail', 3.0); inp(grain, 'Roughness', .7)
    link(mp, grain, 'Vector')
    mid_n = new('ShaderNodeTexNoise', noise_dimensions='3D')
    inp(mid_n, 'Scale', 70.0); inp(mid_n, 'Detail', 5.0); inp(mid_n, 'Roughness', .6)
    link(mp, mid_n, 'Vector')
    h = math('SUBTRACT', math('ADD', math('MULTIPLY', (grain, 'Fac'), .05), math('ADD', math('MULTIPLY', (mid_n, 'Fac'), .08), math('MULTIPLY', strata, .035))), math('MULTIPLY', allp, .55))
    bump = new('ShaderNodeBump')
    inp(bump, 'Strength', 1.0); inp(bump, 'Distance', .0035)
    link(h, bump, 'Height')
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def bake(kind, path, mat, ob):
    img = bpy.data.images.new('bk_' + kind, W, H, alpha=False, float_buffer=False)
    if kind != 'a':
        img.colorspace_settings.name = 'Non-Color'                       # карта нормалей — не цвет: без кривой sRGB при записи
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    for n in nt.nodes:
        n.select = n.name == tex.name
    sc = bpy.context.scene
    if kind == 'a':
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=6)
    else:
        sc.render.bake.normal_space = 'TANGENT'
        bpy.ops.object.bake(type='NORMAL', margin=6)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    nt.nodes.remove(tex)


def main():
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=128, radius=R, location=(0, 0, 0))
    ob = bpy.context.object
    bpy.ops.object.shade_smooth()
    mat = stone_material()
    ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    for kind, name, q in (('a', 'sphere-a', 90), ('n', 'sphere-n', 80)):
        png = '/tmp/%s.png' % name
        bake(kind, png, mat, ob)
        im = Image.open(png).convert('RGB')
        im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=q, method=6)
        print(name, im.size, os.path.getsize(os.path.join(out, name + '.webp')) // 1024, 'КБ', flush=True)


if __name__ == '__main__':
    main()
