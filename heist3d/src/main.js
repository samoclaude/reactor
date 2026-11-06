// Ограбление 3D: запуск, режимы, такты, сборка сцены и цикл кадра.
import * as THREE from "three";
import * as G from "./logic.js";
import * as W from "./world.js";
import { Runner } from "./runner.js";
import * as A from "./audio.js";
import { drawPlan } from "./plan.js";
import * as P from "./props.js";
import { Closeup, makeKeypad, makeSafePanel, makeNote } from "./closeup.js";
import * as N from "./net.js";
import { buildVan, VanView, drawFeeds } from "./van.js";
import * as GD from "./guard.js";
import { Cutscenes } from "./scenes.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const BUILD = "3d-0.1";
const TICK_MS = 1300; // длина такта: столько охранник идёт из клетки в клетку
const APP = "heist3d";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(APP + ":" + k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(APP + ":" + k, JSON.stringify(v));
    } catch (e) {}
  },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const angLerp = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

/* ======================= рендер и свет ======================= */
const canvas = $("#view3d");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false; // счётчик вызовов за весь кадр (с постобработкой проходов несколько)
// зерно для слоя .post: светлые и тёмные крапинки с разной прозрачностью
{
  const cv = document.createElement("canvas");
  cv.width = cv.height = 160;
  const g = cv.getContext("2d"),
    d = g.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 255 : 0;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = Math.random() * 255;
  }
  g.putImageData(d, 0, 0);
  document.documentElement.style.setProperty(
    "--grain",
    `url(${cv.toDataURL()})`,
  );
}
const QUALITY = {
  // число источников постоянное: шейдер считает каждый, даже выключенный
  smooth: {
    scale: 0.7,
    maxDpr: 1,
    shadow: 512,
    lamps: 2,
    lasers: 1,
    guardLight: false,
  },
  max: {
    scale: 1,
    maxDpr: 1.5,
    shadow: 1024,
    lamps: 4,
    lasers: 2,
    guardLight: true,
    bloom: true, // свечение лазеров, ламп и фонарей (постобработка)
  },
};
let qName = QUALITY[store.get("quality", "smooth")]
    ? store.get("quality", "smooth")
    : "smooth",
  Q = QUALITY[qName];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020305);
scene.fog = new THREE.Fog(0x020305, 2.5, 13);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
scene.add(camera);
// ночь: рассеянный свет еле-еле, остальное — фонарик, луна из окон и редкие бра
const hemi = new THREE.HemisphereLight(0x3c5070, 0x0c0907, 0.35);
scene.add(hemi);
// фонарик в правой руке: единственный свет с тенью в режиме «Плавно»
const FLASH = 13;
const flash = new THREE.SpotLight(0xfff0d8, FLASH, 18, 0.72, 0.6, 1.6);
flash.map = flashCookie();
flash.position.set(0.2, -0.25, 0.05);
flash.castShadow = true;
flash.shadow.bias = -0.0005;
flash.shadow.normalBias = 0.02;
flash.shadow.camera.near = 0.15;
flash.shadow.camera.far = 16;
camera.add(flash);
flash.target.position.set(0.04, -0.2, -4);
camera.add(flash.target);
// рисунок фонаря: яркое пятно, кольцо отражателя, тусклый ореол
function flashCookie() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d"),
    gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.16, "#f2efe8");
  gr.addColorStop(0.3, "#8e8a84");
  gr.addColorStop(0.38, "#b4b0a8");
  gr.addColorStop(0.46, "#5e5c58");
  gr.addColorStop(0.75, "#262524");
  gr.addColorStop(1, "#000000");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv); // без sRGB: серые значения — прямо доля света
}
// пыль в луче фонаря: точки висят вокруг вора и светятся только внутри конуса
const dust = (() => {
  const N = 500,
    pos = new Float32Array(N * 3),
    seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = Math.random() * 6;
    pos[i * 3 + 1] = Math.random() * 3;
    pos[i * 3 + 2] = Math.random() * 6;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      cam: { value: new THREE.Vector3() },
      fpos: { value: new THREE.Vector3() },
      fdir: { value: new THREE.Vector3(0, 0, -1) },
      time: { value: 0 },
      size: { value: 20 },
    },
    vertexShader: `uniform vec3 cam, fpos, fdir; uniform float time, size; attribute float seed; varying float vA;
void main(){
  vec3 p = position + vec3(sin(time * 0.13 + seed * 40.0), sin(time * 0.09 + seed * 23.0) * 0.6 - time * 0.012, cos(time * 0.11 + seed * 31.0)) * 0.25;
  vec3 box = vec3(6.0, 3.0, 6.0);
  p = cam + mod(p - cam + box * 0.5, box) - box * 0.5;
  vec3 d = p - fpos; float L = length(d);
  vA = smoothstep(0.8, 0.95, dot(d / L, fdir)) * smoothstep(0.25, 0.7, L) * (1.0 - smoothstep(2.0, 4.5, L)) * (0.4 + 0.6 * seed);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = size * (0.5 + seed) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `varying float vA; void main(){ float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * 0.4, a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return mat.uniforms;
})();
function updateDust(now) {
  flash.getWorldPosition(dust.fpos.value);
  flash.target.getWorldPosition(dust.fdir.value);
  dust.fdir.value.sub(dust.fpos.value).normalize();
  dust.cam.value.copy(camera.position);
  dust.time.value = now / 1000;
  dust.size.value = 11 * renderer.getPixelRatio();
}
let lampPool = [],
  laserPool = [];
function makePools() {
  for (const l of [...lampPool, ...laserPool]) {
    scene.remove(l);
    l.dispose();
  }
  lampPool = Array.from({ length: Q.lamps }, () => {
    const l = new THREE.PointLight(0xffb060, 0, 7, 2);
    scene.add(l);
    return l;
  });
  laserPool = Array.from({ length: Q.lasers }, () => {
    const l = new THREE.PointLight(0xff2a1e, 0, 4.5, 2);
    scene.add(l);
    return l;
  });
}

// «Максимум»: кадр рисуется через постобработку со свечением
let composer = null;
function renderMain() {
  if (!Q.bloom) {
    renderer.render(scene, camera);
    return;
  }
  if (!composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        0.55,
        0.45,
        0.8,
      ),
    );
    composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
  }
  composer.render();
}
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (van) {
    van.cam.aspect = w / h;
    van.cam.updateProjectionMatrix();
  }
  const mc = $("#mini"),
    r = mc.getBoundingClientRect(),
    d = Math.min(2, devicePixelRatio || 1);
  if (r.width) {
    mc.width = Math.round(r.width * d);
    mc.height = Math.round(r.height * d);
  }
}
function applyQuality() {
  Q = QUALITY[qName];
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.maxDpr) * Q.scale);
  flash.shadow.mapSize.set(Q.shadow, Q.shadow);
  if (flash.shadow.map) {
    flash.shadow.map.dispose();
    flash.shadow.map = null;
  }
  makePools();
  if (level)
    for (const o of level.guards) {
      o.spot.visible = Q.guardLight;
      o.spot.castShadow = Q.guardLight;
    }
  $("#qSmooth").classList.toggle("y", qName === "smooth");
  $("#qMax").classList.toggle("y", qName === "max");
  resize();
}
addEventListener("resize", resize);

/* ======================= уровень в 3D ======================= */
const M = W.makeMaterials(null);
let level = null;
let van = null,
  vanView = null; // фургон штурмана создаётся при первой роли штурмана
const runner = new Runner(camera, canvas);

/* ======================= сценки: приезд и уход ======================= */
const cuts = new Cutscenes($("#fade")),
  arrivedKey = new Set();
addEventListener("keydown", (e) => {
  if (cuts.active && ["Space", "Escape", "Enter"].includes(e.code)) {
    e.preventDefault();
    e.stopImmediatePropagation(); // пробел не должен уйти в игру («ждать» во «вслепую»)
    cuts.skip();
  }
});
canvas.addEventListener("pointerdown", () => cuts.skip());

// громкие шаги — обычная ходьба, тихие — когда крадётся (Shift)
runner.onStep = (loud) =>
  A.noise(loud ? 0.07 : 0.05, { f: loud ? 700 : 400, v: loud ? 0.16 : 0.06 });

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !Object.values(M).includes(o.material)) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        m.dispose(),
      );
    }
  });
}
function blockWallSpot(R, s, width, depth) {
  const [ix, iz] = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ][s.wallDir]; // внутрь комнаты
  const ax = ix === 0,
    x0 = ax ? s.x - width / 2 : Math.min(s.x, s.x + ix * depth),
    x1 = ax ? s.x + width / 2 : Math.max(s.x, s.x + ix * depth);
  const z0 = ax ? Math.min(s.z, s.z + iz * depth) : s.z - width / 2,
    z1 = ax ? Math.max(s.z, s.z + iz * depth) : s.z + width / 2;
  W.blockRect(R, x0, z0, x1, z1);
}
function cellRect(lv, c) {
  const x = c % lv.W,
    y = (c / lv.W) | 0;
  return [
    W.x0Of(x),
    W.x0Of(y),
    W.x0Of(x) + W.sizeOf(x),
    W.x0Of(y) + W.sizeOf(y),
  ];
}
function buildGem(lv) {
  const [cx, cz] = W.cellXZ(lv, lv.gem),
    d = W.entranceDir(lv, lv.gem),
    [bx, bz] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][(d + 2) % 4];
  const g = new THREE.Group();
  g.position.set(
    cx + bx * (W.ROOM / 2 - 0.55),
    0,
    cz + bz * (W.ROOM / 2 - 0.55),
  );
  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 1.0, 24),
    M.stone,
  );
  ped.position.y = 0.5;
  ped.castShadow = true;
  g.add(ped);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshStandardMaterial({
      color: 0x9fe8ff,
      emissive: 0x2a8fbf,
      emissiveIntensity: 0.6,
      roughness: 0.05,
      metalness: 0.1,
    }),
  );
  gem.position.y = 1.15;
  g.add(gem);
  const glow = W.glowSprite(0x9fe8ff, 0.6, 0.5);
  glow.position.y = 1.15;
  g.add(glow);
  return { group: g, gem, glow };
}

