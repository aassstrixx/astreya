"""12 · ампулы: стеклянные ампулы с сывороткой, лежащие веером на молочной поверхности — лабораторная эстетика (Cycles, полое стекло + жидкость)."""
from common import *

def ampoule_profiles(L=1.0, R=0.095, wall=0.011):
    """Стенка ампулы одним замкнутым контуром (внешняя сторона вверх, внутренняя обратно): цилиндр → плечо → тонкая запаянная шейка."""
    e = 0.003                                     # вместо r = 0 — крошечное отверстие на оси: нет вырожденных граней и «звезды» в центре
    outer = [(e, 0.0), (R * 0.82, 0.0), (R, 0.022), (R, 0.60 * L), (R * 0.80, 0.69 * L), (R * 0.42, 0.79 * L), (R * 0.27, 0.93 * L), (R * 0.20, 1.0 * L), (e, 1.035 * L)]
    inner = [(max(r - wall, e), z + (wall if z == 0 else -wall)) for r, z in outer[:-1]]
    loop = outer + inner[::-1]                    # внешний контур вверх, внутренний — обратно, замкнутый на оси
    liquid = [(e, 0.016), (R - wall - 0.004, 0.016), (R - wall - 0.004, 0.52 * L), (R * 0.7, 0.56 * L), (e, 0.56 * L)]
    return loop, liquid

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.35, bounces=48)
    world((0.56, 0.53, 0.50), 1.0, top=(0.93, 0.91, 0.87))
    bg = principled('bg', (0.74, 0.70, 0.65), 0.9, **{'Specular IOR Level': 0.08}); plane_backdrop(bg, (60, 60), loc=(0, 0, 0))
    gl = glass('gl', (0.99, 1.0, 1.0), 1.5, 0.0, shadow=0.78)
    liq = glass('liq', (1.0, 0.96, 0.88), 1.34, 0.0, shadow=0.62)
    loop, liquid = ampoule_profiles()
    # (x, y, угол в плане, длина-масштаб, стоит ли)
    items = [(0.35, -0.55, 0.35, 1.0, False), (0.55, 0.05, 0.05, 1.1, False), (0.8, 0.62, -0.30, 0.95, False), (1.45, -0.85, 0.55, 1.05, False),
             (1.75, -0.1, 0.20, 1.15, False), (2.05, 0.7, -0.15, 1.0, False), (2.6, -0.4, 0.8, 0.9, False), (1.15, 0.2, 0.0, 1.0, True)]
    for x, y, yaw, k, stand in items:
        for prof, mat, name in ((loop, gl, 'shell'), (liquid, liq, 'liq')):
            if stand: ob = lathe(prof, mat, loc=(x, y, 0.0), rot=(0, 0, 0), seg=64, closed=True, name=name)
            else: ob = lathe(prof, mat, loc=(x, y, 0.095 * k), rot=(0, math.pi / 2, yaw), seg=64, closed=True, name=name)
            ob.scale = (k, k, k)
    area_light((-2.4, -2.2, 3.2), (1.2, 0, 0.2), 2.4, 85, (1, 0.96, 0.9), shape='DISK')
    area_light((4.5, -1.5, 2.4), (1.2, 0, 0.2), 3.0, 45, (0.93, 0.96, 1.0), shape='DISK')
    area_light((1.2, 3.4, 2.2), (1.2, 0, 0.2), 3.0, 80, (1, 1, 1), shape='DISK')
    camera((-0.6, -3.6, 2.6), (1.0, 0, 0.1), lens=58, fstop=2.6, focus=(1.3, 0.0, 0.1))
    save_and_render()
