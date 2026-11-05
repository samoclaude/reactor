// Крупные планы: кодовая панель двери, панель сейфа, записка.
// Камера плавно наезжает на предмет, курсор свободен, кнопки нажимаются мышью (raycaster).
import * as THREE from "three";

const FONT_GLYPH = '"Noto Sans", "Arial Unicode MS", sans-serif';
function canvasTex(w, h, draw) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const redraw = (...a) => {
    const g = cv.getContext("2d");
    g.clearRect(0, 0, w, h);
    draw(g, w, h, ...a);
    t.needsUpdate = true;
  };
  redraw();
  return { tex: t, redraw };
}
function keyMat(label, font, color = "#bfe8cf") {
  const { tex } = canvasTex(96, 96, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 96);
    gr.addColorStop(0, "#3a3f44");
    gr.addColorStop(1, "#202326");
    g.fillStyle = gr;
    g.fillRect(0, 0, 96, 96);
    g.strokeStyle = "#555b61";
    g.lineWidth = 4;
    g.strokeRect(2, 2, 92, 92);
    g.fillStyle = color;
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = color;
    g.shadowBlur = 8;
    g.fillText(label, 48, 52);
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    metalness: 0.3,
  });
}

/* ---------- кодовая панель: 1–9, стереть, 0 ---------- */
export function makeKeypad() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: 0x2b2f33,
    roughness: 0.35,
    metalness: 0.85,
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.27, 0.018), metal);
  g.add(plate);
  const scr = canvasTex(256, 80, (c, w, h, text = "", col = "#39ff88") => {
    c.fillStyle = "#04140b";
    c.fillRect(0, 0, w, h);
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 10;
    c.font = 'bold 46px "PT Mono", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, w / 2, h / 2 + 2);
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.04),
    new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }),
  );
  screen.position.set(0, 0.095, 0.0095);
  g.add(screen);
  const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", ""],
    buttons = [];
  labels.forEach((l, i) => {
    if (!l) return;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.038, 0.032, 0.012),
      keyMat(
        l,
        l === "⌫" ? "bold 44px sans-serif" : 'bold 52px "PT Mono", monospace',
      ),
    );
    b.position.set(
      -0.045 + (i % 3) * 0.045,
      0.045 - Math.floor(i / 3) * 0.04,
      0.012,
    );
    b.userData.btn = l;
    b.userData.z0 = b.position.z;
    g.add(b);
    buttons.push(b);
  });
  g.traverse((o) => {
    o.userData.dynamic = true;
  });
  return {
    group: g,
    buttons,
    screen: scr,
    face: new THREE.Vector3(0, 0, 1),
    dist: 0.42,
  };
}

/* ---------- панель сейфа: 6 кнопок с символами и огоньки ошибок ---------- */
export function makeSafePanel(glyphs, maxStrikes) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.32, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x16181b,
      roughness: 0.5,
      metalness: 0.6,
    }),
  );
  g.add(plate);
  const buttons = glyphs.map((gl, i) => {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.02),
      keyMat(gl, `56px ${FONT_GLYPH}`, "#ffe6a8"),
    );
    b.position.set(
      -0.13 + (i % 3) * 0.13,
      0.055 - Math.floor(i / 3) * 0.12,
      0.014,
    );
    b.userData.btn = i;
    b.userData.z0 = b.position.z;
    const num = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 0.03),
      new THREE.MeshBasicMaterial({
        map: canvasTex(48, 48, (c) => {
          c.fillStyle = "#8a8f96";
          c.font = 'bold 30px "PT Mono", monospace';
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(String(i + 1), 24, 26);
        }).tex,
        transparent: true,
      }),
    );
    num.position.set(b.position.x - 0.062, b.position.y + 0.045, 0.011);
    g.add(num);
    g.add(b);
    return b;
  });
  const leds = Array.from({ length: maxStrikes }, (_, i) => {
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x331010, toneMapped: false }),
    );
    l.position.set(0.17 - i * 0.03, -0.135, 0.012);
    g.add(l);
    return l;
  });
  g.traverse((o) => {
    o.userData.dynamic = true;
  });
  return {
    group: g,
    buttons,
    leds,
    face: new THREE.Vector3(0, 0, 1),
    dist: 0.62,
  };
}

