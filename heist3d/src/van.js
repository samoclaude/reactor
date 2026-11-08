// Фургон штурмана: вид от первого лица из кабины наблюдения.
// Планшет со схемой (канвас plan.js на экране), папка с документами, рация с пеленгом, окно на ночную улицу с дождём.
import * as THREE from "three";
import { glowSprite } from "./world.js";

function canvasTex(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { cv, g: cv.getContext("2d"), tex: t };
}

// ночная улица за окном: небо, здание дела напротив (особняк, музей, банк, офис, ювелирка), фонари, мокрый асфальт
const streetTexCache = {};
export function streetTexture(kind = "mansion") {
  if (streetTexCache[kind]) return streetTexCache[kind];
  const { cv, g, tex } = canvasTex(1024, 512);
  streetTexCache[kind] = tex;
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, "#060b16");
  sky.addColorStop(1, "#16233a");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(200,215,240,.7)";
  for (let i = 0; i < 60; i++)
    g.fillRect((i * 151) % 1024, (i * 37) % 150, 1, 1);
  // окно: горит (тёплое, с ореолом) или тёмное
  const win = (x, y, w, h, lit, col = "#e8b46a") => {
    g.fillStyle = lit ? col : "#141c2a";
    g.fillRect(x, y, w, h);
    if (lit) {
      g.fillStyle = "rgba(232,180,106,.16)";
      g.fillRect(x - 10, y - 10, w + 20, h + 20);
    }
  };
  const lit = (i, p = 2) => ((i * 7919) % 11) < p;
  g.fillStyle = "#0b0f17";
  if (kind === "museum") {
    // музей: широкая лестница, колоннада, фронтон, крылья с арочными окнами
    g.fillRect(60, 150, 904, 200);
    g.beginPath();
    g.moveTo(250, 112);
    g.lineTo(512, 40);
    g.lineTo(774, 112);
    g.fill();
    g.fillRect(250, 108, 524, 20);
    g.fillStyle = "#121824";
    for (let i = 0; i < 9; i++) g.fillRect(268 + i * 60, 130, 18, 200);
    g.fillStyle = "#0e131c";
    for (let i = 0; i < 5; i++) g.fillRect(230 - i * 6, 330 + i * 5, 564 + i * 12, 5);
    for (let i = 0; i < 6; i++) {
      win(84 + i * 26, 190, 14, 60, lit(i, 1));
      win(800 + i * 26, 190, 14, 60, lit(i + 5, 1));
    }
    g.fillStyle = "#5a1a1a";
    for (const x of [330, 510, 690]) g.fillRect(x, 140, 22, 120); // баннеры выставки
  } else if (kind === "bank") {
    // банк: тяжёлый каменный дом в 4 этажа, арки внизу, карниз
    g.fillRect(170, 70, 684, 290);
    g.fillRect(150, 62, 724, 14);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 9; c++) win(200 + c * 72, 96 + r * 58, 26, 38, lit(r * 9 + c));
    g.fillStyle = "#141c2a";
    for (let c = 0; c < 7; c++) {
      g.beginPath();
      g.moveTo(214 + c * 92, 340);
      g.lineTo(214 + c * 92, 290);
      g.arc(232 + c * 92, 290, 18, Math.PI, 0);
      g.lineTo(250 + c * 92, 340);
      g.fill();
    }
    g.fillStyle = "#c89a48";
    g.fillRect(452, 262, 120, 14); // вывеска
  } else if (kind === "office") {
    // небоскрёб: стеклянная башня уходит за край окна, сетка этажей, часть офисов горит
    g.fillStyle = "#0a0e16";
    g.fillRect(300, 0, 424, 360);
    for (let r = 0; r < 18; r++)
      for (let c = 0; c < 14; c++)
        win(306 + c * 30, 4 + r * 19, 24, 13, lit(r * 14 + c, 3), (r + c) % 3 ? "#e8c88a" : "#c8d8f0");
    g.fillStyle = "#e8d8b0";
    g.fillRect(330, 320, 364, 40); // вестибюль
    g.fillStyle = "#080b12";
    g.fillRect(40, 140, 220, 220);
    g.fillRect(764, 100, 240, 260);
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 6; c++) {
        win(50 + c * 34, 150 + r * 20, 24, 12, lit(r * 6 + c + 3, 2));
        win(776 + c * 36, 110 + r * 24, 26, 14, lit(r * 6 + c + 7, 2));
      }
  } else if (kind === "jewelry") {
    // ряд парижских домов: мансарды, балконы, внизу светятся витрины бутика
    for (let k = 0; k < 4; k++) {
      const x = 40 + k * 240;
      g.fillStyle = "#0b0f17";
      g.fillRect(x, 90, 228, 270);
      g.fillStyle = "#0e1420";
      g.beginPath();
      g.moveTo(x - 4, 92);
      g.lineTo(x + 20, 40);
      g.lineTo(x + 208, 40);
      g.lineTo(x + 232, 92);
      g.fill();
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) win(x + 26 + c * 52, 110 + r * 58, 22, 40, lit(k * 12 + r * 4 + c));
    }
    const sh = g.createLinearGradient(0, 290, 0, 350);
    sh.addColorStop(0, "#ffe2a8");
    sh.addColorStop(1, "#a87a3a");
    g.fillStyle = sh;
    for (let i = 0; i < 3; i++) g.fillRect(310 + i * 68, 290, 56, 60);
    g.fillStyle = "#123a2a";
    g.fillRect(296, 276, 220, 14); // маркиза
  } else {
    // особняк напротив
  g.fillRect(180, 120, 660, 230);
  g.beginPath();
  g.moveTo(160, 125);
  g.lineTo(510, 60);
  g.lineTo(860, 125);
  g.fill();
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 9; c++) {
      const lit = ((r * 9 + c) * 7919) % 11 < 2;
      g.fillStyle = lit ? "#e8b46a" : "#141c2a";
      g.fillRect(215 + c * 70, 150 + r * 62, 28, 40);
      if (lit) {
        g.fillStyle = "rgba(232,180,106,.18)";
        g.fillRect(205 + c * 70, 140 + r * 62, 48, 60);
      }
    }
  }
  // улица и фонари
  const road = g.createLinearGradient(0, 350, 0, 512);
  road.addColorStop(0, "#10141c");
  road.addColorStop(1, "#05070a");
  g.fillStyle = road;
  g.fillRect(0, 350, 1024, 162);
  for (const x of [90, 540, 960]) {
    g.fillStyle = "#05070a";
    g.fillRect(x - 3, 190, 6, 170);
    const gl = g.createRadialGradient(x, 195, 0, x, 195, 70);
    gl.addColorStop(0, "rgba(255,200,130,.95)");
    gl.addColorStop(1, "rgba(255,200,130,0)");
    g.fillStyle = gl;
    g.fillRect(x - 70, 125, 140, 140);
    const rf = g.createLinearGradient(0, 360, 0, 512);
    rf.addColorStop(0, "rgba(255,190,120,.35)");
    rf.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = rf;
    g.fillRect(x - 14, 360, 28, 152);
  }
  void cv;
  return tex;
}
// стекло: капли и стекающие дорожки (по погоде), снежинки, вспышка молнии
const rainMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, wet: { value: 1 }, snow: { value: 0 }, flash: { value: 0 } },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `uniform float time, wet, snow, flash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vUv * vec2(26., 14.); vec2 id = floor(uv); vec2 f = fract(uv);
      float r = h(id), sp = 0.15 + 0.5 * r, y = fract(r * 7.0 - time * sp);
      float drop = smoothstep(0.08, 0.0, length((f - vec2(0.5 + 0.3*(r-0.5), y)) * vec2(1.0, 1.6)));
      float trail = smoothstep(0.05, 0.0, abs(f.x - 0.5 - 0.3*(r-0.5))) * smoothstep(y, y + 0.6, f.y) * step(f.y, y + 0.6) * 0.35;
      float a = (drop + trail) * step(1.0 - 0.55 * wet, r);
      vec2 s = vec2(vUv.x * 22. + sin(time * 0.7 + vUv.y * 7.) * 0.3, vUv.y * 11. + time * 0.45), sid = floor(s);
      float flake = smoothstep(0.12, 0.0, length(fract(s) - vec2(h(sid), h(sid + 1.7)))) * step(0.5, h(sid + 4.2)) * snow;
      gl_FragColor = vec4(vec3(0.75, 0.82, 0.95) + flash, a * 0.55 + flake * 0.7 + 0.06 + flash * 0.5);
    }`,
  });

