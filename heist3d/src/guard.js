// Охранник: персонаж и анимации Quaternius (CC0), форма рисуется поверх текстуры тела по костям.
// Ноги — из ходьбы, правая рука держит фонарь (поза Idle_Torch), при поимке — прицел.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";
import { glowSprite } from "./world.js";

let base = null;
const crewBase = {}; // готовые модели вора и штурмана в одежде
const clips = {};
const RIGHT_ARM =
  /^(clavicle_r|upperarm_r|lowerarm_r|hand_r|(index|middle|pinky|ring|thumb)_\d\d(_leaf)?_r)$/;
// доли клипа Walk_Loop, когда пятка встаёт на пол: левая — 0, правая — 0,5.
// Посчитано по костям foot_l/foot_r (240 точек): тут пятка в самой передней точке и ниже не опускается,
// дальше полклипа скользит назад на одной высоте — нога стоит на полу
const STEP_AT = [0, 0.5];

export async function loadGuard() {
  const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [g, a, th, nv] = await Promise.all([
    l.loadAsync("assets/guard/guard.glb"),
    l.loadAsync("assets/guard/anims.glb"),
    // вор и штурман: одежда Quaternius на том же скелете (tools/models/crew.py); не загрузились — будет старый вид
    l.loadAsync("assets/crew/thief.glb").catch(() => null),
    l.loadAsync("assets/crew/nav.glb").catch(() => null),
  ]);
  for (const c of a.animations) clips[c.name] = c;
  for (const [k, gl] of [
    ["thief", th],
    ["nav", nv],
  ]) {
    if (!gl) continue;
    crewBase[k] = gl.scene;
    gl.scene.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
  }
  base = g.scene;
  base.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  paintUniform(base);
  // ходьба без правой руки + правая рука из позы с фонарём
  const part = (clip, keep) =>
    new THREE.AnimationClip(
      clip.name + (keep ? "_arm" : "_body"),
      clip.duration,
      clip.tracks.filter((t) => RIGHT_ARM.test(t.name.split(".")[0]) === keep),
    );
  clips.walkBody = part(clips.Walk_Loop, false);
  clips.torchArm = part(clips.Idle_Torch_Loop, true);
}
export const guardReady = () => !!base;

// форма поверх кожи: зона каждого треугольника — по кости, которая сильнее всех тянет его вершины
function paintUniform(root) {
  let body = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.material.map && /Superhero/i.test(o.material.name))
      body = o;
  });
  if (!body) return;
  const img = body.material.map.image,
    W = img.width,
    H = img.height;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  g.drawImage(img, 0, 0);
  const geo = body.geometry,
    uv = geo.getAttribute("uv"),
    si = geo.getAttribute("skinIndex"),
    sw = geo.getAttribute("skinWeight"),
    idx = geo.index;
  const bones = body.skeleton.bones.map((b) => b.name);
  const zoneOf = (v) => {
    let best = 0,
      bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k);
      if (w > bw) {
        bw = w;
        best = si.getComponent(v, k);
      }
    }
    const n = bones[best] || "";
    if (/Head|neck|hand|index|middle|pinky|ring|thumb/.test(n)) return 0; // кожа
    if (/foot|ball/.test(n)) return 3; // ботинки
    if (/pelvis|thigh|calf|root/.test(n)) return 2; // брюки
    return 1; // рубашка
  };
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i),
      b = idx.getX(i + 1),
      c = idx.getX(i + 2),
      z = zoneOf(a);
    const p = paths[z];
    p.moveTo(uv.getX(a) * W, uv.getY(a) * H);
    p.lineTo(uv.getX(b) * W, uv.getY(b) * H);
    p.lineTo(uv.getX(c) * W, uv.getY(c) * H);
    p.closePath();
  }
  skin = { img, paths, W, H };
  // цвет зоны берём у формы, яркость — у исходной текстуры (складки и мышцы остаются), потом затемняем
  const zones = [
    null,
    ["#2b3a52", "#5a5f68"],
    ["#1d2330", "#3e424a"],
    ["#101010", "#2a2a2a"],
  ];
  paintZones(g, paths, zones);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  body.material = body.material.clone();
  body.material.map = t;
  body.material.roughness = 1;
  body.material.needsUpdate = true;
}
let skin = null; // исходная текстура тела и зоны (кожа, верх, низ, обувь)
function paintZones(g, paths, zones) {
  for (let z = 0; z <= 3; z++) {
    if (!zones[z]) continue;
    g.save();
    g.lineWidth = 3;
    g.lineJoin = "round";
    g.globalCompositeOperation = "color";
    g.fillStyle = g.strokeStyle = zones[z][0];
    g.fill(paths[z]);
    g.stroke(paths[z]);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = g.strokeStyle = zones[z][1];
    g.fill(paths[z]);
    g.stroke(paths[z]);
    g.restore();
  }
}
// наряд вора: чёрная маска и перчатки, тёмная толстовка, чёрные штаны и ботинки
let thiefMat = null;
function thiefMaterial(body) {
  if (thiefMat || !skin) return thiefMat;
  const cv = document.createElement("canvas");
  cv.width = skin.W;
  cv.height = skin.H;
  const g = cv.getContext("2d");
  g.drawImage(skin.img, 0, 0);
  paintZones(g, skin.paths, [
    ["#121212", "#2a2a2a"],
    ["#2e3138", "#55585e"],
    ["#18191c", "#36373b"],
    ["#0d0d0d", "#222222"],
  ]);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  thiefMat = body.material.clone();
  thiefMat.map = t;
  thiefMat.color.setScalar(0.42); // ткань темнее, иначе фонари делают её похожей на кожу
  thiefMat.roughness = 1;
  thiefMat.normalMap = null; // без рельефа мышц: это комбинезон
  return thiefMat;
}

