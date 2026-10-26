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
# средний и низкий уровни: между каждой парой полных кадров — запечённый промежуточный (поток DIS, сдвиг обоих кадров к середине), всего 2N-1 = 555 кадров
pip install opencv-python-headless
python3 make_flow.py plan.json frames_d new_d /tmp/flow_d --reduce 8 --range 96 --blur 1.0 --cache /tmp/flowcache_d      # считает поток и кладёт в кэш (карты /tmp/flow_d не нужны)
python3 make_flow.py plan.json frames_m new_m /tmp/flow_m --reduce 8 --range 96 --blur 1.0 --cache /tmp/flowcache_m
python3 bake_mid.py plan.json frames_d new_d /tmp/flowcache_d ../../assets/jar/dm --size 1280x720 --q 74 --also 960x540:70:../../assets/jar/dl     # dm — средний, dl — низкий
python3 bake_mid.py plan.json frames_m new_m /tmp/flowcache_m ../../assets/jar/mm --size 720x1280 --q 74 --also 540x960:70:../../assets/jar/ml
```

В `data/redesign.json → jar` затем: `frames` = число кадров плана, `p` = список положений полных кадров (`[e.p for e in plan]`, округлить до 5 знаков),
`pb` = положения лёгких кадров (555 значений: для каждого k — `p[k]`, затем `p[k] + 0,5·(p[k+1] − p[k])`; bake_mid.py пишет их в `p.json` вывода).
Уровни в браузере (`js/jar.js`): `d`/`m` — полные (278 кадров; в покое), `dm`/`mm` — средние запечённые (пока картинка движется), `dl`/`ml` — низкие
(запасной уровень, если устройство не справляется; в автономной сборке — единственный набор, из-за веса). Почему так, а не WebGL-интерполяция —
см. `tools/jar-bench/README.md` (арена вариантов).

`--total` должен совпадать с `data/redesign.json → jar.frames`. Готовые кадры при повторном запуске `anim` пропускаются.
Почему кадры резкие: `--noblur` (на стоп-кадре motion blur выглядит смазанным), разрешение 1920x1080 вместо 1280x720, `--filter 1.0`, WebP q90.
Выключить вступление на сайте: `data/redesign.json → jar.enabled = false` (затем `node tools/build.js`).


## Первый экран главной: зал с арками (`hall_story.py`, `encode_arch.py` → `assets/jar-arch`)

Вторая сцена на главной — после вступления с баночкой и экрана с лозунгом. Это зал по референсу заказчика: стена из светлого камня с большой аркой и ступенчатой нишей со светящейся линией свода,
огромный каменный знак «Астреи» (гора с острыми кончиками и серп — из `tools/decor/stone_logo.py`, собирается по ходу анимации), слева проём второй арки и ветка оливы на переднем плане (она же даёт на стене и полу
пятна света от листьев; у телефона ветка заходит в кадр сверху-слева), справа рифлёная пилястра и ваза с оливой, перед нишей низкий круглый подиум из травертина с белым флаконом, рядом декоративные камни-обломки
(`tools/decor/rocks.py`), пол — светлый полированный камень. Баночка — та же модель, что во вступлении (`lumiere_scene.py`; крышка — тёмно-синий лак), увеличена в 1,5 раза. Всё рендерится целиком в Blender/Cycles,
поэтому свет, тени и отражения баночки, подиума, камней и ниши общие. Материалы камня — `tools/showroom-assets/materials.py`.

**Шар в нише в кадры не запекается**: на сайте это живой слой (`.ar-pearl`, см. README в корне). Его прозрачный каменный рендер делает `hall_story.py spin` (тот же свет и камера, что у последнего кадра), а флакон
для слоя поверх шара — `hall_story.py matte` (всё, кроме флакона, невидимо для камеры, но по-прежнему отражается и затеняет). Чтобы запечь шар в кадры, поставьте `SPHERE_3D = True`.

```bash
python3 hall_story.py still 83 /tmp/f.png --res 1600x900 --samples 26               # один кадр (0…83; --total 84 по умолчанию)
python3 hall_story.py anim 0 83 /tmp/hall_d --res 1600x900 --samples 26 --total 84 --stride 6   # черновик: каждый 6-й кадр (чтобы оценить сюжет за полчаса)
python3 hall_story.py anim 0 83 /tmp/hall_d --res 1600x900 --samples 26 --total 84        # десктоп, ≈2 мин/кадр на 4 ядрах; готовые кадры пропускаются, поэтому добирает остальные
python3 hall_story.py anim 0 83 /tmp/hall_m --portrait --res 720x1280 --samples 24 --total 84   # телефон (другой ракурс: арка и подиум в нижней части кадра, сверху место под заголовок)
python3 hall_story.py spin /tmp/spin 1 560 --samples 28                  # каменный шар (кадров, ширина в пикселях) → /tmp/spin/00.png и spin.json (положение шара в % сцены)
python3 hall_story.py matte 83 /tmp/m83.png bottle --samples 40            # слой «только флакон» (--portrait — для телефона); вместо bottle можно jar — слой «баночка на подиуме»
python3 apply_p.py ../../assets/jar-arch/p-d.json                         # число кадров и положения p / pb → data/redesign.json
python3 crop_matte.py /tmp/m83.png ../../assets/jar-arch/fg-bottle.webp   # обрезка слоя и его положение (l, t, w в %) для data/redesign.json → jar.arch.fg
python3 encode_arch.py /tmp/hall_d ../../assets/jar-arch/d  --lite ../../assets/jar-arch/dm --size 1600x900 --lite-size 1120x630 --end 0.92   # --sharpen 0.5 по умолчанию: возвращает резкость мелкого камня после шумоподавления
python3 encode_arch.py /tmp/hall_m ../../assets/jar-arch/m  --lite ../../assets/jar-arch/mm --size 720x1280 --lite-size 540x960 --end 0.92
```

Сюжет (прогресс p сцены от 0 до 1; `frame_state()` в `hall_story.py`): A 0–0,28 крупный план баночки, она поворачивается, зал за ней в размытии (фокус — на этикетке); B 0,28–0,90 камера отъезжает к «главному кадру»,
баночка плавной дугой уходит от камеры к подиуму и опускается на него («уходит на полку»; контактная тень и отражения считает Cycles), в нише разгорается свет; C — покой: готовый кадр первого экрана.
`encode_arch.py` записывает p-положения (`p-d.json`, `p-m.json`) — их кладут в `data/redesign.json → jar.arch.p / pb` (после `--end` сцена «держит» последний кадр — спокойный финал перед отпусканием прокрутки).
Лёгкий набор — с запечёнными промежуточными кадрами (поток DIS). Поверх кадра в браузере встаёт герой (`css/home-arch.css`, рамка `.ar-world` повторяет кадр 16:9, поэтому орбиты, чип и карточка стоят на тех же
местах сцены). Выключить сцену: `jar.arch.enabled = false` (останется прежний герой с шаром и орбитами).