function buildLevel(lv) {
  if (level) {
    scene.remove(level.group);
    disposeGroup(level.group);
  }
  const R = W.makeRaster(lv),
    group = new THREE.Group();
  const shell = W.buildShell(lv, R, M);
  group.add(shell.group);
  // всё неподвижное собираем в decor и потом склеиваем по материалам
  const decor = new THREE.Group(),
    lamps = [],
    flames = [];
  const spots = W.landmarkSpots(lv);
  for (const s of spots) {
    const o = P.buildLandmark(s.li, M) || W.placeholderLandmark(s.li);
    o.position.set(s.x, 0, s.z);
    o.rotation.y = s.yaw;
    decor.add(o);
    o.updateMatrixWorld(true);
    blockWallSpot(R, s, o.userData.width || 0.9, o.userData.depth || 0.45);
    if (o.userData.light) {
      lamps.push(o.localToWorld(o.userData.light.clone()));
      flames.push(o.userData.flame);
    }
  }
  // укрытия: шкаф или портьера у глухой стены; eye — откуда спрятавшийся вор смотрит в комнату
  const hides = (lv.hides || []).map((h) => {
    const [dx, dz] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][h.d],
      s = {
        room: h.c,
        wallDir: h.d,
        x: W.cOf(h.c % lv.W) + (dx * W.ROOM) / 2,
        z: W.cOf((h.c / lv.W) | 0) + (dz * W.ROOM) / 2,
      };
    const o = P.hideModel(h.kind),
      depth = o ? o.userData.size.z : 0.6,
      width = o ? o.userData.size.x : 1.4;
    if (o) {
      o.position.set(s.x, 0, s.z);
      o.rotation.y = W.yawOf(h.d);
      decor.add(o);
    }
    blockWallSpot(R, s, width + 0.1, depth + 0.05);
    const eye = new THREE.Object3D();
    eye.position.set(s.x - dx * (depth + 0.06), 1.5, s.z - dz * (depth + 0.06));
    group.add(eye);
    return Object.assign({}, h, {
      eye,
      n: new THREE.Vector3(-dx, 0, -dz),
      spot: s,
    });
  });
  // камеры наблюдения (с дела №5): на стене комнаты под потолком
  const cams = lv.cams.map((c) => {
    const o = W.buildCamera(lv, c, P.rawModel("camera"));
    group.add(o.group);
    return o;
  });
  const walls = W.freeWalls(lv, [
      ...spots,
      ...hides.map((h) => h.spot),
      ...cams.map((o) => o.spot),
    ]),
    used = new Set();
  // выход — служебная дверь в комнате E; ещё две такие же двери-обманки в других комнатах
  const pick = (room) =>
    walls
      .filter((f) => f.room === room && !used.has(f))
      .sort((a, b) => b.outer - a.outer || a.r - b.r)[0] || null;
  const exitWall = pick(lv.E);
  if (exitWall) used.add(exitWall);
  const decoys = walls
    .filter((f) => ![lv.E, lv.S, lv.gem].includes(f.room))
    .sort((a, b) => a.r - b.r);
  const decoyRooms = new Set();
  for (const f of decoys) {
    if (decoyRooms.size >= 2 || decoyRooms.has(f.room)) continue;
    decoyRooms.add(f.room);
    used.add(f);
    decor.add(W.buildServiceDoor(f.x, f.z, f.yaw, M));
  }
  const sconceRooms = new Set();
  for (const f of walls) {
    if (used.has(f)) continue;
    if (f.outer && f.r < 0.7) {
      const w = W.buildWindow(f.x, f.z, f.yaw, M, f.r);
      decor.add(w);
      w.updateMatrixWorld(true);
      const p = w.localToWorld(w.userData.light.clone());
      p.col = 0x8fb0e8;
      p.k = 1.4;
      lamps.push(p);
      continue;
    }
    if (!sconceRooms.has(f.room) && f.r < 0.22) {
      sconceRooms.add(f.room);
      const sc = W.buildSconce();
      sc.group.position.set(f.x, 0, f.z);
      sc.group.rotation.y = f.yaw;
      decor.add(sc.group);
      sc.group.updateMatrixWorld(true);
      lamps.push(sc.group.localToWorld(sc.light.clone()));
    }
  }
  // люстры: тёмные, без света — силуэт под потолком
  for (let y = 1; y < lv.H; y += 2)
    for (let x = 1; x < lv.W; x += 2) {
      if ((x * 7 + y * 13) % 5 > 1) continue; // люстра не в каждой комнате
      const c = P.chandelier();
      if (!c) break;
      c.position.set(W.cOf(x), W.CEIL - c.userData.size.y, W.cOf(y));
      c.rotation.y = (((x * 7 + y * 3) % 4) * Math.PI) / 2;
      decor.add(c);
    }
  // створки в проёмах (кроме двери хранилища)
  const rd = W.buildRoomDoors(lv, shell.doorways, new Set([lv.door]), M);
  decor.add(rd.group);
  for (const b of rd.blocks) W.blockRect(R, b[0], b[1], b[2], b[3]);
  group.add(P.bakeStatic(decor));
  const lasers = lv.lasers.map((l) => {
    const o = W.buildLaser(lv, l);
    group.add(o.group);
    return o;
  });
  const guards = lv.guards.map((gd) => {
    const gm = GD.makeGuardModel();
    const o = W.buildGuardPlaceholder(lv, gm && gm.model);
    if (gm) {
      o.gm = gm;
      group.add(gm.cap, gm.torch);
    }
    o.spot.visible = o.spot.castShadow = Q.guardLight;
    group.add(o.group);
    return Object.assign(o, { gd, yaw: 0 });
  });
  let safe = null,
    gem = null,
    door = null,
    note = null;
  if (lv.safe) {
    safe = W.buildSafe(lv, M, P.rawModel("safe"));
    group.add(safe.group);
  } else {
    gem = buildGem(lv);
    group.add(gem.group);
  }
  {
    const [cx, cz] = W.cellXZ(lv, lv.gem),
      d = W.entranceDir(lv, lv.gem),
      [bx, bz] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][(d + 2) % 4];
    const px = cx + bx * (W.ROOM / 2 - 0.5),
      pz = cz + bz * (W.ROOM / 2 - 0.5);
    W.blockRect(R, px - 0.55, pz - 0.55, px + 0.55, pz + 0.55);
  }
  if (lv.door >= 0) {
    door = W.buildDoor(lv, M, P.rawModel("vault"));
    group.add(door.group);
    door.pad.clear();
    door.keypad = makeKeypad();
    door.pad.add(door.keypad.group);
    const r = cellRect(lv, lv.door);
    W.blockRect(R, r[0], r[1], r[2], r[3], 2);
  }
  if (lv.note >= 0) {
    note = W.buildNote(lv, M);
    note.paper.visible = false;
    group.add(note.group);
    const [cx, cz] = W.cellXZ(lv, lv.note);
    W.blockRect(R, cx - 0.35, cz - 0.35, cx + 0.35, cz + 0.35);
  }
  const exit = W.buildExit(lv, M, exitWall);
  group.add(exit.group);
  scene.add(group);
  level = {
    lv,
    R,
    group,
    lasers,
    guards,
    cams,
    safe,
    gem,
    door,
    note,
    exit,
    lamps,
    flames,
    hides,
    doorAng: 0,
  };
}

/* ======================= состояние игры (как в 2D) ======================= */
let mode = "idle"; // idle | solo | online
let solo = null,
  lv = null,
  lvKey = "",
  sim = null,
  simAtt = -1,
  simLen = 0,
  cur = { safe: null, door: null, panel: null };
let lastCaughtKey = "",
  lastWonKey = "",
  briefedKey = "",
  tickAt = 0,
  lastT = -1,
  menuAt = 0,
  pingUntil = 0,
  pingLeft = 0,
  pingKey = "";
const src = () =>
  mode === "online" ? N.net.room : mode === "solo" ? solo : null;
const blind = () => mode === "solo" && !!(solo && solo.blind);
// роли как в 2D: в онлайне вор — тот, чьё место совпадает с чётностью дела
function role() {
  if (window.__role) return window.__role; // для проверок
  if (mode === "solo") return solo && solo.blind ? "runner" : "both";
  if (mode !== "online" || !N.net.room) return "nav";
  const s = N.mySeat();
  return s < 0 ? "nav" : s === N.net.room.lvl % 2 ? "runner" : "nav";
}
function amWriter() {
  if (mode === "solo") return true;
  const r = N.net.room;
  return !!r && N.started(r) && N.mySeat() === r.lvl % 2;
}
function saveSrc() {
  if (mode === "solo") store.set(solo && solo.blind ? "blind" : "solo", solo);
  else if (mode === "online") N.saveRoom();
}
const started = () =>
  mode === "solo" || (mode === "online" && N.started(N.net.room));
function partnerName() {
  const r = N.net.room;
  if (!r) return "напарник";
  return r.names[1 - Math.max(0, N.mySeat())] || "напарник";
}

