#!/usr/bin/env python3
"""Сборка пролёта камеры к журналу для ТЕЛЕФОНА (портретный кадр 900×1600) — парный к apply_fly.py (ПК).

Исходники: phone_fly_render.sh (ключи цвета c/, глубины z/, расписание sched.json, дорожка cam-f.json, углы журнала book.json в --fly),
запечённая баночка: python3 cap_hero_jar.js … --mobile, затем bake_jar.py --mobile --out <папка> (c/, z/, key0.png, z0.png).

    python3 apply_fly_m.py --fly /tmp/zone/pff --bake /tmp/zone/jarbake_m [--F .30]

Пишет assets/house-hall/{ffm,fzm,fjm}/, cam-fm.json и блок house.fly.mobile в data/redesign.json (тот же вид, что у ПК: n, p, dir, depth, jar, cam, rects, F, rect — рамка разворота в последнем ключе,
book — углы разворота в мире, bake). Затем fly_soft.py --mobile добавляет в дорожку массив back (мягкий вход).
"""
import json, math, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..')); A = os.path.join(ROOT, 'assets', 'house-hall')
def opt(k, d=None):
    a = sys.argv[1:]; return a[a.index(k) + 1] if k in a else d
fly = opt('--fly', '/tmp/zone/pff'); bake = opt('--bake'); F = float(opt('--F', .30))
sched = json.load(open(os.path.join(fly, 'sched.json')))['ws']; K = len(sched)
cdir = os.path.join(bake, 'c') if bake else os.path.join(fly, 'c'); zdir = os.path.join(bake, 'z') if bake else os.path.join(fly, 'z')
key0 = os.path.join(bake, 'key0.png') if bake else opt('--key0'); z0 = os.path.join(bake, 'z0.png') if bake else opt('--z0')
for k in range(1, K):
    for d in (cdir, zdir):
        if not os.path.exists(os.path.join(d, '%03d.png' % k)): raise SystemExit('нет ключа %d: %s' % (k, os.path.join(d, '%03d.png' % k)))
if not (key0 and z0 and os.path.exists(key0) and os.path.exists(z0)): raise SystemExit('нужны key0.png и z0.png (ключ 0 — последний кадр зала)')
tmp = os.path.join(fly, 'build'); shutil.rmtree(tmp, ignore_errors=True)
for d in ('png', 'z'): os.makedirs(os.path.join(tmp, d))
for sub in ('ffm', 'fzm', 'fjm'): shutil.rmtree(os.path.join(A, sub), ignore_errors=True)
shutil.copyfile(key0, os.path.join(tmp, 'png', '000.png'))
for k in range(1, K): shutil.copyfile(os.path.join(cdir, '%03d.png' % k), os.path.join(tmp, 'png', '%03d.png' % k))
subprocess.check_call([sys.executable, os.path.join(HERE, 'encode_arch.py'), os.path.join(tmp, 'png'), os.path.join(A, 'ffm'), '--size', '900x1600', '--end', '1.0', '--q', '90'])
try: os.remove(os.path.join(A, 'p-ffm.json'))
except OSError: pass
shutil.copyfile(z0, os.path.join(tmp, 'z', '000.png'))
for k in range(1, K): shutil.copyfile(os.path.join(zdir, '%03d.png' % k), os.path.join(tmp, 'z', '%03d.png' % k))
subprocess.check_call([sys.executable, os.path.join(HERE, 'encode_depth.py'), 'depth', os.path.join(tmp, 'z'), os.path.join(A, 'fzm')])
os.makedirs(os.path.join(A, 'fjm')); shutil.copyfile(os.path.join(A, 'jm', '059.webp'), os.path.join(A, 'fjm', '000.webp'))      # баночка запечена в ключи; спрайт — только ключ 0
shutil.copyfile(os.path.join(fly, 'cam-f.json'), os.path.join(A, 'cam-fm.json'))
red = os.path.join(ROOT, 'data', 'redesign.json'); t = open(red, encoding='utf8').read(); d = json.loads(t)
jr = d['house']['arch']['jar']['mobile']['rects'][59]
b = json.load(open(os.path.join(fly, 'book.json')))
book = {'c': [round(v, 5) for v in b['center']], 'yaw': round(b['yaw_deg'], 3), 'pw': round(b['pw'], 5), 'ph': round(b['pw'] * 4 / 3, 5), 'z': round((b['objs']['mag_pg_l']['max'][2] + b['objs']['mag_pg_r']['max'][2]) / 2, 5)}
# рамка разворота в последнем ключе (доли кадра 9:16): по камере конца пролёта
cam = json.load(open(os.path.join(fly, 'cam-f.json'))); M = len(cam['p']); i = min(M - 1, int(round(F * (M - 1))))
sub = lambda x, y: [x[q] - y[q] for q in range(3)]; dot = lambda x, y: sum(p * q for p, q in zip(x, y))
cross = lambda x, y: [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]]
nrm = lambda v: [q / (math.sqrt(dot(v, v)) or 1.0) for q in v]
f = nrm(sub(cam['tgt'][i], cam['pos'][i])); r = nrm(cross(f, cam['up'][i])); u = cross(r, f)
yaw = math.radians(book['yaw']); ux, uy = math.cos(yaw), math.sin(yaw); vx, vy = -uy, ux; hw, hh = book['pw'], book['ph'] / 2
us, vs = [], []
for q in ([-1, 1], [1, 1], [1, -1], [-1, -1]):
    Pw = [book['c'][0] + q[0]*hw*ux + q[1]*hh*vx, book['c'][1] + q[0]*hw*uy + q[1]*hh*vy, book['z']]; qq = sub(Pw, cam['pos'][i])
    zt = dot(qq, f); S = 36.0 / cam['lens'][i] * zt; us.append(0.5 + dot(qq, r) / (S * 9 / 16)); vs.append(0.5 - dot(qq, u) / S)
rect = [round(min(us), 5), round(min(vs), 5), round(max(us), 5), round(max(vs), 5)]
mob = {'enabled': True, 'n': K, 'ext': 'webp', 'dir': 'assets/house-hall/ffm/', 'depth': 'assets/house-hall/fzm/', 'jar': 'assets/house-hall/fjm/', 'cam': 'assets/house-hall/cam-fm.json',
       'p': [round(w * F, 6) for w in sched], 'rects': [[round(v, 5) for v in jr]] * K, 'rect': rect, 'book': book, 'bake': bool(bake)}
d['house']['fly']['mobile'] = mob
m = re.search(r'\n    "fly": \{[^\n]*\},?', t)
line = '\n    "fly": ' + json.dumps(d['house']['fly'], ensure_ascii=False) + ','
t = t[:m.start()] + line + t[m.end():]; json.loads(t); open(red, 'w', encoding='utf8').write(t)
print('house.fly.mobile записан: ключей', K, 'рамка разворота', rect)
subprocess.check_call([sys.executable, os.path.join(HERE, 'fly_soft.py'), '--mobile', '--cam', os.path.join(A, 'cam-fm.json'), '--data', red], cwd=ROOT)
