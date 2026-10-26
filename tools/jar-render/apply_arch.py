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
    sd, sm = td['sphere'][-1], tp['sphere'][-1]
    pct = lambda v: round(v * 100, 3)
    panel = json.dumps(arch['panel'], ensure_ascii=False, indent=2).replace('\n', '\n      ')
    new = '''"jar": {
    "_note": "Первый экран главной (data-mode=arch, js/jar.js): закреплённая сцена — зал с арками (Blender, tools/jar-render/hall_story.py → encode_arch.py → assets/jar-arch). Сцена открывается заставкой: баночка крупно по центру, внизу «Листайте»; по прокрутке камера отъезжает («наезд с отъездом»), баночка уходит на подиум и встаёт одна посередине, затем поверх встаёт герой. Старого тёмного вступления и экрана с лозунгом больше нет. Три слоя: кадры зала без баночки (набор d/m и запечённые промежуточные dm/mm), отдельный чёткий спрайт баночки по кадрам (j/jm, прозрачный, рамки rects — доля кадра) и живой каменный шар (js/sphere.js, WebGL) — он неподвижен в прокрутке. Выключить: enabled=false (останется прежний герой с шаром и орбитами).",
    "enabled": true,
    "cue": "Листайте",
    "arch": {
      "_note": "frames — число кадров; p — положения кадров по сценарию (0…end, после end сцена держит последний кадр), pb — положения лёгкого набора (с запечёнными промежуточными). sphere — положение шара в %% кадра (центр и диаметр; у телефона — своё), tex — карты шара. jar — спрайты баночки: dir — папка, rects — рамка (левый верхний угол, ширина, высота в долях кадра) для каждого кадра. Тексты героя — из content.json → home; в панели число городов и брендов считается из данных.",
      "enabled": true,
      "frames": %d,
      "ext": "webp",
      "desktop": "assets/jar-arch/d/",
      "mobile": "assets/jar-arch/m/",
      "lite": {"desktop": "assets/jar-arch/dm/", "mobile": "assets/jar-arch/mm/"},
      "heightVh": {"desktop": %d, "mobile": %d},
      "alt": "%s",
      "sphere": {
        "desktop": {"cx": %s, "cy": %s, "d": %s},
        "mobile": {"cx": %s, "cy": %s, "d": %s},
        "tex": {"a": "assets/jar-arch/sphere-a.webp", "n": "assets/jar-arch/sphere-n.webp", "poster": "assets/jar-arch/stone-sphere.webp"}
      },
      "jar": {
        "ext": "webp",
        "desktop": {"dir": "assets/jar-arch/j/", "rects": %s},
        "mobile": {"dir": "assets/jar-arch/jm/", "rects": %s}
      },
      "panel": %s,
      "p": %s,
      "pb": %s
    }
  }''' % (n, arch['heightVh']['desktop'], arch['heightVh']['mobile'], arch['alt'].replace('"', '\\"'),
          pct(sd[0]), pct(sd[1]), pct(sd[2]), pct(sm[0]), pct(sm[1]), pct(sm[2]),
          arr(td['rects']), arr(tp['rects']), panel, arr(P['p']), arr(P['pb']))
    s = s[:i] + new + s[j:]
    json.loads(s)
    open(path, 'w', encoding='utf8').write(s)
    print('jar: кадров', n, '| p', len(P['p']), 'pb', len(P['pb']), '| рамок', len(td['rects']), len(tp['rects']))


if __name__ == '__main__':
    main()
