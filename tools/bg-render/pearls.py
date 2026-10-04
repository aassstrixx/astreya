"""08 · жемчуг и пузырьки: перламутровые жемчужины и радужные пузырьки сыворотки на молочном фоне (Cycles, тонкая плёнка Principled BSDF).
Жемчужина — знак «Астреи» (шар на логотипе и шар героя главной), поэтому текстура вписывается в фирменный образ."""
from common import *

def pearl_mat(name, tint=(0.82, 0.80, 0.78), film=320):
    return principled(name, tint, 0.16, **{'Coat Weight': 0.7, 'Coat Roughness': 0.04, 'Sheen Weight': 0.5, 'Sheen Roughness': 0.3, 'Specular IOR Level': 0.6,
                                         'Thin Film Thickness': film, 'Thin Film IOR': 1.45})

def bubble_mat(name, film=480, ior=1.04):
    """Прозрачный пузырь: почти не преломляет (виден тонкий радужный ободок), для теневых лучей — прозрачный, чтобы не было чёрной тени."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); pb = nt.nodes.new('ShaderNodeBsdfPrincipled')
    pb.inputs['Base Color'].default_value = (1, 1, 1, 1); pb.inputs['Roughness'].default_value = 0.0; pb.inputs['IOR'].default_value = ior
    pb.inputs['Transmission Weight'].default_value = 1.0; pb.inputs['Specular IOR Level'].default_value = 1.0
    pb.inputs['Thin Film Thickness'].default_value = film; pb.inputs['Thin Film IOR'].default_value = 1.4
    lp = nt.nodes.new('ShaderNodeLightPath'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (0.9, 0.9, 0.9, 1)
    mix = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(lp.outputs['Is Shadow Ray'], mix.inputs['Fac']); nt.links.new(pb.outputs['BSDF'], mix.inputs[1]); nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m

if __name__ == '__main__':
    o, W, H, S, seed = argv(); rng = np.random.default_rng(seed)
    reset(); render_setup(W, H, S, o['out'], exposure=-0.55, bounces=24)
    world((0.62, 0.59, 0.55), 1.0, top=(0.93, 0.91, 0.87))
    bg = principled('bg', (0.74, 0.70, 0.65), 0.92, **{'Specular IOR Level': 0.08}); plane_backdrop(bg, (60, 60), loc=(0, 0.0, 0))
    # жемчужины (лежат на плоскости, r = высота центра): (x, y, радиус, плёнка, оттенок)
    pearls = [(1.15, -0.1, 0.46, 320, (0.84, 0.82, 0.80)), (0.35, 0.55, 0.26, 420, (0.80, 0.80, 0.84)), (1.85, 0.5, 0.20, 360, (0.85, 0.82, 0.82)),
              (0.7, -0.75, 0.16, 300, (0.82, 0.82, 0.82)), (2.2, -0.55, 0.12, 380, (0.84, 0.82, 0.83))]
    for i, (x, y, r, film, tint) in enumerate(pearls): sphere((x, y, r), r, pearl_mat(f'p{i}', tint, film), seg=128, rings=64)
    # пузыри в воздухе — разного размера и глубины; ближние и дальние уходят в размытие
    bub = [(0.15, -0.25, 0.9, 0.34, 520), (1.55, 0.2, 1.25, 0.22, 450), (2.35, 0.15, 0.7, 0.30, 560), (0.55, 0.15, 1.7, 0.14, 480), (1.1, -0.55, 1.05, 0.12, 600),
           (2.7, -0.2, 1.6, 0.18, 430), (-0.5, 0.35, 1.3, 0.40, 500), (1.95, -0.1, 0.45, 0.10, 520), (0.0, -0.8, 0.5, 0.08, 480), (2.9, 0.6, 0.9, 0.25, 540),
           (-0.95, -0.15, 0.75, 0.22, 470), (1.3, 0.9, 1.4, 0.16, 580), (0.8, 0.0, 2.2, 0.12, 500), (-0.2, 0.9, 0.5, 0.12, 520)]
    for i, (x, y, z, r, film) in enumerate(bub): sphere((x, y, z), r, bubble_mat(f'b{i}', film), seg=96, rings=48)
    area_light((-2.2, -2.4, 3.4), (1, 0, 0.4), 2.4, 80, (1, 0.96, 0.9), shape='DISK')
    area_light((4.0, -1.8, 2.6), (1, 0, 0.4), 3.0, 55, (0.93, 0.96, 1.0), shape='DISK')
    area_light((1.0, 3.2, 2.0), (1, 0, 0.4), 3.0, 70, (1, 1, 1), shape='DISK')
    camera((-0.7, -4.8, 3.1), (0.35, 0, 0.4), lens=55, fstop=2.0, focus=(1.15, -0.1, 0.46))
    save_and_render()
