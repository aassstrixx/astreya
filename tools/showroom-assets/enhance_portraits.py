"""Улучшение портретов преподавателей (assets/teachers/hq → assets/teachers/hq2, ×2, 1120×1200) — без нейросетей, без «дорисовки» лиц.
Нейросетевые апскейлеры (Real-ESRGAN и т. п.) на реальных людях дают «пластиковую» кожу и искажают черты, поэтому здесь только классика:
  1. подавление блочных артефактов JPEG (fastNlMeans, слабо — чтобы не стереть фактуру кожи);
  2. удвоение размера Lanczos;
  3. нерезкая маска по яркости (мягкая, чтобы не рисовать ореолы) + лёгкий локальный контраст (CLAHE по L, 30 %);
  4. тонкое плёночное зерно: после двойного увеличения кожа без зерна выглядит гладкой, как пластик.
Результат: PNG для рендера (/tmp/ag_<id>.png) и WebP для сайта (assets/teachers/hq2/<id>.webp).
  python3 tools/showroom-assets/enhance_portraits.py"""
import os, json
import numpy as np, cv2

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')


def enhance(bgr, seed=0):
    d = cv2.fastNlMeansDenoisingColored(bgr, None, 1.4, 2.0, 5, 15)
    up = cv2.resize(d, (d.shape[1] * 2, d.shape[0] * 2), interpolation=cv2.INTER_LANCZOS4)
    lab = cv2.cvtColor(up, cv2.COLOR_BGR2LAB); L = lab[..., 0].astype(np.float32)
    bl = cv2.GaussianBlur(L, (0, 0), 1.6); L = np.clip(L + 1.0 * (L - bl), 0, 255)                                   # нерезкая маска
    cl = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(6, 6)).apply(L.astype(np.uint8)).astype(np.float32); L = L * .70 + cl * .30
    rng = np.random.default_rng(100 + seed); L = np.clip(L + rng.normal(0, 2.3, L.shape).astype(np.float32) * (1 - np.abs(L - 128) / 160), 0, 255)   # зерно слабее в тенях и бликах
    lab[..., 0] = L.astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def main():
    ids = [t['id'] for t in json.load(open(os.path.join(ROOT, 'data', 'redesign.json'), encoding='utf-8'))['teachers']['items']]
    od = os.path.join(ROOT, 'assets', 'teachers', 'hq2'); os.makedirs(od, exist_ok=True)
    for i, tid in enumerate(ids):
        src = os.path.join(ROOT, 'assets', 'teachers', 'hq', tid + '.webp'); im = cv2.imread(src, cv2.IMREAD_COLOR)
        if im is None:
            from PIL import Image
            im = cv2.cvtColor(np.asarray(Image.open(src).convert('RGB')), cv2.COLOR_RGB2BGR)
        out = enhance(im, i); cv2.imwrite('/tmp/ag_%s.png' % tid, out); cv2.imwrite(os.path.join(od, tid + '.webp'), out, [cv2.IMWRITE_WEBP_QUALITY, 88])
        print(tid, im.shape[1::-1], '->', out.shape[1::-1], os.path.getsize(os.path.join(od, tid + '.webp')) // 1024, 'КБ')


if __name__ == '__main__':
    main()
