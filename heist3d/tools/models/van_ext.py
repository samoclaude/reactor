# Фургон снаружи для меню и сценок: кузов (body), сдвижная дверь справа (door), четыре колеса (wheel0..3),
# задние створки (rear_l, rear_r — начало узла на петле). Грузовой отсек пустой внутри: за створками
# рабочее место штурмана — стол, три монитора (материал screen, картинку рисует игра), стойка с огоньками.
# Перед — к -Y, правый по ходу борт — -X. Колёса и двери — отдельные узлы, их крутит и двигает игра.
import sys, os, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
importlib.reload(common)
from common import *

reset()
paint = mat("paint", 0x2b3646, 0.5, 0.32)
glass = mat("glass", 0x0b1119, 0.4, 0.05)
black = mat("trim", 0x0e0f11, 0.2, 0.6)
rubber = mat("rubber", 0x151617, 0.0, 0.85)
chrome = mat("chrome", 0xb8bcc2, 0.9, 0.18)
head = mat("headlight", 0xfff3d6, 0.0, 0.2, emit=0xfff0cc, emit_k=3.0)
amber = mat("amber", 0x8a4a08, 0.0, 0.3, emit=0xff8a10, emit_k=0.6)
tail = mat("taillight", 0x7a0a0a, 0.0, 0.3, emit=0xff2010, emit_k=2.0)
tire = mat("tire", 0x121212, 0.0, 0.88)
rim = mat("rim", 0x8a8f96, 0.7, 0.3)
inner = mat("inner", 0x2a2e35, 0.0, 0.8)  # стены отсека
floor_m = mat("floor", 0x18191b, 0.0, 0.9)
desk = mat("desk", 0x3a3328, 0.0, 0.6)
screen = mat("screen", 0x061a12, 0.0, 0.3, emit=0x40ffa0, emit_k=1.2)
led = mat("led", 0x103010, 0.0, 0.3, emit=0x40ff60, emit_k=3.0)
ledr = mat("ledr", 0x301010, 0.0, 0.3, emit=0xff3030, emit_k=3.0)
lamp_in = mat("lamp_in", 0xfff0d0, 0.0, 0.3, emit=0xffe8c0, emit_k=2.5)

YB = -0.7  # стенка за сиденьями: перед ней кабина, за ней отсек
ZF, ZR = 0.32, 2.28  # низ и крыша кузова
HW = 0.99  # полуширина

# ---------------- кабина: профиль сбоку, выдавленный по ширине ----------------
prof = [(YB, ZF), (YB, ZR), (-1.5, ZR), (-2.08, 1.22), (-2.5, 1.06), (-2.56, 0.6), (-2.52, ZF)]
bm = bmesh.new()
vs0 = [bm.verts.new((-HW, y, z)) for (y, z) in prof]
vs1 = [bm.verts.new((HW, y, z)) for (y, z) in prof]
n = len(prof)
bm.faces.new(list(reversed(vs0)))
bm.faces.new(vs1)
for i in range(n):
    j = (i + 1) % n
    bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
cab = from_bm(bm, "cab", paint)
bevel(cab, 0.07, 3, angle=30)
# ---------------- грузовой отсек: стенки, крыша, пол (внутри пусто) ----------------
T = 0.04
box("roof", paint, -HW, HW, YB - 0.05, 2.5, ZR - T, ZR, 0.02)
box("floor", floor_m, -HW + T, HW - T, YB, 2.48, ZF, ZF + 0.16)
box("under", black, -HW, HW, YB, 2.5, ZF - 0.02, ZF + 0.02)
box("wall_l", paint, HW - T, HW, YB - 0.05, 2.5, ZF, ZR, 0.015)  # левый борт (+X) сплошной
# правый борт (-X): проём под сдвижную дверь y -0.65..0.65
box("wall_r1", paint, -HW, -HW + T, 0.65, 2.5, ZF, ZR, 0.015)
box("wall_r2", paint, -HW, -HW + T, YB - 0.05, -0.65, ZF, ZR, 0.015)
box("wall_r3", paint, -HW, -HW + T, -0.65, 0.65, 2.18, ZR, 0.01)
box("wall_r4", paint, -HW, -HW + T, -0.65, 0.65, ZF, 0.42, 0.01)
# внутренняя обшивка
box("in_l", inner, HW - T - 0.02, HW - T, YB, 2.45, ZF + 0.16, ZR - T)
box("in_roof", inner, -HW + T, HW - T, YB, 2.45, ZR - T - 0.02, ZR - T)
box("in_part", inner, -HW + T, HW - T, YB, YB + 0.03, ZF, ZR - T)
# задние стойки с фонарями и уплотнитель проёма
for sx in (-1, 1):
    box("post", paint, sx * HW - (0.06 if sx > 0 else 0), sx * HW + (0.06 if sx < 0 else 0), 2.42, 2.5, ZF, ZR, 0.01)
    box("taillight", tail, sx * 0.965 - 0.035, sx * 0.965 + 0.035, 2.5, 2.52, 0.75, 1.45, 0.008)
    box("indicator_r", amber, sx * 0.965 - 0.035, sx * 0.965 + 0.035, 2.5, 2.52, 0.6, 0.73, 0.006)
