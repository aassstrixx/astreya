import json, collections, sys
rs=[]
for f in sys.argv[1:]:
    if f.endswith('.json'): rs+=json.load(open(f))
rows=collections.defaultdict(list)
for x in rs:
    if 'error' in x: continue
    rows[(x['device'],x['throttle'],x['variant'])].append(x)
def m(l,k): return sum(i.get(k,0) for i in l)/len(l)
print(f"{'dev':4} thr {'variant':9} | {'fps':>5} {'over33%':>7} {'js ms':>6} {'jsP95':>6} | {'vis':>5} {'visP95':>6} {'jud':>5} {'frz%':>5} | {'lag':>4} {'stJ':>5} | tiers% lite xl gov")
for k in sorted(rows):
    l=rows[k]; lag=[i['lagMs'] for i in l if i.get('lagMs') is not None]
    gc=sum((i['counters'].get('govChanges',0)) for i in l)/len(l)
    print(f"{k[0]:4} x{k[1]}  {k[2]:9} | {m(l,'fps'):5.1f} {m(l,'over33'):7.1f} {m(l,'jsMean'):6.1f} {m(l,'jsP95'):6.1f} | {m(l,'visMean'):5.1f} {m(l,'visP95'):6.1f} {m(l,'judRms'):5.1f} {m(l,'freezePct'):5.1f} | {sum(lag)/max(1,len(lag)):4.0f} {m(l,'stopJerk'):5.0f} | {m(l,'liteShare'):4.0f} {m(l,'xliteShare'):4.0f} {gc:4.1f}")
