// Сборка 3D-здания из клеток уровня.
// Клетки с нечётными x и y — комнаты (ROOM м), остальные — стены и проёмы толщиной WALL м.
// Открытая клетка-перемычка — дверной проём шириной DOOR_W посередине стены.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LM } from "./logic.js";

export const ROOM = 3.6,
  WALL = 0.9,
  SPAN = ROOM + WALL,
  DOOR_W = 1.5,
  CEIL = 3.2,
  DOOR_H = 2.35,
  SUB = 0.15;
const HALF = (ROOM - DOOR_W) / 2; // кусок стены по бокам проёма
const WAINSCOT = 1.0; // высота деревянной панели снизу

export const x0Of = (i) => Math.floor(i / 2) * SPAN + (i % 2 ? WALL : 0);
export const sizeOf = (i) => (i % 2 ? ROOM : WALL);
export const cOf = (i) => x0Of(i) + sizeOf(i) / 2;
export const idxOf = (X) => {
  const k = Math.floor(X / SPAN),
    r = X - k * SPAN;
  return 2 * k + (r < WALL ? 0 : 1);
};
export const cellXZ = (lv, c) => [cOf(c % lv.W), cOf((c / lv.W) | 0)];
export function cellAt(lv, X, Z) {
  const x = idxOf(X),
    y = idxOf(Z);
  if (x < 0 || y < 0 || x >= lv.W || y >= lv.H) return -1;
  return y * lv.W + x;
}
// поворот лица: 0 — север (−Z), 1 — восток (+X), 2 — юг (+Z), 3 — запад (−X)
export const yawOf = (k) => (-k * Math.PI) / 2;
const isRoom = (lv, c) => (c % lv.W) % 2 === 1 && ((c / lv.W) | 0) % 2 === 1;

/* ---------- растр проходимости с шагом SUB: по нему строятся стены и упираются игроки ---------- */
export function makeRaster(lv) {
  const totX = x0Of(lv.W - 1) + WALL,
    totZ = x0Of(lv.H - 1) + WALL;
  const NX = Math.round(totX / SUB),
    NZ = Math.round(totZ / SUB),
    walk = new Uint8Array(NX * NZ);
  for (let sz = 0; sz < NZ; sz++)
    for (let sx = 0; sx < NX; sx++) {
      const X = (sx + 0.5) * SUB,
        Z = (sz + 0.5) * SUB,
        x = idxOf(X),
        y = idxOf(Z),
        c = y * lv.W + x;
      if (!lv.g[c]) continue;
      const lx = X - x0Of(x),
        lz = Z - x0Of(y);
      if (x % 2 && y % 2) walk[sz * NX + sx] = 1;
      else if (x % 2 === 0 && y % 2 && lz > HALF && lz < ROOM - HALF)
        walk[sz * NX + sx] = 1;
      else if (y % 2 === 0 && x % 2 && lx > HALF && lx < ROOM - HALF)
        walk[sz * NX + sx] = 1;
    }
  const block = new Uint8Array(NX * NZ); // мебель и закрытые двери: стен не дают, но не пускают
  return { NX, NZ, walk, block, totX, totZ };
}
export function rasterFree(R, X, Z) {
  const sx = Math.floor(X / SUB),
    sz = Math.floor(Z / SUB);
  if (sx < 0 || sz < 0 || sx >= R.NX || sz >= R.NZ) return false;
  const k = sz * R.NX + sx;
  return R.walk[k] === 1 && R.block[k] === 0;
}
export function blockRect(R, x0, z0, x1, z1, v = 1) {
  for (let sz = Math.floor(z0 / SUB); sz < Math.ceil(z1 / SUB); sz++)
    for (let sx = Math.floor(x0 / SUB); sx < Math.ceil(x1 / SUB); sx++)
      if (sx >= 0 && sz >= 0 && sx < R.NX && sz < R.NZ)
        R.block[sz * R.NX + sx] = v;
}

/* ---------- границы проходимой области: отрезки стен с нормалью внутрь комнаты ---------- */
function wallSegments(R) {
  const { NX, NZ, walk } = R,
    w = (x, z) =>
      x >= 0 && z >= 0 && x < NX && z < NZ && walk[z * NX + x] === 1,
    segs = [];
  for (let z = 0; z <= NZ; z++) {
    // линии вдоль X
    let run = null;
    for (let x = 0; x <= NX; x++) {
      const a = w(x, z - 1),
        b = w(x, z),
        n = x < NX && a !== b ? (b ? 1 : -1) : 0;
      if (run && run.n !== n) {
        segs.push({
          ax: "x",
          a: run.s * SUB,
          b: x * SUB,
          c: z * SUB,
          n: run.n,
        });
        run = null;
      }
      if (n && !run) run = { s: x, n };
    }
  }
  for (let x = 0; x <= NX; x++) {
    // линии вдоль Z
    let run = null;
    for (let z = 0; z <= NZ; z++) {
      const a = w(x - 1, z),
        b = w(x, z),
        n = z < NZ && a !== b ? (b ? 1 : -1) : 0;
      if (run && run.n !== n) {
        segs.push({
          ax: "z",
          a: run.s * SUB,
          b: z * SUB,
          c: x * SUB,
          n: run.n,
        });
        run = null;
      }
      if (n && !run) run = { s: z, n };
    }
  }
  return segs;
}

/* ---------- сборщик геометрии с UV в метрах (текстуры не тянутся) ---------- */
class Builder {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.idx = [];
  }
  quad(a, b, c, d, nrm, uva, uvb, uvc, uvd) {
    const i = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    for (const t of [uva, uvb, uvc, uvd]) this.uv.push(t[0], t[1]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  // вертикальный прямоугольник на отрезке стены; uv: u — координата вдоль стены, v — высота
  wall(s, y0, y1, inset = 0) {
    let { a, b } = s;
    const c = s.c + s.n * inset;
    if (s.ax === "x") {
      if (s.n < 0) [a, b] = [b, a];
      this.quad(
        [a, y0, c],
        [b, y0, c],
        [b, y1, c],
        [a, y1, c],
        [0, 0, s.n],
        [a, y0],
        [b, y0],
        [b, y1],
        [a, y1],
      );
    } else {
      if (s.n > 0) [a, b] = [b, a];
      this.quad(
        [c, y0, a],
        [c, y0, b],
        [c, y1, b],
        [c, y1, a],
        [s.n, 0, 0],
        [a, y0],
        [b, y0],
        [b, y1],
        [a, y1],
      );
    }
  }
  // горизонтальный прямоугольник (пол, потолок, низ перемычки)
  flat(x0, z0, x1, z1, y, up) {
    if (up)
      this.quad(
        [x0, y, z1],
        [x1, y, z1],
        [x1, y, z0],
        [x0, y, z0],
        [0, 1, 0],
        [x0, z1],
        [x1, z1],
        [x1, z0],
        [x0, z0],
      );
    else
      this.quad(
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z1],
        [x0, y, z1],
        [0, -1, 0],
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      );
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
function box(list, x0, y0, z0, x1, y1, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  list.push(g);
}

/* ---------- материалы: пока цветом, текстуры подставит theme ---------- */
export function makeMaterials(tex) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    floor: std(
      Object.assign({ color: 0x6a5038, roughness: 0.55 }, tex && tex.floor),
    ),
    upper: std(
      Object.assign({ color: 0x4d5560, roughness: 0.9 }, tex && tex.upper),
    ),
    lower: std(
      Object.assign({ color: 0x3b2a1e, roughness: 0.6 }, tex && tex.lower),
    ),
    ceil: std(
      Object.assign({ color: 0x8b8679, roughness: 0.95 }, tex && tex.ceil),
    ),
    // отделка — тёмный орех: кремовая в луче фонаря светилась как пластик
    trim: std({ color: 0x3a281c, roughness: 0.45 }),
    stone: std(
      Object.assign({ color: 0x9a948a, roughness: 0.35 }, tex && tex.stone),
    ),
    metal: std({ color: 0x40444a, roughness: 0.35, metalness: 0.8 }),
    dark: std({ color: 0x1a1816, roughness: 0.8 }),
    door: std({ color: 0x4a3020, roughness: 0.5 }), // створки: текстура филёнок подставится в loadTheme
    brass: std({ color: 0xb08a4a, roughness: 0.3, metalness: 0.9 }),
    velvet: std({ color: 0x3a0b12, roughness: 0.95, side: THREE.DoubleSide }),
    steel: std({ color: 0x3b4146, roughness: 0.6, metalness: 0.45 }),
  };
}

