"""Живописный вид из окон каталога: горная долина с озером — отрисовка «матовой картины» (numpy + Pillow, без внешних файлов и без Blender).
Это настоящий рендер высотного поля: для каждой колонки кадра луч идёт по рельефу (алгоритм «вокселей»), цвет — по высоте / крутизне склона / шуму (луга, поля, лес, скалы, снег на дальних вершинах),
свет — боковое солнце с тенями от гор, воздушная перспектива (дымка гуще вдали и в долине), небо с кучевыми облаками на плоскости 3 км (перспектива сжимает их к горизонту),
озеро с отражением гор, кипарисы, оливы и каменный дом с терракотовой крышей — спрайтами с проверкой глубины.
Камера — как у каталога (линза 50 мм, холст 1536×1024, горизонт на y = 372): картинка кладётся в Blender на плоскость за стеной, view.py.
Свою фотографию можно подставить вместо результата: достаточно сохранить её как assets-файл с теми же размерами (CW×CH холст-px × LAND_SCALE).

  python3 landscape.py out.png            # полный размер (LAND_SCALE=2)
  LAND_SCALE=1 LAND_RATIO=1.003 python3 landscape.py preview.png   # быстрый просмотр
"""
import math, os, sys, time
import numpy as np
from PIL import Image

FX = 1536.0 * 50.0 / 36.0                                      # фокус в холст-px
HOR = 372.0                                                    # горизонт: 512 − 140 (сдвиг линзы)
CW, CH = 840, 520                                              # какая часть холста нужна (px): окна лежат в x 60…720, y 20…500
S = int(os.environ.get('LAND_SCALE', 2))
RATIO = float(os.environ.get('LAND_RATIO', 1.0007))
SEED = int(os.environ.get('LAND_SEED', 4))
WL = -28.0                                                     # уровень озера относительно глаза (м): окно на склоне над долиной
SUN = np.array([-.62, -.30, .72], np.float32); SUN /= np.linalg.norm(SUN)


# ── шум ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def _h(ix, iy, seed):
    with np.errstate(over='ignore'):
        n = (ix.astype(np.uint32) * np.uint32(374761393)) ^ (iy.astype(np.uint32) * np.uint32(668265263)) ^ np.uint32((seed * 2246822519) & 0xffffffff)
        n = (n ^ (n >> np.uint32(13))) * np.uint32(1274126177)
        n = n ^ (n >> np.uint32(16))
    return (n & np.uint32(0xffffff)).astype(np.float32) * np.float32(1.0 / 16777215.0)


def vnoise(x, y, seed):
    x0 = np.floor(x); y0 = np.floor(y); fx = (x - x0).astype(np.float32); fy = (y - y0).astype(np.float32)
    fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    ix = x0.astype(np.int64); iy = y0.astype(np.int64)
    a = _h(ix, iy, seed); b = _h(ix + 1, iy, seed); c = _h(ix, iy + 1, seed); d = _h(ix + 1, iy + 1, seed)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy


def fbm(x, y, seed, octaves=5, gain=.5, lac=2.03):
    out = 0.0; amp = 1.0; tot = 0.0; ca, sa = .8, .6
    for o in range(octaves):
        out = out + vnoise(x, y, seed + o * 17) * amp; tot += amp; amp *= gain
        x, y = (x * ca - y * sa) * lac + 11.3, (x * sa + y * ca) * lac - 7.7
    return out / tot


def ridged(x, y, seed, octaves=6, gain=.52, lac=2.1):
    out = 0.0; amp = 1.0; tot = 0.0; w = 1.0; ca, sa = .8, .6
    for o in range(octaves):
        n = 1.0 - np.abs(vnoise(x, y, seed + o * 29) * 2 - 1); n = n * n; n = n * w
        out = out + n * amp; tot += amp; amp *= gain; w = np.clip(n * 1.6, .25, 1.0)
        x, y = (x * ca - y * sa) * lac + 5.1, (x * sa + y * ca) * lac - 3.3
    return out / tot


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def lerp(a, b, t): return a + (b - a) * t


