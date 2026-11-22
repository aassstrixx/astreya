# пережатие цветных кадров зала без изменения размера (качество Q=82, метод 6): запуск из корня сайта — python3 tools/perf/reencode-frames.py m d ff ffm; результат во временной папке (OUT), в каталог не пишет; контроль PSNR к исходному кадру
import os, sys, io, glob, json
import numpy as np
from PIL import Image
from multiprocessing import Pool
Q = int(os.environ.get('Q', '82'))
OUT = os.environ.get('OUT') or os.path.join(os.environ.get('TMPDIR', '/tmp'), 'astreya-reenc')
os.makedirs(OUT, exist_ok=True)
def work(p):
    im = Image.open(p).convert('RGB'); s0 = os.path.getsize(p)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=Q, method=6); d = b.getvalue()
    a = np.asarray(im, dtype=np.float64); g = np.asarray(Image.open(io.BytesIO(d)).convert('RGB'), dtype=np.float64)
    mse = ((a - g) ** 2).mean(); ps = 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)
    dst = os.path.join(OUT, p.replace('/', '__'))
    keep = len(d) < s0 * 0.97                      # если выигрыша нет (уже лёгкий кадр) — оставляем как есть
    if keep: open(dst, 'wb').write(d)
    return p, s0, len(d) if keep else s0, ps if keep else 99.0, keep
if __name__ == '__main__':
    dirs = sys.argv[1:]
    files = sorted(f for d in dirs for f in glob.glob(f'assets/house-hall/{d}/*.webp'))
    with Pool(os.cpu_count()) as pool: res = pool.map(work, files, chunksize=2)
    for d in dirs:
        r = [x for x in res if f'/{d}/' in x[0]]
        a = sum(x[1] for x in r); b = sum(x[2] for x in r); ps = [x[3] for x in r if x[4]]
        print(f'{d:4s} кадров {len(r)}  {a/1048576:.2f} -> {b/1048576:.2f} МБ ({100*b/a:.0f}%)  PSNR мин {min(ps):.1f} средн {sum(ps)/len(ps):.1f} дБ  перезаписано {sum(x[4] for x in r)}')
