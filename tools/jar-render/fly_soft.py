#!/usr/bin/env python3
"""Мягкий вход в журнал: добавляет в дорожку камеры пролёта assets/house-hall/cam-f.json массив `back`.

Камера пролёта к концу переходит от наклонного вида к виду строго сверху. Ближний край раскрытой книги при этом
раздувается до ≈1290 px, а затем возвращается к конечным ≈1211 px (замер на кадре 1920 px): со стороны это выглядит
как «выпрыгивание вперёд». Ключевые кадры нарисованы по исходной дорожке и не меняются; `back[i]` — на сколько
камера ТЕКУЩЕГО вида отодвигается назад вдоль оси взгляда (в единицах сцены), чтобы ширина книги в кадре росла
монотонно и не превышала конечную. Движок берёт позы ключей из `pos`, а вид — из `pos − f·back` (js/jar-gl.js, camTrack.view).

Запуск:  python3 tools/jar-render/fly_soft.py [--cam assets/house-hall/cam-f.json] [--data data/redesign.json] [--check]   (apply_fly.py вызывает его сам)
Идемпотентен: `back` пересчитывается заново по исходным pos/tgt/up/lens.
"""
import json, math, re, sys, argparse

ap = argparse.ArgumentParser()
ap.add_argument('--cam', default='assets/house-hall/cam-f.json')
ap.add_argument('--data', default='data/redesign.json')
ap.add_argument('--w', type=float, default=1920.0)
ap.add_argument('--smooth', type=int, default=10, help='полуширина скругления цели, отсчётов')
ap.add_argument('--check', action='store_true')
ap.add_argument('--mobile', action='store_true', help='телефон: портретный кадр 900×1600, данные — house.fly.mobile, зона клика не пишется (её считает hall_table.py hot --portrait)')
a = ap.parse_args()

cam = json.load(open(a.cam, encoding='utf8'))
fly = json.load(open(a.data, encoding='utf8'))['house']['fly']
if a.mobile: fly = dict(fly['mobile'], F=fly['F'])
B, F = fly['book'], fly['F']
PW, PH = (900.0, 1600.0) if a.mobile else (a.w, a.w * 9 / 16)
P, POS, TGT, UP, LENS = cam['p'], cam['pos'], cam['tgt'], cam['up'], cam['lens']
M = len(P)
sub = lambda x, y: [x[i] - y[i] for i in range(3)]
dot = lambda x, y: sum(p * q for p, q in zip(x, y))
cross = lambda x, y: [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]]
def nrm(v):
    l = math.sqrt(dot(v, v)) or 1.0
    return [q / l for q in v]
yaw = math.radians(B['yaw']); ux, uy = math.cos(yaw), math.sin(yaw); vx, vy = -uy, ux
hw, hh = B['pw'], B['ph'] / 2
CORN = [[B['c'][0] + q[0]*hw*ux + q[1]*hh*vx, B['c'][1] + q[0]*hw*uy + q[1]*hh*vy, B['z']] for q in ([-1, 1], [1, 1], [1, -1], [-1, -1])]

def basis(i):
    f = nrm(sub(TGT[i], POS[i])); r = nrm(cross(f, UP[i])); u = cross(r, f)
    return f, r, u

def width(i, back):
    """ширина прямоугольника книги по крайним точкам в кадре 16:9 (px), камера отодвинута на back вдоль оси"""
    f, r, u = basis(i)
    pos = [POS[i][k] - f[k] * back for k in range(3)]
    xs = []
    for Pw in CORN:
        q = sub(Pw, pos); zt = dot(q, f); xt = dot(q, r)
        S = 36.0 / LENS[i] * zt
        xs.append((0.5 + xt / (S * PW / PH)) * PW if a.mobile else (0.5 + xt / S) * a.w)
    return max(xs) - min(xs)

n_end = min(M - 1, int(round(F * (M - 1))))               # отсчёт конца пролёта (p = F)
w0 = [width(i, 0.0) for i in range(M)]
Wf = w0[n_end]
# целевая ширина: не больше конечной и неубывающая — книга растёт и «встаёт», но не перелетает.
# Излом min(w, Wf) скругляем треугольным окном: скругление выпуклой функции только понижает её, поэтому цель остаётся ≤ min(w, Wf) и неубывающей
tgt = [min(w, Wf) for w in w0]
S = a.smooth
tgt_s = []
for i in range(M):
    ks = range(-S, S + 1)
    ws = [(1 - abs(k) / (S + 1)) for k in ks]
    tgt_s.append(sum(w * tgt[min(M - 1, max(0, i + k))] for w, k in zip(ws, ks)) / sum(ws))
tgt_s = [min(tgt_s[i], tgt[i]) for i in range(M)]
back = [0.0] * M
for i in range(M):
    if i >= n_end or w0[i] <= tgt_s[i] + 1e-6: continue
    lo, hi = 0.0, 0.6
    for _ in range(50):
        mid = (lo + hi) / 2
        if width(i, mid) > tgt_s[i]: lo = mid
        else: hi = mid
    back[i] = round(hi, 5)
back[n_end] = 0.0

w1 = [width(i, back[i]) for i in range(M)]
mono = all(w1[i + 1] >= w1[i] - 0.6 for i in range(n_end))
print('Wf=%.1f px  макс. ширина до: %.1f (%.1f%%)  после: %.1f (%.1f%%)  отодвигание макс. %.4f (дистанция ≈ %.3f)  монотонно: %s' % (
    Wf, max(w0), (max(w0) / Wf - 1) * 100, max(w1[:n_end + 1]), (max(w1[:n_end + 1]) / Wf - 1) * 100, max(back), dot(sub([B['c'][0], B['c'][1], B['z']], POS[n_end]), basis(n_end)[0]), mono))
# зона клика по журналу на столике в кадре героя (ключ 0): рамка углов разворота в долях кадра 16:9 с запасом — сайт кладёт на неё кнопку (house.fly.hot)
def hot_rect(pad_u=.012, pad_v=.022):
    f, r, u = basis(0)
    us, vs = [], []
    for Pw in CORN:
        q = sub(Pw, POS[0]); zt = dot(q, f); xt = dot(q, r); yt = dot(q, u); S = 36.0 / LENS[0] * zt
        us.append(0.5 + xt / S); vs.append(0.5 - yt / (S * 9.0 / 16.0))
    return [round(min(us) - pad_u, 4), round(min(vs) - pad_v, 4), round(max(us) + pad_u, 4), round(max(vs) + pad_v, 4)]
hot = hot_rect()
print('зона клика по журналу в кадре героя (u0, v0, u1, v1):', hot)
def write_hot():
    t = open(a.data, encoding='utf8').read()
    m = re.search(r'("fly": \{[^\n]*?)"hot": \[[^\]]*\], ', t)
    if m: t = t[:m.start()] + m.group(1) + '"hot": ' + json.dumps(hot) + ', ' + t[m.end():]
    else:
        m = re.search(r'"fly": \{', t); t = t[:m.end()] + '"hot": ' + json.dumps(hot) + ', ' + t[m.end():]
    json.loads(t); open(a.data, 'w', encoding='utf8').write(t)
if not a.check and not a.mobile: write_hot()
if a.check:
    for i in range(0, n_end + 1, 4): print('p=%.3f  w=%.0f -> %.0f  back=%.4f' % (P[i], w0[i], w1[i], back[i]))
else:
    cam['back'] = back
    json.dump(cam, open(a.cam, 'w', encoding='utf8'), separators=(', ', ': '))
    print('записано:', a.cam)
