// Ограбление 3D: запуск, режимы, такты, сборка сцены и цикл кадра.
import * as THREE from "three";
import * as G from "./logic.js";
import * as W from "./world.js";
import { Runner } from "./runner.js";
import * as A from "./audio.js";
import { drawPlan, planRoom } from "./plan.js";
import * as P from "./props.js";
import {
  Closeup,
  makeKeypad,
  makeSafePanel,
  makeNote,
  makeWirePanel,
  makeCctvBox,
  disposePanel,
  glyphSVG,
} from "./closeup.js";
import * as N from "./net.js";
import {
  buildVan,
  VanView,
  drawFeeds,
  drawLaptop,
  streetTexture,
} from "./van.js";
import * as GD from "./guard.js";
import { Cutscenes, fitFov } from "./scenes.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const BUILD = "3d-0.5"; // версия игры: менять при каждой выкладке (и ?v= модулей в index.html)
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
    ao: true, // мягкие тени в углах и под мебелью (GTAO)
    lampShadows: 1, // столько ближайших ламп с тенью (слоты пула постоянные)
    gloss: true, // полированный камень пола блестит сильнее
  },
};
let qName = QUALITY[store.get("quality", "smooth")]
    ? store.get("quality", "smooth")
    : "smooth",
  Q = QUALITY[qName];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020305);
scene.fog = new THREE.Fog(0x020305, 2.5, 13);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 20); // дальше 13 м всё равно туман
scene.add(camera);
// ночь: рассеянный свет еле-еле, остальное — фонарик, луна из окон и редкие бра
const hemi = new THREE.HemisphereLight(0x3c5070, 0x0c0907, 0.35);
scene.add(hemi);
// ИК-подсветка камер наблюдения: горит только пока камера снимает картинку для монитора штурмана
const irLight = new THREE.AmbientLight(0xffffff, 0);
scene.add(irLight);
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
  lampPool = Array.from({ length: Q.lamps }, (_, i) => {
    const l = new THREE.PointLight(0xffb060, 0, 7, 2);
    // «Максимум»: у первых слотов (ближайшие лампы) тень. Тень не включаем и не выключаем на ходу —
    // это пересобрало бы все шейдеры; у погасшего слота просто не обновляем карту
    if (i < (Q.lampShadows || 0)) {
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
      l.shadow.bias = -0.004;
      l.shadow.normalBias = 0.03;
      l.shadow.camera.near = 0.4; // сам светильник (ближе 0,4 м к точке света) тень не бросает
    }
    scene.add(l);
    return l;
  });
  laserPool = Array.from({ length: Q.lasers }, () => {
    const l = new THREE.PointLight(0xff2a1e, 0, 4.5, 2);
    scene.add(l);
    return l;
  });
}

// «Максимум»: кадр рисуется через постобработку — мягкие тени в углах (GTAO) и свечение
let composer = null,
  gtao = null;
function renderMain() {
  if (!Q.bloom) {
    renderer.render(scene, camera);
    return;
  }
  if (!composer) {
    composer = new EffectComposer(renderer);
    // глубина кадра — в текстуру: по ней GTAO считает углы без второго прохода сцены
    for (const rt of [composer.renderTarget1, composer.renderTarget2])
      rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(
      scene,
      camera,
      innerWidth,
      innerHeight,
      { depthTexture: composer.readBuffer.depthTexture },
      // радиус 0,8 м: стык стены с полом и мебель у пола; scale — насколько темнеет угол
      {
        radius: 0.8,
        distanceExponent: 1.5,
        thickness: 2,
        scale: 1.8,
        samples: 12,
      },
    );
    gtao.blendIntensity = 0.9;
    // AO считаем в половину разрешения: его всё равно размывают, а работы вчетверо меньше
    const aoSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => aoSize(Math.ceil(w / 2), Math.ceil(h / 2));
    composer.addPass(gtao);
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
  // RenderPass рисует в readBuffer: глубину берём оттуда (буферы меняются местами)
  // меняем только текстуру глубины: setGBuffer каждый кадр заново искал бы шейдеры (needsUpdate)
  const depth = composer.readBuffer.depthTexture;
  if (gtao.depthTexture !== depth) {
    gtao.depthTexture = depth;
    gtao.gtaoMaterial.uniforms.tDepth.value = depth;
    gtao.pdMaterial.uniforms.tDepth.value = depth;
    gtao.depthRenderMaterial.uniforms.tDepth.value = depth;
  }
  gtao.enabled = !!Q.ao;
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
  fitMini();
}
// холст мини-карты — по размеру блока (у скрытого блока размера нет)
function fitMini() {
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
  if (level) glossFloor();
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
// блок карты показывают позже (тренировка, обучение) — тогда и подгоняем холст, иначе он 300×150 и сплюснут
new ResizeObserver(fitMini).observe($("#mini"));

/* ======================= уровень в 3D ======================= */
const M = W.makeMaterials(null);
let level = null;
let van = null,
  vanView = null; // фургон штурмана создаётся при первой роли штурмана
const runner = new Runner(camera, canvas);

/* ======================= сценки: приезд и уход ======================= */
const cuts = new Cutscenes($("#fade")),
  arrivedKey = new Set();
cuts.renderer = renderer; // улице нужен для бликов неба на стёклах
addEventListener("keydown", (e) => {
  if (cuts.active && ["Space", "Escape", "Enter"].includes(e.code)) {
    e.preventDefault();
    e.stopImmediatePropagation(); // пробел не должен уйти в игру («ждать» во «вслепую»)
    cuts.skip();
  }
});
canvas.addEventListener("pointerdown", () => cuts.skip());

// громкие шаги — обычная ходьба, тихие — когда крадётся (Shift)
runner.onStep = (loud) => {
  if (!runner.closeup) A.sfxRunStep(loud);
};
runner.onStop = () => {
  if (!runner.closeup) A.sfxRunStop();
};
runner.onBump = () => A.sfxBump();

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isLight) o.dispose(); // фонарь охранника: освободить карту тени
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

// «Максимум»: полированный камень пола (мрамор, терраццо) глаже — резче блики ламп и фонаря.
// Шероховатость — просто число в шейдере, пересборки нет
function glossFloor() {
  const x = (W.LOOKS[cuts.lot && cuts.lot.id] || W.LOOKS.mansion).floor[3];
  if (!x || x.rough == null || x.rough > 0.3) return; // паркет, ковролин — как были
  M.floor.roughness = Q.gloss ? x.rough * 0.55 : x.rough;
}
// за окном фургона — здание дела
function vanStreet(theme) {
  if (!van) return;
  van.lot = theme;
  van.streetMat.map = streetTexture(theme);
  van.streetMat.needsUpdate = true;
}
function buildLevel(lv) {
  if (level) {
    scene.remove(level.group);
    disposeGroup(level.group);
  }
  const R = W.makeRaster(lv),
    group = new THREE.Group();
  // здание: свои текстуры, окна, бра, люстры и ориентиры (особняк, музей, банк, офис, ювелирка)
  const theme = G.themeOf(lv.name).id,
    look = W.LOOKS[theme];
  W.applyLook(M, theme);
  A.setFloor(look.step);
  cuts.lot = { id: theme, name: lv.name }; // сценки и фото брифинга — у этого здания
  glossFloor();
  vanStreet(theme);
  const shell = W.buildShell(lv, R, M);
  group.add(shell.group);
  // всё неподвижное собираем в decor и потом склеиваем по материалам
  const decor = new THREE.Group(),
    lamps = [],
    flames = [];
  const spots = W.landmarkSpots(lv),
    clocks = spots
      .filter((s) => s.li === 5)
      .map((s) => new THREE.Vector3(s.x, 1.2, s.z)); // напольные часы тикают
  for (const s of spots) {
    const o = P.buildLandmark(s.li, M, theme) || W.placeholderLandmark(s.li);
    o.position.set(s.x, 0, s.z);
    o.rotation.y = s.yaw;
    decor.add(o);
    o.updateMatrixWorld(true);
    blockWallSpot(R, s, o.userData.width || 0.9, o.userData.depth || 0.45);
    if (o.userData.light) {
      const p = o.localToWorld(o.userData.light.clone());
      if (o.userData.lightCol) {
        p.col = o.userData.lightCol;
        p.k = o.userData.lightK;
      }
      lamps.push(p);
      if (o.userData.flame) flames.push(o.userData.flame);
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
    const o = P.hideModel(
        h.kind,
        theme,
        theme === "mansion" ? null : look.velvet,
      ),
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
  // щиток лазерного барьера (с дела №9): на свободной стене своей комнаты, иначе сбоку на любой глухой
  let panelSpot = null;
  if (lv.panel >= 0) {
    const f = pick(lv.panel);
    if (f) {
      used.add(f);
      panelSpot = { x: f.x, z: f.z, yaw: f.yaw, wallDir: f.d };
    } else {
      const d = [0, 1, 2, 3].find((k) => !lv.g[G.stepT(lv, lv.panel, k)]),
        [dx, dz] = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ][d],
        [cx, cz] = W.cellXZ(lv, lv.panel);
      // сбоку от середины стены: там бывает ориентир
      panelSpot = {
        x: cx + (dx * W.ROOM) / 2 - dz * 1.15,
        z: cz + (dz * W.ROOM) / 2 + dx * 1.15,
        yaw: W.yawOf(d),
        wallDir: d,
      };
    }
    blockWallSpot(R, panelSpot, 0.5, 0.2);
  }
  // щиток видеонаблюдения (с дела №11): тоже на свободной стене своей комнаты
  let cctvSpot = null;
  if (lv.cctv >= 0) {
    const f = pick(lv.cctv);
    if (f) {
      used.add(f);
      cctvSpot = { x: f.x, z: f.z, yaw: f.yaw, wallDir: f.d };
    } else {
      const d = [0, 1, 2, 3].find((k) => !lv.g[G.stepT(lv, lv.cctv, k)]),
        [dx, dz] = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ][d],
        [cx, cz] = W.cellXZ(lv, lv.cctv);
      cctvSpot = {
        x: cx + (dx * W.ROOM) / 2 + dz * 1.15,
        z: cz + (dz * W.ROOM) / 2 - dx * 1.15,
        yaw: W.yawOf(d),
        wallDir: d,
      };
    }
    blockWallSpot(R, cctvSpot, 0.45, 0.2);
  }
  const decoys = walls
    .filter((f) => ![lv.E, lv.S, lv.gem, lv.panel, lv.cctv].includes(f.room))
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
    // у небоскрёба стекло во всю наружную стену почти везде
    if (f.outer && f.r < (look.win === "glass" ? 0.92 : 0.7)) {
      const w = W.buildWindow(f.x, f.z, f.yaw, M, f.r, look.win);
      decor.add(w);
      w.updateMatrixWorld(true);
      const p = w.localToWorld(w.userData.light.clone());
      p.col = w.userData.lightCol;
      p.k = w.userData.lightK;
      lamps.push(p);
      continue;
    }
    if (!sconceRooms.has(f.room) && f.r < (look.sconceP || 0.22)) {
      sconceRooms.add(f.room);
      const sc = W.buildSconce(look.sconce);
      sc.group.position.set(f.x, 0, f.z);
      sc.group.rotation.y = f.yaw;
      decor.add(sc.group);
      sc.group.updateMatrixWorld(true);
      const p = sc.group.localToWorld(sc.light.clone());
      p.col = sc.col;
      p.k = sc.k;
      lamps.push(p);
    }
  }
  // люстры: тёмные, без света — силуэт под потолком
  for (let y = 1; y < lv.H; y += 2)
    for (let x = 1; x < lv.W; x += 2) {
      if (look.ceilPanels) {
        // офис: потолочные светильники-панели (ночью выключены), в каждой комнате
        decor.add(W.buildCeilPanels(W.cOf(x), W.cOf(y)));
        continue;
      }
      if ((x * 7 + y * 13) % 5 > 1) continue; // люстра не в каждой комнате
      if (theme === "museum") {
        // музей: вместо люстры — стеклянный фонарь в потолке и лунный свет до пола
        const sk = W.buildSkylight(W.cOf(x), W.cOf(y), M);
        decor.add(sk.group);
        const p = sk.light.clone();
        p.col = 0x8fb0e8;
        p.k = 1.6;
        lamps.push(p);
        continue;
      }
      const c = P.chandelier(theme);
      if (!c) break;
      c.position.set(W.cOf(x), W.CEIL - c.userData.size.y, W.cOf(y));
      c.rotation.y = (((x * 7 + y * 3) % 4) * Math.PI) / 2;
      decor.add(c);
    }
  // створки в проёмах (кроме двери хранилища и проёма с барьером).
  // У комнаты с запиской — арки: столик в центре, а распахнутые створки с ним вместе перегораживали проход
  const noLeaves = new Set([lv.door, lv.gate]);
  if (lv.note >= 0)
    for (let k = 0; k < 4; k++) noLeaves.add(G.stepT(lv, lv.note, k));
  const rd = W.buildRoomDoors(lv, shell.doorways, noLeaves, M);
  decor.add(rd.group);
  for (const b of rd.blocks) W.blockRect(R, b[0], b[1], b[2], b[3]);
  group.add(P.bakeStatic(decor, W.SPAN * 3)); // куски 3×3 комнаты
  const lasers = lv.lasers.map((l) => {
    const o = W.buildLaser(lv, l);
    group.add(o.group);
    return o;
  });
  // лазерный барьер (с дела №9): горит, пока на щитке не перерезан провод
  const gate = lv.gate >= 0 ? W.buildGate(lv) : null;
  if (gate) group.add(gate.group);
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
    door.pad.clear(); // кодовую панель ставит attemptProps: у каждой попытки свои лампы
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
    theme,
    // модели или текстуры здания ещё грузились — когда догрузятся, уровень соберётся заново
    partial: !W.lookReady(theme) || !P.themePropsReady(theme),
    lasers,
    guards,
    cams,
    gate,
    panel: panelSpot ? { spot: panelSpot, box: null } : null, // box — щиток попытки
    cctv: cctvSpot ? { spot: cctvSpot, box: null } : null, // щиток видеонаблюдения, box — свой у каждой попытки
    safe,
    gem,
    door,
    note,
    exit,
    lamps,
    flames,
    hides,
    clocks,
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
  cur = { safe: null, door: null, panel: null, cctv: null };
let lastCaughtKey = "",
  lastWonKey = "",
  playedKey = "", // попытка, которую на этой странице видели до победы
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
  if (mode === "solo")
    return solo && solo.blind
      ? "runner"
      : solo && solo.tut === "nav"
        ? "nav"
        : "both";
  if (mode !== "online" || !N.net.room) return "nav";
  const s = N.mySeat();
  return s < 0 ? "nav" : s === N.thiefSeat(N.net.room) ? "runner" : "nav";
}
function amWriter() {
  if (mode === "solo") return true;
  const r = N.net.room;
  return !!r && N.started(r) && N.mySeat() === N.thiefSeat(r);
}
function saveSrc() {
  if (mode === "solo" && solo && solo.tut) return; // обучение не сохраняем
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
    ensureTheme(G.themeOf(lv.name).id);
    buildLevel(lv);
  }
  cur = {
    safe: lv.safe ? G.safeFor(s.code, s.lvl, s.att) : null,
    door: lv.door >= 0 ? G.doorFor(s.code, s.lvl, s.att) : null,
    panel: lv.gate >= 0 ? G.panelFor(s.code, s.lvl, s.att) : null,
    cctv: lv.cctv >= 0 ? G.cctvFor(s.code, s.lvl, s.att) : null,
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
  showPanel();
  showCctv();
  ui();
  if (again && $("#brief").hidden && $("#menu").hidden) arrive();
}
function placeRunner() {
  let [x, z] = W.cellXZ(lv, sim.pos);
  // центр клетки занят (столик с запиской) — ближайшая свободная точка той же клетки
  if (level && !runner.free(level.R, x, z)) {
    const [x0, z0, x1, z1] = cellRect(lv, sim.pos);
    let best = null;
    for (let d = 0.15; d < 2.6 && !best; d += 0.15)
      for (let a = 0; a < 16 && !best; a++) {
        const px = x + d * Math.cos((a * Math.PI) / 8),
          pz = z + d * Math.sin((a * Math.PI) / 8);
        if (
          px > x0 &&
          px < x1 &&
          pz > z0 &&
          pz < z1 &&
          runner.free(level.R, px, pz)
        )
          best = [px, pz];
      }
    if (best) [x, z] = best;
  }
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
  if (pauseAt) return false; // на паузе ничего не происходит
  const t = G.cloneSim(sim);
  if (!G.applyEv(lv, t, e, cur)) return false;
  pushEv(e);
  return true;
}
function evFx(e, was) {
  // штурман слышит шаги вора через рацию: громкий шаг (охрана слышит) — громче
  if (role() === "nav" && "mrM".includes(e[0])) A.sfxNavStep(e[0] === "r");
  if (e[0] === "o") {
    A.sfxDoorOpen();
    toast("🔓 Дверь открыта!");
    return;
  }
  if (e[0] === "x") {
    A.sfxDenied();
    toast("✖ Неверный код! −10 секунд");
    return;
  }
  if (e[0] === "k") {
    if (sim.caught) return alarm();
    if (sim.strikes > was.strikes) {
      A.sfxDenied();
      toast(
        `✖ Не тот символ! −15 с. Ошибок: ${sim.strikes} из ${cur.safe.maxStrikes}`,
      );
    } else if (sim.gem) {
      A.sfxSafeOpen();
      toast("🔓 Сейф открыт! Добыча у вора. Теперь к выходу");
    } else A.sfxSafeClick();
    return;
  }
  if (e[0] === "c") {
    // провод перерезан в любом случае: щелчок кусачек, потом ответ щитка
    A.sfxSnip();
    if (sim.caught) return alarm();
    const pn = cur.panel;
    if (sim.pstrikes > was.pstrikes) {
      A.sfxDenied(0.15);
      toast(
        `✖ Не тот провод! −20 с. Ошибок: ${sim.pstrikes} из ${pn.maxStrikes}`,
      );
    } else if (sim.gateOff) {
      A.sfxBreaker();
      toast("⚡ Барьер выключен! Путь к хранилищу свободен");
    } else {
      A.sfxRelay();
      toast(
        `✂ Верно! Этап ${sim.pcut + 1} из ${pn.rounds}: опиши оставшиеся провода заново`,
      );
    }
    return;
  }
  if (e === "j") {
    A.sfxPlug();
    lapSt.buf = "";
    // в тренировке фургона нет: правила (папка) и окно-ноутбук открываются сами
    if (role() === "both") {
      docTab = "cctv";
      lastDocHtml = "";
      toggleDocs(true);
      $("#lapUI").hidden = false;
    }
    toast(
      role() === "nav"
        ? "🔌 Вор подключился к щитку видеонаблюдения! Ноутбук — клавиша 3: набери пароль"
        : "🔌 Шнур в щитке. Прочитай штурману наклейку: модель и серийный номер",
    );
    return;
  }
  if (e === "v") {
    if (role() === "runner") A.sfxRelay();
    else {
      A.sfxAccess();
      lapMsg("", "");
    }
    if (role() === "both") setTimeout(() => ($("#lapUI").hidden = true), 2200);
    toast(
      role() === "nav"
        ? "📹 Доступ получен: камеры выключены, на мониторах — видео из здания"
        : role() === "both"
          ? "📹 Доступ получен: камеры выключены!"
          : "📹 Штурман взломал систему: камеры выключены!",
    );
    return;
  }
  if (e === "y") {
    lapMsg("НЕВЕРНЫЙ ПАРОЛЬ", "#ff6a5a", 3500);
    if (sim.caught) return alarm();
    A.sfxDenied();
    toast("✖ Неверный пароль! −15 с. Ещё одна ошибка — тревога");
    return;
  }
  if (sim.caught && !was.caught) return alarm();
  if ((sim.heard || 0) > (was.heard || 0)) {
    if (role() === "nav") A.sfxRadio();
    else {
      let best = null;
      lv.guards.forEach((_, k) => {
        const [gx, gz] = W.cellXZ(lv, G.guardPos(lv, sim, k, sim.t).i),
          e = ear(gx, gz, 18);
        if (!best || e[1] > best[1]) best = [...e, wallBetween(gx, gz)];
      });
      if (best)
        A.sfxGuardSay("guard_who", best[0], Math.max(0.3, best[1]), best[2]);
    }
    toast(
      role() === "nav"
        ? "💂 Охрана услышала шаги вора и идёт на шум!"
        : "💂 Тебя услышали! Охранник идёт на шум — уходи или прячься. Рядом с охраной крадись: Shift",
    );
  }
  if (sim.hidden !== was.hidden && role() !== "nav" && level) {
    const h = level.hides.find((q) => q.c === sim.pos);
    if (h) A.sfxHide(h.kind, !sim.hidden);
  }
  if (sim.hidden && !was.hidden && role() !== "nav")
    toast("Ты спрятался: охрана тебя не видит. E — выйти");
  if (sim.gem && !was.gem) {
    A.sfxGem();
    toast("💎 Добыча у вора! Теперь к выходу");
  }
  if (sim.noteTaken && !was.noteTaken) {
    A.sfxNote(0.3); // после наклона к столу
    if (role() !== "nav")
      toast("📝 Записка у тебя. Достать — клавиша 4, прочитай её штурману");
  }
  if (sim.won && !was.won) A.sfxExitDoor(); // вор выскользнул в служебную дверь
}
function alarm() {
  A.sfxAlarm(sim.caught);
  // поймал охранник — кричит «Стоять! Руки вверх!» со своей стороны; штурман слышит через рацию вора
  if (sim.caught === "guard") {
    const k = G.whoCaught(lv, sim);
    if (role() === "nav") A.sfxGuardSay("guard_stop", 0, 0.5);
    else if (k >= 0) {
      const [gx, gz] = W.cellXZ(lv, G.guardPos(lv, sim, k, sim.t).i),
        [pan, v] = ear(gx, gz, 18);
      A.sfxGuardSay("guard_stop", pan, Math.max(0.6, v), wallBetween(gx, gz));
    }
  }
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
  if (!amWriter() || blind() || !live() || !s.t0 || window.__freeze) return;
  const tk = Math.floor((Date.now() - s.t0) / TICK_MS);
  if (tk > sim.t) pushEv("T" + tk.toString(36));
}
// вор отстал от часов больше чем на 3 такта, а паузы у него не было (вышел из комнаты и вернулся, вкладка упала —
// у штурмана тем временем пауза «не на связи»; или кадр завис на секунды): это время не считаем, как паузу, —
// иначе охрана разом прыгнет на десятки тактов, а таймер уйдёт. Свёрнутая вкладка сюда не доходит: это обычная
// пауза (visibilitychange, myPz 4). Новое начало попытки штурман получит с ближайшим событием T
function catchUp() {
  const s = src();
  if (!amWriter() || blind() || !live() || !s.t0 || window.__freeze) return;
  const lag = Math.floor((Date.now() - s.t0) / TICK_MS) - sim.t;
  if (lag > 3) {
    s.t0 += (lag - 1) * TICK_MS;
    saveSrc();
  }
}
function trackCell() {
  if (!amWriter() || !live()) return;
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
    ? (sim.strikes * 15 +
        sim.wrong * 10 +
        (sim.pstrikes || 0) * 20 +
        (sim.hstrikes || 0) * 15) *
        1000
    : 0;
}
// t0 ставит вор по своим часам, а часы у двоих могут расходиться на секунды:
// штурман добавляет разницу (вор минус я, из его ping). Только для показа времени
const clockSkew = () =>
  mode === "online" && !amWriter() ? N.net.skew || 0 : 0;
