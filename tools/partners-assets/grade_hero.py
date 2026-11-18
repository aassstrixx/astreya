"""Цветокор первого экрана «Партнёрам»: берёт блендер-рендер галереи с арочными окнами (assets/company/atrium-side.webp — тот же дом, что атриум «Компании») и подгоняет к гамме сайта —
статистически (пространство Lab) к залу «Обучения» (assets/academy/hall.webp): средняя яркость и тон кадра совпадают (светлее и «кремовее», меньше коричневого и жёлтого), контраст мягко усиливается;
затем мягкий сброс пересветов и лёгкая резкость.  Результат: assets/partners/hero.webp (ПК, 1800×1012) и hero-m.webp (телефон, кадр 900×1012 с окнами и коридором).
Запуск: python3 tools/partners-assets/grade_hero.py"""
import cv2, numpy as np, os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
P = lambda f: os.path.join(ROOT, f)
def lab_stats(path):
    im = cv2.resize(cv2.imread(P(path)), (640, 360), interpolation=cv2.INTER_AREA)
    x = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32).reshape(-1, 3); return x.mean(0), x.std(0)
TM, TS = lab_stats('assets/academy/hall.webp')                      # образец: зал «Обучения»

def grade(src, dst, crop=None, quality=88):
    bgr = cv2.imread(P(src))
    if crop: x0, y0, x1, y1 = crop; bgr = bgr[y0:y1, x0:x1]
    sm, ss = lab_stats(src)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    k = np.clip((TS / np.maximum(ss, 1e-3)) ** 0.6, 0.85, 1.25); k[1:] = 1.0                     # контраст — только по яркости, мягко
    strength = np.array([1.0, 0.85, 0.85], np.float32)                                          # яркость — полностью, тон — на 85 %
    lab = (lab - sm) * k + sm + (TM - sm) * strength
    lab[..., 1:] = 128 + (lab[..., 1:] - 128) * 1.18 + np.array([0.8, 2.6], np.float32)           # цветность чуть насыщеннее и теплее: после переноса стена уходила в серо-зелёный
    out = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32) / 255.0
    knee = 0.93; out = np.where(out > knee, knee + (out - knee) * 0.5, out)                  # пересветы мягче
    out = (np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)
    blur = cv2.GaussianBlur(out, (0, 0), 1.1); out = cv2.addWeighted(out, 1.55, blur, -0.55, 0)  # резкость
    os.makedirs(os.path.dirname(P(dst)), exist_ok=True)
    cv2.imwrite(P(dst), out, [cv2.IMWRITE_WEBP_QUALITY, quality]); print(dst, out.shape[1], out.shape[0], os.path.getsize(P(dst)) // 1024, 'КБ')
grade('assets/company/atrium-side.webp', 'assets/partners/hero.webp')
grade('assets/company/atrium-side.webp', 'assets/partners/hero-m.webp', crop=(120, 0, 1020, 1012))
