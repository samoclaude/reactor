// Звук: только настоящие записи из assets/sfx (Freesound CC0 и голоса ElevenLabs — assets/CREDITS.md). Синтеза нет:
// пока запись не раскодировалась, звука просто нет. Раскодируются все записи после первого клика или клавиши.
const MASTER = 0.7;
let soundOn = true,
  vol = 1, // ползунок «Громкость» в настройках
  actx = null,
  master = null,
  ready = null; // промис: всё раскодировано
export const setSound = (v) => {
  soundOn = !!v;
  if (master)
    master.gain.setTargetAtTime(
      soundOn ? MASTER * vol : 0,
      actx.currentTime,
      0.03,
    );
};
export const isSound = () => soundOn;
export const setVolume = (v) => {
  vol = Math.max(0, Math.min(1, +v || 0));
  setSound(soundOn);
};
export function ensureAudio() {
  if (actx) {
    if (actx.state === "suspended" && !document.hidden) actx.resume();
    return;
  }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = soundOn ? MASTER * vol : 0;
    master.connect(actx.destination);
    ready = decodeAll();
  } catch (e) {
    actx = null;
  }
}
// дождаться записей (не дольше ms): сценка приезда не начнётся немой
export const whenReady = (ms) =>
  Promise.race([
    ready || Promise.resolve(),
    new Promise((r) => setTimeout(r, ms)),
  ]);
// вкладка в фоне — звук на паузе, вернулись — играет дальше
document.addEventListener("visibilitychange", () => {
  if (!actx) return;
  if (document.hidden) actx.suspend();
  else actx.resume();
});

/* ---------- музыка в меню: «SHADY» (Freesound CC0) — петля ровно 32 такта (106 ударов в минуту), без шва.
   Крутится вместе с фоном, в меню входит плавно, в игре стихает ---------- */
const MUSIC_V = 0.5,
  MUSIC_LOOP = (32 * 4 * 60) / 106; // секунд: конец петли (хвост mp3 после него не играем)
let musicOn = false;
export function setMusic(on) {
  on = !!on;
  if (on === musicOn) return;
  musicOn = on;
  musicMix();
}
const musicMix = () =>
  setLoop("menu_music", musicOn ? MUSIC_V : 0, 16000, 0, musicOn ? 0.25 : 0.4);

/* ---------- записи: файлы качаются сразу, раскодируются, когда появится звук ---------- */
const LOOPS = [
  "rain_house",
  "rain_van",
  "rain_van_light",
  "street_rain",
  "crickets",
  "snow",
  "storm_rain",
  "wind",
  "hum",
  "clock",
  "cello",
  "van_radio",
  "menu_music",
];
const FILES = [
  "steps_runner",
  "steps_guard",
  "steps_runner_stone",
  "steps_runner_carpet",
  "steps_guard_stone",
  "key",
  "denied",
  "lock",
  "safe_click",
  "safe_open",
  "snip",
  "creak",
  "door_metal",
  "gate_wood",
  "alarm",
  "paper",
  "thunder1",
  "thunder2",
  "car_dry",
  "car_wet",
  "car_snow",
  "car_away",
  "van_open",
  "van_close",
  "walk_street",
  "walk_snow",
  "run_street",
  "run_snow",
  "battery_swap",
  "breaker",
  "radio",
  "squelch",
  "jewel",
  "tick",
  "wardrobe",
  "curtain",
  "servo",
  "flash",
  "zap",
  "spark",
  "button",
  "plug",
  "laptop_key",
  "access",
  "page",
  "chair1",
  "chair2",
  "cloth1",
  "cloth2",
  "guard_who",
  "guard_stop",
  "radio_talk",
  "cough1",
  "cough2",
  "cough3",
  "heart",
  ...LOOPS,
];
const files = {},
  bufs = {};