function timerLeft() {
  const s = src();
  if (!s || !lv || !lv.limit) return null;
  if (!s.t0) return limitMs();
  // на паузе время стоит: считаем от начала попытки, каким оно было в начале паузы
  const used =
    (pauseAt && pauseT0 ? pauseAt - pauseT0 : (menuAt || Date.now()) - s.t0) +
    clockSkew();
  return limitMs() - used - penaltyMs();
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
    A.sfxTick();
  }
  if (
    st &&
    tl <= 0 &&
    amWriter() &&
    !sim.caught &&
    !sim.won &&
    $("#menu").hidden &&
    !pauseAt
  )
    pushEv("z");
}

/* ======================= пауза ======================= */
// В тренировке пауза — это меню (menuAt). Вдвоём игра стоит у обоих, пока кто-то из двоих в меню
// или пропала связь (своя или напарника). Потом отсчёт 3-2-1, и начало попытки сдвигается на длину паузы.
// Вор после паузы шлёт напарнику своё новое начало (сообщение pz, потом — с каждым событием)
let pauseAt = 0, // Date.now() начала паузы; 0 — игра идёт
  pausePerf = 0,
  pauseT0 = 0, // начало попытки, каким оно было в начале паузы
  resumeAt = 0, // performance.now() конца отсчёта
  pauseLast = 0, // время прошлого кадра
  peerPz = 0, // напарник не готов: 1 — в меню, 2 — читает брифинг, 3 — смотрит сценку
  sentPz = 0,
  pauseHtml = "";
const PAUSE_COUNT = 3000;
// закрыли или перезагрузили страницу посреди попытки онлайн — запомнить когда: это тоже пауза
let pauseSaved = store.get("pz", null);
store.set("pz", null);
addEventListener("pagehide", () => {
  const r = N.net.room;
  if (mode === "online" && r && r.t0 && sim && !sim.caught && !sim.won)
    store.set("pz", {
      code: r.code,
      lvl: r.lvl,
      att: r.att,
      at: pauseAt || Date.now(),
    });
});
// вор свернул вкладку или окно: кадров до возвращения не будет, такты стоят — сразу пауза у обоих
// (у себя время стоит с этой минуты, напарнику — pz 4). Вернулся — обычный отсчёт 3-2-1
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "online" && amWriter())
    updatePause(performance.now());
});
// я не готов играть (как peerPz): после переподключения брифинг и сценка тоже ставят паузу напарнику;
// 4 — вор свернул вкладку
function myPz() {
  if (mode !== "online" || !inGame() || !sim || sim.caught || sim.won) return 0;
  if (document.hidden && amWriter()) return 4;
  return !$("#menu").hidden ? 1 : !$("#brief").hidden ? 2 : cuts.active ? 3 : 0;
}
// можно двигаться и что-то делать: игра идёт и не на паузе
const live = () => playing() && !pauseAt;
// почему пауза: link — моя связь, peer — напарник пропал, me — я в меню (вор — или свернул вкладку), menu — напарник в меню;
// "" — играем, null — пауза тут ни при чём (не онлайн, брифинг, сценка, конец попытки)
function pauseWhy() {
  const r = N.net.room;
  if (
    mode !== "online" ||
    !r ||
    !N.started(r) ||
    !sim ||
    sim.caught ||
    sim.won ||
    cuts.active
  )
    return null;
  // брифинг посреди попытки (после перезагрузки) — тоже пауза, а в начале дела время ещё не идёт
  if (!$("#brief").hidden) return r.t0 ? "me" : null;
  const pid = r.seats[1 - Math.max(0, N.mySeat())];
  if (N.net.status !== "ok") return "link";
  if (!pid || !N.net.online.has(pid)) return "peer";
  if (!$("#menu").hidden || (document.hidden && amWriter())) return "me";
  return peerPz ? "menu" : "";
}
// щелчок рации, когда связь (своя или напарника) пропала и вернулась. Пока ни разу не играли вдвоём на связи
// (первое подключение, перезагрузка) — молча; связь мигает — звук не чаще раза в 1,5 с
let linkUp = null, // null — ещё не играли на связи (сброс в resetGame), true — на связи, false — нет
  linkSfxAt = -1e9;
function linkSfx(why, now) {
  if (why == null) return; // не онлайн, сценка, конец попытки — пауза ни при чём
  const up = why !== "link" && why !== "peer";
  if (linkUp == null) {
    if (why === "") linkUp = true;
    return;
  }
  if (up === linkUp || now - linkSfxAt < 1500) return;
  linkUp = up;
  linkSfxAt = now;
  if (up) A.sfxLinkBack();
  else A.sfxLinkLost();
}
// раз в кадр: full — пауза, count — отсчёт перед продолжением, "" — играем
function updatePause(now) {
  // страницу перезагрузили посреди попытки: пауза идёт с момента, когда её закрыли
  const r = N.net.room,
    sv = pauseSaved;
  if (
    sv &&
    r &&
    sv.code === r.code &&
    sv.lvl === r.lvl &&
    sv.att === r.att &&
    r.t0 &&
    !pauseAt &&
    pauseWhy()
  ) {
    pauseAt = Math.min(pauseSaved.at, Date.now());
    pausePerf = now;
    pauseT0 = r.t0;
    pauseSaved = null;
  }
  const mine = myPz();
  if (mine !== sentPz) {
    sentPz = mine;
    N.send("pz", { on: mine });
  }
  const why = pauseWhy();
  linkSfx(why, now);
  // кадр завис (строится фургон, сборка шейдеров) — отсчёт ждёт, чтобы его было видно
  if (resumeAt && now - pauseLast > 300) resumeAt += now - pauseLast;
  pauseLast = now;
  if (why == null) pauseAt = resumeAt = 0;
  else if (why) {
    if (!pauseAt) {
      pauseAt = Date.now();
      pausePerf = now;
      pauseT0 = src().t0 || 0;
    }
    resumeAt = 0;
  } else if (pauseAt && !resumeAt) resumeAt = now + PAUSE_COUNT;
  else if (pauseAt && now >= resumeAt) {
    const s = src();
    // время стояло: начало попытки — позже на длину паузы (если вор уже прислал своё — оно и есть)
    if (s.t0 && s.t0 === pauseT0) {
      s.t0 += Date.now() - pauseAt;
      saveSrc();
    }
    // шаг охраны продолжается с того же места
    tickAt = tickAt < pausePerf ? tickAt + (now - pausePerf) : now;
    pauseAt = resumeAt = 0;
    if (amWriter() && s.t0)
      N.send("pz", { on: 0, t0: s.t0, lvl: s.lvl, att: s.att });
  }
  renderPause(why, now);
  return why ? "full" : pauseAt ? "count" : "";
}
function renderPause(why, now) {
  let h = "";
  if (pauseAt && why !== "me") {
    const nm = esc(partnerName());
    if (!why)
      h = `<b class="pz-n">${Math.max(1, Math.ceil((resumeAt - now) / 1000))}</b><small>продолжаем</small>`;
    else {
      const [t, p] =
        why === "link"
          ? [
              "Нет связи",
              "Переподключаюсь… Время стоит, пока связь не вернётся.",
            ]
          : why === "peer"
            ? [
                `${nm} не на связи`,
                "Время стоит, охрана замерла. Продолжим сами, как только связь вернётся.",
              ]
            : [
                `${nm} ${["", "в меню", "читает брифинг", "смотрит заставку", "свернул игру"][peerPz] || "в меню"}`,
                "Пауза у обоих: время стоит, охрана замерла. Продолжим, когда напарник вернётся в игру.",
              ];
      h = `<div class="folder pz-card"><div class="stamp">ПАУЗА</div><b>${t}</b><p>${p}</p><small>Esc — меню</small></div>`;
    }
  }
  if (h === pauseHtml) return;
  pauseHtml = h;
  const el = $("#pause");
  el.hidden = !h;
  el.classList.toggle("count", !why);
  el.innerHTML = h;
}

/* ======================= обучение ======================= */
// Отдельный режим (кнопки в меню): дело №1 по одному коду, за вора и за штурмана. Перед игрой вдвоём
// предлагаем пройти оба («Я уже умею» — пропустить). За вора — как тренировка (схема в углу);
// за штурмана — вор-бот: пишет по рации, что видит, штурман кликает по схеме, где он и куда идти.
// Подсказки — карточка слева вверху. Шаг сменяется, когда сделано нужное (done), или через max секунд;
// меньше min секунд шаг не висит; без done — просто min секунд или «Дальше».
const TUT_CODE = "TUTR"; // на этом коде у стартовой комнаты есть ориентир (скрипка), лазеры по пути
const tutKind = () => (mode === "solo" && solo && solo.tut) || "";
const TUT = {
  runner: [
    {
      t: "Осмотрись мышью и пройди пару шагов: <b>W A S D</b>.",
      done: (c) => c.moved > 3,
    },
    {
      t: "Справа вверху — <b>схема</b>. В игре вдвоём она только у штурмана, и вора на ней нет: ты рассказываешь, что видишь (картины, статуи, часы), а он ищет это на схеме и ведёт голосом.",
      min: 12,
    },
    {
      t: "<b>Shift</b> — красться: медленно, зато тихо. Охрана слышит обычные шаги и идёт на шум — рядом с ней только крадись.",
      done: (c) => c.sneak > 1.2,
      max: 16,
    },
    {
      t: "<b>E</b> — взять, взломать, спрятаться: записка, кодовая панель, сейф, шкаф. Подойдёшь — появится подсказка. <b>Esc</b> — меню и пауза.",
      min: 10,
    },
    {
      t: "Найди <b>💎</b> (на схеме она видна). Зайдёшь в её комнату — заберёшь.",
      done: () => sim.gem,
    },
    {
      t: "💎 у тебя! Уходи через <b>служебную дверь с зелёной палочкой</b> (на схеме — 🚪). Таких дверей несколько, выход — одна.",
      done: () => sim.won,
      exit: 1,
    },
  ],
  nav: [
    {
      t: "Ты штурман, сидишь в фургоне. Кликни по <b>планшету</b> (или клавиша <b>1</b>, колесо мыши) — схема крупно.",
      done: () => !!(vanView && vanView.zoomTo),
    },
    {
      t: "Это особняк сверху: комнаты, двери, <b>💎</b> и выход <b>🚪</b>. Красные линии — <b>лазеры</b>. <b>Вора на схеме нет</b>: он только рассказывает по рации, что видит.",
      min: 10,
    },
    {
      t: "Вор описал, что видит (ниже). Найди на схеме эти значки и <b>кликни по комнате</b>, где он стоит.",
      done: () => bot.found,
      say: 1,
    },
    {
      t: "Верно! Теперь веди: <b>кликни по соседней комнате</b> — вор пойдёт туда. Ходить можно только через двери.",
      done: () => bot.moves >= 2,
      say: 1,
    },
    {
      t: "Потерял вора? Красная кнопка у рации — <b>пеленг</b>: на 3 секунды покажет его на схеме. Отъедь от планшета (колесо назад) и нажми её.",
      done: () => pingLeft < lv.pings,
      max: 30,
      say: 1,
    },
    {
      t: "Веди вора к <b>💎</b>. Через красные линии нельзя: вор заденет лазер, и сработает тревога. В игре вдвоём ты не кликаешь, а говоришь: «прямо, в дверь направо».",
      done: () => sim.gem,
      say: 1,
    },
    {
      t: "💎 у вора! Теперь веди к выходу <b>🚪</b>.",
      done: () => sim.won,
      exit: 1,
      say: 1,
    },
  ],
};
// разовая подсказка, когда вор впервые подошёл к лазеру
const TUT_LASER =
  "Красный луч — <b>лазер</b>. Заденешь — тревога. Со второго дела луча не видно, только огонёк на стойке: горит он или нет, знает штурман.";
let tutDone = store.get("tut", {}),
  tutS = null, // { k, i — шаг, at — когда показан, moved — метров, sneak — секунд крадучись, laser — до какого времени подсказка про лазер, att }
  tutHtml = "",
  tutPending = null, // что сделать после обучения: создать комнату или войти в неё
  tutRoom = ""; // позвали по ссылке: код комнаты (пока ждёт обучение, своя комната и другой код скрыты)
