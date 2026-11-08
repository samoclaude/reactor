# Свои ориентиры для банка и офиса: банкомат, кулер, флаг, МФУ, аквариум, телевизор, диван, доска,
# велосипед, торшер, шкаф-укрытие, стена сейфовых ячеек. Низ на полу (z = 0), лицо к -Y, зад у y = 0.
# Запуск: OUT=<папка> blender -b --factory-startup --python tools/models/props_city.py
# Один имя: ONLY=atm,cooler (через запятую). Потом gltf-transform meshopt из OUT в assets/models/.
import sys, os, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
importlib.reload(common)
from common import *
import random


# ---------- помощники ----------
def B(name, m, x0, x1, d0, d1, z0, z1, bev=0.0, segs=2):
    """Брусок: d — расстояние от задней стенки вперёд (d0 ближе к стене)."""
    return box(name, m, x0, x1, -d1, -d0, z0, z1, bev, segs)


def C(name, m, r, h, x, d, z, axis="z", segs=16, r2=None, bev=0.0):
    """Цилиндр с центром (x, d, z); ось z, x или y."""
    rot = {"z": (0, 0, 0), "x": (0, 90, 0), "y": (90, 0, 0)}[axis]
    return cyl(name, m, r, h, loc=(x, -d, z), rot=rot, segs=segs, r2=r2, bev=bev)


