// Логика «Ограбления»: генератор уровней из кода комнаты, правила обнаружения, решатели и симуляция дела.
// Генератор, дверь, сейф, щиток и правила охраны перенесены из 2D-версии (heist/index.html) без изменений.
// Изменено для 3D: ориентиры берутся из набора темы и висят только на стенах комнат,
// повороты бесплатные, время идёт тактами (живой режим) или шагами (режим «Вором вслепую»).
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const VR = 2, CAM_R = 3;
export const LM = [['🖼️', 'картина'], ['🪴', 'фикус'], ['🗿', 'статуя'], ['📚', 'книги'], ['🏺', 'ваза'], ['🕰️', 'часы'], ['🎷', 'саксофон'], ['🧸', 'мишка'], ['🪞', 'зеркало'], ['🎸', 'гитара'], ['🐠', 'аквариум'], ['🦁', 'лев'], ['🛡️', 'щит'], ['🎻', 'скрипка'], ['🌵', 'кактус'], ['⚓', 'якорь'],
  ['🐟', 'рыбка'], ['🎺', 'труба'], ['🌲', 'ёлка'], ['🗽', 'статуя свободы'], ['🦚', 'павлин'], ['🏆', 'кубок'], ['🎹', 'пианино'], ['🦉', 'сова'], ['🌻', 'подсолнух'], ['🎭', 'маски'], ['🕯️', 'свеча'], ['📺', 'телевизор'], ['☎️', 'телефон'], ['🧯', 'огнетушитель'], ['🦖', 'динозавр'], ['🚲', 'велосипед'], ['🎯', 'мишень'], ['🦜', 'попугай'], ['🍷', 'вино']];
