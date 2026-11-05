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

// ночная улица за окном: небо, силуэт особняка с окнами, фонари, мокрый асфальт
function streetTexture() {
  const { cv, g, tex } = canvasTex(1024, 512);
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, "#060b16");
  sky.addColorStop(1, "#16233a");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(200,215,240,.7)";
  for (let i = 0; i < 60; i++)
    g.fillRect((i * 151) % 1024, (i * 37) % 150, 1, 1);
  // особняк напротив
  g.fillStyle = "#0b0f17";
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
// стекло с дождём: капли и стекающие дорожки
const rainMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `uniform float time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vUv * vec2(26., 14.); vec2 id = floor(uv); vec2 f = fract(uv);
      float r = h(id), sp = 0.15 + 0.5 * r, y = fract(r * 7.0 - time * sp);
      float drop = smoothstep(0.08, 0.0, length((f - vec2(0.5 + 0.3*(r-0.5), y)) * vec2(1.0, 1.6)));
      float trail = smoothstep(0.05, 0.0, abs(f.x - 0.5 - 0.3*(r-0.5))) * smoothstep(y, y + 0.6, f.y) * step(f.y, y + 0.6) * 0.35;
      float a = (drop + trail) * step(0.45, r);
      gl_FragColor = vec4(vec3(0.75, 0.82, 0.95), a * 0.55 + 0.06);
    }`,
  });

export function buildVan(radioModel) {
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
  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: streetTexture() }),
  );
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
  if (radioModel) radio.add(radioModel);
  else
    box(
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
  // кружка кофе — отсюда пятна на схеме
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.1, 20),
    std({ color: 0xe9e4da, roughness: 0.35 }),
  );
  mug.position.set(0.32, 0.835, -0.55);
  scene.add(mug);
  const coffee = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 20),
    std({ color: 0x2a160a, roughness: 0.15 }),
  );
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(0.32, 0.875, -0.55);
  scene.add(coffee);
  // мониторы наблюдения на стене за столом: три камеры у особняка (картинку рисует drawFeeds)
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
    scene.add(scr);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), ledMat);
    led.position.set(x + 0.2, 1.145, -1.108);
    scene.add(led);
    feeds.push(Object.assign(c, { i }));
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
    clock,
    pingLbl,
    pingBtn,
    rain,
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
    g.fillStyle = "#08100b";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#18271d";
    if (f.i === 0) {
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
    g.fillStyle = "#9fe8b0";
    g.font = 'bold 15px "PT Mono", monospace';
    g.textAlign = "left";
    g.fillText(`КАМ ${f.i + 1}`, 8, 20);
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
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onClick = null;
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
        this.zoomTo = 0;
        return;
      }
      const hit = this.pick();
      if (!hit) return;
      if (hit === "tablet") this.zoomTo = 1;
      else if (this.onClick) this.onClick(hit);
    });
    addEventListener("keydown", (e) => {
      if (!this.active || (e.target && e.target.tagName === "INPUT")) return;
      if (e.code === "Escape") this.zoomTo = 0;
      // 1 — схема крупно / обратно, 2 — папка с документами
      if (e.code === "Digit1") this.zoomTo = this.zoomTo ? 0 : 1;
      if (e.code === "Digit2" && this.onClick) this.onClick("folder");
    });
    // колесо мыши: вперёд — к планшету, назад — отъехать
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.active) return;
        this.zoomTo = e.deltaY < 0 ? 1 : 0;
      },
      { passive: true },
    );
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
    const t = this.v.tablet,
      tp = new THREE.Vector3();
    t.getWorldPosition(tp);
    const near = tp.clone().add(new THREE.Vector3(0, 0.47, 0.18));
    c.position.lerpVectors(this.home, near, this.zoom);
    const look = new THREE.Vector3(
      Math.sin(this.yaw) * -1,
      Math.sin(this.pitch),
      -Math.cos(this.yaw),
    ).add(this.home);
    const lookZoom = tp.clone().add(new THREE.Vector3(0, 0.01, 0.02));
    c.lookAt(look.lerp(lookZoom, this.zoom));
    this.v.rain.uniforms.time.value = now / 1000;
    const h = this.zoom < 0.05 ? this.pick() : null;
    if (h !== this.hover) {
      this.hover = h;
      this.canvas.style.cursor = h ? "pointer" : "default";
    }
  }
}