# ── рельеф (м; z — относительно глаза, y — вперёд, x — вправо) ──────────────────────────────────────────────────────────────────────────────
def terrain(x, y, oct_hi=True):
    x = x.astype(np.float32); y = y.astype(np.float32)
    wx = x + 300.0 * (fbm(x / 2600, y / 2600, SEED + 1, 3) - .5) * 2; wy = y + 300.0 * (fbm(x / 2600 + 7.3, y / 2600 + 3.1, SEED + 2, 3) - .5) * 2
    fall = -2.2 - 22.0 * sstep(28, 270, y)                                          # терраса и склон вниз к озеру
    side = 140.0 * sstep(1700, 3600, np.abs(x + 500.0) * (1.0 + y / 6000.0) - 300.0)  # борта долины по бокам
    far = 40.0 * sstep(2900, 5200, y) + 360.0 * sstep(4400, 8200, y)               # дальний берег и предгорья
    hills = (fbm(wx / 900, wy / 900, SEED + 3, 5) - .5) * 2
    amp = 8.0 + 70.0 * sstep(1200, 5200, y)
    base = fall + side * sstep(300, 1500, y) + far + hills * amp * sstep(260, 1400, y)
    base += (fbm(x / 45, y / 45, SEED + 5, 3) - .5) * 4.0 * (1 - sstep(90, 600, y))
    mr = ridged(wx / 4600, wy / 4600, SEED + 7, 7 if oct_hi else 5)
    env = sstep(5200, 10200, y) * (.62 + .38 * fbm(x / 9000 + 3, y / 9000, SEED + 8, 2))
    gul = (ridged(wx / 900 + 4, wy / 900, SEED + 12, 4) - .5) * (.18 if oct_hi else 0.0)           # овраги и отроги
    M = 1900.0 * np.power(np.clip(mr + gul * mr, 0, 1.2), 1.4) * env
    if oct_hi:
        mk = np.clip(M / 500.0, 0, 1)
        M = M + mk * ((fbm(wx / 260, wy / 260, SEED + 14, 4) - .5) * 70.0 + (fbm(wx / 55, wy / 55, SEED + 15, 3) - .5) * 14.0)
    t = base + M
    # озеро: котловина с неровным берегом
    ex = (x + 450.0) / 1550.0; ey = (y - 1860.0) / 1300.0
    r = np.sqrt(ex * ex + ey * ey) * (1.0 + .26 * (fbm(x / 650, y / 650, SEED + 9, 3) - .5))
    lk = 1.0 - sstep(.74, 1.0, r)
    return lerp(t, WL - 14.0, lk)


# ── небо ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def sky(xs, ys):
    """цвет неба и облаков для пикселей холста (xs, ys — массивы холст-px)"""
    el = (HOR - ys) / FX                                       # tg угла места
    t = np.clip(el / .18, 0, 1)[..., None]
    zen = np.array([.52, .69, .91], np.float32); hor = np.array([.84, .90, .95], np.float32)
    col = lerp(hor, zen, np.power(t, .9))
    # кучевые облака: слой на высоте 3 км
    elc = np.maximum(el, .004); D = 3000.0 / elc
    cx = ((xs - 768.0) / FX) * D; cy = D
    dens = fbm(cx / 2600 + 2.0, cy / 5200, SEED + 21, 6, .55) * 1.0
    det = fbm(cx / 520, cy / 1000, SEED + 23, 4, .5)
    dens = dens * .78 + det * .30
    cover = sstep(.50, .70, dens)
    sh = fbm((cx + 380) / 2600 + 2.0, (cy + 700) / 5200, SEED + 21, 6, .55) * .78 + fbm((cx + 380) / 520, (cy + 700) / 1000, SEED + 23, 4, .5) * .30   # плотность в сторону солнца → самозатенение
    lit = np.clip(.55 + (dens - sh) * 4.5, .35, 1.1)[..., None]
    ccol = lerp(np.array([.58, .64, .78], np.float32), np.array([1.0, .98, .95], np.float32), lit)
    fade = np.clip(el / .02, 0, 1) * .85 + .15                  # у горизонта облака тают в дымке
    a = (cover * np.clip(fade, 0, 1))[..., None]
    return lerp(col, ccol, a * .95)


