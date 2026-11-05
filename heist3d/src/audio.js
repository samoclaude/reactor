// Звук. Пока синтезированные сигналы из 2D-версии; настоящие записи и объёмные шаги охраны — следующим шагом.
let soundOn = true, actx = null, master = null, noiseBuf = null;
export const setSound = v => { soundOn = !!v; };
export const isSound = () => soundOn;
export const audioCtx = () => actx;
export const masterNode = () => master;
export function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.7; master.connect(actx.destination);
    const len = actx.sampleRate * 0.5; noiseBuf = actx.createBuffer(1, len, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
export function tone(f, d, o = {}) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime + (o.at || 0), osc = actx.createOscillator(), g = actx.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t); if (o.slide) osc.frequency.exponentialRampToValueAtTime(f * o.slide, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.v || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + d + 0.05);
}
export function noise(d, o = {}) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime + (o.at || 0), s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = o.type || 'lowpass'; f.frequency.value = o.f || 800; g.gain.setValueAtTime(o.v || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.05);
}
export const sfxStep = () => noise(0.06, { f: 500, v: 0.18 });
export const sfxTurn = () => noise(0.05, { type: 'highpass', f: 2500, v: 0.08 });
export const sfxBump = () => tone(90, 0.12, { type: 'square', v: 0.08 });
export const sfxKey = () => tone(1400, 0.04, { type: 'square', v: 0.04 });
export const sfxBad = () => { tone(180, 0.25, { type: 'sawtooth', v: 0.08, slide: 0.7 }); };
export const sfxUnlock = () => { tone(660, 0.1, { type: 'triangle' }); tone(990, 0.18, { type: 'triangle', at: 0.08 }); noise(0.08, { type: 'highpass', f: 3000, v: 0.15, at: 0.02 }); };
export const sfxGem = () => { [0, 4, 7, 12].forEach((s, i) => tone(880 * Math.pow(2, s / 12), 0.2, { type: 'triangle', v: 0.1, at: i * 0.06 })); };
export const sfxNote = () => noise(0.18, { type: 'bandpass', f: 3000, v: 0.2 });
export const sfxAlarm = () => { for (let i = 0; i < 4; i++) { tone(700, 0.22, { type: 'square', v: 0.07, slide: 1.6, at: i * 0.26 }); } };
export const sfxWin = () => { [0, 4, 7, 12, 16].forEach((s, k) => tone(523 * Math.pow(2, s / 12), 0.4, { type: 'triangle', v: 0.13, at: k * 0.09 })); };
export const sfxPingRadar = () => { tone(1200, 0.25, { v: 0.1, slide: 0.5 }); tone(1200, 0.25, { v: 0.06, slide: 0.5, at: 0.35 }); };
export const sfxPing = () => { tone(784, 0.12, { v: 0.1 }); tone(1175, 0.2, { v: 0.09, at: 0.1 }); };
export const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
// шаги охранника: громкость и панорама зависят от того, где он относительно вора
export function sfxGuardStep(pan, vol) {
  if (!soundOn || !actx || vol < 0.02) return;
  const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(), p = actx.createStereoPanner();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = 320; g.gain.setValueAtTime(0.35 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  p.pan.value = Math.max(-1, Math.min(1, pan)); s.connect(f); f.connect(g); g.connect(p); p.connect(master); s.start(t); s.stop(t + 0.15);
}

export const ICON_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
export const ICON_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></svg>';
