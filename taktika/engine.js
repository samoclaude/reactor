/* КС-тактика: движок. Чистая логика без DOM.
   Состояние полностью восстанавливается из seed + списка шагов (picks), поэтому онлайн передаёт только выборы игроков.
   Стороны: seat 0 / seat 1. На каждом шаге pending(s) говорит, кто выбирает и что. apply(s, [p0, p1]) разрешает шаг. */
(function (root) {
  'use strict';

  const CLOCK = 5;          // моментов до конца раунда (1:55)
  const BOMB = 4;           // обменов после установки до взрыва (0:40)
  const WIN_SCORE = 8;
  const HALF = 7;           // смена сторон после 7-го раунда
  const MAX_MONEY = 16000;
  const DIST = ['Вплотную', 'Средне', 'Далеко'];

  /* ---------------- оружие ----------------
     pow: сила на дистанциях [вплотную, средне, далеко]
     hit: урон попадания в корпус без брони, pen: бронепробитие, head: урон в голову без шлема
     hsHelm: убивает хэдшотом в шлеме */
  const W = {
    glock:  { name: 'Glock-18',    side: 'T',  cat: 'pistol',  price: 200,  pow: [2, 1, 0], hit: 60,  pen: 0.47,  head: 120, hsHelm: false, reward: 300 },
    usp:    { name: 'USP-S',       side: 'CT', cat: 'pistol',  price: 200,  pow: [2, 1, 0], hit: 70,  pen: 0.505, head: 140, hsHelm: false, reward: 300 },
    p250:   { name: 'P250',        side: '*',  cat: 'pistol',  price: 300,  pow: [3, 2, 1], hit: 76,  pen: 0.64,  head: 152, hsHelm: false, reward: 300 },
    tec9:   { name: 'Tec-9',       side: 'T',  cat: 'pistol',  price: 500,  pow: [3, 2, 1], hit: 66,  pen: 0.906, head: 132, hsHelm: true,  reward: 300, note: 'Ваншот в шлем' },
    five:   { name: 'Five-SeveN',  side: 'CT', cat: 'pistol',  price: 500,  pow: [3, 2, 1], hit: 64,  pen: 0.91,  head: 128, hsHelm: true,  reward: 300, note: 'Ваншот в шлем' },
    deagle: { name: 'Desert Eagle', side: '*', cat: 'pistol',  price: 700,  pow: [3, 3, 2], hit: 53,  pen: 0.93,  head: 206, hsHelm: true,  reward: 300, note: 'Ваншот в шлем на любой дистанции' },
    mac10:  { name: 'MAC-10',      side: 'T',  cat: 'smg',     price: 1050, pow: [5, 3, 1], hit: 87,  pen: 0.575, head: 116, hsHelm: false, reward: 600, note: '$600 за убийство' },
    mp9:    { name: 'MP9',         side: 'CT', cat: 'smg',     price: 1250, pow: [5, 3, 1], hit: 78,  pen: 0.6,   head: 104, hsHelm: false, reward: 600, note: '$600 за убийство' },
    ump:    { name: 'UMP-45',      side: '*',  cat: 'smg',     price: 1200, pow: [4, 3, 2], hit: 70,  pen: 0.65,  head: 140, hsHelm: false, reward: 600, note: '$600 за убийство' },
    sawed:  { name: 'Sawed-Off',   side: 'T',  cat: 'shotgun', price: 1100, pow: [6, 1, 0], hit: 90,  pen: 0.75,  head: 180, hsHelm: false, reward: 900, note: 'Только в упор · $900' },
    mag7:   { name: 'MAG-7',       side: 'CT', cat: 'shotgun', price: 1300, pow: [6, 2, 0], hit: 100, pen: 0.75,  head: 200, hsHelm: false, reward: 900, note: 'Только в упор · $900' },
    galil:  { name: 'Galil AR',    side: 'T',  cat: 'rifle',   price: 1800, pow: [4, 4, 3], hit: 60,  pen: 0.775, head: 120, hsHelm: false, reward: 300 },
    famas:  { name: 'FAMAS',       side: 'CT', cat: 'rifle',   price: 1950, pow: [4, 4, 3], hit: 60,  pen: 0.7,   head: 120, hsHelm: false, reward: 300 },
    ak:     { name: 'AK-47',       side: 'T',  cat: 'rifle',   price: 2700, pow: [5, 5, 4], hit: 72,  pen: 0.775, head: 144, hsHelm: true,  reward: 300, note: 'Ваншот в шлем' },
    m4a4:   { name: 'M4A4',        side: 'CT', cat: 'rifle',   price: 2900, pow: [5, 5, 4], hit: 66,  pen: 0.7,   head: 132, hsHelm: false, reward: 300, note: '+1 на выходе (магазин 30)', perk: 'peek' },
    m4a1:   { name: 'M4A1-S',      side: 'CT', cat: 'rifle',   price: 2900, pow: [5, 5, 4], hit: 76,  pen: 0.7,   head: 132, hsHelm: false, reward: 300, note: '+1 когда держишь угол', perk: 'hold' },
    ssg:    { name: 'SSG 08',      side: '*',  cat: 'sniper',  price: 1700, pow: [2, 4, 5], hit: 88,  pen: 0.85,  head: 352, hsHelm: true,  reward: 300, note: 'Ваншот в голову' },
    awp:    { name: 'AWP',         side: '*',  cat: 'sniper',  price: 4750, pow: [3, 6, 7], hit: 115, pen: 0.975, head: 460, hsHelm: true,  reward: 100, note: 'Любое попадание = убийство · −1 на выходе · $100', perk: 'awp' }
  };
  const PISTOLS = ['glock', 'usp', 'p250', 'tec9', 'five', 'deagle'];
  const DEFAULT_PISTOL = { T: 'glock', CT: 'usp' };

  const GEAR = {
    kev:  { name: 'Кевлар',            price: 650 },
    helm: { name: 'Кевлар + шлем',     price: 1000 },
    kit:  { name: 'Набор сапёра',      price: 400, side: 'CT' },
    wu:   { name: 'Разминка аима',     price: 400 }
  };
  const NADES = {
    fl: { name: 'Флешка', price: 200, max: 2, short: 'Ослепляет: −2 сопернику в перестрелке' },
    sm: { name: 'Дым',    price: 300, max: 1, short: 'Гасит его угол и бонус позиции, далеко → средне' },
    mo: { name: 'Молотов', price: 400, priceCT: 500, nameCT: 'Зажигалка', max: 1, short: 'Если держит угол или дефьюзит: −20 HP и сбивает' },
    he: { name: 'HE',     price: 300, max: 1, short: '−35 HP до перестрелки (в броне −22)' }
  };
  const NADE_KEYS = ['fl', 'sm', 'mo', 'he'];

  /* ---------------- карты прицела ---------------- */
  const CARDS = {
    p1:    { name: 'Точно',        kind: 'num', val: 1,  n: 6, text: '+1' },
    p2:    { name: 'Отличный прицел', kind: 'num', val: 2, n: 4, text: '+2' },
    p3:    { name: 'Флик',         kind: 'num', val: 3,  n: 1, text: '+3' },
    z0:    { name: 'Обычно',       kind: 'num', val: 0,  n: 3, text: '0' },
    m1:    { name: 'Дрожь',        kind: 'num', val: -1, n: 2, text: '−1' },
    m2:    { name: 'Промах',       kind: 'num', val: -2, n: 1, text: '−2' },
    hs:    { name: 'Хэдшот',       kind: 'hs',  val: 1,  n: 3, text: '+1, победил = в голову' },
    pre:   { name: 'Префайр',      kind: 'pre', val: 3,  n: 3, text: '+3, если держишь, а он вышел' },
    cs:    { name: 'Контрстрейф',  kind: 'cs',  val: 2,  n: 3, text: '+2, если выходишь' },
    spray: { name: 'Спрей',        kind: 'dist', vals: [3, 1, -1], n: 2, text: 'вплотную +3 · средне +1 · далеко −1' },
    tap:   { name: 'Тап',          kind: 'dist', vals: [-1, 1, 3], n: 2, text: 'далеко +3 · средне +1 · вплотную −1' }
  };
  const DECK = [];
  for (const k in CARDS) for (let i = 0; i < CARDS[k].n; i++) DECK.push(k);

  /* ---------------- карты (локации) ----------------
     ct: позиции CT (site A/M/B, d — дистанция, b — бонус, когда держит угол)
     pp: позиции T после установки по точкам */
  const MAPS = {
    mirage: { name: 'Mirage', ctPct: 53, tag: 'Слегка за CT. Окно — рай для AWP', split: 1,
      ct: [
        ['a_tick', 'Тикет', 'A', 2, 0], ['a_stairs', 'Стейрс', 'A', 1, 1], ['a_fire', 'Фаербокс', 'A', 0, 0],
        ['m_win', 'Окно', 'M', 2, 1], ['m_con', 'Коннектор', 'M', 0, 0],
        ['b_bench', 'Бенч', 'B', 1, 0], ['b_market', 'Маркет', 'B', 0, 1], ['b_van', 'Вэн', 'B', 1, 0]],
      pp: { A: [['pA1', 'Палас', 1, 0], ['pA2', 'Рампа', 2, 0]], B: [['pB1', 'Апартаменты', 1, 0], ['pB2', 'Под балконом', 0, 0]] } },
    dust2: { name: 'Dust II', ctPct: 50, tag: 'Баланс. Аимовая карта, длинные линии', split: 1,
      ct: [
        ['a_long', 'Лонг с машины', 'A', 2, 1], ['a_goose', 'Гусь', 'A', 1, 1], ['a_plat', 'Плент A', 'A', 0, 0],
        ['m_doors', 'Мид-двери', 'M', 2, 0], ['m_short', 'Шорт', 'M', 1, 0],
        ['b_win', 'Окно B', 'B', 2, 1], ['b_back', 'Задний плент', 'B', 0, 0], ['b_car', 'Машина B', 'B', 0, 1]],
      pp: { A: [['pA1', 'Лонг', 2, 0], ['pA2', 'Шорт', 1, 0]], B: [['pB1', 'Туннели', 1, 0], ['pB2', 'За ящиками', 0, 0]] } },
    inferno: { name: 'Inferno', ctPct: 50, tag: 'Баланс. Узкие проходы, рай для ПП и молотовов', split: 1,
      ct: [
        ['a_pit', 'Пит', 'A', 2, 1], ['a_lib', 'Библиотека', 'A', 0, 0], ['a_arch', 'Арка', 'A', 1, 0],
        ['m_2mid', 'Второй мид', 'M', 1, 0], ['m_logs', 'Банан — логи', 'M', 1, 1],
        ['b_coff', 'Гробы', 'B', 0, 1], ['b_dark', 'Дарк', 'B', 1, 0], ['b_fount', 'Фонтан', 'B', 1, 0]],
      pp: { A: [['pA1', 'Аппарты', 0, 0], ['pA2', 'Шорт', 1, 0]], B: [['pB1', 'Банан', 1, 0], ['pB2', 'Нью-бокс', 0, 0]] } },
    nuke: { name: 'Nuke', ctPct: 54, tag: 'Сильно за CT. Быстрые ротации, Хевен', split: 1,
      ct: [
        ['a_heaven', 'Хевен', 'A', 2, 2], ['a_hut', 'Хат', 'A', 0, 1], ['a_mini', 'Мини', 'A', 1, 1],
        ['m_out', 'Аутсайд — гараж', 'M', 2, 1], ['m_secret', 'Секрет', 'M', 1, 1],
        ['b_vents', 'Венты', 'B', 0, 1], ['b_decon', 'Деконт', 'B', 1, 1], ['b_ramp', 'Рампа B', 'B', 1, 1]],
      pp: { A: [['pA1', 'Хат', 0, 0], ['pA2', 'Сквики', 1, 0]], B: [['pB1', 'Секрет', 1, 0], ['pB2', 'Деконт', 0, 0]] } },
    ancient: { name: 'Ancient', ctPct: 51, tag: 'Чуть за CT. Донат и Пещера — ближний бой', split: 1,
      ct: [
        ['a_donut', 'Донат', 'A', 0, 0], ['a_temple', 'Храм', 'A', 1, 1], ['a_main', 'A мейн', 'A', 2, 0],
        ['m_red', 'Красная комната', 'M', 1, 0], ['m_ct', 'Мид с CT', 'M', 2, 1],
        ['b_cave', 'Пещера', 'B', 0, 0], ['b_pillar', 'Пиллар', 'B', 1, 1], ['b_ramp', 'B рампа', 'B', 2, 0]],
      pp: { A: [['pA1', 'A мейн', 2, 0], ['pA2', 'Донат', 0, 0]], B: [['pB1', 'Пещера', 0, 0], ['pB2', 'Рампа', 2, 0]] } },
    anubis: { name: 'Anubis', ctPct: 47, tag: 'За T. Через мид сплит даёт +2', split: 2,
      ct: [
        ['a_heaven', 'Хевен A', 'A', 2, 0], ['a_con', 'Коннектор', 'A', 1, 0], ['a_plat', 'Плент A', 'A', 0, 0],
        ['m_bridge', 'Мост', 'M', 2, 0], ['m_canal', 'Канал', 'M', 1, 0],
        ['b_ruins', 'Руины', 'B', 1, 0], ['b_pillar', 'Пиллар', 'B', 0, 1], ['b_ebox', 'Электробокс', 'B', 0, 0]],
      pp: { A: [['pA1', 'A мейн', 1, 1], ['pA2', 'Хевен', 2, 1]], B: [['pB1', 'Руины', 1, 1], ['pB2', 'Лонг B', 2, 1]] } },
    cache: { name: 'Cache', ctPct: 53, tag: 'Слегка за CT. Длинный мид и A мейн', split: 1,
      ct: [
        ['a_quad', 'Квад', 'A', 1, 1], ['a_fork', 'Форклифт', 'A', 0, 0], ['a_hwy', 'Хайвей', 'A', 2, 0],
        ['m_white', 'Мид — белый ящик', 'M', 2, 1], ['m_z', 'Z-коннектор', 'M', 1, 0],
        ['b_check', 'Чекерс', 'B', 1, 0], ['b_heaven', 'Хевен B', 'B', 2, 1], ['b_hs', 'Хедшот', 'B', 0, 0]],
      pp: { A: [['pA1', 'A мейн', 2, 0], ['pA2', 'Сквики', 0, 0]], B: [['pB1', 'B мейн', 1, 0], ['pB2', 'Венты', 0, 0]] } }
  };
  const MAP_KEYS = Object.keys(MAPS);
  for (const k of MAP_KEYS) {
    const m = MAPS[k];
    m.key = k;
    m.ct = m.ct.map(([id, name, site, d, b]) => ({ id, name, site, d, b }));
    for (const s of ['A', 'B']) m.pp[s] = m.pp[s].map(([id, name, d, b]) => ({ id, name, d, b }));
  }
  const ctPos = (s, id) => MAPS[s.map].ct.find(p => p.id === id) || null;
  const ppPos = (s, site, id) => (MAPS[s.map].pp[site] || []).find(p => p.id === id) || null;

  /* ---------------- RNG ---------------- */
  function hashStr(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rnd) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  /* ---------------- состояние ---------------- */
  function freshInv(side) { return { prim: null, pist: DEFAULT_PISTOL[side], armor: 0, nades: { fl: 0, sm: 0, mo: 0, he: 0 }, kit: false }; }
  function create(seed) {
    const rnd = mulberry(hashStr(String(seed)));
    const s = {
      seed: String(seed), rnd, step: 'maps', n: 0, map: null, mapPicks: null, pool: null,
      knife: null, knifeWin: -1, round: 0, half: 0, score: [0, 0], sideOf: ['T', 'CT'],
      money: [800, 800], L: [1, 1], inv: [freshInv('T'), freshInv('CT')], hp: [100, 100], alive: [true, true],
      deck: [mkDeck(rnd), mkDeck(rnd)], extra: [0, 0], pickup: [null, null],
      R: null, log: [], batch: [], history: [], over: false, winner: -1
    };
    for (const d of s.deck) refill(d, 3, rnd);
    return s;
  }
  function mkDeck(rnd) { return { draw: shuffle(DECK.slice(), rnd), disc: [], hand: [] }; }
  function drawOne(d, rnd) {
    if (!d.draw.length) { d.draw = shuffle(d.disc, rnd); d.disc = []; }
    if (d.draw.length) d.hand.push(d.draw.pop());
  }
  function refill(d, n, rnd) { while (d.hand.length < n && (d.draw.length || d.disc.length)) drawOne(d, rnd); }

  const tSeat = s => s.sideOf[0] === 'T' ? 0 : 1;
  const ctSeat = s => 1 - tSeat(s);
  const weaponOf = (s, k) => s.inv[k].prim || s.inv[k].pist;
  const nadeCount = inv => NADE_KEYS.reduce((a, k) => a + inv.nades[k], 0);
  const nadeName = (k, side) => (k === 'mo' && side === 'CT') ? NADES.mo.nameCT : NADES[k].name;
  const nadePrice = (k, side) => (k === 'mo' && side === 'CT') ? NADES.mo.priceCT : NADES[k].price;

  /* ---------------- что сейчас выбирают ---------------- */
  function pending(s) {
    if (s.over) return { kind: 'over', seats: [false, false] };
    const t = tSeat(s);
    switch (s.step) {
      case 'maps': return { kind: 'maps', seats: [true, true] };
      case 'side': return { kind: 'side', seats: [s.knifeWin === 0, s.knifeWin === 1] };
      case 'buy': return { kind: 'buy', seats: [true, true] };
      case 'plan': case 'plan2': case 'fight': return { kind: s.step, seats: [true, true] };
      case 'plant': return { kind: 'plant', seats: [t === 0, t === 1] };
    }
    return { kind: s.step, seats: [false, false] };
  }

  /* ---------------- закупка ---------------- */
  function canBuyWeapon(side, id) { const w = W[id]; return !!w && (w.side === '*' || w.side === side); }
  // Цена списка покупок для игрока (с учётом подбора). Возвращает {cost, inv} или {err}
  function priceBuy(s, k, pick) {
    const side = s.sideOf[k];
    const inv = JSON.parse(JSON.stringify(s.inv[k]));
    let cost = 0, wu = 0;
    if (pick.pk && s.pickup[k]) { const w = s.pickup[k]; if (PISTOLS.includes(w)) inv.pist = w; else inv.prim = w; }
    const items = Array.isArray(pick.items) ? pick.items.slice(0, 12) : [];
    for (const it of items) {
      if (W[it]) {
        if (!canBuyWeapon(side, it)) return { err: 'нельзя за эту сторону' };
        if (PISTOLS.includes(it)) { if (inv.pist === it) continue; inv.pist = it; }
        else { if (inv.prim === it) continue; inv.prim = it; }
        cost += W[it].price;
      } else if (it === 'kev') { if (inv.armor >= 1) continue; inv.armor = 1; cost += 650; }
      else if (it === 'helm') { if (inv.armor >= 2) continue; cost += inv.armor === 1 ? 350 : 1000; inv.armor = 2; }
      else if (it === 'kit') { if (side !== 'CT' || inv.kit) continue; inv.kit = true; cost += 400; }
      else if (it === 'wu') { if (wu) continue; wu = 1; cost += 400; }
      else if (NADES[it]) {
        if (inv.nades[it] >= NADES[it].max || nadeCount(inv) >= 4) continue;
        inv.nades[it]++; cost += nadePrice(it, side);
      } else return { err: 'нет такого' };
    }
    if (cost > s.money[k]) return { err: 'не хватает денег', cost };
    return { cost, inv, wu };
  }

  /* ---------------- варианты в перестрелке ---------------- */
  function fightActs(s, k) {
    const R = s.R, c = R.contact, side = s.sideOf[k];
    if (!c) return [];
    if (c.type === 'retake') return side === 'T' ? ['hold', 'peek'] : ['hold', 'peek', 'defuse', 'back'];
    return ['hold', 'peek', 'back'];
  }
  function cardValue(card, ctx) {
    const c = CARDS[card]; if (!c) return 0;
    switch (c.kind) {
      case 'num': case 'hs': return c.val;
      case 'pre': return (ctx.act === 'hold' && ctx.oppAct === 'peek') ? 3 : 0;
      case 'cs': return ctx.act === 'peek' ? 2 : 0;
      case 'dist': return c.vals[ctx.dist];
    }
    return 0;
  }

  function valid(s, k, p) {
    const pd = pending(s);
    if (!pd.seats[k]) return p == null;
    if (!p || typeof p !== 'object') return false;
    const side = s.sideOf[k];
    switch (s.step) {
      case 'maps': return Array.isArray(p.m) && p.m.length === 2 && p.m[0] !== p.m[1] && p.m.every(x => MAPS[x]);
      case 'side': return p.side === 'T' || p.side === 'CT';
      case 'buy': return !priceBuy(s, k, p).err;
      case 'plan': if (side === 'T') return ['A', 'B', 'M'].includes(p.r); return !!ctPos(s, p.p);
      case 'plan2': if (side === 'T') return ['A', 'B'].includes(p.r); return !!ctPos(s, p.p);
      case 'plant': return !!ppPos(s, s.R.bomb.site, p.p);
      case 'fight': {
        if (!fightActs(s, k).includes(p.a)) return false;
        if (p.u != null && (!NADES[p.u] || s.inv[k].nades[p.u] < 1)) return false;
        const hand = s.deck[k].hand;
        if (hand.length) { if (!(Number.isInteger(p.c) && p.c >= 0 && p.c < hand.length)) return false; }
        return true;
      }
    }
    return false;
  }

  /* ---------------- главное: применить шаг ---------------- */
  function apply(s, picks) {
    s.n++;
    s.batch = [];
    switch (s.step) {
      case 'maps': doMaps(s, picks); break;
      case 'side': setSides(s, picks[s.knifeWin].side === 'T' ? s.knifeWin : 1 - s.knifeWin, 'knife'); startHalf(s); break;
      case 'buy': doBuy(s, picks); break;
      case 'plan': doPlan(s, picks, false); break;
      case 'plan2': doPlan(s, picks, true); break;
      case 'plant': doPlantPos(s, picks[tSeat(s)]); break;
      case 'fight': doFight(s, picks); break;
    }
    s.log.push(s.batch);
    return s.batch;
  }
  const ev = (s, e) => { s.batch.push(e); return e; };

  function doMaps(s, picks) {
    const pool = [picks[0].m[0], picks[0].m[1], picks[1].m[0], picks[1].m[1]];
    const i = Math.floor(s.rnd() * 4);
    s.mapPicks = [picks[0].m.slice(), picks[1].m.slice()];
    s.pool = pool; s.map = pool[i];
    ev(s, { t: 'map', pool, idx: i, map: s.map });
    // ножевой: карты 1–10 без повторов
    let a, b; do { a = 1 + Math.floor(s.rnd() * 10); b = 1 + Math.floor(s.rnd() * 10); } while (a === b);
    s.knife = [a, b]; s.knifeWin = a > b ? 0 : 1;
    ev(s, { t: 'knife', cards: [a, b], win: s.knifeWin });
    s.step = 'side';
  }
  function setSides(s, tK, why) { s.sideOf = tK === 0 ? ['T', 'CT'] : ['CT', 'T']; ev(s, { t: 'side', tSeat: tK, why }); }

  function startHalf(s) {
    s.half++;
    for (const k of [0, 1]) {
      s.inv[k] = freshInv(s.sideOf[k]);
      s.money[k] = s.half === 3 ? 10000 : 800;
      s.L[k] = 1; s.pickup[k] = null;
    }
    startRound(s);
  }
  function startRound(s) {
    s.round++;
    s.hp = [100, 100]; s.alive = [true, true]; s.extra = [0, 0];
    s.R = { moment: 0, contact: null, bomb: null, ctrlMid: false, split: 0, plan: null, seen: [false, false], kills: [0, 0], fights: 0 };
    s.step = 'buy';
    ev(s, { t: 'round', round: s.round, half: s.half, pistol: s.round === 1 || s.round === HALF + 1, decider: s.half === 3 });
  }

  function doBuy(s, picks) {
    const bought = [null, null];
    for (const k of [0, 1]) {
      const r = priceBuy(s, k, picks[k]);
      s.money[k] -= r.cost; s.inv[k] = r.inv; s.pickup[k] = null;
      if (r.wu) { s.extra[k] = 1; drawOne(s.deck[k], s.rnd); }
      bought[k] = { cost: r.cost, prim: r.inv.prim, pist: r.inv.pist, armor: r.inv.armor, nades: Object.assign({}, r.inv.nades), kit: r.inv.kit, wu: !!r.wu };
    }
    ev(s, { t: 'buy', bought });
    s.step = 'plan';
  }

  /* План. T выбирает A/B/M, CT позицию. plan2 — после того как T взял мид. */
  function doPlan(s, picks, second) {
    const R = s.R, t = tSeat(s), ct = 1 - t;
    const route = picks[t].r, pos = ctPos(s, picks[ct].p);
    R.moment++;
    R.plan = { route, pos: pos.id };
    const e = ev(s, { t: second ? 'plan2' : 'plan', tS: t, route, pos: pos.id, posName: pos.name, posSite: pos.site, posD: pos.d });
    const split = second ? MAPS[s.map].split : 0;
    if (route === 'M') {
      if (pos.site === 'M') { R.contact = mkContact('mid', 'M', pos.d, pos, 0); e.res = 'mid'; s.step = 'fight'; }
      else { R.ctrlMid = true; e.res = 'midfree'; s.step = 'plan2'; }
    } else if (pos.site === route) { R.contact = mkContact('entry', route, pos.d, pos, split); e.res = 'contact'; s.step = 'fight'; }
    else if (pos.site === 'M') { e.res = 'rotate'; plantBomb(s, route, 1); return; }
    else { e.res = 'plant'; plantBomb(s, route, 0); return; }
    checkClock(s);
  }
  function mkContact(type, site, dist, pos, split) { return { type, site, dist, pos: pos ? pos.id : null, posB: pos ? pos.b : 0, posName: pos ? pos.name : null, split, ex: 0 }; }

  function plantBomb(s, site, bonus) {
    const t = tSeat(s);
    s.R.bomb = { site, left: BOMB + (bonus || 0), prog: 0, pos: null, fast: !!bonus };
    s.R.contact = null;
    s.money[t] = Math.min(MAX_MONEY, s.money[t] + 300);
    ev(s, { t: 'plant', tS: t, site, by: t });
    s.step = 'plant';
  }
  function doPlantPos(s, p) {
    const R = s.R, pos = ppPos(s, R.bomb.site, p.p);
    R.bomb.pos = pos.id;
    R.contact = { type: 'retake', site: R.bomb.site, dist: pos.d, pos: pos.id, posB: pos.b, posName: pos.name, split: 0, ex: 0 };
    ev(s, { t: 'post', pos: pos.id, posName: pos.name, d: pos.d });
    s.step = 'fight';
  }

  function checkClock(s) {
    if (s.step === 'roundEnd' || s.R.bomb) return;
    if (s.R.moment >= CLOCK) endRound(s, ctSeat(s), 'time');
  }

  /* ---------------- перестрелка ---------------- */
  function power(s, k, ctx) {
    // ctx: {act, oppAct, dist, card, holdOK, holdBonus, flashed, defusing, retreating, split, smokeOwn}
    const w = W[weaponOf(s, k)], parts = [];
    let d = ctx.dist;
    parts.push({ l: `${w.name} · ${DIST[d].toLowerCase()}`, v: w.pow[d] });
    if (ctx.card) { const v = cardValue(ctx.card, { act: ctx.act, oppAct: ctx.oppAct, dist: d }); parts.push({ l: CARDS[ctx.card].name, v, card: ctx.card }); }
    if (ctx.hold) parts.push({ l: 'Держит угол', v: 2 });
    if (ctx.posB) parts.push({ l: 'Позиция', v: ctx.posB });
    if (ctx.split) parts.push({ l: 'Сплит через мид', v: ctx.split });
    if (w.perk === 'peek' && ctx.act === 'peek') parts.push({ l: 'M4A4: магазин', v: 1 });
    if (w.perk === 'hold' && ctx.act === 'hold') parts.push({ l: 'M4A1-S: точность', v: 1 });
    if (w.perk === 'awp' && ctx.act === 'peek') parts.push({ l: 'AWP на выходе', v: -1 });
    if (ctx.flashed) parts.push({ l: 'Ослеплён', v: -2 });
    if (ctx.defusing) parts.push({ l: ctx.smokeDef ? 'Дефьюз под дымом' : 'Дефьюзит', v: ctx.smokeDef ? 0 : -2 });
    if (ctx.retreating) parts.push({ l: 'Убегает', v: -1 });
    if (ctx.burned) parts.push({ l: 'Горит', v: -1 });
    return { total: parts.reduce((a, p) => a + p.v, 0), parts };
  }
  function damage(s, shooter, target, head) {
    const w = W[weaponOf(s, shooter)], ar = s.inv[target].armor;
    if (head) { if (w.hsHelm || ar < 2) return { dmg: 999, hs: true }; return { dmg: Math.round(w.head * w.pen), hs: true, helmet: true }; }
    return { dmg: Math.round(ar >= 1 ? w.hit * w.pen : w.hit), hs: false };
  }

  function doFight(s, picks) {
    const R = s.R, c = R.contact, t = tSeat(s), ct = 1 - t;
    const P = [picks[0], picks[1]];
    const act = [P[0].a, P[1].a], util = [P[0].u || null, P[1].u || null];
    const cards = [null, null];
    for (const k of [0, 1]) { const h = s.deck[k].hand; cards[k] = h.length && Number.isInteger(P[k].c) ? h[P[k].c] : null; }
    for (const k of [0, 1]) if (util[k]) s.inv[k].nades[util[k]]--;
    const e = ev(s, { t: 'fight', tS: t, ctype: c.type, site: c.site, dist: c.dist, posName: c.posName, ex: c.ex, act: act.slice(), util: util.slice(), cards: [null, null], weap: [weaponOf(s, 0), weaponOf(s, 1)], armor: [s.inv[0].armor, s.inv[1].armor], hp0: s.hp.slice(), notes: [] });
    R.seen = [true, true];
    R.fights++;

    // 1) гранаты до перестрелки
    const burned = [false, false];
    for (const k of [0, 1]) {
      const o = 1 - k;
      if (util[k] === 'he') { const d = s.inv[o].armor ? 22 : 35; hurt(s, o, d); e.notes.push({ k, txt: `HE: −${d} HP`, dmg: d, to: o }); }
      if (util[k] === 'mo' && (act[o] === 'hold' || act[o] === 'defuse')) { hurt(s, o, 20); burned[o] = true; e.notes.push({ k, txt: `${nadeName('mo', s.sideOf[k])}: выкурил, −20 HP`, dmg: 20, to: o }); }
      if (util[k] === 'mo' && !(act[o] === 'hold' || act[o] === 'defuse')) e.notes.push({ k, txt: `${nadeName('mo', s.sideOf[k])} мимо: он не стоял на месте` });
    }
    if (!s.alive[0] || !s.alive[1]) { e.out = 'nade'; settleDeaths(s, e, [util[0] === 'he' || util[0] === 'mo', util[1] === 'he' || util[1] === 'mo'], null); return; }

    // 2) взаимодействие действий
    const a = act[t], b = act[ct];
    let duel = null; // {chase: chaserSeat|null}
    let after = null;  // что делать, если оба живы
    if (c.type === 'retake') {
      if (b === 'back') { e.out = 'save'; endRound(s, t, 'save'); return; }
      if (a === 'hold' && b === 'hold') { e.out = 'standoff'; }
      else if (a === 'hold' && b === 'defuse') {
        if (burned[ct]) { e.out = 'defstop'; }
        else { R.bomb.prog++; e.out = 'defprog'; }
      } else duel = { chase: null };
    } else {
      if (a === 'back' && b === 'back') { e.out = 'bothback'; after = 'replan'; }
      else if (a === 'back') { e.out = 'tback'; after = 'replan'; if (b === 'peek' && c.dist < 2) duel = { chase: ct }; }
      else if (b === 'back') { e.out = 'ctback'; after = c.type === 'mid' ? 'midctrl' : 'plant'; if (a === 'peek' && c.dist < 2) duel = { chase: t }; }
      else if (a === 'hold' && b === 'hold') { e.out = 'standoff'; }
      else duel = { chase: null };
    }

    if (duel) {
      const smoke = [util[0] === 'sm', util[1] === 'sm'];
      let dist = c.dist; if ((smoke[0] || smoke[1]) && dist === 2) dist = 1;
      const ctx = [0, 1].map(k => {
        const o = 1 - k;
        const holdOK = act[k] === 'hold' && act[o] === 'peek' && !smoke[o] && !burned[k];
        let posB = 0;
        if (act[k] === 'hold' && !smoke[o] && !burned[k]) {
          if (c.type === 'retake' && k === t) posB = c.posB;
          if (c.type !== 'retake' && k === ct) posB = c.posB;
        }
        return {
          act: act[k], oppAct: act[o], dist, card: cards[k], hold: holdOK, posB,
          split: (k === t && c.type !== 'retake') ? c.split : 0,
          flashed: util[o] === 'fl', defusing: act[k] === 'defuse', smokeDef: act[k] === 'defuse' && smoke[k],
          retreating: duel.chase != null && duel.chase !== k, burned: burned[k]
        };
      });
      const pw = [power(s, 0, ctx[0]), power(s, 1, ctx[1])];
      e.pow = pw; e.duelDist = dist; e.chase = duel.chase;
      for (const k of [0, 1]) if (cards[k]) { e.cards[k] = cards[k]; useCard(s, k, P[k].c); }
      const diff = pw[0].total - pw[1].total;
      const hsCard = [cards[0] === 'hs', cards[1] === 'hs'];
      const shots = []; // [shooter, kill?, head?]
      if (duel.chase != null) {
        const ch = duel.chase, m = ch === 0 ? diff : -diff;
        if (m >= 3) shots.push([ch, true, hsCard[ch]]);
        else if (m >= 1) shots.push([ch, false, hsCard[ch]]);
        e.out2 = m >= 1 ? 'chasehit' : 'escaped';
      } else if (diff === 0) { shots.push([0, false, hsCard[0]], [1, false, hsCard[1]]); e.out2 = 'trade'; }
      else {
        const wk = diff > 0 ? 0 : 1, m = Math.abs(diff);
        shots.push([wk, m >= 3, hsCard[wk]]);
        e.out2 = m >= 3 ? 'kill' : 'hit'; e.winner = wk;
      }
      e.shots = [];
      for (const [sh, kill, head] of shots) {
        const o = 1 - sh;
        let r = damage(s, sh, o, head);
        if (W[weaponOf(s, sh)].perk === 'awp') r = { dmg: 999, hs: head, awp: true };
        const d = kill ? 999 : r.dmg;
        e.shots.push({ sh, to: o, dmg: Math.min(d, s.hp[o]), kill: kill || d >= s.hp[o], hs: r.hs && (kill || r.dmg >= s.hp[o] || r.helmet), helmet: !!r.helmet, awp: !!r.awp });
      }
      for (const sh of e.shots) hurt(s, sh.to, sh.dmg);
      if (!s.alive[0] || !s.alive[1]) { settleDeaths(s, e, [false, false], dist); return; }
    } else {
      for (const k of [0, 1]) if (cards[k]) e.cards[k] = null; // карта не сыграна
    }

    // 3) последствия, если оба живы
    c.ex++;
    if (c.type === 'retake') {
      R.bomb.left--;
      const need = s.inv[ct].kit ? 1 : 2;
      e.bombLeft = R.bomb.left; e.prog = R.bomb.prog; e.need = need;
      if (R.bomb.prog >= need) { endRound(s, ct, 'defuse'); return; }
      if (R.bomb.left <= 0) { s.alive[ct] = false; s.hp[ct] = 0; e.boom = true; endRound(s, t, 'bomb'); return; }
      return;
    }
    R.moment++;
    if (after === 'replan') { R.contact = null; R.ctrlMid = false; s.step = 'plan'; checkClock(s); return; }
    if (after === 'midctrl') { R.contact = null; R.ctrlMid = true; s.step = 'plan2'; checkClock(s); return; }
    if (after === 'plant') { if (R.moment > CLOCK) { endRound(s, ct, 'time'); return; } plantBomb(s, c.site, 0); return; }
    checkClock(s);
  }

  function useCard(s, k, idx) { const d = s.deck[k]; const [card] = d.hand.splice(idx, 1); d.disc.push(card); drawOne(d, s.rnd); }
  function hurt(s, k, d) { s.hp[k] = Math.max(0, s.hp[k] - d); if (s.hp[k] <= 0) s.alive[k] = false; }

  function settleDeaths(s, e, byNade, dist) {
    const R = s.R, t = tSeat(s), ct = 1 - t;
    const dead = [!s.alive[0], !s.alive[1]];
    e.dead = dead.slice();
    for (const k of [0, 1]) {
      const o = 1 - k;
      if (dead[o] && !dead[k]) {
        R.kills[k]++;
        const rw = byNade[k] ? 300 : W[weaponOf(s, k)].reward;
        s.money[k] = Math.min(MAX_MONEY, s.money[k] + rw);
        e.reward = e.reward || [0, 0]; e.reward[k] = rw;
        // подбор: убил вплотную или на средней и выжил
        if (dist != null && dist <= 1) {
          const oi = s.inv[o], cand = oi.prim || (oi.pist !== DEFAULT_PISTOL[s.sideOf[o]] ? oi.pist : null);
          if (cand) s.pendingPickup = { k, w: cand };
        }
      }
    }
    if (dead[0] && dead[1]) {
      // оба погибли: если бомба стоит — взрыв за T, иначе CT
      if (R.bomb) endRound(s, t, 'bomb'); else endRound(s, ct, 'elim');
      return;
    }
    if (dead[t]) {
      if (R.bomb) {
        // CT убил T после установки: хватит ли времени на дефьюз
        s.money[ct] = Math.min(MAX_MONEY, s.money[ct] + 50);
        const left = R.bomb.left - 1, need = (s.inv[ct].kit ? 1 : 2) - R.bomb.prog;
        e.bombLeft = left; e.need = need;
        if (left >= need) endRound(s, ct, 'defuse');
        else endRound(s, t, 'bomb', { ctSurvives: true });
      } else endRound(s, ct, 'elim');
      return;
    }
    endRound(s, t, 'elim');
  }

  const HOW = { elim: 'всех убил', time: 'время вышло', bomb: 'бомба взорвалась', defuse: 'бомбу разминировали', save: 'CT сохранился, бомба взорвалась' };
  function endRound(s, w, how, opt) {
    opt = opt || {};
    const R = s.R, t = tSeat(s), l = 1 - w;
    const big = how === 'bomb' || how === 'defuse' || how === 'save';
    const inc = [0, 0];
    inc[w] = big ? 3500 : 3250;
    inc[l] = 1400 + 500 * s.L[l];
    s.L[l] = Math.min(4, s.L[l] + 1);
    s.L[w] = Math.max(0, s.L[w] - 1);
    if (l === t && R.bomb) inc[l] += 600;
    for (const k of [0, 1]) s.money[k] = Math.min(MAX_MONEY, s.money[k] + inc[k]);
    // кто выжил, тот сохраняет снаряжение; погибший получает стандартный пистолет
    if (how === 'bomb' && !opt.ctSurvives) { const ct = 1 - t; s.alive[ct] = false; }
    for (const k of [0, 1]) if (!s.alive[k]) s.inv[k] = freshInv(s.sideOf[k]);
    s.score[w]++;
    const pk = s.pendingPickup && s.alive[s.pendingPickup.k] ? s.pendingPickup : null;
    s.pendingPickup = null;
    // лишнюю карту от разминки возвращаем: рука снова 3
    for (const k of [0, 1]) { const d = s.deck[k]; while (d.hand.length > 3) { const worst = worstCard(d.hand); d.disc.push(d.hand.splice(worst, 1)[0]); } refill(d, 3, s.rnd); }
    const endEv = ev(s, { t: 'end', tS: t, round: s.round, w, how, howText: HOW[how], inc, score: s.score.slice(), alive: s.alive.slice(), pickup: pk });
    s.history.push({ round: s.round, w, how, tSeat: t });
    s.R.contact = null;
    if (s.score[w] >= WIN_SCORE) { s.over = true; s.winner = w; s.step = 'over'; ev(s, { t: 'over', w }); return; }
    // смена сторон
    if (s.round === HALF || s.round === HALF * 2) {
      endEv.pickup = null; endEv.swap = true;
      if (s.round === HALF) setSides(s, 1 - t, 'swap');
      else { const tk = Math.floor(s.rnd() * 2); setSides(s, tk, 'decider'); }
      startHalf(s);
      return;
    }
    if (pk) s.pickup[pk.k] = pk.w;
    startRound(s);
  }
  function worstCard(hand) { let wi = 0, wv = 99; hand.forEach((c, i) => { const v = CARDS[c].kind === 'num' ? CARDS[c].val : 1.2; if (v < wv) { wv = v; wi = i; } }); return wi; }

  /* ---------------- бот ---------------- */
  function pickW(rnd, items) { let tot = 0; for (const [, w] of items) tot += w; let x = rnd() * tot; for (const [v, w] of items) { x -= w; if (x <= 0) return v; } return items[items.length - 1][0]; }
  function bestCard(s, k, act, dist, oppPeekP) {
    const hand = s.deck[k].hand; if (!hand.length) return -1;
    let bi = 0, bv = -99;
    hand.forEach((c, i) => {
      const C = CARDS[c]; let v;
      if (C.kind === 'pre') v = act === 'hold' ? 3 * oppPeekP : 0;
      else v = cardValue(c, { act, oppAct: 'peek', dist });
      if (C.kind === 'hs') v += 0.6;
      if (v > bv) { bv = v; bi = i; }
    });
    return bi;
  }
  function bot(s, k, rnd) {
    rnd = rnd || Math.random;
    const side = s.sideOf[k];
    switch (s.step) {
      case 'maps': { const ks = shuffle(MAP_KEYS.slice(), rnd); return { m: [ks[0], ks[1]] }; }
      case 'side': return { side: MAPS[s.map].ctPct >= 52 ? 'CT' : (MAPS[s.map].ctPct <= 48 ? 'T' : (rnd() < 0.5 ? 'T' : 'CT')) };
      case 'buy': return botBuy(s, k, rnd);
      case 'plan': case 'plan2': {
        const m = MAPS[s.map], wpn = W[weaponOf(s, k)];
        if (side === 'T') {
          if (s.step === 'plan2') return { r: rnd() < 0.5 ? 'A' : 'B' };
          return { r: pickW(rnd, [['A', 38], ['B', 38], ['M', 24]]) };
        }
        const site = pickW(rnd, s.step === 'plan2' ? [['A', 42], ['B', 42], ['M', 16]] : [['A', 36], ['B', 36], ['M', 28]]);
        const cands = m.ct.filter(p => p.site === site);
        let best = cands[0], bv = -99;
        for (const p of cands) { const v = wpn.pow[p.d] + p.b + rnd() * 2.5; if (v > bv) { bv = v; best = p; } }
        return { p: best.id };
      }
      case 'plant': {
        const wpn = W[weaponOf(s, k)], opts = MAPS[s.map].pp[s.R.bomb.site];
        let best = opts[0], bv = -99; for (const p of opts) { const v = wpn.pow[p.d] + p.b + rnd() * 1.5; if (v > bv) { bv = v; best = p; } }
        return { p: best.id };
      }
      case 'fight': return botFight(s, k, rnd);
    }
    return null;
  }
  function botBuy(s, k, rnd) {
    const side = s.sideOf[k], inv = s.inv[k];
    let m = s.money[k];
    const items = []; const pk = !!s.pickup[k] && (!inv.prim || W[s.pickup[k]].price > W[inv.prim].price);
    const have = pk ? s.pickup[k] : inv.prim;
    const add = (id, price) => { if (m >= price) { items.push(id); m -= price; return true; } return false; };
    const rifle = side === 'T' ? 'ak' : (rnd() < 0.5 ? 'm4a1' : 'm4a4');
    const armor = () => { if (inv.armor === 1) add('helm', 350); else if (inv.armor === 0) { if (!add('helm', 1000)) add('kev', 650); } };
    const nades = () => { const order = shuffle(['fl', 'sm', 'mo', 'he', 'fl'], rnd); for (const n of order) if (rnd() < 0.6) add(n, nadePrice(n, side)); };
    const pistolRound = s.round === 1 || s.round === HALF + 1;
    if (pistolRound) {
      const r = rnd();
      if (r < 0.4) add('kev', 650);
      else if (r < 0.7) { add(side === 'T' ? 'tec9' : 'five', 500); add('fl', 200); }
      else if (r < 0.85) { add('deagle', 700); }
      else { add('p250', 300); add('fl', 200); add('he', 300); }
      return { items, pk: false };
    }
    if (have && W[have].cat !== 'pistol' && W[have].price >= 1700) { armor(); if (side === 'CT' && !inv.kit) add('kit', 400); nades(); if (rnd() < 0.3) add('wu', 400); return { items, pk }; }
    const full = W[rifle].price + 1000 + 500;
    if (m >= 4750 + 1000 + 600 && rnd() < 0.25) { add('awp', 4750); armor(); if (side === 'CT') add('kit', 400); nades(); return { items, pk }; }
    if (m >= full) { add(rifle, W[rifle].price); armor(); if (side === 'CT' && !inv.kit) add('kit', 400); nades(); if (rnd() < 0.35) add('wu', 400); return { items, pk }; }
    // мало денег: эко или форс
    const force = (s.score[1 - k] >= WIN_SCORE - 1) || (s.round === HALF || s.round === HALF * 2) || rnd() < 0.3;
    if (force && m >= 1700) {
      const smg = side === 'T' ? pickW(rnd, [['mac10', 3], ['galil', m >= 2500 ? 3 : 0], ['sawed', 1], ['ump', 1]]) : pickW(rnd, [['mp9', 3], ['famas', m >= 2650 ? 3 : 0], ['mag7', 1], ['ump', 1]]);
      add(smg, W[smg].price); armor(); nades();
      return { items, pk };
    }
    if (m >= 1200 && rnd() < 0.5) { if (rnd() < 0.5) add('deagle', 700); else add(side === 'T' ? 'tec9' : 'five', 500); }
    return { items, pk };
  }
  function botFight(s, k, rnd) {
    const c = s.R.contact, side = s.sideOf[k], acts = fightActs(s, k), inv = s.inv[k], hp = s.hp[k];
    const has = n => inv.nades[n] > 0;
    let a, u = null;
    if (c.type === 'retake') {
      if (side === 'T') {
        a = pickW(rnd, [['hold', 58], ['peek', 42]]);
        if (a === 'hold' && has('mo') && rnd() < 0.55) u = 'mo';
        else if (a === 'peek' && has('fl') && rnd() < 0.6) u = 'fl';
        else if (has('he') && rnd() < 0.3) u = 'he';
      } else {
        const need = (inv.kit ? 1 : 2) - s.R.bomb.prog, left = s.R.bomb.left;
        const hopeless = hp < 35 && left <= need;
        if (hopeless && rnd() < 0.5) a = 'back';
        else a = pickW(rnd, [['defuse', left <= need ? 45 : 30], ['peek', 40], ['hold', left > need ? 25 : 8]]);
        if (a === 'peek' && has('fl') && rnd() < 0.7) u = 'fl';
        else if ((a === 'defuse' || a === 'peek') && has('sm') && rnd() < 0.6) u = 'sm';
        else if (has('he') && rnd() < 0.3) u = 'he';
      }
    } else if (side === 'T') {
      const time = CLOCK - s.R.moment;
      const backW = (time >= 3 && c.type === 'entry') ? (hp < 50 ? 35 : 18) : 4;
      a = pickW(rnd, [['peek', has('fl') || has('sm') ? 70 : 45], ['hold', c.type === 'mid' ? 30 : 18], ['back', backW]]);
      if (a === 'peek') { if (has('fl') && rnd() < 0.75) u = 'fl'; else if (has('sm') && rnd() < 0.6) u = 'sm'; else if (has('he') && rnd() < 0.4) u = 'he'; }
      if (a === 'hold' && has('he') && rnd() < 0.3) u = 'he';
    } else {
      if (!acts.includes('hold')) a = pickW(rnd, [['peek', 75], ['back', 25]]);
      else a = pickW(rnd, [['hold', c.type === 'mid' ? 50 : 68], ['peek', 20], ['back', hp < 45 ? 25 : 8]]);
      if (a === 'hold' && has('mo') && rnd() < 0.25) u = 'mo';
      else if (a === 'hold' && has('he') && rnd() < 0.3) u = 'he';
      else if (a === 'peek' && has('fl') && rnd() < 0.6) u = 'fl';
    }
    if (!acts.includes(a)) a = acts[0];
    const ci = bestCard(s, k, a === 'defuse' ? 'peek' : a, c.dist, side === 'CT' ? 0.55 : 0.4);
    return { a, u, c: ci < 0 ? undefined : ci };
  }

  /* ---------------- реплей ---------------- */
  function replay(seed, steps) {
    const s = create(seed);
    for (const p of steps) {
      const pd = pending(s); if (pd.kind === 'over') break;
      const pk = [pd.seats[0] ? p[0] : null, pd.seats[1] ? p[1] : null];
      if (!valid(s, 0, pk[0]) || !valid(s, 1, pk[1])) return { s, bad: true };
      apply(s, pk);
    }
    return { s, bad: false };
  }

  const api = { VERSION: 'kst-1', W, GEAR, NADES, NADE_KEYS, CARDS, MAPS, MAP_KEYS, DIST, CLOCK, BOMB, WIN_SCORE, HALF, PISTOLS, DEFAULT_PISTOL,
    create, pending, valid, apply, bot, replay, priceBuy, fightActs, cardValue, weaponOf, tSeat, ctSeat, nadeName, nadePrice, ctPos, ppPos, canBuyWeapon, mulberry, hashStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KST = api;
})(typeof window !== 'undefined' ? window : globalThis);
