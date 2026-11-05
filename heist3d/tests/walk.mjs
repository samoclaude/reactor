// Бот проходит дела 1–6 на 120 кодах (живое время). Запуск из heist3d: node tests/walk.mjs "$PWD/src/logic.js"
const m = await import(process.argv[2]);
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let r = 777; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const codes = Array.from({ length: 60 }, () => Array.from({ length: 4 }, () => ABC[Math.floor(rnd() * ABC.length)]).join(''));
for (let L = 0; L < 6; L++) {
  let won = 0, fail = [];
  for (const code of codes) for (let att = 0; att < 2; att++) {
    const lv = m.getLevel(code, L), st = m.startOf(lv, att);
    const cur = { safe: lv.safe ? m.safeFor(code, L, att) : null, panel: null }, door = lv.door >= 0 ? m.doorFor(code, L, att) : null;
    const path = m.solve(lv, { pos: st.s, t: 0, gem: false, note: lv.note < 0, open: lv.door < 0, gateOff: true });
    const s = m.newSim(lv, att), log = ['g'];
    const ap = e => { log.push(e); if (!m.applyEv(lv, s, e, cur)) throw new Error('отказ ' + e + ' на ' + s.pos); };
    try {
      ap('g');
      for (const c of path) {
        if (c === lv.door && !s.open) ap('o' + 'abcde');
        if (c === s.pos) ap('w'); else ap('M' + c.toString(36));
        if (s.caught) throw new Error('пойман: ' + s.caught + ' такт ' + s.t);
        if (lv.safe && s.pos === lv.gem && !s.gem) for (const i of cur.safe.order) ap('k' + i);
      }
      if (s.won) won++; else fail.push(code + ':не дошёл');
    } catch (e) { fail.push(code + ':' + e.message); }
  }
  console.log(`дело ${L + 1}: дошли ${won} из ${codes.length * 2}`, fail.slice(0, 3).join(' | '));
}