# ── цвет поверхности ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def surf(x, y, z, nrm, f, foot):
    """альбедо (H×W×3) по положению, высоте над долиной, крутизне и шуму; foot — размер пикселя на земле, м"""
    za = z - WL                                                 # над уровнем озера
    sl = np.sqrt(np.clip(1 - nrm[..., 2] ** 2, 0, 1)) / np.maximum(nrm[..., 2], .05)       # tg наклона
    n1 = fbm(x / 70, y / 70, SEED + 31, 4); n2 = fbm(x / 14, y / 14, SEED + 32, 3); n3 = fbm(x / 3.0, y / 3.0, SEED + 33, 2)
    fade = np.clip(1 - foot / 6.0, 0, 1)                         # мелкая текстура гаснет вдали
    # луг / поле
    meadow = lerp(np.array([.30, .44, .12], np.float32), np.array([.52, .60, .20], np.float32), sstep(.30, .70, n1)[..., None])
    dry = sstep(.58, .74, fbm(x / 420, y / 420, SEED + 34, 3))[..., None]
    meadow = lerp(meadow, np.array([.66, .60, .30], np.float32), dry * .7)
    # полосы виноградника / пашни на ровных полях в долине
    fld = sstep(.55, .66, fbm(x / 260 + 5, y / 260, SEED + 35, 3)) * (1 - sstep(.10, .32, sl)) * (1 - sstep(900, 1900, za + 40))
    ang = .45 + (fbm(x / 600, y / 600, SEED + 36, 2) - .5) * 1.5
    stripes = .5 + .5 * np.sin((x * np.cos(ang) + y * np.sin(ang)) * (2 * math.pi / 4.2))
    meadow = meadow * (1 - (fld * fade * (.22 + .22 * stripes))[..., None] * 1.1) + (fld * fade * .04)[..., None] * np.array([.5, .3, .0], np.float32)
    # лес
    forest_m = sstep(.36, .50, fbm(x / 380, y / 380, SEED + 37, 4)) * (1 - sstep(.75, 1.15, sl)) * (1 - sstep(950, 1250, za)) * sstep(150, 450, f) * sstep(8, 60, za + 30)
    canopy = lerp(np.array([.045, .12, .035], np.float32), np.array([.15, .26, .08], np.float32), (.35 + .65 * n2 * (.5 + .5 * n3 * fade))[..., None])
    alb = lerp(meadow, canopy, forest_m[..., None])
    # альпийский луг и скалы
    alp = sstep(700, 1050, za)[..., None] * (1 - forest_m[..., None] * .5)
    alb = lerp(alb, np.array([.42, .52, .24], np.float32), alp * .8)
    rock_m = np.maximum(sstep(.80, 1.25, sl + (n2 - .5) * .35), sstep(1250, 1550, za + (n1 - .5) * 260))
    rock = lerp(np.array([.48, .43, .37], np.float32), np.array([.62, .58, .52], np.float32), (n2 * .7 + n3 * .3)[..., None])
    alb = lerp(alb, rock, rock_m[..., None] * .9)
    snow = sstep(1380, 1700, za + (n1 - .5) * 320) * (1 - sstep(1.05, 1.5, sl))
    alb = lerp(alb, np.array([.92, .94, .97], np.float32), snow[..., None])
    return alb, forest_m


def shade(xh, yh, zs_, f, foot, dist, lod=True):
    """освещённый цвет поверхности в точках (м): нормаль из рельефа, альбедо, тени от гор, дымка"""
    eps = np.maximum(1.2, f * .0009)
    zx = np.maximum(terrain(xh + eps, yh, lod), WL); zy = np.maximum(terrain(xh, yh + eps, lod), WL)
    nx = -(zx - zs_) / eps; ny = -(zy - zs_) / eps; nl = np.sqrt(nx * nx + ny * ny + 1.0)
    nrm = np.stack([nx / nl, ny / nl, 1.0 / nl], -1)
    alb, forest_m = surf(xh, yh, zs_, nrm, f, foot)
    shadow = np.ones_like(f); sx, sy, sz = SUN
    for j in range(1, 13):
        dd = 14.0 * (1.45 ** j); px = xh + sx * dd; py = np.maximum(yh + sy * dd, 1.0); pz = zs_ + sz * dd
        pzt = terrain(px, py, False); shadow = np.minimum(shadow, 1.0 - np.clip((pzt - pz) * .025, 0, .62))
    diff = np.clip(nrm[..., 0] * sx + nrm[..., 1] * sy + nrm[..., 2] * sz, 0, 1) * shadow
    amb = (.26 + .14 * nrm[..., 2])[..., None] * np.array([.60, .72, 1.0], np.float32)
    col = alb * (diff[..., None] * np.array([1.0, .93, .80], np.float32) * 1.22 + amb * .90)
    valley = np.clip(1 - (zs_ - WL) / 900.0, 0, 1) * .5
    fog = 1 - np.exp(-dist / (14500.0 * (1.0 - valley * .6)))
    return lerp(col, np.array([.73, .82, .93], np.float32), fog[..., None] * .97)