const PLACES = ['Ювелирка', 'Галерея', 'Казино', 'Музей', 'Банк', 'Особняк', 'Аукцион', 'Обсерватория', 'Казначейство', 'Пентхаус', 'Хранилище', 'Дворец', 'Яхт-клуб', 'Библиотека', 'Посольство', 'Ломбард', 'Ипподром', 'Театр'];
function hashStr(s) { let h = 2166136261 | 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
function RNG(s) { let h = hashStr(s); return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), h | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const isRotate = L => true;
const GLYPHS = ['Ѯ', 'Ѧ', 'ƛ', 'Ѭ', 'Ѫ', 'Ҩ', 'Ѿ', 'Ҋ', 'Ѣ', 'Ӭ', 'Ҿ', 'Ѩ', 'Ҕ', 'Ӄ', 'Ҁ', 'Ҵ', 'Ӡ', 'Ѻ', 'ξ', 'Ԅ', 'Ԉ', 'Ԏ', 'Ҹ', 'Ӿ'];
function safeFor(seed, L, att) {
  const r = RNG(seed + '$' + L + '$' + att);
  const lamp = L >= 5 && r() < 0.5 ? 'red' : 'green', maxStrikes = L >= 5 ? 2 : 3;
  for (let tr = 0; tr < 120; tr++) {
    const cols = [];
    for (let c = 0; c < 5; c++) { const pool = GLYPHS.slice(); const col = []; for (let k = 0; k < 6; k++) col.push(pool.splice(Math.floor(r() * pool.length), 1)[0]); cols.push(col); }
    const tc = Math.floor(r() * 5), idx = [0, 1, 2, 3, 4, 5]; for (let i = 5; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const pick = idx.slice(0, 4).sort((a, b) => a - b).map(i => cols[tc][i]);
    const rest = GLYPHS.filter(g => !cols[tc].includes(g)), decoys = [];
    while (decoys.length < 2) { const g = rest[Math.floor(r() * rest.length)]; if (!decoys.includes(g)) decoys.push(g); }
    const shown = pick.concat(decoys);
    if (cols.some((col, c) => c !== tc && shown.filter(g => col.includes(g)).length >= 4)) continue;
    for (let i = 5; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shown[i], shown[j]] = [shown[j], shown[i]]; }
    const seq = lamp === 'red' ? pick.slice().reverse() : pick;
    return { cols, tc, shown, lamp, maxStrikes, order: seq.map(g => shown.indexOf(g)) };
  }
  return null;
}
const DCOL = [['🔴', 'красная', '#FF4B4B'], ['🔵', 'синяя', '#4B8BFF'], ['🟢', 'зелёная', '#39D98A'], ['🟡', 'жёлтая', '#FFD23F']];
const SHAPES = [['★', 'звезда'], ['●', 'круг'], ['▲', 'треугольник']];
const ARW = ['↑', '→', '↓', '←'], ARWN = ['север', 'восток', 'юг', 'запад'], REL = ['вперёд', 'вправо', 'назад', 'влево'], RELA = ['⬆', '➡', '⬇', '⬅'];
const WCOL = [['красный', '#FF4B4B'], ['синий', '#3D7BFF'], ['жёлтый', '#FFD23F'], ['белый', '#F4F4F4'], ['чёрный', '#262626']];
function doorTypeOf(seed, L) { if (L < 5) return 'digits'; if (L === 5) return 'colors'; if (L === 6) return 'arrows'; return ['digits', 'colors', 'arrows'][(hashStr(seed + '#dt' + L) >>> 0) % 3]; }
// door code: one half of the information is with the thief, the other half in the navigator's documents
function doorFor(seed, L, att) {
  const r = RNG(seed + '%' + L + '%' + att), type = doorTypeOf(seed, L);
  if (type === 'colors') {
    const lamps = [0, 1, 2, 3].map(() => Math.floor(r() * 4)), shape = Math.floor(r() * 3);
    const table = [0, 1, 2].map(() => { const p = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; });
    return { type, lamps, shape, table, code: lamps.map(c => table[shape][c]).join(''), len: 4 };
  }
  if (type === 'arrows') {
    const schemes = [0, 1].map(() => [0, 1, 2, 3].map(() => Math.floor(r() * 4))), which = Math.floor(r() * 2);
    return { type, schemes, which, code: schemes[which].join(''), len: 4 };
  }
  let serial = ''; for (let i = 0; i < 6; i++) serial += Math.floor(r() * 10);
  const pos = []; while (pos.length < 3) { const k = Math.floor(r() * 6); if (!pos.includes(k)) pos.push(k); }
  return { type: 'digits', serial, pos, code: pos.map(k => serial[k]).join(''), len: 3 };
}
// laser barrier panel: the thief sees the wires, the navigator has the rules and the panel number
function wireRule(w, digit) {
  const n = w.length, cnt = c => w.filter(x => x === c).length, last = n - 1, even = digit % 2 === 0;
  const R = 0, B = 1, Y = 2, Wh = 3, K = 4;
  if (n === 3) { if (w[0] === w[1] || w[1] === w[2]) return 2; if (w[0] === B) return 1; return 0; }
  if (n === 4) { if (!cnt(Y)) return last; if (cnt(Wh) === 1 && even) return 0; if (cnt(R) > cnt(B)) return w.lastIndexOf(R); return 2; }
  if (n === 5) { if (w[0] === w[last]) return 2; if (cnt(K) > 1) return w.indexOf(K); if (!even) return last; return 1; }
  if (!cnt(Wh)) return 4; if (cnt(B) === 2) return w.lastIndexOf(B); if (even) return 0; return 3;
}
function panelFor(seed, L, att) {
  const r = RNG(seed + '&' + L + '&' + att);
  const rounds = L >= 20 ? 3 : L >= 12 ? 2 : 1, n = (rounds === 3 ? 5 : rounds === 2 ? 4 : 3) + Math.floor(r() * (rounds === 3 ? 2 : 3)), wires = Array.from({ length: n }, () => Math.floor(r() * 5));
  const digit = Math.floor(r() * 10), num = 'ЩТ-' + (10 + Math.floor(r() * 90)) + digit;
  const cuts = [], left = [wires.slice()];
  for (let k = 0; k < rounds; k++) { const w = left[k], c = wireRule(w, digit); cuts.push(c); left.push(w.filter((_, i) => i !== c)); }
  return { wires, digit, num, cuts, left, cut: cuts[0], rounds, maxStrikes: L >= 14 ? 1 : 2 };
}
function diff(L) {
  return {
    cw: L < 1 ? 3 : L < 4 ? 4 : L < 10 ? 5 : L < 14 ? 6 : 7, ch: L < 1 ? 5 : L < 4 ? 6 : L < 10 ? 7 : L < 14 ? 8 : 9,
    lasers: L === 0 ? 2 : L < 3 ? 3 : L < 10 ? 4 : 6,
    blink: L === 0 ? 0 : L < 3 ? 2 : L < 10 ? Math.min(4, 2 + Math.floor(L / 4)) : 5,
    lock: L >= 2, safe: L >= 3, gate: L >= 8, hide: L >= 12, dupes: L >= 2, flicker: L >= 6, vr: L >= 6 ? 3 : 2, camr: L >= 6 ? 4 : 3, vis: L >= 8 ? 1.6 : 2.45, timer: L >= 1,
    guards: L < 3 ? 0 : L < 5 ? 1 : L < 9 ? 2 : L < 14 ? 3 : 4,
    cams: L < 4 ? 0 : L < 8 ? 1 : L < 14 ? 2 : 3,
    stains: L < 7 ? 0 : L < 12 ? 1 : 2,
    pings: L < 3 ? 2 : L < 10 ? 1 : L < 12 ? 0 : 1,
    rotate: isRotate(L)
  };
}

/* ---------- темы интерьера: у каждой свой набор ориентиров (индексы в LM) ---------- */
export const THEMES = {
  mansion: { id: 'mansion', name: 'особняк', lm: [0, 1, 2, 3, 4, 5, 8, 11, 12, 13, 22, 23, 26, 30] }
};
// пока одна тема на все места; остальные появятся на следующих этапах
export function themeOf(place) { void place; return THEMES.mansion; }
const levelCache = new Map();
function getLevel(seed, L) {
  const k = seed + '|' + L;
  if (!levelCache.has(k)) { let lv = null; for (let tr = 0; tr < 230 && !lv; tr++) lv = tryGen(seed, L, tr, tr >= 200 ? (tr >= 218 ? 2 : 1) : 0); if (lv) addHides(lv); levelCache.set(k, lv); }
  return levelCache.get(k);
}
function bfs(lv, src, blocked, doorOpen) {
  const { W, H, g } = lv, dist = new Int16Array(W * H).fill(-1), q = [src]; dist[src] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, y = (c / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (!g[n] || dist[n] >= 0 || (blocked && blocked.has(n)) || (n === lv.door && !doorOpen)) continue;
      dist[n] = dist[c] + 1; q.push(n);
    }
  }
  return dist;
}
function tryGen(seed, L, tr, easy) {
  const r = RNG(seed + '|' + L + '|' + tr), d = diff(L);
  if (easy) { d.stains = Math.min(d.stains, 1); d.guards = Math.min(d.guards, easy > 1 ? 0 : 1); d.cams = Math.min(d.cams, easy > 1 ? 0 : 1); d.blink = Math.min(d.blink, easy > 1 ? 1 : 2); }
  const cw = d.cw, ch = d.ch, W = 2 * cw + 1, H = 2 * ch + 1, N = W * H;
  const g = new Uint8Array(N), id = (x, y) => y * W + x;
  const sc = L === 0 ? [0, ch - 1] : [Math.floor(r() * cw), Math.floor(r() * ch)];
  const vis = new Uint8Array(cw * ch), stack = [sc];
  vis[sc[1] * cw + sc[0]] = 1; g[id(2 * sc[0] + 1, 2 * sc[1] + 1)] = 1;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1], opts = [];
    for (let k = 0; k < 4; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && !vis[ny * cw + nx]) opts.push(k); }
    if (!opts.length) { stack.pop(); continue; }
    const k = opts[Math.floor(r() * opts.length)], nx = cx + DX[k], ny = cy + DY[k];
    vis[ny * cw + nx] = 1; g[id(2 * cx + 1 + DX[k], 2 * cy + 1 + DY[k])] = 1; g[id(2 * nx + 1, 2 * ny + 1)] = 1; stack.push([nx, ny]);
  }
  const deg = (cx, cy) => { let c = 0; for (let k = 0; k < 4; k++) if (g[id(2 * cx + 1 + DX[k], 2 * cy + 1 + DY[k])]) c++; return c; };
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    if (deg(cx, cy) !== 1 || r() > 0.7) continue;
    const opts = []; for (let k = 0; k < 4; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && !g[id(2 * cx + 1 + DX[k], 2 * cy + 1 + DY[k])]) opts.push(k); }
    if (opts.length) { const k = opts[Math.floor(r() * opts.length)]; g[id(2 * cx + 1 + DX[k], 2 * cy + 1 + DY[k])] = 1; }
  }
  const lv = { L, seed, W, H, g, deco: {}, S: id(2 * sc[0] + 1, 2 * sc[1] + 1), E: id(W - 2, 1), face0: L === 0 ? 0 : Math.floor(r() * 4), gem: -1, door: -1, note: -1, lasers: [], guards: [], cams: [], rotate: d.rotate, pings: d.pings, stains: [], gate: -1, panel: -1, hide: d.hide, doorType: doorTypeOf(seed, L), safe: d.safe, flicker: d.flicker, vis: d.vis, vr: d.vr, camr: d.camr, limit: 0, name: PLACES[(L + (hashStr(seed) >>> 0)) % PLACES.length], best: 0 };
  const dS = bfs(lv, lv.S, null, true);
  if (L > 0) {
    // exit: a random cell among the far half from the start
    const cells = []; for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { const t = id(2 * cx + 1, 2 * cy + 1); if (t !== lv.S) cells.push(t); }
    cells.sort((a, b) => dS[b] - dS[a]); const far = cells.slice(0, Math.max(1, Math.floor(cells.length * 0.35)));
    lv.E = far[Math.floor(r() * far.length)];
  }
  const dE = bfs(lv, lv.E, null, true);
  const dead = [];
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { const t = id(2 * cx + 1, 2 * cy + 1); if (deg(cx, cy) === 1 && t !== lv.S && t !== lv.E) dead.push(t); }
  if (!dead.length) return null;
  let best = -1;
  for (const t of dead) { const v = Math.min(dS[t], dE[t]); if (v > best) { best = v; lv.gem = t; } }
  if (best < 4) return null;
  if (d.lock) {
    const gx = lv.gem % W, gy = (lv.gem / W) | 0;
    for (let k = 0; k < 4; k++) { const e = id(gx + DX[k], gy + DY[k]); if (g[e]) lv.door = e; }
    const dD = bfs(lv, lv.door, null, true);
    let nb = -1;
    const nc = dead.filter(t => t !== lv.gem && Math.min(dS[t], dD[t]) >= 3);
    if (nc.length) { lv.note = nc[Math.floor(r() * nc.length)]; nb = 3; }
    if (nb < 3) {
      nb = -1;
      for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { const t = id(2 * cx + 1, 2 * cy + 1); if (t === lv.S || t === lv.E || t === lv.gem) continue; const v = Math.min(dS[t], dD[t]) + r(); if (v > nb) { nb = v; lv.note = t; } }
    }
  }
  if (d.gate && lv.door >= 0) {
    // the barrier sits on a tile every route to the vault has to cross; the panel is in a dead end on this side of it
    const dsx = bfs(lv, lv.S, null, true), pre = lv.door + (lv.door - lv.gem);
    if (!g[pre] || dsx[pre] < 0) return null;
    const cand = []; let c = pre;
    for (let n = 0; n < 400 && c !== lv.S; n++) {
      if (dsx[c] >= 3 && c !== lv.E) { const t = bfs(lv, lv.S, new Set([c]), true); if (t[pre] < 0 || c === pre) cand.push(c); }
      const x = c % W, y = (c / W) | 0; let nx = -1;
      for (let k = 0; k < 4; k++) { const q = id(x + DX[k], y + DY[k]); if (x + DX[k] >= 0 && y + DY[k] >= 0 && x + DX[k] < W && y + DY[k] < H && g[q] && dsx[q] === dsx[c] - 1) { nx = q; break; } }
      if (nx < 0) break; c = nx;
    }
    if (!cand.length) return null;
    lv.gate = cand[Math.floor(r() * cand.length)];
    const dg = bfs(lv, lv.S, new Set([lv.gate]), true);
    const cellsF = []; for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { const t = id(2 * cx + 1, 2 * cy + 1); if (t !== lv.S && t !== lv.E && t !== lv.gem && t !== lv.gate && dg[t] >= 3) cellsF.push(t); }
    const pickFar = (arr, skip) => { const c2 = arr.filter(t => t !== skip).sort((a2, b2) => dg[b2] - dg[a2]); return c2.length ? c2[Math.floor(r() * Math.max(1, Math.ceil(c2.length / 2)))] : -1; };
    if (lv.note >= 0 && (dg[lv.note] < 0 || lv.note === lv.gate)) {
      // the code note has to be on this side of the barrier
      const nd = dead.filter(t => cellsF.includes(t));
      lv.note = nd.length ? nd[Math.floor(r() * nd.length)] : pickFar(cellsF, -1);
      if (lv.note < 0) return null;
    }
    const pd = dead.filter(t => t !== lv.note && cellsF.includes(t));
    lv.panel = pd.length ? pd[Math.floor(r() * pd.length)] : pickFar(cellsF, lv.note);
    if (lv.panel < 0) return null;
  }
  const special = new Set([lv.S, lv.E, lv.gem, lv.door, lv.note, lv.gate, lv.panel].filter(x => x >= 0));
  // landmarks on walls
  const wallC = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = id(x, y); if (g[t]) continue;
    let nf = 0; for (let k = 0; k < 4; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx >= 0 && ny >= 0 && nx < W && ny < H && g[id(nx, ny)]) nf++; }
    if (nf) wallC.push(t);
  }
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(wallC);
  const lmOrder = shuffle(themeOf(lv.name).lm.slice()), lmPos = [];
  // in 3D a landmark hangs on the wall of a room, so only walls next to a room cell are used
  const roomWall = t => { const x = t % W, y = (t / W) | 0; for (let k = 0; k < 4; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx >= 0 && ny >= 0 && nx < W && ny < H && nx % 2 === 1 && ny % 2 === 1 && g[id(nx, ny)]) return true; } return false; };
  for (const t of wallC.filter(roomWall)) {
    if (lmPos.length >= Math.min(lmOrder.length, Math.max(6, Math.round(wallC.length / 9)))) break;
    const x = t % W, y = (t / W) | 0;
    if (lmPos.some(p => Math.max(Math.abs(p % W - x), Math.abs(((p / W) | 0) - y)) < 2)) continue;
    if (L >= 3 && Math.max(Math.abs(lv.S % W - x), Math.abs(((lv.S / W) | 0) - y)) <= 1) continue;
    let li = lmOrder[lmPos.length % lmOrder.length];
    if (d.dupes && lmPos.length > 3 && r() < 0.3) li = lv.deco[lmPos[Math.floor(r() * lmPos.length)]];
    lv.deco[t] = li; lmPos.push(t);
  }
  if (d.dupes && lmPos.length > 4 && new Set(lmPos.map(t => lv.deco[t])).size === lmPos.length) lv.deco[lmPos[lmPos.length - 1]] = lv.deco[lmPos[0]];
  // lasers sit in corridors between two cells
  const edges = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const t = id(x, y); if (g[t] && (x % 2 === 0 || y % 2 === 0) && !special.has(t) && dS[t] > 2) edges.push(t); }
  shuffle(edges);
  const blocked = new Set();
  const okPath = () => {
    const ds = bfs(lv, lv.S, blocked, true); if (!(ds[lv.gem] >= 0 && ds[lv.E] >= 0 && (lv.note < 0 || ds[lv.note] >= 0))) return false;
    if (lv.gate < 0) return true;
    const dg = bfs(lv, lv.S, new Set([...blocked, lv.gate]), true); return dg[lv.panel] >= 0 && (lv.note < 0 || dg[lv.note] >= 0);
  };
  let ei = 0;
  for (; ei < edges.length && lv.lasers.length < d.lasers; ei++) {
    const t = edges[ei]; blocked.add(t);
    if (okPath()) lv.lasers.push({ i: t, m: 0 }); else blocked.delete(t);
  }
  let nb2 = 0;
  for (; ei < edges.length && nb2 < d.blink; ei++) { const t = edges[ei]; if (blocked.has(t)) continue; lv.lasers.push({ i: t, m: 1 + (r() < 0.5 ? 1 : 0) }); nb2++; }
  const used = new Set([...special, ...lv.lasers.map(l => l.i)]);
  // guards
  for (let gi = 0; gi < d.guards; gi++) {
    for (let at = 0; at < 70; at++) {
      const cx = Math.floor(r() * cw), cy = Math.floor(r() * ch), st = id(2 * cx + 1, 2 * cy + 1);
      if (used.has(st) || dS[st] < 6) continue;
      const len = [4, 5, 7][Math.floor(r() * 3)], path = [st], inPath = new Set([st]);
      while (path.length < len) {
        const c = path[path.length - 1], x = c % W, y = (c / W) | 0, nb = [];
        for (let k = 0; k < 4; k++) { const n = id(x + DX[k], y + DY[k]); if (g[n] && !inPath.has(n) && !used.has(n) && dS[n] >= 3) nb.push(n); }
        if (!nb.length) break;
        const n = nb[Math.floor(r() * nb.length)]; path.push(n); inPath.add(n);
      }
      if (path.length !== len) continue;
      // a patrol never fills the only corridor to something the thief must reach: there is always a way around it
      const gb = new Set([...lv.lasers.filter(l => l.m === 0).map(l => l.i), ...lv.guards.flatMap(gd => gd.path), ...path]);
      if (gb.has(lv.S)) continue;
      const ra = bfs(lv, lv.S, gb, true); if (ra[lv.gem] < 0 || ra[lv.E] < 0) continue;
      if (lv.gate >= 0) { gb.add(lv.gate); const rb = bfs(lv, lv.S, gb, true); if (rb[lv.panel] < 0 || (lv.note >= 0 && rb[lv.note] < 0)) continue; }
      else if (lv.note >= 0 && ra[lv.note] < 0) continue;
      path.forEach(t => used.add(t)); lv.guards.push({ path, W }); break;
    }
  }
  if (!easy && lv.guards.length < d.guards) return null;
  addSideTrips(lv, dS, used, RNG(seed + '|side|' + L + '|' + tr));
  // cameras on walls, looking along corridors
  const camC = shuffle(wallC.filter(t => lv.deco[t] == null));
  for (const t of camC) {
    if (lv.cams.length >= d.cams) break;
    const x = t % W, y = (t / W) | 0, dirs = [];
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !g[id(nx, ny)]) continue;
      let ok = true, c = t; for (let s = 0; s < lv.camr; s++) { const cx2 = c % W + DX[k], cy2 = ((c / W) | 0) + DY[k]; if (cx2 < 0 || cy2 < 0 || cx2 >= W || cy2 >= H) break; c = id(cx2, cy2); if (!g[c]) break; if (dS[c] < 3 || c === lv.E) ok = false; }
      if (ok) dirs.push(k);
    }
    if (!dirs.length || lv.cams.some(c => Math.abs(c.i % W - x) + Math.abs(((c.i / W) | 0) - y) < 4)) continue;
    lv.cams.push({ i: t, dirs: dirs.length === 1 ? [dirs[0], -1] : shuffle(dirs).slice(0, 3) });
  }
  if (lv.guards.length && !easy) {
    const hard = new Set(lv.lasers.filter(l => l.m === 0).map(l => l.i)), reach = bfs(lv, lv.S, hard, true);
    if (lv.guards.some(gd => gd.path.every(c => reach[c] < 0))) return null;
    const pathT = new Set(), walk = (a, b) => { const dd = bfs(lv, b, hard, true); let c = a; pathT.add(c); for (let n = 0; n < 400 && c !== b; n++) { const x = c % W, y = (c / W) | 0; let nx = -1; for (let k = 0; k < 4; k++) { const q = id(x + DX[k], y + DY[k]); if (x + DX[k] >= 0 && y + DY[k] >= 0 && x + DX[k] < W && y + DY[k] < H && g[q] && dd[q] === dd[c] - 1) { nx = q; break; } } if (nx < 0) break; c = nx; pathT.add(c); } };
    if (lv.panel >= 0) walk(lv.S, lv.panel);
    if (lv.note >= 0) { walk(lv.S, lv.note); walk(lv.note, lv.gem); } else walk(lv.S, lv.gem);
    walk(lv.gem, lv.E);
    const threat = lv.guards.some(gd => { const P = gPeriod(gd); for (let t = 0; t < P; t++) { const q = guardAt(gd, t); if (pathT.has(q.i) || ray(lv, q.i, q.face, lv.vr).some(c => pathT.has(c))) return true; } return false; });
    if (!threat) return null;
  }
  // coffee stains: parts of the blueprint the navigator cannot read (never over hazards or key tiles)
  if (d.stains) {
    const haz = new Set(lv.lasers.map(l => l.i));
    for (const gd of lv.guards) { const P = gPeriod(gd); for (let t = 0; t < P; t++) { const q = guardAt(gd, t); haz.add(q.i); ray(lv, q.i, q.face, lv.vr).forEach(c => haz.add(c)); } }
    for (const c of lv.cams) { haz.add(c.i); for (const k of c.dirs) if (k >= 0) ray(lv, c.i, k, lv.camr).forEach(x => haz.add(x)); }
    for (let si = 0; si < d.stains; si++) for (let at = 0; at < 80; at++) {
      const sw = 3 + Math.floor(r() * 2), sh = 3 + Math.floor(r() * 2), x0 = 1 + Math.floor(r() * (W - sw - 1)), y0 = 1 + Math.floor(r() * (H - sh - 1));
      const cells = []; let ok = true;
      for (let y = y0; y < y0 + sh && ok; y++) for (let x = x0; x < x0 + sw; x++) { const t = id(x, y); if (special.has(t) || haz.has(t) || lv.stains.some(q => q.set.has(t))) { ok = false; break; } cells.push(t); }
      if (!ok || cells.filter(t => g[t]).length < 4) continue;
      lv.stains.push({ x0, y0, w: sw, h: sh, set: new Set(cells) }); break;
    }
    if (!easy && lv.stains.length < d.stains) return null;
  }
  if (seenBy(lv, 0, lv.S)) return null;
  // the thief spends many ticks at the safe and at the door keypad: nobody may ever look there
  if (spotsWatched(lv)) return null;
  const sol = solve(lv); if (!sol || !solveRT(lv)) return null;
  if (!easy && sol.length > (L < 10 ? Math.min(160, 48 + L * 12) : L < 14 ? 190 : 230)) return null;
  lv.best = sol.length; lv.sol = sol;
  const per = L < 3 ? Math.max(2, 2.6 - L * 0.04) : L < 12 ? 2 : L < 16 ? 1.8 : L < 18 ? 1.65 : 1.55;
  const limitOf = n => d.timer ? Math.round((30 + n * per + (lv.door >= 0 ? (lv.doorType === 'digits' ? 20 : 30) : 0) + (lv.safe ? (L < 8 ? 20 : 35) : 0) + (lv.gate >= 0 ? (L >= 20 ? 75 : L >= 12 ? 55 : 35) : 0)) / 5) * 5 : 0;
  lv.limit = limitOf(sol.length);
  lv.starts = [{ s: lv.S, f: lv.face0 || 0, best: sol.length, limit: lv.limit }];
  if (L > 0) {
    // other safe starting spots: every retry begins somewhere new, so the navigator has to find the thief again
    const danger = new Set([...special, ...lv.lasers.map(l => l.i)]);
    for (const gd of lv.guards) { const P = gPeriod(gd); for (let t = 0; t < P; t++) { const q = guardAt(gd, t); danger.add(q.i); ray(lv, q.i, q.face, lv.vr).forEach(c => danger.add(c)); } }
    for (const c of lv.cams) for (const k of c.dirs) if (k >= 0) ray(lv, c.i, k, lv.camr).forEach(x => danger.add(x));
    const dG = bfs(lv, lv.gem, null, true), cand = [];
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) { const t = id(2 * cx + 1, 2 * cy + 1); if (!danger.has(t) && dG[t] >= 4) cand.push(t); }
    shuffle(cand);
    const cap = L < 10 ? Math.min(160, 48 + L * 12) : L < 14 ? 190 : 230;
    for (let i = 0; i < cand.length && lv.starts.length < 4 && i < 30; i++) {
      const c = cand[i], f = Math.floor(r() * 4), x = c % W, y = (c / W) | 0;
      if (L >= 3 && Object.keys(lv.deco).some(k => Math.max(Math.abs(k % W - x), Math.abs(((k / W) | 0) - y)) <= 1)) continue;
      const s2 = solve(lv, { pos: c, face: f, t: 0, gem: false, note: lv.note < 0, open: lv.door < 0, gateOff: lv.gate < 0 });
      if (s2 && s2.length <= cap && solveRT(lv, { pos: c, t: 0, gem: false, note: lv.note < 0, open: lv.door < 0, gateOff: lv.gate < 0 })) lv.starts.push({ s: c, f, best: s2.length, limit: limitOf(s2.length) });
    }
  }
  return lv;
}
/* ---------- охрана: патруль туда-обратно, иногда заход в соседнюю комнату ---------- */
// период одного охранника: rep раз туда-обратно, потом заход из первой клетки маршрута в сторону и назад
function gPeriod(gd) { const Pb = 2 * (gd.path.length - 1); return gd.side ? gd.rep * Pb + 2 * gd.side.length : Pb; }
function guardAt(gd, t) {
  const p = gd.path, n = p.length, Pb = 2 * (n - 1);
  let tt = t;
  if (gd.side) {
    const Pg = gPeriod(gd), x = ((t % Pg) + Pg) % Pg, B = gd.rep * Pb;
    // end — заход с дальнего конца маршрута: круг патруля начинается с последней клетки
    const p0 = gd.end ? p[n - 1] : p[0];
    if (x >= B) {
      const sd = gd.side, trip = [p0, ...sd, ...sd.slice(0, -1).reverse()], j = x - B, nx = j + 1 < trip.length ? trip[j + 1] : p0;
      return { i: trip[j], face: dirOf(gd.W, trip[j], nx) };
    }
    tt = x + (gd.end ? n - 1 : 0);
  }
  const idx = ((tt % Pb) + Pb) % Pb;
  const i = idx < n ? idx : Pb - idx, fwd = idx < n - 1, j = fwd ? i + 1 : i - 1;
  return { i: p[i], face: dirOf(gd.W, p[i], p[j]) };
}
// заход: из первой клетки маршрута через проём в соседнюю комнату (2 или 4 клетки), только туда, где можно обойти
function addSideTrips(lv, dS, used, r) {
  if (lv.L < 3) return;
  const { W, H, g } = lv, special = new Set([lv.S, lv.E, lv.gem, lv.door, lv.note, lv.gate, lv.panel].filter(x => x >= 0));
  for (const gd of lv.guards) {
    const ok = c => c >= 0 && g[c] && !used.has(c) && !special.has(c) && dS[c] >= 3 && !lv.lasers.some(l => l.i === c);
    const opts = [];
    for (const end of [0, 1]) for (let k = 0; k < 4; k++) {
      const p0 = end ? gd.path[gd.path.length - 1] : gd.path[0];
      const a = stepT(lv, p0, k), b = a >= 0 ? stepT(lv, a, k) : -1;
      if (!ok(a) || !ok(b) || gd.path.includes(a)) continue;
      const side = [a, b], c2 = stepT(lv, b, k), d2 = c2 >= 0 ? stepT(lv, c2, k) : -1;
      if (r() < 0.5 && ok(c2) && ok(d2)) side.push(c2, d2);
      side.end = end;
      opts.push(side);
    }
    const keyed = opts.map(o => [r(), o]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    for (const side of keyed) {
      // как и маршрут, заход не должен перекрывать единственный путь
      const gb = new Set([...lv.lasers.filter(l => l.m === 0).map(l => l.i), ...lv.guards.flatMap(q => [...q.path, ...(q.side || [])]), ...side]);
      const ra = bfs(lv, lv.S, gb, true); if (ra[lv.gem] < 0 || ra[lv.E] < 0 || (lv.note >= 0 && ra[lv.note] < 0)) continue;
      if (lv.gate >= 0) { gb.add(lv.gate); const rb = bfs(lv, lv.S, gb, true); if (rb[lv.panel] < 0) continue; }
      gd.side = side.slice(); gd.end = side.end; gd.rep = 2 + Math.floor(r() * 2); side.forEach(c => used.add(c)); break;
    }
  }
}
// укрытия (шкаф или портьера у глухой стены) — в комнатах рядом с охраной; генерацию дела не меняют
function addHides(lv) {
  lv.hides = [];
  if (lv.L < 3 || !lv.guards.length) return;
  const r = RNG(lv.seed + '|hide|' + lv.L), { W, H, g } = lv;
  const busy = new Set([lv.S, lv.E, lv.gem, lv.note, lv.panel].filter(c => c >= 0));
  const gp = lv.guards.flatMap(gd => [...gd.path, ...(gd.side || [])]);
  const cand = [];
  for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) {
    const c = y * W + x; if (!g[c] || busy.has(c)) continue;
    const walls = [0, 1, 2, 3].filter(d => { const t = stepT(lv, c, d); return t >= 0 && !g[t] && lv.deco[t] == null; });
    const near = Math.min(...gp.map(q => Math.abs(q % W - x) + Math.abs(((q / W) | 0) - y)));
    if (walls.length && near <= 2) cand.push({ c, walls, near, k: r() });
  }
  cand.sort((a, b) => a.near - b.near || a.k - b.k);
  const want = lv.guards.length >= 2 ? 2 : 1;
  for (const h of cand) {
    if (lv.hides.length >= want) break;
    if (lv.hides.some(q => Math.abs(q.c % W - h.c % W) + Math.abs(((q.c / W) | 0) - ((h.c / W) | 0)) < 4)) continue;
    lv.hides.push({ c: h.c, d: h.walls[Math.floor(r() * h.walls.length)], kind: r() < 0.5 ? 'wardrobe' : 'drape' });
  }
}
/* ---------- шум: бег слышно на HEAR клеток по проходам; охранник идёт туда, стоит HOLD тактов и возвращается ---------- */
export const HEAR = 4, HOLD = 2;
// где охранник k в такт t с учётом тревог по шуму (s.det[k] — список заходов на шум)
export function guardPos(lv, s, k, t) {
  const gd = lv.guards[k], dl = s && s.det && s.det[k];
  let off = 0;
  if (dl) for (const d of dl) {
    if (t <= d.t0) break;
    if (t <= d.t0 + d.seq.length) return d.seq[t - d.t0 - 1];
    off += d.seq.length;
  }
  return guardAt(gd, t - off);
}
const onAlert = (s, k) => { const dl = s.det && s.det[k], d = dl && dl[dl.length - 1]; return !!d && s.t < d.t0 + d.seq.length; };
function hearNoise(lv, s, c) {
  const dist = bfs(lv, c, null, s.open);
  for (let k = 0; k < lv.guards.length; k++) {
    if (onAlert(s, k)) continue;
    const g0 = guardPos(lv, s, k, s.t).i;
    if (!(dist[g0] > 0 && dist[g0] <= HEAR)) continue;
    // путь к шуму: по убыванию расстояния до места шума
    const out = []; let cc = g0;
    while (cc !== c) { let nx = -1; for (let q = 0; q < 4; q++) { const n = stepT(lv, cc, q); if (n >= 0 && dist[n] === dist[cc] - 1) { nx = n; break; } } if (nx < 0) break; out.push(nx); cc = nx; }
    if (cc !== c) continue;
    const seq = [], cells = [g0, ...out];
    for (let i = 1; i < cells.length; i++) seq.push({ i: cells[i], face: dirOf(lv.W, cells[i - 1], cells[i]) });
    const f = seq[seq.length - 1].face;
    for (let h = 0; h < HOLD; h++) seq.push({ i: c, face: h % 2 ? (f + 2) % 4 : f });
    for (let i = cells.length - 2; i >= 0; i--) seq.push({ i: cells[i], face: dirOf(lv.W, cells[i + 1], cells[i]) });
    s.det = Object.assign({}, s.det, { [k]: [...((s.det && s.det[k]) || []), { t0: s.t, seq }] });
    s.heard = (s.heard || 0) + 1;
  }
}
let curW = 0;
function dirOf(W, a, b) { const ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0; return bx > ax ? 1 : bx < ax ? 3 : by > ay ? 2 : 0; }
const camDir = (c, t) => c.dirs[Math.floor(t / 2) % c.dirs.length];
const laserOn = (l, t) => l.m === 0 || (l.m === 1 ? t % 2 === 0 : t % 2 === 1);
function stepT(lv, c, k) { const x = c % lv.W + DX[k], y = ((c / lv.W) | 0) + DY[k]; if (x < 0 || y < 0 || x >= lv.W || y >= lv.H) return -1; return y * lv.W + x; }
function ray(lv, from, k, len) { const out = []; let c = from; for (let s = 0; s < len; s++) { c = stepT(lv, c, k); if (c < 0 || !lv.g[c] || c === lv.door) break; out.push(c); } return out; }
function seenBy(lv, t, x, s) {
  curW = lv.W;
  const hid = !!(s && s.hidden);
  if (!hid) for (let k = 0; k < lv.guards.length; k++) { const { i, face } = guardPos(lv, s, k, t); if (i === x || ray(lv, i, face, lv.vr || VR).includes(x)) return 'guard'; }
  if (!hid) for (const c of lv.cams) { const k = camDir(c, t); if (k >= 0 && ray(lv, c.i, k, lv.camr || CAM_R).includes(x)) return 'cam'; }
  for (const l of lv.lasers) if (l.i === x && laserOn(l, t)) return 'laser';
  return '';
}
function whoCaught(lv, s) {
  curW = lv.W;
  for (let k = 0; k < lv.guards.length; k++) { const { i, face } = guardPos(lv, s, k, s.t); if (i === s.pos || ray(lv, i, face, lv.vr || VR).includes(s.pos)) return k; }
  for (let k = 0; k < lv.guards.length; k++) { if (s.trail.length > 1 && guardPos(lv, s, k, s.t - 1).i === s.pos) return k; }
  return -1;
}
function caughtCheck(lv, prev, cur, t, s) {
  const r = seenBy(lv, t, cur, s); if (r) return r;
  curW = lv.W;
  if (t > 0 && !(s && s.hidden)) for (let k = 0; k < lv.guards.length; k++) { if (guardPos(lv, s, k, t - 1).i === cur && guardPos(lv, s, k, t).i === prev) return 'guard'; }
  return '';
}
const gcd = (a, b) => b ? gcd(b, a % b) : a, lcm = (a, b) => a / gcd(a, b) * b;
function codeFor(seed, L, att) { return doorFor(seed, L, att).code; }

