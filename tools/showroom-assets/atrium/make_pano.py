#!/usr/bin/env python3
"""Панорама вида за окнами атриума (equirect 8192 × 4096, 16 бит) — процедурно, numpy + OpenCV, без фотографий и сетевых запросов.

Светлое дневное небо с градиентом (бледный зенит → тёплая дымка у горизонта), перспективные облака (кучевые и перистые на плоскости над головой),
дальние холмы, два плана городских корпусов (оконная сетка, воздушная перспектива — чем дальше, тем светлее и голубее) и ближняя полоса деревьев
(кроны из кругов, ствол, светлая кромка сверху). Ниже горизонта — светлый газон, уходящий в дымку.
Окна атриума берут цвет по НАПРАВЛЕНИЮ луча (как у бесконечно удалённого вида), поэтому панорама лежит в мировых направлениях Blender:
u = atan2(dy, −dx) / 2π + 0,5; v = 0,5 + elevation / π. Север кадра main (+Y) — u = 0,75; −Y — 0,25; −X — 0,5; +X — 0 / 1.

  python3 make_pano.py            → /tmp/at_pano.png (+ превью /tmp/at_pano_preview.png)
Переменные: PANO_OUT, PANO_SEED (11)."""
import os, numpy as np, cv2

W, H = 8192, 4096
PPD = H / 180.0                                           # пикселей на градус
OUT = os.environ.get('PANO_OUT', '/tmp/at_pano.png')
rng = np.random.default_rng(int(os.environ.get('PANO_SEED', 11)))
EL0 = -30.0                                                # нижний край полосы с деталями (ниже — однотонная земля)
HU = int(round((90 - EL0) * PPD))
el = (90 - (np.arange(HU) + .5) / PPD).astype(np.float32)[:, None]      # высота над горизонтом, градусы (строки)
al = ((np.arange(W) + .5) / W * 360.0 - 180.0).astype(np.float32)       # азимут α = atan2(dy, −dx), градусы (столбцы)
HOR = int(round((90 - 0.0) * PPD))                                      # строка горизонта


def lerp(a, b, t): return a + (b - a) * t