// фуражка и фонарь — отдельные объекты, каждый кадр встают к голове и к правой руке
function makeCap() {
  const navy = new THREE.MeshStandardMaterial({
      color: 0x1b2638,
      roughness: 0.7,
    }),
    black = new THREE.MeshStandardMaterial({
      color: 0x0b0b0c,
      roughness: 0.3,
      metalness: 0.2,
    });
  const g = new THREE.Group();
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.104, 0.104, 0.05, 24),
    black,
  );
  band.position.y = 0.025;
  g.add(band);
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.135, 0.105, 0.06, 24),
    navy,
  );
  crown.position.y = 0.08;
  g.add(crown);
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.11,
      0.11,
      0.01,
      24,
      1,
      false,
      -Math.PI / 2,
      Math.PI,
    ),
    black,
  );
  brim.position.set(0, 0.005, 0.055);
  brim.scale.z = 0.75;
  g.add(brim);
  const badge = new THREE.Mesh(
    new THREE.CircleGeometry(0.018, 12),
    new THREE.MeshStandardMaterial({
      color: 0xc9a24a,
      metalness: 0.9,
      roughness: 0.3,
    }),
  );
  badge.position.set(0, 0.06, 0.122);
  badge.rotation.x = -0.25;
  g.add(badge);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}
function makeTorch() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.016, 0.2, 12),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a1c,
      roughness: 0.4,
      metalness: 0.7,
    }),
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.02, 0.05, 14),
    body.material,
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.11;
  g.add(head);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.024, 14),
    new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }),
  );
  lens.position.z = 0.136;
  g.add(lens);
  const glow = glowSprite(0xfff0d0, 0.45, 0.85);
  glow.position.z = 0.15;
  g.add(glow);
  return g;
}

