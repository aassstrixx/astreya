#!/usr/bin/env python3
"""Контрольные листы для заказчика: «было | стало | эталон». Было — assets/showroom/_backup-2026-11-16, стало — assets/showroom (или FIN_OUT), эталон — assets/company/atrium-side.webp.
  python3 compare_expo.py OUT_DIR      → OUT_DIR/catalog-compare-1-overview.png (общий вид) и catalog-compare-2-detail.png (фрагменты 1:1: столешница и пол, подиумы, стена, ваза; у эталона — ближайший по материалу фрагмент)"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..'); SH = os.path.join(ROOT, 'assets', 'showroom'); NEW = os.environ.get('FIN_OUT', SH); OLD = os.path.join(SH, '_backup-2026-11-16')
REF = os.path.join(ROOT, 'assets', 'company', 'atrium-side.webp'); F = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def compose(d, scale=2):
    """кадр из слоёв как на странице, в разрешении слоёв (1536 × scale)"""
    L = json.load(open(os.path.join(d, 'layers.json'))) if os.path.exists(os.path.join(d, 'layers.json')) else json.load(open(os.path.join(SH, 'layers.json')))
    base = Image.open(os.path.join(d, 'layer-shell.webp')).convert('RGBA'); W = base.width; k = W / 1536.0
    for n in ('niche', 'ring', 'dais', 'plant'):
        b = L[n]; im = Image.open(os.path.join(d, 'layer-%s.webp' % n)).convert('RGBA'); base.alpha_composite(im, (round(b['x'] * k), round(b['y'] * k)))
    return base.convert('RGB')


def label(im, text, size=22):
    d = ImageDraw.Draw(im); f = ImageFont.truetype(F, size); w = d.textlength(text, font=f); d.rectangle((0, 0, w + 20, size + 14), fill=(24, 24, 24)); d.text((10, 6), text, font=f, fill=(255, 255, 255)); return im


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else '.'; os.makedirs(out, exist_ok=True)
    old, new, ref = compose(OLD), compose(NEW), Image.open(REF).convert('RGB')
    # общий вид: два кадра сверху, эталон и цифры Lab снизу
    import numpy as np, cv2
    def lab(im): l = cv2.cvtColor(np.asarray(im.convert('RGB')).astype(np.float32) / 255, cv2.COLOR_RGB2LAB); return 'L %.1f±%.1f  a %.1f  b %.1f  hue %.1f°' % (l[..., 0].mean(), l[..., 0].std(), l[..., 1].mean(), l[..., 2].mean(), np.degrees(np.arctan2(l[..., 2].mean(), l[..., 1].mean())))
    sh_old, sh_new = Image.open(os.path.join(OLD, 'layer-shell.webp')), Image.open(os.path.join(NEW, 'layer-shell.webp'))
    w = 996; hh = round(w * 1024 / 1536); s = Image.new('RGB', (2 * w + 8, hh + 8 + round(w * ref.height / ref.width)), (255, 255, 255))
    s.paste(label(old.resize((w, hh), Image.LANCZOS), 'БЫЛО', 24), (0, 0)); s.paste(label(new.resize((w, hh), Image.LANCZOS), 'СТАЛО', 24), (w + 8, 0))
    s.paste(label(ref.resize((w, round(w * ref.height / ref.width)), Image.LANCZOS), 'ЭТАЛОН (atrium-side.webp)', 24), (0, hh + 8))
    d = ImageDraw.Draw(s); f = ImageFont.truetype(F, 21); x0, y0 = w + 8 + 24, hh + 8 + 24
    for i, (t, v) in enumerate((('Цвет (Lab, среднее по кадру); подложка layer-shell:', ''), ('было', lab(sh_old)), ('стало', lab(sh_new)), ('эталон', lab(ref)), ('', ''), ('Весь кадр из слоёв:', ''), ('было', lab(old)), ('стало', lab(new)))):
        d.text((x0, y0 + i * 34), (t + (':  ' + v if v else '')), font=f, fill=(30, 30, 30))
    s.save(os.path.join(out, 'catalog-compare-1-overview.png'))
    # фрагменты 1:1: (подпись, прямоугольник в кадре слоёв 3072×2048, прямоугольник в эталоне 1800×1012, подпись эталона)
    cw, ch = 600, 380
    rows = [('столешница и пол', (150, 1300, 150 + cw, 1300 + ch), (1000, 600, 1000 + cw, 600 + ch), 'пол'),
            ('подиумы', (1130, 960, 1130 + cw, 960 + ch), (700, 600, 700 + cw, 600 + ch), 'каменный блок'),
            ('стена', (1000, 120, 1000 + cw, 120 + ch), (290, 200, 290 + 440, 200 + ch), 'штукатурка'),
            ('ваза-шар', (520, 930, 520 + cw, 930 + ch), (1200, 600, 1200 + cw, 600 + ch), 'основание колонны')]
    sheet = Image.new('RGB', (3 * cw + 16, len(rows) * ch + 8 * (len(rows) - 1)), (255, 255, 255)); y = 0
    for name, r1, r2, rl in rows:
        for j, (im, rr, t) in enumerate(((old, r1, 'было: ' + name), (new, r1, 'стало: ' + name), (ref, r2, 'эталон: ' + rl))):
            c = im.crop(rr); tile = Image.new('RGB', (cw, ch), (236, 236, 236)); tile.paste(c, (0, 0)); sheet.paste(label(tile, t, 18), (j * (cw + 8), y))
        y += ch + 8
    sheet.save(os.path.join(out, 'catalog-compare-2-detail.png'))
    print('листы сохранены:', out, s.size, sheet.size)


if __name__ == '__main__':
    main()
