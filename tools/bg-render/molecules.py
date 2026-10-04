"""07 · молекулярная структура: стеклянные шары-атомы со связями-стержнями, резкий передний план и размытая глубина (Cycles, широкий кадр 3:1)."""
from common import *

def rod(a, b, r, mat):
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=L, location=(a + b) / 2, vertices=24)
    ob = bpy.context.active_object; ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); bpy.ops.object.shade_smooth(); ob.data.materials.append(mat)

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.1, bounces=48)
    world((0.80, 0.77, 0.73), 1.0, top=(0.96, 0.94, 0.90))
    bg = principled('bg', (0.74, 0.70, 0.65), 0.6); plane_backdrop(bg, (60, 24), loc=(0, 18.0, 0), rot=(math.radians(90), 0, 0))
    gl = glass('atom', (0.99, 0.97, 0.95), 1.45, 0.0, shadow=0.75)
    rd = glass('rod', (0.99, 0.98, 0.96), 1.45, 0.02, shadow=0.8)
    # цепочка: (x, z, y-глубина, радиус) — передний план справа в фокусе, левее и глубже — размытие
    atoms = [(1.9, 0.45, 0.0, 0.34), (2.75, -0.10, 0.1, 0.40), (3.85, 0.80, -0.1, 0.30), (4.50, 0.05, -0.15, 0.26), (1.15, -0.85, 0.5, 0.26), (3.2, 1.05, 0.9, 0.22),
             (0.2, 0.2, 5.0, 0.30), (-1.2, 0.9, 7.0, 0.24), (-2.2, -0.4, 8.5, 0.28), (1.0, 1.0, 6.0, 0.2), (-0.7, -0.7, 6.5, 0.18), (-3.6, 0.5, 10.0, 0.26),
             (5.4, 0.7, 2.5, 0.22), (0.4, -0.35, 3.8, 0.15), (-5.0, -0.3, 12.0, 0.3)]
    for x, z, y, r in atoms: sphere((x, y, z), r, gl, seg=96, rings=48)
    bonds = [(0, 1), (1, 2), (2, 3), (1, 4), (1, 5), (0, 6), (6, 7), (7, 8), (6, 9), (6, 10), (8, 11), (2, 12), (6, 13), (11, 14)]
    for i, j in bonds:
        a, b = atoms[i], atoms[j]; pa, pb = Vector((a[0], a[2], a[1])), Vector((b[0], b[2], b[1])); d = (pb - pa).normalized()
        rod(pa + d * a[3] * 0.97, pb - d * b[3] * 0.97, 0.045, rd)
    for _ in range(26):                                       # боке: крошечные светящиеся точки далеко позади
        emitter((rng.uniform(-6, 6), rng.uniform(14, 16), rng.uniform(-1.6, 2.4)), rng.uniform(0.03, 0.09), strength=rng.uniform(4, 10))
    area_light((-1.0, -6.0, 5.0), (2.0, 0, 0.3), 2.2, 120, (1, 0.96, 0.9), shape='DISK')
    area_light((8.0, -5.0, 3.0), (2.0, 0, 0.3), 3.0, 60, (0.95, 0.97, 1.0), shape='DISK')
    area_light((3.0, 6.0, 4.0), (2.2, 0, 0.3), 3.5, 110, (1, 1, 1), shape='DISK')
    camera((1.6, -9.5, 0.5), (1.8, 0, 0.3), lens=50, fstop=0.28, focus=(2.8, 0.0, 0.1), sensor=36)
    save_and_render()
