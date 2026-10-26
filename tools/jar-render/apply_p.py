#!/usr/bin/env python3
"""Кладёт число кадров и положения p / pb из p-d.json (их пишет encode_arch.py) в data/redesign.json → jar.arch.

    python3 apply_p.py ../../assets/jar-arch/p-d.json
"""
import json
import re
import sys


def main():
    src = json.load(open(sys.argv[1], encoding='utf8'))
    p = '../../data/redesign.json' if len(sys.argv) < 3 else sys.argv[2]
    s = open(p, encoding='utf8').read()
    i = s.index('"arch": {')
    j = s.index('"frames":', i)
    k = s.index(',', j)
    s = s[:j] + '"frames": %d' % len(src['p']) + s[k:]
    for key in ('p', 'pb'):
        m = re.compile(r'"%s": \[[^\]]*\]' % key).search(s, i)
        s = s[:m.start()] + '"%s": %s' % (key, json.dumps(src[key], separators=(',', ':'))) + s[m.end():]
    json.dump(json.loads(s), open('/dev/null', 'w'))                     # проверка: файл остался корректным JSON
    open(p, 'w', encoding='utf8').write(s)
    print('кадров', len(src['p']), 'p', len(src['p']), 'pb', len(src['pb']))


if __name__ == '__main__':
    main()