/* ---------- проверка мест, где вор долго стоит ---------- */
function watchedCells(lv) {
  const out = new Set(), P = period(lv);
  for (let t = 0; t < P; t++) {
    for (const gd of lv.guards) { const q = guardAt(gd, t); out.add(q.i); ray(lv, q.i, q.face, lv.vr).forEach(c => out.add(c)); }
    for (const c of lv.cams) { const k = camDir(c, t); if (k >= 0) ray(lv, c.i, k, lv.camr).forEach(x => out.add(x)); }
  }
  return out;
}
function spotsWatched(lv) {
  if (!lv.guards.length && !lv.cams.length) return false;
  const w = watchedCells(lv), spots = [];
  if (lv.safe) spots.push(lv.gem);
  if (lv.door >= 0) spots.push(lv.door + (lv.door - lv.gem));   // клетка перед дверью, где вор набирает код
  if (lv.panel >= 0) spots.push(lv.panel);
  return spots.some(c => w.has(c));
}

/* ---------- решатели под 3D-правила: поворот ничего не стоит ---------- */
function period(lv) {
  let P = 2;
  for (const gd of lv.guards) P = lcm(P, gPeriod(gd));
  for (const c of lv.cams) P = lcm(P, 2 * c.dirs.length);
  return P;
}
const flags0 = (lv, from) => (from ? ((from.gem ? 1 : 0) | (from.note || from.open ? 2 : 0) | (from.gateOff ? 4 : 0)) : 0) | (lv.gate < 0 ? 4 : 0) | (lv.note < 0 ? 2 : 0);
const stepOk = (lv, c, f) => c >= 0 && !!lv.g[c] && !(c === lv.door && !(f & 2)) && !(c === lv.gate && !(f & 4));
const nextF = (lv, c, f) => f | (c === lv.gem ? 1 : 0) | (c === lv.note ? 2 : 0) | (c === lv.panel ? 4 : 0);

