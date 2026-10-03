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
```

## Плавность: неравномерная сетка кадров и поток

Между соседними кадрами изображение не должно проходить больше ~40 px, иначе анимация «ступенчатая». Равномерная сетка из 180 кадров давала
50–120 px на кадр в вращении, подъёме крышки и наезде камеры, поэтому:

```bash
python3 motion_analysis.py                      # скорость самой быстрой точки на экране вдоль сюжета → motion_d.json (портрет: motion_analysis.py portrait → motion_m.json)
python3 plan_frames.py motion_d.json motion_m.json plan.json 40     # куда добавить кадры (старые кадры сетки 180 остаются) — 278 кадров; готовый план лежит в tools/jar-render/plan.json
python3 story_render.py plan plan.json new_d --res 1920x1080 --samples 12 --samples-late 8 --late-p 0.6 --noblur --filter 1.0   # только новые
python3 story_render.py plan plan.json new_m --res 810x1440  --samples 12 --samples-late 8 --late-p 0.6 --noblur --filter 1.0
python3 encode_web.py --plan plan.json frames_d new_d ../../assets/jar/d --size 1920x1080 --q 80
python3 encode_web.py --plan plan.json frames_m new_m ../../assets/jar/m --size 810x1440 --q 80
# лёгкие уровни: между каждой парой полных кадров — запечённый промежуточный (поток DIS, сдвиг обоих кадров к середине), всего 2N-1 = 555 кадров
pip install opencv-python-headless
python3 make_flow.py plan.json frames_d new_d /tmp/flow_d --reduce 8 --range 96 --blur 1.0 --cache /tmp/flowcache_d      # считает поток и кладёт в кэш (карты /tmp/flow_d не нужны)
python3 make_flow.py plan.json frames_m new_m /tmp/flow_m --reduce 8 --range 96 --blur 1.0 --cache /tmp/flowcache_m
python3 bake_mid.py plan.json frames_d new_d /tmp/flowcache_d ../../assets/jar/dl --size 960x540 --q 70 --also 480x270:62:../../assets/jar/dx
python3 bake_mid.py plan.json frames_m new_m /tmp/flowcache_m ../../assets/jar/ml --size 540x960 --q 70 --also 270x480:62:../../assets/jar/mx
```

В `data/redesign.json → jar` затем: `frames` = число кадров плана, `p` = список положений полных кадров (`[e.p for e in plan]`, округлить до 5 знаков),
`pb` = положения лёгких кадров (555 значений: для каждого k — `p[k]`, затем `p[k] + 0,5·(p[k+1] − p[k])`; bake_mid.py пишет их в `p.json` вывода).
Уровни в браузере (`js/jar.js`): `d`/`m` — полные (278 кадров; в покое и при медленной прокрутке), `dl`/`ml` — лёгкие запечённые (быстрая прокрутка;
в автономной сборке — единственный набор), `dx`/`mx` — совсем лёгкие (только если устройство не справляется). Почему так, а не WebGL-интерполяция —
см. `tools/jar-bench/README.md` (арена вариантов).

`--total` должен совпадать с `data/redesign.json → jar.frames`. Готовые кадры при повторном запуске `anim` пропускаются.
Почему кадры резкие: `--noblur` (на стоп-кадре motion blur выглядит смазанным), разрешение 1920x1080 вместо 1280x720, `--filter 1.0`, WebP q90.
Выключить вступление на сайте: `data/redesign.json → jar.enabled = false` (затем `node tools/build.js`).
