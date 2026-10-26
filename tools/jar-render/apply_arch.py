#!/usr/bin/env python3
"""Собирает блок jar в data/redesign.json из итогов рендера: число кадров и положения p / pb (p-d.json от encode_arch.py), рамки баночки по кадрам (track-d.json,
track-p.json от hall_story.py track) и положение неподвижного шара.

    python3 apply_arch.py --p ../../assets/jar-arch/p-d.json --track-d /tmp/track-d.json --track-p /tmp/track-p.json [--redesign ../../data/redesign.json]
"""
import json
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
    sref = lambda t: round(min(max(x[2] for x in t['sphere']), max(t['sphere'][-1][2] * 1.6, .1)), 4)       # размер холста шара: не больше 1,6 диаметра в готовом кадре — шар не размывается, пока камера далеко
    panel = json.dumps(arch['panel'], ensure_ascii=False, indent=2).replace('\n', '\n      ')
    new = '''"jar": {
    "_note": "Первый экран главной (data-mode=arch, js/jar.js): закреплённая сцена — зал с арками (Blender, tools/jar-render/hall_story.py → encode_arch.py → assets/jar-arch). «Световая лаборатория»: баночка с первого кадра стоит на каменном подиуме (в полумраке, в узком луче света, внизу «Листайте»); по прокрутке двигается только камера — лёгкая дуга вокруг баночки, затем отъезд: из полумрака проявляются стены, матовое стекло, ниша с продукцией, шар; луч растворяется в мягком тёплом свете, поверх встаёт герой. Баночка ни в одном кадре не парит. Старого тёмного вступления и экрана с лозунгом больше нет. Три слоя: кадры зала без баночки (набор d/m и запечённые промежуточные dm/mm), отдельный чёткий спрайт баночки по кадрам (j/jm, прозрачный, рамки rects — доля кадра) и живой каменный шар (js/sphere.js, WebGL), привязанный к миру: его положение и размер даёт та же камера. Выключить: enabled=false (останется прежний герой с шаром и орбитами).",
    "enabled": true,
    "cue": "Листайте",
    "arch": {
      "_note": "frames — число кадров; p — положения кадров по сценарию (0…end, после end сцена держит последний кадр), pb — положения лёгкого набора (с запечёнными промежуточными). sphere — положение шара по кадрам (центр и диаметр в долях ширины кадра; у телефона — своё), tex — карты шара; lit — освещённость зала по кадрам (0…1; шар на сайте темнеет вместе с залом). jar — спрайты баночки: dir — папка, rects — рамка (левый верхний угол, ширина, высота в долях кадра) для каждого кадра. Тексты героя — из content.json → home; в панели число городов и брендов считается из данных.",
      "enabled": true,
      "frames": %d,
      "ext": "webp",
      "desktop": "assets/jar-arch/d/",
      "mobile": "assets/jar-arch/m/",
      "lite": {"desktop": "assets/jar-arch/dm/", "mobile": "assets/jar-arch/mm/"},
      "heightVh": {"desktop": %d, "mobile": %d},
      "alt": "%s",
      "sphere": {
        "desktop": {"ref": %s, "track": %s},
        "mobile": {"ref": %s, "track": %s},
        "tex": {"a": "assets/jar-arch/sphere-a.webp", "n": "assets/jar-arch/sphere-n.webp", "poster": "assets/jar-arch/stone-sphere.webp"}
      },
      "jar": {
        "ext": "webp",
        "desktop": {"dir": "assets/jar-arch/j/", "rects": %s},
        "mobile": {"dir": "assets/jar-arch/jm/", "rects": %s}
      },
      "lit": %s,
      "panel": %s,
      "p": %s,
      "pb": %s
    }
  }''' % (n, arch['heightVh']['desktop'], arch['heightVh']['mobile'], arch['alt'].replace('"', '\\"'),
          sref(td), arr(td['sphere']), sref(tp), arr(tp['sphere']),
          arr(td['rects']), arr(tp['rects']), arr(td['lit']), panel, arr(P['p']), arr(P['pb']))
    s = s[:i] + new + s[j:]
    json.loads(s)
    open(path, 'w', encoding='utf8').write(s)
    print('jar: кадров', n, '| p', len(P['p']), 'pb', len(P['pb']), '| рамок', len(td['rects']), len(tp['rects']))


if __name__ == '__main__':
    main()
