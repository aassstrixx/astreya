#!/usr/bin/env python3
"""Кадры пролёта камеры к журналу (hall_table.py flight) → assets/house-hall/fd (ПК) и fm (телефон), WebP; рамка журнала в последнем кадре и число кадров — в data/redesign.json → house.reader.flight.
Страница (js/house.js) проигрывает эти кадры прокруткой и в конце совмещает нарисованный журнал с живым по рамке rect (доли кадра).

    python3 apply_flight.py --d /tmp/zone/fl_d --p /tmp/zone/fl_p [--q 80] [--redesign ../../data/redesign.json]
"""
import json
import os
import re
import sys

from PIL import Image


def encode(src, dst, q):
    os.makedirs(dst, exist_ok=True)
    meta = json.load(open(os.path.join(src, 'flight.json')))
    n = meta['n']
    total = 0
    for i in range(1, n + 1):
        im = Image.open(os.path.join(src, '%03d.png' % i)).convert('RGB')
        out = os.path.join(dst, '%03d.webp' % i)
        im.save(out, quality=q, method=6)
        total += os.path.getsize(out)
    print(dst, n, 'кадров,', total // 1024, 'КБ, рамка журнала', meta['rect'])
    return meta


def main():
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    red = os.path.abspath(opt('--redesign', os.path.join(root, 'data', 'redesign.json')))
    q = int(opt('--q', 80))
    md = encode(opt('--d'), os.path.join(root, 'assets', 'house-hall', 'fd'), q)
    mp = encode(opt('--p'), os.path.join(root, 'assets', 'house-hall', 'fm'), q)
    assert md['n'] == mp['n'], 'число кадров ПК и телефона разное'
    fl = {'n': md['n'], 'ext': 'webp', 'desktop': {'dir': 'assets/house-hall/fd/', 'rect': md['rect']}, 'mobile': {'dir': 'assets/house-hall/fm/', 'rect': mp['rect']}}
    t = open(red, encoding='utf8').read()
    m = re.search(r'"reader": \{[^\n]*\}', t)
    assert m, 'нет блока house.reader'
    cur = json.loads(m.group(0)[len('"reader": '):])
    cur['flight'] = fl
    t = t[:m.start()] + '"reader": ' + json.dumps(cur, ensure_ascii=False) + t[m.end():]
    json.loads(t)
    open(red, 'w', encoding='utf8').write(t)
    print('house.reader.flight записан:', fl['n'], 'кадров')


if __name__ == '__main__':
    main()
