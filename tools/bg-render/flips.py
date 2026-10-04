"""15 · флаконы с откидной крышкой: белые флаконы «как для шампуня» без надписей — крышка вровень с телом, выемка под палец; два ряда разной высоты и один лежащий (Cycles)."""
from packs import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-1.1, bounces=24)
    stage()
    M = mats()
    shampoo(M, (2.2, 0.85, 0.0), R=0.31, H=1.40, body='pearlw', cap='pearlw', rot=(0, 0, 0.10))
    shampoo(M, (3.2, 0.60, 0.0), R=0.27, H=1.10, body='white', cap='white', rot=(0, 0, -0.12))
    shampoo(M, (1.35, -0.10, 0.0), R=0.36, H=1.50, body='white', cap='white', rot=(0, 0, 0.06))
    shampoo(M, (2.55, -0.45, 0.0), R=0.33, H=1.18, body='warmw', cap='warmw', rot=(0, 0, -0.30))
    shampoo(M, (3.50, -0.55, 0.0), R=0.25, H=0.82, body='satin', cap='satin', rot=(0, 0, 0.25))
    shampoo(M, (1.05, -1.55, 0.31), R=0.30, H=1.12, body='white', cap='white', rot=(0, math.pi / 2, -0.30))             # лежит
    camera((0.7, -7.6, 2.5), (2.3, 0.0, 0.62), lens=58, fstop=3.4, focus=(2.3, -0.1, 0.62))
    save_and_render()
