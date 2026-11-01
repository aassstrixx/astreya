#!/usr/bin/env python3
"""Записывает в data/redesign.json блок house.arch — набор кадров ЗАЛА дома (отдельный от jar.arch боевой главной): число кадров и положения p (p-d.json от encode_arch.py),
пути к картам глубины, дорожкам камеры и спрайтам баночки, рамки баночки по кадрам (track-*.json от house_story.py track), вид заставки.
Пока блока нет или он выключен, страница дома использует кадры прежней заставки (jar.arch), а боевая главная кадры дома не видит никогда.

    python3 apply_house.py --p ../../assets/house-hall/p-d.json --track-d /tmp/house_track-d.json --track-p /tmp/house_track-p.json [--redesign ../../data/redesign.json]
"""
import json
import os
import sys

from apply_arch import arr, block_span

HALL = 'assets/house-hall/'

# вид заставки — тот же, что у боевой главной (jar.arch.look): сцена прежняя (подиум, баночка, путь баночки), кадры зала отличаются только зоной ожидания; центр баночки на первом кадре считается по новым спрайтам


def centres(root, td, tp):
    """видимый центр баночки по вертикали в долях кадра на первом кадре (по прозрачности первого спрайта) — как в apply_arch.jar_centres, но для кадров зала"""
    import numpy as np
    from PIL import Image
    out = []
    for d, tr in (('j', td), ('jm', tp)):
        a = np.asarray(Image.open(os.path.join(root, HALL, d, '000.webp')).convert('RGBA'))[..., 3]
        ys = np.where((a > 40).any(1))[0]
        r = tr['rects'][0]
        out.append(round(r[1] + r[3] * (ys.min() + ys.max() + 1) / 2 / a.shape[0], 4))
    return out


def main():
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    path = os.path.abspath(opt('--redesign', '../../data/redesign.json'))
    root = os.path.dirname(os.path.dirname(path))
    P = json.load(open(opt('--p'), encoding='utf8'))
    td = json.load(open(opt('--track-d')))
    tp = json.load(open(opt('--track-p')))
    s = open(path, encoding='utf8').read()
    i, j = block_span(s, 'jar')
    jar = json.loads('{' + s[i:j].split('{', 1)[1])['arch']                                                  # из боевого блока берём то, что не зависит от сцены (высота закрепления, подпись, чернила этикетки)
    look = json.loads(json.dumps(jar['look']))
    look['center'] = centres(root, td, tp)
    alt = 'Центральный зал ASTREYA HOUSE: каменный подиум с баночкой Астрея, шар и гора, стеклянный столик с журналом и два дивана — зона ожидания, арочные проходы в комнаты дома'
    tex = jar.get('sphereTex') or {}
    new = '''"arch": {
      "_note": "Кадры зала дома (tools/jar-render/house_story.py → encode_arch.py → assets/house-hall/, записывает tools/jar-render/apply_house.py). Пока блока нет или enabled=false — страница дома берёт кадры прежней заставки (jar.arch); боевая главная этот блок не читает.",
      "enabled": true,
      "frames": %d,
      "ext": "webp",
      "desktop": "%sd/",
      "mobile": "%sm/",
      "depth": {"ext": "webp", "desktop": "%szd/", "mobile": "%szm/"},
      "cam": {"desktop": "%scam-d.json", "mobile": "%scam-m.json"},
      "label": "%s",
      "sphereTex": {"a": "%s", "n": "%s"},
      "ink": %s,
      "heightVh": {"desktop": %d, "mobile": %d},
      "alt": "%s",
      "sphere": {"desktop": %s, "mobile": %s},
      "jar": {
        "ext": "webp",
        "desktop": {"dir": "%sj/", "rects": %s},
        "mobile": {"dir": "%sjm/", "rects": %s}
      },
      "look": %s,
      "poster": {"desktop": "%sposter-d.webp", "mobile": "%sposter-m.webp"},
      "p": %s
    }''' % (len(P['p']), HALL, HALL, HALL, HALL, HALL, HALL, jar['label'], tex.get('a', ''), tex.get('n', ''), jar.get('ink', 0.43), jar['heightVh']['desktop'], jar['heightVh']['mobile'], alt,
            arr(td['sphere']), arr(tp['sphere']), HALL, arr(td['rects']), HALL, arr(tp['rects']), json.dumps(look, ensure_ascii=False), HALL, HALL, arr(P['p']))
    hi, hj = block_span(s, 'house')
    body = s[hi:hj]
    if '"arch": {' in body:
        ai, aj = block_span(body, 'arch')
        body = body[:ai] + new + body[aj:]
    else:
        k = body.index('{') + 1
        body = body[:k] + '\n    ' + new + ',' + body[k:]
    s = s[:hi] + body + s[hj:]
    json.loads(s)
    open(path, 'w', encoding='utf8').write(s)
    print('house.arch: кадров', len(P['p']), '| рамок', len(td['rects']), len(tp['rects']))


if __name__ == '__main__':
    main()
