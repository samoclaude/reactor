// Бот проходит дела (пошагово, по событиям лога): дверь, щиток барьера, сейф, щиток видеонаблюдения (с дела №11). Запуск из heist3d: node tests/walk.mjs "$PWD/src/logic.js" [с какого дела] [по какое]
// Кодов: 60 на делах 1–6, 20 на 7–10, 10 на больших; на каждом коде две попытки (разные старты, коды, провода)
const m = await import(process.argv[2]), from = +(process.argv[3] || 1), to = +(process.argv[4] || 21);
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let r = 777; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const all = Array.from({ length: 60 }, () => Array.from({ length: 4 }, () => ABC[Math.floor(rnd() * ABC.length)]).join(''));
for (let L = from - 1; L < to; L++) {
  const codes = all.slice(0, L < 6 ? 60 : L < 10 ? 20 : 10);
  let won = 0, fail = [], hacked = 0, cctvN = 0;
  for (const code of codes) for (let att = 0; att < 2; att++) {
    const lv = m.getLevel(code, L), st = m.startOf(lv, att);
    const cur = { safe: lv.safe ? m.safeFor(code, L, att) : null, panel: lv.gate >= 0 ? m.panelFor(code, L, att) : null };
    const path = m.solve(lv, { pos: st.s, t: 0, gem: false, note: lv.note < 0, open: lv.door < 0, gateOff: lv.gate < 0 });
    const s = m.newSim(lv, att), log = ['g'];
    if (lv.cctv >= 0) cctvN++;
    const ap = e => { log.push(e); if (!m.applyEv(lv, s, e, cur)) throw new Error('отказ ' + e + ' на ' + s.pos); };
    try {
      if (!path) throw new Error('нет пути со старта ' + st.s);
      ap('g');
      for (const c of path) {
        if (c === lv.door && !s.open) ap('o' + 'abcde');
        if (c === s.pos) ap('w'); else ap('M' + c.toString(36));
        if (s.caught) throw new Error('пойман: ' + s.caught + ' такт ' + s.t);
        // щиток: режет провода по правилам, этап за этапом
        if (lv.panel >= 0 && s.pos === lv.panel && !s.gateOff) for (const k of cur.panel.cuts) ap('c' + k);
        if (lv.safe && s.pos === lv.gem && !s.gem) for (const i of cur.safe.order) ap('k' + i);
        // щиток видеонаблюдения: подключиться, штурман вводит пароль — камеры выключены
        if (lv.cctv >= 0 && s.pos === lv.cctv && !s.camOff) { ap('j'); ap('v'); hacked++; }
      }
      if (s.won) won++; else fail.push(code + ':не дошёл');
    } catch (e) { fail.push(code + ':' + e.message); }
  }
  console.log(`дело ${L + 1}: дошли ${won} из ${codes.length * 2}${cctvN ? `, взламывали камеры ${hacked} из ${cctvN}` : ''}`, fail.slice(0, 3).join(' | '));
}