/* ---------- само здание ---------- */
export function buildShell(lv, R, M) {
  const group = new THREE.Group(),
    segs = wallSegments(R);
  const lower = new Builder(),
    upper = new Builder(),
    floor = new Builder(),
    ceil = new Builder(),
    trims = [];
  for (const s of segs) {
    lower.wall(s, 0, WAINSCOT);
    upper.wall(s, WAINSCOT, CEIL);
    const L = s.b - s.a;
    if (L < 0.2) continue;
    // плинтус, поясок панели и карниз — тонкие бруски вдоль стены
    const strip = (y0, y1, d) => {
      if (s.ax === "x") {
        const z = s.c,
          zz = z + s.n * d;
        box(trims, s.a, y0, Math.min(z, zz), s.b, y1, Math.max(z, zz));
      } else {
        const x = s.c,
          xx = x + s.n * d;
        box(trims, Math.min(x, xx), y0, s.a, Math.max(x, xx), y1, s.b);
      }
    };
    strip(0, 0.14, 0.025);
    strip(WAINSCOT - 0.05, WAINSCOT, 0.03);
    if (L > 1.0) strip(CEIL - 0.11, CEIL, 0.06);
  }
  floor.flat(0, 0, R.totX, R.totZ, 0, true);
  ceil.flat(0, 0, R.totX, R.totZ, CEIL, false);
  // перемычки над проёмами и наличники
  const doorways = [];
  for (let c = 0; c < lv.g.length; c++) {
    if (!lv.g[c] || isRoom(lv, c)) continue;
    const x = c % lv.W,
      y = (c / lv.W) | 0,
      alongX = x % 2 === 0; // проход вдоль X или вдоль Z
    let x0, x1, z0, z1;
    if (alongX) {
      x0 = x0Of(x);
      x1 = x0 + WALL;
      z0 = x0Of(y) + HALF;
      z1 = z0 + DOOR_W;
    } else {
      z0 = x0Of(y);
      z1 = z0 + WALL;
      x0 = x0Of(x) + HALF;
      x1 = x0 + DOOR_W;
    }
    doorways.push({ c, alongX, x0, x1, z0, z1 });
    upper.flat(x0, z0, x1, z1, DOOR_H, false);
    if (alongX) {
      upper.wall({ ax: "z", a: z0, b: z1, c: x0, n: -1 }, DOOR_H, CEIL);
      upper.wall({ ax: "z", a: z0, b: z1, c: x1, n: 1 }, DOOR_H, CEIL);
      for (const [xx, d] of [
        [x0, -0.03],
        [x1, 0.03],
      ]) {
        const a = Math.min(xx, xx + d),
          b = Math.max(xx, xx + d);
        box(trims, a, 0, z0 - 0.1, b, DOOR_H + 0.1, z0);
        box(trims, a, 0, z1, b, DOOR_H + 0.1, z1 + 0.1);
        box(trims, a, DOOR_H, z0 - 0.1, b, DOOR_H + 0.12, z1 + 0.1);
      }
    } else {
      upper.wall({ ax: "x", a: x0, b: x1, c: z0, n: -1 }, DOOR_H, CEIL);
      upper.wall({ ax: "x", a: x0, b: x1, c: z1, n: 1 }, DOOR_H, CEIL);
      for (const [zz, d] of [
        [z0, -0.03],
        [z1, 0.03],
      ]) {
        const a = Math.min(zz, zz + d),
          b = Math.max(zz, zz + d);
        box(trims, x0 - 0.1, 0, a, x0, DOOR_H + 0.1, b);
        box(trims, x1, 0, a, x1 + 0.1, DOOR_H + 0.1, b);
        box(trims, x0 - 0.1, DOOR_H, a, x1 + 0.1, DOOR_H + 0.12, b);
      }
    }
  }
  const add = (geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  add(lower.build(), M.lower);
  add(upper.build(), M.upper);
  add(floor.build(), M.floor, false);
  add(ceil.build(), M.ceil, false);
  if (trims.length) add(mergeGeometries(trims), M.trim);
  return { group, segs, doorways };
}

/* ---------- куда вешать ориентир: на стену комнаты со стороны клетки-стены ---------- */
// с какой стороны стены висит ориентир: d — направление от клетки стены в комнату (0 вверх, 1 вправо, 2 вниз, 3 влево).
// Висит только с одной стороны: иначе копии спиной к спине в двух коридорах, и «справа картина» подходит к обоим.
// Выбор одинаковый у вора и штурмана; комнату старта берём в первую очередь (в обучении у старта ориентир)
export function landmarkSide(lv, t) {
  const x = t % lv.W,
    y = (t / lv.W) | 0,
    rooms = [],
    starts = (lv.starts || []).map((s) => s.s).concat(lv.S);
  for (let d = 0; d < 4; d++) {
    const nx = x + [0, 1, 0, -1][d],
      ny = y + [-1, 0, 1, 0][d];
    if (nx < 0 || ny < 0 || nx >= lv.W || ny >= lv.H) continue;
    if (nx % 2 === 0 || ny % 2 === 0 || !lv.g[ny * lv.W + nx]) continue;
    if (starts.includes(ny * lv.W + nx)) return d;
    // в комнату с сейфом — только если другой стороны нет: сейф стоит у дальней стены и закрыл бы ориентир
    if (lv.safe && ny * lv.W + nx === lv.gem) rooms.gem = d;
    else rooms.push(d);
  }
  if (!rooms.length) return rooms.gem != null ? rooms.gem : -1;
  return rooms[((t * 2654435761) >>> 0) % rooms.length];
}
export function landmarkSpots(lv) {
  const out = [];
  for (const k in lv.deco) {
    const t = +k,
      x = t % lv.W,
      y = (t / lv.W) | 0,
      side = landmarkSide(lv, t);
    for (let d = 0; d < 4; d++) {
      if (d !== side) continue;
      const DXk = [0, 1, 0, -1][d],
        DYk = [-1, 0, 1, 0][d],
        nx = x + DXk,
        ny = y + DYk;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= lv.W ||
        ny >= lv.H ||
        nx % 2 === 0 ||
        ny % 2 === 0 ||
        !lv.g[ny * lv.W + nx]
      )
        continue;
      // комната с этой стороны; стена у неё в направлении, обратном d
      const wallDir = (d + 2) % 4,
        cx = cOf(nx),
        cz = cOf(ny);
      const wx = cx + ([0, 1, 0, -1][wallDir] * ROOM) / 2,
        wz = cz + ([-1, 0, 1, 0][wallDir] * ROOM) / 2;
      out.push({
        wallCell: t,
        room: ny * lv.W + nx,
        li: lv.deco[k],
        wallDir,
        x: wx,
        z: wz,
        yaw: yawOf(wallDir),
      });
    }
  }
  return out;
}

/* ---------- заглушка ориентира: брусок с подписью (заменится моделью) ---------- */
const labelCache = new Map();
export function labelTexture(text, color = "#f2e6c8") {
  if (labelCache.has(text)) return labelCache.get(text);
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext("2d");
  g.fillStyle = "rgba(0,0,0,.55)";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = color;
  g.font = 'bold 34px "PT Mono", monospace';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(text, t);
  return t;
}
export function placeholderLandmark(li) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x8c6b4a, roughness: 0.6 }),
  );
  m.position.set(0, 0.6, 0.2);
  m.castShadow = true;
  g.add(m);
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: labelTexture(LM[li][1]), depthTest: true }),
  );
  s.scale.set(1.2, 0.3, 1);
  s.position.set(0, 1.55, 0.25);
  g.add(s);
  return g;
}

/* ======================================================================
   ПРЕДМЕТЫ УРОВНЯ: лазеры, охрана, сейф, дверь, записка, выход, окна, лампы
   ====================================================================== */
const hash01 = (seed, k) => {
  let h = 2166136261 ^ k;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const dirV = (d) =>
  [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][d];

// мягкое пятно света для свечения (аддитивный спрайт)
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d"),
    gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.25, "rgba(255,255,255,.45)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  s.scale.set(size, size, 1);
  return s;
}