// вор для сценок: тот же персонаж, весь в чёрном; play("walk" | "run")
const maskMat = new THREE.MeshStandardMaterial({
  color: 0x111111,
  roughness: 0.9,
});
// «комбинезон»: копия тела без рельефа мышц и пальцев (сглаживание Таубина по сваренным вершинам)
// и чуть раздутая наружу — так вор одет, а не голый
let suitGeo = null;
function suitGeometry(src) {
  if (suitGeo) return suitGeo;
  const geo = src.clone(),
    pos = geo.getAttribute("position"),
    n = pos.count,
    idx = geo.index;
  const wid = new Int32Array(n),
    ids = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    if (!ids.has(k)) ids.set(k, ids.size);
    wid[i] = ids.get(k);
  }
  const m = ids.size,
    P = new Float32Array(m * 3),
    nb = Array.from({ length: m }, () => new Set());
  for (let i = 0; i < n; i++) {
    P[wid[i] * 3] = pos.getX(i);
    P[wid[i] * 3 + 1] = pos.getY(i);
    P[wid[i] * 3 + 2] = pos.getZ(i);
  }
  for (let i = 0; i < idx.count; i += 3) {
    const a = wid[idx.getX(i)],
      b = wid[idx.getX(i + 1)],
      c = wid[idx.getX(i + 2)];
    nb[a].add(b).add(c);
    nb[b].add(a).add(c);
    nb[c].add(a).add(b);
  }
  const Q = new Float32Array(m * 3);
  for (let it = 0; it < 16; it++) {
    const f = it % 2 ? -0.53 : 0.5; // Таубин: сгладить и вернуть объём, чтобы не усыхало
    for (let v = 0; v < m; v++) {
      let x = 0,
        y = 0,
        z = 0;
      for (const u of nb[v]) {
        x += P[u * 3];
        y += P[u * 3 + 1];
        z += P[u * 3 + 2];
      }
      const k = nb[v].size || 1;
      Q[v * 3] = P[v * 3] + f * (x / k - P[v * 3]);
      Q[v * 3 + 1] = P[v * 3 + 1] + f * (y / k - P[v * 3 + 1]);
      Q[v * 3 + 2] = P[v * 3 + 2] + f * (z / k - P[v * 3 + 2]);
    }
    P.set(Q);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = P[wid[i] * 3];
    out[i * 3 + 1] = P[wid[i] * 3 + 1];
    out[i * 3 + 2] = P[wid[i] * 3 + 2];
  }
  geo.setAttribute("position", new THREE.BufferAttribute(out, 3));
  // нормали у модели сжаты (meshopt): на месте не пересчитать — иначе нули и тело чёрное. Новый массив
  geo.deleteAttribute("normal");
  geo.computeVertexNormals();
  // раздуть по нормали на долю роста — складки ткани, а не кожа
  geo.computeBoundingBox();
  const h = geo.boundingBox.max.y - geo.boundingBox.min.y,
    off = h * 0.008,
    nr = geo.getAttribute("normal");
  for (let i = 0; i < n; i++) {
    out[i * 3] += nr.getX(i) * off;
    out[i * 3 + 1] += nr.getY(i) * off;
    out[i * 3 + 2] += nr.getZ(i) * off;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeBoundingSphere();
  suitGeo = geo;
  return geo;
}
export function makeThiefModel() {
  if (!base) return null;
  const dressed = !!crewBase.thief;
  const model = skClone(crewBase.thief || base);
  let spine = null;
  model.traverse((o) => {
    if (dressed) {
      if (o.isBone && o.name === "spine_03") spine = o;
      return;
    }
    if (o.isSkinnedMesh && /Superhero/i.test(o.material.name)) {
      const m = thiefMaterial(o);
      if (m) o.material = m;
      o.geometry = suitGeometry(o.geometry);
    } else if (o.isMesh) o.material = maskMat; // лицо и глаза — под чёрной маской
    if (o.isBone && o.name === "spine_03") spine = o;
  });
  // рюкзак: каждый кадр встаёт к спине (как фуражка охранника к голове)
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.44, 0.17),
    new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.85 }),
  );
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.05, 0.19),
    new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.7 }),
  );
  strap.position.y = 0.08;
  pack.add(strap);
  const mixer = new THREE.AnimationMixer(model),
    walk = mixer.clipAction(clips.Walk_Loop),
    run = mixer.clipAction(clips.Sprint_Loop),
    tmp = new THREE.Vector3(),
    q = new THREE.Quaternion();
  return {
    model,
    extra: [pack],
    play(n) {
      walk.stop();
      run.stop();
      (n === "run" ? run : walk).reset().play();
    },
    update(dt) {
      mixer.update(dt);
      pack.visible = model.visible;
      if (!spine) return;
      model.updateMatrixWorld(true);
      spine.getWorldPosition(tmp);
      model.getWorldQuaternion(q);
      pack.position
        .copy(tmp)
        .add(new THREE.Vector3(0, -0.02, -0.17).applyQuaternion(q));
      pack.quaternion.copy(q);
    },
  };
}

