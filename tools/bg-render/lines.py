"""02 · линии науки: тонкие стеклянные нити-дуги и капли-бусины на тёплом молочном фоне (Cycles, стекло)."""
from common import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.3)
    world((0.55, 0.52, 0.48), 1.0, top=(0.85, 0.82, 0.78))
    bg = principled('bg', (0.80, 0.76, 0.70), 0.55, **{'Specular IOR Level': 0.2})
    plane_backdrop(bg, (14, 10), loc=(0, 0, -0.02))
    wire = glass('wire', (0.98, 0.97, 0.95), 1.45, 0.02)
    bead = glass('bead', (0.97, 0.95, 0.91), 1.45, 0.0)
    arcs = [((-3.2, -2.2, 0.0), 3.6, -0.15, 1.35, 0.10, 0.0), ((1.9, 2.2, 0.0), 3.2, 3.5, 4.8, 0.22, 0.0), ((-1.5, 3.2, 0.0), 3.9, 4.55, 5.55, 0.04, 0.0),
            ((2.6, -3.4, 0.0), 3.0, 1.95, 3.1, 0.30, 0.0), ((0.0, 0.2, 0.0), 2.35, -0.2, 2.0, 0.16, 0.0), ((-0.6, -0.4, 0.0), 2.9, 3.4, 5.3, 0.02, 0.0)]
    arcs += [((3.0, -0.6, 0.0), 2.1, 2.2, 3.9, 0.08, 0.0), ((-2.4, 1.6, 0.0), 2.6, -1.3, 0.2, 0.18, 0.0)]
    beads = []
    for c, r, a0, a1, z, tilt in arcs:
        pts = arc_points(c, r, a0, a1, z, 220, tilt); tube(pts, 0.0085, wire)
        for _ in range(rng.integers(1, 3)):                       # бусины на нитях
            i = rng.integers(40, 180); p = pts[i]; beads.append((p, rng.uniform(0.045, 0.11)))
    for p, r in beads: sphere((p[0], p[1], p[2] + 0.0), r, bead, seg=48, rings=24)
    for _ in range(3): sphere((rng.uniform(-1.8, 1.8), rng.uniform(-1, 1), 0.04), rng.uniform(0.025, 0.045), bead, seg=32, rings=16)
    sphere((1.15, -0.95, 0.15), 0.15, bead, seg=64, rings=32); sphere((-0.1, 0.55, 0.11), 0.105, bead, seg=64, rings=32)
    area_light((-3, -2.2, 3.2), (0, 0, 0), 4.0, 55, (1, 0.96, 0.9), size_y=4.0)
    area_light((3.5, 2.0, 2.6), (0, 0, 0), 4.0, 22, (0.95, 0.97, 1.0), size_y=4.0)
    area_light((0.5, 3.2, 1.2), (0, 0, 0), 1.0, 90, (1, 1, 1), size_y=5.0)      # узкая полоса сзади: даёт блики вдоль нитей
    camera((-0.7, -2.6, 4.3), (-0.9, 0.1, 0), lens=70, fstop=3.2, focus=(-0.1, 0, 0.05))   # кадр смещён: содержимое справа, слева чистое место под текст
    save_and_render()