/* ---------- лазер: три луча поперёк проёма и излучатели на косяках ---------- */
export function buildLaser(lv, l) {
  const x = l.i % lv.W,
    y = (l.i / lv.W) | 0,
    alongX = x % 2 === 0;
  const g = new THREE.Group();
  g.position.set(cOf(x), 0, cOf(y));
  if (!alongX) g.rotation.y = Math.PI / 2;
  const core = new THREE.MeshBasicMaterial({
    color: 0xff2a1e,
    toneMapped: false,
  });
  const halo = new THREE.MeshBasicMaterial({
    color: 0xff3020,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  // три луча склеены в один меш (сердцевина) и один (ореол): меньше вызовов отрисовки
  const beamGeo = (r, seg, open) =>
    mergeGeometries(
      [0.32, 0.78, 1.24].map((h) =>
        new THREE.CylinderGeometry(r, r, DOOR_W, seg, 1, open)
          .rotateX(Math.PI / 2)
          .translate(0, h, 0),
      ),
    );
  const beams = new THREE.Group();
  beams.add(
    new THREE.Mesh(beamGeo(0.006, 6, false), core),
    new THREE.Mesh(beamGeo(0.035, 8, true), halo),
  );
  g.add(beams);
  const body = new THREE.MeshStandardMaterial({
    color: 0x24262a,
    roughness: 0.4,
    metalness: 0.7,
  });
  const led = new THREE.MeshBasicMaterial({
    color: 0xff2a1e,
    toneMapped: false,
  });
  // стойки и огоньки тоже склеены: одна пара стоек, один меш огоньков
  const posts = [],
    dots = [];
  for (const s of [-1, 1]) {
    posts.push(
      new THREE.BoxGeometry(0.07, 1.4, 0.05).translate(
        0,
        0.75,
        s * (DOOR_W / 2 - 0.025),
      ),
    );
    for (const h of [0.32, 0.78, 1.24]) {
      const p = new THREE.Vector3(0, h, s * (DOOR_W / 2 - 0.055));
      dots.push(new THREE.SphereGeometry(0.018, 8, 6).translate(p.x, p.y, p.z));
      // ореол огонька: по нему вор замечает лазер, даже когда лучей не видно
      const halo = glowSprite(0xff2a1e, 0.16, 0.7);
      halo.position.copy(p);
      g.add(halo);
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(posts), body));
  const leds = [new THREE.Mesh(mergeGeometries(dots), led)];
  g.add(leds[0]);
  const glow = glowSprite(0xff2a1e, 1.6, 0.35);
  glow.position.y = 0.8;
  g.add(glow);
  return {
    group: g,
    beams,
    glow,
    leds,
    ledMat: led,
    laser: l,
    world: new THREE.Vector3(cOf(x), 0.8, cOf(y)),
  };
}
// ghost — лучей не видно, огоньки горят всегда одинаково (включён ли луч, знает только штурман)
export function setLaser(o, on, now, ghost) {
  o.beams.visible = on && !ghost;
  o.glow.visible = on && !ghost;
  const flick =
    on || ghost ? 0.85 + 0.15 * Math.sin(now * 0.05 + o.laser.i) : 0.25;
  o.ledMat.color.setRGB(flick, 0.16 * flick, 0.12 * flick);
}

/* ---------- камера наблюдения: на стене комнаты под потолком, голова поворачивается по тактам ---------- */
// модель Poly Haven security_camera_02: крепление у стены (z = 0), объектив смотрит в +Z
const CAM_PIVOT = [0, 0.028, 0.152], // ось поворота головы на кронштейне
  CAM_Y = 2.6,
  CAM_SCALE = 1.2;
export function buildCamera(lv, c, model) {
  const k = c.k,
    [dx, dz] = dirV(k),
    rx = (c.i % lv.W) + dx,
    ry = ((c.i / lv.W) | 0) + dz,
    wallDir = (k + 2) % 4; // стена комнаты, на которой висит камера
  const g = new THREE.Group();
  g.position.set(cOf(rx) - (dx * ROOM) / 2, CAM_Y, cOf(ry) - (dz * ROOM) / 2);
  g.rotation.y = yawOf(wallDir);
  g.scale.setScalar(CAM_SCALE);
  const pivot = new THREE.Group();
  pivot.position.set(...CAM_PIVOT);
  pivot.rotation.order = "YXZ";
  g.add(pivot);
  if (model) {
    g.add(model);
    g.updateMatrixWorld(true);
    const head = model.getObjectByName("head");
    if (head) pivot.attach(head);
  } else {
    // заглушка, если модель не загрузилась
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd8d8d4,
      roughness: 0.5,
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.03), mat);
    plate.position.z = 0.015;
    g.add(plate);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.34), mat);
    body.position.set(0, 0.06, 0.07);
    body.castShadow = true;
    pivot.add(body);
  }
  pivot.rotation.x = 0.28; // смотрит чуть вниз, в комнату
  // красный огонёк под объективом: горит, пока камера смотрит в комнату
  const ledMat = new THREE.MeshBasicMaterial({
    color: 0xff2020,
    toneMapped: false,
  });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), ledMat);
  led.position.set(0.045, 0, 0.2);
  pivot.add(led);
  const glow = glowSprite(0xff2a1e, 0.2, 0.8);
  glow.position.copy(led.position);
  pivot.add(glow);
  // второй взгляд — в боковую дверь комнаты: на какой угол повернуть голову (у неподвижной камеры его нет)
  let sidePan = 0;
  if (c.v.length > 1) {
    const [sx, sz] = dirV(c.s);
    g.updateMatrixWorld(true);
    const lp = g.worldToLocal(
      new THREE.Vector3(cOf(rx + sx), CAM_Y - 0.8, cOf(ry + sz)),
    );
    sidePan = Math.max(-1.3, Math.min(1.3, Math.atan2(lp.x, lp.z)));
  }
  return {
    group: g,
    pivot,
    ledMat,
    glow,
    cam: c,
    spot: { room: ry * lv.W + rx, wallDir }, // эту стену не занимать окном и бра
    sidePan,
    pan: 0,
  };
}
/* ---------- лазерный барьер (с дела №9): частая сетка лучей поперёк прохода, пока на щитке не перерезан провод ---------- */
// барьер в проёме — сетка посередине; барьер на комнате — сетка на каждом входе в неё
export function buildGate(lv) {
  const x = lv.gate % lv.W,
    y = (lv.gate / lv.W) | 0,
    spots = [];
  if (!isRoom(lv, lv.gate)) spots.push([cOf(x), cOf(y), x % 2 === 0]);
  else
    for (let k = 0; k < 4; k++) {
      const [dx, dz] = dirV(k);
      if (lv.g[(y + dz) * lv.W + x + dx])
        spots.push([
          cOf(x) + (dx * ROOM) / 2,
          cOf(y) + (dz * ROOM) / 2,
          dx !== 0,
        ]);
    }
  // все лучи одной сетки — два меша: тонкая сердцевина и мягкий ореол
  const cores = [],
    halos = [];
  const beam = (r, len, px, py, pz, vertical) => {
    const c = new THREE.CylinderGeometry(r, r, len, 5, 1, true);
    if (!vertical) c.rotateX(Math.PI / 2);
    c.translate(px, py, pz);
    return c;
  };
  for (let h = 0.15; h < 2.2; h += 0.17) {
    cores.push(beam(0.005, DOOR_W, 0, h, 0));
    halos.push(beam(0.028, DOOR_W, 0, h, 0));
  }
  for (const z of [-0.45, -0.15, 0.15, 0.45]) {
    cores.push(beam(0.005, 2.1, 0, 1.15, z, true));
    halos.push(beam(0.028, 2.1, 0, 1.15, z, true));
  }
  const coreGeo = mergeGeometries(cores),
    haloGeo = mergeGeometries(halos);
  const core = new THREE.MeshBasicMaterial({
      color: 0xff2a1e,
      toneMapped: false,
    }),
    halo = new THREE.MeshBasicMaterial({
      color: 0xff3020,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    body = new THREE.MeshStandardMaterial({
      color: 0x24262a,
      roughness: 0.4,
      metalness: 0.7,
    }),
    ledMat = new THREE.MeshBasicMaterial({
      color: 0xff2a1e,
      toneMapped: false,
    });
  const group = new THREE.Group(),
    beams = [],
    glows = [],
    world = [];
  for (const [px, pz, alongX] of spots) {
    const s = new THREE.Group();
    s.position.set(px, 0, pz);
    if (!alongX) s.rotation.y = Math.PI / 2;
    const b = new THREE.Group();
    b.add(new THREE.Mesh(coreGeo, core), new THREE.Mesh(haloGeo, halo));
    s.add(b);
    beams.push(b);
    // стойки излучателей по краям проёма и планка сверху
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 2.25, 0.06),
        body,
      );
      post.position.set(0, 1.125, side * (DOOR_W / 2 - 0.03));
      s.add(post);
      for (const h of [0.5, 1.15, 1.8]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), ledMat);
        e.position.set(0, h, side * (DOOR_W / 2 - 0.065));
        s.add(e);
      }
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, DOOR_W), body);
    bar.position.y = 2.25;
    s.add(bar);
    const gl = glowSprite(0xff2a1e, 2.6, 0.4);
    gl.position.y = 1.1;
    s.add(gl);
    glows.push(gl);
    group.add(s);
    world.push(new THREE.Vector3(px, 1.1, pz));
  }
  return { group, beams, glows, ledMat, world };
}
// on — барьер горит; выключен — лучей нет, огоньки зелёные
export function setGate(o, on, now) {
  for (const b of o.beams) b.visible = on;
  for (const s of o.glows) s.visible = on;
  const f = 0.85 + 0.15 * Math.sin(now * 0.05);
  if (on) o.ledMat.color.setRGB(f, 0.16 * f, 0.12 * f);
  else o.ledMat.color.setRGB(0.15, 0.9, 0.4);
}

// looking — камера смотрит в комнату; иначе голова отвёрнута вдоль стены и огонёк погашен
// st: 0 — смотрит прямо, 1 — в боковую дверь, -1 — взломана: стоит прямо и не крутится, огонёк погас
// (запись охране не идёт, а штурман смотрит через неё видео)
export function setCamera(o, st, dt) {
  o.pan += ((st === 1 ? o.sidePan : 0) - o.pan) * Math.min(1, dt * 6);
  o.pivot.rotation.y = o.pan;
  const v = st >= 0 ? 1 : 0.1;
  o.ledMat.color.setRGB(v, 0.06 * v, 0.05 * v);
  o.glow.visible = st >= 0;
}

/* ---------- охранник-заглушка: тело, голова и луч фонаря длиной в его зону обзора ---------- */
const coneMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true, // сложение цвета: обе стороны за один проход, а не два
    uniforms: {
      col: { value: new THREE.Color(0xfff0d0) },
      op: { value: 0.11 },
    },
    vertexShader:
      "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader:
      "uniform vec3 col; uniform float op; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = op * edge * smoothstep(0., .25, vY) * (0.35 + 0.65*vY); gl_FragColor = vec4(col*a, a); }",
  });
// model — персонаж из guard.js; без него ставится заглушка-капсула
export function buildGuardPlaceholder(lv, model) {
  const g = new THREE.Group();
  if (model) {
    model.rotation.y = Math.PI;
    g.add(model);
  } // персонаж смотрит в +Z, группа — в −Z
  else {
    const cloth = new THREE.MeshStandardMaterial({
        color: 0x1f2a3a,
        roughness: 0.8,
      }),
      skin = new THREE.MeshStandardMaterial({
        color: 0x8a6a55,
        roughness: 0.7,
      });
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.24, 1.05, 6, 12),
      cloth,
    );
    body.position.y = 0.85;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
    head.position.y = 1.67;
    head.castShadow = true;
    g.add(head);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.15, 0.07, 16),
      cloth,
    );
    cap.position.y = 1.78;
    g.add(cap);
  }
  const len = ((lv.vr || 2) * SPAN) / 2 + 0.4;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, len, 24, 1, true),
    coneMat(),
  );
  cone.geometry.translate(0, -len / 2, 0);
  cone.geometry.rotateX(-Math.PI / 2); // вершина у руки, основание впереди (−Z)
  cone.position.set(0.22, 1.15, -0.15);
  g.add(cone);
  if (!model) {
    const lamp = glowSprite(0xfff0d0, 0.35, 0.9);
    lamp.position.set(0.22, 1.15, -0.2);
    g.add(lamp);
  }
  const spot = new THREE.SpotLight(0xffe6c0, 0, len + 3, 0.42, 0.6, 2);
  spot.position.set(0.22, 1.15, -0.2);
  spot.target.position.set(0.1, 0.2, -len);
  g.add(spot);
  g.add(spot.target);
  return { group: g, cone, spot };
}

/* ---------- сейф у дальней стены тупиковой комнаты ---------- */
export function entranceDir(lv, room) {
  const x = room % lv.W,
    y = (room / lv.W) | 0;
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = dirV(d),
      n = (y + dz) * lv.W + x + dx;
    if (lv.g[n] && n !== -1) return d;
  }
  return 0;
}
export function buildSafe(lv, M, model) {
  const [cx, cz] = cellXZ(lv, lv.gem),
    d = entranceDir(lv, lv.gem),
    back = (d + 2) % 4,
    [bx, bz] = dirV(back);
  const g = new THREE.Group();
  g.position.set(cx + bx * (ROOM / 2 - 0.5), 0, cz + bz * (ROOM / 2 - 0.5));
  g.rotation.y = yawOf(d);
  if (model) {
    // модель смотрит в +Z, а лицо сейфа в группе — в -Z; лампа в латунной оправе над панелью
    model.rotation.y = Math.PI;
    g.add(model);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x39d98a, toneMapped: false }),
    );
    lamp.position.set(0, 1.075, -0.452);
    g.add(lamp);
    return {
      group: g,
      door: null,
      lamp,
      padLocal: new THREE.Vector3(0, 0.82, -0.47),
    };
  }
  const steel = new THREE.MeshStandardMaterial({
    color: 0x3a3d42,
    roughness: 0.35,
    metalness: 0.85,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xb08a4a,
    roughness: 0.3,
    metalness: 0.9,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.25, 0.8), steel);
  body.position.y = 0.66;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.06, 0.9),
    M.stone,
  );
  plinth.position.y = 0.03;
  g.add(plinth);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.05, 0.04), steel);
  door.position.set(0, 0.68, -0.42);
  g.add(door);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.02), M.dark);
  pad.position.set(0, 0.82, -0.45);
  g.add(pad);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.012, 8, 20),
    brass,
  );
  handle.position.set(0.24, 0.55, -0.455);
  g.add(handle);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x39d98a, toneMapped: false }),
  );
  lamp.position.set(0.17, 1.0, -0.455);
  g.add(lamp);
  return { group: g, door, lamp, padLocal: new THREE.Vector3(0, 0.82, -0.47) };
}