def prism_side(name, m, pts, x0, x1, bev=0.0, segs=2):
    """Профиль сбоку (d, z), выдавленный по X от x0 до x1."""
    bm = bmesh.new()
    vs = [bm.verts.new((x0, -d, z)) for d, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bm(bm, name, m)
    return bevel(o, bev, segs) if bev else o


def prism_xz(name, m, pts, y0, y1, bev=0.0):
    """Контур в плоскости XZ (x, z), выдавленный по Y от y0 до y1."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y0, z)) for x, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, y1 - y0, 0), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bm(bm, name, m)
    return bevel(o, bev, 2) if bev else o


def rbox(name, m, cx, cd, cz, w, dd, h, rotx=0.0, bev=0.0, segs=3, roty=0.0):
    """Брусок по центру и размерам, с поворотом (подушки, кнопки)."""
    o = box(name, m, -w / 2, w / 2, -dd / 2, dd / 2, -h / 2, h / 2, bev, segs)
    o.location = (cx, -cd, cz)
    o.rotation_euler = Euler((math.radians(rotx), math.radians(roty), 0))
    return o


def seg_xz(name, m, p0, p1, w, y, th=0.003):
    """Тонкая полоска в плоскости XZ от точки p0 до p1 (линии на доске)."""
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dz)
    o = box(name, m, -L / 2, L / 2, -th / 2, th / 2, -w / 2, w / 2)
    o.location = ((p0[0] + p1[0]) / 2, y, (p0[1] + p1[1]) / 2)
    o.rotation_euler = Euler((0, -math.atan2(dz, dx), 0))
    return o


def xform(objs, M):
    """Применить матрицу к деталям (поставить рыбку на место)."""
    for o in objs:
        o.data.transform(M @ o.matrix_basis)
        o.matrix_basis = Matrix.Identity(4)


def new_since(snap):
    return [o for o in bpy.data.objects if o not in snap]


def inv_box(name, m, x0, x1, y0, y1, z0, z1):
    """Коробка с нормалями внутрь: видна только изнутри (задняя и боковые стенки), передняя отсекается."""
    o = box(name, m, x0, x1, y0, y1, z0, z1)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


# =====================================================================
# банкомат 1,7 м
# =====================================================================
def atm():
    body = mat("atm_body", 0x4a5563, 0.5, 0.45)
    steel = mat("atm_steel", 0xb9bfc6, 1.0, 0.35)
    dark = mat("atm_dark", 0x0d0f12, 0.0, 0.6)
    keym = mat("atm_key", 0x2a2d33, 0.0, 0.45)
    kg = mat("atm_key_green", 0x1f9a44, 0.0, 0.45)
    ky = mat("atm_key_yellow", 0xd9a21b, 0.0, 0.45)
    kr = mat("atm_key_red", 0xb02525, 0.0, 0.45)
    screen = mat("screen", 0x2a7fd0, 0.0, 0.25, emit=0x2f8fe0, emit_k=1.4)
    ui = mat("screen_ui", 0xcfe8ff, 0.0, 0.25, emit=0xbfe0ff, emit_k=1.5)
    glow = mat("glow", 0xffb02e, 0.0, 0.3, emit=0xffa21a, emit_k=3.0)
    led = mat("led_green", 0x103010, 0.0, 0.3, emit=0x40ff60, emit_k=3.0)
    W = 0.30
    B("plinth", dark, -W + 0.02, W - 0.02, 0.03, 0.46, 0.0, 0.06)
    B("lower", body, -W, W, 0.0, 0.47, 0.06, 0.95, 0.008)
    B("seam", dark, -W + 0.004, W - 0.004, 0.468, 0.472, 0.355, 0.358)
    # пульт с наклонной панелью для клавиатуры
    prism_side("shelf", body, [(0, 0.95), (0.58, 0.95), (0.58, 1.03), (0.36, 1.10), (0, 1.10)], -W, W, 0.008)
    B("shelf_edge", steel, -W + 0.01, W - 0.01, 0.575, 0.585, 0.955, 1.025, 0.003)
    # голова
    B("head", body, -W, W, 0.0, 0.42, 1.10, 1.56, 0.01)
    prism_side("hood", body, [(0, 1.56), (0.50, 1.56), (0.50, 1.63), (0.45, 1.70), (0, 1.70)], -W, W, 0.01)
    B("logo_glow", glow, -0.22, 0.22, 0.50, 0.504, 1.575, 1.615)
    B("hood_trim", steel, -W, W, 0.495, 0.505, 1.555, 1.568, 0.002)
    # экран: рамка, свечение, простой интерфейс
    B("bezel", dark, -0.205, 0.205, 0.42, 0.438, 1.22, 1.50, 0.006)
    B("screen", screen, -0.175, 0.175, 0.438, 0.440, 1.245, 1.475)
    B("ui_head", ui, -0.155, 0.155, 0.440, 0.4405, 1.415, 1.45)
    for sx in (-1, 1):
        for z0 in (1.275, 1.335):
            B("ui_tile", ui, sx * 0.015 if sx > 0 else -0.145, 0.145 if sx > 0 else -0.015, 0.440, 0.4405, z0, z0 + 0.04)
    # боковые экранные кнопки
    for sx in (-1, 1):
        for z in (1.26, 1.32, 1.38, 1.44):
            B("softkey", keym, sx * 0.215 - 0.016, sx * 0.215 + 0.016, 0.42, 0.43, z - 0.012, z + 0.012, 0.003)
    # картоприёмник и выдача чека
    B("card_plate", steel, 0.02, 0.24, 0.42, 0.428, 1.13, 1.20, 0.004)
    B("card_slot", dark, 0.05, 0.21, 0.428, 0.430, 1.158, 1.172)
    B("card_led", led, 0.215, 0.235, 0.428, 0.4295, 1.18, 1.19)
    B("receipt_plate", steel, -0.24, -0.02, 0.42, 0.428, 1.13, 1.20, 0.004)
    B("receipt_slot", dark, -0.21, -0.05, 0.428, 0.430, 1.158, 1.172)
    # клавиатура на наклонной панели: 3 x 4 цифры и 4 цветные кнопки
    th = math.degrees(math.atan2(0.07, 0.22))
    ln = math.hypot(0.22, 0.07)

    def surf(t, off=0.004):
        d = 0.36 + 0.22 * t
        z = 1.10 - 0.07 * t
        nd, nz = 0.07 / ln, 0.22 / ln  # нормаль: вперёд и вверх
        return d + nd * off, z + nz * off

    B("keypad_bed", dark, -0.155, 0.17, 0.36, 0.58, 1.095, 1.105)
    for i, t in enumerate((0.13, 0.38, 0.63, 0.88)):
        for j, x in enumerate((-0.10, -0.045, 0.01)):
            d, z = surf(t)
            rbox("key", keym, x, d, z, 0.04, 0.036, 0.008, th, 0.0015, 1)
    for t, mm in ((0.13, kg), (0.38, ky), (0.63, kr), (0.88, keym)):
        d, z = surf(t)
        rbox("fkey", mm, 0.095, d, z, 0.055, 0.036, 0.008, th, 0.0015, 1)
    # выдача денег: рамка, тёмная щель, шторка, подсветка
    for (x0, x1, z0, z1) in ((-0.16, 0.16, 0.60, 0.615), (-0.16, 0.16, 0.725, 0.74), (-0.16, -0.145, 0.60, 0.74), (0.145, 0.16, 0.60, 0.74)):
        B("cash_frame", steel, x0, x1, 0.47, 0.485, z0, z1, 0.002)
    B("cash_slot", dark, -0.145, 0.145, 0.47, 0.472, 0.615, 0.725)
    B("cash_flap", body, -0.14, 0.14, 0.472, 0.478, 0.62, 0.69, 0.004)
    B("cash_led", led, -0.15, 0.15, 0.47, 0.476, 0.755, 0.762)
    # вентиляционная решётка внизу и боковые накладки
    for k in range(5):
        B("vent", dark, -0.12, 0.12, 0.47, 0.472, 0.12 + k * 0.035, 0.137 + k * 0.035)


# =====================================================================
# кулер 1,25 м
# =====================================================================
def cooler():
    white = mat("cooler_body", 0xe9ecee, 0.0, 0.45)
    grey = mat("cooler_grey", 0x9aa1a8, 0.0, 0.5)
    dark = mat("cooler_dark", 0x1d2024, 0.0, 0.5)
    red = mat("tap_red", 0xc8262b, 0.0, 0.35)
    blue = mat("tap_blue", 0x2a62c9, 0.0, 0.35)
    chrome = mat("cooler_chrome", 0xd0d4d8, 1.0, 0.3)
    bottle = mat("bottle", 0x1e5fd6, 0.3, 0.18)
    cap = mat("bottle_cap", 0x16408f, 0.0, 0.4)
    led_g = mat("led_green", 0x103010, 0.0, 0.3, emit=0x40ff60, emit_k=3.0)
    led_r = mat("led_red", 0x301010, 0.0, 0.3, emit=0xff3030, emit_k=3.0)
    HW, D = 0.16, 0.33
    for sx in (-1, 1):
        for d in (0.05, D - 0.05):
            C("foot", dark, 0.022, 0.06, sx * (HW - 0.04), d, 0.03, segs=10)
    B("body", white, -HW, HW, 0.0, D, 0.06, 0.80, 0.014, 3)
    B("top_plate", white, -HW - 0.005, HW + 0.005, -0.003, D + 0.003, 0.80, 0.83, 0.012, 3)
    lathe("seat", dark, [(0.125, 0.83), (0.125, 0.845), (0.10, 0.85), (0.075, 0.835), (0.075, 0.83)], segs=28, loc=(0, -D / 2, 0))
    # панель с кранами
    B("panel", grey, -0.13, 0.13, D - 0.002, D + 0.008, 0.44, 0.76, 0.006)
    B("panel_dark", dark, -0.115, 0.115, D + 0.008, D + 0.010, 0.47, 0.72, 0.003)
    for x, mm in ((-0.065, blue), (0.065, red)):
        C("tap_base", chrome, 0.017, 0.045, x, D + 0.032, 0.62, "y", 14)
        C("tap_lever", mm, 0.013, 0.035, x, D + 0.045, 0.645, "z", 12)
        C("tap_spout", chrome, 0.008, 0.04, x, D + 0.05, 0.585, "z", 10)
    B("led_g", led_g, -0.09, -0.07, D + 0.010, D + 0.013, 0.69, 0.705)
    B("led_r", led_r, 0.07, 0.09, D + 0.010, D + 0.013, 0.69, 0.705)
    # поддон-подставка под стакан с решёткой
    B("tray", chrome, -0.14, 0.14, D - 0.03, D + 0.075, 0.395, 0.425, 0.008)
    B("tray_bed", dark, -0.12, 0.12, D - 0.02, D + 0.065, 0.425, 0.430)
    for k in range(9):
        B("grille", grey, -0.11 + k * 0.0275, -0.11 + k * 0.0275 + 0.012, D - 0.015, D + 0.06, 0.430, 0.436, 0.002, 1)
    # нижняя дверца
    B("door", white, -0.13, 0.13, D, D + 0.006, 0.09, 0.37, 0.006)
    B("door_seam", dark, -0.13, 0.13, D + 0.005, D + 0.007, 0.375, 0.378)
    B("door_handle", grey, -0.03, 0.03, D + 0.006, D + 0.016, 0.33, 0.345, 0.004)
    # бутыль 19 л горлышком вниз: рёбра, плечо, донышко с ручкой
    r, rg = 0.135, 0.128
    prof = [(0.0, 0.83), (0.046, 0.83), (0.046, 0.87), (0.06, 0.885), (0.10, 0.915), (r, 0.95), (r, 0.99), (rg, 1.005), (rg, 1.02), (r, 1.035),
            (r, 1.07), (rg, 1.085), (rg, 1.10), (r, 1.115), (r, 1.16), (0.125, 1.205), (0.095, 1.235), (0.06, 1.248), (0.0, 1.25)]
    lathe("bottle", bottle, prof, segs=32, loc=(0, -D / 2, 0))
    lathe("bottle_cap", cap, [(0.0, 1.2495), (0.04, 1.2495), (0.04, 1.258), (0.0, 1.258)], segs=16, loc=(0, -D / 2, 0))
    lathe("neck_ring", cap, [(0.05, 0.855), (0.058, 0.855), (0.058, 0.862), (0.05, 0.862)], segs=20, loc=(0, -D / 2, 0))


# =====================================================================
# флаг 2,4 м
# =====================================================================
def flag():
    navy = mat("flag_navy", 0x14234f, 0.0, 0.85)
    navy.use_backface_culling = False
    gold = mat("flag_gold", 0xc9a227, 0.0, 0.7)
    gold.use_backface_culling = False
    brass = mat("brass", 0xc09650, 1.0, 0.3)
    iron = mat("flag_base", 0x24262a, 0.8, 0.4)
    rub = mat("flag_rubber", 0x111213, 0.0, 0.9)
    PY = -0.25  # ось флагштока
    H = 1.0  # высота полотнища
    TOP = 2.12
    W = 0.86

    def cloth(name, m, v0, v1, nu=44, nv=6):
        bm = bmesh.new()
        rows = []
        for j in range(nv + 1):
            v = v0 + (v1 - v0) * j / nv
            row = []
            for i in range(nu + 1):
                u = i / nu
                amp = 0.03 * (0.35 + 0.65 * v)
                ph = 2 * math.pi * (3.5 * u) + 0.8 * v
                y = PY - 0.055 - amp * math.sin(ph)
                z = TOP - v * H - 0.012 * v * math.sin(2 * math.pi * 3.5 * u + 0.6)
                row.append(bm.verts.new((-W / 2 + W * u, y, z)))
            rows.append(row)
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
        return from_bm(bm, name, m, smooth=True, sharp=0)

    cloth("navy_a", navy, 0.0, 0.40)
    cloth("gold", gold, 0.40, 0.56)
    cloth("navy_b", navy, 0.56, 1.0, nv=8)
    # золотая бахрома по нижней кромке
    for i in range(30):
        u = (i + 0.5) / 30
        amp = 0.03
        y = PY - 0.055 - amp * math.sin(2 * math.pi * 3.5 * u + 0.8)
        z = TOP - H - 0.012 * math.sin(2 * math.pi * 3.5 * u + 0.6)
        box("fringe", gold, -W / 2 + W * u - 0.007, -W / 2 + W * u + 0.007, y - 0.003, y + 0.003, z - 0.045, z + 0.004)
    # флагшток, перекладина, шар
    cyl("pole", brass, 0.014, 2.30, loc=(0, PY, 1.19), segs=14)
    cyl("crossbar", brass, 0.009, 0.96, loc=(0, PY - 0.025, 2.14), rot=(0, 90, 0), segs=10)
    for sx in (-1, 1):
        sphere("bar_ball", brass, 0.02, (sx * 0.48, PY - 0.025, 2.14), segs=12, rings=8)
    sphere("finial", brass, 0.035, (0, PY, 2.365), segs=16, rings=12)
    cyl("finial_neck", brass, 0.02, 0.04, loc=(0, PY, 2.31), segs=12, r2=0.014)
    # тяжёлая крестовина: ступица, четыре лапы, нижние накладки
    lathe("hub", iron, [(0.0, 0.0), (0.075, 0.0), (0.075, 0.035), (0.06, 0.12), (0.032, 0.14), (0.0, 0.14)], segs=24, loc=(0, PY, 0))
    cyl("collar", brass, 0.026, 0.03, loc=(0, PY, 0.16), segs=14)
    for ang in (0, 90):
        o = box("arm", iron, -0.25, 0.25, -0.03, 0.03, 0.0, 0.05, 0.012, 3)
        o.location = (0, PY, 0.025)
        o.rotation_euler = Euler((0, 0, math.radians(ang)))
        for s in (-1, 1):
            px = math.cos(math.radians(ang)) * s * 0.22
            py = math.sin(math.radians(ang)) * s * 0.22
            cyl("pad", rub, 0.027, 0.012, loc=(px, PY + py, 0.006), segs=12)
    # косые подкосы в стойке
    for ang in (45, 135, 225, 315):
        a = math.radians(ang)
        tube("brace", iron, [(0.03 * math.cos(a), PY + 0.03 * math.sin(a), 0.14), (0.11 * math.cos(a), PY + 0.11 * math.sin(a), 0.045)], 0.009, segs=6)


# =====================================================================
# МФУ 1,2 м
# =====================================================================
def printer():
    light = mat("mfu_body", 0xdadcdf, 0.0, 0.5)
    mid = mat("mfu_grey", 0x9da1a7, 0.0, 0.5)
    dark = mat("mfu_dark", 0x2a2d32, 0.0, 0.55)
    black = mat("mfu_black", 0x0e0f11, 0.0, 0.6)
    glassm = mat("mfu_glass", 0x1b2a30, 0.2, 0.15)
    screen = mat("screen", 0x0b3a52, 0.0, 0.3, emit=0x3ad0ff, emit_k=1.4)
    led = mat("led_green", 0x103010, 0.0, 0.3, emit=0x40ff60, emit_k=3.0)
    ledo = mat("led_orange", 0x301800, 0.0, 0.3, emit=0xffa020, emit_k=3.0)
    btn = mat("mfu_btn", 0x45484e, 0.0, 0.45)
    btng = mat("mfu_btn_green", 0x1f9a44, 0.0, 0.45)
    W, D = 0.33, 0.62
    # тумба с лотками
    for sx in (-1, 1):
        for d in (0.07, D - 0.07):
            C("wheel_foot", black, 0.03, 0.04, sx * (W - 0.06), d, 0.02, segs=12)
    B("stand", light, -W, W, 0.0, D, 0.04, 0.56, 0.008)
    for k, (z0, z1) in enumerate(((0.07, 0.19), (0.205, 0.325), (0.34, 0.46))):
        B("drawer", light, -W + 0.015, W - 0.015, D - 0.003, D + 0.012, z0 + 0.01, z1 + 0.01 + (0.04 if k == 2 else 0), 0.006)
        B("drawer_grip", dark, -0.11, 0.11, D + 0.012, D + 0.018, z1 - 0.04, z1 - 0.02, 0.004)
        B("drawer_gap", dark, -W + 0.02, W - 0.02, D + 0.009, D + 0.0105, z1 + 0.0, z1 + 0.003)
    B("stand_label", mid, 0.2, 0.28, D + 0.012, D + 0.0135, 0.45, 0.47)
    # основной корпус
    B("body", light, -W, W, 0.0, D, 0.56, 0.98, 0.012, 3)
    B("body_band", dark, -W - 0.002, W + 0.002, 0.0, D + 0.003, 0.555, 0.575, 0.004)
    # лоток выдачи: углубление и выступающая полка
    B("out_slot", black, -0.27, 0.10, D - 0.004, D + 0.0, 0.76, 0.88)
    B("out_shelf", mid, -0.27, 0.10, D - 0.2, D + 0.005, 0.755, 0.765, 0.003)
    B("out_wall", mid, -0.28, -0.27, D - 0.2, D + 0.005, 0.755, 0.88)
    B("out_wall2", mid, 0.10, 0.11, D - 0.2, D + 0.005, 0.755, 0.88)
    B("paper", light, -0.2, -0.02, D - 0.15, D - 0.02, 0.766, 0.769)
    # дверца и фасадный люк картриджа
    B("front_door", light, 0.13, 0.29, D, D + 0.004, 0.60, 0.74, 0.004)
    B("front_door_line", dark, 0.13, 0.29, D + 0.003, D + 0.0045, 0.60, 0.603)
    # сканер: стекло-крышка, петли, лоток подачи
    B("scanner", mid, -W - 0.005, W + 0.005, 0.0, D + 0.01, 0.98, 1.05, 0.012, 3)
    B("scanner_lid", light, -W + 0.01, 0.07, 0.02, D - 0.04, 1.05, 1.085, 0.012, 3)
    B("glass_edge", glassm, -W + 0.03, W - 0.03, D - 0.01, D + 0.005, 0.99, 1.04)
    B("adf", light, -W + 0.02, 0.05, 0.02, 0.34, 1.085, 1.18, 0.014, 3)
    prism_side("adf_tray", mid, [(0.34, 1.12), (0.52, 1.14), (0.52, 1.145), (0.34, 1.17)], -W + 0.06, 0.01, 0.002)
    B("adf_dark", dark, -W + 0.04, 0.03, 0.335, 0.341, 1.10, 1.16)
    # панель управления на скосе справа
    th = 15
    d0, z0 = D - 0.17, 1.075
    rbox("panel", dark, 0.19, d0, z0, 0.26, 0.26, 0.025, th, 0.006, 2)
    nd, nz = -math.sin(math.radians(th)), math.cos(math.radians(th))

    def pp(dv, off):
        dd = d0 + dv * math.cos(math.radians(th)) + (-nd) * off
        zz = z0 - dv * math.sin(math.radians(th)) + nz * off
        return dd, zz

    dd, zz = pp(0.01, 0.014)
    rbox("display_bezel", black, 0.115, dd, zz, 0.11, 0.085, 0.006, th, 0.002, 1)
    dd, zz = pp(0.01, 0.0175)
    rbox("display", screen, 0.115, dd, zz, 0.095, 0.07, 0.002, th)
    for k in range(3):
        dd, zz = pp(0.025, 0.0185)
        rbox("display_line", mat("screen_ui", 0xd8f4ff, 0.0, 0.3, emit=0xd8f4ff, emit_k=1.6), 0.095, dd, zz - k * 0.0, 0.05 - k * 0.012, 0.004, 0.0015, th)
    # цифровая клавиатура и кнопки
    for i in range(3):
        for j in range(4):
            dd, zz = pp(-0.055 + i * 0.027, 0.0155)
            rbox("key", btn, 0.2 + j * 0.026, dd, zz, 0.02, 0.018, 0.005, th, 0.001, 1)
    dd, zz = pp(0.055, 0.0155)
    rbox("start", btng, 0.27, dd, zz, 0.032, 0.02, 0.006, th, 0.002, 1)
    dd, zz = pp(0.055, 0.0155)
    rbox("stop", mat("mfu_btn_red", 0xb02525, 0.0, 0.45), 0.225, dd, zz, 0.032, 0.02, 0.006, th, 0.002, 1)
    dd, zz = pp(-0.105, 0.016)
    B("led1", led, 0.09, 0.102, dd - 0.006, dd + 0.006, zz - 0.003, zz + 0.003)
    B("led2", ledo, 0.11, 0.122, dd - 0.006, dd + 0.006, zz - 0.003, zz + 0.003)
    # логотип-планка и порт USB
    B("logo", mid, -0.28, -0.14, D + 0.0, D + 0.003, 0.93, 0.95)
    B("usb", black, -0.01, 0.03, D + 0.0, D + 0.003, 0.90, 0.91)


# =====================================================================
# аквариум 1,4 м
# =====================================================================
def aquarium():
    wood = mat("aq_wood", 0x6a4326, 0.0, 0.5)
    wood2 = mat("aq_wood_dark", 0x4a2d18, 0.0, 0.5)
    chrome = mat("aq_chrome", 0xc0c4c9, 1.0, 0.3)
    black = mat("aq_black", 0x0f1012, 0.0, 0.5)
    glass = mat("glass_tank", 0xcfe8f0, 0.0, 0.05)
    water = mat("glow_water", 0x2a8fd8, 0.0, 0.2, emit=0x1b6fb8, emit_k=0.55)
    water.use_backface_culling = True
    sand = mat("aq_sand", 0xd8c391, 0.0, 0.95)
    rock = mat("aq_rock", 0x6e6a64, 0.0, 0.85)
    rock2 = mat("aq_rock2", 0x8a7a66, 0.0, 0.85)
    plant = mat("aq_plant", 0x2f9a45, 0.0, 0.6)
    plant2 = mat("aq_plant2", 0x1d7a3a, 0.0, 0.6)
    glowlamp = mat("glow_lamp", 0xfff3da, 0.0, 0.3, emit=0xfff0d0, emit_k=2.5)
    orange = mat("fish_orange", 0xff7a1a, 0.0, 0.35)
    yellow = mat("fish_yellow", 0xffd21f, 0.0, 0.35)
    white = mat("fish_white", 0xf4efe6, 0.0, 0.4)
    eyem = mat("fish_eye", 0x050505, 0.0, 0.3)
    HW, D = 0.53, 0.46
    ZB = 0.78
    # тумба
    B("plinth", wood2, -HW + 0.03, HW - 0.03, 0.02, D - 0.03, 0.0, 0.05)
    B("cabinet", wood, -HW, HW, 0.0, D, 0.05, 0.74, 0.008)
    for sx in (-1, 1):
        x0, x1 = (-HW + 0.03, -0.006) if sx < 0 else (0.006, HW - 0.03)
        B("door", wood, x0, x1, D, D + 0.012, 0.08, 0.71, 0.005)
        B("door_in", wood2, x0 + 0.04, x1 - 0.04, D + 0.012, D + 0.016, 0.12, 0.67, 0.003)
        B("handle", chrome, sx * 0.03 - 0.006, sx * 0.03 + 0.006, D + 0.016, D + 0.034, 0.36, 0.52, 0.004)
    B("top", wood2, -HW - 0.02, HW + 0.02, 0.0, D + 0.02, 0.74, ZB, 0.01)
    # аквариум: низ, стёкла, силиконовые швы
    X0, X1, Y0, Y1 = -0.50, 0.50, 0.025, 0.43
    ZT = 1.26
    B("tank_base", black, X0 - 0.01, X1 + 0.01, Y0 - 0.01, Y1 + 0.01, ZB, ZB + 0.02, 0.003)
    B("glass_front", glass, X0, X1, Y1 - 0.008, Y1, ZB + 0.02, ZT)
    B("glass_back", glass, X0, X1, Y0, Y0 + 0.008, ZB + 0.02, ZT)
    B("glass_l", glass, X0, X0 + 0.008, Y0, Y1, ZB + 0.02, ZT)
    B("glass_r", glass, X1 - 0.008, X1, Y0, Y1, ZB + 0.02, ZT)
    for (a, b, c, d) in ((X0 - 0.004, X0 + 0.01, Y1 - 0.01, Y1 + 0.004), (X1 - 0.01, X1 + 0.004, Y1 - 0.01, Y1 + 0.004)):
        B("corner", black, a, b, c, d, ZB + 0.02, ZT, 0.002)
    B("rim_front", black, X0, X1, Y1 - 0.01, Y1 + 0.004, ZT - 0.03, ZT, 0.002)
    # вода: объём с нормалями внутрь (задняя и боковые стенки светятся, содержимое видно)
    inv_box("water", water, X0 + 0.008, X1 - 0.008, -(Y1 - 0.008), -(Y0 + 0.008), ZB + 0.04, 1.2)
    # песок
    B("sand", sand, X0 + 0.008, X1 - 0.008, Y0 + 0.008, Y1 - 0.008, ZB + 0.02, ZB + 0.06, 0.01)
    random.seed(4)
    for k in range(7):
        x = random.uniform(-0.42, 0.42)
        d = random.uniform(0.07, 0.38)
        sphere("dune", sand, 0.1, (x, -d, ZB + 0.06), (1.0, 0.8, 0.22), 14, 8)
    # камни
    for (x, d, z, rx, ry, rz, m) in ((-0.28, 0.2, 0.1, 0.1, 0.075, 0.07, rock), (-0.2, 0.15, 0.1, 0.07, 0.06, 0.06, rock2), (0.3, 0.22, 0.1, 0.12, 0.09, 0.08, rock),
                                     (0.2, 0.3, 0.1, 0.06, 0.05, 0.05, rock2), (0.02, 0.12, 0.1, 0.09, 0.05, 0.12, rock)):
        o = sphere("rock", m, 1.0, (x, -d, ZB + z - 0.0), (rx, ry, rz), 9, 6, (random.uniform(0, 30), random.uniform(0, 30), random.uniform(0, 180)))
    # водоросли
    random.seed(11)
    for (x, d, n, h, mm) in ((-0.38, 0.1, 6, 0.32, plant), (0.4, 0.12, 5, 0.38, plant2), (0.1, 0.07, 5, 0.3, plant), (-0.1, 0.3, 4, 0.2, plant2)):
        for k in range(n):
            a = random.uniform(0, math.tau)
            lean = random.uniform(0.03, 0.09)
            hh = h * random.uniform(0.7, 1.1)
            bx, bd = x + random.uniform(-0.03, 0.03), d + random.uniform(-0.02, 0.02)
            pts = [(bx, -bd, ZB + 0.05)]
            for s in (0.33, 0.66, 1.0):
                pts.append((bx + math.cos(a) * lean * s + 0.015 * math.sin(s * 5 + k), -bd + math.sin(a) * lean * s, ZB + 0.05 + hh * s))
            tube("blade", mm, pts, [0.008, 0.007, 0.005, 0.002], segs=4)
    # рыбки
    def fish(x, d, z, ang, mm, s, flip=1.0):
        snap = set(bpy.data.objects)
        sphere("fbody", mm, 1.0, (0, 0, 0), (0.05 * s, 0.014 * s, 0.03 * s), 10, 6)
        prism_xz("ftail", mm, [(-0.035 * s, 0), (-0.085 * s, 0.032 * s), (-0.075 * s, 0), (-0.085 * s, -0.032 * s)], -0.002, 0.002)
        prism_xz("fdorsal", mm, [(-0.02 * s, 0.022 * s), (0.0, 0.05 * s), (0.02 * s, 0.026 * s)], -0.002, 0.002)
        prism_xz("ffin", mm, [(0.0, -0.02 * s), (-0.02 * s, -0.04 * s), (-0.025 * s, -0.016 * s)], -0.002, 0.002)
        sphere("feye", eyem, 0.006 * s, (0.035 * s, -0.009 * s, 0.006 * s), segs=6, rings=4)
        sphere("feye", eyem, 0.006 * s, (0.035 * s, 0.009 * s, 0.006 * s), segs=6, rings=4)
        M = Matrix.Translation((x, -d, z)) @ Matrix.Rotation(math.radians(ang), 4, "Z") @ Matrix.Scale(flip, 4, (0, 1, 0))
        xform(new_since(snap), M)

    fish(-0.25, 0.22, ZB + 0.28, 10, orange, 1.2)
    fish(0.05, 0.16, ZB + 0.36, 190, yellow, 1.0)
    fish(0.30, 0.3, ZB + 0.22, 170, orange, 1.1)
    fish(-0.38, 0.32, ZB + 0.38, 25, white, 0.9)
    fish(0.18, 0.28, ZB + 0.15, -15, yellow, 0.85)
    fish(-0.05, 0.34, ZB + 0.27, 0, orange, 0.95)
    # фильтр в углу
    C("filter", black, 0.018, 0.34, 0.45, 0.07, ZB + 0.24, segs=10)
    C("filter_head", black, 0.024, 0.04, 0.45, 0.07, ZB + 0.415, segs=10)
    # крышка с лампой
    B("lid", black, X0 - 0.01, X1 + 0.01, 0.0, Y1 + 0.02, ZT, ZT + 0.03, 0.006)
    B("lid_hood", black, X0, X1, 0.0, 0.34, ZT + 0.03, 1.38, 0.01)
    B("lid_front", chrome, X0 + 0.02, X1 - 0.02, 0.34, 0.342, ZT + 0.04, 1.37)
    B("lamp_strip", glowlamp, X0 + 0.06, X1 - 0.06, Y1 + 0.02, Y1 + 0.024, ZT + 0.008, ZT + 0.022)
    B("lamp_under", glowlamp, X0 + 0.03, X1 - 0.03, 0.2, 0.3, ZT - 0.004, ZT)
    C("vent_cap", chrome, 0.012, 0.03, 0.4, 0.2, 1.405, segs=10)


# =====================================================================
# телевизор 65" на стойке, 1,6 м
# =====================================================================
def tv():
    black = mat("tv_black", 0x0c0d10, 0.4, 0.35)
    frame = mat("tv_frame", 0x15171b, 0.5, 0.3)
    metal = mat("tv_metal", 0x2a2d33, 0.8, 0.35)
    screen = mat("screen", 0x1c2a8c, 0.0, 0.2, emit=0x2a3cc8, emit_k=1.0)
    s2 = mat("screen_b", 0x6a3fc0, 0.0, 0.2, emit=0x8a4fe8, emit_k=1.1)
    s3 = mat("screen_c", 0x3aa6e8, 0.0, 0.2, emit=0x4ab8ff, emit_k=1.2)
    s4 = mat("screen_d", 0xe040a0, 0.0, 0.2, emit=0xff58b8, emit_k=1.1)
    led = mat("led_white", 0x202020, 0.0, 0.3, emit=0xffffff, emit_k=2.0)
    TW, TH = 0.72, 0.41  # полуширина и полувысота экрана (65": 1,44 x 0,81)
    ZC = 1.185  # центр экрана
    D0, D1 = 0.20, 0.235
    # основание и стойка
    B("base", metal, -0.36, 0.36, 0.0, 0.42, 0.0, 0.03, 0.012, 3)
    B("base_pad", black, -0.33, 0.33, 0.02, 0.40, 0.0, 0.006)
    prism_side("post", metal, [(0.08, 0.03), (0.2, 0.03), (0.2, 0.0 + 0.8), (0.12, 1.0), (0.08, 1.0)], -0.05, 0.05, 0.008)
    B("cover", black, -0.045, 0.045, 0.2, 0.205, 0.04, 0.9)
    # крепление и корпус
    B("vesa", metal, -0.15, 0.15, 0.185, 0.2, ZC - 0.2, ZC + 0.2, 0.006)
    B("hump", frame, -0.55, 0.55, D0 - 0.003, D0 + 0.0, ZC - 0.28, ZC + 0.27, 0.01)
    B("tv_back", frame, -TW - 0.01, TW + 0.01, D0, D1, ZC - TH - 0.01, ZC + TH + 0.01, 0.01, 3)
    B("hump2", frame, -0.5, 0.5, D0 - 0.03, D0 + 0.003, ZC - 0.2, ZC + 0.18, 0.015, 2)
    # рамка и экран
    B("bezel", black, -TW - 0.01, TW + 0.01, D1, D1 + 0.004, ZC - TH - 0.01, ZC + TH + 0.01, 0.004)
    zf = D1 + 0.004
    B("screen", screen, -TW, TW, zf, zf + 0.001, ZC - TH, ZC + TH)
    # заставка: круги и диагональные полосы
    cyl("scr_c", s2, 0.30, 0.001, loc=(-0.2, -(zf + 0.0015), ZC - 0.02), rot=(90, 0, 0), segs=40)
    cyl("scr_c2", s3, 0.18, 0.001, loc=(0.25, -(zf + 0.0020), ZC + 0.08), rot=(90, 0, 0), segs=36)
    cyl("scr_c3", s4, 0.10, 0.001, loc=(-0.05, -(zf + 0.0025), ZC + 0.12), rot=(90, 0, 0), segs=28)
    prism_xz("scr_w", s3, [(-TW, ZC - TH), (-0.1, ZC - TH), (-0.55, ZC - 0.1), (-TW, ZC - 0.0)], -(zf + 0.0030), -(zf + 0.0020))
    prism_xz("scr_w2", s4, [(TW, ZC - TH), (0.25, ZC - TH), (TW, ZC - 0.12)], -(zf + 0.0030), -(zf + 0.0020))
    B("power_led", led, 0.0, 0.012, zf, zf + 0.002, ZC - TH - 0.008, ZC - TH - 0.004)


# =====================================================================
# современный диван 2 м
# =====================================================================
def sofa_modern():
    grey = mat("sofa_fabric", 0x6c7076, 0.0, 0.92)
    grey2 = mat("sofa_fabric_dark", 0x585c62, 0.0, 0.92)
    leg = mat("sofa_leg", 0x15161a, 1.0, 0.4)
    brassm = mat("sofa_cap", 0xb08d57, 1.0, 0.35)
    mus = mat("pillow_mustard", 0xc79a2b, 0.0, 0.92)
    teal = mat("pillow_teal", 0x2c7a80, 0.0, 0.92)
    W, D = 1.0, 0.92
    for sx in (-1, 1):
        for d in (0.12, D - 0.12):
            tube("leg", leg, [(sx * (W - 0.1) + sx * 0.02, -d - (0.02 if d > 0.5 else -0.02) * 0, 0.0), (sx * (W - 0.1), -d, 0.15)], [0.011, 0.016], segs=8)
            cyl("foot", brassm, 0.013, 0.012, loc=(sx * (W - 0.1) + sx * 0.02, -d, 0.006), segs=10)
    B("base", grey2, -W, W, 0.0, D, 0.14, 0.30, 0.03, 4)
    for sx in (-1, 1):
        x0, x1 = (-W, -W + 0.17) if sx < 0 else (W - 0.17, W)
        B("arm", grey, x0, x1, 0.0, D, 0.14, 0.62, 0.055, 4)
    B("back", grey, -W + 0.1, W - 0.1, 0.0, 0.2, 0.14, 0.74, 0.045, 4)
    xs = [-W + 0.17 + i * (2 * W - 0.34) / 3 for i in range(4)]
    for i in range(3):
        B("seat", grey, xs[i] + 0.004, xs[i + 1] - 0.004, 0.19, D - 0.01, 0.30, 0.46, 0.05, 4)
        cx = (xs[i] + xs[i + 1]) / 2
        w = xs[i + 1] - xs[i] - 0.008
        rbox("back_cush", grey, cx, 0.31, 0.65, w, 0.17, 0.42, -12, 0.05, 4)
    rbox("pillow", mus, -0.68, 0.46, 0.62, 0.36, 0.12, 0.36, -22, 0.05, 4, roty=-8)
    rbox("pillow", teal, 0.66, 0.5, 0.58, 0.34, 0.11, 0.34, -30, 0.05, 4, roty=10)


# =====================================================================
# маркерная доска на колёсах 1,9 м
# =====================================================================
def whiteboard():
    white = mat("wb_surface", 0xf4f6f7, 0.0, 0.25)
    alum = mat("wb_alu", 0xb4b9bf, 1.0, 0.4)
    dark = mat("wb_dark", 0x1d1f23, 0.0, 0.5)
    rubber = mat("wb_rubber", 0x151617, 0.0, 0.85)
    ink = mat("ink_black", 0x16181c, 0.0, 0.4)
    inkb = mat("ink_blue", 0x1f4bd1, 0.0, 0.4)
    inkr = mat("ink_red", 0xcc2222, 0.0, 0.4)
    inkg = mat("ink_green", 0x1f9a44, 0.0, 0.4)
    felt = mat("wb_eraser", 0x2a3a6a, 0.0, 0.9)
    DB, DF = 0.30, 0.322  # поверхность
    # рама и поверхность
    B("surface", white, -0.735, 0.735, 0.296, DF, 0.845, 1.805)
    B("fr_l", alum, -0.76, -0.735, 0.27, 0.33, 0.82, 1.83, 0.005)
    B("fr_r", alum, 0.735, 0.76, 0.27, 0.33, 0.82, 1.83, 0.005)
    B("fr_t", alum, -0.76, 0.76, 0.27, 0.33, 1.805, 1.83, 0.005)
    B("fr_b", alum, -0.76, 0.76, 0.27, 0.33, 0.82, 0.845, 0.005)
    # стойки и ножки
    for sx in (-1, 1):
        xc = sx * 0.79
        B("upright", alum, xc - 0.03, xc + 0.03, 0.26, 0.34, 0.1, 1.9, 0.01)
        B("upright_cap", dark, xc - 0.032, xc + 0.032, 0.258, 0.342, 1.88, 1.9, 0.006)
        B("foot", alum, xc - 0.03, xc + 0.03, 0.0, 0.6, 0.095, 0.13, 0.012)
        B("foot_cap", dark, xc - 0.032, xc + 0.032, -0.004, 0.0, 0.095, 0.13, 0.004)
        for d in (0.045, 0.555):
            B("caster_plate", dark, xc - 0.025, xc + 0.025, d - 0.025, d + 0.025, 0.088, 0.095)
            B("caster_fork", dark, xc - 0.022, xc + 0.022, d - 0.01, d + 0.01, 0.045, 0.09, 0.003)
            C("wheel", rubber, 0.035, 0.026, xc, d, 0.036, "x", 18, bev=0.004)
            C("wheel_hub", alum, 0.014, 0.034, xc, d, 0.036, "x", 10)
    # поперечина внизу
    B("cross", alum, -0.77, 0.77, 0.275, 0.325, 0.1, 0.13, 0.006)
    # полочка с маркерами
    B("tray", alum, -0.70, 0.70, 0.322, 0.40, 0.79, 0.82, 0.005)
    B("tray_lip", alum, -0.70, 0.70, 0.392, 0.40, 0.82, 0.842, 0.003)
    B("tray_back", alum, -0.70, 0.70, 0.322, 0.33, 0.82, 0.842, 0.003)
    for k, mm in enumerate((ink, inkb, inkr, inkg)):
        C("marker", mm, 0.009, 0.125, -0.5 + k * 0.045 - 0.1, 0.355 + 0.006 * (k % 2), 0.838, "x", 10)
        C("marker_cap", dark, 0.0105, 0.04, -0.5 + k * 0.045 - 0.1 + 0.07, 0.355 + 0.006 * (k % 2), 0.838, "x", 10)
    B("eraser", felt, 0.25, 0.37, 0.342, 0.382, 0.82, 0.845, 0.006)
    B("eraser_top", dark, 0.25, 0.37, 0.342, 0.382, 0.845, 0.855, 0.003)
    # каракули: координаты (u от центра, v от центра доски), y перед поверхностью
    ZC = 1.325
    Y = -(DF + 0.0015)

    def L(m, a, b, w=0.008):
        seg_xz("line", m, (a[0], ZC + a[1]), (b[0], ZC + b[1]), w, Y)

    def arrow(m, a, b, w=0.008):
        L(m, a, b, w)
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        for s in (-1, 1):
            p = (b[0] - 0.05 * math.cos(ang + s * 0.5), b[1] - 0.05 * math.sin(ang + s * 0.5))
            L(m, p, b, w)

    random.seed(3)
    # заголовок и подчёркивание
    x = -0.66
    for k in range(7):
        n = random.uniform(0.04, 0.1)
        L(ink, (x, 0.40), (x + n, 0.40), 0.014)
        x += n + 0.025
    L(inkb, (-0.66, 0.35), (x - 0.025, 0.35), 0.01)
    # список с точками
    for i, v in enumerate((0.23, 0.12, 0.01, -0.1)):
        C("dot", ink, 0.011, 0.002, -0.64, DF + 0.0015, ZC + v, "y", 8)
        x = -0.58
        for k in range(random.randint(3, 4)):
            n = random.uniform(0.03, 0.09)
            L(ink, (x, v), (x + n, v), 0.011)
            x += n + 0.02
    # график справа: оси, столбики, стрелка тренда
    L(ink, (0.05, 0.42), (0.05, 0.03), 0.009)
    L(ink, (0.05, 0.03), (0.68, 0.03), 0.009)
    for k, (h, mm) in enumerate(((0.11, inkb), (0.19, inkg), (0.15, inkb), (0.27, inkg))):
        xb = 0.14 + k * 0.13
        B("bar", mm, xb - 0.04, xb + 0.04, DF + 0.0005, DF + 0.0035, ZC + 0.04, ZC + 0.04 + h)
    arrow(inkr, (0.09, 0.2), (0.27, 0.3)), arrow(inkr, (0.27, 0.3), (0.5, 0.25))
    arrow(inkr, (0.5, 0.25), (0.66, 0.41))
    # схема внизу: три блока и стрелки
    for (a, b) in ((-0.66, -0.42), (-0.2, 0.04), (0.26, 0.5)):
        for (p, q) in (((a, -0.2), (b, -0.2)), ((a, -0.36), (b, -0.36)), ((a, -0.2), (a, -0.36)), ((b, -0.2), (b, -0.36))):
            L(inkb, p, q, 0.009)
    arrow(ink, (-0.4, -0.28), (-0.22, -0.28))
    arrow(ink, (0.06, -0.28), (0.24, -0.28))
    for i in range(3):
        L(ink, (-0.62 + i * 0.46, -0.25), (-0.46 + i * 0.46 + (i == 1) * 0.0, -0.25), 0.008)
    # круг и галочка
    torus("circle", inkg, 0.09, 0.005, loc=(0.6, -DF - 0.0015, ZC - 0.28), rot=(90, 0, 0), seg=28, rseg=5)
    L(inkr, (0.56, -0.28), (0.595, -0.32), 0.01), L(inkr, (0.595, -0.32), (0.65, -0.23), 0.01)
    # строчка внизу
    x = -0.66
    for k in range(6):
        n = random.uniform(0.04, 0.1)
        L(ink, (x, -0.43), (x + n, -0.43), 0.011)
        x += n + 0.025


# =====================================================================
# городской велосипед (длина по X, правый бок к -Y, нос к +X)
# =====================================================================
def bicycle():
    frame = mat("bike_frame", 0x2f6f5e, 0.5, 0.35)
    chrome = mat("bike_chrome", 0xc4c8cd, 1.0, 0.3)
    dark = mat("bike_dark", 0x1a1b1e, 0.3, 0.5)
    tire = mat("bike_tire", 0x121212, 0.0, 0.9)
    rim = mat("bike_rim", 0xa8adb3, 1.0, 0.3)
    grip = mat("bike_grip", 0x2a2018, 0.0, 0.8)
    leather = mat("bike_leather", 0x6b3d1d, 0.0, 0.6)
    refl = mat("bike_reflector", 0xc8261f, 0.0, 0.4)
    wire = mat("bike_wire", 0x2a2d31, 0.8, 0.4)
    AX = 0.322
    RX, FX = -0.49, 0.49
    BB = (-0.04, 0.29)

    # колёса
    for cx in (RX, FX):
        torus("tire", tire, 0.30, 0.022, loc=(cx, 0, AX), rot=(90, 0, 0), seg=40, rseg=10)
        o = torus("rim", rim, 0.281, 0.008, loc=(cx, 0, AX), rot=(90, 0, 0), seg=40, rseg=6)
        o.scale = (1, 1, 2.2)
        cyl("hub", chrome, 0.016, 0.1, loc=(cx, 0, AX), rot=(90, 0, 0), segs=12)
        for s in (-1, 1):
            cyl("flange", chrome, 0.032, 0.006, loc=(cx, s * 0.035, AX), rot=(90, 0, 0), segs=16)
        cyl("axle", chrome, 0.006, 0.17, loc=(cx, 0, AX), rot=(90, 0, 0), segs=8)
        for k in range(20):
            a = math.tau * k / 20
            s = 1 if k % 2 else -1
            ah = a + (0.18 if k % 4 < 2 else -0.18)
            p1 = (cx + 0.030 * math.cos(ah), s * 0.035, AX + 0.030 * math.sin(ah))
            p2 = (cx + 0.276 * math.cos(a), s * 0.004, AX + 0.276 * math.sin(a))
            tube("spoke", chrome, [p1, p2], 0.0026, segs=4, caps=False)
    # рама: подседельная труба, ступенчатая дуга, головная труба
    tube("seat_tube", frame, [(BB[0], 0, BB[1]), (-0.19, 0, 0.93)], 0.017, segs=10)
    tube("head_tube", frame, [(0.458, 0, 0.78), (0.395, 0, 0.97)], 0.021, segs=12)
    tube("step_tube", frame, [(0.44, 0, 0.82), (BB[0] + 0.01, 0, BB[1] + 0.01)], 0.02, segs=10)
    tube("top_arch", frame, [(0.42, 0, 0.925), (-0.18, 0, 0.865)], 0.0165, segs=10)
    for s in (-1, 1):
        tube("chain_stay", frame, [(BB[0], s * 0.045, BB[1]), (RX, s * 0.052, AX)], 0.0105, segs=8)
        tube("seat_stay", frame, [(-0.175, s * 0.02, 0.80), (RX, s * 0.052, AX + 0.01)], 0.0095, segs=8)
        tube("fork", chrome, [(0.455, s * 0.04, 0.78), (0.47, s * 0.05, 0.55), (FX, s * 0.052, AX)], 0.0115, segs=8)
    box("crown", chrome, 0.44, 0.47, -0.045, 0.045, 0.755, 0.785, 0.006)
    # руль: вынос и загнутая рогами рукоять
    tube("stem", chrome, [(0.395, 0, 0.97), (0.38, 0, 1.06)], 0.012, segs=8)
    bar = [(0.36, 0.0, 1.06), (0.37, 0.10, 1.065), (0.35, 0.21, 1.08), (0.29, 0.29, 1.10), (0.24, 0.30, 1.105)]
    tube("bar_l", chrome, bar, 0.0115, segs=8)
    tube("bar_r", chrome, [(x, -y, z) for (x, y, z) in bar], 0.0115, segs=8)
    for s in (-1, 1):
        tube("grip", grip, [(0.30, s * 0.25, 1.097), (0.235, s * 0.30, 1.105)], 0.0165, segs=10)
        tube("brake", chrome, [(0.31, s * 0.22, 1.085), (0.36, s * 0.235, 1.07)], 0.004, segs=5)
    sphere("bell", chrome, 0.025, (0.39, -0.09, 1.095), (1, 1, 0.8), 14, 8)
    # фара и сиденье
    cyl("lamp_body", chrome, 0.032, 0.045, loc=(0.50, 0, 0.88), rot=(0, 90, 0), segs=16, r2=0.026)
    sphere("lamp_lens", mat("bike_lens", 0xf1ecd8, 0.0, 0.2), 0.026, (0.525, 0, 0.88), (0.5, 1, 1), 12, 8)
    tube("post", chrome, [(-0.19, 0, 0.90), (-0.21, 0, 1.02)], 0.0125, segs=8)
    sphere("saddle", leather, 0.1, (-0.225, 0, 1.055), (1.5, 1.0, 0.3), 20, 10)
    sphere("saddle_nose", leather, 0.05, (-0.085, 0, 1.048), (1.7, 0.6, 0.38), 12, 8)
    for s in (-1, 1):
        tube("saddle_rail", wire, [(-0.12, s * 0.025, 1.032), (-0.22, s * 0.04, 1.03), (-0.28, s * 0.045, 1.035)], 0.004, segs=5)
    # педали, шатуны, передняя звезда, цепь
    ra = math.radians(-22)
    pc = (BB[0] + 0.17 * math.cos(ra), BB[1] + 0.17 * math.sin(ra))
    pl = (BB[0] - 0.17 * math.cos(ra), BB[1] - 0.17 * math.sin(ra))
    tube("crank_r", chrome, [(BB[0], -0.075, BB[1]), (pc[0], -0.085, pc[1])], 0.009, segs=8)
    tube("crank_l", chrome, [(BB[0], 0.075, BB[1]), (pl[0], 0.085, pl[1])], 0.009, segs=8)
    box("pedal_r", dark, pc[0] - 0.05, pc[0] + 0.05, -0.17, -0.085, pc[1] - 0.012, pc[1] + 0.012, 0.004)
    box("pedal_l", dark, pl[0] - 0.05, pl[0] + 0.05, 0.085, 0.17, pl[1] - 0.012, pl[1] + 0.012, 0.004)
    cyl("bb_shell", chrome, 0.022, 0.1, loc=(BB[0], 0, BB[1]), rot=(90, 0, 0), segs=12)
    torus("chainring", chrome, 0.085, 0.006, loc=(BB[0], -0.062, BB[1]), rot=(90, 0, 0), seg=28, rseg=6)
    for k in range(5):
        a = math.tau * k / 5 + 0.3
        tube("ring_arm", chrome, [(BB[0], -0.064, BB[1]), (BB[0] + 0.08 * math.cos(a), -0.064, BB[1] + 0.08 * math.sin(a))], 0.0045, segs=5)
    cyl("cog", chrome, 0.036, 0.01, loc=(RX, -0.052, AX), rot=(90, 0, 0), segs=16)
    for sz, zr, zc in ((1, 0.085, 0.036), (-1, -0.085, -0.036)):
        tube("chain", dark, [(BB[0], -0.062, BB[1] + zr), (RX, -0.052, AX + zc)], 0.0045, segs=5)
    # крылья
    def fender(cx, a0, a1, name):
        bm = bmesh.new()
        n = 26
        rows = []
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            row = []
            for (y, rr) in ((-0.034, 0.335), (-0.02, 0.343), (0.02, 0.343), (0.034, 0.335)):
                row.append(bm.verts.new((cx + rr * math.cos(a), y, AX + rr * math.sin(a))))
            rows.append(row)
        for i in range(n):
            for j in range(3):
                bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
        wm = mat("bike_fender", 0x2f6f5e, 0.5, 0.35)
        wm.use_backface_culling = False
        return from_bm(bm, name, wm, smooth=True, sharp=0)

    fender(RX, 25, 192, "fender_r")
    fender(FX, -22, 150, "fender_f")
    box("tail", refl, -0.742, -0.722, -0.016, 0.016, 0.205, 0.245, 0.004)
    for s in (-1, 1):
        tube("fender_stay_f", wire, [(FX, s * 0.045, AX), (FX + 0.12, s * 0.036, AX + 0.31)], 0.0028, segs=4)
        tube("fender_stay_r", wire, [(RX, s * 0.045, AX), (RX - 0.1, s * 0.036, AX + 0.31)], 0.0028, segs=4)
    # багажник сзади
    box("rack", wire, -0.70, -0.28, -0.07, 0.07, 0.62, 0.628, 0.003)
    for s in (-1, 1):
        tube("rack_strut", wire, [(-0.68, s * 0.06, 0.624), (RX, s * 0.05, AX + 0.01)], 0.0035, segs=4)
        tube("rack_strut2", wire, [(-0.32, s * 0.06, 0.624), (-0.19, s * 0.02, 0.80)], 0.0035, segs=4)
    # подножка
    tube("kick", wire, [(-0.27, 0.05, 0.30), (-0.33, 0.17, 0.0)], 0.006, segs=6)
    box("kick_foot", dark, -0.37, -0.29, 0.15, 0.2, 0.0, 0.012, 0.004)
    # корзинка спереди
    pts = []
    for (x, y) in ((0.52, -0.14), (0.60, -0.19), (0.80, -0.19), (0.88, -0.14), (0.88, 0.14), (0.80, 0.19), (0.60, 0.19), (0.52, 0.14)):
        pts.append((x, y))
    bot = []
    for (x, y) in pts:
        bot.append((0.54 + (x - 0.52) * 0.88, y * 0.82))
    zt, zb = 0.99, 0.74
    tube("rim_top", wire, [(x, y, zt) for x, y in pts] + [(pts[0][0], pts[0][1], zt)], 0.0045, segs=5, caps=False)
    tube("rim_bot", wire, [(x, y, zb) for x, y in bot] + [(bot[0][0], bot[0][1], zb)], 0.0045, segs=5, caps=False)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        ba, bb = bot[i], bot[(i + 1) % len(bot)]
        for t in (0.0, 0.5):
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            q = (ba[0] + (bb[0] - ba[0]) * t, ba[1] + (bb[1] - ba[1]) * t)
            tube("wire", wire, [(p[0], p[1], zt), (q[0], q[1], zb)], 0.0025, segs=4, caps=False)
    for k in range(6):
        x = 0.58 + k * 0.05
        tube("floor_x", wire, [(x, -0.13, zb), (x, 0.13, zb)], 0.0025, segs=4, caps=False)
    for k in range(5):
        y = -0.1 + k * 0.05
        tube("floor_y", wire, [(0.56, y, zb), (0.84, y, zb)], 0.0025, segs=4, caps=False)
    for s in (-1, 1):
        tube("basket_arm", wire, [(0.53, s * 0.1, 0.80), (0.41, s * 0.02, 0.985)], 0.004, segs=5)
        tube("basket_leg", wire, [(0.56, s * 0.1, 0.745), (0.49, s * 0.05, 0.60)], 0.004, segs=5)


# =====================================================================
# торшер 1,7 м
# =====================================================================
def floorlamp():
    base = mat("fl_base", 0x1b1c1f, 0.8, 0.4)
    brass = mat("fl_brass", 0xb08d57, 1.0, 0.35)
    felt = mat("fl_felt", 0x0e0e0f, 0.0, 0.9)
    shade = mat("lamp_shade", 0xf2d6a0, 0.0, 0.8, emit=0xffc878, emit_k=1.6)
    shade.use_backface_culling = False
    bulb = mat("glow_bulb", 0xfff4d8, 0.0, 0.3, emit=0xfff0c0, emit_k=6.0)
    cx, cd = 0.0, 0.25
    lathe("base_disc", base, [(0.0, 0.0), (0.185, 0.0), (0.195, 0.006), (0.195, 0.03), (0.17, 0.042), (0.09, 0.05), (0.04, 0.058), (0.0, 0.058)], segs=40, loc=(cx, -cd, 0))
    lathe("felt", felt, [(0.0, 0.0), (0.17, 0.0), (0.17, 0.004), (0.0, 0.004)], segs=30, loc=(cx, -cd, 0.0))
    cyl("pole", brass, 0.0105, 1.34, loc=(cx, -cd, 0.72), segs=14)
    cyl("collar1", brass, 0.018, 0.03, loc=(cx, -cd, 0.07), segs=14)
    cyl("collar2", brass, 0.016, 0.02, loc=(cx, -cd, 0.62), segs=14)
    lathe("joint", brass, [(0.0, 1.30), (0.02, 1.30), (0.02, 1.33), (0.013, 1.345), (0.0, 1.345)], segs=14, loc=(cx, -cd, 0))
    # пуговка выключателя
    cyl("switch_body", base, 0.02, 0.04, loc=(cx, -cd - 0.02, 0.95), rot=(90, 0, 0), segs=14)
    cyl("switch_knob", brass, 0.012, 0.015, loc=(cx, -cd - 0.045, 0.95), rot=(90, 0, 0), segs=12)
    # абажур-барабан (тканевый, светится)
    ZB, ZT = 1.33, 1.67
    lathe("shade", shade, [(0.235, ZB), (0.21, (ZB + ZT) / 2), (0.185, ZT)], segs=40, loc=(cx, -cd, 0))
    lathe("shade_in", shade, [(0.232, ZB + 0.003), (0.208, (ZB + ZT) / 2), (0.182, ZT - 0.003)], segs=40, loc=(cx, -cd, 0))
    torus("rim_b", brass, 0.236, 0.0035, loc=(cx, -cd, ZB), seg=40, rseg=6)
    torus("rim_t", brass, 0.186, 0.0035, loc=(cx, -cd, ZT), seg=40, rseg=6)
    # спицы-держатели у верха и колпачок
    for k in range(3):
        a = math.tau * k / 3 + 0.5
        tube("spoke", brass, [(cx, -cd, 1.60), (cx + 0.185 * math.cos(a), -cd + 0.185 * math.sin(a), ZT - 0.01)], 0.0022, segs=4, caps=False)
    cyl("stem_top", brass, 0.0105, 0.28, loc=(cx, -cd, 1.50), segs=10)
    sphere("finial", brass, 0.017, (cx, -cd, 1.675), segs=12, rings=8)
    cyl("socket", base, 0.022, 0.05, loc=(cx, -cd, 1.395), segs=12)
    sphere("bulb", bulb, 0.04, (cx, -cd, 1.46), (1, 1, 1.25), 14, 10)


# =====================================================================
# металлический шкаф-укрытие 1,2 x 0,55 x 2,0
# =====================================================================
def locker():
    paint = mat("locker_paint", 0x7a8794, 0.5, 0.45)
    paint2 = mat("locker_paint_dark", 0x5c6672, 0.5, 0.5)
    dark = mat("locker_dark", 0x0c0d0f, 0.0, 0.7)
    steel = mat("locker_steel", 0xc4c9cf, 1.0, 0.35)
    plate = mat("locker_plate", 0xe4e6e8, 0.0, 0.5)
    num = mat("locker_num", 0x1a1c20, 0.0, 0.5)
    W, D = 0.6, 0.55
    B("plinth", dark, -W + 0.03, W - 0.03, 0.03, D - 0.04, 0.0, 0.1)
    B("carcass", paint2, -W, W, 0.0, D - 0.03, 0.1, 2.0, 0.008)
    B("top_cap", paint, -W - 0.004, W + 0.004, 0.0, D, 1.985, 2.0, 0.005)
    B("front_frame_b", paint, -W, W, D - 0.035, D, 0.1, 0.125, 0.003)
    for sx in (-1, 1):
        x0, x1 = (-W + 0.01, -0.0025) if sx < 0 else (0.0025, W - 0.01)
        B("door", paint, x0, x1, D - 0.03, D, 0.125, 1.975, 0.006)
        # вентиляционные рамки и жалюзи
        cx = (x0 + x1) / 2
        for (z0, z1, n) in ((1.56, 1.9, 8), (0.2, 0.42, 5)):
            B("vent_dark", dark, cx - 0.2, cx + 0.2, D, D + 0.002, z0, z1)
            B("vent_frame_t", paint, cx - 0.22, cx + 0.22, D, D + 0.004, z1, z1 + 0.012, 0.002)
            B("vent_frame_b", paint, cx - 0.22, cx + 0.22, D, D + 0.004, z0 - 0.012, z0, 0.002)
            B("vent_frame_l", paint, cx - 0.22, cx - 0.2, D, D + 0.004, z0 - 0.012, z1 + 0.012, 0.002)
            B("vent_frame_r", paint, cx + 0.2, cx + 0.22, D, D + 0.004, z0 - 0.012, z1 + 0.012, 0.002)
            pitch = (z1 - z0) / n
            for k in range(n):
                rbox("slat", paint, cx, D + 0.003, z0 + pitch * (k + 0.5), 0.4, 0.012, 0.007, 30, 0.001, 1)
        # табличка с номером и окошко для карточки
        B("num_plate", plate, cx - 0.05, cx + 0.05, D, D + 0.004, 1.44, 1.5, 0.002)
        for k in range(3):
            B("digit", num, cx - 0.036 + k * 0.026, cx - 0.036 + k * 0.026 + 0.018, D + 0.004, D + 0.0055, 1.455, 1.485)
        B("card_win", plate, cx - 0.06, cx + 0.06, D, D + 0.003, 1.3, 1.37, 0.002)
        B("card", paint2, cx - 0.05, cx + 0.05, D + 0.003, D + 0.0035, 1.31, 1.36)
        # ручка-рычаг и замок возле центра
        hx = sx * 0.065
        B("handle_plate", steel, hx - 0.025, hx + 0.025, D, D + 0.008, 0.9, 1.2, 0.006)
        B("handle_grip", steel, hx - 0.012, hx + 0.012, D + 0.008, D + 0.032, 0.97, 1.13, 0.008)
        C("lock", steel, 0.012, 0.01, hx, D + 0.013, 0.93, "y", 12)
        B("lock_slot", dark, hx - 0.0015, hx + 0.0015, D + 0.0175, D + 0.0185, 0.922, 0.938)
        # петли у края
        for z in (0.35, 1.05, 1.75):
            C("hinge", steel, 0.009, 0.1, sx * (W - 0.002), D - 0.002, z, "z", 10)
    B("gap", dark, -0.0025, 0.0025, D - 0.02, D - 0.002, 0.125, 1.975)


# =====================================================================
# стена сейфовых ячеек 1,6 x 2,2, глубина 0,4
# =====================================================================
def deposit():
    steel = mat("dep_steel", 0xd2d7dd, 0.85, 0.25)
    door_m = mat("dep_door", 0xa3aab2, 0.75, 0.4)
    brassm = mat("dep_brass", 0xd0a050, 0.8, 0.3)
    dark = mat("dep_dark", 0x121315, 0.0, 0.7)
    FW, FH, FD = 0.8, 2.2, 0.40
    FT = 0.06
    # рамка из полированной стали
    B("fr_b", steel, -FW, FW, 0.0, FD, 0.0, 0.08, 0.008)
    B("fr_t", steel, -FW, FW, 0.0, FD + 0.01, 2.12, FH, 0.012, 3)
    B("fr_cornice", steel, -FW - 0.012, FW + 0.012, 0.0, FD + 0.02, 2.17, FH, 0.01)
    B("fr_l", steel, -FW, -FW + FT, 0.0, FD, 0.08, 2.12, 0.008)
    B("fr_r", steel, FW - FT, FW, 0.0, FD, 0.08, 2.12, 0.008)
    B("backing", dark, -FW + FT, FW - FT, 0.0, FD - 0.03, 0.08, 2.12)
    B("plinth_line", dark, -FW + 0.01, FW - 0.01, FD - 0.002, FD + 0.002, 0.075, 0.082)
    # сетка дверец разного размера
    rows = [(3.0, [1, 1]), (2.0, [1, 1, 1]), (1.6, [1, 1, 1, 1]), (1.2, [1, 1, 1, 1, 1]), (1.2, [1, 1, 1, 1, 1, 1]),
            (1.6, [1.3, 1, 1, 1.3]), (2.0, [1, 1, 1]), (1.2, [1, 1, 1, 1, 1, 1]), (1.6, [1, 1, 1, 1]), (2.4, [1.2, 1]), (1.2, [1, 1, 1, 1, 1, 1])]
    G = 0.012
    fx0, fx1, fz0, fz1 = -FW + FT, FW - FT, 0.08, 2.12
    kh = (fz1 - fz0 - G * (len(rows) + 1)) / sum(r[0] for r in rows)
    z = fz0 + G
    n = 0
    xs_front = FD - 0.03
    for (rh, ws) in rows:
        h = rh * kh
        avail = fx1 - fx0 - G * (len(ws) + 1)
        x = fx0 + G
        for w_rel in ws:
            w = avail * w_rel / sum(ws)
            n += 1
            B("door", door_m, x, x + w, xs_front, xs_front + 0.016, z, z + h, 0.003, 1)
            cx = x + w / 2
            fr = xs_front + 0.016
            # латунный номерок
            B("tag", brassm, x + 0.014, x + 0.014 + 0.05, fr, fr + 0.004, z + h - 0.034, z + h - 0.014, 0.0015, 1)
            B("tag_num", dark, x + 0.022, x + 0.056, fr + 0.004, fr + 0.0048, z + h - 0.027, z + h - 0.021)
            # замочные скважины: две у широких дверец, одна у узких
            kr = 0.012 if h > 0.17 else 0.009
            kz = z + h * 0.45
            kxs = [cx - w * 0.16, cx + w * 0.16] if w > 0.34 else [cx + w * 0.08]
            for kx in kxs:
                C("escutcheon", brassm, kr, 0.006, kx, fr + 0.002, kz, "y", 10)
                B("keyhole", dark, kx - 0.0018, kx + 0.0018, fr + 0.005, fr + 0.0058, kz - kr * 0.55, kz + kr * 0.5)
            x += w + G
        z += h + G
    # тонкая подчёркивающая планка по низу и логотип-пластина
    B("nameplate", brassm, -0.15, 0.15, FD + 0.01, FD + 0.016, 2.14, 2.17, 0.002)
    B("nameplate_txt", dark, -0.11, 0.11, FD + 0.016, FD + 0.0166, 2.147, 2.153)


MODELS = [
    ("atm", atm), ("cooler", cooler), ("flag", flag), ("printer", printer), ("aquarium", aquarium), ("tv", tv),
    ("sofa_modern", sofa_modern), ("whiteboard", whiteboard), ("bicycle", bicycle), ("floorlamp", floorlamp),
    ("locker", locker), ("deposit", deposit),
]
only = os.environ.get("ONLY")
for name, fn in MODELS:
    if only and name not in only.split(","):
        continue
    reset()
    fn()
    finalize(name)
    export(name)
