#!/usr/bin/env python3
"""Сборка пролёта камеры к журналу как продолжения сцены зала (тот же движок js/jar.js + js/jar-gl.js).

Пролёт — не набор картинок, а вторая сцена движка: ключевые кадры + карты глубины + дорожка камеры (с креном); для любого положения прокрутки движок строит вид перепроекцией
двух соседних ключей (непрерывно, 60 к/с), поверх рисует живой шар и баночку с этикеткой — тот же свет, фон, тени, зерно и резкость, что у героя.
• ключ 0 — сам последний кадр зала (тот же файл, глубина и спрайт баночки: переход героя в пролёт не виден);
• ключи расставлены неравномерно (flykeys sched): между соседними картинка меняется одинаково — гуще там, где камера летит быстрее;
• баночка — один спрайт (ключ 0, тот же, что на главной): свет и тени на крышке и корпусе те же; камера лишь переносит и масштабирует его.

Исходники (tools/jar-render/hall_table.py flykeys …, переменные FLY_WS = расписание, FLY_HIDE = объекты, которых в пролёте быть не должно):
  flykeys sched 49 1 …/fk2/sched.json            положения ключей w
  flykeys track 72 3 …/fk/cam-f.json             дорожка камеры (плотная, с «верхом» кадра)
  flykeys color 49 1 …/fk2/c --res 1920x1080     цвет ключей 1…48 (слой «всё», баночка невидима камере, но отбрасывает тень)
  flykeys z 49 1 …/fk2/z --res 960x540           карты глубины ключей 1…48

    python3 apply_fly.py [--zone /tmp/zone] [--F .30]

Пишет assets/house-hall/{ff,fz,fj}/, cam-f.json (дорожка, если лежит в зоне) и блок house.fly в data/redesign.json.
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
A = os.path.join(ROOT, 'assets', 'house-hall')


def opt(k, d=None):
    a = sys.argv[1:]
    return a[a.index(k) + 1] if k in a else d


def main():
    zone = opt('--zone', '/tmp/zone'); F = float(opt('--F', .30))
    s2 = os.path.join(zone, 'fk2', 'sched2.json')
    sched = json.load(open(s2 if os.path.exists(s2) else os.path.join(zone, 'fk2', 'sched.json')))['ws']        # sched2 — расписание, подогнанное по замеру ошибки (ключи гуще там, где перепроекция ошибается сильнее)
    old = json.load(open(os.path.join(zone, 'fk2', 'sched.json')))['ws']
    K = len(sched)
    cdir = opt('--cdir')                                                                                  # полный перерасчёт цвета (например, со стеклом другого вида): все ключи по номерам расписания sched2 лежат в этой папке
    def src(kind, j):                                                                                    # файл цвета/глубины ключа j: из первого расчёта (по совпадению w) или из дорасчёта (c2/z2, номер — по новому расписанию)
        if kind == 'c' and cdir:
            return os.path.join(cdir, '%03d.png' % j)
        for o, w0 in enumerate(old):
            if abs(w0 - sched[j]) < 2e-5:
                return os.path.join(zone, 'fk2', kind, '%03d.png' % o)
        return os.path.join(zone, 'fk2', kind + '2', '%03d.png' % j)
    for k in range(1, K):
        for kind, nm in (('c', 'цвета'), ('z', 'глубины')):
            if not os.path.exists(src(kind, k)):
                raise SystemExit('нет карты %s ключа %d: %s' % (nm, k, src(kind, k)))
    tmp = os.path.join(zone, 'fk2', 'build'); shutil.rmtree(tmp, ignore_errors=True)
    for d in ('png', 'z'):
        os.makedirs(os.path.join(tmp, d))
    for sub in ('ff', 'fz', 'fj'):
        shutil.rmtree(os.path.join(A, sub), ignore_errors=True)
    # цвет: ключ 0 — файл последнего кадра зала, остальные кодируем (зерно 1,0, резкость 0,5 — как у героя)
    hero_png = os.path.join(zone, 'bg_d_final3', '059.png')
    shutil.copyfile(hero_png, os.path.join(tmp, 'png', '000.png'))
    for k in range(1, K):
        shutil.copyfile(src('c', k), os.path.join(tmp, 'png', '%03d.png' % k))
    subprocess.check_call([sys.executable, os.path.join(HERE, 'encode_arch.py'), os.path.join(tmp, 'png'), os.path.join(A, 'ff'), '--size', '1920x1080', '--end', '1.0', '--q', '90'])
    shutil.copyfile(os.path.join(A, 'd', '059.webp'), os.path.join(A, 'ff', '000.webp'))                  # ключ 0 — тот самый файл кадра зала
    try:
        os.remove(os.path.join(A, 'p-ff.json'))                                                          # encode_arch пишет p-<папка>.json (положения кадров) — у пролёта их задаёт house.fly.p
    except OSError:
        pass
    # глубина: ключ 0 — глубина последнего кадра зала
    for k in range(1, K):
        shutil.copyfile(src('z', k), os.path.join(tmp, 'z', '%03d.png' % k))
    subprocess.check_call([sys.executable, os.path.join(HERE, 'encode_depth.py'), 'depth', os.path.join(tmp, 'z'), os.path.join(A, 'fz')])
    shutil.copyfile(os.path.join(A, 'zd', '059.webp'), os.path.join(A, 'fz', '000.webp'))
    # баночка: один спрайт — спрайт последнего кадра зала (ключ 0)
    os.makedirs(os.path.join(A, 'fj'))
    shutil.copyfile(os.path.join(A, 'j', '059.webp'), os.path.join(A, 'fj', '000.webp'))
    cf = os.path.join(zone, 'fk', 'cam-f.json')
    if os.path.exists(cf):
        shutil.copyfile(cf, os.path.join(A, 'cam-f.json'))
    red = os.path.join(ROOT, 'data', 'redesign.json')
    t = open(red, encoding='utf8').read(); d = json.loads(t)
    jr = d['house']['arch']['jar']['desktop']['rects'][59]
    meta = json.load(open(os.path.join(zone, 'fl_d72', 'flight.json')))
    fly = {'enabled': True, 'n': K, 'ext': 'webp', 'dir': 'assets/house-hall/ff/', 'depth': 'assets/house-hall/fz/', 'jar': 'assets/house-hall/fj/', 'cam': 'assets/house-hall/cam-f.json',
           'p': [round(w * F, 6) for w in sched], 'rects': [[round(v, 5) for v in jr]] * K, 'F': F, 'rect': meta['rect']}
    bk = (d['house'].get('fly') or {}).get('book')                                                        # углы разворота журнала в мире (flykeys bookq): для живой книги в полёте — берём прежние, если не пересчитывали
    bj = os.path.join(zone, 'fk2', 'book.json')
    if os.path.exists(bj):
        b = json.load(open(bj)); bk = {'c': [round(v, 5) for v in b['center']], 'yaw': round(b['yaw_deg'], 3), 'pw': round(b['pw'], 5), 'ph': (bk or {}).get('ph', 0.1914),
                                       'z': round((b['objs']['mag_pg_l']['max'][2] + b['objs']['mag_pg_r']['max'][2]) / 2, 5)}
    if bk:
        fly['book'] = bk
    d['house']['fly'] = fly
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