export function buildVan(radioModel, laptopModel) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  const cam = new THREE.PerspectiveCamera(62, 1, 0.03, 30);
  cam.position.set(0, 1.18, 0.55);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const wall = std({ color: 0x2a2d31, roughness: 0.6, metalness: 0.5 }),
    rib = std({ color: 0x1b1d20, roughness: 0.5, metalness: 0.6 });
  const wood = std({ color: 0x3a2a1f, roughness: 0.55 }),
    carpet = std({ color: 0x15171a, roughness: 1 });
  const box = (w, h, d, m, x, y, z) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    scene.add(o);
    return o;
  };
  // кузов: пол, потолок, стены с рёбрами
  box(2.4, 0.04, 3.4, carpet, 0, 0, 0);
  box(2.4, 0.04, 3.4, wall, 0, 2.0, 0);
  box(0.04, 2.0, 3.4, wall, -1.2, 1.0, 0);
  box(2.4, 2.0, 0.04, wall, 0, 1.0, -1.25);
  box(2.4, 2.0, 0.04, wall, 0, 1.0, 1.7);
  // правая стена с окном
  box(0.04, 0.9, 3.4, wall, 1.2, 0.45, 0);
  box(0.04, 0.55, 3.4, wall, 1.2, 1.73, 0);
  box(0.04, 0.55, 1.4, wall, 1.2, 1.18, -0.55 - 0.7 - 0.3);
  box(0.04, 0.55, 1.2, wall, 1.2, 1.18, 1.1);
  for (const z of [-1.0, -0.2, 0.6, 1.4]) {
    box(0.06, 2.0, 0.06, rib, -1.17, 1.0, z);
    box(2.4, 0.06, 0.06, rib, 0, 1.97, z);
  }
  // окно: улица и стекло с дождём
  const streetMat = new THREE.MeshBasicMaterial({ map: streetTexture("mansion") }),
    street = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), streetMat);
  street.position.set(2.6, 1.25, -0.25);
  street.rotation.y = -Math.PI / 2;
  scene.add(street);
  const rain = rainMat(),
    glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), rain);
  glass.position.set(1.19, 1.18, -0.25);
  glass.rotation.y = -Math.PI / 2;
  scene.add(glass);
  // стол
  box(2.2, 0.05, 0.75, wood, 0, 0.76, -0.82);
  box(0.05, 0.74, 0.7, rib, -1.0, 0.38, -0.82);
  box(0.05, 0.74, 0.7, rib, 1.0, 0.38, -0.82);
  // полка над столом с часами-таймером
  box(2.2, 0.03, 0.3, rib, 0, 1.55, -1.08);
  const clock = canvasTex(256, 96),
    clockScr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.1),
      new THREE.MeshBasicMaterial({ map: clock.tex, toneMapped: false }),
    );
  box(
    0.3,
    0.13,
    0.08,
    std({ color: 0x0c0c0d, roughness: 0.4 }),
    0.55,
    1.63,
    -1.0,
  );
  clockScr.position.set(0.55, 1.63, -0.955);
  scene.add(clockScr);
  // планшет: экран с канвасом схемы
  const plan = canvasTex(1024, 1124);
  const tablet = new THREE.Group();
  tablet.position.set(0, 0.9, -0.74); // лежит на подставке: нижний край на столе
  tablet.rotation.x = -1.2;
  scene.add(tablet);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.018),
    std({ color: 0x0d0e10, roughness: 0.4, metalness: 0.4 }),
  );
  body.position.z = -0.01;
  tablet.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.505),
    new THREE.MeshBasicMaterial({ map: plan.tex, toneMapped: false }),
  );
  tablet.add(screen);
  screen.userData.click = "tablet";
  // папка с документами
  const folder = new THREE.Group();
  folder.position.set(0.62, 0.79, -0.72);
  folder.rotation.y = -0.15;
  scene.add(folder);
  const manila = std({ color: 0xd8c38c, roughness: 0.9 });
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.42), manila);
  folder.add(f1);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.013, 0.04), manila);
  tab.position.set(-0.08, 0, -0.22);
  folder.add(tab);
  const stamp = canvasTex(256, 96);
  stamp.g.strokeStyle = "#b2302a";
  stamp.g.lineWidth = 6;
  stamp.g.strokeRect(10, 10, 236, 76);
  stamp.g.fillStyle = "#b2302a";
  stamp.g.font = 'bold 34px "Russo One", sans-serif';
  stamp.g.textAlign = "center";
  stamp.g.fillText("ДОСЬЕ", 128, 62);
  const st = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.07),
    new THREE.MeshBasicMaterial({ map: stamp.tex, transparent: true }),
  );
  st.rotation.x = -Math.PI / 2;
  st.position.y = 0.0075;
  folder.add(st);
  folder.traverse((o) => {
    o.userData.click = "folder";
  });
  // рация с красной кнопкой пеленга
  const radio = new THREE.Group();
  radio.position.set(-0.62, 0.785, -0.85);
  radio.rotation.y = 0.3;
  scene.add(radio);
  // модели ещё не загрузились — временная коробка; setRadio(model) поставит настоящую рацию, когда будет
  let radioBox = null;
  if (radioModel) radio.add(radioModel);
  else
    radioBox = box(
      0.4,
      0.2,
      0.25,
      std({ color: 0x3d4a34, roughness: 0.6 }),
      -0.62,
      0.89,
      -0.85,
    );
  const pingBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.03, 20),
    new THREE.MeshStandardMaterial({
      color: 0xc0201a,
      emissive: 0xff2010,
      emissiveIntensity: 0.4,
      roughness: 0.4,
    }),
  );
  pingBtn.position.set(-0.3, 0.8, -0.62);
  scene.add(pingBtn);
  const pingLbl = canvasTex(128, 48);
  const pl = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.035),
    new THREE.MeshBasicMaterial({
      map: pingLbl.tex,
      transparent: true,
      toneMapped: false,
    }),
  );
  pl.rotation.x = -Math.PI / 2;
  pl.position.set(-0.3, 0.786, -0.55);
  scene.add(pl);
  radio.traverse((o) => {
    o.userData.click = "radio";
  });
  pingBtn.userData.click = "radio";
  // кружка кофе — отсюда пятна на схеме: стенки с толщиной, ручка, кофе чуть ниже края
  const mug = new THREE.Group(),
    cupMat = std({ color: 0xe9e4da, roughness: 0.3 });
  const cup = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, 0], [0.037, 0], [0.041, 0.004], [0.043, 0.05], [0.045, 0.097], [0.044, 0.1],
        [0.041, 0.1], [0.04, 0.097], [0.038, 0.05], [0.035, 0.012], [0, 0.01],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      32,
    ),
    cupMat,
  );
  cup.castShadow = true;
  mug.add(cup);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0065, 8, 18, Math.PI), cupMat);
  handle.rotation.z = -Math.PI / 2; // дуга сбоку, концы у стенки
  handle.position.set(0.043, 0.052, 0);
  mug.add(handle);
  const coffee = new THREE.Mesh(
    new THREE.CircleGeometry(0.0395, 28),
    std({ color: 0x2a160a, roughness: 0.08 }),
  );
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.084;
  mug.add(coffee);
  mug.position.set(0.32, 0.785, -0.55);
  mug.rotation.y = -0.6; // ручка вправо и чуть к штурману
  scene.add(mug);
  // ноутбук в правом дальнем углу стола: взлом системы видеонаблюдения (с дела №11). Модель Poly Haven classic_laptop,
  // на её экран — наша программа (canvas, рисует drawLaptop). Клик или клавиша 3 — наезд на экран, пароль — с клавиатуры
  const laptop = new THREE.Group();
  laptop.position.set(0.9, 0.785, -1.12);
  laptop.rotation.y = -0.4; // экраном к штурману
  scene.add(laptop);
  const lap = canvasTex(640, 480);
  lap.tex.flipY = false; // как у текстур glTF: v вниз
  let lapScr = null,
    lapBox = null;
  // что приближать: центр экрана и его нормаль (к штурману)
  const zoomData = (scr) => {
    scr.updateWorldMatrix(true, false);
    const geo = scr.geometry;
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(scr.matrixWorld),
      n = new THREE.Vector3(),
      na = geo.attributes.normal;
    if (na) for (let i = 0; i < na.count; i++) n.x += na.getX(i), n.y += na.getY(i), n.z += na.getZ(i);
    else n.set(0, 0, 1);
    n.transformDirection(scr.matrixWorld);
    if (n.dot(new THREE.Vector3(0, 1.22, 0.3).sub(c)) < 0) n.negate();
    Object.assign(scr.userData, { zoomC: c, zoomN: n.normalize(), zoomD: 0.34, typing: true });
  };
  function fitLaptop(model) {
    laptop.add(model);
    let scr = null;
    model.traverse((o) => {
      o.userData.click = "laptop";
      if (o.isMesh && o.material && /screen/i.test(o.material.name)) scr = o;
    });
    if (scr) {
      // экран модели — тёмное стекло без UV: проецируем его на свою плоскость (верх экрана — верх картинки)
      // и кладём нашу картинку
      const geo = scr.geometry,
        pos = geo.attributes.position,
        na = geo.attributes.normal,
        n = new THREE.Vector3();
      if (na) for (let i = 0; i < na.count; i++) n.x += na.getX(i), n.y += na.getY(i), n.z += na.getZ(i);
      if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
      n.normalize();
      if (n.z < 0) n.negate(); // лицом вперёд (модель смотрит в +Z)
      const U = new THREE.Vector3(0, 1, 0).cross(n).normalize(),
        V = n.clone().cross(U).normalize(),
        p = new THREE.Vector3(),
        pu = [],
        pv = [];
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        pu.push(p.dot(U));
        pv.push(p.dot(V));
      }
      const u0 = Math.min(...pu), u1 = Math.max(...pu), v0 = Math.min(...pv), v1 = Math.max(...pv),
        uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pu[i] - u0) / (u1 - u0);
        uv[i * 2 + 1] = (v1 - pv[i]) / (v1 - v0); // v вниз, как у холста с flipY = false
      }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      scr.material = new THREE.MeshBasicMaterial({ map: lap.tex, toneMapped: false });
      zoomData(scr);
      lapScr = scr;
    }
    return !!scr;
  }
  // запасной ноутбук из брусков (пока модель не загрузилась)
  function boxLaptop() {
    const g = new THREE.Group(),
      lapMat = std({ color: 0xbab3a2, roughness: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.26), lapMat);
    base.position.set(0, 0.015, 0.13);
    g.add(base);
    const lid = new THREE.Group();
    lid.position.set(0, 0.03, 0.01);
    lid.rotation.x = -0.25;
    g.add(lid);
    const lidBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.012), lapMat);
    lidBox.position.set(0, 0.12, -0.006);
    lid.add(lidBox);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.21), new THREE.MeshBasicMaterial({ map: lap.tex, toneMapped: false }));
    scr.position.set(0, 0.125, 0.0012);
    lid.add(scr);
    lap.tex.repeat.set(1, -1); // у плоскости v вверх
    lap.tex.offset.set(0, 1);
    laptop.add(g);
    g.traverse((o) => {
      o.userData.click = "laptop";
    });
    zoomData(scr);
    lapScr = scr;
    return g;
  }
  if (!laptopModel || !fitLaptop(laptopModel)) lapBox = boxLaptop();
  // мониторы наблюдения на стене за столом: улица у особняка (картинку рисует drawFeeds);
  // с дела №5 на них живая картинка с камер в доме (liveFeeds в main.js), тогда drawFeeds пишет только надписи
  const feeds = [],
    monMat = std({ color: 0x15161a, roughness: 0.5, metalness: 0.4 }),
    ledMat = new THREE.MeshBasicMaterial({ color: 0x40ff70, toneMapped: false });
  [-0.62, 0, 0.62].forEach((x, i) => {
    const c = canvasTex(256, 192);
    box(0.5, 0.37, 0.12, monMat, x, 1.31, -1.17);
    const scr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.31),
      new THREE.MeshBasicMaterial({ map: c.tex, toneMapped: false }),
    );
    scr.position.set(x, 1.315, -1.108);
    scr.userData.click = "feed" + i; // клик — монитор крупно
    scene.add(scr);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), ledMat);
    led.position.set(x + 0.2, 1.145, -1.108);
    scene.add(led);
    feeds.push(Object.assign(c, { i, scr }));
  });
  // провода от мониторов вниз за стол
  const cable = std({ color: 0x0b0b0c, roughness: 0.7 });
  for (const [x0, x1] of [[-0.62, -0.9], [0, -0.75], [0.62, 0.85]]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0, 1.13, -1.2),
      new THREE.Vector3((x0 + x1) / 2, 0.98, -1.21),
      new THREE.Vector3(x1, 0.82, -1.2),
      new THREE.Vector3(x1 + 0.05, 0.4, -1.15),
    ]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 6), cable));
  }
  // настольная лампа: основание, стойка, колпак над столом
  const lampMat = std({ color: 0x23302a, roughness: 0.4, metalness: 0.5 });
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 20), lampMat);
  lb.position.set(-0.42, 0.79, -1.0);
  scene.add(lb);
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 8), lampMat);
  arm1.position.set(-0.42, 1.03, -0.98);
  arm1.rotation.x = 0.12;
  scene.add(arm1);
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 8), lampMat);
  arm2.position.set(-0.41, 1.36, -0.84);
  arm2.rotation.x = 1.0;
  scene.add(arm2);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.09, 0.11, 20, 1, true),
    std({ color: 0x23302a, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }),
  );
  shade.position.set(-0.4, 1.47, -0.7);
  scene.add(shade);
  // свет: тёплая лампа над столом, свечение экрана, холод из окна
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x0a0806, 0.6));
  const lamp = new THREE.PointLight(0xffa860, 2.2, 3.5, 2);
  lamp.position.set(-0.4, 1.45, -0.7);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  scene.add(lamp);
  const bulb = glowSprite(0xffa860, 0.25, 0.9);
  bulb.position.copy(lamp.position);
  scene.add(bulb);
  const glow = new THREE.PointLight(0x6fb8ff, 1.2, 1.6, 2);
  glow.position.set(0, 1.0, -0.6);
  scene.add(glow);
  const moon = new THREE.PointLight(0x7da4d8, 1.0, 3, 2);
  moon.position.set(1.0, 1.25, -0.25);
  scene.add(moon);
  const clickables = [];
  scene.traverse((o) => {
    if (o.isMesh && o.userData.click) clickables.push(o);
  });
  return {
    scene,
    cam,
    feeds,
    plan,
    lap,
    get lapScr() {
      return lapScr;
    },
    get laptopMissing() {
      return !!lapBox;
    },
    // модель ноутбука догрузилась — вместо брусков
    setLaptop(model) {
      if (!lapBox || !model) return;
      laptop.remove(lapBox);
      lapBox = null;
      for (let i = clickables.length - 1; i >= 0; i--) if (clickables[i].userData.click === "laptop") clickables.splice(i, 1);
      if (!fitLaptop(model)) lapBox = boxLaptop();
      laptop.traverse((o) => {
        if (o.isMesh && o.userData.click === "laptop") clickables.push(o);
      });
    },
    get radioMissing() {
      return !!radioBox;
    },
    setRadio(model) {
      if (!radioBox || !model) return;
      scene.remove(radioBox);
      radioBox = null;
      model.traverse((o) => {
        o.userData.click = "radio";
      });
      radio.add(model);
      model.traverse((o) => {
        if (o.isMesh && !clickables.includes(o)) clickables.push(o);
      });
    },
    clock,
    pingLbl,
    pingBtn,
    rain,
    streetMat,
    tablet,
    screen,
    clickables,
  };
}

