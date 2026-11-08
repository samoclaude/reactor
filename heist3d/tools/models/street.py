# Улица для меню и сценок: особняк, ограда, ворота, фонари, деревья, кусты, урна, скамейка.
# Каждый предмет — свой узел в одном street.glb, игра расставляет копии сама.
# Камень и шифер получают UV «по метрам» (1 = 1 м), стёкла окон — свой квадрат 0..1 в атласе из 4 видов.
# Лицо особняка — к -Y (в игре +Z, к улице).
import sys, os, importlib, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
importlib.reload(common)
from common import *

reset()
random.seed(7)
stone = mat("stone", 0xc9b89a, 0.0, 0.85)  # песчаник: текстура в игре
trim = mat("trim", 0xe2d8c4, 0.0, 0.7)  # белёные карнизы, наличники, колонны
dark = mat("darkstone", 0x6e665a, 0.0, 0.9)  # цоколь, ступени
slate = mat("slate", 0x5b6068, 0.0, 0.8)  # шифер: текстура в игре
iron = mat("iron", 0x15171a, 0.6, 0.45)
frame = mat("frame", 0xd8d2c6, 0.0, 0.5)  # переплёты окон
wood = mat("wood", 0x2a1a10, 0.0, 0.6)
lit = mat("win_lit", 0xffd7a0, 0.0, 0.3, emit=0xffb060, emit_k=2.0)  # окна с картинкой комнаты (атлас в игре)
dk = mat("win_dark", 0x0a0f18, 0.3, 0.08)  # тёмные стёкла: отражают небо
lampg = mat("lamp_glass", 0xfff0c8, 0.0, 0.2, emit=0xffc070, emit_k=4.0)
brass = mat("brass", 0x8a6a30, 0.8, 0.35)
leaves = mat("leaves", 0x1c2a1a, 0.0, 0.95)
leaves2 = mat("leaves2", 0x24331c, 0.0, 0.95)
bark = mat("bark", 0x2a221c, 0.0, 0.95)
brick = mat("brick", 0x5a2e24, 0.0, 0.9)


