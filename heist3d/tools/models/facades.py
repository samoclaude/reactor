# Фасады зданий для сценок и меню: музей, банк, офис-небоскрёб, ювелирный дом.
# Каждое здание — корневой узел (museum, bank, office, jewelry); начало — на линии участка при x = 0
# (задний край тротуара), земля — z = 0, здание уходит в +Y, лицом к -Y (в игре +Z, к улице).
# У каждого: <узел>_entry (пустышка у входа вора, снаружи) и <узел>_door (створка, начало узла — петля).
# Камень, штукатурка, шифер и прочее — UV «по метрам» (1 = 1 м); окна — клетка атласа 0..3 (как в street.py).
# Быстрая проверка одного здания: ONLY=museum blender -b --factory-startup --python tools/models/facades.py
import sys, os, importlib, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
importlib.reload(common)
from common import *

reset()
random.seed(11)
ONLY = os.environ.get("ONLY", "")


def want(n):
    return not ONLY or n in ONLY.split(",")


# ---------- общие материалы (имена те же, что у особняка: игра подменит текстурами) ----------
stone = mat("stone", 0xc9b89a, 0.0, 0.85)
trim = mat("trim", 0xe2d8c4, 0.0, 0.7)
dark = mat("darkstone", 0x6e665a, 0.0, 0.9)
slate = mat("slate", 0x5b6068, 0.0, 0.8)
iron = mat("iron", 0x15171a, 0.6, 0.45)
frame = mat("frame", 0xd8d2c6, 0.0, 0.5)
wood = mat("wood", 0x2a1a10, 0.0, 0.6)
brass = mat("brass", 0x8a6a30, 0.8, 0.35)
brick = mat("brick", 0x5a2e24, 0.0, 0.9)
lit = mat("win_lit", 0xffd7a0, 0.0, 0.3, emit=0xffb060, emit_k=2.0)
dk = mat("win_dark", 0x0a0f18, 0.3, 0.08)
lampg = mat("lamp_glass", 0xfff0c8, 0.0, 0.2, emit=0xffc070, emit_k=4.0)
# материалы со своими UV (boxuv к ним не применяется)
OWN_UV = {"win_lit", "win_dark", "sign", "curtain", "shop_window", "banner_red", "banner_blue", "shutter_line"}


# ====================== помощники ======================
def quad(name, m, pts, uv):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    lay = bm.loops.layers.uv.verify()
    for lo, (u, v) in zip(f.loops, uv):
        lo[lay].uv = (u, v)
    return from_bm(bm, name, m)


def poly(name, m, pts3, uvs, face=-1):
    """Плоский многоугольник с UV; face = -1 — смотрит на -Y, +1 — на +Y (точки заданы как на виде с -Y)."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts3]
    f = bm.faces.new(vs)
    if (f.normal.y > 0) == (face < 0):
        f.normal_flip()
    lay = bm.loops.layers.uv.verify()
    for lo, uv in zip(f.loops, uvs):
        lo[lay].uv = uv
    return from_bm(bm, name, m)


def prism(name, m, pts, y0, y1):
    """Контур в плоскости XZ (x, z), выдавленный по Y от y0 до y1."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y0, z)) for (x, z) in pts])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, y1 - y0, 0), verts=top)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(bm, name, m)


def prism_yz(name, m, pts, x0, x1):
    """Контур в плоскости YZ (y, z), выдавленный по X от x0 до x1."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x0, y, z)) for (y, z) in pts])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=top)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(bm, name, m)


def arc_pts(xc, zc, r, a0, a1, n):
    return [(xc + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), zc + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def boxuv(o, s=1.0):
    """UV по метрам: каждая грань проецируется по своей главной оси (как в street.py)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    lay = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lo in f.loops:
            p = o.matrix_world @ lo.vert.co
            if ax == 0:
                u, v = p.y * (1 if n.x > 0 else -1), p.z
            elif ax == 1:
                u, v = p.x * (-1 if n.y > 0 else 1), p.z
            else:
                u, v = p.x, p.y
            lo[lay].uv = (u / s, v / s)
    bm.to_mesh(o.data)
    bm.free()


def uv_all(root):
    for o in root.children:
        if o.type == "MESH" and o.data.materials and o.data.materials[0].name not in OWN_UV:
            boxuv(o)


class Acc:
    """Накопитель мелких одинаковых деталей одного материала (прутья, балясины) в один меш."""

    def __init__(self, name, m):
        self.bm = bmesh.new()
        self.name, self.m = name, m

    def quad(self, a, b, c, d):
        self.bm.faces.new([self.bm.verts.new(p) for p in (a, b, c, d)])

    def tri(self, a, b, c):
        self.bm.faces.new([self.bm.verts.new(p) for p in (a, b, c)])

    def box(self, x0, x1, y0, y1, z0, z1, bot=True):
        P = lambda x, y, z: (x, y, z)
        self.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1))  # -Y
        self.quad(P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1))  # +Y
        self.quad(P(x0, y1, z0), P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1))  # -X
        self.quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1))  # +X
        self.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1))  # +Z
        if bot:
            self.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), P(x0, y0, z0))  # -Z

    def bar(self, x, y, z0, z1, h, spike=0.0):
        """Прут: четыре стороны без днища, сверху — пика."""
        a, b = x - h, x + h
        ya, yb = y - h, y + h
        self.quad((a, ya, z0), (b, ya, z0), (b, ya, z1), (a, ya, z1))
        self.quad((b, yb, z0), (a, yb, z0), (a, yb, z1), (b, yb, z1))
        self.quad((a, yb, z0), (a, ya, z0), (a, ya, z1), (a, yb, z1))
        self.quad((b, ya, z0), (b, yb, z0), (b, yb, z1), (b, ya, z1))
        if spike > 0:
            t = (x, y, z1 + spike)
            self.tri((a, ya, z1), (b, ya, z1), t)
            self.tri((b, yb, z1), (a, yb, z1), t)
            self.tri((a, yb, z1), (a, ya, z1), t)
            self.tri((b, ya, z1), (b, yb, z1), t)

    def done(self):
        return from_bm(self.bm, self.name, self.m)


def rust_wall(m, x0, x1, y0, y1, z0, z1, h=0.6, ex=0.035, gap=0.04):
    """Рустованная стена: сердцевина и ряды плит, между ними швы."""
    if x1 - x0 < 0.02:
        return
    box("rcore", m, x0, x1, y0 + ex, y1, z0, z1)
    n = max(1, round((z1 - z0) / h))
    hh = (z1 - z0) / n
    for i in range(n):
        box("rslab", m, x0, x1, y0, y0 + ex + 0.01, z0 + i * hh + gap / 2, z0 + (i + 1) * hh - gap / 2)


def solid(m, x0, x1, y0, y1, z0, z1, rust=False, h=0.6):
    if x1 - x0 < 0.02:
        return
    if rust:
        rust_wall(m, x0, x1, y0, y1, z0, z1, h)
    else:
        box("wall", m, x0, x1, y0, y1, z0, z1)


def piers_row(m, xa, xb, y0, y1, z0, z1, ops, rust=False, h=0.6):
    """Стена от xa до xb в полосе z0..z1 с проёмами ops = [(центр, ширина)]."""
    x = xa
    for xc, w in sorted(ops):
        solid(m, x, xc - w / 2, y0, y1, z0, z1, rust, h)
        x = xc + w / 2
    solid(m, x, xb, y0, y1, z0, z1, rust, h)


def arch_spandrels(m, ops, zs, y0, y1, n=10):
    """Уголки стены над полукруглыми проёмами (r = w/2, пята на zs)."""
    for xc, w in ops:
        r = w / 2
        pl = [(xc - r, zs + r)] + arc_pts(xc, zs, r, 90, 180, n)
        pr = [(xc + r, zs + r)] + arc_pts(xc, zs, r, 90, 0, n)
        prism("spL", m, pl[::-1], y0, y1)
        prism("spR", m, pr, y0, y1)


def glass(x0, x1, z0, z1, y, k, arch=False, face=-1, n=10):
    """Стекло окна: прямоугольное или с полукруглым верхом; k — клетка атласа 0..3 или None (тёмное)."""
    xc, r = (x0 + x1) / 2, (x1 - x0) / 2
    if arch:
        zs = z1 - r
        pts = [(x0, z0), (x1, z0)] + arc_pts(xc, zs, r, 0, 180, n)
    else:
        pts = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    if k is None:
        uv = [((x - x0) / (x1 - x0), (z - z0) / (z1 - z0)) for x, z in pts]
        mm = dk
    else:
        uv = [((k + (x - x0) / (x1 - x0)) / 4.0, (z - z0) / (z1 - z0)) for x, z in pts]
        mm = lit
    return poly("glass", mm, [(x, y, z) for x, z in pts], uv, face)


def mullions(xc, w, z0, z1, y, arch=False, m=None, t=0.05, nz=2, d=0.04):
    """Переплёт: вертикальная средняя, горизонтали, по краям рама; для арки — перекладина на пяте и дуга."""
    m = m or frame
    x0, x1 = xc - w / 2, xc + w / 2
    zs = z1 - w / 2 if arch else z1
    box("mv", m, xc - t / 2, xc + t / 2, y - d, y, z0, zs if arch else z1)
    for i in range(1, nz + 1):
        zz = z0 + (zs - z0) * i / (nz + 1)
        box("mh", m, x0, x1, y - d, y, zz - t / 2, zz + t / 2)
    if arch:
        box("mh", m, x0, x1, y - d, y, zs - t / 2, zs + t / 2)
        pl = arc_pts(xc, zs, w / 2, 0, 180, 10) + arc_pts(xc, zs, w / 2 - t, 180, 0, 10)
        prism("marc", m, pl, y - d, y)
        # лучи веера
        for a in (60, 120):
            tube("mray", m, [(xc, y - d / 2, zs), (xc + (w / 2 - t / 2) * math.cos(math.radians(a)), y - d / 2, zs + (w / 2 - t / 2) * math.sin(math.radians(a)))], t / 2, segs=4)
    box("mf", m, x0, x0 + t, y - d, y, z0, zs)
    box("mf", m, x1 - t, x1, y - d, y, z0, zs)
    box("mb", m, x0, x1, y - d, y, z0, z0 + t)
    if not arch:
        box("mt", m, x0, x1, y - d, y, z1 - t, z1)


def arch_frame(m, xc, w, zl, zs, y0, band=0.22, out=0.1, n=10):
    """Наличник арочного окна: два косяка и полукруглая архивольта; y0 — лицо стены (выступ наружу на out)."""
    r = w / 2
    box("jamb", m, xc - r - band, xc - r, y0 - out, y0 + 0.02, zl, zs)
    box("jamb", m, xc + r, xc + r + band, y0 - out, y0 + 0.02, zl, zs)
    pl = arc_pts(xc, zs, r + band, 0, 180, n) + arc_pts(xc, zs, r, 180, 0, n)
    prism("archivolt", m, pl, y0 - out, y0 + 0.02)
    # замковый камень
    box("keystone", m, xc - 0.17, xc + 0.17, y0 - out - 0.07, y0 + 0.02, zs + r - 0.04, zs + r + band + 0.2)


def rect_frame(m, xc, w, z0, z1, y0, band=0.16, out=0.1):
    """Прямоугольный наличник: косяки, перемычка."""
    box("jamb", m, xc - w / 2 - band, xc - w / 2, y0 - out, y0 + 0.02, z0, z1 + band)
    box("jamb", m, xc + w / 2, xc + w / 2 + band, y0 - out, y0 + 0.02, z0, z1 + band)
    box("head", m, xc - w / 2 - band, xc + w / 2 + band, y0 - out, y0 + 0.02, z1, z1 + band)


def sill(m, xc, w, z0, y0, out=0.2, h=0.12, ext=0.18):
    box("sill", m, xc - w / 2 - ext, xc + w / 2 + ext, y0 - out, y0 + 0.02, z0 - h, z0)


def cell(seed, lit_p):
    """Случайно: клетка атласа 0..3 или None (тёмное окно)."""
    rnd = random.Random(seed)
    return rnd.randrange(4) if rnd.random() < lit_p else None


def fluted(name, m, loc, prof, nfl=12, depth=0.03):
    """Колонна с каннелюрами: кольца с чередующимся радиусом."""
    bm = bmesh.new()
    rings = []
    for (r, z) in prof:
        ring = []
        for j in range(nfl * 2):
            a = 2 * math.pi * j / (nfl * 2)
            rr = r if j % 2 == 0 else r - depth
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        rings.append(ring)
    n = nfl * 2
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    o = from_bm(bm, name, m, smooth=True, sharp=25)
    o.location = loc
    return o


def tilted_cone(m, r, h, r2, loc, tilt, yaw, segs=5):
    """Лист капители и подобное: конус, наклонённый от оси на tilt и повёрнутый на yaw (градусы)."""
    o = cyl("leaf", m, r, h, loc=(0, 0, 0), segs=segs, r2=r2, smooth=False, caps=False)
    o.location = loc
    mrot = Matrix.Rotation(math.radians(yaw), 3, "Z") @ Matrix.Rotation(math.radians(tilt), 3, "X")
    o.rotation_euler = mrot.to_euler()
    return o


def dbg():
    """Отладка: DBG=1 печатает самые тяжёлые детали (по имени и материалу)."""
    if not os.environ.get("DBG"):
        return
    import collections
    cnt = collections.Counter()
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.parent is None:
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            cnt[o.name.split(".")[0] + ":" + o.data.materials[0].name] += len(me.loop_triangles)
    for k, v in cnt.most_common(22):
        print("DBG", k, v)


def set_root_pivot(root, p):
    """Начало узла — в точке p (петля): сам узел сдвинут на p, детали — на -p."""
    for c in root.children:
        c.location = (-p[0], -p[1], -p[2])
    root.location = p