function tutFinish(k) {
  tutDone[k] = 1;
  store.set("tut", tutDone);
  renderTutRow();
}
function startTutorial(kind) {
  if (N.net.on) N.leaveRoom();
  mode = "solo";
  solo = { code: TUT_CODE, lvl: 0, att: 0, best: 0, log: [], t0: 0, tut: kind };
  lv = null;
  lvKey = "";
  briefedKey = "";
  tutS = null;
  Object.assign(bot, { q: [], found: false, moves: 0, say: "" });
  // дело то же самое (код, №1, попытка 0): забыть прошлый проход — победу, тревогу, сценку, пеленги
  lastWonKey = lastCaughtKey = pingKey = "";
  arrivedKey.delete(TUT_CODE + "|0|0");
  store.set("ping", null);
  $("#caught").hidden = true;
  $("#won").hidden = true;
  $("#menu").hidden = true;
  sync(true);
}
// перед игрой вдвоём — обучение за обе роли (или «Я уже умею»)
function tutGate(act, room) {
  if (tutDone.runner && tutDone.nav) return act();
  tutPending = act;
  tutRoom = room || "";
  openMenu();
  showTab("play");
  renderTutRow(true);
}
function renderTutRow(gate) {
  const row = $("#tutRow");
  if (gate != null) row.classList.toggle("gate", gate);
  $("#btnTutRunner").classList.toggle("done", !!tutDone.runner);
  $("#btnTutNav").classList.toggle("done", !!tutDone.nav);
  const inv = row.classList.contains("gate") && tutRoom;
  $("#tutNote").textContent = inv
    ? `Тебя позвали в комнату ${tutRoom}. Сначала пройди обучение за обе роли (по паре минут на каждую) или нажми «Я уже умею» — и сразу в комнату.`
    : row.classList.contains("gate")
      ? "Перед игрой вдвоём пройди обучение за обе роли: по паре минут на каждую."
      : tutDone.runner && tutDone.nav
        ? "Пройдено. Можно повторить."
        : "Пара минут за каждую роль — и вдвоём не придётся объяснять кнопки.";
  $("#btnTutSkip").hidden = !row.classList.contains("gate");
  // позвали по ссылке: своя комната или другой код перебили бы приглашение
  $("#btnCreate").hidden = !!inv;
  $("#vMain .join").hidden = !!inv;
  $("#btnCaseRoom").hidden = !!inv;
}
// после победы в обучении: следующая роль, игра вдвоём (если ждали) или меню
function tutNext() {
  const k = tutKind(),
    other = k === "runner" ? "nav" : "runner";
  if (!tutDone[other]) return startTutorial(other);
  solo = null;
  mode = "idle";
  resetGame("idle");
  openMenu();
  const act = tutPending;
  tutPending = null;
  tutRoom = "";
  renderTutRow(false);
  if (act) act();
}
function tutNextLabel() {
  const other = tutKind() === "runner" ? "nav" : "runner";
  if (!tutDone[other])
    return other === "nav"
      ? "Дальше: обучение за штурмана"
      : "Дальше: обучение за вора";
  return tutPending ? "К игре вдвоём" : "В меню";
}
/* ---------- вор-бот для обучения штурмана ---------- */
const bot = { q: [], next: 0, found: false, moves: 0, say: "" };
// что вор видит в комнате c: ориентиры на её стенах, двери, лучи в дверях
function botSays(c) {
  const Wd = lv.W,
    around = [c - Wd, c + 1, c + Wd, c - 1],
    // ориентир висит с одной стороны стены — только те, что смотрят в эту комнату (от стены i к комнате — направление i + 2)
    lm = around
      .filter((n, i) => lv.deco[n] != null && W.landmarkSide(lv, n) === (i + 2) % 4)
      .map((n) => `${G.LM[lv.deco[n]][0]} ${G.LM[lv.deco[n]][1]}`),
    doors = around.filter((n) => lv.g[n]).length,
    laser = around.some((n) => lv.lasers.some((l) => l.i === n));
  let t = c === lv.gem && sim.gem ? "💎 у меня! " : "";
  t += lm.length
    ? `Вижу на стене: ${lm.join(" и ")}. `
    : "Голые стены, ничего приметного. ";
  t += doors === 1 ? "Дверь одна." : `Дверей ${doors}.`;
  if (laser) t += " В одной двери красный луч!";
  return t;
}
function botUpdate(now) {
  if (tutKind() !== "nav" || !live() || !bot.q.length || now < bot.next) return;
  const c = bot.q.shift();
  bot.next = now + 650;
  if (!tryEv("m" + c.toString(36))) {
    bot.q = [];
    return;
  }
  placeRunner();
  if (!bot.q.length && !sim.caught) {
    bot.moves++;
    bot.say = botSays(sim.pos);
    A.sfxRadio();
  }
}
// клик по схеме в обучении штурмана: сначала «где вор», потом «куда идти» (соседняя комната через дверь)
function planClick(u, v) {
  if (tutKind() !== "nav" || !live() || !tutS || !van) return false;
  const c = planRoom(lv, van.plan.cv.width, van.plan.cv.height, u, v);
  if (c < 0 || bot.q.length) return true;
  if (!bot.found) {
    if (c === sim.pos) {
      bot.found = true;
      pingUntil = performance.now() + 2500; // на миг показать вора: да, он тут
      A.sfxSafeClick();
    } else {
      A.sfxDenied(0.4);
      toast("Не там. Ищи комнату, на стенах которой то, что он назвал");
    }
    return true;
  }
  if (c === sim.pos) return true;
  const Wd = lv.W,
    px = sim.pos % Wd,
    py = (sim.pos / Wd) | 0,
    cx = c % Wd,
    cy = (c / Wd) | 0,
    near =
      (px === cx && Math.abs(py - cy) === 2) ||
      (py === cy && Math.abs(px - cx) === 2),
    door = (sim.pos + c) / 2;
  if (!near || !lv.g[door]) {
    toast("Вор ходит только в соседнюю комнату и только через дверь");
    return true;
  }
  bot.q = [door, c];
  bot.next = 0;
  return true;
}
function tutUpdate(now, dt, v) {
  const k = tutKind(),
    el = $("#tut");
  const on =
    !!k &&
    !!lv &&
    !!sim &&
    $("#brief").hidden &&
    $("#menu").hidden &&
    !cuts.active;
  let h = "";
  if (on && !sim.won && !sim.caught) {
    const s = src();
    if (!tutS || tutS.k !== k)
      tutS = { k, i: 0, at: now, moved: 0, sneak: 0, laser: 0, att: -1 };
    const c = tutS,
      T = TUT[k];
    // новая попытка (попались): бот снова на старте и говорит, что видит
    if (c.att !== s.att) {
      c.att = s.att;
      bot.q = [];
      if (k === "nav")
        bot.say = (s.att ? "Я снова на старте. " : "") + botSays(sim.pos);
    }
    if (v > 0.3) {
      c.moved += v * dt;
      if (!runner.loud) c.sneak += dt;
    }
    // взял добычу раньше, чем дошли подсказки, — сразу к выходу; попались с ней — снова «найди 💎»
    const ex = T.findIndex((q) => q.exit);
    if (sim.gem && c.i < ex) Object.assign(c, { i: ex, at: now });
    if (!sim.gem && c.i >= ex) Object.assign(c, { i: ex - 1, at: now });
    const st = T[c.i],
      age = (now - c.at) / 1000;
    if (
      c.i < T.length - 1 &&
      age >= (st.min || 2.5) &&
      ((st.done ? st.done(c) : true) || (st.max && age >= st.max))
    )
      Object.assign(c, { i: c.i + 1, at: now, moved: 0, sneak: 0 });
    // первый раз у лазера (ближе 4 м) — подсказка про него на 9 секунд
    if (k === "runner" && !c.laser) {
      for (const l of lv.lasers) {
        const [x, z] = W.cellXZ(lv, l.i);
        if (Math.hypot(x - runner.pos.x, z - runner.pos.z) < 4) {
          c.laser = now + 9000;
          break;
        }
      }
    }
    const tip = c.laser > now,
      s2 = T[c.i];
    h =
      `<div class="tut-in"><div class="tut-h"><span>${tip ? "Обучение · лазер" : `${k === "nav" ? "Штурман" : "Вор"} · ${c.i + 1} из ${T.length}`}</span>` +
      (!tip && !s2.done
        ? '<button type="button" data-a="next">Дальше</button>'
        : "") +
      '<button type="button" data-a="skip">Выйти</button></div>' +
      `<p>${tip ? TUT_LASER : s2.t}</p>` +
      (s2.say && bot.say
        ? `<p class="tut-say"><b>🥷 Вор по рации:</b> «${bot.say}»</p>`
        : "") +
      "</div>";
  }
  if (h === tutHtml) return;
  if (h && tutHtml) A.sfxUi(); // новый шаг — тихий щелчок
  tutHtml = h;
  el.hidden = !h;
  el.innerHTML = h;
}
$("#tut").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-a]");
  if (!b || !tutS) return;
  if (b.dataset.a === "skip") {
    // выйти из обучения в меню (пройденным не считается); отложенное «создать комнату» забыть, приглашение по ссылке — оставить
    solo = null;
    resetGame("idle");
    openMenu();
    if (!tutRoom) {
      tutPending = null;
      renderTutRow(false);
    }
  } else tutS.at = -1e9; // «Дальше»: шаг без условия — сразу следующий
});
$("#btnTutRunner").addEventListener("click", () => {
  A.ensureAudio();
  startTutorial("runner");
});
$("#btnTutNav").addEventListener("click", () => {
  A.ensureAudio();
  startTutorial("nav");
});
$("#btnTutSkip").addEventListener("click", () => {
  tutFinish("runner");
  tutFinish("nav");
  const act = tutPending;
  tutPending = null;
  tutRoom = "";
  renderTutRow(false);
  if (act) act();
});

