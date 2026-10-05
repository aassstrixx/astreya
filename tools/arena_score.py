"""Замеры и турнир для арены фона (tools/arena-bg.js). Читает снимки без текста, считает по каждому варианту показатели и проводит турнир на вылет.
Показатели (чем ближе к цели, тем лучше): «присутствие» — какая доля свободных полей затенена текстурой; «рельеф» — насколько читается форма крема;
«чистота» — текстура не грязнит страницу; «мягкость» — нет резких краёв; «покой за текстом» — под заголовком и подводкой спокойно; «контраст» — запас над 4.5:1 (меньше — вариант дисквалифицирован)."""
import sys, os, json, random, numpy as np
from PIL import Image

OUT = sys.argv[1]
V = json.load(open(os.path.join(OUT, 'variants.json'))); variants, geoms = V['variants'], V['geoms']

def load(p): return np.asarray(Image.open(p).convert('RGB'), float)
def Y(a): return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
def rel_lum(c):
    c = np.asarray(c, float) / 255.0; c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
def bell(x, mu, sg): return float(np.exp(-0.5 * ((x - mu) / sg) ** 2))
def clip01(x): return float(min(1.0, max(0.0, x)))

def measure(tag, vid, base, geom):
    img = load(os.path.join(OUT, 'shots', f'{vid}_{tag}_clean.png')); h, w = img.shape[:2]; b = base[:h, :w]
    E = Y(img) - Y(b); mask = np.ones((h, w), bool)
    for c in geom['cards']:
        x0, y0, x1, y1 = int(max(0, c['x'])), int(max(0, c['y'])), int(min(w, c['x'] + c['w'])), int(min(h, c['y'] + c['h'])); mask[y0:y1, x0:x1] = False
    vis = E[mask]
    cover = float((vis < -3).mean()); sel = vis[vis < -1.5]; relief = float(sel.std()) if sel.size > 200 else 0.0; depth = float(vis.mean())
    gy, gx = np.gradient(E); g = np.hypot(gx, gy)[mask]; p99 = float(np.percentile(g, 99.5))
    mincon, calm = 99.0, []
    for t in geom['texts']:
        x0, y0, x1, y1 = int(max(0, t['x'] - 3)), int(max(0, t['y'] - 3)), int(min(w, t['x'] + t['w'] + 3)), int(min(h, t['y'] + t['h'] + 3))
        if x1 <= x0 or y1 <= y0: continue
        reg = img[y0:y1, x0:x1]; lum = rel_lum(reg); lb = float(np.percentile(lum, 3)); lt = float(rel_lum(np.array(t['color'])))
        mincon = min(mincon, (max(lb, lt) + 0.05) / (min(lb, lt) + 0.05))
        m2 = mask[y0:y1, x0:x1]
        if m2.any(): calm.append(float(np.abs(E[y0:y1, x0:x1][m2]).mean()))
    textE = float(np.mean(calm)) if calm else 0.0
    mu = 0.28 if tag == 'd' else 0.36
    s = {'presence': bell(cover, mu, 0.17), 'relief': bell(relief, 6.0, 3.6), 'clean': clip01(1 - max(0.0, -depth - 6) / 12), 'soft': clip01(1 - (p99 - 6) / 14), 'calm': clip01(1 - textE / 9), 'contrast': clip01((mincon - 4.5) / 3)}
    score = .28 * s['presence'] + .20 * s['relief'] + .10 * s['clean'] + .17 * s['soft'] + .15 * s['calm'] + .10 * s['contrast']
    return {'score': score, 'parts': s, 'cover': cover, 'relief': relief, 'depth': depth, 'p99': p99, 'textE': textE, 'contrast': mincon}

