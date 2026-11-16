#!/usr/bin/env python3
"""Вид за окнами зала «Обучения»: нейтральный светлый дневной пейзаж (небо с тонкой дымкой, дальние холмы, городской силуэт в воздушной перспективе, полоса деревьев у горизонта).
Рисуется процедурно (numpy + OpenCV), никаких фотографий и сетевых запросов; результат — window_view.jpg (1536×1536), лежит рядом со скриптом и в Blender
вешается на светящуюся плоскость за аркой (hall_v2.py). Горизонт — на высоте глаза камеры (z ≈ 1,25 м): плоскость 12 × 12 м, z от −1 до 11 м.

  python3 make_view.py            → window_view.jpg (+ превью /tmp/window_view_preview.png, если HV_PREVIEW=1)
Переменные: HV_SEED (7)."""
import os, numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
N = 1536                                                  # px; 128 px на метр плоскости 12 × 12 м
HOR = int(N * (11.0 - 1.25) / 12.0)                        # строка горизонта (z = 1,25 м)
rng = np.random.default_rng(int(os.environ.get('HV_SEED', 7)))


def fbm(h, w, base=4, octs=6, pers=.55, aspect=1.0):
    """многооктавный value-noise 0..1; aspect > 1 вытягивает рисунок по горизонтали"""
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0.0
    for o in range(octs):
        gw = max(2, int(base * 2 ** o / aspect)); gh = max(2, int(base * 2 ** o))
        g = rng.random((gh, gw)).astype(np.float32); out += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC); tot += amp; amp *= pers
    out /= tot; out = (out - out.min()) / (out.max() - out.min() + 1e-6); return out


def lerp(a, b, t): return a + (b - a) * t


