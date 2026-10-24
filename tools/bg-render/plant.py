"""Растение для фона каталога — настоящие ветки с листьями (как растение в 3D-сцене витрины), без тени, на прозрачном фоне.
Лист — складка вдоль жилки с градиентом цвета от основания к кончику и светлой центральной жилкой; свет мягкий, листья затеняют друг друга, дальние слегка размыты.
Blender/Cycles (CPU) + Pillow. Выход: plant-a.webp (с прозрачностью; для краёв блоков и большого каталога, кладётся обычным наложением, без blend-режимов).
Запуск: python3.11 plant.py -- res=1600x1100 samples=96 out=/tmp/bg/plant.png [seed=5]    (быстро для просмотра: res=800x550 samples=32)"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import bpy
from mathutils import Vector, Matrix
import common as C

o, W, H, SAMPLES, SEED = C.argv()
rnd = random.Random(SEED)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'bg')
RAW = o['out']

def leaf_mesh(L=.17, Wd=.05, n=12):
    """Лист с центральной жилкой: три вершины в ряду (край, жилка, край), края опущены — получается складка."""
    verts, faces = [], []
    for i in range(n + 1):
        t = i / n; w = Wd * math.sin(math.pi * (t ** .75)) * (1 - .12 * t); y = L * t; z = .02 * math.sin(math.pi * t) - .018 * (t ** 2) + .006
        verts += [(-w, y, z - .5 * w), (0, y, z), (w, y, z - .5 * w)]
    for i in range(n):
        a = 3 * i
        faces += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
    me = bpy.data.meshes.new('leaf'); me.from_pydata(verts, [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    return me

def leaf_material(name, dark, light, vein):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = .42
    for k, v in (('Transmission Weight', .22), ('Subsurface Weight', .12), ('Specular IOR Level', .35)):
        if k in b.inputs: b.inputs[k].default_value = v
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); Lk.new(sep.outputs['Y'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (*dark, 1); ramp.color_ramp.elements[1].color = (*light, 1)
    sub = N.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = .5; Lk.new(sep.outputs['X'], sub.inputs[0])
    ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; Lk.new(sub.outputs[0], ab.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0; mr.inputs['From Max'].default_value = .07; mr.inputs['To Min'].default_value = .75; mr.inputs['To Max'].default_value = 0; mr.clamp = True
    Lk.new(ab.outputs[0], mr.inputs['Value'])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; Lk.new(mr.outputs['Result'], mix.inputs[0]); Lk.new(ramp.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (*vein, 1)
    Lk.new(mix.outputs[2], b.inputs['Base Color'])
    return m

def build():
    C.reset()
    sc = C.render_setup(W, H, SAMPLES, RAW, bounces=6)
    sc.render.film_transparent = True
    sc.render.image_settings.color_depth = '8'; sc.render.image_settings.color_mode = 'RGBA'
    C.world((.92, .90, .86), 1.0)
    C.camera((0, -9, 0), (0, 0, 0), lens=85, fstop=1.8, focus=(0, 0, 0))
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.6; sun.angle = math.radians(8.0); sun.color = (1.0, .95, .86)
    so = bpy.data.objects.new('sun', sun); bpy.context.collection.objects.link(so)
    so.rotation_euler = Vector((.5, .62, -.5)).normalized().to_track_quat('-Z', 'Y').to_euler()
    mats = [leaf_material('l1', (.10, .17, .07), (.40, .50, .27), (.62, .70, .46)), leaf_material('l2', (.16, .22, .10), (.50, .58, .34), (.72, .78, .54)),
            leaf_material('l3', (.20, .25, .11), (.56, .60, .36), (.76, .78, .56))]
    stem_m = C.principled('stem', (.30, .24, .15), .6)
    meshes = []
    for i, mt in enumerate(mats):
        me = leaf_mesh(); me.materials.append(mt); meshes.append(me)
    def branch(base, pts, n, sc_):
        P = [Vector(base) + Vector(p) for p in pts]
        cu = bpy.data.curves.new('st', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(P) - 1)
        for i, p in enumerate(P): sp.points[i].co = (*p, 1)
        cu.bevel_depth = .0065 * sc_; cu.bevel_resolution = 2; cu.materials.append(stem_m)
        bpy.context.collection.objects.link(bpy.data.objects.new('stem', cu))
        def at(t):
            f = t * (len(P) - 1); i = min(int(f), len(P) - 2); u = f - i; return P[i].lerp(P[i + 1], u)
        def leaf(pos, dirv, scale):
            Y = dirv.normalized(); Nn = Vector((rnd.uniform(-.35, .35), -1, rnd.uniform(-.1, .35))); Z = (Nn - Y * Nn.dot(Y)).normalized(); X = Y.cross(Z)
            R = Matrix(((X.x, Y.x, Z.x), (X.y, Y.y, Z.y), (X.z, Y.z, Z.z))) @ Matrix.Rotation(rnd.uniform(-.45, .45), 3, 'Y')
            ob = bpy.data.objects.new('lf', rnd.choice(meshes)); bpy.context.collection.objects.link(ob); ob.rotation_euler = R.to_euler(); ob.location = pos; ob.scale = (scale,) * 3
        for i in range(1, n + 1):
            t = i / (n + 1) * .95 + .05; pos = at(t); dd = (at(min(1, t + .03)) - pos).normalized(); perp = Vector((-dd.z, 0, dd.x)).normalized()
            for side in (-1, 1):
                dirv = dd * (.35 + rnd.random() * .25) + perp * side + Vector((0, rnd.uniform(-.25, .25), 0))
                leaf(pos + dd * rnd.uniform(-.02, .02), dirv, sc_ * (1.0 - .38 * t) * (.8 + rnd.random() * .4))
        leaf(at(1.0), at(1.0) - at(.97), sc_ * .75)
    branch((2.3, -.1, -1.25), [(0, 0, 0), (-.6, .1, .5), (-1.55, .3, 1.0), (-2.9, .5, 1.45)], 15, 2.3)
    branch((2.4, -.3, -.3), [(0, 0, 0), (-.4, .0, .75), (-.95, .25, 1.5), (-1.5, .45, 2.2)], 13, 2.1)
    branch((2.2, .2, -1.7), [(0, 0, 0), (-.9, .1, -.05), (-1.95, .3, .3), (-3.1, .5, .25)], 13, 1.9)
    return sc

def render(path):
    bpy.context.scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    return np.asarray(Image.open(path).convert('RGBA'), float) / 255

if __name__ == '__main__':
    os.makedirs(os.path.dirname(os.path.abspath(RAW)) or '.', exist_ok=True)
    build(); A = render(RAW)
    ap = A[..., 3]; cp = A[..., :3] * 255
    g = cp.mean(-1, keepdims=True); cp = g + (cp - g) * .82                      # чуть приглушить: листья в палитре витрины (тёплая дымка)
    cp = cp * .94 + np.array([222, 210, 190]) * .06
    rgba = np.dstack([np.clip(cp, 0, 255), np.clip(ap * 255, 0, 255)]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA'); os.makedirs(OUT, exist_ok=True)
    im.resize((1200, 825), Image.LANCZOS).save(os.path.join(OUT, 'plant-a.webp'), quality=84, method=6, alpha_quality=70)
    bg = Image.new('RGB', im.size, (245, 242, 236)); bg.paste(im, mask=im.split()[3]); bg.save('/tmp/plant-preview.png')
    print('plant-a', os.path.getsize(os.path.join(OUT, 'plant-a.webp')) // 1024, 'КБ')
