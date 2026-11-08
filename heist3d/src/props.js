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
  laptop: "classic_laptop", // ноутбук штурмана: взлом камер
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
// модели новых зданий грузятся по теме, когда нужны (или в фоне после запуска): так первая загрузка не растёт
export const THEME_FILES = {
  museum: [
    "frame2",
    "statue",
    "horse",
    "whale",
    "elephant",
    "katana_stand",
    "katana",
    "meteor",
    "spinning",
    "chest",
    "telescope",
    "masks",
    "cabinet_gothic",
  ],
  bank: [
    "atm",
    "plant2",
    "wallclock",
    "register",
    "sofa",
    "cooler",
    "flag",
    "bull",
    "coffee",
    "drawers",
    "globe",
    "deposit",
    "chandelier2",
    "cabinet_vintage",
  ],
  office: [
    "cooler",
    "printer",
    "aquarium",
    "cactus",
    "dartboard",
    "tv",
    "sofa_modern",
    "coffee",
    "whiteboard",
    "screen",
    "bicycle",
    "lounge",
    "shelves",
    "floorlamp",
    "locker",
  ],
  jewelry: [
    "showcase",
    "necklace",
    "crown",
    "peacock",
    "mantelclock",
    "vase_brass",
    "sofa",
    "armchair",
    "scales",
    "jeweler",
    "tea",
    "sidetable",
    "chandelier3",
    "cabinet_vintage",
  ],
};
// эти модели берутся как есть, без normalize: координаты уже совпадают с игрой
const RAW = new Set(["safe", "vault", "camera"]);
const lib = {};
// модели, у которых лицо смотрит не в +Z: поворот вокруг Y при загрузке
const ROT_Y = {
  clock: -Math.PI / 2,
  // конь и слон у Poly Haven уже стоят профилем (так силуэт узнаётся лучше всего) — их не крутим
  spinning: Math.PI / 2, // колесо прялки — лицом в комнату
  whale: -0.35,
};
// меч у Poly Haven стоит остриём вверх — кладём его на бок
const ROT_Z = { katana: Math.PI / 2 };

let loader = null;
// общие модели (диван, кулер, шкаф) нужны нескольким зданиям: одна загрузка на всех, повторные вызовы ждут её
const oneLoads = {};
function loadOne(n) {
  if (!oneLoads[n])
    oneLoads[n] = loadTry(n).then(() => {
      if (!lib[n]) delete oneLoads[n]; // не вышло — в следующий раз попробовать снова
    });
  return oneLoads[n];
}
async function loadTry(n) {
  // не загрузилась (сеть моргнула) — ещё две попытки, иначе вместо модели будет коробка-заглушка
  for (let a = 0; a < 3 && !lib[n]; a++) {
    try {
      if (a) await new Promise((r) => setTimeout(r, 800 * a));
      const g = await loader.loadAsync(`assets/models/${FILES[n] || n}.glb`);
      if (ROT_Y[n]) g.scene.rotation.y = ROT_Y[n];
      if (ROT_Z[n]) g.scene.rotation.z = ROT_Z[n];
      glassify(g.scene);
      lib[n] = RAW.has(n) ? shadows(g.scene) : normalize(g.scene);
    } catch (e) {
      console.warn("модель не загрузилась", n, a + 1, e);
    }
  }
}
export async function loadProps(renderer, onProgress, ktx) {
  loader = new GLTFLoader()
    .setKTX2Loader(ktx)
    .setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(FILES);
  let done = 0;
  await Promise.all(
    names.map(async (n) => {
      await loadOne(n);
      if (onProgress) onProgress(++done / names.length);
    }),
  );
}
const themeLoads = {};
// модели темы: один раз, повторные вызовы ждут тот же промис
export function loadThemeProps(id) {
  if (!THEME_FILES[id] || !loader) return Promise.resolve();
  if (!themeLoads[id])
    themeLoads[id] = Promise.all(THEME_FILES[id].map((n) => loadOne(n))).then(
      () => {
        // что-то не загрузилось — уровень пока с заглушками, следующий вызов попробует ещё раз
        if (THEME_FILES[id].every((n) => lib[n])) themeLoads[id].done = true;
        else delete themeLoads[id];
      },
    );
  return themeLoads[id];
}
export const themePropsReady = (id) =>
  !THEME_FILES[id] || !!(themeLoads[id] && themeLoads[id].done);
