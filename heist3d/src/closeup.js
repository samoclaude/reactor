// Крупные планы: кодовая панель двери, панель сейфа, записка.
// Камера плавно наезжает на предмет, курсор свободен, кнопки нажимаются мышью (raycaster).
import * as THREE from "three";
import { DCOL, WCOL, GLYPHS } from "./logic.js";
import { glowSprite } from "./world.js";

/* ---------- символы сейфа: свои значки вместо букв (букву легко назвать, значок — нет) ----------
   В логике у символа прежний идентификатор (буква из GLYPHS), рисуется — значок из линий в квадрате 100×100.
   Значки идут семействами по 4 похожих: крючки, кольца, зигзаги, вилы, спирали и волны, рамки */
const GLYPH_D = [
  "M50 86 L50 32 Q50 15 65 15 Q80 15 80 30 M24 80 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0",
  "M50 86 L50 32 Q50 15 35 15 Q20 15 20 30 M62 80 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0",
  "M50 86 L50 32 Q50 15 65 15 Q80 15 80 30 M50 50 L33 41 M50 68 L33 59",
  "M50 16 L50 84 M50 16 Q72 16 76 34 M50 84 Q28 84 24 66",
  "M24 50 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0 M42 38 Q34 50 42 62",
  "M24 46 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0 M58 34 Q66 46 58 58 M49 89 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  "M32 32 A26 26 0 1 1 32 68 M12 50 L54 50 M66 49 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  "M74 28 A31 31 0 1 0 74 72 M42 38 A13 13 0 1 1 42 62",
  "M22 18 L72 38 L28 60 L76 82 M18 86 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  "M20 14 L76 30 L24 50 L76 68 L28 88",
  "M22 18 L72 38 L28 60 L76 82 M16 49 L84 49",
  "M24 14 L72 32 L28 52 L62 70 M60 80 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0",
  "M24 18 Q24 56 50 56 Q76 56 76 18 M50 14 L50 88 L70 88",
  "M30 14 L30 40 Q30 56 50 56 Q70 56 70 40 L70 14 M50 56 L50 88 M34 74 L66 74",
  "M24 88 Q24 52 50 52 Q76 52 76 88 M50 52 L50 88 M50 12 L50 20 M41 29 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M50 38 L50 52",
  "M24 18 Q24 62 50 62 Q76 62 76 18 M50 62 L50 42 M50 62 L50 88 M49 24 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  "M50 50 A3 3 0 0 1 56 50 A6 6 0 0 1 44 50 A12 12 0 0 1 68 50 A18 18 0 0 1 32 50 A24 24 0 0 1 80 50",
  "M44 50 A3 3 0 0 1 50 50 A6 6 0 0 1 38 50 A12 12 0 0 1 62 50 A18 18 0 0 1 26 50 M62 50 L88 50 L88 30",
  "M12 55 Q26 26 40 55 Q54 84 68 55 M84 22 L84 86",
  "M12 60 Q28 30 44 60 Q60 90 76 60 Q83 47 90 52 M27 20 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M59 30 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  "M62 14 L30 14 L30 86 L62 86 M44 34 L72 66",
  "M14 22 L86 22 M28 22 L36 72 M50 22 L50 46 M72 22 L64 86",
  "M20 40 A30 30 0 0 0 80 40 M12 28 L74 14 M49 54 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  "M20 16 L20 82 L84 82 M30 72 L30 48 L54 72 Z",
];
export const GLYPH_PATHS = Object.fromEntries(
  GLYPHS.map((g, i) => [g, GLYPH_D[i]]),
);
// значок для папки штурмана (HTML)
export const glyphSVG = (g) =>
  `<svg viewBox="0 0 100 100" class="gsym"><path d="${GLYPH_PATHS[g]}" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
function keyMat(label, font, color = "#bfe8cf", sub = "") {
  // рисуем в координатах 96, холст 128 — чётче вблизи
  const { tex } = canvasTex(128, 128, (g) => {
    g.setTransform(4 / 3, 0, 0, 4 / 3, 0, 0);
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
    if (GLYPH_PATHS[label]) {
      // символ сейфа — значок из линий
      g.save();
      g.translate(12, 12);
      g.scale(0.72, 0.72);
      g.strokeStyle = color;
      g.lineWidth = 8;
      g.lineCap = g.lineJoin = "round";
      g.stroke(new Path2D(GLYPH_PATHS[label]));
      g.restore();
    } else g.fillText(label, 48, sub ? 40 : 52);
    // подпись под стрелкой: «вперёд», «вправо»…
    if (sub) {
      g.shadowBlur = 0;
      g.fillStyle = "#aab3bb";
      g.font = 'bold 17px "PT Mono", monospace';
      g.fillText(sub, 48, 78);
    }
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

/* ---------- общее для панелей: скруглённые бруски, подписи, винты ---------- */
const roundCache = new Map();
// скруглённый брусок w×h×d (лицо в +Z, центр в нуле): корпус или кнопка
function rounded(w, h, d, r, b = 0.002) {
  const k = [w, h, d, r, b].join("|");
  if (roundCache.has(k)) return roundCache.get(k);
  const s = new THREE.Shape(),
    x = -w / 2 + b,
    y = -h / 2 + b,
    W = w - 2 * b,
    H = h - 2 * b,
    q = Math.min(r, W / 2, H / 2);
  s.moveTo(x + q, y);
  s.lineTo(x + W - q, y);
  s.quadraticCurveTo(x + W, y, x + W, y + q);
  s.lineTo(x + W, y + H - q);
  s.quadraticCurveTo(x + W, y + H, x + W - q, y + H);
  s.lineTo(x + q, y + H);
  s.quadraticCurveTo(x, y + H, x, y + H - q);
  s.lineTo(x, y + q);
  s.quadraticCurveTo(x, y, x + q, y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 6,
  });
  g.translate(0, 0, -(d - 2 * b) / 2);
  roundCache.set(k, g);
  return g;
}
// подпись на кнопке: прозрачная картинка поверх лица, светится сама
function faceLabel(w, h, draw) {
  const px = 128,
    t = canvasTex(Math.round((px * w) / h), px, draw);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.9, h * 0.9),
    new THREE.MeshBasicMaterial({
      map: t.tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  return m;
}
const GREEN = "#c8ffd9",
  GREEN_GLOW = "#4dff8f";
// стрелка «от лица»: rel 0 — вверх (вперёд), 1 — вправо…
function drawArrow(c, x, y, s, rel, col = GREEN, glow = GREEN_GLOW) {
  c.save();
  c.translate(x, y);
  c.rotate((rel * Math.PI) / 2);
  c.scale(s, s);
  c.fillStyle = col;
  c.shadowColor = glow;
  c.shadowBlur = 12;
  c.beginPath();
  c.moveTo(0, -34);
  c.lineTo(27, -5);
  c.lineTo(10, -5);
  c.lineTo(10, 30);
  c.lineTo(-10, 30);
  c.lineTo(-10, -5);
  c.lineTo(-27, -5);
  c.closePath();
  c.fill();
  c.restore();
}
function drawBack(c, x, y) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = "#ffc2b8";
  c.shadowColor = "#ff6a55";
  c.shadowBlur = 10;
  c.lineWidth = 7;
  c.lineJoin = c.lineCap = "round";
  c.beginPath();
  c.moveTo(-38, 0);
  c.lineTo(-17, -22);
  c.lineTo(38, -22);
  c.lineTo(38, 22);
  c.lineTo(-17, 22);
  c.closePath();
  c.moveTo(1, -10);
  c.lineTo(21, 10);
  c.moveTo(21, -10);
  c.lineTo(1, 10);
  c.stroke();
  c.restore();
}
const steel = () =>
  new THREE.MeshStandardMaterial({
    color: 0x5a6066,
    roughness: 0.3,
    metalness: 0.9,
  });
// винт с прорезью (лицо в +Z)
function screw(mat, r = 0.0045) {
  const g = new THREE.Group(),
    head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.003, 14), mat);
  head.rotation.x = Math.PI / 2;
  g.add(head);
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(r * 1.7, r * 0.35, 0.001),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
  );
  slot.position.z = 0.0016;
  slot.rotation.z = Math.random() * 3;
  g.add(slot);
  return g;
}

/* ---------- кодовая панель двери: цифры (1–9, стереть, 0), цвета (4 лампы и 4 кнопки) или стрелки от лица вора ---------- */
// d — дверь попытки (doorFor): type и для цветного замка lamps.
// show(items) — экран: цифра-строка, { c: цвет } или { a: стрелка от лица }, null — пусто; msg(text, color) — надпись
export function makeKeypad(d) {
  const type = d ? d.type : "digits",
    tall = type === "colors",
    PH = tall ? 0.31 : 0.27;
  const g = new THREE.Group(),
    metal = steel();
  // корпус из шлифованной стали и тёмная лицевая панель
  g.add(new THREE.Mesh(rounded(0.19, PH + 0.02, 0.02, 0.014, 0.003), metal));
  const face = new THREE.Mesh(
    rounded(0.168, PH - 0.002, 0.004, 0.01, 0.001),
    new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.7 }),
  );
  face.position.z = 0.011;
  g.add(face);
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const s = screw(metal);
    s.position.set(sx * 0.087, sy * (PH / 2 + 0.002), 0.0115);
    g.add(s);
  }
  // экран в рамке
  const sy = tall ? 0.08 : 0.095,
    bezel = new THREE.Mesh(
      rounded(0.142, 0.052, 0.004, 0.006, 0.001),
      new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.3 }),
    );
  bezel.position.set(0, sy, 0.0145);
  g.add(bezel);
  const scr = canvasTex(320, 96, (c, w, h, items, text, col) => {
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#04190c");
    bg.addColorStop(1, "#021007");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(80,255,140,.05)";
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (text) {
      c.fillStyle = col;
      c.shadowColor = col;
      c.shadowBlur = 12;
      c.font = 'bold 44px "PT Mono", monospace';
      c.fillText(text, w / 2, h / 2 + 2);
      return;
    }
    const n = (items || []).length,
      step = n > 3 ? 66 : 80;
    (items || []).forEach((it, i) => {
      const x = w / 2 + (i - (n - 1) / 2) * step,
        y = h / 2;
      c.shadowBlur = 0;
      if (it == null) {
        c.fillStyle = "rgba(90,255,150,.25)";
        c.fillRect(x - 16, y + 22, 32, 4);
      } else if (typeof it === "string") {
        c.fillStyle = GREEN;
        c.shadowColor = GREEN_GLOW;
        c.shadowBlur = 12;
        c.font = 'bold 58px "PT Mono", monospace';
        c.fillText(it, x, y + 3);
      } else if (it.c) {
        c.fillStyle = it.c;
        c.shadowColor = it.c;
        c.shadowBlur = 16;
        c.beginPath();
        c.arc(x, y, 20, 0, 6.2832);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = "rgba(255,255,255,.45)";
        c.beginPath();
        c.arc(x - 6, y - 7, 6, 0, 6.2832);
        c.fill();
      } else drawArrow(c, x, y, 0.62, it.a);
    });
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.039),
    new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }),
  );
  screen.position.set(0, sy, 0.0167);
  g.add(screen);
  // кнопки: [что нажато, x, y, ширина, высота, вид]
  let keys;
  if (type === "colors")
    keys = [0, 1, 2, 3]
      .map((i) => [
        "c" + i,
        i % 2 ? 0.036 : -0.036,
        0.02 - Math.floor(i / 2) * 0.054,
        0.058,
        0.046,
        { col: DCOL[i][2] },
      ])
      .concat([["⌫", 0, -0.095, 0.062, 0.03, { back: 1 }]]);
  else if (type === "arrows")
    keys = [
      ["a0", 0, 0.04, 0, "вперёд"],
      ["a1", 0.05, -0.012, 1, "вправо"],
      ["a2", 0, -0.064, 2, "назад"],
      ["a3", -0.05, -0.012, 3, "влево"],
    ]
      .map(([b, x, y, a, s]) => [b, x, y, 0.046, 0.046, { a, s }])
      .concat([["⌫", 0.05, -0.108, 0.042, 0.026, { back: 1 }]]);
  else
    keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].map(
      (l, i) => [
        l,
        -0.045 + (i % 3) * 0.045,
        0.045 - Math.floor(i / 3) * 0.04,
        0.039,
        0.033,
        l === "⌫" ? { back: 1 } : { t: l },
      ],
    );
  const buttons = keys.map(([btn, x, y, w, h, v]) => {
    // цветная — глянцевый пластик с подсветкой изнутри; остальные — резина с подсвеченной надписью
    const mat = v.col
      ? new THREE.MeshStandardMaterial({
          color: v.col,
          emissive: v.col,
          emissiveIntensity: 0.3,
          roughness: 0.18,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x3a4147,
          roughness: 0.5,
          metalness: 0.35,
          emissive: 0x1f6b3a,
          emissiveIntensity: 0.14,
        });
    const b = new THREE.Mesh(rounded(w, h, 0.01, 0.007, 0.0025), mat);
    b.position.set(x, y, 0.019);
    const lbl = faceLabel(w, h, (c, cw, ch) => {
      if (v.col) {
        // блик на глянцевом пластике
        const gr = c.createRadialGradient(
          cw * 0.32,
          ch * 0.3,
          2,
          cw * 0.32,
          ch * 0.3,
          ch * 0.55,
        );
        gr.addColorStop(0, "rgba(255,255,255,.55)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = gr;
        c.fillRect(0, 0, cw, ch);
      } else if (v.back) drawBack(c, cw / 2, ch / 2);
      else if (v.a != null) {
        drawArrow(c, cw / 2, ch * 0.38, 0.88, v.a);
        c.fillStyle = "#e2f2e7";
        c.font = 'bold 25px "PT Mono", monospace';
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(v.s, cw / 2, ch * 0.86);
      } else {
        c.fillStyle = GREEN;
        c.shadowColor = GREEN_GLOW;
        c.shadowBlur = 12;
        c.font = 'bold 72px "PT Mono", monospace';
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(v.t, cw / 2, ch / 2 + 4);
      }
    });
    lbl.position.z = 0.0052;
    b.add(lbl);
    b.userData.btn = btn;
    b.userData.z0 = b.position.z;
    b.userData.hover = (on) => {
      if (v.col) mat.emissiveIntensity = on ? 0.85 : 0.3;
      else mat.emissiveIntensity = on ? 0.6 : 0.14;
      lbl.material.color.setScalar(on ? 1.5 : 1);
    };
    g.add(b);
    return b;
  });
  // цветной замок: 4 лампы-купола в хромированных ободках над экраном
  if (type === "colors")
    d.lamps.forEach((ci, i) => {
      const x = -0.054 + i * 0.036,
        col = DCOL[ci][2];
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.0105,
          18,
          10,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ),
        new THREE.MeshBasicMaterial({ color: col, toneMapped: false }),
      );
      dome.rotation.x = Math.PI / 2;
      dome.position.set(x, 0.128, 0.013);
      g.add(dome);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.0118, 0.0026, 8, 24),
        metal,
      );
      ring.position.set(x, 0.128, 0.0135);
      g.add(ring);
      const halo = glowSprite(col, 0.065, 0.85);
      halo.position.set(x, 0.128, 0.022);
      g.add(halo);
    });
  g.traverse((o) => {
    o.userData.dynamic = true;
  });
  return {
    group: g,
    buttons,
    show: (items) => scr.redraw(items),
    msg: (text, col) => scr.redraw(null, text, col),
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

/* ---------- щиток лазерного барьера: номер, провода сверху вниз, этап и огоньки ошибок ---------- */
// зад у стены (z = 0), лицо в +Z. setWires(list, stageText, cut) — провода этапа; cut — номер перерезанного (рисуется разрезанным)
export function makeWirePanel(pn) {
  const g = new THREE.Group(),
    W = 0.4,
    H = 0.5,
    D = 0.1;
  const paint = new THREE.MeshStandardMaterial({
      color: 0x7d858c,
      roughness: 0.5,
      metalness: 0.6,
    }),
    metal = steel(),
    brass = new THREE.MeshStandardMaterial({
      color: 0xc9a24a,
      roughness: 0.3,
      metalness: 0.95,
    });
  // монтажная панель: светлая, с рядами отверстий
  const backTex = canvasTex(256, 320, (c, w, h) => {
    c.fillStyle = "#c4c8cc";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      c.fillStyle =
        Math.random() < 0.5 ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.07)";
      c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    c.fillStyle = "rgba(45,50,56,.32)";
    for (let y = 12; y < h; y += 16)
      for (let x = 12; x < w; x += 16) {
        c.beginPath();
        c.arc(x, y, 2.6, 0, 6.2832);
        c.fill();
      }
    const v = c.createRadialGradient(
      w / 2,
      h / 2,
      w * 0.2,
      w / 2,
      h / 2,
      h * 0.75,
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,.35)");
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
  });
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.03, H - 0.03),
    new THREE.MeshStandardMaterial({
      map: backTex.tex,
      roughness: 0.75,
      metalness: 0.25,
    }),
  );
  back.position.z = 0.004;
  g.add(back);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.004), paint);
  rear.position.z = 0.002;
  g.add(rear);
  // корпус со скруглёнными рёбрами
  for (const [w, h, x, y] of [
    [W, 0.02, 0, H / 2 - 0.01],
    [W, 0.02, 0, -H / 2 + 0.01],
    [0.02, H, -W / 2 + 0.01, 0],
    [0.02, H, W / 2 - 0.01, 0],
  ]) {
    const s = new THREE.Mesh(rounded(w, h, D, 0.006, 0.002), paint);
    s.position.set(x, y, D / 2);
    g.add(s);
  }
  // дверца открыта влево, изнутри наклейка «Опасно»
  const lid = new THREE.Mesh(
    rounded(W, H, 0.012, 0.012, 0.003)
      .clone()
      .translate(W / 2, 0, 0),
    paint,
  );
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0, D);
  hinge.rotation.y = -1.9;
  hinge.add(lid);
  g.add(hinge);
  const sticker = canvasTex(192, 192, (c, w, h) => {
    c.fillStyle = "#ffd21f";
    c.beginPath();
    c.moveTo(w / 2, 14);
    c.lineTo(w - 12, h - 52);
    c.lineTo(12, h - 52);
    c.closePath();
    c.fill();
    c.lineWidth = 9;
    c.strokeStyle = "#151515";
    c.stroke();
    c.fillStyle = "#151515";
    c.beginPath();
    c.moveTo(104, 46);
    c.lineTo(78, 100);
    c.lineTo(98, 100);
    c.lineTo(86, 132);
    c.lineTo(118, 86);
    c.lineTo(98, 86);
    c.closePath();
    c.fill();
    c.font = 'bold 26px "PT Mono", monospace';
    c.textAlign = "center";
    c.fillStyle = "#ffd21f";
    c.fillText("ОПАСНО", w / 2, h - 18);
  });
  const st = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshStandardMaterial({
      map: sticker.tex,
      roughness: 0.6,
      transparent: true,
    }),
  );
  st.position.set(W / 2, 0.06, -0.0065);
  st.rotation.y = Math.PI;
  lid.add(st);
  // алюминиевая табличка с номером щитка: последняя цифра нужна штурману
  const plate = canvasTex(320, 80, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#e2e5e8");
    gr.addColorStop(1, "#a9aeb3");
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      c.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.08})`;
      c.fillRect(0, y, w, 1);
    }
    c.strokeStyle = "rgba(60,64,70,.6)";
    c.lineWidth = 3;
    c.strokeRect(6, 6, w - 12, h - 12);
    for (const x of [22, w - 22]) {
      c.fillStyle = "#7a7f85";
      c.beginPath();
      c.arc(x, h / 2, 7, 0, 6.2832);
      c.fill();
      c.fillStyle = "rgba(255,255,255,.6)";
      c.beginPath();
      c.arc(x - 2, h / 2 - 2, 2.5, 0, 6.2832);
      c.fill();
    }
    c.font = 'bold 44px "PT Mono", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(255,255,255,.7)";
    c.fillText(pn.num, w / 2 + 1, h / 2 + 4);
    c.fillStyle = "#26292d";
    c.fillText(pn.num, w / 2, h / 2 + 2);
  });
  const num = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.05),
    // чуть светится: номер нужен штурману, а фонарь бьёт в середину щитка
    new THREE.MeshStandardMaterial({
      map: plate.tex,
      emissiveMap: plate.tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.6,
    }),
  );
  num.position.set(0, 0.198, 0.007);
  g.add(num);
  // DIN-рейки слева и справа: на них клеммные колодки
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, H * 0.72, 0.006),
      metal,
    );
    rail.position.set(s * 0.145, -0.005, 0.009);
    g.add(rail);
  }
  // окошко этапа и огоньки ошибок внизу
  const stageTex = canvasTex(256, 48, (c, w, h, text = "", col = "#ffd23f") => {
    c.fillStyle = "#061008";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(80,255,140,.05)";
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 10;
    c.font = 'bold 26px "PT Mono", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, w / 2, h / 2 + 1);
  });
  const stage = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.028),
    new THREE.MeshBasicMaterial({ map: stageTex.tex, toneMapped: false }),
  );
  stage.redraw = stageTex.redraw;
  stage.position.set(-0.06, -0.205, 0.008);
  g.add(stage);
  const leds = Array.from({ length: pn.maxStrikes }, (_, i) => {
    const x = 0.16 - i * 0.032;
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.0075, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x331010, toneMapped: false }),
    );
    l.position.set(x, -0.205, 0.009);
    g.add(l);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0088, 0.002, 8, 20),
      metal,
    );
    ring.position.set(x, -0.205, 0.009);
    g.add(ring);
    return l;
  });
  const wg = new THREE.Group(),
    buttons = [],
    blockGeo = new THREE.BoxGeometry(0.032, 0.036, 0.024),
    blockMat = new THREE.MeshStandardMaterial({
      color: 0xd8d1bd,
      roughness: 0.65,
    }),
    copper = new THREE.MeshStandardMaterial({
      color: 0xd07a3a,
      roughness: 0.35,
      metalness: 0.9,
    }),
    tipGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.014, 8).rotateZ(
      Math.PI / 2,
    ),
    hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  g.add(wg);
  const tube = (pts, r, mat) =>
    new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))),
        24,
        r,
        10,
      ),
      mat,
    );
  // провода сверху вниз: кабель с провисом от колодки к колодке; кликается невидимая полоса вокруг
  function setWires(list, stageText, cut = -1) {
    wg.clear();
    buttons.length = 0;
    list.forEach((w, i) => {
      const y = 0.125 - i * 0.042,
        j = (((i * 37) % 7) - 3) * 0.0012;
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(blockGeo, blockMat);
        b.position.set(s * 0.145, y, 0.024);
        wg.add(b);
        const sc = screw(brass, 0.0055);
        sc.position.set(s * 0.145, y, 0.0375);
        wg.add(sc);
      }
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.032, 0.03),
        hitMat,
      );
      hit.position.set(0, y, 0.035);
      const mat = new THREE.MeshStandardMaterial({
        color: WCOL[w][1],
        roughness: 0.42,
        emissive: 0x000000,
      });
      if (i === cut) {
        // перерезан: две половинки обвисли, торчит медь
        hit.add(
          tube(
            [
              [-0.12, 0, -0.005],
              [-0.07, -0.002, 0.004],
              [-0.02, -0.012, 0.012],
            ],
            0.0055,
            mat,
          ),
        );
        hit.add(
          tube(
            [
              [0.12, 0, -0.005],
              [0.07, -0.002, 0.004],
              [0.02, -0.016, 0.01],
            ],
            0.0055,
            mat,
          ),
        );
        for (const [x, yy, z] of [
          [-0.014, -0.013, 0.013],
          [0.014, -0.017, 0.011],
        ]) {
          const t = new THREE.Mesh(tipGeo, copper);
          t.position.set(x, yy, z);
          hit.add(t);
        }
      } else
        hit.add(
          tube(
            [
              [-0.12, 0, -0.005],
              [-0.05, -0.006 + j, 0.006],
              [0.05, -0.006 - j, 0.006],
              [0.12, 0, -0.005],
            ],
            0.0055,
            mat,
          ),
        );
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(tipGeo, copper);
        t.position.set(s * 0.125, 0, -0.005);
        hit.add(t);
      }
      hit.userData.btn = i;
      hit.userData.z0 = hit.position.z;
      hit.userData.hover = (on) =>
        mat.emissive.setHex(on ? 0x5a4a28 : 0x000000);
      wg.add(hit);
      buttons.push(hit);
      // маркер с номером провода — белая бирка прямо на кабеле у левой клеммы
      const tag = canvasTex(64, 48, (c) => {
        c.fillStyle = "#f4f2ec";
        c.fillRect(0, 0, 64, 48);
        c.fillStyle = "#151515";
        c.font = 'bold 38px "PT Mono", monospace';
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(String(i + 1), 32, 26);
      });
      const tg = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.016, 0.004),
        new THREE.MeshStandardMaterial({
          map: tag.tex,
          emissiveMap: tag.tex,
          emissive: 0xffffff,
          emissiveIntensity: 0.25,
          roughness: 0.6,
        }),
      );
      tg.position.set(-0.098, -0.002, 0.008);
      hit.add(tg);
    });
    stage.redraw(stageText || "");
    wg.traverse((o) => {
      o.userData.dynamic = true;
    });
  }
  setWires(pn.left[0], pn.rounds > 1 ? `ЭТАП 1 ИЗ ${pn.rounds}` : "");
  g.traverse((o) => {
    o.userData.dynamic = true;
  });
  return {
    group: g,
    buttons,
    leds,
    stage,
    setWires,
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

/* ---------- щиток видеонаблюдения (с дела №11): наклейка с моделью и серийным номером, порт для шнура ---------- */
// cc — щиток попытки (cctvFor): model, sn; nCams — сколько камер в доме. Зад у стены (z = 0), лицо в +Z.
// Кнопка «LAN» — вор втыкает шнур (событие j); setState(plugged, off) — шнур в порту, камеры выключены
export function makeCctvBox(cc, nCams) {
  const g = new THREE.Group(),
    W = 0.34,
    H = 0.42,
    D = 0.09;
  const paint = new THREE.MeshStandardMaterial({
    color: 0x3b4045,
    roughness: 0.55,
    metalness: 0.55,
  });
  const body = new THREE.Mesh(rounded(W, H, D, 0.012), paint);
  body.position.z = D / 2;
  g.add(body);
  // жалюзи вентиляции сверху
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.006, 0.004), slatMat);
    sl.position.set(0, 0.17 - i * 0.014, D + 0.001);
    g.add(sl);
  }
  // шильдик сверху
  const plate = faceLabel(0.24, 0.03, (c, w, h) => {
    c.fillStyle = "#c9cdd1";
    c.font = `bold ${Math.round(h * 0.55)}px "PT Mono", monospace`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("ВИДЕОНАБЛЮДЕНИЕ · NVR", w / 2, h / 2);
  });
  plate.position.set(0, 0.075, D + 0.002);
  g.add(plate);
  // наклейка: модель крупно, серийный номер, штрихкод — её вор читает штурману
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.12),
    new THREE.MeshStandardMaterial({
      map: canvasTex(440, 240, (c, w, h) => {
        c.fillStyle = "#f1eee6";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "#b9b4a8";
        c.lineWidth = 4;
        c.strokeRect(2, 2, w - 4, h - 4);
        c.fillStyle = "#1d1d1d";
        c.textBaseline = "alphabetic";
        c.font = 'bold 20px "PT Mono", monospace';
        c.fillText("МОДЕЛЬ", 18, 34);
        c.font = 'bold 54px "PT Mono", monospace';
        c.fillText(cc.model, 18, 88);
        c.font = 'bold 20px "PT Mono", monospace';
        c.fillText("СЕРИЙНЫЙ №", 18, 126);
        c.font = 'bold 46px "PT Mono", monospace';
        c.fillText(cc.sn.split("").join(" "), 18, 176);
        // штрихкод
        let x = 18;
        for (let i = 0; i < 46; i++) {
          const bw = 1 + ((i * 7 + cc.sn.charCodeAt(i % 6)) % 3);
          if (i % 2 === 0) c.fillRect(x, 194, bw, 32);
          x += bw + 1;
        }
        c.font = '14px "PT Mono", monospace';
        c.fillText("12V ⎓ 2A   MADE IN PRC", 250, 222);
      }).tex,
      color: 0x8c8880, // бумага под фонарём не должна выгорать в белое пятно
      roughness: 0.95,
    }),
  );
  sticker.position.set(0, -0.005, D + 0.002);
  g.add(sticker);
  // огоньки: питание, диск, связь
  const leds = [0x39ff6a, 0xffb02a, 0x3aa0ff].map((col, i) => {
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.0055, 10, 8),
      new THREE.MeshBasicMaterial({ color: col, toneMapped: false }),
    );
    l.position.set(-0.13 + i * 0.026, -0.095, D + 0.003);
    l.userData.col = new THREE.Color(col);
    g.add(l);
    return l;
  });
  // маленький экран состояния
  const lcd = canvasTex(256, 64, (c, w, h, text = `● REC  ${nCams} КАМ`, col = "#ff5a4a") => {
    c.fillStyle = "#0b120d";
    c.fillRect(0, 0, w, h);
    c.fillStyle = col;
    c.font = 'bold 30px "PT Mono", monospace';
    c.textBaseline = "middle";
    c.fillText(text, 12, h / 2 + 2);
  });
  const lcdM = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 0.03),
    new THREE.MeshBasicMaterial({ map: lcd.tex, toneMapped: false }),
  );
  lcdM.position.set(0.075, -0.095, D + 0.002);
  g.add(lcdM);
  // порт и кнопка «LAN»: вор втыкает свой шнур — у штурмана появляется связь с системой
  const port = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.022, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.6 }),
  );
  port.position.set(-0.1, -0.155, D + 0.002);
  g.add(port);
  const plugTex = canvasTex(288, 120, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#3a3f44");
    gr.addColorStop(1, "#202326");
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#555b61";
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = "#ffd23f";
    c.shadowColor = "#ffd23f";
    c.shadowBlur = 8;
    c.font = 'bold 46px "PT Mono", monospace';
    c.textAlign = "center";
    c.fillText("LAN ⇢", w / 2, 56);
    c.shadowBlur = 0;
    c.fillStyle = "#c9ced3";
    c.font = 'bold 24px "PT Mono", monospace';
    c.fillText("воткнуть шнур", w / 2, 96);
  }).tex;
  const plug = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.05, 0.02),
    new THREE.MeshStandardMaterial({
      map: plugTex,
      emissiveMap: plugTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.3,
    }),
  );
  plug.position.set(0.05, -0.155, D + 0.011);
  plug.userData.btn = "plug";
  plug.userData.z0 = plug.position.z;
  g.add(plug);
  // шнур с коннектором: появляется в порту после подключения
  const cord = new THREE.Group();
  const conn = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.018, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x2a6fd6, roughness: 0.4 }),
  );
  conn.position.set(-0.1, -0.155, D + 0.016);
  cord.add(conn);
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.1, -0.155, D + 0.03),
        new THREE.Vector3(-0.1, -0.2, D + 0.05),
        new THREE.Vector3(-0.07, -0.32, D + 0.06),
      ]),
      12,
      0.004,
      6,
    ),
    new THREE.MeshStandardMaterial({ color: 0x2a6fd6, roughness: 0.5 }),
  );
  cord.add(wire);
  cord.visible = false;
  g.add(cord);
  for (const [x, y] of [
    [-0.15, 0.19],
    [0.15, 0.19],
    [-0.15, -0.19],
    [0.15, -0.19],
  ]) {
    const sc = screw(steel());
    sc.position.set(x, y, D + 0.002);
    g.add(sc);
  }
  const buttons = [plug];
  let st = "";
  function setState(plugged, off) {
    const k = off ? "off" : plugged ? "on" : "";
    if (k === st) return;
    st = k;
    cord.visible = plugged || off;
    plug.visible = !plugged && !off;
    buttons.length = 0;
    if (plug.visible) buttons.push(plug);
    if (off) lcd.redraw("ЗАПИСЬ ВЫКЛ", "#7f8a85");
    else if (plugged) lcd.redraw("ВНЕШН. ДОСТУП", "#4dff8f");
    else lcd.redraw();
  }
  g.traverse((o) => {
    o.userData.dynamic = true;
  });
  return {
    group: g,
    buttons,
    leds,
    setState,
    // мигание огоньков: связь мигает, пока подключён шнур
    tick(now, plugged, off) {
      leds[0].material.color.copy(leds[0].userData.col).multiplyScalar(off ? 0.25 : 1);
      leds[1].material.color.copy(leds[1].userData.col).multiplyScalar(off ? 0.15 : (now / 170) % 3 < 1 ? 1 : 0.25);
      leds[2].material.color.copy(leds[2].userData.col).multiplyScalar(plugged && !off ? ((now / 90) % 2 < 1 ? 1 : 0.15) : 0.12);
    },
    face: new THREE.Vector3(0, 0, 1),
    dist: 0.6,
  };
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
    if (this.onMove) this.onMove(true, target.kind); // звук: вор наклоняется к панели
  }
  exit() {
    if (!this.active) return;
    if (!this.leaving && this.onMove) this.onMove(false, this.active.kind); // выпрямляется
    if (!this.leaving && this.onExit) this.onExit(); // вернуть мышь вору
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
      // подсветка под курсором: у новых кнопок и проводов своя (userData.hover)
      const glow = (o, on) =>
        o.userData.hover
          ? o.userData.hover(on)
          : (o.material.emissiveIntensity = on ? 0.9 : 0.35);
      if (this.hover) glow(this.hover, false);
      if (h) glow(h, true);
      this.hover = h;
      this.canvas.style.cursor = h ? "pointer" : "default";
    }
    return true;
  }
}
