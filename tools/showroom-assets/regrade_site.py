#!/usr/bin/env python3
"""Подгонка цвета готового рендера под общий цвет сайта (Lab): среднее a/b сдвигается к целевым значениям, синие пиксели (кресла, лак ниш, логотип) почти не затрагиваются,
яркость (L) и контраст не меняются. Нужен, когда картинка заметно «жёлтее» остальных страниц (hue ≈ 78° против 83–89°) и перерендер не нужен.

  python3 tools/showroom-assets/regrade_site.py assets/academy/gallery.webp assets/academy/gallery-s.webp --a 1.6 --b 13.5      # перезаписать (оригиналы — в git)
  python3 tools/showroom-assets/regrade_site.py FILE... --stats                                                                  # только измерить
  python3 tools/showroom-assets/regrade_site.py FILE... --out /tmp/x                                                             # копии в другую папку

Параметры считаются по первому файлу списка, остальные сдвигаются так же (все размеры одной картинки получают один и тот же сдвиг).
Общий цвет сайта (замер 14.11.2026): hue 83–89°, a ≈ 0,3–1,1, b ≈ 8–13 для сцен со стенами/камнем; контраст L ± 17–20."""
import os, sys
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, 'auditorium'))
import grade_hall as GH


def arg(name, default=None):
    return float(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def main():
    files = []
    skip = False
    for i, a in enumerate(sys.argv[1:], 1):
        if skip: skip = False; continue
        if a in ('--a', '--b', '--out', '--cmax'): skip = True; continue
        if a.startswith('--'): continue
        files.append(a)
    if not files: print(__doc__); return
    lab0 = GH.lab_of(np.asarray(Image.open(files[0]).convert('RGB')))
    ref = dict(L=lab0[..., 0].mean(), a=lab0[..., 1].mean(), b=lab0[..., 2].mean())
    print('до :', GH.stats(lab0))
    if '--stats' in sys.argv: return
    GH.T.update(L_mean=ref['L'], L_contrast=1.0, clarity=0.0, a_mean=arg('--a', ref['a']), b_mean=arg('--b', ref['b']), chroma_max=arg('--cmax', 40))
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
    if out: os.makedirs(out, exist_ok=True)
    for f in files:
        im = Image.open(f); has_a = im.mode == 'RGBA'; rgba = np.asarray(im.convert('RGBA')); rgb = rgba[..., :3]
        new = GH.regrade(rgb, ref)
        if has_a: new = np.dstack([new, rgba[..., 3]])
        dst = os.path.join(out, os.path.basename(f)) if out else f
        ext = os.path.splitext(f)[1].lower(); kw = dict(quality=88, method=6) if ext == '.webp' else {}
        Image.fromarray(new, 'RGBA' if has_a else 'RGB').save(dst, **kw)
        print('%-40s' % f, 'после:', GH.stats(GH.lab_of(np.asarray(Image.open(dst).convert('RGB')))))


if __name__ == '__main__':
    main()
