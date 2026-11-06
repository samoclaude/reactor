// Охранник: персонаж и анимации Quaternius (CC0), форма рисуется поверх текстуры тела по костям.
// Ноги — из ходьбы, правая рука держит фонарь (поза Idle_Torch), при поимке — прицел.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";
import { glowSprite } from "./world.js";

let base = null;
const clips = {};
const RIGHT_ARM =
  /^(clavicle_r|upperarm_r|lowerarm_r|hand_r|(index|middle|pinky|ring|thumb)_\d\d(_leaf)?_r)$/;

export async function loadGuard() {
  const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [g, a] = await Promise.all([
    l.loadAsync("assets/guard/guard.glb"),
    l.loadAsync("assets/guard/anims.glb"),
  ]);
  for (const c of a.animations) clips[c.name] = c;
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
  thiefMat.color.setScalar(0.6); // ткань темнее, иначе фонари делают её похожей на кожу
  thiefMat.roughness = 1;
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
const maskMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
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
  const model = skClone(base);
  let spine = null;
  model.traverse((o) => {
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
      pack.position.copy(tmp).add(new THREE.Vector3(0, -0.02, -0.17).applyQuaternion(q));
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
    update(dt, speed) {
      walk.timeScale = Math.max(0.2, speed / 1.35);
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
    },
  };
}
