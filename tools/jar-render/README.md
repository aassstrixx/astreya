# Кадры вступления с баночкой (assets/jar)

Сцена баночки (Blender / Cycles, `lumiere_scene.py`) сделана отдельно и перенесена сюда как есть. `story_render.py` меняет только то,
что нужно сайту: этикетку («Астрея», `make_label_astreya.py`), фон (тёмно-синий, как у заставки) и сценарий для скролла
(оборот → крышка уходит → макро крема → камера ныряет в крем, в конце заливка светом под молочный фон главной).

```bash
pip install bpy pillow numpy fonttools            # Python 3.11
python3 story_render.py info
# один кадр (проверка): резко, без motion blur
python3 story_render.py still 70 test.png --res 1920x1080 --samples 12 --total 180 --noblur --filter 1.0
# десктоп 1920x1080 (≈45 с/кадр на 4 ядрах, 180 кадров ≈ 2 ч) и телефон 810x1440 (≈35 с/кадр)
python3 story_render.py anim 0 179 frames_d --res 1920x1080 --samples 12 --samples-late 8 --late-p 0.6 --total 180 --noblur --filter 1.0
python3 story_render.py anim 0 179 frames_m --res 810x1440 --samples 12 --samples-late 8 --late-p 0.6 --total 180 --noblur --filter 1.0
python3 encode_web.py frames_d ../../assets/jar/d --size 1920x1080 --q 90
python3 encode_web.py frames_m ../../assets/jar/m --size 810x1440 --q 90
python3 encode_web.py frames_d ../../assets/jar/d-lite --size 960x540 --q 72               # облегчённые — для автономной сборки
python3 encode_web.py frames_m ../../assets/jar/m-lite --size 540x960 --q 72
```

`--total` должен совпадать с `data/redesign.json → jar.frames`. Готовые кадры при повторном запуске `anim` пропускаются.
Почему кадры резкие: `--noblur` (на стоп-кадре motion blur выглядит смазанным), разрешение 1920x1080 вместо 1280x720, `--filter 1.0`, WebP q90.
Выключить вступление на сайте: `data/redesign.json → jar.enabled = false` (затем `node tools/build.js`).