// новый охранник: model — сам персонаж (поворачивается группой снаружи), update(dt, state)
export function makeGuardModel() {
  if (!base) return null;
  const model = skClone(base);
  const mixer = new THREE.AnimationMixer(model);
  const act = (n) => mixer.clipAction(clips[n]);
  const walk = act("walkBody"),
    arm = act("torchArm"),
    aim = act("Pistol_Aim_Neutral"),
    run = act("Sprint_Loop");
  walk.play();
  arm.play();
  let head = null,
    hand = null;
  model.traverse((o) => {
    if (o.isBone && o.name === "Head") head = o;
    if (o.isBone && o.name === "hand_r") hand = o;
  });
  const cap = makeCap(),
    torch = makeTorch();
  const tmp = new THREE.Vector3(),
    q = new THREE.Quaternion();
  let state = "";
  return {
    model,
    cap,
    torch,
    mixer,
    setState(s) {
      if (s === state) return;
      state = s;
      for (const a of [walk, arm, aim, run]) a.stop();
      if (s === "aim") {
        aim.reset().play();
      } else if (s === "run") {
        run.reset().play();
      } else {
        walk.reset().play();
        arm.reset().play();
      }
    },
    // возвращает, сколько раз нога встала на пол за кадр (0, если не идёт)
    update(dt, speed) {
      walk.timeScale = Math.max(0.2, speed / 1.35);
      const d = clips.walkBody.duration,
        t0 = walk.time,
        t1 = t0 + dt * walk.timeScale; // без зацикливания: большой кадр не теряет шаги
      let steps = 0;
      if (walk.isRunning())
        for (const f of STEP_AT)
          steps += Math.floor((t1 - f * d) / d) - Math.floor((t0 - f * d) / d);
      mixer.update(dt);
      model.updateMatrixWorld(true);
      model.getWorldQuaternion(q);
      if (head) {
        head.getWorldPosition(tmp);
        cap.position
          .copy(tmp)
          .add(new THREE.Vector3(0, 0.1, 0).applyQuaternion(q));
        cap.quaternion.copy(q);
      }
      if (hand) {
        hand.getWorldPosition(tmp);
        torch.position
          .copy(tmp)
          .add(new THREE.Vector3(0, 0.02, 0.06).applyQuaternion(q));
        torch.quaternion.copy(q);
        torch.rotateX(0.12);
      }
      return steps;
    },
  };
}

// штурман: лицо открыто, куртка цвета хаки, тёмные джинсы, коричневые ботинки
let navMat = null;
function navMaterial(body) {
  if (navMat || !skin) return navMat;
  const cv = document.createElement("canvas");
  cv.width = skin.W;
  cv.height = skin.H;
  const g = cv.getContext("2d");
  g.drawImage(skin.img, 0, 0);
  // одежда сплошным цветом (без нарисованных мышц), лицо и руки — как есть
  for (const [z, col] of [
    [1, "#4f5638"],
    [2, "#1d2636"],
    [3, "#33241a"],
  ]) {
    g.fillStyle = g.strokeStyle = col;
    g.lineWidth = 3;
    g.fill(skin.paths[z]);
    g.stroke(skin.paths[z]);
  }
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  navMat = body.material.clone();
  navMat.map = t;
  navMat.color.setScalar(0.85);
  navMat.roughness = 1;
  navMat.normalMap = null; // одежда гладкая, без рельефа мышц
  return navMat;
}

