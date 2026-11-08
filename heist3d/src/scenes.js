// Сценки в движке: «приезд» (фургон под дождём, вор выходит к воротам особняка) и «ушли» (вор бежит в фургон, тот уезжает).
// Своя сцена улицы, своя камера; main.js рисует её вместо игры, пока сценка идёт. Пробел, Esc или клик — пропустить.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { glowSprite } from "./world.js";
import { makeThiefModel, makeCrewModel, guardReady } from "./guard.js";
import { loadStreet, buildStreet, GATE_Z, HOUSE_Z } from "./street.js";

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const VAN_Z = -2.2, // фургон стоит на дальней полосе чуть левее ворот
  VAN_X = -3.4;
// из кадра для досье вырезается середина 4:3; экран уже 4:3 (телефон) — угол шире, чтобы в вырез влезло всё
export const fitFov = (fov, aspect) =>
  aspect >= 4 / 3
    ? fov
    : (2 *
        Math.atan((Math.tan((fov * Math.PI) / 360) * 4) / 3 / aspect) *
        180) /
      Math.PI;
// ракурсы фото объекта для брифинга: [x, y, z камеры, высота взгляда на дом, угол обзора] — «телевик» из фургона
const STILLS = [
  [-6, 1.6, 6, 4.5, 34],
  [1.5, 1.4, 5, 5, 38],
  [4, 1.7, 7.5, 4.2, 30],
];
// у новых зданий свои ракурсы: [x, y, z камеры, куда смотреть x, y, z, угол обзора]
const LOT_STILLS = {
  museum: [
    [-7, 1.5, 4.2, 0, 6.5, -20, 48], // у бордюра: фонарь нашей стороны (x = -4,4, z = 4,55) за спиной, не в кадре
    [3, 1.4, 6, -2, 5.5, -19, 40],
    [9, 1.7, 7.5, 2, 6, -20, 38],
  ],
  bank: [
    [-8, 1.5, 4.2, 0, 7, -8, 54], // у бордюра: фонарь нашей стороны за спиной, иначе столб перечёркивал фото
    [4, 1.4, 6, -1, 6, -8, 44],
    [-2, 1.6, 7.5, 1, 6.5, -8, 46],
  ],
  office: [
    [2, 1.4, 7, 4, 8.5, -16, 50],
    [5, 1.5, 7, 6, 7, -16, 46],
    [0, 1.6, 7.5, 3, 10, -16, 52],
  ],
  jewelry: [
    [-8, 1.5, 4.2, 0, 6.5, -8, 54],
    [4, 1.4, 6, -1, 5.5, -8, 44],
    [-1, 1.6, 7.5, 1, 6, -8, 46],
  ],
};
// точка на ломаной pts через долю пути k (0..1) и направление движения
function along(pts, k) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let left = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const u = seg[i] ? Math.min(1, left / seg[i]) : 0,
        a = pts[i],
        b = pts[i + 1];
      return {
        x: a[0] + (b[0] - a[0]) * u,
        z: a[1] + (b[1] - a[1]) * u,
        yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
    left -= seg[i];
  }
}

