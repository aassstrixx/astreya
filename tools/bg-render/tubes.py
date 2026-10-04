"""12 · тубы и помпа: туба с колпачком, флакон с помпой и малая баночка — набор «ежедневный уход» (Cycles)."""
from packs import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.35, bounces=24)
    stage()
    M = mats()
    pump(M, (2.1, 0.15, 0.0), R=0.30, H=1.05)
    tube(M, (1.2, -0.45, 0.24), L=1.15, R=0.24, rot=(0.0, 0.0, 0.55))                  # стоит на колпачке
    tube(M, (2.9, -0.7, 0.10), L=1.0, R=0.22, rot=(0, math.pi / 2, -0.35))              # лежит
    jar(M, (3.0, 0.95, 0.0), R=0.30, H=0.24, lid=0.12)
    camera((-0.2, -6.2, 1.9), (1.3, 0.1, 0.5), lens=60, fstop=3.0, focus=(1.8, 0.0, 0.5))
    save_and_render()
