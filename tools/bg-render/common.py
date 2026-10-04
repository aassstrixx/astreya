"""Общее для сцен фоновых текстур сайта (Blender / Cycles, CPU): сброс сцены, настройки рендера, мир, свет, камера, материалы, сетка по карте высот.
Сцены рисуют бежево-молочные макро-текстуры (крем, нити, капли, пипетка, блики, молекулы, жемчуг и пузырьки) в палитре сайта; финальная тоновая подгонка — export.py."""
import bpy, bmesh, math, os, sys, random
import numpy as np
from mathutils import Vector, Euler

def argv():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'res': '1600x1100', 'samples': '64', 'out': 'out.png', 'seed': '7'}
    for x in a:
        if '=' in x:
            k, v = x.split('=', 1); o[k] = v
    w, h = [int(v) for v in o['res'].split('x')]
    return o, w, h, int(o['samples']), int(o['seed'])

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def render_setup(w, h, samples, out, exposure=0.0, bounces=12):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'; cy.samples = samples; cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.max_bounces = bounces; cy.glossy_bounces = 6; cy.transmission_bounces = bounces; cy.transparent_max_bounces = bounces; cy.diffuse_bounces = 3      # у тонких стеклянных стержней свет долго ходит внутри (полное отражение): мало отскоков = чёрные полосы
    cy.caustics_reflective = True; cy.caustics_refractive = True
    cy.sample_clamp_indirect = 8.0
    cy.filter_width = 1.5
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'
    sc.render.filepath = out
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = exposure
    sc.render.threads_mode = 'AUTO'
    return sc

def world(color=(0.80, 0.76, 0.70), strength=1.0, top=None):
    sc = bpy.context.scene
    wd = bpy.data.worlds.new('w'); sc.world = wd; wd.use_nodes = True
    nt = wd.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (*color, 1); bg.inputs['Strength'].default_value = strength
    if top is not None:                                         # мягкий вертикальный градиент: светлее сверху
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
        nt.links.new(tc.outputs['Generated'], sep.inputs['Vector']); nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
        ramp.color_ramp.elements[0].color = (*color, 1); ramp.color_ramp.elements[1].color = (*top, 1)
        nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

def area_light(loc, target, size, power, color=(1, 0.96, 0.9), shape='RECTANGLE', size_y=None):
    ld = bpy.data.lights.new('a', 'AREA'); ld.energy = power; ld.color = color; ld.shape = shape; ld.size = size
    if shape == 'RECTANGLE': ld.size_y = size_y or size
    ob = bpy.data.objects.new('a', ld); bpy.context.collection.objects.link(ob); ob.location = loc
    d = Vector(target) - Vector(loc); ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return ob

def camera(loc, target, lens=85, fstop=None, focus=None, sensor=36, ortho=None):
    cd = bpy.data.cameras.new('c'); cd.lens = lens; cd.sensor_width = sensor
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    ob = bpy.data.objects.new('c', cd); bpy.context.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = ob
    if fstop:
        cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
        if focus is not None:
            if isinstance(focus, (tuple, list)): cd.dof.focus_distance = (Vector(focus) - Vector(loc)).length
            else: cd.dof.focus_distance = focus
    return ob

def principled(name, base=(0.9, 0.88, 0.84), rough=0.3, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough
    for k, v in kw.items():
        if k in b.inputs:
            b.inputs[k].default_value = (*v, 1) if isinstance(v, tuple) and len(v) == 3 and 'Color' in k else v
    return m

def glass(name, tint=(1, 1, 1), ior=1.45, rough=0.0, shadow=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); g = nt.nodes.new('ShaderNodeBsdfGlass')
    g.inputs['Color'].default_value = (*tint, 1); g.inputs['IOR'].default_value = ior; g.inputs['Roughness'].default_value = rough
    # стекло не отбрасывает чёрную тень: для теневых лучей — почти прозрачно (приближение каустик)
    lp = nt.nodes.new('ShaderNodeLightPath'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (*([shadow * c for c in tint] if shadow is not None else [0.5 + 0.5 * c for c in tint]), 1)
    mix = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(lp.outputs['Is Shadow Ray'], mix.inputs['Fac']); nt.links.new(g.outputs['BSDF'], mix.inputs[1]); nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m

def sphere(loc, r, mat, scale=(1, 1, 1), seg=96, rings=48):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=rings)
    ob = bpy.context.active_object; ob.scale = scale; bpy.ops.object.shade_smooth(); ob.data.materials.append(mat); return ob

def grid_mesh(name, H, size_x, size_y, mat, z0=0.0):
    """Сетка по карте высот H[ny, nx] (метры) размером size_x × size_y."""
    ny, nx = H.shape
    xs = np.linspace(-size_x / 2, size_x / 2, nx); ys = np.linspace(-size_y / 2, size_y / 2, ny)
    X, Y = np.meshgrid(xs, ys)
    co = np.stack([X.ravel(), Y.ravel(), (H + z0).ravel()], 1).astype(np.float32)
    idx = np.arange(nx * ny).reshape(ny, nx)
    quads = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], 1)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co)); me.vertices.foreach_set('co', co.ravel())
    me.loops.add(len(quads) * 4); me.loops.foreach_set('vertex_index', quads.ravel().astype(np.int32))
    me.polygons.add(len(quads)); me.polygons.foreach_set('loop_start', (np.arange(len(quads)) * 4).astype(np.int32))
    me.polygons.foreach_set('use_smooth', np.ones(len(quads), dtype=bool))
    me.update(calc_edges=True); me.validate()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(mat)
    return ob