FILES.forEach((n) => {
  files[n] = fetch(`assets/sfx/${n}.mp3`)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
});
function decodeAll() {
  const dec = (n) =>
    files[n]
      .then((a) => a && actx.decodeAudioData(a))
      .then((b) => {
        if (b) bufs[n] = b;
      })
      .catch(() => {});
  // фон (дождь, улица, гул…) и музыка меню стартуют разом, когда раскодированы все петли:
  // иначе длинная музыка вступала позже дождя. Короткие звуки — следом
  return Promise.all(LOOPS.map(dec)).then(() => {
    for (const n of LOOPS) if (bufs[n]) startLoop(n);
    return Promise.all(FILES.filter((n) => !LOOPS.includes(n)).map(dec));
  });
}
const num = (x, d) => (Number.isFinite(x) ? x : d);
const clamp1 = (x) => Math.max(-1, Math.min(1, num(x, 0)));
// сыграть запись. o: v — громкость, rate — скорость (и высота), pan — лево/право (-1..1), panTo/panAt/panDur — проезд
// (сторона меняется от pan к panTo), lp — глушить выше этой частоты (Гц), at — через сколько секунд, off/dur — кусок
// файла, fadeIn/fadeOut — плавный вход и выход (с), group — список, чтобы потом разом заглушить,
// local — звук самого фургона (иначе штурман слышит его через рацию вора). true — запись есть и запущена (или звук выключен)
export function play(name, o = {}) {
  const b = bufs[name];
  if (!b || !actx) return false;
  if (!soundOn) return true;
  try {
    const t = actx.currentTime + Math.max(0, num(o.at, 0)),
      s = actx.createBufferSource(),
      g = actx.createGain(),
      v = Math.max(0, num(o.v, 1)) * (where === "van" && !o.local ? 0.8 : 1);
    s.buffer = b;
    s.playbackRate.value = num(o.rate, 1);
    const len = num(o.dur, (b.duration - num(o.off, 0)) / s.playbackRate.value);
    if (o.fadeIn) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + o.fadeIn);
    } else g.gain.setValueAtTime(v, t);
    if (o.fadeOut) {
      g.gain.setValueAtTime(v, t + Math.max(0, len - o.fadeOut));
      g.gain.linearRampToValueAtTime(0, t + len);
    }
    let n = s;
    if (where === "van" && !o.local) {
      // штурман слышит особняк через рацию вора: узкая полоса, чуть тише
      for (const [type, f] of [
        ["highpass", 500],
        ["lowpass", 2800],
      ]) {
        const q = actx.createBiquadFilter();
        q.type = type;
        q.frequency.value = f;
        n.connect(q);
        n = q;
      }
    }
    if (o.lp) {
      const f = actx.createBiquadFilter();
      f.frequency.value = Math.max(100, num(o.lp, 16000));
      n.connect(f);
      n = f;
    }
    n.connect(g);
    n = g;
    if ((o.pan || o.panTo) && actx.createStereoPanner) {
      const p = actx.createStereoPanner();
      p.pan.setValueAtTime(clamp1(o.pan), t);
      if (o.panTo != null) {
        p.pan.setValueAtTime(clamp1(o.pan), t + num(o.panAt, 0));
        p.pan.linearRampToValueAtTime(
          clamp1(o.panTo),
          t + num(o.panAt, 0) + num(o.panDur, 1),
        );
      }
      n.connect(p);
      n = p;
    }
    n.connect(master);
    s.start(t, num(o.off, 0), o.dur);
    s.onended = () => n.disconnect();
    if (o.group) o.group.push({ s, g });
    return true;
  } catch (e) {
    return false;
  }
}
// разом заглушить группу звуков за tau секунд
function hush(group, tau) {
  if (!actx) return;
  const t = actx.currentTime;
  for (const { s, g } of group) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, tau);
    try {
      s.stop(t + tau * 5);
    } catch (e) {}
  }
  group.length = 0;
}
// шаги: в файле 6 шагов по 0,6 с, берётся случайный (не тот же, что в прошлый раз) и чуть другой высоты
const lastStep = {};
function step(name, o) {
  let k;
  do k = Math.floor(Math.random() * 6);
  while (k === lastStep[name]);
  lastStep[name] = k;
  return play(
    name,
    Object.assign(
      { off: k * 0.6, dur: 0.55, rate: 0.94 + Math.random() * 0.12 },
      o,
    ),
  );
}

/* ---------- фон: погода, гул, часы, напряжение — петли, громкость плавно меняется ---------- */
const loops = {};
let where = null,
  weather = "rain",
  humV = 0,
  humPan = 0,
  clockV = 0,
  clockPan = 0,
  tense = 0;