def build():
    t0 = time.time()
    W, H = CW * S, CH * S
    tx = ((np.arange(W, dtype=np.float32) + .5) / S - 768.0) / FX                # tg угла по горизонтали
    rows = (np.arange(H, dtype=np.float32) + .5) / S
    f0, f1 = 22.0, 70000.0; K = int(math.log(f1 / f0) / math.log(RATIO)); fs = (f0 * RATIO ** np.arange(K)).astype(np.float32)
    print('[land] %dx%d, шагов %d' % (W, H, K), flush=True)
    ytop = np.empty((K, W), np.float32); CH_ = 600
    for k in range(0, K, CH_):
        ff = fs[k:k + CH_][:, None]; xx = tx[None, :] * ff; yy = np.broadcast_to(ff, xx.shape)
        z = np.maximum(terrain(xx, yy), WL)
        ytop[k:k + CH_] = HOR - FX * z / ff
    cm = np.minimum.accumulate(ytop, axis=0)
    idx = np.empty((H, W), np.int32)
    for c in range(W):
        idx[:, c] = np.searchsorted(-cm[:, c], -rows, side='left')
    hit = idx < K; kk = np.minimum(idx, K - 1); km1 = np.maximum(kk - 1, 0)
    y1 = np.take_along_axis(ytop, kk, axis=0); y0 = np.take_along_axis(ytop, km1, axis=0)                  # уточнение точки попадания между двумя шагами
    tt = np.clip((y0 - rows[:, None]) / np.maximum(y0 - y1, 1e-3), 0, 1)
    f = (fs[km1] + tt * (fs[kk] - fs[km1])).astype(np.float32); xh = tx[None, :] * f; yh = f
    del ytop, cm
    print('[land] марш %.0f с' % (time.time() - t0), flush=True)
    zh = terrain(xh, yh); water = (zh <= WL + .01) & hit; zs_ = np.where(zh <= WL, WL, zh)
    foot = f / (FX * S); dist = f * np.sqrt(1 + tx[None, :] ** 2)
    col = shade(xh, yh, zs_, f, foot, dist)
    X, Y = np.meshgrid((np.arange(W) + .5) / S, rows)
    img = np.where(hit[..., None], col, sky(X, Y)).astype(np.float32)
    depth = np.where(hit, f, np.float32(1e9)).astype(np.float32)
    print('[land] рельеф %.0f с' % (time.time() - t0), flush=True)
    return img, depth, water, (tx, rows, f)


# ── спрайты: кипарисы, оливы, дом ───────────────────────────────────────────────────────────────────────────────────────────────────────────
PROF = np.array([(0.0, .0), (.04, .30), (.12, .42), (.30, .50), (.55, .46), (.78, .34), (.93, .16), (1.0, 0.0)], np.float32)


def proj(wx, wy, wz):
    return 768.0 + FX * wx / wy, HOR - FX * wz / wy


def blit(img, depth, x0, y0, patch, a, fdist):
    """patch (h×w×3), a (h×w) — в координатах S-px; с проверкой глубины"""
    h, w = a.shape; xa, ya = max(0, x0), max(0, y0); xb, yb = min(img.shape[1], x0 + w), min(img.shape[0], y0 + h)
    if xb <= xa or yb <= ya: return
    pa = patch[ya - y0:yb - y0, xa - x0:xb - x0]; aa = a[ya - y0:yb - y0, xa - x0:xb - x0] * (depth[ya:yb, xa:xb] > fdist)
    img[ya:yb, xa:xb] = img[ya:yb, xa:xb] * (1 - aa[..., None]) + pa * aa[..., None]
    depth[ya:yb, xa:xb] = np.where(aa > .5, fdist, depth[ya:yb, xa:xb])