// картинка камер наблюдения: ночной зелёный, силуэт особняка, помехи, время, мигающий REC
export function drawFeeds(van, now) {
  const d = new Date(),
    hh = (n) => String(n).padStart(2, "0"),
    time = `${hh(d.getHours())}:${hh(d.getMinutes())}:${hh(d.getSeconds())}`;
  for (const f of van.feeds) {
    const g = f.g,
      W = 256,
      H = 192;
    if (f.live) g.clearRect(0, 0, W, H);
    else {
    g.fillStyle = "#08100b";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#18271d";
    const lot = van.lot || "mansion";
    if (f.i === 0 && lot !== "mansion") {
      // фасад здания дела: музей — колоннада, банк — каменный блок, офис — башня, ювелирка — ряд домов
      if (lot === "museum") {
        g.fillRect(14, 84, 228, 90);
        g.beginPath();
        g.moveTo(70, 70);
        g.lineTo(128, 40);
        g.lineTo(186, 70);
        g.fill();
        g.fillStyle = "#223428";
        for (let i = 0; i < 6; i++) g.fillRect(78 + i * 20, 72, 7, 96);
      } else if (lot === "bank") {
        g.fillRect(40, 40, 176, 134);
        g.fillStyle = "#0c150f";
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 6; c++) g.fillRect(52 + c * 27, 52 + r * 30, 12, 18);
        g.fillStyle = "#4f7a58";
        g.fillRect(52 + 2 * 27, 82, 12, 18);
      } else if (lot === "office") {
        g.fillRect(78, 0, 100, 176);
        for (let r = 0; r < 14; r++)
          for (let c = 0; c < 6; c++) {
            g.fillStyle = (r * 6 + c) % 7 === 3 ? "#4f7a58" : "#0c150f";
            g.fillRect(84 + c * 15, 6 + r * 12, 10, 7);
          }
      } else {
        for (let k = 0; k < 3; k++) g.fillRect(14 + k * 80, 56, 74, 118);
        g.fillStyle = "#4f7a58";
        for (let i = 0; i < 3; i++) g.fillRect(100 + i * 22, 140, 16, 26);
      }
    } else if (f.i === 0) {
      // фасад с окнами
      g.fillRect(30, 60, 196, 110);
      g.beginPath();
      g.moveTo(20, 62);
      g.lineTo(128, 26);
      g.lineTo(236, 62);
      g.fill();
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 6; c++) {
          g.fillStyle = (r * 6 + c) % 5 === 2 ? "#4f7a58" : "#0c150f";
          g.fillRect(44 + c * 30, 78 + r * 40, 14, 24);
        }
    } else if (f.i === 1 && lot !== "mansion") {
      // вход вора: дверь в стене
      g.fillRect(0, 50, W, 130);
      g.fillStyle = "#0c150f";
      g.fillRect(104, 92, 48, 88);
      g.fillStyle = "#4f7a58";
      g.fillRect(142, 134, 4, 6);
    } else if (f.i === 1) {
      // ворота и ограда
      g.fillRect(70, 70, 22, 110);
      g.fillRect(164, 70, 22, 110);
      g.fillStyle = "#223428";
      for (let x = 0; x < W; x += 9) if (x < 70 || x > 186) g.fillRect(x, 100, 3, 80);
      g.fillRect(0, 100, 70, 3);
      g.fillRect(186, 100, 70, 3);
    } else {
      // двор: дорожка и кусты
      g.beginPath();
      g.moveTo(100, H);
      g.lineTo(122, 80);
      g.lineTo(134, 80);
      g.lineTo(160, H);
      g.fill();
      g.fillStyle = "#14231a";
      for (const [x, y, r] of [[50, 110, 26], [210, 120, 30], [80, 150, 20], [190, 160, 22]]) {
        g.beginPath();
        g.arc(x, y, r, 0, 6.283);
        g.fill();
      }
    }
    for (let k = 0; k < 500; k++) {
      g.fillStyle = `rgba(190,255,200,${Math.random() * 0.14})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 1);
    }
    g.fillStyle = "rgba(0,0,0,.28)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    const band = ((now / 9 + f.i * 70) % (H + 40)) - 20;
    g.fillStyle = "rgba(170,255,190,.07)";
    g.fillRect(0, band, W, 16);
    }
    g.fillStyle = "#9fe8b0";
    g.font = 'bold 15px "PT Mono", monospace';
    g.textAlign = "left";
    g.fillText(f.live ? `КАМ ${f.i + 1}` : ["ФАСАД", van.lot === "mansion" || !van.lot ? "ВОРОТА" : "ВХОД", van.lot === "mansion" || !van.lot ? "ДВОР" : "УЛИЦА"][f.i], 8, 20);
    g.fillText(time, W - 82, H - 10);
    if (((now / 600) | 0) % 2) {
      g.fillStyle = "#ff3b3b";
      g.beginPath();
      g.arc(W - 46, 15, 5, 0, 6.283);
      g.fill();
      g.fillStyle = "#ffb0b0";
      g.fillText("REC", W - 38, 20);
    }
    f.tex.needsUpdate = true;
  }
}

// управление камерой в кабине: курсор свободный, взгляд следует за мышью; клик по планшету — наезд
export class VanView {
  constructor(van, canvas) {
    this.v = van;
    this.canvas = canvas;
    this.mx = 0;
    this.my = 0;
    this.yaw = 0;
    this.pitch = -0.2;
    this.zoom = 0;
    this.zoomTo = 0;
    this.focus = null; // что приближаем: null — планшет, иначе экран монитора
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onClick = null;
    this.onPlan = null;
    this.active = false;
    this.hover = null;
    this.home = new THREE.Vector3(0, 1.22, 0.3);
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.my = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.mouse.set(this.mx, -this.my);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active || e.button !== 0) return;
      if (this.zoomTo) {
        // клик по самой схеме (в обучении штурмана) — onPlan(u, v); вернул true — остаёмся у планшета
        if (this.onPlan && !this.focus) {
          const r = canvas.getBoundingClientRect();
          this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
          this.ray.setFromCamera(this.mouse, this.v.cam);
          const h = this.ray.intersectObject(this.v.screen, false)[0];
          if (h && h.uv && this.onPlan(h.uv.x, h.uv.y)) return;
        }
        this.zoomTo = 0;
        return;
      }
      const hit = this.pick();
      if (!hit) return;
      if (hit === "tablet") this.look(null);
      else if (hit.startsWith("feed")) this.look(this.v.feeds[+hit.slice(4)].scr);
      else if (this.onClick) this.onClick(hit);
    });
    addEventListener("keydown", (e) => {
      if (!this.active || e.repeat || (e.target && e.target.tagName === "INPUT")) return; // зажатая клавиша не повторяется
      if (this.zoomTo && this.focus && this.focus.userData.typing && e.code !== "Escape") return; // у ноутбука цифры — пароль
      if (e.code === "Escape") this.zoomTo = 0;
      // 1 — схема крупно / обратно, 2 — папка с документами
      if (e.code === "Digit1") {
        if (this.zoomTo) this.zoomTo = 0;
        else this.look(null);
      }
      if (e.code === "Digit2" && this.onClick) this.onClick("folder");
      if (e.code === "Digit3" && this.onClick) this.onClick("laptop");
    });
    // колесо мыши: вперёд — к планшету, назад — отъехать
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.active) return;
        if (e.deltaY < 0) {
          if (!this.zoomTo) this.look(null);
        } else this.zoomTo = 0;
      },
      { passive: true },
    );
  }
  // приблизить: obj — монитор, null — планшет
  look(obj) {
    this.focus = obj;
    this.zoomTo = 1;
  }
  pick() {
    this.ray.setFromCamera(this.mouse, this.v.cam);
    const h = this.ray.intersectObjects(this.v.clickables, false)[0];
    return h ? h.object.userData.click : null;
  }
  update(dt, now) {
    const c = this.v.cam,
      k = 1 - Math.exp(-dt * 5);
    this.zoom += (this.zoomTo - this.zoom) * Math.min(1, dt * 4);
    // свободный взгляд: мышь у края экрана поворачивает голову
    this.yaw += (-this.mx * 0.75 - this.yaw) * k;
    this.pitch += (-0.2 - this.my * 0.4 - this.pitch) * k;
    const t = this.focus || this.v.tablet,
      tp = new THREE.Vector3(),
      zd = t.userData;
    if (zd.zoomC) tp.copy(zd.zoomC);
    else t.getWorldPosition(tp);
    // к планшету — сверху (он лежит на столе), к монитору — прямо перед экраном, к ноутбуку — по нормали экрана
    const near = tp
      .clone()
      .add(zd.zoomN ? zd.zoomN.clone().multiplyScalar(zd.zoomD) : this.focus ? new THREE.Vector3(0, 0, 0.36) : new THREE.Vector3(0, 0.47, 0.18));
    c.position.lerpVectors(this.home, near, this.zoom);
    const look = new THREE.Vector3(
      Math.sin(this.yaw) * -1,
      Math.sin(this.pitch),
      -Math.cos(this.yaw),
    ).add(this.home);
    const lookZoom = tp.clone().add(this.focus ? new THREE.Vector3() : new THREE.Vector3(0, 0.01, 0.02));
    c.lookAt(look.lerp(lookZoom, this.zoom));
    this.v.rain.uniforms.time.value = now / 1000;
    const h = this.zoom < 0.05 ? this.pick() : null;
    if (h !== this.hover) {
      this.hover = h;
      this.canvas.style.cursor = h ? "pointer" : "default";
    }
  }
}

// экран ноутбука (программа взлома): t — { g, tex } холст 640×480; st — { mode, buf, msg, msgCol, cams, strikes }
// mode: none — взламывать нечего, off — нет связи со щитком, on — ждёт пароль, ok — доступ получен
export function drawLaptop(t, st, now) {
  const { g, tex } = t,
    W = 640,
    H = 480,
    GREEN = "#7dffa8",
    DIM = "#3f7a55";
  g.fillStyle = "#04100a";
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  glow.addColorStop(0, "rgba(40,120,70,.18)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = GREEN;
  g.font = 'bold 26px "PT Mono", monospace';
  g.fillText("NVR-ACCESS v2.1", 24, 44);
  g.textAlign = "right";
  g.fillStyle = st.mode === "off" || st.mode === "none" ? "#ff6a5a" : GREEN;
  g.fillText(st.mode === "none" ? "○ НЕТ СЕТИ" : st.mode === "off" ? "○ НЕТ СВЯЗИ" : "● СВЯЗЬ", W - 24, 44);
  g.fillStyle = DIM;
  g.fillRect(24, 60, W - 48, 3);
  g.textAlign = "left";
  const line = (txt, y, col = GREEN, font = 'bold 30px "PT Mono", monospace') => {
    g.fillStyle = col;
    g.font = font;
    g.fillText(txt, 24, y);
  };
  const small = '22px "PT Mono", monospace';
  if (st.mode === "none") {
    line("ПОИСК СЕТИ…", 130);
    line("систем видеонаблюдения", 180, DIM, small);
    line("поблизости нет", 210, DIM, small);
  } else if (st.mode === "off") {
    line("НЕТ СВЯЗИ С NVR", 130, "#ff8a7a");
    line("вор должен найти щиток 📟", 180, DIM, small);
    line("и воткнуть шнур в порт LAN", 210, DIM, small);
  } else if (st.mode === "ok") {
    line("ДОСТУП ПОЛУЧЕН ✓", 130);
    line(`КАМЕРЫ (${st.cams}): ВЫКЛ`, 185);
    line("запись охране не идёт", 235, DIM, small);
    line("видео — на мониторах над столом", 265, DIM, small);
  } else {
    line(`NVR ПОДКЛЮЧЁН · КАМЕР: ${st.cams}`, 118, GREEN, 'bold 24px "PT Mono", monospace');
    line("ВВЕДИТЕ ПАРОЛЬ:", 170);
    // четыре клетки пароля, курсор мигает в следующей
    for (let i = 0; i < 4; i++) {
      const x = 24 + i * 96,
        y = 195;
      g.strokeStyle = GREEN;
      g.lineWidth = 4;
      g.strokeRect(x, y, 80, 92);
      const ch = st.buf[i];
      g.fillStyle = GREEN;
      g.font = 'bold 64px "PT Mono", monospace';
      g.textAlign = "center";
      if (ch) g.fillText(ch, x + 40, y + 70);
      else if (i === st.buf.length && ((now / 450) | 0) % 2) g.fillRect(x + 24, y + 70, 32, 8);
      g.textAlign = "left";
    }
    if (st.strikes) line(`ошибок: ${st.strikes} из 2`, 330, "#ffb35a", small);
  }
  if (st.msg) line(st.msg, 380, st.msgCol || GREEN, 'bold 26px "PT Mono", monospace');
  g.fillStyle = DIM;
  g.fillRect(24, 410, W - 48, 2);
  line(st.mode === "on" ? "цифры · Backspace — стереть · Enter — войти" : "Esc — отъехать", 448, DIM, '20px "PT Mono", monospace');
  // строки ЖК-экрана
  g.fillStyle = "rgba(0,0,0,.22)";
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  if (tex) tex.needsUpdate = true;
}
