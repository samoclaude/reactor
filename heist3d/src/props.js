// Модели ориентиров и обстановки (Poly Haven, CC0; см. assets/CREDITS.md).
// Все модели приводятся к виду: низ на полу (y = 0), центр по X, задняя сторона на z = 0, лицо смотрит в +Z.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glowSprite } from "./world.js";

export const FILES = {
  frame: "fancy_picture_frame_01",
  plant: "potted_plant_01",
  bust: "marble_bust_01",
  shelf: "wooden_bookshelf_worn",
  books: "book_encyclopedia_set_01",
  vase: "antique_ceramic_vase_01",
  clock: "vintage_grandfather_clock_01",
  mirror: "ornate_mirror_01",
  lion: "lion_head",
  shield: "kite_shield",
  candles: "brass_candleholders",
  console: "ClassicConsole_01",
  chandelier: "Chandelier_01",
  radio: "vintage_radio_transceiver",
  camera: "security_camera_02", // голова отдельным узлом head, поворачивается
  // свои модели (Blender-скрипты, см. assets/CREDITS.md)
  piano: "piano",
  violin: "violin",
  owl: "owl",
  dino: "dino",
  safe: "safe",
  vault: "vault",
  wardrobe: "wardrobe",
  drape: "drape",
};
// эти модели берутся как есть, без normalize: координаты уже совпадают с игрой
const RAW = new Set(["safe", "vault", "camera"]);
const lib = {};
// модели, у которых лицо смотрит не в +Z: поворот вокруг Y при загрузке
const ROT_Y = { clock: -Math.PI / 2 };

export async function loadProps(renderer, onProgress, ktx) {
  const loader = new GLTFLoader()
    .setKTX2Loader(ktx)
    .setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(FILES);
  let done = 0;
  await Promise.all(
    names.map(async (n) => {
      try {
        const g = await loader.loadAsync(`assets/models/${FILES[n]}.glb`);
        if (ROT_Y[n]) g.scene.rotation.y = ROT_Y[n];
        lib[n] = RAW.has(n) ? shadows(g.scene) : normalize(g.scene);
      } catch (e) {
        console.warn("модель не загрузилась", n, e);
      }
      if (onProgress) onProgress(++done / names.length);
    }),
  );
}
export const hasProp = (n) => !!lib[n];

// низ на полу, центр по X, зад на z = 0
function normalize(root) {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root),
    wrap = new THREE.Group();
  root.position.sub(
    new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, b.min.z),
  );
  wrap.add(root);
  wrap.userData.size = b.getSize(new THREE.Vector3());
  shadows(root);
  return wrap;
}
function shadows(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}
// копия модели нужной высоты (или ширины)
function prop(n, { h, w } = {}) {
  const src = lib[n];
  if (!src) return null;
  const o = src.clone(true),
    s = src.userData.size;
  const k = h ? h / s.y : w ? w / s.x : 1;
  o.scale.setScalar(k);
  o.userData.size = s.clone().multiplyScalar(k);
  return o;
}

