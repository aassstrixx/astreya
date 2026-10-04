"""08 · свет и тень: мягкие тени листьев на молочной стене — рассеянный дневной свет (Cycles: листья скрыты от камеры, но отбрасывают тень)."""
from common import *

def leaf_mesh(L, Wd, bend, name):
    """Лист: контур «острая капля», слегка выгнут поперёк и вдоль, одна жилка по середине (сетка из полос)."""
    nt, ns = 22, 5; verts = []; faces = []
    for i in range(nt + 1):
        t = i / nt
        w = Wd * (math.sin(math.pi * min(t ** 0.75, 1.0)) ** 0.85) * (1 - 0.15 * t)
        for j in range(ns):
            sv = -1 + 2 * j / (ns - 1)
            verts.append((t * L, sv * w, bend * (sv ** 2) * w + 0.25 * bend * L * (t - 0.4) ** 2))
    for i in range(nt):
        for j in range(ns - 1): faces.append((i * ns + j, i * ns + j + 1, (i + 1) * ns + j + 1, (i + 1) * ns + j))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

def branch(rng, base, direction, length, mat, nleaf=11, size=0.55):
    """Ветка: изогнутый стебель из точек и листья по обе стороны, к кончику мельче."""
    base = Vector(base); d = Vector(direction).normalized(); pts = []
    bend = Vector((rng.uniform(-0.2, 0.2), 0, rng.uniform(-0.25, 0.25)))
    for k in range(nleaf):
        t = k / (nleaf - 1)
        pts.append(base + d * length * t + bend * (t ** 2) * length)
    for k, p in enumerate(pts):
        t = k / (nleaf - 1); scale = size * (1.05 - 0.55 * t) * rng.uniform(0.85, 1.15)
        for side in (-1, 1):
            if k == nleaf - 1 and side == 1: continue
            lf = leaf_mesh(1.0 * scale, 0.30 * scale, rng.uniform(0.05, 0.28), 'leaf')
            lf.data.materials.append(mat); lf.visible_camera = False                    # лист не виден, но отбрасывает тень
            ang = math.radians(rng.uniform(30, 62)) * side
            tang = (pts[min(k + 1, nleaf - 1)] - pts[max(k - 1, 0)]).normalized()
            az = math.atan2(tang.z, tang.x)
            lf.rotation_euler = (rng.uniform(-0.7, 0.7), rng.uniform(-0.5, 0.5), az + ang)
            lf.location = p
    return pts

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.25)
    world((0.78, 0.75, 0.70), 1.0, top=(0.92, 0.90, 0.86))
    wall = principled('wall', (0.86, 0.82, 0.76), 0.9, **{'Specular IOR Level': 0.05})
    plane_backdrop(wall, (40, 30), loc=(0, 0, 0), rot=(math.pi / 2, 0, 0))             # стена: нормаль к камере (−Y)
    mat = principled('leaf', (0.2, 0.3, 0.2), 0.8)
    # несколько веток перед стеной, разное расстояние → разная размытость тени
    branch(rng, (-3.1, -1.7, 2.0), (1.0, 0.1, -0.55), 5.0, mat, 14, 0.60)
    branch(rng, (-1.6, -1.4, 2.5), (0.9, 0.05, -0.75), 4.2, mat, 12, 0.52)
    branch(rng, (-3.5, -2.2, 0.7), (1.0, 0.12, 0.25), 5.6, mat, 15, 0.64)
    branch(rng, (0.5, -1.2, 2.9), (0.5, 0.0, -1.0), 3.8, mat, 11, 0.5)
    ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = 2.4; ld.angle = math.radians(3.6); ld.color = (1.0, 0.96, 0.88)
    sun = bpy.data.objects.new('sun', ld); bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(62), math.radians(24), math.radians(-28))         # свет слева-сверху-спереди: тени ложатся вправо-вниз
    camera((-0.9, -6.0, 0.5), (-0.9, 0.0, 0.5), lens=50)       # кадр смещён: тени справа, слева спокойное место
    save_and_render()