def smooth_noise(ny, nx, scale, rng, octaves=4, persistence=0.5):
    """Плавный шум (сумма сглаженных случайных полей) без внешних библиотек."""
    from numpy.fft import rfft2, irfft2, rfftfreq, fftfreq
    out = np.zeros((ny, nx)); amp = 1.0; tot = 0
    for o in range(octaves):
        f = rng.standard_normal((ny, nx))
        fy = fftfreq(ny)[:, None]; fx = rfftfreq(nx)[None, :]
        k = np.sqrt(fx ** 2 + fy ** 2) * max(nx, ny) / max(scale / (2 ** o), 1e-3)
        flt = np.exp(-(k ** 2))
        g = irfft2(rfft2(f) * flt, s=(ny, nx)); g /= (g.std() + 1e-9)
        out += amp * g; tot += amp; amp *= persistence
    return out / tot

def gauss_blur(a, sigma):
    from numpy.fft import rfft2, irfft2, rfftfreq, fftfreq
    ny, nx = a.shape; fy = fftfreq(ny)[:, None]; fx = rfftfreq(nx)[None, :]
    return irfft2(rfft2(a) * np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2)), s=(ny, nx))

def save_and_render():
    bpy.ops.render.render(write_still=True)

def arc_points(c, r, a0, a1, z=0.0, n=120, tilt=0.0):
    """Точки дуги окружности (в плоскости XY, при tilt≠0 наклонённой вокруг оси X) — для нитей."""
    t = np.linspace(a0, a1, n); pts = []
    for a in t:
        x, y = r * math.cos(a), r * math.sin(a)
        pts.append((c[0] + x, c[1] + y * math.cos(tilt), z + c[2] + y * math.sin(tilt)))
    return pts

def tube(points, radius, mat, name='tube', res=6):
    """Тонкая трубка по плавной кривой (NURBS-подобной Безье) — стеклянная нить."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = radius; cu.bevel_resolution = res; cu.resolution_u = 12
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for p, q in zip(sp.points, points): p.co = (q[0], q[1], q[2], 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob); cu.materials.append(mat)
    return ob

def lathe(profile, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=96, closed=True, name='lathe', smooth=True):
    """Тело вращения вокруг оси Z: profile — список (r, z); closed=True замыкает контур (стенка со вторым слоем, как у полого стекла)."""
    P = len(profile); verts = []
    for s in range(seg):
        a = 2 * math.pi * s / seg; ca, sa = math.cos(a), math.sin(a)
        for r, z in profile: verts.append((r * ca, r * sa, z))
    faces = []
    for s in range(seg):
        s2 = (s + 1) % seg
        for i in range(P if closed else P - 1):
            j = (i + 1) % P
            faces.append((s * P + i, s2 * P + i, s2 * P + j, s * P + j))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update(); me.validate()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(mat)
    ob.location = loc; ob.rotation_euler = rot
    return ob

def plane_backdrop(mat, size=(12, 8), loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.scale = (size[0], size[1], 1); ob.data.materials.append(mat); return ob

def emitter(loc, r, color=(1, 0.97, 0.92), strength=8.0):
    m = bpy.data.materials.new('e'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return sphere(loc, r, m, seg=24, rings=12)
