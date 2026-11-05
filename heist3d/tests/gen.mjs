// Все дела 1–6 генерируются на 120 кодах и решаются обоими решателями. Запуск из heist3d: node tests/gen.mjs "$PWD/src/logic.js"
const P = process.argv[2];
const m = await import(P);
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let r = 12345; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const codes = Array.from({ length: 120 }, () => Array.from({ length: 4 }, () => ABC[Math.floor(rnd() * ABC.length)]).join(''));
for (let L = 0; L < 6; L++) {
  let ok = 0, fail = 0, ms = 0, best = [], rt = [], lm = [], starts = [], easy = 0;
  for (const c of codes) {
    const t0 = performance.now(); const lv = m.getLevel(c, L); ms += performance.now() - t0;
    if (!lv) { fail++; continue; }
    ok++; best.push(lv.best); rt.push(m.solveRT(lv)); lm.push(Object.keys(lv.deco).length); starts.push(lv.starts.length);
    if (lv.guards.length < m.diff(L).guards) easy++;
  }
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`дело ${L + 1}: ок ${ok}, нет ${fail}, упрощённых ${easy}, ${(ms / codes.length).toFixed(0)} мс/уровень, путь шагами ${avg(best)}, тактов вживую ${avg(rt)}, ориентиров ${avg(lm)}, стартов ${avg(starts)}`);
}