// фон по месту и погоде: петля → [громкость, глушить выше (Гц)]. В особняке всё за окнами — глухо
const AMB = {
  house: {
    rain: { rain_house: [0.12, 900] },
    clear: { crickets: [0.12, 1400] },
    snow: { snow: [0.27, 900], wind: [0.06, 700] },
    storm: {
      storm_rain: [0.14, 800],
      rain_house: [0.06, 900],
      wind: [0.08, 1000],
    },
  },
  // городские здания (музей, банк, ювелирка): как в особняке, но сверчков в городе почти не слышно
  city: {
    rain: { rain_house: [0.12, 900] },
    clear: { crickets: [0.04, 1000], wind: [0.03, 600] },
    snow: { snow: [0.25, 900], wind: [0.06, 700] },
    storm: {
      storm_rain: [0.14, 800],
      rain_house: [0.06, 900],
      wind: [0.08, 1000],
    },
  },
  // небоскрёб: высоко над улицей — ветер в стёклах, дождь по стеклу тише
  tower: {
    rain: { rain_house: [0.08, 1500], wind: [0.07, 800] },
    clear: { wind: [0.08, 700] },
    snow: { wind: [0.11, 800], snow: [0.1, 700] },
    storm: { storm_rain: [0.12, 1100], wind: [0.16, 1200] },
  },
  van: {
    rain: { rain_van_light: [0.3, 16000] },
    clear: { crickets: [0.2, 2500] },
    snow: { snow: [0.2, 1500], wind: [0.1, 900] },
    storm: { rain_van: [0.4, 16000], wind: [0.12, 1400] },
  },
  street: {
    rain: { street_rain: [0.35, 16000] },
    clear: { crickets: [0.25, 16000] },
    snow: { snow: [0.55, 16000], wind: [0.12, 16000] },
    storm: { storm_rain: [0.45, 16000], wind: [0.2, 16000] },
  },
};
function startLoop(n) {
  const s = actx.createBufferSource(),
    f = actx.createBiquadFilter(),
    g = actx.createGain(),
    p = actx.createStereoPanner ? actx.createStereoPanner() : null;
  s.buffer = bufs[n];
  s.loop = true;
  if (n === "menu_music" && s.buffer.duration > MUSIC_LOOP)
    s.loopEnd = MUSIC_LOOP;
  f.frequency.value = 16000;
  g.gain.value = 0;
  s.connect(f);
  f.connect(g);
  if (p) {
    g.connect(p);
    p.connect(master);
  } else g.connect(master);
  s.start();
  loops[n] = { f, g, p };
  mixLoops();
}
// одна петля: громкость, глушение, сторона; tau — как быстро меняется
function setLoop(n, v, lp, pan, tau = 0.15) {
  const l = loops[n];
  if (!l || !actx) return;
  const t = actx.currentTime;
  l.g.gain.setTargetAtTime(Math.max(0, num(v, 0)), t, tau);
  l.f.frequency.setTargetAtTime(num(lp, 16000), t, 0.15);
  if (l.p) l.p.pan.setTargetAtTime(clamp1(pan), t, 0.1);
}
const OWN = ["hum", "clock", "cello", "van_radio", "menu_music"]; // у этих петель своя громкость, не по погоде
// вор внутри здания (любого: особняк, город, небоскрёб)
const inside = () => where === "house" || where === "city" || where === "tower";
const humMix = () =>
  inside()
    ? setLoop("hum", humV, 16000, humPan, 0.3) // у вора — гул ближайшего лазера (гаснет мягко)
    : setLoop("hum", where === "van" ? 0.03 : 0, 900, 0); // в фургоне — тихо гудят мониторы
const clockMix = () =>
  setLoop(
    "clock",
    inside() ? clockV : 0,
    2500 + 8000 * clockV,
    clockPan,
  );
// виолончель напряжения: у вора и у штурмана, громче и ярче, когда охрана ближе
const celloMix = () =>
  setLoop(
    "cello",
    inside() || where === "van" ? 0.3 * tense : 0,
    500 + 2500 * tense,
    0,
    0.4,
  );
