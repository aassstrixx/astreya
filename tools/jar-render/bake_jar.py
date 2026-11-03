#!/usr/bin/env python3
"""Запекание баночки с главной в ключи пролёта (как неподвижный объект сцены) и закрытие дырки на подиуме.

В ключах пролёта на подиуме тёмная ниша под баночку (в зале её закрывает спрайт). Живой спрайт в пролёте «съезжал»: плоская картинка не повторяет
перспективу подиума. Теперь баночка — часть самой картинки ключей (как камень на фоне): в каждый ключ вставляется баночка ровно такой, как её рисует главная
(снимок холста баночки героя с этикеткой — tools/jar-render/bake_jar.py читает его из --jar), аффинно по осям баночки в камере ключа (основание — в настоящей точке
основания, ось и поперечник — по проекции), а дырка предварительно закрывается (inpaint + зерно). Глубина баночки в картах глубины — глубина её центра: при
перепроекции она едет вместе с подиумом без проскальзывания. Живая баночка в пролёте не рисуется (house.fly.bake).

    python3 bake_jar.py [--zone /tmp/zone] [--jar /tmp/zone/jarbake/hero_jar_dpr2.png --dpr 2] [--out /tmp/zone/jarbake]
Затем:  python3 apply_fly.py --cdir <out>/c --zdir <out>/z --key0 <out>/key0.png --z0 <out>/z0.png
"""
import argparse, json, math, os
import cv2
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--zone', default='/tmp/zone')
ap.add_argument('--cdir', default=None, help='цвет ключей 1…K-1 (по умолчанию <zone>/fk2/cg)')
ap.add_argument('--jar', default='/tmp/zone/jarbake/hero_jar_dpr2.png')
ap.add_argument('--dpr', type=float, default=2.0)
ap.add_argument('--out', default='/tmp/zone/jarbake')
ap.add_argument('--only', default=None, help='номера ключей через запятую (проверка)')
ap.add_argument('--ropen', type=float, default=1.12, help='радиус закрываемой ниши в радиусах баночки')
ap.add_argument('--mobile', action='store_true', help='телефон: портретный кадр 900×1600; снимок баночки — экран 390×844 (cover: кадр растянут по высоте, края обрезаны); дорожка/ключи — из --zone/--fly (см. phone_fly_render.sh)')
ap.add_argument('--fly', default=None, help='телефон: папка с cam-f.json, sched.json, c/, z/ (по умолчанию <zone>)')
ap.add_argument('--vw', type=float, default=390.0); ap.add_argument('--vh', type=float, default=844.0)
ap.add_argument('--hero', default=None, help='цвет ключа 0: PNG последнего кадра зала')
ap.add_argument('--hero-z', default=None, help='глубина ключа 0 (закодированная RG)')
a = ap.parse_args()
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HOUSE = json.load(open(os.path.join(ROOT, 'data', 'redesign.json'), encoding='utf8'))['house']['fly']
F = HOUSE['F']
MOB = a.mobile
FLYD = a.fly or a.zone
if MOB:
    cam = json.load(open(os.path.join(FLYD, 'cam-f.json')))
    ws = json.load(open(os.path.join(FLYD, 'sched.json')))['ws']; K = len(ws)
    cdir = a.cdir or os.path.join(FLYD, 'c')
    W, H = 900, 1600
    SC = a.vh / H; CROPX = (W * SC - a.vw) / 2.0                                  # css-пикселей на пиксель кадра; сколько css-пикселей кадра срезано слева (cover)
else:
    cam = json.load(open(os.path.join(ROOT, 'assets', 'house-hall', 'cam-f.json')))
    ws = json.load(open(os.path.join(a.zone, 'fk2', 'sched2.json')))['ws']; K = len(ws)
    cdir = a.cdir or os.path.join(a.zone, 'fk2', 'cg')
    W, H = 1920, 1080
    SC = 1.0; CROPX = 0.0
PP, POS, TGT, UP, LENS, JAR = cam['p'], cam['pos'], cam['tgt'], cam['up'], cam['lens'], cam['jar']
cz, scale = cam['jarCenterZ'], cam['jarScale']; R = 3.65 * scale
dmin, dmax = cam.get('dispRange', [0.08, 4.0])

sub = lambda x, y: [x[i] - y[i] for i in range(3)]
dot = lambda x, y: sum(p * q for p, q in zip(x, y))
cross = lambda x, y: [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]]
def nrm(v):
    l = math.sqrt(dot(v, v)) or 1.0
    return [q / l for q in v]
