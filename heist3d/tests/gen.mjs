// Все дела генерируются и решаются обоими решателями. Запуск из heist3d: node tests/gen.mjs "$PWD/src/logic.js" [с какого дела] [по какое]
// Кодов: 120 на делах 1–6, 40 на 7–10, 20 на больших (там генерация дольше)
const P = process.argv[2], from = +(process.argv[3] || 1), to = +(process.argv[4] || 21);
const m = await import(P);
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let r = 12345; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const all = Array.from({ length: 120 }, () => Array.from({ length: 4 }, () => ABC[Math.floor(rnd() * ABC.length)]).join(''));
for (let L = from - 1; L < to; L++) {
  const codes = all.slice(0, L < 6 ? 120 : L < 10 ? 40 : 20);
  let ok = 0, fail = 0, ms = 0, best = [], rt = [], lm = [], starts = [], easy = 0, msMax = 0;
  for (const c of codes) {
    const t0 = performance.now(); const lv = m.getLevel(c, L), dt = performance.now() - t0; ms += dt; msMax = Math.max(msMax, dt);
    if (!lv) { fail++; continue; }
    ok++; best.push(lv.best); rt.push(m.solveRT(lv)); lm.push(Object.keys(lv.deco).length); starts.push(lv.starts.length);
    if (lv.guards.length < m.diff(L).guards) easy++;
  }
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`дело ${L + 1}: ок ${ok} из ${codes.length}, нет ${fail}, упрощённых ${easy}, ${(ms / codes.length).toFixed(0)} мс/уровень (дольше всего ${msMax.toFixed(0)}), путь шагами ${avg(best)}, тактов вживую ${avg(rt)}, ориентиров ${avg(lm)}, стартов ${avg(starts)}`);
}
