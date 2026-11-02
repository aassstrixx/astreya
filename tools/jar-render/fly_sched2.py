#!/usr/bin/env python3
"""Расписание ключей пролёта по замеру ошибки (дополняет flykeys sched).

flykeys sched расставляет ключи так, чтобы картинка между соседними менялась одинаково (по положению и повороту камеры), но «одинаково по камере» ≠ «одинаково по ошибке»: ближние предметы
(диваны, стол) дают разный параллакс на разных участках пути. Поэтому ошибку перепроекции измерили: движок строит кадр между ключами, его сравнивают с настоящим кадром Blender в той же точке
(PSNR после размытия σ = 2,2 px, чтобы зерно и резкость ключей не влияли; шар не считается — он живой). Измерено на прежнем наборе из 25 равномерных ключей (шаг 3 кадра), в кадрах 3k+2:

    python3 fly_sched2.py [--sched /tmp/zone/fk2/sched.json] [--out /tmp/zone/fk2/sched2.json]

Модель: ошибка интервала между ключами ≈ D(w) · Δw, где D(w) — «трудность» участка (из замера). Дальше жадно: ключи уходят из интервалов, где ошибка мала, в интервалы, где велика, пока наибольшая
ошибка не перестанет падать (число ключей то же). Для ключей, которых ещё нет, пишутся номера — их дорисовывают (FLY_WS=sched2.json FLY_ONLY=… flykeys color/z), apply_fly.py склеивает по w.
Результат на 49 ключах: прогноз худшего интервала 34,9 → 44,4 дБ.
"""
import json
import sys

import numpy as np

FR = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 47, 50, 53, 56, 59, 62, 65, 68, 70]                    # кадры пролёта (из 72), где мерили
PSNR = [44.5, 44.5, 43.9, 43.1, 42.6, 41.5, 41.2, 41.0, 40.6, 39.6, 40.1, 41.7, 41.9, 40.6, 39.7, 37.4, 37.0, 38.6, 41.8, 42.7, 43.0, 43.0, 44.2, 45.8]
STEP0 = 3 / 72.0                                                                                                  # шаг ключей в замере (w)


def opt(k, d):
    a = sys.argv[1:]
    return a[a.index(k) + 1] if k in a else d


def main():
    src, out = opt('--sched', '/tmp/zone/fk2/sched.json'), opt('--out', '/tmp/zone/fk2/sched2.json')
    ws = json.load(open(src))['ws']
    w = np.array(FR) / 72.0
    D = 10 ** (-np.array(PSNR) / 20.0) / STEP0
    Ds = np.convolve(np.pad(D, 2, mode='edge'), np.ones(5) / 5, mode='valid')
    ex = lambda a, b: float(np.interp((a + b) / 2, w, Ds)) * (b - a)
    keys = list(ws)
    for _ in range(80):
        errs = [ex(a, b) for a, b in zip(keys[:-1], keys[1:])]
        worst = int(np.argmax(errs)); emax = errs[worst]
        best = None
        for j in range(1, len(keys) - 1):
            if j in (worst, worst + 1):
                continue
            m = ex(keys[j - 1], keys[j + 1])
            if best is None or m < best[0]:
                best = (m, j)
        if best is None or best[0] >= emax * 0.97:
            break
        keys.pop(best[1])
        errs = [ex(a, b) for a, b in zip(keys[:-1], keys[1:])]; worst = int(np.argmax(errs))
        keys.insert(worst + 1, round((keys[worst] + keys[worst + 1]) / 2, 6))
    keys = sorted(keys)
    db = [-20 * np.log10(ex(a, b)) for a, b in zip(keys[:-1], keys[1:])]
    json.dump({'ws': [round(k, 6) for k in keys]}, open(out, 'w'))
    print('ключей', len(keys), 'прогноз по интервалам: худший %.1f дБ, средний %.1f дБ' % (min(db), np.mean(db)))


if __name__ == '__main__':
    main()
