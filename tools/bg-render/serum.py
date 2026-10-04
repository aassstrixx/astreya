"""11 · сыворотки: флаконы-капельницы из матового стекла с резиновыми грушами и золотистыми кольцами, рядом капля сыворотки — «продукция» (Cycles)."""
from packs import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.35, bounces=32)
    stage()
    M = mats()
    dropper(M, (1.6, 0.1, 0.0), R=0.30, H=0.95)
    dropper(M, (2.55, -0.25, 0.0), R=0.24, H=0.75)
    dropper(M, (0.85, -0.55, 0.0), R=0.20, H=0.60)
    dropper(M, (3.3, 0.55, 0.0), R=0.22, H=0.70)
    # флакон на боку и капля сыворотки на поверхности
    dropper(M, (1.9, -1.15, 0.22), R=0.2, H=0.62, rot=(0, math.pi / 2, 0.35), liquid=0.5)
    for x, y, r in ((2.35, -0.95, 0.05), (2.5, -1.1, 0.028), (1.15, -1.05, 0.035)): sphere((x, y, 0.0), r, M['serum'], scale=(1, 1, 0.55), seg=48, rings=24)
    camera((-0.2, -6.2, 1.8), (1.3, 0.0, 0.45), lens=60, fstop=3.0, focus=(1.7, 0.1, 0.4))
    save_and_render()