def sstep(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def fbm_t(n, base, octs, pers=.55):
    """бесшовный (периодический) value-noise 0..1"""
    out = np.zeros((n, n), np.float32); amp = 1.0; tot = 0.0
    for o in range(octs):
        g = base * 2 ** o; grid = rng.random((g, g)).astype(np.float32); big = cv2.resize(np.tile(grid, (3, 3)), (3 * n, 3 * n), interpolation=cv2.INTER_CUBIC)
        out += amp * big[n:2 * n, n:2 * n]; tot += amp; amp *= pers
    out /= tot; return (out - out.min()) / (out.max() - out.min() + 1e-6)


def pn(seed, nh=48, p=.75):
    """периодический по азимуту шум −1..1 (сумма синусов)"""
    r = np.random.default_rng(seed); o = np.zeros(W, np.float32); a = np.deg2rad(al)
    for k in range(1, nh + 1): o += k ** -p * np.sin(a * k + r.uniform(0, 6.283))
    return o / np.abs(o).max()


def main():
    # ── небо ──
    t = np.clip(el / 62.0, 0, 1) ** .62
    zen = np.array([.34, .58, .94], np.float32); mid = np.array([.64, .81, .985], np.float32); hor = np.array([.97, .955, .92], np.float32)
    sky = np.where(t[..., None] < .45, lerp(hor, mid, (t[..., None] / .45)), lerp(mid, zen, np.clip((t[..., None] - .45) / .55, 0, 1))).astype(np.float32)
    sky = np.broadcast_to(sky, (HU, W, 3)).copy()
    sun_al, sun_el = -38.0, 34.0                                                          # солнце слева-сзади: мягкое тёплое свечение, диск не виден
    da = np.minimum(np.abs(al - sun_al), 360 - np.abs(al - sun_al))[None, :]; dd = np.sqrt(da ** 2 + (el - sun_el) ** 2)
    glow = np.exp(-(dd / 38.0) ** 2) * .30 + np.exp(-(dd / 9.0) ** 2) * .20
    sky = lerp(sky, np.array([1.0, .965, .90], np.float32), np.clip(glow, 0, 1)[..., None] * .55)
    # облака на плоскости: u,v = (cos α, sin α)/tan(e): перспектива сходится к горизонту
    ee = np.deg2rad(np.clip(el, 2.0, 90)); tn = np.tan(ee); px = (np.cos(np.deg2rad(al))[None, :] / tn); py = (np.sin(np.deg2rad(al))[None, :] / tn)
    N = 2048; n1 = fbm_t(N, 3, 7, .52); n2 = fbm_t(N, 5, 6, .55)
    mx = (px * 150.0 + 4 * N).astype(np.float32); my = (py * 150.0 + 4 * N).astype(np.float32)
    d1 = cv2.remap(n1, mx % N, my % N, cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)
    d1s = cv2.remap(n1, (mx + 7) % N, (my - 9) % N, cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)
    d2 = cv2.remap(n2, (mx * .35) % N, (my * 1.1) % N, cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)
    fade = sstep(4.0, 16.0, el) * (1 - .55 * sstep(55.0, 85.0, el))
    cu = sstep(.46, .64, d1) * fade * .95                                                  # кучевые
    ci = sstep(.40, .74, d2) * sstep(8.0, 26.0, el) * .33                                  # перистые
    shade = np.clip(1.0 - (d1s - d1) * 5.5, .70, 1.0)                                      # низ облака — серо-голубой, верх — белый
    cc = np.clip(np.array([1.0, 1.0, 1.0], np.float32) * shade[..., None] * np.array([.97, .985, 1.0], np.float32), 0, 1)
    sky = lerp(sky, np.array([1, 1, 1], np.float32), ci[..., None]); sky = lerp(sky, cc, cu[..., None])
    img = sky
    hz = np.array([.935, .94, .93], np.float32)                                            # цвет дымки у горизонта

    def silhouette(img, top, col, haze, edge=1.2, base=None):
        """слой с верхней кромкой top[x] (градусы над горизонтом); цвет col (H×W×3 или 3), смешан с дымкой"""
        m = (el < top[None, :]).astype(np.float32); m = cv2.GaussianBlur(m, (0, 0), edge)
        c = lerp(np.broadcast_to(col, (HU, W, 3)), hz, haze); return lerp(img, c, m[..., None])

    # ── дальние холмы ──
    hills = 1.1 + 1.5 * (.5 + .5 * pn(3, 24, 1.1)) + .7 * pn(4, 60, .9)
    img = silhouette(img, hills, np.array([.70, .76, .83], np.float32), .72, 1.6)
    # ── город: два плана корпусов ──
    def city(img, seed, wmin, wmax, hmin, hmax, col, haze, win, cell):
        r = np.random.default_rng(seed); top = np.zeros(W, np.float32); tone = np.ones((W,), np.float32); x = 0; blocks = []
        while x < W:
            bw = int(r.uniform(wmin, wmax) * W / 360.0); bh = r.uniform(hmin, hmax) * (1.0 + .45 * (r.random() < .09)); tn_ = r.uniform(.92, 1.06)
            blocks.append((x, min(W, x + bw), bh, tn_)); x += bw
        for a, b, bh, tn_ in blocks: top[a:b] = bh; tone[a:b] = tn_
        m = (el < top[None, :]).astype(np.float32)
        c = np.broadcast_to(np.array(col, np.float32), (HU, W, 3)).copy() * tone[None, :, None]
        c *= (1.0 - .10 * np.clip((top[None, :] - el) / np.maximum(top[None, :], .3), 0, 1))[..., None]            # к земле чуть темнее
        if win:
            rr = np.arange(HU)[:, None]; cc_ = np.arange(W)[None, :]
            wmask = ((rr % cell[0]) < cell[0] * .55) & ((cc_ % cell[1]) < cell[1] * .55) & (el < (top[None, :] - .12)) & (el > .25)
            lit = (np.sin(cc_ * 12.9898 + (rr // cell[0]) * 78.233) * 43758.5453 % 1.0) > .35
            c = lerp(c, np.array([.55, .62, .70], np.float32), (wmask & lit)[..., None].astype(np.float32) * .30)
        c = lerp(c, hz, haze); m = cv2.GaussianBlur(m, (0, 0), 1.1); return lerp(img, c, m[..., None])
    img = city(img, 5, .25, .75, .9, 3.4, (.78, .80, .82), .70, False, (4, 4))
    img = city(img, 6, .45, 1.3, 1.0, 3.8, (.70, .70, .69), .50, True, (7, 6))
    # ── три ряда деревьев: дальний (светлее, мельче, в дымке), средний, ближний; кроны из кругов, светлая кромка сверху ──
    tex = cv2.resize(rng.random((HU // 3, W // 3)).astype(np.float32), (W, HU), interpolation=cv2.INTER_CUBIC)
    tex2 = cv2.resize(rng.random((HU // 9, W // 9)).astype(np.float32), (W, HU), interpolation=cv2.INTER_CUBIC)

    def tree_row(img, seed, rmin, rmax, lift, haze, dens, dark=1.0, cut=.8, low=False):
        r = np.random.default_rng(seed); layer = np.zeros((HU, W, 3), np.float32); cov = np.zeros((HU, W), np.uint8); x = r.uniform(0, 100)
        while x < W:
            rad = r.uniform(rmin, rmax) * PPD; cx = x + rad; cyc = (HOR + lift * PPD * r.uniform(.6, 1.3)) if low else (HOR - lift * PPD * r.uniform(.6, 1.35) - rad * .35)
            tone = r.uniform(.82, 1.12) * dark; gm = r.uniform(-.05, .05); base = np.array([.31 + gm * .6, .40 + gm, .26 - gm * .6], np.float32) * tone
            for _ in range(int(r.integers(6, 11))):
                ox = r.uniform(-.9, .9) * rad; oy = r.uniform(-.2, .75) * rad; rr_ = rad * r.uniform(.45, .72); sh = r.uniform(.93, 1.08); col = tuple(float(v) for v in (base * sh))
                for off in (0, W, -W):
                    cv2.circle(layer, (int(cx + ox + off), int(cyc + oy)), int(rr_), col, -1, cv2.LINE_8); cv2.circle(cov, (int(cx + ox + off), int(cyc + oy)), int(rr_), 255, -1, cv2.LINE_AA)
            x += rad * r.uniform(.7, 1.3) * dens
        m = cov.astype(np.float32) / 255.0; m[HOR + int(cut * PPD):] = 0
        top_row = np.where(m.max(0) > .5, m.argmax(0), HOR).astype(np.float32)
        hgt = np.clip((np.arange(HU)[:, None] - top_row[None, :]) / np.maximum(HOR - top_row[None, :], 1.0), 0, 1)
        shade = (1.22 - .55 * hgt) * (.84 + .18 * tex + .16 * tex2)
        layer = lerp(layer * shade[..., None], hz, haze); m = cv2.GaussianBlur(m, (0, 0), .9); return lerp(img, layer, m[..., None])
    img = tree_row(img, 21, .6, 1.4, 1.5, .52, 1.0, 1.05)
    img = tree_row(img, 22, 1.0, 2.2, 1.1, .32, 1.0, 1.0)
    img = tree_row(img, 23, 1.4, 3.0, .5, .12, 1.15, .96)
    # ── живая изгородь / ближние кусты, закрывающие нижнюю часть вида ──
    # ── земля: мощёная терраса (светлый камень, швы 2 м в перспективе, у горизонта растворяется в дымке) ──
    gm = (el < .35).astype(np.float32); gm = cv2.GaussianBlur(gm, (0, 0), 1.0)
    hcam = 1.6; ang = np.deg2rad(np.clip(-el, .3, 89)); dist = hcam / np.tan(ang); aa_ = np.deg2rad(al)[None, :]
    gx = dist * np.cos(aa_); gy = dist * np.sin(aa_); fp = np.clip(dist * (dist / hcam + hcam / np.maximum(dist, .1)) * (np.pi / 180 / PPD), 1e-3, 5)
    def joint(c, wj=.012):
        f = np.abs((c / 2.0) % 1.0 - .5) * 2.0; dd = (1.0 - f) * 1.0                                                     # расстояние до шва, м
        return np.exp(-(dd / (wj + fp)) ** 2) * np.clip(1.0 - fp / 1.4, 0, 1)
    jm = np.clip(joint(gx) + joint(gy), 0, 1)
    tone = .90 + .14 * cv2.resize(rng.random((HU // 5, W // 5)).astype(np.float32), (W, HU), interpolation=cv2.INTER_CUBIC)
    gcol = np.array([.82, .79, .72], np.float32) * tone[..., None]; gcol = gcol * (1 - .15 * jm[..., None])
    gcol = lerp(gcol, hz, np.clip(1.0 - np.exp(-dist / 55.0) * 0 - np.exp(-np.clip(-el, 0, 40) / 1.4), 0, 1)[..., None] * 0 + np.exp(-np.clip(-el, 0, 40) / 2.4)[..., None] * .55)
    img = lerp(img, gcol, gm[..., None])
    img = tree_row(img, 24, 1.8, 3.4, 1.3, .05, .75, .78, cut=6.5, low=True)
    img = tree_row(img, 25, 1.2, 2.4, 2.2, .04, .7, .72, cut=5.0, low=True)
    # ── низ сферы и сборка ──
    full = np.empty((H, W, 3), np.float32); full[:HU] = img
    gb = np.array([.80, .77, .70], np.float32); full[HU:] = gb[None, None, :] * (.97 + .03 * np.linspace(1, 0, H - HU)[:, None, None])
    full[HU - 6:HU + 6] = cv2.GaussianBlur(full[HU - 12:HU + 12], (0, 0), 3.0)[6:18]
    full = cv2.GaussianBlur(full, (0, 0), .7)                                                                                    # лёгкая оптическая мягкость
    # (дизеринг не нужен: 16 бит на канал)
    out = np.clip(full[..., ::-1] * 65535.0 + .5, 0, 65535).astype(np.uint16); cv2.imwrite(OUT, out)
    cv2.imwrite('/tmp/at_pano_preview.png', (np.clip(full[::4, ::4, ::-1], 0, 1) * 255 + .5).astype(np.uint8))
    print('панорама', OUT, os.path.getsize(OUT) // 1024, 'КБ')


if __name__ == '__main__':
    main()