def at(p):
    x = min(max(p, 0), 1) * (len(PP) - 1); i = min(len(PP) - 2, int(x)); t = x - i
    L = lambda A: [A[i][k] + (A[i+1][k] - A[i][k]) * t for k in range(3)]
    pos, tgt, up, jar = L(POS), L(TGT), L(UP), L(JAR); lens = LENS[i] + (LENS[i+1] - LENS[i]) * t
    f = nrm(sub(tgt, pos)); r = nrm(cross(f, up)); u = cross(r, f)
    return dict(pos=pos, f=f, r=r, u=u, lens=lens, jar=jar)
def proj(c, P):
    q = sub(P, c['pos']); zt = dot(q, c['f']); xt = dot(q, c['r']); yt = dot(q, c['u']); S = 36.0 / c['lens'] * zt
    if MOB:                                                                  # портрет: ширина кадра в долях высоты 9/16
        return ((0.5 + xt / (S * W / H)) * W, (0.5 - yt / S) * H, zt)
    return ((0.5 + xt / S) * W, (0.5 - yt / (S * H / W)) * H, zt)         # px кадра 1920×1080 и глубина вдоль оси
def axes(c):
    j = c['jar']; dx, dy = c['pos'][0] - j[0], c['pos'][1] - j[1]; d = math.hypot(dx, dy) or 1.0; sx, sy = -dy / d, dx / d
    B = proj(c, [j[0], j[1], j[2]]); T = proj(c, [j[0], j[1], j[2] + 2 * cz])
    Lp = proj(c, [j[0] - R * sx, j[1] - R * sy, j[2] + cz]); Rp = proj(c, [j[0] + R * sx, j[1] + R * sy, j[2] + cz])
    return dict(b=np.array(B[:2]), a=np.array([T[0] - B[0], T[1] - B[1]]), w=np.array([Rp[0] - Lp[0], Rp[1] - Lp[1]]), zc=proj(c, [j[0], j[1], j[2] + cz])[2])

# снимок баночки героя (RGBA; прозрачный фон), координаты кадра ×dpr
spr = np.asarray(Image.open(a.jar).convert('RGBA'), dtype=np.float32) / 255.0
ys, xs = np.where(spr[..., 3] > 0.01); x0, x1, y0, y1 = max(0, xs.min() - 6), xs.max() + 7, max(0, ys.min() - 6), ys.max() + 7
spr = spr[y0:y1, x0:x1]
rgb, al = spr[..., :3], spr[..., 3:4]
if (rgb <= al + 1e-3).all(): prem = rgb.copy()                       # уже умножено на альфу
else: prem = rgb * al
sp = np.dstack([prem, al])                                           # премультиплицированный RGBA
ox, oy = (x0 / a.dpr + CROPX) / SC, (y0 / a.dpr) / SC                  # левый верх снимка в px кадра (телефон: снимок — экран, кадр растянут cover)
PXK = a.dpr * SC                                                       # пикселей снимка на пиксель кадра

KC = axes(at(0.0))                                                   # камера главной (ключ 0 = p 0)
Minv = np.linalg.inv(np.column_stack([KC['a'], KC['w']]))

def place(k):
    C = axes(at(ws[k] * F)); T = np.column_stack([C['a'], C['w']]) @ Minv            # линейная часть K → C
    sc = max(np.hypot(*T[:, 0]), np.hypot(*T[:, 1])) / PXK
    return C, T, sc

