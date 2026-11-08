# Роскошные предметы для ювелирного дома и музея: витрина, колье, корона, павлин, весы,
# стол ювелира, телескоп, маски, глобус. Лицо — к -Y, зад у стены (y = 0), низ на полу (z = 0).
# Запуск: OUT=<папка> blender -b --factory-startup --python tools/models/props_luxe.py
# Одну модель можно собрать так: ONLY=crown OUT=... blender ...
import sys, os, importlib, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
importlib.reload(common)
from common import *

random.seed(11)

# ---------- общие материалы ----------
def M_gold():     return mat("gold", 0xd9a93a, 1.0, 0.28)
def M_brass():    return mat("brass", 0xc09650, 1.0, 0.33)
def M_plat():     return mat("platinum", 0xd6d8da, 1.0, 0.25)
def M_lacq():     return mat("lacquer", 0x17110e, 0.0, 0.3)
def M_lacq2():    return mat("lacquer_inset", 0x0d0908, 0.0, 0.32)
def M_navy():     return mat("velvet_navy", 0x0f2050, 0.0, 0.95)
def M_scarlet():  return mat("velvet_red", 0x8a0f1e, 0.0, 0.95)
def M_glass(n):   return mat(n, 0xbfd6e2, 0.0, 0.05)
def M_gem():      return mat("glow_gem", 0x4f8cff, 0.0, 0.15, emit=0x2455d0, emit_k=0.6)
def M_gem_red():  return mat("glow_gem_red", 0xd01c34, 0.0, 0.15, emit=0xd0102a, emit_k=0.6)
def M_gem_white():return mat("glow_gem_white", 0xe8f2ff, 0.0, 0.1, emit=0xcfe4ff, emit_k=0.6)
def M_gem_green():return mat("glow_gem_green", 0x1fbf6a, 0.0, 0.15, emit=0x0a7a3a, emit_k=0.35)


def lathe_open(name, m, prof, segs=24, loc=(0, 0, 0), rot=(0, 0, 0), sharp=30, close=False):
    """Как lathe, но без крышек: для колпаков, колец и полых деталей (close — замкнуть профиль)."""
    bm = bmesh.new()
    rings = []
    for (r, z) in prof:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / segs), r * math.sin(2 * math.pi * j / segs), z)) for j in range(segs)])
    n = len(rings)
    for i in range(n - 1 + (1 if close else 0)):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(segs):
            bm.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return place(from_bm(bm, name, m, smooth=True, sharp=sharp), loc, rot)


def gem(name, m, r, loc, rot=(0, 0, 0), segs=8, h=1.0):
    """Огранённый камень: остриё вниз, площадка сверху."""
    prof = [(0, -0.75 * r * h), (0.95 * r, 0.0), (0.95 * r, 0.08 * r), (0.6 * r, 0.3 * r * h)]
    return lathe(name, m, prof, segs=segs, loc=loc, rot=rot, sharp=10)