function sync(full) {
  const s = src();
  if (!s) return;
  const k = s.code + "|" + s.lvl;
  // «Ещё раз» (своё или напарника): то же дело, новая попытка
  const again = !!lv && lvKey === k && simAtt >= 0 && s.att !== simAtt;
  if (!lv || lvKey !== k) {
    lv = G.getLevel(s.code, s.lvl);
    lvKey = k;
    full = true;
    buildLevel(lv);
  }
  cur = {
    safe: lv.safe ? G.safeFor(s.code, s.lvl, s.att) : null,
    door: lv.door >= 0 ? G.doorFor(s.code, s.lvl, s.att) : null,
    panel: lv.gate >= 0 ? G.panelFor(s.code, s.lvl, s.att) : null,
  };
  if (level.att !== s.att) attemptProps(s.att);
  if (full || s.att !== simAtt || s.log.length < simLen) {
    sim = G.simulate(lv, s.log, s.att, cur);
    simAtt = s.att;
    simLen = s.log.length;
    if (full) placeRunner();
  } else {
    while (simLen < s.log.length) {
      const e = s.log[simLen++];
      const was = G.cloneSim(sim);
      G.applyEv(lv, sim, e, cur);
      evFx(e, was);
    }
  }
  if (sim.t !== lastT) {
    lastT = sim.t;
    tickAt = performance.now();
  }
  ui();
  if (again && $("#brief").hidden && $("#menu").hidden) arrive();
}
function placeRunner() {
  const [x, z] = W.cellXZ(lv, sim.pos);
  runner.place(x, z, W.yawOf(sim.face));
}
function pushEv(e) {
  const s = src();
  if (!s.log.length && !s.t0) s.t0 = Date.now();
  s.log.push(e);
  saveSrc();
  if (mode === "online")
    N.send("ev", {
      lvl: s.lvl,
      att: s.att,
      seq: s.log.length - 1,
      e,
      t0: s.t0 || 0,
    });
  sync();
}
// событие уходит, только если оно что-то меняет в симуляции
function tryEv(e) {
  const t = G.cloneSim(sim);
  if (!G.applyEv(lv, t, e, cur)) return false;
  pushEv(e);
  return true;
}
function evFx(e, was) {
  if (e[0] === "o") {
    A.sfxUnlock();
    toast("🔓 Дверь открыта!");
    return;
  }
  if (e[0] === "x") {
    A.sfxBad();
    toast("✖ Неверный код! −10 секунд");
    return;
  }
  if (e[0] === "k") {
    if (sim.caught) return alarm();
    if (sim.strikes > was.strikes) {
      A.sfxBad();
      toast(
        `✖ Не тот символ! −15 с. Ошибок: ${sim.strikes} из ${cur.safe.maxStrikes}`,
      );
    } else if (sim.gem) {
      A.sfxGem();
      toast("🔓 Сейф открыт! Добыча у вора. Теперь к выходу");
    } else A.sfxKey();
    return;
  }
  if (sim.caught && !was.caught) return alarm();
  if ((sim.heard || 0) > (was.heard || 0)) {
    A.sfxBad();
    toast(
      role() === "nav"
        ? "💂 Охрана услышала шаги вора и идёт на шум!"
        : "💂 Тебя услышали! Охранник идёт на шум — уходи или прячься. Рядом с охраной крадись: Shift",
    );
  }
  if (sim.hidden && !was.hidden && role() !== "nav")
    toast("Ты спрятался: охрана тебя не видит. E — выйти");
  if (sim.gem && !was.gem) {
    A.sfxGem();
    toast("💎 Добыча у вора! Теперь к выходу");
  }
  if (sim.noteTaken && !was.noteTaken) {
    A.sfxNote();
    if (role() !== "nav")
      toast("📝 Записка у тебя. Достать — клавиша 4, прочитай её штурману");
  }
  if (sim.won && !was.won) A.sfxWin();
}
function alarm() {
  A.sfxAlarm();
  const f = $("#redflash");
  f.classList.add("on", "strobe");
  setTimeout(() => f.classList.remove("on"), 900);
  // красно-синяя мигалка, пока не появится экран «попались»
  setTimeout(() => f.classList.remove("strobe"), 2600);
  runner.unlock();
}

/* ---------- время: такты в живом режиме, шаги во «Вором вслепую» ---------- */
const playing = () =>
  sim &&
  !sim.caught &&
  !sim.won &&
  $("#brief").hidden &&
  $("#menu").hidden &&
  started();
function advanceTicks() {
  const s = src();
  if (!amWriter() || blind() || !playing() || !s.t0 || window.__freeze) return;
  const tk = Math.floor((Date.now() - s.t0) / TICK_MS);
  if (tk > sim.t) pushEv("T" + tk.toString(36));
}
function trackCell() {
  if (!amWriter() || !playing()) return;
  const c = W.cellAt(lv, runner.pos.x, runner.pos.z);
  if (c < 0 || c === sim.pos) return;
  let path = [c];
  if (!G.adjCell(lv, sim.pos, c)) {
    // кадр проскочил клетку: идём через общую соседнюю
    const mid = [0, 1, 2, 3]
      .map((d) => G.stepT(lv, sim.pos, d))
      .find((n) => n >= 0 && lv.g[n] && G.adjCell(lv, n, c));
    if (mid == null) return;
    path = [mid, c];
  }
  // обычным шагом — событие r: охрана в пределах слышимости идёт на шум; крадётся (Shift) — m, тихо
  const pre = blind() ? "M" : runner.loud ? "r" : "m";
  for (const n of path) {
    if (!tryEv(pre + n.toString(36)) || sim.caught || sim.won) break;
  }
}
addEventListener("keydown", (e) => {
  if (e.code === "Space" && blind() && playing() && role() === "runner") {
    e.preventDefault();
    tryEv("w");
  }
});