box("brake3", tail, -0.2, 0.2, 2.49, 2.51, 2.2, 2.25)
box("seal_top", rubber, -HW, HW, 2.44, 2.5, ZR - 0.07, ZR - 0.03)
# ---------------- рабочее место штурмана у стенки за сиденьями ----------------
box("desk", desk, -0.9, 0.9, YB + 0.03, YB + 0.55, 0.92, 0.96, 0.005)
for sx in (-1, 1):
    box("desk_leg", black, sx * 0.85 - 0.02, sx * 0.85 + 0.02, YB + 0.45, YB + 0.5, ZF + 0.16, 0.92)
for k, x in enumerate((-0.58, 0.0, 0.58)):
    z0 = 1.12 if k != 1 else 1.18
    box("mon", black, x - 0.27, x + 0.27, YB + 0.04, YB + 0.1, z0, z0 + 0.36, 0.01)
    # экран: UV своя третья часть картинки
    bm = bmesh.new()
    lay = bm.loops.layers.uv.verify()
    vv = [bm.verts.new(p) for p in ((x - 0.245, YB + 0.105, z0 + 0.025), (x + 0.245, YB + 0.105, z0 + 0.025), (x + 0.245, YB + 0.105, z0 + 0.335), (x - 0.245, YB + 0.105, z0 + 0.335))]
    f = bm.faces.new(list(reversed(vv)))
    u0, u1 = k / 3, (k + 1) / 3
    for lo in f.loops:
        p = lo.vert.co
        lo[lay].uv = (u0 + (p.x - (x - 0.245)) / 0.49 * (u1 - u0), (p.z - z0 - 0.025) / 0.31)
    from_bm(bm, "screen", screen)
box("keyboard", black, -0.25, 0.25, YB + 0.2, YB + 0.36, 0.96, 0.98, 0.005)
cyl("mug", mat("mug", 0xd8d4cc, 0.0, 0.4), 0.04, 0.1, loc=(0.55, YB + 0.32, 1.01), segs=12)
# стойка с аппаратурой у левого борта
box("rack", black, HW - 0.42, HW - T - 0.02, 0.3, 1.0, ZF + 0.16, 1.7, 0.01)
for i in range(6):
    z = 0.62 + i * 0.17
    box("rack_unit", inner, HW - 0.43, HW - 0.1, 0.32, 0.98, z, z + 0.12, 0.004)
    for j in range(3):
        box("led", led if (i + j) % 3 else ledr, HW - 0.44, HW - 0.43, 0.4 + j * 0.05, 0.43 + j * 0.05, z + 0.05, z + 0.07)