def empty(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.location = loc
    bpy.context.scene.collection.objects.link(e)
    e.parent = parent
    return e




# ============================================================
#                          МУЗЕЙ
# ============================================================
# Площадь 11 м, лестница 4 м, портик 7 м, стена-фасад на y = 22, длинные крылья, купол за фронтоном.
if want("museum"):
    plaza = mat("plaza", 0xb3ab9c, 0.0, 0.85)  # плиты площади
    plaza_j = mat("plaza_joint", 0x6f685c, 0.0, 0.95)
    bronze = mat("bronze", 0x34382c, 0.6, 0.45)
    copper = mat("copper", 0x4d7566, 0.5, 0.5)
    banner_r = mat("banner_red", 0x5c1020, 0.0, 0.92)
    banner_b = mat("banner_blue", 0x172a55, 0.0, 0.92)

    ZP = 0.04  # верх площади
    ZS = 1.9  # верх стилобата
    Y0S, Y1S = 11.0, 15.0  # лестница
    YW = 22.0  # лицо стены целлы и крыльев
    YC = 17.0  # ось колонн
    ZE = 10.9  # низ антаблемента (верх колонн)
    ZCR = 13.1  # верх венчающего карниза

    # ---------- калитка (отдельный узел, петля слева) ----------
    HX, GW, GH = -0.4, 1.3, 2.05
    a = Acc("gate_bars", iron)
    nb = 12
    for i in range(nb):
        x = HX + 0.08 + (i + 0.5) * (GW - 0.16) / nb
        t = (x - (HX + GW / 2)) / (GW / 2)
        a.bar(x, 0, 0.16, GH - 0.1 + 0.22 * (1 - t * t), 0.013, spike=0.13)
    a.done()
    for z in (0.16, 0.42, 1.25, GH - 0.28):
        box("grail", iron, HX, HX + GW, -0.025, 0.025, z, z + 0.06)
    box("gstile", iron, HX, HX + 0.07, -0.03, 0.03, 0.12, GH + 0.2)
    box("gstile", iron, HX + GW - 0.07, HX + GW, -0.03, 0.03, 0.12, GH + 0.2)
    for i in range(2):
        torus("gscroll", iron, 0.14, 0.012, loc=(HX + 0.36 + i * 0.58, 0, 0.84), rot=(90, 0, 0), seg=12, rseg=4, arc=270)
    box("glatch", brass, HX + GW - 0.2, HX + GW - 0.06, -0.05, 0.05, 1.0, 1.12)
    for z in (0.35, 1.6):
        cyl("ghinge", iron, 0.03, 0.12, loc=(HX, 0, z), segs=6)
    gd = finalize("museum_door")
    set_root_pivot(gd, (HX, 0, 0))

    # ---------- площадь: плиты, швы, окантовка ----------
    box("plaza", plaza, -40, 40, 0.0, Y1S, 0.0, ZP)
    for x in range(-39, 40, 3):  # швы между плитами
        quad("joint", plaza_j, [(x - 0.012, 0.3, ZP + 0.002), (x + 0.012, 0.3, ZP + 0.002), (x + 0.012, Y1S, ZP + 0.002), (x - 0.012, Y1S, ZP + 0.002)], [(0, 0)] * 4)
    for y in range(3, 15, 3):
        quad("joint", plaza_j, [(-40, y - 0.012, ZP + 0.002), (40, y - 0.012, ZP + 0.002), (40, y + 0.012, ZP + 0.002), (-40, y + 0.012, ZP + 0.002)], [(0, 0)] * 4)
    # центральная дорожка более тёмная, с каймой
    box("path", dark, -2.4, 2.4, 0.3, Y0S - 0.01, ZP, ZP + 0.012)
    box("path_edge", trim, -2.6, -2.4, 0.3, Y0S - 0.01, ZP, ZP + 0.016)
    box("path_edge", trim, 2.4, 2.6, 0.3, Y0S - 0.01, ZP, ZP + 0.016)

    # ---------- ограда: каменный цоколь, решётка, столбы, калитка ----------
    xs_l = [-0.75 - 4 * k for k in range(11)]
    xs_r = [1.25 + 4 * k for k in range(11)]
    box("fwall", dark, -40, HX - 0.05, -0.2, 0.2, 0, 0.55)
    box("fwall", dark, HX + GW + 0.05, 40, -0.2, 0.2, 0, 0.55)
    box("fcap", trim, -40, HX - 0.05, -0.25, 0.25, 0.55, 0.62)
    box("fcap", trim, HX + GW + 0.05, 40, -0.25, 0.25, 0.55, 0.62)
    box("threshold", dark, HX - 0.05, HX + GW + 0.05, -0.2, 0.2, 0, 0.05)
    bars = Acc("fence_bars", iron)
    for px in sorted(xs_l + xs_r):
        if abs(px) > 39.6:
            continue
        box("pier", stone, px - 0.28, px + 0.28, -0.28, 0.28, 0, 2.2)
        box("pier_base", dark, px - 0.34, px + 0.34, -0.34, 0.34, 0, 0.7)
        box("pier_cap", trim, px - 0.38, px + 0.38, -0.38, 0.38, 2.2, 2.34)
        box("pier_cap2", trim, px - 0.3, px + 0.3, -0.3, 0.3, 2.34, 2.42)
        sphere("pier_ball", trim, 0.17, loc=(px, 0, 2.6), segs=8, rings=5)
    for lo, hi in [(xs_l[i + 1] + 0.28, xs_l[i] - 0.28) for i in range(10)] + [(xs_r[i] + 0.28, xs_r[i + 1] - 0.28) for i in range(10)]:
        n = int((hi - lo) / (0.18 if max(abs(lo), abs(hi)) < 24 else 0.3))
        for i in range(n):
            bars.bar(lo + (i + 0.5) * (hi - lo) / n, 0, 0.62, 1.55, 0.011, spike=0.1)
        box("frail", iron, lo, hi, -0.02, 0.02, 0.75, 0.8)
        box("frail", iron, lo, hi, -0.02, 0.02, 1.42, 1.47)
    bars.done()
    # столбы калитки с фонарями
    for px in (-0.75, 1.25):
        box("gp", stone, px - 0.3, px + 0.3, -0.3, 0.3, 0, 2.4)
        box("gp_base", dark, px - 0.37, px + 0.37, -0.37, 0.37, 0, 0.75)
        box("gp_band", trim, px - 0.36, px + 0.36, -0.36, 0.36, 1.9, 2.0)
        box("gp_cap", trim, px - 0.42, px + 0.42, -0.42, 0.42, 2.4, 2.56)
        box("gp_cap2", trim, px - 0.32, px + 0.32, -0.32, 0.32, 2.56, 2.64)
        lathe("gl_base", iron, [(0.13, 0), (0.09, 0.05), (0.05, 0.1)], segs=8, loc=(px, 0, 2.64))
        lathe("gl_glass", lampg, [(0.0, 0), (0.12, 0), (0.15, 0.4), (0.0, 0.4)], segs=6, loc=(px, 0, 2.7), sharp=10)
        lathe("gl_roof", iron, [(0.22, 0), (0.16, 0.06), (0.05, 0.18), (0.0, 0.26)], segs=6, loc=(px, 0, 3.1))

    # ---------- лестница во всю ширину портика ----------
    NST = 11
    rise, tread = ZS / NST, (Y1S - Y0S) / NST
    for k in range(1, NST + 1):
        y0 = Y1S - (NST + 1 - k) * tread
        box("step", dark, -14.2, 14.2, y0, Y1S + 0.01, 0, k * rise)
        box("nosing", trim, -14.2, 14.2, y0 - 0.03, y0 + 0.05, k * rise - 0.03, k * rise)
    # боковые щёки лестницы со скатом
    for sx in (-1, 1):
        x0, x1 = (14.2, 15.5) if sx > 0 else (-15.5, -14.2)
        prism_yz("cheek", dark, [(Y0S, 0), (Y1S, 0), (Y1S, ZS + 1.0), (Y0S, 0.8)], x0, x1)
        prism_yz("cheek_cap", trim, [(Y0S - 0.05, 0.76), (Y1S + 0.05, ZS + 0.96), (Y1S + 0.05, ZS + 1.08), (Y0S - 0.05, 0.88)], x0 - 0.06, x1 + 0.06)

    # ---------- терраса и стилобат ----------
    box("terrace", dark, -40, 40, Y1S, YW, 0, ZS)
    box("terrace_band", trim, -40, 40, Y1S - 0.12, YW, ZS - 0.14, ZS)
    for x in range(-39, 40, 3):
        quad("joint", plaza_j, [(x - 0.012, Y1S, ZS + 0.002), (x + 0.012, Y1S, ZS + 0.002), (x + 0.012, YW, ZS + 0.002), (x - 0.012, YW, ZS + 0.002)], [(0, 0)] * 4)
    # парапет террасы вдоль крыльев: цоколь, филёнки, столбики с шарами
    for sx in (-1, 1):
        xa, xb = sorted((sx * 15.6, sx * 39.6))
        box("par_base", trim, xa, xb, Y1S + 0.05, Y1S + 0.5, ZS, ZS + 0.18)
        box("par_wall", stone, xa, xb, Y1S + 0.1, Y1S + 0.42, ZS + 0.18, ZS + 0.95)
        box("par_cap", trim, xa, xb, Y1S + 0.02, Y1S + 0.5, ZS + 0.95, ZS + 1.1)
        n = int((xb - xa) / 4.3)
        for i in range(n + 1):
            px = xa + i * (xb - xa) / n
            box("par_post", trim, px - 0.26, px + 0.26, Y1S + 0.0, Y1S + 0.52, ZS, ZS + 1.1)
            box("par_postcap", trim, px - 0.31, px + 0.31, Y1S - 0.05, Y1S + 0.57, ZS + 1.1, ZS + 1.2)
            lathe("urn", trim, [(0.0, 0), (0.16, 0), (0.12, 0.1), (0.26, 0.3), (0.1, 0.55), (0.0, 0.62)], segs=6, loc=(px, Y1S + 0.26, ZS + 1.2))
    box("stylobate", dark, -14.2, 14.2, Y1S, YW, ZS - 0.02, ZS)

    # ---------- колоннада: 8 колонн ----------
    def column(x, y, z0):
        box("plinth", trim, x - 0.78, x + 0.78, y - 0.78, y + 0.78, z0, z0 + 0.18)
        lathe("col_base", trim, [(0.7, 0), (0.7, 0.08), (0.62, 0.15), (0.6, 0.24), (0.55, 0.37)], segs=12, loc=(x, y, z0 + 0.18), sharp=40)
        z1 = z0 + 0.55
        prof = [(0.55 - 0.08 * (k / 6) ** 1.8 + 0.025 * math.sin(math.pi * k / 6), z1 + k * 7.0 / 6) for k in range(7)]
        fluted("col_shaft", trim, (x, y, 0), prof, nfl=12, depth=0.03)
        lathe("col_neck", trim, [(0.47, 0), (0.5, 0.05), (0.47, 0.09)], segs=16, loc=(x, y, z1 + 7.0), sharp=40)
        zc = z1 + 7.09
        lathe("col_bell", trim, [(0.47, 0), (0.5, 0.2), (0.6, 0.55), (0.72, 0.9), (0.78, 1.05)], segs=16, loc=(x, y, zc), sharp=40)
        for row, (rr, h, zz, n) in enumerate(((0.56, 0.5, 0.05, 8), (0.64, 0.55, 0.42, 8))):
            for i in range(n):
                yaw = 360 * (i + 0.5 * row) / n
                px, py = x - rr * math.sin(math.radians(yaw)), y + rr * math.cos(math.radians(yaw))
                tilted_cone(trim, 0.15, h, 0.03, (px, py, zc + zz + h / 2), 14, yaw, segs=4)
        box("abacus", trim, x - 0.86, x + 0.86, y - 0.86, y + 0.86, zc + 1.02, zc + 1.14)
        box("abacus2", trim, x - 0.74, x + 0.74, y - 0.74, y + 0.74, zc + 0.92, zc + 1.02)
        for sx in (-1, 1):
            for sy in (-1, 1):
                sphere("volute", trim, 0.15, loc=(x + sx * 0.66, y + sy * 0.66, zc + 0.86), segs=5, rings=3)

    for i in range(8):
        column((i - 3.5) * 3.4, YC, ZS)

    # антаблемент
    XE = 13.5
    box("archi1", trim, -XE, XE, YC - 0.66, YW, ZE, ZE + 0.28)
    box("archi2", trim, -XE, XE, YC - 0.72, YW, ZE + 0.28, ZE + 0.56)
    box("archi3", trim, -XE, XE, YC - 0.78, YW, ZE + 0.56, ZE + 0.8)
    box("frieze", stone, -XE, XE, YC - 0.7, YW, ZE + 0.8, ZE + 1.6)
    box("cornice_a", trim, -XE - 0.1, XE + 0.1, YC - 1.0, YW, ZE + 1.6, ZE + 1.75)
    box("cornice_b", trim, -XE - 0.35, XE + 0.35, YC - 1.3, YW, ZE + 1.75, ZE + 2.0)
    box("cornice_c", trim, -XE - 0.7, XE + 0.7, YC - 1.32, YW, ZE + 2.0, ZE + 2.2)
    den = Acc("dentils", trim)
    for i in range(int(2 * XE / 0.34)):
        x = -XE + 0.17 + i * 0.34
        den.box(x - 0.09, x + 0.09, YC - 1.2, YC - 0.95, ZE + 1.62, ZE + 1.75, bot=False)
    den.done()
    # колоннада внутри: потолок и стена целлы с дверью
    box("portico_ceil", dark, -XE, XE, YC - 0.7, YW, ZE - 0.1, ZE)

    # ---------- фронтон ----------
    s = 0.225
    XP = XE + 0.7
    ZB = ZE + 2.2
    ZA = ZB + XP * s
    for sx in (-1, 1):
        pl = [(sx * XP, ZB), (0, ZA), (0, ZA - 0.65), (sx * (XP - 0.65 / s), ZB)]
        prism("rake", trim, pl if sx > 0 else pl[::-1], YC - 1.32, YW - 3.5)
    ZT0 = ZB + 0.0
    prism("tympanum", stone, [(-(XP - 0.65 / s), ZT0), (0, ZA - 0.65), (XP - 0.65 / s, ZT0)], YC - 0.5, YC + 0.3)
    box("tymp_base", trim, -XP, XP, YC - 1.32, YC + 0.3, ZB - 0.0, ZB + 0.0 + 0.01)
    # рельеф: фигуры из простых форм (тело-конус, голова, руки, плащ)
    yf = YC - 0.52

    def figure(x, h, kind="stand"):
        if kind == "lie":
            sphere("fig", trim, h * 0.9, loc=(x, yf - 0.12, ZB + h * 0.55), scale=(2.1, 0.28, 0.55), segs=10, rings=6)
            sphere("fig_h", trim, h * 0.38, loc=(x - math.copysign(h * 1.6, x), yf - 0.15, ZB + h * 0.75), scale=(1, 0.8, 1), segs=8, rings=6)
            return
        cyl("fig", trim, h * 0.17, h * 0.62, loc=(x, yf - 0.1, ZB + h * 0.4), segs=8, r2=h * 0.09)
        cyl("fig_robe", trim, h * 0.2, h * 0.34, loc=(x, yf - 0.1, ZB + h * 0.19), segs=8, r2=h * 0.17)
        sphere("fig_h", trim, h * 0.075, loc=(x, yf - 0.1, ZB + h * 0.78), segs=6, rings=4)
        for sx2 in (-1, 1):
            tube("fig_arm", trim, [(x + sx2 * h * 0.1, yf - 0.1, ZB + h * 0.6), (x + sx2 * h * 0.26, yf - 0.16, ZB + h * (0.62 if kind != "arms" else 0.78))], [h * 0.03, h * 0.02], segs=5)
        box("fig_back", trim, x - h * 0.12, x + h * 0.12, yf - 0.02, yf + 0.0, ZB + h * 0.05, ZB + h * 0.65)

    figure(0, 2.3, "arms")
    for sx in (-1, 1):
        figure(sx * 2.4, 1.8)
        figure(sx * 4.6, 1.35, "arms")
        figure(sx * 6.6, 0.95)
        figure(sx * 8.9, 0.45, "lie")
    # солнечный диск над центральной фигурой — кольцо с лучами
    torus("sun", trim, 0.32, 0.06, loc=(0, yf - 0.1, ZB + 2.0), rot=(90, 0, 0), seg=14, rseg=5)

    # крыша портика (скаты к стене) и аттик над целлой
    for sx in (-1, 1):
        ys0, ys1 = YC - 0.5, YW
        pts = [(sx * XP * 0.99, ZB), (0, ZA - 0.2), (0, ZA - 0.2 + 0.15), (sx * XP * 0.99, ZB + 0.15)]
        prism("roof_ridge", slate, pts if sx > 0 else pts[::-1], ys0 + 1.0, ys1)
    box("attic", stone, -XE - 0.7, XE + 0.7, YW, 44, ZCR, 17.0)
    box("attic_cor1", trim, -XE - 0.9, XE + 0.9, YW - 0.25, 44, 17.0, 17.2)
    box("attic_cor2", trim, -XE - 1.15, XE + 1.15, YW - 0.55, 44, 17.2, 17.5)
    box("attic_cor3", trim, -XE - 0.95, XE + 0.95, YW - 0.3, 44, 17.5, 17.65)
    for sx in (-1, 1):
        for x in (3.4, 8.0):
            xx = sx * x
            box("attic_panel", dark, xx - 1.5, xx + 1.5, YW - 0.04, YW + 0.1, 14.5, 16.4)
            box("attic_panel_f", trim, xx - 1.62, xx + 1.62, YW - 0.1, YW + 0.1, 14.38, 14.5)
            box("attic_panel_f", trim, xx - 1.62, xx + 1.62, YW - 0.1, YW + 0.1, 16.4, 16.52)
            box("attic_panel_f", trim, xx - 1.62, xx - 1.5, YW - 0.1, YW + 0.1, 14.5, 16.4)
            box("attic_panel_f", trim, xx + 1.5, xx + 1.62, YW - 0.1, YW + 0.1, 14.5, 16.4)

    # ---------- стена целлы: дверь и окна (за баннерами) ----------
    XC = 14.0
    ops_c = [(-10.2, 1.7), (-5.1, 1.7), (5.1, 1.7), (10.2, 1.7)]
    wy1 = YW + 0.9
    box("cella_base", dark, -XC, XC, YW - 0.12, wy1, ZS, ZS + 0.9)
    box("cella_band", trim, -XC, XC, YW - 0.16, wy1, ZS + 0.9, ZS + 1.05)
    # дверной проём 3.0 × 6.0
    DW, DHt = 3.0, 6.0
    box("cella_w", stone, -XC, -DW / 2, YW, wy1, ZS + 1.05, ZE)
    box("cella_w", stone, DW / 2, XC, YW, wy1, ZS + 1.05, ZE)
    box("cella_w", stone, -DW / 2, DW / 2, YW, wy1, ZS + DHt, ZE)
    # окна целлы: простые, с наличниками и сухариками над ними; стена вокруг них сплошная
    for xc, w in ops_c:
        z0w, z1w = 4.2, 9.0
        # окно вырезаем «рамой» из частей поверх сплошной стены: делаем наличник и утопленное стекло
        rect_frame(trim, xc, w, z0w, z1w, YW, band=0.2, out=0.1)
        box("wcor", trim, xc - w / 2 - 0.45, xc + w / 2 + 0.45, YW - 0.3, YW + 0.02, z1w + 0.2, z1w + 0.38)
        box("wfr", trim, xc - w / 2 - 0.26, xc + w / 2 + 0.26, YW - 0.13, YW + 0.02, z1w + 0.16, z1w + 0.2)
        sill(trim, xc, w, z0w, YW, out=0.26)
        kk = 1 if xc == 5.1 else None
        glass(xc - w / 2, xc + w / 2, z0w, z1w, YW - 0.02, kk)
        mullions(xc, w, z0w, z1w, YW - 0.02, nz=3, m=iron)
    # главные двери: бронза, филёнки, обрамление
    zd0 = ZS + 0.05
    box("door_sur", trim, -DW / 2 - 0.45, -DW / 2 - 0.02, YW - 0.2, YW + 0.02, zd0, ZS + DHt + 0.5)
    box("door_sur", trim, DW / 2 + 0.02, DW / 2 + 0.45, YW - 0.2, YW + 0.02, zd0, ZS + DHt + 0.5)
    box("door_head", trim, -DW / 2 - 0.45, DW / 2 + 0.45, YW - 0.2, YW + 0.02, ZS + DHt, ZS + DHt + 0.5)
    box("door_cor", trim, -DW / 2 - 0.8, DW / 2 + 0.8, YW - 0.45, YW + 0.02, ZS + DHt + 0.5, ZS + DHt + 0.75)
    box("door_pedbase", trim, -DW / 2 - 0.7, DW / 2 + 0.7, YW - 0.3, YW + 0.02, ZS + DHt + 0.75, ZS + DHt + 0.85)
    box("door_back", dark, -DW / 2, DW / 2, YW + 0.5, YW + 0.9, zd0, ZS + DHt)
    glass(-DW / 2, DW / 2, ZS + 4.6, ZS + DHt - 0.05, YW + 0.45, 3)
    mullions(0, DW, ZS + 4.6, ZS + DHt - 0.05, YW + 0.45, nz=0, m=bronze)
    for sx in (-1, 1):
        x0, x1 = (0.03, DW / 2) if sx > 0 else (-DW / 2, -0.03)
        box("door_leaf", bronze, x0, x1, YW + 0.3, YW + 0.42, zd0, ZS + 4.55)
        for z0p, z1p in ((0.25, 1.9), (2.1, 4.1)):
            xm = sx * DW / 4
            box("door_panel", bronze, xm - 0.55, xm + 0.55, YW + 0.2, YW + 0.3, ZS + z0p, ZS + z1p)
        cyl("door_pull", brass, 0.04, 0.8, loc=(sx * 0.2, YW + 0.12, ZS + 2.2), segs=8)
    # ступень порога
    box("door_step", dark, -DW / 2 - 0.5, DW / 2 + 0.5, YW - 0.9, YW + 0.3, ZS, ZS + 0.1)

    # ---------- крылья ----------
    BAYS = [16.75, 21.05, 25.35, 29.65]
    PIL = [14.6, 18.9, 23.2, 27.5, 31.8]
    LIT_W = {(-1, 1): 1, (1, 2): 3}
    for sx in (-1, 1):
        def X(a, b):  # (x0, x1) с учётом стороны
            return tuple(sorted((sx * a, sx * b)))

        # стена до пилона и пилон
        wy0, wy1 = YW, YW + 0.9
        # цокольный этаж: руст с окнами
        ops_b = [(sx * bx, 1.4) for bx in BAYS]
        xa, xb = X(14.2, 32.0)
        piers_row(stone, xa, xb, wy0, wy1, ZS, 3.1, [], rust=True)
        piers_row(stone, xa, xb, wy0, wy1, 3.1, 4.3, ops_b, rust=True)
        piers_row(stone, xa, xb, wy0, wy1, 4.3, 5.0, [], rust=True)
        for xc, w in ops_b:
            glass(xc - w / 2, xc + w / 2, 3.1, 4.3, wy0 + 0.3, None)
            mullions(xc, w, 3.1, 4.3, wy0 + 0.3, nz=1, m=iron, d=0.05)
            box("bsill", trim, xc - w / 2 - 0.1, xc + w / 2 + 0.1, wy0 - 0.08, wy0 + 0.02, 3.0, 3.1)
            box("blintel", dark, xc - w / 2 - 0.12, xc + w / 2 + 0.12, wy0 - 0.06, wy0 + 0.02, 4.3, 4.5)
        # пояс
        box("belt", trim, *X(14.2, 38.7), wy0 - 0.2, wy1, 5.0, 5.22)
        box("belt2", trim, *X(14.2, 38.7), wy0 - 0.12, wy1, 5.22, 5.4)
        # верхний этаж: арочные окна
        ops_u = [(sx * bx, 2.4) for bx in BAYS]
        piers_row(stone, xa, xb, wy0, wy1, 5.4, 6.2, [], False)
        piers_row(stone, xa, xb, wy0, wy1, 6.2, 9.2, ops_u)
        piers_row(stone, xa, xb, wy0, wy1, 9.2, 10.4, ops_u)
        arch_spandrels(stone, ops_u, 9.2, wy0, wy1)
        box("lintel_band", stone, xa, xb, wy0, wy1, 10.4, ZE)
        for i, (xc, w) in enumerate(ops_u):
            lk = LIT_W.get((sx, i))
            glass(xc - w / 2, xc + w / 2, 6.2, 10.4, wy0 + 0.35, lk, arch=True)
            mullions(xc, w, 6.2, 10.4, wy0 + 0.35, arch=True, m=frame if lk is not None else iron, nz=2, d=0.05)
            arch_frame(trim, xc, w, 6.2, 9.2, wy0, band=0.22, out=0.1)
            sill(trim, xc, w, 6.2, wy0, out=0.25, ext=0.3)
            for s2 in (-1, 1):
                box("sbr", trim, xc + s2 * (w / 2 + 0.05) - 0.07, xc + s2 * (w / 2 + 0.05) + 0.07, wy0 - 0.15, wy0, 5.78, 6.08)
        # пилястры между окнами
        for px in PIL:
            xx = sx * px
            box("pil_base", trim, xx - 0.5, xx + 0.5, wy0 - 0.28, wy0 + 0.02, 5.4, 5.75)
            box("pil", trim, xx - 0.4, xx + 0.4, wy0 - 0.22, wy0 + 0.02, 5.75, 10.5)
            box("pil_cap", trim, xx - 0.5, xx + 0.5, wy0 - 0.28, wy0 + 0.02, 10.5, 10.9)
        # павильон на торце: выступает на 1 м, свои пилястры и окно
        xp0, xp1 = X(32.0, 38.7)
        py0 = YW - 1.0
        xcp = sx * 35.35
        pw = 0.9
        for z0, z1 in ((ZS, 3.1), (4.3, 5.0)):
            rust_wall(stone, xp0, xp1, py0, py0 + pw, z0, z1, h=0.62)
        for z0, z1, w2 in ((3.1, 4.3, 1.4),):
            rust_wall(stone, xp0, xcp - w2 / 2, py0, py0 + pw, z0, z1, h=0.62)
            rust_wall(stone, xcp + w2 / 2, xp1, py0, py0 + pw, z0, z1, h=0.62)
        glass(xcp - 0.7, xcp + 0.7, 3.1, 4.3, py0 + 0.3, None)
        box("bsill", trim, xcp - 0.8, xcp + 0.8, py0 - 0.08, py0 + 0.02, 3.0, 3.1)
        box("blintel", dark, xcp - 0.82, xcp + 0.82, py0 - 0.06, py0 + 0.02, 4.3, 4.5)
        wp = 2.6
        piers_row(stone, xp0, xp1, py0, py0 + pw, 5.4, 6.2, [], False)
        piers_row(stone, xp0, xp1, py0, py0 + pw, 6.2, 9.2, [(xcp, wp)])
        piers_row(stone, xp0, xp1, py0, py0 + pw, 9.2, 10.4, [(xcp, wp)])
        arch_spandrels(stone, [(xcp, wp)], 9.2, py0, py0 + pw)
        box("lintel_band", stone, xp0, xp1, py0, py0 + pw, 10.4, ZE)
        box("pav_body", stone, xp0, xp1, py0 + pw, YW + 3, ZS, ZE)
        glass(xcp - wp / 2, xcp + wp / 2, 6.2, 10.4, py0 + 0.35, None, arch=True)
        mullions(xcp, wp, 6.2, 10.4, py0 + 0.35, arch=True, m=iron, nz=2, d=0.05)
        arch_frame(trim, xcp, wp, 6.2, 9.2, py0, band=0.25, out=0.12)
        sill(trim, xcp, wp, 6.2, py0, out=0.25, ext=0.3)
        for px in (32.7, 38.0):
            xx = sx * px
            box("pil_base", trim, xx - 0.5, xx + 0.5, py0 - 0.28, py0 + 0.02, 5.4, 5.75)
            box("pil", trim, xx - 0.4, xx + 0.4, py0 - 0.22, py0 + 0.02, 5.75, 10.5)
            box("pil_cap", trim, xx - 0.5, xx + 0.5, py0 - 0.28, py0 + 0.02, 10.5, 10.9)
        box("belt_p", trim, *X(32.0, 38.7), py0 - 0.2, py0 + 0.9, 5.0, 5.4)
        # антаблемент крыла: архитрав, фриз, карниз; на павильоне — вынос
        for (a0, a1, yf2) in ((14.2, 32.0, YW), (32.0, 38.7, py0)):
            xa2, xb2 = X(a0, a1)
            box("archi", trim, xa2, xb2, yf2 - 0.15, yf2 + 0.9, ZE, ZE + 0.8)
            box("frieze", stone, xa2, xb2, yf2 - 0.1, yf2 + 0.9, ZE + 0.8, ZE + 1.6)
            box("cor_a", trim, xa2, xb2, yf2 - 0.35, yf2 + 0.9, ZE + 1.6, ZE + 1.75)
            box("cor_b", trim, xa2, xb2, yf2 - 0.65, yf2 + 0.9, ZE + 1.75, ZE + 2.0)
            box("cor_c", trim, xa2, xb2, yf2 - 0.9, yf2 + 0.9, ZE + 2.0, ZE + 2.2)
        # возврат карниза и боковая грань павильона
        box("pav_side", stone, *X(31.9, 32.1), py0, YW, ZS, ZE)
        box("cor_ret", trim, *X(31.7, 32.0), py0 - 0.9, YW, ZE + 2.0, ZE + 2.2)
        box("cor_end", trim, *X(38.7, 39.6), py0 - 0.9, YW + 14, ZE + 2.0, ZE + 2.2)
        # парапет над карнизом: сплошной с филёнками и вазами над пилястрами
        for (a0, a1, yf2) in ((14.2, 32.0, YW), (32.0, 38.7, py0)):
            xa2, xb2 = X(a0, a1)
            box("attic_wall", stone, xa2, xb2, yf2 - 0.5, yf2 + 0.4, ZCR, ZCR + 0.85)
            box("attic_cap", trim, xa2, xb2, yf2 - 0.65, yf2 + 0.55, ZCR + 0.85, ZCR + 1.0)
        for px in PIL + [32.7, 38.0]:
            xx = sx * px
            yy = YW if px < 32 else py0
            box("pedestal", trim, xx - 0.45, xx + 0.45, yy - 0.6, yy + 0.4, ZCR + 0.85, ZCR + 1.3)
            lathe("urn", trim, [(0.0, 0), (0.2, 0), (0.15, 0.1), (0.34, 0.4), (0.12, 0.72), (0.0, 0.8)], segs=6, loc=(xx, yy - 0.1, ZCR + 1.3))
        # сухарики под карнизом крыла
        den = Acc("dentils_w", trim)
        for i in range(int(17.8 / 0.4)):
            x = 14.4 + i * 0.4
            den.box(sx * x - 0.1, sx * x + 0.1, YW - 0.55, YW - 0.35, ZE + 1.62, ZE + 1.75, bot=False)
        den.done()
        # длинное тело крыла и боковой торец
        box("wing_body", stone, *X(14.2, 38.7), YW + 0.9, 44, 0, ZCR)
        box("wing_roof", slate, *X(14.2, 38.7), YW + 0.9, 44, ZCR + 0.0, ZCR + 0.05)

    # ---------- баннеры выставки между колоннами ----------
    def banner(xc, m, k):
        w, ztop, zbot = 1.7, 10.7, 4.3
        ny, nzz = 8, 14
        bm = bmesh.new()
        lay = bm.loops.layers.uv.verify()
        grid = []
        for j in range(nzz + 1):
            row = []
            tz = j / nzz
            for i in range(ny + 1):
                tx = i / ny
                yy = YC + 0.03 * math.sin(tx * math.pi * 3 + tz * 1.5) * (0.4 + 0.6 * tz)
                # ласточкин хвост внизу
                zb = zbot + (0.0 if abs(tx - 0.5) > 0.5 else 0)
                zz = ztop - (ztop - zbot) * tz
                if tz > 0.93:
                    zz += 0.45 * (1 - abs(tx - 0.5) * 2) * (tz - 0.93) / 0.07 * -1
                row.append(bm.verts.new((xc - w / 2 + w * tx, yy - 0.015, zz)))
            grid.append(row)
        for j in range(nzz):
            for i in range(ny):
                f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
                for lo in f.loops:
                    lo[lay].uv = ((lo.vert.co.x - (xc - w / 2)) / w, (lo.vert.co.z - zbot) / (ztop - zbot))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            if f.normal.y > 0:
                f.normal_flip()
        # обратная сторона
        grid2 = []
        for row in grid:
            grid2.append([bm.verts.new((v.co.x, v.co.y + 0.03, v.co.z)) for v in row])
        for j in range(nzz):
            for i in range(ny):
                f = bm.faces.new((grid2[j][i + 1], grid2[j][i], grid2[j + 1][i], grid2[j + 1][i + 1]))
                for lo in f.loops:
                    lo[lay].uv = ((lo.vert.co.x - (xc - w / 2)) / w, (lo.vert.co.z - zbot) / (ztop - zbot))
        from_bm(bm, "banner", m)
        box("b_rod", brass, xc - w / 2 - 0.08, xc + w / 2 + 0.08, YC - 0.04, YC + 0.06, ztop, ztop + 0.07)
        for sx2 in (-1, 1):
            sphere("b_rodend", brass, 0.06, loc=(xc + sx2 * (w / 2 + 0.1), YC + 0.01, ztop + 0.035), segs=5, rings=3)
        for sx2 in (-1, 1):
            tube("b_cord", brass, [(xc + sx2 * w / 2, YC + 0.01, ztop + 0.04), (xc + sx2 * w / 2 * 0.6, YC + 0.01, ZE - 0.02)], 0.012, segs=4)
        box("b_stripe", brass, xc - w / 2 + 0.1, xc - w / 2 + 0.16, YC - 0.03, YC - 0.0, zbot + 0.6, ztop - 0.15)
        box("b_stripe", brass, xc + w / 2 - 0.16, xc + w / 2 - 0.1, YC - 0.03, YC - 0.0, zbot + 0.6, ztop - 0.15)
        torus("b_emblem", brass, 0.32, 0.03, loc=(xc, YC - 0.05, 8.3), rot=(90, 0, 0), seg=12, rseg=4)
        sphere("b_emblem_c", brass, 0.14, loc=(xc, YC - 0.05, 8.3), scale=(1, 0.3, 1), segs=8, rings=5)
        for sx2 in (-1, 1):
            tube("b_tassel", brass, [(xc + sx2 * 0.45, YC - 0.03, zbot + 0.4), (xc + sx2 * 0.45, YC - 0.03, zbot + 0.05)], [0.03, 0.01], segs=4)

    for i, xc in enumerate((-6.8, -3.4, 3.4, 6.8)):
        banner(xc, banner_r if i in (0, 3) else banner_b, i)

    # ---------- львы на постаментах у лестницы ----------
    def lion(x, y):
        box("ped_base", dark, x - 1.05, x + 1.05, y - 1.4, y + 1.4, 0, 0.3)
        box("ped", stone, x - 0.9, x + 0.9, y - 1.25, y + 1.25, 0.3, 1.3)
        box("ped_cap", trim, x - 1.0, x + 1.0, y - 1.35, y + 1.35, 1.3, 1.45)
        z = 1.45
        # лев лежит, голова к улице (-Y): туловище, холка, лапы вперёд, грива кисточками
        sphere("lion_body", bronze, 0.5, loc=(x, y + 0.5, z + 0.58), scale=(0.85, 1.7, 0.95), segs=10, rings=7)
        sphere("lion_chest", bronze, 0.5, loc=(x, y - 0.3, z + 0.72), scale=(0.9, 1.0, 1.1), segs=10, rings=7)
        for s2 in (-1, 1):
            sphere("lion_haunch", bronze, 0.32, loc=(x + s2 * 0.34, y + 0.9, z + 0.36), scale=(0.65, 1.4, 0.9), segs=8, rings=6)
            tube("lion_leg", bronze, [(x + s2 * 0.24, y - 0.35, z + 0.55), (x + s2 * 0.24, y - 0.75, z + 0.2), (x + s2 * 0.24, y - 1.05, z + 0.1)], [0.14, 0.11, 0.1], segs=6)
            sphere("lion_paw", bronze, 0.13, loc=(x + s2 * 0.24, y - 1.1, z + 0.1), scale=(0.9, 1.3, 0.65), segs=8, rings=5)
        hy, hz = y - 0.75, z + 1.2
        sphere("lion_mane", bronze, 0.5, loc=(x, hy + 0.2, hz - 0.02), scale=(1.0, 0.6, 1.05), segs=10, rings=7)
        for i in range(12):
            a = math.radians(30 * i)
            dx, dz = math.cos(a), math.sin(a)
            tube("lion_tuft", bronze, [(x + dx * 0.2, hy + 0.14, hz + dz * 0.2), (x + dx * 0.5, hy + 0.0, hz + dz * 0.5)], [0.16, 0.06], segs=4)
        sphere("lion_head", bronze, 0.28, loc=(x, hy - 0.02, hz), scale=(0.95, 1.0, 1.0), segs=10, rings=7)
        box("lion_muzzle", bronze, x - 0.1, x + 0.1, hy - 0.4, hy - 0.2, hz - 0.17, hz - 0.01, bev=0.03)
        box("lion_nose", iron, x - 0.06, x + 0.06, hy - 0.43, hy - 0.37, hz - 0.06, hz + 0.01)
        for s2 in (-1, 1):
            sphere("lion_eye", iron, 0.03, loc=(x + s2 * 0.1, hy - 0.26, hz + 0.1), segs=4, rings=3)
            box("lion_brow", bronze, x + s2 * 0.1 - 0.07, x + s2 * 0.1 + 0.07, hy - 0.29, hy - 0.2, hz + 0.12, hz + 0.16)
            sphere("lion_ear", bronze, 0.06, loc=(x + s2 * 0.2, hy + 0.04, hz + 0.27), segs=5, rings=4)
        tube("lion_tail", bronze, [(x + 0.2, y + 1.35, z + 0.15), (x + 0.55, y + 1.45, z + 0.3), (x + 0.5, y + 1.15, z + 0.22)], [0.05, 0.04, 0.03], segs=5)
        sphere("lion_tail_t", bronze, 0.07, loc=(x + 0.5, y + 1.12, z + 0.22), segs=5, rings=4)

    for sx in (-1, 1):
        lion(sx * 9.8, 8.6)

    # ---------- торшеры на площади ----------
    def torchere(x, y):
        box("t_plinth", dark, x - 0.35, x + 0.35, y - 0.35, y + 0.35, 0, 0.3)
        lathe("t_base", bronze, [(0.28, 0), (0.28, 0.08), (0.18, 0.25), (0.2, 0.6), (0.12, 0.8), (0.1, 1.0)], segs=10, loc=(x, y, 0.3))
        cyl("t_shaft", bronze, 0.075, 2.7, loc=(x, y, 2.65), segs=8, r2=0.055)
        lathe("t_ring", bronze, [(0.08, 0), (0.14, 0.05), (0.08, 0.1)], segs=8, loc=(x, y, 3.9))
        for a in (0, 120, 240):
            ar = math.radians(a)
            ex, ey = x + 0.45 * math.cos(ar), y + 0.45 * math.sin(ar)
            tube("t_arm", bronze, [(x, y, 3.95), (x + 0.2 * math.cos(ar), y + 0.2 * math.sin(ar), 4.15), (ex, ey, 4.3)], 0.022, segs=5)
            lathe("t_cup", bronze, [(0.04, 0), (0.1, 0.05), (0.09, 0.08)], segs=6, loc=(ex, ey, 4.3))
            sphere("t_globe", lampg, 0.14, loc=(ex, ey, 4.5), segs=6, rings=4)
        sphere("t_globe", lampg, 0.17, loc=(x, y, 4.62), segs=6, rings=4)
        cyl("t_top", bronze, 0.05, 0.2, loc=(x, y, 4.3), segs=6)

    for tx, ty in ((-4.6, 7.0), (4.6, 7.0), (-17, 6.5), (17, 6.5), (-28, 6.5), (28, 6.5)):
        torchere(tx, ty)

    # ---------- купол за фронтоном ----------
    DY, DR = 33.0, 7.4
    ZD0 = 17.65
    lathe("drum", stone, [(DR, ZD0), (DR, ZD0 + 4.4)], segs=32, loc=(0, DY, 0), sharp=40)
    lathe("drum_base", trim, [(DR + 0.5, ZD0), (DR + 0.5, ZD0 + 0.25), (DR + 0.3, ZD0 + 0.4), (DR, ZD0 + 0.4)], segs=32, loc=(0, DY, 0), sharp=30)
    lathe("drum_cor", trim, [(DR, ZD0 + 4.0), (DR + 0.3, ZD0 + 4.1), (DR + 0.5, ZD0 + 4.35), (DR + 0.75, ZD0 + 4.55), (DR + 0.75, ZD0 + 4.8), (DR, ZD0 + 4.8)], segs=32, loc=(0, DY, 0), sharp=30)
    for i in range(16):
        ang = 2 * math.pi * i / 16 + math.pi / 16
        cx, cy = DR * math.sin(ang), -DR * math.cos(ang)
        o = box("drum_pil", trim, -0.3, 0.3, -0.25, 0.0, ZD0 + 0.4, ZD0 + 4.0)
        o.location = (cx, DY + cy, 0)
        o.rotation_euler = Euler((0, 0, ang))
        o.location.z = 0
        o.location = (cx, DY + cy, 0)
    for i in range(16):
        ang = 2 * math.pi * i / 16
        cx, cy = (DR + 0.02) * math.sin(ang), -(DR + 0.02) * math.cos(ang)
        if cy > 0:
            continue
        w = 0.95
        pts = [(-w / 2, ZD0 + 1.0), (w / 2, ZD0 + 1.0)] + [(w / 2 * math.cos(math.radians(t)), ZD0 + 2.9 + w / 2 * math.sin(math.radians(t))) for t in range(0, 181, 30)]
        bmw = bmesh.new()
        vs = [bmw.verts.new((px * math.cos(ang) , 0, pz)) for px, pz in pts]
        # окно на цилиндре: плоский многоугольник, касательный к барабану
        bmw.free()
        n3 = [(cx + px * math.cos(ang), DY + cy + px * math.sin(ang), pz) for px, pz in pts]
        uvs = [((px + w / 2) / w * 0.25 + (i % 4) * 0.25, (pz - (ZD0 + 1.0)) / 2.4) for px, pz in pts]
        bmw = bmesh.new()
        f = bmw.faces.new([bmw.verts.new(p) for p in n3])
        if f.normal.y > 0:
            f.normal_flip()
        lay = bmw.loops.layers.uv.verify()
        for lo, uv in zip(f.loops, uvs):
            lo[lay].uv = uv
        from_bm(bmw, "drum_glass", lit if i in (4, 12) else dk)
    cp = [(DR - 0.3, ZD0 + 4.8), (DR - 0.5, ZD0 + 5.4), (DR - 1.0, ZD0 + 6.5), (DR - 1.9, ZD0 + 7.6), (DR - 3.4, ZD0 + 8.6), (DR - 5.0, ZD0 + 9.2), (1.6, ZD0 + 9.5), (1.4, ZD0 + 9.6)]
    lathe("dome", copper, cp, segs=32, loc=(0, DY, 0), sharp=40)
    for i in range(16):
        ang = 2 * math.pi * i / 16
        pts = [(DR - 0.25 + 0.03, ZD0 + 4.85), (DR - 0.48, ZD0 + 5.4), (DR - 0.98, ZD0 + 6.5), (DR - 1.88, ZD0 + 7.6), (DR - 3.38, ZD0 + 8.6), (DR - 4.98, ZD0 + 9.2), (1.62, ZD0 + 9.52)]
        tube("dome_rib", trim, [(DY and (r * math.sin(ang)), DY - r * math.cos(ang), z) for r, z in pts], 0.07, segs=4, caps=False)
    lathe("lantern", trim, [(1.5, ZD0 + 9.5), (1.5, ZD0 + 12), (1.8, ZD0 + 12.1), (1.8, ZD0 + 12.4), (0.0, ZD0 + 12.4)], segs=16, loc=(0, DY, 0), sharp=40)
    lathe("lantern_cap", copper, [(1.9, ZD0 + 12.4), (1.2, ZD0 + 13.1), (0.6, ZD0 + 13.9), (0.0, ZD0 + 14.4)], segs=16, loc=(0, DY, 0), sharp=40)
    cyl("spire", brass, 0.04, 1.4, loc=(0, DY, ZD0 + 15.0), segs=6)

    # ---------- вход: пустышка и сборка узла ----------
    dbg()
    root = finalize("museum")
    uv_all(root)
    gd.parent = root
    empty("museum_entry", (0.25, -0.9, 0.0), root)


# ============================================================
#                          БАНК
# ============================================================
# Банк начала XX века у самого тротуара: лицо на y = 1.6, 4 этажа, рустованный низ, пилястры, тяжёлый карниз.
# Справа от него — служебный пристрой с дверью вора, дальше соседние дома попроще.
if want("bank"):
    plaza = mat("plaza", 0xb3ab9c, 0.0, 0.85)
    plaza_j = mat("plaza_joint", 0x6f685c, 0.0, 0.95)
    bronze = mat("bronze", 0x34382c, 0.6, 0.45)
    steel = mat("steel_door", 0x3d4a46, 0.5, 0.5)
    clockface = mat("clock_face", 0xe9e2cf, 0.0, 0.5)
    sign = mat("sign", 0x1f2a22, 0.3, 0.5)  # вывеска: игра нарисует надпись, UV 0..1

    YF = 1.6  # лицо банка
    TH = 1.0  # толщина лицевой стены с проёмами
    ZG = 0.9  # верх цоколя
    ZR = 6.3  # верх рустованного этажа
    BAYX = [(i - 3) * 4.2 for i in range(7)]
    PX = [-14.7, -10.5, -6.3, -2.1, 2.1, 6.3, 10.5, 14.7]

    # ---------- служебная дверь вора (в пристрое справа) ----------
    LY = 1.9  # лицо пристроя
    DHX, DWD, DHT = 16.8, 1.3, 2.3
    box("sd_leaf", steel, DHX, DHX + DWD, LY + 0.2, LY + 0.27, 0.12, DHT)
    for z0, z1 in ((0.3, 1.1), (1.25, 2.1)):
        box("sd_panel", steel, DHX + 0.12, DHX + DWD - 0.12, LY + 0.15, LY + 0.2, z0, z1)
    box("sd_louver", iron, DHX + 0.15, DHX + DWD - 0.15, LY + 0.14, LY + 0.2, 0.18, 0.3)
    box("sd_push", iron, DHX + DWD - 0.3, DHX + DWD - 0.12, LY + 0.1, LY + 0.2, 1.0, 1.06)
    box("sd_lock", brass, DHX + DWD - 0.2, DHX + DWD - 0.1, LY + 0.14, LY + 0.2, 1.1, 1.22)
    for z in (0.4, 1.9):
        cyl("sd_hinge", iron, 0.03, 0.12, loc=(DHX, LY + 0.24, z), segs=6)
    bd = finalize("bank_door")
    set_root_pivot(bd, (DHX, LY + 0.24, 0))

    # ---------- земля ----------
    box("plaza", plaza, -40.5, 40.5, 0.0, 3.0, 0.0, 0.04)
    for x in range(-39, 40, 3):
        quad("joint", plaza_j, [(x - 0.012, 0.0, 0.042), (x + 0.012, 0.0, 0.042), (x + 0.012, 1.6, 0.042), (x - 0.012, 1.6, 0.042)], [(0, 0)] * 4)

    # ---------- основной объём ----------
    BX = 15.2
    box("bank_body", stone, -BX, BX, YF + TH, 30, 0, 19.1)
    box("bank_roof", slate, -BX, BX, YF + TH, 30, 19.1, 19.15)

    # цоколь: гранит, на высоту 0.9, с выносом
    box("plinth", dark, -BX - 0.12, BX + 0.12, YF - 0.12, YF + TH, 0, ZG - 0.08)
    box("plinth_cap", trim, -BX - 0.16, BX + 0.16, YF - 0.16, YF + TH, ZG - 0.08, ZG)

    # рустованный этаж с арочными окнами: сталь решёток, архивольты, замки
    ops_g = [(x, 2.4) for x in BAYX if abs(x) > 0.1]
    z_sill, z_spring = 1.5, 3.9
    piers_row(dark, -BX, BX, YF, YF + TH, ZG, z_sill, [(0, 2.7)], rust=True)
    piers_row(dark, -BX, BX, YF, YF + TH, z_sill, z_spring, ops_g + [(0, 2.7)], rust=True)
    piers_row(dark, -BX, BX, YF, YF + TH, z_spring, 4.8, ops_g + [(0, 2.7)], rust=True)
    piers_row(dark, -BX, BX, YF, YF + TH, 4.8, 5.1, ops_g, rust=True)
    arch_spandrels(dark, ops_g, z_spring, YF, YF + TH)
    piers_row(dark, -BX, BX, YF, YF + TH, 5.1, ZR, [], rust=True)
    grille = Acc("grilles", iron)
    for i, (xc, w) in enumerate(ops_g):
        lk = 1 if i in (1, 4) else None
        r = w / 2
        glass(xc - r, xc + r, z_sill, z_spring + r, YF + 0.45, lk, arch=True)
        mullions(xc, w, z_sill, z_spring + r, YF + 0.45, arch=True, m=iron, nz=2, d=0.05)
        arch_frame(dark, xc, w, z_sill, z_spring, YF, band=0.3, out=0.12)
        box("bsill", trim, xc - r - 0.3, xc + r + 0.3, YF - 0.25, YF + 0.02, z_sill - 0.14, z_sill)
        # кованая решётка перед стеклом: прутья с пиками и две перекладины
        nbar = int(w / 0.17)
        for j in range(nbar):
            bx = xc - r + (j + 0.5) * w / nbar
            top = z_spring + math.sqrt(max(r * r - (bx - xc) ** 2, 0)) - 0.1
            grille.bar(bx, YF - 0.1, z_sill + 0.02, top, 0.012, spike=0.06)
        box("grail", iron, xc - r, xc + r, YF - 0.115, YF - 0.085, 2.35, 2.4)
        box("grail", iron, xc - r, xc + r, YF - 0.115, YF - 0.085, z_spring - 0.04, z_spring + 0.01)
        for s2 in (-1, 1):
            box("gframe", iron, xc + s2 * r - 0.02, xc + s2 * r + 0.02, YF - 0.12, YF - 0.08, z_sill, z_spring)
    grille.done()

    # пояс над рустом
    box("belt1", trim, -BX - 0.1, BX + 0.1, YF - 0.2, YF + TH, ZR, ZR + 0.3)
    box("belt2", trim, -BX - 0.2, BX + 0.2, YF - 0.34, YF + TH, ZR + 0.3, ZR + 0.5)
    box("belt3", trim, -BX - 0.1, BX + 0.1, YF - 0.2, YF + TH, ZR + 0.5, ZR + 0.6)

    # ---------- портал и козырёк ----------
    DWc = 2.7
    zdoor = 3.7
    zt0 = ZG
    # крыльцо: 4 ступени гранита, щёки
    for k in range(1, 5):
        yy = YF - (5 - k) * 0.4
        box("step", dark, -2.6, 2.6, yy, YF + 0.02, 0, k * ZG / 4)
        box("nosing", trim, -2.6, 2.6, yy - 0.02, yy + 0.04, k * ZG / 4 - 0.03, k * ZG / 4)
    for s2 in (-1, 1):
        xx = s2 * 2.8
        box("cheek", dark, xx - 0.2, xx + 0.2, YF - 1.6, YF + 0.02, 0, 1.0)
        box("cheek_cap", trim, xx - 0.26, xx + 0.26, YF - 1.64, YF + 0.02, 1.0, 1.1)
        # фонарь на тумбе
        lathe("lamp_base", iron, [(0.14, 0), (0.1, 0.1), (0.06, 0.25)], segs=8, loc=(xx, YF - 1.1, 1.1))
        cyl("lamp_post", iron, 0.04, 1.2, loc=(xx, YF - 1.1, 1.95), segs=6)
        lathe("lamp_glass_b", lampg, [(0.0, 0), (0.15, 0.0), (0.2, 0.45), (0.0, 0.45)], segs=6, loc=(xx, YF - 1.1, 2.55), sharp=10)
        lathe("lamp_roof", iron, [(0.26, 0), (0.18, 0.08), (0.04, 0.22), (0.0, 0.28)], segs=6, loc=(xx, YF - 1.1, 3.0))
    # колонны-пилястры по сторонам двери
    for s2 in (-1, 1):
        xx = s2 * 1.95
        box("p_base", dark, xx - 0.35, xx + 0.35, YF - 0.35, YF + 0.02, ZG, ZG + 0.35)
        cyl("p_col", trim, 0.26, 3.7, loc=(xx, YF - 0.2, ZG + 0.35 + 1.85), segs=14)
        box("p_cap", trim, xx - 0.36, xx + 0.36, YF - 0.56, YF + 0.02, 4.9, 5.1)
        box("p_cap2", trim, xx - 0.3, xx + 0.3, YF - 0.5, YF + 0.02, 4.7, 4.9)
        cyl("p_ring", trim, 0.32, 0.12, loc=(xx, YF - 0.2, ZG + 0.35 + 3.7), segs=14)
    # проём двери: рамка, створки бронза, фрамуга горит
    box("dr_lintel", trim, -DWc / 2 - 0.1, DWc / 2 + 0.1, YF - 0.12, YF + 0.02, zt0 + zdoor, zt0 + zdoor + 0.25)
    box("dr_jamb", dark, -DWc / 2 - 0.15, -DWc / 2, YF - 0.05, YF + TH, zt0, zt0 + zdoor + 0.25)
    box("dr_jamb", dark, DWc / 2, DWc / 2 + 0.15, YF - 0.05, YF + TH, zt0, zt0 + zdoor + 0.25)
    box("dr_inner", dark, -DWc / 2, DWc / 2, YF + 0.6, YF + TH, zt0, 4.8)
    glass(-DWc / 2, DWc / 2, zt0 + zdoor - 0.7, 4.75, YF + 0.55, 0)
    mullions(0, DWc, zt0 + zdoor - 0.7, 4.75, YF + 0.55, nz=0, m=bronze)
    for s2 in (-1, 1):
        x0, x1 = (0.03, DWc / 2) if s2 > 0 else (-DWc / 2, -0.03)
        box("dr_leaf", bronze, x0, x1, YF + 0.35, YF + 0.5, zt0, zt0 + zdoor - 0.75)
        xm = s2 * DWc / 4
        for z0, z1 in ((0.2, 1.2), (1.4, 2.8)):
            box("dr_panel", bronze, xm - 0.45, xm + 0.45, YF + 0.28, YF + 0.35, zt0 + z0, zt0 + z1)
        cyl("dr_pull", brass, 0.035, 0.9, loc=(s2 * 0.18, YF + 0.22, zt0 + 1.5), segs=6)
    # козырёк: плита на двух цепях, лицевая кромка
    zk = 4.95
    box("canopy", iron, -2.5, 2.5, YF - 1.4, YF + 0.02, zk, zk + 0.12)
    box("canopy_edge", bronze, -2.55, 2.55, YF - 1.46, YF - 1.34, zk - 0.1, zk + 0.2)
    box("canopy_top", trim, -2.4, 2.4, YF - 1.3, YF + 0.02, zk + 0.12, zk + 0.18)
    for s2 in (-1, 1):
        tube("canopy_chain", iron, [(s2 * 2.3, YF - 1.38, zk + 0.18), (s2 * 2.3, YF - 0.05, zk + 1.4)], 0.02, segs=4)
    # табличка-панель под вывеску над козырьком
    box("sign_frame", brass, -1.95, 1.95, YF - 0.12, YF + 0.02, 5.2, 5.28)
    box("sign_frame", brass, -1.95, 1.95, YF - 0.12, YF + 0.02, 6.1, 6.18)
    box("sign_frame", brass, -1.95, -1.87, YF - 0.12, YF + 0.02, 5.2, 6.18)
    box("sign_frame", brass, 1.87, 1.95, YF - 0.12, YF + 0.02, 5.2, 6.18)
    quad("sign", sign, [(-1.87, YF - 0.1, 5.28), (1.87, YF - 0.1, 5.28), (1.87, YF - 0.1, 6.1), (-1.87, YF - 0.1, 6.1)], [(0, 0), (1, 0), (1, 1), (0, 1)])

    # ---------- этажи 2–3: пилястры, окна, наличники ----------
    ZB2, ZB3 = 6.9, 13.5
    ZEN = 14.2
    ops2 = [(x, 1.6) for x in BAYX if abs(x) > 0.1]
    ops3 = [(x, 1.6) for x in BAYX]
    rows = [(ZB2, 7.6, []), (7.6, 10.3, ops2), (10.3, 10.9, []), (10.9, 12.9, ops3), (12.9, ZEN, [])]
    for z0, z1, o in rows:
        piers_row(stone, -BX, BX, YF, YF + TH, z0, z1, o)
    wins = Acc("bal_bars", iron)
    for fl, (z0, z1, o) in enumerate(((7.6, 10.3, ops2), (10.9, 12.9, ops3))):
        for i, (xc, w) in enumerate(o):
            lk = cell(100 * fl + i, 0.22)
            glass(xc - w / 2, xc + w / 2, z0, z1, YF + 0.4, lk)
            mullions(xc, w, z0, z1, YF + 0.4, nz=2 if fl == 0 else 1, m=frame if lk is not None else iron, d=0.05)
            rect_frame(trim, xc, w, z0, z1, YF, band=0.2, out=0.1)
            sill(trim, xc, w, z0, YF, out=0.28, ext=0.25)
            for s2 in (-1, 1):
                box("sbr", trim, xc + s2 * (w / 2 + 0.05) - 0.07, xc + s2 * (w / 2 + 0.05) + 0.07, YF - 0.2, YF, z0 - 0.4, z0 - 0.12)
            zt = z1 + 0.2
            if (i + fl) % 2 == 0:  # треугольный фронтон
                hw = w / 2 + 0.55
                box("whead", trim, xc - hw, xc + hw, YF - 0.25, YF + 0.02, zt, zt + 0.12)
                prism("wped", trim, [(xc - hw, zt + 0.12), (xc + hw, zt + 0.12), (xc, zt + 0.12 + 0.5)], YF - 0.2, YF + 0.02)
            else:  # прямой сандрик на кронштейнах
                box("whead", trim, xc - w / 2 - 0.45, xc + w / 2 + 0.45, YF - 0.3, YF + 0.02, zt, zt + 0.16)
            if fl == 0 and abs(xc) > 0.1:  # балкончик-решётка
                wins.box(xc - w / 2 - 0.2, xc + w / 2 + 0.2, YF - 0.42, YF - 0.34, z0 - 0.02, z0 + 0.03)
                for j in range(12):
                    wins.bar(xc - w / 2 - 0.18 + j * (w + 0.36) / 11, YF - 0.38, z0 + 0.03, z0 + 0.7, 0.01, spike=0.04)
                wins.box(xc - w / 2 - 0.22, xc + w / 2 + 0.22, YF - 0.44, YF - 0.32, z0 + 0.7, z0 + 0.74)
    wins.done()
    # центр второго этажа: часы в каменном круге
    cx0, cz0 = 0.0, 9.0
    torus("clock_ring", trim, 1.05, 0.14, loc=(cx0, YF - 0.15, cz0), rot=(90, 0, 0), seg=24, rseg=6)
    cyl("clock_bezel", brass, 0.96, 0.06, loc=(cx0, YF - 0.25, cz0), rot=(90, 0, 0), segs=24)
    cyl("clock_face", clockface, 0.9, 0.04, loc=(cx0, YF - 0.3, cz0), rot=(90, 0, 0), segs=24)
    for h in range(12):
        a = math.radians(30 * h)
        big = h % 3 == 0
        ox, oz = math.sin(a) * 0.78, math.cos(a) * 0.78
        o = box("tick", iron, -0.025 if not big else -0.04, 0.025 if not big else 0.04, YF - 0.335, YF - 0.315, -0.09 if big else -0.06, 0.09 if big else 0.06)
        o.location = (cx0 + ox, o.location.y, cz0 + oz)
        o.rotation_euler = Euler((0, -a, 0))
    ha = math.radians(-60)  # часовая стрелка (~10 ч)
    ma = math.radians(60)  # минутная (~10 мин)
    for ang, L, wd in ((ha, 0.45, 0.045), (ma, 0.7, 0.03)):
        o = box("hand", iron, -wd / 2, wd / 2, YF - 0.345, YF - 0.32, 0, L)
        o.location = (cx0, o.location.y, cz0)
        o.rotation_euler = Euler((0, -ang, 0))
    cyl("clock_hub", brass, 0.06, 0.05, loc=(cx0, YF - 0.35, cz0), rot=(90, 0, 0), segs=8)
    for s2 in (-1, 1):  # лавровые гирлянды по бокам
        for k in range(4):
            sphere("laurel", trim, 0.1, loc=(s2 * (1.3 + k * 0.17), YF - 0.1, cz0 - 0.3 + k * 0.28), scale=(1, 0.5, 1.2), segs=5, rings=4)

    # пилястры колоссального ордера
    for px in PX:
        w = 1.3 if abs(px) > 14 else 0.9
        xx = px - (0.2 if px > 14 else 0.0) + (0.2 if px < -14 else 0.0)
        box("pil_base", trim, xx - w / 2 - 0.07, xx + w / 2 + 0.07, YF - 0.37, YF + 0.02, ZB2, ZB2 + 0.5)
        box("pil", trim, xx - w / 2, xx + w / 2, YF - 0.3, YF + 0.02, ZB2 + 0.5, ZB3 - 0.5)
        for fx in (-w / 2 + 0.12, w / 2 - 0.12):  # каннелюры-пазы
            box("flute", dark, xx + fx - 0.025, xx + fx + 0.025, YF - 0.305, YF - 0.28, ZB2 + 0.7, ZB3 - 0.7)
        box("pil_cap", trim, xx - w / 2 - 0.12, xx + w / 2 + 0.12, YF - 0.42, YF + 0.02, ZB3 - 0.5, ZB3 - 0.18)
        box("pil_cap2", trim, xx - w / 2 - 0.17, xx + w / 2 + 0.17, YF - 0.47, YF + 0.02, ZB3 - 0.18, ZB3)
        for s2 in (-1, 1):
            sphere("pil_vol", trim, 0.1, loc=(xx + s2 * (w / 2 + 0.02), YF - 0.4, ZB3 - 0.3), segs=5, rings=3)

    # антаблемент над пилястрами
    box("ent_a", trim, -BX - 0.2, BX + 0.2, YF - 0.4, YF + TH, ZB3, ZB3 + 0.4)
    box("ent_f", dark, -BX - 0.2, BX + 0.2, YF - 0.36, YF + TH, ZB3 + 0.4, ZB3 + 0.62)
    box("ent_c", trim, -BX - 0.3, BX + 0.3, YF - 0.55, YF + TH, ZB3 + 0.62, ZEN)

    # сухарики под карнизом основной части
    dent = Acc("bank_dentils", trim)
    for i in range(int(2 * BX / 0.34)):
        x = -BX + 0.2 + i * 0.34
        dent.box(x - 0.09, x + 0.09, YF - 0.72, YF - 0.55, ZB3 + 0.66, ZEN - 0.06, bot=False)
    dent.done()
    # розетки на фризе над окнами
    for x in BAYX:
        sphere("rosette", trim, 0.11, loc=(x, YF - 0.4, ZB3 + 0.51), scale=(1, 0.4, 1), segs=6, rings=4)

    # ---------- четвёртый этаж (аттик) ----------
    ops4 = [(x, 1.2) for x in BAYX]
    piers_row(stone, -BX, BX, YF, YF + TH, ZEN, 14.7, [], False)
    piers_row(stone, -BX, BX, YF, YF + TH, 14.7, 16.1, ops4, False)
    piers_row(stone, -BX, BX, YF, YF + TH, 16.1, 16.6, [], False)
    for i, (xc, w) in enumerate(ops4):
        lk = cell(300 + i, 0.25)
        glass(xc - w / 2, xc + w / 2, 14.7, 16.1, YF + 0.4, lk)
        mullions(xc, w, 14.7, 16.1, YF + 0.4, nz=1, m=frame if lk is not None else iron, d=0.05)
        rect_frame(trim, xc, w, 14.7, 16.1, YF, band=0.14, out=0.08)
        sill(trim, xc, w, 14.7, YF, out=0.2, ext=0.15, h=0.1)
    # тяжёлый карниз: фриз, модильоны, вынос, парапет
    box("cor_f", trim, -BX - 0.1, BX + 0.1, YF - 0.2, YF + TH, 16.6, 17.0)
    box("cor_a", trim, -BX - 0.4, BX + 0.4, YF - 0.7, YF + TH, 17.0, 17.25)
    mod = Acc("modillions", trim)
    for i in range(int(2 * BX / 0.7)):
        x = -BX + 0.35 + i * 0.7
        mod.box(x - 0.14, x + 0.14, YF - 0.65, YF - 0.2, 16.78, 17.0, bot=False)
    mod.done()
    box("cor_b", trim, -BX - 0.8, BX + 0.8, YF - 1.1, YF + TH, 17.25, 17.55)
    box("cor_c", trim, -BX - 0.95, BX + 0.95, YF - 1.25, YF + TH, 17.55, 17.8)
    box("cor_d", dark, -BX - 0.7, BX + 0.7, YF - 1.05, YF + TH, 17.8, 18.05)
    # парапет с плитами и пьедесталами
    box("par", stone, -BX, BX, YF - 0.2, YF + 0.5, 18.05, 18.85)
    box("par_cap", trim, -BX - 0.1, BX + 0.1, YF - 0.3, YF + 0.6, 18.85, 19.0)
    for px in PX:
        box("par_ped", trim, px - 0.4, px + 0.4, YF - 0.35, YF + 0.65, 18.05, 19.4)
        box("par_pedcap", trim, px - 0.5, px + 0.5, YF - 0.45, YF + 0.75, 19.4, 19.55)
    for x in BAYX:
        box("par_panel", dark, x - 1.2, x + 1.2, YF - 0.24, YF - 0.2, 18.25, 18.7)

    # ---------- водосточные трубы по углам ----------
    for s2 in (-1, 1):
        xx = s2 * (BX + 0.12)
        cyl("pipe", iron, 0.07, 17.0, loc=(xx, YF + 0.2, 9.0), segs=6)
        for z in (3.0, 7.0, 11.0, 15.0):
            box("pipe_clip", iron, xx - 0.1, xx + 0.1, YF + 0.1, YF + 0.3, z, z + 0.06)

    # ---------- служебный пристрой справа (дверь вора) ----------
    LX0, LX1 = BX, 19.7
    LH = 7.6
    # за дверью — тёмный коридор 5 м (пустой проход для вора): стены по бокам, потолок, глухая стена в конце
    dxc = DHX + DWD / 2
    cL, cR = dxc - 0.85, dxc + 0.85
    box("link_body", brick, LX0, cL, LY + 0.5, 30, 0, LH)
    box("link_body", brick, cR, LX1, LY + 0.5, 30, 0, LH)
    box("link_body", brick, cL, cR, LY + 0.5, 30, 2.6, LH)
    box("link_body", brick, cL, cR, LY + 5.0, 30, 0, 2.6)
    box("link_floor", dark, cL, cR, LY + 0.3, LY + 5.0, 0, 0.04)
    lops = [(DHX + DWD / 2, DWD)]
    piers_row(brick, LX0, LX1, LY, LY + 0.5, 0, 2.3, lops)
    piers_row(brick, LX0, LX1, LY, LY + 0.5, 2.3, 4.6, [])
    piers_row(brick, LX0, LX1, LY, LY + 0.5, 4.6, 6.2, [(16.2, 1.2), (18.7, 1.2)])
    piers_row(brick, LX0, LX1, LY, LY + 0.5, 6.2, LH, [])
    box("link_plinth", dark, LX0, LX1, LY - 0.08, LY + 0.1, 0, 0.5)
    # рамка двери, козырёк и номер
    zd = 2.3
    box("sd_jamb", dark, DHX - 0.18, DHX, LY - 0.06, LY + 0.3, 0, zd + 0.2)
    box("sd_jamb", dark, DHX + DWD, DHX + DWD + 0.18, LY - 0.06, LY + 0.3, 0, zd + 0.2)
    box("sd_head", dark, DHX - 0.18, DHX + DWD + 0.18, LY - 0.06, LY + 0.3, zd, zd + 0.2)
    box("sd_inner", dark, DHX, DHX + DWD, LY + 0.3, LY + 1.0, 0, zd)
    box("sd_step", dark, DHX - 0.3, DHX + DWD + 0.3, LY - 0.55, LY + 0.0, 0, 0.14)
    box("sd_hood", iron, DHX - 0.35, DHX + DWD + 0.35, LY - 0.55, LY + 0.02, zd + 0.35, zd + 0.4)
    prism_yz("sd_hood_side", iron, [(LY - 0.55, zd + 0.35), (LY + 0.02, zd + 0.35), (LY + 0.02, zd + 0.1)], DHX - 0.35, DHX - 0.33)
    prism_yz("sd_hood_side", iron, [(LY - 0.55, zd + 0.35), (LY + 0.02, zd + 0.35), (LY + 0.02, zd + 0.1)], DHX + DWD + 0.33, DHX + DWD + 0.35)
    box("sd_plate", brass, DHX + DWD + 0.35, DHX + DWD + 0.7, LY - 0.02, LY + 0.0, 1.5, 1.8)
    box("sd_alarm", iron, DHX - 0.8, DHX - 0.35, LY - 0.14, LY, 2.1, 2.45)
    sphere("sd_alarm_l", mat("lamp_red", 0xff3020, 0.0, 0.3, emit=0xff2010, emit_k=3.0), 0.07, loc=(DHX - 0.575, LY - 0.18, 2.28), segs=6, rings=4)
    box("sd_lamp_arm", iron, DHX + DWD / 2 - 0.03, DHX + DWD / 2 + 0.03, LY - 0.55, LY, zd + 0.8, zd + 0.85)
    lathe("sd_lamp", lampg, [(0.0, 0), (0.1, 0.0), (0.12, 0.2), (0.0, 0.22)], segs=6, loc=(DHX + DWD / 2, LY - 0.55, zd + 0.62), sharp=10)
    # окна пристроя на втором этаже с решётками, пояс и карниз
    for xc in (16.2, 18.7):
        glass(xc - 0.6, xc + 0.6, 4.6, 6.2, LY + 0.3, None)
        mullions(xc, 1.2, 4.6, 6.2, LY + 0.3, nz=2, m=iron, d=0.05)
        box("lsill", dark, xc - 0.75, xc + 0.75, LY - 0.14, LY + 0.0, 4.5, 4.6)
        box("llintel", dark, xc - 0.75, xc + 0.75, LY - 0.1, LY + 0.0, 6.2, 6.4)
        for k in range(5):
            box("lbar", iron, xc - 0.5 + k * 0.25 - 0.012, xc - 0.5 + k * 0.25 + 0.012, LY - 0.06, LY - 0.03, 4.6, 6.2)
    box("link_cor", dark, LX0, LX1, LY - 0.45, LY + 0.2, LH - 0.5, LH)
    box("link_cap", dark, LX0, LX1, LY - 0.55, LY + 0.3, LH, LH + 0.12)

    # ---------- соседние дома ----------
    def neighbor(xa, xb, yf, floors, m, trim_m, seed, lit_p=0.25, shop=True, tall0=4.2):
        """Дом попроще: цоколь/витрина, этажи окон, карниз."""
        h0 = tall0
        fh = 3.2
        top = h0 + floors * fh
        box("nb_body", m, xa, xb, yf + 0.4, 30, 0, top)
        box("nb_plinth", dark, xa, xb, yf - 0.1, yf + 0.1, 0, 0.6)
        n = max(2, int((xb - xa) / 3.2))
        step = (xb - xa) / n
        cx = [xa + (i + 0.5) * step for i in range(n)]
        # первый этаж: рольставни/витрины и дверь
        for i, xc in enumerate(cx):
            if shop:
                box("nb_shut", iron, xc - 1.2, xc + 1.2, yf - 0.06, yf + 0.02, 0.6, 3.1)
                for z in [0.6 + 0.24 * k for k in range(1, 10)]:
                    if z < 3.1:
                        quad("nb_slat", mat("shutter_line", 0x0b0c0e, 0, 0.9), [(xc - 1.2, yf - 0.062, z), (xc + 1.2, yf - 0.062, z), (xc + 1.2, yf - 0.062, z + 0.03), (xc - 1.2, yf - 0.062, z + 0.03)], [(0, 0)] * 4)
                box("nb_box", dark, xc - 1.35, xc + 1.35, yf - 0.3, yf + 0.02, 3.1, 3.55)
        box("nb_fascia", trim_m, xa, xb, yf - 0.28, yf + 0.04, 3.9, 4.2)
        box("nb_wall0", m, xa, xb, yf, yf + 0.4, 0, h0)
        for fl in range(floors):
            zb = h0 + fl * fh
            wo = [(xc, 1.3) for xc in cx]
            piers_row(m, xa, xb, yf, yf + 0.4, zb, zb + 0.65, [])
            piers_row(m, xa, xb, yf, yf + 0.4, zb + 0.65, zb + 2.55, wo)
            piers_row(m, xa, xb, yf, yf + 0.4, zb + 2.55, zb + fh, [])
            box("nb_belt", trim_m, xa, xb, yf - 0.12, yf + 0.04, zb - 0.05, zb + 0.1)
            for i, xc in enumerate(cx):
                w = 1.3
                z0, z1 = zb + 0.65, zb + 2.55
                lk = cell(seed * 100 + fl * 10 + i, lit_p)
                glass(xc - w / 2, xc + w / 2, z0, z1, yf + 0.2, lk)
                mullions(xc, w, z0, z1, yf + 0.2, nz=1, m=frame if lk is not None else iron, d=0.04)
                box("nb_hd", trim_m, xc - w / 2 - 0.18, xc + w / 2 + 0.18, yf - 0.1, yf + 0.04, z1, z1 + 0.18)
                box("nb_sl", trim_m, xc - w / 2 - 0.12, xc + w / 2 + 0.12, yf - 0.16, yf + 0.04, z0 - 0.1, z0)
                box("nb_jl", trim_m, xc - w / 2 - 0.1, xc - w / 2, yf - 0.05, yf + 0.04, z0, z1)
                box("nb_jr", trim_m, xc + w / 2, xc + w / 2 + 0.1, yf - 0.05, yf + 0.04, z0, z1)
        box("nb_cor1", trim_m, xa - 0.1, xb + 0.1, yf - 0.35, yf + 0.3, top - 0.6, top - 0.35)
        box("nb_cor2", trim_m, xa - 0.2, xb + 0.2, yf - 0.6, yf + 0.3, top - 0.35, top)
        box("nb_par", m, xa, xb, yf - 0.1, yf + 0.3, top, top + 0.7)
        box("nb_parcap", trim_m, xa - 0.05, xb + 0.05, yf - 0.15, yf + 0.35, top + 0.7, top + 0.82)

    neighbor(-40.5, -BX - 0.1, 0.5, 4, stone, trim, 1)
    neighbor(LX1 + 0.1, 40.5, 0.9, 5, brick, trim, 2, shop=False)
    # правое здание: вход в подъезд вместо витрин — дверь и козырёк
    box("nb_door", iron, 24.6, 26.4, 0.88, 0.96, 0.6, 2.8)
    box("nb_dhood", dark, 24.2, 26.8, 0.2, 0.96, 2.9, 3.05)
    # левое: вывеска-табличка магазина не нужна, добавим рекламный козырёк
    dbg()
    root = finalize("bank")
    uv_all(root)
    bd.parent = root
    empty("bank_entry", (DHX + DWD / 2, LY - 0.9, 0.0), root)


# ============================================================
#                      ОФИС-НЕБОСКРЁБ
# ============================================================
# Стеклянная башня 70 м с отступом 8 м (лицо на y = 8), площадь с гранитом, двусветный вестибюль, козырёк,
# вращающаяся дверь, флагштоки и клумбы. По бокам — башни пониже. Дверь вора — в гранитном цоколе справа.
if want("office"):
    plaza = mat("plaza", 0xb3ab9c, 0.0, 0.85)
    plaza_j = mat("plaza_joint", 0x6f685c, 0.0, 0.95)
    curtain = mat("curtain", 0x1c2b3d, 0.3, 0.12)  # навесная стена: сетку стёкол игра нарисует по UV (метры)
    alum = mat("alum", 0x9aa1aa, 0.85, 0.35)  # импосты, рёбра, рамы
    granite = mat("granite_dark", 0x34373c, 0.1, 0.3)  # облицовка цоколя
    lobby_glow = mat("lobby_glow", 0xffd9a0, 0.0, 0.4, emit=0xffc27a, emit_k=3.0)  # тёплый свет вестибюля
    glass_l = mat("glass_lobby", 0x203040, 0.2, 0.05)  # прозрачное стекло вестибюля (подменяет игра)
    lobby_floor = mat("lobby_floor", 0x4a443c, 0.1, 0.25)
    soil = mat("soil", 0x2b2118, 0.0, 0.95)
    leaves = mat("leaves", 0x1c2a1a, 0.0, 0.95)
    leaves2 = mat("leaves2", 0x24331c, 0.0, 0.95)
    flag_a = mat("flag_blue", 0x16305e, 0.0, 0.9)
    flag_b = mat("flag_white", 0xd8d6cf, 0.0, 0.9)
    flag_c = mat("flag_red", 0x8a1c22, 0.0, 0.9)
    lamp_red = mat("lamp_red", 0xff3020, 0.0, 0.3, emit=0xff2010, emit_k=3.0)
    OWN_UV.update({"flag_blue", "flag_white", "flag_red"})

    YT = 8.0  # лицо башни
    ZL = 9.0  # низ навесной стены (верх вестибюльного блока)

    def curt(name, x0, x1, z0, z1, y, u0=0.0):
        """Плоскость навесной стены на лице y (смотрит на -Y): u — метры вдоль ширины, v — метры высоты."""
        quad(name, curtain, [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], [(u0, z0), (u0 + x1 - x0, z0), (u0 + x1 - x0, z1), (u0, z1)])

    def curt_side(name, x, y0, y1, z0, z1, right):
        """Боковая грань (нормаль ±X); u — метры от переднего края."""
        pts = [(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)]
        uvs = [(0, z0), (y1 - y0, z0), (y1 - y0, z1), (0, z1)]
        if not right:
            pts = [pts[1], pts[0], pts[3], pts[2]]
            uvs = [(y1 - y0, z0), (0, z0), (0, z1), (y1 - y0, z1)]
        quad(name, curtain, pts, uvs)

    # ---------- служебная дверь вора: справа в цоколе ----------
    DX0, DWO, DHO = 12.85, 1.3, 2.3
    OY = YT + 0.45  # лицо створки в нише
    box("od_leaf", mat("steel_door", 0x4a5258, 0.6, 0.4), DX0, DX0 + DWO, OY, OY + 0.07, 0.1, DHO)
    for z0, z1 in ((0.25, 1.05), (1.2, 2.1)):
        box("od_panel", mat("steel_door", 0, 0, 0), DX0 + 0.1, DX0 + DWO - 0.1, OY - 0.04, OY, z0, z1)
    for k in range(6):
        box("od_louver", iron, DX0 + 0.15, DX0 + DWO - 0.15, OY - 0.03, OY, 1.6 + k * 0.06, 1.62 + k * 0.06)
    box("od_bar", alum, DX0 + 0.15, DX0 + 0.25, OY - 0.12, OY - 0.04, 0.9, 1.2)
    cyl("od_bar", alum, 0.02, 0.45, loc=(DX0 + 0.2, OY - 0.12, 1.05), rot=(0, 0, 0), segs=6)
    for z in (0.4, 1.9):
        cyl("od_hinge", iron, 0.03, 0.12, loc=(DX0, OY + 0.03, z), segs=6)
    od = finalize("office_door")
    set_root_pivot(od, (DX0, OY + 0.03, 0))

    # ---------- площадь ----------
    box("plaza", plaza, -52, 52, 0.0, YT, 0.0, 0.04)
    ZJ = 0.042
    for k in range(-34, 35):
        x = k * 1.5
        quad("joint", plaza_j, [(x - 0.01, 0.0, ZJ), (x + 0.01, 0.0, ZJ), (x + 0.01, YT, ZJ), (x - 0.01, YT, ZJ)], [(0, 0)] * 4) if abs(x) < 51 else None
    for k in range(1, 6):
        y = k * 1.5
        quad("joint", plaza_j, [(-52, y - 0.01, ZJ), (52, y - 0.01, ZJ), (52, y + 0.01, ZJ), (-52, y + 0.01, ZJ)], [(0, 0)] * 4)
    # гранитный бордюр по краю площади и встроенные подсветки у башни
    box("kerb", granite, -52, 52, 0.0, 0.3, 0.0, 0.1)
    for k in range(-5, 6):
        if abs(k) < 2:
            continue
        box("uplight", lobby_glow, k * 3.0 - 0.3 - 0.0, k * 3.0 + 0.3, YT - 1.0, YT - 0.8, 0.04, 0.07) if abs(k * 3.0) > 11 else None
    # светлая дорожка к двери и тёмные полосы
    box("path", granite, -2.8, 2.8, 0.0, YT - 0.1, 0.04, 0.052)
    box("path_l", alum, -2.85, -2.8, 0.0, YT - 0.1, 0.04, 0.056)
    box("path_r", alum, 2.8, 2.85, 0.0, YT - 0.1, 0.04, 0.056)

    # ---------- башня: навесная стена, рёбра, перекрытия ----------
    TX, TD, ZTOP = 15.0, 24.0, 64.0
    curt("curtain_front", -TX, TX, ZL, ZTOP, YT)
    curt_side("curtain_r", TX, YT, YT + TD, ZL, ZTOP, True)
    curt_side("curtain_l", -TX, YT, YT + TD, ZL, ZTOP, False)
    # импосты каждые 3 м и перекрытия каждые 4 м, ровно по сетке для стекла в игре
    for i in range(-5, 6):
        x = i * 3.0
        w = 0.3 if abs(x) == TX else 0.09
        box("fin", alum, x - w, x + w, YT - 0.38, YT, ZL, ZTOP)
    for k in range(0, 15):
        z = ZL + k * 4.0
        box("band", alum, -TX, TX, YT - 0.14, YT, z - 0.08, z + 0.18)
    for sx in (-1, 1):
        for k in range(0, 15):
            z = ZL + k * 4.0
            xs0, xs1 = (TX, TX + 0.14) if sx > 0 else (-TX - 0.14, -TX)
            box("band_s", alum, xs0, xs1, YT, YT + TD, z - 0.08, z + 0.18)
    # верх: парапет, венец-козырёк, ступенчатая корона
    box("roof_edge", alum, -TX - 0.2, TX + 0.2, YT - 0.4, YT + TD + 0.2, ZTOP, ZTOP + 0.6)
    box("roof_cap", granite, -TX - 0.3, TX + 0.3, YT - 0.5, YT + TD + 0.3, ZTOP + 0.6, ZTOP + 0.75)
    CX1, CY0, CY1, ZC1 = 11.0, YT + 4.0, YT + 20.0, 70.0
    curt("curtain_crown", -CX1, CX1, ZTOP + 0.75, ZC1, CY0)
    curt_side("curtain_crown_r", CX1, CY0, CY1, ZTOP + 0.75, ZC1, True)
    curt_side("curtain_crown_l", -CX1, CY0, CY1, ZTOP + 0.75, ZC1, False)
    for i in range(-3, 4):
        box("fin_c", alum, i * 3.0 - 0.12, i * 3.0 + 0.12, CY0 - 0.35, CY0, ZTOP + 0.75, ZC1)
    box("crown_cap", alum, -CX1 - 0.3, CX1 + 0.3, CY0 - 0.4, CY1 + 0.3, ZC1, ZC1 + 0.5)
    box("crown_cap2", granite, -CX1 - 0.15, CX1 + 0.15, CY0 - 0.2, CY1 + 0.15, ZC1 + 0.5, ZC1 + 0.7)
    # мачта с огнём
    cyl("mast", alum, 0.35, 4.0, loc=(0, YT + 12, ZC1 + 2.7), segs=8, r2=0.22)
    cyl("mast2", alum, 0.14, 8.0, loc=(0, YT + 12, ZC1 + 6.7), segs=6, r2=0.05)
    sphere("mast_lamp", lamp_red, 0.28, loc=(0, YT + 12, ZC1 + 10.9), segs=8, rings=5)

    # ---------- вестибюльный блок: гранитные фланги, стеклянная стена, перекрытие ----------
    LXG = 10.5
    # фланги с рустом-панелями; справа — ниша с дверью вора
    for sx in (-1, 1):
        xa, xb = sorted((sx * LXG, sx * TX))
        if sx > 0:
            rust_wall(granite, xa, DX0 - 0.15, YT, YT + 0.5, 0.04, ZL - 0.4, h=0.9)
            rust_wall(granite, DX0 + DWO + 0.15, xb, YT, YT + 0.5, 0.04, ZL - 0.4, h=0.9)
            rust_wall(granite, DX0 - 0.15, DX0 + DWO + 0.15, YT, YT + 0.5, 2.7, ZL - 0.4, h=0.9)
            # ниша: боковины и тёмный коридор 5 м за дверью (пустой проход)
            cLx, cRx = DX0 - 0.1, DX0 + DWO + 0.1
            box("od_jamb", alum, cLx - 0.08, cLx, YT - 0.02, YT + 0.5, 0.04, 2.7)
            box("od_jamb", alum, cRx, cRx + 0.08, YT - 0.02, YT + 0.5, 0.04, 2.7)
            box("od_head", alum, cLx - 0.08, cRx + 0.08, YT - 0.02, YT + 0.5, 2.62, 2.7)
            box("flank_body", granite, xa, cLx, YT + 0.5, YT + 10, 0, ZL - 0.4)
            box("flank_body", granite, cRx, xb, YT + 0.5, YT + 10, 0, ZL - 0.4)
            box("flank_body", granite, cLx, cRx, YT + 0.5, YT + 10, 2.7, ZL - 0.4)
            box("flank_body", granite, cLx, cRx, YT + 5.5, YT + 10, 0, 2.7)
            box("od_floor", lobby_floor, cLx, cRx, YT + 0.4, YT + 5.5, 0, 0.04)
            # козырёк над дверью, табличка, лампа, домофон
            box("od_hood", alum, DX0 - 0.4, DX0 + DWO + 0.4, YT - 0.7, YT + 0.02, 2.85, 2.93)
            for s2 in (-1, 1):
                tube("od_rod", alum, [(DX0 + DWO / 2 + s2 * (DWO / 2 + 0.3), YT - 0.65, 2.9), (DX0 + DWO / 2 + s2 * (DWO / 2 + 0.3), YT - 0.02, 3.6)], 0.012, segs=4)
            box("od_lamp", lobby_glow, DX0 + 0.4, DX0 + 0.9, YT - 0.64, YT - 0.2, 2.8, 2.84)
            for xx in (cLx - 0.08 - 0.05, cRx + 0.08 + 0.05):  # световые полосы по бокам ниши — дверь заметна издалека
                box("od_strip", lobby_glow, xx - 0.03, xx + 0.03, YT - 0.04, YT, 0.3, 2.6)
            box("od_panel", alum, DX0 + DWO + 0.3, DX0 + DWO + 0.55, YT - 0.06, YT + 0.0, 1.3, 1.65)
            box("od_btn", lobby_glow, DX0 + DWO + 0.38, DX0 + DWO + 0.47, YT - 0.08, YT - 0.06, 1.5, 1.58)
            box("od_num", alum, DX0 + DWO + 0.3, DX0 + DWO + 0.7, YT - 0.04, YT + 0.0, 1.85, 2.0)
        else:
            rust_wall(granite, xa, xb, YT, YT + 0.5, 0.04, ZL - 0.4, h=0.9)
            box("flank_body", granite, xa, xb, YT + 0.5, YT + 10, 0, ZL - 0.4)
    # цокольные ниши-«полоса» вверху флангов и перекрытие вестибюля
    box("lobby_fascia", granite, -TX, TX, YT - 0.2, YT + 0.5, ZL - 0.4, ZL)
    box("lobby_fascia_band", alum, -TX, TX, YT - 0.28, YT - 0.2, ZL - 0.4, ZL - 0.34)
    box("lobby_fascia_band", alum, -TX, TX, YT - 0.28, YT - 0.2, ZL - 0.06, ZL)
    box("lobby_ceil", lobby_floor, -LXG, LXG, YT + 0.4, YT + 16.5, ZL - 0.8, ZL - 0.4)
    box("lobby_ceil_front", granite, -LXG, LXG, YT - 0.1, YT + 0.5, ZL - 1.2, ZL - 0.4)
    # стеклянная стена вестибюля 21 м × 8 м: стекло, импосты, ригели
    GY = YT + 0.4
    quad("glass_lobby", glass_l, [(-LXG, GY, 0.04), (LXG, GY, 0.04), (LXG, GY, ZL - 1.2), (-LXG, GY, ZL - 1.2)], [(0, 0), (1, 0), (1, 1), (0, 1)])
    for i in range(-6, 7):
        x = i * 1.75
        box("lmull", alum, x - 0.05, x + 0.05, GY - 0.22, GY, 0.04, ZL - 1.2)
    for z in (0.2, 3.0, 5.4, ZL - 1.35):
        box("ltrans", alum, -LXG, LXG, GY - 0.12, GY, z, z + 0.1)
    # вращающаяся дверь по центру: барабан, лопасти, потолок, боковые створки
    R = 1.5
    zdh = 2.9
    cx, cy0 = 0.0, GY - 0.7
    drum_pts = arc_pts(cx, cy0, R, 210, 330, 8)
    for i in range(len(drum_pts) - 1):
        (xa_, ya_), (xb_, yb_) = drum_pts[i], drum_pts[i + 1]
        # здесь «z» арки — это y: рисуем стеклянные секции барабана
        poly("glass_lobby", glass_l, [(xa_, ya_, 0.1), (xb_, yb_, 0.1), (xb_, yb_, zdh), (xa_, ya_, zdh)], [(0, 0), (1, 0), (1, 1), (0, 1)], face=-1)
    # arc_pts возвращает (x, z); для барабана используем как (x, y)
    for t in (210, 330):
        px, py = cx + R * math.cos(math.radians(t)), cy0 + R * math.sin(math.radians(t))
        box("drum_post", alum, px - 0.05, px + 0.05, py - 0.05, py + 0.05, 0.04, zdh + 0.1)
    cyl("drum_ceil", alum, R + 0.1, 0.12, loc=(cx, cy0, zdh + 0.1), segs=20)
    cyl("drum_floor", alum, R - 0.02, 0.03, loc=(cx, cy0, 0.06), segs=20)
    cyl("drum_axis", alum, 0.08, zdh, loc=(cx, cy0, zdh / 2), segs=8)
    for k in range(4):
        a = math.radians(25 + k * 90)
        ex, ey = cx + math.cos(a) * (R - 0.08), cy0 + math.sin(a) * (R - 0.08)
        poly("glass_lobby", glass_l, [(cx, cy0, 0.15), (ex, ey, 0.15), (ex, ey, zdh - 0.1), (cx, cy0, zdh - 0.1)], [(0, 0), (1, 0), (1, 1), (0, 1)], face=-1)
        poly("glass_lobby", glass_l, [(ex, ey, 0.15), (cx, cy0, 0.15), (cx, cy0, zdh - 0.1), (ex, ey, zdh - 0.1)], [(0, 0), (1, 0), (1, 1), (0, 1)], face=1)
        tube("wing_frame", alum, [(cx, cy0, 0.15), (ex, ey, 0.15), (ex, ey, zdh - 0.1), (cx, cy0, zdh - 0.1), (cx, cy0, 0.15)], 0.02, segs=4, caps=False)
    # боковые распашные двери (стекло в алюминии) и ручки
    for sd in (-1, 1):
        xx = sd * 2.55
        box("sdoor_top", alum, xx - 0.55, xx + 0.55, GY - 0.12, GY, zdh - 0.05, zdh + 0.1)
        box("sdoor_l", alum, xx - 0.55, xx - 0.5, GY - 0.12, GY, 0.1, zdh)
        box("sdoor_r", alum, xx + 0.5, xx + 0.55, GY - 0.12, GY, 0.1, zdh)
        box("sdoor_bot", alum, xx - 0.55, xx + 0.55, GY - 0.12, GY, 0.1, 0.35)
        box("sdoor_pull", alum, xx - 0.45 * sd, xx - 0.4 * sd, GY - 0.25, GY - 0.12, 0.9, 1.5)
    # навес над входом: плита, кромка, подвесы, свет снизу
    zc = 4.4
    box("canopy", alum, -4.2, 4.2, YT - 3.4, YT + 0.4, zc, zc + 0.3)
    box("canopy_edge", granite, -4.25, 4.25, YT - 3.46, YT - 3.3, zc - 0.05, zc + 0.35)
    for s2 in (-1, 1):
        tube("canopy_rod", alum, [(s2 * 3.9, YT - 3.3, zc + 0.3), (s2 * 3.9, YT - 0.05, ZL - 1.6)], 0.03, segs=5)
        tube("canopy_rod", alum, [(s2 * 1.5, YT - 3.3, zc + 0.3), (s2 * 1.5, YT - 0.05, ZL - 1.6)], 0.03, segs=5)
    for i in range(3):
        box("canopy_light", lobby_glow, -3.6 + i * 3.6 - 0.9, -3.6 + i * 3.6 + 0.9, YT - 2.3, YT - 2.0, zc - 0.03, zc)

    # ---------- интерьер вестибюля: колонны, ресепшн, светящаяся стена, лампы ----------
    ZI = ZL - 0.8
    box("lobby_floor", lobby_floor, -LXG, LXG, YT + 0.4, YT + 16.5, 0.0, 0.04)
    box("lobby_w_l", granite, -LXG - 0.2, -LXG, YT + 0.4, YT + 16.5, 0, ZI)
    box("lobby_w_r", granite, LXG, LXG + 0.2, YT + 0.4, YT + 16.5, 0, ZI)
    box("lobby_back", lobby_glow, -LXG, LXG, YT + 16.3, YT + 16.5, 0.04, ZI)
    for i in range(-2, 3):  # вертикальные пилоны на светящейся стене
        box("lobby_pylon", granite, i * 4.2 - 0.18, i * 4.2 + 0.18, YT + 15.9, YT + 16.3, 0.04, ZI)
    for i in range(6):
        x = -10.0 + i * 4.0
        if abs(x) < 1.0:
            continue
        cyl("lcol", granite, 0.4, ZI, loc=(x, YT + 5.0, ZI / 2), segs=14)
        cyl("lcol_cap", alum, 0.45, 0.1, loc=(x, YT + 5.0, ZI - 0.05), segs=14)
        cyl("lcol_base", alum, 0.45, 0.1, loc=(x, YT + 5.0, 0.09), segs=14)
    # ресепшн: тумба с гранитной столешницей, свечение спереди, логотип-панель сзади
    box("desk", granite, -4.0, 4.0, YT + 10.0, YT + 11.4, 0.04, 1.05)
    box("desk_top", lobby_floor, -4.2, 4.2, YT + 9.9, YT + 11.5, 1.05, 1.15)
    box("desk_glow", lobby_glow, -3.8, 3.8, YT + 9.96, YT + 10.0, 0.25, 0.7)
    box("desk_wall", granite, -3.0, 3.0, YT + 13.0, YT + 13.4, 0.04, 3.4)
    box("desk_logo", lobby_glow, -2.0, 2.0, YT + 12.96, YT + 13.0, 1.7, 2.6)
    # потолочные светильники-линии и подвесные
    for i in range(-3, 4):
        box("ceil_lamp", lobby_glow, i * 2.9 - 0.9, i * 2.9 + 0.9, YT + 3.0, YT + 3.25, ZI - 0.05, ZI)
        box("ceil_lamp", lobby_glow, i * 2.9 - 0.9, i * 2.9 + 0.9, YT + 8.0, YT + 8.25, ZI - 0.05, ZI)
        box("ceil_lamp", lobby_glow, i * 2.9 - 0.9, i * 2.9 + 0.9, YT + 13.0, YT + 13.25, ZI - 0.05, ZI)
    # диваны и фикусы
    for sx in (-1, 1):
        x = sx * 6.5
        box("sofa", granite, x - 1.2, x + 1.2, YT + 7.0, YT + 8.0, 0.04, 0.45)
        box("sofa_back", granite, x - 1.2, x + 1.2, YT + 7.8, YT + 8.0, 0.45, 0.95)
        box("lplant_pot", alum, x + sx * 3.0 - 0.3, x + sx * 3.0 + 0.3, YT + 7.2, YT + 7.8, 0.04, 0.6)
        sphere("lplant", leaves2, 0.7, loc=(x + sx * 3.0, YT + 7.5, 1.5), scale=(1, 1, 1.3), segs=8, rings=6)

    # ---------- флагштоки и клумбы ----------
    for i, (fx, fm) in enumerate(((-13.5, flag_a), (-11.5, flag_b), (-9.5, flag_c))):
        fy = 3.2
        cyl("pole_base", granite, 0.22, 0.4, loc=(fx, fy, 0.24), segs=8)
        cyl("pole", alum, 0.06, 8.6, loc=(fx, fy, 4.5), segs=8, r2=0.04)
        sphere("pole_ball", mat("brass", 0, 0, 0), 0.1, loc=(fx, fy, 8.88), segs=6, rings=4)
        # полотнище со складками (двусторонняя полоса в сетке 8 × 3)
        bm = bmesh.new()
        lay = bm.loops.layers.uv.verify()
        NI, NJ = 14, 5
        g = [[bm.verts.new((fx + 0.06 + 1.7 * i / NI, fy + 0.16 * math.sin(i * 0.7 + j * 0.3) * (i / NI), 8.55 - 1.1 * j / NJ - 0.12 * (i / NI))) for i in range(NI + 1)] for j in range(NJ + 1)]
        for j in range(NJ):
            for i in range(NI):
                f = bm.faces.new((g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]))
                for lo in f.loops:
                    lo[lay].uv = (0.5, 0.5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            if f.normal.y > 0:
                f.normal_flip()
        g2 = [[bm.verts.new((v.co.x, v.co.y + 0.02, v.co.z)) for v in row] for row in g]
        for j in range(NJ):
            for i in range(NI):
                f = bm.faces.new((g2[j][i + 1], g2[j][i], g2[j + 1][i], g2[j + 1][i + 1]))
        from_bm(bm, "flag", fm)
    for px in (-8.0, -5.5, 5.5, 8.0, -12.0, -16.0, 20.5):
        py = 2.4
        box("planter", granite, px - 1.1, px + 1.1, py - 1.1, py + 1.1, 0.04, 0.8)
        box("planter_cap", alum, px - 1.15, px + 1.15, py - 1.15, py + 1.15, 0.8, 0.86)
        box("soil", soil, px - 1.0, px + 1.0, py - 1.0, py + 1.0, 0.86, 0.9)
        for j, (dx, dy, r) in enumerate(((0, 0, 0.55), (-0.55, 0.35, 0.4), (0.5, -0.4, 0.42), (0.35, 0.5, 0.35))):
            sphere("bush", leaves if j % 2 else leaves2, r, loc=(px + dx, py + dy, 1.2 + (0.2 if j == 0 else 0)), scale=(1, 1, 0.9), segs=7, rings=5)
    # скамья и тумбы-ограничители
    for bx in (-2.8 - 6.0, 2.8 + 6.0):
        box("bench_seat", mat("wood", 0, 0, 0), bx - 1.0, bx + 1.0, 4.7, 5.15, 0.45, 0.5)
        for s2 in (-1, 1):
            box("bench_leg", granite, bx + s2 * 0.9 - 0.06, bx + s2 * 0.9 + 0.06, 4.7, 5.15, 0.04, 0.45)
    for bx in range(-12, 13, 3):
        if abs(bx) < 3:
            continue
        cyl("bollard", alum, 0.1, 0.8, loc=(bx + 0.0, 0.6, 0.44), segs=8)
        cyl("bollard_lamp", lobby_glow, 0.1, 0.03, loc=(bx, 0.6, 0.85), segs=8)

    # ---------- соседние башни ----------
    def tower(xa, xb, yf, h, base_h, seed, crown):
        """Башня пониже: цокольный блок из тёмного стекла, навесная стена с рёбрами, ступенчатая корона."""
        w = xb - xa
        quad("glass_lobby", glass_l, [(xa, yf + 0.4, 0.04), (xb, yf + 0.4, 0.04), (xb, yf + 0.4, base_h - 0.6), (xa, yf + 0.4, base_h - 0.6)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        box("t_base_wall", granite, xa, xb, yf + 0.4, yf + 12, 0, base_h - 0.6)
        for x in [xa + i * 2.0 for i in range(int(w / 2.0) + 1)]:
            box("t_mull", alum, x - 0.05, x + 0.05, yf + 0.2, yf + 0.4, 0.04, base_h - 0.6)
        box("t_fascia", granite, xa, xb, yf - 0.2, yf + 0.5, base_h - 0.6, base_h)
        curt("curtain_n", xa, xb, base_h, h, yf)
        quad("curtain", curtain, [(xb, yf, base_h), (xb, yf + 22, base_h), (xb, yf + 22, h), (xb, yf, h)], [(0, base_h), (22, base_h), (22, h), (0, h)])
        quad("curtain", curtain, [(xa, yf + 22, base_h), (xa, yf, base_h), (xa, yf, h), (xa, yf + 22, h)], [(22, base_h), (0, base_h), (0, h), (22, h)])
        n = int(w / 3.0)
        for i in range(n + 1):
            x = xa + i * w / n
            box("fin", alum, x - 0.09, x + 0.09, yf - 0.34, yf, base_h, h)
        z = base_h
        while z < h:
            box("band", alum, xa, xb, yf - 0.14, yf, z - 0.08, z + 0.18)
            z += 4.0
        box("roof_edge", alum, xa - 0.2, xb + 0.2, yf - 0.4, yf + 22.2, h, h + 0.6)
        box("roof_cap", granite, xa - 0.3, xb + 0.3, yf - 0.5, yf + 22.3, h + 0.6, h + 0.75)
        if crown == "step":
            box("crown", granite, xa + 4, xb - 4, yf + 4, yf + 16, h + 0.6, h + 5)
            for i in range(0, 6):
                box("crown_louver", alum, xa + 4.1, xb - 4.1, yf + 3.9, yf + 4.0, h + 1 + i * 0.65, h + 1.2 + i * 0.65)
        else:
            box("crown", granite, xb - 9, xb - 3, yf + 6, yf + 14, h + 0.6, h + 4)
            cyl("antenna", alum, 0.08, 7, loc=(xa + 6, yf + 8, h + 4.1), segs=5, r2=0.03)
            sphere("a_lamp", lamp_red, 0.12, loc=(xa + 6, yf + 8, h + 7.7), segs=6, rings=4)

    tower(-46.0, -19.0, 5.5, 46.0, 5.0, 3, "step")
    tower(19.0, 45.0, 4.5, 36.0, 4.8, 4, "box")

    dbg()
    root = finalize("office")
    uv_all(root)
    od.parent = root
    empty("office_entry", (DX0 + DWO / 2, YT - 0.9, 0.0), root)


# ============================================================
#                      ЮВЕЛИРНЫЙ ДОМ
# ============================================================
# Ряд домов в парижском стиле: 5 этажей, мансарда с люкарнами, кованые балконы. Центральный — ювелирный дом:
# бутик с тремя витринами, маркиза, вывеска, парадная дверь; справа арка-проезд с деревянными воротами (вход вора).
if want("jewelry"):
    plaza = mat("plaza", 0xb3ab9c, 0.0, 0.85)
    plaza_j = mat("plaza_joint", 0x6f685c, 0.0, 0.95)
    shopw = mat("shop_window", 0xffe0b0, 0.0, 0.3, emit=0xffc480, emit_k=1.0)  # витрина: мягкий тёплый свет, UV 0..1 на стекло
    awn_a = mat("awning", 0x1c4a38, 0.0, 0.92)  # маркиза: тёмно-зелёная ткань
    awn_b = mat("awning_light", 0x2a6048, 0.0, 0.92)
    sign = mat("sign", 0x1b1713, 0.3, 0.5)  # вывеска: надпись рисует игра, UV 0..1
    lamp_red = mat("lamp_red", 0xff3020, 0.0, 0.3, emit=0xff2010, emit_k=3.0)
    gold = mat("brass", 0x8a6a30, 0.8, 0.35)
    cobble = mat("cobble", 0x4b4640, 0.0, 0.95)
    OWN_UV.update({"awning", "awning_light"})

    ZF = [5.0, 9.1, 12.7, 16.1, 19.2]  # верхи этажей (низ — верх предыдущего)
    YJ = 0.7  # лицо домов
    SL = 0.5  # толщина лицевой плиты с проёмами

    def fwin(xc, w, z0, z1, y, k, head="none", rail=False, depth=0.28, frm=None):
        """Окно парижского дома: утопленное стекло, переплёт, наличник, подоконник, сандрик или фронтон."""
        glass(xc - w / 2, xc + w / 2, z0, z1, y + depth, k)
        mullions(xc, w, z0, z1, y + depth, nz=2, m=frm or (frame if k is not None else iron), d=0.045)
        rect_frame(trim, xc, w, z0, z1, y, band=0.17, out=0.08)
        sill(trim, xc, w, z0, y, out=0.18, h=0.1, ext=0.14)
        zt = z1 + 0.17
        if head == "tri":
            hw = w / 2 + 0.42
            box("whead", trim, xc - hw, xc + hw, y - 0.2, y + 0.02, zt, zt + 0.1)
            prism("wped", trim, [(xc - hw, zt + 0.1), (xc + hw, zt + 0.1), (xc, zt + 0.1 + 0.42)], y - 0.16, y + 0.02)
        elif head == "seg":
            box("whead", trim, xc - w / 2 - 0.32, xc + w / 2 + 0.32, y - 0.2, y + 0.02, zt, zt + 0.12)
            sphere("mask", trim, 0.12, loc=(xc, y - 0.1, zt - 0.08), scale=(0.8, 0.6, 1.1), segs=6, rings=4)
        elif head == "key":
            box("whead", trim, xc - w / 2 - 0.22, xc + w / 2 + 0.22, y - 0.14, y + 0.02, zt, zt + 0.1)
            box("keyst", trim, xc - 0.12, xc + 0.12, y - 0.2, y + 0.02, z1 - 0.06, zt + 0.1)

    def balcony_bars(acc, xa, xb, y, zb, h=0.95, step=0.2, ext=0.0):
        """Кованая балюстрада: прутья, поручень, нижний пояс (в накопитель acc)."""
        n = int((xb - xa) / step)
        for i in range(n + 1):
            acc.bar(xa + i * (xb - xa) / n, y, zb + 0.06, zb + h, 0.011)
        acc.box(xa - 0.03, xb + 0.03, y - 0.03, y + 0.03, zb + 0.06, zb + 0.1)
        acc.box(xa - 0.04, xb + 0.04, y - 0.04, y + 0.04, zb + h, zb + h + 0.05)
        acc.box(xa - 0.03, xb + 0.03, y - 0.03, y + 0.03, zb + h * 0.55, zb + h * 0.55 + 0.03)

    def mansard(xa, xb, yf, zc, ncol, seed):
        """Мансарда: профиль в плоскости YZ (крутой скат, потом пологий), люкарны, трубы."""
        pr = [(yf + 0.2, zc), (yf + 1.6, zc + 3.4), (yf + 8.0, zc + 4.5), (yf + 14.0, zc + 4.5), (yf + 14.0, zc)]
        prism_yz("mansard", slate, pr, xa, xb)
        box("m_gutter", iron, xa, xb, yf - 0.85, yf - 0.7, zc + 0.12, zc + 0.2)
        # конёк зинком
        box("ridge", iron, xa, xb, yf + 7.9, yf + 8.1, zc + 4.5, zc + 4.58)
        w = (xb - xa) / ncol
        for i in range(ncol):
            xc = xa + (i + 0.5) * w
            dy = yf + 1.1  # лицо люкарны
            zr = zc + 3.4 * (dy - (yf + 0.2)) / 1.4  # высота ската в этой точке
            box("dorm", slate, xc - 0.75, xc + 0.75, dy, yf + 2.4, zr - 0.2, zr + 1.55)
            box("dorm_cheek", iron, xc - 0.78, xc - 0.7, dy - 0.02, yf + 2.4, zr - 0.2, zr + 1.55)
            box("dorm_cheek", iron, xc + 0.7, xc + 0.78, dy - 0.02, yf + 2.4, zr - 0.2, zr + 1.55)
            lk = cell(seed * 50 + i, 0.2)
            glass(xc - 0.45, xc + 0.45, zr + 0.0, zr + 1.2, dy - 0.01, lk)
            mullions(xc, 0.9, zr + 0.0, zr + 1.2, dy - 0.01, nz=1, m=frame if lk is not None else iron, d=0.04)
            rect_frame(trim, xc, 0.9, zr, zr + 1.2, dy, band=0.12, out=0.07)
            box("dorm_sill", trim, xc - 0.65, xc + 0.65, dy - 0.15, dy + 0.02, zr - 0.1, zr)
            # фронтончик с завитком и шарик
            prism("dorm_ped", trim, [(xc - 0.82, zr + 1.55), (xc + 0.82, zr + 1.55), (xc, zr + 2.15)], dy - 0.12, dy + 0.04)
            box("dorm_cor", trim, xc - 0.88, xc + 0.88, dy - 0.18, dy + 0.04, zr + 1.45, zr + 1.57)
            sphere("dorm_ball", iron, 0.05, loc=(xc, dy - 0.05, zr + 2.2), segs=5, rings=3)
        # трубы
        for k in range(2):
            xx = xa + (xb - xa) * (0.25 + 0.5 * k)
            box("chimney", brick, xx - 0.5, xx + 0.5, yf + 8.5, yf + 9.4, zc + 3.0, zc + 7.2)
            box("chim_cap", trim, xx - 0.6, xx + 0.6, yf + 8.4, yf + 9.5, zc + 7.2, zc + 7.38)
            for dx in (-0.2, 0.2):
                cyl("pot", brick, 0.1, 0.45, loc=(xx + dx, yf + 8.95, zc + 7.6), segs=6)

    def cornice(xa, xb, yf, z):
        """Карниз: гладкий фриз, модильоны, вынос, водосточный жёлоб."""
        box("cor_f", trim, xa - 0.05, xb + 0.05, yf - 0.18, yf + SL, z, z + 0.3)
        box("cor_a", trim, xa - 0.15, xb + 0.15, yf - 0.4, yf + SL, z + 0.3, z + 0.5)
        mod = Acc("cmod", trim)
        n = int((xb - xa) / 0.6)
        for i in range(n):
            x = xa + 0.3 + i * (xb - xa - 0.6) / max(n - 1, 1)
            mod.box(x - 0.1, x + 0.1, yf - 0.38, yf - 0.18, z + 0.32, z + 0.5, bot=False)
        mod.done()
        box("cor_b", trim, xa - 0.3, xb + 0.3, yf - 0.8, yf + SL, z + 0.5, z + 0.8)
        box("cor_c", trim, xa - 0.4, xb + 0.4, yf - 0.9, yf + SL, z + 0.8, z + 1.0)

    def uppers(xa, xb, yf, ncol, wall_m, seed, zf=ZF, rich=False, lit_p=0.22):
        """Этажи 2–5: стена с проёмами, окна, балконы."""
        w = (xb - xa) / ncol
        cx = [xa + (i + 0.5) * w for i in range(ncol)]
        z_b = [zf[0]] + list(zf)  # границы этажей
        bal = Acc("balc", iron)
        for fl in range(1, 5):
            zlo, zhi = zf[fl - 1] + 0.4, zf[fl]
            hwin = [2.9, 2.7, 2.5, 2.3][fl - 1]
            z0 = zlo + 0.3 if fl != 1 else zlo + 0.3
            z1 = z0 + hwin
            ops = [(xc, 1.25) for xc in cx]
            piers_row(wall_m, xa, xb, yf, yf + SL, zlo, z0, [])
            piers_row(wall_m, xa, xb, yf, yf + SL, z0, z1, ops)
            piers_row(wall_m, xa, xb, yf, yf + SL, z1, zhi, [])
            for i, xc in enumerate(cx):
                lk = cell(seed * 1000 + fl * 20 + i, lit_p)
                head = ("tri" if i % 2 == 0 else "seg") if fl == 1 else ("key" if fl == 2 else "none")
                fwin(xc, 1.25, z0, z1, yf, lk, head)
                if fl in (2, 3):  # балкончик-решётка у каждого окна
                    bal.box(xc - 0.85, xc + 0.85, yf - 0.4, yf - 0.28, z0 - 0.02, z0 + 0.04)
                    balcony_bars(bal, xc - 0.8, xc + 0.8, yf - 0.34, z0 + 0.0, h=0.9, step=0.27)
            # пояс над этажом
            if fl < 4:
                box("belt", trim, xa - 0.05, xb + 0.05, yf - 0.1, yf + SL, zhi - 0.1, zhi + 0.2)
            if fl in (1, 4):  # сплошной балкон на 2-м и 5-м этажах
                zbk = z0 - 0.35
                box("bk_slab", trim, xa - 0.05, xb + 0.05, yf - 0.75, yf + SL, zbk, zbk + 0.18)
                box("bk_edge", trim, xa - 0.05, xb + 0.05, yf - 0.8, yf - 0.7, zbk + 0.18, zbk + 0.24)
                for xx in [xa + 0.9 + k * (xb - xa - 1.8) / max(ncol - 1, 1) for k in range(ncol)]:
                    box("bk_cons", trim, xx - 0.12, xx + 0.12, yf - 0.7, yf, zbk - 0.45, zbk)
                bal.box(xa, xb, yf - 0.7, yf - 0.62, zbk + 0.24, zbk + 0.3)
                balcony_bars(bal, xa + 0.08, xb - 0.08, yf - 0.68, zbk + 0.24, h=0.95, step=0.27)
        bal.done()
        # окаймление углов: рустованные углы
        for xq, d in ((xa, 1), (xb, -1)):
            z = 5.4
            k = 0
            while z < zf[4] - 0.3:
                L = 0.55 if k % 2 else 0.35
                box("quoin", trim, min(xq, xq + d * L), max(xq, xq + d * L), yf - 0.05, yf + SL, z, z + 0.6)
                z += 1.2
                k += 1

    # ---------- ворота арки (отдельный узел «jewelry_door»: правая створка) ----------
    # лицо и проём арки: центр 9.6, ширина 3.2, пята на 3.0, верх 4.6
    AXC, AW, AZS = 9.6, 3.2, 3.0
    GYG = YJ + SL + 0.05  # плоскость ворот (сразу за лицевой плитой)
    AR = AW / 2

    def plank_leaf(x_in, x_out, hinge_out):
        """Створка ворот из вертикальных досок: верх идёт по дуге арки, кованые полосы и шляпки."""
        n = 8
        wp = (x_out - x_in) / n
        for i in range(n):
            xa_, xb_ = x_in + i * wp, x_in + (i + 1) * wp
            xm = (xa_ + xb_) / 2
            top = AZS + math.sqrt(max(AR * AR - (xm - AXC) ** 2, 0.0)) - 0.12
            box("plank", wood, xa_ + 0.006, xb_ - 0.006, GYG, GYG + 0.07, 0.04, top, bev=0.008, segs=1)
        for z in (0.45, 1.6, 2.7):
            box("strap", iron, min(x_in, x_out), max(x_in, x_out), GYG - 0.025, GYG, z, z + 0.14)
        for x_, z_ in [(min(x_in, x_out) + 0.2 + k * 0.35, zz) for k in range(int(abs(x_out - x_in) / 0.35)) for zz in (0.52, 1.67, 2.77)]:
            sphere("stud", iron, 0.022, loc=(x_, GYG - 0.025, z_), segs=4, rings=3)
        box("bar_v", iron, min(x_in, x_out), min(x_in, x_out) + 0.07, GYG - 0.03, GYG, 0.04, 2.9)
        box("bar_v", iron, max(x_in, x_out) - 0.07, max(x_in, x_out), GYG - 0.03, GYG, 0.04, 2.9)

    # правая створка вора: от центра (x = AXC) до правого косяка, петля справа
    plank_leaf(AXC + 0.02, AXC + AR, True)
    box("ring_h", iron, AXC + 0.1, AXC + 0.2, GYG - 0.08, GYG - 0.0, 1.1, 1.2)
    torus("ring", iron, 0.09, 0.012, loc=(AXC + 0.3, GYG - 0.045, 1.15), rot=(90, 0, 0), seg=10, rseg=4)
    for z in (0.5, 2.55):
        cyl("hinge_pin", iron, 0.025, 0.16, loc=(AXC + AR, GYG + 0.03, z), segs=6)
    jd = finalize("jewelry_door")
    set_root_pivot(jd, (AXC + AR, GYG + 0.03, 0))

    # ---------- земля ----------
    box("plaza", plaza, -45, 45, 0.0, 3.0, 0.0, 0.04)
    for x in range(-44, 45, 3):
        quad("joint", plaza_j, [(x - 0.012, 0.0, 0.042), (x + 0.012, 0.0, 0.042), (x + 0.012, YJ, 0.042), (x - 0.012, YJ, 0.042)], [(0, 0)] * 4)

    # ---------- соседние дома: простые первые этажи ----------
    def ground_arcade(xa, xb, yf, seed, door_at=None):
        """Первый этаж попроще: рустованный камень с арочными окнами и деревянной дверью."""
        n = int((xb - xa) / 3.6)
        w = (xb - xa) / n
        cx = [xa + (i + 0.5) * w for i in range(n)]
        dcol = n // 2 if door_at is None else door_at
        wops = [(c, 1.9) for i, c in enumerate(cx) if i != dcol]
        dop = [(cx[dcol], 1.8)]
        piers_row(stone, xa, xb, yf, yf + SL, 0.0, 0.9, dop, rust=True)
        piers_row(stone, xa, xb, yf, yf + SL, 0.9, 3.0, wops + dop, rust=True)
        # дверь: рустованная стена с арочным проёмом выше 3.0 (общая линия)
        piers_row(stone, xa, xb, yf, yf + SL, 3.0, 3.0 + 0.95, wops + dop, rust=False)
        arch_spandrels(stone, wops, 3.0, yf, yf + SL)
        arch_spandrels(stone, dop, 3.0, yf, yf + SL)
        piers_row(stone, xa, xb, yf, yf + SL, 3.95, ZF[0], [], rust=False)
        for i, c in enumerate(cx):
            if i == dcol:
                continue
            lk = cell(seed * 70 + i, 0.2)
            glass(c - 0.95, c + 0.95, 0.9, 3.95, yf + 0.3, lk, arch=True)
            mullions(c, 1.9, 0.9, 3.95, yf + 0.3, arch=True, m=iron, nz=2, d=0.045)
            arch_frame(trim, c, 1.9, 0.9, 3.0, yf, band=0.2, out=0.08)
            sill(trim, c, 1.9, 0.9, yf, out=0.2, h=0.1, ext=0.2)
        c = cx[dcol]
        # парадная деревянная дверь с наличником и фрамугой
        box("door_sur", trim, c - 1.1, c - 0.9, yf - 0.1, yf + 0.02, 0.0, 3.55)
        box("door_sur", trim, c + 0.9, c + 1.1, yf - 0.1, yf + 0.02, 0.0, 3.55)
        box("door_head", trim, c - 1.2, c + 1.2, yf - 0.16, yf + 0.02, 3.45, 3.6)
        box("door_leaf", wood, c - 0.9, c + 0.9, yf + 0.26, yf + 0.34, 0.04, 2.9)
        box("door_trans", dark, c - 0.9, c + 0.9, yf + 0.26, yf + 0.3, 2.9, 3.45)
        for sx in (-1, 1):
            for z0, z1 in ((0.2, 1.4), (1.55, 2.75)):
                box("door_panel", wood, c + sx * 0.45 - 0.33, c + sx * 0.45 + 0.33, yf + 0.2, yf + 0.26, z0, z1)
            sphere("door_knob", gold, 0.04, loc=(c + sx * 0.12, yf + 0.18, 1.1), segs=5, rings=3)
        box("door_step", dark, c - 1.1, c + 1.1, yf - 0.5, yf, 0.0, 0.14)
        box("fascia", trim, xa - 0.05, xb + 0.05, yf - 0.12, yf + SL, 4.2, ZF[0])
        box("fascia_top", trim, xa - 0.12, xb + 0.12, yf - 0.28, yf + SL, ZF[0] - 0.18, ZF[0] + 0.0)

    def ground_shutters(xa, xb, yf, seed):
        """Первый этаж: закрытые стальные рольставни в нишах."""
        n = int((xb - xa) / 3.8)
        w = (xb - xa) / n
        cx = [xa + (i + 0.5) * w for i in range(n)]
        ops = [(c, 2.8) for c in cx]
        piers_row(stone, xa, xb, yf, yf + SL, 0.0, 3.6, ops, rust=False)
        piers_row(stone, xa, xb, yf, yf + SL, 3.6, ZF[0], [], rust=False)
        box("fascia_top", trim, xa - 0.12, xb + 0.12, yf - 0.28, yf + SL, ZF[0] - 0.18, ZF[0])
        for c in cx:
            box("shut", mat("steel_door", 0x4a5258, 0.6, 0.4), c - 1.4, c + 1.4, yf + 0.2, yf + 0.26, 0.1, 3.6)
            for z in [0.25 + 0.2 * k for k in range(1, 17)]:
                quad("shut_line", mat("shutter_line", 0x0b0c0e, 0, 0.9), [(c - 1.4, yf + 0.195, z), (c + 1.4, yf + 0.195, z), (c + 1.4, yf + 0.195, z + 0.025), (c - 1.4, yf + 0.195, z + 0.025)], [(0, 0)] * 4)
            box("shut_box", iron, c - 1.5, c + 1.5, yf - 0.1, yf + 0.02, 3.4, 3.7)
            box("shut_sill", trim, c - 1.5, c + 1.5, yf - 0.12, yf + 0.02, 0.0, 0.1)

    def haus(xa, xb, yf, ncol, ground, seed, zf=ZF, wall_m=None, mans_z=None):
        wall_m = wall_m or stone
        box("body", wall_m, xa, xb, yf + SL, 30, 0, zf[4] + 1.0)
        box("plinth", dark, xa - 0.02, xb + 0.02, yf - 0.1, yf + SL, 0, 0.5)
        if ground == "arcade":
            ground_arcade(xa, xb, yf, seed)
        elif ground == "shutters":
            ground_shutters(xa, xb, yf, seed)
        uppers(xa, xb, yf, ncol, wall_m, seed, zf)
        cornice(xa, xb, yf, zf[4])
        mansard(xa, xb, yf, zf[4] + 1.0, ncol, seed)
        # водосточная труба на левом стыке
        cyl("pipe", iron, 0.06, zf[4], loc=(xa + 0.15, yf - 0.1, zf[4] / 2), segs=6)
        for z in (2.0, 6.0, 10.0, 14.0, 18.0):
            box("pipe_clip", iron, xa + 0.05, xa + 0.25, yf - 0.16, yf - 0.02, z, z + 0.06)

    # ---------- ряд домов ----------
    haus(-34.0, -21.0, 0.6, 4, "arcade", 1, zf=[5.0, 9.0, 12.5, 15.8, 18.8])
    haus(-21.0, -9.5, 0.8, 3, "shutters", 2, zf=[5.0, 9.3, 12.9, 16.3, 19.4])
    haus(12.3, 25.0, 0.7, 4, "arcade", 3, zf=[5.0, 9.1, 12.6, 15.9, 19.0])
    haus(25.0, 38.0, 0.55, 4, "shutters", 4, zf=[5.0, 9.2, 12.8, 16.2, 19.3])

    # ---------- центральный дом ----------
    XA, XB = -9.5, 12.3
    # объём дома: слева, справа и над тоннелем арки (за воротами — 9 м свободного прохода, дальше глухая стена)
    box("body", stone, XA, AXC - AR, YJ + SL, 30, 0, ZF[4] + 1.0)
    box("body", stone, AXC + AR, XB, YJ + SL, 30, 0, ZF[4] + 1.0)
    box("body", stone, AXC - AR, AXC + AR, YJ + SL, 30, 4.6, ZF[4] + 1.0)
    box("plinth", dark, XA - 0.02, XB + 0.02, YJ - 0.1, YJ + SL, 0, 0.5)
    # первый этаж: полосы стены с проёмами (витрины, дверь, арка)
    W1, W2, W3 = (-7.0, 3.6), (-2.6, 3.6), (5.0, 3.6)
    DC, DWj = 1.2, 2.4
    ops_win = [W1, W2, W3]
    piers_row(stone, XA, XB, YJ, YJ + SL, 0.0, 0.8, [(DC, DWj), (AXC, AW)])
    piers_row(stone, XA, XB, YJ, YJ + SL, 0.8, 3.0, ops_win + [(DC, DWj), (AXC, AW)])
    piers_row(stone, XA, XB, YJ, YJ + SL, 3.0, 4.6, [(AXC, AW)])
    arch_spandrels(stone, [(AXC, AW)], AZS, YJ, YJ + SL)
    piers_row(stone, XA, XB, YJ, YJ + SL, 4.6, ZF[0], [])
    # коридор арки: боковые стены, потолок, глухая стена, брусчатка
    tl, tr = AXC - AR, AXC + AR
    box("tunnel_back", stone, tl, tr, YJ + 9.0, 30, 0, 4.6)
    box("tunnel_floor", cobble, tl, tr, YJ + 0.1, YJ + 9.0, 0, 0.05)
    for k in range(10):  # швы брусчатки
        quad("cj", plaza_j, [(tl, YJ + 0.6 + k * 0.8, 0.052), (tr, YJ + 0.6 + k * 0.8, 0.052), (tr, YJ + 0.62 + k * 0.8, 0.052), (tl, YJ + 0.62 + k * 0.8, 0.052)], [(0, 0)] * 4)
    # фонарь в арке (тёплая лампа под сводом)
    lathe("arch_lamp", lampg, [(0.0, 0), (0.08, 0.0), (0.1, 0.2), (0.0, 0.22)], segs=6, loc=(AXC, YJ + 3.0, 4.2), sharp=10)
    # архивольт арки, замок и пилястры по бокам
    arch_frame(trim, AXC, AW, 0.0, AZS, YJ, band=0.35, out=0.14)
    box("arch_pil_l", trim, tl - 0.55, tl - 0.35, YJ - 0.1, YJ + 0.02, 0.0, AZS)
    box("arch_pil_r", trim, tr + 0.35, tr + 0.55, YJ - 0.1, YJ + 0.02, 0.0, AZS)
    for sx in (-1, 1):
        xx = AXC + sx * (AR + 0.5)
        box("arch_base", dark, xx - 0.28, xx + 0.28, YJ - 0.24, YJ + 0.02, 0.0, 0.7)
        sphere("arch_mask", trim, 0.2, loc=(AXC, YJ - 0.3, AZS + AR + 0.55), scale=(1, 0.6, 1.2), segs=7, rings=5) if sx > 0 else None
    # левая створка ворот и стойки (правая — узел jewelry_door)
    plank_leaf(AXC - AR, AXC - 0.02, False)
    box("gate_post", iron, AXC - 0.03, AXC + 0.03, GYG - 0.04, GYG + 0.0, 0.04, 2.9)
    # воротные петли слева
    for z in (0.5, 2.55):
        cyl("hinge_pin", iron, 0.025, 0.16, loc=(AXC - AR, GYG + 0.03, z), segs=6)

    # бутик: цокольная панель, витрины с латунными рамами, пилястры, маркиза, вывеска
    shop_acc = Acc("shop_brass", gold)
    for (xc, w) in ops_win:
        x0, x1 = xc - w / 2, xc + w / 2
        # панель под витриной (дерево на камне) и латунный плинтус
        box("bulk", wood, x0 + 0.05, x1 - 0.05, YJ - 0.08, YJ + 0.02, 0.1, 0.78)
        box("bulk_kick", gold, x0, x1, YJ - 0.1, YJ + 0.02, 0.0, 0.1)
        box("bulk_top", gold, x0 - 0.02, x1 + 0.02, YJ - 0.12, YJ + 0.02, 0.78, 0.84)
        # стекло витрины в латунных рамах (3 стекла, по одному UV 0..1)
        gw = (w - 0.12) / 3
        for j in range(3):
            gx0 = x0 + 0.06 + j * gw
            quad("shop_glass", shopw, [(gx0 + 0.03, YJ + 0.28, 0.9), (gx0 + gw - 0.03, YJ + 0.28, 0.9), (gx0 + gw - 0.03, YJ + 0.28, 2.9), (gx0 + 0.03, YJ + 0.28, 2.9)], [(0, 0), (1, 0), (1, 1), (0, 1)])
            box("sgf", gold, gx0 - 0.02, gx0 + 0.04, YJ + 0.2, YJ + 0.3, 0.84, 3.0)
        box("sgf", gold, x1 - 0.06, x1, YJ + 0.2, YJ + 0.3, 0.84, 3.0)
        for z in (0.84, 2.88, 2.4):
            box("sgt", gold, x0, x1, YJ + 0.2, YJ + 0.3, z, z + 0.07)
        # наличник и откосы
        box("w_jamb", trim, x0 - 0.2, x0, YJ - 0.12, YJ + 0.02, 0.0, 3.1)
        box("w_jamb", trim, x1, x1 + 0.2, YJ - 0.12, YJ + 0.02, 0.0, 3.1)
        box("w_head", trim, x0 - 0.2, x1 + 0.2, YJ - 0.12, YJ + 0.02, 3.0, 3.1)
        # в витрине: бархатные подиумы и выставленные украшения (светлые точки, ювелирка)
        for j in range(2):
            px = x0 + 0.9 + j * 1.6
            box("pod", mat("velvet_red", 0x4d0f1c, 0.0, 0.95), px - 0.35, px + 0.35, YJ + 0.45, YJ + 1.0, 1.0, 1.3)
            sphere("gem", gold, 0.05, loc=(px, YJ + 0.72, 1.35), segs=5, rings=3)
    # парадная дверь бутика: рама, створки, фрамуга, козырёк-сандрик, лампы
    dx0, dx1 = DC - DWj / 2, DC + DWj / 2
    box("d_jamb", trim, dx0 - 0.25, dx0, YJ - 0.15, YJ + 0.02, 0.0, 3.35)
    box("d_jamb", trim, dx1, dx1 + 0.25, YJ - 0.15, YJ + 0.02, 0.0, 3.35)
    box("d_head", trim, dx0 - 0.25, dx1 + 0.25, YJ - 0.15, YJ + 0.02, 3.0, 3.35)
    box("d_cor", trim, dx0 - 0.4, dx1 + 0.4, YJ - 0.3, YJ + 0.02, 3.35, 3.5)
    box("d_inner", dark, dx0, dx1, YJ + 0.45, YJ + SL, 0.0, 3.0)
    for sx in (-1, 1):
        xa_, xb_ = (DC, dx1) if sx > 0 else (dx0, DC)
        box("d_leaf", gold, xa_ + (0.02 if sx > 0 else 0), xb_ - (0 if sx > 0 else 0.02), YJ + 0.35, YJ + 0.45, 0.04, 2.3)
        quad("shop_glass", shopw, [(xa_ + 0.12 if sx > 0 else dx0 + 0.12, YJ + 0.33, 0.5), ((xb_ - 0.12) if sx > 0 else DC - 0.12, YJ + 0.33, 0.5), ((xb_ - 0.12) if sx > 0 else DC - 0.12, YJ + 0.33, 2.2), (xa_ + 0.12 if sx > 0 else dx0 + 0.12, YJ + 0.33, 2.2)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        box("d_pull", gold, (DC + sx * 0.12) - 0.015, (DC + sx * 0.12) + 0.015, YJ + 0.2, YJ + 0.34, 1.0, 1.4)
    quad("shop_glass", shopw, [(dx0 + 0.05, YJ + 0.3, 2.35), (dx1 - 0.05, YJ + 0.3, 2.35), (dx1 - 0.05, YJ + 0.3, 2.95), (dx0 + 0.05, YJ + 0.3, 2.95)], [(0, 0), (1, 0), (1, 1), (0, 1)])
    box("d_tr", gold, dx0, dx1, YJ + 0.28, YJ + 0.34, 2.3, 2.36)
    box("d_step", dark, dx0 - 0.25, dx1 + 0.25, YJ - 0.6, YJ + 0.02, 0.0, 0.14)
    for sx in (-1, 1):
        xx = DC + sx * (DWj / 2 + 0.55)
        box("d_lamp_arm", iron, xx - 0.02, xx + 0.02, YJ - 0.3, YJ, 2.7, 2.74)
        lathe("d_lamp", lampg, [(0.0, 0), (0.07, 0.0), (0.09, 0.22), (0.0, 0.24)], segs=6, loc=(xx, YJ - 0.3, 2.5), sharp=10)
    shop_acc.done()
    # вывеска-панель над витринами и дверью (UV 0..1, надпись рисует игра)
    sx0, sx1, sz0, sz1 = -8.9, 6.9, 3.45, 4.4
    box("sign_back", wood, sx0 - 0.1, sx1 + 0.1, YJ - 0.16, YJ + 0.02, sz0 - 0.1, sz1 + 0.1)
    box("sign_f", gold, sx0 - 0.1, sx1 + 0.1, YJ - 0.2, YJ - 0.14, sz0 - 0.1, sz0)
    box("sign_f", gold, sx0 - 0.1, sx1 + 0.1, YJ - 0.2, YJ - 0.14, sz1, sz1 + 0.1)
    box("sign_f", gold, sx0 - 0.1, sx0, YJ - 0.2, YJ - 0.14, sz0, sz1)
    box("sign_f", gold, sx1, sx1 + 0.1, YJ - 0.2, YJ - 0.14, sz0, sz1)
    quad("sign", sign, [(sx0, YJ - 0.17, sz0), (sx1, YJ - 0.17, sz0), (sx1, YJ - 0.17, sz1), (sx0, YJ - 0.17, sz1)], [(0, 0), (1, 0), (1, 1), (0, 1)])
    # мензоль: полоса над вывеской
    box("fascia_top", trim, XA - 0.12, XB + 0.12, YJ - 0.28, YJ + SL, ZF[0] - 0.18, ZF[0])
    box("fascia2", trim, XA, XB, YJ - 0.1, YJ + SL, 4.6, ZF[0] - 0.18)
    # маркиза: полосатый скат на рёбрах, боковые щёки, фестончатый волан
    ax0, ax1 = -9.0, 7.0
    ay0, ay1 = YJ - 0.22, YJ - 1.5
    az0, az1 = 3.3, 2.75
    n = int((ax1 - ax0) / 0.5)
    for i in range(n):
        xa_, xb_ = ax0 + i * (ax1 - ax0) / n, ax0 + (i + 1) * (ax1 - ax0) / n
        quad("awn", awn_a if i % 2 == 0 else awn_b, [(xa_, ay1, az1), (xb_, ay1, az1), (xb_, ay0, az0), (xa_, ay0, az0)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        # волан: вертикальная лента
        quad("awn", awn_a if i % 2 == 0 else awn_b, [(xa_, ay1, az1 - 0.28), (xb_, ay1, az1 - 0.28), (xb_, ay1, az1), (xa_, ay1, az1)], [(0, 0), (1, 0), (1, 1), (0, 1)])
        # фестон: треугольник под воланом
        tri_m = awn_a if i % 2 == 0 else awn_b
        bmt = bmesh.new()
        vs = [bmt.verts.new(p) for p in ((xa_, ay1, az1 - 0.28), (xb_, ay1, az1 - 0.28), ((xa_ + xb_) / 2, ay1, az1 - 0.45))]
        bmt.faces.new(vs)
        o_ = from_bm(bmt, "awn_scallop", tri_m)
        o_.data.polygons[0].flip() if o_.data.polygons[0].normal.y > 0 else None
    for xx in (ax0, ax1):  # боковые щёки маркизы (ткань видна с обеих сторон)
        cheek = [(xx, ay0, az0), (xx, ay1, az1), (xx, ay1, az1 - 0.28), (xx, ay0, az0 - 0.28)]
        quad("awn", awn_a, cheek, [(0, 0), (1, 0), (1, 1), (0, 1)])
        quad("awn", awn_a, cheek[::-1], [(0, 0), (1, 0), (1, 1), (0, 1)])
    for k in range(7):  # рёбра маркизы
        xx = ax0 + k * (ax1 - ax0) / 6
        tube("awn_rib", iron, [(xx, ay0, az0 - 0.02), (xx, ay1, az1 - 0.02)], 0.014, segs=4)
    box("awn_rail", iron, ax0, ax1, ay1 - 0.02, ay1 + 0.02, az1 - 0.3, az1 - 0.27)

    # верх и мансарда центрального дома
    uppers(XA, XB, YJ, 6, stone, 9, ZF)
    cornice(XA, XB, YJ, ZF[4])
    mansard(XA, XB, YJ, ZF[4] + 1.0, 6, 9)
    # башенка-вентиляция и труба слева
    for x_ in (XA + 0.15, XB - 0.15):
        cyl("pipe", iron, 0.06, ZF[4], loc=(x_, YJ - 0.1, ZF[4] / 2), segs=6)
    # охранная маркировка у арки (камера над воротами)

    dbg()
    root = finalize("jewelry")
    uv_all(root)
    jd.parent = root
    empty("jewelry_entry", (AXC + AR / 2 + 0.0, YJ - 0.9, 0.0), root)


# ====================== выгрузка ======================
if True:
    for o in bpy.context.scene.objects:  # треугольники по узлам и материалам
        if o.type == "MESH" and o.parent is not None and o.parent.parent is None:
            o.data.calc_loop_triangles()
            print("  ", o.name, len(o.data.loop_triangles))
    export("facades")
