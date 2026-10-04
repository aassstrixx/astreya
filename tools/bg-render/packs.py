"""Косметическая упаковка для сцен «продукция»: баночка с крышкой, флакон-капельница, флакон с помпой, туба — тела вращения (lathe) в тонах сайта.
Без этикеток и названий: образ «профессиональная косметика», а не конкретный товар."""
from common import *

def mats():
    ceramic = principled('ceramic', (0.93, 0.91, 0.87), 0.38, **{'Coat Weight': 0.35, 'Coat Roughness': 0.12, 'Specular IOR Level': 0.5})
    frost = principled('frost', (0.96, 0.95, 0.93), 0.42, **{'Transmission Weight': 0.8, 'IOR': 1.45, 'Specular IOR Level': 0.5})
    clear = glass('clear', (0.99, 0.99, 0.98), 1.45, 0.0, shadow=0.8)
    metal = principled('champagne', (0.86, 0.76, 0.60), 0.28, **{'Metallic': 1.0})
    rubber = principled('rubber', (0.92, 0.90, 0.87), 0.55, **{'Specular IOR Level': 0.3})
    serum = principled('serum', (0.93, 0.87, 0.74), 0.25, **{'Coat Weight': 0.3})          # сыворотка за матовым стеклом: гладкая, без бликов-каустик
    return dict(ceramic=ceramic, frost=frost, clear=clear, metal=metal, rubber=rubber, serum=serum)

def rounded_profile(R, H, r=0.03, n=6):
    """Контур цилиндра со скруглёнными кромками (r, z) — замкнутый на оси, для lathe(closed=True).
    Верх — очень пологий купол (а не плоская плоскость): иначе при сглаженных нормалях на широкой крышке появляется «кратер» с ямкой по центру."""
    pts = [(0.003, 0.0), (R - r, 0.0)]
    for a in np.linspace(0, math.pi / 2, n): pts.append((R - r + r * math.sin(a), r - r * math.cos(a)))
    pts += [(R, H - r)]
    for a in np.linspace(0, math.pi / 2, n)[1:]: pts.append((R - r + r * math.cos(a), H - r + r * math.sin(a)))
    top = max(R - r, 0.01); dome = 0.05 * top
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

def chaikin(pts, it=3):
    """Срезание углов ломаной (концы остаются на месте): плечо флакона и купол груши получаются гладкими, а не гранёными."""
    for _ in range(it):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        pts = out + [pts[-1]]
    return pts

def dropper(M, loc, R=0.26, H=0.85, rot=(0, 0, 0), liquid=0.55):
    """Флакон-капельница: матовое стекло, шея, кольцо, резиновая груша; сыворотка внутри."""
    body = [(0.003, 0.0), (R - 0.03, 0.0), (R, 0.03), (R, H * 0.70)] + chaikin([(R, H * 0.70), (R, H * 0.76), (R * 0.80, H * 0.86), (R * 0.40, H * 0.93), (R * 0.40, H * 0.97)], 3)[1:] + [(R * 0.40, H), (0.003, H)]
    parts = [lathe(body, M['frost'], seg=96, closed=True, name='bottle')]
    parts.append(lathe([(0.003, 0.02), (R - 0.05, 0.02), (R - 0.045, H * liquid), (0.003, H * liquid)], M['serum'], seg=64, closed=True, name='serum'))
    parts.append(lathe(rounded_profile(R * 0.46, 0.09, 0.012, 3), M['metal'], loc=(0, 0, H), seg=64, closed=True, name='collar'))
    bulb = [(0.003, 0.0), (R * 0.40, 0.0), (R * 0.44, 0.06), (R * 0.44, 0.30)] + [(R * 0.44 * math.cos(t), 0.30 + 0.26 * math.sin(t)) for t in [i * math.pi / 2 / 14 for i in range(1, 14)]] + [(0.003, 0.56)]
    parts.append(lathe(bulb, M['rubber'], loc=(0, 0, H + 0.09), seg=64, closed=True, name='bulb'))
    root = bpy.data.objects.new('dropper_root', None); bpy.context.collection.objects.link(root)
    for p in parts: p.parent = root
    return put(root, loc, rot)

def pump(M, loc, R=0.28, H=1.0, rot=(0, 0, 0)):
    """Флакон с помпой: гладкий цилиндр, кольцо, стойка помпы, головка и носик."""
    parts = [lathe(rounded_profile(R, H, 0.05), M['ceramic'], seg=96, closed=True, name='body')]
    parts.append(lathe(rounded_profile(R * 0.62, 0.07, 0.015, 3), M['metal'], loc=(0, 0, H), seg=64, closed=True, name='collar'))
    parts.append(lathe([(0.003, 0.0), (0.04, 0.0), (0.04, 0.14), (0.003, 0.14)], M['metal'], loc=(0, 0, H + 0.07), seg=32, closed=True, name='stem'))
    head = lathe(rounded_profile(0.11, 0.07, 0.02, 3), M['ceramic'], loc=(0, 0, H + 0.21), seg=48, closed=True, name='head')
    parts.append(head)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.30, location=(0.15, 0, H + 0.27), rotation=(0, math.pi / 2, 0), vertices=32)
    nz = bpy.context.active_object; bpy.ops.object.shade_smooth(); nz.data.materials.append(M['ceramic']); parts.append(nz)
    root = bpy.data.objects.new('pump_root', None); bpy.context.collection.objects.link(root)
    for p in parts: p.parent = root
    nz.parent = root
    return put(root, loc, rot)

def tube(M, loc, R=0.22, L=1.1, rot=(0, 0, 0), flat=0.42):
    """Туба: сплюснутое тело с плавным плечом, крышка-колпачок (шампань) и запаянный плоский край."""
    body = [(0.003, 0.0), (R * 0.78, 0.0), (R, 0.05), (R, L * 0.84), (R * 0.97, L), (0.003, L)]
    parts = [lathe(body, M['ceramic'], seg=96, closed=True, name='tube')]
    parts[0].scale = (1, flat, 1)
    cap = lathe(rounded_profile(R * 0.62, 0.24, 0.025), M['metal'], loc=(0, 0, -0.24), seg=64, closed=True, name='cap')
    parts.append(cap)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, L + 0.05)); cr = bpy.context.active_object; cr.scale = (R * 1.0, 0.014, 0.10); cr.data.materials.append(M['ceramic'])      # запаянный плоский край
    for k in range(5):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.0, L + 0.03 + 0.02 * k)); rb = bpy.context.active_object; rb.scale = (R * 1.02, 0.018, 0.006); rb.data.materials.append(M['ceramic']); parts.append(rb)
    parts.append(cr)
    root = bpy.data.objects.new('tube_root', None); bpy.context.collection.objects.link(root)
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
