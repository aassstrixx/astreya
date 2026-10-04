"""05 · капля / пипетка: стеклянная пипетка с висящей каплей над широкой лужицей сыворотки (Cycles, тела вращения)."""
from common import *

def pipette_profile(wall=0.007):
    """Контур стенки (r, z) в системе, где остриё в нуле, ось вверх: конус → плечо → цилиндр."""
    outer = [(0.016, 0.0), (0.020, 0.12), (0.027, 0.34), (0.040, 0.58), (0.052, 0.80), (0.056, 1.10), (0.056, 1.90)]
    inner = [(max(r - wall, 0.004), z) for r, z in outer]
    return outer + inner[::-1]

def drop_profile(R=0.040, h=0.17, n=40):
    """Висящая капля: шейка у острия, шар внизу (r, z), z вниз от острия."""
    pts = []
    for i in range(n + 1):
        t = i / n; z = -h * t
        r = (0.012 + (R - 0.012) * math.sin(min(t * 1.25, 1.0) * math.pi / 2) ** 1.4) * math.sqrt(max(1 - ((t - 0.62) / 0.38) ** 2, 0)) if t > 0.62 else 0.012 + (R - 0.012) * (t / 0.62) ** 2.2
        pts.append((r, z))
    pts.append((0.0, -h * 1.0)); return [(max(r, 0.0), z) for r, z in pts]

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.15, bounces=48)
    world((0.42, 0.40, 0.37), 1.0, top=(0.95, 0.92, 0.88))
    bg = principled('bg', (0.70, 0.66, 0.61), 0.5); plane_backdrop(bg, (14, 10), loc=(0, 0, 0))
    liq = glass('liq', (1, 1, 1), 1.33, 0.0, shadow=0.72)
    gl = glass('gl', (0.98, 0.99, 0.99), 1.5, 0.0, shadow=0.8)
    # лужица: сплюснутое тело с мягким краем + линза-капля в ней
    prof = [(0.0, 0.0)] + [(1.1 * math.sin(a), 0.045 * (1 - (a / (math.pi / 2)) ** 6) ** 0.5 + 0.004) for a in np.linspace(0.0, math.pi / 2, 40)] + [(1.1, 0.0)]
    prof = [(r * 0.72, z) for r, z in prof]
    lathe(prof, liq, loc=(0.05, -0.72, 0.0), seg=160, closed=False, name='pool')
    sphere((0.28, -0.62, 0.0), 0.15, liq, scale=(1, 1, 0.42), seg=96, rings=48)
    # пипетка: наклонена, остриё над лужицей справа-сверху
    tilt = math.radians(28)
    tip = Vector((0.5, 0.0, 1.0)); K = 2.0
    po = lathe(pipette_profile(), gl, loc=tuple(tip), rot=(0, tilt, 0), seg=96, closed=True, name='pipette'); po.scale = (K, K, K)
    dr = lathe(drop_profile(), liq, loc=tuple(tip), rot=(0, 0, 0), seg=64, closed=False, name='drop'); dr.scale = (K, K, K)
    area_light((-2.6, -1.6, 3.0), (0, 0, 0), 2.2, 70, (1, 0.96, 0.9), size_y=2.6)
    area_light((3.2, 1.5, 2.4), (0, 0, 0), 3.0, 30, (0.95, 0.97, 1.0), size_y=4.0)
    area_light((0.5, 3.0, 1.1), (0, 0, 0), 0.6, 28, (1, 1, 1), size_y=4.0)
    camera((-0.45, -2.0, 3.6), (-0.2, -0.1, 0.3), lens=50, fstop=4.5, focus=(0.5, 0.0, 0.9))   # содержимое справа, слева чистое место под текст
    save_and_render()