// стекло в моделях (имя материала glass…): своё общее, прозрачное, без преломления
let glassM = null;
// яркость свечения в моделях Blender подобрана на глаз в превью — в тёмном доме она слишком сильная
const GLOW = {
  glow_lamp: 0.45,
  glow_bulb: 1.6,
  lamp_shade: 0.8,
  glow_water: 0.4,
  lamp: 0.9,
  screen: 0.38,
  screen_ui: 0.42,
  screen_b: 0.55,
  screen_c: 0.55,
  screen_d: 0.55,
  glow: 0.6,
  // камни в украшениях: лишь искрятся, иначе павлин и корона — сплошное пятно света
  glow_gem: 0.14,
  glow_gem_red: 0.14,
  glow_gem_white: 0.1,
  glow_gem_green: 0.14,
  led: 0.8,
  lamp_bulb: 1.2,
};
// металл без отражения окружения под фонариком выцветал в белое: темнее и матовее
const TUNE = {
  dep_door: { color: 0x5c6064, roughness: 0.42, metalness: 0.8 },
  dep_steel: { color: 0x6a6e72, roughness: 0.32, metalness: 0.85 },
  atm_steel: { color: 0x7a7e82, roughness: 0.35 },
  // белые поверхности под фонарём выбеливались целиком: чуть серее и матовее
  projector_screen: { color: 0xb8b8b4, roughness: 0.95 },
  // золото павлина, короны и масок: веер перьев под фонарём горел сплошным бликом
  gold: { color: 0xa88232, roughness: 0.42 },
  // платиновые края перьев павлина давали белый засвет со свечением
  platinum: { color: 0x9a9c9e, roughness: 0.55 },
  // серебряная маска трагедии горела пятном — лица было не разобрать
  mask_silver: { color: 0x9a9ea4, roughness: 0.45 },
  mask_gold: { color: 0xb08a3a, roughness: 0.38 },
  wb_surface: { color: 0xc8cac8, roughness: 0.55 },
};
function glassify(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const n = o.material.name || "";
    if (GLOW[n] != null) o.material.emissiveIntensity = GLOW[n];
    const tn = TUNE[n];
    if (tn) {
      if (tn.color != null) o.material.color.set(tn.color);
      if (tn.roughness != null) o.material.roughness = tn.roughness;
      if (tn.metalness != null) o.material.metalness = tn.metalness;
    } else if (o.material.emissiveIntensity > 1.5)
      o.material.emissiveIntensity = 1.5;
    // цвет по вершинам (у шкафа cabinet_vintage он весь белый): склейка bakeStatic его не переносит, и без него модель чёрная
    if (o.material.vertexColors) {
      o.material.vertexColors = false;
      o.geometry.deleteAttribute("color");
    }
    // тонкое двустороннее полотнище флага затеняло само себя и выходило чёрным
    if (n === "flag_navy" || n === "flag_gold")
      o.material.userData.noShadow = true;
    // вода в аквариуме: под фонарём светлое дно выцветало в белое
    if (n === "glow_water") o.material.color.set(0x0c3450);
    // стекло: glass…, …_glass (у моделей Poly Haven); тёмное стекло сканера МФУ — не прозрачное
    if (!/glass/i.test(n) || n === "mfu_glass") return;
    if (!glassM)
      glassM = new THREE.MeshStandardMaterial({
        color: 0xb8c8d4,
        roughness: 0.12,
        metalness: 0.1,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    o.material = glassM;
    o.castShadow = false;
  });
}
export const hasProp = (n) => !!lib[n];