function mixLoops() {
  const m = (AMB[where] || {})[weather] || {};
  for (const n of LOOPS)
    if (!OWN.includes(n)) {
      const [v, lp] = m[n] || [0, 16000];
      setLoop(n, v, lp, 0, 0.3);
    }
  setLoop("van_radio", where === "van" ? 0.05 : 0, 3000, 0); // рация в фургоне тихо шипит
  humMix();
  clockMix();
  celloMix();
  musicMix();
}
// где слушатель: 'house' — вор в особняке, 'van' — штурман в фургоне, 'street' — сценка, null — тишина;
// погода: 'rain' | 'clear' | 'snow' | 'storm'
export function setAmbience(w, wx) {
  if (w === where && wx === weather) return;
  where = w;
  weather = wx;
  mixLoops();
}
// гул ближайшего излучателя лазера: громкость 0..1 и сторона
export function setHum(v, pan) {
  if (Math.abs(v - humV) < 0.004 && Math.abs(pan - humPan) < 0.03) return;
  humV = num(v, 0);
  humPan = num(pan, 0);
  humMix();
}
// тиканье ближайших напольных часов: громкость 0..1 и сторона
export function setClock(v, pan) {
  if (Math.abs(v - clockV) < 0.004 && Math.abs(pan - clockPan) < 0.03) return;
  clockV = num(v, 0);
  clockPan = num(pan, 0);
  clockMix();
}
// напряжение 0..1 — насколько близко охрана к вору: виолончель (у обоих) и стук сердца вора (только у вора)
let nextBeat = 0;
export function setTension(k) {
  k = Math.max(0, Math.min(1, num(k, 0)));
  if (Math.abs(k - tense) > 0.02 || (k === 0 && tense)) {
    tense = k;
    celloMix();
  }
  if (!actx || !soundOn || k < 0.35 || !inside()) return;
  const t = actx.currentTime;
  if (t < nextBeat) return;
  play("heart", { v: 0.2 + 0.4 * k, lp: 700 });
  nextBeat = t + 60 / (65 + 75 * k);
}
// гром после молнии: в особняке и фургоне глухой
export function sfxThunder(at = 0) {
  const o = { house: [0.5, 500], van: [0.6, 1200], street: [0.7, 16000] }[
    where
  ];
  if (o)
    play(Math.random() < 0.5 ? "thunder1" : "thunder2", {
      v: o[0],
      lp: o[1],
      at,
      rate: 0.9 + Math.random() * 0.2,
      local: true,
    });
}

/* ---------- сценки: звуки запускает сама сценка по своему времени (scenes.js, cues) ---------- */
const cutGroup = [];
// [секунда сценки, что сыграть]. Приезд: фургон въезжает справа и тормозит к 3,0 с, дверь отъезжает 3,1–3,7 с,
// вор идёт 3,6–6,0 с, затемнение с 5,5 с. Уход: бег 0–1,5 с, дверь закрывается 1,6–2,1 с, отъезд влево с 2,1 с, затемнение с 4,5 с
// вход здания: у особняка и музея — скрип железной калитки (кусок той же записи, что у двери хранилища),
// у банка и офиса — стальная служебная дверь (щелчок замка и петли), у ювелирки — деревянная створка ворот во двор
const sfxGate = (group, lot) =>
  lot === "bank" || lot === "office"
    ? play("door_metal", { v: 0.6, pan: -0.15, group })
    : lot === "jewelry"
      ? play("gate_wood", { v: 0.5, pan: -0.15, group })
      : play("creak", {
          v: 0.5,
          off: 0.35,
          dur: 1.1,
          fadeOut: 0.45,
          pan: -0.15,
          rate: 1.08,
          group,
        });
// gateAt — секунда, когда вор открывает калитку или дверь здания (своя у каждого здания), lot — какое здание
export function cutCues(kind, wx, gateAt, lot) {
  const snow = wx === "snow",
    group = cutGroup;
  const byTime = (list) => list.sort((a, b) => a[0] - b[0]);
  if (kind === "arrive")
    return byTime([
      [
        0,
        () =>
          play(snow ? "car_snow" : wx === "clear" ? "car_dry" : "car_wet", {
            v: 0.7,
            off: wx === "clear" ? 0.5 : 0,
            fadeIn: 0.6,
            pan: 0.7,
            panTo: 0.1,
            panDur: 3,
            group,
          }),
      ],
      [2.8, () => play("van_open", { v: 0.6, pan: 0.1, group })], // откат двери — 0,3–0,8 с записи
      [3.6, () => play(snow ? "run_snow" : "run_street", { v: 0.75, group })],
      [gateAt != null ? gateAt : 4.4, () => sfxGate(group, lot)], // калитка: вор распахивает её на бегу
      [Math.max(5.5, (gateAt || 0) + 0.9), () => hush(cutGroup, 0.25)], // у дальних входов — дать двери дозвучать
    ]);
  return byTime([
    [0, () => play(snow ? "run_snow" : "run_street", { v: 0.75, group })],
    [
      0.1,
      () =>
        play("car_away", {
          v: 0.7,
          pan: 0.1,
          panTo: -0.8,
          panAt: 2,
          panDur: 2.6,
          group,
        }),
    ], // разгон — с 2,1 с
    [gateAt != null ? gateAt : 0.2, () => sfxGate(group, lot)], // калитка на выходе
    [1.25, () => play("van_close", { v: 0.7, pan: 0.1, group })], // хлопок на 0,8 с записи — дверь доехала к 2,05 с
    [4.5, () => hush(cutGroup, 0.25)],
  ]);
}
// сценку пропустили или она кончилась: её звуки быстро затихают
export const sfxCutStop = () => hush(cutGroup, 0.12);