# кресло штурмана
box("seat", rubber, -0.3, 0.3, YB + 0.75, YB + 1.25, 0.62, 0.72, 0.03)
box("seat_back", rubber, -0.28, 0.28, YB + 1.2, YB + 1.28, 0.72, 1.3, 0.03)
cyl("seat_post", black, 0.03, 0.18, loc=(0, YB + 1.0, 0.56), segs=8)
# лампа под потолком
box("lamp_in", lamp_in, -0.35, 0.35, 0.9, 1.05, ZR - T - 0.04, ZR - T - 0.02)
# ---------------- стёкла, зеркала, дворники ----------------
ws = bmesh.new()
pts = [(-0.9, -1.52, 2.2), (0.9, -1.52, 2.2), (0.9, -2.04, 1.3), (-0.9, -2.04, 1.3)]
vv = [ws.verts.new(p) for p in pts]
ws.faces.new(vv)
o = from_bm(ws, "windshield", glass)
o.location = (0, -0.012, 0.004)
for sx in (-1, 1):
    box("sidewin", glass, sx * 1.0 - 0.006, sx * 1.0 + 0.006, -1.5, -0.78, 1.32, 2.05)
    box("cabdoor_seam", black, sx * 1.0 - 0.004, sx * 1.0 + 0.004, -0.76, -0.74, 0.42, 2.1)
    box("cabdoor_seam2", black, sx * 1.0 - 0.004, sx * 1.0 + 0.004, -1.98, -1.96, 0.5, 1.2)
    box("cab_handle", chrome, sx * 1.0 - 0.012 + sx * 0.012, sx * 1.0 + 0.012 + sx * 0.012, -0.98, -0.84, 1.18, 1.22)
    tube("mirror_arm", black, [(sx * 0.99, -1.5, 1.55), (sx * 1.14, -1.53, 1.6)], 0.014, segs=5)
    box("mirror", black, sx * 1.15 - 0.03, sx * 1.15 + 0.03, -1.58, -1.47, 1.4, 1.68, 0.012)
    box("mirror_glass", glass, sx * 1.15 - 0.032, sx * 1.15 + 0.032, -1.465, -1.46, 1.42, 1.66)
    box("side_marker", amber, sx * 1.0 - 0.01, sx * 1.0 + 0.01, -2.2, -2.12, 0.86, 0.9)
    # колёсные арки
    for y in (-1.75, 1.75):
        torus("arch", black, 0.46, 0.05, loc=(sx * 0.99, y, 0.38), rot=(90, 0, 90), seg=24, rseg=6, arc=180)
    box("skirt", black, sx * 1.0 - 0.02, sx * 1.0 + 0.02, -1.25, 1.25, 0.3, 0.42)
for sx in (-1, 1):
    tube("wiper", black, [(sx * 0.62, -2.02, 1.34), (sx * 0.1, -1.9, 1.6)], 0.008, segs=4)
# топливный лючок (левый борт)
cyl("fuel", paint, 0.07, 0.02, loc=(HW + 0.005, 1.2, 1.2), rot=(0, 90, 0), segs=14)
# сдвижная дверь: направляющая
box("rail", black, -HW - 0.01, -HW + 0.005, -0.7, 2.3, 1.98, 2.0)
# ---------------- перед: решётка, фары, поворотники, бампер, номер ----------------
box("grille", black, -0.62, 0.62, -2.585, -2.55, 0.66, 1.0, 0.01)
for k in range(5):
    z = 0.7 + k * 0.065
    box("grille_bar", chrome, -0.58, 0.58, -2.6, -2.585, z, z + 0.018)
for sx in (-1, 1):
    box("headlight", head, sx * 0.79 - 0.15, sx * 0.79 + 0.15, -2.58, -2.54, 0.8, 0.98, 0.01)
    box("indicator", amber, sx * 0.79 - 0.15, sx * 0.79 + 0.15, -2.575, -2.545, 0.72, 0.78, 0.006)
    cyl("foglight", head, 0.045, 0.02, loc=(sx * 0.72, -2.67, 0.42), rot=(90, 0, 0), segs=12)
box("bumper_f", rubber, -1.0, 1.0, -2.66, -2.45, 0.28, 0.55, 0.03)
box("plate_f", chrome, -0.26, 0.26, -2.67, -2.66, 0.36, 0.47)
box("tow", black, -0.05, 0.05, -2.72, -2.66, 0.3, 0.35)
# ---------------- зад: бампер-ступенька, номер ----------------
box("bumper_r", rubber, -1.0, 1.0, 2.45, 2.66, 0.28, 0.5, 0.03)
box("step", black, -0.5, 0.5, 2.6, 2.72, 0.42, 0.46)
# ---------------- крыша: рейлинги, антенны, тарелка «фургона наблюдения» ----------------
for x in (-0.72, 0.72):
    box("rack", black, x - 0.025, x + 0.025, -1.3, 2.3, ZR + 0.06, ZR + 0.1)
    for y in (-1.2, 2.2):
        box("rack_foot", black, x - 0.03, x + 0.03, y - 0.04, y + 0.04, ZR, ZR + 0.08)
