#!/usr/bin/env python3
"""Запекает каменный шар для сайта (js/jar-gl.js, живой шар от курсора) в две развёртки 2048×1024: цвет (sphere-a.webp) и тангенциальные нормали (sphere-n.webp).

Материал и размер берутся из самой сцены (hall_story.py → sphere_material, sphere_place), поэтому живой шар на сайте — тот же камень, что запечён в тени и отражениях кадров зала.
В браузере шар вращается сам и за курсором, свет скользит по порам (шейдер считает освещение на лету по этим картам).

    python3 bake_sphere.py ../../assets/jar-arch
"""
import os
import sys

import bpy
from PIL import Image

import hall_story as H

W, HT = 2048, 1024


def bake(kind, path, mat, ob):
    img = bpy.data.images.new('bk_' + kind, W, HT, alpha=False, float_buffer=False)
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
    r = H.sphere_place(False)[3]                                          # радиус шара в зале (на телефоне такой же по структуре, камень «крупнее» не делаем)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=128, radius=r, location=(0, 0, 0))
    ob = bpy.context.object
    bpy.ops.object.shade_smooth()
    mat = H.sphere_material()
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
