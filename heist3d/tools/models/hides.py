# Укрытия: старинный шкаф (wardrobe) и бархатная портьера с нишей (drape). Лицо к -Y, зад у стены (y = 0).
import sys, importlib
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
importlib.reload(common)
from common import *


def B(name, m, x0, x1, d0, d1, z0, z1, bev=0.0, segs=2):
    return box(name, m, x0, x1, -d1, -d0, z0, z1, bev, segs)


# ---------- шкаф ----------
reset()
walnut = mat("walnut", 0x4e2c17, 0.0, 0.45)
dark = mat("walnut_dark", 0x2f190c, 0.0, 0.5)
brass = mat("brass", 0xc09650, 0.6, 0.3)
D = 0.62
for sx in (-1, 1):
    for sd in (0.08, D - 0.08):
        lathe("foot", dark, [(0.0, 0.0), (0.035, 0.0), (0.05, 0.03), (0.045, 0.07), (0.055, 0.09), (0.0, 0.09)], segs=14, loc=(sx * 0.55, -sd, 0))
B("plinth", walnut, -0.64, 0.64, 0.0, D + 0.02, 0.09, 0.2, 0.012)
B("carcass", walnut, -0.6, 0.6, 0.0, D - 0.02, 0.2, 2.0)
B("cornice1", walnut, -0.63, 0.63, 0.0, D + 0.01, 1.98, 2.06, 0.01)
B("cornice2", dark, -0.66, 0.66, 0.0, D + 0.04, 2.06, 2.1, 0.008)
B("cornice3", walnut, -0.68, 0.68, 0.0, D + 0.06, 2.1, 2.16, 0.012)
for sx in (-1, 1):
    x0, x1 = (-0.585, -0.004) if sx < 0 else (0.004, 0.585)
    B("door", walnut, x0, x1, D - 0.02, D + 0.005, 0.24, 1.96, 0.006)
    for (z0, z1) in ((0.32, 0.9), (1.0, 1.88)):
        a, b = x0 + 0.07, x1 - 0.07
        B("panel", dark, a, b, D + 0.005, D + 0.012, z0, z1, 0.004)
        B("raise", walnut, a + 0.04, b - 0.04, D + 0.012, D + 0.02, z0 + 0.04, z1 - 0.04, 0.008)
    sphere("knob", brass, 0.018, (sx * 0.05, -(D + 0.03), 1.12), segs=12, rings=8)
B("gap", dark, -0.004, 0.004, D - 0.01, D + 0.004, 0.24, 1.96)
box("keyplate", brass, -0.03, 0.03, -(D + 0.02), -(D + 0.008), 1.18, 1.26, 0.004)
finalize("wardrobe")
export("wardrobe")

# ---------- портьера: карниз, ламбрекен, складки, боковые полотна до стены ----------
reset()
velvet = mat("velvet", 0x5c0d16, 0.0, 0.92)
velvet.use_backface_culling = False
brass = mat("brass", 0xc09650, 0.6, 0.3)
DEP = 0.5     # глубина ниши
WD = 1.7      # ширина
TOP = 2.9


def drape_sheet(name, x0, x1, folds, amp, gather_mid=False):
    bm = bmesh.new()
    NU, NV = 72, 14
    rows = []
    for j in range(NV + 1):
        v = j / NV
        z = 0.01 + v * (TOP - 0.01)
        row = []
        for i in range(NU + 1):
            u = i / NU
            x = x0 + (x1 - x0) * u
            a = amp * (0.75 + 0.25 * (1 - v)) * math.sin(2 * math.pi * folds * u)
            # внизу полотно чуть расходится и ложится на пол
            y = -DEP - a - (0.05 * (1 - v) ** 4)
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(NV):
        for i in range(NU):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    return from_bm(bm, name, velvet, smooth=True, sharp=0)


drape_sheet("left", -WD / 2, 0.02, 4.5, 0.045)
drape_sheet("right", -0.02, WD / 2, 4.5, 0.045)
# боковые полотна от карниза до стены — получается ниша
for sx in (-1, 1):
    bm = bmesh.new()
    rows = []
    for j in range(9):
        z = 0.01 + j / 8 * (TOP - 0.01)
        row = []
        for i in range(13):
            u = i / 12
            y = -DEP * (1 - u)
            x = sx * (WD / 2 + 0.03 * math.sin(2 * math.pi * 2 * u))
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(8):
        for i in range(12):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    from_bm(bm, "side", velvet, smooth=True, sharp=0)
# ламбрекен и карниз
B("pelmet", velvet, -WD / 2 - 0.06, WD / 2 + 0.06, DEP - 0.06, DEP + 0.1, TOP - 0.05, TOP + 0.22, 0.02)
cyl("rod", brass, 0.015, WD + 0.3, loc=(0, -(DEP + 0.12), TOP + 0.24), rot=(0, 90, 0), segs=10)
for sx in (-1, 1):
    sphere("finial", brass, 0.035, (sx * (WD / 2 + 0.17), -(DEP + 0.12), TOP + 0.24), segs=12, rings=8)
# кисти-подхваты по бокам
for sx in (-1, 1):
    tube("tassel_cord", brass, [(sx * (WD / 2 - 0.05), -(DEP + 0.06), 1.15), (sx * (WD / 2 - 0.08), -(DEP + 0.09), 1.05)], 0.006, segs=6)
    cyl("tassel", brass, 0.025, 0.12, loc=(sx * (WD / 2 - 0.08), -(DEP + 0.09), 0.98), segs=10, r2=0.012)
finalize("drape")
export("drape")
