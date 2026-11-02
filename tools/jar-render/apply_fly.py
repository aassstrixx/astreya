#!/usr/bin/env python3
"""Сборка пролёта камеры к журналу как продолжения сцены зала (тот же движок js/jar.js + js/jar-gl.js).

Пролёт — не набор картинок, а вторая сцена движка: ключевые кадры + карты глубины + дорожка камеры (с креном) + спрайты баночки; для любого положения прокрутки движок строит вид перепроекцией
двух соседних ключей (непрерывно, 60 к/с), поверх рисует живой шар и баночку с этикеткой — тот же свет, фон, тени, зерно и резкость, что у героя (ключ 0 — сам последний кадр зала).

Исходники (tools/jar-render/hall_table.py):
  flight 72 …/fl_s (+ …/fl_hi для первых кадров в 1920×1080)   цвет: слой bg, баночка невидима камере (кадры пролёта; ключи — каждый STEP-й)
  flykeys track 72 3 …/fk/cam-f.json                           дорожка камеры
  flykeys z 72 3 …/fk/z                                        карты глубины ключей
  flykeys jar 72 3 …/fk/j                                      спрайты баночки без этикетки (+ рамки в json)

    python3 apply_fly.py [--zone /tmp/zone] [--step 3] [--n 72] [--hero-png …/bg_d_final3/059.png]

Пишет assets/house-hall/{ff,fz,fj}/, cam-f.json и блок house.fly в data/redesign.json (p ключей, рамки баночки, F, рамка журнала в последнем кадре).
"""
import json
import os
import re
import shutil
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
A = os.path.join(ROOT, 'assets', 'house-hall')


def opt(k, d=None):
    a = sys.argv[1:]
    return a[a.index(k) + 1] if k in a else d


def main():
    zone = opt('--zone', '/tmp/zone'); step = int(opt('--step', 3)); n = int(opt('--n', 72)); F = float(opt('--F', .30))
    hero_png = opt('--hero-png', os.path.join(zone, 'bg_d_final3', '059.png'))
    idx = list(range(0, n + 1, step))                                             # 0, 3, …, 72
    K = len(idx)
    tmp = os.path.join(zone, 'fk', 'build'); shutil.rmtree(tmp, ignore_errors=True)
    for d in ('png', 'z', 'j'):
        os.makedirs(os.path.join(tmp, d))
    # цвет
    for k, i in enumerate(idx):
        if i == 0:
            src = hero_png
        else:
            hi = os.path.join(zone, 'fl_hi', '%03d.png' % i)
            src = hi if os.path.exists(hi) else os.path.join(zone, 'fl_s', '%03d.png' % i)
        shutil.copyfile(src, os.path.join(tmp, 'png', '%03d.png' % k))
    subprocess.check_call([sys.executable, os.path.join(HERE, 'encode_arch.py'), os.path.join(tmp, 'png'), os.path.join(A, 'ff'), '--size', '1920x1080', '--end', '1.0', '--q', '90'])
    shutil.copyfile(os.path.join(A, 'd', '059.webp'), os.path.join(A, 'ff', '000.webp'))                  # ключ 0 — тот самый файл последнего кадра зала (зерно и пиксели те же: переход героя в пролёт не виден)
    try:
        os.remove(os.path.join(A, 'p-ff.json'))                                                    # encode_arch пишет p-<папка>.json (положения кадров) — у пролёта их задаёт house.fly.p
    except OSError:
        pass
    # глубина: ключ 0 — глубина последнего кадра зала
    for k, i in enumerate(idx):
        if i:
            shutil.copyfile(os.path.join(zone, 'fk', 'z', '%03d.png' % i), os.path.join(tmp, 'z', '%03d.png' % k))
    subprocess.check_call([sys.executable, os.path.join(HERE, 'encode_depth.py'), 'depth', os.path.join(tmp, 'z'), os.path.join(A, 'fz')])
    shutil.copyfile(os.path.join(A, 'zd', '059.webp'), os.path.join(A, 'fz', '000.webp'))
    # спрайты баночки и рамки
    rects = []
    for k, i in enumerate(idx):
        if i == 0:
            rects.append(None)                                                    # заполним рамкой кадра зала 59 (из data/redesign.json → house.arch.jar.desktop.rects)
            continue
        jj = os.path.join(zone, 'fk', 'j', '%03d.json' % i)
        r = json.load(open(jj))['rect'] if os.path.exists(jj) else None
        if r:
            shutil.copyfile(os.path.join(zone, 'fk', 'j', '%03d.png' % i), os.path.join(tmp, 'j', '%03d.png' % k))
            rects.append([round(v, 5) for v in r])
        else:
            Image.new('RGBA', (4, 4), (0, 0, 0, 0)).save(os.path.join(tmp, 'j', '%03d.png' % k))           # баночки в кадре нет: пустой спрайт (иначе движок возьмёт «ближайший загруженный»)
            rects.append([0.5, 0.5, 0.002, 0.002])
    red = os.path.join(ROOT, 'data', 'redesign.json')
    t = open(red, encoding='utf8').read(); d = json.loads(t)
    jr = d['house']['arch']['jar']['desktop']['rects'][59] if 'rects' in d['house']['arch']['jar']['desktop'] else None
    if jr is None:
        raise SystemExit('нет рамки баночки кадра 59 в house.arch.jar.desktop.rects')
    rects[0] = jr
    # ключ 0 спрайт: берём спрайт последнего кадра зала, остальные — кодируем
    subprocess.check_call([sys.executable, os.path.join(HERE, 'encode_jar.py'), os.path.join(tmp, 'j'), os.path.join(A, 'fj'), '--q', '92'])
    shutil.copyfile(os.path.join(A, 'j', '059.webp'), os.path.join(A, 'fj', '000.webp'))
    shutil.copyfile(os.path.join(zone, 'fk', 'cam-f.json'), os.path.join(A, 'cam-f.json'))
    meta = json.load(open(os.path.join(zone, 'fl_d72', 'flight.json')))
    fly = {'enabled': True, 'n': K, 'ext': 'webp', 'dir': 'assets/house-hall/ff/', 'depth': 'assets/house-hall/fz/', 'jar': 'assets/house-hall/fj/', 'cam': 'assets/house-hall/cam-f.json',
           'p': [round(i / float(n) * F, 5) for i in idx], 'rects': rects, 'F': F, 'rect': meta['rect']}
    d['house']['fly'] = fly
    # минимальная правка файла: заменяем/добавляем блок "fly" в house строкой
    m = re.search(r'\n    "fly": \{[^\n]*\},?', t)
    line = '\n    "fly": ' + json.dumps(fly, ensure_ascii=False) + ','
    if m:
        t = t[:m.start()] + line + t[m.end():]
    else:
        m2 = re.search(r'\n    "reader": \{', t)
        t = t[:m2.start()] + line + t[m2.start():]
    json.loads(t)
    open(red, 'w', encoding='utf8').write(t)
    print('house.fly записан: ключей', K, 'F', F)


if __name__ == '__main__':
    main()