// Пошаговый режим («Вором вслепую»): каждый переход в клетку и каждое «ждать» — один такт, проверка после шага, как в 2D.
// Возвращает путь (клетка на каждый такт) или null.
export function solve(lv, from) {
  const P = period(lv), key = (p, t, f) => ((p * P + t) << 3) | f;
  const p0 = from ? from.pos : lv.S, t0 = from ? from.t % P : 0, f0 = flags0(lv, from);
  const prev = new Map([[key(p0, t0, f0), null]]), q = [[p0, t0, f0]];
  for (let h = 0; h < q.length; h++) {
    const [p, t, f] = q[h];
    if (p === lv.E && (f & 1)) {
      const path = []; let k = key(p, t, f);
      while (prev.get(k)) { const [pk, c] = prev.get(k); path.push(c); k = pk; }
      return path.reverse();
    }
    for (let d = -1; d < 4; d++) {
      const np = d < 0 ? p : stepT(lv, p, d);
      if (d >= 0 && !stepOk(lv, np, f)) continue;
      const nt = t + 1;
      if (caughtCheck(lv, p, np, nt)) continue;
      const nf = nextF(lv, np, f), kk = key(np, nt % P, nf);
      if (prev.has(kk)) continue;
      prev.set(kk, [key(p, t, f), np]); q.push([np, nt % P, nf]);
    }
    if (q.length > 900000) return null;
  }
  return null;
}