// гарнитура по размеру головы: макушка и уши — по вершинам головы в текущей позе (в осях персонажа),
// потом группа цепляется к кости головы и дальше двигается вместе с ней
function fitHeadset(model, bone, mesh) {
  model.updateMatrixWorld(true);
  const qm = model.getWorldQuaternion(new THREE.Quaternion()),
    qi = qm.clone().invert(),
    hp = bone.getWorldPosition(new THREE.Vector3()),
    v = new THREE.Vector3(),
    n = mesh.geometry.attributes.position.count,
    P = new Float32Array(n * 3);
  let top = -1e9;
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld).sub(hp).applyQuaternion(qi);
    P[i * 3] = v.x;
    P[i * 3 + 1] = v.y;
    P[i * 3 + 2] = v.z;
    top = Math.max(top, v.y);
  }
  // уши: полоса 7–15 см ниже макушки, самые крайние точки по ширине
  let w = 0,
    front = -1e9,
    zs = 0,
    zn = 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3],
      y = P[i * 3 + 1],
      z = P[i * 3 + 2];
    if (y > top - 0.15 && y < top - 0.07) w = Math.max(w, Math.abs(x));
    if (y > top - 0.21 && y < top - 0.15) front = Math.max(front, z);
  }
  for (let i = 0; i < n; i++) {
    const x = P[i * 3],
      y = P[i * 3 + 1],
      z = P[i * 3 + 2];
    if (y > top - 0.15 && y < top - 0.07 && Math.abs(x) > w - 0.012) {
      zs += z;
      zn++;
    }
  }
  const yEar = top - 0.11,
    zEar = zn ? zs / zn : 0,
    yMouth = top - 0.185;
  const shell = new THREE.MeshStandardMaterial({
      color: 0x121317,
      roughness: 0.35,
      metalness: 0.35,
    }),
    pad = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.9 }),
    accent = new THREE.MeshBasicMaterial({
      color: 0x7fd4ff,
      toneMapped: false,
    });
  const g = new THREE.Group();
  // дуга через макушку от уха до уха (по высоте — эллипс, чтобы лечь на голову)
  const R = w + 0.024;
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.015, 8, 32, Math.PI),
    shell,
  );
  band.position.set(0, yEar, zEar);
  band.scale.y = (top + 0.02 - yEar) / R;
  g.add(band);
  const bandPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.012, 0.035),
    pad,
  );
  bandPad.position.set(0, top + 0.012, zEar);
  g.add(bandPad);
  for (const sx of [-1, 1]) {
    const x = sx * (w + 0.028);
    // чашка: корпус, мягкая подушка к уху, голубое кольцо снаружи
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.05, 0.036, 24),
      shell,
    );
    cup.rotation.z = Math.PI / 2;
    cup.position.set(x, yEar - 0.006, zEar);
    g.add(cup);
    const cushion = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.013, 8, 20),
      pad,
    );
    cushion.rotation.y = Math.PI / 2;
    cushion.position.set(sx * (w + 0.008), yEar - 0.006, zEar);
    g.add(cushion);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.046, 0.0045, 6, 28),
      accent,
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(sx * (w + 0.047), yEar - 0.006, zEar);
    g.add(ring);
    const led = glowSprite(0x7fd4ff, 0.12, 0.9);
    led.position.set(sx * (w + 0.05), yEar - 0.006, zEar);
    g.add(led);
  }
  // микрофон на гибкой штанге — к губам, с той стороны, что видна камере
  const sx = 1,
    curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * (w + 0.03), yEar - 0.03, zEar + 0.02),
      new THREE.Vector3(sx * (w + 0.012), yEar - 0.07, zEar + 0.06),
      new THREE.Vector3(sx * 0.05, yMouth + 0.005, front + 0.012),
    ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.0055, 6), shell));
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), pad);
  mic.position.set(sx * 0.045, yMouth + 0.004, front + 0.016);
  g.add(mic);
  // группа в осях персонажа у кости головы — и на кость, сохраняя место
  g.position.copy(hp);
  g.quaternion.copy(qm);
  g.updateMatrixWorld(true);
  bone.attach(g);
}
const crewBlack = new THREE.MeshStandardMaterial({
  color: 0x17181b,
  roughness: 0.8,
});
// экипаж для меню (выбор ролей). Оба стоят в позе «рука вперёд» (Idle_Torch_Loop):
// вор — весь в чёрном, маска, рюкзак, в руке фонарик; штурман — гарнитура с микрофоном и светящийся планшет
export function makeCrewModel(kind) {
  if (!base) return null;
  const thief = kind === "thief",
    dressed = !!crewBase[kind];
  const model = skClone(crewBase[kind] || base);
  let head = null,
    hand = null,
    spine = null;
  model.traverse((o) => {
    if (dressed) {
      // одетая модель: свои материалы; у причёски нет текстуры — тёмно-каштановая, глаза вора в прорези маски не светятся
      if (o.isMesh && /Hair/.test(o.material.name)) {
        o.material = o.material.clone();
        o.material.color.set(0x24170f);
        o.material.roughness = 0.8;
      }
      if (o.isMesh && thief && /Eyes/.test(o.material.name)) {
        o.material = o.material.clone();
        o.material.color.setScalar(0.35);
      }
    } else if (o.isSkinnedMesh && /Superhero/i.test(o.material.name)) {
      // вор — чёрный комбинезон и маска одним цветом, штурман — куртка, джинсы, лицо открыто
      const m = thief ? crewBlack : navMaterial(o);
      if (m) o.material = m;
      o.geometry = suitGeometry(o.geometry);
    } else if (o.isMesh && thief) o.material = maskMat;
    if (o.isBone && o.name === "Head") head = o;
    if (o.isBone && o.name === "hand_r") hand = o;
    if (o.isBone && o.name === "spine_03") spine = o;
  });
  const extra = [];
  const std = (color, rough = 0.6, metal = 0) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
    });
  let onHead = null,
    inHand = null,
    onBack = null,
    headMesh = null,
    fitted = false;
  if (thief) {
    inHand = makeTorch();
    onBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.44, 0.17),
      std(0x3a3f47, 0.85),
    );
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.05, 0.19),
      std(0x0c0d0f, 0.7),
    );
    strap.position.y = 0.08;
    onBack.add(strap);
  } else {
    // гарнитура штурмана — главный его знак: подгоняется по голове в первом кадре и висит на кости головы
    headMesh = null;
    model.traverse((o) => {
      if (o.isSkinnedMesh && /Superhero/i.test(o.material.name)) headMesh = o;
    });
  }
  for (const o of [onHead, inHand, onBack]) if (o) extra.push(o);
  const mixer = new THREE.AnimationMixer(model);
  // оба стоят спокойно: у вора фонарик в опущенной руке светит в землю, у штурмана планшет у пояса
  const idle = mixer.clipAction(clips.Idle_Loop);
  idle.play();
  idle.time = thief ? 0.3 : 1.4; // не в ногу друг с другом
  const tmp = new THREE.Vector3(),
    q = new THREE.Quaternion();
  return {
    model,
    extra,
    head,
    update(dt) {
      mixer.update(dt);
      model.updateMatrixWorld(true);
      model.getWorldQuaternion(q);
      for (const o of extra) o.visible = model.visible;
      if (!thief && !fitted && head && headMesh) {
        fitted = true;
        fitHeadset(model, head, headMesh);
      }
      if (hand && inHand) {
        hand.getWorldPosition(tmp);
        if (thief) {
          inHand.position
            .copy(tmp)
            .add(new THREE.Vector3(0, -0.06, 0.04).applyQuaternion(q));
          inHand.quaternion.copy(q);
          inHand.rotateX(1.15); // лучом вниз и чуть вперёд
        } else {
          // планшет у бедра стоймя, экраном вперёд
          inHand.position
            .copy(tmp)
            .add(new THREE.Vector3(0.02, -0.1, 0.07).applyQuaternion(q));
          inHand.quaternion.copy(q);
          inHand.rotateX(Math.PI / 2 - 0.15);
          inHand.rotateY(Math.PI / 2);
        }
      }
      if (spine && onBack) {
        spine.getWorldPosition(tmp);
        onBack.position
          .copy(tmp)
          .add(new THREE.Vector3(0, -0.02, -0.17).applyQuaternion(q));
        onBack.quaternion.copy(q);
      }
    },
  };
}