/* ---------- записка: бумага с текстом ---------- */
export function makeNote(lines) {
  const { tex } = canvasTex(512, 360, (c) => {
    c.fillStyle = "#efe6cf";
    c.fillRect(0, 0, 512, 360);
    c.strokeStyle = "rgba(80,110,160,.25)";
    for (let y = 60; y < 360; y += 34) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(512, y);
      c.stroke();
    }
    c.fillStyle = "#1d2a48";
    c.textAlign = "center";
    lines.forEach((l, i) => {
      c.font =
        i === 1
          ? 'bold 64px "PT Mono", monospace'
          : '26px "PT Mono", monospace';
      c.fillText(l, 256, 80 + i * 92);
    });
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.17),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
  );
  m.userData.dynamic = true;
  return { mesh: m, face: new THREE.Vector3(0, 0, 1), dist: 0.3 };
}

/* ---------- сам крупный план ---------- */
export class Closeup {
  constructor(camera, canvas) {
    this.cam = camera;
    this.canvas = canvas;
    this.active = null;
    this.t = 0;
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.from = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.to = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.onPress = null;
    this.hover = null;
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active || this.t < 0.9 || e.button !== 0) return;
      const b = this.pick();
      if (b) {
        this.press(b);
      }
    });
  }
  pick() {
    if (!this.active) return null;
    this.ray.setFromCamera(this.mouse, this.cam);
    const hit = this.ray.intersectObjects(this.active.buttons, false)[0];
    return hit ? hit.object : null;
  }
  press(b) {
    b.position.z = b.userData.z0 - 0.006;
    setTimeout(() => {
      b.position.z = b.userData.z0;
    }, 120);
    if (this.onPress) this.onPress(this.active, b.userData.btn);
  }
  // target: { group или mesh (предмет), face (локальная нормаль лица), dist, buttons, kind }
  enter(target) {
    const obj = target.group || target.mesh;
    obj.updateMatrixWorld(true);
    const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld),
      n = target.face.clone().transformDirection(obj.matrixWorld);
    this.from.p.copy(this.cam.position);
    this.from.q.copy(this.cam.quaternion);
    this.to.p.copy(p).addScaledVector(n, target.dist);
    // out — смотреть не на предмет, а от него наружу (из укрытия в комнату)
    const m = new THREE.Matrix4().lookAt(
      this.to.p,
      target.out ? this.to.p.clone().add(n) : p,
      Math.abs(n.y) > 0.9
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(0, 1, 0),
    );
    this.to.q.setFromRotationMatrix(m);
    this.active = Object.assign({ buttons: [] }, target);
    this.t = 0;
    this.leaving = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.canvas.style.cursor = "default";
  }
  exit() {
    if (!this.active) return;
    this.leaving = true;
    this.t = 0;
  }
  // возвращает true, пока крупный план управляет камерой
  update(dt, back) {
    if (!this.active) return false;
    this.t = Math.min(1, this.t + dt / 0.45);
    const k = this.t * this.t * (3 - 2 * this.t);
    if (!this.leaving) {
      this.cam.position.lerpVectors(this.from.p, this.to.p, k);
      this.cam.quaternion.slerpQuaternions(this.from.q, this.to.q, k);
    } else {
      this.cam.position.lerpVectors(this.to.p, back.p, k);
      this.cam.quaternion.slerpQuaternions(this.to.q, back.q, k);
      if (this.t >= 1) {
        this.active = null;
        this.canvas.style.cursor = "";
        return false;
      }
    }
    const h = this.t >= 1 && !this.leaving ? this.pick() : null;
    if (h !== this.hover) {
      if (this.hover) this.hover.material.emissiveIntensity = 0.35;
      if (h) h.material.emissiveIntensity = 0.9;
      this.hover = h;
      this.canvas.style.cursor = h ? "pointer" : "default";
    }
    return true;
  }
}
