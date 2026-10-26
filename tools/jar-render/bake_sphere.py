#!/usr/bin/env python3
"""Запекает каменный шар зала (травертин, тот же материал, что в hall_story.py) в две развёртки 2048×1024 для живого шара на сайте (js/sphere.js, WebGL):
цвет (sphere-a.webp) и нормали с порами и зерном (sphere-n.webp, тангенциальные). Шар крутится в браузере, свет двигается за курсором — по этим картам.

    python3 bake_sphere.py ../../assets/jar-arch
"""
import os
import sys

import bpy
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'showroom-assets'))
sys.path.insert(0, os.path.join(HERE, '..', 'decor'))
import stone_logo as SL  # noqa: E402

TINT = (.62, .53, .41)
R = .163


def bake(kind, path, mat, ob, W=2048, H=1024):
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
    sc.cycles.samples = 24
    bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=128, radius=R, location=(0, 0, 0))
    ob = bpy.context.object
    bpy.ops.object.shade_smooth()
    mat = SL.sphere_stone('hall_sphere', TINT, 1.1)
    ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    for kind, name in (('a', 'sphere-a'), ('n', 'sphere-n')):
        png = '/tmp/%s.png' % name
        bake(kind, png, mat, ob)
        im = Image.open(png).convert('RGB')
        im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=90, method=6)
        print(name, im.size, os.path.getsize(os.path.join(out, name + '.webp')) // 1024, 'КБ', flush=True)


if __name__ == '__main__':
    main()