// Живой режим: внутри такта вор успевает пройти до RT_STEPS клеток (комната → проём → комната),
// каждая клетка проверяется по положению охраны в этом такте; на смене такта проверяется клетка, где он стоит.
// Возвращает число тактов до выхода или 0.
export const RT_STEPS = 2;
export function solveRT(lv, from) {
  const P = period(lv), key = (p, t, f) => ((p * P + t) << 3) | f;
  const p0 = from ? from.pos : lv.S, t0 = from ? from.t % P : 0, f0 = flags0(lv, from);
  const seen = new Set([key(p0, t0, f0)]), noisy = noisyCells(lv, P);
  let layer = [[p0, t0, f0]];
  for (let ticks = 0; layer.length && ticks < 2000; ticks++) {
    const next = [];
    for (const [p, t, f] of layer) {
      // все клетки, куда можно дойти за этот такт
      const reach = [[p, f]], rs = new Set([p * 8 + f]);
      for (let s = 0, from0 = 0; s < RT_STEPS; s++) {
        const to = reach.length;
        for (let i = from0; i < to; i++) {
          const [c, cf] = reach[i];
          for (let d = 0; d < 4; d++) {
            const n = stepT(lv, c, d); if (!stepOk(lv, n, cf) || seenBy(lv, t, n)) continue;
            // второй шаг за такт — это бег: нельзя, если первая или вторая клетка в зоне слышимости
            if (s > 0 && (noisy[t % P].has(c) || noisy[t % P].has(n))) continue;
            const nf = nextF(lv, n, cf);
            if (n === lv.E && (nf & 1)) return ticks + 1;
            if (rs.has(n * 8 + nf)) continue;
            rs.add(n * 8 + nf); reach.push([n, nf]);
          }
        }
        from0 = to;
      }
      for (const [c, cf] of reach) {
        const nt = (t + 1) % P;
        if (seenBy(lv, t + 1, c)) continue;
        const kk = key(c, nt, cf); if (seen.has(kk)) continue;
        seen.add(kk); next.push([c, nt, cf]);
      }
    }
    if (seen.size > 900000) return 0;
    layer = next;
  }
  return 0;
}