def plate(name, m, pts, th, rho, ang, z, tilt=0.0, scale=1.0):
    """Плоская деталь по контуру (u вбок, v вверх) на цилиндре радиуса rho под углом ang (град);
    tilt — наклон наружу (на единицу высоты)."""
    a = math.radians(ang)
    n = Vector((math.cos(a), math.sin(a), 0))
    tg = Vector((-math.sin(a), math.cos(a), 0))
    bm = bmesh.new()
    fr, bk = [], []
    for (u, v) in pts:
        u, v = u * scale, v * scale
        base = n * (rho + v * tilt) + tg * u + Vector((0, 0, z + v))
        fr.append(bm.verts.new(base + n * th / 2))
        bk.append(bm.verts.new(base - n * th / 2))
    bm.faces.new(fr)
    bm.faces.new(list(reversed(bk)))
    k = len(pts)
    for i in range(k):
        bm.faces.new((fr[i], bk[i], bk[(i + 1) % k], fr[(i + 1) % k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(bm, name, m, smooth=False)


def wedge(name, m, pts_yz, x0, x1):
    """Призма: контур в плоскости YZ выдавлен по X от x0 до x1."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for (y, z) in pts_yz]
    b = [bm.verts.new((x1, y, z)) for (y, z) in pts_yz]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    k = len(a)
    for i in range(k):
        bm.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(bm, name, m)


def path_tube(name, m, pts, r, segs=6):
    return tube(name, m, pts, r, segs=segs)


def arc_pts(c, r_x, r_y, a0, a1, n, z_fn=None):
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        z = z_fn(a) if z_fn else c[2]
        out.append((c[0] + r_x * math.cos(a), c[1] + r_y * math.sin(a), z))
    return out


# =====================================================================
# витрина-прилавок: 1,3 x 0,55 x 1,05 м
# =====================================================================
def showcase():
    lacq, lacq2, brass, navy = M_lacq(), M_lacq2(), M_brass(), M_navy()
    gold, plat = M_gold(), M_plat()
    glass = M_glass("glass_case")
    led = mat("led", 0xfff1d6, 0.0, 0.4, emit=0xffe9c4, emit_k=3.0)
    W, D = 0.65, 0.55   # полуширина, глубина
    # цоколь, тумба
    box("kick", brass, -W + 0.03, W - 0.03, -D + 0.03, -0.0, 0.0, 0.06, 0.004, 1)
    box("body", lacq, -W, W, -D, 0.0, 0.06, 0.73, 0.008, 2)
    # накладные филёнки на лицевой стороне: две секции
    for sx in (-1, 1):
        x0, x1 = (-W + 0.05, -0.02) if sx < 0 else (0.02, W - 0.05)
        box("fil", lacq2, x0, x1, -D - 0.008, -D + 0.01, 0.12, 0.67, 0.006, 2)
        # латунная рамка филёнки (четыре тонких бруска)
        t = 0.008
        box("fr_t", brass, x0 - t, x1 + t, -D - 0.011, -D, 0.67, 0.67 + t, 0.0012, 1)
        box("fr_b", brass, x0 - t, x1 + t, -D - 0.011, -D, 0.12 - t, 0.12, 0.0012, 1)
        box("fr_l", brass, x0 - t, x0, -D - 0.011, -D, 0.12, 0.67, 0.0012, 1)
        box("fr_r", brass, x1, x1 + t, -D - 0.011, -D, 0.12, 0.67, 0.0012, 1)
        # ручка-планка ближе к центру
        hx = sx * 0.07
        for zz in (0.40, 0.50):
            cyl("knobpost", brass, 0.005, 0.03, loc=(hx, -D - 0.024, zz), rot=(90, 0, 0), segs=8)
        cyl("handle", brass, 0.0065, 0.2, loc=(hx, -D - 0.038, 0.45), rot=(0, 0, 0), segs=10)
        sphere("hend", brass, 0.0085, (hx, -D - 0.038, 0.55), segs=10, rings=6)
        sphere("hend", brass, 0.0085, (hx, -D - 0.038, 0.35), segs=10, rings=6)
    # замочная скважина в центре
    box("lockplate", brass, -0.018, 0.018, -D - 0.014, -D - 0.006, 0.60, 0.65, 0.003, 1)
    cyl("keyhole", lacq2, 0.004, 0.003, loc=(0, -D - 0.0165, 0.63), rot=(90, 0, 0), segs=8)
    # латунный пояс под стеклом
    box("band", brass, -W - 0.015, W + 0.015, -D - 0.015, 0.012, 0.73, 0.78, 0.006, 2)
    box("bandline", lacq, -W - 0.005, W + 0.005, -D - 0.022, 0.0, 0.745, 0.76, 0.003, 1)
    # стеклянный короб
    gz0, gz1 = 0.78, 1.015
    box("glass", glass, -W + 0.01, W - 0.01, -D + 0.012, -0.012, gz0, 1.045)
    # стойки и верхняя рама
    for sx in (-1, 1):
        for yy in (-D + 0.012, -0.012):
            box("post", brass, sx * (W - 0.01) - 0.01, sx * (W - 0.01) + 0.01, yy - 0.01, yy + 0.01, gz0, gz1 + 0.005, 0.002, 1)
    # верхняя рама — четыре планки вокруг стеклянной крыши
    box("top_f", brass, -W - 0.005, W + 0.005, -D - 0.008, -D + 0.03, gz1, 1.05, 0.005, 2)
    box("top_b", brass, -W - 0.005, W + 0.005, -0.03, 0.004, gz1, 1.05, 0.005, 2)
    for sx in (-1, 1):
        x0, x1 = (-W - 0.005, -W + 0.03) if sx < 0 else (W - 0.03, W + 0.005)
        box("top_s", brass, x0, x1, -D + 0.03, -0.03, gz1, 1.05, 0.005, 2)
    # подсветка под верхней рамой: спереди, сзади и по бокам
    box("led_f", led, -W + 0.03, W - 0.03, -D + 0.026, -D + 0.04, gz1 - 0.012, gz1, 0, 1)
    box("led_b", led, -W + 0.03, W - 0.03, -0.04, -0.026, gz1 - 0.012, gz1, 0, 1)
    for sx in (-1, 1):
        box("led_s", led, sx * (W - 0.04) - 0.007, sx * (W - 0.04) + 0.007, -D + 0.04, -0.04, gz1 - 0.012, gz1, 0, 1)
    # бархат: ложе и две ступени
    box("bed", navy, -W + 0.03, W - 0.03, -D + 0.03, -0.03, gz0, gz0 + 0.012, 0.006, 2)
    wedge("riser", navy, [(-0.04, gz0 + 0.01), (-0.04, gz0 + 0.12), (-0.17, gz0 + 0.09), (-0.30, gz0 + 0.05), (-0.30, gz0 + 0.01)], -W + 0.06, W - 0.06)
    # кольца: ряд на верхней ступени и ряд пониже
    rings = [
        (-0.50, -0.10, 0.118, gold, "glow_gem"), (-0.25, -0.10, 0.118, plat, "glow_gem_white"),
        (0.0, -0.10, 0.118, gold, "glow_gem_red"), (0.25, -0.10, 0.118, plat, "glow_gem"),
        (0.50, -0.10, 0.118, gold, "glow_gem_green"),
        (-0.38, -0.23, 0.081, plat, "glow_gem_red"), (-0.13, -0.23, 0.081, gold, "glow_gem_white"),
        (0.13, -0.23, 0.081, gold, "glow_gem"), (0.38, -0.23, 0.081, plat, "glow_gem_white"),
    ]
    gm = {"glow_gem": M_gem(), "glow_gem_red": M_gem_red(), "glow_gem_white": M_gem_white(), "glow_gem_green": M_gem_green()}
    for i, (x, y, dz, bandm, gname) in enumerate(rings):
        z = gz0 + dz
        yaw = random.choice((-25, -10, 0, 10, 25))
        R = 0.016
        torus("band", bandm, R, 0.0028, loc=(x, y, z + R), rot=(90, 0, yaw), seg=16, rseg=6)
        cyl("seat", bandm, 0.0055, 0.007, loc=(x, y, z + 2 * R + 0.002), segs=8, r2=0.004)
        gem("stone", gm[gname], 0.009 if i % 3 else 0.012, (x, y, z + 2 * R + 0.0095), segs=8)
    # серьги: две пары стоек на бархатной подушечке
    box("pad", navy, -0.14, 0.14, -0.40, -0.33, gz0 + 0.012, gz0 + 0.03, 0.01, 2)
    for xx, gname in ((-0.085, "glow_gem"), (-0.045, "glow_gem"), (0.045, "glow_gem_red"), (0.085, "glow_gem_red")):
        y = -0.365
        cyl("post", plat, 0.0016, 0.05, loc=(xx, y, gz0 + 0.052), segs=6)
        gem("stud", gm[gname], 0.0085, (xx, y, gz0 + 0.083), segs=8)
        tube("wire", gold, [(xx, y, gz0 + 0.03), (xx + 0.006, y - 0.004, gz0 + 0.02)], 0.001, segs=4)
    # жемчужная нитка на ложе
    pearl = mat("pearl", 0xf1ece2, 0.0, 0.25)
    for i in range(14):
        a = math.radians(200 + i * 10.5)
        sphere("pearl", pearl, 0.0065, (0.38 + 0.0 + 0.1 * math.cos(a) * 1.0, -0.40 + 0.04 * math.sin(a), gz0 + 0.019), segs=8, rings=6)


# =====================================================================
# бюст-подставка с колье на подиуме: всего 1,5 м
# =====================================================================
def necklace():
    lacq, lacq2, brass, navy = M_lacq(), M_lacq2(), M_brass(), M_navy()
    gold = M_gold()
    gblue, gwhite = M_gem(), M_gem_white()
    # подиум 1,15 м
    box("base1", lacq, -0.22, 0.22, -0.22, 0.22, 0.0, 0.07, 0.006, 2)
    box("base2", brass, -0.19, 0.19, -0.19, 0.19, 0.07, 0.085, 0.004, 2)
    box("shaft", lacq, -0.16, 0.16, -0.16, 0.16, 0.085, 1.02, 0.006, 2)
    for sy in (-1, 1):
        # филёнка на лицевой и задней стенках
        box("fil", lacq2, -0.1, 0.1, sy * 0.16 - 0.004, sy * 0.16 + 0.004, 0.25, 0.95, 0.005, 2)
    for sx in (-1, 1):
        box("fil", lacq2, sx * 0.16 - 0.004, sx * 0.16 + 0.004, -0.1, 0.1, 0.25, 0.95, 0.005, 2)
    box("cap1", brass, -0.19, 0.19, -0.19, 0.19, 1.02, 1.035, 0.004, 2)
    box("cap2", lacq, -0.22, 0.22, -0.22, 0.22, 1.035, 1.1, 0.006, 2)
    box("captop", brass, -0.2, 0.2, -0.2, 0.2, 1.1, 1.106, 0.003, 1)
    # бюст: торс-подставка с плечами и шеей, сечения — суперэллипсы (плечи чуть «квадратнее»)
    z0 = 1.106
    secs = [(0, 0.13, 0.075, 2.4), (0.05, 0.14, 0.08, 2.4), (0.12, 0.15, 0.085, 2.4), (0.18, 0.158, 0.088, 2.4), (0.22, 0.155, 0.088, 2.4), (0.245, 0.14, 0.082, 2.3), (0.26, 0.115, 0.072, 2.2), (0.272, 0.088, 0.062, 2.1), (0.285, 0.065, 0.056, 2.0), (0.3, 0.053, 0.052, 2.0), (0.34, 0.048, 0.049, 2.0), (0.4, 0.045, 0.046, 2.0)]

    def sect(zr):
        for s1, s2 in zip(secs, secs[1:]):
            if s1[0] <= zr <= s2[0]:
                t = (zr - s1[0]) / (s2[0] - s1[0])
                return tuple(s1[i] + (s2[i] - s1[i]) * t for i in (1, 2, 3))
        return secs[-1][1:]

    def se(a, W, D, e):
        c, sn = math.cos(a), math.sin(a)
        return (W * math.copysign(abs(sn) ** (2 / e), sn), -D * math.copysign(abs(c) ** (2 / e), c))

    bm = bmesh.new()
    SEG = 36
    rings = []
    for (zr, W, D, e) in secs:
        rings.append([bm.verts.new((*se(2 * math.pi * j / SEG, W, D, e), z0 + zr)) for j in range(SEG)])
    for i in range(len(rings) - 1):
        for j in range(SEG):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % SEG], rings[i + 1][(j + 1) % SEG], rings[i + 1][j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    from_bm(bm, "bust", navy, smooth=True, sharp=50)

    # колье: круг вокруг плеч, спереди провисает
    N = 40
    pts = []
    gap = 1.05
    for i in range(N + 1):
        a = 2 * math.pi * i / N
        c = max(0.0, math.cos(a)) ** 2   # 1 спереди (a = 0 — к зрителю)
        zr = 0.287 - 0.05 * c
        W, D, e = sect(zr)
        x, y = se(a, W * gap + 0.004, D * gap + 0.004, e)
        pts.append((x, y, z0 + zr))
    tube("chain", gold, pts[:-1] + [pts[0]], 0.0016, segs=5)
    for i in range(N):
        x, y, z = pts[i]
        a = 2 * math.pi * i / N
        fr = max(0.0, math.cos(a))
        r = 0.0055 + 0.0075 * fr ** 2
        gm = gwhite if (i % 2) else gblue
        if fr > 0.6:
            gm = gblue if i % 2 == 0 else gwhite
        if i % 4 == 0 or fr > 0.5:
            gem("stone", gm, r, (x, y, z + 0.002), segs=8)
        else:
            sphere("bead", gold, 0.0045, (x, y, z), segs=8, rings=5)
    # подвеска-капля: лежит на груди по поверхности бюста
    x, y, z = pts[0]
    zr0 = z - z0

    def yf(dz):
        W, D, e = sect(max(0.0, zr0 + dz))
        return -(D * gap + 0.004)

    cyl("bail", gold, 0.004, 0.012, loc=(x, y - 0.002, z - 0.008), segs=6, r2=0.0025)
    gem("drop_top", gblue, 0.013, (x, yf(-0.026) - 0.004, z - 0.026), rot=(35, 0, 0), segs=8, h=1.0)
    gem("drop_big", gblue, 0.019, (x, yf(-0.052) - 0.006, z - 0.052), rot=(35, 0, 0), segs=8, h=1.4)
    for k in range(6):
        a = 2 * math.pi * k / 6
        gem("halo", gwhite, 0.005, (x + 0.03 * math.cos(a), yf(-0.052 + 0.03 * math.sin(a)) - 0.004, z - 0.052 + 0.03 * math.sin(a)), rot=(35, 0, 0), segs=6)


# =====================================================================
# корона на алой подушке под стеклянным колпаком, на колонне: 1,5 м
# =====================================================================
def crown():
    lacq, brass, gold, scarlet = M_lacq(), M_brass(), M_gold(), M_scarlet()
    glass = M_glass("glass_dome")
    gred, gblue, gwhite = M_gem_red(), M_gem(), M_gem_white()
    fur = mat("ermine", 0xece8e0, 0.0, 0.95)
    cap = mat("velvet_cap", 0x6a0c2a, 0.0, 0.95)
    pearl = mat("pearl", 0xf1ece2, 0.0, 0.25)
    # колонна 1,10 м: квадратный цоколь, круглый ствол с каннелюрами, капитель
    box("plinth", lacq, -0.2, 0.2, -0.2, 0.2, 0.0, 0.08, 0.006, 2)
    box("plinth2", brass, -0.17, 0.17, -0.17, 0.17, 0.08, 0.095, 0.004, 2)
    lathe("foot", lacq, [(0, 0.095), (0.14, 0.095), (0.15, 0.105), (0.14, 0.125), (0.125, 0.14), (0.12, 0.16), (0, 0.16)], segs=26)
    lathe("shaft", lacq, [(0, 0.16), (0.115, 0.16), (0.118, 0.18), (0.11, 0.2), (0.105, 0.85), (0.108, 0.88), (0, 0.88)], segs=26)
    for k in range(12):   # каннелюры — латунные рёбра
        a = 2 * math.pi * k / 12
        box("flute", brass, -0.003, 0.003, 0.098, 0.106, 0.24, 0.81).rotation_euler = Euler((0, 0, a))
    lathe("collar", brass, [(0, 0.88), (0.115, 0.88), (0.12, 0.895), (0.115, 0.91), (0, 0.91)], segs=26)
    lathe("capital", lacq, [(0, 0.91), (0.12, 0.91), (0.15, 0.94), (0.165, 0.99), (0.17, 1.025), (0, 1.025)], segs=26)
    lathe("topring", brass, [(0, 1.025), (0.175, 1.025), (0.178, 1.04), (0.17, 1.05), (0, 1.05)], segs=26)
    # колпак
    zb = 1.05
    lathe_open("dome", glass, [(0.245, zb), (0.245, zb + 0.16), (0.238, zb + 0.24), (0.213, zb + 0.32),
                               (0.16, zb + 0.375), (0.09, zb + 0.41), (0.0, zb + 0.43)], segs=26)
    lathe_open("dome_rim", brass, [(0.23, zb), (0.252, zb), (0.252, zb + 0.022), (0.246, zb + 0.03), (0.23, zb + 0.03), (0.23, zb)], segs=26, sharp=60)
    sphere("dome_knob", brass, 0.014, (0, 0, zb + 0.435), scale=(1, 1, 1.1), segs=12, rings=6)
    # подушка 0,28 x 0,28 x 0,09, кисточки по углам
    pz = zb + 0.0
    box("pillow", scarlet, -0.16, 0.16, -0.16, 0.16, pz + 0.004, pz + 0.095, 0.04, 4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * 0.172, sy * 0.172
            sphere("t_head", gold, 0.011, (cx * 0.96, cy * 0.96, pz + 0.07), segs=10, rings=6)
            cyl("t_neck", gold, 0.006, 0.014, loc=(cx, cy, pz + 0.054), segs=8, r2=0.004)
            cyl("t_skirt", gold, 0.017, 0.04, loc=(cx, cy, pz + 0.028), segs=12, r2=0.007)
            cyl("t_thr", scarlet, 0.013, 0.012, loc=(cx, cy, pz + 0.004), segs=10, r2=0.016)
    # корона: хермелин, обод, зубцы, камни, дуги, шапка
    zc = pz + 0.095
    RO = 0.116
    crown0 = set(bpy.context.scene.objects)
    torus("ermine", fur, RO - 0.006, 0.015, loc=(0, 0, zc + 0.012), seg=24, rseg=6)
    zc2 = zc + 0.022
    h = 0.055
    lathe_open("band", gold, [(RO - 0.004, zc2), (RO + 0.0, zc2), (RO + 0.0, zc2 + h), (RO - 0.004, zc2 + h), (RO - 0.004, zc2)], segs=26, sharp=45)
    # кант обода
    torus("rim_lo", gold, RO + 0.0, 0.0035, loc=(0, 0, zc2 + 0.001), seg=26, rseg=5)
    torus("rim_hi", gold, RO + 0.0, 0.0035, loc=(0, 0, zc2 + h), seg=26, rseg=5)
    tooth = [(-0.03, 0), (0.03, 0), (0.031, 0.025), (0.02, 0.045), (0.012, 0.055), (0.013, 0.07), (0.0, 0.09),
             (-0.013, 0.07), (-0.012, 0.055), (-0.02, 0.045), (-0.031, 0.025)]
    for k in range(8):
        ang = k * 45
        sc = 1.0 if k % 2 == 0 else 0.68
        plate("tooth", gold, tooth, 0.005, RO - 0.002, ang, zc2 + h - 0.002, tilt=0.18, scale=sc)
        a = math.radians(ang)
        tz = zc2 + h + 0.09 * sc
        sphere("tip", pearl, 0.0065, ((RO + 0.014 + 0.18 * 0.09 * sc) * math.cos(a), (RO + 0.014 + 0.18 * 0.09 * sc) * math.sin(a), tz), segs=8, rings=6) if k % 2 == 0 else None
        # камень на ободе под зубцом
        gm = gred if k % 2 == 0 else gblue
        gem("stone", gm, 0.0125 if k % 2 == 0 else 0.0095, ((RO + 0.0055) * math.cos(a), (RO + 0.0055) * math.sin(a), zc2 + h / 2), rot=(0, 90, ang), segs=7)
        # жемчужины между камнями по ободу
        a2 = math.radians(ang + 22.5)
        for dz in (0.015, 0.04):
            sphere("pearl", pearl, 0.0045, ((RO + 0.003) * math.cos(a2), (RO + 0.003) * math.sin(a2), zc2 + dz), segs=8, rings=5)
    # бархатная шапка (видна над ободом и между дугами)
    lathe_open("cap", cap, [(RO - 0.01, zc2 + h - 0.01), (RO - 0.012, zc2 + h + 0.02), (RO - 0.02, zc2 + h + 0.055),
                            (RO - 0.045, zc2 + h + 0.088), (RO - 0.075, zc2 + h + 0.108), (0.0, zc2 + h + 0.118)], segs=26)
    # две перекрещённые дуги и держава с крестом
    ztop = zc2 + h + 0.115
    for rot in (0, 90):
        pts = []
        for i in range(13):
            t = i / 12
            a = math.pi * t
            r = (RO - 0.004) * math.cos(a)
            z = zc2 + h + (ztop - (zc2 + h)) * math.sin(a) ** 0.8
            pts.append((r * math.cos(math.radians(rot)), r * math.sin(math.radians(rot)), z))
        tube("arch", gold, pts, 0.0048, segs=6)
    sphere("orb", gold, 0.016, (0, 0, ztop + 0.012), segs=14, rings=8)
    torus("orb_band", gold, 0.0165, 0.0018, loc=(0, 0, ztop + 0.012), seg=16, rseg=5)
    box("cross_v", gold, -0.0045, 0.0045, -0.0045, 0.0045, ztop + 0.026, ztop + 0.062, 0.001, 1)
    box("cross_h", gold, -0.015, 0.015, -0.0045, 0.0045, ztop + 0.045, ztop + 0.054, 0.001, 1)
    gem("cross_gem", gred, 0.0075, (0, -0.0055, ztop + 0.0495), rot=(90, 0, 0), segs=8)
    for k in range(4):   # камни на дугах
        a = math.radians(k * 90 + 45)
        gem("arch_gem", gwhite, 0.005, (0.045 * math.cos(a), 0.045 * math.sin(a), zc2 + h + 0.095 + 0.005), segs=6)
    # корона крупнее подушки: масштаб вокруг её основания
    scale_new(crown0, 1.25, (0, 0, zc))


def scale_new(before, k, pivot=(0, 0, 0)):
    """Увеличить в k раз всё, что создано после снимка before, вокруг точки pivot."""
    bpy.context.view_layer.update()
    pv = Matrix.Translation(pivot)
    M = pv @ Matrix.Scale(k, 4) @ pv.inverted()
    for o in [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]:
        o.matrix_world = M @ o.matrix_world


def axis_rot(d):
    """Углы (град), которые поворачивают ось Z в направление d."""
    q = Vector((0, 0, 1)).rotation_difference(Vector(d).normalized())
    return tuple(math.degrees(a) for a in q.to_euler())


# =====================================================================
# павлин: золотая статуя с веером на круглом постаменте, 1,2 м
# =====================================================================
def peacock():
    gold, brass, plat = M_gold(), M_brass(), M_plat()
    blue_en = mat("enamel_blue", 0x0c3d94, 0.35, 0.22)
    marble = mat("marble_black", 0x1b1a1c, 0.0, 0.18)
    gb, gg, gw = M_gem(), M_gem_green(), M_gem_white()
    # постамент 0,26 м
    lathe("ped", marble, [(0, 0), (0.31, 0), (0.315, 0.012), (0.3, 0.03), (0.25, 0.04), (0.235, 0.06), (0.235, 0.20),
                          (0.25, 0.215), (0.29, 0.225), (0.3, 0.24), (0, 0.24)], segs=40)
    torus("ped_ring", brass, 0.245, 0.007, loc=(0, 0, 0.215), seg=40, rseg=6)
    lathe("ped_top", brass, [(0, 0.24), (0.3, 0.24), (0.3, 0.252), (0.28, 0.26), (0, 0.26)], segs=40)
    # лапы: две ноги с тремя пальцами
    for sx in (-1, 1):
        x = sx * 0.04
        tube("leg", gold, [(x, -0.02, 0.26), (x, -0.025, 0.33), (x, -0.03, 0.40)], [0.012, 0.01, 0.013], segs=7)
        sphere("knee", gold, 0.014, (x, -0.03, 0.34), segs=8, rings=5)
        for k, (dx, dy) in enumerate(((0, -0.075), (-0.03 * sx, -0.055), (0.03 * sx, -0.055))):
            tube("toe", gold, [(x, -0.02, 0.268), (x + dx, -0.02 + dy, 0.265)], [0.0075, 0.0045], segs=5)
    # тело и грудь
    sphere("body", gold, 1.0, (0, 0.0, 0.49), scale=(0.105, 0.2, 0.115), segs=22, rings=12, rot=(-18, 0, 0))
    sphere("breast", blue_en, 1.0, (0, -0.125, 0.55), scale=(0.09, 0.1, 0.108), segs=20, rings=10, rot=(-10, 0, 0))
    for sx in (-1, 1):   # сложенные крылья
        sphere("wing", gold, 1.0, (sx * 0.1, 0.02, 0.5), scale=(0.026, 0.16, 0.088), segs=12, rings=7, rot=(-16, 0, sx * 4))
    # шея S-образная, голова, клюв, гребень
    neck = [(0, -0.14, 0.57), (0, -0.18, 0.65), (0, -0.2, 0.74), (0, -0.18, 0.83), (0, -0.19, 0.9)]
    tube("neck", blue_en, neck, [0.058, 0.038, 0.026, 0.021, 0.019], segs=10)
    sphere("head", gold, 1.0, (0, -0.193, 0.922), scale=(0.025, 0.034, 0.028), segs=12, rings=7)
    cyl("beak", gold, 0.0105, 0.05, loc=(0, -0.23, 0.912), rot=(100, 0, 0), segs=8, r2=0.0015)
    for sx in (-1, 1):
        gem("eye", gb, 0.0058, (sx * 0.0215, -0.2, 0.928), rot=(0, 90 * sx, 0), segs=6)
    for k in range(9):
        a = math.radians(-44 + 11 * k)
        x0, z0 = 0.012 * math.sin(a), 0.945
        tip = (0.058 * math.sin(a), -0.193 - 0.01 * math.cos(a), z0 + 0.06 * math.cos(a))
        tube("crest", gold, [(x0, -0.193, z0), tip], [0.0016, 0.0009], segs=4)
        sphere("crest_tip", gw if k % 2 else gb, 0.0052, tip, segs=6, rings=4)
    # хвост-веер: два ряда перьев, у каждого «глазок» из камней
    F = Vector((0, 0.16, 0.47))

    def feather(name, th, L, w, y0, bend, eye_s, eye_big):
        t = math.radians(th)
        d = Vector((math.sin(t), 0, math.cos(t)))
        sd = Vector((math.cos(t), 0, -math.sin(t)))
        r0 = 0.05
        N = 8

        def wp(s):
            if s < 0.3:
                return 0.1 * w
            if s < 0.5:
                return w * (0.1 + (s - 0.3) / 0.2 * 0.52)
            return w * math.sqrt(max(0.0, 1 - ((s - 0.72) / 0.28) ** 2))

        def P(s, u):
            return F + d * (r0 + s * (L - r0)) + sd * u + Vector((0, y0 + bend * L * s * s, 0))

        ss = [0.0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 0.94, 1.0]
        bm = bmesh.new()
        fr, bk = [], []
        # острие: s = 1, u = 0 один раз
        poly = [(s, -wp(s)) for s in ss[:-1]] + [(1.0, 0.0)] + [(s, wp(s)) for s in reversed(ss[:-1])]
        for (s, u) in poly:
            p = P(s, u)
            fr.append(bm.verts.new(p + Vector((0, -0.003, 0))))
            bk.append(bm.verts.new(p + Vector((0, 0.003, 0))))
        bm.faces.new(fr)
        bm.faces.new(list(reversed(bk)))
        k = len(poly)
        for i in range(k):
            bm.faces.new((fr[i], bk[i], bk[(i + 1) % k], fr[(i + 1) % k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        from_bm(bm, name, gold, smooth=False)
        # глазок
        pe = P(eye_s, 0) + Vector((0, -0.005, 0))
        ew = w * 0.5
        sphere("eye_ring", plat, 1.0, pe, scale=(ew, 0.004, ew * 1.45), segs=8, rings=4, rot=(0, th, 0))
        sphere("eye_gem", gb if eye_big else gg, 1.0, pe + Vector((0, -0.003, 0)), scale=(ew * 0.55, 0.0055, ew * 0.85), segs=8, rings=4, rot=(0, th, 0))

    def LA(th):
        return 0.72 - 0.2 * (abs(th) / 52.0) ** 1.6

    n = 15
    for i in range(n):
        th = -52 + i * 104 / (n - 1)
        feather("fa", th, LA(th), 0.115, 0.0, 0.28, 0.86, False)
    for i in range(n - 1):
        th = -52 + (i + 0.5) * 104 / (n - 1)
        feather("fb", th, LA(th) * 0.82, 0.11, -0.016, 0.22, 0.72, True)
    # короткие пушистые перья у основания веера
    for i in range(7):
        th = -66 + i * 22
        feather("fc", th, LA(th) * 0.4, 0.07, -0.03, 0.08, 0.55, False)


# =====================================================================
# весы под колпаком на тумбе: 1,4 м
# =====================================================================
def scales():
    lacq, lacq2, brass, gold = M_lacq(), M_lacq2(), M_brass(), M_gold()
    glass = M_glass("glass_dome")
    gw = M_gem_white()
    # тумба 0,75
    box("kick", brass, -0.32, 0.32, -0.32, 0.32, 0.0, 0.04, 0.004, 2)
    box("body", lacq, -0.31, 0.31, -0.31, 0.31, 0.04, 0.69, 0.006, 2)
    for (cx, cy, nx, ny) in ((0, -0.31, 0, -1), (0, 0.31, 0, 1), (-0.31, 0, -1, 0), (0.31, 0, 1, 0)):
        if nx == 0:
            box("fil", lacq2, -0.2, 0.2, cy - 0.004, cy + 0.004, 0.12, 0.62, 0.005, 2)
        else:
            box("fil", lacq2, cx - 0.004, cx + 0.004, -0.2, 0.2, 0.12, 0.62, 0.005, 2)
    box("lip", brass, -0.335, 0.335, -0.335, 0.335, 0.69, 0.71, 0.004, 2)
    box("top", lacq, -0.345, 0.345, -0.345, 0.345, 0.71, 0.75, 0.006, 2)
    zb = 0.75
    inner0 = set(bpy.context.scene.objects)
    # основание весов
    lathe("plate", brass, [(0, zb), (0.2, zb), (0.205, zb + 0.008), (0.19, zb + 0.016), (0.1, zb + 0.026), (0.07, zb + 0.04), (0, zb + 0.04)], segs=32)
    # колонна: балясина
    lathe("pillar", brass, [(0, zb + 0.04), (0.06, zb + 0.04), (0.05, zb + 0.065), (0.032, zb + 0.09), (0.04, zb + 0.115), (0.03, zb + 0.14),
                            (0.018, zb + 0.17), (0.016, zb + 0.28), (0.026, zb + 0.30), (0.02, zb + 0.325), (0.012, zb + 0.34), (0, zb + 0.34)], segs=20)
    zc = zb + 0.385
    # вилка и ось коромысла
    for sx in (-1, 1):
        box("fork", brass, sx * 0.016 - 0.004, sx * 0.016 + 0.004, -0.008, 0.008, zb + 0.335, zc + 0.012, 0.002, 1)
    cyl("axle", gold, 0.005, 0.05, loc=(0, 0, zc), rot=(0, 90, 0), segs=10)
    # коромысло: утолщается к середине
    n = 11
    pts = [(-0.19 + 0.38 * i / (n - 1), 0, zc) for i in range(n)]
    rr = [0.0045 + 0.009 * max(0.0, 1 - abs(p[0]) / 0.19) ** 1.4 for p in pts]
    tube("beam", gold, pts, rr, segs=10)
    box("beam_cap", gold, -0.02, 0.02, -0.004, 0.004, zc - 0.014, zc + 0.014, 0.002, 1)
    for sx in (-1, 1):
        sphere("finial", gold, 0.011, (sx * 0.2, 0, zc), segs=10, rings=6)
        torus("hook", gold, 0.0105, 0.0015, loc=(sx * 0.175, 0, zc - 0.011), rot=(90, 0, 0), seg=14, rseg=5)
    # стрелка и шкала
    tube("needle", brass, [(0, -0.006, zc - 0.005), (0, -0.006, zc - 0.115)], [0.003, 0.0015], segs=5)
    arc = [(0.125 * math.cos(math.radians(a)), -0.006, zc + 0.125 * math.sin(math.radians(a))) for a in range(-125, -54, 7)]
    tube("scale_arc", brass, arc, 0.0025, segs=5)
    for a in range(-125, -54, 14):
        r1, r2 = 0.118, 0.134
        tube("tick", brass, [(r1 * math.cos(math.radians(a)), -0.006, zc + r1 * math.sin(math.radians(a))),
                             (r2 * math.cos(math.radians(a)), -0.006, zc + r2 * math.sin(math.radians(a)))], 0.0015, segs=4)
    box("scale_post", brass, -0.003, 0.003, -0.01, -0.002, zb + 0.34, zc - 0.08, 0.0, 1)
    # чаши на цепочках
    for sx in (-1, 1):
        cx = sx * 0.175
        zp = zc - 0.22
        for k in range(3):
            a = math.radians(90 + 120 * k)
            rim = (cx + 0.075 * math.cos(a), 0.075 * math.sin(a), zp + 0.022)
            tube("chain", gold, [(cx, 0, zc - 0.022), rim], 0.0019, segs=5)
        lathe_open("pan", gold, [(0, zp), (0.048, zp + 0.003), (0.072, zp + 0.016), (0.079, zp + 0.024), (0.076, zp + 0.025),
                                 (0.069, zp + 0.017), (0.046, zp + 0.007), (0, zp + 0.004)], segs=28, close=True, sharp=50)
        torus("pan_rim", gold, 0.0775, 0.0028, loc=(cx, 0, zp + 0.0245), seg=28, rseg=6)
        if sx < 0:
            gem("gem", gw, 0.03, (cx, 0, zp + 0.007 + 0.0225), segs=10, h=1.0)
        else:
            for k in range(3):
                cyl("weight", brass, 0.016 - 0.002 * k, 0.012, loc=(cx, 0, zp + 0.012 + 0.0125 * k + 0.0), segs=14, bev=0.001)
                cyl("wknob", brass, 0.005, 0.006, loc=(cx, 0, zp + 0.012 + 0.0125 * 2 + 0.009), segs=8) if k == 2 else None
    # механизм крупнее, чтобы заполнял колпак
    K = 1.3
    scale_new(inner0, K, (0, 0, zb))
    # колпак
    lathe_open("dome", glass, [(0.335, zb), (0.335, zb + 0.4), (0.328, zb + 0.46), (0.295, zb + 0.54), (0.23, zb + 0.6), (0.13, zb + 0.636), (0.0, zb + 0.65)], segs=36)
    lathe_open("dome_rim", brass, [(0.315, zb), (0.343, zb), (0.343, zb + 0.026), (0.335, zb + 0.036), (0.315, zb + 0.036), (0.315, zb)], segs=36, sharp=60)
    sphere("dome_knob", brass, 0.016, (0, 0, zb + 0.655), scale=(1, 1, 1.1), segs=12, rings=6)


# =====================================================================
# стол ювелира с лампой на кронштейне: 1,6 м (с лампой)
# =====================================================================
def jeweler():
    walnut = mat("walnut", 0x4a2a16, 0.0, 0.45)
    oak = mat("bench_top", 0x8b5a2f, 0.0, 0.5)
    dark = mat("walnut_dark", 0x2b170b, 0.0, 0.55)
    leather = mat("leather", 0x4b2a17, 0.0, 0.7)
    brass, steel = M_brass(), mat("steel", 0x9a9da3, 1.0, 0.35)
    felt = mat("felt_green", 0x1d4a30, 0.0, 0.95)
    enamel = mat("shade_enamel", 0x1d4a3a, 0.2, 0.35)
    lampm = mat("lamp", 0xfff0c8, 0.0, 0.3, emit=0xffd9a0, emit_k=4.0)
    bulb = mat("lamp_bulb", 0xfff6dc, 0.0, 0.2, emit=0xffe6b8, emit_k=6.0)
    lens = M_glass("glass_lens")
    gold, gb = M_gold(), M_gem()
    W, D, H = 0.65, 0.65, 0.88
    # ножки слева, тумба с ящиками справа
    for yy in (-D, -0.06):
        box("leg", walnut, -W + 0.02, -W + 0.08, yy, yy + 0.06, 0.0, H - 0.045, 0.004, 2)
    box("side_str", walnut, -W + 0.02, -W + 0.08, -D + 0.06, -0.06, 0.16, 0.2, 0.003, 1)
    box("back_pan", dark, -W + 0.08, 0.2, -0.03, 0.0, 0.2, H - 0.045)
    box("shelf", walnut, -W + 0.08, 0.2, -D + 0.04, -0.02, 0.17, 0.2, 0.003, 1)
    box("cab", walnut, 0.2, W, -D, 0.0, 0.05, H - 0.045, 0.004, 2)
    box("cab_kick", dark, 0.21, W - 0.01, -D + 0.02, -0.01, 0.0, 0.05)
    nd = 4
    for i in range(nd):
        z0 = 0.09 + i * (H - 0.045 - 0.14) / nd
        z1 = z0 + (H - 0.045 - 0.14) / nd - 0.012
        box("drawer", dark, 0.215, W - 0.015, -D - 0.014, -D + 0.006, z0, z1, 0.004, 2)
        box("drawer_in", walnut, 0.235, W - 0.035, -D - 0.018, -D - 0.012, z0 + 0.02, z1 - 0.02, 0.002, 1)
        cx = (0.2 + W) / 2
        cyl("pull_post", brass, 0.004, 0.02, loc=(cx - 0.05, -D - 0.026, (z0 + z1) / 2), rot=(90, 0, 0), segs=6)
        cyl("pull_post", brass, 0.004, 0.02, loc=(cx + 0.05, -D - 0.026, (z0 + z1) / 2), rot=(90, 0, 0), segs=6)
        cyl("pull", brass, 0.0045, 0.13, loc=(cx, -D - 0.036, (z0 + z1) / 2), rot=(0, 90, 0), segs=8)
        box("label", brass, cx - 0.02, cx + 0.02, -D - 0.02, -D - 0.016, z1 - 0.03, z1 - 0.012, 0.0, 1)
    # столешница с U-вырезом спереди
    cxn, R = -0.2, 0.17
    outline = [(-W - 0.03, 0.0), (W + 0.03, 0.0), (W + 0.03, -D - 0.02), (cxn + R, -D - 0.02)]
    for k in range(1, 12):
        a = math.pi * k / 12
        outline.append((cxn + R * math.cos(a), -D - 0.02 + R * math.sin(a) * 1.1))
    outline += [(cxn - R, -D - 0.02), (-W - 0.03, -D - 0.02)]
    extrude_outline("top", oak, outline, H - 0.045, H, bev=0.006)
    # кожаный фартук под вырезом
    ap = lathe_open("apron", leather, [(0.172, H - 0.04), (0.195, H - 0.08), (0.2, H - 0.13), (0.178, H - 0.19), (0.12, H - 0.235), (0.05, H - 0.255), (0.0, H - 0.26)], segs=24, loc=(cxn, -D - 0.02, 0.0))
    ap.scale = (1.0, 0.62, 1.0)
    # колышек для работы
    extrude_outline("pin", dark, [(-0.255, -0.46), (-0.145, -0.46), (-0.145, -0.6), (-0.18, -0.6), (-0.2, -0.54), (-0.22, -0.6), (-0.255, -0.6)], H, H + 0.016, bev=0.002)
    # галерейка с ящичками сзади
    box("gal", dark, -W - 0.01, 0.2, -0.12, 0.0, H, H + 0.14, 0.004, 2)
    for i in range(3):
        for j in range(2):
            x0 = -W + 0.02 + i * 0.27
            z0 = H + 0.012 + j * 0.062
            box("g_dr", walnut, x0, x0 + 0.25, -0.126, -0.116, z0, z0 + 0.052, 0.003, 1)
            cyl("g_knob", brass, 0.006, 0.01, loc=(x0 + 0.125, -0.13, z0 + 0.026), rot=(90, 0, 0), segs=8, r2=0.004)
    # лампа: основание, стойка, два звена на пружинных тягах, абажур
    bx, by = 0.53, -0.14
    lathe("lamp_base", brass, [(0, H), (0.09, H), (0.092, H + 0.014), (0.065, H + 0.03), (0.025, H + 0.04), (0, H + 0.04)], segs=24)
    j0 = (bx, by, H + 0.55)
    tube("post", brass, [(bx, by, H + 0.03), j0], 0.012, segs=8)
    j1 = (bx - 0.05, by - 0.04, 1.585)
    j2 = Vector((-0.12, -0.45, 1.38))
    for dx in (-0.011, 0.011):
        tube("arm1", brass, [(bx + dx, by, H + 0.54), (j1[0] + dx, j1[1], j1[2] - 0.01)], 0.0065, segs=6)
        tube("arm2", brass, [(j1[0] + dx, j1[1], j1[2] - 0.01), (j2.x + dx, j2.y, j2.z + 0.03)], 0.0065, segs=6)
    for p in (j0, j1, tuple(j2)):
        sphere("joint", brass, 0.022, p, segs=10, rings=6)
    # пружина вдоль первого звена
    sp = []
    for i in range(41):
        t = i / 40
        a = i * 1.2
        base = Vector((bx, by, H + 0.57)).lerp(Vector((j1[0], j1[1], 1.53)), t)
        sp.append(base + Vector((0.026 * math.cos(a), 0.0, 0.0)) + Vector((0, 0.026 * math.sin(a), 0)))
    tube("spring", steel, sp, 0.0013, segs=4)
    # абажур — конус, смотрит на колышек
    tgt = Vector((-0.2, -0.52, H + 0.03))
    d_l = (tgt - j2).normalized()
    rot = axis_rot(-d_l)
    shp = j2 + d_l * 0.02
    lathe_open("shade", enamel, [(0.03, 0.07), (0.034, 0.052), (0.08, 0.0), (0.112, -0.05), (0.115, -0.058)], segs=24, loc=tuple(shp), rot=rot, sharp=50)
    lathe_open("shade_in", lampm, [(0.115, -0.058), (0.111, -0.05), (0.077, 0.0), (0.031, 0.05)], segs=24, loc=tuple(shp), rot=rot, sharp=50)
    sphere("bulb", bulb, 0.026, tuple(shp + d_l * 0.0), segs=12, rings=6)
    cyl("cap", brass, 0.018, 0.04, loc=tuple(shp - d_l * 0.085), rot=rot, segs=10)
    # большая лупа на гибкой стойке
    mx, my = -0.46, -0.3
    lathe("mag_base", brass, [(0, H), (0.06, H), (0.062, H + 0.01), (0.04, H + 0.02), (0.012, H + 0.03), (0, H + 0.03)], segs=20)
    sd = Vector((-0.05, -0.05, 0))
    stem = [(mx, my, H + 0.03), (mx, my, H + 0.2), (mx - 0.005, my - 0.015, H + 0.3), (mx + 0.03, my - 0.055, H + 0.36)]
    tube("mag_stem", steel, stem, 0.0075, segs=6)
    lc = (mx + 0.045, my - 0.085, H + 0.4)
    torus("mag_ring", brass, 0.085, 0.006, loc=lc, rot=(78, 0, 0), seg=28, rseg=6)
    sphere("mag_lens", lens, 0.08, lc, scale=(1, 1, 0.12), segs=24, rings=8, rot=(78, 0, 0))
    tube("mag_arm", brass, [stem[-1], (lc[0], lc[1] + 0.01, lc[2] - 0.075)], 0.0065, segs=6)
    sphere("mag_pivot", brass, 0.011, stem[-1], segs=8, rings=5)
    # тиски
    vx, vy = 0.0, -0.4
    box("vise_base", steel, vx - 0.05, vx + 0.05, vy - 0.045, vy + 0.045, H, H + 0.014, 0.002, 1)
    box("vise_fix", steel, vx - 0.04, vx + 0.04, vy + 0.02, vy + 0.04, H + 0.014, H + 0.075, 0.003, 1)
    box("vise_mov", steel, vx - 0.04, vx + 0.04, vy - 0.005, vy + 0.012, H + 0.014, H + 0.075, 0.003, 1)
    cyl("vise_screw", steel, 0.006, 0.09, loc=(vx, vy - 0.045, H + 0.04), rot=(90, 0, 0), segs=8)
    cyl("vise_handle", steel, 0.003, 0.07, loc=(vx, vy - 0.09, H + 0.04), rot=(0, 90, 0), segs=6)
    for sx in (-1, 1):
        sphere("vh_end", steel, 0.007, (vx + sx * 0.035, vy - 0.09, H + 0.04), segs=8, rings=5)
    torus("vise_ring", gold, 0.013, 0.0028, loc=(vx, vy + 0.015, H + 0.095), rot=(0, 90, 0), seg=16, rseg=6)
    gem("vise_gem", gb, 0.01, (vx, vy + 0.015, H + 0.12), segs=8)
    # футляр с инструментами
    fx, fy = 0.43, -0.3
    box("case_bot", walnut, fx - 0.16, fx + 0.16, fy - 0.1, fy + 0.1, H, H + 0.05, 0.004, 2)
    box("case_felt", felt, fx - 0.145, fx + 0.145, fy - 0.085, fy + 0.085, H + 0.044, H + 0.052)
    lid = box("case_lid", walnut, -0.16, 0.16, -0.1, 0.1, -0.007, 0.007, 0.003, 1)
    place(lid, (fx, fy + 0.1 + 0.022, H + 0.05 + 0.095), (-100, 0, 0))
    lf = box("case_lid_felt", felt, -0.145, 0.145, -0.085, 0.085, -0.0105, -0.0068)
    place(lf, (fx, fy + 0.1 + 0.022, H + 0.05 + 0.095), (-100, 0, 0))
    cyl("hinge", brass, 0.005, 0.04, loc=(fx - 0.08, fy + 0.1, H + 0.05), rot=(0, 90, 0), segs=6)
    cyl("hinge", brass, 0.005, 0.04, loc=(fx + 0.08, fy + 0.1, H + 0.05), rot=(0, 90, 0), segs=6)
    box("clasp", brass, fx - 0.02, fx + 0.02, fy - 0.103, fy - 0.098, H + 0.02, H + 0.04, 0.001, 1)
    zf = H + 0.052
    for k, xx in enumerate((-0.11, -0.07)):   # пинцеты
        tube("tweezer", steel, [(fx + xx, fy - 0.05, zf + 0.004), (fx + xx + 0.006, fy + 0.04, zf + 0.004)], 0.0022, segs=5)
    box("pliers_a", steel, fx - 0.03, fx - 0.018, fy - 0.07, fy + 0.03, zf, zf + 0.007, 0.001, 1)
    box("pliers_b", steel, fx - 0.016, fx - 0.004, fy - 0.07, fy + 0.03, zf, zf + 0.007, 0.001, 1)
    box("file", steel, fx + 0.01, fx + 0.025, fy - 0.07, fy + 0.07, zf, zf + 0.004, 0.0, 1)
    box("file_h", dark, fx + 0.008, fx + 0.027, fy + 0.07, fy + 0.095, zf, zf + 0.012, 0.002, 1)
    cyl("scr", steel, 0.0025, 0.12, loc=(fx + 0.06, fy, zf + 0.004), rot=(90, 0, 0), segs=5)
    cyl("scr_h", dark, 0.0075, 0.04, loc=(fx + 0.06, fy + 0.07, zf + 0.007), rot=(90, 0, 0), segs=8)
    cyl("loupe", brass, 0.011, 0.034, loc=(fx + 0.11, fy - 0.01, zf + 0.011), rot=(90, 0, 0), segs=10)
    cyl("loupe_g", lens, 0.0095, 0.004, loc=(fx + 0.11, fy - 0.029, zf + 0.011), rot=(90, 0, 0), segs=10)


# =====================================================================
# латунный телескоп-рефрактор на деревянной треноге: 1,6 м
# =====================================================================
def telescope():
    brass, gold = M_brass(), M_gold()
    wood = mat("wood_mahogany", 0x5a2e14, 0.0, 0.4)
    leather = mat("leather", 0x3d2212, 0.0, 0.7)
    dark = mat("black_metal", 0x141414, 0.6, 0.4)
    lens = M_glass("glass_lens")
    P0 = Vector((0, 0, 1.2))
    ROT = (55, 0, 0)    # ось трубы смотрит вперёд и вверх под 35 градусов

    def tubel(name, m, prof, segs=24, open_=False):
        fn = lathe_open if open_ else lathe
        return fn(name, m, prof, segs=segs, loc=tuple(P0), rot=ROT, sharp=40)

    # труба: ось Z локальная, 0 — у оси вращения, + к объективу
    tubel("tube", brass, [(0, -0.45), (0.044, -0.45), (0.044, 0.50), (0.0, 0.5)], segs=28)
    tubel("tube_hi", brass, [(0, -0.45), (0.046, -0.45), (0.046, -0.43), (0.0, -0.43)], segs=28)
    # кожаная обмотка посередине
    tubel("wrap", leather, [(0.044, -0.2), (0.0485, -0.195), (0.0485, 0.2), (0.044, 0.205)], segs=28, open_=True)
    # кольца-бандажи
    for z in (-0.44, -0.2, 0.2, 0.46):
        tubel("band", gold, [(0.044, z - 0.008), (0.053, z - 0.006), (0.053, z + 0.006), (0.044, z + 0.008)], segs=28, open_=True)
    # раструб (бленда) и объектив
    tubel("dew", brass, [(0.044, 0.5), (0.062, 0.52), (0.066, 0.68), (0.069, 0.7), (0.069, 0.705), (0.064, 0.705), (0.06, 0.68), (0.044, 0.5)], segs=28, open_=True)
    tubel("lens", lens, [(0, 0.56), (0.056, 0.56), (0.0, 0.57)], segs=24)
    tubel("lens_ring", gold, [(0.056, 0.552), (0.061, 0.552), (0.061, 0.572), (0.056, 0.572), (0.056, 0.552)], segs=28, open_=True)
    # выдвижной тубус с окуляром
    tubel("draw", brass, [(0, -0.45), (0.03, -0.45), (0.03, -0.6), (0.036, -0.605), (0.036, -0.64), (0.02, -0.645), (0.02, -0.7), (0.026, -0.705), (0.026, -0.73), (0.0, -0.73)], segs=20)
    tubel("eyecup", dark, [(0.026, -0.725), (0.03, -0.73), (0.03, -0.75), (0.016, -0.75), (0.016, -0.73), (0.026, -0.725)], segs=20, open_=True)
    # фокусировочные ручки (по бокам трубки)
    for sx in (-1, 1):
        a = P0 + Vector((0, -math.sin(math.radians(55)), math.cos(math.radians(55)))) * -0.55
        cyl("focus_knob", gold, 0.022, 0.014, loc=tuple(a + Vector((sx * 0.065, 0, 0))), rot=(0, 90, 0), segs=16, bev=0.002)
        cyl("focus_axle", brass, 0.006, 0.05, loc=tuple(a + Vector((sx * 0.04, 0, 0))), rot=(0, 90, 0), segs=8)
    # искатель — маленькая трубка сверху на двух кронштейнах
    up = Vector((0, math.cos(math.radians(55)), math.sin(math.radians(55)))) * 1.0  # вектор «вверх» от трубы
    ax = Vector((0, -math.sin(math.radians(55)), math.cos(math.radians(55))))
    for z in (-0.2, 0.25):
        c = P0 + ax * z
        tube("bracket", brass, [tuple(c + up * 0.04), tuple(c + up * 0.088)], 0.007, segs=6)
        torus("bracket_ring", brass, 0.017, 0.003, loc=tuple(c + up * 0.1), rot=axis_rot(ax), seg=14, rseg=5)
    lathe("finder", brass, [(0, -0.26), (0.014, -0.26), (0.014, 0.2), (0.019, 0.22), (0.019, 0.3), (0.0, 0.3)], segs=16, loc=tuple(P0 + up * 0.1 + ax * 0.0), rot=ROT)
    lathe("finder_lens", lens, [(0, 0.3), (0.017, 0.3), (0.0, 0.305)], segs=14, loc=tuple(P0 + up * 0.1), rot=ROT)
    lathe("finder_eye", dark, [(0, -0.26), (0.012, -0.26), (0.012, -0.3), (0.0, -0.3)], segs=12, loc=tuple(P0 + up * 0.1), rot=ROT)
    # вилка и ось поворота по высоте, голова треноги
    for sx in (-1, 1):
        box("yoke", brass, sx * 0.075 - 0.01, sx * 0.075 + 0.01, -0.035, 0.035, 1.08, 1.25, 0.004, 2)
    cyl("pivot", gold, 0.013, 0.2, loc=tuple(P0), rot=(0, 90, 0), segs=14)
    for sx in (-1, 1):
        cyl("pivot_knob", gold, 0.022, 0.016, loc=(sx * 0.115, 0, 1.2), rot=(0, 90, 0), segs=16, bev=0.002)
    lathe("head", brass, [(0, 1.04), (0.06, 1.04), (0.075, 1.06), (0.075, 1.09), (0.04, 1.1), (0, 1.1)], segs=24)
    # треножник: три расходящиеся ноги
    for k in range(3):
        a = math.radians(90 + 120 * k)
        top = Vector((0.055 * math.cos(a), 0.055 * math.sin(a), 1.06))
        bot = Vector((0.48 * math.cos(a), 0.48 * math.sin(a), 0.03))
        mid = top.lerp(bot, 0.5)
        d = (top - bot)
        tube("leg", wood, [tuple(bot + d.normalized() * 0.04), tuple(bot.lerp(top, 0.5)), tuple(top)], [0.015, 0.0205, 0.0245], segs=8)
        cyl("shoe", brass, 0.019, 0.07, loc=tuple(bot + d.normalized() * 0.02), rot=axis_rot(d), segs=10, r2=0.012)
        cyl("hinge", brass, 0.03, 0.06, loc=tuple(top.lerp(bot, 0.04)), rot=axis_rot(d), segs=10)
        # латунная накладка на ноге
        cyl("strap", brass, 0.0265, 0.03, loc=tuple(top.lerp(bot, 0.3)), rot=axis_rot(d), segs=10)
        cyl("strap", brass, 0.0215, 0.03, loc=tuple(top.lerp(bot, 0.7)), rot=axis_rot(d), segs=10)
    # центральный кронштейн-распорка: тонкие тяги от ног к кольцу
    ring_z = 0.55
    for k in range(3):
        a = math.radians(90 + 120 * k)
        top = Vector((0.055 * math.cos(a), 0.055 * math.sin(a), 1.06))
        bot = Vector((0.48 * math.cos(a), 0.48 * math.sin(a), 0.03))
        pt = top.lerp(bot, (1.06 - ring_z) / 1.03)
        tube("stay", brass, [tuple(pt), (0.04 * math.cos(a), 0.04 * math.sin(a), ring_z - 0.02)], 0.004, segs=5)
    lathe("stay_hub", brass, [(0, ring_z - 0.05), (0.03, ring_z - 0.045), (0.035, ring_z - 0.02), (0.02, ring_z), (0, ring_z)], segs=14)
    # общий масштаб: высота ровно 1,6 м
    scale_new(set(), 1.6 / 1.652)


# =====================================================================
# театральные маски на настенной доске: 0,92 м
# =====================================================================
def in_poly(p, poly):
    x, y = p
    ins = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            ins = not ins
        j = i
    return ins


def near_poly(p, poly):
    best, bd = None, 1e9
    for i in range(len(poly)):
        a = Vector(poly[i]); b = Vector(poly[(i + 1) % len(poly)])
        ab = b - a
        t = max(0.0, min(1.0, (Vector(p) - a).dot(ab) / (ab.dot(ab) + 1e-12)))
        q = a + ab * t
        d = (q - Vector(p)).length
        if d < bd:
            bd, best = d, q
    return (best.x, best.y)


def eye_poly(cx, cy, w, h, arch, slant, n=10):
    """Прорезь глаза: изогнутая миндалина; arch — изгиб вверх, slant — наклон внешнего угла (рад)."""
    top, bot = [], []
    for i in range(n + 1):
        t = -1 + 2 * i / n
        k = (1 - t * t) ** 0.8
        yc = arch * (1 - t * t)
        top.append((t * w / 2, yc + h / 2 * k))
        bot.append((t * w / 2, yc - h / 2 * k * 0.75))
    pts = top + list(reversed(bot[1:-1]))
    sn, cs = math.sin(slant), math.cos(slant)
    return [(cx + x * cs - y * sn, cy + x * sn + y * cs) for (x, y) in pts]


def mouth_poly(cy, a, up0, up2, lo0, lo2, n=12):
    """Прорезь рта между двумя параболами: углы поднимаются (улыбка) или опускаются (грусть)."""
    top, bot = [], []
    for i in range(n + 1):
        u = -1 + 2 * i / n
        top.append((u * a, up0 + up2 * u * u + cy))
        bot.append((u * a, lo0 + lo2 * u * u + cy))
    return top + list(reversed(bot[1:-1]))


def build_mask(comedy, NS=24, NT=40):
    """Выпуклое лицо маски сеткой; глаза и рот вырезаны, края прижаты к контурам."""
    Wm, Hm, Dm = 0.165, 0.23, 0.05
    if comedy:
        arch = 0.012
        holes = [eye_poly(-0.062, 0.045, 0.084, 0.038, arch, -0.22), eye_poly(0.062, 0.045, 0.084, 0.038, arch, 0.22),
                 mouth_poly(-0.1, 0.078, -0.04, 0.05, -0.07, 0.062)]
    else:
        arch = -0.003
        holes = [eye_poly(-0.062, 0.045, 0.084, 0.038, arch, 0.4), eye_poly(0.062, 0.045, 0.084, 0.038, arch, -0.4),
                 mouth_poly(-0.095, 0.07, 0.0, -0.05, -0.03, -0.04)]

    def depth(x, y, s, t):
        g = lambda x0, y0, sx, sy: math.exp(-(((x - x0) / sx) ** 2 + ((y - y0) / sy) ** 2))
        d = Dm * (((1 - t * t) * (1 - s * s)) ** 0.62)
        d += 0.022 * g(0, -0.015, 0.02, 0.06)                                            # нос
        d += 0.013 * (g(0.075, -0.05, 0.042, 0.042) + g(-0.075, -0.05, 0.042, 0.042))    # щёки
        d += 0.01 * (g(0.062, 0.085, 0.04, 0.016) + g(-0.062, 0.085, 0.04, 0.016))       # брови
        d += 0.008 * g(0, -0.185, 0.045, 0.03)                                           # подбородок
        d -= 0.007 * (g(0.062, 0.045, 0.045, 0.026) + g(-0.062, 0.045, 0.045, 0.026))    # глазницы
        return d

    bm = bmesh.new()
    rows = []
    for j in range(NT + 1):
        t = -math.cos(math.pi * j / NT)
        y = t * Hm
        taper = 0.78 + 0.22 * (t + 1) / 2
        row = []
        for i in range(NS + 1):
            s = -1 + 2 * i / NS
            x = s * Wm * math.sqrt(max(0.0, 1 - t * t)) * taper
            row.append(bm.verts.new((x, -depth(x, y, s, t), y)))
        rows.append(row)
    for j in range(NT):
        for i in range(NS):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        if any(in_poly((c.x, c.z), h) for h in holes):
            kill.append(f)
    cand = set(v for f in kill for v in f.verts)
    bmesh.ops.delete(bm, geom=kill, context="FACES_ONLY")
    for v in cand:
        if v.is_valid and v.link_faces:
            q = min((near_poly((v.co.x, v.co.z), h) for h in holes), key=lambda q: (q[0] - v.co.x) ** 2 + (q[1] - v.co.z) ** 2)
            v.co.x, v.co.z = q
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def masks():
    walnut = mat("walnut_dark", 0x24140a, 0.0, 0.5)
    velvet = mat("velvet_black", 0x1a1018, 0.0, 0.95)
    brass = M_brass()
    mgold = mat("mask_gold", 0xdcae42, 1.0, 0.3)
    msilver = mat("mask_silver", 0xcfd3d8, 1.0, 0.26)
    ribbon_m = mat("ribbon_red", 0x8e1020, 0.0, 0.5)
    for m_ in (mgold, msilver, ribbon_m):
        m_.use_backface_culling = False
    BW, BH = 0.92, 0.62
    box("board", walnut, -BW / 2, BW / 2, -0.03, 0.0, 0.0, BH, 0.008, 2)
    box("panel", velvet, -BW / 2 + 0.045, BW / 2 - 0.045, -0.034, -0.026, 0.045, BH - 0.045, 0.002, 1)
    t = 0.006
    for (x0, x1, z0, z1) in ((-0.415, 0.415, 0.04, 0.04 + t), (-0.415, 0.415, BH - 0.04 - t, BH - 0.04),
                             (-0.415, -0.415 + t, 0.04, BH - 0.04), (0.415 - t, 0.415, 0.04, BH - 0.04)):
        box("trim", brass, x0, x1, -0.038, -0.03, z0, z1, 0.001, 1)
    for k, (cx, comedy, mm, tilt) in enumerate(((-0.215, True, mgold, 9), (0.215, False, msilver, -9))):
        bm = build_mask(comedy)
        o = from_bm(bm, "mask", mm, smooth=True, sharp=0)
        place(o, (cx, -0.036, 0.285), (0, tilt, 0))
        # прибитая ленточка и гвоздь
        nz = BH - 0.062
        sphere("nail", brass, 0.011, (cx, -0.044, nz), segs=10, rings=6)
    # ленты: от гвоздей свисают хвосты в промежуток и к краям доски
    def ribbon(name, pts, w, y0):
        bm = bmesh.new()
        L, R = [], []
        n = len(pts)
        for i, (x, z) in enumerate(pts):
            a = Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])
            a.normalize()
            nx, nz_ = -a.y, a.x
            y = y0 - 0.003 * math.sin(i * 1.3)
            L.append(bm.verts.new((x + nx * w / 2, y, z + nz_ * w / 2)))
            R.append(bm.verts.new((x - nx * w / 2, y, z - nz_ * w / 2)))
        for i in range(n - 1):
            bm.faces.new((L[i], R[i], R[i + 1], L[i + 1]))
        return from_bm(bm, name, ribbon_m, smooth=True, sharp=0)
    def curve(p0, p1, p2, p3, n=12):
        out = []
        for i in range(n + 1):
            t = i / n
            q = [(1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3)]
            out.append(tuple(q))
        return out
    nz = BH - 0.062
    for cx, so in ((-0.215, -1), (0.215, 1)):
        # внешний хвост к краю доски
        ribbon("rib_out", curve((cx, nz), (cx + so * 0.03, nz - 0.1), (cx + so * 0.22, nz - 0.05), (cx + so * 0.225, 0.07)), 0.026, -0.0395)
        # внутренний хвост — в промежуток
        ribbon("rib_in", curve((cx, nz), (cx - so * 0.04, nz - 0.1), (cx - so * 0.1, nz - 0.2), (cx - so * 0.2, 0.06)), 0.026, -0.0415)
        # бантик
        sphere("bow_l", ribbon_m, 0.016, (cx - 0.016, -0.046, nz - 0.004), scale=(1.1, 0.5, 0.7), segs=10, rings=6, rot=(0, 20, 0))
        sphere("bow_r", ribbon_m, 0.016, (cx + 0.016, -0.046, nz - 0.004), scale=(1.1, 0.5, 0.7), segs=10, rings=6, rot=(0, -20, 0))
        sphere("bow_k", ribbon_m, 0.008, (cx, -0.049, nz - 0.004), segs=8, rings=5)


# =====================================================================
# глобус на напольной деревянной подставке: 1,1 м
# =====================================================================
LAND = {
    "na": [(-168, 66), (-160, 70), (-140, 70), (-110, 72), (-95, 72), (-82, 69), (-80, 63), (-93, 58), (-83, 52), (-78, 56), (-77, 62), (-68, 60), (-62, 56),
           (-56, 52), (-60, 47), (-67, 45), (-70, 42), (-75, 38), (-76, 34), (-81, 31), (-80, 26), (-82, 30), (-90, 30), (-97, 28), (-97, 21), (-91, 19),
           (-87, 21), (-88, 16), (-83, 15), (-83, 10), (-78, 8), (-80, 7), (-86, 11), (-92, 14), (-96, 16), (-105, 20), (-110, 23), (-115, 30), (-118, 34),
           (-124, 40), (-124, 48), (-130, 54), (-137, 59), (-148, 60), (-153, 57), (-158, 57), (-164, 55), (-162, 60), (-166, 62)],
    "sa": [(-80, 8), (-72, 12), (-62, 10), (-52, 5), (-50, 0), (-44, -2), (-35, -6), (-35, -9), (-39, -14), (-40, -21), (-48, -26), (-53, -34), (-58, -38),
           (-62, -40), (-65, -46), (-68, -52), (-70, -55), (-74, -52), (-74, -44), (-73, -37), (-71, -30), (-70, -18), (-76, -14), (-81, -5), (-80, 0), (-77, 4)],
    "af": [(-17, 21), (-13, 28), (-9, 32), (-6, 36), (10, 37), (11, 33), (20, 32), (32, 31), (34, 28), (37, 22), (43, 12), (51, 12), (48, 5), (41, -2), (40, -10),
           (40, -17), (35, -24), (32, -29), (28, -33), (20, -35), (18, -31), (12, -18), (13, -9), (9, -1), (9, 4), (5, 5), (-4, 5), (-8, 4), (-13, 8), (-17, 14)],
    "eu": [(-9, 37), (-9, 43), (-1, 44), (-2, 47), (-4, 48), (2, 51), (8, 54), (9, 57), (12, 55), (14, 54), (20, 55), (23, 59), (30, 60), (23, 64), (25, 66),
           (22, 66), (17, 62), (19, 60), (16, 56), (12, 56), (8, 58), (5, 59), (5, 62), (14, 67), (20, 70), (28, 71), (40, 67), (44, 68), (60, 69), (70, 73),
           (80, 73), (100, 77), (113, 74), (130, 71), (140, 72), (160, 70), (170, 69), (180, 66), (178, 63), (163, 60), (160, 54), (156, 51), (155, 58), (143, 59),
           (137, 54), (141, 52), (140, 48), (135, 43), (130, 42), (129, 36), (126, 35), (126, 38), (124, 40), (121, 40), (122, 37), (119, 35), (122, 31), (121, 28),
           (117, 23), (110, 21), (108, 16), (109, 12), (105, 9), (101, 13), (103, 2), (100, 6), (98, 10), (98, 16), (94, 17), (92, 22), (88, 22), (80, 15), (77, 8),
           (73, 18), (72, 22), (67, 25), (62, 25), (57, 26), (56, 27), (52, 29), (49, 30), (48, 28), (50, 25), (52, 24), (56, 26), (58, 23), (55, 17), (44, 13),
           (43, 16), (39, 22), (35, 28), (34, 31), (36, 36), (30, 36), (27, 37), (26, 40), (23, 40), (24, 37), (22, 36), (20, 40), (19, 42), (14, 45), (12, 44),
           (16, 41), (18, 40), (16, 38), (15, 40), (10, 44), (6, 43), (3, 43), (0, 39), (-5, 36)],
    "au": [(114, -22), (122, -18), (130, -12), (137, -12), (136, -15), (141, -17), (142, -11), (146, -19), (153, -27), (150, -37), (146, -39), (141, -38),
           (135, -34), (131, -31), (124, -33), (115, -34), (113, -26)],
}
ISLES = [(-2, 54, 2.6, 4.5), (-8, 53, 1.6, 1.6), (138, 37, 2.2, 5), (47, -19, 2.6, 6), (175, -38, 2, 3), (170, -44, 3, 3), (101, -0.5, 6, 2),
         (114, 0.5, 4, 4), (110, -7.5, 5, 1), (141, -5, 8, 2.5), (-19, 65, 3.2, 1.6), (-79, 22, 5, 1.2)]
ICE = {"gr": [(-55, 60), (-44, 60), (-30, 68), (-20, 72), (-20, 82), (-40, 83), (-62, 82), (-72, 78), (-58, 75), (-55, 68)]}


def globe_class(lon, lat):
    if lat < -68:
        return 2
    if in_poly((lon, lat), ICE["gr"]):
        return 2
    for p in LAND.values():
        if in_poly((lon, lat), p):
            return 1
    for (x, y, rx, ry) in ISLES:
        if ((lon - x) / rx) ** 2 + ((lat - y) / ry) ** 2 < 1:
            return 1
    return 0


def globe_texture(W=1024, H=512, SS=2):
    """Карта мира: океан, суша, лёд и тонкая сетка; рисуем с суперсэмплингом numpy."""
    import numpy as np
    w, h = W * SS, H * SS
    lon = (np.arange(w) + 0.5) / w * 360 - 180
    lat = (np.arange(h) + 0.5) / h * 180 - 90
    LON, LAT = np.meshgrid(lon, lat)

    def poly_mask(poly):
        ins = np.zeros(LON.shape, bool)
        j = len(poly) - 1
        for i in range(len(poly)):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if yi != yj:
                cond = ((yi > LAT) != (yj > LAT)) & (LON < (xj - xi) * (LAT - yi) / (yj - yi) + xi)
                ins ^= cond
            j = i
        return ins

    land = np.zeros(LON.shape, bool)
    for p in LAND.values():
        land |= poly_mask(p)
    for (x, y, rx, ry) in ISLES:
        land |= ((LON - x) / rx) ** 2 + ((LAT - y) / ry) ** 2 < 1
    ice = poly_mask(ICE["gr"]) | (LAT < -68)
    land |= ice

    def down(a):
        return a.reshape(H, SS, W, SS).mean(axis=(1, 3))

    fl, fi = down(land.astype(float)), down(ice.astype(float))
    # шельф: размытая суша чуть осветляет океан у берегов
    k = 7
    c = np.cumsum(np.pad(fl, ((0, 0), (k, k)), mode="wrap"), axis=1)
    bl = (c[:, 2 * k:] - c[:, :-2 * k]) / (2 * k)
    c = np.cumsum(np.pad(bl, ((k, k), (0, 0)), mode="edge"), axis=0)
    bl = (c[2 * k:] - c[:-2 * k]) / (2 * k)
    ocean = np.array([0.02, 0.08, 0.2])
    shelf = np.array([0.05, 0.2, 0.36])
    sand = np.array([0.55, 0.42, 0.22])
    green = np.array([0.22, 0.3, 0.12])
    white = np.array([0.8, 0.84, 0.88])
    la = (np.arange(H) + 0.5) / H * 180 - 90
    gk = np.clip(1 - np.abs(la) / 45.0, 0, 1)[:, None, None] * 0.55   # у экватора суша зеленее
    oc = ocean + (shelf - ocean) * np.clip(bl * 2.2, 0, 1)[:, :, None]
    ld = sand + (green - sand) * gk
    img = oc * (1 - fl[:, :, None]) + ld * (fl[:, :, None] * (1 - fi[:, :, None])) + white * fi[:, :, None]
    # сетка 30 градусов
    lo = (np.arange(W) + 0.5) / W * 360 - 180
    gx = (np.abs(((lo + 15) % 30) - 15) < 0.35)[None, :, None]
    gy = (np.abs(((la + 15) % 30) - 15) < 0.35)[:, None, None]
    line = np.clip(gx * 1.0 + gy * 1.0, 0, 1)
    img = img * (1 - 0.35 * line) + 0.35 * line * np.array([0.6, 0.65, 0.75])
    rgba = np.ones((H, W, 4), dtype=np.float32)
    rgba[:, :, :3] = img
    im = bpy.data.images.new("globe_map", W, H, alpha=False)
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    return im


def globe():
    walnut = mat("walnut", 0x4e2c17, 0.0, 0.4)
    dark = mat("walnut_dark", 0x2b170b, 0.0, 0.5)
    brass = M_brass()
    ocean = mat("globe_ocean", 0x14386a, 0.0, 0.32)
    land = mat("globe_land", 0xcdb184, 0.0, 0.55)
    ice = mat("globe_ice", 0xe9eef2, 0.0, 0.4)
    R = 0.22
    zc = 0.8
    tilt = 23.5
    # шар с картой-текстурой (материки рисуем по грубым контурам, края мягкие)
    globe_mat = mat("globe_map", 0xffffff, 0.0, 0.34)
    nt = globe_mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = globe_texture()
    bs = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=56, v_segments=28, radius=R)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        us = []
        for lp in f.loops:
            p = lp.vert.co
            lon = math.degrees(math.atan2(p.y, p.x)) + 110
            lon = (lon + 180) % 360 - 180
            us.append((lon + 180) / 360)
            lp[uvl].uv = ((lon + 180) / 360, (math.degrees(math.asin(max(-1, min(1, p.z / R)))) + 90) / 180)
        # шов долготы: подтягиваем «с другой стороны» значения
        if max(us) - min(us) > 0.5:
            for lp in f.loops:
                if lp[uvl].uv[0] < 0.5:
                    lp[uvl].uv = (lp[uvl].uv[0] + 1.0, lp[uvl].uv[1])
    o = from_bm(bm, "globe_ball", globe_mat, smooth=True, sharp=0)
    place(o, (0, 0, zc), (0, tilt, 0))
    a = Vector((math.sin(math.radians(tilt)), 0, math.cos(math.radians(tilt))))
    c = Vector((0, 0, zc))
    # ось и колпачки полюсов
    tube("axis", brass, [tuple(c - a * 0.275), tuple(c + a * 0.275)], 0.0045, segs=8)
    for s in (-1, 1):
        sphere("pole_cap", brass, 0.012, tuple(c + a * 0.275 * s), segs=10, rings=6)
    # меридиан — латунное кольцо в плоскости XZ, насечки по дуге
    torus("meridian", brass, 0.256, 0.0065, loc=tuple(c), rot=(90, 0, 0), seg=48, rseg=8)
    for k in range(36):
        ang = math.radians(k * 10)
        r = 0.2625
        big = (k % 3 == 0)
        px, pz = r * math.cos(ang), r * math.sin(ang)
        tk = box("tick", brass, -0.0025, 0.0025, -0.0035, 0.0035, -0.008 if big else -0.005, 0.008 if big else 0.005)
        place(tk, (px, -0.0058, zc + pz), (0, -math.degrees(ang) + 90, 0))
    # горизонт: деревянное кольцо с латунной вставкой и насечками
    zh = zc
    lathe_open("horizon", walnut, [(0.235, zh - 0.014), (0.315, zh - 0.014), (0.315, zh + 0.012), (0.235, zh + 0.012)], segs=48, sharp=40)
    # верхняя и нижняя плоскости кольца
    bmr = bmesh.new()
    for zz, flip in ((zh + 0.012, False), (zh - 0.014, True)):
        ri, ro = [], []
        for j in range(48):
            a_ = 2 * math.pi * j / 48
            ri.append(bmr.verts.new((0.235 * math.cos(a_), 0.235 * math.sin(a_), zz)))
            ro.append(bmr.verts.new((0.315 * math.cos(a_), 0.315 * math.sin(a_), zz)))
        for j in range(48):
            q = (ri[j], ro[j], ro[(j + 1) % 48], ri[(j + 1) % 48])
            bmr.faces.new(list(reversed(q)) if flip else q)
    bmesh.ops.recalc_face_normals(bmr, faces=bmr.faces)
    from_bm(bmr, "horizon_flat", walnut, smooth=False)
    torus("horizon_inlay", brass, 0.272, 0.0028, loc=(0, 0, zh + 0.0125), seg=48, rseg=5)
    for k in range(24):
        ang = math.radians(k * 15)
        tk = box("htick", brass, 0.285, 0.305, -0.0015, 0.0015, zh + 0.012, zh + 0.0135)
        tk.rotation_euler = Euler((0, 0, ang))
    # четыре точёные ноги под углом 45° к виду, ноги чуть расходятся книзу
    leg_prof = [(0, -0.4), (0.014, -0.4), (0.02, -0.37), (0.028, -0.31), (0.021, -0.22), (0.017, -0.08), (0.02, 0.08), (0.03, 0.18),
                (0.022, 0.26), (0.032, 0.31), (0.022, 0.37), (0.02, 0.4), (0, 0.4)]
    tops, bots = [], []
    for k in range(4):
        ang = math.radians(45 + 90 * k)
        top = Vector((0.272 * math.cos(ang), 0.272 * math.sin(ang), zh - 0.012))
        bot = Vector((0.375 * math.cos(ang), 0.375 * math.sin(ang), 0.012))
        tops.append(top); bots.append(bot)
        d = top - bot
        lathe("leg", walnut, leg_prof, segs=14, loc=tuple((top + bot) / 2), rot=axis_rot(d))
        cyl("foot", brass, 0.017, 0.022, loc=tuple(bot + Vector((0, 0, 0.0))), segs=10, r2=0.014)
    # крестовина: две перекладины и латунная втулка
    zs = 0.26
    f = (zh - 0.012 - zs) / (zh - 0.012 - 0.012)
    rr = 0.272 + (0.375 - 0.272) * f
    for ang in (45, 135):
        b = box("cross", dark, -rr, rr, -0.015, 0.015, zs - 0.012, zs + 0.012, 0.003, 1)
        b.rotation_euler = Euler((0, 0, math.radians(ang)))
    lathe("hub", brass, [(0, zs - 0.02), (0.035, zs - 0.02), (0.04, zs - 0.01), (0.04, zs + 0.01), (0.03, zs + 0.02), (0.012, zs + 0.045), (0.018, zs + 0.06), (0.0, zs + 0.075)], segs=18)


MODELS = [("showcase", showcase), ("necklace", necklace), ("crown", crown), ("peacock", peacock), ("scales", scales),
          ("jeweler", jeweler), ("telescope", telescope), ("masks", masks), ("globe", globe)]

if __name__ == "__main__":
    only = os.environ.get("ONLY")
    for name, fn in MODELS:
        if only and name not in only.split(","):
            continue
        reset()
        fn()
        finalize(name)
        export(name)