def main():
    h = w = N; yy = np.arange(h, dtype=np.float32)[:, None] / h; z = 11.0 - yy * 12.0                  # z, м
    img = np.zeros((h, w, 3), np.float32)
    # небо: бледный зенит → тёплая светлая дымка у горизонта (sRGB-ориентиры, ниже переводим в линейные)
    t = np.clip((z - 1.25) / 9.0, 0, 1) ** .7
    zen = np.array([.76, .83, .93], np.float32); hor = np.array([.95, .955, .95], np.float32)
    sky = lerp(hor[None, None, :], zen[None, None, :], t[..., None]) * np.ones((1, w, 1), np.float32)
    xs = np.arange(w, dtype=np.float32)[None, :] / w
    glow = np.exp(-(((xs - .62) / .45) ** 2)) * np.exp(-np.clip(z - 1.25, 0, None) / 2.4)            # мягкое солнечное свечение у горизонта
    sky = lerp(sky, np.array([1.0, .975, .915], np.float32)[None, None, :], np.clip(glow, 0, 1)[..., None] * .55)
    # тонкие перистые облака и пара кучевых: растянутый по горизонтали шум, умеренный контраст (без «разводов»)
    ci = fbm(h, w, base=3, octs=6, aspect=3.0); ci = np.clip((ci - .46) * 2.4, 0, 1) * np.clip((z - 2.5) / 3.0, 0, 1) * np.clip((10.5 - z) / 3.0, 0, 1) * .42
    cu = fbm(h, w, base=3, octs=7, pers=.52, aspect=1.8); cm = np.clip((cu - .62) * 3.0, 0, 1) * np.clip((z - 2.6) / 1.5, 0, 1) * np.clip((7.5 - z) / 2.5, 0, 1) * .30
    shade = np.clip(1.0 - (cu - .58) * 1.6, .78, 1.0)[..., None] * np.array([.97, .985, 1.0], np.float32)
    sky = lerp(sky, np.array([1, 1, 1], np.float32)[None, None, :], ci[..., None])
    sky = lerp(sky, np.clip(np.array([1, 1, 1], np.float32)[None, None, :] * shade, 0, 1), cm[..., None])
    img[:] = sky
    haze_col = np.array([.90, .92, .94], np.float32)

    def layer(img, top, color, haze, edge_blur=1.0):
        """силуэт с верхней кромкой top[x] (метры над горизонтом): заливка color, смешанная с дымкой haze"""
        sil = (z > (1.25 - 3)) & (z <= (1.25 + top[None, :]))                          # всё, что ниже кромки
        m = cv2.GaussianBlur(sil.astype(np.float32), (0, 0), edge_blur)
        c = lerp(np.broadcast_to(color, (h, w, 3)), haze_col[None, None, :], haze)
        return lerp(img, c, m[..., None]), m
    # дальние холмы
    xs1 = np.arange(w, dtype=np.float32)
    hills = .45 + .55 * fbm(1, w, base=3, octs=5, pers=.5)[0] * 1.0 + .0
    img, _ = layer(img, hills * 1.15 + .25, np.array([.74, .78, .80], np.float32), .72, 1.4)
    # город: два плана прямоугольных корпусов с оконной сеткой и рубками на крышах; дальний — в плотной дымке
    for k, (col, haze, hmin, hmax, wmin, wmax, edge) in enumerate(((np.array([.80, .80, .79], np.float32), .66, .35, 1.5, .25, .70, 1.4), (np.array([.74, .73, .71], np.float32), .42, .35, 2.4, .35, 1.05, 1.1))):
        top = np.zeros(w, np.float32); x = 0.0; blocks = []
        while x < w:
            bw = rng.uniform(wmin, wmax) * 128; bh = rng.uniform(hmin, hmax) * (1.0 + .55 * np.exp(-((x / w - .30) / .22) ** 2)); blocks.append((int(x), int(min(w, x + bw)), bh)); x += bw
        for a, b, bh in blocks: top[a:b] = bh
        sil = (z <= (1.25 + top[None, :])) & (z > -2)
        c = np.broadcast_to(col, (h, w, 3)).copy()
        for a, b, bh in blocks:                                                          # светлые/тёмные плоскости корпусов и окна
            tone = rng.uniform(.93, 1.05); c[:, a:b] *= tone
            if bh > .6:
                wy = ((np.arange(h)[:, None] * (k + 1.0)) % (11 + 3 * k)) < 3.4; wx = ((np.arange(a, b)[None, :] * 1.0) % (9 + 2 * k)) < 4.5
                win = (wy & wx & (z[:, :1] < 1.25 + bh - .12) & (z[:, :1] > 1.45)).astype(np.float32)[..., None] * .11
                c[:, a:b] = c[:, a:b] * (1 - win) + win * np.array([.55, .6, .65], np.float32)
        c = lerp(c, haze_col[None, None, :], haze)
        m = cv2.GaussianBlur(sil.astype(np.float32), (0, 0), edge)
        img = lerp(img, c, m[..., None])
    # ближняя полоса деревьев: шумовая «крона», светлые просветы, зелёно-серая гамма; ниже — светлая земля
    tl = .30 + .55 * fbm(1, w, base=7, octs=6, pers=.62)[0]
    crown = np.broadcast_to(np.array([.40, .46, .35], np.float32), (h, w, 3)).copy()
    tex = fbm(h, w, base=30, octs=5, pers=.6); crown *= (.80 + .45 * tex)[..., None]
    sil = (z <= (1.25 + tl[None, :] + .08 * fbm(h, w, base=40, octs=3)))
    m = cv2.GaussianBlur(sil.astype(np.float32), (0, 0), 1.3)
    crown = lerp(crown, haze_col[None, None, :], .22)
    img = lerp(img, crown, m[..., None])
    gm = (z < .35).astype(np.float32); gm = cv2.GaussianBlur(gm, (0, 0), 2.0)
    ground = np.broadcast_to(np.array([.58, .62, .52], np.float32), (h, w, 3)) * (.9 + .2 * fbm(h, w, base=24, octs=4))[..., None]
    img = lerp(img, ground, gm[..., None])
    img = cv2.GaussianBlur(img, (0, 0), .8)                                              # лёгкая дымка по всему виду (оптика / расстояние)
    out = (np.clip(img, 0, 1) * 255 + .5).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(HERE, 'window_view.jpg'), quality=88, optimize=True)
    print('window_view.jpg', out.shape, os.path.getsize(os.path.join(HERE, 'window_view.jpg')) // 1024, 'КБ')
    if os.environ.get('HV_PREVIEW'): Image.fromarray(out).resize((768, 768)).save('/tmp/window_view_preview.png')


if __name__ == '__main__':
    main()