// клетки, где бег услышит охрана (по такту периода); дверь считаем открытой — так строже
function noisyCells(lv, P) {
  const memo = new Map(), out = [];
  for (let t = 0; t < P; t++) {
    const set = new Set();
    for (const gd of lv.guards) {
      const q = guardAt(gd, t).i;
      if (!memo.has(q)) memo.set(q, bfs(lv, q, null, true));
      const d = memo.get(q); for (let c = 0; c < d.length; c++) if (d[c] >= 0 && d[c] <= HEAR) set.add(c);
    }
    out.push(set);
  }
  return out;
}

/* ---------- одна попытка дела — это список событий ----------
   g      брифинг закрыт, пошёл таймер
   T<n>   наступил такт n (живой режим, n в base36)
   m<c>   вор перешёл в клетку c (живой режим, base36); r<c> — то же бегом: охрана рядом слышит шум
   h / u  спрятался в укрытие / вышел из него
   M<c>   шаг в клетку c за один такт (режим «Вором вслепую»)
   w      ждать один такт (режим «Вором вслепую»)
   k<i>   кнопка сейфа, c<i> провод щитка, o/x<rid> верный/неверный код двери, z время вышло */
export const EV_RE = /^(g|z|w|n|h|u|T[0-9a-z]{1,5}|[mMr][0-9a-z]{1,4}|k[0-5]|c[0-5]|[ox][a-z0-9]{3,8})$/;
export function startOf(lv, att) { const st = lv.starts || [{ s: lv.S, f: lv.face0 || 0, best: lv.best, limit: lv.limit }]; return st[(att | 0) % st.length]; }
export function newSim(lv, att) { const st = startOf(lv, att); return { pos: st.s, face: st.f, t: 0, gem: false, note: lv.note < 0, open: lv.door < 0, gateOff: !(lv.gate >= 0), pstrikes: 0, pcut: 0, caught: '', won: false, trail: [st.s], wrong: 0, steps: 0, sp: 0, strikes: 0 }; }
export function cloneSim(s) { return Object.assign({}, s, { trail: s.trail.slice() }); }
export const adjCell = (lv, a, b) => Math.abs(a % lv.W - b % lv.W) + Math.abs(((a / lv.W) | 0) - ((b / lv.W) | 0)) === 1;
// cur = { safe, panel } — данные сейфа и щитка текущей попытки
export function applyEv(lv, s, e, cur) {
  if (s.caught || s.won || !EV_RE.test(e)) return false;
  if (e === 'g') { if (s.go) return false; s.go = true; return true; }
  if (e === 'z') { s.caught = 'time'; return true; }
  // n — вор взял записку со стола (в 3D: E, посмотрел, убрал в инвентарь)
  if (e === 'n') { if (s.noteTaken || lv.note < 0 || s.pos !== lv.note) return false; s.noteTaken = true; return true; }
  if (e === 'h') { if (s.hidden || !(lv.hides || []).some(h => h.c === s.pos)) return false; s.hidden = true; return true; }
  if (e === 'u') { if (!s.hidden) return false; s.hidden = false; const why = seenBy(lv, s.t, s.pos, s); if (why) s.caught = why; return true; }
  if (e[0] === 'o') { if (s.open) return false; s.open = true; return true; }
  if (e[0] === 'x') { s.wrong++; return true; }
  if (e[0] === 'k') {
    const sf = cur && cur.safe;
    if (!lv.safe || !sf || s.pos !== lv.gem || s.gem) return false;
    if (+e[1] === sf.order[s.sp]) { s.sp++; if (s.sp >= 4) s.gem = true; }
    else { s.strikes++; if (s.strikes >= sf.maxStrikes) s.caught = 'safe'; }
    return true;
  }
  if (e[0] === 'c') {
    const pn = cur && cur.panel;
    if (!(lv.panel >= 0) || !pn || s.pos !== lv.panel || s.gateOff) return false;
    if (+e[1] === pn.cuts[s.pcut | 0]) { s.pcut = (s.pcut | 0) + 1; if (s.pcut >= pn.rounds) s.gateOff = true; }
    else { s.pstrikes++; if (s.pstrikes >= pn.maxStrikes) s.caught = 'panel'; }
    return true;
  }
  if (e[0] === 'T') {
    const n = parseInt(e.slice(1), 36); if (!(n > s.t)) return false;
    while (s.t < n) { s.t++; const why = seenBy(lv, s.t, s.pos, s); if (why) { s.caught = why; break; } }
    return true;
  }
  if (e === 'w') { s.t++; const why = caughtCheck(lv, s.pos, s.pos, s.t, s); if (why) s.caught = why; return true; }
  const c = parseInt(e.slice(1), 36);
  if (s.hidden || !adjCell(lv, s.pos, c) || !lv.g[c] || (c === lv.door && !s.open)) return false;
  const pv = s.pos; s.pos = c; s.steps++; s.trail.push(c);
  if (e[0] === 'M') s.t++;
  if (c === lv.note) s.note = true;
  if (c === lv.gem && !lv.safe) s.gem = true;
  if (c === lv.gate && !s.gateOff) { s.caught = 'gate'; return true; }
  const why = e[0] === 'M' ? caughtCheck(lv, pv, c, s.t, s) : seenBy(lv, s.t, c, s);
  if (why) { s.caught = why; return true; }
  if (e[0] === 'r') hearNoise(lv, s, c);
  if (c === lv.E && s.gem) s.won = true;
  return true;
}
export function simulate(lv, log, att, cur) { const s = newSim(lv, att); for (const e of log) applyEv(lv, s, e, cur); return s; }

export { gPeriod, DX, DY, VR, CAM_R, PLACES, GLYPHS, DCOL, SHAPES, ARW, ARWN, REL, RELA, WCOL, hashStr, RNG, safeFor, doorFor, doorTypeOf, panelFor, diff, getLevel, bfs, guardAt, dirOf, camDir, laserOn, stepT, ray, seenBy, whoCaught, caughtCheck, codeFor, watchedCells };