/* ---------- тяжёлая дверь хранилища с кодовой панелью снаружи ---------- */
export function buildDoor(lv, M, model) {
  const x = lv.door % lv.W,
    y = (lv.door / lv.W) | 0,
    alongX = x % 2 === 0;
  const out = lv.door + (lv.door - lv.gem),
    [ox, oz] = cellXZ(lv, out),
    [cx, cz] = cellXZ(lv, lv.door);
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  const face = Math.atan2(ox - cx, oz - cz); // куда смотрит наружная сторона
  g.rotation.y = face;
  // модель: стальная рама и створка «leaf», её начало — на оси петли (x = -DOOR_W/2)
  const mLeaf = model && model.getObjectByName("leaf");
  if (mLeaf) g.add(model);
  const hinge = mLeaf || new THREE.Group();
  if (!mLeaf) {
    hinge.position.set(-DOOR_W / 2, 0, 0);
    g.add(hinge);
  }
  const wood = new THREE.MeshStandardMaterial({
    color: 0x2c2420,
    roughness: 0.45,
    metalness: 0.3,
  });
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - 0.04, DOOR_H - 0.02, 0.09),
    wood,
  );
  leaf.position.set(DOOR_W / 2, DOOR_H / 2, 0);
  leaf.castShadow = leaf.receiveShadow = true;
  if (!mLeaf) hinge.add(leaf);
  const band = new THREE.MeshStandardMaterial({
    color: 0x6a6e75,
    roughness: 0.3,
    metalness: 0.9,
  });
  for (const h of [0.45, 1.2, 1.95]) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_W - 0.1, 0.06, 0.1),
      band,
    );
    b.position.set(DOOR_W / 2, h, 0);
    if (!mLeaf) hinge.add(b);
  }
  const pad = new THREE.Group();
  pad.position.set(DOOR_W / 2 + 0.35, 1.3, WALL / 2 + 0.03);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.03), M.dark);
  pad.add(plate);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x0f3a24, toneMapped: false }),
  );
  screen.position.set(0, 0.09, 0.017);
  pad.add(screen);
  g.add(pad);
  void alongX;
  return { group: g, hinge, pad, screen, outCell: out };
}

/* ---------- записка на столике ---------- */
export function buildNote(lv, M) {
  const [cx, cz] = cellXZ(lv, lv.note),
    g = new THREE.Group();
  g.position.set(cx, 0, cz);
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24),
    M.lower,
  );
  top.position.y = 0.72;
  top.castShadow = true;
  g.add(top);
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.06, 0.7, 10),
    M.lower,
  );
  leg.position.y = 0.36;
  g.add(leg);
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.21, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xe9e1cf, roughness: 0.9 }),
  );
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = 0.3;
  paper.position.y = 0.745;
  g.add(paper);
  return { group: g, paper };
}
/* ---------- служебная дверь: выход и ложные двери выглядят одинаково ---------- */
let staffTex = null;
function staffSign() {
  if (staffTex) return staffTex;
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 72;
  const g = cv.getContext("2d");
  g.fillStyle = "#d9d4c4";
  g.fillRect(0, 0, 256, 72);
  g.strokeStyle = "#2a2a2a";
  g.lineWidth = 4;
  g.strokeRect(6, 6, 244, 60);
  g.fillStyle = "#222";
  g.font = 'bold 22px "PT Mono", monospace';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ТОЛЬКО ДЛЯ", 128, 26);
  g.fillText("ПЕРСОНАЛА", 128, 50);
  staffTex = new THREE.CanvasTexture(cv);
  staffTex.colorSpace = THREE.SRGBColorSpace;
  return staffTex;
}
// стоит на стене (x, z), лицом в комнату (yaw как у freeWalls)
export function buildServiceDoor(x, z, yaw, M) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const W_ = 0.96,
    H_ = 2.1;
  const add = (geo, mat, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(
    new THREE.BoxGeometry(0.07, H_ + 0.07, 0.07),
    M.steel,
    -W_ / 2 - 0.035,
    (H_ + 0.07) / 2,
    0.035,
  );
  add(
    new THREE.BoxGeometry(0.07, H_ + 0.07, 0.07),
    M.steel,
    W_ / 2 + 0.035,
    (H_ + 0.07) / 2,
    0.035,
  );
  add(
    new THREE.BoxGeometry(W_ + 0.14, 0.07, 0.07),
    M.steel,
    0,
    H_ + 0.035,
    0.035,
  );
  add(new THREE.BoxGeometry(W_, H_, 0.045), M.steel, 0, H_ / 2, 0.025);
  add(new THREE.BoxGeometry(W_ - 0.06, 0.22, 0.006), M.metal, 0, 0.13, 0.05); // отбойная пластина
  const bar = add(
    new THREE.CylinderGeometry(0.018, 0.018, 0.74, 10),
    M.metal,
    0,
    1.0,
    0.115,
  );
  bar.rotation.z = Math.PI / 2; // штанга антипаники
  for (const s of [-1, 1])
    add(new THREE.BoxGeometry(0.04, 0.06, 0.08), M.metal, s * 0.33, 1.0, 0.085);
  add(
    new THREE.PlaneGeometry(0.4, 0.112),
    new THREE.MeshStandardMaterial({ map: staffSign(), roughness: 0.6 }),
    0,
    1.6,
    0.049,
  );
  // из-под двери тянет уличным светом
  const leak = new THREE.Mesh(
    new THREE.PlaneGeometry(W_ - 0.08, 0.012),
    new THREE.MeshBasicMaterial({ color: 0x9cb8e0, toneMapped: false }),
  );
  leak.position.set(0, 0.006, 0.049);
  g.add(leak);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.8),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0x6f8fc0,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.004, 0.12);
  g.add(pool);
  return g;
}
// выход: служебная дверь на стене комнаты E, у двери — зелёная палочка (видно вплотную, как в 2D)
export function buildExit(lv, M, wall) {
  let g;
  if (wall) {
    g = buildServiceDoor(wall.x, wall.z, wall.yaw, M);
  } else {
    // свободной стены нет — люк в полу, как раньше
    const [cx, cz] = cellXZ(lv, lv.E);
    g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.03, 0.9),
      M.metal,
    );
    frame.position.y = 0.015;
    g.add(frame);
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.035, 0.78),
      M.steel,
    );
    lid.position.y = 0.02;
    g.add(lid);
  }
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.15, 8),
    new THREE.MeshBasicMaterial({ color: 0x40ff90, toneMapped: false }),
  );
  stick.rotation.z = Math.PI / 2;
  stick.rotation.y = 0.5;
  stick.position.set(0.32, 0.02, 0.5);
  g.add(stick);
  const glow = glowSprite(0x40ff90, 0.9, 0.8);
  glow.position.set(0.32, 0.06, 0.5);
  g.add(glow);
  return { group: g, glow, stick };
}

/* ---------- двустворчатые двери в проёмах: распахнуты в одну из комнат ---------- */
const LEAF_W = DOOR_W / 2 - 0.03,
  LEAF_T = 0.045,
  LEAF_H = DOOR_H - 0.03;
let leafGeo = null;
function leafGeometry() {
  if (leafGeo) return leafGeo;
  const geo = new THREE.BoxGeometry(LEAF_W, LEAF_H, LEAF_T),
    p = geo.getAttribute("position"),
    uv = geo.getAttribute("uv");
  // текстура филёнок повёрнута: по высоте створки — две высокие филёнки, по ширине — одна
  for (let i = 0; i < p.count; i++)
    uv.setXY(
      i,
      (p.getY(i) + LEAF_H / 2) / LEAF_H,
      ((p.getX(i) + LEAF_W / 2) / LEAF_W) * 0.2,
    );
  geo.translate(LEAF_W / 2, LEAF_H / 2, 0); // петля — в начале координат
  return (leafGeo = geo);
}
// skip — клетки-проёмы без створок (дверь хранилища); возвращает группу и прямоугольники, куда не пройти
export function buildRoomDoors(lv, doorways, skip, M) {
  const g = new THREE.Group(),
    blocks = [],
    knob = new THREE.SphereGeometry(0.03, 12, 8),
    seed = lv.seed + "|" + lv.L;
  for (const d of doorways) {
    if (skip.has(d.c)) continue;
    const r = hash01(seed, 7000 + d.c);
    if (r < 0.22) continue; // часть проёмов — просто арка
    const side = r < 0.61 ? -1 : 1; // в какую из двух комнат распахнуты
    for (const end of [0, 1]) {
      const a = 0.05 + 0.3 * hash01(seed, 7100 + d.c * 2 + end),
        sgn = end ? 1 : -1; // створка чуть завалена к стене
      let hx, hz, dx, dz;
      if (d.alongX) {
        hx = side < 0 ? d.x0 - 0.04 : d.x1 + 0.04;
        hz = end ? d.z1 - 0.03 : d.z0 + 0.03;
        dx = side * Math.cos(a);
        dz = sgn * Math.sin(a);
      } else {
        hz = side < 0 ? d.z0 - 0.04 : d.z1 + 0.04;
        hx = end ? d.x1 - 0.03 : d.x0 + 0.03;
        dz = side * Math.cos(a);
        dx = sgn * Math.sin(a);
      }
      const leaf = new THREE.Mesh(leafGeometry(), M.door);
      leaf.position.set(hx, 0.01, hz);
      leaf.rotation.y = Math.atan2(-dz, dx);
      leaf.castShadow = leaf.receiveShadow = true;
      g.add(leaf);
      for (const zs of [-1, 1]) {
        const k = new THREE.Mesh(knob, M.brass);
        k.position.set(LEAF_W - 0.08, 1.02, zs * (LEAF_T / 2 + 0.022));
        leaf.add(k);
      }
      const ex = hx + dx * LEAF_W,
        ez = hz + dz * LEAF_W;
      blocks.push([
        Math.min(hx, ex) - 0.05,
        Math.min(hz, ez) - 0.05,
        Math.max(hx, ex) + 0.05,
        Math.max(hz, ez) + 0.05,
      ]);
    }
  }
  return { group: g, blocks };
}

/* ---------- окно на внешней стене: откосы, переплёт, бархатные шторы, лунный столб и пятно на полу ---------- */
const WIN_W = 1.1,
  WIN_Y0 = 0.78,
  WIN_Y1 = 2.55;
const MOON_D = new THREE.Vector3(0.12, -0.8, 0.6); // луч луны в осях окна (+Z — в комнату)
let viewTex = null,
  moonTex = null,
  glassMat = null,
  shaftMat = null,
  curtainGeo = null;