/* ---------- вор в здании ---------- */
// пол здания: wood — паркет (особняк), stone — мрамор и камень (музей, банк, ювелирка), carpet — ковролин (офис)
let floor = "wood";
export const setFloor = (f) => (floor = f);
// своя запись шагов по полу; пока не загрузилась — шаги по дереву
const stepName = (who) => {
  const n =
    who === "guard"
      ? floor === "stone"
        ? "steps_guard_stone"
        : "steps_guard"
      : floor === "wood"
        ? "steps_runner"
        : "steps_runner_" + floor;
  return bufs[n] ? n : who === "guard" ? "steps_guard" : "steps_runner";
};
// шаги: обычные слышно хорошо, с Shift — тихо, глуше и чуть ниже; остановка — мягкий последний шаг
export const sfxRunStep = (loud) =>
  step(
    stepName("runner"),
    loud
      ? { v: floor === "carpet" ? 0.42 : 0.5 }
      : { v: 0.22, lp: 1800, rate: 0.88 + Math.random() * 0.08 },
  );
export const sfxRunStop = () =>
  step(stepName("runner"), { v: 0.15, lp: 2200 });
// задел плечом стену — шорох куртки
export const sfxBump = () => play("cloth2", { v: 0.25, rate: 1.15 });
// штурман слышит шаги вора через рацию (по событиям перехода в клетку)
export const sfxNavStep = (loud) =>
  step(stepName("runner"), { v: loud ? 0.45 : 0.15 });
// вор наклоняется к панели, сейфу, записке и выпрямляется — шорох куртки
export const sfxCloth = (bend) =>
  play(bend ? "cloth1" : "cloth2", {
    v: 0.45,
    rate: 0.95 + Math.random() * 0.1,
  });
export const sfxKey = () => play("key", { v: 0.25 });
// неверный код, символ, провод — зуммер панели
export const sfxDenied = (at = 0) => play("denied", { v: 0.3, at });
// дверь хранилища: замок щёлкает, створка трогается и скрипит, пока поворачивается (~1,8 с)
export const sfxDoorOpen = () => {
  play("lock", { v: 0.8 });
  play("creak", { v: 0.45, at: 0.15, off: 0.4, dur: 1.7, fadeOut: 0.6 });
};
export const sfxSafeClick = () =>
  play("safe_click", { v: 0.6, rate: 0.95 + Math.random() * 0.1 });
export const sfxGem = (at = 0) => play("jewel", { v: 1, at });
export const sfxSafeOpen = () => {
  play("safe_open", { v: 0.7 });
  sfxGem(0.9);
};
// щиток: кусачки, на верном проводе щёлкает реле, на последнем — рубильник, барьер гаснет
export const sfxSnip = () =>
  play("snip", { v: 0.6, rate: 0.95 + Math.random() * 0.1 });
export const sfxRelay = () => play("breaker", { v: 0.25, rate: 1.6, at: 0.25 });
export const sfxBreaker = () => play("breaker", { v: 0.8, at: 0.4 });
// записка: взять (после наклона), достать, убрать — бумага
export const sfxNote = (at = 0, away = false) =>
  play("paper", { v: away ? 0.4 : 0.6, rate: away ? 1.15 : 1, at });
// укрытие: скрипит дверца шкафа или шуршит портьера
export const sfxHide = (kind, leaving) =>
  play(kind === "drape" ? "curtain" : "wardrobe", {
    v: kind === "drape" ? 1 : 0.5,
    rate: leaving ? 1.12 : 1,
  });
// фонарик мигает: щелчок, когда гаснет, и тише — когда снова загорается через sec секунд
export const sfxFlicker = (sec) => {
  play("flash", { v: 0.35, rate: 0.9 + Math.random() * 0.2 });
  play("flash", { v: 0.22, rate: 1.05, at: sec });
};
// замена батареек: крышка, батарейки, закрутил (1,8 с), на 2-й секунде щёлкнула кнопка — свет
export const sfxBattery = () => {
  play("battery_swap", { v: 0.7 });
  play("flash", { v: 0.35, at: 2 });
};
// камера наблюдения поворачивается — жужжит моторчик (тише издалека и за стеной)
export const sfxServo = (pan, vol, wall) =>
  vol > 0.02 &&
  play("servo", {
    v: 0.6 * vol * (wall ? 0.6 : 1),
    pan,
    lp: wall ? 500 : 1500 + 6000 * vol,
    rate: 0.9 + Math.random() * 0.2,
  });
