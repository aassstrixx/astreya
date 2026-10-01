"""LUMIÈRE — премиальная 3D-анимация косметической баночки (Blender / Cycles, bpy).

Запуск (нужен пакет `bpy`, Python 3.11):
    python3 lumiere_scene.py still  <кадр> out.png [--res 1280x720] [--samples 64]
    python3 lumiere_scene.py anim   <с> <по> outdir [--res 1920x1080] [--samples 96]
    python3 lumiere_scene.py info

Единицы: 1 BU = 1 см. Ось Z — вверх, фронт баночки смотрит в -Y, камера в начале стоит на -Y.
Все движения (камера, баночка, крышка, крем) — чистые функции времени: apply_state(frame).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 24

# ----------------------------------------------------------------------------------------------
# Размеры (см)
# ----------------------------------------------------------------------------------------------
R_BODY = 3.65          # корпус
Z_SHOULDER = 3.55      # плечо корпуса / посадочная плоскость крышки
R_NECK = 2.99          # горловина (наружный радиус)
R_NECK_IN = 2.79
Z_RIM = 4.62           # верх горловины
Z_FLOOR = 1.0          # дно полости (толстое стекло)
R_CREAM = 2.77
Z_CREAM = 4.38         # уровень крема у стенки
LID_RO, LID_RI, LID_H, LID_T = 3.52, 3.30, 2.15, 0.22
SEGMENTS = 224


# ----------------------------------------------------------------------------------------------
# Геометрия: тела вращения
# ----------------------------------------------------------------------------------------------
def arc(cr, cz, rad, a0, a1, n=14):
    a = np.radians(np.linspace(a0, a1, n))
    return np.stack([cr + rad * np.cos(a), cz + rad * np.sin(a)], axis=1)


def poly(*parts):
    out = []
    for p in parts:
        p = np.asarray(p, dtype=float).reshape(-1, 2)
        if out and np.allclose(out[-1], p[0]):
            p = p[1:]
        out.extend(p.tolist())
    return np.array(out)


def lathe_arrays(polylines, flip=False, n=SEGMENTS, label_wall=False):
    """polylines: [(pts(r,z), material_index, is_label_wall)] -> verts, faces, uv, mat_ids.
    Профиль обходится против часовой стрелки в плоскости (r,z) -> нормали наружу."""
    verts, faces, uvs, mats = [], [], [], []
    base = 0
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    for pts, mat, wall in polylines:
        pts = np.asarray(pts, dtype=float)
        if flip:
            pts = pts[::-1]
        pts = pts.copy()
        pts[:, 0] = np.maximum(pts[:, 0], 5e-4)
        m = len(pts)
        v = np.empty((n, m, 3))
        v[:, :, 0] = np.cos(th)[:, None] * pts[None, :, 0]
        v[:, :, 1] = np.sin(th)[:, None] * pts[None, :, 0]
        v[:, :, 2] = pts[None, :, 1]
        verts.append(v.reshape(-1, 3))
        ii, jj = np.meshgrid(np.arange(n), np.arange(m - 1), indexing="ij")
        i2 = (ii + 1) % n
        f = np.stack([ii * m + jj, i2 * m + jj, i2 * m + jj + 1, ii * m + jj + 1], axis=-1).reshape(-1, 4) + base
        faces.append(f)
        # UV: только для стенки корпуса (этикетка), остальное — за пределами текстуры
        u0 = (ii / n).reshape(-1)
        u1 = ((ii + 1) / n).reshape(-1)
        if wall:
            vv0 = (pts[jj, 1] / 3.6).reshape(-1)
            vv1 = (pts[jj + 1, 1] / 3.6).reshape(-1)
            uv = np.stack([u0, vv0, u1, vv0, u1, vv1, u0, vv1], axis=1)
        else:
            uv = np.full((len(u0), 8), -10.0)
        uvs.append(uv.reshape(-1, 2))
        mats.append(np.full(len(f), mat))
        base += n * m
    return np.concatenate(verts), np.concatenate(faces), np.concatenate(uvs), np.concatenate(mats)


def make_mesh(name, verts, faces, uv=None, mats=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.update()
    if uv is not None:
        layer = me.uv_layers.new(name="UV")
        layer.data.foreach_set("uv", uv.reshape(-1))
    if mats is not None:
        me.polygons.foreach_set("material_index", mats.astype(np.int32))
    me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ----------------------------------------------------------------------------------------------
# Материалы
# ----------------------------------------------------------------------------------------------
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return m, nt


def principled(nt, **kw):
    n = nt.nodes.new("ShaderNodeBsdfPrincipled")
    for k, v in kw.items():
        n.inputs[k.replace("_", " ")].default_value = v
    return n


def mat_frosted(label_path):
    m, nt = new_mat("FrostedGlass")
    glass = principled(nt, Base_Color=(0.95, 0.955, 0.96, 1), Roughness=0.50, Transmission_Weight=0.62,
                       IOR=1.5, Specular_IOR_Level=0.5)
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.97, 0.975, 0.98, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.50, 0.52, 0.55, 1)
    nt.links.new(lw.outputs["Facing"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], glass.inputs["Base Color"])
    ink = principled(nt, Base_Color=(0.012, 0.012, 0.014, 1), Roughness=0.42, Specular_IOR_Level=0.3)
    tex = nt.nodes.new("ShaderNodeTexImage")
    img = bpy.data.images.load(label_path)
    img.colorspace_settings.name = "Non-Color"
    tex.image = img
    tex.extension = "CLIP"
    tex.interpolation = "Cubic"
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(glass.outputs["BSDF"], mix.inputs[1])
    nt.links.new(ink.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return m


def mat_clear_plastic():
    m, nt = new_mat("ClearNeck")
    p = principled(nt, Base_Color=(0.97, 0.98, 1, 1), Roughness=0.10, Transmission_Weight=1.0, IOR=1.47)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(p.outputs["BSDF"], out.inputs["Surface"])
    return m


def mat_chrome():
    m, nt = new_mat("Chrome")
    p = principled(nt, Base_Color=(0.93, 0.93, 0.95, 1), Metallic=1.0, Roughness=0.035)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(p.outputs["BSDF"], out.inputs["Surface"])
    return m


def mat_liner():
    m, nt = new_mat("LidLiner")
    p = principled(nt, Base_Color=(0.05, 0.05, 0.055, 1), Roughness=0.45, Specular_IOR_Level=0.4)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(p.outputs["BSDF"], out.inputs["Surface"])
    return m


def mat_cream():
    m, nt = new_mat("Cream")
    p = principled(nt, Base_Color=(0.72, 0.71, 0.69, 1), Roughness=0.30, IOR=1.4,
                   Specular_IOR_Level=0.55, Coat_Weight=0.5, Coat_Roughness=0.12)
    # едва заметный микрорельеф — «шелковистая» плотная текстура
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18.0
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.55
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.035
    bump.inputs["Distance"].default_value = 0.05
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(p.outputs["BSDF"], out.inputs["Surface"])
    return m


def mat_floor():
    m, nt = new_mat("GraphiteStudio")
    p = principled(nt, Base_Color=(0.030, 0.031, 0.034, 1), Roughness=0.30, Specular_IOR_Level=0.5)

    def mth(op, a, b=None):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs["Value"]

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    gx = mth("EXPONENT", mth("MULTIPLY", mth("POWER", mth("MULTIPLY", sep.outputs["X"], 1 / 70.0), 2.0), -1.0))
    gz = mth("EXPONENT", mth("MULTIPLY", mth("POWER", mth("MULTIPLY", mth("SUBTRACT", sep.outputs["Z"], 14.0), 1 / 42.0), 2.0), -1.0))
    my = nt.nodes.new("ShaderNodeMapRange")
    nt.links.new(sep.outputs["Y"], my.inputs["Value"])
    my.inputs["From Min"].default_value = 20.0
    my.inputs["From Max"].default_value = 115.0
    glow = mth("MULTIPLY", mth("MULTIPLY", gx, gz), my.outputs["Result"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.80, 0.82, 0.88, 1)
    nt.links.new(mth("MULTIPLY", glow, 0.085), em.inputs["Strength"])
    add = nt.nodes.new("ShaderNodeAddShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(p.outputs["BSDF"], add.inputs[0])
    nt.links.new(em.outputs["Emission"], add.inputs[1])
    nt.links.new(add.outputs["Shader"], out.inputs["Surface"])
    return m


def mat_emitter(strength, color=(1, 1, 1), grad=(1.0, 1.0)):
    m, nt = new_mat("Emitter")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = grad[0]
    mr.inputs["To Max"].default_value = grad[1]
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = strength
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Y"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], mul.inputs[0])
    nt.links.new(mul.outputs["Value"], em.inputs["Strength"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


# ----------------------------------------------------------------------------------------------
# Объекты сцены
# ----------------------------------------------------------------------------------------------
def build_glass(label_path):
    p1 = poly([(0, 0), (R_BODY - 0.5, 0)], arc(R_BODY - 0.5, 0.5, 0.5, -90, 0),
              [(R_BODY, 3.2)], arc(R_BODY - 0.35, 3.2, 0.35, 0, 90), [(R_NECK + 0.06, Z_SHOULDER)])
    # горловина с тремя рёбрами резьбы
    zz = np.linspace(Z_SHOULDER + 0.07, Z_RIM, 160)
    rr = R_NECK + sum(0.075 * np.exp(-(((zz - zc) / 0.075) ** 2)) for zc in (3.93, 4.24, 4.55))
    neck_out = np.stack([rr, zz], axis=1)
    rim_c = (R_NECK + R_NECK_IN) / 2
    p2 = poly([(R_NECK + 0.06, Z_SHOULDER), (R_NECK, Z_SHOULDER + 0.07)], neck_out,
              arc(rim_c, Z_RIM, (R_NECK - R_NECK_IN) / 2, 0, 180, 12), [(R_NECK_IN, Z_SHOULDER)])
    p3 = poly([(R_NECK_IN, Z_SHOULDER), (R_NECK_IN, Z_FLOOR + 0.4)], arc(R_NECK_IN - 0.4, Z_FLOOR + 0.4, 0.4, 0, -90, 10),
              [(0, Z_FLOOR)])
    v, f, uv, mt = lathe_arrays([(p1, 0, True), (p2, 1, False), (p3, 0, False)])
    ob = make_mesh("Glass", v, f, uv, mt)
    ob.data.materials.append(mat_frosted(label_path))
    ob.data.materials.append(mat_clear_plastic())
    return ob


def lid_profile():
    h, t = LID_H, LID_T
    pts = poly(
        [(0, h - t), (LID_RI - 0.08, h - t)], arc(LID_RI - 0.08, h - t - 0.08, 0.08, 90, 0, 6),
        [(LID_RI, 0.1)], arc(LID_RI + 0.05, 0.1, 0.05, 180, 270, 6),
        [(LID_RO - 0.04, 0)], arc(LID_RO - 0.04, 0.04, 0.04, -90, 0, 6),
        [(LID_RO, h - 0.22)], arc(LID_RO - 0.22, h - 0.22, 0.22, 0, 90, 18),
        [(0, h)],
    )
    return pts


def build_lid():
    v, f, uv, mt = lathe_arrays([(lid_profile(), 0, False)])
    lid = make_mesh("Lid", v, f, uv, mt)
    lid.data.materials.append(mat_chrome())
    liner_pts = poly([(0, 1.18), (3.1, 1.18)], arc(3.1, 1.34, 0.16, -90, 0, 8), [(3.26, LID_H - LID_T - 0.002)],
                     [(0, LID_H - LID_T - 0.002)])
    v, f, uv, mt = lathe_arrays([(liner_pts, 0, False)])
    liner = make_mesh("LidLiner", v, f, uv, mt)
    liner.data.materials.append(mat_liner())
    liner.parent = lid
    return lid


def cream_top(phase, amp, lean, peak, n=SEGMENTS, k=72):
    """Поверхность крема: кольца от стенки (k=0) к кончику (k=K), центр кольца смещён — «завиток»."""
    R, H1, H2, sig = R_CREAM, 0.22, peak, 1.85
    s = np.linspace(0, 1, k + 1)
    rho = R * (1 - s) ** 1.55
    rho[-1] = 1e-3
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    pr = np.sqrt(rho ** 2 + 0.11 ** 2) - 0.11                        # скруглённый кончик
    pk = H2 * np.clip(1 - pr / sig, 0, 1) ** 1.9
    dome = H1 * np.clip(1 - (rho / R) ** 2, 0, 1) ** 1.25
    z = Z_CREAM + dome + pk
    q = (pk / H2) ** 2.4
    ang = np.radians(lean)
    cx = 0.42 * q * np.cos(ang)
    cy = 0.42 * q * np.sin(ang)
    flute_env = np.sin(np.pi * np.clip(rho / R, 0, 1)) ** 0.8 * np.clip(rho / 0.15, 0, 1)
    ph = phase + 2.2 * (pk / H2)
    rad = rho[:, None] * (1 + amp * flute_env[:, None] * np.sin(7 * th[None, :] + ph[:, None]))
    ridge_env = np.sin(np.pi * np.clip(pk / H2, 0, 1))
    ridge = 0.05 * amp / 0.03 * ridge_env[:, None] * np.sin(5 * th[None, :] - 6.0 * (pk / H2)[:, None] + phase)
    v = np.empty((k + 1, n, 3))
    v[:, :, 0] = cx[:, None] + rad * np.cos(th)[None, :]
    v[:, :, 1] = cy[:, None] + rad * np.sin(th)[None, :]
    v[:, :, 2] = z[:, None] + ridge
    return v


def build_cream():
    n = SEGMENTS
    wall_pts = poly([(0, Z_FLOOR + 0.02), (R_CREAM, Z_FLOOR + 0.02), (R_CREAM, Z_CREAM)])
    wv, wf, _, _ = lathe_arrays([(wall_pts, 0, False)])
    k = 72
    tv0 = cream_top(0.0, 0.030, -25.0, 0.74)
    tv1 = cream_top(1.1, 0.055, 18.0, 0.72)
    ii, jj = np.meshgrid(np.arange(n), np.arange(k), indexing="ij")
    i2 = (ii + 1) % n
    base = len(wv)
    tf = np.stack([jj * n + ii, jj * n + i2, (jj + 1) * n + i2, (jj + 1) * n + ii], axis=-1).reshape(-1, 4) + base
    verts0 = np.concatenate([wv, tv0.reshape(-1, 3)])
    verts1 = np.concatenate([wv, tv1.reshape(-1, 3)])
    faces = np.concatenate([wf, tf])
    ob = make_mesh("Cream", verts0, faces)
    ob.shape_key_add(name="Basis", from_mix=False)
    key = ob.shape_key_add(name="Wave", from_mix=False)
    key.data.foreach_set("co", verts1.reshape(-1))
    ob.data.materials.append(mat_cream())
    return ob


def build_studio():
    floor_pts = poly([(0, 0), (105, 0)], arc(105, 50, 50, -90, 0, 28), [(155, 150)], [(0, 150)])
    v, f, uv, mt = lathe_arrays([(floor_pts, 0, False)], flip=True, n=96)
    ob = make_mesh("Studio", v, f, uv, mt)
    ob.data.materials.append(mat_floor())
    return ob


def softbox(name, pos, size, strength, target=(0, 0, 3), color=(1, 1, 1), grad=(1.0, 1.0), parent=None):
    w, h = size
    verts = np.array([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)])
    ob = make_mesh(name, verts, np.array([[0, 1, 2, 3]]), smooth=False)
    ob.data.materials.append(mat_emitter(strength, color, grad))
    ob.location = pos
    d = Vector(target) - Vector(pos)
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    ob.visible_camera = False
    ob.visible_shadow = False
    if parent is not None:
        ob.parent = parent
    return ob


def build_lights(rig):
    # Большие мягкие вертикальные софтбоксы -> вертикальные отражения на хроме
    softbox("Key_L", (-36, -16, 24), (13, 46), 8.5, (0, 0, 3), (1.0, 0.99, 0.97), (0.55, 1.0), rig)
    softbox("Key_R", (38, -12, 24), (11, 46), 5.5, (0, 0, 3), (0.97, 0.98, 1.0), (0.55, 1.0), rig)
    # Верхний мягкий источник
    softbox("Top", (0, -6, 62), (46, 36), 0.9, (0, 0, 3), (1, 1, 1), (0.7, 1.0), rig)
    # Контровые полосы: подчёркивают контур стекла
    softbox("Rim_L", (-26, 34, 20), (8, 38), 9.0, (0, 0, 3), (0.95, 0.97, 1.0), (0.4, 1.0), rig)
    softbox("Rim_R", (27, 32, 20), (8, 38), 7.0, (0, 0, 3), (1.0, 0.98, 0.95), (0.4, 1.0), rig)
    # Очень слабая фронтальная заполняющая карта
    softbox("Fill", (0, -58, 20), (64, 30), 2.4, (0, 0, 3), (1, 1, 1), (0.55, 1.0), rig)


def build_camera():
    cam = bpy.data.cameras.new("Cam")
    cam.sensor_width = 36
    cam.dof.use_dof = True
    ob = bpy.data.objects.new("Camera", cam)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    tgt = bpy.data.objects.new("Focus", None)
    tgt.empty_display_type = "PLAIN_AXES"
    bpy.context.scene.collection.objects.link(tgt)
    c = ob.constraints.new("TRACK_TO")
    c.target = tgt
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    cam.dof.focus_object = tgt
    return ob, tgt


# ----------------------------------------------------------------------------------------------
# Сборка сцены
# ----------------------------------------------------------------------------------------------
S = {}   # ссылки на объекты


def build_scene(res=(1920, 1080), samples=96):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    label = os.path.join(HERE, "label.png")
    if not os.path.exists(label):
        sys.path.insert(0, HERE)
        import make_label
        make_label.main(label)

    S["studio"] = build_studio()
    S["glass"] = build_glass(label)
    S["cream"] = build_cream()
    S["cream"].parent = S["glass"]
    S["lid"] = build_lid()
    S["rig"] = bpy.data.objects.new("LightRig", None)
    sc.collection.objects.link(S["rig"])
    S["studio"].parent = S["rig"]
    build_lights(S["rig"])
    S["cam"], S["focus"] = build_camera()
    S["glass"].location.z = 0.003

    w = bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.010, 0.010, 0.012, 1)
    bg.inputs["Strength"].default_value = 1.0

    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "8"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.adaptive_min_samples = 0
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    cy.max_bounces = 14
    cy.transmission_bounces = 12
    cy.glossy_bounces = 8
    cy.diffuse_bounces = 3
    cy.volume_bounces = 0
    cy.transparent_max_bounces = 8
    cy.sample_clamp_indirect = 4.0
    cy.sample_clamp_direct = 0.0
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.use_light_tree = False
    r.use_motion_blur = True
    r.motion_blur_shutter = 0.5
    r.motion_blur_position = "CENTER"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    sc.view_settings.exposure = 0.25
    sc.render.fps = FPS
    return sc


# ----------------------------------------------------------------------------------------------
# Анимация
# ----------------------------------------------------------------------------------------------
def clamp01(x):
    return max(0.0, min(1.0, x))


def sm(x):
    """smootherstep"""
    x = clamp01(x)
    return x * x * x * (x * (6 * x - 15) + 10)


def seg(t, a, b):
    return sm((t - a) / (b - a)) if b > a else float(t >= b)


def lerp(a, b, x):
    return a + (b - a) * x


# --- поза крышки у баночки (подпирает корпус) ----------------------------------------------------
def lid_local_points():
    pts = []
    for zl in np.linspace(0, LID_H, 6):
        for a in np.linspace(0, 2 * np.pi, 96, endpoint=False):
            pts.append((LID_RO * math.cos(a), LID_RO * math.sin(a), zl))
    for r in np.linspace(0, LID_RO, 8):
        for a in np.linspace(0, 2 * np.pi, 96, endpoint=False):
            pts.append((r * math.cos(a), r * math.sin(a), LID_H))
    return np.array(pts)


def jar_radius_at(z):
    z = np.asarray(z)
    out = np.zeros_like(z, dtype=float)
    out[z < Z_SHOULDER] = R_BODY
    out[(z >= Z_SHOULDER) & (z < Z_RIM + 0.15)] = R_NECK + 0.1
    out[(z >= Z_RIM + 0.15) & (z < 5.5)] = 1.8
    return out


LEAN_TILT = 56.0   # градусов от вертикали (ось крышки наклонена в +X)
LEAN_Y = -1.6


def lid_rotation(tilt_deg):
    return Matrix.Rotation(math.radians(tilt_deg), 3, "Y")


def solve_lean_pose():
    pts = lid_local_points()
    R = np.array(lid_rotation(LEAN_TILT))
    w = pts @ R.T
    zc = -w[:, 2].min()
    x = 14.0
    while x > 0:
        p = w + np.array([x, LEAN_Y, zc])
        d = np.hypot(p[:, 0], p[:, 1])
        if np.any(d < jar_radius_at(p[:, 2]) + 0.05):
            break
        x -= 0.01
    return Vector((x + 0.06, LEAN_Y, zc))


LID_CLOSED = Vector((0, 0, Z_SHOULDER + 0.004))
LID_UP = Vector((0, 0, Z_SHOULDER + 7.8))


def bezier(p0, p1, p2, s):
    return (1 - s) ** 2 * p0 + 2 * s * (1 - s) * p1 + s * s * p2


# --- расписание (секунды) ----------------------------------------------------------------------
TS = 0.80   # общий масштаб времени (длительность ролика)
T = dict(
    rot_a=1.0, rot_b=8.0,             # оборот баночки вокруг оси
    lift_a=8.0, lift_b=10.0,          # крышка поднимается
    aside_a=10.0, aside_b=12.8,       # уходит в сторону
    wave_a=12.0, wave_b=26.0,         # период «волны» крема
    back_a=37.0, back_b=39.0,         # крышка возвращается: подъём над баночкой
    close_a=39.0, close_b=41.6,       # опускается и идеально закрывает
    fin_a=41.6, fin_b=48.0,           # финальный оборот и остановка строго фронтально
    end=49.0,
)
T = {k: v * TS for k, v in T.items()}


def lid_state(t, lean):
    """-> (pos, tilt_deg)"""
    if t < T["lift_a"]:
        return LID_CLOSED.copy(), 0.0
    if t < T["lift_b"]:
        s = seg(t, T["lift_a"], T["lift_b"])
        return LID_CLOSED.lerp(LID_UP, s), 9.0 * s            # лёгкий поворот при подъёме
    if t < T["aside_b"]:
        s = seg(t, T["aside_a"], T["aside_b"])
        p0, p2 = LID_UP.copy(), lean
        c = Vector((p2.x + 3.5, p2.y, LID_UP.z - 1.0))
        tilt = lerp(9.0, LEAN_TILT, sm(s * 1.15))
        return bezier(p0, c, p2, s), tilt
    if t < T["back_a"]:
        return lean.copy(), LEAN_TILT
    if t < T["back_b"]:
        s = seg(t, T["back_a"], T["back_b"])
        c = Vector((lean.x + 3.0, lean.y, LID_UP.z))
        tilt = lerp(LEAN_TILT, 0.0, sm(s * 1.1))
        # подъём с опоры вверх и вбок -> над баночкой
        p = bezier(lean, c, LID_UP, s)
        return p, tilt
    if t < T["close_b"]:
        s = seg(t, T["close_a"], T["close_b"])
        return LID_UP.lerp(LID_CLOSED, s), 0.0
    return LID_CLOSED.copy(), 0.0


def jar_rotation(t):
    a = 360.0 * seg(t, T["rot_a"], T["rot_b"])
    b = 360.0 * seg(t, T["fin_a"], T["fin_b"])
    return math.radians(-(a + b) - 0.0)   # вращение против часовой — этикетка уходит вправо


# --- камера -----------------------------------------------------------------------------------
# (t, az°, el°, dist, (tx,ty,tz), focal, fstop, tension)  tension 1 = плавно проезжаем, 0 = мягкая остановка
def camera_keys(lean):
    lid_c = lean + lid_rotation(LEAN_TILT) @ Vector((0, 0, LID_H / 2))
    lc = tuple(lid_c)
    K = [
        # закрытая баночка, наезд и вращение
        (0.0, 0, 8.0, 56.0, (0, 0, 2.9), 85, 4.0, 0.0),
        (8.0, 2, 10.0, 42.0, (0, 0, 2.9), 85, 4.0, 0.6),
        # крышка поднимается — камера отъезжает и ведёт её
        (10.0, -4, 12.0, 70.0, (0.5, 0, 6.8), 85, 4.5, 0.6),
        (12.8, -8, 20.0, 42.0, (1.4, 0, 4.3), 85, 3.5, 0.7),
        # макро крема
        (14.6, -28, 30.0, 15.5, (0, 0, 4.8), 100, 2.0, 0.6),
        (16.0, 14, 27.0, 14.5, (0, 0, 4.8), 100, 2.0, 0.0),
        # фронтальный вид
        (17.6, 0, 6.0, 46.0, (2.2, 0, 3.0), 85, 4.5, 0.0),
        (18.0, 0, 6.0, 45.5, (2.2, 0, 3.0), 85, 4.5, 0.0),
        # под углом 45°
        (19.8, -45, 24.0, 44.0, (1.6, 0, 3.0), 85, 4.5, 0.0),
        (20.2, -45, 24.0, 43.5, (1.6, 0, 3.0), 85, 4.5, 0.0),
        # сбоку
        (22.0, -90, 5.0, 42.0, (1.4, 0, 2.9), 85, 4.5, 0.0),
        (22.4, -90, 5.0, 41.5, (1.4, 0, 2.9), 85, 4.5, 0.0),
        # сверху (камера плавно доворачивается)
        (24.2, -90, 84.0, 38.0, (2.2, 0, 3.0), 85, 5.0, 0.0),
        (25.2, -60, 84.0, 37.5, (2.2, 0, 3.0), 85, 5.0, 0.4),
        (26.4, -20, 84.0, 37.0, (2.2, 0, 3.0), 85, 5.0, 0.0),
        # крупный план хромированной крышки (боковина с полосами света)
        (28.2, -22, 14.0, 17.0, lc, 100, 2.4, 0.0),
        (29.4, -6, 13.0, 16.5, lc, 100, 2.4, 0.0),
        # матовое стекло: кромка, мягкий контровой свет
        (31.0, -4, 3.0, 15.0, (-3.2, -1.5, 1.8), 100, 2.0, 0.0),
        (32.0, 0, 3.0, 15.0, (-2.4, -2.5, 2.6), 100, 2.0, 0.0),
        # логотип и надписи
        (33.4, 0, 3.0, 14.0, (0, -3.65, 2.1), 100, 2.2, 0.0),
        (34.4, 4, 3.0, 13.0, (0.2, -3.65, 2.1), 100, 2.2, 0.0),
        # текстура крема крупным планом
        (36.0, -10, 38.0, 12.0, (0, 0, 4.9), 100, 1.8, 0.0),
        (37.0, -10, 36.0, 12.0, (0, 0, 4.9), 100, 1.8, 0.0),
        # общий план: крышка возвращается и закрывает
        (38.8, -2, 12.0, 70.0, (0.5, 0, 6.8), 85, 4.5, 0.4),
        (41.6, 0, 9.0, 46.0, (0, 0, 3.4), 85, 4.0, 0.3),
        (T["end"] / TS, 0, 7.0, 34.0, (0, 0, 2.95), 85, 4.0, 0.0),
    ]
    return [(k[0] * TS,) + k[1:] for k in K]


def hermite(p0, p1, m0, m1, s):
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1


def interp_keys(keys, t):
    ts = [k[0] for k in keys]
    if t <= ts[0]:
        i = 0
    elif t >= ts[-1]:
        i = len(keys) - 2
    else:
        i = max(j for j in range(len(ts)) if ts[j] <= t)
        i = min(i, len(keys) - 2)
    a, b = keys[i], keys[i + 1]
    h = b[0] - a[0]
    s = clamp01((t - a[0]) / h)

    def vec(k):
        return np.array([k[1], k[2], k[3], *k[4], k[5], k[6]], dtype=float)

    pa, pb = vec(a), vec(b)

    def tangent(j):
        k = keys[j]
        jm, jp = max(j - 1, 0), min(j + 1, len(keys) - 1)
        dt = keys[jp][0] - keys[jm][0]
        m = (vec(keys[jp]) - vec(keys[jm])) / dt if dt > 0 else np.zeros(9)
        return m * k[7]

    v = hermite(pa, pb, tangent(i) * h, tangent(i + 1) * h, s)
    return v


def apply_state(frame, lean):
    t = frame / FPS
    keys = camera_keys(lean)
    v = interp_keys(keys, t)
    az, el, dist = math.radians(float(v[0])), math.radians(float(v[1])), float(v[2])
    tgt = Vector((float(v[3]), float(v[4]), float(v[5])))
    pos = tgt + dist * Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    S["focus"].location = tgt
    cam = S["cam"]
    cam.location = pos
    cam.data.lens = float(v[6])
    cam.data.dof.aperture_fstop = float(v[7])
    S["rig"].rotation_euler.z = az
    S["glass"].rotation_euler.z = jar_rotation(t)
    p, tilt = lid_state(t, lean)
    lid = S["lid"]
    lid.location = p
    lid.rotation_euler = Euler((0, math.radians(tilt), 0), "XYZ")
    ph = (t - T["wave_a"]) / (T["wave_b"] - T["wave_a"])
    w = 0.0 if ph < 0 else 0.5 - 0.5 * math.cos(2 * math.pi * ph)
    S["cream"].data.shape_keys.key_blocks["Wave"].value = w


def jar_local_points():
    """Опорные точки баночки: плечо, край горловины, вершина крема."""
    pts = []
    for z, r in ((0.0, R_BODY), (Z_SHOULDER, R_BODY), (Z_SHOULDER + 0.02, R_NECK + 0.08), (Z_RIM, R_NECK + 0.08),
                 (Z_RIM + 0.1, R_NECK_IN), (Z_CREAM + 0.6, 1.0), (Z_CREAM + 0.96, 0.05)):
        for a in np.linspace(0, 2 * np.pi, 72, endpoint=False):
            pts.append((r * math.cos(a), r * math.sin(a), z))
    return np.array(pts)


def validate(lean):
    """Проверка столкновений крышки с баночкой по всем кадрам движения крышки."""
    lp, jp = lid_local_points(), jar_local_points()
    worst_lid, worst_jar, wf = 1e9, 1e9, None
    for f in range(int(T["lift_a"] * FPS) - 2, int(T["end"] * FPS)):
        t = f / FPS
        pos, tilt = lid_state(t, lean)
        if pos.z < Z_SHOULDER + 0.5 and abs(tilt) < 1e-6:      # закрыта/закрывается соосно
            continue
        R = np.array(lid_rotation(tilt))
        w = lp @ R.T + np.array(pos)
        d = np.hypot(w[:, 0], w[:, 1]) - jar_radius_at(w[:, 2])
        d = d[w[:, 2] < 5.6]
        if len(d) and d.min() < worst_lid:
            worst_lid, wf = d.min(), f
        # точки баночки внутри цилиндра крышки (но не в полости)
        loc = (jp - np.array(pos)) @ R
        rr = np.hypot(loc[:, 0], loc[:, 1])
        inside = (rr < LID_RO) & (loc[:, 2] > 0) & (loc[:, 2] < LID_H)
        hollow = (rr < LID_RI - 0.05) & (loc[:, 2] < LID_H - LID_T - 0.05)
        bad = inside & ~hollow
        if bad.any():
            worst_jar = min(worst_jar, -1.0)
            wf = f
    zmin = (lp @ np.array(lid_rotation(LEAN_TILT)).T + np.array(lean))[:, 2].min()
    print(f"min lid->jar clearance: {worst_lid:.3f} cm (кадр {wf}); баночка внутри стенки крышки: {'ДА' if worst_jar < 0 else 'нет'}; "
          f"лежащая крышка: z_min={zmin:.3f}")


def bake_motion(frame, lean):
    """Ключи на кадрах f-1, f, f+1 (линейно): Cycles берёт из них движение для motion blur."""
    sc = bpy.context.scene
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    objs = [S["cam"], S["focus"], S["rig"], S["glass"], S["lid"]]
    for o in objs:
        o.animation_data_clear()
    S["cam"].data.animation_data_clear()
    for ff in (frame - 1, frame, frame + 1):
        apply_state(ff, lean)
        S["cam"].keyframe_insert("location", frame=ff)
        S["focus"].keyframe_insert("location", frame=ff)
        S["rig"].keyframe_insert("rotation_euler", frame=ff)
        S["glass"].keyframe_insert("rotation_euler", frame=ff)
        S["lid"].keyframe_insert("location", frame=ff)
        S["lid"].keyframe_insert("rotation_euler", frame=ff)
        S["cam"].data.keyframe_insert("lens", frame=ff)
        S["cam"].data.dof.keyframe_insert("aperture_fstop", frame=ff)
    sc.frame_set(frame)
    apply_state(frame, lean)


# ----------------------------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------------------------
def parse_flags(argv):
    res, samples = (1920, 1080), 96
    rest = []
    i = 0
    while i < len(argv):
        if argv[i] == "--res":
            res = tuple(int(x) for x in argv[i + 1].lower().split("x"))
            i += 2
        elif argv[i] == "--samples":
            samples = int(argv[i + 1])
            i += 2
        else:
            rest.append(argv[i])
            i += 1
    return res, samples, rest


def main():
    res, samples, args = parse_flags(sys.argv[1:])
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    sc = build_scene(res, samples)
    lean = solve_lean_pose()
    if cmd == "info":
        print("lean pose:", tuple(round(x, 3) for x in lean), "frames:", int(T["end"] * FPS))
        validate(lean)
        return
    if cmd == "still":
        frame = int(float(args[1]))
        bake_motion(frame, lean)
        sc.render.filepath = args[2]
        bpy.ops.render.render(write_still=True)
    elif cmd == "anim":
        a, b, outdir = int(args[1]), int(args[2]), args[3]
        os.makedirs(outdir, exist_ok=True)
        import time
        for f in range(a, b + 1):
            path = os.path.join(outdir, f"f{f:05d}.png")
            if os.path.exists(path):
                continue
            t0 = time.time()
            bake_motion(f, lean)
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            print(f"frame {f} done in {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