def fogc_at(col, f):
    k = 1 - math.exp(-f / 14500.0)
    return lerp(col, np.array([.73, .82, .93], np.float32), k * .97)


def tree(img, depth, wx, wy, kind, h, seed):
    gz = float(terrain(np.array([wx]), np.array([wy]))[0])
    if gz <= WL + 1: return
    bx, by = proj(wx, wy, gz); tx_, ty_ = proj(wx, wy, gz + h)
    ph = (by - ty_) * S                                         # высота в S-px
    if ph < 2: return
    rng = np.random.default_rng(seed)
    if kind == 'cyp': pw = ph * .17
    else: pw = ph * .62
    wpx = int(pw * 2 + 6); hpx = int(ph + 4)
    u = (np.arange(wpx) - wpx / 2 + .5)[None, :] / pw; v = 1 - (np.arange(hpx)[:, None] + .5 - 2) / ph          # u: −1…1, v: 0 (низ) … 1 (верх)
    vv = np.clip(v, 0, 1)
    if kind == 'cyp': rr = np.interp(vv, PROF[:, 0], PROF[:, 1]) * 2.0
    else: rr = np.sqrt(np.clip(1 - (2 * np.clip(vv, 0, 1) - 1) ** 2, 0, 1)) * (.96 + .08 * np.sin(vv * 9 + seed))
    gx = np.arange(wpx)[None, :] + rng.uniform(0, 99); gy = np.arange(hpx)[:, None] + rng.uniform(0, 99)
    tex = fbm(gx / max(ph / 22, 1.5), gy / max(ph / 22, 1.5), seed, 3)
    edge = rr * (1 + (tex - .5) * (.22 if kind != 'cyp' else .10))
    d = np.abs(u) / np.maximum(edge, 1e-3); a = np.clip((1 - d) * np.maximum(edge, .02) * pw, 0, 1) * ((v >= -.01) & (v <= 1.0))
    nxs = np.clip(u / np.maximum(edge, 1e-3), -1, 1); nzs = np.sqrt(np.clip(1 - nxs * nxs, 0, 1))
    lam = np.clip(.40 + .60 * np.clip(-nxs * .75 + nzs * .55 + (vv - .4) * .3, 0, 1), 0, 1)
    if kind == 'cyp':
        base = lerp(np.array([.04, .10, .035], np.float32), np.array([.11, .20, .07], np.float32), (.25 + .75 * tex)[..., None])
    else:
        base = lerp(np.array([.13, .20, .07], np.float32), np.array([.30, .38, .13], np.float32), (.20 + .80 * tex)[..., None])
    sh = (lam * (.55 + .45 * np.clip(vv + .25, 0, 1)))[..., None]
    col = base * (sh * 1.25 + .22) * np.array([1.0, .98, .88], np.float32)
    col = fogc_at(col, wy)
    blit(img, depth, int(round(bx * S - wpx / 2)), int(round(ty_ * S - 2)), col.astype(np.float32), a.astype(np.float32), wy)


