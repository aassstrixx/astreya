# Рендеры страницы «Бренды» (tools/brands-assets)

`scene.py` — Blender/Cycles-сцены: широкий зал для первого экрана (`hero`) и арочные ниши-витрины брендов (`niche`).
Материалы — `tools/showroom-assets/materials.py`, свет и цветокоррекция — как в сцене каталога; упаковки в зале — `tools/showroom-assets/packs.py`.

```bash
pip install bpy numpy scipy pillow
python3 tools/brands-assets/scene.py niche            # ниши всех брендов → assets/brands/niche-<id>.webp и niches.json
python3 tools/brands-assets/scene.py niche heliocare  # одна ниша
python3 tools/brands-assets/scene.py hero             # первый экран → hero.webp (3200×900), hero-m.webp (1600×450)
BR_SCALE=0.3 BR_SPP=16 BR_OUT=/tmp/x python3 tools/brands-assets/scene.py hero   # быстрый предпросмотр в другую папку
```

`niches.json` хранит для каждого бренда «посадочные места» товаров (доли кадра: `x`, `y` — точка касания основания, `w` — ширина подиума) и размер кадра в метрах (`frame`):
сайт ставит на подиумы упаковки по реальной высоте (`PACK_CM` в `src/pages/brands.js`). Тон стены и камня ниши — `NICHES` в начале `scene.py` (лёгкий намёк на цвет бренда).
Ниши — рендеры без товаров (товары на сайте — живой HTML), поэтому состав витрины меняется данными, а не перерисовкой.