/* ======================= интерфейс ======================= */
let toastT = 0;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2600);
}
// досье в брифинге: что крадём (у каждого здания своё) и шутки. Выбор — по коду и номеру дела,
// чтобы у вора и штурмана было одно и то же досье
const TARGETS = {
  Ювелирка: "Голубой бриллиант «Слеза Байкала», 42 карата",
  Галерея: "Алмаз «Звёздная ночь» — спрятан за самой скучной картиной",
  Усадьба: "Фамильный изумруд графа Ветрова. Граф о нём давно забыл",
  Музей: "Алмаз «Орлов-младший» из закрытого запасника",
  Банк: "Ячейка №1408: бриллиант на предъявителя",
  Особняк: "Розовый бриллиант «Принцесса» — лежит в шкатулке с нитками",
  Аукцион: "Лот №7, сапфир «Синяя птица». Торги завтра, а мы — сегодня",
  Обсерватория: "Метеоритный алмаз «Комета»: прилетел с неба — уедет в фургоне",
  Казначейство:
    "Бриллиант «Резерв». Его пересчитывают каждое утро — завтра будет сюрприз",
  Пентхаус:
    "Чёрный бриллиант «Небоскрёб» — хозяин держит его вместо пресс-папье",
  Хранилище: "Бриллиант «Домосед»: за 50 лет ни разу не выходил наружу",
  Дворец: "Камень из короны. Тот, что в корону не влез",
  "Яхт-клуб": "Бриллиант «Якорь» из кубка регаты",
  Библиотека: "Алмаз в томе «Скучная экономика», страница 404",
  Посольство: "Подарочный бриллиант «Дружба народов» из дипломатической почты",
  Ломбард: "Бриллиант, который кто-то заложил в 1987-м и забыл забрать",
  Ипподром: "Главный приз «Золотая подкова» — с бриллиантом вместо гвоздя",
  Театр:
    "Бриллиант из короны короля Лира. Реквизитор думает, что это стекляшка",
  "Бизнес-центр":
    "Бриллиант «Квартальный отчёт» — лежит в сейфе финансового директора",
  Бутик: "Колье «Северное сияние»: 108 бриллиантов, одна застёжка",
};
const DOS = {
  op: [
    "Тихий тапок",
    "Мягкая лапа",
    "Сонный сторож",
    "Скрипучая половица",
    "Белый носок",
    "Ночная сова",
    "Чай с лимоном",
    "Бабушкин сундук",
    "Мокрый зонт",
    "Пятая ступенька",
    "Кот в мешке",
    "Лунная тень",
  ],
  price: [
    "и это без коробочки",
    "хватит на новый фургон и запас кружек",
    "оценивал штурман, так что плюс-минус",
    "а лежит и пылится",
    "страховка покроет, хозяин даже обрадуется",
  ],
  client: [
    "Пожелал остаться неизвестным. Даже для себя.",
    "Человек в шляпе. Больше ничего не известно — шляпа очень большая.",
    "Анонимный коллекционер. Заплатил вперёд — подозрительно щедро.",
    "Голос по телефону. Очень вежливый. Слишком вежливый.",
    "Тот же, что в прошлый раз. Он был доволен.",
    "Конкурент хозяина. Они не здороваются с 1998 года.",
    "Бабушка в синем пальто. Спорить с ней мы не стали.",
  ],
  intel: [
    "Хозяин уехал на дачу. Кот остался — не будите кота.",
    "Охрана пьёт чай ровно в полночь. Иногда в 00:05.",
    "Сигнализацию ставил племянник хозяина. Он очень старался.",
    "Сторож боится темноты. Мы — нет. Но фонарик возьми.",
    "Собаку увезли к ветеринару. Хомяк на месте и всё видит.",
    "В прошлый раз штурман уснул. Штурман, не спи.",
    "Камеры снимают в плохом качестве, но на всякий случай улыбайся.",
    "Лифт не работает с 2019 года. Лестница работает.",
    "Полы натёрли до блеска: в носках будет скользко.",
    "Охранники громко спорят о футболе. Нам на руку.",
    "Хозяйка выращивает кактусы. Не трогай кактусы.",
    "Повар оставил на кухне печенье. Не отвлекайся. Ну, может, одно.",
  ],
};
function dossier(s) {
  let h = 2166136261;
  for (const ch of s.code + "|" + s.lvl)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const pick = (arr, k) =>
      arr[(Math.imul(h ^ (k * 0x9e3779b9), 2246822507) >>> 0) % arr.length],
    price = (15 + ((Math.imul(h, 7919) >>> 0) % 85)) / 10,
    rows = [
      ["Операция", `«${pick(DOS.op, 1)}»`],
      [
        "Цель",
        `💎 ${TARGETS[lv.name] || "Бриллиант, ради которого всё затевалось"}`,
      ],
      [
        "Оценка",
        `${String(price).replace(".", ",")} млн у.е. — ${pick(DOS.price, 2)}`,
      ],
      ["Заказчик", pick(DOS.client, 3)],
      ["Разведка", pick(DOS.intel, 4)],
    ];
  return `<dl class="bf-dos">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
}
// «Новое в этом деле»: t — подпись на карте дел, r — вору, n — штурману.
// Только намёк, без разгадки: правила и штрафы — в папке штурмана (дела 1–2 — подробно, это основы)
const same = (t, x) => ({ t, r: x, n: x });
const NEWS = {
  0: {
    t: "Основы: шаги, такты, описание",
    r: "Ходи W A S D, смотри мышью, Shift — красться (медленно и тихо). Время идёт тактами: охрана и мигающие лазеры шагают раз в секунду с небольшим, а стоишь на месте — значит ждёшь. Штурман видит схему, но не видит тебя: описывай, что вокруг.",
    n: "Схема на планшете показывает охрану на такт вперёд (лазеры и камеры — как сейчас), но вора на ней нет: спрашивай, что он видит, и ищи эти ориентиры. Время идёт тактами — раз в секунду с небольшим. Памятка — в папке на столе.",
  },
  1: {
    t: "Случайный старт, невидимые лучи",
    r: "Старт случайный, и штурман его не видит — опиши, что вокруг. С этого дела ты не видишь лучей лазеров, только красные огоньки на стойках. Горит луч или нет, знает штурман: слушай его «стой… пошёл».",
    n: "Старт вора случайный — найди его по рассказу. Лучей лазеров вор больше не видит: какой горит, а какой мигает, видишь только ты. Командуй «стой… пошёл».",
  },
  2: {
    t: "Дверь с кодом",
    r: "На пути запертая дверь с кодом. Где-то в здании записка — она пригодится (клавиша 4). Ориентиры начинают повторяться: описывай подробнее.",
    n: "Запертая дверь с кодом — всё нужное в папке, лист «Дверь». Ориентиры начинают повторяться: уточняй, что рядом.",
  },
  3: {
    t: "Сейф и первый охранник",
    r: "Добыча в сейфе — опиши штурману, что видишь на панели. И первый охранник: обычные шаги он слышит, поэтому рядом с ним крадись (Shift). Шкаф или портьера — E, спрятаться.",
    n: "Добыча в сейфе — лист «Сейф». И первый охранник: стрелка — куда он шагнёт, оранжевый «!» — скоро свернёт. На шум он идёт сам: охранник рядом — скажи вору «крадись».",
  },
  4: {
    t: "Камеры наблюдения",
    r: "На стенах камеры. Куда повёрнута голова, ты видишь, а как далеко она видит — знает только штурман.",
    n: "Камеры: оранжевая зона на схеме — куда камера смотрит в следующем такте. Подробнее — в памятке.",
  },
  5: {
    t: "Цветной замок, двое охранников",
    r: "Замок на двери другой — описывай всё, что на нём горит. Охранников двое.",
    n: "Замок на двери другой — лист «Дверь». У сейфа появилась лампа: перечитай лист «Сейф». Охранников двое.",
  },
  6: {
    t: "Стрелочный замок, батарейки",
    r: "Снова новый замок. А у фонарика садятся батарейки: замигал и тускнеет — меняй клавишей R (запасных две, замена 2 секунды, стоять на месте).",
    n: "Снова новый замок — лист «Дверь». Охрана и камеры видят дальше: на сколько клеток — в памятке.",
  },
  7: {
    t: "Кофейное пятно",
    r: "Штурман пролил кофе на схему: часть здания ему не видна. Там описывай всё сам.",
    n: "Ты пролил кофе ☕: под пятном схемы не видно — спрашивай вора. Охраны и лазеров под пятном нет.",
  },
  8: {
    t: "Лазерный барьер",
    r: "Проход перекрыт лазерным барьером. Его можно отключить — штурман знает как. Батарейки слабее: фонарик светит тусклее и ближе.",
    n: "Лазерный барьер: сквозь него не пройти. Как отключить — лист «Щиток».",
  },
  9: same("Третий охранник", "Охранников теперь трое."),
  10: {
    t: "Взлом камер",
    r: "Здание больше, а пеленга нет: штурман не найдёт тебя на схеме. Одна камера смотрит в проход всегда. В здании есть чем отключить камеры — найди, штурман подскажет.",
    n: "Здание больше, пеленга нет. Одна камера смотрит в проход всегда — выключить её можно только взломом: лист «Камеры», ноутбук — клавиша 3.",
  },
  12: {
    t: "Охрана в тени",
    r: "Штурман больше не видит, где охрана: рассказывай, кого видишь и чьи шаги слышишь. Щиток барьера стал сложнее.",
    n: "Охрана в тени: на схеме только маршруты, где охранники сейчас — во вкладке «Охрана» и у вора. Щиток барьера стал сложнее. Пеленг снова есть — один.",
  },
  14: {
    t: "Самое большое здание",
    r: "Самое большое здание: четыре охранника и три камеры.",
    n: "Самое большое здание: четыре охранника и три камеры. Щиток больше не прощает ошибок.",
  },
  16: same("Таймер жёстче", "Таймер ещё жёстче. Удачи."),
  17: same("Ещё меньше времени", "Ещё меньше времени на каждый шаг."),
  20: {
    t: "Высшая лига",
    r: "Это уже высшая лига.",
    n: "Щиток барьера — в 3 этапа. Это уже высшая лига.",
  },
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
        : tutKind()
          ? '🎓<span class="rt"> ОБУЧЕНИЕ</span>'
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
      : (tutKind() ? "Обучение" : "Тренировка: видно всё") +
        ". Найди 💎 и уйди через служебную дверь";
  $("#status").innerHTML = st;
  // документы штурмана: какой лист нужен прямо сейчас
  const nearDoor = lv.door >= 0 && !sim.open && G.adjCell(lv, sim.pos, lv.door);
  const want = {
    door: lv.door >= 0 && !sim.open && (nearDoor || sim.note),
    safe: lv.safe && !sim.gem && sim.pos === lv.gem,
    panel: lv.panel >= 0 && sim.pos === lv.panel && !sim.gateOff,
    cctv: lv.cctv >= 0 && !sim.camOff && (sim.plugged || sim.pos === lv.cctv),
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
          ? `Охранник №${gk + 1} заметил вора${lv.hide ? " — на плане теперь видно, где была охрана" : ""}.`
          : "Охранник заметил вора.",
      cam: "Вор попал в камеру.",
      laser: "Вор задел лазер.",
      time: "Время вышло, сработала тревога.",
      safe: "Слишком много ошибок на сейфе, сработала тревога.",
      gate: "Вор шагнул в лазерный барьер.",
      panel: "Не тот провод на щитке — сработала тревога.",
      cctv: "Второй неверный пароль — система видеонаблюдения подняла тревогу.",
    }[sim.caught];
    // цифры — на момент поимки; фото — через 0,35 с (охранник успел повернуться, лучи лазеров видны)
    const tl0 = timerLeft(),
      used0 =
        tl0 != null && s.t0
          ? limitMs() - tl0
          : s.t0
            ? Date.now() + clockSkew() - s.t0
            : null;
    lastResult.fail = { why, used: used0 };
    shotReq = {
      at: performance.now() + 350,
      kind: sim.caught,
      gk,
      att: s.att,
      min: (used0 || 0) / 60000,
    };
    setTimeout(() => {
      if (sim && sim.caught && src() && src().att === s.att) {
        renderResult("fail");
        $("#caught").hidden = false;
        runner.unlock();
      }
    }, 2600);
  }
  if (!sim.caught) $("#caught").hidden = true;
  if (!sim.won) playedKey = ak;
  if (sim.won && lastWonKey !== ak) {
    lastWonKey = ak;
    runner.unlock();
    if (tutKind()) tutFinish(tutKind());
    $("#btnNext").textContent = tutKind() ? tutNextLabel() : "Следующее дело";
    // прогресс: онлайн вдвоём и «вором вслепую»; рекорд пары — только онлайн
    // (вслепую время идёт и пока пишешь Claude, с живой игрой не сравнить); тренировка не считается
    // победили до перезагрузки страницы (открыли сразу итоги) — сколько шли, не знаем: время не пишем
    const tlW = timerLeft(),
      msW =
        playedKey !== ak
          ? 0
          : tlW != null && s.t0
            ? limitMs() - tlW
            : s.t0
              ? Date.now() + clockSkew() - s.t0
              : 0;
    lastResult.win = { used: msW || null, best: null, fresh: false };
    if (online || blind()) {
      const r0 = N.net.room,
        old = bestOf(s.lvl + 1);
      recordWin(
        s.lvl + 1,
        msW < 7200000 ? msW : 0,
        online && r0 ? pairKey(r0.names[0], r0.names[1]) : null,
      );
      const best = bestOf(s.lvl + 1);
      lastResult.win.best = online ? best : null;
      lastResult.win.fresh = online && !!best && (!old || best.ms < old.ms);
    }
    shotReq = {
      at: performance.now() + 100,
      kind: "win",
      att: s.att,
      min: msW / 60000,
    };
    const showWon = () => {
      if (!sim || !sim.won) return;
      renderResult("win");
      $("#won").hidden = false;
      // следующее дело готовим, пока читают итоги: на больших зданиях генерация идёт секунду-другую
      const s1 = src();
      if (s1) setTimeout(() => G.getLevel(s1.code, s1.lvl + 1), 400);
    };
    setTimeout(() => {
      // пока ждали, могли нажать «заново» или открыть меню — тогда без сценки
      if (!sim || !sim.won || lastWonKey !== ak || !$("#menu").hidden)
        return showWon();
      if (cuts.ready()) {
        cuts.play("escape", () => {
          A.sfxCutStop();
          showWon();
        });
        cuts.cues = A.cutCues(
          "escape",
          cuts.weather,
          cuts.active && cuts.active.tGate,
          cuts.lot && cuts.lot.id,
        );
      } else showWon();
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
    bl = blind();
  const tk = tutKind();
  $("#briefStamp").textContent = tk ? "ОБУЧЕНИЕ" : `ДЕЛО №${s.lvl + 1}`;
  $("#briefName").textContent = lv.name;
  const kb = (t) =>
      t
        .split(" ")
        .map((k) => `<kbd>${k}</kbd>`)
        .join(""),
    head = (cls, ic, sub, name, goal) =>
      `<div class="bf-role ${cls}">${ic}<div><small>${sub}</small><b>${name}</b></div></div><p class="bf-goal">${goal}</p>`,
    list = (items) =>
      `<ul class="bf-list">${items
        .filter(Boolean)
        .map((t) => `<li>${t}</li>`)
        .join("")}</ul>`;
  // справа от фото — досье, под ним полосой — роль и клавиши; в обучении досье нет, задание справа от фото
  const task =
    tk === "nav"
      ? head(
          "nav",
          N.ROLE_IC[1],
          "обучение",
          "Штурман",
          "Доведи вора до 💎 и обратно к выходу.",
        ) +
        list([
          "Ты в фургоне у особняка, перед тобой схема здания.",
          "Вор в этот раз — бот: он пишет по рации, что видит, а ты кликаешь по схеме, где он и куда ему идти.",
          "Подсказки — слева вверху.",
        ])
      : tk
        ? head(
            "thief",
            N.ROLE_IC[0],
            "обучение",
            "Вор",
            "Найди 💎 и уйди через служебную дверь.",
          ) +
          list([
            "Ты в тёмном особняке с фонариком.",
            "Схема в углу — только для обучения: в игре вдвоём её видит штурман, а не ты.",
            "Подсказки — слева вверху.",
          ])
        : r === "runner"
          ? head(
              "thief",
              N.ROLE_IC[0],
              "твоя роль",
              "Вор",
              "Найди 💎 и уйди через служебную дверь.",
            ) +
            // только клавиши: как играть, учит обучение
            list([
              `${kb("W A S D")} и мышь — идти, ${kb("Shift")} — красться, ${kb("E")} — взломать, спрятаться${lv.flicker ? `, ${kb("R")} — батарейки` : ""}${lv.note >= 0 ? `, ${kb("4")} — записка` : ""}.`,
              bl &&
                `<b>Напиши Claude: «дело №${s.lvl + 1}, код ${esc(s.code)}»</b> и что видишь на старте. Время идёт, только когда ты переходишь в новую клетку, ${kb("Пробел")} — ждать.`,
            ])
          : r === "nav"
            ? head(
                "nav",
                N.ROLE_IC[1],
                "твоя роль",
                "Штурман",
                "Веди вора голосом к 💎 и к выходу.",
              ) +
              list([
                `${kb("1")} — схема крупно, ${kb("2")} — папка${lv.cctv >= 0 ? `, ${kb("3")} — ноутбук` : ""}.`,
                lv.pings
                  ? `📡 Пеленг (красная кнопка у рации): ${lv.pings} ${lv.pings === 1 ? "раз" : "раза"} за попытку.`
                  : "Пеленга нет.",
              ])
            : head(
                "both",
                '<i class="rc-ic">🔎</i>',
                "режим",
                "Тренировка",
                "Ты видишь всё сам: схема справа вверху.",
              ) + list(["Настоящая игра — вдвоём по звонку."]);
  $("#briefDos").innerHTML = tk ? task : dossier(s);
  $("#briefRole").innerHTML = tk ? "" : task;
  $("#briefRole").hidden = !!tk;
  const nw = !tk && NEWS[s.lvl],
    n =
      nw &&
      (r === "nav"
        ? nw.n
        : r === "runner" || nw.r === nw.n
          ? nw.r
          : `<i>Вору:</i> ${nw.r}<br><i>Штурману:</i> ${nw.n}`);
  $("#briefNew").hidden = !n;
  if (n) $("#briefNew").innerHTML = `<b>Новое в этом деле</b>${n}`;
  $("#briefCall").hidden = mode !== "online";
  $("#btnBriefSwap").hidden = mode !== "online";
  roleSeen = mode === "online" ? r : null;
  $("#briefCap").textContent =
    `снято из фургона · ${WEATHER_WORD[W.weatherOf(lv.L)] || ""}`;
  const pg = $("#briefPhoto").getContext("2d", { willReadFrequently: true });
  pg.fillStyle = "#14171C";
  pg.fillRect(0, 0, 640, 480);
  photoWant = true;
  $("#brief").hidden = false;
  runner.unlock();
}
// фото объекта в брифинге: в первом кадре после показа улица рисуется на экран и сразу копируется в карточку,
// а игра в том же кадре рисуется поверх (на паузе кадр не рисуется — под брифингом и так всё размыто и тёмное)
const WEATHER_WORD = {
  rain: "дождь",
  clear: "ясно",
  snow: "снег",
  storm: "гроза",
};
let photoWant = false;
function takeBriefPhoto() {
  const undo = cuts.still(scrAspect(), lv.L);
  if (!undo) return; // улица ещё грузится — попробуем в следующем кадре
  photoWant = false;
  cuts.render(renderer, 0.45);
  const cv = $("#briefPhoto");
  grabTo(cv);
  undo();
  const g = cv.getContext("2d", { willReadFrequently: true });
  filmLook(g);
  dateStamp(g, 0);
}
/* ---------- снимки для досье: брифинг, провал, победа ---------- */
// кадр рисуется на экран и сразу копируется (середина 4:3) в canvas 640×480; игра в том же кадре рисуется поверх
const scrAspect = () =>
  renderer.domElement.width / Math.max(1, renderer.domElement.height);
function grabTo(cv) {
  const R = renderer.domElement,
    w = R.width,
    h = R.height,
    sw = Math.min(w, (h * 4) / 3),
    sh = (sw * 3) / 4,
    sx = (w - sw) / 2,
    sy = (h - sh) / 2;
  cv.getContext("2d", { willReadFrequently: true }).drawImage(
    R,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    cv.width,
    cv.height,
  );
  // точка экрана (после project) → точка на снимке
  return (v) => [
    ((((v.x + 1) / 2) * w - sx) / sw) * cv.width,
    ((((1 - v.y) / 2) * h - sy) / sh) * cv.height,
  ];
}
// плёнка: зерно, чуть выцветшие тёплые цвета, тёмные углы
function filmLook(g) {
  const W2 = g.canvas.width,
    H2 = g.canvas.height,
    im = g.getImageData(0, 0, W2, H2),
    d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11,
      n = (Math.random() - 0.5) * 24;
    d[i] = (d[i] * 0.75 + y * 0.25) * 1.15 + n + 6;
    d[i + 1] = (d[i + 1] * 0.75 + y * 0.25) * 1.15 + n + 2;
    d[i + 2] = (d[i + 2] * 0.75 + y * 0.25) * 1.15 + n - 4;
  }
  g.putImageData(im, 0, 0);
  const vg = g.createRadialGradient(W2 / 2, H2 / 2, 140, W2 / 2, H2 / 2, 420);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.5)");
  g.fillStyle = vg;
  g.fillRect(0, 0, W2, H2);
}
// время снимка: ночь, своё у каждого кода (+ минуты с начала попытки); дата — сегодняшняя
function shotTime(addMin) {
  const c = src().code,
    t =
      ([23, 0, 1, 2, 3][c.charCodeAt(0) % 5] * 60 +
        ((c.charCodeAt(1) * 7 + c.charCodeAt(2)) % 60) +
        Math.round(addMin)) %
      1440,
    now = new Date(),
    p2 = (x) => String(x).padStart(2, "0");
  return {
    date: `${p2(now.getDate())} ${p2(now.getMonth() + 1)} '${String(now.getFullYear()).slice(2)}`,
    time: `${p2(Math.floor(t / 60))}:${p2(t % 60)}`,
  };
}
// дата оранжевыми цифрами, как у старых фотоаппаратов
function dateStamp(g, addMin) {
  const st = shotTime(addMin);
  g.font = "bold 26px 'PT Mono', monospace";
  g.textAlign = "right";
  g.fillStyle = "#FF9A2E";
  g.shadowColor = "rgba(255,110,20,.85)";
  g.shadowBlur = 8;
  g.fillText(
    `${st.date}  ${st.time}`,
    g.canvas.width - 22,
    g.canvas.height - 20,
  );
  g.shadowBlur = 0;
}
// ночная камера наблюдения: зелёная картинка, шум, строки, надписи КАМ / REC / время
function irLook(g, n, addMin) {
  const W2 = g.canvas.width,
    H2 = g.canvas.height,
    im = g.getImageData(0, 0, W2, H2),
    d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const row = Math.floor(i / 4 / W2);
    let l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    l = Math.pow(1 - Math.exp(-l * 3), 0.85) + (Math.random() - 0.5) * 0.12;
    l *= row % 3 ? 1 : 0.82;
    d[i] = l * 150 + 4;
    d[i + 1] = l * 255 + 8;
    d[i + 2] = l * 168 + 5;
  }
  g.putImageData(im, 0, 0);
  const vg = g.createRadialGradient(W2 / 2, H2 / 2, 160, W2 / 2, H2 / 2, 420);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.6)");
  g.fillStyle = vg;
  g.fillRect(0, 0, W2, H2);
  const st = shotTime(addMin);
  g.font = "bold 24px 'PT Mono', monospace";
  g.fillStyle = "rgba(225,255,230,.92)";
  g.textAlign = "left";
  g.fillText(`КАМ ${n}`, 22, 40);
  g.fillText(`${st.date}  ${st.time}`, 22, H2 - 22);
  g.textAlign = "right";
  g.fillStyle = "#FF3B30";
  g.fillText("● REC", W2 - 22, 40);
}
// мигалки полиции у дома: красное слева, синее справа
function policeLights(g) {
  const W2 = g.canvas.width,
    H2 = g.canvas.height;
  g.globalCompositeOperation = "lighter";
  for (const [x, c] of [
    [W2 * 0.12, "255,40,40"],
    [W2 * 0.88, "40,90,255"],
  ]) {
    const gr = g.createRadialGradient(x, H2 * 0.55, 0, x, H2 * 0.55, W2 * 0.55);
    gr.addColorStop(0, `rgba(${c},.75)`);
    gr.addColorStop(0.35, `rgba(${c},.28)`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W2, H2);
  }
  g.globalCompositeOperation = "source-over";
}
// засвет фонаря: лицо вора тонет в белом пятне, через кадр — блик
function glare(g, x, y) {
  g.globalCompositeOperation = "lighter";
  const gr = g.createRadialGradient(x, y, 0, x, y, 170);
  gr.addColorStop(0, "rgba(255,252,240,1)");
  gr.addColorStop(0.15, "rgba(255,246,225,.9)");
  gr.addColorStop(0.45, "rgba(255,232,195,.3)");
  gr.addColorStop(1, "rgba(255,220,180,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const lg = g.createLinearGradient(0, 0, g.canvas.width, 0);
  lg.addColorStop(0, "rgba(255,240,210,0)");
  lg.addColorStop(x / g.canvas.width, "rgba(255,240,210,.55)");
  lg.addColorStop(1, "rgba(255,240,210,0)");
  g.fillStyle = lg;
  g.fillRect(0, y - 3, g.canvas.width, 6);
  g.globalCompositeOperation = "source-over";
}
const shotCam = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 30);
let shotThief = null, // модель вора для снимков: в доме видна только на время кадра
  shotReq = null, // заказ снимка: { at, kind, gk, att, min } — снимаем в кадре, когда пришло время
  winShot = null; // фото на память: { key, att, img, cap }