/* ---------- ориентиры: индекс LM → группа (лицо в +Z, зад у стены) и площадь, которую нельзя пройти ---------- */
// мраморная тумба: основание, стойка, капитель; верх ровно на высоте h
const pedestal = (M, h, r) => {
  const g = new THREE.Group();
  const part = (w, y0, y1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, w), M.stone);
    m.position.y = (y0 + y1) / 2;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  part(r * 2.3, 0, 0.1);
  part(r * 1.8, 0.1, h - 0.08);
  part(r * 2.2, h - 0.08, h);
  return g;
};
export function buildLandmark(li, M) {
  const g = new THREE.Group();
  let depth = 0.45,
    width = 0.9;
  const add = (o, x = 0, y = 0, z = 0) => {
    if (o) {
      o.position.set(x, y, z);
      g.add(o);
    }
    return o;
  };
  switch (li) {
    case 0: {
      const f = prop("frame", { w: 1.05 });
      add(f, 0, 1.55 - (f ? f.userData.size.y / 2 : 0), 0.02);
      depth = 0.1;
      break;
    } // картина
    case 1:
      add(prop("plant", { h: 1.35 }), 0, 0, 0.12);
      depth = 0.75;
      width = 0.8;
      break; // фикус
    case 2:
      add(pedestal(M, 1.0, 0.24), 0, 0, 0.3);
      add(prop("bust", { h: 0.62 }), 0, 1.0, 0.12);
      depth = 0.6;
      width = 0.6;
      break; // статуя
    case 3: {
      const s = add(prop("shelf", { h: 2.1 }), 0, 0, 0.02);
      const sz = s ? s.userData.size : new THREE.Vector3(1, 2, 0.4); // книги
      for (let i = 0; i < 3; i++) {
        const b = prop("books", { w: sz.x * 0.8 });
        add(b, 0, 0.42 + i * sz.y * 0.27, 0.06);
      }
      depth = sz.z + 0.05;
      width = sz.x + 0.1;
      break;
    }
    case 4:
      add(pedestal(M, 0.85, 0.26), 0, 0, 0.32);
      add(prop("vase", { h: 0.48 }), 0, 0.85, 0.14);
      depth = 0.65;
      width = 0.65;
      break; // ваза
    case 5: {
      const c = add(prop("clock", { h: 2.05 }), 0, 0, 0.02);
      depth = c ? c.userData.size.z + 0.05 : 0.5;
      width = 0.7;
      break;
    } // часы
    case 8: {
      const m = prop("mirror", { h: 1.25 });
      add(m, 0, 0.75, 0.02);
      depth = 0.1;
      break;
    } // зеркало
    case 11:
      add(pedestal(M, 0.95, 0.3), 0, 0, 0.36);
      add(prop("lion", { h: 0.55 }), 0, 0.95, 0.12);
      depth = 0.75;
      width = 0.75;
      break; // лев
    case 12:
      add(prop("shield", { h: 1.15 }), 0, 1.15, 0.02);
      depth = 0.12;
      break; // щит
    case 13:
      add(pedestal(M, 1.0, 0.25), 0, 0, 0.3);
      add(prop("violin", { h: 0.8 }), 0, 1.0, 0.16);
      depth = 0.62;
      width = 0.62;
      break; // скрипка
    case 22: {
      const p = add(prop("piano", { w: 1.5 }), 0, 0, 0.02);
      depth = p ? p.userData.size.z + 0.05 : 0.65;
      width = 1.6;
      break;
    } // пианино
    case 23:
      add(pedestal(M, 1.0, 0.25), 0, 0, 0.3);
      add(prop("owl", { h: 0.62 }), 0, 1.0, 0.14);
      depth = 0.62;
      width = 0.62;
      break; // сова
    case 30: {
      const d = add(prop("dino", { w: 2.6 }), 0, 0, 0.04);
      depth = d ? d.userData.size.z + 0.08 : 0.65;
      width = 2.7;
      break;
    } // динозавр
    case 26: {
      const c = add(prop("console", { w: 1.1 }), 0, 0, 0.02);
      const top = c ? c.userData.size.y : 0.8; // свеча
      const cd = add(prop("candles", { h: 0.55 }), 0, top, 0.22);
      depth = c ? c.userData.size.z + 0.05 : 0.5;
      width = 1.1;
      if (cd) {
        const fl = glowSprite(0xffb050, 0.55, 0.8);
        fl.position.set(0, top + 0.6, 0.22);
        g.add(fl);
        g.userData.flame = fl;
        g.userData.light = new THREE.Vector3(0, top + 0.6, 0.35);
      }
      break;
    }
    default:
      return null; // модели ещё нет — main.js поставит заглушку
  }
  g.userData.depth = depth;
  g.userData.width = width;
  return g;
}
export function chandelier() {
  return prop("chandelier", { h: 0.85 });
}
export function radioModel() {
  return prop("radio", { w: 0.5 });
}
// укрытие: шкаф или портьера (лицо в +Z, зад у стены), null — если модель не загрузилась
export function hideModel(kind) {
  return kind === "wardrobe"
    ? prop("wardrobe", { h: 2.2 })
    : prop("drape", { h: 3.12 });
}
// сейф, дверь хранилища и камера: копии в координатах игры (или null, если не загрузились)
export function rawModel(n) {
  return lib[n] ? lib[n].clone(true) : null;
}

/* ---------- склейка неподвижного: один меш на материал ---------- */
function toFloat(geo) {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = geo.getAttribute(name),
      n = { position: 3, normal: 3, uv: 2 }[name];
    const arr = new Float32Array(
      (a ? a.count : geo.getAttribute("position").count) * n,
    );
    if (a)
      for (let i = 0; i < a.count; i++) {
        arr[i * n] = a.getX(i);
        arr[i * n + 1] = a.getY(i);
        if (n > 2) arr[i * n + 2] = a.getZ(i);
      }
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  if (geo.index) out.setIndex(Array.from(geo.index.array));
  return out;
}
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const byMat = new Map(),
    keep = [];
  root.traverse((o) => {
    if (
      !o.isMesh ||
      o.isSkinnedMesh ||
      o.userData.dynamic ||
      Array.isArray(o.material) ||
      o.material.transparent
    ) {
      if (o.isMesh || o.isSprite) keep.push(o);
      return;
    }
    const g = toFloat(o.geometry);
    g.applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(
      list.map((g) =>
        g.index
          ? g
          : g.setIndex([...Array(g.getAttribute("position").count).keys()]),
      ),
    );
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = m.receiveShadow = true;
    out.add(m);
    list.forEach((g) => g.dispose());
  }
  for (const o of keep) {
    o.updateMatrixWorld(true);
    const c = o;
    c.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    c.matrixAutoUpdate = true;
    out.add(c);
  }
  return out;
}
