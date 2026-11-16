#!/usr/bin/env python3
"""Доводка фона каталога (render_expo_v2.py → /tmp/expo_raw) в слои сайта assets/showroom/layer-*.webp — тот же приём, что finish_hall.py / atrium/finish.py:
экспозиция в линейном свете (среднее L → FIN_L) → контраст по L вокруг среднего (FIN_LC) и подъём чёрной точки (FIN_TOE) → regrade_site.py (среднее a/b → 0,8 / 10,5; синяя панель почти не затрагивается;
второй проход подбирает аргументы так, чтобы итог совпал с целью) → лёгкая нерезкая маска → слои WebP с подбором качества под предел размера.
Один и тот же сдвиг применяется к R2 (вся сцена) и R1 (подложка): швов между слоями нет. Прямоугольники слоёв берутся из прежнего layers.json (резерв _backup-2026-11-16): геометрия и места товаров не меняются.

  python3 finish_expo.py layers                 → assets/showroom/layer-*.webp (FIN_OUT=/tmp/x — в другую папку; layers.json переписывается только если отличается от прежнего — нет, всегда остаётся прежним)
  python3 finish_expo.py grade IN.png OUT.png   → только доводка одного кадра (пробные кадры 1/4 размера), печатает Lab до и после
  python3 finish_expo.py stats FILE...          → Lab файла
Переменные: FIN_RAW (/tmp/expo_raw), FIN_L (66,0 — целевое среднее L; эталон atrium-side.webp), FIN_LC (1,05), FIN_TOE (6), FIN_A (0,8), FIN_B (10,5), FIN_USM (40), FIN_LIM_<слой> (КБ), FIN_A_OFF / FIN_B_OFF — поправка на сдвиг WebP."""
import os, sys, json, shutil
import numpy as np, cv2
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..'); SH = os.path.join(ROOT, 'assets', 'showroom')
RAW = os.environ.get('FIN_RAW', '/tmp/expo_raw'); OUT = os.environ.get('FIN_OUT', SH)
sys.path.insert(0, os.path.join(HERE, 'auditorium'))
import grade_hall as GH
E = lambda n, d: float(os.environ.get(n, d))


def load16(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    if im.ndim == 3: im = im[..., :3][..., ::-1]
    return im.astype(np.float32) / (65535.0 if im.dtype == np.uint16 else 255.0)


def to_lin(f): return np.where(f <= .04045, f / 12.92, ((f + .055) / 1.055) ** 2.4)
def to_srgb(l): return np.where(l <= .0031308, l * 12.92, 1.055 * np.power(np.clip(l, 1e-9, None), 1 / 2.4) - .055)


def tone(f, ev, lc, toe, Lm):
    """экспозиция (линейный свет) → контраст по L вокруг Lm → подъём чёрной точки; f — sRGB 0..1"""
    if ev: f = to_srgb(to_lin(f) * 2 ** ev).astype(np.float32)
    lab = cv2.cvtColor(np.clip(f, 0, 1), cv2.COLOR_RGB2LAB); L = lab[..., 0]; L1 = np.clip(Lm + (L - Lm) * lc, 0, 100)
    lab[..., 0] = np.clip(L1 + toe * np.clip(1 - L1 / 40.0, 0, 1) ** 1.5, 0, 100)
    return np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB), 0, 1)


def mean_L(f): return float(cv2.cvtColor(np.clip(f, 0, 1), cv2.COLOR_RGB2LAB)[..., 0].mean())