/* ======================= таймер ======================= */
function curStart() {
  const s = src();
  return G.startOf(lv, s ? s.att : 0);
}
function limitMs() {
  return lv && lv.limit ? curStart().limit * 1000 * (blind() ? 2 : 1) : 0;
}
function penaltyMs() {
  return sim
    ? (sim.strikes * 15 + sim.wrong * 10 + (sim.pstrikes || 0) * 20) * 1000
    : 0;
}
function timerLeft() {
  const s = src();
  if (!s || !lv || !lv.limit) return null;
  if (!s.t0) return limitMs();
  const now = menuAt || Date.now();
  return limitMs() - (now - s.t0) - penaltyMs();
}
let lastClockSec = -1;
function tickClock() {
  const el = $("#clock"),
    tl = timerLeft();
  if (tl == null || !sim) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const sec = Math.max(0, Math.ceil(tl / 1000)),
    st = !!src().t0;
  el.textContent = `⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  el.classList.toggle("idle", !st);
  el.classList.toggle("low", st && sec <= 20 && !sim.caught && !sim.won);
  if (st && sec <= 10 && sec !== lastClockSec && !sim.caught && !sim.won) {
    lastClockSec = sec;
    A.tone(1500, 0.05, { type: "square", v: 0.05 });
  }
  if (
    st &&
    tl <= 0 &&
    amWriter() &&
    !sim.caught &&
    !sim.won &&
    $("#menu").hidden
  )
    pushEv("z");
}

/* ======================= интерфейс ======================= */
let toastT = 0;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2600);
}
const NEWS = {
  0: "Ходи W A S D, смотри мышью, Shift — красться (медленно и тихо). Время идёт тактами: охрана и мигающие лазеры шагают раз в секунду с небольшим, а стоишь на месте — значит ждёшь. Штурман из фургона видит схему, но не видит вора: описывай, что вокруг.",
  1: "Старт случайный, и штурман его не видит: вор, опиши, что вокруг. Таймер тревоги пошёл, как только вор закрыл брифинг. С этого дела вор не видит лучей лазеров — только красные огоньки на стойках излучателей. Горит луч или нет, видит только штурман на схеме: мигающие гаснут через такт, штурман командует «стой… пошёл».",
  2: "Дверь с кодом. Серийный номер двери только у штурмана, а на записке у вора написано, какие цифры из него нужны. Код вор набирает на панели у двери. Ошибка — минус 10 секунд. Ориентиры начинают повторяться.",
  3: "Сейф: у вора 6 странных символов, 2 из них обманки, инструкция у штурмана. И первый охранник: ходит туда-обратно с фонарём и видит на 2 клетки вперёд. Вор его видит, но куда он свернёт, знает только штурман. Обычные шаги охранник слышит за 2 комнаты и идёт на шум — рядом с ним зажми Shift и крадись. Иногда он заглядывает в соседнюю комнату: штурман видит это заранее (оранжевый пунктир и «!»). В комнатах рядом с охраной есть шкаф или портьера: E — спрятаться, там тебя не видно.",
};
function ui() {
  const s = src(),
    r = role();
  if (!s || !lv || !sim) return;
  const online = mode === "online",
    ready = started();
  document.title = `Ограбление 3D · Дело №${s.lvl + 1}`;
  $("#caseNum").textContent = `Дело №${s.lvl + 1}`;
  $("#caseName").textContent = lv.name;
  let sub = `Такт ${sim.t}`;
  if (blind()) sub += ` · код дела ${s.code}`;
  if (s.att) sub += ` · попытка ${s.att + 1}`;
  if (online) {
    const pid = N.net.room.seats[1 - Math.max(0, N.mySeat())];
    sub +=
      pid && N.net.online.has(pid)
        ? ` · ${partnerName()} в сети`
        : pid
          ? ` · ${partnerName()} не в сети`
          : " · ждём напарника";
  }
  $("#caseSub").textContent = sub;
  const tag = $("#roleTag");
  tag.className = "role " + r;
  tag.innerHTML =
    r === "runner"
      ? '🥷<span class="rt"> ВОР</span>'
      : r === "nav"
        ? '🗺️<span class="rt"> ШТУРМАН</span>'
        : '🔎<span class="rt"> ТРЕНИРОВКА</span>';
  $("#minimap").hidden = r !== "both";
  $("#cross").hidden = r === "nav";
  // пеленг: столько раз за попытку, сколько дано делу
  const ak0 = s.code + "|" + s.lvl + "|" + s.att;
  if (pingKey !== ak0) {
    pingKey = ak0;
    const sv = store.get("ping", null);
    pingLeft = sv && sv.k === ak0 ? sv.n : lv.pings;
    pingUntil = 0;
  }
  let st = "";
  if (online && !ready) st = "Ждём второго игрока…";
  else if (sim.caught) st = '<b style="color:var(--red)">Тревога!</b>';
  else if (sim.won) st = '<b style="color:var(--nv)">Ушли!</b>';
  else if (r === "runner")
    st =
      (sim.gem
        ? '<b class="y">💎 у тебя.</b> Теперь к выходу — служебная дверь. '
        : "") +
      "Штурман не видит тебя: рассказывай, что вокруг, и слушай его." +
      (blind() ? " <b>Пробел — ждать такт.</b>" : "");
  else if (r === "nav")
    st =
      (sim.gem
        ? `<b class="y">💎 у ${esc(partnerName())}.</b> Веди к выходу. `
        : "") +
      (lv.L > 0 && sim.t < 4 && !sim.gem
        ? "<b>Где вор начал, ты не знаешь.</b> Пусть опишет, что вокруг. "
        : "") +
      "Клик по планшету — схема крупно, по папке — документы, красная кнопка — пеленг.";
  else
    st = sim.gem
      ? '<b class="y">💎 у тебя.</b> Теперь к выходу (служебная дверь, у неё зелёная палочка)'
      : "Тренировка: видно всё. Найди 💎 и уйди через служебную дверь";
  $("#status").innerHTML = st;
  // документы штурмана: какой лист нужен прямо сейчас
  const nearDoor = lv.door >= 0 && !sim.open && G.adjCell(lv, sim.pos, lv.door);
  const want = {
    door: lv.door >= 0 && !sim.open && (nearDoor || sim.note),
    safe: lv.safe && !sim.gem && sim.pos === lv.gem,
    panel: lv.panel >= 0 && sim.pos === lv.panel && !sim.gateOff,
  };
  for (const k in want) {
    const dk = k + (k === "door" && nearDoor ? "@" : "") + "|" + ak0;
    if (want[k] && !docSeen[dk]) {
      docSeen[dk] = 1;
      if (r === "nav" || r === "both") {
        docTab = k;
        if (r === "nav") toast(`📁 В папке: «${DOCN[k]}»`);
      }
    }
  }
  if (r === "nav" || r === "both") renderDocs(want);
  const ak = ak0;
  if (sim.caught && lastCaughtKey !== ak) {
    lastCaughtKey = ak;
    const gk = sim.caught === "guard" ? G.whoCaught(lv, sim) : -1;
    const why = {
      guard:
        gk >= 0
          ? `Охранник №${gk + 1} заметил вора.`
          : "Охранник заметил вора.",
      cam: "Вор попал в камеру.",
      laser: "Вор задел лазер.",
      time: "Время вышло, сработала тревога.",
      safe: "Слишком много ошибок на сейфе, сработала тревога.",
      gate: "Вор шагнул в лазерный барьер.",
      panel: "Не тот провод на щитке — сработала тревога.",
    }[sim.caught];
    setTimeout(() => {
      if (sim && sim.caught && src() && src().att === s.att) {
        $("#caughtWhy").textContent =
          why +
          (lv.L > 0
            ? " Здание то же, но вор начнёт с другого места, а коды будут новые."
            : " Попробуйте ещё раз.");
        $("#caught").hidden = false;
        runner.unlock();
      }
    }, 2600);
  }
  if (!sim.caught) $("#caught").hidden = true;
  if (sim.won && lastWonKey !== ak) {
    lastWonKey = ak;
    runner.unlock();
    const showWon = () => {
      if (!sim || !sim.won) return;
      const tl = timerLeft(),
        used =
          tl != null && src().t0 ? Math.round((limitMs() - tl) / 1000) : null;
      $("#wonText").innerHTML =
        `Тактов: <b>${sim.t}</b>${lv.safe ? ` · ошибок на сейфе: <b>${sim.strikes}</b>` : ""}${used != null ? ` · время: <b>${Math.floor(used / 60)}:${String(used % 60).padStart(2, "0")}</b>` : ""}.${online ? " В следующем деле роли меняются." : ""}`;
      $("#won").hidden = false;
    };
    setTimeout(() => {
      // пока ждали, могли нажать «заново» или открыть меню — тогда без сценки
      if (!sim || !sim.won || lastWonKey !== ak || !$("#menu").hidden)
        return showWon();
      if (cuts.ready()) cuts.play("escape", showWon);
      else showWon();
    }, 900);
  }
  if (!sim.won) $("#won").hidden = true;
  const bk = s.code + "|" + s.lvl;
  if (ready && briefedKey !== bk && $("#menu").hidden) {
    briefedKey = bk;
    showBrief();
  }
}
function showBrief() {
  const s = src(),
    r = role(),
    bl = blind(),
    pn = esc(mode === "online" ? partnerName() : bl ? "Claude" : "");
  $("#briefStamp").textContent = `ДЕЛО №${s.lvl + 1}`;
  $("#briefName").textContent = lv.name;
  $("#briefRole").innerHTML =
    r === "runner"
      ? `<span class="e">🥷</span><div><b>Ты — ВОР</b><p>Ты в тёмном особняке с фонариком: W A S D, мышь, Shift — красться (тихо), E — взломать. Охрану и лазеры видишь, когда они перед тобой, но куда охранник свернёт, знает только штурман${pn ? " (" + pn + ")" : ""}. Рассказывай, что вокруг (картины, статуи, часы), и делай, что он говорит. Найди 💎 и уходи через служебную дверь. Таких дверей несколько, выход — та, у которой зелёная палочка.${lv.safe ? " У добычи сейф: опиши символы штурману." : ""}${bl ? ` <b>Напиши Claude: «дело №${s.lvl + 1}, код ${esc(s.code)}»</b> и что видишь на старте. Время идёт, только когда ты переходишь в новую клетку, пробел — ждать.` : ""}</p></div>`
      : r === "nav"
        ? `<span class="e">🗺️</span><div><b>Ты — ШТУРМАН</b><p>Ты в фургоне. На планшете схема с охраной и лазерами на такт вперёд, но <b>вора на ней нет</b>. Спрашивай${pn ? " " + pn : ""}, что он видит, ищи эти ориентиры и веди голосом к 💎 и к выходу. ${lv.pings ? `📡 Пеленг (красная кнопка у рации) покажет его ${lv.pings} ${lv.pings === 1 ? "раз" : "раза"} за попытку.` : "Пеленга нет."} <b>Инструкции к двери и сейфу — в папке на столе.</b> Вор смотрит мышью куда угодно: спрашивай, куда он повёрнут.</p></div>`
        : `<span class="e">🔎</span><div><b>Тренировка</b><p>Ты видишь всё сам: схема справа вверху. Настоящая игра — вдвоём по звонку.</p></div>`;
  const n = NEWS[s.lvl];
  $("#briefNew").hidden = !n;
  if (n) $("#briefNew").innerHTML = `<b>Новое:</b> ${n}`;
  $("#briefCall").hidden = mode !== "online";
  $("#brief").hidden = false;
  runner.unlock();
}
// старт попытки: таймер (событие g) пишет вор.
// lock — захват мыши только прямо из клика (после сценки браузер не даст, вор кликнет сам)
function startAttempt(lock) {
  const s = src();
  if (s && amWriter() && !s.log.length && sim && !sim.caught) pushEv("g");
  if (lock && role() !== "nav") canvas.requestPointerLock();
}
// сценка «приезд» — на каждой попытке, один раз; false — сценки не будет
function arrive() {
  const s = src();
  if (!s || s.log.length || !cuts.ready() || cuts.active) return false;
  const k = s.code + "|" + s.lvl + "|" + (s.att | 0);
  if (arrivedKey.has(k)) return false;
  arrivedKey.add(k);
  runner.unlock();
  cuts.play("arrive", () => startAttempt(false));
  return true;
}
$("#btnBrief").addEventListener("click", () => {
  A.ensureAudio();
  $("#brief").hidden = true;
  if (!arrive()) startAttempt(true);
});
function restartLevel() {
  const s = src();
  if (!s) return;
  s.att++;
  s.log = [];
  s.t0 = 0;
  saveSrc();
  if (mode === "online") N.send("state", { room: s });
  $("#caught").hidden = true;
  sync(true);
}
function nextLevel() {
  const s = src();
  if (!s) return;
  if (mode === "solo" && !s.blind) {
    trainLvl = Math.min(60, s.lvl + 2);
    store.set("trainLvl", trainLvl);
    renderTrain();
  }
  s.lvl++;
  s.att = 0;
  s.log = [];
  s.t0 = 0;
  s.best = Math.max(s.best || 0, s.lvl);
  saveSrc();
  if (mode === "online") N.send("state", { room: s });
  $("#won").hidden = true;
  sync(true);
}
$("#btnRetry").addEventListener("click", () => {
  A.ensureAudio();
  restartLevel();
});
$("#btnNext").addEventListener("click", () => {
  A.ensureAudio();
  nextLevel();
});

/* ---------- меню ---------- */
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += CODE_ABC[x % CODE_ABC.length];
  return s;
}
let trainLvl = Math.max(1, Math.min(60, store.get("trainLvl", 1) | 0));
function renderTrain() {
  $("#tLvl").textContent = trainLvl;
  $("#tHint").textContent =
    trainLvl >= 4 ? "есть сейф" : trainLvl >= 3 ? "есть дверь" : "";
}
$("#tMinus").addEventListener("click", () => {
  trainLvl = Math.max(1, trainLvl - 1);
  store.set("trainLvl", trainLvl);
  renderTrain();
});
$("#tPlus").addEventListener("click", () => {
  trainLvl = Math.min(60, trainLvl + 1);
  store.set("trainLvl", trainLvl);
  renderTrain();
});
function inGame() {
  return (
    (mode === "solo" && !!solo) ||
    (mode === "online" && !!N.net.room && N.started(N.net.room))
  );
}
function openMenu() {
  if (mode === "solo") menuAt = Date.now();
  runner.unlock();
  if (N.net.on) {
    N.showRoomPanel();
    return;
  }
  $("#btnResume").hidden = !inGame();
  $("#vMain").hidden = false;
  $("#vRoom").hidden = true;
  $("#menu").hidden = false;
  $("#inName").value = store.get("name", "");
}
function closeMenu() {
  $("#menu").hidden = true;
  const s = src();
  if (
    mode === "solo" &&
    s &&
    s.t0 &&
    menuAt &&
    sim &&
    !sim.caught &&
    !sim.won
  ) {
    s.t0 += Date.now() - menuAt;
    saveSrc();
  }
  menuAt = 0;
  if (lv) ui();
}
function startSolo(bl) {
  if (N.net.on) N.leaveRoom();
  mode = "solo";
  const k = bl ? "blind" : "solo";
  solo = store.get(k, null);
  if (!solo || !solo.code || solo.code.length !== 4)
    solo = { code: newCode(), lvl: 0, att: 0, best: 0, log: [] };
  if (!bl && solo.lvl !== trainLvl - 1) {
    solo.lvl = trainLvl - 1;
    solo.att = 0;
    solo.log = [];
    solo.t0 = 0;
  }
  solo.blind = !!bl;
  store.set(k, solo);
  lv = null;
  lvKey = "";
  briefedKey = "";
  $("#caught").hidden = true;
  $("#won").hidden = true;
  $("#menu").hidden = true;
  sync(true);
}
$("#btnResume").addEventListener("click", () => {
  A.ensureAudio();
  closeMenu();
});
$("#btnSolo").addEventListener("click", () => {
  A.ensureAudio();
  startSolo(false);
});
$("#btnBlind").addEventListener("click", () => {
  A.ensureAudio();
  startSolo(true);
});
$("#btnCreate").addEventListener("click", () => {
  A.ensureAudio();
  N.createRoom();
});
const inCode = $("#inCode");
inCode.addEventListener("input", () => {
  const v = N.normCode(inCode.value);
  if (inCode.value !== v) inCode.value = v;
});
const doJoin = () => {
  const v = N.normCode(inCode.value);
  if (v.length !== 4) {
    toast("Введи код из 4 символов");
    inCode.focus();
    return;
  }
  A.ensureAudio();
  N.joinRoom(v);
};
$("#btnJoin").addEventListener("click", doJoin);
inCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doJoin();
});
$("#btnShare").addEventListener("click", N.shareInvite);
$("#btnLeave").addEventListener("click", () => {
  N.leaveRoom();
  openMenu();
});
$("#btnRoomClose").addEventListener("click", () => closeMenu());
addEventListener("hashchange", () => {
  const c = N.codeFromHash();
  if (c && (!N.net.on || N.net.code !== c)) N.joinRoom(c);
});
$("#btnMenu").addEventListener("click", () => {
  if (!$("#menu").hidden) {
    if (inGame()) closeMenu();
    return;
  }
  openMenu();
});
let nameT = 0;
function onNameInput(e) {
  const v = e.target.value.slice(0, 12);
  store.set("name", v.trim());
  (e.target.id === "inName" ? $("#inName2") : $("#inName")).value = v;
  if (N.net.on && N.net.room && N.mySeat() >= 0) {
    clearTimeout(nameT);
    nameT = setTimeout(() => {
      const k = N.mySeat();
      if (k < 0) return;
      N.net.room.names[k] = N.myName() || null;
      N.saveRoom();
      N.refreshOnline();
      N.send("name", { name: N.myName() || null });
    }, 500);
  }
}
$("#inName").addEventListener("input", onNameInput);
$("#inName2").addEventListener("input", onNameInput);
$("#qSmooth").addEventListener("click", () => {
  qName = "smooth";
  store.set("quality", qName);
  applyQuality();
});
$("#qMax").addEventListener("click", () => {
  qName = "max";
  store.set("quality", qName);
  applyQuality();
});
A.setSound(store.get("sound", true));
const renderSoundBtn = () => {
  $("#btnSound").innerHTML = A.isSound() ? A.ICON_ON : A.ICON_OFF;
};
$("#btnSound").addEventListener("click", () => {
  A.ensureAudio();
  A.setSound(!A.isSound());
  store.set("sound", A.isSound());
  renderSoundBtn();
});
$("#buildTag").textContent = BUILD;

/* ======================= кадр ======================= */
const tmpV = new THREE.Vector3();
function updateWorld(now, dt) {
  const L0 = level;
  if (!L0 || !sim) return;
  const frac = clamp((now - tickAt) / (TICK_MS * 0.6), 0, 1),
    u = ease(frac),
    cam = camera.position;
  // охрана: шаг из прошлой клетки в текущую в начале такта
  const gCatch = sim.caught === "guard" ? G.whoCaught(lv, sim) : -1;
  for (const [gi, o] of L0.guards.entries()) {
    // позиции с учётом тревог по шуму (охранник идёт на звук)
    const c1 = G.guardPos(lv, sim, gi, sim.t);
    // живой режим: охранник уже идёт к клетке следующего такта и приходит туда ровно к нему;
    // пошаговый: догоняет текущую клетку сразу после хода вора
    let ca, cb, k;
    if (blind() || sim.caught || sim.won) {
      ca = G.guardPos(lv, sim, gi, Math.max(0, sim.t - 1));
      cb = c1;
      k = u;
    } else {
      ca = c1;
      cb = G.guardPos(lv, sim, gi, sim.t + 1);
      k = clamp((now - tickAt) / TICK_MS, 0, 1);
    }
    const [x1, z1] = W.cellXZ(lv, c1.i),
      [xa, za] = W.cellXZ(lv, ca.i),
      [xb, zb] = W.cellXZ(lv, cb.i);
    const px = o.group.position.x,
      pz = o.group.position.z;
    // цель сменилась посреди такта (охранник услышал бег) — доводим плавно, без скачка
    const gx = lerp(xa, xb, k),
      gz = lerp(za, zb, k);
    const jump = Math.hypot(gx - px, gz - pz);
    if (jump > 0.35 && jump < 3 && dt > 0)
      o.group.position.lerp(tmpV.set(gx, 0, gz), 1 - Math.exp(-dt * 9));
    else o.group.position.set(gx, 0, gz);
    const speed =
      dt > 0
        ? Math.hypot(o.group.position.x - px, o.group.position.z - pz) / dt
        : 0;
    let wantYaw = W.yawOf(c1.face);
    if (gi === gCatch) {
      wantYaw = Math.atan2(
        -(cam.x - o.group.position.x),
        -(cam.z - o.group.position.z),
      );
      if (o.gm) o.gm.setState("aim");
    } else if (o.gm) o.gm.setState("walk");
    o.yaw = angLerp(o.yaw, wantYaw, 1 - Math.exp(-dt * 7));
    o.group.rotation.y = o.yaw;
    if (o.gm) o.gm.update(dt, gi === gCatch ? 0 : Math.max(speed, 0.6));
    // луч фонаря ровно до конца зоны обзора: в стену не проходит
    const vis = G.ray(lv, c1.i, c1.face, lv.vr || 2),
      endC = vis.length ? vis[vis.length - 1] : c1.i,
      [ex, ez] = W.cellXZ(lv, endC);
    const len = Math.max(
      0.6,
      Math.hypot(ex - x1, ez - z1) +
        (vis.length ? W.sizeOf((endC % lv.W) % 2 ? 1 : 0) / 2 : 0.4),
    );
    o.cone.scale.set(1, 1, len / (((lv.vr || 2) * W.SPAN) / 2 + 0.4));
    const near = o.group.position.distanceTo(tmpV.set(cam.x, 0, cam.z)) < 16;
    o.spot.intensity = near ? 30 : 0;
    o.spot.distance = len + 2;
    // шаги охраны слышны с направлением
    o.walked = (o.walked || 0) + speed * dt;
    if (o.walked > 0.7) {
      o.walked = 0;
      const dx = o.group.position.x - cam.x,
        dz = o.group.position.z - cam.z,
        dist = Math.hypot(dx, dz);
      const rx = Math.cos(runner.yaw) * dx - Math.sin(runner.yaw) * dz; // проекция на правую руку вора
      A.sfxGuardStep(rx / Math.max(1, dist), clamp(1 - dist / 14, 0, 1));
    }
  }
  // лазеры и их красный отсвет; с дела №2 вор видит только огоньки излучателей (лучи — у штурмана на схеме)
  const lit = [],
    ghost = lv.L >= 1 && !(mode === "solo" && !blind()) && !sim.caught;
  for (const o of L0.lasers) {
    const on = G.laserOn(o.laser, sim.t);
    W.setLaser(o, on, now, ghost);
    if (on && !ghost) lit.push(o);
  }
  lit.sort(
    (a, b) => a.world.distanceToSquared(cam) - b.world.distanceToSquared(cam),
  );
  laserPool.forEach((l, i) => {
    const o = lit[i];
    if (o && o.world.distanceTo(cam) < 12) {
      l.position.copy(o.world);
      l.intensity = 2.5;
    } else l.intensity = 0;
  });
  // камеры: огонёк меняется ровно на такте, голова доворачивается сразу после
  for (const o of L0.cams) W.setCamera(o, G.camDir(o.cam, sim.t) >= 0, dt);
  // ближайшие бра дают настоящий свет, остальные только светятся
  const ls = L0.lamps
    .slice()
    .sort((a, b) => a.distanceToSquared(cam) - b.distanceToSquared(cam));
  lampPool.forEach((l, i) => {
    const p = ls[i];
    if (p && i < Q.lamps && p.distanceTo(cam) < 16) {
      l.position.copy(p);
      l.color.set(p.col || 0xffb060);
      l.intensity = p.k || 3.2;
    } else l.intensity = 0;
  });
  W.tickWindows(now / 1000);
  // добыча, дверь, выход
  if (L0.gem) {
    L0.gem.group.visible = !sim.gem;
    L0.gem.gem.rotation.y += dt * 0.8;
  }
  if (L0.safe)
    L0.safe.lamp.material.color.set(
      sim.gem
        ? 0x39d98a
        : cur.safe && cur.safe.lamp === "red"
          ? 0xff3030
          : 0x39d98a,
    );
  if (L0.door) {
    const want = sim.open ? -1.75 : 0;
    L0.doorAng += (want - L0.doorAng) * Math.min(1, dt * 2.5);
    L0.door.hinge.rotation.y = L0.doorAng;
    if (sim.open && !L0.doorFree) {
      L0.doorFree = true;
      const r = cellRect(lv, lv.door);
      W.blockRect(L0.R, r[0], r[1], r[2], r[3], 0);
    }
  }
  // палочку у выхода видно только вплотную, как в 2D
  {
    const ex = lv.E % lv.W,
      ey = (lv.E / lv.W) | 0,
      px = sim.pos % lv.W,
      py = (sim.pos / lv.W) | 0,
      near =
        Math.max(Math.abs(ex - px), Math.abs(ey - py)) <= 1 ||
        role() === "both";
    const o = L0.exit;
    o.glow.material.opacity +=
      ((near ? 0.85 : 0) - o.glow.material.opacity) * Math.min(1, dt * 4);
    o.stick.visible = o.glow.material.opacity > 0.05;
  }
}
let last = performance.now(),
  fpsN = 0,
  fpsT = 0,
  fpsV = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsN++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    fpsV = Math.round(fpsN / fpsT);
    fpsN = 0;
    fpsT = 0;
    $("#fps").textContent =
      `${fpsV} к/с · ${renderer.info.render.calls} вызовов · ${(renderer.info.render.triangles / 1000).toFixed(0)}к треуг.`;
  }
  renderer.info.reset();
  if (cuts.active) {
    cuts.update(dt, canvas.width / Math.max(1, canvas.height));
    renderer.render(cuts.scene, cuts.cam);
    return;
  }
  if (!lv || !sim || !level) {
    renderer.render(scene, camera);
    return;
  }
  tickClock();
  advanceTicks();
  const r = role(),
    canMove = (r === "runner" || r === "both") && playing();
  runner.enabled = canMove;
  runner.closeup = closeup.update(dt, backPose());
  flash.intensity +=
    ((sim && sim.hidden ? 0 : runner.closeup ? 3.5 : FLASH) - flash.intensity) *
    Math.min(1, dt * 6);
  // в укрытии фонарь выключен, зато глаза привыкают к темноте
  hemi.intensity +=
    ((sim && sim.hidden ? 1.6 : 0.35) - hemi.intensity) * Math.min(1, dt * 1.5);
  runner.update(dt, level.R, canMove);
  trackCell();
  updateInteract(canMove);
  $("#lockHint").hidden = !(canMove && !runner.locked && !runner.closeup);
  $("#vanHint").hidden =
    r !== "nav" || !playing() || !!(vanView && vanView.zoomTo);
  if (r === "nav") {
    // штурман в фургоне: особняк не рисуем, только кабину и схему на планшете
    $("#hint").hidden = true;
    renderVan(now, dt);
    return;
  }
  if (vanView) vanView.active = false;
  if (mode === "online" && r === "runner" && now - lastPose > 300) {
    lastPose = now;
    N.send("pose", { yaw: +runner.yaw.toFixed(2) });
  }
  updateWorld(now, dt);
  updateDust(now);
  renderMain();
  if (r === "both") {
    const mc = $("#mini"),
      g = mc.getContext("2d");
    drawPlan(g, mc.width, mc.height, {
      lv,
      sim,
      now,
      showGuards: true,
      showThief: true,
      thief: {
        x: W.planCoord(runner.pos.x),
        y: W.planCoord(runner.pos.z),
        yaw: runner.yaw,
      },
      showStart: true,
      start: curStart().s,
      pingUntil,
    });
  }
}

/* ======================= запуск ======================= */
renderSoundBtn();
renderTrain();
applyQuality();
requestAnimationFrame(frame);
const loadP = [0, 0];
const showLoad = () => {
  $("#loadBar").style.width = Math.round((loadP[0] + loadP[1]) * 50) + "%";
};
const ktx = null; // KTX2 больше не используем: текстуры JPEG и WebP
Promise.all([
  W.loadTheme(
    renderer,
    M,
    (p) => {
      loadP[0] = p;
      showLoad();
    },
    ktx,
  ),
  P.loadProps(
    renderer,
    (p) => {
      loadP[1] = p;
      showLoad();
    },
    ktx,
  ),
  // символы сейфа и цифры рисуются на canvas: шрифты должны быть готовы заранее
  document.fonts.load('56px "Noto Sans"', "ѮѦƛѬ").catch(() => {}),
  GD.loadGuard().catch((e) => console.warn("охранник не загрузился", e)),
  cuts.load().catch((e) => console.warn("сценки не загрузились", e)),
  document.fonts.load('bold 46px "PT Mono"', "0123").catch(() => {}),
])
  .catch((e) => {
    console.error(e);
    toast("Часть графики не загрузилась");
  })
  .finally(() => {
    $("#loading").hidden = true;
    const c0 = N.codeFromHash();
    if (c0) N.joinRoom(c0);
    else openMenu();
  });
// для проверок скриптом (Playwright)
window.__g = {
  get sim() {
    return sim;
  },
  get lv() {
    return lv;
  },
  get level() {
    return level;
  },
  runner,
  renderer,
  scene,
  camera,
  cuts,
  get vanView() {
    return vanView;
  },
  G,
  W,
  startSolo,
  pushEv,
  tryEv,
  get src() {
    return src();
  },
  setQuality: (q) => {
    qName = q;
    applyQuality();
  },
  TICK_MS,
};

/* ======================= крупные планы: дверь, сейф, записка ======================= */
const closeup = new Closeup(camera, canvas);
let codeBuf = "",
  interact = null;
const euler = new THREE.Euler(0, 0, 0, "YXZ");
function backPose() {
  euler.set(runner.pitch, runner.yaw, 0);
  return {
    p: new THREE.Vector3(runner.pos.x, 1.62, runner.pos.z),
    q: new THREE.Quaternion().setFromEuler(euler),
  };
}
// у каждой попытки свои символы сейфа и своя записка
function attemptProps(att) {
  const L0 = level;
  if (!L0) return;
  L0.att = att;
  codeBuf = "";
  noteOpen = false; // новая попытка — записка снова на столе
  if (L0.safe && cur.safe) {
    if (L0.safe.panel) {
      L0.safe.group.remove(L0.safe.panel.group);
    }
    const p = makeSafePanel(cur.safe.shown, cur.safe.maxStrikes);
    p.group.position.copy(L0.safe.padLocal);
    p.group.rotation.y = Math.PI;
    L0.safe.group.add(p.group);
    L0.safe.panel = p;
  }
  if (L0.note && cur.door) {
    if (L0.note.card) L0.note.group.remove(L0.note.card.mesh);
    const d = cur.door,
      lines =
        d.type === "digits"
          ? [
              "Код двери: цифры серийника",
              d.pos.map((k) => "№" + (k + 1)).join(" "),
              "сам номер знает штурман",
            ]
          : ["Записка", "?", ""];
    const n = makeNote(lines);
    n.mesh.rotation.x = -Math.PI / 2;
    n.mesh.rotation.z = 0.25;
    n.mesh.position.y = 0.746;
    L0.note.group.add(n.mesh);
    L0.note.card = n;
  }
  if (L0.door) L0.door.keypad.screen.redraw("");
}
function updateInteract(canMove) {
  interact = null;
  const L0 = level,
    hint = $("#hint");
  if (canMove && !runner.closeup && L0) {
    const cam = camera.position,
      near = (obj, d) => {
        obj.updateMatrixWorld(true);
        return (
          new THREE.Vector3()
            .setFromMatrixPosition(obj.matrixWorld)
            .distanceTo(cam) < d
        );
      };
    if (
      L0.door &&
      !sim.open &&
      sim.pos === L0.door.outCell &&
      near(L0.door.keypad.group, 2.4)
    )
      interact = {
        kind: "door",
        t: L0.door.keypad,
        text: "<b>E</b> — набрать код двери",
      };
    else if (
      L0.safe &&
      !sim.gem &&
      sim.pos === lv.gem &&
      L0.safe.panel &&
      near(L0.safe.panel.group, 2.2)
    )
      interact = {
        kind: "safe",
        t: L0.safe.panel,
        text: "<b>E</b> — открыть сейф",
      };
    else if (
      L0.note &&
      L0.note.card &&
      !sim.noteTaken &&
      sim.pos === lv.note &&
      near(L0.note.card.mesh, 1.9)
    )
      interact = {
        kind: "note",
        t: L0.note.card,
        text: "<b>E</b> — взять записку",
      };
    else {
      const h = L0.hides.find((q) => q.c === sim.pos && near(q.eye, 2.1));
      if (h && !sim.hidden)
        interact = {
          kind: "hide",
          t: { group: h.eye, face: h.n, dist: 0, out: true },
          text: `<b>E</b> — спрятаться ${h.kind === "wardrobe" ? "в шкаф" : "за портьеру"}`,
        };
    }
  }
  // спрятан (в том числе после перезагрузки) — смотрим из укрытия
  const hideNow =
    L0 && sim && sim.hidden && playing() && role() !== "nav"
      ? L0.hides.find((q) => q.c === sim.pos)
      : null;
  if (hideNow && !closeup.active)
    closeup.enter({
      kind: "hide",
      group: hideNow.eye,
      face: hideNow.n,
      dist: 0,
      out: true,
    });
  const pk = $("#peek");
  pk.hidden = !hideNow;
  if (hideNow) pk.className = "peek " + hideNow.kind;
  hint.hidden = !interact;
  if (interact) hint.innerHTML = interact.text;
  if (runner.closeup && closeup.active && !closeup.leaving && !playing())
    closeup.exit();
  updateNoteCard();
  updateInventory();
  // записку вор достаёт сам (клавиша 4), у кодовой панели она сама в руке
  const atPad = closeup.active && closeup.active.kind === "door",
    nb = $("#noteBox"),
    show =
      sim &&
      hasNote() &&
      !sim.open &&
      cur.door &&
      (noteOpen || atPad) &&
      (role() === "runner" || role() === "both");
  nb.hidden = !show;
  if (show) {
    $("#noteA").textContent = "📝 Код двери — цифры серийника под номерами:";
    $("#noteCode").textContent = cur.door.pos
      .map((k) => "№" + (k + 1))
      .join(" ");
    $("#noteB").textContent = "Сам номер знает только штурман";
  }
}
/* ---------- записка: E — наклониться к столу, поднять к глазам, убрать в инвентарь ---------- */
let noteOpen = false,
  noteLift = 0;
const NOTE_Y = 0.746;
// записка в инвентаре: взята и вор уже выпрямился
const hasNote = () =>
  !!(sim && sim.noteTaken) &&
  !(closeup.active && closeup.active.kind === "note");
function updateNoteCard() {
  const c = level && level.note && level.note.card;
  if (!c) return;
  const reading = !!closeup.active && closeup.active.kind === "note";
  // наклонился к столу — записка поднимается к глазам
  noteLift =
    reading && !closeup.leaving && closeup.t >= 1
      ? Math.min(1, noteLift + 1 / 30)
      : reading
        ? noteLift
        : 0;
  c.mesh.position.y = NOTE_Y + 0.12 * ease(noteLift);
  c.mesh.visible = !(sim && sim.noteTaken) || reading;
}
/* ---------- инвентарь вора: фонарик, рация, батарейки, записка ---------- */
let invKey = "";
function updateInventory() {
  const r = role(),
    show = !!sim && (r === "runner" || r === "both") && playing(),
    items = [
      ["1", "🔦", "Фонарик"],
      ["2", "📻", "Рация"],
      ["3", "🔋", "Батарейки ×2"],
    ];
  if (show && hasNote() && !sim.open)
    items.push(["4", "📝", "Записка", noteOpen]);
  const key = show ? JSON.stringify(items) : "";
  if (key === invKey) return;
  invKey = key;
  const box = $("#inv");
  box.hidden = !show;
  box.innerHTML = items
    .map(
      ([k, ic, name, on]) =>
        `<div class="slot${on ? " on" : ""}"><i>${k}</i><span>${ic}</span><small>${name}</small></div>`,
    )
    .join("");
}
function handleCode(rid, val) {
  const s = src();
  if (
    !s ||
    !sim ||
    sim.open ||
    sim.caught ||
    sim.won ||
    !cur.door ||
    val.length !== cur.door.len
  )
    return;
  if (s.log.some((x) => x.slice(1) === rid && (x[0] === "o" || x[0] === "x")))
    return;
  pushEv((val === G.codeFor(s.code, s.lvl, s.att) ? "o" : "x") + rid);
}
const rid5 = () =>
  Math.random()
    .toString(36)
    .slice(2, 7)
    .replace(/[^a-z0-9]/g, "a")
    .padEnd(5, "a");
closeup.onPress = (t, btn) => {
  A.ensureAudio();
  if (t.kind === "door") {
    const kp = level.door.keypad;
    if (btn === "⌫") codeBuf = codeBuf.slice(0, -1);
    else if (codeBuf.length < cur.door.len) codeBuf += btn;
    A.sfxKey();
    kp.screen.redraw(codeBuf.padEnd(cur.door.len, "·"));
    if (codeBuf.length === cur.door.len) {
      const v = codeBuf;
      codeBuf = "";
      setTimeout(() => {
        const was = sim.open;
        handleCode(rid5(), v);
        kp.screen.redraw(
          sim.open ? "ОТКРЫТО" : "ОШИБКА",
          sim.open ? "#39ff88" : "#ff4b4b",
        );
        if (sim.open && !was) setTimeout(() => closeup.exit(), 700);
        else setTimeout(() => kp.screen.redraw(""), 900);
      }, 250);
    }
  } else if (t.kind === "safe") {
    if (!tryEv("k" + btn)) return;
    const p = level.safe.panel;
    p.leds.forEach((l, i) =>
      l.material.color.set(i < sim.strikes ? 0xff2020 : 0x331010),
    );
    if (sim.gem) setTimeout(() => closeup.exit(), 800);
  }
};
addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.code === "KeyE") {
    if (closeup.active && !closeup.leaving) {
      if (closeup.active.kind === "hide") tryEv("u");
      closeup.exit();
      return;
    }
    if (interact && playing()) {
      if (interact.kind === "hide" && !tryEv("h")) return;
      closeup.enter(Object.assign({ kind: interact.kind }, interact.t));
      if (interact.kind === "note") tryEv("n");
      if (interact.kind === "door")
        level.door.keypad.screen.redraw(codeBuf.padEnd(cur.door.len, "·"));
    }
  }
  if (
    (e.code === "Escape" || e.code === "KeyS") &&
    closeup.active &&
    !closeup.leaving
  ) {
    if (closeup.active.kind === "hide") tryEv("u");
    closeup.exit();
  }
  // 4 — достать или убрать записку
  if (e.code === "Digit4" && hasNote() && !sim.open && playing()) {
    noteOpen = !noteOpen;
    if (noteOpen) A.sfxNote();
  }
});

/* ======================= папка штурмана (из 2D) ======================= */
const DOCN = {
  memo: "Памятка",
  guards: "Охрана",
  door: "Дверь",
  safe: "Сейф",
  panel: "Щиток",
};
const DCOL_NAME = (c) => G.DCOL[c][0] + " " + G.DCOL[c][1];
let docTab = "memo",
  lastDocHtml = "",
  docSeen = {};
function docHtml(id, want) {
  const L = lv.L;
  if (id === "memo")
    return `<h3>📋 Памятка штурмана</h3><ul>
    <li>Схема показывает мир <b>на такт вперёд</b>: где охрана будет после следующего шага. Бледный 💂 — где он сейчас. Такт — чуть больше секунды, охрана шагает сама.</li>
    <li>Вор <b>видит</b> охранника, если тот перед ним, но не знает, куда охранник свернёт. ${lv.L >= 1 ? "<b>Лучей лазеров вор не видит</b> — только огоньки на стойках: горит ли луч, знаешь только ты. " : ""}Зону обзора камер он не видит. Говори ему «стой… жди такт… пошёл».</li>${lv.guards.length ? `<li><b style="color:#FFA640">!</b> и оранжевый пунктир — охранник скоро свернёт с маршрута: заглянет в соседнюю комнату или пойдёт на шум. Обычные шаги вора охрана слышит на ${G.HEAR} клетки по проходам, а когда он крадётся (Shift), не слышит. Охранник рядом — скажи «крадись».</li>` : ""}${(lv.hides || []).length ? `<li><b style="color:#AA78FF">Ш</b> — шкаф, <b style="color:#AA78FF">П</b> — портьера: вор прячется клавишей E, пока он там, охрана и камеры его не видят.</li>` : ""}
    <li>Вор ходит свободно и смотрит мышью, поэтому <b>спрашивай, куда он смотрит</b>, и говори «налево/направо» от его лица.</li>
    <li><b style="color:#C4302B">━</b> лазер горит всегда · <b style="color:#B0158C">━</b> мигает через такт (пунктир — будет выключен).</li>
    <li>💂 видит на ${lv.vr} клетки вперёд, 📹 — на ${lv.camr}: камера 2 такта смотрит в комнату, 2 такта отвёрнута. Вор видит, куда она повёрнута и горит ли красный огонёк, но не знает, как далеко она видит.</li>
    ${lv.stains.length ? "<li>☕ Под пятном план не виден — спрашивай вора.</li>" : ""}
    <li>Штрафы таймера: неверный код −10 с, сейф −15 с, щиток −20 с.</li>
    <li>📡 Пеленг — красная кнопка у рации: ${lv.pings ? `показывает вора на 3 секунды (${lv.pings} за попытку)` : "на этом деле его нет"}.</li></ul>`;
  if (id === "guards") {
    if (!lv.hide)
      return `<h3>💂 Охрана</h3><p>Охранники и камеры видны на плане. Охранник видит на <b>${lv.vr}</b> клетки вперёд (туда, куда идёт), камера — на <b>${lv.camr}</b>. Стрелка — куда охранник шагнёт дальше. Охрана шагает сама, раз в такт.</p>`;
    return `<h3>💂 Расписание охраны</h3><p class="warn">Где охрана сейчас, на плане НЕ видно — только маршруты!</p>
      <p>Маршрут — оранжевые точки: кружок с номером — клетка 1, квадратик — последняя. Охранник ходит туда-обратно, по клетке за такт, смотрит туда, куда идёт, и видит на <b>${lv.vr}</b> клетки.</p>
      <table><tr><th>№</th><th>Где будет в следующем такте</th><th>Идёт</th></tr>${lv.guards
        .map((gd, i) => {
          const n = gd.path.length,
            P = 2 * (n - 1),
            x = (sim.t + 1) % P,
            k = x < n ? x : P - x,
            fwd = x < n - 1;
          return `<tr><td>${i + 1}</td><td>клетка <b>${k + 1}</b> из ${n}</td><td>${fwd ? "к ■ концу" : "к кружку " + (i + 1)}</td></tr>`;
        })
        .join("")}</table>
      <p>Таблица, как и план, показывает мир <b>на такт вперёд</b>. Отсчитай клетки по точкам. Вор слышит шаги до 5 клеток и понимает, приближаются ли они, — спрашивай его.</p>`;
  }
  if (id === "door") {
    const d = cur.door,
      st = want.door
        ? `<div class="state">${G.adjCell(lv, sim.pos, lv.door) ? "Вор у двери!" : "Вор прочитал записку."}</div>`
        : "";
    if (d.type === "digits")
      return `<h3>🔒 Дверь: паспорт</h3><p>Серийный номер двери:</p><div class="serialdoc">${d.serial
        .split("")
        .map((x, i) => `<div><b>${x}</b><small>№${i + 1}</small></div>`)
        .join(
          "",
        )}</div><p>На записке 📝 у вора — номера нужных цифр, например «№6 №2 №1». Назови ему цифры <b>в порядке записки</b>, вводит он сам у двери. Ошибка — −10 с.</p>${st}`;
    if (d.type === "colors")
      return `<h3>🔒 Цветной замок</h3><p>На двери горят <b>4 лампы</b> — их видит только вор. На записке 📝 у него нарисована <b>фигура</b>. Для каждой лампы по порядку: строка — цвет лампы, столбец — фигура. В клетке — кнопка, которую жмёт вор.</p>
      <table><tr><th>Лампа</th>${G.SHAPES.map((x) => `<th>${x[0]}<br><small>${x[1]}</small></th>`).join("")}</tr>${[0, 1, 2, 3].map((c) => `<tr><td>${DCOL_NAME(c)}</td>${[0, 1, 2].map((sh) => `<td>${G.DCOL[d.table[sh][c]][0]}</td>`).join("")}</tr>`).join("")}</table><p>Ошибка — −10 с.</p>${st}`;
    return `<h3>🔒 Стрелочный замок</h3><p>Схемы кода. Стрелки — <b>по плану</b>: ↑ — верх плана, → — правая сторона плана.</p>
      <p class="rule"><b>Схема А:</b> <span class="big">${d.schemes[0].map((a) => G.ARW[a]).join(" ")}</span></p><p class="rule"><b>Схема Б:</b> <span class="big">${d.schemes[1].map((a) => G.ARW[a]).join(" ")}</span></p>
      <p>Какая схема — написано на записке 📝 у вора. <span class="warn">У вора кнопки «вперёд / вправо / назад / влево» от его лица!</span> Узнай, куда он смотрит у двери, и переведи. Ошибка — −10 с.</p>${st}`;
  }
  if (id === "safe") {
    const sf = cur.safe;
    return `<h3>🔐 Сейф</h3><p>У вора <b>6 символов</b>, два из них — обманки. Найди столбик, где есть <b>4</b> из них, и скажи порядок <b>сверху вниз</b>${L >= 5 ? ' — <span class="warn">а если у вора лампа КРАСНАЯ, то снизу вверх</span>' : ""}. Кнопки у вора пронумерованы 1–6. Ошибка −15 с, ${sf.maxStrikes} ошибки — тревога.</p>
      <div class="mcols glyph">${sf.cols.map((col, c) => `<div class="mcol"><em>${c + 1}</em>${col.map((g) => `<i>${g}</i>`).join("")}</div>`).join("")}</div>
      ${want.safe ? `<div class="state">Вор у сейфа! Нажато ${sim.sp} из 4, ошибок ${sim.strikes}.</div>` : ""}`;
  }
  if (id === "panel") {
    const pn = cur.panel;
    return `<h3>⚡ Щиток лазерного барьера</h3><p>Номер щитка написан <b>на самом щитке</b> — спроси у вора. Важна его <b>последняя цифра</b>.</p>
      <p>Вор опишет провода <b>сверху вниз</b>. Возьми правила для их количества и иди по пунктам сверху: первый подходящий — ответ. Провода нумеруются сверху: 1, 2, 3…</p>
      ${pn.rounds > 1 ? `<p class="warn">Этот щиток в ${pn.rounds} этапа: после верного провода он исчезает, а оставшиеся провода надо описать заново и снова пройти по правилам — уже для нового количества.</p>` : ""}
      <div class="rule"><b>3 провода</b><ol><li>Если два соседних провода одного цвета — режь третий.</li><li>Иначе, если первый провод синий — режь второй.</li><li>Иначе режь первый.</li></ol></div>
      <div class="rule"><b>4 провода</b><ol><li>Если жёлтых нет — режь последний.</li><li>Иначе, если белый ровно один и последняя цифра номера щитка чётная — режь первый.</li><li>Иначе, если красных больше, чем синих — режь последний красный.</li><li>Иначе режь третий.</li></ol></div>
      <div class="rule"><b>5 проводов</b><ol><li>Если первый и последний провод одного цвета — режь третий.</li><li>Иначе, если чёрных больше одного — режь первый чёрный.</li><li>Иначе, если последняя цифра номера щитка нечётная — режь последний.</li><li>Иначе режь второй.</li></ol></div>
      <div class="rule"><b>6 проводов</b><ol><li>Если белых нет — режь пятый.</li><li>Иначе, если синих ровно два — режь последний синий.</li><li>Иначе, если последняя цифра чётная — режь первый.</li><li>Иначе режь четвёртый.</li></ol></div>
      <p class="warn">Ошибка −20 с. ${pn.maxStrikes === 1 ? "Первая же ошибка" : "Вторая ошибка"} — тревога.</p>${want.panel ? `<div class="state">Вор у щитка!${pn.rounds > 1 ? ` Этап ${(sim.pcut | 0) + 1} из ${pn.rounds}.` : ""}</div>` : ""}`;
  }
  return "";
}
function renderDocs(want) {
  const r = role();
  if (r !== "nav" && r !== "both") return;
  const list = [{ id: "memo", icon: "📋" }];
  if (lv.guards.length || lv.cams.length)
    list.push({ id: "guards", icon: "💂" });
  if (lv.door >= 0) list.push({ id: "door", icon: "🔒" });
  if (lv.safe) list.push({ id: "safe", icon: "🔐" });
  if (lv.gate >= 0) list.push({ id: "panel", icon: "⚡" });
  if (!list.some((x) => x.id === docTab)) docTab = "memo";
  const tabs = list
    .map(
      (x) =>
        `<button data-t="${x.id}" aria-pressed="${x.id === docTab}" class="${want[x.id] && x.id !== docTab ? "alert" : ""}">${x.icon} ${DOCN[x.id]}</button>`,
    )
    .join("");
  if ($("#docTabs").innerHTML !== tabs) $("#docTabs").innerHTML = tabs;
  let html = docHtml(docTab, want);
  const stm = html.match(/<div class="state">[\s\S]*?<\/div>/);
  if (stm) html = html.replace(stm[0], "").replace("</h3>", "</h3>" + stm[0]);
  if (html !== lastDocHtml) {
    lastDocHtml = html;
    $("#docBody").innerHTML = html;
  }
}

/* ======================= онлайн: связка с net.js ======================= */
let thiefYaw = 0,
  lastPose = 0;
function hideOverlays(keepBrief) {
  $("#caught").hidden = true;
  $("#won").hidden = true;
  if (!keepBrief) $("#brief").hidden = true;
}
function resetGame(m) {
  mode = m;
  lv = null;
  sim = null;
  lvKey = "";
  briefedKey = "";
  hideOverlays();
  if (level) {
    scene.remove(level.group);
    disposeGroup(level.group);
    level = null;
  }
}
N.initNet(
  {
    reset: resetGame,
    sync: (full) => sync(full),
    ui: () => {
      if (lv && sim) ui();
    },
    started: (ok) => {
      if (ok) A.sfxPing();
      sync(true);
    },
    hideOverlays,
    handleCode,
    checkPeerBuild: (v) => {
      if (v && v !== BUILD) {
        $("#updateText").textContent =
          "У напарника другая версия игры. Обновите страницу у обоих";
        $("#update").hidden = false;
      }
    },
    pose: (m) => {
      if (typeof m.yaw === "number") thiefYaw = m.yaw;
    },
  },
  BUILD,
  toast,
);
$("#btnUpdate").addEventListener("click", () => location.reload());

/* ======================= фургон штурмана ======================= */
let lastPlan = 0,
  lastClock = "";
function ensureVan() {
  if (van) return;
  van = buildVan(P.radioModel());
  vanView = new VanView(van, canvas);
  vanView.onClick = (k) => {
    A.ensureAudio();
    if (k === "folder") toggleDocs();
    else if (k === "radio") doPing();
  };
  resize();
}
function doPing() {
  if (pingLeft <= 0 || !sim || sim.caught || sim.won) {
    toast(pingLeft <= 0 ? "Пеленг кончился" : "Сейчас нельзя");
    return;
  }
  pingLeft--;
  store.set("ping", { k: pingKey, n: pingLeft });
  pingUntil = performance.now() + 3000;
  A.sfxPingRadar();
  van.pingBtn.position.y -= 0.01;
  setTimeout(() => (van.pingBtn.position.y += 0.01), 150);
}
function toggleDocs(on) {
  const d = $("#docs");
  d.hidden = on == null ? !d.hidden : !on;
  if (!d.hidden) {
    lastDocHtml = "";
    ui();
  }
}
$("#btnDocsClose").addEventListener("click", () => toggleDocs(false));
$("#docTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  docTab = b.dataset.t;
  lastDocHtml = "";
  ui();
});
function renderVan(now, dt) {
  ensureVan();
  vanView.active = $("#brief").hidden && $("#menu").hidden;
  vanView.update(dt, now);
  // схема на планшете: 8 раз в секунду хватает, а видеокарте легче
  if (now - lastPlan > 120) {
    lastPlan = now;
    drawFeeds(van, now);
    const { g, cv, tex } = van.plan;
    const [x, z] = W.cellXZ(lv, sim.pos);
    drawPlan(g, cv.width, cv.height, {
      lv,
      sim,
      now,
      showGuards: true,
      showThief: !!(sim.caught || sim.won),
      thief: { x: W.planCoord(x), y: W.planCoord(z), yaw: thiefYaw },
      showStart: lv.L === 0,
      start: curStart().s,
      pingUntil,
    });
    tex.needsUpdate = true;
    const lbl = van.pingLbl;
    lbl.g.clearRect(0, 0, 128, 48);
    lbl.g.fillStyle = pingLeft > 0 ? "#ffd23f" : "#6b6b6b";
    lbl.g.font = 'bold 30px "PT Mono", monospace';
    lbl.g.textAlign = "center";
    lbl.g.fillText("📡×" + pingLeft, 64, 34);
    lbl.tex.needsUpdate = true;
  }
  const tl = timerLeft(),
    txt =
      tl == null
        ? "--:--"
        : (() => {
            const sec = Math.max(0, Math.ceil(tl / 1000));
            return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
          })();
  if (txt !== lastClock) {
    lastClock = txt;
    const { g, tex } = van.clock;
    g.fillStyle = "#050302";
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = "#ff3b2a";
    g.shadowColor = "#ff3b2a";
    g.shadowBlur = 14;
    g.font = 'bold 64px "PT Mono", monospace';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(txt, 128, 52);
    g.shadowBlur = 0;
    tex.needsUpdate = true;
  }
  renderer.render(van.scene, van.cam);
}
