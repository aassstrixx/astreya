#!/usr/bin/env python3
"""Рендер слоёв фона каталога, вторая версия (по эталону атриума): сцена expo_v2.py (материалы) + свет, камера и слои из scene.py, но:
без глубины резкости, пиксельный фильтр 1,0, OIDN HIGH (альбедо + нормали, точный предфильтр), адаптивная выборка, строго 2 потока, рендер вертикальными полосами с перекрытием и возобновлением;
сырые кадры не красятся и не пишутся в assets — только в EXPO_RAW (/tmp/expo_raw): R2.png (вся сцена), R1.png (только стена, пол, панель), M_<слой>.png (маски), anchors.json. Дальше — finish_expo.py.

  python3 render_expo_v2.py preview            один кадр целиком (SCENE_W=768, SCENE_SPP=24 → /tmp/expo_preview.png); CROP=x0,y0,x1,y1 (доли кадра, y сверху) — крупная врезка
  python3 render_expo_v2.py layers             все проходы: R2 (полосы EXPO_TILES, выбор EXPO_STRIPS=0,1), R1, маски; EXPO_DO=r2,r1,m — выбрать проходы
Переменные: SCENE_W (3072), SCENE_SPP (96), EXPO_RAW, EXPO_TILES (4), EXPO_STRIPS, EXPO_DO, EXPO_THREADS (2), R1_SPP_K (доля сэмплов R1, .5) и все ручки сцены (SUN, SUNC, SKYTINT, FILL, WORLD, EXPO, STONET, WALLT, TBL_ROUGH, FLOOR_ROUGH, VASE_DISP, LEAF_*, …)."""
import os, sys, json, math
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
MODE = next((a for a in sys.argv[1:] if not a.startswith('-')), 'preview')
os.environ.setdefault('SCENE_W', '768' if MODE == 'preview' else '3072'); os.environ.setdefault('SCENE_SPP', '24' if MODE == 'preview' else '96')
os.environ.setdefault('DOF', '0')
# свет по умолчанию: чистый дневной — солнце почти нейтральное, небо едва тёплое (прежняя сцена: солнце 1,0/.94/.84, небо 1,0/.85/.66 — отсюда жёлтый налёт)
os.environ.setdefault('SUNC', '1.0,.965,.90'); os.environ.setdefault('SKYTINT', '1.0,.93,.84'); os.environ.setdefault('FILLC', '1.0,.98,.95')
import bpy
import numpy as np
import scene as S
import expo_v2 as EX
sys.modules['expo'] = EX                                       # scene.build() и scene.anchors() берут подиумы, места товаров и материалы отсюда
E = lambda n, d: float(os.environ.get(n, d))


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    S.settings(sc, S.W, S.H, S.SPP)
    sc.render.threads_mode = 'FIXED'; sc.render.threads = int(E('EXPO_THREADS', 2))
    cy = sc.cycles; cy.use_adaptive_sampling = True; cy.adaptive_threshold = E('EXPO_ADAPT', .012); cy.adaptive_min_samples = 16
    cy.denoising_prefilter = 'ACCURATE'; cy.denoising_quality = 'HIGH'; cy.filter_width = E('EXPO_FILTER', 1.0)
    cy.max_bounces = int(E('EXPO_BOUNCES', 8)); cy.sample_clamp_indirect = E('EXPO_CLAMP', 6.0)
    sc.render.image_settings.color_mode = 'RGB'; sc.render.image_settings.color_depth = '16'
    return sc


def strips(sc, base, n, only, ov=64):
    """вертикальные полосы с перекрытием: готовые файлы пропускаются; когда все лежат на диске — склейка в base.png (16 бит)"""
    import cv2
    W_, H_ = sc.render.resolution_x, sc.render.resolution_y; parts = []
    sc.render.use_border = True; sc.render.use_crop_to_border = False
    for i in range(n):
        a_, b_ = round(W_ * i / n), round(W_ * (i + 1) / n); x0, x1 = max(0, a_ - ov), min(W_, b_ + ov); f = '%s_t%d.png' % (base, i); parts.append((a_, b_, f))
        if os.path.exists(f) or (only is not None and i not in only): continue
        sc.render.border_min_x = x0 / W_; sc.render.border_max_x = x1 / W_; sc.render.border_min_y = 0.0; sc.render.border_max_y = 1.0
        sc.render.filepath = f.replace('.png', '_tmp.png'); bpy.ops.render.render(write_still=True); os.replace(f.replace('.png', '_tmp.png'), f); print('полоса %d/%d готова' % (i + 1, n), flush=True)
    sc.render.use_border = False
    if all(os.path.exists(f) for _, _, f in parts):
        out = np.zeros((H_, W_, 3), np.uint16)
        for a_, b_, f in parts:
            im = cv2.imread(f, cv2.IMREAD_UNCHANGED); out[:, a_:b_] = im[:, a_:b_, :3]
        cv2.imwrite(base + '.png', out); print('склейка →', base + '.png', flush=True)


