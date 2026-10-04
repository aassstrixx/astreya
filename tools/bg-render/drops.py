"""03 · капли: россыпь круглых прозрачных капель разного размера на гладкой молочной поверхности — понятный образ «роса / сыворотка», блики окна на каждой капле, мягкая глубина резкости (Cycles)."""
from common import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.7, bounces=24)
    world((0.62, 0.60, 0.58), 1.0, top=(0.96, 0.94, 0.91))
    surf = principled('surf', (0.66, 0.63, 0.59), 0.62, **{'Specular IOR Level': 0.25})
    plane_backdrop(surf, (60, 60), loc=(0, 0, 0))
    liq = glass('liq', (1, 1, 1), 1.33, 0.0, shadow=0.72)
    # капли: больше справа (там пустое место нужно слева под текст), мелких много, крупных несколько
    drops = []
    def free(x, y, r): return all(math.hypot(x - a, y - b) > (r + c) * 1.05 for a, b, c in drops)
    tries = 0
    while len(drops) < 70 and tries < 4000:
        tries += 1
        big = rng.random() < 0.07; r = (rng.uniform(0.16, 0.32) if big else abs(rng.normal(0.045, 0.035)) + 0.012)
        x = rng.normal(1.5, 1.0); y = rng.normal(0.2, 0.75)
        if x < -0.7: continue
        if free(x, y, r): drops.append((x, y, r))
    for x, y, r in drops: sphere((x, y, 0.0), r, liq, scale=(1, 1, rng.uniform(0.62, 0.8)), seg=64 if r < 0.1 else 112, rings=32 if r < 0.1 else 56)
    area_light((-1.6, -3.2, 3.0), (1.0, 0, 0), 3.0, 210, (1, 0.97, 0.92), size_y=2.0)        # окно: прямоугольное отражение на каплях
    area_light((4.5, 1.5, 2.5), (1.0, 0, 0), 3.0, 40, (0.93, 0.96, 1.0), shape='DISK')
    area_light((1.0, 4.0, 1.0), (1.0, 0, 0), 1.0, 70, (1, 1, 1), size_y=6.0)
    camera((0.2, -3.6, 1.7), (1.2, 0.1, 0.0), lens=65, fstop=2.2, focus=(1.0, 0.0, 0.0))
    save_and_render()