def quad_uv(name, m, pts, uv):
    """Четырёхугольник с заданными UV (окна: своя клетка атласа)."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    lay = bm.loops.layers.uv.verify()
    for lo, (u, v) in zip(f.loops, uv):
        lo[lay].uv = (u, v)
    return from_bm(bm, name, m)


def boxuv(o, s=1.0):
    """UV по метрам: каждая грань проецируется по своей главной оси."""
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


def uv_textured(root):
    for o in root.children:
        if o.type == "MESH" and o.data.materials and o.data.materials[0].name in ("stone", "slate", "darkstone", "brick"):
            boxuv(o)


def noisy(o, amp, seed=1):
    """Неровная листва и кусты: сдвинуть вершины вдоль нормали случайно."""
    rnd = random.Random(seed)
    me = o.data
    for v in me.vertices:
        v.co += v.normal * (rnd.random() - 0.5) * 2 * amp


def blob(name, m, r, loc, sc=(1, 1, 1), amp=0.18, sub=2, seed=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bmesh.ops.scale(bm, vec=sc, verts=bm.verts)
    o = from_bm(bm, name, m, smooth=True, sharp=0)
    noisy(o, amp * r, seed)
    o.location = loc
    return o


# ======================= особняк =======================
W2 = 15.0  # полуширина
D = 12.0  # глубина
P = -0.8  # выступ центральной части (ризалит)
CX = 4.6  # полуширина ризалита
Z1, Z2, ZC, ZT = 0.9, 4.6, 8.4, 9.4  # цоколь, межэтажный пояс, карниз, верх балюстрады


def hrun(x0, x1, y, prof):
    """Горизонтальный профиль вдоль X на фасаде y: список (z0, z1, вынос)."""
    for (z0, z1, pr) in prof:
        box("hr", trim, x0 - pr, x1 + pr, y - pr, y + 0.3, z0, z1)


def yrun(y0, y1, x, side, prof):
    """То же вдоль Y (возврат профиля на торце ризалита), side = -1 левый, +1 правый."""
    for (z0, z1, pr) in prof:
        if side < 0:
            box("yr", trim, x - pr, x + 0.3, y0 - pr, y1, z0, z1)
        else:
            box("yr", trim, x - 0.3, x + pr, y0 - pr, y1, z0, z1)


CORNICE = [(ZC, ZC + 0.25, 0.12), (ZC + 0.25, ZC + 0.4, 0.22), (ZC + 0.4, ZC + 0.62, 0.45), (ZC + 0.62, ZC + 0.72, 0.55)]
BELT = [(Z2, Z2 + 0.22, 0.12), (Z2 + 0.22, Z2 + 0.3, 0.18)]
PLINTH = [(0, Z1 - 0.12, 0.14), (Z1 - 0.12, Z1, 0.2)]

# стены: крылья и ризалит
box("wall", stone, -W2, W2, 0, D, 0, ZC)
box("wall_c", stone, -CX, CX, P, 0.01, 0, ZC)
# цоколь, пояс, карниз — по крыльям и по ризалиту с возвратами
for x0, x1 in ((-W2, -CX), (CX, W2)):
    for prof, m in ((PLINTH, dark), (BELT, trim), (CORNICE, trim)):
        for (z0, z1, pr) in prof:
            box("prof", m, x0 - (pr if x0 == -W2 else 0), x1 + (pr if x1 == W2 else 0), -pr, 0.3, z0, z1)
for prof, m in ((PLINTH, dark), (BELT, trim), (CORNICE, trim)):
    for (z0, z1, pr) in prof:
        box("prof_c", m, -CX - pr, CX + pr, P - pr, 0.0, z0, z1)
# сухарики под карнизом
for x in [i * 0.35 for i in range(-43, 44)]:
    if abs(x) < CX + 0.4 and abs(x) > CX - 0.2:
        continue
    y = P if abs(x) < CX else 0
    box("dentil", trim, x - 0.08, x + 0.08, y - 0.36, y - 0.2, ZC + 0.26, ZC + 0.4)
# боковые торцы: карниз и цоколь вокруг
for sx in (-1, 1):
    for prof, m in ((PLINTH, dark), (BELT, trim), (CORNICE, trim)):
        for (z0, z1, pr) in prof:
            if sx < 0:
                box("prof_s", m, -W2 - pr, -W2 + 0.3, 0, D, z0, z1)
            else:
                box("prof_s", m, W2 - 0.3, W2 + pr, 0, D, z0, z1)
# руст на углах (чередующиеся камни)
for xc, y in ((-W2, 0), (W2, 0), (-CX, P), (CX, P)):
    for k in range(int((ZC - Z1) / 0.45)):
        z = Z1 + k * 0.45
        if Z2 - 0.05 < z + 0.45 and z < Z2 + 0.3:
            continue
        L = 0.75 if k % 2 else 0.5
        sx = 1 if xc < 0 else -1
        box("quoin", trim, min(xc, xc + sx * L), max(xc, xc + sx * L), y - 0.06, y + 0.2, z + 0.03, z + 0.42)
# балюстрада над карнизом крыльев и ризалита
ZB = ZC + 0.72


def balustrade(x0, x1, y):
    box("bal_base", trim, x0, x1, y - 0.25, y + 0.25, ZB, ZB + 0.16)
    box("bal_rail", trim, x0, x1, y - 0.28, y + 0.28, ZT - 0.14, ZT)
    n = int((x1 - x0) / 0.3)
    for i in range(n):
        x = x0 + (i + 0.5) * (x1 - x0) / n
        lathe("baluster", trim, [(0.07, 0), (0.07, 0.05), (0.05, 0.08), (0.1, 0.22), (0.05, 0.4), (0.07, 0.48), (0.07, 0.52)], segs=8,
              loc=(x, y, ZB + 0.16), sharp=0)
    for x in (x0, x1):
        box("bal_post", trim, x - 0.2, x + 0.2, y - 0.3, y + 0.3, ZB, ZT + 0.06)


for x0, x1 in ((-W2 + 0.2, -CX - 0.4), (CX + 0.4, W2 - 0.2)):
    balustrade(x0, x1, 0.25)
# вазы на столбиках балюстрады по краям
for x in (-W2 + 0.2, W2 - 0.2):
    lathe("urn", trim, [(0.0, 0), (0.18, 0), (0.12, 0.1), (0.26, 0.3), (0.2, 0.5), (0.1, 0.55), (0.14, 0.6), (0.0, 0.62)], segs=12,
          loc=(x, 0.25, ZT + 0.06))


def window(x, y, z0, w, h, head, lit_k, mull=True, arch=False):
    """Окно на фасаде y: наличник, подоконник, верх (карниз, фронтон или замок), стекло и переплёт."""
    f = 0.16
    # наличник
    box("arch_l", trim, x - w / 2 - f, x - w / 2, y - 0.12, y + 0.02, z0, z0 + h)
    box("arch_r", trim, x + w / 2, x + w / 2 + f, y - 0.12, y + 0.02, z0, z0 + h)
    box("arch_t", trim, x - w / 2 - f, x + w / 2 + f, y - 0.12, y + 0.02, z0 + h, z0 + h + f)
    # подоконник с кронштейнами
    box("sill", trim, x - w / 2 - 0.28, x + w / 2 + 0.28, y - 0.24, y + 0.02, z0 - 0.12, z0)
    for sx in (-1, 1):
        box("bracket", trim, x + sx * (w / 2 + 0.05) - 0.07, x + sx * (w / 2 + 0.05) + 0.07, y - 0.14, y, z0 - 0.34, z0 - 0.12)
    zt = z0 + h + f
    if head == "cornice":
        box("whead", trim, x - w / 2 - 0.35, x + w / 2 + 0.35, y - 0.3, y + 0.02, zt + 0.1, zt + 0.24)
        box("wfrieze", trim, x - w / 2 - f, x + w / 2 + f, y - 0.14, y + 0.02, zt, zt + 0.1)
    elif head == "ped":
        box("wfrieze", trim, x - w / 2 - f, x + w / 2 + f, y - 0.14, y + 0.02, zt, zt + 0.12)
        hw = w / 2 + 0.35
        # контур в плоскости XZ: после поворота глубина z переходит в y = -z
        extrude_outline("wped", trim, [(x - hw, zt + 0.12), (x + hw, zt + 0.12), (x, zt + 0.62)], -(y + 0.02), -(y - 0.3), plane="XZ")
    elif head == "key":
        box("keystone", trim, x - 0.14, x + 0.14, y - 0.16, y + 0.02, zt - 0.2, zt + 0.22)
    # стекло: своя клетка атласа (4 вида комнат) или тёмное
    gy = y - 0.015
    if lit_k is not None:
        u0, u1 = lit_k / 4.0, (lit_k + 1) / 4.0
        quad_uv("glass", lit, [(x - w / 2, gy, z0), (x + w / 2, gy, z0), (x + w / 2, gy, z0 + h), (x - w / 2, gy, z0 + h)],
                [(u0, 0), (u1, 0), (u1, 1), (u0, 1)])
    else:
        quad_uv("glass", dk, [(x - w / 2, gy, z0), (x + w / 2, gy, z0), (x + w / 2, gy, z0 + h), (x - w / 2, gy, z0 + h)],
                [(0, 0), (1, 0), (1, 1), (0, 1)])
    if mull:
        t = 0.045
        box("mull", frame, x - t / 2, x + t / 2, gy - 0.04, gy, z0, z0 + h)
        for k in (1, 2):
            zz = z0 + h * k / 3
            box("mull", frame, x - w / 2, x + w / 2, gy - 0.04, gy, zz - t / 2, zz + t / 2)
        for sx in (-1, 1):
            box("mull", frame, x + sx * w / 2 - t / 2 * sx - t / 2, x + sx * w / 2 - t / 2 * sx + t / 2, gy - 0.04, gy, z0, z0 + h)


# какие окна горят: (этаж, x) -> клетка атласа
LIT = {(0, -11.2): 0, (0, 8.7): 1, (1, -6.2): 2, (1, 13.7): 3, (1, 0.0): 1, (0, 2.7): 3, (1, -13.7): 0, (0, -6.2): 3, (1, 8.7): 0, (0, 13.7): 2}
for fl, z0, h, head in ((0, 1.6, 2.5, "key"), (1, 5.4, 2.3, None)):
    for xs in (6.2, 8.7, 11.2, 13.7):
        for sx in (-1, 1):
            x = xs * sx
            hd = head or ("ped" if xs in (8.7, 13.7) else "cornice")
            window(x, 0, z0, 1.25, h, hd, LIT.get((fl, x)))
    xs_c = (-2.7, 2.7) if fl == 0 else (-2.7, 0.0, 2.7)
    for x in xs_c:
        window(x, P, z0, 1.25, h, "cornice" if fl else "key", LIT.get((fl, x)))
# пилястры между окнами крыльев
for sx in (-1, 1):
    for xs in (7.45, 9.95, 12.45):
        x = xs * sx
        for z0, z1 in ((Z1, Z2), (Z2 + 0.3, ZC)):
            box("pilaster", trim, x - 0.24, x + 0.24, -0.08, 0.02, z0 + 0.2, z1 - 0.25)
            box("pil_base", trim, x - 0.3, x + 0.3, -0.12, 0.02, z0, z0 + 0.2)
            box("pil_cap", trim, x - 0.32, x + 0.32, -0.14, 0.02, z1 - 0.25, z1)
# балкончик у среднего окна второго этажа
box("balc", trim, -1.2, 1.2, P - 0.6, P, 5.15, 5.3)
for i in range(13):
    x = -1.1 + i * 2.2 / 12
    box("balc_bar", iron, x - 0.012, x + 0.012, P - 0.56, P - 0.53, 5.3, 6.15)
box("balc_rail", iron, -1.15, 1.15, P - 0.58, P - 0.5, 6.12, 6.18)
for sx in (-1, 1):
    box("balc_side", iron, sx * 1.12 - 0.02, sx * 1.12 + 0.02, P - 0.58, P, 6.12, 6.18)

# портик: ступени, площадка, 4 колонны, антаблемент, фронтон с круглым окном
PY = P - 3.0  # передний край портика
for k in range(6):
    box("step", dark, -5.4 + k * 0.08, 5.4 - k * 0.08, PY - 1.4 + k * 0.24, P, k * 0.2, k * 0.2 + 0.2)
box("podium", dark, -5.0, 5.0, PY, P, 0, 1.2)
ZK0, ZK1 = 1.2, 7.9  # низ и верх колонн
for x in (-4.0, -1.35, 1.35, 4.0):
    y = PY + 0.55
    box("plinth", trim, x - 0.48, x + 0.48, y - 0.48, y + 0.48, ZK0, ZK0 + 0.18)
    lathe("col_base", trim, [(0.46, 0), (0.46, 0.08), (0.4, 0.14), (0.42, 0.2), (0.38, 0.26)], segs=20, loc=(x, y, ZK0 + 0.18), sharp=60)
    n = 9
    prof = [(0.38 - 0.06 * (k / n) ** 1.6, 0.26 + k * (ZK1 - ZK0 - 1.05) / n) for k in range(n + 1)]
    lathe("col_shaft", trim, prof, segs=20, loc=(x, y, ZK0 + 0.18), sharp=60)
    lathe("col_cap", trim, [(0.33, 0), (0.36, 0.06), (0.33, 0.1), (0.38, 0.22), (0.46, 0.36)], segs=20,
          loc=(x, y, ZK1 - 0.64), sharp=60)
    box("abacus", trim, x - 0.52, x + 0.52, y - 0.52, y + 0.52, ZK1 - 0.28, ZK1 - 0.1)
    for sx in (-1, 1):
        torus("volute", trim, 0.11, 0.045, loc=(x + sx * 0.42, y - 0.42, ZK1 - 0.38), rot=(90, 0, 0), seg=14, rseg=6)
        torus("volute", trim, 0.11, 0.045, loc=(x + sx * 0.42, y + 0.42, ZK1 - 0.38), rot=(90, 0, 0), seg=14, rseg=6)
# антаблемент портика
box("archi", trim, -4.7, 4.7, PY - 0.05, P, ZK1 - 0.1, ZK1 + 0.35)
box("frieze", trim, -4.65, 4.65, PY, P, ZK1 + 0.35, ZK1 + 0.8)
box("corona", trim, -5.0, 5.0, PY - 0.35, P, ZK1 + 0.8, ZK1 + 1.0)
for i in range(27):
    x = -4.55 + i * 0.35
    box("dentil", trim, x - 0.08, x + 0.08, PY - 0.24, PY, ZK1 + 0.62, ZK1 + 0.78)
# фронтон: треугольник, наклонные карнизы
ZP = ZK1 + 1.0
extrude_outline("tympanum", trim, [(-4.7, ZP), (4.7, ZP), (0, ZP + 2.0)], -P, -(PY + 0.05), plane="XZ")
for sx in (-1, 1):
    L = math.hypot(5.15, 2.2)
    ang = math.atan2(2.2, 5.15)
    b = box("rake", trim, -L / 2, L / 2, PY - 0.4, P, -0.12, 0.12)
    b.location = (sx * 5.15 / 2, (PY - 0.4 + P) / 2, ZP + 1.1)
    b.rotation_euler = Euler((0, ang * sx, 0))
# круглое окно в тимпане (горит)
torus("oculus_ring", trim, 0.42, 0.07, loc=(0, PY - 0.06, ZP + 0.85), rot=(90, 0, 0), seg=24, rseg=6)
bm = bmesh.new()
lay = bm.loops.layers.uv.verify()
c = bm.verts.new((0, PY - 0.02, ZP + 0.85))
ring = [bm.verts.new((0.4 * math.cos(a), PY - 0.02, ZP + 0.85 + 0.4 * math.sin(a))) for a in [i * 2 * math.pi / 20 for i in range(20)]]
for i in range(20):
    f = bm.faces.new((c, ring[i], ring[(i + 1) % 20]))
    for lo in f.loops:
        p = lo.vert.co
        lo[lay].uv = (0.25 + (p.x / 0.4) * 0.1, 0.55 + ((p.z - ZP - 0.85) / 0.4) * 0.1)
from_bm(bm, "oculus", lit)
# потолок портика
box("portico_ceil", trim, -4.7, 4.7, PY, P, ZK1 - 0.12, ZK1 - 0.1)
# парадная дверь: створки с филёнками, наличник, полукруглая фрамуга (горит)
DW, DH = 1.9, 3.2
box("door_sur", trim, -DW / 2 - 0.25, DW / 2 + 0.25, P - 0.14, P + 0.01, ZK0, ZK0 + DH + 1.25)
box("door_leaf", wood, -DW / 2, DW / 2, P - 0.16, P - 0.12, ZK0, ZK0 + DH)
for sx in (-1, 1):
    for z0, z1 in ((0.25, 1.2), (1.45, 3.0)):
        box("door_panel", wood, sx * DW / 4 - 0.32, sx * DW / 4 + 0.32, P - 0.2, P - 0.16, ZK0 + z0, ZK0 + z1)
    sphere("knob", brass, 0.05, loc=(sx * 0.12, P - 0.24, ZK0 + 1.5))
box("door_split", wood, -0.02, 0.02, P - 0.2, P - 0.16, ZK0, ZK0 + DH)
bm = bmesh.new()
lay = bm.loops.layers.uv.verify()
zc = ZK0 + DH + 0.05
c = bm.verts.new((0, P - 0.15, zc))
arc = [bm.verts.new((DW / 2 * math.cos(a), P - 0.15, zc + DW / 2 * math.sin(a))) for a in [math.pi * i / 16 for i in range(17)]]
for i in range(16):
    f = bm.faces.new((c, arc[i], arc[i + 1]))
    for lo in f.loops:
        p = lo.vert.co
        lo[lay].uv = (0.5 + 0.2 * p.x / DW, 0.3 + 0.2 * (p.z - zc) / DW)
from_bm(bm, "fanlight", lit)
for i in range(1, 8):
    a = math.pi * i / 8
    tube("fan_bar", frame, [(0, P - 0.17, zc), (DW / 2 * math.cos(a), P - 0.17, zc + DW / 2 * math.sin(a))], 0.015, segs=4)
# фонари по сторонам двери
for sx in (-1, 1):
    x = sx * 1.75
    box("sconce_arm", iron, x - 0.03, x + 0.03, P - 0.45, P - 0.12, ZK0 + 2.55, ZK0 + 2.6)
    lathe("sconce", lampg, [(0.0, 0), (0.1, 0.02), (0.14, 0.25), (0.1, 0.42), (0.0, 0.44)], segs=6, loc=(x, P - 0.45, ZK0 + 2.25), sharp=10)
    lathe("sconce_cap", iron, [(0.16, 0), (0.08, 0.1), (0.02, 0.2), (0.0, 0.22)], segs=6, loc=(x, P - 0.45, ZK0 + 2.66))

# мансарда: шифер, слуховые окна, трубы
R0 = (W2 - 0.4, 0.5, D - 0.5, ZT - 0.2)
R1 = (W2 - 1.5, 1.6, D - 1.6, 12.0)
R2 = (W2 - 5.0, 5.8, D - 5.8, 13.0)
bm = bmesh.new()
rings = []
for (hx, y0, y1, z) in (R0, R1, R2):
    rings.append([bm.verts.new(p) for p in ((-hx, y0, z), (hx, y0, z), (hx, y1, z), (-hx, y1, z))])
for i in range(2):
    a, b = rings[i], rings[i + 1]
    for j in range(4):
        bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
bm.faces.new(rings[2])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
from_bm(bm, "roof", slate)
# конёк и ребро
box("ridge", iron, -R2[0], R2[0], R2[1] - 0.05, R2[2] + 0.05, R2[3], R2[3] + 0.08)
# слуховые окна на нижнем скате
for sx in (-1, 1):
    for xs in (6.2, 9.95, 13.0):
        x = xs * sx
        y0 = 1.0
        box("dormer", stone, x - 0.7, x + 0.7, y0, y0 + 1.6, ZT - 0.1, ZT + 1.8)
        box("dormer_trim", trim, x - 0.8, x + 0.8, y0 - 0.08, y0 + 0.05, ZT + 1.7, ZT + 1.85)
        # полукруглый верх
        cyl("dormer_roof", slate, 0.82, 1.7, loc=(x, y0 + 0.82, ZT + 1.85), rot=(90, 0, 0), segs=14)
        lk = 2 if (xs == 9.95 and sx > 0) else None
        window(x, y0, ZT + 0.2, 0.8, 1.25, None, lk, mull=True)
# трубы
for x, y in ((-8.2, 6.0), (8.2, 6.0), (-12.6, 8.5), (12.6, 8.5)):
    box("chimney", brick, x - 0.5, x + 0.5, y - 0.35, y + 0.35, 10.5, 14.2)
    box("chim_cap", trim, x - 0.6, x + 0.6, y - 0.45, y + 0.45, 14.2, 14.4)
    for dx in (-0.22, 0.22):
        cyl("pot", brick, 0.12, 0.45, loc=(x + dx, y, 14.62), segs=8)
# боковые фасады: тёмные окна
for sx in (-1, 1):
    for z0 in (1.6, 5.4):
        for y in (3.0, 6.0, 9.0):
            xw = sx * (W2 + 0.015)
            pts = [(xw, y - 0.6, z0), (xw, y + 0.6, z0), (xw, y + 0.6, z0 + 2.2), (xw, y - 0.6, z0 + 2.2)]
            if sx < 0:  # стекло одностороннее: лицом наружу
                pts = [pts[1], pts[0], pts[3], pts[2]]
            quad_uv("glass_s", dk, pts, [(0, 0), (1, 0), (1, 1), (0, 1)])
            box("sframe", trim, xw - 0.1, xw + 0.1, y - 0.75, y + 0.75, z0 - 0.15, z0)
            box("sframe", trim, xw - 0.1, xw + 0.1, y - 0.75, y + 0.75, z0 + 2.2, z0 + 2.4)
root = finalize("mansion")
uv_textured(root)

# ======================= ограда =======================
# пролёт 3 м: каменный цоколь, прутья с пиками, две перекладины; начало — середина пролёта
BW = 3.0
box("fwall", stone, -BW / 2, BW / 2, -0.22, 0.22, 0, 0.55)
box("fwall_cap", trim, -BW / 2, BW / 2, -0.27, 0.27, 0.55, 0.63)
n = 22
for i in range(n):
    x = -BW / 2 + (i + 0.5) * BW / n
    box("bar", iron, x - 0.014, x + 0.014, -0.014, 0.014, 0.63, 2.05)
    cyl("spike", iron, 0.03, 0.14, loc=(x, 0, 2.12), segs=4, r2=0.0, smooth=False)
for z in (0.75, 1.82):
    box("rail", iron, -BW / 2, BW / 2, -0.025, 0.025, z, z + 0.05)
# кольца между перекладинами наверху
for i in range(0, n, 2):
    x = -BW / 2 + (i + 1) * BW / n
    torus("ring", iron, 0.055, 0.009, loc=(x, 0, 1.7), rot=(90, 0, 0), seg=10, rseg=4)
root = finalize("fence_bay")
uv_textured(root)

# столб ограды
box("pier", stone, -0.32, 0.32, -0.32, 0.32, 0, 2.3)
box("pier_base", dark, -0.38, 0.38, -0.38, 0.38, 0, 0.5)
box("pier_cap", trim, -0.42, 0.42, -0.42, 0.42, 2.3, 2.45)
box("pier_cap2", trim, -0.36, 0.36, -0.36, 0.36, 2.45, 2.52)
sphere("pier_ball", trim, 0.2, loc=(0, 0, 2.74), segs=12, rings=8)
root = finalize("pier")
uv_textured(root)

# столб ворот с фонарём наверху
box("gpier", stone, -0.45, 0.45, -0.45, 0.45, 0, 3.0)
box("gpier_base", dark, -0.52, 0.52, -0.52, 0.52, 0, 0.6)
box("gpier_band", trim, -0.5, 0.5, -0.5, 0.5, 2.0, 2.12)
box("gpier_cap", trim, -0.58, 0.58, -0.58, 0.58, 3.0, 3.18)
box("gpier_cap2", trim, -0.48, 0.48, -0.48, 0.48, 3.18, 3.26)
lathe("gl_base", iron, [(0.14, 0), (0.1, 0.06), (0.06, 0.12)], segs=8, loc=(0, 0, 3.26))
for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
    box("gl_post", iron, sx * 0.16 - 0.015, sx * 0.16 + 0.015, sy * 0.16 - 0.015, sy * 0.16 + 0.015, 3.38, 3.95)
lathe("gl_glass", lampg, [(0.0, 0), (0.15, 0.0), (0.18, 0.5), (0.0, 0.5)], segs=4, loc=(0, 0, 3.42), sharp=10)
lathe("gl_roof", iron, [(0.26, 0), (0.2, 0.08), (0.06, 0.22), (0.03, 0.3), (0.0, 0.34)], segs=4, loc=(0, 0, 3.93))
root = finalize("gate_pier")
uv_textured(root)

# створка ворот: прутья, перекладины, дуга с завитками; петля — у x=0, створка тянется в +X
GW, GH = 1.6, 2.4
n = 11
for i in range(n):
    x = (i + 0.5) * GW / n
    top = GH + 0.5 * (x / GW) ** 1.5  # к середине ворот прутья выше
    box("gbar", iron, x - 0.016, x + 0.016, -0.016, 0.016, 0.15, top)
    cyl("gspike", iron, 0.035, 0.16, loc=(x, 0, top + 0.08), segs=4, r2=0.0, smooth=False)
for z in (0.15, 0.3, 1.0, GH - 0.25):
    box("grail", iron, 0, GW, -0.03, 0.03, z, z + 0.06)
box("gstile", iron, 0, 0.06, -0.035, 0.035, 0.1, GH + 0.1)
box("gstile2", iron, GW - 0.06, GW, -0.035, 0.035, 0.1, GH + 0.55)
for i in range(3):
    x = 0.3 + i * 0.5
    torus("scroll", iron, 0.16, 0.014, loc=(x, 0, 1.55), rot=(90, 0, 0), seg=14, rseg=4, arc=270)
    torus("scroll", iron, 0.09, 0.012, loc=(x + 0.12, 0, 1.33), rot=(90, 0, 180), seg=12, rseg=4, arc=270)
finalize("gate_leaf")

# фонарный столб (как в старом городе): основание, ствол, перекладина, фонарь
lathe("lp_base", iron, [(0.24, 0), (0.24, 0.12), (0.16, 0.2), (0.17, 0.5), (0.1, 0.62), (0.11, 0.8), (0.075, 0.9)], segs=10, loc=(0, 0, 0))
cyl("lp_shaft", iron, 0.06, 2.9, loc=(0, 0, 2.3), segs=8, r2=0.045)
for z in (1.6, 3.2):
    lathe("lp_collar", iron, [(0.06, 0), (0.08, 0.04), (0.06, 0.08)], segs=8, loc=(0, 0, z))
box("lp_ladder", iron, -0.32, 0.32, -0.02, 0.02, 3.55, 3.6)
for sx in (-1, 1):
    sphere("lp_ball", iron, 0.035, loc=(sx * 0.33, 0, 3.575), segs=6, rings=4)
lathe("lp_holder", iron, [(0.05, 0), (0.12, 0.08), (0.14, 0.12)], segs=8, loc=(0, 0, 3.75))
for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
    tube("lp_post", iron, [(sx * 0.12, sy * 0.12, 3.86), (sx * 0.2, sy * 0.2, 4.45)], 0.012, segs=4)
lathe("lp_glass", lampg, [(0.0, 0), (0.12, 0), (0.2, 0.58), (0.0, 0.58)], segs=4, loc=(0, 0, 3.87), sharp=10)
lathe("lp_roof", iron, [(0.3, 0), (0.26, 0.05), (0.1, 0.2), (0.05, 0.28), (0.07, 0.34), (0.0, 0.42)], segs=4, loc=(0, 0, 4.45))
root = finalize("lamppost")
for o in root.children:
    o.rotation_euler = Euler((0, 0, math.radians(45)))

# урна
lathe("bin", iron, [(0.0, 0.02), (0.2, 0.02), (0.24, 0.1), (0.25, 0.85), (0.27, 0.88), (0.24, 0.92), (0.0, 0.92)], segs=14, loc=(0, 0, 0))
for z in (0.25, 0.6):
    torus("bin_band", iron, 0.255, 0.015, loc=(0, 0, z), seg=14, rseg=4)
finalize("bin")

# скамейка: чугунные боковины, деревянные рейки
for sx in (-1, 1):
    tube("bside", iron, [(sx * 0.75, -0.25, 0), (sx * 0.75, -0.2, 0.42), (sx * 0.75, 0.25, 0.45), (sx * 0.75, 0.3, 0.9)], 0.03, segs=5)
    tube("bleg", iron, [(sx * 0.75, 0.25, 0), (sx * 0.75, 0.22, 0.42)], 0.03, segs=5)
for k in range(4):
    box("bslat", wood, -0.85, 0.85, -0.22 + k * 0.12, -0.13 + k * 0.12, 0.42, 0.46)
for k in range(3):
    zb = 0.55 + k * 0.12
    box("bslat", wood, -0.85, 0.85, 0.27 + k * 0.012, 0.3 + k * 0.012, zb, zb + 0.08)
finalize("bench")

# пожарный гидрант
lathe("hydrant", mat("hyd", 0x7a1712, 0.3, 0.5),
      [(0.0, 0), (0.16, 0), (0.16, 0.06), (0.11, 0.1), (0.11, 0.6), (0.13, 0.64), (0.12, 0.7), (0.07, 0.8), (0.0, 0.82)], segs=12)
for sx in (-1, 1):
    cyl("hyd_cap", mat("hyd", 0, 0, 0), 0.05, 0.12, loc=(sx * 0.13, 0, 0.48), rot=(0, 90, 0), segs=8)
finalize("hydrant")

# дерево: ствол с ветками и кроны-облака
tube("trunk", bark, [(0, 0, 0), (0.05, 0, 1.5), (0.1, 0.05, 3.0), (0.0, 0.1, 4.6)], [0.3, 0.24, 0.18, 0.1], segs=7)
for a, z, L in ((30, 2.4, 1.8), (150, 2.9, 1.7), (260, 3.3, 1.5), (90, 3.8, 1.2)):
    r = math.radians(a)
    tube("branch", bark, [(0, 0, z), (math.cos(r) * L * 0.6, math.sin(r) * L * 0.6, z + 0.7), (math.cos(r) * L, math.sin(r) * L, z + 1.4)], [0.1, 0.07, 0.04], segs=5)
for (x, y, z, r, s) in ((0, 0, 5.2, 2.0, 1), (1.3, 0.4, 4.4, 1.5, 2), (-1.2, 0.3, 4.6, 1.6, 3), (0.2, -1.1, 4.5, 1.4, 4), (-0.3, 1.2, 4.9, 1.4, 5),
                        (0.6, 0.2, 6.2, 1.3, 6), (1.6, -0.6, 3.6, 0.9, 7), (-1.5, -0.7, 3.8, 1.0, 8)):
    blob("crown", leaves if s % 2 else leaves2, r, (x, y, z), sc=(1, 1, 0.8), amp=0.22, sub=2, seed=s)
finalize("tree")

# кипарис: высокий узкий
tube("ctrunk", bark, [(0, 0, 0), (0, 0, 1.0)], [0.15, 0.12], segs=6)
for k, (z, r) in enumerate(((1.6, 0.9), (2.6, 0.95), (3.6, 0.85), (4.5, 0.7), (5.3, 0.5), (5.9, 0.3))):
    blob("cyp", leaves2, r, (0, 0, z), sc=(1, 1, 1.3), amp=0.2, sub=2, seed=20 + k)
finalize("cypress")

# живая изгородь: пролёт 3 м
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(3.0, 1.0, 1.5), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0, 0, 0.75), verts=bm.verts)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
h = from_bm(bm, "hedge", leaves, smooth=True, sharp=0)
noisy(h, 0.08, 31)
finalize("hedge")

# стрижка в вазоне у входа
lathe("planter", trim, [(0.0, 0), (0.32, 0), (0.28, 0.1), (0.38, 0.55), (0.42, 0.62), (0.0, 0.62)], segs=12)
blob("topi", leaves2, 0.5, (0, 0, 1.1), sc=(1, 1, 1.0), amp=0.12, sub=2, seed=41)
blob("topi", leaves2, 0.36, (0, 0, 1.75), sc=(1, 1, 1.0), amp=0.12, sub=2, seed=42)
blob("topi", leaves2, 0.24, (0, 0, 2.2), sc=(1, 1, 1.0), amp=0.12, sub=2, seed=43)
finalize("topiary")

export("street")
