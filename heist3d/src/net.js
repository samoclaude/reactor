// Онлайн через Supabase Realtime: broadcast + presence, без таблиц. Перенесено из 2D-версии без изменений логики:
// внутри дела пишет лог событий только компьютер вора; рестарт и следующее дело поднимают (lvl, att), побеждает старшее состояние.
import { EV_RE } from './logic.js';
const SB_URL = 'https://ulfqprrjdyycznobirxw.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsZnFwcnJqZHl5Y3pub2Jpcnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3OTg4NTMsImV4cCI6MjEwOTM3NDg1M30.zIjRlMNnqg59jZRprHcCoIkoBiIis45vw5vP4bhF_tc';
const APP = 'heist3d';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch (e) {} }
};
const sess = {
  get(k) { try { return sessionStorage.getItem(APP + ':' + k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(APP + ':' + k, v); } catch (e) {} }
};
let BUILD = '', toast = () => {};
// связь с игрой: reset(mode), sync(full), ui(), started(firstOk), hideOverlays(keepBrief), handleCode(rid, val), checkPeerBuild(v),
// hack(val) — пароль щитка видеонаблюдения от штурмана; pz(from, on, t0, lvl, att) — напарник не готов (пауза): 1 меню, 2 брифинг, 3 сценка, 4 вор свернул вкладку; myPz() — то же про меня
let H = {};
export function initNet(hooks, build, toastFn) { H = hooks; BUILD = build; toast = toastFn; }
export const net = { on: false, code: null, room: null, ch: null, status: 'off', online: new Set(), presence: null, lastSeen: {}, peerKey: {}, wasStarted: false, everOk: false, errorMsg: '', lastHello: 0, presenceSeen: false, pending: null, timers: {}, skew: null };
let sb = null;
export let myId = null;
export function rid(n) { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(n); try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < n; i++) b[i] = Math.random() * 256; } let s = ''; for (const x of b) s += a[x % a.length]; return s; }
export const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode() { const b = new Uint8Array(4); try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 4; i++) b[i] = Math.random() * 256; } let s = ''; for (const x of b) s += CODE_ABC[x % CODE_ABC.length]; return s; }
const CYR = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X' };
export const normCode = s => String(s || '').toUpperCase().replace(/[А-ЯЁ]/g, ch => CYR[ch] || '').replace(/[^A-Z0-9]/g, '').slice(0, 4);
// битый %-код в ссылке (бывает при копировании из мессенджера) — выкидываем его, а не падаем
export function codeFromHash() { let h = location.hash.slice(1); try { h = decodeURIComponent(h); } catch (e) { h = h.replace(/%[0-9a-f]{2}/gi, ''); } const c = normCode(h); return c.length === 4 ? c : null; }
export const myName = () => String(store.get('name', '') || '').trim().slice(0, 12);
let tabBus = null;
try { tabBus = new BroadcastChannel(APP + '-tabs'); tabBus.onmessage = e => { const d = e.data || {}; if (d.q === 'who' && myId && d.id === myId) tabBus.postMessage({ a: 'mine', id: myId }); }; } catch (e) {}
export function getIdentity() {
  return new Promise(res => {
    if (myId) return res(myId);
    const s = sess.get('cid'); if (s) { myId = s; return res(s); }
    let cand = store.get('cid', null) || rid(10);
    if (!tabBus) { myId = cand; sess.set('cid', cand); store.set('cid', cand); return res(cand); }
    let taken = false; const h = e => { const d = e.data || {}; if (d.a === 'mine' && d.id === cand) taken = true; };
    tabBus.addEventListener('message', h); tabBus.postMessage({ q: 'who', id: cand });
    setTimeout(() => { tabBus.removeEventListener('message', h); if (taken) cand = rid(10); else store.set('cid', cand); myId = cand; sess.set('cid', cand); res(cand); }, 180);
  });
}
const filled = r => r.seats.filter(Boolean).length;
// дело идёт, когда оба на местах и кто-то нажал «Начинаем» (до этого — выбор ролей)
export const started = r => !!r && r.seats.every(Boolean) && !!r.go;
export const bothIn = r => !!r && r.seats.every(Boolean);
export const mySeat = () => (net.on && net.room && myId) ? net.room.seats.indexOf(myId) : -1;
// кто вор: место 0 или 1 (сначала тот, кто создал комнату); меняется кнопкой «Поменяться ролями»
export const thiefSeat = r => (r && r.thief ? 1 : 0);
export function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
// версия ролей: больше rv — новее; при равной (нажали одновременно) новее та, где go, потом где thief — одинаково у обоих
const rolesKey = r => [r.rv | 0, r.go ? 1 : 0, (r.thief | 0) ? 1 : 0];
export const roomKey = r => [r.lvl, r.att, r.log.length, filled(r), ...rolesKey(r)];
export const inviteUrl = () => location.origin + location.pathname + location.search + '#' + (net.code || '');
export function sanitize(s) {
  const fit = (a, f) => [0, 1].map(i => (Array.isArray(a) && a[i] != null) ? f(a[i]) : null);
  return {
    code: s.code, host: s.host || null,
    seats: fit(s.seats, x => String(x).slice(0, 24)), names: fit(s.names, x => String(x).slice(0, 12)),
    lvl: Math.max(0, Math.min(999, s.lvl | 0)), att: Math.max(0, s.att | 0), best: Math.max(0, s.best | 0), t0: +s.t0 || 0,
    thief: (s.thief | 0) ? 1 : 0, rv: Math.max(0, s.rv | 0), go: s.go ? 1 : 0,
    log: (Array.isArray(s.log) ? s.log : []).map(String).filter(x => EV_RE.test(x)).slice(0, 8000)
  };
}
export function saveRoom() { if (net.room) store.set('room:' + net.code, net.room); }
function getClient() {
  if (sb) return sb;
  if (!window.supabase || !window.supabase.createClient) throw new Error('nolib');
  sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 30 } } });
  return sb;
}
export function send(t, data) { if (!net.ch) return; try { const p = net.ch.send({ type: 'broadcast', event: 'm', payload: Object.assign({ t, from: myId }, data || {}) }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
export function hello() {
  clearTimeout(net.timers.hello);
  const wait = Math.max(120, 1500 - (Date.now() - net.lastHello));
  net.timers.hello = setTimeout(() => { net.lastHello = Date.now(); send('hello', { name: myName() || null, v: BUILD }); }, wait);
}
// Presence is tracked once per join and never updated: re-tracking makes the realtime client drop the key.
function trackOnce() { if (!net.ch || net.status !== 'ok') return; try { const p = net.ch.track({ on: 1 }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
export function ping() { if (!net.ch) return; const r = net.room; if (net.status === 'ok') send('ping', { k: r ? roomKey(r) : null, v: BUILD, pz: H.myPz ? H.myPz() | 0 : 0, now: Date.now() }); recomputeOnline(); }
function recomputeOnline() {
  if (!net.ch) return;
  let stt = {}; try { stt = net.ch.presenceState() || {}; } catch (e) {}
  const now = Date.now(), pres = new Set(Object.keys(stt));
  if (net.presence) for (const id of net.presence) if (!pres.has(id)) delete net.lastSeen[id];
  net.presence = pres;
  const on = new Set(pres);
  for (const id in net.lastSeen) if (now - net.lastSeen[id] < 13000) on.add(id);
  const r = net.room;
  if (r && net.wasStarted && net.presenceSeen) {
    r.seats.forEach((id, k) => {
      if (!id || id === myId) return;
      const was = net.online.has(id), is = on.has(id), nm = r.names[k] || 'Напарник';
      if (was && !is) toast(`${nm}: нет связи`);
      if (!was && is) toast(`${nm} снова на связи`);
    });
  }
  const changed = on.size !== net.online.size || [...on].some(x => !net.online.has(x));
  net.online = on; net.presenceSeen = true;
  if (changed) refreshOnline();
}
export function amActingHost() {
  const r = net.room; if (!r) return false;
  for (const id of r.seats) if (id && (id === myId || net.online.has(id))) return id === myId;
  const cands = [...net.online, myId].filter(k => k === myId || net.peerKey[k]).sort();
  return cands[0] === myId;
}
export async function joinRoom(code, room) {
  code = normCode(code);
  if (code.length !== 4) { toast('Код комнаты: 4 символа'); return; }
  if (net.on && net.code === code) { showRoomPanel(); return; }
  if (net.on) leaveRoom();
  await getIdentity();
  H.reset('online');
  Object.assign(net, { on: true, code, room: null, ch: null, status: 'connecting', online: new Set(), presence: null, lastSeen: {}, peerKey: {}, wasStarted: false, everOk: false, errorMsg: '', lastHello: 0, presenceSeen: false, pending: null, skew: null });
  if (room) { room.code = code; room.host = myId; room.seats[0] = myId; room.names[0] = myName() || null; net.room = room; }
  else { const snap = store.get('room:' + code, null); if (snap && snap.code === code && Array.isArray(snap.seats)) net.room = sanitize(snap); }
  if (codeFromHash() !== code) { try { history.replaceState(null, '', '#' + code); } catch (e) { try { location.hash = code; } catch (e2) {} } }
  if (net.room) { saveRoom(); H.sync(true); }
  showRoomPanel(); connect();
}
export function createRoom(lvl) { joinRoom(newCode(), { code: '', host: null, seats: [null, null], names: [null, null], lvl: Math.max(0, lvl | 0), att: 0, best: 0, t0: 0, log: [], thief: 0, rv: 0, go: 0 }); }
// поменяться ролями: новая версия ролей уходит напарнику, у кого версия старше — того и правда
export function startGame() {
  const r = net.room; if (!r || !bothIn(r) || r.go) return;
  r.go = 1; r.rv = (r.rv | 0) + 1; saveRoom();
  send('roles', { thief: thiefSeat(r), rv: r.rv, go: 1 });
  H.sync(); refreshOnline();
}
export function setThief(seat) {
  const r = net.room; if (!r) return;
  r.thief = seat ? 1 : 0; r.rv = (r.rv | 0) + 1; saveRoom();
  send('roles', { thief: r.thief, rv: r.rv, go: r.go });
  H.sync(); if (H.roles) H.roles(); refreshOnline();
}
const NET_ERR = 'Не получается подключиться к серверу. Проверь интернет. В превью внутри Claude онлайн не работает, только на опубликованном сайте.';
export function connect() {
  let client;
  try { client = getClient(); } catch (e) { net.status = 'error'; net.errorMsg = 'Не загрузился модуль связи. Проверь интернет и обнови страницу.'; refreshOnline(); return; }
  const ch = client.channel(APP + '-' + net.code, { config: { broadcast: { self: false, ack: false }, presence: { key: myId } } });
  net.ch = ch;
  ch.on('broadcast', { event: 'm' }, msg => { if (net.ch === ch) onMsg((msg && msg.payload) || {}); });
  ch.on('presence', { event: 'sync' }, () => { if (net.ch === ch) onPresence(); });
  ch.subscribe(status => {
    if (net.ch !== ch) return;
    if (status === 'SUBSCRIBED') {
      net.status = 'ok'; net.everOk = true; net.errorMsg = '';
      trackOnce(); hello(); ping();
      clearTimeout(net.timers.find);
      net.timers.find = setTimeout(() => { if (net.on && !net.room) { net.errorMsg = 'Комната не найдена. Возможно, её создатель вышел. Попроси новый код.'; refreshOnline(); } }, 7000);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      net.status = 'lost'; if (!net.everOk) net.errorMsg = NET_ERR;
    }
    refreshOnline();
  });
  clearInterval(net.timers.ping); net.timers.ping = setInterval(ping, 4000);
  clearTimeout(net.timers.conn);
  net.timers.conn = setTimeout(() => { if (net.ch === ch && !net.everOk) { net.errorMsg = NET_ERR; refreshOnline(); } }, 9000);
}
export function leaveRoom() {
  const ch = net.ch; net.ch = null;
  if (ch) { try { ch.untrack(); } catch (e) {} try { sb && sb.removeChannel(ch); } catch (e) {} }
  Object.values(net.timers).forEach(t => { clearTimeout(t); clearInterval(t); });
  Object.assign(net, { on: false, code: null, room: null, status: 'off', online: new Set(), presence: null, lastSeen: {}, peerKey: {}, wasStarted: false, everOk: false, errorMsg: '', pending: null });
  H.reset('idle');
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
}
function onMsg(m) {
  if (!m || !m.t || !m.from || m.from === myId) return;
  net.lastSeen[m.from] = Date.now();
  if (!net.online.has(m.from)) recomputeOnline();
  if (m.t === 'ping' || m.t === 'hello') H.checkPeerBuild(m.v);
  const r = net.room;
  switch (m.t) {
    case 'ping': {
      net.peerKey[m.from] = Array.isArray(m.k) ? m.k : null;
      if (H.pz) H.pz(m.from, m.pz | 0);
      // разница часов вора и моих: задержка сети её занижает — берём наибольшую, понемногу забывая старую
      if (r && +m.now && r.seats[thiefSeat(r)] === m.from) { const d = +m.now - Date.now(); net.skew = net.skew == null ? d : Math.max(d, net.skew - 200); }
      if (!Array.isArray(m.k)) { if (r && r.seats.includes(myId)) send('state', { room: r }); break; }
      if (!r) { hello(); break; }
      const c = cmpKey(m.k.map(x => x | 0), roomKey(r));
      if (c > 0) hello(); else if (c < 0 && r.seats.includes(myId)) send('state', { room: r });
      break;
    }
    case 'hello': onHello(m); break;
    case 'state': adoptState(m.room); break;
    case 'ev': {
      if (!r) { hello(); break; }
      const lvl = m.lvl | 0, att = m.att | 0, seq = m.seq | 0, e = String(m.e || '');
      if (lvl !== r.lvl || att !== r.att) { if (lvl > r.lvl || (lvl === r.lvl && att > r.att)) hello(); break; }
      if (r.seats[thiefSeat(r)] !== m.from || !EV_RE.test(e)) break;
      if (m.t0) r.t0 = +m.t0 || r.t0;
      if (seq === r.log.length) { r.log.push(e); saveRoom(); H.sync(); }
      else if (seq > r.log.length) hello();
      break;
    }
    case 'req': {
      if (!r || mySeat() !== thiefSeat(r) || (m.lvl | 0) !== r.lvl || (m.att | 0) !== r.att) break;
      const ridv = String(m.rid || '').replace(/[^a-z0-9]/g, '').slice(0, 8), val = String(m.val || '').replace(/\D/g, '').slice(0, 3);
      if (ridv.length >= 3 && val.length === 3) H.handleCode(ridv, val);
      break;
    }
    // пароль щитка видеонаблюдения от штурмана: проверяет и пишет событие компьютер вора
    case 'hack': {
      if (!r || mySeat() !== thiefSeat(r) || (m.lvl | 0) !== r.lvl || (m.att | 0) !== r.att) break;
      const val = String(m.val || '').replace(/\D/g, '').slice(0, 4);
      if (val.length === 4 && H.hack) H.hack(val);
      break;
    }
    case 'name': { if (!r) break; const k = r.seats.indexOf(m.from); if (k < 0) break; r.names[k] = m.name ? String(m.name).slice(0, 12) : null; saveRoom(); refreshOnline(); break; }
    case 'pose': if (H.pose) H.pose(m); break;
    // пауза: напарник открыл или закрыл меню; вор после паузы присылает сдвинутое начало попытки
    case 'pz': if (H.pz) H.pz(m.from, m.on | 0, +m.t0 || 0, m.lvl | 0, m.att | 0); break;
    case 'roles': {
      if (!r || cmpKey(rolesKey(m), rolesKey(r)) <= 0) break;
      r.thief = (m.thief | 0) ? 1 : 0; r.rv = m.rv | 0; r.go = m.go ? 1 : 0; saveRoom();
      H.sync(); if (H.roles) H.roles(); refreshOnline();
      break;
    }
    case 'full': if (m.to === myId && mySeat() < 0) { net.errorMsg = 'В комнате уже двое.'; refreshOnline(); } break;
  }
}
function onHello(m) {
  const r = net.room; if (!r) return;
  const id = String(m.from);
  let seat = r.seats.indexOf(id), changed = false;
  const host = amActingHost();
  if (seat < 0 && host) {
    let k = r.seats.indexOf(null);
    if (k < 0) k = r.seats.findIndex(s => s && s !== myId && s !== id && !net.online.has(s));
    if (k < 0) { send('full', { to: id }); return; }
    r.seats[k] = id; seat = k; changed = true;
    r.names[k] = m.name ? String(m.name).slice(0, 12) : (r.names[k] || null);
  } else if (seat >= 0 && host && m.name && r.names[seat] !== m.name) { r.names[seat] = String(m.name).slice(0, 12); changed = true; }
  if (changed) { saveRoom(); refreshOnline(); H.sync(); }
  if (host || (seat >= 0 && r.seats.includes(myId))) send('state', { room: r });
}
function adoptState(s0) {
  if (!s0 || s0.code !== net.code || !Array.isArray(s0.seats)) return;
  const s = sanitize(s0), r = net.room;
  if (!r) { net.room = s; saveRoom(); H.sync(true); refreshOnline(); return; }
  let ch = false;
  s.seats.forEach((x, i) => { if (x && !r.seats[i]) { r.seats[i] = x; ch = true; } });
  s.names.forEach((x, i) => { if (x && !r.names[i]) { r.names[i] = x; ch = true; } });
  if (cmpKey(rolesKey(s), rolesKey(r)) > 0) { r.thief = s.thief; r.rv = s.rv; r.go = s.go; ch = true; if (H.roles) setTimeout(H.roles); }
  const c = cmpKey([s.lvl, s.att, s.log.length], [r.lvl, r.att, r.log.length]);
  if (c > 0) {
    const sameAtt = s.lvl === r.lvl && s.att === r.att && r.log.every((x, i) => s.log[i] === x);
    r.lvl = s.lvl; r.att = s.att; r.log = s.log; r.t0 = s.t0 || (sameAtt ? r.t0 : 0); r.best = Math.max(r.best || 0, s.best || 0);
    saveRoom(); H.sync(!sameAtt);
    if (!sameAtt) H.hideOverlays(true);
  } else if (ch) { saveRoom(); H.sync(); }
  refreshOnline();
}
function onPresence() { recomputeOnline(); const r = net.room; if (!r || !r.seats.includes(myId)) hello(); refreshOnline(); }
export function refreshOnline() {
  if (!net.on) return;
  const r = net.room;
  if (net.errorMsg && net.status === 'ok' && r && mySeat() >= 0) net.errorMsg = '';
  const stt = started(r);
  if (stt && !net.wasStarted) {
    net.wasStarted = true;
    $('#menu').hidden = true;
    H.started(net.everOk);
  }
  if (!stt && $('#menu').hidden) showRoomPanel();
  renderRoomPanel(); H.ui();
}
export function showRoomPanel() {
  $('#vMain').hidden = true; $('#vCases').hidden = true; $('#vSettings').hidden = true; $('#vRoom').hidden = false; $('#menu').hidden = false;
  for (const b of document.querySelectorAll('#ftabs button')) b.setAttribute('aria-pressed', String(b.dataset.tab === 'play'));
  renderRoomPanel();
}
export const ROLE_IC = [
  '<svg class="rc-ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5c-8.5 0-13.5 6-13.5 14.5V27c0 9 6.2 16 13.5 16s13.5-7 13.5-16v-7.5C37.5 11 32.5 5 24 5z" fill="#111"/><rect x="12.5" y="18" width="23" height="7" rx="3.5" fill="#FFD23F"/><circle cx="19" cy="21.5" r="2" fill="#111"/><circle cx="29" cy="21.5" r="2" fill="#111"/><path d="M17 33h14" stroke="#333" stroke-width="2"/></svg>',
  '<svg class="rc-ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="22" r="11" fill="#c9a27e"/><path d="M9 26v-4a15 15 0 0 1 30 0v4" fill="none" stroke="#04213A" stroke-width="3.5"/><rect x="6" y="23" width="7" height="11" rx="3" fill="#04213A"/><rect x="35" y="23" width="7" height="11" rx="3" fill="#04213A"/><path d="M10 34c0 5 5 7 11 7" fill="none" stroke="#04213A" stroke-width="2.5"/><circle cx="22" cy="41" r="2.5" fill="#04213A"/><rect x="14" y="38" width="20" height="6" rx="1" fill="#7FD4FF" opacity=".0"/></svg>',
];
export function renderRoomPanel() {
  if (!net.on) return;
  const r = net.room;
  $('#roomCode').textContent = net.code || '····';
  $('#roomLink').textContent = inviteUrl();
  $('#btnShare').textContent = navigator.share ? 'Поделиться' : 'Копировать';
  // две карточки: вор и штурман, на каждой — кто на этой роли
  const th = thiefSeat(r);
  $('#seats').innerHTML = r ? [th, 1 - th].map((k, i) => {
    const id = r.seats[k];
    const nm = id ? (r.names[k] || (k ? 'Второй' : 'Первый')) : 'ждём…';
    const st = !id ? 'отправь ссылку' : id === myId ? 'это ты' : net.online.has(id) ? 'на связи' : 'не в сети';
    return `<button class="rolecard ${i ? 'nav' : 'thief'}${id === myId ? ' me' : ''}" data-seat="${k}" type="button">${ROLE_IC[i]}<span class="rc-t"><small>${i ? 'ШТУРМАН · в фургоне' : 'ВОР · в здании'}</small><b>${esc(nm)}</b><em class="${id && (id === myId || net.online.has(id)) ? 'on' : ''}">${st}</em></span></button>`;
  }).join('') : '';
  $('#btnGo').hidden = !(r && bothIn(r) && !r.go);
  const note = $('#netNote'); let txt, err = false;
  if (net.errorMsg) { txt = net.errorMsg; err = true; }
  else if (net.status === 'connecting') txt = 'Подключаюсь…';
  else if (net.status === 'lost') txt = 'Связь пропала, переподключаюсь…';
  else if (!r) txt = 'Ищу комнату…';
  else if (mySeat() < 0) txt = 'Жду, пока меня пустят…';
  else if (!bothIn(r)) txt = 'Отправь напарнику ссылку или код и созвонитесь. Кликни по карточке, чтобы поменяться ролями.';
  else if (!r.go) txt = 'Оба на месте. Решите, кто вор, и жмите «Начинаем».';
  else txt = 'Комната живёт, пока в ней кто-то есть.';
  // номер дела комнаты — всегда, ещё до «Начинаем»: и создателю, и тому, кто зашёл по ссылке
  if (r && !err) { const nm = H.caseName ? H.caseName(r.lvl + 1) : ''; txt = `Дело №${r.lvl + 1}${nm ? ' · ' + nm : ''}. ${txt}`; }
  note.textContent = txt; note.classList.toggle('err', err);
  $('#btnRoomClose').hidden = !(r && started(r));
  const n2 = $('#inName2'); if (document.activeElement !== n2) n2.value = myName();
}
export async function shareInvite() {
  const url = inviteUrl();
  if (navigator.share) { try { await navigator.share({ title: 'Ограбление', text: `Есть дело (3D). Комната ${net.code}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); }
  catch (e) { toast('Скопируй ссылку вручную'); }
}

/* ---------- menu ---------- */
