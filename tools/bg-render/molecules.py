"""02 · молекулярная структура: крупные прозрачные «атомы» со связями-стержнями и россыпь мелких пузырьков, мягкая глубина резкости (Cycles)."""
from common import *

def rod(a, b, r, mat):
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=L, location=(a + b) / 2, vertices=32)
    ob = bpy.context.active_object; ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); bpy.ops.object.shade_smooth(); ob.data.materials.append(mat)

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.05, bounces=48)
    world((0.66, 0.63, 0.60), 1.0, top=(0.96, 0.94, 0.91))
    bg = principled('bg', (0.74, 0.70, 0.65), 0.9, **{'Specular IOR Level': 0.05}); plane_backdrop(bg, (60, 30), loc=(0, 7.0, 0), rot=(math.pi / 2, 0, 0))
    atom = glass('atom', (0.99, 0.98, 0.97), 1.22, 0.0, shadow=0.8)
    rodm = glass('rod', (0.99, 0.98, 0.97), 1.4, 0.0, shadow=0.85)
    # (x, z, y-глубина, радиус): главная цепочка справа в фокусе, ближе к краям — мягкое размытие
    atoms = {'A': (1.55, 1.20, 0.0, 0.46), 'B': (2.75, 0.75, 0.05, 0.33), 'C': (0.85, 0.00, 0.15, 0.55), 'D': (2.20, -0.55, 0.0, 0.36), 'E': (3.55, 1.55, 0.35, 0.24), 'F': (1.65, -1.05, 0.25, 0.22), 'G': (3.4, -0.2, 0.2, 0.2)}
    for k, (x, z, y, r) in atoms.items(): sphere((x, y, z), r, atom, seg=128, rings=64)
    for i, j in [('A', 'B'), ('A', 'C'), ('B', 'E'), ('B', 'D'), ('C', 'F'), ('D', 'G')]:
        a, b = atoms[i], atoms[j]; pa, pb = Vector((a[0], a[2], a[1])), Vector((b[0], b[2], b[1])); d = (pb - pa).normalized()
        rod(pa + d * a[3] * 0.97, pb - d * b[3] * 0.97, 0.034, rodm)
    bub = glass('bub', (1, 1, 1), 1.12, 0.0, shadow=0.9)
    for _ in range(34):                                                         # мелкие пузырьки вокруг цепочки
        x = rng.uniform(-0.3, 4.4); z = rng.uniform(-1.5, 2.1); y = rng.uniform(-0.8, 1.6); r = abs(rng.normal(0.06, 0.04)) + 0.02
        sphere((x, y, z), r, bub, seg=48, rings=24)
    for _ in range(14):                                                         # крупные размытые пузыри на заднем плане (боке)
        sphere((rng.uniform(-1.5, 4.8), rng.uniform(3.5, 5.0), rng.uniform(-1.8, 2.4)), rng.uniform(0.18, 0.4), bub, seg=48, rings=24)
    area_light((-1.0, -5.0, 4.0), (2.0, 0, 0.4), 2.4, 140, (1, 0.96, 0.9), shape='DISK')
    area_light((6.0, -4.0, 2.5), (2.0, 0, 0.4), 3.0, 80, (0.93, 0.96, 1.0), shape='DISK')
    area_light((2.0, 3.0, 4.0), (2.0, 0, 0.4), 3.0, 120, (1, 1, 1), shape='DISK')
    camera((0.7, -6.8, 1.0), (1.4, 0, 0.45), lens=50, fstop=1.4, focus=(1.55, 0.0, 1.2))
    save_and_render()