base = {t: load(os.path.join(OUT, f'base_{t}.png')) for t in ('d', 'm')}
rows = {}
for v in variants:
    d = measure('d', v['id'], base['d'], geoms['d']); m = measure('m', v['id'], base['m'], geoms['m'])
    rows[v['id']] = {'variant': v, 'd': d, 'm': m, 'total': 0.6 * d['score'] + 0.4 * m['score'], 'ok': d['contrast'] >= 4.5 and m['contrast'] >= 4.5}

def fight(a, b):
    ra, rb = rows[a], rows[b]
    if ra['ok'] != rb['ok']: return (a if ra['ok'] else b), 'дисквалификация соперника по контрасту'
    dt = ra['total'] - rb['total']
    if abs(dt) >= 0.01: return (a if dt > 0 else b), f'счёт {ra["total"]:.3f} : {rb["total"]:.3f}'
    dm = ra['m']['score'] - rb['m']['score']
    if abs(dm) >= 1e-6: return (a if dm > 0 else b), 'равенство — решает телефон'
    return (a if a < b else b), 'равенство — по номеру'

ids = [v['id'] for v in variants]; random.Random(11).shuffle(ids)
size = 1
while size < len(ids): size *= 2
slots = ids + [None] * (size - len(ids))
# «байы» (проходы без боя) раздаём равномерно: пустые места ставим парами к первым номерам
order = []
for i in range(size // 2):
    a = slots[i]; b = slots[size - 1 - i]; order += [a, b]
rounds, cur, losers_by_round = [], order, []
while len(cur) > 1:
    nxt, matches, losers = [], [], []
    for i in range(0, len(cur), 2):
        a, b = cur[i], cur[i + 1]
        if a is None or b is None: nxt.append(a or b); continue
        w, why = fight(a, b); l = b if w == a else a; nxt.append(w); losers.append(l)
        matches.append({'a': a, 'b': b, 'winner': w, 'why': why, 'sa': round(rows[a]['total'], 4), 'sb': round(rows[b]['total'], 4)})
    rounds.append(matches); losers_by_round.append(losers); cur = nxt
winner = cur[0]
semis = (losers_by_round[-2] if len(losers_by_round) > 1 else []) + losers_by_round[-1]
top = [winner] + [x for x in losers_by_round[-1]] + [x for x in semis if x not in losers_by_round[-1]]
top = list(dict.fromkeys(top))[:4]
ranking = sorted(rows.values(), key=lambda r: -(r['total'] if r['ok'] else r['total'] - 1))
res = {'winner': winner, 'top': [{'id': i, **rows[i]['variant'], 'total': round(rows[i]['total'], 4)} for i in top], 'rounds': rounds,
       'best_by_score': [{'id': r['variant']['id'], 'img': r['variant']['img'], 'pos': r['variant']['pos'], 'o': r['variant']['o'], 'total': round(r['total'], 4), 'ok': r['ok']} for r in ranking[:10]],
       'disqualified': [i for i, r in rows.items() if not r['ok']], 'rows': {i: {'total': round(r['total'], 4), 'd': {k: (round(x, 3) if not isinstance(x, dict) else {a: round(b, 3) for a, b in x.items()}) for k, x in r['d'].items()}, 'm': {k: (round(x, 3) if not isinstance(x, dict) else {a: round(b, 3) for a, b in x.items()}) for k, x in r['m'].items()}, 'ok': r['ok'], 'variant': r['variant']} for i, r in rows.items()}}
json.dump(res, open(os.path.join(OUT, 'result.json'), 'w'), ensure_ascii=False, indent=1)
print(f'Вариантов: {len(ids)}; раундов: {len(rounds)}; боёв: {sum(len(m) for m in rounds)}; дисквалифицировано по контрасту: {len(res["disqualified"])}')
print('Победитель по турниру:', winner, rows[winner]['variant'], round(rows[winner]['total'], 3))
print('Лучшие по счёту:', ', '.join(f'{x["id"]}:{x["img"]}/{x["pos"]}/{x["o"]}={x["total"]}' for x in res['best_by_score'][:5]))