def passes(sc, cam):
    RAW = os.environ.get('EXPO_RAW', '/tmp/expo_raw'); os.makedirs(RAW, exist_ok=True); do = os.environ.get('EXPO_DO', 'r2,r1,m').split(',')
    objs = [o for o in bpy.data.objects if 'grp' in o.keys() and o['grp'] != 'gobo' and o.name not in ('cut1', 'cut2', 'clipb', 'stepl', 'stepr', 'tbl_clip') and not o.name.startswith('cutR') and not o.name.startswith('cutW') and o.type in ('MESH', 'CURVE')]
    groups = ['niche', 'ring', 'dais', 'plant']
    def show(gs):
        for o in objs: o.hide_render = o['grp'] not in gs; o.visible_camera = True
    sc.camera = cam; sc.render.film_transparent = False
    json.dump(S.anchors(sc, cam), open(os.path.join(RAW, 'anchors.json'), 'w'), indent=1)
    only = os.environ.get('EXPO_STRIPS'); only = None if not only else [int(v) for v in only.split(',')]
    if 'r2' in do:
        show(['shell', 'niche', 'ring', 'dais', 'plant']); strips(sc, os.path.join(RAW, 'R2'), int(E('EXPO_TILES', 4)), only)
    if 'r1' in do and not os.path.exists(os.path.join(RAW, 'R1.png')):
        show(['shell']); spp0 = sc.cycles.samples; sc.cycles.samples = max(16, int(spp0 * E('R1_SPP_K', .5))); sc.render.filepath = os.path.join(RAW, 'R1_tmp.png'); bpy.ops.render.render(write_still=True)
        os.replace(os.path.join(RAW, 'R1_tmp.png'), os.path.join(RAW, 'R1.png')); sc.cycles.samples = spp0
    if 'm' in do:
        ov = bpy.data.materials.new('mask'); ov.use_nodes = True; nt = ov.node_tree; nt.nodes.clear(); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0; out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], out.inputs[0])
        vl = bpy.context.view_layer; vl.material_override = ov; sc.view_settings.view_transform = 'Standard'; sc.view_settings.exposure = 0; sc.view_settings.look = 'None'
        bgs_ = [n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND']
        for n in bgs_: n.inputs['Strength'].default_value = 0.0
        sc.cycles.samples = 16; sc.cycles.use_denoising = False; sc.cycles.use_adaptive_sampling = False; sc.render.image_settings.color_mode = 'BW'; sc.render.image_settings.color_depth = '8'
        for g in groups:
            f = os.path.join(RAW, 'M_%s.png' % g)
            if os.path.exists(f): continue
            show([g]); sc.render.filepath = f.replace('.png', '_tmp.png'); bpy.ops.render.render(write_still=True); os.replace(f.replace('.png', '_tmp.png'), f)
    print('проходы готовы', RAW, flush=True)


def refl_env(sc):
    """яркое окружение только для зеркальных лучей: полированный стол и пол отражают светлый зал, а не тёмное небо (диффузный свет и тени от этого не светлеют — контактные тени остаются плотными)"""
    k = E('REFL', 1.5)
    if k <= 0: return
    nt = sc.world.node_tree; L = nt.links; bg = nt.nodes['Background']; st = bg.inputs['Strength'].default_value or 1.0
    lp = nt.nodes.new('ShaderNodeLightPath'); mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    c = [float(v) for v in os.environ.get('REFLC', '1.0,.96,.90').split(',')]; mx.inputs['B'].default_value = (c[0] * k / st, c[1] * k / st, c[2] * k / st, 1)
    if bg.inputs['Color'].links: L.new(bg.inputs['Color'].links[0].from_socket, mx.inputs['A'])
    else: mx.inputs['A'].default_value = bg.inputs['Color'].default_value
    L.new(lp.outputs['Is Glossy Ray'], mx.inputs['Factor']); L.new(mx.outputs['Result'], bg.inputs['Color'])


def main():
    sc = setup(); S.build(sc); S.lights(sc); refl_env(sc); cam = S.set_cam(sc)
    print('сцена: объектов %d, кадр %dx%d, %d сэмплов' % (len(bpy.data.objects), S.W, S.H, S.SPP), flush=True)
    try:
        oldp = os.path.join(HERE, '..', '..', 'assets', 'showroom', '_backup-2026-11-16', 'layers.json'); print('места товаров и край стола совпадают с прежним layers.json:', S.anchors(sc, cam) == json.load(open(oldp))['anchors'], flush=True)
    except Exception as e: print('сверка мест товаров не удалась:', e)
    if MODE == 'preview':
        cr = os.environ.get('CROP')
        if cr:
            c_ = [float(v) for v in cr.split(',')]; sc.render.use_border = True; sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = c_[0], 1 - c_[3], c_[2], 1 - c_[1]; sc.render.use_crop_to_border = True
        sc.render.film_transparent = False; sc.render.filepath = os.environ.get('PREVIEW_OUT', '/tmp/expo_preview.png'); bpy.ops.render.render(write_still=True); print('preview готов', sc.render.filepath); return
    if MODE == 'save':
        out = os.environ.get('EXPO_BLEND', '/tmp/ASTREYA_CATALOG_EXPO.blend'); bpy.ops.wm.save_as_mainfile(filepath=out, compress=True); print('blend →', out); return
    passes(sc, cam)


if __name__ == '__main__':
    main()