for y in (-0.6, 0.4, 1.4):
    box("rack_x", black, -0.72, 0.72, y - 0.02, y + 0.02, ZR + 0.1, ZR + 0.13)
cyl("antenna", black, 0.008, 0.9, loc=(0.5, 1.9, ZR + 0.47), segs=6)
cyl("antenna2", black, 0.006, 0.6, loc=(-0.55, 2.1, ZR + 0.32), segs=6)
lathe("dish", chrome, [(0.0, 0.0), (0.2, 0.06), (0.24, 0.1), (0.0, 0.1)], segs=18, loc=(-0.3, 1.4, ZR + 0.12))
cyl("dish_post", black, 0.02, 0.12, loc=(-0.3, 1.4, ZR + 0.08), segs=6)
finalize("body")

# ---------------- сдвижная дверь на правом по ходу борту (-X) ----------------
box("door", paint, -1.02, -0.99, -0.65, 0.65, 0.42, 2.18, 0.01)
box("door_win", glass, -1.025, -1.02, -0.55, 0.3, 1.35, 2.0)
box("door_handle", chrome, -1.045, -1.025, -0.6, -0.46, 1.15, 1.2)
box("door_seam", black, -1.022, -1.018, -0.66, -0.64, 0.42, 2.18)
finalize("door")

# ---------------- задние створки: начало узла — на петле, створка тянется к середине ----------------
for nm, sx in (("rear_l", 1), ("rear_r", -1)):
    # sx = 1: петля у +X, створка до x = 0 (в осях узла: от 0 до -0.93)
    box("rd", paint, -sx * 0.93 if sx > 0 else 0, 0 if sx > 0 else 0.93, -0.02, 0.025, ZF + 0.08, ZR - 0.05, 0.01)
    x0, x1 = (-0.8, -0.12) if sx > 0 else (0.12, 0.8)
    box("rd_win", glass, x0, x1, 0.026, 0.03, 1.5, 2.05)
    box("rd_win_in", glass, x0, x1, -0.025, -0.021, 1.5, 2.05)
    hx = -0.86 if sx > 0 else 0.86
    box("rd_handle", chrome, hx - 0.07, hx + 0.07, 0.025, 0.045, 1.15, 1.19)
    box("rd_inner", inner, -sx * 0.9 if sx > 0 else 0.03, -0.03 if sx > 0 else 0.9, -0.03, -0.02, ZF + 0.15, 1.45)
    if sx > 0:
        box("plate_r", chrome, -0.6, -0.12, 0.028, 0.034, 0.56, 0.67)
    for z in (0.7, 1.9):
        cyl("hinge", black, 0.025, 0.12, loc=(0, 0.0, z), segs=8)
    root = finalize(nm)
    root.location = (sx * 0.935, 2.5, 0)

# ---------------- колёса: каждое отдельно, начало — на оси ----------------
for k, (sx, y) in enumerate(((-1, -1.75), (1, -1.75), (-1, 1.75), (1, 1.75))):
    lathe("tire", tire, [(0.2, -0.12), (0.33, -0.125), (0.36, -0.08), (0.365, 0.0), (0.36, 0.08), (0.33, 0.125), (0.2, 0.12)],
          segs=24, rot=(0, 90, 0), sharp=50)
    cyl("rim", rim, 0.215, 0.2, loc=(0, 0, 0), rot=(0, 90, 0), segs=18)
    for s in range(6):
        a = s * 60
        b = box("spoke", chrome, -0.012, 0.012, -0.03, 0.03, 0.05, 0.19)
        # спица от ступицы к ободу: центр на 0,12 м от оси, повёрнут вокруг оси колеса
        b.location = (sx * 0.105, -0.12 * math.sin(math.radians(a)), 0.12 * math.cos(math.radians(a)))
        b.rotation_euler = Euler((math.radians(a), 0, 0))
    cyl("hub", chrome, 0.06, 0.22, loc=(0, 0, 0), rot=(0, 90, 0), segs=12)
    w = finalize("wheel%d" % k)
    w.location = (sx * 0.92, y, 0.36)
export("van_ext")