// мониторы в фургоне: три «камеры» с зелёной ночной картинкой (коридор, дверь, сейф)
function vanScreens() {
  const cv = document.createElement("canvas");
  cv.width = 384;
  cv.height = 96;
  const g = cv.getContext("2d");
  for (let k = 0; k < 3; k++) {
    const x = k * 128;
    const gr = g.createRadialGradient(x + 64, 48, 4, x + 64, 48, 80);
    gr.addColorStop(0, "#2f8a55");
    gr.addColorStop(1, "#06200f");
    g.fillStyle = gr;
    g.fillRect(x, 0, 128, 96);
    g.strokeStyle = "rgba(160,255,190,0.55)";
    g.lineWidth = 2;
    g.beginPath();
    if (k === 0) {
      // коридор в перспективе
      g.moveTo(x + 10, 90);
      g.lineTo(x + 50, 40);
      g.lineTo(x + 78, 40);
      g.lineTo(x + 118, 90);
      g.moveTo(x + 50, 40);
      g.lineTo(x + 50, 8);
      g.moveTo(x + 78, 40);
      g.lineTo(x + 78, 8);
    } else if (k === 1) {
      g.rect(x + 40, 18, 48, 70);
      g.moveTo(x + 80, 54);
      g.arc(x + 80, 54, 3, 0, 7);
    } else {
      g.rect(x + 34, 22, 60, 60);
      g.moveTo(x + 76, 52);
      g.arc(x + 64, 52, 12, 0, 7);
    }
    g.stroke();
    for (let y = 0; y < 96; y += 3) {
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x, y, 128, 1);
    }
    g.fillStyle = "rgba(200,255,210,0.85)";
    g.font = "bold 11px monospace";
    g.fillText("CAM " + (k + 1), x + 6, 13);
    g.fillStyle = "#ff4040";
    g.beginPath();
    g.arc(x + 118, 9, 3.5, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Cutscenes {
  constructor(fadeEl) {
    this.fade = fadeEl;
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 140);
    this.active = null;
    this.van = null;
    this.weather = "rain"; // 'rain' | 'clear' | 'snow' | 'storm' — ставит main.js по делу
    this.flash = 0; // вспышка молнии 0..1
    this.cues = []; // звуки сценки: [секунда, что сыграть] — ставит main.js после play()
    this.lot = { id: "mansion", name: "" }; // здание дела: ставит main.js при сборке уровня
  }
  // участок улицы под здание дела (в меню — всегда особняк)
  useLot(id) {
    if (!this.street) return;
    const L = id || this.lot.id;
    if (this.street.lotId !== L || (L === this.lot.id && this.street.lot && this.street.lot.signName !== this.lot.name))
      this.street.setLot(L, L === this.lot.id ? this.lot.name : "");
  }
  // вход вора у текущего здания: [x, z] снаружи
  entry() {
    const L = this.street && this.street.lot;
    return L && L.entry ? [L.entry.x, L.entry.z] : [0.3, GATE_Z];
  }
  async load() {
    const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [g, st] = await Promise.all([
      l.loadAsync("assets/models/van_ext.glb"),
      loadStreet(l),
    ]);
    this.streetTex = st;
    this.van = g.scene;
  }
  ready() {
    return !!this.van;
  }
  // улица строится один раз, при первой сценке
  build() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x05070c);
    s.fog = new THREE.FogExp2(0x0a0e16, 0.024);
    // улица целиком: особняк, ограда, фонари, мокрый асфальт, небо, дождь (street.js)
    this.street = buildStreet(s, this.streetTex, this.renderer);
    // свет на вора и штурмана в меню (со стороны камеры), в сценках выключен; заведён сразу, чтобы шейдеры не пересобирались
    this.crewLight = new THREE.PointLight(0xffe2c4, 0, 11, 1.4);
    this.crewLight.position.set(2.6, 2.9, 0.4);
    s.add(this.crewLight);
    // фургон: сам кузов, дверь и колёса — узлы модели; фары светят вперёд
    this.vanG = new THREE.Group();
    const v = this.van.clone(true);
    v.rotation.y = -Math.PI / 2; // лицом к -X: едет справа налево, правым бортом к особняку
    this.vanG.add(v);
    this.door = v.getObjectByName("door");
    this.door0 = this.door ? this.door.position.clone() : null;
    this.wheels = [0, 1, 2, 3].map((k) => v.getObjectByName("wheel" + k));
    // снег на крыше и капоте фургона, мокрый блеск в дождь — как у всей улицы
    v.traverse((o) => {
      if (
        o.isMesh &&
        !/glass|light|screen|led|lamp|amber/.test(o.material.name)
      )
        this.street.weatherize(o.material);
    });
    // задние створки (в меню открыты: внутри рабочее место штурмана) и свет в отсеке
    this.rear = [v.getObjectByName("rear_l"), v.getObjectByName("rear_r")];
    this.vanIn = new THREE.PointLight(0x9fe8c8, 0, 4, 1.5);
    this.vanIn.position.set(0, 1.7, -0.6); // в осях модели: перед +Z, корма -Z
    v.add(this.vanIn);
    v.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === "screen") {
        o.material = o.material.clone();
        o.material.emissiveMap = vanScreens();
        o.material.emissive.set(0xffffff);
        o.material.emissiveIntensity = 1.1;
      }
    });
    for (const sx of [-0.8, 0.8]) {
      const h = new THREE.SpotLight(0xfff0d0, 60, 26, 0.45, 0.6, 1.5);
      h.position.set(-2.6, 0.9, sx);
      h.target.position.set(-12, 0, sx * 1.6);
      this.vanG.add(h, h.target);
      const gl = glowSprite(0xfff3d8, 0.9, 0.9);
      gl.position.set(-2.62, 0.88, sx);
      this.vanG.add(gl);
    }
    s.add(this.vanG);
    this.ensureThief();
  }
  // вор для сценок: модель людей грузится отдельно от улицы (улицу строит уже меню) — создаём, когда готова
  ensureThief() {
    if (this.thief || !this.scene || !guardReady()) return;
    this.thief = makeThiefModel();
    if (this.thief) this.scene.add(this.thief.model, ...this.thief.extra);
  }
  // меню: фургон у ворот, у его кормы вор и штурман, камера медленно плывёт.
  // focus 0..1 — камера подъезжает к ним (выбор ролей). false — улица ещё не загрузилась
  menu(dt, aspect, focus) {
    if (!this.van || !this.streetTex) return false;
    if (!this.scene) this.build();
    // люди грузятся отдельно от улицы: героев создаём, когда модель готова
    if (!this.crew && guardReady()) {
      this.crew = { thief: makeCrewModel("thief"), nav: makeCrewModel("nav") };
      for (const c of Object.values(this.crew))
        if (c) this.scene.add(c.model, ...c.extra);
    }
    if (window.__freeze) dt = 0;
    this.useLot("mansion");
    this.street.weatherAt(0);
    const t = (this.menuT = (this.menuT || 0) + dt);
    this.focus = this.focus || 0;
    this.focus += (focus - this.focus) * Math.min(1, dt * 1.6);
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    this.street.update(dt, this.weather, this.flash);
    this.vanG.position.set(VAN_X, 0, VAN_Z);
    if (this.door) this.door.position.copy(this.door0);
    if (this.thief) this.thief.model.visible = false;
    this.crewLight.intensity = 10 + 6 * this.focus;
    this.rearOpen(1);
    this.street.gateOpen(0);
    // вор и штурман у кормы фургона, повёрнуты к камере
    const spots = { thief: [0.35, -1.25, 0.55], nav: [1.35, -2.05, 0.35] };
    for (const [k, c] of Object.entries(this.crew || {})) {
      if (!c) continue;
      c.model.visible = true;
      c.model.position.set(spots[k][0], 0, spots[k][1]);
      c.model.rotation.y = spots[k][2];
      c.update(dt);
    }
    const f = ease(clamp01(this.focus)),
      sw = Math.sin(t * 0.07),
      bob = Math.sin(t * 0.11) * 0.06;
    const far = [6.2 + sw * 0.7, 1.55 + bob, 6.4 - sw * 0.3],
      near = [5.0 + sw * 0.12, 1.65 + bob * 0.5, 4.3],
      lookFar = [-1.6, 1.9, -4.2],
      lookNear = [-0.3, 1.35, -2.3];
    const L = (a, b) => a.map((v, i) => v + (b[i] - v) * f);
    this.cam.position.set(...L(far, near));
    this.cam.lookAt(...L(lookFar, lookNear));
    // папка меню слева: самое интересное — в правой половине кадра (на узком экране — по центру)
    this.cam.rotateY(aspect > 1.2 ? 0.3 - 0.06 * f : 0);
    return true;
  }
  // фото объекта для брифинга: особняк через дорогу, без фургона и людей, погода — this.weather.
  // v — номер ракурса. Возвращает функцию «вернуть всё как было» (false — улица ещё не загрузилась)
  still(aspect, v = 0) {
    if (!this.van || !this.streetTex) return false;
    if (!this.scene) this.build();
    const hide = [this.vanG, this.thief && this.thief.model];
    for (const c of Object.values(this.crew || {}))
      if (c) hide.push(c.model, ...c.extra);
    const off = hide.filter((o) => o && o.visible);
    for (const o of off) o.visible = false;
    this.useLot();
    this.street.gateOpen(0);
    this.street.update(0, this.weather, 0);
    const fov0 = this.cam.fov,
      ls = LOT_STILLS[this.street.lotId];
    if (ls) {
      const [x, y, z, lx, ly, lz, fov] = ls[v % ls.length];
      this.cam.fov = fitFov(fov, aspect);
      this.cam.position.set(x, y, z);
      this.cam.lookAt(lx, ly, lz);
    } else {
      const [x, y, z, ly, fov] = STILLS[v % STILLS.length];
      this.cam.fov = fitFov(fov, aspect);
      this.cam.position.set(x, y, z);
      this.cam.lookAt(0, ly, HOUSE_Z);
    }
    this.street.weatherAt(this.cam.position.x);
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    return () => {
      for (const o of off) o.visible = true;
      this.cam.fov = fov0;
      this.cam.updateProjectionMatrix();
    };
  }
  // фото на память для итогов дела: вор и штурман у кормы фургона, как в меню, только камера ближе.
  // Возвращает функцию «вернуть всё как было» (false — улица или люди ещё не загрузились)
  crewStill(aspect) {
    if (!this.van || !this.streetTex || !guardReady()) return false;
    if (!this.scene) this.build();
    if (!this.crew) {
      this.crew = { thief: makeCrewModel("thief"), nav: makeCrewModel("nav") };
      for (const c of Object.values(this.crew))
        if (c) this.scene.add(c.model, ...c.extra);
    }
    const objs = [this.vanG, this.thief && this.thief.model];
    for (const c of Object.values(this.crew))
      if (c) objs.push(c.model, ...c.extra);
    const was = objs.filter(Boolean).map((o) => [o, o.visible]),
      vanPos = this.vanG.position.clone(),
      light0 = this.crewLight.intensity,
      fov0 = this.cam.fov;
    this.vanG.visible = true;
    this.vanG.position.set(VAN_X, 0, VAN_Z);
    if (this.door) this.door.position.copy(this.door0);
    if (this.thief) this.thief.model.visible = false;
    this.rearOpen(1);
    this.useLot();
    this.street.weatherAt(0);
    this.street.gateOpen(0);
    this.street.update(0, this.weather, 0);
    this.crewLight.intensity = 16;
    const spots = { thief: [0.35, -1.25, 0.55], nav: [1.35, -2.05, 0.35] };
    for (const [k, c] of Object.entries(this.crew)) {
      if (!c) continue;
      c.model.visible = true;
      for (const o of c.extra) o.visible = true;
      c.model.position.set(spots[k][0], 0, spots[k][1]);
      c.model.rotation.y = spots[k][2];
      c.update(0.016);
    }
    this.cam.fov = fitFov(34, aspect);
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    this.cam.position.set(3.9, 1.55, 3.1);
    this.cam.lookAt(0.6, 1.15, -1.9);
    return () => {
      for (const [o, v] of was) o.visible = v;
      this.vanG.position.copy(vanPos);
      this.crewLight.intensity = light0;
      this.cam.fov = fov0;
      this.cam.updateProjectionMatrix();
    };
  }
  // где на экране головы вора и штурмана: для табличек с именами (0..1 по ширине и высоте)
  crewScreen() {
    const out = {};
    if (!this.crew) return out;
    for (const [k, c] of Object.entries(this.crew || {})) {
      if (!c || !c.head) continue;
      const v = new THREE.Vector3();
      c.head.getWorldPosition(v);
      v.y += 0.38;
      v.project(this.cam);
      out[k] = { x: (v.x + 1) / 2, y: (1 - v.y) / 2, on: v.z < 1 };
    }
    return out;
  }
  // задние створки: k = 0 закрыты, 1 распахнуты; с ними — свет мониторов в отсеке
  rearOpen(k) {
    const [l, r] = this.rear || [];
    if (l) l.rotation.y = -1.85 * k;
    if (r) r.rotation.y = 1.85 * k;
    if (this.vanIn) this.vanIn.intensity = 3.5 * k;
  }
  hideCrew() {
    if (this.crew)
      for (const c of Object.values(this.crew))
        if (c) {
          c.model.visible = false;
          for (const o of c.extra) o.visible = false;
        }
  }
  // кадр: отражение в мокром асфальте и сама улица; mirror — доля разрешения для отражения
  render(renderer, mirror = 0.33) {
    this.street.render(renderer, this.scene, this.cam, mirror);
  }
  // kind: "arrive" | "escape"; done вызывается в конце (или при пропуске)
  play(kind, done) {
    if (!this.van) {
      done();
      return;
    }
    if (!this.scene) this.build();
    this.useLot();
    this.ensureThief();
    this.hideCrew();
    this.crewLight.intensity = 0;
    this.rearOpen(0);
    this.cues = [];
    this.active = {
      kind,
      t: 0,
      done,
      dur: kind === "arrive" ? 6.2 : 5.2,
      x: 0,
    };
    // фургон встаёт напротив входа здания (у особняка — у ворот): вся сценка сдвигается по улице на ox
    // доля пути до входа: калитка (дверь) распахивается, когда вор до неё добегает; по этой секунде и скрип в cutCues
    const [ex, ez] = this.entry(),
      ox = (this.active.ox = ex - 0.3),
      d1 = Math.hypot(ex - (VAN_X + ox), ez + 0.8 - (VAN_Z - 1.2));
    if (this.street) this.street.weatherAt(ox);
    this.active.tGate =
      kind === "arrive"
        ? 3.6 + 2.4 * (d1 / (d1 + 4.8)) - 0.4
        : Math.max(0.05, 1.5 * (3.8 / (d1 + 3.8)) - 0.35);
    document.body.classList.add("cut");
    this.fade.style.transition = "none";
    this.fade.style.opacity = 1;
    requestAnimationFrame(() => {
      this.fade.style.transition = "opacity .6s";
      this.fade.style.opacity = 0;
    });
    if (this.thief) {
      this.thief.model.visible = kind === "escape";
      this.thief.play("run"); // вбегает и выбегает бегом
    }
  }
  skip() {
    if (this.active && this.active.t > 0.3) this.finish();
  }
  finish() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    document.body.classList.remove("cut");
    this.fade.style.transition = "opacity .5s";
    this.fade.style.opacity = 0;
    a.done();
  }
  update(dt, aspect) {
    const a = this.active;
    if (!a) return;
    if (window.__freeze) dt = 0; // для проверок: сценка стоит на месте
    a.t += dt;
    // звук идёт по времени сценки: подвис кадр — звук подождёт вместе с картинкой
    while (this.cues.length && this.cues[0][0] <= a.t) this.cues.shift()[1]();
    const t = a.t;
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    // погода, дождь, брызги, небо — на улице (street.js)
    this.street.update(window.__freeze ? 0 : dt, this.weather, this.flash);
    let vanX, doorK, th;
    const [ex, ez] = this.entry(),
      ox = a.ox || 0,
      VX = VAN_X + ox; // где фургон встаёт у этого здания
    if (a.kind === "arrive") {
      // фургон подъезжает справа и тормозит у ворот, дверь отъезжает, вор идёт к воротам
      const k = clamp01(t / 3.0);
      vanX = VX + 29 * (1 - k) * (1 - k);
      doorK = ease(clamp01((t - 3.1) / 0.6));
      th = {
        on: t > 3.5,
        ...along(
          [
            [VX, VAN_Z - 1.2],
            [ex, ez + 0.8],
            [ex, ez - 4],
          ],
          (t - 3.6) / 2.4,
        ),
      };
      const e = ease(clamp01(t / 6));
      this.cam.position.set(ox + 8 - 4 * e, 3.6 - 0.6 * e, 9.5 - 1.5 * e);
      const fx = ease(clamp01((t - 3) / 3));
      this.cam.lookAt(
        ox + (vanX - ox) * 0.35 * (1 - fx) + (ex - ox) * 0.6 * fx,
        1.0 + Math.max(0, -ez + GATE_Z) * 0.08 * fx, // вход в глубине площади — камера чуть выше
        Math.min(-4.5, ez + 2.9) - 3 * fx,
      );
      if (t > a.dur - 0.7 && !a.fading) {
        a.fading = true;
        this.fade.style.transition = "opacity .6s";
        this.fade.style.opacity = 1;
      }
    } else {
      // вор выбегает из ворот к фургону, дверь закрывается, фургон уезжает влево
      th = {
        on: t < 1.55,
        ...along(
          [
            [ex, ez - 3],
            [ex, ez + 0.8],
            [VX, VAN_Z - 1.2],
          ],
          t / 1.5,
        ),
      };
      doorK = 1 - ease(clamp01((t - 1.6) / 0.5));
      const k = clamp01((t - 2.1) / 2.6);
      vanX = VX - 30 * k * k;
      this.cam.position.set(ox + 6, 3.2, 8.5);
      this.cam.lookAt(ox + Math.max(vanX - ox, -10) * 0.4, 1.0, Math.min(-4.2, ez + 3.2));
      if (t > a.dur - 0.7 && !a.fading) {
        a.fading = true;
        this.fade.style.transition = "opacity .6s";
        this.fade.style.opacity = 1;
      }
    }
    const dx = vanX - this.vanG.position.x;
    this.vanG.position.set(vanX, 0, VAN_Z);
    for (const w of this.wheels) if (w) w.rotation.x -= dx / 0.36;
    // калитка: вор распахивает её, когда добегает (на входе ~4,8 с, на выходе ~0,6 с), скрип — в cutCues
    this.street.gateOpen(
      a.kind === "arrive"
        ? ease(clamp01((t - a.tGate) / 0.5))
        : ease(clamp01((t - a.tGate) / 0.45)),
    );
    if (this.door) {
      // дверь чуть наружу и назад (в осях модели: наружу -X, назад -Z)
      this.door.position.copy(this.door0);
      this.door.position.x -= 0.08 * Math.min(1, doorK * 4);
      this.door.position.z -= 1.1 * doorK;
    }
    if (this.thief) {
      const m = this.thief.model;
      m.visible = th.on;
      m.position.set(th.x, 0.15, th.z);
      m.rotation.y = th.yaw;
      this.thief.update(dt);
    }
    if (t >= a.dur) this.finish();
  }
}
