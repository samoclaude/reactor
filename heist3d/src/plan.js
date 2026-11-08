// Схема здания для штурмана (и мини-карта в тренировке). Рисуется в 2D canvas.
// Как в 2D-версии: мир показан на такт вперёд, бледный охранник — где он сейчас.
import { LM, guardPos, ray, camCells, laserOn, whoCaught } from "./logic.js";

function emoji(g, ch, x, y, size) {
  g.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(ch, x, y + size * 0.05);
}

// o: { lv, sim, now, showGuards, showAll (тренировка), showThief, thief: {x, y, yaw} в клетках, pingUntil, showStart, start }
export function drawPlan(g, CW, CH, o) {
  const { lv, sim } = o,
    W = lv.W,
    H = lv.H;
  // охрана в тени (с дела №13): штурман видит только маршруты, охрану — после поимки и в тренировке
  const showG =
    o.showGuards && (!lv.hide || o.showAll || !!sim.caught || !!sim.won);
  const T = Math.floor(Math.min(CW / W, CH / H)),
    ox = Math.floor((CW - T * W) / 2),
    oy = Math.floor((CH - T * H) / 2);
  g.fillStyle = "#0D2B4E";
  g.fillRect(0, 0, CW, CH);
  g.strokeStyle = "rgba(127,212,255,.07)";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x++) {
    g.moveTo(ox + x * T + 0.5, oy);
    g.lineTo(ox + x * T + 0.5, oy + H * T);
  }
  for (let y = 0; y <= H; y++) {
    g.moveTo(ox, oy + y * T + 0.5);
    g.lineTo(ox + W * T, oy + y * T + 0.5);
  }
  g.stroke();
  const over = sim.caught || sim.won,
    t = over ? sim.t : sim.t + 1;
  const at = (c) => [ox + (c % W) * T, oy + ((c / W) | 0) * T];
  const zone = (cells, col) => {
    g.fillStyle = col;
    for (const c of cells) {
      const [X, Y] = at(c);
      g.fillRect(X + 1, Y + 1, T - 2, T - 2);
    }
  };
  // обзор камер (на такт вперёд): ярко-оранжевый, с рамкой — чтобы на синей схеме не терялся;
  // после взлома щитка видеонаблюдения камер нет
  for (const c of lv.cams) {
    const cells = camCells(lv, c, t, sim);
    zone(cells, "rgba(255,150,30,.42)");
    g.strokeStyle = "rgba(255,190,90,.75)";
    g.lineWidth = Math.max(1, T * 0.04);
    for (const q of cells) {
      const [X, Y] = at(q);
      g.strokeRect(X + 2, Y + 2, T - 4, T - 4);
    }
  }
  if (showG)
    lv.guards.forEach((gd, k) => {
      const { i, face } = guardPos(lv, sim, k, t);
      zone([i, ...ray(lv, i, face, lv.vr)], "rgba(255,60,60,.30)");
    });
  // стены
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = y * W + x;
      if (lv.g[c]) continue;
      const X = ox + x * T,
        Y = oy + y * T;
      g.fillStyle = "#16406B";
      g.fillRect(X, Y, T, T);
      g.strokeStyle = "#8FD3FF";
      g.lineWidth = 1.5;
      g.beginPath();
      if (y > 0 && lv.g[c - W]) {
        g.moveTo(X, Y + 0.75);
        g.lineTo(X + T, Y + 0.75);
      }
      if (y < H - 1 && lv.g[c + W]) {
        g.moveTo(X, Y + T - 0.75);
        g.lineTo(X + T, Y + T - 0.75);
      }
      if (x > 0 && lv.g[c - 1]) {
        g.moveTo(X + 0.75, Y);
        g.lineTo(X + 0.75, Y + T);
      }
      if (x < W - 1 && lv.g[c + 1]) {
        g.moveTo(X + T - 0.75, Y);
        g.lineTo(X + T - 0.75, Y + T);
      }
      g.stroke();
      if (lv.deco[c] != null)
        emoji(g, LM[lv.deco[c]][0], X + T / 2, Y + T / 2, T * 0.72);
    }
  // маршруты охраны; в тени — оранжевые точки, квадрат в конце и пунктир захода в соседнюю комнату
  g.save();
  const line = (cells) => {
    g.beginPath();
    cells.forEach((c, i) => {
      const [X, Y] = at(c);
      i ? g.lineTo(X + T / 2, Y + T / 2) : g.moveTo(X + T / 2, Y + T / 2);
    });
    g.stroke();
  };
  if (lv.hide) {
    g.strokeStyle = "rgba(255,184,77,.7)";
    g.lineWidth = 2;
  } else {
    g.setLineDash([2, 4]);
    g.strokeStyle = "rgba(255,120,120,.5)";
    g.lineWidth = 1.5;
  }
  for (const gd of lv.guards) {
    line(gd.path);
    if (!lv.hide) continue;
    g.fillStyle = "#FFB84D";
    for (const c of gd.path) {
      const [X, Y] = at(c);
      g.beginPath();
      g.arc(X + T / 2, Y + T / 2, Math.max(2.5, T * 0.09), 0, 6.283);
      g.fill();
    }
    const [EX, EY] = at(gd.path[gd.path.length - 1]),
      s2 = Math.max(6, T * 0.26);
    g.fillRect(EX + T / 2 - s2 / 2, EY + T / 2 - s2 / 2, s2, s2);
    if (gd.side) {
      g.save();
      g.setLineDash([3, 4]);
      line([gd.end ? gd.path[gd.path.length - 1] : gd.path[0], ...gd.side]);
      g.restore();
    }
  }
  g.restore();
  // укрытия: Ш — шкаф, П — портьера
  for (const h of lv.hides || []) {
    const [X, Y] = at(h.c);
    g.fillStyle = "rgba(170,120,255,.85)";
    g.fillRect(X + T * 0.08, Y + T * 0.08, T * 0.3, T * 0.3);
    g.fillStyle = "#14082a";
    g.font = `bold ${Math.max(7, Math.round(T * 0.24))}px "PT Mono", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(h.kind === "wardrobe" ? "Ш" : "П", X + T * 0.23, Y + T * 0.24);
  }
  // охранник свернёт с маршрута в ближайшие такты: путь оранжевым пунктиром и «!»
  if (showG && !(sim.caught || sim.won))
    lv.guards.forEach((gd, k) => {
      const fut = [0, 1, 2].map((d) => guardPos(lv, sim, k, t + d).i);
      if (fut.every((c) => gd.path.includes(c))) return;
      const more = [3, 4, 5, 6].map((d) => guardPos(lv, sim, k, t + d).i);
      g.save();
      g.setLineDash([4, 3]);
      g.strokeStyle = "#FFA640";
      g.lineWidth = 2.5;
      g.beginPath();
      [...fut, ...more].forEach((c, i) => {
        const [X, Y] = at(c);
        i ? g.lineTo(X + T / 2, Y + T / 2) : g.moveTo(X + T / 2, Y + T / 2);
      });
      g.stroke();
      g.restore();
      const [X, Y] = at(fut[0]);
      g.fillStyle = "#FFA640";
      g.beginPath();
      g.arc(X + T * 0.85, Y + T * 0.15, T * 0.17, 0, 6.283);
      g.fill();
      g.fillStyle = "#1A1000";
      g.font = `bold ${Math.max(8, Math.round(T * 0.26))}px "PT Mono", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("!", X + T * 0.85, Y + T * 0.16);
    });
  // выход и предметы
  {
    const [X, Y] = at(lv.E);
    g.fillStyle = "rgba(57,255,136,.18)";
    g.fillRect(X + 1, Y + 1, T - 2, T - 2);
    g.strokeStyle = "#39FF88";
    g.lineWidth = 2;
    g.strokeRect(X + 2, Y + 2, T - 4, T - 4);
    emoji(g, "🚪", X + T / 2, Y + T / 2, T * 0.62);
  }
  if (!sim.gem) {
    const [X, Y] = at(lv.gem);
    emoji(g, lv.safe ? "🔐" : "💎", X + T / 2, Y + T / 2, T * 0.66);
  }
  if (lv.note >= 0) {
    const [X, Y] = at(lv.note);
    g.globalAlpha = sim.note ? 0.45 : 1;
    emoji(g, "📝", X + T / 2, Y + T / 2, T * 0.62);
    g.globalAlpha = 1;
  }
  if (lv.door >= 0) {
    const [X, Y] = at(lv.door);
    if (!sim.open) {
      g.fillStyle = "#FFD23F";
      g.fillRect(X + 2, Y + 2, T - 4, T - 4);
      emoji(g, "🔒", X + T / 2, Y + T / 2, T * 0.5);
    } else {
      g.strokeStyle = "rgba(255,210,63,.6)";
      g.setLineDash([3, 3]);
      g.strokeRect(X + 3, Y + 3, T - 6, T - 6);
      g.setLineDash([]);
      emoji(g, "🔓", X + T / 2, Y + T / 2, T * 0.45);
    }
  }
  for (const l of lv.lasers) {
    const [X, Y] = at(l.i),
      on = laserOn(l, t),
      horiz = lv.g[l.i - 1] && lv.g[l.i + 1],
      col = l.m ? "#FF5EDB" : "#FF3B3B";
    g.save();
    g.strokeStyle = col;
    g.lineCap = "round";
    if (on) {
      g.shadowColor = col;
      g.shadowBlur = 10;
      g.lineWidth = Math.max(2, T * 0.1);
    } else {
      g.globalAlpha = 0.55;
      g.setLineDash([3, 4]);
      g.lineWidth = Math.max(1.5, T * 0.06);
    }
    g.beginPath();
    if (horiz) {
      g.moveTo(X + T / 2, Y + 2);
      g.lineTo(X + T / 2, Y + T - 2);
    } else {
      g.moveTo(X + 2, Y + T / 2);
      g.lineTo(X + T - 2, Y + T / 2);
    }
    g.stroke();
    g.restore();
  }
  // камеры с номером — тем же, что у монитора в фургоне; взломаны — бледные
  lv.cams.forEach((c, k) => {
    const [X, Y] = at(c.i);
    g.globalAlpha = sim.camOff ? 0.4 : 1;
    emoji(g, "📹", X + T / 2, Y + T / 2, T * 0.62);
    g.globalAlpha = 1;
    g.fillStyle = "#FFD23F";
    g.font = `bold ${Math.max(9, Math.round(T * 0.32))}px "PT Mono", monospace`;
    g.textAlign = "right";
    g.textBaseline = "top";
    g.fillText(String(k + 1), X + T - 2, Y + 1);
  });
  // лазерный барьер (сетка) и щиток 🎛️
  if (lv.gate >= 0) {
    const [X, Y] = at(lv.gate),
      on = !sim.gateOff;
    g.save();
    g.fillStyle = on ? "rgba(255,40,40,.35)" : "rgba(255,40,40,.08)";
    g.fillRect(X + 1, Y + 1, T - 2, T - 2);
    g.strokeStyle = "#FF3B3B";
    g.lineWidth = Math.max(2, T * 0.08);
    if (on) {
      g.shadowColor = "#FF3B3B";
      g.shadowBlur = 12;
    } else g.setLineDash([3, 4]);
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo(X + (k * T) / 4, Y + 2);
      g.lineTo(X + (k * T) / 4, Y + T - 2);
      g.stroke();
      g.beginPath();
      g.moveTo(X + 2, Y + (k * T) / 4);
      g.lineTo(X + T - 2, Y + (k * T) / 4);
      g.stroke();
    }
    g.restore();
  }
  if (lv.panel >= 0) {
    const [X, Y] = at(lv.panel);
    g.globalAlpha = sim.gateOff ? 0.45 : 1;
    emoji(g, "🎛️", X + T / 2, Y + T / 2, T * 0.62);
    g.globalAlpha = 1;
  }
  // щиток видеонаблюдения (с дела №11): вор подключается, штурман вводит пароль
  if (lv.cctv >= 0) {
    const [X, Y] = at(lv.cctv);
    g.globalAlpha = sim.camOff ? 0.45 : 1;
    emoji(g, "📟", X + T / 2, Y + T / 2, T * 0.62);
    g.globalAlpha = 1;
  }
  // охрана в тени: только номер в начале маршрута
  if (!showG)
    lv.guards.forEach((gd, gi) => {
      const [X, Y] = at(gd.path[0]);
      g.fillStyle = "#FFB84D";
      g.beginPath();
      g.arc(X + T / 2, Y + T / 2, T * 0.3, 0, 6.283);
      g.fill();
      g.fillStyle = "#2A0000";
      g.font = `bold ${Math.round(T * 0.38)}px "PT Mono", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(gi + 1), X + T / 2, Y + T / 2 + 1);
    });
  if (showG) {
    const gCatch = sim.caught === "guard" ? whoCaught(lv, sim) : -1;
    lv.guards.forEach((gd, gi) => {
      const { i } = guardPos(lv, sim, gi, t),
        nx = guardPos(lv, sim, gi, t + 1).i,
        [X, Y] = at(i);
      const pi = t > 0 ? guardPos(lv, sim, gi, t - 1).i : i;
      if (pi !== i) {
        const [PX, PY] = at(pi);
        g.globalAlpha = 0.28;
        emoji(g, "💂", PX + T / 2, PY + T / 2, T * 0.6);
        g.globalAlpha = 1;
      }
      if (nx !== i) {
        const [NX, NY] = at(nx);
        g.strokeStyle = "#FF8A8A";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(X + T / 2, Y + T / 2);
        const mx = (X + NX) / 2 + T / 2,
          my = (Y + NY) / 2 + T / 2;
        g.lineTo(mx, my);
        g.stroke();
        g.fillStyle = "#FF8A8A";
        g.beginPath();
        g.arc(mx, my, Math.max(2, T * 0.08), 0, 6.283);
        g.fill();
      }
      if (gi === gCatch) {
        g.save();
        g.strokeStyle = "#FF3B3B";
        g.lineWidth = 3;
        g.shadowColor = "#FF3B3B";
        g.shadowBlur = 12;
        g.beginPath();
        g.arc(X + T / 2, Y + T / 2, T * 0.48, 0, 6.283);
        g.stroke();
        g.restore();
      }
      emoji(g, "💂", X + T / 2, Y + T / 2, T * 0.72);
    });
  }
  // кофейные пятна (с дела №8): под ними штурман ничего не видит
  for (const st of lv.stains || []) coffeeStain(g, st, ox, oy, T, o.showAll);
  if (o.showStart && o.start != null) {
    const [X, Y] = at(o.start);
    g.save();
    g.setLineDash([3, 3]);
    g.strokeStyle = "rgba(255,210,63,.8)";
    g.lineWidth = 1.5;
    g.strokeRect(X + 3, Y + 3, T - 6, T - 6);
    g.restore();
    g.fillStyle = "rgba(255,210,63,.9)";
    g.font = `bold ${Math.max(8, Math.round(T * 0.24))}px "PT Mono", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("СТАРТ", X + T / 2, Y + T / 2);
  }
  // вор: виден только в тренировке, на пеленге и в конце
  const ping = o.now < (o.pingUntil || 0);
  if ((o.showThief || ping) && o.thief) {
    if (o.showThief) {
      g.save();
      g.strokeStyle = "rgba(255,210,63,.45)";
      g.setLineDash([2, 5]);
      g.lineWidth = 2;
      g.beginPath();
      sim.trail.forEach((c, i) => {
        const [X, Y] = at(c);
        i ? g.lineTo(X + T / 2, Y + T / 2) : g.moveTo(X + T / 2, Y + T / 2);
      });
      g.stroke();
      g.restore();
    }
    const tx = ox + o.thief.x * T,
      ty = oy + o.thief.y * T,
      r = T * 0.34;
    if (ping) {
      const k = ((o.pingUntil - o.now) % 1000) / 1000;
      g.strokeStyle = `rgba(127,212,255,${k})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(tx, ty, T * (1.6 - k), 0, 6.283);
      g.stroke();
    }
    g.save();
    g.translate(tx, ty);
    g.rotate(-o.thief.yaw);
    g.fillStyle = "rgba(255,210,63,.18)";
    g.beginPath();
    g.arc(0, 0, r * 1.8, 0, 6.283);
    g.fill();
    g.fillStyle = sim.caught ? "#FF4B4B" : "#FFD23F";
    g.strokeStyle = "#1A1400";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r, 0, 6.283);
    g.fill();
    g.stroke();
    g.fillStyle = "#1A1400";
    g.beginPath();
    g.moveTo(0, -r * 1.55);
    g.lineTo(r * 0.55, -r * 0.75);
    g.lineTo(-r * 0.55, -r * 0.75);
    g.closePath();
    g.fill();
    g.restore();
  }
}

// кофейное пятно: неровная лужица с тёмным ободком, бликом, брызгами и следом от донышка кружки.
// Форма своя у каждого пятна, но постоянная; клетки под пятном закрыты целиком. see — тренировка, пятно полупрозрачное
function coffeeStain(g, st, ox, oy, T, see) {
  const X = ox + st.x0 * T,
    Y = oy + st.y0 * T,
    w = st.w * T,
    h = st.h * T,
    cx = X + w / 2,
    cy = Y + h / 2;
  let seed = (st.x0 * 7919 + st.y0 * 104729 + st.w * 31) | 0;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // край: «квадратный круг» (закрывает углы клеток) с волнами наружу
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28],
    edge = new Path2D();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * 6.2832,
      c = Math.cos(a),
      sn = Math.sin(a),
      sq = 1 / Math.pow(Math.abs(c) ** 8 + Math.abs(sn) ** 8, 1 / 8),
      wob =
        1.04 +
        0.04 * (1 + Math.sin(3 * a + ph[0])) +
        0.02 * (1 + Math.sin(5 * a + ph[1])) +
        0.01 * (1 + Math.sin(11 * a + ph[2]));
    const px = cx + c * sq * (w / 2) * wob,
      py = cy + sn * sq * (h / 2) * wob;
    i ? edge.lineTo(px, py) : edge.moveTo(px, py);
  }
  edge.closePath();
  g.save();
  g.globalAlpha = see ? 0.55 : 1;
  // брызги вокруг
  for (let k = 0, n = 5 + Math.floor(rnd() * 4); k < n; k++) {
    const a = rnd() * 6.2832,
      d = 0.56 + rnd() * 0.14,
      r = T * (0.08 + rnd() * 0.14);
    const dx = cx + Math.cos(a) * w * d,
      dy = cy + Math.sin(a) * h * d;
    g.fillStyle = "#3b210d";
    g.beginPath();
    g.ellipse(dx, dy, r * 1.25, r, a, 0, 6.2832);
    g.fill();
    g.fillStyle = "rgba(255,230,190,.28)";
    g.beginPath();
    g.arc(dx - r * 0.35, dy - r * 0.35, r * 0.3, 0, 6.2832);
    g.fill();
  }
  // сама лужица: в середине светлее, к краю темнее
  const R = Math.max(w, h) * 0.65,
    gr = g.createRadialGradient(cx - w * 0.1, cy - h * 0.1, 2, cx, cy, R);
  gr.addColorStop(0, "#6a4220");
  gr.addColorStop(0.6, "#4e2d13");
  gr.addColorStop(1, "#331b09");
  g.fillStyle = gr;
  g.fill(edge);
  g.save();
  g.clip(edge);
  // кофейное кольцо: краска собирается у края
  g.strokeStyle = "rgba(28,13,4,.6)";
  g.lineWidth = T * 0.45;
  g.stroke(edge);
  // разводы посветлее
  for (let k = 0; k < 3; k++) {
    const bx = cx + (rnd() - 0.5) * w * 0.6,
      by = cy + (rnd() - 0.5) * h * 0.6,
      br = T * (0.5 + rnd() * 0.6),
      bg = g.createRadialGradient(bx, by, 1, bx, by, br);
    bg.addColorStop(0, "rgba(140,90,45,.35)");
    bg.addColorStop(1, "rgba(140,90,45,0)");
    g.fillStyle = bg;
    g.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  // след от донышка кружки: кольцо, частью вылезает за край
  const mr = Math.min(w, h) * 0.36,
    mx = cx + (rnd() - 0.5) * w * 0.35,
    my = cy + (rnd() - 0.5) * h * 0.35;
  g.restore();
  g.strokeStyle = "rgba(30,14,4,.7)";
  g.lineWidth = Math.max(1.5, T * 0.09);
  g.beginPath();
  g.arc(mx, my, mr, rnd() * 6.28, rnd() * 6.28 + 5.2);
  g.stroke();
  g.strokeStyle = "rgba(30,14,4,.3)";
  g.lineWidth = Math.max(1, T * 0.04);
  g.beginPath();
  g.arc(mx, my, mr * 0.86, 0, 6.2832);
  g.stroke();
  // глянцевый блик сверху слева
  g.save();
  g.clip(edge);
  const hx = cx - w * 0.22,
    hy = cy - h * 0.24,
    hg = g.createRadialGradient(hx, hy, 1, hx, hy, Math.min(w, h) * 0.3);
  hg.addColorStop(0, "rgba(255,240,215,.32)");
  hg.addColorStop(1, "rgba(255,240,215,0)");
  g.fillStyle = hg;
  g.beginPath();
  g.ellipse(hx, hy, w * 0.3, h * 0.14, -0.5, 0, 6.2832);
  g.fill();
  g.strokeStyle = "rgba(255,245,225,.45)";
  g.lineWidth = Math.max(1, T * 0.05);
  g.lineCap = "round";
  g.beginPath();
  g.ellipse(cx, cy, w * 0.38, h * 0.36, 0, 3.6, 4.3);
  g.stroke();
  g.restore();
  g.strokeStyle = "rgba(22,10,2,.85)";
  g.lineWidth = 1.5;
  g.stroke(edge);
  g.restore();
}

// клик по схеме (u, v — координаты на экране планшета 0..1, v снизу вверх) → комната под ним или -1.
// Стена и проём рядом с комнатой считаются ею: так проще попасть пальцем
export function planRoom(lv, CW, CH, u, v) {
  const W = lv.W,
    H = lv.H,
    T = Math.floor(Math.min(CW / W, CH / H)),
    ox = Math.floor((CW - T * W) / 2),
    oy = Math.floor((CH - T * H) / 2),
    fx = (u * CW - ox) / T,
    fy = ((1 - v) * CH - oy) / T;
  if (fx < 0 || fy < 0 || fx >= W || fy >= H) return -1;
  const x = Math.min(W - 2, 2 * Math.floor(fx / 2) + 1),
    y = Math.min(H - 2, 2 * Math.floor(fy / 2) + 1);
  return y * W + x;
}