// низ на полу, центр по X, зад на z = 0
function normalize(root) {
  root.updateMatrixWorld(true);
  // точно по вершинам: у сжатых meshopt моделей габариты в файле бывают в другом масштабе (папки выходили в 10 раз больше)
  const b = new THREE.Box3().setFromObject(root, true),
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
      // стекло тень не бросает, полотнище флага тоже (noShadow)
      o.castShadow = !(
        o.material &&
        (o.material.transparent || o.material.userData.noShadow)
      );
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
// тумба под кассу и чайник: деревянный корпус с каменной столешницей
const stand = (M, w, h, d) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.04, d), M.door);
  body.position.y = (h - 0.04) / 2;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.04, 0.04, d + 0.04),
    M.stone,
  );
  top.position.y = h - 0.02;
  for (const m of [body, top]) {
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  return g;
};
// свет от предмета (экран, аквариум, лампа): точка в осях ориентира, цвет и сила для пула ламп
const glowAt = (g, x, y, z, col, k) => {
  g.userData.light = new THREE.Vector3(x, y, z);
  g.userData.lightCol = col;
  g.userData.lightK = k;
};
// theme — id темы: у одного и того же ориентира в разных зданиях бывает своя модель (картина, часы, диван…)
export function buildLandmark(li, M, theme = "mansion") {
  const g = new THREE.Group();
  let depth = 0.45,
    width = 0.9,
    missing = false;
  const add = (o, x = 0, y = 0, z = 0) => {
    if (o) {
      o.position.set(x, y, z);
      g.add(o);
    }
    return o;
  };
  const sz = (o, d) => (o ? o.userData.size : d);
  // главная модель ориентира: не загрузилась — вместо него будет заглушка с подписью
  const prop0 = (n, opt) => {
    const o = prop(n, opt);
    if (!o) missing = true;
    return o;
  };
  // предмет на тумбе: высота тумбы h, предмет по высоте ph (или по ширине pw)
  const onPedestal = (name, h, r, opt) => {
    add(pedestal(M, h, r), 0, 0, r * 1.2 + 0.02);
    const o = add(prop0(name, opt), 0, h, 0);
    if (o) o.position.z = r * 1.2 + 0.02 - o.userData.size.z / 2;
    depth = r * 2.4 + 0.08;
    width = Math.max(r * 2.4, o ? o.userData.size.x : 0) + 0.06;
    return o;
  };
  // предмет на полу у стены целиком (высота h или ширина w)
  const onFloor = (name, opt, gap = 0.02) => {
    const o = add(prop0(name, opt), 0, 0, gap);
    const s = sz(o, new THREE.Vector3(0.8, 1, 0.5));
    depth = s.z + gap + 0.04;
    width = s.x + 0.08;
    return o;
  };
  // предмет на стене: центр на высоте y
  const onWall = (name, opt, y) => {
    const o = prop0(name, opt);
    add(o, 0, y - (o ? o.userData.size.y / 2 : 0), 0.02);
    depth = 0.12;
    // ширина по модели: иначе табличка музея заезжала под раму картины и масок
    if (o) width = o.userData.size.x + 0.06;
    return o;
  };
  const T = theme;
  switch (li) {
    case 0: {
      if (T === "museum") onWall("frame2", { w: 1.35 }, 1.65);
      else {
        const f = prop("frame", { w: 1.05 });
        add(f, 0, 1.55 - (f ? f.userData.size.y / 2 : 0), 0.02);
        depth = 0.1;
      }
      break;
    } // картина
    case 1:
      if (T === "bank") onFloor("plant2", { h: 1.25 }, 0.1);
      else {
        add(prop("plant", { h: 1.35 }), 0, 0, 0.12);
        depth = 0.75;
        width = 0.8;
      }
      break; // фикус
    case 2:
      if (T === "museum") {
        add(pedestal(M, 0.28, 0.42), 0, 0, 0.5);
        const o = add(prop0("statue", { h: 1.7 }), 0, 0.28, 0);
        if (o) o.position.z = 0.5 - o.userData.size.z / 2;
        depth = 1.08;
        width = 1.05;
      } else {
        add(pedestal(M, 1.0, 0.24), 0, 0, 0.3);
        add(prop("bust", { h: 0.62 }), 0, 1.0, 0.12);
        depth = 0.6;
        width = 0.6;
      }
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
      if (T === "jewelry") onPedestal("vase_brass", 0.85, 0.26, { h: 0.6 });
      else {
        add(pedestal(M, 0.85, 0.26), 0, 0, 0.32);
        add(prop("vase", { h: 0.48 }), 0, 0.85, 0.14);
        depth = 0.65;
        width = 0.65;
      }
      break; // ваза
    case 5: {
      if (T === "bank") onWall("wallclock", { w: 0.8 }, 2.15);
      else if (T === "jewelry") {
        const c = add(prop("console", { w: 1.1 }), 0, 0, 0.02);
        const top = c ? c.userData.size.y : 0.8;
        const m = add(prop0("mantelclock", { h: 0.42 }), 0, top, 0.05);
        if (m && c)
          m.position.z = 0.02 + c.userData.size.z / 2 - m.userData.size.z / 2;
        depth = c ? c.userData.size.z + 0.05 : 0.5;
        width = 1.1;
      } else {
        const c = add(prop("clock", { h: 2.05 }), 0, 0, 0.02);
        depth = c ? c.userData.size.z + 0.05 : 0.5;
        width = 0.7;
      }
      break;
    } // часы
    case 8: {
      const m = prop("mirror", { h: 1.25 });
      add(m, 0, 0.75, 0.02);
      depth = 0.1;
      break;
    } // зеркало
    case 10: {
      onFloor("aquarium", { h: 1.4 });
      glowAt(g, 0, 1.05, 0.55, 0x58b8ff, 1.1);
      break;
    } // аквариум
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
    case 14:
      onFloor("cactus", { h: 0.95 }, 0.12);
      break; // кактус
    case 20:
      onFloor("peacock", { h: 1.2 }, 0.06);
      break; // павлин
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
    case 25:
      onWall("masks", { w: 1.2 }, 1.62);
      break; // маски
    case 27:
      onFloor("tv", { h: 1.6 }, 0.08);
      glowAt(g, 0, 1.15, 0.6, 0x8a7cff, 1.0);
      break; // телевизор
    case 30: {
      const d = add(prop("dino", { w: 2.6 }), 0, 0, 0.04);
      depth = d ? d.userData.size.z + 0.08 : 0.65;
      width = 2.7;
      break;
    } // динозавр
    case 31:
      onFloor("bicycle", { w: 1.7 }, 0.04);
      break; // велосипед
    case 32:
      onWall("dartboard", { w: 0.5 }, 1.73);
      break; // мишень
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
    // ---- новые здания (08.11.2026) ----
    case 35:
      onPedestal("horse", 0.95, 0.3, { h: 0.6 });
      break; // конь
    case 36:
      onPedestal("whale", 1.0, 0.3, { w: 0.75 });
      break; // кит
    case 37:
      onPedestal("elephant", 0.75, 0.3, { h: 0.6 });
      break; // слон
    case 38: {
      const st = onPedestal("katana_stand", 0.9, 0.3, { w: 0.5 });
      const top = 0.9 + (st ? st.userData.size.y * 0.72 : 0.2);
      const k = add(
        prop("katana", { w: 0.95 }),
        0,
        top,
        st ? st.position.z + st.userData.size.z / 2 : 0.3,
      );
      if (k) k.position.z -= k.userData.size.z / 2;
      break;
    } // меч
    case 39: {
      onPedestal("meteor", 0.9, 0.3, { w: 0.42 });
      // стеклянный колпак над камнем
      const gl = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.5, 0.56),
        glassMat(),
      );
      gl.position.set(0, 0.9 + 0.25, 0.38);
      g.add(gl);
      break;
    } // метеорит
    case 40:
      onFloor("spinning", { h: 1.1 }, 0.08);
      break; // прялка
    case 41:
      onFloor("chest", { w: 0.95 }, 0.08);
      break; // сундук
    case 42:
      onFloor("telescope", { h: 1.6 }, 0.1);
      break; // телескоп
    case 43:
      onFloor("atm", { h: 1.7 }, 0.02);
      glowAt(g, 0, 1.35, 0.55, 0x6fb8ff, 0.45);
      break; // банкомат
    case 44: {
      add(stand(M, 0.8, 0.92, 0.55), 0, 0, 0.3);
      const r = add(prop0("register", { w: 0.5 }), 0, 0.92, 0.3);
      if (r) r.position.z = 0.3 - r.userData.size.z / 2 + 0.04;
      depth = 0.62;
      width = 0.9;
      break;
    } // касса
    case 45:
      if (T === "office") onFloor("sofa_modern", { w: 2.0 }, 0.04);
      else onFloor("sofa", { w: 1.9 }, 0.04);
      break; // диван
    case 46:
      onFloor("cooler", { h: 1.25 }, 0.06);
      break; // кулер
    case 47:
      onFloor("flag", { h: 2.4 }, 0.1);
      break; // флаг
    case 48:
      onPedestal("bull", 1.0, 0.3, { h: 0.62 });
      break; // бык
    case 49:
      onFloor("coffee", { h: 1.3 }, 0.06);
      break; // кофе
    case 50:
      onFloor("drawers", { h: 1.05 }, 0.02);
      break; // картотека
    case 51:
      onFloor("globe", { h: 1.1 }, 0.1);
      break; // глобус
    case 52:
      onFloor("deposit", { h: 2.2 }, 0.0);
      break; // ячейки
    case 53:
      onFloor("printer", { h: 1.2 }, 0.04);
      break; // принтер
    case 54:
      onFloor("whiteboard", { h: 1.9 }, 0.08);
      break; // доска
    case 55:
      onFloor("screen", { h: 1.9 }, 0.08);
      break; // экран
    case 56:
      if (T === "jewelry") onFloor("armchair", { h: 1.0 }, 0.06);
      else onFloor("lounge", { h: 0.95 }, 0.08);
      break; // кресло
    case 57: {
      const s = onFloor("shelves", { h: 1.8 }, 0.02);
      const S = sz(s, new THREE.Vector3(1.83, 1.8, 0.56)),
        k = S.y / 2.312; // полки модели (высота 2,31 м): 0,66 — во всю ширину, слева 1,32, справа 1,09 и 1,75
      // ряды папок на полках (папка ростом 26 см), по ширине стеллажа — группами
      for (const [y, x] of [
        [0.66, -0.55],
        [0.66, 0.22],
        [0.66, 0.58],
        [1.32, -0.42], // у левой секции полка ниже, чем у правой
        [1.75, 0.46],
        [1.09, 0.5],
      ]) {
        add(
          binderRow(Math.round(4 + ((x * 10 + y * 7) & 3))),
          (x * S.x) / 1.83,
          y * k,
          0.02 + S.z / 2 - 0.13,
        );
      }
      break;
    } // стеллаж
    case 58:
      onFloor("floorlamp", { h: 1.7 }, 0.15);
      glowAt(g, 0, 1.45, 0.4, 0xffc070, 2.4);
      break; // торшер
    case 59:
      onFloor("showcase", { w: 1.3 }, 0.04);
      glowAt(g, 0, 1.15, 0.5, 0xfff0d8, 1.0);
      break; // витрина
    case 60:
      onFloor("necklace", { h: 1.5 }, 0.1);
      break; // колье
    case 61:
      onFloor("crown", { h: 1.5 }, 0.1);
      break; // корона
    case 62:
      onFloor("scales", { h: 1.4 }, 0.1);
      break; // весы
    case 63:
      onFloor("jeweler", { h: 1.6 }, 0.04);
      glowAt(g, 0, 1.25, 0.5, 0xffe2b0, 1.4);
      break; // лупа
    case 64: {
      const t = onFloor("sidetable", { h: 0.75 }, 0.1);
      const top = t ? t.userData.size.y : 0.75;
      const tz = t ? t.position.z + t.userData.size.z / 2 : 0.35;
      const p = add(prop("tea", { w: 0.45 }), 0, top, tz);
      if (p) p.position.z = tz - p.userData.size.z / 2;
      break;
    } // чай
    default:
      return null; // модели ещё нет — main.js поставит заглушку
  }
  // модель не загрузилась — пусть будет заглушка с подписью, а не пустая тумба
  if (missing) return null;
  // музей: табличка экспоната справа на стене — латунная рамка и кремовая карточка
  if (T === "museum") {
    const px = Math.min(1.45, width / 2 + 0.24);
    const fr = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.17, 0.016),
      plaqueMat("brass"),
    );
    fr.position.set(px, 1.32, 0.008);
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.13, 0.004),
      plaqueMat("card"),
    );
    card.position.set(px, 1.32, 0.018);
    g.add(fr, card);
  }
  g.userData.depth = depth;
  g.userData.width = width;
  return g;
}
// ряд офисных папок на полку: корешки разных цветов с белыми наклейками, последняя чуть завалилась
const binderMats = [];
function binderRow(n) {
  if (!binderMats.length) {
    for (const c of [0x1c2a4a, 0x2a2a2e, 0x6a1c1c, 0x4a4f56, 0x1e4a34])
      binderMats.push(
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }),
      );
    binderMats.label = new THREE.MeshStandardMaterial({
      color: 0xe8e4da,
      roughness: 0.8,
    });
  }
  const g = new THREE.Group(),
    w = 0.055,
    h = 0.31,
    d = 0.26;
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.004, h, d),
      binderMats[(i * 3 + n) % binderMats.length],
    );
    const lab = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.6, 0.07, 0.004),
      binderMats.label,
    );
    const x = (i - (n - 1) / 2) * w;
    const tilt = i === n - 1 ? 0.22 : 0;
    b.rotation.z = -tilt;
    b.position.set(x + Math.sin(tilt) * h * 0.5, (h / 2) * Math.cos(tilt), 0);
    lab.position.set(0, h * 0.18, d / 2 + 0.002);
    b.add(lab);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
  }
  return g;
}
const plaqueMats = {};
function plaqueMat(k) {
  if (!plaqueMats[k]) {
    if (k === "brass")
      plaqueMats[k] = new THREE.MeshStandardMaterial({
        color: 0x9c7a3c,
        roughness: 0.35,
        metalness: 0.9,
      });
    else {
      // карточка: строки «текста» серыми полосками
      const cv = document.createElement("canvas");
      cv.width = 128;
      cv.height = 72;
      const c = cv.getContext("2d");
      c.fillStyle = "#e8e0cc";
      c.fillRect(0, 0, 128, 72);
      c.fillStyle = "#3a342c";
      c.fillRect(12, 12, 70, 7);
      c.fillStyle = "#8a8070";
      for (let i = 0; i < 4; i++)
        c.fillRect(12, 28 + i * 9, 104 - (i % 2) * 22, 3);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      plaqueMats[k] = new THREE.MeshStandardMaterial({
        map: t,
        roughness: 0.8,
      });
    }
  }
  return plaqueMats[k];
}
let glassShared = null;
const glassMat = () =>
  glassShared ||
  (glassShared = new THREE.MeshStandardMaterial({
    color: 0xdfe8f0,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
// люстра по зданию: у музея и офиса люстр нет
// у люстр банка и ювелирки тени нет: под потолком её почти не видно, а проход теней фонарика рисовал их каждый кадр
const noShadow = (o) => {
  if (o)
    o.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = false;
        m.material.userData.noShadow = true;
      }
    });
  return o;
};
export function chandelier(theme = "mansion") {
  if (theme === "bank") return noShadow(prop("chandelier2", { h: 1.0 }));
  if (theme === "jewelry") return noShadow(prop("chandelier3", { h: 0.9 }));
  if (theme === "museum" || theme === "office") return null;
  return prop("chandelier", { h: 0.85 });
}
export function radioModel() {
  return prop("radio", { w: 0.5 });
}
export function laptopModel() {
  return prop("laptop", { w: 0.36 });
}
// укрытие: шкаф или портьера (лицо в +Z, зад у стены), null — если модель не загрузилась
// шкаф у каждого здания свой: резной в музее, буфет в банке и ювелирке, металлический в офисе
const HIDE_CAB = {
  museum: "cabinet_gothic",
  bank: "cabinet_vintage",
  jewelry: "cabinet_vintage",
  office: "locker",
};
// tint — цвет ткани портьеры под здание (null — родной бордовый особняка)
export function hideModel(kind, theme = "mansion", tint = null) {
  if (kind !== "wardrobe") {
    const d = prop("drape", { h: 3.12 });
    if (d)
      d.traverse((o) => {
        if (!o.isMesh || !o.material || !o.material.color) return;
        const m = o.material; // общий у всех копий: здание в игре одно
        if (!m.userData.color0) m.userData.color0 = m.color.clone();
        if (tint == null) m.color.copy(m.userData.color0);
        else if (m.name === "velvet") m.color.set(tint); // ткань, а не латунный карниз
      });
    return d;
  }
  const n = HIDE_CAB[theme];
  return (
    (n && prop(n, { h: n === "locker" ? 2.0 : 2.2 })) ||
    prop("wardrobe", { h: 2.2 })
  );
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
// chunk — размер куска в метрах: склеиваем по материалу внутри куска, чтобы камера и тень фонаря
// пропускали куски вне поля зрения (иначе на большом здании рисуется вся мебель каждый кадр)
export function bakeStatic(root, chunk = 0) {
  root.updateMatrixWorld(true);
  const byMat = new Map(),
    keep = [],
    c = new THREE.Vector3();
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
    let piece = 0;
    if (chunk) {
      g.computeBoundingBox();
      g.boundingBox.getCenter(c);
      piece = Math.floor(c.x / chunk) * 1000 + Math.floor(c.z / chunk);
    }
    if (!byMat.has(o.material)) byMat.set(o.material, new Map());
    const m = byMat.get(o.material);
    if (!m.has(piece)) m.set(piece, []);
    m.get(piece).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, pieces] of byMat)
    for (const list of pieces.values()) {
      const merged = mergeGeometries(
        list.map((g) =>
          g.index
            ? g
            : g.setIndex([...Array(g.getAttribute("position").count).keys()]),
        ),
      );
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = !mat.userData.noShadow;
      m.receiveShadow = true;
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