// последние секунды — тикают часы
export const sfxTick = () => play("tick", { v: 0.5, local: true });
// вор ушёл через служебную дверь — скрип деревянной двери
export const sfxExitDoor = () => play("wardrobe", { v: 0.6, rate: 0.8 });
// поимка: сначала своя причина (удар тока, искры щитка, рывок камеры, зуммер сейфа), за ней сирена
const alarmGroup = [];
export function sfxAlarm(kind) {
  const pre = {
    laser: "zap",
    gate: "zap",
    panel: "spark",
    cam: "servo",
    safe: "denied",
  }[kind];
  if (pre)
    play(pre, {
      v: pre === "servo" ? 0.7 : 0.8,
      rate: pre === "servo" ? 1.4 : 1,
      group: alarmGroup,
    });
  play("alarm", {
    v: 0.32,
    at: pre || kind === "guard" ? 0.35 : 0,
    group: alarmGroup,
  });
}
// «Ещё раз» или следующее дело — сирена смолкает
export const sfxAlarmStop = () => hush(alarmGroup, 0.1);
// охрана услышала — у штурмана трещит рация (у вора охранник говорит сам)
export const sfxRadio = () => play("radio", { v: 1 });

/* ---------- охранник ---------- */
// шаги: громкость и сторона зависят от того, где он относительно вора; издалека и из-за стены — глуше
export function sfxGuardStep(pan, vol, wall) {
  if (vol < 0.02) return;
  // по ковролину ботинки глухие и тише
  const carpet = floor === "carpet";
  step(stepName("guard"), {
    v: 0.9 * vol * (wall ? 0.6 : 1) * (carpet ? 0.6 : 1),
    pan,
    lp: wall ? 450 : carpet ? 900 + 2500 * vol : 700 + 9000 * vol * vol,
  });
}
// голос, кашель, рация — с его стороны, издалека тише и глуше, из-за стены — совсем глухо
export const sfxGuardSay = (name, pan, vol, wall) =>
  vol > 0.02 &&
  play(name, {
    v: vol * (wall ? 0.7 : 1),
    pan,
    lp: wall ? 600 : 900 + 9000 * vol * vol,
  });

/* ---------- фургон штурмана ---------- */
// пеленг: кнопка, щелчок рации, кнопку отпустили; через 3 с метка гаснет — рация тихо щёлкает
export const sfxPingRadar = () => {
  play("button", { v: 0.6, local: true });
  play("squelch", { v: 0.45, at: 0.12, local: true });
  play("button", { v: 0.3, rate: 1.2, at: 0.18, local: true });
};
export const sfxPingEnd = () =>
  play("squelch", { v: 0.2, rate: 1.15, local: true });
// кнопка щёлкнула впустую (пеленг кончился)
export const sfxPingFail = () =>
  play("button", { v: 0.35, rate: 0.8, local: true });
// напарник подключился — щелчок рации
export const sfxPing = () => play("squelch", { v: 0.4, local: true });
export const sfxFolder = () => play("paper", { v: 0.5, local: true });
export const sfxPage = (v = 0.6) =>
  play("page", { v, rate: 0.9 + Math.random() * 0.2, local: true });
// наклонился к планшету или откинулся назад — скрип кресла
export const sfxTablet = (zoomIn) =>
  play(zoomIn ? "chair1" : "chair2", { v: zoomIn ? 0.35 : 0.25, local: true });
// кнопки меню и экранов — тихий щелчок
export const sfxUi = () => play("button", { v: 0.2, rate: 1.1, local: true });
// взлом камер: вор втыкает шнур в щиток (штурман слышит через рацию), клавиши ноутбука и сигнал «доступ получен» — в фургоне
export const sfxPlug = () => play("plug", { v: 0.7 });
export const sfxLapKey = () =>
  play("laptop_key", { v: 0.4, rate: 0.9 + Math.random() * 0.25, local: true });
export const sfxAccess = () => play("access", { v: 0.25, local: true });

export const ICON_ON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
export const ICON_OFF =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></svg>';
