# Помощники для моделей «Ограбления 3D»: материалы, примитивы, склейка по материалам, выгрузка GLB.
# Запуск: OUT=/куда/класть blender -b --factory-startup --python tools/models/<модель>.py
# потом gltf-transform meshopt out/<модель>.glb assets/models/<модель>.glb
# Оси Blender: X вправо, -Y к зрителю (лицо модели), Z вверх. glTF-экспорт сам переводит в Y-up, лицо +Z.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

OUT = os.environ.get("OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")) + "/"
MATS = {}


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for d in list(coll):
            coll.remove(d)
    MATS.clear()


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h):
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255), 1.0)


def mat(name, color, metal=0.0, rough=0.5, emit=None, emit_k=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = hexc(color)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit is not None:
        b.inputs["Emission Color"].default_value = hexc(emit)
        b.inputs["Emission Strength"].default_value = emit_k
    MATS[name] = m
    return m


def from_bm(bm, name, m, smooth=False, sharp=35):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    if smooth:
        me.shade_smooth()
        if sharp:
            me.set_sharp_from_angle(angle=math.radians(sharp))
    return o


def place(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    o.location = loc
    o.rotation_euler = Euler([math.radians(a) for a in rot])
    if scale:
        o.scale = scale
    return o


def bevel(o, w, segs=2, angle=40):
    if w <= 0:
        return o
    md = o.modifiers.new("bev", "BEVEL")
    md.width = w
    md.segments = segs
    md.limit_method = "ANGLE"
    md.angle_limit = math.radians(angle)
    md.harden_normals = False
    o.data.shade_smooth()
    o.data.set_sharp_from_angle(angle=math.radians(angle))
    return o


def box(name, m, x0, x1, y0, y1, z0, z1, bev=0.0, segs=2):
    """Брусок по границам (удобнее, чем центр и размер)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    o = from_bm(bm, name, m)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    return bevel(o, bev, segs)


def cyl(name, m, r, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=16, r2=None, caps=True, bev=0.0, smooth=True):
    """Цилиндр (или конус при r2) вдоль Z, центр в loc."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs,
                          radius1=r, radius2=r if r2 is None else r2, depth=h)
    o = from_bm(bm, name, m, smooth=smooth, sharp=40)
    place(o, loc, rot)
    return bevel(o, bev, 2) if bev else o


def sphere(name, m, r, loc=(0, 0, 0), scale=(1, 1, 1), segs=16, rings=10, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    o = from_bm(bm, name, m, smooth=True, sharp=0)
    return place(o, loc, rot)


def torus(name, m, R, r, loc=(0, 0, 0), rot=(0, 0, 0), seg=24, rseg=8, arc=360):
    """Тор вокруг оси Z (arc — дуга в градусах)."""
    bm = bmesh.new()
    rings = []
    n = seg if arc >= 360 else seg + 1
    for i in range(n):
        a = math.radians(arc) * i / seg
        c = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            p = c * (R + r * math.cos(b)) + Vector((0, 0, r * math.sin(b)))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(rseg):
            bm.faces.new((a[j], a[(j + 1) % rseg], b[(j + 1) % rseg], b[j]))
    o = from_bm(bm, name, m, smooth=True, sharp=0)
    return place(o, loc, rot)


def tube(name, m, pts, radii, segs=8, caps=True):
    """Трубка по точкам (кости, рёбра): радиус в каждой точке."""
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    if isinstance(radii, (int, float)):
        radii = [radii] * len(pts)
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev_n is None:
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n1 = t.cross(up).normalized()
        else:
            n1 = (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = n1
        n2 = t.cross(n1).normalized()
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            ring.append(bm.verts.new(p + (n1 * math.cos(a) + n2 * math.sin(a)) * radii[i]))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(segs):
            bm.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return from_bm(bm, name, m, smooth=True, sharp=0)


def lathe(name, m, prof, segs=24, loc=(0, 0, 0), rot=(0, 0, 0), sharp=30):
    """Тело вращения: prof — список (радиус, высота) снизу вверх, ось Z."""
    bm = bmesh.new()
    rings = []
    for (r, z) in prof:
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(segs):
            bm.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    if prof[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if prof[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    o = from_bm(bm, name, m, smooth=True, sharp=sharp)
    return place(o, loc, rot)


def extrude_outline(name, m, pts2d, z0, z1, bev=0.0, plane="XY"):
    """Плоский контур (x, y) выдавить по третьей оси от z0 до z1."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for (x, y) in pts2d]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, z1 - z0), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bm(bm, name, m)
    if plane == "XZ":  # контур в плоскости XZ, толщина по Y
        o.rotation_euler = Euler((math.radians(90), 0, 0))
    return bevel(o, bev, 2) if bev else o


def finalize(root_name, objs=None, parent=None):
    """Применить модификаторы, склеить по материалам, повесить на пустышку root_name."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    objs = objs if objs is not None else [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent is None and not o.get("done")]
    by = {}
    for o in objs:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        me.transform(o.matrix_world)
        mname = o.data.materials[0].name if o.data.materials else "none"
        by.setdefault(mname, []).append(me)
    # исходные детали удаляем сразу: иначе имя узла может занять деталь с таким же именем
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    if parent:
        root.parent = parent
    for mname, meshes in by.items():
        bm = bmesh.new()
        for me in meshes:
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
        out = bpy.data.meshes.new(root_name + "_" + mname)
        bm.to_mesh(out)
        bm.free()
        o = bpy.data.objects.new(root_name + "_" + mname, out)
        bpy.context.scene.collection.objects.link(o)
        out.materials.append(bpy.data.materials[mname])
        o.parent = root
        o["done"] = 1
    root["done"] = 1
    return root


def stats():
    tris = 0
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return tris, len([o for o in bpy.context.scene.objects if o.type == "MESH"])


def export(fname):
    os.makedirs(OUT, exist_ok=True)
    path = OUT + fname + ".glb"
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False,
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False, export_texcoords=True, export_normals=True)
    t, m = stats()
    print(f"{fname}: {t} треуг., {m} мешей, {os.path.getsize(path)//1024} КБ")
    return path
