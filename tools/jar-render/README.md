# Кадры вступления с баночкой (assets/jar)

Сцена баночки (Blender / Cycles, `lumiere_scene.py`) сделана отдельно и перенесена сюда как есть. `story_render.py` меняет только то,
что нужно сайту: этикетку («Астрея», `make_label_astreya.py`), фон (тёмно-синий, как у заставки) и сценарий для скролла
(оборот → крышка уходит → макро крема → камера ныряет в крем, в конце заливка светом под молочный фон главной).

```bash
pip install bpy pillow numpy fonttools            # Python 3.11
python3 story_render.py info
python3 story_render.py still 70 test.png --res 1280x720 --samples 8 --total 130          # один кадр
python3 story_render.py anim 0 129 frames_d --res 1280x720 --samples 8 --total 130        # десктоп (≈20 с/кадр на 4 ядрах)
python3 story_render.py anim 0 129 frames_m --res 576x1024 --samples 8 --total 130        # телефон (вертикальный кадр)
python3 encode_web.py frames_d ../../assets/jar/d --size 1280x720 --q 80
python3 encode_web.py frames_m ../../assets/jar/m --size 576x1024 --q 80
python3 encode_web.py frames_d ../../assets/jar/d-lite --size 640x360 --q 62               # облегчённые — для автономной сборки
python3 encode_web.py frames_m ../../assets/jar/m-lite --size 360x640 --q 62
```

`--total` должен совпадать с `data/redesign.json → jar.frames`. Готовые кадры при повторном запуске `anim` пропускаются.
Выключить вступление на сайте: `data/redesign.json → jar.enabled = false` (затем `node tools/build.js`).
