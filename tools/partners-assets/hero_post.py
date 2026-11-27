#!/usr/bin/env python3
"""Постобработка рендера hero_scene.py: сырой кадр side.png → цвет атриума «Компании» (finish.py + regrade_site.py) → цвет зала «Обучения» (как grade_hero.py) →
assets/partners/hero.webp (ПК, 1800×1012) и hero-m.webp (телефон, кадр 900×1012 со смещением x 120..1020: окна и коридор).
Файлы assets/company/* не затрагиваются: промежуточный atrium-side.webp пишется во временную папку.
Запуск: python3 tools/partners-assets/hero_post.py [сырой_кадр.png] [папка_результата]
  по умолчанию: HP_RAW=/tmp/hero_raw/side.png, результат — assets/partners (для превью укажите другую папку: файлы hero.webp, hero-m.webp в ней)"""
import os, sys, shutil, tempfile
import cv2, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HP_RAW', '/tmp/hero_raw/side.png')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'assets', 'partners')
TMP = tempfile.mkdtemp(prefix='hero_post_')


def finish_side():
    """тот же путь, что у assets/company/atrium-side.webp (finish.py side), но во временную папку"""
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'showroom-assets', 'atrium'))
    import finish
    rawdir = os.path.join(TMP, 'raw'); os.makedirs(rawdir); shutil.copy(RAW, os.path.join(rawdir, 'side.png'))
    finish.RAW = rawdir; finish.OUT = os.path.join(TMP, 'company'); finish.TMP = os.path.join(TMP, 'fin')
    sys.argv = ['finish.py', 'side']; finish.main()
    return os.path.join(finish.OUT, 'atrium-side.webp')


def lab_stats(path):
    im = cv2.resize(cv2.imread(path), (640, 360), interpolation=cv2.INTER_AREA)
    x = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32).reshape(-1, 3); return x.mean(0), x.std(0)


def grade(src, dst, tm, ts, crop=None, quality=88, cap=230):
    """цвет зала «Обучения»: средняя яркость и тон совпадают, мягкий сброс пересветов, лёгкая резкость (как в grade_hero.py)"""
    bgr = cv2.imread(src)
    if crop: x0, y0, x1, y1 = crop; bgr = bgr[y0:y1, x0:x1]
    sm, ss = lab_stats(src)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    k = np.clip((ts / np.maximum(ss, 1e-3)) ** 0.6, 0.85, 1.25); k[1:] = 1.0
    strength = np.array([1.0, 0.85, 0.85], np.float32)
    lab = (lab - sm) * k + sm + (tm - sm) * strength
    lab[..., 1:] = 128 + (lab[..., 1:] - 128) * 1.18 + np.array([0.8, 2.6], np.float32)
    out = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32) / 255.0
    knee = 0.93; out = np.where(out > knee, knee + (out - knee) * 0.5, out)
    out = (np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)
    blur = cv2.GaussianBlur(out, (0, 0), 1.1); out = cv2.addWeighted(out, 1.55, blur, -0.55, 0)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for q in (quality, 84, 80, 76):
        cv2.imwrite(dst, out, [cv2.IMWRITE_WEBP_QUALITY, q])
        if os.path.getsize(dst) <= cap * 1024: break
    print(os.path.basename(dst), out.shape[1], out.shape[0], 'q%d' % q, os.path.getsize(dst) // 1024, 'КБ')


def main():
    side = finish_side(); tm, ts = lab_stats(os.path.join(ROOT, 'assets', 'academy', 'hall.webp'))
    grade(side, os.path.join(OUT, 'hero.webp'), tm, ts)
    grade(side, os.path.join(OUT, 'hero-m.webp'), tm, ts, crop=(120, 0, 1020, 1012), cap=140)
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == '__main__':
    main()
