#!/usr/bin/env python3
"""Слои «физической посадки» журнала на стеклянный стол: мягкая тень журнала на полу СКВОЗЬ стекло (стол высокий — тень смещена вправо-вниз по лучу окна и размыта) и общее затемнение/подсвет
вокруг журнала от света, отражённого бумагой. Слои — полупрозрачный WebP (цвет тёмно-тёплый, переменная только прозрачность), лежат внутри .np-rig под журналом и двигаются вместе с газетой.

Как получаются (запекаются Cycles, а не рисуются): table_glass.py рендерит один и тот же участок кадра дважды — без журнала и с журналом (TG_BOOK=closed|open; журнал камере невиден, но закрывает свет
окна и солнца и подсвечивает пол). Здесь оба кадра проходят ту же цветокоррекцию, что и сам стол (table_glass_post.grade с общими средними основного кадра), и берётся отношение яркостей r = с журналом / без.
Затемнение r < 1 пересчитывается в прозрачность тёмного тёплого цвета C так, чтобы поверх пола получить ровно r:  a = (1 − r) / (1 − Y(C) / Y(пол)).  Подсвет r > 1 (отражённый от бумаги свет)
пишется отдельным светлым слоем, если он заметен (>1,5 %).

  python3 tools/showroom-assets/news/table_glass_shadows.py            — полный цикл: рендер (≈ 6–8 мин) → assets/news/news-shadow-closed.webp, news-shadow-open.webp (+ news-glow-*.webp, если подсвет заметен); размеры и смещения печатаются и пишутся в $TG_TMP/news-shadow.json
  python3 tools/showroom-assets/news/table_glass_shadows.py post       — только пересчёт из уже готовых рендеров (TG_TMP)
Основной сырой кадр стола (для общих средних цвета) берётся из TG_RAW (по умолчанию $TG_TMP/final.png)."""
import os, sys, json, subprocess
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
TMP = os.environ.get('TG_TMP', '/tmp'); RAW = os.environ.get('TG_RAW', os.path.join(TMP, 'final.png')); OUT = os.environ.get('TG_OUT', os.path.join(ROOT, 'assets', 'news'))
PW, PH, PLANE = 500, 676, (3400, 2260)                     # страница журнала на плоскости (при --pw 500), плоскость стола, px
SHADOW = (48, 38, 27)                                      # тёмный тёплый цвет тени (не чёрный)
# поле слоя относительно центра плоскости (= центра журнала), px: (x0, y0, x1, y1); запас под смещённую вправо-вниз тень и её размытие
FIELD = {'closed': (-380, -460, 1300, 1130), 'open': (-640, -460, 1500, 1130)}
RES_W = int(os.environ.get('TG_SHW', 1700))                # ширина рендера плоскости; 1700 → 1 px слоя = 2 px страницы


def crop_frac(f):
    x0, y0, x1, y1 = f; W, H = PLANE
    return ((W / 2 + x0) / W, (H / 2 + y0) / H, (W / 2 + x1) / W, (H / 2 + y1) / H)


def render(kind, book):
    out = os.path.join(TMP, 'shadow_%s_%s.png' % (kind, book or 'none')); fr = crop_frac(FIELD[kind])
    env = dict(os.environ, TG_TMP=TMP, TG_W=str(RES_W), TG_SPP=os.environ.get('TG_SHSPP', '160'), TG_CROP=','.join('%.5f' % v for v in fr), TG_BOOK=book or '')
    subprocess.run([sys.executable, os.path.join(HERE, 'table_glass.py'), out], env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); return out


def lum(rgb): return rgb @ np.array([.2126, .7152, .0722], np.float32)


def post(kind):
    import table_glass_post as PG
    ref = PG.ref_of(PG.load(RAW)); base = PG.grade(PG.load(os.path.join(TMP, 'shadow_%s_none.png' % kind)), ref); wb = PG.grade(PG.load(os.path.join(TMP, 'shadow_%s_%s.png' % (kind, kind))), ref)
    yb, yw = lum(base), lum(wb); r = cv2.GaussianBlur(yw, (0, 0), 1.6) / np.maximum(cv2.GaussianBlur(yb, (0, 0), 1.6), 1e-3)
    yc = float(lum(np.array(SHADOW, np.float32) / 255)); den = np.maximum(1 - yc / np.maximum(yb, yc + .05), .15)
    a_dark = np.clip((1 - r) / den, 0, 1) ** 1.0; a_glow = np.clip((r - 1.0) * np.maximum(yb, .3) / np.maximum(1 - yb, .12), 0, .5)
    x0, y0, x1, y1 = FIELD[kind]; h, w = a_dark.shape; k = (x1 - x0) / w                       # px страницы на px слоя
    res = {'kind': kind, 'file': 'news-shadow-%s.webp' % kind, 'px': [w, h], 'css_px': [x1 - x0, y1 - y0], 'offset_px': [x0, y0], 'scale': k,
           'shadow_max_alpha': float(a_dark.max()), 'glow_max_alpha': float(a_glow.max())}
    rgba = np.zeros((h, w, 4), np.uint8); rgba[..., 0], rgba[..., 1], rgba[..., 2] = SHADOW; rgba[..., 3] = (a_dark * 255 + .5).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, res['file']), 'WEBP', quality=88, method=6, exact=True); res['bytes'] = os.path.getsize(os.path.join(OUT, res['file']))
    if a_glow.max() > .015:
        g = np.zeros((h, w, 4), np.uint8); g[..., :3] = (255, 250, 238); g[..., 3] = (a_glow * 255 + .5).astype(np.uint8)
        gf = 'news-glow-%s.webp' % kind; Image.fromarray(g, 'RGBA').save(os.path.join(OUT, gf), 'WEBP', quality=88, method=6, exact=True); res['glow_file'] = gf; res['glow_bytes'] = os.path.getsize(os.path.join(OUT, gf))
    return res


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if mode == 'all':
        for kind in ('closed', 'open'):
            render(kind, ''); render(kind, kind)
    out = {}
    for kind in ('closed', 'open'):
        r = post(kind)
        x0, y0 = r['offset_px']; w, h = r['css_px']
        r['in_pw_ph'] = {'left': x0 / PW, 'top': y0 / PH, 'width': w / PW, 'height': h / PH}
        out[kind] = r; print(json.dumps(r, ensure_ascii=False))
    json.dump(out, open(os.path.join(TMP, 'news-shadow.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
