/* КС 5×5 — движок.
   Детерминированный: одинаковые seed + приказы → одинаковый матч у обоих игроков (онлайн шлёт только приказы).
   В симуляции только +, −, ×, ÷, sqrt, floor/round — без тригонометрии, чтобы Chrome и Safari считали бит в бит. */
(function (root) {
  'use strict';
  const VERSION = 'k5-1';
  const TICK = 0.1, TURN = 5, TPT = 50;            // 50 тиков по 0,1 с = ход 5 секунд
  const ROUND_T = 60, BOMB_T = 20, PLANT_T = 1.6, DEF_T = 5, DEF_KIT = 2.5;
  const RUN = 3.0, WALK = 1.55, LURK_WALK = 2.3;    // клеток в секунду
  const FOV_COS = 0.5736;                           // обзор 110°
  const AWARE = 1.8;                                // вплотную замечаешь в любую сторону
  const HEAR_STEP = 12, HEAR_SHOT = 24, HEAR_BOMB = 12;
  const SMOKE_R = 2.4, SMOKE_LIFE = 15, FIRE_R = 2.0, FIRE_LIFE = 7, HE_R = 3.6;
  const MAX_MONEY = 16000;
  const Q = v => Math.round(v * 256) / 256;

  /* ---------------- карта: Dust 2 сверху ---------------- */
  const MAP = {
    name: 'Dust 2', w: 48, h: 46,
    floor: [
      [3, 3, 12, 11], [4, 12, 6, 16], [3, 17, 8, 21], [4, 22, 7, 31], [4, 31, 13, 34], [12, 34, 30, 44],
      [17, 29, 21, 34], [17, 11, 21, 28], [18, 10, 20, 10], [16, 5, 24, 9], [14, 7, 15, 9], [13, 7, 13, 9],
      [14, 2, 17, 4], [22, 1, 28, 8], [29, 3, 29, 6], [30, 2, 41, 12], [9, 18, 13, 19], [12, 13, 13, 17],
      [14, 13, 16, 14], [22, 20, 25, 21], [24, 13, 26, 19], [27, 11, 29, 13], [36, 13, 41, 30], [42, 13, 45, 18],
      [37, 31, 39, 31], [30, 32, 41, 36]
    ],
    boxes: [
      [18, 10, 18, 10], [20, 10, 20, 10], [20, 24, 21, 25], [4, 5, 5, 6], [9, 4, 10, 5], [10, 9, 11, 10],
      [33, 6, 34, 7], [35, 9, 36, 10], [39, 4, 40, 5], [39, 26, 41, 27], [16, 38, 17, 39], [25, 40, 26, 41],
      [24, 3, 25, 4], [14, 32, 15, 33], [18, 36, 20, 37]
    ],
    glass: [[13, 3, 13, 4]],
    zones: { A: [31, 3, 40, 11], B: [3, 3, 12, 11] },
    spawn: { T: [[16, 41], [19, 42], [22, 42], [25, 42], [28, 41]], CT: [[23, 6], [26, 6], [27, 3], [22, 3], [24, 8]] },
    labels: [
      ['A', 35.5, 4.5, 'site'], ['B', 7.5, 7.5, 'site'], ['МИД', 19.5, 18, 'call'], ['ЛОНГ', 39, 22, 'call'], ['ШОРТ', 25.5, 16.5, 'call'],
      ['ТУННЕЛИ', 5.5, 26, 'call'], ['НИЖНИЕ', 11, 18.8, 'call'], ['ОКНО', 15.5, 2.4, 'call'], ['ДВЕРИ', 14.5, 10.4, 'call'],
      ['ПИТ', 43.8, 16, 'call'], ['КЭТВОК', 23.8, 22.7, 'call'], ['T', 21, 37, 'spawn'], ['CT', 25.5, 5, 'spawn'], ['МИД-ДВЕРИ', 19.5, 11.6, 'call']
    ]
  };
  const GW = MAP.w, GH = MAP.h;
  const G = new Uint8Array(GW * GH); // 0 стена, 1 пол, 2 ящик, 3 стекло
  function paint(rs, v) { for (const [x0, y0, x1, y1] of rs) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) G[y * GW + x] = v; }
  paint(MAP.floor, 1); paint(MAP.boxes, 2); paint(MAP.glass, 3);
  const cell = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH) ? 0 : G[y * GW + x];
  const walk = (x, y) => cell(x, y) === 1;
  const opaque = (x, y) => { const c = cell(x, y); return c === 0 || c === 2; };
  const notWalk = (x, y) => !walk(x, y);
  function zoneAt(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (const k in MAP.zones) { const [a, b, c, d] = MAP.zones[k]; if (cx >= a && cx <= c && cy >= b && cy <= d) return k; }
    return null;
  }

  // Луч по клеткам (Amanatides–Woo). blocked(cx, cy) → true, если клетка не пропускает. strict — нельзя срезать угол.
  function ray(ax, ay, bx, by, blocked, strict) {
    let cx = Math.floor(ax), cy = Math.floor(ay);
    const tx = Math.floor(bx), ty = Math.floor(by);
    const dx = bx - ax, dy = by - ay;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity;
    let tmx = sx > 0 ? (cx + 1 - ax) * tdx : sx < 0 ? (ax - cx) * tdx : Infinity;
    let tmy = sy > 0 ? (cy + 1 - ay) * tdy : sy < 0 ? (ay - cy) * tdy : Infinity;
    for (let guard = 0; guard < 220 && (cx !== tx || cy !== ty); guard++) {
      if (tmx < tmy) { tmx += tdx; cx += sx; }
      else if (tmy < tmx) { tmy += tdy; cy += sy; }
      else {
        const a = blocked(cx + sx, cy), b = blocked(cx, cy + sy);
        if (strict ? (a || b) : (a && b)) return false;
        tmx += tdx; tmy += tdy; cx += sx; cy += sy;
      }
      if (blocked(cx, cy)) return false;
    }
    return cx === tx && cy === ty;
  }
  function segDist2(ax, ay, bx, by, px, py) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px, qy = ay + dy * t - py;
    return qx * qx + qy * qy;
  }
  function smokeBlocks(smokes, ax, ay, bx, by) {
    for (const m of smokes) if (m.r > 0.2 && segDist2(ax, ay, bx, by, m.x, m.y) < m.r * m.r) return true;
    return false;
  }
  // Видно ли точку b из точки a: стены, ящики и дым мешают, стекло нет.
  function los(smokes, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    if (dx * dx + dy * dy < 1) return true;
    return ray(ax, ay, bx, by, opaque, false) && !smokeBlocks(smokes || [], ax, ay, bx, by);
  }
  const walkLine = (ax, ay, bx, by) => ray(ax, ay, bx, by, notWalk, true);

  /* ---------------- поиск пути: A* по клеткам ---------------- */
  const SQ2 = 1.41421356;
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
  const pathCache = new Map();
  function astar(sx, sy, tx, ty) {
    if (!walk(sx, sy) || !walk(tx, ty)) return null;
    const key = sx + ',' + sy + '>' + tx + ',' + ty;
    if (pathCache.has(key)) return pathCache.get(key);
    const N = GW * GH, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const hf = [], hi = [];
    const push = (f, i) => { hf.push(f); hi.push(i); let k = hf.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] < hf[k] || (hf[p] === hf[k] && hi[p] <= hi[k])) break; [hf[p], hf[k]] = [hf[k], hf[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; } };
    const pop = () => { const r = hi[0], lf = hf.pop(), li = hi.pop(); if (hf.length) { hf[0] = lf; hi[0] = li; let k = 0; for (;;) { const l = 2 * k + 1, rr = l + 1; let m = k; if (l < hf.length && (hf[l] < hf[m] || (hf[l] === hf[m] && hi[l] < hi[m]))) m = l; if (rr < hf.length && (hf[rr] < hf[m] || (hf[rr] === hf[m] && hi[rr] < hi[m]))) m = rr; if (m === k) break; [hf[m], hf[k]] = [hf[k], hf[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m; } } return r; };
    const h = (x, y) => { const ax = Math.abs(x - tx), ay = Math.abs(y - ty); return ax + ay + (SQ2 - 2) * Math.min(ax, ay); };
    const s0 = sy * GW + sx, t0 = ty * GW + tx;
    g[s0] = 0; push(h(sx, sy), s0);
    while (hf.length) {
      const i = pop(); if (closed[i]) continue; closed[i] = 1;
      if (i === t0) break;
      const x = i % GW, y = (i - x) / GW;
      for (const [dx, dy, c] of DIRS) {
        const nx = x + dx, ny = y + dy; if (!walk(nx, ny)) continue;
        if (dx && dy && (!walk(x + dx, y) || !walk(x, y + dy))) continue;
        const j = ny * GW + nx, ng = g[i] + c;
        if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + h(nx, ny), j); }
      }
    }
    let res = null;
    if (from[t0] >= 0 || s0 === t0) { res = []; for (let i = t0; i >= 0; i = from[i]) { res.push([i % GW, Math.floor(i / GW)]); if (i === s0) break; } res.reverse(); }
    if (pathCache.size > 4000) pathCache.clear();
    pathCache.set(key, res);
    return res;
  }
  // Маршрут из точки (x, y) через точки-клетки wps. Возвращает сглаженный список точек без стартовой или null.
  function routeFrom(x, y, wps) {
    let cx = Math.floor(x), cy = Math.floor(y);
    const pts = [[x, y]];
    for (const [wx, wy] of wps) {
      const p = astar(cx, cy, wx, wy); if (!p) return null;
      for (let i = 1; i < p.length; i++) pts.push([p[i][0] + 0.5, p[i][1] + 0.5]);
      cx = wx; cy = wy;
    }
    if (pts.length < 2) return [];
    // натягиваем «нитку»: прямые отрезки там, где можно пройти
    const out = []; let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !walkLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  function routeLen(x, y, r) { let L = 0, px = x, py = y; for (const [a, b] of r) { L += Math.sqrt((a - px) * (a - px) + (b - py) * (b - py)); px = a; py = b; } return L; }

  /* ---------------- оружие, гранаты, роли ---------------- */
  // dmg — урон в тело, pen — бронепробитие, rof — секунд между выстрелами, acc — точность стоя вблизи,
  // rng — на скольких клетках точность падает вдвое, mv — множитель точности на бегу, spd — скорость с ним.
  const W = {
    glock:  { name: 'Glock-18',     side: 'T',  cat: 'pistol', price: 200,  dmg: 30,  pen: 0.47,  rof: 0.15, acc: 0.62, rng: 9,   mv: 0.55, spray: 0.06, spd: 1,    reward: 300 },
    usp:    { name: 'USP-S',        side: 'CT', cat: 'pistol', price: 200,  dmg: 35,  pen: 0.505, rof: 0.17, acc: 0.70, rng: 11,  mv: 0.55, spray: 0.05, spd: 1,    reward: 300 },
    p250:   { name: 'P250',         side: '*',  cat: 'pistol', price: 300,  dmg: 38,  pen: 0.64,  rof: 0.15, acc: 0.65, rng: 10,  mv: 0.55, spray: 0.07, spd: 1,    reward: 300 },
    tec9:   { name: 'Tec-9',        side: 'T',  cat: 'pistol', price: 500,  dmg: 33,  pen: 0.906, rof: 0.12, acc: 0.60, rng: 10,  mv: 0.6,  spray: 0.07, spd: 1,    reward: 300, note: 'ваншот в голову даже в шлеме' },
    five:   { name: 'Five-SeveN',   side: 'CT', cat: 'pistol', price: 500,  dmg: 32,  pen: 0.91,  rof: 0.15, acc: 0.68, rng: 11,  mv: 0.6,  spray: 0.06, spd: 1,    reward: 300, note: 'ваншот в голову даже в шлеме' },
    deagle: { name: 'Desert Eagle', side: '*',  cat: 'pistol', price: 700,  dmg: 53,  pen: 0.93,  rof: 0.25, acc: 0.60, rng: 14,  mv: 0.4,  spray: 0.25, spd: 1,    reward: 300, note: 'ваншот в голову на любой дистанции' },
    mac10:  { name: 'MAC-10',       side: 'T',  cat: 'smg',    price: 1050, dmg: 29,  pen: 0.575, rof: 0.075, acc: 0.55, rng: 10, mv: 0.65, spray: 0.05, spd: 0.96, reward: 600, note: '$600 за убийство' },
    mp9:    { name: 'MP9',          side: 'CT', cat: 'smg',    price: 1250, dmg: 26,  pen: 0.6,   rof: 0.07, acc: 0.58, rng: 11,  mv: 0.65, spray: 0.05, spd: 0.96, reward: 600, note: '$600 за убийство' },
    ump:    { name: 'UMP-45',       side: '*',  cat: 'smg',    price: 1200, dmg: 35,  pen: 0.65,  rof: 0.09, acc: 0.58, rng: 13,  mv: 0.6,  spray: 0.06, spd: 0.95, reward: 600, note: '$600 за убийство' },
    galil:  { name: 'Galil AR',     side: 'T',  cat: 'rifle',  price: 1800, dmg: 30,  pen: 0.775, rof: 0.09, acc: 0.66, rng: 18,  mv: 0.25, spray: 0.08, spd: 0.92, reward: 300 },
    famas:  { name: 'FAMAS',        side: 'CT', cat: 'rifle',  price: 1950, dmg: 30,  pen: 0.7,   rof: 0.09, acc: 0.68, rng: 19,  mv: 0.25, spray: 0.08, spd: 0.92, reward: 300 },
    ak:     { name: 'AK-47',        side: 'T',  cat: 'rifle',  price: 2700, dmg: 36,  pen: 0.775, rof: 0.1,  acc: 0.72, rng: 22,  mv: 0.22, spray: 0.08, spd: 0.9,  reward: 300, note: 'ваншот в голову даже в шлеме' },
    m4a4:   { name: 'M4A4',         side: 'CT', cat: 'rifle',  price: 2900, dmg: 33,  pen: 0.7,   rof: 0.09, acc: 0.74, rng: 22,  mv: 0.24, spray: 0.07, spd: 0.91, reward: 300, note: 'быстрее стреляет' },
    m4a1:   { name: 'M4A1-S',       side: 'CT', cat: 'rifle',  price: 2900, dmg: 38,  pen: 0.7,   rof: 0.1,  acc: 0.77, rng: 24,  mv: 0.24, spray: 0.06, spd: 0.91, reward: 300, note: 'точнее, ваншот в голову' },
    ssg:    { name: 'SSG 08',       side: '*',  cat: 'sniper', price: 1700, dmg: 88,  pen: 0.85,  rof: 1.25, acc: 0.86, rng: 60,  mv: 0.5,  spray: 0,    spd: 0.97, reward: 300, close: 0.75, note: 'ваншот в голову' },
    awp:    { name: 'AWP',          side: '*',  cat: 'sniper', price: 4750, dmg: 115, pen: 0.975, rof: 1.46, acc: 0.9,  rng: 120, mv: 0.04, spray: 0,    spd: 0.82, reward: 100, close: 0.55, note: 'попал в тело = убил · $100 за убийство' }
  };
  const PISTOLS = ['glock', 'usp', 'p250', 'tec9', 'five', 'deagle'];
  const DEFAULT_PISTOL = { T: 'glock', CT: 'usp' };
  const NADES = {
    fl: { name: 'Флешка', price: 200, max: 2, rng: 13, short: 'слепит всех, кто на неё смотрит' },
    sm: { name: 'Дым', price: 300, max: 1, rng: 15, short: 'закрывает обзор на 3 хода' },
    mo: { name: 'Молотов', nameCT: 'Зажигалка', price: 400, priceCT: 500, max: 1, rng: 11, short: 'огонь 7 секунд, гасится дымом' },
    he: { name: 'HE', price: 300, max: 1, rng: 13, short: 'до 98 урона рядом со взрывом' }
  };
  const NADE_KEYS = ['fl', 'sm', 'mo', 'he'];
  const nadeName = (n, side) => side === 'CT' && NADES[n].nameCT ? NADES[n].nameCT : NADES[n].name;
  const nadePrice = (n, side) => side === 'CT' && NADES[n].priceCT ? NADES[n].priceCT : NADES[n].price;
  const ROLES = [
    { id: 'igl',    name: 'Капитан', short: 'КАП', ic: '★', react: 0.33, aim: 1.0,  hs: 0.13, perk: '+1 граната; пока жив, команда слышит шаги дальше' },
    { id: 'entry',  name: 'Энтри',   short: 'ЭНТ', ic: '⚡', react: 0.30, aim: 1.02, hs: 0.14, spd: 1.08, mvKeep: 0.5, perk: 'бегает быстрее и метче стреляет на ходу' },
    { id: 'rifler', name: 'Рифлер',  short: 'РИФ', ic: '◎', react: 0.27, aim: 1.1,  hs: 0.19, perk: 'лучший аим: быстрее реагирует, чаще в голову' },
    { id: 'awp',    name: 'Авапер',  short: 'AWP', ic: '⌖', react: 0.32, aim: 1.0,  hs: 0.14, awp: true, perk: 'AWP дешевле на $500 и точнее' },
    { id: 'lurk',   name: 'Люркер',  short: 'ЛЮР', ic: '☾', react: 0.31, aim: 1.03, hs: 0.15, quiet: true, perk: 'шаги в 2 раза тише, шагом ходит почти как бегом' }
  ];
  const NAMES = [['Шах', 'Барс', 'Кобра', 'Сокол', 'Тень'], ['Беркут', 'Гром', 'Лёд', 'Ястреб', 'Призрак']];
  const GEAR = { kev: { name: 'Броня', price: 650 }, helm: { name: 'Броня + шлем', price: 1000 }, kit: { name: 'Набор сапёра', price: 400 } };

  /* ---------------- случайность ---------------- */
  function hashStr(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ---------------- состояние ---------------- */
  const freshInv = side => ({ prim: null, pist: DEFAULT_PISTOL[side], armor: 0, nades: { fl: 0, sm: 0, mo: 0, he: 0 }, kit: false });
  const nadeCap = slot => slot === 0 ? 5 : 4;
  const nadeCount = inv => inv.nades.fl + inv.nades.sm + inv.nades.mo + inv.nades.he;
  const curW = u => u.prim || u.pist;
  const sideOfU = (s, u) => s.sideOf[u.seat];
  const tSeat = s => s.sideOf[0] === 'T' ? 0 : 1;
  const ctSeat = s => 1 - tSeat(s);
  const teamOf = (s, seat) => s.units.slice(seat * 5, seat * 5 + 5);

  function create(seed, opts) {
    opts = opts || {};
    const win = opts.win === 8 ? 8 : 5;
    const s = {
      v: VERSION, seed: String(seed), rnd: mulberry(hashStr('k5:' + seed)), win, half: win - 1,
      n: 0, round: 0, score: [0, 0], L: [0, 0], sideOf: ['T', 'CT'], phase: 1,
      units: [], over: false, winner: null, step: 'buy', history: [],
      time: 0, clock: ROUND_T, turn: 0, tk: 0, smokes: [], fires: [], flying: [], drops: [], bomb: null,
      intel: [null, null], last: null
    };
    const t = Math.floor(s.rnd() * 2);
    s.sideOf = t === 0 ? ['T', 'CT'] : ['CT', 'T'];
    for (let seat = 0; seat < 2; seat++) for (let slot = 0; slot < 5; slot++) {
      s.units.push(Object.assign({ id: seat * 5 + slot, seat, slot, name: NAMES[seat][slot], money: 800, st: { k: 0, d: 0, dmg: 0 } }, freshInv(s.sideOf[seat])));
    }
    startRound(s);
    return s;
  }
  function newIntel() { return { seen: {}, heard: [] }; }
  function startRound(s) {
    s.round++; s.n++;
    s.step = 'buy'; s.time = 0; s.clock = ROUND_T; s.turn = 0; s.tk = 0;
    s.smokes = []; s.fires = []; s.flying = []; s.drops = []; s.bomb = null;
    s.intel = [newIntel(), newIntel()]; s.vis = [0, 0];
    s.rst = s.units.map(() => ({ k: 0, dmg: 0 }));
    for (const u of s.units) {
      const side = s.sideOf[u.seat], sp = MAP.spawn[side][u.slot];
      Object.assign(u, { x: sp[0] + 0.5, y: sp[1] + 0.5, fx: 0, fy: side === 'T' ? -1 : 1, hp: 100, alive: true, route: [], look: null, walk: false, delay: 0, act: null, nade: null,
        tgt: null, react: 0, cd: 0, burst: 0, idle: 0, held: 0, blind: 0, moving: false, stepAcc: 0, alertT: 0, alertX: 0, alertY: 0, plantT: 0, defT: 0, busy: null, stuck: 0 });
    }
  }
  function setSides(s, tSeatNew) { s.sideOf = tSeatNew === 0 ? ['T', 'CT'] : ['CT', 'T']; }
  function resetEconomy(s, money) {
    s.L = [0, 0];
    for (const u of s.units) { Object.assign(u, freshInv(s.sideOf[u.seat])); u.money = money; }
  }

  function pending(s) {
    if (s.over) return { kind: 'over', seats: [false, false] };
    return { kind: s.step, seats: [true, true] };
  }

  /* ---------------- закупка ---------------- */
  // items: список покупок одного бойца. Возвращает { cost, inv, err }.
  function priceItems(s, u, items) {
    const side = s.sideOf[u.seat], inv = { prim: u.prim, pist: u.pist, armor: u.armor, nades: Object.assign({}, u.nades), kit: u.kit };
    let cost = 0;
    if (!Array.isArray(items) || items.length > 10) return { err: 'bad' };
    for (const id of items) {
      if (W[id]) {
        const w = W[id];
        if (w.side !== '*' && w.side !== side) return { err: 'side' };
        let pr = w.price; if (id === 'awp' && ROLES[u.slot].awp) pr -= 500;
        if (w.cat === 'pistol') { if (inv.pist === id) return { err: 'have' }; inv.pist = id; }
        else { if (inv.prim === id) return { err: 'have' }; inv.prim = id; }
        cost += pr;
      } else if (id === 'kev') { if (inv.armor >= 1) return { err: 'have' }; cost += 650; inv.armor = 1; }
      else if (id === 'helm') { if (inv.armor >= 2) return { err: 'have' }; cost += inv.armor === 1 ? 350 : 1000; inv.armor = 2; }
      else if (id === 'kit') { if (side !== 'CT' || inv.kit) return { err: 'have' }; cost += 400; inv.kit = true; }
      else if (NADES[id]) {
        if (inv.nades[id] >= NADES[id].max || nadeCount(inv) >= nadeCap(u.slot)) return { err: 'nades' };
        inv.nades[id]++; cost += nadePrice(id, side);
      } else return { err: 'bad' };
    }
    if (cost > u.money) return { err: 'money', cost };
    return { cost, inv };
  }
  function itemPrice(s, u, id) {
    const side = s.sideOf[u.seat];
    if (W[id]) return W[id].price - (id === 'awp' && ROLES[u.slot].awp ? 500 : 0);
    if (id === 'helm') return u.armor === 1 ? 350 : 1000;
    if (GEAR[id]) return GEAR[id].price;
    if (NADES[id]) return nadePrice(id, side);
    return 0;
  }
  function doBuy(s, picks) {
    const ev = [];
    const bought = [];
    for (let seat = 0; seat < 2; seat++) {
      const p = picks[seat];
      for (let slot = 0; slot < 5; slot++) {
        const u = s.units[seat * 5 + slot];
        const r = priceItems(s, u, (p.b && p.b[slot]) || []);
        if (r.err) { bought.push({ id: u.id, cost: 0 }); continue; }
        u.money -= r.cost; Object.assign(u, r.inv);
        bought.push({ id: u.id, cost: r.cost });
      }
    }
    const t = tSeat(s), pb = picks[t] && picks[t].bomb;
    const slot = Number.isInteger(pb) && pb >= 0 && pb < 5 ? pb : 0;
    s.bomb = { st: 'carry', carrier: t * 5 + slot, x: 0, y: 0, t: BOMB_T, site: null };
    ev.push({ k: 'buy', bought });
    s.step = 'turn'; s.n++;
    return ev;
  }

  /* ---------------- приказы ---------------- */
  // Приказ бойцу на ход: { p: [[x,y],...] точки маршрута ([] — стоять), l: [x,y] куда смотреть (0 — сбросить),
  //   w: 1 — шагом (тихо), d: задержка старта 0–4 с, a: 'plant'|'defuse', n: { t, x, y, e } граната (e: 1 — дойдя до конца) }.
  // null — продолжать прошлый приказ.
  const isPt = p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  function orderRoute(s, u, o) {
    if (o.p === undefined) return u.route;
    if (!Array.isArray(o.p) || o.p.length > 8) return null;
    for (const p of o.p) if (!isPt(p) || !Number.isInteger(p[0]) || !Number.isInteger(p[1]) || !walk(p[0], p[1])) return null;
    return o.p.length ? routeFrom(u.x, u.y, o.p) : [];
  }
  function validOrder(s, u, o) {
    if (o == null) return true;
    if (typeof o !== 'object') return false;
    if (!u.alive) return true;
    const r = orderRoute(s, u, o); if (r == null) return false;
    if (o.l !== undefined && o.l !== 0 && o.l !== null && !(isPt(o.l) && o.l[0] >= 0 && o.l[1] >= 0 && o.l[0] <= GW && o.l[1] <= GH)) return false;
    if (o.d !== undefined && !(Number.isInteger(o.d) && o.d >= 0 && o.d <= 4)) return false;
    if (o.a != null && !((o.a === 'plant' && sideOfU(s, u) === 'T') || (o.a === 'defuse' && sideOfU(s, u) === 'CT'))) return false;
    if (o.n != null) {
      const n = o.n; if (!NADES[n.t] || !isPt([n.x, n.y]) || !(u.nades[n.t] > 0)) return false;
      if (!walk(Math.floor(n.x), Math.floor(n.y))) return false;
      const from = n.e && r.length ? r[r.length - 1] : [u.x, u.y];
      const dx = n.x - from[0], dy = n.y - from[1];
      if (dx * dx + dy * dy > (NADES[n.t].rng + 0.6) * (NADES[n.t].rng + 0.6)) return false;
    }
    return true;
  }
  function valid(s, k, p) {
    if (s.over) return p == null;
    if (p == null || typeof p !== 'object') return false;
    if (s.step === 'buy') {
      if (!Array.isArray(p.b) || p.b.length !== 5) return false;
      for (let i = 0; i < 5; i++) if (priceItems(s, s.units[k * 5 + i], p.b[i] || []).err) return false;
      if (p.bomb !== undefined && !(Number.isInteger(p.bomb) && p.bomb >= 0 && p.bomb < 5)) return false;
      return true;
    }
    if (s.step === 'turn') {
      if (!Array.isArray(p.o) || p.o.length !== 5) return false;
      for (let i = 0; i < 5; i++) if (!validOrder(s, s.units[k * 5 + i], p.o[i])) return false;
      return true;
    }
    return false;
  }

  /* ---------------- ход: симуляция ---------------- */
  function apply(s, picks, opt) {
    opt = opt || {};
    if (s.step === 'buy') return { ev: doBuy(s, picks), film: null };
    return doTurn(s, picks, opt.film !== false);
  }
  function doTurn(s, picks, rec) {
    for (let seat = 0; seat < 2; seat++) for (let slot = 0; slot < 5; slot++) {
      const u = s.units[seat * 5 + slot], o = picks[seat] && picks[seat].o ? picks[seat].o[slot] : null;
      u.delay = 0; u.nade = null;
      if (!u.alive || o == null) continue;
      const r = orderRoute(s, u, o);
      if (r) u.route = r.map(p => [p[0], p[1]]);
      if (o.l !== undefined) u.look = isPt(o.l) ? [o.l[0], o.l[1]] : null;
      if (o.w !== undefined) u.walk = !!o.w;
      if (o.a !== undefined) u.act = o.a || null;
      u.delay = o.d | 0;
      u.nade = o.n ? { t: o.n.t, x: o.n.x, y: o.n.y, e: o.n.e ? 1 : 0 } : null;
      u.stuck = 0;
    }
    const F = rec ? { frames: [], ev: [], start: s.time, turn: s.turn, round: s.round, sideOf: s.sideOf.slice(), score: s.score.slice() } : null;
    const ev = [];
    s.tk0 = s.tk;
    s.emit = e => { e.i = s.tk - s.tk0; ev.push(e); };
    // гранаты «сразу» у тех, кто не ждёт
    for (const u of s.units) if (u.alive && u.nade && !u.nade.e && u.delay <= 0) throwNade(s, u);
    if (F) F.frames.push(frame(s));
    let ended = null;
    for (let i = 0; i < TPT && !ended; i++) {
      ended = tick(s);
      if (F) F.frames.push(frame(s));
    }
    s.turn++; s.n++;
    if (ended) endRound(s, ended.w, ended.how, ev);
    s.emit = null;
    if (F) F.ev = ev;
    return { ev, film: F };
  }
  function frame(s) {
    const u = s.units.map(u => [Q(u.x), Q(u.y), Math.round(u.fx * 100) / 100, Math.round(u.fy * 100) / 100, u.hp,
      (u.alive ? 1 : 0) | (u.blind > 0 ? 2 : 0) | (u.moving ? 4 : 0) | (u.busy === 'plant' ? 8 : 0) | (u.busy === 'defuse' ? 16 : 0) |
      (s.bomb && s.bomb.st === 'carry' && s.bomb.carrier === u.id ? 32 : 0) | (u.tgt != null ? 64 : 0) | (u.walk ? 128 : 0)]);
    return {
      u, vis: s.vis ? s.vis.slice() : [0, 0], clock: s.clock, time: s.time,
      sm: s.smokes.map(m => [m.x, m.y, Math.round(m.r * 100) / 100]),
      fi: s.fires.map(f => [f.x, f.y, f.r]),
      fl: s.flying.map(n => [n.t, n.x0, n.y0, n.x, n.y, n.t0, n.land]),
      bomb: s.bomb ? { st: s.bomb.st, x: s.bomb.x, y: s.bomb.y, t: s.bomb.t, c: s.bomb.carrier, site: s.bomb.site, dp: defProgress(s) } : null,
      dr: s.drops.map(d => [d.x, d.y, d.w])
    };
  }
  function defProgress(s) { for (const u of s.units) if (u.busy === 'defuse') return Math.round(100 * u.defT / (u.kit ? DEF_KIT : DEF_T)) / 100; return 0; }

  function hear(s, kind, x, y, srcSeat, radius, extra) {
    // кто слышит: команда, у которой есть живой боец в радиусе
    const heard = [false, false];
    for (let seat = 0; seat < 2; seat++) {
      if (seat === srcSeat) continue;
      let R = radius;
      if (kind === 'step' && s.units[seat * 5].alive) R *= 1.3; // капитан жив — слышим дальше
      for (const u of teamOf(s, seat)) { if (!u.alive) continue; const dx = u.x - x, dy = u.y - y; if (dx * dx + dy * dy <= R * R) { heard[seat] = true; break; } }
      if (heard[seat]) { s.intel[seat].heard.push(Object.assign({ x: Q(x), y: Q(y), t: s.time, kind }, extra || {})); if (s.intel[seat].heard.length > 60) s.intel[seat].heard.shift(); }
    }
    if ((heard[0] || heard[1]) && s.emit) s.emit({ k: 'heard', kind, x: Q(x), y: Q(y), by: heard });
    return heard;
  }

  function throwNade(s, u) {
    const n = u.nade; if (!n || !(u.nades[n.t] > 0)) { u.nade = null; return; }
    u.nades[n.t]--; u.nade = null;
    const dx = n.x - u.x, dy = n.y - u.y, d = Math.sqrt(dx * dx + dy * dy);
    const fly = { t: n.t, side: sideOfU(s, u), owner: u.id, x0: Q(u.x), y0: Q(u.y), x: n.x, y: n.y, t0: s.time, land: Q(s.time + 0.5 + d * 0.05 + (n.t === 'he' ? 0.4 : 0)) };
    s.flying.push(fly);
    s.emit({ k: 'throw', u: u.id, t: n.t, x: n.x, y: n.y });
  }
  function landNade(s, n) {
    const owner = s.units[n.owner];
    if (n.t === 'sm') {
      s.smokes.push({ x: n.x, y: n.y, r: 0, t0: s.time, t1: s.time + SMOKE_LIFE, side: n.side });
      // дым гасит огонь
      s.fires = s.fires.filter(f => { const dx = f.x - n.x, dy = f.y - n.y; const out = dx * dx + dy * dy < (SMOKE_R + f.r * 0.6) * (SMOKE_R + f.r * 0.6); if (out) s.emit({ k: 'douse', x: f.x, y: f.y }); return !out; });
      s.emit({ k: 'pop', t: 'sm', x: n.x, y: n.y });
    } else if (n.t === 'mo') {
      for (const m of s.smokes) { const dx = m.x - n.x, dy = m.y - n.y; if (dx * dx + dy * dy < (SMOKE_R + 1) * (SMOKE_R + 1)) { s.emit({ k: 'douse', x: n.x, y: n.y }); return; } }
      s.fires.push({ x: n.x, y: n.y, r: FIRE_R, t1: s.time + FIRE_LIFE, owner: n.owner });
      s.emit({ k: 'pop', t: 'mo', x: n.x, y: n.y });
    } else if (n.t === 'fl') {
      const hit = [];
      for (const u of s.units) {
        if (!u.alive) continue;
        const dx = n.x - u.x, dy = n.y - u.y, d2 = dx * dx + dy * dy; if (d2 > 16 * 16) continue;
        if (!los(s.smokes, n.x, n.y, u.x, u.y)) continue;
        const d = Math.sqrt(d2) || 0.01, dot = (u.fx * dx + u.fy * dy) / d;
        let dur = (dot > 0.25 ? 2.4 : dot > -0.3 ? 1.1 : 0.35) * (1 - d / 19);
        if (owner && owner.slot === 0 && owner.seat !== u.seat) dur *= 1.2;
        if (owner && owner.seat === u.seat && owner.id !== u.id) dur *= 0.35;   // свои знают про флешку и отворачиваются
        if (dur > 0.15) { u.blind = Math.max(u.blind, Q(dur)); if (dur > 0.6) { u.tgt = null; } hit.push([u.id, Math.round(dur * 10) / 10]); }
      }
      s.emit({ k: 'pop', t: 'fl', x: n.x, y: n.y, hit });
    } else if (n.t === 'he') {
      const hit = [];
      for (const u of s.units) {
        if (!u.alive) continue;
        const dx = n.x - u.x, dy = n.y - u.y, d = Math.sqrt(dx * dx + dy * dy); if (d >= HE_R) continue;
        if (!ray(n.x, n.y, u.x, u.y, opaque, false)) continue;
        let dmg = 98 * (1 - d / HE_R); if (u.armor) dmg *= 0.55; if (owner && u.seat === owner.seat) dmg *= 0.5;
        dmg = Math.floor(dmg); if (dmg <= 0) continue;
        hit.push([u.id, dmg]); damage(s, u, dmg, owner, false, 'he');
      }
      s.emit({ k: 'pop', t: 'he', x: n.x, y: n.y, hit });
    }
  }

  function damage(s, v, dmg, a, hs, cause) {
    if (!v.alive) return;
    const real = Math.min(v.hp, dmg);
    v.hp -= real;
    if (a && a.seat !== v.seat) { a.st.dmg += real; s.rst[a.id].dmg += real; }
    if (a && v.tgt == null && v.alertT <= 0) { v.alertT = 0.3; v.alertX = a.x; v.alertY = a.y; }
    if (v.hp <= 0) kill(s, v, a, hs, cause);
  }
  function kill(s, v, a, hs, cause) {
    v.alive = false; v.hp = 0; v.tgt = null; v.route = []; v.busy = null; v.st.d++;
    const enemy = a && a.seat !== v.seat;
    if (enemy) {
      a.st.k++; s.rst[a.id].k++;
      const rw = cause === 'gun' ? W[curW(a)].reward : 300;
      a.money = Math.min(MAX_MONEY, a.money + rw);
    }
    if (v.prim) { s.drops.push({ x: Q(v.x), y: Q(v.y), w: v.prim }); v.prim = null; }
    if (s.bomb && s.bomb.st === 'carry' && s.bomb.carrier === v.id) { s.bomb.st = 'drop'; s.bomb.x = Q(v.x); s.bomb.y = Q(v.y); s.bomb.carrier = null; s.emit({ k: 'bombdrop', x: s.bomb.x, y: s.bomb.y }); }
    s.emit({ k: 'kill', a: a ? a.id : null, b: v.id, w: cause === 'gun' && a ? curW(a) : cause, hs: !!hs });
  }

  function reactTime(s, u, e) {
    const R = ROLES[u.slot];
    let t = R.react;
    const dx = e.x - u.x, dy = e.y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const dot = (u.fx * dx + u.fy * dy) / d;
    if (dot > 0.94 && !u.moving) t -= 0.12;      // держал этот угол
    else if (dot < 0.5) t += 0.15;              // пришлось развернуться
    if (u.moving) t += 0.1;                     // на бегу надо остановиться и прицелиться
    t += s.rnd() * 0.12;
    return t < 0.12 ? 0.12 : t;
  }
  function shoot(s, u, e) {
    const w = W[curW(u)], R = ROLES[u.slot];
    const dx = e.x - u.x, dy = e.y - u.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
    let p = w.acc * R.aim;
    if (R.awp && w.cat === 'sniper') p = Math.min(0.97, p + 0.07);
    p *= (w.rng * w.rng) / (w.rng * w.rng + d2);
    if (w.close && d < 4) p *= R.awp ? (1 + w.close) / 2 : w.close;
    if (u.moving) { let mv = u.walk ? (1 + w.mv) / 2 : w.mv; if (R.mvKeep) mv = 1 - (1 - mv) * R.mvKeep; p *= mv; }
    p /= 1 + w.spray * u.burst;
    if (e.moving && !e.walk) p *= 0.92;
    const pre = u.burst === 0 && u.held >= 0.5 && !u.moving;   // прицел заранее стоял на углу
    if (pre) p = Math.min(0.97, p * 1.2);
    u.burst++; u.idle = 0;
    const hit = s.rnd() < p;
    let part = null, dmg = 0;
    if (hit) {
      const r = s.rnd(), hsP = R.hs * (curW(u) === 'ak' || curW(u) === 'deagle' ? 1.1 : 1) * (pre ? 1.4 : 1);
      let mult;
      if (r < hsP) { part = 'head'; mult = 4; } else if (r < hsP + 0.55) { part = 'body'; mult = 1; } else if (r < hsP + 0.72) { part = 'stomach'; mult = 1.25; } else { part = 'legs'; mult = 0.75; }
      dmg = w.dmg * mult;
      const armored = part === 'head' ? e.armor >= 2 : (part !== 'legs' && e.armor >= 1);
      if (armored) dmg *= w.pen;
      dmg = Math.floor(dmg);
    }
    s.emit({ k: 'shot', a: u.id, b: e.id, hit, part, dmg: Math.min(dmg, e.hp), w: curW(u) });
    if (u.burst === 1) hear(s, 'shot', u.x, u.y, u.seat, HEAR_SHOT);
    if (hit) damage(s, e, dmg, u, part === 'head', 'gun');
  }

  function busyAction(s, u) {
    if (u.route.length || u.delay > 0) return null;
    const b = s.bomb; if (!b) return null;
    if (u.act === 'plant' && b.st === 'carry' && b.carrier === u.id && zoneAt(u.x, u.y)) return 'plant';
    if (u.act === 'defuse' && b.st === 'plant') { const dx = b.x - u.x, dy = b.y - u.y; if (dx * dx + dy * dy <= 1.5 * 1.5) return 'defuse'; }
    return null;
  }
  function escapePoint(s, u) {
    let best = null, bd = 1e9;
    const cx = Math.floor(u.x), cy = Math.floor(u.y);
    for (let r = 1; r <= 5 && !best; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!walk(x, y)) continue;
      const px = x + 0.5, py = y + 0.5;
      if (s.fires.some(f => (f.x - px) * (f.x - px) + (f.y - py) * (f.y - py) < (f.r + 0.4) * (f.r + 0.4))) continue;
      const d = (px - u.x) * (px - u.x) + (py - u.y) * (py - u.y);
      if (d < bd && astar(cx, cy, x, y)) { bd = d; best = [px, py]; }
    }
    return best;
  }

  function tick(s) {
    s.tk++;
    s.time = Q(s.time + TICK);
    const planted = s.bomb && s.bomb.st === 'plant';
    if (!planted) s.clock = Q(s.clock - TICK);
    // 1) гранаты долетели
    if (s.flying.length) {
      const land = s.flying.filter(n => n.land <= s.time + 1e-9);
      s.flying = s.flying.filter(n => n.land > s.time + 1e-9);
      for (const n of land) landNade(s, n);
    }
    // 2) дым растёт и рассеивается, огонь горит
    s.smokes = s.smokes.filter(m => m.t1 > s.time);
    for (const m of s.smokes) { const k = (s.time - m.t0) / 0.8; m.r = Q(SMOKE_R * (k < 1 ? k : 1)); }
    s.fires = s.fires.filter(f => f.t1 > s.time);
    for (const f of s.fires) for (const u of s.units) {
      if (!u.alive) continue;
      const dx = u.x - f.x, dy = u.y - f.y;
      if (dx * dx + dy * dy < f.r * f.r) damage(s, u, 3, s.units[f.owner], false, 'mo');
    }
    // 3) состояние бойцов
    for (const u of s.units) {
      if (!u.alive) continue;
      if (u.blind > 0) u.blind = Q(Math.max(0, u.blind - TICK));
      if (u.alertT > 0) { u.alertT = Q(u.alertT - TICK); if (u.alertT <= 0 && u.tgt == null) faceTo(u, u.alertX, u.alertY); }
      if (u.delay > 0) { u.delay = Q(u.delay - TICK); if (u.delay <= 0 && u.nade && !u.nade.e) throwNade(s, u); }
      u.busy = busyAction(s, u);
    }
    // 4) кто кого видит
    const sees = computeVis(s);
    // 5) цели и стрельба
    for (const u of s.units) {
      if (!u.alive) continue;
      if (u.tgt != null) { const e = s.units[u.tgt]; if (!e.alive || !sees[u.id][e.id]) u.tgt = null; }
      if (u.busy || u.blind > 0.6) { u.tgt = null; }
      else if (u.tgt == null) {
        let best = null, bd = 1e9;
        for (const e of s.units) { if (!e.alive || e.seat === u.seat || !sees[u.id][e.id]) continue; const d = (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y); if (d < bd) { bd = d; best = e; } }
        if (best) { u.tgt = best.id; u.react = reactTime(s, u, best); }
      }
      if (u.tgt != null) {
        const e = s.units[u.tgt];
        faceTo(u, e.x, e.y);
        if (u.react > 0) u.react = Q(u.react - TICK);
        if (u.react <= 0) {
          u.cd = u.cd - TICK;
          for (let g = 0; g < 4 && u.cd <= 0 && e.alive && u.alive; g++) { shoot(s, u, e); u.cd += W[curW(u)].rof; }
        } else u.cd = Math.max(0, u.cd - TICK);
      } else {
        u.cd = Math.max(0, u.cd - TICK);
        u.idle += TICK; if (u.idle > 0.35) u.burst = 0;
      }
    }
    // 6) движение
    for (const u of s.units) {
      if (!u.alive) { u.moving = false; continue; }
      const wasMoving = u.moving; u.moving = false;
      u.held = wasMoving ? 0 : Q((u.held || 0) + TICK);
      // стоишь в огне — отходишь
      if (!u.route.length && !u.busy && s.fires.some(f => (u.x - f.x) * (u.x - f.x) + (u.y - f.y) * (u.y - f.y) < f.r * f.r)) {
        const ep = escapePoint(s, u); if (ep) { const r = routeFrom(u.x, u.y, [[Math.floor(ep[0]), Math.floor(ep[1])]]); if (r && r.length) u.route = r; }
      }
      let fight = false;
      if (u.tgt != null) { const e = s.units[u.tgt], r = W[curW(u)].rng * 1.15; fight = (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y) <= r * r; }
      if (u.delay > 0 || u.busy || fight || !u.route.length) {
        if (u.tgt == null && u.look && !u.busy) faceTo(u, u.look[0], u.look[1]);
        continue;
      }
      const R = ROLES[u.slot];
      let sp = (u.walk ? (R.quiet ? LURK_WALK : WALK) : RUN) * W[curW(u)].spd * (R.spd || 1);
      if (u.blind > 0) sp *= 0.5;
      let step = sp * TICK, mdx = 0, mdy = 0;
      while (step > 1e-9 && u.route.length) {
        const [tx, ty] = u.route[0], dx = tx - u.x, dy = ty - u.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= step) { u.x = tx; u.y = ty; u.route.shift(); step -= d; mdx += dx; mdy += dy; }
        else { u.x += dx / d * step; u.y += dy / d * step; mdx += dx / d * step; mdy += dy / d * step; step = 0; }
      }
      u.x = Q(u.x); u.y = Q(u.y);
      u.moving = true;
      if (u.tgt != null) faceTo(u, s.units[u.tgt].x, s.units[u.tgt].y);
      else if (u.look) faceTo(u, u.look[0], u.look[1]); else if (mdx || mdy) faceTo(u, u.x + mdx, u.y + mdy);
      if (!u.walk) {
        u.stepAcc += TICK;
        if (u.stepAcc >= 0.5 || !wasMoving) { u.stepAcc = 0; hear(s, 'step', u.x, u.y, u.seat, R.quiet ? HEAR_STEP * 0.5 : HEAR_STEP, { u: u.id }); }
      }
      if (!u.route.length && u.nade && u.nade.e) throwNade(s, u);
    }
    // 7) раздвигаем своих, чтобы не стояли в одной точке
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
      const a = s.units[i], b = s.units[j];
      if (!a.alive || !b.alive || a.seat !== b.seat) continue;
      let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 >= 0.36) continue;
      let d = Math.sqrt(d2); if (d < 1e-6) { dx = 1; dy = 0; d = 1; d2 = 0; }
      const push = (0.6 - Math.sqrt(d2)) * 0.25, ux = dx / d * push, uy = dy / d * push;
      if (!a.busy && walk(Math.floor(a.x - ux), Math.floor(a.y - uy))) { a.x = Q(a.x - ux); a.y = Q(a.y - uy); }
      if (!b.busy && walk(Math.floor(b.x + ux), Math.floor(b.y + uy))) { b.x = Q(b.x + ux); b.y = Q(b.y + uy); }
    }
    // 8) бомба: установка, разминирование, подбор
    const b = s.bomb;
    if (b) {
      if (b.st === 'carry') {
        const c = s.units[b.carrier];
        b.x = c.x; b.y = c.y;
        if (c.busy === 'plant') {
          if (c.plantT === 0) hear(s, 'plant', c.x, c.y, c.seat, HEAR_BOMB);
          c.plantT = Q(c.plantT + TICK);
          if (c.plantT >= PLANT_T - 1e-9) {
            b.st = 'plant'; b.x = Q(c.x); b.y = Q(c.y); b.site = zoneAt(c.x, c.y); b.t = BOMB_T; b.carrier = null; b.planter = c.id;
            c.act = null; c.busy = null; c.plantT = 0; c.money = Math.min(MAX_MONEY, c.money + 300);
            s.emit({ k: 'plant', u: c.id, site: b.site, x: b.x, y: b.y });
            for (let seat = 0; seat < 2; seat++) s.intel[seat].bomb = { x: b.x, y: b.y, site: b.site };
          }
        } else c.plantT = 0;
      } else if (b.st === 'drop') {
        for (const u of s.units) if (u.alive && sideOfU(s, u) === 'T' && (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) <= 0.81) { b.st = 'carry'; b.carrier = u.id; s.emit({ k: 'bombpick', u: u.id }); break; }
      } else if (b.st === 'plant') {
        b.t = Q(b.t - TICK);
        let defuser = null;
        for (const u of s.units) {
          if (!u.alive) continue;
          if (u.busy === 'defuse' && !defuser) {
            defuser = u;
            if (u.defT === 0) { hear(s, 'defuse', u.x, u.y, u.seat, HEAR_BOMB); s.emit({ k: 'defstart', u: u.id, kit: u.kit }); }
            u.defT = Q(u.defT + TICK);
            if (u.defT >= (u.kit ? DEF_KIT : DEF_T) - 1e-9) { b.st = 'done'; u.money = Math.min(MAX_MONEY, u.money + 300); s.emit({ k: 'defused', u: u.id }); return { w: u.seat, how: 'defuse' }; }
          } else u.defT = 0;
        }
        if (b.t <= 0) {
          b.st = 'boom';
          for (const u of s.units) { if (!u.alive) continue; const d2 = (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y); if (d2 < 8 * 8) { u.hp = 0; u.alive = false; u.st.d++; } }
          s.emit({ k: 'boom', x: b.x, y: b.y });
          return { w: tSeat(s), how: 'bomb' };
        }
      }
    }
    // 9) подбор оружия с убитых
    if (s.drops.length) for (const u of s.units) {
      if (!u.alive || u.tgt != null) continue;
      for (let i = 0; i < s.drops.length; i++) {
        const d = s.drops[i];
        if ((u.x - d.x) * (u.x - d.x) + (u.y - d.y) * (u.y - d.y) > 0.81) continue;
        if (W[d.w].price <= (u.prim ? W[u.prim].price : 0)) continue;
        const old = u.prim; u.prim = d.w;
        if (old) s.drops[i] = { x: d.x, y: d.y, w: old }; else s.drops.splice(i, 1);
        s.emit({ k: 'pick', u: u.id, w: d.w });
        break;
      }
    }
    // 10) разведка: что видит каждая команда
    for (let seat = 0; seat < 2; seat++) for (const e of s.units) {
      if (e.seat === seat || !e.alive || !(s.vis[seat] & (1 << e.id))) continue;
      s.intel[seat].seen[e.id] = { x: Q(e.x), y: Q(e.y), t: s.time, w: curW(e), hp: e.hp };
    }
    for (let seat = 0; seat < 2; seat++) for (const id in s.intel[seat].seen) if (!s.units[id].alive) delete s.intel[seat].seen[id];
    // 11) конец раунда?
    const ts = tSeat(s), cs = 1 - ts;
    const aliveT = teamOf(s, ts).filter(u => u.alive).length, aliveCT = teamOf(s, cs).filter(u => u.alive).length;
    const pl = s.bomb && s.bomb.st === 'plant';
    if (aliveCT === 0) return { w: ts, how: 'elim' };
    if (!pl && aliveT === 0) return { w: cs, how: 'elim' };
    if (!pl && s.clock <= 0) return { w: cs, how: 'time' };
    return null;
  }
  function faceTo(u, x, y) {
    const dx = x - u.x, dy = y - u.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.05) return;
    u.fx = Math.round(dx / d * 1000) / 1000; u.fy = Math.round(dy / d * 1000) / 1000;
  }
  function seesUnit(s, a, b, clear) {
    if (!clear || a.blind > 0.6) return false;
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 < AWARE * AWARE) return true;
    const d = Math.sqrt(d2);
    return (a.fx * dx + a.fy * dy) / d >= FOV_COS;
  }
  function computeVis(s) {
    const sees = s.units.map(() => new Array(10).fill(false));
    s.vis = [0, 0];
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
      const a = s.units[i], b = s.units[j];
      if (a.seat === b.seat || !a.alive || !b.alive) continue;
      const clear = los(s.smokes, a.x, a.y, b.x, b.y);
      if (!clear) continue;
      if (seesUnit(s, a, b, clear)) { sees[i][j] = true; s.vis[a.seat] |= 1 << j; }
      if (seesUnit(s, b, a, clear)) { sees[j][i] = true; s.vis[b.seat] |= 1 << i; }
    }
    return sees;
  }

  /* ---------------- конец раунда ---------------- */
  const HOW = { elim: 'всех убили', time: 'время вышло', bomb: 'бомба взорвалась', defuse: 'бомбу разминировали' };
  function endRound(s, w, how, ev) {
    const t = tSeat(s), l = 1 - w;
    const big = how === 'bomb' || how === 'defuse';
    const inc = [0, 0];
    inc[w] = big ? 3500 : 3250;
    inc[l] = 1400 + 500 * s.L[l];
    if (l === t && s.bomb && (s.bomb.st === 'plant' || s.bomb.st === 'done')) inc[l] += 800;
    s.L[l] = Math.min(4, s.L[l] + 1); s.L[w] = Math.max(0, s.L[w] - 1);
    for (const u of s.units) {
      u.money = Math.min(MAX_MONEY, u.money + inc[u.seat]);
      if (!u.alive) { const m = u.money; Object.assign(u, freshInv(s.sideOf[u.seat])); u.money = m; }
    }
    s.score[w]++;
    // MVP раунда: больше всех убийств, потом урон
    let mvp = null, bk = -1, bd = -1;
    for (const u of s.units) { if (u.seat !== w) continue; const r = s.rst[u.id]; if (r.k > bk || (r.k === bk && r.dmg > bd)) { bk = r.k; bd = r.dmg; mvp = u.id; } }
    const end = { k: 'end', w, how, howText: HOW[how], round: s.round, score: s.score.slice(), inc, tS: t, mvp, rst: s.rst.map(r => [r.k, r.dmg]), alive: s.units.map(u => u.alive) };
    ev.push(Object.assign(end, { i: s.tk - (s.tk0 || 0) }));
    s.history.push({ round: s.round, w, how, tS: t });
    s.last = end;
    if (s.score[w] >= s.win) { s.over = true; s.winner = w; s.step = 'over'; ev.push({ k: 'over', w }); return; }
    if (s.round === s.half) { setSides(s, 1 - t); resetEconomy(s, 800); s.phase = 2; end.swap = true; }
    else if (s.round === s.half * 2) { setSides(s, Math.floor(s.rnd() * 2)); resetEconomy(s, 10000); s.phase = 3; end.decider = true; }
    startRound(s);
  }

  /* ---------------- подсказки для интерфейса ---------------- */
  // Где окажется боец к концу хода, если ему никто не помешает.
  function preview(s, u, o) {
    let route = u.route, delay = 0, w = u.walk;
    if (o) { const r = orderRoute(s, u, o); if (r) route = r; delay = o.d | 0; w = !!o.w; }
    const R = ROLES[u.slot];
    const sp = (w ? (R.quiet ? LURK_WALK : WALK) : RUN) * W[curW(u)].spd * (R.spd || 1);
    let left = Math.max(0, TURN - delay) * sp, x = u.x, y = u.y, i = 0;
    while (i < route.length && left > 1e-9) {
      const [tx, ty] = route[i], d = Math.sqrt((tx - x) * (tx - x) + (ty - y) * (ty - y));
      if (d <= left) { left -= d; x = tx; y = ty; i++; }
      else { x += (tx - x) / d * left; y += (ty - y) / d * left; left = 0; }
    }
    const done = [[u.x, u.y]].concat(route.slice(0, i), [[x, y]]);
    const rest = [[x, y]].concat(route.slice(i));
    return { route, done, rest, end: [x, y], len: routeLen(u.x, u.y, route), speed: sp, turns: Math.ceil((routeLen(u.x, u.y, route) / sp + delay) / TURN) };
  }

  /* ---------------- бот ---------------- */
  // Знания о Dust 2 для бота: позиции CT, маршруты T, гранаты на выход.
  const BOT = {
    ct: {
      B: [[11, 3, 5, 13], [15, 3, 5, 11], [4, 9, 5, 15], [12, 8, 5, 13]],
      M: [[19, 8, 19, 26], [17, 6, 19, 13]],
      A: [[40, 13, 38, 30], [31, 10, 26, 15], [37, 8, 38, 24], [30, 4, 27, 12]]
    },
    route: {
      B: [[13, 33], [6, 30], [5, 22], [5, 17]],
      long: [[31, 35], [38, 33], [38, 30], [38, 20]],
      short: [[19, 31], [19, 23], [23, 21], [25, 18]],
      midB: [[19, 31], [19, 16], [14, 14], [12, 16], [10, 19], [6, 19]],
      mid: [[19, 31], [19, 22]]
    },
    stage: { B: [5, 16], long: [38, 19], short: [25, 17], midB: [6, 18], mid: [19, 22] },
    site: { B: 'B', long: 'A', short: 'A', midB: 'B' },
    entry: {
      B: [[6, 9], [9, 7], [4, 4], [11, 3], [8, 10]],
      long: [[38, 9], [36, 5], [32, 4], [40, 3], [31, 9]],
      short: [[31, 9], [33, 4], [37, 8], [38, 11], [30, 5]],
      midB: [[6, 9], [9, 7], [4, 4], [11, 3], [8, 10]]
    },
    plant: { A: [37, 7], B: [7, 8] },
    exec: {
      B: [['sm', 13, 8], ['fl', 7, 8], ['mo', 4, 4], ['sm', 14, 3], ['fl', 8, 6]],
      midB: [['sm', 13, 8], ['fl', 7, 8], ['mo', 4, 4], ['fl', 9, 7], ['he', 6, 9]],
      long: [['sm', 35, 7], ['fl', 38, 11], ['mo', 43, 15], ['fl', 37, 9], ['he', 39, 11]],
      short: [['sm', 31, 5], ['fl', 31, 9], ['mo', 30, 4], ['fl', 33, 8], ['he', 31, 10]]
    },
    post: {
      A: [[38, 10, 29, 5], [40, 3, 29, 5], [32, 11, 29, 4], [38, 15, 34, 7], [34, 3, 28, 11]],
      B: [[4, 10, 13, 8], [6, 4, 13, 8], [12, 10, 13, 4], [5, 14, 10, 6], [3, 7, 13, 8]]
    },
    retake: { A: [[27, 5], [25, 15], [28, 3]], B: [[16, 7], [15, 3], [16, 8]] },
    // «Все на A / B»: пять позиций на точке
    ct5: {
      A: [[40, 13, 38, 30], [31, 10, 26, 15], [37, 8, 38, 24], [30, 4, 27, 12], [34, 11, 38, 24]],
      B: [[11, 3, 5, 13], [15, 3, 5, 11], [4, 9, 5, 15], [12, 8, 5, 13], [8, 10, 5, 14]]
    },
    // сейв: где прятаться
    saveT: [[13, 43], [29, 43], [13, 35], [23, 44], [17, 44]],
    saveCT: { A: [[16, 6], [22, 1], [14, 3], [19, 8], [17, 2]], B: [[28, 1], [26, 8], [24, 1], [28, 4], [22, 6]], none: [[28, 1], [22, 1], [26, 8], [17, 3], [24, 1]] }
  };
  // Тактики и команды, из которых выбирает игрок (и бот).
  const TAC = {
    T: [
      { id: 'default', name: 'Дефолт', desc: 'Расходятся по карте, на 4-м ходу заходят туда, где видели меньше CT.' },
      { id: 'B', name: 'Раш B', desc: 'Четверо через туннели на B, люркер через мид.' },
      { id: 'midB', name: 'Мид → B', desc: 'Трое через мид и нижние, двое туннелями. Сходятся на B.' },
      { id: 'long', name: 'Лонг A', desc: 'Четверо через лонг на A, авапер через мид и шорт.' },
      { id: 'short', name: 'Шорт A', desc: 'Четверо через кэтвок и шорт, авапер давит лонг.' },
      { id: 'split', name: 'Сплит A', desc: 'Двое с лонга, трое через шорт. Заходят на A с двух сторон.' }
    ],
    CT: [
      { id: 'std', name: '2-1-2', desc: 'Двое на B, авапер на миду, двое на A.', setup: ['B', 'A', 'B', 'M', 'A'] },
      { id: 'awpA', name: 'AWP на A', desc: 'Двое на B, рифлер на миду, авапер с энтри на A.', setup: ['B', 'A', 'M', 'A', 'B'] },
      { id: 'stackA', name: 'Стек A', desc: 'Трое на A, авапер на миду, один на B.', setup: ['A', 'B', 'A', 'M', 'A'] },
      { id: 'stackB', name: 'Стек B', desc: 'Трое на B, авапер на миду, один на A.', setup: ['B', 'B', 'A', 'M', 'B'] }
    ]
  };
  const CALLS = {
    T: [
      { id: 'auto', ic: '🤖', name: 'Сами', desc: 'Заходят на точку, когда соберутся на подходе (или с 7-го хода).' },
      { id: 'wait', ic: '⏸', name: 'Ждём', desc: 'Стоят на подходе и держат углы, пока не скажешь «Заходим».' },
      { id: 'go', ic: '▶', name: 'Заходим', desc: 'Выход прямо сейчас: гранаты, энтри первым, бомбу несут ставить.' },
      { id: 'save', ic: '🏳', name: 'Сейв', desc: 'Отходят к своему спавну и прячутся, чтобы сохранить оружие.' }
    ],
    CT: [
      { id: 'auto', ic: '🤖', name: 'Сами', desc: 'Держат позиции. Услышат троих на одной точке — мид и ещё один идут помогать.' },
      { id: 'hold', ic: '🛡', name: 'Стоим', desc: 'Никто не уходит со своей позиции, что бы ни услышали.' },
      { id: 'A', ic: '➜', name: 'Все на A', desc: 'Вся команда бежит на A.' },
      { id: 'B', ic: '➜', name: 'Все на B', desc: 'Вся команда бежит на B.' },
      { id: 'save', ic: '🏳', name: 'Сейв', desc: 'Прячутся у своего спавна, чтобы сохранить оружие.' }
    ],
    TP: [
      { id: 'auto', ic: '🤖', name: 'Держим бомбу', desc: 'Встают вокруг бомбы и держат углы, откуда придут CT.' },
      { id: 'save', ic: '🏳', name: 'Сейв', desc: 'Уходят подальше от бомбы и прячутся.' }
    ],
    CTP: [
      { id: 'auto', ic: '🤖', name: 'Ретейк', desc: 'Собираются у точки по двое и заходят вместе, ближний разминирует.' },
      { id: 'go', ic: '⚡', name: 'Сразу', desc: 'Все бегут к бомбе без ожидания, ближний сразу разминирует.' },
      { id: 'save', ic: '🏳', name: 'Сейв', desc: 'Не идут к бомбе, прячутся подальше от взрыва.' }
    ]
  };
  // Какие команды доступны стороне сейчас.
  function callsFor(s, seat) {
    const side = s.sideOf[seat], pl = s.bomb && s.bomb.st === 'plant';
    return side === 'T' ? (pl ? CALLS.TP : CALLS.T) : (pl ? CALLS.CTP : CALLS.CT);
  }
  const near = (u, p, r) => (u.x - p[0] - 0.5) * (u.x - p[0] - 0.5) + (u.y - p[1] - 0.5) * (u.y - p[1] - 0.5) <= r * r;
  const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
  const endNear = (u, p, r) => { if (!u.route.length) return false; const l = u.route[u.route.length - 1]; return (l[0] - p[0] - 0.5) * (l[0] - p[0] - 0.5) + (l[1] - p[1] - 0.5) * (l[1] - p[1] - 0.5) <= (r || 1.5) * (r || 1.5); };
  // Автопилот: приказы бойцам стороны seat по плану { tac, call, mask, fresh }.
  //   tac — тактика (TAC), call — команда (CALLS), mask[i] — боец под автопилотом, fresh[i] — перестроить маршрут заново.
  // Возвращает 5 приказов (null — не трогать). Видит только то, что знает своя команда (intel).
  function auto(s, seat, plan, rnd) {
    rnd = rnd || Math.random; plan = plan || {};
    const out = [null, null, null, null, null];
    if (s.over) return out;
    const o = s.sideOf[seat] === 'T' ? botT(s, seat, rnd, plan) : botCT(s, seat, rnd, plan);
    for (let i = 0; i < 5; i++) {
      const u = s.units[seat * 5 + i];
      if (plan.mask && !plan.mask[i]) continue;
      if (o[i] && !validOrder(s, u, o[i])) { delete o[i].n; if (!validOrder(s, u, o[i])) o[i] = null; }
      out[i] = o[i];
    }
    return out;
  }
  function bot(s, seat, rnd) {
    rnd = rnd || Math.random;
    if (s.over) return null;
    if (s.step === 'buy') return botBuy(s, seat, rnd);
    return { o: auto(s, seat, {}, rnd) };
  }
  function botBuy(s, seat, rnd) {
    const side = s.sideOf[seat], b = [];
    const team = teamOf(s, seat);
    const pistol = s.round === 1 || s.round === s.half + 1;
    const avg = team.reduce((a, u) => a + u.money, 0) / 5;
    const force = !pistol && avg < 3700 && (s.score[1 - seat] >= s.win - 1 || s.round === s.half || s.L[seat] >= 3 || rnd() < 0.2);
    for (const u of team) {
      const items = []; let m = u.money;
      const add = id => { const r = priceItems(s, u, items.concat([id])); if (!r.err) { items.push(id); m = u.money - r.cost; return true; } return false; };
      const nades = order => { for (const n of order) add(n); };
      const util = side === 'T' ? ['sm', 'fl', 'mo', 'fl', 'he'] : ['sm', 'fl', 'mo', 'he', 'fl'];
      if (pistol) {
        if (u.slot === 0) { add('kev'); }
        else if (u.slot === 2) { add(side === 'T' ? 'tec9' : 'five'); add('fl'); }
        else if (u.slot === 3) { add('p250'); add('fl'); add('sm'); }
        else { add('kev'); add('fl'); }
        b.push(items); continue;
      }
      const has = u.prim && W[u.prim].cat !== 'pistol';
      if (has || m >= (side === 'T' ? 3700 : 3900) || (force && m >= 2000)) {
        if (!has) {
          if (u.slot === 3 && m >= 5800) add('awp');
          else if (m >= (side === 'T' ? 3700 : 3900)) add(side === 'T' ? 'ak' : (rnd() < 0.5 ? 'm4a1' : 'm4a4'));
          else if (m >= 2800) add(side === 'T' ? 'galil' : 'famas');
          else add(side === 'T' ? 'mac10' : 'mp9');
        }
        if (!add('helm')) add('kev');
        if (side === 'CT' && (u.slot === 0 || u.slot === 1 || rnd() < 0.5)) add('kit');
        nades(util);
      } else if (m >= 1200 && rnd() < 0.4) { add(rnd() < 0.5 ? 'deagle' : 'p250'); }
      b.push(items);
    }
    // бомбу несёт не авапер и не энтри
    return { b, bomb: [4, 0, 2, 1, 3].find(i => team[i].alive) };
  }
  function strategyT(s, seat) {
    const h = hashStr(s.seed + ':strat:' + s.round + ':' + seat) % 100;
    return h < 22 ? 'B' : h < 40 ? 'long' : h < 58 ? 'split' : h < 74 ? 'midB' : h < 86 ? 'short' : 'default';
  }
  // Кто из пятерых по какому маршруту идёт при стратегии.
  function planT(strat) {
    switch (strat) {
      case 'B': return ['B', 'B', 'B', 'B', 'midB'];
      case 'long': return ['long', 'long', 'long', 'mid', 'long'];
      case 'split': return ['long', 'long', 'short', 'mid', 'short'];
      case 'midB': return ['midB', 'midB', 'B', 'midB', 'B'];
      case 'short': return ['short', 'short', 'short', 'long', 'short'];
      default: return ['long', 'B', 'short', 'mid', 'B'];
    }
  }
  // Встроиться в маршрут с ближайшей точки (если боец уже в пути, не возвращаться на старт).
  function joinRoute(u, wps) {
    if (wps.length < 2) return wps.map(p => [p[0], p[1]]);
    let j = 0, bd = 1e9;
    for (let k = 0; k < wps.length; k++) { const d = dist(u.x, u.y, wps[k][0] + 0.5, wps[k][1] + 0.5); if (d < bd) { bd = d; j = k; } }
    if (j + 1 < wps.length && dist(u.x, u.y, wps[j + 1][0] + 0.5, wps[j + 1][1] + 0.5) < dist(wps[j][0], wps[j][1], wps[j + 1][0], wps[j + 1][1])) j++;
    return wps.slice(j).map(p => [p[0], p[1]]);
  }
  const TAC_T = TAC.T.map(t => t.id);
  function botT(s, seat, rnd, plan) {
    const team = teamOf(s, seat), orders = [null, null, null, null, null];
    const mask = plan.mask || [1, 1, 1, 1, 1], fresh = plan.fresh || [];
    const b = s.bomb, intel = s.intel[seat], call = plan.call || 'auto';
    const planted = !!(b && b.st === 'plant');
    const group = team.filter(u => u.alive && mask[u.slot]);
    if (!group.length) return orders;
    // сейв: к своему спавну
    if (call === 'save') {
      for (const u of group) {
        const P = BOT.saveT[u.slot];
        if (near(u, P, 1.2)) { if (fresh[u.slot] || u.route.length) orders[u.slot] = { p: [], a: null }; continue; }
        if (fresh[u.slot] || !endNear(u, P, 1)) orders[u.slot] = { p: [[P[0], P[1]]], l: 0, w: 0, a: null };
      }
      return orders;
    }
    const strat = TAC_T.includes(plan.tac) ? plan.tac : strategyT(s, seat);
    let pl = planT(strat), site;
    if (strat === 'default') {
      // «дефолт»: на 4-м ходу (или по команде «Заходим») выбираем точку, где меньше видели CT, и больше не меняем
      if (intel.tsite) site = intel.tsite;
      else if (s.turn >= 3 || call === 'go' || planted) {
        const seen = Object.values(intel.seen).filter(x => s.time - x.t < 12);
        const atA = seen.filter(x => x.x >= 27).length, atB = seen.filter(x => x.x < 16).length;
        site = atA <= atB ? 'A' : 'B';
        if (s.step === 'turn') intel.tsite = site;
      } else site = null;
      if (site) pl = site === 'A' ? ['long', 'long', 'short', 'short', 'long'] : ['B', 'B', 'midB', 'midB', 'B'];
    } else site = BOT.site[pl[0]] || 'A';
    const routeOf = i => pl[i] === 'mid' ? (site === 'B' ? 'midB' : 'short') : pl[i];
    // когда выходить: вся группа у подхода, время поджимает или команда «Заходим»
    const atStage = group.filter(u => near(u, BOT.stage[routeOf(u.slot)], 4)).length;
    let exec = !!site && (atStage >= Math.ceil(group.length * 0.6) || s.turn >= 6 || s.clock <= 25);
    if (call === 'wait') exec = false;
    if (call === 'go') exec = !!site;
    const anyEnemyRecent = Object.values(intel.seen).some(x => s.time - x.t < 1.5);
    for (const u of group) {
      const i = u.slot;
      const rk = routeOf(i);
      if (planted) {
        const P = BOT.post[b.site][i % 5];
        if (!near(u, P, 1.2)) { if (fresh[i] || !endNear(u, P, 1)) orders[i] = { p: [[P[0], P[1]]], l: [P[2] + 0.5, P[3] + 0.5], w: 0 }; }
        else if (!u.look || fresh[i]) orders[i] = { p: [], l: [P[2] + 0.5, P[3] + 0.5] };
        continue;
      }
      if (b && b.st === 'drop') {
        const closest = group.slice().sort((p, q) => dist(p.x, p.y, b.x, b.y) - dist(q.x, q.y, b.x, b.y))[0];
        if (closest === u) { orders[i] = { p: [[Math.floor(b.x), Math.floor(b.y)]], l: 0 }; continue; }
      }
      const carrier = b && b.st === 'carry' && b.carrier === u.id;
      if (!exec) {
        const st = BOT.stage[rk];
        if (near(u, st, 2.5)) { if (fresh[i] || (!u.route.length && !u.look)) orders[i] = { p: [], l: lookFromStage(rk), a: null }; continue; }
        if (!u.route.length || s.turn === 0 || fresh[i] || !endNear(u, st)) {
          orders[i] = { p: joinRoute(u, BOT.route[rk].concat([st])), l: 0, w: rk === 'mid' || (i === 4 && rnd() < 0.5) ? 1 : 0 };
          if (fresh[i]) orders[i].a = null;
        }
        continue;
      }
      // выход на точку
      const S = site || 'A';
      if (carrier) {
        const P = BOT.plant[S];
        const onSite = zoneAt(u.x, u.y) === S;
        const o = { p: [[P[0] + (i % 2), P[1]]], a: 'plant', l: 0, w: 0 };
        if (!onSite && atStage > 1) o.d = 1;
        if (fresh[i] || !(u.act === 'plant' && u.route.length && endNear(u, [P[0] + (i % 2), P[1]], 1))) orders[i] = o;
        continue;
      }
      const ek = rk === 'mid' ? (S === 'B' ? 'midB' : 'short') : rk;
      const ex = BOT.exec[ek], en = BOT.entry[ek];
      const E = en[i % en.length];
      const o = { p: [[E[0], E[1]]], l: 0, w: 0 };
      if (ex && near(u, BOT.stage[rk] || [u.x, u.y], 4.5)) {
        const nd = ex[i % ex.length];
        if (u.nades[nd[0]] > 0 && dist(u.x, u.y, nd[1] + 0.5, nd[2] + 0.5) <= NADES[nd[0]].rng) { o.n = { t: nd[0], x: nd[1] + 0.5, y: nd[2] + 0.5, e: 0 }; }
        else if (u.nades.fl > 0 && dist(u.x, u.y, E[0] + 0.5, E[1] + 0.5) <= NADES.fl.rng && !anyEnemyRecent) o.n = { t: 'fl', x: E[0] + 0.5, y: E[1] + 0.5, e: 0 };
        if (o.n) o.d = i === 0 || i === 3 ? 0 : 1;
      }
      const endOk = endNear(u, E, 0.8);
      if (!endOk || o.n || fresh[i]) orders[i] = o;
    }
    return orders;
  }
  function lookFromStage(rk) { return { B: [5.5, 11], long: [38.5, 12], short: [27, 12], midB: [5.5, 12], mid: [19.5, 12] }[rk] || 0; }
  function botCT(s, seat, rnd, plan) {
    const team = teamOf(s, seat), orders = [null, null, null, null, null];
    const mask = plan.mask || [1, 1, 1, 1, 1], fresh = plan.fresh || [];
    const b = s.bomb, intel = s.intel[seat], call = plan.call || 'auto';
    const group = team.filter(u => u.alive && mask[u.slot]);
    if (!group.length) return orders;
    const planted = !!(b && b.st === 'plant');
    // сейв: подальше от бомбы
    if (call === 'save') {
      const L = BOT.saveCT[planted ? b.site : 'none'];
      group.forEach((u, k) => {
        const P = L[k % L.length];
        if (near(u, P, 1.2)) { if (fresh[u.slot] || u.route.length) orders[u.slot] = { p: [], a: null }; return; }
        if (fresh[u.slot] || !endNear(u, P, 1)) orders[u.slot] = { p: [[P[0], P[1]]], l: 0, w: 0, a: null };
      });
      return orders;
    }
    const T = TAC.CT.find(t => t.id === plan.tac);
    const h = hashStr(s.seed + ':ct:' + s.round + ':' + seat) % 100;
    // расстановка: кто где стоит по умолчанию
    const setup = T ? T.setup : h < 50 ? ['B', 'A', 'B', 'M', 'A'] : h < 70 ? ['A', 'B', 'A', 'M', 'A'] : h < 88 ? ['B', 'B', 'A', 'M', 'B'] : ['B', 'A', 'M', 'A', 'B'];
    const slotSpot = (site, i) => { const L = BOT.ct[site]; let k = 0; for (let j = 0; j < i; j++) if (setup[j] === site) k++; return L[k % L.length]; };
    // угроза: кого видели/слышали за последние 6 с
    const recent = Object.values(intel.seen).filter(x => s.time - x.t < 6).concat(intel.heard.filter(x => s.time - x.t < 5 && x.kind === 'step'));
    const inB = p => p.x < 14 && p.y > 2;
    const inA = p => p.x >= 26 && p.y > 1 && !(p.x < 30 && p.y > 24);
    const thB = recent.filter(inB).length, thA = recent.filter(inA).length;
    let rot = null;
    if (call === 'auto') { if (thB >= 3 && thB > thA * 2) rot = 'B'; else if (thA >= 3 && thA > thB * 2) rot = 'A'; }
    if (planted) {
      // ретейк
      const site = b.site, R = BOT.retake[site];
      const ready = group.filter((u, k) => near(u, R[k % R.length], 3.5)).length;
      const seenT = Object.values(intel.seen).filter(x => s.time - x.t < 2 && dist(x.x, x.y, b.x, b.y) < 9).length;
      const go = call === 'go' || ready >= Math.min(2, group.length) || b.t <= 12 || group.length === 1;
      const closest = group.slice().sort((p, q) => dist(p.x, p.y, b.x, b.y) - dist(q.x, q.y, b.x, b.y))[0];
      const need = closest ? (closest.kit ? DEF_KIT : DEF_T) : DEF_T;
      group.forEach((u, k) => {
        const i = u.slot;
        if (!go) { const P = R[k % R.length]; if (!near(u, P, 1.5) && (fresh[i] || !endNear(u, P, 1))) orders[i] = { p: [[P[0], P[1]]], l: [b.x, b.y], w: 0, a: null }; return; }
        const deadT = teamOf(s, 1 - seat).every(x => !x.alive);
        const tight = b.t - dist(u.x, u.y, b.x, b.y) / RUN <= need + 1.5;
        if (u === closest && (seenT === 0 || deadT || tight || call === 'go')) {
          if (u.act !== 'defuse' || fresh[i]) orders[i] = { p: [[Math.floor(b.x), Math.floor(b.y)]], a: 'defuse', l: 0, w: 0 };
          return;
        }
        const P = BOT.post[site][(k + 2) % 5];
        const o = { p: [[P[0], P[1]]], l: [b.x, b.y], w: 0, a: null };
        if (u.nades.sm > 0 && dist(u.x, u.y, b.x, b.y) <= NADES.sm.rng && rnd() < 0.6) o.n = { t: 'sm', x: Q(b.x + 1.5), y: Q(b.y), e: 0 };
        else if (u.nades.fl > 0 && dist(u.x, u.y, b.x, b.y) <= NADES.fl.rng) o.n = { t: 'fl', x: b.x, y: b.y, e: 0 };
        if (o.n && !walk(Math.floor(o.n.x), Math.floor(o.n.y))) { o.n.x = b.x; o.n.y = b.y; }
        if (!u.route.length || o.n || fresh[i]) orders[i] = o;
      });
      return orders;
    }
    const all = call === 'A' || call === 'B' ? call : null;
    group.forEach((u, k) => {
      const i = u.slot;
      let site = setup[i], P;
      if (all) { site = all; P = BOT.ct5[all][k % 5]; }
      else {
        if (rot && (site === 'M' || (site !== rot && i === [0, 1, 2, 3, 4].filter(j => setup[j] !== rot && setup[j] !== 'M').pop()))) site = rot;
        P = site === setup[i] ? slotSpot(site, i) : BOT.ct[site][(i + 1) % BOT.ct[site].length];
      }
      const o = {};
      if (!near(u, P, 1.0)) { if (fresh[i] || !u.route.length || !endNear(u, P, 0.8)) { o.p = [[P[0], P[1]]]; o.l = [P[2] + 0.5, P[3] + 0.5]; if (fresh[i]) { o.w = 0; o.a = null; } } }
      else if (!u.look || fresh[i]) { o.p = []; o.l = [P[2] + 0.5, P[3] + 0.5]; }
      // гранаты по услышанным T
      const target = recent.filter(x => site === 'B' ? inB(x) : site === 'A' ? inA(x) : true).sort((p, q) => dist(p.x, p.y, u.x, u.y) - dist(q.x, q.y, u.x, u.y))[0];
      if (target && near(u, P, 2)) {
        const d = dist(u.x, u.y, target.x, target.y), tx = Math.floor(target.x), ty = Math.floor(target.y);
        if (walk(tx, ty) && d > 4) {
          if (u.nades.mo > 0 && d <= NADES.mo.rng) o.n = { t: 'mo', x: tx + 0.5, y: ty + 0.5, e: 0 };
          else if (u.nades.he > 0 && d <= NADES.he.rng) o.n = { t: 'he', x: tx + 0.5, y: ty + 0.5, e: 0 };
          else if (u.nades.fl > 0 && d <= NADES.fl.rng && rnd() < 0.3) o.n = { t: 'fl', x: tx + 0.5, y: ty + 0.5, e: 0 };
        }
      }
      if (Object.keys(o).length) orders[i] = o;
    });
    return orders;
  }

  /* ---------------- реплей ---------------- */
  function replay(seed, opts, steps) {
    const s = create(seed, opts);
    for (const p of steps) {
      const pd = pending(s); if (pd.kind === 'over') break;
      if (!valid(s, 0, p[0]) || !valid(s, 1, p[1])) return { s, bad: true };
      apply(s, p, { film: false });
    }
    return { s, bad: false };
  }

  const api = {
    VERSION, TICK, TURN, TPT, ROUND_T, BOMB_T, PLANT_T, DEF_T, DEF_KIT, RUN, WALK, FOV_COS, AWARE, SMOKE_R, FIRE_R, HE_R,
    MAP, GW, GH, W, PISTOLS, DEFAULT_PISTOL, NADES, NADE_KEYS, ROLES, NAMES, GEAR, BOT,
    cell, walk, opaque, zoneAt, los, ray, astar, routeFrom, routeLen,
    create, pending, valid, validOrder, apply, priceItems, itemPrice, preview, bot, auto, callsFor, replay, TAC, CALLS,
    tSeat, ctSeat, teamOf, curW, nadeName, nadePrice, nadeCap, nadeCount, hashStr, mulberry
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.K5 = api;
})(typeof window !== 'undefined' ? window : globalThis);
