"""Пул для арены фонов: 20 разных «кремовых» картинок (мазок, волны, шёлк) с параметрами; каждая проходит тот же подбор тона, что и боевые текстуры.
Запуск: python3.11 arena_pool.py <папка-вывода>   → <папка>/<id>.webp (десктоп 1600×1100) и <id>-m.webp (телефон 720×1000) + pool.json."""
import sys, os, json, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import smear, cream, silk
from export import SPEC, grade, crop_focus

POOL = [
    ('s01', 'smear', dict(seed=21)), ('s02', 'smear', dict(seed=22, dx=-0.06, wid=1.15)), ('s03', 'smear', dict(seed=23, dx=0.04, wid=0.85, bend=0.4)),
    ('s04', 'smear', dict(seed=24, dy=-0.10, wid=1.30)), ('s05', 'smear', dict(seed=25, bend=-0.4, dx=0.05)), ('s06', 'smear', dict(seed=26, wid=0.70, dx=-0.10)),
    ('s07', 'smear', dict(seed=27, dy=0.08)), ('s08', 'smear', dict(seed=28, flip=True, wid=1.1)),
    ('c01', 'cream', dict(seed=7)), ('c02', 'cream', dict(seed=8, ang=-0.9, sp=0.40)), ('c03', 'cream', dict(seed=9, ang=-0.2, sp=0.70)),
    ('c04', 'cream', dict(seed=10, ang=0.4, sp=0.50)), ('c05', 'cream', dict(seed=11, ang=-0.7, sp=0.35, amp=1.3)), ('c06', 'cream', dict(seed=12, ang=-0.35, sp=0.60, amp=0.7)),
    ('c07', 'cream', dict(seed=13, ang=0.9, sp=0.45, amp=1.1)),
    ('k01', 'silk', dict(seed=21)), ('k02', 'silk', dict(seed=22, scale=0.20)), ('k03', 'silk', dict(seed=23, scale=0.45)),
    ('k04', 'silk', dict(seed=24, scale=0.28, amt=2.2)), ('k05', 'silk', dict(seed=25, scale=0.38, amt=1.0)),
]
MOD = {'smear': smear, 'cream': cream, 'silk': silk}

def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True); rng = np.random.default_rng(5); meta = []
    for pid, fam, kw in POOL:
        raw = os.path.join(out, pid + '.raw.png'); MOD[fam].make(1600, 1100, out=raw, **kw)
        sp = SPEC[fam]; g = Image.fromarray(grade(Image.open(raw).convert('RGB'), sp)); os.remove(raw)
        for sfx, im in (('', g), ('-m', crop_focus(g, *sp['focus'], 720 / 1000).resize((720, 1000), Image.LANCZOS))):
            a = np.clip(np.asarray(im, float) + rng.normal(0, 1.2, np.asarray(im).shape) + 0.5, 0, 255).astype(np.uint8)
            Image.fromarray(a).save(os.path.join(out, pid + sfx + '.webp'), 'WEBP', quality=90, method=4)
        meta.append({'id': pid, 'family': fam, 'params': kw}); print(pid, fam, kw, flush=True)
    json.dump(meta, open(os.path.join(out, 'pool.json'), 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
