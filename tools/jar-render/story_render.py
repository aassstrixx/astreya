"""Кадры для скролл-вступления сайта «Астрея»: баночка (сцена LUMIÈRE, Blender/Cycles) в цветах сайта.

Использует сцену lumiere_scene.py как есть (тот же свет, материалы, движение крышки), а здесь меняет только:
  * этикетку — «Астрея» вместо LUMIÈRE (make_label_astreya.py);
  * фон — тёмно-синий, как у заставки сайта (#0b1a33), без графитового оттенка;
  * сценарий — «история на скролле»: оборот → крышка уходит → макро крема → камера ныряет в крем;
    последние кадры заливает светом, чтобы крем плавно перешёл в молочный фон главной (#f5f2ec).

Запуск (Python 3.11, нужны bpy pillow numpy):
    python3 story_render.py info
    python3 story_render.py still <номер_кадра> out.png [--res 1280x720] [--samples 8] [--total 150]
    python3 story_render.py anim <с> <по> outdir [--res 1280x720] [--samples 8] [--total 150]     # готовые кадры пропускаются
Для чёткости при скролле: --noblur (без motion blur — на стоп-кадрах он выглядит смазанным), --filter 1.0 (уже фильтр пикселя),
--samples-late N --late-p 0.6 (меньше сэмплов на гладком креме).
Кадры: outdir/f00000.png …; затем tools/jar-render/encode_web.py собирает WebP для assets/jar/.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import lumiere_scene as L  # noqa: E402
import make_label_astreya  # noqa: E402

TS = L.TS
# (прогресс сюжета, время сцены в секундах): между точками время течёт линейно
STORY = [(0.00, 0.0), (0.30, 8.0 * TS), (0.46, 12.8 * TS), (0.60, 14.6 * TS), (1.00, 17.5 * TS)]
EXPOSURE = (0.25, 1.35, 0.76)       # было, стало в конце, с какого прогресса начинать «заливать светом»


def story_time(p):
    for (p0, t0), (p1, t1) in zip(STORY, STORY[1:]):
        if p <= p1:
            return t0 + (t1 - t0) * (p - p0) / (p1 - p0)
    return STORY[-1][1]


PORTRAIT = False     # вертикальный кадр (телефон): в начале камера ближе, чтобы баночка была крупнее


def story_keys(lean):
    """Камера: исходные ключи сцены до макро крема, дальше — новый «нырок» в крем."""
    K = [
        (0.0, 0, 8.0, 56.0, (0, 0, 2.9), 85, 4.0, 0.0),
        (8.0 * TS, 2, 10.0, 42.0, (0, 0, 2.9), 85, 4.0, 0.6),
        (10.0 * TS, -4, 12.0, 70.0, (0.5, 0, 6.8), 85, 4.5, 0.6),
        (12.8 * TS, -8, 20.0, 42.0, (1.4, 0, 4.3), 85, 3.5, 0.7),
        (14.6 * TS, -28, 30.0, 15.5, (0, 0, 4.8), 100, 2.0, 0.6),
        # нырок в крем: камера опускается и смотрит всё более сверху, поверхность крема заполняет кадр
        (15.6 * TS, -18, 44.0, 9.5, (0, 0, 4.85), 100, 2.0, 0.5),
        (16.6 * TS, -8, 64.0, 6.4, (0, 0, 4.9), 100, 1.9, 0.5),
        (17.5 * TS, 0, 86.0, 4.4, (0.0, 0, 4.95), 100, 1.8, 0.0),
    ]
    if PORTRAIT:
        K[0] = K[0][:3] + (K[0][3] * 0.78,) + K[0][4:]
        K[1] = K[1][:3] + (K[1][3] * 0.80,) + K[1][4:]
    return K


OPT = {"blur": True, "filter": None, "late": None, "late_p": 0.6}      # --noblur: без motion blur (для скролла кадры должны быть резкими); --filter 1.0: уже фильтр пикселя


def parse(argv):
    res, samples, total, rest, i = (1280, 720), 8, 150, [], 0
    while i < len(argv):
        if argv[i] == "--noblur":
            OPT["blur"] = False; i += 1
        elif argv[i] == "--samples-late":
            OPT["late"] = int(argv[i + 1]); i += 2
        elif argv[i] == "--late-p":
            OPT["late_p"] = float(argv[i + 1]); i += 2
        elif argv[i] == "--filter":
            OPT["filter"] = float(argv[i + 1]); i += 2
        elif argv[i] == "--res":
            res = tuple(int(x) for x in argv[i + 1].lower().split("x")); i += 2
        elif argv[i] == "--samples":
            samples = int(argv[i + 1]); i += 2
        elif argv[i] == "--total":
            total = int(argv[i + 1]); i += 2
        else:
            rest.append(argv[i]); i += 1
    return res, samples, total, rest


def recolor():
    """Фон — в цвет заставки сайта; остальное (стекло, хром, крем) без изменений."""
    for m in bpy.data.materials:
        if m.name.startswith("GraphiteStudio") and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Base Color"].default_value = (0.0016, 0.0052, 0.0160, 1)       # ≈ #0b1a33 после AgX
                    n.inputs["Roughness"].default_value = float(os.environ.get("FLOOR_ROUGH", 0.30))
                    n.inputs["Specular IOR Level"].default_value = float(os.environ.get("FLOOR_SPEC", 0.20))
                    n.inputs["Specular Tint"].default_value = (0.22, 0.38, 1.0, 1)           # отражения студии — холодно-синие
                if n.type == "EMISSION":
                    n.inputs["Color"].default_value = (0.20, 0.34, 0.80, 1)                  # холодный синий отсвет студии
    w = bpy.context.scene.world
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.005, 0.014, 1)


def apply_story(frame, total, lean):
    """frame = номер кадра сюжета; подменяем время сцены и экспозицию, остальное считает lumiere_scene.apply_state."""
    p = frame / max(1, total - 1)
    L.apply_state(story_time(p) * L.FPS, lean)
    e0, e1, p0 = EXPOSURE
    s = L.sm((p - p0) / (1.0 - p0)) if p > p0 else 0.0
    bpy.context.scene.view_settings.exposure = e0 + (e1 - e0) * s


def bake(frame, total, lean):
    """как L.bake_motion, но по времени сюжета: ключи ±0.4 кадра исходного ролика для motion blur"""
    sc = bpy.context.scene
    if not OPT["blur"]:
        apply_story(frame, total, lean)
        return
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    objs = [L.S["cam"], L.S["focus"], L.S["rig"], L.S["glass"], L.S["lid"]]
    for o in objs:
        o.animation_data_clear()
    L.S["cam"].data.animation_data_clear()
    p = frame / max(1, total - 1)
    t = story_time(p)
    for k, ff in enumerate((-1, 0, 1)):
        L.apply_state(t * L.FPS + ff * 1.0, lean)
        L.S["cam"].keyframe_insert("location", frame=ff + 10)
        L.S["focus"].keyframe_insert("location", frame=ff + 10)
        L.S["rig"].keyframe_insert("rotation_euler", frame=ff + 10)
        L.S["glass"].keyframe_insert("rotation_euler", frame=ff + 10)
        L.S["lid"].keyframe_insert("location", frame=ff + 10)
        L.S["lid"].keyframe_insert("rotation_euler", frame=ff + 10)
        L.S["cam"].data.keyframe_insert("lens", frame=ff + 10)
        L.S["cam"].data.dof.keyframe_insert("aperture_fstop", frame=ff + 10)
    sc.frame_set(10)
    apply_story(frame, total, lean)


def main():
    res, samples, total, args = parse(sys.argv[1:])
    if not args:
        print(__doc__)
        return
    label = os.path.join(HERE, "label.png")
    if not os.path.exists(label):
        make_label_astreya.main(label)
    global PORTRAIT
    PORTRAIT = res[1] > res[0]
    L.HERE = HERE
    L.camera_keys = lambda lean: story_keys(lean)
    sc = L.build_scene(res, samples)
    if not OPT["blur"]:
        sc.render.use_motion_blur = False
    if OPT["filter"]:
        sc.cycles.filter_width = OPT["filter"]
    recolor()
    lean = L.solve_lean_pose()
    cmd = args[0]
    if cmd == "info":
        print("story time at p=0,.3,.46,.6,1:", [round(story_time(p), 2) for p in (0, .3, .46, .6, 1)], "lean:", tuple(round(x, 2) for x in lean))
        return
    if cmd == "still":
        f = int(float(args[1]))
        bake(f, total, lean)
        sc.render.filepath = args[2]
        bpy.ops.render.render(write_still=True)
    elif cmd == "anim":
        import time
        a, b, outdir = int(args[1]), int(args[2]), args[3]
        os.makedirs(outdir, exist_ok=True)
        for f in range(a, b + 1):
            path = os.path.join(outdir, f"f{f:05d}.png")
            if os.path.exists(path):
                continue
            t0 = time.time()
            if OPT["late"]:                                          # поздние кадры (нырок в гладкий крем) — меньше сэмплов: шум там незаметен
                sc.cycles.samples = OPT["late"] if f / max(1, total - 1) >= OPT["late_p"] else samples
            bake(f, total, lean)
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            print(f"frame {f}/{total - 1} done in {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