// где вор и куда смотрит: у вора — по его камере, у штурмана — по сообщениям pose (или середина клетки)
function thiefSpot() {
  if (role() !== "nav")
    return { x: runner.pos.x, z: runner.pos.z, yaw: runner.yaw };
  if (thiefAt) return { x: thiefAt.x, z: thiefAt.z, yaw: thiefYaw };
  const [x, z] = W.cellXZ(lv, sim.pos);
  return { x, z, yaw: thiefYaw };
}
// фото провала: снимает «свидетель» — охранник (засвеченное лицо), камера наблюдения (ночной кадр)
// или скрытая камера у лазера; сирена (сейф, щиток, пароль, время) — дом с улицы и мигалки полиции
function takeFailShot(r) {
  const cv = document.createElement("canvas");
  cv.width = 640;
  cv.height = 480;
  const g = cv.getContext("2d", { willReadFrequently: true }),
    k = r.kind;
  let cap;
  if (
    ["guard", "cam", "laser", "gate"].includes(k) &&
    level &&
    GD.guardReady()
  ) {
    if (role() === "nav") updateWorld(performance.now(), 0, true); // у штурмана дом стоит — подвинуть охрану и лазеры
    if (!shotThief) {
      shotThief = GD.makeThiefModel();
      if (!shotThief) return null;
      scene.add(shotThief.model, ...shotThief.extra);
      shotThief.play("walk");
      shotThief.update(0.35); // замер посреди шага
    }
    const p = thiefSpot(),
      head = new THREE.Vector3(p.x, 1.52, p.z);
    shotThief.model.position.set(p.x, 0, p.z);
    shotThief.model.rotation.y = p.yaw + Math.PI;
    shotThief.model.visible = true;
    shotThief.update(0);
    let hide = [],
      ci = 0;
    // точка съёмки: от вора в сторону (dx, dz) на want метров, но не дальше стены и мебели (по растру)
    const back = (dx, dz, want, y) => {
      const d = Math.hypot(dx, dz) || 1;
      let t = 0.3;
      while (
        t < want &&
        W.rasterFree(
          level.R,
          p.x + (dx / d) * (t + 0.1),
          p.z + (dz / d) * (t + 0.1),
        )
      )
        t += 0.1;
      shotCam.position.set(p.x + (dx / d) * t, y, p.z + (dz / d) * t);
    };
    if (k === "guard" && r.gk >= 0 && level.guards[r.gk]) {
      const o = level.guards[r.gk],
        gx = o.group.position.x - p.x,
        gz = o.group.position.z - p.z,
        gd = Math.hypot(gx, gz);
      // из глаз охранника; стоит вплотную — отходим на шаг, чтобы вор влез в кадр
      if (gd < 0.3) back(-Math.sin(p.yaw), -Math.cos(p.yaw), 1.8, 1.62);
      else back(gx, gz, Math.max(gd, 1.8), 1.62);
      hide = [o.group, o.gm && o.gm.cap, o.gm && o.gm.torch].filter(Boolean);
      cap = `снимок охранника №${r.gk + 1}`;
    } else if (k === "cam" && level.cams.length) {
      const noOff = { ...sim, camOff: false };
      ci = Math.max(
        0,
        lv.cams.findIndex((c) =>
          [sim.t, sim.t - 1].some((t) =>
            G.camCells(lv, c, t, noOff).includes(sim.pos),
          ),
        ),
      );
      const o = level.cams[ci];
      o.pivot.updateWorldMatrix(true, false);
      shotCam.position.set(0, 0, 0.3);
      o.pivot.localToWorld(shotCam.position);
      hide = [o.group]; // свой корпус и кронштейн в кадр не попадают
      cap = `камера №${ci + 1}`;
    } else {
      // скрытая камера под потолком перед вором (видно лицо); впереди стена — от вора к середине клетки
      back(-Math.sin(p.yaw), -Math.cos(p.yaw), 1.8, 2.45);
      if (Math.hypot(shotCam.position.x - p.x, shotCam.position.z - p.z) < 1) {
        const [cx, cz] = W.cellXZ(lv, sim.pos);
        if (Math.hypot(cx - p.x, cz - p.z) > 0.4)
          back(cx - p.x, cz - p.z, 1.8, 2.45);
      }
      cap = k === "gate" ? "лазерный барьер" : "лазер";
    }
    const asp = scrAspect();
    shotCam.fov = fitFov(k === "cam" ? 64 : 50, asp);
    shotCam.aspect = asp;
    shotCam.updateProjectionMatrix();
    shotCam.lookAt(head);
    shotCam.updateMatrixWorld();
    // свет со стороны «свидетеля»: фонарь вора (висит на camera) на время кадра переносим к нему
    const p0 = camera.position.clone(),
      q0 = camera.quaternion.clone(),
      f0 = flash.intensity,
      d0 = flash.distance;
    camera.position.copy(shotCam.position);
    camera.quaternion.copy(shotCam.quaternion);
    camera.updateMatrixWorld();
    flash.intensity = FLASH * (k === "guard" ? 2.4 : 1.6);
    flash.distance = 22;
    irLight.intensity = k === "cam" ? 0.45 : 0.2;
    for (const o of hide) o.visible = false;
    renderer.render(scene, shotCam);
    const map = grabTo(cv);
    for (const o of hide) o.visible = true;
    irLight.intensity = 0;
    flash.intensity = f0;
    flash.distance = d0;
    camera.position.copy(p0);
    camera.quaternion.copy(q0);
    camera.updateMatrixWorld();
    for (const o of [shotThief.model, ...shotThief.extra]) o.visible = false;
    if (k === "cam") irLook(g, ci + 1, r.min);
    else {
      filmLook(g);
      if (k === "guard") glare(g, ...map(head.clone().project(shotCam)));
      dateStamp(g, r.min);
    }
  } else {
    const undo = cuts.still(scrAspect(), lv.L + 1);
    if (!undo) return null;
    cuts.render(renderer, 0.45);
    grabTo(cv);
    undo();
    filmLook(g);
    policeLights(g);
    dateStamp(g, r.min);
    cap =
      {
        time: "время вышло",
        safe: "тревога на сейфе",
        panel: "тревога на щитке",
        cctv: "тревога видеонаблюдения",
      }[k] || "тревога";
  }
  return { img: cv.toDataURL("image/jpeg", 0.82), cap };
}
// фото на память: вор и штурман у фургона (люди не загрузились — просто дом)
function takeWinShot(min) {
  const cv = document.createElement("canvas");
  cv.width = 640;
  cv.height = 480;
  const undo = cuts.crewStill(scrAspect()) || cuts.still(scrAspect(), lv.L);
  if (!undo) return null;
  cuts.render(renderer, 0.45);
  grabTo(cv);
  undo();
  const g = cv.getContext("2d", { willReadFrequently: true });
  filmLook(g);
  dateStamp(g, min);
  return { img: cv.toDataURL("image/jpeg", 0.82), cap: "на память" };
}
// фото провалов этого дела копятся стопкой (до 4), переживают перезагрузку; пройдено — стопка сбрасывается
const fails = { key: "", list: [] };
function failList(key) {
  if (fails.key !== key) {
    const st = store.get("fails", null);
    fails.key = key;
    fails.list = st && st.key === key ? st.list || [] : [];
  }
  return fails.list;
}
function takeShot() {
  const r = shotReq,
    s = src();
  shotReq = null;
  if (!s || !lv || !sim) return;
  const key = s.code + "|" + s.lvl;
  if (r.kind === "win") {
    const sh = takeWinShot(r.min);
    if (sh) winShot = { key, att: r.att, ...sh };
  } else {
    const sh = takeFailShot(r);
    if (sh) {
      const list = failList(key).filter((x) => x.att !== r.att);
      list.push({ att: r.att, ...sh });
      while (list.length > 4) list.shift();
      fails.list = list;
      store.set("fails", { key, list });
    }
  }
  // итоги уже на экране — дорисовать фото
  if (!$("#caught").hidden) renderResult("fail");
  if (!$("#won").hidden) renderResult("win");
}
/* ---------- итоги попытки: досье с печатью, фото и цифрами ---------- */
const VERDICT = {
  guard: [
    "Охранник запомнил лицо. Хорошо, что лицо было в маске.",
    "«Стоять!» — сказал охранник. Вор послушно встал. Зря.",
    "Охранник получит премию. Мы — нет.",
  ],
  cam: [
    "Камера сняла отличный кадр. Его повесят на доску почёта охраны.",
    "Улыбнулся в камеру. Камера улыбнулась в ответ.",
  ],
  laser: [
    "Лазер был там. Вор тоже был там. Одновременно.",
    "Невидимый луч потому и называется невидимым.",
  ],
  gate: ["Барьер было видно издалека. Это даже обидно."],
  time: [
    "Пока вы спорили, где лево, приехала полиция.",
    "Таймер не ждёт. Даже вежливых.",
  ],
  safe: ["Сейф не любит, когда его угадывают."],
  panel: ["Красный или синий? Оказалось — не тот."],
  cctv: ["Пароль «1234» не подошёл. И «0000» тоже."],
  win: [
    "Чисто сработано. Охрана узнает только утром.",
    "Хозяин заметит пропажу, когда пойдёт за пресс-папье.",
    "Штурман не уснул, вор не чихнул. Идеально.",
    "Заказчик доволен. Бабушка в синем пальто передаёт печенье.",
  ],
};
let lastResult = { fail: null, win: null }; // { why, used, best, fresh } — цифры на момент конца попытки
function renderResult(kind) {
  const root = $(kind === "fail" ? "#caught" : "#won"),
    q = (n) => root.querySelector(`[data-rs=${n}]`),
    s = src(),
    info = lastResult[kind];
  if (!s || !lv || !sim || !info) return;
  q("tab").textContent = tutKind() ? "ОБУЧЕНИЕ" : `ДЕЛО №${s.lvl + 1}`;
  q("name").textContent = lv.name;
  // фото: сверху — эта попытка (или фото на память), под ним — прошлые провалы этого дела
  const key = s.code + "|" + s.lvl,
    list = failList(key),
    top =
      kind === "fail"
        ? list.find((x) => x.att === s.att)
        : winShot && winShot.key === key && winShot.att === s.att
          ? winShot
          : null,
    olds = list.filter((x) => x !== top).slice(-3),
    fig = (p, cls, st) =>
      `<figure class="bf-photo ${cls}"${st ? ` style="${st}"` : ""}>${cls === "rs-top" ? '<i class="bf-clip"></i>' : ""}${p && p.img ? `<img src="${p.img}" alt="">` : '<div class="rs-dev">проявляется…</div>'}<figcaption>${p ? (p.cap !== "на память" ? `попытка ${p.att + 1} · ` : "") + p.cap : "&nbsp;"}</figcaption></figure>`;
  q("photos").innerHTML =
    olds
      .map((p, i) => {
        const j = olds.length - i; // дальше от верхнего — сильнее сдвиг
        return fig(
          p,
          "rs-old",
          `--r:${(j % 2 ? -1 : 1) * (4 + j * 3)}deg;--x:${(j % 2 ? -1 : 1) * j * 7}px;--y:${j * 5}px`,
        );
      })
      .join("") + fig(top, "rs-top");
  // цифры
  const errs = [];
  if (sim.wrong) errs.push(`код двери ×${sim.wrong}`);
  if (sim.strikes) errs.push(`сейф ×${sim.strikes}`);
  if (sim.pstrikes) errs.push(`щиток ×${sim.pstrikes}`);
  if (sim.hstrikes) errs.push(`пароль ×${sim.hstrikes}`);
  const pen = Math.round(penaltyMs() / 1000),
    got = [
      lv.note >= 0 && ["📝 записка", sim.note],
      lv.door >= 0 && ["🔓 дверь", sim.open],
      lv.gate >= 0 && ["⚡ барьер", sim.gateOff],
      lv.cctv >= 0 && ["📟 камеры", sim.camOff],
      ["💎 добыча", sim.gem],
      ["🚪 выход", sim.won],
    ].filter(Boolean),
    jokes = VERDICT[kind === "win" ? "win" : sim.caught] || VERDICT.time,
    nFails = list.length,
    rows = [
      kind === "fail"
        ? ["Причина", info.why]
        : ["Итог", "Ушли с добычей. Чисто."],
      [
        "Время",
        info.used != null
          ? sim.caught === "time"
            ? `вышло (${fmtTime(limitMs())})`
            : fmtTime(info.used) + (lv.limit ? ` из ${fmtTime(limitMs())}` : "")
          : "—",
      ],
      ["Тактов", String(sim.t)],
      [
        "Ошибки",
        errs.length
          ? errs.join(" · ") + (pen ? ` (−${pen} с)` : "")
          : "без ошибок",
      ],
      [
        "Успели",
        got
          .map(
            ([t, ok]) => `<span class="rs-chip${ok ? " ok" : ""}">${t}</span>`,
          )
          .join(""),
      ],
      kind === "fail"
        ? ["Попытка", `№${s.att + 1}`]
        : [
            "Попыток",
            `${s.att + 1}${nFails ? ` · провалов в папке: ${nFails}` : ""}`,
          ],
      info.best && [
        "Рекорд пары",
        fmtTime(info.best.ms) + (info.fresh ? " — новый!" : ""),
      ],
      ["Вердикт", jokes[(s.att + s.lvl + s.code.charCodeAt(0)) % jokes.length]],
    ].filter(Boolean);
  q("stats").innerHTML = rows
    .map(([k2, v]) => `<dt>${k2}</dt><dd>${v}</dd>`)
    .join("");
  q("note").textContent =
    kind === "fail"
      ? lv.L > 0
        ? "Здание то же, но вор начнёт с другого места, а коды будут новые."
        : "Попробуйте ещё раз."
      : "";
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
  applyWeather();
  // записи могли ещё не раскодироваться (первый клик) — ждём до 1,5 с, чтобы сценка не была немой
  A.whenReady(1500).then(() => {
    cuts.play("arrive", () => {
      A.sfxCutStop();
      startAttempt(false);
    });
    cuts.cues = A.cutCues(
      "arrive",
      cuts.weather,
      cuts.active && cuts.active.tGate,
      cuts.lot && cuts.lot.id,
    );
  });
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
  A.sfxAlarmStop();
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
  A.sfxAlarmStop();
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
// «В меню» на итогах: меню встаёт поверх досье, «Вернуться к делу» — снова итоги
for (const b of document.querySelectorAll(".rs-menu"))
  b.addEventListener("click", openMenu);
$("#btnNext").addEventListener("click", () => {
  A.ensureAudio();
  // дело пройдено — стопка фото провалов больше не нужна
  store.set("fails", null);
  fails.key = "";
  winShot = null;
  if (tutKind()) tutNext();
  else nextLevel();
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
/* ---------- карта дел, прогресс и рекорды пары (в браузере) ---------- */
const CASES = 21;
const CASE_TITLES = {
  1: "Первое дело",
  2: "Лазеры в темноте",
  3: "Кодовая дверь",
  4: "Сейф и охранник",
  5: "Камеры",
  6: "Цветной замок",
  7: "Стрелки и батарейки",
  8: "Кофейные пятна",
  9: "Лазерный барьер",
  10: "Трое охранников",
  11: "Взлом камер",
  12: "Тишина в эфире",
  13: "Охрана в тени",
  14: "Шаги в темноте",
  15: "Самый большой дом",
  16: "Четверо на смене",
  17: "Жёсткий таймер",
  18: "Каждый шаг на счету",
  19: "Без права на ошибку",
  20: "Генеральная репетиция",
  21: "Высшая лига",
};
const caseTitle = (n) => CASE_TITLES[n] || "Дело №" + n;
// открыты пройденные вдвоём (или вором вслепую) дела и следующее; старый номер тренировки — только
// если openMax ещё не записан (переход со старой версии), дальше тренировка прогресс не даёт
let openMax = Math.max(1, store.get("openMax", 0) | 0 || trainLvl);
store.set("openMax", openMax); // сразу запомнить: иначе выбор меньшего дела после перезагрузки «закроет» остальные
const pairKey = (a, b) =>
  [a || "?", b || "?"].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)).join(" и ");
const fmtTime = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
// лучшее время дела n среди пар, где есть я: { ms, pair } или null
function bestOf(n) {
  const rec = store.get("records", {}),
    me = N.myName() || "?";
  let best = null;
  for (const [pair, cs] of Object.entries(rec)) {
    if (!pair.split(" и ").includes(me) && me !== "?") continue;
    const r = cs[n];
    if (r && (!best || r.ms < best.ms)) best = { ms: r.ms, pair };
  }
  return best;
}
// дело пройдено: открыть следующее, записать время пары (онлайн)
function recordWin(n, ms, pair) {
  openMax = Math.max(openMax, Math.min(CASES + 39, n + 1));
  store.set("openMax", openMax);
  if (!pair || !(ms > 0)) return;
  const rec = store.get("records", {}),
    cs = (rec[pair] = rec[pair] || {}),
    old = cs[n];
  if (!old || ms < old.ms) cs[n] = { ms, d: Date.now() };
  store.set("records", rec);
}
function setCase(n) {
  trainLvl = Math.max(1, Math.min(60, n | 0));
  store.set("trainLvl", trainLvl);
  renderTrain();
}
function renderTrain() {
  const n = trainLvl,
    b = bestOf(n);
  $("#pcNum").textContent = "№" + n;
  $("#pcTitle").textContent = caseTitle(n);
  $("#pcSub").textContent =
    (b ? `Лучшее время ${fmtTime(b.ms)} · ` : "") +
    "начать с этого дела · сменить";
  let done = 0;
  for (let k = 1; k <= CASES; k++) if (k < openMax) done++;
  $("#bestLine").textContent = `Пройдено: ${done} из ${CASES}`;
  renderCases();
}
function renderCases() {
  const grid = $("#caseGrid");
  if (!grid) return;
  let h = "";
  for (let n = 1; n <= CASES; n++) {
    // выбранное открыто всегда: до него дошли тренировкой («Следующее дело»), пройденным не считается
    const open = n <= openMax || n === trainLvl,
      done = n < openMax,
      b = bestOf(n),
      sel = n === trainLvl;
    h += `<button type="button" class="case${done ? " done" : ""}${open ? "" : " locked"}${sel ? " sel" : ""}" data-n="${n}"${open ? "" : " disabled"} aria-pressed="${sel}"><b>${n}</b><small>${!open ? "🔒" : b ? fmtTime(b.ms) : done ? "✓" : "новое"}</small></button>`;
  }
  grid.innerHTML = h;
  const n = trainLvl,
    d = G.diff(n - 1),
    b = bestOf(n),
    news = NEWS[n - 1];
  const parts = [
    `${d.cw}×${d.ch} комнат`,
    d.guards ? `охрана: ${d.guards}` : "без охраны",
    d.cams ? `камер: ${d.cams}` : "",
    `лазеров: ${d.lasers}`,
    d.lock && "кодовая дверь",
    d.safe && "сейф",
    d.gate && "барьер",
    d.cctv && "щиток камер",
  ].filter(Boolean);
  $("#caseInfo").innerHTML =
    `<b>№${n} · ${esc(caseTitle(n))}</b><p>${parts.join(" · ")}</p>` +
    (b
      ? `<p class="rec">Рекорд: <b>${fmtTime(b.ms)}</b> — ${esc(b.pair)}</p>`
      : "") +
    (news ? `<p class="nw">${esc(news.t)}</p>` : "");
}
// начать выбранное дело прямо с карты дел, не возвращаясь во вкладку «Игра»
$("#btnCaseRoom").addEventListener("click", () => {
  A.ensureAudio();
  tutGate(() => N.createRoom(trainLvl - 1));
});
$("#btnCaseSolo").addEventListener("click", () => {
  A.ensureAudio();
  startSolo(false);
});
$("#caseGrid").addEventListener("click", (e) => {
  const b = e.target.closest("button.case");
  if (!b || b.disabled) return;
  // в комнате дело уже выбрано: выбор тут поменял бы только подсветку
  if (N.net.on && N.net.room)
    return toast(
      `В комнате — дело №${N.net.room.lvl + 1}. Другое: выйди и создай новую комнату`,
    );
  setCase(+b.dataset.n);
});
$("#pickCase").addEventListener("click", () => showTab("cases"));
function inGame() {
  return (
    (mode === "solo" && !!solo) ||
    (mode === "online" && !!N.net.room && N.started(N.net.room))
  );
}
// вкладки папки: «Игра» (меню или комната), «Дела», «Настройки»
let menuTab = "play";
function showTab(t) {
  menuTab = t;
  for (const b of document.querySelectorAll("#ftabs button"))
    b.setAttribute("aria-pressed", String(b.dataset.tab === t));
  const room = N.net.on;
  $("#vMain").hidden = !(t === "play" && !room);
  $("#vRoom").hidden = !(t === "play" && room);
  $("#vCases").hidden = t !== "cases";
  $("#vSettings").hidden = t !== "settings";
  if (t === "cases") renderTrain();
  $("#caseAct").hidden = room; // в комнате дело уже выбрано — кнопок нет
  if (t === "play" && room) N.renderRoomPanel();
}
$("#ftabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) showTab(b.dataset.tab);
});
function openMenu() {
  if (mode === "solo") menuAt = Date.now();
  runner.unlock();
  if (N.net.on) {
    N.showRoomPanel();
    return;
  }
  $("#btnResume").hidden = !inGame();
  $("#menu").hidden = false;
  showTab("play");
  renderTutRow();
  renderTrain();
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
  if (menuAt) tickAt += Date.now() - menuAt;
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
// обратно в игру: кнопка «Вернуться к делу» или клик по затемнённой игре вокруг папки.
// Клик — жест пользователя: браузер разрешает сразу захватить мышь (по Esc — нет, поэтому Esc меню не закрывает)
function resumeGame() {
  A.ensureAudio();
  closeMenu();
  if (playing() && role() !== "nav") {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
}
$("#btnResume").addEventListener("click", resumeGame);
$("#menu").addEventListener("click", (e) => {
  if (e.target === e.currentTarget && inGame()) resumeGame();
});
// Esc в игре — меню-папка. Пока мышь захвачена, браузер сам забирает Esc
// (отпускает мышь и клавишу не присылает) — поэтому меню открываем и по потере захвата.
// В крупном плане Esc выходит из него, в сценке — пропускает её (там свои обработчики)
let menuOpenedAt = 0;
function escMenu() {
  if (!inGame() || cuts.active || closeup.active || !$("#menu").hidden) return;
  // брифинг и итоги лежат поверх меню: под ними оно открылось бы невидимым (на итогах есть кнопка «В меню»)
  if (!$("#brief").hidden || !$("#caught").hidden || !$("#won").hidden) return;
  menuOpenedAt = performance.now();
  openMenu();
}
addEventListener(
  "keydown",
  (e) => {
    if (e.code !== "Escape" || e.repeat) return;
    if (cuts.active || closeup.active) return;
    if (!$("#menu").hidden) {
      if (!inGame() || performance.now() - menuOpenedAt < 400) return;
      // штурману мышь не нужна — сразу обратно; вору браузер вернёт мышь только по клику: подсветить кнопку
      if (role() === "nav") closeMenu();
      else {
        const b = $("#btnResume");
        b.classList.remove("pulse");
        void b.offsetWidth;
        b.classList.add("pulse");
      }
      return;
    }
    // штурман приблизил экран (ноутбук, монитор, схема) — Esc только отъезжает, меню не открывает
    if (vanView && vanView.active && vanView.zoomTo) return;
    escMenu();
  },
  { capture: true },
);
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement) return;
  if (runner.selfUnlock) {
    runner.selfUnlock = false;
    return;
  }
  if (playing() && role() !== "nav") escMenu();
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
  tutGate(() => N.createRoom(trainLvl - 1));
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
  tutGate(() => N.joinRoom(v));
};
$("#btnJoin").addEventListener("click", doJoin);
inCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") return doJoin();
  // буква по клавише, а не по раскладке: на русской раскладке клавиша T — это T, а не «Е».
  // Вставка из буфера (Ctrl/Cmd+V) — как раньше, через input
  const m = /^(?:Key([A-Z])|Digit(\d))$/.exec(e.code);
  if (!m || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  e.preventDefault();
  const a = inCode.selectionStart,
    b = inCode.selectionEnd;
  if (inCode.value.length - (b - a) >= 4) return;
  inCode.setRangeText(m[1] || m[2], a, b, "end");
  inCode.dispatchEvent(new Event("input"));
});
$("#btnShare").addEventListener("click", N.shareInvite);
$("#btnLeave").addEventListener("click", () => {
  N.leaveRoom();
  openMenu();
});
$("#btnRoomClose").addEventListener("click", () => closeMenu());
addEventListener("hashchange", () => {
  const c = N.codeFromHash();
  if (c && (!N.net.on || N.net.code !== c)) tutGate(() => N.joinRoom(c), c);
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
/* ---------- настройки: яркость, мышь, поле зрения, громкость (хранятся в браузере) ---------- */
const SETS = [
  ["bright", "Bright", 1, (v) => Math.round(v * 100) + "%"],
  ["sens", "Sens", 1, (v) => Math.round(v * 100) + "%"],
  ["fov", "Fov", 72, (v) => v + "°"],
  ["vol", "Vol", 1, (v) => Math.round(v * 100) + "%"],
];
const sets = {};
for (const [k, , d] of SETS) sets[k] = d;
Object.assign(sets, store.get("settings", {}));
function applySettings() {
  renderer.toneMappingExposure = sets.bright;
  runner.sens = sets.sens;
  camera.fov = sets.fov;
  camera.updateProjectionMatrix();
  A.setVolume(sets.vol);
  for (const [k, id, , fmt] of SETS) {
    $("#s" + id).value = sets[k];
    $("#o" + id).textContent = fmt(sets[k]);
  }
}
for (const [k, id] of SETS)
  $("#s" + id).addEventListener("input", (e) => {
    sets[k] = +e.target.value;
    store.set("settings", sets);
    applySettings();
  });
applySettings();
/* ---------- кто вор, а кто штурман: карточки в комнате, таблички над героями, кнопка на брифинге ---------- */
let roleSeen = null;
function canSwap() {
  const r = N.net.room;
  if (mode !== "online" || !r || N.mySeat() < 0) return false;
  return !r.go || !r.log.length || !!(sim && (sim.caught || sim.won));
}
function swapRoles() {
  if (!canSwap()) return toast("Поменяться ролями можно до начала попытки");
  roleSeen = role();
  N.setThief(1 - N.thiefSeat(N.net.room));
}
$("#btnSwap").addEventListener("click", swapRoles);
$("#btnBriefSwap").addEventListener("click", swapRoles);
$("#seats").addEventListener("click", (e) => {
  const b = e.target.closest(".rolecard"),
    r = N.net.room;
  if (b && r && r.seats[+b.dataset.seat] !== N.myId) swapRoles();
});
$("#tagThief").addEventListener(
  "click",
  () => role() !== "runner" && swapRoles(),
);
$("#tagNav").addEventListener("click", () => role() !== "nav" && swapRoles());
$("#btnGo").addEventListener("click", () => {
  A.ensureAudio();
  N.startGame();
});
// таблички с именами над вором и штурманом у фургона (только на экране комнаты)
function crewTags(on) {
  const r = N.net.room,
    show = on && N.net.on && !!r && !$("#vRoom").hidden,
    els = [$("#tagThief"), $("#tagNav")];
  if (!show) {
    for (const el of els) el.hidden = true;
    return;
  }
  const pos = cuts.crewScreen(),
    th = N.thiefSeat(r);
  [
    [els[0], "thief", th, "ВОР"],
    [els[1], "nav", 1 - th, "ШТУРМАН"],
  ].forEach(([el, key, k, label]) => {
    const p = pos[key];
    el.hidden = !p || !p.on;
    if (el.hidden) return;
    const id = r.seats[k],
      nm = id ? r.names[k] || (k ? "Второй" : "Первый") : "ждём…",
      txt = `<small>${label}${id === N.myId ? " · ты" : ""}</small>${esc(nm)}`;
    if (el.dataset.t !== txt) {
      el.innerHTML = txt;
      el.dataset.t = txt;
    }
    el.style.transform = `translate(${(p.x * innerWidth).toFixed(1)}px, ${(p.y * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  });
}
A.setSound(store.get("sound", true));
addEventListener("pointerdown", () => A.ensureAudio(), { once: true });
addEventListener("keydown", () => A.ensureAudio(), { once: true });
// кнопки меню и экранов — тихий щелчок (у вкладок папки свой звук — страница)
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("button");
  if (b && !b.closest("#docTabs")) A.sfxUi();
});
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
// звук из точки (x, z): сторона -1..1 относительно взгляда вора и громкость 0..1 (тише к range метрам)
function ear(x, z, range) {
  const cam = camera.position,
    dx = x - cam.x,
    dz = z - cam.z,
    d = Math.hypot(dx, dz),
    rx = Math.cos(runner.yaw) * dx - Math.sin(runner.yaw) * dz;
  return [rx / Math.max(1, d), clamp(1 - d / range, 0, 1)];
}
// есть ли стена между вором и точкой (x, z) — по растру проходимости; звук оттуда глуше
function wallBetween(x, z) {
  const R = level && level.R,
    c = camera.position;
  if (!R) return false;
  const n = Math.ceil(Math.hypot(x - c.x, z - c.z) / 0.3);
  for (let i = 1; i < n; i++) {
    const sx = Math.floor((c.x + ((x - c.x) * i) / n) / W.SUB),
      sz = Math.floor((c.z + ((z - c.z) * i) / n) / W.SUB);
    if (sx < 0 || sz < 0 || sx >= R.NX || sz >= R.NZ) return true;
    if (R.walk[sz * R.NX + sx] !== 1) return true;
  }
  return false;
}
// охранник иногда кашляет, а его рация переговаривается с дежурным
const guardTalk = { next: 0, radio: 0 };
// напряжение: насколько близко ближайший охранник к вору (по логике — одинаково у вора и штурмана)
function tension(r) {
  if (!lv || !sim || sim.caught || sim.won || !playing()) return 0;
  const [tx, tz] =
    r === "nav" ? W.cellXZ(lv, sim.pos) : [runner.pos.x, runner.pos.z];
  let d = 99;
  lv.guards.forEach((_, k) => {
    const [gx, gz] = W.cellXZ(lv, G.guardPos(lv, sim, k, sim.t).i);
    d = Math.min(d, Math.hypot(gx - tx, gz - tz));
  });
  return clamp(1 - (d - 3) / 10, 0, 1);
}
// quiet — без звуков: так мир двигается у штурмана ради камер на мониторах
function updateWorld(now, dt, quiet) {
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
    // сколько раз нога в анимации встала на пол за кадр
    const fall = o.gm
      ? o.gm.update(dt, gi === gCatch ? 0 : Math.max(speed, 0.6))
      : 0;
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
    if (o.spot.castShadow) o.spot.shadow.autoUpdate = near; // погасшему фонарю карта тени не нужна
    o.spot.distance = len + 2;
    // шаги охраны слышны с направлением: когда нога встаёт на пол (стоит на месте или целится — тихо);
    // модели нет — по пройденному пути
    o.walked = (o.walked || 0) + speed * dt;
    const stepNow = o.gm ? fall > 0 && speed > 0.3 : o.walked > 0.7;
    if (stepNow && !quiet) {
      o.walked = 0;
      const dx = o.group.position.x - cam.x,
        dz = o.group.position.z - cam.z,
        dist = Math.hypot(dx, dz);
      const rx = Math.cos(runner.yaw) * dx - Math.sin(runner.yaw) * dz; // проекция на правую руку вора
      A.sfxGuardStep(
        rx / Math.max(1, dist),
        clamp(1 - dist / 14, 0, 1),
        wallBetween(o.group.position.x, o.group.position.z),
      );
    }
  }
  // лазеры и их красный отсвет; с дела №2 вор видит только огоньки излучателей (лучи — у штурмана на схеме)
  const lit = [],
    ghost = lv.L >= 1 && !(mode === "solo" && !blind()) && !sim.caught;
  // гул ближайшего излучателя: с дела №2 гудит всегда, как горят огоньки — по звуку не понять, включён ли луч
  let humD = 99,
    humAt = null;
  const near = (p) => {
    const d = p.distanceTo(cam);
    if (d < humD) ((humD = d), (humAt = p));
  };
  for (const o of L0.lasers) {
    const on = G.laserOn(o.laser, sim.t);
    W.setLaser(o, on, now, ghost);
    if (on && !ghost) lit.push(o);
    if (on || ghost) near(o.world);
  }
  // барьер видно всегда: горит, пока не выключен щитком
  if (L0.gate) {
    W.setGate(L0.gate, !sim.gateOff, now);
    if (!sim.gateOff) for (const p of L0.gate.world) lit.push({ world: p });
    if (!sim.gateOff) L0.gate.world.forEach(near);
  }
  if (humAt && !quiet) {
    const dx = humAt.x - cam.x,
      dz = humAt.z - cam.z,
      rx = Math.cos(runner.yaw) * dx - Math.sin(runner.yaw) * dz; // проекция на правую руку вора
    A.setHum(0.35 * clamp(1 - humD / 7, 0, 1) ** 2, rx / Math.max(1, humD));
  } else A.setHum(0, 0);
  // тиканье ближайших напольных часов
  let ck = null;
  for (const p of L0.clocks)
    if (!ck || p.distanceTo(cam) < ck.distanceTo(cam)) ck = p;
  if (ck && !quiet) {
    const [pan, v] = ear(ck.x, ck.z, 9);
    A.setClock(0.5 * v * v, pan);
  } else A.setClock(0, 0);
  if (!guardTalk.next) {
    guardTalk.next = now + 8000 + Math.random() * 10000;
    guardTalk.radio = now + 25000 + Math.random() * 20000;
  }
  if (
    now > guardTalk.next &&
    L0.guards.length &&
    !sim.caught &&
    !sim.won &&
    !quiet
  ) {
    const radio = now > guardTalk.radio,
      o = L0.guards[Math.floor(Math.random() * L0.guards.length)],
      [pan, v] = ear(o.group.position.x, o.group.position.z, 16);
    guardTalk.next = now + 15000 + Math.random() * 20000;
    if (radio) guardTalk.radio = now + 50000 + Math.random() * 40000;
    A.sfxGuardSay(
      radio ? "radio_talk" : "cough" + (1 + Math.floor(Math.random() * 3)),
      pan,
      v * (radio ? 0.6 : 0.5),
      wallBetween(o.group.position.x, o.group.position.z),
    );
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
  for (const o of L0.cams) {
    const look = sim.camOff ? -1 : G.camState(o.cam, sim.t);
    W.setCamera(o, look, dt);
    if (o.looked != null && o.looked !== look && !quiet) {
      const p = o.group.position,
        dx = p.x - cam.x,
        dz = p.z - cam.z,
        dist = Math.hypot(dx, dz),
        rx = Math.cos(runner.yaw) * dx - Math.sin(runner.yaw) * dz;
      A.sfxServo(
        rx / Math.max(1, dist),
        clamp(1 - dist / 12, 0, 1),
        wallBetween(p.x, p.z),
      );
    }
    o.looked = look;
  }
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
    if (l.castShadow) l.shadow.autoUpdate = l.intensity > 0; // погасшей лампе карта тени не нужна
  });
  W.tickWindows(now / 1000, bolt.f);
  if (L0.cctv && L0.cctv.box)
    L0.cctv.box.tick(now, !!sim.plugged, !!sim.camOff);
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
// фонарик барахлит (с дела №7, как в 2D): раз в 9–19 секунд гаснет на 1–2 секунды, иногда вспыхивает.
// Видит только вор, в логику не входит. -1 — горит как обычно
// погода дела: окна особняка, окно фургона, улица в сценках и фон (одна у обоих игроков)
let weather = "rain";
function applyWeather() {
  const w = lv ? W.weatherOf(lv.L) : "rain";
  if (w === weather && applyWeather.done) return;
  applyWeather.done = true;
  weather = w;
  W.setWeatherWindows(w);
  cuts.weather = w;
  if (van) {
    const fx = W.weatherFx(w);
    van.rain.uniforms.wet.value = fx.wet;
    van.rain.uniforms.snow.value = fx.snow;
  }
}
// гроза: молния у вора и штурмана в одно время — окна по 20 с от часов компьютера, момент в окне берётся от кода дела;
// две короткие вспышки, гром через 0,3–2,5 с
const bolt = { win: -1, atMs: 0, thunder: 0, fired: true, at: -1e9, f: 0 }; // f — яркость вспышки 0..1
function lightning(now, on) {
  if (!on) return 0;
  const s = src(),
    ms = Date.now(),
    win = Math.floor(ms / 20000);
  if (win !== bolt.win) {
    bolt.win = win;
    const h = G.hashStr((s ? s.code + "|" + s.lvl : "") + "|" + win) >>> 0;
    bolt.atMs = win * 20000 + 2000 + (h % 15000);
    bolt.thunder = 0.3 + ((h >>> 12) % 2200) / 1000;
    bolt.fired = h % 5 === 0; // примерно каждое пятое окно без молнии
  }
  if (!bolt.fired && ms >= bolt.atMs) {
    bolt.fired = true;
    if (ms - bolt.atMs < 1000) {
      bolt.at = now - (ms - bolt.atMs);
      A.sfxThunder(bolt.thunder);
    }
  }
  const k = (now - bolt.at) / 1000;
  if (k > 0.7) return 0;
  return k < 0.08
    ? 1
    : k < 0.18
      ? 0.15
      : k < 0.26
        ? 0.8
        : 0.8 - (k - 0.26) * 1.8;
}
// батарейки фонарика: заряд 0..100, запасных 2 на попытку; swapUntil — до какого времени идёт замена
const bat = { key: "", charge: 100, spare: 2, swapUntil: 0 };
function updateBattery(dt, now, on) {
  const s = src(),
    k = s ? s.code + "|" + s.lvl + "|" + (s.att | 0) : "";
  if (k !== bat.key) {
    // новая попытка: с дела №9 (батарейки подсели) — 40%, иначе полные
    bat.key = k;
    bat.charge = lv.vis < 2 ? 40 : 100;
    bat.spare = 2;
    bat.swapUntil = 0;
  }
  if (bat.done && now >= bat.swapUntil) {
    bat.done = false;
    bat.charge = 100;
  }
  if (lv.flicker && on && playing())
    bat.charge = Math.max(5, bat.charge - dt * 0.55);
}
function swapBattery(now) {
  if (now < bat.swapUntil) return;
  if (!bat.spare) return toast("🔋 Запасных батареек больше нет");
  if (bat.charge >= 90) return toast("🔋 Батарейки ещё свежие");
  bat.spare--;
  bat.swapUntil = now + 2000;
  bat.done = true;
  A.sfxBattery();
}
const flick = { next: 0, until: 0 };
let hemiBase = 0.35;
function flashFlicker(now, on) {
  if (!on) {
    flick.next = 0;
    return -1;
  }
  if (!flick.next) flick.next = now + 9000 + Math.random() * 9000;
  if (now > flick.next) {
    flick.until = now + 900 + Math.random() * 900;
    flick.next = flick.until + 9000 + Math.random() * 10000;
    if (!sim || !sim.hidden) A.sfxFlicker((flick.until - now) / 1000);
  }
  return now < flick.until ? (Math.random() < 0.15 ? 0.35 : 0) : -1;
}
let last = performance.now(),
  fpsN = 0,
  fpsT = 0,
  fpsV = 0;
// модели и текстуры здания: первым делом — то, что нужно сейчас, остальные здания — в фоне после запуска
function ensureTheme(id) {
  return Promise.all([W.loadLook(renderer, id), P.loadThemeProps(id)]);
}
async function prefetchThemes() {
  for (const id of ["museum", "bank", "jewelry", "office"])
    await ensureTheme(id);
}
// здание догрузилось — уровень собирается заново (обычно это успевает случиться на брифинге или в сценке)
function rebuildPartial() {
  if (!level || !level.partial || runner.closeup) return;
  // посреди попытки не трогаем: сбросились бы набранный код и провода щитка, а у новой модели свой упор в растре
  // попытка уже началась (есть t0), даже если первый такт ещё не прошёл: после зависания такты догнали бы разом
  const s = src();
  if (sim && (sim.t > 0 || (s && s.t0)) && !sim.caught && !sim.won) return;
  if (!W.lookReady(level.theme) || !P.themePropsReady(level.theme)) return;
  const att = level.att;
  buildLevel(lv);
  if (att != null) attemptProps(att);
  showPanel();
  showCctv();
}
function frame(now) {
  requestAnimationFrame(frame);
  rebuildPartial();
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
  // фон: дождь на улице в сценках, по крыше фургона у штурмана, глухо за окнами у вора
  applyWeather();
  // меню без игры: улица под дождём, фургон у ворот, вор и штурман
  const menuBg = !$("#menu").hidden && !inGame() && !cuts.active;
  document.body.classList.toggle("street-menu", menuBg);
  // музыка — в главном меню, в комнате до «Начинаем», пока строится дело и читают брифинг;
  // «Понял, начинаем» — стихает, идёт сценка (попытка началась — тишина до следующего меню)
  const s0 = src(),
    fresh = !s0 || (!s0.t0 && !s0.log.length);
  A.setMusic(
    !cuts.active &&
      (menuBg ||
        (inGame() && fresh && $("#caught").hidden && $("#won").hidden)),
  );
  // пауза: картинка стоит и размыта (чтобы паузой не пользоваться для подсказок), ничего не рисуем
  const pz = updatePause(now),
    frozen =
      !menuBg &&
      !cuts.active &&
      !!sim &&
      (pz === "full" || (mode === "solo" && inGame() && !$("#menu").hidden));
  document.body.classList.toggle("paused", frozen);
  // музыка таймера: за минуту до конца идущей попытки (не сценка и не итоги). На паузе (и в отсчёте 3-2-1) стихает;
  // конец попытки, «Ещё раз», следующее дело, выход — гаснет, следующая попытка начнёт её с начала
  const tmLeft = timerLeft();
  A.setTimerMusic(
    inGame() &&
      s0 &&
      s0.t0 &&
      sim &&
      !sim.caught &&
      !sim.won &&
      !cuts.active &&
      tmLeft != null &&
      $("#caught").hidden &&
      $("#won").hidden
      ? tmLeft / 1000
      : null,
    frozen || !!pauseAt,
  );
  if (photoWant && lv && !cuts.active && !$("#brief").hidden) takeBriefPhoto();
  if (shotReq && now >= shotReq.at && !frozen && !cuts.active) takeShot();
  A.setAmbience(
    cuts.active || menuBg
      ? "street"
      : !lv
        ? null
        : role() === "nav"
          ? "van"
          : !level || level.theme === "mansion"
            ? "house"
            : level.theme === "office"
              ? "tower"
              : "city",
    weather,
  );
  bolt.f = lightning(
    now,
    weather === "storm" && !frozen && (cuts.active || !!lv), // на паузе грома нет
  );
  cuts.flash = bolt.f;
  if (van) {
    van.rain.uniforms.flash.value = bolt.f;
    van.streetMat.color.setScalar(1 + bolt.f * 2);
  }
  if (cuts.active) {
    crewTags(false);
    cuts.update(dt, canvas.width / Math.max(1, canvas.height));
    cuts.render(renderer, qName === "max" ? 0.6 : 0.45);
    return;
  }
  if (
    menuBg &&
    cuts.menu(
      dt,
      canvas.width / Math.max(1, canvas.height),
      $("#vRoom").hidden ? 0 : 1,
    )
  ) {
    cuts.render(renderer, qName === "max" ? 0.6 : 0.45);
    crewTags(true);
    return;
  }
  crewTags(false);
  if (!lv || !sim || !level) {
    renderer.render(scene, camera);
    return;
  }
  catchUp();
  tickClock();
  if (frozen) {
    // пауза: виолончель, гул лазера и часы стихают
    A.setTension(0);
    A.setHum(0, 0);
    A.setClock(0, 0);
    return;
  }
  advanceTicks();
  const r = role(),
    swapping = now < bat.swapUntil,
    canMove = (r === "runner" || r === "both") && live() && !swapping;
  runner.enabled = canMove;
  runner.closeup = closeup.update(dt, backPose());
  // заряд батареек: с дела №7 садятся (~3 мин от полных), с дела №9 к началу уже наполовину пустые.
  // Ниже 60% фонарик начинает гаснуть на секунду-две, ниже 50% светит тусклее и ближе. Замена (R) — 2 с
  updateBattery(dt, now, canMove && !sim.hidden && !runner.closeup);
  const low = clamp(bat.charge / 50, 0, 1),
    want =
      sim.hidden || swapping
        ? 0
        : runner.closeup
          ? 3.5
          : FLASH * (0.45 + 0.55 * low),
    dying = flashFlicker(
      now,
      lv.flicker && bat.charge < 60 && canMove && !runner.closeup,
    );
  if (dying >= 0) flash.intensity = want * dying;
  else flash.intensity += (want - flash.intensity) * Math.min(1, dt * 6);
  flash.distance = 10 + 8 * low;
  // в укрытии фонарь выключен, зато глаза привыкают к темноте
  hemiBase +=
    ((sim && sim.hidden ? 1.6 : 0.35) - hemiBase) * Math.min(1, dt * 1.5);
  hemi.intensity = hemiBase + bolt.f * 1.5; // молния на миг освещает комнату
  const speed = runner.update(dt, level.R, canMove);
  trackCell();
  tutUpdate(now, dt, canMove ? speed : 0);
  botUpdate(now);
  if (!$("#lapUI").hidden && (!lapDrawn || now - lapDrawn > 100)) {
    lapDrawn = now;
    drawLaptop(lapCv, lapState(now), now);
  }
  updateInteract(canMove);
  A.setTension(tension(r));
  $("#lockHint").hidden = !(canMove && !runner.locked && !runner.closeup);
  $("#vanHint").hidden =
    r !== "nav" || !live() || !!(vanView && vanView.zoomTo);
  // строка клавиш фургона внизу — статус штурмана поднимается над ней (иначе в 2–3 строки он наезжал на клавиши)
  document.body.classList.toggle("vanhint-on", !$("#vanHint").hidden);
  if (r === "nav") {
    // штурман в фургоне: особняк не рисуем, только кабину и схему на планшете;
    // есть камеры — мир всё же двигаем (тихо): его снимают мониторы
    $("#hint").hidden = true;
    if (level.cams.length && sim.camOff) updateWorld(now, dt, true);
    renderVan(now, dt);
    return;
  }
  if (vanView) vanView.active = false;
  if (mode === "online" && r === "runner" && now - lastPose > 300) {
    lastPose = now;
    N.send("pose", {
      yaw: +runner.yaw.toFixed(2),
      x: +runner.pos.x.toFixed(2),
      z: +runner.pos.z.toFixed(2),
    });
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
      showAll: true,
      showThief: true,
      thief: {
        x: W.planCoord(runner.pos.x),
        y: W.planCoord(runner.pos.z),
        yaw: runner.yaw,
      },
      showStart: true,
      start: curStart().s,
      pingUntil,
      blind: blind(),
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
    prefetchThemes();
    const c0 = N.codeFromHash();
    if (c0) tutGate(() => N.joinRoom(c0), c0);
    else openMenu();
  });
// для проверок скриптом (Playwright)
window.__g = {
  get sim() {
    return sim;
  },
  // для проверок: где вор у штурмана (иначе приходит сообщениями pose)
  set thiefAt(v) {
    thiefAt = v;
  },
  // пауза: почему стоим, с какого времени, отсчёт, что с напарником
  get pause() {
    return { why: pauseWhy(), pauseAt, resumeAt, peerPz, sentPz };
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
  get closeup() {
    return closeup;
  },
  G,
  W,
  A, // звук: например, __g.A.timerMusicInfo()
  startSolo,
  setCase,
  pushEv,
  tryEv,
  get src() {
    return src();
  },
  // снимок провала для проверки: kind — guard | cam | laser | gate | time…, вернёт { img, cap }
  failShot: (kind, gk = 0) => takeFailShot({ kind, gk, min: 0 }),
  setQuality: (q) => {
    qName = q;
    applyQuality();
  },
  TICK_MS,
};

/* ======================= крупные планы: дверь, сейф, записка ======================= */
const closeup = new Closeup(camera, canvas);
// у укрытий свой звук (дверца шкафа, портьера), у остального — шорох одежды
closeup.onMove = (bend, kind) => {
  if (kind !== "hide" && role() !== "nav") A.sfxCloth(bend);
};
// вышел из крупного плана (E, Esc, S или сам после сейфа и щитка) — мышь снова ведёт камеру, без лишнего клика.
// Мышь отпустил сам скрипт, поэтому браузер разрешает захватить её снова без клика
closeup.onExit = () => {
  if (!playing() || role() === "nav" || runner.locked) return;
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
};
let codeBuf = "",
  dispBuf = [], // что показать на экране панели (стрелки от лица вора, цвета)
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
  // и дверь хранилища снова закрыта, в растре тоже (кадр откроет её, если по логике попытки она открыта)
  if (L0.door && L0.doorFree) {
    L0.doorFree = false;
    L0.doorAng = 0;
    const r = cellRect(L0.lv, L0.lv.door);
    W.blockRect(L0.R, r[0], r[1], r[2], r[3], 2);
  }
  if (L0.safe && cur.safe) {
    if (L0.safe.panel) {
      L0.safe.group.remove(L0.safe.panel.group);
      disposePanel(L0.safe.panel.group);
    }
    const p = makeSafePanel(cur.safe.shown, cur.safe.maxStrikes);
    p.group.position.copy(L0.safe.padLocal);
    p.group.rotation.y = Math.PI;
    L0.safe.group.add(p.group);
    L0.safe.panel = p;
  }
  if (L0.note && cur.door) {
    if (L0.note.card) {
      L0.note.group.remove(L0.note.card.mesh);
      disposePanel(L0.note.card.mesh);
    }
    const d = cur.door,
      lines =
        d.type === "digits"
          ? [
              "Код двери: цифры серийника",
              d.pos.map((k) => "№" + (k + 1)).join(" "),
              "сам номер знает штурман",
            ]
          : d.type === "colors"
            ? [
                "Фигура для цветного замка",
                G.SHAPES[d.shape][0],
                `(${G.SHAPES[d.shape][1]}) — скажи штурману`,
              ]
            : [
                "Стрелочный замок",
                "Схема " + "АБ"[d.which],
                "схемы у штурмана",
              ];
    const n = makeNote(lines);
    n.mesh.rotation.x = -Math.PI / 2;
    n.mesh.rotation.z = 0.25;
    n.mesh.position.y = 0.746;
    L0.note.group.add(n.mesh);
    L0.note.card = n;
  }
  dispBuf = [];
  if (L0.door && cur.door) {
    if (L0.door.keypad) {
      L0.door.pad.remove(L0.door.keypad.group);
      disposePanel(L0.door.keypad.group);
    }
    L0.door.keypad = makeKeypad(cur.door);
    L0.door.pad.add(L0.door.keypad.group);
  }
  if (L0.panel && cur.panel) {
    if (L0.panel.box) {
      L0.group.remove(L0.panel.box.group);
      disposePanel(L0.panel.box.group);
    }
    const p = makeWirePanel(cur.panel),
      sp = L0.panel.spot;
    p.group.position.set(sp.x, 1.35, sp.z);
    p.group.rotation.y = sp.yaw;
    L0.group.add(p.group);
    L0.panel.box = p;
  }
  if (L0.cctv && cur.cctv) {
    if (L0.cctv.box) {
      L0.group.remove(L0.cctv.box.group);
      disposePanel(L0.cctv.box.group);
    }
    const p = makeCctvBox(cur.cctv, lv.cams.length),
      sp = L0.cctv.spot;
    p.group.position.set(sp.x, 1.45, sp.z);
    p.group.rotation.y = sp.yaw;
    L0.group.add(p.group);
    L0.cctv.box = p;
  }
}
// щиток видеонаблюдения: шнур в порту, экранчик «внешний доступ» / «запись выкл»
function showCctv() {
  const b = level && level.cctv && level.cctv.box;
  if (b && sim) b.setState(!!sim.plugged, !!sim.camOff);
}
// что видно на экране кодовой панели: цифры, стрелки от лица вора или кружки цветов
function showPad() {
  const kp = level && level.door && level.door.keypad,
    d = cur.door;
  if (!kp || !d) return;
  kp.show(Array.from({ length: d.len }, (_, i) => dispBuf[i] ?? null));
}
// щиток после разреза: провода этапа, огоньки ошибок, надпись
function showPanel() {
  const p = level && level.panel && level.panel.box,
    pn = cur.panel;
  if (!p || !pn || !sim) return;
  const k = Math.min(sim.pcut | 0, pn.rounds - 1),
    key = sim.gateOff ? "off" : k;
  if (p.shown !== key) {
    p.shown = key;
    // барьер выключен — последний перерезанный провод висит разрезанным
    if (sim.gateOff) {
      p.setWires(pn.left[pn.rounds - 1], "", pn.cuts[pn.rounds - 1]);
      p.stage.redraw("БАРЬЕР ВЫКЛ", "#39ff88");
    } else
      p.setWires(
        pn.left[k],
        pn.rounds > 1 ? `ЭТАП ${k + 1} ИЗ ${pn.rounds}` : "",
      );
  }
  p.leds.forEach((l, i) =>
    l.material.color.set(i < (sim.pstrikes || 0) ? 0xff2020 : 0x331010),
  );
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
      L0.panel &&
      L0.panel.box &&
      !sim.gateOff &&
      sim.pos === lv.panel &&
      near(L0.panel.box.group, 2.2)
    )
      interact = {
        kind: "panel",
        t: L0.panel.box,
        text: "<b>E</b> — открыть щиток барьера",
      };
    else if (
      L0.cctv &&
      L0.cctv.box &&
      sim.pos === lv.cctv &&
      near(L0.cctv.box.group, 2.2)
    )
      interact = {
        kind: "cctv",
        t: L0.cctv.box,
        text: sim.plugged
          ? "<b>E</b> — посмотреть наклейку щитка"
          : "<b>E</b> — щиток видеонаблюдения",
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
  // в крупном плане — как выйти (у укрытия свой тост)
  const cu =
    closeup.active && !closeup.leaving && closeup.active.kind !== "hide"
      ? closeup.active.kind
      : "";
  hint.classList.toggle("low", !!cu);
  hint.hidden = !interact && !cu;
  if (interact) hint.innerHTML = interact.text;
  else if (cu)
    hint.innerHTML =
      (cu === "note" ? "" : "кликай по кнопкам · ") +
      "<b>E</b> или <b>Esc</b> — назад";
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
    const d = cur.door,
      t = d.type;
    $("#noteA").textContent =
      t === "digits"
        ? "📝 Код двери — цифры серийника под номерами:"
        : t === "colors"
          ? "📝 На записке нарисована фигура:"
          : "📝 Стрелочный замок:";
    $("#noteCode").textContent =
      t === "digits"
        ? d.pos.map((k) => "№" + (k + 1)).join(" ")
        : t === "colors"
          ? G.SHAPES[d.shape][0] + " " + G.SHAPES[d.shape][1]
          : "Схема " + "АБ"[d.which];
    $("#noteB").textContent =
      t === "digits"
        ? "Сам номер знает только штурман"
        : t === "colors"
          ? "Скажи штурману фигуру и цвета ламп на панели"
          : "Схемы у штурмана. Кнопки на панели — от твоего лица";
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
/* ---------- инвентарь вора: заряд фонарика и замена батареек, записка ---------- */
let invKey = "";
function updateInventory() {
  const r = role(),
    show = !!sim && (r === "runner" || r === "both") && playing(),
    swapping = performance.now() < bat.swapUntil,
    pct = Math.round(bat.charge / 5) * 5,
    lowCls = pct < 50 ? " low" : "",
    items = [
      [
        "R",
        `<b class="bat${lowCls}"><b style="width:${swapping ? 0 : pct}%"></b></b>`,
        swapping ? "Меняю…" : `Батарейки ×${bat.spare}`,
        swapping,
      ],
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
  if (pauseAt) return; // на паузе и в отсчёте после неё код не принимается
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
  if (pauseAt) return; // на паузе (и в отсчёте) кнопки панелей не нажимаются
  A.ensureAudio();
  if (t.kind === "door") {
    const kp = level.door.keypad,
      d = cur.door;
    if (btn === "⌫") {
      codeBuf = codeBuf.slice(0, -1);
      dispBuf.pop();
    } else if (codeBuf.length < d.len) {
      if (btn[0] === "a") {
        // стрелки от лица вора: у панели он стоит лицом к двери, код — стороны плана
        const rel = +btn[1],
          face = G.dirOf(lv.W, level.door.outCell, lv.door);
        codeBuf += String((face + rel) % 4);
        dispBuf.push({ a: rel });
      } else if (btn[0] === "c") {
        codeBuf += btn[1];
        dispBuf.push({ c: G.DCOL[+btn[1]][2] });
      } else {
        codeBuf += btn;
        dispBuf.push(btn);
      }
    }
    A.sfxKey();
    showPad();
    if (codeBuf.length === d.len) {
      const v = codeBuf;
      codeBuf = "";
      dispBuf = [];
      setTimeout(() => {
        const was = sim.open;
        handleCode(rid5(), v);
        kp.msg(
          sim.open ? "ОТКРЫТО" : "ОШИБКА",
          sim.open ? "#39ff88" : "#ff4b4b",
        );
        if (sim.open && !was) setTimeout(() => closeup.exit(), 700);
        else setTimeout(showPad, 900);
      }, 250);
    }
  } else if (t.kind === "safe") {
    if (!tryEv("k" + btn)) return;
    const p = level.safe.panel;
    p.leds.forEach((l, i) =>
      l.material.color.set(i < sim.strikes ? 0xff2020 : 0x331010),
    );
    if (sim.gem) setTimeout(() => closeup.exit(), 800);
  } else if (t.kind === "panel") {
    if (!tryEv("c" + btn)) return;
    if (sim.gateOff) setTimeout(() => closeup.exit(), 900);
  } else if (t.kind === "cctv" && btn === "plug") {
    if (tryEv("j")) showCctv();
  }
};
/* ---------- взлом камер: штурман набирает пароль на ноутбуке в фургоне (в тренировке — окно-ноутбук) ---------- */
// проверяет компьютер вора (он пишет события): v — верно, y — ошибка
function hackCheck(val) {
  if (!sim || !cur.cctv || !sim.plugged || sim.camOff) return;
  tryEv(val === cur.cctv.pass ? "v" : "y");
}
const lapSt = { buf: "", msg: "", msgCol: "", msgUntil: 0 },
  lapCv = { g: $("#lapCv").getContext("2d") };
let lapDrawn = 0;
function lapMsg(msg, col, ms = 2600) {
  Object.assign(lapSt, { msg, msgCol: col, msgUntil: performance.now() + ms });
}
// что показывает программа на экране ноутбука
function lapState(now) {
  if (lapSt.msg && now > lapSt.msgUntil) lapSt.msg = "";
  const has = !!lv && lv.cctv >= 0 && !!sim;
  return {
    mode: !has ? "none" : sim.camOff ? "ok" : sim.plugged ? "on" : "off",
    buf: lapSt.buf,
    msg: lapSt.msg,
    msgCol: lapSt.msgCol,
    cams: lv ? lv.cams.length : 0,
    strikes: has ? sim.hstrikes | 0 : 0,
  };
}
// ноутбук перед глазами: штурман приблизил его экран или в тренировке открыто окно
function lapActive() {
  if (!lv || !sim) return false;
  if (!$("#lapUI").hidden) return true;
  return (
    role() === "nav" &&
    !!van &&
    !!vanView &&
    vanView.zoomTo === 1 &&
    vanView.focus === van.lapScr
  );
}
function hackSubmit() {
  if (!sim.plugged || sim.camOff) return;
  if (lapSt.buf.length !== 4) return lapMsg("ПАРОЛЬ — 4 ЦИФРЫ", "#ffb35a");
  const val = lapSt.buf;
  lapSt.buf = "";
  lapMsg("ПРОВЕРКА…", "#7dffa8", 5000);
  if (amWriter()) hackCheck(val);
  else {
    const s = src();
    N.send("hack", { lvl: s.lvl, att: s.att, val });
    // ответ — событие v или y от вора; нет его за 4 с (вор на паузе, сообщение потерялось) — сказать
    const hs = sim.hstrikes | 0;
    clearTimeout(lapSt.wait);
    lapSt.wait = setTimeout(() => {
      if (
        lapSt.msg === "ПРОВЕРКА…" &&
        sim &&
        sim.plugged &&
        !sim.camOff &&
        (sim.hstrikes | 0) === hs
      )
        lapMsg("НЕТ ОТВЕТА — ВВЕДИ ЕЩЁ РАЗ", "#ffb35a", 4000);
    }, 4000);
  }
}
// клавиатура ноутбука: цифры, Backspace, Enter. Перехватываем раньше всех: у вора 3 и 4 — батарейки и записка,
// у штурмана 1–3 — планшет, папка, ноутбук
addEventListener(
  "keydown",
  (e) => {
    if (!lapActive() || !live() || (e.target && e.target.tagName === "INPUT"))
      return;
    let used = true;
    if (/^(Digit|Numpad)\d$/.test(e.code)) {
      if (sim.plugged && !sim.camOff && lapSt.buf.length < 4) {
        lapSt.buf += e.code.slice(-1);
        A.sfxLapKey();
      }
    } else if (e.code === "Backspace") {
      lapSt.buf = lapSt.buf.slice(0, -1);
      A.sfxLapKey();
    } else if (e.code === "Enter" || e.code === "NumpadEnter") {
      A.sfxLapKey();
      hackSubmit();
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopImmediatePropagation();
      lapDrawn = 0; // перерисовать сразу
    }
  },
  { capture: true },
);
$("#lapClose").addEventListener("click", () => ($("#lapUI").hidden = true));
addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.repeat) return; // удержание клавиши: E не закрывает крупный план, R не тратит вторую батарейку
  if (e.code === "KeyE") {
    if (closeup.active && !closeup.leaving) {
      if (closeup.active.kind === "hide") tryEv("u");
      closeup.exit();
      return;
    }
    if (interact && live()) {
      if (interact.kind === "hide" && !tryEv("h")) return;
      closeup.enter(Object.assign({ kind: interact.kind }, interact.t));
      if (interact.kind === "note") tryEv("n");
      if (interact.kind === "door") showPad();
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
  // R (или 3) — заменить батарейки: вор 2 с стоит, фонарь выключен
  if (
    (e.code === "KeyR" || e.code === "Digit3") &&
    sim &&
    live() &&
    role() !== "nav" &&
    !closeup.active
  )
    swapBattery(performance.now());
  if (
    e.code === "Digit4" &&
    role() !== "nav" &&
    hasNote() &&
    !sim.open &&
    live()
  ) {
    noteOpen = !noteOpen;
    A.sfxNote(0, !noteOpen);
  }
});

/* ======================= папка штурмана (из 2D) ======================= */
const DOCN = {
  memo: "Памятка",
  guards: "Охрана",
  door: "Дверь",
  safe: "Сейф",
  panel: "Щиток",
  cctv: "Камеры",
};
const DCOL_NAME = (c) => G.DCOL[c][0] + " " + G.DCOL[c][1];
let docTab = "memo",
  lastDocHtml = "",
  docSeen = {};
function docHtml(id, want) {
  const L = lv.L;
  if (id === "memo")
    return `<h3>📋 Памятка штурмана</h3><ul>
    <li>Схема показывает мир <b>на такт вперёд</b>: где охрана будет после следующего шага. Лазеры и камеры — <b>как сейчас</b>, как у вора. ${lv.hide ? "<b>Охрана в тени:</b> на плане только маршруты, где охранники — во вкладке «Охрана»." : "Бледный 💂 — где он сейчас."} Такт — чуть больше секунды, охрана шагает сама.</li>
    <li>Вор <b>видит</b> охранника, если тот перед ним, но не знает, куда охранник свернёт. ${lv.L >= 1 ? "<b>Лучей лазеров вор не видит</b> — только огоньки на стойках: горит ли луч, знаешь только ты. " : ""}Зону обзора камер он не видит. Говори ему «стой… жди такт… пошёл».</li>${lv.guards.length ? `<li>${lv.hide ? "Охранник иногда сворачивает с маршрута: заглядывает в соседнюю комнату или идёт на шум — когда, смотри во вкладке «Охрана»." : `<b style="color:#FFA640">!</b> и оранжевый пунктир — охранник скоро свернёт с маршрута: заглянет в соседнюю комнату или пойдёт на шум.`} Обычные шаги вора охрана слышит на ${G.HEAR} клетки по проходам, а когда он крадётся (Shift), не слышит. Охранник рядом — скажи «крадись».</li>` : ""}${(lv.hides || []).length ? `<li><b style="color:#AA78FF">Ш</b> — шкаф, <b style="color:#AA78FF">П</b> — портьера: вор прячется клавишей E, пока он там, охрана и камеры его не видят.</li>` : ""}
    <li>Вор ходит свободно и смотрит мышью, поэтому <b>спрашивай, куда он смотрит</b>, и говори «налево/направо» от его лица.</li>
    <li>Значок ориентира прижат к той стороне стены, где он висит (светлая черта): <b>с другой стороны стены его нет</b>. Видит вор картину — он в той комнате, куда она смотрит.${lv.L >= 2 ? " Ориентиры бывают одинаковые — спроси, что ещё рядом." : ""}</li>
    <li><b style="color:#C4302B">━</b> лазер горит всегда · <b style="color:#B0158C">━</b> мигает через такт (пунктир — выключен прямо сейчас: вору можно идти, пока не загорелся).</li>
    <li>💂 видит на ${lv.vr} клетки вперёд, 📹 — до ${lv.camr}: камера поворачивается между двумя проходами — 2 такта прямо, 2 такта в боковую дверь (оранжевая зона на схеме — куда смотрит прямо сейчас). Номер камеры — как у монитора. Вор видит, куда повёрнута её голова, но не знает, как далеко она видит.</li>
    ${lv.stains.length ? "<li>☕ Под пятном план не виден — спрашивай вора.</li>" : ""}
    <li>Штрафы таймера: неверный код −10 с, сейф −15 с, щиток −20 с.</li>
    <li>📡 Пеленг — красная кнопка у рации: ${lv.pings ? `показывает вора на 3 секунды (${lv.pings} за попытку)` : "на этом деле его нет"}.</li></ul>`;
  if (id === "guards") {
    if (!lv.hide)
      return `<h3>💂 Охрана</h3><p>Охранники и камеры видны на плане. Охранник видит на <b>${lv.vr}</b> клетки вперёд (туда, куда идёт), камера — на <b>${lv.camr}</b>. Стрелка — куда охранник шагнёт дальше. Охрана шагает сама, раз в такт.</p>`;
    return `<h3>💂 Расписание охраны</h3><p class="warn">Где охрана сейчас, на плане НЕ видно — только маршруты!</p>
      <p>Маршрут — оранжевые точки: кружок с номером — клетка 1, квадратик — последняя. Охранник ходит туда-обратно, по клетке за такт, смотрит туда, куда идёт, и видит на <b>${lv.vr}</b> клетки. Пунктир от края маршрута — куда он иногда заглядывает (соседняя комната), а услышав шаги вора, идёт на шум.</p>
      <table><tr><th>№</th><th>Где будет в следующем такте</th><th>Идёт</th></tr>${lv.guards
        .map((gd, i) => {
          // с заходами в соседнюю комнату и походами на шум — как в игре
          const n = gd.path.length,
            k = gd.path.indexOf(G.guardPos(lv, sim, i, sim.t + 1).i),
            k2 = gd.path.indexOf(G.guardPos(lv, sim, i, sim.t + 2).i);
          const where =
              k >= 0 ? `клетка <b>${k + 1}</b> из ${n}` : "<b>вне маршрута</b>",
            goes =
              k < 0
                ? k2 >= 0
                  ? "возвращается на маршрут"
                  : "заглянул в сторону или идёт на шум"
                : k2 < 0
                  ? "<b>сворачивает с маршрута!</b>"
                  : k2 > k
                    ? "к ■ концу"
                    : k2 < k
                      ? "к кружку " + (i + 1)
                      : "стоит";
          return `<tr><td>${i + 1}</td><td>${where}</td><td>${goes}</td></tr>`;
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
      <p>Какая схема — написано на записке 📝 у вора. <span class="warn">У вора кнопки «вперёд / вправо / назад / влево» от его лица!</span> У панели он стоит лицом к двери хранилища: «вперёд» — в сторону двери на плане. Переведи. Ошибка — −10 с.</p>${st}`;
  }
  if (id === "safe") {
    const sf = cur.safe;
    return `<h3>🔐 Сейф</h3><p>У вора <b>6 символов</b>, два из них — обманки. Найди столбик, где есть <b>4</b> из них, и скажи порядок <b>сверху вниз</b>${L >= 5 ? ' — <span class="warn">а если у вора лампа КРАСНАЯ, то снизу вверх</span>' : ""}. Кнопки у вора пронумерованы 1–6. Значки похожи друг на друга — уточняй мелочи: куда загнут крючок, есть ли точка, черта, кружок. Ошибка −15 с, ${sf.maxStrikes} ошибки — тревога.</p>
      <div class="mcols glyph">${sf.cols.map((col, c) => `<div class="mcol"><em>${c + 1}</em>${col.map((g) => `<i>${glyphSVG(g)}</i>`).join("")}</div>`).join("")}</div>
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
  if (id === "cctv") {
    const st = sim.camOff
      ? "Доступ получен, камеры выключены."
      : sim.plugged
        ? `Вор подключился — набирай пароль на ноутбуке.${sim.hstrikes ? ` Ошибок: ${sim.hstrikes} из 2.` : ""}`
        : "Ноутбук ждёт, пока вор воткнёт шнур в щиток 📟.";
    return `<h3>📟 Щиток видеонаблюдения</h3><p>Одна камера смотрит в проход <b>всегда</b> (на плане её обзор не гаснет). Выключить её можно только взломом: вор находит щиток 📟 и втыкает шнур, а ты на ноутбуке вводишь пароль. Тогда <b>все камеры</b> выключатся до конца попытки, а на мониторах появится видео из здания.</p>
      <p>На щитке наклейка: <b>модель</b> и <b>серийный номер</b> из 6 цифр — спроси у вора. Пароль — 4 цифры, по правилу модели:</p>
      <div class="rule"><ol>
        <li><b>VX-480</b> — последние 4 цифры серийного номера задом наперёд.</li>
        <li><b>HK-21</b> — первые 4 цифры, к каждой прибавь 1 (9 становится 0).</li>
        <li><b>DS-7200</b> — 1-я, 3-я, 5-я и последняя цифры.</li>
        <li><b>ZT-9</b> — сумма всех шести цифр (двумя цифрами, например 07) и две последние цифры.</li>
      </ol></div>
      <p><b>Пароль набирай на ноутбуке</b> справа на столе: клик по нему или клавиша <b>3</b>, цифры — с клавиатуры, <b>Enter</b> — войти, Esc — отъехать.</p>
      <p class="warn">Неверный пароль −15 с, вторая ошибка — тревога.</p>
      <p><b>${st}</b></p>${want.cctv ? '<div class="state">Вор у щитка видеонаблюдения!</div>' : ""}`;
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
  if (lv.cctv >= 0) list.push({ id: "cctv", icon: "📟" });
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
  lastPose = 0,
  thiefAt = null; // где вор (по сообщениям pose): штурман видит его на камерах после взлома
function hideOverlays(keepBrief) {
  $("#caught").hidden = true;
  $("#won").hidden = true;
  if (!keepBrief) $("#brief").hidden = true;
}
function resetGame(m) {
  A.sfxCutStop();
  A.sfxAlarmStop();
  mode = m;
  lv = null;
  sim = null;
  lvKey = "";
  briefedKey = "";
  peerPz = 0;
  linkUp = null; // новая комната: первое подключение — без щелчка рации
  lapSt.buf = "";
  $("#lapUI").hidden = true;
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
    caseName: (n) => CASE_TITLES[n] || "",
    handleCode,
    hack: hackCheck,
    checkPeerBuild: (v) => {
      if (v && v !== BUILD) {
        $("#updateText").textContent =
          "У напарника другая версия игры. Обновите страницу у обоих";
        $("#update").hidden = false;
      }
    },
    pose: (m) => {
      if (typeof m.yaw === "number") thiefYaw = m.yaw;
      if (typeof m.x === "number" && typeof m.z === "number")
        thiefAt = { x: m.x, z: m.z, at: performance.now() };
    },
    // напарник открыл или закрыл меню; вор после паузы прислал сдвинутое начало попытки
    pz: (from, on, t0, lvl, att) => {
      const r = N.net.room;
      if (!r || from === N.myId || !r.seats.includes(from)) return;
      peerPz = on;
      if (
        t0 &&
        r.seats[N.thiefSeat(r)] === from &&
        r.lvl === lvl &&
        r.att === att
      )
        r.t0 = t0;
    },
    myPz,
    roles: () => {
      if (lv && !$("#brief").hidden) showBrief();
      if (lv && sim) ui();
      // сообщение — только когда роль правда сменилась
      const r = N.net.room && N.mySeat() >= 0 ? role() : null;
      if (r && roleSeen && r !== roleSeen)
        toast(r === "runner" ? "🥷 Теперь ты — вор" : "🗺️ Теперь ты — штурман");
      roleSeen = r;
    },
  },
  BUILD,
  toast,
);
$("#btnUpdate").addEventListener("click", () => location.reload());

/* ======================= фургон штурмана ======================= */
let lastPlan = 0,
  lastClock = "",
  lastZoom = null;
function ensureVan() {
  if (van) return;
  van = buildVan(P.radioModel(), P.laptopModel());
  if (level) vanStreet(level.theme);
  applyWeather.done = false; // стекло нового фургона — под погоду дела
  vanView = new VanView(van, canvas);
  vanView.onClick = (k) => {
    A.ensureAudio();
    if (k === "folder") toggleDocs();
    else if (k === "radio") doPing();
    else if (k === "laptop") openLaptop();
  };
  vanView.onPlan = planClick;
  resize();
}
// ноутбук: штурман наезжает на экран (пароль — с клавиатуры), в тренировке — окно-ноутбук
function openLaptop() {
  if (role() === "nav" && van && van.lapScr) {
    toggleDocs(false);
    vanView.look(van.lapScr);
  } else if (lv && lv.cctv >= 0) $("#lapUI").hidden = false;
}
function doPing() {
  if (pingLeft <= 0 || !sim || sim.caught || sim.won) {
    toast(pingLeft <= 0 ? "Пеленг кончился" : "Сейчас нельзя");
    A.sfxPingFail(); // кнопка щёлкнула впустую
    return;
  }
  pingLeft--;
  store.set("ping", { k: pingKey, n: pingLeft });
  pingUntil = performance.now() + 3000;
  setTimeout(A.sfxPingEnd, 3000);
  A.sfxPingRadar();
  van.pingBtn.position.y -= 0.01;
  setTimeout(() => (van.pingBtn.position.y += 0.01), 150);
}
function toggleDocs(on) {
  const d = $("#docs"),
    was = d.hidden;
  d.hidden = on == null ? !d.hidden : !on;
  if (was !== d.hidden) A.sfxFolder(); // папка открылась или закрылась — шелест бумаги
  if (!d.hidden) {
    lastDocHtml = "";
    ui();
  }
}
$("#btnDocsClose").addEventListener("click", () => toggleDocs(false));
$("#docTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (docTab !== b.dataset.t) A.sfxPage(); // перелистнул страницу
  docTab = b.dataset.t;
  lastDocHtml = "";
  ui();
});
function renderVan(now, dt) {
  ensureVan();
  if (van.radioMissing && P.hasProp("radio")) van.setRadio(P.radioModel()); // рация догрузилась
  if (van.laptopMissing && P.hasProp("laptop")) van.setLaptop(P.laptopModel());
  // у экрана ноутбука печатают — перерисовать сразу, не ждать схему
  if (!lapDrawn && lapActive()) {
    lapDrawn = now;
    drawLaptop(van.lap, lapState(now), now);
  }
  vanView.active = $("#brief").hidden && $("#menu").hidden && !pauseAt;
  vanView.update(dt, now);
  // наклонился к планшету или откинулся назад: скрип кресла, касание экрана
  if (vanView.zoomTo !== lastZoom) {
    if (lastZoom != null) A.sfxTablet(!!vanView.zoomTo);
    lastZoom = vanView.zoomTo;
  }
  // схема на планшете: 8 раз в секунду хватает, а видеокарте легче
  if (now - lastPlan > 120) {
    lastPlan = now;
    drawFeeds(van, now);
    drawLaptop(van.lap, lapState(now), now);
    const { g, cv, tex } = van.plan;
    const [x, z] = W.cellXZ(lv, sim.pos);
    drawPlan(g, cv.width, cv.height, {
      lv,
      sim,
      now,
      showGuards: true,
      showThief: !!(sim.caught || sim.won),
      thief: { x: W.planCoord(x), y: W.planCoord(z), yaw: thiefYaw },
      showStart: lv.L === 0 && tutKind() !== "nav",
      start: curStart().s,
      pingUntil,
      blind: blind(),
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
  liveFeeds(now);
  renderer.render(van.scene, van.cam);
}
/* ---------- мониторы в фургоне: живая картинка с камер наблюдения особняка (с дела №5) ---------- */
// Камера №n снимает дом из своей головы (она поворачивается по тактам, как в игре) в маленькую текстуру
// на n-м мониторе — 10 кадров в секунду на все камеры (3–10 на каждую), как настоящая охрана. ИК-подсветка: дом светлее, картинка зелёная,
// с шумом и строками. Вора на записи нет: попал в кадр — это и так тревога. Остальные мониторы — улица
const feedCam = new THREE.PerspectiveCamera(72, 4 / 3, 0.06, 24),
  feedTurn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI,
  );
let feedAt = 0,
  feedNext = 0,
  feedThief = null, // вор на записи камер: модель стоит в доме только на время кадра камеры
  feedThiefT = 0;
// вор там, где он сейчас (по сообщениям pose от его компьютера); идёт — шагает, стоит — замер. В укрытии не виден
function feedThiefShow(now) {
  if (!thiefAt || !GD.guardReady()) return;
  if (!feedThief) {
    feedThief = GD.makeThiefModel();
    if (!feedThief) return;
    scene.add(feedThief.model, ...feedThief.extra);
    feedThief.play("walk");
    feedThief.p = new THREE.Vector3(thiefAt.x, 0, thiefAt.z);
  }
  const dt = Math.min(0.3, (now - feedThiefT) / 1000),
    p = feedThief.p,
    dx = thiefAt.x - p.x,
    dz = thiefAt.z - p.z,
    moving = Math.hypot(dx, dz) > 0.08;
  feedThiefT = now;
  p.x += dx * Math.min(1, dt * 5);
  p.z += dz * Math.min(1, dt * 5);
  feedThief.model.position.copy(p);
  feedThief.model.rotation.y = thiefYaw + Math.PI;
  feedThief.model.visible = !sim.hidden;
  feedThief.update(moving ? dt : 0);
}
function feedMaterial(f) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: f.rt.texture },
      over: { value: f.tex },
      time: { value: 0 },
    },
    vertexShader:
      "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D map, over;
      uniform float time;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float l = dot(texture2D(map, vUv).rgb, vec3(0.3, 0.59, 0.11));
        l = pow(1.0 - exp(-l * 3.0), 0.85);                                  // ИК: тёмное вытянуто
        l += (hash(floor(vUv * vec2(320.0, 240.0)) + fract(time * 7.0)) - 0.5) * 0.12; // шум матрицы
        l *= 0.86 + 0.14 * sin(vUv.y * 600.0);                                // строки
        float band = fract(vUv.y * 0.6 - time * 0.11);                        // бегущая полоса
        l += smoothstep(0.0, 0.05, band) * smoothstep(0.12, 0.05, band) * 0.06;
        vec2 d = vUv - 0.5;
        l *= 1.0 - dot(d, d) * 1.2;                                           // виньетка
        vec3 c = vec3(0.6, 1.0, 0.66) * l + vec3(0.015, 0.03, 0.02);
        vec4 o = texture2D(over, vUv);                                        // надписи: КАМ, время, REC
        gl_FragColor = vec4(mix(c, o.rgb, o.a), 1.0);
      }`,
  });
}
function liveFeeds(now) {
  const cams = (level && level.cams) || [];
  for (const f of van.feeds) {
    const want = !!cams[f.i] && !!sim && !!sim.camOff; // видео — только после взлома щитка
    if (want === !!f.live) continue;
    f.live = want;
    if (want) {
      if (!f.rt) {
        f.rt = new THREE.WebGLRenderTarget(400, 300);
        f.liveMat = feedMaterial(f);
        f.mat0 = f.scr.material;
      }
      f.scr.material = f.liveMat;
    } else f.scr.material = f.mat0;
  }
  // у планшета мониторов не видно — не снимаем; приближен монитор — снимаем только его
  const vv = vanView,
    on = Math.min(3, cams.length);
  if (!on || !sim || !sim.camOff) return; // до взлома мониторы показывают улицу
  if (now - feedAt < 100 || (vv.zoom > 0.6 && !vv.focus)) return;
  feedAt = now;
  let i = feedNext++ % on;
  if (vv.focus && vv.zoom > 0.6) {
    const k = van.feeds.findIndex((f) => f.scr === vv.focus);
    if (k >= 0 && k < on) i = k;
  }
  const o = cams[i],
    f = van.feeds[i];
  feedThiefShow(now);
  o.pivot.updateWorldMatrix(true, false);
  feedCam.position.set(0, 0, 0.26); // чуть впереди объектива
  o.pivot.localToWorld(feedCam.position);
  o.pivot.getWorldQuaternion(feedCam.quaternion).multiply(feedTurn);
  feedCam.updateMatrixWorld();
  // ИК-прожектор у объектива: фонарь вора (он висит на camera) на время кадра переносим в камеру
  // наблюдения — свет с её стороны и честные тени; плюс слабая ровная подсветка, чтобы углы не тонули
  const p0 = camera.position.clone(),
    q0 = camera.quaternion.clone(),
    f0 = flash.intensity,
    d0 = flash.distance;
  camera.position.copy(feedCam.position);
  camera.quaternion.copy(feedCam.quaternion);
  camera.updateMatrixWorld();
  flash.intensity = FLASH * 1.6;
  flash.distance = 22;
  irLight.intensity = 0.45;
  renderer.setRenderTarget(f.rt);
  renderer.render(scene, feedCam);
  renderer.setRenderTarget(null);
  irLight.intensity = 0;
  flash.intensity = f0;
  flash.distance = d0;
  camera.position.copy(p0);
  camera.quaternion.copy(q0);
  camera.updateMatrixWorld();
  if (feedThief)
    for (const m of [feedThief.model, ...feedThief.extra]) m.visible = false;
  f.liveMat.uniforms.time.value = now / 1000;
}
