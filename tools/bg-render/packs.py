"""Косметическая упаковка для сцен «продукция»: баночка с крышкой, белый флакон «как для шампуня» с откидной крышкой — тела вращения (lathe) в тонах сайта.
Без этикеток и названий: образ «профессиональная косметика», а не конкретный товар."""
from common import *

def mats():
    ceramic = principled('ceramic', (0.93, 0.91, 0.87), 0.38, **{'Coat Weight': 0.35, 'Coat Roughness': 0.12, 'Specular IOR Level': 0.5})
    frost = principled('frost', (0.96, 0.95, 0.93), 0.42, **{'Transmission Weight': 0.8, 'IOR': 1.45, 'Specular IOR Level': 0.5})
    clear = glass('clear', (0.99, 0.99, 0.98), 1.45, 0.0, shadow=0.8)
    metal = principled('champagne', (0.86, 0.76, 0.60), 0.28, **{'Metallic': 1.0})
    rubber = principled('rubber', (0.92, 0.90, 0.87), 0.55, **{'Specular IOR Level': 0.3})
    cl = lambda n, c, r: principled(n, c, r, **{'Coat Weight': 0.45, 'Coat Roughness': 0.08, 'Specular IOR Level': 0.5})
    white = cl('white', (0.97, 0.97, 0.96), 0.26); pearlw = cl('pearlw', (0.90, 0.92, 0.95), 0.30); warmw = cl('warmw', (0.96, 0.93, 0.88), 0.32)
    satin = principled('satin', (0.95, 0.95, 0.94), 0.52, **{'Specular IOR Level': 0.4})
    return dict(ceramic=ceramic, frost=frost, clear=clear, metal=metal, rubber=rubber, white=white, pearlw=pearlw, warmw=warmw, satin=satin)

def rounded_profile(R, H, r=0.03, n=6, bottom_dome=False):
    """Контур цилиндра со скруглёнными кромками (r, z) — замкнутый на оси, для lathe(closed=True).
    Верх — очень пологий купол (а не плоская плоскость): иначе при сглаженных нормалях на широкой крышке появляется «кратер» с ямкой по центру.
    bottom_dome=True — такой же купол снизу (для колпачков, которые видно с торца)."""
    top = max(R - r, 0.01); dome = 0.05 * top
    pts = []
    if bottom_dome: pts += [(0.003, -dome)] + [(max(top * k, 0.003), -dome * (1 - k * k)) for k in np.linspace(0, 1, 9)[1:-1][::-1][::-1]]
    else: pts += [(0.003, 0.0)]
    pts += [(R - r, 0.0)]
    for a in np.linspace(0, math.pi / 2, n): pts.append((R - r + r * math.sin(a), r - r * math.cos(a)))
    pts += [(R, H - r)]
    for a in np.linspace(0, math.pi / 2, n)[1:]: pts.append((R - r + r * math.cos(a), H - r + r * math.sin(a)))
    for k in np.linspace(1, 0, 9)[1:]: pts.append((max(top * k, 0.003), H + dome * (1 - k * k)))
    return pts

def put(ob, loc, rot=(0, 0, 0), scale=1.0):
    ob.location = loc; ob.rotation_euler = rot; ob.scale = (scale, scale, scale) if np.isscalar(scale) else scale
    return ob

def jar(M, loc, R=0.5, H=0.42, lid=0.16, rot=(0, 0, 0), body='ceramic', ring=True):
    """Баночка с крышкой: тело + кольцо-проставка (шампань) + крышка."""
    parts = [lathe(rounded_profile(R, H, 0.03), M[body], loc=(0, 0, 0), seg=96, closed=True, name='jar')]
    if ring: parts.append(lathe(rounded_profile(R * 1.005, 0.035, 0.012, 3), M['metal'], loc=(0, 0, H), seg=96, closed=True, name='ring'))
    parts.append(lathe(rounded_profile(R * 1.01, lid, 0.028), M['ceramic'], loc=(0, 0, H + (0.035 if ring else 0)), seg=96, closed=True, name='lid'))
    for p in parts: p.parent = None
    root = bpy.data.objects.new('jar_root', None); bpy.context.collection.objects.link(root)
    for p in parts: p.parent = root
    return put(root, loc, rot)

