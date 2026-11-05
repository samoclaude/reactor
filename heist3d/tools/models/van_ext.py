# Фургон снаружи для сценок: кузов (body), сдвижная дверь справа (door), четыре колеса (wheel0..3).
# Перед — к -Y, правый по ходу борт — -X. Колёса и дверь — отдельные узлы, их крутит и двигает игра.
import sys, os, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common
importlib.reload(common)
from common import *

reset()
paint = mat("paint", 0x1f2a38, 0.35, 0.35)
glass = mat("glass", 0x0b1119, 0.4, 0.06)
black = mat("trim", 0x0e0f11, 0.2, 0.6)
chrome = mat("chrome", 0xb8bcc2, 0.6, 0.2)
head = mat("headlight", 0xfff3d6, 0.0, 0.2, emit=0xfff0cc, emit_k=3.0)
tail = mat("taillight", 0x7a0a0a, 0.0, 0.3, emit=0xff2010, emit_k=2.0)
tire = mat("tire", 0x111111, 0.0, 0.85)
rim = mat("rim", 0x8a8f96, 0.5, 0.35)

# кузов: боковой профиль (y, z) выдавлен по ширине
prof = [(2.5, 0.32), (2.5, 2.28), (-1.5, 2.28), (-2.08, 1.22), (-2.5, 1.06), (-2.56, 0.6), (-2.52, 0.32)]
bm = bmesh.new()
for sx in (-1, 1):
    pass
vs0 = [bm.verts.new((-0.99, y, z)) for (y, z) in prof]
vs1 = [bm.verts.new((0.99, y, z)) for (y, z) in prof]
n = len(prof)
bm.faces.new(list(reversed(vs0)))
bm.faces.new(vs1)
for i in range(n):
    j = (i + 1) % n
    bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
body = from_bm(bm, "shell", paint)
bevel(body, 0.07, 3, angle=30)
# стёкла: лобовое по наклону, боковые у кабины, задние
ws = bmesh.new()
pts = [(-0.9, -1.52, 2.2), (0.9, -1.52, 2.2), (0.9, -2.04, 1.3), (-0.9, -2.04, 1.3)]
vv = [ws.verts.new(p) for p in pts]
ws.faces.new(vv)
o = from_bm(ws, "windshield", glass)
o.location = (0, -0.012, 0.004)
for sx in (-1, 1):
    box("sidewin", glass, sx * 1.0 - 0.006, sx * 1.0 + 0.006, -1.5, -0.75, 1.32, 2.05)
    box("mirror_arm", black, sx * 1.0, sx * 1.12, -1.55, -1.48, 1.55, 1.6)
    box("mirror", black, sx * 1.1 - 0.03, sx * 1.1 + 0.03, -1.56, -1.46, 1.42, 1.66, 0.01)
    # колёсные арки
    for y in (-1.75, 1.75):
        cyl("arch", black, 0.44, 0.06, loc=(sx * 0.99, y, 0.38), rot=(0, 90, 0), segs=20)
for sx in (-1, 1):
    box("rearwin", glass, sx * 0.45 - 0.38, sx * 0.45 + 0.38, 2.5, 2.512, 1.5, 2.05)
box("rear_split", black, -0.02, 0.02, 2.5, 2.515, 0.4, 2.2)
# решётка, фары, бампера, номера
box("grille", black, -0.6, 0.6, -2.585, -2.55, 0.68, 0.98, 0.01)
for sx in (-1, 1):
    box("headlight", head, sx * 0.78 - 0.16, sx * 0.78 + 0.16, -2.58, -2.54, 0.78, 0.98, 0.01)
    box("taillight", tail, sx * 0.93 - 0.06, sx * 0.93 + 0.06, 2.5, 2.52, 0.7, 1.4, 0.008)
box("bumper_f", black, -1.0, 1.0, -2.66, -2.45, 0.3, 0.55, 0.03)
box("bumper_r", black, -1.0, 1.0, 2.45, 2.62, 0.3, 0.52, 0.03)
box("plate_f", chrome, -0.26, 0.26, -2.67, -2.66, 0.38, 0.48)
box("plate_r", chrome, -0.26, 0.26, 2.62, 2.63, 0.56, 0.66)
box("sill", black, -1.0, 1.0, -1.5, 1.4, 0.3, 0.42)
# крыша: багажник и антенны «фургона наблюдения»
for x in (-0.7, 0.7):
    box("rack", black, x - 0.03, x + 0.03, -1.2, 2.2, 2.28, 2.34)
cyl("antenna", black, 0.008, 0.9, loc=(0.5, 1.9, 2.75), segs=6)
lathe("dish", chrome, [(0.0, 0.0), (0.2, 0.06), (0.24, 0.1), (0.0, 0.1)], segs=18, loc=(-0.3, 1.4, 2.36))
finalize("body")

# сдвижная дверь на правом по ходу борту — это -X (в игре едет назад)
box("door", paint, -1.02, -0.99, -0.65, 0.65, 0.42, 2.18, 0.01)
box("door_win", glass, -1.025, -1.02, -0.55, 0.3, 1.35, 2.0)
box("door_handle", chrome, -1.04, -1.025, -0.6, -0.48, 1.15, 1.2)
finalize("door")

# колёса: каждое отдельно, начало — на оси
for k, (sx, y) in enumerate(((-1, -1.75), (1, -1.75), (-1, 1.75), (1, 1.75))):
    cyl("tire", tire, 0.36, 0.24, loc=(0, 0, 0), rot=(0, 90, 0), segs=22)
    cyl("rim", rim, 0.22, 0.25, loc=(0, 0, 0), rot=(0, 90, 0), segs=16)
    cyl("hub", chrome, 0.06, 0.26, loc=(0, 0, 0), rot=(0, 90, 0), segs=10)
    w = finalize("wheel%d" % k)
    w.location = (sx * 0.92, y, 0.36)
export("van_ext")
