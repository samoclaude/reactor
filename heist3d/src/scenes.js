// Сценки в движке: «приезд» (фургон под дождём, вор выходит к воротам особняка) и «ушли» (вор бежит в фургон, тот уезжает).
// Своя сцена улицы, своя камера; main.js рисует её вместо игры, пока сценка идёт. Пробел, Esc или клик — пропустить.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { glowSprite } from "./world.js";
import { makeThiefModel } from "./guard.js";

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const VAN_Z = -2.2, // фургон стоит на дальней полосе чуть левее ворот
  VAN_X = -3.4,
  GATE_Z = -7.4;
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

export class Cutscenes {
  constructor(fadeEl) {
    this.fade = fadeEl;
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 140);
    this.active = null;
    this.van = null;
  }
  async load() {
    const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const g = await l.loadAsync("assets/models/van_ext.glb");
    this.van = g.scene;
  }
  ready() {
    return !!this.van;
  }
  // улица строится один раз, при первой сценке
  build() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x060a12);
    s.fog = new THREE.FogExp2(0x070b14, 0.03);
    s.add(new THREE.HemisphereLight(0x6a7ca0, 0x15120f, 1.0));
    const moon = new THREE.DirectionalLight(0x8fa6d8, 0.5);
    moon.position.set(-10, 20, 8);
    s.add(moon);
    const std = (color, rough = 0.8, metal = 0) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: metal,
      });
    const box = (w, h, d, m, x, y, z, parent = s) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    // мокрый асфальт, тротуары, газон и дорожка
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 8),
      std(0x111317, 0.28, 0.25),
    );
    road.rotation.x = -Math.PI / 2;
    s.add(road);
    const walk = std(0x2a2b2e, 0.55);
    box(120, 0.15, 3.4, walk, 0, 0.075, -5.7);
    box(120, 0.15, 3.4, walk, 0, 0.075, 5.7);
    box(120, 0.05, 30, std(0x0d1510, 0.95), 0, 0.15, -22.5);
    box(2.2, 0.06, 10.6, std(0x3a3631, 0.9), 0, 0.17, -12.7);
    // разметка
    for (let x = -60; x < 60; x += 6)
      box(3, 0.01, 0.12, std(0x8a8a80, 0.6), x, 0.005, 0);
    // ограда с воротами
    const iron = std(0x0c0d0f, 0.5, 0.6);
    const bars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.03, 1.9, 0.03),
      iron,
      800,
    );
    let n = 0;
    const m4 = new THREE.Matrix4();
    for (let x = -55; x <= 55; x += 0.14) {
      if (Math.abs(x) < 1.5) continue;
      m4.makeTranslation(x, 1.1, GATE_Z);
      bars.setMatrixAt(n++, m4);
    }
    bars.count = n;
    s.add(bars);
    for (const side of [-1, 1]) {
      box(54, 0.05, 0.05, iron, side * 28.6, 1.9, GATE_Z);
      box(54, 0.05, 0.05, iron, side * 28.6, 0.45, GATE_Z);
      box(0.6, 2.5, 0.6, std(0x3b3630, 0.85), side * 1.8, 1.4, GATE_Z);
      const lamp = glowSprite(0xffc070, 0.9, 0.9);
      lamp.position.set(side * 1.8, 2.85, GATE_Z);
      s.add(lamp);
    }
    // особняк: фасад, карниз, крыша, окна (часть горит), портик с колоннами
    const stone = std(0x3b3631, 0.9),
      dark = std(0x0d1016, 0.2, 0.3),
      lit = new THREE.MeshStandardMaterial({
        color: 0x2a1a08,
        emissive: 0xffa850,
        emissiveIntensity: 1.6,
      });
    const H = new THREE.Group();
    H.position.z = -26;
    s.add(H);
    box(30, 9.6, 10, stone, 0, 4.95, 0, H);
    box(31, 0.5, 10.8, std(0x2c2824, 0.8), 0, 9.9, 0, H);
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 6.2, 3.2, 4, 1),
      std(0x1a1d22, 0.7),
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(3.6, 1, 1.25);
    roof.position.set(0, 11.7, 0);
    H.add(roof);
    for (const x of [-9, 9]) box(1, 2.4, 1, stone, x, 12.4, -1.5, H);
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 11; c++) {
        const x = -12.5 + c * 2.5;
        if (r === 0 && Math.abs(x) < 3) continue;
        const on = (r * 11 + c) % 4 === 1;
        box(1.2, 2.2, 0.2, on ? lit : dark, x, 2.6 + r * 3.6, 5.05, H);
        box(1.5, 0.15, 0.35, stone, x, 1.4 + r * 3.6, 5.1, H);
      }
    for (const x of [-2.4, -0.8, 0.8, 2.4]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.32, 5.2, 14),
        std(0x5a544c, 0.8),
      );
      col.position.set(x, 2.9, 7.2);
      H.add(col);
    }
    box(6.4, 0.6, 3, std(0x5a544c, 0.8), 0, 5.8, 7.2, H);
    for (let k = 0; k < 3; k++)
      box(
        6 - k * 0.6,
        0.18,
        1.2 - k * 0.3,
        stone,
        0,
        0.18 + k * 0.18,
        8.4 - k * 0.3,
        H,
      );
    box(1.6, 2.8, 0.2, std(0x1b120c, 0.6), 0, 1.6, 5.05, H);
    const doorGlow = glowSprite(0xffb060, 3, 0.5);
    doorGlow.position.set(0, 4.2, 6.2);
    H.add(doorGlow);
    // фонари вдоль улицы: столб, плафон, свечение; два ближних дают свет
    this.lights = [];
    for (const [x, z] of [
      [-11, -4.4],
      [11, -4.4],
      [-4, 4.4],
      [16, 4.4],
      [-22, 4.4],
    ]) {
      box(0.12, 4.6, 0.12, iron, x, 2.3, z);
      box(0.9, 0.08, 0.08, iron, x + (z < 0 ? 0.4 : -0.4), 4.55, z);
      const g = glowSprite(0xffc27a, 2.2, 0.85);
      g.position.set(x + (z < 0 ? 0.8 : -0.8), 4.4, z);
      s.add(g);
    }
    for (const [x, z] of [
      [-10.2, -4.4],
      [10.8, -4.4],
      [-4.8, 4.4],
    ]) {
      const l = new THREE.PointLight(0xffc488, 70, 24, 1.6);
      l.position.set(x, 4.3, z);
      s.add(l);
    }
    // фонарики на столбах ворот светят на тротуар, где выходит вор
    const gl = new THREE.PointLight(0xffc070, 30, 12, 1.6);
    gl.position.set(0, 3.2, GATE_Z + 0.6);
    s.add(gl);
    // дождь: косые штрихи вокруг камеры
    const N = 2600,
      pos = new Float32Array(N * 6);
    this.rainSeed = [];
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 50,
        y = Math.random() * 14,
        z = -14 + Math.random() * 26;
      this.rainSeed.push([x, y, z]);
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    s.add(
      new THREE.LineSegments(
        this.rainGeo,
        new THREE.LineBasicMaterial({
          color: 0x9fb4d4,
          transparent: true,
          opacity: 0.32,
        }),
      ),
    );
    // фургон: сам кузов, дверь и колёса — узлы модели; фары светят вперёд
    this.vanG = new THREE.Group();
    const v = this.van.clone(true);
    v.rotation.y = -Math.PI / 2; // лицом к -X: едет справа налево, правым бортом к особняку
    this.vanG.add(v);
    this.door = v.getObjectByName("door");
    this.door0 = this.door ? this.door.position.clone() : null;
    this.wheels = [0, 1, 2, 3].map((k) => v.getObjectByName("wheel" + k));
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
    this.thief = makeThiefModel();
    if (this.thief) s.add(this.thief.model, ...this.thief.extra);
  }
  // kind: "arrive" | "escape"; done вызывается в конце (или при пропуске)
  play(kind, done) {
    if (!this.van) {
      done();
      return;
    }
    if (!this.scene) this.build();
    this.active = {
      kind,
      t: 0,
      done,
      dur: kind === "arrive" ? 6.2 : 5.2,
      x: 0,
    };
    document.body.classList.add("cut");
    this.fade.style.transition = "none";
    this.fade.style.opacity = 1;
    requestAnimationFrame(() => {
      this.fade.style.transition = "opacity .6s";
      this.fade.style.opacity = 0;
    });
    if (this.thief) {
      this.thief.model.visible = kind === "escape";
      this.thief.play(kind === "arrive" ? "walk" : "run");
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
    const t = a.t;
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    // дождь падает и чуть сносится ветром
    const p = this.rainGeo.attributes.position.array;
    this.rainSeed.forEach((r, i) => {
      r[1] -= dt * 16;
      r[0] -= dt * 2.4;
      if (r[1] < 0) {
        r[1] += 14;
        r[0] = (Math.random() - 0.5) * 50;
      }
      p.set([r[0], r[1], r[2], r[0] + 0.07, r[1] + 0.5, r[2]], i * 6);
    });
    this.rainGeo.attributes.position.needsUpdate = true;
    let vanX, doorK, th;
    if (a.kind === "arrive") {
      // фургон подъезжает справа и тормозит у ворот, дверь отъезжает, вор идёт к воротам
      const k = clamp01(t / 3.0);
      vanX = VAN_X + 29 * (1 - k) * (1 - k);
      doorK = ease(clamp01((t - 3.1) / 0.6));
      th = {
        on: t > 3.5,
        ...along(
          [
            [VAN_X, VAN_Z - 1.2],
            [0.3, GATE_Z + 0.8],
            [0.3, GATE_Z - 4],
          ],
          (t - 3.6) / 2.4,
        ),
      };
      const e = ease(clamp01(t / 6));
      this.cam.position.set(8 - 4 * e, 3.6 - 0.6 * e, 9.5 - 1.5 * e);
      this.cam.lookAt(vanX * 0.35, 1.0, -4.5 - 3 * ease(clamp01((t - 3) / 3)));
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
            [0.3, GATE_Z - 3],
            [0.3, GATE_Z + 0.8],
            [VAN_X, VAN_Z - 1.2],
          ],
          t / 1.5,
        ),
      };
      doorK = 1 - ease(clamp01((t - 1.6) / 0.5));
      const k = clamp01((t - 2.1) / 2.6);
      vanX = VAN_X - 30 * k * k;
      this.cam.position.set(6, 3.2, 8.5);
      this.cam.lookAt(Math.max(vanX, -10) * 0.4, 1.0, -4.2);
      if (t > a.dur - 0.7 && !a.fading) {
        a.fading = true;
        this.fade.style.transition = "opacity .6s";
        this.fade.style.opacity = 1;
      }
    }
    const dx = vanX - this.vanG.position.x;
    this.vanG.position.set(vanX, 0, VAN_Z);
    for (const w of this.wheels) if (w) w.rotation.x -= dx / 0.36;
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
