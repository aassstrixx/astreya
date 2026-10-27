#!/usr/bin/env python3
"""Собирает блок jar в data/redesign.json из итогов рендера: число кадров и положения p (p-d.json от encode_arch.py), пути к картам глубины, дорожке камеры и этикетке, рамки баночки по кадрам (track-d.json,
track-p.json от hall_story.py track) и положение неподвижного шара.

    python3 apply_arch.py --p ../../assets/jar-arch/p-d.json --track-d /tmp/track-d.json --track-p /tmp/track-p.json [--ink 0.5] [--redesign ../../data/redesign.json]
"""
import json
import os
import sys


def block_span(s, key):
    i = s.index('"%s": {' % key)
    j = s.index('{', i)
    depth, k, ins = 0, j, False
    while True:
        c = s[k]
        if ins:
            if c == '\\':
                k += 1
            elif c == '"':
                ins = False
        else:
            if c == '"':
                ins = True
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return i, k + 1
        k += 1


def arr(a):
    return json.dumps(a, separators=(',', ':'), ensure_ascii=False)


def jar_centres(data_dir, td, tp):
    """видимый центр баночки по вертикали в долях кадра на первом кадре: рамка спрайта (rects[0]) × доля непрозрачных строк спрайта j/000.webp (ПК) и jm/000.webp (телефон)"""
    import numpy as np
    from PIL import Image
    out = []
    for d, tr in (('j', td), ('jm', tp)):
        a = np.asarray(Image.open(os.path.join(data_dir, '..', 'assets', 'jar-arch', d, '000.webp')).convert('RGBA'))[..., 3]
        ys = np.where((a > 40).any(1))[0]
        r = tr['rects'][0]
        out.append(round(r[1] + r[3] * (ys.min() + ys.max() + 1) / 2 / a.shape[0], 4))
    return out


# вид заставки: scale — во сколько раз баночка меньше на старте (ПК, телефон; до p=from — постоянно, от from до to плавно возвращается к натуральной, пока камера отъезжает и она уходит к подиуму); liftFrom…liftTo — где сходит на нет подъём к центру экрана; shadow — с какого ключевого кадра тень баночки запечена в кадр (до него её рисует сайт, живую);
# amount — сила живой тени, contact — затемнение у касания
LOOK = {"scale": {"desktop": 0.58, "mobile": 0.70, "from": 0.46, "to": 0.62, "liftFrom": 0.10, "liftTo": 0.40}, "shadow": {"from": {"desktop": 49, "mobile": 0}, "amount": 1, "contact": 0.42, "veil": 0.26, "veilCut": 0.5}, "ground": {"amount": 0.24, "from": 0.10, "to": 0.40}}


def main():
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    path = opt('--redesign', '../../data/redesign.json')
    P = json.load(open(opt('--p'), encoding='utf8'))
    td = json.load(open(opt('--track-d')))
    tp = json.load(open(opt('--track-p')))
    s = open(path, encoding='utf8').read()
    i, j = block_span(s, 'jar')
    old = json.loads('{' + s[i:j].split('{', 1)[1])
    arch = old['arch']
    n = len(P['p'])
    panel = json.dumps(arch['panel'], ensure_ascii=False, indent=2).replace('\n', '\n      ')
    ink = float(opt('--ink', arch.get('ink', 0.43)))
    look = dict(arch.get('look', LOOK))
    look['center'] = jar_centres(os.path.dirname(os.path.abspath(path)), td, tp)                    # где у баночки в первом кадре её видимый центр (по прозрачности спрайта): заставка ставит его ровно в середину экрана
    look = json.dumps(look, ensure_ascii=False)                                   # вид заставки (размер баночки, живая тень) — правится вручную в redesign.json и сохраняется
    new = '''"jar": {
    "_note": "Первый экран главной (data-mode=arch, js/jar.js + js/jar-gl.js, WebGL2): закреплённая сцена — зал с арками (Blender, tools/jar-render/hall_story.py → encode_arch.py / encode_depth.py → assets/jar-arch). Заставка: баночка крупно по центру на светлом бежевом фоне (первые кадры зала закрыты светлым размытием), внизу «Листайте»; по прокрутке она раскручивается (полный оборот) и дугой уходит на свой подиум, камера отъезжает к общему плану, затем поверх встаёт герой. Кадры зала — ключевые (набор d/m) с картами глубины (zd/zm); для любого положения прокрутки два соседних кадра перепроецируются на камеру по дорожке камеры (cam-d/cam-m) — ни двоения, ни дребезга, одинаковая чёткость в движении и в покое. Баночка — отдельный слой: спрайт без этикетки (j/jm) + надписи этикетки (label.webp) рисуются по геометрии цилиндра, поэтому вращение плавное. Каменный шар запечён в кадры. Выключить: enabled=false (останется прежний герой с шаром и орбитами), затем node tools/build.js.",
    "enabled": true,
    "cue": "Листайте",
    "arch": {
      "_note": "frames — число ключевых кадров; p — положения кадров по сценарию (0…end, после end сцена держит последний кадр). depth — карты глубины кадров (16-битная обратная глубина в R/G, WebP без потерь), cam — дорожка камеры и баночки по сценарию (591 отсчёт), label — маска надписей этикетки, ink — насколько чернила темнят корпус (множитель яркости). sphere — где шар стоит в готовом кадре (центр x, центр y, диаметр — доли кадра; у телефона своё): вокруг него встают орбиты логотипов; сам шар запечён в кадры. jar — спрайты баночки без этикетки: dir — папка, rects — рамка (левый верхний угол, ширина, высота в долях кадра) для каждого кадра. Тексты героя — из content.json → home; в панели число городов и брендов считается из данных.",
      "enabled": true,
      "frames": %d,
      "ext": "webp",
      "desktop": "assets/jar-arch/d/",
      "mobile": "assets/jar-arch/m/",
      "depth": {"ext": "webp", "desktop": "assets/jar-arch/zd/", "mobile": "assets/jar-arch/zm/"},
      "cam": {"desktop": "assets/jar-arch/cam-d.json", "mobile": "assets/jar-arch/cam-m.json"},
      "label": "assets/jar-arch/label.webp",
      "ink": %s,
      "heightVh": {"desktop": %d, "mobile": %d},
      "alt": "%s",
      "sphere": {"desktop": %s, "mobile": %s},
      "jar": {
        "ext": "webp",
        "desktop": {"dir": "assets/jar-arch/j/", "rects": %s},
        "mobile": {"dir": "assets/jar-arch/jm/", "rects": %s}
      },
      "look": %s,
      "panel": %s,
      "p": %s
    }
  }''' % (n, ink, arch['heightVh']['desktop'], arch['heightVh']['mobile'], arch['alt'].replace('"', '\\"'),
          arr(td['sphere']), arr(tp['sphere']),
          arr(td['rects']), arr(tp['rects']), look, panel, arr(P['p']))
    s = s[:i] + new + s[j:]
    json.loads(s)
    open(path, 'w', encoding='utf8').write(s)
    print('jar: кадров', n, '| p', len(P['p']), '| рамок', len(td['rects']), len(tp['rects']))


if __name__ == '__main__':
    main()