def warp(k):
    C, T, sc = place(k)
    f = min(1.0, max(0.2, sc))                                       # заранее уменьшаем до нужного масштаба (площадью), затем дозаворачиваем
    small = cv2.resize(sp, None, fx=f, fy=f, interpolation=cv2.INTER_AREA if f < 1 else cv2.INTER_LINEAR)
    # точка малого снимка (xs, ys) → кадр K: (xs/f/dpr + ox, ys/f/dpr + oy) → кадр C: B_C + T·(p − B_K)
    Mq = np.array([[1.0 / (f * PXK), 0, ox], [0, 1.0 / (f * PXK), oy]])
    Aff = np.hstack([T @ Mq[:, :2], (C['b'] + T @ (Mq[:, 2] - KC['b'])).reshape(2, 1)])
    out = cv2.warpAffine(small, Aff.astype(np.float64), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    return out, C

def plug(img, dep16, k):
    """закрывает нишу: круг радиуса ropen·R на уровне основания → эллипс в кадре; цвет — inpaint + зерно окрестности, глубина — inpaint"""
    c = at(ws[k] * F); j = c['jar']
    pts = [proj(c, [j[0] + a.ropen * R * math.cos(t), j[1] + a.ropen * R * math.sin(t), j[2]])[:2] for t in np.linspace(0, 2 * math.pi, 72, endpoint=False)]
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.round(np.array(pts)).astype(np.int32)], 255)
    md = cv2.dilate(m, np.ones((5, 5), np.uint8))
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    fill = cv2.inpaint(bgr, md, 6, cv2.INPAINT_TELEA)
    fill = cv2.cvtColor(fill, cv2.COLOR_BGR2RGB).astype(np.float32)
    # зерно: стандартное отклонение высокочастотной части кольца вокруг ниши
    ring = cv2.dilate(m, np.ones((41, 41), np.uint8)) & ~cv2.dilate(m, np.ones((9, 9), np.uint8))
    g = img.astype(np.float32); hp = g - cv2.GaussianBlur(g, (0, 0), 2.0)
    sd = hp[ring > 0].std(axis=0) if (ring > 0).any() else np.array([2, 2, 2])
    rng = np.random.default_rng(k)
    noise = rng.normal(0, 1, (H, W, 1)).astype(np.float32) * sd * 0.85
    soft = cv2.GaussianBlur((md > 0).astype(np.float32), (0, 0), 1.5)[..., None]
    out = g * (1 - soft) + (fill + noise) * soft
    # глубина (16 бит, масштабируем маску на 960×540)
    dm = cv2.resize(md, (dep16.shape[1], dep16.shape[0]), interpolation=cv2.INTER_NEAREST)
    dep = cv2.inpaint(dep16, dm, 4, cv2.INPAINT_TELEA)
    return np.clip(out, 0, 255).astype(np.uint8), dep

def enc_depth(v16):
    return np.dstack([(v16 >> 8).astype(np.uint8), (v16 & 255).astype(np.uint8), np.zeros(v16.shape, np.uint8)])
def dec_depth(rgb):
    return (rgb[..., 0].astype(np.uint16) << 8) | rgb[..., 1].astype(np.uint16)

os.makedirs(os.path.join(a.out, 'c'), exist_ok=True); os.makedirs(os.path.join(a.out, 'z'), exist_ok=True)
only = set(int(x) for x in a.only.split(',')) if a.only else None
srcz = lambda k: [os.path.join(a.zone, 'fk2', d, '%03d.png' % o) for d, o in (('z', k),)]
old = [] if MOB else json.load(open(os.path.join(a.zone, 'fk2', 'sched.json')))['ws']
def zsrc(k):
    if MOB: return os.path.join(FLYD, 'z', '%03d.png' % k)
    for o, w0 in enumerate(old):
        if abs(w0 - ws[k]) < 2e-5: return os.path.join(a.zone, 'fk2', 'z', '%03d.png' % o)
    return os.path.join(a.zone, 'fk2', 'z2', '%03d.png' % k)
for k in range(K):
    if only is not None and k not in only: continue
    hero = a.hero or os.path.join(a.zone, 'bg_d_final3', '059.png')
    col = np.asarray(Image.open(hero if k == 0 else os.path.join(cdir, '%03d.png' % k)).convert('RGB'))
    zp = (a.hero_z or os.path.join(ROOT, 'assets', 'house-hall', 'zd', '059.webp')) if k == 0 else zsrc(k)
    dep = dec_depth(np.asarray(Image.open(zp).convert('RGB')))
    col, dep = plug(col, dep, k)
    jar, C = warp(k)
    al = jar[..., 3:4]
    outc = np.clip(jar[..., :3] * 255.0 + col.astype(np.float32) * (1 - al), 0, 255).astype(np.uint8)
    # глубина баночки: диспаритет центра (1/z) → 16 бит; маска — альфа > 0,5 (на сетке карты глубины)
    disp = 1.0 / C['zc']; v = int(round(np.clip((disp - dmin) / (dmax - dmin), 0, 1) * 65535))
    am = cv2.resize((al[..., 0] > 0.5).astype(np.uint8), (dep.shape[1], dep.shape[0]), interpolation=cv2.INTER_AREA) > 0
    dep = dep.copy(); dep[am] = v
    name = 'key0.png' if k == 0 else 'c/%03d.png' % k
    Image.fromarray(outc).save(os.path.join(a.out, name))
    zname = 'z0.png' if k == 0 else 'z/%03d.png' % k
    Image.fromarray(enc_depth(dep)).save(os.path.join(a.out, zname))
    print('ключ', k, 'масштаб %.2f' % place(k)[2], 'база', np.round(C['b']).astype(int), 'z=%.3f' % C['zc'])