def house(img, depth, wx, wy, w=15.0, hgt=7.0, d=8.0, rh=4.0):
    gz = float(terrain(np.array([wx]), np.array([wy]))[0])
    if gz <= WL + 1: return
    from PIL import Image as I, ImageDraw as D
    def P(dx, dz, dy=0.0): px, py = proj(wx + dx, wy + dy, gz + dz); return (px * S, py * S)
    xs = [P(-w / 2, 0)[0], P(w / 2, 0)[0]]; x0 = int(min(xs)) - 6; ys = [P(0, hgt + rh)[1], P(0, -1)[1]]; y0 = int(min(ys)) - 6
    wpx = int(abs(xs[1] - xs[0]) + 14 + d * 1.3 * S * FX / wy / 3); hpx = int(abs(ys[1] - ys[0]) + 14)
    im = I.new('RGBA', (wpx * 3, hpx * 3), (0, 0, 0, 0)); dr = D.Draw(im)
    def Q(pt): return ((pt[0] - x0) * 3, (pt[1] - y0) * 3)
    sh = d * .45                                                # боковая стена в перспективе
    dr.polygon([Q(P(-w / 2, 0)), Q(P(w / 2, 0)), Q(P(w / 2, hgt)), Q(P(-w / 2, hgt))], fill=(238, 218, 178, 255))
    dr.polygon([Q(P(w / 2, 0)), Q(P(w / 2 + sh, 0, 0)), Q(P(w / 2 + sh, hgt)), Q(P(w / 2, hgt))], fill=(170, 150, 120, 255))
    dr.polygon([Q(P(-w / 2 - 1.2, hgt)), Q(P(w / 2 + sh + 1.0, hgt)), Q(P(w / 2 + sh - 1.5, hgt + rh)), Q(P(-w / 2 + 2.2, hgt + rh))], fill=(166, 82, 52, 255))
    dr.polygon([Q(P(-w / 2 - 1.2, hgt)), Q(P(w / 2 + sh + 1.0, hgt)), Q(P(w / 2 + sh + 1.0, hgt - .6)), Q(P(-w / 2 - 1.2, hgt - .6))], fill=(120, 60, 40, 255))
    for k in range(3):
        wx_ = -w / 2 + w * (k + .5) / 3; a_ = Q(P(wx_ - .6, 4.3)); b_ = Q(P(wx_ + .6, 1.3)); dr.rectangle([min(a_[0], b_[0]), min(a_[1], b_[1]), max(a_[0], b_[0]), max(a_[1], b_[1])], fill=(70, 62, 52, 255))
    im = im.resize((wpx, hpx), Image.LANCZOS); arr = np.asarray(im).astype(np.float32) / 255.0
    col = arr[..., :3] * np.array([1.0, .96, .88], np.float32); col = fogc_at(col, wy)
    blit(img, depth, x0, y0, col, arr[..., 3], wy)


def sprites(img, depth):
    rng = np.random.default_rng(SEED + 100)
    objs = [('house', -170.0, 610.0, 0)]
    for i in range(9):                                         # кипарисовая аллея вдоль берега, по пути к дому
        t = i / 8.0; wy = 585 + t * 55 + rng.uniform(-6, 6); wx = -395 + t * 330 + rng.uniform(-5, 5); objs.append(('cyp', wx, wy, rng.uniform(15, 20)))
    for k in range(3): objs.append(('cyp', -170.0 + (k - 1) * 26 + rng.uniform(-3, 3) - 18, 600 + rng.uniform(-14, 14), rng.uniform(15, 19)))
    for _ in range(26):
        wy = rng.uniform(520, 660); wx = rng.uniform(-420, 40)
        objs.append(('rnd', wx, wy, rng.uniform(7, 12)) if rng.random() < .6 else ('cyp', wx, wy, rng.uniform(14, 20)))
    for _ in range(520):                                        # рощи и сады на берегах и холмах
        gx = rng.choice([-700, -250, 150, -1100, 400, -500, -1500]); gy = rng.choice([700, 1000, 1500, 3100, 3500, 4200, 5200])
        wx = gx + rng.normal(0, 420); wy = gy + rng.normal(0, 460)
        if wy < 500: continue
        objs.append(('rnd', wx, wy, rng.uniform(7, 15) * (1 + wy / 3500.0)))
    for _ in range(140):
        wy = rng.uniform(2900, 6200); wx = rng.uniform(-2600, 1500)
        objs.append(('cyp', wx, wy, rng.uniform(15, 24)))
    for _ in range(26):                                         # деревушки на дальнем берегу и холмах
        wy = rng.uniform(2800, 4600); wx = rng.uniform(-1900, 600)
        objs.append(('house', wx, wy, 1))
    objs.sort(key=lambda o: -o[2])
    for i, o in enumerate(objs):
        if o[0] == 'house':
            if o[3] == 0: house(img, depth, o[1], o[2])
            else: house(img, depth, o[1], o[2], w=rng.uniform(9, 15), hgt=rng.uniform(5, 8), d=7.0, rh=3.0)
        elif o[0] == 'cyp': tree(img, depth, o[1], o[2], 'cyp', o[3], i)
        else: tree(img, depth, o[1], o[2], 'rnd', o[3], i)


