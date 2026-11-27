#!/usr/bin/env python3
"""Цвет комнаты со стеллажами для «Старта» (assets/utility/stella-bg.webp): рендер stella_library.py приводится к палитре сайта —
холодные сероголубые пятна (кресла, зеркало, белые упаковки) уходят в тёплый лён/слоновую кость, яркость и контраст не меняются;
чуть мягче самые светлые места под текстом слева. Запуск: python3 stella_bg_grade.py исходный.webp результат.webp"""
import sys, cv2, numpy as np
src, dst = sys.argv[1], sys.argv[2]
im = cv2.imread(src); lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)
L, a, b = lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128
w = np.clip((8.5 - b) / 6.0, 0, 1); w = w * w * (3 - 2 * w); w = cv2.GaussianBlur(w, (0, 0), 2.0)   # где тон холодный (b ниже ~8) — тянем к тёплому
tb, ta = 12.5, 3.4
b2 = b + w * (tb - b); a2 = a + w * (ta - a)
L2 = L - w * 7.0 * np.clip((L - 120) / 80, 0, 1)                                          # светлые холодные места чуть темнее — лён, а не «белый пластик»
lab2 = np.stack([L2, a2 + 128, b2 + 128], -1); out = cv2.cvtColor(np.clip(lab2, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
cv2.imwrite(dst, out, [cv2.IMWRITE_WEBP_QUALITY, 82])
import os; print(dst, out.shape[1], out.shape[0], os.path.getsize(dst) // 1024, 'КБ')
