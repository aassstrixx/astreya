"""Арена №3: метрики чёткости. Сравнивает отрисованное в canvas (sharp-run.js) с исходником без потерь, приведённым к размеру холста.
    PYTHONPATH=<cv2> python3 sharp-eval.py <папка_кандидатов> <ширина_холста>
SSIM — структурное сходство (1 = идентично), PSNR — дБ, SSIM-детали — SSIM только по самым контрастным 15 % пикселей (границы, текст этикетки)."""
import json, os, sys
import cv2, numpy as np
d, CW = sys.argv[1], int(sys.argv[2])
meta = json.load(open(os.path.join(d, 'meta.json')))

def ssim(a, b, mask=None):
    a = a.astype(np.float64); b = b.astype(np.float64); C1, C2 = 6.5025, 58.5225
    mu1 = cv2.GaussianBlur(a, (11, 11), 1.5); mu2 = cv2.GaussianBlur(b, (11, 11), 1.5)
    s11 = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu1 ** 2; s22 = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu2 ** 2; s12 = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu1 * mu2
    m = ((2 * mu1 * mu2 + C1) * (2 * s12 + C2)) / ((mu1 ** 2 + mu2 ** 2 + C1) * (s11 + s22 + C2))
    return float(m.mean() if mask is None else m[mask].mean())

def energy(g):
    gx = cv2.Sobel(g.astype(np.float32), cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g.astype(np.float32), cv2.CV_32F, 0, 1, ksize=3)
    return float(np.sqrt(gx * gx + gy * gy).mean())

rows = {}
for k in meta['ks']:
    t = cv2.imread(os.path.join(d, f'truth_{k:03d}.png'))
    for name in meta['cands']:
        for q in ('low', 'high'):
            r = cv2.imread(os.path.join(d, 'out', f'{name}_{k:03d}_{CW}_{q}.png'))
            if r is None: continue
            H, W = r.shape[:2]
            s = max(W / t.shape[1], H / t.shape[0]); tw, th = round(t.shape[1] * s), round(t.shape[0] * s)
            tt = cv2.resize(t, (tw, th), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LANCZOS4)
            x0, y0 = (tw - W) // 2, (th - H) // 2; tt = tt[y0:y0 + H, x0:x0 + W]
            gt = cv2.cvtColor(tt, cv2.COLOR_BGR2GRAY); gr = cv2.cvtColor(r, cv2.COLOR_BGR2GRAY)
            # «детали»: 15 % самых контрастных по границам пикселей исходника (этикетка, кромка крышки, блики) — там и видна разница в чёткости
            gm = cv2.GaussianBlur(np.hypot(cv2.Sobel(gt.astype(np.float32), cv2.CV_32F, 1, 0), cv2.Sobel(gt.astype(np.float32), cv2.CV_32F, 0, 1)), (9, 9), 2)
            mask = gm >= np.quantile(gm, 0.85)
            rows.setdefault((name, q), []).append((ssim(gt, gr), cv2.PSNR(tt, r), ssim(gt, gr, mask)))
print(f'холст {CW} px по ширине')
print('кандидат'.ljust(14), 'КБ/кадр', 'сглаживание', ' SSIM   PSNR  SSIM-детали')
for (name, q), v in sorted(rows.items(), key=lambda kv: (kv[0][0][:2] != 'hi', kv[0][0], kv[0][1])):
    a = np.mean(v, axis=0)
    print(name.ljust(14), str(meta['kb'][name]).rjust(7), q.rjust(10), f'{a[0]:7.4f} {a[1]:6.2f} {a[2]:10.4f}')
