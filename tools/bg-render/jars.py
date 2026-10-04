"""10 · баночки: группа кремовых баночек с крышками (керамика + шампань) на молочной поверхности — «продукция», тёплый студийный свет (Cycles)."""
from packs import *

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.35, bounces=24)
    stage()
    M = mats()
    jar(M, (1.7, 0.2, 0.0), R=0.62, H=0.50, lid=0.20)
    jar(M, (2.8, -0.35, 0.0), R=0.44, H=0.36, lid=0.16)
    jar(M, (0.95, -0.55, 0.0), R=0.34, H=0.28, lid=0.13)
    jar(M, (2.3, 0.95, 0.0), R=0.30, H=0.24, lid=0.12)
    jar(M, (3.6, 0.4, 0.0), R=0.24, H=0.20, lid=0.10)
    # снятая крышка на боку у переднего края
    lidonly = lathe(rounded_profile(0.34, 0.13, 0.04), M['ceramic'], seg=96, closed=True, name='lid2'); lidonly.location = (1.55, -1.0, 0.34 * 0.0 + 0.34); lidonly.rotation_euler = (math.pi / 2, 0, 0.5)
    camera((-0.2, -6.0, 1.8), (1.3, 0.1, 0.25), lens=60, fstop=3.0, focus=(1.8, 0.2, 0.3))
    save_and_render()
