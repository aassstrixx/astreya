"""Финальная обработка: подгонка тона под палитру сайта, мелкий шум от бандинга, WebP для десктопа и телефона → assets/bg/.
Запуск: python3.11 export.py <папка-с-сырыми-PNG> [имя ...]   (сырые: cream, molecules, drops, ribbon, film, pipette, pearls, silk)"""
import sys, os, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from shade import tone

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'bg')

# тоновая шкала страниц: тень → середина → свет; текстуры накладываются на страницу умножением (mix-blend-mode:multiply), поэтому «белое» = 255
WEB = [(0.0, (203, 195, 183)), (0.42, (229, 222, 211)), (0.80, (247, 243, 236)), (1.0, (255, 254, 251))]      # для multiply: белое не меняет фон, тени чуть затеняют

# для каждой текстуры: перцентили яркости, гамма, размер, точка интереса для мобильного кадра (доли), мобильный размер
SPEC = {
    # gain — усиление отклонений от фона кадра, base — на какую отметку шкалы (0…1) ставится фон кадра: у «воздушных» картинок с белым полем он высокий, чтобы пустое место не затемняло страницу
    'cream':     dict(gain=1.3, base=0.62, size=(1600, 1100), lo=0.5, hi=99.6, gamma=1.0, focus=(0.5, 0.5), m=(720, 1000)),
    'molecules': dict(gain=1.7, base=0.66, size=(1600, 1100), lo=0.5, hi=99.8, gamma=1.0, focus=(0.6, 0.5), m=(720, 1000)),
    'drops':     dict(gain=1.9, base=0.70, size=(1600, 1100), lo=0.5, hi=99.8, gamma=1.0, focus=(0.7, 0.45), m=(720, 1000)),
    'ribbon':    dict(gain=1.0, base=0.90, size=(1600, 1100), lo=0.3, hi=99.8, gamma=1.0, focus=(0.6, 0.7), m=(720, 1000)),
    'pipette':   dict(gain=2.2, base=0.66, size=(1600, 1100), lo=0.5, hi=99.8, gamma=1.0, focus=(0.6, 0.45), m=(720, 1000)),
    'pearls':    dict(gain=1.6, base=0.66, size=(1600, 1100), lo=0.5, hi=99.8, gamma=1.0, focus=(0.65, 0.5), m=(720, 1000)),
    'silk':      dict(gain=1.2, base=0.62, size=(1600, 1100), lo=0.5, hi=99.6, gamma=1.0, focus=(0.5, 0.5), m=(720, 1000)),
    'film':      dict(gain=1.1, base=0.80, size=(1600, 1100), lo=0.5, hi=99.7, gamma=1.0, focus=(0.65, 0.55), m=(720, 1000)),
}

def grade(img, sp, ramp=WEB):
    """Яркость → шкала страницы. Фон кадра (медиана) ставится на отметку 0.6, отклонения от него усиливаются в gain раз: блики остаются белыми, тени и края проявляются."""
    a = np.asarray(img.convert('RGB'), float) / 255.0
    L = a.mean(-1); lo, hi = np.percentile(L, [sp['lo'], sp['hi']]); t = np.clip((L - lo) / (hi - lo + 1e-9), 0, 1) ** sp['gamma']
    m = np.median(t); t = np.clip(sp.get('base', 0.6) + (t - m) * sp.get('gain', 1.0), 0, 1)
    return tone(t[..., None] * np.ones(3), ramp, 0, 100)

def dither(a, rng, s=1.2):
    return np.clip(a + rng.normal(0, s, a.shape) + 0.5, 0, 255).astype(np.uint8)

def crop_focus(img, fx, fy, aspect):
    w, h = img.size
    cw = min(w, int(round(h * aspect))); ch = min(h, int(round(w / aspect)))
    if cw / ch > aspect: cw = int(round(ch * aspect))
    x0 = int(np.clip(fx * w - cw / 2, 0, w - cw)); y0 = int(np.clip(fy * h - ch / 2, 0, h - ch))
    return img.crop((x0, y0, x0 + cw, y0 + ch))

def save_webp(arr, path, q):
    Image.fromarray(arr).save(path, 'WEBP', quality=q, method=6)
    return os.path.getsize(path)

def main():
    src = sys.argv[1]; names = sys.argv[2:] or list(SPEC)
    os.makedirs(OUT, exist_ok=True); rng = np.random.default_rng(3)
    for n in names:
        sp = SPEC[n]; im = Image.open(os.path.join(src, n + '.png')).convert('RGB')
        if im.size != sp['size']: im = im.resize(sp['size'], Image.LANCZOS)
        g = Image.fromarray(grade(im, sp))
        d = save_webp(dither(np.asarray(g, float), rng), os.path.join(OUT, n + '.webp'), 92)
        mw, mh = sp['m']; mc = crop_focus(g, *sp['focus'], mw / mh).resize((mw, mh), Image.LANCZOS)
        m = save_webp(dither(np.asarray(mc, float), rng), os.path.join(OUT, n + '-m.webp'), 90)
        print(f'{n:10s} {sp["size"][0]}x{sp["size"][1]} {d/1024:6.1f} КБ   мобильная {mw}x{mh} {m/1024:6.1f} КБ')

if __name__ == '__main__':
    main()