// вид за окном по зданию: сад особняка, городская улица, город с высоты небоскрёба
const views = {};
function viewFor(kind) {
  if (!views[kind])
    views[kind] =
      kind === "street" ? streetView() : kind === "sky" ? skyView() : nightView();
  return views[kind];
}
function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
// окна далёких домов: сетка, часть горит тёплым, часть — холодным (телевизор), остальные тёмные
function litWindows(g, rnd, x0, y0, w, h, cw, ch, p) {
  for (let y = y0 + ch * 0.6; y < y0 + h - ch; y += ch)
    for (let x = x0 + cw * 0.4; x < x0 + w - cw; x += cw) {
      const r = rnd();
      g.fillStyle =
        r < p
          ? `rgba(255,${180 + ((rnd() * 50) | 0)},${100 + ((rnd() * 60) | 0)},${0.55 + rnd() * 0.4})`
          : r < p * 1.25
            ? "rgba(150,180,255,.55)"
            : "rgba(20,26,36,.9)";
      g.fillRect(x, y, cw * 0.55, ch * 0.5);
    }
}
// городская улица ночью: дома напротив с окнами, фонари, мокрый асфальт с отражениями
function streetView() {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext("2d");
  let sd = 23;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const sky = g.createLinearGradient(0, 0, 0, 330);
  sky.addColorStop(0, "#070b14");
  sky.addColorStop(0.7, "#1a2030");
  sky.addColorStop(1, "#3a2c26"); // засветка города снизу
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(220,230,255,.6)";
  for (let i = 0; i < 40; i++) g.fillRect(rnd() * 1024, rnd() * 120, 1.2, 1.2);
  // дома напротив: разной высоты, с карнизами и сеткой окон
  let x = -40;
  while (x < 1064) {
    const w = 110 + rnd() * 120,
      top = 40 + rnd() * 140,
      tone = 10 + ((rnd() * 10) | 0);
    g.fillStyle = `rgb(${tone},${tone + 2},${tone + 6})`;
    g.fillRect(x, top, w, 380 - top);
    g.fillStyle = `rgb(${tone + 8},${tone + 9},${tone + 12})`;
    g.fillRect(x - 4, top, w + 8, 6); // карниз
    litWindows(g, rnd, x + 6, top + 10, w - 12, 330 - top, 22, 30, 0.22);
    // витрина первого этажа
    const sh = g.createLinearGradient(0, 330, 0, 378);
    sh.addColorStop(0, "rgba(255,200,130,.0)");
    sh.addColorStop(1, rnd() < 0.5 ? "rgba(255,200,130,.35)" : "rgba(30,30,40,.6)");
    g.fillStyle = sh;
    g.fillRect(x + 10, 334, w - 20, 44);
    x += w + 6 + rnd() * 14;
  }
  // тротуар и дорога
  g.fillStyle = "#0b0d12";
  g.fillRect(0, 378, 1024, 14);
  const road = g.createLinearGradient(0, 392, 0, 512);
  road.addColorStop(0, "#14161c");
  road.addColorStop(1, "#07080b");
  g.fillStyle = road;
  g.fillRect(0, 392, 1024, 120);
  // фонари: столбы, ореол, отражение в мокром асфальте
  for (let lx = 60; lx < 1024; lx += 210) {
    g.fillStyle = "#05070a";
    g.fillRect(lx - 2, 250, 4, 140);
    const halo = g.createRadialGradient(lx, 250, 0, lx, 250, 70);
    halo.addColorStop(0, "rgba(255,210,150,.95)");
    halo.addColorStop(0.15, "rgba(255,190,120,.45)");
    halo.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = halo;
    g.fillRect(lx - 70, 180, 140, 140);
    const refl = g.createLinearGradient(0, 392, 0, 512);
    refl.addColorStop(0, "rgba(255,190,120,.4)");
    refl.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = refl;
    g.fillRect(lx - 9, 392, 18, 120);
  }
  return canvasTex(cv);
}
// город с высоты: внизу море огней и улицы-нитки, вокруг башни с окнами, засветка у горизонта
function skyView() {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext("2d");
  let sd = 31;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, "#060a14");
  sky.addColorStop(0.75, "#1c2236");
  sky.addColorStop(1, "#4a3428");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(220,230,255,.7)";
  for (let i = 0; i < 70; i++) g.fillRect(rnd() * 1024, rnd() * 160, 1.2, 1.2);
  // земля далеко внизу: тёмная, с россыпью огней, гуще к центру города
  const ground = g.createLinearGradient(0, 300, 0, 512);
  ground.addColorStop(0, "#1a1410");
  ground.addColorStop(1, "#06070a");
  g.fillStyle = ground;
  g.fillRect(0, 300, 1024, 212);
  for (let i = 0; i < 2600; i++) {
    const y = 302 + Math.pow(rnd(), 1.6) * 210,
      k = (y - 300) / 212;
    g.fillStyle =
      rnd() < 0.8
        ? `rgba(255,${190 + ((rnd() * 50) | 0)},120,${0.35 + rnd() * 0.5})`
        : "rgba(200,220,255,.6)";
    const s = 0.8 + k * 1.8;
    g.fillRect(rnd() * 1024, y, s, s * 0.7);
  }
  // проспекты: светящиеся линии к горизонту
  for (let i = 0; i < 7; i++) {
    const x0 = rnd() * 1024,
      x1 = 512 + (x0 - 512) * 0.15;
    g.strokeStyle = "rgba(255,190,110,.35)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x0, 512);
    g.lineTo(x1, 302);
    g.stroke();
  }
  // соседние башни: силуэты с сеткой окон и красными огнями на крышах
  for (let i = 0; i < 9; i++) {
    const w = 50 + rnd() * 90,
      x = rnd() * 1024,
      top = 60 + rnd() * 200;
    for (const ox of [0, -1024, 1024]) {
      g.fillStyle = "#0a0d14";
      g.fillRect(x + ox, top, w, 512 - top);
      litWindows(g, rnd, x + ox + 4, top + 6, w - 8, 512 - top, 9, 12, 0.3);
      g.fillStyle = "rgba(255,60,50,.9)";
      g.fillRect(x + ox + w / 2 - 2, top - 4, 4, 4);
    }
  }
  return canvasTex(cv);
}
// панорама ночного сада: небо, луна, облака, кроны, кованая ограда, далёкие окна
function nightView() {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext("2d");
  let sd = 11;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#0a1322");
  sky.addColorStop(0.6, "#1e2f48");
  sky.addColorStop(1, "#0b111b");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(220,230,255,.85)";
  for (let i = 0; i < 140; i++) g.fillRect(rnd() * 1024, rnd() * 280, 1.3, 1.3);
  for (const mx of [260, 780]) {
    // луна видна в половине окон
    const halo = g.createRadialGradient(mx, 110, 0, mx, 110, 170);
    halo.addColorStop(0, "rgba(200,220,255,.5)");
    halo.addColorStop(1, "rgba(200,220,255,0)");
    g.fillStyle = halo;
    g.fillRect(mx - 170, 0, 340, 300);
    g.fillStyle = "#eef3ff";
    g.beginPath();
    g.arc(mx, 110, 20, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 18; i++) {
    const x = rnd() * 1024,
      y = 50 + rnd() * 200,
      r = 60 + rnd() * 130,
      c = g.createRadialGradient(x, y, 0, x, y, r);
    c.addColorStop(0, "rgba(60,76,102,.4)");
    c.addColorStop(1, "rgba(60,76,102,0)");
    g.fillStyle = c;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 12; i++) {
    const x = rnd() * 1024,
      y = 340 + rnd() * 40,
      c = g.createRadialGradient(x, y, 0, x, y, 12);
    c.addColorStop(0, "rgba(255,196,128,.95)");
    c.addColorStop(1, "rgba(255,196,128,0)");
    g.fillStyle = c;
    g.fillRect(x - 12, y - 12, 24, 24);
  }
  g.fillStyle = "#03060a";
  for (let i = 0; i < 30; i++) {
    const x = rnd() * 1024,
      h = 150 + rnd() * 190,
      w = 45 + rnd() * 90;
    for (const ox of [0, -1024, 1024]) {
      g.beginPath();
      g.ellipse(x + ox, 470 - h * 0.45, w, h * 0.5, 0, 0, 7);
      g.fill();
    }
  }
  g.fillRect(0, 432, 1024, 5);
  g.fillRect(0, 470, 1024, 42);
  for (let x = 0; x < 1024; x += 16) {
    g.fillRect(x, 404, 3, 70);
    g.beginPath();
    g.moveTo(x - 3, 406);
    g.lineTo(x + 1.5, 395);
    g.lineTo(x + 6, 406);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
// пятно луны на полу: шесть стёкол с тенями переплёта
function moonPanes() {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 192;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 128, 192);
  g.filter = "blur(3px)";
  g.fillStyle = "#fff";
  const fx = 7,
    fy = 7,
    mid = 3,
    bar = 2,
    cw = (128 - 2 * fx - 2 * mid) / 2,
    rh = (192 - 2 * fy - 2 * bar * 2) / 3;
  for (let c = 0; c < 2; c++)
    for (let r = 0; r < 3; r++)
      g.fillRect(fx + c * (cw + 2 * mid), fy + r * (rh + 2 * bar), cw, rh);
  const t = new THREE.CanvasTexture(cv);
  return t;
}
function windowShared() {
  if (glassMat) return;
  viewTex = viewFor("garden");
  moonTex = moonPanes();
  // стекло: вид наружу и капли дождя, часть капель стекает
  glassMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        view: { value: null },
        time: { value: 0 },
        wet: { value: 1 },
        snow: { value: 0 },
        flash: { value: 0 },
      },
    ]),
    vertexShader: `#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `#include <common>
