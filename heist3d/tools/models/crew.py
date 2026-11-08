# Вор и штурман для меню и сценок: одежда Quaternius Modular Character Outfits Fantasy (CC0) + голова и глаза
# из Universal Base Characters (CC0), скелет у всех один (65 костей, как у охранника) — анимации UAL подходят как есть.
# Исходники не в репозитории (тяжёлые): RAW=<папка raw/quaternius> OUT=<куда> blender -b --factory-startup --python tools/models/crew.py
# Потом: gltf-transform optimize --texture-compress webp --texture-size 1024 и gltf-transform meshopt.
# Вор: наряд Ranger перекрашен в чёрное, капюшон, под ним балаклава (видны глаза), чёрные перчатки; наплечник и наручи убраны.
# Штурман: наряд Peasant (тёмно-оливковый), светлые штаны — в джинсу, голова с короткой стрижкой.
import bpy, bmesh, os, math
import numpy as np

RAW = os.environ.get("RAW", os.path.expanduser("~/projects/heist-src/raw/quaternius"))
OUT = os.environ.get("OUT", "/tmp") + "/"
UBC = RAW + "/chars/Universal Base Characters[Standard]"
MCO = RAW + "/outfits/x/Modular Character Outfits - Fantasy[Standard]"
GL = MCO + "/Exports/glTF (Godot-Unreal)"


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(coll):
            coll.remove(d)


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def arm_of(objs):
    return next(o for o in objs if o.type == "ARMATURE")


def rebind(o, arm):
    """Меш с чужого скелета на наш (имена костей те же)."""
    for m in o.modifiers:
        if m.type == "ARMATURE":
            m.object = arm
    mw = o.matrix_world.copy()
    o.parent = arm
    o.matrix_world = mw


def keep_head(o, keep_neck=True):
    """От тела оставить голову (и шею): вершины, которые тянут кости Head / neck_01."""
    names = {"Head"} | ({"neck_01"} if keep_neck else set())
    idx = {g.index for g in o.vertex_groups if g.name in names}
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    kill = []
    for v in bm.verts:
        w = sum(wt for gi, wt in v[dl].items() if gi in idx)
        if w < 0.5:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(me)
    bm.free()


def decimate(o, ratio):
    """Облегчить меш: модификатор ставим первым (до скелета) и применяем."""
    md = o.modifiers.new("dec", "DECIMATE")
    md.ratio = ratio
    o.modifiers.move(len(o.modifiers) - 1, 0)
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier=md.name)


def img_of(mat, socket="Base Color"):
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    link = b.inputs[socket].links
    if not link:
        return None
    n = link[0].from_node
    while n.type != "TEX_IMAGE" and n.inputs and n.inputs[0].links:
        n = n.inputs[0].links[0].from_node
    return n.image if n.type == "TEX_IMAGE" else None


def shrink_all(size=1024):
    for im in bpy.data.images:
        if im.size[0] > size:
            im.scale(size, size)


def recolor(im, fn):
    """Перекрасить картинку numpy-функцией fn(rgb 0..1) -> rgb."""
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    px[..., :3] = np.clip(fn(px[..., :3]), 0, 1)
    im.pixels[:] = px.ravel()
    im.update()
    im.pack()


def plain(mat, color, rough=0.9):
    """Материал одним цветом (балаклава, перчатки)."""
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for s in ("Base Color", "Roughness", "Metallic"):
        for l in list(b.inputs[s].links):
            mat.node_tree.links.remove(l)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0


def lum(c):
    return c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11


def build(kind):
    reset()
    outfit = imp(GL + ("/Outfits/Male_Ranger.gltf" if kind == "thief" else "/Outfits/Male_Peasant.gltf"))
    arm = arm_of(outfit)
    arm.name = kind
    body = imp(UBC + "/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf")
    arm2 = arm_of(body)
    for o in body:
        if o.type != "MESH":
            continue
        mname = o.data.materials[0].name if o.data.materials else ""
        if kind == "thief" and "Hair" in mname:  # брови под балаклавой не нужны
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if "Superhero" in mname:
            keep_head(o)
        rebind(o, arm)
    bpy.data.objects.remove(arm2, do_unlink=True)
    if kind == "nav":
        hair = imp(UBC + "/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Buzzed.gltf")
        harm = [o for o in hair if o.type == "ARMATURE"]
        for o in hair:
            if o.type == "MESH":
                if o.parent and o.parent.type == "ARMATURE" and any(m.type == "ARMATURE" for m in o.modifiers):
                    rebind(o, arm)
                else:
                    # причёска без кожи: просто на кость головы
                    mw = o.matrix_world.copy()
                    o.parent = arm
                    o.parent_type = "BONE"
                    o.parent_bone = "Head"
                    o.matrix_world = mw
        for a in harm:
            bpy.data.objects.remove(a, do_unlink=True)
    # лишнее у вора: наплечник и наручи — фэнтези; сапоги тяжёлые — облегчить
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            continue
        if kind == "thief" and ("Pauldron" in o.name or "Bracer" in o.name):
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if "Boots" in o.name or (kind == "nav" and "Feet" in o.name):
            decimate(o, 0.35)
    shrink_all(1024)
    # перекраска
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        n = m.name
        if kind == "thief":
            if "Ranger" in n:
                im = img_of(m)
                if im:
                    # всё в угольно-чёрное с еле заметной разницей тканей и кожи; металл — тусклый серый
                    recolor(im, lambda c: (0.025 + 0.2 * lum(c)[..., None] ** 1.25) * np.array([0.95, 0.98, 1.08]))
            elif "Regular_Male" in n or "Superhero" in n:
                plain(m, (0.018, 0.019, 0.022), 0.85)  # перчатки и балаклава
        else:
            if "Peasant" in n:
                # тёмно-оливковый вариант наряда вместо бурого
                bc = next(nd for nd in m.node_tree.nodes if nd.type == "TEX_IMAGE" and nd.image and "BaseColor" in nd.image.name)
                bc.image = bpy.data.images.load(MCO + "/Textures/Peasant/T_Peasant_2_BaseColor.png")
                bc.image.scale(1024, 1024)
                im = bc.image
                if im:
                    def nav(c):
                        mx = c.max(-1)
                        mn = c.min(-1)
                        s = (mx - mn) / (mx + 1e-4)
                        light = (mx > 0.45) & (s < 0.35)  # светлая холстина штанов и рубахи -> тёмная джинса
                        out = c.copy()
                        l = lum(c)[..., None]
                        out[light] = (l[light] * np.array([0.33, 0.42, 0.62]))
                        return out * 0.9
                    recolor(im, nav)
    return arm


def export(kind):
    os.makedirs(OUT, exist_ok=True)
    path = OUT + kind + ".glb"
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False, export_animations=False,
                              export_skins=True, export_apply=False, export_cameras=False, export_lights=False,
                              export_image_format="JPEG")
    tris = 0
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    print(f"{kind}: {tris} треуг., {os.path.getsize(path) // 1024} КБ")


for k in ("thief", "nav"):
    build(k)
    export(k)