def solve(ref_f):
    """подбор экспозиции (стопов), чтобы среднее L после контраста и чёрной точки = FIN_L; затем второй проход regrade (--a/--b), чтобы итоговые a/b = цели. Возвращает функцию кадр → кадр"""
    lc, toe, tL = E('FIN_LC', 1.05), E('FIN_TOE', 6), E('FIN_L', 66.0); sm = cv2.resize(ref_f, (ref_f.shape[1] // 4, ref_f.shape[0] // 4), interpolation=cv2.INTER_AREA)
    m0 = mean_L(sm); lo, hi = -2.5, 2.5
    for _ in range(18):
        ev = (lo + hi) / 2; Lm = mean_L(to_srgb(to_lin(sm) * 2 ** ev).astype(np.float32))
        got = mean_L(tone(sm, ev, lc, toe, Lm))
        if got < tL: lo = ev
        else: hi = ev
    ev = (lo + hi) / 2; Lm = mean_L(to_srgb(to_lin(ref_f) * 2 ** ev).astype(np.float32)); print('экспозиция %+.2f стопа, опорное L %.1f, контраст ×%.2f, чёрная точка %.0f' % (ev, Lm, lc, toe))
    t8 = (tone(ref_f, ev, lc, toe, Lm) * 255 + .5).astype(np.uint8); lab = GH.lab_of(t8); ref = dict(L=lab[..., 0].mean(), a=lab[..., 1].mean(), b=lab[..., 2].mean()); print('после экспозиции и контраста:', GH.stats(lab))
    ta, tb = E('FIN_A', .8) + E('FIN_A_OFF', .2), E('FIN_B', 10.5) + E('FIN_B_OFF', 0.0); a, b = ta, tb
    for it in range(2):
        GH.T.update(L_mean=ref['L'], L_contrast=1.0, clarity=0.0, a_mean=a, b_mean=b, chroma_max=E('FIN_CMAX', 40))
        got = GH.lab_of(GH.regrade(t8, ref)); ga, gb = got[..., 1].mean(), got[..., 2].mean()
        if it == 0 and (abs(ga - ta) > .03 or abs(gb - tb) > .06):
            ka = (ga - ref['a']) / (a - ref['a']) if abs(a - ref['a']) > 1e-3 else 1.0; kb = (gb - ref['b']) / (b - ref['b']) if abs(b - ref['b']) > 1e-3 else 1.0
            a = ref['a'] + (ta - ref['a']) / max(ka, .3); b = ref['b'] + (tb - ref['b']) / max(kb, .3); print('второй проход: --a %.3f --b %.3f (доля сдвига a %.2f, b %.2f)' % (a, b, ka, kb))
        else: break
    def fn(f): return GH.regrade((tone(f, ev, lc, toe, Lm) * 255 + .5).astype(np.uint8), ref)
    return fn


def clean_mask(m):
    """маска из 16 сэмплов шумит по краям (случайные полутона) — альфа-канал WebP из-за этого весит в разы больше самой картинки; лёгкое сглаживание (σ 0,6 px) и подрезка уровней убирают крапинки, край остаётся мягким в 1–2 px"""
    s = E('FIN_MASK_SIGMA', .6)
    return np.clip((ndi.gaussian_filter(m, s) - .03) * 1.06, 0, 1) if s > 0 else m


def usm(im): return im.filter(ImageFilter.UnsharpMask(radius=E('FIN_USM_R', 1.0), percent=int(E('FIN_USM', 40)), threshold=2))


def save_fit(im, dst, limit_kb, qs=(92, 90, 88, 86, 84, 82, 80, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60, 56, 52, 48), **kw):
    for q in qs:
        im.save(dst, 'WEBP', quality=q, method=6, **kw)
        if os.path.getsize(dst) <= limit_kb * 1024: break
    print('  %-18s %dx%d  q%d  %d КБ (предел %d)' % (os.path.basename(dst), im.width, im.height, q, os.path.getsize(dst) // 1024, limit_kb), flush=True); return q


def layers():
    os.makedirs(OUT, exist_ok=True)
    old = json.load(open(os.path.join(SH, '_backup-2026-11-16', 'layers.json'))); R2f = load16(os.path.join(RAW, 'R2.png')); R1f = load16(os.path.join(RAW, 'R1.png')); H, W = R2f.shape[:2]; k = 1536.0 / W
    M = {g: clean_mask(np.asarray(Image.open(os.path.join(RAW, 'M_%s.png' % g)).convert('L')).astype(np.float32) / 255.0) for g in ('niche', 'ring', 'dais', 'plant')}
    allm = np.maximum.reduce(list(M.values())); dil = ndi.maximum_filter(allm, size=2 * round(W / 768) + 1); dil = np.clip(ndi.gaussian_filter(dil, .8) * 1.6, 0, 1)
    plate_raw = R2f * (1 - dil[..., None]) + R1f * dil[..., None]                                              # подложка как её собирает scene.py: R2 вне объектов, R1 под ними
    print('сырой R2:', GH.stats(GH.lab_of((R2f * 255 + .5).astype(np.uint8)))); print('сырая подложка (shell):', GH.stats(GH.lab_of((plate_raw * 255 + .5).astype(np.uint8))))
    fn = solve(plate_raw if os.environ.get('FIN_REF', 'shell') == 'shell' else R2f)                           # цель a/b/L — для файла layer-shell.webp (так его мерили: regrade_site.py --stats)
    R2 = fn(R2f); R1 = fn(R1f); del R2f, R1f, plate_raw
    print('после regrade (R2, PNG):', GH.stats(GH.lab_of(R2)))
    plate = R2.astype(np.float32) * (1 - dil[..., None]) + R1.astype(np.float32) * dil[..., None]; print('после regrade (shell, PNG):', GH.stats(GH.lab_of(np.clip(plate + .5, 0, 255).astype(np.uint8))))
    lim = {'shell': 355, 'dais': 230, 'plant': 314, 'niche': 24, 'ring': 86}                                          # ≤ прежний размер × 1,3 (шелл 273, подиумы 177, растение 242, ниша 18, кольцо 66 КБ)
    shell = usm(Image.fromarray(np.clip(plate + .5, 0, 255).astype(np.uint8))); qs = {}
    qs['shell'] = save_fit(shell, os.path.join(OUT, 'layer-shell.webp'), int(E('FIN_LIM_shell', lim['shell'])))
    R2i = usm(Image.fromarray(R2)); R2s = np.asarray(R2i).astype(np.float32)
    for g in ('niche', 'ring', 'dais', 'plant'):
        o = old[g]; x0, y0, x1, y1 = [int(round(v / k)) for v in (o['x'], o['y'], o['x'] + o['w'], o['y'] + o['h'])]; m = M[g]
        out_a = m.copy(); out_a[y0:y1, x0:x1] = 0; ys, xs = np.where(m > .01)
        print('слой %-6s прямоугольник %d..%d × %d..%d; маска вне прямоугольника: %d px (из %d); bbox маски %d..%d × %d..%d' % (g, x0, x1, y0, y1, int((out_a > .02).sum()), int((m > .02).sum()), xs.min(), xs.max() + 1, ys.min(), ys.max() + 1))
        rgba = np.dstack([R2s, m * 255.0])[y0:y1, x0:x1]; qs[g] = save_fit(Image.fromarray(np.clip(rgba + .5, 0, 255).astype(np.uint8), 'RGBA'), os.path.join(OUT, 'layer-%s.webp' % g), int(E('FIN_LIM_' + g, lim[g])), alpha_quality=int(E('FIN_AQ', 85)))
    full = np.asarray(shell).astype(np.float32).copy()                                                                  # проверка швов: кадр из слоёв (с альфой) против полной сцены R2 — отличия только там, где подложка (R1) выглядывает из-под краёв объектов
    for g in ('niche', 'ring', 'dais', 'plant'):
        o = old[g]; x0, y0, x1, y1 = [int(round(v / k)) for v in (o['x'], o['y'], o['x'] + o['w'], o['y'] + o['h'])]; a_ = M[g][y0:y1, x0:x1, None]; full[y0:y1, x0:x1] = full[y0:y1, x0:x1] * (1 - a_) + R2s[y0:y1, x0:x1] * a_
    df = np.abs(full - R2s).max(axis=2); print('проверка швов (кадр из слоёв против полной сцены, уровни 0–255): среднее %.2f, 99,9-й процентиль %.1f, доля пикселей с отличием > 12: %.4f%%' % (df.mean(), np.percentile(df, 99.9), 100 * (df > 12).mean()))
    json.dump(old, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1, ensure_ascii=False)                          # прежний layers.json, без изменений
    try:
        new = json.load(open(os.path.join(RAW, 'anchors.json'))); print('места товаров совпадают с прежними:', new == old['anchors'])
    except Exception as e: print('anchors.json:', e)
    compose_check()


def compose_check(width=1536, dst=None):
    """склейка слоёв из WebP как на странице → Lab всего кадра и (по желанию) картинка"""
    L = json.load(open(os.path.join(OUT, 'layers.json'))); base = Image.open(os.path.join(OUT, 'layer-shell.webp')).convert('RGBA').resize((1536, 1024), Image.LANCZOS)
    for k in ('niche', 'ring', 'dais', 'plant'):
        b = L[k]; im = Image.open(os.path.join(OUT, 'layer-%s.webp' % k)).convert('RGBA').resize((round(b['w']), round(b['h'])), Image.LANCZOS); base.alpha_composite(im, (round(b['x']), round(b['y'])))
    base = base.convert('RGB'); print('итог (кадр из слоёв WebP):', GH.stats(GH.lab_of(np.asarray(base))))
    if dst: base.resize((width, round(width * 1024 / 1536)), Image.LANCZOS).save(dst)
    return base


def grade_one(src, dst):
    f = load16(src); print('до:', GH.stats(GH.lab_of((f * 255 + .5).astype(np.uint8)))); fn = solve(f); out = fn(f); print('после:', GH.stats(GH.lab_of(out))); Image.fromarray(out).save(dst)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'layers'
    if mode == 'layers': layers()
    elif mode == 'grade': grade_one(sys.argv[2], sys.argv[3])
    elif mode == 'check': compose_check(1536, sys.argv[2] if len(sys.argv) > 2 else None)
    elif mode == 'stats':
        for p in sys.argv[2:]: print(p, GH.stats(GH.lab_of(np.asarray(Image.open(p).convert('RGB')))))
    else: print(__doc__)
