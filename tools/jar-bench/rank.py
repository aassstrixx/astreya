"""Свод результатов арены: python3 rank.py results*.json [--throttle 1] [--device desk]"""
import json, sys, collections
files=[a for a in sys.argv[1:] if a.endswith('.json')]
thr=int(sys.argv[sys.argv.index('--throttle')+1]) if '--throttle' in sys.argv else None
dev=sys.argv[sys.argv.index('--device')+1] if '--device' in sys.argv else None
rs=[]
for f in files: rs+=json.load(open(f))
rows=collections.defaultdict(list)
for x in rs:
    if 'error' in x: continue
    if thr is not None and x['throttle']!=thr: continue
    if dev and x['device']!=dev: continue
    rows[(x['variant'],x['device'],x['throttle'])].append(x)
def m(l,k): return sum(i[k] for i in l)/len(l)
print(f"{'variant':8} dev thr | {'js ms':>6} {'js>8%':>6} {'stale%':>6} | {'jud':>5} {'pos':>5} {'vis':>5} {'visP95':>6} {'freeze%':>7} | {'lag':>5} {'settle':>6} {'stopJ':>5}  label")
for (v,d,th),l in sorted(rows.items(), key=lambda kv:(kv[0][1],kv[0][2],m(kv[1],'visMean') if 'visMean' in kv[1][0] else 0)):
    lag=[i['lagMs'] for i in l if i['lagMs'] is not None]; st=[i['settleMs'] for i in l if i['settleMs'] is not None]
    print(f"{v:8} {d:4} x{th} | {m(l,'jsMean'):6.2f} {m(l,'jsOver8'):6.1f} {m(l,'stale'):6.1f} | {m(l,'judRms'):5.1f} {m(l,'errMean'):5.1f} {m(l,'visMean') if 'visMean' in l[0] else 0:5.1f} {m(l,'visP95') if 'visP95' in l[0] else 0:6.1f} {m(l,'freezePct'):7.1f} | {sum(lag)/max(1,len(lag)):5.0f} {sum(st)/max(1,len(st)):6.0f} {m(l,'stopJerk'):5.1f}  {l[0]['label']}")
