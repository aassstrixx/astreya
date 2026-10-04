"""03 · капли активных компонентов: крупная прозрачная капля у края кадра, тонкая стеклянная плёнка с чётким краем и россыпь мелких капель и пузырьков (Cycles)."""
from common import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.6, bounces=32)
    world((0.52, 0.52, 0.54), 1.0, top=(0.93, 0.92, 0.90))
    bg = principled('bg', (0.66, 0.63, 0.59), 0.88, **{'Specular IOR Level': 0.06}); plane_backdrop(bg, (60, 60), loc=(0, 0, 0))
    liq = glass('liq', (1, 1, 1), 1.33, 0.0, shadow=0.72)
    film = glass('film', (1, 1, 1), 1.12, 0.0, shadow=0.9)
    # тонкая плёнка: очень плоский шар — виден только чёткий край-дуга и преломление
    sphere((3.2, 3.8, 0.03), 4.0, film, scale=(1, 1, 0.016), seg=192, rings=48)
    # крупная капля у правого верхнего угла (обрезана кадром)
    sphere((2.55, 1.15, 0.95), 1.05, liq, seg=128, rings=64)
    # линза-капля поменьше на плёнке и мелкие капли вокруг
    sphere((0.2, 1.1, 0.0), 0.3, liq, scale=(1, 1, 0.55), seg=96, rings=48)
    sphere((1.05, 0.15, 0.0), 0.11, liq, scale=(1, 1, 0.7), seg=64, rings=32)
    for _ in range(46):
        x = rng.normal(1.6, 1.3); y = rng.normal(0.9, 0.9); r = abs(rng.normal(0.035, 0.03)) + 0.012
        sphere((x, y, 0.0), r, liq, scale=(1, 1, 0.75), seg=40, rings=20)
    for _ in range(16):                                                         # пузырьки в воздухе
        sphere((rng.normal(2.0, 1.0), rng.normal(1.2, 0.8), rng.uniform(0.2, 1.4)), abs(rng.normal(0.03, 0.02)) + 0.012, liq, seg=40, rings=20)
    area_light((-2.6, -1.8, 3.2), (1.5, 1.0, 0), 2.2, 70, (1, 0.96, 0.9), shape='DISK')
    area_light((4.5, 1.5, 2.8), (1.5, 1.0, 0), 3.0, 45, (0.93, 0.96, 1.0), shape='DISK')
    area_light((0.8, 4.0, 1.2), (1.5, 1.0, 0), 1.0, 70, (1, 1, 1), size_y=6.0)
    camera((0.2, -1.4, 4.6), (1.4, 0.8, 0.2), lens=50, fstop=3.2, focus=(2.0, 1.0, 0.5))
    save_and_render()
