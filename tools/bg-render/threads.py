"""06 · деликатные нити: паутинка из тончайших стеклянных нитей с капельками росы на тёплом размытом фоне (Cycles, макро с малой глубиной резкости)."""
from common import *

def web(rng, centre, rays, r_in, r_out, wire, bead, depth_jit=0.12):
    """Паутина в плоскости XZ: лучи от центра и кольца-нити между ними с провисанием; на кольцах — росинки."""
    cx, cy, cz = centre; ang0 = rng.uniform(0, 6.28)
    angs = [ang0 + 2 * math.pi * i / rays + rng.normal(0, 0.07) for i in range(rays)]
    length = [rng.uniform(0.85, 1.15) * r_out for _ in range(rays)]
    ydep = [rng.normal(0, abs(depth_jit)) * (1 if depth_jit >= 0 else -1) for _ in range(rays)]
    def pt(i, r): return (cx + r * math.cos(angs[i]), cy + ydep[i] * (r / r_out), cz + r * math.sin(angs[i]))
    for i in range(rays): tube([pt(i, 0.03), pt(i, length[i])], wire * 1.15, wire_m)
    r = r_in
    while r < r_out * 0.95:
        for i in range(rays):
            j = (i + 1) % rays; ri = r * rng.uniform(0.96, 1.04); rj = r * rng.uniform(0.96, 1.04)
            a = Vector(pt(i, ri)); b = Vector(pt(j, rj)); mid = (a + b) / 2; toward = (Vector((cx, cy, cz)) - mid).normalized() * 0.12 * (a - b).length
            pts = []
            for k in range(9):
                t = k / 8; p = a * (1 - t) + b * t + toward * math.sin(math.pi * t); pts.append(tuple(p))
            tube(pts, wire, wire_m)
            for _ in range(rng.integers(0, 3)):
                t = rng.uniform(0.1, 0.9); p = a * (1 - t) + b * t + toward * math.sin(math.pi * t)
                if rng.random() < 0.38: sphere(tuple(p), rng.uniform(0.012, 1.0) ** 2 * bead + 0.012, bead_m, seg=40, rings=20)
        r *= rng.uniform(1.14, 1.24)

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.55, bounces=32)
    world((0.70, 0.64, 0.58), 1.0, top=(0.93, 0.90, 0.85))
    bg = principled('bg', (0.60, 0.52, 0.45), 0.9, **{'Specular IOR Level': 0.05}); plane_backdrop(bg, (80, 40), loc=(0, 16.0, 0), rot=(math.pi / 2, 0, 0))
    wire_m = glass('wire', (0.99, 0.98, 0.97), 1.45, 0.02, shadow=0.85)
    bead_m = glass('bead', (1, 1, 1), 1.33, 0.0, shadow=0.7)
    web(rng, (2.4, 0.0, 0.5), 11, 0.26, 3.0, 0.005, 0.06)
    web(rng, (4.4, 1.4, -0.6), 10, 0.24, 2.4, 0.0045, 0.05, 0.4)             # вторая паутинка, глубже и в размытии
    for _ in range(12):                                                    # тёплые размытые пятна света на заднем плане (боке)
        sphere((rng.uniform(-6, 13), rng.uniform(13.0, 15.0), rng.uniform(-5.0, 6.5)), rng.uniform(1.0, 2.6), principled('bk', (0.95, 0.88, 0.78), 0.5, **{'Emission Color': (1, 0.93, 0.82), 'Emission Strength': rng.uniform(0.04, 0.16)}), seg=32, rings=16)
    area_light((-1.5, -4.0, 3.5), (2.0, 0, 0.7), 2.4, 160, (1, 0.95, 0.88), shape='DISK')
    area_light((6.0, -3.0, 2.0), (2.0, 0, 0.7), 3.0, 70, (0.95, 0.97, 1.0), shape='DISK')
    area_light((2.0, 3.8, 3.0), (2.0, 0, 0.7), 3.0, 140, (1, 0.98, 0.94), shape='DISK')
    camera((0.8, -5.4, 1.1), (1.6, 0, 0.5), lens=70, fstop=1.1, focus=(2.0, 0.0, 0.7))
    save_and_render()
