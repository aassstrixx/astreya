"""План кадров вступления: где нужно больше кадров, чтобы между соседними реальными кадрами точки проходили не больше M пикселей.

Кадры равномерной сетки 180 (p = f/179) остаются как есть (уже отрендерены); внутри интервалов, где движение быстрое,
добавляются промежуточные кадры. Движение между реальными кадрами дальше «дорисовывается» в браузере по карте оптического потока.

    python3 plan_frames.py motion_d.json motion_m.json plan.json [M=36]
(motion_*.json — результат motion_analysis.py: скорость самой быстрой точки баночки на экране вдоль сюжета.)
"""
import json
import math
import sys

import numpy as np

N0 = 179          # интервалов исходной сетки (180 кадров)


def main():
    md, mm, out = sys.argv[1:4]
    M = float(sys.argv[4]) if len(sys.argv) > 4 else 36.0
    d, m = json.load(open(md)), json.load(open(mm))
    P = np.array(d["p"])
    sd, sm = np.array(d["speed"]), np.array(m["speed"])
    plan = []
    for f in range(N0):
        mk = (P >= f / N0) & (P < (f + 1) / N0)
        n = max(1, math.ceil(max(sd[mk].sum(), sm[mk].sum()) / M))
        for j in range(n):
            plan.append({"p": (f + j / n) / N0, "old": f if j == 0 else None})
    plan.append({"p": 1.0, "old": N0})
    for k, e in enumerate(plan):
        e["k"] = k
    json.dump({"M": M, "frames": plan}, open(out, "w"), indent=0)
    new = [e for e in plan if e["old"] is None]
    print(f"M={M:g}px: всего кадров {len(plan)}, из них новых к рендеру {len(new)}")
    # распределение по участкам
    for lo, hi in ((0, .0375), (.0375, .30), (.30, .48), (.48, .60), (.60, 1.0)):
        c = sum(1 for e in plan if lo <= e["p"] < hi)
        print(f"  p {lo:.3f}-{hi:.3f}: {c} кадров")


if __name__ == "__main__":
    main()
