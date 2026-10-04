"""14 · флаконы для шампуня: высокие белые флаконы без надписей (пропорции — как у обычного шампуня: вытянутые, крышка вровень с телом) — ряд на переднем плане, три в глубине, один лежит (Cycles)."""
from packs import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-1.1, bounces=24)
    stage()
    M = mats()
    shampoo(M, (1.45, -0.40, 0.0), R=0.30, H=1.75, body='white', cap='white', rot=(0, 0, 0.05))
    shampoo(M, (2.30, -0.55, 0.0), R=0.27, H=1.40, body='pearlw', cap='pearlw', rot=(0, 0, -0.18))
    shampoo(M, (3.05, -0.30, 0.0), R=0.31, H=1.55, body='warmw', cap='warmw', rot=(0, 0, 0.14))
    shampoo(M, (1.95, 0.70, 0.0), R=0.26, H=1.20, body='satin', cap='satin', rot=(0, 0, 0.22))
    shampoo(M, (2.85, 0.95, 0.0), R=0.29, H=1.30, body='white', cap='white', rot=(0, 0, -0.10))
    shampoo(M, (3.85, 0.25, 0.28), R=0.28, H=1.15, body='pearlw', cap='pearlw', rot=(0, math.pi / 2, 0.55))           # лежит
    camera((0.2, -7.4, 2.2), (2.2, 0.0, 0.75), lens=60, fstop=3.4, focus=(2.3, -0.1, 0.75))
    save_and_render()
