#!/usr/bin/env python3
"""Портреты преподавателей для журнала: версии ×2 (assets/teachers/hq/*.webp).

Исходники — 280×300; браузер растягивал бы их билинейно и мягче. Здесь: Lanczos ×2 + умеренная нерезкая маска, WebP q86.
Это не «настоящее» разрешение, а лучший способ показать маленькие фото чётче; при появлении оригиналов крупнее — заменить assets/teachers/*.webp и запустить скрипт снова.
Запуск из корня репозитория:  python3 tools/make-teacher-hq.py
"""
import glob, os
from PIL import Image, ImageFilter
os.makedirs('assets/teachers/hq', exist_ok=True)
for f in sorted(glob.glob('assets/teachers/*.webp')):
    im = Image.open(f).convert('RGB')
    big = im.resize((im.width * 2, im.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
    out = 'assets/teachers/hq/' + os.path.basename(f)
    big.save(out, 'WEBP', quality=86, method=6)
    print(out, big.size, os.path.getsize(out) // 1024, 'КБ')
