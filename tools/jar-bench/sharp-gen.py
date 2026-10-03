"""Арена №3 (чёткость): готовит кандидатов — один и тот же исходник (рендер без потерь) в разных разрешениях и качестве WebP.
    PYTHONPATH=<папка_с_cv2> python3 sharp-gen.py <папка_вывода> <d|m> [кадры через запятую]
Исходники берутся из рендеров (hq_*/f*.png и new_*/n*.png) по плану tools/jar-render/plan.json; пути — переменная окружения JAR_SRC (папка, где лежат hq_d, new_d, hq_m, new_m)."""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
plan = json.load(open(os.path.join(HERE, '..', 'jar-render', 'plan.json')))['frames']
out, kind = sys.argv[1], sys.argv[2]
KS = [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0, 40, 70, 110, 150, 190, 230, 277]
SRC = os.environ['JAR_SRC']
FULL = (1920, 1080) if kind == 'd' else (810, 1440)
# имя: (размер, качество)
if kind == 'd':
    CAND = {'hi_q80': (FULL, 80), 'hi_q86': (FULL, 86), 'hi_q90': (FULL, 90),
            'lt960_q70': ((960, 540), 70), 'lt960_q82': ((960, 540), 82), 'lt1280_q70': ((1280, 720), 70), 'lt1280_q78': ((1280, 720), 78), 'lt1440_q72': ((1440, 810), 72)}
else:
    CAND = {'hi_q80': (FULL, 80), 'hi_q86': (FULL, 86), 'hi_q90': (FULL, 90),
            'lt540_q70': ((540, 960), 70), 'lt540_q82': ((540, 960), 82), 'lt675_q72': ((675, 1200), 72), 'lt720_q72': ((720, 1280), 72)}
if os.environ.get('FMT') == 'avif':       # то же, но AVIF (q — шкала libavif, скорость 6)
    CAND = {'hi_avif60': (FULL, 60), 'hi_avif70': (FULL, 70)} if kind == 'd' else {'hi_avif60': (FULL, 60), 'hi_avif70': (FULL, 70)}
    CAND.update({'lt1280_avif55': ((1280, 720), 55), 'lt1280_avif65': ((1280, 720), 65), 'lt960_avif60': ((960, 540), 60)} if kind == 'd' else {'lt720_avif55': ((720, 1280), 55), 'lt720_avif65': ((720, 1280), 65), 'lt540_avif60': ((540, 960), 60)})
EXT = 'avif' if os.environ.get('FMT') == 'avif' else 'webp'
rng = np.random.default_rng(11)
os.makedirs(out, exist_ok=True)
sizes = {n: 0 for n in CAND}
for k in KS:
    e = plan[k]
    f = os.path.join(SRC, ('hq_' + kind), f"f{e['old']:05d}.png") if e['old'] is not None else os.path.join(SRC, ('new_' + kind), f"n{e['k']:05d}.png")
    src = Image.open(f).convert('RGB')
    src.save(os.path.join(out, f'truth_{k:03d}.png'))
    for name, ((w, h), q) in CAND.items():
        im = src.resize((w, h), Image.LANCZOS) if src.size != (w, h) else src
        arr = np.asarray(im).astype(np.float32) + rng.normal(0, 0.7, (h, w, 1)).astype(np.float32)
        im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        p = os.path.join(out, f'{name}_{k:03d}.{EXT}')
        if EXT == 'avif': im.save(p, 'AVIF', quality=q, speed=6)
        else: im.save(p, 'WEBP', quality=q, method=6)
        sizes[name] += os.path.getsize(p)
json.dump({'ks': KS, 'kb': {n: round(s / len(KS) / 1024, 1) for n, s in sizes.items()}, 'cands': {n: list(v[0]) for n, v in CAND.items()}, 'ext': EXT}, open(os.path.join(out, 'meta.json'), 'w'))
print({n: round(s / len(KS) / 1024, 1) for n, s in sizes.items()}, 'КБ/кадр')
