// Схема здания для штурмана (и мини-карта в тренировке). Рисуется в 2D canvas.
// Как в 2D-версии: мир показан на такт вперёд, бледный охранник — где он сейчас.
import { LM, guardPos, ray, camDir, laserOn, whoCaught } from "./logic.js";

function emoji(g, ch, x, y, size) {
  g.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(ch, x, y + size * 0.05);
}

// o: { lv, sim, now, showGuards, showThief, thief: {x, y, yaw} в клетках, pingUntil, showStart, start }
export function drawPlan(g, CW, CH, o) {
  const { lv, sim } = o,
    W = lv.W,
    H = lv.H;
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
  for (const c of lv.cams) {
    const k = camDir(c, t);
    if (k >= 0) zone(ray(lv, c.i, k, lv.camr), "rgba(255,170,40,.32)");
  }
  if (o.showGuards)
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
  // маршруты охраны
  g.save();
  g.setLineDash([2, 4]);
  g.strokeStyle = "rgba(255,120,120,.5)";
  g.lineWidth = 1.5;
  for (const gd of lv.guards) {
    g.beginPath();
    gd.path.forEach((c, i) => {
      const [X, Y] = at(c);
      i ? g.lineTo(X + T / 2, Y + T / 2) : g.moveTo(X + T / 2, Y + T / 2);
    });
    g.stroke();
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
  if (o.showGuards && !(sim.caught || sim.won))
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
  for (const c of lv.cams) {
    const [X, Y] = at(c.i);
    emoji(g, "📹", X + T / 2, Y + T / 2, T * 0.62);
  }
  if (o.showGuards) {
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