def shampoo(M, loc, R=0.34, H=1.45, rot=(0, 0, 0), flat=0.52, body='white', cap='white'):
    """Белый флакон «как для шампуня» без надписей: овальное сечение (в плане сплюснут), тело чуть сужается книзу, закруглённые нижние кромки.
    Широкая крышка с откидным клапаном вровень с телом: тонкая канавка на стыке и выемка-«лунка» под большой палец спереди сверху. Дозаторов нет."""
    dome = 0.04 * R
    def base_profile(top_r, zt):
        pts = [(0.003, dome)] + [((R * 0.88 - 0.06) * k, dome * (1 - k * k)) for k in np.linspace(0, 1, 7)[1:-1]] + [(R * 0.88 - 0.06, 0.0)]
        pts += [(R * 0.88 - 0.06 + 0.06 * math.sin(a), 0.06 - 0.06 * math.cos(a)) for a in np.linspace(0, math.pi / 2, 6)[1:]]
        pts += [(R * 0.88 + (top_r - R * 0.88) * t, 0.06 + (zt - 0.06) * t) for t in np.linspace(0, 1, 8)[1:]]            # лёгкое сужение книзу
        return pts
    hb = H * 0.86
    prof = base_profile(R, hb) + [(R * 0.975, hb), (R * 0.975, hb + 0.012), (0.003, hb + 0.012)]                 # канавка на стыке с крышкой
    bd = lathe(prof, M[body], seg=128, closed=True, name='shbody'); bd.scale = (1, flat, 1)
    ch = H - hb - 0.012; top = 0.045
    cprof = [(0.003, 0.0), (R * 0.985, 0.0), (R * 1.0, 0.02)] + [(R * 0.995 - top + top * math.cos(a), ch - top + top * math.sin(a)) for a in np.linspace(0, math.pi / 2, 7)]
    cprof += [((R * 0.995 - top) * k, ch + 0.008 * (1 - k * k)) for k in np.linspace(1, 0, 16)[1:]]
    cp = lathe(cprof, M[cap], loc=(0, 0, hb + 0.012), seg=128, closed=True, name='shcap')
    for v in cp.data.vertices:                                                                                  # выемка под палец: на передней кромке верха крышки
        x, y, z = v.co.x, v.co.y, v.co.z
        if z > ch - 0.02 and y < 0:
            w = math.exp(-(x / (0.34 * R)) ** 2); f = np.clip((-y - 0.10 * R) / (0.75 * R), 0, 1); f = f * f * (3 - 2 * f)
            v.co.z -= 0.062 * w * f
    cp.scale = (1, flat, 1)
    parts = [bd, cp]
    root = bpy.data.objects.new('shampoo_root', None); bpy.context.collection.objects.link(root)
    for p in parts: p.parent = root
    return put(root, loc, rot)

def stage(exposure=-0.4, bounces=24):
    """Общий свет и поверхность: молочная полуглянцевая плоскость (мягкие отражения упаковки), окно слева, холодная заливка справа."""
    world((0.60, 0.58, 0.55), 1.0, top=(0.95, 0.93, 0.90))
    surf = principled('surf', (0.80, 0.77, 0.73), 0.40, **{'Specular IOR Level': 0.35})
    plane_backdrop(surf, (80, 80), loc=(0, 0, 0))
    plane_backdrop(surf, (80, 30), loc=(0, 9.0, 0), rot=(math.pi / 2, 0, 0))          # задняя стена: горизонт не виден, фон — мягкий градиент
    area_light((-2.8, -2.4, 3.2), (1.4, 0, 0.4), 3.4, 230, (1, 0.97, 0.92), size_y=2.4)
    area_light((5.0, -1.0, 2.4), (1.4, 0, 0.4), 3.0, 55, (0.93, 0.96, 1.0), shape='DISK')
    area_light((1.0, 4.0, 2.0), (1.4, 0, 0.4), 3.0, 90, (1, 1, 1), shape='DISK')