def lake_reflect(water, tx, rows, f_w):
    """отражение: луч от точки на воде идёт зеркально вверх, ищем рельеф/небо; возвращает цвет, глубину попадания y"""
    H, W = water.shape; jj, ii = np.nonzero(water)
    n = len(jj); print('[land] вода: %d лучей' % n, flush=True)
    tyl = tx[ii]; sl = (rows[jj] - HOR) / FX                                  # подъём отражённого луча на 1 м вперёд
    yw = f_w[jj, ii]; xw = tyl * yw
    col = np.zeros((n, 3), np.float32); hy = np.full(n, 1e9, np.float32)
    live = np.arange(n); d = 5.0; ratio = 1.035
    while len(live) and d < 90000:
        yy = yw[live] + d; xx = xw[live] + tyl[live] * d; zz = WL + sl[live] * d
        zt = terrain(xx, yy, False)
        h = zt >= zz
        if h.any():
            sel = live[h]; yy_ = yy[h]; xx_ = xx[h]
            # уточнение: шаг назад на половину
            dd = d * (1 - (1 - 1 / ratio) * .5); y2 = yw[sel] + dd; x2 = xw[sel] + tyl[sel] * dd
            z2 = np.maximum(terrain(x2, y2, True), WL)
            fo = y2 * 0 + y2; dist = np.sqrt(x2 * x2 + y2 * y2 + (z2 * 0 + 1) * 0) + 0 * y2
            col[sel] = shade(x2, y2, z2, np.maximum(fo, 50.0), np.maximum(fo, 50.0) / (FX * S) * 3, dist)
            hy[sel] = y2
        live = live[~h]; d *= ratio
    if len(live):                                                                # небо: направление → холст-px
        dy = 1.0; px = 768.0 + FX * tyl[live]; py = HOR - FX * sl[live]
        col[live] = sky(px, py)
    return jj, ii, col, hy


def lake(img, water, jj, ii, col, tx, rows):
    from scipy.ndimage import gaussian_filter
    H, W, _ = img.shape
    refl = img.copy(); refl[jj, ii] = col
    # рябь вытягивает отражение по горизонтали; чем дальше от камеры (ближе к горизонту), тем сильнее
    sig_x = 3.2 * S; blurred = np.stack([gaussian_filter(refl[..., c], (.9 * S, sig_x)) for c in range(3)], -1)
    refl = np.where(water[..., None], blurred, refl)
    dpy = (rows[jj] - HOR)
    rip = fbm(ii / (9.0 * S), jj / (1.1 * S), SEED + 41, 3) - .5; rip2 = fbm(ii / (40.0 * S), jj / (4.0 * S), SEED + 42, 3) - .5
    ndot = np.clip(dpy / FX, .005, 1)
    F = np.clip(.88 - 6.5 * ndot, .5, .88)[:, None]
    deep = np.array([.06, .21, .27], np.float32)
    wc = lerp(deep, refl[jj, ii], F) * (1 + rip[:, None] * .22 + rip2[:, None] * .12)
    out = img.copy(); out[jj, ii] = wc
    m = gaussian_filter(water.astype(np.float32), .7 * S)[..., None]
    soft = out * m + img * (1 - m)
    return np.where(water[..., None], out, soft)


def main(out):
    img, depth, water, (tx, rows, f_w) = build()
    jj, ii, col, hy = lake_reflect(water, tx, rows, f_w)
    sprites(img, depth)
    img = lake(img, water, jj, ii, col, tx, rows)
    g = img; lum = (g[..., 0] * .3 + g[..., 1] * .59 + g[..., 2] * .11)[..., None]
    g = np.clip(lerp(lum, g, 1.10), 0, 1)
    im = Image.fromarray((np.clip(g, 0, 1) * 255 + .5).astype(np.uint8)); im.save(out)
    print('[land] готово →', out, im.size, flush=True)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/land.png')