#include <fog_pars_fragment>
uniform sampler2D view; uniform float time, wet, snow, flash; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 q = vec2(vUv.x * 50.0, vUv.y * 24.0), id = floor(q), f = fract(q);
  float r = h21(id), slide = step(0.8, r);
  float y = mix(0.25 + 0.5 * h21(id + 3.1), 1.0 - fract(r * 9.0 + time * (0.12 + 0.25 * r)), slide);
  vec2 d = (f - vec2(0.3 + 0.4 * h21(id + 7.7), y)) * vec2(1.0, 1.4);
  // капель тем больше, чем сильнее дождь (wet: 0 — сухо, 1 — дождь, 1,5 — гроза)
  float drop = smoothstep(0.17, 0.03, length(d)) * step(1.0 - 0.6 * wet, r);
  vec3 col = texture2D(view, vUv + d * drop * 0.035).rgb * 0.8 + vec3(0.5, 0.6, 0.8) * drop * 0.025;
  // снег за стеклом: хлопья медленно падают и покачиваются
  vec2 s = vec2(vUv.x * 36.0 + sin(time * 0.6 + vUv.y * 9.0) * 0.4, vUv.y * 18.0 + time * 0.5), sid = floor(s);
  float flake = smoothstep(0.13, 0.0, length(fract(s) - vec2(h21(sid), h21(sid + 1.7)))) * step(0.5, h21(sid + 4.2));
  col += vec3(0.7, 0.75, 0.85) * flake * snow * 0.5;
  // молния: окно на миг вспыхивает
  col += vec3(0.55, 0.62, 0.8) * flash;
  gl_FragColor = vec4(col, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`,
  });
  glassMat.uniforms.view.value = viewTex;
  // столб лунного света: плоскости гаснут по краям и к полу, в нём медленно плывёт пыль (яркость — в альфе: сложение идёт как цвет × альфа)
  shaftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true, // сложение цвета: обе стороны за один проход, а не два
    uniforms: { time: { value: 0 }, flash: { value: 0 }, amp: { value: 1 } },
    vertexShader:
      "varying vec2 vUv; varying vec3 vN, vV, vW; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * mv; }",
    fragmentShader:
      "uniform float time, flash, amp; varying vec2 vUv; varying vec3 vN, vV, vW; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float fall = (1.0 - vUv.y * 0.65) * smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y)); float dust = 0.7 + 0.3 * sin(vW.x * 6.0 + time * 0.3) * sin(vW.y * 4.0 - time * 0.2) * sin(vW.z * 5.0 + time * 0.25); float a = 0.11 * amp * edge * fall * dust * (1.0 + 4.0 * flash); gl_FragColor = vec4(0.62, 0.74, 0.95, a); }",
  });
  // штора: складки синусом, низ чуть расходится
  curtainGeo = new THREE.PlaneGeometry(0.62, 2.78, 30, 6);
  const p = curtainGeo.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      k = 1 + 0.25 * (0.5 - y / 2.78);
    p.setZ(i, 0.045 * Math.sin(x * 50) * k + 0.012 * Math.sin(x * 17 + 1.3));
  }
  curtainGeo.computeVertexNormals();
}
export function tickWindows(t, flash = 0) {
  if (glassMat) {
    glassMat.uniforms.time.value = t;
    shaftMat.uniforms.time.value = t;
    glassMat.uniforms.flash.value = flash;
    shaftMat.uniforms.flash.value = flash;
  }
}
// погода у каждого дела своя (одна и та же у вора и штурмана), меняет только вид и звук.
// Буква на дело: д — дождь, я — ясная ночь, с — снег, г — гроза с ветром; дальше 21-го дела — по кругу
const WEATHER_BY_CASE = "дясгдягсдясгдягсдсгяг",
  WEATHER_NAMES = { д: "rain", я: "clear", с: "snow", г: "storm" };
export function weatherOf(L) {
  return WEATHER_NAMES[WEATHER_BY_CASE[L % WEATHER_BY_CASE.length]];
}
// сколько капель на стёклах и идёт ли снег
export const weatherFx = (w) => ({
  wet: { rain: 1, storm: 1.5 }[w] || 0,
  snow: w === "snow" ? 1 : 0,
});
export function setWeatherWindows(w) {
  windowShared();
  const fx = weatherFx(w);
  glassMat.uniforms.wet.value = fx.wet;
  glassMat.uniforms.snow.value = fx.snow;
}
// окно на свободной наружной стене. style: curtain — со шторами (особняк, ювелирка), blind — с римской шторой (музей),
// bars — с кованой решёткой (банк), glass — стекло от пола до потолка (офис в небоскрёбе)
let barMat = null,
  blindMat = null;
export function buildWindow(x, z, yaw, M, seed = 0, style = "curtain") {
  windowShared();
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const tall = style === "glass";
  const w = tall ? 2.9 : WIN_W,
    y0 = tall ? 0.1 : WIN_Y0,
    y1 = tall ? CEIL - 0.12 : WIN_Y1,
    h = y1 - y0,
    ym = (y0 + y1) / 2;
  const box = (bw, bh, bd, mat, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // стекло: у каждого окна свой кусок панорамы
  const gg = new THREE.PlaneGeometry(w, h),
    uv = gg.getAttribute("uv"),
    u0 = seed * 0.7,
    du = tall ? 0.62 : 0.3;
  for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * du);
  const glass = new THREE.Mesh(gg, glassMat);
  glass.position.set(0, ym, 0.004);
  g.add(glass);
  if (tall) {
    // офис: алюминиевые импосты — рама, две стойки, ригель на уровне перил, низ-отлив
    box(w + 0.08, 0.07, 0.07, M.trim, 0, y0, 0.035);
    box(w + 0.08, 0.07, 0.07, M.trim, 0, y1, 0.035);
    for (const sx of [-1, -1 / 3, 1 / 3, 1])
      box(0.06, h, 0.08, M.trim, (sx * w) / 2, ym, 0.04);
    box(w, 0.045, 0.06, M.trim, 0, y0 + 0.95, 0.03);
    box(w + 0.1, 0.1, 0.05, M.trim, 0, 0.05, 0.025); // плинтус-короб у пола
  } else {
    // переплёт: рама створок, средник, два горбылька
    box(w, 0.06, 0.05, M.trim, 0, y0 + 0.03, 0.03);
    box(w, 0.06, 0.05, M.trim, 0, y1 - 0.03, 0.03);
    box(0.06, h, 0.05, M.trim, -w / 2 + 0.03, ym, 0.03);
    box(0.06, h, 0.05, M.trim, w / 2 - 0.03, ym, 0.03);
    box(0.05, h, 0.04, M.trim, 0, ym, 0.025);
    box(w, 0.035, 0.035, M.trim, 0, y0 + h / 3, 0.022);
    box(w, 0.035, 0.035, M.trim, 0, y0 + (2 * h) / 3, 0.022);
    // глубокие откосы, каменный подоконник, фартук под ним
    box(0.12, h + 0.12, 0.22, M.trim, -w / 2 - 0.06, ym + 0.06, 0.11);
    box(0.12, h + 0.12, 0.22, M.trim, w / 2 + 0.06, ym + 0.06, 0.11);
    box(w + 0.24, 0.12, 0.22, M.trim, 0, y1 + 0.06, 0.11);
    box(w + 0.2, 0.05, 0.22, M.stone, 0, y0 - 0.025, 0.11);
    box(w + 0.24, 0.14, 0.03, M.trim, 0, y0 - 0.12, 0.015);
  }
  if (style === "curtain") {
    // бархатные шторы и ламбрекен
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(curtainGeo, M.velvet);
      c.position.set(s * (w / 2 + 0.16), 0.01 + 2.78 / 2, 0.3);
      c.castShadow = c.receiveShadow = true;
      g.add(c);
    }
    box(w + 1.0, 0.3, 0.1, M.velvet, 0, 2.87, 0.31);
  }
  if (style === "bars") {
    // кованая решётка в проёме: прутья с шишечками и две поперечины
    if (!barMat)
      barMat = new THREE.MeshStandardMaterial({
        color: 0x16181b,
        roughness: 0.45,
        metalness: 0.75,
      });
    for (let i = 1; i < 7; i++)
      box(0.022, h - 0.04, 0.022, barMat, -w / 2 + (i * w) / 7, ym, 0.1);
    for (const k of [0.12, 0.5, 0.88])
      box(w - 0.02, 0.03, 0.018, barMat, 0, y0 + h * k, 0.1);
  }
  if (style === "blind") {
    // римская штора, поднятая на треть: складки-валики и короб карниза
    if (!blindMat)
      blindMat = new THREE.MeshStandardMaterial({
        color: 0xb8ab94,
        roughness: 0.95,
        side: THREE.DoubleSide,
      });
    const top = y1 - 0.02,
      len = h * 0.3;
    box(w + 0.1, 0.08, 0.1, M.trim, 0, top + 0.04, 0.17);
    box(w - 0.08, len, 0.01, blindMat, 0, top - len / 2, 0.16);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, w - 0.08, 10),
        blindMat,
      );
      f.rotation.z = Math.PI / 2;
      f.position.set(0, top - len + 0.03 + i * 0.07, 0.175);
      f.castShadow = f.receiveShadow = true;
      g.add(f);
    }
  }
  // лунный столб: стекло между шторами, выше тени подоконника — параллельно лучу до пола
  const inset = style === "curtain" ? 0.17 : 0.07,
    xl = -w / 2 + inset,
    xr = w / 2 - inset,
    yl = tall ? y0 + 0.9 : y0 + 0.36,
    yt = style === "blind" ? y1 - h * 0.3 : y1,
    D = MOON_D;
  const C = [
    [xl, yl],
    [xr, yl],
    [xr, yt],
    [xl, yt],
  ].map(([px, py]) => new THREE.Vector3(px, py, 0.03));
  const F = C.map((p) =>
    p
      .clone()
      .addScaledVector(D, p.y / -D.y)
      .setY(0.008),
  );
  const pos = [],
    suv = [],
    idx = [];
  for (let k = 0; k < 4; k++) {
    const a = C[k],
      b = C[(k + 1) % 4],
      fa = F[k],
      fb = F[(k + 1) % 4],
      i = pos.length / 3;
    for (const [v, u, t] of [
      [a, 0, 0],
      [b, 1, 0],
      [fb, 1, 1],
      [fa, 0, 1],
    ]) {
      pos.push(v.x, v.y, v.z);
      suv.push(u, t);
    }
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute("uv", new THREE.Float32BufferAttribute(suv, 2));
  sg.setIndex(idx);
  sg.computeVertexNormals();
  g.add(new THREE.Mesh(sg, shaftMat));
  // пятно на полу с тенями переплёта (у офиса переплёта почти нет — пятно из стёкол без горбыльков)
  const ul = (xl + w / 2) / w,
    ur = (xr + w / 2) / w,
    vl = (yl - y0) / h,
    vt = (yt - y0) / h;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      F.flatMap((p) => [p.x, p.y, p.z]),
      3,
    ),
  );
  pg.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([ul, vl, ur, vl, ur, vt, ul, vt], 2),
  );
  pg.setIndex([0, 2, 1, 0, 3, 2]);
  const patch = new THREE.Mesh(
    pg,
    new THREE.MeshBasicMaterial({
      map: moonTex,
      color: 0x9fb8e0,
      transparent: true,
      opacity: tall ? 0.3 : 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true, // сложение цвета: обе стороны за один проход, а не два
    }),
  );
  g.add(patch);
  g.userData.light = new THREE.Vector3(0, 1.0, 1.3); // холодный свет пула — у пятна на полу
  // большое окно офиса светит сильнее и теплее: внизу город
  g.userData.lightCol = tall ? 0xa8b4d0 : 0x8fb0e8;
  g.userData.lightK = tall ? 2.4 : 1.4;
  return g;
}

/* ---------- дежурное бра: тёплая лампочка и свечение, настоящий свет даёт пул ---------- */
// style: brass — латунь с абажуром (особняк), banker — латунь с зелёным стеклом (банк), wash — бронзовая подсветка стены вверх (музей),
// panel — светодиодная полоса (офис), crystal — хрусталь и две свечи-лампочки (ювелирка)
const sconceMats = {};
function smat(key, make) {
  if (!sconceMats[key]) sconceMats[key] = make();
  return sconceMats[key];
}
function washPlane(g, w, h, y, color, opacity) {
  const wash = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  wash.position.set(0, y, 0.004);
  g.add(wash);
  return wash;
}
export function buildSconce(style = "brass") {
  const g = new THREE.Group();
  const brass = smat(
    "brass",
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x9c7a3c,
        roughness: 0.35,
        metalness: 0.9,
      }),
  );
  const mesh = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (style === "wash") {
    // музей: бронзовый короб-подсветка, свет веером вверх по стене
    const bronze = smat(
      "bronze",
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x5a4630,
          roughness: 0.4,
          metalness: 0.85,
        }),
    );
    mesh(new THREE.BoxGeometry(0.34, 0.07, 0.1), bronze, 0, 2.28, 0.05);
    mesh(
      new THREE.BoxGeometry(0.3, 0.012, 0.07),
      smat(
        "washGlow",
        () => new THREE.MeshBasicMaterial({ color: 0xffe2b8 }),
      ),
      0,
      2.322,
      0.05,
    );
    const w = washPlane(g, 1.4, 1.6, 2.75, 0xffc890, 0.22);
    w.scale.y = 0.9;
    washPlane(g, 0.7, 0.5, 2.3, 0xffd8a8, 0.18);
    return {
      group: g,
      light: new THREE.Vector3(0, 2.6, 0.35),
      col: 0xffcf98,
      k: 2.6,
    };
  }
  if (style === "panel") {
    // офис: узкая светодиодная полоса в алюминиевом профиле, холодный свет
    const alu = smat(
      "alu",
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x9a9ea4,
          roughness: 0.3,
          metalness: 0.85,
        }),
    );
    mesh(new THREE.BoxGeometry(0.9, 0.06, 0.05), alu, 0, 2.2, 0.025);
    mesh(
      new THREE.BoxGeometry(0.86, 0.02, 0.01),
      smat("ledBar", () => new THREE.MeshBasicMaterial({ color: 0xe8f0ff })),
      0,
      2.18,
      0.051,
    );
    const gl = glowSprite(0xcfe0ff, 0.9, 0.35);
    gl.position.set(0, 2.18, 0.08);
    gl.scale.set(1.3, 0.4, 1);
    g.add(gl);
    washPlane(g, 2.0, 1.4, 2.2, 0x9fb8ff, 0.12);
    return {
      group: g,
      light: new THREE.Vector3(0, 2.0, 0.35),
      col: 0xdde6ff,
      k: 2.4,
    };
  }
  if (style === "crystal") {
    // ювелирка: латунная розетка, две «свечи» с лампочками-огоньками и хрустальные подвески
    mesh(new THREE.BoxGeometry(0.12, 0.26, 0.03), brass, 0, 2.05, 0.015);
    const crystal = smat(
      "crystal",
      () =>
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.05,
          metalness: 0.2,
          emissive: 0xffe0b0,
          emissiveIntensity: 0.35,
        }),
    );
    const bulb = smat(
      "bulb",
      () => new THREE.MeshBasicMaterial({ color: 0xfff0d0 }),
    );
    for (const sx of [-1, 1]) {
      const arm = mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8),
        brass,
        sx * 0.08,
        2.0,
        0.09,
      );
      arm.rotation.z = (sx * Math.PI) / 3;
      mesh(
        new THREE.CylinderGeometry(0.03, 0.022, 0.03, 12),
        brass,
        sx * 0.16,
        2.07,
        0.12,
      );
      mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8),
        crystal,
        sx * 0.16,
        2.13,
        0.12,
      );
      mesh(new THREE.SphereGeometry(0.018, 10, 8), bulb, sx * 0.16, 2.19, 0.12);
      for (let i = 0; i < 5; i++) {
        const d = mesh(
          new THREE.OctahedronGeometry(0.014, 0),
          crystal,
          sx * 0.16 + Math.cos(i * 1.26) * 0.035,
          2.03 - (i % 2) * 0.02,
          0.12 + Math.sin(i * 1.26) * 0.035,
        );
        d.scale.y = 1.8;
      }
      const gl = glowSprite(0xffd8a0, 0.5, 0.7);
      gl.position.set(sx * 0.16, 2.19, 0.13);
      g.add(gl);
    }
    washPlane(g, 1.4, 1.4, 2.1, 0xffb870, 0.14);
    return {
      group: g,
      light: new THREE.Vector3(0, 2.15, 0.3),
      col: 0xffc888,
      k: 2.8,
    };
  }
  // brass и banker: розетка, кронштейн, абажур (у банка — зелёное стекло, как у лампы банкира)
  const banker = style === "banker";
  const base = mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16),
    brass,
    0,
    2.05,
    0.015,
  );
  base.rotation.x = Math.PI / 2;
  const arm = mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8),
    brass,
    0,
    2.05,
    0.1,
  );
  arm.rotation.x = Math.PI / 2;
  const shadeMat = smat(
    banker ? "shadeG" : "shade",
    () =>
      new THREE.MeshStandardMaterial({
        color: banker ? 0x1f5a3a : 0xe8cf9a,
        emissive: banker ? 0x2f8a52 : 0xffb45a,
        emissiveIntensity: banker ? 0.7 : 0.9,
        side: THREE.DoubleSide,
        roughness: banker ? 0.25 : 0.9,
      }),
  );
  mesh(
    banker
      ? new THREE.CylinderGeometry(0.05, 0.12, 0.1, 24, 1, true)
      : new THREE.CylinderGeometry(0.07, 0.11, 0.14, 20, 1, true),
    shadeMat,
    0,
    2.14,
    0.19,
  );
  const glow = glowSprite(0xffb45a, 0.9, 0.55);
  glow.position.set(0, banker ? 2.08 : 2.14, 0.2);
  g.add(glow);
  washPlane(g, 1.6, 1.6, 2.05, 0xffa050, 0.16);
  return {
    group: g,
    light: new THREE.Vector3(0, 2.1, 0.3),
    col: 0xffb060,
    k: 3.2,
  };
}

/* ---------- офис: подвесной потолок — сетка профиля 0,6 м и две светильника-панели на комнату ---------- */
let tbarMat = null,
  panelMat = null;
export function buildCeilPanels(cx, cz) {
  const g = new THREE.Group();
  if (!tbarMat) {
    tbarMat = new THREE.MeshStandardMaterial({
      color: 0xc8cacc,
      roughness: 0.4,
      metalness: 0.6,
    });
    // ночью свет выключен: молочный рассеиватель чуть светится от дежурного освещения
    panelMat = new THREE.MeshStandardMaterial({
      color: 0xe8ecef,
      roughness: 0.6,
      emissive: 0xc8d4e0,
      emissiveIntensity: 0.06,
    });
  }
  const y = CEIL - 0.006,
    half = ROOM / 2;
  for (let k = -2; k <= 2; k++) {
    const a = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM, 0.012, 0.024),
      tbarMat,
    );
    a.position.set(cx, y, cz + k * 0.6);
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.012, ROOM),
      tbarMat,
    );
    b.position.set(cx + k * 0.6, y, cz);
    g.add(a, b);
  }
  for (const sx of [-0.6, 0.6]) {
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.02, 1.18), panelMat);
    pnl.position.set(cx + sx, y - 0.004, cz);
    g.add(pnl);
  }
  return g;
}

/* ---------- музей: стеклянный фонарь в потолке зала, лунный столб до пола ---------- */
export function buildSkylight(cx, cz, M) {
  windowShared();
  const g = new THREE.Group();
  const S = 1.5; // сторона стеклянного плафона в потолке (световой фонарь «лайтлайт», как в залах музеев)
  const Y = CEIL - 0.012;
  const box = (w, h, d, x, y, z, mat = M.trim) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx + x, y, cz + z);
    m.receiveShadow = true;
    g.add(m);
  };
  // рама с профилем и крестовой переплёт
  for (const k of [-1, 1]) {
    box(S + 0.24, 0.07, 0.12, 0, CEIL - 0.035, (k * (S + 0.12)) / 2);
    box(0.12, 0.07, S + 0.24, (k * (S + 0.12)) / 2, CEIL - 0.035, 0);
  }
  box(S, 0.04, 0.045, 0, CEIL - 0.03, 0);
  box(0.045, 0.04, S, 0, CEIL - 0.03, 0);
  // стекло: верх панорамы — небо со звёздами, по нему стекают капли
  const gg = new THREE.PlaneGeometry(S, S),
    uv = gg.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, 0.1 + uv.getX(i) * 0.12, 0.93 + uv.getY(i) * 0.065); // только небо, без крыш
  const glass = new THREE.Mesh(gg, glassMat);
  glass.rotation.x = Math.PI / 2;
  glass.position.set(cx, Y, cz);
  g.add(glass);
  // столб света: четыре плоскости от стекла к полу с небольшим наклоном
  const d = new THREE.Vector3(0.12, -1, 0.18);
  const C = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => new THREE.Vector3((a * S) / 2 - 0.06 * a, Y - 0.01, (b * S) / 2 - 0.06 * b));
  const F = C.map((p) => p.clone().addScaledVector(d, (p.y - 0.01) / -d.y).setY(0.008));
  const pos = [],
    suv = [],
    idx = [];
  for (let k = 0; k < 4; k++) {
    const a = C[k],
      b = C[(k + 1) % 4],
      fa = F[k],
      fb = F[(k + 1) % 4],
      i = pos.length / 3;
    for (const [v, u, t] of [
      [a, 0, 0],
      [b, 1, 0],
      [fb, 1, 1],
      [fa, 0, 1],
    ]) {
      pos.push(cx + v.x, v.y, cz + v.z);
      suv.push(u, t);
    }
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute("uv", new THREE.Float32BufferAttribute(suv, 2));
  sg.setIndex(idx);
  sg.computeVertexNormals();
  // столб от потолка виден со всех сторон и крупнее оконного — вдвое прозрачнее
  if (!skyShaft) {
    skyShaft = shaftMat.clone();
    skyShaft.uniforms.amp.value = 0.42;
    // время и вспышка молнии — общие с оконными столбами (их двигает tickWindows), своя только яркость
    skyShaft.uniforms.time = shaftMat.uniforms.time;
    skyShaft.uniforms.flash = shaftMat.uniforms.flash;
  }
  g.add(new THREE.Mesh(sg, skyShaft));
  // пятно на полу с тенью переплёта (крест)
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.Float32BufferAttribute(F.flatMap((p) => [cx + p.x, p.y, cz + p.z]), 3));
  pg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  pg.setIndex([0, 2, 1, 0, 3, 2]);
  g.add(
    new THREE.Mesh(
      pg,
      new THREE.MeshBasicMaterial({
        map: skyPanes(),
        color: 0x9fb8e0,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        forceSinglePass: true, // сложение цвета: обе стороны за один проход, а не два
      }),
    ),
  );
  return { group: g, light: new THREE.Vector3(cx + 0.2, 1.2, cz + 0.3) };
}
// пятно от фонаря: четыре стекла с крестом переплёта
let skyPaneTex = null,
  skyShaft = null;
function skyPanes() {
  if (skyPaneTex) return skyPaneTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 128, 128);
  g.filter = "blur(4px)";
  g.fillStyle = "#fff";
  for (const [x, y] of [
    [8, 8],
    [68, 8],
    [8, 68],
    [68, 68],
  ])
    g.fillRect(x, y, 52, 52);
  return (skyPaneTex = new THREE.CanvasTexture(cv));
}

/* ---------- раскладка окон и ламп: на свободных стенах комнат ---------- */
export function freeWalls(lv, spots) {
  const taken = new Set(spots.map((s) => s.room + ":" + s.wallDir)),
    out = [];
  for (let y = 1; y < lv.H; y += 2)
    for (let x = 1; x < lv.W; x += 2) {
      const room = y * lv.W + x;
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = dirV(d),
          n = (y + dz) * lv.W + x + dx;
        if (lv.g[n] || taken.has(room + ":" + d)) continue;
        const outer =
          x + dx === 0 ||
          y + dz === 0 ||
          x + dx === lv.W - 1 ||
          y + dz === lv.H - 1;
        const cx = cOf(x) + (dx * ROOM) / 2,
          cz = cOf(y) + (dz * ROOM) / 2;
        out.push({
          room,
          d,
          outer,
          x: cx,
          z: cz,
          yaw: yawOf(d),
          r: hash01(lv.seed + "|" + lv.L, room * 4 + d),
        });
      }
    }
  return out;
}

// координата в метрах → в клетках схемы (у схемы все клетки одинаковые)
export const planCoord = (X) => {
  const i = idxOf(X);
  return i + (X - x0Of(i)) / sizeOf(i);
};

/* ---------- текстуры темы «особняк» (KTX2: Poly Haven, CC0) ---------- */
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
export function makeKTX(renderer) {
  return new KTX2Loader()
    .setTranscoderPath("vendor/three/addons/libs/basis/")
    .detectSupport(renderer);
}
const texLoader = new THREE.TextureLoader();

/* ---------- вид зданий: пол, стены, потолок, отделка, окна, бра у каждой темы свои ---------- */
// слот материала: [текстура, метров на плитку (0 — на всю створку), цвет-оттенок, доп. свойства]
// ns — сила рельефа, rough — своя шероховатость вместо карты (паркет, лак)
export const LOOKS = {
  mansion: {
    floor: ["parquet", 1.7, 0xd8c4b0, { rough: 0.5, ns: 0.5 }],
    lower: ["panels", 1.0, 0xe8c0b0],
    upper: ["jacquard", 0.55, 0x86b8b0],
    ceil: ["coffer", 1.8, 0xb8a898],
    stone: ["marble", 1.0, 0xffffff],
    door: ["panels", 0, 0xa88070],
    trim: { color: 0x3a281c, roughness: 0.45, metalness: 0 },
    velvet: 0x3a0b12,
    win: "curtain",
    view: "garden",
    sconce: "brass",
    chand: "chandelier",
    step: "wood",
  },
  // музей: светлый мрамор, стены глубокого сине-серого (как в больших галереях), белый лепной потолок
  museum: {
    floor: ["marble", 1.2, 0xf0e8dc, { rough: 0.22, ns: 0.6 }],
    lower: ["granite", 1.0, 0x8a8278, { rough: 0.25 }],
    upper: ["plaster", 1.6, 0x46587a],
    ceil: ["stucco", 2.0, 0xe8e2d6],
    stone: ["plasterw", 1.0, 0xe8e4dc], // тумбы экспонатов — матовые белые, без швов плитки
    door: ["panels", 0, 0xc8a882],
    trim: { color: 0xb8b0a2, roughness: 0.55, metalness: 0 },
    velvet: 0x2a3550,
    win: "blind",
    view: "street",
    sconce: "wash",
    sconceP: 0.36,
    chand: null,
    step: "stone",
  },
  // банк: тёплый терраццо, тёмный гранит понизу, светлый камень стен, кессоны
  bank: {
    floor: ["terrazzo", 1.6, 0xd8cbb8, { rough: 0.25, ns: 0.4 }],
    lower: ["granite", 0.9, 0x6a6660, { rough: 0.22 }],
    upper: ["stonewall", 2.7, 0xb8a88e], // крупные блоки известняка (мелкие читались как кафель)
    ceil: ["coffer", 1.8, 0xe0d4bc],
    stone: ["granite", 1.0, 0x8a8680],
    door: ["panels", 0, 0x7a4a32],
    trim: { color: 0x6e5a3a, roughness: 0.32, metalness: 0.75 },
    velvet: 0x1d3a2a,
    win: "bars",
    view: "street",
    sconce: "banker",
    sconceP: 0.32,
    chand: "chandelier2",
    step: "stone",
  },
  // офис: серый ковролин, светлые стены, потолок из плит, алюминий
  office: {
    floor: ["carpet", 0.6, 0x6c7684, { ns: 0.8 }],
    lower: ["stucco", 1.5, 0xb4b8bc],
    upper: ["stucco", 1.5, 0xc8cacc],
    ceil: ["stucco", 1.2, 0xdedede],
    stone: ["marble", 1.0, 0xe4e4e2], // белый камень: тумба добычи, подоконники
    door: ["stucco", 1.0, 0xc4c6c8], // гладкие крашеные двери без филёнок
    trim: { color: 0x8a8e94, roughness: 0.35, metalness: 0.8 },
    velvet: 0x3a3e46,
    win: "glass",
    view: "sky",
    sconce: "panel",
    chand: null,
    ceilPanels: true,
    step: "carpet",
  },
  // ювелирный дом: чёрный полированный мрамор, орех понизу, бархат стен, золото
  jewelry: {
    floor: ["marble", 1.1, 0x4c4846, { rough: 0.12, ns: 0.4 }],
    lower: ["walnut", 1.2, 0x76503a, { rough: 0.28 }],
    upper: ["velvet", 0.8, 0xb03a50], // бархат цвета тёмного вина
    ceil: ["stucco", 2.0, 0xe0d6c4],
    stone: ["walnut", 0.8, 0x9a6c48, { rough: 0.3 }], // тумбы — лакированное дерево
    door: ["panels", 0, 0x2a2420],
    trim: { color: 0xa88850, roughness: 0.3, metalness: 0.9 },
    velvet: 0x4a0e18,
    win: "curtain",
    view: "street",
    sconce: "crystal",
    sconceP: 0.55, // бра почти в каждом зале: свет — часть роскоши
    chand: "chandelier3",
    step: "stone",
  },
};
const texCache = {};
function loadTex(name, k, aniso) {
  const key = name + "_" + k;
  if (!texCache[key])
    texCache[key] = texLoader
      .loadAsync(`assets/textures/${key}.jpg`)
      .then((t) => {
        // JPEG, а не KTX2: на слабом процессоре перекодировка Basis шла по секунде на текстуру
        if (k === "col") t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        return t;
      })
      .catch((e) => {
        console.warn("текстура не загрузилась", key, e);
        delete texCache[key]; // следующая загрузка темы попробует снова
        return null;
      });
  return texCache[key];
}
const SLOTS = ["floor", "lower", "upper", "ceil", "stone", "door"];
const lookTex = {}; // тема → слот → {col, nrm, arm} (копии со своим шагом)
const lookFull = {}, // тема загрузилась целиком
  lookLoads = {}; // идущая загрузка темы: повторные вызовы ждут её
// загрузить текстуры темы (один раз); onProgress — доля 0..1
export function loadLook(renderer, id, onProgress) {
  if (lookFull[id]) return Promise.resolve();
  if (!lookLoads[id])
    lookLoads[id] = loadLookOnce(renderer, id, onProgress).finally(
      () => delete lookLoads[id],
    );
  return lookLoads[id];
}
async function loadLookOnce(renderer, id, onProgress) {
  const L = LOOKS[id],
    aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const names = [...new Set(SLOTS.map((s) => L[s][0]))];
  let done = 0;
  const base = {};
  await Promise.all(
    names.flatMap((n) =>
      ["col", "nrm", "arm"].map(async (k) => {
        base[n + "_" + k] = await loadTex(n, k, aniso);
        if (onProgress) onProgress(++done / (names.length * 3));
      }),
    ),
  );
  const out = {};
  for (const s of SLOTS) {
    const [n, size] = L[s];
    out[s] = {};
    for (const k of ["col", "nrm", "arm"]) {
      const b = base[n + "_" + k];
      if (!b) continue;
      // своя копия: шаг плитки у пола и стен разный (картинка в видеопамяти общая)
      const t = b.clone();
      if (size) t.repeat.set(1 / size, 1 / size);
      t.needsUpdate = true;
      out[s][k] = t;
    }
  }
  lookTex[id] = out;
  // чего-то не хватает — уровень пока с тем, что есть (остальное плоским цветом), тема не считается готовой
  lookFull[id] = Object.values(base).every((t) => t);
}
export const lookReady = (id) => !!lookFull[id];
// надеть тему на общие материалы (текстуры уже загружены loadLook)
export function applyLook(M, id) {
  const L = LOOKS[id] || LOOKS.mansion,
    T = lookTex[id] || {};
  for (const s of SLOTS) {
    const [, , color, x = {}] = L[s],
      t = T[s] || {},
      mat = M[s];
    Object.assign(mat, {
      map: t.col || null,
      normalMap: t.nrm || null,
      aoMap: t.arm || null,
      roughnessMap: x.rough != null ? null : t.arm || null,
      roughness: x.rough != null ? x.rough : 1,
      metalness: 0,
      color: new THREE.Color(color),
    });
    mat.normalScale.setScalar(x.ns != null ? x.ns : 1);
    mat.needsUpdate = true;
  }
  M.trim.color.set(L.trim.color);
  M.trim.roughness = L.trim.roughness;
  M.trim.metalness = L.trim.metalness;
  M.velvet.color.set(L.velvet);
  windowShared();
  glassMat.uniforms.view.value = viewFor(L.view);
}
// старое имя: текстуры особняка при запуске
export async function loadTheme(renderer, M, onProgress) {
  await loadLook(renderer, "mansion", onProgress);
  applyLook(M, "mansion");
}
